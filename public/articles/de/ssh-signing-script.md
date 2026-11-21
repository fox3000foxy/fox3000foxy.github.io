---
title: SSH-Signatur-Skript erklärt
description: Der SSH Commits Signaturhelper wird entbündelt und ich wollte stilvolle Commit-Commits.
date: 2026-03-08
aiGenerated: true
tags:
  - git
  - security
  - shell
authors:
  - fox3000foxy
lang: "de"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "G09XEodKo5uhomuzL6pzhLUCkYJvTWKVaBXq0aezrkTr2TEWrSROKTwdOnRsmsHZ5lwOGULd8DT4rerMfesf/w=="
---
# 

Dieser Artikel dekoriert das Skript`setup-ssh-signing.sh`die ich veröffentlicht habe über [Gist](https://gist.github.com/fox3000foxy/95500d129cd4bf5c173c323d2492569a). Wir werden sehen, was jedes Spiel tut, wie es die lokale SSH-Signatur zu einem völlig schmerzlosen Projektarchiv macht, und ja, warum ich sogar die Mühe hatte, es zu schreiben (Spornen: Ich wollte nur, dass meine Commits **Klaue** haben).

## Begründung

Ich habe immer geliebt, meinen Git Workflow zu basteln, und nachdem ich Leute mit kleinen Abzeichen gesehen habe ✓ Verified ← neben ihren Commits, dachte ich mir: Warum nicht ich? Die integrierte GPG-Signatur ist schwer und global, so dass ich schließlich einen kleinen Helper, der schrieb:

- erstellt einen SSH-Schlüssel für die Signatur,
- konfiguriert nur das aktuelle Projektarchiv,
- möglicherweise die Geschichte neu geschrieben, um die alten Commits zu unterschreiben,
- und ermöglicht den Schlüssel zwischen Maschinen zu transportieren.

Offen gesagt, die Notwendigkeit war vor allem Eitelkeit. Meine persönlichen Projekte erfordern keine Unterschrift, aber siehst du eine grüne Marke ✓ Verified ← auf einem Commit macht seine kleine Wirkung, und das Skript in der Shell zu schreiben hat mich wirklich glücklich gemacht.

> Nun, seine Commits unterschreiben ist ein bisschen wie eine Lederjacke für eine Code-Besprechung zu tragen - völlig unnötig, aber es gibt dir den Eindruck, ein Hacker zu sein.

## Was das Skript tut

Das Skript ist eine einzige Bash-Datei mit`set -euo pipefail`oben, um die Ausführung zu unterbrechen, sobald der erste Fehler vorliegt. Hier ist eine Zusammenfassung dessen, was er tut:

1. **Signaturschlüssel generieren oder importieren**

Die Schlüssel landen in`.git-signing/`in der Akte, in der du das Skript startest.

2. **Git lokal einrichten**

Er positioniert`gpg.format=ssh` , `user.signingkey` , `commit.gpgsign=true` , `tag.gpgSign=true`, und ein`allowedSignersFile`der auf den öffentlichen Schlüssel zeigt.

3. **Schlüssel zwischen Maschinen verwalten**

Dank`–export-keys` / `–import-keys`Du kannst deinen privaten Schlüssel von einem Computer auf den anderen übertragen, ohne das globale Konfig zu berühren.

4. **Optionale Historie-Überarbeitung** (`–resign-all`)

Neu geschrieben alle Commits aller Zweige/Tags (oder nur diejenigen, die nicht in`upstream`für Forks) und Re-Zeichen mit`-S`, ohne die anderen Autoren zu berühren.

5. **Dienstleistungsangaben**

`–autostash` , `–autopush` , `–commit-date` , `–yes`für den nicht interaktiven Modus usw.

6. **Fork-Erkennung und Sicherheitskontrollen**

Er erkennt den Remote.`upstream`, warnt vor der Neuschreibung der Geschichte, prüft die erforderlichen Werkzeuge (`git` , `ssh-keygen` , `zip/unzip`), sorgt für die richtigen Berechtigungen und erstellt sogar eine sichere Kopie des Schlüssels, wenn die Berechtigungen des filesystems zu stark sind.

Das Skript ist idempotent: Das zweimal gestartete Skriptor ändert deinen Schlüssel nicht und überschreibt nicht die vorhandene Konfig-Konfig.

## Schritt für Schritt

Hier sind einige Schlüsselausschnitte des Codes mit ihren Erklärungen.
```bash
#!/usr/bin/env bash
set -euo pipefail

# Configure SSH commit signing in a controlled, repo-local way.
# - Key files are created in the directory where this script is launched.
# - Git config is written locally to the current repository only.
```
Der Kopfzeile legt Sicherheit und dokumentiert das Objektiv. Das nächste Stück passt die CLI-Optionen (`–name` , `–email` , `–repo`, etc.) mit einer Schleife`while [[ $# -gt 0 ]]; do case … esac done`. Pflichtfelder werden später überprüft:
```bash
if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "Error: missing identity. Provide --name and --email." >&2
  exit 1
fi
```
Die Schlüsselgeneration wird in`$LAUNCH_DIR/.git-signing`. Wenn ein Schlüssel bereits existiert, behält das Skript ihn in der gewünschten Form;`–import-keys`ermöglicht das Ausfüllen des Ordners aus einem ZIP.
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
Nachdem du überprüft haben, ob der private Schlüssel nutzbar ist (`ssh-keygen -Y sign …`), schreibt das Skript eine Datei`allowed_signers`enthält den öffentlichen Schlüssel und positioniert die lokale Git config:
```bash
git -C "$REPO_DIR" config --local gpg.format ssh
git -C "$REPO_DIR" config --local user.signingkey "$RUNTIME_KEY_PATH"
git -C "$REPO_DIR" config --local gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS"
git -C "$REPO_DIR" config --local commit.gpgsign true
git -C "$REPO_DIR" config --local tag.gpgSign true
```
Wenn du die Geschichte mit`–resign-all`, erstellt das Skript einen Befehl`git filter-branch`die die förderungsberechtigten Commits mit`-S`. Er respektiert den Zustand des Forks, indem er die bereits vorhandenen Commits optional überspringt`upstream` .

Das Endergebnis zeigt den öffentlichen Schlüssel und Anweisungen, um ihn in den Abschnitt **Signing Key** von GitHub mit einem Testrezept hinzuzufügen.

## Warum unterschreiben du seine Commits?

Ich gebe zu, dass ich es nicht brauchte. Meine Einlagen verlangen keine Herkunft für das, was ich publik mache, und ich benutze nicht die signierten Tags für die Releases. ✓ warum denn:

- Weil ich konnte,
- weil es gut ist (Hast du das Abzeichen gesehen?),
- Weil es mir eine Entschuldigung gab, mit zu experimentieren.`git filter-branch`und die Shell,
- Und weil es ein x-ten ✓ ich selbst das für den Blog gebaut ^.

Es war nur ein Scherz, aber das ist es, was ich liebe, wenn ich meine Werkzeuge bastele.

## Anwendungsbeispiele
```bash
# Ausgangseinstellung im aktuellen Projektarchiv
chmod +x ./setup-ssh-signing.sh
./setup-ssh-signing.sh --name "Your Name" \
                       --email "you@example.com"

# Schlüssel für eine andere Maschine exportieren
./setup-ssh-signing.sh --export-keys ./my-signing-keys.zip

# importieren Sie die Schlüssel auf eine zweite Maschine
./setup-ssh-signing.sh --import-keys ./my-signing-keys.zip --repo ./my-repo \
                       --name "Your Name" --email "you@example.com"

# Protokoll umschreiben und drücken
./setup-ssh-signing.sh --repo ./my-repo --name "Your Name" --email "you@example.com" \
                       --resign-all --autostash --autopush --yes
```
## Letzte Überlegungen

Dieses Skript bleibt ein kompaktes Dienstprogramm, aber es trägt einige Prinzipien, die ich versichere:

- die lokalen Kryptoschlüssel und die Anzahlung zu halten,
- Berühren du niemals das globale Konfig, es sei denn, du bitten es,
- einfaches Import/Export und Historie-Neuschreiben;
- und dokumentieren den gesamten Prozess in einem Blog-Artikel, um eine wiederverwendbare Spur zu halten.

Wenn du dir die Unterschriften zu deinen eigenen Commits hinzufügen willst, dann versuch es! Und wenn du nur für den Stil da bist, so auch.
