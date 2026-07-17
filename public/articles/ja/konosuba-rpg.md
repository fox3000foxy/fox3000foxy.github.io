---
title: "konosuba-rpgのコードを週末に読んでみた結果"
description: "Discord用ターン制RPG。各アクションがWebP画像をリアルタイム生成：URLをゲーム状態として使用、決定論的RNG、WASMパイプライン、5層キャッシュ、サーバーレスボット。"
date: 2026-06-10
authors:
  - fox3000foxy
tags:
  - discord
  - rpg
  - typescript
  - hono
  - cloudflare
  - supabase
  - wasm
  - gaming
  - serverless
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "gBAhrkQByGd6K1Qfb3QMw+200KXvEGBtIr2lPvUe/TVOy392uy3uo8ZvTd+yzSWipAPipzNPDYEZqZcPGObxkA=="
---

# konosuba-rpgのコードを週末に読んでみた結果

このプロジェクトをしばらくメンテナンスしてきたが、自分のコードを落ち着いて読み返すのはいつだって勉強になる。konosuba-rpgはDiscord用のターン制RPGで、各アクションごとにWebP画像をリアルタイム生成する。テキスト埋め込みではない。スプライト、HPバー、戦闘メッセージ----すべてを含んだ本物の画像が合成される。

スタックは：TypeScript、Hono、Vercel、Cloudflare Workers、Supabase。ホスティングはすべて無料。そしてDiscordボットは永続サーバーなしで動作する。この記事では、それらがどのように連携しているかを説明する。

![ゲーム初期状態](/images/konosuba-rpg/game_init.webp)

---

## 基本設計：URLをゲーム状態として使用

最初に気づくこと：ゲームプレイに関するサーバー側の状態は一切存在しない。戦闘の完全な状態がURLに収められている。

```
/konosuba-rpg/fr/abc123/ATK/DEF/ATK/HUG?monster=Vanir&difficulty=hard
```

シード以降の各セグメントは実行されたアクションを表す。サーバーはこのURLを受け取り、最初からやり直し、すべてのアクションを順番に再生し、その時点の戦闘画像を返す。セッションも、ユーザーに関連するRAM上の状態も存在しない。

Discordはインタラクティブボタンで動作する----プレイヤーが「攻撃」を押すと、Discordはボタンの`custom_id`をサーバーに送信する。このcustom_idには新しいアクションが追加された圧縮済み戦闘URLが含まれている。サーバーはゼロからすべてを再計算し、更新された画像を返す。

```typescript
// processUrl.ts
const VALID_MOVES_SET = new Set(["ATK", "DEF", "HUG", "HEA", "SPE", "USE"]);
// 関数外で事前コンパイル----呼び出しごとに再生成されない

export default function processUrl(url: string): [Random, string[], string, string | null, string | null] {
  const urlParts = url.split("/");
  const moves: string[] = [];
  for (const part of urlParts) {
    if (VALID_MOVES_SET.has(part.toUpperCase())) moves.push(part.toUpperCase());
  }
  // seed = 6番目のセグメント、8096値にハッシュ化
  const seedStr = (urlParts[5] || "").toLowerCase();
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed + seedStr.charCodeAt(i)) % 8096;
  }
  return [new Random(seed), moves, seedStr, monster, difficulty];
}
```

関数の外で事前コンパイルされた`Set`は細かい点だが、モジュールが再評価されうるエッジコンテキストで毎回構造を再構築するのを避けられる。

### RNG：修正版RC4

乱数生成器はRC4（ストリーム暗号アルゴリズム）をPRNGとして流用した実装である。

```typescript
export class Random {
  private S: number[]; // 256エントリのテーブル
  private i: number;
  private j: number;

  constructor(seed?: number) {
    this.S = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    let workingSeed = seed || Date.now();
    for (let i = 0; i < 256; i++) {
      j = (j + this.S[i] + (workingSeed & 0xff)) & 0xff;
      // S[i]とS[j]をスワップ
      [this.S[i], this.S[j]] = [this.S[j], this.S[i]];
      workingSeed >>>= 8;
    }
  }

  next(): number { /* ... */ }
  randint(min: number, max: number): number { /* ... */ }
  choice(array: T[]): T { /* ... */ }
}
```

なぜRC4か？分布が適切でシード衝突耐性もまずまずな決定論的PRNGだからだ。同じシード＝同じ数列＝毎回同じ戦闘。これにより、任意の戦闘をURLを保持したまま「再生」でき、異なるサーバー（Vercel + Cloudflare）でも同じURLに対してまったく同じ結果を生成できる。

---

## Discordの100文字制限問題

