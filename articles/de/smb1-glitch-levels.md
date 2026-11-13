---
title: "Super Mario Bros.: das Levelformat, die Pointer und die 256 Glitch Worlds"
description: "Wie 128 Level × 4 Zonentypen in 40KB ROM passen, warum das Minus World existiert, und wie ein NES-Tennis-Match Glitch Worlds laden kann."
date: 2026-06-10
tags:
  - retro
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "vbPogwvBy0OHqGufK8G253IYBG7h0lqkpJ3B54qrmwRhYu7emRNoCE+nYRVOUSs0t8+QJwier7tU6kNhCezLxA=="
---

## Einleitung

Super Mario Bros. sind 40 Kilobyte ROM. Acht Welten, 32 Level, Gegner, Musik, Power-Ups, alles passt da hinein.

Aber wenn du einen Emulator öffnest und an den richtigen Bytes fummelst, kannst du Level 36-1 laden. Oder 255-1. Oder in einer Welt landen, wo alles aus Bowser-Sprites und Röhren besteht, die nirgendwohin führen.

Diese Glitch Worlds existieren aus einem simplen Grund: SMB1s Levelspeichersystem ist ein Wunderwerk 8-bit-Optimierung, und wenn man das Spiel zwingt zu lesen, wo es nicht soll, gibt das faszinierende Ergebnisse.

Retro Game Mechanics Explained hat eine 4-Video-Serie darüber gemacht, wir kompilieren sie zu einem einzigen Tauchgang in den 6502-Code des meistverkauften Spiels seiner Zeit.

![GLITCH OBJECTS, der Serientitel von RGMechEx über SMB1s versteckte Mechaniken](/images/smb1-glitch-levels/title-card.jpg)

![World 9-1, der Titelscreen der ersten via Tennis-Cart-Swap erreichbaren Glitch World](/images/smb1-glitch-levels/v1-title-9-1.jpg)

## Der Warm Start: warum Tennis-RAM in SMB1 überlebt

Bevor wir über Levelspeicherung reden, muss man verstehen, wie SMB1 startet. Denn der NES-Tennis-Cart-Swap-Glitch beruht vollständig auf SMB1s **Warm-Start-/Cold-Start-Erkennungssystem**.

### Die 41 erhaltenen Bytes

Wenn SMB1 einen **Cold Start** erkennt (erstes Einschalten oder Power off/on), löscht es den ganzen RAM. Wenn es einen **Warm Start** erkennt (Reset-Button, keine Stromunterbrechung), erhält es eine 41-Byte-Speicherzone:

```asm
; Die 41 erhaltenen RAM-Bytes bei Warm Start
; Adressen $075F-$0787
;
; $075F : Startbyte (world - 1)    [1 byte]
; $0760 : Weltwahl-Flag (B-Button) [1 byte]
; $0761-$0762 : ungenutzt                    [2 bytes]
; $0763-$0768 : Timer (6 Stellen, 3 angezeigt) [6 bytes]
; $0769-$076E : Luigi-Münzen                   [6 bytes]
; $076F-$0774 : Mario-Münzen                   [6 bytes]
; $0775-$077A : Luigi-Score                   [6 bytes]
; $077B-$0780 : Mario-Score                   [6 bytes]
; $0781-$0786 : Top Score (6 Stellen, 1 versteckt) [6 bytes]
; $0787 : das magische Byte $A5                 [1 byte]
```

Diese 41 Bytes dienen einer einzigen Funktion: Dem Spieler erlauben, nach einem Game Over in derselben Welt weiterzumachen. Wenn du in 6-3 stirbst, schreibt das Spiel Welt 6 ins Startbyte, und am Titelscreen startest du mit gehaltenem A + Start in 6-1 neu.

![Die 41 erhaltenen RAM-Bytes bei Warm Start, TOP SCORE, MARIO SCORE, TIMER, WORLD SELECT, CONTINUE WORLD und das magische $A5-Byte](/images/smb1-glitch-levels/v1-memory-state.jpg)

### Die doppelte Warm-Start-Prüfung

![Cold Start vs Warm Start, das Reset-Erkennungsdiagramm](/images/smb1-glitch-levels/v1-warm-start.jpg)

Wenn SMB1 bootet, prüft es nicht ein einziges Kriterium, sondern **zwei**:

```asm
CheckWarmStart:
  ; 1. Magisches Byte $A5 bei $0787 prüfen
  lda $0787
  cmp #$A5
  bne ColdStart        ; kein $A5 → Cold Start

  ; 2. Die 6 Stellen des Top Score ($0781-$0786) prüfen
  ;    Jede Stelle muss zwischen 0 und 9 liegen
  ldx #0
CheckLoop:
  lda $0781,x
  cmp #$0A
  bcs ColdStart        ; Stelle >= 10 → Cold Start
  inx
  cpx #6
  bne CheckLoop

  ; Wenn beide Bedingungen passen → Warm Start
  ; RAM wird nicht gelöscht, Startwelt wird erhalten
  jmp WarmStartBoot
```

![Die $A5-Byte- und Top-Score-Stellen-Prüfung, das Herz des Warm Starts](/images/smb1-glitch-levels/v1-a5-byte.jpg)

Warum eine doppelte Prüfung? Weil das $A5-Byte zufällig vorhanden sein könnte (ein anderes Spiel, das diesen Wert hinterlässt, oder der Default-Ruhezustand des RAM-Chips). Indem man prüft, dass die Top-Score-Stellen gültig sind (0-9), stellt man sicher, dass die Daten kohärent sind.

### Warum Tennis das einzige Spiel ist, das funktioniert

Wenn man SMB1 zum ersten Mal einlegt (Cold Start), macht das Spiel:
1. Löscht den ganzen RAM → Top Score = 0, World-Byte = 0
2. Schreibt $A5 an Adresse $0787

Danach swapt man auf Tennis, ohne die Konsole auszuschalten. Tennis:
- **Räumt den RAM beim Start nicht auf** (wenige NES-Spiele tun das)
- **Schreibt nicht auf die Top-Score-Bytes** → sie bleiben 0 (gültig)
- **Fasst das $A5-Byte nicht an** → es bleibt vorhanden
- **Nutzt Adresse $075F** für den Spielerschrittzähler

```asm
; Das Footstep-Increment in Tennis :
; Bei jedem Spielerschritt auf dem Court inkrementiert Tennis das Byte bei $075F.
; Dasselbe Byte nutzt SMB1 als "World Number - 1".
;
; 0 Schritte  → Welt 0 → SMB1 = Welt 1
; 1-7 Schritte → Welt 1-7 → normale Welten
; 8+ Schritte → Welt 8+ → Glitch Worlds !
;
; Der Zähler inkrementiert nur wenn die Musik stoppt
; (die Footstep-Sounds spielen nicht während der Musik).
```

Wenn man SMB1 zurücklegt:
1. Das $A5-Byte ist immer noch da (Tennis hat es nicht angefasst)
2. Die Top-Score-Stellen sind immer noch 0 (gültig)
3. Das World-Byte ist jetzt 8+ (von Tennis-Schritten inkrementiert)
4. SMB1 erkennt einen Warm Start → erhält das korrupte World-Byte
5. A + Start halten → Welt 9-1, Welt A-1, Welt 36-1 usw.

