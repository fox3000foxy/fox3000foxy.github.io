---
title: "Repo to VPS：GitHub Actionsを無料の永続VPSにする方法"
description: GitHub Actionsランナーを永続的なVPSに変える方法----gitをストレージとして使い、tmate、inotify、commit --amendを活用。
date: 2026-05-29
authors:
  - fox3000foxy
tags:
  - github
  - devops
  - automation
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "hS2Mjmtvw9NsT+XbFpM2NZNORgaSJiNUNB0C8fuUYQkqar92VqglEbmoC8sONXsqPNCuPEq8jQDyzZ2ztepKNg=="
---

## GitHubが6時間だけ無料のVPSをくれる。俺はそれを永久にする方法を見つけた。

GitHub Actionsが無料のLinuxマシンをくれるんだ。

そう、本物のUbuntuサーバーを。2コア、7GB RAM、14GBディスク。無料。1回のrunにつき6時間。

唯一の「問題」：runが終わると全部消える。マシンは使い捨て。何かインストールして、コード書いて、設定して…そしてぱっ、終わると全部消える。何もなかったかのように。

ただし。

**gitをハードディスクとして使う**なら別だ。

そして突然、永続ディスク付きの無料VPSが手に入る。runが終わっても生き残る。再接続すれば、全部まだある。続きから再開できる。

完全にぶっ壊れてる。説明させてくれ xD

---

## 背景：GitHub Actionsランナー

GitHub Actionsのワークフローを起動すると、GitHubがVMをくれる。

コードをビルドして、テストして、デプロイするためのもの。ワークフローが動いて仕事をして、マシンは破棄される。

でも、そのVMで別のことだってできる。SSHシェルを開いてサーバーとして使うとか。

ただ、これらのマシンは **ステートレス** で **一時的** だ：
- 一時的：1runあたり最大6時間（`timeout-minutes: 360`、GitHubの上限）
- ステートレス：終わると全部消える

だからVPSとして使えるようにするには、2つの問題を解決する必要がある：
1. **リアルタイムでどうやって接続するか？**
2. **run間でディスクをどうやって保持するか？**

ここからが汚い天才ハックの始まりだ。

---

## 問題1：tmateでライブSSH

**tmate** はtmuxのフォークで、共有可能なSSHセッションを作る。

マシン上で起動すると、2つのリンクを生成する：
- SSH URL（`ssh xxx@nyc1.tmate.io`）
- Web URL（ブラウザ上のターミナル）

どちらかのリンクで接続すれば、boom、マシンのシェルに入れる。リアルタイムで。

ワークフローがtmateを起動する：

```bash
tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
tmate -S /tmp/tmate.sock set-option -g remain-on-exit on

tmate_ssh=$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')
tmate_web=$(tmate -S /tmp/tmate.sock display -p '#{tmate_web}')
```

これらのリンクはPythonスクリプトで直接リポジトリのREADMEに書き込まれる。リポジトリを開いて、接続リンクを見て、クリックする。VPSにログイン完了。

最初の問題は解決。でも2つ目が本当にヤバい。

---

## 問題2：gitをハードディスクとして使う

これが狂ったやつ。

runごとにマシンは消される。だから **ファイルシステムを専用のgitブランチ**（`filesystem` という名前）に保存する。

起動時に、スクリプトがそのブランチから状態を復元する：

```bash
filesystem_branch="filesystem"

git fetch origin "$filesystem_branch":refs/remotes/origin/$filesystem_branch

git checkout -B filesystem-workspace "refs/remotes/origin/$filesystem_branch"
git reset --hard "refs/remotes/origin/$filesystem_branch"
```

`filesystem` ブランチが**お前のハードディスクだ**。ファイル、インストールしたもの、設定 -- 全部そこにある。

わかるか？マシンは使い捨てだが、ディスクはgitの中に生きている。ワークフローを再実行すれば、ディスクが復元されて、続きから再開できる。

ハイバネートするVPSみたいなもの。ただしハイバネーションはgitリポジトリだ xD

### 最初の起動：空のディスクを作成

最初のrunでは、`filesystem`ブランチはまだ存在しない。作る必要がある。しかもそれは簡単じゃない：

