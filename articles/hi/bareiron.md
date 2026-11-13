---
title: Bareiron, 1$ माइक्रोकंट्रोलर पर चलने वाला Minecraft serveur
description: C की 6800 पंक्तियाँ, शून्य malloc, Perlin noise bilinear interpolation से बदला, tile map में biome, और यह सब 1$ चिप पर।
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
author_sig: "0YBrCliJkJZc/o7BxBhWhaCY0aShWAKaUJc8atIpczumxuxwHd1AtRdSdZjF5XDdtYKG7sit53jorLtUAjOTFg=="
---

## परिचय

1 डॉलर के माइक्रोकंट्रोलर पर Minecraft serveur चलाना, मजाक जैसा लगता है।

मैंने प्रश्न पूछा, और उत्तर हाँ है। सचमुच।

[Bareiron](https://github.com/p2r3/bareiron/) नामक प्रोजेक्ट है, p2r3 हस्ताक्षरित, और यह शायद हाल सालों में Minecraft दुनिया में देखे सबसे आकर्षक प्रोजेक्टों में से एक है। हम **300 kilobyte** में समाने वाले binary की बात करते हैं, **C की 6800 पंक्तियाँ**, शून्य बाहरी निर्भरता, कोई malloc नहीं, कोई threading नहीं, और यह **1 डॉलर वाली ESP32** पर चलता है।

![ESP32-C3, माइक्रोकंट्रोलर जो serveur चलाता है](/images/bareiron/esp32-board.jpg)

अनंत भूभाग पीढ़ी। Biome। गुफाएँ। Craft। खनन। Mob। भूख। संदूक। survival serveur से जो उम्मीद करते हो सब।

**0.5 Watt** उपभोग और **160 MHz** clock वाली चिप पर।

अंदाजा देने के लिए : vanilla Minecraft serveur को कई giga RAM चाहिए। ESP32-C3, यह **520 KB SRAM** है (boot बाद 400 उपलब्ध)। 20 साल पहले processor पहले ही gigahertz चलते थे, यह 160 MHz पर ठहरता है। शुद्ध शक्ति में दोनों के बीच कारक लगभग **20 000** है।

p2r3 ने C में Minecraft serveur नहीं लिखा, उसने serveur की हर ईंट फिर से आविष्कृत की ताकि वह इन बाधाओं में समाए। हम देखेंगे कैसे, स्रोत कोड खोलकर।

![p2r3 की Bareiron प्रस्तुति वीडियो की थंबनेल](/images/bareiron/title-card.jpg)

## प्रोजेक्ट मस्तिष्क : बिना स्मृति भूभाग पीढ़ी

जब तुम embedded MC serveur बनाना चाहते हो, सबसे बड़ी समस्या भूभाग पीढ़ी है।

vanilla Minecraft में, दुनिया **Perlin noise** से बनती है : कई叠 परतें (octave), 6 biom पैरामीटर (तापमान, आर्द्रता, महाद्वीपीयता, अपरदन, weirdness, गहराई), और हर बार सब फिर से गणना न करने के लिए पूरा caching तंत्र।

परिणाम शानदार है। लेकिन यह गणना में महँगा है, और बने chunk संग्रहित करने के लिए RAM लेता है।

Bareiron दृष्टिकोण मौलिक अलग है। शोर叠 करने के बजाय, वह **निर्णायक RNG** से बने 4 बिंदुओं पर **bilinear interpolation** इस्तेमाल करता है।

तुम जानते हो जब तुम छोटी pixel छवि बढ़ाते हो और किनारे धुंधले होते हैं ? बिल्कुल यही है।

```c
// worldgen.c, पंक्तियाँ 117-171 (सरलीकृत)

uint8_t interpolate (uint8_t a, uint8_t b, uint8_t c, uint8_t d, int x, int z) {
  uint16_t top    = a * (CHUNK_SIZE - x) + b * x;
  uint16_t bottom = c * (CHUNK_SIZE - x) + d * x;
  return (top * (CHUNK_SIZE - z) + bottom * z) / (CHUNK_SIZE * CHUNK_SIZE);
}

uint8_t getHeightAt (int x, int z) {
  int _x = floor(x / CHUNK_SIZE);  // chunk निर्देशांक
  int _z = floor(z / CHUNK_SIZE);
  int rx = x % CHUNK_SIZE;          // chunk अंदर offset
  int rz = z % CHUNK_SIZE;
  uint32_t hash = getChunkHash(_x, _z);
  uint8_t biome = getChunkBiome(_x, _z);
  // hash + biome से seed 4 कोनों के बीच interpolation
  return getHeightAtFromHash(rx, rz, _x, _z, hash, biome);
}
```

मानक bilinear interpolation : 4 कोने, स्थिति अनुसार भार, output में एक ही `uint8_t`। CHUNK_SIZE 8 है, इसलिए यह पूर्णांक गुणा में होता है, float नहीं।

p2r3 इसे वीडियो में चरण दर चरण दिखाता है : पहले chunk के 4 कोने, हर एक RNG से seed।

![chunk के 4 कोने, हर एक निर्णायक RNG से seed](/images/bareiron/gen-four-corners.jpg)

फिर इन 4 बिंदुओं के बीच interpolation सतत सतह बनाती है।

![4 कोनों के बीच bilinear interpolation लागू करना](/images/bareiron/gen-interpolate.jpg)

और सभी आसन्न chunk पर pattern दोहराकर, हमें अनंत फैलता भूभाग मिलता है।

![अंतिम परिणाम : सतत अनियमित भूभाग](/images/bareiron/gen-result.jpg)

### निर्णायक RNG

जो कुंजी यह सब संभव बनाती है, वह seeding है। हर chunk के 4 कोने हैं, और हर कोने को अनोखा लेकिन पुनरुत्पादनीय छद्म बेतरतीब मान चाहिए।

```c
// worldgen.c, पंक्तियाँ 13-22

uint32_t getChunkHash (short x, short z) {
  uint8_t buf[8];
  memcpy(buf, &x, 2);          // X निर्देशांक के 16 बिट
  memcpy(buf + 2, &z, 2);      // Z निर्देशांक के 16 बिट
  memcpy(buf + 4, &world_seed, 4);  // वैश्विक seed के 32 बिट
  return splitmix64(*((uint64_t *)buf));  // hash
}
```

वह X के 16 बिट, Z के 16 बिट, और seed के 32 बिट को 8 byte buffer में pack करता है, और सब `splitmix64` में डालता है। परिणाम : हर स्थिति के लिए अनोखा निर्णायक मान, दुनिया seed आधारित।

तंत्र की शक्ति पकड़ रहे हो ? serveur को भूभाग संग्रहित करने की जरूरत नहीं है। वह खिलाड़ी नया क्षेत्र आने पर तुरंत फिर से गणना करता है, और यह हर बार बिल्कुल वही परिणाम देता है।

इस्तेमाल `splitmix64` 64 बिट hash के लिए डिजाइन अति तेज prng है :

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

3 ऑपरेशन : जोड़, xor/shift, गुणा, xor/shift, गुणा, xor/shift। सब सीधे ऑपरेशन में समाता है, बिना तालिका या लूप। वह 8 byte buffer (X + Z + seed) लेता है, उसे 64 बिट पूर्णांक मानता है, और 32 बिट hash लौटाता है। यह निर्णायक, तेज है, और 5 पंक्तियों में समाता है।

### यह Perlin noise क्यों नहीं है

p2r3 खुद वीडियो में कहता है : "जितने ज्यादा बेतरतीब संख्या अंक जोड़ते हो, भूभाग उतना नियमित होता है, जैसे ज्यादा सिक्का उछाल तुम्हें 50/50 के करीब लाते हैं"। व्यवहार में, यह hash के बिट संख्या है जिसे वह जोड़ता है :

```c
// worldgen.c, पंक्तियाँ 51-115

// plains biome के लिए : 4 संयुक्त कारक → नियमित भूभाग
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// snowy plains के लिए : 2 कारक → ज्यादा ऊबड़ खाबड़
h = (hash % 5) + ((hash >> 4) % 5);
```

हर biome चुनता है कि वह कितने बिट निष्कर्षण जोड़ता है। जितने ज्यादा, वितरण उतना स्थिर होता है, जैसे ज्यादा सिक्का उछाल जो 50/50 के करीब आते हैं। जितने कम, स्थानीय भिन्नताएँ उतनी मजबूत।

![अनियमित भूभाग , कम कारक, मजबूत भिन्नताएँ](/images/bareiron/terrain-irregular.jpg)

सिर्फ 2 कारकों से, snowy plains पहाड़ी, लगभग पर्वतीय भूभाग बनाता है। चोटियाँ और गड्ढे बार बार हैं।

![नियमित भूभाग , कई कारक, चिकनी सतह](/images/bareiron/terrain-regular.jpg)

4 कारकों से, मैदान सपाट और पूर्वानुमेय रहते हैं। वितरण स्थिर होता है।

एक chunk ESP32 पर **200 ms** में बनता है, Perlin noise से उसी hardware पर अमापनीय समय के मुकाबले इतना महँगा है।

### मारने वाला विवरण : पूरा chunk बनाए बिना ब्लॉक पूछना

तुम खेलते हो, तुम ब्लॉक खनन करते हो। serveur को जानना होगा कि तुम्हें कौन सा item देना है। भोलेपन से, इसके लिए पूरा chunk बनाना होगा।

bilinear interpolation से, तुम सीधे निर्देशांक से समतल का **कोई भी बिंदु** पूछते हो। chunk कोने खिलाड़ी स्थिति से मिलते हैं, interpolation तुम्हें किसी भी offset पर ऊँचाई देती है। मुट्ठी गणित ऑपरेशन, कोई chunk पीढ़ी नहीं।

p2r3 : "जो मैं चाहता हूँ, वह जादुई फंक्शन है जो मुझे बता सके कि दिए निर्देशांक पर कौन सा ब्लॉक है, बिना स्मृति पहुँचे या महँगे शोर नक्शे गणना किए"। ठीक वही जो उसने किया।

ऊँचाई ठोस ब्लॉक कैसे बनती है यहाँ है :

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

5 शर्तें। grass/dirt/stone/deepslate/bedrock की परत। सतह ब्लॉक `biome_top[]` से biome निर्भर है, मैदानों के लिए grass, रेगिस्तान के लिए sand। if का साधारण झरना सही परत में गिरता है, जो लूप और switch बदलता है।

### गुफाएँ, सबसे आलसी mirror

```c
altitude_grotte = CAVE_BASE_DEPTH - (hauteur_surface - y);
```

वह सतह ऊँचाई को जमीन नीचे mirror करता है। यह बड़ी deepslate गुहाओं जैसा लगता है। शून्य compute, एक पंक्ति।

![सतह भूभाग mirror से बनी गुफाएँ](/images/bareiron/cave-mirror.jpg)

![गुफाएँ बनाने के लिए भूभाग mirror schema](/images/bareiron/cave-diagram.jpg)

### अयस्क, XOR संस्करण

```c
candidat = (chunk_x ^ col_x ^ col_z) % 100;
if (candidat < 5 && y < 16) -> diamond
```

निर्देशांक का XOR प्रति कॉलम उम्मीदवार गारंटी देता है। प्रकार सिर्फ ऊँचाई निर्भर है। हीरे गुफाओं के सबसे निचले बिंदु नीचे छिपे हैं ताकि खोदना उपयोगी रहे।

### tile map में biome

हर biome ग्रिड में गोल द्वीप है, उसका प्रकार seed से गणना pattern से तय होता है। ग्रिडबद्ध, पूर्वानुमेय, और मुफ्त।

![tile map में biome नक्शा , हर द्वीप अलग biome है](/images/bareiron/biome-tilemap.jpg)

हर biome के अपने पैरामीटर तालिकाओं में एन्कोड हैं :

```c
// worldgen.c (सरलीकृत)

static const uint8_t biome_base[] = {
  [BIOME_PLAINS]  = 48,   // आधार ऊँचाई : 48
  [BIOME_DESERT]  = 52,   // थोड़ा ऊँचा
  [BIOME_FOREST]  = 50,   // दोनों के बीच
  [BIOME_TAIGA]   = 46,   // थोड़ा नीचा
  [BIOME_SNOWY]   = 40,   // सबसे नीचा
};

static const uint8_t biome_top[] = {
  [BIOME_PLAINS]  = B_grass,
  [BIOME_DESERT]  = B_sand,
  [BIOME_FOREST]  = B_grass,
  [BIOME_TAIGA]   = B_grass,
  [BIOME_SNOWY]   = B_snow_block,
};

static const uint8_t biome_factors[] = {
  [BIOME_PLAINS]  = 4,   // 4 निष्कर्षण → बहुत नियमित
  [BIOME_DESERT]  = 3,   // 3 निष्कर्षण → मध्यम
  [BIOME_FOREST]  = 4,   // 4 निष्कर्षण → नियमित, पहाड़ी
  [BIOME_TAIGA]   = 3,   // 3 निष्कर्षण → मध्यम
  [BIOME_SNOWY]   = 2,   // 2 निष्कर्षण → बहुत ऊबड़ खाबड़
};
```

**Plains** : ऊँचाई 48, 4 कारक → बहुत सपाट भूभाग, घास।

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// परिणाम : अधिकतम ±4 ब्लॉक भिन्नता
```

**Desert** : ऊँचाई 52, 3 कारक, सतह ब्लॉक = रेत। कभी समुद्र स्तर नीचे नहीं।

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3);
// परिणाम : अधिकतम ±6 ब्लॉक भिन्नता, SEA_LEVEL+1 पर clamp
```

**Forest** : ऊँचाई 50, plains जैसे 4 कारक लेकिन ऊँचा आधार → जंगली पहाड़ियाँ।

**Taiga** : ऊँचाई 46, 3 कारक → मध्यम भिन्नताएँ, ठंडा भूभाग।

**Snowy plains** : ऊँचाई 40, सिर्फ 2 कारक → सबसे ऊबड़ खाबड़।

```c
h = (hash % 5) + ((hash >> 4) % 5);
// परिणाम : अधिकतम ±14 ब्लॉक भिन्नता
```

हर biome **5 प्रविष्टियों की 3 तालिकाओं** में एन्कोड है : आधार ऊँचाई, सतह ब्लॉक, कारक संख्या। जब `getHeightAtFromHash` biome पाता है, तो वह भूभाग समायोजित करने के लिए इन तालिकाओं से पूछता है। vanilla Minecraft की पूरी biome तंत्र बदलने के लिए 15 byte डेटा।

biome detector chunk से कौन सा biome मेल खाता है यह तय करने के लिए seed इस्तेमाल करता है :

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

16 प्रविष्टियों का pattern, chunk निर्देशांक से seed सूचकांक। यह दोहराव लेकिन दृष्टिगत सुसंगत ग्रिड देता है। vanilla Minecraft की पूरी biom पैरामीटर तंत्र बदलने के लिए 4 पंक्ति कोड।

### getHeightAtFromHash : भूभाग assembler

पीढ़ी हृदय फंक्शन biome से seed 4 कोने जोड़ता है :

```c
// worldgen.c (सरलीकृत)

static uint8_t getHeightAtFromHash (int rx, int rz, short cx, short cz,
                                    uint32_t h, uint8_t biome) {
  // hash से निकाले 4 कोने, प्रति कोना अलग seed
  uint8_t h1 = biome_base[biome] + (h & 0x0F);
  uint8_t h2 = biome_base[biome] + ((h >> 4) & 0x0F);
  uint8_t h3 = biome_base[biome] + ((h >> 8) & 0x0F);
  uint8_t h4 = biome_base[biome] + ((h >> 12) & 0x0F);

  // Biome बाधा : रेगिस्तान कभी पानी नीचे नहीं
  if (biome == BIOME_DESERT) {
    h1 = max(h1, SEA_LEVEL + 1);
    h2 = max(h2, SEA_LEVEL + 1);
    h3 = max(h3, SEA_LEVEL + 1);
    h4 = max(h4, SEA_LEVEL + 1);
  }

  // 4 कोनों से Interpolation
  return interpolate(h1, h2, h3, h4, rx, rz);
}
```

हर biome की `biome_base` है जो संदर्भ ऊँचाई बदलती है, और 4 कोने अलग बदलावों से hash से निकाले जाते हैं। रेगिस्तान min को समुद्र स्तर ऊपर बाध्य करता है, अतिरिक्त biom गणना के बिना पानी रोकने वाली बाधा पंक्ति।

### पेड़ और cactus : संभाव्य placement

सतह पीढ़ी कहाँ लगाना है यह तय करने के लिए वही chunk hash इस्तेमाल करती है :

```c
// worldgen.c (सरलीकृत)

static void genFoliage (uint8_t *chunk_data, short cx, short cz,
                        uint32_t hash, uint8_t biome) {
  if (biome == BIOME_DESERT) {
    // Cactus : प्रति chunk एक उम्मीदवार, hash स्थिति तय करता है
    int tx = (hash >> 8) & 7;
    int tz = (hash >> 12) & 7;
    int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
    if (chunk_data[ty * 64 + tz * 8 + tx] == B_sand)
      placeCactus(chunk_data, tx, ty + 1, tz);
  } else {
    // पेड़ : hash तय करता है कि लगाना है और कहाँ
    int tree_count = (hash & 3);  // प्रति chunk 0-3 पेड़
    for (int i = 0; i < tree_count; i ++) {
      int tx = ((hash >> (4 + i * 4)) & 7);
      int tz = ((hash >> (6 + i * 4)) & 7);
      int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
      placeTree(chunk_data, tx, ty + 1, tz);
    }
  }
}
```

हरे biome के लिए प्रति chunk 0-3 पेड़, रेगिस्तान के लिए अधिकतम 1 cactus। chunk hash entropy का एकमात्र स्रोत है, chunk में स्थिति के लिए `& 7`, counter के लिए `& 3`। सब निर्णायक है, कुछ संग्रहित नहीं है।

### generateChunk : सब जोड़ना

फंक्शन जो 8×8×256 ब्लॉक का पूरा chunk बनाने के लिए सब रखता है :

```c
// worldgen.c (सरलीकृत)

void generateChunk (uint8_t *chunk, short cx, short cz) {
  uint32_t hash = getChunkHash(cx, cz);
  uint8_t biome = getChunkBiome(cx, cz);

  // chunk के हर कॉलम के लिए (8×8 = 64)
  for (int x = 0; x < 8; x ++) {
    for (int z = 0; z < 8; z ++) {
      // पूर्ण दुनिया निर्देशांक
      int wx = cx * 8 + x;
      int wz = cz * 8 + z;

      // कॉलम ऊँचाई
      uint8_t height = getHeightAt(wx, wz);

      // कॉलम नीचे से ऊपर भरना
      for (int y = 0; y < height; y ++) {
        uint8_t block = getTerrainBlock(wx, y, wz);
        chunk[y * 64 + z * 8 + x] = block;
      }
    }
  }

  // सतह तत्व जोड़ना (पेड़, cactus)
  genFoliage(chunk, cx, cz, hash, biome);
}
```

बस इतना। 3 नेस्ट लूप : हर कॉलम के लिए, ऊँचाई खोजना, ब्लॉक भरना, अगले पर जाना। output `uint8_t[16384]` (8 × 8 × 256) है जो पूरा chunk दर्शाता है। chunk बनता है फिर सीधे client को भेजा जाता है, बिना caching, lazy loading या संपीड़न से गुजरे।

## भंडारण : हर जगह स्थिर array

Bareiron स्मृति आर्किटेक्चर पूरी शान में embedded C है : सिर्फ निश्चित आकार के वैश्विक array, न malloc, न hash map, न linked list।

### ब्लॉक बदलाव

```c
// globals.h, पंक्तियाँ 191-196

typedef struct {
  short x;      // 2 byte , क्षैतिज 32 000 ब्लॉक तक सीमित
  short z;      // 2 byte
  uint8_t y;    // 1 byte , ऊर्ध्वाधर 256 ब्लॉक तक सीमित
  uint8_t block; // 1 byte , 256 ब्लॉक प्रकार तक सीमित
} BlockChange;
```

20 000 प्रविष्टियाँ, यानी लगभग **25 000 बदलाव**, पूरी तरह खोदा डेढ़ chunk बराबर। `0xFF` पर `block` फ़ील्ड मुक्त प्रविष्टि चिह्नित करता है। खोज रैखिक scan है :

![ब्लॉक array स्मृति layout , प्रति प्रविष्टि 6 byte](/images/bareiron/memory-layout.jpg)

```c
// procedures.c

uint8_t getBlockChange (short x, uint8_t y, short z) {
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block == 0xFF) continue;
    if (block_changes[i].x == x && block_changes[i].y == y && block_changes[i].z == z)
      return block_changes[i].block;
    #ifdef ALLOW_CHESTS
      if (block_changes[i].block == B_chest) i += 14;  // chest डेटा छोड़ो
    #endif
  }
  return 0xFF;
}
```

बदलाव जोड़ना खोज जितना सीधा है :

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

counter, सूचकांक, लेखन। array बस ढेर करता है : कोई छँटाई नहीं, कोई compaction नहीं, कोई स्मृति प्रबंधन नहीं। जब array भरा है, तो नए बदलाव नजरअंदाज किए जाते हैं, भूभाग अपनी बनी स्थिति पर लौटता है।

256 ब्लॉक सीमा पर लेखक टिप्पणी : "मैं जल्द हल्के patina मोम ताँबा सीढ़ियाँ लागू नहीं गिन रहा।"

### mob : प्रति pipe head 8 byte

```c
// globals.h, पंक्तियाँ 240-251 (padding खत्म करने के लिए pragma pack(push, 1))

typedef struct {
  uint8_t type;   // 25=chicken, 28=cow, 95=pig, 106=sheep, 145=zombie
  short x;
  uint8_t y;      // अगर health=0, तो Y हटाने से पहले timer बनता है
  short z;
  uint8_t data;   // बिट 0-4: health, बिट 5: sheep sheared, बिट 6-7: panic timer
} MobData;
```

8 byte। अधिकतम 16 स्थान। संरेखण और padding खाई में जाते हैं। `data` byte घर bitfield है : 5 जीवन बिट, 1 कतरन बिट, 2 दहशत timer बिट। और जब mob मरता है, Y फ़ील्ड हटाने से पहले timer बनता है। बिट स्तर पर स्मृति पुनः उपयोग।

### खिलाड़ी : कसा pack

खिलाड़ी डेटा भी `#pragma pack(push, 1)` इस्तेमाल करता है, `short` + `uint8_t` में निर्देशांक, `uint16_t` + `uint8_t` के स्थिर array में inventory, और `flags` फ़ील्ड जो एक साथ हमला cooldown, spawn स्थिति, sneak, sprint, eat, load, movement cooldown, और craft lock एन्कोड करता है। सब अलग बिटों में।

## मुख्य लूप : while(true) और गैर अवरुद्ध

पूरा serveur एक लूप, एक thread, शून्य event library चलता है।

```c
// main.c, पंक्तियाँ 594-720

while (true) {
  task_yield();  // ESP32 पर watchdog साँस लेने देता है

  // नया कनेक्शन स्वीकार करना (गैर अवरुद्ध)
  for (int i = 0; i < MAX_PLAYERS; i ++) {
    if (clients[i] != -1) continue;
    clients[i] = accept(server_fd, ...);
    if (clients[i] != -1) client_count ++;
    break;
  }

  // अगर समय बीता तो serveur tick
  if (get_program_time() - last_tick_time > TIME_BETWEEN_TICKS) {
    handleServerTick(time_since_last_tick);
    last_tick_time = get_program_time();
  }

  // Round-robin : प्रति दोहराव एक client, एक packet
  client_index = (client_index + 1) % MAX_PLAYERS;
  if (clients[client_index] == -1) continue;

  // packet हेडर पढ़ना : length + ID
  recv(client_fd, &recv_buffer, 2, MSG_PEEK);
  int length = readVarInt(client_fd);
  int packet_id = readVarInt(client_fd);
  handlePacket(client_fd, length - sizeVarInt(packet_id), packet_id, state);
}
```

हर लूप दोहराव में एक ही client प्रोसेस होता है, और एक बार में एक ही packet पढ़ा जाता है। लूप शुरुआत में `task_yield()` ESP32 पर FreeRTOS idle task साँस लेने देता है, इसके बिना, watchdog timer चिप reset करता है।

packet dispatch **400 पंक्तियों** का राक्षसी switch है :

```c
// main.c, पंक्तियाँ 68-497

void handlePacket (int client_fd, int length, int packet_id, int state) {
  switch (packet_id) {
    case 0x00:  // स्थिति अनुसार Handshake / Status / Login
    case 0x01:  // Status ping
    case 0x02:  // Plugin message
    case 0x03:  // Login/configuration acknowledgment
    case 0x08:  // Chat
    case 0x0B:  // Client status (respawn)
    case 0x11:  // Click container (संदूक संभालता है)
    case 0x19:  // Interact entity
    case 0x1D..0x20:  // Movement packet (सबसे बड़ा मामला)
    case 0x28:  // Player action (dig/place)
    // ... 40+ मामले
  }
}
```

switch स्थिर jump table में संकलित होता है, जो गतिशील jump table, vtable और map बदलता है। embedded के लिए सही।

`0x1D-0x20` मामला सबसे बड़ा है, वह स्थिति अद्यतन, गिरने नुकसान, chunk सीमा पार, mob spawn, chunk पीढ़ी, और भूख संभालता है। सब एक ही बड़े fall-through में।

![Bareiron serveur कोड , C की 6800 पंक्तियाँ](/images/bareiron/code-shot.jpg)

## serveur tick और mob AI

`handleServerTick` फंक्शन हर 50 ms (20 TPS) बुलाया जाता है। वह दुनिया संभालता है जबकि मुख्य लूप खिलाड़ियों का ध्यान रखता है :

```c
// main.c (सरलीकृत)

void handleServerTick (uint32_t delta) {
  // हर mob अद्यतन करना
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type == 0 || mobs[i].data == 0) continue;  // मरा या खाली

    MobData *mob = &mobs[i];
    int px, pz;
    getNearestPlayer(mob->x, mob->z, &px, &pz);

    if (mob->type == MOB_ZOMBIE) {
      // शत्रुतापूर्ण : निकटतम खिलाड़ी की ओर चलता है
      if (px < mob->x) mob->x --;
      else if (px > mob->x) mob->x ++;
      if (pz < mob->z) mob->z --;
      else if (pz > mob->z) mob->z ++;
      // 2 ब्लॉक पर संपर्क नुकसान
      if (abs(px - mob->x) <= 2 && abs(pz - mob->z) <= 2)
        damagePlayer(getNearestPlayerId(mob->x, mob->z), 3);
    } else {
      // निष्क्रिय : 8 बेतरतीब दिशाएँ
      uint8_t dir = getMobDir(mob);
      mob->x += dir_lookup[dir][0];
      mob->z += dir_lookup[dir][1];
      // लगभग हर 40 tick दिशा बदलाव
      if (mob->data >> 6 < 1) setMobDir(mob, rand() & 7);
      mob->data = (mob->data & 0x3F) | ((mob->data - 0x40) & 0xC0);
    }

    // mob आसपास chunk जगाना
    setChunkGenerated(mob->x / 8, mob->z / 8);
  }
}
```

शत्रुतापूर्ण mob AI निर्देशांक तुलना है। सचमुच `if (px < x) x--`। zombie pathfinding, A* और बाधा परिहार नजरअंदाज करता है : वह X और Z स्वतंत्र खिलाड़ी की ओर समायोजित करता है, अगर दीवारें हैं तो उन्हें पार करता है।

संपर्क नुकसान 3 heart/sec है। p2r3 ने इसे ऊँचा चाहा क्योंकि pathfinding अनुपस्थिति zombie को kite करना आसान बनाती है।

armor सूत्र combat update से पहले वाला है, सबसे सरल संभव :

```c
// main.c (सरलीकृत)

static uint8_t applyArmor (uint8_t damage, uint16_t armor_value) {
  // Pre-1.9 सूत्र : रैखिक न्यूनीकरण
  // हर armor अंक = 4% न्यूनीकरण, अधिकतम 80%
  uint8_t reduction = (armor_value * 4);
  if (reduction > 80) reduction = 80;
  return damage * (100 - reduction) / 100;
}
```

Full diamond = 80% न्यूनीकरण। zombie का 3 heart प्रहार 0.6 heart बनता है। p2r3 ने यह पुराना सूत्र चुना क्योंकि वह 2 ऑपरेशन में गणना होता है, कोई सीमा नहीं, कोई वक्र नहीं, सिर्फ रैखिक प्रतिशत।

निष्क्रिय mob : lookup table में 8 दिशाएँ, लगभग हर 40 tick पाठ्यक्रम बदलाव। `data` फ़ील्ड उच्च वजन 2 बिट में चल रही दिशा एन्कोड करता है, और बचे 6 बिट में दिशा बदलाव timer।

![Bareiron में Mob , zombie, सूअर, भेड़](/images/bareiron/mobs.jpg)

### mob respawn

mob random tick से spawn नहीं करते। वे प्रकट होते हैं जब serveur tick नई chunk सीमा से मिलता है :

```c
if (player crossed chunk boundary) {
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type != 0) continue;
    spawnMob(&mobs[i], new_chunk_coords, getChunkHash(cx, cz));
    break;
  }
}
```

भूभाग वाला RNG, वही chunk seed। अगर mob स्थान मुक्त है, तो spawn निर्णायक है।

## craft : कोई मैट्रिक्स नहीं, if/else

```c
// crafting.c, पंक्तियाँ 9-347 (सरलीकृत)

void getCraftingOutput (PlayerData *player, uint8_t *count, uint16_t *item) {
  // अगर 0x80 flag उठा है, तो craft buffer संदूक से इस्तेमाल होता है
  if (player->flags & 0x80) { *count = 0; *item = 0; return; }

  // slot गिनना, पहला item खोजना, पहचान जाँचना
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
    case 1:  /* तख्ते, पिंड... */
    case 2:  /* छड़ें, कैंची, मशाल */
    case 3:  /* फावड़े, तलवारें, slab */
    case 4:  /* craft तालिका, boot */
    case 5:  /* कुदाल, कुल्हाड़ी, helmet */
    case 7:  /* टाँगें, composter */
    case 8:  /* भट्ठी, संदूक, chestplate */
    case 9:  /* पूर्ण ब्लॉक (लोहा, सोना, आदि) */
  }
}
```

पहली जाँच : अगर `0x80` flag उठा है, तो craft buffer संदूक pointer के रूप में recycle होता है। craft locked रहता है।

फिर, वह भरे slot गिनता है, पहला item नोट करता है, पहचान जाँचता है। बस इससे, तुम 4 जाँच में भट्ठी match करते हो :

```c
if (count == 8 && first == cobblestone && all_identical && center_empty)
    return furnace;
```

जटिल आकृतियों के लिए, वह पहले item सूचकांक इस्तेमाल करता है और सापेक्ष स्थिति जाँचता है। नुस्खे वही matching फंक्शन साझा करते हैं, सामग्री परिणाम तय करती है।

![Bareiron में craft और संदूक इंटरफेस](/images/bareiron/crafting.jpg)

## संदूक : असली hack

स्मृति hack जिसकी सब बात करते हैं, असली कोड में :

```c
// procedures.c, पंक्तियाँ 1262-1293

if (target == B_chest) {
  // ब्लॉक array में संदूक प्रविष्टि खोजना
  uint8_t *storage_ptr = NULL;
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block != B_chest) continue;
    if (block_changes[i].x != x || block_changes[i].y != y || block_changes[i].z != z)
      continue;
    storage_ptr = (uint8_t *)(&block_changes[i + 1]);  // संदूक ब्लॉक बाद इंगित करता है
    break;
  }
  if (storage_ptr == NULL) return;

  // Terrible memory hack!!
  // हम खिलाड़ी craft item array में POINTER कॉपी करते हैं
  memcpy(player->craft_items, &storage_ptr, sizeof(storage_ptr));
  player->flags |= 0x80;  // craft lock करता है

  // client को संदूक इंटरफेस भेजना
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

और कोड में टिप्पणी : `// Terrible memory hack!!1!`

बिल्कुल यही है। वह `block_changes[]` में अगली प्रविष्टि का स्मृति पता लेता है, उसे `player->craft_items` (जो `uint16_t[9]` है, इसलिए 32 बिट pointer संग्रहित करने को काफी 18 byte) में कॉपी करता है, और flag उठाता है ताकि इस बीच कोई craft करने की कोशिश न करे।

संदूक inventory में हर क्लिक पर :

```c
// packets.c, पंक्तियाँ 620-638

uint8_t *storage_ptr;
memcpy(&storage_ptr, player->craft_items, sizeof(storage_ptr));
// storage_ptr अब संदूक डेटा की ओर इंगित करता है
uint16_t *p_item = (uint16_t *)(storage_ptr + (slot - 41) * 3);
uint8_t *p_count = storage_ptr + (slot - 41) * 3 + 2;
```

वह craft buffer से pointer लेता है, और offset से slot पहुँचता है। संदूक डेटा प्रति slot 3 byte दर (ID के लिए 2, मात्रा के लिए 1) संग्रहित होता है, ब्लॉक array में एक के बाद एक चिपका।

![ब्लॉक array में संग्रहित संदूक डेटा , स्मृति hack](/images/bareiron/chest-hack.jpg)

## भूख : प्रतिभा की 5 पंक्तियाँ

```c
// main.c, पंक्तियाँ 293-305

// खिलाड़ी हिलने पर ~20/sec गति packet भेजते हैं
// हिले बिना रहने पर बहुत कम। हम इसे जोड़ते हैं
// मुफ्त में भूख अनुकरण करने के लिए गतिविधि के साथ।
if (player->saturation == 0) {
  if (player->hunger > 0) player->hunger--;
  player->saturation = 200;
  sc_setHealth(client_fd, player->health, player->hunger, player->saturation);
} else if (player->flags & 0x08) {  // sprinting
  player->saturation -= 1;
}
}
```

सचमुच यही है। 5 पंक्तियाँ। हर गति packet saturation घटाता है। जब saturation शून्य पहुँचती है, भूख घटती है और हम saturation reset करते हैं। sprint (flag `0x08`) drain दोगुना करता है।

शून्य timer, शून्य आवंटित स्मृति, शून्य समर्पित compute। counter जो पहले से मौजूद packet पर घटता है।

### गिरने नुकसान

प्रोजेक्ट का सबसे सरल नुकसान तंत्र :

```c
// जब खिलाड़ी जमीन छोड़ता है, तो हम उसका Y संग्रहित करते हैं
// जब वह जमीन छूता है, तो हम घटाते हैं
degats = dernier_y_au_sol - y_actuel;
```

एक घटाव।

## ब्लॉक खनन और रखना

जब तुम ब्लॉक क्लिक करते हो, packet `0x28` (Player Action) switch में उतरता है। handler को स्थिति पर कौन सा ब्लॉक है यह तय करना होगा, उसे हटाना होगा, और item inventory में डालना होगा :

```c
// main.c, case 0x28 (सरलीकृत)

void handlePlayerAction (int client_fd, uint8_t action, int x, uint8_t y, int z) {
  switch (action) {
    case START_DESTROY_BLOCK: {
      // क्लिक स्थिति पर ब्लॉक प्रकार तय करना
      uint8_t block = getBlockAt(x, y, z);

      if (block == B_chest) {
        openChest(client_fd, x, y, z);
        break;
      }

      // block_changes में जोड़ना
      addBlockChange(x, z, y, 0);  // 0 = air

      // खिलाड़ी को item देना (client पर भरोसा)
      addItemToPlayer(client_fd, block_to_item(block), 1);

      // client को अद्यतन भेजना
      sc_blockChange(client_fd, x, y, z, 0);
      sc_ackBlockChange(client_fd, x, y, z, 0);
      break;
    }
    case PLACE_BLOCK: {
      // खिलाड़ी hand से ब्लॉक प्रकार पढ़ना
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

`getBlockAt` भूभाग पीढ़ी और खिलाड़ी बदलाव जोड़ता है :

```c
uint8_t getBlockAt (int x, uint8_t y, int z) {
  // पहले खिलाड़ी बदलाव जाँचना
  uint8_t change = getBlockChange(x, y, z);
  if (change != 0xFF) return change;

  // वरना, बने भूभाग से पढ़ना
  return getTerrainBlock(x, y, z);
}
```

बदलावों को प्राथमिकता, भूभाग पर fallback। शून्य बहस, शून्य cache, शून्य overhead। हुड नीचे `getTerrainBlock`, यह `getHeightAt` + stone/dirt/grass/coal परतें हैं।

### तुरंत भट्ठी

सबसे मजेदार : भट्ठी इकाई के रूप में मौजूद नहीं है। अगर तुम "पकाना" खाने में cobblestone और "fuel" में coal रखते हो, तो परिणाम तुरंत प्रकट होता है, बिना timer या chunk ticking : यह बस inventory slot है जो सही item रखने पर खाली होता है।

![तुरंत भट्ठी , सामग्री रखो, तुरंत परिणाम](/images/bareiron/furnace.jpg)

## ESP32 लूप : 4 KB stack में MC serveur

```c
// main.c, पंक्तियाँ 732-779

#ifdef ESP_PLATFORM

void bareiron_main (void *pvParameters) {
  main();
  vTaskDelete(NULL);
}

static void wifi_event_handler (...) {
  if (/* जुड़ा */) {
    xTaskCreate(bareiron_main, "bareiron", 4096, NULL, 5, NULL);
  }
}

void app_main () {
  esp_timer_early_init();
  wifi_init();
  // बाकी event handler संभालता है
}
#endif
```

पूरा serveur **4096 byte stack** वाली FreeRTOS कार्य में चलता है। बस इतना। मुख्य thread सिर्फ WiFi आरंभ करता है और कनेक्शन प्रतीक्षा करता है। एक बार जुड़ने पर, वह `bareiron_main` spawn करता है जो मानक `main()` बुलाता है।

सारा ESP32 विशिष्ट कोड `#ifdef ESP_PLATFORM` से सुरक्षित है। PC पर, यह सब मानक POSIX कोड में संकलित होता है।

## क्या त्यागा गया

यह सब समाने के लिए, vanilla सुविधाएँ हैं जो मौजूद नहीं हैं :

- **शून्य नेटवर्क संपीड़न** , zlib बहुत महँगा। serveur chunk तेज बनाता है, लेकिन उन्हें भेजना bottleneck है।
- **शून्य random tick** , पेड़ bone meal से उगते हैं या नहीं। mob chunk सीमाओं पर spawn करते हैं।
- **शून्य item इकाई** , खनन ब्लॉक सीधे inventory जाते हैं। एनीमेशन विशुद्ध दृश्य है।
- **कोई inventory जाँच नहीं** , client पर भरोसा। 64 हीरे ? ठीक। 1 sec में खनन chunk ? ठीक। भरोसे लोगों के बीच इस्तेमाल करना।
- **शून्य serveur प्रकाश** , मशालें बाकी सब बाद भेजी जाती हैं, client गणना करता है।
- **शून्य प्रगतिशील तरल** , तुरंत अंतिम स्थिति।

## अंतिम परिणाम

Ryzen 5 3600 : प्रति chunk ~0.5 ms।
1$ ESP32-C3 : प्रति chunk ~200 ms। खेलने योग्य।

![chunk पीढ़ी benchmark , Ryzen बनाम ESP32](/images/bareiron/performance.jpg)

3+ खिलाड़ी : यह रेंगता है। लेखक अनुसार, peak समय 2b2t तुलनीय।

![उसी Bareiron serveur से जुड़े कई खिलाड़ी](/images/bareiron/multiplayer.jpg)

## दर्शन

p2r3 : "मुझे बस विचार पसंद है कि 0.5 Watt उपभोग करने वाली 1 ball की यह छोटी चिप Minecraft जितनी उन्नत चीज चला सकती है। Science isn't about 'why', it's about 'why not'."

हर पंक्ति tradeoff है :
- Perlin noise → interpolation : कम सुंदर, 200x तेज, शून्य स्मृति
- Craft मैट्रिक्स → hardcoded matching : गंदा कोड, शून्य byte
- zlib → कुछ नहीं : सड़ा कनेक्शन = मौत, लेकिन खेलने योग्य
- Validation → भरोसा : शून्य सुरक्षा, शून्य compute

हर अनुपस्थित सुविधा hardware सीमाओं में दूसरी को मौजूद करने देती है।

**याद रखने वाले 3 बिंदु :**

1. **Interpolation + RNG** , 4 seed बिंदु, अनंत भूभाग, शून्य भंडारण, chunk फिर से बनाए बिना query, 200 ms पीढ़ी। यह प्रतिभा चाल है जो बाकी सब संभव बनाती है।
2. **हर सुविधा की लागत है** , संपीड़न, random tick और validation अनुपस्थिति माना चुनाव है : यही 520 KB में समाने देता है।
3. **गंदे hack सबसे बुद्धिमान हैं** , memcpy से ब्लॉक array में संदूक, गति packet से भूख, तुरंत भट्ठी। साफ समाधान बहुत महँगा होता।

अगर प्रोजेक्ट तुम्हारी रुचि का है, तो सब [GPLv3 में GitHub](https://github.com/p2r3/bareiron/) पर है। यह अच्छा गंदा C है, और मैंने स्रोत कोड पढ़ने में शायद ही इतना मजा लिया हो।
