---
title: "konosuba-rpgのコードを週末かけて読んだら見つけたこと"
description: "各行動がWebP画像をその場生成するDiscordターンベースRPG。URLをゲーム状態に、決定的RNG、WASMパイプライン、5層キャッシュ、サーバーレスボット。"
date: 2026-06-10
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
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "Sp5ZZaDhbJp5iKXBsMPqCdGzYt/ksgcF9r6PpkbXQspMVn/zSUR/C3c0Ly2EdeUYILkwZw/eJzY72FAbYRR3XA=="
---

# konosuba-rpgのコードを週末かけて読んだら見つけたこと

このプロジェクトは前から保守してるけど、頭の休まった状態で自分のコードを読み返すのはいつも勉強になる。konosuba-rpgは各行動がWebP画像をその場生成するDiscordターンベースRPGだ。本物の合成画像だよ。スプライトも体力バーも戦闘メッセージも全部だ。

スタックはTypeScript、Hono、Vercel、Cloudflare Workers、Supabaseだ。ホスティングは完全無料だ。Discordボットは永続サーバーなしで動く。この記事では全部どう保ってるか説明する。

![ゲームの初期状態](/images/konosuba-rpg/game_init.webp)

---

## 基本設計：URLをゲーム状態にする

最初に打たれるのは、ゲームプレイ用のサーバー側状態がゼロってことだ。戦闘の完全状態はURLに入ってる。

```
/konosuba-rpg/fr/abc123/ATK/DEF/ATK/HUG?monster=Vanir&difficulty=hard
```

seedの後の各セグメントは遊んだ行動1つだ。サーバーはこのURLを受けて、頭から全行動を順に再生して、その瞬間の戦闘画像を返す。セッションなし、ユーザー紐付きRAM状態なしだ。

Discordは対話ボタンで動く。プレイヤーが「攻撃」を押すと、Discordはボタン`custom_id`をサーバーに送る。このcustom_idには新行動を足した圧縮戦闘URLが入ってる。サーバーはゼロから全部再計算して、更新画像を返す。

```typescript
// processUrl.ts
const VALID_MOVES_SET = new Set(["ATK", "DEF", "HUG", "HEA", "SPE", "USE"]);
// 関数外でプリコンパイル。呼び出しごとに作り直さない

export default function processUrl(url: string): [Random, string[], string, string | null, string | null] {
  const urlParts = url.split("/");
  const moves: string[] = [];
  for (const part of urlParts) {
    if (VALID_MOVES_SET.has(part.toUpperCase())) moves.push(part.toUpperCase());
  }
  // seedは6番目セグメント、8096値にハッシュ
  const seedStr = (urlParts[5] || "").toLowerCase();
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed + seedStr.charCodeAt(i)) % 8096;
  }
  return [new Random(seed), moves, seedStr, monster, difficulty];
}
```

関数外プリコンパイルの`Set`は細かいけど、モジュールが再評価されうるedge文脈で呼び出しごとに構造を作り直さない。

### RNG：改変RC4

乱数ジェネレータはRC4実装（stream暗号アルゴリズム）をPRNGに流用したものだ。

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
      // S[i]とS[j]を交換
      [this.S[i], this.S[j]] = [this.S[j], this.S[i]];
      workingSeed >>>= 8;
    }
  }

  next(): number { /* ... */ }
  randint(min: number, max: number): number { /* ... */ }
  choice(array: T[]): T { /* ... */ }
}
```

なぜRC4かって。分布がまともでseed衝突耐性もまともな決定的PRNGだからだ。同じseedは同じ数列、同じ戦闘に毎回なる。URLを保てば任意戦闘を「再生」できて、違う2サーバー（VercelとCloudflare）が同じURLにまったく同じ結果を出すことが保証される。

---

## Discordの100文字制限問題

Discordはボタン`custom_id`に100文字制限を課す。数十行動もすれば戦闘URLは楽々超える。

2仕組みがこれに答える。

### 1. 行動のRLE圧縮

行動は1文字でエンコードされて（`a`=攻撃、`d`=防御、`h`=ハグなど）、ランレングス圧縮される。

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

単純だけど、攻撃x10連打は`aaaaaaaaaa`（10文字）から`a10`（3文字）になる。UIに「攻撃x4」と「攻撃x10」ボタンがあるのはまさにそのためだ。戦闘を速めつつペイロードもよく圧縮する。

### 2. 圧縮で足りなければセッショントークン

圧縮ペイロードがまだ長すぎたら、短いトークン付きでベースに保存される。

```typescript
// gameSessionService.ts
const TOKEN_PREFIX = "gs.";
const TOKEN_SIZE = 10; // "gs.aBcDeFgHiJ"

export async function encodeGameplayButtons(buttons: RawButton[]): Promise {
  // battle_keyごとにペイロードをまとめてSupabaseにバッチ挿入
  // custom_idを"gs.{token}:{userId}"に置換
}

