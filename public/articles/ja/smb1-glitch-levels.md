---
title: "Super Mario Bros.：レベルフォーマット、ポインタ、そして256のグリッチワールド"
description: "128レベル × 4タイプのエリアがどうやって40KBのROMに収まるのか、Minus Worldがなぜ存在するのか、そしてNESテニスのカートリッジ交換でグリッチワールドをロードできる仕組み。"
date: 2026-06-10
tags:
  - retro
  - reverse-engineering
  - nintendo
  - nes
  - "6502"
  - mario
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "a6z4VxPIyDcanMQGdx/jJmpwYv4vvI7Im4cUHEwCmbAurKdMd2wOiJzTf+q4U1jPdj6wHWQOyv8zrg08I5HDqg=="
---

## はじめに

Super Mario Bros.はROM 40キロバイト。8つのワールド、32のレベル、敵、音楽、パワーアップ、全部これに収まっている。

でもエミュレーターを開いて適当なバイトをいじれば、レベル36-1をロードできる。255-1もだ。Bowserのスプライトとどこにも繋がらないパイプだけで構成されたワールドに着地することもできる。

これらのグリッチワールドが存在するのは単純な理由によるものだ。SMB1のレベル保存システムは8ビットの最適化の傑作であり、ゲームに本来読むべきでない場所を読ませると、興味深い結果が生まれる。

Retro Game Mechanics Explainedがこれについて4本の動画シリーズを制作した -- 当時最も売れたゲームの6502コードを1本の深掘りにまとめよう。

![GLITCH OBJECTS -- SMB1の隠しメカニズムに関するRGMechExシリーズのタイトルカード](/images/smb1-glitch-levels/title-card.jpg)

![World 9-1 -- カートリッジ交換テニスでアクセスできる最初のグリッチワールドのタイトル画面](/images/smb1-glitch-levels/v1-title-9-1.jpg)

## ワームスタート：なぜテニスのRAMがSMB1で生き残るのか

レベルの保存について話す前に、SMB1がどのように起動するかを理解する必要がある。NESテニスのカートリッジ交換グリッチは、ゲームの**ワームスタート／コールドスタート検出システム**に完全に依存しているからだ。

### 保持される41バイト

SMB1が**コールドスタート**（初回の電源投入または電源オフ→オン）を検出すると、すべてのRAMを消去する。しかし**ワームスタート**（リセットボタン、電源切断なし）を検出すると、**41バイト**のメモリ領域を保持する：

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

この41バイトは単一の機能のために使われる：ゲームオーバー後に**同じワールドを続ける**こと。6-3で死ぬと、ゲームはワールド6を起動バイトに書き込み、タイトル画面でA + Startを長押しすると6-1から再開できる。

![ワームスタート時にRAMに保持される41バイト -- TOP SCORE、MARIO SCORE、TIMER、WORLD SELECT、CONTINUE WORLD、そしてマジックバイト$A5](/images/smb1-glitch-levels/v1-memory-state.jpg)

### ワームスタートの二重チェック

![コールドスタート vs ワームスタート -- リセット検出のフローチャート](/images/smb1-glitch-levels/v1-warm-start.jpg)

SMB1は起動時に1つの条件だけでなく**2つ**を確認する：

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

![バイト$A5とトップスコアの桁のチェック -- ワームスタートの中核](/images/smb1-glitch-levels/v1-a5-byte.jpg)

なぜ二重チェックなのか？ バイト$A5が偶然存在する可能性があるからだ（別のゲームがこの値を残した、あるいはRAMチップのデフォルトの待機状態など）。トップスコアの桁が有効（0-9）であることを確認することで、データが整合していることを保証している。

### なぜテニスだけが機能するのか

SMB1を初めて挿入すると（コールドスタート）、ゲームは：
1. すべてのRAMを消去 → トップスコア = 0、ワールドバイト = 0
2. アドレス$0787に$A5を書き込む

その後、コンソールを消さずにテニスに切り替える。テニスは：
- **起動時にRAMをクリーンアップしない**（NESのほとんどのゲームは这样做らない）
- **トップスコアのバイトに書き込まない** → 0のまま（有効）
- **バイト$A5に触れない** → そのまま残る
- **アドレス$075F**をプレイヤーの歩数カウンターに使う

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

SMB1を戻すと：
1. バイト$A5はまだthere（テニスが触っていない）
2. トップスコアの桁はまだ0（有効）
3. ワールドバイトは現在8以上（テニスの歩数でインクリメントされた）
4. SMB1がワームスタートを検出 → 破損したワールドバイトを保持
5. A + Startを長押し → world 9-1、world A-1、world 36-1など

