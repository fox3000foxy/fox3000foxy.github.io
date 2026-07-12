---
title: "Repo to VPS : transformar GitHub Actions em VPS gratuito com armazenamento persistente"
description: Como transformar um runner do GitHub Actions em um VPS permanente com git como armazenamento persistente -- tmate, inotify e commit --amend.
date: 2026-05-29
authors:
  - fox3000foxy
tags:
  - github
  - devops
  - automation
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "I9cbAY3HEolsfvq+z7ueR+KPnLVOJDHkYnFU5enldIiZDHcSb0YLpqbC4dShtyUGxAjikT4c7QcSVPs1Zyvd1w=="
---

## GitHub te dá um VPS grátis por 6h. Descobri como torná-lo permanente.

GitHub Actions te dá máquinas Linux gratuitas.

Tipo, servidores Ubuntu de verdade. 2 núcleos, 7 GB de RAM, 14 GB de disco. Grátis. Por 6h por execução.

O único "problema": no final da execução, tudo é apagado. A máquina é descartável. Você instala coisas, programa, configura... e puff, no final tudo desaparece. Como se não tivesse feito nada.

A menos que.

A menos que você use **git como disco rígido**.

E aí, de repente, você tem um VPS gratuito com um disco persistente que sobrevive às execuções. Você se reconecta, tudo ainda está lá. Você retoma de onde parou.

É completamente louco. Deixa eu te explicar xD

---

## O contexto: os runners do GitHub Actions

Quando você executa um workflow do GitHub Actions, o GitHub te dá uma VM.

É feito para buildar seu código, rodar seus testes, fazer deploy. O workflow roda, faz seu trabalho, e a máquina é destruída.

Mas nada te impede de fazer outras coisas com essa VM. Tipo, abrir um shell SSH nela e usar como servidor.

O negócio é que essas máquinas são **stateless** e **temporárias**:
- Temporária: 6h no máximo por execução (`timeout-minutes: 360`, o limite do GitHub)
- Stateless: tudo é apagado no final

Então para transformar isso num VPS utilizável, precisa resolver dois problemas:
1. **Como se conectar nela em tempo real?**
2. **Como manter o disco entre duas execuções?**

Aí vira um hack sujo.

---

## Problema 1: o SSH ao vivo com tmate

**tmate** é um fork do tmux que cria uma sessão SSH compartilhável.

Você executa ele numa máquina, ele gera dois links:
- uma URL SSH (`ssh xxx@nyc1.tmate.io`)
- uma URL web (terminal no navegador)

Você se conecta com um desses links, e boom, você está num shell na máquina. Em tempo real.

O workflow então inicia o tmate:

```bash
tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
tmate -S /tmp/tmate.sock set-option -g remain-on-exit on

# pega os links de conexão
tmate_ssh=$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')
tmate_web=$(tmate -S /tmp/tmate.sock display -p '#{tmate_web}')
```

E esses links são escritos direto no README do repo por um script Python. Você abre seu repo, vê o link de conexão, clica. Pronto, você está no seu VPS.

Primeiro problema resolvido. Mas é o segundo que é realmente louco.

---

## Problema 2: git como disco rígido

Aqui vai o bagulho doido.

A máquina é apagada a cada execução. Então armazenamos **o sistema de arquivos num branch git dedicado**, chamado `filesystem`.

Na inicialização, o script restaura o estado a partir desse branch:

```bash
filesystem_branch="filesystem"

# pega o branch filesystem do remote
git fetch origin "$filesystem_branch":refs/remotes/origin/$filesystem_branch

# restaura o workspace a partir desse branch
git checkout -B filesystem-workspace "refs/remotes/origin/$filesystem_branch"
git reset --hard "refs/remotes/origin/$filesystem_branch"
```

O branch `filesystem` É o seu disco rígido. Seus arquivos, suas instalações, suas configurações -- tudo está nele.

Saca só? A máquina é descartável, mas o disco vive no git. Você reinicia o workflow, o disco é restaurado, você retorna exatamente de onde parou.

É como um VPS que hiberna. Só que a hibernação é um repositório git xD

### Primeira execução: criar o disco vazio

Na primeira execução, o branch `filesystem` ainda não existe. Precisa criá-lo. E não é trivial:

```bash
ensure_filesystem_branch() {
  if ! git ls-remote --exit-code origin "refs/heads/$filesystem_branch" >/dev/null 2>&1; then
    git checkout --orphan filesystem-workspace
    git rm -rf --cached .
    git clean -fdx -e .git -e .github -e .github/scripts -e .github/workflows
    git commit --allow-empty -m "init filesystem (empty)"
    push_filesystem
  fi
}
```

O `git checkout --orphan` é a chave. Um branch órfão é um branch **sem nenhum histórico** -- como se você estivesse começando de um repositório vazio.

Por que órfão? Porque você NÃO quer que seu disco persistente carregue todo o histórico do seu código fonte. O disco é uma coisa separada, que tem vida própria. Ele começa virgem.

E o `git ls-remote --exit-code` no início é só uma verificação limpa: "o branch já existe no remote?". Se sim, não mexe em nada. Se não, cria. Idempotente, como a gente gosta.

### O git clean seletivo: proteger os caches

Essa linha merece uma pausa:

```bash
git clean -fdx -e .apt-cache -e .cache -e host.conf -e tmate.sock
```

`git clean -fdx` remove TUDO que não é trackeado pelo git. Normalmente é violento -- limpa o workspace por completo.

Mas os `-e` (exclude) protegem algumas coisas:
- `.apt-cache` → o cache dos pacotes APT (vamos voltar nisso, é esperto)
- `.cache` → cache genérico
- `host.conf` → o endereço SSH da sessão
- `tmate.sock` → o socket da sessão tmate atual

Se você limpasse esses arquivos, quebraria a sessão ativa ou perderia seu cache. Então eles são poupados durante o reset.

Um detalhe besta à primeira vista, mas sem isso tudo quebra.

---

## O autosave: inotify vigiando tudo

Beleza, mas como os arquivos vão parar no branch `filesystem`?

Resposta: um watcher que monitora TODAS as alterações de arquivos e faz commit/push automaticamente.

A ferramenta mágica é **inotifywait** (do pacote `inotify-tools`). Ele monitora o filesystem a nível de kernel e dispara assim que um arquivo muda.

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock|\.gitignore|\.txt\.swp)(/|$)' .; do
    echo "[autosave] change detected"
    commit_and_push
    sleep 1   # debounce se muitos cambios de uma vez
  done
}

autosave &
```

Vamos destrinchar os flags do inotify, porque cada um importa:
- `-r` → recursivo, monitora todas as subpastas
- `-e modify,create,delete,move` → reage a esses 4 tipos de eventos
- `--exclude '...'` → uma regex para ignorar certos arquivos

O `--exclude` é crucial. Olha o que ele ignora:
- `.git` → obviamente, senão cada commit dispararia um autosave que dispararia um commit... loop infinito. Catástrofe.
- `.apt-cache` e `.cache` → os caches, que mudam o tempo todo e não queremos spammar no git
- `host.conf` e `tmate.sock` → os arquivos de sessão, que mudam sem parar
- `.gitignore`, `.txt.swp` → arquivos temporários (os `.swp` são arquivos de edição do vim)

Sem esse exclude, você teria um autosave que se dispara em loop nas próprias alterações. O `.git` na lista é A linha que te impede de dar um tiro no pé.

Você modifica um arquivo? inotify detecta instantaneamente, commita, pusheia. Em menos de um segundo, sua alteração está no branch `filesystem`.

Você instala algo, escreve código, mexe numa configuração -- tudo é salvo em tempo real, automaticamente, sem você fazer nada.

Você tem literalmente um sistema de backup automático do disco inteiro. Louco.

### O debounce: não spammar o git

O `sleep 1` após cada save é um **debounce**.

Quando você salva um arquivo num editor, geralmente gera vários eventos de filesystem em rajada (criação de um arquivo temporário, rename, remoção do antigo...). Sem debounce, você dispararia 3-4 commits para um único save.

O `sleep 1` diz: "espera um segundo depois de um save, o tempo da rajada se acalmar, antes de escutar de novo". Isso agrupa mudanças próximas num único commit. Esperto.

### E um save periódico extra

Caso o inotify perca algo, também tem um save a cada 5 segundos:

```bash
periodic_save() {
  while true; do
    sync_from_remote   # pega possíveis mudanças remotas
    sleep 5
    commit_and_push
  done
}

