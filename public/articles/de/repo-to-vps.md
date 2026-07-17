---
title: "Repo to VPS: GitHub Actions in einen kostenlosen VPS mit persistentem Speicher verwandeln"
description: Wie man einen GitHub Actions Runner mit git als persistentem Speicher in einen Dauer-VPS verwandelt -- tmate, inotify und commit --amend.
date: 2026-05-29
authors:
  - fox3000foxy
tags:
  - github
  - devops
  - automation
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "h4HPjknTu/G/LSOy9GOhnpiIrdNesvuXsDUblmhAiisZH0825wVgdOT/wQK4aX2bzDH6Mz+uxLfhXEqzSFQYTQ=="
---

## GitHub gibt dir 'nen kostenlosen VPS für 6h. Ich hab rausgefunden, wie du ihn permanent machst.

GitHub Actions gibt dir kostenlose Linux-Maschinen.

So richtig. Echte Ubuntu-Server. 2 Kerne, 7 GB RAM, 14 GB Platte. Kostenlos. Für 6h pro Run.

Das einzige "Problem": Am Ende des Runs wird alles gelöscht. Die Maschine ist wegwerfbar. Du installierst Zeug, codest, konfigurierst... und zack, am Ende ist alles weg. Als ob du nichts gemacht hättest.

Außer wenn.

Außer wenn du **Git als Festplatte** benutzt.

Und auf einmal hast du 'nen kostenlosen VPS mit 'ner persistenten Platte, die Runs überlebt. Du verbindest dich neu, alles ist noch da. Du machst weiter, wo du aufgehört hast.

Das ist komplett kaputt. Lass mich erklären xD

---

## Der Kontext: GitHub Actions Runner

Wenn du 'nen GitHub Actions Workflow startest, gibt dir GitHub 'ne VM.

Die ist dazu da, deinen Code zu builden, Tests zu starten, zu deployen. Der Workflow läuft, macht seinen Job, und die Maschine wird zerstört.

Aber nichts hält dich davon ab, was anderes mit dieser VM zu machen. 'Ne SSH-Shell öffnen und als Server benutzen.

Der Punkt ist, diese Maschinen sind **zustandslos** und **temporär**:
- Temporär: max 6h pro Run (`timeout-minutes: 360`, das GitHub-Limit)
- Zustandslos: alles wird am Ende gelöscht

Also um daraus 'nen brauchbaren VPS zu machen, musst du zwei Probleme lösen:
1. **Wie verbinde ich mich in Echtzeit damit?**
2. **Wie behalte ich die Platte zwischen zwei Runs?**

Und hier wird's zu 'nem Hack.

---

## Problem 1: Live-SSH mit tmate

**tmate** ist ein Fork von tmux, der 'ne teilbare SSH-Session erstellt.

Du startest es auf 'ner Maschine, es generiert zwei Links:
- 'ne SSH-URL (`ssh xxx@nyc1.tmate.io`)
- 'ne Web-URL (Terminal im Browser)

Du verbindest dich mit einem dieser Links, und boom, du bist in 'ner Shell auf der Maschine. In Echtzeit.

Der Workflow startet also tmate:

```bash
tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
tmate -S /tmp/tmate.sock set-option -g remain-on-exit on
tmate_ssh=$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')
tmate_web=$(tmate -S /tmp/tmate.sock display -p '#{tmate_web}')
```

Und diese Links werden von 'nem Python-Script direkt in die README des Repos geschrieben. Du öffnest dein Repo, siehst den Verbindungslink, klickst drauf. Schon bist du in deinem VPS.

Erstes Problem gelöst. Aber das zweite ist echt verrückt.

---

## Problem 2: Git als Festplatte

Hier kommt das kranke Ding.

Die Maschine wird bei jedem Run gelöscht. Also speichern wir **das Dateisystem in 'nem dedizierten Git-Branch**, genannt `filesystem`.

Beim Start stellt das Script den Zustand aus diesem Branch wieder her:

```bash
filesystem_branch="filesystem"
git fetch origin "$filesystem_branch":refs/remotes/origin/$filesystem_branch
git checkout -B filesystem-workspace "refs/remotes/origin/$filesystem_branch"
git reset --hard "refs/remotes/origin/$filesystem_branch"
```

