---
title: Bareiron، خادم Minecraft يعمل على متحكم دقيق بـ1$
description: 6800 سطر C وصفر malloc وضجيج Perlin مستبدل باستيفاء ثنائي الخطية
  وbiomes في خريطة tiles، وكل ذلك على شريحة بـ1$.
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
author_sig: "8jESEbW0ADcfYDa8wReDmKH2XTBNy4pwQQi5tEACpDeL+zHuMOtQKDiJBN5wCq+Ug+5O44gcCjRHdMzZaNQuHQ=="
---

## مقدمة

تشغيل خادم Minecraft على متحكم دقيق بدولار واحد يشبه مزحة.

طرحت السؤال على نفسي، والجواب نعم. حرفيا.

هناك مشروع اسمه [Bareiron](https://github.com/p2r3/bareiron/)، بتوقيع p2r3، وربما من أكثر المشاريع سحرا التي رأيتها في عالم Minecraft السنوات الأخيرة. نتكلم عن ثنائي يتسع في **300 كيلوبايت** و**6800 سطر C** وصفر تبعية خارجية ولا malloc ولا threading، ويعمل على **ESP32 بدولار واحد**.

![ESP32-C3, le microcontrôleur qui fait tourner le serveur](/images/bareiron/esp32-board.jpg)

توليد تضاريس لانهائي. وbiomes. وكهوف. وصنع. وتعدين. ووحوش. وجوع. وصناديق. كل ما تنتظره من خادم survival.

على شريحة تستهلك **0.5 Watt** ولديها **160 MHz** ساعة.

لإعطاء فكرة : يحتاج خادم Minecraft الأصلي عدة غيغا RAM. أما ESP32-C3 فهي **520 KB من SRAM** (400 متاحة بعد الإقلاع). كانت المعالجات قبل 20 عاما تعمل بالغيغاهرتز فعلا، وهذه تسقف عند 160 MHz. العامل بين الاثنين في القوة الخالصة حوالي **20 000**.

لم يكتب p2r3 خادم Minecraft بلغة C، بل أعاد اختراع كل لبنة من الخادم لتتسع في هذه القيود. سننظر كيف، بفتح الكود المصدري.

![Miniature de la vidéo de présentation de Bareiron par p2r3](/images/bareiron/title-card.jpg)

## دماغ المشروع : توليد تضاريس دون ذاكرة

أكبر مشكلة عندما تريد صنع خادم MC مضمن هي توليد التضاريس.

في Minecraft الأصلي، يُولَّد العالم مع **ضجيج Perlin** : عدة طبقات متراكبة (octaves) و6 معاملات biomية (حرارة ورطوبة وقارية وتعرية وغرابة وعمق)، وكل نظام تخزين مؤقت لعدم إعادة حساب كل شيء في كل مرة.

النتيجة رائعة. لكنها مكلفة حسابيا، وتأخذ RAM لتخزين chunks المولدة.

مقاربة Bareiron مختلفة جذريا. بدلا من تكديس ضجيج، يستخدم **استيفاء ثنائي الخطية** على 4 نقاط مولدة بواسطة **RNG حتمي**.

تعرف عندما تكبّر صورة صغيرة مبكسلة فتصبح الحواف ضبابية ؟ إنه ذلك بالضبط.

```c
// worldgen.c، أسطر 117-171 (مبسطة)

uint8_t interpolate (uint8_t a, uint8_t b, uint8_t c, uint8_t d, int x, int z) {
  uint16_t top    = a * (CHUNK_SIZE - x) + b * x;
  uint16_t bottom = c * (CHUNK_SIZE - x) + d * x;
  return (top * (CHUNK_SIZE - z) + bottom * z) / (CHUNK_SIZE * CHUNK_SIZE);
}

uint8_t getHeightAt (int x, int z) {
  int _x = floor(x / CHUNK_SIZE);  // إحداثيات chunk
  int _z = floor(z / CHUNK_SIZE);
  int rx = x % CHUNK_SIZE;          // إزاحة داخل chunk
  int rz = z % CHUNK_SIZE;
  uint32_t hash = getChunkHash(_x, _z);
  uint8_t biome = getChunkBiome(_x, _z);
  // استيفاء بين 4 زوايا مُبذَرة بالـhash + biome
  return getHeightAtFromHash(rx, rz, _x, _z, hash, biome);
}
```

الاستيفاء ثنائي الخطية القياسي : 4 زوايا وأوزان حسب الموضع، ومخرج `uint8_t` واحد. CHUNK_SIZE هو 8، إذن يتم بضرب أعداد صحيحة، دون float.

يُظهر p2r3 ذلك خطوة بخطوة في الفيديو : أولا زوايا chunk الأربع، لكل واحدة ارتفاع مُبذَر بالـRNG.

![Les 4 coins du chunk, chacun seedé par le RNG déterministe](/images/bareiron/gen-four-corners.jpg)

ثم ينشئ الاستيفاء بين هذه النقاط الأربع سطحا متصلا.

![Application de la bilinear interpolation entre les 4 coins](/images/bareiron/gen-interpolate.jpg)

وبتكرير النمط على كل chunks المتجاورة، نحصل على تضاريس تمتد للانهاية.

![Résultat final : terrain irrégulier continu](/images/bareiron/gen-result.jpg)

### RNG الحتمي

المفتاح الذي يجعل كل ذلك ممكنا هو البذر. لكل chunk 4 زوايا، وتحتاج كل زاوية قيمة شبه عشوائية فريدة لكن قابلة لإعادة الإنتاج.

```c
// worldgen.c، أسطر 13-22

uint32_t getChunkHash (short x, short z) {
  uint8_t buf[8];
  memcpy(buf, &x, 2);          // 16 بت إحداثي X
  memcpy(buf + 2, &z, 2);      // 16 بت إحداثي Z
  memcpy(buf + 4, &world_seed, 4);  // 32 بت بذرة شاملة
  return splitmix64(*((uint64_t *)buf));  // hash
}
```

يحزم 16 بت من X و16 بت من Z و32 بت من البذرة في عازل 8 بايتات، ويمرر الكل في `splitmix64`. النتيجة : قيمة حتمية فريدة لكل موضع، قائمة على بذرة العالم.

تستوعب قوة الآلية ؟ لا يحتاج الخادم تخزين التضاريس. يعيد الحساب لحظيا عندما يصل اللاعب لمنطقة جديدة، ويعطي نفس النتيجة بالضبط في كل مرة.

`splitmix64` المستخدم prng فائق السرعة مصمم لـhash بحجم 64 بت :

```c
// worldgen.c (مبسطة)

static uint32_t splitmix64 (uint64_t state) {
  state += 0x9E3779B97F4A7C15ull;
  uint64_t z = state;
  z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ull;
  z = (z ^ (z >> 27)) * 0x94D049BB133111EBull;
  return (z ^ (z >> 31)) >> 32;
}
```

3 عمليات : جمع وxor/shift وضرب وxor/shift وضرب وxor/shift. الكل في عمليات مباشرة، دون جدول ولا حلقة. يأخذ عازل 8 بايتات (X + Z + بذرة)، ويعامله كعدد صحيح 64 بت، ويعيد 32 بت hash. إنه حتمي وسريع، ويتسع في 5 أسطر.

### لماذا ليس ضجيج Perlin

يقوله p2r3 بنفسه في الفيديو : "كلما أضفت أرقاما من العدد العشوائي، صار التضاريس أكثر انتظاما، مثل رميات قطع أكثر تقربك من 50/50". عمليا، إنه عدد بتات hash التي يدمجها :

```c
// worldgen.c، أسطر 51-115

// لـbiome السهول : 4 عوامل مدمجة ← تضاريس منتظمة
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// لـbiome السهول الثلجية : عاملان ← أكثر وعورة
h = (hash % 5) + ((hash >> 4) % 5);
```

يختار كل biome كم استخراج بتات يدمج. وكلما زاد العدد، استقر التوزيع أكثر، مثل رميات قطع أكثر تقترب من 50/50. وكلما قل، كانت التغيرات المحلية أقوى.

![Terrain irrégulier -- peu de facteurs, variations fortes](/images/bareiron/terrain-irregular.jpg)

مع عاملين فقط، تنتج السهول الثلجية تضاريس متموجة، شبه جبلية. القمم والحفر متكررة.

![Terrain régulier -- facteurs multiples, surface lisse](/images/bareiron/terrain-regular.jpg)

مع 4 عوامل، تبقى السهول مسطحة ومتوقعة. يستقر التوزيع.

يُتولَّد chunk في **200 ms** على ESP32، مقابل زمن غير قابل للقياس على نفس العتاد مع ضجيج Perlin لشدة kostه.

### التفصيل القاتل : استعلام كتلة دون توليد chunk كله

تلعب، وتعدّن كتلة. يجب أن يعرف الخادم أي عنصر يعطيك. بسذاجة، يلزم توليد chunk كله لذلك.

مع الاستيفاء ثنائي الخطية، تستعلم **أي نقطة** من المستوى مباشرة من الإحداثيات. تُحصَل زوايا chunk من موضع اللاعب، ويعطيك الاستيفاء الارتفاع عند أي إزاحة. حفنة عمليات رياضية، دون توليد chunk.

p2r3 : "ما أريده دالة سحرية تستطيع قول أي كتلة توجد عند إحداثي معين، دون الوصول للذاكرة ولا حساب خرائط ضجيج مكلفة". بالضبط ما فعله.

إليكم كيف يصبح الارتفاع كتلا ملموسة :

```c
// worldgen.c (مبسطة)

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

5 شروط. طبقة grass/dirt/stone/deepslate/bedrock. تعتمد كتلة السطح على biome عبر `biome_top[]`، عشب للسهول ورمل للصحراء. سلسلة if بسيطة تقع في الطبقة الصحيحة، مما يستبدل حلقة وswitch.

### الكهوف، المرآة الأكثر كسلا

```c
altitude_grotte = CAVE_BASE_DEPTH - (hauteur_surface - y);
```

يعكس ارتفاع السطح تحت الأرض. يشبه التجاويف الكبيرة في deepslate. صفر حساب وسطر واحد.

![Caves générées par mirror du terrain de surface](/images/bareiron/cave-mirror.jpg)

![Schéma du mirror de terrain pour générer les grottes](/images/bareiron/cave-diagram.jpg)

### الخامات، نسخة XOR

```c
candidat = (chunk_x ^ col_x ^ col_z) % 100;
if (candidat < 5 && y < 16) -> diamond
```

يضمن XOR الإحداثيات مرشحا لكل عمود. يعتمد النوع فقط على الارتفاع. الماس مخبأ تحت أدنى نقطة في الكهوف لكي يبقى الحفر مفيدا.

### biomes في خريطة tiles

كل biome جزيرة دائرية في شبكة، ونوعه محدد بنمط محسوب من البذرة. مُشبَّك ومتوقع ومجاني.

![Carte des biomes en tile map -- chaque île est un biome différent](/images/bareiron/biome-tilemap.jpg)

لكل biome مجموعة معاملات خاصة مرمزة في جداول :

```c
// worldgen.c (مبسطة)

static const uint8_t biome_base[] = {
  [BIOME_PLAINS]  = 48,   // ارتفاع أساس : 48
  [BIOME_DESERT]  = 52,   // أعلى قليلا
  [BIOME_FOREST]  = 50,   // بين الاثنين
  [BIOME_TAIGA]   = 46,   // أخفض قليلا
  [BIOME_SNOWY]   = 40,   // الأخفض
};

static const uint8_t biome_top[] = {
  [BIOME_PLAINS]  = B_grass,
  [BIOME_DESERT]  = B_sand,
  [BIOME_FOREST]  = B_grass,
  [BIOME_TAIGA]   = B_grass,
  [BIOME_SNOWY]   = B_snow_block,
};

static const uint8_t biome_factors[] = {
  [BIOME_PLAINS]  = 4,   // 4 استخراجات ← منتظم جدا
  [BIOME_DESERT]  = 3,   // 3 استخراجات ← معتدل
  [BIOME_FOREST]  = 4,   // 4 استخراجات ← منتظم ومتموج
  [BIOME_TAIGA]   = 3,   // 3 استخراجات ← معتدل
  [BIOME_SNOWY]   = 2,   // استخراجان ← وعر جدا
};
```

**سهول** : ارتفاع 48 و4 عوامل ← تضاريس مسطحة جدا وعشب.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// النتيجة : تغير ±4 كتل حدا
```

**صحراء** : ارتفاع 52 و3 عوامل وكتلة سطح = رمل. أبدا تحت مستوى البحر.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3);
// النتيجة : تغير ±6 كتل حدا، مُثبَّت عند SEA_LEVEL+1
```

**غابة** : ارتفاع 50 و4 عوامل كالسهول لكن أساس أعلى ← تلال مشجرة.

**تايغا** : ارتفاع 46 و3 عوامل ← تغيرات معتدلة وتضاريس باردة.

**سهول ثلجية** : ارتفاع 40 وعاملان فقط ← الأكثر وعورة.

```c
h = (hash % 5) + ((hash >> 4) % 5);
// النتيجة : تغير ±14 كتلة حدا
```

يُرمَّز كل biome في **3 جداول من 5 مداخل** : ارتفاع أساس وكتلة سطح وعدد عوامل. وعندما تستلم `getHeightAtFromHash` biome، تستشير هذه الجداول لضبط التضاريس. 15 بايت بيانات لاستبدال نظام biomes كله في Minecraft الأصلي.

يستخدم كاشف biome البذرة لتحديد أي biome يقابل كل chunk :

```c
// worldgen.c (مبسطة)

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