```bash
ensure_filesystem_branch() {
  if ! git ls-remote --exit-code origin "refs/heads/$filesystem_branch" >/dev/null 2>&1; then
    git checkout --orphan filesystem-workspace
    git rm -rf --cached .
    git clean -fdx -e .git -e .github -e .github/scripts -e .github/workflows
    git commit --allow-empty -m "init filesystem (empty)"
    push_filesystem
  fi
}
```

`git checkout --orphan` が鍵だ。孤立ブランチとは **履歴がまったくない** ブランチ -- 空のリポジトリからやり直すようなもの。

なぜ孤立ブランチか？永続ディスクにソースコードの全履歴を引きずらせたくないからだ。ディスクは独立したもので、独自の人生がある。真っさらから始まる。

`git ls-remote --exit-code` は単なるクリーンなチェック：「このブランチはリモートに既にあるか？」あれば何もしない。なければ作る。冪等性。

### 選択的git clean：キャッシュを守る

この行は注目に値する：

```bash
git clean -fdx -e .apt-cache -e .cache -e host.conf -e tmate.sock
```

`git clean -fdx` はgitで追跡されてないものを**全部**消す。通常は暴力的だ -- ワークスペースを完全に掃除する。

でも `-e`（除外）がいくつかのものを守る：
- `.apt-cache` → APTパッケージのキャッシュ（後で出てくる、賢いやつだ）
- `.cache` → 汎用キャッシュ
- `host.conf` → セッションのSSHアドレス
- `tmate.sock` → 現在のtmateセッションのソケット

これらのファイルを掃除すると、アクティブなセッションを壊すかキャッシュを失う。だからリセット中は除外する。

一目見ただけでは気づかないけど、「動く」と「本当に動く」の差を生む細かい配慮だ。

---

## オートセーブ：すべてを監視するinotify

でも、どうやってファイルが `filesystem` ブランチに入るのか？

答え：**すべての**ファイル変更を監視して自動的にcommit/pushするウォッチャー。

魔法のツールは **inotifywait**（`inotify-tools` パッケージ）。カーネルレベルでファイルシステムを監視し、ファイルが変更されるとトリガーする。

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock|\.gitignore|\.txt\.swp)(/|$)' .; do
    echo "[autosave] change detected"
    commit_and_push
    sleep 1
  done
}

autosave &
```

inotifyのフラグを分解してみよう、それぞれに意味がある：
- `-r` → 再帰的、すべてのサブディレクトリを監視
- `-e modify,create,delete,move` → この4種類のイベントに反応（変更、作成、削除、移動）
- `--exclude '...'` → 特定のファイルを無視する正規表現

`--exclude` は極めて重要。何を無視しているか見てみよう：
- `.git` → 当然だ。さもないとcommitごとにautosaveが発動し、それがまたcommitを発動して…無限ループ。大惨事。
- `.apt-cache` と `.cache` → 頻繁に変わるキャッシュ。gitに大量に送りたくない。
- `host.conf` と `tmate.sock` → 絶えず変化するセッションファイル
- `.gitignore`、`.txt.swp` → 一時ファイル（`.swp` はvimの編集ファイル）

このexcludeがなければ、autosaveが自分の変更でループすることになる。リストの中の `.git` は、自爆を防ぐための最重要ラインだ。

ファイルを変更する？inotifyが瞬時に検出して、commit、push。1秒も経たないうちに、変更が `filesystem` ブランチに反映される。

何かをインストールする、コードを書く、設定をいじる -- すべてリアルタイムで自動保存される。何もする必要はない。

文字通りディスク全体の自動保存システムだ。ヤバい。

### デバウンス：gitをスパムしない

各保存後の `sleep 1` は **デバウンス** だ。

エディタでファイルを保存すると、複数のファイルシステムイベントが一気に発生することが多い（一時ファイル作成、リネーム、古いファイル削除…）。デバウンスなしだと、1回の保存で3〜4回のcommitが発生する。

`sleep 1` はこう言っている：「保存後は1秒待って、バーストが収まるのを待ってから、次の監視を再開する」。近接した変更を1つのcommitにまとめる。賢い。

### さらに定期的な保存も

inotifyが何かを逃した場合に備えて、5秒ごとの保存もある：

```bash
periodic_save() {
  while true; do
    sync_from_remote
    sleep 5
    commit_and_push
  done
}

