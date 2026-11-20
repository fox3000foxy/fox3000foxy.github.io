---
title: "Super Mario Bros.: das Levelformat, die Pointer und die 256 Glitch Worlds"
description: "Wie 128 Level × 4 Zonentypen in 40KB ROM passen, warum das Minus World existiert, und wie ein NES-Tennis-Match Glitch Worlds laden kann."
date: 2026-06-10
tags:
  - retro
  - reverse-engineering
authors:
  - fox3000foxy
lang: "de"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "C+1PDnTqHWiTgRvbG9aCX+BjtbicWvDXfjJ0cW1K/9qw76VQQuF/oF5rpSbaJNOvODBTrM1qlEnezAh/VIbyTg=="
---
## 

Super Mario Bros., das sind 40 Kilobyte ROM. Acht Welten, 32 Ebenen, Feinde, Musik, Power-ups, alles steht da drin.

Aber wenn du einen Emulator öffnest und die richtigen Bytes durchsucht, kannst du Level 36-1 laden, oder 255-1. Oder in einer Welt landen, in der alles aus Bowser-Sprites und Rohren besteht, die nirgends hinführen.

Diese glitch worlds existieren aus einem einfachen Grund: Das SMB1-Level-Speichersystem ist ein Wunder der 8-Bit-Optimierung, und wenn man das Spiel zwingt, zu lesen, wo es nicht nötig ist, gibt es faszinierende Ergebnisse.

Retro Game Mechanics Explained hat eine Reihe von 4 Videos darauf gemacht – wir werden sie in einem einzigen Tauchgang in den Code 6502 des meistverkauften Spiels seiner Zeit kompilieren.

! [GLITCH OBJECTS – le titre de la série RGMechEx sur les mécaniques cachées de SMB1](/images/smb1-glitch-levels/title-card.jpg)

