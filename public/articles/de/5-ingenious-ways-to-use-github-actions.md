---
title: "5 raffinierte Arten, GitHub Actions zu nutzen (und was sie über Secrets lehren)"
description: "Ein CI-Runner als kostenloser VPS, ein Bot der seine eigenen Pull-Requests öffnet, ein npm-Publish ohne jedes Secret. Ein Streifzug durch meine Repos als Katalog von GitHub-Actions-Patterns jenseits von \"lint + test + deploy\"."
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "vv0/CYHq5629uzfs8zwvPOSSV2D4B6Dv9r5I+do+aJB0ZPGAHghAu/WHeKhSGPZTDZiwp7geVYSVAgv6tKDp4Q=="
---

# 5 raffinierte Arten, GitHub Actions zu nutzen

Auf dem Papier ist GitHub Actions für klassisches CI/CD da: du pushst, es lintet, testet, deployed. Ich hab schon über einen Spezialfall geschrieben -- git-Tags als Datenbank für einen E-Mail-Bot nutzen (siehe den eigenen Artikel). Aber beim Durchforsten meiner eigenen Repos sind genug verschiedene Patterns zusammengekommen, dass es einen eigenen Artikel wert ist -- weniger auf ein einzelnes Projekt fokussiert, mehr ein Technik-Katalog.

Fünf Dinger, vom Klassischsten bis zum Abgefahrensten.

## 1. Ein git-Tag als persistenter Zustand zwischen Runs

Kurze Wiederholung, die Details stehen im `email-autoreply`-Artikel. GitHub Actions ist per Design zustandslos -- jeder Run startet auf einer jungfräulichen Maschine. Der Workaround: einen Wert (eine ID, einen Timestamp, jedes kleine Stück Zustand) in einem dedizierten git-Tag speichern, nie in einem Branch.

```bash
# Zustand lesen
git show refs/tags/lastid:data/lastId > data/lastId

# Zustand schreiben (orphan branch, ein Commit, Tag force-pushen)
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```

Der Knackpunkt: ein Orphan-Branch, um niemals History anzusammeln, und ein forced Tag statt eines Branches, um die Branch-Liste des Repos nicht zuzumüllen.

## 2. Ein git-Tag als vorkompilierter Build-Cache

Gleiche Ideenfamilie, andere Nutzung: statt Applikationszustand speichert man ein **Build-Artefakt**. Der `build`-Job kompiliert den Code einmal (beim Push auf `master`) und pusht `dist/` + `node_modules/` in einen `runtime`-Tag. Der `cron`-Job checkt diesen Tag direkt aus, statt bei jeder Ausführung `bun install && bun run build` durchlaufen zu lassen:

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# kein install, kein build -- der Code ist fertig
- run: node dist/index.js --action
```

Das bringt den Run von ~20s auf ~10s. Bei einem Cron, der oft läuft, macht das was aus. `actions/cache` macht was Ähnliches (Abhängigkeiten cachen), aber ein git-Tag ist direkter, wenn man ein versioniertes Artefakt komplett einfrieren und explizit referenzieren will -- nicht nur ein `npm install` beschleunigen.

## 3. Ein einziger Required Check, der mehrere Jobs bündelt

Ein kleines Pattern, das unscheinbar wirkt, aber die Branch-Protection-Konfiguration radikal vereinfacht. Bei `konosuba-rpg` hat die CI drei unabhängige Jobs (`typecheck`, `lint`, `tests`), die parallel laufen -- und einen vierten Job, `test-battery`, der nichts anderes tut, als von den ersten drei abzuhängen:

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

Ohne diesen Fassaden-Job müsste man beim Einrichten eines Protected Branches drei separate Checks anhaken -- und diese Liste jedes Mal aktualisieren, wenn ein Job hinzukommt oder umbenannt wird. Mit `test-battery` reicht ein einziger Name in den Repo-Settings, der stabil bleibt, auch wenn sich die internen Details ändern.

## 4. Einen kostenlosen Runner in eine temporäre VPS verwandeln

Das ist das abgefahrenste von allen und eindeutig mein Liebling: `repo-to-vps` zweckentfremdet einen GitHub-Actions-Runner komplett, um daraus eine Linux-Maschine zu machen, die per SSH erreichbar ist. Kostenlos. Bis zu 6 Stunden (die maximale Job-Dauer).

Das Prinzip: ein Job, der fast nichts anderes tut, als tmate zu starten:

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

Die echte Krux: Das Dateisystem eines GitHub-Actions-Runners ist **flüchtig** -- sobald der Job endet, ist alles weg. Eine SSH-Sitzung, die stundenlang läuft, bringt nix, wenn alles, was man tut, beim nächsten Run verdampft. Die Lösung: ein git-Branch, der als Live-Snapshot des Dateisystems dient, kontinuierlich synchronisiert.

Das `start-tmate.sh`-Skript macht, der Reihe nach:

1. **Stellt** das Dateisystem von einem dedizierten `filesystem`-Branch beim Job-Start wieder her (`git reset --hard` drauf).
2. **Überwacht** Dateiänderungen kontinuierlich mit `inotifywait` und **committet + pusht sofort**, sobald eine Datei sich bewegt:

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1
  done
}
```

