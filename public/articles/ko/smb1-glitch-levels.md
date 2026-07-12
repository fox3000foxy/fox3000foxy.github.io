---
title: "Super Mario Bros.: 레벨 포맷, 포인터, 그리고 256개의 글리치 월드"
description: "128개 레벨 × 4가지 영역 타입이 40KB ROM에 어떻게 들어가는지, Minus World가 왜 존재하는지, 그리고 NES 테니스 경기가 글리치 월드를 로드할 수 있는 이유."
date: 2026-06-10authors:
  - fox3000foxy
tags:
  - retro
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "w5MVenvWirmnOQSW6h3IBqqBHFIzlrJysxWU+7V4+amIEhtkTKoaDtobKif9V/P+Rr2wDJse+km2BkTREsK3bg=="
---

## 소개

Super Mario Bros.는 40KB ROM로 이루어져 있습니다. 8개 월드, 32개 레벨, 적, 음악, 파워업이 모두 거기 들어 있습니다.

하지만 에뮬레이터를 열고 올바른 바이트를 조작하면 레벨 36-1을 로드할 수 있습니다. 또는 255-1도 가능합니다. 또는 모든 것이 Bowser 스프라이트와 아무 데도 연결되지 않는 파이프로 이루어진 월드에 착륙할 수도 있습니다.

이 글리치 월드들이 존재하는 이유는 간단합니다: SMB1의 레벨 저장 시스템은 8비트 최적화의 걸작이고, 게임이 읽으면 안 되는 곳에서 읽도록 강제하면 매혹적인 결과가 나옵니다.

Retro Game Mechanics Explained가 이 주제에 대해 4편의 영상을 만들었습니다 -- 가장 많이 팔린 그 시대의 게임의 6502 코드를 하나의 깊이 있는 탐험으로 정리하겠습니다.

![GLITCH OBJECTS -- SMB1의 숨겨진 메커니즘에 대한 RGMechEx 시리즈 타이틀](/images/smb1-glitch-levels/title-card.jpg)

![World 9-1 -- 테니스 카트 스왑을 통해 접근 가능한 첫 번째 글리치 월드의 타이틀 화면](/images/smb1-glitch-levels/v1-title-9-1.jpg)

## 웜 스타트: 왜 테니스의 RAM이 SMB1에서 살아남는가

레벨 저장에 대해 이야기하기 전에, SMB1이 어떻게 시작되는지 이해해야 합니다. NES 테니스 카트 스왑 글리치는 게임의 **웜 스타트 / 콜드 스타트 감지 시스템**에 전적으로 의존하기 때문입니다.

### 보존되는 41바이트

SMB1이 **콜드 스타트** (처음 전원 켜기 또는 전원 껐다가 켜기)를 감지하면 RAM 전체를 지웁니다. 하지만 **웜 스타트** (리셋 버튼, 전원 차단 없음)를 감지하면 **41바이트** 메모리 영역을 보존합니다:

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

이 41바이트는 하나의 기능을 위해 사용됩니다: 플레이어가 **게임 오버 후 같은 월드에서 계속할 수 있게 하는 것**. 6-3에서 죽으면 게임은 월드 6을 시작 바이트에 기록하고, 타이틀 화면에서 A + Start를 누르면 6-1에서 다시 시작합니다.

![웜 스타트 시 RAM에서 보존되는 41바이트 -- TOP SCORE, MARIO SCORE, TIMER, WORLD SELECT, CONTINUE WORLD, 그리고 마법의 바이트 $A5](/images/smb1-glitch-levels/v1-memory-state.jpg)

### 웜 스타트의 이중 검증

![콜드 스타트 vs 웜 스타트 -- 리셋 감지 다이어그램](/images/smb1-glitch-levels/v1-warm-start.jpg)

SMB1이 부팅할 때 하나의 기준만 확인하는 것이 아니라 **두 가지**를 확인합니다:

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

![바이트 $A5와 탑 스코어 자릿수 확인 -- 웜 스타트의 핵심](/images/smb1-glitch-levels/v1-a5-byte.jpg)

왜 이중 검증일까요? 바이트 $A5가 우연히 존재할 수 있기 때문입니다 (다른 게임이 이 값을 남기거나, RAM 칩의 기본 유휴 상태). 탑 스코어의 자릿수가 유효한지 (0-9) 확인함으로써 데이터가 일관된다는 것을 보장합니다.

### 왜 테니스가 유일하게 작동하는 게임인가

처음으로 SMB1을 삽입하면 (콜드 스타트), 게임은:
1. RAM 전체를 지움 → 탑 스코어 = 0, 월드 바이트 = 0
2. $0787에 $A5를 기록

그런 다음 콘솔을 끄지 않고 테니스로 전환합니다. 테니스:
- **시작 시 RAM을 정리하지 않음** (NES 게임 중 거의 그렇게 하지 않음)
- **탑 스코어 바이트에 기록하지 않음** → 0으로 유지 (유효)
- **바이트 $A5를 건드리지 않음** → 유지됨
- **$075F 주소를 사용**하여 플레이어의 발걸음 카운터

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

SMB1을 다시 넣으면:
1. 바이트 $A5가 아직 거기 있음 (테니스가 건드리지 않았음)
2. 탑 스코어 자릿수가 여전히 0 (유효)
3. 월드 바이트가 이제 8+ (테니스 발걸음으로 증가)
4. SMB1이 웜 스타트를 감지 → 손상된 월드 바이트를 보존
5. A + Start 유지 → world 9-1, world A-1, world 36-1 등

