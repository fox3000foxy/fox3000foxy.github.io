---
title: "Repo to VPS：GitHub Actionsを永続ストレージ付き無料VPSに変える"
description: "GitHub Actionsランナーをgitを永続ストレージにして常設VPSに変える方法。tmate、inotify、commit --amend。"
date: 2026-05-29
tags:
  - github
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "RhZKmsi2v5aqUaMO8mYgo7NQ/xGxj9+yh6VlipF9RbV0awgC3RMbj2l568zUUbuEkH7ef9Rx47Hi7YfKCl4iQg=="
---

## GitHubは6時間の無料VPSをくれる。常設にする方法を見つけた。

GitHub Actionsは無料のLinuxマシンをくれる。

つまり本物のUbuntuサーバーだ。2コア、RAM 7GB、ディスク14GBだ。無料だ。1run 6時間だ。

唯一の「問題」：run終了で全部消えることだ。マシンは使い捨てだ。パッケージ入れて、コード書いて、設定して。ぱっと最後に全部消える。何もしなかったみたいにね。

ただし。

**gitをハードディスクにする**なら別だ。

そうすれば突然、runを生き延びる永続ディスク付きの無料VPSになる。再接続すれば全部残ってる。中断したところから続けられる。

完全にどうかしてる。説明させて。

---

## 背景：GitHub Actionsランナー

GitHub Actionsワークフローを走らせると、GitHubはVMをくれる。

コードをbuildして、テスト走らせて、deployするためのものだ。ワークフローが回って、仕事して、マシンは破棄される。

でもこのVMで他のことをするのを止めるものは何もない。たとえばSSHシェルを開いてサーバーとして使うとかね。

制約は、このマシンが**ステートレス**で**一時的**なことだ。
- 一時的：1run最大6時間（`timeout-minutes: 360`、GitHub上限）
- ステートレス：最後に全部消える

だから使えるVPSにするには2問題を解かなきゃいけない。
1. **リアルタイムでどう接続するか。**
2. **run間でディスクをどう保つか。**

ここから汚いハックになる。

---

## 問題1：tmateによる live SSH

**tmate**は共有可能SSHセッションを作るtmuxのフォークだ。

マシンで起動すると2リンクを生成する。
- SSH URL（`ssh xxx@nyc1.tmate.io`）
- ウェブURL（ブラウザ内ターミナル）

どちらかのリンクで接続すれば、はいマシン内のシェルだ。リアルタイムでね。

ワークフローはtmateを起動する。

```bash
tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
tmate -S /tmp/tmate.sock set-option -g remain-on-exit on

# 接続リンクを取る
tmate_ssh=$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')
tmate_web=$(tmate -S /tmp/tmate.sock display -p '#{tmate_web}')
```

このリンクはPythonスクリプトで直接リポジトリREADMEに書かれる。リポジトリを開いて、接続リンクを見て、押す。はいVPS入りだ。

1つ目の問題解決だ。でも本当にすごいのは2つ目だ。

---

## 問題2：gitをハードディスクにする

全部変える発想がこれだ。

マシンは各runで消える。だから**ファイルシステムを専用gitブランチ**に保存する。`filesystem`って名前だ。

起動時、スクリプトはこのブランチから状態を戻す。

```bash
filesystem_branch="filesystem"

# remoteからfilesystemブランチを取る
git fetch origin "$filesystem_branch":refs/remotes/origin/$filesystem_branch

# このブランチからワークスペースを戻す
git checkout -B filesystem-workspace "refs/remotes/origin/$filesystem_branch"
git reset --hard "refs/remotes/origin/$filesystem_branch"
```

`filesystem`ブランチが君のハードディスクだ。ファイルも、インストールも、設定も全部入りだ。

分かる？マシンは使い捨てだけど、ディスクはgitで生きる。ワークフローを再起動すればディスクが戻って、中断したところにぴったり戻る。

ハイバネートするVPSみたいなものだ。ハイバネーションがgitリポジトリなだけでね。

### 初回起動：空ディスクを作る