periodic_save &
```

Cinto E suspensórios. Não queremos perder o estado do disco.

---

## O detalhe esperto: um único commit

Se você commitar a cada mudança de arquivo, vai acumular milhares de commits. Em uma hora de sessão, seu histórico git explode. O repositório fica enorme. É nojento.

A solução é elegante: **fazemos amend do commit existente** em vez de criar um novo.

```bash
commit_and_push() {
  (
    flock -n 200 || return   # lock para dois saves não rodarem ao mesmo tempo

    git add -A
    git reset -- .github/workflows/ .github/scripts/   # não mexe nos scripts

    if ! git diff --cached --quiet; then
      if git rev-parse --verify HEAD >/dev/null 2>&1; then
        git commit --amend --no-edit    # AMEND: sobrescreve o commit anterior
      else
        git commit -m "autosave $(date -u +%Y%m%dT%H%M%SZ)"
      fi
      git push --force origin "filesystem-workspace:filesystem"
    fi
  ) 200>/tmp/tmate_autosave.lock
}
```

`git commit --amend` significa: "substitua o último commit por este".

Assim o branch `filesystem` tem SEMPRE um único commit. Não importa quantas vezes você salve. É apenas um snapshot do estado atual, force-pushado repetidamente.

O `flock` é um lock: como tem dois loops de save (inotify + periódico), precisamos evitar que eles executem git ao mesmo tempo e atrapalhem um ao outro. Apenas um processo git por vez.

Limpo.

---

## O sync_from_remote: gerenciar várias sessões

Sabe, uma coisa que você não pensa no início: e se você executar DOIS runs ao mesmo tempo? Ou se uma sessão modificar o branch `filesystem` enquanto outra está rodando?

O script lida com isso usando `sync_from_remote` antes de cada commit:

```bash
sync_from_remote() {
  git fetch origin "filesystem":refs/remotes/origin/filesystem
  git merge --ff-only "refs/remotes/origin/filesystem"
}
```

O `--ff-only` (fast-forward only) é importante: significa "merge SOMENTE se puder avançar limpo, sem criar commit de merge".

Se os dois branches divergiram (tipo, duas sessões modificaram coisas diferentes), o fast-forward falha silenciosamente (`2>/dev/null || true`) e mantemos o estado local. Não é um sistema de merge perfeito, mas evita corrupções no caso simples de apenas uma sessão rodando.

Sinceramente, não é para rodar 3 sessões em paralelo no mesmo repositório. Mas o código tenta não explodir se isso acontecer. É defesa.

---

## O cache APT: instalar rápido

Tem um detalhe no workflow que parece inocente mas é bem pensado:

```yaml
- name: Cache & install APT packages (tmate + watcher)
  uses: awalsh128/cache-apt-pkgs-action@v1.6.0
  with:
    packages: tmate inotify-tools
```

tmate e inotify-tools são instalados através de uma ação que **faz cache dos pacotes APT**.

Na primeira execução, baixa e instala. Nas execuções seguintes, é restaurado do cache do GitHub Actions -- mais rápido, sem precisar baixar de novo.

E lembra do `git clean -fdx -e .apt-cache` de antes? Está relacionado. A pasta `.apt-cache` é protegida da limpeza justamente para que os pacotes que você instala durante a sessão possam persistir minimamente.

Tudo se conecta. Pensei no ciclo de vida completo.

---

## Os scripts escondidos em /tmp

Mais um detalhe sacana mas esperto. Bem no início do script:

```bash
RUNNER_SCRIPTS_DIR="/tmp/runner-scripts"
rm -rf "$RUNNER_SCRIPTS_DIR"
mkdir -p "$RUNNER_SCRIPTS_DIR"
cp -r .github/scripts "$RUNNER_SCRIPTS_DIR/"
```

Os scripts (`update_readme.py`, etc.) são copiados para `/tmp` ANTES de mexer no branch `filesystem`.

Por quê? Porque quando você faz `git reset --hard` para o branch `filesystem` (que está vazio no início, ou contém seu disco), os arquivos `.github/scripts` do repositório fonte desaparecem do workspace.

Mas o script ainda precisa deles durante a sessão (para atualizar o README a cada reinício do tmate). Então ele os esconde em `/tmp`, fora do alcance do git:

```bash
python3 "$RUNNER_SCRIPTS_DIR/scripts/update_readme.py" --ssh "$tmate_ssh" ...
```

Se você não pensa nisso, passa 30 minutos tentando entender por que seu script sumiu. Eu pensei.

---

## O shell personalizado

Pequeno conforto: a sessão te dá um shell configurado, não um bash pelado.

O `prestart.sh` copia um `.bashrc` customizado:

```bash
if ! grep -q "Custom prompt and aliases for remote sessions" "$HOME/.bashrc"; then
  cp .github/scripts/remote_bashrc "$HOME/.bashrc"
