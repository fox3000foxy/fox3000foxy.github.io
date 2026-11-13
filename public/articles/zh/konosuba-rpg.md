---
title: 花了一个周末读 konosuba-rpg 的代码，这是我的发现
description: Discord 回合制 RPG，每步操作实时生成一张 WebP 图：URL 即游戏状态、确定性 RNG、WASM 流水线、5 层缓存、无服务器机器人。
date: 2026-06-10
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
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "5h49eiI3viRML54pb6I5xhWEUfRkVEBpVfx7ZfqWNQnAjl8fc2LJacYMG9HqE6sKQ6b02eYqxOIAbOVhj6u3nw=="
---

# 花了一个周末读 konosuba-rpg 的代码，这是我的发现

这个项目我维护挺久了，但静下心重读自己的代码总有收获。konosuba-rpg 是个 Discord 回合制 RPG，每次操作实时生成一张 WebP 图片。是真正的合成图，带立绘、血条、战斗消息，全都有。

技术栈：TypeScript、Hono、Vercel、Cloudflare Workers、Supabase。全免费托管。Discord 机器人无持久服务器。这篇讲它们是怎么拼到一起的。

![游戏初始状态](/images/konosuba-rpg/game_init.webp)

---

## 基础设计：URL 即游戏状态

最先注意到的：服务端 gameplay 没有任何状态。整场战斗的状态全在 URL 里。

```
/konosuba-rpg/fr/abc123/ATK/DEF/ATK/HUG?monster=Vanir&difficulty=hard
```

seed 后面每一段都是一个操作。服务器收到这个 URL，从头开始，按顺序重放全部操作，返回这一刻的战斗图。没有任何 session，没有内存里跟用户绑定的状态。

Discord 靠可交互按钮工作，玩家点"攻击"，Discord 把按钮的 `custom_id` 发给服务器。这个 custom_id 里是压缩后的战斗 URL 加上新操作。服务器从零重算，返回更新后的图。

```typescript
// processUrl.ts
const VALID_MOVES_SET = new Set(["ATK", "DEF", "HUG", "HEA", "SPE", "USE"]);
// 函数外预编译，不用每次调用重建

export default function processUrl(url: string): [Random, string[], string, string | null, string | null] {
  const urlParts = url.split("/");
  const moves: string[] = [];
  for (const part of urlParts) {
    if (VALID_MOVES_SET.has(part.toUpperCase())) moves.push(part.toUpperCase());
  }
  // seed = 第 6 段，哈希到 8096 个值
  const seedStr = (urlParts[5] || "").toLowerCase();
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed + seedStr.charCodeAt(i)) % 8096;
  }
  return [new Random(seed), moves, seedStr, monster, difficulty];
}
```

函数外预编译的 `Set` 是个细节，但在模块可能被反复求值的 edge 环境里，避免每次调用重建结构。

### RNG：魔改 RC4

随机数发生器是 RC4 实现（流加密算法），拿来当 PRNG 用。

```typescript
export class Random {
  private S: number[]; // 256 项的表
  private i: number;
  private j: number;

  constructor(seed?: number) {
    this.S = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    let workingSeed = seed || Date.now();
    for (let i = 0; i < 256; i++) {
      j = (j + this.S[i] + (workingSeed & 0xff)) & 0xff;
      // 交换 S[i] 和 S[j]
      [this.S[i], this.S[j]] = [this.S[j], this.S[i]];
      workingSeed >>>= 8;
    }
  }

  next(): number { /* ... */ }
  randint(min: number, max: number): number { /* ... */ }
  choice(array: T[]): T { /* ... */ }
}
```

为什么 RC4？因为它是确定性 PRNG，分布不错，seed 碰撞抗性也还行。同 seed = 同样的数字序列 = 同样的战斗。这样任何战斗靠 URL 就能"重放"，还保证两台服务器（Vercel + Cloudflare）对同一 URL 算出完全一样的结果。

---

## Discord 100 字符 custom_id 上限问题

Discord 给按钮的 `custom_id` 限 100 字符。战斗打几十步，URL 轻松超限。

两招应对。

### 1. 操作的 RLE 压缩

操作编码成单个字符（`a`=攻击、`d`=防御、`h`=拥抱……），再做 run-length 编码：

