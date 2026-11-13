---
title: Bareiron -- máy chủ Minecraft chạy trên vi điều khiển giá 1$
description: 6800 dòng C, không malloc, Perlin noise thay bằng
  bilinear interpolation, biome dạng tile map, và tất cả trên con chip giá 1$.
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
author_sig: "/joHsf4iZxomXYQLlCoXGb/OtsCwF38orlNRou/iZOv1xlgHzwWLtSfappvUxzOjp7Lp1ybCiAbsUGhAtc7RBw=="
---

## Giới thiệu

Chạy máy chủ Minecraft trên vi điều khiển giá 1 đô, nghe như trò đùa.

Tôi đã tự hỏi, và câu trả lời là có. Theo nghĩa đen.

Có một dự án tên [Bareiron](https://github.com/p2r3/bareiron/), của p2r3, và đó có lẽ là một trong những dự án cuốn hút nhất tôi thấy trong thế giới Minecraft mấy năm gần đây. Ta nói về binary gói trong **300 kilobyte**, **6800 dòng C**, không phụ thuộc ngoài, không malloc, không threading, và nó chạy trên **ESP32 giá 1 đô**.

![ESP32-C3, vi điều khiển chạy máy chủ](/images/bareiron/esp32-board.jpg)

Sinh địa hình vô hạn. Các biome. Hang động. Chế tạo. Đào mỏ. Mob. Đói. Rương. Mọi thứ bạn mong ở máy chủ survival.

Trên con chip tiêu thụ **0.5 Watt** và xung **160 MHz**.

Để cho thang đo : máy chủ Minecraft vanilla cần vài GB RAM. ESP32-C3 là **520 KB SRAM** (400 còn lại sau boot). Bộ xử lý 20 năm trước đã chạy ở gigahertz -- con này trần ở 160 MHz. Hệ số giữa hai bên về sức mạnh thuần khoảng **20 000**.

p2r3 không viết máy chủ Minecraft bằng C, anh ấy phát minh lại từng viên gạch của máy chủ để nó vừa các ràng buộc này. Ta sẽ xem thế nào, bằng cách mở mã nguồn.

![Ảnh thu nhỏ video giới thiệu Bareiron của p2r3](/images/bareiron/title-card.jpg)

## Bộ não dự án : sinh địa hình không cần bộ nhớ

Vấn đề lớn nhất khi muốn làm máy chủ MC nhúng là sinh địa hình.

Trong Minecraft vanilla, thế giới sinh bằng **Perlin noise** : nhiều lớp chồng (octave), 6 tham số biome (nhiệt độ, độ ẩm, lục địa, xói mòn, weirdness, độ sâu), và cả hệ cache để không phải tính lại mọi thứ mỗi lần.

Kết quả tuyệt đẹp. Nhưng tốn tính toán, và tốn RAM để lưu các chunk đã sinh.

Cách của Bareiron khác triệt để. Thay vì chồng nhiễu, nó dùng **bilinear interpolation** trên 4 điểm sinh bởi **RNG xác định**.

Bạn biết khi phóng to ảnh pixel nhỏ và các cạnh mờ đi chứ? Đúng là nó.

```c
// worldgen.c, dòng 117-171 (rút gọn)

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

Nội suy song tuyến chuẩn : 4 góc, trọng số theo vị trí, một `uint8_t` đầu ra. CHUNK_SIZE là 8, nên việc này bằng phép nhân số nguyên, không float.

p2r3 trình bày từng bước trong video : đầu tiên 4 góc của chunk, mỗi cái với chiều cao seed bởi RNG.

![4 góc của chunk, mỗi cái seed bởi RNG xác định](/images/bareiron/gen-four-corners.jpg)

Rồi nội suy giữa 4 điểm này tạo bề mặt liên tục.

![Áp bilinear interpolation giữa 4 góc](/images/bareiron/gen-interpolate.jpg)

Và lặp mẫu trên mọi chunk kề, ta được địa hình trải vô hạn.

![Kết quả cuối : địa hình gồ ghề liên tục](/images/bareiron/gen-result.jpg)

### RNG xác định

Chìa khóa khiến tất cả khả thi là seeding. Mỗi chunk có 4 góc, và mỗi góc cần một giá trị giả ngẫu nhiên duy nhất mà tái tạo được.

```c
// worldgen.c, dòng 13-22

uint32_t getChunkHash (short x, short z) {
  uint8_t buf[8];
  memcpy(buf, &x, 2);          // 16 bits de coordonnée X
  memcpy(buf + 2, &z, 2);      // 16 bits de coordonnée Z
  memcpy(buf + 4, &world_seed, 4);  // 32 bits de seed globale
  return splitmix64(*((uint64_t *)buf));  // hash
}
```

Nó đóng gói 16 bit X, 16 bit Z, và 32 bit seed, vào buffer 8 byte, và chạy tất cả qua `splitmix64`. Kết quả : giá trị xác định duy nhất cho mỗi vị trí, dựa trên seed của thế giới.

Bạn nắm sức mạnh của cơ chế chứ? Máy chủ không cần lưu địa hình. Nó tính lại tức thì khi người chơi tới vùng mới, và cho đúng cùng kết quả mỗi lần.

`splitmix64` dùng là prng siêu nhanh thiết kế cho hash 64 bit :

```c
// worldgen.c (rút gọn)

static uint32_t splitmix64 (uint64_t state) {
  state += 0x9E3779B97F4A7C15ull;
  uint64_t z = state;
  z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ull;
  z = (z ^ (z >> 27)) * 0x94D049BB133111EBull;
  return (z ^ (z >> 31)) >> 32;
}
```

3 thao tác : cộng, xor/shift, nhân, xor/shift, nhân, xor/shift. Tất cả gói trong thao tác trực tiếp, không bảng không vòng lặp. Nó lấy buffer 8 byte (X + Z + seed), xử lý như số nguyên 64 bit, và trả 32 bit hash. Xác định, nhanh, và gói trong 5 dòng.

### Vì sao không phải Perlin noise

p2r3 tự nói trong video : "càng thêm chữ số của số ngẫu nhiên, địa hình càng đều, như càng tung đồng xu càng tiến về 50/50". Thực tế, đó là số bit của hash anh ấy kết hợp :

```c
// worldgen.c, dòng 51-115

// Với biome plains : 4 hệ số kết hợp → địa hình đều
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// Với snowy plains : 2 hệ số → gồ ghề hơn
h = (hash % 5) + ((hash >> 4) % 5);
```

Mỗi biome chọn bao nhiêu trích bit nó kết hợp. Càng nhiều, phân bố càng ổn định -- như càng tung đồng xu càng tiến về 50/50. Càng ít, biến thiên cục bộ càng mạnh.

![Địa hình gồ ghề -- ít hệ số, biến thiên mạnh](/images/bareiron/terrain-irregular.jpg)

Với chỉ 2 hệ số, snowy plains cho địa hình đồi, gần như núi. Đỉnh và hố thường xuyên.

![Địa hình đều -- nhiều hệ số, bề mặt mịn](/images/bareiron/terrain-regular.jpg)

Với 4 hệ số, đồng bằng giữ phẳng và đoán được. Phân bố ổn định.

Chunk sinh trong **200 ms** trên ESP32 -- so với thời gian không đo nổi trên cùng phần cứng với Perlin noise vì nó đắt tới vậy.

### Chi tiết đắt giá : hỏi khối mà không sinh cả chunk

Bạn chơi, bạn đào khối. Máy chủ phải biết cho bạn vật phẩm gì. Ngây thơ, phải sinh cả chunk vì việc đó.

Với bilinear interpolation, bạn hỏi **bất kỳ điểm nào** của mặt phẳng trực tiếp từ tọa độ. Các góc của chunk lấy từ vị trí người chơi, nội suy cho chiều cao ở bất kỳ offset nào. Vài phép toán, không sinh chunk.

p2r3 : "điều tôi muốn là hàm kỳ diệu có thể bảo tôi khối nào ở tọa độ cho trước, không cần chạm bộ nhớ hay tính bản đồ nhiễu đắt đỏ". Đúng điều anh ấy đã làm.

Đây là cách chiều cao thành các khối cụ thể :

```c
// worldgen.c (rút gọn)

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

5 điều kiện. Một lớp grass/dirt/stone/deepslate/bedrock. Khối bề mặt phụ thuộc biome qua `biome_top[]` -- grass cho đồng bằng, sand cho sa mạc. Thác if đơn giản rơi vào đúng lớp, thay vòng lặp và switch.

### Hang động, tấm gương lười nhất

```c
altitude_grotte = CAVE_BASE_DEPTH - (hauteur_surface - y);
```

Nó phản chiếu chiều cao bề mặt xuống dưới lòng đất. Trông như các hốc deepslate lớn. Không tính toán, một dòng.

![Hang sinh bằng phản chiếu địa hình bề mặt](/images/bareiron/cave-mirror.jpg)

![Sơ đồ phản chiếu địa hình để sinh hang](/images/bareiron/cave-diagram.jpg)

### Quặng, bản XOR

```c
candidat = (chunk_x ^ col_x ^ col_z) % 100;
if (candidat < 5 && y < 16) -> diamond
```

XOR tọa độ đảm bảo một ứng viên cho mỗi cột. Kiểu chỉ phụ thuộc độ cao. Kim cương giấu dưới điểm thấp nhất của hang để đào bới vẫn đáng.

### Biome dạng tile map

Mỗi biome là đảo tròn trong lưới, kiểu của nó xác định bằng mẫu tính từ seed. Lưới, đoán được, và miễn phí.

![Bản đồ biome dạng tile map -- mỗi đảo là một biome khác](/images/bareiron/biome-tilemap.jpg)

Mỗi biome có bộ tham số riêng mã hóa trong các bảng :

```c
// worldgen.c (rút gọn)

static const uint8_t biome_base[] = {
  [BIOME_PLAINS]  = 48,   // hauteur de base : 48
  [BIOME_DESERT]  = 52,   // légèrement plus haut
  [BIOME_FOREST]  = 50,   // entre les deux
  [BIOME_TAIGA]   = 46,   // un peu plus bas
  [BIOME_SNOWY]   = 40,   // le plus bas
};

static const uint8_t biome_top[] = {
  [BIOME_PLAINS]  = B_grass,
  [BIOME_DESERT]  = B_sand,
  [BIOME_FOREST]  = B_grass,
  [BIOME_TAIGA]   = B_grass,
  [BIOME_SNOWY]   = B_snow_block,
};

static const uint8_t biome_factors[] = {
  [BIOME_PLAINS]  = 4,   // 4 extractions → très régulier
  [BIOME_DESERT]  = 3,   // 3 extractions → modéré
  [BIOME_FOREST]  = 4,   // 4 extractions → régulier, vallonné
  [BIOME_TAIGA]   = 3,   // 3 extractions → modéré
  [BIOME_SNOWY]   = 2,   // 2 extractions → très accidenté
};
```

**Plains** : chiều cao 48, 4 hệ số → địa hình rất phẳng, cỏ.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// Kết quả : biến thiên tối đa ±4 khối
```

**Desert** : chiều cao 52, 3 hệ số, khối bề mặt = cát. Không bao giờ dưới mực nước biển.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3);
// Kết quả : biến thiên tối đa ±6 khối, kẹp ở SEA_LEVEL+1
```

**Forest** : chiều cao 50, 4 hệ số như plains nhưng nền cao hơn → đồi rừng.

**Taiga** : chiều cao 46, 3 hệ số → biến thiên vừa, địa hình lạnh.

**Snowy plains** : chiều cao 40, chỉ 2 hệ số → gồ ghề nhất.

```c
h = (hash % 5) + ((hash >> 4) % 5);
// Kết quả : biến thiên tối đa ±14 khối
```

Mỗi biome mã hóa trong **3 bảng 5 mục** : chiều cao nền, khối bề mặt, số hệ số. Khi `getHeightAtFromHash` nhận biome, nó tra các bảng này để chỉnh địa hình. 15 byte dữ liệu thay toàn bộ hệ thống biome của Minecraft.

Bộ phát hiện biome dùng seed để xác định biome nào khớp mỗi chunk :

```c
// worldgen.c (rút gọn)

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

Mẫu 16 mục, index seed bởi tọa độ chunk. Cho ra lưới lặp nhưng trông nhất quán. 4 dòng mã thay toàn bộ hệ thống tham số biome của Minecraft vanilla.

### getHeightAtFromHash : bộ ráp địa hình

Hàm ở lõi sinh kết hợp 4 góc seed theo biome :

```c
// worldgen.c (rút gọn)

static uint8_t getHeightAtFromHash (int rx, int rz, short cx, short cz,
                                    uint32_t h, uint8_t biome) {
  // 4 coins extraits du hash, seed différente par coin
  uint8_t h1 = biome_base[biome] + (h & 0x0F);
  uint8_t h2 = biome_base[biome] + ((h >> 4) & 0x0F);
  uint8_t h3 = biome_base[biome] + ((h >> 8) & 0x0F);
  uint8_t h4 = biome_base[biome] + ((h >> 12) & 0x0F);

  // Contrainte biome : désert jamais sous l'eau
  if (biome == BIOME_DESERT) {
    h1 = max(h1, SEA_LEVEL + 1);
    h2 = max(h2, SEA_LEVEL + 1);
    h3 = max(h3, SEA_LEVEL + 1);
    h4 = max(h4, SEA_LEVEL + 1);
  }

  // Interpolation depuis les 4 coins
  return interpolate(h1, h2, h3, h4, rx, rz);
}
```

Mỗi biome có `biome_base` dịch chiều cao tham chiếu, và 4 góc trích từ hash với độ lệch khác nhau. Sa mạc ép min trên mực nước biển -- một dòng ràng buộc tránh nước mà không cần tính toán biome thêm.

### Cây và xương rồng : đặt theo xác suất

Sinh bề mặt dùng cùng hash chunk để quyết trồng ở đâu :

```c
// worldgen.c (rút gọn)

static void genFoliage (uint8_t *chunk_data, short cx, short cz,
                        uint32_t hash, uint8_t biome) {
  if (biome == BIOME_DESERT) {
    // Cactus : un candidat par chunk, hash détermine la position
    int tx = (hash >> 8) & 7;
    int tz = (hash >> 12) & 7;
    int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
    if (chunk_data[ty * 64 + tz * 8 + tx] == B_sand)
      placeCactus(chunk_data, tx, ty + 1, tz);
  } else {
    // Arbres : hash détermine si on en pose et où
    int tree_count = (hash & 3);  // 0-3 arbres par chunk
    for (int i = 0; i < tree_count; i ++) {
      int tx = ((hash >> (4 + i * 4)) & 7);
      int tz = ((hash >> (6 + i * 4)) & 7);
      int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
      placeTree(chunk_data, tx, ty + 1, tz);
    }
  }
}
```

0-3 cây cho mỗi chunk với biome xanh, tối đa 1 xương rồng cho sa mạc. Hash của chunk là nguồn entropy duy nhất -- `& 7` cho vị trí trong chunk, `& 3` cho bộ đếm. Mọi thứ xác định, không gì lưu trữ.

### generateChunk : ráp tất cả

Hàm gom tất cả để cho ra chunk đầy đủ 8×8×256 khối :

```c
// worldgen.c (rút gọn)

void generateChunk (uint8_t *chunk, short cx, short cz) {
  uint32_t hash = getChunkHash(cx, cz);
  uint8_t biome = getChunkBiome(cx, cz);

  // Pour chaque colonne du chunk (8×8 = 64)
  for (int x = 0; x < 8; x ++) {
    for (int z = 0; z < 8; z ++) {
      // Coordonnées monde absolues
      int wx = cx * 8 + x;
      int wz = cz * 8 + z;

      // Hauteur de la colonne
      uint8_t height = getHeightAt(wx, wz);

      // Remplir la colonne de bas en haut
      for (int y = 0; y < height; y ++) {
        uint8_t block = getTerrainBlock(wx, y, wz);
        chunk[y * 64 + z * 8 + x] = block;
      }
    }
  }

  // Ajouter les éléments de surface (arbres, cactus)
  genFoliage(chunk, cx, cz, hash, biome);
}
```

Hết. 3 vòng lặp lồng : với mỗi cột, tìm chiều cao, lấp khối, sang cột tiếp. Đầu ra là `uint8_t[16384]` (8 × 8 × 256) đại diện chunk đầy đủ. Chunk được sinh rồi gửi thẳng cho client, không qua cache, tải lười hay nén.

## Lưu trữ : mảng tĩnh khắp nơi

Kiến trúc bộ nhớ của Bareiron đúng chất C nhúng huy hoàng : chỉ bảng toàn cục kích thước cố định, không malloc, không hash map, không danh sách liên kết.

### Thay đổi khối

```c
// globals.h, dòng 191-196

typedef struct {
  short x;      // 2 bytes -- limite à 32 000 blocs horizontal
  short z;      // 2 bytes
  uint8_t y;    // 1 byte -- limite à 256 blocs vertical
  uint8_t block; // 1 byte -- limite à 256 types de blocs
} BlockChange;
```

20 000 mục, tức khoảng **25 000 thay đổi** -- tương đương chunk rưỡi đào sạch. Trường `block` ở `0xFF` đánh dấu mục trống. Tìm kiếm là quét tuyến tính :

![Bố cục bộ nhớ của bảng khối -- 6 byte cho mỗi mục](/images/bareiron/memory-layout.jpg)

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
```

Thêm thay đổi trực tiếp như tìm kiếm :

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

Một bộ đếm, một index, một lần ghi. Bảng chỉ chồng chất : không sắp xếp, không nén, không quản lý bộ nhớ. Khi bảng đầy, các thay đổi mới bị lờ -- địa hình về trạng thái đã sinh.

Nhận xét của tác giả về giới hạn 256 khối : "je compte pas implémenter les escaliers en cuivre légèrement patinés cirés de si tôt."

### Mob : 8 byte cho mỗi đầu ống

```c
// globals.h, dòng 240-251 (pragma pack(push, 1) pour éliminer le padding)

typedef struct {
  uint8_t type;   // 25=chicken, 28=cow, 95=pig, 106=sheep, 145=zombie
  short x;
  uint8_t y;      // si health=0, Y devient un timer avant suppression
  short z;
  uint8_t data;   // bits 0-4: health, bit 5: sheep sheared, bits 6-7: panic timer
} MobData;
```

8 byte. Tối đa 16 vị trí. Căn chỉnh và đệm vứt bỏ. Byte `data` là bitfield tự chế : 5 bit máu, 1 bit cạo lông, 2 bit timer hoảng. Và khi mob chết, trường Y thành timer trước xóa. Tái dùng bộ nhớ tới cấp bit.

### Người chơi : đóng chặt

Dữ liệu người chơi cũng dùng `#pragma pack(push, 1)` -- tọa độ bằng `short` + `uint8_t`, túi đồ bằng bảng cố định `uint16_t` + `uint8_t`, và trường `flags` mã hóa cùng lúc cooldown tấn công, trạng thái spawn, sneak, sprint, eat, load, movement cooldown, và khóa craft. Tất cả trong các bit riêng lẻ.

## Vòng lặp chính : while(true) và không chặn

Toàn bộ máy chủ chạy trên một vòng lặp, một luồng, không thư viện sự kiện.

```c
// main.c, dòng 594-720

while (true) {
  task_yield();  // laisse respirer le watchdog sur ESP32

  // Accepter une nouvelle connexion (non-bloquant)
  for (int i = 0; i < MAX_PLAYERS; i ++) {
    if (clients[i] != -1) continue;
    clients[i] = accept(server_fd, ...);
    if (clients[i] != -1) client_count ++;
    break;
  }

  // Tick serveur si le temps est écoulé
  if (get_program_time() - last_tick_time > TIME_BETWEEN_TICKS) {
    handleServerTick(time_since_last_tick);
    last_tick_time = get_program_time();
  }

  // Round-robin : un client, un packet par itération
  client_index = (client_index + 1) % MAX_PLAYERS;
  if (clients[client_index] == -1) continue;

  // Lire l'entête du packet : length + ID
  recv(client_fd, &recv_buffer, 2, MSG_PEEK);
  int length = readVarInt(client_fd);
  int packet_id = readVarInt(client_fd);
  handlePacket(client_fd, length - sizeVarInt(packet_id), packet_id, state);
}
```

Một client duy nhất xử lý cho mỗi vòng lặp, và một gói duy nhất đọc mỗi lần. `task_yield()` ở đầu vòng lặp để task idle FreeRTOS thở trên ESP32 -- không có nó, timer watchdog reset chip của bạn.

Điều phối gói, đó là switch khổng lồ **400 dòng** :

```c
// main.c, dòng 68-497

void handlePacket (int client_fd, int length, int packet_id, int state) {
  switch (packet_id) {
    case 0x00:  // Handshake / Status / Login selon l'état
    case 0x01:  // Status ping
    case 0x02:  // Plugin message
    case 0x03:  // Login/configuration acknowledgment
    case 0x08:  // Chat
    case 0x0B:  // Client status (respawn)
    case 0x11:  // Click container (gère les coffres)
    case 0x19:  // Interact entity
    case 0x1D..0x20:  // Movement packets (le plus gros cas)
    case 0x28:  // Player action (dig/place)
    // ... 40+ cas
  }
}
```

Switch biên dịch thành jump table tĩnh, thay jump table động, vtable và map. Hoàn hảo cho nhúng.

Ca `0x1D-0x20` là lớn nhất -- nó xử lý cập nhật vị trí, sát thương rơi, vượt biên chunk, spawn mob, sinh chunk, VÀ đói. Tất cả trong một fall-through lớn.

![Mã của máy chủ Bareiron -- 6800 dòng C](/images/bareiron/code-shot.jpg)

## Tick máy chủ và AI của mob

Hàm `handleServerTick` được gọi mỗi 50 ms (20 TPS). Nó quản thế giới trong khi vòng lặp chính lo người chơi :

```c
// main.c (rút gọn)

void handleServerTick (uint32_t delta) {
  // Mettre à jour chaque mob
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type == 0 || mobs[i].data == 0) continue;  // mort ou vide

    MobData *mob = &mobs[i];
    int px, pz;
    getNearestPlayer(mob->x, mob->z, &px, &pz);

    if (mob->type == MOB_ZOMBIE) {
      // Hostile : marche vers le joueur le plus proche
      if (px < mob->x) mob->x --;
      else if (px > mob->x) mob->x ++;
      if (pz < mob->z) mob->z --;
      else if (pz > mob->z) mob->z ++;
      // Dégâts de contact à 2 blocs
      if (abs(px - mob->x) <= 2 && abs(pz - mob->z) <= 2)
        damagePlayer(getNearestPlayerId(mob->x, mob->z), 3);
    } else {
      // Passif : 8 directions aléatoires
      uint8_t dir = getMobDir(mob);
      mob->x += dir_lookup[dir][0];
      mob->z += dir_lookup[dir][1];
      // Changement de direction toutes les ~40 ticks
      if (mob->data >> 6 < 1) setMobDir(mob, rand() & 7);
      mob->data = (mob->data & 0x3F) | ((mob->data - 0x40) & 0xC0);
    }

    // Réveiller les chunks autour du mob
    setChunkGenerated(mob->x / 8, mob->z / 8);
  }
}
```

AI của mob thù địch là so sánh tọa độ. Theo nghĩa đen `if (px < x) x--`. Zombie lờ pathfinding, A* và tránh chướng ngại : nó chỉnh X và Z độc lập về phía người chơi -- nó xuyên tường nếu có.

Sát thương tiếp xúc ở 3 tim/giây. p2r3 muốn nó cao vì thiếu pathfinding khiến zombie dễ thả diều.

Công thức giáp là của trước combat update -- đơn giản nhất có thể :

```c
// main.c (rút gọn)

static uint8_t applyArmor (uint8_t damage, uint16_t armor_value) {
  // Formule pré-1.9 : réduction linéaire
  // Chaque point d'armure = 4% de réduction, max 80%
  uint8_t reduction = (armor_value * 4);
  if (reduction > 80) reduction = 80;
  return damage * (100 - reduction) / 100;
}
```

Full diamond = 80% giảm. Cú zombie 3 tim thành 0.6 tim. p2r3 chọn công thức cũ này vì nó tính bằng 2 phép toán -- không ngưỡng, không đường cong, chỉ phần trăm tuyến tính.

Mob thụ động : 8 hướng trong bảng tra, đổi hướng mỗi ~40 tick. Trường `data` mã hóa hướng hiện trong 2 bit cao, và timer đổi hướng trong 6 bit còn lại.

![Mob trong Bareiron -- zombie, lợn, cừu](/images/bareiron/mobs.jpg)

### Respawn mob

Mob không spawn bằng random tick. Chúng xuất hiện khi tick máy chủ gặp biên chunk mới :

```c
if (player crossed chunk boundary) {
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type != 0) continue;
    spawnMob(&mobs[i], new_chunk_coords, getChunkHash(cx, cz));
    break;
  }
}
```

Cùng RNG như địa hình, cùng seed chunk. Nếu vị trí mob trống, spawn xác định.

## Chế tạo : không ma trận, if/else

```c
// crafting.c, dòng 9-347 (rút gọn)

void getCraftingOutput (PlayerData *player, uint8_t *count, uint16_t *item) {
  // Si le flag 0x80 est levé, le buffer de craft est utilisé par un coffre
  if (player->flags & 0x80) { *count = 0; *item = 0; return; }

  // Compter les slots, trouver le premier item, vérifier l'identité
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
    case 1:  /* planches, lingots... */
    case 2:  /* bâtons, cisailles, torches */
    case 3:  /* pelles, épées, dalles */
    case 4:  /* table de craft, boots */
    case 5:  /* pioches, haches, casques */
    case 7:  /* jambières, composteurs */
    case 8:  /* fourneau, coffre, plastron */
    case 9:  /* blocs complets (fer, or, etc.) */
  }
}
```

Kiểm tra đầu : nếu cờ `0x80` bật, buffer craft tái chế thành con trỏ rương. Chế tạo giữ khóa.

Rồi, nó đếm slot đầy, ghi nhận vật phẩm đầu, kiểm tra giống nhau. Chỉ với đó, bạn khớp lò trong 4 lần kiểm tra :

```c
if (count == 8 && first == cobblestone && all_identical && center_empty)
    return furnace;
```

Với hình phức tạp, nó dùng index của vật phẩm đầu và kiểm tra vị trí tương đối. Các công thức chung cùng hàm khớp -- vật liệu quyết kết quả.

![Giao diện chế tạo và rương trong Bareiron](/images/bareiron/crafting.jpg)

## Rương : mẹo bộ nhớ thật

Mẹo bộ nhớ ai cũng bàn, trong mã thật :

```c
// procedures.c, dòng 1262-1293

if (target == B_chest) {
  // Chercher l'entrée du coffre dans le tableau des blocs
  uint8_t *storage_ptr = NULL;
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block != B_chest) continue;
    if (block_changes[i].x != x || block_changes[i].y != y || block_changes[i].z != z)
      continue;
    storage_ptr = (uint8_t *)(&block_changes[i + 1]);  // pointe après le bloc coffre
    break;
  }
  if (storage_ptr == NULL) return;

  // Terrible memory hack!!
  // On copie le POINTEUR dans le tableau d'items de craft du joueur
  memcpy(player->craft_items, &storage_ptr, sizeof(storage_ptr));
  player->flags |= 0x80;  // lock le craft

  // Envoyer l'interface coffre au client
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

Và comment trong mã : `// Terrible memory hack!!1!`

Đúng là nó. Nó lấy địa chỉ bộ nhớ của mục tiếp theo trong `block_changes[]`, nó chép vào `player->craft_items` (là `uint16_t[9]`, nên 18 byte -- đủ chứa con trỏ 32 bit), và nó bật cờ để không ai cố chế tạo lúc đó.

Mỗi lần bấm trong túi đồ của rương :

```c
// packets.c, dòng 620-638

uint8_t *storage_ptr;
memcpy(&storage_ptr, player->craft_items, sizeof(storage_ptr));
// storage_ptr pointe maintenant vers les données du coffre
uint16_t *p_item = (uint16_t *)(storage_ptr + (slot - 41) * 3);
uint8_t *p_count = storage_ptr + (slot - 41) * 3 + 2;
```

Nó lấy lại con trỏ từ buffer craft, và nó truy cập các slot bằng offset. Dữ liệu rương lưu với 3 byte cho mỗi slot (2 cho ID, 1 cho số lượng), dán cạnh nhau trong bảng khối.

![Dữ liệu rương lưu trong bảng khối -- một mẹo bộ nhớ](/images/bareiron/chest-hack.jpg)

## Đói : 5 dòng thiên tài

```c
// main.c, dòng 293-305

// Les joueurs envoient des packets de mouvement à ~20/sec quand ils
// bougent, beaucoup moins quand ils sont immobiles. On corrèle ça
// avec l'activité pour simuler la faim gratuitement.
if (player->saturation == 0) {
  if (player->hunger > 0) player->hunger--;
  player->saturation = 200;
  sc_setHealth(client_fd, player->health, player->hunger, player->saturation);
} else if (player->flags & 0x08) {  // sprinting
  player->saturation -= 1;
}
}
```

Đúng nghĩa đen vậy. 5 dòng. Mỗi gói di chuyển giảm bão hòa. Khi bão hòa về không, đói giảm và ta reset bão hòa. Chạy nước rút (cờ `0x08`) nhân đôi hao.

Không timer, không bộ nhớ cấp, không tính toán chuyên. Bộ đếm giảm trên các gói đã tồn tại.

### Sát thương rơi

Hệ sát thương đơn giản nhất của dự án :

```c
// Quand le joueur quitte le sol, on stocke son Y
// Quand il retouche le sol, on soustrait
degats = dernier_y_au_sol - y_actuel;
```

Một phép trừ.

## Đào và đặt khối

Khi bạn bấm vào khối, gói `0x28` (Player Action) đáp vào switch. Handler phải xác định khối nào ở vị trí, gỡ nó, và đặt vật phẩm vào túi :

```c
// main.c, case 0x28 (rút gọn)

void handlePlayerAction (int client_fd, uint8_t action, int x, uint8_t y, int z) {
  switch (action) {
    case START_DESTROY_BLOCK: {
      // Déterminer le type de bloc à la position cliquée
      uint8_t block = getBlockAt(x, y, z);

      if (block == B_chest) {
        openChest(client_fd, x, y, z);
        break;
      }

      // Ajouter aux block_changes
      addBlockChange(x, z, y, 0);  // 0 = air

      // Donner l'item au joueur (trust the client)
      addItemToPlayer(client_fd, block_to_item(block), 1);

      // Envoyer la mise à jour au client
      sc_blockChange(client_fd, x, y, z, 0);
      sc_ackBlockChange(client_fd, x, y, z, 0);
      break;
    }
    case PLACE_BLOCK: {
      // Lire le type de bloc depuis la main du joueur
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

`getBlockAt` kết hợp sinh địa hình VÀ thay đổi của người chơi :

```c
uint8_t getBlockAt (int x, uint8_t y, int z) {
  // D'abord vérifier les changements joueurs
  uint8_t change = getBlockChange(x, y, z);
  if (change != 0xFF) return change;

  // Sinon, lire depuis le terrain généré
  return getTerrainBlock(x, y, z);
}
```

Ưu tiên thay đổi, dự phòng địa hình. Không tranh cãi, không cache, không chi phí. `getTerrainBlock` bên dưới là `getHeightAt` + các lớp stone/dirt/grass/coal.

### Lò nung tức thì

Buồn cười nhất : lò nung không tồn tại như thực thể. Nếu bạn đặt cobblestone vào ô "nấu" và coal vào "fuel", kết quả hiện ngay, không timer hay chunk ticking : chỉ là slot túi đồ trống khi bạn đặt đúng vật phẩm.

![Lò nung tức thì -- đặt nguyên liệu, kết quả ngay](/images/bareiron/furnace.jpg)

## Vòng lặp ESP32 : máy chủ MC trong 4 KB stack

```c
// main.c, dòng 732-779

#ifdef ESP_PLATFORM

void bareiron_main (void *pvParameters) {
  main();
  vTaskDelete(NULL);
}

static void wifi_event_handler (...) {
  if (/* connecté */) {
    xTaskCreate(bareiron_main, "bareiron", 4096, NULL, 5, NULL);
  }
}

void app_main () {
  esp_timer_early_init();
  wifi_init();
  // Le reste est géré par le event handler
}
#endif
```

Toàn bộ máy chủ chạy trong task FreeRTOS với **4096 byte stack**. Hết. Luồng main chính chỉ khởi tạo WiFi và chờ kết nối. Khi nối xong, nó sinh `bareiron_main` gọi `main()` chuẩn.

Mọi mã riêng ESP32 được bảo vệ bằng `#ifdef ESP_PLATFORM`. Trên PC, tất cả biên dịch thành mã POSIX chuẩn.

## Điều đã hy sinh

Để tất cả vừa, có các tính năng vanilla không tồn tại :

- **Không nén mạng** -- zlib quá đắt. Máy chủ sinh chunk nhanh, nhưng gửi chúng là nút thắt.
- **Không random tick** -- cây mọc bằng bone meal hay không. Mob spawn ở biên chunk.
- **Không thực thể vật phẩm** -- khối đào đi thẳng vào túi. Animation thuần trực quan.
- **Không kiểm tra túi đồ** -- trust the client. 64 kim cương? OK. Chunk đào trong 1 giây? OK. Dùng giữa người tin nhau.
- **Không ánh sáng phía máy chủ** -- đuốc gửi sau mọi thứ còn lại, client tính.
- **Không chất lỏng lũy tiến** -- trạng thái cuối tức thì.

## Kết quả cuối

Ryzen 5 3600 : ~0.5 ms cho mỗi chunk.
ESP32-C3 giá 1$ : ~200 ms cho mỗi chunk. Chơi được.

![Benchmark sinh chunk -- Ryzen đấu ESP32](/images/bareiron/performance.jpg)

3+ người chơi : nó ì. Ngang 2b2t giờ cao điểm, theo lời tác giả.

![Nhiều người chơi nối vào cùng máy chủ Bareiron](/images/bareiron/multiplayer.jpg)

## Triết lý

p2r3 : "Tôi chỉ thích ý tưởng con chip tí hon giá 1 xu tiêu thụ 0.5 Watt này có thể chạy thứ tân tiến như Minecraft. Science isn't about 'why', it's about 'why not'."

Mỗi dòng là đánh đổi :
- Perlin noise → nội suy : kém đẹp, nhanh gấp 200 lần, không bộ nhớ
- Ma trận chế tạo → khớp ghi cứng : mã xấu, không byte
- zlib → không gì : kết nối tệ = chết, nhưng chơi được
- Kiểm tra → tin tưởng : không bảo mật, không tính toán

Mỗi tính năng vắng mặt cho phép tính năng khác tồn tại trong giới hạn phần cứng.

**3 điểm cần nhớ :**

1. **Nội suy + RNG** -- 4 điểm seed, địa hình vô hạn, không lưu trữ, truy vấn không cần sinh lại chunk, 200 ms sinh. Đó là nước thiên tài khiến phần còn lại khả thi.
2. **Mỗi tính năng có giá** -- Thiếu nén, random tick và kiểm tra là lựa chọn có chủ ý : đó là điều cho phép vừa trong 520 KB.
3. **Mẹo bẩn thông minh nhất** -- Rương trong bảng khối qua memcpy, đói bằng gói di chuyển, lò nung tức thì. Giải pháp sạch sẽ quá đắt.

Nếu dự án khiến bạn hứng thú, mọi thứ trên [GitHub theo GPLv3](https://github.com/p2r3/bareiron/). Đó là C bẩn đẹp, và tôi hiếm khi vui vậy khi đọc mã nguồn.
