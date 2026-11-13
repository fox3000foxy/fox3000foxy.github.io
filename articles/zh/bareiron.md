---
title: Bareiron，在 1 美元微控制器上跑的 Minecraft 服务器
description: 6800 行 C，零 malloc，Perlin 噪声换成双线性插值，tilemap 生物群系，全跑在 1 美元的芯片上。
date: 2026-05-30
tags:
  - minecraft
  - reverse-engineering
  - embedded
  - c
  - esp32
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "8+NdAG815RfQJ1hWnYHw+Ak31tQqPH0gd+povKn5VGy/6w4NTjOwOQBeaaIde93D+h1e8oQM9jpnfh90V2a70g=="
---

## 引言

在 1 美元微控制器上跑 Minecraft 服务器，听着像笑话。

我问了自己行不行，答案是行。字面意义的行。

有个项目叫 [Bareiron](https://github.com/p2r3/bareiron/)，作者 p2r3，大概是我这几年在 Minecraft 世界见过最迷人的项目之一。二进制 **300KB**，**6800 行 C**，零外部依赖，不 malloc，不开线程，跑在 **1 美元的 ESP32** 上。

![ESP32-C3，跑服务器的微控制器](/images/bareiron/esp32-board.jpg)

无限地形生成。生物群系。洞穴。合成。挖矿。生物。饥饿。箱子。你对生存服务器期望的一切都有。

芯片功耗 **0.5 瓦**，主频 **160 MHz**。

给个量级：vanilla Minecraft 服务器要几个 G 内存。ESP32-C3 是 **520 KB SRAM**（启动后剩 400）。20 年前的处理器都跑 GHz 了，这个 160 MHz 封顶。纯算力差约 **20000 倍**。

p2r3 没写个 C 版 Minecraft 服务器，他把服务器的每个砖都重发明了一遍，塞进这些约束。下面打开源码看他怎么干的。

![p2r3 的 Bareiron 介绍视频缩略图](/images/bareiron/title-card.jpg)

## 项目的大脑：无内存地形生成

嵌入式 MC 服务器最大的问题是地形生成。

vanilla Minecraft 用 **Perlin 噪声**生成世界：多层叠加（octaves），6 个生物参数（温度、湿度、大陆度、侵蚀、weirdness、深度），再加整套缓存不然每次全重算。

结果漂亮。但算得贵，存生成好的 chunk 要内存。

Bareiron 路子完全不同。不叠噪声，用**双线性插值**，4 个点由**确定性 RNG** 生成。

你把小像素图放大、边缘变模糊，就是那个感觉。

```c
// worldgen.c，117-171 行（简化）

uint8_t interpolate (uint8_t a, uint8_t b, uint8_t c, uint8_t d, int x, int z) {
  uint16_t top    = a * (CHUNK_SIZE - x) + b * x;
  uint16_t bottom = c * (CHUNK_SIZE - x) + d * x;
  return (top * (CHUNK_SIZE - z) + bottom * z) / (CHUNK_SIZE * CHUNK_SIZE);
}

uint8_t getHeightAt (int x, int z) {
  int _x = floor(x / CHUNK_SIZE);  // chunk 坐标
  int _z = floor(z / CHUNK_SIZE);
  int rx = x % CHUNK_SIZE;          // chunk 内偏移
  int rz = z % CHUNK_SIZE;
  uint32_t hash = getChunkHash(_x, _z);
  uint8_t biome = getChunkBiome(_x, _z);
  // 按 hash + biome 插 4 个角
  return getHeightAtFromHash(rx, rz, _x, _z, hash, biome);
}
```

标准双线性插值：4 个角，按位置加权，输出一个 `uint8_t`。CHUNK_SIZE 是 8，全整数乘法，不用 float。

p2r3 在视频里一步步演示：先是 chunk 的 4 个角，每个由 RNG 定 seed。

![chunk 的 4 个角，每个由确定性 RNG 定 seed](/images/bareiron/gen-four-corners.jpg)

然后 4 个点之间插值，连成面。

![4 个角之间做双线性插值](/images/bareiron/gen-interpolate.jpg)

相邻 chunk 全套同样 pattern，无限连起来。

![最终结果：连续的不规则地形](/images/bareiron/gen-result.jpg)

### 确定性 RNG

让一切成立的关键是 seed。每个 chunk 4 个角，每个角要唯一但可复现的伪随机值。

```c
// worldgen.c，13-22 行

uint32_t getChunkHash (short x, short z) {
  uint8_t buf[8];
  memcpy(buf, &x, 2);          // 16 位 X 坐标
  memcpy(buf + 2, &z, 2);      // 16 位 Z 坐标
  memcpy(buf + 4, &world_seed, 4);  // 32 位全局 seed
  return splitmix64(*((uint64_t *)buf));  // 哈希
}
```

16 位 X 加 16 位 Z 加 32 位 seed，打包进 8 字节 buffer，全丢进 `splitmix64`。结果：每个位置基于世界 seed 的唯一确定值。

get 到机制的威力了吗？服务器不用存地形。玩家走到新区现算，每次结果一模一样。

`splitmix64` 是给 64 位哈希设计的超快 prng：

```c
// worldgen.c（简化）

static uint32_t splitmix64 (uint64_t state) {
  state += 0x9E3779B97F4A7C15ull;
  uint64_t z = state;
  z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ull;
  z = (z ^ (z >> 27)) * 0x94D049BB133111EBull;
  return (z ^ (z >> 31)) >> 32;
}
```

3 步：加，异或/移位，乘，异或/移位，乘，异或/移位。全直接运算，无表无循环。8 字节 buffer（X + Z + seed）当 64 位整数吃，吐 32 位哈希。确定，快，5 行。

### 为什么不是 Perlin 噪声

p2r3 在视频里原话："随机数用的 digit 越多，地形越规则，像抛硬币越多越接近 50/50"。实际就是 hash 里拼多少个 bit：

```c
// worldgen.c，51-115 行

// plains 群系：4 个因子拼 → 地形规则
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// snowy plains：2 个因子 → 更崎岖
h = (hash % 5) + ((hash >> 4) % 5);
```

每个群系选拼几个 bit 抽取。拼越多分布越稳，像抛硬币多了趋近 50/50。拼越少局部起伏越狠。

![不规则地形，因子少起伏大](/images/bareiron/terrain-irregular.jpg)

2 个因子的 snowy plains 丘陵起伏，近乎山地。峰谷频繁。

![规则地形，因子多表面平](/images/bareiron/terrain-regular.jpg)

4 个因子的平原又平又稳。分布收敛。

chunk 在 ESP32 上 **200ms** 生成，同硬件 Perlin 噪声贵到测不出时间。

### 最骚的：问一个方块不用生成整个 chunk

你玩，挖个方块。服务器要知道给你什么掉落。天真做法整块生成。

双线性插值下，平面上**任何点**直接拿坐标问。chunk 角从玩家位置得，插值得任意偏移的高度。几个数学运算，不生成 chunk。

p2r3："我想要个魔法函数，给坐标就告诉我那个方块是什么，不占内存，不算贵噪声图"。他真做出来了。

高度变具体方块长这样：

```c
// worldgen.c（简化）

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

5 个条件。草/土/石/深板岩/基岩分层。表层块看群系查 `biome_top[]`，平原草、沙漠沙。一串 if 掉进对应层，替代循环和 switch。

### 洞穴，最懒的镜像

```c
altitude_grotte = CAVE_BASE_DEPTH - (hauteur_surface - y);
```

地下把表层高度镜像下来。像深板岩大空洞。零算力，一行。

![地表镜像生成的洞穴](/images/bareiron/cave-mirror.jpg)

![地形镜像生成洞穴示意图](/images/bareiron/cave-diagram.jpg)

### 矿石，XOR 版

```c
candidat = (chunk_x ^ col_x ^ col_z) % 100;
if (candidat < 5 && y < 16) -> diamond
```

坐标 XOR 保证每列一个候选。类型只看高度。钻石藏在洞穴最低点下面，挖洞永远有用。

### 生物群系 tilemap

每个群系是格子里一座圆形岛，类型由 seed 算出的 pattern 定。网格化，可预测，免费。

![生物群系 tilemap，每座岛一个群系](/images/bareiron/biome-tilemap.jpg)

每个群系参数编码进表：

```c
// worldgen.c（简化）

static const uint8_t biome_base[] = {
  [BIOME_PLAINS]  = 48,   // 基准高度：48
  [BIOME_DESERT]  = 52,   // 稍高
  [BIOME_FOREST]  = 50,   // 中间
  [BIOME_TAIGA]   = 46,   // 稍低
  [BIOME_SNOWY]   = 40,   // 最低
};

static const uint8_t biome_top[] = {
  [BIOME_PLAINS]  = B_grass,
  [BIOME_DESERT]  = B_sand,
  [BIOME_FOREST]  = B_grass,
  [BIOME_TAIGA]   = B_grass,
  [BIOME_SNOWY]   = B_snow_block,
};

static const uint8_t biome_factors[] = {
  [BIOME_PLAINS]  = 4,   // 4 个抽取 → 很规则
  [BIOME_DESERT]  = 3,   // 3 个抽取 → 中等
  [BIOME_FOREST]  = 4,   // 4 个抽取 → 规则，丘陵
  [BIOME_TAIGA]   = 3,   // 3 个抽取 → 中等
  [BIOME_SNOWY]   = 2,   // 2 个抽取 → 最崎岖
};
```

**Plains**：基准 48，4 因子，地形很平，草。

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// 结果：起伏最多 ±4 格
```

**Desert**：基准 52，3 因子，表层沙。永不低于海平面。

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3);
// 结果：起伏最多 ±6 格，钳到 SEA_LEVEL+1
```

**Forest**：基准 50，4 因子和平原一样，但基准高，树林丘陵。

**Taiga**：基准 46，3 因子，中等起伏，冷。

**Snowy plains**：基准 40，只 2 因子，最崎岖。

```c
h = (hash % 5) + ((hash >> 4) % 5);
// 结果：起伏最多 ±14 格
```

每个群系编码进 **3 张 5 项表**：基准高度、表层块、因子数。`getHeightAtFromHash` 拿到群系查表调地形。15 字节数据替代 Minecraft 整套群系系统。

群系探测器用 seed 定每个 chunk 是什么群系：

```c
// worldgen.c（简化）

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

