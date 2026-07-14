---
title: "GitHub Actionsを巧妙に使う5つの方法（そしてシークレットについて学ぶこと）"
description: "CIランナーを無料VPSに変身、自分でPRを開くボット、シークレットなしのnpmパブリッシュ。「lint + test + deploy」を超えたGitHub Actionsパターンのカタログ。"
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
---

# GitHub Actionsを巧妙に使う5つの方法

GitHub Actionsは本来、古典的なCI/CDのためのものだ。プッシュすればリントし、テストし、デプロイする。特殊なケースについてはすでに書いた -- gitタグをメールボットのデータベースとして使う方法（専用記事参照）。でも自分のリポジトリを掘り返すと、一つのプロジェクトに絞らずカタログ的にまとめる価値があるくらいパターンが揃ってた。

五つ。一番普通のから一番ひねくれたやつまで。

## 1. gitタグをラン間の永続状態として使う

簡単に復習すると、詳細は`email-autoreply`の記事にある。GitHub Actionsは設計上ステートレスだ -- 毎回まっさらなマシンから始まる。回避策: 値（ID、タイムスタンプなど小さな状態）を専用のgitタグに保存する。ブランチじゃなくて。

```bash
# 状態を読む
git show refs/tags/lastid:data/lastId > data/lastId

# 状態を書く（孤立ブランチ、単一コミット、タグをforce-push）
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```

キモ: 孤立ブランチで履歴を一切蓄積せず、ブランチではなく強制タグでリポジトリのブランチ一覧を汚さない。

## 2. gitタグをプリコンパイル済みビルドキャッシュとして使う

同じ発想の別用途: アプリの状態の代わりに**ビルドアーティファクト**を保存する。`build`ジョブがコードを一度コンパイルし（`master`へのプッシュ時）、`dist/` + `node_modules/`を`runtime`タグにプッシュする。`cron`ジョブは毎回`bun install && bun run build`を回す代わりにこのタグを直接チェックアウトする:

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# installもbuildもなし -- コードは準備済み
- run: node dist/index.js --action
```

これで実行時間が約20秒から約10秒に変わる。頻繁に回るcronでは意味がある。`actions/cache`も似た仕事をするが（依存関係のキャッシュ）、gitタグはバージョン付きアーティファクトを丸ごと凍結して明示的に指したい時により直接的だ -- 単に`npm install`を速くするだけじゃない。

## 3. 複数ジョブを束ねる単一の必須チェック

地味だけどブランチ保護設定を根本から変えるパターン。`konosuba-rpg`では、CIに3つの独立ジョブ（`typecheck`、`lint`、`tests`）が並列で走り -- 4つ目のジョブ`test-battery`は最初の3つに依存するだけで何もしない:

```yaml
test-battery:
  needs:
    - typecheck
    - lint
    - tests
  runs-on: ubuntu-latest
  steps:
    - run: echo "Typecheck, lint and tests succeeded."
```

このファサードジョブなしだと、保護ブランチの設定で3つの必須チェックを別々にチェックし、ジョブが追加されたり名前が変わったりするたびにそのリストを更新しなきゃいけない。`test-battery`があれば、リポジトリ設定で名前一つチェックするだけで、内部が変わっても安定してる。

## 4. 無料ランナーを一時VPSに変える

これが一番ひねくれていて、明らかに俺のお気に入り: `repo-to-vps`はGitHub Actionsランナーの本来の使い方を完全に乗っ取って、SSHでアクセス可能なLinuxマシンにする。無料。最大6時間（ジョブの最大時間）。

原理: tmateを起動する以外ほとんど何もしないジョブ:

```yaml
name: debug-runner
on:
  push:
    branches: [main, master]
  workflow_dispatch:
permissions:
  contents: write
  actions: write
jobs:
  debug:
    runs-on: ubuntu-latest
    timeout-minutes: 360
    steps:
      - uses: actions/checkout@v4
      - uses: awalsh128/cache-apt-pkgs-action@v1.6.0
        with:
          packages: tmate inotify-tools
      - run: bash .github/scripts/start-tmate.sh
```

本当の難題は、GitHub Actionsランナーのファイルシステムが**使い捨て**だってことだ -- ジョブが終わった瞬間に全部消える。何時間も続くSSHセッションも、やったことが次の実行で蒸発したら無意味だ。解決策: ファイルシステムのライブスナップショットとして機能するgitブランチ。継続的に同期。

`start-tmate.sh`スクリプトは順に:

1. ジョブ開始時に専用の`filesystem`ブランチからファイルシステムを**復元**する（`git reset --hard`）。
2. `inotifywait`でファイル変更を継続的に**監視**し、ファイルが動くたびに**即コミット＋プッシュ**:

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1
  done
}
```

3. 保存のたびに新しいコミットではなく前のコミットを**修正**する（`git commit --amend --no-edit`）、だから`filesystem`ブランチは常に単一コミット -- 何千ものスナップショットが溜まらない。
4. `while true`ループでセッションが死んだらtmateを自動再起動、`remain-on-exit on`で`exit`後もターミナルに接続可能。
5. tmateが生成したSSH URLを`host.conf`ファイルに書き込み、`filesystem`ブランチにコミット -- ジョブのログにライブアクセスできなくてもGitHub API（`gh api .../contents/host.conf`）で取得可能。
6. `periodic_save`ルーチンが5秒ごとにバックグラウンドで回り、`inotifywait`がイベントを見逃した場合に備える。

