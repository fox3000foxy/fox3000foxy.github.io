---
title: "Super Mario Bros.: تنسيق المستوى، المؤشرات، و256 عالم خلل"
description: "كيف يتسع 128 مستوى × 4 أنواع منطقة في 40 كيلوبايت من ROM، ولماذا ي Exists Minus World، وكيف يمكن لمباراة تنس NES أن تحمّل عوالم الخلل."
date: 2026-06-10authors:
  - fox3000foxy
tags:
  - retro
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "Jy5ZotjVtegQiaD0cZ7QUKNZBF/e0ptraukbuTKLrQykMDY1SfuooLfuFtg2rvkx5747LibtaVLVrPtv4oYPyg=="
---

## المقدمة

Super Mario Bros. هو 40 كيلوبايت من ROM. ثمانية عوالم، 32 مستوى، أعداء، موسيقى، قوى خارقة، كل ذلك يتسع في ذلك.

لكن إذا فتحت محاكيًا وعبثت بالبايتات الصحيحة، يمكنك تحميل المستوى 36-1. أو 255-1. أو الهبوط في عالم تكون فيه كل شيء مصنوع من سبرايتات Bowser وأنابيب تؤدي إلى لا مكان.

هذه العوالم الخاطئة (Glitch Worlds) موجودة لسبب بسيط: نظام تخزين مستويات SMB1 هو عبارة عن تحفة من التحسين على 8 بت، وعندما تجبر اللعبة على القراءة من المكان الخطأ، فهي تنتج نتائج مثيرة.

قام Retro Game Mechanics Explained بعمل سلسلة من 4 مقاطع فيديو حول هذا الموضوع -- وسنجمعها في غوص واحد في كود 6502 لأكثر لعبة مبيعاً في ذلك العصر.

![GLITCH OBJECTS -- عنوان سلسلة RGMechEx حول آليات SMB1 المخفية](/images/smb1-glitch-levels/title-card.jpg)

![World 9-1 -- شاشة العنوان لأول عالم خلل يمكن الوصول إليه عبر تبادل كارترidge Tennis](/images/smb1-glitch-levels/v1-title-9-1.jpg)

## البدء الدافئ: لماذا تبقى ذاكرة RAM من Tennis في SMB1

قبل التحدث عن تخزين المستويات، يجب أن نفهم كيف يبدأ SMB1. لأن خلل تبادل الكارترidge في NES Tennis يعتمد بالكامل على **نظام اكتشاف البدء الدافئ / البدء البارد** في اللعبة.

### البايتات الحادية والأربعون المحفوظة

عندما يكتشف SMB1 **بدءًا باردًا** (تشغيل لأول مرة أو إيقاف/تشغيل)، يمسح جميع ذاكرة RAM. لكن عندما يكتشف **بدءًا دافئًا** (إعادة تشغيل الزر، دون قطع الطاقة)، يحتفظ بمنطقة ذاكرة تحتوي على **41 بايت**:

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

هذه البايتات الحادية والأربعون تخدم وظيفة واحدة فقط: السماح للاعب **بالاستمرار في نفس العالم بعد خسارة اللعبة**. إذا مت في 6-3، تكتب اللعبة العالم 6 في بايت البداية، وعند شاشة العنوان، إذا ضغطت A + Start، تبدأ من جديد في 6-1.

![البايتات الحادية والأربعون المحفوظة في ذاكرة RAM أثناء البدء الدافئ -- TOP SCORE, MARIO SCORE, TIMER, WORLD SELECT, CONTINUE WORLD, والبايت السحري $A5](/images/smb1-glitch-levels/v1-memory-state.jpg)

### الفحص المزدوج للبدء الدافئ

![البدء البارد مقابل البدء الدافئ -- مخطط اكتشاف إعادة التشغيل](/images/smb1-glitch-levels/v1-warm-start.jpg)

عندما يعمل SMB1، لا يتحقق من معيار واحد فقط بل **معيارين**:

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

![فحص البايت $A5 وأرقام أعلى نقاط -- جوهر البدء الدافئ](/images/smb1-glitch-levels/v1-a5-byte.jpg)

لماذا فحص مزدوج؟ لأن البايت $A5 قد يكون موجودًا بالصدفة (لعبة أخرى تترك هذه القيمة، أو حالة الراحة الافتراضية لشريحة RAM). بالتحقق من أن أرقام أعلى نقاط صالحة (0-9)، نضمن أن البيانات متسقة.

### لماذا Tennis هو اللعبة الوحيدة التي تعمل

عندما تدخل SMB1 لأول مرة (بدء بارد)، تقوم اللعبة:
1. بمسح جميع ذاكرة RAM ← أعلى نقاط = 0، بايت العالم = 0
2. بكتابة $A5 على العنوان $0787

بعد ذلك، تتحول إلى Tennis دون إيقاف جهاز التحكم. Tennis:
- **لا ينظف ذاكرة RAM عند بدء التشغيل** (قليل من ألعاب NES يفعل ذلك)
- **لا يكتب على بايتات أعلى نقاط** ← تبقى عند 0 (صالحة)
- **لا يلمس البايت $A5** ← يبقى موجودًا
- **يستخدم العنوان $075F** لعداد خطوات اللاعب

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

عندما تعيد SMB1:
1. البايت $A5 لا يزال موجودًا (Tennis لم يلمسه)
2. أرقام أعلى نقاط لا تزال 0 (صالحة)
3. بايت العالم يساوي الآن 8+ (زاد بسبب خطوات Tennis)
4. SMB1 يكتشف بدءًا دافئًا ← يحتفظ ببايت العالم المتلف
5. ضغط A + Start ← World 9-1, World A-1, World 36-1، إلخ

