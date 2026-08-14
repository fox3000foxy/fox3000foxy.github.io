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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "nSZBrYK7L3gXoKayATInHxt4Tbw16yL8INlNpYrGGVaPUnFe5T2evampFtoRMFGmmU2717m6m4dlLNf9Xz+24Q=="
---

## Introduction

Tu t'es déjà demandé si on pouvait faire tourner un serveur Minecraft sur un microcontrôleur à 1 balles ?

Moi oui. Et la réponse c'est oui. Littéralement.

Y'a un projet qui s'appelle [Bareiron](https://github.com/p2r3/bareiron/), signé p2r3, et c'est probablement l'un des projets les plus fascinants que j'aie vus dans le monde Minecraft ces dernières années. On parle d'un binaire qui tient dans **300 kilooctets**, **6800 lignes de C**, zéro dépendance externe, pas de malloc, pas de threading, et ça tourne sur une **ESP32 à 1 dollar**.

![ESP32-C3, le microcontrôleur qui fait tourner le serveur](/images/bareiron/esp32-board.jpg)

Génération de terrain infinie. Des biomes. Des grottes. Du craft. De la mine. Des mobs. De la faim. Des coffres. Tout ce que t'attends d'un serveur survival.

Sur une puce qui consomme **0.5 Watt** et qui a **160 MHz** de clock.

Pour donner un ordre d'idée : un serveur Minecraft vanilla a besoin de plusieurs gigas de RAM. L'ESP32-C3, c'est **520 KB de SRAM** (400 dispo après le boot). Les processeurs y'a 20 ans tournaient déjà en gigahertz -- celui-ci plafonne à 160 MHz. Le facteur entre les deux en puissance pure, c'est environ **20 000**.

p2r3 a pas écrit un serveur Minecraft en C, il a réinventé chaque brique du serveur pour que ça tienne dans ces contraintes. On va regarder comment, en ouvrant le code source.

![Miniature de la vidéo de présentation de Bareiron par p2r3](/images/bareiron/title-card.jpg)

## Le cerveau du projet : une génération de terrain sans mémoire

Le plus gros problème quand tu veux faire un serveur MC embarqué, c'est la génération de terrain.

Dans Minecraft vanilla, le monde est généré avec du **Perlin noise** : plusieurs couches superposées (des octaves), 6 paramètres biomiques (température, humidité, continentalité, érosion, weirdness, profondeur), et tout un système de caching pour pas avoir à tout recalculer à chaque fois.

Le résultat est magnifique. Mais c'est cher en calcul, et ça prend de la RAM pour stocker les chunks générés.

L'approche de Bareiron est radicalement différente. Au lieu d'empiler du bruit, il utilise de la **bilinear interpolation** sur 4 points générés par un **RNG déterministe**.

Tu sais quand tu agrandis une petite image pixelisée et que les bords deviennent flous ? C'est exactement ça.

```c
// worldgen.c, lignes 117-171 (simplifié)

uint8_t interpolate (uint8_t a, uint8_t b, uint8_t c, uint8_t d, int x, int z) {
  uint16_t top    = a * (CHUNK_SIZE - x) + b * x;
  uint16_t bottom = c * (CHUNK_SIZE - x) + d * x;
  return (top * (CHUNK_SIZE - z) + bottom * z) / (CHUNK_SIZE * CHUNK_SIZE);
}

uint8_t getHeightAt (int x, int z) {
  int _x = floor(x / CHUNK_SIZE);  // chunk coordinates
  int _z = floor(z / CHUNK_SIZE);
  int rx = x % CHUNK_SIZE;          // offset inside chunk
  int rz = z % CHUNK_SIZE;
  uint32_t hash = getChunkHash(_x, _z);
  uint8_t biome = getChunkBiome(_x, _z);
  // interpolation between 4 corners seeded by hash + biome
  return getHeightAtFromHash(rx, rz, _x, _z, hash, biome);
}
```

L'interpolation bilinéaire standard : 4 coins, des poids selon la position, un seul `uint8_t` en sortie. CHUNK_SIZE est 8, donc ça se fait en multiplications entières, pas de float.

p2r3 le montre étape par étape dans la vidéo : d'abord les 4 coins du chunk, chacun avec une hauteur seedée par le RNG.

![Les 4 coins du chunk, chacun seedé par le RNG déterministe](/images/bareiron/gen-four-corners.jpg)

Puis l'interpolation entre ces 4 points crée une surface continue.

![Application de la bilinear interpolation entre les 4 coins](/images/bareiron/gen-interpolate.jpg)

Et en répétant le pattern sur tous les chunks adjacents, on obtient un terrain qui s'étend à l'infini.

![Résultat final : terrain irrégulier continu](/images/bareiron/gen-result.jpg)

### Le RNG déterministe

La clé qui rend tout ça possible, c'est le seeding. Chaque chunk a 4 coins, et chaque coin a besoin d'une valeur pseudo-aléatoire unique mais reproductible.

```c
// worldgen.c, lignes 13-22

uint32_t getChunkHash (short x, short z) {
  uint8_t buf[8];
  memcpy(buf, &x, 2);          // 16 bits de coordonnée X
  memcpy(buf + 2, &z, 2);      // 16 bits de coordonnée Z
  memcpy(buf + 4, &world_seed, 4);  // 32 bits de seed globale
  return splitmix64(*((uint64_t *)buf));  // hash
}
```

Il packe les 16 bits de X, 16 bits de Z, et 32 bits de seed, dans un buffer de 8 bytes, et il passe le tout dans `splitmix64`. Résultat : une valeur déterministe unique pour chaque position, basée sur la seed du monde.

Tu captes la puissance du truc ? Le serveur n'a pas besoin de stocker le terrain. Il recalcule à la volée quand le joueur arrive dans une nouvelle zone, et ça donne exactement le même résultat à chaque fois.

Le `splitmix64` utilisé est un prng ultra-rapide conçu pour les hash 64 bits :

```c
// worldgen.c (simplifié)

static uint32_t splitmix64 (uint64_t state) {
  state += 0x9E3779B97F4A7C15ull;
  uint64_t z = state;
  z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ull;
  z = (z ^ (z >> 27)) * 0x94D049BB133111EBull;
  return (z ^ (z >> 31)) >> 32;
}
```

3 opérations : addition, xor/shift, multiplication, xor/shift, multiplication, xor/shift. Pas de lookup table, pas de boucle. Il prend le buffer de 8 bytes (X + Z + seed), le traite comme un entier 64 bits, et renvoie 32 bits de hash. C'est déterministe, rapide, et tient en 5 lignes.

### Pourquoi c'est pas du Perlin noise

p2r3 le dit lui-même dans la vidéo : "plus tu ajoutes de digits du nombre aléatoire, plus le terrain devient régulier, comme plus de lancers de pièces te rapprochent de 50/50". En pratique, c'est le nombre de bits du hash qu'il combine :

```c
// worldgen.c, lignes 51-115

// Pour un biome plains : 4 facteurs combinés → terrain régulier
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// Pour snowy plains : 2 facteurs → plus accidenté
h = (hash % 5) + ((hash >> 4) % 5);
```

Chaque biome choisit combien de extractions de bits il combine. Plus y en a, plus la distribution se stabilise -- comme plus de lancers de pièces qui approchent 50/50. Moins y en a, plus les variations locales sont fortes.

![Terrain irrégulier -- peu de facteurs, variations fortes](/images/bareiron/terrain-irregular.jpg)

Avec seulement 2 facteurs, le snowy plains produit un terrain vallonné, presque montagneux. Les pics et les creux sont fréquents.

![Terrain régulier -- facteurs multiples, surface lisse](/images/bareiron/terrain-regular.jpg)

Avec 4 facteurs, les plaines restent plates et prévisibles. La distribution se stabilise.

Un chunk se génère en **200 ms** sur ESP32 -- contre un temps non mesurable sur le même hardware avec Perlin noise tellement c'est cher.

### Le détail qui tue : interroger un bloc sans générer tout le chunk

Tu joues, tu mines un bloc. Le serveur doit savoir quel item te donner. Naïvement, il faudrait générer tout le chunk pour ça.

Avec la bilinear interpolation, tu interroges **n'importe quel point** du plan directement depuis les coordonnées. Les coins du chunk s'obtiennent depuis la position du joueur, l'interpolation te donne la hauteur à n'importe quel offset. Une poignée d'opérations mathématiques, pas de génération de chunk.

p2r3 : "ce que je veux, c'est une fonction magique qui peut me dire quel bloc se trouve à une coordonnée donnée, sans accéder à la mémoire ni calculer des cartes de bruit chères". Exactement ce qu'il a fait.

Voici comment la hauteur devient des blocs concrets :

```c
// worldgen.c (simplifié)

uint8_t getTerrainBlock (int x, uint8_t y, int z) {
  uint8_t surface = getHeightAt(x, z);

  if (y > surface)             return B_air;
  if (y == surface)            return biome_top[getChunkBiome(x, z)];
  if (y > surface - 4)         return B_dirt;
  if (y > surface - 16)        return B_stone;
  if (y > CAVE_BASE_DEPTH)     return B_deepslate;
                               return B_bedrock;
}
```

5 conditions. Une couche de grass/dirt/stone/deepslate/bedrock. Le bloc de surface dépend du biome via `biome_top[]` -- grass pour les plaines, sand pour le désert. Pas de boucle, pas de switch, une cascade de if qui tombe dans la bonne couche.

### Les grottes, mirror le plus paresseux

```c
altitude_grotte = CAVE_BASE_DEPTH - (hauteur_surface - y);
```

Il mirror la hauteur de la surface sous terre. Ça ressemble aux grandes cavités deepslate. Zéro compute, une ligne.

![Caves générées par mirror du terrain de surface](/images/bareiron/cave-mirror.jpg)

![Schéma du mirror de terrain pour générer les grottes](/images/bareiron/cave-diagram.jpg)

### Les minerais, version XOR

```c
candidat = (chunk_x ^ col_x ^ col_z) % 100;
if (candidat < 5 && y < 16) -> diamond
```

Un XOR de coordonnées garantit un candidat par colonne. Le type dépend juste de l'altitude. Les diamants sont planqués sous le point le plus bas des grottes pour que creuser reste utile.

### Les biomes en tile map

Chaque biome est une île circulaire dans une grille, son type déterminé par un pattern calculé depuis la seed. Gridé, prévisible, et gratuit.

![Carte des biomes en tile map -- chaque île est un biome différent](/images/bareiron/biome-tilemap.jpg)

Chaque biome a son propre jeu de paramètres encodé dans des tableaux :

```c
// worldgen.c (simplifié)

static const uint8_t biome_base[] = {
  [BIOME_PLAINS]  = 48,   // hauteur de base : 48
  [BIOME_DESERT]  = 52,   // légèrement plus haut
  [BIOME_FOREST]  = 50,   // entre les deux
  [BIOME_TAIGA]   = 46,   // un peu plus bas
  [BIOME_SNOWY]   = 40,   // le plus bas
};

static const uint8_t biome_top[] = {
  [BIOME_PLAINS]  = B_grass,
  [BIOME_DESERT]  = B_sand,
  [BIOME_FOREST]  = B_grass,
  [BIOME_TAIGA]   = B_grass,
  [BIOME_SNOWY]   = B_snow_block,
};

static const uint8_t biome_factors[] = {
  [BIOME_PLAINS]  = 4,   // 4 extractions → très régulier
  [BIOME_DESERT]  = 3,   // 3 extractions → modéré
  [BIOME_FOREST]  = 4,   // 4 extractions → régulier, vallonné
  [BIOME_TAIGA]   = 3,   // 3 extractions → modéré
  [BIOME_SNOWY]   = 2,   // 2 extractions → très accidenté
};
```

**Plains** : hauteur 48, 4 facteurs → terrain très plat, herbe.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// Résultat : variation de ±4 blocs max
```

**Desert** : hauteur 52, 3 facteurs, bloc surface = sable. Jamais sous le niveau de la mer.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3);
// Résultat : variation de ±6 blocs max, clampé à SEA_LEVEL+1
```

**Forest** : hauteur 50, 4 facteurs comme plains mais base plus haute → collines boisées.

**Taiga** : hauteur 46, 3 facteurs → variations modérées, terrain froid.

**Snowy plains** : hauteur 40, seulement 2 facteurs → le plus accidenté.

```c
h = (hash % 5) + ((hash >> 4) % 5);
// Résultat : variation de ±14 blocs max
```

Chaque biome est encodé en **3 tableaux de 5 entrées** : hauteur de base, bloc de surface, nombre de facteurs. Quand `getHeightAtFromHash` reçoit le biome, elle consulte ces tableaux pour ajuster le terrain. 15 bytes de données pour remplacer tout le système de biomes de Minecraft.

Le détecteur de biome utilise la seed pour déterminer quel biome correspond à chaque chunk :

```c
// worldgen.c (simplifié)

static const uint8_t biome_pattern[] = {
  BIOME_PLAINS, BIOME_FOREST, BIOME_PLAINS, BIOME_DESERT,
  BIOME_FOREST, BIOME_TAIGA,  BIOME_PLAINS, BIOME_SNOWY,
  BIOME_PLAINS, BIOME_FOREST, BIOME_DESERT,  BIOME_PLAINS,
  BIOME_SNOWY,  BIOME_PLAINS, BIOME_FOREST, BIOME_TAIGA,
};

uint8_t getChunkBiome (short cx, short cz) {
  uint32_t h = splitmix64(cx * 31 + cz * 97 + world_seed);
  uint8_t index = h % 16;
  return biome_pattern[index];
}
```

Un pattern de 16 entrées, un index seedé par les coordonnées du chunk. Ça donne une grille répétitive mais visuellement cohérente. 4 lignes de code pour remplacer tout le système de paramètres biomiques de Minecraft vanilla.

### getHeightAtFromHash : l'assembleur de terrain

La fonction au cœur de la génération combine les 4 coins seedés par biome :

```c
// worldgen.c (simplifié)

static uint8_t getHeightAtFromHash (int rx, int rz, short cx, short cz,
                                    uint32_t h, uint8_t biome) {
  // 4 coins extraits du hash, seed différente par coin
  uint8_t h1 = biome_base[biome] + (h & 0x0F);
  uint8_t h2 = biome_base[biome] + ((h >> 4) & 0x0F);
  uint8_t h3 = biome_base[biome] + ((h >> 8) & 0x0F);
  uint8_t h4 = biome_base[biome] + ((h >> 12) & 0x0F);

  // Contrainte biome : désert jamais sous l'eau
  if (biome == BIOME_DESERT) {
    h1 = max(h1, SEA_LEVEL + 1);
    h2 = max(h2, SEA_LEVEL + 1);
    h3 = max(h3, SEA_LEVEL + 1);
    h4 = max(h4, SEA_LEVEL + 1);
  }

  // Interpolation depuis les 4 coins
  return interpolate(h1, h2, h3, h4, rx, rz);
}
```

Chaque biome a une `biome_base` qui décale la hauteur de référence, et les 4 coins sont extraits du hash avec des décalages différents. Le désert force le min au-dessus du niveau de la mer -- une ligne de contrainte qui évite l'eau sans calcul biomique supplémentaire.

### Arbres et cactus : placement probabiliste

La génération de surface utilise le même hash de chunk pour décider où planter :

```c
// worldgen.c (simplifié)

static void genFoliage (uint8_t *chunk_data, short cx, short cz,
                        uint32_t hash, uint8_t biome) {
  if (biome == BIOME_DESERT) {
    // Cactus : un candidat par chunk, hash détermine la position
    int tx = (hash >> 8) & 7;
    int tz = (hash >> 12) & 7;
    int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
    if (chunk_data[ty * 64 + tz * 8 + tx] == B_sand)
      placeCactus(chunk_data, tx, ty + 1, tz);
  } else {
    // Arbres : hash détermine si on en pose et où
    int tree_count = (hash & 3);  // 0-3 arbres par chunk
    for (int i = 0; i < tree_count; i ++) {
      int tx = ((hash >> (4 + i * 4)) & 7);
      int tz = ((hash >> (6 + i * 4)) & 7);
      int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
      placeTree(chunk_data, tx, ty + 1, tz);
    }
  }
}
```

0-3 arbres par chunk pour les biomes verts, 1 cactus maximum pour le désert. Le hash du chunk est la seule source d'entropie -- un `& 7` pour la position dans le chunk, un `& 3` pour le compteur. Tout est déterministe, rien n'est stocké.

### generateChunk : tout assembler

La fonction qui met tout ensemble pour produire un chunk complet de 8×8×256 blocs :

```c
// worldgen.c (simplifié)

void generateChunk (uint8_t *chunk, short cx, short cz) {
  uint32_t hash = getChunkHash(cx, cz);
  uint8_t biome = getChunkBiome(cx, cz);

  // Pour chaque colonne du chunk (8×8 = 64)
  for (int x = 0; x < 8; x ++) {
    for (int z = 0; z < 8; z ++) {
      // Coordonnées monde absolues
      int wx = cx * 8 + x;
      int wz = cz * 8 + z;

      // Hauteur de la colonne
      uint8_t height = getHeightAt(wx, wz);

      // Remplir la colonne de bas en haut
      for (int y = 0; y < height; y ++) {
        uint8_t block = getTerrainBlock(wx, y, wz);
        chunk[y * 64 + z * 8 + x] = block;
      }
    }
  }

  // Ajouter les éléments de surface (arbres, cactus)
  genFoliage(chunk, cx, cz, hash, biome);
}
```

C'est tout. 3 boucles imbriquées : pour chaque colonne, trouver la hauteur, remplir les blocs, passer à la suivante. La sortie est un `uint8_t[16384]` (8 × 8 × 256) qui représente le chunk complet. Pas de caching, pas de lazy loading, pas de compression -- le chunk est généré et envoyé direct au client.

## Le stockage : des arrays statiques partout

L'architecture mémoire de Bareiron, c'est du C embarqué dans toute sa splendeur. Pas de malloc, pas de hash maps, pas de listes chaînées.

Tout est dans des tableaux globaux de taille fixe.

### Les changements de blocs

```c
// globals.h, lignes 191-196

typedef struct {
  short x;      // 2 bytes -- limite à 32 000 blocs horizontal
  short z;      // 2 bytes
  uint8_t y;    // 1 byte -- limite à 256 blocs vertical
  uint8_t block; // 1 byte -- limite à 256 types de blocs
} BlockChange;
```

20 000 entrées, soit environ **25 000 changements** -- l'équivalent d'un chunk et demi entièrement déterré. Le champ `block` à `0xFF` marque une entrée libre. La recherche est une scan linéaire :

![Layout mémoire du tableau de blocs -- 6 bytes par entrée](/images/bareiron/memory-layout.jpg)

```c
// procedures.c

uint8_t getBlockChange (short x, uint8_t y, short z) {
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block == 0xFF) continue;
    if (block_changes[i].x == x && block_changes[i].y == y && block_changes[i].z == z)
      return block_changes[i].block;
    #ifdef ALLOW_CHESTS
      if (block_changes[i].block == B_chest) i += 14;  // skip chest data
    #endif
  }
  return 0xFF;
}

Ajouter un changement est aussi direct que la recherche :

```c
static uint8_t changes_count = 0;

void addBlockChange (short x, short z, uint8_t y, uint8_t block) {
  if (changes_count >= MAX_CHANGES) return;
  block_changes[changes_count].x = x;
  block_changes[changes_count].z = z;
  block_changes[changes_count].y = y;
  block_changes[changes_count].block = block;
  changes_count ++;
}
```

Un compteur, un index, une écriture. Pas de tri, pas de compaction, pas de gestion mémoire. Quand le tableau est plein, les nouveaux changements sont ignorés -- le terrain revient à son état généré.

Le commentaire de l'auteur sur la limite à 256 blocs : "je compte pas implémenter les escaliers en cuivre légèrement patinés cirés de si tôt."

### Les mobs : 8 bytes par tête de pipe

```c
// globals.h, lignes 240-251 (pragma pack(push, 1) pour éliminer le padding)

typedef struct {
  uint8_t type;   // 25=chicken, 28=cow, 95=pig, 106=sheep, 145=zombie
  short x;
  uint8_t y;      // si health=0, Y devient un timer avant suppression
  short z;
  uint8_t data;   // bits 0-4: health, bit 5: sheep sheared, bits 6-7: panic timer
} MobData;
```

8 bytes. 16 emplacements max. Pas d'alignement, pas de padding. Le `data` byte est un bitfield maison : 5 bits de vie, 1 bit de tonte, 2 bits de timer de panique. Et quand un mob meurt, le champ Y devient un timer avant suppression. Réutilisation de mémoire au niveau du bit.

### Les joueurs : packés serré

Les données joueurs utilisent `#pragma pack(push, 1)` aussi -- coordonnées en `short` + `uint8_t`, inventaires en tableaux fixes de `uint16_t` + `uint8_t`, et un champ `flags` qui encode à la fois le cooldown d'attaque, l'état de spawn, sneak, sprint, eat, load, movement cooldown, et le lock de craft. Tout ça dans des bits individuels.

## La boucle principale : while(true) et du non-bloquant

Le serveur entier tourne sur une boucle, un thread, zéro event library.

```c
// main.c, lignes 594-720

while (true) {
  task_yield();  // laisse respirer le watchdog sur ESP32

  // Accepter une nouvelle connexion (non-bloquant)
  for (int i = 0; i < MAX_PLAYERS; i ++) {
    if (clients[i] != -1) continue;
    clients[i] = accept(server_fd, ...);
    if (clients[i] != -1) client_count ++;
    break;
  }

  // Tick serveur si le temps est écoulé
  if (get_program_time() - last_tick_time > TIME_BETWEEN_TICKS) {
    handleServerTick(time_since_last_tick);
    last_tick_time = get_program_time();
  }

  // Round-robin : un client, un packet par itération
  client_index = (client_index + 1) % MAX_PLAYERS;
  if (clients[client_index] == -1) continue;

  // Lire l'entête du packet : length + ID
  recv(client_fd, &recv_buffer, 2, MSG_PEEK);
  int length = readVarInt(client_fd);
  int packet_id = readVarInt(client_fd);
  handlePacket(client_fd, length - sizeVarInt(packet_id), packet_id, state);
}
```

Un seul client est traité par itération de la boucle, et un seul packet est lu à la fois. Le `task_yield()` au début de la boucle laisse le FreeRTOS idle task respirer sur ESP32 -- sans ça, le watchdog timer te reset la puce.

Le dispatch des packets, c'est un switch monstrueux de **400 lignes** :

```c
// main.c, lignes 68-497

void handlePacket (int client_fd, int length, int packet_id, int state) {
  switch (packet_id) {
    case 0x00:  // Handshake / Status / Login selon l'état
    case 0x01:  // Status ping
    case 0x02:  // Plugin message
    case 0x03:  // Login/configuration acknowledgment
    case 0x08:  // Chat
    case 0x0B:  // Client status (respawn)
    case 0x11:  // Click container (gère les coffres)
    case 0x19:  // Interact entity
    case 0x1D..0x20:  // Movement packets (le plus gros cas)
    case 0x28:  // Player action (dig/place)
    // ... 40+ cas
  }
}
```

Pas de jump table dynamique, pas de vtable, pas de map. Un switch compile en jump table statique. Parfait pour de l'embarqué.

Le cas `0x1D-0x20` est le plus gros -- il gère les mises à jour de position, les dégâts de chute, les traversées de frontières de chunk, le spawn de mobs, la génération de chunks, ET la faim. Tout en un seul gros fall-through.

![Le code du serveur Bareiron -- 6800 lignes de C](/images/bareiron/code-shot.jpg)

## Le serveur tick et l'IA des mobs

La fonction `handleServerTick` est appelée toutes les 50 ms (20 TPS). Elle gère le monde pendant que la boucle principale s'occupe des joueurs :

```c
// main.c (simplifié)

void handleServerTick (uint32_t delta) {
  // Mettre à jour chaque mob
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type == 0 || mobs[i].data == 0) continue;  // mort ou vide

    MobData *mob = &mobs[i];
    int px, pz;
    getNearestPlayer(mob->x, mob->z, &px, &pz);

    if (mob->type == MOB_ZOMBIE) {
      // Hostile : marche vers le joueur le plus proche
      if (px < mob->x) mob->x --;
      else if (px > mob->x) mob->x ++;
      if (pz < mob->z) mob->z --;
      else if (pz > mob->z) mob->z ++;
      // Dégâts de contact à 2 blocs
      if (abs(px - mob->x) <= 2 && abs(pz - mob->z) <= 2)
        damagePlayer(getNearestPlayerId(mob->x, mob->z), 3);
    } else {
      // Passif : 8 directions aléatoires
      uint8_t dir = getMobDir(mob);
      mob->x += dir_lookup[dir][0];
      mob->z += dir_lookup[dir][1];
      // Changement de direction toutes les ~40 ticks
      if (mob->data >> 6 < 1) setMobDir(mob, rand() & 7);
      mob->data = (mob->data & 0x3F) | ((mob->data - 0x40) & 0xC0);
    }

    // Réveiller les chunks autour du mob
    setChunkGenerated(mob->x / 8, mob->z / 8);
  }
}
```

L'IA des mobs hostiles, c'est une comparaison de coordonnées. Littéralement `if (px < x) x--`. Pas de pathfinding, pas de A*, pas d'obstacle avoidance. Le zombie ajuste X et Z indépendamment vers le joueur -- il traverse les murs si y'en a.

Les dégâts de contact sont à 3 coeurs/sec. p2r3 l'a voulu élevé parce que l'absence de pathfinding rend les zombies faciles à kiter.

La formule d'armure est celle d'avant le combat update -- la plus simple possible :

```c
// main.c (simplifié)

static uint8_t applyArmor (uint8_t damage, uint16_t armor_value) {
  // Formule pré-1.9 : réduction linéaire
  // Chaque point d'armure = 4% de réduction, max 80%
  uint8_t reduction = (armor_value * 4);
  if (reduction > 80) reduction = 80;
  return damage * (100 - reduction) / 100;
}
```

Full diamond = 80% de réduction. Un coup de zombie à 3 coeurs devient 0.6 coeurs. p2r3 a choisi cette vielle formule parce qu'elle se calcule en 2 opérations -- pas de seuils, pas de courbes, juste un pourcentage linéaire.

Les mobs passifs : 8 directions dans une lookup table, changement de cap toutes les ~40 ticks. Le champ `data` encode la direction en cours dans les 2 bits de poids fort, et le timer de changement de direction dans les 6 bits restants.

![Mobs dans Bareiron -- zombies, cochons, moutons](/images/bareiron/mobs.jpg)

### Le respawn des mobs

Les mobs ne spawnent pas avec des random ticks. Ils apparaissent quand le serveur tick rencontre une nouvelle frontière de chunk :

```c
if (player crossed chunk boundary) {
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type != 0) continue;
    spawnMob(&mobs[i], new_chunk_coords, getChunkHash(cx, cz));
    break;
  }
}
```

Même RNG que le terrain, même seed de chunk. Si un emplacement mob est libre, le spawn est déterministe.

## Le craft : pas de matrices, du if/else

```c
// crafting.c, lignes 9-347 (simplifié)

void getCraftingOutput (PlayerData *player, uint8_t *count, uint16_t *item) {
  // Si le flag 0x80 est levé, le buffer de craft est utilisé par un coffre
  if (player->flags & 0x80) { *count = 0; *item = 0; return; }

  // Compter les slots, trouver le premier item, vérifier l'identité
  uint8_t filled = 0, first = 10, identical = true;
  for (int i = 0; i < 9; i ++) {
    if (player->craft_items[i]) {
      filled ++;
      if (first == 10) first = i;
      else if (player->craft_items[i] != player->craft_items[first])
        identical = false;
    }
  }

  switch (filled) {
    case 1:  /* planches, lingots... */
    case 2:  /* bâtons, cisailles, torches */
    case 3:  /* pelles, épées, dalles */
    case 4:  /* table de craft, boots */
    case 5:  /* pioches, haches, casques */
    case 7:  /* jambières, composteurs */
    case 8:  /* fourneau, coffre, plastron */
    case 9:  /* blocs complets (fer, or, etc.) */
  }
}
```

Le premier check : si le flag `0x80` est levé, le buffer de craft est recyclé en pointeur de coffre. Pas de craft possible.

Ensuite, il compte les slots remplis, note le premier item, vérifie l'identité. Avec juste ça, tu mathes le fourneau en 4 checks :

```c
if (count == 8 && first == cobblestone && all_identical && center_empty)
    return furnace;
```

Pour les formes complexes, il utilise l'index du premier item et check la position relative. Les recettes partagent une même fonction de matching -- le matériau détermine le résultat.

![Interface de craft et coffre dans Bareiron](/images/bareiron/crafting.jpg)

## Les coffres : le hack en vrai

Le hack mémoire dont tout le monde parle, en vrai code :

```c
// procedures.c, lignes 1262-1293

if (target == B_chest) {
  // Chercher l'entrée du coffre dans le tableau des blocs
  uint8_t *storage_ptr = NULL;
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block != B_chest) continue;
    if (block_changes[i].x != x || block_changes[i].y != y || block_changes[i].z != z)
      continue;
    storage_ptr = (uint8_t *)(&block_changes[i + 1]);  // pointe après le bloc coffre
    break;
  }
  if (storage_ptr == NULL) return;

  // Terrible memory hack!!
  // On copie le POINTEUR dans le tableau d'items de craft du joueur
  memcpy(player->craft_items, &storage_ptr, sizeof(storage_ptr));
  player->flags |= 0x80;  // lock le craft

  // Envoyer l'interface coffre au client
  sc_openScreen(player->client_fd, 2, "Chest", 5);
  for (int i = 0; i < 27; i ++) {
    uint16_t item;
    uint8_t count;
    memcpy(&item, storage_ptr + i * 3, 2);
    memcpy(&count, storage_ptr + i * 3 + 2, 1);
    sc_setContainerSlot(player->client_fd, 2, i, count, item);
  }
}
```

Et le commentaire dans le code : `// Terrible memory hack!!1!`

C'est exactement ça. Il prend l'adresse mémoire de l'entrée suivante dans `block_changes[]`, il la copie dans `player->craft_items` (qui est un `uint16_t[9]`, donc 18 bytes -- assez pour stocker un pointeur 32 bits), et il lève le flag pour que personne essaie de craft pendant ce temps.

Sur chaque clic dans l'inventaire du coffre :

```c
// packets.c, lignes 620-638

uint8_t *storage_ptr;
memcpy(&storage_ptr, player->craft_items, sizeof(storage_ptr));
// storage_ptr pointe maintenant vers les données du coffre
uint16_t *p_item = (uint16_t *)(storage_ptr + (slot - 41) * 3);
uint8_t *p_count = storage_ptr + (slot - 41) * 3 + 2;
```

Il récupère le pointeur depuis le buffer de craft, et il accède aux slots avec un offset. Les données coffre sont stockées à raison de 3 bytes par slot (2 pour l'ID, 1 pour la quantité), collées les unes aux autres dans le tableau de blocs.

![Données de coffre stockées dans le tableau de blocs -- un hack mémoire](/images/bareiron/chest-hack.jpg)

## La faim : 5 lignes de génie

```c
// main.c, lignes 293-305

// Les joueurs envoient des packets de mouvement à ~20/sec quand ils
// bougent, beaucoup moins quand ils sont immobiles. On corrèle ça
// avec l'activité pour simuler la faim gratuitement.
if (player->saturation == 0) {
  if (player->hunger > 0) player->hunger--;
  player->saturation = 200;
  sc_setHealth(client_fd, player->health, player->hunger, player->saturation);
} else if (player->flags & 0x08) {  // sprinting
  player->saturation -= 1;
}
}

C'est littéralement ça. 5 lignes. Chaque packet de mouvement décrémente la saturation. Quand la saturation arrive à zéro, la faim baisse et on reset la saturation. Le sprint (flag `0x08`) double le drain.

Zéro timer, zéro mémoire allouée, zéro compute dédié. Un compteur qui se décrémente sur des packets qui existent déjà.

### Les dégâts de chute

Le système de dégâts le plus simple du projet :

```c
// Quand le joueur quitte le sol, on stocke son Y
// Quand il retouche le sol, on soustrait
degats = dernier_y_au_sol - y_actuel;
```

Une soustraction.

## Miner et placer des blocs

Quand tu cliques sur un bloc, le packet `0x28` (Player Action) atterrit dans le switch. Le handler doit déterminer quel bloc se trouve à la position, le retirer, et mettre l'item dans l'inventaire :

```c
// main.c, case 0x28 (simplifié)

void handlePlayerAction (int client_fd, uint8_t action, int x, uint8_t y, int z) {
  switch (action) {
    case START_DESTROY_BLOCK: {
      // Déterminer le type de bloc à la position cliquée
      uint8_t block = getBlockAt(x, y, z);

      if (block == B_chest) {
        openChest(client_fd, x, y, z);
        break;
      }

      // Ajouter aux block_changes
      addBlockChange(x, z, y, 0);  // 0 = air

      // Donner l'item au joueur (trust the client)
      addItemToPlayer(client_fd, block_to_item(block), 1);

      // Envoyer la mise à jour au client
      sc_blockChange(client_fd, x, y, z, 0);
      sc_ackBlockChange(client_fd, x, y, z, 0);
      break;
    }
    case PLACE_BLOCK: {
      // Lire le type de bloc depuis la main du joueur
      uint16_t item = getHeldItem(client_fd);
      uint8_t block = item_to_block(item);
      addBlockChange(x, z, y, block);
      removeItemFromPlayer(client_fd, item, 1);
      sc_blockChange(client_fd, x, y, z, block);
      break;
    }
  }
}
```

`getBlockAt` combine la génération de terrain ET les changements joueurs :

```c
uint8_t getBlockAt (int x, uint8_t y, int z) {
  // D'abord vérifier les changements joueurs
  uint8_t change = getBlockChange(x, y, z);
  if (change != 0xFF) return change;

  // Sinon, lire depuis le terrain généré
  return getTerrainBlock(x, y, z);
}
```

Priorité aux changements, fallback sur le terrain. Zéro débat, zéro cache, zéro overhead. Le `getTerrainBlock` sous le capot, c'est `getHeightAt` + les couches de stone/dirt/grass/coal.

### Le fourneau instantané

Le plus drôle : le fourneau n'existe pas en tant qu'entité. Si tu poses du cobblestone dans la case "cuisson" et du coal dans "fuel", le résultat apparaît immédiatement. Pas de timer, pas de chunk ticking. C'est juste un slot d'inventaire qui se vide quand tu mets les bons items.

![Fourneau instantané -- pose les ingrédients, résultat immédiat](/images/bareiron/furnace.jpg)

## La boucle ESP32 : un serveur MC dans 4 KB de stack

```c
// main.c, lignes 732-779

#ifdef ESP_PLATFORM

void bareiron_main (void *pvParameters) {
  main();
  vTaskDelete(NULL);
}

static void wifi_event_handler (...) {
  if (/* connecté */) {
    xTaskCreate(bareiron_main, "bareiron", 4096, NULL, 5, NULL);
  }
}

void app_main () {
  esp_timer_early_init();
  wifi_init();
  // Le reste est géré par le event handler
}
#endif
```

Le serveur entier tourne dans une tâche FreeRTOS avec **4096 bytes de stack**. C'est tout. Le main thread principal ne fait qu'initialiser le WiFi et attendre une connexion. Une fois connecté, il spawn `bareiron_main` qui appelle le `main()` standard.

Tout le code spécifique ESP32 est protégé par des `#ifdef ESP_PLATFORM`. Sur PC, tout ça compile en code POSIX standard.

## Ce qui a été sacrifié

Pour que tout ça tienne, y'a des features vanilla qui existent pas :

- **Pas de compression réseau** -- zlib trop cher. Le serveur génère des chunks vite, mais les envoyer est le bottleneck.
- **Pas de random ticks** -- les arbres poussent avec de la bone meal ou pas. Les mobs spawnent aux frontières de chunk.
- **Pas d'entités item** -- les blocs minés vont direct dans l'inventaire. L'animation est purement visuelle.
- **Aucune vérification d'inventaire** -- trust the client. 64 diamants ? OK. Un chunk miné en 1 sec ? OK. À utiliser entre gens de confiance.
- **Pas de lumière serveur** -- les torches sont envoyées après tout le reste, le client calcule.
- **Pas de fluides progressifs** -- état final instantané.

## Le résultat final

Ryzen 5 3600 : ~0.5 ms par chunk.
ESP32-C3 à 1$ : ~200 ms par chunk. Jouable.

![Benchmark de génération de chunks -- Ryzen vs ESP32](/images/bareiron/performance.jpg)

3+ joueurs : ça rame. Comparable à 2b2t aux heures de pointe, dixit l'auteur.

![Plusieurs joueurs connectés au même serveur Bareiron](/images/bareiron/multiplayer.jpg)

## La philosophie

p2r3 : "J'aime juste l'idée que cette toute petite puce à 1 balles qui consomme 0.5 Watt puisse faire tourner quelque chose d'aussi avancé que Minecraft. Science isn't about 'why', it's about 'why not'."

Chaque ligne est un tradeoff :
- Perlin noise → interpolation : moins joli, 200x plus rapide, zéro mémoire
- Matrices de craft → matching hardcodé : code dégueu, zéro byte
- zlib → rien : connexion pourrie = mort, mais jouable
- Validation → trust : zéro sécurité, zéro compute

Chaque feature absente permet à une autre d'exister dans les limites du hardware.

**Les 3 trucs à retenir :**

1. **Interpolation + RNG** -- 4 points seedés, terrain infini, zéro stockage, query sans regénérer le chunk, 200 ms de génération. C'est le move de génie qui rend tout le reste possible.
2. **Chaque feature a un coût** -- Pas de compression, pas de random ticks, pas de validation. C'est pas des oublis, c'est ce qui permet de tenir dans 520 KB.
3. **Les hacks dégueus sont les plus intelligents** -- Coffres dans le tableau de blocs via memcpy, faim par packets de mouvement, fourneau instantané. La solution propre aurait été trop chère.

Si le projet t'intéresse, tout est sur [GitHub en GPLv3](https://github.com/p2r3/bareiron/). C'est du C bien sale, et j'ai rarement pris autant de plaisir à lire un code source xD
