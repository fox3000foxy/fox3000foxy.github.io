---
title: Bareiron -- خادم Minecraft الذي يعمل على متحكم دقيق بـ 1$
description: 6800 سطر من C، بدون malloc، استبدال Perlin noise بـ bilinear interpolation،
  biomes في tile map، وكل هذا على شريحة بـ 1$.
date: 2026-05-30
tags:
  - minecraft
  - reverse-engineering
  - embedded
  - c
  - esp32
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "Ppwaz0lXNONnNqAKqICFrQ9WbmnxaseLmam9uDsFU61EzSBK4a3tdRNJZcOZQJ/RHQhH1Hsgi62pslO4r/xSsA=="
---

## مقدمة

هل تساءلت يوماً إن كان بإمكانك تشغيل خادم Minecraft على متحكم دقيق بـ 1 دولار؟

أنا فعلت. والجواب هو نعم. حرفياً.

هناك مشروع اسمه [Bareiron](https://github.com/p2r3/bareiron/)، من توقيع p2r3، وهو على الأرجح واحد من أكثر المشاريع إثارة للدهشة التي رأيتها في عالم Minecraft في السنوات الأخيرة. نحن نتحدث عن ملف ثنائي بحجم **300 كيلوبايت**، **6800 سطر من C**، بدون أي تبعيات خارجية، بدون malloc، بدون threading، وكل هذا يعمل على **ESP32 بـ 1 دولار**.

![ESP32-C3، المتحكم الدقيق الذي يشغل الخادم](/images/bareiron/esp32-board.jpg)

توليد تضاريس لا نهائي. Biomes. كهوف. تصنيع. تعدين. Mobs. جوع. صناديق. كل ما تتوقعه من خادم survival.

على شريحة تستهلك **0.5 واط** ولديها **160 MHz** تردد.

لإعطائك فكرة: خادم Minecraft vanilla يحتاج إلى عدة غيغابايت من RAM. ESP32-C3 لديه **520 KB من SRAM** (400 متاحة بعد الإقلاع). المعالجات قبل 20 سنة كانت تعمل بغيجاهيرتز -- هذا المعالج يصل إلى 160 MHz. الفرق بينهما في القوة الخام هو حوالي **20,000**.

p2r3 لم يكتب خادم Minecraft بلغة C، بل أعاد اختراع كل لبنة من الخادم لتتناسب مع هذه القيود. دعنا نرى كيف، من خلال فتح الكود المصدري.

![صورة مصغرة لفيديو تقديم Bareiron من p2r3](/images/bareiron/title-card.jpg)

## عقل المشروع: توليد تضاريس بدون ذاكرة

أكبر مشكلة عندما تريد بناء خادم MC مضمن هي توليد التضاريس.

في Minecraft vanilla، يتم توليد العالم باستخدام **Perlin noise**: عدة طبقات متراكبة (octaves)، 6 معاملات بيومية (درجة الحرارة، الرطوبة، القارية، التآكل، الغرابة، العمق)، ونظام كامل للتخزين المؤقت لتجنب إعادة الحساب في كل مرة.

النتيجة رائعة. لكنها مكلفة حسابياً، وتستهلك RAM لتخزين الـ chunks المولدة.

منهج Bareiron مختلف جذرياً. بدلاً من تكديس الضوضاء، يستخدم **bilinear interpolation** على 4 نقاط مولدة بواسطة **RNG حتمي**.

هل تعلم عندما تكبر صورة صغيرة منخفضة الدقة وتصبح الحواف ضبابية؟ هذا بالضبط ما يحدث.

```c
// worldgen.c, lignes 117-171 (simplifié)

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

Bilinear interpolation القياسي: 4 زوايا، أوزان حسب الموضع، `uint8_t` واحد في المخرجات. CHUNK_SIZE يساوي 8، لذا يتم كل شيء بضرب أعداد صحيحة، بدون float.

p2r3 يشرحها خطوة بخطوة في الفيديو: أولاً الزوايا الأربع للـ chunk، كل منها بارتفاع معين مبدئ بواسطة RNG.

![الزوايا الأربع للـ chunk، كل منها مبدئ بواسطة RNG الحتمي](/images/bareiron/gen-four-corners.jpg)

ثم interpolation بين هذه النقاط الأربع يُنشئ سطحاً مستمراً.

![تطبيق bilinear interpolation بين الزوايا الأربع](/images/bareiron/gen-interpolate.jpg)

وبتكرار النمط على جميع الـ chunks المجاورة، نحصل على تضاريس تمتد إلى ما لا نهاية.

![النتيجة النهائية: تضاريس غير منتظمة ومستمرة](/images/bareiron/gen-result.jpg)

### RNG الحتمي

المفتاح الذي يجعل كل هذا ممكناً هو التبدئة (seeding). كل chunk له 4 زوايا، وكل زاوية تحتاج إلى قيمة شبه عشوائية فريدة لكن قابلة لإعادة الإنتاج.

```c
// worldgen.c, lignes 13-22

uint32_t getChunkHash (short x, short z) {
  uint8_t buf[8];
  memcpy(buf, &x, 2);          // 16 bits de coordonnée X
  memcpy(buf + 2, &z, 2);      // 16 bits de coordonnée Z
  memcpy(buf + 4, &world_seed, 4);  // 32 bits de seed globale
  return splitmix64(*((uint64_t *)buf));  // hash
}
```

يضع 16 بت من X، 16 بت من Z، و32 بت من seed، في مخزن مؤقت بحجم 8 بايت، ويمرر كل شيء إلى `splitmix64`. النتيجة: قيمة حتمية فريدة لكل موضع، بناءً على seed العالم.

هل تدرك قوة هذا؟ الخادم لا يحتاج إلى تخزين التضاريس. إنه يعيد الحساب بسرعة عندما يصل اللاعب إلى منطقة جديدة، ويعطي نفس النتيجة تماماً في كل مرة.

`splitmix64` المستخدم هو prng فائق السرعة مصمم لتجزئة 64 بت:

```c
// worldgen.c (simplifié)

static uint32_t splitmix64 (uint64_t state) {
  state += 0x9E3779B97F4A7C15ull;
  uint64_t z = state;
  z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ull;
  z = (z ^ (z >> 27)) * 0x94D049BB133111EBull;
  return (z ^ (z >> 31)) >> 32;
}
```

3 عمليات: جمع، xor/إزاحة، ضرب، xor/إزاحة، ضرب، xor/إزاحة. لا جدول بحث، لا حلقة. يأخذ المخزن المؤقت بـ 8 بايت (X + Z + seed)، يعامله كعدد صحيح 64 بت، ويعيد 32 بت من التجزئة. إنه حتمي، سريع، ويناسب 5 أسطر.

### لماذا ليس Perlin noise

p2r3 يقولها بنفسه في الفيديو: "كلما أضفت أرقاماً أكثر من الرقم العشوائي، أصبح التضاريس أكثر انتظاماً، مثل رمي العملة مرات أكثر يقربك من 50/50". عملياً، هو عدد بتات التجزئة التي يجمعها:

```c
// worldgen.c, lignes 51-115

// Pour un biome plains : 4 facteurs combinés → terrain régulier
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// Pour snowy plains : 2 facteurs → plus accidenté
h = (hash % 5) + ((hash >> 4) % 5);
```

كل biome يختار عدد استخراجات البتات التي يجمعها. كلما زاد العدد، استقر التوزيع -- مثل رمي العملات الذي يقترب من 50/50. كلما قل العدد، زادت التغيرات المحلية.

![تضاريس غير منتظمة -- عوامل قليلة، تغيرات قوية](/images/bareiron/terrain-irregular.jpg)

مع عاملين فقط، snowy plains تنتج تضاريساً تلالية، شبه جبلية. القمم والانخفاضات متكررة.

![تضاريس منتظمة -- عوامل متعددة، سطح أملس](/images/bareiron/terrain-regular.jpg)

مع 4 عوامل، تبقى السهول مسطحة وقابلة للتنبؤ. التوزيع يستقر.

يتم توليد chunk واحد في **200 ms** على ESP32 -- مقابل وقت غير قابل للقياس على نفس العتاد مع Perlin noise لمثل هذه التكلفة.

### التفصيلة القاتلة: الاستعلام عن كتلة بدون توليد الـ chunk بالكامل

أنت تلعب، أنت تكسر كتلة. الخادم يجب أن يعرف أي عنصر يعطيك. بشكل ساذج، ستحتاج إلى توليد الـ chunk بالكامل لذلك.

مع bilinear interpolation، تستعلم عن **أي نقطة** على المستوى مباشرة من الإحداثيات. زوايا الـ chunk تُحصل من موقع اللاعب، interpolation يعطيك الارتفاع عند أي إزاحة. حفنة من العمليات الرياضية، لا توليد chunk.

p2r3: "ما أريده هو دالة سحرية يمكنها إخباري أي كتلة توجد في إحداثية معينة، دون الوصول إلى الذاكرة أو حساب خرائط ضوضاء باهظة". وهذا بالضبط ما فعله.

هكذا يصبح الارتفاع كتلًا ملموسة:

```c
// worldgen.c (simplifié)

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

5 شروط. طبقة من grass/dirt/stone/deepslate/bedrock. كتلة السطح تعتمد على biome عبر `biome_top[]` -- grass للسهول، sand للصحراء. لا حلقة، لا switch، سلسلة من if تسقط في الطبقة المناسبة.

### الكهوف، عكس السطح الأكثر كسلاً

```c
altitude_grotte = CAVE_BASE_DEPTH - (hauteur_surface - y);
```

إنه يعكس ارتفاع السطح تحت الأرض. يبدو مثل تجاويف deepslate الكبيرة. بدون أي حساب، سطر واحد.

![كهوف مولدة بعكس التضاريس السطحية](/images/bareiron/cave-mirror.jpg)

![رسم تخطيطي لعكس التضاريس لتوليد الكهوف](/images/bareiron/cave-diagram.jpg)

### الخامات، بنسخة XOR

```c
candidat = (chunk_x ^ col_x ^ col_z) % 100;
if (candidat < 5 && y < 16) -> diamond
```

XOR الإحداثيات يضمن مرشحاً واحداً لكل عمود. النوع يعتمد فقط على الارتفاع. الماس مخبأ تحت أدنى نقطة في الكهوف ليبقى الحفر مفيداً.

### الـ biomes في tile map

كل biome هو جزيرة دائرية في شبكة، نوعه محدد بنمط محسوب من الـ seed. شبكي، قابل للتنبؤ، ومجاني.

![خريطة الـ biomes في tile map -- كل جزيرة هي biome مختلف](/images/bareiron/biome-tilemap.jpg)

كل biome لديه مجموعته الخاصة من المعاملات المشفرة في مصفوفات:

```c
// worldgen.c (simplifié)

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

**Plains**: ارتفاع 48، 4 عوامل → تضاريس مسطحة جداً، عشب.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// Résultat : variation de ±4 blocs max
```

**Desert**: ارتفاع 52، 3 عوامل، كتلة سطح = رمل. أبداً تحت مستوى سطح البحر.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3);
// Résultat : variation de ±6 blocs max, clampé à SEA_LEVEL+1
```

**Forest**: ارتفاع 50، 4 عوامل مثل السهول لكن بقاعدة أعلى → تلال مشجرة.

**Taiga**: ارتفاع 46، 3 عوامل → تغيرات معتدلة، تضاريس باردة.

**Snowy plains**: ارتفاع 40، عاملان فقط → الأكثر وعورة.

```c
h = (hash % 5) + ((hash >> 4) % 5);
// Résultat : variation de ±14 blocs max
```

كل biome مشفر في **3 مصفوفات من 5 مداخل**: الارتفاع الأساسي، كتلة السطح، عدد العوامل. عندما تستقبل `getHeightAtFromHash` الـ biome، تستشير هذه المصفوفات لضبط التضاريس. 15 بايت من البيانات لاستبدال نظام الـ biomes بالكامل في Minecraft.

كاشف الـ biome يستخدم الـ seed لتحديد أي biome يناظر كل chunk:

```c
// worldgen.c (simplifié)

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