نمط 16 مدخلا وفهرس مُبذَر بإحداثيي chunk. يعطي شبكة متكررة لكن متسقة بصريا. 4 أسطر كود لاستبدال نظام المعاملات biomية كله في Minecraft الأصلي.

### getHeightAtFromHash : مجمّع التضاريس

الدالة في قلب التوليد تجمع الزوايا الأربع المُبذَرة حسب biome :

```c
// worldgen.c (مبسطة)

static uint8_t getHeightAtFromHash (int rx, int rz, short cx, short cz,
                                    uint32_t h, uint8_t biome) {
  // 4 زوايا مستخرجة من hash، بذرة مختلفة لكل زاوية
  uint8_t h1 = biome_base[biome] + (h & 0x0F);
  uint8_t h2 = biome_base[biome] + ((h >> 4) & 0x0F);
  uint8_t h3 = biome_base[biome] + ((h >> 8) & 0x0F);
  uint8_t h4 = biome_base[biome] + ((h >> 12) & 0x0F);

  // قيد biome : الصحراء أبدا تحت الماء
  if (biome == BIOME_DESERT) {
    h1 = max(h1, SEA_LEVEL + 1);
    h2 = max(h2, SEA_LEVEL + 1);
    h3 = max(h3, SEA_LEVEL + 1);
    h4 = max(h4, SEA_LEVEL + 1);
  }

  // استيفاء من الزوايا الأربع
  return interpolate(h1, h2, h3, h4, rx, rz);
}
```

