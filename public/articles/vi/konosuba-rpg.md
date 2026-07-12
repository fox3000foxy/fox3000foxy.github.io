---
title: "Tôi đã dành một cuối tuần để đọc mã nguồn konosuba-rpg và đây là những gì tôi tìm thấy"
description: "Một RPG theo lượt trên Discord nơi mỗi hành động tạo ra một hình ảnh WebP ngay lập tức: URL như trạng thái trò chơi, RNG xác định, pipeline WASM, bộ nhớ đệm 5 tầng, bot serverless."
date: 2026-06-10
tags:
  - discord
  - rpg
  - typescript
  - hono
  - cloudflare-workers
  - supabase
  - wasm
  - gaming
  - serverless
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "x5VyFUJbyeZg2PoePEEKLY5NDlp7d14LzzQgJGOjeSVMCPwH+9+S/9GbGolgE93+AqOSkLRHBJ6nJeEEKfHfXQ=="
---

# Tôi đã dành một cuối tuần để đọc mã nguồn konosuba-rpg và đây là những gì tôi tìm thấy

Tôi duy trì dự án này một thời gian rồi, nhưng đọc lại code của chính mình một cách bình tĩnh luôn mang lại bài học bổ ích. konosuba-rpg là một RPG theo lượt trên Discord nơi mỗi hành động tạo ra một hình ảnh WebP ngay lập tức. Không phải embed văn bản. Một hình ảnh thực sự được ghép, với sprite, thanh máu, tin nhắn chiến đấu -- tất cả.

Stack: TypeScript, Hono, Vercel, Cloudflare Workers, Supabase. Hosting hoàn toàn miễn phí. Và bot Discord hoạt động mà không cần máy chủ liên tục. Bài viết này giải thích cách tất cả vận hành cùng nhau.

![Trạng thái ban đầu của trò chơi](/images/konosuba-rpg/game_init.webp)

---

## Thiết kế cơ bản: URL như trạng thái trò chơi

Điều đầu tiên đập vào mắt: không có trạng thái phía máy chủ cho gameplay. Trạng thái hoàn chỉnh của một trận chiến nằm gọn trong URL.

```
/konosuba-rpg/vi/abc123/ATK/DEF/ATK/HUG?monster=Vanir&difficulty=hard
```

Mỗi phân đoạn sau seed là một hành động đã thực hiện. Máy chủ nhận URL này, bắt đầu lại từ đầu, phát lại tất cả các hành động theo thứ tự, và trả về một hình ảnh trận chiến tại thời điểm đó. Không session, không trạng thái trong RAM gắn với người dùng.

Discord hoạt động qua các nút tương tác -- khi người chơi nhấn "Tấn công", Discord gửi cho máy chủ `custom_id` của nút. custom_id này chứa URL nén của trận chiến với hành động mới được thêm vào. Máy chủ tính toán lại mọi thứ từ đầu và trả về hình ảnh đã cập nhật.

```typescript
// processUrl.ts
const VALID_MOVES_SET = new Set(["ATK", "DEF", "HUG", "HEA", "SPE", "USE"]);
// Được biên dịch sẵn bên ngoài hàm -- không tạo lại mỗi lần gọi

export default function processUrl(url: string): [Random, string[], string, string | null, string | null] {
  const urlParts = url.split("/");
  const moves: string[] = [];
  for (const part of urlParts) {
    if (VALID_MOVES_SET.has(part.toUpperCase())) moves.push(part.toUpperCase());
  }
  // seed = phân đoạn thứ 6, băm trên 8096 giá trị
  const seedStr = (urlParts[5] || "").toLowerCase();
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed + seedStr.charCodeAt(i)) % 8096;
  }
  return [new Random(seed), moves, seedStr, monster, difficulty];
}
```

`Set` được biên dịch sẵn bên ngoài hàm là một chi tiết nhỏ, nhưng nó tránh việc xây dựng lại cấu trúc mỗi lần gọi trong bối cảnh edge nơi các module có thể được đánh giá lại.

### RNG: RC4 biến thể

Bộ sinh ngẫu nhiên là một triển khai RC4 (thuật toán mã hóa dòng) được biến thành PRNG.

```typescript
export class Random {
  private S: number[]; // bảng 256 phần tử
  private i: number;
  private j: number;

  constructor(seed?: number) {
    this.S = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    let workingSeed = seed || Date.now();
    for (let i = 0; i < 256; i++) {
      j = (j + this.S[i] + (workingSeed & 0xff)) & 0xff;
      // swap S[i] và S[j]
      [this.S[i], this.S[j]] = [this.S[j], this.S[i]];
      workingSeed >>>= 8;
    }
  }

  next(): number { /* ... */ }
  randint(min: number, max: number): number { /* ... */ }
  choice(array: T[]): T { /* ... */ }
}
```