نمط من 16 مدخلاً، فهرس مبدئ بإحداثيات الـ chunk. يعطي شبكة متكررة لكنها متسقة بصرياً. 4 أسطر من الكود لاستبدال نظام معاملات الـ biomes بالكامل في Minecraft vanilla.

### getHeightAtFromHash: مجمع التضاريس

الدالة في قلب التوليد تجمع الزوايا الأربع المبدئة بـ biome:

```c
// worldgen.c (simplifié)

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

كل biome لديه `biome_base` يزيح ارتفاع الأساس، والزوايا الأربع مستخرجة من التجزئة بإزاحات مختلفة. الصحراء تفرض الحد الأدنى فوق مستوى سطح البحر -- سطر قيد واحد يتجنب الماء دون حساب بيومي إضافي.

### الأشجار والصبار: وضع احتمالي

توليد السطح يستخدم نفس تجزئة الـ chunk لتقرير أين يزرع:

```c
// worldgen.c (simplifié)

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

0-3 أشجار لكل chunk للـ biomes الخضراء، صبار واحد كحد أقصى للصحراء. تجزئة الـ chunk هي مصدر العشوائية الوحيد -- `& 7` للموضع داخل الـ chunk، `& 3` للعداد. كل شيء حتمي، لا شيء مخزّن.

