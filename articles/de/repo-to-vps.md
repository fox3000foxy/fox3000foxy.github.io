---
title: "Repo to VPS: Umwandeln GitHub Aktionen in VPS kostenlos mit Persistent-Speicher"
description: "Wie man einen GitHub-Runner in einen permanenten VPS mit Git als permanente Speicherung umwandelt – tmate, inotify und commit –amend."
date: 2026-05-29
tags:
  - github
  - devops
  - automation
authors:
  - fox3000foxy
lang: "de"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "Sq0hK0C8do0EIJx7f6olgoetQXTcL0ousPEGcD75UChrISL+NBcQ4ATDD1MYLSyqx3AzlOwy0Q1ByY7qCeUMug=="
---
## 

GitHub Aktionen gibt dir kostenlose Linux-Maschinen.

So wie echte Ubuntu-Server. 2 Kerne, 7 GB RAM, 14 GB Festplatte. Frei. 6 Stunden lang pro Run.

Das einzige Problem: Am Ende des Runs ist alles gelöscht, die Maschine ist wegweisend, du installierst Pakete, kodiert, konfiguriert und am Ende verschwindest alles.

Es sei denn, es ist so.

Es sei denn, du benutzt **git als Festplatte**.

Und dann hast du plötzlich ein kostenloses VPS mit einer persistenten Festplatte, die die Runs überlebt.

Ich erklär's dir.

---

## Der Kontext: die Runner GitHub Aktionen

Wenn du einen GitHub Action Workflow startest, gibt Github dir eine VM.

Es ist für den Build deines Codes, für die Tests, für den Deploy, für das Workflow, für seine Arbeit und die Maschine ist zerstört.

Aber nichts hindert dich daran, mit dieser VM etwas anderes zu tun, eine SSH-Shell aufzumachen und sie als Server zu benutzen.

Die Belastung besteht darin, dass diese Maschinen **stateless** und **temporär** sind:

- Temporär: max. 6 Stunden pro Run (`timeout-minutes: 360`, die GitHub-Obergrenze)

- Stateless: Alles wird am Ende gelöscht

Um ein verwendbares VPS zu machen, müssen zwei Probleme gelöst werden:

1. **Wie kann ich mich an Echtzeit anschließen?**

2. **Wie kann ich die Scheibe zwischen zwei Runs halten?**

Jetzt wird es ein schmutziger Hack.

---

## Problem 1: Das Live-SSH mit tmate

**tmate** ist ein tmux fork, der eine Sharing-SSH-Sitzung erstellt.

Du schießt ihn auf eine Maschine, er erzeugt dir zwei Links:

- eine SSH-URL (`ssh xxx@nyc1.tmate.io`)

- eine Web-URL (endgültig im Browser)

Du meldest dich mit einer dieser Verbindungen an und boomst, du bist in einer Shell auf der Maschine.

Der Workflow startet also tmate:
```bash
tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
tmate -S /tmp/tmate.sock set-option -g remain-on-exit on

# Verbindungsverbindungen zurückgewinnen
tmate_ssh=$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')
tmate_web=$(tmate -S /tmp/tmate.sock display -p '#{tmate_web}')
```
Und diese Links werden direkt in das README der Repo geschrieben, von einem Python-Skript. Du öffnest deine Repo, siehst die Verbindung, klickt.

Das erste Problem ist gelöst, aber das zweite ist wirklich verrückt.

---

## Problem 2: git als Festplatte

Das ist die Idee, die alles verändert.

Die Maschine wird bei jedem Run gelöscht. Also speichern wir ** das Dateisystem in einem speziellen Git-Zweig**, genannt`filesystem` .

Beim Start wird der Status von diesem Zweig wiederhergestellt:
```bash
filesystem_branch="filesystem"

# Wiederherstellt den Filesystem-Zweig aus dem remote
git fetch origin "$filesystem_branch":refs/remotes/origin/$filesystem_branch

# Restore den workspace von diesem Zweig
git checkout -B filesystem-workspace "refs/remotes/origin/$filesystem_branch"
git reset --hard "refs/remotes/origin/$filesystem_branch"
```
Der Zweig`filesystem`Deine Dateien, deine Installs, deine Konfektionen - alles ist drin.