periodic_save &
```

二重の安全策。ディスクの状態を絶対に失いたくない。

---

## 賢い詳細：たった1つのcommit

ファイルが変わるたびにcommitすると数千のcommitが溜まる。1時間のセッションでgit履歴が爆発する。リポジトリが巨大になる。汚い。

解決策はエレガント：**新しいcommitを作る代わりに、既存のcommitをamendする**。

```bash
commit_and_push() {
  (
    flock -n 200 || return

    git add -A
    git reset -- .github/workflows/ .github/scripts/

    if ! git diff --cached --quiet; then
      if git rev-parse --verify HEAD >/dev/null 2>&1; then
        git commit --amend --no-edit
      else
        git commit -m "autosave $(date -u +%Y%m%dT%H%M%SZ)"
      fi
      git push --force origin "filesystem-workspace:filesystem"
    fi
  ) 200>/tmp/tmate_autosave.lock
}
```

`git commit --amend` は「最後のcommitをこれで置き換える」という意味だ。

つまり `filesystem` ブランチは**常に1つのcommitしか持たない**。何回保存しても同じだ。単に現在の状態のスナップショットで、何度もforce-pushされる。

`flock` はロックだ：2つの保存ループ（inotify + 定期）があるから、同時にgitを実行して衝突するのを防ぐ。一度に1つのgitプロセスだけ。

クリーンだ。

---

## sync_from_remote：複数セッションの処理

ああ、最初は思いつかないこと：もし2つのrunを同時に起動したら？または、あるセッションが `filesystem` ブランチを変更している間に別のセッションが動いていたら？

スクリプトは各commitの前に `sync_from_remote` でこれを処理する：

```bash
sync_from_remote() {
  git fetch origin "filesystem":refs/remotes/origin/filesystem
  git merge --ff-only "refs/remotes/origin/filesystem"
}
```

`--ff-only`（fast-forward only）が重要：「マージコミットを作らずに、きれいに進められる場合だけマージする」という意味だ。

2つのブランチが分岐した場合（例えば2つのセッションが別々のものを変更した）、fast-forwardは静かに失敗し（`2>/dev/null || true`）、ローカル状態を維持する。完璧なマージシステムではないが、1つのセッションだけが動いている単純なケースでは破損を防げる。

正直、同じリポジトリで3つのセッションを並行実行するべきじゃない。でもコードはそれでも爆発しないようにしようとしている。防御だ。

---

## APTキャッシュ：高速インストール

ワークフローの中に、地味だけどよく考えられた詳細がある：

```yaml
- name: Cache & install APT packages (tmate + watcher)
  uses: awalsh128/cache-apt-pkgs-action@v1.6.0
  with:
    packages: tmate inotify-tools
```

tmateとinotify-toolsは **APTパッケージをキャッシュする** アクションを使ってインストールされる。

最初のrunではダウンロードしてインストール。以降のrunではGitHub Actionsのキャッシュから復元 -- 高速で、再ダウンロード不要。

さっきの `git clean -fdx -e .apt-cache` を覚えてる？それと関連してる。`.apt-cache` ディレクトリは、セッション中にインストールしたパッケージが最低限永続化できるように、掃除から保護されている。

全部が繋がってる。ライフサイクル全体を考えてた。

---

## /tmpに隠されたスクリプト

またしても狡猾で賢い詳細。スクリプトの最初の方で：

```bash
RUNNER_SCRIPTS_DIR="/tmp/runner-scripts"
rm -rf "$RUNNER_SCRIPTS_DIR"
mkdir -p "$RUNNER_SCRIPTS_DIR"
cp -r .github/scripts "$RUNNER_SCRIPTS_DIR/"
```

スクリプト（`update_readme.py` など）は `filesystem` ブランチに触る**前に** `/tmp` にコピーされる。

なぜか？`git reset --hard` を `filesystem` ブランチ（最初は空、またはディスクの中身が入っている）に対して実行すると、ソースリポジトリの `.github/scripts` ファイルがワークスペースから消えるからだ。

でもスクリプトはセッション中も必要だ（tmateが再起動するたびにREADMEを更新するため）。だから `/tmp` に隠して、gitの手の届かないところに置き、後で呼び出せるようにする：

```bash
python3 "$RUNNER_SCRIPTS_DIR/scripts/update_readme.py" --ssh "$tmate_ssh" ...
```

考えないとぶち当たるバグだ：「なんでスクリプトが消えたんだ？」自分は考えてた。

---

## カスタムシェル

最後の小さな快適さ：セッションは設定済みのシェルをくれる。素のbashじゃない。

`prestart.sh` がカスタム `.bashrc` をコピーする：

```bash
if ! grep -q "Custom prompt and aliases for remote sessions" "$HOME/.bashrc"; then
  cp .github/scripts/remote_bashrc "$HOME/.bashrc"
