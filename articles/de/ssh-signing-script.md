---
title: SSH-Signaturskript erklärt
description: Zerlegung des SSH-Commit-Signaturhelpers und warum ich
  stylishe Commits wollte.
date: 2026-03-08
aiGenerated: true
tags:
  - git
  - security
  - shell
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "bVoYGEh9RiQJkefHuvPmSB2v7/XNiPUUcdyzQH5bMXUMBzq577H1vFKRR2yMuaJya4NhVlAIFD86857Ps+SudA=="
---

# SSH-Signaturskript für Commits, erklärt

Dieser Artikel zerlegt das Skript `setup-ssh-signing.sh`, das ich auf [Gist](https://gist.github.com/fox3000foxy/95500d129cd4bf5c173c323d2492569a) veröffentlicht habe. Wir schauen uns an, was jeder Teil tut, wie es die repo-lokale SSH-Signatur völlig schmerzlos macht, und ja, warum ich mir überhaupt die Mühe gemacht habe, es zu schreiben (Spoiler: Ich wollte nur, dass meine Commits richtig **was hermachen**).

## Motivation

Ich habe es schon immer geliebt, an meinem Git-Workflow zu basteln, und nachdem ich Leute mit kleinen "Verified"-Badges neben ihren Commits gesehen hatte, dachte ich mir: Warum nicht ich? Die eingebaute GPG-Signatur ist schwerfällig und global, also habe ich am Ende einen kleinen Helper geschrieben, der:

- einen dedizierten SSH-Signaturschlüssel erstellt,
- nur das aktuelle Repository konfiguriert,
- bei Bedarf die Historie umschreibt, um alte Commits zu signieren,
- und es erlaubt, den Schlüssel zwischen Rechnern mitzunehmen.

Ehrlich gesagt war das Bedürfnis vor allem Eitelkeit. Meine persönlichen Projekte stellen keine Signaturanforderungen, aber ein grünes "Verified"-Badge auf einem Commit macht schon was her, und dieses Shell-Skript zu schreiben hat mir wirklich Spaß gemacht.

> Na ja, seine Commits zu signieren ist ein bisschen so, als würde man eine Lederjacke für ein Code-Review anziehen, völlig nutzlos, aber du fühlst dich dabei wie ein Hacker.

## Was das Skript tut

Das Skript ist eine einzige Bash-Datei mit `set -euo pipefail` oben, um die Ausführung beim ersten Fehler abzubrechen. Hier eine Zusammenfassung dessen, was es tut:

1. **Signaturschlüssel generieren oder importieren**  
   Die Schlüssel landen in `.git-signing/` in dem Ordner, in dem du es startest.
2. **Git lokal konfigurieren**  
   Es setzt `gpg.format=ssh`, `user.signingkey`, `commit.gpgsign=true`, `tag.gpgSign=true` und ein `allowedSignersFile`, das auf den öffentlichen Schlüssel zeigt.
3. **Schlüssel zwischen Rechnern verwalten**  
   Dank `--export-keys` / `--import-keys` kannst du deinen privaten Schlüssel von einem Rechner auf den anderen übertragen, ohne die globale Config anzufassen.
4. **Optionales Umschreiben der Historie** (`--resign-all`)  
   Schreibt alle Commits aller Branches/Tags neu (oder nur die, die nicht in `upstream` sind, bei Forks) und signiert sie mit `-S` neu, ohne die anderen Autoren anzufassen.
5. **Nützliche Flags**  
   `--autostash`, `--autopush`, `--commit-date`, `--yes` für den nicht-interaktiven Modus usw.
6. **Fork-Erkennung und Sicherheitsprüfungen**  
   Es erkennt das `upstream`-Remote, warnt vor dem Umschreiben der Historie, prüft die benötigten Tools (`git`, `ssh-keygen`, `zip/unzip`), stellt die richtigen Berechtigungen sicher und erstellt sogar eine sichere Kopie des Schlüssels, falls die Dateisystemberechtigungen zu locker sind.

Das Skript ist idempotent: Es zweimal laufen zu lassen generiert deinen Schlüssel nicht neu und überschreibt die bestehende Config nicht.

## Schritt für Schritt

Hier einige wichtige Code-Auszüge mit ihren Erklärungen.

```bash
#!/usr/bin/env bash
set -euo pipefail

# SSH-Commit-Signierung auf kontrollierte, repo-lokale Weise konfigurieren.
# - Schlüsseldateien werden in dem Verzeichnis erstellt, in dem dieses Skript gestartet wird.
# - Git-Config wird nur lokal für das aktuelle Repository geschrieben.
```

Der Kopf legt die Sicherheit fest und dokumentiert das Ziel. Das nächste Stück parst die CLI-Optionen (`--name`, `--email`, `--repo` usw.) mit einer `while [[ $# -gt 0 ]]; do case … esac done`-Schleife. Die Pflicht-Identitätsfelder werden später geprüft:

```bash
if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "Error: missing identity. Provide --name and --email." >&2
  exit 1
fi
```

Die Schlüsselerzeugung passiert in `$LAUNCH_DIR/.git-signing`. Wenn schon ein Schlüssel existiert, behält das Skript ihn so wie er ist; `--import-keys` erlaubt es, den Ordner aus einem ZIP zu füllen.

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

Nachdem geprüft wurde, dass der private Schlüssel nutzbar ist (`ssh-keygen -Y sign …`), schreibt das Skript eine `allowed_signers`-Datei mit dem öffentlichen Schlüssel und setzt die lokale Git-Config:

```bash
git -C "$REPO_DIR" config --local gpg.format ssh
git -C "$REPO_DIR" config --local user.signingkey "$RUNTIME_KEY_PATH"
git -C "$REPO_DIR" config --local gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS"
git -C "$REPO_DIR" config --local commit.gpgsign true
git -C "$REPO_DIR" config --local tag.gpgSign true
```

Wenn du das Umschreiben der Historie mit `--resign-all` anforderst, baut das Skript einen `git filter-branch`-Befehl, der die berechtigten Commits mit `-S` neu signiert. Es respektiert den Fork-Status, indem es optional Commits überspringt, die schon in `upstream` vorhanden sind.

Das Endergebnis zeigt den öffentlichen Schlüssel und die Anleitung, um ihn im **Signing-Key**-Bereich von GitHub hinzuzufügen, mit einem Testrezept.

## Warum seine Commits signieren?

Hier gebe ich zu, dass ich es nicht brauchte. Meine Repositories verlangen keine Herkunft für das, was ich veröffentliche, und ich nutze keine signierten Tags für Releases. Das "Warum" ist:

- weil ich konnte,
- weil es gut aussieht (hast du das Badge gesehen ?),
- weil es mir eine Ausrede gab, mit `git filter-branch` und der Shell zu experimentieren,
- und weil es ein weiteres "habe ich selbst gebaut" für den Blog ist.

Kurz gesagt, es war nur Angeberei, aber genau das liebe ich, wenn ich an meinen Tools bastle.

## Nutzungsbeispiele

```bash
# Ersteinrichtung im aktuellen Repository
chmod +x ./setup-ssh-signing.sh
./setup-ssh-signing.sh --name "Your Name" \
                       --email "you@example.com"

# Schlüssel für einen anderen Rechner exportieren
./setup-ssh-signing.sh --export-keys ./my-signing-keys.zip

# Schlüssel auf einem zweiten Rechner importieren
./setup-ssh-signing.sh --import-keys ./my-signing-keys.zip --repo ./my-repo \
                       --name "Your Name" --email "you@example.com"

# Historie umschreiben und pushen
./setup-ssh-signing.sh --repo ./my-repo --name "Your Name" --email "you@example.com" \
                       --resign-all --autostash --autopush --yes
```

## Letzte Gedanken

Dieses Skript bleibt ein kompaktes Hilfsprogramm, aber es trägt einige Prinzipien, zu denen ich stehe:

- kryptografische Schlüssel lokal und pro Repository halten,
- niemals die globale Config anfassen, außer du fragst danach,
- einen einfachen Import/Export und das Umschreiben der Historie liefern,
- und den ganzen Prozess in einem Blogartikel dokumentieren, um eine wiederverwendbare Spur zu behalten.

Wenn du Lust bekommst, deinen eigenen Commits Signaturen hinzuzufügen, probier es aus! Und wenn du nur wegen des Stils hier bist, ebenso. 😎