16 项 pattern，index 由 chunk 坐标定 seed。格子重复但视觉连贯。4 行代码替代 vanilla 整套生物参数系统。

### getHeightAtFromHash：地形组装器

核心生成函数，按群系拼 4 个定 seed 的角：

```c
// worldgen.c（简化）

static uint8_t getHeightAtFromHash (int rx, int rz, short cx, short cz,
                                    uint32_t h, uint8_t biome) {
  // 4 个角从 hash 抽，不同角不同偏移
  uint8_t h1 = biome_base[biome] + (h & 0x0F);
  uint8_t h2 = biome_base[biome] + ((h >> 4) & 0x0F);
  uint8_t h3 = biome_base[biome] + ((h >> 8) & 0x0F);
  uint8_t h4 = biome_base[biome] + ((h >> 12) & 0x0F);

  // 群系约束：沙漠不下水
  if (biome == BIOME_DESERT) {
    h1 = max(h1, SEA_LEVEL + 1);
    h2 = max(h2, SEA_LEVEL + 1);
    h3 = max(h3, SEA_LEVEL + 1);
    h4 = max(h4, SEA_LEVEL + 1);
  }

  // 4 个角插值
  return interpolate(h1, h2, h3, h4, rx, rz);
}
```

每个群系一个 `biome_base` 错开基准高度，4 个角从 hash 不同偏移抽。沙漠强制最低高于海平面，一行约束，不用额外生物算力就避开水。

