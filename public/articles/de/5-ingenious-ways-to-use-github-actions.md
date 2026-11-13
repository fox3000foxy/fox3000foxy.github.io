---
title: "5 zweckentfremdete Arten, GitHub Actions zu nutzen (und was das über Secrets lehrt)"
description: "Ein CI-Runner verwandelt in einen gratis VPS, ein Bot, der seine eigenen Pull Requests öffnet, ein npm-Publish ohne das kleinste Secret. Tour durch meine Repos, um die GitHub-Actions-Patterns zu listen, die aus simplem \"lint + test + deploy\" ausbrechen."
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "E5HeEEazszzTLJHOk3wn1OYE++Rb8K7Uw26zuq2zP9QtDf+lJS4SzvvwbyB2TStSCS1TDPxZieu0KP+XOYxsNA=="
---

# 5 zweckentfremdete Arten, GitHub Actions zu nutzen

GitHub Actions, auf dem Papier, ist für klassisches CI/CD gemacht: Du pushst, es lintet, es testet, es deployed. Ich habe schon über einen besonderen Fall geschrieben (Git-Tags als Datenbank für einen Mailbot nutzen, siehe den dedizierten Artikel). Aber beim Stöbern in meinen eigenen Repos gibt es genug unterschiedliche Patterns, um einen eigenen Artikel zu rechtfertigen, weniger auf ein einzelnes Projekt zentriert, mehr Technikkatalog.

Fünf Nutzungen, von der klassischsten bis zur verdrehtesten.

## 1. Ein Git-Tag als persistenter Zustand zwischen zwei Runs

Kurze Erinnerung, das komplette Detail steht im Artikel über `email-autoreply`. GitHub Actions ist by Design stateless: Jeder Run startet auf einer jungfräulichen Maschine. Der Workaround: Einen Wert speichern (eine ID, einen Timestamp, irgendeinen kleinen Zustand) in einem dedizierten Git-Tag, niemals in einem Branch.

```bash
# Zustand lesen
git show refs/tags/lastid:data/lastId > data/lastId

# Zustand schreiben (verwaister Branch, ein einziger Commit, Force-Push des Tags)
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```

Der springende Punkt: Ein verwaister Branch, um niemals Historie anzuhäufen, und ein forcierter Tag statt eines Branches, um die Branchliste des Repos nicht zu verschmutzen.

## 2. Ein Git-Tag als vorkompilierter Build-Cache

Gleiche Ideenfamilie, andere Nutzung: Statt eines Applikationszustands speichert man ein **Build-Artefakt**. Der `build`-Job kompiliert den Code einmal (bei Push auf `master`) und pusht dann `dist/` + `node_modules/` in einen `runtime`-Tag. Der `cron`-Job dagegen checkt direkt diesen Tag aus, statt bei jeder Ausführung `bun install && bun run build` laufen zu lassen:

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# kein Install, kein Build, der Code ist schon bereit
- run: node dist/index.js --action
```

Das ändert den Run von ~20s auf ~10s. Bei einem Cron, der oft läuft, zählt das. `actions/cache` macht eine ähnliche Arbeit (Abhängigkeiten cachen), aber ein Git-Tag ist direkter, wenn du gleich ein versioniertes Artefakt einfrieren und explizit darauf zeigen willst, statt einfach ein `npm install` zu beschleunigen.

## 3. Ein einziger Pflicht-Check, der mehrere Jobs aggregiert

Kleines Pattern, das nach nichts aussieht, aber das Leben in der Protected-Branch-Konfiguration ändert. Auf `konosuba-rpg` hat die CI drei unabhängige Jobs (`typecheck`, `lint`, `tests`), die parallel laufen, und einen vierten Job, `test-battery`, der nichts anderes tut, als von den ersten drei abzuhängen:

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

Ohne diesen Fassaden-Job würde das Konfigurieren eines Protected Branches erfordern, drei separate Pflicht-Checks anzukreuzen und diese Liste jedes Mal zu aktualisieren, wenn ein Job hinzugefügt oder umbenannt wird. Mit `test-battery` ein einziger anzukreuzender Name in den Repo-Einstellungen, der stabil bleibt, selbst wenn das interne Detail sich ändert.

## 4. Einen gratis Runner in einen temporären VPS verwandeln

Der ist der verdrehteste von allen und klar mein Favorit: `repo-to-vps` entfremdet die vorgesehene Nutzung eines GitHub-Actions-Runners komplett, um daraus eine per SSH erreichbare Linux-Maschine zu machen, gratis, für bis zu 6 Stunden (das Job-Maximum).

Das Prinzip: Ein Job, der fast nichts anderes tut, als [tmate](https://tmate.io/) zu starten (ein tmux-Fork, der eine per SSH oder Browser teilbare Terminalsession exponiert):

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

Der echte Knackpunkt ist, dass das Dateisystem eines GitHub-Actions-Runners **wegwerfbar** ist: Sobald der Job endet, verschwindet alles. Eine SSH-Session, die Stunden dauert, nützt nichts, wenn alles, was du darin tust, beim nächsten Run verdunstet. Die Lösung: Ein Git-Branch, der als Live-Snapshot des Dateisystems dient, kontinuierlich synchronisiert.

Das Skript `start-tmate.sh` macht der Reihe nach:

1. **Stellt** beim Jobstart das Dateisystem aus einem dedizierten `filesystem`-Branch wieder her (`git reset --hard` darauf).
2. **Überwacht** Dateiänderungen kontinuierlich mit `inotifywait` und **committet + pusht sofort**, sobald sich eine Datei bewegt:

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1   # debounce
  done
}
```

