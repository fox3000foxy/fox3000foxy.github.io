---
title: "Repo to VPS：将GitHub Actions变成免费持久化VPS"
description: 如何将GitHub Actions runner变成永久VPS，用git作为持久化存储----tmate、inotify和commit --amend。
date: 2026-05-29
tags:
  - github
  - devops
  - vps
  - actions
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "fpX6I9Ojw/mDEG/4tv4dGHWUeD+3jicWghbAjty9YoztIAoGJAtn1pz4N/wk1QFDcg5YT3DKaaRrJEfIJzJcRA=="
---

## GitHub白送你6小时的免费VPS。我找到了让它永续的方法。

GitHub Actions会白送你Linux机器。

没错，真正的Ubuntu服务器。2核CPU、7GB内存、14GB硬盘。免费。每次运行6小时。

唯一的"问题"：运行结束后，一切都被清空。机器是一次性的。你装软件、写代码、配环境……然后啪，全没了。好像你啥都没干过。

除非。

除非你把 **git 当成硬盘**来用。

这样一来，你就有了一个免费的VPS，带着一个能跨运行周期存活下来的持久硬盘。你重新连上，一切还在。你从上次停下的地方继续干。

这玩意彻底坏掉了。让我给你讲讲 xD

---

## 背景：GitHub Actions Runner

当你启动一个GitHub Actions工作流时，GitHub会白给你一台虚拟机。

它的本意是帮你编译代码、跑测试、部署的。工作流跑完，机器就被销毁。

但没人拦着你拿这台VM干别的。比如，在上面开一个SSH shell，当成服务器用。

问题是，这些机器是 **无状态** 和 **临时** 的：
- 临时：每次运行最多6小时（`timeout-minutes: 360`，GitHub的上限）
- 无状态：结束后一切归零

所以要把它变成一个可用的VPS，得解决两个问题：
1. **怎么实时连上去？**
2. **怎么在两次运行之间保留硬盘数据？**

这就是一个骚到爆的hack登场的地方了。

---

## 问题1：用tmate搞实时SSH

**tmate** 是tmux的一个分支，可以创建可分享的SSH会话。

你在机器上启动它，它会生成两个链接：
- 一个SSH URL（`ssh xxx@nyc1.tmate.io`）
- 一个Web URL（浏览器里的终端）

你用其中一个链接连上去，boom，就进到机器的shell了。实时的。

工作流就这样启动tmate：

```bash
tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
tmate -S /tmp/tmate.sock set-option -g remain-on-exit on

tmate_ssh=$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')
tmate_web=$(tmate -S /tmp/tmate.sock display -p '#{tmate_web}')
```

这些链接会被一个Python脚本直接写进仓库的README里。你打开仓库，看到连接链接，一点击。你就进了你的VPS。

第一个问题搞定了。但第二个才是真正离谱的。

---

## 问题2：把git当硬盘用

这操作是真的牛批。

机器每次运行都会被清空。所以我们要把 **整个文件系统存到一个专用的git分支里**，叫做 `filesystem`。

启动时，脚本从那个分支恢复状态：

```bash
filesystem_branch="filesystem"

git fetch origin "$filesystem_branch":refs/remotes/origin/$filesystem_branch

git checkout -B filesystem-workspace "refs/remotes/origin/$filesystem_branch"
git reset --hard "refs/remotes/origin/$filesystem_branch"
```

`filesystem` 分支就是你的硬盘。你的文件、你装的东西、你的配置----全在里面。

你懂我意思吗？机器是一次性的，但硬盘活在git里。你重新启动工作流，硬盘被恢复，你直接从上次停下的地方继续。

就像一个能休眠的VPS。只不过休眠就是git仓库 xD

### 首次启动：创建空硬盘

在第一次运行的时候，`filesystem`分支还不存在。得创建它。而且这不是随便搞的：

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

`git checkout --orphan` 是关键。孤儿分支就是一个 **没有任何历史** 的分支----就像从一个空仓库重新开始。

为什么要孤儿分支？因为你 **不** 想让你的持久硬盘带着你源代码的完整历史。硬盘是独立的东西，有自己的生命。它从空白开始。

开头的 `git ls-remote --exit-code` 只是一个干净检查："远程上这个分支存在吗？" 存在就什么都不干。不存在就创建它。幂等操作。

### 选择性git clean：保护缓存

这一行值得停下来好好看看：

```bash
git clean -fdx -e .apt-cache -e .cache -e host.conf -e tmate.sock
```

`git clean -fdx` 会删除所有不被git追踪的东西。一般来说这很暴力----它会彻底清理工作区。

