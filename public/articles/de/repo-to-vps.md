---
title: "Repo to VPS: GitHub Actions in gratis VPS verwandeln mit persistentem Speicher"
description: Wie man einen GitHub-Actions-Runner mit Git als persistentem Speicher in einen permanenten VPS verwandelt, tmate, inotify und commit --amend.
date: 2026-05-29
tags:
  - github
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "wqzHESOExUuQh+cBsNeZ0AO9pwYhDbhFh0n6xjz0OGwfyBKlRdklQNBeCm4flbO7S25CLKIBU2K5fHBgcvl0Kw=="
---

## GitHub gibt dir 6h lang einen gratis VPS. Ich habe gefunden, wie man ihn permanent macht.

GitHub Actions gibt dir gratis Linux-Maschinen.

So richtige Ubuntu-Server. 2 Kerne, 7 GB RAM, 14 GB Platte. Gratis. Für 6h pro Run.

Das einzige "Problem": Am Ende des Runs wird alles gelöscht. Die Maschine ist wegwerfbar. Du installierst Pakete, du codest, du konfigurierst... und puff, am Ende verschwindet alles. Als hättest du nichts gemacht.

Außer wenn.

Außer wenn du **Git als Festplatte** nutzt.

Und da hast du plötzlich einen gratis VPS mit einer persistenten Platte, die Runs überlebt. Du verbindest dich neu, alles ist noch da. Du machst weiter, wo du aufgehört hast.

Das ist komplett kaputt. Lass es mich dir erklären.

---

## Der Kontext: die GitHub-Actions-Runner

Wenn du einen GitHub-Actions-Workflow startest, gibt dir GitHub eine VM.

Das ist gemacht, um deinen Code zu bauen, deine Tests laufen zu lassen, zu deployen. Der Workflow läuft, macht seinen Job, und die Maschine wird zerstört.

Aber nichts hindert dich, etwas anderes mit dieser VM zu machen. Zum Beispiel eine SSH-Shell darauf zu öffnen und sie als Server zu nutzen.

Die Bedingung ist, dass diese Maschinen **stateless** und **temporär** sind:
- Temporär: Max 6h pro Run (`timeout-minutes: 360`, GitHubs Deckel)
- Stateless: Alles wird am Ende gelöscht

Um daraus also einen nutzbaren VPS zu machen, muss man zwei Probleme lösen:
1. **Wie verbindet man sich live darauf ?**
2. **Wie behält man die Platte zwischen zwei Runs ?**

Da wird es ein dreckiger Hack.

---

## Problem 1: das Live-SSH mit tmate

**tmate** ist ein tmux-Fork, der eine teilbare SSH-Session erstellt.

Du startest es auf einer Maschine, es generiert zwei Links:
- Eine SSH-URL (`ssh xxx@nyc1.tmate.io`)
- Eine Web-URL (Terminal im Browser)

Du verbindest dich mit einem dieser Links, und boom, du bist in einer Shell auf der Maschine. Live.

Der Workflow startet also tmate:

```bash
tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
tmate -S /tmp/tmate.sock set-option -g remain-on-exit on

# holt die Verbindungslinks
tmate_ssh=$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')
tmate_web=$(tmate -S /tmp/tmate.sock display -p '#{tmate_web}')
```

Und diese Links werden von einem Python-Skript direkt ins README des Repos geschrieben. Du öffnest dein Repo, siehst den Verbindungslink, klickst. Schon bist du in deinem VPS.

Erstes Problem gelöst. Aber das zweite ist wirklich verrückt.

---

## Problem 2: Git als Festplatte

Hier die Idee, die alles ändert.

Die Maschine wird bei jedem Run gelöscht. Also speichern wir **das Dateisystem in einem dedizierten Git-Branch** namens `filesystem`.

Beim Start stellt das Skript den Zustand aus diesem Branch wieder her:

```bash
filesystem_branch="filesystem"

# holt den filesystem-Branch vom Remote
git fetch origin "$filesystem_branch":refs/remotes/origin/$filesystem_branch

# stellt den Workspace aus diesem Branch wieder her
git checkout -B filesystem-workspace "refs/remotes/origin/$filesystem_branch"
git reset --hard "refs/remotes/origin/$filesystem_branch"
```

