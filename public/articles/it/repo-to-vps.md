---
title: "Repo to VPS: trasformare GitHub Actions in VPS gratis con storage persistente"
description: "Come trasformare un runner GitHub Actions in VPS permanente con git come storage persistente: tmate, inotify e commit --amend."
date: 2026-05-29
tags:
  - github
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "/tVY2264LJc82b8Gotu/BHgtUYtJO5NuXsyZujuwCuhXSizi4g/yEK5JG9N2gaOv//+obkvr+V6PF16kDGPfmA=="
---

## GitHub ti dà un VPS gratis per 6 ore. Ho trovato come renderlo permanente.

GitHub Actions ti dà macchine Linux gratis.

Tipo, veri server Ubuntu. 2 core, 7 GB di RAM, 14 GB di disco. Gratis. Per 6 ore per run.

L'unico "problema": alla fine del run, tutto è cancellato. La macchina è usa e getta. Installi pacchetti, programmi, configuri... e puff, alla fine tutto sparisce. Come se non avessi fatto niente.

A meno che.

A meno che usi **git come disco rigido**.

E lì, d'un colpo, hai un VPS gratis con un disco persistente che sopravvive ai run. Ti riconnetti, tutto è ancora lì. Riprendi dove ti eri fermato.

È completamente rotto. Lascia che ti spieghi.

---

## Il contesto: i runner GitHub Actions

Quando lanci un workflow GitHub Actions, GitHub ti dà una VM.

È fatta per buildare il tuo codice, lanciare i tuoi test, fare deploy. Il workflow gira, fa il suo lavoro, e la macchina è distrutta.

Ma niente ti impedisce di fare altro con questa VM. Tipo, aprire una shell SSH sopra e usarla come un server.

Il vincolo, è che queste macchine sono **stateless** e **temporanee**:
- Temporanea: 6 ore max per run (`timeout-minutes: 360`, il tetto di GitHub)
- Stateless: tutto è cancellato alla fine

Quindi per farne un VPS usabile, bisogna risolvere due problemi:
1. **Come connettersi sopra in tempo reale?**
2. **Come tenere il disco tra due run?**

Lì diventa uno sporco hack.

---

## Problema 1: l'SSH live con tmate

**tmate** è un fork di tmux che crea una sessione SSH condivisibile.

Lo lanci su una macchina, ti genera due link:
- un URL SSH (`ssh xxx@nyc1.tmate.io`)
- un URL web (terminale nel browser)

Ti connetti con uno di questi link, e boom, sei in una shell sulla macchina. In tempo reale.

Il workflow lancia quindi tmate:

```bash
tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
tmate -S /tmp/tmate.sock set-option -g remain-on-exit on

# recupera i link di connessione
tmate_ssh=$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')
tmate_web=$(tmate -S /tmp/tmate.sock display -p '#{tmate_web}')
```

E questi link sono scritti diretto nel README del repo da uno script Python. Apri il tuo repo, vedi il link di connessione, clicchi. Eccoti nel tuo VPS.

Primo problema risolto. Ma è il secondo che è davvero folle.

---

## Problema 2: git come disco rigido

Ecco l'idea che cambia tutto.

La macchina è cancellata a ogni run. Quindi salviamo **il filesystem in un branch git dedicato**, chiamato `filesystem`.

All'avvio, lo script ripristina lo stato da questo branch:

```bash
filesystem_branch="filesystem"

# recupera il branch filesystem dal remote
git fetch origin "$filesystem_branch":refs/remotes/origin/$filesystem_branch

# ripristina il workspace da questo branch
git checkout -B filesystem-workspace "refs/remotes/origin/$filesystem_branch"
git reset --hard "refs/remotes/origin/$filesystem_branch"
```

Il branch `filesystem` È il tuo disco rigido. I tuoi file, le tue install, le tue config: tutto è dentro.

Vedi l'idea? La macchina è usa e getta, ma il disco vive in git. Rilanci il workflow, il disco è ripristinato, riprendi esattamente dove eri.

È come un VPS che iberna. Solo che l'ibernazione è un repo git

### Primo lancio: crea il disco vuoto

Al primissimo run, il branch `filesystem` non esiste ancora. Bisogna crearlo. E non è banale:

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

