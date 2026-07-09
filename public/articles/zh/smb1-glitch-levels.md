---
title: "Super Mario Bros.：关卡格式、指针与256个故障世界"
description: "128个关卡 × 4种区域类型如何装进40KB ROM、Minus World为何存在，以及一场NES Tennis卡带交换如何能加载故障世界。"
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
---

## 引言

Super Mario Bros.，只有40KB ROM。八个世界，32个关卡，敌人、音乐、道具，全都在里面。

但如果你打开模拟器，修改正确的字节，你就能加载第36-1关。或者255-1关。甚至进入一个满屏都是Bowser精灵和通往虚空的水管的故障世界。

这些glitch world存在的原因很简单：SMB1的关卡存储系统是8位优化的杰作，而当你强制游戏在不该读取的地方读取数据时，就会产生令人着迷的结果。

Retro Game Mechanics Explained制作了一个4集系列视频——我们将把它们整合为一次对这个时代最畅销游戏6502代码的深入探索。

![GLITCH OBJECTS -- RGMechEx关于SMB1隐藏机制的系列标题](/images/smb1-glitch-levels/title-card.jpg)

![World 9-1 -- 通过卡带交换Tennis可访问的第一个故障世界的标题画面](/images/smb1-glitch-levels/v1-title-9-1.jpg)

## Warm Start：为什么Tennis的RAM能在SMB1中存活

在讨论关卡存储之前，需要先了解SMB1如何启动。因为NES Tennis卡带交换的glitch完全依赖于游戏的**warm start / cold start检测系统**。

### 被保留的41字节

当SMB1检测到**cold start**（首次通电或关机再开机）时，它会清除所有RAM。但当它检测到**warm start**（按重置键，没有断电）时，它会保留一个**41字节**的内存区域：

```asm
; Warm start时RAM中保留的41字节
; 地址 $075F-$0787
;
; $075F : 启动字节 (world - 1)    [1 byte]
; $0760 : 世界选择标志 (B button) [1 byte]
; $0761-$0762 : 未使用                    [2 bytes]
; $0763-$0768 : 计时器 (6位数字, 显示3位) [6 bytes]
; $0769-$076E : Luigi的金币                   [6 bytes]
; $076F-$0774 : Mario的金币                   [6 bytes]
; $0775-$077A : Luigi的分数                   [6 bytes]
; $077B-$0780 : Mario的分数                   [6 bytes]
; $0781-$0786 : 最高分 (6位数字, 1位隐藏) [6 bytes]
; $0787 : 魔法字节 $A5                 [1 byte]
```

这41字节只用于一个功能：让玩家在game over后**能继续到同一个世界**。如果你在6-3死了，游戏会把世界6写入启动字节，在标题画面中，如果你按住A + Start，就会从6-1重新开始。

![Warm start时RAM中保留的41字节 -- TOP SCORE, MARIO SCORE, TIMER, WORLD SELECT, CONTINUE WORLD, 和魔法字节 $A5](/images/smb1-glitch-levels/v1-memory-state.jpg)

### Warm start的双重验证

![Cold start vs warm start -- 重置检测流程图](/images/smb1-glitch-levels/v1-warm-start.jpg)

当SMB1启动时，它不只是检查一个条件，而是**两个**：

```asm
CheckWarmStart:
  ; 1. 检查 $0787 处的魔法字节 $A5
  lda $0787
  cmp #$A5
  bne ColdStart        ; 不是 $A5 → cold start

  ; 2. 检查最高分的6位数字 ($0781-$0786)
  ;    每位数字必须在0到9之间
  ldx #0
CheckLoop:
  lda $0781,x
  cmp #$0A
  bcs ColdStart        ; 数字 >= 10 → cold start
  inx
  cpx #6
  bne CheckLoop

  ; 如果两个条件都通过 → warm start
  ; RAM不会被清除，启动世界被保留
  jmp WarmStartBoot
```

![ $A5字节和最高分数字的验证 -- warm start的核心](/images/smb1-glitch-levels/v1-a5-byte.jpg)

为什么要双重验证？因为$A5字节可能是偶然存在的（另一个游戏遗留了这个值，或RAM芯片的默认空闲状态）。通过验证最高分数字有效（0-9），可以确保数据是一致的。

### 为什么只有Tennis能用

当我们首次插入SMB1（cold start）时，游戏会：
1. 清除所有RAM → 最高分 = 0，世界字节 = 0
2. 在地址$0787写入$A5

然后我们不关机直接换上Tennis。Tennis：
- **启动时不清理RAM**（很少有NES游戏这么做）
- **不写入最高分的字节** → 它们保持为0（有效）
- **不修改$A5字节** → 它保持不变
- **使用地址$075F** 作为玩家的脚步计数器

```asm
; Tennis中的脚步递增机制：
; 每当玩家在球场上走一步，Tennis会递增$075F处的字节。
; SMB1使用同一个字节作为 "世界编号 - 1"。
;
; 0步  → world 0 → SMB1 = world 1
; 1-7步 → world 1-7 → 正常世界
; 8+步 → world 8+ → 故障世界！
;
; 计数器只在音乐停止时递增
; （脚步音效在音乐播放时不会触发）。
```

当我们重新插回SMB1时：
1. $A5字节仍然在（Tennis没有修改它）
2. 最高分数字仍然是0（有效）
3. 世界字节现在是8+（被Tennis的脚步递增）
4. SMB1检测到warm start → 保留损坏的世界字节
5. 按住A + Start → world 9-1, world A-1, world 36-1, 等等

