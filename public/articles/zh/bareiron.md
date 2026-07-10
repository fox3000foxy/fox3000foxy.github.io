---
title: Bareiron----在1美元的微控制器上运行的Minecraft服务器
description: 6800行C代码，零malloc，用双线性插值替代Perlin噪声，瓦片地图式的生物群系，全都跑在1美元的芯片上。
date: 2026-05-30
tags:
  - minecraft
  - reverse-engineering
  - embedded
  - c
  - esp32
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "MEYCIQC712FZb9GdvLK68qAPmIsTq+Y4Zrbjo6NFIu++gLtarQIhAMzSIQhu+k/GaPLjPav3M/tnaLQ8ufaLEhvQdn2AGefm"
---

## 引言

你有没有想过，能不能在一块钱的微控制器上跑一个Minecraft服务器？

我想过。答案是：能。字面意义上的能。

有个叫 [Bareiron](https://github.com/p2r3/bareiron/) 的项目，作者是 p2r3，这大概是我近几年在Minecraft世界里见过最酷的项目之一。一个二进制文件只有 **300KB**，**6800行C代码**，零外部依赖，没有 malloc，没有多线程，跑在 **1美元的 ESP32** 上。

![ESP32-C3，运行服务器的微控制器](/images/bareiron/esp32-board.jpg)

无限地形生成。生物群系。洞穴。合成。挖矿。生物。饥饿值。箱子。生存服务器该有的全都有。

在一块功耗 **0.5瓦**、主频 **160 MHz** 的芯片上。

给你个概念：原版Minecraft服务器需要几个GB的内存。ESP32-C3 只有 **520 KB SRAM**（启动后可用约 400 KB）。20年前的处理器都已经跑在 GHz 级别了----这个最高只有 160 MHz。两者在纯算力上的差距大约是 **20,000 倍**。

p2r3 不是用 C 语言重写了一个 Minecraft 服务器，他 reinvent 了服务器的每一块积木，让所有东西都能塞进这些限制里。我们打开源代码来看看他是怎么做的。

![p2r3 的 Bareiron 演示视频缩略图](/images/bareiron/title-card.jpg)

## 项目的核心：零内存的地形生成

要做嵌入式 MC 服务器，最大的问题就是地形生成。

在原版 Minecraft 中，世界是用 **Perlin 噪声**生成的：多层叠加（倍频程），6 个生物群系参数（温度、湿度、大陆性、侵蚀、怪异度、深度），还有一整套缓存系统，免得每次都重新计算。

结果确实很美。但计算成本高，还要占用 RAM 来存储已生成的区块。

Bareiron 的做法则完全不同。它不叠加噪声，而是用**双线性插值**处理由**确定性 RNG** 生成的 4 个点。

你知道那种把小像素图放大后边缘变模糊的效果吗？就是这个道理。

```c
// worldgen.c，第 117-171 行（简化）

uint8_t interpolate (uint8_t a, uint8_t b, uint8_t c, uint8_t d, int x, int z) {
  uint16_t top    = a * (CHUNK_SIZE - x) + b * x;
  uint16_t bottom = c * (CHUNK_SIZE - x) + d * x;
  return (top * (CHUNK_SIZE - z) + bottom * z) / (CHUNK_SIZE * CHUNK_SIZE);
}

uint8_t getHeightAt (int x, int z) {
  int _x = floor(x / CHUNK_SIZE);  // 区块坐标
  int _z = floor(z / CHUNK_SIZE);
  int rx = x % CHUNK_SIZE;          // 区块内偏移
  int rz = z % CHUNK_SIZE;
  uint32_t hash = getChunkHash(_x, _z);
  uint8_t biome = getChunkBiome(_x, _z);
  // 在由 hash + biome 播种的 4 个角之间插值
  return getHeightAtFromHash(rx, rz, _x, _z, hash, biome);
}
```

标准的双线性插值：4 个角点，根据位置加权，输出一个 `uint8_t`。CHUNK_SIZE 是 8，所以全程整数乘法，没有浮点运算。

p2r3 在视频里一步步展示：先是区块的 4 个角点，每个角点的高度由 RNG 播种决定。

![区块的 4 个角点，每个由确定性 RNG 播种](/images/bareiron/gen-four-corners.jpg)

然后在这 4 个点之间插值，形成一个连续的地表。

![在 4 个角点之间应用双线性插值](/images/bareiron/gen-interpolate.jpg)

在所有相邻区块上重复这个模式，就能得到无限延伸的地形。

![最终结果：连续的不规则地形](/images/bareiron/gen-result.jpg)

### 确定性 RNG

之所以能做到这一切，关键在于播种。每个区块有 4 个角点，每个角点都需要一个唯一但可复现的伪随机值。

```c
// worldgen.c，第 13-22 行

uint32_t getChunkHash (short x, short z) {
  uint8_t buf[8];
  memcpy(buf, &x, 2);          // 16 位 X 坐标
  memcpy(buf + 2, &z, 2);      // 16 位 Z 坐标
  memcpy(buf + 4, &world_seed, 4);  // 32 位全局种子
  return splitmix64(*((uint64_t *)buf));  // 哈希
}
```

他把 X 的 16 位、Z 的 16 位和种子的 32 位打包进一个 8 字节的缓冲区，然后全部喂给 `splitmix64`。结果：基于世界种子，每个位置对应一个唯一且确定性的值。

你能感受到这有多强吗？服务器不需要存储地形。当玩家进入新区域时，它即时重新计算，而且每次结果完全一样。

用到的 `splitmix64` 是一种专为 64 位哈希设计的超快 PRNG：

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

3 步操作：加法、异或/移位、乘法、异或/移位、乘法、异或/移位。没有查找表，没有循环。它把 8 字节缓冲区（X + Z + 种子）当作一个 64 位整数处理，返回 32 位哈希值。确定性、快速，5 行代码搞定。

### 为什么这不是 Perlin 噪声

p2r3 在视频里自己说了："你取的随机数 digits 越多，地形就越规整，就像投硬币次数越多就越接近 50/50"。实际就是看他组合了多少位哈希值：

```c
// worldgen.c，第 51-115 行

// 对于 plains 生物群系：组合 4 个因子 → 地形平坦
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// 对于 snowy plains：2 个因子 → 更崎岖
h = (hash % 5) + ((hash >> 4) % 5);
```

每个生物群系选择组合多少次位提取。次数越多，分布越稳定----就像投硬币次数越多越接近 50/50。次数越少，局部变化越剧烈。

![不规则地形----少因子、强变化](/images/bareiron/terrain-irregular.jpg)

只用 2 个因子，雪原产生起伏的地形，几乎是山地。高峰和低谷很密集。

![平坦地形----多因子、平滑表面](/images/bareiron/terrain-regular.jpg)

用 4 个因子，平原保持平坦和可预测。分布稳定下来。

一个区块在 ESP32 上生成只需 **200 毫秒**----而在同样硬件上用 Perlin 噪声，计算成本高到无法测量。

### 最致命的细节：查询方块而不生成整个区块

你在玩，你在挖一个方块。服务器需要知道该给你什么物品。天真的做法是先生成整个区块。

而用双线性插值，你可以直接从坐标查询**平面上的任意一个点**。区块的角点从玩家位置获取，插值给你任意偏移处的高度。只需少量数学运算，无需生成区块。

p2r3："我想要的是一个神奇的函数，它能告诉我给定坐标处有什么方块，而不需要访问内存或计算昂贵的噪声图"。他确实做到了。

下面是高度如何变成具体的方块：

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

5 个条件判断。一层层的 grass/dirt/stone/deepslate/bedrock。地表方块取决于生物群系，通过 `biome_top[]` 获取----平原是 grass，沙漠是 sand。没有循环，没有 switch，只有一串 if 落到对应层。

### 洞穴，最懒的镜像

```c
洞穴高度 = CAVE_BASE_DEPTH - (地表高度 - y);
```

他把地表高度镜像到地下。看起来像深板岩大洞穴。零计算量，一行搞定。

![通过镜像地表地形生成的洞穴](/images/bareiron/cave-mirror.jpg)

![地形镜像生成洞穴的示意图](/images/bareiron/cave-diagram.jpg)

### 矿物，XOR 版

```c
候选值 = (chunk_x ^ col_x ^ col_z) % 100;
if (候选值 < 5 && y < 16) -> 钻石
```

坐标的 XOR 确保每列只有一个候选。类型完全取决于高度。钻石藏在洞穴最低点以下，这样挖矿仍然有意义。

### 瓦片地图式的生物群系

每个生物群系是网格中的一个圆形岛屿，其类型由基于种子的计算模式决定。网格化、可预测、零成本。

![瓦片地图式的生物群系地图----每个岛屿是一个不同的生物群系](/images/bareiron/biome-tilemap.jpg)

每个生物群系有自己的一套参数，编码在数组中：

```c
// worldgen.c（简化）

static const uint8_t biome_base[] = {
  [BIOME_PLAINS]  = 48,   // 基础高度：48
  [BIOME_DESERT]  = 52,   // 略高
  [BIOME_FOREST]  = 50,   // 居中
  [BIOME_TAIGA]   = 46,   // 略低
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
  [BIOME_PLAINS]  = 4,   // 4 次提取 → 非常平坦
  [BIOME_DESERT]  = 3,   // 3 次提取 → 中等
  [BIOME_FOREST]  = 4,   // 4 次提取 → 平坦起伏
  [BIOME_TAIGA]   = 3,   // 3 次提取 → 中等
  [BIOME_SNOWY]   = 2,   // 2 次提取 → 非常崎岖
};
```

**平原**：高度 48，4 个因子 → 非常平坦的地形，草地。

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// 结果：最大 ±4 格变化
```

**沙漠**：高度 52，3 个因子，地表方块 = 沙子。永远不会低于海平面。

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3);
// 结果：最大 ±6 格变化，限制不低于 SEA_LEVEL+1
```

**森林**：高度 50，4 个因子，和 plains 一样但基础更高 → 树木繁茂的丘陵。

**针叶林**：高度 46，3 个因子 → 中等变化，寒冷地形。

**雪原**：高度 40，只有 2 个因子 → 最崎岖。

```c
h = (hash % 5) + ((hash >> 4) % 5);
// 结果：最大 ±14 格变化
```

每个生物群系编码在 **3 个各含 5 个条目的数组**中：基础高度、地表方块、因子数量。当 `getHeightAtFromHash` 收到生物群系时，它查询这些数组来调整地形。只用 15 字节的数据就替代了整个 Minecraft 生物群系系统。

生物群系检测器用种子来确定每个区块对应的生物群系：

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

一个 16 个条目的模式，索引由区块坐标播种。这产生了一个重复但视觉上一致的网格。4 行代码就替代了整个原版 Minecraft 的生物群系参数系统。

### getHeightAtFromHash：地形组装器

生成核心函数结合了由生物群系播种的 4 个角点：

```c
// worldgen.c（简化）

static uint8_t getHeightAtFromHash (int rx, int rz, short cx, short cz,
                                    uint32_t h, uint8_t biome) {
  // 从哈希中提取 4 个角点，每角不同种子
  uint8_t h1 = biome_base[biome] + (h & 0x0F);
  uint8_t h2 = biome_base[biome] + ((h >> 4) & 0x0F);
  uint8_t h3 = biome_base[biome] + ((h >> 8) & 0x0F);
  uint8_t h4 = biome_base[biome] + ((h >> 12) & 0x0F);

  // 生物群系约束：沙漠永不在水下
  if (biome == BIOME_DESERT) {
    h1 = max(h1, SEA_LEVEL + 1);
    h2 = max(h2, SEA_LEVEL + 1);
    h3 = max(h3, SEA_LEVEL + 1);
    h4 = max(h4, SEA_LEVEL + 1);
  }

  // 从 4 个角点进行插值
  return interpolate(h1, h2, h3, h4, rx, rz);
}
```

每个生物群系有一个 `biome_base` 来偏移参考高度，4 个角点从哈希中按不同偏移提取。沙漠强制最小值高于海平面----一行约束条件，不需要额外的生物群系计算。

### 树木和仙人掌：概率性放置

地表生成使用同样的区块哈希来决定在哪里种植：

```c
// worldgen.c（简化）

static void genFoliage (uint8_t *chunk_data, short cx, short cz,
                        uint32_t hash, uint8_t biome) {
  if (biome == BIOME_DESERT) {
    // 仙人掌：每区块一个候选，哈希决定位置
    int tx = (hash >> 8) & 7;
    int tz = (hash >> 12) & 7;
    int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
    if (chunk_data[ty * 64 + tz * 8 + tx] == B_sand)
      placeCactus(chunk_data, tx, ty + 1, tz);
  } else {
    // 树木：哈希决定是否放置和放哪里
    int tree_count = (hash & 3);  // 每区块 0-3 棵树
    for (int i = 0; i < tree_count; i ++) {
      int tx = ((hash >> (4 + i * 4)) & 7);
      int tz = ((hash >> (6 + i * 4)) & 7);
      int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
      placeTree(chunk_data, tx, ty + 1, tz);
    }
  }
}
```

绿色生物群系每区块 0-3 棵树，沙漠最多 1 个仙人掌。区块的哈希是唯一的熵源----`& 7` 确定区块内的位置，`& 3` 确定数量。一切都是确定性的，什么都不存储。

### generateChunk：组装在一起

把所有东西组合起来，生成一个完整的 8×8×256 区块的函数：

```c
// worldgen.c（简化）

void generateChunk (uint8_t *chunk, short cx, short cz) {
  uint32_t hash = getChunkHash(cx, cz);
  uint8_t biome = getChunkBiome(cx, cz);

  // 遍历区块的每一列（8×8 = 64）
  for (int x = 0; x < 8; x ++) {
    for (int z = 0; z < 8; z ++) {
      // 世界绝对坐标
      int wx = cx * 8 + x;
      int wz = cz * 8 + z;

      // 该列的高度
      uint8_t height = getHeightAt(wx, wz);

      // 从下往上填充该列
      for (int y = 0; y < height; y ++) {
        uint8_t block = getTerrainBlock(wx, y, wz);
        chunk[y * 64 + z * 8 + x] = block;
      }
    }
  }

  // 添加地表元素（树木、仙人掌）
  genFoliage(chunk, cx, cz, hash, biome);
}
```

就这些。3 个嵌套循环：对每一列，找到高度，填充方块，继续下一列。输出是一个 `uint8_t[16384]`（8 × 8 × 256），代表完整的区块。没有缓存，没有懒加载，没有压缩----区块生成后直接发送给客户端。

## 存储：到处都是静态数组

Bareiron 的内存架构，就是嵌入式 C 的最佳体现。没有 malloc，没有哈希表，没有链表。

所有东西都在固定大小的全局数组中。

### 方块变更

```c
// globals.h，第 191-196 行

typedef struct {
  short x;      // 2 字节 -- 水平方向限制在 32,000 格
  short z;      // 2 字节
  uint8_t y;    // 1 字节 -- 垂直方向限制在 256 格
  uint8_t block; // 1 字节 -- 限制在 256 种方块类型
} BlockChange;
```

20,000 个条目，大约 **25,000 次变更**----相当于一个半区块被完全挖空。`block` 字段为 `0xFF` 表示空闲条目。查找是线性扫描：

![方块数组的内存布局----每条目 6 字节](/images/bareiron/memory-layout.jpg)

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

添加变更和查找一样直接：

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

一个计数器，一个索引，一次写入。没有排序，没有压缩，没有内存管理。当数组满了，新的变更被忽略----地形恢复为生成状态。

作者对 256 种方块限制的评论："我短期内不打算实现轻微氧化抛光铜楼梯。"

### 生物：每条命 8 字节

```c
// globals.h，第 240-251 行（pragma pack(push, 1) 消除填充）

typedef struct {
  uint8_t type;   // 25=鸡, 28=牛, 95=猪, 106=羊, 145=僵尸
  short x;
  uint8_t y;      // 如果 health=0，Y 变成删除前的计时器
  short z;
  uint8_t data;   // bit 0-4: 生命值, bit 5: 羊是否剪过毛, bit 6-7: 恐慌计时器
} MobData;
```

8 字节。最多 16 个位置。没有对齐，没有填充。`data` 字节是一个自制的位字段：5 位生命值，1 位剪毛标记，2 位恐慌计时器。当生物死亡时，Y 字段变成删除前的计时器。这是位级别的内存复用。

### 玩家：紧密打包

玩家数据也用了 `#pragma pack(push, 1)`----坐标用 `short` + `uint8_t`，背包用 `uint16_t` + `uint8_t` 的固定数组，还有一个 `flags` 字段，同时编码了攻击冷却、生成状态、潜行、冲刺、进食、加载、移动冷却和合成锁定。所有这些都塞在独立的位里。

## 主循环：while(true) + 非阻塞

整个服务器跑在一个循环里，一个线程，零事件库。

```c
// main.c，第 594-720 行

while (true) {
  task_yield();  // 让 ESP32 的看门狗喘口气

  // 接受新连接（非阻塞）
  for (int i = 0; i < MAX_PLAYERS; i ++) {
    if (clients[i] != -1) continue;
    clients[i] = accept(server_fd, ...);
    if (clients[i] != -1) client_count ++;
    break;
  }

  // 如果时间到了，执行服务器 tick
  if (get_program_time() - last_tick_time > TIME_BETWEEN_TICKS) {
    handleServerTick(time_since_last_tick);
    last_tick_time = get_program_time();
  }

  // 轮询：每轮一个客户端，一个数据包
  client_index = (client_index + 1) % MAX_PLAYERS;
  if (clients[client_index] == -1) continue;

  // 读取数据包头部：长度 + ID
  recv(client_fd, &recv_buffer, 2, MSG_PEEK);
  int length = readVarInt(client_fd);
  int packet_id = readVarInt(client_fd);
  handlePacket(client_fd, length - sizeVarInt(packet_id), packet_id, state);
}
```

每次循环迭代只处理一个客户端，每次只读一个数据包。循环开头的 `task_yield()` 让 FreeRTOS 的空闲任务能在 ESP32 上喘口气----没有这个，看门狗定时器会重置芯片。

数据包分发是一个 **400 行**的巨型 switch：

```c
// main.c，第 68-497 行

void handlePacket (int client_fd, int length, int packet_id, int state) {
  switch (packet_id) {
    case 0x00:  // 根据状态：握手 / 状态 / 登录
    case 0x01:  // 状态 ping
    case 0x02:  // 插件消息
    case 0x03:  // 登录/配置确认
    case 0x08:  // 聊天
    case 0x0B:  // 客户端状态（重生）
    case 0x11:  // 点击容器（处理箱子）
    case 0x19:  // 与实体交互
    case 0x1D..0x20:  // 移动数据包（最大分支）
    case 0x28:  // 玩家动作（挖掘/放置）
    // ... 40+ 个 case
  }
}
```

没有动态跳转表，没有 vtable，没有映射。switch 编译成静态跳转表。嵌入式系统的完美方案。

`0x1D-0x20` 分支是最大的----它处理位置更新、坠落伤害、区块边界穿越、生物生成、区块生成，还有饥饿值。全部集中在一个大 fall-through 里。

![Bareiron 服务端代码 -- 6800 行 C](/images/bareiron/code-shot.jpg)

## 服务器 tick 与生物 AI

`handleServerTick` 函数每 50 毫秒（20 TPS）被调用一次。它在主循环处理玩家的同时管理世界：

```c
// main.c（简化）

void handleServerTick (uint32_t delta) {
  // 更新每个生物
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type == 0 || mobs[i].data == 0) continue;  // 死亡或空位

    MobData *mob = &mobs[i];
    int px, pz;
    getNearestPlayer(mob->x, mob->z, &px, &pz);

    if (mob->type == MOB_ZOMBIE) {
      // 敌对：走向最近的玩家
      if (px < mob->x) mob->x --;
      else if (px > mob->x) mob->x ++;
      if (pz < mob->z) mob->z --;
      else if (pz > mob->z) mob->z ++;
      // 2 格内接触伤害
      if (abs(px - mob->x) <= 2 && abs(pz - mob->z) <= 2)
        damagePlayer(getNearestPlayerId(mob->x, mob->z), 3);
    } else {
      // 被动：8 个随机方向
      uint8_t dir = getMobDir(mob);
      mob->x += dir_lookup[dir][0];
      mob->z += dir_lookup[dir][1];
      // 每 ~40 tick 改变方向
      if (mob->data >> 6 < 1) setMobDir(mob, rand() & 7);
      mob->data = (mob->data & 0x3F) | ((mob->data - 0x40) & 0xC0);
    }

    // 唤醒生物周围的区块
    setChunkGenerated(mob->x / 8, mob->z / 8);
  }
}
```

敌对生物的 AI 就是坐标比较。字面意义上的 `if (px < x) x--`。没有寻路，没有 A*，没有避障。僵尸独立地向玩家调整 X 和 Z----有墙也穿墙。

接触伤害是 3 颗心/秒。p2r3 故意设置得高，因为缺乏寻路使得僵尸很容易被风筝。

护甲公式用的是战斗更新前的版本----最简单的方案：

```c
// main.c（简化）

static uint8_t applyArmor (uint8_t damage, uint16_t armor_value) {
  // 1.9 之前的公式：线性减免
  // 每点护甲值 = 4% 减免，最高 80%
  uint8_t reduction = (armor_value * 4);
  if (reduction > 80) reduction = 80;
  return damage * (100 - reduction) / 100;
}
```

全套钻石 = 80% 减免。僵尸 3 心的一击变成 0.6 心。p2r3 选择这个旧公式是因为它只需 2 步运算----没有阈值，没有曲线，就是线性百分比。

被动生物：从查找表中取 8 个方向，每 ~40 tick 改变方向。`data` 字段在前 2 个高位 bit 中编码当前方向，在剩余 6 位中编码方向改变计时器。

![Bareiron 中的生物----僵尸、猪、羊](/images/bareiron/mobs.jpg)

### 生物重生

生物不是通过随机 tick 生成的。它们是在服务器 tick 发现新的区块边界时出现的：

```c
if (玩家越过区块边界) {
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type != 0) continue;
    spawnMob(&mobs[i], new_chunk_coords, getChunkHash(cx, cz));
    break;
  }
}
```

和地形用同一个 RNG，同一个区块种子。如果生物位置有空位，生成就是确定性的。

## 合成：没有配方矩阵，只有 if/else

```c
// crafting.c，第 9-347 行（简化）

void getCraftingOutput (PlayerData *player, uint8_t *count, uint16_t *item) {
  // 如果 flag 0x80 被设置，合成缓冲区被箱子占用
  if (player->flags & 0x80) { *count = 0; *item = 0; return; }

  // 统计已填充格子，找到第一个物品，检查是否全部相同
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
    case 1:  /* 木板、锭... */
    case 2:  /* 木棍、剪刀、火把 */
    case 3:  /* 锹、剑、台阶 */
    case 4:  /* 合成台、靴子 */
    case 5:  /* 镐、斧、头盔 */
    case 7:  /* 护腿、堆肥桶 */
    case 8:  /* 熔炉、箱子、胸甲 */
    case 9:  /* 完整方块（铁、金等） */
  }
}
```

第一个检查：如果 `0x80` 标志被设置，合成缓冲区被复用为箱子指针。不能合成。

然后，它统计已填充的格子数，记下第一个物品，检查是否全部相同。仅凭这些，4 个检查就能匹配熔炉：

```c
if (count == 8 && first == 圆石 && all_identical && center_empty)
    return 熔炉;
```

对于复杂形状，它用第一个物品的索引并检查相对位置。所有配方共享同一个匹配函数----材料决定结果。

![Bareiron 中的合成和箱子界面](/images/bareiron/crafting.jpg)

## 箱子：真正的 hack

广为流传的内存 hack，实际代码是这样的：

```c
// procedures.c，第 1262-1293 行

if (target == B_chest) {
  // 在方块表中查找箱子的条目
  uint8_t *storage_ptr = NULL;
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block != B_chest) continue;
    if (block_changes[i].x != x || block_changes[i].y != y || block_changes[i].z != z)
      continue;
    storage_ptr = (uint8_t *)(&block_changes[i + 1]);  // 指向箱子方块之后
    break;
  }
  if (storage_ptr == NULL) return;

  // Terrible memory hack!!
  // 把指针复制到玩家的合成物品数组里
  memcpy(player->craft_items, &storage_ptr, sizeof(storage_ptr));
  player->flags |= 0x80;  // 锁定合成

  // 向客户端发送箱子界面
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

代码里的注释：`// Terrible memory hack!!1!`

就是这样。它取 `block_changes[]` 中下一条目的内存地址，复制到 `player->craft_items`（一个 `uint16_t[9]`，即 18 字节----足以存储 32 位指针），然后设置标志，防止任何人在这期间尝试合成。

每次点击箱子背包：

```c
// packets.c，第 620-638 行

uint8_t *storage_ptr;
memcpy(&storage_ptr, player->craft_items, sizeof(storage_ptr));
// storage_ptr 现在指向箱子数据
uint16_t *p_item = (uint16_t *)(storage_ptr + (slot - 41) * 3);
uint8_t *p_count = storage_ptr + (slot - 41) * 3 + 2;
```

它从合成缓冲区取出指针，用偏移量访问格子。箱子数据以每格 3 字节（2 字节 ID，1 字节数量）的方式存储在方块数组中，彼此紧挨。

![箱子数据存储在方块数组中----一个内存 hack](/images/bareiron/chest-hack.jpg)

## 饥饿值：5 行天才代码

```c
// main.c，第 293-305 行

// 玩家移动时以 ~20/秒发送移动数据包，
// 静止时少得多。我们把这与活动关联起来，
// 免费模拟饥饿值。
if (player->saturation == 0) {
  if (player->hunger > 0) player->hunger--;
  player->saturation = 200;
  sc_setHealth(client_fd, player->health, player->hunger, player->saturation);
} else if (player->flags & 0x08) {  // 冲刺
  player->saturation -= 1;
}
```

字面意义就是这 5 行。每个移动数据包减少饱和度。当饱和度降到零，饥饿值下降并重置饱和度。冲刺（标志 `0x08`）使消耗翻倍。

零计时器，零分配内存，零专用计算。只是一个计数器，在已经存在的数据包上递减。

### 坠落伤害

项目中最简单的伤害系统：

```c
// 当玩家离开地面时，存储其 Y 值
// 当玩家再次碰触地面时，做减法
伤害 = 最后地面Y - 当前Y;
```

一个减法。

## 挖掘和放置方块

当你点击一个方块时，`0x28`（玩家动作）数据包进入 switch。处理程序需要确定该位置的方块类型，移除它，并把物品放入背包：

```c
// main.c，case 0x28（简化）

void handlePlayerAction (int client_fd, uint8_t action, int x, uint8_t y, int z) {
  switch (action) {
    case START_DESTROY_BLOCK: {
      // 确定点击位置的方块类型
      uint8_t block = getBlockAt(x, y, z);

      if (block == B_chest) {
        openChest(client_fd, x, y, z);
        break;
      }

      // 添加到 block_changes
      addBlockChange(x, z, y, 0);  // 0 = 空气

      // 给玩家物品（信任客户端）
      addItemToPlayer(client_fd, block_to_item(block), 1);

      // 向客户端发送更新
      sc_blockChange(client_fd, x, y, z, 0);
      sc_ackBlockChange(client_fd, x, y, z, 0);
      break;
    }
    case PLACE_BLOCK: {
      // 从玩家手中读取方块类型
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

`getBlockAt` 结合了地形生成和玩家变更：

```c
uint8_t getBlockAt (int x, uint8_t y, int z) {
  // 先检查玩家变更
  uint8_t change = getBlockChange(x, y, z);
  if (change != 0xFF) return change;

  // 否则从生成的地形读取
  return getTerrainBlock(x, y, z);
}
```

变更优先，兜底地形。零争议，零缓存，零开销。`getTerrainBlock` 底层是 `getHeightAt` 加上各层 stone/dirt/grass/coal。

### 即时熔炉

最好笑的是：熔炉作为实体根本不存在。如果你把圆石放进"烧炼"格，煤放进"燃料"格，结果会立即出现。没有计时器，没有区块 ticking。就只是一个背包格子，当你放入正确的物品时，它会清空自己。

![即时熔炉----放入材料，立即出结果](/images/bareiron/furnace.jpg)

## ESP32 循环：4 KB 栈上的 MC 服务器

```c
// main.c，第 732-779 行

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
  // 其余由事件处理器管理
}
#endif
```

整个服务器跑在一个 FreeRTOS 任务里，只有 **4096 字节的栈**。就这些。主线程只负责初始化 WiFi 并等待连接。一旦连接上，它 spawn 出 `bareiron_main`，后者调用标准的 `main()`。

所有 ESP32 专用代码都用 `#ifdef ESP_PLATFORM` 保护。在 PC 上，全部编译为标准 POSIX 代码。

