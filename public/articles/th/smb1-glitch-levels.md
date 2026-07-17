---
title: "Super Mario Bros.: รูปแบบของเลเวล, พอยน์เตอร์ และ 256 glitch worlds"
description: "วิธีที่ 128 เลเวล × 4 ประเภทพื้นที่บรรจุอยู่ใน ROM 40KB ทำไม Minus World ถึงมีอยู่ และวิธีที่การแข่งขันเทนนิส NES สามารถโหลด glitch worlds"
date: 2026-06-10
authors:
  - fox3000foxy
tags:
  - retro
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "MWnsJbpdO5yQmIlVarexmNd1QDgHphzMwbNngJ/NNEi7imC4hDMCJIEkzcGJ9rv+8tf16m6eq445IYBf900B5w=="
---

## บทนำ

Super Mario Bros. คือ ROM ขนาด 40 กิโลไบต์ แปดโลก, 32 เลเวล, ศัตรู, เพลง, power-ups ทุกอย่างบรรจุอยู่ในนั้น

แต่ถ้าคุณเปิดเครื่องเลียนแบบแล้วแก้ไข byte ที่ถูกต้อง คุณสามารถโหลดเลเวล 36-1 ได้ หรือ 255-1 หรือลงจอดในโลกที่ทุกอย่างทำจาก sprite ของ Bowser และท่อที่นำไปสู่ที่ไหนไม่ได้

glitch worlds เหล่านี้มีอยู่ด้วยเหตุผลง่ายๆ: ระบบการจัดเก็บเลเวลของ SMB1 คือผลงานชิ้นเอกของการเพิ่มประสิทธิภาพ 8 บิต และเมื่อเราบังคับให้เกมอ่านในที่ที่ไม่ควรจะอ่าน มันจะให้ผลลัพธ์ที่น่าทึ่ง

Retro Game Mechanics Explained ได้ทำซีรีส์วิดีโอ 4 ตอนเกี่ยวกับเรื่องนี้ -- เราจะรวมมันเป็นการเดินทางเดียวในโค้ด 6502 ของเกมที่ขายดีที่สุดในยุคของมัน

![GLITCH OBJECTS -- ชื่อเรื่องของซีรีส์ RGMechEx เกี่ยวกับกลไกที่ซ่อนอยู่ของ SMB1](/images/smb1-glitch-levels/title-card.jpg)

![World 9-1 -- หน้าจอชื่อของ glitch world แรกที่เข้าถึงได้ผ่าน cart swap Tennis](/images/smb1-glitch-levels/v1-title-9-1.jpg)

## Warm start: ทำไม RAM ของ Tennis ถึงอยู่รอดใน SMB1

ก่อนจะพูดถึงการจัดเก็บเลเวล เราต้องเข้าใจว่า SMB1 เริ่มต้นอย่างไร เพราะ glitch ของ cart swap NES Tennis นั้นขึ้นอยู่กับ **ระบบการตรวจจับ warm start / cold start** ของเกมโดยสิ้นเชิง

### 41 byte ที่ถูกเก็บรักษา

เมื่อ SMB1 ตรวจจับ **cold start** (การเปิดเครื่องครั้งแรกหรือปิด/เปิดเครื่อง) มันจะล้าง RAM ทั้งหมด แต่เมื่อมันตรวจจับ **warm start** (รีเซ็ตปุ่ม ไม่มีการตัดไฟ) มันจะเก็บรักษาพื้นที่หน่วยความจำ **41 byte**:

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

41 byte เหล่านี้มีไว้เพื่อฟังก์ชันเดียว: อนุญาตให้ผู้เล่น **ดำเนินการต่อในโลกเดียวกันหลังจาก game over** ถ้าคุณตายใน 6-3 เกมจะเขียนโลก 6 ลงใน byte เริ่มต้น และที่หน้าจอชื่อ ถ้าคุณกด A + Start คุณจะเริ่มใหม่ใน 6-1

![41 byte ที่ถูกเก็บรักษาใน RAM เมื่อ warm start -- TOP SCORE, MARIO SCORE, TIMER, WORLD SELECT, CONTINUE WORLD และ byte วิเศษ $A5](/images/smb1-glitch-levels/v1-memory-state.jpg)

### การตรวจสอบสองครั้งของ warm start

![Cold start vs warm start -- แผนภาพการตรวจจับรีเซ็ต](/images/smb1-glitch-levels/v1-warm-start.jpg)

เมื่อ SMB1 บูต มันไม่ได้ตรวจสอบเกณฑ์เดียวแต่ **สอง**:

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

![การตรวจสอบ byte $A5 และหลักตัวเลขของ top score -- หัวใจของ warm start](/images/smb1-glitch-levels/v1-a5-byte.jpg)

ทำไมต้องตรวจสอบสองครั้ง? เพราะ byte $A5 อาจปรากฏโดยบังเอิญ (เกมอื่นที่ทิ้งค่านี้ไว้ หรือสถานะพักเริ่มต้นของชิป RAM) เมื่อตรวจสอบว่าหลักตัวเลขของ top score ถูกต้อง (0-9) เราจะมั่นใจได้ว่าข้อมูลมีความสอดคล้องกัน

### ทำไม Tennis ถึงเป็นเกมเดียวที่ใช้งานได้

เมื่อเราใส่ SMB1 เป็นครั้งแรก (cold start) เกม:
1. ล้าง RAM ทั้งหมด → top score = 0, world byte = 0
2. เขียน $A5 ที่อยู่ $0787

จากนั้นเราสลับไป Tennis โดยไม่ปิดเครื่องเล่น Tennis:
- **ไม่ล้าง RAM เมื่อเริ่มต้น** (เกม NES ไม่กี่เกมทำแบบนี้)
- **ไม่เขียนลงใน byte ของ top score** → ยังคงเป็น 0 (ถูกต้อง)
- **ไม่แตะ byte $A5** → ยังคงมีอยู่
- **ใช้ที่อยู่ $075F** สำหรับตัวนับก้าวของผู้เล่น

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