### 왜 테니스 전에 마리오를 부팅해야 하는가

미묘한 점이 있습니다: SMB1을 먼저 부팅한 다음, 테니스, 그리고 다시 SMB1을 부팅해야 합니다. 테니스부터 시작하면 바이트 $A5가 기록되지 않습니다 (테니스는 $A5를 기록하지 않으므로), 그래서 웜 스타트 감지가 실패하고 RAM이 지워집니다.

![테니스의 발걸음 카운터: 매 발걸음마다 월드 바이트를 증가시킴](/images/smb1-glitch-levels/v1-footstep.jpg)

![NES 테니스를 통한 글리치 월드 접근 -- 카트 스왑을 설명하는 영상](/images/smb1-glitch-levels/yt-tennis.jpg)

## SMB1이 40KB에 레벨을 저장하는 방법

Nintendo R&D4는 겉보기에 단순한 문제를 해결해야 했습니다: 타일로 수평 스크롤하는 레벨을 표현하고, 적과 아이템을 포함하며, 모든 것을 초 Restricted ROM 예산 안에 넣기.

해결책은 **완전히 독립된** 두 개의 데이터 레이어로 분리하는 것입니다:

### 타일 레이아웃 (레벨 맵)

각 레벨은 ROM에서 압축된 타일 구조를 가리키는 포인터로 정의됩니다. 압축은 원시적이지만 영리합니다: "컨트롤" 바이트 뒤에 1-3바이트의 데이터.

타일 포맷은 **런** (RLE 유사) 시스템을 사용합니다:

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

각 레벨은 16열 × 13행의 타일 (13×16 = 208개 보이는 타일)을 포함합니다. 하지만 압축된 포맷은 훨씬 적은 공간으로 줄일 수 있습니다 -- 예를 들어, 하늘과 빈 열은 거의 공간을 차지하지 않습니다.

6502의 렌더링 루프:

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

### 스프라이트 레이아웃 (적과 오브젝트)

별도로, 적과 오브젝트 (블록 ?, 파이프, goomba, koopa)는 완전히 별도의 구조에 저장됩니다. 각 스폰은 2바이트로 정의됩니다:

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

각 레벨은 최대 5개의 서로 다른 스프라이트 페이지를 참조할 수 있습니다 (즉, 16열짜리 5개 "스크린"). 하지만 실제로 대부분의 레벨은 2-3개만 사용합니다.

### 포인터 테이블

설계의 천재성은 포인터 테이블에 있습니다. 각 레벨은 **쌍**으로 된 ROM 주소로 저장됩니다:

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

테이블당 128개 항목. 4가지 영역 타입. **512가지 가능한 조합**이 있지만 공식 게임에서는 일부만 사용됩니다. 나머지는 초기화되지 않은 RAM이거나 포인터로 해석되는 데이터입니다.

게임이 레벨을 로드할 때 다음과 같이 작동합니다:

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

검증 없음. 포인터가 유효한지 확인 없음. 게임은 테이블에서 주소를 읽고 해당 주소의 내용을 압축 해제합니다, 끝.

![Level ID $06 (Water) -- 9-1, 6-2의 수중 버전](/images/smb1-glitch-levels/lvl-06-9-1.png)

![Level ID 테이블: 128개 가능한 항목, 34개 할당됨](/images/smb1-glitch-levels/v2-level-id-table.jpg)

![타일 포인터와 스프라이트 포인터의 서로 다른 순서 -- 프랑켄슈타인 레벨의 원인](/images/smb1-glitch-levels/v2-pointer-tables.jpg)

### 34개 고유 레벨과 7비트 ID 시스템

![NES의 RAM 칩 (MB8416A) -- 카트리지 스왑 시 데이터를 보존하는 칩](/images/smb1-glitch-levels/v1-ram-chip.jpg)

SMB1에는 32개 레벨이 아니라 **34개 고유 레벨**이 있습니다. 많은 레벨은 "하드 모드" 플래그로 표시된 중복입니다 (5-3 = 1-3이지만 Bullet Bill 포함). 진짜 고유 레벨:

- **물** (타입 0): 3개 레벨 (2-2, 7-2, 보너스 영역 5-2/6-2)
- **오버월드** (타입 1): 22개 레벨 (구름 보너스 2개 방 포함)
- **지하** (타입 2): 3개 레벨 (지하 보너스 방 포함)
- **성** (타입 3): 6개 레벨
- \+ 1개 컷씬 방 (지하/수중 레벨 앞)
- \+ 4-2의 워프 존

각 레벨은 **7비트** ID를 가지고 있습니다. 하위 5비트 = 서브그룹 내 번호, 상위 2비트 = 영역 타입:

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

**128개 가능한 ID** ($00-$7F), 실제 레벨에 할당된 것은 34개만. 사용되지 않은 ID는 아무 데나 가리킵니다.

### 포인터 테이블: 두 개의 목록, 두 개의 순서

타일 포인터와 스프라이트 포인터는 같은 순서로 저장되지 않습니다. 코드는 두 개의 별도 16비트 목록을 사용합니다 (하이 바이트 / 로우 바이트가 두 개의 별도 테이블에):

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