fi
sudo cp "$HOME/.bashrc" /root/.bashrc
```

E esse `.bashrc` contém um prompt colorido, aliases (`ll`, `lla`, `rm -i`), e principalmente um override do `exit`:

```bash
exit() {
    killall -9 -u "$(whoami)" tmate 2>/dev/null || true
    builtin exit "$@"
}

# Ctrl+D faz o mesmo que exit
bind -x '"\C-d": "exit"'
```

Quando você digita `exit` (ou Ctrl+D), mata limpo os processos tmate antes de fechar. Isso evita deixar sessões tmate zumbis.

Também tem uma função `tmate-detach` se você quiser desconectar SEM matar a sessão (para reconectar depois). Detalhe de conforto, mas mostra o nível de cuidado.

---

## O tmate que reinicia sozinho

Pequeno conforto: se você digitar `exit` no shell, normalmente a sessão tmate morre e você é desconectado para sempre.

Só que aqui, o tmate está num loop `while true`:

```bash
while true; do
  tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
  while tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' >/dev/null 2>&1; do
    sleep 2
  done
  echo "tmate session ended; restarting..."
done
```

Você `exit`? A sessão reinicia sozinha. Você se reconecta com o mesmo link.

É bobo, mas torna a coisa utilizável.

---

## A reconexão em um comando

Como você se reconecta depois de uma desconexão, sem ter que fuçar nos logs do run toda vez?

O endereço SSH do tmate é escrito num arquivo `host.conf`, commitado no branch `filesystem`:

```bash
printf '%s' "${tmate_ssh#ssh }" > host.conf
```

E como esse arquivo está no git, você pode recuperá-lo pela API do GitHub com um único comando:

```bash
ssh "$(gh api -H 'Accept: application/vnd.github.v3.raw' \
  "/repos/USER/REPO/contents/host.conf?ref=filesystem" | tr -d '\r\n')"
