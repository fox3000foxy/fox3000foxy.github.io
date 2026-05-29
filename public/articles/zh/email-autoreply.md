---
title: 我用 git 当数据库在 GitHub Actions 上免费跑了一个机器人
description: 如何编写一个在 GitHub Actions 上以 0€/月运行的 AI 邮件自动回复器 -- 使用 git 标签作为数据库和预编译的运行时快照。
date: 2026-05-29
tags:
  - automation
  - javascript
  - serverless
  - ai
  - git
authors:
  - fox3000foxy
---

# 我用 git 当数据库，在 GitHub Actions 上白嫖跑了个 bot

我有个 24/7 自动运行的邮件回复机器人。

它能读我的邮件，理解内容，然后用 AI 自动回复。它记得之前的对话。它会忽略 newsletter 和 `noreply@`，遇到太敏感的内容就转发给真人。

每月成本：**0€**。

没有服务器。没有 VPS。没有数据库。只有 GitHub Actions 和一个疯狂的 hack：**用 git 当数据库**。

你猜到套路了吗？没有？行吧，坐稳了，这玩意儿又蠢又天才 xD

---

## 问题：GitHub Actions 是无状态的

GitHub Actions 是免费的。你可以每 5 分钟跑一个 cron，跑你的代码，免费。

但有个问题：它是 **无状态的**。

每次运行都在一台全新的机器上启动。两次执行之间什么都不会保留。上一次的运行？忘了。清掉了。就像从未存在过一样。

对于邮件回复机器人来说，这是个巨大的问题。比如：

> "我已经处理过的最后一封邮件是什么？"

如果 bot 每次运行都忘了这个，它要么会反复回复同一批邮件（灾难），要么会漏掉一些邮件。

你需要持久状态。通常，持久状态 = 数据库。但数据库需要服务器，而服务器就不免费了。

这就是事情变得有趣的地方。

---

## 解决方案：用 git tag 当数据库

你的 GitHub 仓库本身就是持久存储。免费。有版本控制。永远在那里。

那为什么不把状态存在这里面呢？

思路：每次运行时，bot 从 **git tag** 读取已处理的上一个邮件 UID。处理新邮件。然后把 tag 更新为新 UID 再 push 回去。

```
Run #1: 读取 tag "lastid" → 空
        处理邮件 1-50
        push tag "lastid" = 50

Run #2: 读取 tag "lastid" → 50
        处理邮件 51-73
        push tag "lastid" = 73

Run #3: 读取 tag "lastid" → 73
        ...
```

git tag 就是数据库。只有一个值，但这就是我们需要的全部。

### 读取状态

任务开始时，从 tag 获取值：

```bash
git fetch origin --tags lastid || true
git show refs/tags/lastid:data/lastId > data/lastId || true
```

`git show refs/tags/lastid:data/lastId` 意思是："给我 tag `lastid` 中文件 `data/lastId` 的内容"。

Boom。拿到值了，不需要数据库。

### 写入状态

结束时，用新值重新创建 tag：

```bash
git switch --orphan lastid-tmp   # 没有历史的新分支
git rm -rf .                      # 清空
mkdir -p data
printf "%s\n" "${LAST_ID_CONTENT}" > data/lastId

git add data/lastId
git commit -m "lastId snapshot"
git tag -f lastid                 # 强制将 tag 指向这个 commit
git push --force ...origin lastid # push tag
```

我们创建一个 **孤儿** 分支（没有历史），只放 `lastId` 文件，commit，tag，force push。

为什么用孤儿分支？为了不在仓库历史里堆积一万个状态 commit。每次更新都会覆盖上一次的。tag 始终只指向 **一个** commit，里面只有 **一个** 值。

干净。免费。完全离谱 xD

---

## 第二个 hack：运行时快照

GitHub Actions 还有另一个问题：`npm install`。

如果每次运行（每 5 分钟）都执行 `npm install` + `npm run build`，你每次要浪费 60-90 秒。在频繁的 cron 上，这就是好几分钟的计算资源被浪费了。

解决方案：预编译代码 **一次**，也存到 git tag 里。

build workflow（当你 push 到 `master` 时触发）做这些：

