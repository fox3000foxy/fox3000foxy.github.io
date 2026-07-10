---
title: Bareiron -- 1$ 마이크로컨트롤러에서 돌아가는 마인크래프트 서버
description: C 언어 6800줄, malloc 제로, Perlin noise 대신 bilinear interpolation,
  타일 맵 바이옴, 그리고 이 모든 게 1$ 칩 위에서.
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
author_sig: "im6ctOI94PglUkhbOsygUyo/9xw2DSrm1t4I20SURMIYX5KCfwABAICvj8xmmYkvWQYNDKfezuhWlktwcqm44A=="
---

## 서론

혹시 1$ 마이크로컨트롤러에서 마인크래프트 서버를 돌릴 수 있을지 궁금해한 적 있어?

나는 궁금했어. 그리고 답은 "된다"야. 진짜로.

p2r3가 만든 [Bareiron](https://github.com/p2r3/bareiron/)이라는 프로젝트가 있는데, 아마 최근 몇 년간 마인크래프트 세계에서 내가 본 것 중 가장 매혹적인 프로젝트 중 하나일 거야. **300킬로바이트** 바이너리, **C 언어 6800줄**, 외부 의존성 제로, malloc 없음, 스레딩 없음, 그리고 **1달러 ESP32** 위에서 동작해.

![ESP32-C3, 서버를 구동하는 마이크로컨트롤러](/images/bareiron/esp32-board.jpg)

무한 지형 생성. 바이옴. 동굴. 제작. 채광. 몹. 배고픔. 상자. 서바이벌 서버에서 기대하는 모든 것.

**0.5와트** 전력 소모에 **160MHz** 클럭인 칩 위에서 말이야.

비교를 해보자면: 바닐라 마인크래프트 서버는 수 기가바이트의 RAM이 필요해. ESP32-C3는 **520KB SRAM** (부팅 후 사용 가능 400KB)이 전부야. 20년 전 프로세서들도 이미 기가헤르츠로 돌아갔었지 -- 이건 160MHz가 한계야. 순수 성능 차이는 약 **20,000배**나 돼.

p2r3는 그냥 마인크래프트 서버를 C로 포팅한 게 아니야. 이 제약 안에 들어맞도록 서버의 모든 구성 요소를 처음부터 다시 발명했어. 소스 코드를 뜯어보면서 어떻게 했는지 살펴보자.

![p2r3의 Bareiron 소개 영상 썸네일](/images/bareiron/title-card.jpg)

## 프로젝트의 핵심: 메모리 없는 지형 생성

내장형 MC 서버를 만들 때 가장 큰 문제는 지형 생성이야.

바닐라 마인크래프트에서 세계는 **Perlin noise**로 생성돼: 여러 겹의 옥타브를 겹치고, 6개의 바이옴 파라미터(온도, 습기, 대륙성, 침식, 기이함, 깊이)를 사용하며, 매번 전부 재계산하지 않도록 캐싱 시스템도 갖추고 있어.

결과물은 장관이야. 하지만 계산 비용이 크고, 생성된 청크를 저장할 RAM도 많이 필요해.

Bareiron의 접근 방식은 근본적으로 달라. 노이즈를 쌓는 대신, **결정론적 RNG**로 생성된 4개 점의 **bilinear interpolation**을 사용해.

작고 픽셀화된 이미지를 확대할 때 가장자리가 흐릿해지는 거 알지? 바로 그거야.

```c
// worldgen.c, 라인 117-171 (단순화)

uint8_t interpolate (uint8_t a, uint8_t b, uint8_t c, uint8_t d, int x, int z) {
  uint16_t top    = a * (CHUNK_SIZE - x) + b * x;
  uint16_t bottom = c * (CHUNK_SIZE - x) + d * x;
  return (top * (CHUNK_SIZE - z) + bottom * z) / (CHUNK_SIZE * CHUNK_SIZE);
}

uint8_t getHeightAt (int x, int z) {
  int _x = floor(x / CHUNK_SIZE);  // 청크 좌표
  int _z = floor(z / CHUNK_SIZE);
  int rx = x % CHUNK_SIZE;          // 청크 내 오프셋
  int rz = z % CHUNK_SIZE;
  uint32_t hash = getChunkHash(_x, _z);
  uint8_t biome = getChunkBiome(_x, _z);
  // hash + biome으로 시드된 4개 코너 보간
  return getHeightAtFromHash(rx, rz, _x, _z, hash, biome);
}
```

표준 쌍선형 보간: 4개 코너, 위치에 따른 가중치, 출력은 단일 `uint8_t`. CHUNK_SIZE는 8이니까 정수 곱셈으로 처리 가능, float 없음.

p2r3가 영상에서 단계별로 보여줘: 먼저 청크의 4개 코너, 각각 RNG로 시드된 높이를 가져.

![청크의 4개 코너, 각각 결정론적 RNG로 시드됨](/images/bareiron/gen-four-corners.jpg)

그 다음 4개 점 사이의 보간이 연속적인 표면을 만들어내.

![4개 코너 사이에 bilinear interpolation 적용](/images/bareiron/gen-interpolate.jpg)

이 패턴을 모든 인접 청크에 반복하면 무한히 뻗어나가는 지형을 얻을 수 있어.

![최종 결과: 연속적인 불규칙 지형](/images/bareiron/gen-result.jpg)

### 결정론적 RNG

이 모든 걸 가능하게 하는 핵심은 시딩이야. 각 청크는 4개의 코너를 갖고, 각 코너는 고유하지만 재현 가능한 의사 난수 값이 필요해.

```c
// worldgen.c, 라인 13-22

uint32_t getChunkHash (short x, short z) {
  uint8_t buf[8];
  memcpy(buf, &x, 2);          // X 좌표 16비트
  memcpy(buf + 2, &z, 2);      // Z 좌표 16비트
  memcpy(buf + 4, &world_seed, 4);  // 전역 시드 32비트
  return splitmix64(*((uint64_t *)buf));  // 해시
}
```

X의 16비트, Z의 16비트, 시드의 32비트를 8바이트 버퍼에 패킹하고 `splitmix64`에 통과시켜. 결과: 월드 시드를 기반으로 각 위치에 대한 결정론적 고유 값.

이게 얼마나 강력한지 알아? 서버가 지형을 저장할 필요가 없어. 플레이어가 새 영역에 도착하면 실시간으로 재계산하고, 매번 정확히 같은 결과를 내놓는 거야.

사용된 `splitmix64`는 64비트 해시용으로 설계된 초고속 PRNG야:

```c
// worldgen.c (단순화)

static uint32_t splitmix64 (uint64_t state) {
  state += 0x9E3779B97F4A7C15ull;
  uint64_t z = state;
  z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ull;
  z = (z ^ (z >> 27)) * 0x94D049BB133111EBull;
  return (z ^ (z >> 31)) >> 32;
}
```

3개 연산: 덧셈, xor/시프트, 곱셈, xor/시프트, 곱셈, xor/시프트. 룩업 테이블 없음, 루프 없음. 8바이트 버퍼(X + Z + 시드)를 받아서 64비트 정수로 처리하고, 32비트 해시를 반환해. 결정론적이고 빠르며 5줄이면 끝나.

### 왜 Perlin noise가 아닌가

p2r3가 영상에서 직접 말했어: "난수에서 더 많은 자릿수를 사용할수록 지형이 더 규칙적이게 돼, 마치 동전 던지기를 많이 할수록 50/50에 가까워지는 것처럼." 실제로는, 그가 결합하는 해시 비트 수에 따라 달라져:

```c
// worldgen.c, 라인 51-115

// 평원 바이옴: 4개 요소 결합 → 평탄한 지형
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// 설원: 2개 요소 → 더 울퉁불퉁
h = (hash % 5) + ((hash >> 4) % 5);
```

각 바이옴은 몇 개의 비트 추출을 결합할지 선택해. 많을수록 분포가 안정화되지 -- 동전 던지기를 많이 할수록 50/50에 가까워지는 것처럼. 적을수록 지역 변동이 더 커져.

![불규칙 지형 -- 적은 요소, 강한 변동](/images/bareiron/terrain-irregular.jpg)

2개 요소만 사용하면, 설원은 구릉지에 가깝고 거의 산지 같은 지형을 만들어. 봉우리와 골짜기가 빈번해.

![규칙적인 지형 -- 여러 요소, 부드러운 표면](/images/bareiron/terrain-regular.jpg)

4개 요소를 사용하면, 평원은 평탄하고 예측 가능하게 유지돼. 분포가 안정화되지.

청크 하나 생성에 ESP32에서 **200ms** 걸려 -- 같은 하드웨어에서 Perlin noise는 너무 무거워서 측정조차 안 될 정도야.

### 결정적인 디테일: 전체 청크 생성 없이 블록 조회하기

플레이어가 블록을 캐. 서버는 어떤 아이템을 줄지 알아내야 해. 단순하게는, 이를 위해 청크 전체를 생성해야 할 거야.

쌍선형 보간을 사용하면, 좌표만으로 평면의 **어느 점이든** 직접 조회할 수 있어. 청크의 코너는 플레이어 위치에서 얻고, 보간이 임의의 오프셋에서 높이를 알려줘. 소수의 수학 연산만으로, 청크 생성은 필요 없어.

p2r3: "내가 원하는 건, 메모리에 접근하거나 비싼 노이즈 맵을 계산하지 않고도 주어진 좌표에 어떤 블록이 있는지 알려주는 마법 같은 함수야." 정확히 그가 만든 거지.

높이가 어떻게 구체적인 블록이 되는지 보자:

```c
// worldgen.c (단순화)

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

5개 조건. grass/dirt/stone/deepslate/bedrock 레이어. 표면 블록은 `biome_top[]`을 통해 바이옴에 따라 달라져 -- 평원은 grass, 사막은 sand. 루프 없음, switch 없음, 올바른 레이어로 떨어지는 if 연속.

### 동굴, 가장 게으른 미러링

```c
동굴_고도 = CAVE_BASE_DEPTH - (표면_높이 - y);
```

표면 높이를 지하로 미러링해. 깊은 슬레이트의 큰 공동처럼 보여. 계산 제로, 한 줄이면 끝.

![표면 지형 미러링으로 생성된 동굴](/images/bareiron/cave-mirror.jpg)

![동굴 생성을 위한 지형 미러링 다이어그램](/images/bareiron/cave-diagram.jpg)

### 광물, XOR 버전

```c
후보 = (chunk_x ^ col_x ^ col_z) % 100;
if (후보 < 5 && y < 16) -> 다이아몬드
```

좌표 XOR은 열 당 하나의 후보를 보장해. 유형은 고도에만 의존해. 다이아몬드는 동굴의 가장 낮은 지점 아래 숨겨져 있어서 채굴이 의미 있게 해.

### 타일 맵 바이옴

각 바이옴은 그리드 안의 원형 섬이고, 그 유형은 시드에서 계산된 패턴에 의해 결정돼. 격자 형태, 예측 가능, 공짜야.

![타일 맵 바이옴 지도 -- 각 섬이 다른 바이옴](/images/bareiron/biome-tilemap.jpg)

각 바이옴은 배열에 인코딩된 고유한 파라미터 세트를 가져:

```c
// worldgen.c (단순화)

static const uint8_t biome_base[] = {
  [BIOME_PLAINS]  = 48,   // 기본 높이: 48
  [BIOME_DESERT]  = 52,   // 약간 더 높음
  [BIOME_FOREST]  = 50,   // 중간
  [BIOME_TAIGA]   = 46,   // 약간 낮음
  [BIOME_SNOWY]   = 40,   // 가장 낮음
};

static const uint8_t biome_top[] = {
  [BIOME_PLAINS]  = B_grass,
  [BIOME_DESERT]  = B_sand,
  [BIOME_FOREST]  = B_grass,
  [BIOME_TAIGA]   = B_grass,
  [BIOME_SNOWY]   = B_snow_block,
};

static const uint8_t biome_factors[] = {
  [BIOME_PLAINS]  = 4,   // 4개 추출 → 매우 규칙적
  [BIOME_DESERT]  = 3,   // 3개 추출 → 보통
  [BIOME_FOREST]  = 4,   // 4개 추출 → 규칙적, 구릉
  [BIOME_TAIGA]   = 3,   // 3개 추출 → 보통
  [BIOME_SNOWY]   = 2,   // 2개 추출 → 매우 울퉁불퉁
};
```

**평원(Plains)**: 높이 48, 4개 요소 → 매우 평탄한 지형, 잔디.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// 결과: 최대 ±4 블록 변동
```

**사막(Desert)**: 높이 52, 3개 요소, 표면 블록 = 모래. 절대 해수면 아래로 내려가지 않음.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3);
// 결과: 최대 ±6 블록 변동, SEA_LEVEL+1으로 클램프
```

**숲(Forest)**: 높이 50, 4개 요소, 평원과 같지만 기준이 더 높음 → 숲이 우거진 언덕.

**타이가(Taiga)**: 높이 46, 3개 요소 → 적당한 변동, 차가운 지형.

**설원(Snowy plains)**: 높이 40, 단 2개 요소 → 가장 울퉁불퉁.

```c
h = (hash % 5) + ((hash >> 4) % 5);
// 결과: 최대 ±14 블록 변동
```

각 바이옴은 **5개 항목의 3개 배열**에 인코딩돼: 기본 높이, 표면 블록, 요소 수. `getHeightAtFromHash`가 바이옴을 받으면 이 배열들을 참조해 지형을 조정해. 마인크래프트의 전체 바이옴 시스템을 대체하는 15바이트 데이터.

바이옴 감지기는 시드를 사용해 각 청크에 어떤 바이옴이 매핑되는지 결정해:

```c
// worldgen.c (단순화)

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

