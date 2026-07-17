---
title: "5 manières détournées d'utiliser GitHub Actions (et ce que ça apprend sur les secrets)"
description: "Un runner CI transformé en VPS gratuit, un bot qui ouvre ses propres pull requests, un publish npm sans le moindre secret. Tour de mes repos pour lister les patterns GitHub Actions qui sortent du simple \"lint + test + deploy\"."
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "MOdw1JJCwEBUsSJsR/gVg5l1nKuxrqIUxUlDNk0XVrf7+QD3wOX9qzn3sMMtzET1GvROxk+nCyzdJ2G5Pa7a4A=="
---

# 5 manières détournées d'utiliser GitHub Actions

GitHub Actions, sur le papier, c'est fait pour du CI/CD classique : tu push, ça lint, ça teste, ça déploie. J'ai déjà écrit sur un cas particulier -- utiliser des tags git comme base de données pour un bot email (voir l'article dédié). Mais en fouillant dans mes propres repos, il y a assez de patterns différents pour que ça vaille un article à part, moins centré sur un seul projet, plus catalogue de techniques.

Cinq trucs, du plus classique au plus tordu.

## 1. Un tag git comme état persistant entre deux runs

Rapide rappel, le détail complet est dans l'article sur `email-autoreply`. GitHub Actions est stateless par design -- chaque run part d'une machine vierge. Le contournement : stocker une valeur (un ID, un timestamp, n'importe quel petit état) dans un tag git dédié, jamais dans une branche.

```bash
# lire l'état
git show refs/tags/lastid:data/lastId > data/lastId

# écrire l'état (branche orpheline, un seul commit, force-push du tag)
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```

Le point clé : une branche orpheline pour ne jamais accumuler d'historique, et un tag forcé plutôt qu'une branche pour ne pas polluer la liste des branches du repo.

## 2. Un tag git comme cache de build précompilé

Même famille d'idée, autre usage : au lieu de stocker un état applicatif, on stocke un **artefact de build**. Le job `build` compile le code une fois (sur push vers `master`), puis pousse `dist/` + `node_modules/` dans un tag `runtime`. Le job `cron`, lui, checkout directement ce tag au lieu de faire tourner `bun install && bun run build` à chaque exécution :

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# pas de install, pas de build -- le code est déjà prêt
- run: node dist/index.js --action
```

Ça change le run de ~20s à ~10s. Sur un cron qui tourne souvent, ça compte. `actions/cache` fait un travail similaire (mettre en cache des dépendances), mais un tag git est plus direct quand tu veux carrément figer un artefact versionné et le pointer explicitement -- pas juste accélérer un `npm install`.

## 3. Un seul check obligatoire qui agrège plusieurs jobs

Petit pattern qui n'a l'air de rien mais qui change la vie en configuration de branche protégée. Sur `konosuba-rpg`, la CI a trois jobs indépendants (`typecheck`, `lint`, `tests`) qui tournent en parallèle -- et un quatrième job, `test-battery`, qui ne fait rien d'autre que dépendre des trois premiers :

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

Sans ce job de façade, configurer une branche protégée demanderait de cocher trois checks obligatoires séparés -- et de mettre à jour cette liste à chaque fois qu'un job est ajouté ou renommé. Avec `test-battery`, un seul nom à cocher dans les paramètres du repo, qui reste stable même si le détail interne change.

## 4. Transformer un runner gratuit en VPS temporaire

Celui-là est le plus tordu de tous, et clairement mon préféré : `repo-to-vps` détourne complètement l'usage prévu d'un runner GitHub Actions pour en faire une machine Linux accessible en SSH, gratuite, pendant jusqu'à 6 heures (la limite max d'un job).

Le principe : un job qui ne fait quasiment rien d'autre que lancer [tmate](https://tmate.io/) (un fork de tmux qui expose une session terminal partageable par SSH ou navigateur) :

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

Le vrai casse-tête, c'est que le filesystem d'un runner GitHub Actions est **jetable** -- dès que le job se termine, tout disparaît. Une session SSH qui dure des heures, ça sert à rien si tout ce que t'y fais s'évapore au prochain run. La solution : une branche git qui sert de snapshot live du filesystem, synchronisée en continu.

Le script `start-tmate.sh` fait, dans l'ordre :

1. **Restaure** le filesystem depuis une branche dédiée `filesystem` au démarrage du job (`git reset --hard` dessus).
2. **Surveille** les changements de fichiers avec `inotifywait` en continu, et **commit + push immédiatement** dès qu'un fichier bouge :

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1   # debounce
  done
}
```

3. Chaque sauvegarde **amende** le commit précédent plutôt que d'en créer un nouveau (`git commit --amend --no-edit`), donc la branche `filesystem` reste toujours à un seul commit -- pas d'accumulation de milliers de snapshots.
4. Une boucle `while true` relance `tmate` automatiquement si la session meurt, avec `remain-on-exit on` pour que le terminal reste joignable même après un `exit`.
5. L'URL SSH générée par tmate est écrite dans un fichier `host.conf`, committé sur la branche `filesystem` -- donc récupérable via l'API GitHub (`gh api .../contents/host.conf`) sans jamais avoir eu accès aux logs du job en direct.
6. Une routine `periodic_save` tourne toutes les 5 secondes en tâche de fond, au cas où `inotifywait` raterait un événement.

Résultat : un shell Linux complet, accessible depuis n'importe où, avec un filesystem qui persiste entre les sessions -- alors que l'infrastructure sous-jacente (un runner GitHub Actions) n'a absolument pas été conçue pour ça. La seule vraie limite, c'est le timeout de 6h par job -- après quoi il faut relancer le workflow.

## 5. Un bot qui ouvre ses propres pull requests

Sur `konosuba-rpg`, un push sur la branche `dev` déclenche un job qui vérifie s'il existe déjà une pull request ouverte vers `main` -- et en crée une automatiquement sinon, via `actions/github-script` et l'API REST GitHub :

```js
const { data: comparison } = await github.rest.repos.compareCommits({
  owner, repo, base: 'main', head: 'dev',
});
if (comparison.ahead_by === 0) return; // rien à proposer

const { data: existing } = await github.rest.pulls.list({
  owner, repo, state: 'open', head: `${owner}:dev`, base: 'main',
});
if (existing.length > 0) return; // déjà une PR ouverte

await github.rest.pulls.create({
  owner, repo, head: 'dev', base: 'main',
  title: 'chore: auto PR from dev to main',
});
```

Le détail qui compte ici, c'est le token utilisé. Ce workflow ne se sert **pas** du `GITHUB_TOKEN` automatique -- il exige un secret `AUTO_PR_TOKEN` séparé, et refuse de continuer s'il est absent :

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

## 6. Publier sur npm sans aucun secret

Le plus discret des cinq, mais probablement le plus important pour l'avenir : le workflow `publish.yml` de `typescript-virtual-container` ne contient **aucun secret npm**. Pas de `NPM_TOKEN`, pas de `NODE_AUTH_TOKEN`. Juste ça :

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

`npm publish` marche quand même, parce que le registre npm supporte désormais le **trusted publishing** via OIDC : le workflow prouve son identité directement au registre (repo + workflow exacts, configurés côté npmjs.org), sans qu'aucun token statique ne transite ni ne soit stocké nulle part. Zéro secret à faire fuiter, zéro token à faire tourner tous les six mois.

---

## Les secrets GitHub, en profondeur

Ces cinq patterns touchent tous, d'une manière ou d'une autre, à la question des secrets. Quelques principes qui reviennent partout dans mes workflows :

**Un secret n'est pas forcément une chaîne simple.** Dans `email-autoreply`, `ACCOUNTS_JSON` contient le JSON minifié entier de la config multi-comptes -- pas juste une clé API, une structure de données complète, injectée telle quelle dans un fichier au runtime :

```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

Ça évite d'avoir à committer un fichier de config, même chiffré, et ça se met à jour en un clic dans les settings du repo sans toucher au code.

**`GITHUB_TOKEN` a des limites précises, et c'est voulu.** Le token automatique que GitHub injecte à chaque run est puissant, mais scellé sur certains points : par défaut, il ne peut pas déclencher d'autre workflow, et selon la configuration du repo il peut être bloqué par des règles de protection de branche. C'est exactement pour ça que `create-pull-request.yml` exige un PAT (`AUTO_PR_TOKEN`) séparé -- un token qui vient d'un vrai compte (ou d'une GitHub App), avec des droits explicites `contents:write` + `pull-requests:write`, distinct du token éphémère du job.

**Les permissions se scopent job par job, pas globalement.** Chaque workflow que j'ai listé ici déclare un bloc `permissions:` minimal et commenté :

```yaml
permissions:
  contents: read
  actions: read
  checks: write
  # Only allow writing checks, everything else is read-only
```

Le `GITHUB_TOKEN` par défaut a historiquement des droits assez larges sur un repo public ; le restreindre explicitement à ce dont le job a réellement besoin limite les dégâts si une action tierce dans la chaîne (`uses: quelqu-un/action@version`) se révèle compromise.

**Le meilleur secret est celui qui n'existe pas.** Le pattern OIDC de `typescript-virtual-container` est la version la plus aboutie de cette idée : au lieu de gérer la rotation, l'expiration et le risque de fuite d'un `NPM_TOKEN`, le workflow prouve cryptographiquement son identité (ce repo précis, ce workflow précis) directement au service tiers. Même logique disponible pour AWS, Docker Hub, PyPI -- de plus en plus de registres et clouds supportent OIDC depuis GitHub Actions.

---

**3 points clés**

1. Un tag git (orphelin, force-pushé) peut servir de base de données minimaliste ou de cache de build précompilé -- deux usages distincts du même mécanisme.
2. Un runner GitHub Actions gratuit peut devenir un shell SSH persistant si on accepte de synchroniser son filesystem en continu vers une branche git, avec autosave par `inotifywait` et un seul commit amendé.
3. Le `GITHUB_TOKEN` par défaut est volontairement limité -- créer des PR inter-branches ou publier sans secret demande soit un PAT dédié, soit un passage à l'OIDC trusted publishing.