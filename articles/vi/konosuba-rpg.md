---
title: "Tôi đã dành cuối tuần đọc mã konosuba-rpg và đây là những gì tôi tìm thấy"
description: "RPG theo lượt trên Discord nơi mỗi hành động sinh ảnh WebP
  tức thì : URL làm trạng thái game, RNG xác định, pipeline WASM, cache 5
  tầng, bot serverless."
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
author_sig: "1H2Xj+sYeRM/dAy6ZLrItQP8dOXnwZriQoLUZKr0rf+WCPZRmQS/beBeuBXywkxN2J/Z8bIt4mmlcpqNx0tGKg=="
---

# Tôi đã dành cuối tuần đọc mã konosuba-rpg và đây là những gì tôi tìm thấy

Tôi duy trì dự án này một thời gian, nhưng đọc lại chính mã của mình với đầu óc tỉnh táo luôn bổ ích. konosuba-rpg là RPG theo lượt trên Discord nơi mỗi hành động sinh ảnh WebP tức thì. Đó là ảnh dựng thật, với sprite, thanh máu, tin nhắn trận -- đủ hết.

Stack : TypeScript, Hono, Vercel, Cloudflare Workers, Supabase. Host hoàn toàn miễn phí. Và bot Discord chạy không cần máy chủ bền vững. Bài này giải thích mọi thứ gắn nhau thế nào.

![Trạng thái game ban đầu](/images/konosuba-rpg/game_init.webp)

---

## Thiết kế nền : URL làm trạng thái game

Điều đầu tiên đập vào mắt : không có trạng thái phía máy chủ cho gameplay. Toàn bộ trạng thái trận nằm trong URL.

```
/konosuba-rpg/fr/abc123/ATK/DEF/ATK/HUG?monster=Vanir&difficulty=hard
```

Mỗi đoạn sau seed là một hành động đã chơi. Máy chủ nhận URL này, chạy lại từ đầu, diễn lại mọi hành động theo thứ tự, và trả về ảnh trận tại đúng thời điểm đó. Không phiên, không trạng thái RAM gắn với người dùng.

Discord chạy bằng nút tương tác -- khi người chơi nhấn "Tấn công", Discord gửi cho máy chủ `custom_id` của nút. custom_id này chứa URL trận đã nén với hành động mới thêm vào. Máy chủ tính lại tất cả từ con số không và trả về ảnh cập nhật.

```typescript
// processUrl.ts
const VALID_MOVES_SET = new Set(["ATK", "DEF", "HUG", "HEA", "SPE", "USE"]);
// Tiền biên dịch ngoài hàm -- không tạo lại mỗi lần gọi

export default function processUrl(url: string): [Random, string[], string, string | null, string | null] {
  const urlParts = url.split("/");
  const moves: string[] = [];
  for (const part of urlParts) {
    if (VALID_MOVES_SET.has(part.toUpperCase())) moves.push(part.toUpperCase());
  }
  // seed = đoạn thứ 6, băm trên 8096 giá trị
  const seedStr = (urlParts[5] || "").toLowerCase();
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed + seedStr.charCodeAt(i)) % 8096;
  }
  return [new Random(seed), moves, seedStr, monster, difficulty];
}
```

`Set` tiền biên dịch ngoài hàm là chi tiết nhỏ, nhưng tránh dựng lại cấu trúc mỗi lần gọi trong ngữ cảnh edge nơi module có thể bị đánh giá lại.

### RNG : RC4 biến tấu

Bộ sinh ngẫu nhiên là triển khai RC4 (thuật toán mã hóa dòng) bị dùng làm PRNG.

```typescript
export class Random {
  private S: number[]; // bảng 256 mục
  private i: number;
  private j: number;

  constructor(seed?: number) {
    this.S = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    let workingSeed = seed || Date.now();
    for (let i = 0; i < 256; i++) {
      j = (j + this.S[i] + (workingSeed & 0xff)) & 0xff;
      // hoán đổi S[i] và S[j]
      [this.S[i], this.S[j]] = [this.S[j], this.S[i]];
      workingSeed >>>= 8;
    }
  }

  next(): number { /* ... */ }
  randint(min: number, max: number): number { /* ... */ }
  choice(array: T[]): T { /* ... */ }
}
```

