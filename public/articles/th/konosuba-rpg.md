---
title: "ฉันใช้เวลาสุดสัปดาห์อ่านโค้ด konosuba-rpg และนี่คือสิ่งที่ฉันพบ"
description: "RPG ผลัดกันเล่นบน Discord ที่ทุกการกระทำสร้างภาพ WebP ทันที: URL เป็นสถานะเกม,
  RNG แน่นอน, pipeline WASM, แคช 5 ระดับ, บอทแบบ serverless"
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
author_sig: "XtINLoJydKrEy/wzWhIApSKDUHekcp8MF92CVz8sBuuCZ2Y0bbncgI5C2KXIcJHdKcd5Kep4khG5SVosvaLN4Q=="
---

# ฉันใช้เวลาสุดสัปดาห์อ่านโค้ด konosuba-rpg และนี่คือสิ่งที่ฉันพบ

ฉันดูแลโปรเจกต์นี้มาระยะหนึ่งแล้ว แต่การอ่านโค้ดของตัวเองอีกครั้งอย่างใจเย็นก็ให้บทเรียนเสมอ konosuba-rpg คือ RPG ผลัดกันเล่นบน Discord ที่ทุกการกระทำสร้างภาพ WebP ทันที ไม่ใช่ embed ข้อความ แต่เป็นภาพจริงที่ประกอบด้วยสไปรต์, แถบพลังชีวิต, ข้อความต่อสู้ -- ทุกอย่าง

stack: TypeScript, Hono, Vercel, Cloudflare Workers, Supabase โฮสต์ฟรีทั้งหมด และบอท Discord ทำงานโดยไม่ต้องมีเซิร์ฟเวอร์ถาวร โพสต์นี้อธิบายว่าทุกอย่างทำงานร่วมกันอย่างไร

![สถานะเริ่มต้นของเกม](/images/konosuba-rpg/game_init.webp)

---

## การออกแบบพื้นฐาน: URL เป็นสถานะเกม

สิ่งแรกที่สะดุดตา: ไม่มีสถานะฝั่งเซิร์ฟเวอร์สำหรับการเล่นเกม สถานะทั้งหมดของการต่อสู้อยู่ใน URL

```
/konosuba-rpg/fr/abc123/ATK/DEF/ATK/HUG?monster=Vanir&difficulty=hard
```

แต่ละ segment หลังจาก seed คือการกระทำที่เล่นแล้ว เซิร์ฟเวอร์ได้รับ URL นี้ เริ่มต้นใหม่ เล่นการกระทำทั้งหมดตามลำดับ และส่งคืนภาพของการต่อสู้ ณ ขณะนั้น ไม่มี session, ไม่มีสถานะใน RAM ที่ผูกกับผู้ใช้

Discord ทำงานด้วยปุ่มโต้ตอบ -- เมื่อผู้เล่นกด "โจมตี" Discord จะส่ง `custom_id` ของปุ่มไปยังเซิร์ฟเวอร์ custom_id นี้มี URL ที่บีบอัดของการต่อสู้พร้อมการกระทำใหม่ที่เพิ่มเข้าไป เซิร์ฟเวอร์คำนวณทุกอย่างใหม่ตั้งแต่ต้นและส่งคืนภาพที่อัปเดต

```typescript
// processUrl.ts
const VALID_MOVES_SET = new Set(["ATK", "DEF", "HUG", "HEA", "SPE", "USE"]);
// Precompiled outside function -- not recreated on every call

export default function processUrl(url: string): [Random, string[], string, string | null, string | null] {
  const urlParts = url.split("/");
  const moves: string[] = [];
  for (const part of urlParts) {
    if (VALID_MOVES_SET.has(part.toUpperCase())) moves.push(part.toUpperCase());
  }
  // seed = 6th segment, hashed to 8096 values
  const seedStr = (urlParts[5] || "").toLowerCase();
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed + seedStr.charCodeAt(i)) % 8096;
  }
  return [new Random(seed), moves, seedStr, monster, difficulty];
}
```

การมี `Set` ที่ precompiled ไว้นอกฟังก์ชันเป็นรายละเอียดเล็กน้อย แต่มันช่วยไม่ให้ต้องสร้างโครงสร้างใหม่ทุกครั้งที่มีการเรียกใช้ในบริบท edge ที่โมดูลอาจถูกประเมินค่าใหม่

