---
title: "Super Mario Bros.: el formato de nivel, los punteros y los 256 glitch worlds"
description: "Cómo 128 niveles × 4 tipos de zona caben en 40KB de ROM, por qué existe el Minus World, y cómo un match de Tenis NES puede cargar glitch worlds."
date: 2026-06-10
tags:
  - retro
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "ZWinmHr9+oxJpflZPafjUetTjD2ywTCWBXNIAnFmsKQSBKKwEhmyPJ8IjCx24g1h0fYlQl8QtWDahkVzB2dYNw=="
---

## Introducción

Super Mario Bros. son 40 kilobytes de ROM. Ocho mundos, 32 niveles, enemigos, música, power-ups, todo cabe ahí.

Pero si abres un emulador y trasteas los bytes buenos, puedes cargar el nivel 36-1. O el 255-1. O aterrizar en un mundo donde todo está hecho de sprites de Bowser y tuberías que no llevan a ninguna parte.

Esos glitch worlds existen por una razón simple: el sistema de almacenamiento de niveles de SMB1 es una maravilla de optimización 8-bit, y cuando fuerzas el juego a leer donde no debe, da resultados fascinantes.

Retro Game Mechanics Explained hizo una serie de 4 vídeos sobre eso: vamos a compilarla en una sola inmersión en el código 6502 del juego más vendido de su época.

![GLITCH OBJECTS: el título de la serie RGMechEx sobre las mecánicas ocultas de SMB1](/images/smb1-glitch-levels/title-card.jpg)

![World 9-1: la pantalla título del primer glitch world accesible vía el cart swap Tennis](/images/smb1-glitch-levels/v1-title-9-1.jpg)

## El warm start: por qué la RAM de Tennis sobrevive en SMB1

Antes de hablar de almacenamiento de niveles, hay que entender cómo arranca SMB1. Porque el glitch del cart swap NES Tennis se apoya por entero en el **sistema de detección warm start / cold start** del juego.

### Los 41 bytes preservados

Cuando SMB1 detecta un **cold start** (primer encendido o apagado/encendido), borra toda la RAM. Pero cuando detecta un **warm start** (botón reset, sin corte de alimentación), preserva una zona de memoria de **41 bytes**:

```asm
; Los 41 bytes preservados en RAM en un warm start
; Direcciones $075F-$0787
;
; $075F : byte de arranque (world - 1)    [1 byte]
; $0760 : flag de selección de mundo (botón B) [1 byte]
; $0761-$0762 : sin usar                    [2 bytes]
; $0763-$0768 : timer (6 dígitos, 3 mostrados) [6 bytes]
; $0769-$076E : monedas Luigi                   [6 bytes]
; $076F-$0774 : monedas Mario                   [6 bytes]
; $0775-$077A : puntuación Luigi                   [6 bytes]
; $077B-$0780 : puntuación Mario                   [6 bytes]
; $0781-$0786 : top score (6 dígitos, 1 oculto) [6 bytes]
; $0787 : el byte mágico $A5                 [1 byte]
```

Esos 41 bytes sirven a una sola función: permitir al jugador **continuar en el mismo mundo tras un game over**. Si mueres en 6-3, el juego escribe el mundo 6 en el byte de arranque, y en la pantalla título, si mantienes A + Start, recomienzas en 6-1.

![Los 41 bytes preservados en RAM en un warm start: TOP SCORE, MARIO SCORE, TIMER, WORLD SELECT, CONTINUE WORLD, y el byte mágico $A5](/images/smb1-glitch-levels/v1-memory-state.jpg)

### La doble comprobación del warm start

![Cold start vs warm start: el diagrama de detección del reset](/images/smb1-glitch-levels/v1-warm-start.jpg)

Cuando SMB1 arranca, no comprueba un solo criterio sino **dos**:

```asm
CheckWarmStart:
  ; 1. Comprobar el byte mágico $A5 en $0787
  lda $0787
  cmp #$A5
  bne ColdStart        ; no $A5 → cold start

  ; 2. Comprobar los 6 dígitos del top score ($0781-$0786)
  ;    Cada dígito tiene que estar entre 0 y 9
  ldx #0
CheckLoop:
  lda $0781,x
  cmp #$0A
  bcs ColdStart        ; dígito >= 10 → cold start
  inx
  cpx #6
  bne CheckLoop

  ; Si ambas condiciones pasan → warm start
  ; La RAM no se borra, el mundo de arranque se preserva
  jmp WarmStartBoot
```

![La comprobación del byte $A5 y los dígitos del top score: el corazón del warm start](/images/smb1-glitch-levels/v1-a5-byte.jpg)

¿Por qué una doble comprobación? Porque el byte $A5 podría estar presente por azar (otro juego que deja ese valor, o el estado de reposo por defecto del chip RAM). Comprobando que los dígitos del top score son válidos (0-9), nos aseguramos de que los datos son coherentes.

### Por qué Tennis es el único juego que funciona

Cuando insertas SMB1 por primera vez (cold start), el juego:
1. Borra toda la RAM → top score = 0, world byte = 0
2. Escribe $A5 en la dirección $0787

Después, cambias a Tennis sin apagar la consola. Tennis:
- **No limpia la RAM al arrancar** (pocos juegos NES lo hacen)
- **No escribe sobre los bytes del top score** → quedan a 0 (válidos)
- **No toca el byte $A5** → sigue presente
- **Usa la dirección $075F** para el contador de pasos del jugador

```asm
; El incremento de pasos en Tennis:
; A cada paso del jugador en la pista, Tennis incrementa el byte en $075F.
; Ese mismo byte lo usa SMB1 como "número de mundo - 1".
;
; 0 pasos  → world 0 → SMB1 = world 1
; 1-7 pasos → world 1-7 → mundos normales
; 8+ pasos → world 8+ → ¡glitch worlds!
;
; El contador solo se incrementa cuando la música se para
; (los sonidos de pasos no suenan durante la música).
```

Cuando vuelves a meter SMB1:
1. El byte $A5 sigue ahí (Tennis no lo tocó)
2. Los dígitos del top score siguen a 0 (válidos)
3. El world byte ahora vale 8+ (incrementado por los pasos de Tennis)
4. SMB1 detecta un warm start → preserva el world byte corrupto
5. Mantener A + Start → world 9-1, world A-1, world 36-1, etc.