왜 서로 다른 순서일까요? 기술적 이유는 없습니다 -- 아마 개발 중에 데이터가 그렇게 정리되었을 것입니다. 하지만 이는 매혹적인 결과를 만듭니다: 레벨 ID가 유효하지 않으면 타일 포인터와 스프라이트 포인터가 *서로 다른* 레벨을 로드하여 **프랑켄슈타인 레벨**을 만듭니다.

이 두 목록 사이를 탐색하기 위해, 게임은 작은 **오프셋 테이블** (목차와 같은)을 사용합니다:

```asm
; Tables d'offset par type (Water, Overworld, Underground, Castle)
; Chaque entrée = index de début dans la liste correspondante

SpriteOffsetTable:
  .byte $1F, $06, $1C, $00    ; Water=31, Overworld=6, Underground=28, Castle=0

TileOffsetTable:
  .byte $00, $03, $19, $1C    ; Water=0, Overworld=3, Underground=25, Castle=28
```

6-2 레벨 (ID $23, 오버월드 번호 3)을 로드하려면:

```asm
; 1. Type = 01 (Overworld) → index dans table d'offset = 1
; 2. Sprite offset = SpriteOffsetTable[1] = 6
;    Index final = 6 + 3 (numéro de niveau) = 9 → 10ème pointeur sprites
; 3. Tile offset = TileOffsetTable[1] = 3
;    Index final = 3 + 3 = 6 → 7ème pointeur tiles
; 4. Résultat : pointeur tiles $A619 + pointeur sprites $9ED0 = 6-2 ✓
```

이제, $43 (지하 번호 3, 존재하지 않음) 같은 유효하지 않은 ID로는 어떻게 될까요?

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

![Level ID $43 -- 프랑켄슈타인 레벨: 타일 1-4 + 스프라이트 물 5-2](/images/smb1-glitch-levels/lvl-43-frankenstein.png)

![글리치 레벨 포인터 탐험 -- 오프셋 테이블 설명](/images/smb1-glitch-levels/yt-pointers.jpg)

![월드 인덱스 테이블 -- world 9 오버플로우가 글리치 레벨을 만드는 이유](/images/smb1-glitch-levels/v2-world-index-table.jpg)

### 월드 인덱스 테이블: 왜 world 9가 오버플로우되는가

각 월드의 첫 번째 레벨 인덱스를 제공하는 8바이트 ROM 테이블이 있습니다. 그리고 바로 뒤에, 게임 순서대로 모든 36개 레벨의 Level ID 테이블이 있습니다.

```asm
; WorldIndexTable (8 bytes)
  .byte 0, 5, 10, 15, 20, 25, 28, 33
;   -> Monde 1 commence au niveau 0
;   -> Monde 2 commence au niveau 5
;   -> Monde 8 commence au niveau 33

; LevelIDTable (36 bytes)
  .byte $25, $28, $29, $26, $24, ... ; les 36 Level IDs
```

world 9를 로드하려고 하면, 게임은 WorldIndexTable의 9번째 바이트를 읽습니다... 하지만 존재하지 않습니다. 1바이트가 LevelIDTable로 오버플로우하여 $25 값을 읽고, $25를 LevelIDTable의 인덱스로 사용합니다 (37번째 항목) -- 이는 SpriteOffsetTable로 다시 2바이트 오버플로우하여 값 6을 읽습니다.

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

world G (16)의 경우, 오버플로우가 더 멀어져 Level ID $01에 떨어지는데, 이것이 1-2 앞의 컷씬 레벨입니다:

```asm
; World G (16) :
;   WorldIndexTable[15] → lit $01 dans LevelIDTable
;   LevelIDTable[1] = $29 (cutscene 1-2)
;   → world G-1 = la cutscene d'entrée de 1-2
```

## 왜 글리치 월드가 존재하는가

게임에는 32개의 "합법적인" 레벨 (8월드 × 4레벨)이 있습니다. 하지만 포인터 테이블은 영역 타입당 128개 항목을 가지고 있습니다. 32번째 레벨 이후의 항목에는 해당 주소의 ROM 내용이 들어 있습니다 -- 때로는 다른 레벨, 때로는 사운드 데이터, 때로는 RAM, 때로는 아무거나.

![Level ID $01 Water (Minus World) -- 타일 포인터 $AE45, 스프라이트 포인터 $A171](/images/smb1-glitch-levels/minus-world.png)

### Level ID $01 + AreaType 0 = Minus World

가장 유명한 글리치 월드. Level ID $01은 AreaType 0 (물)에서 다음을 가리킵니다:

- **타일 포인터: $AE45** → 2-2/7-2의 수중 영역
- **스프라이트 포인터: $A171** → 2-2/7-2의 스프라이트

결과: 2-2와 비슷한 수중 레벨이지만 깃발 기둥이 존재하지 않아 무한히 반복됩니다. 레벨 끝 없음, 출구 없음.

이것이 레벨 36-1 (또는 월드 $-1의 36-1)입니다.

![SMB1의 웜 스타트 체크 -- Minus World가 존재하게 하는 것](/images/smb1-glitch-levels/v4-minus-world.jpg)

