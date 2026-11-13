---
title: Bareiron -- server Minecraft yang berjalan di mikrokontroler 1$
description: 6800 baris C, nol malloc, Perlin noise diganti bilinear
  interpolation, biome dalam tile map, dan semuanya di chip 1$.
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
author_sig: "wkcR6vN0lH8CUWuGTgiNR39jghnddC6Y+7NSCXyNgfuK+pZsv/GBY4i0VpjSyZPsU62zqA51YG8MEAd+3KJGPg=="
---

## Pendahuluan

Menjalankan server Minecraft di mikrokontroler satu dolar terdengar seperti lelucon.

Saya bertanya pada diri sendiri, dan jawabannya ya. Secara harfiah.

Ada proyek bernama [Bareiron](https://github.com/p2r3/bareiron/), karya p2r3, dan ini mungkin salah satu proyek paling menarik yang pernah saya lihat di dunia Minecraft beberapa tahun terakhir. Kita bicara biner yang muat dalam **300 kilobyte**, **6800 baris C**, nol dependensi eksternal, tanpa malloc, tanpa threading, dan berjalan di **ESP32 seharga 1 dolar**.

![ESP32-C3, mikrokontroler yang menjalankan server](/images/bareiron/esp32-board.jpg)

Pembangkitan medan tak terbatas. Biome. Gua. Crafting. Menambang. Mob. Lapar. Peti. Semua yang kamu harapkan dari server survival.

Di chip yang mengonsumsi **0.5 Watt** dan berclock **160 MHz**.

Sebagai gambaran : server Minecraft vanilla butuh beberapa giga RAM. ESP32-C3 itu **520 KB SRAM** (400 tersedia setelah boot). Prosesor 20 tahun lalu sudah berjalan dalam gigahertz -- yang ini mentok di 160 MHz. Faktor keduanya dalam kekuatan murni sekitar **20 000**.

p2r3 tidak menulis server Minecraft dalam C, ia menemukan ulang tiap bata server supaya muat dalam batasan ini. Kita akan melihat caranya, dengan membuka kode sumber.

![Thumbnail video presentasi Bareiron oleh p2r3](/images/bareiron/title-card.jpg)

## Otak proyek : pembangkitan medan tanpa memori

Masalah terbesar ketika kamu ingin membuat server MC tertanam adalah pembangkitan medan.

Di Minecraft vanilla, dunia dibangkitkan dengan **Perlin noise** : beberapa lapisan bertumpuk (oktaf), 6 parameter biomik (suhu, kelembapan, kontinentalitas, erosi, weirdness, kedalaman), dan seluruh sistem caching supaya tidak harus menghitung ulang semuanya setiap kali.

Hasilnya indah. Tapi mahal di komputasi, dan memakan RAM untuk menyimpan chunk yang dibangkitkan.

Pendekatan Bareiron sangat berbeda. Alih-alih menumpuk noise, ia memakai **interpolasi bilinear** pada 4 titik yang dibangkitkan oleh **RNG deterministik**.

Kamu tahu ketika kamu memperbesar gambar kecil berpiksel dan tepinya jadi buram? Tepat itulah.

```c
// worldgen.c, baris 117-171 (disederhanakan)

uint8_t interpolate (uint8_t a, uint8_t b, uint8_t c, uint8_t d, int x, int z) {
  uint16_t top    = a * (CHUNK_SIZE - x) + b * x;
  uint16_t bottom = c * (CHUNK_SIZE - x) + d * x;
  return (top * (CHUNK_SIZE - z) + bottom * z) / (CHUNK_SIZE * CHUNK_SIZE);
}

uint8_t getHeightAt (int x, int z) {
  int _x = floor(x / CHUNK_SIZE);  // koordinat chunk
  int _z = floor(z / CHUNK_SIZE);
  int rx = x % CHUNK_SIZE;          // offset di dalam chunk
  int rz = z % CHUNK_SIZE;
  uint32_t hash = getChunkHash(_x, _z);
  uint8_t biome = getChunkBiome(_x, _z);
  // interpolasi antara 4 sudut yang di seed hash + biome
  return getHeightAtFromHash(rx, rz, _x, _z, hash, biome);
}
```

Interpolasi bilinear standar : 4 sudut, bobot menurut posisi, satu `uint8_t` sebagai keluaran. CHUNK_SIZE adalah 8, jadi ini dilakukan dalam perkalian integer, tanpa float.

p2r3 menunjukkannya tahap demi tahap di video : pertama 4 sudut chunk, masing-masing dengan ketinggian yang di seed RNG.

![4 sudut chunk, masing-masing di seed RNG deterministik](/images/bareiron/gen-four-corners.jpg)

Lalu interpolasi antara 4 titik ini menciptakan permukaan kontinu.

![Penerapan interpolasi bilinear antara 4 sudut](/images/bareiron/gen-interpolate.jpg)

Dan dengan mengulangi pola pada semua chunk yang bersebelahan, kita mendapatkan medan yang membentang sampai tak terbatas.

![Hasil akhir : medan tak beraturan yang kontinu](/images/bareiron/gen-result.jpg)

### RNG deterministik

Kunci yang membuat semua ini mungkin adalah seeding. Setiap chunk punya 4 sudut, dan setiap sudut butuh nilai pseudo-acak yang unik tapi bisa direproduksi.

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

Ia mempacking 16 bit X, 16 bit Z, dan 32 bit seed ke buffer 8 byte, dan melewatkan semuanya ke `splitmix64`. Hasil : nilai deterministik unik untuk tiap posisi, berdasarkan seed dunia.

Kamu menangkap kekuatan mekanismenya? Server tidak perlu menyimpan medan. Ia menghitung ulang langsung ketika pemain tiba di zona baru, dan itu memberikan tepat hasil yang sama setiap kali.

`splitmix64` yang dipakai adalah prng super cepat yang dirancang untuk hash 64 bit :

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

3 operasi : penjumlahan, xor/shift, perkalian, xor/shift, perkalian, xor/shift. Semuanya muat dalam operasi langsung, tanpa tabel maupun loop. Ia mengambil buffer 8 byte (X + Z + seed), memperlakukannya sebagai integer 64 bit, dan mengembalikan 32 bit hash. Ini deterministik, cepat, dan muat dalam 5 baris.

### Kenapa ini bukan Perlin noise

p2r3 mengatakannya sendiri di video : "makin banyak digit angka acak yang kamu tambahkan, makin teratur medannya, seperti makin banyak lemparan koin mendekatkanmu ke 50/50". Dalam praktik, ini jumlah bit hash yang ia gabungkan :

```c
// worldgen.c, baris 51-115

// Untuk biome plains : 4 faktor digabung → medan teratur
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// Untuk snowy plains : 2 faktor → lebih berbukit
h = (hash % 5) + ((hash >> 4) % 5);
```

Setiap biome memilih berapa ekstraksi bit yang ia gabungkan. Makin banyak, makin stabil distribusinya -- seperti makin banyak lemparan koin yang mendekati 50/50. Makin sedikit, makin kuat variasi lokalnya.

![Medan tak beraturan -- sedikit faktor, variasi kuat](/images/bareiron/terrain-irregular.jpg)

Dengan hanya 2 faktor, snowy plains menghasilkan medan berbukit, nyaris bergunung. Puncak dan lembah sering.

![Medan teratur -- banyak faktor, permukaan halus](/images/bareiron/terrain-regular.jpg)

Dengan 4 faktor, dataran tetap datar dan bisa diprediksi. Distribusinya stabil.

Satu chunk dibangkitkan dalam **200 ms** di ESP32 -- lawan waktu yang tidak terukur di perangkat keras yang sama dengan Perlin noise saking mahalnya.

### Detail yang membunuh : menanyai blok tanpa membangkitkan seluruh chunk

Kamu bermain, kamu menambang blok. Server harus tahu item apa yang diberikannya. Secara naif, ia harus membangkitkan seluruh chunk untuk itu.

Dengan interpolasi bilinear, kamu menanyai **titik mana pun** di bidang langsung dari koordinat. Sudut chunk didapat dari posisi pemain, interpolasi memberimu ketinggian pada offset mana pun. Segenggam operasi matematika, tanpa pembangkitan chunk.

p2r3 : "yang saya inginkan adalah fungsi ajaib yang bisa memberi tahu blok apa yang ada pada koordinat tertentu, tanpa mengakses memori maupun menghitung peta noise yang mahal". Tepat itulah yang ia buat.

Begini cara ketinggian menjadi blok konkret :

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

5 kondisi. Lapisan grass/dirt/stone/deepslate/bedrock. Blok permukaan bergantung biome lewat `biome_top[]` -- grass untuk dataran, sand untuk gurun. Kaskade if sederhana jatuh ke lapisan yang benar, yang menggantikan loop dan switch.

### Gua, cermin paling malas

```c
altitude_grotte = CAVE_BASE_DEPTH - (hauteur_surface - y);
```

Ia mencerminkan ketinggian permukaan di bawah tanah. Itu menyerupai rongga besar deepslate. Nol komputasi, satu baris.

![Gua yang dibangkitkan lewat cermin medan permukaan](/images/bareiron/cave-mirror.jpg)

![Skema cermin medan untuk membangkitkan gua](/images/bareiron/cave-diagram.jpg)

### Bijih, versi XOR

```c
kandidat = (chunk_x ^ col_x ^ col_z) % 100;
if (kandidat < 5 && y < 16) -> diamond
```

Satu XOR koordinat menjamin satu kandidat per kolom. Tipenya hanya bergantung ketinggian. Berlian disembunyikan di bawah titik terendah gua supaya menggali tetap berguna.

### Biome dalam tile map

Setiap biome adalah pulau melingkar dalam kisi, tipenya ditentukan pola yang dihitung dari seed. Terkisi, bisa diprediksi, dan gratis.

![Peta biome dalam tile map -- setiap pulau adalah biome berbeda](/images/bareiron/biome-tilemap.jpg)

Setiap biome punya himpunan parameter sendiri yang dienkode dalam tabel :

```c
// worldgen.c (disederhanakan)

static const uint8_t biome_base[] = {
  [BIOME_PLAINS]  = 48,   // ketinggian dasar : 48
  [BIOME_DESERT]  = 52,   // sedikit lebih tinggi
  [BIOME_FOREST]  = 50,   // di antara keduanya
  [BIOME_TAIGA]   = 46,   // sedikit lebih rendah
  [BIOME_SNOWY]   = 40,   // paling rendah
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
  [BIOME_DESERT]  = 3,   // 3 ekstraksi → sedang
  [BIOME_FOREST]  = 4,   // 4 ekstraksi → teratur, bergelombang
  [BIOME_TAIGA]   = 3,   // 3 ekstraksi → sedang
  [BIOME_SNOWY]   = 2,   // 2 ekstraksi → sangat berbukit
};
```

**Plains** : ketinggian 48, 4 faktor → medan sangat datar, rumput.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// Hasil : variasi maks ±4 blok
```

**Desert** : ketinggian 52, 3 faktor, blok permukaan = pasir. Tidak pernah di bawah permukaan laut.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3);
// Hasil : variasi maks ±6 blok, dijepit ke SEA_LEVEL+1
```

**Forest** : ketinggian 50, 4 faktor seperti plains tapi dasar lebih tinggi → bukit berhutan.

**Taiga** : ketinggian 46, 3 faktor → variasi sedang, medan dingin.

**Snowy plains** : ketinggian 40, hanya 2 faktor → paling berbukit.

```c
h = (hash % 5) + ((hash >> 4) % 5);
// Hasil : variasi maks ±14 blok
```

Setiap biome dienkode dalam **3 tabel 5 entri** : ketinggian dasar, blok permukaan, jumlah faktor. Ketika `getHeightAtFromHash` menerima biome, ia berkonsultasi tabel ini untuk menyesuaikan medan. 15 byte data untuk menggantikan seluruh sistem biome Minecraft vanilla.

Detektor biome memakai seed untuk menentukan biome mana yang cocok untuk tiap chunk :

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

Pola 16 entri, indeks yang di seed koordinat chunk. Itu memberikan kisi berulang tapi koheren secara visual. 4 baris kode untuk menggantikan seluruh sistem parameter biomik Minecraft vanilla.

### getHeightAtFromHash : perakit medan

Fungsi di jantung pembangkitan menggabung 4 sudut yang di seed biome :

```c
// worldgen.c (disederhanakan)

static uint8_t getHeightAtFromHash (int rx, int rz, short cx, short cz,
                                    uint32_t h, uint8_t biome) {
  // 4 sudut diekstrak dari hash, seed berbeda per sudut
  uint8_t h1 = biome_base[biome] + (h & 0x0F);
  uint8_t h2 = biome_base[biome] + ((h >> 4) & 0x0F);
  uint8_t h3 = biome_base[biome] + ((h >> 8) & 0x0F);
  uint8_t h4 = biome_base[biome] + ((h >> 12) & 0x0F);

  // Batasan biome : gurun tidak pernah di bawah air
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

Setiap biome punya `biome_base` yang menggeser ketinggian acuan, dan 4 sudut diekstrak dari hash dengan geseran berbeda. Gurun memaksa min di atas permukaan laut -- satu baris batasan yang mencegah air tanpa komputasi biomik tambahan.

### Pohon dan kaktus : penempatan probabilistik

Pembangkitan permukaan memakai hash chunk yang sama untuk memutuskan di mana menanam :

```c
// worldgen.c (disederhanakan)

static void genFoliage (uint8_t *chunk_data, short cx, short cz,
                        uint32_t hash, uint8_t biome) {
  if (biome == BIOME_DESERT) {
    // Kaktus : satu kandidat per chunk, hash menentukan posisi
    int tx = (hash >> 8) & 7;
    int tz = (hash >> 12) & 7;
    int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
    if (chunk_data[ty * 64 + tz * 8 + tx] == B_sand)
      placeCactus(chunk_data, tx, ty + 1, tz);
  } else {
    // Pohon : hash menentukan apakah menaruh dan di mana
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

0-3 pohon per chunk untuk biome hijau, 1 kaktus maks untuk gurun. Hash chunk satu-satunya sumber entropi -- `& 7` untuk posisi dalam chunk, `& 3` untuk penghitung. Semuanya deterministik, tidak ada yang disimpan.

### generateChunk : merakit semuanya

Fungsi yang menyatukan semuanya untuk menghasilkan chunk lengkap 8×8×256 blok :

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

      // Ketinggian kolom
      uint8_t height = getHeightAt(wx, wz);

      // Mengisi kolom dari bawah ke atas
      for (int y = 0; y < height; y ++) {
        uint8_t block = getTerrainBlock(wx, y, wz);
        chunk[y * 64 + z * 8 + x] = block;
      }
    }
  }

  // Menambahkan elemen permukaan (pohon, kaktus)
  genFoliage(chunk, cx, cz, hash, biome);
}
```

Itu saja. 3 loop bersarang : untuk setiap kolom, menemukan ketinggian, mengisi blok, lanjut ke berikutnya. Keluarannya adalah `uint8_t[16384]` (8 × 8 × 256) yang mewakili chunk lengkap. Chunk dibangkitkan lalu dikirim langsung ke klien, tanpa lewat caching, lazy loading atau kompresi.

## Penyimpanan : array statis di mana-mana

Arsitektur memori Bareiron adalah C tertanam dalam segala kemegahannya : hanya tabel global berukuran tetap, tanpa malloc, tanpa hash map, tanpa linked list.

### Perubahan blok

```c
// globals.h, baris 191-196