16개 항목 패턴, 청크 좌표로 시드된 인덱스. 반복적이지만 시각적으로 일관성 있는 그리드를 만들어. 마인크래프트 바닐라의 전체 바이옴 파라미터 시스템을 대체하는 4줄의 코드.

### getHeightAtFromHash: 지형 조립기

생성의 핵심 함수는 바이옴으로 시드된 4개 코너를 결합해:

```c
// worldgen.c (단순화)

static uint8_t getHeightAtFromHash (int rx, int rz, short cx, short cz,
                                    uint32_t h, uint8_t biome) {
  // 해시에서 추출한 4개 코너, 코너마다 다른 시드
  uint8_t h1 = biome_base[biome] + (h & 0x0F);
  uint8_t h2 = biome_base[biome] + ((h >> 4) & 0x0F);
  uint8_t h3 = biome_base[biome] + ((h >> 8) & 0x0F);
  uint8_t h4 = biome_base[biome] + ((h >> 12) & 0x0F);

  // 바이옴 제약: 사막은 절대 물에 잠기지 않음
  if (biome == BIOME_DESERT) {
    h1 = max(h1, SEA_LEVEL + 1);
    h2 = max(h2, SEA_LEVEL + 1);
    h3 = max(h3, SEA_LEVEL + 1);
    h4 = max(h4, SEA_LEVEL + 1);
  }

  // 4개 코너에서 보간
  return interpolate(h1, h2, h3, h4, rx, rz);
}
```