### なぜ先にMarioを起動してからテニスに切り替える必要があるのか

細かい点がある：まずSMB1を起動し、次にテニス、そして再度SMB1を起動する必要がある。最初からテニスを始めた場合、バイト$A5は書き込まれない（テニスは$A5を書き込まない）。そのためワームスタート検出に失敗し、RAMが消去されてしまう。

![テニスの歩数カウンター：各footstepがワールドバイトをインクリメントする](/images/smb1-glitch-levels/v1-footstep.jpg)

![NESテニスでグリッチワールドにアクセスする -- カートリッジ交換を説明する動画](/images/smb1-glitch-levels/yt-tennis.jpg)

## SMB1が40KBにレベルを保存する方法

Nintendo R&D4は一見単純な問題を解決する必要があった：水平スクロールするタイル、敵、アイテムを備えたレベルを、ROMの超strictな予算内で表現することだ。

解決策は、**完全に独立した**2つのデータレイヤーに分離することだった：

### タイルレイヤー（レベルの地図）

各レベルはROM内の圧縮されたタイル構造へのポインタで定義される。圧縮は原始的だが天才的だ：「コントロール」バイトの後に1-3バイトのデータが続く。

タイルフォーマットは**ラン**（RLE風）システムを使用する：

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

各レベルは16列 × 13行のタイル（13×16 = 208タイルの可視領域）を含む。しかし圧縮フォーマットにより、もっと小さくすることができる -- 例えば空や空の列はほとんどスペースを取らない。

6502のレンダリングループ：

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

### スプライトレイヤー（敵とオブジェクト）

並行して、敵とオブジェクト（?ブロック、パイプ、クリボー、ノコノコ）は完全に別の構造に保存される。各スポーンは2バイトで定義される：

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

各レベルは最大5ページの異なるスプライトを参照できる（つまり16列の5「スクリーン」）。しかし実際にはほとんどのレベルは2-3しか使わない。

### ポインタテーブル

設計の天才はポインタテーブルにある。各レベルはROMアドレスの**ペア**として保存される：

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

テーブルごとに128エントリ。4つのエリアタイプ。**512の組み合わせが可能**だが、公式ゲームが使用するのはその一部のみ。残りは未初期化のRAMや、ポインタとして解釈されるデータだ。

ゲームがレベルをロードする際、以下のように行われる：

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

バリデーションなし。ポインタが有効かどうかのチェックなし。ゲームはテーブル内のアドレスを読み、そのアドレスにあるものを解凍する。それだけだ。

![Level ID $06（Water）-- 9-1、6-2の水中バージョン](/images/smb1-glitch-levels/lvl-06-9-1.png)

![Level IDテーブル：128の可能なエントリ、34が割り当てられている](/images/smb1-glitch-levels/v2-level-id-table.jpg)

![タイルポインタとスプライトポインタの異なる順序 -- Frankensteinレベルの原因](/images/smb1-glitch-levels/v2-pointer-tables.jpg)

### 34のユニークレベルと7ビットIDシステム

![NESのRAMチップ（MB8416A）-- カートリッジ交換時にデータを保持するのはこのチップ](/images/smb1-glitch-levels/v1-ram-chip.jpg)

SMB1には32レベルではなく、**34のユニークレベル**がある。多くのレベルは重複（5-3 = 1-3だがBullet Billあり）で、"ハードモード"フラグでマークされている。本物のユニークレベルは：

- **水**（タイプ0）：3レベル（2-2、7-2、ボーナスエリア5-2/6-2）
- **オーバーワールド**（タイプ1）：22レベル（2つの雲ボーナスルームを含む）
- **アンダーグラウンド**（タイプ2）：3レベル（地下ボーナスルームを含む）
- **キャッスル**（タイプ3）：6レベル
- \+ 1カットシーンルーム（地下/水中のレベルの前）
- \+ 14-2のワープゾーン

各レベルは**7ビット**のIDを持つ。下位5ビット = サブグループ内の番号、上位2ビット = エリアタイプ：

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

**128の可能なID**（$00-$7F）、34のみが実在のレベルに割り当てられている。未使用のIDはどこを指してもおかしくない。

### ポインタテーブル：2つのリスト、2つの順序

タイルポインタとスプライトポインタは同じ順序で保存されていない。コードは2つの16ビットリストを別々に使用する（high byte / low byteを2つの別テーブルに格納）：

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

