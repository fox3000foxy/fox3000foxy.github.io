---
title: "Super Mario Bros. : le format de niveau, les pointeurs et les 256 glitch worlds"
description: "Comment 128 niveaux × 4 types de zone tiennent dans 40KB de ROM, pourquoi le Minus World existe, et comment un match de Tennis NES peut charger des glitch worlds."
date: 2026-06-10
tags:
  - retro
  - reverse-engineering
  - nintendo
  - nes
  - 6502
  - mario
authors:
  - fox3000foxy
---

## Introduction

Super Mario Bros., c'est 40 kilooctets de ROM. Huit mondes, 32 niveaux, des ennemis, de la musique, des power-ups, tout tient là-dedans.

Mais si tu ouvres un émulateur et que tu trifouilles les bonnes bytes, tu peux charger le niveau 36-1. Ou le 255-1. Ou atterrir dans un monde où tout est fait de sprites de Bowser et de tuyaux qui mènent nulle part.

Ces glitch worlds existent pour une raison simple : le système de stockage des niveaux de SMB1 est une merveille d'optimisation 8-bit, et quand on force le jeu à lire là où il faut pas, ça donne des résultats fascinants.

Retro Game Mechanics Explained a fait une série de 4 vidéos là-dessus -- on va les compiler en une seule plongée dans le code 6502 du jeu le plus vendu de son époque.

![GLITCH OBJECTS -- le titre de la série RGMechEx sur les mécaniques cachées de SMB1](/images/smb1-glitch-levels/title-card.jpg)

