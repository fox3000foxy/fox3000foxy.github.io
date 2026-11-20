---
title: "Super Mario Bros.: il formato di livello, i puntatori e i 256 glitch world"
description: "Come 128 livelli × 4 tipi di zona stanno in 40KB di ROM, perché il Minus World esiste, e come un match di Tennis NES può caricare glitch world."
date: 2026-06-10
tags:
  - retro
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "6YJHX/u0vCNfvC5JDmG408AWOC8wgmRgAeBpHyOZSO33M1GwAoNnzp4DW9Lx+vgh+qzozTUCyPKBYv2U+pBd/w=="
---

## Introduzione

Super Mario Bros., sono 40 kilobyte di ROM. Otto mondi, 32 livelli, nemici, musica, power-up, tutto sta lì dentro.

Ma se apri un emulatore e traffichi i byte giusti, puoi caricare il livello 36-1. O il 255-1. O atterrare in un mondo dove tutto è fatto di sprite di Bowser e tubi che non portano da nessuna parte.

Questi glitch world esistono per una ragione semplice: il sistema di storage dei livelli di SMB1 è una meraviglia di ottimizzazione 8-bit, e quando forziamo il gioco a leggere dove non dovrebbe, dà risultati affascinanti.

Retro Game Mechanics Explained ha fatto una serie di 4 video là sopra: li compiliamo in un'unica immersione nel codice 6502 del gioco più venduto della sua epoca.

![GLITCH OBJECTS -- le titre de la série RGMechEx sur les mécaniques cachées de SMB1](/images/smb1-glitch-levels/title-card.jpg)

