---
title: "I Spent a Weekend Reading the konosuba-rpg Code and Here's What I Found"
description: "A turn-based Discord RPG where every action generates a WebP
  image on the fly: URL as game state, deterministic RNG, WASM pipeline, 5-level
  cache, serverless bot."
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
author_sig: "5CY2dMhe3cmB20l86dO4hSwLqg1bQjnSUL5GPP4zhdaCufMgH3pohsbhQ3COy3eXmxGo6sVCUmOZRcdarLCI9A=="
---

# I spent a weekend reading the konosuba-rpg code and here's what I found

I've maintained this project for a while, but rereading your own code with fresh eyes is always instructive. konosuba-rpg is a turn-based Discord RPG where every action generates a WebP image on the fly. It's a real composed image, with sprites, health bars, combat messages -- everything.

The stack: TypeScript, Hono, Vercel, Cloudflare Workers, Supabase. Fully free hosting. And the Discord bot runs with no persistent server. This post explains how it all holds together.

![Initial game state](/images/konosuba-rpg/game_init.webp)

---

## The core design: the URL as game state

The first thing that strikes you: there is no server-side state for gameplay. A whole fight's state fits in the URL.

```
/konosuba-rpg/fr/abc123/ATK/DEF/ATK/HUG?monster=Vanir&difficulty=hard
```

Each segment after the seed is a played action. The server receives that URL, replays everything from the start in order, and returns an image of the fight at that exact moment. No session, no RAM state tied to a user.

Discord works via interactive buttons -- when the player hits "Attack", Discord sends the server the button's `custom_id`. That custom_id holds the fight's compressed URL with the new action appended. The server recomputes everything from scratch and returns the updated image.

```typescript
// processUrl.ts
const VALID_MOVES_SET = new Set(["ATK", "DEF", "HUG", "HEA", "SPE", "USE"]);
// Precompiled outside the function -- not rebuilt on every call

export default function processUrl(url: string): [Random, string[], string, string | null, string | null] {
  const urlParts = url.split("/");
  const moves: string[] = [];
  for (const part of urlParts) {
    if (VALID_MOVES_SET.has(part.toUpperCase())) moves.push(part.toUpperCase());
  }
  // seed = 6th segment, hashed over 8096 values
  const seedStr = (urlParts[5] || "").toLowerCase();
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed + seedStr.charCodeAt(i)) % 8096;
  }
  return [new Random(seed), moves, seedStr, monster, difficulty];
}
```

The `Set` precompiled outside the function is a small detail, but it avoids rebuilding the structure on every call in an edge context where modules can get re-evaluated.

### The RNG: modified RC4

The random generator is an RC4 implementation (stream cipher algorithm) repurposed as a PRNG.

```typescript
export class Random {
  private S: number[]; // 256-entry table
  private i: number;
  private j: number;

  constructor(seed?: number) {
    this.S = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    let workingSeed = seed || Date.now();
    for (let i = 0; i < 256; i++) {
      j = (j + this.S[i] + (workingSeed & 0xff)) & 0xff;
      // swap S[i] and S[j]
      [this.S[i], this.S[j]] = [this.S[j], this.S[i]];
      workingSeed >>>= 8;
    }
  }

  next(): number { /* ... */ }
  randint(min: number, max: number): number { /* ... */ }
  choice(array: T[]): T { /* ... */ }
}
```

Why RC4? Because it's a deterministic PRNG with decent distribution and reasonable seed-collision resistance. Same seed = same number sequence = same fight every time. That lets you "replay" any fight while keeping its URL, and guarantees two different servers (Vercel + Cloudflare) produce exactly the same result for the same URL.

---

## The Discord 100-char limit problem

Discord imposes a 100-char limit on button `custom_id`s. After a few dozen actions, a fight URL blows way past that limit.

Two mechanisms answer that.

### 1. RLE compression of actions

Actions are encoded with a single char (`a`=attack, `d`=defend, `h`=hug...) and compressed with run-length encoding:

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

Simple, but when the player spams Attack x10 it goes from `aaaaaaaaaa` (10 chars) to `a10` (3 chars). The "Attack x4" and "Attack x10" buttons in the UI exist precisely for that -- speeding up combat while compressing the payload nicely.

### 2. Session tokens when compression isn't enough

