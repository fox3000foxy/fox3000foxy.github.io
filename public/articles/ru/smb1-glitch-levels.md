---
title: "Super Mario Bros.: формат уровней, указатели и 256 глитч-миров"
description: "Как 128 уровней × 4 типа зон влезают в 40КБ ROM, почему существует Minus World, и как матч в теннис на NES может загружать глитч-миры."
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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "1OFRJ3nye5fQLLt+RKygKSTOAdma0Amg8MygaQbW7J5Fe6CeLeeR1K3UK7m5vj+Q+4ZSUt1YVV1y70tEHtsRDw=="
---

## Введение

Super Mario Bros. — это 40 килобайт ROM. Восемь миров, 32 уровня, враги, музыка,功率-апы — всё это влезает сюда.

Но если открыть эмулятор и поковыряться в нужных байтах, можно загрузить уровень 36-1. Или 255-1. Или попасть в мир, где всё сделано из спрайтов Боузера и труб, которые ведут в никуда.

Эти глитч-миры существуют по простой причине: система хранения уровней SMB1 — это шедевр 8-битной оптимизации, и когда заставляешь игру читать не оттуда, получаешь результаты, от которых захватывает дух.

Retro Game Mechanics Explained снял об этом серию из 4 видео — мы соберём всё в одну погружённую статью по коду 6502 самой продаваемой игры своего времени.

![GLITCH OBJECTS — заголовок серии RGMechEx о скрытых механиках SMB1](/images/smb1-glitch-levels/title-card.jpg)

![World 9-1 — экран загрузки первого глитч-мира, доступного через cart swap с теннисом](/images/smb1-glitch-levels/v1-title-9-1.jpg)

## Тёплый старт: почему RAM тенниса выживает в SMB1

Прежде чем говорить о хранении уровней, надо понять, как стартует SMB1. Потому что глитч cart swap с NES Tennis целиком и полностью опирается на **систему определения тёплого/холодного старта** игры.

### 41 байт, который сохраняется

Когда SMB1 определяет **холодный старт** (первая включение или power off/on), он очищает всю RAM. Но когда определяет **тёплый старт** (сброс кнопкой, без отключения питания), он сохраняет область памяти в **41 байт**:

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

Эти 41 байт служат одной-единственной цели: дать игроку возможность **продолжить с того же мира после game over**. Если умереть на 6-3, игра записывает мир 6 в байт старта, и на титульном экране, если зажать A + Start, начнёшь с 6-1.

![Сохранённые 41 байт RAM при тёплом старте — TOP SCORE, MARIO SCORE, TIMER, WORLD SELECT, CONTINUE WORLD и магический байт $A5](/images/smb1-glitch-levels/v1-memory-state.jpg)

### Двойная проверка тёплого старта

![Холодный старт vs тёплый старт — схема определения сброса](/images/smb1-glitch-levels/v1-warm-start.jpg)

Когда SMB1 загружается, он проверяет не один критерий, а **два**:

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

![Проверка байта $A5 и цифр top score — сердце тёплого старта](/images/smb1-glitch-levels/v1-a5-byte.jpg)

Зачем двойная проверка? Потому что байт $A5 может оказаться на месте случайно (другая игра, оставившая это значение, или состояние покоя по умолчанию чипа RAM). Проверяя, что цифры top score допустимы (0-9), игра убеждается, что данные согласованы.

### Почему только теннис работает

Когда впервые вставляешь SMB1 (холодный старт), игра:
1. Очищает всю RAM → top score = 0, world byte = 0
2. Записывает $A5 по адресу $0787

Затем переключаешься на Tennis без выключения консоли. Tennis:
- **Не чистит RAM при запуске** (мало какие игры NES это делают)
- **Не пишет в байты top score** → они остаются 0 (валидные)
- **Не трогает байт $A5** → он остаётся на месте
- **Использует адрес $075F** для счётчика шагов игрока

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

Когда снова запускаешь SMB1:
1. Байт $A5 всё ещё на месте (Tennis его не трогал)
2. Цифры top score всё ещё 0 (валидные)
3. World byte теперь 8+ (увеличен шагами тенниса)
4. SMB1 определяет тёплый старт → сохраняет повреждённый world byte
5. Зажимаем A + Start → world 9-1, world A-1, world 36-1 и т.д.

### Почему надо загружать Mario перед теннисом