Discordはボタンの`custom_id`に100文字の制限を課している。数十アクションを超えると、戦闘URLはあっさりこの制限を超える。

これに対処する2つの仕組みがある。

### 1. アクションのRLE圧縮

アクションは1文字でエンコードされ（`a`=攻撃、`d`=防御、`h`=ハグ…）、ランレングス符号化で圧縮される：

```typescript
// movesUtils.ts
export function compressMoves(moves: string): string {
  // "aaaaaadddh" → "a6d3h"
  let result = "";
  let count = 1;
  for (let i = 1; i <= actions.length; i++) {
    if (actions[i] === actions[i - 1]) {
      count++;
    } else {
      result += actions[i - 1] + (count > 1 ? String(count) : "");
      count = 1;
    }
  }
  return head + result;
}
```

シンプルだが、プレイヤーが攻撃を10連打すると`aaaaaaaaaa`（10文字）が`a10`（3文字）になる。UIの「4回攻撃」「10回攻撃」ボタンはまさにこのためのものだ----戦闘を加速しつつペイロードも圧縮する。

### 2. 圧縮でも足りない場合のセッショントークン

圧縮済みペイロードが依然として長すぎる場合、短いトークンとともにデータベースに保存される：

```typescript
// gameSessionService.ts
const TOKEN_PREFIX = "gs.";
const TOKEN_SIZE = 10; // "gs.aBcDeFgHiJ"

export async function encodeGameplayButtons(buttons: RawButton[]): Promise {
  // ペイロードをbattle_keyでグループ化し、Supabaseにバッチ挿入
  // custom_idを"gs.{token}:{userId}"に置き換え
}

export async function decodeGameplayPayloadWithStatus(encodedPayload: string, userID: string) {
  if (!encodedPayload.startsWith(TOKEN_PREFIX)) {
    return { payload: encodedPayload }; // 不要ならルックアップしない
  }
  // まずメモリ、なければSupabaseでルックアップ
  const cached = tokenToSession.get(token) || await loadTokenRowByToken(token);
  // 所有権、TTL（7日間）、turn_versionを検証（古い状態の再実行を防止）
}
```

セッションのTTLは7日間で、10分ごとに自動削除される。`turnVersion`のチェックにより、プレイヤーがゲームを進めた後に古い状態を再実行するのを防ぐ----うっかり「巻き戻し」を防ぐさりげない保護機構だ。

2つのインメモリMap（`tokenToSession`、`latestTurnByBattle`）は画像キャッシュと同じ`globalThis as unknown as GameSessionGlobals`パターンを使用しており、理由は後述する。

---

## 画像レンダリングパイプライン

![スライムとの戦闘開始](/images/konosuba-rpg/shot_01_start.webp)

`/konosuba-rpg/:lang/*`ルートはJSONを返さない。リクエストに応じて生成されたWebP画像を返す。

パイプラインは3つの合成レイヤーで構成される：

```
背景（ボード＋フレーム）
    +
キャラクターレイヤー（プレイヤースプライト＋モブ、固定位置）
    +
UIオーバーレイ（HPバー、メッセージ、キャラクターアイコン、Satori → SVG → PNG経由）
    ↓
Photon.watermark() × 2
    ↓
WebP出力
```

**背景**：2枚の固定画像（ボードとフレーム）、ファイルシステムから読み込んで1回合成される。

**キャラクターレイヤー**：計算された座標にスプライトが配置される。死亡したプレイヤーは除外される（`activeSlots = slots.filter(s => playerHp[s.i] > 0)`）。敵スプライトはカスタム`flipX`で水平反転される----外部依存ではなくピクセル単位のループ処理である。

```typescript
function flipX(img: Photon.PhotonImage): Photon.PhotonImage {
  const w = img.get_width(), h = img.get_height();
  const raw = img.get_raw_pixels();
  const flipped = new Uint8Array(raw.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      const dst = (y * w + (w - 1 - x)) * 4;
      flipped[dst] = raw[src]; flipped[dst+1] = raw[src+1];
      flipped[dst+2] = raw[src+2]; flipped[dst+3] = raw[src+3];
    }
  }
  return new Photon.PhotonImage(flipped, w, h);
}
```

**UIオーバーレイ**：これが重い部分だ。インターフェースのJSX（HPバー、テキスト、アイコン）がReactライクにSatoriで記述され、SVGにレンダリングされ、`@cf-wasm/resvg`でPNGに変換され、最終合成のためにPhotonに取り込まれる。Satori + resvgは`edge-light`フラグ付きでCloudflare Workers用に特別にコンパイルされた2つのWASMモジュールである。

![防御アクション](/images/konosuba-rpg/shot_03_defend.webp)