### 树和仙人掌：概率放

表层生成用同一个 chunk hash 定种哪里：

```c
// worldgen.c（简化）

static void genFoliage (uint8_t *chunk_data, short cx, short cz,
                        uint32_t hash, uint8_t biome) {
  if (biome == BIOME_DESERT) {
    // 仙人掌：每 chunk 一个候选，hash 定位置
    int tx = (hash >> 8) & 7;
    int tz = (hash >> 12) & 7;
    int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
    if (chunk_data[ty * 64 + tz * 8 + tx] == B_sand)
      placeCactus(chunk_data, tx, ty + 1, tz);
  } else {
    // 树：hash 定种不种、种哪
    int tree_count = (hash & 3);  // 每 chunk 0-3 棵
    for (int i = 0; i < tree_count; i ++) {
      int tx = ((hash >> (4 + i * 4)) & 7);
      int tz = ((hash >> (6 + i * 4)) & 7);
      int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
      placeTree(chunk_data, tx, ty + 1, tz);
    }
  }
}
```

绿色群系每 chunk 0-3 棵树，沙漠最多 1 仙人掌。chunk hash 是唯一熵源，一个 `& 7` 定 chunk 内位置，一个 `& 3` 定数量。全确定，零存储。

### generateChunk：全拼起来

拼完整 8x8x256 chunk 的函数：

