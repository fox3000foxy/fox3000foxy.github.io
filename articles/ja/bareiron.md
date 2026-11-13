---
title: Bareiron -- 1ドルのマイコンで動くMinecraftサーバー
description: 6800行のC、mallocなし、Perlinノイズをbilinear補間に置き換え、タイルマップ式バイオーム。全部1ドルのチップの上で。
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
author_sig: "62TRyoombEUdqbmq5M8NHgMKrj3sxyAM7VVMfJDv4quEZ4dujfMK1KMVVbYxr+YPJfpHLD5CsrQZn0vQRgn66A=="
---

## はじめに

1ドルのマイコンでMinecraftサーバーを動かすなんて、冗談みたいに聞こえる。

私は自問した。答えはイエスだ。文字通りね。

[Bareiron](https://github.com/p2r3/bareiron/)っていうプロジェクトがあって、p2r3作で、ここ数年Minecraft界隈で見た中でたぶん一番魅惑的なプロジェクトの1つだ。**300キロバイト**に収まるバイナリ、**6800行のC**、外部依存ゼロ、mallocなし、スレッドなし。それが**1ドルのESP32**で動く。

![ESP32-C3、サーバーを動かすマイコン](/images/bareiron/esp32-board.jpg)

無限地形生成。バイオーム。洞窟。クラフト。採掘。モブ。空腹。チェスト。サバイバルサーバーに期待するもの全部ある。

0.5ワット消費でクロック160MHzのチップの上でだ。

規模感を言うと、バニラのMinecraftサーバーは数ギガのRAMが要る。ESP32-C3は**SRAM 520KB**（起動後に残るのは400）。20年前のプロセッサはすでにギガヘルツで回ってたのに、こいつは160MHzが上限だ。純粋な性能差はざっと**2万倍**だ。

p2r3はMinecraftサーバーをCで書いたんじゃない。この制約に収めるためにサーバーの各部品を reinvent したんだ。ソースコードを開けてどうなってるか見ていこう。

![p2r3によるBareiron紹介動画のサムネイル](/images/bareiron/title-card.jpg)

## プロジェクトの心臓部：メモリ不要の地形生成

組み込みMCサーバーを作りたいとき、一番の問題は地形生成だ。

バニラMinecraftでは世界は**Perlinノイズ**で生成される。重ねた複数層（オクターブ）、6つのバイオームパラメータ（気温、湿度、大陸性、浸食、weirdness、深度）、毎回全部再計算しないためのキャッシュ機構いっぱいだ。

結果は壮麗だ。でも計算は重いし、生成済みチャンク保存にRAMを食う。

Bareironのアプローチは根本的に違う。ノイズを重ねる代わりに、**決定的RNG**が作る4点に対する**bilinear補間**を使う。

小さなピクセル画像を拡大したとき縁がぼやけるだろ。まさにあれだ。

```c
// worldgen.c、117-171行目（簡略化）

uint8_t interpolate (uint8_t a, uint8_t b, uint8_t c, uint8_t d, int x, int z) {
  uint16_t top    = a * (CHUNK_SIZE - x) + b * x;
  uint16_t bottom = c * (CHUNK_SIZE - x) + d * x;
  return (top * (CHUNK_SIZE - z) + bottom * z) / (CHUNK_SIZE * CHUNK_SIZE);
}

uint8_t getHeightAt (int x, int z) {
  int _x = floor(x / CHUNK_SIZE);  // チャンク座標
  int _z = floor(z / CHUNK_SIZE);
  int rx = x % CHUNK_SIZE;          // チャンク内オフセット
  int rz = z % CHUNK_SIZE;
  uint32_t hash = getChunkHash(_x, _z);
  uint8_t biome = getChunkBiome(_x, _z);
  // ハッシュとバイオームを種にした4隅間の補間
  return getHeightAtFromHash(rx, rz, _x, _z, hash, biome);
}
```

標準の双線形補間だ。4つの隅、位置による重み、出力は`uint8_t`1つ。CHUNK_SIZEは8だから整数乗算だけでできて、floatなしだ。

p2r3は動画で段階的に見せてる。まずチャンクの4隅で、それぞれRNGを種にして高さを作る。

![チャンクの4隅、それぞれ決定的RNGを種に](/images/bareiron/gen-four-corners.jpg)

次にこの4点間に補間をかけて連続面を作る。

![4隅間のbilinear補間の適用](/images/bareiron/gen-interpolate.jpg)

隣り合う全チャンクでパターンを繰り返せば、無限に広がる地形になる。

![最終結果：連続した起伏地形](/images/bareiron/gen-result.jpg)

### 決定的RNG

これ全部を可能にする鍵はシード付けだ。各チャンクに4隅があって、各隅に一意で再現可能な疑似乱数値が要る。

```c
// worldgen.c、13-22行目

uint32_t getChunkHash (short x, short z) {
  uint8_t buf[8];
  memcpy(buf, &x, 2);          // X座標16ビット
  memcpy(buf + 2, &z, 2);      // Z座標16ビット
  memcpy(buf + 4, &world_seed, 4);  // グローバルシード32ビット
  return splitmix64(*((uint64_t *)buf));  // ハッシュ
}
```

Xの16ビット、Zの16ビット、シードの32ビットを8バイトのバッファに詰めて、全部`splitmix64`に通す。結果は各位置に一意な決定的値で、ワールドシードを元にしてる。

この仕組みの強さ分かる？サーバーは地形を保存する必要がないんだ。プレイヤーが新しいゾーンに来たらその場で再計算する。毎回まったく同じ結果になる。

使ってる`splitmix64`は64ビットハッシュ用の超高速prngだ。

```c
// worldgen.c（簡略化）

static uint32_t splitmix64 (uint64_t state) {
  state += 0x9E3779B97F4A7C15ull;
  uint64_t z = state;
  z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ull;
  z = (z ^ (z >> 27)) * 0x94D049BB133111EBull;
  return (z ^ (z >> 31)) >> 32;
}
```

3つの演算だ。加算、xorとシフト、乗算、xorとシフト、乗算、xorとシフト。全部直接演算で、テーブルもループもなし。8バイトバッファ（XとZとシード）を64ビット整数として扱って、32ビットのハッシュを返す。決定的で、速くて、5行に収まる。

### なぜPerlinノイズじゃないのか

p2r3自身が動画で言ってる。「乱数の桁を足すほど地形は規則的になる。コイン投げを増やすほど50/50に近づくようにね」。実際やってるのはハッシュの何ビットを組み合わせるかだ。

```c
// worldgen.c、51-115行目

// plainsバイオーム：4因子の組み合わせから規則的な地形
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// snowy plains：2因子から起伏が激しい
h = (hash % 5) + ((hash >> 4) % 5);
```

各バイオームは抽出ビットを何個組み合わせるか選ぶ。多いほど分布は安定する。コイン投げを増やして50/50に近づくようにね。少ないほど局所変動が強くなる。

![起伏の激しい地形、因子が少なく変動が強い](/images/bareiron/terrain-irregular.jpg)

2因子だけだと、snowy plainsは丘陵っぽい、ほぼ山な地形になる。起伏の山と谷が頻繁だ。

![規則的な地形、複数因子で滑らかな面](/images/bareiron/terrain-regular.jpg)

4因子だと平原は平らで予測可能に保たれる。分布が安定する。

チャンク生成はESP32で**200ms**だ。同じハードでPerlinノイズだと重すぎて計測不能なくらいだ。

### 唸る詳細：チャンク全体を生成せずにブロックを問い合わせる

プレイしててブロックを掘る。サーバーはどのアイテムを渡すか知らなきゃいけない。素朴にはチャンク全体を生成することになる。

bilinear補間なら、座標から平面上の**任意の点**を直接問い合わせられる。チャンクの隅はプレイヤー位置から出る。補間が任意オフセットの高さをくれる。一握りの算術演算で、チャンク生成なしだ。

p2r3いわく「欲しいのは、メモリに触れず高価なノイズマップも計算せずに、指定座標にどのブロックがあるか言える魔法の関数だ」。まさに作ったものがそれだ。

高さが具体的なブロックになるのはこうだ。

```c
// worldgen.c（簡略化）

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

5つの条件だ。grassとdirtとstoneとdeepslateとbedrockの層だ。表面ブロックは`biome_top[]`経由でバイオーム依存になる。平原ならgrass、砂漠ならsandだ。単なるifカスケードで正しい層に落ちる。ループもswitchも置き換えてる。

### 洞窟、一番怠けたミラー

```c
altitude_grotte = CAVE_BASE_DEPTH - (hauteur_surface - y);
```

地下で表面高さをミラーする。deepslateの大洞窟っぽく見える。計算ゼロ、1行だ。

![表面地形のミラーで作った洞窟](/images/bareiron/cave-mirror.jpg)

![洞窟生成のための地形ミラーの図](/images/bareiron/cave-diagram.jpg)

### 鉱石、XOR版

```c
candidat = (chunk_x ^ col_x ^ col_z) % 100;
if (candidat < 5 && y < 16) -> diamond
```

座標のXORで列ごとに候補を1つ保証する。種類は高度だけで決まる。ダイヤは掘る意味が残るよう洞窟最低点の下に隠してある。

### タイルマップ式バイオーム

各バイオームはグリッド上の円形島で、種類はシードから計算したパターンで決まる。グリッド化、予測可能、タダだ。

![タイルマップ式バイオーム地図、各島が違うバイオーム](/images/bareiron/biome-tilemap.jpg)

各バイオームは独自パラメータをテーブルにエンコードして持つ。

```c
// worldgen.c（簡略化）

static const uint8_t biome_base[] = {
  [BIOME_PLAINS]  = 48,   // 基準高さ：48
  [BIOME_DESERT]  = 52,   // 少し高め
  [BIOME_FOREST]  = 50,   // 中間
  [BIOME_TAIGA]   = 46,   // 少し低め
  [BIOME_SNOWY]   = 40,   // 最も低い
};

static const uint8_t biome_top[] = {
  [BIOME_PLAINS]  = B_grass,
  [BIOME_DESERT]  = B_sand,
  [BIOME_FOREST]  = B_grass,
  [BIOME_TAIGA]   = B_grass,
  [BIOME_SNOWY]   = B_snow_block,
};

static const uint8_t biome_factors[] = {
  [BIOME_PLAINS]  = 4,   // 4抽出からとても規則的
  [BIOME_DESERT]  = 3,   // 3抽出から中程度
  [BIOME_FOREST]  = 4,   // 4抽出から規則的で丘陵
  [BIOME_TAIGA]   = 3,   // 3抽出から中程度
  [BIOME_SNOWY]   = 2,   // 2抽出からとても起伏が激しい
};
```

**平原**：高さ48、4因子からとても平らな地形、草だ。

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// 結果：最大プラスマイナス4ブロックの変動
```

**砂漠**：高さ52、3因子、表面ブロックは砂。海面下には絶対ならない。

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3);
// 結果：最大プラスマイナス6ブロックの変動、SEA_LEVEL+1にクランプ
```

**森**：高さ50、平原と同じ4因子だが基準が高いから木の生えた丘になる。

**タイガ**：高さ46、3因子から中程度の変動、寒い地形だ。

**雪原**：高さ40、2因子だけだから一番起伏が激しい。

```c
h = (hash % 5) + ((hash >> 4) % 5);
// 結果：最大プラスマイナス14ブロックの変動
```

各バイオームは**5エントリのテーブル3つ**にエンコードされてる。基準高さ、表面ブロック、因子数だ。`getHeightAtFromHash`がバイオームを受け取ってこのテーブルを引いて地形を調整する。15バイトのデータでバニラMinecraftのバイオーム機構全部を置き換えてる。

バイオーム検出器はシードを使って各チャンクに対応するバイオームを決める。

```c
// worldgen.c（簡略化）

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

