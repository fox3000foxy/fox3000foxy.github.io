---
title: "超リアルなExpressハニーポットを作った"
description: "その場生成応答付き328偽エンドポイント、ヘッダースプーフィング、ボットトラフィックのロギング。スキャナーを騙すために設計したExpressハニーポットミドルウェアの中身。"
date: 2026-06-10
aiGenerated: true
tags:
  - express
  - nodejs
  - security
  - honeypot
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "+rDCtcmtovcVMtsY8Z0tnvPez3O9rWod0xI51ZihGrqW+Op8eIsPSnLijBBvTanTVO8H5G0Uyf6jY9EY/FjeEg=="
---

## TL;DR

2変種から選べる**328の偽エンドポイント**を出すExpressミドルウェアを作った。`default`（簡潔だが信用できる応答）と`complete`（とても詳細な応答）だ。各応答は新鮮なタイムスタンプとリクエストID付きで**その場生成**される。各応答が一意になる。ディスクにモックファイルはない。ミドルウェアはトラフィックをテキストファイルに**記録**もできて、未処理ルートを`/newBotsRoute`に出してボットが何を探してるか分析できる。

**ただ404を返すのとは段違いだ。** 本物のサーバーに見えるよう設計した工学的部品で、スキャナーに時間を無駄遣いさせる。仕組みを見せるよ。

## 問題

セキュリティボットもスクレイパーも悪性アクターも、よくあるルートを探してウェブサーバーを常にスキャンしてる。

- `.env`、`wp-config.php`、`admin/`、`phpinfo.php`など
- `/api/version`、`/api/config`みたいなAPIエンドポイント
- 設定ファイル：`dump.sql`、`.git/config`、`docker-compose.yml`
- 銀行フィッシングページ：`/lander/sberbank*`、`/index_sber.php`

この限界は自分のサーバーで見た。404や403を返すとスキャナーはそのルートがないと即分かって次に行く。このハニーポットでは逆を選んだ。**スキャナーに全部あると思わせる**んだ。本物のサーバーは既知ルートの後ろで守られてる間に、偽応答に時間を溶かさせる。

## アーキテクチャ

### 1. ルックアップテーブルじゃなく分類器

中心部品は`src/services/mockupGenerator.ts`の`classify()`関数で、エンドポイントパスを受けて応答ジェネレータを返す。ルールのカスケードとして作った。

1. **完全一致**：よくあるエンドポイントは専用ジェネレータ
2. **パターン一致**：パスへの正規表現で`id_rsa`や`wp-admin`や`sitemap.xml`みたいな模様を検出
3. **賢い分類**：`/262LBNFp`みたいなパス（6文字以上のランダム）は「C2ハートビート」に分類
4. **包括ルール**：APIパス、`.php`や`.html`や`.js`や`.json`や`.asmx`ファイルは汎用ジェネレータ
5. **最終キャッチオール**：`genCatchall()`がメタデータ付き汎用JSON応答を作る

この手法が好きなのは応答がリクエストごとに**新鮮**だからだ。静的ファイルなし、キャッシュなし、各応答が本物のサーバーから来たみたいに自分のタイムスタンプを持つ。

### 2. 二変種システム

各ジェネレータは2変種に対応する。

```typescript
type Variant = "default" | "complete";
```

- **`default`**：簡潔だが信用できる応答。`.env`の例：
  ```
  DB_HOST=localhost
  DB_USER=root
  DB_PASS=s3cur3P@ss
  APP_ENV=development
  APP_DEBUG=true
  ```

- **`complete`**：とても詳細な応答。`.env`の例：
  ```
  # Database
  DB_CONNECTION=mysql
  DB_HOST=db-master-01.internal.example.com
  DB_PORT=3306
  DB_DATABASE=production_app_v2
  DB_USER=admin_service
  DB_PASS=mM9k#2$xL!qR7pZ

  # Redis
  REDIS_HOST=redis-cluster-01.internal.example.com
  REDIS_PORT=6379
  REDIS_PASSWORD=R3d!s_S3cur3_K3y_2025

  # App
  APP_ENV=production
  APP_DEBUG=false
  APP_URL=https://admin.internal.example.com
  APP_KEY=base64:qJ3fR8mL2pX5vB7nC4kA9wE1yH6sD0tG
  ...
  ```

