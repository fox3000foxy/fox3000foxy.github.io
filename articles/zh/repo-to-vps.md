---
title: 把 GitHub Actions 变成带持久存储的免费 VPS：repo-to-vps
description: 怎么把 GitHub Actions runner 变成带 git 持久存储的永久 VPS，tmate、inotify 和 commit --amend。
date: 2026-05-29
tags:
  - github
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "lYF8dolTi1aWNLWtzyLzb2jWsc7YSv/IONMC5JykOgKdlPu75weySbpchE099ZMbx6DvwADr83hF+qa5QY/+5A=="
---

## GitHub 送你 6 小时免费 VPS。我找到了让它永久的办法。

GitHub Actions 送免费 Linux 机器。

字面意义的真 Ubuntu 服务器。2 核，7G 内存，14G 磁盘。免费。每次 6 小时。

唯一"问题"：run 一结束全抹掉。机器一次性的。你装包、写代码、配环境……完事啪，全没。就当没干过。

除非。

除非你拿 **git 当硬盘**。

突然你就有了带持久盘的免费 VPS，run 之间还活着。重连，全在。接着上次的干。

完全离谱。听我讲。

---

## 背景：GitHub Actions runner

跑 GitHub Actions 工作流，GitHub 给你一台 VM。

本来是给你构建、跑测试、部署的。工作流干完活，机器销毁。

但没人拦你拿这台 VM 干别的。比如开 SSH shell 当服务器用。

约束是这些机器**无状态**且**临时**：
- 临时：每次最多 6 小时（GitHub 上限 `timeout-minutes: 360`）
- 无状态：结束全抹

所以拿它当 VPS 用，要解两个问题：
1. **怎么实时连上去？**
2. **两次运行之间盘怎么留住？**

这就变成脏 hack 了。

---

## 问题 1：tmate 实时 SSH

**tmate** 是 tmux 的 fork，开可分享的 SSH session。

一台机器上启动，给你两个链接：
- SSH URL（`ssh xxx@nyc1.tmate.io`）
- 网页 URL（浏览器里就是终端）

拿链接连，boom，实时 shell 进机器了。

工作流里就启动 tmate：

```bash
tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
tmate -S /tmp/tmate.sock set-option -g remain-on-exit on

# 取连接链接
tmate_ssh=$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')
tmate_web=$(tmate -S /tmp/tmate.sock display -p '#{tmate_web}')
```

链接由 Python 脚本直接写进仓库 README。打开仓库，看到连接链接，点。进你的 VPS 了。

第一个问题解决。但第二个才是真疯。

---

## 问题 2：git 当硬盘

改变一切的想法来了。

机器每次被抹。所以把**文件系统存进专用 git 分支**，叫 `filesystem`。

启动时脚本从这个分支恢复状态：

```bash
filesystem_branch="filesystem"

# 从远端取 filesystem 分支
git fetch origin "$filesystem_branch":refs/remotes/origin/$filesystem_branch

# 恢复 workspace 到这个状态
git checkout -B filesystem-workspace "refs/remotes/origin/$filesystem_branch"
git reset --hard "refs/remotes/origin/$filesystem_branch"
```

`filesystem` 分支**就是**你的硬盘。文件、安装、配置，全在里面。

get 到思路了吗？机器一次性的，盘活在 git 里。工作流重跑，盘恢复，接着上次的干。

跟会休眠的 VPS 一样。只不过休眠体是 git 仓库。

### 第一次启动：建空盘

第一次跑，`filesystem` 分支还不存在。得建。还挺讲究：

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

`git checkout --orphan` 是关键。孤儿分支就是**没有历史**的分支，跟从空仓库起步一样。

为什么孤儿？因为你不想持久盘里拖着源码的全部历史。盘独立过自己的日子。从零开始，干净。

开头的 `git ls-remote --exit-code` 就是干净检查："远端有这个分支吗？"有就不动。没有就建。幂等，我喜欢。

### 选择性 git clean：保护缓存

这一行值得停下来看：

```bash
git clean -fdx -e .apt-cache -e .cache -e host.conf -e tmate.sock
```

`git clean -fdx` 把 git 没跟踪的全删了。一般很暴力，把 workspace 洗到底。