### لماذا يجب تشغيل Mario قبل Tennis

تفاصيل دقيقة: يجب تشغيل SMB1 أولاً، ثم Tennis، ثم SMB1 مرة أخرى. إذا بدأت مباشرة بـ Tennis، لن يُكتب البايت $A5 أبدًا (Tennis لا يكتب $A5)، لذلك سيفشل اكتشاف البدء الدافئ وتمسح ذاكرة RAM.

![عداد خطوات Tennis: كل خطوة تزيد بايت العالم](/images/smb1-glitch-levels/v1-footstep.jpg)

![الوصول إلى عوالم الخلل عبر NES Tennis -- الفيديو الذي يشرح تبادل الكارترidge](/images/smb1-glitch-levels/yt-tennis.jpg)

## كيفخزّن SMB1 مستوياتها في 40KB

اجبرت R&D4 في نينتندو على حل مشكلة تبدو بسيطة: تمثيل مستويات تتحرك أفقيًا باستخدام بلاطات، أعداء، عناصر، وكل ذلك في ميزانية ROM ضيقة للغاية.

الحل هو فصل البيانات إلى طبقتين **مستقلتين تمامًا**:

### تخطيط البلاطات (خريطة المستوى)

يُعرّف كل مستوى بمؤشر يشير إلى بنية بلاطات مضغوطة في ROM. الضغط بدائي لكنه عبقري: بايت "تحكم" متبوع بـ 1-3 بايتات بيانات.

يستخدم تنسيق البلاطات نظام **تسلسلات** (يشبه RLE):

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

يحتوي كل مستوى على 13 صفًا من 16 عمودًا من البلاطات (13×16 = 208 بلاطة مرئية). لكن التنسيق المضغوط يسمح بالانخفاض أكثر بكثير -- على سبيل المثال، السماء والأعمدة الفارغة لا تشغل تقريبًا أي مكان.

حلقة العرض في 6502:

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

### تخطيط السبرايتات (الأعداء والأشياء)

بشكل متزامن، الأعداء والأشياء (بلوكات ؟، أنابيب، goombas، koopas) مخزنة في بنية منفصلة تمامًا. كل ظهور يُعرّف بـ 2 بايت:

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

يمكن لكل مستوى الإشارة إلى ما يصل إلى 5 صفحات سبرايتات مختلفة (أو بدقة، 5 "شاشات" من 16 عمودًا)، لكن في الممارسة العملية معظم المستويات لا تستخدم سوى 2-3.

### جدول المؤشرات

العبقرية في التصميم هي جدول المؤشرات. كل مستوى مخزون ك**زوج** من عناوين ROM:

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

128 إدخالًا لكل جدول. 4 أنواع منطقة. **512 تركيبة ممكنة**، لكن فقط جزء منها مستخدم من اللعبة الرسمية. الباقي هو RAM غير مهيأة أو بيانات يتم تفسيرها كمؤشرات.

عندما تحمّل اللعبة مستوى، تفعل ما يلي:

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

لا تحقق. لا فحص ما إذا كان المؤشر صالحًا. تقرأ اللعبة العنوان في الجدول وتضغط ما يوجد على هذا العنوان، نقطة نهاية.

![Level ID $06 (Water) -- 9-1، الإصدار تحت الماء من 6-2](/images/smb1-glitch-levels/lvl-06-9-1.png)

![جدول Level IDs: 128 إدخالًا ممكنًا، 34 معينًا](/images/smb1-glitch-levels/v2-level-id-table.jpg)

![الترتيب المختلف لمؤشرات البلاطات والسبرايتات -- سبب المستويات الكائن فرانكنشتاين](/images/smb1-glitch-levels/v2-pointer-tables.jpg)

### الـ 34 مستوى فريدًا ونظام المعرّف 7 بت

![شريحة RAM في NES (MB8416A) -- هي التي تحافظ البيانات عند تبادل الكارترidgeات](/images/smb1-glitch-levels/v1-ram-chip.jpg)

ليس لدى SMB1 32 مستوى، بل **34 مستوى فريدًا**. كثير من المستويات مكررة (5-3 = 1-3 لكن مع Bullet Bills) وulozhyz بعلم "الوضع الصعب". المستويات الفريدة الحقيقية:

- **الماء** (النوع 0): 3 مستويات (2-2، 7-2، منطقة مكافأة 5-2/6-2)
- **العالم العلوي** (النوع 1): 22 مستوى (بما في ذلك غرفتي مكافأة السحاب)
- **تحت الأرض** (النوع 2): 3 مستويات (بما في ذلك غرف المكافأة تحت الأرض)
- **القلعة** (النوع 3): 6 مستويات
- \+ 1 غرفة مشهد (قبل المستويات تحت الأرض/الماء)
- \+ 1 منطقة تéléchargement من 4-2

لكل مستوى معرّف على **7 بت**. الـ 5 بت الأقل وزنًا = رقم في المجموعة الفرعية، والـ 2 بت الأعلى وزنًا = نوع المنطقة:

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

**128 معرّفًا ممكنًا** ($00-$7F)، فقط 34 معرّفًا معينًا لمستويات حقيقية. المعرّفات غير المستخدمة تشير إلى أي شيء.

### جداول المؤشرات: قائمتان، ترتيبان

