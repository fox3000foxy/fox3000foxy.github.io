---
title: "Repo to VPS: trasforma GitHub Actions in un VPS gratuito con storage persistente"
description: Come trasformare un runner GitHub Actions in un VPS sempre attivo usando git come storage persistente -- tmate, inotify e commit --amend.
date: 2026-05-29
tags:
  - github
  - devops
  - vps
  - actions
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "MEQCIETvIZYtwMF26a3VuCBqWmF063OYztMP6A47DUsO3cPVAiBOSVOMgYjVotzvTKKcnmOy+WPoBNu5ZrHOmKoLW+qTMQ=="
---

## GitHub ti regala un VPS gratis per 6h. Ho trovato come renderlo permanente.

GitHub Actions ti dà macchine Linux gratuite.

Tipo, veri server Ubuntu. 2 core, 7 GB di RAM, 14 GB di disco. Gratis. Per 6h a run.

L'unico "problema": alla fine del run, tutto viene cancellato. La macchina è usa e getta. Installi robe, codi, configuri... e puf, alla fine tutto scompare. Come se non avessi fatto niente.

A meno che.

A meno che tu non usi **git come disco rigido**.

E allora, di colpo, hai un VPS gratis con un disco persistente che sopravvive ai run. Ti riconnetti, è tutto ancora lì. Riprendi da dove eri rimasto.

È completamente rotto. Lascia che ti spieghi xD

---

## Il contesto: i runner GitHub Actions

Quando lanci un workflow GitHub Actions, GitHub ti fila una VM.

È fatta per buildare il tuo codice, lanciare i test, fare deploy. Il workflow gira, fa il suo lavoro, e la macchina viene distrutta.

Ma niente ti impedisce di fare altro con questa VM. Aprire una shell SSH e usarla come server.

Il fatto è che queste macchine sono **stateless** e **temporanee**:
- Temporanee: 6h max per run (`timeout-minutes: 360`, il limite di GitHub)
- Stateless: tutto cancellato alla fine

Quindi per farne un VPS utilizzabile, bisogna risolvere due problemi:
1. **Come connettersi sopra in tempo reale?**
2. **Come mantenere il disco tra un run e l'altro?**

È qui che diventa un hack.

---

## Problema 1: SSH live con tmate

**tmate** è un fork di tmux che crea una sessione SSH condivisibile.

Lo lanci su una macchina, ti genera due link:
- un URL SSH (`ssh xxx@nyc1.tmate.io`)
- un URL web (terminale nel browser)

Ti connetti con uno di questi link, e boom, sei in una shell sulla macchina. In tempo reale.

Il workflow quindi lancia tmate:

```bash
tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
tmate -S /tmp/tmate.sock set-option -g remain-on-exit on
tmate_ssh=$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')
tmate_web=$(tmate -S /tmp/tmate.sock display -p '#{tmate_web}')
```

E questi link vengono scritti direttamente nel README del repo da uno script Python. Apri il tuo repo, vedi il link di connessione, clicchi. Eccoti nel tuo VPS.

Primo problema risolto. Ma è il secondo che è veramente pazzesco.

---

## Problema 2: git come disco rigido

Ecco il trip mentale.

La macchina viene cancellata a ogni run. Quindi salviamo **il filesystem in un branch git dedicato**, chiamato `filesystem`.

All'avvio, lo script ripristina lo stato da quel branch:

```bash
filesystem_branch="filesystem"
git fetch origin "$filesystem_branch":refs/remotes/origin/$filesystem_branch
git checkout -B filesystem-workspace "refs/remotes/origin/$filesystem_branch"
git reset --hard "refs/remotes/origin/$filesystem_branch"
```

Il branch `filesystem` È il tuo disco rigido. I tuoi file, le tue installazioni, le tue configurazioni -- tutto è lì dentro.

Capisci il trucco? La macchina è usa e getta, ma il disco vive in git. Rilancia il workflow, il disco viene ripristinato, riprendi esattamente da dove eri.

È come un VPS che va in ibernazione. Solo che l'ibernazione è un repo git xD

### Primo avvio: creare il disco vuoto

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

