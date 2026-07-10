---
title: SSH 提交签名脚本详解
description: SSH 提交签名辅助工具的详细解析，以及为什么我想要有格调的提交。
date: 2026-03-08
aiGenerated: true
tags:
  - git
  - security
  - shell
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "GwJnZtAZso9drOxx+4XVyuwgGdHchKgfl8bFkpdmCawMjeXvBjaqFCTe4yY3fCTmNLoFubUZkJM8y8G98PznSQ=="
---

# SSH 提交签名脚本详解

这篇文章深入解析了我发布在 [Gist](https://gist.github.com/fox3000foxy/95500d129cd4bf5c173c323d2492569a) 上的 `setup-ssh-signing.sh` 脚本。我们来看看每部分的作用、它如何让仓库级别的 SSH 提交签名变得轻松无痛，以及，是的，我为什么一开始要费劲写它（剧透：我只是想让我的提交看起来**很酷**）。

## 动机

我一直喜欢折腾我的 Git 工作流，看到别人提交记录旁边那个小小的"已验证"徽章后我想：为什么我不能有呢？内置的 GPG 签名有点重而且全局生效，于是我干脆写了一个小工具：

- 专门创建一把用于签名的 SSH 密钥
- 仅配置当前仓库
- 可选择重写历史来签署旧提交
- 支持在多台机器间迁移密钥

说实话，主要是虚荣心。我的个人项目在技术上并不需要签名，但提交上有绿色的"已验证"就是很酷，写这个脚本也是 Shell 脚本编程的一次有趣练习。

> 我是说，给你的提交签名就像穿着皮夹克去参加代码审查----完全没必要，但它让你感觉自己像个黑客。

## 脚本的功能

这个脚本是一个单独的 Bash 文件，顶部加上 `set -euo pipefail`，出错即停。以下是它的高层行为概述：

1. **生成或导入签名密钥**
   密钥存放在运行脚本所在目录下的 `.git-signing/` 中。
2. **本地配置 Git**
   设置 `gpg.format=ssh`、`user.signingkey`、`commit.gpgsign=true`、`tag.gpgSign=true`，并将 `allowedSignersFile` 指向公钥。
3. **跨机器管理密钥**
   支持 `--export-keys`/`--import-keys`，让你无需触及全局配置就能在不同电脑之间迁移私钥。
4. **可选的历史重写**（`--resign-all`）
   重写所有分支/标签上的每个提交（或对于 fork，仅重写不在 `upstream` 中的提交），用 `-S` 重新签署，同时保留其他作者的提交不变。
5. **实用选项**
   `--autostash`、`--autopush`、`--commit-date`、`--yes`（非交互模式）等。
6. **Fork 感知与安全检查**
   检测 `upstream` 远程仓库，重写历史前给出警告，检查所需工具（`git`、`ssh-keygen`、`zip/unzip`），确保权限正确，甚至在文件系统权限过松时创建一个安全的密钥运行时副本。

脚本是幂等的：运行两次不会重新生成密钥或覆盖现有配置。

## 逐步解析

以下是代码中一些关键部分的解释。

```bash
#!/usr/bin/env bash
set -euo pipefail

# Configure SSH commit signing in a controlled, repo-local way.
# - Key files are created in the directory where this script is launched.
# - Git config is written locally to the current repository only.
```

开头部分确立了安全性并说明了目标。下一段用 `while [[ $# -gt 0 ]]; do case … esac done` 循环解析 CLI 选项（`--name`、`--email`、`--repo` 等）。必填的身份信息在后面强制执行：

```bash
if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "Error: missing identity. Provide --name and --email." >&2
  exit 1
fi
```

密钥生成在 `$LAUNCH_DIR/.git-signing` 目录下。如果密钥已存在，脚本则保留现有密钥；`--import-keys` 可以从 ZIP 文件中填充该目录。

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

在确保私钥可用后（`ssh-keygen -Y sign …`），脚本写入一个包含公钥的 `allowed_signers` 文件，并设置相应的 Git 本地配置：

```bash
git -C "$REPO_DIR" config --local gpg.format ssh
git -C "$REPO_DIR" config --local user.signingkey "$RUNTIME_KEY_PATH"
git -C "$REPO_DIR" config --local gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS"
git -C "$REPO_DIR" config --local commit.gpgsign true
git -C "$REPO_DIR" config --local tag.gpgSign true
```

如果你使用 `--resign-all` 请求重写历史，脚本会构建一个 `git filter-branch` 命令，用 `-S` 重新签署符合条件的提交。它还能感知 fork 状态，可选择跳过 `upstream` 中已有的提交。

最终输出会打印公钥和将其添加到 GitHub **签名密钥**部分的说明，以及一个快速测试方法。

## 为什么要提交签名？

这部分是我承认其实我并不需要它。我的仓库不要求对发布的任何内容进行来源验证，我也不对发布版使用签署标签。"为什么"的答案是：

- 因为我可以，
- 因为看起来很酷（你看到那个徽章了吗？），
- 因为它给了我一个折腾 `git filter-branch` 和 Shell 脚本编程的借口，
- 因为这是又一个"我自己做的"博客素材。

简而言之：纯粹是为了好看，但这也正是摆弄工具的一半乐趣所在。

## 使用示例

```bash
# 在当前仓库中进行初始设置
chmod +x ./setup-ssh-signing.sh
./setup-ssh-signing.sh --name "Your Name" \
                       --email "you@example.com"

# 导出密钥以在另一台机器上使用
./setup-ssh-signing.sh --export-keys ./my-signing-keys.zip

# 在第二台机器上导入密钥
./setup-ssh-signing.sh --import-keys ./my-signing-keys.zip --repo ./my-repo \
                       --name "Your Name" --email "you@example.com"

# 重写历史并推送
./setup-ssh-signing.sh --repo ./my-repo --name "Your Name" --email "you@example.com" \
                       --resign-all --autostash --autopush --yes
```

## 最后的话

这个小工具虽然简单，但它蕴含了几个不错的设计理念：

- 将加密密钥保持本地化、按仓库管理
- 除非你主动要求，否则绝不触碰全局配置
- 提供简单的导入/导出和历史重写功能
- 把整个过程写成一篇博客文章----为什么不呢？

如果你也想给自己的提交添加签名，试试看吧！如果你只是来看炫酷风格的，一样欢迎。😎