### generateChunk: تجميع كل شيء

الدالة التي تجمع كل شيء لإنتاج chunk كامل من 8×8×256 كتلة:

```c
// worldgen.c (simplifié)

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

هذا كل شيء. 3 حلقات متداخلة: لكل عمود، جد الارتفاع، املأ الكتل، انتقل للتالي. المخرجات هي `uint8_t[16384]` (8 × 8 × 256) تمثل الـ chunk الكامل. لا تخزين مؤقت، لا تحميل كسول، لا ضغط -- يتم توليد الـ chunk وإرساله مباشرة إلى العميل.

## التخزين: مصفوفات ثابتة في كل مكان

هندسة الذاكرة في Bareiron هي C مضمن بكل روعتها. لا malloc، لا hash maps، لا قوائم مرتبطة.

كل شيء في مصفوفات عامة ذات حجم ثابت.

### تغييرات الكتل

```c
// globals.h, lignes 191-196

typedef struct {
  short x;      // 2 bytes -- limite à 32 000 blocs horizontal
  short z;      // 2 bytes
  uint8_t y;    // 1 byte -- limite à 256 blocs vertical
  uint8_t block; // 1 byte -- limite à 256 types de blocs
} BlockChange;
```

20,000 مدخل، أي حوالي **25,000 تغيير** -- ما يعادل chunk ونصف مكشوف بالكامل. الحقل `block` بقيمة `0xFF` يحدد مدخلاً حراً. البحث هو مسح خطي:

![تخطيط ذاكرة مصفوفة الكتل -- 6 بايت لكل مدخل](/images/bareiron/memory-layout.jpg)

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

إضافة تغيير هي بنفس بساطة البحث:

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

عداد، فهرس، كتابة. لا ترتيب، لا ضغط، لا إدارة ذاكرة. عندما تمتلئ المصفوفة، يتم تجاهل التغييرات الجديدة -- تعود التضاريس إلى حالتها المولدة.

تعليق المؤلف على حد 256 كتلة: "لا أخطط لتنفيذ السلالم النحاسية المصقولة قليلاً في أي وقت قريب."

### الـ mobs: 8 بايت لكل رأس

```c
// globals.h, lignes 240-251 (pragma pack(push, 1) pour éliminer le padding)

