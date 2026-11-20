---
title: GitHub Actions 的 5 种骚操作（以及它们教会我的 secret 课）
description: 一个被改成免费 VPS 的 CI runner，一个自己给自己开 PR 的机器人，一次零 secret 的 npm 发布。翻我自己的仓库，收集那些走出“lint + test + deploy”的 GitHub Actions 套路。
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "t+XY/aJx/7QmCYGqWDczhqk1n3yXDMYG65+scS05OLdZkSjUPSIhZng2qSqHOPrASkF91NZgKWob1zsK9/5p2A=="
---

# GitHub Actions 的 5 种骚操作

GitHub Actions 纸面上是干经典 CI/CD 的：你 push，它 lint，它测试，它部署。我之前写过一个特例（拿 git tag 当 bot 邮件数据库，见那篇专文）。但翻我自己的仓库，够得上单独一篇的套路不少，不再围着单个项目转，做个技术合集。

五个用法，从常规到离谱。

## 1. git tag 当两次运行之间的持久状态

快速 recap，完整版在 `email-autoreply` 那篇。GitHub Actions 设计上 stateless：每次运行从干净机器启动。变通：把一个值（ID、时间戳，随便什么小状态）存进专用 git tag，不进任何分支。

```bash
# 读状态
git show refs/tags/lastid:data/lastId > data/lastId

# 写状态（孤儿分支，单提交，强制推 tag）
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```

关键：孤儿分支保证不攒历史，强制 tag 而不是分支，保证不污染仓库分支列表。

## 2. git tag 当预编译构建缓存

同族思路，不同用途：这次存的不是应用状态，是**构建产物**。`build` job 编译一次代码（push 到 `master` 时），把 `dist/` + `node_modules/` 推到 `runtime` tag。`cron` job 直接 checkout 这个 tag，不用每次跑 `bun install && bun run build`：

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# 不用 install，不用 build，代码直接能跑
- run: node dist/index.js --action
```

运行从约 20 秒变约 10 秒。cron 跑得勤，这就可观了。`actions/cache` 干类似活（缓存依赖），但 git tag 更直接，你要的是钉死一个版本化产物、显式指向它，而不是单纯加速 `npm install`。

## 3. 一个聚合多个 job 的必选检查

看着不起眼、配保护分支时救命的套路。`konosuba-rpg` 上 CI 有三个并行独立 job（`typecheck`、`lint`、`tests`），加第四个 `test-battery` job，唯一工作就是依赖前三个：

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

没这个门面 job，保护分支要勾三个独立必选检查，每加改一个 job 就要更新一遍列表。有 `test-battery`，仓库设置里只勾一个名字，内部怎么变都不影响。

## 4. 把免费 runner 变成临时 VPS

全场最离谱，我最喜欢的：`repo-to-vps` 把 GitHub Actions runner 的预期用途整个掀了，变成最长 6 小时（单个 job 上限）的免费 SSH Linux 机器。

原理：job 几乎只干一件事，启动 [tmate](https://tmate.io/)（tmux 的 fork，SSH 或浏览器分享终端 session）：

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

真正的难题是 GitHub Actions runner 的文件系统**用完即扔**：job 一结束全消失。几小时的 SSH session，你干的东西下次全蒸发，那要它何用。解法：git 分支当文件系统的实时快照，持续同步。

`start-tmate.sh` 按顺序做：

1. job 启动**从**专用 `filesystem` 分支**恢复**文件系统（`git reset --hard` 上去）。
2. `inotifywait` 持续**盯**文件变动，文件一动**立刻提交推送**：

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1   # 防抖
  done
}
```

3. 每次保存 **amend** 上个提交而不是建新的（`git commit --amend --no-edit`），`filesystem` 分支永远一个提交，避免攒几千个快照。
4. `while true` 循环 tmate session 死了自动重启，`remain-on-exit on` 让终端 `exit` 后还能连。
5. tmate 生成的 SSH URL 写进 `host.conf` 文件，提交到 `filesystem` 分支，经 GitHub API 取（`gh api .../contents/host.conf`），不用看过 job 实时日志。
6. `periodic_save` routine 后台每 5 秒跑一次，防 `inotifywait` 漏事件。