لكل biome `biome_base` تزيح ارتفاع المرجع، والزوايا الأربع مستخرجة من hash بإزاحات مختلفة. تجبر الصحراء الدنيا فوق مستوى البحر، سطر قيد يتجنب الماء دون حساب biomي إضافي.

### أشجار وصبار : وضع احتمالي

يستخدم توليد السطح نفس hash الـchunk ليقرر أين يزرع :

```c
// worldgen.c (مبسطة)

static void genFoliage (uint8_t *chunk_data, short cx, short cz,
                        uint32_t hash, uint8_t biome) {
  if (biome == BIOME_DESERT) {
    // صبار : مرشح واحد لكل chunk، يحدد hash الموضع
    int tx = (hash >> 8) & 7;
    int tz = (hash >> 12) & 7;
    int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
    if (chunk_data[ty * 64 + tz * 8 + tx] == B_sand)
      placeCactus(chunk_data, tx, ty + 1, tz);
  } else {
    // أشجار : يحدد hash إن وضعنا وأين
    int tree_count = (hash & 3);  // 0-3 أشجار لكل chunk
    for (int i = 0; i < tree_count; i ++) {
      int tx = ((hash >> (4 + i * 4)) & 7);
      int tz = ((hash >> (6 + i * 4)) & 7);
      int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
      placeTree(chunk_data, tx, ty + 1, tz);
    }
  }
}
```