Tại sao RC4? Bởi vì nó là một PRNG xác định với phân phối tốt và khả năng chống va chạm seed hợp lý. Cùng seed = cùng dãy số = cùng trận chiến mỗi lần. Điều này cho phép "phát lại" bất kỳ trận chiến nào bằng cách giữ URL của nó, và đảm bảo rằng hai máy chủ khác nhau (Vercel + Cloudflare) tạo ra kết quả hoàn toàn giống hệt nhau cho cùng một URL.

---

## Vấn đề giới hạn 100 ký tự của Discord

Discord áp đặt giới hạn 100 ký tự trên `custom_id` của các nút. Sau vài chục hành động, URL trận chiến vượt quá giới hạn này một cách dễ dàng.

Hai cơ chế giải quyết vấn đề này.

### 1. Nén RLE các hành động

Các hành động được mã hóa bằng một ký tự đơn (`a`=attack, `d`=defend, `h`=hug...) và được nén bằng run-length encoding:

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

Đơn giản, nhưng khi người chơi spam Tấn công x10 thì từ `aaaaaaaaaa` (10 ký tự) thành `a10` (3 ký tự). Các nút "Tấn công x4" và "Tấn công x10" trong UI tồn tại chính vì điều này -- tăng tốc trận chiến đồng thời nén payload tốt hơn.

### 2. Session tokens khi nén không đủ

Nếu payload nén vẫn quá dài, nó được lưu vào cơ sở dữ liệu với một token ngắn:

```typescript
// gameSessionService.ts
const TOKEN_PREFIX = "gs.";
const TOKEN_SIZE = 10; // "gs.aBcDeFgHiJ"

export async function encodeGameplayButtons(buttons: RawButton[]): Promise {
  // Nhóm các payload theo battle_key, chèn batch vào Supabase
  // Thay thế custom_id bằng "gs.{token}:{userId}"
}

export async function decodeGameplayPayloadWithStatus(encodedPayload: string, userID: string) {
  if (!encodedPayload.startsWith(TOKEN_PREFIX)) {
    return { payload: encodedPayload }; // Không tra cứu nếu không cần
  }
  // Tra cứu trong bộ nhớ trước, sau đó Supabase nếu không có
  const cached = tokenToSession.get(token) || await loadTokenRowByToken(token);
  // Kiểm tra quyền sở hữu, TTL (7 ngày), và turn_version (tránh phát lại trạng thái cũ)
}
```

Các session có TTL 7 ngày và tự động dọn dẹp mỗi 10 phút. Kiểm tra `turnVersion` ngăn việc phát lại trạng thái đã lỗi thời nếu người chơi đã tiến triển -- một lớp bảo vệ tinh tế chống "quay lại" vô tình.

Hai Map trong bộ nhớ (`tokenToSession`, `latestTurnByBattle`) sử dụng cùng pattern `globalThis as unknown as GameSessionGlobals` như bộ nhớ đệm hình ảnh, vì những lý do tương tự sẽ được đề cập bên dưới.

---

## Pipeline render hình ảnh

![Bắt đầu trận chiến với Slime](/images/konosuba-rpg/shot_01_start.webp)

Route `/konosuba-rpg/:lang/*` không trả về JSON. Nó trả về một hình ảnh WebP được tạo ra theo yêu cầu.

Pipeline được tổ chức thành 3 lớp ghép:

```
Background (board + frame)
    +
Characters layer (sprite người chơi + quái, vị trí cố định)
    +
UI overlay (thanh HP, tin nhắn, biểu tượng nhân vật qua Satori → SVG → PNG)
    ↓
Photon.watermark() × 2
    ↓
WebP output
```

**Background**: hai hình ảnh tĩnh (bảng và khung), được tải từ filesystem và ghép một lần.

**Characters layer**: các sprite được đặt theo tọa độ đã tính toán. Người chơi đã chết bị loại trừ (`activeSlots = slots.filter(s => playerHp[s.i] > 0)`). Sprite kẻ thù được lật ngang bằng `flipX` tùy chỉnh -- một vòng lặp từng pixel thay vì phụ thuộc bên ngoài.

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

**UI overlay**: đây là phần nặng nhất. JSX của giao diện (thanh máu, văn bản, biểu tượng) được mô tả kiểu React với Satori, render thành SVG, chuyển đổi sang PNG bằng `@cf-wasm/resvg`, sau đó import vào Photon để ghép cuối cùng. Satori + resvg là hai module WASM được biên dịch riêng cho Cloudflare Workers với flag `edge-light`.

