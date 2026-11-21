---
title: "5 umgeleitete Möglichkeiten, GitHub Aktionen zu verwenden (und was es über Geheimnisse lernt)"
description: >-
  Ein CI-Runner als kostenloser VPS, ein Bot der eigene Pull Requests oeffnet, npm-Publish ohne Secrets.
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "bXfIiUWJu/kZn/6LqCUqIzosLprJHrytq4RCGctpsEEc2rnkuN/CBhFUyVEa65pnULTy2majbFopO6tZ190uwA=="
---
# 

GitHub Aktionen, auf dem Papier, ist es für klassisches CI/CD gemacht: du push, es lint, es testet, es wirkt. Ich habe bereits einen bestimmten Fall geschrieben (Git-Tags als Datenbank für einen E-Mail-Bot verwenden, den dedizierten Artikel sehen). Aber durch Ausprobieren in meinen eigenen Ruhen gibt es genug verschiedene Pattern, damit es einen eigenen Artikel wert ist, weniger auf ein einzelnes Projekt konzentriert, mehr Katalog von Techniken.

Fünf Anwendungen, von klassischer bis zu verdrehter.

## 1. Ein Tag git als anhaltender Zustand zwischen zwei Runs

Schnelle Erinnerung, die vollständige Detail ist im Artikel über`email-autoreply`GitHub Aktionen ist stateless nach Design: jeder Teil einer leeren Maschine. Die Umleitung: speicherst du einen Wert (ID, Timestamp, einen kleinen Zustand) in einem dedizierten Git-Tag, nie in einem Zweig.
```bash
# Status lesen
git show refs/tags/lastid:data/lastId > data/lastId

# Status schreiben (verwaiste Branche, ein Commit, Push-Kraft)
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```
Der Schlüsselpunkt: ein verwaister Zweig, um nie Geschichte zu sammeln, und ein erzwungener Tag anstatt ein Zweig, die Liste der Zweige der repo nicht zu verschmutzen.

## 2. Ein Tag git als vorkompilierter Build-Cache

Die gleiche Idee, andere Verwendung: Statt einen Anwendungszustand zu speichern, speichert man ein **artefact de build**.`build`kompiliert den Code einmal (auf Push-`master`), dann wächst`dist/` + `node_modules/`in einem Tag`runtime`Der Job`cron`, er, checkout direkt dieses Tag statt drehen`bun install && bun run build`bei jeder Vollstreckung:
```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# Keine Installation, kein Build – der Code ist bereits fertig
- run: node dist/index.js --action
```
Das ändert den Run von ~20s auf ~10s. Auf einem Cron, der sich oft dreht, zählt das.`actions/cache`macht eine ähnliche Arbeit (Abhängigkeits-Cache), aber ein Git-Tag ist direkter, wenn du einen reproduzierten Artefakt festlegen und explizit zeigen wollen, anstatt einfach eine`npm install` .

## 3. Nur ein obligatorischer Check, der mehrere Jobs fängt

Kleine Pattern, die nichts sehen, aber das Leben in eine geschützte Zweigkonfiguration verwandeln.`konosuba-rpg`, hat die IC drei unabhängige Jobs (`typecheck` , `lint` , `tests`) die parallel laufen, und ein vierter Job,`test-battery`, die nichts anderes als abhängig von den ersten drei tun:
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
Ohne diesen Frontjob würde die Einrichtung eines geschützten Zweiges verlangen, drei separate obligatorische Checks zu markieren und diese Liste jedes Mal zu aktualisieren, wenn ein Job hinzugefügt oder umbenannt wird.`test-battery`, nur ein Name, der in den Repo-Einstellungen angekreuzt werden kann, der stabil bleibt, auch wenn sich das interne Detail ändert.

## 4. Umwandeln du einen kostenlosen Runner in temporäre VPS

