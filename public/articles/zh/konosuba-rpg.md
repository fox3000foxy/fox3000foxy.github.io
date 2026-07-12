---
itle: "我花了一个周末阅读 konosuba-rpg 的代码，这是我发现的一切"
description: "一个 Discord 回合制 RPG，每次操作都实时生成 WebP 图片：URL 即游戏状态、确定性 RNG、WASM 管线、5 级缓存、无服务器 bot。"
date: 2026-06-10authors:
  - fox3000foxy
tags:
  - discord
  - rpg
  - typescript
  - hono
  - cloudflare
  - supabase
  - wasm
  - gaming
  - serverless
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "i5P0uFxbyvShabJSUfvQZO7wcpnAqlSUtD2K48oU5dQPCupOuIJFjx8eiZueXgCn7LPejQN26xLMnNjRr8uaWw=="
---

# 我花了一个周末阅读 konosuba-rpg 的代码，这是我发现的一切

我维护这个项目已经有一段时间了，但静下心来重读自己的代码总是很有启发。konosuba-rpg 是一个 Discord 回合制 RPG，每次操作都实时生成一张 WebP 图片。不是文本 embed。而是一张真正的合成图像，包含精灵、血条、战斗信息----全部都有。

技术栈：TypeScript、Hono、Vercel、Cloudflare Workers、Supabase。完全免费托管。而且这个 Discord bot 无需持久化服务器。这篇文章将解释这一切是如何组合在一起的。

![游戏初始状态](/images/konosuba-rpg/game_init.webp)

---

## 基础设计：URL 即游戏状态

最令人印象深刻的一点是：服务端完全没有保存游戏状态。一场战斗的完整状态全部包含在 URL 中。

```
/konosuba-rpg/fr/abc123/ATK/DEF/ATK/HUG?monster=Vanir&difficulty=hard
```

seed 之后的每个片段都是一个已执行的操作。服务器收到这个 URL，从头开始，按顺序重放所有操作，然后返回该时刻的战斗图片。没有会话，没有与用户相关的内存状态。

Discord 通过交互式按钮工作----当玩家按下"攻击"时，Discord 将按钮的 `custom_id` 发送给服务器。这个 custom_id 包含添加了新操作后的压缩战斗 URL。服务器从头重新计算所有内容并返回更新后的图片。

```typescript
// processUrl.ts
const VALID_MOVES_SET = new Set(["ATK", "DEF", "HUG", "HEA", "SPE", "USE"]);
// 在函数外部预编译----不会在每次调用时重新创建

export default function processUrl(url: string): [Random, string[], string, string | null, string | null] {
  const urlParts = url.split("/");
  const moves: string[] = [];
  for (const part of urlParts) {
    if (VALID_MOVES_SET.has(part.toUpperCase())) moves.push(part.toUpperCase());
  }
  // seed = 第6个片段，哈希到 8096 个值
  const seedStr = (urlParts[5] || "").toLowerCase();
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed + seedStr.charCodeAt(i)) % 8096;
  }
  return [new Random(seed), moves, seedStr, monster, difficulty];
}
```

在函数外部预编译 `Set` 是个小细节，但可以避免在每次调用时重建该结构，在模块可能被重新评估的边缘计算环境中尤其重要。

### RNG：改良版 RC4

随机数生成器是一个将 RC4（流加密算法）改造为 PRNG 的实现。

```typescript
export class Random {
  private S: number[]; // 256 条目表
  private i: number;
  private j: number;

  constructor(seed?: number) {
    this.S = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    let workingSeed = seed || Date.now();
    for (let i = 0; i < 256; i++) {
      j = (j + this.S[i] + (workingSeed & 0xff)) & 0xff;
      // swap S[i] 和 S[j]
      [this.S[i], this.S[j]] = [this.S[j], this.S[i]];
      workingSeed >>>= 8;
    }
  }

  next(): number { /* ... */ }
  randint(min: number, max: number): number { /* ... */ }
  choice(array: T[]): T { /* ... */ }
}
```

为什么用 RC4？因为它是一个确定性 PRNG，具有良好的分布特性和合理的抗 seed 碰撞能力。相同的 seed = 相同的数字序列 = 每次战斗结果相同。这样可以通过保留 URL 来"重放"任何战斗，并确保两个不同的服务器（Vercel + Cloudflare）对相同的 URL 产生完全相同的结果。