مؤشرات البلاطات والسبرايتات ليست مخزنة بنفس الترتيب. يستخدم الكود قائمتين منفصلتين من 16 بت (بايت عالي/بايت منخفض في جدولين مختلفين):

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

لماذا ترتيبان مختلفان؟ لا يوجد سبب فني -- من المحتمل أنه بهذه الطريقة تم تنظيم البيانات أثناء التطوير. لكن هذا يخلق نتيجة مثيرة: عندما يكون معرّف مستوى غير صالح، تحمل مؤشرات البلاطات والسبرايتات مستويات *مختلفة*، مما يخلق **مستويات فرانكنشتاين**.

للتنقل بين هاتين القائمتين، تستخدم اللعبة **جداول إزاحة صغيرة** (مثل جدول محتويات):

```asm
; Tables d'offset par type (Water, Overworld, Underground, Castle)
; Chaque entrée = index de début dans la liste correspondante

SpriteOffsetTable:
  .byte $1F, $06, $1C, $00    ; Water=31, Overworld=6, Underground=28, Castle=0

TileOffsetTable:
  .byte $00, $03, $19, $1C    ; Water=0, Overworld=3, Underground=25, Castle=28
```

لتحميل المستوى 6-2 (Mعرّف $23، العالم العلوي رقم 3):

```asm
; 1. Type = 01 (Overworld) → index dans table d'offset = 1
; 2. Sprite offset = SpriteOffsetTable[1] = 6
;    Index final = 6 + 3 (numéro de niveau) = 9 → 10ème pointeur sprites
; 3. Tile offset = TileOffsetTable[1] = 3
;    Index final = 3 + 3 = 6 → 7ème pointeur tiles
; 4. Résultat : pointeur tiles $A619 + pointeur sprites $9ED0 = 6-2 ✓
```

الآن، ماذا يحدث مع معرّف غير صالح مثل $43 (تحت الأرض رقم 3، الذي لاExists)؟

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

![Level ID $43 -- مستوى فرانكنشتاين: بلاطات 1-4 + سبرايتات ماء 5-2](/images/smb1-glitch-levels/lvl-43-frankenstein.png)

![استكشاف مؤشرات مستوى الخلل -- جداول الإزاحة المفسرة](/images/smb1-glitch-levels/yt-pointers.jpg)

![جدول فهرس العالم -- عندما يسبب تجاوز World 9 مستوى خلل](/images/smb1-glitch-levels/v2-world-index-table.jpg)

### جدول فهرس العالم: لماذا يتجاوز World 9

هناك جدول ROM من 8 بايتات يعطي فهرس أول مستوى لكل عالم (1-8). وبعده مباشرة، جدول الـ 36 معرّف مستوى لجميع المستويات بترتيب اللعب.

```asm
; WorldIndexTable (8 bytes)
  .byte 0, 5, 10, 15, 20, 25, 28, 33
;   -> Monde 1 commence au niveau 0
;   -> Monde 2 commence au niveau 5
;   -> Monde 8 commence au niveau 33

; LevelIDTable (36 bytes)
  .byte $25, $28, $29, $26, $24, ... ; les 36 Level IDs
```

عندما تحاول تحميل World 9، تقرأ اللعبة البايت التاسع من WorldIndexTable... الذي لاExists. يتجاوزه ببايت واحد إلى LevelIDTable، يقرأ القيمة $25، ثم يستخدم $25 كفهرس في LevelIDTable (الإدخال 37) -- مما يتخطى مرتين في SpriteOffsetTable ويقرأ القيمة 6.

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

لـ World G (16)، يتجاوز التخطي أبعد ويرسخ على Level ID $01، وهو مستوى المشهد الذي يسبق 1-2:

```asm
; World G (16) :
;   WorldIndexTable[15] → lit $01 dans LevelIDTable
;   LevelIDTable[1] = $29 (cutscene 1-2)
;   → world G-1 = la cutscene d'entrée de 1-2
```

## لماذا توجد عوالم الخلل

تiliki اللعبة 32 مستوى "شرعيًا" (8 عوالم × 4 مستويات). لكن جدول المؤشرات يحتوي على 128 إدخالًا لكل نوع منطقة. الإدخالات التي تتجاوز المستوى 32 تحتوي على ما يوجد في ROM على هذه العناوين -- أحيانًا مستوى آخر، وأحيانًا بيانات صوتية، وأحيانًا RAM، وأحيانًا أي شيء.

![Level ID $01 Water (Minus World) -- مؤشر البلاطات $AE45، مؤشر السبرايتات $A171](/images/smb1-glitch-levels/minus-world.png)

### Level ID $01 + AreaType 0 = Minus World

أشهر عوالم الخلل. Level ID $01 في AreaType 0 (ماء) يشير إلى:

- **مؤشر البلاطات: $AE45** ← المنطقة تحت الماء من 2-2/7-2
- **مؤشر السبرايتات: $A171** ← سبرايتات 2-2/7-2

النتيجة: مستوى ماء يشبه 2-2، لكنه يتكرر إلى الأبد لأن عمود العلم (flagpole) لا Exists. لا نهاية للمستوى، لا مخرج.

هذا هو المستوى 36-1 (أو 36-1 في العالم $-1).

![فحص البدء الدافئ في SMB1 -- هو الذي يسمح لـ Minus World بالوجود](/images/smb1-glitch-levels/v4-minus-world.jpg)