但 `-e`（exclude）保住几个文件：
- `.apt-cache` → APT 包缓存（后面讲，贼得很）
- `.cache` → 通用缓存
- `host.conf` → 本次 session 的 SSH 地址
- `tmate.sock` → 本次 tmate 的 socket

这些清掉了，活跃 session 崩了，缓存丢了。所以 reset 时放过它们。

看着是小事，没它全炸。

---

## 自动保存：inotify 盯着一切

行，文件怎么进 `filesystem` 分支？

答案：watcher 盯着**全部**文件变动，自动提交推送。

神器是 **inotifywait**（`inotify-tools` 包）。它在内核层盯文件系统，文件一变立刻触发。

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock|\.gitignore|\.txt\.swp)(/|$)' .; do
    echo "[autosave] change detected"
    commit_and_push
    sleep 1   # 防抖，变动扎堆时用
  done
}

autosave &
```

inotify 参数逐个拆，因为每个都重要：
- `-r` → 递归，盯全部子目录
- `-e modify,create,delete,move` → 只对这 4 种事件反应
- `--exclude '...'` → 忽略某些文件的正则

`--exclude` 是命。看它忽略什么：
- `.git` → 当然，不然每次提交触发 autosave，autosave 触发提交……无限循环。灾难。
- `.apt-cache` 和 `.cache` → 缓存，老变，不想往 git 里 spam
- `host.conf` 和 `tmate.sock` → session 文件，一直动
- `.gitignore`、`.txt.swp` → 临时文件（`.swp` 是 vim 编辑文件）

没这个 exclude，autosave 在自己的产出上无限自激。`.git` 那条就是不让你朝自己脚开枪的那条。

改个文件？inotify 瞬间发现，提交，推送。不到一秒，改动进 `filesystem` 分支了。

装个包，写个代码，改个配置，全实时自动保存，什么都不用干。

字面意义的全盘自动保存。离谱。

### 防抖：别 spam git

每次保存后的 `sleep 1` 是**防抖**。

编辑器存文件经常一次产一串文件系统事件（建临时文件、重命名、删旧的……）。没防抖，一次保存触发三四次提交。

`sleep 1` 的意思是："保存完等一秒，让这波过去，再继续听"。把靠得近的改动并成一次提交。贼。

### 再加定期保存

怕 inotify 漏事件，再加个 5 秒一次的保存：

```bash
periodic_save() {
  while true; do
    sync_from_remote   # 顺便收远端可能的变化
    sleep 5
    commit_and_push
  done
}

periodic_save &
```

双保险。盘的状态丢不起。

---

## 贼的细节：永远只有一个提交

文件一变就提交，一小时 session 下来几千个提交。git 历史爆炸。仓库变巨。恶心。

解法优雅：**amend 已有提交**，不建新的。

```bash
commit_and_push() {
  (
    flock -n 200 || return   # 锁，两路保存别同时跑

    git add -A
    git reset -- .github/workflows/ .github/scripts/   # 脚本别碰

    if ! git diff --cached --quiet; then
      if git rev-parse --verify HEAD >/dev/null 2>&1; then
        git commit --amend --no-edit    # AMEND：替换上个提交
      else
        git commit -m "autosave $(date -u +%Y%m%dT%H%M%SZ)"
      fi
      git push --force origin "filesystem-workspace:filesystem"
    fi
  ) 200>/tmp/tmate_autosave.lock
}
```

`git commit --amend` 的意思："拿这个替换上个提交"。

所以 `filesystem` 分支**永远一个提交**。保存多少次都一样。就是当前状态的快照，反复 force-push。

`flock` 是锁：两路保存（inotify 加定期）别同时跑 git 打起来。同时只允许一个 git 进程。

干净。

---

## sync_from_remote：多 session 怎么办

有个一开始想不到的情况：同时开**两个** run 呢？或者一个 session 跑着，`filesystem` 分支被改了？

脚本每次提交前 `sync_from_remote` 处理：

```bash
sync_from_remote() {
  git fetch origin "filesystem":refs/remotes/origin/filesystem
  git merge --ff-only "refs/remotes/origin/filesystem"
}
```

`--ff-only`（只许 fast-forward）很重要：意思是"只能干净往前走，不建合并提交"。

两边分叉了（比如两个 session 各改了文件），fast-forward 静默失败（`2>/dev/null || true`），保留本地状态。不是完美合并，但在只有一个 session 跑的常见情况不 corrupt。算防守。

说实话，别在同一仓库并行开 3 个 session。但代码尽量做到万一这样也不炸。防守。

---

## APT 缓存：装得快

工作流里有个看着不起眼但想得很到位的：

```yaml
- name: Cache & install APT packages (tmate + watcher)
  uses: awalsh128/cache-apt-pkgs-action@v1.6.0
  with:
    packages: tmate inotify-tools
