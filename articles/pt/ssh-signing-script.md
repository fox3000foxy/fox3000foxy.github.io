---
title: Script de assinatura SSH explicado
description: Dissecação do helper de assinatura de commits SSH e por que eu
  queria commits estilosos.
date: 2026-03-08
aiGenerated: true
tags:
  - git
  - security
  - shell
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "o2E4Rg1qYlta4Tt0+nqN6CeixneOWemMK6Agmcds7hDtEh/5HTnaMJygfjHAQeF5kkd5xfbgU9L4twAeJ+Ndrw=="
---

# Script de assinatura SSH para commits, explicação

Este artigo disseca o script `setup-ssh-signing.sh` que publiquei neste [Gist](https://gist.github.com/fox3000foxy/95500d129cd4bf5c173c323d2492569a). Vamos ver o que cada parte faz, como ele torna a assinatura SSH local a um repositório totalmente indolor, e, sim, por que eu sequer me dei ao trabalho de escrevê-lo (spoiler : eu só queria que meus commits tivessem **estilo**).

## Motivação

Sempre adorei mexer no meu workflow de Git, e depois de ver gente com selinhos "Verified" ao lado dos commits, pensei : por que não eu ? A assinatura GPG integrada é pesada e global, então acabei escrevendo um pequeno helper que :

- cria uma chave SSH dedicada à assinatura,
- configura só o repositório atual,
- reescreve eventualmente o histórico para assinar commits antigos,
- e permite transportar a chave entre máquinas.

Sinceramente, a necessidade era mais vaidade. Meus projetos pessoais não impõem nenhuma exigência de assinatura, mas ver um selo verde "Verified" em um commit causa seu efeitozinho, e escrever esse script em shell me deu um prazer real.

> Bom, assinar seus commits é meio como vestir uma jaqueta de couro para um code review, totalmente inútil, mas te dá a sensação de ser um hacker.

## O que o script faz

O script é um único arquivo Bash com `set -euo pipefail` no topo para interromper a execução no primeiro erro. Aqui vai um resumo do que ele faz :

1. **Gerar ou importar uma chave de assinatura**
   As chaves caem em `.git-signing/` na pasta onde você roda o script.
2. **Configurar o Git localmente**
   Ele define `gpg.format=ssh`, `user.signingkey`, `commit.gpgsign=true`, `tag.gpgSign=true`, e um `allowedSignersFile` que aponta para a chave pública.
3. **Gerenciar as chaves entre máquinas**
   Graças a `--export-keys` / `--import-keys`, você pode transferir sua chave privada de um computador para outro sem tocar na config global.
4. **Reescrita opcional de histórico** (`--resign-all`)
   Reescreve todos os commits de todos os branches/tags (ou só os que não estão em `upstream` para forks) e reassina com `-S`, sem tocar nos outros autores.
5. **Flags utilitárias**
   `--autostash`, `--autopush`, `--commit-date`, `--yes` para o modo não interativo, etc.
6. **Detecção de fork e verificações de segurança**
   Ele detecta o remote `upstream`, avisa antes de reescrever o histórico, verifica as ferramentas necessárias (`git`, `ssh-keygen`, `zip/unzip`), garante as permissões certas, e até cria uma cópia segura da chave se as permissões do filesystem forem permissivas demais.

O script é idempotente : rodar duas vezes não regenera sua chave nem sobrescreve a config existente.

## Passo a passo

Aqui vão alguns trechos principais do código com explicações.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Configura a assinatura de commits SSH de forma controlada, local ao repo.
# - Arquivos de chave criados no diretório onde o script é lançado.
# - Config do Git escrita localmente só no repositório atual.
```

O cabeçalho define a segurança e documenta o objetivo. O trecho seguinte interpreta as opções CLI (`--name`, `--email`, `--repo`, etc.) com um loop `while [[ $# -gt 0 ]]; do case … esac done`. Os campos de identidade obrigatórios são verificados depois :

```bash
# Erro se a identidade estiver faltando : informar --name e --email.
if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "Error: missing identity. Provide --name and --email." >&2
  exit 1
fi
```

A geração da chave acontece em `$LAUNCH_DIR/.git-signing`. Se já existir uma chave, o script a mantém como está ; `--import-keys` permite preencher a pasta a partir de um ZIP.

```bash
# Cria a pasta de chaves, importa de um ZIP se pedido, senão gera a chave.
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

Depois de verificar que a chave privada é utilizável (`ssh-keygen -Y sign …`), o script escreve um arquivo `allowed_signers` com a chave pública e define a config local do Git :

```bash
# Config local do Git : formato ssh, chave de assinatura e verificação.
git -C "$REPO_DIR" config --local gpg.format ssh
git -C "$REPO_DIR" config --local user.signingkey "$RUNTIME_KEY_PATH"
git -C "$REPO_DIR" config --local gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS"
git -C "$REPO_DIR" config --local commit.gpgsign true
git -C "$REPO_DIR" config --local tag.gpgSign true
```

Se você pedir a reescrita de histórico com `--resign-all`, o script monta um comando `git filter-branch` que reassina os commits elegíveis com `-S`. Ele respeita o estado do fork pulando opcionalmente os commits já presentes em `upstream`.

O resultado final mostra a chave pública e as instruções para adicioná-la na seção **Signing Key** do GitHub, com uma receita de teste.

## Por que assinar seus commits ?

É a hora em que confesso que eu não precisava. Meus repositórios não exigem nenhuma procedência para o que publico, e não uso tags assinadas para releases. O "porquê" é :

- porque eu podia,
- porque fica bonito (viu o selo ?),
- porque me deu uma desculpa para experimentar `git filter-branch` e shell,
- e porque é mais um "construí isso eu mesmo" para o blog.

Resumindo, foi só para me exibir, mas é disso que gosto quando mexo nas minhas ferramentas.

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

# reescrever o histórico e enviar
./setup-ssh-signing.sh --repo ./my-repo --name "Your Name" --email "you@example.com" \
                       --resign-all --autostash --autopush --yes
```

## Últimas reflexões

Esse script continua sendo um utilitário compacto, mas carrega alguns princípios que assumo :

- manter as chaves criptográficas locais e por repositório,
- nunca tocar na config global a não ser que você peça,
- oferecer um import/export simples e a reescrita de histórico,
- e documentar todo o processo em um artigo de blog para manter um registro reutilizável.

Se der vontade de adicionar assinaturas aos seus próprios commits, experimente ! E se você está aqui só pelo estilo, vale também. 😎