```asm
; Pourquoi le flagpole manque dans le Minus World :
; Les sprites de 2-2/7-2 ($A171) n'ont pas de flagpole
; dans leur séquence. Le jeu cherche le sprite $FD (flagpole)
; mais ne le trouve jamais → boucle infinie
;
; Le jeu continue de générer le niveau à l'infini
; jusqu'à ce que le timer atteigne zéro.
```

### RAM을 가리키는 포인터

타일 포인터나 스프라이트 포인터가 ROM이 아닌 RAM 주소 ($00-$7F)를 가리킬 때, 게임은 RAM의 지속적인 변화를 타일로 해석하려 합니다:

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

제로 페이지가 변경되면 (마리오가 움직이거나 타이머가 돌아가는 등), 레벨의 "스프라이트"도 바뀝니다. 이것이 일부 글리치 월드에서 적이 깜빡이고 지속적으로 변하는 이유입니다.

![Level ID $03 Water -- 스프라이트 포인터 $009D이 RAM을 가리킴, 플레이 불가능한 레벨](/images/smb1-glitch-levels/level-03-water.png)

### Level ID $36: 빈 레벨 (Overworld)

Level ID $36은 Overworld:

- **타일 포인터: $AC35** (1-2)
- **스프라이트 포인터: $A0D8** (1-2)

결과: 없음. 게임은 레벨을 로드하지만 RGMechEx 카탈로그에서 "레벨 없음"으로 표시됩니다. 타일은 유효할 수 있지만 스프라이트가 빈 레벨이나 작동하지 않는 레벨을 만드는 곳을 가리킵니다.

### Level ID $1D (성): 크래시 챔피언

Level ID $1D은 성:

- **타일 포인터: $A210** (4-4)
- **스프라이트 포인터: $7EA0** (RAM!)

스프라이트 포인터가 RAM에 있으면 미정의 스프라이트가 됩니다. 게임은 첫 번째 타일 행에 Spiny ball이나 Bullet Bill 발사기를 표시하려 합니다. 즉시 크래시됩니다.

```asm
; Quand le sprite pointer pointe vers la RAM,
; le jeu décompresse des bytes qui changent tout le temps
; comme des instructions "spawn". Le résultat :
; - Apparition d'objets inexistants (valeur undefined)
; - Crash PPU quand le sprite NES essaie d'afficher un tile invalide
; - Freeze complet de la console
```

## 256개 글리치 월드 카탈로그

RGMechEx는 4가지 영역 타입과 각각의 128개 ID에 대해 **모든 레벨**의 맵을 생성하는 스크립트를 작성했습니다.

월드 카운터는 8비트 (0-255)입니다. 월드 1-8은 합법적입니다. 잠재적으로 **248개 글리치 월드**가 남습니다. 각 글리치 월드는 해당 월드의 첫 번째 레벨에 해당하며, Level ID는 WorldIndexTable의 오버플로우 메커니즘으로 계산됩니다.

![글리치 월드 테이블 -- 248개 손상된 월드, 68개 접근 가능한 첫 번째 레벨](/images/smb1-glitch-levels/v3-glitch-worlds-table.jpg)

128개 가능한 ID 중 **68개만이 월드의 "첫 번째 레벨"** (글리치 월드 번호를 통해 접근 가능). 나머지 60개는 2+ 레벨이거나 접근 불가능합니다.

| 타입 | 유효한 고유 ID | 크래시되는 ID | 빈 ID |
|------|----------------|---------------|--------|
| Water (0)    | ~20  | ~60  | ~48  |
| Overworld (1)| ~30  | ~55  | ~43  |
| Underground (2) | ~15 | ~65 | ~48  |
| Castle (3)   | ~25  | ~58  | ~45  |

많은 ID가 같은 주소에 떨어지는 포인터 때문에 같은 레벨로 이어집니다. 예를 들어 Level ID $28 (Overworld) -- 타일 포인터 $A7CD (2-1) -- 은 **38개 서로 다른 글리치 월드**에 나타납니다. 스프라이트 포인터 $9F51이 많은 ID에 의해 재사용되는 패딩/사운드 데이터 영역의 ROM을 가리키기 때문입니다.

![Level ID $28 (Overworld) 레벨 맵 -- 2-1 타일과 일반 스프라이트, 38개 글리치 월드](/images/smb1-glitch-levels/level-28-overworld.png)

![Super Mario Bros. Glitch Levels Explained -- 세 번째 영상](/images/smb1-glitch-levels/yt-levels.jpg)

### 정말 고유한 6개 글리치 레벨

19개 접근 가능한 글리치 레벨 ID 중 **6개만이 로드 시 즉시 크래시되지 않습니다**:

| 월드 | Level ID | 설명 |
|-------|----------|------|
| E-1 (224) | $50 | 절벽 위에 ? 블록 하나. 마리오가 즉시 죽음. |
| W | $57 | 마리오가 스폰되어 막힘, 움직일 수 없음. |
| 42 (133) | $50 | 구름 터널. 충분히 멀리 가면 마리오를 가둠. |
| 62 (131, 240) | $4D | 얼어붙은 성: 마리오가 위에서 스폰되며 떨어질 수 없음 → 막힘. |
| 127 | $4B | 지하 터널. 너무 멀리 가면 크래시됨. |
| 137 | $4B | 컷씬의 자동 스크롤을 활성화. 마리오가 영원히 막는 단일 벽돌 블록을 만남. |