! [World 9-1 – l'écran titre du premier glitch world accessible via le cart swap Tennis](/images/smb1-glitch-levels/v1-title-9-1.jpg)

## Der Warm start: warum Tennis RAM in SMB1 überlebt

Bevor du über Level-Speicher sprechen, musst du verstehst, wie SMB1 startet. Weil der Glitch des NES Tennis-Swaps vollständig auf dem **Warm start / cold start-Detektionssystem** des Spiels basiert.

### 41 Bytes erhalten

Wenn SMB1 einen **cold start** (erstes Einschalten oder Power off/on) erkennt, löscht er die gesamte RAM. Wenn er aber einen **warm start ** (Reset Taste, keine Stromversorgung) erkennt und einen Speicherbereich von **41 Bytes** bewahrt:
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
Diese 41 Bytes dienen nur einer Funktion: dem Spieler die Möglichkeit geben, ** nach einem Spiel over** in der gleichen Welt zu bleiben. Wenn du in 6-3 stirbst, schreibt das Spiel die Welt 6 im Booty-Byte und dem title screen, wenn du A + Start aufrechterhalten, du beginnst in 6-1.

! [Les 41 bytes préservés en RAM lors d'un warm start – TOP SCORE, MARIO SCORE, TIMER, WORLD SELECT, CONTINUE WORLD, et le byte magique $A5](/images/smb1-glitch-levels/v1-memory-state.jpg)

### Die doppelte Überprüfung des Warm start

! [Cold start vs warm start – le diagramme de détection du reset](/images/smb1-glitch-levels/v1-warm-start.jpg)

Wenn SMB1 boott, prüft er nicht ein einziges Kriterium, sondern **2**:
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
! [La vérification du byte $A5 et des digits du top score – le coeur du warm start](/images/smb1-glitch-levels/v1-a5-byte.jpg)

Warum eine doppelte Überprüfung? Weil der Byte $A5 zufällig vorhanden sein könnte (ein anderes Spiel, das diesen Wert hinterlässt, oder der Standard-Ruhezustand des Chips). Wenn man überprüft, ob die top-Score-Daten (0-9) gültig sind, stellt man sicher, dass die Daten konsistent sind.

### Warum Tennis das einzige Spiel ist, das funktioniert

Wenn du SMB1 zum ersten Mal (cold start) einfügen, das Spiel:

1. Löscht alle RAM → Top-Score = 0, world byte = 0

2. Geschrieben $A5 an die Adresse $0787

Dann tauschen wir auf Tennis aus, ohne die Konsole auszuschalten.

- **Rasmus beim Start nicht abwischen** (nur wenige NES-Spiele tun dies)

- **Schreibt nicht auf die Bytes der Top-Score** → sie bleiben bei 0 (gültig)

- **Träg nicht auf das Byte $A5** → bleibt vorhanden

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
Wenn wir SMB1 zurückgeben:

1. Das $A5 Byte ist immer noch da (Tennis hat ihn nicht berührt)

2. Die Digits des Top-Score sind immer 0 (gültig)

3. Das world byte ist jetzt 8+ wert (inkrementiert von den Tennisschritten)

4. SMB1 erkennt einen Warm start → bewahrt das korrupte world byte

5. A + Start → world 9-1, world A-1, world 36-1, etc.

### Warum man Mario vor Tennis booten muss

Eine Feinheiten: Zuerst muss man SMB1 Booter, dann Tennis und dann SMB1, wieder. Wenn du direkt mit Tenni anfingst, würde das $A5 Byte nie geschrieben (Tennis schreibt nicht $ A5), so dass der Warm-Start-Erkennung fehlgeschlagen wäre und der RAM gelöscht würde.

! [Le compteur de pas de Tennis: chaque footstep incrémente le world byte](/images/smb1-glitch-levels/v1-footstep.jpg)

! [Access Glitch Worlds via NES Tennis – la vidéo qui explique le cart swap](/images/smb1-glitch-levels/yt-tennis.jpg)

## Wie SMB1 seine Niveaus in 40KB speichert

Nintendo R&D4 musste ein einfaches Problem lösen, das scheinbar auf einem hochgesperrten ROM-Haushalt auf einem horizontalen Stirnband mit Tielen, Feinden, Items steht.

Die Lösung ist eine Trennung in zwei Datenschichten ** vollständig unabhängig**:

### Der Tile layout (die Karte der Ebene)

Jede Ebene wird durch einen Zeiger zu einer komprimierten Tilesstruktur in ROM definiert. Die Kompression ist rudimentär, aber genial: ein Byte "Kontrolle" gefolgt von 1-3 Bytes Daten.

Das Format Tile verwendet ein System von **runs** (RLE-like):
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
Jede Ebene enthält 13 Zeilen mit 16 Spalten aus Tiles (13×16 = 208 Tiles sichtbar). Aber das komprimierte Format ermöglicht es, viel tiefer zu steigen – zum Beispiel, der Himmel und die leeren Spalten nehmen kaum Platz.

Der Rendering-Schleife in 6502:
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
### Der layout-Sprit (Feinde und Objekte)

Gleichzeitig werden Feinde und Objekte (Blocks?, Rohre, Goombas, Koopas) in einer komplett getrennten Struktur gespeichert. Jeder Spawn wird durch 2 Bytes definiert:
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
Jede Ebene kann bis zu 5 Seiten unterschiedlicher Sprite (endlich 5 "Screens" mit 16 Spalten) beziehen, aber in der Praxis verwenden die meisten Ebenen nur 2-3.

### Die Zeigertabelle

Das Design-Genie ist die Zeigertabelle. Jede Ebene wird als **Paar** ROM Adressen gespeichert:
```c
// Interne (vereinfachte) Struktur des World Map
struct LevelPointer {
    uint16_t tile_ptr; // ROM Adresse der Daten
    uint16_t sprite_ptr; // ROM-Adresse der Sprites-Daten
};

// 4 Getrennte Tabellen, eine nach AreaType:
// 0= Water,1= Overworld,2= Underground,3= Castle
LevelPointer level_table[4][128];
```
128 Einträge pro Tabelle. 4 Arten von Zonen. **512 mögliche Kombinationen**, aber nur ein Bruchteil wird vom offiziellen Spiel verwendet. Der Rest ist nicht initialisiertes RAM oder Daten, die als Zeiger interpretiert werden.

Wenn das Spiel eine Ebene lädt, macht es dies:
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
Das Spiel verleiht den Zeigern volles Vertrauen: es liest die Adresse in der Tabelle und entspannt, was an dieser Adresse, Endpunkt ist.

! [Level ID $06 (Water) – 9-1, la version sous-marine de 6-2](/images/smb1-glitch-levels/lvl-06-9-1.png)

! [La table des Level IDs: 128 entrées possibles, 34 assignées](/images/smb1-glitch-levels/v2-level-id-table.jpg)

! [L'ordre différent des pointeurs tiles et sprites – la cause des Frankenstein levels](/images/smb1-glitch-levels/v2-pointer-tables.jpg)

### Die 34 einzigartigen Ebenen und das 7-Bit-ID-System

! [Le chip RAM de la NES (MB8416A) – c'est lui qui conserve les données quand on swap les cartouches](/images/smb1-glitch-levels/v1-ram-chip.jpg)

SMB1 hat nicht 32 Ebenen, sondern **34 einzigartige Ebenen**. Viele Ebenen sind Doppelebenen (5-3 = 1-3, aber mit Bullet Bills) mit einer "Hard Mode" Flagge markiert.

- **Wasser** (Typ 0): 3 Ebenen (2-2, 7-2, Bonusbereich 5-2/6-2)
- **Overworld** (Typ 1): 22 Ebenen (davon 2 Wolkenräume Bonus)
- **Underground** (Typ 2): 3 Ebenen (einschließlich unterirdischer Bonusräume)
- **Castle** (Typ 3): 6 Ebenen
- \+ 1 cutscene room (vor den Untergrund-/Wasser-Ebenen)
- \+ 1 Warp Zone von 4-2

Jede Ebene hat eine ID auf **7 Bit**. Die 5 Bit von geringem Gewicht = Nummer in der Untergruppe, die 2 Bit starkes Gewicht = Art des Bereichs:
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
**128 Mögliche IDs** ($00-$7F), nur 34, die auf echte Ebenen zugewiesen werden. Nicht verwendete IDen zeigen auf alles.

### Zeigertabellen: zwei Listen, zwei Ordnungen

Die Zeiger und Sprites werden nicht in der gleichen Reihenfolge gespeichert. Der Code verwendet zwei separate 16-Bit-Listen (high byte / low byte in zwei separaten Tabellen):
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
Warum verschiedene Befehle? Kein technischer Grund – so wurden die Daten wahrscheinlich während der Entwicklung organisiert. Aber das schafft eine faszinierende Folge: Wenn eine Level-ID ungültig ist, laden die Tiles und Sprite-Zeiger *verschiedene Ebenen* auf, wodurch **Frankenstein Level** erzeugt werden.

Um zwischen diesen beiden Listen zu navigieren, verwendet das Spiel kleine **Offsettabellen** (wie ein Inhaltsverzeichnis):
```asm
; Tables d'offset par type (Water, Overworld, Underground, Castle)
; Chaque entrée = index de début dans la liste correspondante

SpriteOffsetTable:
  .byte $1F, $06, $1C, $00    ; Water=31, Overworld=6, Underground=28, Castle=0

TileOffsetTable:
  .byte $00, $03, $19, $1C    ; Water=0, Overworld=3, Underground=25, Castle=28
```
Zum Laden von Level 6-2 (ID $23, Overworld Nummer 3):
```asm
; 1. Type = 01 (Overworld) → index dans table d'offset = 1
; 2. Sprite offset = SpriteOffsetTable[1] = 6
;    Index final = 6 + 3 (numéro de niveau) = 9 → 10ème pointeur sprites
; 3. Tile offset = TileOffsetTable[1] = 3
;    Index final = 3 + 3 = 6 → 7ème pointeur tiles
; 4. Résultat : pointeur tiles $A619 + pointeur sprites $9ED0 = 6-2 ✓
```
Was passiert nun mit einer ungültigen ID wie $43 (Underground Nummer 3, die nicht existiert)?
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
! [Level ID $43 – Frankenstein level: tiles 1-4 + sprites eau 5-2](/images/smb1-glitch-levels/lvl-43-frankenstein.png)

! [Exploring Glitch Level Pointers – les tables d'offset expliquées](/images/smb1-glitch-levels/yt-pointers.jpg)

! [Le world index table – quand l'overflow de world 9 crée un glitch level](/images/smb1-glitch-levels/v2-world-index-table.jpg)

### Der world index tabelle: warum world 9 overflow

Es gibt eine 8-Bytes-ROM-Tabelle, die den Index der ersten Ebene jeder Welt (1-8) gibt. Und kurz danach, die Tabelle der 36 Level IDs aller Ebenen in der Reihenfolge des Spiels.
```asm
; WorldIndexTable (8 bytes)
  .byte 0, 5, 10, 15, 20, 25, 28, 33
;   -> Monde 1 commence au niveau 0
;   -> Monde 2 commence au niveau 5
;   -> Monde 8 commence au niveau 33

; LevelIDTable (36 bytes)
  .byte $25, $28, $29, $26, $24, ... ; les 36 Level IDs
```
Wenn man versucht, world 9 zu laden, liest das Spiel das 9. Byte von WorldIndexTable... das nicht existiert. Es overflow von 1 Byt in LevelIDTable, lies den Wert $25 und dann verwendet $ 25 als Index in LevellIDTtable (37. Eintrag) – was overlow wieder von 2 Bytes in SpriteOffsetTable und liest den Wert 6.
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
Für world G (16) geht der Overflow noch weiter und fällt auf die Level ID $01, das ist die cutscene Ebene, die 1-2 voraus geht:
```asm
; World G (16) :
;   WorldIndexTable[15] → lit $01 dans LevelIDTable
;   LevelIDTable[1] = $29 (cutscene 1-2)
;   → world G-1 = la cutscene d'entrée de 1-2
```
## Warum Glitch worlds existieren

Das Spiel hat 32 "legitime" Ebenen (8 Welten × 4 Ebenen). Aber die Zeigertabelle hat 128 Einträge pro Bereichtyp. Einträge jenseits der Ebene 32 enthalten, was in ROM an diesen Adressen gefunden wird – manchmal eine andere Ebene, manchmal Klangdaten, manchmal RAM, manchmal alles.

! [Level ID $01 Water (Minus World) – tile pointer $AE45, sprite pointer $A171](/images/smb1-glitch-levels/minus-world.png)

### Level ID $01 + AreaType 0 = Minus World

Die bekannteste Glitch worlds. Level ID $01 in AreaType 0 (Wasser) zeigt auf:

- **Tile Pointer: $AE45** → Unterwasserzone von 2-2/7-2
- **Sprite Pointer: $A171** → Sprites von 2-2/7-2

Das Ergebnis: ein Wasserstand, der 2-3 ist, aber unendlich schliesst, weil es kein Flagpol gibt.

Es ist die 36-1 Ebene (oder 36-1 in der Welt $-1).

! [Le warm start check de SMB1 – c'est lui qui permet au Minus World d'exister](/images/smb1-glitch-levels/v4-minus-world.jpg)
```asm
; Pourquoi le flagpole manque dans le Minus World :
; Les sprites de 2-2/7-2 ($A171) n'ont pas de flagpole
; dans leur séquence. Le jeu cherche le sprite $FD (flagpole)
; mais ne le trouve jamais → boucle infinie
;
; Le jeu continue de générer le niveau à l'infini
; jusqu'à ce que le timer atteigne zéro.
```
### Zeiger, die auf die RAM zeigen

Wenn der Tile Pointer oder Sprite Pointer auf eine RAM-Adresse ($00-$7F) statt auf ROM zeigt, versucht das Spiel, die ständigen Änderungen des RAM als Tile zu interpretieren:
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
Wenn sich die Nullseite ändert (weil Mario sich bewegt, der Timer sich dreht usw.), ändern sich auch die "Sprites" der Ebene. Deshalb haben einige Glitch worlds Feinde, die ständig blinken und sich verwandeln.

! [Level ID $03 Water – sprite pointer $009D pointe vers la RAM, niveau injouable](/images/smb1-glitch-levels/level-03-water.png)

### Level ID $36: Die leere Ebene (Overworld)

Level ID $36 in Overworld:

- **Tile Pointer: $AC35** (1-2)
- **Sprite Pointer: $A0D8** (1-2)

Ergebnis: nichts. Das Spiel lädt das Level, aber es ist "ohne Ebene" im RGMechEx Katalog markiert. Die Tiles sind vielleicht gültig, aber die Sprites zeigen auf einen Ort, der eine leere oder unfunktionale Ebene erzeugt.

### Level ID $1D (Castle): der Crash-Champion

Level ID $1D in Castle:

- **Tile Pointer: $A210** (4-4)
- **Sprite Pointer: $7EA0** (RAM!)

Sprite Zeigt RAM = undefined sprites. Das Spiel versucht, einen Spinyball oder einen Bullet Bill Blaster in der ersten Reihe von Tiles anzuzeigen. Es stürzt sofort ab.
```asm
; Quand le sprite pointer pointe vers la RAM,
; le jeu décompresse des bytes qui changent tout le temps
; comme des instructions "spawn". Le résultat :
; - Apparition d'objets inexistants (valeur undefined)
; - Crash PPU quand le sprite NES essaie d'afficher un tile invalide
; - Freeze complet de la console
```
## Die 256 glitch worlds katalogisiert

RGMechEx hat ein Skript geschrieben, das Maps von ** allen Ebenen** für alle 4 Zonentypen und 128 IDs jeweils erzeugt.

Der Weltzähler ist 8-Bit (0-255). 1-8 Welten sind legitim. Es bleibt **248 glitch worlds** möglich. Jeder glith world entspricht der ersten Ebene dieser Welt, und seine Level ID wird durch den Overflow-Mechanismus des WorldIndexTable berechnet.

! [Table des glitch worlds – 248 mondes corrompus, 68 premiers niveaux accessibles](/images/smb1-glitch-levels/v3-glitch-worlds-table.jpg)

Von den 128 möglichen IDs sind nur **68 "first level" einer Welt** (zugänglich über die world number). Die anderen 60 sind 2+-Levels oder unzugänglich.

| Typ | spielbare Einzel-IDs | Absturz-IDs | Leere IDs |
|------|---------------------|-------------------|-----------|
| Water (0)    | ~20  | ~60  | ~48  |
| Overworld (1)| ~30  | ~55  | ~43  |
| Underground (2) | ~15 | ~65 | ~48  |
| Castle (3)   | ~25  | ~58  | ~45  |

Viele IDs führen auf der gleichen Ebene, weil die Zeiger, die auf die gleichen ROM-Adressen fallen. Level ID $28 (Overworld) zum Beispiel – tile pointer $A7CD (2-1) – erscheint in **38 glitch worlds**, weil sein Sprite pointer mit $9F51 auf einen Bereich der ROM zeigt, der als Padding/Tondaten verwendet wird, die von einer Fülle von IDen wiederverwendet werden.

! [Carte du niveau ID $28 (Overworld) – 2-1 tiles avec des sprites normaux, 38 glitch worlds](/images/smb1-glitch-levels/level-28-overworld.png)

! [Super Mario Bros. Glitch Levels Explained – la 3ème vidéo](/images/smb1-glitch-levels/yt-levels.jpg)

### Die 6 wirklich einzigartigen glitch levels

Von den 19 zugänglichen Glitch-Level-IDs stürzen nur **6 beim Laden nicht sofort** ab:

| World | Level ID | Beschreibung |
|-------|----------|-------------|
| E-1 (224) | $50 | Ein Block über einem Abgrund. Mario stirbt sofort. |
| W | $57 | Mario spawn blockiert, nicht bewegen. |
| 42 (133) | $50 | Wolkentunnel, der Mario in die Falle lockt, wenn er weit genug geht. |
| 62 (131, 240) | $4D | Schloss gefroren: Mario spawn oben, kann nicht fallen → blockiert. |
| 127 | $4B | Unterirdisches Tunnel, aber stürzt ab, wenn wir zu weit gehen. |
| 137 | $4B | Aktiviert das automatische Scrollen von cutscenes. Mario trifft einen einzigen Brickblock, der ihn für immer blockiert. |

! [Level ID $50 (cloud tunnel) – le glitch world 42-1 et E-1](/images/smb1-glitch-levels/lvl-50-cloud.png) 
! [Level ID $4D (castle) – world 62-1, Mario bloqué au spawn](/images/smb1-glitch-levels/lvl-4D-castle.png) 
! [Level ID $4B (tunnel) – world 127-1, crashe si on va trop loin](/images/smb1-glitch-levels/lvl-4B-tunnel.png)

Sechs glitch worlds auf 248, die etwas wirklich Neues produzieren. Der Rest sind normale Ebenen mit der falschen Art von Bereich, oder schwarze Bildschirme.

## Das Format der Ebenen im Detail

Kurs auf das genaue Format der Leveldaten, um zu verstehen, warum die glitch levels stehen (oder nicht).

### Die Header Ebene: 2 bytes, 6 Eigenschaften

Jede Ebene beginnt mit einem Header von 2 Bytes, die 6 Eigenschaften steuert:
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
Die Art ändern Kontrolle der visuellen Variationen: Wellen oben auf den Wasserspiegeln, Ziegelboden 8-3, Nachtpalette 4,3, Schnee 6-2, etc.

### Die Gegenstände: 2 bytes, Next Screen Flag, Schwanz 3 Slots

Nach dem Header kommt eine Liste von** Tile Objekten**, jedes Objekt ist 2 Bytes. Das $FD Byte markiert das Ende der Liste.
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
Wenn das Bit "next screen" gesetzt wird, wird die aktuelle Arbeitskolonne um 1. Dies ermöglicht es, Objekte über die ersten 16 Spalten hinaus zu platzieren. Objekte müssen **in der Reihenfolge** (links rechts) aufgelistet werden, weil das Spiel sie sequenziell belastet:
```asm
; La routine de chargement a DEUX phases par colonne :
; Phase 1 : chercher les nouveaux objets qui commencent sur cette colonne
;            et les ajouter à la file d'attente (queue)
; Phase 2 : traiter chaque objet dans la queue en dessinant les tiles,
;            et retirer ceux qui finissent sur cette colonne
```
Der Schwanz ist genau **3 Slots**. Direkte Folge: Es können nicht mehr als 3 Objekte auf derselben Säule beginnen. Wenn der Schwanz voll ist, wird das 4. Objekt ignoriert und nie geladen.

Deshalb vermeiden gut konzipierte Ebenen, zu viele Objekte zu stapeln. Beispiel 1-2: Die Säule mit dem 1up Block in der Decke + die Ziegel nebenan werden in zwei verschiedene Objekte gefaltet, um die Grenze von 3 einzuhalten.

### Y Sonderstellung: 12, 13, 14, 15

Wenn Y=12 keine Y-Position hat (sie wird nach Typ hardcodiert):
```asm
; Y=12 : objets sans Y position
;   Type 0 : trou (supprime le sol)
;   Type 1 : rope de plateforme mobile
;   Types 2-4 : ponts à Y fixe
;   Type 5 : trou avec eau/lave
;   Types 6-7 : rangées de ? blocks
```
Wenn Y=13, zwei Untergruppen. Wenn Bit 6 von Byte 1 ist 1:
```asm
; Y=13, bit6=1 : objets spéciaux
;   0 = L-pipe (cutscene), 1 = flagpole, 2-3 = pont/axe/hamer (fin château)
;   4 = stop screen, 5 = random enemies, 6 = loop level, 7+ = crash possible
```
Wenn bit6 = 5 Bit mit geringem Gewicht einen **screen skip** (direkt auf einem N-Bildschirm scree flag) kodieren.

Wenn Y=14: Das gleiche Prinzip mit bit6=1, um den Typ zu ändern, bit6-=0, um Hintergrund zu ändern + floor pattern.

### Die Floor Patterns: 16 Bodenmuster

Der Boden der Ebenen ist nicht aus Einzelobjekten. SMB1 verwendet **flor patterns**, ein Grundmotiv, das für alle Spalten bis zur nächsten Änderung gilt:
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
Deshalb sind die Löcher Objekte: sie überqueren den Floor Pattern auf einer bestimmten Spalte, ohne die Pattern für alles andere zu ändern.

### Die Grenze von 256 Bytes und die Repeat

Alle Daten einer Ebene halten in **256 Bytes maximal**. Das Y Register vom 6502 wird als Index verwendet und es ist 8 Bit. Wenn das Spiel am Ende der Daten kommt, ohne den Byte $FD zu finden, **er schließt am Anfang** und wiederholt 256 Byten bis unendlich:
```asm
; Index Y = 8 bits → max 256 bytes de données tiles
; Si Y overflow (255 → 0) sans rencontrer $FD → repeat
; Même chose pour les sprites, mais les objets pipe (3 bytes)
; décalent la parité de l'index à chaque chargement.
```
Einige Glitch levels nutzen diese Repeat, um Ebenen zu erzeugen, die "unendlich" dauern.

### Das System der Sprite: 2 bytes + Pfeife Übergänge

Sprites folgen einem ähnlichen Format, aber ohne Header und mit einigen Schlüsselunterschieden. $FF Byte markiert das Ende der Liste.
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
Das niedrige Byte 1 Bit ist **hard level flag**: Wenn der Sprit auf 1 gesetzt wird, erscheint er nur in den Ebenen ≥ 5-3. So werden die "hard mode" Ebenen erstellt.

Y position 15 = **screen skip** (identisch für die Tiles). Y positionen 14 = **pipe transitoire** (3 bytes):
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
Die einzige Grenze ist, dass es nicht mehr als 4 gleichzeitig geladene Sprite im Bereich von spawn (nur rechts off-screen) geben kann. Darüber hinaus werden die Sprite ignoriert.

## Wie man auf glitch worlds zugreift

Es gibt zwei Hauptmethoden.

### Die klassische Methode: der Wall Clip

Der Wall Clip (Durchgang durch Wände) ermöglicht es, von der normalen Ebene zu gehen und bis zur versteckten Warzone zu gehen. Wenn man den Weltzähler über die RAM manipuliert, kann man jede Level ID laden.

Die Technik:

1. World 1-2: Gehst du in den versteckten Endrohr

2. Machst du den Wall Clip an der rechten Wand

3. Gehst du ins Vakuum bis zum Warp-Bereich

4. Das Spiel interpretiert Werte als Welten

Aber diese Methode gibt nur Zugang zu einem kleinen Teil der glitch worlds.

### Die extreme Methode: NES Tennis cart Swap

Siehe den Abschnitt "Warm start" oben für das vollständige Detail. Zusammenfassend: Der Tennis Schrittzähler schreibt auf dem gleichen Byte RAM wie die Startwelt von SMB1, und der Warm start Erkennung hält diesen Wert.

### Die Ecke der Hacker: der Code für alles zu erkunden

Wenn du alle Glitch selbst in einem Emulator erkunden willst, kannst du die Level ID direkt patchen:
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
RGMechEx hat die vollständige Liste der 128 Ebenen × 4 Typen mit automatisch generierten Maps auf [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html)Jeder Eintrag zeigt den Tile Pointer, den Sprite Pointer und eine visuelle Karte des Levels.

## Die wtf-Ebenen

### Level ID $1F (Water): 15 glitch worlds in einem

Der Tile Pointer $A302 (3-4) kombiniert mit dem Sprit Pointer mit $02A0 gibt 15 verschiedene glitch worlds (D-1, J-1, Y-1, Z-1, 55-1, 73-1...). Erläuterung: Der Sprite Pointer zeigt auf einen Bereich der ROM, der Daten enthält, die in der Nähe von gültigen Sprites liegen, um spielbare Ergebnisse zu erzielen, aber die Kombination der Schloss-Tile 3-4 mit overworld-Sprites erzeugt eine absurde Wiedergabe.

### Level ID $28 (Overworld): 38 glitch worlds = Rekord

Der absolute Rekord. 38 Einträge von glitch world zeigen auf die gleiche Ebene (2-1 Tile + $9F51 sprites). Warum? Weil der $ 9F51-Sprite in einen Bereich der ROM fällt, der als Padding/Tondaten verwendet wird, die von einer Fülle von IDs wiederverwendet werden.

### Level ID $49 (Underground): die DFS-Ebene

Tile Pointer $76AE + sprite Pointer mit $1C9D. Der Tile Zeiger zeigt auf den Bereich der ROM, der für die Famicom Disk System-Version reserviert ist. Ergebnis: ein Level mit Tiles, die in der Standard-Kartaste nicht vorhanden sind. Dies ist der Level, der die Stufe 52-1 und 196-1 anzeigt.

### Level ID $00-$02: Die echten Bonus-Levels

Diese IDs werden von legitimen Unterebenebenen des Spiels verwendet:

- **$00**: Unterwasserzone von 5-2/6-2 (von H-1, 39-1)
- **$01**: Wasser von 2-2/7-2 (Minus World, 36-1)
- **$02**: Unterstufe 8-4 (136-1, 151-1, 215-1)

Der Unterschied zwischen einem normalen "bonus"-Level und einem world glitch ist, dass die Warp-Zonen überprüfen die aktuelle Welt:
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
Glitch worlds mit Zahlen > 8 oder 0 können nicht durch normale Rohre erreicht werden. Es ist das Wall Clip oder die Cart Swap erforderlich.

## Warum einige Ebenen abstürzen: Jump-Tabellen

Wenn das Spiel ein Tile-Objekt lädt, verwendet es seinen Typ als Index in einem **Jump-Tabelle**:
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
! [Les jump tables: pourquoi un type d'objet invalide fait crasher le jeu](/images/smb1-glitch-levels/v4-jump-table.jpg)

Wenn ein Objekt einen ungültigen Typ hat (≥12), springt das Spiel zu einem Zeiger, der nicht in dieser Tabelle existiert. **4 outcomes possible**:

1. **Gültiges Poster** → das Objekt wird normalerweise geladen
2. **Binder zu einem anderen Jump-Tabelle** (überlappend) → ein anderes Objekt erscheint. Beispiel: Typ 12 zeigt auf die Tabelle Y=13, was einen L-Pipe gibt.
3. **Point zum Ausführbaren** → Zufallscode-Ausführung (wahrscheinlicher Crash)
4. **Placeholder explizit (NOP)** → das Objekt macht nichts (einige Sprite sind so, produzieren Feinde, die vor Ort fliegen, ohne sich zu bewegen)

! [Glitch level ID $58: le sprite pointer pointe vers une adresse invalide, le jeu crashe](/images/smb1-glitch-levels/v4-glitch-58-crash.jpg)

! [Glitch level ID $50: le cloud tunnel, un niveau généré par des données corrompues](/images/smb1-glitch-levels/v4-glitch-50.jpg)

Die glitch level ID $58 (der abstürztde Tunnel): sein Sprite zeigt auf eine Speicherregion, die **ohne ROM nicht existiert**. Das Spiel versucht, den gleichen Koopa 5 mal pro Frame an Position (0,0) zu laden, was die SSP sät und verursacht eine Freeze.
```asm
; Pourquoi ID $58 crashe :
; Sprite pointer → adresse invalide (hors espace NES standard)
; → Le jeu lit des bytes indéterminés comme des types de sprite
; → Le Koopa $00 (type invalide sans handler) boucle en appel récursif
; → Stack overflow 6502 → freeze
```
### Das Paradoxe Blowjob Warp

Denk an den Check.`target_world BETWEEN 1 AND 8`Auch wenn du einen Tipp in einem world glitch findest, überprüft das Spiel, ob die Zielwelt zwischen 1 und 8 liegt. Glitch worlds haben Zahlen > 8 (36-1, 255-1...), so dass der Warp fehlschlägt.

Deshalb ist die Minus World auch nicht enden: Flagpole ist nicht in Sprites vorhanden, und Rohre führen nirgends hin.

### Das Trick der 5 Objekte in einer Spalte

Es gibt ein edge box, das die Grenze von 3 Objekten pro Spalte überwindet. Wenn der Schwanz blockiert wird (Fullslots + Nächstes Objekt mit fehlendem next screen flag), wird das Spiel "vorbehandelt" die aktuelle Spalte in der Schleife, bis ein Objekt mit nächt screen flage gefunden wird.
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
Das nennt man "Que skip" und wird von einigen Romackern verwendet, um dichtere Ebenen zu schaffen, als das Format normalerweise erlaubt.

## Unterschiede zwischen den Versionen

### Famicom Disk System

Die FDS-Version von SMB1 hat eine andere **memory map**. Alle Levelzeiger sind verschoben, aber die Daten sind die gleichen. Was ändert: Die Indizes der glitch worlds sind völlig verschieden:
```
FDS World 36 → Level ID $09 (eau version de 5-3)
  → Le flagpole est présent ! On peut finir le niveau.
  → Ensuite : $27 (7-3 normal) → $44 (4-4 underground)
  → $44 est finissable → la hache fonctionne → fin du jeu !
  
Le Minus World FDS est donc un "bonus world" qui peut mener
à la complétion du jeu, contrairement à la version NES.
```
Meine Lieblings-FDS-Level: **ID $5F**, eine unterirdische Version der zweiten Hälfte von 3-3 im unteren Tunnel (beschädigt, ob es ein Autoscroller).

### Die verlorenen Levels (Super Mario Bros. 2 japonais)

Lost Levels ändert eine Menge Dinge:

1. **Order identische Tile/Sprites**: mehr Frankenstein levels (Tile und Sprites laden die gleiche Ebene mit einer ungültigen ID)
2. **Einer 16-Bit-Zeigertisch** anstelle von zwei separaten High/low-Tabellen
3. **4 Festplattendateien**: Die ROM wurde für den FMS gespickt:
   - Datei 1: worlds 1-4
   - Datei 2: worlds 5-8
   - Datei 3: world 9 + sound engine
   - Datei 4: worlds A-D (ein völlig anderes Zeiger-Tisch)
4. **Selbst Level ID = 4 mögliche Ebenen** je nach geladener Datei
5. **Mehr glitch Tennis**: Die kontinuierliche Option (weiter in der gleichen Welt nach Game over) macht den Warmstart unnötig, und das Spiel **reset sofort** wenn world > 9
6. **Neue Objekte**: Giftpilz, unsichtbare Block, unsexuelle Block-Fire flower, upside down pipes, Wind – aber in die Mitte der vorhandenen Listen eingefügt → ** Unvereinbarkeit backward** mit SMB1
7. **Piranha Plants immer rot** nach world 4, **springboards grün** nur in worlds 2/B/3/C/7

### Super Mario All-Stars (SNES)

Direkte Übertragung mit denselben Routinen 6502 (der SNES führt den NES-Code im kompatiblen Modus aus):

- **Warp-Bereich festgelegt**: mehr Minus World (Betreten du den linken Schlauch vor dem Text führt zur richtigen Welt)
- **Plantage**: Die meisten glitch levels abstürzen (außer ID $6A und 9-1)
- **Schlossobjekte hinzugefügt**: einzigartiger gemacht
- **Aber**: **4-2 wrong warp** funktioniert noch (nicht gepatcht!)

### Die 4-2 wrong warp: ein Objektplatzierungs-Bug

In 4-2 gibt es zwei Übergangsobjekte: die Rebe (Warp Zone) und den Schlauch (Cash Room Ecke). Das erste Übergangsobjekt (das der Rebe) wird **gut vor** platziert, dass der Weinberg auf dem Bildschirm erscheint. Das zweite (das Rohr) wird auf dem Niveau** **zu spät gelegt.
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
### Die Schlingenstufen

Wie funktioniert Loop (8-4, 7-4)? Die Ebene hat **checkpoints** mit Bildschirmnummern und Positionen Y hardcodiert:
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
## Format ändern, nicht Code

Eine der faszinierendsten Lektionen dieser Architektur ist, dass die Entwickler von SMB1 ein sehr ausdrucksstarkes Level-System ohne jemals den Rendercode 6502 zu berühren, schaffen konnten.Die ganze Variation zwischen den Ebenen kommt von **Daten** (Petzer, Objekte, Sprites, Floor Patterns), nicht vom Code.

Die 256 glitch worlds existieren, weil die ** Zeigertabellen für 128 Einträge × 4 Typen** dimensioniert sind und das Spiel niemals die Werte, die es liest, gültig ist. Wenn ein Zeiger in RAM fällt, interpretiert das Spiel Marios Register als Tiles. Wenn der Zeiger auf die Tondaten fällt, spielt das Spiel Musik in Form von level design. Und wenn die Jumptische Overflows, das Spiel läuft alles bis zum Absturz.

! [More Super Mario Bros. Mechanics Explained – la 4ème vidéo](/images/smb1-glitch-levels/yt-mechanics.jpg)

## Was man daraus lernen kann

1. **Trenn-/Sprites-Reparatur**: völlige Unabhängigkeit der beiden Schichten, mit unterschiedlichen Lagerordnungen, die einzigartige Frankenstein-Levels erzeugen
2. **RLE-Kompression + Objektsystem**: Ebenen sind keine Bitmaps, sondern Listen von platzierten Objekten, mit Floor Patterns für den Boden
3. **Nur 3 Slots**: strenge Grenze der Hardware (und des Level Design)
4. **Vertrauen zu Zeigern**: Das Spiel vertraut Zeigern und Jumptischen, die entweder spielbare Gnitchs oder Absturz erzeugen
5. **256 bytes max**: die Grenze des Y register 6502, wodurch sich die Daten wiederholen, wenn man zu weit geht
6. **Warm start / cold start**: ein System von "weiter" das die Tür zu Tennis-Cart Swap öffnete → Mario

Das Schönste: Das ist Code 6502, der in 40KB steht. Der Code Dialog direkt mit der Hardware und gibt volles Vertrauen auf jeden Speicherzugriff. Wenn der Zeiger verfault ist, das Spiel abstürzt. Und Absturz, sie nennen Glitch worlds.

## Die drei Dinge, die man sich zu Herzen nehmen muss

1. **Glitch worlds sind Zeiger, die falsch fallen** – Das Spiel hat 128 IDs × 4 Arten von Bereichen, aber nur 34 einzigartige Ebenen. Wenn die world number beschädigt ist (durch Tennis oder Wall Clip), lädt das Spiel einen Zeiger für eine andere Ebene entworfen, und die 512 möglichen Kombinationen führen unvorhersehbare Ergebnisse.
2. **Der Minus World ist ein Warp-Bug in Kombination mit Korruption** – Der linke Schlauch in 1-2, wenn aktiviert, bevor der Text erscheint, world last 36 (0x24). Dieser world zeigt auf Level ID $01 (Wasser von 2-2), ein Niveau ohne Flagpol. Und da es keinen Pfeifenwechsel für world 36, die Schleife-Level bis unendlich. Das Fehlen einer Überprüfung erstellt das Symbol.
3. **Tennis → Mario, 15 Jahre vor OoT → Paper Mario** – Die NES-RAM überlebt einen Patrone-Transistor mit den Kondensatoren und dem Warmstart / Cold Start System von SMB1. Der Tennis-Schrittzähler (der einen Byte RAM durch das Spielen des Klangs der Schritte erhöht) stürzt die Adresse des world number ab. Die Digits des Top-Score-Scorings müssen bei 0 bleiben, der Bytes $A5 ist intakt, und das Spiel erkennt einen Warmstart – ein perfekter Wettbewerb für Umstände, der nur mit Tenni funktioniert hat.

Die Originalvideos von [Retro Game Mechanics Explained](https://www.youtube.com/c/RetroGameMechanicsExplained)sind eine verdammte Ameisearbeit – die Detailebene auf dem Zerlegen 6502, die automatischen Maps aller Ebenen, die Erklärungen des cart Swap und des Warm Starts. Wenn du die Serie nicht gesehen haben, mate-la, sie ist kurz und jede Minute ist dicht.

Der Quellcode der Maps ist auf [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html)Vor 40 Jahren schrieben japanische Programmierer dieses Level-System in 6502 mit Null-Test und Null-Bug-Tracker-Test, und wir lernen weiterhin Optimierungstechniken, indem wir heute ihren Code öffnen.