Die Maschine ist einwegig, aber die Platte lebt in git. Du schaltest den Workflow wieder ein, die Chips sind wiederhergestellt, du holst den Stapel, wo du warst.

Es ist wie ein Winterschlaf-VPS, aber die Winterschlafzeit ist ein Repo-Git.

### Erstes Starten: Leere Festplatte erstellen

Der erste Run, der Zweig`filesystem`Es gibt noch keine.
```bash
ensure_filesystem_branch() {
  if ! git ls-remote --exit-code origin "refs/heads/$filesystem_branch" >/dev/null 2>&1; then
    git checkout --orphan filesystem-workspace
    git rm -rf --cached .
    git clean -fdx -e .git -e .github -e .github/scripts -e .github/workflows
    git commit --allow-empty -m "init filesystem (empty)"
    push_filesystem
  fi
}
```
Das`git checkout –orphan`Ein verwaister Zweig ist ein ** Zweig ohne jegliche Geschichte** – als würdest du von einer leeren Wiederholung zurückkehren.

Weil du nicht willst, dass deine Festplatte den gesamten Verlauf deines Quellcodes vertreibt, sondern die Festplatte isoliert bleibt, mit ihrem eigenen Leben.

Und das`git ls-remote –exit-code`Zuerst ist es nur ein eigener Check: "Ist der Zweig schon auf dem Remote vorhanden?" Wenn ja, dann berührt man nichts. Wenn nicht, dann erschafft man ihn. Gleichfalls, wie man es liebt.

### Die selektive git Clean: Schutz der Caches

Diese Linie verdient es, dass wir auf sie zu stoppen:
```bash
git clean -fdx -e .apt-cache -e .cache -e host.conf -e tmate.sock
```
`git clean -fdx`Es treibt alles, was nicht von Git getrunken wird. Normalerweise ist es gewalttätig - es reinigt den Workspace gründlich.

Aber die`-e`(ausschließlich) schützen bestimmte Dateien:

- `.apt-cache`→ APT-Pakete (Wir werden darauf zurückkommen, es ist clever)

- `.cache`→ Zwischenspeicher générique

- `host.conf`→ SSH-Adresse der Sitzung

- `tmate.sock`→ der Socket der laufenden tmate-Sitzung

Wenn du diese Dateien reinwaschen würdest, würdest du die aktive Sitzung brechen oder deinen Cache verlieren, also sparen wir sie beim Reset.

Ein blödes Detail auf den ersten Blick, aber ohne das ist alles scheiße.

---

## Autosave: inotify, die alles überwacht

Okay, aber wie Dateien in den Zweig gelangen`filesystem`?

Antwort: ein Watcher, der alle Dateiänderungen überwacht und automatisch commit/push.

Das magische Werkzeug ist **intifywait** (des Pakets`inotify-tools`). Es überwacht das filesystem auf der Ebene des Kernels und löst, sobald sich eine Datei ändert.
```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock|\.gitignore|\.txt\.swp)(/|$)' .; do
    echo "[autosave] change detected"
    commit_and_push
    sleep 1   # debounce si plein de changements d'un coup
  done
}

autosave &
```
Lässt du uns die inotify flags, weil jeder zählt:

- `-r`→ rekursiv, überwacht alle Unterordner

- `-e modify,create,delete,move`→ reagiert auf diese 4 Arten von Ereignissen

- `–exclude '...'`→ eine regex zum Überspringen bestimmter Dateien

Das`–exclude`Sieh mal, was er nicht weiß:

- `.git`→ Natürlich, sonst würde jeder Commit einen Autosave auslösen, der einen Commit auslösen würde... unendliche Schleife. Katastrophe.

- `.apt-cache`und`.cache`→ die Verstecke, die sich die ganze Zeit ändern und wir wollen nicht in git spammer

- `host.conf`und`tmate.sock`→ die Sitzungsdateien, die sich ständig bewegen

