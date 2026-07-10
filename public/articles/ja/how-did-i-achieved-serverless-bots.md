---
title: 100%サーバーレスDiscordボット：Hono + Cloudflare Workers
description: 月50€かかってたDiscordボットをゼロユーロにした方法 --
  インタラクションエンドポイント、Hono、Workers、リアルタイム画像レンダリング、WebSocketなしの完全なゲーム。
date: 2026-05-29
tags:
  - discord
  - cloudflare
  - serverless
  - typescript
  - bots
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "MEQCIFRprruXNdAJTcKnzNHQzQTGDYi+FffzuXbsjWpdkOpCAiARuv5xjmNYAS4wInzY5/ceBCvU+tZ01fiBUDZXurL49Q=="
---

## Discord bot 完全サーバーレス : Hono + Cloudflare Workers = 💸 ゼロ

何ヶ月か自宅マシンで普通のDiscord botを動かし続けてたんだよね。

WebSocket接続は常時開きっぱなし。朝の3時に勝手に再接続するbot。羊を変な目で見ただけでbotがクラッシュする。請求書が上がっていく。

ある日気づいたんだ：**なんで接続を維持する必要あんの？** Discordは興味あるやつだけPOSTしてくれる。返事すれば終わり。

2021年からDiscordは**interaction endpoints**を提供してる。

ただのHTTP。WebSocketなし。永続ステートなし。リクエストを受け取って、JSON返して、終わり。次のリクエストは勝手に来る。

で、最高なのは：Cloudflare Workersが**無料**で1日10万リクエストまで。90%のbotなら月0€。

この記事ではWebSocketなしでDiscord botを作る方法を紹介するよ。使うのは**Hono**（超軽量Webフレームワーク）と**Cloudflare Workers**。実際の2つのプロジェクトを見せていく：**Nibi**（日本語学習bot、TTS付き、かっこいい）と**Konosuba-RPG**（画像レンダリングするDiscordの_フル_ゲーム xD）。

## WebSocket vs. Interaction Endpoints : なんでダメだったのか

プレイしてない時も接続を開きっぱなしにしなきゃいけないMinecraftを想像してみてよ。

しかもサーバーがクラッシュするたびに自動で再接続するんだぜ。タイムアウト処理して、指数バックオフして、誰も好きじゃないクソったれなボイラープレートを全部やらなきゃいけない。ただのインタラクションを受け取るためだけに。

Interaction endpointsは真逆。DiscordがURLにPOSTする。お前が返事する。終わり。

サーバーがクラッシュしたら？ Discordが2-3回リトライして次行く。ドラマゼロ。

**前のコスト**: HerokuでNodeプロセス生かしておくだけで月50€。

**後のコスト**: Cloudflareだと1日10万リクエストまで月0€。

## アーキテクチャ : 実際どういうこと？

Discordがお前のエンドポイントにリクエストをPOSTする。

```plaintext
Discord: "なあ！ユーザーが /ping をクリックしたぞ！"
      ↓
   お前のURL (Cloudflare Worker)
      ↓
   本当にDiscordか確認する (署名チェック)
      ↓
   インタラクションタイプをパース
      ↓
   ハンドラを実行
      ↓
   JSONを返す
      ↓
   Discord: "よし、これをユーザーに表示するぜ"
```

純粋なHTTP。魔法なし。重いライブラリなし。

## Hono + Cloudflare Workers : ケチケチコンボ

**Hono**は12KBのWebフレームワーク。どこでも動く：Cloudflare Workers、Vercel、AWS Lambda、Deno、Bun...同じコードがどこでも動く。

Cloudflare Workersはエッジでのコンピューティング。リクエストは一番近いサーバーに届く。応答時間：\<100ms。コスト：1日10万リクエストまで無料。

Hono + CloudflareのコンボはDiscord botに完璧。

これが完全なbotの最小コード：

```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. ヘッダーを取得
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. 本当にDiscordか確認（スパム対策）
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3. 送られてきたものをパース
  const interaction = JSON.parse(body);

  // 4. タイプに応じて応答
  if (interaction.type === 1) {
    // Discordのテスト（PING）
    return c.json({ type: 1 });
  }

  if (interaction.type === 2) {
    // スラッシュコマンド
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

30行くらいで動くbotができる。

`bot.login()` もいらない。イベントエミッターもいらない。コールバック地獄もいらない。ただのHTTP。

Cloudflareにデプロイするには：

```plaintext
npm install -D wrangler
npx wrangler deploy
```

Boom。`https://mon-bot.workers.dev/interactions` みたいなURLができる。