---

## Discord 100 字符限制问题

Discord 对按钮的 `custom_id` 施加了 100 个字符的限制。经过几十次操作后，战斗 URL 很容易超过这个限制。

有两种机制解决这个问题。

### 1. RLE 操作压缩

操作被编码为单个字符（`a`=attack, `d`=defend, `h`=hug...）并通过游程编码压缩：

```typescript
// movesUtils.ts
export function compressMoves(moves: string): string {
  // "aaaaaadddh" → "a6d3h"
  let result = "";
  let count = 1;
  for (let i = 1; i <= actions.length; i++) {
    if (actions[i] === actions[i - 1]) {
      count++;
    } else {
      result += actions[i - 1] + (count > 1 ? String(count) : "");
      count = 1;
    }
  }
  return head + result;
}
```

很简单，但当玩家连续攻击 10 次时，`aaaaaaaaaa`（10 字符）会变成 `a10`（3 字符）。UI 中的"攻击 x4"和"攻击 x10"按钮正是为此而设----加快战斗速度同时更好地压缩 payload。

### 2. 当压缩不够用时的会话 Token

如果压缩后的 payload 仍然太长，则会将其存入数据库并分配一个短 token：

```typescript
// gameSessionService.ts
const TOKEN_PREFIX = "gs.";
const TOKEN_SIZE = 10; // "gs.aBcDeFgHiJ"

export async function encodeGameplayButtons(buttons: RawButton[]): Promise {
  // 按 battle_key 分组 payload，批量插入 Supabase
  // 将 custom_id 替换为 "gs.{token}:{userId}"
}

export async function decodeGameplayPayloadWithStatus(encodedPayload: string, userID: string) {
  if (!encodedPayload.startsWith(TOKEN_PREFIX)) {
    return { payload: encodedPayload }; // 无需查找
  }
  // 先查内存，再查 Supabase
  const cached = tokenToSession.get(token) || await loadTokenRowByToken(token);
  // 验证所有权、TTL（7 天）和 turn_version（防止重放旧状态）
}
```

会话的 TTL 为 7 天，每 10 分钟自动清理一次。`turnVersion` 验证可防止玩家在进度前进后重放过期状态----这是对意外"回退"的巧妙保护。

内存中的两个 Maps（`tokenToSession`、`latestTurnByBattle`）使用与图片缓存相同的 `globalThis as unknown as GameSessionGlobals` 模式，原因将在下文说明。

---

## 图片渲染管线

![对史莱姆的战斗开始](/images/konosuba-rpg/shot_01_start.webp)

`/konosuba-rpg/:lang/*` 路由返回的不是 JSON。它返回按需生成的 WebP 图片。

管线组织为 3 个合成层：

```
背景（棋盘 + 边框）
    +
角色层（玩家精灵 + 怪物，固定位置）
    +
UI 覆盖层（血条、消息、角色图标，通过 Satori → SVG → PNG）
    ↓
Photon.watermark() × 2
    ↓
WebP 输出
```

**背景**：两张固定图片（棋盘和边框），从文件系统加载并合成一次。

**角色层**：精灵按计算出的坐标定位。死亡的玩家被排除在外（`activeSlots = slots.filter(s => playerHp[s.i] > 0)`）。敌方精灵通过自定义 `flipX` 水平镜像----逐像素循环而非外部依赖。

```typescript
function flipX(img: Photon.PhotonImage): Photon.PhotonImage {
  const w = img.get_width(), h = img.get_height();
  const raw = img.get_raw_pixels();
  const flipped = new Uint8Array(raw.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      const dst = (y * w + (w - 1 - x)) * 4;
      flipped[dst] = raw[src]; flipped[dst+1] = raw[src+1];
      flipped[dst+2] = raw[src+2]; flipped[dst+3] = raw[src+3];
    }
  }
  return new Photon.PhotonImage(flipped, w, h);
}
```

**UI 覆盖层**：这是最重的部分。界面的 JSX（血条、文字、图标）以 React-like 方式通过 Satori 描述，渲染为 SVG，由 `@cf-wasm/resvg` 转换为 PNG，然后导入 Photon 进行最终合成。Satori + resvg 是两个专为 Cloudflare Workers 编译的 WASM 模块，使用了 `edge-light` 标志。