Тонкость: сначала нужно загрузить SMB1, потом Tennis, потом снова SMB1. Если начать сразу с тенниса, байт $A5 никогда не будет записан (Tennis не пишет $A5), и определение тёплого старта не сработает — RAM будет очищена.

![Счётчик шагов тенниса: каждый шаг увеличивает world byte](/images/smb1-glitch-levels/v1-footstep.jpg)

![Доступ к глитч-мирам через NES Tennis — видео, объясняющее cart swap](/images/smb1-glitch-levels/yt-tennis.jpg)

## Как SMB1 хранит свои уровни в 40КБ

Nintendo R&D4 пришлось решить задачу, которая на первый взгляд кажется простой: представить уровни с горизонтальным скроллингом, тайлами, врагами, предметами — и всё это уместить в ультра-жёсткий бюджет ROM.

Решение — разделение на два **полностью независимых** слоя данных:

### Tile layout (карта уровня)

Каждый уровень определяется указателем на структуру тайлов, сжатую в ROM. Сжатие примитивное, но гениальное: байт "управления", за которым следуют 1-3 байта данных.

Формат тайлов использует систему **run'ов** (как RLE):

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

Каждый уровень содержит 13 строк по 16 колонок тайлов (13×16 = 208 видимых тайлов). Но сжатый формат позволяет снизить размер значительно ниже — например, небо и пустые колонки почти не занимают места.

Цикл рендеринга на 6502:

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

### Sprite layout (враги и объекты)

Параллельно враги и объекты (блоки ?, трубы, гумбы, купы) хранятся в полностью отдельной структуре. Каждый спавн определяется 2 байтами:

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

Каждый уровень может ссылаться до 5 страниц различных спрайтов (точнее, 5 "экранов" по 16 колонок), но на практике большинство уровней использует только 2-3.

### Таблица указателей

Гениальность конструкции — в таблице указателей. Каждый уровень хранится как **пара** адресов ROM:

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

128 записей на таблицу. 4 типа зон. **512 возможных комбинаций**, но лишь дробь используется официальной игрой. Остальное — неинициализированная RAM или данные, которые интерпретируются как указатели.

Когда игра загружает уровень, она делает вот это:

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

Ни какой проверки. Ни проверки, что указатель валиден. Игра читает адрес из таблицы и распаковывает то, что лежит по этому адресу, точка.

![Level ID $06 (Water) — 9-1, подводная версия 6-2](/images/smb1-glitch-levels/lvl-06-9-1.png)

![Таблица Level IDs: 128 возможных записей, 34 назначены](/images/smb1-glitch-levels/v2-level-id-table.jpg)

![Разный порядок указателей тайлов и спрайтов — причина Frankenstein levels](/images/smb1-glitch-levels/v2-pointer-tables.jpg)

### 34 уникальных уровня и 7-битная система ID

![Чип RAM NES (MB8416A) — он сохраняет данные при замене картриджей](/images/smb1-glitch-levels/v1-ram-chip.jpg)

SMB1 имеет не 32, а **34 уникальных уровня**. Многие уровни — дубликаты (5-3 = 1-3, но с Bullet Bills), помеченные флагом "hard mode". Настоящие уникальные уровни:

- **Вода** (Тип 0): 3 уровня (2-2, 7-2, бонусная зона 5-2/6-2)
- **Overworld** (Тип 1): 22 уровня (включая 2 бонусных облачных комнаты)
- **Underground** (Тип 2): 3 уровня (включая подземные бонусные комнаты)
- **Castle** (Тип 3): 6 уровней
- \+ 1 комната кат-сцены (перед подземными/водными уровнями)
- \+ 1 warp-зона 4-2

Каждый уровень имеет ID на **7 битах**. Младшие 5 бит = номер в подгруппе, старшие 2 бита = тип зоны:

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

**128 возможных ID** ($00-$7F), только 34 назначены реальным уровням. Неиспользуемые ID указывают на что угодно.

### Таблицы указателей: два списка, два порядка

Указатели тайлов и спрайтов хранятся в разном порядке. Код использует две отдельные 16-битные列表ы (старший байт / младший байт в разных таблицах):

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

Почему разный порядок? Технических причин нет — скорее всего, данные были организованы так в процессе разработки. Но это создаёт fascinating последствие: когда ID уровня невалиден, указатели тайлов и спрайтов загружают *разные* уровни, создавая **Frankenstein levels**.

