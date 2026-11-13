---
title: Discord 机器人 100% 无服务器：Hono + Cloudflare Workers
description: 我怎么把每月 50 欧的 Discord 机器人换成零元，interaction endpoint、Hono、Workers、实时图片渲染、不用 WebSocket 的完整游戏。
date: 2026-05-29
tags:
  - discord
  - cloudflare
  - serverless
  - typescript
  - bots
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "idd/Ac/Sl+aHjYHgLu/E1/GMVXQodWLrUvtYHvK4xv3y8OPGUVKAFUtWu6MmpTxmlzyQ4d0tSyHqS0iT5hk+MA=="
---

## Discord 机器人 100% 无服务器：Hono + Cloudflare Workers = 💸 零元

我之前在自己机器上养了几个月经典 Discord 机器人。

WebSocket 长连接一直开着。凌晨 3 点自己重连。看我不顺眼就 crash。账单一直涨。

有一天我发现：**为什么要维持连接**？Discord 可以只把感兴趣的事件 POST 给你。你回包，完事。

2021 年起 Discord 有 **interaction endpoint**。

就是纯 HTTP。不用 WebSocket，不用持久状态。收到请求，回 JSON，结束。下个请求自己来。

最爽的：Cloudflare Workers 每天 10 万请求内**免费**。90% 的机器人，每月 0 元。

这篇教你用 **Hono**（超轻 web 框架）加 **Cloudflare Workers** 做无 WebSocket Discord 机器人。带两个真实项目：**Nibi**（学日语机器人，TTS，好玩）和 **Konosuba-RPG**（完整 Discord 游戏，实时图片渲染）。

## WebSocket vs Interaction Endpoint：为什么原来是馊主意

想象一个 Minecraft 游戏，不玩的时候也要一直连着。

服务器一 crash 就自动重连。超时、指数退避、一堆你讨厌的 boilerplate 全要自己写。就为了收交互。

interaction endpoint 反着来。Discord POST 到你 URL。你回包。完事。

服务器挂了？Discord 重试两三次就过了。零 drama。

**之前成本**：Heroku 上每月 50 欧，就为了让 Node 进程一直活着。

**之后成本**：Cloudflare 上每月 0 元，每天 10 万请求内。

## 架构：到底是什么？

Discord POST 一个请求到你的 endpoint。

```plaintext
Discord："喂！用户点了 /ping！"
      ↓
   你的 URL（Cloudflare Worker）
      ↓
 你验明确实是 Discord（验签名）
      ↓
 你解析交互类型
      ↓
 你跑 handler
      ↓
 你回 JSON
      ↓
Discord："好，我显示给用户"
```

纯 HTTP，栈又小又清楚。

## Hono + Cloudflare Workers：省钱组合

**Hono** 是 12KB 的 web 框架。到处跑：Cloudflare Workers、Vercel、AWS Lambda、Deno、Bun……同一份代码。

Cloudflare Workers 是边缘计算。请求进离用户最近的服务器。延迟 \<100ms。每天 10 万请求内免费。

Hono 配 Cloudflare 打 Discord 机器人是绝配。

下面是完整机器人的最小代码：

```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. 取头
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. 验明确实是 Discord（不是垃圾请求）
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3. 解析它发了什么
  const interaction = JSON.parse(body);

  // 4. 按类型回
  if (interaction.type === 1) {
    // Discord 测试（PING）
    return c.json({ type: 1 });
  }

  if (interaction.type === 2) {
    // slash 命令
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

30 行，一个能跑的机器人。

忘了 `bot.login()`、event emitter 和 callback hell。只留 HTTP。

部署到 Cloudflare：

```plaintext
npm install -D wrangler
npx wrangler deploy
```

Boom。你得到 `https://mon-bot.workers.dev/interactions` 这样的 URL。

填到 Discord Developer Portal 的"INTERACTIONS ENDPOINT URL"，Discord 就开始往那里发交互。

## 验签名：假请求走开

Discord 每个请求都拿公钥签名。签名不对？垃圾请求。无视，继续。

`discord-interactions` 包干这个活：

```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // 精确原文（别拿解析过的 JSON！）
  signature,         // x-signature-ed25519 头
  timestamp,         // x-signature-timestamp 头
  publicKey          // Discord Dev Portal 拿的
);
```

**重要坑**：签名依赖**精确** body。你解析 JSON 再 stringify，或者 log 一下 body，签名就坏了。

先验，再解析。顺序不能反。

## 案例 1：Nibi（学日语机器人）

Nibi 是学日语的 Discord 机器人。命令很简单：

*   `/dictionary kanji` → 显示释义
*   `/pronounce テキスト` → 生成 TTS（文字转语音）
*   `/hello` → 打招呼

每个命令一个 TypeScript 文件：

```plaintext
src/commands/
├── dictionary.ts
├── pronounce.ts
├── hello.ts
└── ...
```