```asm
; Pourquoi le flagpole manque dans le Minus World :
; Les sprites de 2-2/7-2 ($A171) n'ont pas de flagpole
; dans leur séquence. Le jeu cherche le sprite $FD (flagpole)
; mais ne le trouve jamais → boucle infinie
;
; Le jeu continue de générer le niveau à l'infini
; jusqu'à ce que le timer atteigne zéro.
```

### المؤشرات التي تشير إلى الذاكرة RAM

عندما يشير مؤشر البلاطات أو مؤشر السبرايتات إلى عنوان في RAM ($00-$7F) بدلاً من ROM، تحاول اللعبة تفسير التغييرات المستمرة في RAM كبلاطات:

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

عندما تتغير الصفحة الصفرية (لأن Mario يتحرك، أو المؤقت يدور، إلخ)، تتغير "سبرايتات" المستوى أيضًا. لهذا السبب بعض عوالم الخلل بها أعداء يتوهجون ويتحولون باستمرار.

![Level ID $03 Water -- مؤشر السبرايتات $009D يشير إلى RAM، مستوى غير قابل للعب](/images/smb1-glitch-levels/level-03-water.png)

### Level ID $36: المستوى الفارغ (العالم العلوي)

Level ID $36 في العالم العلوي:

- **مؤشر البلاطات: $AC35** (1-2)
- **مؤشر السبرايتات: $A0D8** (1-2)

النتيجة: لا شيء. تحمل اللعبة المستوى لكنه مulozhenn "بدون مستوى" في كتالوج RGMechEx. البلاطات قد تكون صالحة لكن السبرايتات تشير إلى مكان ينتج مستوى فارغًا أو غير قابل للتشغيل.

### Level ID $1D (Castle): بطل الأعطال

Level ID $1D في القلعة:

- **مؤشر البلاطات: $A210** (4-4)
- **مؤشر السبرايتات: $7EA0** (RAM !)

مؤشر السبرايتات في RAM = سبرايتات غير معرفة. تحاول اللعبة عرض Spiny ball أو Bullet Bill blaster في صف البلاطات الأول. يتعطل فورًا.

```asm
; Quand le sprite pointer pointe vers la RAM,
; le jeu décompresse des bytes qui changent tout le temps
; comme des instructions "spawn". Le résultat :
; - Apparition d'objets inexistants (valeur undefined)
; - Crash PPU quand le sprite NES essaie d'afficher un tile invalide
; - Freeze complet de la console
```

## الـ 256 عالم خلل الموثقة

كتب RGMechEx نصًا يولّد خرائط **جميع المستويات**، لأنواع المنطقة الأربعة، والـ 128 معرّفًا لكل منها.

عداد العالم على 8 بت (0-255). العوالم 1-8 شرعية. تبقى **248 عالم خلل** محتملًا. كل عالم خلل يتوافق مع أول مستوى لذلك العالم، ويتم حساب معرّف مستوى عن طريق آلية تجاوز WorldIndexTable.

![جدول عوالم الخلل -- 248 عالمًا متلفًا، 68 مستوى أول يمكن الوصول إليها](/images/smb1-glitch-levels/v3-glitch-worlds-table.jpg)

من بين الـ 128 معرّفًا ممكنًا، فقط **68 هي "مستوى أول" لعالم** (يمكن الوصول إليها عبر رقم عالم الخلل). الـ 60 الأخرى هي مستويات 2+ أو غير قابلة للوصول.

| النوع | معرّفات قابلة للعب فريدة | معرّفات تسبب تعطل | معرّفات فارغة |
|------|--------------------------|-------------------|-----------|
| الماء (0)    | ~20  | ~60  | ~48  |
| العالم العلوي (1)| ~30  | ~55  | ~43  |
| تحت الأرض (2) | ~15 | ~65 | ~48  |
| القلعة (3)   | ~25  | ~58  | ~45  |

كثير من المعرّفات تؤدي إلى نفس المستوى بسبب المؤشرات التي تقع على نفس العناوين ROM. Level ID $28 (العالم العلوي) على سبيل المثال -- مؤشر البلاطات $A7CD (2-1) -- يظهر في **38 عالم خلل مختلفًا**، لأنه مؤشر السبرايتات $9F51 يشير إلى منطقة في ROM تستخدم كحشو/بيانات صوتية يعيد استخدامها كثير من المعرّفات.

![خريطة المستوى ID $28 (العالم العلوي) -- بلاطات 2-1 مع سبرايتات عادية، 38 عالم خلل](/images/smb1-glitch-levels/level-28-overworld.png)

![شرح آليات Super Mario Bros. الخلل -- الفيديو الثالث](/images/smb1-glitch-levels/yt-levels.jpg)

### الـ 6 مستويات خلل فريدة حقًا

من بين معرّفات الخلل الـ 19 القابلة للوصول، فقط **6 لا تتعرض للتعطل فورًا** عند التحميل:

| العالم | Level ID | الوصف |
|-------|----------|-------------|
| E-1 (224) | $50 | بلوك ؟ واحد فوق هاوية. يموت Mario فورًا. |
| W | $57 | Mario يظهر محتجزًا، غير قادر على الحركة. |
| 42 (133) | $50 | نفق سحاب يحبس Mario إذا ذهب بعيدًا بما يكفي. |
| 62 (131, 240) | $4D | قلعة جليدية: Mario يظهر في الأعلى، لا يمكنه السقوط ← محتجز. |
| 127 | $4B | نفق تحت الأرض، لكنه يتعرض للتعطل إذا ذهب بعيدًا. |
| 137 | $4B | ي.active التمرير التلقائي لمشاهد cutscenes. Mario يلتقي ببلوك brick واحد يحجبه إلى الأبد. |

