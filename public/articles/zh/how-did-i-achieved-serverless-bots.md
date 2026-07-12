---
title: 100% 无服务 Discord 机器人：Hono + Cloudflare Workers
description: 如何将我每月50欧元的Discord机器人替换为零成本 -- 交互端点、Hono、Workers、实时图像渲染以及无需WebSocket的完整游戏。
date: 2026-05-29authors:
  - fox3000foxy
tags:
  - discord
  - cloudflare
  - serverless
  - typescript
  - bots
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "t1tCs2uUNOCgk5XKILBPZ4VeamVbWQU92k/hTLHj3RbYMOb3yUlOZNzJzE6YcXWGQCFKYLyE1A6kDy3oal+4SA=="
---

## Discord bot 100% 无服务器 : Hono + Cloudflare Workers = 💸 零成本

我花了几个月在自己的机器上维护传统的 Discord bot。

WebSocket 连接永远开着。Bot 凌晨三点自动重连。Bot 崩了只是因为我看羊的眼神不对。账单一直涨。

有一天我发现：**为什么要保持连接**？Discord 可以只 POST 你感兴趣的东西。你回复，完事。

从 2021 年起，Discord 提供了 **interaction endpoints**。

就是纯 HTTP。没有 WebSocket。没有持久状态。你收到请求，返回 JSON，结束。下一条请求自己会来。

最棒的是：Cloudflare Workers **免费**直到每天 10 万次请求。对 90% 的 bot 来说，这就是 0€/月。

这篇文章会教你如何用 **Hono**（超轻量 web 框架）和 **Cloudflare Workers** 做一个不需要 WebSocket 的 Discord bot。我会给你看两个真实项目：**Nibi**（学日语的 bot，带 TTS，很酷）和 **Konosuba-RPG**（一个 _完整的_ Discord 游戏，带实时图片渲染 xD）。

## WebSocket vs. Interaction Endpoints : 为什么之前是个馊主意

想象一下一个 Minecraft 服务器，你不玩的时候也得保持连接开着。

而且服务器每次崩了都会自动重连。你得处理超时、指数退避重连，所有那些我们讨厌的垃圾样板代码。就为了接收交互。

Interaction endpoints 正好相反。Discord POST 到你的 URL。你回复。完事。

如果你的服务器崩了？Discord 重试 2-3 次然后继续。零 drama。

**之前成本**：每个月 50€ 在 Heroku 上，就为了让一个 Node 进程活着。

**之后成本**：每个月 0€ 在 Cloudflare 上，直到 10 万次请求/天。

## 架构 : 到底是什么？

Discord POST 一个请求到你的 endpoint。

```plaintext
Discord: "嘿！用户点了 /ping！"
      ↓
   你的 URL (Cloudflare Worker)
      ↓
   你验证是不是真的 Discord (签名检查)
      ↓
   你解析 interaction 类型
      ↓
   你执行 handler
      ↓
   你返回 JSON
      ↓
Discord: "好的，我会把这个显示给用户"
```

就是纯 HTTP。没有魔法。没有重库。

## Hono + Cloudflare Workers : 省钱组合

**Hono** 是一个 12KB 的 web 框架。哪里都能跑：Cloudflare Workers、Vercel、AWS Lambda、Deno、Bun... 同样的代码到处跑。

Cloudflare Workers 是在边缘计算。你的请求到达最近的服务器。响应时间：\<100ms。成本：免费直到每天 10 万次请求。

Hono + Cloudflare 的组合对 Discord bot 来说简直是绝配。

这是一个完整 bot 的最小代码：

```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. 获取 headers
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. 验证真的是 Discord（不是垃圾请求）
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3. 解析它发来的内容
  const interaction = JSON.parse(body);

  // 4. 根据类型回复
  if (interaction.type === 1) {
    // Discord 测试 (PING)
    return c.json({ type: 1 });
  }

  if (interaction.type === 2) {
    // 这是一个斜杠命令
    const name = interaction.data.name;
    if (name === 'ping') {
      return c.json({
        type: 4,
        data: { content: 'Pong!' }
      });
    }
  }

  return c.json({ type: 4, data: { content: 'Unknown command' } });
});

export default app;
```