export async function decodeGameplayPayloadWithStatus(encodedPayload: string, userID: string) {
  if (!encodedPayload.startsWith(TOKEN_PREFIX)) {
    return { payload: encodedPayload }; // 不要なら参照なし
  }
  // まずメモリ参照、なければSupabase
  const cached = tokenToSession.get(token) || await loadTokenRowByToken(token);
  // 所有権、TTL（7日）、turn_versionを確認（古い状態の再生を防ぐ）
}
```

セッションはTTL7日で10分ごとに自動pruneする。`turnVersion`確認で、プレイヤーが先に進んでたら古い状態再生を防ぐ。うっかり「巻き戻し」に対するさりげない保護だ。

メモリ内2 Map（`tokenToSession`、`latestTurnByBattle`）は画像キャッシュと同じ`globalThis as unknown as GameSessionGlobals`パターンを使う。下で見るのと同じ理由だ。

---

## 画像レンダーパイプライン

![スライム相手の戦闘開始](/images/konosuba-rpg/shot_01_start.webp)

`/konosuba-rpg/:lang/*`ルートはJSONを返さない。要求に応じて生成したWebP画像を返す。

パイプラインは合成3層で組まれてる。

```
Background (board + frame)
    +
Characters layer (players sprites + mob, fixed positions)
    +
UI overlay (HP bars, messages, Satori → SVG → PNG経由のキャラアイコン)
    ↓
Photon.watermark() × 2
    ↓
WebP output
```

**Background**：2つの固定画像（盤と枠）で、ファイルシステムから読んで1回合成する。

**Characters layer**：スプライトは計算座標で配置する。死んだプレイヤーは除外する（`activeSlots = slots.filter(s => playerHp[s.i] > 0)`）。敵スプライトは外部依存じゃなく自作`flipX`で水平ミラーする。ピクセルごとのループだ。

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

**UI overlay**：重い部分だ。UIのJSX（体力バー、テキスト、アイコン）はSatoriでReact風に記述して、SVGにレンダーして、`@cf-wasm/resvg`でPNG変換して、最終合成用にPhotonへimportする。Satoriとresvgは`edge-light`フラグ付きでCloudflare Workers専用コンパイルされた2つのWASMモジュールだ。

![防御行動](/images/konosuba-rpg/shot_03_defend.webp)

![戦闘中](/images/konosuba-rpg/shot_02_combat.webp)

![ハグ行動](/images/konosuba-rpg/shot_04_hug.webp)

---

## キャッシュシステム。一番作り込んだ部分

粒度の違う5層キャッシュがある。パイプラインの各粒度を狙う。

```typescript
// renderImage.ts。全部globalThis上
G.__imageCache  ??= {} as Record; // 生アセット
G.__base64Cache ??= {} as Record;       // アセットのbase64（Satori用）
G.__fontCache   ??= {} as Record; // フォント
G.__photonCache    ??= new LRUCache(40, freePhoton);
G.__layerCache     ??= new LRUCache(12, freePhoton);
G.__uiPhotonCache  ??= new LRUCache(30, freePhoton);
G.__renderOutputCache ??= new LRUCache(120);
```

`globalThis`上の`??=`パターン：edgeワーカーのJavaScriptモジュールは設定によってリクエスト間で再評価されうる。`??=`付きで`globalThis`にキャッシュを置けば、再評価で作り直されず生き延びることが保証される。

### WASMの eviction

Photon画像キャッシュ（`photonCache`、`layerCache`、`uiPhotonCache`）は eviction コールバックを使う。

```typescript
function freePhoton(_key: string, img: Photon.PhotonImage): void {
  try { img.free(); } catch { /* すでに解放済み */ }
}

