---
title: SSHコミット署名スクリプトの解説
description: SSHコミット署名ヘルパーのウォークスルーと、なぜスタイリッシュなコミットにこだわったのか。
date: 2026-03-08
aiGenerated: true
authors:
  - fox3000foxy
tags:
  - git
  - security
  - shell
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "wHTcjh/unB0v5gHElSpxj6WbHqlwr3q+ksX8xxRC5pvA91Bih8pUQ5nM0T0j+nqsiAPs+0KHAOSDIvyjrBnd0w=="
---

# SSHコミット署名スクリプトの解説

この記事では、[Gist](https://gist.github.com/fox3000foxy/95500d129cd4bf5c173c323d2492569a)で公開した`setup-ssh-signing.sh`スクリプトを詳しく見ていく。各部分が何をするのか、どうやってリポジトリローカルなSSHコミット署名を簡単にするのか、そしてそもそもなぜこんなのを書いたのか（ネタバレ：コミットを**スタイリッシュ**に見せたかっただけ）を説明する。

## モチベーション

Gitのワークフローをカスタマイズするのがずっと大好きで、他の人がコミットの横に「Verified」バッジをつけてるのを見て、俺もやりたいと思ったんだ。組み込みのGPG署名はちょっと重いしグローバル設定が必要だから、小さなヘルパースクリプトを書いた：

- 署名専用のSSHキーを作成
- 現在のリポジトリだけに設定
- オプションで履歴を書き換えて過去のコミットに署名
- キーをマシン間で移行可能にする

正直、必要性はほとんど虚栄心だった。個人プロジェクトで署名が必要な技術的理由は何もない。でもコミットに緑色の「Verified」がついてるとカッコいいし、スクリプトを書くのはシェルスクリプトの面白い練習にもなった。

> つまり、コミットに署名するってのは、コードレビューに革ジャン着ていくようなものだ--まったく必要ないけど、ハッカーになった気分になれる。

## スクリプトの機能

このスクリプトは単一のBashファイルで、先頭に`set -euo pipefail`があって、エラーが起きたら即座に停止する。動作の概要は以下の通り：

1. **署名キーを生成またはインポート**  
   キーはスクリプトを実行したディレクトリの`.git-signing/`に保存される。
2. **Gitをローカル設定**  
   `gpg.format=ssh`、`user.signingkey`、`commit.gpgsign=true`、`tag.gpgSign=true`、そして公開鍵を指す`allowedSignersFile`を設定する。
3. **キーをマシン間で管理**  
   `--export-keys`/`--import-keys`で、グローバル設定に触れずに秘密鍵を別のコンピュータに移動できる。
4. **オプションの履歴書き換え**（`--resign-all`）  
   全ブランチ・全タグの全コミット（フォークの場合は`upstream`にないものだけ）を書き換え、`-S`で再コミットする。他の作者のコミットはそのまま。
5. **ユーティリティフラグ**  
   `--autostash`、`--autopush`、`--commit-date`、`--yes`（非対話モード）など。
6. **フォーク検出と安全対策**  
   `upstream`リモートを検出し、履歴書き換え前に警告し、必要なツール（`git`、`ssh-keygen`、`zip/unzip`）をチェックし、適切なパーミッションを確保し、必要に応じてキーの安全なランタイムコピーも作成する。

スクリプトは冪等性がある：2回実行してもキーが再生成されたり既存の設定が上書きされたりしない。

## ステップバイステップ解説

以下がコードの主要部分とその説明だ。

```bash
#!/usr/bin/env bash
set -euo pipefail

# 管理されたリポジトリローカルな方法でSSHコミット署名を設定する。
# - キーファイルはスクリプトを実行したディレクトリに作成される。
# - Git設定は現在のリポジトリのみにローカル設定される。
```

ヘッダーで安全性を確立し、目標をドキュメント化している。次のチャンクはCLIオプション（`--name`、`--email`、`--repo`など）を`while [[ $# -gt 0 ]]; do case … esac done`ループでパースする。必須のIDフィールドは後で検証される：

```bash
if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "Error: missing identity. Provide --name and --email." >&2
  exit 1
fi
```

キー生成は`$LAUNCH_DIR/.git-signing`で行われる。キーが既にあればそのままにして、`--import-keys`でZIPファイルから取り込める：

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

秘密鍵が使えることを確認した後（`ssh-keygen -Y sign …`）、スクリプトは小さな`allowed_signers`ファイルに公開鍵を書き込み、Gitのローカル設定を行う：

```bash
git -C "$REPO_DIR" config --local gpg.format ssh
git -C "$REPO_DIR" config --local user.signingkey "$RUNTIME_KEY_PATH"
git -C "$REPO_DIR" config --local gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS"
git -C "$REPO_DIR" config --local commit.gpgsign true
git -C "$REPO_DIR" config --local tag.gpgSign true
```

`--resign-all`で履歴書き換えを要求すると、スクリプトは適合するコミットを`-S`で再コミットする`git filter-branch`コマンドを構築する。フォーク状態を考慮して、必要に応じて`upstream`に既存のコミットをスキップする。

最後に公開鍵と、GitHubの**Signing Key**セクションに追加する手順を出力し、簡単なテスト方法も示す。

## なぜコミット署名？

ここが「実は必要なかった」って認める部分だ。俺のリポジトリは公開するものに由来証明を必要としないし、リリースに署名タグも使ってない。「なぜ」の理由は：

- できたから
- 見た目がきれいだから（バッジ見たことある？）
- `git filter-branch`やシェルスクリプトを試す口実になったから
- そしてブログの「俺が作ったもの」コンテンツのもう一つになるから

要するに：見せびらかしのためだけだけど、それがツールいじりの楽しさの半分だよね。

## 使用例

```bash
# 現在のリポジトリで初期セットアップ
chmod +x ./setup-ssh-signing.sh
./setup-ssh-signing.sh --name "Your Name" \
                       --email "you@example.com"

# 別のマシンで使うためにキーをエクスポート
./setup-ssh-signing.sh --export-keys ./my-signing-keys.zip

# 2台目のマシンでキーをインポート
./setup-ssh-signing.sh --import-keys ./my-signing-keys.zip --repo ./my-repo \
                       --name "Your Name" --email "you@example.com"

# 履歴を書き換えてプッシュ
./setup-ssh-signing.sh --repo ./my-repo --name "Your Name" --email "you@example.com" \
                       --resign-all --autostash --autopush --yes
```

## 最後に

このスクリプトは小さなユーティリティだが、いくつかの良いアイデアを凝縮している：

- 暗号キーをローカルかつリポジトリごとに管理する
- 頼まれもしないのにグローバル設定を触らない
- シンプルなインポート/エクスポートと履歴書き換えを提供する
- そしてその全プロセスをブログ記事に書く--なぜならそれがいいから

自分のコミットに署名を追加したくなったら、試してみてね！スタイルポイント目当てで来た人も、同じく。😎