Vì sao RC4? Vì đó là PRNG xác định với phân bố ổn và kháng va chạm seed hợp lý. Cùng seed = cùng chuỗi số = cùng trận mỗi lần. Việc này cho phép "diễn lại" bất kỳ trận nào chỉ bằng URL, và đảm bảo hai máy chủ khác nhau (Vercel + Cloudflare) cho đúng cùng kết quả với cùng URL.

---

## Bài toán giới hạn 100 ký tự của Discord

Discord áp giới hạn 100 ký tự lên `custom_id` của nút. Sau vài chục hành động, URL trận vượt giới hạn này ngon lành.

Hai cơ chế trả lời việc đó.

### 1. Nén RLE các hành động

Các hành động được mã hóa bằng một ký tự (`a`=attack, `d`=defend, `h`=hug...) và nén bằng mã hóa run-length :

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

Đơn giản, nhưng khi người chơi spam Tấn công x10 nó đi từ `aaaaaaaaaa` (10 ký tự) còn `a10` (3 ký tự). Các nút "Tấn công x4" và "Tấn công x10" trong UI tồn tại đúng vì vậy -- tăng tốc trận đồng thời nén tốt payload.

### 2. Token phiên khi nén không đủ

Nếu payload đã nén vẫn quá dài, nó được lưu trong DB với token ngắn :

```typescript
// gameSessionService.ts
const TOKEN_PREFIX = "gs.";
const TOKEN_SIZE = 10; // "gs.aBcDeFgHiJ"

export async function encodeGameplayButtons(buttons: RawButton[]): Promise {
  // Nhóm payload theo battle_key, chèn batch vào Supabase
  // Thay custom_id bằng "gs.{token}:{userId}"
}

export async function decodeGameplayPayloadWithStatus(encodedPayload: string, userID: string) {
  if (!encodedPayload.startsWith(TOKEN_PREFIX)) {
    return { payload: encodedPayload }; // Không lookup nếu không cần
  }
  // Lookup trong bộ nhớ trước, rồi Supabase nếu thiếu
  const cached = tokenToSession.get(token) || await loadTokenRowByToken(token);
  // Kiểm tra sở hữu, TTL (7 ngày), và turn_version (tránh diễn lại trạng thái cũ)
}
```

Phiên có TTL 7 ngày và dọn tự động mỗi 10 phút. Kiểm tra `turnVersion` ngăn diễn lại trạng thái hết hạn nếu người chơi đã tiến trong ván -- bảo vệ kín đáo chống "quay lại" vô tình.

Hai Map trong bộ nhớ (`tokenToSession`, `latestTurnByBattle`) dùng cùng mẫu `globalThis as unknown as GameSessionGlobals` như cache ảnh, vì cùng lý do ta sẽ thấy bên dưới.

---

## Pipeline render ảnh

![Bắt đầu trận với Slime](/images/konosuba-rpg/shot_01_start.webp)

Route `/konosuba-rpg/:lang/*` không trả JSON. Nó trả ảnh WebP sinh theo yêu cầu.

Pipeline tổ chức thành 3 lớp chồng :

```
Nền (bảng + khung)
    +
Lớp nhân vật (sprite người chơi + quái, vị trí cố định)
    +
Phủ UI (thanh HP, tin nhắn, biểu tượng nhân vật qua Satori → SVG → PNG)
    ↓
Photon.watermark() × 2
    ↓
Đầu ra WebP
```

**Nền** : hai ảnh cố định (bảng và khung), tải từ filesystem và chồng một lần.

**Lớp nhân vật** : sprite đặt theo tọa độ tính toán. Người chơi chết bị loại (`activeSlots = slots.filter(s => playerHp[s.i] > 0)`). Sprite quái bị lật ngang bằng `flipX` custom -- vòng lặp từng pixel thay vì phụ thuộc ngoài.

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

**Phủ UI** : đây là phần nặng. JSX của giao diện (thanh máu, văn bản, biểu tượng) được mô tả kiểu React bằng Satori, render thành SVG, đổi sang PNG bằng `@cf-wasm/resvg`, rồi nhập vào Photon để chồng cuối. Satori + resvg là hai module WASM biên dịch riêng cho Cloudflare Workers với cờ `edge-light`.