Чтобы перемещаться между этими двумя списками, игра использует небольшие **таблицы смещений** (как оглавление):

```asm
; Tables d'offset par type (Water, Overworld, Underground, Castle)
; Chaque entrée = index de début dans la liste correspondante

SpriteOffsetTable:
  .byte $1F, $06, $1C, $00    ; Water=31, Overworld=6, Underground=28, Castle=0

TileOffsetTable:
  .byte $00, $03, $19, $1C    ; Water=0, Overworld=3, Underground=25, Castle=28
```

Чтобы загрузить уровень 6-2 (ID $23, Overworld номер 3):

```asm
; 1. Type = 01 (Overworld) → index dans table d'offset = 1
; 2. Sprite offset = SpriteOffsetTable[1] = 6
;    Index final = 6 + 3 (numéro de niveau) = 9 → 10ème pointeur sprites
; 3. Tile offset = TileOffsetTable[1] = 3
;    Index final = 3 + 3 = 6 → 7ème pointeur tiles
; 4. Résultat : pointeur tiles $A619 + pointeur sprites $9ED0 = 6-2 ✓
```

А что происходит с невалидным ID вроде $43 (Underground номер 3, которого не существует)?

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

![Level ID $43 — Frankenstein level: тайлы 1-4 + спрайты воды 5-2](/images/smb1-glitch-levels/lvl-43-frankenstein.png)

![Exploring Glitch Level Pointers — таблицы смещений объяснены](/images/smb1-glitch-levels/yt-pointers.jpg)

![World index table — когда overflow world 9 создаёт glitch level](/images/smb1-glitch-levels/v2-world-index-table.jpg)

### World index table: почему world 9 переполняется

Есть ROM-таблица из 8 байтов, которая даёт индекс первого уровня каждого мира (1-8). И сразу за ней таблица из 36 Level IDs всех уровней в порядке игры.

```asm
; WorldIndexTable (8 bytes)
  .byte 0, 5, 10, 15, 20, 25, 28, 33
;   -> Monde 1 commence au niveau 0
;   -> Monde 2 commence au niveau 5
;   -> Monde 8 commence au niveau 33

; LevelIDTable (36 bytes)
  .byte $25, $28, $29, $26, $24, ... ; les 36 Level IDs
```

Когда пытаешься загрузить world 9, игра читает 9-й байт WorldIndexTable... которого не существует. Он переполняется на 1 байт в LevelIDTable, читает значение $25, затем использует $25 как индекс в LevelIDTable (37-я запись) — что снова переполняется на 2 байта в SpriteOffsetTable, и читает значение 6.

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

Для world G (16) переполнение идёт ещё дальше и попадает на Level ID $01 — это кат-сцена перед 1-2:

```asm
; World G (16) :
;   WorldIndexTable[15] → lit $01 dans LevelIDTable
;   LevelIDTable[1] = $29 (cutscene 1-2)
;   → world G-1 = la cutscene d'entrée de 1-2
```

## Почему существуют глитч-миры

У игры 32 "легитимных" уровня (8 миров × 4 уровня). Но таблица указателей содержит 128 записей на тип зоны. Записи за пределами 32-го уровня содержат то, что лежит в ROM по этим адресам — иногда другой уровень,有时 звуковые данные, иногда RAM, иногда что попало.

![Level ID $01 Water (Minus World) — tile pointer $AE45, sprite pointer $A171](/images/smb1-glitch-levels/minus-world.png)

### Level ID $01 + AreaType 0 = Minus World

Самый знаменитый из глитч-миров. Level ID $01 в AreaType 0 (вода) указывает на:

- **Tile pointer: $AE45** → подводная зона 2-2/7-2
- **Sprite pointer: $A171** → спрайты 2-2/7-2

Результат: водный уровень, похожий на 2-2, но зацикленный бесконечно, потому что flagpole не существует. Нет конца уровня, нет выхода.

Это уровень 36-1 (или 36-1 в мире $-1).

![Проверка тёплого старта SMB1 — именно она позволяет Minus World существовать](/images/smb1-glitch-levels/v4-minus-world.jpg)

```asm
; Pourquoi le flagpole manque dans le Minus World :
; Les sprites de 2-2/7-2 ($A171) n'ont pas de flagpole
; dans leur séquence. Le jeu cherche le sprite $FD (flagpole)
; mais ne le trouve jamais → boucle infinie
;
; Le jeu continue de générer le niveau à l'infini
; jusqu'à ce que le timer atteigne zéro.
```

