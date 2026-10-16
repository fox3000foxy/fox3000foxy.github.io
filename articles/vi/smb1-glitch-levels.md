---
title: "Super Mario Bros.: Định dạng level, con trỏ và 256 glitch world"
description: "Cách 128 level × 4 loại khu vực vừa trong 40KB ROM, tại sao Minus World tồn tại, và cách một trận Tennis NES có thể tải glitch world."
date: 2026-06-10
authors:
  - fox3000foxy
tags:
  - retro
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "9puGU5PBnYIT/8jgmdrUvhO349GlOlBH3RnSL0/l+KkOSqDaQG5kgTB+tqwU55vNf3Ppu9BiWqF9jWOdFIr7xw=="
---

## Giới thiệu

Super Mario Bros., đó là 40 kilobyte ROM. Tám thế giới, 32 level, kẻ thù, nhạc, power-ups, tất cả đều chứa trong đó.

Nhưng nếu bạn mở giả lập và thay đổi đúng byte, bạn có thể tải level 36-1. Hoặc 255-1. Hoặc rơi vào một thế giới nơi mọi thứ đều được tạo từ sprite của Bowser và ống nước dẫn đến hư không.

Những glitch world này tồn tại vì lý do đơn giản: hệ thống lưu trữ level của SMB1 là một kỳ quan tối ưu hóa 8-bit, và khi bạn buộc game đọc ở nơi không nên đọc, kết quả sẽ rất hấp dẫn.

Retro Game Mechanics Explained đã thực hiện một loạt 4 video về chủ đề này -- chúng ta sẽ tổng hợp chúng thành một lần đi sâu vào mã 6502 của game bán chạy nhất thời đại.

![GLITCH OBJECTS -- tiêu đề loạt phim RGMechEx về các cơ chế ẩn của SMB1](/images/smb1-glitch-levels/title-card.jpg)

![World 9-1 -- màn hình tiêu đề của glitch world đầu tiên có thể truy cập qua việc hoán đổi cartridge Tennis](/images/smb1-glitch-levels/v1-title-9-1.jpg)

## Warm start: Tại sao RAM của Tennis tồn tại trong SMB1

Trước khi nói về lưu trữ level, cần hiểu cách SMB1 khởi động. Bởi vì lỗi cart swap NES Tennis dựa hoàn toàn vào **hệ thống phát hiện warm start / cold start** của game.

### 41 byte được bảo toàn

Khi SMB1 phát hiện **cold start** (lần bật nguồn đầu tiên hoặc tắt/mở nguồn), nó xóa toàn bộ RAM. Nhưng khi phát hiện **warm start** (nhấn nút reset, không tắt nguồn), nó bảo toàn một vùng nhớ **41 byte**:

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

41 byte này phục vụ một chức năng duy nhất: cho phép người chơi **tiếp tục ở cùng thế giới sau khi game over**. Nếu bạn chết ở 6-3, game ghi thế giới 6 vào byte bắt đầu, và ở màn hình tiêu đề, nếu giữ A + Start, bạn bắt đầu lại ở 6-1.

![41 byte được bảo toàn trong RAM khi warm start -- TOP SCORE, MARIO SCORE, TIMER, WORLD SELECT, CONTINUE WORLD, và byte ma thuật $A5](/images/smb1-glitch-levels/v1-memory-state.jpg)

### Kiểm tra kép warm start

![Cold start so với warm start -- sơ đồ phát hiện reset](/images/smb1-glitch-levels/v1-warm-start.jpg)

Khi SMB1 khởi động, nó không kiểm tra một tiêu chí mà là **hai**:

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

![Kiểm tra byte $A5 và các chữ số top score -- cốt lõi của warm start](/images/smb1-glitch-levels/v1-a5-byte.jpg)

Tại sao kiểm tra kép? Bởi vì byte $A5 có thể xuất hiện ngẫu nhiên (một game khác để lại giá trị này, hoặc trạng thái mặc định của chip RAM). Bằng cách kiểm tra các chữ số top score hợp lệ (0-9), chúng ta đảm bảo dữ liệu nhất quán.

### Tại sao Tennis là game duy nhất hoạt động

Khi cắm SMB1 lần đầu (cold start), game:
1. Xóa toàn bộ RAM → top score = 0, world byte = 0
2. Ghi $A5 tại địa chỉ $0787

Sau đó, hoán đổi sang Tennis mà không tắt máy. Tennis:
- **Không xóa RAM khi khởi động** (ít game NES làm vậy)
- **Không ghi vào các byte top score** → chúng vẫn là 0 (hợp lệ)
- **Không chạm vào byte $A5** → nó vẫn còn
- **Sử dụng địa chỉ $075F** cho bộ đếm bước chân của người chơi

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