new LRUCache(40, freePhoton)
```

`Photon.PhotonImage`はJavaScript GC外の線形WASM側に確保したメモリを持つWASMオブジェクトだ。このメモリは`.free()`を明示呼ばない限り確保されたままだ。LRUの eviction が`.free()`を自動で起こす。JavaScriptに持ってきたRAIIだ。

### キャッシュキーはわざと lossy

```typescript
function buildCharactersKey(playerImages: string[][], playerHp: number[], creatureImages: string[], creatureHp: number): string {
  const players = playerImages.map((imgs, i) => `${imgs[0]}:${playerHp[i] > 0 ? 1 : 0}`).join("|");
  return `chars::${players}::${creatureImages[0]}:${creatureHp > 0 ? 1 : 0}`;
}
```

characters層のキーはHP正確値はエンコードしない。`1`（生存）か`0`（死亡）だけだ。HP40のプレイヤーとHP15のプレイヤーのスプライトは同じだからね。誰も倒れない限りどんなダメージでもキャッシュヒットが生き延びる。

UIキーは逆に正確HPをエンコードする（体力バーは一撃ごとに変わる）。メッセージのハッシュもだ。

```typescript
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0; // 符号付き32ビット整数
  }
  return hash.toString(16);
}
```

`Math.imul`で32ビット整数乗算を強制して、float64変換を避けて安定多項式ハッシュにする。外部依存足さずに済む。

### スタック溢れなしbase64変換

```typescript
function getBase64Cached(key: string, buf: ArrayBuffer): string {
  if (base64Cache[key]) return base64Cache[key];
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000; // 32768 octets
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  const b64 = btoa(binary);
  base64Cache[key] = b64;
  return b64;
}
```

`String.fromCharCode(...largeArray)`は引数がコールスタックに載るから大きい画像でスタック溢れを起こしうる。32KB刻みで避ける。結果はキャッシュする。同じ画像のbase64変換はワーカーインスタンスごとに1回だけだ。

---

## STRIPPER.md。逐次awaitの監査

リポジトリに`STRIPPER.md`ファイルがあって、`await`並列化の監査を文書化してる。記されてる例をいくつか挙げる。

- プレイヤープロフィール読み込みはSupabase 3リクエスト直列だった（進行、run要約、実績）。`Promise.all`化した。間に依存なしだ。
- 戦闘終了報酬配布（装飾品と消耗品）は直列だった。同様に並列化した。
- ボタン用セッショントークン作成はグループごとだった。独立グループは今並列作成する。

```typescript
// progressionService.ts。前（直列）
await grantAccessoryDropRewards(...);
await grantConsumableDropRewards(...);