但 `-e`（排除）保护了某些东西：
- `.apt-cache` → APT包的缓存（后面会讲到，很聪明）
- `.cache` → 通用缓存
- `host.conf` → 会话的SSH地址
- `tmate.sock` → 当前tmate会话的socket

如果你清理了这些文件，你就会断开当前会话或者丢掉缓存。所以我们在重置时放过了它们。

这种细节第一眼看不出来，但正是"能用"和"真好用"之间的区别。

---

## 自动保存：inotify监视一切

那么，文件是怎么进入 `filesystem` 分支的？

答案：一个监视器，监视 **所有文件变更** 并自动提交/推送。

这个魔法工具就是 **inotifywait**（来自 `inotify-tools` 包）。它在内核层面监视文件系统，一旦有文件变化就会触发。

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

我们来拆解一下inotify的flags，因为每个都很重要：
- `-r` → 递归，监视所有子文件夹
- `-e modify,create,delete,move` → 对这4种事件做出反应（修改、创建、删除、移动）
- `--exclude '...'` → 一个正则表达式，用来忽略某些文件

`--exclude` 至关重要。看看它忽略了什么：
- `.git` → 当然要忽略，不然每次提交都会触发自动保存，自动保存又触发提交……无限循环。灾难。
- `.apt-cache` 和 `.cache` → 缓存，它们一直在变，你不想在git里刷屏吧
- `host.conf` 和 `tmate.sock` → 会话文件，不停在变化
- `.gitignore`、`.txt.swp` → 临时文件（`.swp`是vim的编辑文件）

没有这个exclude，自动保存就会在自己的变更上反复触发。`.git` 在你的exclude列表里，就是阻止你搬起石头砸自己脚的那一行。

你改了一个文件？inotify立刻检测到，提交，推送。不到一秒钟，你的变更就到了 `filesystem` 分支。

你装了个东西、写了段代码、改了个配置----一切都是实时、自动保存的，你什么都不用做。

你literally有了一个全盘自动保存系统。炸裂。

### Debounce：别刷爆git

每次保存后的 `sleep 1` 就是一个 **debounce**。

当你在编辑器里保存文件时，往往会产生一连串文件系统事件（创建临时文件、重命名、删除旧文件……）。没有debounce，一次保存就会触发3-4次提交。

`sleep 1` 的意思是："保存后等一秒钟，等这波事件平息了再继续监听"。它将邻近的变更合并成一次提交。聪明。

### 外加一个定期保存

以防inotify漏掉什么，还有个每5秒的定期保存：

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

安全带加安全绳。我们可不想丢了硬盘状态。

---

## 一个小聪明：只有一个提交

如果你每次文件变更都提交，你会积累成千上万的提交。一小时的session下来，你的git历史炸了。仓库变得巨大。恶心。

解决方案很优雅：**我们修改已有的提交**，而不是创建新提交。

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

`git commit --amend` 的意思是："用这个提交替换最后一个提交"。

所以 `filesystem` 分支 **永远只有一个提交**。不管你保存多少次。它只是当前状态的一个快照，被一遍又一遍地force-push。

`flock` 是一个锁：因为有两个保存循环（inotify + 定期），得防止它们同时操作git互相踩踏。一次只跑一个git进程。

干净。

---

## sync_from_remote：处理多个会话

哎，有个你一开始想不到的事：如果你同时启动 **两个** 运行呢？或者一个会话在修改 `filesystem` 分支时另一个也在跑？

脚本用每个提交前的 `sync_from_remote` 来处理：

```bash
sync_from_remote() {
  git fetch origin "filesystem":refs/remotes/origin/filesystem
  git merge --ff-only "refs/remotes/origin/filesystem"
}
```

`--ff-only`（仅快进）很重要：意思是"只有能干净地前进时才合并，不创建合并提交"。

如果两个分支出现了分歧（比如两个会话改了不同的东西），快进会静默失败（`2>/dev/null || true`），保留本地状态。这不是一个完美的合并系统，但在只有一个会话运行的简单情况下，它能避免损坏。

说实话，你别在同一个仓库上同时开3个会话就是了。但代码还是尽量不让它炸掉。算是一种防御。

---

## APT缓存：极速安装

工作流里有个不起眼但设计得很好的细节：

```yaml
- name: Cache & install APT packages (tmate + watcher)
  uses: awalsh128/cache-apt-pkgs-action@v1.6.0
  with:
    packages: tmate inotify-tools
```

tmate和inotify-tools是通过一个 **缓存APT包** 的action安装的。

第一次运行时下载安装。之后的运行就从GitHub Actions缓存恢复----更快，不用重新下载。