typedef struct {
  short x;      // 2 byte -- batas 32 000 blok horizontal
  short z;      // 2 byte
  uint8_t y;    // 1 byte -- batas 256 blok vertikal
  uint8_t block; // 1 byte -- batas 256 tipe blok
} BlockChange;
```

20 000 entri, yaitu sekitar **25 000 perubahan** -- setara satu setengah chunk yang seluruhnya digali. Kolom `block` bernilai `0xFF` menandai entri bebas. Pencariannya pemindaian linear :

![Tata letak memori tabel blok -- 6 byte per entri](/images/bareiron/memory-layout.jpg)

```c
// procedures.c

uint8_t getBlockChange (short x, uint8_t y, short z) {
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block == 0xFF) continue;
    if (block_changes[i].x == x && block_changes[i].y == y && block_changes[i].z == z)
      return block_changes[i].block;
    #ifdef ALLOW_CHESTS
      if (block_changes[i].block == B_chest) i += 14;  // lewati data peti
    #endif
  }
  return 0xFF;
}
```

Menambahkan perubahan sedirect pencariannya :

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

Satu penghitung, satu indeks, satu penulisan. Tabel hanya menumpuk : tanpa pengurutan, tanpa pemadatan, tanpa manajemen memori. Ketika tabel penuh, perubahan baru diabaikan -- medan kembali ke keadaan terbangkitnya.

Komentar penulis soal batas 256 blok : "saya tidak berencana mengimplementasikan tangga tembaga yang sedikit terpatina dan dililin dalam waktu dekat."

### Mob : 8 byte per kepala pipa

```c
// globals.h, baris 240-251 (pragma pack(push, 1) untuk menghilangkan padding)