เมื่อเรากลับ SMB1:
1. byte $A5 ยังอยู่ที่นั่น (Tennis ไม่ได้แตะมัน)
2. หลักตัวเลขของ top score ยังเป็น 0 (ถูกต้อง)
3. world byte มีค่า 8+ แล้ว (เพิ่มขึ้นจากก้าวของ Tennis)
4. SMB1 ตรวจจับ warm start → เก็บรักษา world byte ที่เสียหาย
5. กด A + Start → world 9-1, world A-1, world 36-1 ฯลฯ

### ทำไมต้องบูต Mario ก่อน Tennis

ความละเอียดอ่อน: เราต้องบูต SMB1 ก่อน แล้ว Tennis แล้ว SMB1 อีกครั้ง ถ้าคุณเริ่ม Tennis โดยตรง byte $A5 จะไม่ถูกเขียนเลย (Tennis ไม่เขียน $A5) ดังนั้นการตรวจจับ warm start จะล้มเหลวและ RAM จะถูกล้าง

![ตัวนับก้าวของ Tennis: ทุกก้าวจะเพิ่ม world byte](/images/smb1-glitch-levels/v1-footstep.jpg)

![เข้าถึง Glitch Worlds ผ่าน NES Tennis -- วิดีโอที่อธิบาย cart swap](/images/smb1-glitch-levels/yt-tennis.jpg)

## วิธีที่ SMB1 เก็บเลเวลใน 40KB

Nintendo R&D4 ต้องแก้ปัญหาที่ดูเหมือนง่าย: แสดงเลเวลที่เลื่อนในแนวนอนด้วย tiles, ศัตรู, items ทั้งหมดอยู่ในงบ ROM ที่จำกัดมาก

วิธีแก้คือการแยกออกเป็นสองชั้นข้อมูล **ที่เป็นอิสระต่อกันโดยสมบูรณ์**:

### Tile layout (แผนที่ของเลเวล)

ทุกเลเวลถูกกำหนดโดยพอยน์เตอร์ไปยังโครงสร้าง tiles ที่บีบอัดใน ROM การบีบอัดนั้นหยาบแต่ชาญฉลาด: byte "ควบคุม" ตามด้วย 1-3 byte ของข้อมูล

รูปแบบ tile ใช้ระบบ **runs** (คล้าย RLE):

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

แต่ละเลเวลมี 13 แถวของ 16 คอลัมน์ tiles (13×16 = 208 tiles ที่มองเห็นได้) แต่รูปแบบที่บีบอัดช่วยให้ลดลงได้มากกว่านั้น -- ตัวอย่างเช่น ท้องฟ้าและคอลัมน์ว่างเปล่าแทบไม่ใช้พื้นที่เลย

ลูปเรนเดอร์ใน 6502:

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

### Sprite layout (ศัตรูและวัตถุ)

พร้อมกันนั้น ศัตรูและวัตถุ (บล็อก ?, ท่อ, goombas, koopas) ถูกเก็บในโครงสร้างที่แยกจากกันโดยสมบูรณ์ การ spawn แต่ละครั้งถูกกำหนดโดย 2 byte:

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

แต่ละเลเวลสามารถอ้างอิงถึง 5 หน้า sprites ที่แตกต่างกันได้สูงสุด (หมายถึง 5 "หน้าจอ" ของ 16 คอลัมน์) แต่ในทางปฏิบัติส่วนใหญ่ใช้เพียง 2-3 หน้าเท่านั้น

### ตารางพอยน์เตอร์

อัจฉริยะของการออกแบบคือตารางพอยน์เตอร์ แต่ละเลเวลถูกเก็บเป็น **คู่** ของที่อยู่ ROM:

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

128 รายการต่อตาราง 4 ประเภทพื้นที่ **512 ชุดค่าผสมที่เป็นไปได้** แต่เฉพาะส่วนน้อยเท่านั้นที่ใช้โดยเกมอย่างเป็นทางการ ที่เหลือคือ RAM ที่ไม่ได้เริ่มต้นหรือข้อมูลที่ถูกตีความเป็นพอยน์เตอร์

เมื่อเกมโหลดเลเวล มันทำแบบนี้:

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

ไม่มีการตรวจสอบ ไม่มีการยืนยันว่าพอยน์เตอร์ถูกต้อง เกมอ่านที่อยู่ในตารางแล้วบีบอัดสิ่งที่อยู่ที่ที่อยู่นั้น จุดจบ

![Level ID $06 (Water) -- 9-1, เวอร์ชันใต้น้ำของ 6-2](/images/smb1-glitch-levels/lvl-06-9-1.png)

![ตาราง Level IDs: 128 รายการที่เป็นไปได้ 34 รายการที่กำหนด](/images/smb1-glitch-levels/v2-level-id-table.jpg)

![ลำดับที่แตกต่างของพอยน์เตอร์ tiles และ sprites -- สาเหตุของ Frankenstein levels](/images/smb1-glitch-levels/v2-pointer-tables.jpg)

### 34 เลเวลที่ไม่ซ้ำกันและระบบ ID 7 บิต

![ชิป RAM ของ NES (MB8416A) -- มันคือสิ่งที่เก็บรักษาข้อมูลเมื่อเราสลับตลับ](/images/smb1-glitch-levels/v1-ram-chip.jpg)

SMB1 ไม่มี 32 เลเวล แต่มี **34 เลเวลที่ไม่ซ้ำกัน** เลเวลจำนวนมากเป็นสำเนา (5-3 = 1-3 แต่มี Bullet Bills) ที่ทำเครื่องหมายด้วยธง "hard mode" เลเวลที่ไม่ซ้ำกันจริงๆ:

- **น้ำ** (Type 0): 3 เลเวล (2-2, 7-2, โซนโบนัส 5-2/6-2)
- **Overworld** (Type 1): 22 เลเวล (รวมห้องเมฆโบนัส 2 ห้อง)
- **Underground** (Type 2): 3 เลเวล (รวมห้องโบนัสใต้ดิน)
- **Castle** (Type 3): 6 เลเวล
- \+ 1 ห้อง cutscene (ก่อนเลเวลใต้ดิน/น้ำ)
- \+ 1 warp zone ของ 4-2

แต่ละเลเวลมี ID **7 บิต** 5 บิตต่ำสุด = หมายเลขในกลุ่มย่อย 2 บิตสูงสุด = ประเภทพื้นที่:

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