typedef struct {
  uint8_t type;   // 25=chicken, 28=cow, 95=pig, 106=sheep, 145=zombie
  short x;
  uint8_t y;      // si health=0, Y devient un timer avant suppression
  short z;
  uint8_t data;   // bits 0-4: health, bit 5: sheep sheared, bits 6-7: panic timer
} MobData;
```

8 بايت. 16 موضعاً كحد أقصى. لا محاذاة، لا حشو. بايت `data` هو bitfield منزلي: 5 بت للصحة، 1 بت للجز، 2 بت لمؤقت الذعر. وعندما يموت mob، يصبح الحقل Y مؤقتاً قبل الحذف. إعادة استخدام ذاكرة على مستوى البت.

### اللاعبون: معبؤون بإحكام

بيانات اللاعبين تستخدم `#pragma pack(push, 1)` أيضاً -- إحداثيات بـ `short` + `uint8_t`، مخزون في مصفوفات ثابتة من `uint16_t` + `uint8_t`، وحقل `flags` يشفر كل من مهلة الهجوم، حالة الظهور، التسلل، الركض، الأكل، التحميل، مهلة الحركة، وقفل التصنيع. كل ذلك في بتات فردية.

## الحلقة الرئيسية: while(true) وعدم الحظر

الخادم بأكمله يعمل على حلقة واحدة، خيط واحد، بدون مكتبة أحداث.