16エントリのパターンと、チャンク座標を種にしたインデックスだ。繰り返すグリッドになるけど見た目は一貫してる。4行のコードでバニラのバイオームパラメータ機構全部を置き換えてる。

### getHeightAtFromHash：地形の組み立て屋

生成の中心にある関数で、バイオームを種にした4隅を組み合わせる。

```c
// worldgen.c（簡略化）

static uint8_t getHeightAtFromHash (int rx, int rz, short cx, short cz,
                                    uint32_t h, uint8_t biome) {
  // ハッシュから4隅を抽出、隅ごとに違うシフト
  uint8_t h1 = biome_base[biome] + (h & 0x0F);
  uint8_t h2 = biome_base[biome] + ((h >> 4) & 0x0F);
  uint8_t h3 = biome_base[biome] + ((h >> 8) & 0x0F);
  uint8_t h4 = biome_base[biome] + ((h >> 12) & 0x0F);

  // バイオーム制約：砂漠は水面下禁止
  if (biome == BIOME_DESERT) {
    h1 = max(h1, SEA_LEVEL + 1);
    h2 = max(h2, SEA_LEVEL + 1);
    h3 = max(h3, SEA_LEVEL + 1);
    h4 = max(h4, SEA_LEVEL + 1);
  }

  // 4隅からの補間
  return interpolate(h1, h2, h3, h4, rx, rz);
}
```