각 바이옴은 기준 높이를 이동시키는 `biome_base`를 가지고, 4개 코너는 해시에서 다른 시프트로 추출돼. 사막은 해수면 이상으로 최소값을 강제하는데 -- 추가 바이옴 계산 없이 물을 피하는 한 줄의 제약이야.

### 나무와 선인장: 확률적 배치

표면 생성은 동일한 청크 해시를 사용해 어디에 심을지 결정해:

```c
// worldgen.c (단순화)

static void genFoliage (uint8_t *chunk_data, short cx, short cz,
                        uint32_t hash, uint8_t biome) {
  if (biome == BIOME_DESERT) {
    // 선인장: 청크 당 한 개, 해시가 위치 결정
    int tx = (hash >> 8) & 7;
    int tz = (hash >> 12) & 7;
    int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
    if (chunk_data[ty * 64 + tz * 8 + tx] == B_sand)
      placeCactus(chunk_data, tx, ty + 1, tz);
  } else {
    // 나무: 해시가 배치 여부와 위치 결정
    int tree_count = (hash & 3);  // 청크 당 0-3 그루
    for (int i = 0; i < tree_count; i ++) {
      int tx = ((hash >> (4 + i * 4)) & 7);
      int tz = ((hash >> (6 + i * 4)) & 7);
      int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
      placeTree(chunk_data, tx, ty + 1, tz);
    }
  }
}
```

