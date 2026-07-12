---
itle: SSH-Commit-Signing-Skript erklärt
description: Eine Erklärung des SSH-Commit-Signing-Helfers und warum ich
  stylische Commits haben wollte.
date: 2026-03-08
aiGenerated: trueauthors:
  - fox3000foxy
tags:
  - git
  - security
  - shell
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "cqwZbweDcxWtoc+lYerjPusQKPp+iEaQcfTb/dx9LLN/ciVEfR+JCmFu53GHEV+xR7QU4B9EPe0rJlNE7Iv6cA=="
---

# SSH-Commit-Signing-Skript erklärt

Dieser Beitrag taucht in das `setup-ssh-signing.sh`-Skript ein, das ich auf [Gist](https://gist.github.com/fox3000foxy/95500d129cd4bf5c173c323d2492569a) veröffentlicht habe. Wir schauen uns an, was jeder Teil macht, wie es repository-lokales SSH-Commit-Signing schmerzfrei macht und, ja, warum ich überhaupt die Mühe gemacht habe, es zu schreiben (Spoiler: Ich wollte einfach, dass meine Commits **stylisch** aussehen).

## Motivation

Ich habe es immer geliebt, meinen Git-Workflow zu optimieren, und nachdem ich andere Leute mit kleinen „Verified“-Badges neben ihren Commits gesehen habe, dachte ich mir: warum nicht ich? Das integrierte GPG-Signing ist etwas schwerfällig und global, also habe ich einen kleinen Helfer geschrieben, der:

- einen SSH-Key nur zum Signieren erstellt,
- nur das aktuelle Repository konfiguriert,
- optional die Historie umschreibt, um alte Commits zu signieren,
- und mir erlaubt, den Key zwischen Maschinen zu verschieben.

Ehrlich gesagt, das Bedürfnis war hauptsächlich Eitelkeit. Es gibt keine technische Notwendigkeit für Signaturen in meinen persönlichen Projekten, aber ein grünes „Verified“ auf einem Commit fühlt sich cool an, und das Skript zu schreiben war eine unterhaltsame Übung in Shell-Scripting.

> Ich meine, seine Commits zu signieren ist wie das Tragen einer Lederjacke zu einem Code-Review – völlig unnötig, aber es gibt dir das Gefühl, ein Hacker zu sein.

## Was das Skript macht

Das Skript ist eine einzelne Bash-Datei mit `set -euo pipefail` oben, damit es schnell abbricht. Hier ist eine Zusammenfassung seines Verhaltens:

1. **Signier-Key erstellen oder importieren**  
   Die Keys liegen in `.git-signing/` im Verzeichnis, in dem du das Skript ausführst.
2. **Git lokal konfigurieren**  
   Setzt `gpg.format=ssh`, `user.signingkey`, `commit.gpgsign=true`, `tag.gpgSign=true` und eine `allowedSignersFile`, die auf den öffentlichen Key zeigt.
3. **Keys maschinenübergreifend verwalten**  
   Unterstützung für `--export-keys`/`--import-keys` erlaubt dir, den privaten Key zwischen Computern zu verschieben, ohne den globalen Status zu berühren.
4. **Optionale Historie-Umschreibung** (`--resign-all`)  
   Schreibt jeden Commit auf jedem Branch/Tag um (oder nur die, die nicht in `upstream` sind, bei Forks) und signiert sie mit `-S`, wobei andere Autoren unberührt bleiben.
5. **Utility-Flags**  
   `--autostash`, `--autopush`, `--commit-date`, `--yes` für nicht-interaktiven Modus, etc.
6. **Fork-Bewusstsein und Sicherheitschecks**  
   Erkennt `upstream`-Remote, warnt vor dem Umschreiben der Historie, prüft auf benötigte Tools (`git`, `ssh-keygen`, `zip/unzip`), stellt korrekte Berechtigungen sicher und erstellt bei Bedarf eine sichere Runtime-Kopie des Keys, wenn die Dateisystemberechtigungen zu locker sind.

Das Skript ist idempotent: Zweimaliges Ausführen regeneriert weder deinen Key noch überschreibt es bestehende Konfiguration.

## Schritt-für-Schritt-Erklärung

Hier sind einige der wichtigsten Code-Teile mit Erklärungen.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Configure SSH commit signing in a controlled, repo-local way.
# - Key files are created in the directory where this script is launched.
# - Git config is written locally to the current repository only.
```

Der Kopf sorgt für Sicherheit und dokumentiert das Ziel. Der nächste Block parst CLI-Optionen (`--name`, `--email`, `--repo`, etc.) mit einer `while [[ $# -gt 0 ]]; do case … esac done`-Schleife. Pflichtfelder für die Identität werden später durchgesetzt:

```bash
if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "Error: missing identity. Provide --name and --email." >&2
  exit 1
fi
```

Die Generierung der Keys findet unter `$LAUNCH_DIR/.git-signing` statt. Wenn bereits ein Key existiert, lässt das Skript ihn in Ruhe; `--import-keys` kann das Verzeichnis aus einer ZIP-Datei befüllen.

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

Nachdem sichergestellt ist, dass der private Key verwendbar ist (`ssh-keygen -Y sign …`), schreibt das Skript eine kleine `allowed_signers`-Datei mit dem öffentlichen Key und setzt die lokale Git-Konfiguration entsprechend:

```bash
git -C "$REPO_DIR" config --local gpg.format ssh
git -C "$REPO_DIR" config --local user.signingkey "$RUNTIME_KEY_PATH"
git -C "$REPO_DIR" config --local gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS"
git -C "$REPO_DIR" config --local commit.gpgsign true
git -C "$REPO_DIR" config --local tag.gpgSign true
```

Wenn du die Historie mit `--resign-all` umschreiben möchtest, baut das Skript einen `git filter-branch`-Befehl, der berechtigte Commits mit `-S` neu signiert. Es respektiert den Fork-Status, indem es optional Commits überspringt, die bereits in `upstream` sind.

Die endgültige Ausgabe zeigt den öffentlichen Key und Anweisungen zum Hinzufügen zu GitHub's **Signing Key**-Abschnitt, zusammen mit einem kurzen Test-Rezept.

## Warum Commit-Signing?

Dies ist der Teil, in dem ich zugebe, dass ich es nicht brauchte. Meine Repositories benötigen keine Herkunftsnachweise für alles, was ich veröffentliche, und ich verwende keine signierten Tags für Releases. Das „Warum“ ist:

- weil ich es konnte,
- weil es ordentlich aussieht (hast du das Badge gesehen?),
- weil es mir einen Grund gab, mit `git filter-branch` und Shell-Scripting zu experimentieren,
- und weil es ein weiteres „Das habe ich selbst gebaut“-Stück Content für den Blog ist.

Kurz gesagt: Es war nur für die Show, aber das ist die halbe Miete beim Tüfteln an Tools.

## Anwendungsbeispiele

```bash
# initial setup in current repo
chmod +x ./setup-ssh-signing.sh
./setup-ssh-signing.sh --name "Your Name" \
                       --email "you@example.com"

# export keys to use on another machine
./setup-ssh-signing.sh --export-keys ./my-signing-keys.zip

# import keys on second machine
./setup-ssh-signing.sh --import-keys ./my-signing-keys.zip --repo ./my-repo \
                       --name "Your Name" --email "you@example.com"

# rewrite history and push
./setup-ssh-signing.sh --repo ./my-repo --name "Your Name" --email "you@example.com" \
                       --resign-all --autostash --autopush --yes
```

## Abschließende Gedanken

Dieses Skript ist ein kleines Utility, aber es beinhaltet ein paar nette Ideen:

- kryptografische Keys lokal und pro-Repository halten,
- niemals die globale Konfiguration berühren, es sei denn, du verlangst es,
- einfachen Import/Export und Historie-Umschreibung bereitstellen,
- und den gesamten Prozess in einem Blogbeitrag dokumentieren, weil nicht.

Wenn du Lust hast, deinen eigenen Commits Signaturen hinzuzufügen, probier es aus! Und wenn du nur wegen der Style-Punkte hier bist, same. 😎
