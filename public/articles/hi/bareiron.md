---
title: Bareiron -- वह Minecraft सर्वर जो 1$ के माइक्रोकंट्रोलर पर चलता है
description: C की 6800 लाइनें, शून्य malloc, bilinear interpolation से बदला गया Perlin noise,
  tile map में biomes, और यह सब एक 1$ की चिप पर।
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
author_sig: "MEUCIAOvrMf15eFdXzveonrdREdqhs8Ot6flAe8/BXX6MVGUAiEAylS88HDNCvx+a9bwDQ89VVFyDsBWGZdKOC4HTgBGXzU="
---

## परिचय

क्या तुमने कभी सोचा है कि क्या 1 रुपए के माइक्रोकंट्रोलर पर Minecraft सर्वर चलाया जा सकता है?

मैंने सोचा। और जवाब है हाँ। सचमुच।

एक प्रोजेक्ट है जिसका नाम है [Bareiron](https://github.com/p2r3/bareiron/), p2r3 द्वारा, और यह शायद Minecraft की दुनिया में पिछले कुछ वर्षों में देखी गई सबसे आकर्षक परियोजनाओं में से एक है। हम बात कर रहे हैं एक बाइनरी की जो **300 किलोबाइट** में समाती है, **C की 6800 लाइनें**, शून्य बाहरी निर्भरता, कोई malloc नहीं, कोई threading नहीं, और यह **1 डॉलर की ESP32** पर चलती है।

![ESP32-C3, वह माइक्रोकंट्रोलर जो सर्वर चलाता है](/images/bareiron/esp32-board.jpg)

अनंत terrain जनरेशन। Biomes। गुफाएँ। Crafting। Mining। Mobs। भूख। Chests। वह सब कुछ जो तुम एक survival सर्वर से उम्मीद करते हो।

एक चिप पर जो **0.5 Watt** खपत करती है और जिसकी clock **160 MHz** है।

परिप्रेक्ष्य देने के लिए: एक vanilla Minecraft सर्वर को कई गीगाबाइट RAM चाहिए। ESP32-C3 के पास **520 KB SRAM** है (बूट के बाद 400 उपलब्ध)। 20 साल पहले के प्रोसेसर पहले से ही गीगाहर्ट्ज़ पर चल रहे थे — यह 160 MHz पर अटका है। शुद्ध शक्ति में दोनों के बीच का कारक लगभग **20,000** है।

p2r3 ने C में Minecraft सर्वर नहीं लिखा, उन्होंने सर्वर के हर घटक को फिर से आविष्कार किया ताकि वह इन सीमाओं में समा सके। आइए देखें कैसे, सोर्स कोड खोलकर।

![p2r3 द्वारा Bareiron प्रस्तुति वीडियो का थंबनेल](/images/bareiron/title-card.jpg)

## प्रोजेक्ट का दिमाग: बिना मेमोरी के terrain जनरेशन

सबसे बड़ी समस्या जब तुम एक एम्बेडेड MC सर्वर बनाना चाहते हो, वह है terrain जनरेशन।

Minecraft vanilla में, दुनिया **Perlin noise** से उत्पन्न होती है: कई सुपरइम्पोज़्ड परतें (octaves), 6 बायोमिक पैरामीटर (तापमान, नमी, महाद्वीपीयता, अपरदन, weirdness, गहराई), और कैशिंग की एक पूरी प्रणाली ताकि हर बार सब कुछ पुनर्गणना न करना पड़े।

परिणाम शानदार है। लेकिन यह गणना में भारी है, और उत्पन्न chunks को संग्रहीत करने के लिए RAM लेता है।

Bareiron का दृष्टिकोण मौलिक रूप से भिन्न है। शोर को स्टैक करने के बजाय, यह एक **नियतिवादी RNG** द्वारा उत्पन्न 4 बिंदुओं पर **bilinear interpolation** का उपयोग करता है।

तुम्हें पता है जब तुम एक छोटी पिक्सेलेटेड छवि को बड़ा करते हो और किनारे धुंधले हो जाते हैं? बिल्कुल वैसा ही।

```c
// worldgen.c, लाइनें 117-171 (सरलीकृत)

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

मानक bilinear interpolation: 4 कोने, स्थिति के अनुसार भार, एक एकल `uint8_t` आउटपुट। CHUNK_SIZE 8 है, इसलिए यह पूर्णांक गुणन में होता है, कोई float नहीं।

p2r3 इसे वीडियो में चरण दर चरण दिखाते हैं: पहले chunk के 4 कोने, प्रत्येक की ऊँचाई RNG द्वारा seed की गई।

![chunk के 4 कोने, प्रत्येक नियतिवादी RNG द्वारा seed किया गया](/images/bareiron/gen-four-corners.jpg)

फिर इन 4 बिंदुओं के बीच interpolation एक सतत सतह बनाता है।

![4 कोनों के बीच bilinear interpolation का अनुप्रयोग](/images/bareiron/gen-interpolate.jpg)

और पैटर्न को सभी आसन्न chunks पर दोहराकर, हमें एक ऐसा terrain मिलता है जो अनंत तक फैलता है।

![अंतिम परिणाम: सतत अनियमित terrain](/images/bareiron/gen-result.jpg)

### नियतिवादी RNG

वह कुंजी जो यह सब संभव बनाती है, वह है seeding। प्रत्येक chunk के 4 कोने होते हैं, और प्रत्येक कोने को एक अद्वितीय लेकिन पुनरुत्पादनीय छद्म-यादृच्छिक मान की आवश्यकता होती है।

```c
// worldgen.c, लाइनें 13-22

uint32_t getChunkHash (short x, short z) {
  uint8_t buf[8];
  memcpy(buf, &x, 2);          // 16 bits of X coordinate
  memcpy(buf + 2, &z, 2);      // 16 bits of Z coordinate
  memcpy(buf + 4, &world_seed, 4);  // 32 bits of global seed
  return splitmix64(*((uint64_t *)buf));  // hash
}
```

यह X के 16 bits, Z के 16 bits, और seed के 32 bits को 8 बाइट के बफर में पैक करता है, और पूरे को `splitmix64` में डालता है। परिणाम: दुनिया की seed के आधार पर प्रत्येक स्थिति के लिए एक अद्वितीय नियतिवादी मान।

समझ में आया कि यह कितना शक्तिशाली है? सर्वर को terrain संग्रहीत करने की आवश्यकता नहीं है। जब खिलाड़ी किसी नए क्षेत्र में आता है तो यह मौके पर पुनर्गणना करता है, और हर बार बिल्कुल वही परिणाम देता है।

उपयोग किया गया `splitmix64` एक अति-त्वरित PRNG है जो 64-bit हैश के लिए डिज़ाइन किया गया है:

```c
// worldgen.c (सरलीकृत)

static uint32_t splitmix64 (uint64_t state) {
  state += 0x9E3779B97F4A7C15ull;
  uint64_t z = state;
  z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ull;
  z = (z ^ (z >> 27)) * 0x94D049BB133111EBull;
  return (z ^ (z >> 31)) >> 32;
}
```

3 ऑपरेशन: जोड़, xor/shift, गुणन, xor/shift, गुणन, xor/shift। कोई lookup table नहीं, कोई लूप नहीं। यह 8 बाइट का बफर (X + Z + seed) लेता है, इसे 64-bit पूर्णांक के रूप में मानता है, और 32 bits हैश लौटाता है। यह नियतिवादी, तेज़ है, और 5 लाइनों में समाता है।

### यह Perlin noise क्यों नहीं है

p2r3 स्वयं वीडियो में कहते हैं: "तुम यादृच्छिक संख्या में जितने अधिक digits जोड़ते हो, terrain उतना ही नियमित होता जाता है, जैसे अधिक सिक्का उछालने से तुम 50/50 के करीब पहुँचते हो"। व्यवहार में, यह हैश bits की संख्या है जिसे वह जोड़ता है:

```c
// worldgen.c, लाइनें 51-115

// For a plains biome: 4 factors combined → regular terrain
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// For snowy plains: 2 factors → more rugged
h = (hash % 5) + ((hash >> 4) % 5);
```

प्रत्येक biome चुनता है कि वह कितने bit निष्कर्षण जोड़ता है। जितने अधिक होंगे, वितरण उतना ही स्थिर होगा — जैसे अधिक सिक्का उछालने से 50/50 के करीब पहुँचना। जितने कम होंगे, स्थानीय विविधताएँ उतनी ही मजबूत होंगी।

![अनियमित terrain -- कम कारक, मजबूत विविधताएँ](/images/bareiron/terrain-irregular.jpg)

केवल 2 कारकों के साथ, snowy plains एक पहाड़ी, लगभग पर्वतीय terrain उत्पन्न करता है। चोटियाँ और गड्ढे अक्सर होते हैं।

![नियमित terrain -- कई कारक, चिकनी सतह](/images/bareiron/terrain-regular.jpg)

4 कारकों के साथ, plains सपाट और पूर्वानुमेय रहते हैं। वितरण स्थिर हो जाता है।

एक chunk ESP32 पर **200 ms** में उत्पन्न होता है — उसी हार्डवेयर पर Perlin noise के साथ अमापनीय समय की तुलना में, यह इतना महँगा है।

### वह विवरण जो कमाल का है: पूरा chunk उत्पन्न किए बिना एक ब्लॉक को क्वेरी करना

तुम खेलते हो, तुम एक ब्लॉक खोदते हो। सर्वर को पता होना चाहिए कि तुम्हें कौन सी item देनी है। सामान्यतः, इसके लिए पूरा chunk उत्पन्न करना होगा।

bilinear interpolation के साथ, तुम निर्देशांकों से सीधे समतल के **किसी भी बिंदु** को क्वेरी कर सकते हो। chunk के कोने खिलाड़ी की स्थिति से प्राप्त होते हैं, interpolation तुम्हें किसी भी offset पर ऊँचाई देता है। गणितीय संचालन की एक मुट्ठी, कोई chunk जनरेशन नहीं।

p2r3: "मैं एक जादुई फ़ंक्शन चाहता हूँ जो मुझे बता सके कि किसी दिए गए निर्देशांक पर कौन सा ब्लॉक है, बिना मेमोरी एक्सेस किए या महँगी noise मैप की गणना किए"। उन्होंने ठीक यही किया।

यहाँ बताया गया है कि ऊँचाई ठोस ब्लॉकों में कैसे बदलती है:

```c
// worldgen.c (सरलीकृत)

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

5 शर्तें। grass/dirt/stone/deepslate/bedrock की एक परत। सतह का ब्लॉक `biome_top[]` के माध्यम से biome पर निर्भर करता है — plains के लिए grass, रेगिस्तान के लिए sand। कोई लूप नहीं, कोई switch नहीं, if का एक झरना जो सही परत में गिरता है।

### गुफाएँ, सबसे आलसी mirror

```c
cave_altitude = CAVE_BASE_DEPTH - (surface_height - y);
```

यह ज़मीन के नीचे सतह की ऊँचाई को mirror करता है। यह deepslate की बड़ी गुहाओं जैसा दिखता है। शून्य गणना, एक लाइन।

![सतही terrain के mirror द्वारा उत्पन्न गुफाएँ](/images/bareiron/cave-mirror.jpg)

![गुफाएँ उत्पन्न करने के लिए terrain mirror का आरेख](/images/bareiron/cave-diagram.jpg)

### अयस्क, XOR संस्करण

```c
candidate = (chunk_x ^ col_x ^ col_z) % 100;
if (candidate < 5 && y < 16) -> diamond
```

निर्देशांकों का XOR प्रति स्तंभ एक उम्मीदवार की गारंटी देता है। प्रकार केवल ऊँचाई पर निर्भर करता है। हीरे गुफाओं के सबसे निचले बिंदु के नीचे छिपे होते हैं ताकि खुदाई उपयोगी बनी रहे।

### Tile map में Biomes

प्रत्येक biome एक ग्रिड में एक गोलाकार द्वीप है, इसका प्रकार seed से गणना किए गए पैटर्न द्वारा निर्धारित होता है। ग्रिडेड, पूर्वानुमेय, और मुफ्त।

![Tile map में biomes का नक्शा -- प्रत्येक द्वीप एक अलग biome है](/images/bareiron/biome-tilemap.jpg)

प्रत्येक biome के अपने पैरामीटर सेट होते हैं जो सारणियों में एन्कोडेड होते हैं:

```c
// worldgen.c (सरलीकृत)

static const uint8_t biome_base[] = {
  [BIOME_PLAINS]  = 48,   // base height: 48
  [BIOME_DESERT]  = 52,   // slightly higher
  [BIOME_FOREST]  = 50,   // in between
  [BIOME_TAIGA]   = 46,   // a bit lower
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
  [BIOME_FOREST]  = 4,   // 4 extractions → regular, rolling
  [BIOME_TAIGA]   = 3,   // 3 extractions → moderate
  [BIOME_SNOWY]   = 2,   // 2 extractions → very rugged
};
```

**Plains**: ऊँचाई 48, 4 कारक → बहुत सपाट terrain, घास।

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// Result: max ±4 blocks variation
```

**Desert**: ऊँचाई 52, 3 कारक, सतह ब्लॉक = sand। कभी समुद्र तल से नीचे नहीं।

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3);
// Result: max ±6 blocks variation, clamped to SEA_LEVEL+1
```

**Forest**: ऊँचाई 50, 4 कारक जैसे plains लेकिन ऊँचा आधार → जंगली पहाड़ियाँ।

**Taiga**: ऊँचाई 46, 3 कारक → मध्यम विविधताएँ, ठंडा terrain।

**Snowy plains**: ऊँचाई 40, केवल 2 कारक → सबसे उबड़-खाबड़।

```c
h = (hash % 5) + ((hash >> 4) % 5);
// Result: max ±14 blocks variation
```

प्रत्येक biome **5 प्रविष्टियों की 3 सारणियों** में एन्कोडेड है: आधार ऊँचाई, सतह ब्लॉक, कारकों की संख्या। जब `getHeightAtFromHash` biome प्राप्त करता है, तो यह terrain को समायोजित करने के लिए इन सारणियों से परामर्श करता है। Minecraft की पूरी biome प्रणाली को बदलने के लिए 15 बाइट्स डेटा।

biome डिटेक्टर यह निर्धारित करने के लिए seed का उपयोग करता है कि प्रत्येक chunk किस biome से मेल खाता है:

```c
// worldgen.c (सरलीकृत)

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

16 प्रविष्टियों का एक पैटर्न, एक index जो chunk के निर्देशांकों द्वारा seed किया गया है। यह एक दोहरावदार लेकिन दृश्य रूप से सुसंगत ग्रिड देता है। Minecraft vanilla की पूरी बायोमिक पैरामीटर प्रणाली को बदलने के लिए कोड की 4 लाइनें।

### getHeightAtFromHash: terrain असेंबलर

जनरेशन के केंद्र में फ़ंक्शन biome द्वारा seed किए गए 4 कोनों को जोड़ता है:

```c
// worldgen.c (सरलीकृत)

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

  // Interpolation from the 4 corners
  return interpolate(h1, h2, h3, h4, rx, rz);
}
```

प्रत्येक biome में एक `biome_base` होता है जो संदर्भ ऊँचाई को स्थानांतरित करता है, और 4 कोने हैश से अलग-अलग ऑफसेट के साथ निकाले जाते हैं। रेगिस्तान न्यूनतम को समुद्र तल से ऊपर बाध्य करता है — एक बाधा रेखा जो अतिरिक्त बायोमिक गणना के बिना पानी से बचाती है।

### पेड़ और कैक्टस: संभाव्य स्थापना

सतह जनरेशन यह तय करने के लिए उसी chunk हैश का उपयोग करता है कि कहाँ लगाया जाए:

```c
// worldgen.c (सरलीकृत)

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
    // Trees: hash determines if and where
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