### Warum man Mario vor Tennis booten muss

Eine Subtilität: Man muss zuerst SMB1 booten, dann Tennis, dann wieder SMB1. Würde man direkt mit Tennis anfangen, würde das $A5-Byte nie geschrieben (Tennis schreibt kein $A5), also würde die Warm-Start-Erkennung scheitern und der RAM gelöscht.

![Der Tennis-Schrittzähler: Jeder Footstep inkrementiert das World-Byte](/images/smb1-glitch-levels/v1-footstep.jpg)

![Access Glitch Worlds via NES Tennis, das Video, das den Cart Swap erklärt](/images/smb1-glitch-levels/yt-tennis.jpg)

## Wie SMB1 seine Level in 40KB speichert

Nintendo R&D4 musste ein scheinbar simples Problem lösen: Horizontal scrollende Level mit Tiles, Gegnern, Items darstellen, alles in ultra-knappem ROM-Budget.

Die Lösung ist eine Trennung in zwei **komplett unabhängige** Datenschichten:

### Das Tile-Layout (die Levelkarte)

Jedes Level ist definiert durch einen Pointer auf eine in ROM komprimierte Tilestruktur. Die Kompression ist rudimentär aber genial: Ein "Kontroll"-Byte gefolgt von 1-3 Datenbytes.

Das Tileformat nutzt ein **Run**-System (RLE-artig):

```asm
; SMB1-Tileformat (vereinfacht)
; Jeder "Befehl" ist ein Kontrollbyte :
;
; $00-$7F : setzt eine Tile, rückt 1 Spalte vor
; $80-$BF : setzt eine N-mal wiederholte Tile (N = Byte - $80 + 1)
; $C0-$FF : Spezialbefehl (Zeilenende, Sprung, Palettenwechsel)

Beispiel : um 3 aufeinanderfolgende Bricks zu zeichnen :
  $82 $01    ; wiederholt Tile $01 (Brick) 3-mal
```

Jedes Level enthält 13 Zeilen zu 16 Tile-Spalten (13×16 = 208 sichtbare Tiles). Aber das komprimierte Format erlaubt, viel tiefer zu gehen, zum Beispiel nehmen Himmel und leere Spalten fast keinen Platz ein.

Die 6502-Render-Schleife:

```asm
; Tile-Dekompression, Hauptschleife
; Input : tile_data-Pointer in $XX
; Output : Level-Tilemap im PPU-RAM

DecompressTile:
  lda (tile_ptr),y      ; Kontrollbyte lesen
  iny
  cmp #$80
  bcc SingleTile        ; $00-$7F : einzelne Tile
  cmp #$C0
  bcc RunLength         ; $80-$BF : Run-Length
  jmp SpecialCommand    ; $C0-$FF : Spezialbefehl

SingleTile:
  sta PPU_DATA          ; Tile direkt schreiben
  jmp Next

RunLength:
  sec
  sbc #$7E              ; N = Control - $7E
  tax
  lda (tile_ptr),y      ; zu wiederholende Tile lesen
  iny
: sta PPU_DATA
  dex
  bne :-
  jmp Next
```

### Das Sprite-Layout (Gegner und Objekte)

Parallel dazu werden Gegner und Objekte (?-Blöcke, Röhren, Goombas, Koopas) in einer komplett separaten Struktur gespeichert. Jeder Spawn ist definiert durch 2 Bytes:

```asm
; SMB1-Spriteformat
; Byte 0 : X-Position (in Spalten)
; Byte 1 : Spritetyp + Y-Seitenbits
; Y wird vom Index in der Sequenz abgeleitet

Eine Sprite-Sequenz :
  $01 $4B    ; Goomba in Spalte 1
  $09 $4B    ; Goomba in Spalte 9
  $10 $61    ; ?-Block in Spalte 16 (enthält Münze)
  $15 $54    ; grüner Koopa in Spalte 21
  $FF        ; Sequenzende
```

Jedes Level kann bis zu 5 verschiedene Sprite-Seiten referenzieren (genau, 5 "Screens" zu 16 Spalten), aber in der Praxis nutzen die meisten Level nur 2-3.

### Die Pointer-Tabelle

Die Genialität des Designs ist die Pointer-Tabelle. Jedes Level wird als **Paar** von ROM-Adressen gespeichert:

```c
// Interne Struktur (vereinfacht) der World Map
struct LevelPointer {
    uint16_t tile_ptr;   // ROM-Adresse der Tile-Daten
    uint16_t sprite_ptr; // ROM-Adresse der Sprite-Daten
};

// 4 separate Tabellen, eine pro AreaType :
// 0 = Water, 1 = Overworld, 2 = Underground, 3 = Castle
LevelPointer level_table[4][128];
```

128 Einträge pro Tabelle. 4 Zonentypen. **512 mögliche Kombinationen**, aber nur ein Bruchteil wird vom offiziellen Spiel genutzt. Der Rest ist nicht initialisierter RAM oder Daten, die als Pointer interpretiert werden.

Wenn das Spiel ein Level lädt, macht es das:

```asm
; Laden eines Levels
; A = AreaType (0-3), X = LevelID (0-127)

LoadLevel:
  sta AREA_TYPE
  asl                  ; *2 für Offset in 16-bit Tabelle
  tax
  lda LevelTable_TilePtr, x
  sta TILE_PTR
  lda LevelTable_TilePtr+1, x
  sta TILE_PTR+1       ; Pointer auf Tiles
  lda LevelTable_SpritePtr, x
  sta SPRITE_PTR
  lda LevelTable_SpritePtr+1, x
  sta SPRITE_PTR+1     ; Pointer auf Sprites
  jsr DecompressTiles
```

Das Spiel vertraut den Pointern total: Es liest die Adresse in der Tabelle und dekomprimiert, was an dieser Adresse steht, Punkt.

![Level ID $06 (Water), 9-1, die Unterwasserversion von 6-2](/images/smb1-glitch-levels/lvl-06-9-1.png)

![Die Level-ID-Tabelle: 128 mögliche Einträge, 34 zugewiesen](/images/smb1-glitch-levels/v2-level-id-table.jpg)

![Die unterschiedliche Reihenfolge von Tile- und Sprite-Pointern, die Ursache der Frankenstein-Levels](/images/smb1-glitch-levels/v2-pointer-tables.jpg)

### Die 34 einzigartigen Level und das 7-bit-ID-System

![Der NES-RAM-Chip (MB8416A), er bewahrt Daten beim Cartridge-Swap](/images/smb1-glitch-levels/v1-ram-chip.jpg)