最初のrunでは`filesystem`ブランチはまだない。作らなきゃいけない。何気ないことじゃない。

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

`git checkout --orphan`が鍵だ。orphanブランチは**履歴なし**のブランチだ。空リポジトリから出直すみたいなものだ。

orphanなのはなぜか。永続ディスクにソースコード履歴全部を引きずってほしくないからだ。ディスクは隔離されたまま、独自の生を送る。真っさらで始まる。

頭の`git ls-remote --exit-code`はきれいな確認だ。「ブランチはremoteにもうある？」あるなら何も触らない。ないなら作る。冪等だ。大好きなやつだ。

### 選択的git clean：キャッシュを守る

この行は立ち止まる価値がある。

```bash
git clean -fdx -e .apt-cache -e .cache -e host.conf -e tmate.sock
```

`git clean -fdx`はgit管理外を全部消す。普通は荒い。ワークスペースを徹底掃除する。

でも`-e`（除外）が一部ファイルを守る。
- `.apt-cache` → APTパッケージキャッシュ（後で触れる。賢い）
- `.cache` → 汎用キャッシュ
- `host.conf` → セッションのSSHアドレス
- `tmate.sock` → 進行中tmateセッションのソケット

ここ掃除したら、活性セッションを壊すかキャッシュを失う。だからリセット中は見逃す。

一見どうでもいい詳細だけど、これなしでは全部壊れる。

---

## 自動保存：全部見るinotify

でもファイルはどうやって`filesystem`ブランチに入るの？

答え：全ファイル変更を見て自動コミットやpushするウォッチャーだ。

魔法道具は**inotifywait**（`inotify-tools`パッケージ）だ。カーネル水準でファイルシステムを見て、ファイルが変われば発火する。

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock|\.gitignore|\.txt\.swp)(/|$)' .; do
    echo "[autosave] change detected"
    commit_and_push
    sleep 1   # 一気に大量変化したらデバウンス
  done
}

autosave &
```

inotifyフラグをほどく。各々大事だからね。
- `-r` → 再帰、全サブフォルダを見る
- `-e modify,create,delete,move` → この4種イベントに反応する
- `--exclude '...'` → 一部ファイルを無視する正規表現

`--exclude`が重要だ。無視するものを見て。
- `.git` → 当たり前。しないと各コミットが自動保存を起こしてコミットを起こして。無限ループだ。大惨事だ。
- `.apt-cache`と`.cache` → キャッシュ。常に変わってgitに垂れ流したくない
- `host.conf`と`tmate.sock` → セッションファイル。止まらず動く
- `.gitignore`、`.txt.swp` → 一時ファイル（`.swp`はvim編集ファイル）

この除外なしでは、自分の変化にループ発火する自動保存になる。リスト内の`.git`が、自分の足を撃たないための行だ。

ファイル変えた？inotifyが即検出して、コミットして、pushする。1秒未満で変化が`filesystem`ブランチに入る。

パッケージ入れる、コード書く、設定触る。全部リアルタイム自動保存だ。何もしなくてもね。

文字通りディスク全体の自動保存システムだ。どうかしてる。

### デバウンス：gitを荒らさない

各保存後の`sleep 1`は**デバウンス**だ。

エディターでファイルを保存すると、たいてい連発で複数ファイルシステムイベントが出る（一時ファイル作成、改名、旧削除など）。デバウンスなしでは1保存で3、4コミットが起こる。

`sleep 1`はこう言う。「保存後に1秒待って、連発が落ち着くまで次の監視を待つ」ってね。近い変化を1コミットにまとめる。賢い。

### 保険に定期的保存も

inotifyがイベントを取りこぼした場合に備えて、5秒ごとの保存もある。

```bash
periodic_save() {
  while true; do
    sync_from_remote   # 遠隔変化があれば取る
    sleep 5
    commit_and_push
  done
}