Der `filesystem`-Branch IST deine Festplatte. Deine Dateien, deine Installs, deine Configs, alles steckt drin.

Du siehst die Idee? Die Maschine ist wegwerfbar, aber die Platte lebt in Git. Du startest den Workflow neu, die Platte wird restauriert, du machst genau weiter, wo du warst.

Es ist wie ein VPS, der hiberniert. Nur dass die Hibernation ein Git-Repo ist.

### Erster Start: die leere Platte erstellen

Beim allerersten Run existiert der `filesystem`-Branch noch nicht. Man muss ihn erstellen. Und das ist nicht trivial:

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

Das `git checkout --orphan` ist der Schlüssel. Ein verwaister Branch ist ein Branch **ohne jegliche Historie**, als startest du von einem leeren Repo neu.

Warum verwaist? Weil du NICHT willst, dass deine persistente Platte die ganze Historie deines Sourcecodes mitschleppt. Die Platte bleibt isoliert, mit eigenem Leben. Sie startet jungfräulich.

Und das `git ls-remote --exit-code` am Anfang ist nur ein sauberer Check: "existiert der Branch schon auf dem Remote ?". Wenn ja, fassen wir nichts an. Wenn nein, erstellen wir ihn. Idempotent, wie wir es mögen.

### Das selektive Git Clean: Caches schützen

Diese Zeile verdient, dass man stehen bleibt:

```bash
git clean -fdx -e .apt-cache -e .cache -e host.conf -e tmate.sock
```

`git clean -fdx` wirft ALLES weg, was nicht von Git getrackt wird. Normalerweise ist das brutal, es räumt den Workspace gründlich auf.

Aber die `-e` (Exclude) schützen manche Dateien:
- `.apt-cache` → der APT-Paketcache (dazu kommen wir, das ist clever)
- `.cache` → generischer Cache
- `host.conf` → die SSH-Adresse der Session
- `tmate.sock` → der Socket der laufenden tmate-Session

Wenn du diese Dateien aufräumen würdest, brichst du die aktive Session oder verlierst deinen Cache. Also sparen wir sie beim Reset aus.

Ein auf den ersten Blick dummes Detail, aber ohne das bricht alles.

---

## Der Autosave: inotify, das alles überwacht

Gut, aber wie kommen die Dateien in den `filesystem`-Branch?

Antwort: Ein Watcher, der ALLE Dateiänderungen überwacht und automatisch committet/pusht.

Das magische Tool ist **inotifywait** (aus dem Paket `inotify-tools`). Es überwacht das Dateisystem auf Kernelebene und triggert, sobald sich eine Datei ändert.

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock|\.gitignore|\.txt\.swp)(/|$)' .; do
    echo "[autosave] change detected"
    commit_and_push
    sleep 1   # Debounce wenn viele Änderungen auf einmal
  done
}

