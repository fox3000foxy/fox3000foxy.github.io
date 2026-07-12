---
title: Script de assinatura SSH explicado
description: Detalhamento do helper de assinatura de commits SSH e por que eu
  queria commits estilosos.
date: 2026-03-08
aiGenerated: trueauthors:
  - fox3000foxy
tags:
  - git
  - security
  - shell
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "fYMu/6d17qG7GdIznBvuIgLk76RMAJuKxi/hOohR/y3O2aAevF8eGIYugewzMVVHo4ETkm4hVbCfaBgqj7fqiw=="
---

# Script de assinatura SSH para commits -- explicação

Este artigo detalha o script `setup-ssh-signing.sh` que publiquei no [Gist](https://gist.github.com/fox3000foxy/95500d129cd4bf5c173c323d2492569a). Vamos ver o que cada parte faz, como ele torna a assinatura SSH local a um repositório completamente indolor, e, sim, por que eu me dei ao trabalho de escrevê-lo (spoiler: eu só queria que meus commits tivessem **estilo**).

## Motivação

Sempre adorei mexer no meu workflow Git, e depois de ver pessoas com selinhos «Verified» ao lado dos commits, pensei: por que eu não? A assinatura GPG integrada é pesada e global, então acabei escrevendo um pequeno helper que:

- cria uma chave SSH dedicada à assinatura,
- configura apenas o repositório atual,
- opcionalmente reescreve o histórico para assinar commits antigos,
- e permite transportar a chave entre máquinas.

Francamente, a necessidade era mais vaidade. Não tenho exigência técnica de assinatura nos meus projetos pessoais, mas ver um selo verde «Verified» em um commit dá um certo gosto, e escrever o script foi um prazer em shell.

> Bem, assinar seus commits é como vestir uma jaqueta de couro para uma review de código -- totalmente inútil, mas faz você se sentir um hacker.

## O que o script faz

O script é um único arquivo Bash com `set -euo pipefail` no topo para falhar rápido e de uma vez. Aqui está um resumo do que ele faz:

1. **Gerar ou importar uma chave de assinatura**  
   As chaves vão para `.git-signing/` no diretório onde você executa o script.
2. **Configurar Git localmente**  
   Ele define `gpg.format=ssh`, `user.signingkey`, `commit.gpgsign=true`, `tag.gpgSign=true`, e um `allowedSignersFile` que aponta para a chave pública.
3. **Gerenciar chaves entre máquinas**  
   Com `--export-keys` / `--import-keys`, você pode levar sua chave privada de um computador para outro sem mexer na configuração global.
4. **Reescrita opcional de histórico** (`--resign-all`)  
   Reescreve todos os commits de todos os branches/tags (ou apenas os que não estão no `upstream` para forks) e os reassina com `-S`, sem alterar outros autores.
5. **Flags utilitárias**  
   `--autostash`, `--autopush`, `--commit-date`, `--yes` para modo não interativo, etc.
6. **Detecção de fork e verificações de segurança**  
   Ele detecta o remote `upstream`, avisa antes de reescrever o histórico, verifica as ferramentas necessárias (`git`, `ssh-keygen`, `zip/unzip`), garante permissões corretas, e até cria uma cópia segura da chave se as permissões do filesystem forem muito permissivas.

O script é idempotente: executá-lo duas vezes não regenera sua chave nem sobrescreve a configuração existente.

## Passo a passo

Aqui estão alguns trechos chave do código com suas explicações.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Configure SSH commit signing in a controlled, repo-local way.
# - Key files are created in the directory where this script is launched.
# - Git config is written locally to the current repository only.
```

O cabeçalho estabelece segurança e documenta o objetivo. A parte seguinte faz o parsing das opções CLI (`--name`, `--email`, `--repo`, etc.) com um loop `while [[ $# -gt 0 ]]; do case … esac done`. Os campos obrigatórios de identidade são verificados mais adiante:

```bash
if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "Error: missing identity. Provide --name and --email." >&2
  exit 1
fi
```

A geração de chave acontece em `$LAUNCH_DIR/.git-signing`. Se uma chave já existir, o script a deixa em paz; `--import-keys` permite preencher o diretório a partir de um ZIP.

```bash
mkdir -p "$KEY_DIR"

if [[ -n "$IMPORT_ZIP_PATH" ]]; then
  import_keys_from_zip "$IMPORT_ZIP_PATH"
fi

if [[ ! -f "$KEY_PATH" ]]; then
  ssh-keygen -t ed25519 -N "" -C "$EMAIL signing key" -f "$KEY_PATH" >/dev/null
  echo "Generated signing key: $KEY_PATH"
else
  echo "Signing key already exists: $KEY_PATH"
fi
```

Após verificar que a chave privada é utilizável (`ssh-keygen -Y sign …`), o script escreve um pequeno arquivo `allowed_signers` contendo a chave pública e define a configuração Git local:

```bash
git -C "$REPO_DIR" config --local gpg.format ssh
git -C "$REPO_DIR" config --local user.signingkey "$RUNTIME_KEY_PATH"
git -C "$REPO_DIR" config --local gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS"
git -C "$REPO_DIR" config --local commit.gpgsign true
git -C "$REPO_DIR" config --local tag.gpgSign true
```

Se você solicitar a reescrita de histórico com `--resign-all`, o script constrói um comando `git filter-branch` que reassina os commits elegíveis com `-S`. Ele respeita o estado do fork pulando opcionalmente os commits já presentes no `upstream`.

O resultado final exibe a chave pública e as instruções para adicioná-la na seção **Signing Key** do GitHub, com uma pequena receita de teste.

## Por que assinar seus commits?

É aqui que admito que não precisava disso. Meus repositórios não exigem proveniência para o que publico, e não uso tags assinadas para releases. O «porquê» é:

- porque eu podia,
- porque fica bonito (viu o selo?),
- porque me deu uma desculpa para experimentar com `git filter-branch` e shell,
- e porque é mais um «eu construí isso» para o blog.

Resumindo, foi só para ostentar, mas é isso que é legal quando a gente mexe nas próprias ferramentas.

## Exemplos de uso

```bash
# configuração inicial no repositório atual
chmod +x ./setup-ssh-signing.sh
./setup-ssh-signing.sh --name "Your Name" \
                       --email "you@example.com"

# exportar as chaves para outra máquina
./setup-ssh-signing.sh --export-keys ./my-signing-keys.zip

# importar as chaves em uma segunda máquina
./setup-ssh-signing.sh --import-keys ./my-signing-keys.zip --repo ./my-repo \
                       --name "Your Name" --email "you@example.com"

# reescrever o histórico e push
./setup-ssh-signing.sh --repo ./my-repo --name "Your Name" --email "you@example.com" \
                       --resign-all --autostash --autopush --yes
```

## Últimas reflexões

Este script é um pequeno utilitário, mas contém algumas ideias legais:

- manter as chaves criptográficas locais e por repositório,
- nunca mexer na configuração global a menos que você peça,
- fornecer importação/exportação simples e reescrita de histórico,
- e documentar todo o processo em um artigo de blog, porque não.

Se bater a vontade de adicionar assinaturas aos seus próprios commits, experimente! E se você só está aqui pelo estilo, também vale. 😎