なぜ異なる順序なのか？ 技術的な理由はない -- 開発中にデータがこのように整理されたのだろう。しかし興味深い結果を生む：レベルIDが無効な場合、タイルポインタとスプライトポインタが*異なる*レベルをロードし、**Frankensteinレベル**が生まれる。

この2つのリスト間をナビゲートするために、ゲームは小さな**オフセットテーブル**（目次のようなもの）を使う：

```asm
; Tables d'offset par type (Water, Overworld, Underground, Castle)
; Chaque entrée = index de début dans la liste correspondante

SpriteOffsetTable:
  .byte $1F, $06, $1C, $00    ; Water=31, Overworld=6, Underground=28, Castle=0

TileOffsetTable:
  .byte $00, $03, $19, $1C    ; Water=0, Overworld=3, Underground=25, Castle=28
```

6-2（ID $23、オーバーワールド番号3）をロードする場合：

```asm
; 1. Type = 01 (Overworld) → index dans table d'offset = 1
; 2. Sprite offset = SpriteOffsetTable[1] = 6
;    Index final = 6 + 3 (numéro de niveau) = 9 → 10ème pointeur sprites
; 3. Tile offset = TileOffsetTable[1] = 3
;    Index final = 3 + 3 = 6 → 7ème pointeur tiles
; 4. Résultat : pointeur tiles $A619 + pointeur sprites $9ED0 = 6-2 ✓
```

では、$43のような無効なID（アンダーグラウンド番号3、存在しない）はどうなるか？

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

![Level ID $43 -- Frankensteinレベル：タイル1-4 + スプライト水中5-2](/images/smb1-glitch-levels/lvl-43-frankenstein.png)

![グリッチレベルポインタの探索 -- オフセットテーブルの説明](/images/smb1-glitch-levels/yt-pointers.jpg)

![ワールドインデックステーブル -- World 9のオーバーフローでグリッチレベルが生成される](/images/smb1-glitch-levels/v2-world-index-table.jpg)

### ワールドインデックステーブル：なぜWorld 9がオーバーフローするのか

各ワールド（1-8）の最初のレベルのインデックスを与える8バイトのROMテーブルがある。その直後、ゲーム順ですべての36Level IDのテーブルがある。

```asm
; WorldIndexTable (8 bytes)
  .byte 0, 5, 10, 15, 20, 25, 28, 33
;   -> Monde 1 commence au niveau 0
;   -> Monde 2 commence au niveau 5
;   -> Monde 8 commence au niveau 33

; LevelIDTable (36 bytes)
  .byte $25, $28, $29, $26, $24, ... ; les 36 Level IDs
```

World 9をロードしようとすると、ゲームはWorldIndexTableの9バイト目を読む...がそれは存在しない。LevelIDTableに1バイトオーバーフローし、値$25を読み、その$25をLevelIDTableのインデックスとして使用する（37番目のエントリ）-- これによりSpriteOffsetTableに2バイトオーバーフローし、値6を読む。

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

World G（16）では、オーバーフローはさらに遠く、Level ID $01に到達する。これは1-2の前のカットシーンレベルだ：

```asm
; World G (16) :
;   WorldIndexTable[15] → lit $01 dans LevelIDTable
;   LevelIDTable[1] = $29 (cutscene 1-2)
;   → world G-1 = la cutscene d'entrée de 1-2
```

## グリッチワールドが存在する理由

ゲームには32の「正規」レベル（8ワールド × 4レベル）がある。しかしポインタテーブルはエリアタイプごとに128エントリある。32以降のエントリには、そのROMアドレスにあるデータが入っている -- 時には別のレベル、有时はサウンドデータ、有时はRAM、有时はただのゴミ。

![Level ID $01 Water（Minus World）-- タイルポインタ$AE45、スプライトポインタ$A171](/images/smb1-glitch-levels/minus-world.png)

### Level ID $01 + AreaType 0 = Minus World

最も有名なグリッチワールド。Level ID $01のAreaType 0（水）は以下を指す：

- **タイルポインタ：$AE45** → 2-2/7-2の水中エリア
- **スプライトポインタ：$A171** → 2-2/7-2のスプライト

結果：2-2に似た水中レベルだが、flagpoleが存在しないので無限にループする。レベルの終わりなし、出口なし。

これはレベル36-1（またはワールド$-1の36-1）だ。

![SMB1のワームスタートチェック -- Minus Worldが存在できるのはこのチェックのおかげ](/images/smb1-glitch-levels/v4-minus-world.jpg)

