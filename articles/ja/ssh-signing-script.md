---
title: SSH署名スクリプト解説
description: "SSHコミット署名ヘルパーの紐解きと、なぜ格好いいコミットが欲しかったか。"
date: 2026-03-08
aiGenerated: true
tags:
  - git
  - security
  - shell
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "GN4E0oAuCYV7jajLk2Yocuab3+aa/zFuOit18EVBvvUMxQpoi7lAoJ7QljdwtGN4AvU/zFYGal56B5Wi+dFe5Q=="
---

# コミット用SSH署名スクリプト。解説

この記事は[Gist](https://gist.github.com/fox3000foxy/95500d129cd4bf5c173c323d2492569a)で公開した`setup-ssh-signing.sh`スクリプトを紐解く。各部分が何するか、リポジトリローカルなSSH署名をどう完全に手間なしにするか、そう、なぜわざわざ書く手間をかけたかを見る（ネタバレ：コミットに**格好**が欲しかっただけだ）。

## 動機

Gitワークフローいじりが昔から大好きで、コミット横に小さな「Verified」バッジ付けた人たちを見て思ったんだ。なんで自分じゃないのって。内蔵GPG署名は重くてグローバルだ。結局小さなヘルパーを書いて、こうする。

- 署名専用SSH鍵を作る、
- 現リポジトリだけを設定する、
- 履歴書き換えで古いコミットに署名し直せる、
- マシン間で鍵を運べる。

正直、需要はほぼ見栄だった。個人プロジェクトは署名要件ゼロだ。でも緑「Verified」バッジがコミットに付くのを見るのはちょっとした効果があって、shellでこのスクリプト書くのは本当に楽しかった。

> まあ、コミット署名ってコードレビューに革ジャン着てくみたいなものだ。全然無駄だけど、ハッカーな気分になれる。

## スクリプトがすること

スクリプトは単一Bashファイルで、頭に`set -euo pipefail`があって最初のエラーで中断する。やることの概要はこうだ。

1. **署名鍵を作るか import する**  
   鍵はスクリプト起動フォルダ内の`.git-signing/`に落ちる。
2. **Gitをローカル設定する**  
   `gpg.format=ssh`、`user.signingkey`、`commit.gpgsign=true`、`tag.gpgSign=true`、公開鍵を指す`allowedSignersFile`を置く。
3. **マシン間で鍵を管理する**  
   `--export-keys`や`--import-keys`で、グローバル設定に触らず秘密鍵を別PCへ移せる。
4. **任意の履歴書き換え**（`--resign-all`）  
   全ブランチやタグの全コミット（fork用に`upstream`にないものだけも可）を書き換えて`-S`で再署名する。他作者には触らない。
5. **便利フラグ**  
   非対話モード用`--autostash`、`--autopush`、`--commit-date`、`--yes`など。
6. **fork検出と安全確認**  
   `upstream`リモートを検出して、履歴書き換え前に警告して、必須道具（`git`、`ssh-keygen`、`zip/unzip`）を確認して、正しい権限を確かめる。ファイルシステム権限が緩すぎれば鍵の安全コピーまで作る。

スクリプトは冪等だ。2回走らせても鍵は作り直さないし既存設定も潰さない。

## 手順ごとの流れ

コードの主要抜粋と解説はこうだ。

```bash
#!/usr/bin/env bash
set -euo pipefail

# Configure SSH commit signing in a controlled, repo-local way.
# - Key files are created in the directory where this script is launched.
# - Git config is written locally to the current repository only.
```

ヘッダーは安全を置いて目的を文書化する。次はCLI選択肢をパースする（`--name`、`--email`、`--repo`など）。`while [[ $# -gt 0 ]]; do case … esac done`ループでね。必須の身分フィールドは後で確認する。

```bash
if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "Error: missing identity. Provide --name and --email." >&2
  exit 1
fi
```

鍵生成は`$LAUNCH_DIR/.git-signing`でやる。鍵がすでにあればスクリプトはそのまま保つ。`--import-keys`でZIPからフォルダを埋められる。

```bash
mkdir -p "$KEY_DIR"

if [[ -n "$IMPORT_ZIP_PATH" ]]; then
  import_keys_from_zip "$IMPORT_ZIP_PATH"
fi

if [[ ! -f "$KEY_PATH" ]]; then
  ssh-keygen -t ed25519 -N "" -C "$EMAIL signing key" -f "$KEY_PATH" >/dev/null
  echo "Generated signing key: $KEY_PATH"
else
  echo "Signing key already exists: $KEY_PATH"
fi
```

秘密鍵が使えること確認（`ssh-keygen -Y sign …`）したら、スクリプトは公開鍵入り`allowed_signers`ファイルを書いてローカルGit設定を置く。

```bash
git -C "$REPO_DIR" config --local gpg.format ssh
git -C "$REPO_DIR" config --local user.signingkey "$RUNTIME_KEY_PATH"
git -C "$REPO_DIR" config --local gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS"
git -C "$REPO_DIR" config --local commit.gpgsign true
git -C "$REPO_DIR" config --local tag.gpgSign true
```

`--resign-all`で履歴書き換えを求めたら、スクリプトは対象コミットを`-S`で再署名する`git filter-branch`コマンドを組む。fork状態を尊重して、`upstream`にすでにあるコミットは任意で飛ばす。

最終結果は公開鍵と、GitHubの**Signing Key**欄に追加する手順をテスト方法付きで出す。

## なぜコミット署名するの

要らなかったと告白する瞬間だ。私のリポジトリは公開物に出所を求めない。リリースに署名タグも使わない。「なぜ」はこうだ。

- できたから、
- 見栄えするから（バッジ見た？）、
- `git filter-branch`とshellを試す口実になったから、
- ブログ用「自分で作った」ものがまた1つ増えたから。

ざっくり、格好付けたかっただけだ。でも道具いじりで好きなのはそこだ。

## 利用例

```bash
# 現リポジトリで初期設定
chmod +x ./setup-ssh-signing.sh
./setup-ssh-signing.sh --name "Your Name" \
                       --email "you@example.com"

# 別マシン用に鍵を書き出す
./setup-ssh-signing.sh --export-keys ./my-signing-keys.zip

# 2台目マシンに鍵を入れる
./setup-ssh-signing.sh --import-keys ./my-signing-keys.zip --repo ./my-repo \
                       --name "Your Name" --email "you@example.com"

# 履歴を書き換えてpushする
./setup-ssh-signing.sh --repo ./my-repo --name "Your Name" --email "you@example.com" \
                       --resign-all --autostash --autopush --yes
```

## 最後の考え

このスクリプトは小さな道具のままだ。でも自分で引き受ける原則がいくつかある。

- 暗号鍵はローカルにリポジトリごとに保つ、
- 求められない限りグローバル設定に触らない、
- 単純な import や export と履歴書き換えを出す、
- 再利用できる記録を残すため過程全部をブログ記事に文書化する。

自分のコミットに署名を足したくなったら試して！格好目当てで来たなら同じくね。😎