![Level ID $50 (نفق السحاب) -- عالم الخلل 42-1 و E-1](/images/smb1-glitch-levels/lvl-50-cloud.png)
![Level ID $4D (قلعة) -- World 62-1، Mario محتجز عند الظهور](/images/smb1-glitch-levels/lvl-4D-castle.png)
![Level ID $4B (نفق) -- World 127-1، يتعرض للتعطل إذا ذهب بعيدًا](/images/smb1-glitch-levels/lvl-4B-tunnel.png)

ستة عوالم خلل من أصل 248 تنتج شيئًا جديدًا حقًا. الباقي هي مستويات عادية مع نوع المنطقة الخاطئ، أو شاشات سوداء.

## تنسيق المستويات بالتفصيل

نبحث في التنسيق الدقيق لبيانات المستوى، لفهم لماذا تثبت مستويات الخلل (أو لا تثبت).

### رأس المستوى: 2 بايت، 6 خصائص

يبدأ كل مستوى برأس من 2 بايت يتحكم في 6 خصائص:

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

يتحكم نوع التعديل في الاختلافات البصرية: الأمواج في أعلى مستويات الماء، خلفية الطوب في 8-3، لوحة الليل في 4-3، الثلج في 6-2، إلخ.

### أشياء البلاطات: 2 بايت، علامة الشاشة التالية، طابور 3 أماكن

بعد الرأس تأتي قائمة **أشياء البلاطات**، كل شيء يساوي 2 بايت. البايت $FD يعلم نهاية القائمة.

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

عندما يتم تعيين علامة "الشاشة التالية"، يتم زيادة عمود العمل الحالي بـ 1. هذا يسمح بوضع أشياء تتجاوز الأعمدة الـ 16 الأولى. يجب سرد الأشياء **بالترتيب** (من اليسار إلى اليمين) لأن اللعبة تحملها بشكل متسلسل:

```asm
; La routine de chargement a DEUX phases par colonne :
; Phase 1 : chercher les nouveaux objets qui commencent sur cette colonne
;            et les ajouter à la file d'attente (queue)
; Phase 2 : traiter chaque objet dans la queue en dessinant les tiles,
;            et retirer ceux qui finissent sur cette colonne
```

الطابور يحتوي بالضبط على **3 أماكن**. نتيجة مباشرة: لا يمكن أن يكون هناك أكثر من 3 أشياء تبدأ في نفس العمود. إذا كان الطابور ممتلئًا، يتم تجاهل الشيء الرابع ولن يُحمّل أبدًا.

لهذا السبب تتجنب المستويات المصممة جيدًا تكدس الكثير من الأشياء. مثال في 1-2: العمود الذي يحتوي على بلوك 1up في السقف + الطوب بجانبه مقسمان إلى شيئين منفصلين للالتزام بحد 3.

### Y مميز: 12، 13، 14، 15

عندما Y=12، ليس للشيء موقع Y (إنه مبرمج حسب النوع):

```asm
; Y=12 : objets sans Y position
;   Type 0 : trou (supprime le sol)
;   Type 1 : rope de plateforme mobile
;   Types 2-4 : ponts à Y fixe
;   Type 5 : trou avec eau/lave
;   Types 6-7 : rangées de ? blocks
```

عندما Y=13، مجموعتان فرعيتان. إذا كان Bit 6 من البايت 1 يساوي 1:

```asm
; Y=13, bit6=1 : objets spéciaux
;   0 = L-pipe (cutscene), 1 = flagpole, 2-3 = pont/axe/hamer (fin château)
;   4 = stop screen, 5 = random enemies, 6 = loop level, 7+ = crash possible
```

إذا bit6=0، الـ 5 بت الأقل وزنًا تشفّر **تخطي شاشة** (انتقل مباشرة إلى شاشة N، دون المرور بعلامة الشاشة التالية واحدة تلو الأخرى).

عندما Y=14: نفس المبدأ مع bit6=1 لتغيير نوع التعديل، bit6=0 لتغيير الخلفية + نمط الأرضية.

### أنماط الأرضية: 16 نمطًا أرضيًا

أرضية المستويات ليست مصنوعة من أشياء فردية. يستخدم SMB1 **أنماط أرضية**، نمط خلفية ينطبق على جميع الأعمدة حتى التغيير التالي:

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

لهذا السبب الثقوب هي أشياء: فهي تتجاوز نمط الأرضية على عمود محدد، دون الحاجة إلى تغيير النمط لبقية كل شيء.

### حد 256 بايت والتكرار

جميع بيانات البلاطات للمستوى تندرج في **256 بايت كحد أقصى**. السجل Y في 6502 يُستخدم كفهرس، وهو 8 بت. إذا وصلت اللعبة إلى نهاية البيانات دون العثور على البايت $FD، **تعود إلى البداية** وتكرر الـ 256 بايت إلى الأبد:

```asm
; Index Y = 8 bits → max 256 bytes de données tiles
; Si Y overflow (255 → 0) sans rencontrer $FD → repeat
; Même chose pour les sprites, mais les objets pipe (3 bytes)
; décalent la parité de l'index à chaque chargement.
```

بعض مستويات الخلل تستغل هذا التكرار لتوليد مستويات تدوم "إلى الأبد".

### نظام السبرايتات: 2 بايت + انتقالات الأنابيب

