---
title: Bareiron -- เซิร์ฟเวอร์ Minecraft ที่รันบนไมโครคอนโทรลเลอร์ราคา 1$
description: โค้ด C 6800 บรรทัด, zero malloc, Perlin noise ถูกแทนที่ด้วย bilinear
  interpolation, ไบโอมแบบ tile map, และทั้งหมดนี้บนชิปราคา 1$
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
author_sig: "p7YXFB789iweZILmQuCvA/cEt/whHR+Pk0yN4dpXGKbT+NIVyby1aTZHjqDVgej/ksvciDLJzBwrJ3AHRZBxFA=="
---

## บทนำ

คุณเคยสงสัยไหมว่าเราสามารถรันเซิร์ฟเวอร์ Minecraft บนไมโครคอนโทรลเลอร์ราคา 1 ดอลลาร์ได้หรือไม่?

ผมเคย. และคำตอบคือใช่. ตามตัวอักษรเลย.

มีโปรเจกต์ชื่อ [Bareiron](https://github.com/p2r3/bareiron/) โดย p2r3 และนี่น่าจะเป็นหนึ่งในโปรเจกต์ที่น่าทึ่งที่สุดที่ผมเคยเห็นในโลก Minecraft ช่วงไม่กี่ปีที่ผ่านมา เรากำลังพูดถึงไบนารีที่ขนาดแค่ **300 กิโลไบต์**, **โค้ด C 6800 บรรทัด**, ไม่มี dependency ภายนอก, ไม่มี malloc, ไม่มี threading, และมันรันบน **ESP32 ราคา 1 ดอลลาร์**

![ESP32-C3 ไมโครคอนโทรลเลอร์ที่รันเซิร์ฟเวอร์นี้](/images/bareiron/esp32-board.jpg)

สร้าง terrain ไม่จำกัด. มีไบโอม. มีถ้ำ. มีคราฟต์. มีขุด. มีม็อบ. มีหิว. มีหีบ. ทุกอย่างที่คุณคาดหวังจากเซิร์ฟเวอร์ survival

บนชิปที่กินไฟแค่ **0.5 วัตต์** และมีสัญญาณนาฬิกา **160 MHz**

เพื่อให้เห็นภาพ: เซิร์ฟเวอร์ Minecraft vanilla ต้องใช้ RAM หลายกิกะไบต์. ESP32-C3 มี **SRAM 520 KB** (เหลือ 400 หลังบูต). โปรเซสเซอร์เมื่อ 20 ปีที่แล้วก็รันที่ระดับกิกะเฮิรตซ์แล้ว -- ตัวนี้สูงสุดที่ 160 MHz. ปัจจัยด้านพลังบริสุทธิ์ระหว่างสองอย่างคือประมาณ **20,000**

p2r3 ไม่ได้แค่เขียนเซิร์ฟเวอร์ Minecraft ในภาษา C, เขาได้ reinvent ทุกส่วนประกอบของเซิร์ฟเวอร์เพื่อให้มันอยู่ในข้อจำกัดเหล่านี้ เราจะมาดูกันว่าทำยังไง โดยการเปิดซอร์สโค้ด

![ภาพขนาดย่อของวิดีโอนำเสนอ Bareiron โดย p2r3](/images/bareiron/title-card.jpg)

## สมองของโปรเจกต์: การสร้าง terrain โดยไม่ใช้หน่วยความจำ

ปัญหาที่ใหญ่ที่สุดเมื่อคุณต้องการทำเซิร์ฟเวอร์ MC แบบ embedded คือการสร้าง terrain

ใน Minecraft vanilla, โลกถูกสร้างด้วย **Perlin noise**: หลายชั้นซ้อนกัน (octaves), พารามิเตอร์ไบโอม 6 ตัว (temperature, humidity, continentalness, erosion, weirdness, depth), และระบบ caching ทั้งหมดเพื่อไม่ต้องคำนวณซ้ำทุกครั้ง

ผลลัพธ์สวยงามมาก. แต่มันแพงในแง่การคำนวณ และกิน RAM เพื่อเก็บ chunks ที่สร้างแล้ว

แนวทางของ Bareiron แตกต่างอย่างสิ้นเชิง. แทนที่จะซ้อน noise, มันใช้ **bilinear interpolation** บน 4 จุดที่สร้างโดย **RNG แบบ deterministic**

คุณรู้ไหมเวลาเราขยายภาพเล็ก ๆ ที่เป็นพิกเซลแล้วขอบภาพเบลอ? นั่นแหละครับ

```c
// worldgen.c, lines 117-171 (simplified)

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

การ interpolate แบบ bilinear มาตรฐาน: 4 มุม, น้ำหนักตามตำแหน่ง, ได้ `uint8_t` ตัวเดียว. CHUNK_SIZE คือ 8, ดังนั้นใช้การคูณจำนวนเต็ม ไม่มี float

p2r3 แสดงให้เห็นทีละขั้นตอนในวิดีโอ: เริ่มจาก 4 มุมของ chunk แต่ละมุมมีความสูงที่ seed โดย RNG

![4 มุมของ chunk แต่ละมุม seed โดย RNG แบบ deterministic](/images/bareiron/gen-four-corners.jpg)

จากนั้น interpolation ระหว่าง 4 จุดนี้สร้างพื้นผิวที่ต่อเนื่อง

![การใช้ bilinear interpolation ระหว่าง 4 มุม](/images/bareiron/gen-interpolate.jpg)

และเมื่อทำซ้ำ pattern นี้บนทุก chunk ที่อยู่ติดกัน เราจะได้ terrain ที่ขยายออกไปไม่มีที่สิ้นสุด

![ผลลัพธ์สุดท้าย: terrain ไม่สม่ำเสมอต่อเนื่อง](/images/bareiron/gen-result.jpg)

### RNG แบบ deterministic

กุญแจสำคัญที่ทำให้ทุกอย่างเป็นไปได้คือการ seeding. แต่ละ chunk มี 4 มุม และแต่ละมุมต้องการค่า pseudo-random ที่ไม่ซ้ำกันแต่สามารถสร้างซ้ำได้

```c
// worldgen.c, lines 13-22

uint32_t getChunkHash (short x, short z) {
  uint8_t buf[8];
  memcpy(buf, &x, 2);          // 16 bits of coordinate X
  memcpy(buf + 2, &z, 2);      // 16 bits of coordinate Z
  memcpy(buf + 4, &world_seed, 4);  // 32 bits of global seed
  return splitmix64(*((uint64_t *)buf));  // hash
}
```

มัน pack 16 bits ของ X, 16 bits ของ Z, และ 32 bits ของ seed ลงใน buffer ขนาด 8 bytes แล้วส่งทั้งหมดเข้า `splitmix64`. ผลลัพธ์: ค่า deterministic ที่ไม่ซ้ำกันสำหรับแต่ละตำแหน่ง โดยขึ้นอยู่กับ seed ของโลก

คุณเห็นพลังของมันไหม? เซิร์ฟเวอร์ไม่ต้องเก็บ terrain. มันคำนวณใหม่แบบทันทีเมื่อผู้เล่นมาถึงพื้นที่ใหม่ และให้ผลลัพธ์เดิมทุกครั้ง

`splitmix64` ที่ใช้เป็น prng ที่เร็วมากออกแบบมาสำหรับ hash 64 บิต:

```c
// worldgen.c (simplified)

static uint32_t splitmix64 (uint64_t state) {
  state += 0x9E3779B97F4A7C15ull;
  uint64_t z = state;
  z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ull;
  z = (z ^ (z >> 27)) * 0x94D049BB133111EBull;
  return (z ^ (z >> 31)) >> 32;
}
```

3 operations: addition, xor/shift, multiplication, xor/shift, multiplication, xor/shift. ไม่มี lookup table, ไม่มี loop. มันรับ buffer 8 bytes (X + Z + seed) แล้ว treat เป็น integer 64 บิต แล้วคืนค่า hash 32 บิต. มัน deterministic, เร็ว, และอยู่ใน 5 บรรทัด

### ทำไมถึงไม่ใช่ Perlin noise

p2r3 พูดเองในวิดีโอ: "ยิ่งคุณเพิ่ม digits ของ random number มากเท่าไหร่ terrain ก็ยิ่งสม่ำเสมอมากขึ้น เหมือนกับการโยนเหรียญมากขึ้นที่เข้าใกล้ 50/50" ในทางปฏิบัติ มันคือจำนวน bits ของ hash ที่นำมารวมกัน:

```c
// worldgen.c, lines 51-115

// For plains biome: 4 factors combined → regular terrain
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// For snowy plains: 2 factors → more rugged
h = (hash % 5) + ((hash >> 4) % 5);
```

แต่ละไบโอมเลือกว่าจะรวมกี่ bit extraction. ยิ่งมาก การกระจายยิ่งเสถียร -- เหมือนการโยนเหรียญมากขึ้นที่เข้าใกล้ 50/50. ยิ่งน้อย การแปรผันเฉพาะที่ยิ่งสูง

![Terrain ไม่สม่ำเสมอ -- ปัจจัยน้อย, การแปรผันสูง](/images/bareiron/terrain-irregular.jpg)

ด้วยแค่ 2 ปัจจัย, snowy plains สร้าง terrain เป็นลูกคลื่น เกือบเป็นภูเขา. ยอดเขาและหุบเขาพบบ่อย

![Terrain สม่ำเสมอ -- หลายปัจจัย, พื้นผิวเรียบ](/images/bareiron/terrain-regular.jpg)

ด้วย 4 ปัจจัย, ที่ราบเรียบและคาดเดาได้. การกระจายตัวเสถียร

หนึ่ง chunk ใช้เวลา **200 ms** บน ESP32 -- เทียบกับเวลาที่วัดไม่ได้บนฮาร์ดแวร์เดียวกันด้วย Perlin noise เพราะมันแพงมาก

### รายละเอียดที่เจ๋ง: สอบถามบล็อกโดยไม่ต้องสร้างทั้ง chunk

คุณเล่น, คุณขุดบล็อก. เซิร์ฟเวอร์ต้องรู้ว่าควรให้ item อะไรคุณ. ตามปกติ คุณต้องสร้างทั้ง chunk เพื่อการนั้น

ด้วย bilinear interpolation, คุณสามารถสอบถาม **จุดใดก็ได้** บนระนาบโดยตรงจากพิกัด. มุมของ chunk หาได้จากตำแหน่งผู้เล่น, interpolation ให้ความสูงที่ offset ใด ๆ. แค่คณิตศาสตร์ไม่กี่ operation, ไม่ต้องสร้าง chunk

p2r3: "สิ่งที่ฉันต้องการคือฟังก์ชันมหัศจรรย์ที่สามารถบอกฉันได้ว่าบล็อกอะไรอยู่ที่พิกัดที่กำหนด โดยไม่ต้องเข้าถึงหน่วยความจำหรือคำนวณ noise maps ที่แพง" และนั่นคือสิ่งที่เขาทำ

นี่คือวิธีที่ความสูงกลายเป็นบล็อกจริง:

```c
// worldgen.c (simplified)

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

5 conditions. ชั้น grass/dirt/stone/deepslate/bedrock. บล็อกพื้นผิวขึ้นอยู่กับไบโอมผ่าน `biome_top[]` -- grass สำหรับที่ราบ, sand สำหรับทะเลทราย. ไม่มี loop, ไม่มี switch, เป็น cascade ของ if ที่ตกสู่ชั้นที่ถูกต้อง

### ถ้ำ: mirror ที่ขี้เกียจที่สุด

```c
cave_altitude = CAVE_BASE_DEPTH - (surface_height - y);
```

มัน mirror ความสูงของผิวดินใต้ดิน. มันดูเหมือนโพรง deepslate ขนาดใหญ่. ไม่ต้องคำนวณ, แค่บรรทัดเดียว

![ถ้ำที่สร้างโดย mirror ของ terrain ผิวดิน](/images/bareiron/cave-mirror.jpg)

![แผนภาพ mirror ของ terrain เพื่อสร้างถ้ำ](/images/bareiron/cave-diagram.jpg)

### แร่: แบบ XOR

```c
candidate = (chunk_x ^ col_x ^ col_z) % 100;
if (candidate < 5 && y < 16) -> diamond
```

XOR ของพิกัดรับประกันว่าหนึ่ง candidate ต่อคอลัมน์. ประเภทขึ้นอยู่กับระดับความสูง. เพชรซ่อนอยู่ใต้จุดต่ำสุดของถ้ำเพื่อให้การขุดยังมีประโยชน์

### ไบโอมแบบ tile map

แต่ละไบโอมเป็นเกาะวงกลมในกริด, ประเภทของมันถูกกำหนดโดย pattern ที่คำนวณจาก seed. เป็นกริด, คาดเดาได้, และฟรี

![แผนที่ไบโอมแบบ tile map -- แต่ละเกาะคือไบโอมที่แตกต่าง](/images/bareiron/biome-tilemap.jpg)

แต่ละไบโอมมีชุดพารามิเตอร์ของตัวเองที่เข้ารหัสในอาร์เรย์:

```c
// worldgen.c (simplified)

static const uint8_t biome_base[] = {
  [BIOME_PLAINS]  = 48,   // base height: 48
  [BIOME_DESERT]  = 52,   // slightly higher
  [BIOME_FOREST]  = 50,   // in between
  [BIOME_TAIGA]   = 46,   // slightly lower
  [BIOME_SNOWY]   = 40,   // lowest
};

static const uint8_t biome_top[] = {
  [BIOME_PLAINS]  = B_grass,
  [BIOME_DESERT]  = B_sand,
  [BIOME_FOREST]  = B_grass,
  [BIOME_TAIGA]   = B_grass,
  [BIOME_SNOWY]   = B_snow_block,
};

static const uint8_t biome_factors[] = {
  [BIOME_PLAINS]  = 4,   // 4 extractions → very regular
  [BIOME_DESERT]  = 3,   // 3 extractions → moderate
  [BIOME_FOREST]  = 4,   // 4 extractions → regular, hilly
  [BIOME_TAIGA]   = 3,   // 3 extractions → moderate
  [BIOME_SNOWY]   = 2,   // 2 extractions → very rugged
};
```

**Plains**: ความสูง 48, 4 ปัจจัย → terrain เรียบมาก, หญ้า

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// Result: max ±4 blocks variation
```

**Desert**: ความสูง 52, 3 ปัจจัย, บล็อกพื้นผิว = ทราย. ไม่เคยต่ำกว่าระดับน้ำทะเล

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3);
// Result: max ±6 blocks variation, clamped to SEA_LEVEL+1
```

**Forest**: ความสูง 50, 4 ปัจจัยเหมือน plains แต่ฐานสูงกว่า → เนินเขาที่มีป่าไม้

**Taiga**: ความสูง 46, 3 ปัจจัย → การแปรผันปานกลาง, terrain เย็น

**Snowy plains**: ความสูง 40, แค่ 2 ปัจจัย → ขรุขระที่สุด

```c
h = (hash % 5) + ((hash >> 4) % 5);
// Result: max ±14 blocks variation
```

แต่ละไบโอมถูกเข้ารหัสใน **3 อาร์เรย์ 5 รายการ**: ความสูงพื้นฐาน, บล็อกพื้นผิว, จำนวนปัจจัย. เมื่อ `getHeightAtFromHash` ได้รับไบโอม, มันจะค้นหาในอาร์เรย์เหล่านี้เพื่อปรับ terrain. ข้อมูล 15 bytes เพื่อแทนที่ระบบไบโอมทั้งหมดของ Minecraft

ตัวตรวจจับไบโอมใช้ seed เพื่อกำหนดว่าไบโอมใดตรงกับ chunk ไหน:

```c
// worldgen.c (simplified)

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

pattern 16 รายการ, index ที่ seed โดยพิกัด chunk. มันให้กริดที่ซ้ำกันแต่ดูสอดคล้องทางสายตา. 4 บรรทัดของโค้ดเพื่อแทนที่ระบบพารามิเตอร์ไบโอมทั้งหมดของ Minecraft vanilla

### getHeightAtFromHash: ประกอบ terrain

ฟังก์ชันหลักของการสร้างที่รวม 4 มุมที่ seed ด้วยไบโอม:

```c
// worldgen.c (simplified)

static uint8_t getHeightAtFromHash (int rx, int rz, short cx, short cz,
                                    uint32_t h, uint8_t biome) {
  // 4 corners extracted from hash, different seed per corner
  uint8_t h1 = biome_base[biome] + (h & 0x0F);
  uint8_t h2 = biome_base[biome] + ((h >> 4) & 0x0F);
  uint8_t h3 = biome_base[biome] + ((h >> 8) & 0x0F);
  uint8_t h4 = biome_base[biome] + ((h >> 12) & 0x0F);

  // Biome constraint: desert never underwater
  if (biome == BIOME_DESERT) {
    h1 = max(h1, SEA_LEVEL + 1);
    h2 = max(h2, SEA_LEVEL + 1);
    h3 = max(h3, SEA_LEVEL + 1);
    h4 = max(h4, SEA_LEVEL + 1);
  }

  // Interpolation from 4 corners
  return interpolate(h1, h2, h3, h4, rx, rz);
}
```

แต่ละไบโอมมี `biome_base` ที่เลื่อนความสูงอ้างอิง และ 4 มุมถูกสกัดจาก hash ด้วย offset ต่างกัน. ทะเลทรายบังคับค่าต่ำสุดให้สูงกว่าระดับน้ำทะเล -- ข้อจำกัดบรรทัดเดียวที่หลีกเลี่ยงน้ำโดยไม่ต้องคำนวณไบโอมเพิ่มเติม

### ต้นไม้และกระบองเพชร: การวางแบบความน่าจะเป็น

การสร้างพื้นผิวใช้ hash เดียวกับ chunk เพื่อตัดสินใจว่าจะปลูกที่ไหน:

```c
// worldgen.c (simplified)

static void genFoliage (uint8_t *chunk_data, short cx, short cz,
                        uint32_t hash, uint8_t biome) {
  if (biome == BIOME_DESERT) {
    // Cactus: one candidate per chunk, hash determines position
    int tx = (hash >> 8) & 7;
    int tz = (hash >> 12) & 7;
    int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
    if (chunk_data[ty * 64 + tz * 8 + tx] == B_sand)
      placeCactus(chunk_data, tx, ty + 1, tz);
  } else {
    // Trees: hash determines if and where to place them
    int tree_count = (hash & 3);  // 0-3 trees per chunk
    for (int i = 0; i < tree_count; i ++) {
      int tx = ((hash >> (4 + i * 4)) & 7);
      int tz = ((hash >> (6 + i * 4)) & 7);
      int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
      placeTree(chunk_data, tx, ty + 1, tz);
    }
  }
}
```

ต้นไม้ 0-3 ต่อ chunk สำหรับไบโอมสีเขียว, กระบองเพชรสูงสุด 1 สำหรับทะเลทราย. hash ของ chunk เป็นแหล่ง entropy เพียงแหล่งเดียว -- `& 7` สำหรับตำแหน่งใน chunk, `& 3` สำหรับตัวนับ. ทุกอย่าง deterministic, ไม่มีอะไรถูกเก็บ

### generateChunk: ประกอบทุกอย่างเข้าด้วยกัน

ฟังก์ชันที่รวบรวมทุกอย่างเพื่อสร้าง chunk เต็มขนาด 8×8×256 บล็อก:

```c
// worldgen.c (simplified)

void generateChunk (uint8_t *chunk, short cx, short cz) {
  uint32_t hash = getChunkHash(cx, cz);
  uint8_t biome = getChunkBiome(cx, cz);

  // For each column in the chunk (8×8 = 64)
  for (int x = 0; x < 8; x ++) {
    for (int z = 0; z < 8; z ++) {
      // Absolute world coordinates
      int wx = cx * 8 + x;
      int wz = cz * 8 + z;

      // Column height
      uint8_t height = getHeightAt(wx, wz);

      // Fill column from bottom up
      for (int y = 0; y < height; y ++) {
        uint8_t block = getTerrainBlock(wx, y, wz);
        chunk[y * 64 + z * 8 + x] = block;
      }
    }
  }

  // Add surface features (trees, cacti)
  genFoliage(chunk, cx, cz, hash, biome);
}
```

แค่นั้น. 3 loops ซ้อน: สำหรับแต่ละคอลัมน์, หาความสูง, เติมบล็อก, ไปคอลัมน์ถัดไป. ผลลัพธ์คือ `uint8_t[16384]` (8 × 8 × 256) แทน chunk ที่สมบูรณ์. ไม่มี caching, ไม่มี lazy loading, ไม่มีการบีบอัด -- chunk ถูกสร้างและส่งตรงไปยัง client

## ที่เก็บข้อมูล: arrays แบบคงที่ทุกที่

สถาปัตยกรรมหน่วยความจำของ Bareiron คือ C แบบ embedded อย่างเต็มรูปแบบ. ไม่มี malloc, ไม่มี hash maps, ไม่มี linked lists

ทุกอย่างอยู่ในอาร์เรย์ global ขนาดคงที่

### การเปลี่ยนแปลงของบล็อก

```c
// globals.h, lines 191-196

typedef struct {
  short x;      // 2 bytes -- limited to 32,000 blocks horizontally
  short z;      // 2 bytes
  uint8_t y;    // 1 byte -- limited to 256 blocks vertically
  uint8_t block; // 1 byte -- limited to 256 block types
} BlockChange;
```

20,000 รายการ, ประมาณ **25,000 การเปลี่ยนแปลง** -- เทียบเท่ากับ chunk ครึ่ง chunk ที่ถูกขุดจนหมด. ฟิลด์ `block` ที่ `0xFF` หมายถึงรายการว่าง. การค้นหาเป็น linear scan:

![เค้าโครงหน่วยความจำของอาร์เรย์บล็อก -- 6 bytes ต่อรายการ](/images/bareiron/memory-layout.jpg)

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

Adding a change is as straightforward as searching:
```

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

ตัวนับ, index, เขียน. ไม่มีการจัดเรียง, ไม่มีการ compact, ไม่มีการจัดการหน่วยความจำ. เมื่ออาร์เรย์เต็ม, การเปลี่ยนแปลงใหม่จะถูก ignored -- terrain กลับสู่สถานะที่สร้างไว้

คอมเมนต์ของผู้เขียนเกี่ยวกับขีดจำกัด 256 บล็อก: "ฉันยังไม่คิดจะ implement บันไดทองแดงที่ถูกขัดเงาเล็กน้อยในเร็ว ๆ นี้"

### ม็อบ: 8 bytes ต่อหัว

```c
// globals.h, lines 240-251 (pragma pack(push, 1) to eliminate padding)

typedef struct {
  uint8_t type;   // 25=chicken, 28=cow, 95=pig, 106=sheep, 145=zombie
  short x;
  uint8_t y;      // if health=0, Y becomes a timer before removal
  short z;
  uint8_t data;   // bits 0-4: health, bit 5: sheep sheared, bits 6-7: panic timer
} MobData;
```

8 bytes. สูงสุด 16 ตำแหน่ง. ไม่มีการจัด alignment, ไม่มี padding. byte `data` เป็น bitfield ทำเอง: 5 bits สำหรับ HP, 1 bit สำหรับถูกตัดขน, 2 bits สำหรับ panic timer. และเมื่อม็อบตาย, ฟิลด์ Y กลายเป็น timer ก่อนถูกลบ. การใช้หน่วยความจำซ้ำในระดับ bit

### ผู้เล่น: แพ็คแน่น

ข้อมูลผู้เล่นใช้ `#pragma pack(push, 1)` เช่นกัน -- พิกัดเป็น `short` + `uint8_t`, ช่อง inventory เป็นอาร์เรย์คงที่ของ `uint16_t` + `uint8_t`, และฟิลด์ `flags` เข้ารหัสทั้ง attack cooldown, สถานะ spawn, sneak, sprint, eat, load, movement cooldown, และ craft lock ทุกอย่างอยู่ใน bits แต่ละตัว

## ลูปหลัก: while(true) และ non-blocking

เซิร์ฟเวอร์ทั้งหมดรันบนลูปเดียว, หนึ่งเธรด, ไม่มี event library

```c
// main.c, lines 594-720

while (true) {
  task_yield();  // let the watchdog breathe on ESP32

  // Accept new connection (non-blocking)
  for (int i = 0; i < MAX_PLAYERS; i ++) {
    if (clients[i] != -1) continue;
    clients[i] = accept(server_fd, ...);
    if (clients[i] != -1) client_count ++;
    break;
  }

  // Server tick if time has elapsed
  if (get_program_time() - last_tick_time > TIME_BETWEEN_TICKS) {
    handleServerTick(time_since_last_tick);
    last_tick_time = get_program_time();
  }

  // Round-robin: one client, one packet per iteration
  client_index = (client_index + 1) % MAX_PLAYERS;
  if (clients[client_index] == -1) continue;

  // Read packet header: length + ID
  recv(client_fd, &recv_buffer, 2, MSG_PEEK);
  int length = readVarInt(client_fd);
  int packet_id = readVarInt(client_fd);
  handlePacket(client_fd, length - sizeVarInt(packet_id), packet_id, state);
}
```

client เดียวถูกจัดการต่อ iteration ของลูป และอ่านครั้งละหนึ่ง packet. `task_yield()` ที่ต้นลูปช่วยให้ FreeRTOS idle task หายใจบน ESP32 -- ถ้าไม่มี, watchdog timer จะรีเซ็ตชิป

การ dispatch packets เป็น switch ขนาดใหญ่ **400 บรรทัด**:

```c
// main.c, lines 68-497

void handlePacket (int client_fd, int length, int packet_id, int state) {
  switch (packet_id) {
    case 0x00:  // Handshake / Status / Login depending on state
    case 0x01:  // Status ping
    case 0x02:  // Plugin message
    case 0x03:  // Login/configuration acknowledgment
    case 0x08:  // Chat
    case 0x0B:  // Client status (respawn)
    case 0x11:  // Click container (handles chests)
    case 0x19:  // Interact entity
    case 0x1D..0x20:  // Movement packets (biggest case)
    case 0x28:  // Player action (dig/place)
    // ... 40+ cases
  }
}
```

ไม่มี jump table แบบไดนามิก, ไม่มี vtable, ไม่มี map. switch ถูก compile เป็น jump table แบบ static. เหมาะสำหรับ embedded

case `0x1D-0x20` ใหญ่ที่สุด -- จัดการ position updates, fall damage, การข้ามขอบเขต chunk, mob spawn, chunk generation, และความหิว. ทุกอย่างใน fall-through อันใหญ่เดียว

![โค้ดของเซิร์ฟเวอร์ Bareiron -- C 6800 บรรทัด](/images/bareiron/code-shot.jpg)

## Server tick และ AI ของม็อบ

ฟังก์ชัน `handleServerTick` ถูกเรียกทุก 50 ms (20 TPS). มันจัดการโลกในขณะที่ลูปหลักจัดการผู้เล่น:

```c
// main.c (simplified)

void handleServerTick (uint32_t delta) {
  // Update each mob
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type == 0 || mobs[i].data == 0) continue;  // dead or empty

    MobData *mob = &mobs[i];
    int px, pz;
    getNearestPlayer(mob->x, mob->z, &px, &pz);

    if (mob->type == MOB_ZOMBIE) {
      // Hostile: walks toward nearest player
      if (px < mob->x) mob->x --;
      else if (px > mob->x) mob->x ++;
      if (pz < mob->z) mob->z --;
      else if (pz > mob->z) mob->z ++;
      // Contact damage at 2 blocks
      if (abs(px - mob->x) <= 2 && abs(pz - mob->z) <= 2)
        damagePlayer(getNearestPlayerId(mob->x, mob->z), 3);
    } else {
      // Passive: 8 random directions
      uint8_t dir = getMobDir(mob);
      mob->x += dir_lookup[dir][0];
      mob->z += dir_lookup[dir][1];
      // Direction change every ~40 ticks
      if (mob->data >> 6 < 1) setMobDir(mob, rand() & 7);
      mob->data = (mob->data & 0x3F) | ((mob->data - 0x40) & 0xC0);
    }

    // Wake up chunks around the mob
    setChunkGenerated(mob->x / 8, mob->z / 8);
  }
}
```

AI ของม็อบศัตรูคือการเปรียบเทียบพิกัด. ตามตัวอักษร `if (px < x) x--`. ไม่มี pathfinding, ไม่มี A*, ไม่มี obstacle avoidance. ซอมบี้ปรับ X และ Z แยกกันเข้าหาผู้เล่น -- มันเดินทะลุกำแพงถ้ามี

contact damage อยู่ที่ 3 หัวใจ/วินาที. p2r3 ตั้งให้สูงเพราะการไม่มี pathfinding ทำให้ซอมบี้หลอกง่าย

สูตรเกราะเป็นแบบก่อน combat update -- ง่ายที่สุดเท่าที่จะเป็นไปได้:

```c
// main.c (simplified)

static uint8_t applyArmor (uint8_t damage, uint16_t armor_value) {
  // Pre-1.9 formula: linear reduction
  // Each armor point = 4% reduction, max 80%
  uint8_t reduction = (armor_value * 4);
  if (reduction > 80) reduction = 80;
  return damage * (100 - reduction) / 100;
}
```

Full diamond = ลด 80%. ซอมบี้ตี 3 หัวใจกลายเป็น 0.6 หัวใจ. p2r3 เลือกสูตรเก่าเพราะคำนวณแค่ 2 operations -- ไม่มี thresholds, ไม่มี curves, แค่เปอร์เซ็นต์เชิงเส้น

ม็อบ passive: 8 ทิศทางใน lookup table, เปลี่ยนทิศทุก ~40 ticks. ฟิลด์ `data` เข้ารหัสทิศทางปัจจุบันใน 2 bits บน และ timer การเปลี่ยนทิศทางใน 6 bits ที่เหลือ

![ม็อบใน Bareiron -- ซอมบี้, หมู, แกะ](/images/bareiron/mobs.jpg)

### การเกิดใหม่ของม็อบ

ม็อบไม่ได้เกิดด้วย random ticks. พวกมันปรากฏเมื่อ server tick พบขอบเขต chunk ใหม่:

```c
if (player crossed chunk boundary) {
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type != 0) continue;
    spawnMob(&mobs[i], new_chunk_coords, getChunkHash(cx, cz));
    break;
  }
}
```

RNG เดียวกับ terrain, seed chunk เดียวกัน. ถ้าตำแหน่งม็อบว่าง, การเกิดเป็น deterministic

## คราฟต์: ไม่มี matrices, มี if/else

```c
// crafting.c, lines 9-347 (simplified)

void getCraftingOutput (PlayerData *player, uint8_t *count, uint16_t *item) {
  // If flag 0x80 is set, the craft buffer is used by a chest
  if (player->flags & 0x80) { *count = 0; *item = 0; return; }

  // Count slots, find first item, check identity
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
    case 1:  /* planks, ingots... */
    case 2:  /* sticks, shears, torches */
    case 3:  /* shovels, swords, slabs */
    case 4:  /* crafting table, boots */
    case 5:  /* pickaxes, axes, helmets */
    case 7:  /* leggings, composters */
    case 8:  /* furnace, chest, chestplate */
    case 9:  /* full blocks (iron, gold, etc.) */
  }
}
```

check แรก: ถ้า flag `0x80` ถูกตั้ง, buffer คราฟต์ถูก reuse เป็น pointer ของหีบ. ไม่สามารถคราฟต์ได้

จากนั้นนับช่องที่เติม, จด item แรก, ตรวจสอบความเหมือน. แค่เท่านี้ก็ match เตาเผาใน 4 checks:

```c
if (count == 8 && first == cobblestone && all_identical && center_empty)
    return furnace;
```

สำหรับรูปทรงที่ซับซ้อน, มันใช้ index ของ item แรกและตรวจสอบตำแหน่งสัมพัทธ์. สูตรคราฟต์ใช้ฟังก์ชัน matching เดียวกัน -- วัสดุกำหนดผลลัพธ์

![อินเทอร์เฟซคราฟต์และหีบใน Bareiron](/images/bareiron/crafting.jpg)

## หีบ: แฮกของจริง

แฮกหน่วยความจำที่ทุกคนพูดถึง, ในโค้ดจริง:

```c
// procedures.c, lines 1262-1293

if (target == B_chest) {
  // Find the chest entry in the block array
  uint8_t *storage_ptr = NULL;
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block != B_chest) continue;
    if (block_changes[i].x != x || block_changes[i].y != y || block_changes[i].z != z)
      continue;
    storage_ptr = (uint8_t *)(&block_changes[i + 1]);  // point after the chest block
    break;
  }
  if (storage_ptr == NULL) return;

  // Terrible memory hack!!
  // Copy the POINTER into the player's craft items array
  memcpy(player->craft_items, &storage_ptr, sizeof(storage_ptr));
  player->flags |= 0x80;  // lock crafting

  // Send chest interface to client
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

และคอมเมนต์ในโค้ด: `// Terrible memory hack!!1!`

มันคือสิ่งนั้นจริง ๆ. มันเอาที่อยู่หน่วยความจำของรายการถัดไปใน `block_changes[]` คัดลอกไปยัง `player->craft_items` (ซึ่งเป็น `uint16_t[9]` ดังนั้น 18 bytes -- พอที่จะเก็บ pointer 32 บิต) และตั้ง flag เพื่อไม่ให้ใครพยายามคราฟต์ในช่วงเวลานั้น

ในทุกคลิกใน inventory ของหีบ:

```c
// packets.c, lines 620-638

uint8_t *storage_ptr;
memcpy(&storage_ptr, player->craft_items, sizeof(storage_ptr));
// storage_ptr now points to the chest data
uint16_t *p_item = (uint16_t *)(storage_ptr + (slot - 41) * 3);
uint8_t *p_count = storage_ptr + (slot - 41) * 3 + 2;
```

มันดึง pointer จาก buffer คราฟต์ และเข้าถึงช่องด้วย offset. ข้อมูลหีบถูกเก็บที่ 3 bytes ต่อช่อง (2 สำหรับ ID, 1 สำหรับจำนวน), วางติดกันในอาร์เรย์บล็อก

![ข้อมูลหีบที่เก็บในอาร์เรย์บล็อก -- แฮกหน่วยความจำ](/images/bareiron/chest-hack.jpg)

## ความหิว: 5 บรรทัดแห่งอัจฉริยภาพ

```c
// main.c, lines 293-305

// Players send movement packets at ~20/sec when moving,
// much less when standing still. We correlate this
// with activity to simulate hunger for free.
if (player->saturation == 0) {
  if (player->hunger > 0) player->hunger--;
  player->saturation = 200;
  sc_setHealth(client_fd, player->health, player->hunger, player->saturation);
} else if (player->flags & 0x08) {  // sprinting
  player->saturation -= 1;
}
```

มันคือสิ่งนั้นจริง ๆ. 5 บรรทัด. ทุก packet การเคลื่อนไหวลด saturation. เมื่อ saturation ถึงศูนย์, ความหิวลดลงและ saturation ถูกรีเซ็ต. การ sprint (flag `0x08`) ทำให้ drain เป็นสองเท่า

ไม่มี timer, ไม่มีหน่วยความจำที่จัดสรร, ไม่มีการคำนวณเฉพาะ. แค่ตัวนับที่ลดลงบน packets ที่มีอยู่แล้ว

### Fall damage

ระบบ damage ที่ง่ายที่สุดในโปรเจกต์:

```c
// When player leaves the ground, store their Y
// When they touch the ground again, subtract
damage = last_y_on_ground - current_y;
```

การลบครั้งเดียว.

## ขุดและวางบล็อก

เมื่อคุณคลิกที่บล็อก, packet `0x28` (Player Action) ตกลงใน switch. handler ต้องระบุว่าบล็อกอะไรอยู่ที่ตำแหน่งนั้น, เอาออก, และใส่ item ใน inventory:

```c
// main.c, case 0x28 (simplified)

void handlePlayerAction (int client_fd, uint8_t action, int x, uint8_t y, int z) {
  switch (action) {
    case START_DESTROY_BLOCK: {
      // Determine block type at clicked position
      uint8_t block = getBlockAt(x, y, z);

      if (block == B_chest) {
        openChest(client_fd, x, y, z);
        break;
      }

      // Add to block_changes
      addBlockChange(x, z, y, 0);  // 0 = air

      // Give item to player (trust the client)
      addItemToPlayer(client_fd, block_to_item(block), 1);

      // Send update to client
      sc_blockChange(client_fd, x, y, z, 0);
      sc_ackBlockChange(client_fd, x, y, z, 0);
      break;
    }
    case PLACE_BLOCK: {
      // Read block type from player's hand
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

`getBlockAt` รวมการสร้าง terrain และการเปลี่ยนแปลงของผู้เล่น:

```c
uint8_t getBlockAt (int x, uint8_t y, int z) {
  // First check player changes
  uint8_t change = getBlockChange(x, y, z);
  if (change != 0xFF) return change;

  // Otherwise, read from generated terrain
  return getTerrainBlock(x, y, z);
}
```

การเปลี่ยนแปลงได้ Priority, fallback เป็น terrain. ไม่มีการถกเถียง, ไม่มี cache, ไม่มี overhead. เบื้องหลัง `getTerrainBlock` คือ `getHeightAt` + ชั้น stone/dirt/grass/coal

### เตาเผาแบบทันที

ที่ตลกที่สุด: เตาเผาไม่มี existence ในฐานะ entity. ถ้าคุณใส่ cobblestone ในช่อง "ปรุง" และ coal ใน "เชื้อเพลิง", ผลลัพธ์จะปรากฏทันที. ไม่มี timer, ไม่มี chunk ticking. มันแค่ช่อง inventory ที่ว่างเปล่าเมื่อคุณใส่อันที่ถูกต้อง

![เตาเผาแบบทันที -- วางวัตถุดิบ, ผลลัพธ์ทันที](/images/bareiron/furnace.jpg)

## ลูป ESP32: เซิร์ฟเวอร์ MC ใน stack 4 KB

```c
// main.c, lines 732-779

#ifdef ESP_PLATFORM

void bareiron_main (void *pvParameters) {
  main();
  vTaskDelete(NULL);
}

static void wifi_event_handler (...) {
  if (/* connected */) {
    xTaskCreate(bareiron_main, "bareiron", 4096, NULL, 5, NULL);
  }
}

void app_main () {
  esp_timer_early_init();
  wifi_init();
  // The rest is handled by the event handler
}
#endif
```

เซิร์ฟเวอร์ทั้งหมดรันใน task FreeRTOS ด้วย **stack 4096 bytes**. เท่านั้น. main thread หลักแค่ initialize WiFi และรอการเชื่อมต่อ. เมื่อเชื่อมต่อ, มัน spawn `bareiron_main` ที่เรียก `main()` มาตรฐาน

โค้ดเฉพาะ ESP32 ทั้งหมดถูกป้องกันด้วย `#ifdef ESP_PLATFORM`. บน PC, ทั้งหมด compile เป็นโค้ด POSIX มาตรฐาน

## สิ่งที่ถูก sacrifice

เพื่อให้ทุกอย่างอยู่ได้, มีฟีเจอร์ vanilla ที่ไม่มี:

- **ไม่มีการบีบอัดเครือข่าย** -- zlib แพงเกินไป. เซิร์ฟเวอร์สร้าง chunks เร็ว, แต่การส่งคือ bottleneck
- **ไม่มี random ticks** -- ต้นไม้โตด้วย bone meal หรือไม่ก็ไม่โต. ม็อบเกิดที่ขอบเขต chunk
- **ไม่มี item entities** -- บล็อกที่ขุดไปที่ inventory โดยตรง. แอนิเมชัน purely visual
- **ไม่มีการตรวจสอบ inventory** -- trust the client. เพชร 64 อัน? OK. ขุด chunk หมดใน 1 วินาที? OK. ใช้ระหว่างคนที่ไว้ใจกัน
- **ไม่มี server-side light** -- คบเพลิงถูกส่งหลังจากทุกอย่างอื่น, client คำนวณ
- **ไม่มีของเหลวแบบค่อยเป็นค่อยไป** -- สถานะสุดท้ายทันที

## ผลลัพธ์สุดท้าย

Ryzen 5 3600: ~0.5 ms ต่อ chunk
ESP32-C3 ราคา 1$: ~200 ms ต่อ chunk. เล่นได้

![Benchmark การสร้าง chunk -- Ryzen vs ESP32](/images/bareiron/performance.jpg)

3+ ผู้เล่น: กระตุก. เทียบเท่า 2b2t ในชั่วโมงเร่งด่วน ตามที่ผู้เขียนบอก

![ผู้เล่นหลายคนเชื่อมต่อกับเซิร์ฟเวอร์ Bareiron เดียวกัน](/images/bareiron/multiplayer.jpg)

## ปรัชญา

p2r3: "ฉันแค่ชอบความคิดที่ว่าชิปจิ๋วราคา 1 ดอลลาร์ที่กินไฟ 0.5 วัตต์นี้สามารถรันอะไรที่ล้ำหน้าเท่า Minecraft ได้ Science isn't about 'why', it's about 'why not'."

ทุกบรรทัดคือ tradeoff:
- Perlin noise → interpolation: ดูไม่สวยเท่า, เร็วขึ้น 200x, ไม่ใช้หน่วยความจำ
- คราฟต์ matrices → matching แบบ hardcode: โค้ดน่าเกลียด, ไม่ใช้ byte เลย
- zlib → ไม่มี: connection ห่วย = ตาย, แต่เล่นได้
- Validation → trust: ไม่มีความปลอดภัย, ไม่มีการคำนวณ

ทุกฟีเจอร์ที่หายไปทำให้อีกฟีเจอร์หนึ่งมีอยู่ได้ภายใต้ข้อจำกัดของฮาร์ดแวร์

**3 สิ่งที่ควรจำ:**

1. **Interpolation + RNG** -- 4 จุดที่ seed, terrain ไม่จำกัด, ไม่มีการเก็บ, query โดยไม่ต้องสร้าง chunk ใหม่, สร้าง 200 ms. นี่คือ move อัจฉริยะที่ทำให้ทุกอย่างอื่นเป็นไปได้
2. **ทุกฟีเจอร์มีต้นทุน** -- ไม่มีการบีบอัด, ไม่มี random ticks, ไม่มีการตรวจสอบ. นี่ไม่ใช่การลืม, แต่มันคือสิ่งที่ทำให้ทุกอย่างอยู่ใน 520 KB
3. **แฮกที่ดูน่าเกลียดคือสิ่งที่ฉลาดที่สุด** -- หีบในอาร์เรย์บล็อกผ่าน memcpy, ความหิวผ่าน movement packets, เตาเผาแบบทันที. วิธีที่สะอาดคงแพงเกินไป

ถ้าคุณสนใจโปรเจกต์นี้, ทุกอย่างอยู่บน [GitHub ในลิขสิทธิ์ GPLv3](https://github.com/p2r3/bareiron/). มันเป็น C ที่สกปรกมาก และผมไม่ค่อยสนุกกับการอ่านซอร์สโค้ดเท่านี้มาก่อน xD