fi
sudo cp "$HOME/.bashrc" /root/.bashrc
```

この `.bashrc` にはカラフルなプロンプト、エイリアス（`ll`、`lla`、`rm -i`）、そして何より賢い仕掛けが入ってる：`exit` のオーバーライド：

```bash
exit() {
    killall -9 -u "$(whoami)" tmate 2>/dev/null || true
    builtin exit "$@"
}

bind -x '"\C-d": "exit"'
```

`exit`（またはCtrl+D）を打つと、閉じる前にtmateプロセスをきれいにkillする。マシンにゾンビtmateセッションが残るのを防ぐ。

セッションを**殺さずに**切断したい場合（後で再接続するため）の `tmate-detach` 関数もある。快適さのためだが、気配りのレベルの高さがわかる。

---

## 自動再起動するtmate

ちょっとした快適さ：シェルで `exit` と打つと、普通はtmateセッションが死んで完全に切断される。

でもここでは、tmateは `while true` ループの中にある：

```bash
while true; do
  tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
  while tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' >/dev/null 2>&1; do
    sleep 2
  done

  echo "tmate session ended; restarting..."
done
```

`exit` した？セッションが自動で再起動する。同じリンクで再接続できる。

馬鹿げてるけど、これで使えるものになる。

---

## ワンコマンドでの再接続

切断後、毎回runのログを探しまわらずにどうやって再接続するのか？

tmateのSSHアドレスは `host.conf` ファイルに書き込まれ、それ自身が `filesystem` ブランチにコミットされる：

```bash
printf '%s' "${tmate_ssh#ssh }" > host.conf
```

このファイルはgitにあるから、GitHub APIを使って1つのコマンドで取得できる：

```bash
ssh "$(gh api -H 'Accept: application/vnd.github.v3.raw' \
  "/repos/USER/REPO/contents/host.conf?ref=filesystem" | tr -d '\r\n')"
```

これを実行すると、リポジトリから現在のSSHアドレスを取得して、直接接続する。セッション間でアドレスが変わっても大丈夫。

超スムーズだ。

---

## 完全な流れ

全体をおさらいしよう：

```
1. ワークフローを起動する（pushまたは手動ボタン）
2. GitHubがUbuntu VMをくれる
3. スクリプトが "filesystem" ブランチからディスクを復元
4. inotifyがすべての変更を監視開始
5. periodic_saveが5秒ごとにバックアップcommit
6. tmate起動 → SSH/Webリンクを生成
7. リンクがREADME + host.confに書き込まれる
8. SSHまたはWebターミナルで接続
9. 好きなことをする（コーディング、インストール、デバッグ）
   └── ファイル変更ごと = gitへの即時autosave
