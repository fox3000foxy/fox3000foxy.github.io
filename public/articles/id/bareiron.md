---
title: Bareiron -- server Minecraft yang berjalan di mikrokontroler $1
description: 6800 baris C, nol malloc, Perlin noise diganti dengan bilinear
  interpolation, biome di tile map, dan semuanya di chip $1.
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
author_sig: "yOzYA3/G0yMWJAvWiVaggaBv4ryfJD4o/GUa6K6IwvUD7QsQ1uMWJFBrnU3+Zf3d64J+dH2X1leKqW8Y7lU8rg=="
---

## Pendahuluan

Pernah kepikiran apakah kita bisa menjalankan server Minecraft di mikrokontroler $1?

Aku iya. Dan jawabannya adalah iya. Secara harfiah.

Ada proyek bernama [Bareiron](https://github.com/p2r3/bareiron/), buatan p2r3, dan ini mungkin salah satu proyek paling menarik yang pernah kulihat di dunia Minecraft dalam beberapa tahun terakhir. Kita bicara soal binary yang muat dalam **300 kilobyte**, **6800 baris C**, nol dependensi eksternal, tanpa malloc, tanpa threading, dan berjalan di **ESP32 seharga $1**.

![ESP32-C3, mikrokontroler yang menjalankan server](/images/bareiron/esp32-board.jpg)

Generasi terrain tak terbatas. Biome. Goa. Craft. Menambang. Mob. Rasa lapar. Peti. Semua yang kau harapkan dari server survival.

Di chip yang mengonsumsi **0.5 Watt** dan memiliki clock **160 MHz**.

Sebagai gambaran: server Minecraft vanilla butuh beberapa gigs RAM. ESP32-C3 cuma punya **520 KB SRAM** (400 tersedia setelah boot). Prosesor 20 tahun lalu sudah berjalan di gigahertz -- yang ini mentok di 160 MHz. Faktor perbedaan daya murninya sekitar **20.000**.

p2r3 tidak menulis server Minecraft di C, dia menciptakan ulang setiap bata server agar muat dalam keterbatasan itu. Mari kita lihat caranya, dengan membuka kode sumber.

![Thumbnail video presentasi Bareiron oleh p2r3](/images/bareiron/title-card.jpg)

## Otak proyek: generasi terrain tanpa memori

Masalah terbesar saat kamu ingin membuat server MC embedded adalah generasi terrain.

Di Minecraft vanilla, dunia dibuat dengan **Perlin noise**: beberapa lapisan bertumpuk (oktaf), 6 parameter biomik (suhu, kelembapan, kontinentalitas, erosi, weirdness, kedalaman), dan seluruh sistem caching agar tidak perlu menghitung ulang semuanya setiap saat.

Hasilnya luar biasa. Tapi mahal secara komputasi, dan butuh RAM untuk menyimpan chunk yang sudah dibuat.

Pendekatan Bareiron sangat berbeda. Alih-alih menumpuk noise, dia menggunakan **bilinear interpolation** pada 4 titik yang dihasilkan oleh **RNG deterministik**.

Kamu tahu saat kamu memperbesar gambar kecil yang pikselasi dan pinggirannya jadi kabur? Persis seperti itu.

```c
// worldgen.c, baris 117-171 (disederhanakan)

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

Interpolasi bilinear standar: 4 sudut, bobot berdasarkan posisi, satu `uint8_t` sebagai output. CHUNK_SIZE adalah 8, jadi dilakukan dengan perkalian integer, tanpa float.

p2r3 menunjukkannya langkah demi langkah di video: pertama 4 sudut chunk, masing-masing dengan tinggi yang di-seed oleh RNG.

![4 sudut chunk, masing-masing di-seed oleh RNG deterministik](/images/bareiron/gen-four-corners.jpg)

Kemudian interpolasi antara 4 titik ini menciptakan permukaan yang kontinu.

![Penerapan bilinear interpolation antara 4 sudut](/images/bareiron/gen-interpolate.jpg)

Dan dengan mengulang pola di semua chunk yang bertetangga, kita mendapatkan terrain yang membentang tanpa batas.

![Hasil akhir: terrain tidak beraturan yang kontinu](/images/bareiron/gen-result.jpg)

### RNG deterministik

Kunci yang membuat semua ini mungkin adalah seeding. Setiap chunk punya 4 sudut, dan setiap sudut butuh nilai pseudo-acak yang unik namun reprodusibel.

```c
// worldgen.c, baris 13-22

uint32_t getChunkHash (short x, short z) {
  uint8_t buf[8];
  memcpy(buf, &x, 2);          // 16 bit koordinat X
  memcpy(buf + 2, &z, 2);      // 16 bit koordinat Z
  memcpy(buf + 4, &world_seed, 4);  // 32 bit seed global
  return splitmix64(*((uint64_t *)buf));  // hash
}
```

Dia mem-packing 16 bit X, 16 bit Z, dan 32 bit seed, ke dalam buffer 8 byte, dan memasukkan semuanya ke `splitmix64`. Hasilnya: nilai deterministik unik untuk setiap posisi, berdasarkan seed dunia.

Kau lihat kekuatan dari ini? Server tidak perlu menyimpan terrain. Dia menghitung ulang dengan cepat saat pemain tiba di area baru, dan hasilnya persis sama setiap saat.

`splitmix64` yang digunakan adalah PRNG super-cepat yang dirancang untuk hash 64 bit:

```c
// worldgen.c (disederhanakan)

static uint32_t splitmix64 (uint64_t state) {
  state += 0x9E3779B97F4A7C15ull;
  uint64_t z = state;
  z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ull;
  z = (z ^ (z >> 27)) * 0x94D049BB133111EBull;
  return (z ^ (z >> 31)) >> 32;
}
```

3 operasi: penambahan, xor/shift, perkalian, xor/shift, perkalian, xor/shift. Tanpa lookup table, tanpa loop. Dia mengambil buffer 8 byte (X + Z + seed), memprosesnya sebagai integer 64 bit, dan mengembalikan hash 32 bit. Ini deterministik, cepat, dan muat dalam 5 baris.

### Kenapa ini bukan Perlin noise

p2r3 sendiri mengatakannya di video: "semakin banyak digit angka acak yang kau tambahkan, semakin teratur terrainnya, seperti semakin banyak lemparan koin semakin mendekati 50/50". Dalam praktiknya, ini adalah jumlah bit hash yang dia kombinasikan:

```c
// worldgen.c, baris 51-115

// Untuk biome plains: 4 faktor dikombinasikan → terrain teratur
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// Untuk snowy plains: 2 faktor → lebih berbukit
h = (hash % 5) + ((hash >> 4) % 5);
```

Setiap biome memilih berapa banyak ekstraksi bit yang dikombinasikan. Semakin banyak, semakin stabil distribusinya -- seperti semakin banyak lemparan koin yang mendekati 50/50. Semakin sedikit, semakin kuat variasi lokalnya.

![Terrain tidak beraturan -- sedikit faktor, variasi kuat](/images/bareiron/terrain-irregular.jpg)

Dengan hanya 2 faktor, snowy plains menghasilkan terrain berbukit, hampir bergunung. Puncak dan lembah sering terjadi.

![Terrain teratur -- faktor banyak, permukaan halus](/images/bareiron/terrain-regular.jpg)

Dengan 4 faktor, plains tetap datar dan bisa diprediksi. Distribusinya stabil.

Sebuah chunk dibuat dalam **200 ms** di ESP32 -- dibandingkan dengan waktu yang tidak terukur di hardware yang sama dengan Perlin noise karena sangat mahal.

### Detail yang mematikan: query blok tanpa membuat seluruh chunk

Kamu bermain, kamu menambang blok. Server harus tahu item apa yang harus diberikan. Secara naif, perlu membuat seluruh chunk untuk itu.

Dengan bilinear interpolation, kamu bisa query **titik mana pun** di bidang langsung dari koordinat. Sudut chunk didapat dari posisi pemain, interpolasi memberimu tinggi di offset mana pun. Segenggam operasi matematika, tanpa generasi chunk.

p2r3: "yang aku inginkan adalah fungsi ajaib yang bisa memberitahuku blok apa yang ada di koordinat tertentu, tanpa mengakses memori atau menghitung peta noise yang mahal". Persis apa yang dia lakukan.

Berikut cara tinggi menjadi blok konkret:

```c
// worldgen.c (disederhanakan)

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

5 kondisi. Satu lapisan grass/dirt/stone/deepslate/bedrock. Blok permukaan tergantung biome melalui `biome_top[]` -- grass untuk plains, sand untuk desert. Tanpa loop, tanpa switch, kaskade if yang jatuh ke lapisan yang tepat.

### Goa, mirror paling malas

```c
tinggi_goa = CAVE_BASE_DEPTH - (tinggi_permukaan - y);
```

Dia mirror tinggi permukaan di bawah tanah. Ini mirip dengan rongga besar deepslate. Nol komputasi, satu baris.

![Goa dihasilkan dari mirror terrain permukaan](/images/bareiron/cave-mirror.jpg)

![Diagram mirror terrain untuk menghasilkan goa](/images/bareiron/cave-diagram.jpg)

### Bijih, versi XOR

```c
kandidat = (chunk_x ^ col_x ^ col_z) % 100;
if (kandidat < 5 && y < 16) -> diamond
```

XOR koordinat menjamin satu kandidat per kolom. Tipe hanya tergantung pada ketinggian. Berlian disembunyikan di bawah titik terendah goa agar menambang tetap berguna.

### Biome di tile map

Setiap biome adalah pulau melingkar dalam grid, tipenya ditentukan oleh pola yang dihitung dari seed. Ter-grid, bisa diprediksi, dan gratis.

![Peta biome di tile map -- setiap pulau adalah biome berbeda](/images/bareiron/biome-tilemap.jpg)

Setiap biome memiliki kumpulan parameternya sendiri yang dienkode dalam array:

```c
// worldgen.c (disederhanakan)

static const uint8_t biome_base[] = {
  [BIOME_PLAINS]  = 48,   // tinggi dasar: 48
  [BIOME_DESERT]  = 52,   // sedikit lebih tinggi
  [BIOME_FOREST]  = 50,   // di antaranya
  [BIOME_TAIGA]   = 46,   // sedikit lebih rendah
  [BIOME_SNOWY]   = 40,   // yang terendah
};

static const uint8_t biome_top[] = {
  [BIOME_PLAINS]  = B_grass,
  [BIOME_DESERT]  = B_sand,
  [BIOME_FOREST]  = B_grass,
  [BIOME_TAIGA]   = B_grass,
  [BIOME_SNOWY]   = B_snow_block,
};

static const uint8_t biome_factors[] = {
  [BIOME_PLAINS]  = 4,   // 4 ekstraksi → sangat teratur
  [BIOME_DESERT]  = 3,   // 3 ekstraksi → moderat
  [BIOME_FOREST]  = 4,   // 4 ekstraksi → teratur, berbukit
  [BIOME_TAIGA]   = 3,   // 3 ekstraksi → moderat
  [BIOME_SNOWY]   = 2,   // 2 ekstraksi → sangat tidak beraturan
};
```

**Plains**: tinggi 48, 4 faktor → terrain sangat datar, rumput.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// Hasil: variasi maksimal ±4 blok
```

**Desert**: tinggi 52, 3 faktor, blok permukaan = pasir. Tidak pernah di bawah permukaan laut.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3);
// Hasil: variasi maksimal ±6 blok, di-clamp ke SEA_LEVEL+1
```

**Forest**: tinggi 50, 4 faktor seperti plains tapi dasar lebih tinggi → perbukitan berhutan.

**Taiga**: tinggi 46, 3 faktor → variasi moderat, terrain dingin.

**Snowy plains**: tinggi 40, hanya 2 faktor → yang paling tidak beraturan.

```c
h = (hash % 5) + ((hash >> 4) % 5);
// Hasil: variasi maksimal ±14 blok
```

Setiap biome dienkode dalam **3 array masing-masing 5 entri**: tinggi dasar, blok permukaan, jumlah faktor. Saat `getHeightAtFromHash` menerima biome, ia melihat array ini untuk menyesuaikan terrain. 15 byte data untuk menggantikan seluruh sistem biome Minecraft.

Detektor biome menggunakan seed untuk menentukan biome mana yang cocok dengan setiap chunk:

```c
// worldgen.c (disederhanakan)

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

Pola 16 entri, index di-seed oleh koordinat chunk. Ini memberikan grid yang repetitif namun koheren secara visual. 4 baris kode untuk menggantikan seluruh sistem parameter biomik Minecraft vanilla.

### getHeightAtFromHash: perakit terrain

Fungsi inti dari generasi menggabungkan 4 sudut yang di-seed berdasarkan biome:

```c
// worldgen.c (disederhanakan)

static uint8_t getHeightAtFromHash (int rx, int rz, short cx, short cz,
                                    uint32_t h, uint8_t biome) {
  // 4 sudut diekstrak dari hash, seed berbeda per sudut
  uint8_t h1 = biome_base[biome] + (h & 0x0F);
  uint8_t h2 = biome_base[biome] + ((h >> 4) & 0x0F);
  uint8_t h3 = biome_base[biome] + ((h >> 8) & 0x0F);
  uint8_t h4 = biome_base[biome] + ((h >> 12) & 0x0F);

  // Constraint biome: desert tidak pernah di bawah air
  if (biome == BIOME_DESERT) {
    h1 = max(h1, SEA_LEVEL + 1);
    h2 = max(h2, SEA_LEVEL + 1);
    h3 = max(h3, SEA_LEVEL + 1);
    h4 = max(h4, SEA_LEVEL + 1);
  }

  // Interpolasi dari 4 sudut
  return interpolate(h1, h2, h3, h4, rx, rz);
}
```

Setiap biome memiliki `biome_base` yang menggeser tinggi referensi, dan 4 sudut diekstrak dari hash dengan offset berbeda. Desert memaksa minimal di atas permukaan laut -- satu baris constraint yang menghindari air tanpa komputasi biomik tambahan.

### Pohon dan kaktus: penempatan probabilistik

Generasi permukaan menggunakan hash chunk yang sama untuk memutuskan di mana menanam:

```c
// worldgen.c (disederhanakan)

static void genFoliage (uint8_t *chunk_data, short cx, short cz,
                        uint32_t hash, uint8_t biome) {
  if (biome == BIOME_DESERT) {
    // Kaktus: satu kandidat per chunk, hash menentukan posisi
    int tx = (hash >> 8) & 7;
    int tz = (hash >> 12) & 7;
    int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
    if (chunk_data[ty * 64 + tz * 8 + tx] == B_sand)
      placeCactus(chunk_data, tx, ty + 1, tz);
  } else {
    // Pohon: hash menentukan apakah menempatkan dan di mana
    int tree_count = (hash & 3);  // 0-3 pohon per chunk
    for (int i = 0; i < tree_count; i ++) {
      int tx = ((hash >> (4 + i * 4)) & 7);
      int tz = ((hash >> (6 + i * 4)) & 7);
      int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
      placeTree(chunk_data, tx, ty + 1, tz);
    }
  }
}
```

0-3 pohon per chunk untuk biome hijau, maksimal 1 kaktus untuk desert. Hash chunk adalah satu-satunya sumber entropi -- `& 7` untuk posisi dalam chunk, `& 3` untuk penghitung. Semuanya deterministik, tidak ada yang disimpan.

### generateChunk: merakit semuanya

Fungsi yang menggabungkan semuanya untuk menghasilkan chunk lengkap 8×8×256 blok:

```c
// worldgen.c (disederhanakan)

void generateChunk (uint8_t *chunk, short cx, short cz) {
  uint32_t hash = getChunkHash(cx, cz);
  uint8_t biome = getChunkBiome(cx, cz);

  // Untuk setiap kolom chunk (8×8 = 64)
  for (int x = 0; x < 8; x ++) {
    for (int z = 0; z < 8; z ++) {
      // Koordinat dunia absolut
      int wx = cx * 8 + x;
      int wz = cz * 8 + z;

      // Tinggi kolom
      uint8_t height = getHeightAt(wx, wz);

      // Isi kolom dari bawah ke atas
      for (int y = 0; y < height; y ++) {
        uint8_t block = getTerrainBlock(wx, y, wz);
        chunk[y * 64 + z * 8 + x] = block;
      }
    }
  }

  // Tambahkan elemen permukaan (pohon, kaktus)
  genFoliage(chunk, cx, cz, hash, biome);
}
```

Itu saja. 3 loop bersarang: untuk setiap kolom, cari tinggi, isi blok, lanjut ke berikutnya. Outputnya adalah `uint8_t[16384]` (8 × 8 × 256) yang mewakili chunk lengkap. Tanpa caching, tanpa lazy loading, tanpa kompresi -- chunk dibuat dan dikirim langsung ke client.

## Penyimpanan: array statis di mana-mana

Arsitektur memori Bareiron adalah C embedded dalam segala kemegahannya. Tanpa malloc, tanpa hash map, tanpa linked list.

Semuanya dalam array global berukuran tetap.

### Perubahan blok

```c
// globals.h, baris 191-196

typedef struct {
  short x;      // 2 byte -- batas 32.000 blok horizontal
  short z;      // 2 byte
  uint8_t y;    // 1 byte -- batas 256 blok vertikal
  uint8_t block; // 1 byte -- batas 256 tipe blok
} BlockChange;
```

20.000 entri, sekitar **25.000 perubahan** -- setara dengan satu setengah chunk yang digali seluruhnya. Field `block` bernilai `0xFF` menandai entri bebas. Pencarian adalah scan linear:

![Layout memori array blok -- 6 byte per entri](/images/bareiron/memory-layout.jpg)

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

Menambahkan perubahan sama langsungnya dengan pencarian:

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

Sebuah counter, sebuah index, sebuah write. Tanpa sorting, tanpa kompaksi, tanpa manajemen memori. Saat array penuh, perubahan baru diabaikan -- terrain kembali ke keadaan awalnya.

Komentar penulis tentang batas 256 blok: "aku belum berencana mengimplementasikan tangga tembaga yang sedikit terpatinasi dipoles dalam waktu dekat."

### Mob: 8 byte per kepala

```c
// globals.h, baris 240-251 (pragma pack(push, 1) untuk menghilangkan padding)

typedef struct {
  uint8_t type;   // 25=chicken, 28=cow, 95=pig, 106=sheep, 145=zombie
  short x;
  uint8_t y;      // jika health=0, Y menjadi timer sebelum dihapus
  short z;
  uint8_t data;   // bit 0-4: health, bit 5: sheep sheared, bit 6-7: panic timer
} MobData;
```

8 byte. Maksimal 16 slot. Tanpa alignment, tanpa padding. Byte `data` adalah bitfield buatan sendiri: 5 bit health, 1 bit sheared, 2 bit panic timer. Dan saat mob mati, field Y berubah menjadi timer sebelum penghapusan. Penggunaan ulang memori di tingkat bit.

### Pemain: dikemas rapat

Data pemain juga menggunakan `#pragma pack(push, 1)` -- koordinat dalam `short` + `uint8_t`, inventory dalam array tetap `uint16_t` + `uint8_t`, dan field `flags` yang mengenkode cooldown serangan, status spawn, sneak, sprint, eat, load, movement cooldown, dan lock craft. Semuanya dalam bit individual.

## Loop utama: while(true) dan non-blocking

Seluruh server berjalan pada satu loop, satu thread, tanpa event library.

```c
// main.c, baris 594-720

while (true) {
  task_yield();  // memberi napas pada watchdog di ESP32

  // Menerima koneksi baru (non-blocking)
  for (int i = 0; i < MAX_PLAYERS; i ++) {
    if (clients[i] != -1) continue;
    clients[i] = accept(server_fd, ...);
    if (clients[i] != -1) client_count ++;
    break;
  }

  // Tick server jika waktu sudah berlalu
  if (get_program_time() - last_tick_time > TIME_BETWEEN_TICKS) {
    handleServerTick(time_since_last_tick);
    last_tick_time = get_program_time();
  }

  // Round-robin: satu client, satu packet per iterasi
  client_index = (client_index + 1) % MAX_PLAYERS;
  if (clients[client_index] == -1) continue;

  // Baca header packet: length + ID
  recv(client_fd, &recv_buffer, 2, MSG_PEEK);
  int length = readVarInt(client_fd);
  int packet_id = readVarInt(client_fd);
  handlePacket(client_fd, length - sizeVarInt(packet_id), packet_id, state);
}
```

Hanya satu client yang diproses per iterasi loop, dan hanya satu packet yang dibaca setiap kali. `task_yield()` di awal loop memberi FreeRTOS idle task untuk bernapas di ESP32 -- tanpa ini, watchdog timer akan mereset chip.

Dispatch packet adalah switch raksasa sepanjang **400 baris**:

```c
// main.c, baris 68-497

void handlePacket (int client_fd, int length, int packet_id, int state) {
  switch (packet_id) {
    case 0x00:  // Handshake / Status / Login tergantung state
    case 0x01:  // Status ping
    case 0x02:  // Plugin message
    case 0x03:  // Login/configuration acknowledgment
    case 0x08:  // Chat
    case 0x0B:  // Client status (respawn)
    case 0x11:  // Click container (menangani peti)
    case 0x19:  // Interact entity
    case 0x1D..0x20:  // Movement packets (kasus terbesar)
    case 0x28:  // Player action (dig/place)
    // ... 40+ kasus
  }
}
```

Tanpa jump table dinamis, tanpa vtable, tanpa map. Switch mengompilasi ke jump table statis. Sempurna untuk embedded.

Kasus `0x1D-0x20` adalah yang terbesar -- menangani update posisi, damage jatuh, perlintasan batas chunk, spawn mob, generasi chunk, DAN rasa lapar. Semuanya dalam satu fall-through besar.

![Kode server Bareiron -- 6800 baris C](/images/bareiron/code-shot.jpg)

## Tick server dan AI mob

Fungsi `handleServerTick` dipanggil setiap 50 ms (20 TPS). Ia menangani dunia sementara loop utama mengurus pemain:

```c
// main.c (disederhanakan)

void handleServerTick (uint32_t delta) {
  // Update setiap mob
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type == 0 || mobs[i].data == 0) continue;  // mati atau kosong

    MobData *mob = &mobs[i];
    int px, pz;
    getNearestPlayer(mob->x, mob->z, &px, &pz);

    if (mob->type == MOB_ZOMBIE) {
      // Hostile: berjalan menuju pemain terdekat
      if (px < mob->x) mob->x --;
      else if (px > mob->x) mob->x ++;
      if (pz < mob->z) mob->z --;
      else if (pz > mob->z) mob->z ++;
      // Damage kontak pada 2 blok
      if (abs(px - mob->x) <= 2 && abs(pz - mob->z) <= 2)
        damagePlayer(getNearestPlayerId(mob->x, mob->z), 3);
    } else {
      // Pasif: 8 arah acak
      uint8_t dir = getMobDir(mob);
      mob->x += dir_lookup[dir][0];
      mob->z += dir_lookup[dir][1];
      // Ganti arah setiap ~40 tick
      if (mob->data >> 6 < 1) setMobDir(mob, rand() & 7);
      mob->data = (mob->data & 0x3F) | ((mob->data - 0x40) & 0xC0);
    }

    // Bangunkan chunk di sekitar mob
    setChunkGenerated(mob->x / 8, mob->z / 8);
  }
}
```

AI mob hostile adalah perbandingan koordinat. Secara harfiah `if (px < x) x--`. Tanpa pathfinding, tanpa A*, tanpa obstacle avoidance. Zombie menyesuaikan X dan Z secara independen menuju pemain -- dia menembus tembok jika ada.

Damage kontak adalah 3 heart/detik. p2r3 sengaja membuatnya tinggi karena tanpa pathfinding zombie mudah di-kite.

Formula armor adalah yang sebelum combat update -- yang paling sederhana:

```c
// main.c (disederhanakan)

static uint8_t applyArmor (uint8_t damage, uint16_t armor_value) {
  // Formula pra-1.9: reduksi linear
  // Setiap poin armor = 4% reduksi, maks 80%
  uint8_t reduction = (armor_value * 4);
  if (reduction > 80) reduction = 80;
  return damage * (100 - reduction) / 100;
}
```

Full diamond = 80% reduksi. Satu pukulan zombie 3 heart menjadi 0.6 heart. p2r3 memilih formula lama ini karena bisa dihitung dalam 2 operasi -- tanpa threshold, tanpa kurva, hanya persentase linear.

Mob pasif: 8 arah dalam lookup table, ganti arah setiap ~40 tick. Field `data` mengenkode arah saat ini di 2 bit tertinggi, dan timer ganti arah di 6 bit sisanya.

![Mob di Bareiron -- zombie, babi, domba](/images/bareiron/mobs.jpg)

### Respawn mob

Mob tidak spawn dengan random tick. Mereka muncul saat server tick menemukan batas chunk baru:

```c
if (player crossed chunk boundary) {
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type != 0) continue;
    spawnMob(&mobs[i], new_chunk_coords, getChunkHash(cx, cz));
    break;
  }
}
```

RNG yang sama dengan terrain, seed chunk yang sama. Jika slot mob kosong, spawn bersifat deterministik.

## Craft: tanpa matriks, pakai if/else

```c
// crafting.c, baris 9-347 (disederhanakan)

void getCraftingOutput (PlayerData *player, uint8_t *count, uint16_t *item) {
  // Jika flag 0x80 terangkat, buffer craft digunakan oleh peti
  if (player->flags & 0x80) { *count = 0; *item = 0; return; }

  // Hitung slot, temukan item pertama, periksa identitas
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
    case 1:  /* planks, ingot... */
    case 2:  /* stick, shears, torch */
    case 3:  /* shovel, sword, slab */
    case 4:  /* crafting table, boots */
    case 5:  /* pickaxe, axe, helmet */
    case 7:  /* leggings, composter */
    case 8:  /* furnace, chest, chestplate */
    case 9:  /* blok penuh (iron, gold, dll.) */
  }
}
```

Pertama cek: jika flag `0x80` terangkat, buffer craft didaur ulang menjadi pointer peti. Tidak bisa craft.

Kemudian, hitung slot yang terisi, catat item pertama, periksa identitas. Dengan itu saja, kamu bisa mencocokkan furnace dalam 4 cek:

```c
if (count == 8 && first == cobblestone && all_identical && center_empty)
    return furnace;
```

Untuk bentuk kompleks, dia menggunakan index item pertama dan memeriksa posisi relatif. Resep berbagi fungsi matching yang sama -- material menentukan hasil.

![Antarmuka craft dan peti di Bareiron](/images/bareiron/crafting.jpg)

## Peti: hack yang sesungguhnya

Hack memori yang semua orang bicarakan, dalam kode asli:

```c
// procedures.c, baris 1262-1293

if (target == B_chest) {
  // Cari entri peti di array blok
  uint8_t *storage_ptr = NULL;
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block != B_chest) continue;
    if (block_changes[i].x != x || block_changes[i].y != y || block_changes[i].z != z)
      continue;
    storage_ptr = (uint8_t *)(&block_changes[i + 1]);  // pointing setelah blok peti
    break;
  }
  if (storage_ptr == NULL) return;

  // Terrible memory hack!!
  // Salin POINTER ke array item craft pemain
  memcpy(player->craft_items, &storage_ptr, sizeof(storage_ptr));
  player->flags |= 0x80;  // lock craft

  // Kirim antarmuka peti ke client
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

Dan komentar di kode: `// Terrible memory hack!!1!`

Persis itu. Dia mengambil alamat memori entri berikutnya di `block_changes[]`, menyalinnya ke `player->craft_items` (yang berupa `uint16_t[9]`, jadi 18 byte -- cukup untuk menyimpan pointer 32 bit), dan mengangkat flag agar tidak ada yang mencoba craft selama ini.

Setiap klik di inventory peti:

```c
// packets.c, baris 620-638

uint8_t *storage_ptr;
memcpy(&storage_ptr, player->craft_items, sizeof(storage_ptr));
// storage_ptr sekarang menunjuk ke data peti
uint16_t *p_item = (uint16_t *)(storage_ptr + (slot - 41) * 3);
uint8_t *p_count = storage_ptr + (slot - 41) * 3 + 2;
```

Dia mengambil pointer dari buffer craft, dan mengakses slot dengan offset. Data peti disimpan dengan 3 byte per slot (2 untuk ID, 1 untuk jumlah), ditempel satu sama lain di array blok.

![Data peti disimpan di array blok -- hack memori](/images/bareiron/chest-hack.jpg)

## Rasa lapar: 5 baris jenius

```c
// main.c, baris 293-305

// Pemain mengirim packet movement ~20/detik saat bergerak,
// jauh lebih sedikit saat diam. Kita korelasikan ini
// dengan aktivitas untuk mensimulasikan rasa lapar secara gratis.
if (player->saturation == 0) {
  if (player->hunger > 0) player->hunger--;
  player->saturation = 200;
  sc_setHealth(client_fd, player->health, player->hunger, player->saturation);
} else if (player->flags & 0x08) {  // sprinting
  player->saturation -= 1;
}
}
```

Persis itu. 5 baris. Setiap packet movement mengurangi saturation. Saat saturation mencapai nol, hunger turun dan saturation di-reset. Sprint (flag `0x08`) menggandakan drain.

Nol timer, nol memori dialokasikan, nol compute khusus. Sebuah counter yang berkurang pada packet yang sudah ada.

### Damage jatuh

Sistem damage paling sederhana di proyek ini:

```c
// Saat pemain meninggalkan tanah, simpan Y-nya
// Saat dia menyentuh tanah lagi, kurangi
damage = last_y_on_ground - current_y;
```

Satu pengurangan.

## Menambang dan menempatkan blok

Saat kamu klik blok, packet `0x28` (Player Action) mendarat di switch. Handler harus menentukan blok apa yang ada di posisi itu, menghapusnya, dan menaruh item di inventory:

```c
// main.c, case 0x28 (disederhanakan)

void handlePlayerAction (int client_fd, uint8_t action, int x, uint8_t y, int z) {
  switch (action) {
    case START_DESTROY_BLOCK: {
      // Tentukan tipe blok di posisi yang diklik
      uint8_t block = getBlockAt(x, y, z);

      if (block == B_chest) {
        openChest(client_fd, x, y, z);
        break;
      }

      // Tambahkan ke block_changes
      addBlockChange(x, z, y, 0);  // 0 = air

      // Berikan item ke pemain (trust the client)
      addItemToPlayer(client_fd, block_to_item(block), 1);

      // Kirim update ke client
      sc_blockChange(client_fd, x, y, z, 0);
      sc_ackBlockChange(client_fd, x, y, z, 0);
      break;
    }
    case PLACE_BLOCK: {
      // Baca tipe blok dari tangan pemain
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

`getBlockAt` menggabungkan generasi terrain DAN perubahan pemain:

```c
uint8_t getBlockAt (int x, uint8_t y, int z) {
  // Pertama periksa perubahan pemain
  uint8_t change = getBlockChange(x, y, z);
  if (change != 0xFF) return change;

  // Jika tidak, baca dari terrain yang dihasilkan
  return getTerrainBlock(x, y, z);
}
```

Prioritas pada perubahan, fallback ke terrain. Nol debat, nol cache, nol overhead. `getTerrainBlock` di balik layar adalah `getHeightAt` + lapisan stone/dirt/grass/coal.

### Furnace instan

Yang paling lucu: furnace tidak ada sebagai entitas. Jika kamu menaruh cobblestone di slot "cooking" dan coal di "fuel", hasilnya muncul seketika. Tanpa timer, tanpa chunk ticking. Hanya slot inventory yang kosong saat kamu menaruh item yang tepat.

![Furnace instan -- taruh bahan, hasil langsung](/images/bareiron/furnace.jpg)

## Loop ESP32: server MC dalam 4 KB stack

```c
// main.c, baris 732-779

#ifdef ESP_PLATFORM

void bareiron_main (void *pvParameters) {
  main();
  vTaskDelete(NULL);
}

static void wifi_event_handler (...) {
  if (/* terhubung */) {
    xTaskCreate(bareiron_main, "bareiron", 4096, NULL, 5, NULL);
  }
}

void app_main () {
  esp_timer_early_init();
  wifi_init();
  // Sisanya ditangani oleh event handler
}
#endif
```

Seluruh server berjalan dalam satu task FreeRTOS dengan **4096 byte stack**. Itu saja. Thread main utama hanya menginisialisasi WiFi dan menunggu koneksi. Setelah terhubung, dia spawn `bareiron_main` yang memanggil `main()` standar.

Semua kode spesifik ESP32 dilindungi oleh `#ifdef ESP_PLATFORM`. Di PC, semua ini dikompilasi sebagai kode POSIX standar.

## Yang dikorbankan

Agar semua ini muat, ada fitur vanilla yang tidak ada:

- **Tidak ada kompresi jaringan** -- zlib terlalu mahal. Server menghasilkan chunk cepat, tapi mengirimkannya adalah bottleneck.
- **Tidak ada random ticks** -- pohon tumbuh dengan bone meal atau tidak. Mob spawn di batas chunk.
- **Tidak ada entity item** -- blok yang ditambang langsung masuk inventory. Animasi murni visual.
- **Tidak ada verifikasi inventory** -- trust the client. 64 diamond? OK. Chunk ditambang dalam 1 detik? OK. Gunakan antar orang yang saling percaya.
- **Tidak ada cahaya server** -- torch dikirim setelah semuanya, client yang menghitung.
- **Tidak ada fluida progresif** -- status akhir instan.

## Hasil akhir

Ryzen 5 3600: ~0.5 ms per chunk.
ESP32-C3 $1: ~200 ms per chunk. Playable.

![Benchmark generasi chunk -- Ryzen vs ESP32](/images/bareiron/performance.jpg)

3+ pemain: mulai lag. Sebanding dengan 2b2t di jam sibuk, kata penulis.

![Beberapa pemain terhubung ke server Bareiron yang sama](/images/bareiron/multiplayer.jpg)

## Filosofi

p2r3: "Aku cuma suka ide bahwa chip mungil seharga $1 yang mengonsumsi 0.5 Watt ini bisa menjalankan sesuatu secanggih Minecraft. Science isn't about 'why', it's about 'why not'."

Setiap baris adalah tradeoff:
- Perlin noise → interpolasi: kurang cantik, 200x lebih cepat, nol memori
- Matriks craft → matching hardcoded: kode kotor, nol byte
- zlib → tidak ada: koneksi jelek = mati, tapi playable
- Validasi → trust: nol keamanan, nol compute

Setiap fitur yang tidak ada memungkinkan fitur lain untuk eksis dalam batasan hardware.

**3 hal yang perlu diingat:**

1. **Interpolasi + RNG** -- 4 titik di-seed, terrain tak terbatas, nol penyimpanan, query tanpa regenerasi chunk, 200 ms generasi. Ini adalah langkah jenius yang membuat segalanya mungkin.
2. **Setiap fitur ada biayanya** -- Tanpa kompresi, tanpa random ticks, tanpa validasi. Ini bukan kelupaan, ini yang memungkinkan muat dalam 520 KB.
3. **Hack kotor adalah yang paling cerdas** -- Peti di array blok via memcpy, lapar via packet movement, furnace instan. Solusi bersih akan terlalu mahal.

Jika proyek ini menarik minatmu, semuanya ada di [GitHub dalam GPLv3](https://github.com/p2r3/bareiron/). Ini C yang sangat kotor, dan jarang sekali aku menikmati membaca kode sumber sebanyak ini xD