```typescript
// movesUtils.ts
export function compressMoves(moves: string): string {
  // "aaaaaaadddh" → "a6d3h"
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

简单，但玩家连点 10 次攻击时，`aaaaaaaaaa`（10 字符）变 `a10`（3 字符）。UI 里"攻击 x4""攻击 x10"按钮就是干这个的，加速战斗的同时把 payload 压得很好。

### 2. 压不住就用 session token

压缩完还太长，就存库里，换个短 token：

```typescript
// gameSessionService.ts
const TOKEN_PREFIX = "gs.";
const TOKEN_SIZE = 10; // "gs.aBcDeFgHiJ"

export async function encodeGameplayButtons(buttons: RawButton[]): Promise {
  // 按 battle_key 分组，批量插入 Supabase
  // 把 custom_id 换成 "gs.{token}:{userId}"
}

export async function decodeGameplayPayloadWithStatus(encodedPayload: string, userID: string) {
  if (!encodedPayload.startsWith(TOKEN_PREFIX)) {
    return { payload: encodedPayload }; // 不需要查就别查
  }
  // 先查内存，再查 Supabase
  const cached = tokenToSession.get(token) || await loadTokenRowByToken(token);
  // 验归属、TTL（7 天）、turn_version（防止重放旧状态）
}
```

session 7 天 TTL，每 10 分钟自动清理。`turnVersion` 校验防止玩家点回过期状态，不小心"读档"回去的保护，很隐蔽。

两个内存 Map（`tokenToSession`、`latestTurnByBattle`）和图片缓存一样，用 `globalThis as unknown as GameSessionGlobals` 模式，原因后面讲缓存时再说。

---

## 图片渲染流水线

![和史莱姆开战](/images/konosuba-rpg/shot_01_start.webp)

`/konosuba-rpg/:lang/*` 路由返回的不是 JSON。是按需生成的 WebP 图。

流水线是 3 层合成：

```
Background（棋盘 + 边框）
    +
Characters layer（玩家和怪的立绘，固定坐标）
    +
UI overlay（血条、消息、人物图标，经 Satori → SVG → PNG）
    ↓
Photon.watermark() × 2
    ↓
WebP 输出
```

**Background**：两张固定图（棋盘和边框），从文件系统加载，合成一次。

**Characters layer**：立绘按算好的坐标放。死了的玩家剔除（`activeSlots = slots.filter(s => playerHp[s.i] > 0)`）。敌方立绘水平镜像，用手写的 `flipX`，逐像素循环，不引外部依赖。

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

**UI overlay**：最重的部分。界面 JSX（血条、文字、图标）用类 React 写，Satori 渲染成 SVG，`@cf-wasm/resvg` 转 PNG，再导进 Photon 做最终合成。Satori + resvg 都是专门给 Cloudflare Workers 编译的 WASM 模块，带 `edge-light` 标志。

![防御动作](/images/konosuba-rpg/shot_03_defend.webp)

![战斗中](/images/konosuba-rpg/shot_02_combat.webp)

![拥抱动作](/images/konosuba-rpg/shot_04_hug.webp)

---

## 缓存系统，最下功夫的部分

5 层不同的缓存。每一层管流水线里不同粒度的东西。

```typescript
// renderImage.ts -- 全挂 globalThis
G.__imageCache  ??= {} as Record; // 原始资源
G.__base64Cache ??= {} as Record;       // 资源的 base64（给 Satori 用）
G.__fontCache   ??= {} as Record; // 字体
G.__photonCache    ??= new LRUCache(40, freePhoton);
G.__layerCache     ??= new LRUCache(12, freePhoton);
G.__uiPhotonCache  ??= new LRUCache(30, freePhoton);
G.__renderOutputCache ??= new LRUCache(120);
```

`??=` 加 `globalThis` 模式：在某些配置的 edge worker 里，JS 模块两次请求之间可能被重新求值。缓存挂 `globalThis` 上加 `??=`，保证重求值也不丢、不重建。

### WASM 驱逐

Photon 图片缓存（`photonCache`、`layerCache`、`uiPhotonCache`）用驱逐回调：

```typescript
function freePhoton(_key: string, img: Photon.PhotonImage): void {
  try { img.free(); } catch { /* 已经释放了 */ }
}

