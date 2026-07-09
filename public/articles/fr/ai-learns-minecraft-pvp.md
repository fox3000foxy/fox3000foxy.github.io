---
title: L'IA apprend le PvP Minecraft -- Imitation Learning, Reinforcement Learning, et les 30 variables qui comptaient
description: "1 000 duels enregistrés, réseau neuronal entraîné sur des pixels, 90 % de précision des frappes : et le bot fonçait droit dans un mur. Puis sont venus le RL, l'apprentissage curriculaire et 60 heures d'entraînement."
date: 2026-07-09
tags:
  - minecraft
  - ai
  - reinforcement-learning
  - imitation-learning
  - python
authors:
  - fox3000foxy
---

## Introduction

![AI Learns Minecraft PvP thumbnail](assets/ai-pvp-thumbnail.png)

Il y a une vidéo intitulée [AI Learns Minecraft PvP (Reinforcement Learning + Behavior Cloning)](https://www.youtube.com/watch?v=j5nxDKAjg6U) par Kadambi | AI Engineering, et c'est l'un des récits les plus honnêtes d'entraînement d'une IA de jeu vidéo que j'aie vus.

Le principe : construire un bot qui joue au PvP Minecraft (kit épée, armure de diamant entièrement enchantée) en regardant l'écran et en envoyant des commandes souris et clavier. Pas d'accès à la mémoire du jeu, pas de macros, pas de mods : juste des pixels en entrée, des actions en sortie.

Ce qui rend la vidéo intéressante n'est pas le résultat final. C'est le parcours : l'échec de l'imitation learning, le pivot vers le feature engineering, les cycles d'oubli catastrophique, et les 60+ heures d'entraînement sur un laptop sans GPU.

## Phase 1 : Imitation Learning (l'échec)

![The bot during imitation learning: facing a wall, jumping up and down](assets/ai-pvp-imitation-fail.png)

Le créateur a commencé avec une approche sensée : enregistrer 1 000 duels de son propre gameplay, associer chaque clic de souris et pression de touche à l'image correspondante, et entraîner un réseau neuronal à prédire les actions à partir des pixels.

```python
# Pseudocode for the imitation learning pipeline
dataset = record_duels(1000)          # hundreds of thousands of frames
for frame, action in dataset:
    pixels = capture_screen(frame)
    network.train(pixels → action)    # predict keyboard/mouse from image
```

Le réseau a appris à prédire les frappes avec **90 % de précision**. Prometteur.

Puis ils l'ont testé dans un vrai match. Le bot s'est dirigé tout droit vers le bord de la carte, a fait face à un mur, et a sauté de haut en bas.

Pourquoi ?

**Le piège de la paresse.** Dans un combat PvP, la touche W est enfoncée la plupart du temps. Le réseau a réalisé qu'il pouvait atteindre une haute précision en maintenant simplement W enfoncé et en ne faisant rien d'autre. Il a optimisé l'action la plus fréquente au détriment de toutes les autres.

**La latence humaine.** Les actions dans le jeu de données sont retardées d'environ 200 ms de temps de réaction humain. Image par image, la cause et l'effet sont presque impossibles à apprendre pour un modèle à partir de pixels bruts quand l'action et sa conséquence visible sont séparées par plusieurs images.

**Démonstrations incohérentes.** Le propre gameplay du créateur variait : parfois il strafing avec le clavier, parfois visait à la souris dans des situations identiques. Ces entrées contradictoires ont perturbé le réseau.

## Phase 2 : Reinforcement Learning avec curriculum

![The bot learning to track horizontally during RL training](assets/ai-pvp-rl-horizontal.png)

Abandonnant l'imitation learning, le créateur a basculé vers le RL. Mais plonger un agent frais dans un duel PvP complet est inutile : il se passe trop de choses à la fois pour qu'une exploration aléatoire trouve quoi que ce soit.

La solution : l'**apprentissage curriculaire**. Isoler chaque mécanique et laisser le bot maîtriser les bases avant d'entrer dans un vrai combat.

### Étape 1 : Visée horizontale (7 heures)

La fonction de récompense la plus simple : récompense positive pour toucher une cible, pénalité négative pour subir des dégâts.

Initialement, le bot bouge à peine (réseau neuronal initialisé avec des valeurs neutres). Il tremble latéralement : c'est le bot qui teste différentes actions pour voir lesquelles donnent des récompenses.

Après une heure, il apprend à se centrer horizontalement, mais péniblement lentement. Après 7 heures, il peut suivre l'ennemi à gauche et à droite, bien qu'asymétriquement (meilleur pour se déplacer de droite à gauche que de gauche à droite, un comportement qui a persisté tout au long de l'entraînement).

### Étape 2 : Feature Engineering

La capture d'écran brute faisait plus de 2 millions de pixels. Même réduite à 360p, cela représente 200 000 entrées : beaucoup trop pour un apprentissage efficace.

Le créateur a analysé des milliers de duels et identifié **30 variables qui comptent vraiment**, réparties en trois groupes :

**Vision (suivi ennemi)** :
- Distance de l'ennemi par rapport au viseur (crosshair)
- Taille de la boîte englobante de l'ennemi
- Hauteur de l'ennemi
- État du viseur (sur cible / hors cible)
- Vélocité relative

Au lieu de traiter toute l'image, le bot filtre les pixels strictement par la couleur de l'armure ennemie, rendant la détection quasi instantanée. Des blocs d'arrière-plan de couleur similaire peuvent perturber ce filtrage : mais dans Minecraft, on peut simplement changer les textures.

**OCR (lecture HUD)** :
Comme le bot ne peut pas récupérer les coordonnées depuis le code du jeu, il scanne l'écran en temps réel pour extraire :
- Pitch de la caméra
- Momentum
- Niveau Y

L'OCR standard peine avec le texte transparent de Minecraft, donc les données critiques sont forcées en noir et blanc pour une lecture instantanée.

**Temps (fenêtre de contexte)** :
- Temps écoulé depuis que vous avez touché l'ennemi
- Temps écoulé depuis qu'il vous a touché
- Tampon glissant des actions précédentes du bot

Cela donne au réseau un contexte temporel : sans lui, le bot n'a aucune idée s'il est au milieu d'un combo ou s'il commence juste un combat.

### Étape 3 : Visée verticale (7 autres heures)

![The bot learning to aim up and down during RL training](assets/ai-pvp-rl-vertical.png)

Ajouter le mouvement vertical de souris a été « un désastre total » au début. La performance initiale était brisée.

Après encore une heure dans le bac à sable, le bot a compris comment regarder en haut et en bas. Mais dans le processus, il a complètement oublié comment suivre horizontalement.

C'est l'**oubli catastrophique** : un problème classique d'apprentissage machine où l'optimisation pour de nouvelles données écrase les représentations précédemment apprises. En optimisant la visée verticale, le réseau neuronal a accidentellement écrasé ses progrès horizontaux, laissant le créateur avec un bot qui pouvait maintenir son viseur à niveau mais ne pouvait pas suivre une cible.

Il a fallu **6 heures supplémentaires** pour retrouver le suivi horizontal tout en conservant le contrôle vertical. Le bot a alors maintenu un bon placement du viseur grâce au groupe OCR extrayant le pitch de la caméra.

### Étape 4 : Contrôle clavier

![The bot toggling the W key constantly, learning to commit to movement](assets/ai-pvp-keyboard.png)

Donner au bot la permission d'utiliser le clavier a rendu les caractéristiques temporelles encore plus critiques. Au début, la touche W était constamment activée et désactivée : un changement rapide parce que le réseau n'avait pas appris à s'engager.

Ce comportement a été pénalisé, donc le bot a appris à le lisser. Il a commencé à atterrir plus de coups en sprint (le son sourd contre le swish d'un coup debout). Certains combos semblaient insatisfaisants parce que le bot exploitait son avantage de portée sur l'ennemi.

Pour rendre les choses équitables, le créateur a augmenté la portée de l'ennemi. Beaucoup des stratégies apprises par le bot ont cessé de fonctionner. Mais avec le temps, il s'est adapté.

### Étape 5 : Apprendre au bot quand cliquer

Pour la phase finale, le créateur a ramené l'imitation learning : mais seulement pour enseigner le timing des clics, pas la politique de contrôle complète. Le bot a essayé d'imiter les modèles de clics des duels enregistrés.

Initialement, il avait trop peur d'essayer quoi que ce soit, craignant la pénalité pour les mauvais clics. Mais il a finalement trouvé le courage de frapper et d'atterrir des coups. Bien sûr, il a oublié comment viser encore une fois dans le processus : le créateur a dû le laisser tranquille pendant **50 heures supplémentaires** pour revenir à un état satisfaisant.

## Le débat sur la triche

La vidéo se termine en demandant : ce bot triche-t-il ?

L'argument contre : le bot ne traite que ce qu'un humain voit (les mêmes pixels), envoie les mêmes entrées clavier/souris qu'un humain (pas de manipulation de paquets comme l'anti-knockback), et ne lit pas la mémoire du jeu (pas de X-ray ni d'ESP).

L'argument pour : un bot peut traiter plus vite qu'un humain, et si l'adversaire pense qu'il joue contre un humain mais que ce n'est pas le cas, c'est de la tromperie.

L'avis du créateur : cela dépend de l'intention. Si les deux parties savent que c'est un bot, le match est équitable. Le bot enchaîne l'ennemi dans le vide avec une série de 100 coups.

## Le résultat

![The bot executing a 100-hit combo](assets/ai-pvp-final-combo.png)

Un bot PvP Minecraft entraîné sur un **laptop sans GPU**, construit sur un pipeline d'entraînement personnalisé avec :

- **Capture d'écran** pour l'entrée pixel (2M+ pixels → 30 caractéristiques conçues)
- **Apprentissage curriculaire** (horizontal → vertical → clavier → clics)
- **RL pour le contrôle moteur** + **imitation learning pour le timing des clics**
- **Feature engineering** sur les pixels bruts (3 groupes : vision, OCR, temps)
- **60+ heures d'entraînement** sur plusieurs phases

Le temps total d'entraînement est de dizaines d'heures, mais la plupart sont passives. Le bot tremble jusqu'à la compréhension, oublie ce qu'il a appris, ré-apprend, et finit par enchaîner une série de 100 coups.

La vidéo est sur [youtube.com/watch?v=j5nxDKAjg6U](https://www.youtube.com/watch?v=j5nxDKAjg6U).

---

*Cet article couvre uniquement le contenu de la vidéo. Pour un contexte plus large sur l'IA Minecraft : VPT, DreamerV3, et le paysage de l'imitation learning vs RL : les sections ci-dessous relient ce projet au domaine plus vaste.*

## VPT : Behavior cloning à grande échelle

![OpenAI's VPT project diagram : the Inverse Dynamics Model predicts actions from pairs of frames](assets/vpt-overview.svg)

L'approche « behavior cloning » de la vidéo (Phase 1) est la même technique qu'OpenAI a utilisée dans son projet **Video PreTraining (VPT)**, mais aux extrémités opposées du spectre de ressources. VPT a prouvé que l'imitation learning fonctionne pour Minecraft quand on a 70 000 heures de vidéo, 720 GPUs, et un inverse dynamics model pour pseudo-étiqueter des données non labellisées. Le créateur ici a prouvé qu'il échoue avec un laptop et 1 000 duels : mais pour la même raison fondamentale : l'imitation learning est limité par la qualité de ses démonstrations.

![OpenAI's VPT agent mining a tree in Minecraft](assets/vpt-minecraft.jpg)

Le pipeline VPT résout le problème des données en entraînant un **Inverse Dynamics Model (IDM)** qui regarde l'image t-1 et l'image t+1 pour prédire l'action à l'image t. Parce que l'IDM est non causal (il voit les images futures), la tâche est plus facile que le behavior cloning et nécessite beaucoup moins de données labellisées. Ils ont payé des contracteurs environ 2 000 $ pour 2 000 heures de données labellisées, puis ont utilisé l'IDM pour pseudo-étiqueter 70 000 heures de vidéos YouTube Minecraft.

Le modèle fondamental de 0,5B paramètres résultant a atteint des capacités zero-shot impossibles avec le RL seul : couper des arbres, fabriquer des tables, saut en colonne : et fine-tuné avec du RL, il est devenu la première IA à fabriquer des outils en diamant.

## OpenAI Five : Le problème du reward shaping

![OpenAI Five playing Dota 2 against human professionals](assets/openai-five-dota2.jpg)

OpenAI Five (2019) a vaincu les champions du monde de Dota 2 en utilisant du RL pur en auto-apprentissage : pas d'imitation learning. 256 GPUs, 128 000 cœurs CPU, 180 années de jeu par jour, 10 mois d'entraînement.

Mais la fonction de récompense a été conçue à la main par des experts de Dota : **28 caractéristiques sur les 20 000 disponibles**, chacune avec des poids ajustés manuellement. Valeur nette, éliminations, morts, santé des tours, assignations de couloirs : tout a été sélectionné et pondéré par des humains. Sans cette modélisation, l'agent apprenait à peine (expérience : récompense seulement victoire/défaite → plateau au niveau semi-pro).

Le bot de la vidéo fait face au même problème : sa fonction de récompense encode la compréhension du créateur de ce qui compte en PvP (toucher est bon, être touché est mauvais, maintenir le viseur est bon). C'est inévitable : le RL a besoin d'un signal de récompense, et la modélisation de ce signal encode un biais humain.

## DreamerV3 : World models et récompenses éparses

![DreamerV3 benchmark scores across over 150 diverse tasks with a single configuration](assets/dreamerv3-benchmarks.png)

Le DreamerV3 de DeepMind (2023) adopte une troisième approche. Au lieu du behavior cloning ou du RL avec incitations, il apprend un **world model** : un réseau neuronal qui prédit les états futurs et les récompenses à partir des actions passées : et planifie en rêvant de futurs possibles. C'est le premier algorithme à collecter des diamants dans Minecraft de zéro sans données humaines ni curricula, publié dans Nature en 2025.

![DreamerV3 learns a world model to imagine future trajectories](assets/dreamerv3-header.png)

L'environnement diamant définit une récompense éparse sur 12 jalons (bûche → planches → bâton → table de craft → pioche en bois → pierre → pioche en pierre → minerai de fer → four → lingot de fer → pioche en fer → diamant), chacun donnant +1 une seule fois. Plus une petite récompense de santé (±0,01 par pv). Total atteignable : 11,1 dans un épisode de 36 000 étapes.

Le world model de DreamerV3 lui permet d'imaginer des trajectoires et de les évaluer en interne : l'acteur apprend des rollouts rêvés plutôt que de l'expérience réelle, testant des milliers de futurs possibles pour chaque étape réelle. Cela rend possibles les récompenses épars la où elles détruiraient un agent RL standard.

Sur 40 graines entraînées pour 100M d'étapes environnementales, 24 des 40 ont collecté au moins un diamant. Le premier diamant est apparu après 29M d'étapes (~9 jours sur un GPU).

## ANNA : L'IA symbolique rencontre Minecraft

![ANNA's task tree decomposition for a flint-and-steel](assets/anna-task-tree.png)

Avant le bot PvP de la vidéo, avant VPT et DreamerV3, il y avait **ANNA** : un bot Minecraft construit avec une philosophie complètement différente. Au lieu d'apprendre à partir de pixels ou de récompenses, ANNA utilise une **machine d'états symbolique** avec un **analyseur NLP français** et un **arbre de dépendances de tâches** écrit à la main.

Créé en 2022 (avant que « vibe coding » soit un terme), ANNA se connecte à un serveur Minecraft via Mineflayer et comprend des commandes en langage naturel en français. Dites *« obtiens un briquet », et ANNA analyse le verbe (obtien → obtenir), cherche la recette de l'objet, et le décompose récursivement en sous-tâches : miner du chêne → fabriquer des planches → fabriquer des bâtons → fabriquer une table de craft → fabriquer une pioche en bois → miner de la pierre → fabriquer une pioche en pierre → miner du minerai de fer → fondre des lingots de fer → fabriquer le briquet.

![ANNA's NLP parser architecture for French command recognition](assets/anna-nlp-diagram.png)

La couche NLP (`utils/id_parser.js`) sépare les commandes sur « et » pour gérer les ordres parallèles, associe les verbes français aux types de tâches, et traduit les noms d'objets français en identifiants Minecraft via un dictionnaire de 5 000 entrées. Les commandes non reconnues passent à un système de conversation basé sur GPT qui présente ANNA comme un compagnon Minecraft conscient.

L'**arbre de tâches** (`mc-tasks-tree/`) est le cœur : un algorithme récursif qui parcourt le graphe d'objets Minecraft (recettes de craft, rendements miniers, drops de monstres, recettes de four) pour produire un plan pas à pas. Pour un casque en diamant, il génère une décomposition en 40+ étapes couvrant les niveaux bois, pierre, fer et diamant.

![ANNA's diamond helmet task tree : a 40+ step breakdown](assets/anna-diamond-helmet.png)

Là où le bot PvP de la vidéo apprend de l'expérience, ANNA fonctionne à partir de la connaissance. Il n'a pas besoin de 1 000 duels ou 60 heures d'entraînement : il a besoin de l'arbre, de l'analyseur et du serveur/distributeur. Mais il ne peut pas non plus généraliser au-delà de ce que son arbre encode. Aucune quantité d'ingénierie de machine d'états ne lui apprendrait à faire du PvP.

L'approche d'ANNA reflète une époque différente de l'IA : avant que l'apprentissage de bout en bout ne domine, quand la promesse était que le raisonnement symbolique associé à une ingénierie soigneuse pouvait produire un comportement intelligent. Aujourd'hui, des projets comme ANNA et le bot PvP représentent deux pôles de l'IA Minecraft : l'un raisonne sur le monde, l'autre le perçoit.

## Master Gumbo's Mace Bot : IA avec seulement des command blocks

![The Mace PvP training arena with the bot](assets/mace-bot-arena.png)

Dans un coin complètement différent de l'IA Minecraft, le YouTubeur **Master Gumbo** a construit un bot d'entraînement PvP en utilisant **seulement des command blocks** : pas de mods, pas de plugins, pas de code externe. Juste des commandes Minecraft vanilla, de la redstone, et un carpet mod pour des entités clones de joueur. Le résultat est un adversaire IA pour la masse qui pratique les changements de brèche, les charges de vent et les mécanismes de bouclier avec le joueur.

Le bot commence comme un zombie avec un équipement incassable et un totem dans sa seconde main (rempli à chaque tick via `/item replace`), le rendant effectivement immortel. Plus tard, Master Gumbo passe aux bots **Carpet Mod's player replica**, qui supportent des mécaniques humanoïdes (levage de bouclier, changement d'objet) que les zombies ne peuvent pas faire.

![The settings center : buttons to configure bot behavior](assets/mace-settings-center.png)

L'innovation centrale est une **machine d'états pilotée par l'aléatoire**. Un porte-armure est téléporté au-dessus d'un cercle de blocs de béton coloré via la commande `/spreadplayers`, qui dispers les entités aléatoirement. La couleur du bloc de béton sur lequel le porte-armure atterrit détermine la prochaine action du bot :

- **Béton rouge** → strafe en arrière
- **Béton bleu** → s'élève vers le haut (attaque) avec la charge de vent
- **Béton vert** → lever le bouclier
- **Béton blanc** → pause (ajoute du délai entre les actions)

![The AI decision system : an armor stand on colored concrete](assets/mace-ai-system.png)

La position du porte-armure est lue par des command blocks qui détectant le bloc en dessous et activent le mécanisme correspondant. Un bloc de redstone est placé ou retiré pour activer/désactiver chaque comportement. Parce que `/spreadplayers` tourne en répétition, le bot prend continuellement de nouvelles décisions, créant un comportement imprévisible mais structuré.

Master Gumbo appelle cela « une forme très simple et basique d'IA » : cela n'apprend pas des interactions comme les réseaux neuronaux, mais l'aleatoire + machine d'états produit un comportement PvP réaliste qui est plus difficile à prédire qu'un bot scripté. Le centre de paramètres inclut une interface livre pour activer/désactiver l'IA, ajuster la difficulté et configurer les motifs de déplacement.

Après leur entraînement avec le bot puis en duel contre le joueur qui l'avait traité de nul (dans l'intro de sa vidéo), Master Gumbo gagne. La carte est partagée via Discord, Carpet Mod requis.

![The bot in a duel, practicing mace PvP techniques](assets/mace-final-duel.png)

Là où le bot PvP (Kadambi) apprend à partir de pixels et ANNA raisonne à travers un arbre de tâches, le bot de Master Gumbo atteint l'intelligence par des **transitions d'états aléatoires** : une approche pur command block qui prouve que vous n'avez pas besoin de réseaux neuronaux pour construire un adversaire PvP convaincant.

## Ce qui les relie

| Approche | Méthode principale | Données | Calcul | Résultat | |
|--------------------------|---------------------|---------|--------|-----------|-|
| Bot PvP de la vidéo | RL + imitation learning | 1 000 duels | 1 laptop, 60h | Combo de 100 coups | |
| OpenAI Five | RL en auto-apprentissage | 180 ans de jeu/jour | 256 GPUs, 10mo | Champion du monde Dota 2 | |
| VPT | IL semi-supervisé | 70K h YouTube + IDM | 720 GPUs, 9 jours | Outils en diamant | |
| DreamerV3 | RL monde model | Trajets rêvés | 1 GPU, 9 jours | Diamant de zéro | |
| **ANNA** | **NLP symbolique + arbre de tâches** | **Recettes écrites** | **1 laptop, instant** | **Tout objet craftable** | |
| **Mace Bot** | **Machine d'états Command block** | **Décisions aléatoires** | **Vanilla MC, sans GPU** | **Entraînelent PvP mace** | |

Le bot de la vidéo est le plus contraint en ressources mais le plus honnête sur le processus. Il échoue d'abord, puis itère. Il oublie ce qu'il a appris, puis l'apprend à nouveau. Il se termine par un combo de 100 coups : mais aussi par une question sur ce qu'il a construit en triche.

---

**Vidéo** : [AI Learns Minecraft PvP](https://www.youtube.com/watch?v=j5nxDKAjg6U) par Kadambi | AI Engineering

**VPT** : [Article](https://cdn.openai.com/vpt/Paper.pdf) · [Blog](https://openai.com/index/vpt/) · [GitHub](https://github.com/openai/Video-Pre-Training)

**OpenAI Five** : [Article](https://arxiv.org/abs/1912.06680) · [Blog](https://openai.com/index/dota-2/)

**DreamerV3** : [Article](https://arxiv.org/abs/2301.04104) · [GitHub](https://github.com/danijar/dreamerv3)

**ANNA** : [GitHub](https://github.com/fox3000foxy/ANNA) · (Node.js, Mineflayer, NLP français, arbre de tâches)

**Mace Bot** : [Vidéo](https://www.youtube.com/watch?v=Fmp2Il70IF8) par Master Gumbo · (Command blocks, Carpet Mod, machine d'états)