Il `git checkout --orphan` è la chiave. Un branch orfano è un branch **senza alcuno storico**: come se ripartissi da un repo vuoto.

Perché orfano? Perché NON vuoi che il tuo disco persistente si trascini tutto lo storico del tuo codice sorgente. Il disco resta isolato, con la sua vita. Inizia vergine.

E il `git ls-remote --exit-code` all'inizio, è solo un check pulito: "il branch esiste già sul remote?". Se sì, non tocchiamo niente. Se no, lo creiamo. Idempotente, come piace.

### Il git clean selettivo: proteggi le cache

Questa riga merita di fermarci sopra:

```bash
git clean -fdx -e .apt-cache -e .cache -e host.conf -e tmate.sock
```

`git clean -fdx` toglie TUTTO ciò che non è tracciato da git. Normalmente è violento: pulisce il workspace a fondo.

Ma i `-e` (exclude) proteggono certi file:
- `.apt-cache` → la cache dei pacchetti APT (ci torniamo, è furbo)
- `.cache` → cache generica
- `host.conf` → l'indirizzo SSH della sessione
- `tmate.sock` → il socket della sessione tmate in corso

Se pulissi quei file, romperesti la sessione attiva o perderesti la tua cache. Quindi li risparmiamo durante il reset.

Un dettaglio scemo a prima vista, ma senza questo tutto si rompe.

---

## L'autosave: inotify che sorveglia tutto

Bene, ma come finiscono i file nel branch `filesystem`?

Risposta: un watcher che sorveglia TUTTI i cambiamenti di file e fa commit/push automaticamente.

Lo strumento magico è **inotifywait** (del pacchetto `inotify-tools`). Sorveglia il filesystem a livello kernel e scatta appena un file cambia.

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock|\.gitignore|\.txt\.swp)(/|$)' .; do
    echo "[autosave] change detected"
    commit_and_push
    sleep 1   # debounce se tanti cambiamenti in un colpo
  done
}

autosave &
```

Scomponiamo i flag inotify, perché ognuno conta:
- `-r` → ricorsivo, sorveglia tutte le sottocartelle
- `-e modify,create,delete,move` → reagisce a questi 4 tipi di eventi
- `--exclude '...'` → una regex per ignorare certi file

Il `--exclude` è cruciale. Guarda cosa ignora:
- `.git` → ovvio, altrimenti ogni commit innescherebbe un autosave che innescherebbe un commit... ciclo infinito. Catastrofe.
- `.apt-cache` e `.cache` → le cache, che cambiano sempre e che non vogliamo spammare in git
- `host.conf` e `tmate.sock` → i file di sessione, che si muovono senza sosta
- `.gitignore`, `.txt.swp` → i file temporanei (i `.swp` sono i file di editing di vim)

Senza questo exclude, ti ritroveresti con un autosave che scatta in ciclo sui suoi cambiamenti. Il `.git` nella lista, è LA riga che ti impedisce di spararti in un piede.

Modifichi un file? inotify lo rileva istantaneamente, fa commit, fa push. In meno di un secondo, il tuo cambiamento è nel branch `filesystem`.

Installi un pacchetto, scrivi codice, tocchi una config: tutto è salvato in tempo reale, automaticamente, senza che tu faccia niente.

Hai letteralmente un sistema di salvataggio automatico dell'intero disco. Rotto.

### Il debounce: non spammare git

Il `sleep 1` dopo ogni save è un **debounce**.

Quando salvi un file in un editor, spesso genera più eventi filesystem in raffica (creazione di un file temp, rename, cancellazione del vecchio...). Senza debounce, innescheresti 3-4 commit per un solo salvataggio.

Lo `sleep 1` dice: "aspetta un secondo dopo un save, il tempo che la raffica si calmi, prima di riascoltare". Raggruppa i cambiamenti ravvicinati in un solo commit. Furbo.

### E un salvataggio periodico in più

Nel caso inotify perda un evento, c'è anche un save ogni 5 secondi:

```bash
periodic_save() {
  while true; do
    sync_from_remote   # recupera eventuali cambiamenti remoti
    sleep 5
    commit_and_push
  done
}

