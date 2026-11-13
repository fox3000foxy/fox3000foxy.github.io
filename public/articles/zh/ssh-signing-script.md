---
title: SSH 签名脚本详解
description: 拆解 SSH 提交签名助手脚本，以及我为什么想要好看的提交。
date: 2026-03-08
aiGenerated: true
tags:
  - git
  - security
  - shell
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "A1jGwRO08MkxyBjKBHsOUqcXsebUGS9GhinQN6GU+WecLPE5zHdbHEaFsCLqzGcFacxT14DTQ1ahLScD5geUeA=="
---

# SSH 提交签名脚本详解

这篇文章拆解我发布在 [Gist](https://gist.github.com/fox3000foxy/95500d129cd4bf5c173c323d2492569a) 上的 `setup-ssh-signing.sh` 脚本。我们会逐段看它做了什么，它如何让仓库本地的 SSH 签名变得毫不费力，以及，是的，我为什么要费这个劲写它（剧透：我只是想让我的提交看上去**有面子**）。

## 动机

我一直喜欢折腾自己的 Git 工作流，看到别人提交旁边挂着"Verified"小徽章，我就想：凭什么我不行？内置的 GPG 签名又重又全局，于是我写了个小助手，它可以：

- 创建专用于签名的 SSH 密钥，
- 只配置当前仓库，
- 必要时重写历史，给旧提交补签名，
- 还能在机器之间携带密钥。

说实话，需求基本是虚荣心。我的个人项目没有任何签名要求，但提交上挂个绿色"Verified"徽章确实好看，而用 shell 写这个脚本的过程本身让我玩得很开心。

> 说白了，给提交签名就像穿着皮夹克去参加代码评审，完全没用，但让你觉得自己像个黑客。

## 脚本做了什么

脚本是单个 Bash 文件，顶部写了 `set -euo pipefail`，一出错立刻停。下面是它做事的概要：

1. **生成或导入签名密钥**
   密钥落在你运行脚本的目录下的 `.git-signing/` 里。
2. **只在本地配置 Git**
   它设置 `gpg.format=ssh`、`user.signingkey`、`commit.gpgsign=true`、`tag.gpgSign=true`，以及一个指向公钥的 `allowedSignersFile`。
3. **在机器之间搬运密钥**
   用 `--export-keys` / `--import-keys`，你可以把私钥从一台电脑传到另一台，而不动全局配置。
4. **可选的历史重写**（`--resign-all`）
   重写所有分支和标签的全部提交（fork 的话可以只重写 `upstream` 之外的提交），并用 `-S` 重新签名，不碰其他作者。
5. **实用标志**
   `--autostash`、`--autopush`、`--commit-date`、非交互模式的 `--yes` 等。
6. **Fork 检测与安全检查**
   它能识别 `upstream` 远程，重写历史前先警告，检查所需工具（`git`、`ssh-keygen`、`zip/unzip`），确认权限没问题，如果文件系统权限太宽松还会做一份安全的密钥拷贝。

脚本是幂等的：跑两次不会重新生成密钥，也不会覆盖已有配置。

## 逐步拆解

下面是代码里的几个关键片段和解释。

```bash
#!/usr/bin/env bash
set -euo pipefail

# Configure SSH commit signing in a controlled, repo-local way.
# - Key files are created in the directory where this script is launched.
# - Git config is written locally to the current repository only.
```

头部定下基调：安全第一，并说明目标。接下来一段用 `while [[ $# -gt 0 ]]; do case ... esac done` 循环解析 CLI 选项（`--name`、`--email`、`--repo` 等）。必填的身份字段在后面校验：

```bash
if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "Error: missing identity. Provide --name and --email." >&2
  exit 1
fi
```

密钥生成在 `$LAUNCH_DIR/.git-signing` 里。如果密钥已存在，脚本原样保留；`--import-keys` 可以从 ZIP 包填满这个目录。

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

确认私钥可用（`ssh-keygen -Y sign …`）之后，脚本写一个包含公钥的 `allowed_signers` 文件，并设置本地 Git 配置：

```bash
git -C "$REPO_DIR" config --local gpg.format ssh
git -C "$REPO_DIR" config --local user.signingkey "$RUNTIME_KEY_PATH"
git -C "$REPO_DIR" config --local gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS"
git -C "$REPO_DIR" config --local commit.gpgsign true
git -C "$REPO_DIR" config --local tag.gpgSign true
```

如果你用 `--resign-all` 要求重写历史，脚本会组装一条 `git filter-branch` 命令，用 `-S` 给符合条件的提交重新签名。遇到 fork 时，还会跳过 `upstream` 里已有的提交。

最后输出公钥，以及把它加到 GitHub **Signing Key** 区域的操作说明和测试方法。

## 为什么要给提交签名？

到了我承认其实并不需要的时候了。我的仓库不要求任何来源证明，我也不用签名标签发版。"为什么"是：

- 因为我能，
- 因为好看（看到徽章了吗？），
- 因为它给了我一个折腾 `git filter-branch` 和 shell 的借口，
- 还因为这是又一个"我自己造的"博客素材。

总之就是为了耍帅，但折腾自己的工具本来就是我喜欢的事。

## 使用示例

```bash
# 在当前仓库做初始化配置
chmod +x ./setup-ssh-signing.sh
./setup-ssh-signing.sh --name "Your Name" \
                       --email "you@example.com"

# 导出密钥，换一台机器用
./setup-ssh-signing.sh --export-keys ./my-signing-keys.zip

# 在第二台机器上导入密钥
./setup-ssh-signing.sh --import-keys ./my-signing-keys.zip --repo ./my-repo \
                       --name "Your Name" --email "you@example.com"

# 重写历史并推送
./setup-ssh-signing.sh --repo ./my-repo --name "Your Name" --email "you@example.com" \
                       --resign-all --autostash --autopush --yes
```

## 最后的想法

这个脚本还是个小工具，但它贯彻了我认同的几个原则：

- 加密密钥只保存在本地、只属于单个仓库，
- 除非你要求，否则绝不碰全局配置，
- 提供简单的导入导出和历史重写，
- 把整个过程写成博客，留一份可复用的记录。

如果你也想给自己的提交加签名，试试它！如果你只是路过看热闹，也一样欢迎。😎
