---
title: "Super Mario Bros.: Das Level-Format, die Zeiger und die 256 Glitch Worlds"
description: "Wie 128 Levels × 4 Zonentypen in 40KB ROM passen, warum die Minus World existiert, und wie ein NES-Tennis-Match Glitch Worlds laden kann."
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

## Einführung

Super Mario Bros. – das sind 40 Kilobyte ROM. Acht Welten, 32 Levels, Gegner, Musik, Power-ups, alles passt da rein.

Aber wenn du einen Emulator öffnest und die richtigen Bytes herumwurstelst, kannst du den Level 36-1 laden. Oder den 255-1. Oder in einer Welt landen, die komplett aus Bowser-Sprites und Rohren besteht, die nirgendwo hinführen.

Diese Glitch Worlds existieren aus einem einfachen Grund: Das Level-Speichersystem von SMB1 ist ein Meisterwerk der 8-Bit-Optimierung, und wenn man das Spiel zwingt, dort zu lesen, wo es nicht sollte, kommt man zu faszinierenden Ergebnissen.

Retro Game Mechanics Explained hat eine 4-teilige Videoserie darüber gemacht -- wir kompilieren das hier zu einem einzigen Deep Dive in den 6502-Code des meistverkauften Spiels seiner Zeit.

![GLITCH OBJECTS -- der Titel der RGMechEx-Serie über die versteckten Mechaniken von SMB1](/images/smb1-glitch-levels/title-card.jpg)

![World 9-1 -- der Titelbildschirm der ersten Glitch World, die man über den Kart-Tausch mit Tennis erreichen kann](/images/smb1-glitch-levels/v1-title-9-1.jpg)

## Der Warm Start: Warum die RAM von Tennis in SMB1 überlebt

Bevor wir über Level-Speicherung reden, müssen wir verstehen, wie SMB1 startet. Denn der Glitch des NES-Tennis-Kart-Tauschs basiert vollständig auf dem **Warm-Start / Cold-Start-Erkennungssystem** des Spiels.

### Die 41 Bytes, die erhalten bleiben

Wenn SMB1 einen **Cold Start** erkennt (erstes Einschalten oder Power Off/On), löscht es die gesamte RAM. Aber wenn es einen **Warm Start** erkennt (Reset-Knopf, kein Stromausfall), bleibt ein Speicherbereich von **41 Bytes** erhalten:

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

Diese 41 Bytes dienen nur einer einzigen Funktion: Es soll dem Spieler ermöglichen, **nach einem Game Over in derselben Welt weiterzuspielen**. Wenn du in 6-3 stirbst, schreibt das Spiel die Welt 6 in den Start-Byte, und am Titelbildschirm, wenn du A + Start gedrückt hältst, startest du in 6-1.

![Die 41 Bytes, die bei einem Warm Start in der RAM erhalten bleiben -- TOP SCORE, MARIO SCORE, TIMER, WORLD SELECT, CONTINUE WORLD und der Magische Byte $A5](/images/smb1-glitch-levels/v1-memory-state.jpg)

### Die doppelte Überprüfung des Warm Start

![Cold Start vs. Warm Start -- das Erkennungsdiagramm des Resets](/images/smb1-glitch-levels/v1-warm-start.jpg)

Wenn SMB1 hochfährt, überprüft es nicht nur ein Kriterium, sondern **zwei**:

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

![Die Überprüfung des $A5-Bytes und der Top-Score-Ziffern -- das Herz des Warm Starts](/images/smb1-glitch-levels/v1-a5-byte.jpg)

Warum eine doppelte Überprüfung? Weil das $A5-Byte zufällig vorhanden sein könnte (ein anderes Spiel, das diesen Wert lässt, oder der Ruhezustand des RAM-Chips). Indem man überprüft, dass die Top-Score-Ziffern gültig sind (0-9), stellt man sicher, dass die Daten konsistent sind.

### Warum Tennis das einzige Spiel ist, das funktioniert

Wenn man SMB1 zum ersten Mal einlegt (Cold Start), tut das Spiel:
1. Löscht die gesamte RAM → Top Score = 0, World-Byte = 0
2. Schreibt $A5 an die Adresse $0787

Dann tauscht man auf Tennis, ohne die Konsole auszuschalten. Tennis:
- **Löscht die RAM beim Start nicht** (wenige NES-Spiele tun das)
- **Schreibt nicht auf die Top-Score-Bytes** → sie bleiben bei 0 (gültig)
- **Berührt das $A5-Byte nicht** → es bleibt vorhanden
- **Verwendet die Adresse $075F** für den Schrittzähler des Spielers

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

Wenn man SMB1 wieder einlegt:
1. Das $A5-Byte ist immer noch da (Tennis hat es nicht berührt)
2. Die Top-Score-Ziffern sind immer noch 0 (gültig)
3. Das World-Byte hat jetzt 8+ (erhöht durch die Schritte von Tennis)
4. SMB1 erkennt einen Warm Start → bewahrt das korrupte World-Byte auf
5. A + Start gedrückt halten → World 9-1, World A-1, World 36-1, usw.

### Warum man Mario vor Tennis starten muss

Eine Kleinigkeit: Man muss zuerst SMB1 starten, dann Tennis, dann wieder SMB1. Wenn man direkt mit Tennis beginnen würde, würde das $A5-Byte nie geschrieben (Tennis schreibt kein $A5), und die Warm-Start-Erkennung würde fehlschlagen und die RAM würde gelöscht.