还记得之前说的 `git clean -fdx -e .apt-cache` 吗？这是一起的。`.apt-cache` 文件夹受到保护不被清理，就是为了让你在session期间安装的包能尽量持久化。

一切都是有联系的。我考虑了完整的生命周期。

---

## 藏在/tmp里的脚本

又一个阴险但聪明的细节。在脚本的最开头：

```bash
RUNNER_SCRIPTS_DIR="/tmp/runner-scripts"
rm -rf "$RUNNER_SCRIPTS_DIR"
mkdir -p "$RUNNER_SCRIPTS_DIR"
cp -r .github/scripts "$RUNNER_SCRIPTS_DIR/"
```

脚本（`update_readme.py` 等）在 **碰 `filesystem` 分支之前** 就被复制到了 `/tmp`。

为什么？因为当你执行 `git reset --hard` 切换到 `filesystem` 分支（一开始是空的，或者存着你的硬盘数据）时，源仓库里的 `.github/scripts` 文件会从工作区消失。

但脚本在session期间还需要它们（用来在每次tmate重启时更新README）。所以他把它们藏在 `/tmp` 里，git管不到的地方，方便之后调用：

```bash
python3 "$RUNNER_SCRIPTS_DIR/scripts/update_readme.py" --ssh "$tmate_ssh" ...
```

这种bug如果你没想到会在你脸上炸开："为什么我的脚本不见了？"。我想到了。

---

## 定制Shell

最后一点小舒适：你的session得到一个配好环境的shell，而不是裸bash。

`prestart.sh` 复制了一个自定义 `.bashrc`：

```bash
if ! grep -q "Custom prompt and aliases for remote sessions" "$HOME/.bashrc"; then
  cp .github/scripts/remote_bashrc "$HOME/.bashrc"
fi
sudo cp "$HOME/.bashrc" /root/.bashrc
```

这个 `.bashrc` 包含彩色提示符、别名（`ll`、`lla`、`rm -i`），还有一个最关键的小聪明：`exit` 的覆盖：

```bash
exit() {
    killall -9 -u "$(whoami)" tmate 2>/dev/null || true
    builtin exit "$@"
}

bind -x '"\C-d": "exit"'
```

当你输入 `exit`（或Ctrl+D）时，它会先干净地杀掉tmate进程再退出。这防止了机器上残留僵尸tmate会话。

还有一个 `tmate-detach` 函数，如果你想 **断开连接但不杀死会话**（方便之后重连）。小舒适，但体现了用心程度。

---

## 自动重启的tmate

小舒适：如果你在shell里输入 `exit`，正常情况下tmate会死掉，你就永久断开了。

但在这里，tmate在一个 `while true` 循环里：

```bash
while true; do
  tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
  while tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' >/dev/null 2>&1; do
    sleep 2
  done

  echo "tmate session ended; restarting..."
done
```

你 `exit` 了？会话自动重启。用同一个链接重新连上。

这很蠢，但让这东西能用。

---

## 一条命令重连

怎么在断开后重连，而不用每次都去翻run的日志？

tmate的SSH地址被写在一个 `host.conf` 文件里，而这个文件又被提交到了 `filesystem` 分支：

```bash
printf '%s' "${tmate_ssh#ssh }" > host.conf
```

由于这个文件在git里，你可以通过GitHub API用一条命令获取它：

```bash
ssh "$(gh api -H 'Accept: application/vnd.github.v3.raw' \
  "/repos/USER/REPO/contents/host.conf?ref=filesystem" | tr -d '\r\n')"
```

你跑这条命令，它去仓库里查找当前的SSH地址，然后直接连上。即使地址在两次会话之间变了也没问题。

丝滑得一匹。

---

## 完整流程

我们来总结一下整件事：

```
1. 你触发工作流（push或手动按钮）
2. GitHub给你一台Ubuntu VM
3. 脚本从"filesystem"分支恢复硬盘
4. inotify开始监视所有变更
5. periodic_save每5秒备份提交一次
6. tmate启动 → 生成SSH/Web链接
7. 链接被写入README + host.conf
8. 你用ssh或web终端连上
9. 你想干嘛干嘛（写代码、装东西、调试）
   └── 每次文件变更 = 自动保存到git
10. 6小时后，GitHub杀掉VM
11. 但你的硬盘完好无损地留在"filesystem"分支里
12. 你重新启动工作流 → 回到第3步，一切还在
```

一个VPS。免费的。带持久硬盘。全靠git和GitHub Actions。

---

## 得说实话：局限性

这是个hack，不是真正的VPS。所以：