各バイオームは`biome_base`で基準高さをずらして、4隅はハッシュからずらし違いで抽出する。砂漠は海面以上を強制する。追加のバイオーム計算なしで水を避ける1行制約だ。

### 木とサボテン：確率的配置

表面生成は同じチャンクハッシュでどこに植えるか決める。

```c
// worldgen.c（簡略化）

static void genFoliage (uint8_t *chunk_data, short cx, short cz,
                        uint32_t hash, uint8_t biome) {
  if (biome == BIOME_DESERT) {
    // サボテン：チャンクごとに1候補、ハッシュが位置を決める
    int tx = (hash >> 8) & 7;
    int tz = (hash >> 12) & 7;
    int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
    if (chunk_data[ty * 64 + tz * 8 + tx] == B_sand)
      placeCactus(chunk_data, tx, ty + 1, tz);
  } else {
    // 木：ハッシュが本数と位置を決める
    int tree_count = (hash & 3);  // チャンクあたり0-3本
    for (int i = 0; i < tree_count; i ++) {
      int tx = ((hash >> (4 + i * 4)) & 7);
      int tz = ((hash >> (6 + i * 4)) & 7);
      int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
      placeTree(chunk_data, tx, ty + 1, tz);
    }
  }
}
```

緑バイオームはチャンクあたり木0から3本、砂漠はサボテン最大1本。チャンクハッシュが唯一のエントロピー源だ。チャンク内位置に`& 7`、本数に`& 3`。全部決定的で、何も保存しない。