![Hành động Phòng thủ](/images/konosuba-rpg/shot_03_defend.webp)

![Chiến đấu đang diễn ra](/images/konosuba-rpg/shot_02_combat.webp)

![Hành động Ôm](/images/konosuba-rpg/shot_04_hug.webp)

---

## Hệ thống bộ nhớ đệm -- phần được đầu tư nhiều nhất

Có 5 tầng bộ nhớ đệm riêng biệt. Mỗi tầng nhắm vào một mức độ chi tiết khác nhau của pipeline.

```typescript
// renderImage.ts -- tất cả trên globalThis
G.__imageCache  ??= {} as Record; // tài nguyên thô
G.__base64Cache ??= {} as Record;       // base64 của tài nguyên (cho Satori)
G.__fontCache   ??= {} as Record; // phông chữ
G.__photonCache    ??= new LRUCache(40, freePhoton);
G.__layerCache     ??= new LRUCache(12, freePhoton);
G.__uiPhotonCache  ??= new LRUCache(30, freePhoton);
G.__renderOutputCache ??= new LRUCache(120);
```

Pattern `??=` trên `globalThis`: các module JavaScript trong worker edge có thể được đánh giá lại giữa các yêu cầu trên một số cấu hình. Lưu bộ nhớ đệm trên `globalThis` với `??=` đảm bảo chúng tồn tại qua các lần đánh giá lại mà không bị tạo mới.

### Eviction WASM

Bộ nhớ đệm hình ảnh Photon (`photonCache`, `layerCache`, `uiPhotonCache`) sử dụng callback eviction:

```typescript
function freePhoton(_key: string, img: Photon.PhotonImage): void {
  try { img.free(); } catch { /* đã giải phóng */ }
}

new LRUCache(40, freePhoton)
```

`Photon.PhotonImage` là một đối tượng WASM với bộ nhớ được cấp phát ở phía tuyến tính WASM, nằm ngoài GC JavaScript. Nếu không gọi `.free()` một cách tường minh, bộ nhớ này không bao giờ được giải phóng. Eviction LRU kích hoạt `.free()` tự động -- đó là RAII trong JavaScript.

### Khóa cache được cố tình làm mất mát

```typescript
function buildCharactersKey(playerImages: string[][], playerHp: number[], creatureImages: string[], creatureHp: number): string {
  const players = playerImages.map((imgs, i) => `${imgs[0]}:${playerHp[i] > 0 ? 1 : 0}`).join("|");
  return `chars::${players}::${creatureImages[0]}:${creatureHp > 0 ? 1 : 0}`;
}
```

Khóa của characters layer không mã hóa giá trị HP chính xác -- chỉ `1` (còn sống) hoặc `0` (đã chết). Bởi vì sprite của người chơi 40 HP và người chơi 15 HP là giống hệt nhau. Một cache hit do đó tồn tại qua bất kỳ sát thương nào miễn là không ai ngã xuống.

Ngược lại, khóa UI mã hóa HP chính xác (thanh máu thay đổi mỗi đòn) và hash của tin nhắn:

```typescript
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0; // số nguyên 32-bit có dấu
  }
  return hash.toString(16);
}
```

`Math.imul` ép phép nhân thành số nguyên 32 bit, tránh chuyển đổi float64 và tạo ra hash đa thức ổn định. Không cần phụ thuộc bên ngoài cho việc này.

### Chuyển đổi base64 không bị stack overflow

```typescript
function getBase64Cached(key: string, buf: ArrayBuffer): string {
  if (base64Cache[key]) return base64Cache[key];
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000; // 32768 byte
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  const b64 = btoa(binary);
  base64Cache[key] = b64;
  return b64;
}
```

`String.fromCharCode(...largeArray)` có thể gây stack overflow trên các hình ảnh lớn vì các tham số được truyền qua call stack. Chunking 32KB tránh được điều này. Kết quả được lưu vào bộ nhớ đệm -- việc chuyển đổi base64 của cùng một hình ảnh chỉ được thực hiện một lần cho mỗi instance worker.

---

## STRIPPER.md -- kiểm toán các await tuần tự

Có một file `STRIPPER.md` trong repo ghi lại quá trình kiểm toán song song hóa các `await`. Một vài ví dụ được ghi lại:

- Tải hồ sơ người chơi từng thực hiện 3 truy vấn Supabase nối tiếp (tiến trình, tóm tắt run, thành tích). Chúng đã được chuyển thành `Promise.all` -- không có phụ thuộc lẫn nhau.
- Phân phối phần thưởng cuối trận (phụ kiện + vật phẩm tiêu hao) từng là tuần tự. Đã được song song hóa tương tự.
- Tạo token session cho các nút từng được thực hiện theo nhóm. Các nhóm độc lập giờ được tạo song song.

```typescript
// progressionService.ts -- trước đây (tuần tự)
await grantAccessoryDropRewards(...);
await grantConsumableDropRewards(...);

// sau đó
await Promise.all([
  grantAccessoryDropRewards(...),
  grantConsumableDropRewards(...),
]);
```

Không có gì cách mạng, nhưng trong bối cảnh serverless nơi mỗi mili giây thời gian phản hồi đều bị tính phí (hoặc góp phần vào cold start), điều này có ý nghĩa.

---

## Bot Discord không cần máy chủ liên tục

![Chiến thắng](/images/konosuba-rpg/shot_05_win.webp)

Một điểm thường bị hiểu nhầm: bot Discord không nhất thiết cần kết nối WebSocket liên tục. Discord cung cấp một giải pháp thay thế: **Interactions Endpoint URL**. Bạn cung cấp một URL HTTPS cho Discord, và Discord gửi POST cho mỗi tương tác (slash command, nút, autocomplete).

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

Discord gửi POST, handler chạy 50-200ms trên một function Vercel hoặc Cloudflare Worker, trả lời, và kết thúc. Không cần kết nối thường trực, không cần máy chủ giữ hoạt động. Toàn bộ bot Discord được host trên free tier Vercel.

Xác thực Ed25519 (`verifyKey` từ `discord-interactions`) là bắt buộc -- Discord gửi chữ ký trong headers mà bạn phải xác thực, nếu không endpoint sẽ bị từ chối.

### Animation đặc biệt -- await có chủ đích duy nhất

```typescript
// handleSpecialButton.ts
await new Promise(resolve => setTimeout(resolve, 3000)); // 3 giây
await fetch(`${DISCORD_API_URL}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
  method: "PATCH",
  // ...
});
```

Sự chậm trễ có chủ đích 3 giây này được ghi lại trong STRIPPER.md là có chủ ý. Đòn tấn công đặc biệt của Megumin (Explosion) có animation phía Discord -- tin nhắn đầu tiên được cập nhật với hình ảnh trung gian, sau đó được sửa đổi 3 giây sau với kết quả. Đây là trường hợp duy nhất một function Vercel cố tình chạy lâu hơn mức cần thiết.

![Đòn tấn công đặc biệt](/images/konosuba-rpg/shot_08_special.webp)

---

## Khả năng triển khai trên hai nền tảng

Cùng một codebase chạy trên Vercel (Node.js) và Cloudflare Workers (V8 isolates) mà không cần sửa đổi:

```typescript
// worker.ts -- entrypoint Cloudflare
export default {
  fetch(request: Request, env: WorkerBindings): Promise {
    syncBindingsToProcessEnv(env); // tiêm secrets CF vào process.env
    return app.fetch(request, env, ctx);
  }
};

// index.ts -- entrypoint Vercel/Node
const isVercelRuntime = process.env.VERCEL === "1";
if (!isVercelRuntime) { start(); }
```

Sự khác biệt chính: tài nguyên tĩnh. Trên Vercel, chúng được đọc từ filesystem (`/var/task/assets/`). Trên Cloudflare Workers, chúng đi qua binding `ASSETS` (tài nguyên tĩnh CF) với fallback tới mirror HTTPS (`fox3000foxy.com/konosuba-rpg/assets`). `getAssetBytes` trong `assetLoader.ts` xử lý cả hai đường dẫn bằng cách thử filesystem trước, sau đó fetch.

Các WASM (`@cf-wasm/photon/edge-light`, `@cf-wasm/resvg`) có bản dựng riêng cho từng runtime. Flag `edge-light` trong tên package chỉ định bản dựng tương thích Cloudflare Workers, không cho phép `new WebAssembly.Module()` tại runtime -- WASM phải được biên dịch trước.

---

## Hệ thống tiến triển: XP, cấp độ, thân thiết

![Một boss, 650 HP](/images/konosuba-rpg/shot_06_boss.webp)

Meta-progression dựa trên Supabase free tier. Schema bao gồm bảng `players` (XP toàn cục, cấp độ, vàng), `character_progress` (XP/cấp độ/thân thiết cho từng nhân vật Darkness, Aqua, Megumin), `runs` (lịch sử chiến đấu), `inventory_items`, `daily_quests_progress`, `achievements_unlocked`, `game_sessions`.

Mô hình tiến triển đơn giản:

```typescript
// characterService.ts
export function computeLevelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1; // 100 XP mỗi cấp
}