typedef struct {
  uint8_t type;   // 25=chicken, 28=cow, 95=pig, 106=sheep, 145=zombie
  short x;
  uint8_t y;      // kalau health=0, Y menjadi timer sebelum penghapusan
  short z;
  uint8_t data;   // bit 0-4: health, bit 5: sheep sheared, bit 6-7: panic timer
} MobData;
```

8 byte. 16 slot maks. Alignment dan padding dibuang. Byte `data` adalah bitfield buatan sendiri : 5 bit nyawa, 1 bit cukur, 2 bit timer panik. Dan ketika mob mati, kolom Y menjadi timer sebelum penghapusan. Pemakaian ulang memori di tingkat bit.

### Pemain : dipacking rapat

Data pemain memakai `#pragma pack(push, 1)` juga -- koordinat dalam `short` + `uint8_t`, inventaris dalam tabel tetap `uint16_t` + `uint8_t`, dan kolom `flags` yang mengenkode sekaligus cooldown serangan, keadaan spawn, sneak, sprint, eat, load, movement cooldown, dan lock craft. Semua itu dalam bit individual.

## Loop utama : while(true) dan non-blokir

Seluruh server berjalan dalam satu loop, satu thread, nol event library.

```c
// main.c, baris 594-720

while (true) {
  task_yield();  // memberi napas watchdog di ESP32

  // Menerima koneksi baru (non-blokir)
  for (int i = 0; i < MAX_PLAYERS; i ++) {
    if (clients[i] != -1) continue;
    clients[i] = accept(server_fd, ...);
    if (clients[i] != -1) client_count ++;
    break;
  }

  // Tick server kalau waktunya tiba
  if (get_program_time() - last_tick_time > TIME_BETWEEN_TICKS) {
    handleServerTick(time_since_last_tick);
    last_tick_time = get_program_time();
  }

  // Round-robin : satu klien, satu paket per iterasi
  client_index = (client_index + 1) % MAX_PLAYERS;
  if (clients[client_index] == -1) continue;

  // Membaca header paket : length + ID
  recv(client_fd, &recv_buffer, 2, MSG_PEEK);
  int length = readVarInt(client_fd);
  int packet_id = readVarInt(client_fd);
  handlePacket(client_fd, length - sizeVarInt(packet_id), packet_id, state);
}
```

