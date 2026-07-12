---
title: "Repo to VPS : transformer GitHub Actions en VPS gratuit avec stockage persistant"
description: Comment transformer un runner GitHub Actions en VPS permanent avec git comme stockage persistant -- tmate, inotify et commit --amend.
date: 2026-05-29
tags:
  - github
  - devops
  - vps
  - actions
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "XfGl40XDiKmXGhiRd2BnA0vcMzlhejEzgR8PTmk3ABjZKTYw5Xt48acfGZKLwsCuEykzTiehKhgPkfwMNpynNQ=="
---

## GitHub te file un VPS gratuit pendant 6h. J'ai trouvé comment le rendre permanent.

GitHub Actions te donne des machines Linux gratuites.

Genre, des vrais serveurs Ubuntu. 2 cœurs, 7 Go de RAM, 14 Go de disque. Gratuit. Pendant 6h par run.

Le seul "problème" : à la fin du run, tout est effacé. La machine est jetable. Tu installes des trucs, tu codes, tu configures... et pouf, à la fin tout disparaît. Comme si t'avais rien fait.

Sauf si.

Sauf si tu utilises **git comme disque dur**.

Et là, d'un coup, t'as un VPS gratuit avec un disque persistant qui survit aux runs. Tu te reconnectes, tout est encore là. Tu reprends où tu t'étais arrêté.

C'est complètement pété. Laisse-moi t'expliquer xD

---

## Le contexte : les runners GitHub Actions

Quand tu lances un workflow GitHub Actions, GitHub te file une VM.

C'est fait pour build ton code, lancer tes tests, deploy. Le workflow tourne, fait son taf, et la machine est détruite.

Mais rien ne t'empêche de faire autre chose avec cette VM. Genre, ouvrir un shell SSH dessus et l'utiliser comme un serveur.

Le truc, c'est que ces machines sont **stateless** et **temporaires** :
- Temporaire : 6h max par run (`timeout-minutes: 360`, le plafond de GitHub)
- Stateless : tout est effacé à la fin

Donc pour en faire un VPS utilisable, faut résoudre deux problèmes :
1. **Comment se connecter dessus en temps réel ?**
2. **Comment garder le disque entre deux runs ?**

Là ça devient un sale hack.

---

## Problème 1 : le SSH live avec tmate

**tmate** c'est un fork de tmux qui crée une session SSH partageable.

Tu le lances sur une machine, il te génère deux liens :
- une URL SSH (`ssh xxx@nyc1.tmate.io`)
- une URL web (terminal dans le navigateur)

Tu te connectes avec un de ces liens, et boom, t'es dans un shell sur la machine. En temps réel.

Le workflow lance donc tmate :

```bash
tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
tmate -S /tmp/tmate.sock set-option -g remain-on-exit on

# récupère les liens de connexion
tmate_ssh=$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')
tmate_web=$(tmate -S /tmp/tmate.sock display -p '#{tmate_web}')
```

Et ces liens sont écrits direct dans le README du repo par un script Python. Tu ouvres ton repo, tu vois le lien de connexion, tu cliques. Te voilà dans ton VPS.

Premier problème réglé. Mais c'est le deuxième qui est vraiment fou.

---

## Problème 2 : git comme disque dur

Voilà le truc de malade.

La machine est effacée à chaque run. Donc on stocke **le système de fichiers dans une branche git dédiée**, appelée `filesystem`.

Au démarrage, le script restore l'état depuis cette branche :

```bash
filesystem_branch="filesystem"

# récupère la branche filesystem depuis le remote
git fetch origin "$filesystem_branch":refs/remotes/origin/$filesystem_branch

# restore le workspace depuis cette branche
git checkout -B filesystem-workspace "refs/remotes/origin/$filesystem_branch"
git reset --hard "refs/remotes/origin/$filesystem_branch"
```

La branche `filesystem` C'EST ton disque dur. Tes fichiers, tes installs, tes configs -- tout est dedans.

Tu vois le truc ? La machine est jetable, mais le disque vit dans git. Tu relances le workflow, le disque est restauré, tu reprends pile où t'en étais.

C'est comme un VPS qui hibernate. Sauf que l'hibernation c'est un repo git xD

