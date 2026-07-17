---
title: "5 个巧妙利用 GitHub Actions 的方法（以及它们对 secret 的启示）"
description: "CI runner 变身免费 VPS，自动给自己开 PR 的机器人，零 secret 的 npm 发布。遍历我的仓库，梳理那些超越 lint+test+deploy 的 GitHub Actions 模式。"
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "xkKelqKKB2K/s4nE6jgytZGeH+v776SF1QsANLsgM7rpZdkPz5Hz6q7LxpywvNdkIZ6fAbyWLlMDgncujuE1Zg=="
---

# 5 个巧妙利用 GitHub Actions 的方法

理论上，GitHub Actions 就是用来做传统 CI/CD 的：你 push，它 lint、test、deploy。我之前写过一篇专门的文章，关于用 git tag 给邮件机器人当数据库。但翻翻我自己的仓库，不同的模式足够多，值得单独写一篇----不那么聚焦一个项目，更像一个技术目录。

五件事，从最经典到最扭曲。

## 1. 用 git tag 在两次运行之间保存状态

快速回顾，详情见那篇关于 `email-autoreply` 的文章。GitHub Actions 本质上是无状态的----每次运行都从一台干净的机器开始。变通方案：把一个值（一个 ID、一个时间戳、任意小状态）存到一个专门的 git tag 里，而不是分支里。

```bash
# 读取状态
git show refs/tags/lastid:data/lastId > data/lastId

# 写入状态（孤儿分支、单次 commit、强制 push tag）
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```

关键点：孤儿分支永远不会累积历史，强制推送 tag 而不是分支，不会污染仓库的分支列表。

## 2. 用 git tag 做预编译的构建缓存

同类思路，不同用途：不存应用状态，而是存一个**构建产物**。`build` job 编译一次代码（push 到 `master` 时），然后把 `dist/` + `node_modules/` 推到一个 `runtime` tag 里。`cron` job 直接 checkout 这个 tag，而不是每次都跑一遍 `bun install && bun run build`：

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# 无需 install，无需 build----代码已经就绪
- run: node dist/index.js --action
```

这让运行时间从大约 20 秒降到 10 秒。对于经常跑的 cron 来说，这很关键。`actions/cache` 做类似的事（缓存依赖），但当你想要彻底冻结一个带版本的产物并显式指向它----而不只是加速 `npm install` 时，git tag 更直接。

## 3. 用一个必需检查汇总多个 job

一个看起来不起眼但彻底改变分支保护配置的小模式。在 `konosuba-rpg` 中，CI 有三个独立 job（`typecheck`、`lint`、`tests`）并行运行----第四个 job `test-battery` 什么也不做，只依赖前三个：

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

没有这个门面 job，配置受保护分支就需要勾选三个独立的必过检查----每次添加或重命名 job 时都得更新那个列表。有了 `test-battery`，仓库设置里只需要勾一个名字，内部细节变了也不影响。

## 4. 把免费 runner 变成临时 VPS

这是五个里最扭曲的，也绝对是我最喜欢的：`repo-to-vps` 完全劫持了 GitHub Actions runner 的原本用途，把它变成一台可以通过 SSH 访问的 Linux 机器，免费，最长 6 小时（一个 job 的最大时长）。

原理：一个几乎只做一件事的 job----启动 tmate（tmux 的分支，通过 SSH 或浏览器暴露可共享的终端会话）：

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

真正棘手的是：GitHub Actions runner 的文件系统是**一次性**的----job 一结束，所有东西都消失。一个持续几小时的 SSH 会话，如果你做的所有事在下一次运行都蒸发掉，那就毫无意义。解决方案：一个 git 分支充当文件系统的实时快照，持续同步。

`start-tmate.sh` 脚本依次做这些事：

1. 在 job 启动时从一个专门的 `filesystem` 分支**恢复**文件系统（`git reset --hard` 到它上面）。
2. 用 `inotifywait` 持续**监听**文件变化，任何文件一动就**立即 commit + push**：

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1
  done
}
```