Satu klien diproses per iterasi loop, dan satu paket dibaca dalam satu waktu. `task_yield()` di awal loop membiarkan tugas idle FreeRTOS bernapas di ESP32 -- tanpanya, timer watchdog me reset chip.

Dispatch paket adalah switch monstru **400 baris** :

```c
// main.c, baris 68-497

void handlePacket (int client_fd, int length, int packet_id, int state) {
  switch (packet_id) {
    case 0x00:  // Handshake / Status / Login menurut keadaan
    case 0x01:  // Status ping
    case 0x02:  // Plugin message
    case 0x03:  // Login/configuration acknowledgment
    case 0x08:  // Chat
    case 0x0B:  // Client status (respawn)
    case 0x11:  // Click container (menangani peti)
    case 0x19:  // Interact entity
    case 0x1D..0x20:  // Paket gerakan (kasus terbesar)
    case 0x28:  // Player action (menggali/menaruh)
    // ... 40+ kasus
  }
}
```

Switch dikompilasi menjadi jump table statis, yang menggantikan jump table dinamis, vtable dan map. Sempurna untuk tertanam.

Kasus `0x1D-0x20` yang terbesar -- ia menangani pembaruan posisi, damage jatuh, penyeberangan perbatasan chunk, spawn mob, pembangkitan chunk, DAN lapar. Semua dalam satu fall-through besar.