### RNG: RC4 ที่ถูกดัดแปลง

ตัวสร้างตัวเลขสุ่มเป็นการนำ RC4 (อัลกอริธึมเข้ารหัสแบบ stream) มาใช้เป็น PRNG

```typescript
export class Random {
  private S: number[]; // table of 256 entries
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

ทำไมต้อง RC4? เพราะมันเป็น PRNG แน่นอนที่มีการกระจายตัวที่ถูกต้องและทนทานต่อการชนของ seed ได้สมเหตุสมผล seed เดียวกัน = ลำดับตัวเลขเดียวกัน = การต่อสู้เดียวกันทุกครั้ง ทำให้สามารถ "เล่นซ้ำ" การต่อสู้ใด ๆ โดยเก็บ URL ไว้ และรับประกันว่าเซิร์ฟเวอร์สองตัวที่แตกต่างกัน (Vercel + Cloudflare) ให้ผลลัพธ์ที่เหมือนกันทุกประการสำหรับ URL เดียวกัน

---

## ปัญหาขีดจำกัด 100 ตัวอักษรของ Discord

Discord กำหนดขีดจำกัด 100 ตัวอักษรบน `custom_id` ของปุ่ม หลังจากผ่านไปหลายสิบท่า URL การต่อสู้จะเกินขีดจำกัดนี้อย่างสบาย

มีสองกลไกที่จัดการกับปัญหานี้

### 1. การบีบอัด RLE ของท่า

ท่าถูกเข้ารหัสด้วยอักขระเดียว (`a`=attack, `d`=defend, `h`=hug...) และบีบอัดด้วย run-length encoding:

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

ง่าย แต่เมื่อผู้เล่นกดโจมตี x10 มันเปลี่ยนจาก `aaaaaaaaaa` (10 ตัวอักษร) เป็น `a10` (3 ตัวอักษร) ปุ่ม "โจมตี x4" และ "โจมตี x10" ใน UI มีไว้เพื่อสิ่งนี้ -- เร่งการต่อสู้ในขณะที่บีบอัด payload ได้ดี

### 2. Session tokens เมื่อการบีบอัดไม่พอ

ถ้า payload ที่บีบอัดแล้วยังยาวเกินไป มันจะถูกเก็บในฐานข้อมูลด้วย token สั้น:

```typescript
// gameSessionService.ts
const TOKEN_PREFIX = "gs.";
const TOKEN_SIZE = 10; // "gs.aBcDeFgHiJ"

export async function encodeGameplayButtons(buttons: RawButton[]): Promise {
  // Groups payloads by battle_key, inserts batch into Supabase
  // Replaces custom_id with "gs.{token}:{userId}"
}