### Указатели, указывающие на RAM

Когда tile pointer или sprite pointer указывает на адрес в RAM ($00-$7F) вместо ROM, игра пытается интерпретировать постоянные изменения RAM как тайлы:

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

Когда нулевая страница меняется (потому что Mario двигается, таймер тикает и т.д.), "спрайты" уровня тоже меняются. Поэтому у некоторых глитч-миров враги мигают и постоянно превращаются во что-то другое.

![Level ID $03 Water — sprite pointer $009D указывает на RAM, уровень неиграбельный](/images/smb1-glitch-levels/level-03-water.png)

### Level ID $36: пустой уровень (Overworld)

Level ID $36 в Overworld:

- **Tile pointer: $AC35** (1-2)
- **Sprite pointer: $A0D8** (1-2)

Результат: ничего. Игра загружает уровень, но в каталоге RGMechEx он отмечен как "без уровня". Тайлы могут быть валидными, но спрайты указывают на место, которое создаёт пустой или нерабочий уровень.

### Level ID $1D (Castle): чемпион крашей

Level ID $1D в Castle:

- **Tile pointer: $A210** (4-4)
- **Sprite pointer: $7EA0** (RAM!)

Sprite pointer в RAM = неопределённые спрайты. Игра пытается отрисовать Spiny ball или Bullet Bill blaster в первой строке тайлов. Это вызывает немедленный краш.

```asm
; Quand le sprite pointer pointe vers la RAM,
; le jeu décompresse des bytes qui changent tout le temps
; comme des instructions "spawn". Le résultat :
; - Apparition d'objets inexistants (valeur undefined)
; - Crash PPU quand le sprite NES essaie d'afficher un tile invalide
; - Freeze complet de la console
```

## 256 глитч-миров, каталогизированных

RGMechEx написал скрипт, который генерирует карты **всех уровней** для 4 типов зон и 128 ID каждый.

Счётчик мира — 8 бит (0-255). Миры 1-8 легитимные. Остаётся **248 потенциальных глитч-миров**. Каждый глитч-мир соответствует первому уровню этого мира, а его Level ID вычисляется механизмом переполнения WorldIndexTable.

![Таблица глитч-миров — 248 повреждённых миров, 68 первых доступных уровней](/images/smb1-glitch-levels/v3-glitch-worlds-table.jpg)

Из 128 возможных ID только **68 являются "первым уровнем" мира** (доступными через номер глитч-мира). Остальные 60 — это уровни 2+ или недоступные.

| Тип | Уникальные играбельные ID | ID, которые крашатся | Пустые ID |
|------|---------------------|-------------------|-----------|
| Water (0)    | ~20  | ~60  | ~48  |
| Overworld (1)| ~30  | ~55  | ~43  |
| Underground (2) | ~15 | ~65 | ~48  |
| Castle (3)   | ~25  | ~58  | ~45  |

Многие ID ведут на один и тот же уровень из-за указателей, попадающих на одинаковые адреса ROM. Например, Level ID $28 (Overworld) — tile pointer $A7CD (2-1) — появляется в **38 разных глитч-мирах**, потому что его sprite pointer $9F51 указывает на область ROM, которая используется как padding/звуковые данные и переиспользуется множеством ID.

![Карта уровня ID $28 (Overworld) — тайлы 2-1 с нормальными спрайтами, 38 глитч-миров](/images/smb1-glitch-levels/level-28-overworld.png)

![Super Mario Bros. Glitch Levels Explained — третье видео](/images/smb1-glitch-levels/yt-levels.jpg)

### 6 по-настоящему уникальных глитч-уровней

Из 19 доступных ID глитч-уровней только **6 не крашатся сразу** при загрузке:

| Мир | Level ID | Описание |
|-------|----------|-------------|
| E-1 (224) | $50 | Один-единственный ? блок над пропастью. Mario умирает мгновенно. |
| W | $57 | Mario застревает при спавне, не может двигаться. |
| 42 (133) | $50 | Облачный туннель, который ловит Mario, если он уйдёт достаточно далеко. |
| 62 (131, 240) | $4D | Замёрзший замок: Mario спавнится наверху, не может упасть → застревает. |
| 127 | $4B | Подземный туннель, но крашится, если уйти слишком далеко. |
| 137 | $4B | Активирует автоматический скроллинг кат-сцен. Mario встречает единственный brick block, который блокирует его навсегда. |