就 30 行，一个能用的 bot 就好了。

没有 `bot.login()`。没有 event emitter。没有回调地狱。只有 HTTP。

部署到 Cloudflare：

```plaintext
npm install -D wrangler
npx wrangler deploy
```

Boom。你得到一个 URL 比如 `https://mon-bot.workers.dev/interactions`。

把这个放到 Discord Developer Portal 的 "INTERACTIONS ENDPOINT URL" 里，Discord 就会开始把交互发到那里。

## 验证签名 : 拒绝假请求

Discord 用公钥给每个请求签名。如果你收到一个签名不对的请求？那就是垃圾。忽略它，继续。

`discord-interactions` 这个包帮你搞定：

```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // 精确的原始文本（不是解析后的 JSON！）
  signature,         // header x-signature-ed25519
  timestamp,         // header x-signature-timestamp
  publicKey          // 从 Discord Dev Portal 获取
);
```

**重要陷阱**：签名依赖于 _精确的_ body。如果你解析 JSON 再重新序列化，或者你 log 了 body，签名就坏了。

先验证。再解析。顺序很重要。

## 案例 1 : Nibi（日语学习 bot）

Nibi 是一个学日语的 Discord bot。简单的命令：

*   `/dictionary kanji` → 显示释义
*   `/pronounce テキスト` → 生成 TTS（文本转语音）
*   `/hello` → 欢迎消息

每个命令是一个 TypeScript 文件：

```plaintext
src/commands/
├── dictionary.ts
├── pronounce.ts
├── hello.ts
└── ...
```

每个命令实现这个接口：

```typescript
interface Command {
  data: {
    name: string;
    description: string;
    options?: SlashCommandOption[];
  };
  execute(
    interaction: Interaction,
    env: Bindings
  ): Promise<InteractionResponse>;
}
```

### /pronounce 命令 : 让 bot 说话

这个最骚。你发一段文本（罗马音、平假名、汉字，随便什么），bot 把它转成平假名，通过 VOICEVOX 或 Google TTS 生成语音，然后在 Discord 上发一条音频消息。

```typescript
const pronounce: Command = {
  data: {
    name: 'pronounce',
    description: '为日语文本生成 TTS',
    options: [
      {
        type: 3,  // STRING
        name: 'text',
        description: '要发音的文本',
        required: true
      }
    ]
  },

  async execute(interaction, env) {
    const text = interaction.data.options[0].value;

    try {
      // 1. 用 Kuroshiro 把罗马音转成平假名
      const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });

      // 2. 生成 TTS 音频
      const audioBuffer = await generateTTS(hiragana);

      // 3. 上传文件到 Discord
      const uploadFilename = await uploadToDiscord(
        audioBuffer,
        interaction.channel.id,
        env.BOT_TOKEN
      );

      // 4. 发送带音频的消息
      await sendVoiceMessage(
        interaction.channel.id,
        uploadFilename,
        audioBuffer.length / 16000,  // 时长（秒）
        env.BOT_TOKEN
      );

      return {
        type: 4,
        data: { content: `"${text}" 的发音` }
      };
    } catch (err) {
      return {
        type: 4,
        data: {
          content: '错误：无法生成音频 xD',
          flags: 64  // ephemeral（私密消息）
        }
      };
    }
  }
};
```

离谱的是：你调用外部 API，上传文件到 Discord，用这个文件发送消息。全程没有 WebSocket，只有 HTTP。

### 用 Supabase 做持久化

Nibi 用 Supabase 做 key-value 存储。检查用户是否已注册：

```typescript
const DatabaseUtils = new DatabaseUtils({
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY
});

const users = await DatabaseUtils.readJson('users');
const user = users.find(u => u.id === interaction.member.user.id);

if (!user) {
  // 添加用户
  users.push({ id: interaction.member.user.id, verified: true });
  await DatabaseUtils.writeJson('users', users);
}
```

