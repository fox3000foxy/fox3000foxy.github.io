---
title: "Discordボット完全サーバーレス：HonoとCloudflare Workers"
description: "月50ユーロかかってたDiscordボットをゼロ円に置き換えた方法。interaction endpoints、Hono、Workers、リアルタイム画像レンダー、WebSocketなしの完全ゲーム。"
date: 2026-05-29
tags:
  - discord
  - cloudflare
  - serverless
  - typescript
  - bots
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "lC8f/IQU71+ZgiQsjPBYjRbndxn95MgohPG6vyqYEkxMmvkE2Y4ywsttutNGVR54ailQ99KDqsZ5tjJuJFgtuQ=="
---

## Discordボット完全サーバーレス：HonoとCloudflare Workersでお金ゼロ

昔ながらのDiscordボットの保守に数か月かけた。自分のマシンでね。

WebSocket接続は開きっぱなし。ボットは朝3時に1人で再接続する。変な見方で羊を数えたせいでボットはクラッシュする。請求は増える。

ある日気づいた。**なんで接続を維持するの**って。Discordは興味あるイベントだけPOSTしてくれる。返せば終わりだ。

2021年からDiscordは**interaction endpoints**を出してる。

ただのHTTPだ。WebSocketなし、永続状態なしで働く。リクエスト受けて、JSON返して、終わりだ。次のリクエストは1人で来る。

最高なのは、Cloudflare Workersが1日10万リクエストまで**無料**なことだ。9割のボットは月0円だ。

この記事ではHono（超軽量ウェブフレームワーク）とCloudflare WorkersでWebSocketなしDiscordボットを作る方法を示す。実在2プロジェクトを見せる。**Nibi**（日本語学習ボット、TTS、かっこいい）と**Konosuba-RPG**（リアルタイム画像レンダー付き完全なDiscordゲーム）だ。

## WebSocket対Interaction Endpoints：なぜ悪い考えだったか

遊んでないときも接続を開いたままにしなきゃいけないMinecraftゲームを想像して。

サーバーはクラッシュするたび自動再接続する。タイムアウトも指数バックオフ再接続も、大嫌いな定型ボイラープレート全部を管理しなきゃいけない。ただやり取りを受け取るためだけにね。

interaction endpointsは逆だ。Discordが君のURLにPOSTする。返せば終わりだ。

サーバーがクラッシュしたら？Discordは2、3回リトライして先に行く。ドラマゼロだ。

**前のコスト**：Nodeプロセスを生かしとくだけでHerokuに月50ユーロだ。

**後のコスト**：1日10万リクエストまでCloudflareで月0円だ。

## アーキテクチャ：結局何なの

Discordが君のエンドポイントにリクエストをPOSTする。

```plaintext
Discord：「ねえ！ユーザーが/ping押したよ！」
      ↓
   君のURL（Cloudflare Worker）
      ↓
本当にDiscordか確認する（署名チェック）
      ↓
やり取り種別をパースする
      ↓
ハンドラを実行する
      ↓
JSONを返す
      ↓
Discord：「いいね、ユーザーに表示するね」
```

純HTTPで、最小で読みやすいスタックだ。

## HonoとCloudflare Workers：倹約コンビ

**Hono**は12KBのウェブフレームワークだ。どこでも動く。Cloudflare Workers、Vercel、AWS Lambda、Deno、Bunなど。同じコードがどこでもだ。

Cloudflare Workersはエッジのコンピュートだ。リクエストは最寄りサーバーに届く。応答時間は100ms未満だ。コストは1日10万リクエストまで無料だ。

HonoとCloudflareの組み合わせはDiscordボットにぴったりだ。

完全ボットの最小コードはこうだ。

```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. ヘッダーを取る
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. 本当にDiscordか確認する（スパムじゃない）
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3. 送ってきたものをパースする
  const interaction = JSON.parse(body);

  // 4. 種別で返す
  if (interaction.type === 1) {
    // Discordテスト（PING）
    return c.json({ type: 1 });
  }

  if (interaction.type === 2) {
    // スラッシュコマンドだ
    const name = interaction.data.name;
    if (name === 'ping') {
      return c.json({
        type: 4,
        data: { content: 'Pong!' }
      });
    }
  }

  return c.json({ type: 4, data: { content: 'Unknown command' } });
});

export default app;
```