autosave &
```

Zerlegen wir die inotify-Flags, denn jedes zählt:
- `-r` → rekursiv, überwacht alle Unterordner
- `-e modify,create,delete,move` → reagiert auf diese 4 Eventtypen
- `--exclude '...'` → eine Regex, um manche Dateien zu ignorieren

Das `--exclude` ist entscheidend. Schau, was es ignoriert:
- `.git` → natürlich, sonst würde jeder Commit einen Autosave triggern, der einen Commit triggert... Endlosschleife. Katastrophe.
- `.apt-cache` und `.cache` → die Caches, die sich ständig ändern und die wir nicht in Git spammen wollen
- `host.conf` und `tmate.sock` → die Sessiondateien, die sich unaufhörlich bewegen
- `.gitignore`, `.txt.swp` → temporäre Dateien (die `.swp` sind vims Editierdateien)

Ohne dieses Exclude hättest du einen Autosave, der sich in Schleife auf seine eigenen Änderungen triggert. Das `.git` in der Liste ist DIE Zeile, die dich davor bewahrt, dir ins eigene Bein zu schießen.

Du änderst eine Datei? inotify erkennt es augenblicklich, es committet, es pusht. In weniger als einer Sekunde ist deine Änderung im `filesystem`-Branch.

Du installierst ein Paket, du schreibst Code, du fasst eine Config an, alles wird live gespeichert, automatisch, ohne dass du irgendwas tust.

Du hast buchstäblich ein automatisches Sicherungssystem der ganzen Platte. Kaputt.

### Der Debounce: Git nicht spammen

Das `sleep 1` nach jedem Save ist ein **Debounce**.

Wenn du eine Datei in einem Editor speicherst, generiert das oft mehrere Filesystem-Events in Salve (Erstellung einer Tempdatei, Rename, Löschen der alten...). Ohne Debounce würdest du 3-4 Commits für ein einziges Speichern triggern.

Das `sleep 1` sagt: "Warte eine Sekunde nach einem Save, bis die Salve sich beruhigt, bevor du wieder lauschst". Das gruppiert nahe Änderungen in einen einzigen Commit. Clever.

### Und ein periodisches Backup obendrauf

Falls inotify ein Event verpassen sollte, gibt es auch alle 5 Sekunden einen Save:

```bash
periodic_save() {
  while true; do
    sync_from_remote   # holt eventuelle Remote-Änderungen
    sleep 5
    commit_and_push
  done
}

periodic_save &
```

Gürtel UND Hosenträger. Wir wollen vor allem den Plattenzustand nicht verlieren.

---

## Das clevere Detail: ein einziger Commit

Wenn du bei jeder Dateiänderung committest, häufst du Tausende Commits an. In einer Stunde Session explodiert deine Historie. Das Repo wird riesig. Das ist hässlich.

Die Lösung ist elegant: **Wir amenden den existierenden Commit**, statt einen neuen zu erstellen.

```bash
commit_and_push() {
  (
    flock -n 200 || return   # Lock damit nicht zwei Saves zugleich laufen

    git add -A
    git reset -- .github/workflows/ .github/scripts/   # Scripts nicht anfassen

    if ! git diff --cached --quiet; then
      if git rev-parse --verify HEAD >/dev/null 2>&1; then
        git commit --amend --no-edit    # AMEND : überschreibt den vorherigen Commit
      else
        git commit -m "autosave $(date -u +%Y%m%dT%H%M%SZ)"
      fi
      git push --force origin "filesystem-workspace:filesystem"
    fi
  ) 200>/tmp/tmate_autosave.lock
}
```

`git commit --amend` heißt: "Ersetze den letzten Commit durch diesen".

Dadurch hat der `filesystem`-Branch IMMER einen einzigen Commit. Egal wie oft du sicherst. Es ist nur ein Snapshot des aktuellen Zustands, immer wieder force-gepusht.

Das `flock` ist ein Lock: Da es zwei Save-Schleifen gibt (inotify + periodisch), muss man vermeiden, dass sie Git gleichzeitig starten und sich in die Quere kommen. Ein einziger Git-Prozess auf einmal.

Sauber.

---

## Das sync_from_remote: mehrere Sessions handhaben

Tja, ein Fall, an den du anfangs nicht denkst: Was, wenn du ZWEI Runs gleichzeitig startest? Oder wenn eine Session den `filesystem`-Branch ändert, während eine andere läuft?

Das Skript handhabt das mit einem `sync_from_remote` vor jedem Commit:

```bash
sync_from_remote() {
  git fetch origin "filesystem":refs/remotes/origin/filesystem
  git merge --ff-only "refs/remotes/origin/filesystem"
}
```

Das `--ff-only` (nur Fast-Forward) ist wichtig: Es heißt "merge NUR, wenn man sauber vorrücken kann, ohne einen Merge-Commit zu erstellen".

Wenn beide Branches divergiert sind (z. B. zwei Sessions haben verschiedene Dateien geändert), schlägt der Fast-Forward still fehl (`2>/dev/null || true`) und wir behalten den lokalen Zustand. Kein perfektes Mergesystem, vermeidet aber Korruptionen im simplen Fall, wo nur eine Session läuft.

Ehrlich gesagt sollte man nicht 3 Sessions parallel auf demselben Repo starten. Aber der Code versucht trotzdem, nicht zu explodieren, wenn es passiert. Defensive.

---

## Der APT-Cache: schnell installieren

Es gibt ein Detail im Workflow, das unscheinbar zahlt, aber gut durchdacht ist:

```yaml
- name: Cache & install APT packages (tmate + watcher)
  uses: awalsh128/cache-apt-pkgs-action@v1.6.0
  with:
    packages: tmate inotify-tools