### 为什么必须先启动Mario再启动Tennis

一个微妙之处：必须先启动SMB1，再启动Tennis，然后再启动SMB1。如果你直接从Tennis开始，$A5字节永远不会被写入（Tennis不会写入$A5），因此warm start检测会失败，RAM会被清除。

![Tennis的脚步计数器：每个footstep递增世界字节](/images/smb1-glitch-levels/v1-footstep.jpg)

![通过NES Tennis访问故障世界 -- 解释卡带交换的视频](/images/smb1-glitch-levels/yt-tennis.jpg)

## SMB1如何在40KB中存储关卡

Nintendo R&D4必须解决一个表面上很简单的问题：用有限的ROM预算表示水平滚动的关卡，包含图块、敌人、道具。

解决方案是将数据分为**完全独立**的两层：

### Tile layout（关卡地图）

每个关卡由一个指向ROM中压缩图块结构的指针定义。压缩方式简单但精妙：一个"控制"字节后跟1-3个数据字节。

Tile格式使用**游程编码**（RLE-like）系统：

```asm
; SMB1的tile格式（简化）
; 每个"命令"是一个控制字节：
;
; $00-$7F : 放置一个tile，前进1列
; $80-$BF : 放置一个tile重复N次 (N = 字节 - $80 + 1)
; $C0-$FF : 特殊命令（行尾、跳转、调色板切换）

示例：绘制3个连续的砖块：
  $82 $01    ; 重复tile $01 (brick) 3次
```

每个关卡包含13行 × 16列的图块（13×16 = 208个可见图块）。但压缩格式可以大幅减少数据量——例如天空和空白列几乎不占空间。

6502的渲染循环：

```asm
; Tile解压缩 - 主循环
; 输入：tile_data指针在 $XX
; 输出：tilemap关卡数据写入PPU RAM

DecompressTile:
  lda (tile_ptr),y      ; 读取控制字节
  iny
  cmp #$80
  bcc SingleTile        ; $00-$7F : 单个tile
  cmp #$C0
  bcc RunLength         ; $80-$BF : 游程编码
  jmp SpecialCommand    ; $C0-$FF : 特殊命令

SingleTile:
  sta PPU_DATA          ; 直接写入tile
  jmp Next

RunLength:
  sec
  sbc #$7E              ; N = control - $7E
  tax
  lda (tile_ptr),y      ; 读取要重复的tile
  iny
: sta PPU_DATA
  dex
  bne :-
  jmp Next
```

### Sprite layout（敌人和物体）

同时，敌人和物体（?方块、水管、goomba、koopa）存储在一个完全独立的结构中。每个spawn由2字节定义：

```asm
; SMB1的sprite格式
; Byte 0 : X位置（列）
; Byte 1 : sprite类型 + Y页面位
; Y由序列中的索引推导

一个sprite序列：
  $01 $4B    ; goomba在第1列
  $09 $4B    ; goomba在第9列
  $10 $61    ; ?方块在第16列（含金币）
  $15 $54    ; 绿色koopa在第21列
  $FF        ; 序列结束
```

每个关卡可以引用最多5个不同的sprite页面（即5个16列的"屏幕"），但大多数关卡实际上只使用2-3个。

### 指针表

设计的精妙之处在于指针表。每个关卡存储为一对ROM地址：

```c
// World Map的内部结构（简化）
struct LevelPointer {
    uint16_t tile_ptr;   // Tile数据的ROM地址
    uint16_t sprite_ptr; // Sprite数据的ROM地址
};

// 4个独立的表，每个AreaType一个：
// 0 = Water, 1 = Overworld, 2 = Underground, 3 = Castle
LevelPointer level_table[4][128];
```

每个表128个条目。4种区域类型。**512种可能的组合**，但只有一小部分被官方游戏使用。其余的是未初始化的RAM或被当作指针解释的数据。

当游戏加载关卡时，它这样做：

```asm
; 加载关卡
; A = AreaType (0-3), X = LevelID (0-127)

LoadLevel:
  sta AREA_TYPE
  asl                  ; ×2 用于16位表偏移
  tax
  lda LevelTable_TilePtr, x
  sta TILE_PTR
  lda LevelTable_TilePtr+1, x
  sta TILE_PTR+1       ; 指向tiles的指针
  lda LevelTable_SpritePtr, x
  sta SPRITE_PTR
  lda LevelTable_SpritePtr+1, x
  sta SPRITE_PTR+1     ; 指向sprites的指针
  jsr DecompressTiles
```

没有验证。没有检查指针是否有效。游戏从表中读取地址，解压缩该地址处的数据，就这么简单。

![Level ID $06 (Water) -- 9-1，6-2的水下版本](/images/smb1-glitch-levels/lvl-06-9-1.png)

![Level ID表：128个可能的条目，34个已分配](/images/smb1-glitch-levels/v2-level-id-table.jpg)

![Tile和sprite指针的不同顺序 -- Frankenstein关卡的成因](/images/smb1-glitch-levels/v2-pointer-tables.jpg)

### 34个独立关卡和7位ID系统

![NES的RAM芯片 (MB8416A) -- 它在卡带交换时保留数据](/images/smb1-glitch-levels/v1-ram-chip.jpg)

SMB1不是32个关卡，而是**34个独立关卡**。许多关卡是重复的（5-3 = 1-3 但有Bullet Bills），通过"hard mode"标志区分。真正的独立关卡：