命令实现这个接口：

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
  ): Promise<interactionresponse>;
}
```

### /pronounce 命令：让机器人开口

这个最邪门。你扔文本进来（罗马音、假名、汉字，随便），机器人转成平假名，用 VOICEVOX 或 Google TTS 生成语音，在 Discord 发语音消息。

```typescript
const pronounce: Command = {
  data: {
    name: 'pronounce',
    description: '给日语文本生成 TTS',
    options: [
      {
        type: 3,  // STRING
        name: 'text',
        description: '要读的文本',
        required: true
      }
    ]
  },

  async execute(interaction, env) {
    const text = interaction.data.options[0].value;

    try {
      // 1. 罗马音 → 平假名，用 Kuroshiro
      const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });

      // 2. 生成 TTS 音频
      const audioBuffer = await generateTTS(hiragana);

      // 3. 上传文件到 Discord
      const uploadFilename = await uploadToDiscord(
        audioBuffer,
        interaction.channel.id,
        env.BOT_TOKEN
      );

      // 4. 发带音频的消息
      await sendVoiceMessage(
        interaction.channel.id,
        uploadFilename,
        audioBuffer.length / 16000,  // 时长秒数
        env.BOT_TOKEN
      );

      return {
        type: 4,
        data: { content: `“${text}”的发音` }
      };
    } catch (err) {
      return {
        type: 4,
        data: {
          content: '出错了：音频生成失败 xD',
          flags: 64  // ephemeral（仅自己可见）
        }
      };
    }
  }
};
```

很疯吧：调外部 API，上传文件到 Discord，发带文件的消息。全程无 WebSocket，纯 HTTP。

### Supabase 做持久化

Nibi 用 Supabase 当 key-value 存。查用户注册没：

```typescript
const DatabaseUtils = new DatabaseUtils({
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY
});

const users = await DatabaseUtils.readJson('users');
const user = users.find(u => u.id === interaction.member.user.id);

if (!user) {
  // 加用户
  users.push({ id: interaction.member.user.id, verified: true });
  await DatabaseUtils.writeJson('users', users);
}
```

很基础（没有真 SQL 查询，就是 JSON），但够用。小机器人完美。

## 案例 2：Konosuba-RPG（带图片渲染的 Discord 游戏）

这个更疯。

Konosuba-RPG 是 Discord 上的**完整游戏**。打怪、涨 XP、装饰品、升级。每场战斗实时生成一张**图片**。不用预渲染 sprite。图片按玩家属性、怪、战斗状态动态合成。

图在 Cloudflare Workers 上 \<500ms 生成。字面意思。

### 渲染架构

```plaintext
Discord（你点"攻击"）
    ↓
Cloudflare Worker 收到交互
    ↓
更新游戏状态（XP、HP 等）
    ↓
用 Satori 生成 JSX
    ↓
Resvg（Wasm）转 SVG → PNG
    ↓
上传图片到 Discord
    ↓
发带图的消息
```

全程不到一秒。离谱。

### Workers 侧图片渲染

Konosuba 用 **Satori**（JSX → SVG）加 **Resvg**（SVG → PNG）：

```typescript
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. 写 UI 的 JSX
  const jsx = (
    <div style="{{" display:="" 'flex',="" gap:="" '20px'="" }}="">
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

正常写 JSX。变 SVG。SVG 变 PNG。Cloudflare Worker 上 \<100ms。

get 到威力了吗？美得很。

### 游戏状态与成长

玩家数据在 Supabase：

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

每次操作（攻击、防御、治疗）更新库里属性。再用新属性重渲图。

### 交互：玩法的按钮

游戏用**按钮交互**做战斗操作：

```typescript
{
  type: 1,  // ActionRow
  components: [
    {
      type: 2,  // Button
      style: 1,  // Primary（蓝）
      label: 'Attack',
      custom_id: 'battle_attack'
    },
    {
      type: 2,
      style: 2,  // Secondary（灰）
      label: 'Defend',
      custom_id: 'battle_defend'
    }
  ]
}
```

点"Attack"，Discord POST 一个带 `custom_id: 'battle_attack'` 的交互。handler 路由：

```typescript
if (interaction.type === 3) {
  // 组件交互（按钮点击等）
  const customId = interaction.data.custom_id;

  if (customId === 'battle_attack') {
    return await handleAttack(interaction, env);
  }
  if (customId === 'battle_defend') {
    return await handleDefend(interaction, env);
  }
}
```

Boom，算伤害，更新库，重渲图，发出去。

回合制完整游戏，不维持任何连接。纯无状态 HTTP。烂得漂亮。

## Supabase：为 Workers 生的库

经典数据库（PostgreSQL、MySQL、MongoDB）为持久 TCP 连接设计。开 socket，连着，发查询。问题：**Cloudflare Workers 不支持持久 TCP 连接**。每次请求是个短命进程。回完客户端，Worker 就没了。

下面这样不行：

```typescript
// Workers 上这样不行
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // 持久 TCP 连接 = 死
```

`pg`、`postgres.js` 这类原生 driver 也走 TCP。Workers 上全挂。

**Supabase 全解决。**

Supabase 是盖在 PostgreSQL 上的 REST API。发普通 HTTP 请求。每次调用独立，无持久连接，无状态要管。serverless 体质完美。