Khi cắm lại SMB1:
1. Byte $A5 vẫn còn (Tennis không chạm vào nó)
2. Các chữ số top score vẫn là 0 (hợp lệ)
3. World byte giờ có giá trị 8+ (được tăng bởi các bước chân Tennis)
4. SMB1 phát hiện warm start → bảo toàn world byte bị hỏng
5. Giữ A + Start → world 9-1, world A-1, world 36-1, v.v.

### Tại sao phải khởi động Mario trước Tennis

Một điểm tinh tế: phải khởi động SMB1 trước, rồi Tennis, rồi SMB1 lại. Nếu bắt đầu trực tiếp với Tennis, byte $A5 sẽ không bao giờ được ghi (Tennis không ghi $A5), nên việc phát hiện warm start sẽ thất bại và RAM sẽ bị xóa.

![Bộ đếm bước chân Tennis: mỗi footstep tăng world byte](/images/smb1-glitch-levels/v1-footstep.jpg)

![Truy cập Glitch Worlds qua NES Tennis -- video giải thích cart swap](/images/smb1-glitch-levels/yt-tennis.jpg)

## Cách SMB1 lưu trữ các level trong 40KB

Nintendo R&D4 phải giải quyết một vấn đề đơn giản trên bề mặt: biểu diễn các level cuộn ngang với tile, kẻ thù, item, tất cả trong ngân sách ROM cực kỳ chặt chẽ.

Giải pháp là sự tách biệt thành hai lớp dữ liệu **hoàn toàn độc lập**:

### Tile layout (bản đồ level)

Mỗi level được định nghĩa bằng một con trỏ tới cấu trúc nén tile trong ROM. Nén đơn giản nhưng thông minh: byte "điều khiển" theo sau bởi 1-3 byte dữ liệu.

Định dạng tile sử dụng hệ thống **runs** (giống RLE):

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

Mỗi level chứa 13 hàng × 16 cột tile (13×16 = 208 tile hiển thị). Nhưng định dạng nén cho phép giảm đáng kể -- ví dụ, bầu trời và cột trống gần như không chiếm dung lượng.

Vòng lặp render bằng 6502:

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

### Sprite layout (kẻ thù và vật thể)

Song song đó, kẻ thù và vật thể (khối ?, ống nước, goomba, koopa) được lưu trữ trong cấu trúc hoàn toàn riêng biệt. Mỗi spawn được định nghĩa bởi 2 byte:

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

Mỗi level có thể tham chiếu tối đa 5 trang sprite khác nhau (hay 5 "màn hình" 16 cột), nhưng trong thực tế hầu hết level chỉ dùng 2-3.

### Bảng con trỏ

Thiết kế thiên tài nằm ở bảng con trỏ. Mỗi level được lưu trữ dưới dạng **cặp** địa chỉ ROM:

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

128 mục mỗi bảng. 4 loại khu vực. **512 tổ hợp có thể**, nhưng chỉ một phần nhỏ được sử dụng bởi game chính thức. Phần còn lại là RAM chưa khởi tạo hoặc dữ liệu được giải thích sai thành con trỏ.

Khi game tải level, nó làm như sau:

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

Không có kiểm tra. Không kiểm tra con trỏ có hợp lệ không. Game đọc địa chỉ trong bảng và nén dữ liệu tại địa chỉ đó, xong.

![Level ID $06 (Water) -- 9-1, phiên bản dưới nước của 6-2](/images/smb1-glitch-levels/lvl-06-9-1.png)

![Bảng Level ID: 128 mục có thể, 34 được gán](/images/smb1-glitch-levels/v2-level-id-table.jpg)

![Thứ tự khác nhau của con trỏ tile và sprite -- nguyên nhân tạo ra Frankenstein level](/images/smb1-glitch-levels/v2-pointer-tables.jpg)

### 34 level độc đáo và hệ thống ID 7-bit

![Chip RAM của NES (MB8416A) -- chip này giữ dữ liệu khi hoán đổi cartridge](/images/smb1-glitch-levels/v1-ram-chip.jpg)

SMB1 không có 32 level, mà là **34 level độc đáo**. Nhiều level là bản sao (5-3 = 1-3 nhưng có Bullet Bill) được đánh dấu bằng cờ "hard mode". Các level độc đáo thực sự:

- **Nước** (Loại 0): 3 level (2-2, 7-2, vùng bonus 5-2/6-2)
- **Overworld** (Loại 1): 22 level (bao gồm 2 phòng mây bonus)
- **Underground** (Loại 2): 3 level (bao gồm các phòng bonus ngầm)
- **Castle** (Loại 3): 6 level
- \+ 1 phòng cutscene (trước các level ngầm/dưới nước)
- \+ 1 warp zone của 4-2

Mỗi level có một ID trên **7 bit**. 5 bit thấp = số trong nhóm con, 2 bit cao = loại khu vực:

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

**128 ID có thể** ($00-$7F), chỉ 34 được gán cho level thật. Các ID chưa sử dụng trỏ đến bất kỳ thứ gì.