- **水下**（Type 0）：3个关卡（2-2, 7-2, 奖励区域5-2/6-2）
- **Overworld**（Type 1）：22个关卡（包括2个云端奖励房间）
- **Underground**（Type 2）：3个关卡（包括地下奖励房间）
- **Castle**（Type 3）：6个关卡
- \+ 1个过场房间（地下/水下关卡之前）
- \+ 1个4-2的warp zone

每个关卡有一个**7位**的ID。低5位=子组内的编号，高2位=区域类型：

```asm
; Level ID的7位编码
; Bit 6-5 : 类型 (00=Water, 01=Overworld, 10=Underground, 11=Castle)
; Bit 4-0 : 子组内的编号
;
; Water ID      : $00-$02  (类型 00, 编号 0-2)
; Overworld ID  : $20-$35  (类型 01, 编号 0-21)
; Underground ID: $40-$42  (类型 10, 编号 0-2)
; Castle ID     : $60-$65  (类型 11, 编号 0-5)
;
; ID $25 = %0100101 → 类型 01 (Overworld), 编号 5 → 1-1
; ID $23 = %0100011 → 类型 01 (Overworld), 编号 3 → 6-2
```

**128个可能的ID**（$00-$7F），只有34个被分配给真实关卡。未使用的ID指向任何地方。

### 指针表：两个列表，两种顺序

Tile和sprite指针的存储顺序不同。代码使用两个独立的16位列表（高位字节/低位字节分别在两个不同的表中）：

```
Sprite指针的顺序：
  索引 0-5   : Castle (6个关卡)
  索引 6-27  : Overworld (22个关卡)
  索引 28-30 : Underground (3个关卡)
  索引 31-33 : Water (3个关卡)

Tile指针的顺序：
  索引 0-2   : Water (3个关卡)
  索引 3-24  : Overworld (22个关卡)
  索引 25-27 : Underground (3个关卡)
  索引 28-33 : Castle (6个关卡)
```

为什么顺序不同？没有技术原因——可能只是开发过程中数据的组织方式。但这产生了一个令人着迷的后果：当关卡ID无效时，tile和sprite指针会加载*不同的*关卡，创造出**Frankenstein关卡**。

为了在这两个列表之间导航，游戏使用小型**偏移表**（就像目录一样）：

```asm
; 按类型划分的偏移表 (Water, Overworld, Underground, Castle)
; 每个条目 = 对应列表中的起始索引

SpriteOffsetTable:
  .byte $1F, $06, $1C, $00    ; Water=31, Overworld=6, Underground=28, Castle=0

TileOffsetTable:
  .byte $00, $03, $19, $1C    ; Water=0, Overworld=3, Underground=25, Castle=28
```

加载关卡6-2（ID $23, Overworld编号3）：

```asm
; 1. 类型 = 01 (Overworld) → 偏移表中的索引 = 1
; 2. Sprite偏移 = SpriteOffsetTable[1] = 6
;    最终索引 = 6 + 3 (关卡编号) = 9 → 第10个sprite指针
; 3. Tile偏移 = TileOffsetTable[1] = 3
;    最终索引 = 3 + 3 = 6 → 第7个tile指针
; 4. 结果：tile指针 $A619 + sprite指针 $9ED0 = 6-2 ✓
```

那么当ID无效时，比如$43（Underground编号3，实际上不存在）会怎样？

```asm
; ID $43, 类型 = 10 (Underground), 编号 = 3
; Sprite偏移 = SpriteOffsetTable[2] = $1C = 28
;   索引 = 28 + 3 = 31 → 第32个sprite指针 = 水下奖励5-2！
; Tile偏移 = TileOffsetTable[2] = $19 = 25
;   索引 = 25 + 3 = 28 → 第29个tile指针 = 1-4 (Castle)！
;
; 结果：一个地下关卡使用了1-4的tiles
; 和5-2水下区域的Bloopers。一个真正的Frankenstein。
```

![Level ID $43 -- Frankenstein关卡：tiles 1-4 + sprites水下5-2](/images/smb1-glitch-levels/lvl-43-frankenstein.png)

![探索故障关卡指针 -- 偏移表详解](/images/smb1-glitch-levels/yt-pointers.jpg)

![World index表 -- 当world 9溢出时创建的故障关卡](/images/smb1-glitch-levels/v2-world-index-table.jpg)

### World index表：为什么world 9会溢出

有一个8字节的ROM表，给出每个世界（1-8）第一个关卡的索引。紧随其后的是所有36个关卡的Level ID表，按游戏顺序排列。

```asm
; WorldIndexTable (8 bytes)
  .byte 0, 5, 10, 15, 20, 25, 28, 33
;   -> 世界1从关卡0开始
;   -> 世界2从关卡5开始
;   -> 世界8从关卡33开始

; LevelIDTable (36 bytes)
  .byte $25, $28, $29, $26, $24, ... ; 36个Level ID
```

当试图加载world 9时，游戏读取WorldIndexTable的第9个字节……但它不存在。它溢出1个字节到LevelIDTable，读取值$25，然后将$25作为LevelIDTable中的索引（第37个条目）——这又溢出2个字节到SpriteOffsetTable，读取值6。

```asm
; World 9：
;   1. WorldIndexTable[8] (溢出) → 从LevelIDTable读取 $25
;   2. LevelIDTable[37] (溢出) → 读取SpriteOffsetTable的第2个字节 = 6
;   3. ID = 6 → 水下关卡编号6（不存在）
;   4. Tile指针 = 水下第6个指针 = 6-2的tiles
;   5. Sprite指针 = 索引 31+6 = 37 > 33 → 无效指针
;   6. 结果：水下的6-2加上glitch sprites
;      → world 9-1！
```