हरे biomes के लिए 0-3 पेड़ प्रति chunk, रेगिस्तान के लिए अधिकतम 1 कैक्टस। chunk का हैश एंट्रॉपी का एकमात्र स्रोत है — chunk में स्थिति के लिए `& 7`, काउंटर के लिए `& 3`। सब कुछ नियतिवादी है, कुछ भी संग्रहीत नहीं है।

### generateChunk: सब कुछ एक साथ रखना

वह फ़ंक्शन जो 8×8×256 ब्लॉकों का पूरा chunk उत्पन्न करने के लिए सब कुछ एक साथ रखता है:

```c
// worldgen.c (सरलीकृत)

void generateChunk (uint8_t *chunk, short cx, short cz) {
  uint32_t hash = getChunkHash(cx, cz);
  uint8_t biome = getChunkBiome(cx, cz);

  // For each column of the chunk (8×8 = 64)
  for (int x = 0; x < 8; x ++) {
    for (int z = 0; z < 8; z ++) {
      // Absolute world coordinates
      int wx = cx * 8 + x;
      int wz = cz * 8 + z;

      // Column height
      uint8_t height = getHeightAt(wx, wz);

      // Fill column from bottom to top
      for (int y = 0; y < height; y ++) {
        uint8_t block = getTerrainBlock(wx, y, wz);
        chunk[y * 64 + z * 8 + x] = block;
      }
    }
  }

  // Add surface elements (trees, cacti)
  genFoliage(chunk, cx, cz, hash, biome);
}
```

