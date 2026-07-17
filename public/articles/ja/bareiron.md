---
title: Bareiron -- 1ドルのマイコンで動くMinecraftサーバー
description: C言語6800行、mallocゼロ、パーリンノイズをバイリニア補間に置き換え、タイルマップ式バイオーム、すべて1ドルのチップで
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
author_sig: "xDbYj+1qQ4cBrHSBnp40+oZ+q32tSpKpqx0Zko8L23U2HiLDfmpijd7fLWdtp6d1ktmljNcLkdA7vPTbTS8dGw=="
---

## はじめに

1ドルのマイコンでMinecraftサーバーが動かせるかどうか、考えたことある？

俺はある。そして答えはイエスだ。文字通り。

[Bareiron](https://github.com/p2r3/bareiron/)っていうプロジェクトがあって、p2r3作。ここ数年でMinecraft界で見た中で、おそらく最も魅力的なプロジェクトのひとつだ。**300キロバイト**のバイナリ、**C言語6800行**、外部依存ゼロ、mallocなし、スレッディングなし、それが**1ドルのESP32**で動く。

![ESP32-C3, le microcontrôleur qui fait tourner le serveur](/images/bareiron/esp32-board.jpg)

無限地形生成。バイオーム。洞窟。クラフト。採掘。モブ。空腹。チェスト。サバイバルサーバーに期待するすべての機能。

消費電力**0.5ワット**、クロック**160 MHz**のチップで。

イメージしてほしい：バニラのMinecraftサーバーは数ギガのRAMが必要だ。ESP32-C3は**520 KBのSRAM**（ブート後に使えるのは400）。20年前のプロセッサですでにギガヘルツで動いてた -- こいつは160 MHzが上限。純粋な演算性能の差は約**20,000**倍。

p2r3はCでMinecraftサーバーを書いたんじゃない。サーバーのすべての構成要素を、この制約に収まるように再発明したんだ。ソースコードを開いて、どうやってやったのか見てみよう。

![Miniature de la vidéo de présentation de Bareiron par p2r3](/images/bareiron/title-card.jpg)

## プロジェクトの核心：メモリ無しの地形生成

組み込みMCサーバーを作るときの最大の問題は地形生成だ。

バニラMinecraftでは、ワールドは**パーリンノイズ**で生成される：複数の重ね合わせレイヤー（オクターブ）、6つのバイオームパラメータ（温度、湿度、大陸性、侵食、変則性、深度）、そして毎回再計算しなくていいようにキャッシュシステム全体。

結果は美しい。でも計算コストが高いし、生成されたチャンクを保存するのにRAMを食う。

Bareironのアプローチは根本的に違う。ノイズを重ねる代わりに、**決定論的RNG**で生成した4点を使った**バイリニア補間**を使う。

小さいピクセル画像を拡大したときに境界がぼやけるあの感じ、分かる？まさにあれだ。

```c
// worldgen.c, lignes 117-171 (simplifié)

uint8_t interpolate (uint8_t a, uint8_t b, uint8_t c, uint8_t d, int x, int z) {
  uint16_t top    = a * (CHUNK_SIZE - x) + b * x;
  uint16_t bottom = c * (CHUNK_SIZE - x) + d * x;
  return (top * (CHUNK_SIZE - z) + bottom * z) / (CHUNK_SIZE * CHUNK_SIZE);
}

uint8_t getHeightAt (int x, int z) {
  int _x = floor(x / CHUNK_SIZE);  // チャンク座標
  int _z = floor(z / CHUNK_SIZE);
  int rx = x % CHUNK_SIZE;          // チャンク内のオフセット
  int rz = z % CHUNK_SIZE;
  uint32_t hash = getChunkHash(_x, _z);
  uint8_t biome = getChunkBiome(_x, _z);
  // hash + biomeでシードされた4隅の補間
  return getHeightAtFromHash(rx, rz, _x, _z, hash, biome);
}
```

標準的なバイリニア補間：4つの隅、位置に応じた重み、出力は単一の`uint8_t`。CHUNK_SIZEは8なので、整数の掛け算で済み、floatは使わない。

p2r3が動画で段階的に見せてる：まずチャンクの4隅、それぞれRNGでシードされた高さを持つ。

![Les 4 coins du chunk, chacun seedé par le RNG déterministe](/images/bareiron/gen-four-corners.jpg)

次に、この4点間の補間で連続したサーフェスができる。

![Application de la bilinear interpolation entre les 4 coins](/images/bareiron/gen-interpolate.jpg)

そしてこのパターンを隣接する全チャンクに繰り返せば、無限に広がる地形が得られる。

![Résultat final : terrain irrégulier continu](/images/bareiron/gen-result.jpg)

### 決定論的RNG

これを可能にする鍵はシーディングだ。各チャンクには4つの隅があり、各隅にはユニークで再現可能な擬似乱数値が必要だ。

```c
// worldgen.c, lignes 13-22

uint32_t getChunkHash (short x, short z) {
  uint8_t buf[8];
  memcpy(buf, &x, 2);          // X座標の16ビット
  memcpy(buf + 2, &z, 2);      // Z座標の16ビット
  memcpy(buf + 4, &world_seed, 4);  // グローバルシードの32ビット
  return splitmix64(*((uint64_t *)buf));  // ハッシュ
}
```

Xの16ビット、Zの16ビット、シードの32ビットを8バイトのバッファに詰め込んで、全部を`splitmix64`に通す。結果：ワールドシードに基づく、各位置に対して一意で決定論的な値。

この凄さが分かるか？サーバーは地形を保存する必要がない。プレイヤーが新しいエリアに来たときにその場で再計算するだけで、毎回まったく同じ結果になるんだ。

使われている`splitmix64`は64ビットハッシュ用に設計された超高速PRNGだ：

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

演算3つ：加算、xor/shift、乗算、xor/shift、乗算、xor/shift。ルックアップテーブルなし、ループなし。8バイトのバッファ（X + Z + シード）を64ビット整数として扱い、32ビットのハッシュを返す。決定論的で高速、たった5行。

### なぜパーリンノイズじゃないのか

p2r3自身が動画で言ってる：「乱数の桁を増やすほど、地形は規則的になる。コイン投げの回数が増えるほど50/50に近づくのと同じだ」。実際には、組み合わせるハッシュのビット数のことだ：

```c
// worldgen.c, lignes 51-115

// 平原バイオームの場合：4つの要素を組み合わせ → 規則的な地形
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// 氷雪平原の場合：2要素 → より起伏が激しい
h = (hash % 5) + ((hash >> 4) % 5);
```

各バイオームが、いくつのビット抽出を組み合わせるかを選ぶ。多ければ多いほど分布が安定する -- コイン投げの回数が増えて50/50に近づくのと同じ。少なければ少ないほど、局所的な変動が大きくなる。

![Terrain irrégulier -- peu de facteurs, variations fortes](/images/bareiron/terrain-irregular.jpg)

たった2要素で、氷雪平原は丘陵地帯、ほとんど山岳のような地形になる。ピークと窪みが頻繁に現れる。

![Terrain régulier -- facteurs multiples, surface lisse](/images/bareiron/terrain-regular.jpg)

4要素では、平原は平坦で予測可能なまま。分布が安定する。

チャンク1つの生成にかかる時間はESP32で**200 ms** -- 同じハードウェアでパーリンノイズだとコストが高すぎて計測すらできない。

### ヤバい詳細：チャンク全体を生成せずにブロックを参照

プレイしてて、ブロックを掘る。サーバーはどのアイテムをドロップするか知る必要がある。単純に考えれば、そのためにチャンク全体を生成する必要がある。

バイリニア補間を使えば、座標から直接**任意の点**を問い合わ合わせられる。チャンクの隅はプレイヤーの位置から取得でき、補間で任意のオフセットにおける高さが得られる。数回の算術演算だけで、チャンク生成は不要。

p2r3曰く：「俺が欲しかったのは、メモリにアクセスしたり高コストなノイズマップを計算したりせずに、指定された座標のブロックを教えてくれる魔法の関数だ」。まさにそれを実現した。

高さが具体的なブロックになる仕組みはこうだ：

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

5つの条件。grass/dirt/stone/deepslate/bedrockのレイヤー。表面ブロックは`biome_top[]`でバイオームに依存 -- 平原はgrass、砂漠はsand。ループなし、switchなし、該当するレイヤーに落ちるifのカスケード。

### 洞窟、最も怠惰なミラーリング

```c
altitude_grotte = CAVE_BASE_DEPTH - (hauteur_surface - y);
```

地表の高さを地下でミラーリングする。deepslateの大きな空洞みたいになる。計算量ゼロ、たった1行。

![Caves générées par mirror du terrain de surface](/images/bareiron/cave-mirror.jpg)

![Schéma du mirror de terrain pour générer les grottes](/images/bareiron/cave-diagram.jpg)

### 鉱石、XOR版

```c
candidat = (chunk_x ^ col_x ^ col_z) % 100;
if (candidat < 5 && y < 16) -> diamond
```

座標のXORで列ごとに候補が一意に決まる。タイプは高度だけで決まる。ダイアモンドは洞窟の最深部の下に隠れてて、掘りごたえを残してる。

### タイルマップ式バイオーム

各バイオームはグリッド内の円形の島で、タイプはシードから計算されたパターンで決まる。グリッド化されてて、予測可能で、タダ。

![Carte des biomes en tile map -- chaque île est un biome différent](/images/bareiron/biome-tilemap.jpg)

各バイオームには独自のパラメータセットがあり、配列にエンコードされてる：

```c
// worldgen.c (simplifié)

static const uint8_t biome_base[] = {
  [BIOME_PLAINS]  = 48,   // 基本高さ：48
  [BIOME_DESERT]  = 52,   // やや高め
  [BIOME_FOREST]  = 50,   // 中間
  [BIOME_TAIGA]   = 46,   // やや低め
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
  [BIOME_PLAINS]  = 4,   // 4抽出 → 非常に規則的
  [BIOME_DESERT]  = 3,   // 3抽出 → 中程度
  [BIOME_FOREST]  = 4,   // 4抽出 → 規則的、丘陵あり
  [BIOME_TAIGA]   = 3,   // 3抽出 → 中程度
  [BIOME_SNOWY]   = 2,   // 2抽出 → 非常に起伏大
};
```

**平原**：高さ48、4要素 → 非常に平坦な地形、草。

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// 結果：最大±4ブロックの変動
```

**砂漠**：高さ52、3要素、表面ブロック = 砂。海面より下にならない。

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3);
// 結果：最大±6ブロックの変動、SEA_LEVEL+1でクランプ
```

**森林**：高さ50、4要素（平原と同じだがベースが高い）→ 樹木の生い茂った丘陵。

**タイガ**：高さ46、3要素 → 中程度の変動、寒冷地形。

**氷雪平原**：高さ40、わずか2要素 → 最も起伏が激しい。

```c
h = (hash % 5) + ((hash >> 4) % 5);
// 結果：最大±14ブロックの変動
```

各バイオームは**5エントリ×3配列**でエンコードされてる：基本高さ、表面ブロック、要素数。`getHeightAtFromHash`がバイオームを受け取ると、これらの配列を参照して地形を調整する。たった15バイトのデータでMinecraftのバイオームシステム全体を置き換えてる。

バイオーム検出器はシードを使って各チャンクにどのバイオームが対応するかを決める：

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

16エントリのパターン、チャンク座標でシードされたインデックス。繰り返しのグリッドになるが視覚的に一貫性がある。たった4行のコードでバニラMinecraftのバイオームパラメータシステム全体を置き換えてる。

### getHeightAtFromHash : 地形の組み立て屋

生成の中核となる関数は、バイオームでシードされた4つの隅を組み合わせる：

```c
// worldgen.c (simplifié)

static uint8_t getHeightAtFromHash (int rx, int rz, short cx, short cz,
                                    uint32_t h, uint8_t biome) {
  // ハッシュから抽出した4隅、隅ごとに異なるシード
  uint8_t h1 = biome_base[biome] + (h & 0x0F);
  uint8_t h2 = biome_base[biome] + ((h >> 4) & 0x0F);
  uint8_t h3 = biome_base[biome] + ((h >> 8) & 0x0F);
  uint8_t h4 = biome_base[biome] + ((h >> 12) & 0x0F);

  // バイオーム制約：砂漠は水面下にならない
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

各バイオームには基準高さをシフトする`biome_base`があり、4つの隅は異なるシフト量でハッシュから抽出される。砂漠は海面以上の最小値を強制 -- 追加のバイオーム計算なしで水を回避する1行の制約。

### 木とサボテン：確率的配置

地表生成は同じチャンクハッシュを使ってどこに何を置くかを決める：

```c
// worldgen.c (simplifié)

static void genFoliage (uint8_t *chunk_data, short cx, short cz,
                        uint32_t hash, uint8_t biome) {
  if (biome == BIOME_DESERT) {
    // サボテン：チャンクあたり1候補、ハッシュが位置を決める
    int tx = (hash >> 8) & 7;
    int tz = (hash >> 12) & 7;
    int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
    if (chunk_data[ty * 64 + tz * 8 + tx] == B_sand)
      placeCactus(chunk_data, tx, ty + 1, tz);
  } else {
    // 木：ハッシュが配置するかどうかと場所を決める
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

緑のバイオームではチャンクあたり0-3本の木、砂漠では最大1つのサボテン。チャンクハッシュが唯一のエントロピー源 -- チャンク内の位置は`& 7`、カウンターは`& 3`。すべて決定論的で、何も保存されない。

### generateChunk : 全部まとめる

8×8×256ブロックの完全なチャンクを生成する関数：

```c
// worldgen.c (simplifié)

void generateChunk (uint8_t *chunk, short cx, short cz) {
  uint32_t hash = getChunkHash(cx, cz);
  uint8_t biome = getChunkBiome(cx, cz);

  // チャンクの各列に対して（8×8 = 64）
  for (int x = 0; x < 8; x ++) {
    for (int z = 0; z < 8; z ++) {
      // 絶対ワールド座標
      int wx = cx * 8 + x;
      int wz = cz * 8 + z;

      // 列の高さ
      uint8_t height = getHeightAt(wx, wz);

      // 下から上に列を埋める
      for (int y = 0; y < height; y ++) {
        uint8_t block = getTerrainBlock(wx, y, wz);
        chunk[y * 64 + z * 8 + x] = block;
      }
    }
  }

  // 地表要素の追加（木、サボテン）
  genFoliage(chunk, cx, cz, hash, biome);
}
```

これだけ。3重ループ：各列について、高さを求め、ブロックを埋め、次へ。出力は`uint8_t[16384]`（8×8×256）で完全なチャンクを表す。キャッシュなし、レイジーローディングなし、圧縮なし -- チャンクは生成されて直接クライアントに送られる。

## ストレージ：全部静的配列

Bareironのメモリアーキテクチャは、組み込みCの真骨頂。mallocなし、ハッシュマップなし、リンクリストなし。

全部が固定サイズのグローバル配列に入ってる。

### ブロックの変更

```c
// globals.h, lignes 191-196

typedef struct {
  short x;      // 2バイト -- 水平方向32000ブロックが上限
  short z;      // 2バイト
  uint8_t y;    // 1バイト -- 垂直方向256ブロックが上限
  uint8_t block; // 1バイト -- 256ブロックタイプが上限
} BlockChange;
```

20,000エントリ、つまり約**25,000回の変更** -- チャンク1.5個分を完全に掘り返した量に相当。`block`フィールドが`0xFF`のときは空きエントリを示す。検索は線形スキャン：

![Layout mémoire du tableau de blocs -- 6 bytes par entrée](/images/bareiron/memory-layout.jpg)

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

変更の追加も検索と同じくらい直接的：

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

カウンタ、インデックス、書き込み。ソートなし、コンパクションなし、メモリ管理なし。配列がいっぱいになると新しい変更は無視される -- 地形は生成時の状態に戻る。

256ブロック上限に関する作者のコメント：「ちょっとくすんだ銅の階段とか、そういうのはまだ実装する気ないんだよね」。

### モブ：1匹8バイト

```c
// globals.h, lignes 240-251 (pragma pack(push, 1) でパディングを削除)

typedef struct {
  uint8_t type;   // 25=ニワトリ, 28=ウシ, 95=ブタ, 106=ヒツジ, 145=ゾンビ
  short x;
  uint8_t y;      // health=0の場合、Yは削除前のタイマーになる
  short z;
  uint8_t data;   // ビット0-4: HP, ビット5: ヒツジの刈り取り, ビット6-7: パニックタイマー
} MobData;
```

8バイト。最大16スロット。アラインメントなし、パディングなし。`data`バイトは自作ビットフィールド：5ビットのHP、1ビットの刈り取り、2ビットのパニックタイマー。そしてモブが死ぬと、Yフィールドが削除前のタイマーになる。ビットレベルでメモリを再利用してる。

### プレイヤー：ギュウギュウ詰め

プレイヤーデータも`#pragma pack(push, 1)`を使用 -- 座標は`short` + `uint8_t`、インベントリは固定配列の`uint16_t` + `uint8_t`、そして`flags`フィールドには攻撃クールダウン、スポーン状態、スニーク、スプリント、食事、ロード、移動クールダウン、クラフトロックのすべてがエンコードされてる。全部個別のビットに詰め込まれてる。

## メインループ：while(true)とノンブロッキング

サーバー全体が1つのループ、1つのスレッド、イベントライブラリゼロで動く。

```c
// main.c, lignes 594-720

while (true) {
  task_yield();  // ESP32のウォッチドッグを落ち着かせる

  // 新しい接続を受け付ける（ノンブロッキング）
  for (int i = 0; i < MAX_PLAYERS; i ++) {
    if (clients[i] != -1) continue;
    clients[i] = accept(server_fd, ...);
    if (clients[i] != -1) client_count ++;
    break;
  }

  // 時間が経過していたらサーバーティック
  if (get_program_time() - last_tick_time > TIME_BETWEEN_TICKS) {
    handleServerTick(time_since_last_tick);
    last_tick_time = get_program_time();
  }

  // ラウンドロビン：1クライアント、1イテレーションにつき1パケット
  client_index = (client_index + 1) % MAX_PLAYERS;
  if (clients[client_index] == -1) continue;

  // パケットヘッダを読む：length + ID
  recv(client_fd, &recv_buffer, 2, MSG_PEEK);
  int length = readVarInt(client_fd);
  int packet_id = readVarInt(client_fd);
  handlePacket(client_fd, length - sizeVarInt(packet_id), packet_id, state);
}
```

ループ1イテレーションにつき1クライアントだけが処理され、1パケットだけが読まれる。ループ先頭の`task_yield()`でESP32上のFreeRTOSアイドルタスクが息継ぎできる -- これがないとウォッチドッグタイマーがチップをリセットする。

パケットディスパッチは**400行**の巨大なswitch文：

```c
// main.c, lignes 68-497

void handlePacket (int client_fd, int length, int packet_id, int state) {
  switch (packet_id) {
    case 0x00:  // 状態に応じてHandshake / Status / Login
    case 0x01:  // Status ping
    case 0x02:  // Plugin message
    case 0x03:  // Login/configuration acknowledgment
    case 0x08:  // Chat
    case 0x0B:  // Client status (respawn)
    case 0x11:  // Click container (チェストを処理)
    case 0x19:  // Interact entity
    case 0x1D..0x20:  // Movement packets (最大のケース)
    case 0x28:  // Player action (掘る/置く)
    // ... 40以上のケース
  }
}
```

動的ジャンプテーブルなし、vtableなし、マップなし。switchは静的ジャンプテーブルにコンパイルされる。組み込みに最適。

`0x1D-0x20`のケースが最大 -- 位置更新、落下ダメージ、チャンク境界通過、モブスポーン、チャンク生成、そして空腹までもを処理する。全部1つの巨大なフォールスルーで。

![Le code du serveur Bareiron -- 6800 lignes de C](/images/bareiron/code-shot.jpg)

## サーバーティックとモブAI

`handleServerTick`関数は50msごと（20 TPS）に呼び出される。メインループがプレイヤーを処理している間に、ワールドを管理する：

```c
// main.c (simplifié)

void handleServerTick (uint32_t delta) {
  // 各モブを更新
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type == 0 || mobs[i].data == 0) continue;  // 死亡または空

    MobData *mob = &mobs[i];
    int px, pz;
    getNearestPlayer(mob->x, mob->z, &px, &pz);

    if (mob->type == MOB_ZOMBIE) {
      // 敵対的：最も近いプレイヤーに向かって歩く
      if (px < mob->x) mob->x --;
      else if (px > mob->x) mob->x ++;
      if (pz < mob->z) mob->z --;
      else if (pz > mob->z) mob->z ++;
      // 2ブロック以内で接触ダメージ
      if (abs(px - mob->x) <= 2 && abs(pz - mob->z) <= 2)
        damagePlayer(getNearestPlayerId(mob->x, mob->z), 3);
    } else {
      // 受動的：8方向ランダム
      uint8_t dir = getMobDir(mob);
      mob->x += dir_lookup[dir][0];
      mob->z += dir_lookup[dir][1];
      // 約40ティックごとに方向転換
      if (mob->data >> 6 < 1) setMobDir(mob, rand() & 7);
      mob->data = (mob->data & 0x3F) | ((mob->data - 0x40) & 0xC0);
    }

    // モブ周辺のチャンクを起動
    setChunkGenerated(mob->x / 8, mob->z / 8);
  }
}
```

敵対モブのAIは座標比較。文字通り `if (px < x) x--`。パスファインディングなし、A*なし、障害物回避なし。ゾンビはプレイヤーに向かってXとZを独立に調整する -- 壁があれば壁の中も突き進む。

接触ダメージはハート3個/秒。p2r3は意図的に高く設定している。パスファインディングがない分、ゾンビは簡単にキットできるからだ。

防具の計算式はコンバットアップデート前のもの -- 可能な限りシンプル：

```c
// main.c (simplifié)

static uint8_t applyArmor (uint8_t damage, uint16_t armor_value) {
  // 1.9以前の計算式：線形減少
  // 防具ポイント1につき4%軽減、最大80%
  uint8_t reduction = (armor_value * 4);
  if (reduction > 80) reduction = 80;
  return damage * (100 - reduction) / 100;
}
```

フルダイアモンド = 80%軽減。ゾンビの3ハート攻撃が0.6ハートになる。p2r3がこの古い計算式を選んだのは、2回の演算で済むからだ -- しきい値なし、曲線なし、ただの線形パーセンテージ。

受動的モブ：ルックアップテーブルで8方向、約40ティックごとに進路変更。`data`フィールドは上位2ビットに現在の方向、残り6ビットに方向転換タイマーをエンコードしてる。

![Mobs dans Bareiron -- zombies, cochons, moutons](/images/bareiron/mobs.jpg)

### モブのリスポーン

モブはランダムティックでスポーンしない。サーバーティックが新しいチャンク境界に遭遇したときに出現する：

```c
if (player crossed chunk boundary) {
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type != 0) continue;
    spawnMob(&mobs[i], new_chunk_coords, getChunkHash(cx, cz));
    break;
  }
}
```

地形と同じRNG、同じチャンクシード。モブスロットが空いていれば、スポーンは決定論的。

## クラフト：マトリックスなし、if/elseのみ

```c
// crafting.c, lignes 9-347 (simplifié)

void getCraftingOutput (PlayerData *player, uint8_t *count, uint16_t *item) {
  // 0x80フラグが立っている場合、クラフトバッファはチェストに使用中
  if (player->flags & 0x80) { *count = 0; *item = 0; return; }

  // スロットを数え、最初のアイテムを見つけ、同一性を確認
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
    case 1:  /* 板材、インゴット... */
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

最初のチェック：`0x80`フラグが立っている場合、クラフトバッファはチェストポインタとして再利用されている。クラフト不可能。

次に、埋まったスロットを数え、最初のアイテムを記録し、同一性を確認する。これだけで、かまどは4つのチェックでマッチする：

```c
if (count == 8 && first == cobblestone && all_identical && center_empty)
    return furnace;
```

複雑な形状の場合、最初のアイテムのインデックスを使って相対位置をチェックする。すべてのレシピは同じマッチング関数を共有し、素材が結果を決定する。

![Interface de craft et coffre dans Bareiron](/images/bareiron/crafting.jpg)

## チェスト：本当のハック

みんなが話題にしてるメモリハック、実際のコード：

```c
// procedures.c, lignes 1262-1293

if (target == B_chest) {
  // ブロック配列からチェストエントリを探す
  uint8_t *storage_ptr = NULL;
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block != B_chest) continue;
    if (block_changes[i].x != x || block_changes[i].y != y || block_changes[i].z != z)
      continue;
    storage_ptr = (uint8_t *)(&block_changes[i + 1]);  // チェストブロックの次のエントリを指す
    break;
  }
  if (storage_ptr == NULL) return;

  // 恐ろしいメモリハック!!
  // ポインタをプレイヤーのクラフトアイテム配列にコピー
  memcpy(player->craft_items, &storage_ptr, sizeof(storage_ptr));
  player->flags |= 0x80;  // クラフトをロック

  // クライアントにチェストインターフェースを送信
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

そしてコード内のコメント：`// 恐ろしいメモリハック!!1!`

まさにその通り。`block_changes[]`の次のエントリのメモリアドレスを取得し、それを`player->craft_items`（`uint16_t[9]`、つまり18バイト -- 32ビットポインタを保存するのに十分）にコピーし、その間誰もクラフトしようとしないようにフラグを立てる。

チェストインベントリ内での各クリック：

```c
// packets.c, lignes 620-638

uint8_t *storage_ptr;
memcpy(&storage_ptr, player->craft_items, sizeof(storage_ptr));
// storage_ptrは今チェストデータを指している
uint16_t *p_item = (uint16_t *)(storage_ptr + (slot - 41) * 3);
uint8_t *p_count = storage_ptr + (slot - 41) * 3 + 2;
```

クラフトバッファからポインタを復元し、オフセットでスロットにアクセスする。チェストデータは1スロットあたり3バイト（IDに2、数量に1）で、ブロック配列内に連続して格納されている。

![Données de coffre stockées dans le tableau de blocs -- un hack mémoire](/images/bareiron/chest-hack.jpg)

## 空腹：天才の5行

```c
// main.c, lignes 293-305

// プレイヤーは移動中は毎秒約20個の移動パケットを送信し、
// 停止中ははるかに少ない。これをアクティビティと相関させて
// 無料で空腹をシミュレートする。
if (player->saturation == 0) {
  if (player->hunger > 0) player->hunger--;
  player->saturation = 200;
  sc_setHealth(client_fd, player->health, player->hunger, player->saturation);
} else if (player->flags & 0x08) {  // スプリント中
  player->saturation -= 1;
}
```

まさにこれだけ。5行。各移動パケットが満腹度を減らす。満腹度がゼロになると空腹度が減り、満腹度がリセットされる。スプリント（`0x08`フラグ）は消費を2倍にする。

タイマーゼロ、割り当てメモリゼロ、専用計算ゼロ。すでに存在するパケットで減算されるカウンタ。

### 落下ダメージ

このプロジェクトで最もシンプルなダメージシステム：

```c
// プレイヤーが地面を離れた時点のYを保存
// 再着地したときの差を計算
ダメージ = 最後の接地Y - 現在Y
```

引き算1つ。

## ブロックの採掘と設置

ブロックをクリックすると、パケット`0x28`（Player Action）がswitchに届く。ハンドラはその位置にあるブロックを特定し、削除し、アイテムをインベントリに入れる必要がある：

```c
// main.c, case 0x28 (simplifié)

void handlePlayerAction (int client_fd, uint8_t action, int x, uint8_t y, int z) {
  switch (action) {
    case START_DESTROY_BLOCK: {
      // クリックされた位置のブロックタイプを特定
      uint8_t block = getBlockAt(x, y, z);

      if (block == B_chest) {
        openChest(client_fd, x, y, z);
        break;
      }

      // block_changesに追加
      addBlockChange(x, z, y, 0);  // 0 = 空気

      // プレイヤーにアイテムを付与（クライアントを信頼）
      addItemToPlayer(client_fd, block_to_item(block), 1);

      // クライアントに更新を送信
      sc_blockChange(client_fd, x, y, z, 0);
      sc_ackBlockChange(client_fd, x, y, z, 0);
      break;
    }
    case PLACE_BLOCK: {
      // プレイヤーの手からブロックタイプを読む
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

`getBlockAt`は地形生成とプレイヤーの変更を組み合わせる：

```c
uint8_t getBlockAt (int x, uint8_t y, int z) {
  // まずプレイヤーの変更を確認
  uint8_t change = getBlockChange(x, y, z);
  if (change != 0xFF) return change;

  // なければ生成された地形から読む
  return getTerrainBlock(x, y, z);
}
```

変更を優先、フォールバックは地形。議論の余地なし、キャッシュなし、オーバーヘッドなし。`getTerrainBlock`の内部は`getHeightAt` + stone/dirt/grass/coalのレイヤー。

### 瞬間沸騰炉

一番面白いところ：かまどはエンティティとして存在しない。「調理」スロットに丸石を、「燃料」に石炭を入れると、結果が即座に表示される。タイマーなし、チャンクティッキングなし。適切なアイテムを入れると空になるただのインベントリスロットだ。

![Fourneau instantané -- pose les ingrédients, résultat immédiat](/images/bareiron/furnace.jpg)

## ESP32ループ：4KBのスタックで動くMCサーバー

```c
// main.c, lignes 732-779

#ifdef ESP_PLATFORM

void bareiron_main (void *pvParameters) {
  main();
  vTaskDelete(NULL);
}

static void wifi_event_handler (...) {
  if (/* 接続完了 */) {
    xTaskCreate(bareiron_main, "bareiron", 4096, NULL, 5, NULL);
  }
}

void app_main () {
  esp_timer_early_init();
  wifi_init();
  // 残りはイベントハンドラが処理
}
#endif
```

サーバー全体が**4096バイトのスタック**を持つFreeRTOSタスクで動く。それだけ。メインのスレッドはWiFiを初期化して接続を待つだけ。接続されると、標準の`main()`を呼び出す`bareiron_main`を起動する。

ESP32固有のコードはすべて`#ifdef ESP_PLATFORM`で保護されている。PC上では、すべて標準POSIXコードとしてコンパイルされる。

## 犠牲にされたもの

これをすべて収めるために、存在しないバニラ機能がある：

- **ネットワーク圧縮なし** -- zlibが高コストすぎる。サーバーはチャンクを高速生成するが、送信がボトルネックになる。
- **ランダムティックなし** -- 木は骨粉を使うか使わないかで成長する。モブはチャンク境界でスポーンする。
- **アイテムエンティティなし** -- 採掘したブロックは直接インベントリに入る。アニメーションは純粋に視覚的。
- **インベントリ検証なし** -- クライアントを信頼。ダイアモンド64個？OK。1秒でチャンクを掘り尽くす？OK。信頼できる人同士で使う用。
- **サーバー側ライティングなし** -- 松明は他のものより後に送信され、クライアントが計算する。
- **進行性流体なし** -- 最終状態が即座に反映される。

## 最終結果

Ryzen 5 3600：チャンクあたり約0.5 ms。
1ドルのESP32-C3：チャンクあたり約200 ms。プレイ可能。

![Benchmark de génération de chunks -- Ryzen vs ESP32](/images/bareiron/performance.jpg)

3人以上のプレイヤー：重くなる。作者曰く、ピーク時の2b2t並み。

![Plusieurs joueurs connectés au même serveur Bareiron](/images/bareiron/multiplayer.jpg)

## 哲学

p2r3：「たった1ドルで0.5ワットしか消費しないこの小さなチップが、Minecraftほど先進的なものを動かせるというアイデアがただ好きなんだ。科学は『なぜ』じゃない、『なぜやらない』なんだよ」。

すべての行はトレードオフだ：
- パーリンノイズ → 補間：見た目は劣るが、200倍高速、メモリゼロ
- クラフトマトリックス → ハードコードされたマッチング：コードは汚いが、バイト数ゼロ
- zlib → なし：回線が悪ければ死ぬが、プレイ可能
- 検証 → 信頼：セキュリティゼロ、計算量ゼロ

欠けている機能のひとつひとつが、別の機能をハードウェアの制限内で存在させるためにある。

**覚えておくべき3つのポイント：**

1. **補間 + RNG** -- シードされた4点、無限の地形、保存量ゼロ、チャンク再生成不要のクエリ、200 msの生成。これがすべてを可能にした天才的な一手だ。
2. **すべての機能にはコストが伴う** -- 圧縮なし、ランダムティックなし、検証なし。これは忘れたんじゃない。520 KBに収めるために必要なことだ。
3. **汚いハックが一番賢い** -- memcpyによるブロック配列内のチェスト、移動パケットによる空腹、瞬間沸騰炉。きれいな解決策は高すぎた。

このプロジェクトに興味があれば、全部 [GitHubでGPLv3](https://github.com/p2r3/bareiron/) で公開されてる。めちゃくちゃ汚いC言語だ。そしてこんなに楽しくソースコードを読めたことは滅多にない xD