很基础（不是真正的 SQL 查询，只是 JSON），但能用。对小 bot 来说完美。

## 案例 2 : Konosuba-RPG（带图片渲染的 Discord 游戏）

好吧这个是真的离谱。

Konosuba-RPG 是一个 Discord 上的**完整游戏**。你打怪、赚经验、装备饰品、升级。每场战斗都实时生成一张**图片**。没有预渲染的 spritesheet。图片是根据玩家属性、怪物和战斗状态动态合成的。

而且图片在 Cloudflare Workers 上 \<500ms 就能生成。真的。

### 渲染架构

```plaintext
Discord（你点了 "Attack"）
    ↓
Cloudflare Worker 收到 interaction
    ↓
更新游戏状态（经验值、血量等）
    ↓
用 Satori 生成 JSX
    ↓
用 Resvg (Wasm) 把 SVG 转成 PNG
    ↓
上传图片到 Discord
    ↓
发送带图片的消息
```

全部在一秒内完成。简直了。

### 在 Workers 上渲染图片

Konosuba 使用 **Satori**（JSX → SVG）和 **Resvg**（SVG → PNG）：

```typescript
import Satori from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. 创建 UI 的 JSX
  const jsx = (
    <div style={{ display: 'flex', gap: '20px' }}>
      <div>
        <h1>{gameState.player.name}</h1>
        <p>HP: {gameState.player.hp}/{gameState.player.maxHp}</p>
      </div>
      <div>
        <h1>{gameState.enemy.name}</h1>
        <p>HP: {gameState.enemy.hp}/{gameState.enemy.maxHp}</p>
      </div>
    </div>
  );

  // 2. JSX → SVG
  const svg = await satori.render(jsx, {
    width: 1200,
    height: 800,
    fonts: [/* ... */]
  });

  // 3. SVG → PNG
  const png = resvg.render(svg).asPng();

  return png;  // Uint8Array
}
```

你写普通的 JSX。它变成 SVG。SVG 变成 PNG。在 Cloudflare Worker 上 \<100ms。

你感受到这威力了吗？就是... 美 xD

### 游戏状态与进度

玩家数据存在 Supabase 里：

```typescript
const player = await db
  .from('players')
  .select('*')
  .eq('discord_id', interaction.user.id)
  .single();

// 玩家赢了
const { data: updated } = await db
  .from('players')
  .update({
    level: player.level + 1,
    xp: player.xp + xpGain
  })
  .eq('id', player.id);
```

每个动作（攻击、防御、治疗）都会更新数据库里的数据。然后用新数据重新生成图片。

### 交互 : 游戏按钮

游戏用 **button interactions** 来做战斗操作：

```typescript
{
  type: 1,  // ActionRow
  components: [
    {
      type: 2,  // Button
      style: 1,  // Primary（蓝色）
      label: 'Attack',
      custom_id: 'battle_attack'
    },
    {
      type: 2,
      style: 2,  // Secondary（灰色）
      label: 'Defend',
      custom_id: 'battle_defend'
    }
  ]
}
```

当你点 "Attack"，Discord POST 一个带有 `custom_id: 'battle_attack'` 的 interaction。handler 会路由它：

```typescript
if (interaction.type === 3) {
  // Component interaction（按钮点击等）
  const customId = interaction.data.custom_id;

  if (customId === 'battle_attack') {
    return await handleAttack(interaction, env);
  }
  if (customId === 'battle_defend') {
    return await handleDefend(interaction, env);
  }
}
```

然后 boom，你计算伤害，更新数据库，重新生成图片，发送。

这是一个完整的回合制游戏，没有任何持久连接。纯 HTTP 无状态。彻底离谱 xD

## Supabase：为 Workers 而生的数据库

传统数据库（PostgreSQL、MySQL、MongoDB）都是为持久 TCP 连接设计的。你打开一个 socket，保持连接，发送查询。问题在于：**Cloudflare Workers 不支持持久 TCP 连接**。每个请求都是一个短暂的进程。一旦你响应客户端，Worker 就消失了。