3. 每次保存**修改**上一个 commit 而不是创建新的（`git commit --amend --no-edit`），所以 `filesystem` 分支永远只有一个 commit----不会累积成千上万的快照。
4. `while true` 循环在会话断开时自动重启 tmate，`remain-on-exit on` 确保即使 `exit` 后终端仍然可以连接。
5. tmate 生成的 SSH URL 被写入 `host.conf` 文件，commit 到 `filesystem` 分支----无需实时访问 job 日志，通过 GitHub API（`gh api .../contents/host.conf`）就能获取。
6. `periodic_save` 例程每 5 秒在后台运行一次，以防 `inotifywait` 漏掉事件。

结果：一个完整的 Linux shell，可以从任何地方访问，文件系统在会话间保持持久----尽管底层基础设施（一个 GitHub Actions runner）绝对不是为了这个目的设计的。唯一真正的限制是每个 job 6 小时的超时----之后需要重新启动 workflow。

## 5. 自动给自己开 PR 的机器人

在 `konosuba-rpg` 中，push 到 `dev` 分支会触发一个 job，检查是否已经有指向 `main` 的开放 PR----如果没有，就用 `actions/github-script` 和 GitHub REST API 自动创建一个：

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

这里关键的细节是使用的 token。这个 workflow **不**用自动的 `GITHUB_TOKEN`----它要求一个单独的 `AUTO_PR_TOKEN` secret，缺失就拒绝继续：

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

## 6. 零 secret 发布到 npm

五个里面最安静的，但可能对未来最重要：`typescript-virtual-container` 的 `publish.yml` workflow **没有任何 npm secret**。没有 `NPM_TOKEN`，没有 `NODE_AUTH_TOKEN`。就这些：

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

`npm publish` 照样能跑，因为 npm registry 现在支持通过 OIDC 的 **trusted publishing**：workflow 直接向 registry 证明自己的身份（精确的 repo + 精确的 workflow，在 npmjs.org 侧配置），没有任何静态 token 传输或存储在任何地方。零 secret 可泄露，零 token 需要每六个月轮换。

---

## GitHub secret 深度解析

这五个模式都以某种方式涉及 secret 问题。我的 workflow 中反复出现的几个原则：

**secret 不一定是简单字符串。** 在 `email-autoreply` 中，`ACCOUNTS_JSON` 包含整个多账户配置的压缩 JSON----不只是一个 API key，而是一个完整的数据结构，在运行时原样注入文件：

```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

这避免了提交配置文件（即使是加密的），并且可以在仓库设置中一键更新而不碰代码。

**`GITHUB_TOKEN` 有精确的限制，这是有意为之。** GitHub 每次运行注入的自动 token 很强大，但在某些点上是封死的：默认情况下它不能触发其他 workflow，并且根据仓库配置可能被分支保护规则阻止。这正是 `create-pull-request.yml` 要求单独 PAT（`AUTO_PR_TOKEN`）的原因----来自真实账户（或 GitHub App）的 token，具有明确的 `contents:write` + `pull-requests:write` 权限，与 job 的临时 token 分开。

**权限按 job 而非全局作用域。** 我在这里列出的每个 workflow 都声明了一个最小的、带注释的 `permissions:` 块：

```yaml
permissions:
  contents: read
  actions: read
  checks: write
```

默认的 `GITHUB_TOKEN` 历史上对公共仓库有相当广泛的权限；明确限制为 job 真正需要的权限，可以限制链中的第三方 action 被攻破时的损害。

**最好的 secret 是不存在的 secret。** `typescript-virtual-container` 的 OIDC 模式是这一理念最完整的版本：不去管理 `NPM_TOKEN` 的轮换、过期和泄露风险，workflow 以密码学方式直接向第三方服务证明自己的身份（这个精确的仓库，这个精确的 workflow）。同样的逻辑适用于 AWS、Docker Hub、PyPI----越来越多的 registry 和云服务支持从 GitHub Actions 进行 OIDC。

---

**3 个关键点**

1. 一个 git tag（孤儿，强制推送）可以充当极简数据库或预编译的构建缓存----同一机制的两种不同用途。
2. 一个免费的 GitHub Actions runner 可以变成持久化的 SSH shell，只要接受将其文件系统通过 `inotifywait` 自动保存并以单个 amended commit 持续同步到 git 分支。
3. 默认的 `GITHUB_TOKEN` 是有意受限的----创建跨分支 PR 或零 secret 发布需要专用 PAT，或切换到 OIDC trusted publishing。