![Der Schrittzähler von Tennis: Jeder Schritt erhöht das World-Byte](/images/smb1-glitch-levels/v1-footstep.jpg)

![Glitch Worlds über NES Tennis erreichen -- das Video, das den Kart-Tausch erklärt](/images/smb1-glitch-levels/yt-tennis.jpg)

## Wie SMB1 seine Levels in 40KB speichert

Nintendo R&D4 musste ein scheinbar einfaches Problem lösen: Horizontale scrollende Levels mit Tiles, Gegnern und Items darstellen, und das alles in einem extrem knappen ROM-Budget.

Die Lösung: Eine Trennung in zwei komplett unabhängige Datenebenen:

### Das Tile-Layout (die Levelkarte)

Jedes Level wird durch einen Zeiger auf eine komprimierte Tile-Struktur in der ROM definiert. Die Kompression ist simpel aber genial: Ein "Kontroll"-Byte gefolgt von 1-3 Datenbytes.

Das Tile-Format verwendet ein System von Runs (RLE-ähnlich):

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

Jedes Level enthält 13 Zeilen mit 16 Spalten Tiles (13×16 = 208 sichtbare Tiles). Aber das komprimierte Format erlaubt es, viel weiter unten zu starten -- zum Beispiel der Himmel und leere Spalten nehmen fast keinen Platz ein.

Die Render-Schleife in 6502:

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

### Das Sprite-Layout (Gegner und Objekte)

Parallel dazu werden Gegner und Objekte (Blöcke ?, Rohren, Goombas, Koopas) in einer komplett separaten Struktur gespeichert. Jeder Spawn ist durch 2 Bytes definiert:

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

Jedes Level kann bis zu 5 verschiedene Sprite-Seiten referenzieren (also 5 "Screens" mit 16 Spalten), aber in der Praxis verwenden die meisten Level nur 2-3.

### Die Zeigertabelle

Das Genie des Designs ist die Zeigertabelle. Jedes Level wird als **Paar** von ROM-Adressen gespeichert:

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

128 Einträge pro Tabelle. 4 Zonentypen. **512 mögliche Kombinationen**, aber nur ein Bruchteil wird vom offiziellen Spiel genutzt. Der Rest ist nicht initialisierte RAM oder Daten, die als Zeiger interpretiert werden.

Wenn das Spiel ein Level lädt, macht es das:

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

Keine Validierung. Keine Prüfung, ob der Zeiger gültig ist. Das Spiel liest die Adresse in der Tabelle und dekomprimiert, was sich an dieser Adresse befindet, Punkt.

![Level ID $06 (Water) -- 9-1, die Unterwasserversion von 6-2](/images/smb1-glitch-levels/lvl-06-9-1.png)

![Die Level-ID-Tabelle: 128 mögliche Einträge, 34 zugewiesen](/images/smb1-glitch-levels/v2-level-id-table.jpg)

![Die unterschiedliche Reihenfolge der Tile- und Sprite-Zeiger -- die Ursache der Frankenstein-Levels](/images/smb1-glitch-levels/v2-pointer-tables.jpg)

### Die 34 einzigartigen Levels und das 7-Bit-ID-System

![Der RAM-Chip der NES (MB8416A) -- er bewahrt die Daten auf, wenn man die Cartridges tauscht](/images/smb1-glitch-levels/v1-ram-chip.jpg)

SMB1 hat nicht 32 Levels, sondern **34 einzigartige Levels**. Viele Levels sind Duplikate (5-3 = 1-3, aber mit Bullet Bills), die mit einem "Hard Mode"-Markierungs-Flag versehen sind. Die echten einzigartigen Levels:

- **Wasser** (Typ 0): 3 Levels (2-2, 7-2, Bonus-Zone 5-2/6-2)
- **Overworld** (Typ 1): 22 Levels (inklusive der 2 Wolken-Bonus-Räume)
- **Underground** (Typ 2): 3 Levels (inklusive der unterirdischen Bonusräume)
- **Castle** (Typ 3): 6 Levels
- \+ 1 Cutscene-Raum (vor den unterirdischen/Wasser-Levels)
- \+ 1 Warp-Zone von 4-2

Jedes Level hat eine ID auf **7 Bits**. Die unteren 5 Bits = Nummer in der Untergruppe, die oberen 2 Bits = Zonentyp:

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

**128 mögliche IDs** ($00-$7F), nur 34 sind echten Levels zugewiesen. Die ungenutzten IDs zeigen auf irgendetwas.

### Die Zeigertabellen: Zwei Listen, zwei Reihenfolgen

Die Tile- und Sprite-Zeiger werden nicht in derselben Reihenfolge gespeichert. Der Code verwendet zwei separate 16-Bit-Listen (High Byte / Low Byte in zwei unterschiedlichen Tabellen):

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

Warum unterschiedliche Reihenfolgen? Kein technischer Grund -- das war wahrscheinlich einfach so, wie die Daten während der Entwicklung organisiert wurden. Aber das erzeugt eine faszinierende Konsequenz: Wenn eine Level-ID ungültig ist, laden Tile- und Sprite-Zeiger unterschiedliche Levels und erzeugen so **Frankenstein-Levels**.