![World 9-1 -- l'écran titre du premier glitch world accessible via le cart swap Tennis](/images/smb1-glitch-levels/v1-title-9-1.jpg)

## Il warm start: perché la RAM di Tennis sopravvive in SMB1

Prima di parlare di storage di livelli, bisogna capire come SMB1 si avvia. Perché il glitch del cart swap NES Tennis poggia interamente sul **sistema di rilevamento warm start / cold start** del gioco.

### I 41 byte preservati

Quando SMB1 rileva un **cold start** (prima accensione o power off/on), cancella tutta la RAM. Ma quando rileva un **warm start** (reset pulsante, niente interruzione di alimentazione), preserva una zona memoria di **41 byte**:

```asm
; I 41 byte preservati in RAM durante un warm start
; Indirizzi $075F-$0787
;
; $075F : byte di avvio (world - 1)    [1 byte]
; $0760 : flag di selezione mondo (pulsante B) [1 byte]
; $0761-$0762 : inutilizzato                    [2 byte]
; $0763-$0768 : timer (6 cifre, 3 mostrate) [6 byte]
; $0769-$076E : monete Luigi                   [6 byte]
; $076F-$0774 : monete Mario                   [6 byte]
; $0775-$077A : punteggio Luigi                   [6 byte]
; $077B-$0780 : punteggio Mario                   [6 byte]
; $0781-$0786 : top score (6 cifre, 1 nascosta) [6 byte]
; $0787 : il byte magico $A5                 [1 byte]
```

Questi 41 byte servono a una sola funzionalità: permettere al giocatore di **continuare allo stesso mondo dopo un game over**. Se muori in 6-3, il gioco scrive il mondo 6 nel byte di avvio, e alla title screen, se tieni A + Start, ricominci in 6-1.

![Les 41 bytes préservés en RAM lors d'un warm start -- TOP SCORE, MARIO SCORE, TIMER, WORLD SELECT, CONTINUE WORLD, et le byte magique $A5](/images/smb1-glitch-levels/v1-memory-state.jpg)

### La doppia verifica del warm start

![Cold start vs warm start -- le diagramme de détection du reset](/images/smb1-glitch-levels/v1-warm-start.jpg)

Quando SMB1 fa boot, non verifica un solo criterio ma **due**:

```asm
; verifica warm start: byte magico + cifre top score valide
CheckWarmStart:
  ; 1. Verifica il byte magico $A5 a $0787
  lda $0787
  cmp #$A5
  bne ColdStart        ; non $A5 → cold start

  ; 2. Verifica le 6 cifre del top score ($0781-$0786)
  ;    Ogni cifra deve stare tra 0 e 9
  ldx #0
CheckLoop:
  lda $0781,x
  cmp #$0A
  bcs ColdStart        ; cifra >= 10 → cold start
  inx
  cpx #6
  bne CheckLoop

  ; Se entrambe le condizioni passano → warm start
  ; La RAM non è cancellata, il mondo di partenza è preservato
  jmp WarmStartBoot
```

![La vérification du byte $A5 et des digits du top score -- le coeur du warm start](/images/smb1-glitch-levels/v1-a5-byte.jpg)

Perché una doppia verifica? Perché il byte $A5 potrebbe esserci per caso (un altro gioco che lascia questo valore, o lo stato di riposo di default del chip RAM). Verificando che le cifre del top score siano valide (0-9), ci assicuriamo che i dati siano coerenti.

### Perché Tennis è l'unico gioco che funziona

Quando inseriamo SMB1 per la prima volta (cold start), il gioco:
1. Cancella tutta la RAM → top score = 0, world byte = 0
2. Scrive $A5 all'indirizzo $0787

Poi, passiamo su Tennis senza spegnere la console. Tennis:
- **Non pulisce la RAM all'avvio** (pochi giochi NES lo fanno)
- **Non scrive sui byte del top score** → restano a 0 (validi)
- **Non tocca il byte $A5** → resta presente
- **Usa l'indirizzo $075F** per il contatore di passi del giocatore

```asm
; Il footstep increment in Tennis:
; A ogni passo del giocatore sul campo, Tennis incrementa il byte a $075F.
; Questo stesso byte è usato da SMB1 come "world number - 1".
;
; 0 passi  → world 0 → SMB1 = world 1
; 1-7 passi → world 1-7 → mondi normali
; 8+ passi → world 8+ → glitch world!
;
; Il contatore si incrementa solo quando la musica si ferma
; (i footstep sound non suonano durante la musica).
```

Quando rimettiamo SMB1:
1. Il byte $A5 è sempre lì (Tennis non l'ha toccato)
2. Le cifre del top score sono sempre 0 (valide)
3. Il world byte vale ormai 8+ (incrementato dai passi di Tennis)
4. SMB1 rileva un warm start → preserva il world byte corrotto
5. Tenere A + Start → world 9-1, world A-1, world 36-1, ecc.

### Perché bisogna avviare Mario prima di Tennis

Una sottigliezza: bisogna prima avviare SMB1, poi Tennis, poi di nuovo SMB1. Se iniziassi direttamente da Tennis, il byte $A5 non sarebbe mai scritto (Tennis non scrive $A5), quindi il rilevamento warm start fallirebbe e la RAM sarebbe cancellata.

![Le compteur de pas de Tennis : chaque footstep incrémente le world byte](/images/smb1-glitch-levels/v1-footstep.jpg)

![Access Glitch Worlds via NES Tennis -- la vidéo qui explique le cart swap](/images/smb1-glitch-levels/yt-tennis.jpg)

## Come SMB1 salva i suoi livelli in 40KB

Nintendo R&D4 ha dovuto risolvere un problema semplice in apparenza: rappresentare livelli che scorrono orizzontalmente con tile, nemici, item, il tutto in un budget ROM ultra-stretto.

La soluzione, è una separazione in due strati di dati **completamente indipendenti**:

### Il tile layout (la mappa del livello)

Ogni livello è definito da un puntatore verso una struttura di tile compressa in ROM. La compressione è rudimentale ma geniale: un byte "controllo" seguito da 1-3 byte di dati.

Il formato tile usa un sistema di **run** (tipo RLE):

```asm
; Formato tile SMB1 (semplificato)
; Ogni "comando" è un byte controllo:
;
; $00-$7F : mette una tile, avanza di 1 colonna
; $80-$BF : mette una tile ripetuta N volte (N = byte - $80 + 1)
; $C0-$FF : comando speciale (fine riga, salto, cambio palette)

Esempio: per disegnare 3 mattoni consecutivi:
  $82 $01    ; ripete la tile $01 (brick) 3 volte
```

Ogni livello contiene 13 righe di 16 colonne di tile (13×16 = 208 tile visibili). Ma il formato compresso permette di scendere molto più in basso: per esempio, il cielo e le colonne vuote non prendono quasi spazio.

Il ciclo di rendering in 6502:

```asm
; Decompressione tile - ciclo principale
; Ingresso: puntatore tile_data in $XX
; Uscita: tilemap livello nella RAM PPU

DecompressTile:
  lda (tile_ptr),y      ; leggi byte controllo
  iny
  cmp #$80
  bcc SingleTile        ; $00-$7F : tile unica
  cmp #$C0
  bcc RunLength         ; $80-$BF : run-length
  jmp SpecialCommand    ; $C0-$FF : comando speciale

SingleTile:
  sta PPU_DATA          ; scrivi la tile direttamente
  jmp Next

RunLength:
  sec
  sbc #$7E              ; N = control - $7E
  tax
  lda (tile_ptr),y      ; leggi la tile da ripetere
  iny
: sta PPU_DATA
  dex
  bne :-
  jmp Next
```

### Lo sprite layout (nemici e oggetti)

In parallelo, nemici e oggetti (blocchi ?, tubi, goomba, koopa) sono salvati in una struttura completamente separata. Ogni spawn è definito da 2 byte:

```asm
; Formato sprite SMB1
; Byte 0: posizione X (in colonne)
; Byte 1: tipo di sprite + bit di pagina Y
; Y è derivato dall'indice nella sequenza

Una sequenza di sprite:
  $01 $4B    ; goomba alla colonna 1
  $09 $4B    ; goomba alla colonna 9
  $10 $61    ; blocco ? alla colonna 16 (contiene moneta)
  $15 $54    ; koopa verde alla colonna 21
  $FF        ; fine sequenza
```

Ogni livello può referenziare fino a 5 pagine di sprite diverse (infine, 5 "screen" di 16 colonne), ma in pratica quasi tutti i livelli ne usano solo 2-3.

### La tabella dei puntatori

Il genio del design, è la tabella di puntatori. Ogni livello è salvato come una **coppia** di indirizzi ROM:

```c
// Struttura interna (semplificata) della World Map
// coppia di puntatori ROM: tile + sprite
struct LevelPointer {
    uint16_t tile_ptr;   // Indirizzo ROM dei dati tile
    uint16_t sprite_ptr; // Indirizzo ROM dei dati sprite
};

// 4 tabelle separate, una per AreaType:
// 0 = Water, 1 = Overworld, 2 = Underground, 3 = Castle
LevelPointer level_table[4][128];
```

128 voci per tabella. 4 tipi di zona. **512 combinazioni possibili**, ma solo una frazione è usata dal gioco ufficiale. Il resto, è RAM non inizializzata o dati interpretati come puntatori.

Quando il gioco carica un livello, fa questo:

```asm
; Caricamento di un livello
; A = AreaType (0-3), X = LevelID (0-127)

LoadLevel:
  sta AREA_TYPE
  asl                  ; *2 per offset in tabella 16-bit
  tax
  lda LevelTable_TilePtr, x
  sta TILE_PTR
  lda LevelTable_TilePtr+1, x
  sta TILE_PTR+1       ; puntatore verso le tile
  lda LevelTable_SpritePtr, x
  sta SPRITE_PTR
  lda LevelTable_SpritePtr+1, x
  sta SPRITE_PTR+1     ; puntatore verso gli sprite
  jsr DecompressTiles
```

Il gioco accorda una fiducia totale ai puntatori: legge l'indirizzo nella tabella e decomprime ciò che si trova a quell'indirizzo, punto finale.

![Level ID $06 (Water) -- 9-1, la version sous-marine de 6-2](/images/smb1-glitch-levels/lvl-06-9-1.png)

![La table des Level IDs : 128 entrées possibles, 34 assignées](/images/smb1-glitch-levels/v2-level-id-table.jpg)

![L'ordre différent des pointeurs tiles et sprites -- la cause des Frankenstein levels](/images/smb1-glitch-levels/v2-pointer-tables.jpg)

### I 34 livelli unici e il sistema di ID a 7 bit

![Le chip RAM de la NES (MB8416A) -- c'est lui qui conserve les données quand on swap les cartouches](/images/smb1-glitch-levels/v1-ram-chip.jpg)

SMB1 non ha 32 livelli, ma **34 livelli unici**. Molti livelli sono doppioni (5-3 = 1-3 ma con Bullet Bill) segnati da un flag "hard mode". I veri livelli unici:

- **Acqua** (Tipo 0): 3 livelli (2-2, 7-2, zona bonus 5-2/6-2)
- **Overworld** (Tipo 1): 22 livelli (di cui le 2 stanze nuvole bonus)
- **Underground** (Tipo 2): 3 livelli (di cui le stanze bonus sotterranee)
- **Castle** (Tipo 3): 6 livelli
- \+ 1 stanza cutscene (prima dei livelli sotterranei/acqua)
- \+ 1 warp zone di 4-2

Ogni livello ha un ID su **7 bit**. I 5 bit di peso debole = numero nel sottogruppo, i 2 bit di peso forte = tipo di zona:

```asm
; Codifica a 7 bit del Level ID
; Bit 6-5: Tipo (00=Water, 01=Overworld, 10=Underground, 11=Castle)
; Bit 4-0: Numero nel sottogruppo
;
; Water IDs      : $00-$02  (tipi 00, numeri 0-2)
; Overworld IDs  : $20-$35  (tipi 01, numeri 0-21)
; Underground IDs: $40-$42  (tipi 10, numeri 0-2)
; Castle IDs     : $60-$65  (tipi 11, numeri 0-5)
;
; ID $25 = %0100101 → tipo 01 (Overworld), numero 5 → 1-1
; ID $23 = %0100011 → tipo 01 (Overworld), numero 3 → 6-2
```

**128 ID possibili** ($00-$7F), solo 34 assegnati a veri livelli. Gli ID inutilizzati puntano a qualsiasi cosa.

### Le tabelle di puntatori: due liste, due ordini

I puntatori tile e sprite non sono salvati nello stesso ordine. Il codice usa due liste 16-bit separate (high byte / low byte in due tabelle distinte):

```
Ordine dei puntatori sprite:
  Indice 0-5   : Castle (6 livelli)
  Indice 6-27  : Overworld (22 livelli)
  Indice 28-30 : Underground (3 livelli)
  Indice 31-33 : Water (3 livelli)

Ordine dei puntatori tile:
  Indice 0-2   : Water (3 livelli)
  Indice 3-24  : Overworld (22 livelli)
  Indice 25-27 : Underground (3 livelli)
  Indice 28-33 : Castle (6 livelli)
```

Perché ordini diversi? Nessuna ragione tecnica: è probabilmente così che i dati sono stati organizzati durante lo sviluppo. Ma crea una conseguenza affascinante: quando un ID di livello è invalido, i puntatori tile e sprite caricano livelli *diversi*, creando **Frankenstein level**.

Per navigare tra queste due liste, il gioco usa piccole **tabelle di offset** (come un indice):

```asm
; Tabelle di offset per tipo (Water, Overworld, Underground, Castle)
; Ogni voce = indice di inizio nella lista corrispondente

SpriteOffsetTable:
  .byte $1F, $06, $1C, $00    ; Water=31, Overworld=6, Underground=28, Castle=0

TileOffsetTable:
  .byte $00, $03, $19, $1C    ; Water=0, Overworld=3, Underground=25, Castle=28
```

Per caricare il livello 6-2 (ID $23, Overworld numero 3):

```asm
; 1. Tipo = 01 (Overworld) → indice in tabella offset = 1
; 2. Sprite offset = SpriteOffsetTable[1] = 6
;    Indice finale = 6 + 3 (numero di livello) = 9 → 10° puntatore sprite
; 3. Tile offset = TileOffsetTable[1] = 3
;    Indice finale = 3 + 3 = 6 → 7° puntatore tile
; 4. Risultato: puntatore tile $A619 + puntatore sprite $9ED0 = 6-2 ok
```

Ora, cosa succede con un ID invalido come $43 (Underground numero 3, che non esiste)?

```asm
; ID $43, Tipo = 10 (Underground), numero = 3
; Sprite offset = SpriteOffsetTable[2] = $1C = 28
;   Indice = 28 + 3 = 31 → 32° puntatore sprite = acqua bonus 5-2!
; Tile offset = TileOffsetTable[2] = $19 = 25
;   Indice = 25 + 3 = 28 → 29° puntatore tile = 1-4 (Castle)!
;
; Risultato: un livello sotterraneo con le tile di 1-4
; e i Blooper della zona acqua di 5-2. Un vero Frankenstein.
```

![Level ID $43 -- Frankenstein level : tiles 1-4 + sprites eau 5-2](/images/smb1-glitch-levels/lvl-43-frankenstein.png)

![Exploring Glitch Level Pointers -- les tables d'offset expliquées](/images/smb1-glitch-levels/yt-pointers.jpg)

![Le world index table -- quand l'overflow de world 9 crée un glitch level](/images/smb1-glitch-levels/v2-world-index-table.jpg)

### La world index table: perché world 9 va in overflow

C'è una tabella ROM di 8 byte che dà l'indice del primo livello di ogni mondo (1-8). E subito dopo, la tabella dei 36 Level ID di tutti i livelli in ordine di gioco.

```asm
; WorldIndexTable (8 byte)
  .byte 0, 5, 10, 15, 20, 25, 28, 33
;   -> Mondo 1 inizia al livello 0
;   -> Mondo 2 inizia al livello 5
;   -> Mondo 8 inizia al livello 33

; LevelIDTable (36 byte)
  .byte $25, $28, $29, $26, $24, ... ; i 36 Level ID
```

Quando proviamo a caricare world 9, il gioco legge il 9° byte di WorldIndexTable... che non esiste. Va in overflow di 1 byte in LevelIDTable, legge il valore $25, poi usa $25 come indice in LevelIDTable (37ª voce): che va di nuovo in overflow di 2 byte in SpriteOffsetTable, e legge il valore 6.

```asm
; World 9:
;   1. WorldIndexTable[8] (overflow) → legge $25 in LevelIDTable
;   2. LevelIDTable[37] (overflow) → legge il 2° byte di SpriteOffsetTable = 6
;   3. ID = 6 → Water level number 6 (che non esiste)
;   4. Tile pointer = puntatore water numero 6 = tile di 6-2
;   5. Sprite pointer = indice 31+6 = 37 > 33 → puntatore invalido
;   6. Risultato: 6-2 sott'acqua con sprite glitchati
;      → world 9-1!
```

Per world G (16), l'overflow va ancora più lontano e cade sul Level ID $01, che è il livello cutscene che precede 1-2:

```asm
; World G (16):
;   WorldIndexTable[15] → legge $01 in LevelIDTable
;   LevelIDTable[1] = $29 (cutscene 1-2)
;   → world G-1 = la cutscene di ingresso di 1-2
```

## Perché i glitch world esistono

Il gioco ha 32 livelli "legittimi" (8 mondi × 4 livelli). Ma la tabella di puntatori fa 128 voci per tipo di zona. Le voci oltre il livello 32 contengono ciò che si trova in ROM a quegli indirizzi: a volte un altro livello, a volte dati sonori, a volte RAM, a volte qualsiasi cosa.

![Level ID $01 Water (Minus World) -- tile pointer $AE45, sprite pointer $A171](/images/smb1-glitch-levels/minus-world.png)

### Level ID $01 + AreaType 0 = Minus World

Il più famoso dei glitch world. Il Level ID $01 in AreaType 0 (acqua) punta verso:

- **Tile pointer: $AE45** → la zona sottomarina di 2-2/7-2
- **Sprite pointer: $A171** → gli sprite di 2-2/7-2

Il risultato: un livello di acqua che assomiglia a 2-2, ma che va in loop all'infinito perché il flagpole non esiste. Il livello gira in loop per sempre.

È il livello 36-1 (o 36-1 nel mondo $-1).

![Le warm start check de SMB1 -- c'est lui qui permet au Minus World d'exister](/images/smb1-glitch-levels/v4-minus-world.jpg)

```asm
; Perché manca il flagpole nel Minus World:
; Gli sprite di 2-2/7-2 ($A171) non hanno flagpole
; nella loro sequenza. Il gioco cerca lo sprite $FD (flagpole)
; ma non lo trova mai → loop infinito
;
; Il gioco continua a generare il livello all'infinito
; finché il timer arriva a zero.
```

### I puntatori che puntano verso la RAM

Quando il tile pointer o lo sprite pointer punta verso un indirizzo in RAM ($00-$7F) invece che in ROM, il gioco prova a interpretare i cambiamenti costanti della RAM come tile:

```asm
; Esempio: Level ID $03 in Water
; Tile Pointer: $A46B (3-3 - valido)
; Sprite Pointer: $009D (punta verso la RAM pagina zero!)
;
; La RAM pagina zero contiene i registri del gioco,
; la posizione di Mario, lo stato dei contatori...
; Il gioco decomprime questo come una sequenza di sprite,
; e il risultato è un livello con nemici
; che sono in realtà valori di registri.
```

Quando la pagina zero cambia (perché Mario si muove, il timer gira, ecc.), gli "sprite" del livello cambiano anche. Ecco perché certi glitch world hanno nemici che lampeggiano e si trasformano di continuo.

![Level ID $03 Water -- sprite pointer $009D pointe vers la RAM, niveau injouable](/images/smb1-glitch-levels/level-03-water.png)

### Level ID $36: il livello vuoto (Overworld)

Level ID $36 in Overworld:

- **Tile pointer: $AC35** (1-2)
- **Sprite pointer: $A0D8** (1-2)

Risultato: niente. Il gioco carica il livello ma è segnato "senza livello" nel catalogo di RGMechEx. Le tile sono forse valide ma gli sprite puntano verso un posto che produce un livello vuoto o non funzionante.

### Level ID $1D (Castle): il campione dei crash

Level ID $1D in Castle:

- **Tile pointer: $A210** (4-4)
- **Sprite pointer: $7EA0** (RAM!)

Sprite pointer in RAM = sprite indefiniti. Il gioco prova a mostrare una palla Spiny o un cannone Bullet Bill nella prima riga di tile. Crash subito.

```asm
; Quando lo sprite pointer punta verso la RAM,
; il gioco decomprime byte che cambiano sempre
; come istruzioni "spawn". Il risultato:
; - Apparizione di oggetti inesistenti (valore undefined)
; - Crash PPU quando lo sprite NES prova a mostrare una tile invalida
; - Freeze completo della console
```

## I 256 glitch world catalogati

RGMechEx ha scritto uno script che genera le mappe di **tutti i livelli**, per i 4 tipi di zona, e i 128 ID ciascuno.

Il contatore di mondo è su 8 bit (0-255). I mondi 1-8 sono legittimi. Restano **248 glitch world** potenziali. Ogni glitch world corrisponde al primo livello di questo mondo, e il suo Level ID è calcolato col meccanismo di overflow della WorldIndexTable.

![Table des glitch worlds -- 248 mondes corrompus, 68 premiers niveaux accessibles](/images/smb1-glitch-levels/v3-glitch-worlds-table.jpg)

Sui 128 ID possibili, solo **68 sono "first level" di un mondo** (accessibili via il glitch world number). Gli altri 60 sono livelli 2+ o inaccessibili.

| Tipo | ID unici giocabili | ID che crashano | ID vuoti |
|------|---------------------|-------------------|-----------|
| Water (0)    | circa 20  | circa 60  | circa 48  |
| Overworld (1)| circa 30  | circa 55  | circa 43  |
| Underground (2) | circa 15 | circa 65 | circa 48  |
| Castle (3)   | circa 25  | circa 58  | circa 45  |

Molti ID portano allo stesso livello per via dei puntatori che cadono sugli stessi indirizzi ROM. Il Level ID $28 (Overworld) per esempio: tile pointer $A7CD (2-1): appare in **38 glitch world diversi**, perché il suo sprite pointer $9F51 punta verso una zona della ROM usata come padding/dati sonori riusata da un sacco di ID.

![Carte du niveau ID $28 (Overworld) -- 2-1 tiles avec des sprites normaux, 38 glitch worlds](/images/smb1-glitch-levels/level-28-overworld.png)

![Super Mario Bros. Glitch Levels Explained -- la 3ème vidéo](/images/smb1-glitch-levels/yt-levels.jpg)

### I 6 glitch level davvero unici

Tra i 19 ID di glitch level accessibili, solo **6 non crashano subito** al caricamento:

| World | Level ID | Descrizione |
|-------|----------|-------------|
| E-1 (224) | $50 | Un solo blocco ? sopra un baratro. Mario muore istantaneamente. |
| W | $57 | Mario spawna bloccato, incapace di muoversi. |
| 42 (133) | $50 | Tunnel di nuvole che intrappola Mario se va abbastanza lontano. |
| 62 (131, 240) | $4D | Castello gelato: Mario spawna in alto, non può cadere → bloccato. |
| 127 | $4B | Tunnel sotterraneo, ma crasha se si va troppo lontano. |
| 137 | $4B | Attiva lo scorrimento automatico delle cutscene. Mario incontra un unico brick block che lo blocca per sempre. |

![Level ID $50 (cloud tunnel) -- le glitch world 42-1 et E-1](/images/smb1-glitch-levels/lvl-50-cloud.png)
![Level ID $4D (castle) -- world 62-1, Mario bloqué au spawn](/images/smb1-glitch-levels/lvl-4D-castle.png)
![Level ID $4B (tunnel) -- world 127-1, crashe si on va trop loin](/images/smb1-glitch-levels/lvl-4B-tunnel.png)

Sei glitch world su 248 che producono qualcosa di davvero nuovo. Il resto, sono livelli normali col tipo di zona sbagliato, o schermi neri.

## Il formato dei livelli in dettaglio

Focus sul formato esatto dei dati di livello, per capire perché i glitch level stanno in piedi (o no).

### L'header livello: 2 byte, 6 proprietà

Ogni livello inizia con un header di 2 byte che controlla 6 proprietà:

```asm
; Byte 0: timer + Y start + modifier
;   Bit 7-6: timer (00=invariato, 01=200, 10=300, 11=400)
;   Bit 5-3: Y start Mario (111/110 = autowalk)
;   Bit 2-0: level type modifier
;              000=default, 001=waves, 010=brick wall,
;              011=water bottom, 100=night, 101=snow,
;              110=snow night, 111=gray night

; Byte 1: platform + background + floor pattern
;   Bit 7-6: special platform (00=tree, 01=mushroom,
;                                 10=Bullet Bill, 11=cloud)
;   Bit 5-4: background (00=none, 01=clouds,
;                           10=montains, 11=fences)
;   Bit 3-0: floor pattern iniziale (0-15)
```

Il type modifier controlla variazioni visive: le onde in alto nei livelli di acqua, lo sfondo mattone di 8-3, la palette notte di 4-3, la neve di 6-2, ecc.

### Gli oggetti tile: 2 byte, Next Screen Flag, coda 3 slot

Dopo l'header viene una lista di **oggetti tile**, ogni oggetto fa 2 byte. Il byte $FD segna la fine della lista.

```asm
; Formato oggetto tile (16 bit):
; Byte 0:
;   Bit 7-4: posizione X (colonna 0-15)
;   Bit 3-0: posizione Y
;     Y=0-11  : posizione Y normale
;     Y=12    : oggetti speciali (buchi, ponti, rope, blocchi ?)
;     Y=13    : screen skip / oggetti speciali 2
;     Y=14    : cambio di modifier/scenery/floor
;     Y=15    : oggetti speciali 3 (castello, scale, grosso tubo)

; Byte 1:
;   Bit  7   : NEXT SCREEN FLAG
;   Bit 6-4 : tipo di oggetto (0-7)
;   Bit 3-0 : larghezza/altezza / sottotipo
```

Quando il bit "next screen" è messo, la colonna di lavoro corrente è incrementata di 1. Permette di piazzare oggetti oltre le prime 16 colonne. Gli oggetti devono essere elencati **in ordine** (sinistra a destra) perché il gioco li carica in sequenza:

```asm
; La routine di caricamento ha DUE fasi per colonna:
; Fase 1: cerca i nuovi oggetti che iniziano su questa colonna
;            e li aggiunge alla coda (queue)
; Fase 2: elabora ogni oggetto nella coda disegnando le tile,
;            e rimuove quelli che finiscono su questa colonna
```

La coda fa esattamente **3 slot**. Conseguenza diretta: non possiamo avere più di 3 oggetti che iniziano sulla stessa colonna. Se la coda è piena, il 4° oggetto è ignorato e non sarà mai caricato.

Ecco perché i livelli ben progettati evitano di impilare troppi oggetti. Esempio in 1-2: la colonna col blocco 1up nel soffitto + i mattoni accanto sono divisi in due oggetti distinti per rispettare il limite di 3.

### Posizione Y speciale: 12, 13, 14, 15

Quando Y=12, l'oggetto non ha posizione Y (è hardcodata per tipo):

```asm
; Y=12: oggetti senza posizione Y
;   Tipo 0: buco (rimuove il suolo)
;   Tipo 1: rope di piattaforma mobile
;   Tipi 2-4: ponti a Y fissa
;   Tipo 5: buco con acqua/lava
;   Tipi 6-7: file di blocchi ?
```

Quando Y=13, due sottogruppi. Se il bit 6 del byte 1 è a 1:

```asm
; Y=13, bit6=1: oggetti speciali
;   0 = L-pipe (cutscene), 1 = flagpole, 2-3 = ponte/ascia/hamer (fine castello)
;   4 = stop screen, 5 = random enemies, 6 = loop level, 7+ = possibile crash
```

Se bit6=0, i 5 bit di peso debole codificano uno **screen skip** (saltare direttamente a uno schermo N, senza passare dal next screen flag uno a uno).

Quando Y=14: stesso principio con bit6=1 per cambiare il type modifier, bit6=0 per cambiare sfondo + floor pattern.

### I floor pattern: 16 motivi di suolo

Il suolo dei livelli non è fatto di oggetti individuali. SMB1 usa **floor pattern**, un motivo di sfondo che si applica a tutte le colonne fino al prossimo cambiamento:

```asm
; Floor pattern (4 bit = 16 possibilità)
;   0 = vuoto totale
;   1 = suolo 2 tile alto
;   2 = suolo 1 tile alto
;   3 = suolo + bottom
;   4 = suolo + bottom 2
;   5 = suolo 1/2 tile
;   6 = 3/4 suolo
;   ... fino a 15 = riempito totale (suolo + soffitto)
```

Ecco perché i buchi sono oggetti: fanno override del floor pattern su una colonna specifica, senza dover cambiare il pattern per tutto il resto.

### Il limite dei 256 byte e il repeat

Tutti i dati tile di un livello stanno in **256 byte massimo**. Il registro Y del 6502 è usato come indice, e fa 8 bit. Se il gioco arriva alla fine dei dati senza trovare il byte $FD, **ricomincia dall'inizio** e ripete i 256 byte all'infinito:

```asm
; Indice Y = 8 bit → max 256 byte di dati tile
; Se Y va in overflow (255 → 0) senza incontrare $FD → repeat
; Stesso per gli sprite, ma gli oggetti pipe (3 byte)
; spostano la parità dell'indice a ogni caricamento.
```

Certi glitch level sfruttano questo repeat per generare livelli che durano "all'infinito".

### Il sistema di sprite: 2 byte + transizioni pipe

Gli sprite seguono un formato simile, ma senza header e con qualche differenza chiave. Il byte $FF segna la fine della lista.

```asm
; Formato sprite (2 byte):
; Byte 0: posizione X (colonna)
; Byte 1:
;   Bit 7: NEXT SCREEN FLAG
;   Bit 6-0: tipo di sprite
;       Alcuni tipi includono: goomba, koopa, Blooper,
;       Bullet Bill, Lakitu, Spiny, piattaforme,
;       comando warp zone, toad/principessa,
;       comandi di spawn di gruppi di nemici
```

Il bit di peso debole del byte 1 è l'**hard level flag**: se messo a 1, lo sprite appare solo nei livelli ≥ 5-3. È così che i livelli "hard mode" sono creati.

Posizione Y 15 = **screen skip** (identico alle tile). Posizione Y 14 = **transizione pipe** (3 byte):

```asm
; Sprite Y=14: transizione pipe/vine (3 byte!)
;   Byte 0: posizione X
;   Byte 1: bit 6-0 = Level ID 7-bit (destinazione)
;   Byte 2: bit 4-0 = screen di destinazione
;            bit 7-5 = world dove questa transizione è valida
;
; Perché un world? Le bonus room sono riusate tra mondi.
; Esempio: la stanza bonus di 1-1 è usata anche da 2-1 e 7-1.
; Questa stanza ha 3 transizioni, una per mondo, perché Mario
; riappaia al posto giusto.
```

Gli sprite **non hanno sistema di coda**. L'unico limite è che non ci possono essere più di 4 sprite caricati insieme nella zona di spawn (appena fuori schermo a destra). Oltre, gli sprite sono ignorati.

## Come accedere ai glitch world

Ci sono due metodi principali.

### Il metodo classico: il wall clip

Il wall clip (passaggio attraverso i muri) permette di uscire dal livello normale e camminare fino alla warzone nascosta. Manipolando il contatore di mondo via la RAM, possiamo caricare qualsiasi Level ID.

La tecnica:
1. World 1-2: andare nel tubo di fine nascosto
2. Fare il wall clip sul muro di destra
3. Camminare nel vuoto fino alla zona warp
4. Il gioco interpreta i valori come mondi

Ma questo metodo dà accesso solo a una piccola parte dei glitch world.

### Il metodo estremo: NES Tennis cart swap

Vedi la sezione "Il warm start" più sopra per il dettaglio completo. In riassunto: il contatore di passi di Tennis scrive sullo stesso byte RAM del mondo di partenza di SMB1, e il rilevamento warm start preserva questo valore.

### L'angolo degli smanettoni: il codice per esplorare tutto

Se vuoi esplorare tutti i glitch da solo in un emulatore, puoi patchare il Level ID direttamente:

```asm
; Patch per FCEUX / Mesen:
; Indirizzo RAM $075F = Level ID attuale
; Indirizzo RAM $0760 = Area Type (0=Water, 1=Overworld, 2=Underground, 3=Castle)

; Esempio: caricare il Level 57 (0x39) in Overworld
; Nell'emulatore, apri il tracciatore memoria e scrivi:
; $075F = 0x39
; $0760 = 0x01
; Poi entra in un tubo di warp o muori e ricomincia
; → Il gioco carica il livello ID $39 in Overworld
```

RGMechEx ha pubblicato la lista completa dei 128 livelli × 4 tipi con mappe generate automaticamente su [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html). Ogni voce mostra il tile pointer, lo sprite pointer, e una mappa visiva del livello.

## I livelli più assurdi

### Level ID $1F (Water): 15 glitch world in uno

Il tile pointer $A302 (3-4) combinato allo sprite pointer $02A0 dà 15 glitch world diversi (D-1, J-1, Y-1, Z-1, 55-1, 73-1...). Spiegazione: lo sprite pointer punta verso una zona della ROM che contiene dati abbastanza vicini a sprite validi da produrre risultati giocabili, ma la combinazione delle tile di castello 3-4 con sprite di overworld crea un rendering assurdo.

### Level ID $28 (Overworld): 38 glitch world = record

Il record assoluto. 38 voci di glitch world puntano verso lo stesso livello (tile 2-1 + sprite $9F51). Perché? Perché lo sprite pointer $9F51 cade in una zona della ROM usata come padding/dati sonori riusata da un sacco di ID.

### Level ID $49 (Underground): il livello FDS

Tile pointer $76AE + sprite pointer $1C9D. Il tile pointer punta verso la zona della ROM riservata alla versione Famicom Disk System. Risultato: un livello con tile che non esistono nella cartuccia standard. È il livello che fa apparire il livello 52-1 e 196-1.

### Level ID $00-$02: i veri livelli bonus

Questi ID sono usati da sotto-livelli legittimi del gioco:

- **$00**: zona sottomarina di 5-2/6-2 (usata da H-1, 39-1)
- **$01**: l'acqua di 2-2/7-2 (il Minus World, 36-1)
- **$02**: sotto-livello di 8-4 (136-1, 151-1, 215-1)

La differenza tra un livello "bonus" accessibile normalmente e un glitch world, è che le warp zone verificano il mondo attuale:

```asm
; Verifica warp zone (semplificato)
; Il gioco verifica che il mondo target sia tra 1 e 8
CheckWarp:
  lda TARGET_WORLD
  cmp #1
  bcc InvalidWarp       ; < 1 → rifiutato
  cmp #9
  bcs InvalidWarp       ; > 8 → rifiutato
  ; world valido solo tra 1 e 8
  jmp DoWarp
```

I glitch world con numeri > 8 o 0 non possono essere raggiunti con tubi normali. Serve il wall clip o il cart swap.

## Perché certi livelli crashano: le jump table

Quando il gioco carica un oggetto tile, usa il suo tipo come indice in una **jump table**:

```asm
; Jump table degli oggetti tile standard (tipi 0-11)
JumpTable_TileObjects:
  .word Obj_Special       ; tipo 0: blocco ?, hidden, flagpole...
  .word Obj_Platform      ; tipo 1: piattaforma speciale
  .word Obj_BrickRow      ; tipo 2: fila di mattoni
  .word Obj_BlockRow      ; tipo 3: fila di blocchi
  .word Obj_CoinRow       ; tipo 4: fila di monete
  .word Obj_BrickCol      ; tipo 5: colonna di mattoni
  .word Obj_BlockCol      ; tipo 6: colonna di blocchi
  .word Obj_Pipe          ; tipo 7: tubo
  .word Obj_8             ; tipo 8
  .word Obj_9             ; tipo 9
  .word Obj_10            ; tipo 10
  .word Obj_11            ; tipo 11
```

![Les jump tables : pourquoi un type d'objet invalide fait crasher le jeu](/images/smb1-glitch-levels/v4-jump-table.jpg)

Se un oggetto ha un tipo invalido (≥12), il gioco salta a un puntatore che non esiste in questa tabella. **4 esiti possibili**:

1. **Puntatore valido** → l'oggetto si carica normalmente
2. **Puntatore verso un'altra jump table** (sovrapposizione) → appare un oggetto diverso. Esempio: tipo 12 punta verso la tabella Y=13, il che dà un L-pipe.
3. **Puntatore verso eseguibile** → esecuzione di codice casuale (probabile crash)
4. **Placeholder esplicito (NOP)** → l'oggetto non fa niente (certi sprite sono così, producendo nemici che volano sul posto senza muoversi)

![Glitch level ID $58 : le sprite pointer pointe vers une adresse invalide, le jeu crashe](/images/smb1-glitch-levels/v4-glitch-58-crash.jpg)

![Glitch level ID $50 : le cloud tunnel, un niveau généré par des données corrompues](/images/smb1-glitch-levels/v4-glitch-50.jpg)

Il glitch level ID $58 (il tunnel che crasha): il suo sprite pointer punta verso una regione memoria che **non esiste su NES senza mapper ROM**. Il gioco prova a caricare lo stesso Koopa 5 volte per frame alla posizione (0,0), il che satura la PPU e provoca un freeze.

```asm
; Perché ID $58 crasha:
; Sprite pointer → indirizzo invalido (fuori spazio NES standard)
; → Il gioco legge byte indeterminati come tipi di sprite
; → Il Koopa $00 (tipo invalido senza handler) va in loop in chiamata ricorsiva
; → Stack overflow 6502 → freeze
```

### Il paradosso pipe warp

Ricorda il check `target_world BETWEEN 1 AND 8`. Anche se trovi un tubo in un glitch world, il gioco verifica che il mondo di destinazione sia tra 1 e 8. I glitch world hanno numeri > 8 (36-1, 255-1...), quindi la warp fallisce.

È anche per questo che il Minus World non ha fine: il flagpole non è presente negli sprite, e i tubi non portano da nessuna parte.

### Il trick dei 5 oggetti in una colonna

Esiste un edge case che permette di superare il limite di 3 oggetti per colonna. Quando la coda si blocca (slot pieni + oggetto seguente con next screen flag mancante), il gioco "pre-elabora" la colonna corrente in loop finché trova un oggetto con next screen flag. Durante ogni pre-elaborazione:

```asm
; Durante la pre-elaborazione di colonna:
; 1. Gli oggetti nella coda vedono la loro larghezza restante
;    decrementata a ogni "falsa avanzata" di colonna
; 2. Se un oggetto arriva a larghezza=0, esce dalla coda
; 3. Uno slot liberato può essere riempito da un nuovo oggetto
;    aggiunto nella stessa colonna

; Risultato: fino a 5 oggetti possono essere elaborati sulla stessa colonna.
; Tecnica: piazzare 2 oggetti che attraversano lo screen boundary
; (slot 1 e 2), 1 oggetto dummy in X < precedente (blocca la coda),
; poi 3 oggetti a X=0 dello schermo seguente (di cui uno con next screen flag).
```

È ciò che chiamiamo un "queue skip" ed è usato da certi romhacker per creare livelli più densi di ciò che il formato permette normalmente.

## Le differenze tra versioni

### Famicom Disk System

La versione FDS di SMB1 ha una **memory map diversa**. Tutti i puntatori di livello sono spostati, ma i dati sono gli stessi. Ciò che cambia: gli indici dei glitch world sono completamente diversi:

```
FDS World 36 → Level ID $09 (versione acqua di 5-3)
  → Il flagpole è presente! Si può finire il livello.
  → Poi: $27 (7-3 normale) → $44 (4-4 underground)
  → $44 è finibile → l'ascia funziona → fine del gioco!

Il Minus World FDS è quindi un "bonus world" che può portare
al completamento del gioco, al contrario della versione NES.
```

Il mio livello FDS preferito: **ID $5F**, una versione sotterranea della seconda metà di 3-3 in tunnel basso (peccato sia un autoscroller).

### The Lost Levels (Super Mario Bros. 2 giapponese)

Lost Levels cambia molte cose:

1. **Ordine identico tile/sprite**: niente più Frankenstein level (tile e sprite caricano lo stesso livello anche con un ID invalido)
2. **Una sola tabella di puntatori 16-bit** invece di due tabelle separate high/low
3. **4 file disco**: la ROM è stata divisa per l'FDS:
   - File 1: world 1-4
   - File 2: world 5-8
   - File 3: world 9 + sound engine
   - File 4: world A-D (tabella di puntatori completamente diversa)
4. **Stesso Level ID = 4 livelli possibili** secondo il file caricato
5. **Niente più glitch Tennis**: l'opzione continue (continue allo stesso mondo dopo game over) rende il warm start inutile, e il gioco **fa reset subito** se world > 9
6. **Nuovi oggetti**: fungo veleno, blocco invisibile, blocco invisibile fire flower, tubi rovesciati, vento: ma inseriti in mezzo alle liste esistenti → **incompatibilità backward** con SMB1
7. **Piranha Plant sempre rosse** dopo world 4, **springboard verdi** solo in world 2/B/3/C/7

### Super Mario All-Stars (SNES)

Port diretto con le stesse routine 6502 (il SNES esegue il codice NES in modalità compatibile):

- **Warp zone fissata**: niente più Minus World (entrare nel tubo sinistro prima del testo porta al mondo giusto)
- **Crash**: quasi tutti i glitch level crashano (tranne ID $6A e 9-1)
- **Oggetti castello aggiunti**: resi più unici
- **Ma**: il **4-2 wrong warp** funziona ancora (non patchato!)

### Il 4-2 wrong warp: un bug di piazzamento oggetto

In 4-2, ci sono due oggetti di transizione pipe: la vite (warp zone) e il tubo (stanza monete). Il primo oggetto di transizione (quello della vite) è piazzato **ben prima** che la vite appaia sullo schermo. Il secondo (il tubo) è piazzato **troppo tardi nel livello**.

```asm
; Timing delle transizioni in 4-2:
; Oggetto transizione 1 (vite → warp zone): piazzato 3 schermi prima della vite
; Oggetto transizione 2 (tubo → stanza monete): piazzato 1 schermo dopo il tubo
;
; Normalmente il primo oggetto è disattivato prima che Mario
; raggiunga il tubo. Ma se Mario va veloce (o usa
; la scorciatoia del blocco B+right), la transizione della vite
; è ancora attiva quando tocca il tubo!
; → Il gioco carica la warp zone invece della stanza monete.
;
; Se l'oggetto fosse stato piazzato subito dopo la vite ma prima
; del tubo, il bug non esisterebbe.
```

### I livelli a loop

Come funzionano i loop (8-4, 7-4)? Il livello ha **checkpoint** con numeri di schermo e posizioni Y hardcodate:

```asm
; Checkpoint: {numero_schermo, posizione_verticale}
; Se Mario passa questo checkpoint alla giusta altezza → il livello continua
; Altrimenti → warp back di 4 schermi (64 blocchi)
;
; Per fare un loop infinito: posizione_verticale = $F0
; (sotto il fondo dello schermo) → impossibile da validare.
;
; I checkpoint sono semplici (un solo flag) tranne per world 7
; che usa triplette (3 flag, bisogna fallirne almeno 1)
;
; Il warp back è rude: offset dei dati tile regolato a un valore
; hardcodato, offset dei dati sprite rimesso a 0. I nemici presenti
; sono scaricati istantaneamente → le firebar spariscono.
```

## Cambiare il formato, non il codice

Una delle lezioni più affascinanti di questa architettura, è che gli sviluppatori di SMB1 sono riusciti a creare un sistema di livelli molto espressivo senza mai toccare il codice di rendering 6502. Tutta la variazione tra i livelli viene dai **dati** (puntatori, oggetti, sprite, floor pattern), non dal codice.

I 256 glitch world esistono perché le **tabelle di puntatori sono dimensionate per 128 voci × 4 tipi**, e il gioco non valida mai i valori che legge. Quando un puntatore cade in RAM, il gioco interpreta i registri di Mario come tile. Quando un puntatore cade nei dati sonori, il gioco suona musica sotto forma di level design. E quando le jump table vanno in overflow, il gioco esegue qualsiasi cosa fino al crash.

![More Super Mario Bros. Mechanics Explained -- la 4ème vidéo](/images/smb1-glitch-levels/yt-mechanics.jpg)

## Cosa possiamo imparare da tutto questo

1. **Separazione tile/sprite**: indipendenza totale dei due strati, con ordini di storage diversi che creano Frankenstein level unici
2. **Compressione RLE + sistema di oggetti**: i livelli non sono bitmap ma liste di oggetti piazzati, con floor pattern per il suolo
3. **Coda 3 slot**: limite stretto dell'hardware (e del design di livelli)
4. **Fiducia totale ai puntatori**: il gioco si fida di puntatori e jump table, il che produce o glitch giocabili, o crash
5. **256 byte max**: il limite del registro Y 6502, che fa sì che i dati si ripetano se si va troppo oltre
6. **Warm start / cold start**: un sistema di "continua" che ha aperto la porta al cart swap Tennis → Mario

Il più bello: tutto questo, è codice 6502 che sta in 40KB. Il codice dialoga direttamente con l'hardware e accorda una fiducia totale a ogni accesso memoria. Se il puntatore è marcio, il gioco crasha. E i crash, li chiamiamo glitch world.

## Le 3 cose da trattenere

1. **I glitch world sono puntatori caduti male**: il gioco ha 128 ID × 4 tipi di zona, ma solo 34 livelli unici. Quando il world number è corrotto (da Tennis o wall clip), il gioco carica un puntatore pensato per un altro livello, e le 512 combinazioni possibili producono risultati imprevedibili.

2. **Il Minus World è un bug di warp combinato a corruzione**: il tubo sinistro in 1-2, se attivato prima che il testo appaia, carica world 36 (0x24). Questo world punta verso Level ID $01 (acqua di 2-2), un livello senza flagpole. E dato che non c'è transizione pipe per world 36, il livello va in loop all'infinito. L'assenza di verifica crea l'icona.

3. **Tennis → Mario, 15 anni prima di OoT → Paper Mario**: la RAM del NES sopravvive a uno swap di cartuccia grazie ai condensatori e al sistema di warm start / cold start di SMB1. Il contatore di passi di Tennis (che incrementa un byte RAM suonando il suono dei passi) cade esattamente sull'indirizzo del world number. Serve che le cifre del top score restino a 0, che il byte $A5 sia intatto, e che il gioco rilevi un warm start: un concorso di circostanze perfetto funzionato solo con Tennis.

I video originali di [Retro Game Mechanics Explained](https://www.youtube.com/c/RetroGameMechanicsExplained) sono un lavoro da formiche pazzesco: il livello di dettaglio sulla disassemblata 6502, le mappe automatiche di tutti i livelli, le spiegazioni del cart swap e del warm start. Se non hai visto la serie, guardala, è corta e ogni minuto è denso.

Il codice sorgente delle mappe è disponibile su [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html), e la disassemblata completa di SMB1 è open source su un sacco di repo. 40 anni fa, programmatori giapponesi hanno scritto questo sistema di livelli in 6502 con zero test unitari e zero bug tracker, e continuiamo a imparare tecniche di ottimizzazione aprendo il loro codice oggi.