![防御动作](/images/konosuba-rpg/shot_03_defend.webp)

![战斗进行中](/images/konosuba-rpg/shot_02_combat.webp)

![拥抱动作](/images/konosuba-rpg/shot_04_hug.webp)

---

## 缓存系统----最精心设计的部分

共有 5 个不同级别的缓存。每个缓存针对管线的不同粒度。

```typescript
// renderImage.ts -- 全部放在 globalThis 上
G.__imageCache  ??= {} as Record; // 原始素材
G.__base64Cache ??= {} as Record;       // 素材的 base64（供 Satori 使用）
G.__fontCache   ??= {} as Record; // 字体
G.__photonCache    ??= new LRUCache(40, freePhoton);
G.__layerCache     ??= new LRUCache(12, freePhoton);
G.__uiPhotonCache  ??= new LRUCache(30, freePhoton);
G.__renderOutputCache ??= new LRUCache(120);
```

`globalThis` 上的 `??=` 模式：边缘 worker 中的 JavaScript 模块在某些配置下可能在请求之间被重新评估。使用 `??=` 将缓存存储在 `globalThis` 上可确保它们在重新评估后仍然存在而不会重新创建。

### WASM 驱逐机制

Photon 图片缓存（`photonCache`、`layerCache`、`uiPhotonCache`）使用驱逐回调：

```typescript
function freePhoton(_key: string, img: Photon.PhotonImage): void {
  try { img.free(); } catch { /* 已释放 */ }
}

new LRUCache(40, freePhoton)
```

`Photon.PhotonImage` 是一个 WASM 对象，其内存在 WASM 线性端分配，不受 JavaScript GC 管理。如果不显式调用 `.free()`，这块内存永远不会被释放。LRU 驱逐会自动触发 `.free()`----这是 JavaScript 中的 RAII 模式。

### 缓存键故意有损

```typescript
function buildCharactersKey(playerImages: string[][], playerHp: number[], creatureImages: string[], creatureHp: number): string {
  const players = playerImages.map((imgs, i) => `${imgs[0]}:${playerHp[i] > 0 ? 1 : 0}`).join("|");
  return `chars::${players}::${creatureImages[0]}:${creatureHp > 0 ? 1 : 0}`;
}
```

角色层的缓存键不编码 HP 的精确值----只有 `1`（活着）或 `0`（死亡）。因为 40 HP 的玩家和 15 HP 的玩家精灵是完全相同的。只要没有人倒下，缓存命中可以承受任何伤害。

而 UI 缓存键则编码精确的 HP（血条每次受击都会变化）和消息的哈希值：

```typescript
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0; // 32 位有符号整数
  }
  return hash.toString(16);
}
```

`Math.imul` 强制 32 位整数乘法，避免了 float64 转换并产生稳定的多项式哈希。不需要外部依赖。

### 无栈溢出的 base64 转换

```typescript
function getBase64Cached(key: string, buf: ArrayBuffer): string {
  if (base64Cache[key]) return base64Cache[key];
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000; // 32768 字节
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  const b64 = btoa(binary);
  base64Cache[key] = b64;
  return b64;
}
```

`String.fromCharCode(...largeArray)` 在大图片上可能导致栈溢出，因为参数是通过调用栈传递的。按 32KB 分块可以避免这个问题。结果会被缓存----同一张图片的 base64 转换在每个 worker 实例中只执行一次。

---

## STRIPPER.md----await 串行审计

仓库中有一个 `STRIPPER.md` 文件，记录了 `await` 并行化的审计情况。以下是一些记录的例子：

- 玩家资料加载曾串行执行 3 次 Supabase 查询（进度、run 摘要、成就）。它们之间没有依赖关系，已改为 `Promise.all`。
- 战斗结束奖励发放（饰品 + 消耗品）是串行的。同样已并行化。
- 按钮的会话 token 创建是逐组进行的。独立的组现在并行创建。

```typescript
// progressionService.ts -- 之前（串行）
await grantAccessoryDropRewards(...);
await grantConsumableDropRewards(...);

// 之后
await Promise.all([
  grantAccessoryDropRewards(...),
  grantConsumableDropRewards(...),
]);
```

没什么革命性的，但在 serverless 环境中，每毫秒响应时间都计费（或影响冷启动），这就很重要了。

---

## 无持久服务器的 Discord bot