Il `git checkout --orphan` è la chiave. Un branch orfano è un branch **senza nessuno storico** -- come se ripartissi da un repo vuoto.

Perché orfano? Perché NON vuoi che il tuo disco persistente si porti dietro tutto lo storico del tuo codice sorgente. Il disco è una cosa a parte, con una vita propria. Comincia vergine.

E il `git ls-remote --exit-code` all'inizio, è solo un check pulito: "il branch esiste già sul remote?". Se sì, non si tocca nulla. Se no, lo si crea. Idempotente, come piace a noi.

### Il git clean selettivo: proteggere le cache

Questa riga merita una sosta:

```bash
git clean -fdx -e .apt-cache -e .cache -e host.conf -e tmate.sock
```

`git clean -fdx` rimuove TUTTO ciò che non è tracciato da git. Normalmente è violento -- pulisce il workspace a fondo.

Ma i `-e` (exclude) proteggono alcune cose:
- `.apt-cache` → la cache dei pacchetti APT (ci torniamo, è furbo)
- `.cache` → cache generica
- `host.conf` → l'indirizzo SSH della sessione
- `tmate.sock` → il socket della sessione tmate in corso

Se pulissi questi file, romperesti la sessione attiva o perderesti la cache. Quindi li risparmiamo durante il reset.

Un dettaglio stupido a prima vista, ma senza questo tutto esplode.

---

## L'autosave: inotify che monitora tutto

Ok, ma come finiscono i file nel branch `filesystem`?

Risposta: un watcher che monitora TUTTE le modifiche ai file e fa commit/push automaticamente.

