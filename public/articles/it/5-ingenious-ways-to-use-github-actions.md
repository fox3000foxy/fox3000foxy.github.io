---
title: "5 modi ingegnosi per usare GitHub Actions (e cosa insegnano sui secret)"
description: "Un runner CI trasformato in VPS gratuito, un bot che apre le sue pull request, un publish npm senza alcun secret. Giro dei miei repo per elencare i pattern GitHub Actions che vanno oltre il semplice \"lint + test + deploy\"."
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "A5uXMNMatu0UKgIBBhwwPBkEKRrm0aH7ayd04b2YFNq/Pa+QhOGz7G1F9d1Q/jNKDSaruaw8UJvqnWkyUUWykw=="
---

# 5 modi ingegnosi per usare GitHub Actions

GitHub Actions, sulla carta, serve per CI/CD classico: fai push, lui fa lint, testa, deploya. Ho già scritto di un caso particolare (usare i tag git come database per un bot email, vedi l'articolo dedicato). Ma scavando nei miei repo, ci sono abbastanza pattern diversi da meritare un articolo a parte, meno centrato su un solo progetto, più catalogo di tecniche.

Cinque usi, dal più classico al più strambo.

## 1. Un tag git come stato persistente tra due run

Promemoria veloce, il dettaglio completo è nell'articolo su `email-autoreply`. GitHub Actions è stateless per design: ogni run parte da una macchina pulita. La scappatoia: salvare un valore (un ID, un timestamp, un piccolo stato qualsiasi) in un tag git dedicato, mai in un branch.

```bash
# leggi lo stato
git show refs/tags/lastid:data/lastId > data/lastId

# scrivi lo stato (branch orfano, un solo commit, force-push del tag)
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```

Il punto chiave: un branch orfano per non accumulare mai storico, e un tag forzato invece di un branch per non inquinare la lista dei branch del repo.

## 2. Un tag git come cache di build precompilata

Stessa famiglia di idea, altro uso: invece di salvare uno stato applicativo, salvi un **artefatto di build**. Il job `build` compila il codice una volta (su push verso `master`), poi spinge `dist/` + `node_modules/` in un tag `runtime`. Il job `cron`, invece, fa checkout direttamente di quel tag invece di lanciare `bun install && bun run build` a ogni esecuzione:

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# niente install, niente build: il codice è già pronto
- run: node dist/index.js --action
```

Cambia il run da circa 20s a circa 10s. Su un cron che gira spesso, conta. `actions/cache` fa un lavoro simile (mette in cache le dipendenze), ma un tag git è più diretto quando vuoi proprio congelare un artefatto versionato e puntarlo in modo esplicito, invece di accelerare solo un `npm install`.

## 3. Un solo check obbligatorio che aggrega più job

Piccolo pattern che sembra niente ma ti cambia la vita nella configurazione dei branch protetti. Su `konosuba-rpg`, la CI ha tre job indipendenti (`typecheck`, `lint`, `tests`) che girano in parallelo, e un quarto job, `test-battery`, che non fa altro che dipendere dai primi tre:

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

Senza questo job facciata, configurare un branch protetto richiederebbe di spuntare tre check obbligatori separati, e di aggiornare quella lista ogni volta che un job viene aggiunto o rinominato. Con `test-battery`, un solo nome da spuntare nelle impostazioni del repo, che resta stabile anche se il dettaglio interno cambia.

## 4. Trasformare un runner gratuito in VPS temporaneo

Questo è il più strambo di tutti, e chiaramente il mio preferito: `repo-to-vps` stravolge completamente l'uso previsto di un runner GitHub Actions per farne una macchina Linux accessibile via SSH, gratuita, per fino a 6 ore (il limite massimo di un job).

Il principio: un job che non fa quasi altro che lanciare [tmate](https://tmate.io/) (un fork di tmux che espone una sessione terminale condivisibile via SSH o browser):

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

Il vero rompicapo è che il filesystem di un runner GitHub Actions è **usa e getta**: appena il job finisce, tutto sparisce. Una sessione SSH che dura ore non serve a niente se tutto quello che ci fai evapora al run successivo. La soluzione: un branch git che serve da snapshot live del filesystem, sincronizzato in continuo.

Lo script `start-tmate.sh` fa, in ordine:

1. **Ripristina** il filesystem da un branch dedicato `filesystem` all'avvio del job (`git reset --hard` su di esso).
2. **Sorveglia** i cambiamenti dei file con `inotifywait` in continuo, e fa **commit + push immediato** appena un file si muove:

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1   # debounce
  done
}
```

3. Ogni salvataggio fa **amend** del commit precedente invece di crearne uno nuovo (`git commit --amend --no-edit`), quindi il branch `filesystem` resta sempre a un solo commit, e questo evita l'accumulo di migliaia di snapshot.
4. Un ciclo `while true` rilancia `tmate` automaticamente se la sessione muore, con `remain-on-exit on` così il terminale resta raggiungibile anche dopo un `exit`.
5. L'URL SSH generato da tmate viene scritto in un file `host.conf`, committato sul branch `filesystem`, quindi recuperabile via API GitHub (`gh api .../contents/host.conf`) senza aver mai avuto accesso ai log del job in diretta.
6. Una routine `periodic_save` gira ogni 5 secondi in background, nel caso `inotifywait` perda un evento.

Risultato: una shell Linux completa, accessibile da ovunque, con un filesystem che persiste tra le sessioni, mentre l'infrastruttura sotto (un runner GitHub Actions) non è assolutamente stata pensata per questo. L'unico vero limite è il timeout di 6h per job: dopo tocca rilanciare il workflow.

## 5. Un bot che apre le sue pull request

Su `konosuba-rpg`, un push sul branch `dev` attiva un job che verifica se esiste già una pull request aperta verso `main`, e ne crea una automaticamente altrimenti, via `actions/github-script` e API REST GitHub:

```js
// confronta i commit tra base e head
const { data: comparison } = await github.rest.repos.compareCommits({
  owner, repo, base: 'main', head: 'dev',
});
if (comparison.ahead_by === 0) return; // niente da proporre

// controlla se esiste già una PR aperta
const { data: existing } = await github.rest.pulls.list({
  owner, repo, state: 'open', head: `${owner}:dev`, base: 'main',
});
if (existing.length > 0) return; // già una PR aperta

// crea la PR automatica
await github.rest.pulls.create({
  owner, repo, head: 'dev', base: 'main',
  title: 'chore: auto PR from dev to main',
});
```

Il dettaglio che conta qui è il token usato. Questo workflow **non** usa il `GITHUB_TOKEN` automatico: richiede un secret separato `AUTO_PR_TOKEN`, e si rifiuta di continuare se manca:

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

## 6. Pubblicare su npm senza alcun secret

Il più discreto dei cinque, ma probabilmente il più importante per il futuro: il workflow `publish.yml` di `typescript-virtual-container` non contiene **alcun secret npm**. Nessun `NPM_TOKEN`, nessun `NODE_AUTH_TOKEN`. Solo questo:

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

`npm publish` funziona comunque, perché il registro npm ormai supporta il **trusted publishing** via OIDC: il workflow prova la sua identità direttamente al registro (repo + workflow esatti, configurati su npmjs.org), senza che alcun token statico transiti o venga salvato da nessuna parte. Zero secret da far trapelare, zero token da ruotare ogni sei mesi.

---

## I secret GitHub, in profondità

Questi cinque pattern toccano tutti, in un modo o nell'altro, la questione dei secret. Alcuni principi che tornano ovunque nei miei workflow:

**Un secret non è per forza una semplice stringa.** In `email-autoreply`, `ACCOUNTS_JSON` contiene l'intero JSON minimizzato della config multi-account: una struttura dati completa invece di una semplice chiave API, iniettata così com'è in un file al runtime:

```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

Evita di dover committare un file di config, anche cifrato, e si aggiorna in un clic nelle impostazioni del repo senza toccare il codice.

**`GITHUB_TOKEN` ha limiti precisi, ed è voluto.** Il token automatico che GitHub inietta a ogni run è potente, ma sigillato su alcuni punti: di default non può attivare un altro workflow, e secondo la configurazione del repo può essere bloccato dalle regole di protezione dei branch. È esattamente per questo che `create-pull-request.yml` richiede un PAT separato (`AUTO_PR_TOKEN`): un token che viene da un vero account (o da una GitHub App), con diritti espliciti `contents:write` + `pull-requests:write`, distinto dal token effimero del job.

**I permessi si definiscono job per job, non globalmente.** Ogni workflow che ho elencato qui dichiara un blocco `permissions:` minimo e commentato:

```yaml
permissions:
  contents: read
  actions: read
  checks: write
  # Only allow writing checks, everything else is read-only
```

Il `GITHUB_TOKEN` di default ha storicamente diritti abbastanza ampi su un repo pubblico; restringerlo in modo esplicito a ciò di cui il job ha davvero bisogno limita i danni se un'azione di terzi nella catena (`uses: qualcuno/action@versione`) si rivela compromessa.

**Il miglior secret è quello che non esiste.** Il pattern OIDC di `typescript-virtual-container` è la versione più riuscita di questa idea: invece di gestire rotazione, scadenza e rischio di fuga di un `NPM_TOKEN`, il workflow prova in modo crittografico la sua identità (questo repo preciso, questo workflow preciso) direttamente al servizio terzo. Stessa logica disponibile per AWS, Docker Hub, PyPI: sempre più registri e cloud supportano OIDC da GitHub Actions.

---

**3 punti chiave**

1. Un tag git (orfano, force-push) può servire da database minimalista o da cache di build precompilata: due usi distinti dello stesso meccanismo.
2. Un runner GitHub Actions gratuito può diventare una shell SSH persistente se accetti di sincronizzare il suo filesystem in continuo verso un branch git, con autosave via `inotifywait` e un solo commit in amend.
3. Il `GITHUB_TOKEN` di default è volutamente limitato: creare PR tra branch o pubblicare senza secret richiede o un PAT dedicato, o il passaggio a OIDC trusted publishing.
