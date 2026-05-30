---
title: Bareiron -- le serveur Minecraft qui tourne sur un microcontrôleur à 1$
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

Y'a une puce à 1$ qui fait tourner un serveur Minecraft.

Génération infinie, biomes, grottes, craft, mine, mobs, faim, coffres. Sur un microcontrôleur à **160 MHz** qui consomme **0.5 Watt**.

C'est [Bareiron](https://github.com/p2r3/bareiron/), par p2r3.

J'vais pas te mentir : c'est un des projets les plus wtf que j'aie vus. Pas parce que "haha serveur en C". Mais parce que **chaque ligne** est un tradeoff conscient pour faire tenir l'impossible dans 520 KB de SRAM.

## Le problème de ouf

Serveur Notchian : gigas de RAM, Perlin noise, 6 paramètres biomiques, zlib, millions de chunks en mémoire.

ESP32-C3 : **520 KB de SRAM**, **160 MHz**, **0.5 Watt**.

Facteur ~20 000.

p2r3 a pas optimisé. Il a **tout réinventé**.

## La génération de terrain

Perlin noise c'est cher. Plusieurs octaves, ça douille en CPU.

Lui il fait de la **bilinear interpolation** avec un RNG seedé par les coordonnées.

```c
hauteur = interpoler_bilineaire(
  RNG(chunk_x,     chunk_z),
  RNG(chunk_x + 1, chunk_z),
  RNG(chunk_x,     chunk_z + 1),
  RNG(chunk_x + 1, chunk_z + 1),
  offset_x, offset_z
);
```

Chunks adjacents = 2 coins en commun. Interpolation continue. Pas de fissures.

En ajustant le nombre de bits du RNG tu rends le terrain plus ou moins accidenté.

Et tout ça **sans stocker un seul chunk**.

Tu vois le truc ?

### Grottes : le mirror de la mort

```c
altitude_grotte = CAVE_BASE_DEPTH - (hauteur_surface - y);
```

Il mirror la surface sous terre. Ça ressemble aux grandes cavités deepslate. Simple, efficace, 0 compute.

### Minerais : un XOR

Pas de veines. Un XOR des coordonnées. Un candidat par colonne. Point.

```c
candidat = (chunk_x ^ colonne_x ^ colonne_z) % 100;
if (candidat < 5 && y < 16) -> diamond
```

### Biomes : des îles dans une grille

Une tile map. Chaque biome est une île circulaire. Le type vient d'un pattern répété depuis la seed.

Gridé ? Oui. Prévisible ? Oui. **Gratuit ? Oui.**

Chaque biome tweake les paramètres de génération :
- **Plains** : 4 facteurs, plat
- **Desert** : max 6 blocs de variation
- **Snowy plains** : 2 facteurs, 14 blocs de variation

Arbres, cactus, buissons : seedés par les mêmes coins RNG. Overhead = 0.

## Le craft : code immonde, zéro mémoire

La solution propre c'est des matrices 3x3 + kernel-fitting. Belle. Maintenable. **Chère en mémoire.**

Lui il count les slots, note le premier item, check si les autres sont identiques. 4 ops pour matcher un fourneau :

```c
if (count == 8 && first == cobblestone && all_identical && center_empty)
    return furnace;
```

Pour les formes : index du premier + position relative.

Le code est dégueu. Zéro mémoire. Rapide.

## Le fourneau

Vanilla : timer, stockage, fuel.

Bareiron : tu mets, tu prends. Instantané.

Moins réaliste. Beaucoup plus efficace.

## Les coffres : le hack le plus dégueu que t'aies vu

Quand les testeurs ont demandé les coffres, fallait stocker 27 slots. Problème.

Le tableau des changements de blocs c'est des entrées de 6 bytes :
- 2 bytes X
- 1 byte Y
- 2 bytes Z
- 1 byte block ID

Les items c'est : 16 bits ID + 8 bits stack size.

**Par pure coïncidence**, chaque entrée de bloc peut stocker 2 items.

Chaque coffre prend 15 entrées. Quand tu l'ouvres, le serveur **memcpy** la zone dans le buffer de craft du joueur (recyclé, vu que tu craftes pas avec un coffre ouvert). Un flag `0x80` bloque le craft.

Le code dit :

```c
// Terrible memory hack!!1!
```

xD

## La faim gratuite

Quand tu bouges, le client envoie des packets à 20/sec. Quand tu bouges pas : 1.

Le serveur les traite déjà. Donc c'est un compteur gratuit.

```c
// Packet reçu → compteur--
// Compteur à 0 → faim baisse
// Manger → compteur++
```

Zéro timer, zéro stockage, zéro compute en plus.

## Les mobs en 8 bytes

- 1 byte type
- 2 bytes X
- 1 byte Y
- 2 bytes Z
- 1 byte data

Passifs : 8 directions au hasard.
Hostiles : marche vers le joueur.
Pas de pathfinding, pas d'évitement d'obstacles.

Zombie à 2 blocs : 3 coeurs/sec (compense l'IA débile).
Spawn : aux frontières de chunk.

Rien d'autre.

## Ce qui a sauté

- **Pas de compression** : zlib trop cher. Générer des chunks c'est rapide, les envoyer c'est le bottleneck.
- **Pas de random ticks** : arbres à la bone meal ou rien.
- **Pas d'entités item** : les blocs vont direct dans l'inventaire.
- **Pas de vérification inventaire** : client dit 64 diamants → 64 diamants. Trust the client.
- **Pas de lumière serveur** : torches envoyées après, client calcule.
- **Pas de fluides progressifs** : état final instantané.

**Avec 3 potes sur une ESP32 à 1€ c'est jouable.** Ça lag un peu, mais ça marche.

## La philosophie

Perlin → bilinear interpolation : moins joli, 200x plus rapide.
Matrices → pattern hardcodé : dégueu, zéro mémoire.
zlib → rien : connexion pourrie = mort, mais jouable.
Validation → trust : zéro sécurité, zéro overhead.

**Les 3 trucs à retenir :**

1. **Bilinear interpolation + RNG** -- 4 points seedés, terrain infini, zéro stockage.
2. **Tout coûte, tout se paye** -- Les features qui sautent permettent à celles qui restent de tenir dans 520 KB.
3. **Les hacks dégueus sont les plus intelligents** -- Coffres dans le buffer de craft, faim par packets, fourneau instantané.

Le [repo](https://github.com/p2r3/bareiron/) est en GPLv3. Vas-y jeter un oeil. C'est du gros C bien sale et j'adore xD