Lo strumento magico è **inotifywait** (dal pacchetto `inotify-tools'). Monitora il filesystem a livello kernel e si attiva appena un file cambia.

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

Analizziamo i flag di inotify, perché ognuno conta:
- `-r` → ricorsivo, monitora tutte le sottocartelle
- `-e modify,create,delete,move` → reagisce a questi 4 tipi di eventi (modifica, creazione, cancellazione, spostamento)
- `--exclude '...'` → una regex per ignorare certi file

Il `--exclude` è cruciale. Guarda cosa ignora:
- `.git` → ovviamente, altrimenti ogni commit scatenerebbe un autosave che scatenerebbe un commit... ciclo infinito. Catastrofe.
- `.apt-cache` e `.cache` → le cache, che cambiano in continuazione e non vogliamo spammare in git
- `host.conf` e `tmate.sock` → i file di sessione, che cambiano senza sosta
- `.gitignore`, `.txt.swp` → i file temporanei (i `.swp` sono i file di modifica di vim)

Senza questo exclude, ti ritroveresti con un autosave che si attiva a ripetizione sulle proprie modifiche. Il `.git` nella lista, è LA riga che ti impedisce di spararti sul piede.

Modifichi un file? inotify lo rileva istantaneamente, fa commit, fa push. In meno di un secondo, la tua modifica è nel branch `filesystem`.

Installi qualcosa, scrivi codice, modifichi una configurazione -- tutto viene salvato in tempo reale, automaticamente, senza che tu faccia nulla.

Hai letteralmente un sistema di backup automatico dell'intero disco. Rotto.

### Il debounce: non spammare git

Il `sleep 1` dopo ogni salvataggio è un **debounce**.

Quando salvi un file in un editor, spesso genera diversi eventi filesystem in raffica (creazione di un file temp, rename, cancellazione del vecchio...). Senza debounce, scatterebbero 3-4 commit per un singolo salvataggio.

Il `sleep 1` dice: "aspetta un secondo dopo un salvataggio, il tempo che la raffica si calmi, prima di riascoltare". Raggruppa le modifiche vicine in un unico commit. Furbo.

### E un salvataggio periodico in più

Nel caso inotify perdesse qualcosa, c'è anche un salvataggio ogni 5 secondi:

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

Cintura E bretelle. Non vogliamo assolutamente perdere lo stato del disco.

---

## Il dettaglio furbo: un singolo commit

Se fai commit a ogni modifica di file, accumuli... migliaia di commit. In un'ora di sessione, la tua storia git esplode. Il repo diventa enorme. È schifoso.

La soluzione è elegante: **si modifica il commit esistente** invece di crearne uno nuovo.

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

`git commit --amend` significa: "sostituisci l'ultimo commit con questo".

Così il branch `filesystem` ha SEMPRE un solo commit. Non importa quante volte salvi. È solo uno snapshot dello stato attuale, force-pushato ancora e ancora.

Il `flock` è un lucchetto: dato che ci sono due loop di salvataggio (inotify + periodico), bisogna evitare che lanciano git contemporaneamente e si pestino i piedi. Un solo processo git alla volta.

Pulito.

---

## Il sync_from_remote: gestire più sessioni

Ecco, una cosa a cui non pensi all'inizio: e se lanci DUE run contemporaneamente? O se una sessione modifica il branch `filesystem` mentre un'altra è in esecuzione?

Lo script gestisce la cosa con un `sync_from_remote` prima di ogni commit:

```bash
sync_from_remote() {
  git fetch origin "filesystem":refs/remotes/origin/filesystem
  git merge --ff-only "refs/remotes/origin/filesystem"
}
```

Il `--ff-only` (fast-forward only) è importante: significa "fare merge SOLO se si può andare avanti pulitamente, senza creare un commit di merge".

Se i due branch hanno divergito (tipo, due sessioni hanno modificato cose diverse), il fast-forward fallisce silenziosamente (`2>/dev/null || true`) e si mantiene lo stato locale. Non è un sistema di merge perfetto, ma evita corruzioni nel caso semplice in cui una sola sessione è attiva.

Onestamente, non bisogna lanciare 3 sessioni in parallelo sullo stesso repo. Ma il codice cerca comunque di non esplodere se succede. È difensivo.

---

## La cache APT: installare velocemente

C'è un dettaglio nel workflow che non sembra ma è ben pensato:

```yaml
- name: Cache & install APT packages (tmate + watcher)
  uses: awalsh128/cache-apt-pkgs-action@v1.6.0
  with:
    packages: tmate inotify-tools
```

tmate e inotify-tools vengono installati tramite un'azione che **fa cache dei pacchetti APT**.

Al primo run, scarica e installa. Ai run successivi, viene ripristinato dalla cache di GitHub Actions -- più veloce, senza bisogno di riscaricare.

E ti ricordi il `git clean -fdx -e .apt-cache` di prima? È collegato. La cartella `.apt-cache` è protetta dalla pulizia proprio perché i pacchetti che installi durante la sessione possano persistere un minimo.

Tutto si tiene.

---

## Gli script nascosti in /tmp

Ancora un dettaglio subdolo ma furbo. All'inizio dello script:

```bash
RUNNER_SCRIPTS_DIR="/tmp/runner-scripts"
rm -rf "$RUNNER_SCRIPTS_DIR"
mkdir -p "$RUNNER_SCRIPTS_DIR"
cp -r .github/scripts "$RUNNER_SCRIPTS_DIR/"
```

Gli script (`update_readme.py`, ecc.) vengono copiati in `/tmp` PRIMA di toccare il branch `filesystem`.

Perché? Perché quando fai `git reset --hard` verso il branch `filesystem` (che è vuoto all'inizio, o contiene il tuo disco), i file `.github/scripts` del repo originale scompaiono dal workspace.

Ma servono per aggiornare il README. Quindi li nasconde in `/tmp`:

```bash
python3 "$RUNNER_SCRIPTS_DIR/scripts/update_readme.py" --ssh "$tmate_ssh" ...
```

Se non ci pensi, lo script sparisce. Io ci ho pensato.

---

## La shell personalizzata

Piccolo comfort finale: la sessione ti dà una shell configurata, non un bash nudo.

Il `prestart.sh` copia un `.bashrc` custom:

```bash
if ! grep -q "Custom prompt and aliases for remote sessions" "$HOME/.bashrc"; then
  cp .github/scripts/remote_bashrc "$HOME/.bashrc"
fi
sudo cp "$HOME/.bashrc" /root/.bashrc
```

E questo `.bashrc` contiene un prompt colorato, alias (`ll`, `lla`, `rm -i`), e soprattutto una cosa furba: un override di `exit`:

```bash
exit() {
    killall -9 -u "$(whoami)" tmate 2>/dev/null || true
    builtin exit "$@"
}

bind -x '"\C-d": "exit"'
```

Quando scrivi `exit` (o Ctrl+D), uccide pulitamente i processi tmate prima di chiudere. Evita di lasciare sessioni tmate zombie in giro sulla macchina.

C'è anche una funzione `tmate-detach` se vuoi disconnetterti SENZA uccidere la sessione (per riconnetterti dopo). Dettaglio di comfort, ma mostra il livello di cura.

---

## Il tmate che si riavvia da solo

Piccolo comfort: se scrivi `exit` nella tua shell, normalmente la sessione tmate muore e vieni disconnesso per sempre.

Tranne che qui, tmate è in un loop `while true`:

```bash
while true; do
  tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
  while tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' >/dev/null 2>&1; do
    sleep 2
  done

  echo "tmate session ended; restarting..."
done
```

Fai `exit`? La sessione si riavvia da sola. Puoi riconnetterti con lo stesso link. Riconnessione stabile, anche dopo una disconnessione.

È stupido, ma lo rende utilizzabile.

---

## La riconnessione in un comando

Come ti riconnetti dopo una disconnessione, senza andare a cercare nei log del run ogni volta?

L'indirizzo SSH di tmate è scritto in un file `host.conf`, che a sua volta è committato nel branch `filesystem`:

```bash
printf '%s' "${tmate_ssh#ssh }" > host.conf
```

E poiché questo file è in git, puoi recuperarlo tramite l'API GitHub con un solo comando:

```bash
ssh "$(gh api -H 'Accept: application/vnd.github.v3.raw' \
  "/repos/USER/REPO/contents/host.conf?ref=filesystem" | tr -d '\r\n')"
```

Lanci questo, va a prendere l'indirizzo SSH attuale nel repo, e ti connette direttamente. Anche se l'indirizzo è cambiato tra due sessioni.

Fatto.

---

## Il flusso completo

Ricapitoliamo:

```
1. Attivi il workflow (push o pulsante manuale)
2. GitHub ti fila una VM Ubuntu
3. Lo script ripristina il disco dal branch "filesystem"
4. inotify comincia a monitorare tutte le modifiche
5. periodic_save fa commit ogni 5s come backup
6. tmate si avvia → genera i link SSH/web
7. I link vengono scritti nel README + host.conf
8. Ti connetti con ssh o il terminale web
9. Fai quello che vuoi (codare, installare, debug...)
   └── ogni modifica ai file = autosave istantaneo su git
10. 6h dopo, GitHub uccide la VM
11. Ma il tuo disco è intatto nel branch "filesystem"
12. Rilancia il workflow → torna al passo 3, tutto è ancora lì
```

Un VPS. Gratis. Con disco persistente. Solo con git e GitHub Actions.

---

## Ok, bisogna essere onesti: i limiti

È un hack, non un vero VPS. Quindi:

- **6h max per run.** Bisogna rilanciare il workflow regolarmente. Niente uptime infinito.
- **Non per produzione.** Non ospiterai il tuo sito lì sopra. È per esplorare, sviluppare, debug, testare qualcosa in un Linux usa e getta ma recuperabile.
- **GitHub vede tutto.** Sono le loro macchine. Non metterci nulla di sensibile.
- **Tieni il repo privato.** Esponi una shell SSH. Un repo pubblico = chiunque può potenzialmente connettersi. Pessima idea.
- **È al limite dei termini di servizio.** GitHub Actions è fatto per CI/CD, non per VPS gratis. Quindi da usare con parsimonia, per cose legittime, senza abusare.

### Il vero tallone d'Achille: git odia i file grandi

C'è un limite più tecnico, ed è il più importante da capire.

**Git è fatto per testo, non per un filesystem.**

Il disco persistente vive in un branch git. Quindi tutto ciò che salvi passa attraverso git. E git:
- gestisce male i file binari grandi (un'immagine Docker da 2 GB in git? scordatelo)
- ha un limite di 100 MB per file su GitHub (hard limit, non si pusha oltre)
- raccomanda di stare sotto ~5 GB per repo

Quindi se fai `npm install` di un progetto con 500 MB di `node_modules`, o se buildi qualcosa che produce binari pesanti, il push verso `filesystem` o farà una fatica bestiale, o fallirà del tutto.

Il `git commit --amend` aiuta (un solo commit, nessuna storia che si gonfia), ma non cambia il fatto che un file da 200 MB non passerà mai.

In pratica: **funziona benissimo per codice, configurazioni, file piccoli. Non funziona per salvare dati grossi o artefatti binari.** Bisogna tenerlo a mente su cosa fai nella tua sessione.

### Non è uno snapshot completo del sistema

Altra sfumatura importante: il branch `filesystem` salva il **workspace** (la cartella del repo), non tutto il sistema.

Se fai `apt install htop`, il binario finisce in `/usr/bin/htop`, che è FUORI dal workspace. Quindi NON verrà salvato. Al prossimo run, bisogna reinstallarlo.

È per questo che abbiamo la cache APT e `prestart.sh`: per ripreparare l'ambiente sistema a ogni avvio, visto che solo il workspace persiste.

Se vuoi che le tue installazioni sopravvivano, devi metterle nel workspace (tipo, installare in una cartella locale invece che di sistema). È una ginnastica da imparare.

---

## VPS gratis vs vero VPS: il confronto

| | repo-to-vps | Vero VPS (5€/mese) |
|---|---|---|
| **Prezzo** | 0€ | ~5-10€/mese |
| **Uptime** | 6h, da riavviare | 24/7 |
| **Disco** | branch git, file piccoli | vero SSD, diversi GB |
| **RAM** | ~7 GB (generoso!) | 1-2 GB spesso |
| **CPU** | 2-4 core decenti | 1-2 vCPU |
| **Setup** | clona un template | configurazione manuale |
| **Persistenza** | solo workspace | sistema completo |
| **Legittimità** | al limite dei ToS | 100% clean |

La cosa divertente è che a livello di specifiche pure (RAM, CPU), il runner GitHub è spesso MIGLIORE di un VPS da 5€. Ma l'uptime di 6h e la persistenza limitata al workspace sono ciò che lo rendono un giocattolo da hacker, non un vero server.

Per imparare, testare, fare debug rapido di qualcosa in Linux in un ambiente recuperabile? Perfetto. Per ospitare qualunque cosa di serio? Prendi un vero VPS.

Ma per un ambiente Linux temporaneo che puoi ripristinare a piacimento? Semplicemente geniale.

---

## Il pattern dietro tutto questo

Se fai un passo indietro, repo-to-vps e il bot email (il mio altro articolo) si basano sulla stessa idea:

> **Git non è solo un sistema di versionamento. È un sistema di storage persistente, gratuito, versionato, accessibile tramite API.**

Appena hai un sistema stateless (GitHub Actions, un Worker, una funzione serverless) e vuoi mantenere uno stato tra due esecuzioni, git può fungere da "disco".

- Il bot email salva un `lastId` in un tag git.
- repo-to-vps salva un intero filesystem in un branch git.

Stesso pattern, due scale. Un valore da una parte, un disco dall'altra.

E il `git commit --amend` + force-push è la tecnica comune: **mantieni un singolo commit che rappresenta lo stato attuale, sovrascritto a ogni aggiornamento.**

Non è stato progettato per questo. Ma funziona. Ed è gratis.

---

**Le 3 cose da ricordare:**

1. **Un branch git = un disco rigido persistente** -- Salva il tuo filesystem in un branch dedicato, ripristina all'avvio, e hai uno stato che sopravvive alle macchine usa e getta.

2. **inotify + git = autosave in tempo reale** -- `inotifywait` monitora le modifiche a livello kernel e fa push su git istantaneamente. Con `git commit --amend` per mantenere un singolo commit pulito.

3. **tmate trasforma un runner in VPS** -- SSH live su una macchina GitHub Actions, con riavvio automatico e riconnessione in un comando tramite l'API GitHub.

Git come disco rigido, secondo episodio. Credo che finirò per salvare tutto in branch git xD