**128 IDs ที่เป็นไปได้** ($00-$7F) มีเพียง 34 เท่านั้นที่กำหนดให้กับเลเวลจริง IDs ที่ไม่ได้ใช้ชี้ไปยังอะไรก็ได้

### ตารางพอยน์เตอร์: สองรายการ สองลำดับ

พอยน์เตอร์ tiles และ sprites ไม่ได้ถูกเก็บในลำดับเดียวกัน โค้ดใช้รายการ 16 บิตสองรายการที่แยกจากกัน (high byte / low byte ในสองตารางที่แตกต่างกัน):

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

ทำไมลำดับจึงต่างกัน? ไม่มีเหตุผลทางเทคนิค -- มันน่าจะเป็นแบบที่ข้อมูลถูกจัดเรียงระหว่างการพัฒนา แต่มันสร้างผลลัพธ์ที่น่าทึ่ง: เมื่อ ID เลเวลไม่ถูกต้อง พอยน์เตอร์ tiles และ sprites จะโหลดเลเวล *ที่แตกต่างกัน* สร้าง **Frankenstein levels**

เพื่อนำทางระหว่างสองรายการนี้ เกมใช้ **ตาราง offset** เล็กๆ (เหมือนสารบัญ):

```asm
; Tables d'offset par type (Water, Overworld, Underground, Castle)
; Chaque entrée = index de début dans la liste correspondante

SpriteOffsetTable:
  .byte $1F, $06, $1C, $00    ; Water=31, Overworld=6, Underground=28, Castle=0

TileOffsetTable:
  .byte $00, $03, $19, $1C    ; Water=0, Overworld=3, Underground=25, Castle=28
```

เพื่อโหลดเลเวล 6-2 (ID $23, Overworld หมายเลข 3):

```asm
; 1. Type = 01 (Overworld) → index dans table d'offset = 1
; 2. Sprite offset = SpriteOffsetTable[1] = 6
;    Index final = 6 + 3 (numéro de niveau) = 9 → 10ème pointeur sprites
; 3. Tile offset = TileOffsetTable[1] = 3
;    Index final = 3 + 3 = 6 → 7ème pointeur tiles
; 4. Résultat : pointeur tiles $A619 + pointeur sprites $9ED0 = 6-2 ✓
```

ตอนนี้เกิดอะไรขึ้นกับ ID ที่ไม่ถูกต้องเช่น $43 (Underground หมายเลข 3 ที่ไม่มีอยู่)?

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

![Level ID $43 -- Frankenstein level: tiles 1-4 + sprites น้ำ 5-2](/images/smb1-glitch-levels/lvl-43-frankenstein.png)

![Exploring Glitch Level Pointers -- ตาราง offset ที่อธิบาย](/images/smb1-glitch-levels/yt-pointers.jpg)

![ตาราง world index -- เมื่อ overflow ของ world 9 สร้าง glitch level](/images/smb1-glitch-levels/v2-world-index-table.jpg)

### ตาราง world index: ทำไม world 9 ถึง overflow

มีตาราง ROM ขนาด 8 byte ที่ให้ index ของเลเวลแรกของแต่ละโลก (1-8) และทันทีหลังจากนั้นคือตาราง Level IDs 36 ตัวของทุกเลเวลในลำดับการเล่น

```asm
; WorldIndexTable (8 bytes)
  .byte 0, 5, 10, 15, 20, 25, 28, 33
;   -> Monde 1 commence au niveau 0
;   -> Monde 2 commence au niveau 5
;   -> Monde 8 commence au niveau 33

; LevelIDTable (36 bytes)
  .byte $25, $28, $29, $26, $24, ... ; les 36 Level IDs
```

เมื่อเราพยายามโหลด world 9 เกมจะอ่าน byte ที่ 9 ของ WorldIndexTable... ที่ไม่มีอยู่ มัน overflow 1 byte ลงใน LevelIDTable อ่านค่า $25 แล้วใช้ $25 เป็น index ใน LevelIDTable (รายการที่ 37) -- ซึ่ง overflow อีก 2 byte ลงใน SpriteOffsetTable และอ่านค่า 6

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

สำหรับ world G (16) overflow ไกลยิ่งขึ้นและตกไปที่ Level ID $01 ซึ่งเป็นเลเวล cutscene ก่อน 1-2:

```asm
; World G (16) :
;   WorldIndexTable[15] → lit $01 dans LevelIDTable
;   LevelIDTable[1] = $29 (cutscene 1-2)
;   → world G-1 = la cutscene d'entrée de 1-2
```

## ทำไม glitch worlds ถึงมีอยู่

เกมมี 32 เลเวล "ถูกกฎหมาย" (8 โลก × 4 เลเวล) แต่ตารางพอยน์เตอร์มี 128 รายการต่อประเภทพื้นที่ รายการที่อยู่เลยเลเวล 32 มีสิ่งที่อยู่ใน ROM ที่ที่อยู่เหล่านั้น -- บางครั้งเป็นเลเวลอื่น บางครั้งเป็นข้อมูลเสียง บางครั้งเป็น RAM บางครั้งเป็นอะไรก็ได้

![Level ID $01 Water (Minus World) -- tile pointer $AE45, sprite pointer $A171](/images/smb1-glitch-levels/minus-world.png)

### Level ID $01 + AreaType 0 = Minus World

ที่มีชื่อเสียงที่สุดของ glitch worlds Level ID $01 ใน AreaType 0 (น้ำ) ชี้ไปที่:

- **Tile pointer: $AE45** → โซนใต้น้ำของ 2-2/7-2
- **Sprite pointer: $A171** → sprites ของ 2-2/7-2

ผลลัพธ์: เลเวลน้ำที่ดูเหมือน 2-2 แต่วนลูปไม่รู้จบเพราะ flagpole ไม่มีอยู่ ไม่มีจุดสิ้นสุดเลเวล ไม่มีทางออก

นี่คือเลเวล 36-1 (หรือ 36-1 ในโลก $-1)

![การตรวจสอบ warm start ของ SMB1 -- มันคือสิ่งที่ทำให้ Minus World ดำรงอยู่](/images/smb1-glitch-levels/v4-minus-world.jpg)

```asm
; Pourquoi le flagpole manque dans le Minus World :
; Les sprites de 2-2/7-2 ($A171) n'ont pas de flagpole
; dans leur séquence. Le jeu cherche le sprite $FD (flagpole)
; mais ne le trouve jamais → boucle infinie
;
; Le jeu continue de générer le niveau à l'infini
; jusqu'à ce que le timer atteigne zéro.
```