![Level ID $50 (구름 터널) -- 글리치 월드 42-1과 E-1](/images/smb1-glitch-levels/lvl-50-cloud.png)
![Level ID $4D (성) -- world 62-1, 스폰에서 마리오가 막힘](/images/smb1-glitch-levels/lvl-4D-castle.png)
![Level ID $4B (터널) -- world 127-1, 너무 멀리 가면 크래시됨](/images/smb1-glitch-levels/lvl-4B-tunnel.png)

248개 중 6개 글리치 월드만 정말 새로운 것을 만듭니다. 나머지는 잘못된 영역 타입을 가진 일반 레벨이거나 검은 화면입니다.

## 레벨 포맷 상세 분석

글리치 레벨이 왜 성립하는지 (또는 그렇지 않은지) 이해하기 위해 정확한 레벨 데이터 포맷으로 넘어가겠습니다.

### 레벨 헤더: 2바이트, 6가지 속성

각 레벨은 6가지 속성을 제어하는 2바이트 헤더로 시작합니다:

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

타입 수정자는 시각적 변형을 제어합니다: 수중 레벨 상단의 파도, 8-3의 벽돌 배경, 4-3의 야간 팔레트, 6-2의 눈 등.

### 타일 오브젝트: 2바이트, Next Screen Flag, 3슬롯 큐

헤더 뒤에 **타일 오브젝트** 목록이 오며, 각 오브젝트는 2바이트입니다. 바이트 $FD는 목록의 끝을 표시합니다.

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

"next screen" 비트가 설정되면 현재 작업 열이 1만큼 증가합니다. 이를 통해 처음 16열 너머에 오브젝트를 배치할 수 있습니다. 게임이 순차적으로 로드하기 때문에 오브젝트는 **순서대로** (왼쪽에서 오른쪽) 나열해야 합니다:

```asm
; La routine de chargement a DEUX phases par colonne :
; Phase 1 : chercher les nouveaux objets qui commencent sur cette colonne
;            et les ajouter à la file d'attente (queue)
; Phase 2 : traiter chaque objet dans la queue en dessinant les tiles,
;            et retirer ceux qui finissent sur cette colonne
```

큐는 정확히 **3슬롯**입니다. 직접적인 결과: 같은 열에서 시작하는 오브젝트가 3개를 초과할 수 없습니다. 큐가 가득 차면 네 번째 오브젝트는 무시되고 로드되지 않습니다.

이것이 잘 설계된 레벨이 너무 많은 오브젝트를 쌓지 않는 이유입니다. 1-2의 예: 천장의 1up 블록이 있는 열과 옆의 벽돌은 3개 제한을 준수하기 위해 두 개의 별도 오브젝트로 분할됩니다.

### 특수 Y 위치: 12, 13, 14, 15

Y=12일 때, 오브젝트는 Y 위치가 없습니다 (타입별로 하드코딩됨):

```asm
; Y=12 : objets sans Y position
;   Type 0 : trou (supprime le sol)
;   Type 1 : rope de plateforme mobile
;   Types 2-4 : ponts à Y fixe
;   Type 5 : trou avec eau/lave
;   Types 6-7 : rangées de ? blocks
```

Y=13일 때, 두 개의 서브그룹. 바이트 1의 비트 6이 1이면:

```asm
; Y=13, bit6=1 : objets spéciaux
;   0 = L-pipe (cutscene), 1 = flagpole, 2-3 = pont/axe/hamer (fin château)
;   4 = stop screen, 5 = random enemies, 6 = loop level, 7+ = crash possible
```

비트6=0이면, 하위 5비트가 **스크린 스킵** (하나씩 next screen flag를 거치지 않고 N 스크린으로 직접 건너뛰기)를 인코딩합니다.

Y=14일 때: 비트6=1이면 타입 수정자를 변경하고, 비트6=0이면 배경 + 바닥 패턴을 변경하는 같은 원리입니다.

### 바닥 패턴: 16개 바닥 모양

레벨의 바닥은 개별 오브젝트로 만들어지지 않습니다. SMB1은 **바닥 패턴**을 사용하며, 다음 변경까지 모든 열에 적용되는 배경 모양입니다:

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

구멍이 오브젝트인 이유: 특정 열에서 바닥 패턴을 오버라이드하여 나머지 패턴을 변경하지 않고도 구멍을 만들 수 있기 때문입니다.

### 256바이트 제한과 반복

각 레벨의 모든 타일 데이터는 **최대 256바이트**에 들어갑니다. 6502의 Y 레지스터는 인덱스로 사용되며 8비트입니다. 게임이 $FD 바이트를 찾지 못한 채 데이터 끝에 도달하면 **처음으로 돌아가** 256바이트를 무한히 반복합니다:

```asm
; Index Y = 8 bits → max 256 bytes de données tiles
; Si Y overflow (255 → 0) sans rencontrer $FD → repeat
; Même chose pour les sprites, mais les objets pipe (3 bytes)
; décalent la parité de l'index à chaque chargement.
```

일부 글리치 레벨은 이 반복을 활용하여 "무한히" 지속되는 레벨을 생성합니다.

### 스프라이트 시스템: 2바이트 + 파이프 전환

스프라이트는 유사한 포맷을 따르지만 헤더가 없고 몇 가지 핵심 차이가 있습니다. 바이트 $FF는 목록의 끝을 표시합니다.

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

