---
title: "Super Mario Bros.: o formato de nível, os ponteiros e as 256 glitch worlds"
description: "Como 128 níveis × 4 tipos de zona cabem em 40KB de ROM, por que o Minus World existe, e como uma partida de Tennis NES pode carregar glitch worlds."
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

## Introdução

Super Mario Bros. são 40 kilobytes de ROM. Oito mundos, 32 níveis, inimigos, música, power-ups, tudo cabe ali.

Mas se você abrir um emulador e fuçar nos bytes certos, pode carregar o nível 36-1. Ou o 255-1. Ou cair num mundo onde tudo é feito de sprites do Bowser e de canos que não levam a lugar nenhum.

Essas glitch worlds existem por uma razão simples: o sistema de armazenamento de níveis do SMB1 é uma obra-prima de otimização de 8-bit, e quando você força o jogo a ler onde não deveria, os resultados são fascinantes.

Retro Game Mechanics Explained fez uma série de 4 vídeos sobre isso -- vamos compilar tudo em uma única imersão no código 6502 do jogo mais vendido da sua época.

![GLITCH OBJECTS -- o título da série do RGMechEx sobre as mecânicas ocultas do SMB1](/images/smb1-glitch-levels/title-card.jpg)

![World 9-1 -- a tela título da primeira glitch world acessível via o cart swap do Tennis](/images/smb1-glitch-levels/v1-title-9-1.jpg)

## O warm start: por que a RAM do Tennis sobrevive no SMB1

Antes de falar sobre armazenamento de níveis, é preciso entender como o SMB1 inicia. Porque o glitch do cart swap do Tennis NES depende inteiramente do **sistema de detecção warm start / cold start** do jogo.

### Os 41 bytes preservados

Quando o SMB1 detecta um **cold start** (primeira vez ligado ou power off/on), ele apaga toda a RAM. Mas quando detecta um **warm start** (reset pelo botão, sem corte de energia), ele preserva uma área de memória de **41 bytes**:

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

Esses 41 bytes servem para uma única funcionalidade: permitir que o jogador **continue no mesmo mundo após um game over**. Se você morrer em 6-3, o jogo grava o mundo 6 no byte de início, e na tela título, se você segurar A + Start, recomeça em 6-1.

![Os 41 bytes preservados na RAM durante um warm start -- TOP SCORE, MARIO SCORE, TIMER, WORLD SELECT, CONTINUE WORLD, e o byte mágico $A5](/images/smb1-glitch-levels/v1-memory-state.jpg)

### A dupla verificação do warm start

![Cold start vs warm start -- o diagrama de detecção do reset](/images/smb1-glitch-levels/v1-warm-start.jpg)

Quando o SMB1 inicia, ele não verifica um único critério mas **dois**:

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

![A verificação do byte $A5 e dos dígitos do top score -- o coração do warm start](/images/smb1-glitch-levels/v1-a5-byte.jpg)

Por que uma dupla verificação? Porque o byte $A5 poderia estar presente por acaso (outro jogo que deixou esse valor, ou o estado de repouso padrão do chip RAM). Ao verificar que os dígitos do top score são válidos (0-9), garante-se que os dados são coerentes.

### Por que o Tennis é o único jogo que funciona

Quando inserimos o SMB1 pela primeira vez (cold start), o jogo:
1. Apaga toda a RAM → top score = 0, world byte = 0
2. Grava $A5 no endereço $0787

Depois, fazemos o swap para o Tennis sem desligar o console. O Tennis:
- **Não limpa a RAM ao iniciar** (poucos jogos de NES fazem isso)
- **Não grava nos bytes do top score** → eles ficam em 0 (válidos)
- **Não toca no byte $A5** → ele continua presente
- **Usa o endereço $075F** para o contador de passos do jogador

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

Quando volamos ao SMB1:
1. O byte $A5 ainda está lá (o Tennis não o tocou)
2. Os dígitos do top score ainda são 0 (válidos)
3. O world byte agora vale 8+ (incrementado pelos passos do Tennis)
4. O SMB1 detecta um warm start → preserva o world byte corrompido
5. Manter A + Start → world 9-1, world A-1, world 36-1, etc.

### Por que é necessário iniciar o Mario antes do Tennis

Uma sutileza: é preciso primeiro iniciar o SMB1, depois o Tennis, e depois o SMB1 novamente. Se você começasse direto pelo Tennis, o byte $A5 nunca seria gravado (o Tennis não grava $A5), portanto a detecção de warm start falharia e a RAM seria apagada.