SMB1 hat nicht 32 Level, sondern **34 einzigartige Level**. Viele Level sind Duplikate (5-3 = 1-3 aber mit Bullet Bills), markiert mit "Hard Mode"-Flag. Die echten einzigartigen Level:
- **Wasser** (Typ 0): 3 Level (2-2, 7-2, Bonuszone 5-2/6-2)
- **Overworld** (Typ 1): 22 Level (inkl. der 2 Wolken-Bonusräume)
- **Underground** (Typ 2): 3 Level (inkl. der unterirdischen Bonusräume)
- **Castle** (Typ 3): 6 Level
- \+ 1 Cutscene-Raum (vor Untergrund/Wasser-Levels)
- \+ 1 Warp Zone von 4-2

Jedes Level hat eine ID auf **7 Bit**. Die 5 niederwertigen Bits = Nummer in der Untergruppe, die 2 hochwertigen Bits = Zonentyp:

```asm
; 7-bit Kodierung der Level-ID
; Bits 6-5 : Typ (00=Water, 01=Overworld, 10=Underground, 11=Castle)
; Bits 4-0 : Nummer in der Untergruppe
;
; Water IDs      : $00-$02  (Typen 00, Nummern 0-2)
; Overworld IDs  : $20-$35  (Typen 01, Nummern 0-21)
; Underground IDs: $40-$42  (Typen 10, Nummern 0-2)
; Castle IDs     : $60-$65  (Typen 11, Nummern 0-5)
;
; ID $25 = %0100101 → Typ 01 (Overworld), Nummer 5 → 1-1
; ID $23 = %0100011 → Typ 01 (Overworld), Nummer 3 → 6-2
```

**128 mögliche IDs** ($00-$7F), nur 34 echten Levels zugewiesen. Ungenutzte IDs zeigen auf irgendwas.

### Die Pointer-Tabellen: zwei Listen, zwei Reihenfolgen

Tile- und Sprite-Pointer sind nicht in derselben Reihenfolge gespeichert. Der Code nutzt zwei separate 16-bit-Listen (High Byte / Low Byte in zwei unterschiedlichen Tabellen):

```
Sprite-Pointer-Reihenfolge :
  Index 0-5   : Castle (6 Level)
  Index 6-27  : Overworld (22 Level)
  Index 28-30 : Underground (3 Level)
  Index 31-33 : Water (3 Level)

Tile-Pointer-Reihenfolge :
  Index 0-2   : Water (3 Level)
  Index 3-24  : Overworld (22 Level)
  Index 25-27 : Underground (3 Level)
  Index 28-33 : Castle (6 Level)
```

Warum unterschiedliche Reihenfolgen? Kein technischer Grund, wahrscheinlich wurden die Daten so während der Entwicklung organisiert. Aber es erzeugt eine faszinierende Konsequenz: Wenn eine Level-ID ungültig ist, laden Tile- und Sprite-Pointer *verschiedene* Level und erzeugen **Frankenstein-Levels**.

Um zwischen diesen zwei Listen zu navigieren, nutzt das Spiel kleine **Offset-Tabellen** (wie ein Inhaltsverzeichnis):

```asm
; Offset-Tabellen pro Typ (Water, Overworld, Underground, Castle)
; Jeder Eintrag = Startindex in der entsprechenden Liste

SpriteOffsetTable:
  .byte $1F, $06, $1C, $00    ; Water=31, Overworld=6, Underground=28, Castle=0

TileOffsetTable:
  .byte $00, $03, $19, $1C    ; Water=0, Overworld=3, Underground=25, Castle=28
```

Um Level 6-2 zu laden (ID $23, Overworld Nummer 3):

```asm
; 1. Typ = 01 (Overworld) → Index in Offset-Tabelle = 1
; 2. Sprite-Offset = SpriteOffsetTable[1] = 6
;    Finalindex = 6 + 3 (Levelnummer) = 9 → 10. Sprite-Pointer
; 3. Tile-Offset = TileOffsetTable[1] = 3
;    Finalindex = 3 + 3 = 6 → 7. Tile-Pointer
; 4. Ergebnis : Tile-Pointer $A619 + Sprite-Pointer $9ED0 = 6-2 ✓
```

Was passiert jetzt mit einer ungültigen ID wie $43 (Underground Nummer 3, existiert nicht)?

```asm
; ID $43, Typ = 10 (Underground), Nummer = 3
; Sprite-Offset = SpriteOffsetTable[2] = $1C = 28
;   Index = 28 + 3 = 31 → 32. Sprite-Pointer = Wasserbonus 5-2 !
; Tile-Offset = TileOffsetTable[2] = $19 = 25
;   Index = 25 + 3 = 28 → 29. Tile-Pointer = 1-4 (Castle) !
;
; Ergebnis : ein Untergrundlevel mit 1-4-Tiles
; und Bloopern aus der 5-2-Wasserzone. Ein echter Frankenstein.
```

![Level ID $43, Frankenstein-Level: 1-4-Tiles + 5-2-Wassersprites](/images/smb1-glitch-levels/lvl-43-frankenstein.png)

![Exploring Glitch Level Pointers, die Offset-Tabellen erklärt](/images/smb1-glitch-levels/yt-pointers.jpg)

![Die World-Index-Table, wenn Welt-9-Overflow ein Glitch-Level erzeugt](/images/smb1-glitch-levels/v2-world-index-table.jpg)

### Die World-Index-Table: warum Welt 9 overflowt

Es gibt eine 8-Byte-ROM-Tabelle, die den Index des ersten Levels jeder Welt (1-8) gibt. Und direkt danach die Tabelle der 36 Level-IDs aller Level in Spielreihenfolge.

```asm
; WorldIndexTable (8 bytes)
  .byte 0, 5, 10, 15, 20, 25, 28, 33
;   -> Welt 1 beginnt bei Level 0
;   -> Welt 2 beginnt bei Level 5
;   -> Welt 8 beginnt bei Level 33

; LevelIDTable (36 bytes)
  .byte $25, $28, $29, $26, $24, ... ; die 36 Level-IDs
```

Wenn man versucht, Welt 9 zu laden, liest das Spiel das 9. Byte von WorldIndexTable... das nicht existiert. Es overflowt um 1 Byte in LevelIDTable, liest den Wert $25 und nutzt $25 dann als Index in LevelIDTable (37. Eintrag), was erneut um 2 Bytes in SpriteOffsetTable overflowt und den Wert 6 liest.

```asm
; Welt 9 :
;   1. WorldIndexTable[8] (Overflow) → liest $25 in LevelIDTable
;   2. LevelIDTable[37] (Overflow) → liest 2. Byte von SpriteOffsetTable = 6
;   3. ID = 6 → Wasserlevel Nummer 6 (existiert nicht)
;   4. Tile-Pointer = Wasser-Pointer Nummer 6 = 6-2-Tiles
;   5. Sprite-Pointer = Index 31+6 = 37 > 33 → ungültiger Pointer
;   6. Ergebnis : 6-2 unter Wasser mit geglitchten Sprites
;      → Welt 9-1 !
```

Für Welt G (16) geht der Overflow noch weiter und fällt auf Level-ID $01, das Cutscene-Level vor 1-2:

```asm
; Welt G (16) :
;   WorldIndexTable[15] → liest $01 in LevelIDTable
;   LevelIDTable[1] = $29 (Cutscene 1-2)
;   → Welt G-1 = die 1-2-Eingangscutscene
```

## Warum Glitch Worlds existieren

Das Spiel hat 32 "legitime" Level (8 Welten × 4 Level). Aber die Pointer-Tabelle macht 128 Einträge pro Zonentyp. Einträge jenseits von Level 32 enthalten, was in ROM an diesen Adressen steht, manchmal ein anderes Level, manchmal Sounddaten, manchmal RAM, manchmal irgendwas.

![Level ID $01 Water (Minus World), Tile-Pointer $AE45, Sprite-Pointer $A171](/images/smb1-glitch-levels/minus-world.png)

### Level ID $01 + AreaType 0 = Minus World

Die berühmteste der Glitch Worlds. Level-ID $01 in AreaType 0 (Wasser) zeigt auf:

- **Tile-Pointer: $AE45** → die 2-2/7-2-Unterwasserzone
- **Sprite-Pointer: $A171** → die 2-2/7-2-Sprites

Das Ergebnis: Ein Wasserlevel, das wie 2-2 aussieht, aber endlos loopt, weil der Flagpole nicht existiert. Das Level läuft ewig im Kreis.

Das ist Level 36-1 (oder 36-1 in Welt $-1).

![Der SMB1-Warm-Start-Check, er ermöglicht erst das Minus World](/images/smb1-glitch-levels/v4-minus-world.jpg)

```asm
; Warum der Flagpole im Minus World fehlt :
; Die 2-2/7-2-Sprites ($A171) haben keinen Flagpole
; in ihrer Sequenz. Das Spiel sucht Sprite $FD (Flagpole)
; findet es aber nie → Endlosschleife
;
; Das Spiel generiert das Level endlos weiter
; bis der Timer null erreicht.
```

### Pointer, die auf RAM zeigen

Wenn Tile- oder Sprite-Pointer auf eine RAM-Adresse ($00-$7F) statt ROM zeigen, versucht das Spiel, die ständigen RAM-Änderungen als Tiles zu interpretieren:

```asm
; Beispiel : Level ID $03 in Water
; Tile-Pointer : $A46B (3-3, gültig)
; Sprite-Pointer : $009D (zeigt auf Zero-Page-RAM !)
;
; Zero-Page-RAM enthält Spielregister,
; Marios Position, Zählerzustände...
; Das Spiel dekomprimiert das als Sprite-Sequenz,
; und das Ergebnis ist ein Level mit Gegnern,
; die in Wahrheit Registerwerte sind.
```

Wenn sich Zero-Page ändert (weil sich Mario bewegt, der Timer läuft usw.), ändern sich auch die "Sprites" des Levels. Darum haben manche Glitch Worlds blinkende sich ständig transformierende Gegner.

![Level ID $03 Water, Sprite-Pointer $009D zeigt auf RAM, unspielbares Level](/images/smb1-glitch-levels/level-03-water.png)

### Level ID $36: das leere Level (Overworld)

Level-ID $36 in Overworld:

- **Tile-Pointer: $AC35** (1-2)
- **Sprite-Pointer: $A0D8** (1-2)

Ergebnis: Nichts. Das Spiel lädt das Level, aber es ist im RGMechEx-Katalog als "ohne Level" markiert. Die Tiles sind vielleicht gültig, aber die Sprites zeigen auf eine Stelle, die ein leeres oder nicht funktionierendes Level produziert.

### Level ID $1D (Castle): der Crash-Champion

Level-ID $1D in Castle:

- **Tile-Pointer: $A210** (4-4)
- **Sprite-Pointer: $7EA0** (RAM !)

Sprite-Pointer in RAM = undefinierte Sprites. Das Spiel versucht, einen Spiny Ball oder Bullet-Bill-Blaster in der ersten Tile-Zeile anzuzeigen. Das crasht sofort.

```asm
; Wenn der Sprite-Pointer auf RAM zeigt,
; dekomprimiert das Spiel sich ständig ändernde Bytes
; als "Spawn"-Instruktionen. Das Ergebnis :
; - Erscheinen nichtexistenter Objekte (undefinierter Wert)
; - PPU-Crash wenn das NES-Sprite ein ungültiges Tile anzeigen will
; - Kompletter Konsolen-Freeze
```

## Die 256 katalogisierten Glitch Worlds

RGMechEx schrieb ein Skript, das die Maps **aller Level** generiert, für die 4 Zonentypen und je 128 IDs.

Der Weltzähler ist 8-bit (0-255). Welten 1-8 sind legitim. Es bleiben **248 potenzielle Glitch Worlds**. Jede Glitch World entspricht dem ersten Level dieser Welt, und ihre Level-ID wird vom WorldIndexTable-Overflow-Mechanismus berechnet.

![Glitch-Worlds-Tabelle, 248 korrupte Welten, 68 erreichbare erste Level](/images/smb1-glitch-levels/v3-glitch-worlds-table.jpg)

Von 128 möglichen IDs sind nur **68 "First Level" einer Welt** (via Glitch-World-Number erreichbar). Die 60 anderen sind Level 2+ oder unerreichbar.

| Typ | Spielbare einzigartige IDs | Crashende IDs | Leere IDs |
|------|---------------------|-------------------|-----------|
| Water (0)    | ~20  | ~60  | ~48  |
| Overworld (1)| ~30  | ~55  | ~43  |
| Underground (2) | ~15 | ~65 | ~48  |
| Castle (3)   | ~25  | ~58  | ~45  |

Viele IDs führen zum selben Level, weil Pointer auf dieselben ROM-Adressen fallen. Level-ID $28 (Overworld) zum Beispiel, Tile-Pointer $A7CD (2-1), erscheint in **38 verschiedenen Glitch Worlds**, weil sein Sprite-Pointer $9F51 auf eine ROM-Zone zeigt, die als Padding/Sounddaten von vielen IDs wiederverwendet wird.

![Karte von Level-ID $28 (Overworld), 2-1-Tiles mit normalen Sprites, 38 Glitch Worlds](/images/smb1-glitch-levels/level-28-overworld.png)

![Super Mario Bros. Glitch Levels Explained, das 3. Video](/images/smb1-glitch-levels/yt-levels.jpg)

### Die 6 wirklich einzigartigen Glitch Levels

Unter den 19 erreichbaren Glitch-Level-IDs **crashen nur 6 nicht sofort** beim Laden:

| Welt | Level-ID | Beschreibung |
|-------|----------|-------------|
| E-1 (224) | $50 | Ein einzelner ?-Block über einem Abgrund. Mario stirbt instantan. |
| W | $57 | Mario spawnt blockiert, unfähig sich zu bewegen. |
| 42 (133) | $50 | Wolkentunnel, der Mario fängt, wenn er weit genug geht. |
| 62 (131, 240) | $4D | Gefrorenes Schloss: Mario spawnt oben, kann nicht fallen → blockiert. |
| 127 | $4B | Untergrundtunnel, crasht aber wenn man zu weit geht. |
| 137 | $4B | Aktiviert Cutscene-Autoscroll. Mario trifft einen einzigen Brick-Block, der ihn für immer blockiert. |