바이트 1의 최하위 비트는 **하드 레벨 플래그**입니다: 1로 설정하면 해당 스프라이트는 5-3 이상의 레벨에만 나타납니다. 이것이 "하드 모드" 레벨이 만들어지는 방식입니다.

Y 위치 15 = **스크린 스킵** (타일과 동일). Y 위치 14 = **파이프 전환** (3바이트):

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

스프라이트에는 **큐 시스템이 없습니다**. 유일한 제한은 스폰 영역 (오른쪽 화면 밖)에서 동시에 로드된 스프라이트가 4개를 초과할 수 없다는 것입니다. 그 이상은 스프라이트가 무시됩니다.

## 글리치 월드에 접근하는 방법

두 가지 주요 방법이 있습니다.

### 클래식 방법: 월 클립

월 클립 (벽 통과)은 일반 레벨 밖으로 나와 숨겨진 워프 존까지 걸어갈 수 있게 합니다. RAM을 통해 월드 카운터를 조작하면 어떤 Level ID든 로드할 수 있습니다.

기술:
1. World 1-2: 숨겨진 끝 파이프로 이동
2. 오른쪽 벽에서 월 클립 수행
3. 빈 공간을 걸어 워프 영역까지 이동
4. 게임이 값을 월드로 해석

하지만 이 방법은 글리치 월드의 일부에만 접근할 수 있습니다.

### 극단적 방법: NES 테니스 카트 스왑

전체 세부 사항은 위의 "웜 스타트" 섹션을 참조하세요. 요약: 테니스의 발걸음 카운터가 SMB1의 시작 월드와 같은 RAM 바이트에 기록하고, 웜 스타트 감지가 이 값을 보존합니다.

### 해커들을 위한 코너: 모두 탐험하기 위한 코드

에뮬레이터에서 모든 글리치를 직접 탐험하고 싶다면, Level ID를 직접 패치할 수 있습니다:

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

RGMechEx는 자동 생성된 맵과 함께 128개 레벨 × 4가지 타입의 전체 목록을 [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html)에 게시했습니다. 각 항목은 타일 포인터, 스프라이트 포인터, 레벨의 시각적 맵을 보여줍니다.

## 가장 황당한 레벨들

### Level ID $1F (Water): 15개 글리치 월드가 하나에

타일 포인터 $A302 (3-4)와 스프라이트 포인터 $02A0의 조합으로 15개 서로 다른 글리치 월드 (D-1, J-1, Y-1, Z-1, 55-1, 73-1...)가 나옵니다. 설명: 스프라이트 포인터가 유효한 스프라이트에 충분히 가까운 데이터가 포함된 ROM 영역을 가리켜 플레이 가능한 결과를 만들지만, 3-4의 성 타일과 오버월드 스프라이트의 조합이 엉뚱한 렌더링을 만듭니다.

### Level ID $28 (Overworld): 38개 글리치 월드 = 기록

절대 기록. 38개 글리치 월드 항목이 같은 레벨 (2-1 타일 + $9F51 스프라이트)을 가리킵니다. 왜? 스프라이트 포인터 $9F51이 많은 ID에 의해 재사용되는 패딩/사운드 데이터 영역의 ROM에 떨어지기 때문입니다.

### Level ID $49 (Underground): FDS 레벨

타일 포인터 $76AE + 스프라이트 포인터 $1C9D. 타일 포인터가 패미컴 디스크 시스템 버전에 예약된 ROM 영역을 가리킵니다. 결과: 표준 카트리지에 존재하지 않는 타일을 가진 레벨. 이것이 레벨 52-1과 196-1을 만드는 레벨입니다.

### Level ID $00-$02: 진짜 보너스 레벨

이 ID들은 게임의 합법적인 서브레벨에 사용됩니다:

- **$00**: 5-2/6-2의 수중 영역 (H-1, 39-1에서 사용)
- **$01**: 2-2/7-2의 수중 (Minus World, 36-1)
- **$02**: 8-4의 서브레벨 (136-1, 151-1, 215-1)

일반적으로 접근 가능한 "보너스" 레벨과 글리치 월드의 차이점은 워프 존이 현재 월드를 확인한다는 것입니다:

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

번호가 8 초과 또는 0인 글리치 월드는 일반 파이프로 도달할 수 없습니다. 월 클립이나 카트 스왑이 필요합니다.

## 왜 일부 레벨이 크래시되는가: 점프 테이블

게임이 타일 오브젝트를 로드할 때, 타입을 **점프 테이블**의 인덱스로 사용합니다:

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

![점프 테이블: 왜 유효하지 않은 오브젝트 타입이 게임을 크래시시키는지](/images/smb1-glitch-levels/v4-jump-table.jpg)

오브젝트가 유효하지 않은 타입 (≥12)을 가지면, 게임은 이 테이블에 존재하지 않는 포인터로 점프합니다. **4가지 가능한 결과**:

1. **유효한 포인터** → 오브젝트가 일반적으로 로드됨
2. **다른 점프 테이블로의 포인터** (겹침) → 다른 오브젝트가 나타남. 예: 타입 12가 Y=13 테이블을 가리켜 L-pipe가 됨
3. **실행 가능한 코드로의 포인터** → 무작위 코드 실행 (크래시 가능성 높음)
4. **명시적 NOP** → 오브젝트가 아무것도 하지 않음 (일부 스프라이트가 이렇게 하여 적이 제자리에서 날아다니지만 움직이지 않음)