`complete`変種はCSS付き完全HTMLページも含む。管理画面、WordPressログイン画面、ロシア語銀行フィッシングページなどだ。スキャナーを本当に足止めしたいときに強力だと思う。

### 3. その場生成

`Date.now()`と`Date().toISOString()`で呼び出しごとに一意のタイムスタンプとリクエストIDを作る。enrich関数はこうだ。

```typescript
function enrichResponse(response: Record<string, unknown>): Record<string, unknown> {
  return {
    ...response,
    timestamp: getTimestamp(),
    version: "1.0",
    lastUpdated: getTimestamp(),
  };
}
```

JSON応答ではミドルウェアがパースしてこのフィールドでenrichを試みる。非JSON応答はそのまま返す。

### 4. ヘッダースプーフィング用ミドルウェア

要求ファイル拡張子に応じた現実的なHTTPヘッダーを立てる専用ミドルウェアを足した。

```typescript
res.setHeader("Server", "nginx/1.24.0");
res.setHeader("X-Frame-Options", "SAMEORIGIN");
res.setHeader("X-XSS-Protection", "1; mode=block");
res.setHeader("X-Content-Type-Options", "nosniff");
res.setHeader("X-Robots-Tag", "noindex, nofollow");
res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

// 拡張子ベースの現実的X-Powered-By
if (path.endsWith(".php")) res.setHeader("X-Powered-By", "PHP/8.1.12");
else if (path.endsWith(".jsp")) res.setHeader("X-Powered-By", "JSP/3.0");
else if (path.endsWith(".aspx") || path.endsWith(".ashx") || path.endsWith(".asmx"))
  res.setHeader("X-Powered-By", "ASP.NET");
else if (path.endsWith(".do") || path.endsWith(".action"))
  res.setHeader("X-Powered-By", "Servlet/3.0");
```

応答はずっと信用できるようになる。`X-Powered-By: PHP/8.1.12`と`Server: nginx/1.24.0`付き`.php`エンドポイントはまさに本物のWordPressサーバーに見える。偽サーバーを裏切るのはたいていヘッダーだから、この詳細にこだわってる。

### 5. PHPスプーファー

`phpSpoofer`は今もいちばん好きな部品だ。`.php`ファイル宛てリクエストが来てホストがlocalhostなら、ミドルウェアはリクエストをローカルPHPサーバーへ**プロキシ**して、本物のPHPページを処理して返させる。ホストがリモートならSSRF試行を止めるため404を返す。