![Kode server Bareiron -- 6800 baris C](/images/bareiron/code-shot.jpg)

## Tick server dan AI mob

Fungsi `handleServerTick` dipanggil setiap 50 ms (20 TPS). Ia menangani dunia sementara loop utama mengurus pemain :

```c
// main.c (disederhanakan)

void handleServerTick (uint32_t delta) {
  // Memperbarui setiap mob
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type == 0 || mobs[i].data == 0) continue;  // mati atau kosong

    MobData *mob = &mobs[i];
    int px, pz;
    getNearestPlayer(mob->x, mob->z, &px, &pz);

    if (mob->type == MOB_ZOMBIE) {
      // Bermusuhan : berjalan ke pemain terdekat
      if (px < mob->x) mob->x --;
      else if (px > mob->x) mob->x ++;
      if (pz < mob->z) mob->z --;
      else if (pz > mob->z) mob->z ++;
      // Damage kontak pada 2 blok
      if (abs(px - mob->x) <= 2 && abs(pz - mob->z) <= 2)
        damagePlayer(getNearestPlayerId(mob->x, mob->z), 3);
    } else {
      // Pasif : 8 arah acak
      uint8_t dir = getMobDir(mob);
      mob->x += dir_lookup[dir][0];
      mob->z += dir_lookup[dir][1];
      // Ganti arah setiap ~40 tick
      if (mob->data >> 6 < 1) setMobDir(mob, rand() & 7);
      mob->data = (mob->data & 0x3F) | ((mob->data - 0x40) & 0xC0);
    }

    // Membangunkan chunk di sekitar mob
    setChunkGenerated(mob->x / 8, mob->z / 8);
  }
}
```