![O contador de passos do Tennis: cada footstep incrementa o world byte](/images/smb1-glitch-levels/v1-footstep.jpg)

![Acessando Glitch Worlds via NES Tennis -- o vídeo que explica o cart swap](/images/smb1-glitch-levels/yt-tennis.jpg)

## Como o SMB1 armazena seus níveis em 40KB

A Nintendo R&D4 teve que resolver um problema aparentemente simples: representar níveis que rolam horizontalmente com tiles, inimigos, itens, tudo em um orçamento de ROM ultra apertado.

A solução é uma separação em duas camadas de dados **completamente independentes**:

### O tile layout (o mapa do nível)

Cada nível é definido por um ponteiro para uma estrutura de tiles comprimida na ROM. A compressão é rudimentar, mas brilhante: um byte "controle" seguido de 1-3 bytes de dados.

O formato de tile usa um sistema de **runs** (tipo RLE):

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

Cada nível contém 13 linhas de 16 colunas de tiles (13×16 = 208 tiles visíveis). Mas o formato comprimido permite ir muito mais baixo -- por exemplo, o céu e as colunas vazias quase não ocupam espaço.

O loop de renderização em 6502:

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

### O sprite layout (inimigos e objetos)

Paralelamente, inimigos e objetos (blocos ?, canos, goombas, koopas) são armazenados em uma estrutura completamente separada. Cada spawn é definido por 2 bytes:

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

Cada nível pode referenciar até 5 páginas de sprites diferentes (na verdade, 5 "telas" de 16 colunas), mas na prática a maioria dos níveis usa apenas 2-3.

### A tabela de ponteiros

O gênio do design é a tabela de ponteiros. Cada nível é armazenado como um **par** de endereços ROM:

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

128 entradas por tabela. 4 tipos de zona. **512 combinações possíveis**, mas apenas uma fração é usada pelo jogo oficial. O resto é RAM não inicializada ou dados que são interpretados como ponteiros.

Quando o jogo carrega um nível, ele faz isso:

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

Nenhuma validação. Nenhuma verificação de que o ponteiro é válido. O jogo lê o endereço na tabela e descomprime o que estiver nesse endereço, ponto final.

![Level ID $06 (Water) -- 9-1, a versão subaquática de 6-2](/images/smb1-glitch-levels/lvl-06-9-1.png)

![A tabela de Level IDs: 128 entradas possíveis, 34 atribuídas](/images/smb1-glitch-levels/v2-level-id-table.jpg)

![A ordem diferente dos ponteiros tiles e sprites -- a causa dos Frankenstein levels](/images/smb1-glitch-levels/v2-pointer-tables.jpg)

### Os 34 níveis únicos e o sistema de ID de 7 bits

![O chip RAM da NES (MB8416A) -- é ele que preserva os dados quando fazemos swap das cartuchos](/images/smb1-glitch-levels/v1-ram-chip.jpg)

O SMB1 não tem 32 níveis, mas **34 níveis únicos**. Muitos níveis são duplicatas (5-3 = 1-3 mas com Bullet Bills) marcados por um flag de "hard mode". Os verdadeiros níveis únicos:

- **Água** (Tipo 0): 3 níveis (2-2, 7-2, zona bônus 5-2/6-2)
- **Overworld** (Tipo 1): 22 níveis (incluindo as 2 salas de nuvens bônus)
- **Underground** (Tipo 2): 3 níveis (incluindo as salas bônus subterrâneas)
- **Castle** (Tipo 3): 6 níveis
- \+ 1 sala de cutscene (antes dos níveis subterrâneos/água)
- \+ 1 warp zone de 4-2

Cada nível tem um ID de **7 bits**. Os 5 bits de menor peso = número no subgrupo, os 2 bits de maior peso = tipo de zona:

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

**128 IDs possíveis** ($00-$7F), apenas 34 atribuídos a níveis reais. Os IDs não utilizados apontam para qualquer coisa.

### As tabelas de ponteiros: duas listas, duas ordens

Os ponteiros tiles e sprites não são armazenados na mesma ordem. O código usa duas listas separadas de 16-bit (high byte / low byte em duas tabelas distintas):

```
Ordem dos ponteiros sprites:
  Index 0-5   : Castle (6 níveis)
  Index 6-27  : Overworld (22 níveis)
  Index 28-30 : Underground (3 níveis)
  Index 31-33 : Water (3 níveis)

Ordem dos ponteiros tiles:
  Index 0-2   : Water (3 níveis)
  Index 3-24  : Overworld (22 níveis)
  Index 25-27 : Underground (3 níveis)
  Index 28-33 : Castle (6 níveis)
```