```c
// worldgen.c（简化）

void generateChunk (uint8_t *chunk, short cx, short cz) {
  uint32_t hash = getChunkHash(cx, cz);
  uint8_t biome = getChunkBiome(cx, cz);

  // chunk 每列（8x8 = 64）
  for (int x = 0; x < 8; x ++) {
    for (int z = 0; z < 8; z ++) {
      // 世界绝对坐标
      int wx = cx * 8 + x;
      int wz = cz * 8 + z;

      // 列高度
      uint8_t height = getHeightAt(wx, wz);

      // 从下往上填列
      for (int y = 0; y < height; y ++) {
        uint8_t block = getTerrainBlock(wx, y, wz);
        chunk[y * 64 + z * 8 + x] = block;
      }
    }
  }

  // 加表层东西（树、仙人掌）
  genFoliage(chunk, cx, cz, hash, biome);
}
```

就这些。3 层循环：每列算高度、填方块、下一列。输出 `uint8_t[16384]`（8 x 8 x 256）完整 chunk。chunk 现生成现发客户端，不缓存、不懒加载、不压缩。

## 存储：全静态数组

Bareiron 内存架构就是纯嵌入式 C 风：只有全局定长数组，无 malloc，无哈希表，无链表。

### 方块改动

```c
// globals.h，191-196 行

typedef struct {
  short x;      // 2 字节，横向限 32000 格
  short z;      // 2 字节
  uint8_t y;    // 1 字节，纵向限 256 格
  uint8_t block; // 1 字节，限 256 种方块
} BlockChange;
```

20000 项，约 **25000 次改动**，相当于一个半 chunk 全挖空。`block` 为 `0xFF` 标空槽。查找线性扫：

![方块数组内存布局，每项 6 字节](/images/bareiron/memory-layout.jpg)

```c
// procedures.c

uint8_t getBlockChange (short x, uint8_t y, short z) {
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block == 0xFF) continue;
    if (block_changes[i].x == x && block_changes[i].y == y && block_changes[i].z == z)
      return block_changes[i].block;
    #ifdef ALLOW_CHESTS
      if (block_changes[i].block == B_chest) i += 14;  // 跳过箱子数据
    #endif
  }
  return 0xFF;
}
```

加改动一样直接：

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

计数器，index，写。数组只追加：不排序，不整理，不管内存。满了新改动直接扔，地形回生成态。

作者对 256 方块上限的原话："打蜡轻度锈蚀切制铜楼梯什么的就先不做了。"

### 生物：每头 8 字节

```c
// globals.h，240-251 行（pragma pack(push, 1) 去 padding）

typedef struct {
  uint8_t type;   // 25=鸡，28=牛，95=猪，106=羊，145=僵尸
  short x;
  uint8_t y;      // 血量为 0 时，Y 变成删除前计时器
  short z;
  uint8_t data;   // bit 0-4：血，bit 5：羊剪没剪，bit 6-7：panic 计时器
} MobData;
```

8 字节。最多 16 个。对齐 padding 全扔。`data` 字节是手搓 bitfield：5 位血，1 位剪毛，2 位 panic 计时。生物一死 Y 字段变删除前计时。内存复用到 bit。

### 玩家：压得死死的

玩家数据也 `#pragma pack(push, 1)`，坐标 `short` + `uint8_t`，背包定长 `uint16_t` + `uint8_t` 数组，`flags` 字段把攻击冷却、出生状态、潜行、疾跑、吃、加载、移动冷却、合成锁全编进 bit。

## 主循环：while(true) 加非阻塞

整个服务器一个循环，一个线程，零事件库。

```c
// main.c，594-720 行

while (true) {
  task_yield();  // ESP32 上让 watchdog 喘口气

  // 收新连接（非阻塞）
  for (int i = 0; i < MAX_PLAYERS; i ++) {
    if (clients[i] != -1) continue;
    clients[i] = accept(server_fd, ...);
    if (clients[i] != -1) client_count ++;
    break;
  }

  // 时间到跑服务器 tick
  if (get_program_time() - last_tick_time > TIME_BETWEEN_TICKS) {
    handleServerTick(time_since_last_tick);
    last_tick_time = get_program_time();
  }

  // 轮询：每次迭代一个客户端、一个包
  client_index = (client_index + 1) % MAX_PLAYERS;
  if (clients[client_index] == -1) continue;

  // 读包头：长度 + ID
  recv(client_fd, &recv_buffer, 2, MSG_PEEK);
  int length = readVarInt(client_fd);
  int packet_id = readVarInt(client_fd);
  handlePacket(client_fd, length - sizeVarInt(packet_id), packet_id, state);
}
```