- `.gitignore` , `.txt.swp`→ temporäre Dateien (die`.swp`es ist die vim-Editordateien)

Ohne diesen Ausgeschlossenen würdest du dich mit einem Autosave wiederfinden, der sich in einer Schleife auf seine eigenen Veränderungen einstellt.`.git`In der Liste steht, dass du dich nicht erschießen lässt.

Du änderst eine Datei? inotify erkennt sie sofort, es commit, es push. In weniger als einer Sekunde ist deine Änderung im Zweig`filesystem` .

Du installierst ein Paket, schreibst Code, drückst ein Konfig - alles wird in Echtzeit gespeichert, automatisch, ohne dass du etwas tust.

Du hast buchstäblich ein automatisches Backup-System für die gesamte Festplatte.

### Der Debounce: kein Spammer git

Das`sleep 1`Nach jeder Save ist es ein **debunce**.

Wenn du eine Datei in einem Editor speichern, erzeugt sie oft mehrere filesystem-Events in Rafale (Erstellen einer temp-Datei, Rename, Löschen der alten...). Ohne Debounce würden du 3-4 Commits für eine einzige Sicherung auslösen.

Das`sleep 1`sagt: "Warte eine Sekunde nach einer Save, bis sich die Schläger beruhigen, bevor du wieder zuhörst." Das vereint die nahen Veränderungen in einem einzigen Commit.

### Und eine regelmäßige Sicherung zusätzlich

Falls Inotify ein Ereignis verpasst, gibt es auch eine Save alle 5 Sekunden:
```bash
periodic_save() {
  while true; do
    sync_from_remote   # récupère les changements distants éventuels
    sleep 5
    commit_and_push
  done
}

periodic_save &
```
Wir wollen nicht den Zustand der Scheibe verlieren.

---

## Das böse Detail: ein Commit

Wenn du bei jeder Dateiänderung spielst, sammle ich Tausende von Commits. In einer Stunde platzt dein Geschichte-Git. Die Repo wird riesig.

Die Lösung ist elegant: **Wir strafen den bestehenden Commit** anstatt einen neuen.
```bash
commit_and_push() {
  (
    flock -n 200 || return   # lock pour pas que deux saves tournent en même temps

    git add -A
    git reset -- .github/workflows/ .github/scripts/   # touche pas aux scripts

    if ! git diff --cached --quiet; then
      if git rev-parse --verify HEAD >/dev/null 2>&1; then
        git commit --amend --no-edit    # AMEND : écrase le commit précédent
      else
        git commit -m "autosave $(date -u +%Y%m%dT%H%M%SZ)"
      fi
      git push --force origin "filesystem-workspace:filesystem"
    fi
  ) 200>/tmp/tmate_autosave.lock
}
```
`git commit –amend`Das heißt: "Ersetze den letzten Befehl durch diesen."

Das ist der Zweig.`filesystem`Egal wie oft du speicherst, es ist nur ein Snapshot des aktuellen Zustandes, Kraft-pushed immer und immer wieder.

Das`flock`Es ist ein Schloss: da es zwei Save-Schleife (inotify + periodisch) gibt, müssen sie gleichzeitig git und darauf laufen vermeiden. Ein Prozess git auf einmal.

Sauber.

---

## Sync_from_remote: mehrere Sitzungen verwalten

Hier, ein Fall, an den du nicht am Anfang denkst: und wenn du ZWEI Runs gleichzeitig startest? Oder wenn eine Sitzung den Zweig ändert`filesystem`Während ein anderer dreht?

Das Skript verwaltet das mit einem`sync_from_remote`vor jedem Commit:
```bash
sync_from_remote() {
  git fetch origin "filesystem":refs/remotes/origin/filesystem
  git merge --ff-only "refs/remotes/origin/filesystem"
}
```
Das`–ff-only`(fast-forward only) das ist wichtig: Das bedeutet "NUR, wenn man richtig vorankommt, ohne einen Merge-Kommit zu erzeugen."