Por que ordens diferentes? Nenhuma razão técnica -- provavelmente é só como os dados foram organizados durante o desenvolvimento. Mas isso cria uma consequência fascinante: quando um ID de nível é inválido, os ponteiros tiles e sprites carregam níveis *diferentes*, criando **Frankenstein levels**.

Para navegar entre essas duas listas, o jogo usa pequenas **tabelas de offset** (como uma tabela de conteúdo):

```asm
; Tables d'offset par type (Water, Overworld, Underground, Castle)
; Chaque entrée = index de début dans la liste correspondante

SpriteOffsetTable:
  .byte $1F, $06, $1C, $00    ; Water=31, Overworld=6, Underground=28, Castle=0

TileOffsetTable:
  .byte $00, $03, $19, $1C    ; Water=0, Overworld=3, Underground=25, Castle=28
```

Para carregar o nível 6-2 (ID $23, Overworld número 3):

```asm
; 1. Type = 01 (Overworld) → index dans table d'offset = 1
; 2. Sprite offset = SpriteOffsetTable[1] = 6
;    Index final = 6 + 3 (numéro de niveau) = 9 → 10ème pointeur sprites
; 3. Tile offset = TileOffsetTable[1] = 3
;    Index final = 3 + 3 = 6 → 7ème pointeur tiles
; 4. Résultat : pointeur tiles $A619 + pointeur sprites $9ED0 = 6-2 ✓
```

Agora, o que acontece com um ID inválido como $43 (Underground número 3, que não existe)?

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

![Level ID $43 -- Frankenstein level: tiles 1-4 + sprites água 5-2](/images/smb1-glitch-levels/lvl-43-frankenstein.png)

![Explorando Glitch Level Pointers -- as tabelas de offset explicadas](/images/smb1-glitch-levels/yt-pointers.jpg)

![A world index table -- quando o overflow de world 9 cria um glitch level](/images/smb1-glitch-levels/v2-world-index-table.jpg)

### A world index table: por que world 9 faz overflow

Existe uma tabela ROM de 8 bytes que dá o índice do primeiro nível de cada mundo (1-8). E logo em seguida, a tabela dos 36 Level IDs de todos os níveis na ordem de jogo.

```asm
; WorldIndexTable (8 bytes)
  .byte 0, 5, 10, 15, 20, 25, 28, 33
;   -> Monde 1 commence au niveau 0
;   -> Monde 2 commence au niveau 5
;   -> Monde 8 commence au niveau 33

; LevelIDTable (36 bytes)
  .byte $25, $28, $29, $26, $24, ... ; les 36 Level IDs
```

Quando tentamos carregar world 9, o jogo lê o 9º byte da WorldIndexTable... que não existe. Ele faz overflow de 1 byte na LevelIDTable, lê o valor $25, depois usa $25 como índice na LevelIDTable (37ª entrada) -- o que faz overflow novamente de 2 bytes na SpriteOffsetTable, e lê o valor 6.

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

Para world G (16), o overflow vai ainda mais longe e cai no Level ID $01, que é o nível cutscene que antecede 1-2:

```asm
; World G (16) :
;   WorldIndexTable[15] → lit $01 dans LevelIDTable
;   LevelIDTable[1] = $29 (cutscene 1-2)
;   → world G-1 = la cutscene d'entrée de 1-2
```

## Por que as glitch worlds existem

O jogo tem 32 níveis "legítimos" (8 mundos × 4 níveis). Mas a tabela de ponteiros tem 128 entradas por tipo de zona. As entradas além do nível 32 contêm o que estiver na ROM nesses endereços -- às vezes outro nível, às vezes dados de som, às vezes RAM, às vezes qualquer coisa.

![Level ID $01 Water (Minus World) -- tile pointer $AE45, sprite pointer $A171](/images/smb1-glitch-levels/minus-world.png)

### Level ID $01 + AreaType 0 = Minus World

A mais famosa das glitch worlds. O Level ID $01 no AreaType 0 (água) aponta para:

- **Tile pointer: $AE45** → a zona subaquática de 2-2/7-2
- **Sprite pointer: $A171** → os sprites de 2-2/7-2

O resultado: um nível aquático que se parece com 2-2, mas que entra em loop infinito porque a flagpole não existe. Sem fim de nível, sem saída.

É o nível 36-1 (ou 36-1 no mundo $-1).

![O warm start check do SMB1 -- é ele que permite ao Minus World existir](/images/smb1-glitch-levels/v4-minus-world.jpg)