```c
// main.c, lignes 594-720

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

يتم معالجة عميل واحد فقط لكل تكرار للحلقة، ويتم قراءة حزمة واحدة فقط في كل مرة. `task_yield()` في بداية الحلقة يسمح لمهمة FreeRTOS الخاملة بالتنفس على ESP32 -- بدونها، مؤقت المراقبة (watchdog timer) يعيد تشغيل الشريحة.

توزيع الحزم هو switch ضخم من **400 سطر**:

```c
// main.c, lignes 68-497

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

لا jump table ديناميكي، لا vtable، لا map. switch يترجم إلى jump table ثابت. مثالي للأنظمة المضمنة.

الحالة `0x1D-0x20` هي الأكبر -- تتعامل مع تحديثات الموضع، ضرر السقوط، عبور حدود الـ chunk، ظهور الـ mobs، توليد الـ chunks، والجوع أيضاً. كل شيء في fall-through واحد كبير.

![كود خادم Bareiron -- 6800 سطر من C](/images/bareiron/code-shot.jpg)

## tick الخادم وذكاء الـ mobs

الدالة `handleServerTick` تُستدعى كل 50 ms (20 TPS). تدير العالم بينما الحلقة الرئيسية تتعامل مع اللاعبين:

```c
// main.c (simplifié)

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

ذكاء الـ mobs العدائية هو مقارنة إحداثيات. حرفياً `if (px < x) x--`. لا pathfinding، لا A*، لا تجنب عوائق. الزومبي يضبط X و Z بشكل مستقل نحو اللاعب -- يعبر الجدران إن وجدت.

ضرر التلامس هو 3 قلوب/ثانية. p2r3 جعلها عالية لأن عدم وجود pathfinding يجعل الزومبي سهل المراوغة.

معادلة الدرع هي من قبل تحديث القتال -- الأبسط الممكنة:

```c
// main.c (simplifié)

static uint8_t applyArmor (uint8_t damage, uint16_t armor_value) {
  // Formule pré-1.9 : réduction linéaire
  // Chaque point d'armure = 4% de réduction, max 80%
  uint8_t reduction = (armor_value * 4);
  if (reduction > 80) reduction = 80;
  return damage * (100 - reduction) / 100;
}
```

Full diamond = تخفيض 80%. ضربة زومبي بـ 3 قلوب تصبح 0.6 قلب. p2r3 اختار هذه المعادلة القديمة لأنها تُحسب في عمليتين -- لا عتبات، لا منحنيات، مجرد نسبة مئوية خطية.

الـ mobs السلبية: 8 اتجاهات في جدول بحث، تغيير اتجاه كل ~40 tick. حقل `data` يشفر الاتجاه الحالي في أعلى بتين، ومؤقت تغيير الاتجاه في الـ 6 بتات المتبقية.

![Mobs في Bareiron -- زومبي، خنازير، أغنام](/images/bareiron/mobs.jpg)

### إعادة ظهور الـ mobs

الـ mobs لا تظهر مع random ticks. تظهر عندما يصادف tick الخادم حدود chunk جديدة:

```c
if (player crossed chunk boundary) {
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type != 0) continue;
    spawnMob(&mobs[i], new_chunk_coords, getChunkHash(cx, cz));
    break;
  }
}
```

نفس RNG المستخدم للتضاريس، نفس seed الـ chunk. إذا كان موضع mob شاغراً، يكون الظهور حتمياً.

## التصنيع: لا مصفوفات، if/else

```c
// crafting.c, lignes 9-347 (simplifié)

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

