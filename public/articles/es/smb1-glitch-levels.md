---
title: "Super Mario Bros.: el formato de nivel, los punteros y los 256 glitch worlds"
description: "Cómo 128 niveles × 4 tipos de zona caben en 40KB de ROM, por qué existe el Minus World, y cómo un partido de Tennis de la NES puede cargar glitch worlds."
date: 2026-06-10
authors:
  - fox3000foxy
tags:
  - retro
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "l6lNeawRW60BvpFpDbbnlPse3iCNh6HuS2nBB6mgLIp6FQRq4EGaMMQJb2TsObVsZn86vyI3HEPcEPY4Tjd6iw=="
---

## Introducción

Super Mario Bros. son 40 kilobytes de ROM. Ocho mundos, 32 niveles, enemigos, música, power-ups, todo cabe ahí.

Pero si abres un emulador y tocas los bytes correctos, puedes cargar el nivel 36-1. O el 255-1. O aterrizar en un mundo donde todo está hecho de sprites de Bowser y tuberías que no llevan a ningún lado.

Estos glitch worlds existen por una razón simple: el sistema de almacenamiento de niveaux de SMB1 es una maravilla de optimización de 8 bits, y cuando obligas al juego a leer donde no debe, los resultados son fascinantes.

Retro Game Mechanics Explained hizo una serie de 4 vídeos sobre esto -- vamos a compilarlos en una sola inmersión en el código 6502 del juego más vendido de su época.

![GLITCH OBJECTS -- el título de la serie de RGMechEx sobre las mecánicas ocultas de SMB1](/images/smb1-glitch-levels/title-card.jpg)

![World 9-1 -- la pantalla de título del primer glitch world accesible mediante el cart swap de Tennis](/images/smb1-glitch-levels/v1-title-9-1.jpg)

## El warm start: por qué la RAM de Tennis sobrevive en SMB1

Antes de hablar del almacenamiento de niveles, hay que entender cómo arranca SMB1. Porque el glitch del cart swap de NES Tennis se basa completamente en el **sistema de detección warm start / cold start** del juego.

### Los 41 bytes preservados

Cuando SMB1 detecta un **cold start** (primera vez que se enciende o power off/on), borra toda la RAM. Pero cuando detecta un **warm start** (reset por botón, sin cortar la alimentación), preserva una zona de memoria de **41 bytes**:

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

Estos 41 bytes sirven para una sola funcionalidad: permitir al jugador **continuar en el mismo mundo tras un game over**. Si mueres en 6-3, el juego escribe el mundo 6 en el byte de arranque, y en la pantalla de título, si mantienes A + Start, recomienzas en 6-1.

![Los 41 bytes preservados en RAM durante un warm start -- TOP SCORE, MARIO SCORE, TIMER, WORLD SELECT, CONTINUE WORLD, y el byte mágico $A5](/images/smb1-glitch-levels/v1-memory-state.jpg)

### La doble verificación del warm start

![Cold start vs warm start -- el diagrama de detección del reset](/images/smb1-glitch-levels/v1-warm-start.jpg)

Cuando SMB1 arranca, no verifica un solo criterio sino **dos**:

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

![La verificación del byte $A5 y los dígitos del top score -- el corazón del warm start](/images/smb1-glitch-levels/v1-a5-byte.jpg)

¿Por qué una doble verificación? Porque el byte $A5 podría estar presente por casualidad (otro juego que deja ese valor, o el estado de reposo por defecto del chip RAM). Al verificar que los dígitos del top score son válidos (0-9), se asegura de que los datos son coherentes.

### Por qué Tennis es el único juego que funciona

Cuando insertas SMB1 por primera vez (cold start), el juego:
1. Borra toda la RAM → top score = 0, world byte = 0
2. Escribe $A5 en la dirección $0787

Luego, cambias a Tennis sin apagar la consola. Tennis:
- **No limpia la RAM al arrancar** (pocos juegos de NES lo hacen)
- **No escribe sobre los bytes del top score** → se quedan en 0 (válidos)
- **No toca el byte $A5** → sigue presente
- **Usa la dirección $075F** para el contador de pasos del jugador

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

Cuando vuelves a SMB1:
1. El byte $A5 sigue ahí (Tennis no lo tocó)
2. Los dígitos del top score siguen en 0 (válidos)
3. El world byte ahora vale 8+ (incrementado por los pasos de Tennis)
4. SMB1 detecta un warm start → preserva el world byte corrupto
5. Mantener A + Start → world 9-1, world A-1, world 36-1, etc.

### Por qué hay que arrancar Mario antes que Tennis