### Bảng con trỏ: hai danh sách, hai thứ tự

Con trỏ tile và sprite không được lưu trữ cùng thứ tự. Code sử dụng hai danh sách 16-bit riêng biệt (byte cao / byte thấp trong hai bảng khác nhau):

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

Tại sao thứ tự khác nhau? Không có lý do kỹ thuật -- có thể dữ liệu được sắp xếp như vậy trong quá trình phát triển. Nhưng nó tạo ra hậu quả hấp dẫn: khi ID level không hợp lệ, con trỏ tile và sprite tải các level *khác nhau*, tạo ra **Frankenstein level**.

Để di chuyển giữa hai danh sách này, game sử dụng các **bảng offset** nhỏ (như mục lục):

```asm
; Tables d'offset par type (Water, Overworld, Underground, Castle)
; Chaque entrée = index de début dans la liste correspondante

SpriteOffsetTable:
  .byte $1F, $06, $1C, $00    ; Water=31, Overworld=6, Underground=28, Castle=0

TileOffsetTable:
  .byte $00, $03, $19, $1C    ; Water=0, Overworld=3, Underground=25, Castle=28
```

Để tải level 6-2 (ID $23, Overworld số 3):

```asm
; 1. Type = 01 (Overworld) → index dans table d'offset = 1
; 2. Sprite offset = SpriteOffsetTable[1] = 6
;    Index final = 6 + 3 (numéro de niveau) = 9 → 10ème pointeur sprites
; 3. Tile offset = TileOffsetTable[1] = 3
;    Index final = 3 + 3 = 6 → 7ème pointeur tiles
; 4. Résultat : pointeur tiles $A619 + pointeur sprites $9ED0 = 6-2 ✓
```

Bây giờ, điều gì xảy ra với ID không hợp lệ như $43 (Underground số 3, không tồn tại)?

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

![Level ID $43 -- Frankenstein level: tile 1-4 + sprite nước 5-2](/images/smb1-glitch-levels/lvl-43-frankenstein.png)

![Exploring Glitch Level Pointers -- bảng offset được giải thích](/images/smb1-glitch-levels/yt-pointers.jpg)

![World index table -- khi overflow của world 9 tạo glitch level](/images/smb1-glitch-levels/v2-world-index-table.jpg)

### World index table: Tại sao world 9 bị overflow

Có một bảng ROM 8 byte cho index của level đầu tiên mỗi thế giới (1-8). Và ngay sau đó là bảng 36 Level ID của tất cả level theo thứ tự chơi.

```asm
; WorldIndexTable (8 bytes)
  .byte 0, 5, 10, 15, 20, 25, 28, 33
;   -> Monde 1 commence au niveau 0
;   -> Monde 2 commence au niveau 5
;   -> Monde 8 commence au niveau 33

; LevelIDTable (36 bytes)
  .byte $25, $28, $29, $26, $24, ... ; les 36 Level IDs
```

Khi cố tải world 9, game đọc byte thứ 9 của WorldIndexTable... không tồn tại. Nó tràn 1 byte vào LevelIDTable, đọc giá trị $25, rồi dùng $25 làm index trong LevelIDTable (mục thứ 37) -- điều này tràn thêm 2 byte vào SpriteOffsetTable, và đọc giá trị 6.

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

Với world G (16), overflow đi xa hơn nữa và rơi vào Level ID $01, là level cutscene đứng trước 1-2:

```asm
; World G (16) :
;   WorldIndexTable[15] → lit $01 dans LevelIDTable
;   LevelIDTable[1] = $29 (cutscene 1-2)
;   → world G-1 = la cutscene d'entrée de 1-2
```

## Tại sao glitch world tồn tại

Game có 32 level "hợp pháp" (8 thế giới × 4 level). Nhưng bảng con trỏ có 128 mục mỗi loại khu vực. Các mục vượt quá level 32 chứa dữ liệu ROM tại các địa chỉ đó -- đôi khi là level khác, đôi khi là dữ liệu âm thanh, đôi khi là RAM, đôi khi là bất kỳ thứ gì.

![Level ID $01 Water (Minus World) -- tile pointer $AE45, sprite pointer $A171](/images/smb1-glitch-levels/minus-world.png)

### Level ID $01 + AreaType 0 = Minus World

Nổi tiếng nhất trong các glitch world. Level ID $01 ở AreaType 0 (nước) trỏ đến:

- **Tile pointer: $AE45** → vùng dưới nước của 2-2/7-2
- **Sprite pointer: $A171** → sprite của 2-2/7-2

Kết quả: một level nước giống 2-2, nhưng lặp vô hạn vì cột cờ không tồn tại. Không có kết thúc level, không có lối ra.

Đó là level 36-1 (hay 36-1 trong thế giới $-1).