periodic_save &
```

Cintura E bretelle. Non vogliamo proprio perdere lo stato del disco.

---

## Il dettaglio furbo: un solo commit

Se fai commit a ogni cambiamento di file, accumulerai migliaia di commit. In un'ora di sessione, il tuo storico git esplode. Il repo diventa enorme. È schifoso.

La soluzione è elegante: **facciamo amend del commit esistente** invece di crearne uno nuovo.

```bash
commit_and_push() {
  (
    flock -n 200 || return   # lock perché due save non girino insieme

    git add -A
    git reset -- .github/workflows/ .github/scripts/   # non toccare gli script

    if ! git diff --cached --quiet; then
      if git rev-parse --verify HEAD >/dev/null 2>&1; then
        git commit --amend --no-edit    # AMEND: schiaccia il commit precedente
      else
        git commit -m "autosave $(date -u +%Y%m%dT%H%M%SZ)"
      fi
      git push --force origin "filesystem-workspace:filesystem"
    fi
  ) 200>/tmp/tmate_autosave.lock
}
```

`git commit --amend` vuol dire: "sostituisci l'ultimo commit con questo".

Così il branch `filesystem` ha SEMPRE un solo commit. Non importa quante volte salvi. È solo uno snapshot dello stato attuale, force-push ancora e ancora.

Il `flock` è un lock: dato che ci sono due cicli di save (inotify + periodico), bisogna evitare che lancino git insieme e si pestino i piedi. Un solo processo git alla volta.

Pulito.

---

## Il sync_from_remote: gestisci più sessioni

Tieni, un caso a cui non pensi all'inizio: e se lanci DUE run insieme? O se una sessione modifica il branch `filesystem` mentre un'altra gira?

Lo script gestisce questo con un `sync_from_remote` prima di ogni commit:

```bash
sync_from_remote() {
  git fetch origin "filesystem":refs/remotes/origin/filesystem
  git merge --ff-only "refs/remotes/origin/filesystem"
}
```

Il `--ff-only` (fast-forward only) è importante: vuol dire "fai merge SOLO se possiamo avanzare pulitamente, senza creare un commit di merge".

Se entrambi i branch sono divergenti (tipo, due sessioni hanno modificato file diversi), il fast-forward fallisce silenziosamente (`2>/dev/null || true`) e teniamo lo stato locale. Non è un sistema di merge perfetto, ma evita corruzioni nel caso semplice dove gira una sola sessione.

Onestamente, non bisogna lanciare 3 sessioni in parallelo sullo stesso repo. Ma il codice prova comunque a non esplodere se succede. È difesa.

---

## La cache APT: installa in fretta

C'è un dettaglio nel workflow che non paga di aspetto ma è ben pensato:

```yaml
- name: Cache & install APT packages (tmate + watcher)
  uses: awalsh128/cache-apt-pkgs-action@v1.6.0
  with:
    packages: tmate inotify-tools
```

tmate e inotify-tools sono installati via un'azione che **fa cache dei pacchetti APT**.

Al primo run, scarica e installa. Ai run successivi, è ripristinato dalla cache GitHub Actions: più rapido, niente bisogno di riscaricare.

E ti ricordi il `git clean -fdx -e .apt-cache` di prima? È collegato. La cartella `.apt-cache` è protetta dalla pulizia proprio perché i pacchetti che installi durante la sessione possano persistere un minimo.

Tutto torna. Ho pensato al ciclo di vita completo.

---

## Gli script nascosti in /tmp

Ancora un dettaglio vizioso ma furbo. All'inizio dello script:

```bash
RUNNER_SCRIPTS_DIR="/tmp/runner-scripts"
rm -rf "$RUNNER_SCRIPTS_DIR"
mkdir -p "$RUNNER_SCRIPTS_DIR"
cp -r .github/scripts "$RUNNER_SCRIPTS_DIR/"
```

Gli script (`update_readme.py`, ecc.) sono copiati in `/tmp` PRIMA di toccare il branch `filesystem`.

Perché? Perché quando fai il `git reset --hard` verso il branch `filesystem` (che è vuoto all'inizio, o che contiene il tuo disco), i file `.github/scripts` del repo sorgente spariscono dal workspace.

Ma lo script ne ha ancora bisogno durante la sessione (per aggiornare il README a ogni rilancio di tmate). Quindi li nasconde in `/tmp`, fuori portata di git:

```bash
python3 "$RUNNER_SCRIPTS_DIR/scripts/update_readme.py" --ssh "$tmate_ssh" ...
```

Se non ci pensi, peni 30 minuti a capire perché il tuo script è sparito. Io ci ho pensato.

---

## La shell su misura

Piccolo comfort: la sessione ti dà una shell configurata, non un bash nudo.

Il `prestart.sh` copia un `.bashrc` custom:

```bash
if ! grep -q "Custom prompt and aliases for remote sessions" "$HOME/.bashrc"; then
  cp .github/scripts/remote_bashrc "$HOME/.bashrc"