Un detalle: primero tienes que arrancar SMB1, luego Tennis, y luego SMB1 otra vez. Si empezaras directamente con Tennis, el byte $A5 nunca se escribiría (Tennis no escribe $A5), por lo que la detección del warm start fallaría y la RAM se borraría.

![El contador de pasos de Tennis: cada footstep incrementa el world byte](/images/smb1-glitch-levels/v1-footstep.jpg)

![Acceder a Glitch Worlds mediante NES Tennis -- el vídeo que explica el cart swap](/images/smb1-glitch-levels/yt-tennis.jpg)

## Cómo SMB1 almacena sus niveles en 40KB

Nintendo R&D4 tuvo que resolver un problema que parecía simple: representar niveles que se desplazan horizontalmente con tiles, enemigos, objetos, todo dentro de un presupuesto de ROM ultra ajustado.

La solución es una separación en dos capas de datos **completamente independientes**:

### El tile layout (el mapa del nivel)

Cada nivel está definido por un puntero hacia una estructura de tiles comprimida en ROM. La compresión es rudimentaria pero genial: un byte de "control" seguido de 1-3 bytes de datos.

El formato de tile usa un sistema de **runs** (tipo RLE):

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

Cada nivel contiene 13 líneas de 16 columnas de tiles (13×16 = 208 tiles visibles). Pero el formato comprimido permite reducirlo mucho más -- por ejemplo, el cielo y las columnas vacías casi no ocupan espacio.

El bucle de renderizado en 6502:

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

### El sprite layout (los enemigos y objetos)

Paralelamente, los enemigos y objetos (bloques ?, tuberías, goombas, koopas) se almacenan en una estructura completamente separada. Cada spawn está definido por 2 bytes:

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

Cada nivel puede referenciar hasta 5 páginas de sprites diferentes (bueno, 5 "pantallas" de 16 columnas), pero en la práctica la mayoría de niveles solo usan 2-3.

### La tabla de punteros

El genio del diseño es la tabla de punteros. Cada nivel se almacena como un **par** de direcciones ROM:

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

128 entradas por tabla. 4 tipos de zona. **512 combinaciones posibles**, pero solo una fracción es usada por el juego oficial. El resto son RAM no inicializada o datos que se interpretan como punteros.

Cuando el juego carga un nivel, hace esto:

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

Sin validación. Sin comprobar que el puntero es válido. El juego lee la dirección en la tabla y descomprime lo que se encuentra en esa dirección, punto final.

![Level ID $06 (Water) -- 9-1, la versión submarina de 6-2](/images/smb1-glitch-levels/lvl-06-9-1.png)

![La tabla de Level IDs: 128 entradas posibles, 34 asignadas](/images/smb1-glitch-levels/v2-level-id-table.jpg)

![El orden diferente de los punteros tiles y sprites -- la causa de los Frankenstein levels](/images/smb1-glitch-levels/v2-pointer-tables.jpg)

### Los 34 niveles únicos y el sistema de ID de 7 bits

![El chip RAM de la NES (MB8416A) -- es el que preserva los datos cuando se cambian las cartuchos](/images/smb1-glitch-levels/v1-ram-chip.jpg)

SMB1 no tiene 32 niveles, sino **34 niveles únicos**. Muchos niveles son duplicados (5-3 = 1-3 pero con Bullet Bills) marcados con un flag de "hard mode". Los verdaderos niveles únicos:

- **Agua** (Tipo 0): 3 niveles (2-2, 7-2, zona bonus 5-2/6-2)
- **Overworld** (Tipo 1): 22 niveles (incluyendo las 2 salas bonus de nubes)
- **Underground** (Tipo 2): 3 niveles (incluyendo las salas bonus subterráneas)
- **Castle** (Tipo 3): 6 niveles
- \+ 1 sala de cutscene (antes de los niveles subterráneos/agua)
- \+ 1 warp zone de 4-2

Cada nivel tiene un ID de **7 bits**. Los 5 bits menos significativos = número dentro del subgrupo, los 2 bits más significativos = tipo de zona:

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

**128 IDs posibles** ($00-$7F), solo 34 asignados a niveles reales. Los IDs sin usar apuntan a cualquier cosa.

### Las tablas de punteros: dos listas, dos órdenes

Los punteros tiles y sprites no se almacenan en el mismo orden. El código usa dos listas 16-bit separadas (high byte / low byte en dos tablas distintas):