बस इतना ही। 3 नेस्टेड लूप: प्रत्येक स्तंभ के लिए, ऊँचाई खोजें, ब्लॉक भरें, अगले पर जाएँ। आउटपुट एक `uint8_t[16384]` (8 × 8 × 256) है जो पूर्ण chunk का प्रतिनिधित्व करता है। कोई कैशिंग नहीं, कोई lazy loading नहीं, कोई संपीड़न नहीं — chunk उत्पन्न होता है और सीधे क्लाइंट को भेजा जाता है।

## संग्रहण: हर जगह स्थिर arrays

Bareiron की मेमोरी आर्किटेक्चर अपनी पूरी महिमा में एम्बेडेड C है। कोई malloc नहीं, कोई hash maps नहीं, कोई linked lists नहीं।

सब कुछ निश्चित आकार की वैश्विक सारणियों में है।

### ब्लॉक परिवर्तन

```c
// globals.h, लाइनें 191-196

typedef struct {
  short x;      // 2 bytes -- limits to 32,000 blocks horizontally
  short z;      // 2 bytes
  uint8_t y;    // 1 byte -- limits to 256 blocks vertically
  uint8_t block; // 1 byte -- limits to 256 block types
} BlockChange;
```

20,000 प्रविष्टियाँ, यानी लगभग **25,000 परिवर्तन** — डेढ़ chunk के बराबर पूरी तरह से खोदा गया। `block` फ़ील्ड पर `0xFF` एक खाली प्रविष्टि को चिह्नित करता है। खोज एक रैखिक स्कैन है:

![ब्लॉक सारणी का मेमोरी लेआउट -- 6 बाइट्स प्रति प्रविष्टि](/images/bareiron/memory-layout.jpg)

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

परिवर्तन जोड़ना खोज जितना ही सीधा है:

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

एक काउंटर, एक इंडेक्स, एक राइट। कोई सॉर्टिंग नहीं, कोई कॉम्पैक्शन नहीं, कोई मेमोरी प्रबंधन नहीं। जब सारणी भर जाती है, नए परिवर्तनों को अनदेखा कर दिया जाता है — terrain अपनी उत्पन्न स्थिति में वापस आ जाता है।

लेखक की टिप्पणी 256 ब्लॉकों की सीमा पर: "मैं जल्द ही थोड़े पेटिना वाली पॉलिश की गई तांबे की सीढ़ियाँ लागू करने की योजना नहीं बना रहा हूँ।"

### Mobs: 8 बाइट्स प्रति सिर

```c
// globals.h, लाइनें 240-251 (pragma pack(push, 1) padding हटाने के लिए)

typedef struct {
  uint8_t type;   // 25=chicken, 28=cow, 95=pig, 106=sheep, 145=zombie
  short x;
  uint8_t y;      // if health=0, Y becomes a timer before deletion
  short z;
  uint8_t data;   // bits 0-4: health, bit 5: sheep sheared, bits 6-7: panic timer
} MobData;
```