![Hành động Phòng thủ](/images/konosuba-rpg/shot_03_defend.webp)

![Trận đang diễn ra](/images/konosuba-rpg/shot_02_combat.webp)

![Hành động Ôm](/images/konosuba-rpg/shot_04_hug.webp)

---

## Hệ thống cache -- phần trau chuốt nhất

Có 5 tầng cache riêng. Mỗi tầng nhắm độ hạt khác nhau của pipeline.

```typescript
// renderImage.ts -- mọi thứ trên globalThis
G.__imageCache  ??= {} as Record; // asset thô
G.__base64Cache ??= {} as Record;       // base64 của asset (cho Satori)
G.__fontCache   ??= {} as Record; // phông
G.__photonCache    ??= new LRUCache(40, freePhoton);
G.__layerCache     ??= new LRUCache(12, freePhoton);
G.__uiPhotonCache  ??= new LRUCache(30, freePhoton);
G.__renderOutputCache ??= new LRUCache(120);
```

Mẫu `??=` trên `globalThis` : module JavaScript trong worker edge có thể bị đánh giá lại giữa các yêu cầu trên vài cấu hình. Lưu cache trên `globalThis` với `??=` đảm bảo chúng sống sót qua các lần đánh giá lại mà không bị tạo lại.

### Thu hồi WASM

Cache ảnh Photon (`photonCache`, `layerCache`, `uiPhotonCache`) dùng callback thu hồi :

```typescript
function freePhoton(_key: string, img: Photon.PhotonImage): void {
  try { img.free(); } catch { /* đã giải phóng */ }
}

new LRUCache(40, freePhoton)
```

`Photon.PhotonImage` là object WASM với bộ nhớ cấp phát phía tuyến tính WASM, ngoài GC JavaScript. Bộ nhớ này còn cấp phát chừng nào `.free()` chưa được gọi rõ. Thu hồi LRU kích hoạt `.free()` tự động -- đó là RAII mang sang JavaScript.

### Khóa cache cố ý lossy

```typescript
function buildCharactersKey(playerImages: string[][], playerHp: number[], creatureImages: string[], creatureHp: number): string {
  const players = playerImages.map((imgs, i) => `${imgs[0]}:${playerHp[i] > 0 ? 1 : 0}`).join("|");
  return `chars::${players}::${creatureImages[0]}:${creatureHp > 0 ? 1 : 0}`;
}
```

Khóa lớp nhân vật không mã hóa giá trị HP chính xác -- chỉ `1` (sống) hay `0` (chết). Vì sprite của người chơi 40 HP và người chơi 15 HP giống hệt. Lần trúng cache vì vậy sống sót qua bất kỳ sát thương nào chừng nào không ai gục.

Khóa UI ngược lại mã hóa HP chính xác (thanh máu đổi mỗi đòn) và băm tin nhắn :

```typescript
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0; // số nguyên 32-bit có dấu
  }
  return hash.toString(16);
}
```

`Math.imul` ép phép nhân thành số nguyên 32 bit, tránh chuyển đổi float64 và cho băm đa thức ổn định. Việc này tránh thêm phụ thuộc ngoài cho chuyện đó.

### Đổi base64 không tràn ngăn xếp

```typescript
function getBase64Cached(key: string, buf: ArrayBuffer): string {
  if (base64Cache[key]) return base64Cache[key];
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000; // 32768 octet
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  const b64 = btoa(binary);
  base64Cache[key] = b64;
  return b64;
}
```

`String.fromCharCode(...largeArray)` có thể gây tràn ngăn xếp trên ảnh lớn vì đối số truyền trên call stack. Chia đoạn 32Ko tránh việc đó. Kết quả được cache -- đổi base64 của cùng ảnh chỉ làm một lần cho mỗi instance worker.

---

## STRIPPER.md -- kiểm toán await nối tiếp

Có tệp `STRIPPER.md` trong repo ghi lại kiểm toán song song hóa các `await`. Vài ví dụ được ghi :

- Tải hồ sơ người chơi làm 3 yêu cầu Supabase nối tiếp (tiến trình, tóm tắt run, thành tựu). Chúng được chuyển sang `Promise.all` -- không phụ thuộc nhau.
- Phân phối thưởng cuối trận (phụ kiện + vật phẩm) nối tiếp. Song song hóa tương tự.
- Tạo token phiên cho nút làm từng nhóm. Các nhóm độc lập giờ tạo song song.

