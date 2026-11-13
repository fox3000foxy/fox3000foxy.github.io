---
title: "GitHub Actionsの裏ワザ的使い方5選（そしてシークレットについて学んだこと）"
description: "CIランナーを無料VPS化、自分でPRを開くボット、シークレットなしのnpm公開。単なる「lint + test + deploy」を超えたGitHub Actionsパターンを自分のリポジトリから集めたカタログ。"
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "AqXgQwuokowtyJwu82x8LJFDG2uMABjQ79jdSkdnu6cQxuT/WCOX942koVRmPLwFg4IPsP7nJo4fv1cUp8LAxw=="
---

# GitHub Actionsの裏ワザ的使い方5選

GitHub Actionsは本来、古典的なCI/CDのためのものだ。pushしたらlintして、テストして、デプロイする。私はすでに特殊なケースについて書いたことがある（メールボット用にgitタグをデータベースとして使う方法は専用の記事を参照）。でも自分のリポジトリを掘り返してみると、1つのプロジェクトに絞らないカタログ記事にするだけの価値があるくらい、いろんなパターンが出てきた。

5つの使い方を、王道なものから一番ひねくれたものまで紹介する。

## 1. gitタグをrun間の永続的な状態として使う

手短なおさらいだが、詳しくは`email-autoreply`の記事にある。GitHub Actionsは設計上ステートレスだ。各runはまっさらなマシンから始まる。回避策は、値（ID、タイムスタンプ、その他小さな状態）をブランチではなく専用のgitタグに保存することだ。

```bash
# 状態を読む
git show refs/tags/lastid:data/lastId > data/lastId

# 状態を書く（orphanブランチ、コミットは1つだけ、タグをforce-push）
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```

ポイントは、履歴を溜めないためのorphanブランチと、リポジトリのブランチ一覧を汚さないためのブランチではなく強制上書きするタグを使うことだ。

## 2. gitタグをプリコンパイル済みビルドキャッシュとして使う

同じ系統のアイデアで、使い方が違う。アプリの状態ではなく**ビルド成果物**を保存する。`build`ジョブがコードを1回だけコンパイルし（`master`へのpush時）、`dist/`と`node_modules/`を`runtime`タグにpushする。`cron`ジョブ側は毎回`bun install && bun run build`を回す代わりに、このタグを直接チェックアウトする。

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# installなし、buildなし。コードはもう準備できている
- run: node dist/index.js --action
```

これでrunが約20秒から約10秒に短縮される。頻繁に回るcronでは効いてくる。`actions/cache`も似た仕事をする（依存関係をキャッシュする）が、`npm install`を速くするだけではなく、バージョン付き成果物をがっちり固定して明示的に指したい場合はgitタグの方が直接的だ。

## 3. 複数ジョブを集約する必須チェックを1つだけ作る

地味に見えるが、保護ブランチの設定では人生が変わるパターンだ。`konosuba-rpg`ではCIに3つの独立したジョブ（`typecheck`、`lint`、`tests`）が並列で回っていて、4つ目のジョブ`test-battery`はこの3つに依存するだけで他には何もしない。

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

このダミージョブがないと、保護ブランチの設定では3つの必須チェックを別々にチェックし、ジョブが追加・改名されるたびに一覧を更新しなければならない。`test-battery`があれば、リポジトリ設定でチェックする名前は1つだけで、中身が変わっても安定したまま使える。

## 4. 無料ランナーを一時VPSに変える

これが一番ひねくれていて、明らかに私のお気に入りだ。`repo-to-vps`はGitHub Actionsランナーの想定用途を完全に踏み外して、無料で最大6時間（1ジョブの上限）使えるSSH接続可能なLinuxマシンに仕立てている。

仕組みは、[tmate](https://tmate.io/)（SSHやブラウザで共有できるターミナルセッションを公開するtmuxのフォーク）を起動するだけのジョブだ。

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

本当の難所は、GitHub Actionsランナーのファイルシステムが**使い捨て**なことだ。ジョブが終われば全部消える。何時間も続くSSHセッションも、そこでやったことが次のrunで蒸発するなら意味がない。解決策は、ファイルシステムのライブスナップショット用gitブランチを用意して、継続的に同期することだ。

`start-tmate.sh`スクリプトは順番にこう動く。

1. ジョブ開始時に専用ブランチ`filesystem`からファイルシステムを**復元**する（その上に`git reset --hard`）。
2. `inotifywait`でファイル変更を継続的に**監視**し、ファイルが動くたびに即**コミットしてpush**する。

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1   # debounce
  done
}
```

3. 各保存は新規コミットではなく直前のコミットを**amend**する（`git commit --amend --no-edit`）ので、`filesystem`ブランチは常にコミット1つだけで、何千ものスナップショットが溜まらない。
4. `while true`ループが、セッションが死んだら`tmate`を自動で再起動する。`remain-on-exit on`で`exit`後もターミナルに到達できるままにしておく。
5. tmateが生成したSSH用URLは`host.conf`ファイルに書き出して`filesystem`ブランチにコミットするので、ジョブのログをリアルタイムで見ていなくてもGitHub API（`gh api .../contents/host.conf`）経由で回収できる。
6. `inotifywait`がイベントを取りこぼした場合に備えて、`periodic_save`ルーチンがバックグラウンドで5秒ごとに回る。