تتبع السبرايتات تنسيقًا مشابهًا، لكن بدون رأس وبعض الاختلافات الجوهرية. البايت $FF يعلم نهاية القائمة.

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

البت الأقل وزنًا في البايت 1 هو **علم المستوى الصعب**: إذا تم تعيينه بـ 1، لا يظهر السبرايت إلا في المستويات ≥ 5-3. هكذا يتم إنشاء مستويات "الوضع الصعب".

الموقع Y 15 = **تخطي شاشة** (مطابق للبلاطات). الموقع Y 14 = **انتقال أنبوب** (3 بايت):

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

السبرايتات **ليس لها نظام طابور**. الحد الوحيد هو عدم وجود أكثر من 4 سبرايتات محملة في نفس الوقت في منطقة الظهور (خارج الشاشة على اليمين فقط). فوق ذلك، يتم تجاهل السبرايتات.

## كيفية الوصول إلى عوالم الخلل

هناك طرقتان رئيستان.

### الطريقة الكلاسيكية: تسلق الجدار (wall clip)

يسمح تسلق الجدار بالخروج من المستوى العادي والمشي إلى منطقة التحويل المخفية. بالتعامل مع عداد العالم عبر RAM، يمكنك تحميل أي Level ID.

التقنية:
1. World 1-2: اذهب إلى الأنبوب الخفي النهائي
2. افعل تسلق الجدار على الجدار الأيمن
3. امشي في الفراغ حتى منطقة التحويل
4. تفسر اللعبة القيم كعوالم

لكن هذه الطريقة لا تمنح الوصول إلا إلى جزء صغير من عوالم الخلل.

### الطريقة المتطرفة: تبادل كارترidge NES Tennis

انظر قسم "البدء الدافئ" أعلاه للتفاصيل الكاملة. باختصار: عداد خطوات Tennis يكتب على نفس بايت RAM الذي يحتوي على عالم البداية في SMB1، واكتشاف البدء الدافئ يحافظ على هذه القيمة.

### زاوية المخترعين: الكود للاستكشاف الكامل

إذا أردت استكشاف جميع الخلل بنفسك في محاكي، يمكنك تثبيت Level ID مباشرة:

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

نشر RGMechEx القائمة الكاملة للـ 128 مستوى × 4 أنواع مع خرائط مولّدة تلقائيًا على [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html). كل إدخال يعرض مؤشر البلاطات، مؤشر السبرايتات، وخريطة بصرية للمستوى.

## المستويات الأكثر غرابة

### Level ID $1F (Water): 15 عالم خلل في واحد

مؤشر البلاطات $A302 (3-4) المُجمّع مع مؤشر السبرايتات $02A0 ينتج 15 عالم خلل مختلفًا (D-1, J-1, Y-1, Z-1, 55-1, 73-1...). التفسير: مؤشر السبرايتات يشير إلى منطقة في ROM تحتوي على بيانات قريبة بما يكفي من السبرايتاتصالحة لإنتاج نتائج قابلة للعب، لكن مزيج بلاطات القلعة 3-4 مع سبرايتات العالم العلوي يخلق عرضًا عبثيًا.

### Level ID $28 (Overworld): 38 عالم خلل = ريكورد

الريكورد المطلق. 38 إدخال عالم خلل تشير إلى نفس المستوى (بلاطات 2-1 + سبرايتات $9F51). لماذا؟ لأن مؤشر السبرايتات $9F51 يقع في منطقة في ROM تستخدم كحشو/بيانات صوتية يعيد استخدامها كثير من المعرّفات.

### Level ID $49 (Underground): مستوى FDS

مؤشر البلاطات $76AE + مؤشر السبرايتات $1C9D. مؤشر البلاطات يشير إلى منطقة في ROM المحجوزة لإصدار Famicom Disk System. النتيجة: مستوى به بلاطات لاExists في الكارترidge القياسي. هذا هو المستوى الذي يجعل Levels 52-1 و 196-1 تظهر.

### Level ID $00-$02: مستويات المكافأة الحقيقية

هذه المعرّفات تستخدمها مستويات فرعية شرعية من اللعبة:

- **$00**: المنطقة تحت الماء من 5-2/6-2 (يستخدمه H-1, 39-1)
- **$01**: ماء 2-2/7-2 (Minus World, 36-1)
- **$02**: مستوى فرعي من 8-4 (136-1, 151-1, 215-1)

الفرق بين مستوى "مكافأة" يمكن الوصول إليه بشكل طبيعي وعالم خلل هو أن مناطق التحويل تتحقق من العالم الحالي:

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

عوالم الخلل بأرقام > 8 أو 0 لا يمكن الوصول إليها عبر أنابيب عادية. تحتاج تسلق الجدار أو تبادل الكارترidge.

## لماذا تتعرض بعض المستويات للتعطل: جداول القفز

عندما تحمل اللعبة شيئًا بلاطات، تستخدم نوعه كفهرس في **جدول قفز**:

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

![جداول القفز: لماذا يتسبب نوع شيء غير صالح في تعطل اللعبة](/images/smb1-glitch-levels/v4-jump-table.jpg)

إذا كان الشيء具有 نوع غير صالح (≥12)، تقفز اللعبة إلى مؤشر لاExists في هذا الجدول. **4 نتائج ممكنة**:

1. **مؤشر صالح** ← يُحمّل الشيء بشكل طبيعي
2. **مؤشر إلى جدول قفز آخر** (تراكب) ← يظهر شيء مختلف. مثال: النوع 12 يشير إلى جدول Y=13، مما ينتج L-pipe.
3. **مؤشر إلى كود قابل للتنفيذ** ← تنفيذ كود عشوائي (تعطل محتمل)
4. **بديل صريح (NOP)** ← لا يفعل الشيء شيئًا (بعض السبرايتات هكذا، تنتج أعداء يطيران في مكانهم دون الحركة)

![Level ID $58 الخلل: مؤشر السبرايتات يشير إلى عنوان غير صالح، تتعرض اللعبة للتعطل](/images/smb1-glitch-levels/v4-glitch-58-crash.jpg)

![Level ID $50 الخلل: نفق السحاب، مستوى ولّد من بيانات متلفة](/images/smb1-glitch-levels/v4-glitch-50.jpg)

Level ID $58 الخلل (النفق الذي يتعرض للتعطل): مؤشر السبرايتات يشير إلى منطقة ذاكرة **لاExists في NES بدون مخطط ROM**. تحاول اللعبة تحميل نفس Koopa 5 مرات في كل إطار عند الموقع (0، 0)، مما يشبع PPU ويسبب تجمد.

```asm
; Pourquoi ID $58 crashe :
; Sprite pointer → adresse invalide (hors espace NES standard)
; → Le jeu lit des bytes indéterminés comme des types de sprite
; → Le Koopa $00 (type invalide sans handler) boucle en appel récursif
; → Stack overflow 6502 → freeze
```

### مفارقة أنبوب التحويل

تذكر فحص `target_world BETWEEN 1 AND 8`. حتى لو وجدت أنبوبًا في عالم خلل، تتحقق اللعبة من أن العالم المقصد بين 1 و 8. عوالم الخلل بها أرقام > 8 (36-1، 255-1...)، لذلك يفشل التحويل.

لهذا السبب أيضًا لا Exists نهاية لـ Minus World: عمود العلم غير موجود في السبرايتات، والأنابيب لا تؤدي إلى أي مكان.

### حيلة الـ 5 أشياء في عمود

هناك حالة حد تسمح بتجاوز حد 3 أشياء لكل عمود. عندما يتوقف الطابور (أماكن ممتلئة + الشيء التالي مع علامة الشاشة التالية مفقودة)، "تعالج مسبقًا" اللعبة العمود الحالي في حلقة حتى تجد شيئًا مع علامة الشاشة التالية. أثناء كل معالجة مسبقة:

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

يُسمى هذا "تخطي الطابور" ويستخدمه بعض مخترعي الروم لإنشاء مستويات أكثر كثافة مما يسمح به التنسيق عادةً.

## الفروقات بين الإصدارات

### Famicom Disk System

إصدار FDS من SMB1 له **خريطة ذاكرة مختلفة**. جميع مؤشرات المستويات مزاحة، لكن البيانات متسقة. ما يتغير: فهارس عوالم الخلل مختلفة تمامًا:

```
FDS World 36 → Level ID $09 (eau version de 5-3)
  → Le flagpole est présent ! On peut finir le niveau.
  → Ensuite : $27 (7-3 normal) → $44 (4-4 underground)
  → $44 est finissable → la hache fonctionne → fin du jeu !
  
Le Minus World FDS est donc un "bonus world" qui peut mener
à la complétion du jeu, contrairement à la version NES.
```

مستوى FDS المفضل لدي: **ID $5F**، الإصدار تحت الأرض من النصف الثاني من 3-3 في نفق منخفض (مؤسف أنه autoscroller).

### The Lost Levels (الإصدار الياباني من Super Mario Bros. 2)

يغير Lost Levels الكثير من الأمور:

1. **ترتيب مطابق للبلاطات/السبرايتات**: لا Exists مستويات فرانكنشتاين (البلاطات والسبرايتات تحمل نفس المستوى حتى مع معرّف غير صالح)
2. **جدول مؤشرات واحد من 16 بت** بدلاً من جدولين منفصلين عالي/منخفض
3. **4 ملفات قرص**: تم تقسيم ROM لـ FDS:
   - الملف 1: العوالم 1-4
   - الملف 2: العوالم 5-8
   - الملف 3: World 9 + محرك الصوت
   - الملف 4: العوالم A-D (جدول مؤشرات مختلف تمامًا)
4. **نفس Level ID = 4 مستويات ممكنة** حسب الملف المحمل
5. **لا Exists خلل Tennis**: خيار الاستمرار (الاستمرار في نفس العالم بعد الخسارة) يجعل البدء الدافئ غير ضروري، واللعبة **تعيد التشغيل فورًا** إذا World > 9
6. **أشياء جديدة**: فطر السام، بلوك غير مرئي، بلوك زهرة النار غير المرئي، أنابيب مقلوبة، رياح -- لكنها مدرجة في منتصف القوائم الموجودة → **عدم توافق عكسي** مع SMB1
7. **نباتات Piranha حمراء دائمًا** بعد World 4، **منصات قفز خضراء فقط** في العوالم 2/B/3/C/7

### Super Mario All-Stars (SNES)

منقل مباشر مع نفس الروتينات 6502 (يشغل SNES كود NES في وضع متوافق):

- **منطقة التحويل مصححة**: لا Exists Minus World (دخول الأنبوب الأيسر قبل النص يؤدي إلى العالم الصحيح)
- **تجمد**: معظم مستويات الخلل تتعرض للتعطل (باستثناء ID $6A و 9-1)
- **أشياء القلعة المضافة**: أكثر فردية
- **لكن**: **التحويل الخاطئ 4-2** لا يزال يعمل (لم يتم تثبيته!)