```

Você executa isso, ele busca o endereço SSH atual no repositório e conecta. Mesmo que o endereço tenha mudado entre sessões.

---

## O fluxo completo

Recapitulando:

1. Você dispara o workflow (push ou botão manual)
2. GitHub te dá uma VM Ubuntu
3. O script restaura o disco a partir do branch "filesystem"
4. inotify começa a monitorar todas as mudanças
5. periodic_save commita a cada 5s como backup
6. tmate inicia → gera os links SSH/web
7. Os links são escritos no README + host.conf
8. Você conecta com ssh ou o terminal web
9. Você faz o que quiser -- cada mudança de arquivo = autosave
10. 6h depois, GitHub mata a VM
11. Seu disco está intacto no branch "filesystem"
12. Você reinicia o workflow → volta ao passo 3, tudo ainda está lá

Um VPS gratuito com disco persistente. Só com git e GitHub Actions.

---

## Beleza, preciso ser honesto: os limites

É um hack, não um VPS de verdade. Então:

- **6h no máximo por execução.** Precisa reiniciar o workflow regularmente. Sem uptime infinito.
- **Não é para produção.** Você não vai hospedar seu site nisso. É para explorar, dev, debug, testar algo num Linux descartável mas recuperável.
- **GitHub vê tudo.** São máquinas deles. Não coloque nada sensível.
- **Mantenha o repositório privado.** Você está expondo um shell SSH. Um repositório público = qualquer um pode potencialmente se conectar. Má ideia.
- **Está no limite dos termos de uso.** GitHub Actions é feito para CI/CD, não para VPS gratuito. Então use com moderação, para coisas legítimas, sem abusar.

### O verdadeiro calcanhar de Aquiles: git odeia arquivos grandes

Git é feito para texto, não para um filesystem.

O disco persistente vive num branch git. Então tudo que você salva passa pelo git. E git:
- lida mal com arquivos binários grandes (uma imagem Docker de 2 GB no git? esquece)
- tem um limite de 100 MB por arquivo no GitHub (hard limit, não passa disso)
- recomenda ficar abaixo de ~5 GB por repositório

Então se você `npm install` um projeto com 500 MB de `node_modules`, ou se builda algo que gera binários pesados, o push para `filesystem` vai ou arrastar demais, ou simplesmente falhar.

O `git commit --amend` ajuda (um único commit, sem histórico que incha), mas não muda o fato de que um arquivo de 200 MB nunca vai passar.

Resumindo: **funciona super bem para código, configurações, arquivos pequenos. Não funciona para armazenar dados grandes ou artefatos binários.** Precisa ter isso em mente sobre o que você faz na sua sessão.

### Não é um snapshot completo do sistema

Outra nuance importante: o branch `filesystem` salva o **workspace** (a pasta do repositório), não o sistema inteiro.

Se você fizer `apt install htop`, o binário vai para `/usr/bin/htop`, que está FORA do workspace. Então NÃO será salvo. Na próxima execução, precisa reinstalar.

É por isso que temos o cache APT e o `prestart.sh`: para re-preparar o ambiente do sistema a cada inicialização, já que só o workspace persiste.

Se você quer que suas instalações sobrevivam, precisa colocá-las no workspace (tipo, instalar numa pasta local em vez de no sistema). É uma ginástica para se acostumar.

---

## VPS gratuito vs VPS de verdade: o duelo

| | repo-to-vps | VPS de verdade (5€/mês) |
|---|---|---|
| **Preço** | 0€ | ~5-10€/mês |
| **Uptime** | 6h, precisa reiniciar | 24/7 |
| **Disco** | branch git, arquivos pequenos | SSD de verdade, vários GB |
| **RAM** | ~7 GB (generoso!) | 1-2 GB geralmente |
| **CPU** | 2-4 núcleos decentes | 1-2 vCPU |
| **Setup** | clonar um template | configuração manual |
| **Persistência** | só o workspace | sistema completo |
| **Legitimidade** | limite dos ToS | 100% limpo |

O engraçado é que em especificações brutas (RAM, CPU), o runner do GitHub é geralmente MELHOR que um VPS de 5€. Mas o uptime de 6h e a persistência limitada ao workspace é o que faz dele um brinquedo de hacker, não um servidor de verdade.

Para aprender, testar, debugar algo Linux rapidamente num ambiente recuperável? Perfeito. Para hospedar qualquer coisa séria? Pega um VPS de verdade.

Mas para um ambiente Linux temporário que você pode restaurar à vontade? É simplesmente genial.

---

## O padrão por trás de tudo isso

Se você olhar de longe, repo-to-vps e o bot de email (meu outro artigo) se baseiam na mesma ideia:

> **Git não é só um gerenciador de versões. É um sistema de armazenamento persistente, gratuito, versionado, acessível via API.**

Assim que você tem um sistema stateless (GitHub Actions, um Worker, uma função serverless) e quer manter estado entre duas execuções, git pode servir como "disco".

- O bot de email armazena um `lastId` numa tag git.
- repo-to-vps armazena um filesystem inteiro num branch git.

Mesmo padrão, duas escalas. Um valor de um lado, um disco do outro.

E o `git commit --amend` + force-push é a técnica comum: **você mantém um único commit que representa o estado atual, sobrescrito a cada atualização.**

Não foi feito para isso. Mas funciona. E é gratuito.

---

**As 3 coisas para guardar:**

1. **Um branch git = um disco rígido persistente** -- Armazene seu filesystem num branch dedicado, restaure na inicialização, e você tem um estado que sobrevive a máquinas descartáveis.

2. **inotify + git = autosave em tempo real** -- `inotifywait` monitora as mudanças a nível de kernel e push para git instantaneamente. Com `git commit --amend` para manter um único commit limpo.

3. **tmate transforma um runner em VPS** -- SSH ao vivo numa máquina do GitHub Actions, com reinício automático e reconexão em um comando via API do GitHub.

Git como disco rígido, segundo episódio. Acho que vou acabar armazenando tudo em branches git xD
