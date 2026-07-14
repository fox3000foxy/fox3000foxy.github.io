---
title: "5 formas engenhosas de usar o GitHub Actions (e o que ensinam sobre secrets)"
description: "Um runner CI transformado em VPS gratuito, um bot que abre as suas próprias pull requests, um publish npm sem secret nenhum. Um passeio pelos meus repos para catalogar padrões de GitHub Actions que vão além do \"lint + test + deploy\"."
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
---

# 5 formas engenhosas de usar o GitHub Actions

No papel, o GitHub Actions serve para CI/CD clássico: fazes push, ele faz lint, testa, faz deploy. Já escrevi sobre um caso especial -- usar git tags como base de dados para um bot de email (ver o artigo dedicado). Mas a vasculhar os meus próprios repos, há padrões diferentes que cheguem para merecer um artigo à parte, menos focado num só projeto, mais catálogo de técnicas.

Cinco coisas, da mais clássica à mais retorcida.

## 1. Uma git tag como estado persistente entre execuções

Recapitulação rápida, os detalhes completos estão no artigo sobre `email-autoreply`. O GitHub Actions é stateless por design -- cada execução parte de uma máquina limpa. A solução: guardar um valor (um ID, um timestamp, qualquer estado pequeno) numa git tag dedicada, nunca num branch.

```bash
# ler estado
git show refs/tags/lastid:data/lastId > data/lastId

# escrever estado (branch órfão, um só commit, force-push da tag)
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```

O ponto-chave: um branch órfão para nunca acumular histórico, e uma tag forçada em vez de um branch para não poluir a lista de branches do repo.

## 2. Uma git tag como cache de build pré-compilado

Mesma família de ideias, uso diferente: em vez de guardar estado de aplicação, guarda-se um **artefacto de build**. O job `build` compila o código uma vez (no push para `master`) e depois faz push de `dist/` + `node_modules/` para uma tag `runtime`. O job `cron` faz checkout dessa tag diretamente em vez de correr `bun install && bun run build` a cada execução:

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# sem install, sem build -- o código já está pronto
- run: node dist/index.js --action
```

Isto muda a execução de ~20s para ~10s. Num cron que corre frequentemente, faz diferença. O `actions/cache` faz um trabalho semelhante (cache de dependências), mas uma git tag é mais direta quando queres congelar completamente um artefacto versionado e apontá-lo explicitamente -- não só acelerar um `npm install`.

## 3. Um único check obrigatório que agrega vários jobs

Um pequeno padrão que não parece nada de especial mas que muda a vida na configuração de branches protegidos. No `konosuba-rpg`, a CI tem três jobs independentes (`typecheck`, `lint`, `tests`) a correr em paralelo -- e um quarto job, `test-battery`, que não faz nada além de depender dos três primeiros:

```yaml
test-battery:
  needs:
    - typecheck
    - lint
    - tests
  runs-on: ubuntu-latest
  steps:
    - run: echo "Typecheck, lint and tests succeeded."
```

Sem este job fachada, configurar um branch protegido exigiria marcar três checks obrigatórios separados -- e atualizar essa lista cada vez que um job é adicionado ou renomeado. Com o `test-battery`, um único nome para marcar nas definições do repo, que permanece estável mesmo que os detalhes internos mudem.

## 4. Transformar um runner gratuito num VPS temporário

Este é o mais retorcido de todos, e claramente o meu favorito: o `repo-to-vps` desvia completamente o uso previsto de um runner do GitHub Actions para o transformar numa máquina Linux acessível por SSH, gratuita, até 6 horas (a duração máxima de um job).

O princípio: um job que não faz quase nada além de lançar o tmate:

```yaml
name: debug-runner
on:
  push:
    branches: [main, master]
  workflow_dispatch:
permissions:
  contents: write
  actions: write
jobs:
  debug:
    runs-on: ubuntu-latest
    timeout-minutes: 360
    steps:
      - uses: actions/checkout@v4
      - uses: awalsh128/cache-apt-pkgs-action@v1.6.0
        with:
          packages: tmate inotify-tools
      - run: bash .github/scripts/start-tmate.sh
```

O verdadeiro problema é que o sistema de ficheiros de um runner do GitHub Actions é **descartável** -- assim que o job termina, tudo desaparece. Uma sessão SSH que dura horas não serve de nada se tudo o que fazes se evapora na execução seguinte. A solução: um branch git que serve de snapshot ao vivo do sistema de ficheiros, sincronizado continuamente.

O script `start-tmate.sh` faz, por ordem:

1. **Restaura** o sistema de ficheiros a partir de um branch dedicado `filesystem` no arranque do job (`git reset --hard` sobre ele).
2. **Vigia** as alterações de ficheiros continuamente com `inotifywait`, e faz **commit + push imediatamente** assim que um ficheiro se mexe:

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1
  done
}
```

3. Cada gravação **emenda** o commit anterior em vez de criar um novo (`git commit --amend --no-edit`), por isso o branch `filesystem` fica sempre num único commit -- sem acumulação de milhares de snapshots.
4. Um ciclo `while true` relança o tmate automaticamente se a sessão morrer, com `remain-on-exit on` para que o terminal continue acessível mesmo depois de um `exit`.
5. O URL SSH gerado pelo tmate é escrito num ficheiro `host.conf`, commitado no branch `filesystem` -- recuperável via a API do GitHub (`gh api .../contents/host.conf`) sem nunca ter tido acesso em direto aos logs do job.
6. Uma rotina `periodic_save` corre a cada 5 segundos em segundo plano, caso o `inotifywait` perca algum evento.