![Level ID $50 (облачный туннель) — глитч-мир 42-1 и E-1](/images/smb1-glitch-levels/lvl-50-cloud.png)
![Level ID $4D (замок) — мир 62-1, Mario застрял при спавне](/images/smb1-glitch-levels/lvl-4D-castle.png)
![Level ID $4B (туннель) — мир 127-1, крашится при уходе слишком далеко](/images/smb1-glitch-levels/lvl-4B-tunnel.png)

Шесть глитч-миров из 248, которые производят что-то действительно новое. Остальные — это нормальные уровни с неправильным типом зоны или чёрные экраны.

## Формат уровней в деталях

Копнём в точный формат данных уровня, чтобы понять, почему глитч-уровни держатся (или нет).

### Заголовок уровня: 2 байта, 6 свойств

Каждый уровень начинается с заголовка в 2 байта, который управляет 6 свойствами:

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

Модификатор типа управляет визуальными вариациями: волны вверху водных уровней, кирпичный фон 8-3, ночная палитра 4-3, снег 6-2 и т.д.

### Объекты тайлов: 2 байта, Next Screen Flag, очередь на 3 слота

После заголовка идёт список **объектов тайлов**, каждый по 2 байта. Байт $FD отмечает конец списка.

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

Когда установлен бит "next screen", текущая рабочая колонка увеличивается на 1. Это позволяет размещать объекты за пределами первых 16 колонок. Объекты должны быть перечислены **в порядке** (слева направо), потому что игра загружает их последовательно:

```asm
; La routine de chargement a DEUX phases par colonne :
; Phase 1 : chercher les nouveaux objets qui commencent sur cette colonne
;            et les ajouter à la file d'attente (queue)
; Phase 2 : traiter chaque objet dans la queue en dessinant les tiles,
;            et retirer ceux qui finissent sur cette colonne
```

О очередь вмещает ровно **3 слота**. Прямое следствие: нельзя иметь больше 3 объектов, начинающихся на одной колонке. Если очередь заполнена, 4-й объект игнорируется и никогда не загрузится.

Именно поэтому хорошо спроектированные уровни избегают слишком плотной укладки объектов. Пример из 1-2: колонка с 1up блоком в потолке + кирпичи рядом разделены на два отдельных объекта, чтобы соблюсти лимит в 3.

### Специальные Y-позиции: 12, 13, 14, 15

Когда Y=12, объект не имеет Y-позиции (она зашита по типу):

```asm
; Y=12 : objets sans Y position
;   Type 0 : trou (supprime le sol)
;   Type 1 : rope de plateforme mobile
;   Types 2-4 : ponts à Y fixe
;   Type 5 : trou avec eau/lave
;   Types 6-7 : rangées de ? blocks
```

Когда Y=13, две подгруппы. Если бит 6 первого байта равен 1:

```asm
; Y=13, bit6=1 : objets spéciaux
;   0 = L-pipe (cutscene), 1 = flagpole, 2-3 = pont/axe/hamer (fin château)
;   4 = stop screen, 5 = random enemies, 6 = loop level, 7+ = crash possible
```

Если bit6=0, младшие 5 бит кодируют **screen skip** (перейти напрямую к экрану N, не проходя по next screen flag по одному).

Когда Y=14: тот же принцип — bit6=1 для смены модификатора типа, bit6=0 для смены фона + паттерна пола.

### Floor patterns: 16 паттернов пола

Пол уровней не состоит из отдельных объектов. SMB1 использует **floor patterns** — паттерн фона, который применяется ко всем колонкам до следующего изменения:

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

Именно поэтому дыры — это объекты: они переопределяют floor pattern на конкретной колонке, не изменяя паттерн для всего остального.

### Лимит 256 байт и повторение

Все tile-данные уровня помещаются в **максимум 256 байт**. Y-регистр 6502 используется как индекс, и он 8-битный. Если игра доходит до конца данных, не найдя байт $FD, **она возвращается в начало** и повторяет 256 байт бесконечно:

```asm
; Index Y = 8 bits → max 256 bytes de données tiles
; Si Y overflow (255 → 0) sans rencontrer $FD → repeat
; Même chose pour les sprites, mais les objets pipe (3 bytes)
; décalent la parité de l'index à chaque chargement.
```