![World 9-1 -- l'écran titre du premier glitch world accessible via le cart swap Tennis](/images/smb1-glitch-levels/v1-title-9-1.jpg)

## Le warm start : pourquoi la RAM de Tennis survit dans SMB1

Avant de parler de stockage de niveaux, il faut comprendre comment SMB1 démarre. Parce que le glitch du cart swap NES Tennis repose entièrement sur le **système de détection warm start / cold start** du jeu.

### Les 41 bytes préservés

Quand SMB1 détecte un **cold start** (première mise sous tension ou power off/on), il efface toute la RAM. Mais quand il détecte un **warm start** (reset bouton, pas de coupure d'alimentation), il préserve une zone mémoire de **41 bytes** :

```asm
; Les 41 bytes préservés en RAM lors d'un warm start
; Adresses $075F-$0787
;
; $075F : byte de démarrage (world - 1)    [1 byte]
; $0760 : flag de sélection de monde (B button) [1 byte]
; $0761-$0762 : inutilisé                    [2 bytes]
; $0763-$0768 : timer (6 digits, 3 affichés) [6 bytes]
; $0769-$076E : coins Luigi                   [6 bytes]
; $076F-$0774 : coins Mario                   [6 bytes]
; $0775-$077A : score Luigi                   [6 bytes]
; $077B-$0780 : score Mario                   [6 bytes]
; $0781-$0786 : top score (6 digits, 1 caché) [6 bytes]
; $0787 : le byte magique $A5                 [1 byte]
```

Ces 41 bytes servent à une seule fonctionnalité : permettre au joueur de **continuer au même monde après un game over**. Si tu meurs en 6-3, le jeu écrit le monde 6 dans le byte de démarrage, et au title screen, si tu maintiens A + Start, tu recommences en 6-1.

![Les 41 bytes préservés en RAM lors d'un warm start -- TOP SCORE, MARIO SCORE, TIMER, WORLD SELECT, CONTINUE WORLD, et le byte magique $A5](/images/smb1-glitch-levels/v1-memory-state.jpg)

### La double vérification du warm start

![Cold start vs warm start -- le diagramme de détection du reset](/images/smb1-glitch-levels/v1-warm-start.jpg)

Quand SMB1 boote, il ne vérifie pas un seul critère mais **deux** :

```asm
CheckWarmStart:
  ; 1. Vérifier le byte magique $A5 à $0787
  lda $0787
  cmp #$A5
  bne ColdStart        ; pas $A5 → cold start

  ; 2. Vérifier les 6 digits du top score ($0781-$0786)
  ;    Chaque digit doit être entre 0 et 9
  ldx #0
CheckLoop:
  lda $0781,x
  cmp #$0A
  bcs ColdStart        ; digit >= 10 → cold start
  inx
  cpx #6
  bne CheckLoop

  ; Si les deux conditions passent → warm start
  ; La RAM n'est pas effacée, le monde de départ est préservé
  jmp WarmStartBoot
```

![La vérification du byte $A5 et des digits du top score -- le coeur du warm start](/images/smb1-glitch-levels/v1-a5-byte.jpg)

Pourquoi une double vérification ? Parce que le byte $A5 pourrait être présent par hasard (un autre jeu qui laisse cette valeur, ou l'état de repos par défaut du chip RAM). En vérifiant que les digits du top score sont valides (0-9), on s'assure que les données sont cohérentes.

### Pourquoi Tennis est le seul jeu qui marche

Quand on insère SMB1 pour la première fois (cold start), le jeu :
1. Efface toute la RAM → top score = 0, world byte = 0
2. Écrit $A5 à l'adresse $0787

Ensuite, on swap sur Tennis sans éteindre la console. Tennis :
- **Ne nettoie pas la RAM au démarrage** (peu de jeux NES le font)
- **N'écrit pas sur les bytes du top score** → ils restent à 0 (valides)
- **Ne touche pas au byte $A5** → il reste présent
- **Utilise l'adresse $075F** pour le compteur de pas du joueur

```asm
; Le footstep increment dans Tennis :
; À chaque pas du joueur sur le court, Tennis incrémente le byte à $075F.
; Ce même byte est utilisé par SMB1 comme "world number - 1".
;
; 0 pas  → world 0 → SMB1 = world 1
; 1-7 pas → world 1-7 → worlds normaux
; 8+ pas → world 8+ → glitch worlds !
;
; Le compteur ne s'incrémente que quand la musique s'arrête
; (les footstep sounds ne jouent pas pendant la musique).
```

Quand on remet SMB1 :
1. Le byte $A5 est toujours là (Tennis ne l'a pas touché)
2. Les digits du top score sont toujours 0 (valides)
3. Le world byte vaut maintenant 8+ (incrémenté par les pas de Tennis)
4. SMB1 détecte un warm start → préserve le world byte corrompu
5. Maintenir A + Start → world 9-1, world A-1, world 36-1, etc.

### Pourquoi il faut booter Mario avant Tennis

Une subtilité : il faut d'abord booter SMB1, puis Tennis, puis SMB1 à nouveau. Si tu commençais directement par Tennis, le byte $A5 ne serait jamais écrit (Tennis n'écrit pas $A5), donc la détection warm start échouerait et la RAM serait effacée.

![Le compteur de pas de Tennis : chaque footstep incrémente le world byte](/images/smb1-glitch-levels/v1-footstep.jpg)

![Access Glitch Worlds via NES Tennis -- la vidéo qui explique le cart swap](/images/smb1-glitch-levels/yt-tennis.jpg)

## Comment SMB1 stocke ses niveaux dans 40KB

Nintendo R&D4 a dû résoudre un problème simple en apparence : représenter des niveaux qui scrollent horizontalement avec des tiles, des ennemis, des items, le tout dans un budget ROM ultra-serré.

La solution, c'est une séparation en deux couches de données **complètement indépendantes** :

### Le tile layout (la carte du niveau)

Chaque niveau est défini par un pointeur vers une structure de tiles compressée en ROM. La compression est rudimentaire mais géniale : un byte "contrôle" suivi de 1-3 bytes de données.

Le format tile utilise un système de **runs** (RLE-like) :

```asm
; Format tile SMB1 (simplifié)
; Chaque "commande" est un byte contrôle :
;
; $00-$7F : pose une tile, avance d'1 colonne
; $80-$BF : pose une tile répétée N fois (N = byte - $80 + 1)
; $C0-$FF : commande spéciale (fin de ligne, saut, changement de palette)

Exemple : pour dessiner 3 briques consécutives :
  $82 $01    ; répète la tile $01 (brick) 3 fois
```

Chaque niveau contient 13 lignes de 16 colonnes de tiles (13×16 = 208 tiles visibles). Mais le format compressé permet de descendre bien plus bas -- par exemple, le ciel et les colonnes vides ne prennent presque pas de place.

La boucle de rendu en 6502 :

```asm
; Décompression tile - loop principale
; Entrée : pointeur tile_data en $XX
; Sortie : tilemap niveau dans la RAM PPU

DecompressTile:
  lda (tile_ptr),y      ; lire byte contrôle
  iny
  cmp #$80
  bcc SingleTile        ; $00-$7F : tile unique
  cmp #$C0
  bcc RunLength         ; $80-$BF : run-length
  jmp SpecialCommand    ; $C0-$FF : commande spéciale

SingleTile:
  sta PPU_DATA          ; écrire la tile directement
  jmp Next

RunLength:
  sec
  sbc #$7E              ; N = control - $7E
  tax
  lda (tile_ptr),y      ; lire la tile à répéter
  iny
: sta PPU_DATA
  dex
  bne :-
  jmp Next
```

### Le sprite layout (les ennemis et objets)

Parallèlement, les ennemis et objets (blocs ?, tuyaux, goombas, koopas) sont stockés dans une structure complètement séparée. Chaque spawn est défini par 2 bytes :

```asm
; Format sprite SMB1
; Byte 0 : position X (en colonnes)
; Byte 1 : type de sprite + bits de page Y
; Y est dérivé de l'index dans la séquence

Une séquence de sprites :
  $01 $4B    ; goomba à la colonne 1
  $09 $4B    ; goomba à la colonne 9
  $10 $61    ; bloc ? à la colonne 16 (contient pièce)
  $15 $54    ; koopa verte à la colonne 21
  $FF        ; fin de séquence
```

Chaque niveau peut référencer jusqu'à 5 pages de sprites différentes (enfin, 5 "screens" de 16 colonnes), mais en pratique la plupart des niveaux n'en utilisent que 2-3.

### La table des pointeurs

Le génie du design, c'est la table de pointeurs. Chaque niveau est stocké comme une **paire** d'adresses ROM :

```c
// Structure interne (simplifiée) du World Map
struct LevelPointer {
    uint16_t tile_ptr;   // Adresse ROM des données tiles
    uint16_t sprite_ptr; // Adresse ROM des données sprites
};

// 4 tables séparées, une par AreaType :
// 0 = Water, 1 = Overworld, 2 = Underground, 3 = Castle
LevelPointer level_table[4][128];
```

128 entrées par table. 4 types de zone. **512 combinaisons possibles**, mais seulement une fraction est utilisée par le jeu officiel. Le reste, c'est de la RAM non initialisée ou des données qui sont interprétées comme des pointeurs.

Quand le jeu charge un niveau, il fait ça :

```asm
; Chargement d'un niveau
; A = AreaType (0-3), X = LevelID (0-127)

LoadLevel:
  sta AREA_TYPE
  asl                  ; *2 pour offset dans table 16-bit
  tax
  lda LevelTable_TilePtr, x
  sta TILE_PTR
  lda LevelTable_TilePtr+1, x
  sta TILE_PTR+1       ; pointeur vers les tiles
  lda LevelTable_SpritePtr, x
  sta SPRITE_PTR
  lda LevelTable_SpritePtr+1, x
  sta SPRITE_PTR+1     ; pointeur vers les sprites
  jsr DecompressTiles
```

Pas de validation. Pas de check que le pointeur est valide. Le jeu lit l'adresse dans la table et décompresse ce qui se trouve à cette adresse, point final.

![Level ID $06 (Water) -- 9-1, la version sous-marine de 6-2](/images/smb1-glitch-levels/lvl-06-9-1.png)

![La table des Level IDs : 128 entrées possibles, 34 assignées](/images/smb1-glitch-levels/v2-level-id-table.jpg)

![L'ordre différent des pointeurs tiles et sprites -- la cause des Frankenstein levels](/images/smb1-glitch-levels/v2-pointer-tables.jpg)

### Les 34 niveaux uniques et le système d'ID 7-bit

![Le chip RAM de la NES (MB8416A) -- c'est lui qui conserve les données quand on swap les cartouches](/images/smb1-glitch-levels/v1-ram-chip.jpg)

SMB1 n'a pas 32 niveaux, mais **34 niveaux uniques**. Beaucoup de niveaux sont des doublons (5-3 = 1-3 mais avec des Bullet Bills) marqués par un drapeau "hard mode". Les vrais niveaux uniques :

- **Eau** (Type 0) : 3 niveaux (2-2, 7-2, zone bonus 5-2/6-2)
- **Overworld** (Type 1) : 22 niveaux (dont les 2 salles nuages bonus)
- **Underground** (Type 2) : 3 niveaux (dont les salles bonus souterraines)
- **Castle** (Type 3) : 6 niveaux
- \+ 1 cutscene room (avant les niveaux sous-terrains/eau)
- \+ 1 warp zone de 4-2

Chaque niveau a un ID sur **7 bits**. Les 5 bits de poids faible = numéro dans le sous-groupe, les 2 bits de poids fort = type de zone :

```asm
; Encodage 7-bit du Level ID
; Bits 6-5 : Type (00=Water, 01=Overworld, 10=Underground, 11=Castle)
; Bits 4-0 : Numéro dans le sous-groupe
;
; Water IDs      : $00-$02  (types 00, numéros 0-2)
; Overworld IDs  : $20-$35  (types 01, numéros 0-21)
; Underground IDs: $40-$42  (types 10, numéros 0-2)
; Castle IDs     : $60-$65  (types 11, numéros 0-5)
;
; ID $25 = %0100101 → type 01 (Overworld), numéro 5 → 1-1
; ID $23 = %0100011 → type 01 (Overworld), numéro 3 → 6-2
```

**128 IDs possibles** ($00-$7F), seulement 34 assignés à des vrais niveaux. Les IDs inutilisés pointent vers n'importe quoi.

### Les tables de pointeurs : deux listes, deux ordres

Les pointeurs tiles et sprites ne sont pas stockés dans la même ordre. Le code utilise deux listes 16-bit séparées (high byte / low byte dans deux tables distinctes) :

```
Ordre des pointeurs sprites :
  Index 0-5   : Castle (6 niveaux)
  Index 6-27  : Overworld (22 niveaux)
  Index 28-30 : Underground (3 niveaux)
  Index 31-33 : Water (3 niveaux)

Ordre des pointeurs tiles :
  Index 0-2   : Water (3 niveaux)
  Index 3-24  : Overworld (22 niveaux)
  Index 25-27 : Underground (3 niveaux)
  Index 28-33 : Castle (6 niveaux)
```

Pourquoi des ordres différents ? Aucune raison technique -- c'est probablement comme ça que les données ont été organisées pendant le développement. Mais ça crée une conséquence fascinante : quand un ID de niveau est invalide, les pointeurs tiles et sprites chargent des niveaux *différents*, créant des **Frankenstein levels**.

Pour naviguer entre ces deux listes, le jeu utilise des petites **tables d'offset** (comme une table des matières) :

```asm
; Tables d'offset par type (Water, Overworld, Underground, Castle)
; Chaque entrée = index de début dans la liste correspondante

SpriteOffsetTable:
  .byte $1F, $06, $1C, $00    ; Water=31, Overworld=6, Underground=28, Castle=0

TileOffsetTable:
  .byte $00, $03, $19, $1C    ; Water=0, Overworld=3, Underground=25, Castle=28
```

Pour charger le niveau 6-2 (ID $23, Overworld numéro 3) :

```asm
; 1. Type = 01 (Overworld) → index dans table d'offset = 1
; 2. Sprite offset = SpriteOffsetTable[1] = 6
;    Index final = 6 + 3 (numéro de niveau) = 9 → 10ème pointeur sprites
; 3. Tile offset = TileOffsetTable[1] = 3
;    Index final = 3 + 3 = 6 → 7ème pointeur tiles
; 4. Résultat : pointeur tiles $A619 + pointeur sprites $9ED0 = 6-2 ✓
```

Maintenant, que se passe-t-il avec un ID invalide comme $43 (Underground numéro 3, qui n'existe pas) ?

```asm
; ID $43, Type = 10 (Underground), numéro = 3
; Sprite offset = SpriteOffsetTable[2] = $1C = 28
;   Index = 28 + 3 = 31 → 32ème pointeur sprites = eau bonus 5-2 !
; Tile offset = TileOffsetTable[2] = $19 = 25
;   Index = 25 + 3 = 28 → 29ème pointeur tiles = 1-4 (Castle) !
;
; Résultat : un niveau souterrain avec les tiles de 1-4
; et les Bloopers de la zone eau de 5-2. Un vrai Frankenstein.
```

![Level ID $43 -- Frankenstein level : tiles 1-4 + sprites eau 5-2](/images/smb1-glitch-levels/lvl-43-frankenstein.png)

![Exploring Glitch Level Pointers -- les tables d'offset expliquées](/images/smb1-glitch-levels/yt-pointers.jpg)

![Le world index table -- quand l'overflow de world 9 crée un glitch level](/images/smb1-glitch-levels/v2-world-index-table.jpg)

### Le world index table : pourquoi world 9 overflow

Il y a une table ROM de 8 bytes qui donne l'index du premier niveau de chaque monde (1-8). Et juste après, la table des 36 Level IDs de tous les niveaux dans l'ordre de jeu.

```asm
; WorldIndexTable (8 bytes)
  .byte 0, 5, 10, 15, 20, 25, 28, 33
;   -> Monde 1 commence au niveau 0
;   -> Monde 2 commence au niveau 5
;   -> Monde 8 commence au niveau 33

; LevelIDTable (36 bytes)
  .byte $25, $28, $29, $26, $24, ... ; les 36 Level IDs
```

Quand on essaie de charger world 9, le jeu lit le 9ème byte de WorldIndexTable... qui n'existe pas. Il overflow de 1 byte dans LevelIDTable, lit la valeur $25, puis utilise $25 comme index dans LevelIDTable (37ème entrée) -- ce qui overflow à nouveau de 2 bytes dans SpriteOffsetTable, et lit la valeur 6.

```asm
; World 9 :
;   1. WorldIndexTable[8] (overflow) → lit $25 dans LevelIDTable
;   2. LevelIDTable[37] (overflow) → lit le 2ème byte de SpriteOffsetTable = 6
;   3. ID = 6 → Water level number 6 (qui n'existe pas)
;   4. Tile pointer = pointeur water numéro 6 = tiles de 6-2
;   5. Sprite pointer = index 31+6 = 37 > 33 → pointeur invalide
;   6. Résultat : 6-2 sous l'eau avec des sprites glitchés
;      → world 9-1 !
```

Pour world G (16), l'overflow va encore plus loin et tombe sur le Level ID $01, qui est le niveau cutscene qui précède 1-2 :

```asm
; World G (16) :
;   WorldIndexTable[15] → lit $01 dans LevelIDTable
;   LevelIDTable[1] = $29 (cutscene 1-2)
;   → world G-1 = la cutscene d'entrée de 1-2
```

## Pourquoi les glitch worlds existent

Le jeu a 32 niveaux "légitimes" (8 mondes × 4 niveaux). Mais la table de pointeurs fait 128 entrées par type de zone. Les entrées au-delà du niveau 32 contiennent ce qui se trouve en ROM à ces adresses -- parfois un autre niveau, parfois des données sonores, parfois de la RAM, parfois n'importe quoi.

![Level ID $01 Water (Minus World) -- tile pointer $AE45, sprite pointer $A171](/images/smb1-glitch-levels/minus-world.png)

### Level ID $01 + AreaType 0 = Minus World

Le plus célèbre des glitch worlds. Le Level ID $01 en AreaType 0 (eau) pointe vers :

- **Tile pointer : $AE45** → la zone sous-marine de 2-2/7-2
- **Sprite pointer : $A171** → les sprites de 2-2/7-2

Le résultat : un niveau d'eau qui ressemble à 2-2, mais qui boucle à l'infini parce que le flagpole n'existe pas. Pas de fin de niveau, pas de sortie.

C'est le niveau 36-1 (ou 36-1 dans le monde $-1).

![Le warm start check de SMB1 -- c'est lui qui permet au Minus World d'exister](/images/smb1-glitch-levels/v4-minus-world.jpg)

```asm
; Pourquoi le flagpole manque dans le Minus World :
; Les sprites de 2-2/7-2 ($A171) n'ont pas de flagpole
; dans leur séquence. Le jeu cherche le sprite $FD (flagpole)
; mais ne le trouve jamais → boucle infinie
;
; Le jeu continue de générer le niveau à l'infini
; jusqu'à ce que le timer atteigne zéro.
```

### Les pointeurs qui pointent vers la RAM

Quand le tile pointer ou le sprite pointer pointe vers une adresse en RAM ($00-$7F) plutôt qu'en ROM, le jeu tente d'interpréter les changements constants de la RAM comme des tiles :

```asm
; Exemple : Level ID $03 en Water
; Tile Pointer : $A46B (3-3 - valide)
; Sprite Pointer : $009D (pointe vers la RAM page zéro !)
;
; La RAM page zéro contient les registres du jeu,
; la position de Mario, l'état des compteurs...
; Le jeu décompresse ça comme une séquence de sprites,
; et le résultat c'est un niveau avec des ennemis
; qui sont en fait des valeurs de registres.
```

Quand la page zéro change (parce que Mario bouge, que le timer tourne, etc.), les "sprites" du niveau changent aussi. C'est pour ça que certains glitch worlds ont des ennemis qui clignotent et se transforment constamment.

![Level ID $03 Water -- sprite pointer $009D pointe vers la RAM, niveau injouable](/images/smb1-glitch-levels/level-03-water.png)

### Level ID $36 : le niveau vide (Overworld)

Level ID $36 en Overworld :

- **Tile pointer : $AC35** (1-2)
- **Sprite pointer : $A0D8** (1-2)

Résultat : rien. Le jeu charge le niveau mais il est marqué "sans niveau" dans le catalogue de RGMechEx. Les tiles sont peut-être valides mais les sprites pointent vers un endroit qui produit un niveau vide ou non fonctionnel.

### Level ID $1D (Castle) : le champion des crashs

Level ID $1D en Castle :

- **Tile pointer : $A210** (4-4)
- **Sprite pointer : $7EA0** (RAM !)

Sprite pointer en RAM = undefined sprites. Le jeu essaie d'afficher un Spiny ball ou un Bullet Bill blaster dans la première ligne de tiles. Ça crashe immédiatement.

```asm
; Quand le sprite pointer pointe vers la RAM,
; le jeu décompresse des bytes qui changent tout le temps
; comme des instructions "spawn". Le résultat :
; - Apparition d'objets inexistants (valeur undefined)
; - Crash PPU quand le sprite NES essaie d'afficher un tile invalide
; - Freeze complet de la console
```

## Les 256 glitch worlds catalogués

RGMechEx a écrit un script qui génère les maps de **tous les niveaux**, pour les 4 types de zone, et les 128 IDs chacun.

Le compteur de monde est sur 8 bits (0-255). Les mondes 1-8 sont légitimes. Il reste **248 glitch worlds** potentiels. Chaque glitch world correspond au premier niveau de ce monde, et sa Level ID est calculée par le mécanisme d'overflow de la WorldIndexTable.

![Table des glitch worlds -- 248 mondes corrompus, 68 premiers niveaux accessibles](/images/smb1-glitch-levels/v3-glitch-worlds-table.jpg)

Sur les 128 IDs possibles, seulement **68 sont des "first level" d'un monde** (accessibles via le glitch world number). Les 60 autres sont des niveaux 2+ ou inaccessibles.

| Type | IDs uniques jouables | IDs qui crashent | IDs vides |
|------|---------------------|-------------------|-----------|
| Water (0)    | ~20  | ~60  | ~48  |
| Overworld (1)| ~30  | ~55  | ~43  |
| Underground (2) | ~15 | ~65 | ~48  |
| Castle (3)   | ~25  | ~58  | ~45  |

Beaucoup de IDs mènent au même niveau à cause des pointeurs qui tombent sur les mêmes adresses ROM. Le Level ID $28 (Overworld) par exemple -- tile pointer $A7CD (2-1) -- apparaît dans **38 glitch worlds différents**, parce que son sprite pointer $9F51 pointe vers une zone de la ROM qui est utilisée comme padding/données sonores réutilisé par plein d'IDs.

![Carte du niveau ID $28 (Overworld) -- 2-1 tiles avec des sprites normaux, 38 glitch worlds](/images/smb1-glitch-levels/level-28-overworld.png)

![Super Mario Bros. Glitch Levels Explained -- la 3ème vidéo](/images/smb1-glitch-levels/yt-levels.jpg)

### Les 6 glitch levels vraiment uniques

Parmi les 19 IDs de glitch level accessibles, seulement **6 ne crashent pas immédiatement** au chargement :

| World | Level ID | Description |
|-------|----------|-------------|
| E-1 (224) | $50 | Un seul ? block au-dessus d'un gouffre. Mario meurt instantanément. |
| W | $57 | Mario spawn bloqué, incapable de bouger. |
| 42 (133) | $50 | Tunnel de nuages qui piège Mario s'il va assez loin. |
| 62 (131, 240) | $4D | Château gelé : Mario spawn en haut, ne peut pas tomber → bloqué. |
| 127 | $4B | Tunnel souterrain, mais crashe si on va trop loin. |
| 137 | $4B | Active le défilement automatique des cutscenes. Mario rencontre un unique brick block qui le bloque à jamais. |

![Level ID $50 (cloud tunnel) -- le glitch world 42-1 et E-1](/images/smb1-glitch-levels/lvl-50-cloud.png)
![Level ID $4D (castle) -- world 62-1, Mario bloqué au spawn](/images/smb1-glitch-levels/lvl-4D-castle.png)
![Level ID $4B (tunnel) -- world 127-1, crashe si on va trop loin](/images/smb1-glitch-levels/lvl-4B-tunnel.png)

Six glitch worlds sur 248 qui produisent quelque chose de vraiment nouveau. Le reste, ce sont des niveaux normaux avec le mauvais type de zone, ou des écrans noirs.

## Le format des niveaux en détail

Cap sur le format exact des données de niveau, pour comprendre pourquoi les glitch levels tiennent debout (ou pas).

### Le header niveau : 2 bytes, 6 propriétés

Chaque niveau commence par un header de 2 bytes qui contrôle 6 propriétés :

```asm
; Byte 0 : timer + Y start + modifier
;   Bits 7-6 : timer (00=inchangé, 01=200, 10=300, 11=400)
;   Bits 5-3 : Y start Mario (111/110 = autowalk)
;   Bits 2-0 : level type modifier
;              000=default, 001=waves, 010=brick wall,
;              011=water bottom, 100=night, 101=snow,
;              110=snow night, 111=gray night

; Byte 1 : platform + background + floor pattern
;   Bits 7-6 : special platform (00=tree, 01=mushroom,
;                                 10=Bullet Bill, 11=cloud)
;   Bits 5-4 : background (00=none, 01=clouds,
;                           10=montains, 11=fences)
;   Bits 3-0 : floor pattern initial (0-15)
```

Le type modifier contrôle des variations visuelles : les vagues en haut des niveaux d'eau, le fond brique de 8-3, la palette nuit de 4-3, la neige de 6-2, etc.

### Les objets tiles : 2 bytes, Next Screen Flag, queue 3 slots

Après le header vient une liste d'**objets tile**, chaque objet fait 2 bytes. Le byte $FD marque la fin de la liste.

```asm
; Format objet tile (16 bits) :
; Byte 0 :
;   Bits 7-4 : X position (colonne 0-15)
;   Bits 3-0 : Y position
;     Y=0-11  : position Y normale
;     Y=12    : objets spéciaux (trous, ponts, rope, ? blocks)
;     Y=13    : screen skip / objets spéciaux 2
;     Y=14    : changement de modifier/scenery/floor
;     Y=15    : objets spéciaux 3 (château, escaliers, gros tuyau)

; Byte 1 :
;   Bit  7   : NEXT SCREEN FLAG
;   Bits 6-4 : type d'objet (0-7)
;   Bits 3-0 : largeur/hauteur / sous-type
```

Quand le bit "next screen" est mis, la colonne de travail courante est incrémentée de 1. Ça permet de placer des objets au-delà des 16 premières colonnes. Les objets doivent être listés **dans l'ordre** (gauche à droite) parce que le jeu les charge séquentiellement :

```asm
; La routine de chargement a DEUX phases par colonne :
; Phase 1 : chercher les nouveaux objets qui commencent sur cette colonne
;            et les ajouter à la file d'attente (queue)
; Phase 2 : traiter chaque objet dans la queue en dessinant les tiles,
;            et retirer ceux qui finissent sur cette colonne
```

La queue fait exactement **3 slots**. Conséquence directe : on ne peut pas avoir plus de 3 objets qui commencent sur la même colonne. Si la queue est pleine, le 4ème objet est ignoré et ne sera jamais chargé.

C'est pour ça que les niveaux bien conçus évitent d'empiler trop d'objets. Exemple dans 1-2 : la colonne avec le 1up block dans le plafond + les briques à côté sont splitées en deux objets distincts pour respecter la limite de 3.

### Y position spéciale : 12, 13, 14, 15

Quand Y=12, l'objet n'a pas de position Y (elle est hardcodée par type) :

```asm
; Y=12 : objets sans Y position
;   Type 0 : trou (supprime le sol)
;   Type 1 : rope de plateforme mobile
;   Types 2-4 : ponts à Y fixe
;   Type 5 : trou avec eau/lave
;   Types 6-7 : rangées de ? blocks
```

Quand Y=13, deux sous-groupes. Si le bit 6 du byte 1 est à 1 :

```asm
; Y=13, bit6=1 : objets spéciaux
;   0 = L-pipe (cutscene), 1 = flagpole, 2-3 = pont/axe/hamer (fin château)
;   4 = stop screen, 5 = random enemies, 6 = loop level, 7+ = crash possible
```

Si bit6=0, les 5 bits de poids faible encodent un **screen skip** (sauter directement à un écran N, sans passer par le next screen flag un par un).

Quand Y=14 : même principe avec bit6=1 pour changer le type modifier, bit6=0 pour changer le fond + floor pattern.

### Les floor patterns : 16 motifs de sol

Le sol des niveaux n'est pas fait d'objets individuels. SMB1 utilise des **floor patterns**, un motif de fond qui s'applique à toutes les colonnes jusqu'au prochain changement :

```asm
; Floor patterns (4 bits = 16 possibilités)
;   0 = vide total
;   1 = sol 2 tiles haut
;   2 = sol 1 tile haut
;   3 = sol + bottom
;   4 = sol + bottom 2
;   5 = sol 1/2 tile
;   6 = 3/4 sol
;   ... jusqu'à 15 = rempli total (sol + plafond)
```

C'est pour ça que les trous sont des objets : ils override le floor pattern sur une colonne spécifique, sans avoir à changer le pattern pour tout le reste.

### La limite des 256 bytes et le repeat

Toutes les données tile d'un niveau tiennent dans **256 bytes maximum**. Le Y register du 6502 est utilisé comme index, et il fait 8 bits. Si le jeu arrive à la fin des données sans trouver le byte $FD, **il reboucle au début** et répète les 256 bytes à l'infini :

```asm
; Index Y = 8 bits → max 256 bytes de données tiles
; Si Y overflow (255 → 0) sans rencontrer $FD → repeat
; Même chose pour les sprites, mais les objets pipe (3 bytes)
; décalent la parité de l'index à chaque chargement.
```

Certains glitch levels exploitent ce repeat pour générer des niveaux qui durent "indéfiniment".

### Le système de sprites : 2 bytes + pipe transitions

Les sprites suivent un format similaire, mais sans header et avec quelques différences clés. Le byte $FF marque la fin de la liste.

```asm
; Format sprite (2 bytes) :
; Byte 0 : position X (colonne)
; Byte 1 :
;   Bit 7 : NEXT SCREEN FLAG
;   Bits 6-0 : type de sprite
;       Certains types incluent : goomba, koopa, Blooper,
;       Bullet Bill, Lakitu, Spiny, plateformes,
;       commande warp zone, toad/princesse,
;       commandes de spawn de groupes d'ennemis
```

Le bit de poids faible du byte 1 est le **hard level flag** : si mis à 1, le sprite n'apparaît que dans les niveaux ≥ 5-3. C'est ainsi que les niveaux "hard mode" sont créés.

Y position 15 = **screen skip** (identique aux tiles). Y position 14 = **pipe transition** (3 bytes) :

```asm
; Sprite Y=14 : pipe/vine transition (3 bytes !)
;   Byte 0 : position X
;   Byte 1 : bits 6-0 = Level ID 7-bit (destination)
;   Byte 2 : bits 4-0 = screen de destination
;            bits 7-5 = world où cette transition est valide
;
; Pourquoi un world ? Les bonus rooms sont réutilisées entre mondes.
; Exemple : la salle bonus de 1-1 est aussi utilisée par 2-1 et 7-1.
; Cette salle a 3 transitions, une par monde, pour que Mario
; réapparaisse au bon endroit.
```

Les sprites **n'ont pas de queue system**. La seule limite est qu'il ne peut pas y avoir plus de 4 sprites chargés simultanément dans la zone de spawn (juste hors-écran à droite). Au delà, les sprites sont ignorés.

## Comment accéder aux glitch worlds

Il y a deux méthodes principales.

### La méthode classique : le wall clip

Le wall clip (passage à travers les murs) permet de sortir du niveau normal et de marcher jusqu'à la warzone cachée. En manipulant le compteur de monde via la RAM, on peut charger n'importe quel Level ID.

La technique :
1. World 1-2 : aller dans le tuyau de fin caché
2. Faire le wall clip sur le mur de droite
3. Marcher dans le vide jusqu'à la zone warp
4. Le jeu interprète les valeurs comme des mondes

Mais cette méthode ne donne accès qu'à une petite partie des glitch worlds.

### La méthode extreme : NES Tennis cart swap

Voir la section "Le warm start" plus haut pour le détail complet. En résumé : le compteur de pas de Tennis écrit sur le même byte RAM que le monde de départ de SMB1, et la détection warm start préserve cette valeur.

### Le coin des bidouilleurs : le code pour tout explorer

Si tu veux explorer tous les glitch toi-même dans un émulateur, tu peux patcher le Level ID directement :

```asm
; Patch pour FCEUX / Mesen :
; Adresse RAM $075F = Level ID actuel
; Adresse RAM $0760 = Area Type (0=Water, 1=Overworld, 2=Underground, 3=Castle)

; Exemple : charger le Level 57 (0x39) en Overworld
; Dans l'émulateur, ouvrir le traceur mémoire et écrire :
; $075F = 0x39
; $0760 = 0x01
; Puis entrer dans un tuyau de warp ou mourir et recommencer
; → Le jeu charge le niveau ID $39 en Overworld
```

RGMechEx a publié la liste complète des 128 niveaux × 4 types avec des maps générées automatiquement sur [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html). Chaque entrée montre le tile pointer, le sprite pointer, et une carte visuelle du niveau.

## Les niveaux les plus wtf

### Level ID $1F (Water) : 15 glitch worlds en un

Le tile pointer $A302 (3-4) combiné au sprite pointer $02A0 donne 15 glitch worlds différents (D-1, J-1, Y-1, Z-1, 55-1, 73-1...). Explication : le sprite pointer pointe vers une zone de la ROM qui contient des données suffisamment proches de sprites valides pour produire des résultats jouables, mais la combinaison des tiles de château 3-4 avec des sprites d'overworld crée un rendu absurde.

### Level ID $28 (Overworld) : 38 glitch worlds = record

Le record absolu. 38 entrées de glitch world pointent vers le même niveau (2-1 tiles + $9F51 sprites). Pourquoi ? Parce que le sprite pointer $9F51 tombe dans une zone de la ROM qui est utilisée comme padding/données sonores réutilisé par plein d'IDs.

### Level ID $49 (Underground) : le niveau FDS

Tile pointer $76AE + sprite pointer $1C9D. Le tile pointer pointe vers la zone de la ROM réservée à la version Famicom Disk System. Résultat : un niveau avec des tiles qui n'existent pas dans la cartouche standard. C'est le niveau qui fait apparaître le niveau 52-1 et 196-1.

### Level ID $00-$02 : les vrais niveaux bonus

Ces IDs sont utilisés par des sous-niveaux légitimes du jeu :

- **$00** : zone sous-marine de 5-2/6-2 (utilisé par H-1, 39-1)
- **$01** : l'eau de 2-2/7-2 (le Minus World, 36-1)
- **$02** : sous-niveau de 8-4 (136-1, 151-1, 215-1)

La différence entre un niveau "bonus" accessible normalement et un glitch world, c'est que les warp zones vérifient le monde actuel :

```asm
; Vérification warp zone (simplifié)
; Le jeu vérifie que le monde cible est entre 1 et 8
CheckWarp:
  lda TARGET_WORLD
  cmp #1
  bcc InvalidWarp       ; < 1 → refusé
  cmp #9
  bcs InvalidWarp       ; > 8 → refusé
  ; world valide entre 1 et 8 uniquement
  jmp DoWarp
```

Les glitch worlds avec des numéros > 8 ou 0 ne peuvent pas être atteints par des tuyaux normaux. Il faut le wall clip ou le cart swap.

## Pourquoi certains niveaux crash : les jump tables

Quand le jeu charge un objet tile, il utilise son type comme index dans une **jump table** :

```asm
; Jump table des objets tiles standards (types 0-11)
JumpTable_TileObjects:
  .word Obj_Special       ; type 0 : bloc ?, hidden, flagpole...
  .word Obj_Platform      ; type 1 : plateforme spéciale
  .word Obj_BrickRow      ; type 2 : rangée de briques
  .word Obj_BlockRow      ; type 3 : rangée de blocks
  .word Obj_CoinRow       ; type 4 : rangée de pièces
  .word Obj_BrickCol      ; type 5 : colonne de briques
  .word Obj_BlockCol      ; type 6 : colonne de blocks
  .word Obj_Pipe          ; type 7 : tuyau
  .word Obj_8             ; type 8
  .word Obj_9             ; type 9
  .word Obj_10            ; type 10
  .word Obj_11            ; type 11
```

![Les jump tables : pourquoi un type d'objet invalide fait crasher le jeu](/images/smb1-glitch-levels/v4-jump-table.jpg)

Si un objet a un type invalide (≥12), le jeu saute à un pointeur qui n'existe pas dans cette table. **4 outcomes possibles** :

1. **Pointeur valide** → l'objet se charge normalement
2. **Pointeur vers une autre jump table** (chevauchement) → un objet différent apparaît. Exemple : type 12 pointe vers la table Y=13, ce qui donne un L-pipe.
3. **Pointeur vers de l'exécutable** → exécution de code aléatoire (crash probable)
4. **Placeholder explicite (NOP)** → l'objet ne fait rien (certains sprites sont comme ça, produisant des ennemis qui volent sur place sans bouger)

![Glitch level ID $58 : le sprite pointer pointe vers une adresse invalide, le jeu crashe](/images/smb1-glitch-levels/v4-glitch-58-crash.jpg)

![Glitch level ID $50 : le cloud tunnel, un niveau généré par des données corrompues](/images/smb1-glitch-levels/v4-glitch-50.jpg)

La glitch level ID $58 (le tunnel qui crashe) : son sprite pointer pointe vers une région mémoire qui **n'existe pas sur NES sans mapper ROM**. Le jeu essaie de charger le même Koopa 5 fois par frame à la position (0,0), ce qui sature la PPU et provoque un freeze.

```asm
; Pourquoi ID $58 crashe :
; Sprite pointer → adresse invalide (hors espace NES standard)
; → Le jeu lit des bytes indéterminés comme des types de sprite
; → Le Koopa $00 (type invalide sans handler) boucle en appel récursif
; → Stack overflow 6502 → freeze
```

### Le paradoxe pipe warp

Rappelle-toi le check `target_world BETWEEN 1 AND 8`. Même si tu trouves un tuyau dans un glitch world, le jeu vérifie que le monde de destination est entre 1 et 8. Les glitch worlds ont des numéros > 8 (36-1, 255-1...), donc la warp échoue.

C'est aussi pour ça que le Minus World n'a pas de fin : le flagpole n'est pas présent dans les sprites, et les tuyaux ne mènent nulle part.

### Le trick des 5 objets dans une colonne

Il existe un edge case qui permet d'outrepasser la limite de 3 objets par colonne. Quand la queue se bloque (slots pleins + objet suivant avec next screen flag manquant), le jeu "prétraite" la colonne courante en boucle jusqu'à trouver un objet avec next screen flag. Pendant chaque prétraitement :

```asm
; Pendant le prétraitement de colonne :
; 1. Les objets dans la queue voient leur largeur restante
;    décrémentée à chaque "fausse avancée" de colonne
; 2. Si un objet atteint largeur=0, il quitte la queue
; 3. Un slot libéré peut être rempli par un nouvel objet
;    ajouté dans la même colonne

; Résultat : jusqu'à 5 objets peuvent être traités sur la même colonne.
; Technique : placer 2 objets qui traversent la screen boundary
; (slots 1 et 2), 1 objet dummy en X < précédent (bloque la queue),
; puis 3 objets à X=0 de l'écran suivant (dont un avec next screen flag).
```

C'est ce qu'on appelle un "queue skip" et c'est utilisé par certains romhackers pour créer des niveaux plus denses que ce que le format permet normalement.

## Les différences entre versions

### Famicom Disk System

La version FDS de SMB1 a une **memory map différente**. Tous les pointeurs de niveau sont décalés, mais les données sont les mêmes. Ce qui change : les indices des glitch worlds sont complètement différents :

```
FDS World 36 → Level ID $09 (eau version de 5-3)
  → Le flagpole est présent ! On peut finir le niveau.
  → Ensuite : $27 (7-3 normal) → $44 (4-4 underground)
  → $44 est finissable → la hache fonctionne → fin du jeu !
  
Le Minus World FDS est donc un "bonus world" qui peut mener
à la complétion du jeu, contrairement à la version NES.
```

Mon niveau FDS préféré : **ID $5F**, une version souterraine de la deuxième moitié de 3-3 en tunnel bas (dommage que ce soit un autoscroller).

### The Lost Levels (Super Mario Bros. 2 japonais)

Lost Levels change beaucoup de choses :

1. **Ordre identique tiles/sprites** : plus de Frankenstein levels (tiles et sprites chargent le même niveau même avec un ID invalide)
2. **Une seule table de pointeurs 16-bit** au lieu de deux tables séparées high/low
3. **4 fichiers disque** : la ROM a été splitée pour le FDS :
   - Fichier 1 : worlds 1-4
   - Fichier 2 : worlds 5-8
   - Fichier 3 : world 9 + sound engine
   - Fichier 4 : worlds A-D (table de pointeurs complètement différente)
4. **Même Level ID = 4 niveaux possibles** selon le fichier chargé
5. **Plus de glitch Tennis** : le continue option (continue au même monde après game over) rend le warm start inutile, et le jeu **reset immédiatement** si world > 9
6. **Nouveaux objets** : champignon poison, block invisible, block invisible fire flower, upside down pipes, vent -- mais insérés au milieu des listes existantes → **incompatibilité backward** avec SMB1
7. **Piranha Plants toujours rouges** après world 4, **springboards verts** seulement en worlds 2/B/3/C/7

### Super Mario All-Stars (SNES)

Portage direct avec les mêmes routines 6502 (le SNES exécute le code NES en mode compatible) :

- **Warp zone fixée** : plus de Minus World (entrer dans le tuyau gauche avant le texte mène au bon monde)
- **Plantage** : la plupart des glitch levels crashent (sauf ID $6A et 9-1)
- **Objets château ajoutés** : rendus plus uniques
- **Mais** : le **4-2 wrong warp** fonctionne encore (pas patché !)

### Le 4-2 wrong warp : un bug de placement d'objet

Dans 4-2, il y a deux objets de transition pipe : la vigne (warp zone) et le tuyau (coin cash room). Le premier objet de transition (celui de la vigne) est placé **bien avant** que la vigne n'apparaisse sur l'écran. Le deuxième (le tuyau) est placé **trop tard dans le niveau**.

```asm
; Timing des transitions dans 4-2 :
; Objet transition 1 (vigne → warp zone) : placé 3 écrans avant la vigne
; Objet transition 2 (tuyau → coin cash) : placé 1 écran après le tuyau
;
; Normalement le premier objet est désactivé avant que Mario
; n'atteigne le tuyau. Mais si Mario va vite (ou utilise
; le raccourci du bloc B+right), la transition de la vigne
; est toujours active quand il touche le tuyau !
; → Le jeu charge la warp zone au lieu du coin cash.
;
; Si l'objet avait été placé juste après la vigne mais avant
; le tuyau, le bug n'existerait pas.
```

### Les niveaux à boucle

Comment fonctionnent les loop (8-4, 7-4) ? Le niveau a des **checkpoints** avec des numéros d'écran et des positions Y hardcodés :

```asm
; Checkpoint : {screen_number, vertical_position}
; Si Mario passe ce checkpoint à la bonne hauteur → niveau continue
; Sinon → warp back de 4 écrans (64 blocks)
;
; Pour faire une boucle infinie : vertical_position = $F0
; (en dessous du bas de l'écran) → impossible de valider.
;
; Les checkpoints sont simples (un seul flag) sauf pour world 7
; qui utilise des triplets (3 flags, il faut en échouer au moins 1)
;
; Le warp back est rude : offset de tile data réglé à une valeur
; hardcodée, offset de sprite data remis à 0. Les ennemis présents
; sont déchargés instantanément → les firebars disparaissent.
```

## Changer le format, pas le code

Une des leçons les plus fascinantes de cette architecture, c'est que les développeurs de SMB1 ont réussi à créer un système de niveau très expressif sans jamais toucher au code de rendu 6502. Toute la variation entre les niveaux vient des **données** (pointeurs, objets, sprites, floor patterns), pas du code.

Les 256 glitch worlds existent parce que les **tables de pointeurs sont dimensionnées pour 128 entrées × 4 types**, et que le jeu ne valide jamais les valeurs qu'il lit. Quand un pointeur tombe en RAM, le jeu interprète les registres de Mario comme des tiles. Quand un pointeur tombe dans les données sonores, le jeu joue de la musique sous forme de level design. Et quand les jump tables overflowent, le jeu exécute n'importe quoi jusqu'au crash.

![More Super Mario Bros. Mechanics Explained -- la 4ème vidéo](/images/smb1-glitch-levels/yt-mechanics.jpg)

## Ce qu'on peut apprendre de tout ça

1. **Séparation tiles/sprites** : indépendance totale des deux couches, avec des ordres de stockage différents qui créent des Frankenstein levels uniques
2. **Compression RLE + système d'objets** : les niveaux ne sont pas des bitmaps mais des listes d'objets placés, avec des floor patterns pour le sol
3. **Queue 3 slots** : limite stricte du hardware (et du design de niveau)
4. **Pas de validation** : le jeu fait confiance aux pointeurs et aux jump tables, ce qui produit soit des glitchs jouables, soit des crashs
5. **256 bytes max** : la limite du Y register 6502, qui fait que les données se répètent si on va trop loin
6. **Warm start / cold start** : un système de "continuer" qui a ouvert la porte au cart swap Tennis → Mario

Le plus beau : tout ça, c'est du code 6502 qui tient dans 40KB. Pas de couche d'abstraction, pas de validation d'accès mémoire, pas de gestionnaire d'exceptions. Si le pointeur est pourri, le jeu crashe. Et les crashs, on les appelle des glitch worlds.

## Les 3 trucs à retenir

1. **Les glitch worlds sont des pointeurs qui tombent mal** -- Le jeu a 128 IDs × 4 types de zone, mais seulement 34 niveaux uniques. Quand le world number est corrompu (par Tennis ou wall clip), le jeu charge un pointeur conçu pour un autre niveau, et les 512 combinaisons possibles produisent des résultats imprévisibles.

2. **Le Minus World est un bug de warp combiné à de la corruption** -- Le tuyau gauche dans 1-2, si activé avant que le texte n'apparaisse, charge world 36 (0x24). Ce world pointe vers Level ID $01 (eau de 2-2), un niveau sans flagpole. Et comme il n'y a pas de transition pipe pour world 36, le niveau boucle à l'infini. L'absence de vérification crée l'icône.

3. **Tennis → Mario, 15 ans avant OoT → Paper Mario** -- La RAM du NES survit à un swap de cartouche grâce aux condensateurs et au système de warm start / cold start de SMB1. Le compteur de pas de Tennis (qui incrémente un byte RAM en jouant le son des pas) tombe pile sur l'adresse du world number. Il faut que les digits du top score restent à 0, que le byte $A5 soit intact, et que le jeu détecte un warm start -- un concours de circonstances parfait qui n'a fonctionné qu'avec Tennis.

Les vidéos originales de [Retro Game Mechanics Explained](https://www.youtube.com/c/RetroGameMechanicsExplained) sont un putain de travail de fourmi -- le niveau de détail sur la désassemble 6502, les maps automatiques de tous les niveaux, les explications du cart swap et du warm start. Si t'as pas vu la série, mate-la, elle est courte et chaque minute est dense.

Le code source des maps est dispo sur [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html), et le désassemble complet de SMB1 est open source sur plein de repos. Y'a 40 ans, des programmeurs japonais ont écrit ce système de niveau en 6502 avec zéro test unitaire et zéro bug tracker, et on continue d'apprendre des trucs en ouvrant leur code aujourd'hui.