## 被牺牲的功能

为了让这一切能塞进去，有些原版功能不存在：

- **无网络压缩**----zlib 成本太高。服务器生成区块很快，但发送它们是瓶颈。
- **无随机 tick**----树要么用骨粉催熟，要么不熟。生物在区块边界生成。
- **无掉落物实体**----挖掉的方块直接进背包。动画纯粹是视觉上的。
- **完全不做背包验证**----信任客户端。64 颗钻石？OK。1 秒挖完一个区块？OK。只适合在互相信任的人之间玩。
- **无服务端光照**----火把在所有其他数据之后发送，由客户端计算。
- **无渐进流体**----直接跳到最终状态。

## 最终结果

Ryzen 5 3600：每个区块约 0.5 毫秒。
1 美元的 ESP32-C3：每个区块约 200 毫秒。可以玩。

![区块生成基准测试----Ryzen vs ESP32](/images/bareiron/performance.jpg)

3 个以上玩家：开始卡了。作者说，堪比高峰时段的 2b2t。

![多个玩家连接到同一个 Bareiron 服务器](/images/bareiron/multiplayer.jpg)

## 背后的哲学

p2r3："我就是喜欢这个想法----这块只有一美元、功耗 0.5 瓦的小芯片，能跑像 Minecraft 这么复杂的东西。Science isn't about 'why', it's about 'why not'."

每一行都是权衡取舍：
- Perlin 噪声 → 插值：没那么好看，快 200 倍，零内存
- 合成配方矩阵 → 硬编码匹配：代码丑，零字节
- zlib → 什么都没有：连接差就会死，但能玩
- 验证 → 信任：零安全，零计算

每一个缺失的功能，都是为了在硬件限制下让另一个功能得以存在。

**3 个要点：**

1. **插值 + RNG**----4 个播种点，无限地形，零存储，无需重新生成区块即可查询，200 毫秒生成。这是让所有其他东西成为可能的天才操作。
2. **每个功能都有成本**----无压缩、无随机 tick、无验证。这不是疏忽，这是能在 520 KB 内存里跑起来的原因。
3. **最脏的 hack 就是最聪明的**----通过 memcpy 把箱子存在方块数组中、用移动数据包模拟饥饿值、即时熔炉。干净的方案成本太高了。

如果你对这个项目感兴趣，所有代码都在 [GitHub 上的 GPLv3](https://github.com/p2r3/bareiron/)。是写得挺脏的 C 代码，但我很少读源代码读得这么开心 xD