それをDiscord Developer Portalの"INTERACTIONS ENDPOINT URL"に入れるだけで、Discordがそこにインタラクションを送り始める。

## 署名の検証 : 偽リクエストの防止

Discordは全リクエストに公開鍵で署名してる。もし間違った署名のリクエストが来たら？ それはスパム。無視して次行け。

`discord-interactions` パッケージがやってくれる：

```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // 生のテキストそのまま（パースしたJSONじゃない！）
  signature,         // x-signature-ed25519 ヘッダー
  timestamp,         // x-signature-timestamp ヘッダー
  publicKey          // Discord Dev Portalから
);
```

**重要な落とし穴**: 署名は_正確な_ボディに依存してる。JSONパースして再stringifyしたり、bodyをログに出したりすると署名が壊れる。

先に検証。後でパース。この順番が大事。

## ケース1 : Nibi（日本語学習bot）

NibiはDiscordで日本語を学ぶためのbot。シンプルなコマンド：

*   `/dictionary kanji` → 定義を表示
*   `/pronounce テキスト` → TTS（テキスト読み上げ）生成
*   `/hello` → ウェルカムメッセージ

各コマンドが1つのTypeScriptファイル：

```plaintext
src/commands/
├── dictionary.ts
├── pronounce.ts
├── hello.ts
└── ...
```

コマンドはこのインターフェースを実装する：

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
  ): Promise<InteractionResponse>;
}
```

### /pronounce コマンド : botに喋らせる

これがめっちゃヤバいやつ。テキスト（ローマ字、ひらがな、漢字、何でも）を送ると、botがひらがなに変換して、VOICEVOXかGoogle TTSでTTS生成して、Discordに音声メッセージを送る。

```typescript
const pronounce: Command = {
  data: {
    name: 'pronounce',
    description: '日本語テキストのTTSを生成',
    options: [
      {
        type: 3,  // STRING
        name: 'text',
        description: '発音するテキスト',
        required: true
      }
    ]
  },

  async execute(interaction, env) {
    const text = interaction.data.options[0].value;

    try {
      // 1. ローマ字 → ひらがなに変換（Kuroshiro使用）
      const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });

      // 2. TTS音声を生成
      const audioBuffer = await generateTTS(hiragana);

      // 3. Discordにファイルをアップロード
      const uploadFilename = await uploadToDiscord(
        audioBuffer,
        interaction.channel.id,
        env.BOT_TOKEN
      );

      // 4. 音声付きメッセージを送信
      await sendVoiceMessage(
        interaction.channel.id,
        uploadFilename,
        audioBuffer.length / 16000,  // 秒単位の再生時間
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
          content: 'エラー : 音声生成できなかった xD',
          flags: 64  // ephemeral（プライベートメッセージ）
        }
      };
    }
  }
};
```

やばくない？ 外部API呼んで、ファイルをDiscordにアップロードして、そのファイル付きメッセージを送信する。全部WebSocketなし、HTTPだけで。

### Supabaseでの永続化

NibiはSupabaseをkey-valueストアとして使ってる。ユーザーが登録済みか確認するには：

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

めっちゃベーシック（本物のSQLクエリじゃなくてただのJSON）だけど動く。小さいbotには完璧。

## ケース2 : Konosuba-RPG（画像レンダリングするDiscordゲーム）

これマジでヤバい。

Konosuba-RPGはDiscord上の**完全なゲーム**。敵と戦って、経験値稼いで、アクセサリー装備して、レベル上げる。各バトルで**画像**がリアルタイム生成される。事前レンダリングされたスプライトシートなし。プレイヤーのステータス、敵、戦闘状態から動的に画像が構成される。

しかもその画像、Cloudflare Workers上で\<500msで生成される。文字通り。

### レンダリングのアーキテクチャ

```plaintext
Discord（"Attack"をクリック）
    ↓
Cloudflare Workerがインタラクションを受け取る
    ↓
ゲーム状態を更新（XP、HPなど）
    ↓
SatoriでJSXを生成
    ↓
Resvg（Wasm）でSVG → PNGに変換
    ↓
画像をDiscordにアップロード
    ↓
