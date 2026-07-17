---
title: このブログの仕組み
description: このブログの内部構造を深掘り：React、Vite、Markdown、CI/CDパイプライン、記事作成ワークフロー。
date: 2026-03-08
aiGenerated: true
authors:
  - fox3000foxy
tags:
  - react
  - meta
  - blog
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "Ka5TlEMoLdobQbjFi0MplnHWlnqRDf7HglyDebdjOe+BQ3zj62QN9yxoS8PcSNybXUYTqa+9s5KUnGEMC2iYKQ=="
---

# このブログの仕組み

このブログが内部でどう動いてるか気になったことはない？この記事では、技術スタックから記事の執筆プロセスまで、アプリケーションのアーキテクチャ全体を解説する。そう、VS Codeからどうやって記事を書いてるかまで見せるよ！

## 技術スタック

このブログはモダンなWeb技術で作られている：

- **React 19** -- ユーザーインターフェース
- **TypeScript** -- 型付きでより信頼性の高いコード
- **Vite** -- 超高速ビルドツール
- **React Router v7** -- ページ間のナビゲーション
- **react-markdown** -- MarkdownをHTMLに変換
- **rehype-raw + rehype-sanitize** -- Markdown内で生のHTMLを安全に許可

すべては**GitHub Pages**でホストされていて、`fox3000foxy.github.io`リポジトリから直接配信されている。

## プロジェクト構成

プロジェクトツリーはこんな感じ：

![](assets/how-this-blog-works/project-structure.png)

```
├── .github/
│   └── workflows/
│       └── deploy.yml        ← CI/CDパイプライン
├── public/
│   ├── home.md               ← ホームページコンテンツ
│   ├── portfolio.md           ← ポートフォリオコンテンツ
│   └── articles/
│       ├── index.json         ← 全記事の一覧
│       ├── hello-world.md     ← サンプル記事
│       ├── how-this-blog-works.md  ← この記事！
│       └── assets/            ← 記事の画像
├── src/
│   ├── main.tsx               ← Reactのエントリーポイント
│   ├── App.tsx                ← メインルーター
│   ├── components/
│   │   ├── Header.tsx         ← ナビゲーションバー
│   │   └── Footer.tsx         ← フッター
│   └── pages/
│       ├── Home.tsx           ← ホームページ
│       ├── BlogList.tsx       ← 記事一覧
│       ├── Article.tsx        ← 記事リーダー
│       ├── Portfolio.tsx      ← ポートフォリオページ
│       └── NotFound.tsx       ← 404ページ
└── vite.config.ts             ← Vite設定
```

コアとなる考え方はシンプルだ：**コンテンツはコードから分離されている**。ページは`public/`フォルダにMarkdownで書かれ、`src/`のReactコードがそれらをレンダリングする。

## ルーティングシステム

`App.tsx`がReact Routerを使って全アプリケーションルートを定義している：

![](assets/20260308_153440_image.png)


| ルート | ページ | 説明 |
| --------------- | ----------- | --------------------------------------------- |
| `/`           | Home      | ホームページ。`home.md`を読み込む                   |
| `/blog`       | BlogList  | 全記事の一覧                        |
| `/blog/:slug` | Article   | 個別記事。`articles/{slug}.md`を読み込む |
| `/portfolio`  | Portfolio | ポートフォリオページ。`portfolio.md`を読み込む         |
| `*`           | NotFound  | 不明なURL用の404ページ                   |

各ページは明確に定義された役割を持つ：Markdownファイルを取得し、`react-markdown`でHTMLに変換し、画面に表示する。

## 記事の仕組み

これが一番面白い部分だ！記事のライフサイクルはこんな感じ：

### 1. `index.json`ファイル

すべての記事は`public/articles/index.json`で参照される。各エントリには記事のメタデータが含まれる：

```json
[
  {
    "slug": "hello-world",
    "title": "Hello World",
    "description": "A sample post for Fox's Blog.",
    "date": "2026-03-08"
  }
]
```