0-3 أشجار لكل chunk للـbiomes الخضراء، وصبار واحد حدا للصحراء. hash الـchunk هو مصدر العشوائية الوحيد، `& 7` للموضع في chunk و`& 3` للعداد. كل شيء حتمي، ولا شيء مخزّن.

### generateChunk : تجميع الكل

الدالة التي تجمع كل شيء لإنتاج chunk كامل من 8×8×256 كتلة :

```c
// worldgen.c (مبسطة)

void generateChunk (uint8_t *chunk, short cx, short cz) {
  uint32_t hash = getChunkHash(cx, cz);
  uint8_t biome = getChunkBiome(cx, cz);

  // لكل عمود من chunk (8×8 = 64)
  for (int x = 0; x < 8; x ++) {
    for (int z = 0; z < 8; z ++) {
      // إحداثيات عالم مطلقة
      int wx = cx * 8 + x;
      int wz = cz * 8 + z;

      // ارتفاع العمود
      uint8_t height = getHeightAt(wx, wz);

      // ملء العمود من الأسفل للأعلى
      for (int y = 0; y < height; y ++) {
        uint8_t block = getTerrainBlock(wx, y, wz);
        chunk[y * 64 + z * 8 + x] = block;
      }
    }
  }

  // إضافة عناصر السطح (أشجار وصبار)
  genFoliage(chunk, cx, cz, hash, biome);
}
```

هذا كل شيء. 3 حلقات متداخلة : لكل عمود، إيجاد الارتفاع، وملء الكتل، والانتقال للتالي. المخرج `uint8_t[16384]` (8 × 8 × 256) يمثل chunk الكامل. يُولَّد chunk ويُرسَل مباشرة للعميل، دون المرور بتخزين مؤقت أو تحميل كسول أو ضغط.

## التخزين : مصفوفات ثابتة في كل مكان

بنية ذاكرة Bareiron هي C مضمن بكل مجدها : فقط جداول شاملة بثابت الحجم، لا malloc ولا hash maps ولا قوائم مربوطة.

### تغيرات الكتل

```c
// globals.h، أسطر 191-196

typedef struct {
  short x;      // بايتان، حد 32 000 كتلة أفقيا
  short z;      // بايتان
  uint8_t y;    // بايت، حد 256 كتلة عموديا
  uint8_t block; // بايت، حد 256 نوع كتلة
} BlockChange;
```

20 000 مدخل، أي حوالي **25 000 تغير**، ما يعادل chunk ونصف مُفرَّغين تماما. يسم الحقل `block` عند `0xFF` مدخلا حرا. البحث مسح خطي :

![Layout mémoire du tableau de blocs -- 6 bytes par entrée](/images/bareiron/memory-layout.jpg)

```c
// procedures.c

uint8_t getBlockChange (short x, uint8_t y, short z) {
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block == 0xFF) continue;
    if (block_changes[i].x == x && block_changes[i].y == y && block_changes[i].z == z)
      return block_changes[i].block;
    #ifdef ALLOW_CHESTS
      if (block_changes[i].block == B_chest) i += 14;  // تخطي بيانات الصندوق
    #endif
  }
  return 0xFF;
}
```

إضافة تغير مباشرة كالبحث :

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

