---
title: Bareiron -- máy chủ Minecraft chạy trên vi điều khiển giá 1$
description: 6800 dòng C, zero malloc, Perlin noise được thay thế bằng bilinear
  interpolation, biome dạng tile map, và tất cả trên một con chip 1$.
date: 2026-05-30
tags:
  - minecraft
  - reverse-engineering
  - embedded
  - c
  - esp32
authors:
  - fox3000foxy
---

## Giới thiệu

Bạn đã bao giờ tự hỏi liệu có thể chạy một máy chủ Minecraft trên một vi điều khiển giá 1$ không?

Tôi đã từng. Và câu trả lời là có. Theo nghĩa đen.

Có một dự án tên là [Bareiron](https://github.com/p2r3/bareiron/), của p2r3, và đó có lẽ là một trong những dự án hấp dẫn nhất tôi từng thấy trong thế giới Minecraft những năm gần đây. Chúng ta đang nói về một binary chỉ nặng **300 kilobyte**, **6800 dòng C**, không phụ thuộc bên ngoài, không malloc, không threading, và chạy trên một **ESP32 giá 1 đô la**.

![ESP32-C3, vi điều khiển chạy máy chủ](/images/bareiron/esp32-board.jpg)

Tạo địa hình vô tận. Biome. Hang động. Chế tạo. Đào mỏ. Sinh vật. Đói. Rương. Tất cả những gì bạn mong đợi từ một máy chủ survival.

Trên một con chip tiêu thụ **0.5 Watt** và có xung nhịp **160 MHz**.

Để dễ hình dung: một máy chủ Minecraft vanilla cần vài GB RAM. ESP32-C3 chỉ có **520 KB SRAM** (400 KB khả dụng sau khi boot). Bộ vi xử lý cách đây 20 năm đã chạy ở GHz -- con chip này chỉ đạt tối đa 160 MHz. Hệ số chênh lệch về sức mạnh thuần túy là khoảng **20 000**.

p2r3 không chỉ viết một máy chủ Minecraft bằng C, anh ấy đã phát minh lại từng viên gạch của máy chủ để nó vừa vặn trong những giới hạn đó. Hãy cùng xem bằng cách mở mã nguồn.

![Hình thu nhỏ video giới thiệu Bareiron của p2r3](/images/bareiron/title-card.jpg)

## Bộ não của dự án: tạo địa hình không cần bộ nhớ

Vấn đề lớn nhất khi bạn muốn làm một máy chủ MC nhúng là tạo địa hình.

Trong Minecraft vanilla, thế giới được tạo bằng **Perlin noise**: nhiều lớp chồng lên nhau (octave), 6 tham số biome (nhiệt độ, độ ẩm, tính lục địa, xói mòn, weirdness, độ sâu), và cả một hệ thống caching để không phải tính toán lại mọi thứ mỗi lần.

Kết quả thật tuyệt đẹp. Nhưng nó tốn kém về tính toán, và chiếm RAM để lưu trữ các chunk đã tạo.

Cách tiếp cận của Bareiron hoàn toàn khác biệt. Thay vì chồng noise, nó sử dụng **bilinear interpolation** trên 4 điểm được tạo bởi một **RNG tất định**.

Bạn biết khi bạn phóng to một bức ảnh nhỏ bị pixel hóa và các cạnh trở nên mờ không? Đó chính xác là những gì đang xảy ra.

```c
// worldgen.c, dòng 117-171 (đã đơn giản hóa)

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

Nội suy song tuyến tính tiêu chuẩn: 4 góc, trọng số theo vị trí, một `uint8_t` duy nhất đầu ra. CHUNK_SIZE là 8, vì vậy nó được thực hiện bằng phép nhân số nguyên, không dùng float.

p2r3 trình bày từng bước trong video: đầu tiên là 4 góc của chunk, mỗi góc có một độ cao được seed bởi RNG.

![4 góc của chunk, mỗi góc được seed bởi RNG tất định](/images/bareiron/gen-four-corners.jpg)

Sau đó, phép nội suy giữa 4 điểm này tạo ra một bề mặt liên tục.

![Áp dụng bilinear interpolation giữa 4 góc](/images/bareiron/gen-interpolate.jpg)

Và bằng cách lặp lại mẫu này trên tất cả các chunk liền kề, chúng ta có được địa hình trải dài vô tận.

![Kết quả cuối cùng: địa hình gồ ghề liên tục](/images/bareiron/gen-result.jpg)

### RNG tất định

Chìa khóa làm nên tất cả điều này là seeding. Mỗi chunk có 4 góc, và mỗi góc cần một giá trị giả ngẫu nhiên duy nhất nhưng có thể tái tạo.

```c
// worldgen.c, dòng 13-22

uint32_t getChunkHash (short x, short z) {
  uint8_t buf[8];
  memcpy(buf, &x, 2);          // 16 bit tọa độ X
  memcpy(buf + 2, &z, 2);      // 16 bit tọa độ Z
  memcpy(buf + 4, &world_seed, 4);  // 32 bit seed toàn cục
  return splitmix64(*((uint64_t *)buf));  // hash
}
```

Nó đóng gói 16 bit của X, 16 bit của Z, và 32 bit seed, vào một bộ đệm 8 byte, và đưa tất cả vào `splitmix64`. Kết quả: một giá trị tất định duy nhất cho mỗi vị trí, dựa trên seed của thế giới.

Bạn thấy sức mạnh của nó chứ? Máy chủ không cần lưu trữ địa hình. Nó tính toán lại khi cần khi người chơi đến khu vực mới, và cho kết quả hoàn toàn giống nhau mỗi lần.

`splitmix64` được sử dụng là một PRNG cực nhanh được thiết kế cho hash 64 bit:

```c
// worldgen.c (đã đơn giản hóa)

static uint32_t splitmix64 (uint64_t state) {
  state += 0x9E3779B97F4A7C15ull;
  uint64_t z = state;
  z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ull;
  z = (z ^ (z >> 27)) * 0x94D049BB133111EBull;
  return (z ^ (z >> 31)) >> 32;
}
```

3 thao tác: cộng, xor/dịch, nhân, xor/dịch, nhân, xor/dịch. Không có lookup table, không có vòng lặp. Nó lấy bộ đệm 8 byte (X + Z + seed), xử lý như một số nguyên 64 bit, và trả về 32 bit hash. Tất định, nhanh, và gọn trong 5 dòng.

### Tại sao đây không phải là Perlin noise

p2r3 tự nói trong video: "bạn càng thêm nhiều chữ số từ số ngẫu nhiên, địa hình càng trở nên đều đặn, giống như tung đồng xu nhiều lần càng tiến gần đến 50/50". Trong thực tế, đó là số bit của hash mà nó kết hợp:

```c
// worldgen.c, dòng 51-115

// Với biome plains: 4 yếu tố kết hợp → địa hình đều đặn
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// Với snowy plains: 2 yếu tố → gồ ghề hơn
h = (hash % 5) + ((hash >> 4) % 5);
```

Mỗi biome chọn bao nhiêu lần trích xuất bit để kết hợp. Càng nhiều, phân phối càng ổn định -- giống như tung nhiều đồng xu tiến gần đến 50/50. Càng ít, biến thể cục bộ càng mạnh.

![Địa hình gồ ghề -- ít yếu tố, biến thể lớn](/images/bareiron/terrain-irregular.jpg)

Chỉ với 2 yếu tố, snowy plains tạo ra địa hình đồi núi, gần như núi non. Các đỉnh và hố thường xuyên xuất hiện.

![Địa hình đều đặn -- nhiều yếu tố, bề mặt mịn](/images/bareiron/terrain-regular.jpg)

Với 4 yếu tố, plains vẫn bằng phẳng và dễ đoán. Phân phối ổn định.

Một chunk được tạo trong **200 ms** trên ESP32 -- so với thời gian không thể đo được trên cùng phần cứng với Perlin noise vì nó quá đắt.

### Chi tiết đỉnh cao: truy vấn một khối mà không cần tạo toàn bộ chunk

Bạn chơi, bạn đào một khối. Máy chủ cần biết item nào để đưa cho bạn. Theo cách ngây thơ, bạn sẽ cần tạo toàn bộ chunk để làm điều đó.

Với bilinear interpolation, bạn có thể truy vấn **bất kỳ điểm nào** trên mặt phẳng trực tiếp từ tọa độ. Các góc của chunk có được từ vị trí người chơi, phép nội suy cho bạn độ cao tại bất kỳ offset nào. Một vài phép toán, không cần tạo chunk.

p2r3: "điều tôi muốn là một hàm kỳ diệu có thể cho tôi biết khối nào nằm ở tọa độ nhất định, mà không cần truy cập bộ nhớ hay tính toán bản đồ noise đắt đỏ". Chính xác những gì anh ấy đã làm.

Đây là cách độ cao trở thành các khối cụ thể:

```c
// worldgen.c (đã đơn giản hóa)

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

5 điều kiện. Một lớp grass/dirt/stone/deepslate/bedrock. Khối bề mặt phụ thuộc vào biome qua `biome_top[]` -- grass cho plains, sand cho sa mạc. Không vòng lặp, không switch, một chuỗi if rơi vào đúng lớp.

### Hang động, phép mirror lười biếng nhất

```c
altitude_grotte = CAVE_BASE_DEPTH - (hauteur_surface - y);
```

Nó mirror độ cao bề mặt xuống lòng đất. Trông giống các hốc deepslate lớn. Không tính toán, một dòng.

![Hang động được tạo bằng mirror địa hình bề mặt](/images/bareiron/cave-mirror.jpg)

![Sơ đồ mirror địa hình để tạo hang động](/images/bareiron/cave-diagram.jpg)

### Quặng, phiên bản XOR

```c
candidat = (chunk_x ^ col_x ^ col_z) % 100;
if (candidat < 5 && y < 16) -> diamond
```

XOR tọa độ đảm bảo một ứng cử viên mỗi cột. Loại chỉ phụ thuộc vào độ cao. Kim cương được giấu dưới điểm thấp nhất của hang động để việc đào vẫn có ích.

### Biome dạng tile map

Mỗi biome là một hòn đảo hình tròn trong một lưới, loại của nó được xác định bởi một mẫu tính toán từ seed. Có lưới, dễ đoán, và miễn phí.

![Bản đồ biome dạng tile map -- mỗi đảo là một biome khác nhau](/images/bareiron/biome-tilemap.jpg)

Mỗi biome có bộ tham số riêng được mã hóa trong các mảng:

```c
// worldgen.c (đã đơn giản hóa)

static const uint8_t biome_base[] = {
  [BIOME_PLAINS]  = 48,   // độ cao cơ sở: 48
  [BIOME_DESERT]  = 52,   // cao hơn một chút
  [BIOME_FOREST]  = 50,   // ở giữa
  [BIOME_TAIGA]   = 46,   // thấp hơn một chút
  [BIOME_SNOWY]   = 40,   // thấp nhất
};

static const uint8_t biome_top[] = {
  [BIOME_PLAINS]  = B_grass,
  [BIOME_DESERT]  = B_sand,
  [BIOME_FOREST]  = B_grass,
  [BIOME_TAIGA]   = B_grass,
  [BIOME_SNOWY]   = B_snow_block,
};

static const uint8_t biome_factors[] = {
  [BIOME_PLAINS]  = 4,   // 4 lần trích xuất → rất đều
  [BIOME_DESERT]  = 3,   // 3 lần trích xuất → vừa phải
  [BIOME_FOREST]  = 4,   // 4 lần trích xuất → đều, đồi núi
  [BIOME_TAIGA]   = 3,   // 3 lần trích xuất → vừa phải
  [BIOME_SNOWY]   = 2,   // 2 lần trích xuất → rất gồ ghề
};
```

**Plains**: độ cao 48, 4 yếu tố → địa hình rất bằng phẳng, cỏ.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// Kết quả: dao động tối đa ±4 khối
```

**Desert**: độ cao 52, 3 yếu tố, khối bề mặt = cát. Không bao giờ dưới mực nước biển.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3);
// Kết quả: dao động tối đa ±6 khối, kẹp ở SEA_LEVEL+1
```

**Forest**: độ cao 50, 4 yếu tố như plains nhưng cơ sở cao hơn → đồi cây cối.

**Taiga**: độ cao 46, 3 yếu tố → biến thể vừa phải, địa hình lạnh.

**Snowy plains**: độ cao 40, chỉ 2 yếu tố → gồ ghề nhất.

```c
h = (hash % 5) + ((hash >> 4) % 5);
// Kết quả: dao động tối đa ±14 khối
```

Mỗi biome được mã hóa trong **3 mảng 5 phần tử**: độ cao cơ sở, khối bề mặt, số yếu tố. Khi `getHeightAtFromHash` nhận được biome, nó tra cứu các mảng này để điều chỉnh địa hình. 15 byte dữ liệu để thay thế toàn bộ hệ thống biome của Minecraft.

Bộ phát hiện biome sử dụng seed để xác định biome nào tương ứng với mỗi chunk:

```c
// worldgen.c (đã đơn giản hóa)

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

Một mẫu 16 phần tử, một chỉ mục được seed bởi tọa độ chunk. Tạo ra một lưới lặp lại nhưng trực quan nhất quán. 4 dòng code để thay thế toàn bộ hệ thống tham số biome của Minecraft vanilla.

### getHeightAtFromHash: trình lắp ráp địa hình

Hàm cốt lõi của quá trình tạo kết hợp 4 góc được seed bởi biome:

```c
// worldgen.c (đã đơn giản hóa)

static uint8_t getHeightAtFromHash (int rx, int rz, short cx, short cz,
                                    uint32_t h, uint8_t biome) {
  // 4 góc trích từ hash, seed khác nhau mỗi góc
  uint8_t h1 = biome_base[biome] + (h & 0x0F);
  uint8_t h2 = biome_base[biome] + ((h >> 4) & 0x0F);
  uint8_t h3 = biome_base[biome] + ((h >> 8) & 0x0F);
  uint8_t h4 = biome_base[biome] + ((h >> 12) & 0x0F);

  // Ràng buộc biome: sa mạc không bao giờ dưới nước
  if (biome == BIOME_DESERT) {
    h1 = max(h1, SEA_LEVEL + 1);
    h2 = max(h2, SEA_LEVEL + 1);
    h3 = max(h3, SEA_LEVEL + 1);
    h4 = max(h4, SEA_LEVEL + 1);
  }

  // Nội suy từ 4 góc
  return interpolate(h1, h2, h3, h4, rx, rz);
}
```

Mỗi biome có một `biome_base` dịch chuyển độ cao tham chiếu, và 4 góc được trích xuất từ hash với các độ dịch khác nhau. Sa mạc buộc giá trị tối thiểu trên mực nước biển -- một dòng ràng buộc tránh nước mà không cần tính toán biom bổ sung.

### Cây và xương rồng: đặt theo xác suất

Quá trình tạo bề mặt sử dụng cùng hash chunk để quyết định nơi đặt:

```c
// worldgen.c (đã đơn giản hóa)

static void genFoliage (uint8_t *chunk_data, short cx, short cz,
                        uint32_t hash, uint8_t biome) {
  if (biome == BIOME_DESERT) {
    // Xương rồng: một ứng cử viên mỗi chunk, hash quyết định vị trí
    int tx = (hash >> 8) & 7;
    int tz = (hash >> 12) & 7;
    int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
    if (chunk_data[ty * 64 + tz * 8 + tx] == B_sand)
      placeCactus(chunk_data, tx, ty + 1, tz);
  } else {
    // Cây: hash quyết định có đặt không và đặt ở đâu
    int tree_count = (hash & 3);  // 0-3 cây mỗi chunk
    for (int i = 0; i < tree_count; i ++) {
      int tx = ((hash >> (4 + i * 4)) & 7);
      int tz = ((hash >> (6 + i * 4)) & 7);
      int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
      placeTree(chunk_data, tx, ty + 1, tz);
    }
  }
}
```

0-3 cây mỗi chunk cho biome xanh, tối đa 1 xương rồng cho sa mạc. Hash chunk là nguồn entropy duy nhất -- `& 7` cho vị trí trong chunk, `& 3` cho bộ đếm. Mọi thứ đều tất định, không gì được lưu trữ.

### generateChunk: ghép mọi thứ lại

Hàm kết hợp tất cả để tạo ra một chunk hoàn chỉnh gồm 8×8×256 khối:

```c
// worldgen.c (đã đơn giản hóa)

void generateChunk (uint8_t *chunk, short cx, short cz) {
  uint32_t hash = getChunkHash(cx, cz);
  uint8_t biome = getChunkBiome(cx, cz);

  // Với mỗi cột trong chunk (8×8 = 64)
  for (int x = 0; x < 8; x ++) {
    for (int z = 0; z < 8; z ++) {
      // Tọa độ thế giới tuyệt đối
      int wx = cx * 8 + x;
      int wz = cz * 8 + z;

      // Độ cao của cột
      uint8_t height = getHeightAt(wx, wz);

      // Điền cột từ dưới lên
      for (int y = 0; y < height; y ++) {
        uint8_t block = getTerrainBlock(wx, y, wz);
        chunk[y * 64 + z * 8 + x] = block;
      }
    }
  }

  // Thêm các phần tử bề mặt (cây, xương rồng)
  genFoliage(chunk, cx, cz, hash, biome);
}
```

Đó là tất cả. 3 vòng lặp lồng nhau: với mỗi cột, tìm độ cao, điền khối, chuyển sang cột tiếp theo. Đầu ra là một `uint8_t[16384]` (8 × 8 × 256) đại diện cho chunk hoàn chỉnh. Không caching, không lazy loading, không nén -- chunk được tạo và gửi trực tiếp đến client.

## Bộ nhớ: toàn mảng tĩnh

Kiến trúc bộ nhớ của Bareiron là C nhúng trong tất cả vinh quang của nó. Không malloc, không hash map, không danh sách liên kết.

Mọi thứ đều là mảng toàn cục kích thước cố định.

### Các thay đổi khối

```c
// globals.h, dòng 191-196

typedef struct {
  short x;      // 2 byte -- giới hạn 32 000 khối theo chiều ngang
  short z;      // 2 byte
  uint8_t y;    // 1 byte -- giới hạn 256 khối theo chiều dọc
  uint8_t block; // 1 byte -- giới hạn 256 loại khối
} BlockChange;
```

20 000 mục, tương đương khoảng **25 000 thay đổi** -- tương đương một chunk rưỡi bị đào hết. Trường `block` có giá trị `0xFF` đánh dấu mục trống. Việc tìm kiếm là quét tuyến tính:

![Bố cục bộ nhớ của mảng khối -- 6 byte mỗi mục](/images/bareiron/memory-layout.jpg)

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

Thêm một thay đổi cũng trực tiếp như tìm kiếm:

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

Một bộ đếm, một chỉ mục, một lần ghi. Không sắp xếp, không nén, không quản lý bộ nhớ. Khi mảng đầy, các thay đổi mới bị bỏ qua -- địa hình trở về trạng thái được tạo ban đầu.

Bình luận của tác giả về giới hạn 256 khối: "tôi không tính đến việc implement cầu thang đồng hơi bị patina đánh bóng sớm đâu."

### Sinh vật: 8 byte mỗi con

```c
// globals.h, dòng 240-251 (pragma pack(push, 1) để loại bỏ padding)

typedef struct {
  uint8_t type;   // 25=gà, 28=bò, 95=lợn, 106=cừu, 145=zombie
  short x;
  uint8_t y;      // nếu health=0, Y trở thành timer trước khi xóa
  short z;
  uint8_t data;   // bit 0-4: máu, bit 5: cừu bị cắt lông, bit 6-7: timer hoảng loạn
} MobData;
```

8 byte. Tối đa 16 vị trí. Không căn chỉnh, không padding. Byte `data` là một bitfield tự chế: 5 bit máu, 1 bit cắt lông, 2 bit timer hoảng loạn. Và khi một sinh vật chết, trường Y trở thành timer trước khi xóa. Tái sử dụng bộ nhớ ở cấp độ bit.

### Người chơi: đóng gói chặt

Dữ liệu người chơi cũng dùng `#pragma pack(push, 1)` -- tọa độ ở dạng `short` + `uint8_t`, kho đồ trong mảng cố định `uint16_t` + `uint8_t`, và một trường `flags` mã hóa cả cooldown tấn công, trạng thái spawn, sneak, sprint, eat, load, movement cooldown, và khóa craft. Tất cả trong các bit riêng lẻ.

## Vòng lặp chính: while(true) và non-blocking

Toàn bộ máy chủ chạy trên một vòng lặp, một thread, không thư viện event.

```c
// main.c, dòng 594-720

while (true) {
  task_yield();  // để watchdog trên ESP32 thở

  // Chấp nhận kết nối mới (non-blocking)
  for (int i = 0; i < MAX_PLAYERS; i ++) {
    if (clients[i] != -1) continue;
    clients[i] = accept(server_fd, ...);
    if (clients[i] != -1) client_count ++;
    break;
  }

  // Tick máy chủ nếu đã hết thời gian
  if (get_program_time() - last_tick_time > TIME_BETWEEN_TICKS) {
    handleServerTick(time_since_last_tick);
    last_tick_time = get_program_time();
  }

  // Round-robin: một client, một packet mỗi lần lặp
  client_index = (client_index + 1) % MAX_PLAYERS;
  if (clients[client_index] == -1) continue;

  // Đọc header packet: length + ID
  recv(client_fd, &recv_buffer, 2, MSG_PEEK);
  int length = readVarInt(client_fd);
  int packet_id = readVarInt(client_fd);
  handlePacket(client_fd, length - sizeVarInt(packet_id), packet_id, state);
}
```

Chỉ một client được xử lý mỗi lần lặp, và chỉ một packet được đọc mỗi lần. `task_yield()` ở đầu vòng lặp cho phép tác vụ idle của FreeRTOS thở trên ESP32 -- nếu không có nó, watchdog timer sẽ reset chip.

Việc phân phối packet là một switch khổng lồ **400 dòng**:

```c
// main.c, dòng 68-497

void handlePacket (int client_fd, int length, int packet_id, int state) {
  switch (packet_id) {
    case 0x00:  // Handshake / Status / Login tùy trạng thái
    case 0x01:  // Status ping
    case 0x02:  // Plugin message
    case 0x03:  // Login/configuration acknowledgment
    case 0x08:  // Chat
    case 0x0B:  // Client status (respawn)
    case 0x11:  // Click container (quản lý rương)
    case 0x19:  // Interact entity
    case 0x1D..0x20:  // Movement packets (case lớn nhất)
    case 0x28:  // Player action (đào/đặt)
    // ... hơn 40 case
  }
}
```

Không jump table động, không vtable, không map. Một switch được biên dịch thành jump table tĩnh. Hoàn hảo cho hệ thống nhúng.

Case `0x1D-0x20` là lớn nhất -- nó xử lý cập nhật vị trí, sát thương rơi, vượt biên giới chunk, spawn sinh vật, tạo chunk, VÀ cơn đói. Tất cả trong một fall-through lớn.

![Mã nguồn máy chủ Bareiron -- 6800 dòng C](/images/bareiron/code-shot.jpg)

## Server tick và AI của sinh vật

Hàm `handleServerTick` được gọi mỗi 50 ms (20 TPS). Nó quản lý thế giới trong khi vòng lặp chính xử lý người chơi:

```c
// main.c (đã đơn giản hóa)

void handleServerTick (uint32_t delta) {
  // Cập nhật mỗi sinh vật
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type == 0 || mobs[i].data == 0) continue;  // chết hoặc rỗng

    MobData *mob = &mobs[i];
    int px, pz;
    getNearestPlayer(mob->x, mob->z, &px, &pz);

    if (mob->type == MOB_ZOMBIE) {
      // Thù địch: đi về phía người chơi gần nhất
      if (px < mob->x) mob->x --;
      else if (px > mob->x) mob->x ++;
      if (pz < mob->z) mob->z --;
      else if (pz > mob->z) mob->z ++;
      // Sát thương tiếp xúc ở 2 khối
      if (abs(px - mob->x) <= 2 && abs(pz - mob->z) <= 2)
        damagePlayer(getNearestPlayerId(mob->x, mob->z), 3);
    } else {
      // Bị động: 8 hướng ngẫu nhiên
      uint8_t dir = getMobDir(mob);
      mob->x += dir_lookup[dir][0];
      mob->z += dir_lookup[dir][1];
      // Đổi hướng mỗi ~40 tick
      if (mob->data >> 6 < 1) setMobDir(mob, rand() & 7);
      mob->data = (mob->data & 0x3F) | ((mob->data - 0x40) & 0xC0);
    }

    // Đánh thức các chunk xung quanh sinh vật
    setChunkGenerated(mob->x / 8, mob->z / 8);
  }
}
```

AI của sinh vật thù địch là một phép so sánh tọa độ. Nghĩa đen là `if (px < x) x--`. Không pathfinding, không A*, không tránh vật cản. Zombie điều chỉnh X và Z độc lập về phía người chơi -- nó xuyên tường nếu có.

Sát thương tiếp xúc là 3 máu/giây. p2r3 cố tình đặt cao vì không có pathfinding khiến zombie dễ bị kiter.

Công thức giáp là công thức trước combat update -- đơn giản nhất có thể:

```c
// main.c (đã đơn giản hóa)

static uint8_t applyArmor (uint8_t damage, uint16_t armor_value) {
  // Công thức tiền-1.9: giảm tuyến tính
  // Mỗi điểm giáp = 4% giảm, tối đa 80%
  uint8_t reduction = (armor_value * 4);
  if (reduction > 80) reduction = 80;
  return damage * (100 - reduction) / 100;
}
```

Full diamond = giảm 80%. Một đòn zombie 3 máu thành 0.6 máu. p2r3 chọn công thức cũ này vì nó tính được trong 2 phép toán -- không ngưỡng, không đường cong, chỉ là phần trăm tuyến tính.

Sinh vật bị động: 8 hướng trong một lookup table, đổi hướng mỗi ~40 tick. Trường `data` mã hóa hướng hiện tại trong 2 bit cao nhất, và timer đổi hướng trong 6 bit còn lại.

![Sinh vật trong Bareiron -- zombie, lợn, cừu](/images/bareiron/mobs.jpg)

### Respawn sinh vật

Sinh vật không spawn bằng random tick. Chúng xuất hiện khi server tick gặp biên giới chunk mới:

```c
if (player crossed chunk boundary) {
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type != 0) continue;
    spawnMob(&mobs[i], new_chunk_coords, getChunkHash(cx, cz));
    break;
  }
}
```

Cùng RNG với địa hình, cùng seed chunk. Nếu một vị trí sinh vật trống, spawn là tất định.

## Chế tạo: không ma trận, chỉ if/else

```c
// crafting.c, dòng 9-347 (đã đơn giản hóa)

void getCraftingOutput (PlayerData *player, uint8_t *count, uint16_t *item) {
  // Nếu flag 0x80 được bật, bộ đệm craft đang được rương sử dụng
  if (player->flags & 0x80) { *count = 0; *item = 0; return; }

  // Đếm slot, tìm item đầu tiên, kiểm tra tính đồng nhất
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
    case 1:  /* ván gỗ, thỏi... */
    case 2:  /* gậy, kéo, đuốc */
    case 3:  /* xẻng, kiếm, slab */
    case 4:  /* bàn chế tạo, ủng */
    case 5:  /* cuốc, rìu, mũ */
    case 7:  /* quần, composteur */
    case 8:  /* lò nung, rương, giáp ngực */
    case 9:  /* khối đầy đủ (sắt, vàng, v.v.) */
  }
}
```

Kiểm tra đầu tiên: nếu flag `0x80` được bật, bộ đệm craft được tái sử dụng làm con trỏ rương. Không thể chế tạo.

Sau đó, nó đếm số slot đã điền, ghi nhận item đầu tiên, kiểm tra tính đồng nhất. Chỉ với điều đó, bạn match được lò nung trong 4 kiểm tra:

```c
if (count == 8 && first == cobblestone && all_identical && center_empty)
    return furnace;
```

Đối với các hình dạng phức tạp, nó sử dụng chỉ mục của item đầu tiên và kiểm tra vị trí tương đối. Các công thức dùng chung một hàm matching -- vật liệu quyết định kết quả.

![Giao diện chế tạo và rương trong Bareiron](/images/bareiron/crafting.jpg)

## Rương: hack thực sự

Hack bộ nhớ mà mọi người nói đến, trong code thực tế:

```c
// procedures.c, dòng 1262-1293

if (target == B_chest) {
  // Tìm mục rương trong mảng khối
  uint8_t *storage_ptr = NULL;
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block != B_chest) continue;
    if (block_changes[i].x != x || block_changes[i].y != y || block_changes[i].z != z)
      continue;
    storage_ptr = (uint8_t *)(&block_changes[i + 1]);  // trỏ sau khối rương
    break;
  }
  if (storage_ptr == NULL) return;

  // Terrible memory hack!!
  // Sao chép CON TRỎ vào mảng item craft của người chơi
  memcpy(player->craft_items, &storage_ptr, sizeof(storage_ptr));
  player->flags |= 0x80;  // khóa craft

  // Gửi giao diện rương đến client
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

Và bình luận trong code: `// Terrible memory hack!!1!`

Chính xác là vậy. Nó lấy địa chỉ bộ nhớ của mục tiếp theo trong `block_changes[]`, sao chép nó vào `player->craft_items` (là `uint16_t[9]`, tức 18 byte -- đủ để lưu một con trỏ 32 bit), và bật flag để không ai cố chế tạo trong thời gian đó.

Mỗi lần click trong kho đồ rương:

```c
// packets.c, dòng 620-638

uint8_t *storage_ptr;
memcpy(&storage_ptr, player->craft_items, sizeof(storage_ptr));
// storage_ptr giờ trỏ đến dữ liệu rương
uint16_t *p_item = (uint16_t *)(storage_ptr + (slot - 41) * 3);
uint8_t *p_count = storage_ptr + (slot - 41) * 3 + 2;
```

Nó lấy lại con trỏ từ bộ đệm craft, và truy cập các slot với một offset. Dữ liệu rương được lưu với 3 byte mỗi slot (2 cho ID, 1 cho số lượng), dán liền nhau trong mảng khối.

![Dữ liệu rương được lưu trong mảng khối -- một hack bộ nhớ](/images/bareiron/chest-hack.jpg)

## Cơn đói: 5 dòng thiên tài

```c
// main.c, dòng 293-305

// Người chơi gửi packet di chuyển ~20/giây khi họ
// di chuyển, ít hơn nhiều khi đứng yên. Chúng ta tương quan
// điều này với hoạt động để mô phỏng cơn đói miễn phí.
if (player->saturation == 0) {
  if (player->hunger > 0) player->hunger--;
  player->saturation = 200;
  sc_setHealth(client_fd, player->health, player->hunger, player->saturation);
} else if (player->flags & 0x08) {  // sprinting
  player->saturation -= 1;
}
```

Chính xác là vậy. 5 dòng. Mỗi packet di chuyển giảm độ bão hòa. Khi độ bão hòa về 0, cơn đói giảm và ta reset độ bão hòa. Sprint (flag `0x08`) nhân đôi tốc độ tiêu hao.

Không timer, không bộ nhớ cấp phát, không tính toán chuyên dụng. Một bộ đếm giảm dần trên các packet đã tồn tại.

### Sát thương rơi

Hệ thống sát thương đơn giản nhất của dự án:

```c
// Khi người chơi rời khỏi mặt đất, ta lưu Y của họ
// Khi họ chạm đất lại, ta trừ
sát_thương = y_cuối_cùng_trên_mặt_đất - y_hiện_tại;
```

Một phép trừ.

## Đào và đặt khối

Khi bạn click vào một khối, packet `0x28` (Player Action) rơi vào switch. Handler phải xác định khối nào ở vị trí đó, loại bỏ nó, và đặt item vào kho đồ:

```c
// main.c, case 0x28 (đã đơn giản hóa)

void handlePlayerAction (int client_fd, uint8_t action, int x, uint8_t y, int z) {
  switch (action) {
    case START_DESTROY_BLOCK: {
      // Xác định loại khối tại vị trí được click
      uint8_t block = getBlockAt(x, y, z);

      if (block == B_chest) {
        openChest(client_fd, x, y, z);
        break;
      }

      // Thêm vào block_changes
      addBlockChange(x, z, y, 0);  // 0 = air

      // Đưa item cho người chơi (trust the client)
      addItemToPlayer(client_fd, block_to_item(block), 1);

      // Gửi cập nhật đến client
      sc_blockChange(client_fd, x, y, z, 0);
      sc_ackBlockChange(client_fd, x, y, z, 0);
      break;
    }
    case PLACE_BLOCK: {
      // Đọc loại khối từ tay người chơi
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

`getBlockAt` kết hợp cả tạo địa hình VÀ thay đổi của người chơi:

```c
uint8_t getBlockAt (int x, uint8_t y, int z) {
  // Đầu tiên kiểm tra thay đổi của người chơi
  uint8_t change = getBlockChange(x, y, z);
  if (change != 0xFF) return change;

  // Nếu không, đọc từ địa hình được tạo
  return getTerrainBlock(x, y, z);
}
```

Ưu tiên thay đổi, fallback về địa hình. Không tranh luận, không cache, không overhead. Bên dưới `getTerrainBlock` là `getHeightAt` + các lớp stone/dirt/grass/coal.

### Lò nung tức thì

Điều buồn cười nhất: lò nung không tồn tại như một thực thể. Nếu bạn đặt cobblestone vào ô "nấu" và coal vào "nhiên liệu", kết quả xuất hiện ngay lập tức. Không timer, không chunk ticking. Nó chỉ là một slot kho đồ trống khi bạn đặt đúng item.

![Lò nung tức thì -- đặt nguyên liệu, kết quả ngay lập tức](/images/bareiron/furnace.jpg)

## Vòng lặp ESP32: máy chủ MC trong 4 KB stack

```c
// main.c, dòng 732-779

#ifdef ESP_PLATFORM

void bareiron_main (void *pvParameters) {
  main();
  vTaskDelete(NULL);
}

static void wifi_event_handler (...) {
  if (/* đã kết nối */) {
    xTaskCreate(bareiron_main, "bareiron", 4096, NULL, 5, NULL);
  }
}

void app_main () {
  esp_timer_early_init();
  wifi_init();
  // Phần còn lại được xử lý bởi event handler
}
#endif
```

Toàn bộ máy chủ chạy trong một tác vụ FreeRTOS với **4096 byte stack**. Đó là tất cả. Luồng main chính chỉ khởi tạo WiFi và đợi kết nối. Khi đã kết nối, nó spawn `bareiron_main` gọi hàm `main()` tiêu chuẩn.

Tất cả code dành riêng cho ESP32 được bảo vệ bởi `#ifdef ESP_PLATFORM`. Trên PC, tất cả biên dịch thành code POSIX tiêu chuẩn.

## Những gì đã hy sinh

Để mọi thứ vừa vặn, có những tính năng vanilla không tồn tại:

- **Không nén mạng** -- zlib quá đắt. Máy chủ tạo chunk nhanh, nhưng gửi chúng là nút thắt cổ chai.
- **Không random tick** -- cây mọc bằng bone meal hoặc không. Sinh vật spawn ở biên giới chunk.
- **Không item entity** -- khối đào được đưa thẳng vào kho đồ. Hoạt ảnh chỉ mang tính thị giác.
- **Không kiểm tra kho đồ** -- trust the client. 64 kim cương? OK. Một chunk đào trong 1 giây? OK. Dùng giữa những người tin tưởng lẫn nhau.
- **Không ánh sáng máy chủ** -- đuốc được gửi sau mọi thứ, client tự tính.
- **Không chất lỏng dần dần** -- trạng thái cuối cùng tức thì.

## Kết quả cuối cùng

Ryzen 5 3600: ~0.5 ms mỗi chunk.
ESP32-C3 giá 1$: ~200 ms mỗi chunk. Có thể chơi được.

![Benchmark tạo chunk -- Ryzen vs ESP32](/images/bareiron/performance.jpg)

3+ người chơi: bắt đầu giật. Có thể so sánh với 2b2t vào giờ cao điểm, theo lời tác giả.

![Nhiều người chơi kết nối cùng một máy chủ Bareiron](/images/bareiron/multiplayer.jpg)

## Triết lý

p2r3: "Tôi chỉ thích ý tưởng rằng con chip nhỏ bé giá 1$ này tiêu thụ 0.5 Watt có thể chạy một thứ tiên tiến như Minecraft. Science isn't about 'why', it's about 'why not'."

Mỗi dòng là một sự đánh đổi:
- Perlin noise → nội suy: kém đẹp hơn, nhanh gấp 200 lần, tốn 0 bộ nhớ
- Ma trận chế tạo → matching hardcode: code bẩn, tốn 0 byte
- zlib → không: kết nối chậm = chết, nhưng chơi được
- Xác thực → trust: zero bảo mật, zero tính toán

Mỗi tính năng vắng mặt cho phép một tính năng khác tồn tại trong giới hạn phần cứng.

**3 điều cần nhớ:**

1. **Nội suy + RNG** -- 4 điểm được seed, địa hình vô tận, không lưu trữ, truy vấn không cần tạo lại chunk, 200 ms tạo. Đó là nước cờ thiên tài khiến mọi thứ khác trở nên khả thi.
2. **Mỗi tính năng đều có cái giá** -- Không nén, không random tick, không xác thực. Đó không phải là sơ suất, đó là điều cho phép mọi thứ vừa vặn trong 520 KB.
3. **Những hack bẩn thỉu nhất là thông minh nhất** -- Rương trong mảng khối qua memcpy, cơn đói qua packet di chuyển, lò nung tức thì. Giải pháp sạch sẽ sẽ quá đắt.

Nếu dự án này làm bạn quan tâm, mọi thứ đều có trên [GitHub theo GPLv3](https://github.com/p2r3/bareiron/). Đó là C rất bẩn, và tôi hiếm khi đọc mã nguồn nào vui đến thế xD
