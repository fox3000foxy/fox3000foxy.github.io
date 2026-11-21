---
title: このブログの仕組み
description: "ブログの舞台裏：React、Vite、Markdown、CI/CDパイプライン、執筆フロー。"
date: 2026-03-08
aiGenerated: true
tags:
  - react
  - meta
  - blog
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "27pyHgMKhGzpLy286FAVPZMnirLAO6XDvm5xUwd/BdtDp2jSG/KlupjmwKdhZb60OO3iIebPteJ5k7GKsfHVEg=="
---

# このブログの仕組み

このブログが内部でどう動いてるか気になったことはない？この記事では、技術スタックから記事の執筆プロセスまで、アプリケーションのアーキテクチャ全体を解説する。そう、VS Codeからどうやって記事を書いてるかまで見せるよ！

## 技術スタック

このブログはモダンなウェブ技術で作られてる。

- **React 19**：ユーザーインターフェース用
- **TypeScript**：型付きで信頼できるコード用
- **Vite**：超高速ビルドツール
- **React Router v7**：ページ間ナビゲーション用
- **react-markdown**：MarkdownをHTMLに変換
- **rehype-raw + rehype-sanitize**：安全に素のHTMLをMarkdown内で許可


## プロジェクト構造

プロジェクトのツリーはこんな感じだ。

![](assets/how-this-blog-works/project-structure.png)

```
├── .github/
│   └── workflows/
│       └── deploy.yml              ← Pipeline CI/CD
├── public/
│   ├── home.md                     ← Contenu de la page d'accueil
│   ├── portfolio.md                ← Contenu du portfolio
│   └── articles/
│       ├── index.json              ← Liste de tous les articles
│       ├── hello-world.md          ← Un article
│       ├── how-this-blog-works.md  ← Cet article !
│       └── assets/                 ← Images des articles
├── src/
│   ├── main.tsx                    ← Point d'entrée React
│   ├── App.tsx                     ← Routeur principal
│   ├── components/
│   │   ├── Header.tsx              ← Barre de navigation
│   │   └── Footer.tsx              ← Pied de page
│   └── pages/
│       ├── Home.tsx                ← Page d'accueil
│       ├── BlogList.tsx            ← Liste des articles
│       ├── Article.tsx             ← Lecteur d'article
│       ├── Portfolio.tsx           ← Page portfolio
│       └── NotFound.tsx            ← Page 404
└── vite.config.ts                  ← Configuration Vite
```

中心的な考えは単純だ。**コンテンツはコードから分離されてる**。ページは`public/`内のMarkdownで書かれて、`src/`内のReactコードが表示を担う。この分離にこだわってる。コンテンツは読み返しやすく、コードは進化させやすいからね。

## ルーティングシステム

`App.tsx`ファイルがReact Routerでアプリの全ルートを定義してる。

![](assets/20260308_153440_image.png)


| ルート | ページ | 説明 |
| --------------- | ----------- | -------------------------------------------- |
| `/`           | Home      | トップページ、`home.md`を読む |
| `/blog`       | BlogList  | 全記事の一覧 |
| `/blog/:slug` | Article   | 1つの記事、`articles/{slug}.md`を読む |
| `/portfolio`  | Portfolio | ポートフォリオページ、`portfolio.md`を読む |
| `*`           | NotFound  | 不明URL用404ページ |

各ページの役割は明確だ。Markdownファイルを取り、react-markdownでHTMLに変換して、画面に表示する。

## 記事はどう動くの

いちばん好きな部分だよ！記事のライフサイクルはこうだ。

### 1. `index.json`ファイル

全記事は`public/articles/index.json`に参照されてる。各エントリが記事のメタデータを持つ。

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

- **slug**：一意ID、URLに使う（`/blog/hello-world`）
- **title**：一覧に表示されるタイトル
- **description**：短い要約
- **date**：公開日

### 2. Markdownファイル

記事内容は`public/articles/`内の単なる`.md`ファイルだ。ファイル名は`index.json`で定義した`slug`に対応する。

![](assets/20260308_153509_image.png)

何でも入れられる。タイトル、リスト、画像、テーブル、果ては`rehype-raw`のおかげで素のHTMLまで！

### 3. React側のレンダー

`/blog/hello-world`を開くとこうなる。

1. React RouterがURLから`slug`パラメータを取る
2. `Article.tsx`コンポーネントが`/articles/hello-world.md`を読む
3. Markdownは`react-markdown`でHTMLに変換される
4. `assets/`へのリンクは自動で`/articles/assets/`に書き換えられる
5. 並行して日付と説明表示用メタデータが`index.json`から読まれる

ほんと単純だよ！

## トップページとポートフォリオ

トップとポートフォリオのページはまったく同じ仕組みだ。Markdownファイル（`home.md`か`portfolio.md`）を読んでHTMLにレンダーする。

特徴は、カスタム消毒スキーマを使って全HTML要素に`class`と`style`属性を許可してることだ。画像ギャラリーみたいにスタイル付きHTMLをMarkdownに直接書ける。

## ヘッダーとフッター

ヘッダーは`position: fixed`でページ上部に固定されてる。内容はこうだ。

- 私のGitHubアバター（`github.com/fox3000foxy.png`から直接読み込み）
- ブログタイトル
- ナビリンク：トップ、ブログ、ポートフォリオ

