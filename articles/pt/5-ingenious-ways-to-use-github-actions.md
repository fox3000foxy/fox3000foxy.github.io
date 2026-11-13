---
title: "5 jeitos criativos de usar GitHub Actions (e o que isso ensina sobre secrets)"
description: "Um runner de CI transformado em VPS gratuita, um bot que abre seus próprios pull requests, um publish no npm sem nenhum secret. Tour pelos meus repos para listar os padrões de GitHub Actions que saem do simples \"lint + test + deploy\"."
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "pCI4RDAB6bIA55q9W7ffoY26CUIfFxxgLSEAEmEjqh5jQ+zSpYznuOP9U3nHGRTljPBVnEa8d3GD71tncr25Vw=="
---

# 5 jeitos criativos de usar GitHub Actions

GitHub Actions, no papel, é feito para CI/CD clássico : você dá push, ele faz lint, testa, implanta. Já escrevi sobre um caso específico (usar tags git como banco de dados para um bot de email, ver o artigo dedicado). Mas fuçando nos meus próprios repos, há padrões diferentes o bastante para valer um artigo à parte, menos centrado em um único projeto, mais catálogo de técnicas.

Cinco usos, do mais clássico ao mais estranho.

## 1. Uma tag git como estado persistente entre dois runs

Lembrete rápido, o detalhe completo está no artigo sobre `email-autoreply`. GitHub Actions é stateless por design : cada run parte de uma máquina limpa. A solução alternativa : guardar um valor (um ID, um timestamp, qualquer pequeno estado) em uma tag git dedicada, nunca em um branch.

```bash
# ler o estado
git show refs/tags/lastid:data/lastId > data/lastId

# escrever o estado (branch órfão, um único commit, force-push da tag)
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```

O ponto principal : um branch órfão para nunca acumular histórico, e uma tag forçada em vez de um branch para não poluir a lista de branches do repo.

## 2. Uma tag git como cache de build pré-compilado

Mesma família de ideia, outro uso : em vez de guardar um estado de aplicativo, guardamos um **artefato de build**. O job `build` compila o código uma vez (em push para `master`), e depois envia `dist/` + `node_modules/` para uma tag `runtime`. O job `cron`, por sua vez, faz checkout direto dessa tag em vez de rodar `bun install && bun run build` a cada execução :

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# sem install, sem build -- o código já está pronto
- run: node dist/index.js --action
```

Isso muda o run de ~20s para ~10s. Em um cron que roda sempre, isso conta. O `actions/cache` faz um trabalho parecido (guardar dependências em cache), mas uma tag git é mais direta quando você quer mesmo congelar um artefato versionado e apontar explicitamente para ele, em vez de só acelerar um `npm install`.

## 3. Um único check obrigatório que agrega vários jobs

Padrão pequeno que parece nada mas muda a vida na configuração de branch protegido. No `konosuba-rpg`, a CI tem três jobs independentes (`typecheck`, `lint`, `tests`) que rodam em paralelo, e um quarto job, `test-battery`, que não faz nada além de depender dos três primeiros :

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

Sem esse job de fachada, configurar um branch protegido exigiria marcar três checks obrigatórios separados, e atualizar essa lista cada vez que um job é adicionado ou renomeado. Com `test-battery`, um só nome para marcar nas configurações do repo, que continua estável mesmo que o detalhe interno mude.

## 4. Transformar um runner gratuito em VPS temporária

Esse é o mais estranho de todos, e claramente meu favorito : o `repo-to-vps` desvia completamente o uso previsto de um runner GitHub Actions para fazer dele uma máquina Linux acessível via SSH, gratuita, por até 6 horas (o limite máximo de um job).

O princípio : um job que quase não faz nada além de lançar o [tmate](https://tmate.io/) (um fork do tmux que expõe uma sessão de terminal compartilhável via SSH ou navegador) :

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

O verdadeiro quebra-cabeça é que o filesystem de um runner GitHub Actions é **descartável** : assim que o job termina, tudo some. Uma sessão SSH de horas não serve para nada se tudo que você faz nela evapora no próximo run. A solução : um branch git que serve de snapshot ao vivo do filesystem, sincronizado continuamente.

O script `start-tmate.sh` faz, em ordem :

1. **Restaura** o filesystem a partir de um branch dedicado `filesystem` no início do job (`git reset --hard` nele).
2. **Observa** as mudanças de arquivos com `inotifywait` continuamente, e faz **commit + push na hora** assim que um arquivo muda :

```bash
# Observa mudanças e salva na hora (com debounce de 1s)
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1   # debounce
  done
}
```

3. Cada salvamento **altera** o commit anterior em vez de criar um novo (`git commit --amend --no-edit`), então o branch `filesystem` fica sempre com um único commit, o que evita acumular milhares de snapshots.
4. Um loop `while true` relança o `tmate` automaticamente se a sessão morrer, com `remain-on-exit on` para o terminal continuar acessível mesmo após um `exit`.
5. A URL SSH gerada pelo tmate é escrita em um arquivo `host.conf`, commitado no branch `filesystem`, então recuperável via API do GitHub (`gh api .../contents/host.conf`) sem nunca ter tido acesso aos logs do job ao vivo.
6. Uma rotina `periodic_save` roda a cada 5 segundos em segundo plano, caso o `inotifywait` perca algum evento.

Resultado : um shell Linux completo, acessível de qualquer lugar, com um filesystem que persiste entre sessões, enquanto a infraestrutura por baixo (um runner GitHub Actions) não foi absolutamente feita para isso. O único limite real é o timeout de 6h por job : depois disso é preciso relançar o workflow.

## 5. Um bot que abre seus próprios pull requests

No `konosuba-rpg`, um push no branch `dev` dispara um job que verifica se já existe um pull request aberto para `main`, e cria um automaticamente senão, via `actions/github-script` e a API REST do GitHub :

```js
// Compara dev com main, verifica PR aberta, cria uma se preciso
const { data: comparison } = await github.rest.repos.compareCommits({
  owner, repo, base: 'main', head: 'dev',
});
if (comparison.ahead_by === 0) return; // nada a propor