![Level ID $50 (Cloud Tunnel), Glitch World 42-1 und E-1](/images/smb1-glitch-levels/lvl-50-cloud.png)
![Level ID $4D (Castle), Welt 62-1, Mario am Spawn blockiert](/images/smb1-glitch-levels/lvl-4D-castle.png)
![Level ID $4B (Tunnel), Welt 127-1, crasht wenn man zu weit geht](/images/smb1-glitch-levels/lvl-4B-tunnel.png)

Sechs Glitch Worlds von 248, die etwas wirklich Neues produzieren. Der Rest sind normale Level mit falschem Zonentyp oder schwarze Screens.

## Das Levelformat im Detail

Fokus auf das exakte Leveldatenformat, um zu verstehen, warum Glitch Levels stehen (oder nicht).

### Der Level-Header: 2 Bytes, 6 Eigenschaften

Jedes Level beginnt mit einem 2-Byte-Header, der 6 Eigenschaften steuert:

```asm
; Byte 0 : Timer + Y-Start + Modifier
;   Bits 7-6 : Timer (00=unverändert, 01=200, 10=300, 11=400)
;   Bits 5-3 : Y-Start Mario (111/110 = Autowalk)
;   Bits 2-0 : Leveltyp-Modifier
;              000=default, 001=Wellen, 010=Brickwall,
;              011=Wasserboden, 100=Nacht, 101=Schnee,
;              110=Schneenacht, 111=graue Nacht

; Byte 1 : Plattform + Hintergrund + Bodenmuster
;   Bits 7-6 : Spezialplattform (00=Baum, 01=Pilz,
;                                 10=Bullet Bill, 11=Wolke)
;   Bits 5-4 : Hintergrund (00=keiner, 01=Wolken,
;                           10=Berge, 11=Zäune)
;   Bits 3-0 : initiales Bodenmuster (0-15)
```

Der Typ-Modifier steuert visuelle Variationen: Die Wellen oben in Wasserlevels, der Brickhintergrund von 8-3, die Nachtpalette von 4-3, der Schnee von 6-2 usw.

### Die Tile-Objekte: 2 Bytes, Next-Screen-Flag, 3-Slot-Queue

Nach dem Header kommt eine Liste von **Tile-Objekten**, jedes Objekt 2 Bytes groß. Byte $FD markiert das Listenende.

```asm
; Tile-Objektformat (16 Bit) :
; Byte 0 :
;   Bits 7-4 : X-Position (Spalte 0-15)
;   Bits 3-0 : Y-Position
;     Y=0-11  : normale Y-Position
;     Y=12    : Spezialobjekte (Löcher, Brücken, Seil, ?-Blöcke)
;     Y=13    : Screen Skip / Spezialobjekte 2
;     Y=14    : Modifier/Scenery/Floor-Wechsel
;     Y=15    : Spezialobjekte 3 (Schloss, Treppen, große Röhre)

; Byte 1 :
;   Bit  7   : NEXT-SCREEN-FLAG
;   Bits 6-4 : Objekttyp (0-7)
;   Bits 3-0 : Breite/Höhe / Subtyp
```

Wenn das "Next Screen"-Bit gesetzt ist, wird die aktuelle Arbeitsspalte um 1 inkrementiert. Das erlaubt, Objekte jenseits der ersten 16 Spalten zu platzieren. Objekte müssen **der Reihe nach** gelistet sein (links nach rechts), weil das Spiel sie sequenziell lädt:

```asm
; Die Laderoutine hat ZWEI Phasen pro Spalte :
; Phase 1 : neue Objekte suchen, die auf dieser Spalte starten
;            und in die Warteschlange (Queue) legen
; Phase 2 : jedes Objekt in der Queue verarbeiten, indem Tiles gezeichnet werden,
;            und die entfernen, die auf dieser Spalte enden
```

Die Queue macht exakt **3 Slots**. Direkte Konsequenz: Man kann nicht mehr als 3 Objekte haben, die auf derselben Spalte starten. Wenn die Queue voll ist, wird das 4. Objekt ignoriert und nie geladen.

Darum vermeiden gut designte Level, zu viele Objekte zu stapeln. Beispiel in 1-2: Die Spalte mit dem 1up-Block in der Decke + den Bricks daneben ist in zwei separate Objekte gesplittet, um das 3er-Limit einzuhalten.

### Spezielle Y-Position: 12, 13, 14, 15

Wenn Y=12, hat das Objekt keine Y-Position (sie ist per Typ hardcoded):

```asm
; Y=12 : Objekte ohne Y-Position
;   Typ 0 : Loch (entfernt Boden)
;   Typ 1 : Seil mobiler Plattform
;   Typen 2-4 : Brücken auf fixem Y
;   Typ 5 : Loch mit Wasser/Lava
;   Typen 6-7 : Reihen von ?-Blöcken
```

Wenn Y=13, zwei Untergruppen. Wenn Bit 6 von Byte 1 auf 1 steht:

```asm
; Y=13, Bit6=1 : Spezialobjekte
;   0 = L-Pipe (Cutscene), 1 = Flagpole, 2-3 = Brücke/Axt/Hammer (Schlossende)
;   4 = Stop Screen, 5 = Zufallsgegner, 6 = Loop Level, 7+ = möglicher Crash
```

Wenn Bit6=0, kodieren die 5 niederwertigen Bits einen **Screen Skip** (direkt zu Screen N springen, ohne Next-Screen-Flag eins nach dem anderen).

Wenn Y=14: Gleiches Prinzip mit Bit6=1 für Typ-Modifier-Wechsel, Bit6=0 für Hintergrund- + Bodenmuster-Wechsel.

### Die Bodenmuster: 16 Bodenmotive

Der Levelboden besteht nicht aus Einzelobjekten. SMB1 nutzt **Floor Patterns**, ein Hintergrundmotiv, das auf alle Spalten bis zum nächsten Wechsel angewendet wird:

```asm
; Floor Patterns (4 Bit = 16 Möglichkeiten)
;   0 = total leer
;   1 = 2 Tiles hoher Boden
;   2 = 1 Tile hoher Boden
;   3 = Boden + Unterteil
;   4 = Boden + Unterteil 2
;   5 = 1/2-Tile-Boden
;   6 = 3/4-Boden
;   ... bis 15 = total gefüllt (Boden + Decke)
```

Darum sind Löcher Objekte: Sie overriden das Floor Pattern auf einer spezifischen Spalte, ohne das Pattern für den Rest ändern zu müssen.

### Das 256-Byte-Limit und Repeat

Alle Tile-Daten eines Levels passen in **maximal 256 Bytes**. Das 6502-Y-Register wird als Index genutzt, und es ist 8-bit. Wenn das Spiel ans Datenende kommt, ohne Byte $FD zu finden, **loopt es zum Anfang zurück** und wiederholt die 256 Bytes endlos:

```asm
; Index Y = 8 Bit → max 256 Bytes Tile-Daten
; Wenn Y overflowt (255 → 0) ohne $FD zu treffen → Repeat
; Dasselbe für Sprites, aber Pipe-Objekte (3 Bytes)
; verschieben die Indexparität bei jedem Laden.
```

Manche Glitch Levels nutzen dieses Repeat, um "unendlich" dauernde Level zu generieren.

### Das Spritesystem: 2 Bytes + Pipe-Transitions

Sprites folgen einem ähnlichen Format, aber ohne Header und mit einigen Schlüsselunterschieden. Byte $FF markiert das Listenende.

```asm
; Spriteformat (2 Bytes) :
; Byte 0 : X-Position (Spalte)
; Byte 1 :
;   Bit 7 : NEXT-SCREEN-FLAG
;   Bits 6-0 : Spritetyp
;       Manche Typen inklusive : Goomba, Koopa, Blooper,
;       Bullet Bill, Lakitu, Spiny, Plattformen,
;       Warp-Zone-Befehl, Toad/Prinzessin,
;       Gruppengegnerspawn-Befehle
```

Das niederwertige Bit von Byte 1 ist das **Hard-Level-Flag**: Wenn auf 1 gesetzt, erscheint das Sprite nur in Levels ≥ 5-3. So werden "Hard Mode"-Level erstellt.

Y-Position 15 = **Screen Skip** (identisch zu Tiles). Y-Position 14 = **Pipe Transition** (3 Bytes):

```asm
; Sprite Y=14 : Pipe/Vine-Transition (3 Bytes !)
;   Byte 0 : X-Position
;   Byte 1 : Bits 6-0 = 7-bit Level-ID (Ziel)
;   Byte 2 : Bits 4-0 = Zielscreen
;            Bits 7-5 = Welt wo diese Transition gültig ist
;
; Warum eine Welt ? Bonusräume werden zwischen Welten wiederverwendet.
; Beispiel : Der 1-1-Bonusraum wird auch von 2-1 und 7-1 genutzt.
; Dieser Raum hat 3 Transitionen, eine pro Welt, damit Mario
; am richtigen Ort wiedererscheint.
```

Sprites **haben kein Queue-System**. Das einzige Limit ist, dass nicht mehr als 4 Sprites gleichzeitig in der Spawnzone (knapp rechts außerhalb des Screens) geladen sein können. Darüber werden Sprites ignoriert.

## Wie man an Glitch Worlds kommt

Es gibt zwei Hauptmethoden.

### Die klassische Methode: der Wall Clip

Der Wall Clip (durch Wände gehen) erlaubt, das normale Level zu verlassen und bis zur versteckten Warpzone zu laufen. Indem man den Weltzähler via RAM manipuliert, kann man jede Level-ID laden.

Die Technik:
1. Welt 1-2: In die versteckte Endröhre gehen
2. Den Wall Clip an der rechten Wand machen
3. In der Leere bis zur Warpzone laufen
4. Das Spiel interpretiert die Werte als Welten

Aber diese Methode gibt nur Zugang zu einem kleinen Teil der Glitch Worlds.

### Die extreme Methode: NES-Tennis-Cart-Swap

Siehe Abschnitt "Der Warm Start" oben fürs komplette Detail. Zusammengefasst: Tennis-Schrittzähler schreibt auf dasselbe RAM-Byte wie SMB1s Startwelt, und die Warm-Start-Erkennung erhält diesen Wert.

### Die Bastlerecke: der Code um alles zu erkunden

Wenn du alle Glitches selbst in einem Emulator erkunden willst, kannst du die Level-ID direkt patchen:

```asm
; Patch für FCEUX / Mesen :
; RAM-Adresse $075F = aktuelle Level-ID
; RAM-Adresse $0760 = Area Type (0=Water, 1=Overworld, 2=Underground, 3=Castle)

; Beispiel : Level 57 (0x39) in Overworld laden
; Im Emulator Memory Tracer öffnen und schreiben :
; $075F = 0x39
; $0760 = 0x01
; Dann in eine Warp-Röhre gehen oder sterben und neu starten
; → Das Spiel lädt Level-ID $39 in Overworld
```

RGMechEx hat die komplette Liste der 128 Level × 4 Typen mit automatisch generierten Maps auf [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html) publiziert. Jeder Eintrag zeigt Tile-Pointer, Sprite-Pointer und eine visuelle Levelkarte.

## Die wtf-igsten Level

### Level ID $1F (Water): 15 Glitch Worlds in einem

Tile-Pointer $A302 (3-4) kombiniert mit Sprite-Pointer $02A0 gibt 15 verschiedene Glitch Worlds (D-1, J-1, Y-1, Z-1, 55-1, 73-1...). Erklärung: Der Sprite-Pointer zeigt auf eine ROM-Zone, die Daten enthält, die nah genug an gültigen Sprites sind, um spielbare Ergebnisse zu produzieren, aber die Kombination aus 3-4-Castle-Tiles mit Overworld-Sprites erzeugt absurdes Rendering.

### Level ID $28 (Overworld): 38 Glitch Worlds = Rekord

Der absolute Rekord. 38 Glitch-World-Einträge zeigen auf dasselbe Level (2-1-Tiles + $9F51-Sprites). Warum? Weil Sprite-Pointer $9F51 in eine ROM-Zone fällt, die als Padding/Sounddaten von vielen IDs wiederverwendet wird.

### Level ID $49 (Underground): das FDS-Level

Tile-Pointer $76AE + Sprite-Pointer $1C9D. Der Tile-Pointer zeigt auf die für die Famicom-Disk-System-Version reservierte ROM-Zone. Ergebnis: Ein Level mit Tiles, die in der Standard-Cartridge nicht existieren. Das Level lässt Level 52-1 und 196-1 erscheinen.

### Level ID $00-$02: die echten Bonuslevel

Diese IDs werden von legitimen Spiel-Unterlevels genutzt:

- **$00**: 5-2/6-2-Unterwasserzone (genutzt von H-1, 39-1)
- **$01**: 2-2/7-2-Wasser (das Minus World, 36-1)
- **$02**: 8-4-Unterlevel (136-1, 151-1, 215-1)

Der Unterschied zwischen einem normal erreichbaren "Bonus"-Level und einer Glitch World ist, dass Warpzonen die aktuelle Welt prüfen:

```asm
; Warp-Zone-Prüfung (vereinfacht)
; Das Spiel prüft dass die Zielwelt zwischen 1 und 8 liegt
CheckWarp:
  lda TARGET_WORLD
  cmp #1
  bcc InvalidWarp       ; < 1 → abgelehnt
  cmp #9
  bcs InvalidWarp       ; > 8 → abgelehnt
  ; gültige Welt nur zwischen 1 und 8
  jmp DoWarp
```

Glitch Worlds mit Nummern > 8 oder 0 können nicht via normale Röhren erreicht werden. Man braucht Wall Clip oder Cart Swap.

## Warum manche Level crashen: die Jump Tables

Wenn das Spiel ein Tile-Objekt lädt, nutzt es seinen Typ als Index in einer **Jump Table**:

```asm
; Jump Table der Standard-Tile-Objekte (Typen 0-11)
JumpTable_TileObjects:
  .word Obj_Special       ; Typ 0 : ?-Block, Hidden, Flagpole...
  .word Obj_Platform      ; Typ 1 : Spezialplattform
  .word Obj_BrickRow      ; Typ 2 : Brickreihe
  .word Obj_BlockRow      ; Typ 3 : Blockreihe
  .word Obj_CoinRow       ; Typ 4 : Münzreihe
  .word Obj_BrickCol      ; Typ 5 : Bricksäule
  .word Obj_BlockCol      ; Typ 6 : Blocksäule
  .word Obj_Pipe          ; Typ 7 : Röhre
  .word Obj_8             ; Typ 8
  .word Obj_9             ; Typ 9
  .word Obj_10            ; Typ 10
  .word Obj_11            ; Typ 11
```

![Die Jump Tables: warum ein ungültiger Objekttyp das Spiel crasht](/images/smb1-glitch-levels/v4-jump-table.jpg)

Wenn ein Objekt einen ungültigen Typ hat (≥12), springt das Spiel auf einen Pointer, der in dieser Tabelle nicht existiert. **4 mögliche Outcomes**:

1. **Gültiger Pointer** → das Objekt lädt normal
2. **Pointer auf eine andere Jump Table** (Überlappung) → ein anderes Objekt erscheint. Beispiel: Typ 12 zeigt auf die Y=13-Tabelle, was eine L-Pipe gibt.
3. **Pointer auf Executable** → Ausführung zufälligen Codes (wahrscheinlicher Crash)
4. **Expliziter Placeholder (NOP)** → das Objekt tut nichts (manche Sprites sind so und produzieren Gegner, die reglos in der Luft fliegen)

![Glitch-Level-ID $58: der Sprite-Pointer zeigt auf eine ungültige Adresse, das Spiel crasht](/images/smb1-glitch-levels/v4-glitch-58-crash.jpg)

![Glitch-Level-ID $50: der Cloud Tunnel, ein aus korrupten Daten generiertes Level](/images/smb1-glitch-levels/v4-glitch-50.jpg)

Glitch-Level-ID $58 (der crashende Tunnel): Sein Sprite-Pointer zeigt auf eine Speicherregion, die **auf NES ohne ROM-Mapper nicht existiert**. Das Spiel versucht, denselben Koopa 5-mal pro Frame an Position (0,0) zu laden, was die PPU sättigt und einen Freeze verursacht.

```asm
; Warum ID $58 crasht :
; Sprite-Pointer → ungültige Adresse (außerhalb NES-Standardraum)
; → Das Spiel liest unbestimmte Bytes als Spritetypen
; → Koopa $00 (ungültiger Typ ohne Handler) loopt in rekursivem Call
; → 6502-Stack-Overflow → Freeze
```

### Das Pipe-Warp-Paradox

Erinnere dich an den Check `target_world BETWEEN 1 AND 8`. Selbst wenn du in einer Glitch World eine Röhre findest, prüft das Spiel, dass die Zielwelt zwischen 1 und 8 liegt. Glitch Worlds haben Nummern > 8 (36-1, 255-1...), also schlägt der Warp fehl.

Darum hat das Minus World auch kein Ende: Der Flagpole ist nicht in den Sprites, und die Röhren führen nirgendwohin.

### Der Trick mit 5 Objekten in einer Spalte

Es gibt einen Edge Case, der das 3-Objekte-pro-Spalte-Limit umgeht. Wenn die Queue blockiert (Slots voll + folgendes Objekt ohne Next-Screen-Flag), "präprozessiert" das Spiel die aktuelle Spalte in Schleife, bis es ein Objekt mit Next-Screen-Flag findet. Bei jedem Präprozessieren:

```asm
; Während Spalten-Präprozessieren :
; 1. Objekte in der Queue sehen ihre Restbreite
;    bei jedem "falschen Spaltenvorrücken" dekrementiert
; 2. Wenn ein Objekt Breite=0 erreicht, verlässt es die Queue
; 3. Ein freier Slot kann von einem neuen Objekt gefüllt werden
;    das in derselben Spalte hinzugefügt wird

; Ergebnis : bis zu 5 Objekte können auf derselben Spalte verarbeitet werden.
; Technik : 2 Objekte platzieren, die die Screen-Boundary queren
; (Slots 1 und 2), 1 Dummy-Objekt bei X < vorherigem (blockiert Queue),
; dann 3 Objekte bei X=0 des Folgescreens (eines mit Next-Screen-Flag).
```

Das nennt man "Queue Skip" und manche Romhacker nutzen es, um dichtere Level zu erstellen als das Format normal erlaubt.

## Die Versionsunterschiede

### Famicom Disk System

Die FDS-Version von SMB1 hat eine **andere Memory Map**. Alle Level-Pointer sind verschoben, aber die Daten sind dieselben. Was sich ändert: Die Glitch-World-Indizes sind komplett anders:

```
FDS-Welt 36 → Level-ID $09 (Wasserversion von 5-3)
  → Der Flagpole ist vorhanden ! Man kann das Level beenden.
  → Danach : $27 (normales 7-3) → $44 (4-4 Underground)
  → $44 ist beendbar → die Axt funktioniert → Spielende !

Das FDS-Minus-World ist also eine "Bonuswelt", die zur
Spielkomplettierung führen kann, anders als die NES-Version.
```

Mein Lieblings-FDS-Level: **ID $5F**, eine Untergrundversion der zweiten 3-3-Hälfte als niedriger Tunnel (schade, dass es ein Autoscroller ist).

### The Lost Levels (japanisches Super Mario Bros. 2)

Lost Levels ändert viel:

1. **Identische Tile/Sprite-Reihenfolge**: Keine Frankenstein-Levels mehr (Tiles und Sprites laden dasselbe Level selbst mit ungültiger ID)
2. **Eine einzige 16-bit Pointer-Tabelle** statt zwei separater High/Low-Tabellen
3. **4 Disk-Dateien**: Die ROM wurde für FDS gesplittet:
   - Datei 1: Welten 1-4
   - Datei 2: Welten 5-8
   - Datei 3: Welt 9 + Sound-Engine
   - Datei 4: Welten A-D (komplett andere Pointer-Tabelle)
4. **Gleiche Level-ID = 4 mögliche Level** je nach geladener Datei
5. **Kein Tennis-Glitch mehr**: Die Continue-Option (Weitermachen in derselben Welt nach Game Over) macht Warm Start unnütz, und das Spiel **resettet sofort**, wenn Welt > 9
6. **Neue Objekte**: Giftpilz, unsichtbarer Block, unsichtbarer Feuerblumenblock, Upside-Down-Pipes, Wind, aber mitten in existierende Listen eingefügt → **Backward-Inkompatibilität** mit SMB1
7. **Piranha-Pflanzen nach Welt 4 immer rot**, **grüne Springboards** nur in Welten 2/B/3/C/7

### Super Mario All-Stars (SNES)