![戦闘中](/images/konosuba-rpg/shot_02_combat.webp)

![ハグアクション](/images/konosuba-rpg/shot_04_hug.webp)

---

## キャッシュシステム----最も手の込んだ部分

5つの異なるキャッシュレベルがある。それぞれがパイプラインの異なる粒度を対象としている。

```typescript
// renderImage.ts -- すべてglobalThis上
G.__imageCache  ??= {} as Record; // 生アセット
G.__base64Cache ??= {} as Record;       // アセットのbase64（Satori用）
G.__fontCache   ??= {} as Record; // フォント
G.__photonCache    ??= new LRUCache(40, freePhoton);
G.__layerCache     ??= new LRUCache(12, freePhoton);
G.__uiPhotonCache  ??= new LRUCache(30, freePhoton);
G.__renderOutputCache ??= new LRUCache(120);
```

`globalThis`上の`??=`パターン：エッジワーカーのJavaScriptモジュールは、一部の設定でリクエスト間で再評価される可能性がある。キャッシュを`globalThis`に`??=`で保存することで、再評価後も再生成されずに生存することが保証される。

### WASMの解放

Photon画像キャッシュ（`photonCache`、`layerCache`、`uiPhotonCache`）は解放コールバックを使用する：

```typescript
function freePhoton(_key: string, img: Photon.PhotonImage): void {
  try { img.free(); } catch { /* 既に解放済み */ }
}

new LRUCache(40, freePhoton)
```

`Photon.PhotonImage`はWASMオブジェクトであり、JavaScriptのGCの外部にあるWASM線形メモリ側にメモリが割り当てられる。明示的な`.free()`呼び出しなしには、このメモリは決して解放されない。LRUの削除が自動的に`.free()`をトリガーする----JavaScriptにおけるRAIIのようなものだ。

### キャッシュキーは意図的にロッシー

```typescript
function buildCharactersKey(playerImages: string[][], playerHp: number[], creatureImages: string[], creatureHp: number): string {
  const players = playerImages.map((imgs, i) => `${imgs[0]}:${playerHp[i] > 0 ? 1 : 0}`).join("|");
  return `chars::${players}::${creatureImages[0]}:${creatureHp > 0 ? 1 : 0}`;
}
```

キャラクターレイヤーのキーはHPの正確な値をエンコードせず、`1`（生存）か`0`（死亡）のみを記録する。なぜなら、HP 40のプレイヤーとHP 15のプレイヤーのスプライトは同じだからだ。したがって、誰も倒れない限り、キャッシュヒットはあらゆるダメージに対して有効である。

一方、UIキーは正確なHP（HPバーはヒットごとに変化する）とメッセージのハッシュをエンコードする：

```typescript
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0; // 符号付き32ビット整数
  }
  return hash.toString(16);
}
```

`Math.imul`は乗算を32ビット整数に強制し、float64変換を避け、安定した多項式ハッシュを提供する。外部依存は不要だ。

### スタックオーバーフローしないbase64変換

```typescript
function getBase64Cached(key: string, buf: ArrayBuffer): string {
  if (base64Cache[key]) return base64Cache[key];
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000; // 32768バイト
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  const b64 = btoa(binary);
  base64Cache[key] = b64;
  return b64;
}
```

`String.fromCharCode(...largeArray)`は大きな画像の場合、引数がコールスタックに渡されるためスタックオーバーフローを引き起こす可能性がある。32KB単位のチャンク化でこれを回避している。結果はキャッシュされる----同じ画像のbase64変換はワーカーインスタンスごとに1回だけ実行される。

---

## STRIPPER.md----逐次awaitの監査

リポジトリには`STRIPPER.md`というファイルがあり、`await`の並列化に関する監査が文書化されている。記録されている例をいくつか：

- プレイヤープロフィールの読み込みでは、3つのSupabaseクエリ（進行度、ランの概要、実績）が直列に実行されていた。これらは`Promise.all`に変更された----相互に依存関係はない。
- 戦闘終了時の報酬配布（アクセサリー＋消耗品）は逐次的だった。同様に並列化された。
- ボタン用のセッショントークン作成はグループごとに逐次行われていた。独立したグループは現在並列で作成されている。

```typescript
// progressionService.ts -- 変更前（逐次）
await grantAccessoryDropRewards(...);
await grantConsumableDropRewards(...);

// 変更後
await Promise.all([
  grantAccessoryDropRewards(...),
  grantConsumableDropRewards(...),
]);
```

革新的なものではないが、応答時間のミリ秒単位が課金される（またはコールドスタートに影響する）サーバーレスコンテキストでは重要だ。