녹색 바이옴은 청크 당 0-3그루의 나무, 사막은 최대 1개의 선인장. 청크 해시가 유일한 엔트로피 소스야 -- `& 7`로 청크 내 위치, `& 3`로 카운터. 모든 것이 결정론적이고, 아무것도 저장되지 않아.

### generateChunk: 모든 것 조립하기

8×8×256 블록의 완전한 청크를 생성하는 함수:

```c
// worldgen.c (단순화)

void generateChunk (uint8_t *chunk, short cx, short cz) {
  uint32_t hash = getChunkHash(cx, cz);
  uint8_t biome = getChunkBiome(cx, cz);

  // 청크의 각 열에 대해 (8×8 = 64)
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

  // 표면 요소 추가 (나무, 선인장)
  genFoliage(chunk, cx, cz, hash, biome);
}
```

이게 전부야. 3개 중첩 루프: 각 열마다 높이를 찾고, 블록을 채우고, 다음으로 넘어가. 출력은 완전한 청크를 나타내는 `uint8_t[16384]` (8 × 8 × 256)야. 캐싱 없음, 레이지 로딩 없음, 압축 없음 -- 청크가 생성되는 즉시 클라이언트로 전송돼.

## 저장소: 모든 것이 정적 배열

Bareiron의 메모리 아키텍처는 내장형 C의 진수를 보여줘. malloc 없음, 해시 맵 없음, 연결 리스트 없음.

모든 것이 고정 크기의 전역 배열 안에 있어.

### 블록 변경

```c
// globals.h, 라인 191-196

typedef struct {
  short x;      // 2바이트 -- 수평 32,000 블록 제한
  short z;      // 2바이트
  uint8_t y;    // 1바이트 -- 수직 256 블록 제한
  uint8_t block; // 1바이트 -- 256 블록 타입 제한
} BlockChange;
```

20,000개 항목, 약 **25,000개 변경** -- 1.5 청크를 완전히 파낸 것과 맞먹어. `block` 필드가 `0xFF`면 빈 항목을 표시해. 검색은 선형 스캔:

![블록 배열 메모리 레이아웃 -- 항목 당 6바이트](/images/bareiron/memory-layout.jpg)

```c
// procedures.c

uint8_t getBlockChange (short x, uint8_t y, short z) {
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block == 0xFF) continue;
    if (block_changes[i].x == x && block_changes[i].y == y && block_changes[i].z == z)
      return block_changes[i].block;
    #ifdef ALLOW_CHESTS
      if (block_changes[i].block == B_chest) i += 14;  // 상자 데이터 건너뛰기
    #endif
  }
  return 0xFF;
}

변경 추가도 검색만큼 직접적이야:

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

카운터, 인덱스, 쓰기. 정렬 없음, 압축 없음, 메모리 관리 없음. 배열이 가득 차면 새 변경은 무시돼 -- 지형이 생성된 상태로 되돌아가.

256 블록 제한에 대한 작성자의 코멘트: "가볍게 산화된 구리 계단은 당장 구현할 생각 없음."

### 몹: 머리 당 8바이트

```c
// globals.h, 라인 240-251 (패딩 제거를 위한 pragma pack(push, 1))