![Warm start check của SMB1 -- chính nó cho phép Minus World tồn tại](/images/smb1-glitch-levels/v4-minus-world.jpg)

```asm
; Pourquoi le flagpole manque dans le Minus World :
; Les sprites de 2-2/7-2 ($A171) n'ont pas de flagpole
; dans leur séquence. Le jeu cherche le sprite $FD (flagpole)
; mais ne le trouve jamais → boucle infinie
;
; Le jeu continue de générer le niveau à l'infini
; jusqu'à ce que le timer atteigne zéro.
```

### Các con trỏ trỏ đến RAM

Khi tile pointer hoặc sprite pointer trỏ đến địa chỉ RAM ($00-$7F) thay vì ROM, game cố giải thích các thay đổi liên tục của RAM như tile:

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

Khi trang zero thay đổi (vì Mario di chuyển, timer chạy, v.v.), "sprite" của level cũng thay đổi. Đó là lý do một số glitch world có kẻ thù nhấp nháy và biến đổi liên tục.

![Level ID $03 Water -- sprite pointer $009D trỏ đến RAM, level không thể chơi](/images/smb1-glitch-levels/level-03-water.png)

### Level ID $36: Level trống (Overworld)

Level ID $36 ở Overworld:

- **Tile pointer: $AC35** (1-2)
- **Sprite pointer: $A0D8** (1-2)

Kết quả: không gì cả. Game tải level nhưng nó được đánh dấu "không có level" trong danh mục của RGMechEx. Tile có thể hợp lệ nhưng sprite trỏ đến nơi tạo ra level trống hoặc không hoạt động.

### Level ID $1D (Castle): Vua crash

Level ID $1D ở Castle:

- **Tile pointer: $A210** (4-4)
- **Sprite pointer: $7EA0** (RAM!)

Sprite pointer ở RAM = sprite chưa xác định. Game cố hiển thị Spiny ball hoặc Bullet Bill blaster ở hàng tile đầu tiên. Nó crash ngay lập tức.

```asm
; Quand le sprite pointer pointe vers la RAM,
; le jeu décompresse des bytes qui changent tout le temps
; comme des instructions "spawn". Le résultat :
; - Apparition d'objets inexistants (valeur undefined)
; - Crash PPU quand le sprite NES essaie d'afficher un tile invalide
; - Freeze complet de la console
```

## 256 glitch world được phân loại

RGMechEx đã viết script tạo bản đồ của **tất cả level**, cho 4 loại khu vực, mỗi loại 128 ID.

Bộ đếm thế giới 8 bit (0-255). Thế giới 1-8 hợp pháp. Còn lại **248 glitch world** tiềm năng. Mỗi glitch world tương ứng với level đầu tiên của thế giới đó, và Level ID của nó được tính bởi cơ chế overflow của WorldIndexTable.

![Bảng glitch world -- 248 thế giới bị hỏng, 68 level đầu tiên có thể truy cập](/images/smb1-glitch-levels/v3-glitch-worlds-table.jpg)

Trong 128 ID có thể, chỉ **68 là "level đầu tiên" của một thế giới** (có thể truy cập qua số glitch world). 60 ID còn lại là level 2+ hoặc không thể truy cập.

| Loại | ID hợp lệ có thể chơi | ID gây crash | ID trống |
|------|---------------------|-------------------|-----------|
| Water (0)    | ~20  | ~60  | ~48  |
| Overworld (1)| ~30  | ~55  | ~43  |
| Underground (2) | ~15 | ~65 | ~48  |
| Castle (3)   | ~25  | ~58  | ~45  |

Nhiều ID dẫn đến cùng level vì con trỏ rơi vào cùng địa chỉ ROM. Ví dụ Level ID $28 (Overworld) -- tile pointer $A7CD (2-1) -- xuất hiện trong **38 glitch world khác nhau**, vì sprite pointer $9F51 trỏ đến vùng ROM được dùng làm padding/dữ liệu âm thanh tái sử dụng bởi nhiều ID.

![Bản đồ level ID $28 (Overworld) -- tile 2-1 với sprite bình thường, 38 glitch world](/images/smb1-glitch-levels/level-28-overworld.png)

![Super Mario Bros. Glitch Levels Explained -- video thứ 3](/images/smb1-glitch-levels/yt-levels.jpg)

### 6 glitch level thực sự độc đáo

Trong 19 ID glitch level có thể truy cập, chỉ **6 không crash ngay khi tải**:

| Thế giới | Level ID | Mô tả |
|-------|----------|-------------|
| E-1 (224) | $50 | Chỉ một ? block phía trên vực thẳm. Mario chết ngay lập tức. |
| W | $57 | Mario spawn bị chặn, không thể di chuyển. |
| 42 (133) | $50 | Đường hầm mây giam Mario nếu đi quá xa. |
| 62 (131, 240) | $4D | Lâu đài đóng băng: Mario spawn ở trên, không thể rơi → bị chặn. |
| 127 | $4B | Đường hầm ngầm, nhưng crash nếu đi quá xa. |
| 137 | $4B | Kích hoạt cuộn tự động của cutscene. Mario gặp một brick block duy nhất chặn mãi mãi. |