periodic_save &
```

ベルトと吊りバンドだ。ディスク状態は絶対失いたくない。

---

## 賢い詳細：コミット1つだけ

ファイル変化ごとにコミットしたら、何千コミットも溜まる。1時間セッションでgit履歴が爆発する。リポジトリが巨大になる。汚い。

解は優雅だ。**新規作成じゃなく既存コミットを amend する**んだ。

```bash
commit_and_push() {
  (
    flock -n 200 || return   # 2つの保存が同時回転しないようロック

    git add -A
    git reset -- .github/workflows/ .github/scripts/   # スクリプトは触らない

    if ! git diff --cached --quiet; then
      if git rev-parse --verify HEAD >/dev/null 2>&1; then
        git commit --amend --no-edit    # AMEND：直前コミットを上書き
      else
        git commit -m "autosave $(date -u +%Y%m%dT%H%M%SZ)"
      fi
      git push --force origin "filesystem-workspace:filesystem"
    fi
  ) 200>/tmp/tmate_autosave.lock
}
```

`git commit --amend`の意味はこうだ。「最終コミットをこれに置き換えろ」ってことだ。

だから`filesystem`ブランチは常にコミット1つだ。何回保存してもね。現状態のスナップショット1つを何度も強制pushするだけだ。

`flock`は錠だ。保存ループが2つあるから（inotifyと定期的）、git同時起動で踏み合わないようにする。gitプロセスは一度に1つだ。

きれいだ。

---

## sync_from_remote：複数セッションをさばく

最初は思いつかないケースがある。2 run同時起動したらどうなるの？あるセッションが別動作中に`filesystem`ブランチを変えたら？

スクリプトは各コミット前の`sync_from_remote`でさばく。

```bash
sync_from_remote() {
  git fetch origin "filesystem":refs/remotes/origin/filesystem
  git merge --ff-only "refs/remotes/origin/filesystem"
}
```

`--ff-only`（fast-forwardのみ）が大事だ。「きれいに進められるときだけマージして、マージコミットは作らない」って意味だ。

両ブランチが分岐してたら（たとえば2セッションが違うファイルを変えたら）、fast-forwardは静かに失敗して（`2>/dev/null || true`）、ローカル状態を保つ。完全なマージ機構じゃないけど、単一セッションが回る単純ケースの破損は避ける。

正直、同じリポジトリで3セッション並列はやらない方がいい。でも起きても爆発しないようコードは頑張る。防御だ。

---

## APTキャッシュ：速く入れる

ワークフローに目立たないけど考え抜かれた詳細がある。

```yaml
- name: Cache & install APT packages (tmate + watcher)
  uses: awalsh128/cache-apt-pkgs-action@v1.6.0
  with:
    packages: tmate inotify-tools
```

tmateとinotify-toolsはAPTパッケージを**キャッシュする**アクション経由で入る。

初回runは落として入れる。次回runはGitHub Actionsキャッシュから戻る。速い。再ダウンロード不要だ。

さっきの`git clean -fdx -e .apt-cache`覚えてる？つながってる。`.apt-cache`フォルダは掃除から守られてて、セッション中に入れたパッケージが最低限残れる。

全部つながってる。完全なライフサイクルを考えた。

---

## /tmpに隠したスクリプト

まだ意地悪だけど賢い詳細だ。スクリプトの最初の方でこうだ。

```bash
RUNNER_SCRIPTS_DIR="/tmp/runner-scripts"
rm -rf "$RUNNER_SCRIPTS_DIR"
mkdir -p "$RUNNER_SCRIPTS_DIR"
cp -r .github/scripts "$RUNNER_SCRIPTS_DIR/"
```

スクリプト（`update_readme.py`など）は`filesystem`ブランチに触る前に`/tmp`へコピーされる。

なぜか。`filesystem`ブランチ（最初は空か、ディスク入り）への`git reset --hard`をやると、ソースリポジトリの`.github/scripts`ファイルはワークスペースから消えるからだ。

でもスクリプトはセッション中まだ要る（tmate再起動ごとにREADME更新するため）。だからgitの届かない`/tmp`に隠す。

```bash
python3 "$RUNNER_SCRIPTS_DIR/scripts/update_readme.py" --ssh "$tmate_ssh" ...
```

考えないと、スクリプトが消えた理由探しに30分溶かす。考えた。

---

## あつらえシェル

ちょっとした快適：セッションは素bashじゃなく設定済みシェルをくれる。

`prestart.sh`が自作`.bashrc`をコピーする。

```bash
if ! grep -q "Custom prompt and aliases for remote sessions" "$HOME/.bashrc"; then
  cp .github/scripts/remote_bashrc "$HOME/.bashrc"