### generateChunk：全部組み立てる

全部まとめて8かける8かける256ブロックの完全チャンクを作る関数だ。

```c
// worldgen.c（簡略化）

void generateChunk (uint8_t *chunk, short cx, short cz) {
  uint32_t hash = getChunkHash(cx, cz);
  uint8_t biome = getChunkBiome(cx, cz);

  // チャンクの各列（8かける8で64）
  for (int x = 0; x < 8; x ++) {
    for (int z = 0; z < 8; z ++) {
      // 世界の絶対座標
      int wx = cx * 8 + x;
      int wz = cz * 8 + z;

      // 列の高さ
      uint8_t height = getHeightAt(wx, wz);

      // 下から上へ列を埋める
      for (int y = 0; y < height; y ++) {
        uint8_t block = getTerrainBlock(wx, y, wz);
        chunk[y * 64 + z * 8 + x] = block;
      }
    }
  }

  // 表面要素（木、サボテン）を追加
  genFoliage(chunk, cx, cz, hash, biome);
}
```

以上だ。3重ループで、各列の高さを見て、ブロックを埋めて、次へ進む。出力は完全チャンクを表す`uint8_t[16384]`（8かける8かける256）だ。チャンクは生成してクライアントに直接送る。キャッシュも遅延読み込みも圧縮もなしだ。

## ストレージ：どこまでも静的配列

Bareironのメモリアーキテクチャは組み込みCの真骨頂だ。固定サイズのグローバル配列だけで、mallocもハッシュマップもリンクリストもなしだ。

### ブロック変更

```c
// globals.h、191-196行目

typedef struct {
  short x;      // 2バイト、水平32,000ブロックに制限
  short z;      // 2バイト
  uint8_t y;    // 1バイト、垂直256ブロックに制限
  uint8_t block; // 1バイト、256種のブロックに制限
} BlockChange;
```

2万エントリで、約**25,000変更**だ。チャンク1個半を丸ごと掘り返す相当だ。`block`フィールドが`0xFF`なら空きエントリだ。検索は線形スキャンだ。

![ブロック配列のメモリレイアウト、1エントリ6バイト](/images/bareiron/memory-layout.jpg)

```c
// procedures.c

uint8_t getBlockChange (short x, uint8_t y, short z) {
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block == 0xFF) continue;
    if (block_changes[i].x == x && block_changes[i].y == y && block_changes[i].z == z)
      return block_changes[i].block;
    #ifdef ALLOW_CHESTS
      if (block_changes[i].block == B_chest) i += 14;  // チェストデータをスキップ
    #endif
  }
  return 0xFF;
}
```

追加も検索と同じくらい直接的だ。

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