typedef struct {
  uint8_t type;   // 25=닭, 28=소, 95=돼지, 106=양, 145=좀비
  short x;
  uint8_t y;      // health=0이면 Y가 제거 전 타이머가 됨
  short z;
  uint8_t data;   // 비트 0-4: 체력, 비트 5: 양 털깎기, 비트 6-7: 공포 타이머
} MobData;
```

8바이트. 최대 16개 슬롯. 정렬 없음, 패딩 없음. `data` 바이트는 수제 비트필드야: 체력 5비트, 털깎기 1비트, 공포 타이머 2비트. 그리고 몹이 죽으면, Y 필드가 제거 전 타이머가 돼. 비트 수준의 메모리 재활용이지.

### 플레이어: 빈틈없이 패킹

플레이어 데이터도 `#pragma pack(push, 1)`을 사용해 -- 좌표는 `short` + `uint8_t`, 인벤토리는 `uint16_t` + `uint8_t` 고정 배열, 그리고 `flags` 필드는 공격 쿨다운, 스폰 상태, 스니킹, 스프린팅, 식사, 로딩, 이동 쿨다운, 제작 잠금을 전부 인코딩해. 이 모든 게 개별 비트에 들어있어.

## 메인 루프: while(true)와 논블로킹

서버 전체가 단일 루프, 단일 스레드, 이벤트 라이브러리 제로로 돌아가.

```c
// main.c, 라인 594-720

while (true) {
  task_yield();  // ESP32에서 watchdog 숨 쉬게 하기

  // 새 연결 수락 (논블로킹)
  for (int i = 0; i < MAX_PLAYERS; i ++) {
    if (clients[i] != -1) continue;
    clients[i] = accept(server_fd, ...);
    if (clients[i] != -1) client_count ++;
    break;
  }

  // 시간이 지났으면 서버 틱
  if (get_program_time() - last_tick_time > TIME_BETWEEN_TICKS) {
    handleServerTick(time_since_last_tick);
    last_tick_time = get_program_time();
  }

  // 라운드 로빈: 한 클라이언트, 반복 당 한 패킷
  client_index = (client_index + 1) % MAX_PLAYERS;
  if (clients[client_index] == -1) continue;

  // 패킷 헤더 읽기: 길이 + ID
  recv(client_fd, &recv_buffer, 2, MSG_PEEK);
  int length = readVarInt(client_fd);
  int packet_id = readVarInt(client_fd);
  handlePacket(client_fd, length - sizeVarInt(packet_id), packet_id, state);
}
```

루프 반복 당 하나의 클라이언트만 처리되고, 한 번에 하나의 패킷만 읽혀. 루프 시작 부분의 `task_yield()`는 ESP32에서 FreeRTOS idle 태스크가 숨 쉴 수 있게 해 -- 이게 없으면 watchdog 타이머가 칩을 리셋시켜 버려.

패킷 디스패치는 **400줄**짜리 거대한 switch야:

```c
// main.c, 라인 68-497

void handlePacket (int client_fd, int length, int packet_id, int state) {
  switch (packet_id) {
    case 0x00:  // Handshake / Status / Login (상태에 따라)
    case 0x01:  // Status ping
    case 0x02:  // Plugin message
    case 0x03:  // Login/configuration acknowledgment
    case 0x08:  // Chat
    case 0x0B:  // Client status (respawn)
    case 0x11:  // Click container (상자 처리)
    case 0x19:  // Interact entity
    case 0x1D..0x20:  // Movement packets (가장 큰 케이스)
    case 0x28:  // Player action (dig/place)
    // ... 40개 이상 케이스
  }
}
```

동적 점프 테이블 없음, vtable 없음, 맵 없음. switch는 정적 점프 테이블로 컴파일돼. 내장형에 완벽하지.

`0x1D-0x20` 케이스가 가장 커 -- 위치 업데이트, 낙하 데미지, 청크 경계 횡단, 몹 스폰, 청크 생성, 그리고 배고픔까지 전부 처리해. 하나의 큰 fall-through로 한 번에 다 해결해.

![Bareiron 서버 코드 -- C 언어 6800줄](/images/bareiron/code-shot.jpg)

## 서버 틱과 몹 AI

`handleServerTick` 함수는 50ms(20 TPS)마다 호출돼. 메인 루프가 플레이어를 처리하는 동안 세계를 관리해:

```c
// main.c (단순화)

void handleServerTick (uint32_t delta) {
  // 각 몹 업데이트
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type == 0 || mobs[i].data == 0) continue;  // 죽었거나 빈 슬롯

    MobData *mob = &mobs[i];
    int px, pz;
    getNearestPlayer(mob->x, mob->z, &px, &pz);

    if (mob->type == MOB_ZOMBIE) {
      // 적대적: 가장 가까운 플레이어에게 걸어감
      if (px < mob->x) mob->x --;
      else if (px > mob->x) mob->x ++;
      if (pz < mob->z) mob->z --;
      else if (pz > mob->z) mob->z ++;
      // 2블록 내 접촉 데미지
      if (abs(px - mob->x) <= 2 && abs(pz - mob->z) <= 2)
        damagePlayer(getNearestPlayerId(mob->x, mob->z), 3);
    } else {
      // 수동적: 8방향 무작위
      uint8_t dir = getMobDir(mob);
      mob->x += dir_lookup[dir][0];
      mob->z += dir_lookup[dir][1];
      // 약 40틱마다 방향 변경
      if (mob->data >> 6 < 1) setMobDir(mob, rand() & 7);
      mob->data = (mob->data & 0x3F) | ((mob->data - 0x40) & 0xC0);
    }

    // 몹 주변 청크 깨우기
    setChunkGenerated(mob->x / 8, mob->z / 8);
  }
}
```

적대적 몹의 AI는 좌표 비교야. 말 그대로 `if (px < x) x--`. 경로 탐색 없음, A* 없음, 장애물 회피 없음. 좀비가 플레이어를 향해 X와 Z를 독립적으로 조정해 -- 벽이 있으면 그냥 통과해.

접촉 데미지는 초당 3하트야. p2r3가 일부러 높게 설정했는데, 경로 탐색이 없어서 좀비를 카이팅하기 쉽기 때문이야.

방어구 공식은 전투 업데이트 이전의 것 -- 가능한 가장 단순한 버전:

```c
// main.c (단순화)

static uint8_t applyArmor (uint8_t damage, uint16_t armor_value) {
  // 1.9 이전 공식: 선형 감소
  // 방어구 포인트 당 4% 감소, 최대 80%
  uint8_t reduction = (armor_value * 4);
  if (reduction > 80) reduction = 80;
  return damage * (100 - reduction) / 100;
}
```

풀 다이아몬드 = 80% 감소. 좀비 한 대 3하트가 0.6하트가 돼. p2r3가 이 구식 공식을 선택한 이유는 2번의 연산으로 계산되기 때문이야 -- 임계값 없음, 곡선 없음, 그냥 선형 백분율.

수동적 몹: 룩업 테이블의 8방향, 약 40틱마다 방향 변경. `data` 필드는 상위 2비트에 현재 방향을, 나머지 6비트에 방향 변경 타이머를 인코딩해.

![Bareiron의 몹들 -- 좀비, 돼지, 양](/images/bareiron/mobs.jpg)

### 몹 리스폰

몹은 랜덤 틱으로 스폰되지 않아. 서버 틱이 새 청크 경계를 만날 때 나타나:

```c
if (플레이어가 청크 경계를 넘었음) {
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type != 0) continue;
    spawnMob(&mobs[i], 새_청크_좌표, getChunkHash(cx, cz));
    break;
  }
}
```

지형과 같은 RNG, 같은 청크 시드. 몹 슬롯이 비어 있으면 스폰은 결정론적이야.

## 제작: 행렬 없음, if/else만

```c
// crafting.c, 라인 9-347 (단순화)

void getCraftingOutput (PlayerData *player, uint8_t *count, uint16_t *item) {
  // 0x80 플래그가 설정되어 있으면, 제작 버퍼가 상자에 사용 중
  if (player->flags & 0x80) { *count = 0; *item = 0; return; }

  // 슬롯 수 세기, 첫 번째 아이템 찾기, 동일성 확인
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
    case 2:  /* 막대기, 가위, 횃불 */
    case 3:  /* 삽, 검, 반 블록 */
    case 4:  /* 제작대, 부츠 */
    case 5:  /* 곡괭이, 도끼, 투구 */
    case 7:  /* 레깅스, 퇴비통 */
    case 8:  /* 화로, 상자, 흉갑 */
    case 9:  /* 전체 블록 (철, 금 등) */
  }
}
```

첫 번째 체크: `0x80` 플래그가 설정되어 있으면, 제작 버퍼가 상자 포인터로 재활용된 거야. 제작 불가.

그 다음, 채워진 슬롯 수를 세고, 첫 번째 아이템을 기록하며, 동일성을 확인해. 이것만으로 화로를 4번 체크로 매칭할 수 있어:

```c
if (count == 8 && first == 조약돌 && all_identical && center_empty)
    return 화로;
```

복잡한 형태는 첫 번째 아이템의 인덱스를 사용해 상대적 위치를 확인해. 레시피는 동일한 매칭 함수를 공유해 -- 재료가 결과를 결정해.

![Bareiron의 제작 및 상자 인터페이스](/images/bareiron/crafting.jpg)

## 상자: 진정한 해킹

모두가 말하는 메모리 해킹, 실제 코드로 보면:

```c
// procedures.c, 라인 1262-1293

if (target == B_chest) {
  // 블록 배열에서 상자 항목 찾기
  uint8_t *storage_ptr = NULL;
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block != B_chest) continue;
    if (block_changes[i].x != x || block_changes[i].y != y || block_changes[i].z != z)
      continue;
    storage_ptr = (uint8_t *)(&block_changes[i + 1]);  // 상자 블록 뒤를 가리킴
    break;
  }
  if (storage_ptr == NULL) return;

  // Terrible memory hack!!
  // POINTER를 플레이어의 제작 아이템 배열에 복사
  memcpy(player->craft_items, &storage_ptr, sizeof(storage_ptr));
  player->flags |= 0x80;  // 제작 잠금

  // 클라이언트에 상자 인터페이스 전송
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

그리고 코드의 주석: `// Terrible memory hack!!1!`

말 그대로 그거야. `block_changes[]`에서 다음 항목의 메모리 주소를 가져와 `player->craft_items`에 복사해 (이는 `uint16_t[9]`, 즉 18바이트 -- 32비트 포인터를 저장하기에 충분해), 그리고 아무도 그동안 제작을 시도하지 못하도록 플래그를 설정해.

상자 인벤토리에서 클릭할 때마다:

```c
// packets.c, 라인 620-638

uint8_t *storage_ptr;
memcpy(&storage_ptr, player->craft_items, sizeof(storage_ptr));
// storage_ptr이 이제 상자 데이터를 가리킴
uint16_t *p_item = (uint16_t *)(storage_ptr + (slot - 41) * 3);
uint8_t *p_count = storage_ptr + (slot - 41) * 3 + 2;
```

제작 버퍼에서 포인터를 꺼내고, 오프셋으로 슬롯에 접근해. 상자 데이터는 슬롯 당 3바이트(ID용 2, 개수용 1)로, 블록 배열 안에 서로 붙어서 저장돼.

![블록 배열에 저장된 상자 데이터 -- 메모리 해킹](/images/bareiron/chest-hack.jpg)

## 배고픔: 5줄의 천재성

```c
// main.c, 라인 293-305

// 플레이어가 움직일 때는 초당 ~20개의 움직임 패킷을 보내고,
// 가만히 있을 때는 훨씬 적게 보낸다. 이를 활동과 연관지어
// 공짜로 배고픔을 시뮬레이션한다.
if (player->saturation == 0) {
  if (player->hunger > 0) player->hunger--;
  player->saturation = 200;
  sc_setHealth(client_fd, player->health, player->hunger, player->saturation);
} else if (player->flags & 0x08) {  // 달리기
  player->saturation -= 1;
}
```

말 그대로 이게 전부야. 5줄. 움직임 패킷이 올 때마다 포만감이 감소해. 포만감이 0이 되면 배고픔이 줄고 포만감이 리셋돼. 달리기(`0x08` 플래그)는 소모를 두 배로 만들어.

타이머 제로, 할당 메모리 제로, 전용 계산 제로. 이미 존재하는 패킷에서 감소하는 카운터일 뿐이야.

### 낙하 데미지

프로젝트에서 가장 단순한 데미지 시스템:

```c
// 플레이어가 땅에서 떨어질 때 Y를 저장
// 다시 땅에 닿을 때 차이를 뺌
데미지 = 마지막_땅_위_Y - 현재_Y;
```

뺄셈 하나.

## 블록 채굴과 설치

블록을 클릭하면 `0x28` (Player Action) 패킷이 switch에 도착해. 핸들러는 해당 위치의 블록을 확인하고, 제거한 후 인벤토리에 아이템을 넣어야 해:

```c
// main.c, case 0x28 (단순화)

void handlePlayerAction (int client_fd, uint8_t action, int x, uint8_t y, int z) {
  switch (action) {
    case START_DESTROY_BLOCK: {
      // 클릭한 위치의 블록 타입 확인
      uint8_t block = getBlockAt(x, y, z);

      if (block == B_chest) {
        openChest(client_fd, x, y, z);
        break;
      }

      // block_changes에 추가
      addBlockChange(x, z, y, 0);  // 0 = 공기

      // 플레이어에게 아이템 지급 (클라이언트 신뢰)
      addItemToPlayer(client_fd, block_to_item(block), 1);

      // 클라이언트에 업데이트 전송
      sc_blockChange(client_fd, x, y, z, 0);
      sc_ackBlockChange(client_fd, x, y, z, 0);
      break;
    }
    case PLACE_BLOCK: {
      // 플레이어 손에 든 아이템 타입 읽기
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

`getBlockAt`은 지형 생성과 플레이어 변경을 결합해:

```c
uint8_t getBlockAt (int x, uint8_t y, int z) {
  // 먼저 플레이어 변경 확인
  uint8_t change = getBlockChange(x, y, z);
  if (change != 0xFF) return change;

  // 없으면 생성된 지형에서 읽기
  return getTerrainBlock(x, y, z);
}
```

변경이 우선, 지형이 폴백. 논쟁 제로, 캐시 제로, 오버헤드 제로. 내부의 `getTerrainBlock`은 `getHeightAt` + stone/dirt/grass/coal 레이어야.

### 즉석 화로

가장 재밌는 부분: 화로는 엔티티로서 존재하지 않아. "조리" 슬롯에 조약돌을, "연료"에 석탄을 넣으면 결과가 즉시 나타나. 타이머 없음, 청크 틱 없음. 그냥 올바른 아이템을 넣었을 때 비워지는 인벤토리 슬롯일 뿐이야.

![즉석 화로 -- 재료 넣으면 즉시 결과](/images/bareiron/furnace.jpg)

## ESP32 루프: 4KB 스택의 MC 서버

```c
// main.c, 라인 732-779