```asm
; Pourquoi le flagpole manque dans le Minus World :
; Les sprites de 2-2/7-2 ($A171) n'ont pas de flagpole
; dans leur séquence. Le jeu cherche le sprite $FD (flagpole)
; mais ne le trouve jamais → boucle infinie
;
; Le jeu continue de générer le niveau à l'infini
; jusqu'à ce que le timer atteigne zéro.
```

### RAMを指すポインタ

タイルポインタやスプライトポインタがROMではなくRAMのアドレス（$00-$7F）を指すと、ゲームはRAMのconstantな変化をタイルとして解釈しようとする：

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

ゼロページが変化すると（Marioが動いたり、タイマーが回ったり）、レベルの「スプライト」も変わる。だから一部のグリッチワールドでは敵が点滅し、constantに変化するのだ。

![Level ID $03 Water -- スプライトポインタ$009DがRAMを指す、プレイ不可能なレベル](/images/smb1-glitch-levels/level-03-water.png)

### Level ID $36：空のレベル（Overworld）

Level ID $36のOverworld：

- **タイルポインタ：$AC35**（1-2）
- **スプライトポインタ：$A0D8**（1-2）

結果：何もなし。ゲームはレベルをロードするが、RGMechExのカタログでは「レベルなし」とマークされている。タイルは有効かもしれないが、スプライトが空のレベルまたは機能しないレベルを生成する場所を指している。

### Level ID $1D（Castle）：クラッシュの王者

Level ID $1DのCastle：

- **タイルポインタ：$A210**（4-4）
- **スプライトポインタ：$7EA0**（RAM！）

スプライトポインタがRAM = 未定義スプライト。ゲームはタイルの最初の行にSpiny ballやBullet Bill blasterを表示しようとする。即座にクラッシュ。

```asm
; Quand le sprite pointer pointe vers la RAM,
; le jeu décompresse des bytes qui changent tout le temps
; comme des instructions "spawn". Le résultat :
; - Apparition d'objets inexistants (valeur undefined)
; - Crash PPU quand le sprite NES essaie d'afficher un tile invalide
; - Freeze complet de la console
```

## カタログ化された256のグリッチワールド

RGMechExは**すべてのレベル**のマップを生成するスクリプトを作成した。4つのエリアタイプすべて、それぞれ128IDだ。

ワールドカウンターは8ビット（0-255）。ワールド1-8は正規。残り**248のグリッチワールド**が潜在的に存在する。各グリッチワールドはそのワールドの最初のレベルに対応し、Level IDはWorldIndexTableのオーバーフローメカニズムで計算される。

![グリッチワールドテーブル -- 248の破損ワールド、68の最初のアクセス可能なレベル](/images/smb1-glitch-levels/v3-glitch-worlds-table.jpg)

128の可能なIDのうち、**68のみがワールドの「最初のレベル」**（グリッチワールド番号でアクセス可能）。残り60はレベル2以上またはアクセス不可能。

| タイプ | プレイ可能なユニークID | クラッシュするID | 空のID |
|------|---------------------|-------------------|-----------|
| Water（0）    | ~20  | ~60  | ~48  |
| Overworld（1）| ~30  | ~55  | ~43  |
| Underground（2） | ~15 | ~65 | ~48  |
| Castle（3）   | ~25  | ~58  | ~45  |

多くのIDが同じポインタが同じROMアドレスを指すため、同じレベルに至る。例えばLevel ID $28（Overworld）-- タイルポインタ$A7CD（2-1）-- は**38の異なるグリッチワールド**に出現する。スプライトポインタ$9F51がROMのサウンドデータ/パディング領域を指し、多くのIDが再利用しているからだ。

![Level ID $28（Overworld）のマップ -- 2-1のタイルと通常のスプライト、38のグリッチワールド](/images/smb1-glitch-levels/level-28-overworld.png)

![Super Mario Bros.グリッチレベル解説 -- 3本目の動画](/images/smb1-glitch-levels/yt-levels.jpg)

### 本当にユニークな6つのグリッチレベル

アクセス可能な19のグリッチレベルIDのうち、ロード時に即座にクラッシュしないのは**6のみ**：

| ワールド | Level ID | 説明 |
|-------|----------|-------------|
| E-1（224） | $50 | 穴の上に?ブロックが1つ。Marioは即死。 |
| W | $57 | Marioがスポーンして動けない。 |
| 42（133） | $50 | 雲のトンネル。十分進むとMarioが閉じ込められる。 |
| 62（131、240） | $4D | 凍った城：Marioが上にスポーンし、落ちられない → ロック。 |
| 127 | $4B | 地下トンネル。だが進みすぎるとクラッシュ。 |
| 137 | $4B | カットシーンの自動スクロールを有効化。Marioが唯一のbrick blockに永久にブロックされる。 |