カウンタとインデックスと書き込み1回だ。テーブルは積むだけだ。ソートも圧縮もメモリ管理もなし。テーブルがいっぱいになったら新しい変更は無視される。地形は生成状態に戻る。

256ブロック制限についての作者コメントは「少し緑青を帯びた磨かれた銅の階段を実装する予定は当分ない」だ。

### モブ：パイプ1本あたり8バイト

```c
// globals.h、240-251行目（パディング排除のpragma pack(push, 1)）

typedef struct {
  uint8_t type;   // 25=ニワトリ、28=ウシ、95=ブタ、106=ヒツジ、145=ゾンビ
  short x;
  uint8_t y;      // health=0ならYは削除前タイマーになる
  short z;
  uint8_t data;   // ビット0-4:体力、ビット5:ヒツジの毛刈り、ビット6-7:パニックタイマー
} MobData;
```

8バイトだ。最大16体だ。アライメントもパディングも捨てる。`data`バイトは自家製ビットフィールドで、体力5ビット、毛刈り1ビット、パニックタイマー2ビットだ。モブが死んだらYフィールドは削除前タイマーに転用される。ビット単位のメモリ再利用だ。

### プレイヤー：きっちり詰める

プレイヤーデータも`#pragma pack(push, 1)`だ。座標は`short`と`uint8_t`、インベントリは`uint16_t`と`uint8_t`の固定配列、`flags`フィールドは攻撃クールダウン、スポーン状態、スニーク、スプリント、食事、load、移動クールダウン、クラフトロックをエンコードする。全部個別ビットだ。

## メインループ：while(true)とノンブロッキング

サーバー全体はループ1つ、スレッド1つ、イベントライブラリゼロで回る。

```c
// main.c、594-720行目

while (true) {
  task_yield();  // ESP32でウォッチドッグを休ませる

  // 新規接続を受け付ける（ノンブロッキング）
  for (int i = 0; i < MAX_PLAYERS; i ++) {
    if (clients[i] != -1) continue;
    clients[i] = accept(server_fd, ...);
    if (clients[i] != -1) client_count ++;
    break;
  }

  // 時間が来たらサーバーtick
  if (get_program_time() - last_tick_time > TIME_BETWEEN_TICKS) {
    handleServerTick(time_since_last_tick);
    last_tick_time = get_program_time();
  }

  // ラウンドロビン：1イテレーションで1クライアント1パケット
  client_index = (client_index + 1) % MAX_PLAYERS;
  if (clients[client_index] == -1) continue;

  // パケットヘッダを読む：lengthとID
  recv(client_fd, &recv_buffer, 2, MSG_PEEK);
  int length = readVarInt(client_fd);
  int packet_id = readVarInt(client_fd);
  handlePacket(client_fd, length - sizeVarInt(packet_id), packet_id, state);
}
```

ループ1周で処理するクライアントは1つだけで、読むパケットも1つだけだ。ループ頭の`task_yield()`でFreeRTOSのidleタスクを呼吸させる。これがないとウォッチドッグタイマーがチップをリセットする。

パケット振り分けは**400行**の巨大switchだ。

```c
// main.c、68-497行目

void handlePacket (int client_fd, int length, int packet_id, int state) {
  switch (packet_id) {
    case 0x00:  // 状態に応じたHandshakeやStatusやLogin
    case 0x01:  // Status ping
    case 0x02:  // Plugin message
    case 0x03:  // Loginやconfiguration acknowledgment
    case 0x08:  // Chat
    case 0x0B:  // Client status（リスポーン）
    case 0x11:  // Click container（チェストを扱う）
    case 0x19:  // Interact entity
    case 0x1D..0x20:  // Movementパケット（一番大きいケース）
    case 0x28:  // Player action（掘るや置く）
    // ... 40超のケース
  }
}
```

switchは静的ジャンプテーブルにコンパイルされる。動的ジャンプテーブルやvtableやmapの代わりだ。組み込みには最適だ。

`0x1D-0x20`ケースが一番大きくて、位置更新、落下ダメージ、チャンク境界横断、モブスポーン、チャンク生成、それに空腹まで扱う。全部1つの大きなfall-throughだ。

![Bareironサーバーのコード、6800行のC](/images/bareiron/code-shot.jpg)

## サーバーtickとモブAI

`handleServerTick`関数は50msごと（20TPS）に呼ばれる。メインループがプレイヤーを扱う間、世界を動かす。