### พอยน์เตอร์ที่ชี้ไปยัง RAM

เมื่อ tile pointer หรือ sprite pointer ชี้ไปยังที่อยู่ใน RAM ($00-$7F) แทนที่จะเป็น ROM เกมพยายามตีความการเปลี่ยนแปลงของ RAM อย่างต่อเนื่องเป็น tiles:

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

เมื่อหน้าแรกเปลี่ยน (เพราะ Mario เคลื่อนที่ ตัวนับหมุน ฯลฯ) "sprites" ของเลเวลก็เปลี่ยนด้วย นี่คือเหตุผลที่ glitch worlds บางตัวมีศัตรูที่กะพริบและเปลี่ยนแปลงตลอดเวลา

![Level ID $03 Water -- sprite pointer $009D ชี้ไปยัง RAM, เลเวลเล่นไม่ได้](/images/smb1-glitch-levels/level-03-water.png)

### Level ID $36: เลเวลว่างเปล่า (Overworld)

Level ID $36 ใน Overworld:

- **Tile pointer: $AC35** (1-2)
- **Sprite pointer: $A0D8** (1-2)

ผลลัพธ์: ไม่มีอะไร เกมโหลดเลเวลแต่มันถูกทำเครื่องหมายว่า "ไม่มีเลเวล" ในแคตตาล็อกของ RGMechEx tiles อาจถูกต้องแต่ sprites ชี้ไปยังตำแหน่งที่สร้างเลเวลว่างเปล่าหรือใช้งานไม่ได้

### Level ID $1D (Castle): แชมป์แห่งการ crash

Level ID $1D ใน Castle:

- **Tile pointer: $A210** (4-4)
- **Sprite pointer: $7EA0** (RAM!)

Sprite pointer ใน RAM = undefined sprites เกมพยายามแสดง Spiny ball หรือ Bullet Bill blaster ในแถว tiles แรก มัน crash ทันที

```asm
; Quand le sprite pointer pointe vers la RAM,
; le jeu décompresse des bytes qui changent tout le temps
; comme des instructions "spawn". Le résultat :
; - Apparition d'objets inexistants (valeur undefined)
; - Crash PPU quand le sprite NES essaie d'afficher un tile invalide
; - Freeze complet de la console
```

## 256 glitch worlds ที่จัดทำขึ้น

RGMechEx เขียนสคริปต์ที่สร้างแผนที่ของ **ทุกเลเวล** สำหรับ 4 ประเภทพื้นที่ และ 128 IDs แต่ละตัว

ตัวนับโลกมี 8 บิต (0-255) โลก 1-8 ถูกกฎหมาย ยังเหลือ **248 glitch worlds** ที่เป็นไปได้ glitch world แต่ละตัวสอดคล้องกับเลเวลแรกของโลกนั้น และ Level ID ของมันถูกคำนวณโดยกลไก overflow ของ WorldIndexTable

![ตาราง glitch worlds -- 248 โลกที่เสียหาย 68 เลเวลแรกที่เข้าถึงได้](/images/smb1-glitch-levels/v3-glitch-worlds-table.jpg)

ใน 128 IDs ที่เป็นไปได้ มีเพียง **68 ตัวเท่านั้นที่เป็น "first level" ของโลก** (เข้าถึงได้ผ่านหมายเลข glitch world) อีก 60 ตัวเป็นเลเวล 2+ หรือเข้าถึงไม่ได้

| ประเภท | IDs ที่เล่นได้ไม่ซ้ำกัน | IDs ที่ crash | IDs ว่างเปล่า |
|------|---------------------|-------------------|-----------|
| Water (0)    | ~20  | ~60  | ~48  |
| Overworld (1)| ~30  | ~55  | ~43  |
| Underground (2) | ~15 | ~65 | ~48  |
| Castle (3)   | ~25  | ~58  | ~45  |

IDs จำนวนมากนำไปสู่เลเวลเดียวกันเนื่องจากพอยน์เตอร์ที่ตกไปที่ที่อยู่ ROM เดียวกัน Level ID $28 (Overworld) ตัวอย่างเช่น -- tile pointer $A7CD (2-1) -- ปรากฏใน **38 glitch worlds ที่แตกต่างกัน** เพราะ sprite pointer $9F51 ชี้ไปยังโซน ROM ที่ใช้เป็น padding/ข้อมูลเสียงที่ใช้ซ้ำโดย IDs จำนวนมาก

![แผนที่เลเวล ID $28 (Overworld) -- 2-1 tiles กับ sprites ปกติ, 38 glitch worlds](/images/smb1-glitch-levels/level-28-overworld.png)

![Super Mario Bros. Glitch Levels Explained -- วิดีโอที่ 3](/images/smb1-glitch-levels/yt-levels.jpg)

### 6 glitch levels ที่ไม่ซ้ำกันจริงๆ

ใน 19 IDs ของ glitch level ที่เข้าถึงได้ มีเพียง **6 ตัวเท่านั้นที่ไม่ crash ทันที** เมื่อโหลด:

| World | Level ID | คำอธิบาย |
|-------|----------|-------------|
| E-1 (224) | $50 | บล็อก ? เดียวเหนือเหวลึก Mario ตายทันที |
| W | $57 | Mario ถูกขังเมื่อ spawn ไม่สามารถเคลื่อนที่ได้ |
| 42 (133) | $50 | อุโมงค์เมฆที่ขัง Mario ถ้าเขาไปไกลพอ |
| 62 (131, 240) | $4D | ปราสาทแช่แข็ง: Mario spawn ด้านบน ไม่สามารถตกลงมาได้ → ถูกขัง |
| 127 | $4B | อุโมงค์ใต้ดิน แต่ crash ถ้าไปไกลเกินไป |
| 137 | $4B | เปิดใช้งานการเลื่อนอัตโนมัติของ cutscenes Mario พบบล็อก brick เดียวที่ขังเขาตลอดกาล |