---

## 永続サーバー不要のDiscordボット

![勝利](/images/konosuba-rpg/shot_05_win.webp)

しばしば誤解される点：Discordボットは必ずしも永続的なWebSocket接続を必要としない。Discordには**Interactions Endpoint URL**という代替手段がある。HTTPSのURLをDiscordに提供すると、Discordは各インタラクション（スラッシュコマンド、ボタン、オートコンプリート）に対してPOSTを送信する。

```typescript
// interactions.ts
export async function handleInteractions(c: Context) {
  const body = await c.req.text();
  const isVerified = await verifySignature(c, body); // Ed25519
  if (!isVerified) return c.text("Invalid signature", 401);

  const interaction: Interaction = JSON.parse(body);
  if (interaction.type === 1) return c.json({ type: 1 }); // Discord ping
  if (interaction.type === 2) return handleSlashCommand(...);
  if (interaction.type === 3) return handleButtonInteraction(...);
  if (interaction.type === 4) return handleAutocomplete(...);
}
```

DiscordがPOSTを送信し、ハンドラがVercel関数またはCloudflare Worker上で50〜200ms実行され、応答して終了する。永続的な接続を維持する必要も、サーバーを起動したままにする必要もない。Discordボット全体がVercelのfree tier上でホストされている。

`discord-interactions`からの`verifyKey`によるEd25519署名検証は必須である----Discordはヘッダーに署名を送り、それを検証しないとエンドポイントが拒否される。

### 特殊アニメーション----唯一の意図的なawait

```typescript
// handleSpecialButton.ts
await new Promise(resolve => setTimeout(resolve, 3000)); // 3秒
await fetch(`${DISCORD_API_URL}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
  method: "PATCH",
  // ...
});
```

この意図的な3秒の遅延はSTRIPPER.mdに意図的と文書化されている。めぐみんの特殊攻撃（爆裂魔法）はDiscord側でアニメーションを持ち----メッセージがまず中間ビジュアルで更新され、3秒後に結果で変更される。Vercel関数が意図的に必要以上に長く実行される唯一のケースだ。

![特殊攻撃](/images/konosuba-rpg/shot_08_special.webp)

---

## 2つのプラットフォームへのデプロイ可能性

同じコードベースがVercel（Node.js）とCloudflare Workers（V8 isolates）で修正なしで動作する：

```typescript
// worker.ts -- Cloudflareエントリーポイント
export default {
  fetch(request: Request, env: WorkerBindings): Promise {
    syncBindingsToProcessEnv(env); // CFのsecretをprocess.envに注入
    return app.fetch(request, env, ctx);
  }
};

// index.ts -- Vercel/Nodeエントリーポイント
const isVercelRuntime = process.env.VERCEL === "1";
if (!isVercelRuntime) { start(); }
```

主な違いは静的アセットだ。Vercelではファイルシステム（`/var/task/assets/`）から読み込まれる。Cloudflare Workersでは、`ASSETS`バインディング（CF静的アセット）を経由し、フォールバックとしてHTTPSミラー（`fox3000foxy.com/konosuba-rpg/assets`）を使用する。`assetLoader.ts`の`getAssetBytes`は、まずファイルシステム、次にfetchを試みることで両方のパスを処理する。

WASM（`@cf-wasm/photon/edge-light`、`@cf-wasm/resvg`）はランタイムごとに別々のビルドがある。パッケージ名の`edge-light`フラグはCloudflare Workers互換のビルドを示しており、ランタイムでの`new WebAssembly.Module()`を許可しない----WASMは事前コンパイルされている必要がある。

---

## 進行度：XP、レベル、親密度

![ボス、HP 650](/images/konosuba-rpg/shot_06_boss.webp)

メタ進行度はSupabase free tierに依存している。スキーマには`players`テーブル（全体XP、レベル、ゴールド）、`character_progress`（ダクネス、アクア、めぐみんの各キャラクターごとのXP/レベル/親密度）、`runs`（戦闘履歴）、`inventory_items`、`daily_quests_progress`、`achievements_unlocked`、`game_sessions`が含まれる。

進行度モデルはシンプルだ：

```typescript
// characterService.ts
export function computeLevelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1; // レベルごとに100 XP
}

export function getLevelFactor(level: number): number {
  return 1 + 0.2 * (level - 1); // レベルごとに+20%ステータス
}