```

tmate 和 inotify-tools 走**缓存 APT 包**的 action 装。

第一次下载安装。之后从 GitHub Actions 缓存恢复，更快，不用重下。

还记得刚才 `git clean -fdx -e .apt-cache` 吗？对上了。`.apt-cache` 目录在清理时被保护，就是为了 session 里装的包多少能留住。

全串起来了。生命周期我想全了。

---

## 藏 /tmp 的脚本

又贼又对的细节。脚本最开头：

```bash
RUNNER_SCRIPTS_DIR="/tmp/runner-scripts"
rm -rf "$RUNNER_SCRIPTS_DIR"
mkdir -p "$RUNNER_SCRIPTS_DIR"
cp -r .github/scripts "$RUNNER_SCRIPTS_DIR/"
```

脚本（`update_readme.py` 等）在碰 `filesystem` 分支**之前**先拷到 `/tmp`。

为什么？因为 `git reset --hard` 到 `filesystem` 分支（开头是空的，或者是你的盘）之后，源码仓库的 `.github/scripts` 文件就从 workspace 消失了。

但 session 里还要用（每次 tmate 重启更新 README）。所以先藏 `/tmp`，git 够不着：

```bash
python3 "$RUNNER_SCRIPTS_DIR/scripts/update_readme.py" --ssh "$tmate_ssh" ...
```

想不到这层，卡半小时想脚本去哪了。我想到了。

---

## 定制 shell

小舒服：session 给你配好的 shell，不是光秃秃 bash。

`prestart.sh` 拷自定义 `.bashrc`：

```bash
if ! grep -q "Custom prompt and aliases for remote sessions" "$HOME/.bashrc"; then
  cp .github/scripts/remote_bashrc "$HOME/.bashrc"
fi
sudo cp "$HOME/.bashrc" /root/.bashrc
```

`.bashrc` 有彩色提示符、别名（`ll`、`lla`、`rm -i`），还重写了 `exit`：

```bash
exit() {
    killall -9 -u "$(whoami)" tmate 2>/dev/null || true
    builtin exit "$@"
}

# Ctrl+D 和 exit 一样
bind -x '"\C-d": "exit"'
```

敲 `exit`（或 Ctrl+D），先干净杀 tmate 进程再关。不断僵尸 tmate session。

还有个 `tmate-detach`，想断开**不断** session 时用（下次再连回来）。舒服的细节，但看得出用心。

---

## tmate 自己重启自己

小舒服：shell 里敲 `exit`，tmate session 一般死了，人就被踢了。

但这里 tmate 套在 `while true` 里：

```bash
while true; do
  tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
  while tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' >/dev/null 2>&1; do
    sleep 2
  done
  echo "tmate session ended; restarting..."
done
```

`exit` 了？session 自己重启。同一个链接连回来。

蠢，但 session 好用。

---

## 一条命令重连

断线后怎么连回来，不用每次翻 run 日志？

tmate 的 SSH 地址写进 `host.conf` 文件，提交进 `filesystem` 分支：

```bash
printf '%s' "${tmate_ssh#ssh }" > host.conf
```

文件在 git 里，用 GitHub API 一条命令取：

```bash
ssh "$(gh api -H 'Accept: application/vnd.github.v3.raw' \
  "/repos/USER/REPO/contents/host.conf?ref=filesystem" | tr -d '\r\n')"