![Level ID $50 (อุโมงค์เมฆ) -- glitch world 42-1 และ E-1](/images/smb1-glitch-levels/lvl-50-cloud.png)
![Level ID $4D (ปราสาท) -- world 62-1, Mario ถูกขังที่ spawn](/images/smb1-glitch-levels/lvl-4D-castle.png)
![Level ID $4B (อุโมงค์) -- world 127-1, crash ถ้าไปไกลเกินไป](/images/smb1-glitch-levels/lvl-4B-tunnel.png)

หก glitch worlds จาก 248 ตัวที่สร้างสิ่งที่ใหม่จริงๆ ที่เหลือเป็นเลเวลปกติแต่มีประเภทพื้นที่ผิด หรือหน้าจอว่างเปล่า

## รูปแบบเลเวลโดยละเอียด

มุ่งไปที่รูปแบบข้อมูลเลเวลที่แน่นอน เพื่อเข้าใจว่าทำไม glitch levels ถึงยืนหยัดได้ (หรือไม่)

### Header เลเวล: 2 byte, 6 คุณสมบัติ

ทุกเลเวลเริ่มต้นด้วย header ขนาด 2 byte ที่ควบคุม 6 คุณสมบัติ:

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

ตัวดัดแปลง type ควบคุมการเปลี่ยนแปลงภาพ: คลื่นด้านบนเลเวลน้ำ, พื้นหลังอิฐของ 8-3, พาเลทกลางคืนของ 4-3, หิมะของ 6-2 ฯลฯ

### วัตถุ tiles: 2 byte, Next Screen Flag, คิว 3 slots

หลัง header มาคือรายการ **วัตถุ tiles** แต่ละวัตถุมี 2 byte byte $FD ทำเครื่องหมายจุดสิ้นสุดของรายการ

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

เมื่อ bit "next screen" ถูกตั้ง คอลัมน์ปัจจุบันจะเพิ่มขึ้น 1 ช่วยให้วางวัตถุเลย 16 คอลัมน์แรกได้ วัตถุต้องเรียง **ตามลำดับ** (ซ้ายไปขวา) เพราะเกมโหลดมันตามลำดับ:

```asm
; La routine de chargement a DEUX phases par colonne :
; Phase 1 : chercher les nouveaux objets qui commencent sur cette colonne
;            et les ajouter à la file d'attente (queue)
; Phase 2 : traiter chaque objet dans la queue en dessinant les tiles,
;            et retirer ceux qui finissent sur cette colonne
```

คิวมีเพียง **3 slots** เท่านั้น ผลลัพธ์โดยตรง: เราไม่สามารถมีวัตถุมากกว่า 3 ชิ้นที่เริ่มต้นในคอลัมน์เดียวกัน ถ้าคิวเต็ม วัตถุที่ 4 จะถูกละเว้นและจะไม่ถูกโหลดเลย

นี่คือเหตุผลที่เลเวลที่ออกแบบดีหลีกเลี่ยงการวางวัตถุมากเกินไป ตัวอย่างใน 1-2: คอลัมน์ที่มีบล็อก 1up ในเพดาน + อิฐข้างๆ ถูกแยกเป็นสองวัตถุที่แตกต่างกันเพื่อเคารพขีดจำกัด 3

### Y position พิเศษ: 12, 13, 14, 15

เมื่อ Y=12 วัตถุไม่มีตำแหน่ง Y (มันถูก hardcode ตามประเภท):

```asm
; Y=12 : objets sans Y position
;   Type 0 : trou (supprime le sol)
;   Type 1 : rope de plateforme mobile
;   Types 2-4 : ponts à Y fixe
;   Type 5 : trou avec eau/lave
;   Types 6-7 : rangées de ? blocks
```

เมื่อ Y=13 มีสองกลุ่มย่อย ถ้า bit 6 ของ byte 1 เป็น 1:

```asm
; Y=13, bit6=1 : objets spéciaux
;   0 = L-pipe (cutscene), 1 = flagpole, 2-3 = pont/axe/hamer (fin château)
;   4 = stop screen, 5 = random enemies, 6 = loop level, 7+ = crash possible
```

ถ้า bit6=0 5 บิตต่ำสุดจะเข้ารหัส **screen skip** (ข้ามไปยังหน้าจอ N โดยตรง โดยไม่ต้องผ่าน next screen flag ทีละตัว)

เมื่อ Y=14: หลักการเดียวกันกับ bit6=1 เพื่อเปลี่ยน type modifier, bit6=0 เพื่อเปลี่ยนพื้นหลัง + floor pattern

### Floor patterns: 16 ลวดลายพื้น

พื้นของเลเวลไม่ได้ทำจากวัตถุแต่ละชิ้น SMB1 ใช้ **floor patterns** ลวดลายพื้นหลังที่ใช้กับทุกคอลัมน์จนถึงการเปลี่ยนแปลงถัดไป:

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

นี่คือเหตุผลที่รูเป็นวัตถุ: มัน override floor pattern ในคอลัมน์เฉพาะ โดยไม่ต้องเปลี่ยน pattern สำหรับที่เหลือ

### ขีดจำกัด 256 byte และ repeat

ข้อมูล tiles ทั้งหมดของเลเวลบรรจุใน **สูงสุด 256 byte** Y register ของ 6502 ถูกใช้เป็น index และมันมี 8 บิต ถ้าเกมไปถึงจุดสิ้นสุดของข้อมูลโดยไม่พบ byte $FD **มันจะวนกลับไปเริ่มต้น** และทำซ้ำ 256 byte ไม่รู้จบ:

```asm
; Index Y = 8 bits → max 256 bytes de données tiles
; Si Y overflow (255 → 0) sans rencontrer $FD → repeat
; Même chose pour les sprites, mais les objets pipe (3 bytes)
; décalent la parité de l'index à chaque chargement.
```

glitch levels บางตัวใช้ repeat นี้เพื่อสร้างเลเวลที่อยู่ "ตลอดกาล"

### ระบบ sprites: 2 byte + pipe transitions

Sprites ใช้รูปแบบที่คล้ายกัน แต่ไม่มี header และมีความแตกต่างที่สำคัญบางประการ byte $FF ทำเครื่องหมายจุดสิ้นสุดของรายการ

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

บิตต่ำสุดของ byte 1 คือ **hard level flag**: ถ้าตั้งเป็น 1 sprite จะปรากฏเฉพาะในเลเวล ≥ 5-3 เท่านั้น นี่คือวิธีที่เลเวล "hard mode" ถูกสร้างขึ้น