### Por qué hay que arrancar Mario antes que Tennis

Una sutileza: hay que arrancar primero SMB1, luego Tennis, luego SMB1 otra vez. Si empezaras directamente por Tennis, el byte $A5 nunca se escribiría (Tennis no escribe $A5), así que la detección warm start fallaría y la RAM se borraría.

![El contador de pasos de Tennis: cada footstep incrementa el world byte](/images/smb1-glitch-levels/v1-footstep.jpg)

![Access Glitch Worlds via NES Tennis: el vídeo que explica el cart swap](/images/smb1-glitch-levels/yt-tennis.jpg)

## Cómo SMB1 guarda sus niveles en 40KB

Nintendo R&D4 tuvo que resolver un problema simple en apariencia: representar niveles que hacen scroll horizontal con tiles, enemigos, items, todo en un presupuesto ROM ultrarrecortado.

La solución es una separación en dos capas de datos **por completo independientes**:

### El tile layout (el mapa del nivel)

Cada nivel se define con un puntero hacia una estructura de tiles comprimida en ROM. La compresión es rudimentaria pero genial: un byte "control" seguido de 1-3 bytes de datos.

El formato tile usa un sistema de **runs** (tipo RLE):

```asm
; Formato tile SMB1 (simplificado)
; Cada "comando" es un byte control:
;
; $00-$7F : pone un tile, avanza 1 columna
; $80-$BF : pone un tile repetido N veces (N = byte - $80 + 1)
; $C0-$FF : comando especial (fin de línea, salto, cambio de paleta)

Ejemplo : para dibujar 3 ladrillos consecutivos :
  $82 $01    ; repite el tile $01 (brick) 3 veces
```

Cada nivel contiene 13 líneas de 16 columnas de tiles (13×16 = 208 tiles visibles). Pero el formato comprimido permite bajar mucho más: por ejemplo, el cielo y las columnas vacías casi no ocupan sitio.

El bucle de render en 6502:

```asm
; Descompresión tile - loop principal
; Entrada : puntero tile_data en $XX
; Salida : tilemap nivel en la RAM PPU

DecompressTile:
  lda (tile_ptr),y      ; leer byte control
  iny
  cmp #$80
  bcc SingleTile        ; $00-$7F : tile único
  cmp #$C0
  bcc RunLength         ; $80-$BF : run-length
  jmp SpecialCommand    ; $C0-$FF : comando especial

SingleTile:
  sta PPU_DATA          ; escribir el tile directamente
  jmp Next

RunLength:
  sec
  sbc #$7E              ; N = control - $7E
  tax
  lda (tile_ptr),y      ; leer el tile a repetir
  iny
: sta PPU_DATA
  dex
  bne :-
  jmp Next
```

### El sprite layout (los enemigos y objetos)

En paralelo, los enemigos y objetos (bloques ?, tuberías, goombas, koopas) se guardan en una estructura por completo separada. Cada spawn se define con 2 bytes:

```asm
; Formato sprite SMB1
; Byte 0 : posición X (en columnas)
; Byte 1 : tipo de sprite + bits de página Y
; Y se deriva del índice en la secuencia

Una secuencia de sprites :
  $01 $4B    ; goomba en la columna 1
  $09 $4B    ; goomba en la columna 9
  $10 $61    ; bloque ? en la columna 16 (contiene moneda)
  $15 $54    ; koopa verde en la columna 21
  $FF        ; fin de secuencia
```

Cada nivel puede referenciar hasta 5 páginas de sprites distintas (en fin, 5 "screens" de 16 columnas), pero en la práctica la mayoría de los niveles solo usa 2-3.

### La tabla de punteros

La genialidad del diseño es la tabla de punteros. Cada nivel se guarda como un **par** de direcciones ROM:

```c
// Estructura interna (simplificada) del World Map
struct LevelPointer {
    uint16_t tile_ptr;   // Dirección ROM de los datos tiles
    uint16_t sprite_ptr; // Dirección ROM de los datos sprites
};

// 4 tablas separadas, una por AreaType :
// 0 = Water, 1 = Overworld, 2 = Underground, 3 = Castle
LevelPointer level_table[4][128];
```

128 entradas por tabla. 4 tipos de zona. **512 combinaciones posibles**, pero solo una fracción la usa el juego oficial. El resto es RAM sin inicializar o datos que se interpretan como punteros.

Cuando el juego carga un nivel, hace eso:

```asm
; Carga de un nivel
; A = AreaType (0-3), X = LevelID (0-127)

LoadLevel:
  sta AREA_TYPE
  asl                  ; *2 para offset en tabla 16-bit
  tax
  lda LevelTable_TilePtr, x
  sta TILE_PTR
  lda LevelTable_TilePtr+1, x
  sta TILE_PTR+1       ; puntero hacia los tiles
  lda LevelTable_SpritePtr, x
  sta SPRITE_PTR
  lda LevelTable_SpritePtr+1, x
  sta SPRITE_PTR+1     ; puntero hacia los sprites
  jsr DecompressTiles
```

El juego concede una confianza total a los punteros: lee la dirección en la tabla y descomprime lo que hay en esa dirección, punto final.

![Level ID $06 (Water): 9-1, la versión submarina de 6-2](/images/smb1-glitch-levels/lvl-06-9-1.png)

![La tabla de los Level IDs: 128 entradas posibles, 34 asignadas](/images/smb1-glitch-levels/v2-level-id-table.jpg)

![El orden distinto de los punteros tiles y sprites: la causa de los Frankenstein levels](/images/smb1-glitch-levels/v2-pointer-tables.jpg)

### Los 34 niveles únicos y el sistema de ID 7-bit

![El chip RAM de la NES (MB8416A): él conserva los datos cuando cambiamos los cartuchos](/images/smb1-glitch-levels/v1-ram-chip.jpg)

SMB1 no tiene 32 niveles, sino **34 niveles únicos**. Muchos niveles son duplicados (5-3 = 1-3 pero con Bullet Bills) marcados con una bandera "hard mode". Los verdaderos niveles únicos:

- **Agua** (Tipo 0): 3 niveles (2-2, 7-2, zona bonus 5-2/6-2)
- **Overworld** (Tipo 1): 22 niveles (incluidas las 2 salas nubes bonus)
- **Underground** (Tipo 2): 3 niveles (incluidas las salas bonus subterráneas)
- **Castle** (Tipo 3): 6 niveles
- \+ 1 sala cutscene (antes de los niveles subterráneos/agua)
- \+ 1 warp zone de 4-2

Cada nivel tiene un ID en **7 bits**. Los 5 bits de peso bajo = número en el subgrupo, los 2 bits de peso alto = tipo de zona:

```asm
; Codificación 7-bit del Level ID
; Bits 6-5 : Tipo (00=Water, 01=Overworld, 10=Underground, 11=Castle)
; Bits 4-0 : Número en el subgrupo
;
; Water IDs      : $00-$02  (tipos 00, números 0-2)
; Overworld IDs  : $20-$35  (tipos 01, números 0-21)
; Underground IDs: $40-$42  (tipos 10, números 0-2)
; Castle IDs     : $60-$65  (tipos 11, números 0-5)
;
; ID $25 = %0100101 → tipo 01 (Overworld), número 5 → 1-1
; ID $23 = %0100011 → tipo 01 (Overworld), número 3 → 6-2
```

**128 IDs posibles** ($00-$7F), solo 34 asignados a verdaderos niveles. Los IDs sin usar apuntan a cualquier cosa.

### Las tablas de punteros: dos listas, dos órdenes

Los punteros tiles y sprites no se guardan en el mismo orden. El código usa dos listas 16-bit separadas (high byte / low byte en dos tablas distintas):

```
Orden de los punteros sprites :
  Índice 0-5   : Castle (6 niveles)
  Índice 6-27  : Overworld (22 niveles)
  Índice 28-30 : Underground (3 niveles)
  Índice 31-33 : Water (3 niveles)

Orden de los punteros tiles :
  Índice 0-2   : Water (3 niveles)
  Índice 3-24  : Overworld (22 niveles)
  Índice 25-27 : Underground (3 niveles)
  Índice 28-33 : Castle (6 niveles)
```

¿Por qué órdenes distintos? Ninguna razón técnica: probablemente así se organizaron los datos durante el desarrollo. Pero crea una consecuencia fascinante: cuando un ID de nivel es inválido, los punteros tiles y sprites cargan niveles *distintos*, creando **Frankenstein levels**.

Para navegar entre esas dos listas, el juego usa pequeñas **tablas de offset** (como un índice):

```asm
; Tablas de offset por tipo (Water, Overworld, Underground, Castle)
; Cada entrada = índice de inicio en la lista correspondiente

SpriteOffsetTable:
  .byte $1F, $06, $1C, $00    ; Water=31, Overworld=6, Underground=28, Castle=0

TileOffsetTable:
  .byte $00, $03, $19, $1C    ; Water=0, Overworld=3, Underground=25, Castle=28
```

Para cargar el nivel 6-2 (ID $23, Overworld número 3):

```asm
; 1. Tipo = 01 (Overworld) → índice en tabla de offset = 1
; 2. Sprite offset = SpriteOffsetTable[1] = 6
;    Índice final = 6 + 3 (número de nivel) = 9 → 10º puntero sprites
; 3. Tile offset = TileOffsetTable[1] = 3
;    Índice final = 3 + 3 = 6 → 7º puntero tiles
; 4. Resultado : puntero tiles $A619 + puntero sprites $9ED0 = 6-2 ✓
```

Ahora, ¿qué pasa con un ID inválido como $43 (Underground número 3, que no existe)?

```asm
; ID $43, Tipo = 10 (Underground), número = 3
; Sprite offset = SpriteOffsetTable[2] = $1C = 28
;   Índice = 28 + 3 = 31 → 32º puntero sprites = ¡agua bonus 5-2!
; Tile offset = TileOffsetTable[2] = $19 = 25
;   Índice = 25 + 3 = 28 → 29º puntero tiles = ¡1-4 (Castle)!
;
; Resultado : un nivel subterráneo con los tiles de 1-4
; y los Bloopers de la zona agua de 5-2. Un verdadero Frankenstein.
```

![Level ID $43: Frankenstein level : tiles 1-4 + sprites agua 5-2](/images/smb1-glitch-levels/lvl-43-frankenstein.png)

![Exploring Glitch Level Pointers: las tablas de offset explicadas](/images/smb1-glitch-levels/yt-pointers.jpg)

![La world index table: cuando el overflow de world 9 crea un glitch level](/images/smb1-glitch-levels/v2-world-index-table.jpg)

### La world index table: por qué world 9 hace overflow

Hay una tabla ROM de 8 bytes que da el índice del primer nivel de cada mundo (1-8). Y justo después, la tabla de los 36 Level IDs de todos los niveles en orden de juego.

```asm
; WorldIndexTable (8 bytes)
  .byte 0, 5, 10, 15, 20, 25, 28, 33
;   -> Mundo 1 empieza en el nivel 0
;   -> Mundo 2 empieza en el nivel 5
;   -> Mundo 8 empieza en el nivel 33

; LevelIDTable (36 bytes)
  .byte $25, $28, $29, $26, $24, ... ; los 36 Level IDs
```

Cuando intentamos cargar world 9, el juego lee el 9º byte de WorldIndexTable... que no existe. Hace overflow de 1 byte en LevelIDTable, lee el valor $25, y luego usa $25 como índice en LevelIDTable (37ª entrada): lo que hace overflow de nuevo de 2 bytes en SpriteOffsetTable, y lee el valor 6.

```asm
; World 9 :
;   1. WorldIndexTable[8] (overflow) → lee $25 en LevelIDTable
;   2. LevelIDTable[37] (overflow) → lee el 2º byte de SpriteOffsetTable = 6
;   3. ID = 6 → Water level number 6 (que no existe)
;   4. Tile pointer = puntero water número 6 = tiles de 6-2
;   5. Sprite pointer = índice 31+6 = 37 > 33 → puntero inválido
;   6. Resultado : 6-2 bajo el agua con sprites glitcheados
;      → ¡world 9-1!
```