export function getAffinityFactor(affinity: number): number {
  const stars = Math.floor(affinity / 20); // 20ポイントで星1つ、最大5つ星
  return 1.2 ** stars; // 指数関数的成長
}
```

これらの係数は各`processGame`の開始時にキャラクターのステータスに適用される。カズマはプレイヤーの全体レベルに従い、他の3人はそれぞれ独自のXP/レベルを持つ。親密度（キャラクターに関連するドロップを回収することで獲得）は、そのキャラクターのステータスを独立して増加倍率する。

![回復](/images/konosuba-rpg/shot_07_heal.webp)

ドロップシステムは難易度で重み付けされたルートテーブルを使用する：

```typescript
const LOOT_TABLE_BY_DIFFICULTY: Record = {
  [MonsterDifficulty.Easy]: {
    baseRolls: 2, bonusRollChance: 0.1, maxBonusRolls: 2,
    rarityWeights: [
      { rarity: Rarity.Bronze, weight: 68 },
      { rarity: Rarity.Silver, weight: 25 },
      { rarity: Rarity.Gold,   weight: 6  },
      { rarity: Rarity.Epic,   weight: 1  },
    ],
  },
  // ...Legendaryまで
};
```

---

## テスト

3つのスイート：単体テスト、パフォーマンステスト、リークテスト。

リークテストは特に直接的なものだ：

```typescript
// leaks.spec.ts
it('does not show strong heap growth across repeated runs', async () => {
  global.gc();
  const before = heapUsedMb();

  for (let i = 0; i < 1200; i++) {
    await processGame(new Random(), ['ATK', 'DEF', 'HUG', 'ATK', 'DEF'], 'Dragon', Lang.English);
  }

  global.gc();
  const after = heapUsedMb();
  expect(after - before).toBeLessThan(20); // 最大20MBのヒープ成長
});
```

`processGame`を1200回繰り返し、前後でGCを強制、ヒープ差分 < 20MB。このテストが通れば、`processGame`にメモリリークはない。レンダーテスト（`renderImage.spec.ts`）は、実用的なしきい値以下の実行時間をチェックする。

パイプライン全体をプロファイルするための`bench.ts`スクリプトもある：

```
RENDER_PERF=1 npx tsx bench.ts --runs=20 --warmup=3 --monster=Dragon
```

`RENDER_PERF=1`の場合、各サービスの`withPerf`ラッパーがタイミングを記録する：

```typescript
export async function withPerf(scope: string, label: string, work: () => Promise): Promise {
  const perf = createPerfLogger(scope);
  if (!perf.enabled) return work(); // 無効時はゼロオーバーヘッド
  perf.mark(`${label}:start`);
  try { return await work(); }
  finally { perf.done(`${label}:done`); }
}
```

`createPerfLogger`は`DEV_MODE`と`RENDER_PERF`が`1`でない場合はno-opを返す。本番環境ではオーバーヘッドは一切ない。

---

## 運用コスト

- **Vercel free tier**：月間100GBの帯域幅、100万回のサーバーレス呼び出し。画像レンダリングは1回の呼び出しとしてカウントされる。
- **Cloudflare Workers free tier**：日10万リクエスト、リクエストあたり10ms CPU時間（Workerではレンダリングがこれを超える可能性があるため、Vercelをプライマリとしている）。
- **Supabase free tier**：500MBデータベース、5GB帯域幅。数千人のプレイヤーに十分な容量だ。

バックエンド全体が、有意なトラフィック量まではゼロコストで動作する。唯一の摩擦点はCloudflare WorkersのCPU制限だ----画像レンダリングはWASMのためにCPU集約型であり、そのためVercelをプライマリ、WorkersをCDNフォールバックとする戦略をとっている。

---

## 覚えておくべき3つのこと

1. **URLをゲーム状態として使う**ことは単なる気の利いたトリックではない----Discordによって課された制約（ボタンは100文字制限）であり、RLE圧縮＋セッショントークンをフォールバックとするステートレスアーキテクチャを強制した。制約が設計を決定づけたのだ。

2. **明示的な解放処理付きWASMキャッシュ**：`PhotonImage`はJavaScriptヒープ外にメモリを割り当て、`.free()`なしではGCされない。LRUの削除に`freePhoton`を結びつけることは、JavaScriptにおけるRAIIである。コード内では控えめだが、これがないとワーカーは本番でメモリリークする。

3. **WebSocketなしのサーバーレスDiscordボット**：WebSocketゲートウェイ方式ほど知られていないが、ステートレスな処理（各インタラクションは独立）を行うボットには、Interactions Endpointが厳密に優れている----再接続不要、ハートビート不要、プロセス維持不要。Discordがインフラ側で可用性を管理する。

---

*リポジトリ： [fox3000foxy/konosuba-rpg](https://github.com/fox3000foxy/konosuba-rpg)*

*ソース利用可能なカスタムライセンス----再配布禁止、自由に使用可能。*