Der Branch `filesystem` IST deine Festplatte. Deine Dateien, deine Installationen, deine Konfigs -- alles ist drin.

Checkst du das? Die Maschine ist wegwerfbar, aber die Platte lebt in Git. Du startest den Workflow neu, die Platte wird wiederhergestellt, du machst genau da weiter, wo du warst.

Es ist wie ein VPS, der in den Ruhezustand geht. Nur dass der Ruhezustand ein Git-Repo ist xD

### Erster Start: Leere Platte erstellen

Beim allerersten Run existiert der Branch `filesystem` noch nicht. Muss erstellt werden. Und das ist nicht trivial:

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

Das `git checkout --orphan` ist der Schlüssel. Ein Orphan-Branch ist ein Branch **ganz ohne History** -- als ob du mit 'nem leeren Repo von vorne anfängst.

Warum orphan? Weil du NICHT willst, dass deine persistente Platte die ganze History deines Quellcodes mitschleppt. Die Platte ist 'ne eigene Sache, die ihr eigenes Leben führt. Sie startet leer.

Und das `git ls-remote --exit-code` am Anfang ist einfach 'ner sauberer Check: "gibt es den Branch schon auf dem Remote?". Wenn ja, nichts tun. Wenn nein, wird er erstellt. Idempotent, wie wir es mögen.

### Das selektive Git Clean: Caches schützen

Diese Zeile verdient 'nen genaueren Blick:

```bash
git clean -fdx -e .apt-cache -e .cache -e host.conf -e tmate.sock
```

`git clean -fdx` löscht ALLES, was nicht von Git getrackt wird. Normalerweise ist das heftig -- es putzt das Workspace komplett durch.

Aber die `-e` (exclude) schützen bestimmte Dinge:
- `.apt-cache` → der Cache der APT-Pakete (dazu kommen wir gleich, das ist clever)
- `.cache` → generischer Cache
- `host.conf` → die SSH-Adresse der Session
- `tmate.sock` → der Socket der aktuellen tmate-Session

Wenn du diese Dateien putzen würdest, würdest du die aktive Session killen oder deinen Cache verlieren. Also werden sie beim Reset verschont.

'n blödes Detail auf den ersten Blick, aber ohne das geht alles kaputt.

---

## Der Autosave: Inotify überwacht alles

Okay, aber wie landen die Dateien im Branch `filesystem`?

Antwort: 'n Watcher, der ALLE Dateiänderungen überwacht und automatisch committed/pusht.

Das magische Tool ist **inotifywait** (aus dem Paket `inotify-tools`). Es überwacht das Dateisystem auf Kernel-Ebene und feuert los, sobald sich 'ne Datei ändert.

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock|\.gitignore|\.txt\.swp)(/|$)' .; do
    echo "[autosave] change detected"
    commit_and_push
    sleep 1
  done
}

autosave &
```

Lass uns die inotify-Flags aufdröseln, weil jedes zählt:
- `-r` → rekursiv, überwacht alle Unterordner
- `-e modify,create,delete,move` → reagiert auf diese 4 Ereignistypen (Änderung, Erstellung, Löschung, Verschiebung)
- `--exclude '...'` → 'ne Regex, um bestimmte Dateien zu ignorieren

Das `--exclude` ist entscheidend. Schau, was es ignoriert:
- `.git` → logisch, sonst würde jeder Commit 'nen Autosave auslösen, der 'nen Commit auslöst... Endlosschleife. Katastrophe.
- `.apt-cache` und `.cache` → die Caches, die sich ständig ändern und die man nicht in Git spammen will
- `host.conf` und `tmate.sock` → die Session-Dateien, die sich dauernd ändern
- `.gitignore`, `.txt.swp` → temporäre Dateien (die `.swp` sind vim-Editierdateien)

Ohne diesen Exclude würdest du 'nen Autosave bekommen, der sich bei seinen eigenen Änderungen immer wieder selbst triggert. Das `.git` in der Liste ist DIE Zeile, die verhindert, dass du dich selbst ins Knie schießt.

Du änderst 'ne Datei? Inotify erkennt es sofort, es wird committed, gepusht. In unter 'ner Sekunde ist deine Änderung im Branch `filesystem`.

Du installierst was, schreibst Code, änderst 'ne Config -- alles wird in Echtzeit gespeichert, automatisch, ohne dass du irgendwas tun musst.

Du hast buchstäblich 'n automatisches Backup-System für die ganze Platte. Kaputt.

### Das Debounce: Git nicht zuspammen

Das `sleep 1` nach jedem Save ist ein **Debounce**.

Wenn du 'ne Datei in 'nem Editor speicherst, erzeugt das oft mehrere Dateisystem-Ereignisse auf einmal (temporäre Datei erstellen, umbenennen, alte löschen...). Ohne Debounce würden 3-4 Commits für 'nen einzigen Save rausgehen.

Das `sleep 1` sagt: "warte 'ne Sekunde nach 'nem Save, bis die Welle sich beruhigt hat, bevor du wieder lauschst". Es fasst nahe Änderungen in 'nem einzigen Commit zusammen. Clever.

### Und noch 'n periodischer Backup

Falls inotify mal was verpassen sollte, gibt's auch noch 'nen Save alle 5 Sekunden:

```bash
periodic_save() {
  while true; do
    sync_from_remote
    sleep 5
    commit_and_push
  done
}

