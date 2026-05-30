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

Tu t'es déjà demandé si on pouvait faire tourner un serveur Minecraft sur un microcontrôleur à 1 balles ?

Moi oui. Et la réponse c'est oui. Littéralement.

Y'a un projet qui s'appelle [Bareiron](https://github.com/p2r3/bareiron/), signé p2r3, et c'est probablement l'un des projets les plus fascinants que j'aie vus dans le monde Minecraft ces dernières années. On parle de **6800 lignes de C**, zéro dépendance externe, pas de malloc, pas de threading, et ça tourne sur une **ESP32 à 1 dollar**.

Génération de terrain infinie. Des biomes. Des grottes. Du craft. De la mine. Des mobs. De la faim. Des coffres. Tout ce que t'attends d'un serveur survival.

Sur une puce qui consomme **0.5 Watt** et qui a **160 MHz** de clock.

Pour donner un ordre d'idée : un serveur Minecraft vanilla a besoin de plusieurs gigas de RAM et d'un processeur qui pleure pas. L'ESP32-C3, c'est **520 KB de SRAM** (400 dispo après le boot). Soit un facteur ~20 000 entre les deux en puissance pure.

Alors comment c'est possible ? p2r3 a pas écrit un serveur Minecraft en C, il a réinventé chaque brique du serveur pour que ça tienne dans ces contraintes. Et franchement, la manière dont il s'y est pris, c'est un cours d'ingénierie à lui tout seul.

## Le cerveau du projet : une génération de terrain sans mémoire

Le plus gros problème quand tu veux faire un serveur MC embarqué, c'est la génération de terrain.

Dans Minecraft vanilla, le monde est généré avec du **Perlin noise**. C'est un algorithme qui produit un bruit continu, un peu comme un nuage flou, en superposant plusieurs couches (on appelle ça des octaves). Plus tu ajoutes d'octaves, plus le terrain devient réaliste. Ensuite, t'appliques 6 paramètres biomiques — température, humidité, continentalité, érosion, weirdness, profondeur — pour déterminer à quoi ressemble le paysage.

Le résultat est magnifique. Mais c'est cher en calcul, et ça prend de la RAM pour stocker les chunks générés.

L'approche de Bareiron est radicalement différente. Au lieu d'empiler du bruit, il utilise de la **bilinear interpolation**.

Tu sais quand tu agrandis une petite image pixelisée et que les bords deviennent flous ? C'est ça, la bilinear interpolation. Un algorithme simple qui prend 4 points et remplit les espaces entre eux avec un gradient continu.

Bareiron l'applique au terrain comme ça :

```c
hauteur = interpoler_bilineaire(
  RNG(chunk_x,     chunk_z),     // coin haut-gauche
  RNG(chunk_x + 1, chunk_z),     // coin haut-droit
  RNG(chunk_x,     chunk_z + 1), // coin bas-gauche
  RNG(chunk_x + 1, chunk_z + 1), // coin bas-droit
  offset_x, offset_z
);
```

Les 4 points de référence pour chaque chunk, ce sont ses coins. Leurs coordonnées sont passées en **seed** à un générateur de nombres aléatoires. Et comme le RNG est déterministe, pour les mêmes coordonnées il donne toujours le même résultat.

Tu captes la puissance du truc ? Le serveur n'a pas besoin de stocker le terrain quelque part. Il peut le recalculer à la volée à chaque fois que le joueur arrive dans une nouvelle zone. Et ça donne exactement le même résultat.

Les chunks adjacents partagent 2 coins entre eux, donc l'interpolation est continue d'un chunk à l'autre. Pas de fissures, pas de cassures nettes entre deux zones générées.

Et tu peux régler le rendu en ajustant le nombre de bits du RNG que tu combines. Plus tu prends de bits, plus le terrain est régulier — un peu comme plus tu lances de pièces, plus la distribution se rapproche de 50/50. Moins de bits, le terrain devient plus accidenté.

Avec cette méthode, générer un chunk sur l'ESP32 prend environ **200 millisecondes**. C'est parfaitement jouable.

### Les grottes, ou l'art de ne pas se faire chier

Les grottes dans Minecraft vanilla ont leur propre algorithme de génération, avec des bruits dédiés, des biomes souterrains, tout un tas de complexité.

Bareiron répond à ça avec une ligne de code :

```c
altitude_grotte = CAVE_BASE_DEPTH - (hauteur_surface - y);
```

Il prend la hauteur de la surface au-dessus et il la **mirror** sous terre. Ça produit des cavités qui ressemblent aux grandes grottes de deepslate que tu connais.

C'est pas aussi varié que les grottes vanilla, c'est sûr. Mais ça a coûté zéro compute supplémentaire et littéralement une ligne de code.

### Les minerais, version XOR

Pour les minerais, pareil. Pas de veines complexes à générer. Un XOR des coordonnées de la colonne, et tu garantis exactement un candidat par colonne. Le type du minerai dépend juste de l'altitude.

```c
candidat = (chunk_x ^ col_x ^ col_z) % 100;
if (candidat < 5 && y < 16) -> diamond
if (candidat < 15 && y < 32) -> gold
// etc.
```

J'te jure, c'est tout. Une opération mathématique. Zéro stockage.

### Le système de biomes en tile map

Les biomes, c'est le genre de truc qui pourrait te coûter cher. Une couche de noise par-dessus le terrain, des paramètres partout, et tout à coup t'as doublé ton compute.

Bareiron prend une approche plus rustique mais diablement efficace : une **tile map**. Chaque biome est une île circulaire disposée dans une grille. Le type de chaque île est déterminé par un petit pattern calculé depuis la seed du monde.

Oui, c'est griddé. Oui, c'est prévisible. Mais ça coûte rien, et au final le rendu est convaincant.

Chaque biome ajuste ensuite les paramètres de la génération de hauteur :
- **Plains et forest** : 4 facteurs de hauteur, terrain plutôt plat avec des reliefs
- **Desert** : variation limitée à 6 blocs, jamais sous l'eau
- **Snowy plains** : seulement 2 facteurs, mais variation jusqu'à 14 blocs — plus vallonné

Les éléments de surface comme les arbres, les cactus ou les buissons, ils utilisent les mêmes nombres aléatoires générés à partir des coins du chunk. Zero overhead supplémentaire.

## Le craft : quand la solution moche est la meilleure

Dans un monde idéal, le craft ça s'implémente avec des matrices 3x3 pour chaque recette et un algorithme de kernel-fitting qui matche les patterns. C'est propre, c'est maintenable, c'est extensible.

C'est aussi cher en mémoire.

p2r3 a choisi une approche beaucoup plus... pragmatique. Sa fonction de craft commence par compter les slots remplis, repérer le premier item, et vérifier si tous les autres items sont identiques.

Avec juste ça, tu peux déjà matcher des recettes simples en quelques opérations :

```c
if (count == 8 && first == cobblestone && all_identical && center_empty)
    return furnace;
```

4 conditions et t'as matché la recette du fourneau. Change une condition et t'as celle du coffre.

Pour les formes plus complexes, comme les outils, le code utilise l'index du premier item pour déterminer la position relative des autres. Les cisailles par exemple : 2 items en fer, positionnés en diagonal l'un de l'autre.

Les recettes qui partagent une forme (toutes les pioches, toutes les épées) utilisent la même fonction de matching, le résultat change juste selon le matériau détecté.

Le code est moins lisible qu'une belle table de recettes. Mais il prend zéro mémoire et il s'exécute en un nombre d'instructions ridicule. Et sur une ESP32, c'est ça qui compte.

## Le fourneau qui triche

Le fourneau dans Minecraft vanilla, c'est toute une mécanique. Un timer qui tourne, des items en entrée, un résultat qui se prépare, du fuel à gérer. Ça prend de la place en mémoire pour stocker l'état de chaque fourneau actif.

Bareiron répond : non. Le fourneau fonctionne comme une table de craft. Tu mets les ingrédients, tu récupères le résultat. **Instantané.**

C'est pas réaliste. Mais c'est efficace, ça prend zéro mémoire, et ça évite d'avoir à gérer des timers et des états persistants pour chaque bloc.

## Les coffres : le hack le plus dégueulasse que j'aie vu

Quand p2r3 a commencé à faire tester son projet, les gens ont demandé des coffres. Sans coffres, impossible de partager des items entre joueurs. Résultat : les gens mouraient de faim alors que d'autres avaient des stocks de nourriture.

Mais ajouter des coffres, ça veut dire stocker 27 slots d'inventaire par coffre. Et sur une ESP32, tu peux pas faire de `malloc` quand tu veux. Il faut savoir à l'avance combien de mémoire tu vas utiliser.

La solution qu'il a trouvée est tellement tordue qu'elle en devient magnifique.

Le tableau qui stocke les changements de blocs, c'est des petites entrées de 6 bytes :
- 2 bytes pour X
- 1 byte pour Y
- 2 bytes pour Z
- 1 byte pour l'ID du bloc

Et la manière dont Bareiron stocke un item dans le code, c'est : 16 bits pour l'ID de l'item, 8 bits pour la taille de la stack.

Par pure coïncidence, chaque entrée de 6 bytes peut stocker **exactement 2 items**.

Du coup, chaque coffre prend 15 entrées dans le tableau des blocs — 1 pour le bloc coffre, 14 pour les 27 slots de son inventaire (à raison de 2 items par entrée, 3 bytes par slot).

Quand un joueur ouvre un coffre, le serveur copie la zone mémoire qui contient les slots directement dans le buffer de craft du joueur. Ce buffer est normalement utilisé pour crafter, mais tu peux pas crafter avec un coffre ouvert, donc il est recyclé. Et pour être sûr que personne essaie de crafter pendant que le coffre est ouvert, un flag spécial est levé qui bloque toute tentative de craft.

Le commentaire dans le code source :

```c
// Terrible memory hack!!1!
```

Franchement, je pouvais pas le dire mieux.

## La faim qui se track toute seule

Y'a un truc que j'adore dans ce projet, c'est la manière dont la faim est implémentée.

La mécanique de faim moderne de Minecraft est complexe. T'as la santé, la faim, la saturation, tout un système de timers, des calculs à faire en fonction de ce que le joueur fait.

p2r3 a réalisé un truc tout bête : quand un joueur bouge, son envoie des packets de mouvement au serveur à environ 20 par seconde. Quand il bouge pas, il en envoie un tout seul.

Le serveur doit traiter ces packets de toute façon. C'est un travail qu'il fait déjà, quoi qu'il arrive.

Alors il en a profité pour en faire un compteur d'activité gratuit.

Chaque packet de mouvement reçu, le compteur diminue. Quand il arrive à zéro, la faim du joueur baisse. Quand le joueur mange, le compteur remonte.

Zéro timer alloué. Zéro mémoire utilisée. Zéro cycle compute dédié. La faim est implémentée en utilisant un effet secondaire d'un système qui existe déjà.

Je trouve ça brillant.

## Les mobs, version low-cost

Chaque mob dans Bareiron, c'est **8 bytes**. Littéralement :
- 1 byte pour le type
- 2 bytes pour X
- 1 byte pour Y
- 2 bytes pour Z
- 1 byte pour les données (santé, état de tonte, timer de panique)

Les mobs passifs errent dans 8 directions au hasard. Les hostiles marchent droit vers le joueur le plus proche. Pas de pathfinding, pas de A*, pas d'évitement d'obstacles. Ils vont vers toi en ligne droite.

Quand un zombie arrive à 2 blocs, il tape à 3 coeurs par seconde. C'est délibérément plus que la normale, parce que sans pathfinding les joueurs peuvent les kiter facilement. L'armure réduit les dégâts avec la formule d'avant le combat update.

Les mobs apparaissent quand tu traverses une frontière de chunk. Pas de random ticks, pas de spawn géré par un système complexe. Tu passes d'un chunk à l'autre, paf, un mob a une chance de spawner.

## Ce qui a été sacrifié

Pour que tout ça tienne, y'a des features vanilla qui existent pas. Et c'est pas de la flemme, c'est des choix conscients.

Y'a **pas de compression réseau**. Le protocole Minecraft utilise zlib pour compresser les gros packets. Mais faire de la compression sur une ESP32, c'est trop cher en CPU. Résultat : le serveur peut générer des chunks rapidement, mais le réseau devient le goulot d'étranglement.

Y'a **pas de random ticks**. Les arbres poussent pas tout seuls. Tu veux un arbre ? Tu utilises de la bone meal depuis un composteur, ou rien.

Y'a **pas d'entités item**. Quand tu mines un bloc, le loot va directement dans ton inventaire. Y'a même une animation visuelle pour faire genre, mais le serveur vérifie même pas la distance. Dans les faits, les items arrivent toujours à destination.

Y'a **aucune vérification d'inventaire**. Le serveur fait confiance au client. Si ton client dit que t'as 64 diamants dans ta poche, le serveur dit "OK". Pas de calcul pour vérifier, trop cher.

Y'a **pas de lumière calculée par le serveur**. Les torches sont envoyées après tous les autres blocs, ce qui force le client à calculer la lumière tout seul.

Y'a **pas de fluides progressifs**. L'eau et la lave atteignent leur état final instantanément, pas de files de block updates à gérer.

## Le résultat final

Sur un PC de bureau avec un Ryzen 5 3600, Bareiron génère un chunk en environ 0.5 milliseconde.

Sur une ESP32-C3 que tu trouves à moins d'un dollar sur Aliexpress, c'est plutôt 200 millisecondes par chunk. Et c'est jouable.

Avec plus de 3 joueurs connectés, ça commence à ramer un peu. Mais l'auteur compare ça à 2b2t aux heures de pointe, et franchement, c'est un compliment.

Bien sûr, c'est pas un serveur à mettre entre les mains de gens que tu connais pas. Sans vérification d'inventaire, n'importe qui peut se donner des stacks de diamants. Et sans compression réseau, si t'as une connexion pourrie, c'est injouable.

Mais le fait que ça marche, déjà, c'est un exploit.

## La philosophie du projet

Ce qui rend Bareiron fascinant à étudier, c'est que chaque ligne de code est un tradeoff conscient. Rien n'est là par hasard.

Le Perlin noise a été remplacé par de la bilinear interpolation : le rendu est moins joli, mais 200 fois plus rapide et ça prend zéro mémoire. Les matrices de craft ont été remplacées par du matching hardcodé : le code est moche, mais il consomme pas un byte en trop. La compression zlib a été supprimée : les gens avec une mauvaise connexion peuvent pas jouer, mais le serveur peut tourner sur une puce à 160 MHz. La validation d'inventaire a été désactivée : la sécurité est inexistante, mais il n'y a aucun overhead de calcul.

Chaque feature manquante est le prix à payer pour qu'une autre fonctionnalité existe dans les limites du hardware.

C'est pas "un serveur Minecraft en C". C'est "un serveur Minecraft qui tient sur un microcontrôleur à 1 dollar parce que les bons sacrifices ont été faits".

**Les 3 trucs à retenir :**

1. **Interpolation + RNG plutôt que Perlin noise** -- 4 points seedés, interpolés entre eux, et t'as un terrain infini qui prend zéro mémoire et se génère en 200 ms. C'est le move de génie qui rend tout le reste possible.
2. **Chaque feature a un coût, rien n'est gratuit** -- Pas de compression, pas de random ticks, pas de validation d'inventaire. Ces absences sont pas des oublis, c'est ce qui permet au reste de tenir dans 520 KB de SRAM.
3. **Les solutions les plus dégueulasses sont parfois les plus intelligentes** -- Les coffres stockés dans le tableau des blocs, la faim trackée par les packets de mouvement, le fourneau qui cuit instantanément. La solution "propre" et "maintenable" aurait été trop chère, alors p2r3 a fait ce qui marche dans les contraintes.

Si le projet t'intéresse, tout est sur [GitHub en GPLv3](https://github.com/p2r3/bareiron/). C'est du C bien sale, c'est un boulot d'orfèvre, et j'ai rarement pris autant de plaisir à lire un code source xD