الاختيار الأول: إذا كان العلم `0x80` مرفوعاً، فإن مخزن التصنيع يُعاد استخدامه كمؤشر صندوق. لا تصنيع ممكن.

ثم، يعد الفتحات المملوءة، يلاحظ أول عنصر، يتحقق من التطابق. بهذا فقط، يطابق الفرن في 4 اختيارات:

```c
if (count == 8 && first == cobblestone && all_identical && center_empty)
    return furnace;
```

للأشكال المعقدة، يستخدم فهرس أول عنصر ويتحقق من الموضع النسبي. الوصفات تشارك نفس دالة المطابقة -- المادة تحدد النتيجة.

![واجهة التصنيع والصندوق في Bareiron](/images/bareiron/crafting.jpg)

## الصناديق: الاختراق الحقيقي

اختراق الذاكرة الذي يتحدث عنه الجميع، في الكود الحقيقي:

```c
// procedures.c, lignes 1262-1293

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

والتعليق في الكود: `// Terrible memory hack!!1!`

هذا بالضبط ما هو. يأخذ عنوان الذاكرة للمدخل التالي في `block_changes[]`، ينسخه إلى `player->craft_items` (وهو `uint16_t[9]`، أي 18 بايت -- كافية لتخزين مؤشر 32 بت)، ويرفع العلم ليمنع أي شخص من التصنيع خلال هذا الوقت.

عند كل نقرة في مخزون الصندوق:

```c
// packets.c, lignes 620-638

uint8_t *storage_ptr;
memcpy(&storage_ptr, player->craft_items, sizeof(storage_ptr));
// storage_ptr pointe maintenant vers les données du coffre
uint16_t *p_item = (uint16_t *)(storage_ptr + (slot - 41) * 3);
uint8_t *p_count = storage_ptr + (slot - 41) * 3 + 2;
```

يستعيد المؤشر من مخزن التصنيع، ويصل إلى الفتحات بإزاحة. بيانات الصندوق مخزنة بمعدل 3 بايت لكل فتحة (2 للمعرف، 1 للكمية)، ملتصقة ببعضها في مصفوفة الكتل.

![بيانات الصندوق المخزنة في مصفوفة الكتل -- اختراق ذاكرة](/images/bareiron/chest-hack.jpg)

## الجوع: 5 أسطر من العبقرية

```c
// main.c, lignes 293-305

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

هذا حرفياً كل شيء. 5 أسطر. كل حزمة حركة تنقص الشبع. عندما يصل الشبع إلى الصفر، ينخفض الجوع وتُعاد ضبط الشبع. الركض (العلم `0x08`) يضاعف الاستنزاف.

لا مؤقت، لا ذاكرة مخصصة، لا حساب مخصص. عداد يتناقص على حزم موجودة أصلاً.

### ضرر السقوط

أبسط نظام ضرر في المشروع:

```c
// Quand le joueur quitte le sol, on stocke son Y
// Quand il retouche le sol, on soustrait
degats = dernier_y_au_sol - y_actuel;
```

عملية طرح.

## التعدين ووضع الكتل

عندما تنقر على كتلة، تصل الحزمة `0x28` (Player Action) إلى الـ switch. المعالج يجب أن يحدد أي كتلة في الموضع، يزيلها، ويضع العنصر في المخزون:

```c
// main.c, case 0x28 (simplifié)

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

`getBlockAt` تجمع بين توليد التضاريس وتغييرات اللاعبين:

```c
uint8_t getBlockAt (int x, uint8_t y, int z) {
  // D'abord vérifier les changements joueurs
  uint8_t change = getBlockChange(x, y, z);
  if (change != 0xFF) return change;

  // Sinon, lire depuis le terrain généré
  return getTerrainBlock(x, y, z);
}
```

أولوية للتغييرات، تراجع للتضاريس. لا نقاش، لا مخبأ، لا حمل زائد. `getTerrainBlock` تحت الغطاء هو `getHeightAt` + طبقات stone/dirt/grass/coal.

### الفرن الفوري