export async function decodeGameplayPayloadWithStatus(encodedPayload: string, userID: string) {
  if (!encodedPayload.startsWith(TOKEN_PREFIX)) {
    return { payload: encodedPayload }; // No lookup if not needed
  }
  // Memory lookup first, then Supabase if absent
  const cached = tokenToSession.get(token) || await loadTokenRowByToken(token);
  // Checks ownership, TTL (7 days), and turn_version (prevents replaying old state)
}
```

Session มี TTL 7 วัน และการ pruning อัตโนมัติทุก 10 นาที การตรวจสอบ `turnVersion` ป้องกันการเล่นซ้ำสถานะที่ล้าสมัยหากผู้เล่นได้ดำเนินการในเกมต่อไปแล้ว -- การป้องกันเล็กน้อยต่อการ "ย้อนกลับ" โดยไม่ตั้งใจ

Map ในหน่วยความจำทั้งสอง (`tokenToSession`, `latestTurnByBattle`) ใช้ pattern `globalThis as unknown as GameSessionGlobals` เดียวกับแคชภาพ ด้วยเหตุผลเดียวกับที่จะกล่าวถึงด้านล่าง

---

## Pipeline การเรนเดอร์ภาพ

![เริ่มการต่อสู้กับ Slime](/images/konosuba-rpg/shot_01_start.webp)

เส้นทาง `/konosuba-rpg/:lang/*` ไม่ได้ส่งคืน JSON มันส่งคืนภาพ WebP ที่สร้างตามคำขอ

pipeline จัดเรียงเป็น 3 ชั้นประกอบ:

```
Background (board + frame)
    +
Characters layer (สไปรต์ผู้เล่น + มอนสเตอร์, ตำแหน่งคงที่)
    +
UI overlay (แถบ HP, ข้อความ, ไอคอนตัวละครผ่าน Satori → SVG → PNG)
    ↓
Photon.watermark() × 2
    ↓
WebP output
```

**Background**: ภาพคงที่สองภาพ (กระดานและกรอบ) โหลดจาก filesystem และประกอบครั้งเดียว

**Characters layer**: สไปรต์ถูกวางตามพิกัดที่คำนวณ ผู้เล่นที่ตายจะถูกแยกออก (`activeSlots = slots.filter(s => playerHp[s.i] > 0)`) สไปรต์ศัตรูถูกสะท้อนแนวนอนด้วย `flipX` แบบกำหนดเอง -- วนลูปทีละพิกเซลแทนการพึ่งพาภายนอก

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

**UI overlay**: ส่วนที่หนักหน่วง JSX ของอินเทอร์เฟซ (แถบชีวิต, ข้อความ, ไอคอน) ถูกอธิบายในรูปแบบ React-like ด้วย Satori, เรนเดอร์เป็น SVG, แปลงเป็น PNG ด้วย `@cf-wasm/resvg`, แล้วนำเข้าไปยัง Photon สำหรับการประกอบขั้นสุดท้าย Satori + resvg เป็นโมดูล WASM สองตัวที่ถูกคอมไพล์เฉพาะสำหรับ Cloudflare Workers ด้วย flag `edge-light`

![ท่า Defend](/images/konosuba-rpg/shot_03_defend.webp)

![การต่อสู้กำลังดำเนิน](/images/konosuba-rpg/shot_02_combat.webp)

![ท่ากอด](/images/konosuba-rpg/shot_04_hug.webp)

---

## ระบบแคช -- ส่วนที่ถูกพัฒนามากที่สุด

มีแคช 5 ระดับ แต่ละระดับกำหนดเป้าหมาย granularity ที่แตกต่างกันของ pipeline

```typescript
// renderImage.ts -- all on globalThis
G.__imageCache  ??= {} as Record; // raw assets
G.__base64Cache ??= {} as Record;       // base64 of assets (for Satori)
G.__fontCache   ??= {} as Record; // fonts
G.__photonCache    ??= new LRUCache(40, freePhoton);
G.__layerCache     ??= new LRUCache(12, freePhoton);
G.__uiPhotonCache  ??= new LRUCache(30, freePhoton);
G.__renderOutputCache ??= new LRUCache(120);
```

pattern `??=` บน `globalThis`: โมดูล JavaScript ใน edge workers อาจถูกประเมินค่าใหม่ระหว่างคำขอบางการกำหนดค่า การเก็บแคชบน `globalThis` ด้วย `??=` รับประกันว่าพวกมันอยู่รอดจากการประเมินค่าใหม่เหล่านี้โดยไม่ถูกสร้างใหม่

### การ eviction แบบ WASM

แคชภาพ Photon (`photonCache`, `layerCache`, `uiPhotonCache`) ใช้ callback การ eviction:

```typescript
function freePhoton(_key: string, img: Photon.PhotonImage): void {
  try { img.free(); } catch { /* already freed */ }
}