fi
sudo cp "$HOME/.bashrc" /root/.bashrc
```

この`.bashrc`は色付きプロンプトとエイリアス（`ll`、`lla`、`rm -i`）と、何より`exit`の上書きを持つ。

```bash
exit() {
    killall -9 -u "$(whoami)" tmate 2>/dev/null || true
    builtin exit "$@"
}

# Ctrl+Dはexitと同じ
bind -x '"\C-d": "exit"'
```

`exit`（かCtrl+D）を打てば、閉じる前にtmateプロセスをきれいに殺す。ゾンビtmateセッションを残さない。

`tmate-detach`関数もある。セッション殺さず切断したいとき用だ（後で再接続するため）。快適詳細だけど、手入れ水準を示す。

---

## 1人で再起動するtmate

ちょっとした快適：シェルで`exit`を打つと、普通tmateセッションは死んで完全に切断される。

でもここではtmateは`while true`ループ内だ。

```bash
while true; do
  tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
  while tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' >/dev/null 2>&1; do
    sleep 2
  done
  echo "tmate session ended; restarting..."
done
```

`exit`する？セッションは1人で再起動する。同じリンクで再接続する。

ばかみたいだけど、セッションを使えるようにする。

---

## 1コマンド再接続

ログを漁らず切断後にどう再接続するの？

tmateのSSHアドレスは`host.conf`ファイルに書かれて、`filesystem`ブランチにコミットされる。

```bash
printf '%s' "${tmate_ssh#ssh }" > host.conf
```

このファイルはgit内だから、GitHub API経由で1コマンドで取れる。

```bash
ssh "$(gh api -H 'Accept: application/vnd.github.v3.raw' \
  "/repos/USER/REPO/contents/host.conf?ref=filesystem" | tr -d '\r\n')"