new LRUCache(40, freePhoton)
```

`Photon.PhotonImage` 是 WASM 对象，内存 alloc 在 WASM 线性内存里，JS GC 管不着。不显式 `.free()` 就永远不释放。LRU 驱逐时自动调 `.free()`，等于把 RAII 搬到了 JavaScript 里。

### 缓存 key 故意做成有损的

```typescript
function buildCharactersKey(playerImages: string[][], playerHp: number[], creatureImages: string[], creatureHp: number): string {
  const players = playerImages.map((imgs, i) => `${imgs[0]}:${playerHp[i] > 0 ? 1 : 0}`).join("|");
  return `chars::${players}::${creatureImages[0]}:${creatureHp > 0 ? 1 : 0}`;
}
```

角色层 key 不编码精确 HP，只记 `1`（活）或 `0`（死）。因为 40 血和 15 血的玩家立绘一模一样。只要没人倒下，挨多少打都不影响这层缓存命中。

UI 层 key 则相反，编码精确 HP（血条每刀都变）和消息哈希：

```typescript
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0; // 有符号 32 位整数
  }
  return hash.toString(16);
}
```

`Math.imul` 强制 32 位整数乘法，不走 float64 转换，哈希多项式稳定。省掉一个外部依赖。

### base64 转换防栈溢出

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

`String.fromCharCode(...大数组)` 参数走调用栈，大图直接栈溢出。按 32K 分块就没事。结果进缓存，同一张图每个 worker 实例只转一次。

---

## STRIPPER.md：串行 await 审计

仓库里有个 `STRIPPER.md`，记录了一次 await 并行化审计。举几个记下来的：

- 读玩家档案原来是 3 个 Supabase 请求串行（进度、run 历史、成就）。改成 `Promise.all`，三者无依赖。
- 战斗结算发奖励（饰品加消耗品）原来串行。同样并行化。
- 按钮 session token 创建原来按组串行。独立组并行创建。

```typescript
// progressionService.ts -- 改之前（串行）
await grantAccessoryDropRewards(...);
await grantConsumableDropRewards(...);

// 改之后
await Promise.all([
  grantAccessoryDropRewards(...),
  grantConsumableDropRewards(...),
]);
```

没什么革命性的，但在 serverless 里每毫秒响应时间都算钱（冷启动也算），值得抠。

---

## 无持久服务器的 Discord 机器人

![胜利](/images/konosuba-rpg/shot_05_win.webp)

常被误解的一点：Discord 机器人不一定需要 WebSocket 长连接。Discord 提供了替代方案：**Interactions Endpoint URL**。你给 Discord 一个 HTTPS 地址，Discord 每次交互（slash 命令、按钮、自动补全）POST 过来。

```typescript
// interactions.ts
export async function handleInteractions(c: Context) {
  const body = await c.req.text();
  const isVerified = await verifySignature(c, body); // Ed25519
  if (!isVerified) return c.text("Invalid signature", 401);

  const interaction: Interaction = JSON.parse(body);
  if (interaction.type === 1) return c.json({ type: 1 }); // Discord ping
  if (interaction.type === 2) return handleSlashCommand(...);
  if (interaction.type === 3) return handleButtonInteraction(...);
  if (interaction.type === 4) return handleAutocomplete(...);
}
```

Discord POST 过来，handler 在 Vercel 函数或 Cloudflare Worker 上跑 50-200ms，回包，结束。不用维持长连接，不用养服务器。整个 Discord 机器人跑在 Vercel 免费套餐上。

Ed25519 验签（`discord-interactions` 的 `verifyKey`）是强制的，Discord 发的每个请求都带签名头，必须验，不然 endpoint 通不过。

### 特殊动画，唯一故意的 await

```typescript
// handleSpecialButton.ts
await new Promise(resolve => setTimeout(resolve, 3000)); // 3 秒
await fetch(`${DISCORD_API_URL}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
  method: "PATCH",
  // ...
});
```

这 3 秒延迟是故意的，STRIPPER.md 里有记录。Megumin 的 Explosion 特攻在 Discord 侧有个动画，消息先更新成中间态，3 秒后再改成结果。这是唯一一个让 Vercel 函数故意多跑一会儿的地方。

![特殊攻击](/images/konosuba-rpg/shot_08_special.webp)

---

## 双平台部署

同一套代码在 Vercel（Node.js）和 Cloudflare Workers（V8 isolates）上不改跑：

```typescript
// worker.ts -- Cloudflare 入口
export default {
  fetch(request: Request, env: WorkerBindings): Promise {
    syncBindingsToProcessEnv(env); // 把 CF secrets 同步进 process.env
    return app.fetch(request, env, ctx);
  }
};

// index.ts -- Vercel/Node 入口
const isVercelRuntime = process.env.VERCEL === "1";
if (!isVercelRuntime) { start(); }
```

主要区别：静态资源。Vercel 上从文件系统读（`/var/task/assets/`）。Cloudflare Workers 上走 `ASSETS` 绑定（CF 静态资源），失败回退到镜像 `fox3000foxy.com/konosuba-rpg/assets`。`assetLoader.ts` 里的 `getAssetBytes` 两条路都走，先试文件系统，再 fetch。

WASM（`@cf-wasm/photon/edge-light`、`@cf-wasm/resvg`）给每个运行时分别有构建。包名里的 `edge-light` 就是 Cloudflare Workers 专用构建，不允许运行时 `new WebAssembly.Module()`，WASM 必须预编译。

---

## 成长线：XP、等级、好感

![Boss，650 血](/images/konosuba-rpg/shot_06_boss.webp)

meta 成长靠 Supabase 免费套餐。表有 `players`（全局 XP、等级、金币）、`character_progress`（Darkness、Aqua、Megumin 各自 XP/等级/好感）、`runs`（战斗历史）、`inventory_items`、`daily_quests_progress`、`achievements_unlocked`、`game_sessions`。

成长模型很简单：

```typescript
// characterService.ts
export function computeLevelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1; // 100 XP 一级
}

export function getLevelFactor(level: number): number {
  return 1 + 0.2 * (level - 1); // 每级 +20% 属性
}

export function getAffinityFactor(affinity: number): number {
  const stars = Math.floor(affinity / 20); // 20 点一星，最高 5 星
  return 1.2 ** stars; // 指数成长
}
```

这些系数在每局 `processGame` 开头作用到人物属性。Kazuma 跟玩家全局等级，另外三人各有 XP/等级。好感（靠捡人物相关掉落涨）独立乘区。

![治疗](/images/konosuba-rpg/shot_07_heal.webp)

掉落用按难度加权的 loot table：

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
  // ...一直到 Legendary
};
```

---

## 测试

三套：单元、性能、泄漏。

泄漏测试最直接：

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
  expect(after - before).toBeLessThan(20); // 堆增长不超过 20MB
});
```