### Premier lancement : créer le disque vide

Au tout premier run, la branche `filesystem` existe pas encore. Faut la créer. Et c'est pas anodin :

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

Le `git checkout --orphan` c'est la clé. Une branche orpheline c'est une branche **sans aucun historique** -- comme si tu repartais d'un repo vide.

Pourquoi orpheline ? Parce que tu veux PAS que ton disque persistant traîne tout l'historique de ton code source. Le disque c'est un truc à part, qui a sa propre vie. Il commence vierge.

Et le `git ls-remote --exit-code` au début, c'est juste un check propre : "est-ce que la branche existe déjà sur le remote ?". Si oui, on touche à rien. Si non, on la crée. Idempotent, comme on aime.

### Le git clean sélectif : protéger les caches

Cette ligne mérite qu'on s'arrête dessus :

```bash
git clean -fdx -e .apt-cache -e .cache -e host.conf -e tmate.sock
```

`git clean -fdx` ça vire TOUT ce qui est pas tracké par git. Normalement c'est violent -- ça nettoie le workspace à fond.

Mais les `-e` (exclude) protègent certains trucs :
- `.apt-cache` → le cache des paquets APT (on y reviendra, c'est malin)
- `.cache` → cache générique
- `host.conf` → l'adresse SSH de la session
- `tmate.sock` → le socket de la session tmate en cours

Si tu nettoyais ces fichiers-là, tu casserais la session active ou tu perdrais ton cache. Donc on les épargne pendant le reset.

Un détail con à première vue, mais sans ça tout pète.

---

## L'autosave : inotify qui surveille tout

Bon, mais comment les fichiers se retrouvent dans la branche `filesystem` ?

Réponse : un watcher qui surveille TOUS les changements de fichiers et commit/push automatiquement.

L'outil magique c'est **inotifywait** (du paquet `inotify-tools`). Il surveille le filesystem au niveau du kernel et déclenche dès qu'un fichier change.

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

Décortiquons les flags inotify, parce que chacun compte :
- `-r` → récursif, surveille tous les sous-dossiers
- `-e modify,create,delete,move` → réagit à ces 4 types d'événements
- `--exclude '...'` → une regex pour ignorer certains fichiers

Le `--exclude` est crucial. Regarde ce qu'il ignore :
- `.git` → évidemment, sinon chaque commit déclencherait un autosave qui déclencherait un commit... boucle infinie. Catastrophe.
- `.apt-cache` et `.cache` → les caches, qui changent tout le temps et qu'on veut pas spammer dans git
- `host.conf` et `tmate.sock` → les fichiers de session, qui bougent sans arrêt
- `.gitignore`, `.txt.swp` → les fichiers temporaires (les `.swp` c'est les fichiers d'édition de vim)

Sans cet exclude, tu te retrouverais avec un autosave qui se déclenche en boucle sur ses propres changements. Le `.git` dans la liste, c'est LA ligne qui t'empêche de te tirer une balle dans le pied.

Tu modifies un fichier ? inotify le détecte instantanément, ça commit, ça push. En moins d'une seconde, ton changement est dans la branche `filesystem`.

Tu installes un truc, tu écris du code, tu touches une config -- tout est sauvegardé en temps réel, automatiquement, sans que tu fasses quoi que ce soit.

T'as littéralement un système de sauvegarde automatique du disque entier. Pété.

### Le debounce : pas spammer git

Le `sleep 1` après chaque save c'est un **debounce**.

Quand tu sauvegardes un fichier dans un éditeur, souvent ça génère plusieurs événements filesystem en rafale (création d'un fichier temp, rename, suppression de l'ancien...). Sans debounce, tu déclencherais 3-4 commits pour une seule sauvegarde.

Le `sleep 1` dit : "attends une seconde après un save, le temps que la rafale se calme, avant de réécouter". Ça regroupe les changements rapprochés en un seul commit. Malin.

### Et une sauvegarde périodique en plus

Au cas où inotify raterait un truc, y'a aussi un save toutes les 5 secondes :

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

Ceinture ET bretelles. On veut surtout pas perdre l'état du disque.

---

## Le détail malin : un seul commit

Si tu commit à chaque changement de fichier, tu vas accumuler des milliers de commits. En une heure de session, ton historique git explose. Le repo devient énorme. C'est dégueulasse.

La solution est élégante : **on amende le commit existant** au lieu d'en créer un nouveau.

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

`git commit --amend` ça veut dire : "remplace le dernier commit par celui-là".

Du coup la branche `filesystem` a TOUJOURS un seul commit. Peu importe combien de fois tu sauvegardes. C'est juste un snapshot de l'état actuel, force-pushé encore et encore.

Le `flock` c'est un verrou : comme y'a deux boucles de save (inotify + périodique), faut éviter qu'elles lancent git en même temps et se marchent dessus. Un seul process git à la fois.

Propre.

---

## Le sync_from_remote : gérer plusieurs sessions

Tiens, un truc auquel tu penses pas au début : et si tu lances DEUX runs en même temps ? Ou si une session modifie la branche `filesystem` pendant qu'une autre tourne ?

Le script gère ça avec un `sync_from_remote` avant chaque commit :

```bash
sync_from_remote() {
  git fetch origin "filesystem":refs/remotes/origin/filesystem
  git merge --ff-only "refs/remotes/origin/filesystem"
}
```

Le `--ff-only` (fast-forward only) c'est important : ça veut dire "merge UNIQUEMENT si on peut avancer proprement, sans créer de commit de merge".

Si les deux branches ont divergé (genre, deux sessions ont modifié des trucs différents), le fast-forward échoue silencieusement (`2>/dev/null || true`) et on garde l'état local. C'est pas un système de merge parfait, mais ça évite les corruptions dans le cas simple où une seule session tourne.

Honnêtement, faut pas lancer 3 sessions en parallèle sur le même repo. Mais le code essaie quand même de pas exploser si ça arrive. C'est de la défense.

---

## Le cache APT : installer vite

Y'a un détail dans le workflow qui paye pas de mine mais qui est bien pensé :

```yaml
- name: Cache & install APT packages (tmate + watcher)
  uses: awalsh128/cache-apt-pkgs-action@v1.6.0
  with:
    packages: tmate inotify-tools
```

tmate et inotify-tools sont installés via une action qui **cache les paquets APT**.

Au premier run, ça télécharge et installe. Aux runs suivants, c'est restauré depuis le cache GitHub Actions -- plus rapide, pas besoin de re-télécharger.

Et tu te souviens du `git clean -fdx -e .apt-cache` de tout à l'heure ? C'est lié. Le dossier `.apt-cache` est protégé du nettoyage justement pour que les paquets que tu installes pendant ta session puissent persister un minimum.

Tout se tient. J'ai pensé au cycle de vie complet.

---

## Les scripts planqués dans /tmp

Encore un détail vicieux mais malin. Au tout début du script :

```bash
RUNNER_SCRIPTS_DIR="/tmp/runner-scripts"
rm -rf "$RUNNER_SCRIPTS_DIR"
mkdir -p "$RUNNER_SCRIPTS_DIR"
cp -r .github/scripts "$RUNNER_SCRIPTS_DIR/"
```

Les scripts (`update_readme.py`, etc.) sont copiés dans `/tmp` AVANT de toucher à la branche `filesystem`.

Pourquoi ? Parce que quand tu fais le `git reset --hard` vers la branche `filesystem` (qui est vide au début, ou qui contient ton disque), les fichiers `.github/scripts` du repo source disparaissent du workspace.

Mais le script en a encore besoin pendant la session (pour update le README à chaque relance de tmate). Donc il les planque dans `/tmp`, hors de portée de git :

```bash
python3 "$RUNNER_SCRIPTS_DIR/scripts/update_readme.py" --ssh "$tmate_ssh" ...
```

Si t'y penses pas, tu galères 30 minutes à comprendre pourquoi ton script a disparu. J'y ai pensé.

---

## Le shell sur-mesure

Petit confort : la session te file un shell configuré, pas un bash tout nu.

Le `prestart.sh` copie un `.bashrc` custom :

```bash
if ! grep -q "Custom prompt and aliases for remote sessions" "$HOME/.bashrc"; then
  cp .github/scripts/remote_bashrc "$HOME/.bashrc"
fi
sudo cp "$HOME/.bashrc" /root/.bashrc
```

Et ce `.bashrc` contient un prompt coloré, des alias (`ll`, `lla`, `rm -i`), et surtout un override de `exit` :

```bash
exit() {
    killall -9 -u "$(whoami)" tmate 2>/dev/null || true
    builtin exit "$@"
}

# Ctrl+D fait pareil que exit
bind -x '"\C-d": "exit"'
```

Quand tu tape `exit` (ou Ctrl+D), ça kill proprement les process tmate avant de fermer. Ça évite de laisser des sessions tmate zombies.

Y'a aussi une fonction `tmate-detach` si tu veux te déconnecter SANS tuer la session (pour te reconnecter plus tard). Détail de confort, mais ça montre le niveau de soin.

---

## Le tmate qui se relance tout seul

Petit confort : si tu tape `exit` dans ton shell, normalement la session tmate meurt et t'es déconnecté pour de bon.

Sauf qu'ici, tmate est dans une boucle `while true` :

```bash
while true; do
  tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
  while tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' >/dev/null 2>&1; do
    sleep 2
  done
  echo "tmate session ended; restarting..."
done
```

Tu `exit` ? La session redémarre toute seule. Tu te reconnectes avec le même lien.

C'est débile, mais ça rend le truc utilisable.

---

## La reconnexion en une commande

Comment tu te reconnectes après une déco, sans aller fouiller dans les logs du run à chaque fois ?

L'adresse SSH de tmate est écrite dans un fichier `host.conf`, committé dans la branche `filesystem` :

```bash
printf '%s' "${tmate_ssh#ssh }" > host.conf
```

Et comme ce fichier est dans git, tu peux le récupérer via l'API GitHub avec une seule commande :

```bash
ssh "$(gh api -H 'Accept: application/vnd.github.v3.raw' \
  "/repos/USER/REPO/contents/host.conf?ref=filesystem" | tr -d '\r\n')"
```

Tu lance ça, ça va chercher l'adresse SSH actuelle dans le repo, et te connecte. Même si l'adresse a changé entre deux sessions.

---

## Le flow complet

Récapitulons :

1. Tu déclenche le workflow (push ou bouton manuel)
2. GitHub te file une VM Ubuntu
3. Le script restore le disque depuis la branche "filesystem"
4. inotify commence à surveiller tous les changements
5. periodic_save commit toutes les 5s en backup
6. tmate démarre → génère les liens SSH/web
7. Les liens sont écrits dans le README + host.conf
8. Tu te connecte avec ssh ou le terminal web
9. Tu fais ce que tu veux -- chaque changement de fichier = autosave
10. 6h plus tard, GitHub tue la VM
11. Ton disque est intact dans la branche "filesystem"
12. Tu relance le workflow → retour à l'étape 3, tout est encore là

Un VPS gratuit avec disque persistant. Juste avec git et GitHub Actions.

---

## Bon, faut être honnête : les limites

C'est un hack, pas un vrai VPS. Donc :

- **6h max par run.** Faut relancer le workflow régulièrement. Pas de uptime infini.
- **Pas pour de la prod.** Tu vas pas héberger ton site là-dessus. C'est pour explorer, dev, debug, tester un truc dans un Linux jetable mais récupérable.
- **GitHub voit tout.** C'est leurs machines. Mets rien de sensible.
- **Garde le repo privé.** Tu exposes un shell SSH. Un repo public = n'importe qui peut potentiellement s'y connecter. Mauvaise idée.
- **C'est à la limite des conditions d'usage.** GitHub Actions c'est fait pour de la CI/CD, pas pour du VPS gratuit. Donc à utiliser avec parcimonie, pour du légitime, sans abuser.

### Le vrai talon d'Achille : git déteste les gros fichiers

Git c'est fait pour du texte, pas pour un filesystem.

Le disque persistant vit dans une branche git. Donc tout ce que tu sauvegardes passe par git. Et git :
- gère mal les gros fichiers binaires (une image Docker de 2 Go dans git ? oublie)
- a une limite de 100 Mo par fichier sur GitHub (hard limit, ça push pas au-delà)
- recommande de rester sous ~5 Go par repo

Donc si tu `npm install` un projet avec 500 Mo de `node_modules`, ou si tu build un truc qui crache des binaires lourds, le push vers `filesystem` va soit ramer à mort, soit carrément échouer.

Le `git commit --amend` aide (un seul commit, pas d'historique qui gonfle), mais ça change rien au fait qu'un fichier de 200 Mo passera jamais.

En gros : **ça marche super pour du code, des configs, des petits fichiers. Ça marche pas pour stocker des grosses données ou des artefacts binaires.** Faut garder ça en tête sur ce que tu fais dans ta session.

### C'est pas un snapshot système complet

Autre nuance importante : la branche `filesystem` sauvegarde le **workspace** (le dossier du repo), pas tout le système.

Si tu fais `apt install htop`, le binaire va dans `/usr/bin/htop`, qui est HORS du workspace. Donc il sera PAS sauvegardé. Au prochain run, faut le réinstaller.

C'est pour ça qu'on a le cache APT et le `prestart.sh` : pour re-préparer l'environnement système à chaque démarrage, vu que seul le workspace persiste.

Si tu veux que tes installs survivent, faut les mettre dans le workspace (genre, installer dans un dossier local plutôt qu'en système). C'est une gymnastique à intégrer.

---

## VPS gratuit vs vrai VPS : le match

| | repo-to-vps | Vrai VPS (5€/mois) |
|---|---|---|
| **Prix** | 0€ | ~5-10€/mois |
| **Uptime** | 6h, à relancer | 24/7 |
| **Disque** | branche git, petits fichiers | vrai SSD, plusieurs Go |
| **RAM** | ~7 Go (généreux !) | 1-2 Go souvent |
| **CPU** | 2-4 cœurs corrects | 1-2 vCPU |
| **Setup** | clone un template | config manuelle |
| **Persistance** | workspace seulement | système complet |
| **Légitimité** | limite des CGU | 100% clean |

Le truc marrant c'est que côté specs brutes (RAM, CPU), le runner GitHub est souvent MEILLEUR qu'un VPS à 5€. Mais l'uptime de 6h et la persistance limitée au workspace, c'est ce qui en fait un jouet de hacker, pas un vrai serveur.

Pour apprendre, tester, débugger un truc Linux vite fait dans un environnement récupérable ? Parfait. Pour héberger quoi que ce soit de sérieux ? Prends un vrai VPS.

Mais pour un environnement Linux temporaire que tu peux restaurer à volonté ? C'est juste génial.

---

## Le pattern derrière tout ça

Si tu prends du recul, repo-to-vps et le bot email (mon autre article) reposent sur la même idée :

> **Git n'est pas qu'un gestionnaire de versions. C'est un système de stockage persistant, gratuit, versionné, accessible via une API.**

Dès que t'as un système stateless (GitHub Actions, un Worker, une fonction serverless) et que tu veux garder un état entre deux exécutions, git peut servir de "disque".

- Le bot email stocke un `lastId` dans un tag git.
- repo-to-vps stocke un filesystem entier dans une branche git.

Même pattern, deux échelles. Une valeur d'un côté, un disque de l'autre.

Et le `git commit --amend` + force-push c'est la technique commune : **tu gardes un seul commit qui représente l'état actuel, écrasé à chaque update.**

C'est pas fait pour ça. Mais ça marche. Et c'est gratuit.

---

**Les 3 trucs à retenir :**

1. **Une branche git = un disque dur persistant** -- Stocke ton filesystem dans une branche dédiée, restore au démarrage, et t'as un état qui survit aux machines jetables.

2. **inotify + git = autosave temps réel** -- `inotifywait` surveille les changements au niveau kernel et push vers git instantanément. Avec `git commit --amend` pour garder un seul commit propre.

3. **tmate transforme un runner en VPS** -- SSH live sur une machine GitHub Actions, avec restart automatique et reconnexion en une commande via l'API GitHub.

Git comme disque dur, deuxième épisode. Je crois que je vais finir par tout stocker dans des branches git xD