```typescript
// progressionService.ts -- trước (nối tiếp)
await grantAccessoryDropRewards(...);
await grantConsumableDropRewards(...);

// sau
await Promise.all([
  grantAccessoryDropRewards(...),
  grantConsumableDropRewards(...),
]);
```

Không có gì cách mạng, nhưng trong ngữ cảnh serverless nơi mỗi mili giây thời gian phản hồi bị tính tiền (hay góp vào cold start), việc đó đáng kể.

---

## Bot Discord không máy chủ bền vững

![Chiến thắng](/images/konosuba-rpg/shot_05_win.webp)

Điểm thường bị hiểu sai : bot Discord không nhất thiết cần kết nối WebSocket bền vững. Discord cung cấp lựa chọn : **Interactions Endpoint URL**. Bạn đưa URL HTTPS cho Discord, và Discord gửi bạn POST cho mỗi tương tác (slash command, nút, autocomplete).

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

Discord gửi POST, handler chạy 50-200ms trên hàm Vercel hay Cloudflare Worker, trả lời, và xong. Không kết nối thường trực cần duy trì, không máy chủ cần giữ bật. Toàn bộ bot Discord host trên free tier Vercel.

Xác minh Ed25519 (`verifyKey` từ `discord-interactions`) bắt buộc -- Discord gửi chữ ký trong header mà bạn phải kiểm tra, nếu không nó từ chối endpoint.

### Animation đặc biệt -- await cố ý duy nhất

```typescript
// handleSpecialButton.ts
await new Promise(resolve => setTimeout(resolve, 3000)); // 3 giây
await fetch(`${DISCORD_API_URL}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
  method: "PATCH",
  // ...
});
```

Trễ tự nguyện 3 giây này được ghi trong STRIPPER.md là cố ý. Đòn đặc biệt của Megumin (Explosion) có animation phía Discord -- tin nhắn đầu được cập nhật bằng hình ảnh trung gian, rồi sửa 3 giây sau bằng kết quả. Đó là trường hợp duy nhất hàm Vercel cố chạy lâu hơn cần thiết.

![Đòn đặc biệt](/images/konosuba-rpg/shot_08_special.webp)

---

## Triển khai được trên hai nền tảng

Cùng codebase chạy trên Vercel (Node.js) và Cloudflare Workers (V8 isolates) không sửa đổi :

```typescript
// worker.ts -- điểm vào Cloudflare
export default {
  fetch(request: Request, env: WorkerBindings): Promise {
    syncBindingsToProcessEnv(env); // bơm secret CF vào process.env
    return app.fetch(request, env, ctx);
  }
};

// index.ts -- điểm vào Vercel/Node
const isVercelRuntime = process.env.VERCEL === "1";
if (!isVercelRuntime) { start(); }
```

Khác biệt chính : asset tĩnh. Trên Vercel, chúng đọc từ filesystem (`/var/task/assets/`). Trên Cloudflare Workers, chúng đi qua binding `ASSETS` (asset tĩnh CF) với dự phòng về mirror HTTPS (`fox3000foxy.com/konosuba-rpg/assets`). `getAssetBytes` trong `assetLoader.ts` xử lý cả hai đường bằng cách thử filesystem trước, rồi fetch.

Các WASM (`@cf-wasm/photon/edge-light`, `@cf-wasm/resvg`) có build riêng cho mỗi runtime. Cờ `edge-light` trong tên gói chỉ build tương thích Cloudflare Workers, không cho phép `new WebAssembly.Module()` lúc runtime -- WASM phải tiền biên dịch.

---

## Tiến trình : XP, cấp, thiện cảm

![Một boss, 650 HP](/images/konosuba-rpg/shot_06_boss.webp)

Meta-tiến trình dựa trên free tier Supabase. Schema gồm bảng `players` (XP toàn cục, cấp, gold), `character_progress` (XP/cấp/thiện cảm cho mỗi nhân vật Darkness, Aqua, Megumin), `runs` (lịch sử trận), `inventory_items`, `daily_quests_progress`, `achievements_unlocked`, `game_sessions`.

Mô hình tiến trình đơn giản :

```typescript
// characterService.ts
export function computeLevelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1; // 100 XP cho mỗi cấp
}