![Level ID $50 (đường hầm mây) -- glitch world 42-1 và E-1](/images/smb1-glitch-levels/lvl-50-cloud.png)
![Level ID $4D (lâu đài) -- world 62-1, Mario bị chặn khi spawn](/images/smb1-glitch-levels/lvl-4D-castle.png)
![Level ID $4B (đường hầm) -- world 127-1, crash nếu đi quá xa](/images/smb1-glitch-levels/lvl-4B-tunnel.png)

Sáu glitch world trong 248 tạo ra điều gì đó thực sự mới. Phần còn lại là level bình thường với sai loại khu vực, hoặc màn hình đen.

## Định dạng level chi tiết

Đi vào định dạng dữ liệu level chính xác, để hiểu tại sao glitch level đứng vững (hay không).

### Header level: 2 byte, 6 thuộc tính

Mỗi level bắt đầu bằng header 2 byte kiểm soát 6 thuộc tính:

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

Thuộc tính modifier kiểm soát các biến thể hình ảnh: sóng trên cùng level nước, nền gạch của 8-3, bảng màu đêm của 4-3, tuyết của 6-2, v.v.

### Vật thể tile: 2 byte, cờ Next Screen, hàng đợi 3 vị trí

Sau header đến danh sách **vật thể tile**, mỗi vật thể 2 byte. Byte $FD đánh dấu kết thúc danh sách.

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

Khi bit "next screen" được đặt, cột làm việc hiện tại tăng 1. Điều này cho phép đặt vật thể vượt quá 16 cột đầu tiên. Các vật thể phải được liệt kê **theo thứ tự** (trái sang phải) vì game tải chúng tuần tự:

```asm
; La routine de chargement a DEUX phases par colonne :
; Phase 1 : chercher les nouveaux objets qui commencent sur cette colonne
;            et les ajouter à la file d'attente (queue)
; Phase 2 : traiter chaque objet dans la queue en dessinant les tiles,
;            et retirer ceux qui finissent sur cette colonne
```

Hàng đợi có đúng **3 vị trí**. Hậu quả trực tiếp: không thể có hơn 3 vật thể bắt đầu trên cùng cột. Nếu hàng đợi đầy, vật thể thứ 4 bị bỏ qua và không bao giờ được tải.

Đó là lý do level được thiết kế tốt tránh xếp quá nhiều vật thể. Ví dụ trong 1-2: cột có block 1up trên trần + gạch bên cạnh được chia thành hai vật thể riêng biệt để tuân thủ giới hạn 3.

### Vị trí Y đặc biệt: 12, 13, 14, 15

Khi Y=12, vật thể không có vị trí Y (nó được hardcode theo loại):

```asm
; Y=12 : objets sans Y position
;   Type 0 : trou (supprime le sol)
;   Type 1 : rope de plateforme mobile
;   Types 2-4 : ponts à Y fixe
;   Type 5 : trou avec eau/lave
;   Types 6-7 : rangées de ? blocks
```

Khi Y=13, hai nhóm con. Nếu bit 6 của byte 1 bằng 1:

```asm
; Y=13, bit6=1 : objets spéciaux
;   0 = L-pipe (cutscene), 1 = flagpole, 2-3 = pont/axe/hamer (fin château)
;   4 = stop screen, 5 = random enemies, 6 = loop level, 7+ = crash possible
```

Nếu bit6=0, 5 bit thấp mã hóa một **screen skip** (nhảy trực tiếp đến màn hình N, không qua cờ next screen từng cái một).

Khi Y=14: nguyên lý tương tự với bit6=1 để thay đổi thuộc tính modifier, bit6=0 để thay đổi nền + floor pattern.

### Floor pattern: 16 mẫu sàn

Sàn level không được tạo từ vật thể riêng lẻ. SMB1 sử dụng **floor pattern**, mẫu nền áp dụng cho tất cả cột cho đến khi thay đổi tiếp theo:

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

Đó là lý do lỗ là vật thể: chúng ghi đè floor pattern ở cột cụ thể, không cần thay đổi pattern cho phần còn lại.

### Giới hạn 256 byte và repeat

Tất cả dữ liệu tile của level chứa trong **tối đa 256 byte**. Register Y của 6502 được dùng làm index, và nó 8 bit. Nếu game đến cuối dữ liệu mà không tìm thấy byte $FD, **nó lặp lại từ đầu** và lặp 256 byte vô hạn:

```asm
; Index Y = 8 bits → max 256 bytes de données tiles
; Si Y overflow (255 → 0) sans rencontrer $FD → repeat
; Même chose pour les sprites, mais les objets pipe (3 bytes)
; décalent la parité de l'index à chaque chargement.
```