Um zwischen diesen beiden Listen zu navigieren, verwendet das Spiel kleine **Offset-Tabellen** (wie ein Inhaltsverzeichnis):

```asm
; Tables d'offset par type (Water, Overworld, Underground, Castle)
; Chaque entrée = index de début dans la liste correspondante

SpriteOffsetTable:
  .byte $1F, $06, $1C, $00    ; Water=31, Overworld=6, Underground=28, Castle=0

TileOffsetTable:
  .byte $00, $03, $19, $1C    ; Water=0, Overworld=3, Underground=25, Castle=28
```

Um Level 6-2 zu laden (ID $23, Overworld Nummer 3):

```asm
; 1. Type = 01 (Overworld) → index dans table d'offset = 1
; 2. Sprite offset = SpriteOffsetTable[1] = 6
;    Index final = 6 + 3 (numéro de niveau) = 9 → 10ème pointeur sprites
; 3. Tile offset = TileOffsetTable[1] = 3
;    Index final = 3 + 3 = 6 → 7ème pointeur tiles
; 4. Résultat : pointeur tiles $A619 + pointeur sprites $9ED0 = 6-2 ✓
```

Was passiert jetzt mit einer ungültigen ID wie $43 (Underground Nummer 3, die es nicht gibt)?

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

![Level ID $43 -- Frankenstein-Level: Tiles 1-4 + Wasser-Sprites 5-2](/images/smb1-glitch-levels/lvl-43-frankenstein.png)

![Glitch Level Pointers erkunden -- die Offset-Tabellen erklärt](/images/smb1-glitch-levels/yt-pointers.jpg)

![Die World-Index-Tabelle -- wenn der Overflow von World 9 ein Glitch Level erzeugt](/images/smb1-glitch-levels/v2-world-index-table.jpg)

### Die World-Index-Tabelle: Warum World 9 überläuft

Es gibt eine ROM-Tabelle mit 8 Bytes, die den Index des ersten Levels jeder Welt (1-8) angibt. Und direkt danach die Tabelle der 36 Level-IDs aller Levels in der Spielreihenfolge.

```asm
; WorldIndexTable (8 bytes)
  .byte 0, 5, 10, 15, 20, 25, 28, 33
;   -> Monde 1 commence au niveau 0
;   -> Monde 2 commence au niveau 5
;   -> Monde 8 commence au niveau 33

; LevelIDTable (36 bytes)
  .byte $25, $28, $29, $26, $24, ... ; les 36 Level IDs
```

Wenn man versucht, World 9 zu laden, liest das Spiel das 9. Byte der WorldIndexTable... das nicht existiert. Es überläuft um 1 Byte in die LevelIDTable, liest den Wert $25 und verwendet dann $25 als Index in der LevelIDTable (37. Eintrag) -- was wiederum um 2 Bytes in die SpriteOffsetTable überläuft und den Wert 6 liest.

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

Für World G (16) geht der Overflow noch weiter und trifft auf Level ID $01, der der Cutscene-Raum ist, der 1-2 vorausgeht:

```asm
; World G (16) :
;   WorldIndexTable[15] → lit $01 dans LevelIDTable
;   LevelIDTable[1] = $29 (cutscene 1-2)
;   → world G-1 = la cutscene d'entrée de 1-2
```

## Warum die Glitch Worlds existieren

Das Spiel hat 32 "legitime" Levels (8 Welten × 4 Levels). Aber die Zeigertabelle hat 128 Einträge pro Zonentyp. Die Einträge jenseits von Level 32 enthalten das, was sich in der ROM an diesen Adressen befindet -- manchmal ein anderes Level, manchmal Audiodaten, manchmal RAM, manchmal irgendetwas.

![Level ID $01 Water (Minus World) -- Tile-Zeiger $AE45, Sprite-Zeiger $A171](/images/smb1-glitch-levels/minus-world.png)

### Level ID $01 + AreaType 0 = Minus World

Das berühmteste der Glitch Worlds. Die Level ID $01 in AreaType 0 (Wasser) zeigt auf:

- **Tile-Zeiger: $AE45** → der Unterwasserbereich von 2-2/7-2
- **Sprite-Zeiger: $A171** → die Sprites von 2-2/7-2

Das Ergebnis: Ein Wasserturn, der 2-2 ähnelt, aber endlos loopt, weil es die Flaggenstange nicht gibt. Kein Level-Ende, kein Ausgang.

Das ist Level 36-1 (oder 36-1 in der Welt $-1).

![Der Warm-Start-Check von SMB1 -- er lässt die Minus World existieren](/images/smb1-glitch-levels/v4-minus-world.jpg)

```asm
; Pourquoi le flagpole manque dans le Minus World :
; Les sprites de 2-2/7-2 ($A171) n'ont pas de flagpole
; dans leur séquence. Le jeu cherche le sprite $FD (flagpole)
; mais ne le trouve jamais → boucle infinie
;
; Le jeu continue de générer le niveau à l'infini
; jusqu'à ce que le timer atteigne zéro.
```

### Die Zeiger, die auf die RAM zeigen

Wenn der Tile-Zeiger oder der Sprite-Zeiger auf eine Adresse in der RAM ($00-$7F) statt in der ROM zeigt, versucht das Spiel, die ständig wechselnden RAM-Werte als Tiles zu interpretieren:

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