对于world G（16），溢出更远，落入Level ID $01，这是1-2之前的过场关卡：

```asm
; World G (16)：
;   WorldIndexTable[15] → 从LevelIDTable读取 $01
;   LevelIDTable[1] = $29 (过场 1-2)
;   → world G-1 = 1-2的入场过场
```

## 故障世界为何存在

游戏有32个"合法"关卡（8个世界 × 4个关卡）。但指针表每个区域类型有128个条目。第32个关卡之后的条目包含ROM中这些地址处的数据——有时是另一个关卡，有时是音效数据，有时是RAM，有时是任何东西。

![Level ID $01 Water (Minus World) -- tile指针 $AE45, sprite指针 $A171](/images/smb1-glitch-levels/minus-world.png)

### Level ID $01 + AreaType 0 = Minus World

最著名的故障世界。Level ID $01在AreaType 0（水下）指向：

- **Tile指针：$AE45** → 2-2/7-2的水下区域
- **Sprite指针：$A171** → 2-2/7-2的sprites

结果：一个看起来像2-2的水下关卡，但因为flagpole不存在而无限循环。没有关卡结束，没有出口。

这就是第36-1关（或世界$-1中的36-1）。

![SMB1的warm start检查 -- 它使Minus World得以存在](/images/smb1-glitch-levels/v4-minus-world.jpg)

```asm
; Minus World中flagpole缺失的原因：
; 2-2/7-2的sprites ($A171) 中没有flagpole。
; 游戏搜索sprite $FD (flagpole) 但永远找不到 → 无限循环
;
; 游戏继续无限生成关卡
; 直到计时器归零。
```

### 指向RAM的指针

当tile指针或sprite指针指向RAM地址（$00-$7F）而非ROM时，游戏会尝试将RAM的持续变化解释为tiles：

```asm
; 示例：Level ID $03 在 Water
; Tile指针：$A46B (3-3 - 有效)
; Sprite指针：$009D (指向零页RAM！)
;
; 零页RAM包含游戏的寄存器、
; Mario的位置、计数器状态...
; 游戏将其解压缩为sprite序列，
; 结果是一个敌人实际上是
; 寄存器值的关卡。
```

当零页变化时（因为Mario移动、计时器运行等），关卡的"sprites"也会变化。这就是为什么某些故障世界的敌人会不断闪烁和变形。

![Level ID $03 Water -- sprite指针 $009D 指向RAM，关卡不可玩](/images/smb1-glitch-levels/level-03-water.png)

### Level ID $36：空关卡（Overworld）

Level ID $36在Overworld：

- **Tile指针：$AC35** (1-2)
- **Sprite指针：$A0D8** (1-2)

结果：什么都没有。游戏加载了关卡，但在RGMechEx的目录中标记为"无关卡"。tiles可能是有效的，但sprites指向一个产生空关卡或不可用关卡的位置。

### Level ID $1D (Castle)：崩溃之王

Level ID $1D在Castle：

- **Tile指针：$A210** (4-4)
- **Sprite指针：$7EA0** (RAM！)

Sprite指针在RAM中 = 未定义的sprites。游戏尝试在第一行tiles中显示Spiny ball或Bullet Bill blaster。这会立即崩溃。

```asm
; 当sprite指针指向RAM时，
; 游戏解压缩不断变化的字节
; 作为"生成"指令。结果：
; - 出现不存在的物体（未定义的值）
; - 当NES sprite尝试显示无效tile时PPU崩溃
; - 控制台完全死机
```

## 256个故障世界目录

RGMechEx编写了一个脚本，生成**所有关卡**的地图，覆盖4种区域类型，每种128个ID。

世界计数器是8位的（0-255）。世界1-8是合法的。还剩**248个**潜在的故障世界。每个故障世界对应这个世界的第一关，其Level ID通过WorldIndexTable的溢出机制计算。

![故障世界表 -- 248个损坏的世界，68个可访问的第一关](/images/smb1-glitch-levels/v3-glitch-worlds-table.jpg)

在128个可能的ID中，只有**68个是某个世界的"第一关"**（可通过故障世界编号访问）。其余60个是第2关以上或不可访问的关卡。

| 类型 | 可玩的唯一ID | 会导致崩溃的ID | 空ID |
|------|-------------|---------------|------|
| Water (0)    | ~20  | ~60  | ~48  |
| Overworld (1)| ~30  | ~55  | ~43  |
| Underground (2) | ~15 | ~65 | ~48  |
| Castle (3)   | ~25  | ~58  | ~45  |

许多ID指向相同的关卡，因为指针落在相同的ROM地址上。例如Level ID $28（Overworld）——tile指针 $A7CD (2-1)——出现在**38个不同的故障世界**中，因为其sprite指针 $9F51指向一个被用作填充/音效数据的ROM区域，许多ID共用这段数据。

![关卡 ID $28 (Overworld) 的地图 -- 2-1 tiles 加上正常sprites，38个故障世界](/images/smb1-glitch-levels/level-28-overworld.png)

![Super Mario Bros. Glitch Levels Explained -- 第三个视频](/images/smb1-glitch-levels/yt-levels.jpg)

### 真正独特的6个故障关卡

在19个可访问的glitch level ID中，只有**6个不会在加载时立即崩溃**：