export function getLevelFactor(level: number): number {
  return 1 + 0.2 * (level - 1); // +20% chỉ số mỗi cấp
}

export function getAffinityFactor(affinity: number): number {
  const stars = Math.floor(affinity / 20); // 20 điểm mỗi sao, tối đa 5 sao
  return 1.2 ** stars; // tiến triển theo cấp số nhân
}
```

Các hệ số này được áp dụng vào chỉ số của nhân vật khi bắt đầu mỗi `processGame`. Kazuma theo cấp độ toàn cục của người chơi, ba nhân vật còn lại có XP/cấp độ riêng. Thân thiết (kiếm được bằng cách nhặt drop liên quan đến nhân vật) nhân chỉ số của nó một cách độc lập.

![Hồi máu](/images/konosuba-rpg/shot_07_heal.webp)

Hệ thống drop sử dụng bảng loot có trọng số theo độ khó:

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
  // ...cho tới Legendary
};
```

---

## Kiểm thử

Ba bộ: unit, perf, và leaks.

Leak test đặc biệt trực tiếp:

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

1200 lần lặp `processGame`, GC cưỡng bức trước và sau, delta heap < 20MB. Nếu test này qua, `processGame` không bị rò rỉ. Test render (`renderImage.spec.ts`) kiểm tra thời gian thực thi dưới một ngưỡng thực tế.

Ngoài ra còn có script `bench.ts` để profile pipeline hoàn chỉnh:

```
RENDER_PERF=1 npx tsx bench.ts --runs=20 --warmup=3 --monster=Dragon
```

Với `RENDER_PERF=1`, wrapper `withPerf` trong mỗi service ghi lại thời gian:

```typescript
export async function withPerf(scope: string, label: string, work: () => Promise): Promise {
  const perf = createPerfLogger(scope);
  if (!perf.enabled) return work(); // zero overhead nếu bị tắt
  perf.mark(`${label}:start`);
  try { return await work(); }
  finally { perf.done(`${label}:done`); }
}
```

`createPerfLogger` trả về no-ops nếu `DEV_MODE` và `RENDER_PERF` không được đặt thành `1`. Không có overhead trong production.

---

## Chi phí vận hành

- **Vercel free tier**: 100GB bandwidth, 1M serverless invocations mỗi tháng. Render hình ảnh được tính là một invocation.
- **Cloudflare Workers free tier**: 100K yêu cầu/ngày, 10ms CPU time mỗi yêu cầu (render có thể vượt quá trên Workers, do đó Vercel là primary).
- **Supabase free tier**: 500MB database, 5GB bandwidth. Đủ cho hàng ngàn người chơi.

Toàn bộ backend chạy với chi phí bằng không cho đến khi đạt khối lượng đáng kể. Điểm nghẽn duy nhất là giới hạn CPU của Cloudflare Workers -- render hình ảnh tốn CPU do WASM, do đó chiến lược dùng Vercel làm primary và Workers làm CDN dự phòng.

---

## 3 điều đáng ghi nhớ

1. **URL như trạng thái trò chơi** không chỉ là một mẹo hay -- đó là một ràng buộc từ Discord (các nút có giới hạn 100 ký tự) đã buộc phải có kiến trúc stateless với nén RLE + token session làm dự phòng. Ràng buộc đã định hình thiết kế.

2. **Bộ nhớ đệm WASM với eviction tường minh**: các `PhotonImage` cấp phát bên ngoài heap JavaScript và sẽ không bao giờ được GC thu hồi nếu không có `.free()`. Gắn `freePhoton` vào eviction của LRU giống như RAII trong JavaScript. Điều này kín đáo trong code, nhưng nếu không có nó worker sẽ bị rò rỉ trong production.

3. **Bot Discord serverless không cần WebSocket**: ít được biết đến hơn so với phương pháp WebSocket gateway, nhưng đối với bot xử lý stateless (mỗi tương tác độc lập), Interactions Endpoint hoàn toàn vượt trội -- không cần kết nối lại, không heartbeat, không cần duy trì tiến trình. Discord quản lý tính khả dụng phía hạ tầng của họ.

---

*Repo : [fox3000foxy/konosuba-rpg](https://github.com/fox3000foxy/konosuba-rpg)*

*Giấy phép source-available tùy chỉnh -- không được phân phối lại, free to use.*