結果として、完全なLinuxシェルにどこからでもアクセスでき、土台（GitHub Actionsランナー）はそんな用途をまったく想定していないのにファイルシステムはセッション間で永続化される。唯一の本当の制限は1ジョブ6時間のタイムアウトで、それを超えたらワークフローを再起動する必要がある。

## 5. 自分でプルリクエストを開くボット

`konosuba-rpg`では、`dev`ブランチへのpushでジョブが起動し、`main`へのオープンPRがすでにあるか確認して、なければ自動で作成する。`actions/github-script`とGitHub REST API経由だ。

```js
const { data: comparison } = await github.rest.repos.compareCommits({
  owner, repo, base: 'main', head: 'dev',
});
if (comparison.ahead_by === 0) return; // 提案するものなし

const { data: existing } = await github.rest.pulls.list({
  owner, repo, state: 'open', head: `${owner}:dev`, base: 'main',
});
if (existing.length > 0) return; // すでにオープンなPRあり

await github.rest.pulls.create({
  owner, repo, head: 'dev', base: 'main',
  title: 'chore: auto PR from dev to main',
});
```

ここで大事なのは使うトークンだ。このワークフローは自動の`GITHUB_TOKEN`を**使わない**。別のシークレット`AUTO_PR_TOKEN`を必須とし、なければ続行を拒否する。

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

## 6. シークレットなしでnpmに公開する

5つの中では一番目立たないが、おそらく将来に向けて一番重要だ。`typescript-virtual-container`の`publish.yml`ワークフローには**npmシークレットが一切ない**。`NPM_TOKEN`も`NODE_AUTH_TOKEN`もない。あるのはこれだけだ。

```yaml
permissions:
  id-token: write  # Required for OIDC
  contents: read
jobs:
  publish:
    steps:
      - uses: actions/setup-node@v6
        with:
          registry-url: 'https://registry.npmjs.org'
      - run: npm publish
```

それでも`npm publish`は動く。npmレジストリがOIDC経由の**trusted publishing**に対応しているからだ。ワークフローは自分の身元をレジストリに直接証明する（正確なリポジトリとワークフローはnpmjs.org側で設定）。静的なトークンはどこにも通過せず、どこにも保存されない。漏れるシークレットはゼロ、半年ごとに回すトークンもゼロだ。

---

## GitHubシークレットを深掘りする

この5つのパターンはどれも、何らかの形でシークレットの問題に触れている。私のワークフロー全体で繰り返し出てくる原則をいくつか挙げる。

**シークレットは単純な文字列とは限らない。** `email-autoreply`では、`ACCOUNTS_JSON`にマルチアカウント設定の縮小JSON全体が入っている。単なるAPIキーではなく完全なデータ構造で、実行時にそのままファイルに注入する。

```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

これで設定ファイルをコミットせずに済む（暗号化されていても）。コードに触らずリポジトリ設定からワンクリックで更新できる。

**`GITHUB_TOKEN`には明確な制限があり、それは意図的なものだ。** 各runにGitHubが注入する自動トークンは強力だが、いくつかの点では封印されている。デフォルトでは他のワークフローを起動できないし、リポジトリ設定によってはブランチ保護ルールにブロックされることもある。`create-pull-request.yml`が別のPAT（`AUTO_PR_TOKEN`）を必須とするのはまさにそのためだ。ジョブの一時トークンとは別に、本物のアカウント（またはGitHub App）由来のトークンで、明示的な権限`contents:write`と`pull-requests:write`を持つものが必要になる。

**権限は全体ではなくジョブごとに絞る。** ここに挙げた各ワークフローは最小限の`permissions:`ブロックを宣言してコメントを付けている。

```yaml
permissions:
  contents: read
  actions: read
  checks: write
  # Only allow writing checks, everything else is read-only
```

デフォルトの`GITHUB_TOKEN`は歴史的にパブリックリポジトリでかなり広い権限を持っていた。ジョブが本当に必要とする範囲に明示的に絞っておけば、チェーン内のサードパーティ製アクション（`uses: 誰かの/action@version`）の1つが侵害されたときの被害を抑えられる。

**最高のシークレットは存在しないシークレットだ。** `typescript-virtual-container`のOIDCパターンはこの考えの最良の形だ。`NPM_TOKEN`のローテーション、有効期限、漏洩リスクを管理する代わりに、ワークフローは自分の身元（この正確なリポジトリ、この正確なワークフロー）をサードパーティサービスに暗号学的に証明する。AWS、Docker Hub、PyPIでも同じ仕組みが使える。GitHub ActionsからのOIDCに対応するレジストリやクラウドはどんどん増えている。

---

**要点3つ**

1. gitタグ（orphan、force-push）はミニマルなデータベースにもプリコンパイル済みビルドキャッシュにもなる。同じ仕組みの別々の使い方だ。
2. 無料のGitHub Actionsランナーも、ファイルシステムをgitブランチへ継続同期すれば永続SSHシェルになる。`inotifywait`による自動保存とamend1コミットが鍵だ。
3. デフォルトの`GITHUB_TOKEN`は意図的に制限されている。ブランチ間のPR作成やシークレットなし公開には、専用PATかOIDC trusted publishingへの移行が必要だ。