```asm
; Pourquoi le flagpole manque dans le Minus World :
; Les sprites de 2-2/7-2 ($A171) n'ont pas de flagpole
; dans leur séquence. Le jeu cherche le sprite $FD (flagpole)
; mais ne le trouve jamais → boucle infinie
;
; Le jeu continue de générer le niveau à l'infini
; jusqu'à ce que le timer atteigne zéro.
```

### Os ponteiros que apontam para a RAM

Quando o tile pointer ou o sprite pointer aponta para um endereço na RAM ($00-$7F) em vez de na ROM, o jogo tenta interpretar as mudanças constantes da RAM como tiles:

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

Quando a página zero muda (porque o Mario se move, o timer gira, etc.), os "sprites" do nível também mudam. É por isso que certas glitch worlds têm inimigos que piscam e se transformam constantemente.

![Level ID $03 Water -- sprite pointer $009D aponta para a RAM, nível injogável](/images/smb1-glitch-levels/level-03-water.png)

### Level ID $36: o nível vazio (Overworld)

Level ID $36 no Overworld:

- **Tile pointer: $AC35** (1-2)
- **Sprite pointer: $A0D8** (1-2)

Resultado: nada. O jogo carrega o nível mas ele é marcado "sem nível" no catálogo do RGMechEx. Os tiles talvez sejam válidos mas os sprites apontam para um lugar que produz um nível vazio ou não funcional.

### Level ID $1D (Castle): o campeão dos crashes

Level ID $1D no Castle:

- **Tile pointer: $A210** (4-4)
- **Sprite pointer: $7EA0** (RAM!)

Sprite pointer na RAM = sprites indefinidos. O jogo tenta exibir uma Spiny ball ou um Bullet Bill blaster na primeira linha de tiles. Isso causa crash imediatamente.

```asm
; Quand le sprite pointer pointe vers la RAM,
; le jeu décompresse des bytes qui changent tout le temps
; comme des instructions "spawn". Le résultat :
; - Apparition d'objets inexistants (valeur undefined)
; - Crash PPU quand le sprite NES essaie d'afficher un tile invalide
; - Freeze complet de la console
```

## As 256 glitch worlds catalogadas

O RGMechEx escreveu um script que gera os mapas de **todos os níveis**, para os 4 tipos de zona, e os 128 IDs cada.

O contador de mundo tem 8 bits (0-255). Os mundos 1-8 são legítimos. Restam **248 glitch worlds** potenciais. Cada glitch world corresponde ao primeiro nível desse mundo, e sua Level ID é calculada pelo mecanismo de overflow da WorldIndexTable.

![Tabela de glitch worlds -- 248 mundos corrompidos, 68 primeiros níveis acessíveis](/images/smb1-glitch-levels/v3-glitch-worlds-table.jpg)

Dos 128 IDs possíveis, apenas **68 são o "primeiro nível" de um mundo** (acessíveis via o número da glitch world). Os 60 restantes são níveis 2+ ou inacessíveis.

| Tipo | IDs únicos jogáveis | IDs que crasham | IDs vazios |
|------|---------------------|-------------------|-----------|
| Water (0)    | ~20  | ~60  | ~48  |
| Overworld (1)| ~30  | ~55  | ~43  |
| Underground (2) | ~15 | ~65 | ~48  |
| Castle (3)   | ~25  | ~58  | ~45  |

Muitos IDs levam ao mesmo nível por causa dos ponteiros que caem nos mesmos endereços ROM. O Level ID $28 (Overworld), por exemplo -- tile pointer $A7CD (2-1) -- aparece em **38 glitch worlds diferentes**, porque seu sprite pointer $9F51 aponta para uma zona da ROM que é usada como padding/dados sonoros reutilizados por vários IDs.

![Mapa do nível ID $28 (Overworld) -- tiles 2-1 com sprites normais, 38 glitch worlds](/images/smb1-glitch-levels/level-28-overworld.png)

![Super Mario Bros. Glitch Levels Explained -- o 3º vídeo](/images/smb1-glitch-levels/yt-levels.jpg)

### Os 6 glitch levels realmente únicos

Dentre os 19 IDs de glitch level acessíveis, apenas **6 não crasham imediatamente** no carregamento:

| World | Level ID | Descrição |
|-------|----------|-------------|
| E-1 (224) | $50 | Um único bloco ? sobre um abismo. O Mario morre instantaneamente. |
| W | $57 | O Mario nasce preso, incapaz de se mover. |
| 42 (133) | $50 | Túnel de nuvens que prende o Mario se ele for longe o suficiente. |
| 62 (131, 240) | $4D | Castelo congelado: o Mario nasce lá em cima, não pode cair → preso. |
| 127 | $4B | Túnel subterrâneo, mas crasha se for longe demais. |
| 137 | $4B | Ativa o scroll automático das cutscenes. O Mario encontra um único bloco brick que o bloqueia para sempre. |