8 बाइट्स। अधिकतम 16 स्लॉट। कोई alignment नहीं, कोई padding नहीं। `data` बाइट एक घरेलू bitfield है: स्वास्थ्य के 5 bits, शीयरिंग का 1 bit, पैनिक टाइमर के 2 bits। और जब कोई mob मरता है, तो Y फ़ील्ड हटाने से पहले एक टाइमर बन जाता है। बिट स्तर पर मेमोरी का पुन: उपयोग।

### खिलाड़ी: कसकर पैक किए गए

खिलाड़ी डेटा भी `#pragma pack(push, 1)` का उपयोग करता है — निर्देशांक `short` + `uint8_t` में, इन्वेंट्री `uint16_t` + `uint8_t` की निश्चित सारणियों में, और एक `flags` फ़ील्ड जो हमले के cooldown, spawn स्थिति, sneak, sprint, eat, load, movement cooldown, और craft lock को एन्कोड करता है। यह सब अलग-अलग bits में।

## मुख्य लूप: while(true) और non-blocking

पूरा सर्वर एक लूप पर चलता है, एक thread, शून्य event library।

```c
// main.c, लाइनें 594-720

while (true) {
  task_yield();  // let the watchdog breathe on ESP32

  // Accept a new connection (non-blocking)
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

  // Read the packet header: length + ID
  recv(client_fd, &recv_buffer, 2, MSG_PEEK);
  int length = readVarInt(client_fd);
  int packet_id = readVarInt(client_fd);
  handlePacket(client_fd, length - sizeVarInt(packet_id), packet_id, state);
}
```

लूप के प्रत्येक पुनरावृत्ति में केवल एक क्लाइंट को संभाला जाता है, और एक बार में केवल एक पैकेट पढ़ा जाता है। लूप की शुरुआत में `task_yield()` FreeRTOS idle task को ESP32 पर साँस लेने देता है — इसके बिना, watchdog timer चिप को रीसेट कर देता है।

पैकेट डिस्पैच **400 लाइनों** का एक राक्षसी switch है:

```c
// main.c, लाइनें 68-497

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
    case 0x1D..0x20:  // Movement packets (largest case)
    case 0x28:  // Player action (dig/place)
    // ... 40+ cases
  }
}
```

कोई डायनामिक jump table नहीं, कोई vtable नहीं, कोई map नहीं। एक switch स्टैटिक jump table में कंपाइल होता है। एम्बेडेड के लिए एकदम सही।

केस `0x1D-0x20` सबसे बड़ा है — यह स्थिति अपडेट, गिरने की क्षति, chunk सीमा पार करना, mob spawn, chunk जनरेशन, और भूख को संभालता है। सब कुछ एक बड़े fall-through में।

