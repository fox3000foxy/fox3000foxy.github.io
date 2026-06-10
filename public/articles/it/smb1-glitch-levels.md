---
title: "Super Mario Bros.: il formato dei livelli, i puntatori e i 256 glitch worlds"
description: "Come 128 livelli × 4 tipi di zona stanno in 40KB di ROM, perché esiste il Minus World, e come una partita di Tennis NES può caricare dei glitch worlds."
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

## Introduzione

Super Mario Bros. sono 40 kilobyte di ROM. Otto mondi, 32 livelli, nemici, musica, power-up, tutto ci sta dentro.

Ma se apri un emulatore e modifichi i byte giusti, puoi caricare il livello 36-1. Oppure il 255-1. O atterrare in un mondo dove tutto è fatto di sprite di Bowser e tubi che non portano da nessuna parte.

Questi glitch worlds esistono per una ragione semplice: il sistema di archiviazione dei livelli di SMB1 è una meraviglia di ottimizzazione a 8 bit, e quando si costringe il gioco a leggere dove non dovrebbe, i risultati sono affascinanti.

Retro Game Mechanics Explained ha fatto una serie di 4 video a riguardo -- li compileremo in un'unica immersione nel codice 6502 del gioco più venduto della sua epoca.

![GLITCH OBJECTS -- il titolo della serie RGMechEx sulle meccaniche nascoste di SMB1](/images/smb1-glitch-levels/title-card.jpg)

![World 9-1 -- la schermata titolo del primo glitch world accessibile tramite il cart swap Tennis](/images/smb1-glitch-levels/v1-title-9-1.jpg)

## Il warm start: perché la RAM di Tennis sopravvive in SMB1

Prima di parlare di archiviazione dei livelli, bisogna capire come SMB1 si avvia. Perché il glitch del cart swap NES Tennis si basa interamente sul **sistema di rilevamento warm start / cold start** del gioco.

### I 41 byte preservati