```
Orden de los punteros sprites:
  Índice 0-5   : Castle (6 niveles)
  Índice 6-27  : Overworld (22 niveles)
  Índice 28-30 : Underground (3 niveles)
  Índice 31-33 : Water (3 niveles)

Orden de los punteros tiles:
  Índice 0-2   : Water (3 niveles)
  Índice 3-24  : Overworld (22 niveles)
  Índice 25-27 : Underground (3 niveles)
  Índice 28-33 : Castle (6 niveles)
```

¿Por qué órdenes diferentes? Sin razón técnica -- probablemente es así como se organizaron los datos durante el desarrollo. Pero crea una consecuencia fascinante: cuando un ID de nivel es inválido, los punteros tiles y sprites cargan niveles *diferentes*, creando **Frankenstein levels**.

Para navegar entre estas dos listas, el juego usa pequeñas **tablas de offset** (como una tabla de contenidos):

```asm
; Tables d'offset par type (Water, Overworld, Underground, Castle)
; Chaque entrée = index de début dans la liste correspondante

SpriteOffsetTable:
  .byte $1F, $06, $1C, $00    ; Water=31, Overworld=6, Underground=28, Castle=0

TileOffsetTable:
  .byte $00, $03, $19, $1C    ; Water=0, Overworld=3, Underground=25, Castle=28
```

Para cargar el nivel 6-2 (ID $23, Overworld número 3):

```asm
; 1. Type = 01 (Overworld) → index dans table d'offset = 1
; 2. Sprite offset = SpriteOffsetTable[1] = 6
;    Index final = 6 + 3 (numéro de niveau) = 9 → 10ème pointeur sprites
; 3. Tile offset = TileOffsetTable[1] = 3
;    Index final = 3 + 3 = 6 → 7ème pointeur tiles
; 4. Résultat : pointeur tiles $A619 + pointeur sprites $9ED0 = 6-2 ✓
```

Ahora, ¿qué pasa con un ID inválido como $43 (Underground número 3, que no existe)?

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

![Level ID $43 -- Frankenstein level: tiles 1-4 + sprites agua 5-2](/images/smb1-glitch-levels/lvl-43-frankenstein.png)

![Exploring Glitch Level Pointers -- las tablas de offset explicadas](/images/smb1-glitch-levels/yt-pointers.jpg)

![El world index table -- cuando el overflow de world 9 crea un glitch level](/images/smb1-glitch-levels/v2-world-index-table.jpg)

### El world index table: por qué world 9 desborda

Hay una tabla ROM de 8 bytes que da el índice del primer nivel de cada mundo (1-8). Y justo después, la tabla de los 36 Level IDs de todos los niveles en el orden de juego.

```asm
; WorldIndexTable (8 bytes)
  .byte 0, 5, 10, 15, 20, 25, 28, 33
;   -> Monde 1 commence au niveau 0
;   -> Monde 2 commence au niveau 5
;   -> Monde 8 commence au niveau 33

; LevelIDTable (36 bytes)
  .byte $25, $28, $29, $26, $24, ... ; les 36 Level IDs
```

Cuando intentas cargar world 9, el juego lee el 9º byte de WorldIndexTable... que no existe. Desborda 1 byte en LevelIDTable, lee el valor $25, luego usa $25 como índice en LevelIDTable (entrada 37) -- lo que desborda otra vez 2 bytes en SpriteOffsetTable, y lee el valor 6.

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

Para world G (16), el desbordamiento va aún más lejos y cae en el Level ID $01, que es el nivel cutscene que precede a 1-2:

```asm
; World G (16) :
;   WorldIndexTable[15] → lit $01 dans LevelIDTable
;   LevelIDTable[1] = $29 (cutscene 1-2)
;   → world G-1 = la cutscene d'entrée de 1-2
```

## Por qué existen los glitch worlds

El juego tiene 32 niveles "legítimos" (8 mundos × 4 niveles). Pero la tabla de punteros tiene 128 entradas por tipo de zona. Las entradas más allá del nivel 32 contienen lo que se encuentra en ROM en esas direcciones -- a veces otro nivel, a veces datos de sonido, a veces RAM, a veces cualquier cosa.

![Level ID $01 Water (Minus World) -- tile pointer $AE45, sprite pointer $A171](/images/smb1-glitch-levels/minus-world.png)

### Level ID $01 + AreaType 0 = Minus World

El más famoso de los glitch worlds. El Level ID $01 en AreaType 0 (agua) apunta a:

- **Tile pointer: $AE45** → la zona submarina de 2-2/7-2
- **Sprite pointer: $A171** → los sprites de 2-2/7-2

El resultado: un nivel de agua que parece 2-2, pero que se repite infinitamente porque el flagpole no existe. Sin fin de nivel, sin salida.

Es el nivel 36-1 (o 36-1 en el mundo $-1).