![Level ID $50 (túnel de nuvens) -- a glitch world 42-1 e E-1](/images/smb1-glitch-levels/lvl-50-cloud.png)
![Level ID $4D (castelo) -- world 62-1, Mario preso no spawn](/images/smb1-glitch-levels/lvl-4D-castle.png)
![Level ID $4B (túnel) -- world 127-1, crasha se for longe demais](/images/smb1-glitch-levels/lvl-4B-tunnel.png)

Seis glitch worlds de 248 que produzem algo realmente novo. O resto são níveis normais com o tipo de zona errado, ou telas pretas.

## O formato dos níveis em detalhes

Mergulhando no formato exato dos dados de nível, para entender por que os glitch levels se sustentam (ou não).

### O cabeçalho do nível: 2 bytes, 6 propriedades

Cada nível começa com um cabeçalho de 2 bytes que controla 6 propriedades:

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

O tipo modifier controla variações visuais: as ondas no topo dos níveis aquáticos, o fundo de tijolos de 8-3, a paleta noturna de 4-3, a neve de 6-2, etc.

### Os objetos tile: 2 bytes, flag de next screen, fila de 3 slots

Depois do cabeçalho vem uma lista de **objetos tile**, cada objeto tem 2 bytes. O byte $FD marca o fim da lista.

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

Quando o bit "next screen" é setado, a coluna de trabalho atual é incrementada de 1. Isso permite colocar objetos além das 16 primeiras colunas. Os objetos devem ser listados **em ordem** (da esquerda para a direita) porque o jogo os carrega sequencialmente:

```asm
; La routine de chargement a DEUX phases par colonne :
; Phase 1 : chercher les nouveaux objets qui commencent sur cette colonne
;            et les ajouter à la file d'attente (queue)
; Phase 2 : traiter chaque objet dans la queue en dessinant les tiles,
;            et retirer ceux qui finissent sur cette colonne
```

A fila tem exatamente **3 slots**. Consequência direta: não é possível ter mais de 3 objetos começando na mesma coluna. Se a fila estiver cheia, o 4º objeto é ignorado e nunca será carregado.

É por isso que níveis bem projetados evitam empilar muitos objetos. Exemplo em 1-2: a coluna com o bloco 1up no teto + os tijolos ao lado são divididos em dois objetos distintos para respeitar o limite de 3.

### Y position especial: 12, 13, 14, 15

Quando Y=12, o objeto não tem posição Y (ela é fixa por tipo):

```asm
; Y=12 : objets sans Y position
;   Type 0 : trou (supprime le sol)
;   Type 1 : rope de plateforme mobile
;   Types 2-4 : ponts à Y fixe
;   Type 5 : trou avec eau/lave
;   Types 6-7 : rangées de ? blocks
```

Quando Y=13, dois subgrupos. Se o bit 6 do byte 1 estiver em 1:

```asm
; Y=13, bit6=1 : objets spéciaux
;   0 = L-pipe (cutscene), 1 = flagpole, 2-3 = pont/axe/hamer (fin château)
;   4 = stop screen, 5 = random enemies, 6 = loop level, 7+ = crash possible
```

Se bit6=0, os 5 bits de menor peso codificam um **screen skip** (pular diretamente para uma tela N, sem passar pelo next screen flag um por um).

Quando Y=14: mesmo princípio com bit6=1 para mudar o tipo modifier, bit6=0 para mudar o fundo + padrão de chão.

### Os floor patterns: 16 padrões de chão

O chão dos níveis não é feito de objetos individuais. O SMB1 usa **floor patterns**, um padrão de fundo que se aplica a todas as colunas até a próxima mudança:

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

É por isso que os buracos são objetos: eles sobrescrevem o floor pattern em uma coluna específica, sem precisar mudar o padrão para todo o resto.

### O limite de 256 bytes e o repeat

Todos os dados tile de um nível cabem em **no máximo 256 bytes**. O registrador Y do 6502 é usado como índice, e ele tem 8 bits. Se o jogo chegar ao fim dos dados sem encontrar o byte $FD, **ele volta ao começo** e repete os 256 bytes infinitamente:

```asm
; Index Y = 8 bits → max 256 bytes de données tiles
; Si Y overflow (255 → 0) sans rencontrer $FD → repeat
; Même chose pour les sprites, mais les objets pipe (3 bytes)
; décalent la parité de l'index à chaque chargement.
```

Alguns glitch levels exploram esse repeat para gerar níveis que duram "indefinidamente".

### O sistema de sprites: 2 bytes + transições de cano

Os sprites seguem um formato similar, mas sem header e com algumas diferenças-chave. O byte $FF marca o fim da lista.

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

O bit de menor peso do byte 1 é o **hard level flag**: se estiver em 1, o sprite só aparece nos níveis ≥ 5-3. É assim que os níveis "hard mode" são criados.

Y position 15 = **screen skip** (idêntico aos tiles). Y position 14 = **transição de cano** (3 bytes):

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

Os sprites **não têm um sistema de fila**. A única limitação é que não pode haver mais de 4 sprites carregados simultaneamente na zona de spawn (logo fora da tela à direita). Acima disso, os sprites são ignorados.

## Como acessar as glitch worlds

Existem dois métodos principais.

### O método clássico: o wall clip

O wall clip (passar através das paredes) permite sair do nível normal e caminhar até a warp zone escondida. Manipulando o contador de mundo via RAM, é possível carregar qualquer Level ID.

A técnica:
1. World 1-2: ir para o cano escondido no final
2. Fazer o wall clip na parede da direita
3. Caminhar no vazio até a zona warp
4. O jogo interpreta os valores como mundos

Mas esse método só dá acesso a uma pequena parte das glitch worlds.

### O método extremo: cart swap do NES Tennis

Ver a seção "O warm start" acima para o detalhe completo. Resumindo: o contador de passos do Tennis grava no mesmo byte RAM do mundo inicial do SMB1, e a detecção de warm start preserva esse valor.

### O cantinho dos curiosos: o código para explorar tudo

Se você quiser explorar todas as glitch worlds você mesmo em um emulador, pode aplicar o patch no Level ID diretamente:

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

O RGMechEx publicou a lista completa dos 128 níveis × 4 tipos com mapas gerados automaticamente no [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html). Cada entrada mostra o tile pointer, o sprite pointer e um mapa visual do nível.

## Os níveis mais wtf

### Level ID $1F (Water): 15 glitch worlds em uma

O tile pointer $A302 (3-4) combinado com o sprite pointer $02A0 dá 15 glitch worlds diferentes (D-1, J-1, Y-1, Z-1, 55-1, 73-1...). Explicação: o sprite pointer aponta para uma zona da ROM que contém dados suficientemente próximos de sprites válidos para produzir resultados jogáveis, mas a combinação dos tiles de castelo 3-4 com sprites de overworld cria uma renderização absurda.

### Level ID $28 (Overworld): 38 glitch worlds = recorde

O recorde absoluto. 38 entradas de glitch world apontam para o mesmo nível (tiles 2-1 + sprites $9F51). Por quê? Porque o sprite pointer $9F51 cai em uma zona da ROM que é usada como padding/dados sonoros reutilizados por vários IDs.

### Level ID $49 (Underground): o nível FDS

Tile pointer $76AE + sprite pointer $1C9D. O tile pointer aponta para a zona da ROM reservada à versão do Famicom Disk System. Resultado: um nível com tiles que não existem na cartucho padrão. É o nível que faz aparecer o nível 52-1 e 196-1.

### Level ID $00-$02: os verdadeiros níveis bônus

Esses IDs são usados por subníveis legítimos do jogo:

- **$00**: zona subaquática de 5-2/6-2 (usado por H-1, 39-1)
- **$01**: a água de 2-2/7-2 (o Minus World, 36-1)
- **$02**: subnível de 8-4 (136-1, 151-1, 215-1)

A diferença entre um nível "bônus" acessível normalmente e uma glitch world é que as warp zones verificam o mundo atual:

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

As glitch worlds com números > 8 ou 0 não podem ser alcançadas por canos normais. É preciso o wall clip ou o cart swap.

## Por que certos níveis crasham: as jump tables

Quando o jogo carrega um objeto tile, ele usa seu tipo como índice em uma **jump table**:

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

![As jump tables: por que um tipo de objeto inválido faz o jogo crashar](/images/smb1-glitch-levels/v4-jump-table.jpg)

Se um objeto tiver um tipo inválido (≥12), o jogo pula para um ponteiro que não existe nessa tabela. **4 resultados possíveis**:

1. **Ponteiro válido** → o objeto carrega normalmente
2. **Ponteiro para outra jump table** (sobreposição) → um objeto diferente aparece. Exemplo: tipo 12 aponta para a tabela Y=13, o que dá um L-pipe.
3. **Ponteiro para código executável** → execução de código aleatório (crash provável)
4. **Placeholder explícito (NOP)** → o objeto não faz nada (alguns sprites são assim, produzindo inimigos que ficam voando no lugar sem se mover)

![Glitch level ID $58: o sprite pointer aponta para um endereço inválido, o jogo crasha](/images/smb1-glitch-levels/v4-glitch-58-crash.jpg)

![Glitch level ID $50: o cloud tunnel, um nível gerado por dados corrompidos](/images/smb1-glitch-levels/v4-glitch-50.jpg)

A glitch level ID $58 (o túnel que crasha): seu sprite pointer aponta para uma região de memória que **não existe na NES sem mapper de ROM**. O jogo tenta carregar o mesmo Koopa 5 vezes por frame na posição (0,0), o que satura a PPU e causa um freeze.

```asm
; Pourquoi ID $58 crashe :
; Sprite pointer → adresse invalide (hors espace NES standard)
; → Le jeu lit des bytes indéterminés comme des types de sprite
; → Le Koopa $00 (type invalide sans handler) boucle en appel récursif
; → Stack overflow 6502 → freeze
```

### O paradoxo do pipe warp

Lembre-se do check `target_world BETWEEN 1 AND 8`. Mesmo que você encontre um cano em uma glitch world, o jogo verifica que o mundo de destino está entre 1 e 8. As glitch worlds têm números > 8 (36-1, 255-1...), então a warp falha.

É também por isso que o Minus World não tem fim: a flagpole não está presente nos sprites, e os canos não levam a lugar nenhum.

### O truque dos 5 objetos em uma coluna

Existe um edge case que permite ultrapassar o limite de 3 objetos por coluna. Quando a fila trava (slots cheios + objeto seguinte com next screen flag faltando), o jogo "pré-processa" a coluna atual em loop até encontrar um objeto com next screen flag. Durante cada pré-processamento:

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

Isso é o que chamamos de "queue skip" e é usado por certos romhackers para criar níveis mais densos do que o formato normalmente permite.

## As diferenças entre versões

### Famicom Disk System

A versão FDS do SMB1 tem um **memory map diferente**. Todos os ponteiros de nível são deslocados, mas os dados são os mesmos. O que muda: os índices das glitch worlds são completamente diferentes:

```
FDS World 36 → Level ID $09 (eau version de 5-3)
  → Le flagpole est présent ! On peut finir le niveau.
  → Ensuite : $27 (7-3 normal) → $44 (4-4 underground)
  → $44 est finissable → la hache fonctionne → fin du jeu !
  
Le Minus World FDS est donc un "bonus world" qui peut mener
à la complétion du jeu, contrairement à la version NES.
```

Meu nível FDS favorito: **ID $5F**, uma versão subterrânea da segunda metade de 3-3 em túnel baixo (pena que seja um autoscroller).

### The Lost Levels (Super Mario Bros. 2 japonês)

Lost Levels muda muitas coisas:

1. **Ordem idêntica tiles/sprites**: sem mais Frankenstein levels (tiles e sprites carregam o mesmo nível mesmo com um ID inválido)
2. **Uma única tabela de ponteiros 16-bit** em vez de duas tabelas separadas high/low
3. **4 arquivos de disco**: a ROM foi dividida para o FDS:
   - Arquivo 1: mundos 1-4
   - Arquivo 2: mundos 5-8
   - Arquivo 3: mundo 9 + motor de som
   - Arquivo 4: mundos A-D (tabela de ponteiros completamente diferente)
4. **Mesmo Level ID = 4 níveis possíveis** dependendo do arquivo carregado
5. **Sem glitch Tennis**: a opção continue (continuar no mesmo mundo após game over) torna o warm start desnecessário, e o jogo **reseta imediatamente** se world > 9
6. **Novos objetos**: cogumelo venenoso, bloco invisível, bloco invisível fire flower, canos de cabeça para baixo, vento -- mas inseridos no meio das listas existentes → **incompatibilidade retroativa** com SMB1
7. **Piranha Plants sempre vermelhas** após world 4, **springboards verdes** apenas nos mundos 2/B/3/C/7

### Super Mario All-Stars (SNES)

Port direto com as mesmas rotinas 6502 (o SNES executa o código NES em modo compatível):