Wenn sich die Page Zero ändert (weil Mario sich bewegt, der Timer läuft, usw.), ändern sich auch die "Sprites" des Levels. Deshalb haben manche Glitch Worlds Gegner, die flackern und sich ständig verwandeln.

![Level ID $03 Water -- Sprite-Zeiger $009D zeigt auf RAM, unspielbarer Level](/images/smb1-glitch-levels/level-03-water.png)

### Level ID $36: Der leere Level (Overworld)

Level ID $36 in Overworld:

- **Tile-Zeiger: $AC35** (1-2)
- **Sprite-Zeiger: $A0D8** (1-2)

Ergebnis: Nichts. Das Spiel lädt das Level, aber es ist als "kein Level" im Katalog von RGMechEx markiert. Die Tiles sind vielleicht gültig, aber die Sprite zeigen auf eine Stelle, die ein leeres oder nicht funktionierendes Level erzeugt.

### Level ID $1D (Castle): Der Champion der Abstürze

Level ID $1D in Castle:

- **Tile-Zeiger: $A210** (4-4)
- **Sprite-Zeiger: $7EA0** (RAM!)

Sprite-Zeiger in RAM = undefinierte Sprites. Das Spiel versucht, einen Spiny Ball oder einen Bullet Bill Blaster in der ersten Tile-Zeile anzuzeigen. Das crasht sofort.

```asm
; Quand le sprite pointer pointe vers la RAM,
; le jeu décompresse des bytes qui changent tout le temps
; comme des instructions "spawn". Le résultat :
; - Apparition d'objets inexistants (valeur undefined)
; - Crash PPU quand le sprite NES essaie d'afficher un tile invalide
; - Freeze complet de la console
```

## Die 256 katalogisierten Glitch Worlds

RGMechEx hat ein Script geschrieben, das die Maps **aller Levels** für die 4 Zonentypen und je 128 IDs generiert.

Der Welt-Zähler ist 8 Bit breit (0-255). Welten 1-8 sind legitim. Es bleiben **248 potenzielle Glitch Worlds**. Jede Glitch World entspricht dem ersten Level dieser Welt, und ihre Level-ID wird durch den Overflow-Mechanismus der WorldIndexTable berechnet.

![Tabelle der Glitch Worlds -- 248 korrupte Welten, 68 erste Levels zugänglich](/images/smb1-glitch-levels/v3-glitch-worlds-table.jpg)

Von den 128 möglichen IDs sind nur **68 das "erste Level" einer Welt** (zugänglich über die Glitch-World-Nummer). Die restlichen 60 sind Level 2+ oder nicht erreichbar.

| Typ | Einzigartig spielbare IDs | Crash-IDs | Leere IDs |
|------|---------------------|-------------------|-----------|
| Water (0)    | ~20  | ~60  | ~48  |
| Overworld (1)| ~30  | ~55  | ~43  |
| Underground (2) | ~15 | ~65 | ~48  |
| Castle (3)   | ~25  | ~58  | ~45  |

Viele IDs führen auf dasselbe Level, weil die Zeiger auf dieselben ROM-Adressen treffen. Level ID $28 (Overworld) zum Beispiel -- Tile-Zeiger $A7CD (2-1) -- erscheint in **38 verschiedenen Glitch Worlds**, weil sein Sprite-Zeiger $9F51 auf einen Bereich der ROM zeigt, der als Padding/Audiodaten wiederverwendet wird, der von vielen IDs genutzt wird.

![Levelkarte ID $28 (Overworld) -- 2-1 Tiles mit normalen Sprites, 38 Glitch Worlds](/images/smb1-glitch-levels/level-28-overworld.png)

![Super Mario Bros. Glitch Levels Explained -- das 3. Video](/images/smb1-glitch-levels/yt-levels.jpg)

### Die 6 wirklich einzigartigen Glitch Levels

Von den 19 zugänglichen Glitch-Level-IDs crashten nur **6 nicht sofort** beim Laden:

| Welt | Level ID | Beschreibung |
|-------|----------|-------------|
| E-1 (224) | $50 | Ein einzelner ? Block über einem Abgrund. Mario stirbt sofort. |
| W | $57 | Mario spawnnt blockiert, kann sich nicht bewegen. |
| 42 (133) | $50 | Wolken-Tunnel, der Mario einfängt, wenn er weit genug geht. |
| 62 (131, 240) | $4D | Eingefrorenes Schloss: Mario spawnnt oben, kann nicht fallen → blockiert. |
| 127 | $4B | Unterirdischer Tunnel, aber crasht, wenn man zu weit geht. |
| 137 | $4B | Aktiviert automatisches Scrollen der Cutscenes. Mario trifft auf einen einzigen Brick-Block, der ihn für immer blockiert. |

![Level ID $50 (Wolken-Tunnel) -- Glitch World 42-1 und E-1](/images/smb1-glitch-levels/lvl-50-cloud.png)
![Level ID $4D (Schloss) -- World 62-1, Mario beim Spawn blockiert](/images/smb1-glitch-levels/lvl-4D-castle.png)
![Level ID $4B (Tunnel) -- World 127-1, crasht wenn man zu weit geht](/images/smb1-glitch-levels/lvl-4B-tunnel.png)