```

跑一下，从仓库取当前 SSH 地址，连上。地址换了也不怕。

---

## 完整流程

总结一下：

1. 你触发工作流（push 或手动按钮）
2. GitHub 给你一台 Ubuntu VM
3. 脚本从"filesystem"分支恢复盘
4. inotify 开始盯全部变动
5. periodic_save 每 5 秒备份
6. tmate 启动，生成 SSH/web 链接
7. 链接写进 README 加 host.conf
8. 你用 ssh 或网页终端连
9. 随便干，文件一改就 autosave
10. 6 小时后 GitHub 杀 VM
11. 你的盘完好躺在"filesystem"分支
12. 工作流重跑，回第 3 步，全还在

带持久盘的免费 VPS。就靠 git 加 GitHub Actions。

---

## 说实话：局限

是 hack，不是真 VPS。所以：

- **每次最多 6 小时。** 得定期重跑工作流。单次 uptime 到头。
- **只适合开发和探索。** 别拿它 host 网站。探索、开发、调个一次性的 Linux 环境可恢复，行。
- **GitHub 全看得见。** 机器是人家的。敏感东西别放。
- **仓库设私有。** 你暴露 SSH shell。公开仓库等于谁都能连。找死。
- **在服务条款边缘。** GitHub Actions 是做 CI/CD 的，不是免费 VPS。所以省着用，干正事，别滥用。

### 真正的命门：git 恨大文件

Git 为文本生的，不是文件系统。

持久盘活在 git 分支里。你保存的一切都过 git。而 git：
- 大二进制管得烂（2G Docker 镜像进 git？忘了吧）
- GitHub 单文件 100 MB 硬上限（超了推不上去）
- 单仓库建议 5G 以内

所以 session 里 `npm install` 出 500M `node_modules`，或构建出大二进制，推 `filesystem` 要么慢死，要么直接失败。

`git commit --amend` 有帮助（永远一个提交，历史不膨胀），但 200M 文件该过不去还是过不去。

结论：**代码、配置、小文件无敌。大数据、大构建产物不行。** session 里干什么心里得有数。

### 不是完整系统快照

另一个要说清的：`filesystem` 分支存的是 **workspace**（仓库目录），不是整机。

`apt install htop`，二进制进 `/usr/bin/htop`，在 workspace 外面。所以**不会**被保存。下次跑重装。

所以才有 APT 缓存和 `prestart.sh`：系统环境每次启动重备，只有 workspace 持久。

想让安装活下来，装 workspace 里（比如装本地目录不装系统）。这个体操得练。

---

## 免费 VPS vs 真 VPS

| | repo-to-vps | 真 VPS（5 欧/月） |
|---|---|---|
| **价格** | 0 元 | ~5-10 欧/月 |
| **Uptime** | 6 小时，要重跑 | 24/7 |
| **盘** | git 分支，小文件 | 真 SSD，好几个 G |
| **内存** | ~7G（大方！） | 一般 1-2G |
| **CPU** | 2-4 核不错 | 1-2 vCPU |
| **搭建** | 克隆模板 | 手动配 |
| **持久** | 只有 workspace | 整机 |
| **合规** | 条款边缘 | 100% 没问题 |

有意思的是裸规格（内存、CPU），GitHub runner 经常**强于** 5 欧 VPS。但 6 小时 uptime 加只有 workspace 持久，注定它是黑客玩具，不是真服务器。

学东西、测试、快速调个可恢复的 Linux 环境？完美。host 正经东西？买真 VPS。

但要个能随时恢复的临时 Linux 环境？爽到飞起。

---

## 背后通用的模式

退一步看，repo-to-vps 和邮件机器人（我另一篇）是同一个思路：

> **Git 不只是版本管理。它是免费、带版本、有 API 的持久存储。**

只要系统无状态（GitHub Actions、Worker、无服务器函数），又要在两次执行之间留状态，git 就能当"盘"。

- 邮件机器人把 `lastId` 存 git tag。
- repo-to-vps 把整个文件系统存 git 分支。

同一模式，两种规模。一边一个值，一边一块盘。

`git commit --amend` 加 force-push 是通用手法：**永远一个提交代表当前状态，每次覆盖。**

本不是干这个的。但能跑。还免费。

---

**三句话总结：**

1. **git 分支 = 持久硬盘**，把文件系统存专用分支，启动恢复，无状态机器之间状态不断。

2. **inotify + git = 实时自动保存**，`inotifywait` 内核层盯变动，瞬间推 git。`git commit --amend` 永远保持单个干净提交。

3. **tmate 把 runner 变 VPS**，GitHub Actions 机器上实时 SSH，自动重启，加 GitHub API 一条命令重连。

git 当硬盘，第二集。我觉得我早晚把什么都塞 git 分支里。