periodic_save &
```

Gürtel UND Hosenträger. Wir wollen den Plattenzustand auf keinen Fall verlieren.

---

## Das clevere Detail: Nur ein Commit

Wenn du bei jeder Dateiänderung commitest, sammelst du... tausende Commits. In 'ner Stunde Session explodiert deine Git-History. Das Repo wird riesig. Widerlich.

Die Lösung ist elegant: **wir amendieren den existierenden Commit**, statt 'nen neuen zu erstellen.

```bash
commit_and_push() {
  (
    flock -n 200 || return

    git add -A
    git reset -- .github/workflows/ .github/scripts/

    if ! git diff --cached --quiet; then
      if git rev-parse --verify HEAD >/dev/null 2>&1; then
        git commit --amend --no-edit
      else
        git commit -m "autosave $(date -u +%Y%m%dT%H%M%SZ)"
      fi
      git push --force origin "filesystem-workspace:filesystem"
    fi
  ) 200>/tmp/tmate_autosave.lock
}
```

`git commit --amend` bedeutet: "ersetz den letzten Commit durch diesen".

Dadurch hat der Branch `filesystem` IMMER nur 'nen einzigen Commit. Egal wie oft du speicherst. Es ist einfach 'n Snapshot des aktuellen Zustands, der immer und immer wieder force-gepusht wird.

Das `flock` ist 'ne Sperre: weil es zwei Save-Schleifen gibt (inotify + periodisch), muss verhindert werden, dass sie gleichzeitig Git starten und sich gegenseitig in die Quere kommen. Nur ein Git-Prozess zur Zeit.

Sauber.

---

## Das sync_from_remote: Mehrere Sessions verwalten

Hier 'n Ding, an das du am Anfang nicht denkst: was, wenn du ZWEI Runs gleichzeitig startest? Oder wenn 'ne Session den Branch `filesystem` ändert, während 'ne andere läuft?

Das Script handhabt das mit 'nem `sync_from_remote` vor jedem Commit:

```bash
sync_from_remote() {
  git fetch origin "filesystem":refs/remotes/origin/filesystem
  git merge --ff-only "refs/remotes/origin/filesystem"
}
```

Das `--ff-only` (Fast-Forward Only) ist wichtig: es bedeutet "merge NUR, wenn wir sauber vorrücken können, ohne 'nen Merge-Commit zu erstellen".

Wenn die beiden Branches auseinandergegangen sind (z.B. zwei Sessions haben verschiedene Dinge geändert), schlägt der Fast-Forward still fehl (`2>/dev/null || true`) und der lokale Zustand bleibt erhalten. Es ist kein perfektes Merge-System, aber es verhindert Korruption im einfachen Fall, wo nur eine Session läuft.

Ehrlich gesagt, du solltest nicht 3 Sessions parallel im selben Repo laufen lassen. Aber der Code versucht trotzdem, nicht zu explodieren, falls es passiert. Das ist Verteidigung.

---

## Der APT-Cache: Schnell installieren

Es gibt 'n Detail im Workflow, das unscheinbar wirkt, aber gut durchdacht ist:

```yaml
- name: Cache & install APT packages (tmate + watcher)
  uses: awalsh128/cache-apt-pkgs-action@v1.6.0
  with:
    packages: tmate inotify-tools