fi
sudo cp "$HOME/.bashrc" /root/.bashrc
```

E questo `.bashrc` contiene un prompt colorato, alias (`ll`, `lla`, `rm -i`), e soprattutto un override di `exit`:

```bash
exit() {
    killall -9 -u "$(whoami)" tmate 2>/dev/null || true
    builtin exit "$@"
}

# Ctrl+D fa uguale a exit
bind -x '"\C-d": "exit"'
```

Quando digiti `exit` (o Ctrl+D), uccide pulitamente i processi tmate prima di chiudere. Evita di lasciare sessioni tmate zombie.

C'è anche una funzione `tmate-detach` se vuoi disconnetterti SENZA uccidere la sessione (per riconnetterti dopo). Dettaglio di comfort, ma mostra il livello di cura.

---

## Il tmate che si rilancia da solo

Piccolo comfort: se digiti `exit` nella tua shell, normalmente la sessione tmate muore e sei disconnesso per sempre.

Solo che qui, tmate è in un ciclo `while true`:

```bash
while true; do
  tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
  while tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' >/dev/null 2>&1; do
    sleep 2
  done
  echo "tmate session ended; restarting..."
done
```

Fai `exit`? La sessione riparte da sola. Ti riconnetti con lo stesso link.

È scemo, ma rende la sessione usabile.

---

## La riconnessione in un comando

Come ti riconnetti dopo una disconnessione, senza andare a scavare nei log del run ogni volta?

L'indirizzo SSH di tmate è scritto in un file `host.conf`, committato nel branch `filesystem`:

```bash
printf '%s' "${tmate_ssh#ssh }" > host.conf
```

E dato che questo file è in git, puoi recuperarlo via l'API GitHub con un solo comando:

```bash
ssh "$(gh api -H 'Accept: application/vnd.github.v3.raw' \
  "/repos/USER/REPO/contents/host.conf?ref=filesystem" | tr -d '\r\n')"