| World | Level ID | 描述 |
|-------|----------|------|
| E-1 (224) | $50 | 深渊上方只有一个?方块。Mario瞬间死亡。 |
| W | $57 | Mario被卡住，无法移动。 |
| 42 (133) | $50 | 云端隧道，Mario走得太远会被困住。 |
| 62 (131, 240) | $4D | 冰冻城堡：Mario出生在顶部，无法下落→被卡住。 |
| 127 | $4B | 地下隧道，但走得太远会崩溃。 |
| 137 | $4B | 激活过场的自动滚动。Mario遇到一个唯一的砖块方块，永远挡住去路。 |

![Level ID $50 (云端隧道) -- 故障世界 42-1 和 E-1](/images/smb1-glitch-levels/lvl-50-cloud.png)
![Level ID $4D (城堡) -- world 62-1，Mario出生时被卡住](/images/smb1-glitch-levels/lvl-4D-castle.png)
![Level ID $4B (隧道) -- world 127-1，走得太远会崩溃](/images/smb1-glitch-levels/lvl-4B-tunnel.png)

248个故障世界中只有6个产生了真正新的东西。其余的是使用了错误区域类型的正常关卡，或者是黑屏。

## 关卡格式详解

深入了解关卡数据的精确格式，理解故障关卡为何能运作（或不能）。

### 关卡头部：2字节，6个属性

每个关卡以一个2字节的头部开始，控制6个属性：

```asm
; Byte 0 : 计时器 + Y起始 + 修改器
;   Bit 7-6 : 计时器 (00=不变, 01=200, 10=300, 11=400)
;   Bit 5-3 : Mario的Y起始 (111/110 = 自动行走)
;   Bit 2-0 : 关卡类型修改器
;              000=默认, 001=波浪, 010=砖墙,
;              011=水底, 100=夜晚, 101=雪,
;              110=雪夜, 111=灰色夜晚

; Byte 1 : 平台 + 背景 + 地面图案
;   Bit 7-6 : 特殊平台 (00=树, 01=蘑菇,
;                         10=Bullet Bill, 11=云)
;   Bit 5-4 : 背景 (00=无, 01=云,
;                   10=山, 11=栅栏)
;   Bit 3-0 : 初始地面图案 (0-15)
```

类型修改器控制视觉变化：水关卡顶部的波浪、8-3的砖块背景、4-3的夜间调色板、6-2的雪景等等。

### Tile物体：2字节，Next Screen Flag，3槽队列

头部之后是**tile物体**列表，每个物体2字节。字节$FD标记列表结束。

```asm
; Tile物体格式 (16位) :
; Byte 0 :
;   Bit 7-4 : X位置 (列 0-15)
;   Bit 3-0 : Y位置
;     Y=0-11  : 正常Y位置
;     Y=12    : 特殊物体（洞、桥、绳子、?方块）
;     Y=13    : 屏幕跳转 / 特殊物体2
;     Y=14    : 修改器/场景/地面切换
;     Y=15    : 特殊物体3（城堡、楼梯、大水管）

; Byte 1 :
;   Bit  7   : NEXT SCREEN FLAG
;   Bit 6-4 : 物体类型 (0-7)
;   Bit 3-0 : 宽度/高度 / 子类型
```

当"next screen"位置位时，当前工作列增加1。这允许在前16列之外放置物体。物体必须**按顺序**列出（从左到右），因为游戏是顺序加载的：

```asm
; 加载例程每列有两阶段：
; 阶段1：查找从此列开始的新物体
;         并将它们添加到队列中
; 阶段2：处理队列中的每个物体（绘制tiles），
;         并移除在此列结束的物体
```

队列正好有**3个槽**。直接后果：同一列上不能有超过3个物体开始。如果队列已满，第4个物体被忽略且永远不会被加载。

这就是为什么精心设计的关卡避免在同一列堆叠太多物体。例如在1-2中：天花板中的1up方块+旁边的砖块被分成两个不同的物体，以遵守3个的限制。

### 特殊Y位置：12, 13, 14, 15

当Y=12时，物体没有Y位置（由类型硬编码）：

```asm
; Y=12 : 无Y位置的物体
;   类型 0 : 洞（删除地面）
;   类型 1 : 移动平台的绳子
;   类型 2-4 : 固定Y的桥
;   类型 5 : 带水/岩浆的洞
;   类型 6-7 : ?方块排
```

当Y=13时，有两个子组。如果byte 1的bit 6为1：

```asm
; Y=13, bit6=1 : 特殊物体
;   0 = L-pipe (过场), 1 = flagpole, 2-3 = 桥/斧头/锤子（城堡结尾）
;   4 = 停止屏幕, 5 = 随机敌人, 6 = 循环关卡, 7+ = 可能崩溃
```

如果bit6=0，低5位编码一个**屏幕跳转**（直接跳到第N个屏幕，不用一个个通过next screen flag）。

当Y=14时：相同原理，bit6=1更改类型修改器，bit6=0更改背景+地面图案。

### 地面图案：16种地面模式

关卡的地面不是由单个物体组成的。SMB1使用**地面图案**，一个应用于所有列的背景模式，直到下一次更改：

```asm
; 地面图案 (4位 = 16种可能)
;   0 = 完全空白
;   1 = 2个tile高的地面
;   2 = 1个tile高的地面
;   3 = 地面 + 底部
;   4 = 地面 + 底部2
;   5 = 1/2 tile高的地面
;   6 = 3/4 地面
;   ... 直到 15 = 完全填充（地面 + 天花板）
```