Das ist das sauerste aller, und klar mein Lieblings-:`repo-to-vps`Umgeleitet die geplante Nutzung eines GitHub-Tracks vollständig, um es zu einem kostenlosen SSH-basierten Linux-Maschinen-Runner für bis zu 6 Stunden (maximale Arbeitsbelastung) zu machen.

Das Prinzip: Ein Job, der fast nichts anderes tut als zu starten [tmate](https://tmate.io/)(ein tmux fork, der eine gemeinsame Endstation über SSH oder Browser zeigt):
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
Das wahre Rätsel ist, dass das System eines GitHub Actions Runners **jetzt** ist: sobald der Job beendet ist, verschwindet alles. Eine stundenlange SSH-Sitzung ist nutzlos, wenn alles, was du dort tust, beim nächsten Run verdampft. Die Lösung: ein Git-Zweig, der als Live-Snapshot der Dateisystem-Snackshot dient, kontinuierlich synchronisiert.

Das Skript`start-tmate.sh`in der Reihenfolge:

1. **Restaure** das filesystem aus einem bestimmten Zweig`filesystem`beim Start des Jobs (`git reset –hard`ug über die Haut).
2. **Überwachen** Änderungen von Dateien mit`inotifywait`kontinuierlich und **commit + Push sofort** sobald sich eine Datei bewegt:
```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1   # debounce
  done
}
```
3. Jede Sicherung ** Geldbuße** die vorherige Commit statt die Schaffung eines neuen (`git commit –amend –no-edit`), so der`filesystem`bleibt immer bei einem einzigen Commit, wodurch die Anhäufung von Tausenden von Snapshots vermieden wird.
4. Eine Schleife`while true`Erholung`tmate`automatisch, wenn die Sitzung stirbt, mit`remain-on-exit on`so dass das Terminal auch nach einem`exit` .
5. Die von tmate generierte SSH-URL wird in eine Datei geschrieben.`host.conf`, auf den Zweig gesetzt`filesystem`, so dass über die GitHub API (`gh api .../contents/host.conf`) ohne jemals Live-Live-Webseiten des Jobs zu erhalten.
6. Eine Routine`periodic_save`dreht alle 5 Sekunden bei Hintergrundarbeit, falls`inotifywait`- Das würde ein Ereignis verpassen.

Ergebnis: Eine komplette Linux-Shell, die von überall aus zugänglich ist, mit einem zwischen den Sitzungen bestehenden Dateisystem, während die zugrunde liegende Infrastruktur (ein GitHub Action-Runner) dafür absolut nicht entwickelt wurde. Die einzige wirkliche Grenze ist die 6-Stunden-Zeit pro Job: Nach der Neubelebung des Workflows.

## 5. Ein Bot, der seine eigenen Pullover öffnet

Über`konosuba-rpg`, ein Push auf dem Zweig`dev`löst einen Job aus, der prüft, ob bereits ein Pullover geöffnet ist`main`, und erstellt eine automatisch, wenn nicht, über`actions/github-script`und die REST GitHub API:
```js
const { data: comparison } = await github.rest.repos.compareCommits({
  owner, repo, base: 'main', head: 'dev',
});
if (comparison.ahead_by === 0) return; // nichts zu bieten

const { data: existing } = await github.rest.pulls.list({
  owner, repo, state: 'open', head: `${owner}:dev`, base: 'main',
});
if (existing.length > 0) return; // bereits eine offene PR

await github.rest.pulls.create({
  owner, repo, head: 'dev', base: 'main',
  title: 'chore: auto PR from dev to main',
});
```
Das Detail, das hier zählt, ist das verwendete Token. Dieser Workflow wird nicht **nicht** des`GITHUB_TOKEN`automatisch: es erfordert ein Geheimnis`AUTO_PR_TOKEN`getrennt und weigert sich, weiterzumachen, wenn er abwesend ist:
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
## 6. Publizieren auf npm ohne Geheimnis

Die diskretsten der fünf, aber wahrscheinlich die wichtigste für die Zukunft: der Workflow`publish.yml`von`typescript-virtual-container`enthält keine ** npm** Geheimnisse.`NPM_TOKEN`keine`NODE_AUTH_TOKEN`- Nur das:
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
`npm publish`, weil das npm-Register nun **trusted publishing** über IDC unterstützt: Der Workflow beweist seine Identität direkt im Register (repo + workflows genau, konfiguriert auf der Seite nmpmjs.org), ohne dass statische Tokens irgendwo durchlaufen oder gespeichert werden. Null Geheimnis zu entfliehen, Null token, alle sechs Monate drehen zu lassen.

---

## Die Geheimnisse GitHub, tief in der Tiefe

Diese fünf Patterns berühren alle auf irgendeine Weise die Frage der Geheimnisse. Einige Prinzipien, die überall in meinen Workflows wiederkehren:

**Ein Geheimnis ist nicht unbedingt eine einfache Kette.** In`email-autoreply` , `ACCOUNTS_JSON`enthält den gesamten JSON-Minified-Konfig der Multi-Account-Konfiguration: eine vollständige Datenstruktur anstatt einen einfachen API-Schlüssel, in eine Datei in der Runtime eingespritzt:
```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```
Es verhindert, dass man eine Konfigdatei einbetten muss, selbst verschlüsselt, und es wird mit einem Klick in den Repo-Settings aktualisiert, ohne den Code zu berühren.

** `GITHUB_TOKEN`hat genaue Grenzen, und es ist gewollt.** Der automatische Token, den GitHub jedem Run spritzen kann, ist leistungsstark, aber an einigen Punkten versiegelt: standardmäßig kann es keinen anderen Workflow auslösen, und je nach Konfiguration der repo kann es durch Zweigschutzregeln blockiert werden.`create-pull-request.yml`ein PAT (`AUTO_PR_TOKEN`) getrennt: ein Token, der von einem echten Konto (oder einer GitHub App) mit expliziten Rechten kommt`contents:write` + `pull-requests:write`, getrennt vom kurzen Token des Jobs.

**Die Berechtigungen stöbern sich Job für Job, nicht global.** Jeder Workflow, den ich hier aufgeführt habe, erklärt einen Block`permissions:`minimal und kommentiert:
```yaml
permissions:
  contents: read
  actions: read
  checks: write
  # Only allow writing checks, everything else is read-only
```
Das`GITHUB_TOKEN`Standard hat historisch recht umfangreiche Rechte auf eine öffentliche repo; es ausdrücklich auf das zu beschränken, was der Job wirklich braucht begrenzt den Schaden, wenn eine Drittaktion in der Kette (`uses: quelqu-un/action@version`) erweist sich als gefährdet.

**Das beste Geheimnis ist das, das nicht existiert.** Das IDC-Pattern von`typescript-virtual-container`ist die erfolgreichste Version dieser Idee: statt die Rotation, Ausatmung und Gefahr der Flucht eines`NPM_TOKEN`, der Workflow beweist krypto-identität (dieser genaue repo, dieser genaue Workflow) direkt im Drittanbieterservice. Gleiche Logik für AWS, Docker Hub, PyPI: Immer mehr Register und Clouds unterstützen OIDC von GitHub Aktionen.

---

**3 Schlüsselpunkte**

1. Ein Git-Tag (Waise, Pushé-Kraft) kann als minimalistische Datenbank oder als vorkompilierte Build-Cache dienen: zwei verschiedene Anwendungen desselben Mechanismus.
2. Ein GitHub-Runner Gratis-Aktionen kann zu einem persistenten SSH-Shell werden, wenn man akzeptiert, dass seine Datei kontinuierlich auf einen Git-Zweig mit Autosave-`inotifywait`und nur ein Commit geändert.
3. Das`GITHUB_TOKEN`Standard ist freiwillig begrenzt: Erstellen du branchenübergreifende PRs oder veröffentlichen du ohne Geheimnis entweder ein spezielles PAT oder einen Übergang zum IDC trusted publishing.