عداد وفهرس وكتابة. يكتفي الجدول بالتكديس : لا فرز ولا دمج ولا إدارة ذاكرة. وعندما يمتلئ الجدول، تُتجاهَل التغيرات الجديدة، فيعود التضاريس لحالته المولدة.

تعليق الكاتب على حد 256 كتلة : "لا أخطط لتنفيذ السلالم النحاسية المؤكسدة قليلا المشمعة قريبا."

### الوحوش : 8 بايتات لكل رأس أنبوب

```c
// globals.h، أسطر 240-251 (pragma pack(push, 1) لإزالة الحشو)

typedef struct {
  uint8_t type;   // 25=دجاجة و28=بقرة و95=خنزير و106=خروف و145=زومبي
  short x;
  uint8_t y;      // إذا health=0، يصبح Y مؤقتا قبل الحذف
  short z;
  uint8_t data;   // بتات 0-4: صحة وبت 5: خروف مجزوز وبتان 6-7: مؤقت ذعر
} MobData;
```

8 بايتات. 16 موضعا حدا. المحاذاة والحشو إلى المهملات. بايت `data` هو حقل بتات منزلي : 5 بتات حياة وبت جز وبتان مؤقت ذعر. وعندما يموت وحش، يصبح حقل Y مؤقتا قبل الحذف. إعادة استخدام ذاكرة في مستوى البت.

### اللاعبون : مكتظون بإحكام

تستخدم بيانات اللاعبين `#pragma pack(push, 1)` أيضا، إحداثيات `short` + `uint8_t` ومخازن بجداول ثابتة من `uint16_t` + `uint8_t` وحقل `flags` يرمّز في آن واحد تهدئة الهجوم وحالة الظهور وتسلل وعدو وأكل وتحميل وتهدئة حركة وقفل صنع. كل ذلك في بتات فردية.

## الحلقة الرئيسية : while(true) وغير حاجبة

يعمل الخادم كله على حلقة وخيط واحد وصفر مكتبة أحداث.

```c
// main.c، أسطر 594-720

while (true) {
  task_yield();  // يترك watchdog يتنفس على ESP32

  // قبول اتصال جديد (غير حاجب)
  for (int i = 0; i < MAX_PLAYERS; i ++) {
    if (clients[i] != -1) continue;
    clients[i] = accept(server_fd, ...);
    if (clients[i] != -1) client_count ++;
    break;
  }

  // Tick الخادم إذا حان الوقت
  if (get_program_time() - last_tick_time > TIME_BETWEEN_TICKS) {
    handleServerTick(time_since_last_tick);
    last_tick_time = get_program_time();
  }

  // Round-robin : عميل واحد وحزمة واحدة لكل تكرار
  client_index = (client_index + 1) % MAX_PLAYERS;
  if (clients[client_index] == -1) continue;

  // قراءة ترويسة الحزمة : طول + معرف
  recv(client_fd, &recv_buffer, 2, MSG_PEEK);
  int length = readVarInt(client_fd);
  int packet_id = readVarInt(client_fd);
  handlePacket(client_fd, length - sizeVarInt(packet_id), packet_id, state);
}
```

يُعالَج عميل واحد لكل تكرار من الحلقة، وتُقرَأ حزمة واحدة في كل مرة. يترك `task_yield()` في بداية الحلقة مهمة FreeRTOS الخاملة تتنفس على ESP32، ودونه يُصفَّرك مؤقت watchdog.

توزيع الحزم هو switch وحشي من **400 سطر** :

```c
// main.c، أسطر 68-497

void handlePacket (int client_fd, int length, int packet_id, int state) {
  switch (packet_id) {
    case 0x00:  // Handshake / Status / Login حسب الحالة
    case 0x01:  // Status ping
    case 0x02:  // رسالة Plugin
    case 0x03:  // إقرار Login/configuration
    case 0x08:  // دردشة
    case 0x0B:  // حالة Client (إعادة ظهور)
    case 0x11:  // نقر حاوية (يدير الصناديق)
    case 0x19:  // تفاعل كيان
    case 0x1D..0x20:  // حزم حركة (أكبر حالة)
    case 0x28:  // فعل لاعب (حفر/وضع)
    // ... 40+ حالة
  }
}
```

يُجمَّع switch في جدول قفز ثابت، مما يستبدل جدول قفز ديناميكيا وvtable وmap. مثالي للمضمن.

الحالة `0x1D-0x20` هي الأكبر، فتدير تحديثات الموضع وأضرار السقوط وعبور حدود chunk وظهور الوحوش وتوليد chunks والجوع. الكل في fall-through ضخم واحد.

![Le code du serveur Bareiron -- 6800 lignes de C](/images/bareiron/code-shot.jpg)

## tick الخادم وذكاء الوحوش

تُستدعَى الدالة `handleServerTick` كل 50 ms (20 TPS). تدير العالم بينما تعتني الحلقة الرئيسية باللاعبين :