Resultado: uma shell Linux completa, acessível de qualquer lado, com um sistema de ficheiros que persiste entre sessões -- apesar de a infraestrutura subjacente (um runner do GitHub Actions) não ter sido absolutamente nada concebida para isto. O único limite real é o timeout de 6 horas por job -- depois disso é preciso relançar o workflow.

## 5. Um bot que abre as suas próprias pull requests

No `konosuba-rpg`, um push para o branch `dev` dispara um job que verifica se já existe uma pull request aberta para `main` -- e cria uma automaticamente se não existir, via `actions/github-script` e a API REST do GitHub:

```js
const { data: comparison } = await github.rest.repos.compareCommits({
  owner, repo, base: 'main', head: 'dev',
});
if (comparison.ahead_by === 0) return;

const { data: existing } = await github.rest.pulls.list({
  owner, repo, state: 'open', head: `${owner}:dev`, base: 'main',
});
if (existing.length > 0) return;

await github.rest.pulls.create({
  owner, repo, head: 'dev', base: 'main',
  title: 'chore: auto PR from dev to main',
});
```

O detalhe que importa aqui é o token usado. Este workflow **não** usa o `GITHUB_TOKEN` automático -- exige um secret `AUTO_PR_TOKEN` separado e recusa-se a continuar se este faltar:

```yaml
- name: Validate pull request token
  env:
    AUTO_PR_TOKEN: ${{ secrets.AUTO_PR_TOKEN }}
  run: |
    if [ -z "$AUTO_PR_TOKEN" ]; then
      echo "AUTO_PR_TOKEN is required... Use a PAT or GitHub App token with contents:write and pull-requests:write."
      exit 1
    fi
```

## 6. Publicar no npm sem secret nenhum

O mais discreto dos cinco, mas provavelmente o mais importante para o futuro: o workflow `publish.yml` do `typescript-virtual-container` não contém **nenhum secret npm**. Sem `NPM_TOKEN`, sem `NODE_AUTH_TOKEN`. Apenas isto:

```yaml
permissions:
  id-token: write
  contents: read
jobs:
  publish:
    steps:
      - uses: actions/setup-node@v6
        with:
          registry-url: 'https://registry.npmjs.org'
      - run: npm publish
```

O `npm publish` funciona na mesma, porque o registry do npm agora suporta **trusted publishing** via OIDC: o workflow prova a sua identidade diretamente ao registry (repo exato + workflow exato, configurados do lado do npmjs.org), sem que nenhum token estático transite ou seja armazenado em lado nenhum. Zero secrets para escapar, zero tokens para rodar de seis em seis meses.

---

## Os secrets do GitHub, em profundidade

Estes cinco padrões tocam todos, de uma forma ou de outra, na questão dos secrets. Alguns princípios que se repetem em todos os meus workflows:

**Um secret não é necessariamente uma string simples.** No `email-autoreply`, o `ACCOUNTS_JSON` contém o JSON minificado inteiro da configuração multi-conta -- não apenas uma chave API, uma estrutura de dados completa, injetada tal e qual num ficheiro em runtime:

```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

Isto evita ter de fazer commit de um ficheiro de configuração, mesmo encriptado, e atualiza-se com um clique nas definições do repo sem tocar no código.

**O `GITHUB_TOKEN` tem limites precisos, e é de propósito.** O token automático que o GitHub injeta em cada execução é poderoso, mas selado em certos pontos: por padrão, não pode disparar outro workflow, e dependendo da configuração do repo pode ser bloqueado por regras de proteção de branch. É exatamente por isso que o `create-pull-request.yml` exige um PAT separado (`AUTO_PR_TOKEN`) -- um token de uma conta real (ou de uma GitHub App), com direitos explícitos `contents:write` + `pull-requests:write`, distinto do token efémero do job.

**As permissões são scopeadas job a job, não globalmente.** Cada workflow que listei aqui declara um bloco `permissions:` mínimo e comentado:

```yaml
permissions:
  contents: read
  actions: read
  checks: write
```

O `GITHUB_TOKEN` padrão tem historicamente direitos bastante amplos sobre um repo público; restringi-lo explicitamente ao que o job realmente precisa limita os danos se uma action de terceiros na cadeia se revelar comprometida.

**O melhor secret é aquele que não existe.** O padrão OIDC do `typescript-virtual-container` é a versão mais conseguida desta ideia: em vez de gerir a rotação, expiração e risco de fuga de um `NPM_TOKEN`, o workflow prova criptograficamente a sua identidade (este repo exato, este workflow exato) diretamente ao serviço terceiro. Mesma lógica disponível para AWS, Docker Hub, PyPI -- cada vez mais registries e clouds suportam OIDC a partir do GitHub Actions.

---

**3 pontos-chave**

1. Uma git tag (órfã, force-pushada) pode servir como base de dados minimalista ou cache de build pré-compilado -- dois usos distintos do mesmo mecanismo.
2. Um runner gratuito do GitHub Actions pode tornar-se uma shell SSH persistente se aceitares sincronizar continuamente o seu sistema de ficheiros para um branch git, com auto-save via `inotifywait` e um único commit emendado.
3. O `GITHUB_TOKEN` padrão é limitado de propósito -- criar PRs entre branches ou publicar sem secrets requer ou um PAT dedicado, ou a mudança para OIDC trusted publishing.