![Bareiron सर्वर कोड -- C की 6800 लाइनें](/images/bareiron/code-shot.jpg)

## सर्वर tick और mob AI

`handleServerTick` फ़ंक्शन हर 50 ms (20 TPS) पर कॉल किया जाता है। यह दुनिया को संभालता है जबकि मुख्य लूप खिलाड़ियों का ध्यान रखता है:

```c
// main.c (सरलीकृत)

void handleServerTick (uint32_t delta) {
  // Update each mob
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type == 0 || mobs[i].data == 0) continue;  // dead or empty

    MobData *mob = &mobs[i];
    int px, pz;
    getNearestPlayer(mob->x, mob->z, &px, &pz);

    if (mob->type == MOB_ZOMBIE) {
      // Hostile: walk toward nearest player
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

शत्रुतापूर्ण mobs की AI, यह निर्देशांकों की तुलना है। सचमुच `if (px < x) x--`। कोई pathfinding नहीं, कोई A* नहीं, कोई obstacle avoidance नहीं। ज़ोंबी खिलाड़ी की ओर स्वतंत्र रूप से X और Z को समायोजित करता है — यदि दीवारें हों तो वह उनमें से गुज़रता है।

संपर्क क्षति 3 दिल/सेकंड है। p2r3 ने इसे उच्च रखा क्योंकि pathfinding की अनुपस्थिति ज़ोंबियों को kite करना आसान बनाती है।

कवच का फॉर्मूला combat update से पहले वाला है — सबसे सरल संभव:

```c
// main.c (सरलीकृत)

static uint8_t applyArmor (uint8_t damage, uint16_t armor_value) {
  // Pre-1.9 formula: linear reduction
  // Each armor point = 4% reduction, max 80%
  uint8_t reduction = (armor_value * 4);
  if (reduction > 80) reduction = 80;
  return damage * (100 - reduction) / 100;
}
```

पूर्ण diamond = 80% कमी। ज़ोंबी का 3 दिल का हमला 0.6 दिल हो जाता है। p2r3 ने यह पुराना फॉर्मूला चुना क्योंकि यह 2 ऑपरेशनों में गणना करता है — कोई सीमा नहीं, कोई वक्र नहीं, बस एक रैखिक प्रतिशत।

निष्क्रिय mobs: एक lookup table में 8 दिशाएँ, हर ~40 टिक्स में दिशा बदलना। `data` फ़ील्ड शीर्ष 2 bits में वर्तमान दिशा और शेष 6 bits में दिशा परिवर्तन टाइमर को एन्कोड करता है।

![Bareiron में Mobs -- ज़ोंबी, सूअर, भेड़](/images/bareiron/mobs.jpg)

### Mobs का respawn

Mobs random ticks के साथ spawn नहीं होते। वे तब प्रकट होते हैं जब सर्वर tick एक नई chunk सीमा का सामना करता है:

```c
if (player crossed chunk boundary) {
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type != 0) continue;
    spawnMob(&mobs[i], new_chunk_coords, getChunkHash(cx, cz));
    break;
  }
}
```

terrain के समान RNG, वही chunk seed। यदि कोई mob स्लॉट खाली है, तो spawn नियतिवादी है।

## Crafting: कोई मैट्रिसेस नहीं, सिर्फ if/else

```c
// crafting.c, लाइनें 9-347 (सरलीकृत)