```typescript
const phpSpoofer = async (req, res, next) => {
  if (!req.path?.match(/\.php$/)) return next();
  const host = req.headers?.host;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]")) {
    const baseUrl = req.originalUrl.replace(/\.php.*$/, "");
    const response = await fetch(`http://${host}${baseUrl}`);
    // 本物のPHP応答を返す
  } else {
    res.status(404).send("404 Not Found");
  }
};
```

ローカルでWordPressを回してると、ハニーポットがボットに**本物の**WordPressページを出すことになる。私の経験では最大の現実感だ。

### 6. トラフィックの記録と分析

2つの責務を分けた。`TrafficService`は各リクエストをJSON-linesファイルに記録する。`UnhandledRoutesService`は後でログを分析して、ハニーポットで未対応のままボットが求めたパスを特定する。

```typescript
app.get("/newBotsRoute", async (_req, res) => {
  const routes = await unhandledRoutesService.getUnhandledRoutes(
    additionalEndpoints, knownPathOptions
  );
  res.setHeader("Content-Type", "text/plain");
  res.send(routes.join("\n"));
});
```

このフィードバックループが大好きだ。ハニーポットを回すほどボットが何を探してるか学べて、そのパスを既知エンドポイントに足せる。

### 7. 既知エンドポイントと除外

ミドルウェアは`knownPaths`、`knownPatterns`、`knownApiPaths`、`knownApiPatterns`のリストを受け付ける。一致するルートは全部ミドルウェアを通り抜けて本物アプリへ行く。このフィルタは必須だと思う。本物エンドポイントは無傷のままで、ハニーポットは絶対横取りしない。

```typescript
const matches = (p) => p === endpoint || p.startsWith(endpoint + "/");
```

## 328エンドポイントの詳細

分類はこうだ（分類器からの抜粋）。

| カテゴリ | エンドポイント例 |
|---|---|
| 認証情報漏れ | `.env`、`secrets.json`、`aws/credentials`、`etc/shadow` |
| SSHキー | `.ssh/id_rsa`、`.ssh/id_ed25519` |
| DB設定 | `config/database`、`wp-config.php`、`docker-compose.yml` |
| 管理パネル | `/admin`、`/wp-admin`、`/manage/account/login` |
| API応答 | `/api/version`、`/api/config`、`.do`、`.ashx` |
| 銀行フィッシング | `/lander/sber*`、`/index_sber.php` |
| C2ハートビート | 6文字以上ランダムパス（`/262LBNFp`） |
| 株や取引所 | `/stock/mzhishu`、`/kline/1m/1`、`/m/allticker/1` |
| ゲームやカジノ | `/proxy/games`、`/Ctrls/GetSysCoin`、`/room/getRoomBangFans` |
| 設定ファイル | `config.json`、`config.yml`、`sitemap.xml`、`ads.txt` |
| ランディングページ | `/about`、`/contact`、`/products`、`/blog` |

## 特殊コードとエンドポイント

特殊ケース用に専用ジェネレータを足した。

- **`genLanding()`**：СберБанк、Тинькофф、Газпромбанк向けロシア語銀行フィッシングページ
- **`genC2Heartbeat()`**：`agent_id`や`group`や`version`付き現実的C2ハートビート応答
- **`genScannerPath()`**：特定スキャナー用罠（NICEのnmapポート、Hazelcast、CGI）
- **`genChineseApi()`**：`msg: "成功"`（成功）付き中国語API応答
- **`genMerchant()`**：`balance`や`fee_rate`や`tier`付き加盟店プロフィール

## 使い方

### インストール

```bash
npm install express-middleware-honeypot
```

### 自動登録の基本利用

```javascript
const { createHoneypot } = require("express-middleware-honeypot");

const app = express();
const instance = createHoneypot({
    knownPaths: ["/", "/login", "/support"],
    knownPatterns: [/^\/blogs\/[^/]+$/],
    knownApiPaths: ["/api/cart", "/api/cart/list"],
    knownApiPatterns: [/^\/api\/cart\/[^/]+$/],
    logTraffic: true,
    is404Handler: true,
    isCompleteResponses: false,
});

instance.register(app);
app.listen(3000);
```

### app.use()付き（単一キャッチオールミドルウェア）

```javascript
const { createHoneypot } = require("express-middleware-honeypot");
const app = express();

// 本物ルートを先に
app.get("/", (req, res) => res.send("Home"));

// 次にキャッチオールハニーポット
const instance = createHoneypot({ /* オプション */ });
app.use(instance.headersMiddleware);
app.use(instance.middleware);
```

### 完全応答とデフォルト応答

```javascript
// 完全HTMLページ付き詳細応答
const instance = createHoneypot({ isCompleteResponses: true });
```

### トラフィック記録

```javascript
const instance = createHoneypot({ logTraffic: true });
// traffic.txtを見てボットが何を求めてるか確認
```

## 結論

このExpressハニーポットミドルウェアは単なるおとりとは段違いだ。**328エンドポイント**、**その場生成**、**動的ヘッダースプーフィング**、**トラフィック記録**、本物のWordPress応答用**PHPプロキシ**まで付けて、できるだけ現実的に設計した。

スキャナーは偽管理画面や信用できる`.env`ファイルや銀行フィッシングページに時間を溶かして、その間本物アプリは守られる。二変種システムと賢い分類が特に気に入ってる。各応答が新鮮で、要求パスに合ったものになる。

ソースコードはGitHubにある。[https://github.com/fox3000foxy/express-honeypot-middleware](https://github.com/fox3000foxy/express-honeypot-middleware)