每次循环只处理一个客户端，一次只读一个包。循环开头 `task_yield()` 让 ESP32 的 FreeRTOS idle 任务喘气，没有它 watchdog 定时器重启芯片。

包分发是 **400 行**的巨型 switch：

```c
// main.c，68-497 行

void handlePacket (int client_fd, int length, int packet_id, int state) {
  switch (packet_id) {
    case 0x00:  // 按状态：握手 / 状态 / 登录
    case 0x01:  // 状态 ping
    case 0x02:  // 插件消息
    case 0x03:  // 登录/配置确认
    case 0x08:  // 聊天
    case 0x0B:  // 客户端状态（重生）
    case 0x11:  // 点容器（管箱子）
    case 0x19:  // 实体交互
    case 0x1D..0x20:  // 移动包（最大的一块）
    case 0x28:  // 玩家动作（挖/放）
    // ... 40+ 个 case
  }
}
```

switch 编译成静态跳转表，替代动态跳转表、虚表、map。嵌入式完美。

`0x1D-0x20` 这块最大，管位置更新、摔落伤害、跨 chunk 边界、刷怪、chunk 生成，**还有**饥饿。全并一个大 fall-through。

![Bareiron 服务器代码，6800 行 C](/images/bareiron/code-shot.jpg)

## 服务器 tick 和生物 AI

`handleServerTick` 每 50ms 跑一次（20 TPS）。主循环管玩家，它管世界：

```c
// main.c（简化）

void handleServerTick (uint32_t delta) {
  // 更新每个生物
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type == 0 || mobs[i].data == 0) continue;  // 死的或空的

    MobData *mob = &mobs[i];
    int px, pz;
    getNearestPlayer(mob->x, mob->z, &px, &pz);

    if (mob->type == MOB_ZOMBIE) {
      // 敌对：朝最近玩家走
      if (px < mob->x) mob->x --;
      else if (px > mob->x) mob->x ++;
      if (pz < mob->z) mob->z --;
      else if (pz > mob->z) mob->z ++;
      // 2 格内接触伤害
      if (abs(px - mob->x) <= 2 && abs(pz - mob->z) <= 2)
        damagePlayer(getNearestPlayerId(mob->x, mob->z), 3);
    } else {
      // 被动：8 方向随机走
      uint8_t dir = getMobDir(mob);
      mob->x += dir_lookup[dir][0];
      mob->z += dir_lookup[dir][1];
      // 约每 40 tick 换方向
      if (mob->data >> 6 < 1) setMobDir(mob, rand() & 7);
      mob->data = (mob->data & 0x3F) | ((mob->data - 0x40) & 0xC0);
    }

    // 唤醒生物周围 chunk
    setChunkGenerated(mob->x / 8, mob->z / 8);
  }
}
```

敌对生物 AI 就是比坐标。字面 `if (px < x) x--`。僵尸不懂寻路、A*、避障：X Z 独立往玩家挪，有墙穿墙。

接触伤害 3 颗心/秒。p2r3 故意设高，因为没寻路的僵尸太好风筝。

护甲公式是战斗更新**之前**的老版，最简单的那个：

```c
// main.c（简化）

static uint8_t applyArmor (uint8_t damage, uint16_t armor_value) {
  // 1.9 前公式：线性减伤
  // 每点护甲 = 4% 减伤，上限 80%
  uint8_t reduction = (armor_value * 4);
  if (reduction > 80) reduction = 80;
  return damage * (100 - reduction) / 100;
}
```

全钻石 80% 减伤。僵尸 3 心一巴掌变 0.6 心。p2r3 选老公式因为两步算完，无阈值无曲线，纯线性百分比。

被动生物：8 方向查表，约 40 tick 换向。`data` 字段高 2 位记当前方向，低 6 位记换向计时。

![Bareiron 里的生物，僵尸、猪、羊](/images/bareiron/mobs.jpg)

### 生物重生

生物不用随机 tick 刷。服务器 tick 遇到新 chunk 边界就刷：

```c
if (player crossed chunk boundary) {
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type != 0) continue;
    spawnMob(&mobs[i], new_chunk_coords, getChunkHash(cx, cz));
    break;
  }
}
```