Sechs Glitch Worlds von 248, die etwas wirklich Neues erzeugen. Der Rest sind normale Levels mit dem falschen Zonentyp oder schwarze Bildschirme.

## Das Level-Format im Detail

Schauen wir uns das genaue Format der Level-Daten an, um zu verstehen, warum Glitch Levels funktionieren (oder nicht).

### Der Level-Header: 2 Bytes, 6 Eigenschaften

Jedes Level beginnt mit einem 2-Byte-Header, der 6 Eigenschaften steuert:

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

Der Modifier-Typ steuert visuelle Variationen: die Wellen oben in den Wasserturns, der Backstein-Hintergrund von 8-3, die Nacht-Palette von 4-3, der Schnee von 6-2, usw.

### Die Tile-Objekte: 2 Bytes, Next-Screen-Flag, 3-Slot-Warteschlange

Nach dem Header folgt eine Liste von **Tile-Objekten**, jedes Objekt ist 2 Bytes groß. Das Byte $FD markiert das Ende der Liste.

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

Wenn das "Next Screen"-Bit gesetzt ist, wird die aktuelle Arbeits-Spalte um 1 erhöht. Das erlaubt es, Objekte jenseits der ersten 16 Spalten zu platzieren. Die Objekte müssen **in der Reihenfolge** aufgelistet werden (links nach rechts), weil das Spiel sie sequenziell lädt:

```asm
; La routine de chargement a DEUX phases par colonne :
; Phase 1 : chercher les nouveaux objets qui commencent sur cette colonne
;            et les ajouter à la file d'attente (queue)
; Phase 2 : traiter chaque objet dans la queue en dessinant les tiles,
;            et retirer ceux qui finissent sur cette colonne
```

Die Warteschlange hat genau **3 Slots**. Direkte Konsequenz: Es können nicht mehr als 3 Objekte auf derselben Spalte beginnen. Wenn die Warteschlange voll ist, wird das 4. Objekt ignoriert und nie geladen.

Deshalb vermeiden gut designte Levels, zu viele Objekte zu stapeln. Beispiel in 1-2: Die Spalte mit dem 1up-Block an der Decke + die Backsteine daneben sind in zwei separate Objekte aufgeteilt, um die 3er-Limit einzuhalten.

### Spezielle Y-Positionen: 12, 13, 14, 15

Wenn Y=12, hat das Objekt keine Y-Position (sie ist je nach Typ hardcodiert):

```asm
; Y=12 : objets sans Y position
;   Type 0 : trou (supprime le sol)
;   Type 1 : rope de plateforme mobile
;   Types 2-4 : ponts à Y fixe
;   Type 5 : trou avec eau/lave
;   Types 6-7 : rangées de ? blocks
```

Wenn Y=13, gibt es zwei Untergruppen. Wenn Bit 6 von Byte 1 auf 1 steht:

```asm
; Y=13, bit6=1 : objets spéciaux
;   0 = L-pipe (cutscene), 1 = flagpole, 2-3 = pont/axe/hamer (fin château)
;   4 = stop screen, 5 = random enemies, 6 = loop level, 7+ = crash possible
```

Wenn bit6=0, kodieren die unteren 5 Bits einen **Screen-Skip** (direkt zu einem Screen N springen, ohne eins nach dem anderen über das Next-Screen-Flag zu gehen).

Wenn Y=14: Gleiches Prinzip mit bit6=1 zum Ändern des Modifier-Typs, bit6=0 zum Ändern des Hintergrunds + Bodenmusters.

### Die Floor Patterns: 16 Bodenmuster

Der Boden der Levels besteht nicht aus einzelnen Objekten. SMB1 verwendet **Floor Patterns**, ein Hintergrundmuster, das für alle Spalten bis zur nächsten Änderung gilt:

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

Deshalb sind Löcher Objekte: Sie überschreiben das Floor Pattern auf einer bestimmten Spalte, ohne das Muster für den Rest ändern zu müssen.

### Die 256-Byte-Grenze und das Repeat

Alle Tile-Daten eines Levels passen in **maximal 256 Bytes**. Das Y-Register des 6502 wird als Index verwendet und hat 8 Bit. Wenn das Spiel am Ende der Daten angelangt, ohne das $FD-Byte zu finden, **schlingt es zum Anfang zurück** und wiederholt die 256 Bytes endlos:

```asm
; Index Y = 8 bits → max 256 bytes de données tiles
; Si Y overflow (255 → 0) sans rencontrer $FD → repeat
; Même chose pour les sprites, mais les objets pipe (3 bytes)
; décalent la parité de l'index à chaque chargement.
```

Manche Glitch Levels nutzen dieses Repeat, um Levels zu erzeugen, die "unendlich" dauern.

### Das Sprite-System: 2 Bytes + Pipe-Übergänge

Die Sprites folgen einem ähnlichen Format, aber ohne Header und mit einigen Unterschieden. Das Byte $FF markiert das Ende der Liste.

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

Das niederwertigste Bit von Byte 1 ist das **Hard-Level-Flag**: Wenn es auf 1 gesetzt ist, erscheint das Sprite nur in Levels ≥ 5-3. So werden die "Hard Mode"-Levels erstellt.

Y-Position 15 = **Screen-Skip** (identisch mit Tiles). Y-Position 14 = **Pipe-Übergang** (3 Bytes!):

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