3. Jede Sicherung **amendiert** den vorherigen Commit, statt einen neuen zu erstellen (`git commit --amend --no-edit`), also bleibt der `filesystem`-Branch immer bei einem einzigen Commit, was die Anhäufung Tausender Snapshots vermeidet.
4. Eine `while true`-Schleife startet `tmate` automatisch neu, wenn die Session stirbt, mit `remain-on-exit on`, damit das Terminal selbst nach einem `exit` erreichbar bleibt.
5. Die von tmate generierte SSH-URL wird in eine Datei `host.conf` geschrieben, auf den `filesystem`-Branch committet, also via GitHub-API abrufbar (`gh api .../contents/host.conf`), ohne je live Zugriff auf die Joblogs gehabt zu haben.
6. Eine `periodic_save`-Routine läuft alle 5 Sekunden im Hintergrund, falls `inotifywait` ein Event verpassen sollte.

Ergebnis: Eine komplette Linux-Shell, von überall erreichbar, mit einem Dateisystem, das zwischen Sessions persistiert, während die darunterliegende Infrastruktur (ein GitHub-Actions-Runner) absolut nicht dafür entworfen wurde. Die einzige echte Grenze ist das 6h-Timeout pro Job: Danach muss man den Workflow neu starten.

## 5. Ein Bot, der seine eigenen Pull Requests öffnet

Auf `konosuba-rpg` löst ein Push auf den `dev`-Branch einen Job aus, der prüft, ob schon ein offener Pull Request nach `main` existiert, und sonst automatisch einen erstellt, via `actions/github-script` und GitHub-REST-API:

```js
const { data: comparison } = await github.rest.repos.compareCommits({
  owner, repo, base: 'main', head: 'dev',
});
if (comparison.ahead_by === 0) return; // nichts vorzuschlagen

const { data: existing } = await github.rest.pulls.list({
  owner, repo, state: 'open', head: `${owner}:dev`, base: 'main',
});
if (existing.length > 0) return; // schon ein offener PR

await github.rest.pulls.create({
  owner, repo, head: 'dev', base: 'main',
  title: 'chore: auto PR from dev to main',
});
```

Das Detail, das hier zählt, ist der genutzte Token. Dieser Workflow nutzt **nicht** den automatischen `GITHUB_TOKEN`: Er verlangt ein separates `AUTO_PR_TOKEN`-Secret und weigert sich weiterzumachen, wenn es fehlt:

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

## 6. Auf npm publizieren ohne ein einziges Secret