- **每次运行最多6小时。** 得定期重新启动工作流。没有无限uptime。
- **不能用于生产环境。** 你不会在上面托管网站的。这是用来探索、开发、调试、在可恢复的一次性Linux环境里测试东西的。
- **GitHub什么都能看到。** 这是他们的机器。别放敏感数据。
- **保持仓库私有。** 你暴露了一个SSH shell。公开仓库 = 任何人都可能连上去。坏主意。
- **这游走在服务条款的边缘。** GitHub Actions是给CI/CD用的，不是给免费VPS的。所以悠着点用，干正经事，别滥用。

### 真正的致命弱点：git讨厌大文件

有一个更技术性的限制，也是最重要的一个。

**git是为文本设计的，不是为文件系统设计的。**

持久硬盘活在一个git分支里。所以你保存的一切都要经过git。而git：
- 处理大二进制文件很糟糕（一个2GB的Docker镜像放git里？别想了）
- GitHub上有每个文件100MB的硬限制（超出就推不上去）
- 建议每个仓库保持在~5GB以下

所以如果你 `npm install` 一个带500MB `node_modules` 的项目，或者你build了一个生成大二进制文件的东西，推送到 `filesystem` 要么慢得要死，要么直接失败。

`git commit --amend` 有帮助（只有一个提交，历史不会膨胀），但改变不了200MB的文件永远过不去的事实。

总之：**干代码、配置文件、小文件完美。存大数据或二进制产物不行。** 在你在session里干什么的时候要记住这一点。

### 这不是完整的系统快照

另一个重要的细节：`filesystem` 分支保存的是 **工作区**（仓库目录），而不是整个系统。

如果你 `apt install htop`，二进制文件去了 `/usr/bin/htop`，它在 **工作区之外**。所以它 **不会** 被保存。下次运行你得重新安装。

这就是为什么我们有APT缓存和 `prestart.sh`：为了在每次启动时重新准备系统环境，因为只有工作区是持久化的。

如果你想让安装的东西持久化，你得把它们放在工作区里（比如装到本地目录而不是系统目录）。这是一种需要适应的操作方式。

---

## 免费VPS vs 真VPS：对决

| | repo-to-vps | 真VPS（5€/月） |
|---|---|---|
| **价格** | 0€ | ~5-10€/月 |
| **在线时间** | 6小时，需重启 | 24/7 |
| **硬盘** | git分支，小文件 | 真SSD，多GB |
| **内存** | ~7GB（超大方！） | 通常1-2GB |
| **CPU** | 2-4核，还不错 | 1-2 vCPU |
| **搭建** | 克隆模板 | 手动配置 |
| **持久化** | 仅工作区 | 完整系统 |
| **合法性** | 接近条款边缘 | 100%合规 |

有意思的是，在原始规格（内存、CPU）上，GitHub runner通常比5€的VPS **更好**。但6小时的运行时间上限和仅限于工作区的持久化，让它成为一个hacker的玩具，而不是真正的服务器。

用来学习、测试、快速调试Linux环境？完美。用来托管任何正经的东西？买个真VPS吧。

但作为一个你可以随意恢复的临时Linux环境？这玩意就是神。

---

## 背后的模式

如果你退一步看，repo-to-vps和邮件bot（我的另一篇文章）基于同一个想法：

> **Git不只是一个版本管理器。它是一个持久的、免费的、带版本控制的、可通过API访问的存储系统。**

一旦你有了一个无状态的系统（GitHub Actions、Worker、serverless函数），又想在两次执行之间保持状态，git就可以充当"硬盘"。

- 邮件bot把一个 `lastId` 存在git tag里。
- repo-to-vps把整个文件系统存在git分支里。

同一个模式，两种规模。一边是一个值，另一边是一个硬盘。

而 `git commit --amend` + force-push 是共同的技术：**你只保留一个代表当前状态的提交，每次更新都会覆盖。** 历史不膨胀，只有一个活着的快照。

这不是它原本的用途。但它能用。而且是免费的。这才是最美的地方。

---

**3个要点：**

1. **一个git分支 = 一个持久硬盘** -- 把你的文件系统存在专用分支里，启动时恢复，你就在一次性机器上有了一个可存活的状态。

2. **inotify + git = 实时自动保存** -- `inotifywait` 在内核级别监视变更并即时推送到git。用 `git commit --amend` 保持只有一个干净的提交。

3. **tmate把runner变成VPS** -- 在GitHub Actions机器上实时SSH，自动重启，一条命令通过GitHub API重连。

git当硬盘用，第二集。我觉得我最终会把所有东西都存在git分支里 xD