![Level ID $50（雲トンネル）-- グリッチワールド42-1とE-1](/images/smb1-glitch-levels/lvl-50-cloud.png)
![Level ID $4D（城）-- ワールド62-1、スポーンでロックされたMario](/images/smb1-glitch-levels/lvl-4D-castle.png)
![Level ID $4B（トンネル）-- ワールド127-1、進みすぎるとクラッシュ](/images/smb1-glitch-levels/lvl-4B-tunnel.png)

248のグリッチワールドのうち、本当に新しいものを生み出すのは6のみ。残りは間違ったエリアタイプの通常レベルか、黒い画面だ。

## レベルフォーマットの詳細

グリッチレベルが成立する（しない）理由を理解するため、レベルデータの正確なフォーマットに飛び込む。

### レベルヘッダー：2バイト、6プロパティ

各レベルは2バイトのヘッダーで始まり、6プロパティを制御する：

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

タイプモディファイアは視覚的なバリエーションを制御する：水中レベルの波、8-3のbrick背景、4-3のナイトパレット、6-2の雪など。

### タイルオブジェクト：2バイト、Next Screen Flag、3スロットのキュー

ヘッダーの後には**タイルオブジェクト**のリストが続く。各オブジェクトは2バイト。バイト$FDがリストの終わりを示す。

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

「next screen」ビットが立つと、作業中の列が1インクリメントされる。これにより16列目以降にオブジェクトを配置できる。オブジェクトは**順番に**（左から右へ）リストする必要がある。ゲームが順番にロードするからだ：

```asm
; La routine de chargement a DEUX phases par colonne :
; Phase 1 : chercher les nouveaux objets qui commencent sur cette colonne
;            et les ajouter à la file d'attente (queue)
; Phase 2 : traiter chaque objet dans la queue en dessinant les tiles,
;            et retirer ceux qui finissent sur cette colonne
```

キューは正確に**3スロット**。直接的な結果：同じ列で始まるオブジェクトは3つ以上持てない。キューが満杯の場合、4番目のオブジェクトは無視され、ロードされない。

だから設計の良いレベルはオブジェクトの詰め込みを避ける。1-2の例：天井の1upブロックがある列 + 横のbrickは、3の制限を守ために2つの別オブジェクトに分割されている。

### 特殊なY位置：12、13、14、15

Y=12の場合、オブジェクトにはY位置がない（タイプでハードコードされている）：

```asm
; Y=12 : objets sans Y position
;   Type 0 : trou (supprime le sol)
;   Type 1 : rope de plateforme mobile
;   Types 2-4 : ponts à Y fixe
;   Type 5 : trou avec eau/lave
;   Types 6-7 : rangées de ? blocks
```

Y=13の場合、2つのサブグループがある。バイト1のビット6が1の場合：

```asm
; Y=13, bit6=1 : objets spéciaux
;   0 = L-pipe (cutscene), 1 = flagpole, 2-3 = pont/axe/hamer (fin château)
;   4 = stop screen, 5 = random enemies, 6 = loop level, 7+ = crash possible
```

ビット6=0の場合、下位5ビットが**スクリーンスキップ**（next screen flagを1つずつ使わずに、スクリーンNに直接ジャンプ）をエンコードする。

Y=14の場合：同じ原理でビット6=1はタイプモディファイアの変更、ビット6=0は背景 + フロアパターンの変更。

### フロアパターン：16種類の床パターン

レベルの床は個別のオブジェクトで構成されていない。SMB1は**フロアパターン**を使用する。次の変更まで全列に適用される背景パターンだ：

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

だから穴はオブジェクトだ：特定の列でフロアパターンをオーバーライドし、残りのパターンを変更せずに済む。

### 256バイトの制限とリピート

すべてのタイルデータは**最大256バイト**に収まる。6502のYレジスタがインデックスとして使われ、8ビットだ。$FDバイトを見つけずにデータの末尾に達した場合、**最初に戻って**256バイトを無限に繰り返す：

```asm
; Index Y = 8 bits → max 256 bytes de données tiles
; Si Y overflow (255 → 0) sans rencontrer $FD → repeat
; Même chose pour les sprites, mais les objets pipe (3 bytes)
; décalent la parité de l'index à chaque chargement.
```

一部のグリッチレベルはこのリピートを利用して、「無限」に続くレベルを生成する。

### スプライトシステム：2バイト + パイプトランジション