If the compressed payload stays too long, it's stored in the DB with a short token:

```typescript
// gameSessionService.ts
const TOKEN_PREFIX = "gs.";
const TOKEN_SIZE = 10; // "gs.aBcDeFgHiJ"

export async function encodeGameplayButtons(buttons: RawButton[]): Promise {
  // Groups payloads by battle_key, batch-inserts into Supabase
  // Replaces the custom_id with "gs.{token}:{userId}"
}

export async function decodeGameplayPayloadWithStatus(encodedPayload: string, userID: string) {
  if (!encodedPayload.startsWith(TOKEN_PREFIX)) {
    return { payload: encodedPayload }; // No lookup if not needed
  }
  // In-memory lookup first, then Supabase if missing
  const cached = tokenToSession.get(token) || await loadTokenRowByToken(token);
  // Checks ownership, TTL (7 days), and turn_version (avoids replaying stale state)
}
```

Sessions have a 7-day TTL and automatic pruning every 10 minutes. The `turnVersion` check prevents replaying stale state if the player advanced in the game -- a discreet protection against accidental "going back".

Both in-memory Maps (`tokenToSession`, `latestTurnByBattle`) use the same `globalThis as unknown as GameSessionGlobals` pattern as the image caches, for the same reasons we'll see below.

---

## The image rendering pipeline

![Fight start against a Slime](/images/konosuba-rpg/shot_01_start.webp)

The `/konosuba-rpg/:lang/*` route doesn't return JSON. It returns a WebP image generated on demand.

The pipeline is organized in 3 composited layers:

```
Background (board + frame)
    +
Characters layer (player sprites + mob, fixed positions)
    +
UI overlay (HP bars, messages, persona icons via Satori → SVG → PNG)
    ↓
Photon.watermark() × 2
    ↓
WebP output
```

**Background**: two fixed images (the board and frame), loaded from the filesystem and composed once.

**Characters layer**: sprites positioned at computed coordinates. Dead players are excluded (`activeSlots = slots.filter(s => playerHp[s.i] > 0)`). Enemy sprites are mirrored horizontally with a custom `flipX` -- a pixel-by-pixel loop rather than an external dependency.

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

**UI overlay**: the heavy part. The UI JSX (health bars, texts, icons) is described React-like with Satori, rendered to SVG, converted to PNG by `@cf-wasm/resvg`, then imported into Photon for final composition. Satori + resvg are two WASM modules compiled specifically for Cloudflare Workers with the `edge-light` flag.

![Defend action](/images/konosuba-rpg/shot_03_defend.webp)

![Ongoing fight](/images/konosuba-rpg/shot_02_combat.webp)

![Hug action](/images/konosuba-rpg/shot_04_hug.webp)

---

## The cache system -- the most crafted part

There are 5 distinct cache levels. Each targets a different pipeline granularity.

```typescript
// renderImage.ts -- all on globalThis
G.__imageCache  ??= {} as Record; // raw assets
G.__base64Cache ??= {} as Record;       // asset base64 (for Satori)
G.__fontCache   ??= {} as Record; // fonts
G.__photonCache    ??= new LRUCache(40, freePhoton);
G.__layerCache     ??= new LRUCache(12, freePhoton);
G.__uiPhotonCache  ??= new LRUCache(30, freePhoton);
G.__renderOutputCache ??= new LRUCache(120);
```

The `??=` on `globalThis` pattern: JS modules in edge workers can be re-evaluated between requests on some configs. Storing caches on `globalThis` with `??=` guarantees they survive those re-evaluations without being recreated.

### WASM eviction

The Photon image caches (`photonCache`, `layerCache`, `uiPhotonCache`) use an eviction callback:

```typescript
function freePhoton(_key: string, img: Photon.PhotonImage): void {
  try { img.free(); } catch { /* already freed */ }
}

new LRUCache(40, freePhoton)
```

`Photon.PhotonImage` is a WASM object with memory allocated on the linear WASM side, outside the JS GC. That memory stays allocated until `.free()` is explicitly called. The LRU eviction triggers `.free()` automatically -- it's RAII ported to JavaScript.

### Cache keys are intentionally lossy