#ifdef ESP_PLATFORM

void bareiron_main (void *pvParameters) {
  main();
  vTaskDelete(NULL);
}

static void wifi_event_handler (...) {
  if (/* 연결됨 */) {
    xTaskCreate(bareiron_main, "bareiron", 4096, NULL, 5, NULL);
  }
}

void app_main () {
  esp_timer_early_init();
  wifi_init();
  // 나머지는 이벤트 핸들러가 처리
}
#endif
```

서버 전체가 **4096바이트 스택**의 FreeRTOS 태스크 안에서 돌아가. 그게 다야. 메인 스레드는 WiFi를 초기화하고 연결을 기다리는 일만 해. 연결되면 표준 `main()`을 호출하는 `bareiron_main`을 스폰해.

ESP32 특화 코드는 전부 `#ifdef ESP_PLATFORM`으로 보호돼. PC에서는 표준 POSIX 코드로 컴파일돼.

## 희생된 것들

이 모든 걸 맞추기 위해, 존재하지 않는 바닐라 기능들이 있어:

- **네트워크 압축 없음** -- zlib이 너무 비쌈. 서버는 청크를 빠르게 생성하지만, 전송이 병목.
- **랜덤 틱 없음** -- 나무는 뼛가루로만 자람. 몹은 청크 경계에서 스폰.
- **아이템 엔티티 없음** -- 채굴한 블록은 바로 인벤토리로. 애니메이션은 순전히 시각적.
- **인벤토리 검증 없음** -- 클라이언트를 신뢰. 다이아 64개? OK. 1초에 청크 하나 채굴? OK. 믿을 수 있는 사람끼리만 사용할 것.
- **서버 측 조명 없음** -- 횃불은 다른 것들 다음에 전송되고, 클라이언트가 계산.
- **점진적 유체 없음** -- 즉시 최종 상태.

## 최종 결과

Ryzen 5 3600: 청크 당 ~0.5ms.
1$ ESP32-C3: 청크 당 ~200ms. 플레이 가능.

![청크 생성 벤치마크 -- Ryzen vs ESP32](/images/bareiron/performance.jpg)

3명 이상 플레이어: 버벅임. 작성자 왈, 피크 시간대의 2b2t와 비슷.

![동일한 Bareiron 서버에 접속한 여러 플레이어](/images/bareiron/multiplayer.jpg)

## 철학

p2r3: "0.5와트를 소비하는 이 아주 작은 1$ 칩이 마인크래프트만큼 고급진 무언가를 돌릴 수 있다는 생각이 그냥 좋아. 과학은 '왜'에 관한 게 아니야, '왜 안 될까'에 관한 거지."

모든 줄은 트레이드오프야:
- Perlin noise → 보간: 덜 예쁘지만 200배 빠르고 메모리 제로
- 제작 행렬 → 하드코딩 매칭: 코드는 지저분하지만 바이트 제로
- zlib → 없음: 연결 안 좋으면 죽음, 하지만 플레이 가능
- 검증 → 신뢰: 보안 제로, 계산 제로

없는 모든 기능이 다른 기능이 하드웨어 한계 안에 존재할 수 있게 해.

**기억할 3가지:**

1. **보간 + RNG** -- 4개 시드 점, 무한 지형, 저장 제로, 청크 재생성 없이 조회, 200ms 생성. 이게 모든 것을 가능하게 한 천재적인 움직임.
2. **모든 기능에는 비용이 있다** -- 압축 없음, 랜덤 틱 없음, 검증 없음. 잊어버린 게 아니라, 520KB 안에 맞추기 위해 선택한 것.
3. **지저분한 해킹이 가장 똑똑하다** -- memcpy로 블록 배열 속 상자, 움직임 패킷으로 배고픔, 즉석 화로. 깔끔한 해결책은 너무 비쌌을 거야.

프로젝트가 흥미롭다면, 모든 게 [GitHub에 GPLv3 라이선스](https://github.com/p2r3/bareiron/)로 공개되어 있어. 아주 더러운 C 코드고, 소스 코드 읽으면서 이렇게 재미본 적이 거의 없었어 xD