Para world G (16), el overflow va aún más lejos y cae en el Level ID $01, que es el nivel cutscene que precede 1-2:

```asm
; World G (16) :
;   WorldIndexTable[15] → lee $01 en LevelIDTable
;   LevelIDTable[1] = $29 (cutscene 1-2)
;   → world G-1 = la cutscene de entrada de 1-2
```

## Por qué existen los glitch worlds

El juego tiene 32 niveles "legítimos" (8 mundos × 4 niveles). Pero la tabla de punteros hace 128 entradas por tipo de zona. Las entradas más allá del nivel 32 contienen lo que haya en ROM en esas direcciones: a veces otro nivel, a veces datos sonoros, a veces RAM, a veces cualquier cosa.

![Level ID $01 Water (Minus World): tile pointer $AE45, sprite pointer $A171](/images/smb1-glitch-levels/minus-world.png)

### Level ID $01 + AreaType 0 = Minus World

El más famoso de los glitch worlds. El Level ID $01 en AreaType 0 (agua) apunta hacia:

- **Tile pointer: $AE45** → la zona submarina de 2-2/7-2
- **Sprite pointer: $A171** → los sprites de 2-2/7-2

El resultado: un nivel de agua que se parece a 2-2, pero que entra en bucle infinito porque el flagpole no existe. El nivel gira en bucle para siempre.

Es el nivel 36-1 (o 36-1 en el mundo $-1).

![El warm start check de SMB1: él permite que el Minus World exista](/images/smb1-glitch-levels/v4-minus-world.jpg)

```asm
; Por qué falta el flagpole en el Minus World :
; Los sprites de 2-2/7-2 ($A171) no tienen flagpole
; en su secuencia. El juego busca el sprite $FD (flagpole)
; pero nunca lo encuentra → bucle infinito
;
; El juego sigue generando el nivel al infinito
; hasta que el timer llega a cero.
```

### Los punteros que apuntan a la RAM

Cuando el tile pointer o el sprite pointer apunta a una dirección en RAM ($00-$7F) en vez de en ROM, el juego intenta interpretar los cambios constantes de la RAM como tiles:

```asm
; Ejemplo : Level ID $03 en Water
; Tile Pointer : $A46B (3-3 - válido)
; Sprite Pointer : $009D (¡apunta hacia la RAM página cero!)

; La RAM página cero contiene los registros del juego,
; la posición de Mario, el estado de los contadores...
; El juego descomprime eso como una secuencia de sprites,
; y el resultado es un nivel con enemigos
; que en realidad son valores de registros.
```

Cuando la página cero cambia (porque Mario se mueve, el timer corre, etc.), los "sprites" del nivel también cambian. Por eso algunos glitch worlds tienen enemigos que parpadean y se transforman constantemente.

![Level ID $03 Water: sprite pointer $009D apunta hacia la RAM, nivel injugable](/images/smb1-glitch-levels/level-03-water.png)

### Level ID $36: el nivel vacío (Overworld)

Level ID $36 en Overworld:

- **Tile pointer: $AC35** (1-2)
- **Sprite pointer: $A0D8** (1-2)

Resultado: nada. El juego carga el nivel pero está marcado "sin nivel" en el catálogo de RGMechEx. Los tiles quizá sean válidos pero los sprites apuntan hacia un sitio que produce un nivel vacío o no funcional.

### Level ID $1D (Castle): el campeón de los crashes

Level ID $1D en Castle:

- **Tile pointer: $A210** (4-4)
- **Sprite pointer: $7EA0** (¡RAM!)

Sprite pointer en RAM = undefined sprites. El juego intenta mostrar un Spiny ball o un Bullet Bill blaster en la primera línea de tiles. Crashea de inmediato.

```asm
; Cuando el sprite pointer apunta hacia la RAM,
; el juego descomprime bytes que cambian todo el tiempo
; como instrucciones "spawn". El resultado :
; - Aparición de objetos inexistentes (valor undefined)
; - Crash PPU cuando el sprite NES intenta mostrar un tile inválido
; - Freeze completo de la consola
```

## Los 256 glitch worlds catalogados

RGMechEx escribió un script que genera los mapas de **todos los niveles**, para los 4 tipos de zona, y los 128 IDs cada uno.

El contador de mundo está en 8 bits (0-255). Los mundos 1-8 son legítimos. Quedan **248 glitch worlds** potenciales. Cada glitch world corresponde al primer nivel de ese mundo, y su Level ID se calcula con el mecanismo de overflow de la WorldIndexTable.

![Tabla de los glitch worlds: 248 mundos corruptos, 68 primeros niveles accesibles](/images/smb1-glitch-levels/v3-glitch-worlds-table.jpg)

De los 128 IDs posibles, solo **68 son "first level" de un mundo** (accesibles vía el glitch world number). Los otros 60 son niveles 2+ o inaccesibles.

| Tipo | IDs únicos jugables | IDs que crashean | IDs vacíos |
|------|---------------------|-------------------|-----------|
| Water (0)    | ~20  | ~60  | ~48  |
| Overworld (1)| ~30  | ~55  | ~43  |
| Underground (2) | ~15 | ~65 | ~48  |
| Castle (3)   | ~25  | ~58  | ~45  |

Muchos IDs llevan al mismo nivel por los punteros que caen en las mismas direcciones ROM. El Level ID $28 (Overworld) por ejemplo: tile pointer $A7CD (2-1), aparece en **38 glitch worlds distintos**, porque su sprite pointer $9F51 apunta hacia una zona de la ROM que se usa como padding/datos sonoros reutilizado por montones de IDs.

![Mapa del nivel ID $28 (Overworld): tiles 2-1 con sprites normales, 38 glitch worlds](/images/smb1-glitch-levels/level-28-overworld.png)

![Super Mario Bros. Glitch Levels Explained: el 3er vídeo](/images/smb1-glitch-levels/yt-levels.jpg)

### Los 6 glitch levels realmente únicos

Entre los 19 IDs de glitch level accesibles, solo **6 no crashean de inmediato** al cargar:

| World | Level ID | Descripción |
|-------|----------|-------------|
| E-1 (224) | $50 | Un solo bloque ? sobre un abismo. Mario muere al instante. |
| W | $57 | Mario aparece bloqueado, incapaz de moverse. |
| 42 (133) | $50 | Túnel de nubes que atrapa Mario si va bastante lejos. |
| 62 (131, 240) | $4D | Castillo congelado: Mario aparece arriba, no puede caer → bloqueado. |
| 127 | $4B | Túnel subterráneo, pero crashea si vas demasiado lejos. |
| 137 | $4B | Activa el scroll automático de las cutscenes. Mario se encuentra un único brick block que lo bloquea para siempre. |

![Level ID $50 (cloud tunnel): el glitch world 42-1 y E-1](/images/smb1-glitch-levels/lvl-50-cloud.png)
![Level ID $4D (castle): world 62-1, Mario bloqueado en el spawn](/images/smb1-glitch-levels/lvl-4D-castle.png)
![Level ID $4B (tunnel): world 127-1, crashea si vas demasiado lejos](/images/smb1-glitch-levels/lvl-4B-tunnel.png)

Seis glitch worlds de 248 que producen algo realmente nuevo. El resto son niveles normales con el tipo de zona equivocado, o pantallas negras.

## El formato de los niveles en detalle

Vamos al formato exacto de los datos de nivel, para entender por qué los glitch levels se sostienen (o no).

### El header nivel: 2 bytes, 6 propiedades

Cada nivel empieza con un header de 2 bytes que controla 6 propiedades:

```asm
; Byte 0 : timer + Y start + modifier
;   Bits 7-6 : timer (00=sin cambios, 01=200, 10=300, 11=400)
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
;   Bits 3-0 : floor pattern inicial (0-15)
```

El type modifier controla variaciones visuales: las olas arriba de los niveles de agua, el fondo ladrillo de 8-3, la paleta noche de 4-3, la nieve de 6-2, etc.

### Los objetos tiles: 2 bytes, Next Screen Flag, cola 3 slots

Tras el header viene una lista de **objetos tile**, cada objeto hace 2 bytes. El byte $FD marca el fin de la lista.

```asm
; Formato objeto tile (16 bits) :
; Byte 0 :
;   Bits 7-4 : posición X (columna 0-15)
;   Bits 3-0 : posición Y
;     Y=0-11  : posición Y normal
;     Y=12    : objetos especiales (agujeros, puentes, rope, ? blocks)
;     Y=13    : screen skip / objetos especiales 2
;     Y=14    : cambio de modifier/scenery/floor
;     Y=15    : objetos especiales 3 (castillo, escaleras, tubería grande)

; Byte 1 :
;   Bit  7   : NEXT SCREEN FLAG
;   Bits 6-4 : tipo de objeto (0-7)
;   Bits 3-0 : anchura/altura / subtipo
```

Cuando el bit "next screen" está puesto, la columna de trabajo actual se incrementa 1. Eso permite colocar objetos más allá de las 16 primeras columnas. Los objetos tienen que listarse **en orden** (izquierda a derecha) porque el juego los carga secuencialmente:

```asm
; La rutina de carga tiene DOS fases por columna :
; Fase 1 : buscar los nuevos objetos que empiezan en esa columna
;            y añadirlos a la cola de espera (queue)
; Fase 2 : procesar cada objeto en la cola dibujando los tiles,
;            y quitar los que terminan en esa columna
```

La cola hace exactamente **3 slots**. Consecuencia directa: no puede haber más de 3 objetos que empiecen en la misma columna. Si la cola está llena, el 4º objeto se ignora y jamás se cargará.

Por eso los niveles bien diseñados evitan apilar demasiados objetos. Ejemplo en 1-2: la columna con el bloque 1up en el techo + los ladrillos de al lado se parte en dos objetos distintos para respetar el límite de 3.

### Posición Y especial: 12, 13, 14, 15

Cuando Y=12, el objeto no tiene posición Y (está hardcodeada por tipo):

```asm
; Y=12 : objetos sin posición Y
;   Tipo 0 : agujero (quita el suelo)
;   Tipo 1 : rope de plataforma móvil
;   Tipos 2-4 : puentes en Y fija
;   Tipo 5 : agujero con agua/lava
;   Tipos 6-7 : filas de ? blocks
```

Cuando Y=13, dos subgrupos. Si el bit 6 del byte 1 está a 1:

```asm
; Y=13, bit6=1 : objetos especiales
;   0 = tubería L (cutscene), 1 = flagpole, 2-3 = puente/hacha/jammer (fin castillo)
;   4 = stop screen, 5 = random enemies, 6 = loop level, 7+ = posible crash
```

Si bit6=0, los 5 bits de peso bajo codifican un **screen skip** (saltar directo a una pantalla N, sin pasar por el next screen flag uno por uno).

Cuando Y=14: mismo principio con bit6=1 para cambiar el type modifier, bit6=0 para cambiar el fondo + floor pattern.

### Los floor patterns: 16 motivos de suelo

El suelo de los niveles no está hecho de objetos individuales. SMB1 usa **floor patterns**, un motivo de fondo que se aplica a todas las columnas hasta el próximo cambio:

```asm
; Floor patterns (4 bits = 16 posibilidades)
;   0 = vacío total
;   1 = suelo 2 tiles alto
;   2 = suelo 1 tile alto
;   3 = suelo + bottom
;   4 = suelo + bottom 2
;   5 = suelo 1/2 tile
;   6 = 3/4 suelo
;   ... hasta 15 = relleno total (suelo + techo)
```

Por eso los agujeros son objetos: hacen override del floor pattern en una columna específica, sin tener que cambiar el patrón para todo lo demás.

### El límite de 256 bytes y el repeat

Todos los datos tile de un nivel caben en **256 bytes máximo**. El registro Y del 6502 se usa como índice, y hace 8 bits. Si el juego llega al fin de los datos sin encontrar el byte $FD, **vuelve al principio** y repite los 256 bytes al infinito:

```asm
; Índice Y = 8 bits → máx 256 bytes de datos tiles
; Si Y hace overflow (255 → 0) sin encontrar $FD → repeat
; Igual para los sprites, pero los objetos pipe (3 bytes)
; desplazan la paridad del índice en cada carga.
```

Algunos glitch levels explotan ese repeat para generar niveles que duran "indefinidamente".

### El sistema de sprites: 2 bytes + pipe transitions

Los sprites siguen un formato similar, pero sin header y con algunas diferencias clave. El byte $FF marca el fin de la lista.

```asm
; Formato sprite (2 bytes) :
; Byte 0 : posición X (columna)
; Byte 1 :
;   Bit 7 : NEXT SCREEN FLAG
;   Bits 6-0 : tipo de sprite
;       Algunos tipos incluyen : goomba, koopa, Blooper,
;       Bullet Bill, Lakitu, Spiny, plataformas,
;       comando warp zone, toad/princesa,
;       comandos de spawn de grupos de enemigos
```

El bit de peso bajo del byte 1 es el **hard level flag**: si está a 1, el sprite solo aparece en los niveles ≥ 5-3. Así se crean los niveles "hard mode".

Posición Y 15 = **screen skip** (idéntico a los tiles). Posición Y 14 = **pipe transition** (3 bytes):

```asm
; Sprite Y=14 : pipe/vine transition (¡3 bytes!)
;   Byte 0 : posición X
;   Byte 1 : bits 6-0 = Level ID 7-bit (destino)
;   Byte 2 : bits 4-0 = pantalla de destino
;            bits 7-5 = mundo donde esa transición es válida
;
; ¿Por qué un mundo? Las bonus rooms se reutilizan entre mundos.
; Ejemplo : la sala bonus de 1-1 también la usan 2-1 y 7-1.
; Esa sala tiene 3 transiciones, una por mundo, para que Mario
; reaparezca en el buen sitio.
```

Los sprites **no tienen queue system**. El único límite es que no puede haber más de 4 sprites cargados simultáneamente en la zona de spawn (justo fuera de pantalla a la derecha). Más allá, los sprites se ignoran.

## Cómo acceder a los glitch worlds

Hay dos métodos principales.

### El método clásico: el wall clip

El wall clip (paso a través de los muros) permite salir del nivel normal y caminar hasta la warzone oculta. Manipulando el contador de mundo vía la RAM, se puede cargar cualquier Level ID.

La técnica:
1. World 1-2: ir a la tubería de fin oculta
2. Hacer el wall clip en el muro derecho
3. Caminar en el vacío hasta la zona warp
4. El juego interpreta los valores como mundos

Pero ese método solo da acceso a una pequeña parte de los glitch worlds.

### El método extremo: NES Tennis cart swap

Ver la sección "El warm start" arriba para el detalle completo. En resumen: el contador de pasos de Tennis escribe sobre el mismo byte RAM que el mundo de arranque de SMB1, y la detección warm start preserva ese valor.

### El rincón de los trasteadores: el código para explorarlo todo

Si quieres explorar todos los glitch tú mismo en un emulador, puedes parchear el Level ID directamente:

```asm
; Patch para FCEUX / Mesen :
; Dirección RAM $075F = Level ID actual
; Dirección RAM $0760 = Area Type (0=Water, 1=Overworld, 2=Underground, 3=Castle)

; Ejemplo : cargar el Level 57 (0x39) en Overworld
; En el emulador, abrir el trazador de memoria y escribir :
; $075F = 0x39
; $0760 = 0x01
; Luego entrar en una tubería de warp o morir y recomenzar
; → El juego carga el nivel ID $39 en Overworld
```

RGMechEx publicó la lista completa de los 128 niveles × 4 tipos con mapas generados automáticamente en [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html). Cada entrada muestra el tile pointer, el sprite pointer, y un mapa visual del nivel.

## Los niveles más wtf

### Level ID $1F (Water): 15 glitch worlds en uno

El tile pointer $A302 (3-4) combinado con el sprite pointer $02A0 da 15 glitch worlds distintos (D-1, J-1, Y-1, Z-1, 55-1, 73-1...). Explicación: el sprite pointer apunta hacia una zona de la ROM con datos bastante cercanos a sprites válidos para producir resultados jugables, pero la combinación de los tiles de castillo 3-4 con sprites de overworld crea un render absurdo.

### Level ID $28 (Overworld): 38 glitch worlds = récord

El récord absoluto. 38 entradas de glitch world apuntan hacia el mismo nivel (tiles 2-1 + sprites $9F51). ¿Por qué? Porque el sprite pointer $9F51 cae en una zona de la ROM que se usa como padding/datos sonoros reutilizado por montones de IDs.

### Level ID $49 (Underground): el nivel FDS

Tile pointer $76AE + sprite pointer $1C9D. El tile pointer apunta hacia la zona de la ROM reservada a la versión Famicom Disk System. Resultado: un nivel con tiles que no existen en el cartucho estándar. Es el nivel que hace aparecer el nivel 52-1 y 196-1.

### Level ID $00-$02: los verdaderos niveles bonus

Esos IDs los usan subniveles legítimos del juego:

- **$00**: zona submarina de 5-2/6-2 (usado por H-1, 39-1)
- **$01**: el agua de 2-2/7-2 (el Minus World, 36-1)
- **$02**: subnivel de 8-4 (136-1, 151-1, 215-1)

La diferencia entre un nivel "bonus" accesible normalmente y un glitch world es que las warp zones comprueban el mundo actual:

```asm
; Comprobación warp zone (simplificado)
; El juego comprueba que el mundo objetivo esté entre 1 y 8
CheckWarp:
  lda TARGET_WORLD
  cmp #1
  bcc InvalidWarp       ; < 1 → rechazado
  cmp #9
  bcs InvalidWarp       ; > 8 → rechazado
  ; mundo válido entre 1 y 8 solo
  jmp DoWarp
```

Los glitch worlds con números > 8 o 0 no pueden alcanzarse con tuberías normales. Hace falta el wall clip o el cart swap.

## Por qué algunos niveles crashean: las jump tables

Cuando el juego carga un objeto tile, usa su tipo como índice en una **jump table**:

```asm
; Jump table de los objetos tiles estándar (tipos 0-11)
JumpTable_TileObjects:
  .word Obj_Special       ; tipo 0 : bloque ?, hidden, flagpole...
  .word Obj_Platform      ; tipo 1 : plataforma especial
  .word Obj_BrickRow      ; tipo 2 : fila de ladrillos
  .word Obj_BlockRow      ; tipo 3 : fila de bloques
  .word Obj_CoinRow       ; tipo 4 : fila de monedas
  .word Obj_BrickCol      ; tipo 5 : columna de ladrillos
  .word Obj_BlockCol      ; tipo 6 : columna de bloques
  .word Obj_Pipe          ; tipo 7 : tubería
  .word Obj_8             ; tipo 8
  .word Obj_9             ; tipo 9
  .word Obj_10            ; tipo 10
  .word Obj_11            ; tipo 11
```

![Las jump tables: por qué un tipo de objeto inválido hace crashear el juego](/images/smb1-glitch-levels/v4-jump-table.jpg)

Si un objeto tiene un tipo inválido (≥12), el juego salta a un puntero que no existe en esa tabla. **4 outcomes posibles**:

1. **Puntero válido** → el objeto se carga normalmente
2. **Puntero hacia otra jump table** (solapamiento) → aparece un objeto distinto. Ejemplo: tipo 12 apunta hacia la tabla Y=13, lo que da una tubería L.
3. **Puntero hacia ejecutable** → ejecución de código aleatorio (crash probable)
4. **Placeholder explícito (NOP)** → el objeto no hace nada (algunos sprites son así, produciendo enemigos que vuelan en el sitio sin moverse)

![Glitch level ID $58: el sprite pointer apunta hacia una dirección inválida, el juego crashea](/images/smb1-glitch-levels/v4-glitch-58-crash.jpg)

![Glitch level ID $50: el cloud tunnel, un nivel generado por datos corruptos](/images/smb1-glitch-levels/v4-glitch-50.jpg)

La glitch level ID $58 (el túnel que crashea): su sprite pointer apunta hacia una región de memoria que **no existe en NES sin mapper ROM**. El juego intenta cargar el mismo Koopa 5 veces por frame en la posición (0,0), lo que satura la PPU y provoca un freeze.

```asm
; Por qué ID $58 crashea :
; Sprite pointer → dirección inválida (fuera del espacio NES estándar)
; → El juego lee bytes indeterminados como tipos de sprite
; → El Koopa $00 (tipo inválido sin handler) entra en llamada recursiva
; → Stack overflow 6502 → freeze
```

### La paradoja pipe warp

Recuerda el check `target_world BETWEEN 1 AND 8`. Aunque encuentres una tubería en un glitch world, el juego comprueba que el mundo de destino esté entre 1 y 8. Los glitch worlds tienen números > 8 (36-1, 255-1...), así que el warp falla.

También por eso el Minus World no tiene fin: el flagpole no está presente en los sprites, y las tuberías no llevan a ninguna parte.

### El truco de los 5 objetos en una columna

Existe un edge case que permite saltarse el límite de 3 objetos por columna. Cuando la cola se bloquea (slots llenos + objeto siguiente sin next screen flag), el juego "preprocesa" la columna actual en bucle hasta encontrar un objeto con next screen flag. Durante cada preprocesamiento:

```asm
; Durante el preprocesamiento de columna :
; 1. Los objetos en la cola ven su anchura restante
;    decrementada en cada "falso avance" de columna
; 2. Si un objeto llega a anchura=0, sale de la cola
; 3. Un slot liberado puede rellenarse con un objeto nuevo
;    añadido en la misma columna

; Resultado : hasta 5 objetos pueden procesarse en la misma columna.
; Técnica : colocar 2 objetos que atraviesen la screen boundary
; (slots 1 y 2), 1 objeto dummy en X < previo (bloquea la cola),
; luego 3 objetos en X=0 de la pantalla siguiente (uno con next screen flag).
```

Eso se llama un "queue skip" y lo usan algunos romhackers para crear niveles más densos de lo que el formato permite normalmente.

## Las diferencias entre versiones

### Famicom Disk System

La versión FDS de SMB1 tiene una **memory map distinta**. Todos los punteros de nivel están desplazados, pero los datos son los mismos. Lo que cambia: los índices de los glitch worlds son por completo distintos:

```
FDS World 36 → Level ID $09 (agua versión de 5-3)
  → ¡El flagpole está presente! Se puede terminar el nivel.
  → Después: $27 (7-3 normal) → $44 (4-4 underground)
  → $44 es terminable → el hacha funciona → ¡fin del juego!

El Minus World FDS es por tanto un "bonus world" que puede llevar
a completar el juego, al contrario que la versión NES.
```

Mi nivel FDS favorito: **ID $5F**, una versión subterránea de la segunda mitad de 3-3 en túnel bajo (lástima que sea un autoscroller).

### The Lost Levels (Super Mario Bros. 2 japonés)

Lost Levels cambia muchas cosas:

1. **Orden idéntico tiles/sprites**: se acabaron los Frankenstein levels (tiles y sprites cargan el mismo nivel incluso con un ID inválido)
2. **Una sola tabla de punteros 16-bit** en vez de dos tablas separadas high/low
3. **4 archivos disco**: la ROM se partió para el FDS:
   - Archivo 1: worlds 1-4
   - Archivo 2: worlds 5-8
   - Archivo 3: world 9 + sound engine
   - Archivo 4: worlds A-D (tabla de punteros por completo distinta)
4. **Mismo Level ID = 4 niveles posibles** según el archivo cargado
5. **Se acabó el glitch Tennis**: la opción continue (continue en el mismo mundo tras game over) vuelve el warm start inútil, y el juego **resetea de inmediato** si world > 9
6. **Objetos nuevos**: champiñón veneno, bloque invisible, bloque invisible fire flower, upside down pipes, viento, pero insertados en medio de las listas existentes → **incompatibilidad backward** con SMB1
7. **Piranha Plants siempre rojas** tras world 4, **springboards verdes** solo en worlds 2/B/3/C/7

### Super Mario All-Stars (SNES)