```bash
# 编译代码
bun install
bun run build

# 把 dist/ + node_modules/ 存到 tag "runtime"
git checkout --orphan temp-runtime
git rm -rf .
cp -r "$TMPDIR"/* .
git add dist node_modules package.json bun.lock data
git commit -m "runtime build"
git tag -f runtime
git push --force ...origin runtime
```

`runtime` tag 包含编译后的代码和 `node_modules`。开箱即用。

而 cron 则直接 checkout 这个 tag：

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime    # 预构建代码，不是源码
    fetch-depth: 1

# 没有 npm install，没有 build！
- name: Process emails
  run: node dist/index.js --action
```

没有安装。没有构建。cron 瞬间启动，直接执行 `node dist/index.js`。

两个 tag，各司其职：
- `runtime` = 可运行的代码（当你 push 代码时更新）
- `lastid` = 持久状态（每次运行时更新）

脏得优雅。

---

## Bot 本身：AI 自动回复器

好了，git hack 很酷，但 bot 到底干什么的？

它通过 IMAP 读取你的邮件，用 AI（Groq + Llama 3.3 70B）理解内容，然后自动回复。

使用依赖注入（InversifyJS）的干净服务架构：

```
App
├── ImapService      → 读取邮件 (IMAP)
├── SmtpService      → 发送回复 (SMTP)
├── ParserService    → 解析邮件内容
├── ReplyService     → 生成 AI 回复
├── SummaryService   → 对话记忆
├── AccountsService  → 管理多个邮箱
└── ConfigService    → 配置 / 环境变量
```

### 两种运行模式

Bot 可以两种方式运行：

**Listener 模式（实时）**：持续的 IMAP 连接，带指数退避重连。适用于 VPS。

```typescript
this.imapService.on("exists", async (data) => {
  console.log(`[MAIL] 新邮件！总数: ${data.count}`);
  // 立即处理新邮件
});
```

**Action 模式（批处理）**：从 `lastId` 开始处理新邮件，然后关闭。适用于 GitHub Actions cron。

```bash
node dist/index.js --action
```

`--action` 模式就是使用 git hack 的那个。它读取 `lastId`，处理新增内容，写入新 `lastId`，结束。

### 不要回复机器人

如果你的 bot 回复 **所有** 邮件，它会回复 newsletter、通知、`noreply@`。灾难。更糟的是：如果两个 bot 互相回复，那就是无限的邮件循环。噩梦。

所以要激进地过滤：

```typescript
export function isAutomatedSender(address) {
  const automatedPatterns = [
    "noreply", "no-reply", "donotreply",
    "mailer-daemon", "postmaster", "bounce",
    "newsletter", "notification", "marketing",
    "billing", "receipt", "promo", ...
  ];
  const local = address.split("@")[0].toLowerCase();
  return automatedPatterns.some(p => local.includes(p));
}
```

还有通过邮件 header 检测：

```typescript
export function isAutomatedByHeaders(headers) {
  return (
    ["bulk", "list", "junk"].includes(headers.precedence) ||
    headers["auto-submitted"] !== "no" ||
    headers["list-unsubscribe"] !== "" ||   // newsletter 会有这个
    /mailchimp|sendgrid|mailgun|brevo/i.test(headers["x-mailer"])
  );
}
```

Header 里有 `List-Unsubscribe`？那是 newsletter。`Precedence: bulk`？群发邮件。`X-Mailer: Mailchimp`？你懂的。直接忽略。

就像夜店的保安：机器人不准进 xD

### 神奇的触发器

AI 可以决定完全不要回复，或者把问题转给真人。怎么实现？通过回复中的特殊触发器。

系统提示告诉它：

> 如果是自动邮件/newsletter → 回复 `<no_reply>`
> 如果太重要/太敏感（法律、财务等）→ 回复 `<manual_reply_required>`
> 否则 → 写真实回复

然后代码解析这个：

```typescript
const aiReply = completion.choices[0].message.content.trim();
const manualTrigger = aiReply.includes(MANUAL_REPLY_TRIGGER);
const noReply = aiReply.includes(NO_REPLY_TRIGGER);

