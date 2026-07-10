---
title: Script di firma commit SSH spiegato
description: Una panoramica dell'helper per la firma dei commit SSH e perché
  volevo commit eleganti.
date: 2026-03-08
aiGenerated: true
tags:
  - git
  - security
  - shell
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "4RITgB6CY6NrelblYRt7/OH/QJiqnXB34leGkp8bHQFL4kTqMb/T6VAXIPpRp0c3QXqVjn18onQzYXJoaAXaug=="
---

# Script di firma commit SSH spiegato

Questo post analizza lo script `setup-ssh-signing.sh` che ho pubblicato su [Gist](https://gist.github.com/fox3000foxy/95500d129cd4bf5c173c323d2492569a). Vedremo cosa fa ogni parte, come rende semplice la firma SSH dei commit a livello di repository e, sì, perché mi sono preso la briga di scriverlo (spoiler: volevo solo che i miei commit avessero un aspetto **stiloso**).

## Motivazione

Ho sempre amato ottimizzare il mio flusso di lavoro Git, e dopo aver visto altre persone con quei piccoli badge "Verified" accanto ai commit ho pensato: perché non io? La firma GPG integrata è un po' pesante e globale, quindi ho finito per scrivere un piccolo helper che:

- crea una chiave SSH solo per la firma,
- configura solo il repository corrente,
- riscrive opzionalmente la storia per firmare i vecchi commit,
- e mi permette di trasportare la chiave tra macchine diverse.

In realtà, il bisogno era principalmente vanità. Non c'è alcun requisito tecnico per le firme nei miei progetti personali, ma avere un badge verde "Verified" su un commit è figo, e scrivere lo script è stato un esercizio divertente di shell scripting.

> Cioè, firmare i tuoi commit è come indossare un giubbotto di pelle a una code review -- totalmente inutile, ma ti fa sentire un hacker.

## Cosa fa lo script

Lo script è un singolo file Bash con `set -euo pipefail` all'inizio in modo che fallisca rapidamente. Ecco un riassunto ad alto livello del suo comportamento:

1. **Genera o importa una chiave per la firma**
   Le chiavi vivono in `.git-signing/` nella directory in cui esegui lo script.
2. **Configura Git localmente**
   Imposta `gpg.format=ssh`, `user.signingkey`, `commit.gpgsign=true`, `tag.gpgSign=true`, e un `allowedSignersFile` che punta alla chiave pubblica.
3. **Gestisce le chiavi tra macchine diverse**
   Il supporto per `--export-keys`/`--import-keys` ti permette di spostare la chiave privata tra computer senza toccare lo stato globale.
4. **Riscrittura opzionale della storia** (`--resign-all`)
   Riscrive ogni commit su ogni branch/tag (o solo quelli non in `upstream` per i fork) e li ricommite con `-S`, lasciando intatti gli altri autori.
5. **Flag di utilità**
   `--autostash`, `--autopush`, `--commit-date`, `--yes` per modalità non interattiva, ecc.
6. **Consapevolezza dei fork e controlli di sicurezza**
   Rileva il remote `upstream`, avverte prima di riscrivere la storia, controlla gli strumenti necessari (`git`, `ssh-keygen`, `zip/unzip`), garantisce i permessi corretti, e crea persino una copia sicura della chiave in fase di esecuzione se i permessi del filesystem sono troppo permissivi.

Lo script è idempotente: eseguirlo due volte non rigenera la tua chiave né sovrascrive la configurazione esistente.

## Analisi passo dopo passo

Qui sotto ci sono alcune delle parti chiave del codice con spiegazioni.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Configure SSH commit signing in a controlled, repo-local way.
# - Key files are created in the directory where this script is launched.
# - Git config is written locally to the current repository only.
```

L'intestazione stabilisce la sicurezza e documenta l'obiettivo. Il blocco successivo analizza le opzioni CLI (`--name`, `--email`, `--repo`, ecc.) con un loop `while [[ $# -gt 0 ]]; do case … esac done`. I campi di identità obbligatori vengono imposti più avanti:

```bash
if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "Error: missing identity. Provide --name and --email." >&2
  exit 1
fi
```

La generazione della chiave avviene in `$LAUNCH_DIR/.git-signing`. Se una chiave esiste già, lo script la lascia stare; `--import-keys` può popolare la directory da un file ZIP.

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

Dopo essersi assicurato che la chiave privata sia utilizzabile (`ssh-keygen -Y sign …`), lo script scrive un piccolo file `allowed_signers` contenente la chiave pubblica e imposta la configurazione Git locale di conseguenza:

```bash
git -C "$REPO_DIR" config --local gpg.format ssh
git -C "$REPO_DIR" config --local user.signingkey "$RUNTIME_KEY_PATH"
git -C "$REPO_DIR" config --local gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS"
git -C "$REPO_DIR" config --local commit.gpgsign true
git -C "$REPO_DIR" config --local tag.gpgSign true
```

Se richiedi la riscrittura della storia con `--resign-all`, lo script costruisce un comando `git filter-branch` che ricommite i commit idonei con `-S`. Rispetta lo stato del fork saltando opzionalmente i commit già presenti in `upstream`.

L'output finale stampa la chiave pubblica e le istruzioni per aggiungerla alla sezione **Signing Key** di GitHub, insieme a una rapida ricetta di test.

## Perché firmare i commit?

Questa è la parte in cui ammetto che non ne avevo bisogno. I miei repository non richiedono provenienza per nulla di ciò che pubblico, e non uso tag firmati per le release. Il "perché" è:

- perché potevo,
- perché è carino da vedere (hai visto il badge?),
- perché mi ha dato una scusa per sperimentare con `git filter-branch` e shell scripting,
- e perché è un altro pezzo di "l'ho costruito io" per il blog.

In breve: era solo per mostrarlo, ma è metà del divertimento quando si armeggia con gli strumenti.

## Esempi di utilizzo

```bash
# configurazione iniziale nel repo corrente
chmod +x ./setup-ssh-signing.sh
./setup-ssh-signing.sh --name "Your Name" \
                       --email "you@example.com"

# esporta le chiavi per usarle su un'altra macchina
./setup-ssh-signing.sh --export-keys ./my-signing-keys.zip

# importa le chiavi su una seconda macchina
./setup-ssh-signing.sh --import-keys ./my-signing-keys.zip --repo ./my-repo \
                       --name "Your Name" --email "you@example.com"

# riscrivi la storia e fai push
./setup-ssh-signing.sh --repo ./my-repo --name "Your Name" --email "you@example.com" \
                       --resign-all --autostash --autopush --yes
```

## Considerazioni finali

Questo script è un piccolo strumento, ma racchiude alcune idee interessanti:

- tenere le chiavi crittografiche locali e per-repo,
- non toccare mai la configurazione globale a meno che non lo chieda esplicitamente,
- fornire semplici funzioni di import/export e riscrittura della storia,
- e documentare l'intero processo in un post del blog, perché no.

Se sei tentato di aggiungere firme ai tuoi commit, provalo! E se sei qui solo per lo stile, stesso identico motivazione. 😎