export function getLevelFactor(level: number): number {
  return 1 + 0.2 * (level - 1); // +20% stat cho mỗi cấp
}

export function getAffinityFactor(affinity: number): number {
  const stars = Math.floor(affinity / 20); // 20 điểm cho mỗi sao, tối đa 5 sao
  return 1.2 ** stars; // tiến trình lũy thừa
}
```

Các hệ số này áp vào stat nhân vật lúc đầu mỗi `processGame`. Kazuma theo cấp toàn cục của người chơi, ba người còn lại mỗi người có XP/cấp riêng. Thiện cảm (kiếm bằng cách lấy drop gắn với nhân vật) nhân stat của họ độc lập.

![Hồi máu](/images/konosuba-rpg/shot_07_heal.webp)

Hệ thống drop dùng bảng loot có trọng số theo độ khó :

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
  // ...tới Legendary
};
```

---

## Test

Ba suite : đơn vị, hiệu năng, và rò rỉ.

Leak test đặc biệt thẳng :

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
  expect(after - before).toBeLessThan(20); // tối đa 20MB tăng heap
});
```

1200 vòng `processGame`, GC ép trước và sau, chênh heap < 20MB. Nếu test này qua, `processGame` không rò. Test render (`renderImage.spec.ts`) kiểm tra thời gian chạy dưới ngưỡng thực tế.

Ngoài ra có script `bench.ts` để profile pipeline đầy đủ :

```
RENDER_PERF=1 npx tsx bench.ts --runs=20 --warmup=3 --monster=Dragon
```

Với `RENDER_PERF=1`, wrapper `withPerf` trong mỗi service log thời gian :

```typescript
export async function withPerf(scope: string, label: string, work: () => Promise): Promise {
  const perf = createPerfLogger(scope);
  if (!perf.enabled) return work(); // không chi phí khi tắt
  perf.mark(`${label}:start`);
  try { return await work(); }
  finally { perf.done(`${label}:done`); }
}
```

`createPerfLogger` trả về no-op nếu `DEV_MODE` và `RENDER_PERF` không ở `1`. Không chi phí trong production.

---

## Chạy tốn bao nhiêu

- **Free tier Vercel** : 100GB băng thông, 1M lần gọi serverless mỗi tháng. Render ảnh tính là một lần gọi.
- **Free tier Cloudflare Workers** : 100K yêu cầu/ngày, 10ms thời gian CPU cho mỗi yêu cầu (render có thể vượt trên Workers, vì vậy Vercel làm chính).
- **Free tier Supabase** : 500MB DB, 5GB băng thông. Đủ cho hàng nghìn người chơi.

Toàn bộ backend chạy chi phí 0 tới khối lượng đáng kể. Điểm ma sát duy nhất là giới hạn CPU của Cloudflare Workers -- render ảnh nặng CPU vì WASM, vì vậy chiến lược Vercel làm chính và Workers làm CDN dự phòng.

---

## 3 điều đáng giữ lại

1. **URL làm trạng thái game** không chỉ là mẹo hay -- đó là ràng buộc Discord áp (nút giới hạn 100 ký tự) ép ra kiến trúc stateless với nén RLE + token phiên dự phòng. Ràng buộc định ra thiết kế.

2. **Cache WASM với thu hồi rõ** : `PhotonImage` cấp phát ngoài heap JavaScript và sẽ không bao giờ GC nếu thiếu `.free()`. Móc `freePhoton` vào thu hồi LRU đúng là RAII trong JavaScript. Nó kín đáo trong mã, nhưng thiếu nó worker sẽ rò rỉ trong production.

3. **Bot Discord serverless không WebSocket** : ít biết hơn cách gateway WebSocket, nhưng với bot xử lý stateless (mỗi tương tác độc lập), Interactions Endpoint vượt hẳn -- không reconnect, không heartbeat, không tiến trình cần duy trì. Discord lo sẵn sàng phía hạ tầng của họ.

---

*Repo : [fox3000foxy/konosuba-rpg](https://github.com/fox3000foxy/konosuba-rpg)*

*Giấy phép custom source-available -- không phân phối lại, dùng tự do.*