AI mob bermusuhan itu perbandingan koordinat. Secara harfiah `if (px < x) x--`. Zombie mengabaikan pathfinding, A* dan penghindaran rintangan : ia menyesuaikan X dan Z independen ke pemain -- ia menembus tembok kalau ada.

Damage kontaknya 3 hati/detik. p2r3 menginginkannya tinggi karena ketiadaan pathfinding membuat zombie mudah di kite.

Formula armor adalah yang sebelum combat update -- yang paling sederhana :

```c
// main.c (disederhanakan)

static uint8_t applyArmor (uint8_t damage, uint16_t armor_value) {
  // Formula pra-1.9 : reduksi linear
  // Setiap poin armor = 4% reduksi, maks 80%
  uint8_t reduction = (armor_value * 4);
  if (reduction > 80) reduction = 80;
  return damage * (100 - reduction) / 100;
}
```

Full diamond = 80% reduksi. Pukulan zombie 3 hati menjadi 0.6 hati. p2r3 memilih formula lama ini karena dihitung dalam 2 operasi -- tanpa ambang, tanpa kurva, hanya persentase linear.

Mob pasif : 8 arah dalam lookup table, ganti haluan setiap ~40 tick. Kolom `data` mengenkode arah berjalan dalam 2 bit bobot tinggi, dan timer ganti arah dalam 6 bit sisanya.

![Mob di Bareiron -- zombie, babi, domba](/images/bareiron/mobs.jpg)

### Respawn mob

Mob tidak spawn dengan random tick. Mereka muncul ketika tick server bertemu perbatasan chunk baru :

```c
if (player crossed chunk boundary) {
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type != 0) continue;
    spawnMob(&mobs[i], new_chunk_coords, getChunkHash(cx, cz));
    break;
  }
}
```

RNG yang sama dengan medan, seed chunk yang sama. Kalau slot mob bebas, spawn deterministik.

## Crafting : tanpa matriks, if/else

```c
// crafting.c, baris 9-347 (disederhanakan)

void getCraftingOutput (PlayerData *player, uint8_t *count, uint16_t *item) {
  // Kalau flag 0x80 diangkat, buffer craft dipakai oleh peti
  if (player->flags & 0x80) { *count = 0; *item = 0; return; }

  // Menghitung slot, menemukan item pertama, memeriksa kesamaan
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
    case 1:  /* papan, batangan... */
    case 2:  /* stik, gunting, obor */
    case 3:  /* sekop, pedang, lempeng */
    case 4:  /* meja kerja, sepatu */
    case 5:  /* pickaxe, kapak, helm */
    case 7:  /* celana, komposter */
    case 8:  /* tungku, peti, pelindung dada */
    case 9:  /* blok lengkap (besi, emas, dll.) */
  }
}
```

Cek pertama : kalau flag `0x80` diangkat, buffer craft didaur ulang menjadi pointer peti. Craft tetap terkunci.

Lalu, ia menghitung slot terisi, mencatat item pertama, memeriksa kesamaan. Hanya dengan itu, kamu mencocokkan tungku dalam 4 cek :

```c
if (count == 8 && first == cobblestone && all_identical && center_empty)
    return furnace;
```

Untuk bentuk kompleks, ia memakai indeks item pertama dan memeriksa posisi relatif. Resep berbagi fungsi pencocokan yang sama -- material menentukan hasil.

![Antarmuka craft dan peti di Bareiron](/images/bareiron/crafting.jpg)

## Peti : hack yang sesungguhnya

Hack memori yang dibicarakan semua orang, dalam kode nyata :