30行で動くボットになる。

`bot.login()`もイベントエミッタもコールバック地獄も忘れる。HTTPだけ残す。

Cloudflareへのデプロイはこうだ。

```plaintext
npm install -D wrangler
npx wrangler deploy
```

はい。`https://mon-bot.workers.dev/interactions`みたいなURLができる。

Discord Developer Portalの「INTERACTIONS ENDPOINT URL」にこれを入れる。Discordがやり取りをそこに送り始める。

## 署名を検証する：偽リクエストなし

Discordは各リクエストに公開鍵で署名する。悪い署名のリクエストを受けたら？スパムだ。無視して続ける。

`discord-interactions`パッケージが仕事する。

```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // 正確な生テキスト（パース済みJSONじゃない！）
  signature,         // x-signature-ed25519ヘッダー
  timestamp,         // x-signature-timestampヘッダー
  publicKey          // Discord Dev Portalから
);
```

**大事な罠**：署名は正確なbodyに依存する。JSONパースして再stringifyしたり、bodyをログに出したりしたら署名が壊れる。

先に検証する。後にパースする。この順序が大事だ。

## ケース1：Nibi（日本語学習ボット）

Nibiは日本語学習用Discordボットだ。単純コマンドだ。

*   `/dictionary kanji` → 定義を表示
*   `/pronounce テキスト` → TTS（text-to-speech）を生成
*   `/hello` → あいさつメッセージ

各コマンドはTypeScriptファイル1つだ。

```plaintext
src/commands/
├── dictionary.ts
├── pronounce.ts
├── hello.ts
└── ...
```

コマンドはこのインターフェースを実装する。

```typescript
interface Command {
  data: {
    name: string;
    description: string;
    options?: SlashCommandOption[];
  };
  execute(
    interaction: Interaction,
    env: Bindings
  ): Promise<interactionresponse>;
}
```

### /pronounceコマンド：ボットに話させる

いちばん変なやつだ。テキストを送る（romaji、ひらがな、漢字、何でも）。ボットはひらがなに変換して、VOICEVOXかGoogle TTS経由でTTSを生成して、Discordに音声メッセージを送る。

```typescript
const pronounce: Command = {
  data: {
    name: 'pronounce',
    description: '日本語テキスト用TTSを生成',
    options: [
      {
        type: 3,  // STRING
        name: 'text',
        description: '読ませるテキスト',
        required: true
      }
    ]
  },

  async execute(interaction, env) {
    const text = interaction.data.options[0].value;

    try {
      // 1. romajiからひらがなへKuroshiroで変換
      const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });

      // 2. TTS音声を生成
      const audioBuffer = await generateTTS(hiragana);

      // 3. ファイルをDiscordへアップロード
      const uploadFilename = await uploadToDiscord(
        audioBuffer,
        interaction.channel.id,
        env.BOT_TOKEN
      );

      // 4. 音声付きメッセージを送る
      await sendVoiceMessage(
        interaction.channel.id,
        uploadFilename,
        audioBuffer.length / 16000,  // 秒単位の長さ
        env.BOT_TOKEN
      );

      return {
        type: 4,
        data: { content: `「${text}」の発音` }
      };
    } catch (err) {
      return {
        type: 4,
        data: {
          content: 'Erreur : impossible de générer l\'audio xD',
          flags: 64  // ephemeral（プライベートメッセージ）
        }
      };
    }
  }
};
```

すごいよね。外部APIを呼んで、ファイルをDiscordにアップロードして、ファイル付きメッセージを送る。WebSocketなしで全部HTTPだけだ。

### Supabaseによる永続化

NibiはSupabaseをkey-valueストアとして使う。ユーザーが登録済みか確認するためだ。

```typescript
const DatabaseUtils = new DatabaseUtils({
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY
});

const users = await DatabaseUtils.readJson('users');
const user = users.find(u => u.id === interaction.member.user.id);

if (!user) {
  // ユーザーを追加
  users.push({ id: interaction.member.user.id, verified: true });
  await DatabaseUtils.writeJson('users', users);
}
```