```c
// main.c (مبسطة)

void handleServerTick (uint32_t delta) {
  // تحديث كل وحش
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type == 0 || mobs[i].data == 0) continue;  // ميت أو فارغ

    MobData *mob = &mobs[i];
    int px, pz;
    getNearestPlayer(mob->x, mob->z, &px, &pz);

    if (mob->type == MOB_ZOMBIE) {
      // عدائي : يمشي نحو أقرب لاعب
      if (px < mob->x) mob->x --;
      else if (px > mob->x) mob->x ++;
      if (pz < mob->z) mob->z --;
      else if (pz > mob->z) mob->z ++;
      // أضرار تماس على بعد كتلتين
      if (abs(px - mob->x) <= 2 && abs(pz - mob->z) <= 2)
        damagePlayer(getNearestPlayerId(mob->x, mob->z), 3);
    } else {
      // سلبي : 8 اتجاهات عشوائية
      uint8_t dir = getMobDir(mob);
      mob->x += dir_lookup[dir][0];
      mob->z += dir_lookup[dir][1];
      // تغيير اتجاه كل ~40 ticks
      if (mob->data >> 6 < 1) setMobDir(mob, rand() & 7);
      mob->data = (mob->data & 0x3F) | ((mob->data - 0x40) & 0xC0);
    }

    // إيقاظ chunks حول الوحش
    setChunkGenerated(mob->x / 8, mob->z / 8);
  }
}
```

ذكاء الوحوش العدائية هو مقارنة إحداثيات. حرفيا `if (px < x) x--`. يتجاهل الزومبي إيجاد المسار وA* وتجنب العوائق : يضبط X وZ مستقلا نحو اللاعب، فيعبر الجدران إن وجدت.

أضرار التماس 3 قلوب/ثانية. أرادها p2r3 مرتفعة لأن غياب إيجاد المسار يجعل الزومبي سهل المراوغة.

صيغة الدرع هي ما قبل تحديث القتال، الأبسط الممكنة :

```c
// main.c (مبسطة)

static uint8_t applyArmor (uint8_t damage, uint16_t armor_value) {
  // صيغة ما قبل 1.9 : تخفيض خطي
  // كل نقطة درع = 4% تخفيض وحد 80%
  uint8_t reduction = (armor_value * 4);
  if (reduction > 80) reduction = 80;
  return damage * (100 - reduction) / 100;
}
```

الماس الكامل = 80% تخفيض. ضربة زومبي بـ3 قلوب تصبح 0.6 قلوب. اختار p2r3 هذه الصيغة القديمة لأنها تُحسَب في عمليتين، لا عتبات ولا منحنيات، فقط نسبة خطية.

الوحوش السلبية : 8 اتجاهات في جدول بحث، وتغيير مسار كل ~40 ticks. يرمّز الحقل `data` الاتجاه الجاري في بتين قويين، ومؤقت تغيير الاتجاه في البتات الستة الباقية.

![Mobs dans Bareiron -- zombies, cochons, moutons](/images/bareiron/mobs.jpg)

### إعادة ظهور الوحوش

لا تظهر الوحوش مع ticks عشوائية. بل تظهر عندما يلتقي tick الخادم حد chunk جديدا :

```c
if (player crossed chunk boundary) {
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type != 0) continue;
    spawnMob(&mobs[i], new_chunk_coords, getChunkHash(cx, cz));
    break;
  }
}
```

نفس RNG كالتضاريس ونفس بذرة chunk. وإذا كان موضع وحش حرا، فالظهور حتمي.

## الصنع : لا مصفوفات، بل if/else

```c
// crafting.c، أسطر 9-347 (مبسطة)

void getCraftingOutput (PlayerData *player, uint8_t *count, uint16_t *item) {
  // إذا رُفع العلم 0x80، يُستخدَم عازل الصنع من صندوق
  if (player->flags & 0x80) { *count = 0; *item = 0; return; }

  // عد الخانات وإيجاد أول عنصر والتحقق من التماثل
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
    case 1:  /* ألواح وسبائك... */
    case 2:  /* عصي ومقصات ومشاعل */
    case 3:  /* مجارف وسيوف وألواح */
    case 4:  /* طاولة صنع وأحذية */
    case 5:  /* معاول وفؤوس وخوذ */
    case 7:  /* سراويل ومُسمِّدات */
    case 8:  /* فرن وصندوق ودرع */
    case 9:  /* كتل كاملة (حديد وذهب، إلخ.) */
  }
}
```

الفحص الأول : إذا رُفع علم `0x80`، أُعيد تدوير عازل الصنع كمؤشر صندوق. يبقى الصنع مقفلا.

ثم يعد الخانات المملوءة، ويلاحظ أول عنصر، ويتحقق من التماثل. ومع ذلك فقط، تطابق الفرن في 4 فحوص :

```c
if (count == 8 && first == cobblestone && all_identical && center_empty)
    return furnace;
```

للأشكال المعقدة، يستخدم فهرس أول عنصر ويفحص الموضع النسبي. تتشارك الوصفات نفس دالة المطابقة، فالمادة تحدد النتيجة.

![Interface de craft et coffre dans Bareiron](/images/bareiron/crafting.jpg)