Der diskreteste der fünf, aber wahrscheinlich der wichtigste für die Zukunft: Der `publish.yml`-Workflow von `typescript-virtual-container` enthält **kein npm-Secret**. Kein `NPM_TOKEN`, kein `NODE_AUTH_TOKEN`. Nur das:

```yaml
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

`npm publish` funktioniert trotzdem, weil die npm-Registry inzwischen **Trusted Publishing** via OIDC unterstützt: Der Workflow beweist seine Identität direkt bei der Registry (exaktes Repo + exakter Workflow, konfiguriert auf npmjs.org-Seite), ohne dass irgendein statischer Token transitiert oder irgendwo gespeichert wird. Null Secrets zum Leaken, null Tokens zum alle sechs Monate rotieren.

---

## Die GitHub-Secrets, in der Tiefe

Diese fünf Patterns berühren alle auf die eine oder andere Art die Secret-Frage. Einige Prinzipien, die überall in meinen Workflows wiederkehren:

**Ein Secret ist nicht unbedingt eine simple Zeichenkette.** In `email-autoreply` enthält `ACCOUNTS_JSON` das gesamte minifizierte JSON der Multi-Account-Config: Eine komplette Datenstruktur statt eines simplen API-Schlüssels, zur Runtime so wie sie ist in eine Datei injiziert:

```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

Das vermeidet, eine Config-Datei committen zu müssen, selbst verschlüsselt, und es aktualisiert sich mit einem Klick in den Repo-Settings, ohne den Code anzufassen.

**`GITHUB_TOKEN` hat präzise Grenzen, und das ist gewollt.** Der automatische Token, den GitHub bei jedem Run injiziert, ist mächtig, aber an manchen Punkten versiegelt: Standardmäßig kann er keinen anderen Workflow triggern, und je nach Repo-Konfiguration kann er von Branch-Protection-Regeln blockiert werden. Genau deshalb verlangt `create-pull-request.yml` einen separaten PAT (`AUTO_PR_TOKEN`): Einen Token, der von einem echten Konto (oder einer GitHub App) kommt, mit expliziten `contents:write` + `pull-requests:write`-Rechten, getrennt vom ephemeren Job-Token.

**Berechtigungen werden Job für Job gescopet, nicht global.** Jeder Workflow, den ich hier gelistet habe, deklariert einen minimalen kommentierten `permissions:`-Block:

```yaml
permissions:
  contents: read
  actions: read
  checks: write
  # Only allow writing checks, everything else is read-only
```

Der standardmäßige `GITHUB_TOKEN` hat historisch ziemlich breite Rechte auf einem öffentlichen Repo; ihn explizit auf das zu beschränken, was der Job wirklich braucht, begrenzt den Schaden, falls sich eine Drittanbieter-Action in der Kette (`uses: irgend-wer/action@version`) als kompromittiert erweist.

**Das beste Secret ist das, das nicht existiert.** Das OIDC-Pattern von `typescript-virtual-container` ist die ausgereifteste Version dieser Idee: Statt Rotation, Ablauf und Leak-Risiko eines `NPM_TOKEN` zu verwalten, beweist der Workflow seine Identität kryptografisch (genau dieses Repo, genau dieser Workflow) direkt beim Drittdienst. Dieselbe Logik verfügbar für AWS, Docker Hub, PyPI: Immer mehr Registries und Clouds unterstützen OIDC von GitHub Actions.

---

**3 Kernpunkte**

1. Ein Git-Tag (verwaist, force-gepusht) kann als minimalistische Datenbank oder als vorkompilierter Build-Cache dienen: Zwei unterschiedliche Nutzungen desselben Mechanismus.
2. Ein gratis GitHub-Actions-Runner kann zu einer persistenten SSH-Shell werden, wenn man akzeptiert, sein Dateisystem kontinuierlich auf einen Git-Branch zu synchronisieren, mit Autosave per `inotifywait` und einem einzigen amendierten Commit.
3. Der standardmäßige `GITHUB_TOKEN` ist bewusst begrenzt: PRs zwischen Branches erstellen oder ohne Secret publizieren verlangt entweder einen dedizierten PAT oder einen Wechsel zu OIDC-Trusted-Publishing.