Die Sprites haben **kein Queue-System**. Die einzige Grenze ist, dass nicht mehr als 4 Sprites gleichzeitig im Spawn-Bereich (genau rechts außerhalb des Bildschirms) geladen werden können. Darüber hinaus werden Sprites ignoriert.

## Wie man auf die Glitch Worlds zugreift

Es gibt zwei Hauptmethoden.

### Die klassische Methode: Der Wall Clip

Der Wall Clip (Durch Wände gehen) erlaubt es, aus dem normalen Level herauszukommen und zur versteckten Warp-Zone zu laufen. Indem man den Welt-Zähler über die RAM manipuliert, kann man jede beliebige Level-ID laden.

Die Technik:
1. World 1-2: In das versteckte Endrohr gehen
2. Den Wall Clip an der rechten Wand machen
3. Durch die Leere zur Warp-Zone laufen
4. Das Spiel interpretiert die Werte als Welten

Aber diese Methode gibt Zugriff nur auf einen kleinen Teil der Glitch Worlds.

### Die extreme Methode: NES-Tennis-Kart-Tausch

Siehe den Abschnitt "Der Warm Start" oben für die vollständige Zusammenfassung. Kurz gefasst: Der Schrittzähler von Tennis schreibt auf dasselbe RAM-Byte wie die Startwelt von SMB1, und die Warm-Start-Erkennung bewahrt diesen Wert auf.

### Für Bastler: Der Code zum Erkunden

Wenn du alle Glitch Worlds selbst in einem Emulator erkunden möchtest, kannst du die Level-ID direkt patchen:

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

RGMechEx hat die vollständige Liste aller 128 Levels × 4 Typen mit automatisch generierten Maps auf [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html) veröffentlicht. Jeder Eintrag zeigt den Tile-Zeiger, den Sprite-Zeiger und eine visuelle Karte des Levels.

## Die verrücktesten Levels

### Level ID $1F (Water): 15 Glitch Worlds in einem

Der Tile-Zeiger $A302 (3-4) kombiniert mit dem Sprite-Zeiger $02A0 ergibt 15 verschiedene Glitch Worlds (D-1, J-1, Y-1, Z-1, 55-1, 73-1...). Erklärung: Der Sprite-Zeiger zeigt auf einen Bereich der ROM, der Daten enthält, die nahe genug an gültigen Sprites sind, um spielbare Ergebnisse zu erzeugen, aber die Kombination der Schloss-Tiles von 3-4 mit Overworld-Sprites erzeugt ein absurd erscheinendes Rendering.

### Level ID $28 (Overworld): 38 Glitch Worlds = Rekord

Der absolute Rekord. 38 Glitch-World-Einträge zeigen auf dasselbe Level (2-1 Tiles + $9F51 Sprites). Warum? Weil der Sprite-Zeiger $9F51 in einen Bereich der ROM trifft, der als Padding/Audiodaten wiederverwendet wird, der von vielen IDs genutzt wird.

### Level ID $49 (Underground): Der FDS-Level

Tile-Zeiger $76AE + Sprite-Zeiger $1C9D. Der Tile-Zeiger zeigt auf den Bereich der ROM, der für die Famicom-Disk-System-Version reserviert ist. Ergebnis: Ein Level mit Tiles, die in der Standard-Cartridge nicht existieren. Das ist das Level, das die Levels 52-1 und 196-1 erscheinen lässt.

### Level ID $00-$02: Die echten Bonus-Level

Diese IDs werden von legitimen Unterlevels des Spiels verwendet:

- **$00**: Unterwasserbereich von 5-2/6-2 (verwendet von H-1, 39-1)
- **$01**: Das Wasser von 2-2/7-2 (die Minus World, 36-1)
- **$02**: Unterlevel von 8-4 (136-1, 151-1, 215-1)

Der Unterschied zwischen einem normalerweise zugänglichen "Bonus"-Level und einer Glitch World ist, dass die Warp-Zonen die aktuelle Welt überprüfen:

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

Glitch Worlds mit Nummern > 8 oder 0 können nicht durch normale Rohren erreicht werden. Man braucht den Wall Clip oder den Kart-Tausch.

## Warum manche Levels crashen: Die Jump-Tabellen

Wenn das Spiel ein Tile-Objekt lädt, verwendet es dessen Typ als Index in einer **Jump-Tabelle**:

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

![Die Jump-Tabellen: Warum ein ungültiger Objekttyp das Spiel zum Absturz bringt](/images/smb1-glitch-levels/v4-jump-table.jpg)

Wenn ein Objekt einen ungültigen Typ hat (≥12), springt das Spiel zu einem Zeiger, der in dieser Tabelle nicht existiert. **4 mögliche Ergebnisse**:

1. **Gültiger Zeiger** → das Objekt lädt normal
2. **Zeiger auf eine andere Jump-Tabelle** (Überlappung) → ein anderes Objekt erscheint. Beispiel: Typ 12 zeigt auf die Tabelle Y=13, was einen L-Pipe ergibt.
3. **Zeiger auf ausführbaren Code** → Ausführung von zufälligem Code (wahrscheinlicher Crash)
4. **Expliziter Platzhalter (NOP)** → das Objekt macht nichts (manche Sprites sind so und erzeugen Gegner, die an Ort und Stelle fliegen, ohne sich zu bewegen)