```c
// procedures.c, baris 1262-1293

if (target == B_chest) {
  // Mencari entri peti dalam tabel blok
  uint8_t *storage_ptr = NULL;
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block != B_chest) continue;
    if (block_changes[i].x != x || block_changes[i].y != y || block_changes[i].z != z)
      continue;
    storage_ptr = (uint8_t *)(&block_changes[i + 1]);  // menunjuk setelah blok peti
    break;
  }
  if (storage_ptr == NULL) return;

  // Hack memori yang mengerikan!!
  // Kita menyalin POINTER ke tabel item craft pemain
  memcpy(player->craft_items, &storage_ptr, sizeof(storage_ptr));
  player->flags |= 0x80;  // mengunci craft

  // Mengirim antarmuka peti ke klien
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

Dan komentar dalam kode : `// Hack memori yang mengerikan!!1!`

Tepat itulah. Ia mengambil alamat memori entri berikutnya dalam `block_changes[]`, menyalinnya ke `player->craft_items` (yang adalah `uint16_t[9]`, jadi 18 byte -- cukup untuk menyimpan pointer 32 bit), dan mengangkat flag supaya tidak ada yang mencoba craft sementara itu.

Pada setiap klik di inventaris peti :

```c
// packets.c, baris 620-638

uint8_t *storage_ptr;
memcpy(&storage_ptr, player->craft_items, sizeof(storage_ptr));
// storage_ptr kini menunjuk ke data peti
uint16_t *p_item = (uint16_t *)(storage_ptr + (slot - 41) * 3);
uint8_t *p_count = storage_ptr + (slot - 41) * 3 + 2;
```

Ia mengambil pointer dari buffer craft, dan mengakses slot dengan offset. Data peti disimpan dengan takaran 3 byte per slot (2 untuk ID, 1 untuk jumlah), ditempel bersebelahan dalam tabel blok.

![Data peti yang disimpan dalam tabel blok -- hack memori](/images/bareiron/chest-hack.jpg)

## Lapar : 5 baris jenius

```c
// main.c, baris 293-305

// Pemain mengirim paket gerakan ~20/detik ketika
// bergerak, jauh lebih sedikit ketika diam. Kita menghubungkannya
// dengan aktivitas untuk mensimulasikan lapar gratis.
if (player->saturation == 0) {
  if (player->hunger > 0) player->hunger--;
  player->saturation = 200;
  sc_setHealth(client_fd, player->health, player->hunger, player->saturation);
} else if (player->flags & 0x08) {  // sprinting
  player->saturation -= 1;
}
}
```

Secara harfiah itulah. 5 baris. Setiap paket gerakan mengurangi saturasi. Ketika saturasi mencapai nol, lapar turun dan kita me reset saturasi. Sprint (flag `0x08`) menggandakan drain.

Nol timer, nol memori yang dialokasikan, nol komputasi khusus. Penghitung yang berkurang pada paket yang sudah ada.

### Damage jatuh

Sistem damage paling sederhana proyek :

```c
// Ketika pemain meninggalkan tanah, kita menyimpan Y-nya
// Ketika ia menyentuh tanah lagi, kita mengurangkan
degats = dernier_y_au_sol - y_actuel;
```

Satu pengurangan.

## Menambang dan menaruh blok

Ketika kamu mengklik blok, paket `0x28` (Player Action) mendarat di switch. Handler harus menentukan blok apa yang ada di posisi, menghapusnya, dan menaruh item ke inventaris :

```c
// main.c, case 0x28 (disederhanakan)

void handlePlayerAction (int client_fd, uint8_t action, int x, uint8_t y, int z) {
  switch (action) {
    case START_DESTROY_BLOCK: {
      // Menentukan tipe blok di posisi yang diklik
      uint8_t block = getBlockAt(x, y, z);

      if (block == B_chest) {
        openChest(client_fd, x, y, z);
        break;
      }

      // Menambahkan ke block_changes
      addBlockChange(x, z, y, 0);  // 0 = udara

      // Memberi item ke pemain (percaya pada klien)
      addItemToPlayer(client_fd, block_to_item(block), 1);

      // Mengirim pembaruan ke klien
      sc_blockChange(client_fd, x, y, z, 0);
      sc_ackBlockChange(client_fd, x, y, z, 0);
      break;
    }
    case PLACE_BLOCK: {
      // Membaca tipe blok dari tangan pemain
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

`getBlockAt` menggabung pembangkitan medan DAN perubahan pemain :

```c
uint8_t getBlockAt (int x, uint8_t y, int z) {
  // Pertama memeriksa perubahan pemain
  uint8_t change = getBlockChange(x, y, z);
  if (change != 0xFF) return change;

  // Kalau tidak, membaca dari medan terbangkit
  return getTerrainBlock(x, y, z);
}
```

Prioritas pada perubahan, fallback pada medan. Nol perdebatan, nol cache, nol overhead. `getTerrainBlock` di balik kapnya adalah `getHeightAt` + lapisan stone/dirt/grass/coal.

### Tungku instan

Yang paling lucu : tungku tidak ada sebagai entitas. Kalau kamu menaruh cobblestone di petak "memasak" dan coal di "bahan bakar", hasilnya muncul segera, tanpa timer maupun tick chunk : itu hanya slot inventaris yang kosong ketika kamu menaruh item yang benar.

![Tungku instan -- taruh bahan, hasil segera](/images/bareiron/furnace.jpg)

## Loop ESP32 : server MC dalam 4 KB stack

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
  // Sisanya ditangani event handler
}
#endif
```