// 後
await Promise.all([
  grantAccessoryDropRewards(...),
  grantConsumableDropRewards(...),
]);
```

革命的じゃないけど、応答1ミリ秒が課金（やコールドスタート寄与）されるサーバーレス文脈では効く。

---

## 永続サーバーなしDiscordボット

![勝利](/images/konosuba-rpg/shot_05_win.webp)

よく誤解される点：Discordボットに永続WebSocket接続は必ずしも要らない。Discordは別案を出す。**Interactions Endpoint URL**だ。HTTPS URLをDiscordに渡すと、各やり取り（スラッシュコマンド、ボタン、オートコンプリート）ごとにPOSTをくれる。

```typescript
// interactions.ts
export async function handleInteractions(c: Context) {
  const body = await c.req.text();
  const isVerified = await verifySignature(c, body); // Ed25519
  if (!isVerified) return c.text("Invalid signature", 401);

  const interaction: Interaction = JSON.parse(body);
  if (interaction.type === 1) return c.json({ type: 1 }); // ping Discord
  if (interaction.type === 2) return handleSlashCommand(...);
  if (interaction.type === 3) return handleButtonInteraction(...);
  if (interaction.type === 4) return handleAutocomplete(...);
}
```

DiscordがPOSTを送って、ハンドラがVercel関数かCloudflare Worker上で50から200ms回って、返して終わりだ。維持する常時接続なし、点けとくサーバーなしだ。Discordボット全体がVercel無料枠ホスティングだ。

Ed25519検証（`discord-interactions`の`verifyKey`）は必須だ。Discordは検証しなきゃいけない署名をヘッダーで送ってくる。しないとエンドポイントを拒否する。

### 特殊アニメ。唯一意図的なawait

```typescript
// handleSpecialButton.ts
await new Promise(resolve => setTimeout(resolve, 3000)); // 3秒
await fetch(`${DISCORD_API_URL}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
  method: "PATCH",
  // ...
});
```

この3秒の自発遅延はSTRIPPER.mdで意図的と文書化されてる。めぐみんの特殊攻撃（Explosion）にはDiscord側アニメがある。メッセージはまず中間ビジュアルで更新されて、3秒後に結果で変更される。Vercel関数が必要以上に長く回る唯一のケースだ。

![特殊攻撃](/images/konosuba-rpg/shot_08_special.webp)

---

## 二平台のデプロイ容易性

同じコードベースが無変更でVercel（Node.js）とCloudflare Workers（V8 isolates）両方で回る。

```typescript
// worker.ts。Cloudflareエントリーポイント
export default {
  fetch(request: Request, env: WorkerBindings): Promise {
    syncBindingsToProcessEnv(env); // CFシークレットをprocess.envへ注入
    return app.fetch(request, env, ctx);
  }
};

// index.ts。VercelやNodeエントリーポイント
const isVercelRuntime = process.env.VERCEL === "1";
if (!isVercelRuntime) { start(); }
```

主な違い：静的アセットだ。Vercelではファイルシステムから読む（`/var/task/assets/`）。Cloudflare Workersでは`ASSETS`バインディング経由だ（CF静的アセット）。HTTPSミラー（`fox3000foxy.com/konosuba-rpg/assets`）へのフォールバック付きだ。`assetLoader.ts`の`getAssetBytes`は両道を扱う。まずファイルシステムを試して、次にfetchだ。

WASM（`@cf-wasm/photon/edge-light`、`@cf-wasm/resvg`）は各ランタイム用に別buildがある。パッケージ名の`edge-light`フラグはCloudflare Workers対応buildを示す。実行時`new WebAssembly.Module()`不可で、WASMはプリコンパイル必須だ。

---

## 進行：XP、レベル、好感度

![ボス、HP650](/images/konosuba-rpg/shot_06_boss.webp)

メタ進行はSupabase無料枠が土台だ。スキーマは`players`テーブル（全局XP、レベル、ゴールド）、`character_progress`（ダクネス、アクア、めぐみんごとのキャラ別XPやレベルや好感度）、`runs`（戦闘履歴）、`inventory_items`、`daily_quests_progress`、`achievements_unlocked`、`game_sessions`を持つ。

進行モデルは単純だ。

```typescript
// characterService.ts
export function computeLevelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1; // 100 XP par niveau
}

export function getLevelFactor(level: number): number {
  return 1 + 0.2 * (level - 1); // +20% stats par niveau
}

export function getAffinityFactor(affinity: number): number {
  const stars = Math.floor(affinity / 20); // 20 points par étoile, 5 étoiles max
  return 1.2 ** stars; // progression exponentielle
}
```

この係数は各`processGame`頭にキャラ stats に適用される。カズマはプレイヤー全局レベルに従う。他3人は各々独自XPやレベルだ。好感度（キャラ紐付きドロップ回収で稼ぐ）は stats を独立に倍増する。

![回復](/images/konosuba-rpg/shot_07_heal.webp)

ドロップ機構は難易度重みのルートテーブルを使う。

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

3スイートある。単体、性能、leakだ。

leakテストは特に直接的だ。

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
  expect(after - before).toBeLessThan(20); // ヒープ増加は最大20MB
});
```

1200回`processGame`を回して、前後で強制GCして、ヒープ差20MB未満だ。通れば`processGame`は漏らさない。レンダーテスト（`renderImage.spec.ts`）は逆に実用的なしきい値下の実行時間を確認する。

`bench.ts`スクリプトで完全パイプラインをプロファイルもする。

```
RENDER_PERF=1 npx tsx bench.ts --runs=20 --warmup=3 --monster=Dragon
```

`RENDER_PERF=1`付きで各サービスの`withPerf`ラッパーがタイミングをログする。

```typescript
export async function withPerf(scope: string, label: string, work: () => Promise): Promise {
  const perf = createPerfLogger(scope);
  if (!perf.enabled) return work(); // 無効ならオーバーヘッドゼロ
  perf.mark(`${label}:start`);
  try { return await work(); }
  finally { perf.done(`${label}:done`); }
}
```

`DEV_MODE`と`RENDER_PERF`が`1`じゃないと`createPerfLogger`はno-opを返す。本番オーバーヘッドゼロだ。

---

## 回すといくらかかるか

- **Vercel無料枠**：帯域100GB、月サーバーレス呼び出し100万回だ。画像レンダーは呼び出し1回に数える。
- **Cloudflare Workers無料枠**：1日10万リクエスト、リクエストあたりCPU時間10msだ（レンダーはWASMで超えうる。だからVercelが主だ）。
- **Supabase無料枠**：ベース500MB、帯域5GBだ。数千プレイヤーに十分だ。

有意な量までバックエンド全体がゼロコストで回る。唯一の摩擦はCloudflare WorkersのCPU制限だ。画像レンダーはWASMでCPU集約的だ。だからVercel主、WorkersをフェイルオーバーCDNにする戦略だ。

---

## 覚えるべき3つ

1. **URLをゲーム状態にする**のはただの素敵裏技じゃない。Discord制約（ボタン100文字制限）が強いたアーキテクチャで、RLE圧縮とフォールバック用セッショントークンのステートレス設計を強制した。制約が設計を決めた。

2. **明示 eviction 付きWASMキャッシュ**：`PhotonImage`はJavaScriptヒープ外に確保して`.free()`なしではGCされない。LRUの eviction に`freePhoton`を繋ぐのはJavaScriptのRAIIだ。コードではさりげないけど、これなしではワーカーが本番で漏れる。

3. **WebSocketなしサーバーレスDiscordボット**：WebSocketゲートウェイ手法より知名度低いけど、ステートレス処理のボット（各やり取りが独立）にはInteractions Endpointが厳密に優れてる。再接続なし、ハートビートなし、維持プロセスなしだ。可用性は向こうの土台側でDiscordが管理する。

---

*リポジトリ：[fox3000foxy/konosuba-rpg](https://github.com/fox3000foxy/konosuba-rpg)*

*カスタム source-available ライセンス。再配布不可、利用無料。*