Wenn beide Zweige auseinandergingen (Genre, zwei Sitzungen haben verschiedene Dateien geändert), scheitert der Fast-Forward still (`2>/dev/null || true`Es ist kein perfektes Meerg-System, aber es verhindert Korruption, wenn nur eine Sitzung läuft.

Ehrlich gesagt, sollte man nicht drei parallele Sitzungen auf derselben Wiederholung starten, aber der Code versucht trotzdem nicht zu explodieren, wenn das passiert.

---

## APT-Cache: schnell installieren

Es gibt ein Detail im Workflow, das keine Mine zahlt, aber das gut durchdacht ist:
```yaml
- name: Cache & install APT packages (tmate + watcher)
  uses: awalsh128/cache-apt-pkgs-action@v1.6.0
  with:
    packages: tmate inotify-tools
```
tmate und inotify-tools werden über eine Aktion installiert, die **APT** Pakete verstecken.

Beim ersten Run laden und installierst du es. Auf den folgenden Runs wird es aus dem GitHub Action-Cache restauriert - schneller, nicht wieder herunterladen.

Und du erinnerst dich an den`git clean -fdx -e .apt-cache`- Es ist eine Verbindung.`.apt-cache`ist vor der Reinigung geschützt, damit die Pakete, die du während deiner Sitzung installierst, ein Minimum halten können.

Ich habe über den gesamten Lebenszyklus nachgedacht.

---

## Skripte in /tmp versteckt

Noch ein bösartiges, aber schlaues Detail.
```bash
RUNNER_SCRIPTS_DIR="/tmp/runner-scripts"
rm -rf "$RUNNER_SCRIPTS_DIR"
mkdir -p "$RUNNER_SCRIPTS_DIR"
cp -r .github/scripts "$RUNNER_SCRIPTS_DIR/"
```
Skripte (`update_readme.py`, etc.) werden in`/tmp`VOR dem Berühren des Zweiges`filesystem` .

- Weil, wenn du das machst.`git reset –hard`zum Zweig`filesystem`(das am Anfang leer ist oder die deine Festplatte enthält)`.github/scripts`rea source verschwinden aus dem workspace.

Aber das Skript braucht es noch während der Sitzung (um das README bei jeder tmate-Wiederaufnahme zu update).`/tmp`, außer Reichweite von git:
```bash
python3 "$RUNNER_SCRIPTS_DIR/scripts/update_readme.py" --ssh "$tmate_ssh" ...
```
Wenn du nicht darüber nachdenkst, versuchst du 30 Minuten damit zu verstehen, warum dein Drehbuch verschwunden ist.

---

## Die maßgeschneiderte Shell

Kleiner Komfort: Die Sitzung gibt dir eine konfigurierte Shell, kein nacktes Bash.

Das`prestart.sh`Kopieren eines`.bashrc`custom:
```bash
if ! grep -q "Custom prompt and aliases for remote sessions" "$HOME/.bashrc"; then
  cp .github/scripts/remote_bashrc "$HOME/.bashrc"
fi
sudo cp "$HOME/.bashrc" /root/.bashrc
```
Und das`.bashrc`enthält einen bunten Background, Alias (`ll` , `lla` , `rm -i`) und vor allem ein Überfluss von`exit`:
```bash
exit() {
    killall -9 -u "$(whoami)" tmate 2>/dev/null || true
    builtin exit "$@"
}

# Strg+D macht dasselbe wie exit
bind -x '"\C-d": "exit"'
```
Wenn du schlägst`exit`(oder Strg+D), es kill reint tmate Prozessen, bevor es geschlossen wird. Es vermeidet, Zombies tmateseses zu lassen.

Es gibt auch eine Funktion.`tmate-detach`wenn du dich OHNE Abmelden der Sitzung abmelden möchtest (um dich später wieder zu verbinden). Komfortdetails, aber es zeigt die Sorgfalt.

---

## Der blitzschnelle Schlag

Kleiner Komfort: Wenn du klopfst`exit`In deiner Shell stirbt die tmate-Sitzung normalerweise und du bist für immer abgeschaltet.

Nur, dass hier tmate in einer Schleife ist.`while true`:
```bash
while true; do
  tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
  while tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' >/dev/null 2>&1; do
    sleep 2
  done
  echo "tmate session ended; restarting..."
done
```
Du`exit`? Die Sitzung beginnt von selbst. Du meldest dich wieder mit dem gleichen Link.

Das ist dumm, aber es macht die Sitzung nutzbar.

---

## Wiederverbindung zu einem Befehl

Wie meldest du dich nach einer Deko wieder an, ohne jedes Mal in den Logs des Runs zu schauen?

Die SSH-Adresse von tmate wird in eine Datei geschrieben`host.conf`, in den Zweig eingegliedert`filesystem`:
```bash
printf '%s' "${tmate_ssh#ssh }" > host.conf
```
Und da diese Datei in git ist, kannst du sie über die GitHub API mit einem einzigen Befehl wiederherstellen:
```bash
ssh "$(gh api -H 'Accept: application/vnd.github.v3.raw' \
  "/repos/USER/REPO/contents/host.conf?ref=filesystem" | tr -d '\r\n')"
```
Du startest das, hol die aktuelle SSH-Adresse in der Repo und melde dich an, auch wenn die Adresse zwischen zwei Sitzungen geändert wurde.

---

## Der vollständige Flow

Lässt du uns zusammenfassen:

1. Du startest den Workflow (Push oder manuelle Schaltfläche)
2. GitHub gibt dir eine Ubuntu-VM
3. Das Skript stellt die Festplatte vom Zweig "filesystem" aus wieder her
4. Inotify beginnt, alle Änderungen zu überwachen
5. periodic_save commit alle 5s in backup
6. tmate startet → erzeugt SSH/web-Links
7. Links sind in README + host.conf geschrieben
8. Du meldest dich mit ssh oder dem Web-Terminal an
9. Du tust, was du willst – jede Dateiänderung = autosave
10. 6 Stunden später tötet GitHub die VM
11. Deine Festplatte ist intakt im Filesystem-Zweig.
12. Du rufst den Workflow wieder an → zurück zu Schritt 3, alles ist noch da

Ein kostenloses VPS mit persistenter Festplatte. Nur mit Git und GitHub Aktionen.

---

## Also, wir müssen ehrlich sein: die Grenzen

Das ist ein Hack, kein echter VPS.

- **6h max pro Run.** Der Workflow muss regelmäßig neu gestartet werden.
- **Für Dev und Erkundung reserviert.** Du wirst deine Website nicht auf dieser Seite unterbringen. Es ist, Dev, debug, zu erforschen, eine einwegfähige aber wiederherstellbare Linux-Umgebung zu testen.
- **GitHub sieht alles.** Das sind ihre Maschinen.
- **Bewahre die private Repo.** Du stellst eine SSH-Shell aus. Eine öffentliche Repo = jeder kann sich möglicherweise daran anschließen.
- **Es ist an der Grenze der Nutzungsbedingungen.** GitHub Aktionen ist für CI/CD gemacht, nicht für kostenlose VPS. Also mit sparsamer, legitimer, ohne zu missbrauchen.

### Die echte Achillesferse: git hasst große Dateien

Git ist für Text gemacht, nicht für eine Datei.

Die persistente Festplatte lebt in einem Git-Zweig, also geht alles, was du speicherst, über git.

- misshandelt große Binärdateien (ein 2 GB Docker-Bild in git?vergisst)

- hat eine Grenze von 100 MB pro Datei auf GitHub (hard limit, es ist nicht mehr Push)

- empfiehlt, unter ~5 GB von repo zu bleiben

Also, wenn du`npm install`Projekt mit 500 MB de`node_modules`, oder wenn du ein Projekt, das schwere Binär erzeugt, build, Push zu`filesystem`Entweder rudern oder versagen.

Das`git commit –amend`Hilfe (ein Commit, kein Aufblähungsverlauf), aber es ändert nichts an der Tatsache, dass eine 200 MB Datei nie passieren wird.

Im Grunde: ** es funktioniert super für Code, Konfektionen, kleine Dateien. Es funktioniert nicht, um große Daten oder binäre Artefakte zu speichern.** Man muss sich darüber im Klaren sein, was man in der Sitzung macht.

### Es ist kein komplettes System Snapshot

Weitere wichtige Nuancen: der Zweig`filesystem`speichert den **workspace** (der Ordner der repo), nicht das gesamte System.

Wenn du das machst`apt install htop`, Binär geht in`/usr/bin/htop`- Also wird er NICHT gespeichert.

Deshalb haben wir APT und das APT versteckt.`prestart.sh`: Um die Systemumgebung bei jedem Start neu zu basteln, da nur der Workspace weiterbesteht.

Wenn du willst, dass deine Installs überleben, musst du sie in den Workspace (Geschlecht, in einen lokalen Ordner statt in ein System) legen.

---

## Kostenlose VPS vs wahre VPS: das Spiel

| | repo-to-vps | Wahres VPS (5€/Monat) |
|---|---|---|
| **Preis** | 0 € | ~5-10€/Monat |
| **Uptime** | 6 Uhr, wieder anfangen | 24/7 |
| **Disque** | git-Zweig, kleine Dateien | wahre SSD, mehrere Gos |
| **RAM** | ~7 GB (generös!) | 1-2 GB häufig |
| **CPU** | 2-4 korrekte Herzen | 1-2 vCPU |
| **Setup** | Klon ein Template | manuelles config |
| **Persistenz** | Nur workspace | System komplett |
| **Rechtsstaatlichkeit** | NGU-Grenzwert | 100% clean |

Der interessante Punkt ist, dass die Rohe Spektakel Seite (RAM, CPU), der Runner GitHub ist oft BESSER als ein VPS zu 5€. Aber die ultimative 6 Stunden und die begrenzte Persistenz auf den Workspace, das ist es, was es ein Hacker Spielzeug, nicht ein echter Server.

Um ein Linux-System schnell in einer wiederherstellbaren Umgebung zu lernen, zu testen, zu debuggieren? Perfekt. Um etwas Ernstes zu hosten? Nimm dir ein echtes VPS.

Aber für eine temporäre Linux-Umgebung, die du nach Belieben wiederherstellen kannst?

---

## Die Pattern hinter all dem

Wenn du zurücktrittst, review-to-vps und der E-Mail-Bot (mein anderer Artikel) basieren auf der gleichen Idee:

> **Git ist nicht nur ein Versionsmanager. Es ist ein permanentes, kostenloses, versioniertes Speichersystem, das über eine API zugänglich ist.**

Sobald du ein stateless-System (GitHub Actions, ein Worker, eine serverless Funktion) hast und einen Zustand zwischen zwei Exekutionen halten willst, kann git als "Disc" dienen.

- Der E-Mail-Bot speichert ein`lastId`in einem Git-Tag.
- repo-to-vps speichert ein gesamtes filesystem in einem git-Anschluss.

Sogar Patterns, zwei Leitern, einen Wert auf der einen Seite, eine Scheibe auf der anderen.

Und das`git commit –amend`+ Kraft-push ist die gemeinsame Technik: ** Du behältst nur einen Commit, der den aktuellen Status darstellt, der bei jedem Update überschrieben wird.**

Das ist nicht der Grund, aber es funktioniert und es ist umsonst.

---

**Die 3 Punkte, die zu berücksichtigen sind:**

1. **Ein git-Zweig = eine permanente Festplatte** – Speichere dein filesystem in einem speziellen Zweig, bleibe beim Booten und du hast einen Zustand, der Einwegmaschinen überlebt.
2. **inotify + git = Autosave Echtzeit** –`inotifywait`überwacht Veränderungen auf der kernel- und push-Ebene zu git sofort.`git commit –amend`um nur einen einzigen Commit sauber zu halten.
3. **tmate verwandelt einen Runner in VPS** – Live-SSH auf einem GitHub Actions-Maschinen, mit automatischem Restart und erneuter Verbindung über die GitHub API.

Git als Festplatte, zweite Folge. Ich glaube, ich werde am Ende alles in Git-Zweige speichern