```typescript
// Workers 上完美运行
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

Supabase 客户端（`@supabase/supabase-js`）底层用 `fetch`。`fetch` 在 Workers 原生。零配置，零 driver，零持久连接。

| 数据库 | 兼容 Workers？ | 为什么 |
| --- | --- | --- |
| **Supabase** | ✅ 行 | 无状态 REST API，纯 HTTP |
| **PlanetScale（MySQL）** | ⚠️ 半行 | 只能 HTTPS，没长事务 |
| **Neon** | ⚠️ 半行 | serverless 分支，但 driver 要 TCP |
| **Turso（libSQL）** | ⚠️ 半行 | HTTP 可行但受限 |
| **Prisma/Prisma Postgres** | ❌ 不行 | 要持久 TCP |
| **MongoDB Atlas** | ❌ 不行 | TCP driver，无原生 REST API |
| **Redis（Upstash）** | ✅ 行 | REST API 走 HTTP |

Supabase 真正强的还不只是库，是整套 edge-first 生态：

- **Auth**：REST API 管 session，无状态
- **Storage**：文件上传下载走 HTTP
- **Realtime**：WebSocket 可选，不想用就 REST 轮询
- **Row Level Security**：安全规则写库里，不写后端

serverless Discord 机器人，Supabase 是最简单最稳的选择。不配 driver，不养连接，不管超时。只发 HTTP 请求。

看上面 Nibi 的例子就懂：持久化就是 `readJson()` 加 `writeJson()`。不用 migration，不用复杂 schema，不用重配置。直接跑。机器人做大了再迁真 SQL 查询，provider 都不用换。

## Polyfill：Node 要在 Workers 上跑

有些包默认你在 Node。Kuromoji（假名解析）用 `XMLHttpRequest`。Workers 有 `fetch`，没 `XMLHttpRequest`。

简单解：在 index.ts 顶部加 polyfill：

```typescript
// 给 kuromoji 的 XMLHttpRequest Polyfill
if (!globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest = class {
    // 最小 Stub
  } as any;
}
```

或写个专用模块：

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

基础 hack，但管用。

## 做个 npm 包：hono-discord-interactions

手写机器人 boilerplate 很多：

*   验 Discord 签名
*   路由交互类型
*   管命令、组件、modal
*   回合法 JSON

可以抽象成 npm 包。比如：

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

Boum。200 行变 20 行。Nibi 直接砍一半。

以后再说的想法。

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

得到 URL：`https://mon-bot.workers.dev/interactions`

成本：每天 10 万请求内**免费**。超出：100 万次 0.5 美元。

剧透：用户不到一万活跃，你花不完 10 万请求。

### Vercel

```plaintext
npm run vercel:deploy
```

URL：`https://mon-bot-xyz.vercel.app/api/interactions`

一样免费。

### 两个一起

Hono 到处跑。同一份代码同时部署 Cloudflare 和 Vercel。冗余或选型前对比都行。

## 速查清单

1.  在 Discord Developer Portal 建应用
2.  抄下 PUBLIC\_KEY、BOT\_TOKEN、APP\_ID
3.  建项目：
4.  写 index.ts（验签名加路由）
5.  注册 slash 命令（一次）：
6.  部署：
7.  把 URL 填进 Discord（Developer Portal → 应用 → Interactions Endpoint URL）
8.  Discord 测试连接（你要回 PING）
9.  拉机器人进服务器
10. 搞定

## 优点 vs 局限

**优点**

*   成本极小（每天 10 万请求内免费）
*   可扩展（不用管连接）
*   简单（无 WebSocket boilerplate）
*   快（Cloudflare = 边缘服务器）
*   可移植（Hono 代码到处跑）

**局限**

*   只能收交互（slash 命令、按钮、modal），收不到服务器实时事件（成员加入、身份组变更、消息删除等）
*   3 秒超时回包，不然 Discord 显示"应用无响应"
*   真要实时事件，得另加 HTTP webhook 或辅助 WebSocket 连接

90% 的机器人（全 slash 命令）？够了。

## 结语

我在 KonosubaRPG 和 Nibi 上抠了很久性能，要么省请求数，要么压热 CPU 时间，要么压冷启动。结果各项性能都很顶。
说实话，我一开始把大部分项目云化（这词对吗）是因为懒得在自己 VPS 上养它们。真的，我觉得是 GitHub Actions 救了我的命。Workers 也是，但当我发现能用 GitHub Actions 加 schedule 跑 daemon，我是真松了口气。

我应该会给 [email-autoreply](https://github.com/fox3000foxy/email-autoreply/) 写篇文章，订阅 RSS 等更新吧 :))。

**三句话总结：**

1.  **Interaction endpoint = HTTP 无服务器**，无 WebSocket，无持久连接。Discord POST，你回。Cloudflare 免费。
2.  **Hono 是完美工具**，12KB 轻框架，多运行时，零依赖。Cloudflare、Vercel、Node，到处同一份代码。
3.  **Workers 上图片渲染很疯**，Satori + Resvg（Wasm）在 JSX 里拼动态 UI，转 PNG 不到 100ms。完整游戏跑得动。

疯得很。

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