![El warm start check de SMB1 -- es el que permite que el Minus World exista](/images/smb1-glitch-levels/v4-minus-world.jpg)

```asm
; Pourquoi le flagpole manque dans le Minus World :
; Les sprites de 2-2/7-2 ($A171) n'ont pas de flagpole
; dans leur séquence. Le jeu cherche le sprite $FD (flagpole)
; mais ne le trouve jamais → boucle infinie
;
; Le jeu continue de générer le niveau à l'infini
; jusqu'à ce que le timer atteigne zéro.
```

### Los punteros que apuntan a la RAM

Cuando el tile pointer o el sprite pointer apuntan a una dirección en RAM ($00-$7F) en vez de ROM, el juego intenta interpretar los cambios constantes de la RAM como tiles:

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

Cuando la página cero cambia (porque Mario se mueve, porque el temporizador avanza, etc.), los "sprites" del nivel también cambian. Por eso algunos glitch worlds tienen enemigos que parpadean y se transforman constantemente.

![Level ID $03 Water -- sprite pointer $009D apunta a la RAM, nivel injugable](/images/smb1-glitch-levels/level-03-water.png)

### Level ID $36: el nivel vacío (Overworld)

Level ID $36 en Overworld:

- **Tile pointer: $AC35** (1-2)
- **Sprite pointer: $A0D8** (1-2)

Resultado: nada. El juego carga el nivel pero está marcado como "sin nivel" en el catálogo de RGMechEx. Los tiles quizás sean válidos pero los sprites apuntan a un lugar que produce un nivel vacío o no funcional.

### Level ID $1D (Castle): el campeón de los crashes

Level ID $1D en Castle:

- **Tile pointer: $A210** (4-4)
- **Sprite pointer: $7EA0** (¡RAM!)

Sprite pointer en RAM = sprites indefinidos. El juego intenta mostrar un Spiny ball o un Bullet Bill blaster en la primera línea de tiles. Se crashea inmediatamente.

```asm
; Quand le sprite pointer pointe vers la RAM,
; le jeu décompresse des bytes qui changent tout le temps
; comme des instructions "spawn". Le résultat :
; - Apparition d'objets inexistants (valeur undefined)
; - Crash PPU quand le sprite NES essaie d'afficher un tile invalide
; - Freeze complet de la console
```

## Los 256 glitch worlds catalogados

RGMechEx escribió un script que genera los mapas de **todos los niveles**, para los 4 tipos de zona, y los 128 IDs de cada uno.

El contador de mundos es de 8 bits (0-255). Los mundos 1-8 son legítimos. Quedan **248 glitch worlds** potenciales. Cada glitch world corresponde al primer nivel de ese mundo, y su Level ID se calcula por el mecanismo de desbordamiento de la WorldIndexTable.

![Tabla de glitch worlds -- 248 mundos corruptos, 68 primeros niveles accesibles](/images/smb1-glitch-levels/v3-glitch-worlds-table.jpg)

De los 128 IDs posibles, solo **68 son el "primer nivel" de un mundo** (accesibles a través del número de glitch world). Los otros 60 son niveles 2+ o inaccesibles.

| Tipo | IDs únicos jugables | IDs que crashean | IDs vacíos |
|------|---------------------|-------------------|-----------|
| Water (0)    | ~20  | ~60  | ~48  |
| Overworld (1)| ~30  | ~55  | ~43  |
| Underground (2) | ~15 | ~65 | ~48  |
| Castle (3)   | ~25  | ~58  | ~45  |

Muchos IDs llevan al mismo nivel porque los punteros caen en las mismas direcciones ROM. El Level ID $28 (Overworld) por ejemplo -- tile pointer $A7CD (2-1) -- aparece en **38 glitch worlds diferentes**, porque su sprite pointer $9F51 apunta a una zona de la ROM que se usa como padding/datos de sonido reutilizados por muchos IDs.

![Mapa del nivel ID $28 (Overworld) -- tiles de 2-1 con sprites normales, 38 glitch worlds](/images/smb1-glitch-levels/level-28-overworld.png)

![Super Mario Bros. Glitch Levels Explained -- el tercer vídeo](/images/smb1-glitch-levels/yt-levels.jpg)

### Los 6 glitch levels realmente únicos

De los 19 IDs de glitch level accesibles, solo **6 no crashean inmediatamente** al cargar:

| World | Level ID | Descripción |
|-------|----------|-------------|
| E-1 (224) | $50 | Un solo ? block sobre un abismo. Mario muere al instante. |
| W | $57 | Mario spawne bloqueado, incapaz de moverse. |
| 42 (133) | $50 | Túnel de nubes que atrapa a Mario si va demasiado lejos. |
| 62 (131, 240) | $4D | Castillo helado: Mario spawna arriba, no puede caer → bloqueado. |
| 127 | $4B | Túnel subterráneo, pero crashea si vas demasiado lejos. |
| 137 | $4B | Activa el auto-scroll de las cutscenes. Mario encuentra un único brick block que lo bloquea para siempre. |

![Level ID $50 (túnel de nubes) -- el glitch world 42-1 y E-1](/images/smb1-glitch-levels/lvl-50-cloud.png)
![Level ID $4D (castillo) -- world 62-1, Mario bloqueado al spawn](/images/smb1-glitch-levels/lvl-4D-castle.png)
![Level ID $4B (túnel) -- world 127-1, crashea si vas demasiado lejos](/images/smb1-glitch-levels/lvl-4B-tunnel.png)

Seis glitch worlds de 248 que producen algo realmente nuevo. El resto son niveles normales con el tipo de zona equivocado, o pantallas negras.

## El formato de los niveles en detalle

Vamos al formato exacto de los datos de nivel, para entender por qué los glitch levels se sostienen (o no).

### El header del nivel: 2 bytes, 6 propiedades

Cada nivel comienza con un header de 2 bytes que controla 6 propiedades:

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

El tipo modifier controla variaciones visuales: las olas en la parte superior de los niveles de agua, el fondo de ladrillos de 8-3, la paleta de noche de 4-3, la nieve de 6-2, etc.

### Los objetos tile: 2 bytes, Next Screen Flag, cola de 3 slots

Después del header viene una lista de **objetos tile**, cada objeto ocupa 2 bytes. El byte $FD marca el final de la lista.

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

Cuando el bit "next screen" está activo, la columna de trabajo actual se incrementa en 1. Esto permite colocar objetos más allá de las primeras 16 columnas. Los objetos deben listarse **en orden** (izquierda a derecha) porque el juego los carga secuencialmente:

```asm
; La routine de chargement a DEUX phases par colonne :
; Phase 1 : chercher les nouveaux objets qui commencent sur cette colonne
;            et les ajouter à la file d'attente (queue)
; Phase 2 : traiter chaque objet dans la queue en dessinant les tiles,
;            et retirer ceux qui finissent sur cette colonne
```

La cola tiene exactamente **3 slots**. Consecuencia directa: no puedes tener más de 3 objetos que comiencen en la misma columna. Si la cola está llena, el 4º objeto se ignora y nunca se cargará.

Por eso los niveles bien diseñados evitan apilar demasiados objetos. Ejemplo en 1-2: la columna con el 1up block en el techo + los ladrillos de al lado se dividen en dos objetos distintos para respetar el límite de 3.

### Y posición especial: 12, 13, 14, 15

Cuando Y=12, el objeto no tiene posición Y (está hardcodeada por tipo):

```asm
; Y=12 : objets sans Y position
;   Type 0 : trou (supprime le sol)
;   Type 1 : rope de plateforme mobile
;   Types 2-4 : ponts à Y fixe
;   Type 5 : trou avec eau/lave
;   Types 6-7 : rangées de ? blocks
```

Cuando Y=13, dos subgrupos. Si el bit 6 del byte 1 está en 1:

```asm
; Y=13, bit6=1 : objets spéciaux
;   0 = L-pipe (cutscene), 1 = flagpole, 2-3 = pont/axe/hamer (fin château)
;   4 = stop screen, 5 = random enemies, 6 = loop level, 7+ = crash possible
```

Si bit6=0, los 5 bits menos significativos codifican un **screen skip** (saltar directamente a una pantalla N, sin pasar por el next screen flag uno a uno).

Cuando Y=14: mismo principio con bit6=1 para cambiar el tipo modifier, bit6=0 para cambiar el fondo + el patrón de suelo.

### Los floor patterns: 16 patrones de suelo

El suelo de los niveles no está hecho de objetos individuales. SMB1 usa **floor patterns**, un patrón de fondo que se aplica a todas las columnas hasta el próximo cambio:

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

Por eso los agujeros son objetos: sobreescriben el floor pattern en una columna específica, sin tener que cambiar el patrón para todo lo demás.

### El límite de 256 bytes y el repeat

Todos los datos tile de un nivel caben en **256 bytes máximo**. El registro Y del 6502 se usa como índice, y tiene 8 bits. Si el juego llega al final de los datos sin encontrar el byte $FD, **vuelve al principio** y repite los 256 bytes infinitamente:

```asm
; Index Y = 8 bits → max 256 bytes de données tiles
; Si Y overflow (255 → 0) sans rencontrer $FD → repeat
; Même chose pour les sprites, mais les objets pipe (3 bytes)
; décalent la parité de l'index à chaque chargement.
```

Algunos glitch levels aprovechan este repeat para generar niveles que duran "indefinidamente".

### El sistema de sprites: 2 bytes + transiciones de pipe

Los sprites siguen un formato similar, pero sin header y con algunas diferencias clave. El byte $FF marca el final de la lista.

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

El bit menos significativo del byte 1 es el **hard level flag**: si está en 1, el sprite solo aparece en niveles ≥ 5-3. Así se crean los niveles "hard mode".

Y posición 15 = **screen skip** (igual que los tiles). Y posición 14 = **transición de pipe** (3 bytes):

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

Los sprites **no tienen un sistema de cola**. La única limitación es que no puede haber más de 4 sprites cargados simultáneamente en la zona de spawn (justo fuera de la pantalla a la derecha). Más allá, los sprites se ignoran.

## Cómo acceder a los glitch worlds

Hay dos métodos principales.

### El método clásico: el wall clip

El wall clip (pasar a través de las paredes) permite salir del nivel normal y caminar hasta la warzone oculta. Manipulando el contador de mundos a través de la RAM, puedes cargar cualquier Level ID.

La técnica:
1. World 1-2: ir a la tubería de salida oculta
2. Hacer el wall clip en la pared de la derecha
3. Caminar en el vacío hasta la zona warp
4. El juego interpreta los valores como mundos

Pero este método solo da acceso a una pequeña parte de los glitch worlds.

### El método extremo: NES Tennis cart swap

Mira la sección "El warm start" más arriba para el detalle completo. En resumen: el contador de pasos de Tennis escribe en el mismo byte RAM que el mundo de partida de SMB1, y la detección del warm start preserva ese valor.

### El rincón de los truquistas: el código para explorar todo

Si quieres explorar todos los glitch tú mismo en un emulador, puedes parchear el Level ID directamente:

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

RGMechEx publicó la lista completa de 128 niveles × 4 tipos con mapas generados automáticamente en [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html). Cada entrada muestra el tile pointer, el sprite pointer, y un mapa visual del nivel.

## Los niveles más WTF

### Level ID $1F (Water): 15 glitch worlds en uno

El tile pointer $A302 (3-4) combinado con el sprite pointer $02A0 produce 15 glitch worlds diferentes (D-1, J-1, Y-1, Z-1, 55-1, 73-1...). Explicación: el sprite pointer apunta a una zona de la ROM que contiene datos lo suficientemente cercanos a sprites válidos para producir resultados jugables, pero la combinación de tiles de castillo de 3-4 con sprites de overworld crea un render absurdo.

### Level ID $28 (Overworld): 38 glitch worlds = récord

El récord absoluto. 38 entradas de glitch world apuntan al mismo nivel (tiles de 2-1 + $9F51 sprites). ¿Por qué? Porque el sprite pointer $9F51 cae en una zona de la ROM que se usa como padding/datos de sonido reutilizados por muchos IDs.

### Level ID $49 (Underground): el nivel FDS

Tile pointer $76AE + sprite pointer $1C9D. El tile pointer apunta a la zona de la ROM reservada para la versión Famicom Disk System. Resultado: un nivel con tiles que no existen en la cartucho estándar. Es el nivel que hace aparecer el nivel 52-1 y 196-1.

### Level ID $00-$02: los verdaderos niveles bonus

Estos IDs son usados por subniveles legítimos del juego:

- **$00**: zona submarina de 5-2/6-2 (usado por H-1, 39-1)
- **$01**: el agua de 2-2/7-2 (el Minus World, 36-1)
- **$02**: subnivel de 8-4 (136-1, 151-1, 215-1)

La diferencia entre un nivel "bonus" accesible normalmente y un glitch world, es que las warp zones verifican el mundo actual:

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

Los glitch worlds con números > 8 o 0 no pueden alcanzarse por tuberías normales. Hace falta el wall clip o el cart swap.

## Por qué algunos niveles crashean: las jump tables

Cuando el juego carga un objeto tile, usa su tipo como índice en una **jump table**:

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

![Las jump tables: por qué un tipo de objeto inválido hace crashear el juego](/images/smb1-glitch-levels/v4-jump-table.jpg)

Si un objeto tiene un tipo inválido (≥12), el juego salta a un puntero que no existe en esta tabla. **4 resultados posibles**:

1. **Puntero válido** → el objeto se carga normalmente
2. **Puntero a otra jump table** (superposición) → aparece un objeto diferente. Ejemplo: tipo 12 apunta a la tabla Y=13, lo que produce un L-pipe.
3. **Puntero a código ejecutable** → ejecución de código aleatorio (crash probable)
4. **Placeholder explícito (NOP)** → el objeto no hace nada (algunos sprites son así, produciendo enemigos que vuelan en el sitio sin moverse)

![Glitch level ID $58: el sprite pointer apunta a una dirección inválida, el juego crashea](/images/smb1-glitch-levels/v4-glitch-58-crash.jpg)

![Glitch level ID $50: el cloud tunnel, un nivel generado por datos corruptos](/images/smb1-glitch-levels/v4-glitch-50.jpg)

El glitch level ID $58 (el túnel que crashea): su sprite pointer apunta a una región de memoria que **no existe en la NES sin mapper ROM**. El juego intenta cargar el mismo Koopa 5 veces por frame en la posición (0,0), lo que satura la PPU y provoca un freeze.

```asm
; Pourquoi ID $58 crashe :
; Sprite pointer → adresse invalide (hors espace NES standard)
; → Le jeu lit des bytes indéterminés comme des types de sprite
; → Le Koopa $00 (type invalide sans handler) boucle en appel récursif
; → Stack overflow 6502 → freeze
```

### La paradoja del pipe warp

Recuerda el check `target_world BETWEEN 1 AND 8`. Incluso si encuentras una tubería en un glitch world, el juego verifica que el mundo de destino esté entre 1 y 8. Los glitch worlds tienen números > 8 (36-1, 255-1...), por lo que la warp falla.

Por eso también el Minus World no tiene fin: el flagpole no está presente en los sprites, y las tuberías no llevan a ningún lado.

### El truco de los 5 objetos en una columna

Existe un edge case que permite sobrepasar el límite de 3 objetos por columna. Cuando la cola se bloquea (slots llenos + siguiente objeto con next screen flag faltante), el juego "preprocesa" la columna actual en bucle hasta encontrar un objeto con next screen flag. Durante cada preprocesamiento:

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

Esto se llama un "queue skip" y es usado por algunos romhackers para crear niveles más densos de lo que el formato permite normalmente.

## Las diferencias entre versiones

### Famicom Disk System

La versión FDS de SMB1 tiene un **mapa de memoria diferente**. Todos los punteros de nivel están desplazados, pero los datos son los mismos. Lo que cambia: los índices de los glitch worlds son completamente diferentes:

```
FDS World 36 → Level ID $09 (eau version de 5-3)
  → Le flagpole est présent ! On peut finir le niveau.
  → Ensuite : $27 (7-3 normal) → $44 (4-4 underground)
  → $44 est finissable → la hache fonctionne → fin du jeu !
  
Le Minus World FDS est donc un "bonus world" qui peut mener
à la complétion du jeu, contrairement à la version NES.
```

Mi nivel FDS favorito: **ID $5F**, una versión subterránea de la segunda mitad de 3-3 en túnel bajo (qué pena que sea un autoscroller).

### The Lost Levels (Super Mario Bros. 2 japonés)

Lost Levels cambia muchas cosas:

1. **Orden idéntico tiles/sprites**: sin más Frankenstein levels (tiles y sprites cargan el mismo nivel incluso con un ID inválido)
2. **Una sola tabla de punteros 16-bit** en vez de dos tablas separadas high/low
3. **4 archivos de disco**: la ROM se dividió para el FDS:
   - Archivo 1: mundos 1-4
   - Archivo 2: mundos 5-8
   - Archivo 3: world 9 + motor de sonido
   - Archivo 4: mundos A-D (tabla de punteros completamente diferente)
4. **Mismo Level ID = 4 niveles posibles** según el archivo cargado
5. **Sin más glitch Tennis**: la opción continue (continuar en el mismo mundo tras game over) hace innecesario el warm start, y el juego **resetea inmediatamente** si world > 9
6. **Nuevos objetos**: champiñón venenoso, bloque invisible, bloque invisible fire flower, tuberías al revés, viento -- pero insertados en medio de las listas existentes → **incompatibilidad backward** con SMB1
7. **Piranha Plants siempre rojas** tras world 4, **springboards verdes** solo en worlds 2/B/3/C/7

### Super Mario All-Stars (SNES)

Puerto directo con las mismas rutinas 6502 (el SNES ejecuta el código de la NES en modo compatible):

