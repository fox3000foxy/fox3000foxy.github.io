---
title: "5 modi ingegnosi di usare GitHub Actions (e cosa insegnano sui segreti)"
description: "Un runner CI trasformato in VPS gratuito, un bot che apre le proprie pull request, un publish npm senza alcun segreto. Un tour dei miei repo per catalogare pattern GitHub Actions che vanno oltre il classico \"lint + test + deploy\"."
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "9dpR2GVT4zf4ZIOCsHG5UrebXwCQccQ6nAitREFVYmz0vhH1vP7kwkFp2JaYxD3vVtvdA0PDfjpGdye9nFAKCg=="
---

# 5 modi ingegnosi di usare GitHub Actions

Sulla carta, GitHub Actions serve per CI/CD classico: fai push, linta, testa, deploya. Ho già scritto su un caso particolare -- usare i git tag come database per un bot email (vedi l'articolo dedicato). Ma scavando nei miei repo, ci sono abbastanza pattern diversi da meritare un articolo a parte, meno focalizzato su un singolo progetto, più catalogo di tecniche.

Cinque cose, dalla più classica alla più contorta.

## 1. Un git tag come stato persistente tra un run e l'altro

Riepilogo rapido, i dettagli completi sono nell'articolo su `email-autoreply`. GitHub Actions è stateless per design -- ogni run parte da una macchina vergine. L'escamotage: salvare un valore (un ID, un timestamp, qualsiasi piccolo stato) in un git tag dedicato, mai in un branch.

```bash
# leggere lo stato
git show refs/tags/lastid:data/lastId > data/lastId

# scrivere lo stato (branch orfano, commit singolo, force-push del tag)
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```

Il punto chiave: un branch orfano per non accumulare mai storia, e un tag forzato invece di un branch per non sporcare la lista dei branch del repo.

## 2. Un git tag come cache di build precompilata

Stessa famiglia di idee, altro uso: invece di salvare stato applicativo, si salva un **artefatto di build**. Il job `build` compila il codice una volta (al push su `master`), poi pusha `dist/` + `node_modules/` in un tag `runtime`. Il job `cron` fa checkout di quel tag direttamente invece di eseguire `bun install && bun run build` a ogni esecuzione:

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# niente install, niente build -- il codice è già pronto
- run: node dist/index.js --action
```

Questo porta il run da ~20s a ~10s. Su un cron che gira spesso, conta. `actions/cache` fa un lavoro simile (cachare le dipendenze), ma un git tag è più diretto quando vuoi congelare completamente un artefatto versionato e puntarlo esplicitamente -- non solo velocizzare un `npm install`.

## 3. Un unico check obbligatorio che aggrega più job

Un piccolo pattern che non sembra granché ma che cambia la vita nella configurazione dei branch protetti. Su `konosuba-rpg`, la CI ha tre job indipendenti (`typecheck`, `lint`, `tests`) che girano in parallelo -- e un quarto job, `test-battery`, che non fa altro che dipendere dai primi tre:

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

Senza questo job facciata, configurare un branch protetto richiederebbe spuntare tre check obbligatori separati -- e aggiornare quella lista ogni volta che un job viene aggiunto o rinominato. Con `test-battery`, un solo nome da spuntare nelle impostazioni del repo, che resta stabile anche se i dettagli interni cambiano.

## 4. Trasformare un runner gratuito in un VPS temporaneo

Questo è il più contorto di tutti, e chiaramente il mio preferito: `repo-to-vps` dirotta completamente l'uso previsto di un runner GitHub Actions per farne una macchina Linux accessibile via SSH, gratis, fino a 6 ore (la durata massima di un job).

Il principio: un job che non fa quasi altro che lanciare tmate:

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

Il vero grattacapo è che il filesystem di un runner GitHub Actions è **usa e getta** -- appena il job finisce, sparisce tutto. Una sessione SSH che dura ore non serve a niente se tutto quello che fai evapora al run successivo. La soluzione: un branch git che fa da snapshot live del filesystem, sincronizzato in continuo.

Lo script `start-tmate.sh` fa, in ordine:

1. **Ripristina** il filesystem da un branch dedicato `filesystem` all'avvio del job (`git reset --hard` su di esso).
2. **Monitora** i cambiamenti dei file in continuo con `inotifywait`, e **committa + pusha immediatamente** appena un file si muove:

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1
  done
}
```

3. Ogni salvataggio **ammenda** il commit precedente invece di crearne uno nuovo (`git commit --amend --no-edit`), quindi il branch `filesystem` resta sempre a un commit singolo -- nessun accumulo di migliaia di snapshot.
4. Un ciclo `while true` rilancia tmate automaticamente se la sessione muore, con `remain-on-exit on` così che il terminale resti raggiungibile anche dopo un `exit`.
5. L'URL SSH generato da tmate viene scritto in un file `host.conf`, committato sul branch `filesystem` -- recuperabile via API GitHub (`gh api .../contents/host.conf`) senza aver mai avuto accesso live ai log del job.
6. Una routine `periodic_save` gira ogni 5 secondi in background, nel caso `inotifywait` perda un evento.

Risultato: una shell Linux completa, accessibile da qualsiasi parte, con un filesystem che persiste tra le sessioni -- anche se l'infrastruttura sottostante (un runner GitHub Actions) non è stata assolutamente progettata per questo. L'unico vero limite è il timeout di 6 ore per job -- dopo bisogna rilanciare il workflow.

## 5. Un bot che apre le proprie pull request

Su `konosuba-rpg`, un push sul branch `dev` attiva un job che verifica se esiste già una pull request aperta verso `main` -- e ne crea una automaticamente se non c'è, via `actions/github-script` e l'API REST di GitHub:

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

Il dettaglio che conta qui è il token usato. Questo workflow **non** usa il `GITHUB_TOKEN` automatico -- richiede un segreto `AUTO_PR_TOKEN` separato e si rifiuta di continuare se manca:

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

## 6. Pubblicare su npm senza alcun segreto

Il più discreto dei cinque, ma probabilmente il più importante per il futuro: il workflow `publish.yml` di `typescript-virtual-container` non contiene **nessun segreto npm**. Niente `NPM_TOKEN`, niente `NODE_AUTH_TOKEN`. Solo questo:

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

`npm publish` funziona comunque, perché il registry npm ora supporta il **trusted publishing** via OIDC: il workflow dimostra la propria identità direttamente al registry (repo esatto + workflow esatto, configurati lato npmjs.org), senza che nessun token statico transiti o venga memorizzato da nessuna parte. Zero segreti da far trapelare, zero token da ruotare ogni sei mesi.

---

## I segreti di GitHub, in profondità

Questi cinque pattern toccano tutti, in un modo o nell'altro, la questione dei segreti. Alcuni principi che ricorrono ovunque nei miei workflow:

**Un segreto non è per forza una stringa semplice.** In `email-autoreply`, `ACCOUNTS_JSON` contiene l'intero JSON minificato della configurazione multi-account -- non solo una chiave API, una struttura dati completa, iniettata tale e quale in un file a runtime:

```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

Questo evita di dover committare un file di configurazione, anche cifrato, e si aggiorna con un clic nelle impostazioni del repo senza toccare il codice.

**`GITHUB_TOKEN` ha limiti precisi, ed è voluto.** Il token automatico che GitHub inietta a ogni run è potente, ma sigillato su certi punti: di default non può attivare un altro workflow, e a seconda della configurazione del repo può essere bloccato dalle regole di protezione dei branch. È proprio per questo che `create-pull-request.yml` richiede un PAT separato (`AUTO_PR_TOKEN`) -- un token da un account reale (o da una GitHub App), con diritti espliciti `contents:write` + `pull-requests:write`, distinto dal token effimero del job.

**I permessi sono scoped job per job, non globalmente.** Ogni workflow che ho elencato qui dichiara un blocco `permissions:` minimo e commentato:

```yaml
permissions:
  contents: read
  actions: read
  checks: write
```

Il `GITHUB_TOKEN` predefinito storicamente ha diritti piuttosto ampi su un repo pubblico; restringerlo esplicitamente a ciò di cui il job ha realmente bisogno limita i danni se un'action di terze parti nella catena risulta compromessa.

**Il miglior segreto è quello che non esiste.** Il pattern OIDC di `typescript-virtual-container` è la versione più compiuta di questa idea: invece di gestire rotazione, scadenza e rischio di fuga di un `NPM_TOKEN`, il workflow prova crittograficamente la propria identità (questo esatto repo, questo esatto workflow) direttamente al servizio terzo. Stessa logica disponibile per AWS, Docker Hub, PyPI -- sempre più registry e cloud supportano OIDC da GitHub Actions.

---

**3 punti chiave**

1. Un git tag (orfano, force-pushato) può fungere da database minimalista o cache di build precompilata -- due usi distinti dello stesso meccanismo.
2. Un runner GitHub Actions gratuito può diventare una shell SSH persistente se accetti di sincronizzare in continuo il suo filesystem verso un branch git, con autosalvataggio via `inotifywait` e un singolo commit emendato.
3. Il `GITHUB_TOKEN` predefinito è volutamente limitato -- creare PR tra branch o pubblicare senza segreti richiede o un PAT dedicato, o il passaggio all'OIDC trusted publishing.