```c
// main.c（簡略化）

void handleServerTick (uint32_t delta) {
  // 各モブを更新
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type == 0 || mobs[i].data == 0) continue;  // 死亡か空き

    MobData *mob = &mobs[i];
    int px, pz;
    getNearestPlayer(mob->x, mob->z, &px, &pz);

    if (mob->type == MOB_ZOMBIE) {
      // 敵対：最寄りプレイヤーに向かって歩く
      if (px < mob->x) mob->x --;
      else if (px > mob->x) mob->x ++;
      if (pz < mob->z) mob->z --;
      else if (pz > mob->z) mob->z ++;
      // 2ブロック接触ダメージ
      if (abs(px - mob->x) <= 2 && abs(pz - mob->z) <= 2)
        damagePlayer(getNearestPlayerId(mob->x, mob->z), 3);
    } else {
      // 中立：8方向ランダム
      uint8_t dir = getMobDir(mob);
      mob->x += dir_lookup[dir][0];
      mob->z += dir_lookup[dir][1];
      // 約40tickごとに方向転換
      if (mob->data >> 6 < 1) setMobDir(mob, rand() & 7);
      mob->data = (mob->data & 0x3F) | ((mob->data - 0x40) & 0xC0);
    }

    // モブ周辺チャンクを起こす
    setChunkGenerated(mob->x / 8, mob->z / 8);
  }
}
```

敵対モブのAIは座標比較だ。文字通り`if (px < x) x--`だ。ゾンビはパスファインディングもA*も障害物回避も無視する。XとZを独立にプレイヤーへ調整する。壁があっても突っ込む。

接触ダメージは3ハート毎秒だ。パスファインディングなしだとゾンビは簡単にkiteできるから、p2r3はわざと高めにした。

防具式は戦闘アップデート前のもので、一番単純なやつだ。

```c
// main.c（簡略化）

static uint8_t applyArmor (uint8_t damage, uint16_t armor_value) {
  // 1.9前の式：線形軽減
  // 防具1ごとに4%軽減、最大80%
  uint8_t reduction = (armor_value * 4);
  if (reduction > 80) reduction = 80;
  return damage * (100 - reduction) / 100;
}
```

フルダイヤは80%軽減だ。ゾンビの3ハート攻撃は0.6ハートになる。p2r3はこの古い式を選んだ。2演算で計算できるからだ。しきい値も曲線もなく、ただの線形パーセントだ。

中立モブは8方向のルックアップテーブルで、約40tickごとに進路変更する。`data`フィールドは進行方向を上位2ビットに、方向転換タイマーを残り6ビットにエンコードする。

![Bareironのモブ、ゾンビとブタとヒツジ](/images/bareiron/mobs.jpg)

### モブのリスポーン

モブはランダムtickで湧かない。サーバーtickが新しいチャンク境界に出会ったときに現れる。

```c
if (player crossed chunk boundary) {
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type != 0) continue;
    spawnMob(&mobs[i], new_chunk_coords, getChunkHash(cx, cz));
    break;
  }
}
```

地形と同じRNGで、同じチャンクシードだ。空きモブ枠があればスポーンは決定的だ。

## クラフト：行列なし、ifとelseだけ

```c
// crafting.c、9-347行目（簡略化）

void getCraftingOutput (PlayerData *player, uint8_t *count, uint16_t *item) {
  // 0x80フラグが立ってたらクラフトバッファはチェスト用
  if (player->flags & 0x80) { *count = 0; *item = 0; return; }

  // スロット数え、最初のアイテム特定、同一性確認
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
    case 1:  /* 板材、インゴットなど */
    case 2:  /* 棒、ハサミ、松明 */
    case 3:  /* シャベル、剣、ハーフブロック */
    case 4:  /* 作業台、ブーツ */
    case 5:  /* ツルハシ、斧、ヘルメット */
    case 7:  /* レギンス、コンポスター */
    case 8:  /* かまど、チェスト、チェストプレート */
    case 9:  /* 完全ブロック（鉄、金など） */
  }
}
```

最初のチェック：`0x80`フラグが立ってたら、クラフトバッファはチェストポインタに転用中だ。クラフトは施錠される。

次に埋まったスロットを数えて、最初のアイテムをメモして、同一性を確認する。これだけでかまどは4チェックで当てられる。

```c
if (count == 8 && first == cobblestone && all_identical && center_empty)
    return furnace;
```

複雑な形は最初のアイテムのインデックスを使って相対位置をチェックする。レシピは同じマッチ関数を共有する。素材が結果を決める。