```

tmate und inotify-tools werden über 'ne Action installiert, die **APT-Pakete cached**.

Beim ersten Run werden sie runtergeladen und installiert. Bei späteren Runs werden sie aus dem GitHub-Actions-Cache wiederhergestellt -- schneller, kein erneuter Download nötig.

Und erinnerst du dich an das `git clean -fdx -e .apt-cache` von vorhin? Das hängt damit zusammen. Der Ordner `.apt-cache` wird vor dem Putzen geschützt, damit die Pakete, die du während deiner Session installierst, zumindest minimal überleben können.

Alles hält sich.

---

## Die Scripts, die in /tmp versteckt werden

Noch 'n fieses, aber cleveres Detail. Ganz am Anfang des Scripts:

```bash
RUNNER_SCRIPTS_DIR="/tmp/runner-scripts"
rm -rf "$RUNNER_SCRIPTS_DIR"
mkdir -p "$RUNNER_SCRIPTS_DIR"
cp -r .github/scripts "$RUNNER_SCRIPTS_DIR/"
```

Die Scripts (`update_readme.py`, etc.) werden nach `/tmp` kopiert, BEVOR der Branch `filesystem` angefasst wird.

Warum? Weil wenn du `git reset --hard` auf den Branch `filesystem` machst (der am Anfang leer ist oder deine Platte enthält), verschwinden die `.github/scripts`-Dateien des Quell-Repos aus dem Workspace.

Aber das Script braucht sie, um das README zu updaten. Also versteckt es sie in `/tmp`:

```bash
python3 "$RUNNER_SCRIPTS_DIR/scripts/update_readme.py" --ssh "$tmate_ssh" ...
```

Wenn du nicht dran denkst, fliegt's dir um die Ohren. Ich hab dran gedacht.

---

## Die maßgeschneiderte Shell

Kleiner Komfort am Ende: Die Session gibt dir 'ne konfigurierte Shell, kein nacktes Bash.

Das `prestart.sh` kopiert 'ne custom `.bashrc`:

```bash
if ! grep -q "Custom prompt and aliases for remote sessions" "$HOME/.bashrc"; then
  cp .github/scripts/remote_bashrc "$HOME/.bashrc"
fi
sudo cp "$HOME/.bashrc" /root/.bashrc
```

Und diese `.bashrc` enthält 'nen farbigen Prompt, Aliase (`ll`, `lla`, `rm -i`), und vor allem 'nen cleveren Override von `exit`:

```bash
exit() {
    killall -9 -u "$(whoami)" tmate 2>/dev/null || true
    builtin exit "$@"
}

bind -x '"\C-d": "exit"'
```

Wenn du `exit` (oder Ctrl+D) eingibst, killt es sauber die tmate-Prozesse, bevor es schließt. Das verhindert, dass verwaiste tmate-Sessions auf der Maschine rumhängen.

Es gibt auch 'ne Funktion `tmate-detach`, falls du dich trennen willst, OHNE die Session zu killen (um dich später neu zu verbinden). Komfortdetail, aber es zeigt das Level an Sorgfalt.

---

## Der selbst-neustartende tmate

Kleiner Komfort: Wenn du `exit` in deiner Shell eingibst, stirbt normalerweise die tmate-Session und du bist endgültig weg.

Aber hier ist tmate in 'ner `while true`-Schleife:

```bash
while true; do
  tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
  while tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' >/dev/null 2>&1; do
    sleep 2
  done

  echo "tmate session ended; restarting..."