10. 6時間後、GitHubがVMを停止
11. でもディスクは "filesystem" ブランチに無傷で残っている
12. ワークフローを再実行 → ステップ3に戻る、全部まだある
```

VPS。無料。永続ディスク付き。gitとGitHub Actionsだけで。

---

## 正直になろう：限界

これはハックであって、本物のVPSではない。だから：

- **1runあたり最大6時間。** 定期的にワークフローを再実行する必要がある。無限のアップタイムはない。
- **本番用ではない。** そこにサイトをホストしたりしない。探索、開発、デバッグ、使い捨てだけど復元可能なLinuxで何か試すためのものだ。
- **GitHubはすべてを見ている。** 彼らのマシンだ。機密情報は置くな。
- **リポジトリは非公開にしろ。** SSHシェルを公開している。公開リポジトリ = 誰でも接続できる可能性がある。悪いアイデアだ。
- **利用規約のグレーゾーンだ。** GitHub ActionsはCI/CDのためであり、無料VPSのためではない。控えめに、正当な目的で、乱用せずに使うこと。

### 本当のアキレス腱：gitは大容量ファイルが苦手

もっと技術的な限界があって、これが一番理解すべき重要事項だ。

**gitはテキスト用であり、ファイルシステム用ではない。**

永続ディスクはgitブランチの中に存在する。つまり保存するものはすべてgitを通る。そしてgitは：
- 大きなバイナリファイルを苦手とする（2GBのDockerイメージをgitに？無理）
- GitHubでは1ファイルあたり100MBの制限がある（ハードリミット、それ以上はpushできない）
- リポジトリ全体で〜5GB以下を推奨

つまり、500MBの `node_modules` があるプロジェクトで `npm install` したり、大きなバイナリを生成するものをビルドしたりすると、`filesystem` へのpushが激しく遅くなるか、完全に失敗する。

`git commit --amend` は役立つ（1つのcommitだけ、履歴が膨らまない）が、200MBのファイルが通らないことに変わりはない。

要するに：**コード、設定、小さなファイルには最高に使える。大きなデータやバイナリアーティファクトの保存には使えない。** セッションで何をするか、それを頭に入れておく必要がある。

### 完全なシステムスナップショットではない

もう1つの重要なニュアンス：`filesystem` ブランチが保存するのは **ワークスペース**（リポジトリのディレクトリ）だけで、システム全体ではない。

`apt install htop` を実行すると、バイナリは `/usr/bin/htop` に行く。これはワークスペースの**外**だ。だから保存され**ない**。次のrunでは再インストールが必要だ。

だからAPTキャッシュと `prestart.sh` がある：システム環境を毎回再準備するためだ。永続化するのはワークスペースだけだから。

インストールしたものを残したいなら、ワークスペース内に入れる必要がある（システム全体ではなくローカルディレクトリにインストールするなど）。それは慣れる必要がある考え方の切り替えだ。

---

## 無料VPS vs 本物のVPS：対決

| | repo-to-vps | 本物のVPS（月5€） |
|---|---|---|
| **価格** | 0€ | 〜5-10€/月 |
| **アップタイム** | 6時間、再起動必要 | 24/7 |
| **ディスク** | gitブランチ、小さいファイル | 本物のSSD、数GB |
| **RAM** | 〜7GB（太っ腹！） | よくて1-2GB |
| **CPU** | 2-4コア（良好） | 1-2 vCPU |
| **セットアップ** | テンプレートをクローン | 手動設定 |
| **永続性** | ワークスペースのみ | 完全なシステム |
| **正当性** | 利用規約の境界 | 100%クリーン |

面白いのは、生のスペック（RAM、CPU）では、GitHubランナーが5€のVPSより**優れている**ことが多いことだ。でも6時間のアップタイム制限とワークスペース限定の永続性が、これをハッカーのおもちゃにしていて、本物のサーバーにはしていない。

素早くLinuxの何かを学んだり、テストしたり、デバッグしたり、復元可能な環境でやるには？完璧。何か真面目なものをホストするため？本物のVPSを買え。

でも、好きな時に復元できる一時的なLinux環境としては？ただただ素晴らしい。

---

## この背後にあるパターン

一歩引いて見ると、repo-to-vpsとメールボット（俺の別の記事）は同じアイデアに基づいている：

> **gitは単なるバージョン管理システムではない。無料で、バージョン管理され、APIからアクセス可能な永続ストレージシステムだ。**

ステートレスなシステム（GitHub Actions、Worker、サーバーレス関数）があって、実行間で状態を保持したいなら、gitを「ディスク」として使える。

- メールボットは `lastId` をgitタグに保存する。
- repo-to-vpsはファイルシステム全体をgitブランチに保存する。

同じパターン、2つのスケール。一方は値、もう一方はディスク。

そして `git commit --amend` + force-push が共通のテクニックだ：**現在の状態を表す1つのcommitを維持し、更新ごとに上書きする。** 履歴が膨らまず、生きたスナップショットだけがある。

本来はこういう用途じゃない。でも動く。しかも無料だ。そしてそれが美しい。

---

**覚えておくべき3つのこと：**

1. **gitブランチ = 永続ハードディスク** -- ファイルシステムを専用ブランチに保存し、起動時に復元すれば、使い捨てマシンを超えて生き残る状態が手に入る。

2. **inotify + git = リアルタイム自動保存** -- `inotifywait` がカーネルレベルの変更を監視し、即座にgitにpushする。`git commit --amend` で1つのクリーンなcommitを維持。

3. **tmateがランナーをVPSに変える** -- GitHub ActionsマシンへのライブSSH。自動再起動と、GitHub API経由のワンコマンド再接続付き。

gitをハードディスクとして、第二弾。いつか全部gitブランチに保存するようになりそうだ xD