这就是为什么洞是物体：它们在特定列覆盖地面图案，而不必为其余部分更改图案。

### 256字节限制和repeat

一个关卡的所有tile数据最多占**256字节**。6502的Y寄存器用作索引，它是8位的。如果游戏到达数据末尾时未找到$FD字节，**它会回到开头**并无限重复256字节：

```asm
; 索引Y = 8位 → 最多256字节的tile数据
; 如果Y溢出 (255 → 0) 且未遇到 $FD → 重复
; sprites也是如此，但水管物体 (3字节)
; 会在每次加载时改变索引的奇偶性。
```

某些故障关卡利用这个repeat来生成"无限持续"的关卡。

### Sprite系统：2字节 + 水管过渡

Sprites使用类似的格式，但没有头部，且有一些关键差异。字节$FF标记列表结束。

```asm
; Sprite格式 (2字节) :
; Byte 0 : X位置 (列)
; Byte 1 :
;   Bit 7 : NEXT SCREEN FLAG
;   Bit 6-0 : sprite类型
;       某些类型包括：goomba, koopa, Blooper,
;       Bullet Bill, Lakitu, Spiny, 平台,
;       warp zone命令, toad/公主,
;       敌人群生成命令
```

Byte 1的最低位是**hard level flag**：如果置1，该sprite只出现在≥ 5-3的关卡中。这就是"hard mode"关卡的创建方式。

Y位置15 = **屏幕跳转**（与tiles相同）。Y位置14 = **水管过渡**（3字节）：

```asm
; Sprite Y=14 : 水管/藤蔓过渡 (3字节！)
;   Byte 0 : X位置
;   Byte 1 : bit 6-0 = 7位Level ID (目的地)
;   Byte 2 : bit 4-0 = 目标屏幕
;            bit 7-5 = 该过渡有效的世界
;
; 为什么要指定世界？奖励房间在不同世界之间复用。
; 例如：1-1的奖励房间也被2-1和7-1使用。
; 这个房间有3个过渡，每个世界一个，
; 让Mario在正确的位置重新出现。
```

Sprites**没有队列系统**。唯一的限制是在spawn区域（屏幕右侧外）中不能同时加载超过4个sprites。超过的sprites会被忽略。

## 如何访问故障世界

有两种主要方法。

### 经典方法：wall clip

Wall clip（穿墙）允许你离开正常关卡，走到隐藏的warp zone。通过RAM操纵世界计数器，你可以加载任何Level ID。

技术要点：
1. World 1-2：进入隐藏的结尾水管
2. 在右侧墙壁做wall clip
3. 走到空白区域直到warp zone
4. 游戏将值解释为世界

但这种方法只能访问一小部分故障世界。

### 极端方法：NES Tennis卡带交换

参见上方"Warm Start"部分了解完整细节。简而言之：Tennis的脚步计数器写入与SMB1启动世界相同的RAM字节，warm start检测保留了这个值。

### 修改者专区：全面探索的代码

如果你想在模拟器中自行探索所有故障关卡，可以直接修改Level ID：

```asm
; FCEUX / Mesen的补丁：
; RAM地址 $075F = 当前Level ID
; RAM地址 $0760 = Area Type (0=Water, 1=Overworld, 2=Underground, 3=Castle)

; 示例：在Overworld加载关卡57 (0x39)
; 在模拟器中，打开内存追踪器并写入：
; $075F = 0x39
; $0760 = 0x01
; 然后进入warp水管或死亡后重新开始
; → 游戏在Overworld加载关卡ID $39
```

RGMechEx在 [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html) 上发布了完整的128关卡 × 4类型列表及自动生成的地图。每个条目显示tile指针、sprite指针和关卡的可视化地图。

## 最离谱的关卡

### Level ID $1F (Water)：15个故障世界合而为一

Tile指针 $A302 (3-4) 加上sprite指针 $02A0 产生15个不同的故障世界（D-1, J-1, Y-1, Z-1, 55-1, 73-1...）。解释：sprite指针指向一个ROM区域，其中的数据足够接近有效sprites，能产生可玩的结果，但城堡3-4的tiles与overworld sprites的组合创造了荒谬的渲染。

### Level ID $28 (Overworld)：38个故障世界 = 纪录

绝对纪录。38个故障世界条目指向同一个关卡（2-1 tiles + $9F51 sprites）。为什么？因为sprite指针 $9F51落在一个被用作填充/音效数据的ROM区域，许多ID共用这段数据。

### Level ID $49 (Underground)：FDS关卡

Tile指针 $76AE + sprite指针 $1C9D。Tile指针指向为Famicom Disk System版本保留的ROM区域。结果：一个包含标准卡带中不存在的tiles的关卡。这就是产生52-1和196-1关卡的那个。

### Level ID $00-$02：真正的奖励关卡

这些ID被游戏的合法子关卡使用：

- **$00**：5-2/6-2的水下区域（被H-1, 39-1使用）
- **$01**：2-2/7-2的水下（Minus World, 36-1）
- **$02**：8-4的子关卡（136-1, 151-1, 215-1）

正常可访问的"奖励"关卡和故障世界的区别在于，warp zone会验证当前世界：

```asm
; Warp zone验证（简化）
; 游戏验证目标世界在1到8之间
CheckWarp:
  lda TARGET_WORLD
  cmp #1
  bcc InvalidWarp       ; < 1 → 拒绝
  cmp #9
  bcs InvalidWarp       ; > 8 → 拒绝
  ; 只有1到8之间的世界有效
  jmp DoWarp
```