const { data: existing } = await github.rest.pulls.list({
  owner, repo, state: 'open', head: `${owner}:dev`, base: 'main',
});
if (existing.length > 0) return; // já há PR aberta

await github.rest.pulls.create({
  owner, repo, head: 'dev', base: 'main',
  title: 'chore: auto PR from dev to main',
});
```

O detalhe que conta aqui é o token usado. Esse workflow **não** usa o `GITHUB_TOKEN` automático : exige um secret `AUTO_PR_TOKEN` separado, e se recusa a continuar se ele estiver ausente :

```yaml
# Valida que o token dedicado de PR existe antes de continuar
- name: Validate pull request token
  env:
    AUTO_PR_TOKEN: ${{ secrets.AUTO_PR_TOKEN }}
  run: |
    if [ -z "$AUTO_PR_TOKEN" ]; then
      echo "AUTO_PR_TOKEN is required... Use a PAT or GitHub App token with contents:write and pull-requests:write."
      exit 1
    fi
```

## 6. Publicar no npm sem nenhum secret

O mais discreto dos cinco, mas provavelmente o mais importante para o futuro : o workflow `publish.yml` do `typescript-virtual-container` não contém **nenhum secret npm**. Nenhum `NPM_TOKEN`, nenhum `NODE_AUTH_TOKEN`. Só isso :

```yaml
# Publicação confiável via OIDC : sem token npm, identidade provada ao registro
permissions:
  id-token: write  # Required for OIDC
  contents: read
jobs:
  publish:
    steps:
      - uses: actions/setup-node@v6
        with:
          registry-url: 'https://registry.npmjs.org'
      - run: npm publish
```

`npm publish` funciona mesmo assim, porque o registro npm agora suporta **trusted publishing** via OIDC : o workflow prova sua identidade diretamente ao registro (repo + workflow exatos, configurados no lado npmjs.org), sem nenhum token estático transitar nem ser guardado em lugar algum. Zero secret para vazar, zero token para girar a cada seis meses.

---

## Os secrets do GitHub, a fundo

Esses cinco padrões tocam todos, de um jeito ou de outro, na questão dos secrets. Alguns princípios que voltam em todos os meus workflows :

**Um secret não é necessariamente uma string simples.** No `email-autoreply`, `ACCOUNTS_JSON` contém o JSON minificado inteiro da config multicontas : uma estrutura de dados completa em vez de uma simples chave de API, injetada como está em um arquivo no runtime :

```yaml
# Injeta a config multicontas inteira a partir de um único secret
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

Isso evita ter que commitar um arquivo de config, mesmo criptografado, e se atualiza em um clique nas settings do repo sem tocar no código.

**`GITHUB_TOKEN` tem limites precisos, e é de propósito.** O token automático que o GitHub injeta a cada run é poderoso, mas selado em certos pontos : por padrão, ele não pode disparar outro workflow, e conforme a configuração do repo pode ser bloqueado por regras de proteção de branch. É exatamente por isso que `create-pull-request.yml` exige um PAT (`AUTO_PR_TOKEN`) separado : um token que vem de uma conta de verdade (ou de uma GitHub App), com direitos explícitos `contents:write` + `pull-requests:write`, distinto do token efêmero do job.

**As permissões têm escopo job por job, não global.** Cada workflow que listei aqui declara um bloco `permissions:` mínimo e comentado :

```yaml
# Escopo mínimo : só permite escrever checks, resto só leitura
permissions:
  contents: read
  actions: read
  checks: write
  # Only allow writing checks, everything else is read-only
```

O `GITHUB_TOKEN` padrão historicamente tem direitos bem amplos em um repo público ; restringi-lo explicitamente ao que o job realmente precisa limita os danos se uma action de terceiros na cadeia (`uses: alguem/action@version`) se revelar comprometida.

**O melhor secret é o que não existe.** O padrão OIDC do `typescript-virtual-container` é a versão mais acabada dessa ideia : em vez de gerenciar rotação, expiração e risco de vazamento de um `NPM_TOKEN`, o workflow prova criptograficamente sua identidade (este repo exato, este workflow exato) diretamente ao serviço terceiro. Mesma lógica disponível para AWS, Docker Hub, PyPI : cada vez mais registros e clouds suportam OIDC a partir de GitHub Actions.

---

**3 pontos principais**

1. Uma tag git (órfã, com force-push) pode servir de banco de dados minimalista ou de cache de build pré-compilado : dois usos distintos do mesmo mecanismo.
2. Um runner gratuito de GitHub Actions pode virar um shell SSH persistente se aceitarmos sincronizar seu filesystem continuamente para um branch git, com autosave por `inotifywait` e um único commit alterado.
3. O `GITHUB_TOKEN` padrão é propositalmente limitado : criar PRs entre branches ou publicar sem secret exige um PAT dedicado ou a passagem para OIDC trusted publishing.