Y position 15 = **screen skip** (เหมือน tiles) Y position 14 = **pipe transition** (3 byte):

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

Sprites **ไม่มีระบบคิว** ขีดจำกัดเดียวคือไม่สามารถมี sprites โหลดพร้อมกันมากกว่า 4 ชิ้นในโซน spawn (แค่นอกหน้าจอทางขวา) เกินกว่านั้น sprites จะถูกละเว้น

## วิธีเข้าถึง glitch worlds

มีสองวิธีหลัก

### วิธีคลาสสิก: wall clip

Wall clip (ผ่านกำแพง) ช่วยให้ออกจากเลเวลปกติและเดินไปยัง warzone ที่ซ่อนอยู่ ด้วยการจัดการตัวนับโลกผ่าน RAM เราสามารถโหลด Level ID ใดก็ได้

เทคนิค:
1. World 1-2: ไปท่อที่ซ่อนจุดสิ้นสุด
2. ทำ wall clip บนกำแพงขวา
3. เดินในที่ว่างจนถึงโซน warp
4. เกมตีความค่าเป็นโลก

แต่วิธีนี้ให้เข้าถึงเพียงส่วนเล็กๆ ของ glitch worlds เท่านั้น

### วิธีสุดขีด: NES Tennis cart swap

ดูส่วน "Warm start" ด้านบนสำหรับรายละเอียดที่สมบูรณ์ โดยสรุป: ตัวนับก้าวของ Tennis เขียนลงใน byte RAM เดียวกันกับโลกเริ่มต้นของ SMB1 และการตรวจจับ warm start เก็บรักษาค่านี้

### มุมนักปั้น: โค้ดสำหรับสำรวจทุกอย่าง

ถ้าคุณต้องการสำรวจ glitch ทั้งหมดด้วยตัวเองในเครื่องเลียนแบบ คุณสามารถ patch Level ID โดยตรง:

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

RGMechEx เผยแพร่รายการที่สมบูรณ์ของ 128 เลเวล × 4 ประเภทพร้อมแผนที่ที่สร้างอัตโนมัติบน [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html) แต่ละรายการแสดง tile pointer, sprite pointer และแผนที่ภาพของเลเวล

## เลเวลที่วุ่นวายที่สุด

### Level ID $1F (Water): 15 glitch worlds ในตัวเดียว

Tile pointer $A302 (3-4) รวมกับ sprite pointer $02A0 ให้ 15 glitch worlds ที่แตกต่างกัน (D-1, J-1, Y-1, Z-1, 55-1, 73-1...) คำอธิบาย: sprite pointer ชี้ไปยังโซน ROM ที่มีข้อมูลใกล้เคียงกับ sprites ที่ถูกต้องเพียงพอที่จะสร้างผลลัพธ์ที่เล่นได้ แต่การผสมผสาน tiles ปราสาท 3-4 กับ sprites overworld สร้างผลลัพธ์ที่ไร้สาระ

### Level ID $28 (Overworld): 38 glitch worlds = บันทึก

บันทึกสัมบูรณ์ 38 รายการ glitch world ชี้ไปยังเลเวลเดียวกัน (2-1 tiles + $9F51 sprites) ทำไม? เพราะ sprite pointer $9F51 ตกไปในโซน ROM ที่ใช้เป็น padding/ข้อมูลเสียงที่ใช้ซ้ำโดย IDs จำนวนมาก

### Level ID $49 (Underground): เลเวล FDS

Tile pointer $76AE + sprite pointer $1C9D tile pointer ชี้ไปยังโซน ROM ที่สงวนไว้สำหรับเวอร์ชัน Famicom Disk System ผลลัพธ์: เลเวลที่มี tiles ที่ไม่มีอยู่ในตลับมาตรฐาน นี่คือเลเวลที่ทำให้เลเวล 52-1 และ 196-1 ปรากฏ

### Level ID $00-$02: เลเวลโบนัสจริงๆ

IDs เหล่านี้ถูกใช้โดย sub-levels ที่ถูกกฎหมายของเกม:

- **$00**: โซนใต้น้ำของ 5-2/6-2 (ใช้โดย H-1, 39-1)
- **$01**: น้ำของ 2-2/7-2 (Minus World, 36-1)
- **$02**: sub-level ของ 8-4 (136-1, 151-1, 215-1)

ความแตกต่างระหว่างเลเวล "โบนัส" ที่เข้าถึงได้ตามปกติ กับ glitch world คือ warp zones ตรวจสอบโลกปัจจุบัน:

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

Glitch worlds ที่มีหมายเลข > 8 หรือ 0 ไม่สามารถเข้าถึงได้ผ่านท่อปกติ ต้องใช้ wall clip หรือ cart swap

## ทำไมเลเวลบางตัวถึง crash: jump tables

เมื่อเกมโหลดวัตถุ tile มันใช้ประเภทเป็น index ใน **jump table**:

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

![Jump tables: ทำไมประเภทวัตถุที่ไม่ถูกต้องถึงทำให้เกม crash](/images/smb1-glitch-levels/v4-jump-table.jpg)

ถ้าวัตถุมีประเภทที่ไม่ถูกต้อง (≥12) เกมจะกระโดดไปยังพอยน์เตอร์ที่ไม่มีอยู่ในตารางนี้ **4 ผลลัพธ์ที่เป็นไปได้**:

1. **พอยน์เตอร์ที่ถูกต้อง** → วัตถุโหลดปกติ
2. **พอยน์เตอร์ไปยัง jump table อื่น** (ทับซ้อน) → วัตถุที่แตกต่างกันปรากฏ ตัวอย่าง: ประเภท 12 ชี้ไปยังตาราง Y=13 ซึ่งให้ L-pipe
3. **พอยน์เตอร์ไปยัง executable** → เรียกใช้โค้ดแบบสุ่ม (crash ที่เป็นไปได้)
4. **Placeholder ที่ชัดเจน (NOP)** → วัตถุไม่ทำอะไร (sprites บางตัวเป็นแบบนี้ สร้างศัตรูที่บินอยู่กับที่โดยไม่เคลื่อนที่)