编号> 8或0的故障世界无法通过正常水管到达。需要wall clip或卡带交换。

## 为什么某些关卡崩溃：Jump Table

当游戏加载tile物体时，它使用物体类型作为**跳转表**中的索引：

```asm
; 标准tile物体跳转表 (类型 0-11)
JumpTable_TileObjects:
  .word Obj_Special       ; 类型 0 : ?方块, 隐藏方块, flagpole...
  .word Obj_Platform      ; 类型 1 : 特殊平台
  .word Obj_BrickRow      ; 类型 2 : 砖块排
  .word Obj_BlockRow      ; 类型 3 : 方块排
  .word Obj_CoinRow       ; 类型 4 : 金币排
  .word Obj_BrickCol      ; 类型 5 : 砖块列
  .word Obj_BlockCol      ; 类型 6 : 方块列
  .word Obj_Pipe          ; 类型 7 : 水管
  .word Obj_8             ; 类型 8
  .word Obj_9             ; 类型 9
  .word Obj_10            ; 类型 10
  .word Obj_11            ; 类型 11
```

![Jump Table：为什么无效的物体类型会导致游戏崩溃](/images/smb1-glitch-levels/v4-jump-table.jpg)

如果物体有一个无效类型（≥12），游戏会跳转到一个在此表中不存在的指针。**4种可能的结果**：

1. **有效指针** → 物体正常加载
2. **指向另一个跳转表的指针**（重叠） → 出现不同的物体。例如：类型12指向Y=13的表，这会产生一个L-pipe。
3. **指向可执行代码的指针** → 执行随机代码（可能崩溃）
4. **显式占位符（NOP）** → 物体不做任何事（某些sprites就是这样，在原地飘动而不移动的敌人）

![故障关卡 ID $58：sprite指针指向无效地址，游戏崩溃](/images/smb1-glitch-levels/v4-glitch-58-crash.jpg)

![故障关卡 ID $50：云端隧道，由损坏数据生成的关卡](/images/smb1-glitch-levels/v4-glitch-50.jpg)

故障关卡ID $58（会崩溃的隧道）：其sprite指针指向一个在**无mapper ROM的NES上不存在**的内存区域。游戏尝试以每帧5次的频率在位置(0,0)加载同一个Koopa，导致PPU饱和并死机。

```asm
; ID $58 崩溃的原因：
; Sprite指针 → 无效地址（超出NES标准空间）
; → 游戏将不确定的字节读取为sprite类型
; → $00 Koopa（无处理程序的无效类型）进行递归调用循环
; → 6502栈溢出 → 死机
```

### 水管warp悖论

还记得检查 `target_world BETWEEN 1 AND 8` 吗？即使你在故障世界中找到一个水管，游戏也会验证目标世界在1到8之间。故障世界的编号> 8（36-1, 255-1...），因此warp会失败。

Minus World没有终点也是因为这个：flagpole不在sprites中，水管也不通向任何地方。

### 每列5个物体的技巧

存在一个边缘情况，可以突破每列3个物体的限制。当队列阻塞（槽位已满 + 下一个物体缺少next screen flag）时，游戏会在当前列"预处理"循环直到找到带有next screen flag的物体。在每次预处理期间：

```asm
; 在列预处理期间：
; 1. 队列中的物体在每次"假进列"时
;    宽度递减
; 2. 如果物体达到宽度=0，它会离开队列
; 3. 释放的槽位可以被添加到同一列的
;    新物体填充

; 结果：同一列上最多可以处理5个物体。
; 技巧：放置2个跨越屏幕边界的物体
; （槽位1和2），1个X < 前一个的虚拟物体（阻塞队列），
; 然后3个X=0的下一个屏幕的物体（其中一个是next screen flag）。
```

这被称为"队列跳转"，被某些romhackers用来创建比格式正常允许的更密集的关卡。

## 不同版本之间的差异

### Famicom Disk System

SMB1的FDS版本有不同的**内存映射**。所有关卡指针都偏移了，但数据是相同的。变化之处：故障世界的索引完全不同：

```
FDS World 36 → Level ID $09 (5-3的水下版本)
  → flagpole存在！可以完成关卡。
  → 接着：$27 (正常的7-3) → $44 (地下的4-4)
  → $44可以完成 → 斧头有效 → 游戏通关！
  
FDS的Minus World因此是一个可以通向
游戏通关的"奖励世界"，与NES版本不同。
```

我最喜欢的FDS关卡：**ID $5F**，3-3后半段的地下版本，低矮隧道（可惜是一个自动卷轴关卡）。

### The Lost Levels（日本版Super Mario Bros. 2）

Lost Levels改变了许多东西：

1. **Tile/sprite相同顺序**：不再有Frankenstein关卡（即使ID无效，tiles和sprites也加载相同的关卡）
2. **单一16位指针表**，取代了两个独立的high/low表
3. **4个磁盘文件**：ROM为FDS而拆分：
   - 文件1：世界1-4
   - 文件2：世界5-8
   - 文件3：世界9 + 音效引擎
   - 文件4：世界A-D（完全不同的指针表）