とても基本的だ（本物SQLクエリじゃなくただのJSON）。でも動く。小さいボットには最適だ。

## ケース2：Konosuba-RPG（画像レンダー付きDiscordゲーム）

はいこれはすごい。

Konosuba-RPGはDiscord上の**完全なゲーム**だ。モブと戦って、XP稼いで、装飾品付けて、レベル上げる。各バトルが**画像**をリアルタイム生成する。事前レンダーしたスプライトシートは避ける。画像はプレイヤー stats とモブと戦闘状態から動的合成される。

画像生成はCloudflare Workers上で500ms未満だ。文字通りね。

### レンダーのアーキテクチャ

```plaintext
Discord（「Attack」押す）
    ↓
Cloudflare Workerがやり取りを受ける
    ↓
ゲーム状態を更新する（XP、HPなど）
    ↓
SatoriでJSXを生成する
    ↓
Resvg（Wasm）でSVGからPNGへ変換する
    ↓
画像をDiscordへアップロードする
    ↓
画像付きメッセージを送る
```

全部1秒未満だ。やばい。

### Workers側の画像レンダー

Konosubaは**Satori**（JSXからSVG）と**Resvg**（SVGからPNG）を使う。

```typescript
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. UI用JSXを作る
  const jsx = (
    <div style="{{" display:="" 'flex',="" gap:="" '20px'="" }}="">
      <div>
        <h1>{gameState.player.name}</h1>
        <p>HP: {gameState.player.hp}/{gameState.player.maxHp}</p>
      </div>
      <div>
        <h1>{gameState.enemy.name}</h1>
        <p>HP: {gameState.enemy.hp}/{gameState.enemy.maxHp}</p>
      </div>
    </div>
  );

  // 2. JSXからSVGへ
  const svg = await satori.render(jsx, {
    width: 1200,
    height: 800,
    fonts: [/* ... */]
  });

  // 3. SVGからPNGへ
  const png = resvg.render(svg).asPng();

  return png;  // Uint8Array
}
```

普通のJSXを書く。SVGになる。SVGがPNGになる。Cloudflare Worker上で100ms未満だ。

強さ分かる？ただ美しい。

### ゲーム状態と進行

プレイヤーデータはSupabaseにある。

```typescript
const player = await db
  .from('players')
  .select('*')
  .eq('discord_id', interaction.user.id)
  .single();

// プレイヤーが勝った
const { data: updated } = await db
  .from('players')
  .update({
    level: player.level + 1,
    xp: player.xp + xpGain
  })
  .eq('id', player.id);
```

各行動（攻撃、防御、回復）がDBの stats を更新する。次に新しい stats で画像を作り直す。

### やり取り：ゲームプレイのボタン

ゲームは戦闘行動に**ボタンやり取り**を使う。

```typescript
{
  type: 1,  // ActionRow
  components: [
    {
      type: 2,  // Button
      style: 1,  // Primary（青）
      label: 'Attack',
      custom_id: 'battle_attack'
    },
    {
      type: 2,
      style: 2,  // Secondary（グレー）
      label: 'Defend',
      custom_id: 'battle_defend'
    }
  ]
}
```

「Attack」を押すと、Discordは`custom_id: 'battle_attack'`付きやり取りをPOSTする。ハンドラが振り分ける。

```typescript
if (interaction.type === 3) {
  // Component interaction（ボタンクリックなど）
  const customId = interaction.data.custom_id;

  if (customId === 'battle_attack') {
    return await handleAttack(interaction, env);
  }
  if (customId === 'battle_defend') {
    return await handleDefend(interaction, env);
  }
}
```

はい、ダメージ計算して、ベース更新して、画像作り直して、送る。

接続永続なしの完全ターンベースゲームだ。ただのステートレスHTTPだ。完全にどうかしてる。

## Supabase：Workers向けDB