![Bareironのクラフトとチェスト画面](/images/bareiron/crafting.jpg)

## チェスト：本物のハック

みんなが話すメモリハックを本物のコードで見よう。

```c
// procedures.c、1262-1293行目

if (target == B_chest) {
  // ブロックテーブルでチェストエントリを探す
  uint8_t *storage_ptr = NULL;
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block != B_chest) continue;
    if (block_changes[i].x != x || block_changes[i].y != y || block_changes[i].z != z)
      continue;
    storage_ptr = (uint8_t *)(&block_changes[i + 1]);  // チェストブロックの次を指す
    break;
  }
  if (storage_ptr == NULL) return;

  // ひどいメモリハック！！
  // ポインタをプレイヤーのクラフトアイテム配列にコピー
  memcpy(player->craft_items, &storage_ptr, sizeof(storage_ptr));
  player->flags |= 0x80;  // クラフトを施錠

  // チェスト画面をクライアントに送る
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

コード内のコメントはこうだ。`// Terrible memory hack!!1!`

まさにそれだ。`block_changes[]`の次エントリのメモリアドレスを取って、`player->craft_items`（`uint16_t[9]`で18バイト。32ビットポインタを格納できる）にコピーして、その間クラフトされないようフラグを立てる。

チェストインベントリのクリックごとにこうだ。

```c
// packets.c、620-638行目

uint8_t *storage_ptr;
memcpy(&storage_ptr, player->craft_items, sizeof(storage_ptr));
// storage_ptrはチェストデータを指す
uint16_t *p_item = (uint16_t *)(storage_ptr + (slot - 41) * 3);
uint8_t *p_count = storage_ptr + (slot - 41) * 3 + 2;
```

クラフトバッファからポインタを取り戻して、オフセットでスロットにアクセスする。チェストデータは1スロット3バイト（IDに2、個数に1）でブロックテーブル内にくっつけて格納される。

![ブロックテーブルに格納されたチェストデータ、メモリハック](/images/bareiron/chest-hack.jpg)

## 空腹：5行の天才

```c
// main.c、293-305行目

// プレイヤーは動くと毎秒約20移動パケットを送る
// 止まってるとずっと少ない。これと
// 活動を結び付けてタダで空腹を再現する
if (player->saturation == 0) {
  if (player->hunger > 0) player->hunger--;
  player->saturation = 200;
  sc_setHealth(client_fd, player->health, player->hunger, player->saturation);
} else if (player->flags & 0x08) {  // スプリント中
  player->saturation -= 1;
}
}
```

文字通りこれだけだ。5行だ。各移動パケットが満腹度を減らす。満腹度がゼロになったら空腹が減って満腹度リセットだ。スプリント（フラグ`0x08`）は消耗2倍だ。

タイマーゼロ、確保メモリゼロ、専用計算ゼロ。既存パケットを減らすカウンタだ。

### 落下ダメージ

プロジェクト最単純のダメージ機構だ。

```c
// プレイヤーが地面を離れたらYを保存
// 地面に戻ったら引き算
degats = dernier_y_au_sol - y_actuel;
```

引き算1つだ。

## 掘ると置く

ブロックをクリックすると`0x28`パケット（Player Action）がswitchに着弾する。ハンドラはその位置のブロック種を特定して、取り除いて、アイテムをインベントリに入れなきゃいけない。

```c
// main.c、case 0x28（簡略化）

void handlePlayerAction (int client_fd, uint8_t action, int x, uint8_t y, int z) {
  switch (action) {
    case START_DESTROY_BLOCK: {
      // クリック位置のブロック種を特定
      uint8_t block = getBlockAt(x, y, z);

      if (block == B_chest) {
        openChest(client_fd, x, y, z);
        break;
      }

      // block_changesに追加
      addBlockChange(x, z, y, 0);  // 0 = 空気

      // アイテムをプレイヤーに渡す（クライアントを信頼）
      addItemToPlayer(client_fd, block_to_item(block), 1);

      // クライアントに更新を送る
      sc_blockChange(client_fd, x, y, z, 0);
      sc_ackBlockChange(client_fd, x, y, z, 0);
      break;
    }
    case PLACE_BLOCK: {
      // 手持ちからブロック種を読む
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

`getBlockAt`は地形生成とプレイヤー変更を組み合わせる。

```c
uint8_t getBlockAt (int x, uint8_t y, int z) {
  // まずプレイヤー変更を確認
  uint8_t change = getBlockChange(x, y, z);
  if (change != 0xFF) return change;

  // なければ生成地形から読む
  return getTerrainBlock(x, y, z);
}
```

変更優先、なければ地形だ。議論ゼロ、キャッシュゼロ、オーバーヘッドゼロ。中の`getTerrainBlock`は`getHeightAt`とstoneやdirtやgrassやcoalの層だ。

### 即時かまど

一番笑えるのは、かまどがエンティティとして存在しないことだ。「焼く」枠に丸石を、「燃料」に石炭を置いたら、結果は即出る。タイマーもチャンクtickもなしだ。正しいアイテムを置いたら空くインベントリ枠でしかない。

![即時かまど、材料を置けば結果は即時](/images/bareiron/furnace.jpg)

## ESP32ループ：4KBスタックのMCサーバー

```c
// main.c、732-779行目