![글리치 레벨 ID $58: 스프라이트 포인터가 유효하지 않은 주소를 가리킴, 게임 크래시](/images/smb1-glitch-levels/v4-glitch-58-crash.jpg)

![글리치 레벨 ID $50: 구름 터널, 손상된 데이터로 생성된 레벨](/images/smb1-glitch-levels/v4-glitch-50.jpg)

글리치 레벨 ID $58 (크래시되는 터널): 스프라이트 포인터가 **ROM 매핑 NES에 존재하지 않는** 메모리 영역을 가리킵니다. 게임은 (0,0) 위치에 같은 Koopa를 프레임당 5번 로드하려 하여 PPU를 포화시키고 프리즈를 일으킵니다.

```asm
; Pourquoi ID $58 crashe :
; Sprite pointer → adresse invalide (hors espace NES standard)
; → Le jeu lit des bytes indéterminés comme des types de sprite
; → Le Koopa $00 (type invalide sans handler) boucle en appel récursif
; → Stack overflow 6502 → freeze
```

### 파이프 워프의 역설

`target_world BETWEEN 1 AND 8` 체크를 기억하세요. 글리치 월드에서 파이프를 찾아도 게임은 대상 월드가 1과 8 사이인지 확인합니다. 글리치 월드는 번호가 8 초과 (36-1, 255-1...)이므로 워프가 실패합니다.

Minus World에 끝이 없는 이유도 같습니다: 깃발 기둥이 스프라이트에 없고, 파이프가 아무 데도 연결되지 않습니다.

### 한 열에 5개 오브젝트 트릭

한 열에 3개 오브젝트 제한을 우회할 수 있는 엣지 케이스가 있습니다. 큐가 막히면 (슬롯 가득 + 다음 next screen flag 없는 오브젝트), 게임은 next screen flag가 있는 오브젝트를 찾을 때까지 현재 열을 "사전 처리"로 반복합니다. 각 사전 처리에서:

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

이것이 "큐 스킵"이라고 불리며 일부 롬해커가 포맷이 허용하는 것보다 더 조밀한 레벨을 만드는 데 사용됩니다.

## 버전 간 차이점

### 패미컴 디스크 시스템

SMB1의 FDS 버전은 **메모리 맵이 다릅니다**. 모든 레벨 포인터가 이동되지만 데이터는 동일합니다. 달라지는 점: 글리치 월드의 인덱스가 완전히 다릅니다:

```
FDS World 36 → Level ID $09 (eau version de 5-3)
  → Le flagpole est présent ! On peut finir le niveau.
  → Ensuite : $27 (7-3 normal) → $44 (4-4 underground)
  → $44 est finissable → la hache fonctionne → fin du jeu !
  
Le Minus World FDS est donc un "bonus world" qui peut mener
à la complétion du jeu, contrairement à la version NES.
```

가장 좋아하는 FDS 레벨: **ID $5F**, 낮은 터널의 3-3 두 번째 절반의 지하 버전 (자동 스크롤러인 것이 안타까움).

### The Lost Levels (Super Mario Bros. 2 일본 버전)

Lost Levels는 많은 것을 변경합니다:

1. **타일/스프라이트 동일 순서**: 더 이상 프랑켄슈타인 레벨 없음 (유효하지 않은 ID에서도 타일과 스프라이트가 같은 레벨을 로드)
2. **단일 16비트 포인터 테이블** 대신 두 개의 별도 하이/로우 테이블
3. **4개 디스크 파일**: FDS용으로 ROM이 분할됨:
   - 파일 1: worlds 1-4
   - 파일 2: worlds 5-8
   - 파일 3: world 9 + 사운드 엔진
   - 파일 4: worlds A-D (완전히 다른 포인터 테이블)
4. **같은 Level ID = 4가지 가능한 레벨** 로드된 파일에 따라
5. **테니스 글리치 없음**: 컨티뉴 옵션 (게임 오버 후 같은 월드에서 계속)이 웜 스타트를 불필요하게 만들고, world > 9이면 게임이 **즉시 리셋**됨
6. **새 오브젝트**: 독 버섯, 보이지 않는 블록, 보이지 않는 파이어 플라워 블록, 거꾸로 된 파이프, 바람 -- 기존 목록 중간에 삽입됨 → SMB1과의 **하위 호환성 없음**
7. **Piranha Plants** world 4 이후 항상 빨강, **스프링보드**는 worlds 2/B/3/C/7에서만 초록

### Super Mario All-Stars (SNES)

동일한 6502 루틴을 사용하는 직접 포팅 (SNES는 호환 모드에서 NES 코드를 실행):

- **워프 존 수정**: Minus World 없음 (텍스트 왼쪽 파이프에 입력하면 올바른 월드로 이동)
- **플랜트**: 대부분의 글리치 레벨 크래시 (ID $6A과 9-1 제외)
- **성 오브젝트 추가**: 더 고유하게 렌더링
- **하지만**: **4-2 잘못된 워프**가 여전히 작동 (패치되지 않음!)

### 4-2 잘못된 워프: 오브젝트 배치 버그

