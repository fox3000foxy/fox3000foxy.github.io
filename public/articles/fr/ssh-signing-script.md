# Script de signature SSH pour commits — explication

Cet article décortique le script `setup-ssh-signing.sh` que j'ai publié sur [Gist](https://gist.github.com/fox3000foxy/95500d129cd4bf5c173c323d2492569a). On va voir ce que chaque partie fait, comment ça rend la signature SSH locale à un dépot complètement indolore, et, oui, pourquoi j'ai même pris la peine de l'écrire (spoiler : je voulais juste que mes commits aient de la **gueule**).

## Motivation

J'ai toujours adoré bricoler mon workflow Git, et après avoir vu des gens avec des petits badges « Verified » à côté de leurs commits, je me suis dit : pourquoi pas moi ? La signature GPG intégrée est un lourde et globale, alors j'ai fini par écrire un petit helper qui :

- crée une clé SSH dédiée à la signature,
- configure uniquement le dépôt courant,
- réécrit éventuellement l'historique pour signer les vieux commits,
- et permet de transporter la clé entre machines.

Franchement, le besoin était surtout de la vanity. Y'a pas d'exigence technique de signature dans mes projets perso, mais voir un badge vert « Verified » sur un commit, ça fait son petit effet, et écrire le script était un kiff en shell.

> Bon, signer ses commits, c'est un peu comme mettre un blouson en cuir pour une review de code — totalement inutile, mais ça te donne l'impression d'être un hacker.

## Ce que fait le script

Le script est un seul fichier Bash avec `set -euo pipefail` en haut pour planter vite fait bien fait. Voilà un résumé de ce qu'il fait :

1. **Générer ou importer une clé de signature**  
   Les clés atterrissent dans `.git-signing/` dans le dossier où tu lances le script.
2. **Configurer Git localement**  
   Il positionne `gpg.format=ssh`, `user.signingkey`, `commit.gpgsign=true`, `tag.gpgSign=true`, et un `allowedSignersFile` qui pointe vers la clé publique.
3. **Gérer les clés entre machines**  
   Grâce à `--export-keys` / `--import-keys`, tu peux balader ta clé privée d'un ordi à l'autre sans toucher à la config globale.
4. **Réécriture d'historique optionnelle** (`--resign-all`)  
   Réécrit tous les commits de toutes les branches/tags (ou seulement ceux pas dans `upstream` pour les forks) et les re-signe avec `-S`, sans toucher aux autres auteurs.
5. **Flags utilitaires**  
   `--autostash`, `--autopush`, `--commit-date`, `--yes` pour le mode non interactif, etc.
6. **Détection de fork et vérifications de sécurité**  
   Il détecte le remote `upstream`, prévient avant de réécrire l'historique, vérifie les outils requis (`git`, `ssh-keygen`, `zip/unzip`), s'assure des bonnes permissions, et crée même une copie sécurisée de la clé si les permissions du filesystem sont trop permissives.

Le script est idempotent : le lancer deux fois ne regénère pas ta clé et n'écrase pas la config existante.

## Déroulé pas à pas

Voici quelques extraits clés du code avec leurs explications.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Configure SSH commit signing in a controlled, repo-local way.
# - Key files are created in the directory where this script is launched.
# - Git config is written locally to the current repository only.
```

L'en-tête pose la sécurité et documente l'objectif. Le morceau suivant parse les options CLI (`--name`, `--email`, `--repo`, etc.) avec une boucle `while [[ $# -gt 0 ]]; do case … esac done`. Les champs d'identité obligatoires sont vérifiés plus tard :

```bash
if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "Error: missing identity. Provide --name and --email." >&2
  exit 1
fi
```

La génération de clé se fait dans `$LAUNCH_DIR/.git-signing`. Si une clé existe déjà, le script la laisse tranquille ; `--import-keys` permet de remplir le dossier depuis un ZIP.

```bash
mkdir -p "$KEY_DIR"

if [[ -n "$IMPORT_ZIP_PATH" ]]; then
  import_keys_from_zip "$IMPORT_ZIP_PATH"
fi

if [[ ! -f "$KEY_PATH" ]]; then
  ssh-keygen -t ed25519 -N "" -C "$EMAIL signing key" -f "$KEY_PATH" >/dev/null
  echo "Generated signing key: $KEY_PATH"
else
  echo "Signing key already exists: $KEY_PATH"
fi
```

Après avoir vérifié que la clé privée est utilisable (`ssh-keygen -Y sign …`), le script écrit un petit fichier `allowed_signers` contenant la clé publique et positionne la config Git locale :

```bash
git -C "$REPO_DIR" config --local gpg.format ssh
git -C "$REPO_DIR" config --local user.signingkey "$RUNTIME_KEY_PATH"
git -C "$REPO_DIR" config --local gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS"
git -C "$REPO_DIR" config --local commit.gpgsign true
git -C "$REPO_DIR" config --local tag.gpgSign true
```

Si tu demandes la réécriture d'historique avec `--resign-all`, le script construit une commande `git filter-branch` qui re-signe les commits éligibles avec `-S`. Il respecte l'état du fork en sautant optionnellement les commits déjà présents dans `upstream`.

Le résultat final affiche la clé publique et les instructions pour l'ajouter dans la section **Signing Key** de GitHub, avec une petite recette de test.

## Pourquoi signer ses commits ?

C'est le moment où j'avoue que je n'en avais pas besoin. Mes dépôts n'exigent aucune provenance pour ce que je publie, et je n'utilise pas les tags signés pour les releases. Le « pourquoi » c'est :

- parce que je pouvais,
- parce que ça rend bien (t'as vu le badge ?),
- parce que ça m'a donné une excuse pour expérimenter avec `git filter-branch` et le shell,
- et parce que c'est un énième « j'ai construit ça moi-même » pour le blog.

Bref, c'était juste pour frimer, mais c'est ça qui est sympa quand on bricole ses outils.

## Exemples d'utilisation

```bash
# configuration initiale dans le dépôt courant
chmod +x ./setup-ssh-signing.sh
./setup-ssh-signing.sh --name "Your Name" \
                       --email "you@example.com"

# exporter les clés pour une autre machine
./setup-ssh-signing.sh --export-keys ./my-signing-keys.zip

# importer les clés sur une deuxième machine
./setup-ssh-signing.sh --import-keys ./my-signing-keys.zip --repo ./my-repo \
                       --name "Your Name" --email "you@example.com"

# réécrire l'historique et pousser
./setup-ssh-signing.sh --repo ./my-repo --name "Your Name" --email "you@example.com" \
                       --resign-all --autostash --autopush --yes
```

## Dernières réflexions

Ce script est un petit utilitaire, mais il contient quelques idées sympas :

- garder les clés cryptographiques locales et par dépôt,
- ne jamais toucher à la config globale sauf si tu le demandes,
- fournir un import/export simple et la réécriture d'historique,
- et documenter tout le processus dans un article de blog, parce que pourquoi pas.

Si l'envie te prend d'ajouter des signatures à tes propres commits, essaie-le ! Et si t'es juste là pour le style, pareil. 😎