![Glitch level ID $58: sprite pointer ชี้ไปยังที่อยู่ที่ไม่ถูกต้อง เกม crash](/images/smb1-glitch-levels/v4-glitch-58-crash.jpg)

![Glitch level ID $50: อุโมงค์เมฆ, เลเวลที่สร้างจากข้อมูลที่เสียหาย](/images/smb1-glitch-levels/v4-glitch-50.jpg)

Glitch level ID $58 (อุโมงค์ที่ crash): sprite pointer ชี้ไปยังโซนหน่วยความจำที่ **ไม่มีอยู่ใน NES โดยไม่มี mapper ROM** เกมพยายามโหลด Koopa 5 ครั้งต่อเฟรมที่ตำแหน่ง (0,0) ซึ่งทำให้ PPU อิ่มตัวและเกิด freeze

```asm
; Pourquoi ID $58 crashe :
; Sprite pointer → adresse invalide (hors espace NES standard)
; → Le jeu lit des bytes indéterminés comme des types de sprite
; → Le Koopa $00 (type invalide sans handler) boucle en appel récursif
; → Stack overflow 6502 → freeze
```

### ปริศนา pipe warp

จำการตรวจสอบ `target_world BETWEEN 1 AND 8` ได้ไหม? แม้ว่าคุณจะพบท่อใน glitch world เกมจะตรวจสอบว่าโลกที่อยู่ระหว่าง 1 และ 8 Glitch worlds มีหมายเลข > 8 (36-1, 255-1...) ดังนั้น warp จึงล้มเหลว

นี่คือเหตุผลที่ Minus World ไม่มีจุดสิ้นสุด: flagpole ไม่มีอยู่ใน sprites และท่อไม่ได้นำไปที่ไหนเลย

### เทคนิค 5 วัตถุในคอลัมน์เดียว

มี edge case ที่อนุญาตให้เกินขีดจำกัด 3 วัตถุต่อคอลัมน์ เมื่อคิวติดขัด (slots เต็ม + วัตถุถัดไปที่ไม่มี next screen flag) เกมจะ " prétraite" คอลัมน์ปัจจุบันในลูปจนกว่าจะพบวัตถุที่มี next screen flag ในแต่ละ prétraitement:

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

นี่คือสิ่งที่เรียกว่า "queue skip" และมันถูกใช้โดย romhackers บางคนเพื่อสร้างเลเวลที่หนาแน่นกว่าที่รูปแบบปกติอนุญาต

## ความแตกต่างระหว่างเวอร์ชัน

### Famicom Disk System

เวอร์ชัน FDS ของ SMB1 มี **memory map ที่แตกต่างกัน** พอยน์เตอร์เลเวลทั้งหมดถูกเลื่อน แต่ข้อมูลเหมือนกัน สิ่งที่เปลี่ยน: ดัชนีของ glitch worlds แตกต่างกันโดยสิ้นเชิง:

```
FDS World 36 → Level ID $09 (eau version de 5-3)
  → Le flagpole est présent ! On peut finir le niveau.
  → Ensuite : $27 (7-3 normal) → $44 (4-4 underground)
  → $44 est finissable → la hache fonctionne → fin du jeu !
  
Le Minus World FDS est donc un "bonus world" qui peut mener
à la complétion du jeu, contrairement à la version NES.
```

เลเวล FDS ที่ฉันชอบ: **ID $5F** เวอร์ชันใต้ดินของครึ่งหลังของ 3-3 ในอุโมงค์ต่ำ (น่าเสียดายที่มันเป็น autoscroller)

### The Lost Levels (Super Mario Bros. 2 ญี่ปุ่น)

Lost Levels เปลี่ยนแปลงหลายสิ่ง:

1. **ลำดับ tiles/sprites ที่เหมือนกัน**: ไม่มี Frankenstein levels อีกต่อไป (tiles และ sprites โหลดเลเวลเดียวกันแม้กับ ID ที่ไม่ถูกต้อง)
2. **ตารางพอยน์เตอร์ 16 บิตเดียว** แทนที่จะเป็นสองตารางแยก high/low
3. **4 ไฟล์ดิสก์**: ROM ถูกแบ่งสำหรับ FDS:
   - ไฟล์ 1: worlds 1-4
   - ไฟล์ 2: worlds 5-8
   - ไฟล์ 3: world 9 + sound engine
   - ไฟล์ 4: worlds A-D (ตารางพอยน์เตอร์ที่แตกต่างกันโดยสิ้นเชิง)
4. **Level ID เดียวกัน = 4 เลเวลที่เป็นไปได้** ตามไฟล์ที่โหลด
5. **ไม่มี glitch Tennis**: ตัวเลือก continue (ดำเนินการต่อในโลกเดียวกันหลัง game over) ทำให้ warm start ไม่จำเป็น และเกม **รีเซ็ตทันที** ถ้า world > 9
6. **วัตถุใหม่**: เห็ดพิษ, บล็อกที่มองไม่เห็น, บล็อกที่มองไม่เห็น fire flower, ท่อคว่ำ, ลม -- แต่แทรกอยู่กลางรายการที่มีอยู่ → **ไม่เข้ากันย้อนหลัง** กับ SMB1
7. **Piranha Plants แดงเสมอ** หลัง world 4, **สปริงบอร์ดเขียว** เฉพาะใน worlds 2/B/3/C/7 เท่านั้น

### Super Mario All-Stars (SNES)

พอร์ตโดยตรงพร้อมรูทีน 6502 เดียวกัน (SNES รันโค้ด NES ในโหมดที่เข้ากันได้):

- **Warp zone แก้ไข**: ไม่มี Minus World อีกต่อไป (เข้าท่อซ้ายก่อนข้อความนำไปสู่โลกที่ถูกต้อง)
- **Planting**: glitch levels ส่วนใหญ่ crash (ยกเว้น ID $6A และ 9-1)
- **วัตถุปราสาทเพิ่ม**: ทำให้ไม่ซ้ำกันมากขึ้น
- **แต่**: **4-2 wrong warp** ยังใช้งานได้ (ไม่ได้แก้ไข!)

### 4-2 wrong warp: บั๊กการวางวัตถุ