你不能这样做：

```typescript
// 这在 Workers 上不 ⚠️ 工作
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // 持久 TCP 连接 = 死
```

就连 `pg` 或 `postgres.js` 这样的原生 PostgreSQL 驱动也都使用 TCP 连接。在 Workers 上它们会崩溃。

**Supabase 解决了一切问题。**

Supabase 是在 PostgreSQL 之上的 REST API。你发起普通的 HTTP 请求。每次调用都是独立的，没有持久连接，没有需要管理的状态。它完美适配 serverless 模型。

```typescript
// 这在 Workers 上完美工作
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

Supabase 客户端（`@supabase/supabase-js`）底层使用的是 `fetch`。而 `fetch` 在 Workers 上是原生支持的。零配置、零驱动、零持久连接。

| 数据库 | Workers 兼容？ | 原因 |
| --- | --- | --- |
| **Supabase** | ✅ 是 | 无状态 REST API，纯 HTTP |
| **PlanetScale (MySQL)** | ⚠️ 部分 | 仅 HTTPS 连接，不支持长事务 |
| **Neon** | ⚠️ 部分 | Serverless 分支但需要 TCP 驱动 |
| **Turso (libSQL)** | ⚠️ 部分 | HTTP 可行但有限制 |
| **Prisma/Prisma Postgres** | ❌ 否 | 需要持久 TCP |
| **MongoDB Atlas** | ❌ 否 | TCP 驱动，没有原生 REST API |
| **Redis (Upstash)** | ✅ 是 | 基于 HTTP 的 REST API |

Supabase 的真正优势不仅仅是数据库----而是整个生态系统都是为边缘计算设计的：

- **Auth**：用于会话的 REST API，无状态运行
- **Storage**：通过 HTTP 上传/下载文件
- **Realtime**：可选的 WebSocket，但也可以通过 REST 轮询
- **Row Level Security**：安全规则存在于数据库中，不在你的后端

对于 serverless Discord 机器人来说，Supabase 是最简单、最可靠的选择。无需配置驱动，无需维护连接，无需超时。只需要 HTTP 请求。

如果你想看实际例子，看看上面的 Nibi：它的持久化代码就是 Supabase 上的 `readJson()` 和 `writeJson()`。无需迁移、无需复杂 schema、无需疯狂配置。开箱即用。而且如果你的机器人做大了，你可以在不更换提供商的情况下迁移到真正的 SQL 查询。

## Polyfills : 当 Node 想在 Workers 上跑的时候

有些包依赖 Node 的 API。Kuromoji（日语解析器）用了 `XMLHttpRequest`。Workers 有 `fetch`，没有 `XMLHttpRequest`。

简单方案：在 index.ts 顶部加个 polyfill：

```typescript
// 为 kuromoji 做 XMLHttpRequest polyfill
if (!globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest = class {
    // 最小 stub
  } as any;
}
```

或者建一个专用模块：

```typescript
// src/utils/polyfills.ts
export function setupPolyfills() {
  if (!globalThis.XMLHttpRequest) { /* ... */ }
  if (!globalThis.Buffer) { /* ... */ }
}

// src/index.ts
import { setupPolyfills } from './utils/polyfills';
setupPolyfills();
```

就是基础 hack，但能用。

## 做一个 npm 包 : hono-discord-interactions

手动做 bot 有很多样板代码：

*   验证 Discord 签名
*   路由 interaction 类型
*   处理命令、组件、弹窗
*   返回合法的 JSON

我们可以把这些抽象成一个 npm 包。比如：

```typescript
import { createDiscordHandler } from 'hono-discord-interactions';

const handler = createDiscordHandler({
  publicKey: env.PUBLIC_KEY,
  commands: [
    {
      name: 'ping',
      execute: async (interaction) => ({
        type: 4,
        data: { content: 'Pong!' }
      })
    },
    {
      name: 'hello',
      execute: async (interaction) => ({
        type: 4,
        data: { content: `Hi ${interaction.member.user.username}!` }
      })
    }
  ]
});