Direkter Port mit denselben 6502-Routinen (SNES führt NES-Code im Kompatibilitätsmodus aus):
- **Warpzone gefixt**: Kein Minus World mehr (in die linke Röhre vor dem Text gehen führt zur richtigen Welt)
- **Absturz**: Die meisten Glitch Levels crashen (außer ID $6A und 9-1)
- **Schlossobjekte hinzugefügt**: Einzigartigere Render
- **Aber**: Der **4-2 Wrong Warp** funktioniert noch (nicht gepatcht !)

### Der 4-2 Wrong Warp: ein Objektplatzierungsbug

In 4-2 gibt es zwei Pipe-Transition-Objekte: Die Ranke (Warpzone) und die Röhre (Coin-Cash-Room). Das erste Transition-Objekt (das der Ranke) ist **weit vor** dem Rankenerscheinen auf dem Screen platziert. Das zweite (die Röhre) ist **zu spät im Level** platziert.

```asm
; Transition-Timing in 4-2 :
; Transition-Objekt 1 (Ranke → Warpzone) : 3 Screens vor der Ranke platziert
; Transition-Objekt 2 (Röhre → Coin Cash) : 1 Screen nach der Röhre platziert
;
; Normalerweise ist das erste Objekt deaktiviert bevor Mario
; die Röhre erreicht. Aber wenn Mario schnell ist (oder
; den B+Right-Block-Shortcut nutzt), ist die Rankentransition
; noch aktiv wenn er die Röhre berührt !
; → Das Spiel lädt die Warpzone statt des Coin Cash.
;
; Wäre das Objekt direkt nach der Ranke aber vor
; der Röhre platziert, existierte der Bug nicht.
```

### Die Loop-Level

Wie funktionieren Loops (8-4, 7-4)? Das Level hat **Checkpoints** mit hardcodierten Screennummern und Y-Positionen:

```asm
; Checkpoint : {screen_number, vertical_position}
; Wenn Mario diesen Checkpoint auf richtiger Höhe passiert → Level geht weiter
; Sonst → Warp back um 4 Screens (64 Blöcke)
;
; Für Endlosschleife : vertical_position = $F0
; (unterhalb des Screenbodens) → unmöglich zu validieren.
;
; Checkpoints sind simpel (ein einziges Flag) außer für Welt 7
; die Triplets nutzt (3 Flags, man muss mindestens 1 failen)
;
; Der Warp back ist ruppig : Tile-Data-Offset auf hardcoded Wert gesetzt,
; Sprite-Data-Offset auf 0 zurückgesetzt. Vorhandene Gegner
; werden instant entladen → Firebars verschwinden.
```

## Format ändern, nicht Code

Eine der faszinierendsten Lehren dieser Architektur ist, dass SMB1s Entwickler ein sehr expressives Levelsystem schufen, ohne je den 6502-Render-Code anzufassen. Alle Variation zwischen Levels kommt aus **Daten** (Pointer, Objekte, Sprites, Floor Patterns), nicht aus Code.

Die 256 Glitch Worlds existieren, weil die **Pointer-Tabellen für 128 Einträge × 4 Typen dimensioniert** sind und das Spiel nie validiert, was es liest. Wenn ein Pointer in RAM fällt, interpretiert das Spiel Marios Register als Tiles. Wenn ein Pointer in Sounddaten fällt, spielt das Spiel Musik als Leveldesign. Und wenn Jump Tables overflown, führt das Spiel irgendwas bis zum Crash aus.

![More Super Mario Bros. Mechanics Explained, das 4. Video](/images/smb1-glitch-levels/yt-mechanics.jpg)

## Was man daraus lernen kann

1. **Tile/Sprite-Trennung**: Totale Unabhängigkeit beider Schichten, mit unterschiedlichen Speicherreihenfolgen, die einzigartige Frankenstein-Levels erzeugen
2. **RLE-Kompression + Objektsystem**: Level sind keine Bitmaps, sondern platzierte Objektlisten, mit Floor Patterns für den Boden
3. **3-Slot-Queue**: Striktes Hardware- (und Leveldesign-) Limit
4. **Totales Pointer-Vertrauen**: Das Spiel vertraut Pointern und Jump Tables, was entweder spielbare Glitches oder Crashes produziert
5. **Max 256 Bytes**: Das 6502-Y-Register-Limit, das Daten bei zu weitem Gehen wiederholen lässt
6. **Warm Start / Cold Start**: Ein "Continue"-System, das die Tür zum Tennis → Mario-Cart-Swap öffnete

Das Schönste: Das alles ist 6502-Code, der in 40KB passt. Der Code redet direkt mit der Hardware und schenkt jedem Speicherzugriff totales Vertrauen. Wenn der Pointer faul ist, crasht das Spiel. Und Crashes nennen wir Glitch Worlds.

## Die 3 Dinge zum Mitnehmen

1. **Glitch Worlds sind schlecht fallende Pointer**, das Spiel hat 128 IDs × 4 Zonentypen, aber nur 34 einzigartige Level. Wenn die World-Number korrupt ist (durch Tennis oder Wall Clip), lädt das Spiel einen Pointer, der für ein anderes Level designed war, und die 512 möglichen Kombinationen produzieren unvorhersehbare Ergebnisse.

2. **Das Minus World ist ein Warp-Bug kombiniert mit Korruption**, die linke Röhre in 1-2 lädt, wenn vor Texterscheinen aktiviert, Welt 36 (0x24). Diese Welt zeigt auf Level-ID $01 (2-2-Wasser), ein Level ohne Flagpole. Und da es keine Pipe-Transition für Welt 36 gibt, loopt das Level endlos. Das Fehlen von Prüfung erschafft die Ikone.

3. **Tennis → Mario, 15 Jahre vor OoT → Paper Mario**, NES-RAM überlebt einen Cartridge-Swap dank Kondensatoren und SMB1s Warm-Start-/Cold-Start-System. Tennis-Schrittzähler (der ein RAM-Byte beim Abspielen der Schritt-Sounds inkrementiert) fällt genau auf die World-Number-Adresse. Die Top-Score-Stellen müssen 0 bleiben, das $A5-Byte intakt, und das Spiel muss einen Warm Start erkennen, ein perfekter Umständewettbewerb, der nur mit Tennis funktionierte.

Die Originalvideos von [Retro Game Mechanics Explained](https://www.youtube.com/c/RetroGameMechanicsExplained) sind eine wahnsinnige Ameisenarbeit, der Detailgrad zum 6502-Disassembly, die automatischen Maps aller Level, die Erklärungen von Cart Swap und Warm Start. Wenn du die Serie nicht gesehen hast, schau sie, sie ist kurz und jede Minute ist dicht.

Der Map-Quellcode liegt auf [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html), und das komplette SMB1-Disassembly ist in vielen Repos Open Source. Vor 40 Jahren schrieben japanische Programmierer dieses Levelsystem in 6502 mit null Unit-Tests und null Bug-Tracker, und wir lernen heute noch Optimierungstechniken, indem wir ihren Code öffnen.