```

tmate und inotify-tools werden via eine Action installiert, die **APT-Pakete cached**.

Beim ersten Run lädt und installiert das. Bei folgenden Runs wird es aus dem GitHub-Actions-Cache restauriert, schneller, kein Re-Download nötig.

Und erinnerst du dich an das `git clean -fdx -e .apt-cache` von vorhin? Das hängt zusammen. Der `.apt-cache`-Ordner ist gerade deshalb vor dem Aufräumen geschützt, damit die Pakete, die du während deiner Session installierst, minimal persistieren können.

Alles hängt zusammen. Ich habe an den kompletten Lebenszyklus gedacht.

---

## Die in /tmp versteckten Skripte

Noch ein fieses, aber cleveres Detail. Ganz am Anfang des Skripts:

```bash
RUNNER_SCRIPTS_DIR="/tmp/runner-scripts"
rm -rf "$RUNNER_SCRIPTS_DIR"
mkdir -p "$RUNNER_SCRIPTS_DIR"
cp -r .github/scripts "$RUNNER_SCRIPTS_DIR/"
```

Die Skripte (`update_readme.py` usw.) werden VOR dem Anfassen des `filesystem`-Branches nach `/tmp` kopiert.

Warum? Weil wenn du den `git reset --hard` auf den `filesystem`-Branch machst (der anfangs leer ist oder deine Platte enthält), die `.github/scripts`-Dateien des Sourcerepos aus dem Workspace verschwinden.

Aber das Skript braucht sie noch während der Session (um das README bei jedem tmate-Neustart zu updaten). Also versteckt es sie in `/tmp`, außerhalb von Gits Reichweite:

```bash
python3 "$RUNNER_SCRIPTS_DIR/scripts/update_readme.py" --ssh "$tmate_ssh" ...
```

Wenn du daran nicht denkst, rätselst du 30 Minuten, warum dein Skript verschwunden ist. Ich habe daran gedacht.

---

## Die maßgeschneiderte Shell

Kleiner Komfort: Die Session gibt dir eine konfigurierte Shell, kein nacktes Bash.

Das `prestart.sh` kopiert eine Custom-`.bashrc`:

```bash
if ! grep -q "Custom prompt and aliases for remote sessions" "$HOME/.bashrc"; then
  cp .github/scripts/remote_bashrc "$HOME/.bashrc"
fi
sudo cp "$HOME/.bashrc" /root/.bashrc
```

Und diese `.bashrc` enthält einen farbigen Prompt, Aliase (`ll`, `lla`, `rm -i`) und vor allem einen `exit`-Override:

```bash
exit() {
    killall -9 -u "$(whoami)" tmate 2>/dev/null || true
    builtin exit "$@"
}

# Ctrl+D macht dasselbe wie exit
bind -x '"\C-d": "exit"'
```

Wenn du `exit` tippst (oder Strg+D), killt das sauber die tmate-Prozesse vor dem Schließen. Das vermeidet, tmate-Zombie-Sessions zurückzulassen.

Es gibt auch eine `tmate-detach`-Funktion, wenn du dich trennen willst OHNE die Session zu killen (um dich später neu zu verbinden). Komfortdetail, zeigt aber das Sorgfaltsniveau.

---

## Das tmate, das sich selbst neu startet

Kleiner Komfort: Wenn du `exit` in deiner Shell tippst, stirbt normalerweise die tmate-Session und du bist endgültig getrennt.

Nur dass tmate hier in einer `while true`-Schleife steckt:

```bash
while true; do
  tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
  while tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' >/dev/null 2>&1; do
    sleep 2
  done
  echo "tmate session ended; restarting..."