![Glitch Level ID $58: Der Sprite-Zeiger zeigt auf eine ungültige Adresse, das Spiel crasht](/images/smb1-glitch-levels/v4-glitch-58-crash.jpg)

![Glitch Level ID $50: Der Wolken-Tunnel, ein Level, das durch korrupte Daten erzeugt wird](/images/smb1-glitch-levels/v4-glitch-50.jpg)

Das Glitch Level ID $58 (der Tunnel, der crasht): Sein Sprite-Zeiger zeigt auf einen Speicherbereich, der **auf NES ohne ROM-Mapper nicht existiert**. Das Spiel versucht, denselben Koopa 5 Mal pro Frame an der Position (0,0) zu laden, was die Sättigung der PPU und einen Freeze verursacht.

```asm
; Pourquoi ID $58 crashe :
; Sprite pointer → adresse invalide (hors espace NES standard)
; → Le jeu lit des bytes indéterminés comme des types de sprite
; → Le Koopa $00 (type invalide sans handler) boucle en appel récursif
; → Stack overflow 6502 → freeze
```

### Das Pipe-Warp-Paradox

Erinnerst du dich an den Check `target_world BETWEEN 1 AND 8`? Selbst wenn du eine Rohr in einer Glitch World findest, überprüft das Spiel, ob die Zielswelt zwischen 1 und 8 liegt. Glitch Worlds haben Nummern > 8 (36-1, 255-1...), also schlägt die Warp fehl.

Deshalb hat auch die Minus World kein Ende: Die Flaggenstange ist in den Sprites nicht vorhanden, und die Rohren führen nirgendwo hin.

### Der Trick mit den 5 Objekten in einer Spalte

Es gibt einen Edge Case, der es erlaubt, die Grenze von 3 Objekten pro Spalte zu umgehen. Wenn die Warteschlange blockiert (Slots voll + nächstes Objekt ohne Next-Screen-Flag), "vorverarbeitet" das Spiel die aktuelle Spalte in einer Schleife, bis es ein Objekt mit Next-Screen-Flag findet. Bei jeder Vorverarbeitung:

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

Das nennt man einen "Queue Skip" und wird von manlichen Rom-Hackern verwendet, um dichtere Levels zu erstellen, als das Format normalerweise erlaubt.

## Die Unterschiede zwischen Versionen

### Famicom Disk System

Die FDS-Version von SMB1 hat eine **andere Memory Map**. Alle Level-Zeiger sind verschoben, aber die Daten sind dieselben. Was sich ändert: Die Indizes der Glitch Worlds sind völlig unterschiedlich:

```
FDS World 36 → Level ID $09 (eau version de 5-3)
  → Le flagpole est présent ! On peut finir le niveau.
  → Ensuite : $27 (7-3 normal) → $44 (4-4 underground)
  → $44 est finissable → la hache fonctionne → fin du jeu !
  
Le Minus World FDS est donc un "bonus world" qui peut mener
à la complétion du jeu, contrairement à la version NES.
```

Mein Lieblings-FDS-Level: **ID $5F**, eine unterirdische Version der zweiten Hälfte von 3-3 als tiefer Tunnel (schade, dass es ein Autoscroller ist).

### The Lost Levels (Super Mario Bros. 2 japanische Version)

Lost Levels ändert viele Dinge:

1. **Identische Tiles/Sprites-Reihenfolge**: Keine Frankenstein-Levels mehr (Tiles und Sprites laden dasselbe Level, auch bei ungültiger ID)
2. **Eine einzige 16-Bit-Zeigertabelle** statt zwei separater High/Low-Tabellen
3. **4 Disk-Dateien**: Die ROM wurde für das FDS aufgeteilt:
   - Datei 1: Welten 1-4
   - Datei 2: Welten 5-8
   - Datei 3: World 9 + Sound-Engine
   - Datei 4: Welten A-D (völlig andere Zeigertabelle)
4. **Gleiche Level-ID = 4 mögliche Levels** je nach geladener Datei
5. **Kein Tennis-Glitch mehr**: Die Continue-Option (im selben World nach Game Over weitermachen) macht den Warm Start überflüssig, und das Spiel **resettet sofort** wenn World > 9
6. **Neue Objekte**: Giftiger Pilz, unsichtbarer Block, unsichtbarer Feuerblumen-Block, umgedrehte Rohren, Wind -- aber mitten in bestehende Listen eingefügt → **Abwärtsinkompatibilität** mit SMB1
7. **Piranha Plants immer rot** nach World 4, **grüne Springbrünne** nur in Welten 2/B/3/C/7

### Super Mario All-Stars (SNES)

Direkter Port mit denselben 6502-Routinen (der SNES führt den NES-Code im kompatiblen Modus aus):

- **Warp-Zone gefixt**: Keine Minus World mehr (Eingang in die linke Rohr vor dem Text führt zur richtigen Welt)
- **Absturz**: Die meisten Glitch Levels crashten (außer ID $6A und 9-1)
- **Schloss-Objekte hinzugefügt**: Machen die Levels einzigartiger
- **Aber**: Der **4-2 Wrong Warp** funktioniert immer noch (nicht gepatcht!)

### Der 4-2 Wrong Warp: Ein Bug bei der Objektplatzierung