done
```

Du `exit`? Die Session startet von selbst neu. Du kannst dich mit demselben Link neu verbinden. Stabile Wiederverbindung, sogar nach 'ner Trennung.

Ist bescheuert, aber macht's nutzbar.

---

## Die Ein-Kommando-Wiederverbindung

Wie verbindest du dich nach 'ner Trennung neu, ohne jedes Mal in den Run-Logs rumzukruschen?

Die tmate-SSH-Adresse wird in 'ne Datei `host.conf` geschrieben, die selbst im Branch `filesystem` committed wird:

```bash
printf '%s' "${tmate_ssh#ssh }" > host.conf
```

Und weil diese Datei in Git ist, kannst du sie über die GitHub-API mit 'nem einzigen Kommando abrufen:

```bash
ssh "$(gh api -H 'Accept: application/vnd.github.v3.raw' \
  "/repos/USER/REPO/contents/host.conf?ref=filesystem" | tr -d '\r\n')"
```

Du gibst das ein, es holt die aktuelle SSH-Adresse aus dem Repo und verbindet dich direkt. Selbst wenn die Adresse zwischen zwei Sessions gewechselt hat.

Erledigt.

---

## Der komplette Flow

Fassen wir zusammen:

```
1. Du startest den Workflow (Push oder manueller Button)
2. GitHub gibt dir 'ne Ubuntu-VM
3. Das Script stellt die Platte aus dem Branch "filesystem" wieder her
4. Inotify beginnt, alle Änderungen zu überwachen
5. Periodic_save committed alle 5s als Backup
6. Tmate startet → generiert SSH-/Web-Links
7. Die Links werden ins README + host.conf geschrieben
8. Du verbindest dich mit SSH oder dem Web-Terminal
9. Du machst, was du willst (codieren, installieren, debuggen...)
   └── jede Dateiänderung = sofortiger Autosave nach Git