new LRUCache(40, freePhoton)
```

`Photon.PhotonImage` คือออบเจกต์ WASM ที่มีหน่วยความจำที่จัดสรรไว้ใน linear memory ของ WASM อยู่นอก GC ของ JavaScript หากไม่เรียก `.free()` อย่างชัดเจน หน่วยความจำนี้จะไม่มีวันถูกปลดปล่อย การ eviction ของ LRU จะ trigger `.free()` โดยอัตโนมัติ -- มันคือ RAII ที่นำมาใช้ใน JavaScript

### คีย์แคชตั้งใจให้ lossy

```typescript
function buildCharactersKey(playerImages: string[][], playerHp: number[], creatureImages: string[], creatureHp: number): string {
  const players = playerImages.map((imgs, i) => `${imgs[0]}:${playerHp[i] > 0 ? 1 : 0}`).join("|");
  return `chars::${players}::${creatureImages[0]}:${creatureHp > 0 ? 1 : 0}`;
}
```

คีย์ของ characters layer ไม่ได้เข้ารหัสค่า HP ที่แน่นอน -- แค่ `1` (มีชีวิต) หรือ `0` (ตาย) เพราะสไปรต์ของผู้เล่นที่ 40 HP กับผู้เล่นที่ 15 HP นั้นเหมือนกัน cache hit จึงอยู่รอดจากการถูกโจมตีใด ๆ ตราบใดที่ไม่มีใครตาย

ส่วนคีย์ UI กลับเข้ารหัส HP ที่แน่นอน (แถบชีวิตเปลี่ยนทุกครั้งที่ถูกโจมตี) และ hash ของข้อความ:

```typescript
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0; // signed 32-bit integer
  }
  return hash.toString(16);
}
```

`Math.imul` บังคับการคูณเป็นจำนวนเต็ม 32 บิต ซึ่งหลีกเลี่ยงการแปลง float64 และให้ hash polynomial ที่เสถียร ไม่ต้องพึ่งพาภายนอกสำหรับสิ่งนี้

### การแปลง base64 โดยไม่มี stack overflow

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

`String.fromCharCode(...largeArray)` อาจทำให้เกิด stack overflow บนภาพขนาดใหญ่เพราะ argument ถูกส่งผ่าน call stack การแบ่งเป็น chunk 32KB ช่วยหลีกเลี่ยงปัญหา ผลลัพธ์ถูกเก็บในแคช -- การแปลง base64 ของภาพเดียวกันจะทำเพียงครั้งเดียวต่อ instance ของ worker

---

## STRIPPER.md -- การตรวจสอบ await แบบตามลำดับ

มีไฟล์ `STRIPPER.md` ใน repo ที่บันทึกการตรวจสอบการทำ `await` แบบขนาน ตัวอย่างบางส่วนที่บันทึกไว้:

- การโหลดโปรไฟล์ผู้เล่นเคยทำ 3 คำขอ Supabase แบบเรียงต่อกัน (progression, run summary, achievements) ถูกเปลี่ยนเป็น `Promise.all` -- ไม่มีการพึ่งพากันระหว่างคำขอ
- การแจกจ่ายรางวัลหลังจบการต่อสู้ (accessories + consumables) เคยเป็นแบบตามลำดับ ถูกทำให้ขนานเช่นกัน
- การสร้าง token session สำหรับปุ่มเคยทำทีละกลุ่ม กลุ่มที่เป็นอิสระตอนนี้ถูกสร้างแบบขนาน

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

ไม่มีอะไรปฏิวัติ แต่ในบริบท serverless ที่ทุก millisecond ของเวลาตอบสนองมีค่าใช้จ่าย (หรือมีส่วนทำให้ cold start) มันสำคัญ

---

## บอท Discord โดยไม่มีเซิร์ฟเวอร์ถาวร

![ชัยชนะ](/images/konosuba-rpg/shot_05_win.webp)

จุดที่มักเข้าใจผิด: บอท Discord ไม่จำเป็นต้องมีการเชื่อมต่อ WebSocket แบบถาวรเสมอไป Discord มีทางเลือกอื่น: **Interactions Endpoint URL** คุณให้ URL HTTPS แก่ Discord และ Discord จะส่ง POST ให้คุณสำหรับทุก interaction (slash command, ปุ่ม, autocomplete)

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

Discord ส่ง POST, handler ทำงาน 50-200ms บนฟังก์ชัน Vercel หรือ Cloudflare Worker, ตอบกลับ, แล้วจบ ไม่ต้องรักษาการเชื่อมต่อถาวร, ไม่ต้องมีเซิร์ฟเวอร์ที่เปิดทิ้งไว้ บอท Discord ทั้งหมดโฮสต์บน free tier ของ Vercel

การตรวจสอบ Ed25519 (`verifyKey` จาก `discord-interactions`) เป็นสิ่งจำเป็น -- Discord ส่งลายเซ็นใน header ที่คุณต้องตรวจสอบ มิฉะนั้นมันจะปฏิเสธ endpoint

### ท่าพิเศษ -- await ที่ตั้งใจเพียงอันเดียว

```typescript
// handleSpecialButton.ts
await new Promise(resolve => setTimeout(resolve, 3000)); // 3 seconds
await fetch(`${DISCORD_API_URL}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
  method: "PATCH",
  // ...
});
```

การหน่วงเวลา 3 วินาทีโดยตั้งใจนี้ถูกบันทึกใน STRIPPER.md ว่าตั้งใจ ท่าพิเศษของ Megumin (Explosion) มี animation ฝั่ง Discord -- ข้อความจะถูกอัปเดตด้วยภาพระหว่างกลางก่อน จากนั้นจึงเปลี่ยน 3 วินาทีต่อมาด้วยผลลัพธ์ นี่เป็นกรณีเดียวที่ฟังก์ชัน Vercel ทำงานนานเกินความจำเป็นโดยตั้งใจ

![ท่าพิเศษ](/images/konosuba-rpg/shot_08_special.webp)

---

## การ deploy บนสองแพลตฟอร์ม

codebase เดียวกันทำงานบน Vercel (Node.js) และ Cloudflare Workers (V8 isolates) โดยไม่ต้องแก้ไข:

```typescript
// worker.ts -- Cloudflare entrypoint
export default {
  fetch(request: Request, env: WorkerBindings): Promise {
    syncBindingsToProcessEnv(env); // injects CF secrets into process.env
    return app.fetch(request, env, ctx);
  }
};

// index.ts -- Vercel/Node entrypoint
const isVercelRuntime = process.env.VERCEL === "1";
if (!isVercelRuntime) { start(); }
```

ความแตกต่างหลัก: static assets บน Vercel อ่านจาก filesystem (`/var/task/assets/`) บน Cloudflare Workers ผ่าน binding `ASSETS` (CF static assets) โดยมี fallback ไปยัง HTTPS mirror (`fox3000foxy.com/konosuba-rpg/assets`) `getAssetBytes` ใน `assetLoader.ts` จัดการทั้งสองเส้นทางโดยลอง filesystem ก่อน แล้วค่อย fetch

WASM (`@cf-wasm/photon/edge-light`, `@cf-wasm/resvg`) มี builds แยกสำหรับแต่ละ runtime flag `edge-light` ในชื่อ package ระบุ build ที่เข้ากันได้กับ Cloudflare Workers ซึ่งไม่อนุญาต `new WebAssembly.Module()` ใน runtime -- WASM ต้องถูก pre-compiled

---

## การดำเนินเรื่อง: XP, เลเวล, ความสัมพันธ์

![บอส 650 HP](/images/konosuba-rpg/shot_06_boss.webp)

meta-progression อาศัย Supabase free tier โครงสร้างประกอบด้วยตาราง `players` (XP รวม, เลเวล, gold), `character_progress` (XP/เลเวล/ความสัมพันธ์ต่อตัวละครสำหรับ Darkness, Aqua, Megumin), `runs` (ประวัติการต่อสู้), `inventory_items`, `daily_quests_progress`, `achievements_unlocked`, `game_sessions`

โมเดลการดำเนินเรื่องเรียบง่าย:

```typescript
// characterService.ts
export function computeLevelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1; // 100 XP per level
}

export function getLevelFactor(level: number): number {
  return 1 + 0.2 * (level - 1); // +20% stats per level
}

export function getAffinityFactor(affinity: number): number {
  const stars = Math.floor(affinity / 20); // 20 points per star, max 5 stars
  return 1.2 ** stars; // exponential progression
}
```

ปัจจัยเหล่านี้ถูกนำไปใช้กับ stats ของตัวละครตอนเริ่มต้นทุก `processGame` Kazuma ตามเลเวลรวมของผู้เล่น ส่วนอีกสามตัวมี XP/เลเวลของตัวเอง ความสัมพันธ์ (ได้จากการเก็บดรอปที่เกี่ยวข้องกับตัวละคร) คูณ stats ของมันอย่างอิสระ

![รักษา](/images/konosuba-rpg/shot_07_heal.webp)

ระบบดรอปใช้ loot table ถ่วงน้ำหนักตามความยาก:

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

## การทดสอบ

สามชุด: unit, performance, และ leak

leak test โดยเฉพาะตรงไปตรงมา:

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

1200 รอบของ `processGame`, บังคับ GC ก่อนและหลัง, delta heap < 20MB ถ้าเทสนี้ผ่าน `processGame` ก็ไม่ leak เทส render (`renderImage.spec.ts`) ตรวจสอบเวลาทำงานภายใต้เกณฑ์ที่ใช้งานได้จริง

นอกจากนี้ยังมีสคริปต์ `bench.ts` สำหรับ profile pipeline ทั้งหมด:

```
RENDER_PERF=1 npx tsx bench.ts --runs=20 --warmup=3 --monster=Dragon
```

เมื่อ `RENDER_PERF=1`, wrapper `withPerf` ในทุก service จะ log timings:

```typescript
export async function withPerf(scope: string, label: string, work: () => Promise): Promise {
  const perf = createPerfLogger(scope);
  if (!perf.enabled) return work(); // zero overhead if disabled
  perf.mark(`${label}:start`);
  try { return await work(); }
  finally { perf.done(`${label}:done`); }
}
```

`createPerfLogger` ส่งคืน no-ops ถ้า `DEV_MODE` และ `RENDER_PERF` ไม่ได้เป็น `1` ไม่มี overhead ใน production

---

## ค่าใช้จ่ายในการรัน

- **Vercel free tier**: 100GB bandwidth, 1M serverless invocations ต่อเดือน การเรนเดอร์ภาพนับเป็นหนึ่ง invocation
- **Cloudflare Workers free tier**: 100K คำขอ/วัน, 10ms CPU time ต่อคำขอ (การเรนเดอร์อาจเกินนี้บน Workers ดังนั้น Vercel จึงเป็น primary)
- **Supabase free tier**: 500MB database, 5GB bandwidth เพียงพอสำหรับผู้เล่นหลายพันคน

backend ทั้งหมดทำงานด้วยต้นทุนศูนย์จนถึงปริมาณที่มีนัยสำคัญ จุดเสียดทานเดียวคือขีดจำกัด CPU ของ Cloudflare Workers -- การเรนเดอร์ภาพใช้ CPU มากเนื่องจาก WASM ดังนั้นกลยุทธ์คือใช้ Vercel เป็น primary และ Workers เป็น CDN failover

---

## 3 สิ่งที่น่าจดจำ

1. **URL เป็นสถานะเกม** ไม่ใช่แค่เทคนิคเจ๋ง ๆ -- มันเป็นข้อจำกัดที่ถูกบังคับโดย Discord (ปุ่มมีขีดจำกัด 100 ตัวอักษร) ซึ่งบังคับให้มีสถาปัตยกรรมแบบ stateless พร้อมการบีบอัด RLE และ token session เป็นตัวสำรอง ข้อจำกัดกำหนดการออกแบบ

2. **แคช WASM พร้อม eviction แบบชัดเจน**: `PhotonImage` จัดสรรหน่วยความจำนอก heap ของ JavaScript และจะไม่มีวันถูก GC หากไม่มี `.free()` การเชื่อม `freePhoton` เข้ากับการ eviction ของ LRU คือ RAII ใน JavaScript มันดูเล็กน้อยในโค้ด แต่ถ้าไม่มีมัน worker จะรั่วใน production

3. **บอท Discord แบบ serverless โดยไม่ต้องใช้ WebSocket**: วิธีการนี้รู้จักกันน้อยกว่าวิธี WebSocket gateway แต่สำหรับบอทที่ทำงานแบบ stateless (แต่ละ interaction เป็นอิสระ) การใช้ Interactions Endpoint เหนือกว่าอย่างชัดเจน -- ไม่ต้อง reconnect, ไม่ต้อง heartbeat, ไม่ต้องรักษา process Discord จัดการความพร้อมใช้งานฝั่งโครงสร้างพื้นฐานของพวกเขา

---

*Repo : [fox3000foxy/konosuba-rpg](https://github.com/fox3000foxy/konosuba-rpg)*

*Licence source-available custom -- ห้ามแจกจ่าย ใช้ได้ฟรี*