done
```

Du machst `exit`? Die Session startet von allein neu. Du verbindest dich mit demselben Link neu.

Dämlich, aber macht die Session nutzbar.

---

## Die Reconnection mit einem Command

Wie verbindest du dich nach einer Trennung neu, ohne jedes Mal in den Runlogs zu wühlen?

Die tmate-SSH-Adresse steht in einer `host.conf`-Datei, committet im `filesystem`-Branch:

```bash
printf '%s' "${tmate_ssh#ssh }" > host.conf
```

Und da diese Datei in Git liegt, kannst du sie mit einem einzigen Command via GitHub-API holen:

```bash
ssh "$(gh api -H 'Accept: application/vnd.github.v3.raw' \
  "/repos/USER/REPO/contents/host.conf?ref=filesystem" | tr -d '\r\n')"
```

Du startest das, es holt die aktuelle SSH-Adresse aus dem Repo und verbindet dich. Selbst wenn sich die Adresse zwischen zwei Sessions geändert hat.

---

## Der komplette Flow

Rekapitulieren wir:

1. Du triggerst den Workflow (Push oder manueller Button)
2. GitHub gibt dir eine Ubuntu-VM
3. Das Skript stellt die Platte aus dem "filesystem"-Branch wieder her
4. inotify fängt an, alle Änderungen zu überwachen
5. periodic_save committet alle 5s als Backup
6. tmate startet → generiert die SSH/Web-Links
7. Die Links werden in README + host.conf geschrieben
8. Du verbindest dich mit ssh oder Webterminal
9. Du machst, was du willst, jede Dateiänderung = Autosave
10. 6h später killt GitHub die VM
11. Deine Platte ist intakt im "filesystem"-Branch
12. Du startest den Workflow neu → zurück zu Schritt 3, alles ist noch da

Ein gratis VPS mit persistenter Platte. Nur mit Git und GitHub Actions.

---

## Gut, ehrlich sein: die Grenzen

Es ist ein Hack, kein echter VPS. Also:

- **Max 6h pro Run.** Man muss den Workflow regelmäßig neu starten. Uptime pro Run begrenzt.
- **Reserviert für Dev und Exploration.** Du wirst deine Seite nicht darauf hosten. Es ist zum Explorieren, Entwickeln, Debuggen, schnell eine wegwerfbare, aber wiederherstellbare Linux-Umgebung testen.
- **GitHub sieht alles.** Es sind ihre Maschinen. Nichts Sensibles drauflegen.
- **Repo privat halten.** Du exponierst eine SSH-Shell. Ein öffentliches Repo = potenziell kann sich jeder verbinden. Schlechte Idee.
- **An der Grenze der Nutzungsbedingungen.** GitHub Actions ist für CI/CD gemacht, nicht für gratis VPS. Also sparsam nutzen, für Legitimes, ohne Missbrauch.

### Die echte Achillesferse: Git hasst große Dateien

Git ist für Text gemacht, nicht für ein Dateisystem.

Die persistente Platte lebt in einem Git-Branch. Also geht alles, was du sicherst, durch Git. Und Git:
- Handhabt große Binärdateien schlecht (ein 2-GB-Docker-Image in Git? Vergiss es)
- Hat ein 100-MB-Limit pro Datei auf GitHub (hartes Limit, pusht nicht darüber)
- Empfiehlt, unter ~5 GB pro Repo zu bleiben

Wenn du also `npm install` für ein Projekt mit 500 MB `node_modules` machst oder ein Projekt baust, das schwere Binaries generiert, wird der Push nach `filesystem` entweder zu Tode ruckeln oder glatt scheitern.

Das `git commit --amend` hilft (ein einziger Commit, keine aufblähende Historie), ändert aber nichts daran, dass eine 200-MB-Datei nie durchgeht.

Grob gesagt: **Es funktioniert super für Code, Configs, kleine Dateien. Es funktioniert nicht zum Speichern großer Daten oder Binärartefakte.** Das muss man im Kopf behalten bei dem, was du in deiner Session machst.

### Kein komplettes Systemsnapshot

Andere wichtige Nuance: Der `filesystem`-Branch sichert den **Workspace** (den Repo-Ordner), nicht das ganze System.

Wenn du `apt install htop` machst, geht das Binary nach `/usr/bin/htop`, was AUßERHALB des Workspaces liegt. Also wird es NICHT gesichert. Beim nächsten Run musst du es neu installieren.

Deshalb haben wir den APT-Cache und das `prestart.sh`: Um die Systemumgebung bei jedem Start neu vorzubereiten, da nur der Workspace persistiert.

Wenn du willst, dass deine Installs überleben, musst du sie in den Workspace legen (z. B. in einen lokalen Ordner statt systemweit installieren). Eine einzuübende Gymnastik.

---

## Gratis-VPS vs. echter VPS: das Match

| | repo-to-vps | Echter VPS (5€/Monat) |
|---|---|---|
| **Preis** | 0€ | ~5-10€/Monat |
| **Uptime** | 6h, neu starten | 24/7 |
| **Platte** | Git-Branch, kleine Dateien | Echte SSD, mehrere GB |
| **RAM** | ~7 GB (großzügig !) | Oft 1-2 GB |
| **CPU** | 2-4 korrekte Kerne | 1-2 vCPU |
| **Setup** | Template klonen | Manuelle Config |
| **Persistenz** | Nur Workspace | Komplettes System |
| **Legitimität** | AGB-Grenze | 100 % clean |

Der interessante Punkt ist, dass rohe Specs-Seite (RAM, CPU) der GitHub-Runner oft BESSER ist als ein 5€-VPS. Aber die 6h-Uptime und die auf den Workspace begrenzte Persistenz machen daraus ein Hacker-Spielzeug, kein echter Server.

Zum Lernen, Testen, schnell ein Linux-System in einer wiederherstellbaren Umgebung debuggen? Perfekt. Um irgendwas Ernstes zu hosten? Nimm einen echten VPS.

Aber für eine temporäre Linux-Umgebung, die du nach Belieben restaurieren kannst? Das ist einfach genial.

---

## Das Pattern hinter allem

Wenn du zurücktrittst, beruhen repo-to-vps und der Mailbot (mein anderer Artikel) auf derselben Idee:

> **Git ist nicht nur ein Versionsmanager. Es ist ein persistentes, gratis, versioniertes, via API erreichbares Speichersystem.**

Sobald du ein stateless System hast (GitHub Actions, ein Worker, eine Serverless-Funktion) und Zustand zwischen zwei Ausführungen behalten willst, kann Git als "Platte" dienen.

- Der Mailbot speichert eine `lastId` in einem Git-Tag.
- repo-to-vps speichert ein ganzes Dateisystem in einem Git-Branch.

Gleiches Pattern, zwei Maßstäbe. Ein Wert auf der einen, eine Platte auf der anderen Seite.

Und `git commit --amend` + Force-Push ist die gemeinsame Technik: **Du behältst einen einzigen Commit, der den aktuellen Zustand darstellt, bei jedem Update überschrieben.**

Dafür ist es nicht gemacht. Aber es funktioniert. Und es ist gratis.

---

**Die 3 Punkte zum Mitnehmen :**

1. **Ein Git-Branch = eine persistente Festplatte**, speichere dein Dateisystem in einem dedizierten Branch, stelle beim Start wieder her, und du hast einen Zustand, der wegwerfbare Maschinen überlebt.

2. **inotify + Git = Live-Autosave**, `inotifywait` überwacht Änderungen auf Kernelebene und pusht augenblicklich nach Git. Mit `git commit --amend`, um einen einzigen sauberen Commit zu behalten.

3. **tmate verwandelt einen Runner in einen VPS**, Live-SSH auf eine GitHub-Actions-Maschine, mit automatischem Neustart und Ein-Command-Reconnection via GitHub-API.

Git als Festplatte, zweite Episode. Ich glaube, ich werde am Ende alles in Git-Branches speichern.