الأكثر تسلية: الفرن غير موجود ككيان. إذا وضعت cobblestone في خانة "الطبخ" و coal في "الوقود"، تظهر النتيجة فوراً. لا مؤقت، لا chunk ticking. إنها مجرد خانة مخزون تفرغ عندما تضع العناصر الصحيحة.

![فرن فوري -- ضع المكونات، النتيجة فورية](/images/bareiron/furnace.jpg)

## حلقة ESP32: خادم MC في 4 KB من stack

```c
// main.c, lignes 732-779

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

الخادم بأكمله يعمل في مهمة FreeRTOS مع **4096 بايت من stack**. هذا كل شيء. الخيط الرئيسي فقط يهيئ WiFi وينتظر اتصالاً. بمجرد الاتصال، يشغل `bareiron_main` التي تستدعي `main()` القياسي.

كل كود ESP32 المحدد محمي بـ `#ifdef ESP_PLATFORM`. على PC، كل هذا يترجم إلى كود POSIX قياسي.

## ما تم التضحية به

لكي يعمل كل هذا، هناك ميزات vanilla غير موجودة:

- **لا ضغط شبكة** -- zlib مكلف جداً. الخادم يولد الـ chunks بسرعة، لكن إرسالها هو عنق الزجاجة.
- **لا random ticks** -- الأشجار تنمو بـ bone meal أو لا. الـ mobs تظهر عند حدود الـ chunk.
- **لا كيانات عناصر** -- الكتل المكسورة تذهب مباشرة للمخزون. الحركة المرئية بحتة.
- **لا تحقق من المخزون** -- trust the client. 64 ماسة؟ حسناً. chunk مكشوف في 1 ثانية؟ حسناً. للاستخدام بين الأشخاص الموثوقين.
- **لا إضاءة خادم** -- المشاعل تُرسل بعد كل شيء آخر، العميل يحسب.
- **لا سوائل تدريجية** -- حالة نهائية فورية.

## النتيجة النهائية

Ryzen 5 3600: ~0.5 ms لكل chunk.
ESP32-C3 بـ 1$: ~200 ms لكل chunk. قابل للعب.

![قياس أداء توليد الـ chunks -- Ryzen مقابل ESP32](/images/bareiron/performance.jpg)

3+ لاعبين: يبدأ بالتأخير. مشابه لـ 2b2t في ساعات الذروة، حسب قول المؤلف.

![عدة لاعبين متصلين بنفس خادم Bareiron](/images/bareiron/multiplayer.jpg)

## الفلسفة

p2r3: "أنا فقط أحب فكرة أن هذه الشريحة الصغيرة جداً بـ 1 دولار التي تستهلك 0.5 واط يمكنها تشغيل شيء متقدم مثل Minecraft. Science isn't about 'why', it's about 'why not'."

كل سطر هو مقايضة:
- Perlin noise ← interpolation: أقل جمالاً، أسرع بـ 200x، بدون ذاكرة
- مصفوفات التصنيع ← مطابقة مبرمجة: كود قذر، بدون بايتات
- zlib ← لا شيء: اتصال سيء = موت، لكن قابل للعب
- تحقق ← ثقة: لا أمان، لا حساب

كل ميزة غائبة تسمح لأخرى بالوجود ضمن حدود العتاد.

**3 أشياء يجب تذكرها:**

1. **Interpolation + RNG** -- 4 نقاط مبدئة، تضاريس لا نهائية، بدون تخزين، استعلام بدون إعادة توليد chunk، 200 ms توليد. هذه هي الحركة العبقرية التي تجعل كل شيء آخر ممكناً.
2. **كل ميزة لها تكلفة** -- لا ضغط، لا random ticks، لا تحقق. هذه ليست سهواً، بل ما يسمح بالعمل ضمن 520 KB.
3. **الاختراقات القذرة هي الأكثر ذكاءً** -- صناديق في مصفوفة الكتل عبر memcpy، جوع عبر حزم الحركة، فرن فوري. الحل النظيف كان سيكون مكلفاً جداً.

إذا كان المشروع يثير اهتمامك، كل شيء على [GitHub برخصة GPLv3](https://github.com/p2r3/bareiron/). إنه C قذر جداً، ونادراً ما استمتعت بقراءة كود مصدري بهذا القدر xD