In 4-2 gibt es zwei Pipe-Übergangsobjekte: Die Ranke (Warp-Zone) und das Rohr (Coin-Cash-Raum). Das erste Übergangsobjekt (das der Ranke) wird **weit bevor** die Ranke auf dem Bildschirm erscheint, platziert. Das zweite (das Rohr) wird **zu spät im Level** platziert.

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

### Die Loop-Levels

Wie funktionieren die Loops (8-4, 7-4)? Das Level hat **Checkpoints** mit hardcodierten Screen-Nummern und Y-Positionen:

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

## Das Format ändern, nicht den Code

Eine der faszinierendsten Lektionen dieser Architektur ist, dass die Entwickler von SMB1 es geschafft haben, ein sehr ausdrucksstarkes Level-System zu schaffen, ohne jemals den 6502-Render-Code anzufassen. Die gesamte Variation zwischen den Levels kommt von den **Daten** (Zeiger, Objekte, Sprites, Floor Patterns), nicht vom Code.

Die 256 Glitch Worlds existieren, weil die **Zeigertabellen für 128 Einträge × 4 Typen dimensioniert sind** und das Spiel nie die Werte validiert, die es liest. Wenn ein Zeiger in die RAM trifft, interpretiert das Spiel die Register von Mario als Tiles. Wenn ein Zeiger in die Audiodaten trifft, spielt das Spiel Musik in Form von Level-Design. Und wenn die Jump-Tabellen überlaufen, führt das Spiel irgendeinen Code aus bis zum Crash.

![More Super Mario Bros. Mechanics Explained -- das 4. Video](/images/smb1-glitch-levels/yt-mechanics.jpg)

## Was man daraus lernen kann

1. **Tiles/Sprites-Trennung**: Volle Unabhängigkeit der beiden Ebenen, mit unterschiedlichen Speicherreihenfolgen, die einzigartige Frankenstein-Levels erzeugen
2. **RLE-Kompression + Objekt-System**: Levels sind keine Bitmaps, sondern Listen platzierter Objekte mit Floor Patterns für den Boden
3. **3-Slot-Warteschlange**: Harte Grenze des Hardwares (und des Level-Designs)
4. **Keine Validierung**: Das Spiel vertraut den Zeigern und Jump-Tabellen, was entweder spielbare Glitchs oder Abstürze erzeugt
5. **256 Bytes max**: Die Grenze des Y-Registers des 6502, wodurch sich Daten wiederholen, wenn man zu weit geht
6. **Warm Start / Cold Start**: Ein "Weiterspielen"-System, das die Tür für den Tennis-Kart-Tausch → Mario geöffnet hat

Das Schönste: All das ist 6502-Code, der in 40KB passt. Keine Abstraktionsschicht, keine Speicherzugriffsvalidierung, keine Ausnahmebehandlung. Wenn der Zeiger Mist ist, crasht das Spiel. Und Abstürze nennen wir Glitch Worlds.

## Die 3 wichtigsten Punkte

1. **Glitch Worlds sind Zeiger, die ins Leere treffen** -- Das Spiel hat 128 IDs × 4 Zonentypen, aber nur 34 einzigartige Levels. Wenn die World-Nummer korrupt ist (durch Tennis oder Wall Clip), lädt das Spiel einen Zeiger, der für ein anderes Level gedacht war, und die 512 möglichen Kombinationen erzeugen unvorhersehbare Ergebnisse.

2. **Die Minus World ist ein Warp-Bug kombiniert mit Korruption** -- Die linke Rohr in 1-2, wenn sie aktiviert wird, bevor der Text erscheint, lädt World 36 (0x24). Diese Welt zeigt auf Level ID $01 (Wasser von 2-2), ein Level ohne Flaggenstange. Und da es keinen Pipe-Übergang für World 36 gibt, loopt das Level endlos. Das Fehlen der Überprüfung erschafft das Ikon.

3. **Tennis → Mario, 15 Jahre vor OoT → Paper Mario** -- Die RAM der NES überlebt einen Cartridge-Tausch dank der Kondensatoren und dem Warm-Start-/Cold-Start-System von SMB1. Der Schrittzähler von Tennis (der ein RAM-Byte erhöht, während er den Schritt-Sound abspielt) trifft genau auf die Adresse der World-Nummer. Die Top-Score-Ziffern müssen bei 0 bleiben, das $A5-Byte muss intakt sein und das Spiel muss einen Warm Start erkennen -- eine perfekte Koinzidenz, die nur mit Tennis funktioniert hat.

Die Originalvideos von [Retro Game Mechanics Explained](https://www.youtube.com/c/RetroGameMechanicsExplained) sind ein verdammt fleißiges Meisterwerk -- das Detailliveau bei der 6502-Dissassemble, die automatischen Maps aller Levels, die Erklärungen des Kart-Tauschs und des Warm Starts. Wenn du die Serie noch nicht gesehen hast, schau sie an, sie ist kurz und jede Minute ist dicht.

Der Quellcode der Maps ist auf [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html) verfügbar, und die vollständige Dissassemble von SMB1 ist Open Source in vielen Repos. Vor 40 Jahren haben japanische Programmierer dieses Level-System in 6502 geschrieben, mit null Unit-Tests und null Bug-Tracker, und wir lernen immer noch Dinge, indem wir ihren Code heute öffnen.