古典DB（PostgreSQL、MySQL、MongoDB）は永続TCP接続向けに設計されてる。ソケット開いて、接続を開いたままにして、クエリを送る。問題はこうだ。**Cloudflare Workersは永続TCP接続に対応してない**。各リクエストは儚いプロセスだ。クライアントに返したらWorkerは消える。

これはできない。

```typescript
// Workersでは動かない
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // 永続TCP接続は死ぬ
```

`pg`や`postgres.js`みたいなネイティブPostgreSQLドライバーもTCP接続を使う。Workersでは落ちる。

**Supabaseが全部解く。**

SupabaseはPostgreSQLの上のREST APIだ。普通のHTTPリクエストをする。各呼び出しは独立で、永続接続なし、管理する状態なしだ。サーバーレスモデルにぴったりだ。

```typescript
// Workersでは完璧に動く
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

Supabaseクライアント（`@supabase/supabase-js`）は中で`fetch`を使う。`fetch`はWorkersネイティブだ。設定ゼロ、ドライバーゼロ、永続接続ゼロだ。

| データベース | Workers対応？ | 理由 |
| --- | --- | --- |
| **Supabase** | ✅ 対応 | ステートレスREST API、純HTTP |
| **PlanetScale（MySQL）** | ⚠️ 部分 | HTTPS接続のみ、長いトランザクションなし |
| **Neon** | ⚠️ 部分 | サーバーレスブランチあるけどTCPドライバー必要 |
| **Turso（libSQL）** | ⚠️ 部分 | HTTP可能だけど制限あり |
| **Prisma/Prisma Postgres** | ❌ 非対応 | 永続TCP必要 |
| **MongoDB Atlas** | ❌ 非対応 | TCPドライバー、ネイティブREST APIなし |
| **Redis（Upstash）** | ✅ 対応 | HTTP REST API |

Supabaseの本当の利点はDBだけじゃない。エコシステム全体がedge-firstで考えられてる。

- **Auth**：セッション管理用REST API、ステートレスで動く
- **Storage**：HTTP経由のファイルアップロードやダウンロード
- **Realtime**：WebSocketは任意。REST経由ポーリングもできる
- **Row Level Security**：安全規則はバックエンドじゃなくDB内だ

サーバーレスDiscordボットにはSupabaseがいちばん単純で確実な選択だ。ドライバー設定なし、接続維持なし、タイムアウト管理なしだ。HTTPリクエストを送るだけだ。

本物例が欲しければ上のNibiを見て。永続化コードは文字通りSupabase上の`readJson()`と`writeJson()`だ。マイグレーションなし、複雑スキーマなし、重い設定なしで始める。直接動く。ボットが大きくなったらプロバイダー変えず本物SQLクエリに移行できる。

## ポリフィル：NodeがWorkersで動きたいとき

一部パッケージはNode APIを期待する。Kuromoji（漢字パーサー）は`XMLHttpRequest`を使う。Workersには`fetch`があって`XMLHttpRequest`はない。

単純な解法：index.tsの頭にポリフィルを足す。

```typescript
// kuromoji用XMLHttpRequestポリフィル
if (!globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest = class {
    // 最小スタブ
  } as any;
}
```

専用モジュールにする手もある。

```typescript
// src/utils/polyfills.ts
export function setupPolyfills() {
  if (!globalThis.XMLHttpRequest) { /* ... */ }
  if (!globalThis.Buffer) { /* ... */ }
}

// src/index.ts
import { setupPolyfills } from './utils/polyfills';
setupPolyfills();
```

基本ハックだけど動く。

## npmパッケージへ：hono-discord-interactions

手でボットを作ると定型が大量だ。

*   Discord署名を検証する
*   やり取り種別を振り分ける
*   コマンドやコンポーネントやモーダルを管理する
*   有効JSONを返す

npmパッケージに全部抽象化できる。たとえばこうだ。

```typescript
import { createDiscordHandler } from 'hono-discord-interactions';

const handler = createDiscordHandler({
  publicKey: env.PUBLIC_KEY,
  commands: [
    {
      name: 'ping',
      execute: async (interaction) => ({
        type: 4,
        data: { content: 'Pong!' }
      })
    },
    {
      name: 'hello',
      execute: async (interaction) => ({
        type: 4,
        data: { content: `Hi ${interaction.member.user.username}!` }
      })
    }
  ]
});