Porteo directo con las mismas rutinas 6502 (el SNES ejecuta el código NES en modo compatible):

- **Warp zone arreglada**: se acabó el Minus World (entrar en la tubería izquierda antes del texto lleva al buen mundo)
- **Crasheo**: la mayoría de los glitch levels crashean (salvo ID $6A y 9-1)
- **Objetos castillo añadidos**: renders más únicos
- **Pero**: el **4-2 wrong warp** aún funciona (¡no parcheado!)

### El 4-2 wrong warp: un bug de colocación de objeto

En 4-2, hay dos objetos de transición pipe: la enredadera (warp zone) y la tubería (sala monedas). El primer objeto de transición (el de la enredadera) está colocado **mucho antes** de que la enredadera aparezca en pantalla. El segundo (la tubería) está colocado **demasiado tarde en el nivel**.

```asm
; Timing de las transiciones en 4-2 :
; Objeto transición 1 (enredadera → warp zone) : colocado 3 pantallas antes de la enredadera
; Objeto transición 2 (tubería → sala monedas) : colocado 1 pantalla tras la tubería
;
; Normalmente el primer objeto se desactiva antes de que Mario
; alcance la tubería. Pero si Mario va rápido (o usa
; el atajo del bloque B+right), ¡la transición de la enredadera
; sigue activa cuando toca la tubería!
; → El juego carga la warp zone en vez de la sala monedas.
;
; Si el objeto se hubiera colocado justo tras la enredadera pero antes
; de la tubería, el bug no existiría.
```

### Los niveles con bucle

¿Cómo funcionan los loop (8-4, 7-4)? El nivel tiene **checkpoints** con números de pantalla y posiciones Y hardcodeados:

```asm
; Checkpoint : {número_pantalla, posición_vertical}
; Si Mario pasa ese checkpoint a la buena altura → el nivel sigue
; Si no → warp back de 4 pantallas (64 bloques)
;
; Para hacer un bucle infinito : posición_vertical = $F0
; (bajo el fondo de la pantalla) → imposible de validar.
;
; Los checkpoints son simples (una sola bandera) salvo para world 7
; que usa tripletes (3 banderas, hay que fallar al menos 1)
;
; El warp back es rudo : offset de tile data puesto a un valor
; hardcodeado, offset de sprite data puesto a 0. Los enemigos presentes
; se descargan al instante → las firebars desaparecen.
```

## Cambiar el formato, no el código

Una de las lecciones más fascinantes de esa arquitectura es que los desarrolladores de SMB1 lograron crear un sistema de nivel muy expresivo sin tocar jamás el código de render 6502. Toda la variación entre los niveles viene de los **datos** (punteros, objetos, sprites, floor patterns), no del código.

Los 256 glitch worlds existen porque las **tablas de punteros están dimensionadas para 128 entradas × 4 tipos**, y el juego nunca valida los valores que lee. Cuando un puntero cae en RAM, el juego interpreta los registros de Mario como tiles. Cuando un puntero cae en los datos sonoros, el juego toca música en forma de level design. Y cuando las jump tables hacen overflow, el juego ejecuta cualquier cosa hasta el crash.

![More Super Mario Bros. Mechanics Explained: el 4º vídeo](/images/smb1-glitch-levels/yt-mechanics.jpg)

## Lo que podemos aprender de todo eso

1. **Separación tiles/sprites**: independencia total de ambas capas, con órdenes de almacenamiento distintos que crean Frankenstein levels únicos
2. **Compresión RLE + sistema de objetos**: los niveles no son bitmaps sino listas de objetos colocados, con floor patterns para el suelo
3. **Cola 3 slots**: límite estricto del hardware (y del diseño de nivel)
4. **Confianza total a los punteros**: el juego confía en los punteros y las jump tables, lo que produce o bien glitchs jugables, o bien crashes
5. **256 bytes máx**: el límite del registro Y 6502, que hace que los datos se repitan si vamos demasiado lejos
6. **Warm start / cold start**: un sistema de "continuar" que abrió la puerta al cart swap Tennis → Mario

Lo más bello: todo eso es código 6502 que cabe en 40KB. El código dialoga directo con el hardware y concede una confianza total a cada acceso memoria. Si el puntero está podrido, el juego crashea. Y los crashes los llamamos glitch worlds.

## Las 3 cosas a recordar

1. **Los glitch worlds son punteros que caen mal**: El juego tiene 128 IDs × 4 tipos de zona, pero solo 34 niveles únicos. Cuando el world number se corrompe (por Tennis o wall clip), el juego carga un puntero diseñado para otro nivel, y las 512 combinaciones posibles producen resultados imprevisibles.

2. **El Minus World es un bug de warp combinado con corrupción**: La tubería izquierda en 1-2, si se activa antes de que el texto aparezca, carga world 36 (0x24). Ese world apunta hacia Level ID $01 (agua de 2-2), un nivel sin flagpole. Y como no hay transición pipe para world 36, el nivel entra en bucle infinito. La ausencia de comprobación crea el icono.

3. **Tennis → Mario, 15 años antes que OoT → Paper Mario**: La RAM de la NES sobrevive a un cambio de cartucho gracias a los condensadores y al sistema de warm start / cold start de SMB1. El contador de pasos de Tennis (que incrementa un byte RAM al tocar el sonido de los pasos) cae justo en la dirección del world number. Hace falta que los dígitos del top score queden a 0, que el byte $A5 quede intacto, y que el juego detecte un warm start: un concurso de circunstancias perfecto que solo funcionó con Tennis.

Los vídeos originales de [Retro Game Mechanics Explained](https://www.youtube.com/c/RetroGameMechanicsExplained) son un puto trabajo de hormiga: el nivel de detalle sobre el desensamblado 6502, los mapas automáticos de todos los niveles, las explicaciones del cart swap y del warm start. Si no viste la serie, mírala, es corta y cada minuto es denso.

El código fuente de los mapas está disponible en [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html), y el desensamblado completo de SMB1 es open source en montones de repos. Hace 40 años, programadores japoneses escribieron ese sistema de nivel en 6502 con cero test unitario y cero bug tracker, y seguimos aprendiendo técnicas de optimización abriendo su código hoy.