結果: どこからでもアクセス可能な完全なLinuxシェル。セッション間でファイルシステムが持続する -- 基盤インフラ（GitHub Actionsランナー）は絶対にそんな用途に設計されてないのに。唯一の本当の制限はジョブあたり6時間のタイムアウト -- それを過ぎたらワークフローを再起動する必要がある。

## 5. 自分でPRを開くボット

`konosuba-rpg`では、`dev`ブランチへのプッシュが`main`へのオープンなPRが既にあるかチェックするジョブをトリガーする -- なければ`actions/github-script`とGitHub REST APIで自動生成:

```js
const { data: comparison } = await github.rest.repos.compareCommits({
  owner, repo, base: 'main', head: 'dev',
});
if (comparison.ahead_by === 0) return;

const { data: existing } = await github.rest.pulls.list({
  owner, repo, state: 'open', head: `${owner}:dev`, base: 'main',
});
if (existing.length > 0) return;

await github.rest.pulls.create({
  owner, repo, head: 'dev', base: 'main',
  title: 'chore: auto PR from dev to main',
});
```

ここで重要なのは使われるトークンだ。このワークフローは自動の`GITHUB_TOKEN`を**使わない** -- 別途`AUTO_PR_TOKEN`シークレットを要求し、なければ続行を拒否する:

```yaml
- name: Validate pull request token
  env:
    AUTO_PR_TOKEN: ${{ secrets.AUTO_PR_TOKEN }}
  run: |
    if [ -z "$AUTO_PR_TOKEN" ]; then
      echo "AUTO_PR_TOKEN is required... Use a PAT or GitHub App token with contents:write and pull-requests:write."
      exit 1
    fi
```

## 6. シークレットなしでnpmにパブリッシュ

五つの中で一番静かだけど、未来にとって一番重要かもしれない: `typescript-virtual-container`の`publish.yml`ワークフローには**npmシークレットが一切ない**。`NPM_TOKEN`も`NODE_AUTH_TOKEN`もなし。これだけ:

```yaml
permissions:
  id-token: write
  contents: read
jobs:
  publish:
    steps:
      - uses: actions/setup-node@v6
        with:
          registry-url: 'https://registry.npmjs.org'
      - run: npm publish
```

`npm publish`が動作するのは、npmレジストリがOIDC経由の**trusted publishing**をサポートするようになったからだ: ワークフローがレジストリに直接自分の身元を証明し（npmjs.org側で設定された正確なリポジトリ＋正確なワークフロー）、静的なトークンがどこにも保存も転送もされない。漏洩するシークレットも、半年ごとにローテートするトークンもゼロ。

---

## GitHubシークレット、深掘り

この5つのパターンは全部、何らかの形でシークレットの問題に触れている。俺のワークフロー全体で繰り返し出てくる原則:

**シークレットは必ずしも単純な文字列じゃない。** `email-autoreply`では、`ACCOUNTS_JSON`がマルチアカウント設定のミニファイされたJSON全体を含んでいる -- APIキーだけじゃなく、完全なデータ構造をランタイムにそのままファイルに注入:

```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

設定ファイルをコミットする必要がなく（暗号化されていても）、リポジトリ設定でワンクリックでコードに触れずに更新できる。

**`GITHUB_TOKEN`には正確な制限があり、それは意図的なものだ。** GitHubが各実行に注入する自動トークンは強力だが、特定の点で封印されている: デフォルトでは別のワークフローをトリガーできず、リポジトリ設定によってはブランチ保護ルールにブロックされる。だからこそ`create-pull-request.yml`が別途PAT（`AUTO_PR_TOKEN`）を要求する -- 実アカウント（またはGitHub App）のトークン、明示的な`contents:write` + `pull-requests:write`権限付き、ジョブの一時トークンとは別。

**権限はグローバルではなくジョブごとにスコープされる。** ここに挙げた全ワークフローが最小限のコメント付き`permissions:`ブロックを宣言している:

```yaml
permissions:
  contents: read
  actions: read
  checks: write
```

デフォルトの`GITHUB_TOKEN`は歴史的に公開リポジトリに対してかなり広い権限を持つ。ジョブが実際に必要とするものだけに明示的に制限すれば、チェーン内のサードパーティアクションが侵害された場合の被害を抑えられる。

**最高のシークレットは存在しないシークレットだ。** `typescript-virtual-container`のOIDCパターンはこの考え方の最も完成された形だ: `NPM_TOKEN`のローテーション、期限切れ、漏洩リスクを管理する代わりに、ワークフローが暗号的に自分の身元（この正確なリポジトリ、この正確なワークフロー）をサードパーティサービスに直接証明する。AWS、Docker Hub、PyPIでも同じロジックが使える -- どんどん多くのレジストリとクラウドがGitHub ActionsからのOIDCをサポートしている。

---

**3つのポイント**

1. gitタグ（孤立、force-push）はミニマリストなデータベースやプリコンパイル済みビルドキャッシュとして機能する -- 同じ仕組みの2つの異なる使い方。
2. 無料のGitHub Actionsランナーは、`inotifywait`で自動保存し単一のamendコミットでファイルシステムをgitブランチに継続同期することを受け入れれば、永続的なSSHシェルになれる。
3. デフォルトの`GITHUB_TOKEN`は意図的に制限されている -- ブランチ間PRの作成やシークレットなしのパブリッシュには専用PATかOIDC trusted publishingへの切り替えが必要。