```typescript
function buildCharactersKey(playerImages: string[][], playerHp: number[], creatureImages: string[], creatureHp: number): string {
  const players = playerImages.map((imgs, i) => `${imgs[0]}:${playerHp[i] > 0 ? 1 : 0}`).join("|");
  return `chars::${players}::${creatureImages[0]}:${creatureHp > 0 ? 1 : 0}`;
}
```

The characters layer key doesn't encode the exact HP value -- just `1` (alive) or `0` (dead). Because a player sprite at 40 HP and a player at 15 HP is identical. A cache hit thus survives any damage as long as nobody drops.

The UI key, on the other hand, encodes exact HP (the health bar changes every hit) and a message hash:

```typescript
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0; // signed 32-bit int
  }
  return hash.toString(16);
}
```

`Math.imul` forces 32-bit int multiplication, avoiding float64 conversions and giving a stable polynomial hash. That avoids adding an external dependency for this.

### Base64 conversion without stack overflow

```typescript
function getBase64Cached(key: string, buf: ArrayBuffer): string {
  if (base64Cache[key]) return base64Cache[key];
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000; // 32768 bytes
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  const b64 = btoa(binary);
  base64Cache[key] = b64;
  return b64;
}
```

`String.fromCharCode(...largeArray)` can blow the stack on big images because args go through the call stack. Chunking by 32KB avoids that. The result is cached -- converting the same image to base64 happens only once per worker instance.

---

## STRIPPER.md -- sequential awaits audit

There's a `STRIPPER.md` file in the repo documenting a parallelization audit of `await`s. A few examples of what's recorded:

- Player profile loading made 3 sequential Supabase queries (progression, run summary, achievements). They moved to `Promise.all` -- no dependency between them.
- End-of-fight reward distribution (accessories + consumables) was sequential. Parallelized the same way.
- Button session token creation was group by group. Independent groups are now created in parallel.

```typescript
// progressionService.ts -- before (sequential)
await grantAccessoryDropRewards(...);
await grantConsumableDropRewards(...);

// after
await Promise.all([
  grantAccessoryDropRewards(...),
  grantConsumableDropRewards(...),
]);
```

Nothing revolutionary, but in a serverless context where every millisecond of response time is billed (or contributes to cold start), it counts.

---

## The serverless Discord bot

![Victory](/images/konosuba-rpg/shot_05_win.webp)

An often-misunderstood point: a Discord bot doesn't necessarily need a persistent WebSocket connection. Discord offers an alternative: **Interactions Endpoint URL**. You provide Discord an HTTPS URL, and Discord sends you a POST for every interaction (slash command, button, autocomplete).

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

Discord sends a POST, the handler runs 50-200ms on a Vercel function or Cloudflare Worker, replies, and it's done. No permanent connection to maintain, no server to keep alive. The whole Discord bot is hosted on the Vercel free tier.

Ed25519 verification (`verifyKey` from `discord-interactions`) is mandatory -- Discord sends a signature in the headers you must validate, otherwise it rejects the endpoint.

### The special animation -- the only intentional await

```typescript
// handleSpecialButton.ts
await new Promise(resolve => setTimeout(resolve, 3000)); // 3 seconds
await fetch(`${DISCORD_API_URL}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
  method: "PATCH",
  // ...
});
```

That voluntary 3-second delay is documented in STRIPPER.md as intentional. Megumin's special attack (Explosion) has an animation on the Discord side -- the message is first updated with an intermediate visual, then patched 3 seconds later with the result. It's the only case where a Vercel function deliberately runs longer than necessary.

![Special attack](/images/konosuba-rpg/shot_08_special.webp)

---

## Deployability on two platforms

The same codebase runs on Vercel (Node.js) and on Cloudflare Workers (V8 isolates) unmodified:

```typescript
// worker.ts -- Cloudflare entrypoint
export default {
  fetch(request: Request, env: WorkerBindings): Promise {
    syncBindingsToProcessEnv(env); // inject CF secrets into process.env
    return app.fetch(request, env, ctx);
  }
};