const app = new Hono();
app.post('/interactions', handler);
export default app;
```

はい。200行じゃなく20行だ。Nibiは半分くらい減りそうだ。

後日のアイデアだ。

## デプロイ

### Cloudflare Workers

```plaintext
npm install -D wrangler

# wrangler.toml
[env.production]
name = "mon-bot"
main = "src/index.ts"

# Secrets
wrangler secret put PUBLIC_KEY --env production
wrangler secret put BOT_TOKEN --env production
wrangler secret put SUPABASE_URL --env production

# Deploy
wrangler deploy --env production
```

結果URL：`https://mon-bot.workers.dev/interactions`

コスト：1日10万リクエストまで**無料**だ。超過は100万件0.50ドルだ。

ネタバレ：アクティブユーザー1万人いない限り10万リクエストは使わない。

### Vercel

```plaintext
npm run vercel:deploy
```

URL：`https://mon-bot-xyz.vercel.app/api/interactions`

同じく無料だ。

### 両方同時に

Honoはどこでも動く。同じコードをCloudflareとVercel両方にデプロイできる。冗長や選ぶ前の試しに便利だ。

## 簡単チェックリスト

1.  Discord Developer Portalでアプリケーションを作る
2.  PUBLIC\_KEY、BOT\_TOKEN、APP\_IDをコピーする
3.  プロジェクトを作る：
4.  index.tsを書く（署名検証と振り分け）
5.  スラッシュコマンドを登録する（1回）：
6.  デプロイ：
7.  URLをDiscordに入れる（Developer PortalからApplicationからInteractions Endpoint URL）
8.  Discordが接続をテストする（PINGに返さなきゃいけない）
9.  ボットをサーバーに招く
10.  終わり

## 利点対制限

**利点**

*   最小コスト（1日10万リクエストまで無料）
*   スケーラブル（接続管理なし）
*   単純（WebSocket定型なし）
*   高速（Cloudflareはエッジサーバー）
*   可搬（Honoコードは複数ホスト）

**制限**

*   受け取れるのはやり取りだけだ（スラッシュコマンド、ボタン、モーダル）。サーバーのリアルタイムイベントはなし（参加、役職追加、メッセージ削除など）
*   応答タイムアウト3秒。超えたらDiscordは「Application did not respond」を出す
*   本物イベントが要るなら、別のHTTPウェブフックか補助WebSocket接続が要る

9割のボット（全部スラッシュコマンド基準）にはこれでいい。

## 結びに

KonosubaRPGとNibiの最適化にかなり時間かけた。リクエスト数をできるだけ節約したり、ホットCPU時間を減らしたり、コールドブートを減らしたりするためだ。結果、ほぼ全部でなかなかの性能が出た。
クラウド化したのは、自分のVMでホストし続けるのが途方もなくめんどくさかったからだって知っとくべきだ。本当、Github Actionsが私を救ってくれたと思う。workersもね。でも実際Github Actionsとスケジュールでデーモンが作れるって見たとき、本当に救われたよ。

[email-autoreply](https://github.com/fox3000foxy/email-autoreply/)ってプロジェクトの記事をたぶん書くから、公開されたら見るためRSS購読してね :))。

**覚えるべき3点：**

1.  **Interaction endpointsはHTTPサーバーレスだ**。WebSocketなし、永続接続なしだ。DiscordがPOSTして、返せばいい。Cloudflareでは無料だ。
2.  **Honoが最適道具だ**。軽量フレームワーク（12KB）、マルチランタイム、依存ゼロだ。CloudflareでもVercelでもNodeでもどこでも同じコードだ。
3.  **Workers上の画像レンダーはすごい**。SatoriとResvg（Wasm）でJSX動的UIを組んで100ms未満でPNG変換できる。完全ゲームがこれで回る。

やばい。

```plaintext
wrangler deploy
```

```plaintext
npm run register-commands
```

```plaintext
npm init -y
npm install hono discord-interactions
npm install -D wrangler typescript
```
