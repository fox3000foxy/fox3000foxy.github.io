---
title: Bareiron — le serveur Minecraft qui tourne sur un microcontrôleur à 1$
description: 6800 lignes de C, zéro malloc, du Perlin noise remplacé par de la
  bilinear interpolation, des biomes en tile map, et tout ça sur une puce à 1$.
date: 2026-05-30
tags:
  - minecraft
  - reverse-engineering
  - embedded
  - c
  - esp32
authors:
  - fox3000foxy
---

## Introduction

Y'a un microcontrôleur à 1$ qui fait tourner un serveur Minecraft.

Pas un "monde plat avec steve qui cligne des yeux". Génération infinie, biomes, grottes, craft, mine, mobs, faim, coffres. Sur une puce à **160 MHz** qui consomme **0.5 Watt**.

Le projet c'est [Bareiron](https://github.com/p2r3/bareiron/), par p2r3.

Et c'est pas "j'ai écrit un serveur en C". C'est "j'ai réfléchi à chaque byte et tordu le protocole Minecraft dans tous les sens pour faire tenir l'impossible dans 520 KB de SRAM".

## Le problème de base

Le serveur Notchian c'est un monstre. Gigas de RAM, Perlin noise à plusieurs octaves, 6 paramètres biomiques (température, humidité, continentalité, érosion, weirdness, profondeur), compression zlib, millions de chunks en mémoire.

L'ESP32-C3 c'est :
- **520 KB de SRAM** (400 dispo après boot)
- **160 MHz**
- **0.5 Watt**

Le facteur entre les deux ? Environ **20 000**.

p2r3 a pas optimisé le serveur vanilla. Il a tout réinventé depuis zéro.

## La génération de terrain : le move le plus intelligent du projet

Le cœur du problème : générer un terrain infini sans stockage mémoire et sans compute cher.

La solution du Notchian c'est le Perlin noise : plusieurs octaves de bruit superposées, des paramètres biomiques partout. Ça marche, c'est joli, c'est cher.

La solution de Bareiron c'est de la **bilinear interpolation** sur des points générés par un **RNG déterministe**.

Tu vois le principe de la bilinear interpolation ? C'est ce que fait un logiciel d'image quand tu agrandis une icône pixelisée — les bords deviennent flous, tu obtiens un gradient continu.

Bareiron applique ça au terrain :

```c
hauteur = interpoler_bilineaire(
  RNG(chunk_x,     chunk_z),     // coin haut-gauche
  RNG(chunk_x + 1, chunk_z),     // coin haut-droit
  RNG(chunk_x,     chunk_z + 1), // coin bas-gauche
  RNG(chunk_x + 1, chunk_z + 1), // coin bas-droit
  offset_x, offset_z
);
```

Le RNG est seedé par les coordonnées du chunk. Pour les mêmes coordonnées, il donne toujours le même résultat. C'est déterministe. Du coup t'as pas besoin de stocker le terrain — tu peux le recalculer à la volée, et ça donne le même résultat à chaque fois.

Magic : les chunks adjacents partagent 2 coins. Donc l'interpolation est **continue entre chunks**. Pas de fissures, pas de raccords moches.

En ajustant le nombre de bits du RNG que tu combines, tu contrôles la régularité du terrain. Plus de bits = plus de facteurs qui se combinent = terrain plus régulier (comme plus de lancers de pièces donnent une distribution plus proche de 50/50). Moins de bits = terrain plus accidenté.

Résultat : terrain infini, zéro stockage mémoire, et un chunk généré en **200 ms** sur ESP32.

### Les grottes : le mirror le plus paresseux

Les grottes vanilla ont leur propre générateur complexe. Bareiron fait ça :

```c
altitude_grotte = CAVE_BASE_DEPTH - (hauteur_surface - y);
```

Il prend la hauteur de la surface et la mirror sous le niveau des grottes. Le résultat ressemble aux grandes cavités deepslate que tu croises dans le monde normal.

C'est pas aussi varié que les grottes vanilla. Mais ça a coûté littéralement 1 ligne de code et zéro compute supplémentaire.

### Les minerais : pas de veines, une opération par colonne

Dans vanilla, les minerais sont générés en veines avec des algorithmes de bruit spéciaux. Bareiron prend un raccourci : un XOR des coordonnées de la colonne garantit exactement un candidat par colonne, et le type dépend de l'altitude.

