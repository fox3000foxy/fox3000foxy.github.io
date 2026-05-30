---
title: Bareiron -- 1$'lık bir mikrodenetleyicide çalışan Minecraft sunucusu
description: 6800 satır C, sıfır malloc, bilinear interpolasyonla değiştirilmiş
  Perlin gürültüsü, tile map'te biyomlar ve bunların hepsi 1$'lık bir çipte.
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

## Giriş

Hiç bir Minecraft sunucusunu 1 liraya bir mikrodenetleyicide çalıştırabileceğini merak ettin mi?

Ben ettim. Ve cevap evet. Resmen.

[Bareiron](https://github.com/p2r3/bareiron/) diye bir proje var, p2r3 imzalı, ve muhtemelen son yıllarda Minecraft dünyasında gördüğüm en büyüleyici projelerden biri. **300 kilobayt**a sığan bir binary'den bahsediyoruz, **6800 satır C**, sıfır harici bağımlılık, malloc yok, threading yok, ve **1 dolarlık bir ESP32**'de çalışıyor.

![ESP32-C3, sunucuyu çalıştıran mikrodenetleyici](/images/bareiron/esp32-board.jpg)

Sonsuz arazi üretimi. Biyomlar. Mağaralar. Craft. Madencilik. Mob'lar. Açlık. Sandıklar. Bir survival sunucusundan beklediğin her şey.

**0.5 Watt** tüketen ve **160 MHz** saat hızına sahip bir çipte.

Fikir vermesi açısından: vanilla bir Minecraft sunucusu birkaç giga RAM'e ihtiyaç duyar. ESP32-C3 ise **520 KB SRAM**'e sahip (boot'tan sonra 400'ü kullanılabilir). 20 yıl önceki işlemciler zaten gigahertz'de çalışıyordu -- bu 160 MHz'de takılı kalıyor. Saf güç açısından ikisi arasındaki fark yaklaşık **20 000**.

p2r3 C dilinde bir Minecraft sunucusu yazmadı, sunucunun her bir tuğlasını bu kısıtlamalara sığacak şekilde yeniden icat etti. Kaynak kodu açarak nasıl yaptığına bakalım.

![p2r3'ün Bareiron tanıtım videosunun küçük resmi](/images/bareiron/title-card.jpg)

## Projenin beyni: hafızasız arazi üretimi

Gömülü bir MC sunucusu yapmak istediğinde en büyük sorun arazi üretimi.

Vanilla Minecraft'ta dünya **Perlin gürültüsü** ile üretilir: üst üste bindirilmiş birkaç katman (oktavlar), 6 biyomik parametre (sıcaklık, nem, karasallık, erozyon, tuhaflık, derinlik) ve her seferinde her şeyi yeniden hesaplamamak için kocaman bir önbellekleme sistemi.

Sonuç muhteşem. Ama hesaplama açısından pahalı ve üretilen chunk'ları depolamak için RAM gerektiriyor.

Bareiron'un yaklaşımı radikal biçimde farklı. Gürültü yığmak yerine, **deterministik bir RNG** tarafından üretilen 4 nokta üzerinde **bilinear interpolasyon** kullanıyor.

Küçük pikselli bir resmi büyüttüğünde kenarların bulanıklaştığını bilirsin? Aynen öyle.

```c
// worldgen.c, satırlar 117-171 (basitleştirilmiş)

uint8_t interpolate (uint8_t a, uint8_t b, uint8_t c, uint8_t d, int x, int z) {
  uint16_t top    = a * (CHUNK_SIZE - x) + b * x;
  uint16_t bottom = c * (CHUNK_SIZE - x) + d * x;
  return (top * (CHUNK_SIZE - z) + bottom * z) / (CHUNK_SIZE * CHUNK_SIZE);
}

uint8_t getHeightAt (int x, int z) {
  int _x = floor(x / CHUNK_SIZE);  // chunk koordinatları
  int _z = floor(z / CHUNK_SIZE);
  int rx = x % CHUNK_SIZE;          // chunk içi offset
  int rz = z % CHUNK_SIZE;
  uint32_t hash = getChunkHash(_x, _z);
  uint8_t biome = getChunkBiome(_x, _z);
  // hash + biome ile tohumlanmış 4 köşe arasında interpolasyon
  return getHeightAtFromHash(rx, rz, _x, _z, hash, biome);
}
```

Standart bilinear interpolasyon: 4 köşe, pozisyona göre ağırlıklar, çıktıda tek bir `uint8_t`. CHUNK_SIZE 8, yani tamsayı çarpmalarıyla yapılıyor, float yok.

p2r3 bunu videoda adım adım gösteriyor: önce chunk'ın 4 köşesi, her biri RNG tarafından tohumlanmış bir yüksekliğe sahip.

![Chunk'ın 4 köşesi, her biri deterministik RNG tarafından tohumlanmış](/images/bareiron/gen-four-corners.jpg)

Sonra bu 4 nokta arasındaki interpolasyon sürekli bir yüzey oluşturuyor.

![4 köşe arasında bilinear interpolasyon uygulaması](/images/bareiron/gen-interpolate.jpg)

Ve bu deseni tüm bitişik chunk'larda tekrarlayarak sonsuza uzanan bir arazi elde ediyorsun.

![Nihai sonuç: sürekli düzensiz arazi](/images/bareiron/gen-result.jpg)

### Deterministik RNG

Bunu mümkün kılan anahtar şey tohumlama. Her chunk'ın 4 köşesi var ve her köşenin benzersiz ama tekrarlanabilir bir sözde rastgele değere ihtiyacı var.

```c
// worldgen.c, satırlar 13-22

uint32_t getChunkHash (short x, short z) {
  uint8_t buf[8];
  memcpy(buf, &x, 2);          // 16 bit X koordinatı
  memcpy(buf + 2, &z, 2);      // 16 bit Z koordinatı
  memcpy(buf + 4, &world_seed, 4);  // 32 bit global tohum
  return splitmix64(*((uint64_t *)buf));  // hash
}
```

16 bit X, 16 bit Z ve 32 bit tohumu 8 baytlık bir buffer'a paketliyor ve hepsini `splitmix64`'ten geçiriyor. Sonuç: dünyanın tohumuna dayalı olarak her pozisyon için deterministik benzersiz bir değer.

Olayın gücünü anlıyor musun? Sunucunun araziyi depolaması gerekmiyor. Oyuncu yeni bir bölgeye geldiğinde anında yeniden hesaplıyor ve her seferinde tam olarak aynı sonucu veriyor.

Kullanılan `splitmix64`, 64 bit hash'ler için tasarlanmış ultra hızlı bir prng:

```c
// worldgen.c (basitleştirilmiş)

static uint32_t splitmix64 (uint64_t state) {
  state += 0x9E3779B97F4A7C15ull;
  uint64_t z = state;
  z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ull;
  z = (z ^ (z >> 27)) * 0x94D049BB133111EBull;
  return (z ^ (z >> 31)) >> 32;
}
```

3 işlem: toplama, xor/kaydırma, çarpma, xor/kaydırma, çarpma, xor/kaydırma. Lookup table yok, döngü yok. 8 baytlık buffer'ı (X + Z + tohum) alıyor, 64 bitlik bir tamsayı olarak işliyor ve 32 bit hash döndürüyor. Deterministik, hızlı ve 5 satıra sığıyor.

### Neden Perlin gürültüsü değil

p2r3'ün videoda kendi dediği gibi: "rastgele sayıya ne kadar çok basamak eklersen, arazi o kadar düzenli hale gelir, tıpkı daha fazla yazı tura atmanın seni 50/50'ye yaklaştırması gibi". Pratikte, birleştirdiği hash bitlerinin sayısı:

```c
// worldgen.c, satırlar 51-115

// Plains biyomu için: 4 birleştirilmiş faktör → düzenli arazi
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// Snowy plains için: 2 faktör → daha engebeli
h = (hash % 5) + ((hash >> 4) % 5);
```

Her biyom kaç bit çıkarımı birleştireceğini seçiyor. Ne kadar çok olursa, dağılım o kadar dengelenir -- tıpkı 50/50'ye yaklaşan daha fazla yazı tura atışı gibi. Az olduğunda, yerel varyasyonlar daha güçlü olur.

![Düzensiz arazi — az faktör, güçlü varyasyonlar](/images/bareiron/terrain-irregular.jpg)

Sadece 2 faktörle, snowy plains neredeyse dağlık, inişli çıkışlı bir arazi üretiyor. Tepe ve çukurlar sık.

![Düzenli arazi — çoklu faktörler, pürüzsüz yüzey](/images/bareiron/terrain-regular.jpg)

4 faktörle, ovalar düz ve tahmin edilebilir kalıyor. Dağılım dengeleniyor.

Bir chunk, ESP32'de **200 ms**'de üretiliyor -- aynı donanımda Perlin gürültüsüyle ölçülemeyecek kadar pahalıyken.

### Can alıcı detay: tüm chunk'ı üretmeden bir bloğu sorgulamak

Oynuyorsun, bir bloğu kazıyorsun. Sunucu sana hangi item'i vereceğini bilmeli. Safça, bunun için tüm chunk'ı üretmek gerekirdi.

Bilinear interpolasyonla, düzlemdeki **herhangi bir noktayı** doğrudan koordinatlardan sorgulayabiliyorsun. Chunk'ın köşeleri oyuncunun konumundan elde ediliyor, interpolasyon sana herhangi bir offset'teki yüksekliği veriyor. Bir avuç matematik işlemi, chunk üretimi yok.

p2r3: "istediğim şey, bana verilen bir koordinattaki bloğu söyleyebilecek, hafızaya erişmeden veya pahalı gürültü haritaları hesaplamadan çalışan sihirli bir fonksiyon". Aynen yaptığı şey.

İşte yüksekliğin somut bloklara dönüşmesi:

```c
// worldgen.c (basitleştirilmiş)

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

5 koşul. Bir katman grass/dirt/stone/deepslate/bedrock. Yüzey bloğu `biome_top[]` aracılığıyla biyoma bağlı -- ovalar için grass, çöl için sand. Döngü yok, switch yok, doğru katmana düşen bir if basamaklaması.

### Mağaralar, en tembel mirror

```c
mağara_yüksekliği = CAVE_BASE_DEPTH - (yüzey_yüksekliği - y);
```

Yüzey yüksekliğini yer altında aynalıyor. Büyük deepslate boşluklarına benziyor. Sıfır hesaplama, tek satır.

![Yüzey arazisinin aynalanmasıyla oluşturulan mağaralar](/images/bareiron/cave-mirror.jpg)

![Mağara oluşturmak için arazi aynalama şeması](/images/bareiron/cave-diagram.jpg)

### Cevherler, XOR versiyonu

```c
aday = (chunk_x ^ col_x ^ col_z) % 100;
if (aday < 5 && y < 16) -> diamond
```

Koordinatların XOR'u sütun başına bir aday garantiliyor. Tür sadece yüksekliğe bağlı. Elmaslar mağaraların en alt noktasının altına saklanmış, böylece kazmak mantıklı kalıyor.

### Biyomlar tile map'te

Her biyom bir ızgarada dairesel bir ada, türü tohumdan hesaplanan bir desenle belirleniyor. Izgaralı, tahmin edilebilir ve beleş.

![Tile map biyom haritası -- her ada farklı bir biyom](/images/bareiron/biome-tilemap.jpg)

Her biyomun dizilerde kodlanmış kendi parametre seti var:

```c
// worldgen.c (basitleştirilmiş)

static const uint8_t biome_base[] = {
  [BIOME_PLAINS]  = 48,   // taban yükseklik: 48
  [BIOME_DESERT]  = 52,   // biraz daha yüksek
  [BIOME_FOREST]  = 50,   // ikisinin arası
  [BIOME_TAIGA]   = 46,   // biraz daha alçak
  [BIOME_SNOWY]   = 40,   // en alçak
};

static const uint8_t biome_top[] = {
  [BIOME_PLAINS]  = B_grass,
  [BIOME_DESERT]  = B_sand,
  [BIOME_FOREST]  = B_grass,
  [BIOME_TAIGA]   = B_grass,
  [BIOME_SNOWY]   = B_snow_block,
};

static const uint8_t biome_factors[] = {
  [BIOME_PLAINS]  = 4,   // 4 çıkarım → çok düzenli
  [BIOME_DESERT]  = 3,   // 3 çıkarım → orta
  [BIOME_FOREST]  = 4,   // 4 çıkarım → düzenli, inişli çıkışlı
  [BIOME_TAIGA]   = 3,   // 3 çıkarım → orta
  [BIOME_SNOWY]   = 2,   // 2 çıkarım → çok engebeli
};
```

**Plains**: yükseklik 48, 4 faktör → çok düz arazi, çimen.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// Sonuç: maksimum ±4 blok varyasyon
```

**Desert**: yükseklik 52, 3 faktör, yüzey bloğu = kum. Asla deniz seviyesinin altında değil.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3);
// Sonuç: maksimum ±6 blok varyasyon, SEA_LEVEL+1'e kenetlenmiş
```

**Forest**: yükseklik 50, plains gibi 4 faktör ama taban daha yüksek → ormanlık tepeler.

**Taiga**: yükseklik 46, 3 faktör → orta varyasyonlar, soğuk arazi.

**Snowy plains**: yükseklik 40, sadece 2 faktör → en engebelisi.

```c
h = (hash % 5) + ((hash >> 4) % 5);
// Sonuç: maksimum ±14 blok varyasyon
```

Her biyom **3 dizi, 5 giriş** ile kodlanmış: taban yükseklik, yüzey bloğu, faktör sayısı. `getHeightAtFromHash` biyomu aldığında, arazinin ayarlanması için bu dizilere bakıyor. Minecraft'ın tüm biyom sistemini değiştirmek için 15 byte veri.

Biyom dedektörü, her chunk'a hangi biyomun karşılık geldiğini belirlemek için tohumu kullanıyor:

```c
// worldgen.c (basitleştirilmiş)

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

16 girişlik bir desen, chunk koordinatlarıyla tohumlanmış bir index. Tekrarlı ama görsel olarak tutarlı bir ızgara veriyor. Vanilla Minecraft'ın tüm biyomik parametre sistemini değiştirmek için 4 satır kod.

### getHeightAtFromHash: arazi montajcısı

Üretimin kalbindeki fonksiyon, biyomla tohumlanmış 4 köşeyi birleştiriyor:

```c
// worldgen.c (basitleştirilmiş)

static uint8_t getHeightAtFromHash (int rx, int rz, short cx, short cz,
                                    uint32_t h, uint8_t biome) {
  // Hashten çıkarılan 4 köşe, her köşe için farklı tohum
  uint8_t h1 = biome_base[biome] + (h & 0x0F);
  uint8_t h2 = biome_base[biome] + ((h >> 4) & 0x0F);
  uint8_t h3 = biome_base[biome] + ((h >> 8) & 0x0F);
  uint8_t h4 = biome_base[biome] + ((h >> 12) & 0x0F);

  // Biyom kısıtlaması: çöl asla su altında değil
  if (biome == BIOME_DESERT) {
    h1 = max(h1, SEA_LEVEL + 1);
    h2 = max(h2, SEA_LEVEL + 1);
    h3 = max(h3, SEA_LEVEL + 1);
    h4 = max(h4, SEA_LEVEL + 1);
  }

  // 4 köşeden interpolasyon
  return interpolate(h1, h2, h3, h4, rx, rz);
}
```

Her biyomun referans yüksekliği kaydıran bir `biome_base`'i var ve 4 köşe farklı kaydırmalarla hashten çıkarılıyor. Çöl, minimumu deniz seviyesinin üstüne zorluyor -- ek biyomik hesaplama gerektirmeden suyu önleyen tek satırlık bir kısıtlama.

### Ağaçlar ve kaktüsler: olasılıksal yerleştirme

Yüzey üretimi, nereye dikeceğine karar vermek için aynı chunk hash'ini kullanıyor:

```c
// worldgen.c (basitleştirilmiş)

static void genFoliage (uint8_t *chunk_data, short cx, short cz,
                        uint32_t hash, uint8_t biome) {
  if (biome == BIOME_DESERT) {
    // Kaktüs: chunk başına bir aday, hash pozisyonu belirliyor
    int tx = (hash >> 8) & 7;
    int tz = (hash >> 12) & 7;
    int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
    if (chunk_data[ty * 64 + tz * 8 + tx] == B_sand)
      placeCactus(chunk_data, tx, ty + 1, tz);
  } else {
    // Ağaçlar: hash koyup koymayacağını ve nereye koyacağını belirliyor
    int tree_count = (hash & 3);  // chunk başına 0-3 ağaç
    for (int i = 0; i < tree_count; i ++) {
      int tx = ((hash >> (4 + i * 4)) & 7);
      int tz = ((hash >> (6 + i * 4)) & 7);
      int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
      placeTree(chunk_data, tx, ty + 1, tz);
    }
  }
}
```

Yeşil biyomlar için chunk başına 0-3 ağaç, çöl için maksimum 1 kaktüs. Chunk'ın hash'i tek entropi kaynağı -- chunk içindeki pozisyon için `& 7`, sayaç için `& 3`. Her şey deterministik, hiçbir şey depolanmıyor.

### generateChunk: hepsini birleştirmek

8×8×256 blokluk tam bir chunk üretmek için her şeyi bir araya getiren fonksiyon:

```c
// worldgen.c (basitleştirilmiş)

void generateChunk (uint8_t *chunk, short cx, short cz) {
  uint32_t hash = getChunkHash(cx, cz);
  uint8_t biome = getChunkBiome(cx, cz);

  // Chunk'taki her sütun için (8×8 = 64)
  for (int x = 0; x < 8; x ++) {
    for (int z = 0; z < 8; z ++) {
      // Mutlak dünya koordinatları
      int wx = cx * 8 + x;
      int wz = cz * 8 + z;

      // Sütun yüksekliği
      uint8_t height = getHeightAt(wx, wz);

      // Sütunu aşağıdan yukarıya doldur
      for (int y = 0; y < height; y ++) {
        uint8_t block = getTerrainBlock(wx, y, wz);
        chunk[y * 64 + z * 8 + x] = block;
      }
    }
  }

  // Yüzey öğelerini ekle (ağaçlar, kaktüsler)
  genFoliage(chunk, cx, cz, hash, biome);
}
```

Hepsi bu kadar. 3 iç içe döngü: her sütun için, yüksekliği bul, blokları doldur, bir sonrakine geç. Çıktı, tam chunk'ı temsil eden bir `uint8_t[16384]` (8 × 8 × 256). Önbellekleme yok, lazy loading yok, sıkıştırma yok -- chunk üretilir ve direkt istemciye gönderilir.

## Depolama: her yerde statik diziler

Bareiron'un bellek mimarisi, tüm ihtişamıyla gömülü C. Malloc yok, hash map yok, bağlı liste yok.

Her şey sabit boyutlu global dizilerde.

### Blok değişiklikleri

```c
// globals.h, satırlar 191-196

typedef struct {
  short x;      // 2 byte -- yatayda 32 000 blok sınırı
  short z;      // 2 byte
  uint8_t y;    // 1 byte -- dikeyde 256 blok sınırı
  uint8_t block; // 1 byte -- 256 blok türü sınırı
} BlockChange;
```

20 000 giriş, yani yaklaşık **25 000 değişiklik** -- tamamen kazılmış bir buçuk chunk'a eşdeğer. `0xFF` değerindeki `block` alanı boş bir girişi işaretler. Arama doğrusal taramadır:

![Blok dizisinin bellek düzeni -- giriş başına 6 byte](/images/bareiron/memory-layout.jpg)

```c
// procedures.c

uint8_t getBlockChange (short x, uint8_t y, short z) {
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block == 0xFF) continue;
    if (block_changes[i].x == x && block_changes[i].y == y && block_changes[i].z == z)
      return block_changes[i].block;
    #ifdef ALLOW_CHESTS
      if (block_changes[i].block == B_chest) i += 14;  // sandık verilerini atla
    #endif
  }
  return 0xFF;
}

Değişiklik eklemek de arama kadar doğrudan:

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

Bir sayaç, bir index, bir yazma. Sıralama yok, sıkıştırma yok, bellek yönetimi yok. Dizi dolduğunda, yeni değişiklikler yok sayılır -- arazi üretilmiş haline döner.

Yazarın 256 blok sınırı hakkındaki yorumu: "hafifçe patinalanmış cilalı bakır merdivenleri henüz uygulamayı düşünmüyorum."

### Mob'lar: kelle başına 8 byte

```c
// globals.h, satırlar 240-251 (padding'i yok etmek için pragma pack(push, 1))

typedef struct {
  uint8_t type;   // 25=tavuk, 28=inek, 95=domuz, 106=koyun, 145=zombi
  short x;
  uint8_t y;      // health=0 ise, Y silinmeden önce bir zamanlayıcı olur
  short z;
  uint8_t data;   // bit 0-4: can, bit 5: koyun kırkılmış, bit 6-7: panik zamanlayıcısı
} MobData;
```

8 byte. Maksimum 16 yuva. Hizalama yok, padding yok. `data` byte'ı ev yapımı bir bitfield: 5 bit can, 1 bit kırkma, 2 bit panik zamanlayıcısı. Bir mob öldüğünde, Y alanı silinmeden önce bir zamanlayıcı olur. Bit seviyesinde bellek yeniden kullanımı.

### Oyuncular: sıkışık paketlenmiş

Oyuncu verileri de `#pragma pack(push, 1)` kullanır -- `short` + `uint8` cinsinden koordinatlar, `uint16_t` + `uint8_t` sabit dizilerinde envanterler ve aynı anda saldırı bekleme süresini, spawn durumunu, sneak, sprint, eat, load, movement cooldown ve craft kilidini kodlayan bir `flags` alanı. Bunların hepsi tek tek bitlerde.

## Ana döngü: while(true) ve bloklamayan

Tüm sunucu tek bir döngüde, tek bir thread'de, sıfır event library ile çalışıyor.

```c
// main.c, satırlar 594-720

while (true) {
  task_yield();  // ESP32'de watchdog'u rahat bırak

  // Yeni bir bağlantı kabul et (bloklamayan)
  for (int i = 0; i < MAX_PLAYERS; i ++) {
    if (clients[i] != -1) continue;
    clients[i] = accept(server_fd, ...);
    if (clients[i] != -1) client_count ++;
    break;
  }

  // Zaman dolduysa sunucu tick'i
  if (get_program_time() - last_tick_time > TIME_BETWEEN_TICKS) {
    handleServerTick(time_since_last_tick);
    last_tick_time = get_program_time();
  }

  // Round-robin: her iterasyonda bir istemci, bir paket
  client_index = (client_index + 1) % MAX_PLAYERS;
  if (clients[client_index] == -1) continue;

  // Paket başlığını oku: uzunluk + ID
  recv(client_fd, &recv_buffer, 2, MSG_PEEK);
  int length = readVarInt(client_fd);
  int packet_id = readVarInt(client_fd);
  handlePacket(client_fd, length - sizeVarInt(packet_id), packet_id, state);
}
```

Döngünün her iterasyonunda tek bir istemci işlenir ve aynı anda tek bir paket okunur. Döngünun başındaki `task_yield()`, FreeRTOS boşta kalma görevinin ESP32'de nefes almasını sağlar -- bu olmadan watchdog timer çipi sıfırlar.

Paket dağıtımı, **400 satırlık** devasa bir switch:

```c
// main.c, satırlar 68-497

void handlePacket (int client_fd, int length, int packet_id, int state) {
  switch (packet_id) {
    case 0x00:  // Duruma göre Handshake / Status / Login
    case 0x01:  // Status ping
    case 0x02:  // Plugin mesajı
    case 0x03:  // Login/konfigürasyon onayı
    case 0x08:  // Sohbet
    case 0x0B:  // İstemci durumu (respawn)
    case 0x11:  // Container tıklama (sandıkları yönetir)
    case 0x19:  // Entity ile etkileşim
    case 0x1D..0x20:  // Hareket paketleri (en büyük durum)
    case 0x28:  // Oyuncu eylemi (kaz/yerleştir)
    // ... 40+ durum
  }
}
```

Dinamik jump table yok, vtable yok, map yok. Bir switch, statik jump table'a derlenir. Gömülü için mükemmel.

`0x1D-0x20` durumu en büyüğü -- konum güncellemelerini, düşüş hasarını, chunk sınırı geçişlerini, mob spawn'ını, chunk üretimini VE açlığı yönetir. Hepsi tek bir büyük fall-through'da.

![Bareiron sunucu kodu -- 6800 satır C](/images/bareiron/code-shot.jpg)

## Sunucu tick'i ve mob yapay zekası

`handleServerTick` fonksiyonu her 50 ms'de bir (20 TPS) çağrılır. Ana döngü oyuncularla ilgilenirken dünyayı yönetir:

```c
// main.c (basitleştirilmiş)

void handleServerTick (uint32_t delta) {
  // Her mob'u güncelle
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type == 0 || mobs[i].data == 0) continue;  // ölü veya boş

    MobData *mob = &mobs[i];
    int px, pz;
    getNearestPlayer(mob->x, mob->z, &px, &pz);

    if (mob->type == MOB_ZOMBIE) {
      // Düşman: en yakın oyuncuya yürü
      if (px < mob->x) mob->x --;
      else if (px > mob->x) mob->x ++;
      if (pz < mob->z) mob->z --;
      else if (pz > mob->z) mob->z ++;
      // 2 blokta temas hasarı
      if (abs(px - mob->x) <= 2 && abs(pz - mob->z) <= 2)
        damagePlayer(getNearestPlayerId(mob->x, mob->z), 3);
    } else {
      // Pasif: 8 rastgele yön
      uint8_t dir = getMobDir(mob);
      mob->x += dir_lookup[dir][0];
      mob->z += dir_lookup[dir][1];
      // ~40 tick'te bir yön değiştir
      if (mob->data >> 6 < 1) setMobDir(mob, rand() & 7);
      mob->data = (mob->data & 0x3F) | ((mob->data - 0x40) & 0xC0);
    }

    // Mob'ın etrafındaki chunk'ları uyandır
    setChunkGenerated(mob->x / 8, mob->z / 8);
  }
}
```

Düşman mob'ların yapay zekası, bir koordinat karşılaştırması. Resmen `if (px < x) x--`. Yol bulma yok, A* yok, engel kaçınma yok. Zombi, X ve Z'yi bağımsız olarak oyuncuya doğru ayarlar -- varsa duvarların içinden geçer.

Temas hasarı saniyede 3 kalp. p2r3 bunu yüksek tutmayı seçmiş çünkü yol bulma olmaması zombileri kitesi kolay hale getiriyor.

Zırh formülü, combat update öncesindeki en basit hal:

```c
// main.c (basitleştirilmiş)

static uint8_t applyArmor (uint8_t damage, uint16_t armor_value) {
  // 1.9 öncesi formül: doğrusal azaltma
  // Her zırh puanı = %4 azaltma, maksimum %80
  uint8_t reduction = (armor_value * 4);
  if (reduction > 80) reduction = 80;
  return damage * (100 - reduction) / 100;
}
```

Full diamond = %80 azaltma. 3 kalplık bir zombi vuruşu 0.6 kalp olur. p2r3 bu eski formülü seçmiş çünkü 2 işlemde hesaplanıyor -- eşik yok, eğri yok, sadece doğrusal bir yüzde.

Pasif mob'lar: bir arama tablosunda 8 yön, ~40 tick'te bir yön değiştirme. `data` alanı, geçerli yönü üstteki 2 bitte ve yön değiştirme zamanlayıcısını kalan 6 bitte kodlar.

![Bareiron'daki mob'lar -- zombiler, domuzlar, koyunlar](/images/bareiron/mobs.jpg)

### Mob'ların yeniden doğması

Mob'lar rastgele tick'lerle spawn olmaz. Sunucu tick'i yeni bir chunk sınırıyla karşılaştığında ortaya çıkarlar:

```c
if (player crossed chunk boundary) {
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type != 0) continue;
    spawnMob(&mobs[i], new_chunk_coords, getChunkHash(cx, cz));
    break;
  }
}
```

Araziyle aynı RNG, aynı chunk tohumu. Bir mob yuvası boşsa, spawn deterministiktir.

## Craft: matris yok, if/else var

```c
// crafting.c, satırlar 9-347 (basitleştirilmiş)

void getCraftingOutput (PlayerData *player, uint8_t *count, uint16_t *item) {
  // 0x80 bayrağı kaldırılmışsa, craft buffer'ı bir sandık tarafından kullanılıyor
  if (player->flags & 0x80) { *count = 0; *item = 0; return; }

  // Yuvaları say, ilk item'i bul, kimliği doğrula
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
    case 1:  /* tahtalar, külçeler... */
    case 2:  /* çubuklar, makaslar, meşaleler */
    case 3:  /* kürekler, kılıçlar, döşemeler */
    case 4:  /* craft masası, botlar */
    case 5:  /* kazmalar, baltalar, kasklar */
    case 7:  /* pantolonlar, kompostlar */
    case 8:  /* fırın, sandık, zırh */
    case 9:  /* tam bloklar (demir, altın, vb.) */
  }
}
```

İlk kontrol: `0x80` bayrağı kaldırılmışsa, craft buffer'ı sandık işaretçisi olarak geri dönüştürülür. Craft mümkün değil.

Sonra doldurulan yuvaları sayar, ilk item'i not eder, kimliği doğrular. Sadece bununla, fırını 4 kontrolde eşleştirirsin:

```c
if (count == 8 && first == cobblestone && all_identical && center_empty)
    return furnace;
```

Karmaşık şekiller için, ilk item'in index'ini kullanır ve göreceli pozisyonu kontrol eder. Tarifler aynı eşleme fonksiyonunu paylaşır -- malzeme sonucu belirler.

![Bareiron'da craft ve sandık arayüzü](/images/bareiron/crafting.jpg)

## Sandıklar: gerçek hack

Herkesin bahsettiği bellek hack'i, gerçek koduyla:

```c
// procedures.c, satırlar 1262-1293

if (target == B_chest) {
  // Blok dizisinde sandık girişini ara
  uint8_t *storage_ptr = NULL;
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block != B_chest) continue;
    if (block_changes[i].x != x || block_changes[i].y != y || block_changes[i].z != z)
      continue;
    storage_ptr = (uint8_t *)(&block_changes[i + 1]);  // sandık bloğunun sonrasını işaret et
    break;
  }
  if (storage_ptr == NULL) return;

  // Terrible memory hack!!
  // POINTER'I oyuncunun craft item dizisine kopyala
  memcpy(player->craft_items, &storage_ptr, sizeof(storage_ptr));
  player->flags |= 0x80;  // craft'ı kilitle

  // İstemciye sandık arayüzünü gönder
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

Ve koddaki yorum: `// Terrible memory hack!!1!`

Aynen öyle. `block_changes[]` içindeki bir sonraki girişin bellek adresini alıyor, `player->craft_items`'e kopyalıyor (ki bu bir `uint16_t[9]`, yani 18 byte -- 32 bitlik bir işaretçiyi depolamak için yeterli) ve bu süre boyunca kimsenin craft yapmaya çalışmaması için bayrağı kaldırıyor.

Sandık envanterindeki her tıklamada:

```c
// packets.c, satırlar 620-638

uint8_t *storage_ptr;
memcpy(&storage_ptr, player->craft_items, sizeof(storage_ptr));
// storage_ptr şimdi sandık verilerini işaret ediyor
uint16_t *p_item = (uint16_t *)(storage_ptr + (slot - 41) * 3);
uint8_t *p_count = storage_ptr + (slot - 41) * 3 + 2;
```

İşaretçiyi craft buffer'ından geri alıyor ve yuvalara bir offset ile erişiyor. Sandık verileri, blok dizisinde yan yana, yuva başına 3 byte (2'si ID, 1'i miktar) olarak depolanıyor.

![Blok dizisinde depolanan sandık verileri -- bir bellek hack'i](/images/bareiron/chest-hack.jpg)

## Açlık: 5 satır deha

```c
// main.c, satırlar 293-305

// Oyuncular hareket ederken ~20/saniye, hareketsizken çok daha az
// hareket paketi gönderir. Açlığı bedavaya simüle etmek için
// bunu aktiviteyle ilişkilendiriyoruz.
if (player->saturation == 0) {
  if (player->hunger > 0) player->hunger--;
  player->saturation = 200;
  sc_setHealth(client_fd, player->health, player->hunger, player->saturation);
} else if (player->flags & 0x08) {  // sprint
  player->saturation -= 1;
}
```

Resmen bu kadar. 5 satır. Her hareket paketi doygunluğu azaltır. Doygunluk sıfıra ulaştığında, açlık düşer ve doygunluk sıfırlanır. Sprint (`0x08` bayrağı) tüketimi ikiye katlar.

Sıfır zamanlayıcı, sıfır ayrılmış bellek, sıfır özel hesaplama. Zaten var olan paketler üzerinde azalan bir sayaç.

### Düşüş hasarı

Projenin en basit hasar sistemi:

```c
// Oyuncu yerden ayrıldığında Y'sini sakla
// Yere tekrar değdiğinde çıkar
hasar = son_yerdeki_y - mevcut_y;
```

Bir çıkarma işlemi.

## Blok kazma ve yerleştirme

Bir bloğa tıkladığında, `0x28` (Player Action) paketi switch'e düşer. İşleyici, pozisyondaki bloğu belirlemeli, onu kaldırmalı ve item'i envantere koymalı:

```c
// main.c, case 0x28 (basitleştirilmiş)

void handlePlayerAction (int client_fd, uint8_t action, int x, uint8_t y, int z) {
  switch (action) {
    case START_DESTROY_BLOCK: {
      // Tıklanan pozisyondaki blok türünü belirle
      uint8_t block = getBlockAt(x, y, z);

      if (block == B_chest) {
        openChest(client_fd, x, y, z);
        break;
      }

      // block_changes'e ekle
      addBlockChange(x, z, y, 0);  // 0 = air

      // Oyuncuya item'i ver (client'a güven)
      addItemToPlayer(client_fd, block_to_item(block), 1);

      // İstemciye güncellemeyi gönder
      sc_blockChange(client_fd, x, y, z, 0);
      sc_ackBlockChange(client_fd, x, y, z, 0);
      break;
    }
    case PLACE_BLOCK: {
      // Blok türünü oyuncunun elinden oku
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

`getBlockAt`, arazi üretimini VE oyuncu değişikliklerini birleştirir:

```c
uint8_t getBlockAt (int x, uint8_t y, int z) {
  // Önce oyuncu değişikliklerini kontrol et
  uint8_t change = getBlockChange(x, y, z);
  if (change != 0xFF) return change;

  // Yoksa, üretilen araziden oku
  return getTerrainBlock(x, y, z);
}
```

Değişikliklere öncelik, araziye geri dönüş. Sıfır tartışma, sıfır önbellek, sıfır ek yük. Kaputun altındaki `getTerrainBlock`, `getHeightAt` + stone/dirt/grass/coal katmanlarıdır.

### Anında fırın

En komiği: fırın bir entity olarak mevcut değil. "Pişirme" yuvasına cobblestone ve "yakıt" yuvasına coal koyarsan, sonuç anında belirir. Zamanlayıcı yok, chunk ticking yok. Doğru item'leri koyduğunda boşalan bir envanter yuvası.

![Anında fırın -- malzemeleri koy, sonuç anında](/images/bareiron/furnace.jpg)

## ESP32 döngüsü: 4 KB stack'te bir MC sunucusu

```c
// main.c, satırlar 732-779

#ifdef ESP_PLATFORM

void bareiron_main (void *pvParameters) {
  main();
  vTaskDelete(NULL);
}

static void wifi_event_handler (...) {
  if (/* bağlandı */) {
    xTaskCreate(bareiron_main, "bareiron", 4096, NULL, 5, NULL);
  }
}

void app_main () {
  esp_timer_early_init();
  wifi_init();
  // Gerisi event handler tarafından yönetilir
}
#endif
```

Tüm sunucu, **4096 byte stack** ile bir FreeRTOS görevinde çalışır. Hepsi bu. Ana main thread sadece WiFi'i başlatır ve bir bağlantı bekler. Bağlantı kurulduğunda, standart `main()`'i çağıran `bareiron_main`'i spawn eder.

ESP32'ye özgü tüm kod, `#ifdef ESP_PLATFORM` ile korunur. PC'de bunların hepsi standart POSIX koduna derlenir.

## Feda edilenler

Bunların hepsinin sığması için, var olmayan vanilla özellikleri var:

- **Ağ sıkıştırması yok** -- zlib çok pahalı. Sunucu chunk'ları hızlı üretir ama göndermek darboğazdır.
- **Rastgele tick yok** -- ağaçlar bone meal ile büyür ya da büyümez. Mob'lar chunk sınırlarında spawn olur.
- **Item entity'si yok** -- kazılan bloklar doğrudan envantere gider. Animasyon tamamen görseldir.
- **Hiçbir envanter doğrulaması yok** -- client'a güven. 64 elmas? Sorun değil. 1 saniyede kazılmış bir chunk? Sorun değil. Güvendiğin kişilerle kullanılacak.
- **Sunucu tarafı ışık yok** -- meşaleler her şeyden sonra gönderilir, istemci hesaplar.
- **Aşamalı sıvı yok** -- anında nihai durum.

## Nihai sonuç

Ryzen 5 3600: chunk başına ~0.5 ms.
1$'lık ESP32-C3: chunk başına ~200 ms. Oynanabilir.

![Chunk üretimi karşılaştırması -- Ryzen vs ESP32](/images/bareiron/performance.jpg)

3+ oyuncu: kasıyor. Yazarın deyimiyle, 2b2t'nin yoğun saatleriyle karşılaştırılabilir.

![Aynı Bareiron sunucusuna bağlı birden çok oyuncu](/images/bareiron/multiplayer.jpg)

## Felsefe

p2r3: "Sadece 0.5 Watt tüketen bu küçücük 1$'lık çipin Minecraft kadar gelişmiş bir şeyi çalıştırabilmesi fikrini seviyorum. Science isn't about 'why', it's about 'why not'."

Her satır bir takas:
- Perlin gürültüsü → interpolasyon: daha az güzel, 200 kat hızlı, sıfır bellek
- Craft matrisleri → hardcodlanmış eşleme: iğrenç kod, sıfır byte
- zlib → hiçbir şey: kötü bağlantı = ölüm, ama oynanabilir
- Doğrulama → güven: sıfır güvenlik, sıfır hesaplama

Eksik her özellik, bir başkasının donanım sınırları içinde var olmasını sağlıyor.

**Unutulmaması gereken 3 şey:**

1. **Interpolasyon + RNG** -- 4 tohumlanmış nokta, sonsuz arazi, sıfır depolama, chunk'ı yeniden üretmeden sorgulama, 200 ms üretim. Geri kalan her şeyi mümkün kılan deha hamlesi.
2. **Her özelliğin bir maliyeti var** -- Sıkıştırma yok, rastgele tick yok, doğrulama yok. Bunlar unutkanlık değil, 520 KB'da kalmanın bedeli.
3. **En iğrenç hack'ler en zekileridir** -- memcpy ile blok dizisindeki sandıklar, hareket paketleriyle açlık, anında fırın. Temiz çözüm çok pahalı olurdu.

Proje ilgini çekiyorsa, her şey [GitHub'da GPLv3 lisansıyla](https://github.com/p2r3/bareiron/). Oldukça pis bir C kodu ve bir kaynak kodu okumaktan bu kadar zevk aldığım nadir olmuştur xD