- **slug** -- 一意の識別子。URLで使われる（`/blog/hello-world`）
- **title** -- 一覧に表示されるタイトル
- **description** -- 短い要約
- **date** -- 公開日

### 2. Markdownファイル

記事のコンテンツは`public/articles/`にある単純な`.md`ファイル。ファイル名は`index.json`で定義された`slug`と一致する。

![](assets/20260308_153509_image.png)

見出し、リスト、画像、テーブル、そして`rehype-raw`のおかげで生のHTMLさえも入れられる！

### 3. React側のレンダリング

`/blog/hello-world`にアクセスすると、こんなことが起きる：

1. React RouterがURLから`slug`パラメータを取得
2. `Article.tsx`コンポーネントが`/articles/hello-world.md`をフェッチ
3. Markdownが`react-markdown`によってHTMLに変換される
4. `assets/`へのリンクは自動的に`/articles/assets/`に書き換えられる
5. 並行して、`index.json`からメタデータが読み込まれ、日付と説明が表示される

これだけのシンプルさだ！

## ホームページとポートフォリオ

ホームページとポートフォリオもまったく同じように動作する：Markdownファイル（`home.md`または`portfolio.md`）を読み込み、HTMLとしてレンダリングする。

特別なのは、すべてのHTML要素で`class`と`style`属性を許可するカスタムサニタイゼーションスキーマを使っていることだ。これにより、Markdown内でスタイル付きHTMLを直接書ける。例えば画像ギャラリーなどだ。

## ヘッダーとフッター

ヘッダーは`position: fixed`でページの上部に固定されている。中身は：

- 俺のGitHubアバター（`github.com/fox3000foxy.png`から直接読み込み）
- ブログのタイトル
- ナビゲーションリンク：Home、Blog、Portfolio

フッターはミニマリスト：現在の年を動的に計算した著作権表示だけ。

## ダークテーマ

サイトは**常にダークモード**だ----ライト/ダーク切り替えはない。これは意図的な選択：グローバルスタイルで`color-scheme: dark`が設定されていて、背景は黒`#000`、テキストは白`#fff`。リンクは青（`#64b5f6`）で、ホバー時に緑（`#81c784`）に変わる。

## 記事の書き方

実践的な部分だ！新しい記事を書くときのワークフロー：

### ステップ1：Markdownファイルを作成

VS Codeを開いて、`public/articles/`に新しい`.md`ファイルを作成する：

### ステップ2：コンテンツを書く

記事の内容をMarkdownで直接書く。VS Codeには優れたMarkdownプレビュー機能が組み込まれている：

![](assets/20260308_153613_image.png)

画像は`public/articles/assets/`に配置し、標準的なMarkdown記法で参照する：

```markdown
![description](assets/my-image.png)
```

`Article.tsx`コンポーネントが自動的に`assets/`パスを`/articles/assets/`に書き換え、画像が正しく表示されるようにする。

### ステップ3：index.jsonに記事を登録

記事ができたら、`public/articles/index.json`に追加してブログ一覧に表示させる：

![](assets/20260308_153629_image.png)

### ステップ4：ローカルでテスト

Vite開発サーバーを起動：

```bash
pnpm dev
```

Viteはミリ秒で起動し、`localhost:5173`で記事がリアルタイムで見れる：

![](assets/20260308_153703_image.png)

### ステップ5：公開

`git push`するだけ！CI/CDパイプラインが残りを自動で処理する。

## CI/CDデプロイパイプライン

**GitHub Actions**のフルパイプラインを設定していて、`main`にプッシュするたびにリンター、ビルド、デプロイを自動化している。

ワークフローは`.github/workflows/deploy.yml`にあり、**build**と**deploy**の2つのジョブに分かれている。

### トリガー

```yaml
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
```

パイプラインは`main`への**プッシュ**と、`main`をターゲットにする**プルリクエスト**のたびに実行される。つまり、PRはマージ前にチェック（lint + build）されるが、デプロイが実際にトリガーされるのは`main`へのプッシュのみだ。

### ジョブ1：Build

ビルドジョブは`ubuntu-latest`で実行され、以下のステップを経る：

