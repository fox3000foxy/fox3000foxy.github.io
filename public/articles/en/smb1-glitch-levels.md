---
title: "Super Mario Bros.: Level Format, Pointers, and the 256 Glitch Worlds"
description: How 128 levels × 4 zone types fit in 40KB of ROM, why the Minus World exists, and how a Tennis NES match can load glitch worlds.
date: 2026-06-10
tags:
  - retro
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "6hLGe4XUoxHq/o2Q0EdIRcSB4LNnLti2hSeuctfEGp4fJGUI+p1IdYhLcmEPYktobTVj2iq63pVS6FLJVmp/sQ=="
---

## Introduction

Super Mario Bros. is 40 kilobytes of ROM. Eight worlds, 32 levels, enemies, music, power-ups, everything fits in there.

But if you open an emulator and fiddle with the right bytes, you can load level 36-1. Or 255-1. Or land in a world where everything is made of Bowser sprites and pipes leading nowhere.

Those glitch worlds exist for a simple reason: SMB1's level storage system is a marvel of 8-bit optimization, and when you force the game to read where it shouldn't, you get fascinating results.

Retro Game Mechanics Explained made a 4-video series on it -- let's compile it into a single dive into the 6502 code of the best-selling game of its era.

![GLITCH OBJECTS -- the RGMechEx series title on SMB1's hidden mechanics](/images/smb1-glitch-levels/title-card.jpg)

![World 9-1 -- the first glitch world reachable via the Tennis cart swap](/images/smb1-glitch-levels/v1-title-9-1.jpg)

## Warm start: why Tennis RAM survives into SMB1

Before talking level storage, you need to understand how SMB1 boots. Because the NES Tennis cart-swap glitch rests entirely on the game's **warm start / cold start detection** system.

### The 41 preserved bytes

When SMB1 detects a **cold start** (first power-on or power off/on), it wipes all RAM. But when it detects a **warm start** (reset button, no power cut), it preserves a **41-byte** memory zone:

```asm
; The 41 RAM bytes preserved on warm start
; Addresses $075F-$0787
;
; $075F : boot byte (world - 1)    [1 byte]
; $0760 : world select flag (B button) [1 byte]
; $0761-$0762 : unused                    [2 bytes]
; $0763-$0768 : timer (6 digits, 3 shown) [6 bytes]
; $0769-$076E : Luigi coins                   [6 bytes]
; $076F-$0774 : Mario coins                   [6 bytes]
; $0775-$077A : Luigi score                   [6 bytes]
; $077B-$0780 : Mario score                   [6 bytes]
; $0781-$0786 : top score (6 digits, 1 hidden) [6 bytes]
; $0787 : the magic byte $A5                 [1 byte]
```

Those 41 bytes serve a single feature: letting the player **continue at the same world after a game over**. If you die on 6-3, the game writes world 6 into the boot byte, and at the title screen, holding A + Start restarts you on 6-1.

![The 41 RAM bytes preserved on warm start -- TOP SCORE, MARIO SCORE, TIMER, WORLD SELECT, CONTINUE WORLD, and the magic $A5 byte](/images/smb1-glitch-levels/v1-memory-state.jpg)

### The double warm-start check

![Cold start vs warm start -- the reset detection diagram](/images/smb1-glitch-levels/v1-warm-start.jpg)

When SMB1 boots, it doesn't check a single criterion but **two**:

```asm
CheckWarmStart:
  ; 1. Check the magic byte $A5 at $0787
  lda $0787
  cmp #$A5
  bne ColdStart        ; not $A5 → cold start

  ; 2. Check the 6 top-score digits ($0781-$0786)
  ;    Each digit must be between 0 and 9
  ldx #0
CheckLoop:
  lda $0781,x
  cmp #$0A
  bcs ColdStart        ; digit >= 10 → cold start
  inx
  cpx #6
  bne CheckLoop

  ; If both pass → warm start
  ; RAM is not wiped, the start world is preserved
  jmp WarmStartBoot
```

![Checking the $A5 byte and top-score digits -- the warm start heart](/images/smb1-glitch-levels/v1-a5-byte.jpg)

Why a double check? Because the $A5 byte could be there by chance (another game leaving that value, or the RAM chip's default resting state). Checking the top-score digits are valid (0-9) ensures the data is coherent.

### Why Tennis is the only game that works

When you first insert SMB1 (cold start), the game:
1. Wipes all RAM → top score = 0, world byte = 0
2. Writes $A5 at address $0787

Then you swap to Tennis without powering off. Tennis:
- **Doesn't clean RAM on boot** (few NES games do)
- **Doesn't write over the top-score bytes** → they stay at 0 (valid)
- **Doesn't touch the $A5 byte** → it stays present
- **Uses address $075F** for the player footstep counter

```asm
; The footstep increment in Tennis:
; On each player step on the court, Tennis increments the byte at $075F.
; That same byte is used by SMB1 as "world number - 1".
;
; 0 steps  → world 0 → SMB1 = world 1
; 1-7 steps → world 1-7 → normal worlds
; 8+ steps → world 8+ → glitch worlds!
;
; The counter only increments when music stops
; (footstep sounds don't play during music).
```

When you put SMB1 back in:
1. The $A5 byte is still there (Tennis didn't touch it)
2. The top-score digits are still 0 (valid)
3. The world byte is now 8+ (incremented by Tennis steps)
4. SMB1 detects a warm start → preserves the corrupted world byte
5. Holding A + Start → world 9-1, world A-1, world 36-1, etc.

### Why you must boot Mario before Tennis

A subtlety: you must first boot SMB1, then Tennis, then SMB1 again. If you started directly with Tennis, the $A5 byte would never be written (Tennis doesn't write $A5), so warm-start detection would fail and RAM would be wiped.

![Tennis footstep counter: each footstep increments the world byte](/images/smb1-glitch-levels/v1-footstep.jpg)

![Access Glitch Worlds via NES Tennis -- the cart swap explainer video](/images/smb1-glitch-levels/yt-tennis.jpg)

## How SMB1 stores its levels in 40KB

Nintendo R&D4 had a simple-looking problem to solve: representing horizontally scrolling levels with tiles, enemies, items, all in an ultra-tight ROM budget.

The solution is a split into two **completely independent** data layers:

### The tile layout (the level map)

Each level is defined by a pointer to a compressed ROM tile structure. The compression is crude but brilliant: a "control" byte followed by 1-3 data bytes.

The tile format uses a **run** system (RLE-like):

```asm
; SMB1 tile format (simplified)
; Each "command" is a control byte:
;
; $00-$7F: place one tile, advance 1 column
; $80-$BF: place a tile repeated N times (N = byte - $80 + 1)
; $C0-$FF: special command (end of line, jump, palette change)

Example: to draw 3 consecutive bricks:
  $82 $01    ; repeat tile $01 (brick) 3 times
```

Each level holds 13 rows of 16 tile columns (13×16 = 208 visible tiles). But the compressed format goes way lower -- e.g. sky and empty columns take almost no space.

The 6502 render loop:

```asm
; Tile decompression - main loop
; Input: tile_data pointer in $XX
; Output: level tilemap in PPU RAM

DecompressTile:
  lda (tile_ptr),y      ; read control byte
  iny
  cmp #$80
  bcc SingleTile        ; $00-$7F: single tile
  cmp #$C0
  bcc RunLength         ; $80-$BF: run-length
  jmp SpecialCommand    ; $C0-$FF: special command

SingleTile:
  sta PPU_DATA          ; write the tile directly
  jmp Next

RunLength:
  sec
  sbc #$7E              ; N = control - $7E
  tax
  lda (tile_ptr),y      ; read the tile to repeat
  iny
: sta PPU_DATA
  dex
  bne :-
  jmp Next
```

### The sprite layout (enemies and objects)

In parallel, enemies and objects (blocks ?, pipes, goombas, koopas) live in a completely separate structure. Each spawn is defined by 2 bytes:

```asm
; SMB1 sprite format
; Byte 0: X position (in columns)
; Byte 1: sprite type + Y page bits
; Y is derived from the index in the sequence

A sprite sequence:
  $01 $4B    ; goomba at column 1
  $09 $4B    ; goomba at column 9
  $10 $61    ; ? block at column 16 (holds coin)
  $15 $54    ; green koopa at column 21
  $FF        ; end of sequence
```

Each level can reference up to 5 sprite pages (well, 5 "screens" of 16 columns), but in practice most levels use only 2-3.

### The pointer table

The design's genius is the pointer table. Each level is stored as a **pair** of ROM addresses:

```c
// Internal structure (simplified) of the World Map
struct LevelPointer {
    uint16_t tile_ptr;   // ROM address of tile data
    uint16_t sprite_ptr; // ROM address of sprite data
};

// 4 separate tables, one per AreaType:
// 0 = Water, 1 = Overworld, 2 = Underground, 3 = Castle
LevelPointer level_table[4][128];
```

128 entries per table. 4 zone types. **512 possible combos**, but only a fraction is used by the official game. The rest is uninitialized RAM or data interpreted as pointers.

When the game loads a level, it does this:

```asm
; Loading a level
; A = AreaType (0-3), X = LevelID (0-127)

LoadLevel:
  sta AREA_TYPE
  asl                  ; *2 for 16-bit table offset
  tax
  lda LevelTable_TilePtr, x
  sta TILE_PTR
  lda LevelTable_TilePtr+1, x
  sta TILE_PTR+1       ; pointer to tiles
  lda LevelTable_SpritePtr, x
  sta SPRITE_PTR
  lda LevelTable_SpritePtr+1, x
  sta SPRITE_PTR+1     ; pointer to sprites
  jsr DecompressTiles
```

The game places total trust in pointers: it reads the address in the table and decompresses whatever sits there, period.

![Level ID $06 (Water) -- 9-1, the underwater version of 6-2](/images/smb1-glitch-levels/lvl-06-9-1.png)

![The Level ID table: 128 possible entries, 34 assigned](/images/smb1-glitch-levels/v2-level-id-table.jpg)

![The different tile and sprite pointer orders -- the cause of Frankenstein levels](/images/smb1-glitch-levels/v2-pointer-tables.jpg)

### The 34 unique levels and the 7-bit ID system

![The NES RAM chip (MB8416A) -- it's what preserves data when swapping cartridges](/images/smb1-glitch-levels/v1-ram-chip.jpg)

SMB1 doesn't have 32 levels, but **34 unique levels**. Many levels are duplicates (5-3 = 1-3 but with Bullet Bills) flagged "hard mode". The real unique levels:

- **Water** (Type 0): 3 levels (2-2, 7-2, bonus zone 5-2/6-2)
- **Overworld** (Type 1): 22 levels (including the 2 bonus cloud rooms)
- **Underground** (Type 2): 3 levels (including the underground bonus rooms)
- **Castle** (Type 3): 6 levels
- \+ 1 cutscene room (before underground/water levels)
- \+ 1 warp zone from 4-2

Each level has a **7-bit** ID. The 5 low bits = number in the subgroup, the 2 high bits = zone type:

```asm
; 7-bit Level ID encoding
; Bits 6-5: Type (00=Water, 01=Overworld, 10=Underground, 11=Castle)
; Bits 4-0: Number in subgroup
;
; Water IDs      : $00-$02  (types 00, numbers 0-2)
; Overworld IDs  : $20-$35  (types 01, numbers 0-21)
; Underground IDs: $40-$42  (types 10, numbers 0-2)
; Castle IDs     : $60-$65  (types 11, numbers 0-5)
;
; ID $25 = %0100101 → type 01 (Overworld), number 5 → 1-1
; ID $23 = %0100011 → type 01 (Overworld), number 3 → 6-2
```

**128 possible IDs** ($00-$7F), only 34 assigned to real levels. Unused IDs point to whatever.

### Pointer tables: two lists, two orders

Tile and sprite pointers aren't stored in the same order. The code uses two separate 16-bit lists (high byte / low byte in two distinct tables):

```
Sprite pointer order:
  Index 0-5   : Castle (6 levels)
  Index 6-27  : Overworld (22 levels)
  Index 28-30 : Underground (3 levels)
  Index 31-33 : Water (3 levels)

Tile pointer order:
  Index 0-2   : Water (3 levels)
  Index 3-24  : Overworld (22 levels)
  Index 25-27 : Underground (3 levels)
  Index 28-33 : Castle (6 levels)
```

Why different orders? No technical reason -- it's probably how data got organized during development. But it creates a fascinating consequence: when a level ID is invalid, tile and sprite pointers load *different* levels, creating **Frankenstein levels**.

To navigate between those two lists, the game uses small **offset tables** (like a table of contents):

```asm
; Offset tables by type (Water, Overworld, Underground, Castle)
; Each entry = start index in the matching list

SpriteOffsetTable:
  .byte $1F, $06, $1C, $00    ; Water=31, Overworld=6, Underground=28, Castle=0

TileOffsetTable:
  .byte $00, $03, $19, $1C    ; Water=0, Overworld=3, Underground=25, Castle=28
```

To load level 6-2 (ID $23, Overworld number 3):

```asm
; 1. Type = 01 (Overworld) → index in offset table = 1
; 2. Sprite offset = SpriteOffsetTable[1] = 6
;    Final index = 6 + 3 (level number) = 9 → 10th sprite pointer
; 3. Tile offset = TileOffsetTable[1] = 3
;    Final index = 3 + 3 = 6 → 7th tile pointer
; 4. Result: tile pointer $A619 + sprite pointer $9ED0 = 6-2 ✓
```

Now, what happens with an invalid ID like $43 (Underground number 3, which doesn't exist)?

```asm
; ID $43, Type = 10 (Underground), number = 3
; Sprite offset = SpriteOffsetTable[2] = $1C = 28
;   Index = 28 + 3 = 31 → 32nd sprite pointer = 5-2 water bonus!
; Tile offset = TileOffsetTable[2] = $19 = 25
;   Index = 25 + 3 = 28 → 29th tile pointer = 1-4 (Castle)!
;
; Result: an underground level with 1-4 tiles
; and the 5-2 water zone Bloopers. A real Frankenstein.
```

![Level ID $43 -- Frankenstein level: 1-4 tiles + 5-2 water sprites](/images/smb1-glitch-levels/lvl-43-frankenstein.png)

![Exploring Glitch Level Pointers -- the offset tables explained](/images/smb1-glitch-levels/yt-pointers.jpg)

![The world index table -- when the world 9 overflow creates a glitch level](/images/smb1-glitch-levels/v2-world-index-table.jpg)

### The world index table: why world 9 overflows

There's an 8-byte ROM table giving the first level's index of each world (1-8). And right after, the 36 Level IDs table of all levels in play order.

```asm
; WorldIndexTable (8 bytes)
  .byte 0, 5, 10, 15, 20, 25, 28, 33
;   -> World 1 starts at level 0
;   -> World 2 starts at level 5
;   -> World 8 starts at level 33

; LevelIDTable (36 bytes)
  .byte $25, $28, $29, $26, $24, ... ; the 36 Level IDs
```

When trying to load world 9, the game reads the 9th byte of WorldIndexTable... which doesn't exist. It overflows 1 byte into LevelIDTable, reads value $25, then uses $25 as index into LevelIDTable (37th entry) -- which overflows again 2 bytes into SpriteOffsetTable, and reads value 6.

```asm
; World 9:
;   1. WorldIndexTable[8] (overflow) → reads $25 in LevelIDTable
;   2. LevelIDTable[37] (overflow) → reads 2nd byte of SpriteOffsetTable = 6
;   3. ID = 6 → Water level number 6 (doesn't exist)
;   4. Tile pointer = water pointer number 6 = 6-2 tiles
;   5. Sprite pointer = index 31+6 = 37 > 33 → invalid pointer
;   6. Result: 6-2 underwater with glitched sprites
;      → world 9-1!
```

For world G (16), the overflow goes even further and lands on Level ID $01, which is the cutscene level preceding 1-2:

```asm
; World G (16):
;   WorldIndexTable[15] → reads $01 in LevelIDTable
;   LevelIDTable[1] = $29 (1-2 cutscene)
;   → world G-1 = the 1-2 entry cutscene
```

## Why glitch worlds exist

The game has 32 "legit" levels (8 worlds × 4 levels). But the pointer table has 128 entries per zone type. Entries beyond level 32 hold whatever sits in ROM at those addresses -- sometimes another level, sometimes sound data, sometimes RAM, sometimes whatever.

![Level ID $01 Water (Minus World) -- tile pointer $AE45, sprite pointer $A171](/images/smb1-glitch-levels/minus-world.png)

### Level ID $01 + AreaType 0 = Minus World

The most famous glitch world. Level ID $01 in AreaType 0 (water) points to:

- **Tile pointer: $AE45** → the 2-2/7-2 underwater zone
- **Sprite pointer: $A171** → the 2-2/7-2 sprites

Result: a water level looking like 2-2, but looping forever because the flagpole doesn't exist. The level loops forever.

It's level 36-1 (or 36-1 in the $-1 world).

![SMB1's warm start check -- it's what lets the Minus World exist](/images/smb1-glitch-levels/v4-minus-world.jpg)

```asm
; Why the flagpole is missing in the Minus World:
; The 2-2/7-2 sprites ($A171) have no flagpole
; in their sequence. The game looks for sprite $FD (flagpole)
; but never finds it → infinite loop
;
; The game keeps generating the level forever
; until the timer hits zero.
```

### Pointers pointing to RAM

When the tile or sprite pointer aims at a RAM address ($00-$7F) instead of ROM, the game tries interpreting the constantly changing RAM as tiles:

```asm
; Example: Level ID $03 in Water
; Tile Pointer: $A46B (3-3 - valid)
; Sprite Pointer: $009D (points to zero-page RAM!)
;
; Zero-page RAM holds the game's registers,
; Mario's position, counter states...
; The game decompresses that as a sprite sequence,
; and the result is a level with enemies
; that are actually register values.
```

When zero page changes (because Mario moves, the timer runs, ...), the level's "sprites" change too. That's why some glitch worlds have enemies blinking and constantly transforming.

![Level ID $03 Water -- sprite pointer $009D points to RAM, unplayable level](/images/smb1-glitch-levels/level-03-water.png)

### Level ID $36: the empty level (Overworld)

Level ID $36 in Overworld:

- **Tile pointer: $AC35** (1-2)
- **Sprite pointer: $A0D8** (1-2)

Result: nothing. The game loads the level but it's marked "no level" in RGMechEx's catalog. Tiles may be valid but sprites point somewhere producing an empty or non-functional level.

### Level ID $1D (Castle): the crash champion

Level ID $1D in Castle:

- **Tile pointer: $A210** (4-4)
- **Sprite pointer: $7EA0** (RAM!)

RAM sprite pointer = undefined sprites. The game tries displaying a Spiny ball or Bullet Bill blaster in the first tile row. It crashes immediately.

```asm
; When the sprite pointer aims at RAM,
; the game decompresses ever-changing bytes
; as "spawn" instructions. The result:
; - Spawning nonexistent objects (undefined value)
; - PPU crash when the NES sprite tries displaying an invalid tile
; - Full console freeze
```

## The 256 cataloged glitch worlds

RGMechEx wrote a script generating **every level's** maps, for all 4 zone types, and all 128 IDs each.

The world counter is 8-bit (0-255). Worlds 1-8 are legit. **248 glitch worlds** remain potential. Each glitch world matches that world's first level, and its Level ID computes via the WorldIndexTable overflow mechanism.

![Glitch worlds table -- 248 corrupted worlds, 68 reachable first levels](/images/smb1-glitch-levels/v3-glitch-worlds-table.jpg)

Of the 128 possible IDs, only **68 are a world's "first level"** (reachable via the glitch world number). The other 60 are 2nd+ levels or unreachable.

| Type | Playable unique IDs | Crashing IDs | Empty IDs |
|------|---------------------|-----------|-----------|
| Water (0)    | ~20  | ~60  | ~48  |
| Overworld (1)| ~30  | ~55  | ~43  |
| Underground (2) | ~15 | ~65 | ~48  |
| Castle (3)   | ~25  | ~58  | ~45  |

Many IDs lead to the same level because pointers land on the same ROM addresses. Level ID $28 (Overworld) for example -- tile pointer $A7CD (2-1) -- appears in **38 different glitch worlds**, because its $9F51 sprite pointer aims at a ROM zone reused as padding/sound data by many IDs.

![Level ID $28 (Overworld) map -- 2-1 tiles with normal sprites, 38 glitch worlds](/images/smb1-glitch-levels/level-28-overworld.png)

![Super Mario Bros. Glitch Levels Explained -- the 3rd video](/images/smb1-glitch-levels/yt-levels.jpg)

### The 6 truly unique glitch levels

Of the 19 reachable glitch level IDs, only **6 don't immediately crash** on load:

| World | Level ID | Description |
|-------|----------|-------------|
| E-1 (224) | $50 | A single ? block above a pit. Mario dies instantly. |
| W | $57 | Mario spawns stuck, unable to move. |
| 42 (133) | $50 | Cloud tunnel trapping Mario if he goes far enough. |
| 62 (131, 240) | $4D | Frozen castle: Mario spawns on top, can't fall → stuck. |
| 127 | $4B | Underground tunnel, but crashes if you go too far. |
| 137 | $4B | Enables cutscene autoscrolling. Mario meets a single brick block blocking him forever. |

![Level ID $50 (cloud tunnel) -- glitch world 42-1 and E-1](/images/smb1-glitch-levels/lvl-50-cloud.png)
![Level ID $4D (castle) -- world 62-1, Mario stuck at spawn](/images/smb1-glitch-levels/lvl-4D-castle.png)
![Level ID $4B (tunnel) -- world 127-1, crashes if you go too far](/images/smb1-glitch-levels/lvl-4B-tunnel.png)

Six glitch worlds out of 248 producing something genuinely new. The rest are normal levels with the wrong zone type, or black screens.

## The level format in detail

Zooming into the exact level data format, to understand why glitch levels hold together (or not).

### The level header: 2 bytes, 6 properties

Each level starts with a 2-byte header controlling 6 properties:

```asm
; Byte 0: timer + Y start + modifier
;   Bits 7-6: timer (00=unchanged, 01=200, 10=300, 11=400)
;   Bits 5-3: Mario Y start (111/110 = autowalk)
;   Bits 2-0: level type modifier
;              000=default, 001=waves,
;              010=brick wall, 011=water bottom,
;              100=night, 101=snow,
;              110=snow night, 111=gray night

; Byte 1: platform + background + floor pattern
;   Bits 7-6: special platform (00=tree, 01=mushroom,
;                                 10=Bullet Bill, 11=cloud)
;   Bits 5-4: background (00=none, 01=clouds,
;                           10=mountains, 11=fences)
;   Bits 3-0: initial floor pattern (0-15)
```

The type modifier controls visual variations: waves atop water levels, the 8-3 brick background, the 4-3 night palette, 6-2 snow, etc.

### Tile objects: 2 bytes, Next Screen Flag, 3-slot queue

After the header comes a list of **tile objects**, each 2 bytes. Byte $FD marks the list end.

```asm
; Tile object format (16 bits):
; Byte 0:
;   Bits 7-4: X position (column 0-15)
;   Bits 3-0: Y position
;     Y=0-11  : normal Y position
;     Y=12    : special objects (holes, bridges, rope, ? blocks)
;     Y=13    : screen skip / special objects 2
;     Y=14    : modifier/scenery/floor change
;     Y=15    : special objects 3 (castle, stairs, big pipe)

; Byte 1:
;   Bit  7   : NEXT SCREEN FLAG
;   Bits 6-4 : object type (0-7)
;   Bits 3-0 : width/height / subtype
```

When the "next screen" bit is set, the current working column increments by 1. That places objects beyond the first 16 columns. Objects must be listed **in order** (left to right) because the game loads them sequentially:

```asm
; The load routine has TWO phases per column:
; Phase 1: find new objects starting on this column
;            and add them to the queue
; Phase 2: process each object in the queue by drawing tiles,
;            and remove those ending on this column
```

The queue is exactly **3 slots**. Direct consequence: you can't have more than 3 objects starting on the same column. If the queue is full, the 4th object is ignored and never loads.

That's why well-designed levels avoid stacking too many objects. Example in 1-2: the column with the 1up block in the ceiling + bricks next to it are split into two distinct objects to respect the 3 limit.

### Special Y positions: 12, 13, 14, 15

When Y=12, the object has no Y position (it's hardcoded by type):

```asm
; Y=12: objects with no Y position
;   Type 0: hole (removes ground)
;   Type 1: moving platform rope
;   Types 2-4: bridges at fixed Y
;   Type 5: hole with water/lava
;   Types 6-7: ? block rows
```

When Y=13, two subgroups. If byte 1's bit 6 is 1:

```asm
; Y=13, bit6=1: special objects
;   0 = L-pipe (cutscene), 1 = flagpole, 2-3 = bridge/axe/hammer (castle end)
;   4 = stop screen, 5 = random enemies, 6 = loop level, 7+ = possible crash
```

If bit6=0, the 5 low bits encode a **screen skip** (jumping straight to screen N, without going one by one via next screen flag).

When Y=14: same principle with bit6=1 to change the type modifier, bit6=0 to change background + floor pattern.

### Floor patterns: 16 ground motifs

Level ground isn't made of individual objects. SMB1 uses **floor patterns**, a background motif applying to all columns until the next change:

```asm
; Floor patterns (4 bits = 16 possibilities)
;   0 = total void
;   1 = 2-tile-high ground
;   2 = 1-tile-high ground
;   3 = ground + bottom
;   4 = ground + bottom 2
;   5 = 1/2 tile ground
;   6 = 3/4 ground
;   ... up to 15 = fully filled (ground + ceiling)
```

That's why holes are objects: they override the floor pattern on one specific column, without changing the pattern for everything else.

### The 256-byte limit and repeat

All tile data of a level fits in **256 bytes max**. The 6502's Y register serves as index, and it's 8-bit. If the game reaches the data end without meeting the $FD byte, **it loops back to the start** and repeats the 256 bytes forever:

```asm
; Y index = 8 bits → max 256 bytes of tile data
; If Y overflows (255 → 0) without meeting $FD → repeat
; Same for sprites, but pipe objects (3 bytes)
; shift index parity on each load.
```

Some glitch levels exploit that repeat to generate "endless" levels.

### The sprite system: 2 bytes + pipe transitions

Sprites follow a similar format, but with no header and a few key differences. Byte $FF marks the list end.

```asm
; Sprite format (2 bytes):
; Byte 0: X position (column)
; Byte 1:
;   Bit 7: NEXT SCREEN FLAG
;   Bits 6-0: sprite type
;       Some types include: goomba, koopa, Blooper,
;       Bullet Bill, Lakitu, Spiny, platforms,
;       warp zone command, toad/princess,
;       enemy group spawn commands
```

The low bit of byte 1 is the **hard level flag**: if set to 1, the sprite only appears in levels ≥ 5-3. That's how "hard mode" levels are created.

Y position 15 = **screen skip** (identical to tiles). Y position 14 = **pipe transition** (3 bytes):

```asm
; Sprite Y=14: pipe/vine transition (3 bytes!)
;   Byte 0: X position
;   Byte 1: bits 6-0 = destination 7-bit Level ID
;   Byte 2: bits 4-0 = destination screen
;            bits 7-5 = world where this transition is valid
;
; Why a world? Bonus rooms are reused across worlds.
; Example: the 1-1 bonus room is also used by 2-1 and 7-1.
; That room has 3 transitions, one per world, so Mario
; reappears at the right place.
```

Sprites have **no queue system**. The only limit is no more than 4 loaded sprites at once in the spawn zone (just off-screen right). Beyond that, sprites are ignored.

## How to reach glitch worlds

There are two main methods.

### The classic method: wall clip

Wall clip (passing through walls) lets you leave the normal level and walk to the hidden war zone. By manipulating the world counter via RAM, you can load any Level ID.

The technique:
1. World 1-2: go into the hidden end pipe
2. Wall-clip through the right wall
3. Walk through the void to the warp zone
4. The game interprets values as worlds

But that method only reaches a small share of glitch worlds.

### The extreme method: NES Tennis cart swap

See the "warm start" section above for full detail. In short: Tennis's footstep counter writes to the same RAM byte as SMB1's start world, and warm-start detection preserves that value.

### The tinkers' corner: code to explore everything

If you want to explore all glitches yourself in an emulator, you can patch the Level ID directly:

```asm
; Patch for FCEUX / Mesen:
; RAM address $075F = current Level ID
; RAM address $0760 = Area Type (0=Water, 1=Overworld, 2=Underground, 3=Castle)

; Example: load Level 57 (0x39) in Overworld
; In the emulator, open the memory tracer and write:
; $075F = 0x39
; $0760 = 0x01
; Then enter a warp pipe or die and restart
; → The game loads level ID $39 in Overworld
```

RGMechEx published the full list of 128 levels × 4 types with auto-generated maps at [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html). Each entry shows the tile pointer, sprite pointer, and a visual map of the level.

## The weirdest levels

### Level ID $1F (Water): 15 glitch worlds in one

Tile pointer $A302 (3-4) combined with sprite pointer $02A0 gives 15 different glitch worlds (D-1, J-1, Y-1, Z-1, 55-1, 73-1...). Explanation: the sprite pointer aims at a ROM zone holding data close enough to valid sprites to produce playable results, but combining 3-4 castle tiles with overworld sprites creates an absurd render.

### Level ID $28 (Overworld): 38 glitch worlds = record

The absolute record. 38 glitch world entries point at the same level (2-1 tiles + $9F51 sprites). Why? Because sprite pointer $9F51 lands in a ROM zone used as padding/sound data reused by many IDs.

### Level ID $49 (Underground): the FDS level

Tile pointer $76AE + sprite pointer $1C9D. The tile pointer aims at the ROM zone reserved for the Famicom Disk System version. Result: a level with tiles that don't exist in the standard cartridge. It's the level making levels 52-1 and 196-1 appear.

### Level IDs $00-$02: the real bonus levels

Those IDs are used by the game's legit sub-levels:

- **$00**: 5-2/6-2 underwater zone (used by H-1, 39-1)
- **$01**: 2-2/7-2 water (the Minus World, 36-1)
- **$02**: 8-4 sub-level (136-1, 151-1, 215-1)

The difference between a "bonus" level reachable normally and a glitch world is that warp zones check the current world:

```asm
; Warp zone check (simplified)
; The game checks the target world is between 1 and 8
CheckWarp:
  lda TARGET_WORLD
  cmp #1
  bcc InvalidWarp       ; < 1 → refused
  cmp #9
  bcs InvalidWarp       ; > 8 → refused
  ; valid world only between 1 and 8
  jmp DoWarp
```

Glitch worlds numbered > 8 or 0 can't be reached through normal pipes. You need the wall clip or cart swap.

## Why some levels crash: jump tables

When the game loads a tile object, it uses its type as an index into a **jump table**:

```asm
; Standard tile object jump table (types 0-11)
JumpTable_TileObjects:
  .word Obj_Special       ; type 0: ? block, hidden, flagpole...
  .word Obj_Platform      ; type 1: special platform
  .word Obj_BrickRow      ; type 2: brick row
  .word Obj_BlockRow      ; type 3: block row
  .word Obj_CoinRow       ; type 4: coin row
  .word Obj_BrickCol      ; type 5: brick column
  .word Obj_BlockCol      ; type 6: block column
  .word Obj_Pipe          ; type 7: pipe
  .word Obj_8             ; type 8
  .word Obj_9             ; type 9
  .word Obj_10            ; type 10
  .word Obj_11            ; type 11
```

![Jump tables: why an invalid object type crashes the game](/images/smb1-glitch-levels/v4-jump-table.jpg)

If an object has an invalid type (≥12), the game jumps to a pointer that doesn't exist in that table. **4 possible outcomes**:

1. **Valid pointer** → the object loads normally
2. **Pointer to another jump table** (overlap) → a different object appears. Example: type 12 points to the Y=13 table, giving an L-pipe.
3. **Pointer to executable code** → random code execution (likely crash)
4. **Explicit placeholder (NOP)** → the object does nothing (some sprites are like that, producing enemies hovering without moving)

![Glitch level ID $58: the sprite pointer aims at an invalid address, the game crashes](/images/smb1-glitch-levels/v4-glitch-58-crash.jpg)

![Glitch level ID $50: the cloud tunnel, a level generated from corrupted data](/images/smb1-glitch-levels/v4-glitch-50.jpg)

Glitch level ID $58 (the crashing tunnel): its sprite pointer aims at a memory region that **doesn't exist on NES without a ROM mapper**. The game tries loading the same Koopa 5 times per frame at position (0,0), saturating the PPU and freezing.

```asm
; Why ID $58 crashes:
; Sprite pointer → invalid address (outside standard NES space)
; → The game reads undetermined bytes as sprite types
; → The $00 Koopa (invalid type with no handler) loops in recursive calls
; → 6502 stack overflow → freeze
```

### The pipe warp paradox

Remember the `target_world BETWEEN 1 AND 8` check. Even if you find a pipe in a glitch world, the game checks the destination world is between 1 and 8. Glitch worlds have numbers > 8 (36-1, 255-1...), so warping fails.

That's also why the Minus World has no end: the flagpole isn't in the sprites, and pipes lead nowhere.

### The 5-objects-in-a-column trick

There's an edge case bypassing the 3-objects-per-column cap. When the queue jams (slots full + next object with no next screen flag), the game "pre-processes" the current column in a loop until it finds an object with next screen flag. During each preprocessing:

```asm
; During column preprocessing:
; 1. Objects in the queue see their remaining width
;    decremented on each "fake" column advance
; 2. If an object hits width=0, it leaves the queue
; 3. A freed slot can be filled by a new object
;    added in the same column

; Result: up to 5 objects can be processed on the same column.
; Technique: place 2 objects crossing the screen boundary
; (slots 1 and 2), 1 dummy object at X < previous (jams the queue),
; then 3 objects at X=0 of the next screen (one with next screen flag).
```

It's called a "queue skip" and romhackers use it to build denser levels than the format normally allows.

## Version differences

### Famicom Disk System

The FDS version of SMB1 has a **different memory map**. All level pointers shift, but data is the same. What changes: glitch world indices are completely different:

```
FDS World 36 → Level ID $09 (water version of 5-3)
  → The flagpole IS there! You can finish the level.
  → Then: $27 (normal 7-3) → $44 (underground 4-4)
  → $44 is finishable → the axe works → end of game!

  So the FDS Minus World is a "bonus world" that can lead
  to game completion, unlike the NES version.
```

My favorite FDS level: **ID $5F**, an underground version of 3-3's second half in a low tunnel (shame it's an autoscroller).

### The Lost Levels (Japanese Super Mario Bros. 2)

Lost Levels changes a lot:

1. **Identical tile/sprite order**: no more Frankenstein levels (tiles and sprites load the same level even with an invalid ID)
2. **A single 16-bit pointer table** instead of two separate high/low tables
3. **4 disk files**: the ROM got split for FDS:
   - File 1: worlds 1-4
   - File 2: worlds 5-8
   - File 3: world 9 + sound engine
   - File 4: worlds A-D (completely different pointer table)
4. **Same Level ID = 4 possible levels** depending on the loaded file
5. **No more Tennis glitch**: the continue option (continue at the same world after game over) makes warm start useless, and the game **resets immediately** if world > 9
6. **New objects**: poison mushroom, invisible block, invisible fire flower, upside down pipes, wind -- but inserted mid-list → **backward incompatibility** with SMB1
7. **Red Piranha Plants** always after world 4, **green springboards** only in worlds 2/B/3/C/7

### Super Mario All-Stars (SNES)

Direct port with the same 6502 routines (the SNES runs NES code in compat mode):

- **Fixed warp zone**: no more Minus World (entering the left pipe before the text leads to the right world)
- **Crashing**: most glitch levels crash (except ID $6A and 9-1)
- **Added castle objects**: made more unique
- **But**: the **4-2 wrong warp** still works (never patched!)

### The 4-2 wrong warp: an object placement bug

In 4-2, there are two pipe transition objects: the vine (warp zone) and the pipe (coin cash room). The first transition object (the vine's) sits **way before** the vine appears on screen. The second (the pipe's) sits **too late in the level**.

```asm
; Transition timing in 4-2:
; Transition object 1 (vine → warp zone): placed 3 screens before the vine
; Transition object 2 (pipe → coin cash): placed 1 screen after the pipe
;
; Normally the first object deactivates before Mario
; reaches the pipe. But if Mario is fast (or uses
; the B+right block shortcut), the vine transition
; is still active when he touches the pipe!
; → The game loads the warp zone instead of the coin cash.
;
; If the object had been placed just after the vine but before
; the pipe, the bug wouldn't exist.
```

### Loop levels

How do loop levels (8-4, 7-4) work? The level has **checkpoints** with screen numbers and hardcoded Y positions:

```asm
; Checkpoint: {screen_number, vertical_position}
; If Mario passes that checkpoint at the right height → level continues
; Otherwise → warp back 4 screens (64 blocks)
;
; For an infinite loop: vertical_position = $F0
; (below the screen bottom) → impossible to validate.
;
; Checkpoints are simple (one flag) except for world 7
; using triplets (3 flags, must fail at least 1)
;
; The warp back is harsh: tile data offset set to a
; hardcoded value, sprite data offset reset to 0. Present enemies
; instantly unload → firebars disappear.
```

## Changing the format, not the code

One of the most fascinating lessons of that architecture is that SMB1's devs managed to create a very expressive level system without ever touching the 6502 render code. All variation between levels comes from **data** (pointers, objects, sprites, floor patterns), never code.

The 256 glitch worlds exist because the **pointer tables are sized for 128 entries × 4 types**, and the game never validates the values it reads. When a pointer lands in RAM, the game interprets Mario's registers as tiles. When a pointer lands in sound data, the game plays music as level design. And when jump tables overflow, the game runs whatever until it crashes.

![More Super Mario Bros. Mechanics Explained -- the 4th video](/images/smb1-glitch-levels/yt-mechanics.jpg)

## What we can learn from all of that

1. **Tile/sprite separation**: total independence of both layers, with different storage orders creating unique Frankenstein levels
2. **RLE compression + object system**: levels aren't bitmaps but placed object lists, with floor patterns for ground
3. **3-slot queue**: strict hardware (and level design) cap
4. **Total trust in pointers**: the game trusts pointers and jump tables, producing either playable glitches or crashes
5. **256 bytes max**: the 6502 Y register limit, making data repeat if you go too far
6. **Warm start / cold start**: a "continue" system that opened the door to Tennis → Mario cart swap

Most beautiful of all: it's 6502 code fitting in 40KB. The code talks directly to hardware and places total trust in every memory access. If the pointer is rotten, the game crashes. And crashes, we call glitch worlds.

## The 3 things to remember

1. **Glitch worlds are pointers landing wrong** -- The game has 128 IDs × 4 zone types, but only 34 unique levels. When the world number is corrupted (by Tennis or wall clip), the game loads a pointer designed for another level, and the 512 possible combos produce unpredictable results.

2. **The Minus World is a warp bug combined with corruption** -- The left pipe in 1-2, if activated before the text appears, loads world 36 (0x24). That world points to Level ID $01 (2-2 water), a level with no flagpole. And since there's no pipe transition for world 36, the level loops forever. The missing check creates the icon.

3. **Tennis → Mario, 15 years before OoT → Paper Mario** -- The NES RAM survives a cartridge swap thanks to capacitors and SMB1's warm start / cold start system. Tennis's footstep counter (incrementing a RAM byte while playing footstep sounds) lands exactly on the world number address. The top-score digits must stay at 0, the $A5 byte intact, and the game must detect a warm start -- a perfect coincidence that only worked with Tennis.

[Retro Game Mechanics Explained](https://www.youtube.com/c/RetroGameMechanicsExplained)'s original videos are a hell of a meticulous job -- the detail level on 6502 disassembly, automatic maps of every level, cart swap and warm start explanations. If you haven't seen the series, watch it, it's short and every minute is dense.

The maps' source code is at [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html), and SMB1's full disassembly is open source on many repos. 40 years ago, Japanese programmers wrote that level system in 6502 with zero unit tests and zero bug trackers, and we keep learning optimization techniques by opening their code today.