```

これを走らせれば、リポジトリ内の現SSHアドレスを取りに行って接続する。セッション間でアドレスが変わってもね。

---

## 完全フロー

まとめよう。

1. ワークフローを起こす（pushか手動ボタン）
2. GitHubがUbuntu VMをくれる
3. スクリプトが「filesystem」ブランチからディスクを戻す
4. inotifyが全変化の監視を始める
5. periodic_saveが5秒ごとに保険コミットする
6. tmateが起動してSSHやウェブリンクを生成する
7. リンクはREADMEとhost.confに書かれる
8. sshかウェブターミナルで接続する
9. 好きにやる。各ファイル変化は自動保存だ
10. 6時間後、GitHubがVMを殺す
11. ディスクは「filesystem」ブランチで無事だ
12. ワークフロー再起動→手順3に戻る。全部残ってる

gitとGitHub Actionsだけの永続ディスク付き無料VPSだ。

---

## 正直に言おう：限界

ハックだ。本物VPSじゃない。だからこうだ。

- **1run最大6時間。** ワークフロー定期再起動が必要だ。各runで稼働制限だ。
- **開発と探索用だ。** サイトをホストしない。探索、開発、デバッグ、使い捨てだけど戻せるLinux環境試し用だ。
- **GitHubは全部見る。** 向こうのマシンだ。繊細なものは置かない。
- **リポジトリは非公開に保つ。** SSHシェルを出してる。公開リポジトリは誰でも接続できる可能性がある。悪い考えだ。
- **利用条件の際だ。** GitHub ActionsはCI/CD用で、無料VPS用じゃない。だから控えめに、正当に、乱用せず使う。

### 本当のアキレス腱：gitは大きいファイル嫌い

gitはテキスト用で、ファイルシステム用じゃない。

永続ディスクはgitブランチで生きる。保存するものは全部gitを通る。gitはこうだ。
- 大きいバイナリが苦手だ（gitに2GBのDockerイメージ？忘れて）
- GitHubではファイル100MB上限だ（hard limit、超えたらpushできない）
- リポジトリ約5GB未満推奨だ

だから500MBの`node_modules`付きプロジェクトを`npm install`したり、重いバイナリ作るプロジェクトをbuildしたりしたら、`filesystem`へのpushは死ぬほど遅いか完全に失敗する。

`git commit --amend`は助ける（コミット1つ、膨らむ履歴なし）。でも200MBファイルが通らない事実は変わらない。

ざっくり、**コードも設定も小さいファイルも最高に動く。大きいデータやバイナリ成果物の保存は動かない。** セッションでやることに気をつける。

### 完全なシステムスナップショットじゃない

大事なニュアンスもう1つ：`filesystem`ブランチが保存するのは**ワークスペース**（リポジトリフォルダ）であって、システム全体じゃない。

`apt install htop`したら、バイナリはワークスペース外の`/usr/bin/htop`に行く。だから保存されない。次runで入れ直しだ。

だからAPTキャッシュと`prestart.sh`がある。残るのはワークスペースだけだから、各起動でシステム環境を準備し直すためだ。

インストールを残したければワークスペースに入れる（システムじゃなくローカルフォルダに入れるとか）。組み込む体操だ。

---

## 無料VPS対本物VPS：対決

| | repo-to-vps | 本物VPS（月5ユーロ） |
|---|---|---|
| **価格** | 0円 | 月約5-10ユーロ |
| **稼働** | 6時間、再起動要 | 24時間365日 |
| **ディスク** | gitブランチ、小さいファイル | 本物SSD、数GB |
| **RAM** | 約7GB（太っ腹！） | 1-2GBが多い |
| **CPU** | 2-4コアまとも | 1-2 vCPU |
| **立ち上げ** | テンプレをクローン | 手動設定 |
| **永続** | ワークスペースのみ | 完全システム |
| **正当性** | 利用条件の際 | 100%きれい |

面白いのは、素 specs（RAM、CPU）ではGitHubランナーが5ユーロVPSより良いことが多いってことだ。でも6時間稼働とワークスペース限定永続が、ハッカーおもちゃにして本物サーバーにしないものだ。

学ぶ、試す、Linuxシステムを戻せる環境でさっとデバッグする？最適だ。真面目なものをホストする？本物VPSを取って。

でも好きなときに復元できる一時Linux環境には？ただ最高だ。

---

## 全部裏にあるパターン

引いて見ると、repo-to-vpsとメールボット（別記事）は同じ考えに立つ。

> **gitはバージョン管理だけじゃない。永続で無料でバージョン付きでAPI経由のストレージシステムだ。**

ステートレス機構（GitHub Actions、Worker、サーバーレス関数）があって、2実行間で状態を保ちたいとき、gitは「ディスク」になれる。

- メールボットは`lastId`をgitタグに保存する。
- repo-to-vpsはファイルシステム全体をgitブランチに保存する。

同じパターン、違う規模だ。片方は値1つ、もう片方はディスク1つだ。

`git commit --amend`と強制pushが共通技術だ。**現状態を表す単一コミットを保って、各更新で上書きする**んだ。

そのためじゃない。でも動く。無料だ。

---

**覚えるべき3点：**

1. **gitブランチ1つは永続ハードディスクだ**。ファイルシステムを専用ブランチに保存して、起動時に戻せば、使い捨てマシンを生き延びる状態になる。

2. **inotifyとgitでリアルタイム自動保存**。`inotifywait`がカーネル水準で変化を見てgitへ即pushする。`git commit --amend`できれいな単一コミットを保つ。

3. **tmateがランナーをVPSに変える**。GitHub Actionsマシンへの live SSHで、自動再起動とGitHub API経由1コマンド再接続付きだ。

gitをハードディスクに、第2話だ。gitブランチに全部保存して終わりそうだ。