Некоторые глитч-уровни используют это повторение для генерации уровней, которые длятся "бесконечно".

### Система спрайтов: 2 байта + pipe-транзишены

Спрайты следуют похожему формату, но без заголовка и с некоторыми ключевыми отличиями. Байт $FF отмечает конец списка.

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

Младший бит первого байта — **hard level flag**: если установлен в 1, спрайт появляется только на уровнях ≥ 5-3. Так создаются уровни "hard mode".

Y-позиция 15 = **screen skip** (аналогично тайлам). Y-позиция 14 = **pipe transition** (3 байта):

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

У спрайтов **нет системы очереди**. Единственное ограничение — в зоне спавна (просто за экраном справа) не может быть загружено одновременно больше 4 спрайтов. Больше — спрайты игнорируются.

## Как получить доступ к глитч-мирам

Есть два основных метода.

### Классический метод: wall clip

Wall clip (прохождение сквозь стены) позволяет выйти из нормального уровня и дойти до спрятанной warp-зоны. Манипулируя счётчиком мира через RAM, можно загрузить любой Level ID.

Техника:
1. World 1-2: зайти в спрятанную трубу в конце
2. Сделать wall clip на правой стене
3. Идти в пустоте до warp-зоны
4. Интерпретирует значения как миры

Но этот метод даёт доступ только к малой части глитч-миров.

### Экстремальный метод: cart swap с NES Tennis

Подробности см. в разделе "Тёплый старт" выше. Вкратце: счётчик шагов тennis пишет в тот же байт RAM, что и стартовый мир SMB1, а определение тёплого старта сохраняет это значение.

### Блог для хакеров: код для полного исследования

Если хочешь исследовать все глитчи сам в эмуляторе, можно пропатчить Level ID напрямую:

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

RGMechEx опубликовал полный список из 128 уровней × 4 типа с автоматически сгенерированными картами на [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html). Каждая запись показывает tile pointer, sprite pointer и визуальную карту уровня.

## Самые WTF-уровни

### Level ID $1F (Water): 15 глитч-миров в одном

Tile pointer $A302 (3-4) в комбинации со sprite pointer $02A0 даёт 15 разных глитч-миров (D-1, J-1, Y-1, Z-1, 55-1, 73-1...). Объяснение: sprite pointer указывает на область ROM, содержащую данные, достаточно близкие к валидным спрайтам для создания играбельных результатов, но комбинация тайлов замка 3-4 со спрайтами overworld создаёт абсурдный рендер.

### Level ID $28 (Overworld): 38 глитч-миров = рекорд

Абсолютный рекорд. 38 записей глитч-миров указывают на один и тот же уровень (тайлы 2-1 + $9F51 спрайты). Почему? Потому что sprite pointer $9F51 попадает в область ROM, которая используется как padding/звуковые данные и переиспользуется множеством ID.

### Level ID $49 (Underground): уровень FDS

Tile pointer $76AE + sprite pointer $1C9D. Tile pointer указывает на область ROM, зарезервированную для версии Famicom Disk System. Результат: уровень с тайлами, которых не существует в стандартном картридже. Именно этот уровень порождает уровни 52-1 и 196-1.

### Level ID $00-$02: настоящие бонусные уровни

Эти ID используются легитимными подуровнями игры:

- **$00**: подводная зона 5-2/6-2 (используется H-1, 39-1)
- **$01**: вода 2-2/7-2 (Minus World, 36-1)
- **$02**: подуровень 8-4 (136-1, 151-1, 215-1)

Разница между "бонусным" уровнем, доступным нормально, и глитч-миром в том, что warp-зоны проверяют текущий мир:

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

Глитч-миры с номерами > 8 или 0 недоступны через нормальные трубы. Нужен wall clip или cart swap.

## Почему некоторые уровни крашатся: jump tables

Когда игра загружает объект тайла, она использует его тип как индекс в **jump table**:

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

![Jump tables: почему невалидный тип объекта крашит игру](/images/smb1-glitch-levels/v4-jump-table.jpg)

Если объект имеет невалидный тип (≥12), игра прыгает на указатель, которого нет в этой таблице. **4 возможных исхода**:

1. **Валидный указатель** → объект загружается нормально
2. **Указатель на другую jump table** (перекрытие) → появляется другой объект. Пример: тип 12 указывает на таблицу Y=13, что даёт L-pipe.
3. **Указатель на исполняемый код** → выполнение случайного кода (скорее всего краш)
4. **Явный placeholder (NOP)** → объект ничего не делает (некоторые спрайты такие — враги висят на месте без движения)

![Глитч-уровень ID $58: sprite pointer указывает на невалидный адрес, игра крашится](/images/smb1-glitch-levels/v4-glitch-58-crash.jpg)

![Глитч-уровень ID $50: облачный туннель, уровень, сгенерированный повреждёнными данными](/images/smb1-glitch-levels/v4-glitch-50.jpg)

Глитч-уровень ID $58 (туннель, который крашится): его sprite pointer указывает на область памяти, **которой не существует на NES без mapper ROM**. Игра пытается загрузить одного и того же Koopa 5 раз за кадр в позиции (0,0), что перегружает PPU и вызывает фриз.

```asm
; Pourquoi ID $58 crashe :
; Sprite pointer → adresse invalide (hors espace NES standard)
; → Le jeu lit des bytes indéterminés comme des types de sprite
; → Le Koopa $00 (type invalide sans handler) boucle en appel récursif
; → Stack overflow 6502 → freeze
```

### Парадокс pipe warp

Помнишь проверку `target_world BETWEEN 1 AND 8`? Даже если найдёшь трубу в глитч-мире, игра проверит, что мир назначения между 1 и 8. Глитч-миры имеют номера > 8 (36-1, 255-1...), поэтому warp не работает.

Именно поэтому Minus World не имеет конца: flagpole не присутствует в спрайтах, а трубы ведут в никуда.

### Трюк с 5 объектами в одной колонке

Существует edge case, который позволяет обойти лимит в 3 объекта на колонку. Когда очередь блокируется (слоты заполнены + следующий объект без next screen flag), игра "предобрабатывает" текущую колонку в цикле, пока не найдёт объект с next screen flag. При каждой предобработке:

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

Это называется "queue skip" и используется некоторыми ромхакерами для создания уровней плотнее, чем позволяет формат.

## Различия между версиями

### Famicom Disk System

Версия FDS SMB1 имеет **другую memory map**. Все указатели уровней сдвинуты, но данные те же. Что меняется: индексы глитч-миров полностью другие:

```
FDS World 36 → Level ID $09 (eau version de 5-3)
  → Le flagpole est présent ! On peut finir le niveau.
  → Ensuite : $27 (7-3 normal) → $44 (4-4 underground)
  → $44 est finissable → la hache fonctionne → fin du jeu !
  
Le Minus World FDS est donc un "bonus world" qui peut mener
à la complétion du jeu, contrairement à la version NES.
```

Мой любимый FDS-уровень: **ID $5F**, подземная версия второй половины 3-3 в низком туннеле (жаль, что это автоскроллер).

### The Lost Levels (Super Mario Bros. 2 японская)

Lost Levels меняет многое:

1. **Одинаковый порядок tiles/sprites**: больше нет Frankenstein levels (тайлы и спрайты загружают один и тот же уровень даже с невалидным ID)
2. **Одна 16-битная таблица указателей** вместо двух отдельных таблиц high/low
3. **4 файл диска**: ROM была разделена для FDS:
   - Файл 1: миры 1-4
   - Файл 2: миры 5-8
   - Файл 3: мир 9 + звуковой движок
   - Файл 4: миры A-D (совершенно другая таблица указателей)
4. **Один Level ID = 4 возможных уровня** в зависимости от загруженного файла
5. **Больше нет глитча с теннисом**: опция continue (продолжение с того же мира после game over) делает тёплый старт ненужным, и игра **мгновенно сбрасывается**, если мир > 9
6. **Новые объекты**: ядовитый гриб, невидимый блок, невидимый блок с огненным цветком, перевёрнутые трубы, ветер — но вставлены в середину существующих списков → **обратная несовместимость** с SMB1
7. **Piranha Plants всегда красные** после мира 4, **зелёные пружины** только в мирах 2/B/3/C/7

### Super Mario All-Stars (SNES)

Прямой порт с теми же 6502-рутинами (SNES выполняет код NES в совместимом режиме):