- **Warp zone arreglada**: sin más Minus World (entrar en la tubería izquierda antes del texto lleva al mundo correcto)
- **Planteamiento**: la mayoría de glitch levels crashean (excepto ID $6A y 9-1)
- **Objetos de castillo añadidos**: renders más únicos
- **Pero**: el **4-2 wrong warp** sigue funcionando (¡sin parchear!)

### El 4-2 wrong warp: un bug de posicionamiento de objetos

En 4-2, hay dos objetos de transición de pipe: la enredadera (warp zone) y la tubería (sala de monedas). El primer objeto de transición (el de la enredadera) está posicionado **mucho antes** de que la enredadera aparezca en pantalla. El segundo (la tubería) está posicionado **demasiado tarde en el nivel**.

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

### Los niveles con bucle

¿Cómo funcionan los loops (8-4, 7-4)? El nivel tiene **checkpoints** con números de pantalla y posiciones Y hardcodeadas:

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

## Cambiar el formato, no el código

Una de las lecciones más fascinantes de esta arquitectura es que los desarrolladores de SMB1 lograron crear un sistema de nivel muy expresivo sin tocar nunca el código de renderizado 6502. Toda la variación entre los niveles viene de los **datos** (punteros, objetos, sprites, floor patterns), no del código.

Los 256 glitch worlds existen porque las **tablas de punteros están dimensionadas para 128 entradas × 4 tipos**, y el juego nunca valida los valores que lee. Cuando un puntero cae en RAM, el juego interpreta los registros de Mario como tiles. Cuando un puntero cae en los datos de sonido, el juego toca música en forma de level design. Y cuando las jump tables desbordan, el juego ejecuta cualquier cosa hasta el crash.

![Más Super Mario Bros. Mechanics Explained -- el cuarto vídeo](/images/smb1-glitch-levels/yt-mechanics.jpg)

## Lo que podemos aprender de todo esto

1. **Separación tiles/sprites**: independencia total de las dos capas, con órdenes de almacenamiento diferentes que crean Frankenstein levels únicos
2. **Compresión RLE + sistema de objetos**: los niveles no son bitmaps sino listas de objetos colocados, con floor patterns para el suelo
3. **Cola de 3 slots**: límite estricto del hardware (y del diseño de nivel)
4. **Sin validación**: el juego confía en los punteros y las jump tables, lo que produce o glitchs jugables o crashes
5. **256 bytes máx**: el límite del registro Y del 6502, que hace que los datos se repitan si vas demasiado lejos
6. **Warm start / cold start**: un sistema de "continuar" que abrió la puerta al cart swap Tennis → Mario

Lo mejor de todo esto: es código 6502 que cabe en 40KB. Sin capa de abstracción, sin validación de acceso a memoria, sin gestor de excepciones. Si el puntero es una porquería, el juego crashea. Y a los crashes los llamamos glitch worlds.

## Los 3 puntos clave para recordar

1. **Los glitch worlds son punteros que caen mal** -- El juego tiene 128 IDs × 4 tipos de zona, pero solo 34 niveles únicos. Cuando el world number está corrupto (por Tennis o wall clip), el juego carga un puntero diseñado para otro nivel, y las 512 combinaciones posibles producen resultados impredecibles.

2. **El Minus World es un bug de warp combinado con corrupción** -- La tubería izquierda en 1-2, si se activa antes de que aparezca el texto, carga world 36 (0x24). Este world apunta al Level ID $01 (agua de 2-2), un nivel sin flagpole. Y como no hay transición de pipe para world 36, el nivel se repite infinitamente. La falta de verificación crea el icono.

3. **Tennis → Mario, 15 años antes de OoT → Paper Mario** -- La RAM de la NES sobrevive a un swap de cartucho gracias a los condensadores y al sistema de warm start / cold start de SMB1. El contador de pasos de Tennis (que incrementa un byte RAM al sonar el paso) cae justo en la dirección del world number. Los dígitos del top score tienen que seguir en 0, el byte $A5 tiene que estar intacto, y el juego tiene que detectar un warm start -- un concursal de circunstancias perfecto que solo funcionó con Tennis.

Los vídeos originales de [Retro Game Mechanics Explained](https://www.youtube.com/c/RetroGameMechanicsExplained) son un trabajo de hormiga impresionante -- el nivel de detalle en el desensamblado 6502, los mapas automáticos de todos los niveles, las explicaciones del cart swap y del warm start. Si no has visto la serie, mírala, es corta y cada minuto es denso.

El código fuente de los mapas está disponible en [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html), y el desensamblado completo de SMB1 es open source en muchos repos. Hace 40 años, programadores japoneses escribieron este sistema de nivel en 6502 con cero tests unitarios y cero bug tracker, y seguimos aprendiendo cosas al abrir su código hoy.