1. **Checkout** -- 完全な履歴でリポジトリをクローン（`fetch-depth: 0`）
2. **Setup pnpm** -- `pnpm/action-setup@v4`を使って最新版のpnpmをインストール
3. **Setup Node.js 20** -- pnpmキャッシュを有効にしてNodeを設定、高速インストール
4. **Install dependencies** -- `pnpm install --frozen-lockfile`で再現可能なビルドを確保（ロックファイルの変更不可）
5. **Lint** -- `pnpm run lint`（ESLint）でコード品質をチェック
6. **Build** -- `pnpm run build`を実行。まずTypeScriptの型をチェック（`tsc -b`）、それからViteでバンドル
7. **Upload artifact** -- `dist/`フォルダをビルド成果物としてアップロード

いずれかのステップが失敗すると----lintエラー、型エラー、ビルドエラー----パイプライン全体が停止し、何もデプロイされない。これで本番サイトが壊れたコードから守られる。

### ジョブ2：Deploy

デプロイジョブは以下の場合のみ実行される：

- ビルドジョブが成功した（`needs: build`）
- イベントが**プッシュ**である（PRではない）
- ブランチが**main**である

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

そして：

1. **ビルド成果物をダウンロード** -- ビルドジョブが生成した`dist/`フォルダを取得
2. **GitHub Pagesを設定** -- Pages環境をセットアップ
3. **Pagesにアップロード** -- `dist/`フォルダをGitHub Pages用にパッケージ
4. **デプロイ** -- `actions/deploy-pages@v4`でサイトを公開

### 全体像

執筆からデプロイまでの流れ：

```
VS Codeで記事を書く
        ↓
   git add & commit
        ↓
      git push
        ↓
  GitHub Actionsが起動
        ↓
  ┌─────────────────┐
  │   BUILD JOB     │
  │  1. Checkout    │
  │  2. Setup pnpm  │
  │  3. Setup Node  │
  │  4. Install     │
  │  5. Lint ✓      │
  │  6. Build ✓     │
  │  7. Upload dist │
  └────────┬────────┘
           ↓
  ┌─────────────────┐
  │  DEPLOY JOB     │
  │  1. Download    │
  │  2. Configure   │
  │  3. Upload      │
  │  4. Deploy 🚀   │
  └─────────────────┘
           ↓
    GitHub Pagesで公開！
```

プッシュから公開まで約1分。手動デプロイ不要、FTP不要、SSH不要----`git push`だけで完了だ。

## プロダクションビルド

内部では、`pnpm build`コマンドが以下を実行する：

1. `tsc -b` -- TypeScriptの型をチェック
2. `vite build` -- 全コードをバンドルして最適化

Viteは自動コード分割で最小化・最適化されたファイルを生成する。結果は爆速の静的サイトだ。

## なぜこのアーキテクチャ？

CMSやHugo、Jekyllのような静的サイトジェネレーター、Next.jsを使うこともできた。でもなぜこのアプローチを選んだか：

- **シンプルさ** -- Markdownで書いてGitHubにプッシュするだけで公開
- **完全な制御** -- CMSやデータベースに依存しない
- **パフォーマンス** -- Vite + React = 高速読み込み
- **柔軟性** -- MarkdownとHTMLを好きなように混ぜられる
- **学習** -- ReactとTypeScriptを極めるのに最適なプロジェクト
- **CI/CD** -- GitHub Actionsによる自動品質チェックとデプロイ

## 結論

このブログはシンプルだがよく考え抜かれたプロジェクトだ：コンテンツにMarkdown、レンダリングにReact、パフォーマンスにVite、CI/CDにGitHub Actions、ホスティングにGitHub Pages。データベースもバックエンドサーバーもなく、自動化パイプラインがあらゆるプッシュで品質を確保しながら、効率的に提供される静的ファイルだけだ。

同じようなアーキテクチャで自分のブログを作りたければ、[GitHubのソースコード](https://github.com/fox3000foxy/fox3000foxy.github.io)をチェックしてみてね！

読んでくれてありがとう、次の記事で会おう！🦊