const app = new Hono();
app.post('/interactions', handler);
export default app;
```

砰。20 行代替 200 行。Nibi 的代码量能轻松减半。

以后再说 xD

## 部署

### Cloudflare Workers

```plaintext
npm install -D wrangler

# wrangler.toml
[env.production]
name = "mon-bot"
main = "src/index.ts"

# Secrets
wrangler secret put PUBLIC_KEY --env production
wrangler secret put BOT_TOKEN --env production
wrangler secret put SUPABASE_URL --env production

# Deploy
wrangler deploy --env production
```

结果 URL：`https://mon-bot.workers.dev/interactions`

成本：**免费**直到每天 10 万次请求。超出后：$0.50/百万次。

剧透：除非你有 1 万个活跃用户，否则你永远花不到那 10 万次请求。

### Vercel

```plaintext
npm run vercel:deploy
```

URL：`https://mon-bot-xyz.vercel.app/api/interactions`

同样免费。

### 两者同时跑

Hono 哪里都能跑。你可以把同一份代码部署到 Cloudflare 和 Vercel。用来做冗余或者先测试再决定。

## 快速清单

1.  在 Discord Developer Portal 创建一个 Application
2.  复制 PUBLIC\_KEY、BOT\_TOKEN、APP\_ID
3.  创建项目：
4.  写 index.ts（签名验证 + 路由）
5.  注册斜杠命令（一次即可）：
6.  部署：
7.  把 URL 放到 Discord（Developer Portal → Application → Interactions Endpoint URL）
8.  Discord 测试连接（你必须回复 PING）
9.  把 bot 邀请到服务器
10. 搞定

## 优势 vs 局限

**优势**

*   便宜（免费直到每天 10 万次请求）
*   可伸缩（无需管理连接）
*   简单（没有 WebSocket 样板代码）
*   快速（Cloudflare = 边缘服务器）
*   可移植（Hono 代码 = 多个平台）

**局限**

*   没有实时服务器事件（成员加入、角色添加、消息删除等）----你只收到交互（斜杠命令、按钮、弹窗）
*   3 秒超时来回复----否则 Discord 显示 "Application did not respond"
*   如果你需要真正的事件----需要单独的 HTTP webhook 或辅助 WebSocket 连接

对 90% 的 bot（都基于斜杠命令）来说？够用了。

## 总结

我花了不少时间优化 KonosubaRPG 和 Nibi，要么为了节省尽可能多的请求，要么为了减少热 CPU 时间，要么为了减少冷启动。结果就是，几乎所有地方的性能都相当不错。
要知道，我开始把大部分项目搬到云上（我都不知道这个词对不对）是因为我真的懒得继续在自己 VM 上托管它们了。真的，我觉得是 GitHub Actions 救了我的老命。Workers 也是，但当我发现可以用 GitHub Actions 加定时任务做守护进程时，真的救了我一命。

我可能会写一篇关于 [email-autoreply](https://github.com/fox3000foxy/email-autoreply/) 项目的文章，所以订阅 RSS 源等着看吧 :))。

**要记住的 3 件事：**

1.  **Interaction endpoints = HTTP 无服务器** -- 没有 WebSocket，没有持久连接。Discord POST，你回复。在 Cloudflare 上免费。
2.  **Hono 是完美工具** -- 轻量框架（12KB），多运行时，零依赖。在 Cloudflare、Vercel、Node 上代码都一样。
3.  **在 Workers 上渲染图片 = 离谱** -- Satori + Resvg (Wasm) 让你用 JSX 组合动态 UI，在 \<100ms 内转成 PNG。一个完整的游戏可以跑在这上面。

太牛了 xD

```plaintext
wrangler deploy
```

```plaintext
npm run register-commands
```

```plaintext
npm init -y
npm install hono discord-interactions
npm install -D wrangler typescript
```