画像付きメッセージを送信
```

全部1秒未満。やばすぎ。

### Workers側での画像レンダリング

Konosubaは**Satori**（JSX → SVG）と**Resvg**（SVG → PNG）を使ってる：

```typescript
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. UI用のJSXを作成
  const jsx = (
    <div style={{ display: 'flex', gap: '20px' }}>
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

  // 2. JSX → SVG
  const svg = await satori.render(jsx, {
    width: 1200,
    height: 800,
    fonts: [/* ... */]
  });

  // 3. SVG → PNG
  const png = resvg.render(svg).asPng();

  return png;  // Uint8Array
}
```

普通のJSXを書く。それがSVGになる。SVGがPNGになる。Cloudflare Workerで\<100ms。

このパワー分かる？ ただただ...美しい xD

### ゲーム状態と進行

プレイヤーデータはSupabaseに保存：

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

各アクション（攻撃、防御、回復）でDBのステータスを更新。そして新しいステータスで画像を再生成。

### インタラクション : ゲームプレイのボタン

ゲームは戦闘アクションに**ボタンインタラクション**を使ってる：

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

"Attack"をクリックすると、Discordが `custom_id: 'battle_attack'` 付きのインタラクションをPOSTする。ハンドラがルーティング：

```typescript
if (interaction.type === 3) {
  // コンポーネントインタラクション（ボタンクリックなど）
  const customId = interaction.data.custom_id;

  if (customId === 'battle_attack') {
    return await handleAttack(interaction, env);
  }
  if (customId === 'battle_defend') {
    return await handleDefend(interaction, env);
  }
}
```

で、ダメージ計算して、DB更新して、画像再生成して、送信。

接続の永続化ゼロの完全ターン制ゲーム。ただのステートレスHTTP。完全にぶっ壊れてる xD

## Supabase: Workersのために作られたデータベース

従来のデータベース（PostgreSQL、MySQL、MongoDB）は永続的なTCP接続のために設計されている。ソケットを開いて、接続を維持して、クエリを送る。問題：**Cloudflare Workersは永続的なTCP接続をサポートしていない**。各リクエストは一時的なプロセスで、クライアントに応答した瞬間にWorkerは消える。

こんなことはできない：

```typescript
// これはWorkersでは動かない
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // 永続TCP接続 = 死
```

`pg`や`postgres.js`のようなネイティブなPostgreSQLドライバーでさえTCP接続を使っている。Workersではクラッシュする。

**Supabaseが全部解決する。**

SupabaseはPostgreSQLの上にあるREST API。普通のHTTPリクエストを送るだけ。各呼び出しは独立していて、永続接続不要、管理する状態もなし。サーバーレスモデルに完全に適合してる。

```typescript
// これはWorkersで完全に動く
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

Supabaseクライアント（`@supabase/supabase-js`）は内部で`fetch`を使ってる。そして`fetch`はWorkersでネイティブ。設定ゼロ、ドライバーゼロ、永続接続ゼロ。

| データベース | Workers対応？ | 理由 |
| --- | --- | --- |
| **Supabase** | ✅ はい | ステートレスREST API、純粋HTTP |
| **PlanetScale (MySQL)** | ⚠️ 一部 | HTTPSのみ、長いトランザクション不可 |
| **Neon** | ⚠️ 一部 | サーバーレスブランチだがTCPドライバーが必要 |
| **Turso (libSQL)** | ⚠️ 一部 | HTTP可能だが制限あり |
| **Prisma/Prisma Postgres** | ❌ いいえ | 永続TCPが必要 |
| **MongoDB Atlas** | ❌ いいえ | TCPドライバー、ネイティブREST APIなし |
| **Redis (Upstash)** | ✅ はい | HTTP上のREST API |

Supabaseの本当の利点はDBだけじゃない -- エコシステム全体がエッジファーストで設計されてること：

- **Auth**: セッション用REST API、ステートレスで動作
- **Storage**: HTTP経由でファイルアップロード/ダウンロード
- **Realtime**: オプションのWebSocket、REST経由のポーリングも可能
- **Row Level Security**: セキュリティルールはDB側にあり、バックエンドには不要

サーバーレスDiscordボットには、Supabaseが最もシンプルで信頼できる選択肢。設定するドライバーなし、維持する接続なし、タイムアウトなし。ただのHTTPリクエスト。

実際の例が見たいなら、上のNibiを見てみて：その永続化コードは文字通りSupabase上の`readJson()`と`writeJson()`。マイグレーションなし、複雑なスキーマなし、狂った設定なし。箱から出してすぐ動く。そしてボットが大きくなったら、プロバイダーを変えずに本物のSQLクエリに移行できる。