フッターは最小限だ。動的計算の当年入りコピーライトだけだ。

## ダークテーマ

サイトは常にダークモードのままだ。夜も快適に読めるよう意識的にこう選んだ。グローバルスタイルで`color-scheme: dark`を定義して、背景黒`#000`に文字白`#fff`だ。リンクは青（`#64b5f6`）でホバーで緑（`#81c784`）になる。

## 記事の書き方

実践に入ろう！新規記事を書く私のワークフローはこうだ。

### ステップ1：Markdownファイルを作る

VS Codeを開いて`public/articles/`に新しい`.md`ファイルを作る。

### ステップ2：内容を書く

記事内容を直接Markdownで書く。VS Codeには優秀な内蔵Markdownプレビューがある。

![](assets/20260308_153613_image.png)

画像は`public/articles/assets/`に置いて、標準Markdown記法で参照する。

```markdown
![description](assets/my-image.png)
```

`Article.tsx`コンポーネントが画像表示用に`assets/`パスを自動で`/articles/assets/`に書き換える。

### ステップ3：index.jsonに記事を登録する

記事が終わったら、ブログ一覧に出るよう`public/articles/index.json`に足す。

![](assets/20260308_153629_image.png)

### ステップ4：ローカルで試す

Vite開発サーバーを起動する。

```bash
pnpm dev
```

Viteは数ミリ秒で起動して、`localhost:5173`で記事をリアルタイムに見られる。この速さで各変更をほぼ即確認できる。

![](assets/20260308_153703_image.png)

### ステップ5：公開する

単なる`git push`で十分だ！CI/CDパイプラインが残り全部を自動でやる。

## CI/CDデプロイパイプライン

**GitHub Actions**の完全パイプラインを入れてて、`main`への各pushでサイトのlintとbuildとデプロイを自動化してる。詳しく見よう。

ワークフローは`.github/workflows/deploy.yml`にあって、**build**と**deploy**の2ジョブに分かれてる。

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

パイプラインは**push**で`main`へ、そして`main`宛て各**pull request**で動く。PRはマージ前に検証（lintとbuild）される。デプロイを起こすのは`main`へのpushだけだ。

### ジョブ1：Build

buildジョブは`ubuntu-latest`で回って、こんな手順だ。

1. **Checkout**：全履歴付きでリポジトリをクローン（`fetch-depth: 0`）
2. **Setup pnpm**：`pnpm/action-setup@v4`で最新pnpmを入れる
3. **Setup Node.js 20**：pnpmキャッシュ有効でNodeを設定して高速インストール
4. **Install dependencies**：再現build保証で`pnpm install --frozen-lockfile`を実行（lockfile変更不可）
5. **Lint**：build前にコード品質確認で`pnpm run lint`（ESLint）を実行
6. **Build**：`pnpm run build`を実行。TypeScript型確認（`tsc -b`）してからViteでまとめる
7. **Upload artifact**：デプロイジョブ用に`dist/`フォルダをbuild成果物として上げる

1段階でも失敗（lint、型、buildのエラー）したらパイプライン全体が止まって何もデプロイされない。この guard で壊れたコードの本番混入を防いでて、各pushで頼ってる。

### ジョブ2：Deploy

デプロイジョブは以下全部のときだけ動く。

- buildジョブが成功した（`needs: build`）
- イベントが**push**だ（PRじゃない）
- ブランチが**main**だ

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

次にこう進む。

1. **build成果物を落とす**：buildジョブが作った`dist/`フォルダを取る
2. **GitHub Pagesを設定する**：Pages環境を整える
3. **Pagesへ上げる**：GitHub Pages用に`dist/`フォルダを準備する
4. **デプロイする**：`actions/deploy-pages@v4`でサイト公開する

### 全体図

執筆からデプロイまではこうなる。

```
VS Codeで記事を書く
          ↓
    git addとcommit
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

pushから公開まで全体で約1分だ。単なる`git push`で公開する。FTPもSSHも通さず全部自動のままだ。

## 本番Build

内部では`pnpm build`コマンドがこう動く。

1. `tsc -b`：TypeScript型を確認する
2. `vite build`：全コードをまとめて最適化する

Viteは自動コード分割付きの最小最適化ファイルを作る。結果は超高速な静的サイトだ。

## なぜこのアーキテクチャ

CMSやHugoやJekyllみたいな静的サイトジェネレータやNext.jsだって使えた。でもこの手法を選んだ理由はこうだ。

- **単純さ**：Markdownで書いて、GitHubにpushしたら公開だ
- **完全管理**：CMSやデータベースへの依存なし
- **性能**：ViteとReactは読み込み高速だ
- **柔軟さ**：MarkdownとHTMLを好きに混ぜられる
- **学習**：ReactとTypeScript習得に最高のプロジェクトだ
- **CI/CD**：GitHub Actionsで品質確認と自動デプロイだ

## 結論

このブログは単純だが考え抜かれたプロジェクトだ。内容にMarkdown、レンダーにReact、性能にVite、CI/CDにGitHub Actions、ホスティングにGitHub Pagesだ。効率よく出される静的ファイルだけに頼ってて、各pushで品質を保証する自動パイプライン付きだ。


読んでくれてありがとう、次の記事でね！🦊