Một số level exploit exploit repeat này để tạo level kéo dài "vô thời hạn".

### Hệ thống sprite: 2 byte + chuyển tiếp pipe

Sprite theo định dạng tương tự, nhưng không có header và có vài khác biệt chính. Byte $FF đánh dấu kết thúc danh sách.

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

Bit thấp của byte 1 là **hard level flag**: nếu đặt bằng 1, sprite chỉ xuất hiện ở level ≥ 5-3. Các level "hard mode" được tạo theo cách này.

Vị trí Y 15 = **screen skip** (giống tile). Vị trí Y 14 = **chuyển tiếp pipe** (3 byte):

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

Sprite **không có hệ thống hàng đợi**. Giới hạn duy nhất là không thể có hơn 4 sprite tải đồng thời ở vùng spawn (ngay ngoài màn hình bên phải). Nhiều hơn, sprite bị bỏ qua.

## Cách truy cập glitch world

Có hai phương pháp chính.

### Phương pháp truyền thống: wall clip

Wall clip (đi xuyên tường) cho phép thoát level bình thường và đi đến warp zone ẩn. Bằng cách thao túng bộ đếm thế giới qua RAM, bạn có thể tải bất kỳ Level ID nào.

Kỹ thuật:
1. World 1-2: đi vào ống ẩn cuối level
2. Thực hiện wall clip ở tường bên phải
3. Đi trong khoảng trống đến vùng warp
4. Game giải thích giá trị như thế giới

Nhưng phương pháp này chỉ truy cập được một phần nhỏ glitch world.

### Phương pháp cực đoan: NES Tennis cart swap

Xem phần "Warm start" ở trên để biết chi tiết. Tóm lại: bộ đếm bước chân Tennis ghi vào cùng byte RAM với thế giới bắt đầu của SMB1, và việc phát hiện warm start bảo toàn giá trị đó.

### Góc cho người hack: code để khám phá tất cả

Nếu bạn muốn tự khám phá tất cả glitch trong giả lập, bạn có thể patch Level ID trực tiếp:

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

RGMechEx đã phát hành danh sách đầy đủ 128 level × 4 loại với bản đồ tự động tạo trên [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html). Mỗi mục hiển thị tile pointer, sprite pointer, và bản đồ hình ảnh của level.

## Các level khó hiểu nhất

### Level ID $1F (Water): 15 glitch world trong một

Tile pointer $A302 (3-4) kết hợp với sprite pointer $02A0 tạo ra 15 glitch world khác nhau (D-1, J-1, Y-1, Z-1, 55-1, 73-1...). Giải thích: sprite pointer trỏ đến vùng ROM chứa dữ liệu gần đủ với sprite hợp lệ để tạo kết quả chơi được, nhưng sự kết hợp tile lâu đài 3-4 với sprite overworld tạo ra kết xuất vô lý.

### Level ID $28 (Overworld): 38 glitch world = kỷ lục

Kỷ lục tuyệt đối. 38 mục glitch world trỏ đến cùng level (tile 2-1 + sprite $9F51). Tại sao? Bởi vì sprite pointer $9F51 rơi vào vùng ROM được dùng làm padding/dữ liệu âm thanh tái sử dụng bởi nhiều ID.

### Level ID $49 (Underground): Level FDS

Tile pointer $76AE + sprite pointer $1C9D. Tile pointer trỏ đến vùng ROM dành riêng cho phiên bản Famicom Disk System. Kết quả: level với tile không tồn tại trong cartridge chuẩn. Đây là level tạo ra level 52-1 và 196-1.

### Level ID $00-$02: Level bonus thật sự

Các ID này được dùng bởi các level con hợp pháp của game:

- **$00**: vùng dưới nước 5-2/6-2 (dùng bởi H-1, 39-1)
- **$01**: nước 2-2/7-2 (Minus World, 36-1)
- **$02**: level con 8-4 (136-1, 151-1, 215-1)

Sự khác biệt giữa level "bonus" có thể truy cập bình thường và glitch world là warp zone kiểm tra thế giới hiện tại:

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

Các glitch world có số > 8 hoặc 0 không thể được tiếp cận qua ống nước bình thường. Cần wall clip hoặc cart swap.

## Tại sao một số level crash: Jump table

Khi game tải vật thể tile, nó dùng loại làm index trong một **jump table**:

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

![Jump table: tại sao loại vật thể không hợp lệ khiến game crash](/images/smb1-glitch-levels/v4-jump-table.jpg)

Nếu vật thể có loại không hợp lệ (≥12), game nhảy đến con trỏ không tồn tại trong bảng này. **4 kết quả có thể**:

1. **Con trỏ hợp lệ** → vật thể tải bình thường
2. **Con trỏ đến jump table khác** (chồng lấn) → vật thể khác xuất hiện. Ví dụ: loại 12 trỏ đến bảng Y=13, tạo ra L-pipe.
3. **Con trỏ đến mã thực thi** → thực thi code ngẫu nhiên (crash có thể)
4. **Placeholder rõ ràng (NOP)** → vật thể không làm gì (một số sprite như vậy, tạo ra kẻ thù bay tại chỗ không di chuyển)

![Glitch level ID $58: sprite pointer trỏ đến địa chỉ không hợp lệ, game crash](/images/smb1-glitch-levels/v4-glitch-58-crash.jpg)

![Glitch level ID $50: đường hầm mây, level được tạo bởi dữ liệu bị hỏng](/images/smb1-glitch-levels/v4-glitch-50.jpg)

Glitch level ID $58 (đường hầm gây crash): sprite pointer trỏ đến vùng nhớ **không tồn tại trên NES không có mapper ROM**. Game cố tải cùng Koopa 5 lần mỗi frame ở vị trí (0,0), làm bão hòa PPU và gây freeze.

```asm
; Pourquoi ID $58 crashe :
; Sprite pointer → adresse invalide (hors espace NES standard)
; → Le jeu lit des bytes indéterminés comme des types de sprite
; → Le Koopa $00 (type invalide sans handler) boucle en appel récursif
; → Stack overflow 6502 → freeze
```

### Nghịch lý pipe warp

Nhớ kiểm tra `target_world BETWEEN 1 AND 8`. Ngay cả khi bạn tìm thấy ống trong glitch world, game kiểm tra thế giới đích nằm giữa 1 và 8. Glitch world có số > 8 (36-1, 255-1...), nên warp thất bại.

Đó cũng là lý do Minus World không có kết thúc: cột cờ không có trong sprite, và ống không dẫn đến đâu cả.

### Trick 5 vật thể trong một cột

Có một edge case cho phép vượt quá giới hạn 3 vật thể mỗi cột. Khi hàng đợi bị chặn (vị trí đầy + vật thể tiếp theo thiếu cờ next screen), game "xử lý trước" cột hiện tại trong vòng lặp cho đến khi tìm được vật thể có cờ next screen. Trong mỗi lần xử lý trước:

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

Đây được gọi là "queue skip" và được một số romhacker sử dụng để tạo level dày hơn định dạng cho phép.

## Sự khác biệt giữa các phiên bản

### Famicom Disk System

Phiên bản FDS của SMB1 có **bộ nhớ khác**. Tất cả con trỏ level bị dịch chuyển, nhưng dữ liệu giống nhau. Điều thay đổi: chỉ số glitch world hoàn toàn khác:

```
FDS World 36 → Level ID $09 (eau version de 5-3)
  → Le flagpole est présent ! On peut finir le niveau.
  → Ensuite : $27 (7-3 normal) → $44 (4-4 underground)
  → $44 est finissable → la hache fonctionne → fin du jeu !
  
Le Minus World FDS est donc un "bonus world" qui peut mener
à la complétion du jeu, contrairement à la version NES.
```

Level FDS yêu thích của tôi: **ID $5F**, phiên bản ngầm của nửa sau 3-3 ở đường hầm thấp (tiếc là autoscroller).

### The Lost Levels (Super Mario Bros. 2 Nhật Bản)

Lost Levels thay đổi nhiều thứ:

1. **Thứ tự tile/sprite giống nhau**: không còn Frankenstein level (tile và sprite tải cùng level ngay cả với ID không hợp lệ)
2. **Một bảng con trỏ 16-bit** thay vì hai bảng riêng high/low
3. **4 file disk**: ROM đã được chia cho FDS:
   - File 1: thế giới 1-4
   - File 2: thế giới 5-8
   - File 3: thế giới 9 + sound engine
   - File 4: thế giới A-D (bảng con trỏ hoàn toàn khác)
4. **Cùng Level ID = 4 level có thể** tùy file được tải
5. **Không còn glitch Tennis**: tùy chọn continue (tiếp tục cùng thế giới sau game over) khiến warm start vô dụng, và game **reset ngay lập tức** nếu world > 9
6. **Vật thể mới**: nấm độc, block vô hình, block vô hình fire flower, ống đảo ngược, gió -- nhưng được chèn vào giữa danh sách hiện tại → **không tương thích ngược** với SMB1
7. **Piranha Plants luôn đỏ** sau world 4, **springboard xanh** chỉ ở thế giới 2/B/3/C/7

### Super Mario All-Stars (SNES)

Port trực tiếp với cùng routines 6502 (SNES thực thi mã NES ở chế độ tương thích):

- **Warp zone đã sửa**: không còn Minus World (vào ống bên trái trước văn bản dẫn đến đúng thế giới)
- **Crash**: hầu hết glitch level crash (trừ ID $6A và 9-1)
- **Vật thể lâu đài được thêm**: render độc đáo hơn
- **Nhưng**: **4-2 wrong warp** vẫn hoạt động (chưa patch!)