RNG 和地形同一套，chunk 同 seed。有空位就确定性刷。

## 合成：不要矩阵，if/else

```c
// crafting.c，9-347 行（简化）

void getCraftingOutput (PlayerData *player, uint8_t *count, uint16_t *item) {
  // flag 0x80 起，被箱子占着合成 buffer
  if (player->flags & 0x80) { *count = 0; *item = 0; return; }

  // 数格子，找第一个物品，验全一样
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
    case 1:  /* 木板、锭…… */
    case 2:  /* 木棍、剪刀、火把 */
    case 3:  /* 铲、剑、台阶 */
    case 4:  /* 工作台、靴子 */
    case 5:  /* 镐、斧、头盔 */
    case 7:  /* 护腿、堆肥桶 */
    case 8:  /* 熔炉、箱子、胸甲 */
    case 9:  /* 整块（铁块、金块等） */
  }
}
```

先查 flag `0x80` 起没，合成 buffer 被箱子指针征用就锁合成。

再数占了几格、第一个是什么、全一不一样。就这些，熔炉 4 个检查配出来：

```c
if (count == 8 && first == cobblestone && all_identical && center_empty)
    return furnace;
```

复杂形状用第一个物品的 index 加相对位置查。配方共享一套匹配，材料定结果。

![Bareiron 里的合成和箱子界面](/images/bareiron/crafting.jpg)

## 箱子：真 hack

大家都在说的内存 hack，上真代码：

```c
// procedures.c，1262-1293 行

if (target == B_chest) {
  // 在方块数组里找这个箱子
  uint8_t *storage_ptr = NULL;
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block != B_chest) continue;
    if (block_changes[i].x != x || block_changes[i].y != y || block_changes[i].z != z)
      continue;
    storage_ptr = (uint8_t *)(&block_changes[i + 1]);  // 指向箱子块后一项
    break;
  }
  if (storage_ptr == NULL) return;

  // Terrible memory hack!!
  // 把指针拷进玩家合成物品数组
  memcpy(player->craft_items, &storage_ptr, sizeof(storage_ptr));
  player->flags |= 0x80;  // 锁合成

  // 发箱子界面给客户端
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

代码里原注释：`// Terrible memory hack!!1!`

就是字面意思。拿 `block_changes[]` 下一项的内存地址，拷进 `player->craft_items`（`uint16_t[9]`，18 字节，32 位指针塞得下），起 flag 让这期间没人能合成。

箱子背包每点一次：

```c
// packets.c，620-638 行

uint8_t *storage_ptr;
memcpy(&storage_ptr, player->craft_items, sizeof(storage_ptr));
// storage_ptr 现在指向箱子数据
uint16_t *p_item = (uint16_t *)(storage_ptr + (slot - 41) * 3);
uint8_t *p_count = storage_ptr + (slot - 41) * 3 + 2;
```

从合成 buffer 取回指针，按偏移读写格子。箱子数据每格 3 字节（ID 2 字节加数量 1 字节），在方块数组里挨个排。

![箱子数据存在方块数组里，内存 hack](/images/bareiron/chest-hack.jpg)

## 饥饿：5 行天才

```c
// main.c，293-305 行

// 玩家动起来每秒约发 20 个移动包，
// 静止少得多。拿这个关联活跃度免费模拟饥饿。
if (player->saturation == 0) {
  if (player->hunger > 0) player->hunger--;
  player->saturation = 200;
  sc_setHealth(client_fd, player->health, player->hunger, player->saturation);
} else if (player->flags & 0x08) {  // 疾跑
  player->saturation -= 1;
}
}
```

字面就这些。每个移动包扣饱和度。饱和度到零扣饥饿、重置饱和度。疾跑（flag `0x08`）双倍扣。

零计时器，零内存分配，零专用算力。现成的包当计数器。

### 摔落伤害

项目里最简单的伤害系统：

```c
// 玩家离地存 Y
// 落地减
伤害 = last_y_ground - y_actuel;
```

一个减法。

## 挖放方块

点方块，`0x28` 包（玩家动作）进 switch。handler 查位置是什么方块，移除，给玩家背包塞东西：