```

Lanci questo, va a cercare l'indirizzo SSH attuale nel repo, e ti connette. Anche se l'indirizzo è cambiato tra due sessioni.

---

## Il flusso completo

Ricapitoliamo:

1. Attivi il workflow (push o pulsante manuale)
2. GitHub ti dà una VM Ubuntu
3. Lo script ripristina il disco dal branch "filesystem"
4. inotify inizia a sorvegliare tutti i cambiamenti
5. periodic_save fa commit ogni 5s in backup
6. tmate parte → genera i link SSH/web
7. I link sono scritti nel README + host.conf
8. Ti connetti con ssh o il terminale web
9. Fai ciò che vuoi: ogni cambiamento di file = autosave
10. 6 ore dopo, GitHub uccide la VM
11. Il tuo disco è intatto nel branch "filesystem"
12. Rilanci il workflow → torna al passo 3, tutto è ancora lì

Un VPS gratis con disco persistente. Solo con git e GitHub Actions.

---

## Bene, bisogna essere onesti: i limiti

È un hack, non un vero VPS. Quindi:

- **6 ore max per run.** Bisogna rilanciare il workflow regolarmente. Uptime limitato a ogni run.
- **Riservato a dev ed esplorazione.** Non ci ospiterai il tuo sito. È per esplorare, fare dev, debug, testare un ambiente Linux usa e getta ma recuperabile.
- **GitHub vede tutto.** Sono le loro macchine. Non metterci niente di sensibile.
- **Tieni il repo privato.** Esponi una shell SSH. Un repo pubblico = chiunque può potenzialmente connettervisi. Cattiva idea.
- **È al limite delle condizioni d'uso.** GitHub Actions è fatto per CI/CD, non per VPS gratis. Quindi da usare con parsimonia, per cose legittime, senza abusare.

### Il vero tallone d'Achille: git odia i file grossi

Git è fatto per testo, non per un filesystem.

Il disco persistente vive in un branch git. Quindi tutto ciò che salvi passa da git. E git:
- gestisce male i grossi file binari (un'immagine Docker da 2 GB in git? scorda)
- ha un limite di 100 MB per file su GitHub (hard limit, non fa push oltre)
- raccomanda di restare sotto circa 5 GB per repo

Quindi se fai `npm install` di un progetto con 500 MB di `node_modules`, o se buildi un progetto che genera binari pesanti, il push verso `filesystem` o ramerà a morte, o fallirà proprio.

Il `git commit --amend` aiuta (un solo commit, niente storico che gonfia), ma non cambia il fatto che un file da 200 MB non passerà mai.

In pratica: **funziona super per codice, config, piccoli file. Non funziona per salvare grossi dati o artefatti binari.** Bisogna tenerlo a mente su ciò che fai nella sessione.

### Non è uno snapshot di sistema completo

Altra sfumatura importante: il branch `filesystem` salva il **workspace** (la cartella del repo), non tutto il sistema.

Se fai `apt install htop`, il binario va in `/usr/bin/htop`, che è FUORI dal workspace. Quindi NON sarà salvato. Al prossimo run, bisogna reinstallarlo.

Ecco perché abbiamo la cache APT e il `prestart.sh`: per ripreparare l'ambiente di sistema a ogni avvio, visto che solo il workspace persiste.

Se vuoi che le tue install sopravvivano, bisogna metterle nel workspace (tipo, installare in una cartella locale invece che in sistema). È una ginnastica da integrare.

---

## VPS gratis contro vero VPS: il match

| | repo-to-vps | Vero VPS (5€/mese) |
|---|---|---|
| **Prezzo** | 0€ | circa 5-10€/mese |
| **Uptime** | 6 ore, da rilanciare | 24/7 |
| **Disco** | branch git, piccoli file | vero SSD, vari GB |
| **RAM** | circa 7 GB (generoso!) | 1-2 GB spesso |
| **CPU** | 2-4 core corretti | 1-2 vCPU |
| **Setup** | clona un template | config manuale |
| **Persistenza** | solo workspace | sistema completo |
| **Legittimità** | limite delle CGU | 100% pulito |

Il punto interessante è che lato spec grezze (RAM, CPU), il runner GitHub è spesso MIGLIORE di un VPS a 5€. Ma l'uptime di 6 ore e la persistenza limitata al workspace, è ciò che ne fa un giocattolo da hacker, non un vero server.

Per imparare, testare, debuggare un sistema Linux in fretta in un ambiente recuperabile? Perfetto. Per ospitare qualsiasi cosa seria? Prendi un vero VPS.

Ma per un ambiente Linux temporaneo che puoi ripristinare a volontà? È semplicemente geniale.

---

## Il pattern dietro tutto questo

Se prendi distanza, repo-to-vps e il bot email (l'altro mio articolo) poggiano sulla stessa idea:

> **Git non è solo un gestore di versioni. È un sistema di storage persistente, gratis, versionato, accessibile via API.**

Appena hai un sistema stateless (GitHub Actions, un Worker, una funzione serverless) e vuoi tenere uno stato tra due esecuzioni, git può servire da "disco".

- Il bot email salva un `lastId` in un tag git.
- repo-to-vps salva un intero filesystem in un branch git.

Stesso pattern, due scale. Un valore da un lato, un disco dall'altro.

E il `git commit --amend` + force-push è la tecnica comune: **tieni un solo commit che rappresenta lo stato attuale, schiacciato a ogni update.**

Non è fatto per questo. Ma funziona. Ed è gratis.

---

**I 3 punti da trattenere:**

1. **Un branch git = un disco rigido persistente**: salva il tuo filesystem in un branch dedicato, ripristina all'avvio, e hai uno stato che sopravvive alle macchine usa e getta.

2. **inotify + git = autosave tempo reale**: `inotifywait` sorveglia i cambiamenti a livello kernel e fa push verso git istantaneamente. Con `git commit --amend` per tenere un solo commit pulito.

3. **tmate trasforma un runner in VPS**: SSH live su una macchina GitHub Actions, con restart automatico e riconnessione in un comando via l'API GitHub.

Git come disco rigido, secondo episodio. Credo che finirò per salvare tutto in branch git