结果：完整 Linux shell，哪都能连，文件系统跨 session 持久，而底下（GitHub Actions runner）压根不是为这个设计的。唯一真限制是每 job 6 小时超时：到点重跑工作流。

## 5. 自己给自己开 PR 的机器人

`konosuba-rpg` 上 push 到 `dev` 分支触发 job，查有没有到 `main` 的开 PR，没有就用 `actions/github-script` 调 GitHub REST API 自动建一个：

```js
const { data: comparison } = await github.rest.repos.compareCommits({
  owner, repo, base: 'main', head: 'dev',
});
if (comparison.ahead_by === 0) return; // 没东西可提

const { data: existing } = await github.rest.pulls.list({
  owner, repo, state: 'open', head: `${owner}:dev`, base: 'main',
});
if (existing.length > 0) return; // 已经有开的 PR

await github.rest.pulls.create({
  owner, repo, head: 'dev', base: 'main',
  title: 'chore: auto PR from dev to main',
});
```

关键是用的 token。这个工作流**不用**自动 `GITHUB_TOKEN`：它要求单独的 `AUTO_PR_TOKEN` secret，缺了直接失败：

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

## 6. 零 secret 发布 npm

五个里最低调，但对未来可能最重要：`typescript-virtual-container` 的 `publish.yml` 工作流**没有任何 npm secret**。没有 `NPM_TOKEN`，没有 `NODE_AUTH_TOKEN`。只有这个：

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

`npm publish` 照样能跑，因为 npm 仓库现在支持 **trusted publishing** 走 OIDC：工作流直接向仓库证明自己身份（精确到仓库加工作流，配在 npmjs.org 那边），没有任何静态 token 传过、存过。零 secret 可漏，零 token 每半年转一次。

---

## GitHub secret 深水区

这五个套路都以某种方式碰 secret 问题。几条我每个工作流反复用的原则：

**secret 不一定是简单字符串。** `email-autoreply` 里 `ACCOUNTS_JSON` 是整个多账号配置 minify 后的 JSON：完整数据结构，不只是 API key，运行时原样注入文件：

```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

不用提交配置文件（哪怕加密），改配置在仓库设置点一下，不碰代码。

**`GITHUB_TOKEN` 有明确边界，故意的。** 每个 run 自动注入的 token 很强，但几处被锁死：默认触发不了别的 workflow，按仓库配置可能被分支保护规则拦。这正是 `create-pull-request.yml` 要求单独 PAT（`AUTO_PR_TOKEN`）的原因：来自真账号（或 GitHub App）、显式 `contents:write` + `pull-requests:write` 权限的 token，和临时的 job token 不是一回事。

**权限按 job  scoped，别全局。** 这里列的每个工作流都有最小 `permissions:` 块，还带注释：

```yaml
permissions:
  contents: read
  actions: read
  checks: write
  # Only allow writing checks, everything else is read-only
```

公有仓库默认 `GITHUB_TOKEN` 历史上权限不小，显式收到 job 真需要的，链条里某个第三方 action（`uses: 某人/action@版本`）被黑了， blast radius 也小。

**最好的 secret 是不存在的 secret。** `typescript-virtual-container` 的 OIDC 套路是这个思路最彻底的版本：不管理 `NPM_TOKEN` 的轮换、过期、泄露风险，工作流直接向第三方密码学证明身份（就是这个仓库、就是这个工作流）。AWS、Docker Hub、PyPI 同理：越来越多仓库和云支持 GitHub Actions 的 OIDC。

---

**三句话总结**

1. 孤儿、强制推的 git tag 能当极简数据库，也能当预编译构建缓存：同一机制两种用途。
2. 免费 GitHub Actions runner 能变持久 SSH shell，只要文件系统持续同步到 git 分支，`inotifywait` 自动保存，永远 amend 成单个提交。
3. 默认 `GITHUB_TOKEN` 故意设限：跨分支建 PR 或无 secret 发布，要么单独 PAT，要么上 OIDC trusted publishing。