10. 6h später killt GitHub die VM
11. Aber deine Platte ist intakt im Branch "filesystem"
12. Du startest den Workflow neu → zurück zu Schritt 3, alles ist noch da
```

Ein VPS. Kostenlos. Mit persistenter Platte. Einfach mit Git und GitHub Actions.

---

## OK, seien wir ehrlich: Die Limits

Es ist 'n Hack, kein echter VPS. Also:

- **Max 6h pro Run.** Du musst den Workflow regelmäßig neu starten. Kein unendlicher Uptime.
- **Nichts für Produktion.** Du wirst deine Site nicht darauf hosten. Es ist zum Explorieren, Entwickeln, Debuggen, Testen von Zeug in 'nem wegwerfbaren aber wiederherstellbaren Linux.
- **GitHub sieht alles.** Es sind ihre Maschinen. Pack nichts Sensibles rein.
- **Halt das Repo privat.** Du exponierst 'ne SSH-Shell. 'N öffentliches Repo = potenziell jeder kann sich verbinden. Schlechte Idee.
- **Es ist am Rand der Nutzungsbedingungen.** GitHub Actions ist für CI/CD gedacht, nicht für kostenlose VPS. Also mit Maß verwenden, für legitime Zwecke, ohne zu missbrauchen.

### Die wahre Achillesferse: Git hasst große Dateien

Es gibt 'ne technischere Grenze, und das ist die wichtigste, die du verstehen musst.

**Git ist für Text gemacht, nicht für 'n Dateisystem.**

Die persistente Platte lebt in 'nem Git-Branch. Also geht alles, was du speicherst, durch Git. Und Git:
- kann mit großen Binärdateien schlecht umgehen (ein 2 GB Docker-Image in Git? vergiss es)
- hat 'n Limit von 100 MB pro Datei auf GitHub (harte Grenze, drüber pusht es nicht)
- empfiehlt, unter ~5 GB pro Repo zu bleiben

Also wenn du `npm install` in 'nem Projekt mit 500 MB `node_modules` machst, oder wenn du was baust, das schwere Binaries ausspuckt, wird der Push zum `filesystem`-Branch entweder extrem lahm oder scheitert komplett.

Das `git commit --amend` hilft (nur ein Commit, keine aufblasende History), aber es ändert nichts daran, dass 'ne 200 MB Datei nie durchkommt.

Kurz: **Es funktioniert super für Code, Configs, kleine Dateien. Es funktioniert nicht, um große Daten oder binäre Artefakte zu speichern.** Das musst du im Kopf behalten, wenn du in deiner Session arbeitest.

### Es ist kein kompletter System-Snapshot

Noch 'ne wichtige Nuance: Der Branch `filesystem` sichert das **Workspace** (den Ordner des Repos), nicht das ganze System.

Wenn du `apt install htop` machst, landet das Binary in `/usr/bin/htop`, das AUSSERHALB des Workspace liegt. Es wird NICHT gesichert. Beim nächsten Run musst du es neu installieren.

Deshalb gibt es den APT-Cache und das `prestart.sh`: um die System-Umgebung bei jedem Start neu vorzubereiten, weil nur das Workspace überlebt.

Wenn du willst, dass deine Installationen überleben, musst du sie ins Workspace packen (z.B. in 'nem lokalen Ordner installieren statt systemweit). Das ist 'ne Denkweise, die du dir aneignen musst.

---

## Kostenloser VPS vs echter VPS: Der Vergleich

| | repo-to-vps | Echter VPS (5€/Monat) |
|---|---|---|
| **Preis** | 0€ | ~5-10€/Monat |
| **Uptime** | 6h, neu starten | 24/7 |
| **Platte** | Git-Branch, kleine Dateien | echte SSD, mehrere GB |
| **RAM** | ~7 GB (großzügig!) | 1-2 GB oft |
| **CPU** | 2-4 ordentliche Kerne | 1-2 vCPU |
| **Setup** | Template klonen | manuelle Config |
| **Persistenz** | nur Workspace | komplettes System |
| **Legitimität** | Grenze der AGB | 100% sauber |

Das Lustige ist, dass der GitHub-Runner bei den Rohdaten (RAM, CPU) oft BESSER ist als 'n 5€-VPS. Aber der 6h-Uptime und die auf das Workspace beschränkte Persistenz machen es zu 'nem Hackerspielzeug, nicht zu 'nem echten Server.

Zum Lernen, Testen, schnellen Linux-Debuggen in 'ner wiederherstellbaren Umgebung? Perfekt. Um irgendwas Ernsthaftes zu hosten? Hol dir 'nen echten VPS.

Aber für 'ne temporäre Linux-Umgebung, die du nach Belieben wiederherstellen kannst? Einfach genial.

---

## Das Muster dahinter

Wenn du einen Schritt zurücktrittst, basieren repo-to-vps und der E-Mail-Bot (mein anderer Artikel) auf derselben Idee:

> **Git ist nicht nur ein Versionsverwalter. Es ist ein persistentes, kostenloses, versioniertes Speichersystem, das über 'ne API zugänglich ist.**

Sobald du 'n zustandsloses System hast (GitHub Actions, 'n Worker, 'ne Serverless-Funktion) und 'nen Zustand zwischen zwei Ausführungen behalten willst, kann Git als "Platte" dienen.

- Der E-Mail-Bot speichert 'ne `lastId` in 'nem Git-Tag.
- repo-to-vps speichert 'n ganzes Dateisystem in 'nem Git-Branch.

Gleiches Muster, zwei Größenordnungen. Ein Wert auf der einen Seite, 'ne Platte auf der anderen.

Und das `git commit --amend` + Force-Push ist die gemeinsame Technik: **du behältst 'nen einzigen Commit, der den aktuellen Zustand repräsentiert, der bei jedem Update überschrieben wird.**

War nicht dafür gedacht. Aber es funktioniert. Und ist kostenlos.

---

**Die 3 Dinge, die du dir merken solltest:**

1. **Ein Git-Branch = 'ne persistente Festplatte** -- Speichere dein Dateisystem in 'nem dedizierten Branch, stelle es beim Start wieder her, und du hast 'nen Zustand, der wegwerfbare Maschinen überlebt.

2. **Inotify + Git = Autosave in Echtzeit** -- `inotifywait` überwacht Änderungen auf Kernel-Ebene und pusht sofort zu Git. Mit `git commit --amend`, um 'nen einzigen sauberen Commit zu behalten.

3. **Tmate verwandelt 'nen Runner in 'nen VPS** -- Live-SSH auf 'ner GitHub-Actions-Maschine, mit automatischem Neustart und Ein-Kommando-Wiederverbindung über die GitHub-API.

Git als Festplatte, zweite Folge. Ich glaube, ich werde am Ende alles in Git-Branches speichern xD