### 4-2 wrong warp: Lỗi đặt vật thể

Trong 4-2, có hai vật thể chuyển tiếp pipe: dây leo (warp zone) và ống (phòng coin cash). Vật thể chuyển tiếp đầu tiên (dây leo) được đặt **trước rất lâu** khi dây leo xuất hiện trên màn hình. Vật thể thứ hai (ống) được đặt **quá muộn trong level**.

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

### Level lặp

Loop hoạt động như thế nào (8-4, 7-4)? Level có **checkpoint** với số màn hình và vị trí Y hardcode:

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

## Thay đổi định dạng, không thay đổi code

Một trong những bài học hấp dẫn nhất của kiến trúc này là các nhà phát triển SMB1 đã tạo được hệ thống level rất biểu cảm mà không bao giờ chạm vào code render 6502. Tất cả sự khác biệt giữa level đến từ **dữ liệu** (con trỏ, vật thể, sprite, floor pattern), không phải code.

248 glitch world tồn tại vì **bảng con trỏ được thiết kế cho 128 mục × 4 loại**, và game không bao giờ kiểm tra giá trị nó đọc. Khi con trỏ rơi vào RAM, game giải thích các register của Mario như tile. Khi con trỏ rơi vào dữ liệu âm thanh, game phát nhạc dưới dạng level design. Và khi jump table bị overflow, game thực thi bất kỳ thứ gì cho đến khi crash.

![More Super Mario Bros. Mechanics Explained -- video thứ 4](/images/smb1-glitch-levels/yt-mechanics.jpg)

## Những gì có thể học từ đây

1. **Tách biệt tile/sprite**: độc lập hoàn toàn giữa hai lớp, với thứ tự lưu trữ khác nhau tạo ra Frankenstein level độc đáo
2. **Nén RLE + hệ thống vật thể**: level không phải bitmap mà là danh sách vật thể được đặt, với floor pattern cho sàn
3. **Hàng đợi 3 vị trí**: giới hạn cứng của phần cứng (và thiết kế level)
4. **Không kiểm tra**: game tin vào con trỏ và jump table, tạo ra glitch chơi được hoặc crash
5. **Tối đa 256 byte**: giới hạn của register Y 6502, khiến dữ liệu lặp lại nếu đi quá xa
6. **Warm start / cold start**: hệ thống "tiếp tục" mở đường cho cart swap Tennis → Mario

Điều tuyệt vời nhất: tất cả là code 6502 chứa trong 40KB. Không tầng trừu tượng, không kiểm tra truy cập bộ nhớ, không trình quản lý ngoại lệ. Nếu con trỏ hỏng, game crash. Và crash, chúng ta gọi là glitch world.

## 3 điều cần nhớ

1. **Glitch world là con trỏ rơi sai chỗ** -- Game có 128 ID × 4 loại khu vực, nhưng chỉ 34 level độc đáo. Khi world number bị hỏng (do Tennis hoặc wall clip), game tải con trỏ được thiết kế cho level khác, và 512 tổ hợp có thể tạo ra kết quả không thể đoán trước.

2. **Minus World là lỗi warp kết hợp với hỏng dữ liệu** -- ống bên trái trong 1-2, nếu kích hoạt trước khi văn bản xuất hiện, tải world 36 (0x24). World này trỏ đến Level ID $01 (nước 2-2), level không có cột cờ. Và vì không có chuyển tiếp pipe cho world 36, level lặp vô hạn. Sự thiếu kiểm tra tạo ra biểu tượng.

3. **Tennis → Mario, 15 năm trước OoT → Paper Mario** -- RAM của NES tồn tại qua hoán đổi cartridge nhờ tụ điện và hệ thống warm start / cold start của SMB1. Bộ đếm bước chân Tennis (tăng byte RAM khi phát âm thanh bước chân) rơi đúng vào địa chỉ world number. Cần các chữ số top score giữ ở 0, byte $A5 nguyên vẹn, và game phát hiện warm start -- một sự trùng hợp hoàn hảo chỉ hoạt động với Tennis.

Video gốc của [Retro Game Mechanics Explained](https://www.youtube.com/c/RetroGameMechanicsExplained) là một công trình phi thường -- mức độ chi tiết về disassemble 6502, bản đồ tự động của tất cả level, giải thích cart swap và warm start. Nếu bạn chưa xem loạt phim này, hãy xem, nó ngắn và mỗi phút đều đậm đặc.

Code nguồn bản đồ có trên [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html), và bản disassemble đầy đủ SMB1 là open source trên nhiều repo. 40 năm trước, các lập trình viên Nhật Bản đã viết hệ thống level này bằng 6502 với zero unit test và zero bug tracker, và chúng ta vẫn học được điều gì đó khi mở code của họ ngày nay.
