---
title: Bareiron -- o servidor Minecraft que roda em um microcontrolador de 1$
description: 6800 linhas de C, zero malloc, Perlin noise substituído por
  interpolação bilinear, biomas em tile map, e tudo isso em um chip de 1$.
date: 2026-05-30
authors:
  - fox3000foxy
tags:
  - minecraft
  - reverse-engineering
  - embedded
  - c
  - esp32
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "4dAaalhV8J4VgnWyO14nbLN6MmCFMcSJku6V8HlFUDWAVRcSDurv/NCbOaPt7ikrhgCRO+qB2I5Foli7U1Yfog=="
---

## Introdução

Você já se perguntou se daria para rodar um servidor Minecraft em um microcontrolador de 1 real?

Eu sim. E a resposta é sim. Literalmente.

Tem um projeto chamado [Bareiron](https://github.com/p2r3/bareiron/), assinado p2r3, e é provavelmente um dos projetos mais fascinantes que já vi no mundo Minecraft nos últimos anos. Estamos falando de um binário que cabe em **300 kilobytes**, **6800 linhas de C**, zero dependência externa, sem malloc, sem threading, e roda em uma **ESP32 de 1 dólar**.

![ESP32-C3, o microcontrolador que roda o servidor](/images/bareiron/esp32-board.jpg)

Geração de terreno infinita. Biomas. Cavernas. Craft. Mineração. Mobs. Fome. Baús. Tudo que você espera de um servidor survival.

Em um chip que consome **0.5 Watt** e tem **160 MHz** de clock.

Para ter uma ideia: um servidor Minecraft vanilla precisa de vários gigas de RAM. A ESP32-C3 tem **520 KB de SRAM** (400 disponíveis após o boot). Os processadores de 20 anos atrás já rodavam em gigahertz -- este aqui chega no máximo a 160 MHz. O fator entre os dois em potência pura é cerca de **20 000**.

p2r3 não escreveu um servidor Minecraft em C, ele reinventou cada peça do servidor para caber nessas restrições. Vamos ver como, abrindo o código fonte.

![Miniatura do vídeo de apresentação do Bareiron por p2r3](/images/bareiron/title-card.jpg)

## O cérebro do projeto: uma geração de terreno sem memória

O maior problema quando você quer fazer um servidor MC embarcado é a geração de terreno.

No Minecraft vanilla, o mundo é gerado com **Perlin noise**: várias camadas sobrepostas (octaves), 6 parâmetros biomônicos (temperatura, umidade, continentalidade, erosão, weirdness, profundidade), e todo um sistema de caching para não ter que recalcular tudo toda vez.

O resultado é magnífico. Mas é caro em processamento, e usa RAM para armazenar os chunks gerados.

A abordagem do Bareiron é radicalmente diferente. Em vez de empilhar ruído, ele usa **interpolação bilinear** em 4 pontos gerados por um **RNG determinístico**.

Sabe quando você amplia uma imagem pequena pixelizada e as bordas ficam borradas? É exatamente isso.

```c
// worldgen.c, linhas 117-171 (simplificado)

uint8_t interpolate (uint8_t a, uint8_t b, uint8_t c, uint8_t d, int x, int z) {
  uint16_t top    = a * (CHUNK_SIZE - x) + b * x;
  uint16_t bottom = c * (CHUNK_SIZE - x) + d * x;
  return (top * (CHUNK_SIZE - z) + bottom * z) / (CHUNK_SIZE * CHUNK_SIZE);
}

uint8_t getHeightAt (int x, int z) {
  int _x = floor(x / CHUNK_SIZE);  // chunk coordinates
  int _z = floor(z / CHUNK_SIZE);
  int rx = x % CHUNK_SIZE;          // offset inside chunk
  int rz = z % CHUNK_SIZE;
  uint32_t hash = getChunkHash(_x, _z);
  uint8_t biome = getChunkBiome(_x, _z);
  // interpolation between 4 corners seeded by hash + biome
  return getHeightAtFromHash(rx, rz, _x, _z, hash, biome);
}
```

A interpolação bilinear padrão: 4 cantos, pesos conforme a posição, um único `uint8_t` na saída. CHUNK_SIZE é 8, então tudo se resolve com multiplicações inteiras, sem float.

p2r3 mostra passo a passo no vídeo: primeiro os 4 cantos do chunk, cada um com uma altura seedada pelo RNG.

![Os 4 cantos do chunk, cada um seedado pelo RNG determinístico](/images/bareiron/gen-four-corners.jpg)

Depois a interpolação entre esses 4 pontos cria uma superfície contínua.

![Aplicação da interpolação bilinear entre os 4 cantos](/images/bareiron/gen-interpolate.jpg)

E repetindo o padrão em todos os chunks adjacentes, obtemos um terreno que se estende infinitamente.

![Resultado final: terreno irregular contínuo](/images/bareiron/gen-result.jpg)

### O RNG determinístico

A chave que torna tudo isso possível é o seeding. Cada chunk tem 4 cantos, e cada canto precisa de um valor pseudoaleatório único mas reproduzível.

```c
// worldgen.c, linhas 13-22

uint32_t getChunkHash (short x, short z) {
  uint8_t buf[8];
  memcpy(buf, &x, 2);          // 16 bits de coordenada X
  memcpy(buf + 2, &z, 2);      // 16 bits de coordenada Z
  memcpy(buf + 4, &world_seed, 4);  // 32 bits de seed global
  return splitmix64(*((uint64_t *)buf));  // hash
}
```

Ele empacota os 16 bits de X, 16 bits de Z, e 32 bits de seed, em um buffer de 8 bytes, e passa tudo pelo `splitmix64`. Resultado: um valor determinístico único para cada posição, baseado na seed do mundo.

Saca a potência disso? O servidor não precisa armazenar o terreno. Ele recalcula na hora quando o jogador chega em uma nova área, e dá exatamente o mesmo resultado toda vez.

O `splitmix64` usado é um prng ultra-rápido projetado para hashes de 64 bits:

```c
// worldgen.c (simplificado)

static uint32_t splitmix64 (uint64_t state) {
  state += 0x9E3779B97F4A7C15ull;
  uint64_t z = state;
  z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ull;
  z = (z ^ (z >> 27)) * 0x94D049BB133111EBull;
  return (z ^ (z >> 31)) >> 32;
}
```

3 operações: adição, xor/shift, multiplicação, xor/shift, multiplicação, xor/shift. Sem lookup table, sem loop. Ele pega o buffer de 8 bytes (X + Z + seed), trata como um inteiro de 64 bits, e retorna 32 bits de hash. É determinístico, rápido, e cabe em 5 linhas.

### Por que isso não é Perlin noise

p2r3 diz ele mesmo no vídeo: "quanto mais dígitos do número aleatório você adiciona, mais regular o terreno fica, como mais lançamentos de moeda te aproximam de 50/50". Na prática, é o número de bits do hash que ele combina:

```c
// worldgen.c, linhas 51-115

// Para um biome plains: 4 fatores combinados → terreno regular
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// Para snowy plains: 2 fatores → mais acidentado
h = (hash % 5) + ((hash >> 4) % 5);
```

Cada bioma escolhe quantas extrações de bits combina. Quanto mais, mais a distribuição se estabiliza -- como mais lançamentos de moeda que se aproximam de 50/50. Quanto menos, mais fortes são as variações locais.

![Terreno irregular -- poucos fatores, variações fortes](/images/bareiron/terrain-irregular.jpg)

Com apenas 2 fatores, o snowy plains produz um terreno montanhoso, quase acidentado. Os picos e vales são frequentes.

![Terreno regular -- fatores múltiplos, superfície lisa](/images/bareiron/terrain-regular.jpg)

Com 4 fatores, as planícies permanecem planas e previsíveis. A distribuição se estabiliza.

Um chunk é gerado em **200 ms** na ESP32 -- contra um tempo nem mensurável no mesmo hardware com Perlin noise de tão caro que é.

### O detalhe matador: consultar um bloco sem gerar o chunk inteiro

Você joga, minera um bloco. O servidor precisa saber qual item te dar. Ingenuamente, seria necessário gerar o chunk inteiro para isso.

Com a interpolação bilinear, você consulta **qualquer ponto** do plano diretamente a partir das coordenadas. Os cantos do chunk são obtidos a partir da posição do jogador, a interpolação te dá a altura em qualquer offset. Um punhado de operações matemáticas, sem geração de chunk.

p2r3: "o que eu quero é uma função mágica que possa me dizer qual bloco está em uma determinada coordenada, sem acessar a memória nem calcular mapas de ruído caros". Exatamente o que ele fez.

Aqui está como a altura se torna blocos concretos:

```c
// worldgen.c (simplificado)

uint8_t getTerrainBlock (int x, uint8_t y, int z) {
  uint8_t surface = getHeightAt(x, z);

  if (y > surface)             return B_air;
  if (y == surface)            return biome_top[getChunkBiome(x, z)];
  if (y > surface - 4)         return B_dirt;
  if (y > surface - 16)        return B_stone;
  if (y > CAVE_BASE_DEPTH)     return B_deepslate;
                               return B_bedrock;
}
```

5 condições. Uma camada de grass/dirt/stone/deepslate/bedrock. O bloco de superfície depende do bioma via `biome_top[]` -- grass para planícies, sand para deserto. Sem loop, sem switch, uma cascata de if que cai na camada certa.

### As cavernas, o espelho mais preguiçoso

```c
altitude_caverna = CAVE_BASE_DEPTH - (altura_superficie - y);
```

Ele espelha a altura da superfície subterrânea. Isso se parece com as grandes cavidades de deepslate. Zero processamento, uma linha.

![Cavernas geradas por espelhamento do terreno de superfície](/images/bareiron/cave-mirror.jpg)

![Diagrama do espelhamento de terreno para gerar cavernas](/images/bareiron/cave-diagram.jpg)

### Os minérios, versão XOR

```c
candidato = (chunk_x ^ col_x ^ col_z) % 100;
if (candidato < 5 && y < 16) -> diamond
```

Um XOR de coordenadas garante um candidato por coluna. O tipo depende apenas da altitude. Os diamantes estão escondidos abaixo do ponto mais baixo das cavernas para que cavar continue útil.

### Os biomas em tile map

Cada bioma é uma ilha circular em uma grade, seu tipo determinado por um padrão calculado a partir da seed. Gradeado, previsível e gratuito.

![Mapa dos biomas em tile map -- cada ilha é um bioma diferente](/images/bareiron/biome-tilemap.jpg)

Cada bioma tem seu próprio conjunto de parâmetros codificado em arrays:

```c
// worldgen.c (simplificado)

static const uint8_t biome_base[] = {
  [BIOME_PLAINS]  = 48,   // altura base: 48
  [BIOME_DESERT]  = 52,   // ligeiramente mais alto
  [BIOME_FOREST]  = 50,   // entre os dois
  [BIOME_TAIGA]   = 46,   // um pouco mais baixo
  [BIOME_SNOWY]   = 40,   // o mais baixo
};

static const uint8_t biome_top[] = {
  [BIOME_PLAINS]  = B_grass,
  [BIOME_DESERT]  = B_sand,
  [BIOME_FOREST]  = B_grass,
  [BIOME_TAIGA]   = B_grass,
  [BIOME_SNOWY]   = B_snow_block,
};

static const uint8_t biome_factors[] = {
  [BIOME_PLAINS]  = 4,   // 4 extrações → muito regular
  [BIOME_DESERT]  = 3,   // 3 extrações → moderado
  [BIOME_FOREST]  = 4,   // 4 extrações → regular, montanhoso
  [BIOME_TAIGA]   = 3,   // 3 extrações → moderado
  [BIOME_SNOWY]   = 2,   // 2 extrações → muito acidentado
};
```

**Plains**: altura 48, 4 fatores → terreno muito plano, grama.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// Resultado: variação de ±4 blocos no máximo
```

**Desert**: altura 52, 3 fatores, bloco de superfície = areia. Nunca abaixo do nível do mar.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3);
// Resultado: variação de ±6 blocos no máximo, clampado em SEA_LEVEL+1
```

**Forest**: altura 50, 4 fatores como plains mas base mais alta → colinas arborizadas.

**Taiga**: altura 46, 3 fatores → variações moderadas, terreno frio.

**Snowy plains**: altura 40, apenas 2 fatores → o mais acidentado.

```c
h = (hash % 5) + ((hash >> 4) % 5);
// Resultado: variação de ±14 blocos no máximo
```

Cada bioma é codificado em **3 arrays de 5 entradas**: altura base, bloco de superfície, número de fatores. Quando `getHeightAtFromHash` recebe o bioma, ela consulta esses arrays para ajustar o terreno. 15 bytes de dados para substituir todo o sistema de biomas do Minecraft.

O detector de bioma usa a seed para determinar qual bioma corresponde a cada chunk:

```c
// worldgen.c (simplificado)

static const uint8_t biome_pattern[] = {
  BIOME_PLAINS, BIOME_FOREST, BIOME_PLAINS, BIOME_DESERT,
  BIOME_FOREST, BIOME_TAIGA,  BIOME_PLAINS, BIOME_SNOWY,
  BIOME_PLAINS, BIOME_FOREST, BIOME_DESERT,  BIOME_PLAINS,
  BIOME_SNOWY,  BIOME_PLAINS, BIOME_FOREST, BIOME_TAIGA,
};

uint8_t getChunkBiome (short cx, short cz) {
  uint32_t h = splitmix64(cx * 31 + cz * 97 + world_seed);
  uint8_t index = h % 16;
  return biome_pattern[index];
}
```

Um padrão de 16 entradas, um índice seedado pelas coordenadas do chunk. Isso dá uma grade repetitiva mas visualmente coerente. 4 linhas de código para substituir todo o sistema de parâmetros biomônicos do Minecraft vanilla.

### getHeightAtFromHash: o montador de terreno

A função no coração da geração combina os 4 cantos seedados por bioma:

```c
// worldgen.c (simplificado)

static uint8_t getHeightAtFromHash (int rx, int rz, short cx, short cz,
                                    uint32_t h, uint8_t biome) {
  // 4 cantos extraídos do hash, seed diferente por canto
  uint8_t h1 = biome_base[biome] + (h & 0x0F);
  uint8_t h2 = biome_base[biome] + ((h >> 4) & 0x0F);
  uint8_t h3 = biome_base[biome] + ((h >> 8) & 0x0F);
  uint8_t h4 = biome_base[biome] + ((h >> 12) & 0x0F);

  // Restrição do bioma: deserto nunca abaixo da água
  if (biome == BIOME_DESERT) {
    h1 = max(h1, SEA_LEVEL + 1);
    h2 = max(h2, SEA_LEVEL + 1);
    h3 = max(h3, SEA_LEVEL + 1);
    h4 = max(h4, SEA_LEVEL + 1);
  }

  // Interpolação a partir dos 4 cantos
  return interpolate(h1, h2, h3, h4, rx, rz);
}
```

Cada bioma tem um `biome_base` que desloca a altura de referência, e os 4 cantos são extraídos do hash com deslocamentos diferentes. O deserto força o mínimo acima do nível do mar -- uma linha de restrição que evita água sem cálculo biomônico adicional.

### Árvores e cactus: posicionamento probabilístico

A geração de superfície usa o mesmo hash do chunk para decidir onde plantar:

```c
// worldgen.c (simplificado)

static void genFoliage (uint8_t *chunk_data, short cx, short cz,
                        uint32_t hash, uint8_t biome) {
  if (biome == BIOME_DESERT) {
    // Cactus: um candidato por chunk, hash determina a posição
    int tx = (hash >> 8) & 7;
    int tz = (hash >> 12) & 7;
    int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
    if (chunk_data[ty * 64 + tz * 8 + tx] == B_sand)
      placeCactus(chunk_data, tx, ty + 1, tz);
  } else {
    // Árvores: hash determina se coloca e onde
    int tree_count = (hash & 3);  // 0-3 árvores por chunk
    for (int i = 0; i < tree_count; i ++) {
      int tx = ((hash >> (4 + i * 4)) & 7);
      int tz = ((hash >> (6 + i * 4)) & 7);
      int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
      placeTree(chunk_data, tx, ty + 1, tz);
    }
  }
}
```

0-3 árvores por chunk para biomas verdes, 1 cactus no máximo para o deserto. O hash do chunk é a única fonte de entropia -- um `& 7` para a posição dentro do chunk, um `& 3` para o contador. Tudo é determinístico, nada é armazenado.

### generateChunk: montando tudo

A função que junta tudo para produzir um chunk completo de 8×8×256 blocos:

```c
// worldgen.c (simplificado)

void generateChunk (uint8_t *chunk, short cx, short cz) {
  uint32_t hash = getChunkHash(cx, cz);
  uint8_t biome = getChunkBiome(cx, cz);

  // Para cada coluna do chunk (8×8 = 64)
  for (int x = 0; x < 8; x ++) {
    for (int z = 0; z < 8; z ++) {
      // Coordenadas mundo absolutas
      int wx = cx * 8 + x;
      int wz = cz * 8 + z;

      // Altura da coluna
      uint8_t height = getHeightAt(wx, wz);

      // Preencher a coluna de baixo para cima
      for (int y = 0; y < height; y ++) {
        uint8_t block = getTerrainBlock(wx, y, wz);
        chunk[y * 64 + z * 8 + x] = block;
      }
    }
  }

  // Adicionar os elementos de superfície (árvores, cactus)
  genFoliage(chunk, cx, cz, hash, biome);
}
```

É isso. 3 loops aninhados: para cada coluna, encontrar a altura, preencher os blocos, passar para a próxima. A saída é um `uint8_t[16384]` (8 × 8 × 256) que representa o chunk completo. Sem caching, sem lazy loading, sem compressão -- o chunk é gerado e enviado direto ao cliente.

## O armazenamento: arrays estáticos em toda parte

A arquitetura de memória do Bareiron é C embarcado em todo seu esplendor. Sem malloc, sem hash maps, sem listas encadeadas.

Tudo está em arrays globais de tamanho fixo.

### As alterações de blocos

```c
// globals.h, linhas 191-196

typedef struct {
  short x;      // 2 bytes -- limite de 32 000 blocos horizontal
  short z;      // 2 bytes
  uint8_t y;    // 1 byte -- limite de 256 blocos vertical
  uint8_t block; // 1 byte -- limite de 256 tipos de blocos
} BlockChange;
```

20 000 entradas, ou cerca de **25 000 alterações** -- o equivalente a um chunk e meio totalmente escavado. O campo `block` com valor `0xFF` marca uma entrada livre. A busca é uma varredura linear:

![Layout de memória do array de blocos -- 6 bytes por entrada](/images/bareiron/memory-layout.jpg)

```c
// procedures.c

uint8_t getBlockChange (short x, uint8_t y, short z) {
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block == 0xFF) continue;
    if (block_changes[i].x == x && block_changes[i].y == y && block_changes[i].z == z)
      return block_changes[i].block;
    #ifdef ALLOW_CHESTS
      if (block_changes[i].block == B_chest) i += 14;  // skip chest data
    #endif
  }
  return 0xFF;
}

Adicionar uma alteração é tão direto quanto a busca:

```c
static uint8_t changes_count = 0;

void addBlockChange (short x, short z, uint8_t y, uint8_t block) {
  if (changes_count >= MAX_CHANGES) return;
  block_changes[changes_count].x = x;
  block_changes[changes_count].z = z;
  block_changes[changes_count].y = y;
  block_changes[changes_count].block = block;
  changes_count ++;
}
```

Um contador, um índice, uma escrita. Sem ordenação, sem compactação, sem gerenciamento de memória. Quando o array está cheio, novas alterações são ignoradas -- o terreno retorna ao seu estado gerado.

O comentário do autor sobre o limite de 256 blocos: "não pretendo implementar escadas de cobre levemente patinadas encerradas tão cedo."

### Os mobs: 8 bytes por cabeça

```c
// globals.h, linhas 240-251 (pragma pack(push, 1) para eliminar padding)

typedef struct {
  uint8_t type;   // 25=chicken, 28=cow, 95=pig, 106=sheep, 145=zombie
  short x;
  uint8_t y;      // se health=0, Y vira um timer antes da remoção
  short z;
  uint8_t data;   // bits 0-4: health, bit 5: sheep sheared, bits 6-7: panic timer
} MobData;
```

8 bytes. 16 slots no máximo. Sem alinhamento, sem padding. O byte `data` é um bitfield caseiro: 5 bits de vida, 1 bit de tosa, 2 bits de timer de pânico. E quando um mob morre, o campo Y vira um timer antes da remoção. Reuso de memória no nível do bit.

### Os jogadores: empacotados bem apertados

Os dados dos jogadores usam `#pragma pack(push, 1)` também -- coordenadas em `short` + `uint8_t`, inventários em arrays fixos de `uint16_t` + `uint8_t`, e um campo `flags` que codifica ao mesmo tempo o cooldown de ataque, estado de spawn, sneak, sprint, eat, load, movement cooldown, e o lock de craft. Tudo isso em bits individuais.

## O loop principal: while(true) e não-bloqueante

O servidor inteiro roda em um loop, uma thread, zero event library.

```c
// main.c, linhas 594-720

while (true) {
  task_yield();  // deixa o watchdog respirar na ESP32

  // Aceitar uma nova conexão (não-bloqueante)
  for (int i = 0; i < MAX_PLAYERS; i ++) {
    if (clients[i] != -1) continue;
    clients[i] = accept(server_fd, ...);
    if (clients[i] != -1) client_count ++;
    break;
  }

  // Tick do servidor se o tempo tiver passado
  if (get_program_time() - last_tick_time > TIME_BETWEEN_TICKS) {
    handleServerTick(time_since_last_tick);
    last_tick_time = get_program_time();
  }

  // Round-robin: um cliente, um pacote por iteração
  client_index = (client_index + 1) % MAX_PLAYERS;
  if (clients[client_index] == -1) continue;

  // Ler o cabeçalho do pacote: length + ID
  recv(client_fd, &recv_buffer, 2, MSG_PEEK);
  int length = readVarInt(client_fd);
  int packet_id = readVarInt(client_fd);
  handlePacket(client_fd, length - sizeVarInt(packet_id), packet_id, state);
}
```

Apenas um cliente é processado por iteração do loop, e apenas um pacote é lido por vez. O `task_yield()` no início do loop deixa a tarefa idle do FreeRTOS respirar na ESP32 -- sem isso, o watchdog timer reseta o chip.

O dispatch dos pacotes é um switch monstruoso de **400 linhas**:

```c
// main.c, linhas 68-497

void handlePacket (int client_fd, int length, int packet_id, int state) {
  switch (packet_id) {
    case 0x00:  // Handshake / Status / Login conforme o estado
    case 0x01:  // Status ping
    case 0x02:  // Plugin message
    case 0x03:  // Login/configuration acknowledgment
    case 0x08:  // Chat
    case 0x0B:  // Client status (respawn)
    case 0x11:  // Click container (gerencia baús)
    case 0x19:  // Interact entity
    case 0x1D..0x20:  // Movement packets (o maior caso)
    case 0x28:  // Player action (cavar/colocar)
    // ... 40+ casos
  }
}
```

Sem jump table dinâmica, sem vtable, sem map. Um switch compila em jump table estática. Perfeito para embarcado.

O caso `0x1D-0x20` é o maior -- ele gerencia atualizações de posição, danos de queda, travessias de fronteiras de chunk, spawn de mobs, geração de chunks, E fome. Tudo em um único fall-through gigante.

![O código do servidor Bareiron -- 6800 linhas de C](/images/bareiron/code-shot.jpg)

## O tick do servidor e a IA dos mobs

A função `handleServerTick` é chamada a cada 50 ms (20 TPS). Ela gerencia o mundo enquanto o loop principal cuida dos jogadores:

```c
// main.c (simplificado)

void handleServerTick (uint32_t delta) {
  // Atualizar cada mob
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type == 0 || mobs[i].data == 0) continue;  // morto ou vazio

    MobData *mob = &mobs[i];
    int px, pz;
    getNearestPlayer(mob->x, mob->z, &px, &pz);

    if (mob->type == MOB_ZOMBIE) {
      // Hostil: anda em direção ao jogador mais próximo
      if (px < mob->x) mob->x --;
      else if (px > mob->x) mob->x ++;
      if (pz < mob->z) mob->z --;
      else if (pz > mob->z) mob->z ++;
      // Dano de contato a 2 blocos
      if (abs(px - mob->x) <= 2 && abs(pz - mob->z) <= 2)
        damagePlayer(getNearestPlayerId(mob->x, mob->z), 3);
    } else {
      // Passivo: 8 direções aleatórias
      uint8_t dir = getMobDir(mob);
      mob->x += dir_lookup[dir][0];
      mob->z += dir_lookup[dir][1];
      // Mudança de direção a cada ~40 ticks
      if (mob->data >> 6 < 1) setMobDir(mob, rand() & 7);
      mob->data = (mob->data & 0x3F) | ((mob->data - 0x40) & 0xC0);
    }

    // Acordar os chunks ao redor do mob
    setChunkGenerated(mob->x / 8, mob->z / 8);
  }
}
```

A IA dos mobs hostis é uma comparação de coordenadas. Literalmente `if (px < x) x--`. Sem pathfinding, sem A*, sem desvio de obstáculos. O zumbi ajusta X e Z independentemente em direção ao jogador -- ele atravessa paredes se houver.

O dano de contato é de 3 corações/seg. p2r3 o quis elevado porque a ausência de pathfinding torna os zombies fáceis de kitar.

A fórmula de armadura é a anterior à combat update -- a mais simples possível:

```c
// main.c (simplificado)

static uint8_t applyArmor (uint8_t damage, uint16_t armor_value) {
  // Fórmula pré-1.9: redução linear
  // Cada ponto de armadura = 4% de redução, máx 80%
  uint8_t reduction = (armor_value * 4);
  if (reduction > 80) reduction = 80;
  return damage * (100 - reduction) / 100;
}
```

Full diamond = 80% de redução. Um golpe de zumbi de 3 corações vira 0.6 corações. p2r3 escolheu essa fórmula antiga porque se calcula em 2 operações -- sem limiares, sem curvas, apenas uma porcentagem linear.

Os mobs passivos: 8 direções em uma lookup table, mudança de rumo a cada ~40 ticks. O campo `data` codifica a direção atual nos 2 bits mais significativos, e o timer de mudança de direção nos 6 bits restantes.

![Mobs no Bareiron -- zumbis, porcos, ovelhas](/images/bareiron/mobs.jpg)

### O respawn dos mobs

Os mobs não spawnam com random ticks. Eles aparecem quando o tick do servidor encontra uma nova fronteira de chunk:

```c
if (player crossed chunk boundary) {
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type != 0) continue;
    spawnMob(&mobs[i], new_chunk_coords, getChunkHash(cx, cz));
    break;
  }
}
```

Mesmo RNG do terreno, mesma seed do chunk. Se um slot de mob estiver livre, o spawn é determinístico.

## O craft: sem matrizes, if/else

```c
// crafting.c, linhas 9-347 (simplificado)

void getCraftingOutput (PlayerData *player, uint8_t *count, uint16_t *item) {
  // Se o flag 0x80 estiver ativo, o buffer de craft está sendo usado por um baú
  if (player->flags & 0x80) { *count = 0; *item = 0; return; }

  // Contar os slots, encontrar o primeiro item, verificar identidade
  uint8_t filled = 0, first = 10, identical = true;
  for (int i = 0; i < 9; i ++) {
    if (player->craft_items[i]) {
      filled ++;
      if (first == 10) first = i;
      else if (player->craft_items[i] != player->craft_items[first])
        identical = false;
    }
  }

  switch (filled) {
    case 1:  /* tábuas, lingotes... */
    case 2:  /* paus, tesouras, tochas */
    case 3:  /* pás, espadas, lajes */
    case 4:  /* bancada de craft, botas */
    case 5:  /* picaretas, machados, capacetes */
    case 7:  /* calças, composteiras */
    case 8:  /* fornalha, baú, peitoral */
    case 9:  /* blocos completos (ferro, ouro, etc.) */
  }
}
```

A primeira verificação: se o flag `0x80` estiver ativo, o buffer de craft é reciclado como ponteiro de baú. Sem craft possível.

Em seguida, ele conta os slots preenchidos, anota o primeiro item, verifica a identidade. Com apenas isso, você identifica a fornalha em 4 verificações:

```c
if (count == 8 && first == cobblestone && all_identical && center_empty)
    return furnace;
```

Para formas complexas, ele usa o índice do primeiro item e verifica a posição relativa. As receitas compartilham uma mesma função de matching -- o material determina o resultado.

![Interface de craft e baú no Bareiron](/images/bareiron/crafting.jpg)

## Os baús: o hack de verdade

O hack de memória que todo mundo comenta, em código real:

```c
// procedures.c, linhas 1262-1293

if (target == B_chest) {
  // Procurar a entrada do baú no array de blocos
  uint8_t *storage_ptr = NULL;
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block != B_chest) continue;
    if (block_changes[i].x != x || block_changes[i].y != y || block_changes[i].z != z)
      continue;
    storage_ptr = (uint8_t *)(&block_changes[i + 1]);  // aponta após o bloco baú
    break;
  }
  if (storage_ptr == NULL) return;

  // Terrible memory hack!!
  // Copia o PONTEIRO no array de itens de craft do jogador
  memcpy(player->craft_items, &storage_ptr, sizeof(storage_ptr));
  player->flags |= 0x80;  // trava o craft

  // Enviar a interface do baú ao cliente
  sc_openScreen(player->client_fd, 2, "Chest", 5);
  for (int i = 0; i < 27; i ++) {
    uint16_t item;
    uint8_t count;
    memcpy(&item, storage_ptr + i * 3, 2);
    memcpy(&count, storage_ptr + i * 3 + 2, 1);
    sc_setContainerSlot(player->client_fd, 2, i, count, item);
  }
}
```

E o comentário no código: `// Terrible memory hack!!1!`

É exatamente isso. Ele pega o endereço de memória da entrada seguinte em `block_changes[]`, copia para `player->craft_items` (que é um `uint16_t[9]`, ou seja, 18 bytes -- suficiente para armazenar um ponteiro de 32 bits), e ativa o flag para que ninguém tente craftar durante esse tempo.

Em cada clique no inventário do baú:

```c
// packets.c, linhas 620-638

uint8_t *storage_ptr;
memcpy(&storage_ptr, player->craft_items, sizeof(storage_ptr));
// storage_ptr agora aponta para os dados do baú
uint16_t *p_item = (uint16_t *)(storage_ptr + (slot - 41) * 3);
uint8_t *p_count = storage_ptr + (slot - 41) * 3 + 2;
```

Ele recupera o ponteiro do buffer de craft, e acessa os slots com um offset. Os dados do baú são armazenados a 3 bytes por slot (2 para o ID, 1 para a quantidade), colados uns aos outros no array de blocos.

![Dados de baú armazenados no array de blocos -- um hack de memória](/images/bareiron/chest-hack.jpg)

## A fome: 5 linhas de gênio

```c
// main.c, linhas 293-305

// Os jogadores enviam pacotes de movimento a ~20/seg quando
// se movem, muito menos quando estão parados. Correlacionamos
// isso com a atividade para simular a fome de graça.
if (player->saturation == 0) {
  if (player->hunger > 0) player->hunger--;
  player->saturation = 200;
  sc_setHealth(client_fd, player->health, player->hunger, player->saturation);
} else if (player->flags & 0x08) {  // sprinting
  player->saturation -= 1;
}
```

É literalmente isso. 5 linhas. Cada pacote de movimento decrementa a saturação. Quando a saturação chega a zero, a fome diminui e a saturação é resetada. O sprint (flag `0x08`) dobra o consumo.

Zero timer, zero memória alocada, zero processamento dedicado. Um contador que decrementa em pacotes que já existem.

### Os danos de queda

O sistema de dano mais simples do projeto:

```c
// Quando o jogador sai do chão, armazenamos seu Y
// Quando ele toca o chão novamente, subtraímos
dano = ultimo_y_no_chao - y_atual;
```

Uma subtração.

## Minerar e colocar blocos

Quando você clica em um bloco, o pacote `0x28` (Player Action) chega no switch. O handler precisa determinar qual bloco está na posição, removê-lo, e colocar o item no inventário:

```c
// main.c, case 0x28 (simplificado)

void handlePlayerAction (int client_fd, uint8_t action, int x, uint8_t y, int z) {
  switch (action) {
    case START_DESTROY_BLOCK: {
      // Determinar o tipo de bloco na posição clicada
      uint8_t block = getBlockAt(x, y, z);

      if (block == B_chest) {
        openChest(client_fd, x, y, z);
        break;
      }

      // Adicionar aos block_changes
      addBlockChange(x, z, y, 0);  // 0 = air

      // Dar o item ao jogador (trust the client)
      addItemToPlayer(client_fd, block_to_item(block), 1);

      // Enviar a atualização ao cliente
      sc_blockChange(client_fd, x, y, z, 0);
      sc_ackBlockChange(client_fd, x, y, z, 0);
      break;
    }
    case PLACE_BLOCK: {
      // Ler o tipo de bloco da mão do jogador
      uint16_t item = getHeldItem(client_fd);
      uint8_t block = item_to_block(item);
      addBlockChange(x, z, y, block);
      removeItemFromPlayer(client_fd, item, 1);
      sc_blockChange(client_fd, x, y, z, block);
      break;
    }
  }
}
```

`getBlockAt` combina a geração de terreno E as alterações dos jogadores:

```c
uint8_t getBlockAt (int x, uint8_t y, int z) {
  // Primeiro verificar as alterações dos jogadores
  uint8_t change = getBlockChange(x, y, z);
  if (change != 0xFF) return change;

  // Senão, ler do terreno gerado
  return getTerrainBlock(x, y, z);
}
```

Prioridade às alterações, fallback no terreno. Zero debate, zero cache, zero overhead. O `getTerrainBlock` por baixo dos panos é `getHeightAt` + as camadas de stone/dirt/grass/coal.

### A fornalha instantânea

O mais engraçado: a fornalha não existe como entidade. Se você colocar cobblestone no slot "cozimento" e coal no "combustível", o resultado aparece imediatamente. Sem timer, sem chunk ticking. É apenas um slot de inventário que se esvazia quando você coloca os itens certos.

![Fornalha instantânea -- coloque os ingredientes, resultado imediato](/images/bareiron/furnace.jpg)

## O loop ESP32: um servidor MC em 4 KB de stack

```c
// main.c, linhas 732-779

#ifdef ESP_PLATFORM

void bareiron_main (void *pvParameters) {
  main();
  vTaskDelete(NULL);
}

static void wifi_event_handler (...) {
  if (/* conectado */) {
    xTaskCreate(bareiron_main, "bareiron", 4096, NULL, 5, NULL);
  }
}

void app_main () {
  esp_timer_early_init();
  wifi_init();
  // O resto é gerenciado pelo event handler
}
#endif
```

O servidor inteiro roda em uma tarefa FreeRTOS com **4096 bytes de stack**. É só isso. A thread main principal apenas inicializa o WiFi e espera uma conexão. Uma vez conectado, ele spawna `bareiron_main` que chama o `main()` padrão.

Todo o código específico ESP32 é protegido por `#ifdef ESP_PLATFORM`. No PC, tudo compila como código POSIX padrão.

## O que foi sacrificado

Para que tudo isso caiba, há funcionalidades vanilla que não existem:

- **Sem compressão de rede** -- zlib muito caro. O servidor gera chunks rápido, mas enviá-los é o gargalo.
- **Sem random ticks** -- árvores crescem com bone meal ou não. Mobs spawnam nas fronteiras de chunk.
- **Sem entidades item** -- blocos minerados vão direto para o inventário. A animação é puramente visual.
- **Nenhuma verificação de inventário** -- trust the client. 64 diamantes? OK. Um chunk minerado em 1 seg? OK. Para usar entre pessoas de confiança.
- **Sem luz do servidor** -- tochas são enviadas depois de todo o resto, o cliente calcula.
- **Sem fluidos progressivos** -- estado final instantâneo.

## O resultado final

Ryzen 5 3600: ~0.5 ms por chunk.
ESP32-C3 de 1$: ~200 ms por chunk. Jogável.

![Benchmark de geração de chunks -- Ryzen vs ESP32](/images/bareiron/performance.jpg)

3+ jogadores: começa a lagar. Comparável ao 2b2t nos horários de pico, segundo o autor.

![Vários jogadores conectados ao mesmo servidor Bareiron](/images/bareiron/multiplayer.jpg)

## A filosofia

p2r3: "Eu só gosto da ideia de que este pequeno chip de 1 dólar que consome 0.5 Watt possa rodar algo tão avançado quanto Minecraft. Science isn't about 'why', it's about 'why not'."

Cada linha é um tradeoff:
- Perlin noise → interpolação: menos bonito, 200x mais rápido, zero memória
- Matrizes de craft → matching hardcoded: código feio, zero bytes
- zlib → nada: conexão ruim = morte, mas jogável
- Validação → trust: zero segurança, zero processamento

Cada funcionalidade ausente permite que outra exista dentro dos limites do hardware.

**As 3 coisas para guardar:**

1. **Interpolação + RNG** -- 4 pontos seedados, terreno infinito, zero armazenamento, consulta sem regenerar o chunk, 200 ms de geração. É a jogada de gênio que torna todo o resto possível.
2. **Cada funcionalidade tem um custo** -- Sem compressão, sem random ticks, sem validação. Não são esquecimentos, é o que permite caber em 520 KB.
3. **Os hacks feios são os mais inteligentes** -- Baús no array de blocos via memcpy, fome por pacotes de movimento, fornalha instantânea. A solução limpa teria sido cara demais.

Se o projeto te interessa, está tudo no [GitHub em GPLv3](https://github.com/p2r3/bareiron/). É C bem sujo, e raramente me diverti tanto lendo um código fonte xD