1200 次 `processGame`，前后强制 GC，堆差 < 20MB。过了说明 `processGame` 不漏。渲染测试（`renderImage.spec.ts`）则看执行时间在不在实用阈值内。

还有个 `bench.ts` 给整条流水线 profiling：

```
RENDER_PERF=1 npx tsx bench.ts --runs=20 --warmup=3 --monster=Dragon
```

`RENDER_PERF=1` 时各服务的 `withPerf` wrapper 打点：

```typescript
export async function withPerf(scope: string, label: string, work: () => Promise): Promise {
  const perf = createPerfLogger(scope);
  if (!perf.enabled) return work(); // 关掉时零开销
  perf.mark(`${label}:start`);
  try { return await work(); }
  finally { perf.done(`${label}:done`); }
}
```

`DEV_MODE` 和 `RENDER_PERF` 都不是 `1` 时 `createPerfLogger` 返回 no-op。生产零开销。

---

## 跑起来多少钱

- **Vercel 免费套餐**：100GB 流量，每月 100 万次 serverless 调用。渲一张图算一次调用。
- **Cloudflare Workers 免费套餐**：每天 10 万请求，每请求 10ms CPU 时间（渲染吃 WASM CPU，Workers 上容易超，所以 Vercel 做主力）。
- **Supabase 免费套餐**：500MB 库，5GB 流量。几千玩家够了。

用户量起来之前，整套后端跑在零成本。唯一的摩擦是 Cloudflare Workers 的 CPU 上限，图片渲染是 WASM 重活，所以策略是 Vercel 主力、Workers 做 failover CDN。

---

## 最值得记住的三件事

1. **URL 即游戏状态**不只是小聪明，是 Discord 强加的（按钮 100 字符上限）逼出来的无状态设计，RLE 压缩加 session token 兜底。约束决定了设计。

2. **WASM 缓存加显式释放**：`PhotonImage` 的内存 alloc 在 JS 堆外，不 `.free()` 永远不释放。LRU 驱逐上挂 `freePhoton` 就是 JavaScript 版 RAII。代码里不起眼，生产上没它 worker 必漏。

3. **无 WebSocket 的 serverless Discord 机器人**：比 Gateway WebSocket 方案冷门，但对无状态处理（每次交互独立）的机器人来说，Interactions Endpoint 全方位更优，不用重连，不用心跳，不用养进程。可用性 Discord 那边兜底。

---

*仓库：[fox3000foxy/konosuba-rpg](https://github.com/fox3000foxy/konosuba-rpg)*

*自定义 source-available 许可，不许再分发，随便用。*