Seluruh server berjalan dalam tugas FreeRTOS dengan **4096 byte stack**. Itu saja. Thread utama hanya menginisialisasi WiFi dan menunggu koneksi. Begitu terhubung, ia me spawn `bareiron_main` yang memanggil `main()` standar.

Semua kode khusus ESP32 dilindungi `#ifdef ESP_PLATFORM`. Di PC, semua itu dikompilasi menjadi kode POSIX standar.

## Yang dikorbankan

Supaya semua itu muat, ada fitur vanilla yang tidak ada :

- **Nol kompresi jaringan** -- zlib terlalu mahal. Server membangkitkan chunk cepat, tapi mengirimnya adalah bottleneck.
- **Nol random tick** -- pohon tumbuh dengan bone meal atau tidak. Mob spawn di perbatasan chunk.
- **Nol entitas item** -- blok yang ditambang langsung masuk inventaris. Animasinya murni visual.
- **Tanpa verifikasi inventaris apa pun** -- percaya pada klien. 64 berlian? OK. Satu chunk ditambang dalam 1 detik? OK. Dipakai di antara orang terpercaya.
- **Nol cahaya server** -- obor dikirim setelah sisanya, klien menghitung.
- **Nol fluida progresif** -- keadaan akhir instan.

## Hasil akhir

Ryzen 5 3600 : ~0.5 ms per chunk.
ESP32-C3 1$ : ~200 ms per chunk. Bisa dimainkan.

![Benchmark pembangkitan chunk -- Ryzen vs ESP32](/images/bareiron/performance.jpg)

3+ pemain : ngadat. Sebanding dengan 2b2t di jam sibuk, kata penulis.

![Beberapa pemain terhubung ke server Bareiron yang sama](/images/bareiron/multiplayer.jpg)

## Filosofi

p2r3 : "Saya cuma suka gagasan bahwa chip kecil 1 dolar yang mengonsumsi 0.5 Watt ini bisa menjalankan sesuatu seadvanced Minecraft. Sains bukan soal 'kenapa', melainkan soal 'kenapa tidak'."

Setiap baris adalah tradeoff :
- Perlin noise → interpolasi : kurang cantik, 200x lebih cepat, nol memori
- Matriks craft → pencocokan hardcode : kode jelek, nol byte
- zlib → tidak ada : koneksi busuk = mati, tapi bisa dimainkan
- Validasi → percaya : nol keamanan, nol komputasi

Setiap fitur yang absen memungkinkan fitur lain ada dalam batas perangkat keras.

**3 poin yang perlu diingat :**

1. **Interpolasi + RNG** -- 4 titik yang di seed, medan tak terbatas, nol penyimpanan, query tanpa membangkitkan ulang chunk, 200 ms pembangkitan. Ini langkah jenius yang membuat sisanya mungkin.
2. **Setiap fitur punya biaya** -- Ketiadaan kompresi, random tick dan validasi adalah pilihan yang disadari : inilah yang memungkinkan muat dalam 520 KB.
3. **Hack jelek adalah yang paling cerdas** -- Peti dalam tabel blok lewat memcpy, lapar lewat paket gerakan, tungku instan. Solusi bersihnya terlalu mahal.

Kalau proyek ini menarik buatmu, semuanya ada di [GitHub berlisensi GPLv3](https://github.com/p2r3/bareiron/). Ini C yang kotor banget, dan saya jarang begitu menikmati membaca kode sumber.