#ifdef ESP_PLATFORM

void bareiron_main (void *pvParameters) {
  main();
  vTaskDelete(NULL);
}

static void wifi_event_handler (...) {
  if (/* 接続済み */) {
    xTaskCreate(bareiron_main, "bareiron", 4096, NULL, 5, NULL);
  }
}

void app_main () {
  esp_timer_early_init();
  wifi_init();
  // 残りはイベントハンドラが管理
}
#endif
```

サーバー全体は**4096バイトのスタック**を持つFreeRTOSタスクで回る。以上だ。メインスレッドはWiFi初期化して接続待ちするだけだ。接続されたら標準`main()`を呼ぶ`bareiron_main`をspawnする。

ESP32固有コードは全部`#ifdef ESP_PLATFORM`で守られてる。PCでは全部標準POSIXコードとしてコンパイルされる。

## 犠牲になったもの

全部収めるために、バニラの機能で存在しないものがある。

- **ネットワーク圧縮ゼロ**。zlibは高すぎる。サーバーはチャンクを速く作るけど、送る方がボトルネックだ。
- **ランダムtickゼロ**。木は骨粉かそのまま育つ。モブはチャンク境界で湧く。
- **アイテムエンティティゼロ**。掘ったブロックは直接インベントリ行きだ。アニメは純粋に見た目だけだ。
- **インベントリ検証なし**。クライアントを信頼する。ダイヤ64個？OKだ。1秒でチャンク1個掘る？OKだ。信頼できる仲間で使う用だ。
- **サーバー側光源ゼロ**。松明は全部の後に送られて、クライアントが計算する。
- **漸進流体ゼロ**。即最終状態だ。

## 最終結果

Ryzen 5 3600：チャンクあたり約0.5ms。
1ドルのESP32-C3：チャンクあたり約200ms。遊べる。

![チャンク生成ベンチマーク、Ryzen対ESP32](/images/bareiron/performance.jpg)

3人以上プレイヤー：重くなる。作者いわくピーク時の2b2t並みだ。

![同じBareironサーバーに接続した複数プレイヤー](/images/bareiron/multiplayer.jpg)

## 哲学

p2r3いわく「0.5ワット消費の1ドル小チップがMinecraftみたいな高度なものを動かせるって発想が好きなんだ。科学は『なぜ』じゃなく『なぜやらないのか』だよ」。

各行がトレードオフだ。
- Perlinノイズから補間へ：見た目は劣る、200倍速い、メモリゼロ
- クラフト行列からハードコード照合へ：汚いコード、ゼロバイト
- zlibから無しへ：回線悪ければ死ぬ、でも遊べる
- 検証から信頼へ：安全ゼロ、計算ゼロ

欠けた各機能が、ハードの制限内で別の機能の存在を許してる。

**覚えるべき3点：**

1. **補間とRNG**。種付き4点、無限地形、保存ゼロ、チャンク再生成なしの問い合わせ、生成200ms。これが他全部を可能にした天才の一手だ。
2. **各機能にコストがある**。圧縮もランダムtickも検証もないのは自覚的な選択だ。520KBに収めるのを許してる。
3. **汚いハックが一番賢い**。memcpy経由でブロックテーブルに入れるチェスト、移動パケットで回す空腹、即時かまど。きれいな解法は高すぎたんだ。

興味が出たら、全部[GPLv3でGitHubにある](https://github.com/p2r3/bareiron/)。かなり汚いCだけど、ソース読んでこんなに楽しんだのは久しぶりだ。