## الصناديق : hack الحقيقي

hack الذاكرة الذي يتكلم عنه الجميع، في كود حقيقي :

```c
// procedures.c، أسطر 1262-1293

if (target == B_chest) {
  // البحث عن مدخل الصندوق في جدول الكتل
  uint8_t *storage_ptr = NULL;
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block != B_chest) continue;
    if (block_changes[i].x != x || block_changes[i].y != y || block_changes[i].z != z)
      continue;
    storage_ptr = (uint8_t *)(&block_changes[i + 1]);  // يشير بعد كتلة الصندوق
    break;
  }
  if (storage_ptr == NULL) return;

  // Terrible memory hack!!
  // ننسخ المؤشر في جدول عناصر صنع اللاعب
  memcpy(player->craft_items, &storage_ptr, sizeof(storage_ptr));
  player->flags |= 0x80;  // يقفل الصنع

  // إرسال واجهة الصندوق للعميل
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

والتعليق في الكود : `// Terrible memory hack!!1!`

إنه ذلك بالضبط. يأخذ عنوان ذاكرة المدخل التالي في `block_changes[]`، وينسخه في `player->craft_items` (وهو `uint16_t[9]`، أي 18 بايت، كافٍ لتخزين مؤشر 32 بت)، ويرفع العلم لكي لا يحاول أحد الصنع أثناء ذلك.

مع كل نقرة في مخزون الصندوق :

```c
// packets.c، أسطر 620-638

uint8_t *storage_ptr;
memcpy(&storage_ptr, player->craft_items, sizeof(storage_ptr));
// يشير storage_ptr الآن لبيانات الصندوق
uint16_t *p_item = (uint16_t *)(storage_ptr + (slot - 41) * 3);
uint8_t *p_count = storage_ptr + (slot - 41) * 3 + 2;
```

يستعيد المؤشر من عازل الصنع، ويصل للخانات مع إزاحة. تُخزَّن بيانات الصندوق بمعدل 3 بايتات لكل خانة (2 للمعرف و1 للكمية)، ملتصقة ببعضها في جدول الكتل.

![Données de coffre stockées dans le tableau de blocs -- un hack mémoire](/images/bareiron/chest-hack.jpg)

## الجوع : 5 أسطر عبقرية

```c
// main.c، أسطر 293-305

// يرسل اللاعبون حزم حركة ~20/ثانية عندما
// يتحركون، وأقل بكثير عندما يكونون ساكنين. نربط ذلك
// مع النشاط لمحاكاة الجوع مجانا.
if (player->saturation == 0) {
  if (player->hunger > 0) player->hunger--;
  player->saturation = 200;
  sc_setHealth(client_fd, player->health, player->hunger, player->saturation);
} else if (player->flags & 0x08) {  // عدو
  player->saturation -= 1;
}
}
```

إنه ذلك حرفيا. 5 أسطر. كل حزمة حركة تنقص التشبع. وعندما يبلغ التشبع صفرا، ينقص الجوع ونُصفَّر التشبع. العدو (علم `0x08`) يضاعف الاستنزاف.

صفر مؤقت وصفر ذاكرة مخصصة وصفر حساب مخصص. عداد ينقص على حزم موجودة فعلا.

### أضرار السقوط

أبسط نظام أضرار في المشروع :

```c
// عندما يغادر اللاعب الأرض، نخزن Y خاصته
// وعندما يلمس الأرض مجددا، نطرح
degats = dernier_y_au_sol - y_actuel;
```

عملية طرح واحدة.

## تعدين الكتل ووضعها

عندما تنقر كتلة، تهبط حزمة `0x28` (فعل لاعب) في switch. يجب أن يحدد المعالج أي كتلة في الموضع، ويزيلها، ويضع العنصر في المخزون :

```c
// main.c، الحالة 0x28 (مبسطة)

void handlePlayerAction (int client_fd, uint8_t action, int x, uint8_t y, int z) {
  switch (action) {
    case START_DESTROY_BLOCK: {
      // تحديد نوع الكتلة عند الموضع المنقور
      uint8_t block = getBlockAt(x, y, z);

      if (block == B_chest) {
        openChest(client_fd, x, y, z);
        break;
      }

      // إضافة لـblock_changes
      addBlockChange(x, z, y, 0);  // 0 = هواء

      // إعطاء العنصر للاعب (ثقة بالعميل)
      addItemToPlayer(client_fd, block_to_item(block), 1);

      // إرسال التحديث للعميل
      sc_blockChange(client_fd, x, y, z, 0);
      sc_ackBlockChange(client_fd, x, y, z, 0);
      break;
    }
    case PLACE_BLOCK: {
      // قراءة نوع الكتلة من يد اللاعب
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

تجمع `getBlockAt` توليد التضاريس وتغيرات اللاعبين :

```c
uint8_t getBlockAt (int x, uint8_t y, int z) {
  // أولا فحص تغيرات اللاعبين
  uint8_t change = getBlockChange(x, y, z);
  if (change != 0xFF) return change;

  // وإلا، قراءة من التضاريس المولدة
  return getTerrainBlock(x, y, z);
}
```

أولوية للتغيرات، وfallback على التضاريس. صفر نقاش وصفر كاش وصفر عبء. `getTerrainBlock` تحت الغطاء هو `getHeightAt` + طبقات stone/dirt/grass/coal.

### الفرن الفوري

الأطرف : لا يوجد الفرن ككيان. وإذا وضعت cobblestone في خانة "طهي" وcoal في "وقود"، تظهر النتيجة فورا، دون مؤقت ولا chunk ticking : إنها فقط خانة مخزون تُفرَغ عندما تضع العناصر الصحيحة.

![Fourneau instantané -- pose les ingrédients, résultat immédiat](/images/bareiron/furnace.jpg)

## حلقة ESP32 : خادم MC في 4 KB من stack

```c
// main.c، أسطر 732-779