スプライトは同様のフォーマットに従うが、ヘッダーがなく、いくつかの重要な違いがある。バイト$FFがリストの終わりを示す。

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

バイト1の最下位ビットは**ハードレベルフラグ**：1に設定されると、スプライトは5-3以上のレベルにのみ出現する。これで「ハードモード」レベルが作られる。

Y位置15 = **スクリーンスキップ**（タイルと同じ）。Y位置14 = **パイプトランジション**（3バイト）：

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

スプライトには**キューシステムがない**。唯一の制限は、スポーンゾーン（画面右のすぐ外）に同時にロードできるスプライトが4つ以下であること。それ以上はスプライトが無視される。

## グリッチワールドへのアクセス方法

主に2つの方法がある。

### クラシックな方法：壁抜け

壁抜け（壁を通り抜ける）により、通常のレベルから脱出し、隠されたワープゾーンまで歩くことができる。RAM経由でワールドカウンターを操作することで、任意のLevel IDをロードできる。

テクニック：
1. World 1-2：隠された終点パイプに入る
2. 右の壁で壁抜けを行う
3. ワープゾーンまで虚空を歩く
4. ゲームが値をワールドとして解釈する

しかし、この方法はグリッチワールドの一部にしかアクセスできない。

### 極端な方法：NESテニスカートリッジ交換

詳細は上の「ワームスタート」セクションを参照。要するに：テニスの歩数カウンターがSMB1のワールドバイトと同じRAMバイトに書き込み、ワームスタート検出がこの値を保持する。

### ハッカー向け：すべてを探索するコード

エミュレーターですべてのグリッチを自分で探索したい場合、Level IDに直接パッチを当てることができる：

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

RGMechExは128レベル × 4タイプの完全なリストと自動生成されたマップを[rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html)に公開している。各エントリにはタイルポインタ、スプライトポインタ、レベルの視覚マップが表示される。

## 最もクレイジーなレベル

### Level ID $1F（Water）：1つで15のグリッチワールド

タイルポインタ$A302（3-4）にスプライトポインタ$02A0を組み合わせると、15の異なるグリッチワールド（D-1、J-1、Y-1、Z-1、55-1、73-1...）が生成される。説明：スプライトポインタがROMのサウンドデータ/パディング領域を指し、有効なスプライトに近いデータを含むためプレイ可能な結果を生む。しかし3-4のキャッスルタイルとオーバーワールドスプライトの組み合わせは、意味のないレンダリングを生む。

### Level ID $28（Overworld）：38のグリッチワールド = 記録

絶対記録。38のグリッチワールドエントリが同じレベル（2-1タイル + $9F51スプライト）を指す。なぜ？ スプライトポインタ$9F51がROMのサウンドデータ/パディング領域を指し、多くのIDが再利用しているからだ。

### Level ID $49（Underground）：FDSレベル

タイルポインタ$76AE + スプライトポインタ$1C9D。タイルポインタがFamicom Disk System用に予約されたROM領域を指す。結果：標準カートリッジには存在しないタイルを持つレベル。これがレベル52-1と196-1を生み出す。

### Level ID $00-$02：本物のボーナスレベル

これらのIDはゲームの正規サブレベルに使用される：

- **$00**：5-2/6-2の水中エリア（H-1、39-1で使用）
- **$01**：2-2/7-2の水（Minus World、36-1）
- **$02**：8-4のサブレベル（136-1、151-1、215-1）

通常アクセス可能な「ボーナス」レベルとグリッチワールドの違いは、ワープゾーンが現在のワールドをチェックすることだ：

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

番号が8超または0のグリッチワールドは通常のパイプでは到達できない。壁抜けまたはカートリッジ交換が必要だ。

## なぜ一部のレベルがクラッシュするのか：ジャンプテーブル

ゲームがタイルオブジェクトをロードする際、タイプを**ジャンプテーブル**のインデックスとして使う：

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

![ジャンプテーブル：なぜ無効なオブジェクトタイプでゲームがクラッシュするのか](/images/smb1-glitch-levels/v4-jump-table.jpg)

オブジェクトが無効なタイプ（≥12）を持つ場合、ゲームはこのテーブルに存在しないポインタにジャンプする。**4つの結果が可能**：

1. **有効なポインタ** → オブジェクトが通常通りロードされる
2. **別のジャンプテーブルへのポインタ**（オーバーラップ） → 異なるオブジェクトが出現。例：タイプ12がY=13テーブルを指し、L-pipeになる
3. **実行可能コードへのポインタ** → ランダムコードの実行（クラッシュの可能性大）
4. **明示的なプレースホルダー（NOP）** → オブジェクトが何もしない（一部のスプライトはこのように、動かない空中浮遊の敵を生成する）