3. Jede Speicherung **amendet** den vorherigen Commit, statt einen neuen zu erstellen (`git commit --amend --no-edit`), sodass der `filesystem`-Branch immer bei genau einem Commit bleibt -- keine Anhäufung von Tausenden Snapshots.
4. Eine `while true`-Schleife startet tmate automatisch neu, falls die Sitzung stirbt, mit `remain-on-exit on`, damit das Terminal auch nach einem `exit` erreichbar bleibt.
5. Die von tmate generierte SSH-URL wird in eine `host.conf`-Datei geschrieben, in den `filesystem`-Branch committet -- abrufbar über die GitHub-API (`gh api .../contents/host.conf`), ohne jemals Live-Zugriff auf die Job-Logs gehabt zu haben.
6. Eine `periodic_save`-Routine läuft alle 5 Sekunden im Hintergrund, falls `inotifywait` ein Event verpasst.

Ergebnis: eine vollständige Linux-Shell, von überall erreichbar, mit einem Dateisystem, das zwischen Sessions persistiert -- obwohl die zugrundeliegende Infrastruktur (ein GitHub-Actions-Runner) absolut nicht dafür gebaut wurde. Die einzige echte Grenze ist der 6-Stunden-Timeout pro Job -- danach muss man den Workflow neu starten.

## 5. Ein Bot, der seine eigenen Pull-Requests öffnet

Auf `konosuba-rpg` triggert ein Push auf den `dev`-Branch einen Job, der prüft, ob bereits ein offener PR nach `main` existiert -- und erstellt automatisch einen, falls nicht, via `actions/github-script` und der GitHub REST API:

```js
const { data: comparison } = await github.rest.repos.compareCommits({
  owner, repo, base: 'main', head: 'dev',
});
if (comparison.ahead_by === 0) return;

const { data: existing } = await github.rest.pulls.list({
  owner, repo, state: 'open', head: `${owner}:dev`, base: 'main',
});
if (existing.length > 0) return;

await github.rest.pulls.create({
  owner, repo, head: 'dev', base: 'main',
  title: 'chore: auto PR from dev to main',
});
```

Das entscheidende Detail hier ist das verwendete Token. Dieser Workflow nutzt **nicht** das automatische `GITHUB_TOKEN` -- er verlangt ein separates `AUTO_PR_TOKEN`-Secret und weigert sich weiterzumachen, wenn es fehlt:

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

## 6. Auf npm publishen ohne jedes Secret

Das leiseste der fünf, aber wahrscheinlich das wichtigste für die Zukunft: der `publish.yml`-Workflow von `typescript-virtual-container` enthält **keine npm-Secrets**. Kein `NPM_TOKEN`, kein `NODE_AUTH_TOKEN`. Nur das:

```yaml
permissions:
  id-token: write
  contents: read
jobs:
  publish:
    steps:
      - uses: actions/setup-node@v6
        with:
          registry-url: 'https://registry.npmjs.org'
      - run: npm publish
```

`npm publish` funktioniert trotzdem, weil die npm-Registry jetzt **Trusted Publishing** via OIDC unterstützt: der Workflow weist seine Identität direkt gegenüber der Registry nach (exaktes Repo + exakter Workflow, auf npmjs.org-Seite konfiguriert), ohne dass irgendein statisches Token übertragen oder gespeichert wird. Null Secrets, die leaken könnten, null Tokens, die man alle sechs Monate rotieren muss.

---

## GitHub Secrets, in der Tiefe

Diese fünf Patterns berühren alle auf die eine oder andere Weise die Frage der Secrets. Ein paar Prinzipien, die sich durch all meine Workflows ziehen:

**Ein Secret ist nicht unbedingt ein einfacher String.** Bei `email-autoreply` enthält `ACCOUNTS_JSON` das gesamte minifizierte JSON der Multi-Account-Konfiguration -- nicht nur ein API-Key, eine komplette Datenstruktur, zur Laufzeit eins-zu-eins in eine Datei injiziert:

```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

Das vermeidet, eine Config-Datei committen zu müssen, selbst verschlüsselt, und lässt sich mit einem Klick in den Repo-Settings aktualisieren, ohne den Code anzufassen.

**`GITHUB_TOKEN` hat präzise Grenzen, und das ist Absicht.** Das automatische Token, das GitHub bei jedem Run injiziert, ist mächtig, aber an bestimmten Punkten versiegelt: standardmäßig kann es keinen anderen Workflow triggern, und je nach Repo-Konfiguration kann es von Branch-Protection-Regeln blockiert werden. Genau deshalb verlangt `create-pull-request.yml` ein separates PAT (`AUTO_PR_TOKEN`) -- ein Token von einem echten Account (oder einer GitHub App), mit expliziten `contents:write` + `pull-requests:write`-Rechten, getrennt vom ephemeren Token des Jobs.

**Berechtigungen werden Job für Job gescoped, nicht global.** Jeder Workflow, den ich hier aufgelistet habe, deklariert einen minimalen, kommentierten `permissions:`-Block:

```yaml
permissions:
  contents: read
  actions: read
  checks: write
```

Das standardmäßige `GITHUB_TOKEN` hat historisch ziemlich breite Rechte auf einem öffentlichen Repo; es explizit auf das einzuschränken, was der Job tatsächlich braucht, begrenzt den Schaden, falls eine Drittanbieter-Action in der Kette kompromittiert wird.

**Das beste Secret ist das, das nicht existiert.** Das OIDC-Pattern von `typescript-virtual-container` ist die vollendetste Version dieser Idee: statt Rotation, Ablauf und Leak-Risiko eines `NPM_TOKEN` zu managen, weist der Workflow kryptografisch seine Identität (dieses exakte Repo, dieser exakte Workflow) direkt gegenüber dem Drittdienst nach. Gleiche Logik verfügbar für AWS, Docker Hub, PyPI -- immer mehr Registries und Clouds unterstützen OIDC von GitHub Actions aus.

---

**3 Kernpunkte**

1. Ein git-Tag (orphan, force-pushed) kann als minimalist Datenbank oder vorkompilierter Build-Cache dienen -- zwei unterschiedliche Nutzungen desselben Mechanismus.
2. Ein kostenloser GitHub-Actions-Runner kann zu einer persistenten SSH-Shell werden, wenn man akzeptiert, sein Dateisystem kontinuierlich via `inotifywait` in einen git-Branch zu synchronisieren, mit einem einzigen amendeten Commit.
3. Das standardmäßige `GITHUB_TOKEN` ist absichtlich limitiert -- branchübergreifende PRs zu erstellen oder ohne Secrets zu publishen erfordert entweder ein dediziertes PAT oder den Umstieg auf OIDC Trusted Publishing.