if (noReply) {
  console.log("[MAIL] AI 决定忽略。跳过。");
  return;
}

if (manualTrigger) {
  console.log("[MAIL] 太烫手了，转发给真人。");
  await this.smtpService.sendManualForward(...);
  return;
}

// 否则发送 AI 回复
await this.smtpService.sendReply(...);
```

AI 有权说"不，这个我不碰，叫真人来"。这才是智慧。

---

## 对话记忆

一个细节改变一切：bot **记得** 对话。

当它回复某人时，它保存一份交流摘要。下次这个人再来信，摘要会被重新注入到提示中。

存储方式：每个联系人一个 JSON 文件。

```
data/customers/
├── moi%40gmail.com/
│   ├── alice%40example.com.json
│   └── bob%40client.fr.json
```

摘要本身也是 AI 生成的，它把旧摘要和新消息合并：

```typescript
const completion = await groq.chat.completions.create({
  model: "llama-3.3-70b-versatile",
  messages: [
    { role: "system", content: "你是一个记忆助手。在不丢失信息的前提下合并旧摘要和新消息。" },
    { role: "user", content: `现有摘要:\n${existing}\n\n新消息:\n${incomingContent}` }
  ],
  temperature: 0.0,  // 确定性，不要创造性
  max_tokens: 800,
});
```

所以 bot 会随着时间的推移构建压缩记忆。不需要存储所有邮件，只需要一个智能增长的摘要。

而这些 JSON 文件呢？嗯...也是存在 git 里的，在 runtime tag 里。无处不在的 git xD

---

## 提示长度的巧妙处理

有个让我笑了的小技术细节。

模型有 token 限制。如果你的邮件 + 摘要 + 角色提示超出限制，API 会报错。

代码通过 **级联截断** + 重试来处理：

```typescript
try {
  // 第一次尝试，正常限制
  completion = await groq.chat.completions.create({...});
} catch (error) {
  if (!this.isLengthError(error)) throw error;

  // 是长度错误：用更紧的限制重试
  ({ systemContent, userContent } = this.buildPromptPayload({
    ...,
    limits: {
      systemPromptChars: 2200,  // 代替 3000
      summaryChars: 1800,       // 代替 4000
      personaChars: 900,        // 代替 1500
      userContentChars: 2200,   // 代替 8000
    },
  }));
  completion = await groq.chat.completions.create({...});  // 重试
}
```

如果还不行，就切得更短再试一次。简单，有效，不会崩溃。

---

## 好了，具体怎么运行的？

一次 cron 运行的完整流程：

```
1. GitHub Actions 触发（每 5 分钟的 cron）
2. Checkout "runtime" tag（预编译代码）
3. git show refs/tags/lastid → 获取已处理的最后 UID
4. node dist/index.js --action
   ├── 连接 IMAP
   ├── 从 lastId+1 开始获取邮件
   ├── 每封邮件：
   │   ├── 解析内容
   │   ├── 过滤机器人（自动的就跳过）
   │   ├── 匹配收件人账户
   │   ├── 获取对话记忆
   │   ├── 生成 AI 回复 (Groq)
   │   ├── <no_reply>？跳过
   │   ├── <manual_reply_required>？转发给真人
   │   ├── 否则：发送回复 (SMTP)
   │   └── 更新对话记忆
   └── 写入新的 lastId
5. git push --force tag "lastid" 带新值
```

然后 5 分钟后重来。永远如此。免费。

---

**3 个要点：**

1. **Git = 免费数据库** -- 一个孤儿 tag 可以在两次无状态运行之间存储你的持久状态。`git show refs/tags/X:fichier` 来读取，force-push 来写入。不需要数据库。

2. **预编译到 runtime tag** -- 不用每次 cron 运行都执行 `npm install`，把编译后的代码 + node_modules 存到 git tag。cron 瞬间启动。

3. **AI bot 要知道什么时候闭嘴** -- `<no_reply>` 和 `<manual_reply_required>` 触发器让 AI 决定不回复或转给真人。再加上反机器人过滤。否则你会造出无限的邮件循环。

Serverless cron 带持久状态、AI、记忆，全月 0€。完全离谱，但我爱了 xD
