---
title: "超リアルなExpressハニーポットを構築しました"
description: "328の偽エンドポイント、その場で生成されるレスポンス、ヘッダースプーフィング、ボットトラフィック記録 — スキャナーを欺くために設計されたExpressハニーポットミドルウェアのコードに深く潜る。"
date: "2026-06-10"
aiGenerated: true
tags:
  - express
  - nodejs
  - security
  - honeypot
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "6TyVxgqi0pl3npyO4VtByv7873uS6iNEJyXSKlnp1v7mICNJhUr25SntFlPFj5TMJINA4ftBlH7ofN0WQlISxA=="
---

## アイデア

ボットや自動スキャナーは常にWebアプリケーションをスキャンして脆弱性を探しています。`.env`ファイル、管理パネル、データベースバックアップ、SSH認証情報 — 悪用できるものは何でも探します。

単に404を返すのではなく、もっと面白いものを作りたかったのです。それは、攻撃者に脆弱なターゲットを見つけたと思わせるような**信頼できるコンテンツで応答するExpressハニーポット**です。

## 機能

このミドルウェアは、2つのバリアント（デフォルトと完全版）に分かれた**328のエンドポイント**を公開します。各リクエストは、新鮮なタイムスタンプとリクエストIDを含む、その場で生成されたユニークな応答を受け取り、実際のサーバーを模倣します。

## はじめに

```bash
npm install express-middleware-honeypot
```

自動登録を使用した基本的な使い方：

```js
const express = require("express");
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

app.listen(3000, () => {
    console.log("サーバーがポート3000で実行中です");
});
```

## 仕組み

### その場での生成

ディスク上にモックファイルはありません。`mockupGenerator.ts`サービスは、リクエスト時に各応答を以下の内容で作成します：

- ユニークなタイムスタンプとリクエストID
- エンドポイントに合わせたコンテンツ（認証情報、設定、ログインページ、API応答）
- 動的な`X-Powered-By`スプーフィングを含むリアルなHTTPヘッダー

### ヘッダースプーフィング

`headersMiddleware`は、パス拡張子に基づいて動的に`X-Powered-By`ヘッダーを選択します：

- `.php` → `X-Powered-By: PHP/8.1.12`
- `.jsp` → `X-Powered-By: JSP/3.0`
- `.aspx/.ashx/.asmx` → `X-Powered-By: ASP.NET`
- `.do/.action` → `X-Powered-By: Servlet/3.0`
- その他のパス → `X-Powered-By`ヘッダーなし

### 328のエンドポイント

| タイプ | エンドポイント例 |
|---|---|
| 認証情報リーク | `.env`, `secrets.json`, `aws/credentials`, `etc/shadow` |
| SSH鍵 | `.ssh/id_rsa`, `.ssh/id_ed25519` |
| データベース設定 | `config/database`, `wp-config.php`, `docker-compose.yml` |
| 管理パネル | `/admin`, `/wp-admin`, `/manage/account/login` |
| API応答 | `/api/version`, `/api/config`, `.do`, `.ashx` |
| 銀行フィッシング | `/lander/sber*`, `/index_sber.php` |
| C2ハートビート | 6+文字のランダムパス（`/262LBNFp`, `/Kd67Fq1x`） |
| 株式/暗号通貨 | `/stock/mzhishu`, `/kline/1m/1`, `/m/allticker/1` |
| ギャンブル/ゲーム | `/proxy/games`, `/Ctrls/GetSysCoin`, `/room/getRoomBangFans` |
| 設定ファイル | `config.json`, `config.yml`, `sitemap.xml`, `ads.txt` |
| ランディングページ | `/about`, `/contact`, `/products`, `/blog` |

### PHPスプーフィング

`instance.phpSpoofer`は`*.php`リクエストをインターセプトし、ローカル開発サーバーにプロキシして、静的なモックではなく実際のPHP処理結果を返します。

### トラフィック記録

トラフィックはJSON-lines形式で`traffic.txt`に記録できます。未処理の不明なルートは、`GET /newBotsRoute`で抽出できます。

## HoneypotInstance API

```ts
interface HoneypotInstance {
  mocks: Record<string, Middleware>;
  middleware: Middleware;
  headersMiddleware: Middleware;
  phpSpoofer: Middleware;
  notFoundHandler: Middleware;
  register(app: RouteApp): void;
  getUnhandledRoutes(): Promise<string[]>;
  getNotCoveredEndpoints(): string[];
}
```

## 効果的な理由

自動スキャナーは、脆弱なサイトに特定のファイルが存在することを期待しています。404ではなくリアルなコンテンツで応答することで、ハニーポットは以下のことを実現します：

1. 攻撃者が偽の結果を分析する**時間を浪費させる**
2. 後で分析するために**彼らの指紋を記録する**
3. 本当の脆弱性から**注意をそらす**
4. 未処理のルートを通じて**新しい攻撃パターンを明らかにする**

## 結論

完全なソースコードはGitHubの [github.com/anomalyco/express-honeypot-middleware](https://github.com/anomalyco/express-honeypot-middleware) で入手できます。ぜひお試しください。Issueを開いたり、コントリビュートしたりすることも歓迎します。