- **Исправленная warp-зона**: больше нет Minus World (вход в левую трубу до текста ведёт в правильный мир)
- **Падение**: большинство глитч-уровней крашатся (кроме ID $6A и 9-1)
- **Добавлены объекты замка**: более уникальный рендер
- **Но**: **4-2 wrong warp** по-прежнему работает (не исправлен!)

### 4-2 wrong warp: баг размещения объекта

В 4-2 есть два объекта pipe-транзишена: лоза (warp-зона) и труба (комната с монетами). Первый объект транзишена (лозы) размещён **задолго до** того, как лоза появляется на экране. Второй (труба) размещён **слишком поздно в уровне**.

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

### Зацикленные уровни

Как работают loop (8-4, 7-4)? У уровня есть **чекпоинты** с номерами экранов и зашитыми Y-позициями:

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

## Менять формат, а не код

Один из самых завораживающих уроков этой архитектуры — разработчики SMB1 смогли создать очень выразительную систему уровней, никогда не трогая код рендеринга 6502. Всё разнообразие между уровнями идёт от **данных** (указатели, объекты, спрайты, floor patterns), а не от кода.

256 глитч-миров существуют потому, что **таблицы указателей рассчитаны на 128 записей × 4 типа**, и игра никогда не проверяет значения, которые читает. Когда указатель попадает в RAM, игра интерпретирует регистры Mario как тайлы. Когда указатель попадает в звуковые данные, игра играет музыку в виде level design. А когда jump tables переполняются, игра выполняет что угодно вплоть до краша.

![More Super Mario Bros. Mechanics Explained — четвёртое видео](/images/smb1-glitch-levels/yt-mechanics.jpg)

## Чему можно научиться из всего этого

1. **Разделение tiles/sprites**: полная независимость двух слоёв с разным порядком хранения, создающим уникальные Frankenstein levels
2. **RLE-сжатие + система объектов**: уровни — не битмапы, а списки размещённых объектов с floor patterns для пола
3. **Очередь на 3 слота**: строгое ограничение hardware (и дизайна уровней)
4. **Без проверки**: игра доверяет указателям и jump tables, что даёт либо играбельные глитчи, либо краши
5. **256 байт максимум**: лимит Y-регистра 6502, из-за которого данные повторяются при выходе за границу
6. **Warm start / cold start**: система "продолжения", открывшая дверь к cart swap Tennis → Mario

Самое прекрасное: всё это — код 6502, уместившийся в 40КБ. Без слоя абстракции, без проверки доступа к памяти, без обработчика исключений. Если указатель отстойный — игра крашится. А краши мы называем глитч-мирами.

## 3 главных вывода

1. **Глитч-миры — это указатели, которые попадают не туда** — У игры 128 ID × 4 типа зон, но только 34 уникальных уровня. Когда номер мира повреждён (теннисом или wall clip), игра загружает указатель, предназначенный для другого уровня, и 512 возможных комбинаций дают непредсказуемые результаты.

2. **Minus World — это баг warp'а в сочетании с повреждением данных** — Левая труба в 1-2, если активирована до появления текста, загружает мир 36 (0x24). Этот мир указывает на Level ID $01 (вода 2-2), уровень без flagpole. И поскольку для мира 36 нет pipe-транзишена, уровень зацикливается. Отсутствие проверки создаёт икону.

3. **Tennis → Mario, 15 лет до OoT → Paper Mario** — RAM NES выживает при замене картриджа благодаря конденсаторам и системе warm start / cold start SMB1. Счётчик шагов тенниса (который увеличивает байт RAM, проигрывая звук шагов) попадает точно на адрес номера мира. Нужно, чтобы цифры top score оставались 0, байт $A5 был нетронут, и игра определила тёплый старт — идеальное стечение обстоятельств, которое сработало только с теннисом.

Оригинальные видео [Retro Game Mechanics Explained](https://www.youtube.com/c/RetroGameMechanicsExplained) — это потрясающий труд: уровень детализации по дизассембли 6502, автоматические карты всех уровней, объяснения cart swap и warm start. Если не смотрел серию — посмотри, она короткая, и каждая минута насыщена.

Исходный код карт доступен на [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html), а полный дизассембл SMB1 — open source на множестве репозиториев. 40 лет назад японские программисты написали эту систему уровней на 6502 с нулевыми юнит-тестами и нулевым баг-трекером, и мы продолжаем узнавать новое, разглядывая их код сегодня.