![グリッチレベルID $58：スプライトポインタが無効なアドレスを指し、ゲームがクラッシュ](/images/smb1-glitch-levels/v4-glitch-58-crash.jpg)

![グリッチレベルID $50：雲トンネル、破損データから生成されたレベル](/images/smb1-glitch-levels/v4-glitch-50.jpg)

グリッチレベルID $58（クラッシュするトンネル）：スプライトポインタが**ROMマッパーなしのNESには存在しない**メモリ領域を指す。ゲームは（0,0）位置に同じKoopaを1フレームに5回ロードしようとして、PPUを飽和させ、フリーズを引き起こす。

```asm
; Pourquoi ID $58 crashe :
; Sprite pointer → adresse invalide (hors espace NES standard)
; → Le jeu lit des bytes indéterminés comme des types de sprite
; → Le Koopa $00 (type invalide sans handler) boucle en appel récursif
; → Stack overflow 6502 → freeze
```

### パイプワープのパラドックス

`target_world BETWEEN 1 AND 8`のチェックを覚えているか？ グリッチワールドでパイプを見つけたとしても、ゲームは目的地のワールドが1-8の間であることを確認する。グリッチワールドは番号が8超（36-1、255-1...）なので、ワープは失敗する。

Minus Worldに終わりがないのもそのためだ：flagpoleがスプライトに存在せず、パイプはどこにも繋がらない。

### 1列に5つのオブジェクトのトリック

3オブジェクト/列の制限を上書きするエッジケースが存在する。キューがブロックされた場合（スロット満杯 + 次のオブジェクトにnext screen flagなし）、ゲームはnext screen flagを持つオブジェクトが見つかるまで現在の列をループで「プレプロセス」する。各プレプロセスで：

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

これは「キュースキップ」と呼ばれ、一部のROMハッカーがフォーマットが通常許すより密度の高いレベルを作成するために使用している。

## バージョン間の違い

### Famicom Disk System

SMB1のFDSバージョンは**メモリマップが異なる**。すべてのレベルポインタがシフトされているが、データは同じ。違い：グリッチワールドのインデックスが完全に異なる：

```
FDS World 36 → Level ID $09 (eau version de 5-3)
  → Le flagpole est présent ! On peut finir le niveau.
  → Ensuite : $27 (7-3 normal) → $44 (4-4 underground)
  → $44 est finissable → la hache fonctionne → fin du jeu !
  
Le Minus World FDS est donc un "bonus world" qui peut mener
à la complétion du jeu, contrairement à la version NES.
```

お気に入りのFDSレベル：**ID $5F**、3-3の後半の地下バージョン（ autoscrollingなのが残念だが）。

### The Lost Levels（Super Mario Bros. 日本版）

Lost Levelsは多くのことを変える：

1. **タイル/スプライトの同じ順序**：Frankensteinレベルなし（無効なIDでもタイルとスプライトが同じレベルをロードする）
2. **1つの16ビットポインタテーブル**（high/lowの2テーブルではなく）
3. **4つのディスクファイル**：ROMがFDS用に分割された：
   - ファイル1：ワールド1-4
   - ファイル2：ワールド5-8
   - ファイル3：ワールド9 + サウンドエンジン
   - ファイル4：ワールドA-D（完全に異なるポインタテーブル）
4. **同じLevel ID = 4つの可能なレベル**（ロードされたファイルによる）
5. **テニスグリッチなし**：コンティニューオプション（ゲームオーバー後に同じワールドを続ける）がワームスタートを不要にし、ワールド > 9の場合**即座にリセット**する
6. **新しいオブジェクト**：毒キノコ、不可視ブロック、不可視ファイアフラワーブロック、逆さまパイプ、風 -- だが既存リストの途中に挿入 → SMB1との**後方互換性なし**
7. **ピラニアプラントがワールド4以降常に赤**、**スプリングボードがワールド2/B/3/C/7で緑のみ**

### Super Mario All-Stars（SNES）

同じ6502ルーチンによる直接移植（SNESは互換モードでNESコードを実行）：

- **ワープゾーン修正**：Minus Worldなし（テキストの前に左のパイプに入ると正しいワールドに到着）
- **フリーズ**：ほとんどのグリッチレベルがクラッシュ（ID $6Aと9-1を除く）
- **キャッスルオブジェクト追加**：よりユニークに
- **しかし**：**4-2 wrong warp**はまだ機能する（パッチされていない！）