#ifdef ESP_PLATFORM

void bareiron_main (void *pvParameters) {
  main();
  vTaskDelete(NULL);
}

static void wifi_event_handler (...) {
  if (/* متصل */) {
    xTaskCreate(bareiron_main, "bareiron", 4096, NULL, 5, NULL);
  }
}

void app_main () {
  esp_timer_early_init();
  wifi_init();
  // الباقي يُدار بواسطة معالج الحدث
}
#endif
```

يعمل الخادم كله في مهمة FreeRTOS مع **4096 بايت من stack**. هذا كل شيء. لا يفعل خيط main الرئيسي إلا تهيئة WiFi وانتظار اتصال. وبمجرد الاتصال، يُنشِئ `bareiron_main` الذي يستدعي `main()` القياسية.

كل كود ESP32 الخاص محمي بـ`#ifdef ESP_PLATFORM`. على PC، يُجمَّع كل ذلك في كود POSIX قياسي.

## ما ضُحِّي به

لكي يتسع كل ذلك، هناك مزايا vanilla غير موجودة :

- **صفر ضغط شبكة**، zlib مكلف أكثر من اللازم. يولّد الخادم chunks سريعا، لكن إرسالها هو عنق الزجاجة.
- **صفر ticks عشوائية**، تنمو الأشجار مع bone meal أم لا. تظهر الوحوش على حدود chunk.
- **صفر كيان عنصر**، تذهب الكتل المُعدَّنة مباشرة للمخزون. الحركة بصرية خالصة.
- **لا فحص مخزون**، ثقة بالعميل. 64 ماسة ؟ حسنا. chunk مُعدَّن في ثانية ؟ حسنا. للاستخدام بين أناس موثوقين.
- **صفر إضاءة خادم**، تُرسَل المشاعل بعد كل الباقي، فيحسب العميل.
- **صفر سوائل تدريجية**، حالة نهائية فورية.

## النتيجة النهائية

Ryzen 5 3600 : ~0.5 ms لكل chunk.
ESP32-C3 بدولار : ~200 ms لكل chunk. قابلة للعب.

![Benchmark de génération de chunks -- Ryzen vs ESP32](/images/bareiron/performance.jpg)

3+ لاعبين : تتباطأ. قابلة للمقارنة مع 2b2t في ساعات الذروة، حسب الكاتب.

![Plusieurs joueurs connectés au même serveur Bareiron](/images/bareiron/multiplayer.jpg)

## الفلسفة

p2r3 : "أحب فقط فكرة أن هذه الشريحة الصغيرة بدولار التي تستهلك 0.5 Watt تستطيع تشغيل شيء متقدم كـMinecraft. العلم ليس عن 'لماذا'، بل عن 'لماذا لا'."

كل سطر مقايضة :
- ضجيج Perlin ← استيفاء : أقل جمالا وأسرع 200x وصفر ذاكرة
- مصفوفات صنع ← مطابقة مُرمَّزة صلبا : كود قبيح وصفر بايت
- zlib ← لا شيء : اتصال سيئ = موت، لكن قابل للعب
- تحقق ← ثقة : صفر أمان وصفر حساب

كل مزية غائبة تسمح لأخرى بالوجود في حدود العتاد.

**النقاط الثلاث للتذكر :**

1. **استيفاء + RNG**، 4 نقاط مُبذَرة وتضاريس لانهائية وصفر تخزين واستعلام دون إعادة توليد chunk و200 ms توليد. إنها حركة العبقرية التي تجعل كل الباقي ممكنا.
2. **لكل مزية kost**، غياب الضغط والـticks العشوائية والتحقق خيار مفترض : وهذا ما يسمح بالتسع في 520 KB.
3. **hacks القذرة هي الأذكى**، صناديق في جدول الكتل عبر memcpy وجوع بحزم حركة وفرن فوري. كان الحل النظيف مكلفا أكثر من اللازم.

إذا كان المشروع يهمك، فالكله على [GitHub برخصة GPLv3](https://github.com/p2r3/bareiron/). إنه C قذر فعلا، ونادرا ما استمتعت هكذا بقراءة كود مصدري.