![胜利](/images/konosuba-rpg/shot_05_win.webp)

一个常被误解的点：Discord bot 不一定需要持久的 WebSocket 连接。Discord 提供了一个替代方案：**Interactions Endpoint URL**。你向 Discord 提供一个 HTTPS URL，Discord 会为每个交互（斜杠命令、按钮、自动补全）发送一个 POST 请求。

```typescript
// interactions.ts
export async function handleInteractions(c: Context) {
  const body = await c.req.text();
  const isVerified = await verifySignature(c, body); // Ed25519
  if (!isVerified) return c.text("Invalid signature", 401);

  const interaction: Interaction = JSON.parse(body);
  if (interaction.type === 1) return c.json({ type: 1 }); // ping Discord
  if (interaction.type === 2) return handleSlashCommand(...);
  if (interaction.type === 3) return handleButtonInteraction(...);
  if (interaction.type === 4) return handleAutocomplete(...);
}
```

Discord 发送 POST，处理程序在 Vercel 函数或 Cloudflare Worker 上运行 50-200ms，响应后即结束。无需维护持久连接，无需保持服务器运行。整个 Discord bot 托管在 Vercel 免费层上。

Ed25519 验证（来自 `discord-interactions` 的 `verifyKey`）是必须的----Discord 在 headers 中发送一个签名，你必须验证它，否则 Discord 会拒绝该 endpoint。

### 特殊动画----唯一有意的 await

```typescript
// handleSpecialButton.ts
await new Promise(resolve => setTimeout(resolve, 3000)); // 3 秒
await fetch(`${DISCORD_API_URL}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
  method: "PATCH",
  // ...
});
```

这个 3 秒的故意延迟在 STRIPPER.md 中被记录为有意为之。Megumin 的特殊攻击（Explosion）在 Discord 端有动画效果----消息首先更新为中间视觉效果，3 秒后修改为最终结果。这是唯一一个 Vercel 函数故意运行超过必要时间的场景。

![特殊攻击](/images/konosuba-rpg/shot_08_special.webp)

---

## 双平台可部署性

同一代码库无需修改即可在 Vercel（Node.js）和 Cloudflare Workers（V8 isolates）上运行：

```typescript
// worker.ts -- Cloudflare 入口
export default {
  fetch(request: Request, env: WorkerBindings): Promise {
    syncBindingsToProcessEnv(env); // 将 CF 密钥注入 process.env
    return app.fetch(request, env, ctx);
  }
};

// index.ts -- Vercel/Node 入口
const isVercelRuntime = process.env.VERCEL === "1";
if (!isVercelRuntime) { start(); }
```

主要区别在于静态资源。在 Vercel 上，从文件系统读取（`/var/task/assets/`）。在 Cloudflare Workers 上，通过 `ASSETS` binding（CF 静态资源）访问，并回退到 HTTPS mirror（`fox3000foxy.com/konosuba-rpg/assets`）。`assetLoader.ts` 中的 `getAssetBytes` 处理两种路径，先尝试文件系统，再尝试 fetch。

WASM（`@cf-wasm/photon/edge-light`、`@cf-wasm/resvg`）为每个运行时提供独立的构建。包名中的 `edge-light` 标志表示兼容 Cloudflare Workers 的构建，后者不允许在运行时使用 `new WebAssembly.Module()`----WASM 必须预编译。

---

## 成长系统：经验值、等级、好感度

![一个 Boss，650 HP](/images/konosuba-rpg/shot_06_boss.webp)

元成长系统基于 Supabase 免费层。数据模式包括 `players` 表（全局 XP、等级、金币）、`character_progress`（每个角色----Darkness、Aqua、Megumin----的 XP/等级/好感度）、`runs`（战斗历史）、`inventory_items`、`daily_quests_progress`、`achievements_unlocked`、`game_sessions`。

成长模型很简单：

```typescript
// characterService.ts
export function computeLevelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1; // 每级 100 XP
}

export function getLevelFactor(level: number): number {
  return 1 + 0.2 * (level - 1); // 每级 +20% 属性
}