## ポリフィル : NodeがWorkersで動こうとする時

一部のパッケージはNode APIを期待してる。Kuromoji（漢字パーサー）は `XMLHttpRequest` を使ってる。Workersには `fetch` はあるけど `XMLHttpRequest` はない。

シンプルな解決策：index.tsの先頭にポリフィルを追加：

```typescript
// kuromoji用のXMLHttpRequestポリフィル
if (!globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest = class {
    // 最小限のスタブ
  } as any;
}
```

または専用モジュールにする：

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

ベーシックなハックだけど動く。

## npmパッケージ化に向けて : hono-discord-interactions

手動でbotを作るのはボイラープレートが多い：

*   Discord署名の検証
*   インタラクションタイプのルーティング
*   コマンド、コンポーネント、モーダルの処理
*   有効なJSONの返却

これらを全部npmパッケージに抽象化できる。こんな感じ：

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

Boom。200行が20行に。Nibiのコードが簡単に半分になる。

後でやるかもな xD

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

結果のURL：`https://mon-bot.workers.dev/interactions`

コスト：1日10万リクエストまで**無料**。超えると月$0.50/100万。

ネタバレ：アクティブユーザー1万人いない限り10万リクエスト超えないから。

### Vercel

```plaintext
npm run vercel:deploy
```

URL：`https://mon-bot-xyz.vercel.app/api/interactions`

同じく無料。

### 両方同時に

Honoはどこでも動く。同じコードをCloudflareとVercelの両方にデプロイできる。冗長化とか、選ぶ前にテストするのに便利。

## クイックチェックリスト

1.  Discord Developer Portalでアプリケーションを作成
2.  PUBLIC\_KEY、BOT\_TOKEN、APP\_IDをコピー
3.  プロジェクトを作成：
4.  index.tsを書く（署名検証 + ルーティング）
5.  スラッシュコマンドを登録（1回だけ）：
6.  デプロイ：
7.  URLをDiscordに設定（Developer Portal → アプリケーション → Interactions Endpoint URL）
8.  Discordが接続テスト（PINGに応答する必要あり）
9.  botをサーバーに招待
10.  完了

## メリット vs 制限

**メリット**

*   安い（1日10万リクエストまで無料）
*   スケーラブル（接続管理不要）
*   シンプル（WebSocketのボイラープレートなし）
*   高速（Cloudflare = エッジサーバー）
*   ポータブル（Honoコード = 複数のホスト）

**制限**

*   リアルタイムサーバーイベントなし（メンバー参加、ロール追加、メッセージ削除など）-- 受け取れるのはインタラクションのみ（スラッシュコマンド、ボタン、モーダル）
*   応答のタイムアウト3秒 -- 超えるとDiscordが「Application did not respond」と表示
*   本当のイベントが必要なら -- 別のHTTPウェブフックか補助的なWebSocket接続が必要

90%のbot（スラッシュコマンドベースの全部）なら？ これで十分。

## まとめ

KonosubaRPGとNibiの最適化にかなり時間を費やしたよ。できるだけリクエストを節約するためだったり、処理時間を削るためだったり、コールドブートを減らすためだったり。結果、ほぼ全部で結構なパフォーマンスが出てる。  
実は自分のVMでホストし続けるのがめっちゃ面倒くさくなって、ほとんどのプロジェクトをクラウド化（この言葉正しいか知らんけど）し始めたんだよね。ホント、GitHub Actionsに命救われたわ。Workersもだけど、GitHub Actionsとスケジュールでデーモン作れるの知った時はマジで助かった。

[email-autoreply](https://github.com/fox3000foxy/email-autoreply/)ってプロジェクトの記事も書くと思うから、RSSフィード登録して待っててね :))。

**覚えておくべき3つのこと：**

1.  **インタラクションエンドポイント = HTTPサーバーレス** -- WebSocketなし、永続接続なし。DiscordがPOST、お前が応答。Cloudflareで無料。
2.  **Honoが完璧なツール** -- 軽量フレームワーク（12KB）、マルチランタイム、依存関係ゼロ。Cloudflare、Vercel、Node、どこでも同じコード。
3.  **Workersでの画像レンダリング = ヤバい** -- Satori + Resvg（Wasm）で動的UIをJSXで構成して\<100msでPNGに変換できる。完全なゲームがこれで動く。

マジでヤバい xD

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