```c
// main.c，case 0x28（简化）

void handlePlayerAction (int client_fd, uint8_t action, int x, uint8_t y, int z) {
  switch (action) {
    case START_DESTROY_BLOCK: {
      // 查点的方块类型
      uint8_t block = getBlockAt(x, y, z);

      if (block == B_chest) {
        openChest(client_fd, x, y, z);
        break;
      }

      // 写 block_changes
      addBlockChange(x, z, y, 0);  // 0 = 空气

      // 给玩家东西（信客户端）
      addItemToPlayer(client_fd, block_to_item(block), 1);

      // 发更新给客户端
      sc_blockChange(client_fd, x, y, z, 0);
      sc_ackBlockChange(client_fd, x, y, z, 0);
      break;
    }
    case PLACE_BLOCK: {
      // 从玩家手里读方块类型
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

`getBlockAt` 把地形生成**加**玩家改动合起来：

```c
uint8_t getBlockAt (int x, uint8_t y, int z) {
  // 先查玩家改动
  uint8_t change = getBlockChange(x, y, z);
  if (change != 0xFF) return change;

  // 没有读生成地形
  return getTerrainBlock(x, y, z);
}
```

改动优先，没有回地形。零争论，零缓存，零开销。底下 `getTerrainBlock` 就是 `getHeightAt` 加石/土/草/煤分层。

### 秒烧熔炉

最搞笑的：熔炉不是实体。圆石放"烧制"格、煤放"燃料"格，结果立刻出，无计时无 chunk tick，就是背包格东西放对就清空。

![秒烧熔炉，放对材料结果立刻出](/images/bareiron/furnace.jpg)

## ESP32 循环：4KB 栈里的 MC 服务器

```c
// main.c，732-779 行

#ifdef ESP_PLATFORM

void bareiron_main (void *pvParameters) {
  main();
  vTaskDelete(NULL);
}

static void wifi_event_handler (...) {
  if (/* 已连接 */) {
    xTaskCreate(bareiron_main, "bareiron", 4096, NULL, 5, NULL);
  }
}

void app_main () {
  esp_timer_early_init();
  wifi_init();
  // 剩下事件 handler 接管
}
#endif
```

整个服务器跑在 FreeRTOS 任务里，**4096 字节栈**。就这些。主线程只初始化 WiFi 等连接。连上 spawn `bareiron_main` 调标准 `main()`。

全部 ESP32 专用代码包 `#ifdef ESP_PLATFORM`。PC 上全编成标准 POSIX。

## 砍掉的东西

塞进去的代价，vanilla 那些功能没有：

- **零网络压缩**，zlib 太贵。服务器生成 chunk 快，发出去是瓶颈。
- **零随机 tick**，树拿骨粉催不然不长。生物 chunk 边界刷。
- **零掉落实体**，挖的块直接进背包。动画纯客户端。
- **背包零校验**，信客户端。64 钻石？行。1 秒挖空 chunk？行。熟人局用。
- **零服务端光照**，火把最后发，客户端自己算。
- **零渐进流体**，直接终态。

## 最终结果

Ryzen 5 3600：每 chunk 约 0.5ms。
1 美元 ESP32-C3：每 chunk 约 200ms。能玩。

![chunk 生成 benchmark，Ryzen 对 ESP32](/images/bareiron/performance.jpg)

3+ 玩家：卡。作者原话堪比高峰期 2b2t。

![多玩家连同一台 Bareiron 服务器](/images/bareiron/multiplayer.jpg)

## 哲学

p2r3："我就喜欢这个 1 美元、0.5 瓦的小芯片能跑 Minecraft 这种东西的想法。Science isn't about 'why', it's about 'why not'."

每行都是 trade-off：
- Perlin 噪声 → 插值：丑点，快 200 倍，零内存
- 合成矩阵 → 手写匹配：代码丑，零字节
- zlib → 无：烂网死，但能玩
- 校验 → 信：零安全，零算力

每个砍掉的功能都给另一个功能在硬件限制里让了位。

**三点记住：**

1. **插值 + RNG**，4 个定 seed 点，无限地形，零存储，不用重生成 chunk 就能查，生成 200ms。这是让其余一切成立的神之一手。
2. **每个功能都有价**，没压缩、没随机 tick、没校验是主动选择：这样才塞得进 520KB。
3. **最脏的 hack 最聪明**，箱子 memcpy 进方块数组、移动包扣饥饿、秒烧熔炉。正经解法都太贵。

项目感兴趣，GitHub 全有 GPLv3：[https://github.com/p2r3/bareiron/](https://github.com/p2r3/bareiron/)。C 写得又脏又爽，我好久没读源码读这么开心了。