### 4-2 wrong warp：オブジェクト配置のバグ

4-2には2つのパイプトランジションオブジェクトがある：蔦（ワープゾーン）とパイプ（コインキャッシュルーム）。最初のトランジションオブジェクト（蔦のもの）は、蔦が画面に出現する**はるか前に**配置されている。2番目（パイプ）はレベル内で**遅すぎる**位置に配置されている。

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

### ループレベル

ループ（8-4、7-4）はどう機能するか？ レベルにはハードコードされたスクリーン番号とY位置を持つ**チェックポイント**がある：

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

## フォーマットを変え、コードは変えない

このアーキテクチャの最も興味深い教訓の1つは、SMB1の開発者が6502レンダリングコードに触れることなく、非常に表現力豊かなレベルシステムを構築したことだ。レベル間のすべてのバリエーションは**データ**（ポインタ、オブジェクト、スプライト、フロアパターン）から来ており、コードではない。

256のグリッチワールドが存在するのは、**ポインタテーブルが128エントリ × 4タイプに Sized**されており、ゲームが読み取る値を決してバリデーションしないからだ。ポインタがRAMに落ちると、ゲームはMarioのレジスタをタイルとして解釈する。ポインタがサウンドデータに落ちると、ゲームは音楽をレベルデザインとして再生する。そしてジャンプテーブルがオーバーフローすると、ゲームはクラッシュまで何でも実行する。

![More Super Mario Bros. Mechanics Explained -- 4本目の動画](/images/smb1-glitch-levels/yt-mechanics.jpg)

## ここから学べること

1. **タイル/スプライトの分離**：2レイヤーの完全な独立、異なる保存順序がユニークなFrankensteinレベルを生む
2. **RLE圧縮 + オブジェクトシステム**：レベルはビットマップではなく配置されたオブジェクトのリスト、床にはフロアパターン
3. **3スロットキュー**：ハードウェア（とレベルデザイン）の厳格な制限
4. **バリデーションなし**：ゲームはポインタとジャンプテーブルを信頼し、プレイ可能なグリッチまたはクラッシュを生む
5. **最大256バイト**：6502のYレジスタの制限により、進みすぎるとデータが繰り返される
6. **ワームスタート／コールドスタート**：「続ける」システムがテニスカートリッジ交換 → Marioへの扉を開いた

最も美しいのは、これらすべてが40KBに収まる6502コードだ。抽象レイヤーなし、メモリアクセスバリデーションなし、例外ハンドラなし。ポインタが壊れていたら、ゲームはクラッシュする。そしてクラッシュは、グリッチワールドと呼ばれる。

## 覚えるべき3つのこと

1. **グリッチワールドは場違いに落ちたポインタだ** -- ゲームには128ID × 4エリアタイプがあるが、ユニークレベルは34のみ。ワールド番号が（テニスや壁抜けによって）破損すると、別のレベル用に設計されたポインタがロードされ、512の組み合わせが予測不可能な結果を生む。

2. **Minus Worldはワープバグと破損の組み合わせだ** -- 1-2の左パイプがテキスト表示前にアクティブ化されると、ワールド36（0x24）がロードされる。このワールドはLevel ID $01（2-2の水）を指し、flagpoleのないレベルだ。そしてワールド36にはパイプトランジションがないため、レベルは無限にループする。検証の欠如がこのアイコンを生んだ。

3. **テニス → Mario、OoT → Paper Marioの15年前** -- NESのRAMはコンデンサとSMB1のワームスタート／コールドスタートシステムのおかげでカートリッジ交換を生き残る。テニスの歩数カウンター（歩く音を再生しながらRAMバイトをインクリメントする）がワールド番号のアドレスにちょうど落ちる。トップスコアの桁が0のまま、バイト$A5が無傷、ゲームがワームスタートを検出する必要がある -- テニスでしか機能しなかった完璧な偶発的な組み合わせだ。

[Retro Game Mechanics Explained](https://www.youtube.com/c/RetroGameMechanicsExplained)の元動画はとんでもない労力の産物だ -- 6502の逆アセンブル、すべてのレベルの自動マップ、カートリッジ交換とワームスタートの説明。シリーズを見ていなかったら見ろ。短いし、毎分が密集している。

マップのソースコードは[rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html)で利用可能で、SMB1の完全な逆アセンブルは多数のリポジトリでオープンソースになっている。40年前、日本のプログラマーたちがユニットテストゼロ、バグトラッカーゼロの6502でこのレベルシステムを書き、今日でも彼らのコードを開くと新しいことを学べる。