4. **相同Level ID = 根据加载的文件有4种可能的关卡**
5. **没有Tennis glitch**：continue选项（game over后继续到相同世界）使warm start变得不必要，如果world > 9游戏会**立即重置**
6. **新物体**：毒蘑菇、隐形方块、隐形火力花方块、倒置水管、风——但插入在现有列表中间 → **与SMB1不兼容**
7. **Piranha Plants在world 4后总是红色的**，**springboards只在world 2/B/3/C/7是绿色的**

### Super Mario All-Stars (SNES)

直接移植，使用相同的6502例程（SNES以兼容模式执行NES代码）：

- **Warp zone修复**：不再有Minus World（在文本前进入左侧水管到达正确世界）
- **崩溃**：大多数故障关卡崩溃（ID $6A和9-1除外）
- **城堡物体添加**：渲染更加独特
- **但是**：**4-2错误warp**仍然有效（未修复！）

### 4-2错误warp：一个物体放置bug

在4-2中，有两个水管过渡物体：藤蔓（warp zone）和水管（金币房间）。第一个过渡物体（藤蔓的）放置在**藤蔓出现在屏幕上之前很远**的位置。第二个（水管的）放置在**关卡中太晚**的位置。

```asm
; 4-2中的过渡时序：
; 过渡物体1 (藤蔓 → warp zone)：在藤蔓之前3个屏幕放置
; 过渡物体2 (水管 → 金币房间)：在水管之后1个屏幕放置
;
; 通常第一个物体会在Mario到达水管前被禁用。
; 但如果Mario速度很快（或使用B+右方块的快捷方式），
; 藤蔓的过渡在他碰到水管时仍然有效！
; → 游戏加载warp zone而非金币房间。
;
; 如果物体放在藤蔓之后但水管之前，
; 这个bug就不会存在。
```

### 循环关卡

Loop关卡（8-4, 7-4）如何工作？关卡有**检查点**，包含硬编码的屏幕编号和Y位置：

```asm
; 检查点：{screen_number, vertical_position}
; 如果Mario以正确的高度通过此检查点 → 关卡继续
; 否则 → 回退4个屏幕 (64 blocks)
;
; 要实现无限循环：vertical_position = $F0
; （在屏幕底部下方） → 无法通过。
;
; 检查点很简单（只有一个flag），除了world 7
; 它使用三元组（3个flag，至少要失败1个）
;
; 回退很粗暴：tile data偏移设置为硬编码值，
; sprite data偏移重置为0。存在的敌人
# 立即卸载 → firebars消失。
```

## 改变格式，不改变代码

这个架构最令人着迷的教训之一是，SMB1的开发者在不修改6502渲染代码的情况下，创造了一个非常有表现力的关卡系统。所有关卡之间的变化都来自**数据**（指针、物体、sprites、地面图案），而非代码。

256个故障世界存在是因为**指针表为128个条目 × 4种类型做了空间分配**，且游戏从不验证读取的值。当指针落在RAM中时，游戏将Mario的寄存器解释为tiles。当指针落在音效数据中时，游戏将音乐当作关卡设计来播放。当jump table溢出时，游戏执行任何东西直到崩溃。

![More Super Mario Bros. Mechanics Explained -- 第四个视频](/images/smb1-glitch-levels/yt-mechanics.jpg)

## 从中可以学到什么

1. **Tile/Sprite分离**：两层完全独立，不同的存储顺序创造了独特的Frankenstein关卡
2. **RLE压缩 + 物体系统**：关卡不是位图而是放置的物体列表，使用地面图案处理地面
3. **3槽队列**：硬件（和关卡设计）的严格限制
4. **无验证**：游戏信任指针和jump table，这产生了可玩的glitch或崩溃
5. **最大256字节**：6502 Y寄存器的限制，使得数据在走得太远时会重复
6. **Warm start / cold start**：一个"继续"系统为Tennis卡带交换 → Mario打开了大门

最精彩的是：这一切都是40KB中的6502代码。没有抽象层，没有内存访问验证，没有异常处理器。如果指针是垃圾，游戏就崩溃。而这些崩溃，我们称之为故障世界。

## 3个要点

1. **故障世界是落在错误位置的指针** -- 游戏有128个ID × 4种区域类型，但只有34个独立关卡。当世界编号被损坏（通过Tennis或wall clip）时，游戏加载一个为其他关卡设计的指针，512种可能组合产生不可预测的结果。

2. **Minus World是warp bug加上损坏** -- 1-2中的左侧水管，如果在文本出现前激活，会加载world 36 (0x24)。这个world指向Level ID $01（2-2的水下），一个没有flagpole的关卡。由于world 36没有水管过渡，关卡无限循环。缺少验证创造了这个标志性的glitch。

3. **Tennis → Mario，比OoT → Paper Mario早15年** -- NES的RAM在卡带交换中存活，得益于电容器和SMB1的warm start / cold start系统。Tennis的脚步计数器（通过播放脚步音效递增RAM字节）恰好落在世界编号的地址上。需要最高分数字保持为0、$A5字节完好、且游戏检测到warm start——一个只与Tennis一起成功的完美巧合。

[Retro Game Mechanics Explained](https://www.youtube.com/c/RetroGameMechanicsExplained) 的原始视频是令人叹为观止的细致工作——6502反汇编的详细程度、所有关卡的自动地图、卡带交换和warm start的解释。如果你还没看过这个系列，去看，很短，每一分钟都是干货。

地图的源代码在 [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html) 上，SMB1的完整反汇编是开源的，在多个仓库中。40年前，日本程序员用6502编写了这个关卡系统，没有单元测试，没有bug追踪器，而我们今天打开他们的代码仍然能学到东西。
