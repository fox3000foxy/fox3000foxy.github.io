---
title: "Script di firma SSH spiegato"
description: "Anatomia dell'helper di firma dei commit SSH e perché volevo commit stilosi."
date: 2026-03-08
aiGenerated: true
tags:
  - git
  - security
  - shell
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "LdqDOJ43nlFANtih2CxjgDRC0RrCdR4Dr3jSKEv+YkvWUntCQ7fJE6Y8x4yJTDSUBU8Rxng4/mJNSIGtVNcu2Q=="
---

# Script di firma SSH per commit: spiegazione

Questo articolo smonta lo script `setup-ssh-signing.sh` che ho pubblicato su [Gist](https://gist.github.com/fox3000foxy/95500d129cd4bf5c173c323d2492569a). Vediamo cosa fa ogni parte, come rende la firma SSH locale a un deposito completamente indolore, e, sì, perché mi sono pure preso la briga di scriverlo (spoiler: volevo solo che i miei commit avessero **stile**).

## Motivazione

Ho sempre adorato trafficare col mio workflow Git, e dopo aver visto gente con piccoli badge "Verified" accanto ai loro commit, mi sono detto: perché non io? La firma GPG integrata è pesante e globale, così ho finito per scrivere un piccolo helper che:

- crea una chiave SSH dedicata alla firma,
- configura solo il deposito corrente,
- riscrive eventualmente lo storico per firmare i vecchi commit,
- e permette di trasportare la chiave tra macchine.

Francamente, il bisogno era soprattutto vanità. I miei progetti personali non impongono alcun requisito di firma, ma vedere un badge verde "Verified" su un commit fa il suo effetto, e scrivere questo script in shell mi ha fatto davvero piacere.

> Insomma, firmare i propri commit, è un po' come mettere un giubbotto di pelle per una code review: totalmente inutile, ma ti dà l'impressione di essere un hacker.

## Cosa fa lo script

Lo script è un solo file Bash con `set -euo pipefail` in cima per interrompere l'esecuzione alla prima erreur. Ecco un riassunto di ciò che fa:

1. **Genera o importa una chiave di firma**
   Le chiavi finiscono in `.git-signing/` nella cartella dove lanci lo script.
2. **Configura Git localmente**
   Imposta `gpg.format=ssh`, `user.signingkey`, `commit.gpgsign=true`, `tag.gpgSign=true`, e un `allowedSignersFile` che punta alla chiave pubblica.
3. **Gestisci le chiavi tra macchine**
   Grazie a `--export-keys` / `--import-keys`, puoi trasferire la tua chiave privata da un computer all'altro senza toccare la config globale.
4. **Riscrittura storico opzionale** (`--resign-all`)
   Riscrive tutti i commit di tutti i branch/tag (o solo quelli non in `upstream` per i fork) e li rifirma con `-S`, senza toccare gli altri autori.
5. **Flag utilitari**
   `--autostash`, `--autopush`, `--commit-date`, `--yes` per la modalità non interattiva, ecc.
6. **Rilevamento di fork e verifiche di sicurezza**
   Rileva il remote `upstream`, avvisa prima di riscrivere lo storico, verifica gli strumenti richiesti (`git`, `ssh-keygen`, `zip/unzip`), assicura i buoni permessi, e crea persino una copia sicura della chiave se i permessi del filesystem sono troppo permissivi.

Lo script è idempotente: lanciarlo due volte non rigenera la tua chiave e non schiaccia la config esistente.

## Svolgimento passo passo

Ecco alcuni estratti chiave del codice con le loro spiegazioni.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Configura la firma commit SSH in modo controllato, locale al repo.
# - I file chiave sono creati nella cartella dove questo script è lanciato.
# - La config Git è scritta localmente solo nel deposito corrente.
```

L'intestazione pone la sicurezza e documenta l'obiettivo. Il pezzo seguente parsa le opzioni CLI (`--name`, `--email`, `--repo`, ecc.) con un ciclo `while [[ $# -gt 0 ]]; do case … esac done`. I campi di identità obbligatori sono verificati dopo:

```bash
if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "Error: missing identity. Provide --name and --email." >&2
  exit 1
fi
```

La generazione di chiave avviene in `$LAUNCH_DIR/.git-signing`. Se una chiave esiste già, lo script la conserva così com'è; `--import-keys` permette di riempire la cartella da uno ZIP.

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

Dopo aver verificato che la chiave privata è usabile (`ssh-keygen -Y sign …`), lo script scrive un file `allowed_signers` contenente la chiave pubblica e imposta la config Git locale:

```bash
git -C "$REPO_DIR" config --local gpg.format ssh
git -C "$REPO_DIR" config --local user.signingkey "$RUNTIME_KEY_PATH"
git -C "$REPO_DIR" config --local gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS"
git -C "$REPO_DIR" config --local commit.gpgsign true
git -C "$REPO_DIR" config --local tag.gpgSign true
```

Se chiedi la riscrittura storico con `--resign-all`, lo script costruisce un comando `git filter-branch` che rifirma i commit idonei con `-S`. Rispetta lo stato del fork saltando opzionalmente i commit già presenti in `upstream`.

Il risultato finale mostra la chiave pubblica e le istruzioni per aggiungerla nella sezione **Signing Key** di GitHub, con una ricetta di test.

## Perché firmare i propri commit?

È il momento in cui ammetto che non ne avevo bisogno. I miei depositi non esigono alcuna provenienza per ciò che pubblico, e non uso i tag firmati per le release. Il "perché" è:

- perché potevo,
- perché fa figo (hai visto il badge?),
- perché mi ha dato una scusa per sperimentare con `git filter-branch` e la shell,
- e perché è un ennesimo "l'ho costruito io" per il blog.

Insomma, era solo per fare lo spaccone, ma è ciò che amo quando traffico coi miei strumenti.

## Esempi di uso

```bash
# configurazione iniziale nel deposito corrente
chmod +x ./setup-ssh-signing.sh
./setup-ssh-signing.sh --name "Your Name" \
                       --email "you@example.com"

# esporta le chiavi per un'altra macchina
./setup-ssh-signing.sh --export-keys ./my-signing-keys.zip

# importa le chiavi su una seconda macchina
./setup-ssh-signing.sh --import-keys ./my-signing-keys.zip --repo ./my-repo \
                       --name "Your Name" --email "you@example.com"

# riscrivi lo storico e spingi
./setup-ssh-signing.sh --repo ./my-repo --name "Your Name" --email "you@example.com" \
                       --resign-all --autostash --autopush --yes
```

## Ultime riflessioni

Questo script resta un'utilità compatta, ma porta alcuni principi che sostengo:

- tenere le chiavi crittografiche locali e per deposito,
- non toccare mai la config globale a meno che tu lo chieda,
- fornire un import/export semplice e la riscrittura storico,
- e documentare tutto il processo in un articolo di blog per tenere una traccia riusabile.

Se ti viene voglia di aggiungere firme ai tuoi commit, provalo! E se sei qui solo per lo stile, uguale.
