---
title: Bareiron. 1달러짜리 마이크로컨트롤러에서 도는 Minecraft 서버
description: C 6800줄, malloc 제로, Perlin 노이즈를 이중선형 보간으로 대체, 타일 맵 바이오옴, 전부 1달러 칩 위에서.
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
author_sig: "LBY4d0kzpWz7i4rGg28jeQFThyDoo63CBvlVmj4S+jdxJk1fc0mVXdr0lNKglaUbSU3Yl6T/oB5TccTl4uZr7g=="
---

## 소개

1달러짜리 마이크로컨트롤러에서 Minecraft 서버를 돌리기. 농담 같아 보여요.

저는 스스로 물었고, 답은 네예요. 말 그대로요.

[p2r3](https://github.com/p2r3/bareiron/) 서명 [Bareiron](https://github.com/p2r3/bareiron/)이라는 프로젝트가 있어요. 최근 몇 년 Minecraft 세상에서 본 가장 매혹적인 프로젝트 중 하나일 거예요. **300킬로바이트**에 들어가는 바이너리, **C 6800줄**, 외부 의존성 제로, malloc 없음, 스레딩 없음, **1달러 ESP32**에서 돌아가요.

![서버를 돌리는 마이크로컨트롤러 ESP32-C3](/images/bareiron/esp32-board.jpg)

무한 지형 만들기. 바이오옴. 동굴. 제작. 채굴. 몹. 배고픔. 상자. 서바이벌 서버에 기대하는 모든 것.

**0.5와트**를 쓰고 **160MHz** 클럭인 칩 위에서요.

감 잡으려고요. 바닐라 Minecraft 서버는 수 기가 RAM이 필요해요. ESP32-C3는 **SRAM 520KB**(부팅 뒤 400 사용 가능)예요. 20년 전 프로세서도 기가헤르츠로 돌았어요. 이것은 160MHz가 한계예요. 순수 힘의 차이가 약 **20,000배**예요.

p2r3는 Minecraft 서버를 C로 쓴 것이 아니라, 서버 벽돌마다 이 제약에 들어가도록 다시 발명했어요. 소스 코드를 열면서 어떻게 했는지 볼게요.

![p2r3의 Bareiron 소개 영상 썸네일](/images/bareiron/title-card.jpg)

## 프로젝트 두뇌: 기억 없는 지형 만들기

임베디드 MC 서버를 만들고 싶을 때 가장 큰 문제가 지형 만들기예요.

바닐라 Minecraft에서 월드는 **Perlin 노이즈**로 만들어져요. 겹친 여러 층(옥타브), 바이오옴 매개변수 6개(온도와 습도, 대륙성, 침식, weirdness, 깊이), 매번 전부 다시 계산하지 않으려고 캐싱 시스템 전체.

결과는 아름다워요. 하지만 계산이 비싸고, 만든 청크를 저장하려고 RAM이 들어요.

Bareiron 접근은 근본적으로 달라요. 노이즈를 쌓는 대신 **결정적 RNG**가 만든 4개 점에 **이중선형 보간**을 써요.

작은 픽셀 이미지를 키우면 가장자리가 흐려지는 것 아시죠? 정확히 그거예요.

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

표준 이중선형 보간: 점 4개, 위치 따른 가중치, 출력 `uint8_t` 하나. CHUNK_SIZE가 8이라 정수 곱셈으로 돼요. float 없어요.

p2r3가 영상에서 단계별로 보여줘요. 먼저 청크 점 4개, 각자 RNG 시드 높이를 가져요.

![RNG 결정 시드가 있는 청크 점 4개](/images/bareiron/gen-four-corners.jpg)

다음에 이 4개 점 사이 보간이 연속 표면을 만들어요.

![4개 점 사이 이중선형 보간 적용](/images/bareiron/gen-interpolate.jpg)

그리고 인접 모든 청크에 패턴을 반복하면 무한히 뻗는 지형이 나와요.

![최종 결과: 연속 불규칙 지형](/images/bareiron/gen-result.jpg)

### 결정적 RNG

이 모든 것을 가능하게 하는 열쇠가 시딩이에요. 각 청크에 점 4개, 각 점에 고유하지만 재현 가능한 의사난수 값이 필요해요.

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

X 16비트와 Z 16비트, 전역 시드 32비트를 8바이트 버퍼에 넣고, 전부 `splitmix64`에 통과시켜요. 결과: 위치마다 월드 시드 기반의 고유 결정적 값.

구조의 힘이 느껴지시죠? 서버가 지형을 저장할 필요가 없어요. 플레이어가 새 구역에 오면 그때그때 다시 계산하고, 매번 정확히 같은 결과가 나와요.

쓰는 `splitmix64`는 64비트 해시용 초고속 prng예요.

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

연산 3개: 덧셈, xor와 시프트, 곱셈, xor와 시프트, 곱셈, xor와 시프트. 전부 직접 연산에 들어가요. 표도 루프도 없어요. 8바이트 버퍼(X + Z + seed)를 64비트 정수로 보고 32비트 해시를 돌려줘요. 결정적이고 빠르고 5줄이에요.

### 왜 Perlin 노이즈가 아닌지

p2r3가 영상에서 직접 말해요. "난수 자릿수를 많이 더할수록 지형이 규칙적으로 돼요. 동전 던지기를 많이 할수록 50대 50에 가까워지는 것처럼요." 실제로는 해시 비트를 몇 개 합치는지예요.

```c
// worldgen.c, lignes 51-115

// plains 바이오옴: 4개 요소 합치기 → 규칙적 지형
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// snowy plains: 2개 요소 → 더 험준
h = (hash % 5) + ((hash >> 4) % 5);
```

각 바이오옴이 비트 추출을 몇 개 합칠지 골라요. 많을수록 분포가 안정돼요. 동전을 많이 던져서 50대 50에 가까워지는 것처럼요. 적을수록 국소 변동이 강해요.

![불규칙 지형: 요소 적고 변동 강해요](/images/bareiron/terrain-irregular.jpg)

요소 2개만으로 snowy plains가 구릉지고 거의 산악인 지형을 만들어요. 봉우리와 골짜기가 잦아요.

![규칙 지형: 요소 여러 개, 매끄러운 표면](/images/bareiron/terrain-regular.jpg)

요소 4개로 평원은 평평하고 예측 가능해져요. 분포가 안정돼요.

청크 하나가 ESP32에서 **200ms** 만에 만들어져요. 같은 하드웨어에서 Perlin 노이즈로는 너무 비싸서 측정할 수 없는 시간과 비교해요.

### 죽이는 세부 사항: 청크 전체를 만들지 않고 블록 묻기

플레이하고 블록을 캐요. 서버가 어떤 아이템을 줄지 알아야 해요. 순진하게는 청크 전체를 만들어야 해요.

이중선형 보간으로는 평면의 **어떤 점이든** 좌표에서 바로 물어봐요. 플레이어 위치에서 청크 점을 얻고, 보간이 어떤 오프셋이든 높이를 줘요. 수학 연산 몇 개, 청크 만들기 없어요.

p2r3: "제가 원하는 것은 메모리 접근도 비싼 노이즈 지도 계산도 없이 주어진 좌표에 어떤 블록이 있는지 말해주는 마법 함수예요." 정확히 만든 것이 그거예요.

높이가 구체 블록이 되는 방법은 이렇습니다.

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

조건 5개. grass와 dirt, stone, deepslate, bedrock 층 하나. 표면 블록은 `biome_top[]` 경유 바이오옴에 따라 달라요. 평원은 grass, 사막은 sand. 단순 if 연속이 맞는 층에 떨어져요. 루프와 switch를 대신해요.

### 동굴, 가장 게으른 거울

```c
altitude_grotte = CAVE_BASE_DEPTH - (hauteur_surface - y);
```

표면 높이를 지하에 비춰요. 큰 deepslate 빈 곳처럼 보여요. 계산 제로, 한 줄.

![표면 지형 거울로 만든 동굴들](/images/bareiron/cave-mirror.jpg)

![동굴 만들려고 지형을 비춘 도식](/images/bareiron/cave-diagram.jpg)

### 광물, XOR 버전

```c
candidat = (chunk_x ^ col_x ^ col_z) % 100;
if (candidat < 5 && y < 16) -> diamond
```

좌표 XOR이 열마다 후보 하나를 보장해요. 종류는 고도에만 달려 있어요. 다이아몬드는 파는 맛을 살리려고 동굴 최저점 아래 숨겨요.

### 타일 맵 바이오옴

각 바이오옴은 격자의 원형 섬이고, 종류는 시드에서 계산된 패턴으로 정해져요. 격자, 예측 가능, 무료.

![타일 맵 바이오옴 지도: 각 섬이 다른 바이오옴](/images/bareiron/biome-tilemap.jpg)

각 바이오옴은 표에 인코딩된 자기 매개변수 묶음이 있어요.

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

**Plains**: 높이 48, 요소 4개 → 아주 평평한 지형, 풀.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// 결과: 최대 앞뒤 4블록 변동
```

**Desert**: 높이 52, 요소 3개, 표면 블록 = 모래. 절대 해수면 아래 없어요.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3);
// 결과: 최대 앞뒤 6블록 변동, SEA_LEVEL+1로 고정
```

**Forest**: 높이 50, plains처럼 요소 4개지만 토대가 높아요 → 숲 언덕.

**Taiga**: 높이 46, 요소 3개 → 중간 변동, 추운 지형.

**Snowy plains**: 높이 40, 요소 2개뿐 → 가장 험준.

```c
h = (hash % 5) + ((hash >> 4) % 5);
// 결과: 최대 앞뒤 14블록 변동
```

각 바이오옴은 **5개 항목 표 3개**로 인코딩돼요. 토대 높이와 표면 블록, 요소 수. `getHeightAtFromHash`가 바이오옴을 받으면 이 표들을 봐서 지형을 조정해요. 바닐라 Minecraft 바이오옴 시스템 전체를 대신하는 자료 15바이트.

청크에 어떤 바이오옴이 해당하는지 시드로 정하는 바이오옴 감지기예요.

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

16개 항목 패턴 하나, 청크 좌표 시드 인덱스 하나. 반복 격자지만 시각적으로 일관돼요. 바닐라 Minecraft 바이오옴 매개변수 시스템 전체를 대신하는 코드 4줄.

### getHeightAtFromHash: 지형 조립기

만들기 중심의 함수로 바이오옴 시드 점 4개를 합쳐요.

```c
// worldgen.c (simplifié)

static uint8_t getHeightAtFromHash (int rx, int rz, short cx, short cz,
                                    uint32_t h, uint8_t biome) {
  // 해시에서 뽑은 점 4개, 점별 다른 시드
  uint8_t h1 = biome_base[biome] + (h & 0x0F);
  uint8_t h2 = biome_base[biome] + ((h >> 4) & 0x0F);
  uint8_t h3 = biome_base[biome] + ((h >> 8) & 0x0F);
  uint8_t h4 = biome_base[biome] + ((h >> 12) & 0x0F);

  // 바이오옴 제약: 사막은 절대 물속 없어요
  if (biome == BIOME_DESERT) {
    h1 = max(h1, SEA_LEVEL + 1);
    h2 = max(h2, SEA_LEVEL + 1);
    h3 = max(h3, SEA_LEVEL + 1);
    h4 = max(h4, SEA_LEVEL + 1);
  }

  // 4개 점에서 보간
  return interpolate(h1, h2, h3, h4, rx, rz);
}
```

각 바이오옴에 기준 높이를 옮기는 `biome_base`가 있고, 점 4개를 해시에서 다르게 이동시켜 뽑아요. 사막은 최소값을 해수면 위로 강제해요. 추가 바이오옴 계산 없이 물을 피하는 제약 한 줄.

### 나무와 선인장: 확률 배치

표면 만들기가 같은 청크 해시로 어디에 심을지 정해요.

```c
// worldgen.c (simplifié)

static void genFoliage (uint8_t *chunk_data, short cx, short cz,
                        uint32_t hash, uint8_t biome) {
  if (biome == BIOME_DESERT) {
    // 선인장: 청크당 후보 하나, 해시가 위치를 정해요
    int tx = (hash >> 8) & 7;
    int tz = (hash >> 12) & 7;
    int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
    if (chunk_data[ty * 64 + tz * 8 + tx] == B_sand)
      placeCactus(chunk_data, tx, ty + 1, tz);
  } else {
    // 나무: 해시가 심는지 어디에 심는지 정해요
    int tree_count = (hash & 3);  // 청크당 나무 0-3그루
    for (int i = 0; i < tree_count; i ++) {
      int tx = ((hash >> (4 + i * 4)) & 7);
      int tz = ((hash >> (6 + i * 4)) & 7);
      int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
      placeTree(chunk_data, tx, ty + 1, tz);
    }
  }
}
```

초록 바이오옴에 청크당 나무 0~3그루, 사막에 선인장 최대 1개. 청크 해시가 유일한 엔트로피 원천이에요. 청크 속 위치에 `& 7`, 개수에 `& 3`. 전부 결정적이고 저장되는 것 없어요.

### generateChunk: 전부 조립하기

8×8×256 블록 완전한 청크 하나를 만드는 모든 것을 합치는 함수예요.

```c
// worldgen.c (simplifié)

void generateChunk (uint8_t *chunk, short cx, short cz) {
  uint32_t hash = getChunkHash(cx, cz);
  uint8_t biome = getChunkBiome(cx, cz);

  // 청크 각 열 (8×8 = 64)
  for (int x = 0; x < 8; x ++) {
    for (int z = 0; z < 8; z ++) {
      // 절대 월드 좌표
      int wx = cx * 8 + x;
      int wz = cz * 8 + z;

      // 열 높이
      uint8_t height = getHeightAt(wx, wz);

      // 아래에서 위로 열 채우기
      for (int y = 0; y < height; y ++) {
        uint8_t block = getTerrainBlock(wx, y, wz);
        chunk[y * 64 + z * 8 + x] = block;
      }
    }
  }

  // 표면 요소 더하기 (나무, 선인장)
  genFoliage(chunk, cx, cz, hash, biome);
}
```

그게 전부예요. 중첩 루프 3개: 열마다 높이를 찾고, 블록을 채우고, 다음으로 넘어가요. 출력은 완전한 청크를 나타내는 `uint8_t[16384]` (8 × 8 × 256)예요. 청크가 만들어지자마자 클라이언트에 바로 보내져요. 캐싱도 지연 불러오기도 압축도 거치지 않아요.

## 저장: 도처에 정적 배열

Bareiron 메모리 아키텍처가 임베디드 C 그 자체예요. 고정 크기 전역 표뿐. malloc도 해시 맵도 연결 리스트도 없어요.

### 블록 변경

```c
// globals.h, lignes 191-196

typedef struct {
  short x;      // 2바이트: 가로 32,000블록 한도
  short z;      // 2바이트
  uint8_t y;    // 1바이트: 세로 256블록 한도
  uint8_t block; // 1바이트: 블록 종류 256개 한도
} BlockChange;
```

20,000개 항목, 약 **25,000개 변경**이에요. 청크 하나 반을 통째로 파낸 것과 같아요. `block` 필드 `0xFF`가 빈 항목 표시. 찾기는 선형 스캔이에요.

![블록 표 메모리 배치: 항목당 6바이트](/images/bareiron/memory-layout.jpg)

```c
// procedures.c

uint8_t getBlockChange (short x, uint8_t y, short z) {
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block == 0xFF) continue;
    if (block_changes[i].x == x && block_changes[i].y == y && block_changes[i].z == z)
      return block_changes[i].block;
    #ifdef ALLOW_CHESTS
      if (block_changes[i].block == B_chest) i += 14;  // 상자 자료 건너뛰기
    #endif
  }
  return 0xFF;
}
```

변경 추가도 찾기만큼 직접적이에요.

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

카운터 하나, 인덱스 하나, 쓰기 하나. 표가 그냥 쌓아요. 정렬도 압축도 메모리 관리도 없어요. 표가 차면 새 변경이 무시돼요. 지형이 만든 상태로 돌아가요.

256블록 한도 저자 코멘트: "patiné légèrement ciré 구리 계단은 당분간 구현 안 할 거예요."

### 몹: 파이프 머리당 8바이트

```c
// globals.h, lignes 240-251 (패딩 없애려고 pragma pack(push, 1))

typedef struct {
  uint8_t type;   // 25=닭, 28=소, 95=돼지, 106=양, 145=좀비
  short x;
  uint8_t y;      // health=0이면 Y가 삭제 전 타이머가 돼요
  short z;
  uint8_t data;   // 비트 0-4: 체력, 비트 5: 양털 깎임, 비트 6-7: 패닉 타이머
} MobData;
```

8바이트. 최대 16칸. 정렬과 패딩은 버려요. `data` 바이트는 집밥 비트필드예요. 체력 5비트, 깎임 1비트, 패닉 타이머 2비트. 그리고 몹이 죽으면 Y 필드가 삭제 전 타이머가 돼요. 비트 수준 메모리 재사용.

### 플레이어: 빽빽하게 넣기

플레이어 자료도 `#pragma pack(push, 1)`을 써요. 좌표는 `short`와 `uint8_t`, 인벤토리는 고정 `uint16_t`와 `uint8_t` 표, `flags` 필드가 공격 쿨다운과 스폰 상태, 숨기와 달리기, 먹기와 불러오기, 움직임 쿨다운, 제작 잠금을 비트 하나씩 인코딩해요. 전부 개별 비트에요.

## 주 루프: while(true)과 막히지 않기

서버 전체가 루프 하나로 돌아요. 스레드 하나, 이벤트 라이브러리 제로.

```c
// main.c, lignes 594-720

while (true) {
  task_yield();  // ESP32에서 와치독이 숨 쉬게 해요

  // 새 연결 받기 (막히지 않아요)
  for (int i = 0; i < MAX_PLAYERS; i ++) {
    if (clients[i] != -1) continue;
    clients[i] = accept(server_fd, ...);
    if (clients[i] != -1) client_count ++;
    break;
  }

  // 시간이 됐으면 서버 틱
  if (get_program_time() - last_tick_time > TIME_BETWEEN_TICKS) {
    handleServerTick(time_since_last_tick);
    last_tick_time = get_program_time();
  }

  // 라운드 로빈: 반복마다 클라이언트 하나, 패킷 하나
  client_index = (client_index + 1) % MAX_PLAYERS;
  if (clients[client_index] == -1) continue;

  // 패킷 헤더 읽기: 길이 + ID
  recv(client_fd, &recv_buffer, 2, MSG_PEEK);
  int length = readVarInt(client_fd);
  int packet_id = readVarInt(client_fd);
  handlePacket(client_fd, length - sizeVarInt(packet_id), packet_id, state);
}
```

루프 반복마다 클라이언트 하나만 처리하고, 패킷 하나만 읽어요. 루프 앞 `task_yield()`가 ESP32에서 FreeRTOS idle 태스크가 숨 쉬게 해요. 없으면 와치독 타이머가 칩을 리셋해요.

패킷 보내기는 **400줄** 괴물 switch예요.

```c
// main.c, lignes 68-497

void handlePacket (int client_fd, int length, int packet_id, int state) {
  switch (packet_id) {
    case 0x00:  // 상태 따라 Handshake와 Status, Login
    case 0x01:  // 상태 핑
    case 0x02:  // 플러그인 메시지
    case 0x03:  // 로그인과 설정 확인
    case 0x08:  // 채팅
    case 0x0B:  // 클라이언트 상태 (리스폰)
    case 0x11:  // 컨테이너 클릭 (상자 다뤄요)
    case 0x19:  // 개체 상호작용
    case 0x1D..0x20:  // 움직임 패킷 (가장 큰 경우)
    case 0x28:  // 플레이어 행동 (파기와 놓기)
    // ... 40개 이상 경우
  }
}
```

switch가 정적 점프 표로 컴파일돼서, 동적 점프 표와 vtable, 맵을 대신해요. 임베디드에 완벽해요.

`0x1D-0x20` 경우가 가장 커요. 위치 고치기와 낙하 피해, 청크 경계 넘기, 몹 스폰, 청크 만들기, 배고픔을 다뤄요. 하나의 큰 fall-through에 전부요.

![Bareiron 서버 코드: C 6800줄](/images/bareiron/code-shot.jpg)

## 서버 틱과 몹 AI

`handleServerTick` 함수가 50ms마다 (20 TPS) 불려요. 주 루프가 플레이어를 맡는 동안 월드를 다뤄요.

```c
// main.c (simplifié)

void handleServerTick (uint32_t delta) {
  // 몹마다 고치기
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type == 0 || mobs[i].data == 0) continue;  // 죽었거나 빔

    MobData *mob = &mobs[i];
    int px, pz;
    getNearestPlayer(mob->x, mob->z, &px, &pz);

    if (mob->type == MOB_ZOMBIE) {
      // 적대적: 가장 가까운 플레이어 쪽으로 걸어요
      if (px < mob->x) mob->x --;
      else if (px > mob->x) mob->x ++;
      if (pz < mob->z) mob->z --;
      else if (pz > mob->z) mob->z ++;
      // 2블록 접촉 피해
      if (abs(px - mob->x) <= 2 && abs(pz - mob->z) <= 2)
        damagePlayer(getNearestPlayerId(mob->x, mob->z), 3);
    } else {
      // 수동적: 무작위 8방향
      uint8_t dir = getMobDir(mob);
      mob->x += dir_lookup[dir][0];
      mob->z += dir_lookup[dir][1];
      // ~40틱마다 방향 바꾸기
      if (mob->data >> 6 < 1) setMobDir(mob, rand() & 7);
      mob->data = (mob->data & 0x3F) | ((mob->data - 0x40) & 0xC0);
    }

    // 몹 주변 청크 깨우기
    setChunkGenerated(mob->x / 8, mob->z / 8);
  }
}
```

적대 몹 AI가 좌표 비교예요. 말 그대로 `if (px < x) x--`. 좀비는 길찾기, A*, 장애물 회피를 무시해요. X와 Z를 플레이어 쪽으로 독립 조정해요. 벽이 있으면 통과해요.

접촉 피해는 초당 3하트. 길찾기 부재 때문에 좀비가 끌고 다니기 쉬워서 p2r3가 높게 원했어요.

방어구 공식은 전투 고치기 전, 가장 단순한 것이에요.

```c
// main.c (simplifié)

static uint8_t applyArmor (uint8_t damage, uint16_t armor_value) {
  // 1.9 전 공식: 선형 감소
  // 방어구 1점 = 4% 감소, 최대 80%
  uint8_t reduction = (armor_value * 4);
  if (reduction > 80) reduction = 80;
  return damage * (100 - reduction) / 100;
}
```

풀 다이아몬드 = 80% 감소. 좀비 타격 3하트가 0.6하트가 돼요. p2r3가 이 옛 공식을 고른 것은 연산 2개로 계산돼서예요. 임계도 곡선도 없고 그냥 선형 백분율.

수동 몹: 조회 표에 방향 8개, ~40틱마다 방향 바꾸기. `data` 필드가 진행 방향을 상위 2비트에, 방향 바꾸기 타이머를 나머지 6비트에 인코딩해요.

![Bareiron 속 몹들: 좀비, 돼지, 양](/images/bareiron/mobs.jpg)

### 몹 리스폰

몹은 무작위 틱으로 스폰하지 않아요. 서버 틱이 새 청크 경계를 만나면 나타나고.

```c
if (player crossed chunk boundary) {
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type != 0) continue;
    spawnMob(&mobs[i], new_chunk_coords, getChunkHash(cx, cz));
    break;
  }
}
```

지형과 같은 RNG, 같은 청크 시드. 몹 자리가 비었으면 스폰이 결정적이에요.

## 제작: 행렬 없이 if와 else

```c
// crafting.c, lignes 9-347 (simplifié)

void getCraftingOutput (PlayerData *player, uint8_t *count, uint16_t *item) {
  // 0x80 깃발이 서면 제작 버퍼가 상자 포인터로 쓰여요
  if (player->flags & 0x80) { *count = 0; *item = 0; return; }

  // 칸 세기, 첫 아이템 찾기, 같은지 확인
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
    case 1:  /* 판자, 주괴... */
    case 2:  /* 막대, 가위, 횃불 */
    case 3:  /* 삽, 검, 반 블록 */
    case 4:  /* 작업대, 부츠 */
    case 5:  /* 곡괭이, 도끼, 투구 */
    case 7:  /* 바지, 퇴비통 */
    case 8:  /* 화로, 상자, 흉갑 */
    case 9:  /* 완전한 블록 (철, 금 등) */
  }
}
```

첫 확인: `0x80` 깃발이 서면 제작 버퍼가 상자 포인터로 재활용돼요. 제작이 잠겨요.

다음에 찬 칸을 세고, 첫 아이템을 적고, 같은지 확인해요. 이것만으로 화로를 검사 4개로 맞춰요.

```c
if (count == 8 && first == cobblestone && all_identical && center_empty)
    return furnace;
```

복잡한 모양은 첫 아이템 인덱스를 쓰고 상대 위치를 확인해요. 레시피가 같은 맞추기 함수를 공유해요. 재료가 결과를 정해요.

![Bareiron 속 제작과 상자 인터페이스](/images/bareiron/crafting.jpg)

## 상자: 진짜 메모리 핵

모두가 말하는 메모리 핵, 진짜 코드로요.

```c
// procedures.c, lignes 1262-1293

if (target == B_chest) {
  // 블록 표에서 상자 항목 찾기
  uint8_t *storage_ptr = NULL;
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block != B_chest) continue;
    if (block_changes[i].x != x || block_changes[i].y != y || block_changes[i].z != z)
      continue;
    storage_ptr = (uint8_t *)(&block_changes[i + 1]);  // 상자 블록 다음을 가리켜요
    break;
  }
  if (storage_ptr == NULL) return;

  // 끔찍한 메모리 핵!!
  // 포인터를 플레이어 제작 아이템 표에 복사해요
  memcpy(player->craft_items, &storage_ptr, sizeof(storage_ptr));
  player->flags |= 0x80;  // 제작을 잠가요

  // 클라이언트에 상자 인터페이스 보내기
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

코드 주석에도요. `// Terrible memory hack!!1!`

정확히 그거예요. `block_changes[]`의 다음 항목 메모리 주소를 가져와 `player->craft_items`(`uint16_t[9]`, 18바이트라서 32비트 포인터를 저장하기 충분)에 복사하고, 그사이 아무도 제작하지 못하게 깃발을 세워요.

상자 인벤토리 클릭마다요.

```c
// packets.c, lignes 620-638

uint8_t *storage_ptr;
memcpy(&storage_ptr, player->craft_items, sizeof(storage_ptr));
// storage_ptr이 이제 상자 자료를 가리켜요
uint16_t *p_item = (uint16_t *)(storage_ptr + (slot - 41) * 3);
uint8_t *p_count = storage_ptr + (slot - 41) * 3 + 2;
```

제작 버퍼에서 포인터를 가져와 오프셋으로 칸에 닿아요. 상자 자료가 칸마다 3바이트 (ID 2개, 수량 1개)로 블록 표에 붙어서 저장돼요.

![블록 표에 저장된 상자 자료: 메모리 핵 하나](/images/bareiron/chest-hack.jpg)

## 배고픔: 5줄 천재

```c
// main.c, lignes 293-305

// 플레이어가 움직이면 초당 ~20개, 가만히 있으면 훨씬 적은 움직임 패킷을 보내요.
// 공짜로 배고픔을 흉내 내려 활동과 연관시켜요.
if (player->saturation == 0) {
  if (player->hunger > 0) player->hunger--;
  player->saturation = 200;
  sc_setHealth(client_fd, player->health, player->hunger, player->saturation);
} else if (player->flags & 0x08) {  // 달리기
  player->saturation -= 1;
}
}
```

말 그대로 그거예요. 5줄. 움직임 패킷마다 포만감이 내려가요. 포만감이 0이 되면 배고픔이 내려가고 포만감을 리셋해요. 달리기(깃발 `0x08`)가 소모를 2배로 해요.

타이머 제로, 할당 메모리 제로, 전용 계산 제로. 이미 존재하는 패킷에 내려가는 카운터 하나.

### 낙하 피해

프로젝트에서 가장 단순한 피해 시스템이에요.

```c
// 땅을 떠나면 Y를 저장해요
// 땅에 다시 닿으면 빼요
degats = dernier_y_au_sol - y_actuel;
```

뺄셈 하나.

## 블록 캐기와 놓기

블록을 누르면 패킷 `0x28`(Player Action)이 switch에 떨어져요. 핸들러가 위치에 어떤 블록이 있는지 정하고, 없애고, 아이템을 인벤토리에 넣어야 해요.

```c
// main.c, case 0x28 (simplifié)

void handlePlayerAction (int client_fd, uint8_t action, int x, uint8_t y, int z) {
  switch (action) {
    case START_DESTROY_BLOCK: {
      // 누른 위치 블록 종류 정하기
      uint8_t block = getBlockAt(x, y, z);

      if (block == B_chest) {
        openChest(client_fd, x, y, z);
        break;
      }

      // block_changes에 더하기
      addBlockChange(x, z, y, 0);  // 0 = 공기

      // 플레이어에게 아이템 주기 (클라이언트를 믿어요)
      addItemToPlayer(client_fd, block_to_item(block), 1);

      // 클라이언트에 고치기 보내기
      sc_blockChange(client_fd, x, y, z, 0);
      sc_ackBlockChange(client_fd, x, y, z, 0);
      break;
    }
    case PLACE_BLOCK: {
      // 플레이어 손에서 블록 종류 읽기
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

`getBlockAt`이 지형 만들기와 플레이어 변경을 합쳐요.

```c
uint8_t getBlockAt (int x, uint8_t y, int z) {
  // 먼저 플레이어 변경 확인
  uint8_t change = getBlockChange(x, y, z);
  if (change != 0xFF) return change;

  // 아니면 만든 지형에서 읽기
  return getTerrainBlock(x, y, z);
}
```

변경 우선, 지형 폴백. 논쟁 제로, 캐시 제로, 부담 제로. 밑의 `getTerrainBlock`은 `getHeightAt`와 stone과 dirt, grass, coal 층이에요.

### 즉석 화로

가장 웃긴 것: 화로가 개체로 존재하지 않아요. "굽기" 칸에 조약돌을 놓고 "연료"에 석탄을 놓으면 결과물이 바로 나와요. 타이머도 청크 틱도 없어요. 맞는 아이템을 넣으면 비워지는 인벤토리 칸일 뿐이에요.

![즉석 화로: 재료를 놓으면 결과가 바로 나와요](/images/bareiron/furnace.jpg)

## ESP32 루프: 4KB 스택 속 MC 서버

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
  // 나머지는 이벤트 핸들러가 다뤄요
}
#endif
```

서버 전체가 **4096바이트 스택** FreeRTOS 태스크에서 돌아요. 그게 전부예요. 주 스레드는 WiFi를 초기화하고 연결을 기다릴 뿐이에요. 연결되면 표준 `main()`을 부르는 `bareiron_main`을 만들어요.

ESP32 전용 코드는 모두 `#ifdef ESP_PLATFORM`으로 지켜져요. PC에서는 전부 표준 POSIX 코드로 컴파일돼요.

## 희생된 것

이 모든 것이 들어가려고 바닐라 기능 중 없는 것들이 있어요.

- **네트워크 압축 제로**: zlib가 너무 비싸요. 서버가 청크를 빨리 만들지만 보내는 것이 병목이에요.
- **무작위 틱 제로**: 나무가 뼛가루로 자라거나 아니에요. 몹이 청크 경계에 스폰해요.
- **아이템 개체 제로**: 캔 블록이 바로 인벤토리에 가요. 애니메이션은 순수 시각.
- **인벤토리 검사 없음**: 클라이언트를 믿어요. 다이아몬드 64개? 좋아요. 1초에 캔 청크? 좋아요. 믿을 만한 사람들 사이에서 쓰세요.
- **서버 조명 제로**: 횃불이 맨 마지막에 보내지고 클라이언트가 계산해요.
- **점진 유체 제로**: 바로 최종 상태.

## 최종 결과

Ryzen 5 3600: 청크당 ~0.5ms.
1달러 ESP32-C3: 청크당 ~200ms. 할 만해요.

![청크 만들기 벤치: Ryzen 대 ESP32](/images/bareiron/performance.jpg)

3명 이상 플레이어: 버벅여요. 저자 말로 피크 시간 2b2t와 비슷해요.

![같은 Bareiron 서버에 접속한 여러 플레이어](/images/bareiron/multiplayer.jpg)

## 철학

p2r3: "0.5와트 먹는 1달러짜리 작은 칩이 Minecraft만큼 진보한 것을 돌릴 수 있다는 생각이 좋아요. 과학은 '왜'가 아니라 '왜 안 돼'가 아니에요."

매 줄이 맞바꾸기예요.

- Perlin 노이즈에서 보간: 덜 예쁘고 200배 빠르고 메모리 제로
- 제작 행렬에서 하드코딩 맞추기: 지저분한 코드, 바이트 제로
- zlib에서 없음: 연결이 구리면 죽음이지만 할 만해요
- 검증에서 믿음: 보안 제로, 계산 제로

빠진 기능마다 하드웨어 한도 안에서 다른 기능이 존재하게 해요.

**기억할 3가지:**

1. **보간 + RNG**: 시드 점 4개, 무한 지형, 저장 제로, 청크 다시 만들지 않고 묻기, 200ms 만들기. 나머지 모두를 가능하게 하는 천재 수예요.
2. **기능마다 비용이 있어요**: 압축과 무작위 틱, 검증 부재는 가정한 선택이에요. 520KB에 들어가는 것이 바로 그 덕분이에요.
3. **지저분한 핵이 가장 영리해요**: memcpy로 블록 표 속 상자, 움직임 패킷으로 배고픔, 즉석 화로. 깔끔한 해법은 너무 비쌌을 거예요.

프로젝트에 관심 있으면 전부 [GPLv3 GitHub](https://github.com/p2r3/bareiron/)에 있어요. 제대로 지저분한 C고, 소스 코드를 읽으면서 이렇게 즐거웠던 적이 드물어요.