Quando SMB1 rileva un **cold start** (prima accensione o power off/on), cancella tutta la RAM. Ma quando rileva un **warm start** (reset pulsante, senza interruzione dell'alimentazione), preserva un'area di memoria di **41 byte**:

```asm
; I 41 byte preservati in RAM durante un warm start
; Indirizzi $075F-$0787
;
; $075F : byte di avvio (world - 1)    [1 byte]
; $0760 : flag selezione mondo (B button) [1 byte]
; $0761-$0762 : inutilizzato              [2 byte]
; $0763-$0768 : timer (6 cifre, 3 mostrate) [6 byte]
; $0769-$076E : monete Luigi               [6 byte]
; $076F-$0774 : monete Mario               [6 byte]
; $0775-$077A : punteggio Luigi            [6 byte]
; $077B-$0780 : punteggio Mario            [6 byte]
; $0781-$0786 : high score (6 cifre, 1 nascosta) [6 byte]
; $0787 : il byte magico $A5              [1 byte]
```

Questi 41 byte servono a una sola funzionalità: permettere al giocatore di **continuare nello stesso mondo dopo un game over**. Se muori in 6-3, il gioco scrive il mondo 6 nel byte di avvio, e nella schermata titolo, se tieni premuto A + Start, ricominci in 6-1.

![I 41 byte preservati in RAM durante un warm start -- TOP SCORE, MARIO SCORE, TIMER, WORLD SELECT, CONTINUE WORLD, e il byte magico $A5](/images/smb1-glitch-levels/v1-memory-state.jpg)

### La doppia verifica del warm start

![Cold start vs warm start -- il diagramma di rilevamento del reset](/images/smb1-glitch-levels/v1-warm-start.jpg)

Quando SMB1 si avvia, non verifica un solo criterio ma **due**:

```asm
CheckWarmStart:
  ; 1. Verificare il byte magico $A5 a $0787
  lda $0787
  cmp #$A5
  bne ColdStart        ; non è $A5 → cold start

  ; 2. Verificare le 6 cifre dell'high score ($0781-$0786)
  ;    Ogni cifra deve essere tra 0 e 9
  ldx #0
CheckLoop:
  lda $0781,x
  cmp #$0A
  bcs ColdStart        ; cifra >= 10 → cold start
  inx
  cpx #6
  bne CheckLoop

  ; Se entrambe le condizioni passano → warm start
  ; La RAM non viene cancellata, il mondo di partenza è preservato
  jmp WarmStartBoot
```

![La verifica del byte $A5 e delle cifre dell'high score -- il cuore del warm start](/images/smb1-glitch-levels/v1-a5-byte.jpg)

Perché una doppia verifica? Perché il byte $A5 potrebbe essere presente per caso (un altro gioco che lascia questo valore, o lo stato di default del chip RAM). Verificando che le cifre dell'high score siano valide (0-9), ci si assicura che i dati siano coerenti.

### Perché Tennis è l'unico gioco che funziona

Quando si inserisce SMB1 per la prima volta (cold start), il gioco:
1. Cancella tutta la RAM → high score = 0, world byte = 0
2. Scrive $A5 all'indirizzo $0787

Poi si passa a Tennis senza spegnere la console. Tennis:
- **Non pulisce la RAM all'avvio** (pochi giochi NES lo fanno)
- **Non scrive sui byte dell'high score** → rimangono a 0 (validi)
- **Non tocca il byte $A5** → rimane presente
- **Usa l'indirizzo $075F** per il contatore dei passi del giocatore

```asm
; Il footstep increment in Tennis:
; A ogni passo del giocatore sul campo, Tennis incrementa il byte a $075F.
; Questo stesso byte è usato da SMB1 come "world number - 1".
;
; 0 passi  → world 0 → SMB1 = world 1
; 1-7 passi → world 1-7 → mondi normali
; 8+ passi → world 8+ → glitch worlds !
;
; Il contore si incrementa solo quando la musica si ferma
; (i suoni dei passi non suonano durante la musica).
```

Quando si rimette SMB1:
1. Il byte $A5 è ancora lì (Tennis non lo ha toccato)
2. Le cifre dell'high score sono ancora 0 (valide)
3. Il world byte vale ora 8+ (incrementato dai passi di Tennis)
4. SMB1 rileva un warm start → preserva il world byte corrotto
5. Mantenere A + Start → world 9-1, world A-1, world 36-1, ecc.

### Perché bisogna avviare Mario prima di Tennis

Una sfumatura: bisogna prima avviare SMB1, poi Tennis, poi di nuovo SMB1. Se iniziassi direttamente con Tennis, il byte $A5 non sarebbe mai scritto (Tennis non scrive $A5), quindi il rilevamento warm start fallirebbe e la RAM sarebbe cancellata.

![Il contatore dei passi di Tennis: ogni footstep incrementa il world byte](/images/smb1-glitch-levels/v1-footstep.jpg)

![Access Glitch Worlds via NES Tennis -- il video che spiega il cart swap](/images/smb1-glitch-levels/yt-tennis.jpg)

## Come SMB1 archivia i suoi livelli in 40KB

Nintendo R&D4 ha dovuto risolvere un problema semplice in apparenza: rappresentare livelli che scrollano orizzontalmente con tile, nemici, oggetti, il tutto in un budget ROM ultra-stretto.

La soluzione è una separazione in due livelli di dati **completamente indipendenti**:

### Il tile layout (la mappa del livello)

Ogni livello è definito da un puntatore verso una struttura di tile compressa in ROM. La compressione è rudimentale ma geniale: un byte "controllo" seguito da 1-3 byte di dati.

Il formato tile utilizza un sistema di **run** (simile all'RLE):

```asm
; Formato tile SMB1 (semplificato)
; Ogni "comando" è un byte controllo:
;
; $00-$7F : posiziona una tile, avanza di 1 colonna
; $80-$BF : posiziona una tile ripetuta N volte (N = byte - $80 + 1)
; $C0-$FF : comando speciale (fine riga, salto, cambio palette)

Esempio: per disegnare 3 mattoni consecutivi:
  $82 $01    ; ripete la tile $01 (brick) 3 volte
```

Ogni livello contiene 13 righe di 16 colonne di tile (13×16 = 208 tile visibili). Ma il formato compressato permette di scendere molto più in basso -- per esempio, il cielo e le colonne vuote non occupano quasi spazio.

Il loop di rendering in 6502:

```asm
; Decompressione tile - loop principale
; Ingresso: puntatore tile_data in $XX
; Uscita: tilemap livello nella RAM PPU

DecompressTile:
  lda (tile_ptr),y      ; leggi byte controllo
  iny
  cmp #$80
  bcc SingleTile        ; $00-$7F: tile singola
  cmp #$C0
  bcc RunLength         ; $80-$BF: run-length
  jmp SpecialCommand    ; $C0-$FF: comando speciale

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

### Il sprite layout (nemici e oggetti)

In parallelo, i nemici e gli oggetti (blocchi ?, tubi, goombas, koopas) sono archiviati in una struttura completamente separata. Ogni spawn è definito da 2 byte:

```asm
; Formato sprite SMB1
; Byte 0: posizione X (in colonne)
; Byte 1: tipo sprite + bit pagina Y
; Y è derivato dall'indice nella sequenza

Una sequenza di sprite:
  $01 $4B    ; goomba alla colonna 1
  $09 $4B    ; goomba alla colonna 9
  $10 $61    ; blocco ? alla colonna 16 (contiene moneta)
  $15 $54    ; koopa verde alla colonna 21
  $FF        ; fine sequenza
```

Ogni livello può fare riferimento fino a 5 pagine di sprite diverse (beh, 5 "schermate" da 16 colonne), ma in pratica la maggior parte dei livelli ne usa solo 2-3.

### La tabella dei puntatori

Il genio del design è la tabella dei puntatori. Ogni livello è archiviato come una **coppia** di indirizzi ROM:

```c
// Struttura interna (semplificata) della World Map
struct LevelPointer {
    uint16_t tile_ptr;   // Indirizzo ROM dei dati tile
    uint16_t sprite_ptr; // Indirizzo ROM dei dati sprite
};

// 4 tabelle separate, una per AreaType:
// 0 = Water, 1 = Overworld, 2 = Underground, 3 = Castle
LevelPointer level_table[4][128];
```

128 voci per tabella. 4 tipi di zona. **512 combinazioni possibili**, ma solo una frazione è usata dal gioco ufficiale. Il resto è RAM non inizializzata o dati che vengono interpretati come puntatori.

Quando il gioco carica un livello, fa questo:

```asm
; Caricamento di un livello
; A = AreaType (0-3), X = LevelID (0-127)

LoadLevel:
  sta AREA_TYPE
  asl                  ; *2 per offset nella tabella 16-bit
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

Nessuna validazione. Nessuna verifica che il puntatore sia valido. Il gioco legge l'indirizzo nella tabella e decomprime ciò che si trova a quell'indirizzo, punto.

![Level ID $06 (Water) -- 9-1, la versione sottomarina di 6-2](/images/smb1-glitch-levels/lvl-06-9-1.png)

![La tabella dei Level ID: 128 voci possibili, 34 assegnate](/images/smb1-glitch-levels/v2-level-id-table.jpg)

![L'ordine diverso dei puntatori tile e sprite -- la causa dei Frankenstein levels](/images/smb1-glitch-levels/v2-pointer-tables.jpg)

### I 34 livelli unici e il sistema di ID a 7 bit

![Il chip RAM della NES (MB8416A) -- è lui che preserva i dati quando si scambiano le cartucce](/images/smb1-glitch-levels/v1-ram-chip.jpg)

SMB1 non ha 32 livelli, ma **34 livelli unici**. Molti livelli sono duplicati (5-3 = 1-3 ma con dei Bullet Bills) contrassegnati da una flag "hard mode". I veri livelli unici:

- **Acqua** (Tipo 0): 3 livelli (2-2, 7-2, zona bonus 5-2/6-2)
- **Overworld** (Tipo 1): 22 livelli (inclusi i 2 locali nuvola bonus)
- **Underground** (Tipo 2): 3 livelli (inclusi i locali bonus sotterranei)
- **Castello** (Tipo 3): 6 livelli
- \+ 1 local cutscene (prima dei livelli sotterranei/acqua)
- \+ 1 warp zone di 4-2

Ogni livello ha un ID su **7 bit**. I 5 bit meno significativi = numero nel sottogruppo, i 2 bit più significativi = tipo di zona:

```asm
; Codifica 7-bit del Level ID
; Bit 6-5: Tipo (00=Water, 01=Overworld, 10=Underground, 11=Castle)
; Bit 4-0: Numero nel sottogruppo
;
; Water ID       : $00-$02  (tipi 00, numeri 0-2)
; Overworld ID   : $20-$35  (tipi 01, numeri 0-21)
; Underground ID : $40-$42  (tipi 10, numeri 0-2)
; Castle ID      : $60-$65  (tipi 11, numeri 0-5)
;
; ID $25 = %0100101 → tipo 01 (Overworld), numero 5 → 1-1
; ID $23 = %0100011 → tipo 01 (Overworld), numero 3 → 6-2
```

**128 ID possibili** ($00-$7F), solo 34 assegnati a veri livelli. Gli ID inutilizzati puntano verso qualsiasi cosa.

### Le tabelle dei puntatori: due liste, due ordini

I puntatori tile e sprite non sono archiviati nello stesso ordine. Il codice usa due liste 16-bit separate (high byte / low byte in due tabelle distinte):

```
Ordine dei puntatori sprite:
  Indice 0-5   : Castello (6 livelli)
  Indice 6-27  : Overworld (22 livelli)
  Indice 28-30 : Underground (3 livelli)
  Indice 31-33 : Acqua (3 livelli)

Ordine dei puntatori tile:
  Indice 0-2   : Acqua (3 livelli)
  Indice 3-24  : Overworld (22 livelli)
  Indice 25-27 : Underground (3 livelli)
  Indice 28-33 : Castello (6 livelli)
```

Perché ordini diversi? Nessuna ragione tecnica -- probabilmente è così che i dati sono stati organizzati durante lo sviluppo. Ma crea una conseguenza affascinante: quando un ID livello non è valido, i puntatori tile e sprite caricano livelli *diversi*, creando dei **Frankenstein levels**.

Per navigare tra queste due liste, il gioco usa delle piccole **tabelle di offset** (come un indice):

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
; 1. Tipo = 01 (Overworld) → indice nella tabella di offset = 1
; 2. Sprite offset = SpriteOffsetTable[1] = 6
;    Indice finale = 6 + 3 (numero livello) = 9 → 10° puntatore sprite
; 3. Tile offset = TileOffsetTable[1] = 3
;    Indice finale = 3 + 3 = 6 → 7° puntatore tile
; 4. Risultato: puntatore tile $A619 + puntatore sprite $9ED0 = 6-2 ✓
```

Ora, cosa succede con un ID non valido come $43 (Underground numero 3, che non esiste)?

```asm
; ID $43, Tipo = 10 (Underground), numero = 3
; Sprite offset = SpriteOffsetTable[2] = $1C = 28
;   Indice = 28 + 3 = 31 → 32° puntatore sprite = acqua bonus 5-2 !
; Tile offset = TileOffsetTable[2] = $19 = 25
;   Indice = 25 + 3 = 28 → 29° puntatore tile = 1-4 (Castle) !
;
; Risultato: un livello sotterraneo con le tile di 1-4
; e i Bloopers della zona acqua di 5-2. Un vero Frankenstein.
```

![Level ID $43 -- Frankenstein level: tile 1-4 + sprite acqua 5-2](/images/smb1-glitch-levels/lvl-43-frankenstein.png)

![Exploring Glitch Level Pointers -- le tabelle di offset spiegate](/images/smb1-glitch-levels/yt-pointers.jpg)

![La world index table -- quando l'overflow di world 9 crea un glitch level](/images/smb1-glitch-levels/v2-world-index-table.jpg)

### La world index table: perché world 9 fa overflow

C'è una tabella ROM di 8 byte che dà l'indice del primo livello di ogni mondo (1-8). E subito dopo, la tabella dei 36 Level ID di tutti i livelli nell'ordine di gioco.

```asm
; WorldIndexTable (8 byte)
  .byte 0, 5, 10, 15, 20, 25, 28, 33
;   -> Il Mondo 1 inizia al livello 0
;   -> Il Mondo 2 inizia al livello 5
;   -> Il Mondo 8 inizia al livello 33

; LevelIDTable (36 byte)
  .byte $25, $28, $29, $26, $24, ... ; i 36 Level ID
```

Quando si prova a caricare world 9, il gioco legge il 9° byte di WorldIndexTable... che non esiste. Fa overflow di 1 byte in LevelIDTable, legge il valore $25, poi usa $25 come indice in LevelIDTable (37° voce) -- il che fa overflow di 2 byte in SpriteOffsetTable, e legge il valore 6.

```asm
; World 9:
;   1. WorldIndexTable[8] (overflow) → legge $25 in LevelIDTable
;   2. LevelIDTable[37] (overflow) → legge il 2° byte di SpriteOffsetTable = 6
;   3. ID = 6 → livello Water numero 6 (che non esiste)
;   4. Tile pointer = puntatore water numero 6 = tile di 6-2
;   5. Sprite pointer = indice 31+6 = 37 > 33 → puntatore non valido
;   6. Risultato: 6-2 sott'acqua con sprite corrotti
;      → world 9-1 !
```

Per world G (16), l'overflow va ancora più in là e cade sul Level ID $01, che è il livello cutscene che precede 1-2:

```asm
; World G (16):
;   WorldIndexTable[15] → legge $01 in LevelIDTable
;   LevelIDTable[1] = $29 (cutscene 1-2)
;   → world G-1 = la cutscene di ingresso di 1-2
```

## Perché i glitch worlds esistono

Il gioco ha 32 livalli "legittimi" (8 mondi × 4 livelli). Ma la tabella dei puntatori ha 128 voci per tipo di zona. Le voci oltre il livello 32 contengono ciò che si trova in ROM a quegli indirizzi -- a volte un altro livello, a volte dati sonori, a volte RAM, a volte qualsiasi cosa.

![Level ID $01 Water (Minus World) -- tile pointer $AE45, sprite pointer $A171](/images/smb1-glitch-levels/minus-world.png)

### Level ID $01 + AreaType 0 = Minus World

Il più famoso tra i glitch worlds. Il Level ID $01 in AreaType 0 (acqua) punta verso:

- **Tile pointer: $AE45** → la zona sottomarina di 2-2/7-2
- **Sprite pointer: $A171** → gli sprite di 2-2/7-2

Il risultato: un livello acqua che sembra 2-2, ma che si ripete all'infinito perché l'asta non esiste. Nessuna fine livello, nessuna uscita.

È il livello 36-1 (o 36-1 nel mondo $-1).

![Il warm start check di SMB1 -- è lui che permette al Minus World di esistere](/images/smb1-glitch-levels/v4-minus-world.jpg)

```asm
; Perché manca l'asta nel Minus World:
; Gli sprite di 2-2/7-2 ($A171) non hanno un'asta
; nella loro sequenza. Il gioco cerca lo sprite $FD (flagpole)
; ma non lo trova mai → loop infinito
;
; Il gioco continua a generare il livello all'infinito
; finché il timer raggiunge zero.
```

### I puntatori che puntano verso la RAM

Quando il tile pointer o lo sprite pointer punta verso un indirizzo in RAM ($00-$7F) piuttosto che in ROM, il gioco cerca di interpretare i costanti cambiamenti della RAM come tile:

```asm
; Esempio: Level ID $03 in Water
; Tile Pointer: $A46B (3-3 - valido)
; Sprite Pointer: $009D (punta verso la RAM pagina zero!)
;
; La RAM pagina zero contiene i registri del gioco,
; la posizione di Mario, lo stato dei contatori...
; Il gioco decomprime tutto questo come una sequenza di sprite,
; e il risultato è un livello con nemici
; che in realtà sono valori di registro.
```

Quando la pagina zero cambia (perché Mario si muove, il timer scorre, ecc.), gli "sprite" del livello cambiano anche. Ecco perché certi glitch worlds hanno nemici che lampeggiano e si trasformano costantemente.

![Level ID $03 Water -- sprite pointer $009D punta verso la RAM, livello ingiocabile](/images/smb1-glitch-levels/level-03-water.png)

### Level ID $36: il livello vuoto (Overworld)

Level ID $36 in Overworld:

- **Tile pointer: $AC35** (1-2)
- **Sprite pointer: $A0D8** (1-2)

Risultato: niente. Il gioco carica il livello ma è contrassegnato "senza livello" nel catalogo di RGMechEx. Le tile potrebbero essere valide ma gli sprite puntano verso un posto che produce un livello vuoto o non funzionante.

### Level ID $1D (Castello): il campione dei crash

Level ID $1D in Castello:

- **Tile pointer: $A210** (4-4)
- **Sprite pointer: $7EA0** (RAM!)

Sprite pointer in RAM = sprite indefiniti. Il gioco cerca di visualizzare una Spiny ball o un Bullet Bill blaster nella prima riga di tile. Causo un crash immediato.

```asm
; Quando lo sprite pointer punta verso la RAM,
; il gioco decomprime byte che cambiano costantemente
; come istruzioni "spawn". Il risultato:
; - Apparizione di oggetti inesistenti (valore indefinito)
; - Crash PPU quando lo sprite NES cerca di visualizzare una tile non valida
; - Freeze completo della console
```

## I 256 glitch worlds catalogati

RGMechEx ha scritto uno script che genera le mappe di **tutti i livelli**, per i 4 tipi di zona, e i 128 ID ciascuno.

Il contatore dei mondi è a 8 bit (0-255). I mondi 1-8 sono legittimi. Restano **248 glitch worlds** potenziali. Ogni glitch world corrisponde al primo livello di quel mondo, e il suo Level ID è calcolato dal meccanismo di overflow della WorldIndexTable.

![Tabella dei glitch worlds -- 248 mondi corrotti, 68 primi livelli accessibili](/images/smb1-glitch-levels/v3-glitch-worlds-table.jpg)

Dei 128 ID possibili, solo **68 sono "primo livello" di un mondo** (accessibili tramite il numero del glitch world). I restanti 60 sono livelli 2+ o inaccessibili.

| Tipo | ID unici giocabili | ID che crashano | ID vuoti |
|------|---------------------|-------------------|-----------|
| Water (0)    | ~20  | ~60  | ~48  |
| Overworld (1)| ~30  | ~55  | ~43  |
| Underground (2) | ~15 | ~65 | ~48  |
| Castle (3)   | ~25  | ~58  | ~45  |

Molti ID portano allo stesso livello a causa dei puntatori che cadono sugli stessi indirizzi ROM. Il Level ID $28 (Overworld) per esempio -- tile pointer $A7CD (2-1) -- appare in **38 glitch worlds diversi**, perché il suo sprite pointer $9F51 punta verso una zona della ROM che è usata come padding/dati sonori riutilizzato da molti ID.

![Mappa del livello ID $28 (Overworld) -- tile di 2-1 con sprite normali, 38 glitch worlds](/images/smb1-glitch-levels/level-28-overworld.png)

![Super Mario Bros. Glitch Levels Explained -- il 3° video](/images/smb1-glitch-levels/yt-levels.jpg)

### I 6 glitch levels davvero unici

Tra i 19 ID di glitch level accessibili, solo **6 non crashano immediatamente** al caricamento:

| World | Level ID | Descrizione |
|-------|----------|-------------|
| E-1 (224) | $50 | Un solo blocco ? sopra un baratro. Mario muore istantaneamente. |
| W | $57 | Mario spawna bloccato, incapace di muoversi. |
| 42 (133) | $50 | Tunnel nuvola che intrappola Mario se va troppo avanti. |
| 62 (131, 240) | $4D | Castello ghiacciato: Mario spawna in alto, non può cadere → bloccato. |
| 127 | $4B | Tunnel sotterraneo, ma crasha se si va troppo avanti. |
| 137 | $4B | Attiva lo scorrimento automatico delle cutscene. Mario incontra un unico blocco mattoni che lo blocca per sempre. |

![Level ID $50 (cloud tunnel) -- il glitch world 42-1 e E-1](/images/smb1-glitch-levels/lvl-50-cloud.png)
![Level ID $4D (castle) -- world 62-1, Mario bloccato allo spawn](/images/smb1-glitch-levels/lvl-4D-castle.png)
![Level ID $4B (tunnel) -- world 127-1, crasha se si va troppo avanti](/images/smb1-glitch-levels/lvl-4B-tunnel.png)

Sei glitch worlds su 248 che producono qualcosa di davvero nuovo. Il resto sono livelli normali con il tipo di zona sbagliato, o schermate nere.

## Il formato dei livelli nel dettaglio

Al via sul formato esatto dei dati di livello, per capire perché i glitch levels reggono (o no).

### L'header livello: 2 byte, 6 proprietà

Ogni livello inizia con un header di 2 byte che controlla 6 proprietà:

```asm
; Byte 0: timer + Y start + modificatore
;   Bit 7-6: timer (00=invariato, 01=200, 10=300, 11=400)
;   Bit 5-3: Y start Mario (111/110 = autowalk)
;   Bit 2-0: modificatore tipo livello
;              000=default, 001=onde, 002=muro mattoni,
;              011=fondo acqua, 100=notte, 101=neve,
;              110=neve notte, 111=notte grigia

; Byte 1: piattaforma + sfondo + modello pavimento
;   Bit 7-6: piattaforma speciale (00=albero, 01=fungo,
;                                 10=Bullet Bill, 11=nuvola)
;   Bit 5-4: sfondo (00=nessuno, 01=nuvole,
;                     10=montagne, 11=recinzioni)
;   Bit 3-0: modello pavimento iniziale (0-15)
```

Il modificatore tipo controlla variazioni visive: le onde in cima ai livelli acqua, il fondo mattoni di 8-3, la palette notte di 4-3, la neve di 6-2, ecc.

### Gli oggetti tile: 2 byte, flag Next Screen, coda 3 slot

Dopo lheader viene una lista di **oggetti tile**, ogni oggetto fa 2 byte. Il byte $FD segna la fine della lista.

```asm
; Formato oggetto tile (16 bit):
; Byte 0:
;   Bit 7-4: posizione X (colonna 0-15)
;   Bit 3-0: posizione Y
;     Y=0-11  : posizione Y normale
;     Y=12    : oggetti speciali (buchi, ponti, corda, blocchi ?)
;     Y=13    : salto schermata / oggetti speciali 2
;     Y=14    : cambio modificatore/paesaggio/pavimento
;     Y=15    : oggetti speciali 3 (castello, scale, tubo grosso)

; Byte 1:
;   Bit  7   : FLAG NEXT SCREEN
;   Bit 6-4  : tipo oggetto (0-7)
;   Bit 3-0  : larghezza/altezza / sottotipo
```

Quando il bit "next screen" è impostato, la colonna di lavoro corrente viene incrementata di 1. Questo permette di posizionare oggetti oltre le prime 16 colonne. Gli oggetti devono essere elencati **in ordine** (da sinistra a destra) perché il li carica sequenzialmente:

```asm
; La routine di caricamento ha DUE fasi per colonna:
; Fase 1: cercare i nuovi oggetti che iniziano su questa colonna
;          e aggiungerli alla coda (queue)
; Fase 2: processare ogni oggetto nella coda disegnando le tile,
;          e rimuovere quelli che finiscono su questa colonna
```

La coda ha esattamente **3 slot**. Conseguenza diretta: non si possono avere più di 3 oggetti che iniziano sulla stessa colonna. Se la coda è piena, il 4° oggetto viene ignorato e non sarà mai caricato.

Ecco perché i livelli ben progettati evitano di impilare troppi oggetti. Esempio in 1-2: la colonna con il blocco 1up nel soffitto + i mattoni accanto sono divisi in due oggetti distinti per rispettare il limite di 3.

### Posizione Y speciale: 12, 13, 14, 15

Quando Y=12, l'oggetto non ha una posizione Y (è hardcodata per tipo):

```asm
; Y=12: oggetti senza posizione Y
;   Tipo 0: buco (rimuove il pavimento)
;   Tipo 1: corda piattaforma mobile
;   Tipi 2-4: ponti a Y fissa
;   Tipo 5: buco con acqua/lava
;   Tipi 6-7: file di blocchi ?
```

Quando Y=13, due sottogruppi. Se il bit 6 del byte 1 è a 1:

```asm
; Y=13, bit6=1: oggetti speciali
;   0 = L-pipe (cutscene), 1 = flagpole, 2-3 = ponte/ascia/martello (fine castello)
;   4 = stop screen, 5 = nemici casuali, 6 = loop level, 7+ = crash possibile
```

Se bit6=0, i 5 bit meno significativi codificano un **salto schermata** (saltare direttamente a uno schermo N, senza passare per la flag next screen una per una).

Quando Y=14: stesso principio con bit6=1 per cambiare il modificatore tipo, bit6=0 per cambiare lo sfondo + modello pavimento.

### I floor patterns: 16 motivi di pavimento

Il pavimento dei livelli non è fatto di oggetti singolari. SMB1 usa dei **floor patterns**, un motivo di sfondo che si applica a tutte le colonne fino al prossimo cambio:

```asm
; Floor patterns (4 bit = 16 possibilità)
;   0 = vuoto totale
;   1 = pavimento 2 tile alto
;   2 = pavimento 1 tile alto
;   3 = pavimento + fondo
;   4 = pavimento + fondo 2
;   5 = pavimento 1/2 tile
;   6 = 3/4 pavimento
;   ... fino a 15 = riempito totale (pavimento + soffitto)
```

Ecco perché i buchi sono oggetti: override il floor pattern su una colonna specifica, senza dover cambiare il pattern per tutto il resto.

### Il limite dei 256 byte e il repeat

Tutti i dati tile di un livello stanno in **256 byte massimo**. Il registro Y del 6502 è usato come indice, ed è a 8 bit. Se il gioco arriva alla fine dei dati senza trovare il byte $FD, **ricomincia da capo** e ripete i 256 byte all'infinito:

```asm
; Indice Y = 8 bit → max 256 byte di dati tile
; Se Y overflow (255 → 0) senza incontrare $FD → repeat
; Stessa cosa per gli sprite, ma gli oggetti pipe (3 byte)
; spostano la parità dell'indice a ogni caricamento.
```

Certi glitch levels sfruttano questo repeat per generare livelli che durano "all'infinito".

### Il sistema di sprite: 2 byte + transizioni pipe

Gli sprite seguono un formato simile, ma senza header e con alcune differenze chiave. Il byte $FF segna la fine della lista.

```asm
; Formato sprite (2 byte):
; Byte 0: posizione X (colonna)
; Byte 1:
;   Bit 7: FLAG NEXT SCREEN
;   Bit 6-0: tipo sprite
;       Alcuni tipi includono: goomba, koopa, Blooper,
;       Bullet Bill, Lakitu, Spiny, piattaforme,
;       comando warp zone, toad/principessa,
;       comandi di spawn di gruppi di nemici
```

Il bit meno significativo del byte 1 è la **flag hard level**: se impostato a 1, lo sprite appare solo nei livelli ≥ 5-3. È così che vengono creati i livelli "hard mode".

Posizione Y 15 = **salto schermata** (identica alle tile). Posizione Y 14 = **transizione pipe** (3 byte):

```asm
; Sprite Y=14: transizione pipe/vite (3 byte!)
;   Byte 0: posizione X
;   Byte 1: bit 6-0 = Level ID 7-bit (destinazione)
;   Byte 2: bit 4-0 = schermo di destinazione
;            bit 7-5 = mondo dove questa transizione è valida
;
; Perché un mondo? Le stanze bonus vengono riutilizzate tra i mondi.
; Esempio: la stanza bonus di 1-1 è usata anche da 2-1 e 7-1.
; Questa stanza ha 3 transizioni, una per mondo, perché Mario
; riappariva nel posto giusto.
```

Gli sprite **non hanno un sistema di coda**. L'unica limite è che non possono esserci più di 4 sprite caricati simultaneamente nella zona di spawn (appena fuori schermo a destra). Oltre, gli sprite vengono ignorati.

## Come accedere ai glitch worlds

Ci sono due metodi principali.

### Il metodo classico: il wall clip

Il wall clip (passaggio attraverso i muri) permette di uscire dal livello normale e camminare fino alla warp zone nascosta. Manipolando il contatore dei mondi tramite la RAM, si può caricare qualsiasi Level ID.

La tecnica:
1. World 1-2: andare nel tubo finale nascosto
2. Fare il wall clip sul muro di destra
3. Camminare nel vuoto fino alla zona warp
4. Il gioco interpreta i valori come mondi

Ma questo metodo dà accesso solo a una piccola parte dei glitch worlds.

### Il metodo estremo: NES Tennis cart swap

Vedi la sezione "Il warm start" sopra per il dettaglio completo. In sintesi: il contatore dei passi di Tennis scrive sullo stesso byte RAM del mondo di partenza di SMB1, e il rilevamento warm start preserva quel valore.

### L'angolo dei hacker: il codice per esplorare tutto

Se vuoi esplorare tutti i glitch tu stesso in un emulatore, puoi modificare il Level ID direttamente:

```asm
; Patch per FCEUX / Mesen:
; Indirizzo RAM $075F = Level ID attuale
; Indirizzo RAM $0760 = Area Type (0=Water, 1=Overworld, 2=Underground, 3=Castle)

; Esempio: caricare il Level 57 (0x39) in Overworld
; Nell'emulatore, aprire il traceur memoria e scrivere:
; $075F = 0x39
; $0760 = 0x01
; Poi entrare in un tubo di warp o morire e ricominciare
; → Il gioco carica il livello ID $39 in Overworld
```

RGMechEx ha pubblicato la lista completa dei 128 livelli × 4 tipi con mappe generate automaticamente su [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html). Ogni voce mostra il tile pointer, lo sprite pointer, e una mappa visiva del livello.

## I livelli più assurdi

### Level ID $1F (Water): 15 glitch worlds in uno

Il tile pointer $A302 (3-4) combinato allo sprite pointer $02A0 dà 15 glitch worlds diversi (D-1, J-1, Y-1, Z-1, 55-1, 73-1...). Spiegazione: lo sprite pointer punta verso una zona della ROM che contiene dati sufficientemente vicini a sprite validi per produrre risultati giocabili, ma la combinazione delle tile del castello 3-4 con sprite di overworld crea un rendering assurdo.

### Level ID $28 (Overworld): 38 glitch worlds = record

Il record assoluto. 38 voci di glitch world puntano verso lo stesso livello (tile di 2-1 + sprite $9F51). Perché? Perché lo sprite pointer $9F51 cade in una zona della ROM che è usata come padding/dati sonori riutilizzato da molti ID.

### Level ID $49 (Underground): il livello FDS

Tile pointer $76AE + sprite pointer $1C9D. Il tile pointer punta verso la zona della ROM riservata alla versione Famicom Disk System. Risultato: un livello con tile che non esistono nella cartuccia standard. È il livello che fa apparire il livello 52-1 e 196-1.

### Level ID $00-$02: i veri livelli bonus

Questi ID sono usati da sotto-livelli legittimi del gioco:

- **$00**: zona sottomarina di 5-2/6-2 (usato da H-1, 39-1)
- **$01**: l'acqua di 2-2/7-2 (il Minus World, 36-1)
- **$02**: sotto-livello di 8-4 (136-1, 151-1, 215-1)

La differenza tra un livello "bonus" accessibile normalmente e un glitch world è che le warp zone verificano il mondo corrente:

```asm
; Verifica warp zone (semplificata)
; Il gioco verifica che il mondo target sia tra 1 e 8
CheckWarp:
  lda TARGET_WORLD
  cmp #1
  bcc InvalidWarp       ; < 1 → rifiutato
  cmp #9
  bcs InvalidWarp       ; > 8 → rifiutato
  ; mondo valido solo tra 1 e 8
  jmp DoWarp
```

I glitch worlds con numeri > 8 o 0 non possono essere raggiunti da tubi normali. Serve il wall clip o il cart swap.

## Perché certi livelli crashano: le jump table

Quando il gioco carica un oggetto tile, usa il suo tipo come indice in una **jump table**:

```asm
; Jump table degli oggetti tile standard (tipi 0-11)
JumpTable_TileObjects:
  .word Obj_Special       ; tipo 0: blocco ?, nascosto, flagpole...
  .word Obj_Platform      ; tipo 1: piattaforma speciale
  .word Obj_BrickRow      ; tipo 2: riga di mattoni
  .word Obj_BlockRow      ; tipo 3: riga di blocchi
  .word Obj_CoinRow       ; tipo 4: riga di monete
  .word Obj_BrickCol      ; tipo 5: colonna di mattoni
  .word Obj_BlockCol      ; tipo 6: colonna di blocchi
  .word Obj_Pipe          ; tipo 7: tubo
  .word Obj_8             ; tipo 8
  .word Obj_9             ; tipo 9
  .word Obj_10            ; tipo 10
  .word Obj_11            ; tipo 11
```

![Le jump table: perché un tipo oggetto non valido fa crashare il gioco](/images/smb1-glitch-levels/v4-jump-table.jpg)

Se un oggetto ha un tipo non valido (≥12), il gioco salta a un puntatore che non esiste in questa tabella. **4 risultati possibili**:

1. **Puntatore valido** → l'oggetto si carica normalmente
2. **Puntatore verso un'altra jump table** (sovrapposizione) → appare un oggetto diverso. Esempio: tipo 12 punta alla tabella Y=13, che dà un L-pipe.
3. **Puntatore verso codice eseguibile** → esecuzione di codice casuale (crash probabile)
4. **Placeholder esplicito (NOP)** → l'oggetto non fa nulla (certi sprite sono così, producendo nemici che volano sul posto senza muoversi)

![Glitch level ID $58: lo sprite pointer punta verso un indirizzo non valido, il gioco crasha](/images/smb1-glitch-levels/v4-glitch-58-crash.jpg)

![Glitch level ID $50: il cloud tunnel, un livello generato da dati corrotti](/images/smb1-glitch-levels/v4-glitch-50.jpg)

Il glitch level ID $58 (il tunnel che crasha): il suo sprite pointer punta verso una regione di memoria che **non esiste su NES senza mapper ROM**. Il gioco cerca di caricare lo stesso Koopa 5 volte per frame alla posizione (0,0), il che satura la PPU e provoca un freeze.

```asm
; Perché ID $58 crasha:
; Sprite pointer → indirizzo non valido (fuori spazio NES standard)
; → Il gioco legge byte indeterminati come tipi sprite
; → Il Koopa $00 (tipo non valido senza handler) fa un loop con chiamata ricorsiva
; → Stack overflow 6502 → freeze
```

### Il paradosso pipe warp

Ricordati la verifica `target_world BETWEEN 1 AND 8`. Anche se trovi un tubo in un glitch world, il gioco verifica che il mondo di destinazione sia tra 1 e 8. I glitch worlds hanno numeri > 8 (36-1, 255-1...), quindi la warp fallisce.

È anche per questo che il Minus World non ha fine: l'asta non è presente negli sprite, e i tubi non portano da nessuna parte.

### Il trucco degli 5 oggetti in una colonna

Esiste un edge case che permette di superare il limite di 3 oggetti per colonna. Quando la coda si blocca (slot pieni + oggetto successivo con flag next screen mancante), il gioco "pre-elabora" la colonna corrente in loop fino a trovare un oggetto con flag next screen. Durante ogni pre-elaborazione:

```asm
; Durante la pre-elaborazione della colonna:
; 1. Gli oggetti nella coda vedono la loro larghezza rimanente
;    decrementata ad ogni "falsa avanzata" di colonna
; 2. Se un oggetto raggiunge larghezza=0, esce dalla coda
; 3. Uno slot liberato può essere riempito da un nuovo oggetto
;    aggiunto nella stessa colonna

; Risultato: fino a 5 oggetti possono essere processati sulla stessa colonna.
; Tecnica: posizionare 2 oggetti che attraversano il confine schermo
; (slot 1 e 2), 1 oggetto dummy con X < precedente (blocca la coda),
; poi 3 oggetti a X=0 dello schermo successivo (di cui uno con flag next screen).
```

Questo è ciò che si chiama "queue skip" ed è usato da certi romhackers per creare livelli più densi di quanto il formato permetta normalmente.

## Le differenze tra le versioni

### Famicom Disk System

La versione FDS di SMB1 ha una **memory map diversa**. Tutti i puntatori di livello sono spostati, ma i dati sono gli stessi. Ciò che cambia: gli indici dei glitch worlds sono completamente diversi:

```
FDS World 36 → Level ID $09 (versione acqua di 5-3)
  → L'asta è presente! Si può finire il livello.
  → Poi: $27 (7-3 normale) → $44 (4-4 underground)
  → $44 è finibile → l'ascia funziona → fine del gioco!
  
Il Minus World FDS è quindi un "bonus world" che può portare
al completamento del gioco, a differenza della versione NES.
```

Il mio livello FDS preferito: **ID $5F**, una versione sotterranea della seconda metà di 3-3 in tunnel basso (peccato che sia un autoscroller).

### The Lost Levels (Super Mario Bros. 2 giapponese)

Lost Levels cambia molte cose:

1. **Ordine identico tile/sprite**: niente più Frankenstein levels (tile e sprite caricano lo stesso livello anche con un ID non valido)
2. **Una sola tabella puntatori 16-bit** invece di due tabelle separate high/low
3. **4 file disco**: la ROM è stata suddivisa per il FDS:
   - File 1: mondi 1-4
   - File 2: mondi 5-8
   - File 3: world 9 + sound engine
   - File 4: mondi A-D (tabella puntatori completamente diversa)
4. **Stesso Level ID = 4 livelli possibili** a seconda del file caricato
5. **Niente più glitch Tennis**: l'opzione continue (continuare nello stesso mondo dopo game over) rende il warm start inutile, e il gioco **resetta immediatamente** se world > 9
6. **Nuovi oggetti**: fungo velenoso, blocco invisibile, fiore di fuoco invisibile, tubi capovolti, vento -- ma inseriti nel mezzo delle liste esistenti → **incompatibilità retroattiva** con SMB1
7. **Piranha Plants sempre rosse** dopo world 4, **trampolini verdi** solo nei mondi 2/B/3/C/7

### Super Mario All-Stars (SNES)

Porting diretto con le stesse routine 6502 (il SNES esegue il codice NES in modalità compatibile):

- **Warp zone corretta**: niente più Minus World (entrare nel tubo sinistro prima del testo porta al mondo giusto)
- **Crash**: la maggior parte dei glitch levels crashano (tranne ID $6A e 9-1)
- **Oggetti castello aggiunti**: resi più unici
- **Ma**: il **4-2 wrong warp** funziona ancora (non corretto!)

### Il 4-2 wrong warp: un bug di posizionamento oggetti

In 4-2, ci sono due oggetti di transizione pipe: la vite (warp zone) e il tubo (stanza coin cash). Il primo oggetto di transizione (quello della vite) è posizionato **ben prima** che la vite appaia sullo schermo. Il secondo (il tubo) è posizionato **troppo tardi nel livello**.

```asm
; Timing delle transizioni in 4-2:
; Oggetto transizione 1 (vite → warp zone): posizionato 3 schermate prima della vite
; Oggetto transizione 2 (tuyau → coin cash): posizionato 1 schermata dopo il tubo
;
; Normalmente il primo oggetto è disattivato prima che Mario
; raggiunga il tubo. Ma se Mario va veloce (o usa
; la scorciatoia del blocco B+destra), la transizione della vite
; è ancora attiva quando tocca il tubo!
; → Il gioco carica la warp zone invece del coin cash.
;
; Se l'oggetto fosse stato posizionato subito dopo la vite ma prima
; del tubo, il bug non esisterebbe.
```

### I livelli a loop

Come funzionano i loop (8-4, 7-4)? Il livello ha dei **checkpoints** con numeri di schermo e posizioni Y hardcodati:

```asm
; Checkpoint: {schermo_numero, posizione_verticale}
; Se Mario passa questo checkpoint alla giusta altezza → il livello continua
; Altrimenti → warp indietro di 4 schermate (64 blocchi)
;
; Per fare un loop infinito: posizione_verticale = $F0
; (sotto il fondo dello schermo) → impossibile validare.
;
; I checkpoints sono semplici (una sola flag) tranne per world 7
; che usa tripletti (3 flag, bisogna fallirne almeno 1)
;
; Il warp indietro è brutale: offset di tile data impostato a un valore
; hardcodato, offset di sprite data rimesso a 0. I nemici presenti
; vengono scaricati istantaneamente → le firebars scompaiono.
```

## Cambiare il formato, non il codice

Una delle lezioni più affascinanti di questa architettura è che gli sviluppatori di SMB1 sono riusciti a creare un sistema di livelli molto espressivo senza mai toccare il codice di rendering 6502. Tutta la variazione tra i livelli viene dai **dati** (puntatori, oggetti, sprite, floor patterns), non dal codice.

I 256 glitch worlds esistono perché le **tabelle dei puntatori sono dimensionate per 128 voci × 4 tipi**, e il gioco non valida mai i valori che legge. Quando un puntatore cade in RAM, il gioco interpreta i registri di Mario come tile. Quando un puntatore cade nei dati sonori, il gioco suona musica sotto forma di level design. E quando le jump table fanno overflow, il gioco esegue qualsiasi cosa fino al crash.

![More Super Mario Bros. Mechanics Explained -- il 4° video](/images/smb1-glitch-levels/yt-mechanics.jpg)

## Cosa si può imparare da tutto questo

1. **Separazione tile/sprite**: indipendenza totale dei due livelli, con ordini di archiviazione diversi che creano Frankenstein levels unici
2. **Compressione RLE + sistema di oggetti**: i livelli non sono bitmap ma liste di oggetti posizionati, con floor patterns per il pavimento
3. **Coda 3 slot**: limite rigido dell'hardware (e del design del livello)
4. **Nessuna validazione**: il gioco si fida dei puntatori e delle jump table, il che produce o glitch giocabili o crash
5. **256 byte max**: il limite del registro Y del 6502, che fa sì che i dati si ripetano se si va troppo avanti
6. **Warm start / cold start**: un sistema di "continuare" che ha aperto la porta al cart swap Tennis → Mario

Il più bello: tutto questo è codice 6502 che sta in 40KB. Nessun livello di astrazione, nessuna validazione degli accessi di memoria, nessun gestore eccezioni. Se il puntatore è marcio, il gioco crasha. E i crash li chiamiamo glitch worlds.

## Le 3 cose da ricordare

1. **I glitch worlds sono puntatori che cadono male** -- Il gioco ha 128 ID × 4 tipi di zona, ma solo 34 livelli unici. Quando il world number è corrotto (da Tennis o wall clip), il gioco carica un puntatore progettato per un altro livello, e le 512 combinazioni possibili producono risultati imprevedibili.

2. **Il Minus World è un bug di warp combinato a corruzione** -- Il tubo sinistro in 1-2, se attivato prima che il testo appaia, carica world 36 (0x24). Questo world punta al Level ID $01 (acqua di 2-2), un livello senza asta. E come non c'è una transizione pipe per world 36, il livello si ripete all'infinito. L'assenza di verifica crea l'icona.

3. **Tennis → Mario, 15 anni prima di OoT → Paper Mario** -- La RAM della NES sopravvive a uno swap di cartuccia grazie ai condensatori e al sistema di warm start / cold start di SMB1. Il contatore dei passi di Tennis ( che incrementa un byte RAM suonando il suono dei passi) cade esattamente sull'indirizzo del world number. Bisogna che le cifre dell'high score rimangano a 0, che il byte $A5 sia intatto, e che il gioco rilevi un warm start -- una coincidenza perfetta che ha funzionato solo con Tennis.

I video originali di [Retro Game Mechanics Explained](https://www.youtube.com/c/RetroGameMechanicsExplained) sono un lavoro immane -- il livello di dettaglio sulla disassembla 6502, le mappe automatiche di tutti i livelli, le spiegazioni del cart swap e del warm start. Se non hai visto la serie, guardala, è breve e ogni minuto è denso.

Il codice sorgente delle mappe è disponibile su [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html), e la disassembla completa di SMB1 è open source su tanti repository. 40 anni fa, dei programmatori giapponesi hanno scritto questo sistema di livelli in 6502 con zero test unitari e zero bug tracker, e continuiamo a imparare cose aprendo il loro codice oggi.