ใน 4-2 มีวัตถุ pipe transition สองชิ้น: เถาวัลย์ (warp zone) และท่อ (coin cash room) วัตถุ transition ตัวแรก (ของเถาวัลย์) ถูกวาง **ก่อนเถาวัลย์ปรากฏบนหน้าจอ** ตัวที่สอง (ท่อ) ถูกวาง **ช้าเกินไปในเลเวล**

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

### เลเวลแบบลูป

Loop (8-4, 7-4) ทำงานอย่างไร? เลเวลมี **checkpoints** พร้อมหมายเลขหน้าจอและตำแหน่ง Y ที่ hardcode:

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

## เปลี่ยนรูปแบบ ไม่ใช่โค้ด

บทเรียนที่น่าทึ่งที่สุดอย่างหนึ่งของสถาปัตยกรรมนี้คือ นักพัฒนา SMB1 ประสบความสำเร็จในการสร้างระบบเลเวลที่แสดงออกได้มาก โดยไม่เคยแตะโค้ดเรนเดอร์ 6502 การเปลี่ยนแปลงทั้งหมดระหว่างเลเวลมาจาก **ข้อมูล** (พอยน์เตอร์, วัตถุ, sprites, floor patterns) ไม่ใช่โค้ด

248 glitch worlds มีอยู่เพราะ **ตารางพอยน์เตอร์มีขนาด 128 รายการ × 4 ประเภท** และเกมไม่เคยตรวจสอบค่าที่อ่าน เมื่อพอยน์เตอร์ตกไปใน RAM เกมตีความ register ของ Mario เป็น tiles เมื่อพอยน์เตอร์ตกไปในข้อมูลเสียง เกมเล่นเพลงในรูปแบบ level design และเมื่อ jump tables overflow เกมรันอะไรก็ได้จนกว่าจะ crash

![More Super Mario Bros. Mechanics Explained -- วิดีโอที่ 4](/images/smb1-glitch-levels/yt-mechanics.jpg)

## สิ่งที่เราเรียนรู้จากทั้งหมดนี้

1. **การแยก tiles/sprites**: อิสระทั้งสองชั้นอย่างสมบูรณ์ ด้วยลำดับการจัดเก็บที่แตกต่างกันซึ่งสร้าง Frankenstein levels ที่ไม่ซ้ำกัน
2. **การบีบอัด RLE + ระบบวัตถุ**: เลเวลไม่ใช่ bitmap แต่เป็นรายการวัตถุที่วาง พร้อม floor patterns สำหรับพื้น
3. **คิว 3 slots**: ขีดจำกัดที่เข้มงวดของฮาร์ดแวร์ (และการออกแบบเลเวล)
4. **ไม่มีการตรวจสอบ**: เกมไว้วางใจพอยน์เตอร์และ jump tables ซึ่งสร้าง glitch ที่เล่นได้ หรือ crash
5. **สูงสุด 256 byte**: ขีดจำกัดของ Y register 6502 ซึ่งทำให้ข้อมูลทำซ้ำถ้าไปไกลเกินไป
6. **Warm start / cold start**: ระบบ "ดำเนินการต่อ" ที่เปิดประตูสู่ cart swap Tennis → Mario

สิ่งที่สวยงามที่สุด: ทั้งหมดนี้คือโค้ด 6502 ที่บรรจุใน 40KB ไม่มีชั้นการจัด.abstract ไม่มีการตรวจสอบหน่วยความจำ ไม่มีตัวจัดการข้อผิดพลาด ถ้าพอยน์เตอร์เสีย เกม crash และ crash เรียกว่า glitch worlds

## 3 สิ่งที่ต้องจำ

1. **Glitch worlds คือพอยน์เตอร์ที่ตกไม่ดี** -- เกมมี 128 IDs × 4 ประเภทพื้นที่ แต่มีเพียง 34 เลเวลที่ไม่ซ้ำกัน เมื่อหมายเลขโลกเสียหาย (จาก Tennis หรือ wall clip) เกมจะโหลดพอยน์เตอร์ที่ออกแบบสำหรับเลเวลอื่น และ 512 ชุดค่าผสมที่เป็นไปได้สร้างผลลัพธ์ที่ไม่คาดคิด

2. **Minus World คือบั๊ก warp รวมกับความเสียหาย** -- ท่อซ้ายใน 1-2 ถ้าเปิดใช้งานก่อนข้อความปรากฏ จะโหลด world 36 (0x24) โลกนี้ชี้ไปยัง Level ID $01 (น้ำ 2-2) เลเวลที่ไม่มี flagpole และเพราะไม่มี pipe transition สำหรับ world 36 เลเวลจึงวนลูปไม่รู้จบ ความไม่มีการตรวจสอบสร้างไอคอน

3. **Tennis → Mario, 15 ปีก่อน OoT → Paper Mario** -- RAM ของ NES รอดจากการสลับตลับ nhờตัวเก็บประจุและระบบ warm start / cold start ของ SMB1 ตัวนับก้าวของ Tennis (ที่เพิ่ม byte RAM ขณะเล่นเสียงก้าว) ตกไปที่ที่อยู่ของหมายเลขโลกพอดี หลักตัวเลขของ top score ต้องเป็น 0, byte $A5 ต้องสมบูรณ์ และเกมต้องตรวจจับ warm start -- การรวมกันของสถานการณ์ที่สมบูรณ์แบบซึ่งใช้งานได้เฉพาะกับ Tennis เท่านั้น

วิดีโอต้นฉบับของ [Retro Game Mechanics Explained](https://www.youtube.com/c/RetroGameMechanicsExplained) คืองานฝีมือระดับชั้นยอด -- ระดับรายละเอียดในการถอดรหัส 6502, แผนที่อัตโนมัติของทุกเลเวล, คำอธิบาย cart swap และ warm start ถ้าคุณยังไม่ได้ดูซีรีส์นี้ ดูมันสั้นและทุกนาทีมีคุณค่า

ซอร์สโค้ดของแผนที่มีอยู่บน [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html) และการถอดรหัส SMB1 ที่สมบูรณ์เป็น open source ใน repos หลายแห่ง 40 ปีที่แล้ว โปรแกรมเมอร์ญี่ปุ่นเขียนระบบเลเวล 6502 นี้โดยไม่มี unit test และไม่มี bug tracker และเรายังเรียนรู้สิ่งใหม่ๆ อยู่ทุกวันเมื่อเปิดดูโค้ดของพวกเขา