export function getAffinityFactor(affinity: number): number {
  const stars = Math.floor(affinity / 20); // 每 20 点一颗星，最多 5 颗星
  return 1.2 ** stars; // 指数增长
}
```

这些系数在每次 `processGame` 开始时作用于角色属性。Kazuma 跟随玩家的全局等级，其他三个角色各自拥有独立的 XP/等级。好感度（通过拾取与角色相关的掉落物获得）独立乘算其属性。

![治疗](/images/konosuba-rpg/shot_07_heal.webp)

掉落系统使用按难度加权的战利品表：

```typescript
const LOOT_TABLE_BY_DIFFICULTY: Record = {
  [MonsterDifficulty.Easy]: {
    baseRolls: 2, bonusRollChance: 0.1, maxBonusRolls: 2,
    rarityWeights: [
      { rarity: Rarity.Bronze, weight: 68 },
      { rarity: Rarity.Silver, weight: 25 },
      { rarity: Rarity.Gold,   weight: 6  },
      { rarity: Rarity.Epic,   weight: 1  },
    ],
  },
  // ...直到 Legendary
};
```

---

## 测试

三套测试：单元测试、性能测试和内存泄漏测试。

内存泄漏测试尤为直接：

```typescript
// leaks.spec.ts
it('does not show strong heap growth across repeated runs', async () => {
  global.gc();
  const before = heapUsedMb();

  for (let i = 0; i < 1200; i++) {
    await processGame(new Random(), ['ATK', 'DEF', 'HUG', 'ATK', 'DEF'], 'Dragon', Lang.English);
  }

  global.gc();
  const after = heapUsedMb();
  expect(after - before).toBeLessThan(20); // 堆增长最多 20MB
});
```

1200 次 `processGame` 迭代，强制 GC 前后各一次，堆增量 < 20MB。如果这个测试通过，`processGame` 就没有内存泄漏。渲染测试（`renderImage.spec.ts`）则验证执行时间是否在实用阈值以下。

还有一个 `bench.ts` 脚本用于分析完整管线：

```
RENDER_PERF=1 npx tsx bench.ts --runs=20 --warmup=3 --monster=Dragon
```

当 `RENDER_PERF=1` 时，每个服务中的 `withPerf` 包装器会记录时间：

```typescript
export async function withPerf(scope: string, label: string, work: () => Promise): Promise {
  const perf = createPerfLogger(scope);
  if (!perf.enabled) return work(); // 禁用时零开销
  perf.mark(`${label}:start`);
  try { return await work(); }
  finally { perf.done(`${label}:done`); }
}
```

如果 `DEV_MODE` 和 `RENDER_PERF` 不是 `1`，`createPerfLogger` 返回 no-op。生产环境零开销。

---

## 运行成本

- **Vercel 免费层**：100GB 带宽，每月 100 万次 serverless 调用。图片渲染算一次调用。
- **Cloudflare Workers 免费层**：每天 10 万次请求，每次请求 10ms CPU 时间（渲染在 Workers 上可能超过此限制，因此以 Vercel 为主）。
- **Supabase 免费层**：500MB 数据库，5GB 带宽。足以支持数千名玩家。

整个后端在达到显著规模之前以零成本运行。唯一的瓶颈是 Cloudflare Workers 的 CPU 限制----图片渲染因 WASM 而 CPU 密集，因此策略是 Vercel 为主，Workers 作为故障转移 CDN。

---

## 值得记住的 3 件事

1. **URL 即游戏状态**不仅仅是一个巧妙的技巧----这是 Discord 施加的限制（按钮有 100 字符限制）所迫出来的架构，进而产生了无状态设计，包含 RLE 压缩和会话 token 作为回退。限制决定了设计。

2. **带显式驱逐的 WASM 缓存**：`PhotonImage` 在 JavaScript 堆之外分配内存，不调用 `.free()` 永远不会被 GC。将 `freePhoton` 绑定到 LRU 的驱逐上，就是 JavaScript 中的 RAII。这在代码中并不显眼，但没有它，worker 在生产中会内存泄漏。

3. **无需 WebSocket 的无服务器 Discord bot**：这不如 WebSocket 网关方法知名，但对于处理无状态操作（每个交互相互独立）的 bot，Interactions Endpoint 严格更优----无需重连、无需心跳、无需维护进程。Discord 在其基础设施端管理可用性。

---

*仓库：[fox3000foxy/konosuba-rpg](https://github.com/fox3000foxy/konosuba-rpg)*

*源代码可用自定义许可证----禁止再分发，可自由使用。*