void getCraftingOutput (PlayerData *player, uint8_t *count, uint16_t *item) {
  // If flag 0x80 is set, the craft buffer is being used by a chest
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

पहली जाँच: यदि flag `0x80` सेट है, तो craft बफर को chest पॉइंटर के रूप में पुनर्चक्रित किया जा रहा है। कोई craft संभव नहीं।

फिर, यह भरे गए स्लॉट्स की गणना करता है, पहली item नोट करता है, समानता की जाँच करता है। बस इसी से, तुम furnace को 4 जाँचों में मिलान कर सकते हो:

```c
if (count == 8 && first == cobblestone && all_identical && center_empty)
    return furnace;
```

जटिल आकृतियों के लिए, यह पहली item के इंडेक्स का उपयोग करता है और सापेक्ष स्थिति की जाँच करता है। रेसिपी एक ही मैचिंग फ़ंक्शन साझा करती हैं — सामग्री परिणाम निर्धारित करती है।

![Bareiron में craft और chest इंटरफ़ेस](/images/bareiron/crafting.jpg)

## Chests: असली हैक

वह मेमोरी हैक जिसके बारे में हर कोई बात करता है, असली कोड में:

```c
// procedures.c, लाइनें 1262-1293

if (target == B_chest) {
  // Look for the chest entry in the block array
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

  // Send the chest interface to the client
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

और कोड में टिप्पणी: `// Terrible memory hack!!1!`

बिल्कुल यही है। यह `block_changes[]` में अगली प्रविष्टि का मेमोरी पता लेता है, इसे `player->craft_items` में कॉपी करता है (जो एक `uint16_t[9]` है, यानी 18 बाइट्स — 32-bit पॉइंटर स्टोर करने के लिए पर्याप्त), और flag उठाता है ताकि इस दौरान कोई craft करने का प्रयास न करे।

चेस्ट इन्वेंट्री में प्रत्येक क्लिक पर:

```c
// packets.c, लाइनें 620-638

uint8_t *storage_ptr;
memcpy(&storage_ptr, player->craft_items, sizeof(storage_ptr));
// storage_ptr now points to the chest data
uint16_t *p_item = (uint16_t *)(storage_ptr + (slot - 41) * 3);
uint8_t *p_count = storage_ptr + (slot - 41) * 3 + 2;
```

यह craft बफर से पॉइंटर प्राप्त करता है, और ऑफसेट के साथ स्लॉट्स तक पहुँचता है। चेस्ट डेटा 3 बाइट्स प्रति स्लॉट (ID के लिए 2, मात्रा के लिए 1) की दर से, ब्लॉक सारणी में एक दूसरे से सटे हुए संग्रहीत होता है।

![ब्लॉक सारणी में संग्रहीत चेस्ट डेटा -- एक मेमोरी हैक](/images/bareiron/chest-hack.jpg)

## भूख: प्रतिभा की 5 लाइनें

```c
// main.c, लाइनें 293-305

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

सचमुच बस इतना है। 5 लाइनें। प्रत्येक मूवमेंट पैकेट saturation को घटाता है। जब saturation शून्य पर पहुँचता है, भूख कम होती है और saturation रीसेट होता है। स्प्रिंट (flag `0x08`) खपत को दोगुना करता है।

शून्य टाइमर, शून्य आवंटित मेमोरी, शून्य समर्पित गणना। एक काउंटर जो पहले से मौजूद पैकेटों पर घटता है।

### गिरने की क्षति

प्रोजेक्ट की सबसे सरल क्षति प्रणाली:

```c
// When the player leaves the ground, we store their Y
// When they touch the ground again, we subtract
damage = last_y_on_ground - current_y;
```

एक घटाव।

## ब्लॉक खोदना और रखना

जब तुम किसी ब्लॉक पर क्लिक करते हो, तो पैकेट `0x28` (Player Action) switch में आता है। हैंडलर को यह निर्धारित करना होता है कि स्थान पर कौन सा ब्लॉक है, उसे हटाना है, और item को इन्वेंट्री में डालना है:

```c
// main.c, case 0x28 (सरलीकृत)

void handlePlayerAction (int client_fd, uint8_t action, int x, uint8_t y, int z) {
  switch (action) {
    case START_DESTROY_BLOCK: {
      // Determine the block type at the clicked position
      uint8_t block = getBlockAt(x, y, z);

      if (block == B_chest) {
        openChest(client_fd, x, y, z);
        break;
      }

      // Add to block_changes
      addBlockChange(x, z, y, 0);  // 0 = air

      // Give the item to the player (trust the client)
      addItemToPlayer(client_fd, block_to_item(block), 1);

      // Send update to client
      sc_blockChange(client_fd, x, y, z, 0);
      sc_ackBlockChange(client_fd, x, y, z, 0);
      break;
    }
    case PLACE_BLOCK: {
      // Read the block type from the player's hand
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

`getBlockAt` terrain जनरेशन और खिलाड़ी परिवर्तनों दोनों को जोड़ता है:

```c
uint8_t getBlockAt (int x, uint8_t y, int z) {
  // First check player changes
  uint8_t change = getBlockChange(x, y, z);
  if (change != 0xFF) return change;

  // Otherwise, read from generated terrain
  return getTerrainBlock(x, y, z);
}
```

परिवर्तनों को प्राथमिकता, terrain पर fallback। शून्य बहस, शून्य कैश, शून्य ओवरहेड। हुड के नीचे `getTerrainBlock`, वह है `getHeightAt` + stone/dirt/grass/coal की परतें।

### तत्काल furnace

सबसे मज़ेदार: furnace एक इकाई के रूप में मौजूद नहीं है। यदि तुम "पकाने" वाले स्लॉट में cobblestone और "ईंधन" में coal डालते हो, तो परिणाम तुरंत प्रकट होता है। कोई टाइमर नहीं, कोई chunk ticking नहीं। यह सिर्फ एक इन्वेंट्री स्लॉट है जो तब खाली होता है जब तुम सही items डालते हो।

![तत्काल furnace -- सामग्री डालो, तुरंत परिणाम](/images/bareiron/furnace.jpg)

## ESP32 लूप: 4 KB स्टैक में MC सर्वर

```c
// main.c, लाइनें 732-779

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
  // Rest is handled by the event handler
}
#endif
```

पूरा सर्वर एक FreeRTOS टास्क में **4096 बाइट्स स्टैक** के साथ चलता है। बस इतना। मुख्य थ्रेड केवल WiFi को इनिशियलाइज़ करता है और कनेक्शन की प्रतीक्षा करता है। एक बार कनेक्ट होने पर, यह `bareiron_main` को spawn करता है जो मानक `main()` को कॉल करता है।

सभी ESP32-विशिष्ट कोड `#ifdef ESP_PLATFORM` द्वारा संरक्षित हैं। PC पर, यह सब मानक POSIX कोड में कंपाइल होता है।

## क्या बलिदान दिया गया

यह सब फिट करने के लिए, कुछ vanilla सुविधाएँ मौजूद नहीं हैं:

- **कोई नेटवर्क संपीड़न नहीं** -- zlib बहुत महँगा। सर्वर chunks को तेज़ी से उत्पन्न करता है, लेकिन उन्हें भेजना bottleneck है।
- **कोई random ticks नहीं** -- पेड़ bone meal से उगते हैं या नहीं। Mobs chunk सीमाओं पर spawn होते हैं।
- **कोई item entities नहीं** -- खोदे गए ब्लॉक सीधे इन्वेंट्री में जाते हैं। एनिमेशन पूरी तरह से दृश्य है।
- **कोई इन्वेंट्री सत्यापन नहीं** -- trust the client। 64 हीरे? OK। 1 सेकंड में पूरा chunk खोदा? OK। विश्वसनीय लोगों के बीच उपयोग के लिए।
- **कोई सर्वर साइड लाइट नहीं** -- मशालें बाकी सब के बाद भेजी जाती हैं, क्लाइंट गणना करता है।
- **कोई क्रमिक तरल पदार्थ नहीं** -- तत्काल अंतिम स्थिति।

## अंतिम परिणाम

Ryzen 5 3600: ~0.5 ms प्रति chunk।
1$ की ESP32-C3: ~200 ms प्रति chunk। खेलने योग्य।

![chunk जनरेशन बेंचमार्क -- Ryzen vs ESP32](/images/bareiron/performance.jpg)

3+ खिलाड़ी: लैग होता है। लेखक के अनुसार, पीक आवर्स पर 2b2t के बराबर।

![एक ही Bareiron सर्वर से जुड़े कई खिलाड़ी](/images/bareiron/multiplayer.jpg)

## दर्शन

p2r3: "मुझे सिर्फ यह विचार पसंद है कि 1$ की यह छोटी सी चिप जो 0.5 Watt खपत करती है, Minecraft जैसी उन्नत चीज़ चला सकती है। Science isn't about 'why', it's about 'why not'."

हर लाइन एक समझौता है:
- Perlin noise → interpolation: कम सुंदर, 200x तेज़, शून्य मेमोरी
- Crafting matrices → hardcoded matching: गंदा कोड, शून्य बाइट्स
- zlib → कुछ नहीं: खराब कनेक्शन = मौत, लेकिन खेलने योग्य
- सत्यापन → विश्वास: शून्य सुरक्षा, शून्य गणना

हर अनुपस्थित सुविधा किसी दूसरी को हार्डवेयर की सीमाओं के भीतर अस्तित्व में आने देती है।

**याद रखने योग्य 3 बातें:**

1. **Interpolation + RNG** -- 4 seed किए गए बिंदु, अनंत terrain, शून्य संग्रहण, chunk को पुन: उत्पन्न किए बिना क्वेरी, 200 ms जनरेशन। यह वह प्रतिभाशाली कदम है जो बाकी सब कुछ संभव बनाता है।
2. **हर सुविधा की एक लागत है** -- कोई संपीड़न नहीं, कोई random ticks नहीं, कोई सत्यापन नहीं। ये भूल नहीं हैं, यही 520 KB में फिट होने का तरीका है।
3. **गंदे हैक्स सबसे चतुर होते हैं** -- memcpy के माध्यम से ब्लॉक सारणी में chests, मूवमेंट पैकेट द्वारा भूख, तत्काल furnace। साफ समाधान बहुत महँगा होता।

अगर यह प्रोजेक्ट आपकी रुचि रखता है, तो सब कुछ [GitHub पर GPLv3](https://github.com/p2r3/bareiron/) में है। यह गंदा C है, और मैंने शायद ही कभी किसी कोड को पढ़ने में इतना मज़ा लिया हो xD