### التحويل الخاطئ 4-2: خطأ في وضع الأشياء

في 4-2، هناك شيئان من انتقال الأنبوب: الكرمة (منطقة التحويل) والأنبوب (غرفة عملات). الشيء الأول من الانتقال (الكرمة) يوضع **قبل ظهور الكرمة على الشاشة**. الثاني (الأنبوب) يوضع **متأخرًا في المستوى**.

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

### مستويات الحلقة

كيف تعمل الحلقات (8-4، 7-4)؟ المستوى يحتوي على **نقاط تفتيش** مع أرقام شاشة ومواقع Y مبرمجة:

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

## تغيير التنسيق، لا الكود

إحدى الدروس الأكثر إثارة في هذه البنية هي أن مطوري SMB1 نجحوا في إنشاء نظام مستوى معبر للغاية دون لمس كود العرض 6502 أبدًا. كل التباين بين المستويات يأتي من **البيانات** (المؤشرات، الأشياء، السبرايتات، أنماط الأرضية)، لا من الكود.

توجد عوالم الخلل الـ 256 لأن **جداول المؤشرات مصممة لـ 128 إدخالًا × 4 أنواع**، واللعبة لا تتحقق أبدًا من القيم التي تقرأها. عندما يقع مؤشر في RAM، تفسر اللعبة سجلات Mario كبلاطات. عندما يقع مؤشر في البيانات الصوتية، تلعب اللعبة موسيقى على شكل تصميم مستوى. وعندما تتخطى جداول القفز، تنفيذ اللعبة أي شيء حتى التعطل.

![شرح آليات Super Mario Bros. الإضافية -- الفيديو الرابع](/images/smb1-glitch-levels/yt-mechanics.jpg)

## ما يمكن أن نتعلمه من كل هذا

1. **فصل البلاطات/السبرايتات**: استقلالية تامة للطبقتين، مع ترتيبات تخزين مختلفة تخلق مستويات فرانكنشتاين فريدة
2. **ضغط RLE + نظام الأشياء**: المستويات ليست صور نقطية بل قوائم أشياء مع أنماط أرضية للأرضية
3. **طابور 3 أماكن**: حد صلب للعتاد (وتصميم المستوى)
4. **لا تحقق**: اللعبة تثق بالمؤشرات وجداول القفز، مما ينتج إما خلل قابل للعب أو تعطل
5. **256 بايت كحد أقصى**: حد سجل Y في 6502، مما يجعل البيانات تتكرر إذا ذهبت بعيدًا
6. **بدء دافئ / بارد**: نظام "استمرار" فتح الباب لتبادل كارترidge Tennis ← Mario

الأجمل من ذلك كله: كل هذا هو كود 6502 يتسع في 40KB. لا طبقة تجريد، لا تحقق من الوصول للذاكرة، لا مدير استثناءات. إذا كان المؤشر تالفًا، تتعرض اللعبة للتعطل. والتعطلات، نسميها عوالم الخلل.

## الـ 3 أشياء للتذكر

1. **عوالم الخلل هي مؤشرات تسقط في المكان الخطأ** -- تiliki اللعبة 128 معرّفًا × 4 أنواع منطقة، لكن فقط 34 مستوى فريدًا. عندما يتلف رقم العالم (بوسيلة Tennis أو تسلق الجدار)، تحمل اللعبة مؤشرًا مصممًا لمستوى آخر، والـ 512 تركيبة ممكنة تنتج نتائج غير متوقعة.

2. **Minus World هو خطأ تحويل مُجمّع مع تلف** -- الأنبوب الأيسر في 1-2، إذا تم تفعيله قبل ظهور النص، يحمّل World 36 (0x24). هذا العالم يشير إلى Level ID $01 (ماء 2-2)، مستوى بدون عمود العلم. وبما أن لا Exists انتقال أنبوب لـ World 36، يتكرر المستوى إلى الأبد. غياب التحقق يخلق الأيقونة.

3. **Tennis ← Mario، 15 عامًا قبل OoT ← Paper Mario** -- ذاكرة RAM في NES تنجو من تبادل كارترidge بفضل المكثفات ونظام البدء الدافئ / البارد في SMB1. عداد خطوات Tennis (الذي يزيد بايت RAM أثناء تشغيل صوت الخطوات) يقع بالضبط على عنوان رقم العالم. يجب أن تبقى أرقام أعلى نقاط عند 0، وأن البايت $A5 سليمًا، وأن تكتشف اللعبة بدءًا دافئًا -- سلسلة ظروف مثالية لم تعمل إلا مع Tennis.

مقاطع فيديو [Retro Game Mechanics Explained](https://www.youtube.com/c/RetroGameMechanicsExplained) الأصلية هي عمل نشيط للغاية -- مستوى التفاصيل في تفكيك 6502، خرائط جميع المستويات المولّدة تلقائيًا، شروحات تبادل الكارترidge والبدء الدافئ. إذا لم تشاهد السلسلة، شاهدها، فهي قصيرة وكل دقيقة كثيفة.

كود الخرائط متاح على [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html)، والتفكيك الكامل لـ SMB1 مفتوح المصدر في كثير من المستودعات. منذ 40 عامًا، كتب مبرمجون يابانيون نظام المستوى هذا في 6502 بدون اختبار وحدة واحد أو متتبع أخطاء واحد، ونواصل التعلم من فتح كودهم اليوم.