4-2에는 두 개의 파이프 전환 오브젝트가 있습니다: 덩굴 (워프 존)과 파이프 (코인 캐시 방). 첫 번째 전환 오브젝트 (덩굴의 것)는 덩굴이 화면에 나타나기 전에 **훨씬 먼저** 배치됩니다. 두 번째 (파이프)는 레벨에서 **너무 늦게** 배치됩니다.

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

### 반복 레벨

반복 (8-4, 7-4)은 어떻게 작동하나요? 레벨은 하드코딩된 스크린 번호와 Y 위치를 가진 **체크포인트**를 가지고 있습니다:

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

## 포맷을 바꾸지 않고 코드를 바꾸지 않음

이 아키텍처에서 가장 매혹적인 교훈 중 하나는 SMB1 개발자들이 6502 렌더링 코드를 건드리지 않고도 매우 표현적인 레벨 시스템을 만들었다는 것입니다. 레벨 간의 모든 변형은 코드가 아닌 **데이터** (포인터, 오브젝트, 스프라이트, 바닥 패턴)에서 나옵니다.

248개 글리치 월드가 존재하는 이유는 **포인터 테이블이 128개 항목 × 4가지 타입으로 설계**되었고, 게임이 읽는 값을 결코 검증하지 않기 때문입니다. 포인터가 RAM에 떨어지면, 게임은 마리오의 레지스터를 타일로 해석합니다. 포인터가 사운드 데이터에 떨어지면, 게임은 음악을 레벨 디자인으로 재생합니다. 그리고 점프 테이블이 오버플로우하면, 게임은 크래시까지 아무거나 실행합니다.

![More Super Mario Bros. Mechanics Explained -- 네 번째 영상](/images/smb1-glitch-levels/yt-mechanics.jpg)

## 이것에서 배울 수 있는 것

1. **타일/스프라이트 분리**: 두 레이어의 완전한 독립성, 서로 다른 저장 순서가 고유한 프랑켄슈타인 레벨을 만듦
2. **RLE 압축 + 오브젝트 시스템**: 레벨은 비트맵이 아니라 배치된 오브젝트 목록이며, 바닥용 바닥 패턴이 있음
3. **3슬롯 큐**: 하드웨어 (및 레벨 디자인)의 엄격한 제한
4. **검증 없음**: 게임이 포인터와 점프 테이블을 신뢰하여, 플레이 가능한 글리치 또는 크래시를 만듦
5. **최대 256바이트**: 6502 Y 레지스터의 제한으로 너무 멀리 가면 데이터가 반복됨
6. **웜 스타트 / 콜드 스타트**: "계속" 시스템이 테니스 카트 스왑 → 마리오의 문을 열어줌

가장 아름다운 점: 이것 모두는 40KB에 들어가는 6502 코드입니다. 추상화 계층 없음, 메모리 접근 검증 없음, 예외 처리기 없음. 포인터가 나쁘면 게임이 크래시됩니다. 그리고 크래시를 우리는 글리치 월드라고 부릅니다.

## 기억해야 할 3가지

1. **글리치 월드는 잘못 떨어지는 포인터입니다** -- 게임에는 128개 ID × 4가지 영역 타입이 있지만 고유 레벨은 34개뿐입니다. 월드 번호가 손상되면 (테니스나 월 클립), 게임은 다른 레벨을 위해 설계된 포인터를 로드하고, 512가지 가능한 조합이 예측할 수 없는 결과를 만듭니다.

2. **Minus World는 워프 버그와 손상의 조합입니다** -- 1-2의 왼쪽 파이프가 텍스트가 나타나기 전에 활성화되면 world 36 (0x24)을 로드합니다. 이 월드는 Level ID $01 (2-2의 수중), 깃발 기둥이 없는 레벨을 가리킵니다. 그리고 world 36에 파이프 전환가 없기 때문에 레벨은 무한히 반복됩니다. 검증의 부재가 이 아이콘을 만듭니다.

3. **테니스 → 마리오, OoT → Paper Mario보다 15년 앞서** -- NES의 RAM은 커패시터와 SMB1의 웜 스타트 / 콜드 스타트 시스템 덕분에 카트리지 스왑에서 살아남습니다. 테니스의 발걸음 카운터 (플레이할 때 발걸음 소리를 재생하며 RAM 바이트를 증가시키는)가 월드 번호의 주소에 정확히 떨어집니다. 탑 스코어의 자릿수가 0으로 유지되어야 하고, 바이트 $A5가 온전해야 하며, 게임이 웜 스타트를 감지해야 합니다 -- 테니스에서만 작동한 완벽한 상황의 우연입니다.

[Retro Game Mechanics Explained](https://www.youtube.com/c/RetroGameMechanicsExplained)의 원래 영상은 정말 대단한 노력입니다 -- 6502 디스어셈블리, 모든 레벨의 자동 생성 맵, 카트 스왑과 웜 스타트에 대한 설명의 수준이. 시리즈를 보지 않았다면, 짧지만 매 분밀도 밀도 있는 영상을 꼭 보세요.

맵의 소스 코드는 [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html)에서 사용 가능하고, SMB1의 전체 디스어셈블리는 많은 리포지토리에서 오픈 소스입니다. 40년 전, 일본 프로그래머들이 단위 테스트도 버그 트래커도 없이 6502로 이 레벨 시스템을 작성했고, 오늘날에도 그들의 코드를 열어보면 여전히 새로운 것을 배울 수 있습니다.