```c
candidat = (chunk_x ^ col_x ^ col_z) % 100;
if (candidat < 5 && y < 16) -> diamond
if (candidat < 15 && y < 32) -> gold
// etc.
```

Zéro stockage, zéro Perlin, une opération mathématique.

### Le système de biomes : des îles dans une grille

Les biomes auraient pu être une couche de noise par-dessus le terrain. Mais ça doublerait le compute nécessaire. p2r3 a donc pris une approche plus radicale : une **tile map** où chaque biome est une île circulaire disposée dans une grille.

Le type de chaque île est déterminé par un petit pattern répété, calculé depuis la seed du monde. C'est griddé, c'est prévisible, mais ça coûte **rien**.

Chaque biome ajuste ensuite les paramètres de la génération :
- **Plains/Forest** : 4 facteurs de hauteur, terrain plat avec reliefs
- **Desert** : variation limitée à 6 blocs, jamais sous la mer
- **Snowy plains** : 2 facteurs, variation jusqu'à 14 blocs, plus vallonné

Pour les éléments de surface (arbres dans la forêt, cactus dans le désert, buissons dans la neige), ils utilisent les mêmes nombres aléatoires issus des coins du chunk. Donc zéro overhead supplémentaire.

## Le craft : quand le code moche est plus intelligent

La manière propre d'implémenter le craft, ce serait de définir des matrices 3x3 pour chaque recette, et d'utiliser un algorithme de kernel-fitting pour matcher sur la grille. C'est propre, maintenable, extensible.

C'est aussi cher en mémoire. p2r3 a choisi une autre voie.

La fonction de craft commence par compter les slots remplis, noter le premier item rencontré, et vérifier si tous les autres sont identiques.

Avec ça, certaines recettes se matchent en 4 opérations :

```c
if (count == 8 && first == cobblestone && all_identical && center_empty)
    return furnace;
```

Pour les formes plus complexes, le code utilise l'index du premier item et vérifie la position relative des autres. Par exemple, les cisailles : 2 items en fer positionnés en diagonale, peu importe où dans la grille.

Les recettes similaires partagent la même fonction de matching. Une seule forme pour toutes les pioches, le matériau détermine le résultat.

Le résultat est un code beaucoup moins lisible qu'une belle table de recettes. Mais il prend zéro mémoire et il s'exécute en un nombre d'instructions ridicule.

## Le fourneau : un crafting table sans timer

Dans vanilla, le fourneau prend du temps. Il faut stocker le timer, gérer l'input et l'output, gérer le fuel. Ça veut dire de la mémoire et du compute pour chaque fourneau actif.

Bareiron dit non. Le fourneau fonctionne comme la table de craft : tu poses les ingrédients, tu récupères le résultat. Instantané.

Moins réaliste. Beaucoup plus efficace. Et honnêtement, sur une ESP32, qui a envie d'attendre que son minerai cuise ?

## Les coffres : le hack de mémoire le plus dégueu que t'aies vu

Quand les testeurs ont demandé les coffres, p2r3 s'est retrouvé avec un problème concret : où stocker les 27 slots d'inventaire sans allouer de mémoire dynamique ?

Le tableau des changements de blocs, c'est des entrées de 6 bytes :
- 2 bytes pour X
- 1 byte pour Y
- 2 bytes pour Z
- 1 byte pour l'ID du bloc

Et les items dans Bareiron, c'est : 16 bits pour l'ID, 8 bits pour la taille de la stack.

Par pure coïncidence, chaque entrée de bloc peut stocker **exactement 2 items**.

Du coup chaque coffre prend 15 entrées dans le tableau des changements de blocs : 1 pour le bloc coffre lui-même, et 14 pour les 27 slots (2 slots par entrée, 3 bytes par slot, 1 byte de perte).

Quand un joueur ouvre un coffre, le serveur **copie la mémoire** des slots dans le buffer de craft du joueur. Le buffer est recyclé parce que tu peux pas crafter avec un coffre ouvert. Pour bloquer le craft, un flag `0x80` est levé.

Le commentaire dans le code source :

```c
// Terrible memory hack!!1!
```

Je pouvais pas le dire mieux.

## La faim qui se calcule gratuitement

La mécanique de faim de Minecraft moderne est complexe. Santé, faim, saturation, tout un système de timers.