- **Warp zone corrigida**: sem mais Minus World (entrar no cano esquerdo antes do texto leva ao mundo correto)
- **Travamento**: a maioria dos glitch levels crasha (exceto ID $6A e 9-1)
- **Objetos de castelo adicionados**: renderizações mais únicas
- **Mas**: o **4-2 wrong warp** ainda funciona (não foi corrigido!)

### O 4-2 wrong warp: um bug de posicionamento de objeto

Em 4-2, existem dois objetos de transição de cano: a videira (warp zone) e o cano (sala de moedas). O primeiro objeto de transição (o da videira) é posicionado **muito antes** que a videira apareça na tela. O segundo (o cano) é posicionado **tarde demais no nível**.

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

### Os níveis em loop

Como funcionam os loops (8-4, 7-4)? O nível tem **checkpoints** com números de tela e posições Y fixos:

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

## Mudar o formato, não a código

Uma das lições mais fascinantes dessa arquitetura é que os desenvolvedores do SMB1 conseguiram criar um sistema de nível muito expressivo sem nunca tocar no código de renderização 6502. Toda a variação entre os níveis vem dos **dados** (ponteiros, objetos, sprites, floor patterns), não do código.

As 256 glitch worlds existem porque as **tabelas de ponteiros são dimensionadas para 128 entradas × 4 tipos**, e o jogo nunca valida os valores que lê. Quando um ponteiro cai na RAM, o jogo interpreta os registradores do Mario como tiles. Quando um ponteiro cai nos dados sonoros, o jogo toca música em forma de level design. E quando as jump tables fazem overflow, o jogo executa qualquer coisa até o crash.

![More Super Mario Bros. Mechanics Explained -- o 4º vídeo](/images/smb1-glitch-levels/yt-mechanics.jpg)

## O que podemos aprender com tudo isso

1. **Separação tiles/sprites**: independência total das duas camadas, com ordens de armazenamento diferentes que criam Frankenstein levels únicos
2. **Compressão RLE + sistema de objetos**: os níveis não são bitmaps mas listas de objetos posicionados, com floor patterns para o chão
3. **Fila de 3 slots**: limitação estrita do hardware (e do design de nível)
4. **Sem validação**: o jogo confia nos ponteiros e nas jump tables, o que produz ou glitches jogáveis ou crashes
5. **256 bytes no máximo**: o limite do registrador Y do 6502, que faz os dados se repetirem se você for longe demais
6. **Warm start / cold start**: um sistema de "continuar" que abriu a porta para o cart swap Tennis → Mario

O mais belo de tudo: é código 6502 que cabe em 40KB. Sem camada de abstração, sem validação de acesso a memória, sem gerenciador de exceções. Se o ponteiro estiver zoado, o jogo crasha. E os crashes, chamamos de glitch worlds.

## Os 3 pontos para lembrar

1. **As glitch worlds são ponteiros que caem errado** -- O jogo tem 128 IDs × 4 tipos de zona, mas apenas 34 níveis únicos. Quando o world number é corrompido (pelo Tennis ou wall clip), o jogo carrega um ponteiro feito para outro nível, e as 512 combinações possíveis produzem resultados imprevisíveis.

2. **O Minus World é um bug de warp combinado com corrupção** -- O cano esquerdo em 1-2, se ativado antes que o texto apareça, carrega world 36 (0x24). Esse world aponta para Level ID $01 (água de 2-2), um nível sem flagpole. E como não há transição de cano para world 36, o nível entra em loop infinito. A ausência de verificação cria o ícone.

3. **Tennis → Mario, 15 anos antes de OoT → Paper Mario** -- A RAM da NES sobrevive a um swap de cartucho graças aos capacitores e ao sistema de warm start / cold start do SMB1. O contador de passos do Tennis (que incrementa um byte RAM ao tocar o som dos passos) cai exato no endereço do world number. É preciso que os dígitos do top score fiquem em 0, que o byte $A5 esteja intacto, e que o jogo detecte um warm start -- uma conjugação de circunstâncias perfeita que só funcionou com o Tennis.

Os vídeos originais do [Retro Game Mechanics Explained](https://www.youtube.com/c/RetroGameMechanicsExplained) são um trabalho formidável -- o nível de detalhe na desmontagem 6502, os mapas automáticos de todos os níveis, as explicações do cart swap e do warm start. Se você não viu a série, assista, ela é curta e cada minuto é denso.

O código-fonte dos mapas está disponível no [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html), e a desmontagem completa do SMB1 é open source em vários repositórios. Há 40 anos, programadores japoneses escreveram esse sistema de nível em 6502 com zero testes unitários e zero rastreador de bugs, e continuamos aprendendo coisas ao abrir o código deles hoje.