// index.ts -- Vercel/Node entrypoint
const isVercelRuntime = process.env.VERCEL === "1";
if (!isVercelRuntime) { start(); }
```

The main difference: static assets. On Vercel, they're read from the filesystem (`/var/task/assets/`). On Cloudflare Workers, they go through an `ASSETS` binding (CF static assets) with fallback to an HTTPS mirror (`fox3000foxy.com/konosuba-rpg/assets`). `getAssetBytes` in `assetLoader.ts` handles both paths, trying the filesystem first, then fetch.

The WASM builds (`@cf-wasm/photon/edge-light`, `@cf-wasm/resvg`) have separate builds per runtime. The `edge-light` flag in the package name denotes the Cloudflare Workers-compatible build, which doesn't allow `new WebAssembly.Module()` at runtime -- the WASM must be precompiled.

---

## Progression: XP, levels, affinity

![A boss, 650 HP](/images/konosuba-rpg/shot_06_boss.webp)

Meta-progression relies on the Supabase free tier. The schema has a `players` table (global XP, level, gold), `character_progress` (XP/level/affinity per character for Darkness, Aqua, Megumin), `runs` (fight history), `inventory_items`, `daily_quests_progress`, `achievements_unlocked`, `game_sessions`.

The progression model is simple:

```typescript
// characterService.ts
export function computeLevelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1; // 100 XP per level
}

export function getLevelFactor(level: number): number {
  return 1 + 0.2 * (level - 1); // +20% stats per level
}

export function getAffinityFactor(affinity: number): number {
  const stars = Math.floor(affinity / 20); // 20 points per star, 5 stars max
  return 1.2 ** stars; // exponential progression
}
```

Those factors apply to character stats at the start of each `processGame`. Kazuma follows the player's global level, the other three each have their own XP/level. Affinity (earned by collecting drops tied to a character) multiplies its stats independently.

![Heal](/images/konosuba-rpg/shot_07_heal.webp)

The drop system uses difficulty-weighted loot tables:

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
  // ...up to Legendary
};
```

---

## Tests

Three suites: unit, perf, and leaks.

The leak test is particularly direct:

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
  expect(after - before).toBeLessThan(20); // max 20MB heap growth
});
```

1200 iterations of `processGame`, forced GC before and after, heap delta < 20MB. If that test passes, `processGame` doesn't leak. The render test (`renderImage.spec.ts`) instead checks execution time under a practical threshold.

There's also a `bench.ts` script to profile the full pipeline:

```
RENDER_PERF=1 npx tsx bench.ts --runs=20 --warmup=3 --monster=Dragon
```

With `RENDER_PERF=1`, the `withPerf` wrapper in each service logs timings:

```typescript
export async function withPerf(scope: string, label: string, work: () => Promise): Promise {
  const perf = createPerfLogger(scope);
  if (!perf.enabled) return work(); // zero overhead if disabled
  perf.mark(`${label}:start`);
  try { return await work(); }
  finally { perf.done(`${label}:done`); }
}
```

`createPerfLogger` returns no-ops if `DEV_MODE` and `RENDER_PERF` aren't set to `1`. Zero overhead in production.

---

## What it costs to run

- **Vercel free tier**: 100GB bandwidth, 1M serverless invocations per month. Image render counts as one invocation.
- **Cloudflare Workers free tier**: 100K requests/day, 10ms CPU time per request (render can exceed that on Workers, hence Vercel as primary).
- **Supabase free tier**: 500MB DB, 5GB bandwidth. Enough for thousands of players.

The whole backend runs at zero cost up to significant volume. The only friction point is the Cloudflare Workers CPU limit -- image render is CPU-intensive because of WASM, hence the strategy of Vercel as primary and Workers as failover CDN.

---

## The 3 things worth remembering

1. **The URL as game state** isn't just a cute trick -- it's a constraint imposed by Discord (buttons have a 100-char limit) that forced a stateless architecture with RLE compression + session token fallback. The constraint dictated the design.

2. **WASM cache with explicit eviction**: `PhotonImage`s allocate outside the JS heap and will never get GC'd without `.free()`. Hooking `freePhoton` onto LRU eviction is RAII in JavaScript. It's discreet in the code, but without it the worker would leak in production.

3. **A serverless Discord bot without WebSocket**: less known than the WebSocket gateway approach, but for a bot doing stateless processing (each interaction is independent), the Interactions Endpoint is strictly better -- no reconnect, no heartbeat, no process to maintain. Discord handles availability on their infra side.

---

*Repo: [fox3000foxy/konosuba-rpg](https://github.com/fox3000foxy/konosuba-rpg)*

*Custom source-available license -- no redistribution, free to use.*