p2r3 a réalisé un truc. Quand un joueur bouge, son client envoie des packets de mouvement au serveur à environ 20 par seconde. Quand il ne bouge pas, il en envoie juste un.

Le serveur doit de toute façon traiter ces packets. Donc p2r3 en a fait un compteur d'activité gratuit.

```c
// Chaque packet de mouvement reçu → compteur--
// Quand le compteur atteint 0 → la faim baisse de 1
// Quand le joueur mange → le compteur augmente
```

Zéro timer, zéro mémoire allouée, zéro compute dédié. La faim est implémentée sans rien coûter.

## Les mobs dans 8 bytes

Chaque mob tient dans 8 bytes :
- 1 byte pour le type (zombie, poule, vache, cochon, mouton)
- 2 bytes pour X
- 1 byte pour Y
- 2 bytes pour Z
- 1 byte pour le data (santé, état de tonte, timer de panique)

Les passifs errent dans 8 directions au hasard. Les hostiles marchent droit vers le joueur le plus proche. Pas de pathfinding, pas d'obstacle avoidance, pas de A*. Rien.

Quand un zombie est à 2 blocs, il inflige 3 coeurs par seconde — sciemment plus que vanilla, pour compenser le fait que son IA est débile et prévisible. L'armure réduit les dégâts avec l'ancienne formule pré-1.9 du combat update.

Les mobs apparaissent quand un joueur traverse une frontière de chunk, plutôt qu'avec des random ticks. Zéro overhead de spawn, zéro stockage.

## Les trucs qui ont sauté

Tout ça a un prix. Y'a des features vanilla qui existent pas :

- **Aucune compression réseau** — zlib est trop cher en CPU. Résultat : le serveur peut générer des chunks rapidement, mais les envoyer devient le goulot d'étranglement.
- **Aucun random tick** — les arbres poussent avec de la bone meal ou pas du tout.
- **Aucune entité item** — les blocs minés vont directement dans l'inventaire. Y'a une animation visuelle de vol, mais le serveur vérifie pas la distance.
- **Aucune vérification d'inventaire** — le serveur trust le client. Si ton client dit que t'as 64 diamants, t'as 64 diamants.
- **Aucune lumière calculée par le serveur** — les torches sont envoyées après tous les autres blocs, ce qui force le client à calculer la lumière tout seul.
- **Aucun fluide progressif** — l'eau et la lave atteignent leur état final instantanément.

## Le résultat

Sur un PC desktop avec un Ryzen 5 3600, Bareiron génère un chunk en ~0.5 ms.

Sur une ESP32-C3 à moins d'1$, c'est ~200 ms par chunk. C'est jouable.

Avec plus de 3 joueurs, ça commence à laguer — comparable à 2b2t aux heures de pointe, dixit l'auteur. Mais ça marche.

Et c'est open source, GPLv3, sur [GitHub](https://github.com/p2r3/bareiron/).

## La philosophie du projet

Chaque décision dans Bareiron est un tradeoff conscient entre fonctionnalité et performance. Rien n'est là par hasard.

Perlin noise → bilinear interpolation : le rendu est moins joli, mais 200x plus rapide et zéro mémoire.
Matrices de craft → matching hardcodé : le code est dégueu, mais prend pas un byte.
zlib → rien : impossible à hoster sur une connexion pourrie, mais jouable.
Validation inventaire → trust : zéro sécurité, zéro compute.

C'est pas "faire un serveur Minecraft en C". C'est "faire un serveur Minecraft qui tient sur un microcontrôleur en faisant les bons sacrifices".

**Les 3 trucs à retenir :**

1. **Bilinear interpolation + RNG déterministe** — Remplacer Perlin noise par 4 points seedés et interpolés, c'est le move qui rend tout le reste possible. Terrain infini sans stockage, génération en 200 ms.
2. **Chaque feature a un coût** — Pas de compression, pas de random ticks, pas de validation. Ces sacrifices sont pas du "j'ai la flemme", c'est ce qui permet au reste de tenir dans 520 KB.
3. **Les solutions les plus dégueus sont parfois les plus intelligentes** — Les coffres dans le tableau de blocs, la faim trackée par les packets de mouvement, le fourneau instantané. La solution "propre" aurait été trop coûteuse.

Va jeter un oeil au repo si tu veux voir du C bien sale. Ça vaut le détour xD
