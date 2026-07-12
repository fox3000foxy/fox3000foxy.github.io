---
title: "Discord bot 100% serverless : Hono + Cloudflare Workers"
description: วิธีที่ผมเปลี่ยน Discord bot ที่เสียค่าใช้จ่าย 50€/เดือน ให้เหลือศูนย์ยูโร --
  interaction endpoints, Hono, Workers, การเรนเดอร์ภาพแบบเรียลไทม์,
  และเกมเต็มรูปแบบโดยไม่ต้องใช้ WebSocket
date: 2026-05-29
authors:
  - fox3000foxy
tags:
  - discord
  - cloudflare
  - serverless
  - typescript
  - bots
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "RBgzFEsXA3P8dZSWEqBI5hL5nSZ3Mlvoh9wjgnOvSs6ff828xgwE5Oz6UvYTLx/nQpZyuDvP29p0RzyZnry9Wg=="
---

## Discord bot 100% serverless : Hono + Cloudflare Workers = 💸 ศูนย์

ผมใช้เวลาหลายเดือนในการดูแล Discord bot ทั่วไปบนเครื่องของตัวเอง

การเชื่อมต่อ WebSocket เปิดตลอดเวลา บอท reconnect เองตอนตีสาม บอท crash เพราะผมมองแกะผิดทาง ค่าใช้จ่ายพุ่ง

วันหนึ่งผมค้นพบ: **ทำไมต้องรักษาการเชื่อมต่อ** ? Discord สามารถ POST เฉพาะสิ่งที่คุณสนใจได้ คุณตอบกลับ ก็จบ

ตั้งแต่ปี 2021 Discord มี **interaction endpoints**

มันคือ HTTP ล้วน ๆ ไม่มี WebSocket ไม่มีสถานะคงที่ คุณได้รับ request ส่ง JSON กลับไป ก็จบ request ถัดไปมาก็เอง

และที่เจ๋งที่สุด: Cloudflare Workers **ฟรี** สูงถึง 100k requests/วัน สำหรับ 90% ของบอททั้งหมด นั่นคือ 0€/เดือน

บทความนี้จะแสดงวิธีทำ Discord bot โดยไม่ใช้ WebSocket โดยใช้ **Hono** (เว็บเฟรมเวิร์กที่เบามาก) และ **Cloudflare Workers** ผมจะพาคุณดูโปรเจกต์จริงสองโปรเจกต์: **Nibi** (บอทเรียนภาษาญี่ปุ่น, TTS, เจ๋ง) และ **Konosuba-RPG** (เกม Discord _เต็มรูปแบบ_ พร้อมเรนเดอร์ภาพแบบเรียลไทม์ xD)

## WebSocket vs. Interaction Endpoints : ทำไมมันถึงเป็นความคิดที่ไม่ดี

ลองนึกภาพเกม Minecraft ที่คุณต้องรักษาการเชื่อมต่อไว้ตลอดเวลาแม้ตอนคุณไม่ได้เล่น

และเซิร์ฟเวอร์ reconnect อัตโนมัติทุกครั้งที่มัน crash คุณต้องจัดการ timeouts, exponential backoff, boilerplate ที่น่าเบื่อทั้งหมดที่เราเกลียด เพียงแค่เพื่อรับ interactions

Interaction endpoints คือสิ่งที่ตรงกันข้าม Discord POST ไปที่ URL ของคุณ คุณตอบกลับ ก็จบ

ถ้าเซิร์ฟเวอร์คุณล่ม ? Discord retry 2-3 ครั้งแล้วข้ามไป ไม่มีดราม่า

**ค่าใช้จ่ายก่อน** : 50€/เดือนบน Heroku เพียงเพื่อให้ process Node อยู่รอด

**ค่าใช้จ่ายหลัง** : 0€/เดือนบน Cloudflare สูงถึง 100k requests/วัน

## สถาปัตยกรรม : มันคืออะไรกันแน่ ?

Discord POST request ไปที่ endpoint ของคุณ

```plaintext
Discord: "เฮ้! ผู้ใช้คลิก /ping!"
      ↓
   URL ของคุณ (Cloudflare Worker)
      ↓
   คุณตรวจสอบว่ามันคือ Discord จริงไหม (ตรวจสอบลายเซ็น)
      ↓
   คุณแยกประเภทของ interaction
      ↓
   คุณ execute handler
      ↓
   คุณคืนค่า JSON
      ↓
Discord: "เยี่ยม, ฉันจะแสดงสิ่งนั้นให้ผู้ใช้"
```

มันคือ HTTP บริสุทธิ์ ไม่มีเวทมนตร์ ไม่มี libraire ที่หนัก

## Hono + Cloudflare Workers : คอมโบที่ประหยัด

**Hono** คือเว็บเฟรมเวิร์กที่หนัก 12KB มันทำงานได้ทุกที่: Cloudflare Workers, Vercel, AWS Lambda, Deno, Bun... โค้ดเดียวกันทุกที่

Cloudflare Workers คือการประมวลผลที่ edge request ของคุณไปถึงเซิร์ฟเวอร์ที่ใกล้ที่สุด เวลาตอบสนอง: \<100ms ค่าใช้จ่าย: ฟรีสูงถึง 100k requests/วัน

คอมโบ Hono + Cloudflare คือคู่ที่สมบูรณ์แบบสำหรับ Discord bot

นี่คือโค้ดขั้นต่ำของบอทที่สมบูรณ์:

```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. ดึง headers
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. ตรวจสอบว่ามันคือ Discord จริง (ไม่ใช่สแปม)
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3. แยกข้อมูลที่ส่งมา
  const interaction = JSON.parse(body);

  // 4. ตอบกลับตามประเภท
  if (interaction.type === 1) {
    // Discord test (PING)
    return c.json({ type: 1 });
  }

  if (interaction.type === 2) {
    // มันคือ slash command
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

แค่ 30 บรรทัดและมันคือบอทที่ใช้งานได้

ไม่จำเป็นต้อง `bot.login()` ไม่มี event emitter ไม่มี callback hell แค่ HTTP

สำหรับ deploy บน Cloudflare:

```plaintext
npm install -D wrangler
npx wrangler deploy
```

บูม คุณมี URL แบบ `https://mon-bot.workers.dev/interactions`

ใส่ URL นั้นใน Discord Developer Portal ภายใต้ "INTERACTIONS ENDPOINT URL" แล้ว Discord จะเริ่มส่ง interactions ของคุณไปที่นั่น

## ตรวจสอบลายเซ็น : ไม่มี requests ปลอม

Discord เซ็นทุก request ด้วย public key ถ้าคุณได้รับ request ที่มีลายเซ็นผิด ? นั่นคือสแปม ไม่สนใจแล้วไปต่อ

แพ็กเกจ `discord-interactions` จัดการให้:

```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // ข้อความดิบที่แน่นอน (ไม่ใช่ JSON ที่ parse แล้ว!)
  signature,         // header x-signature-ed25519
  timestamp,         // header x-signature-timestamp
  publicKey          // จาก Discord Dev Portal
);
```

**ข้อผิดพลาดสำคัญ** : ลายเซ็นขึ้นอยู่กับ body _ที่แน่นอน_ ถ้าคุณ parse JSON แล้ว re-stringify, หรือ log body, คุณจะทำลายลายเซ็น

ตรวจสอบก่อน Parse ทีหลัง นั่นคือลำดับที่สำคัญ

## กรณีที่ 1 : Nibi (บอทเรียนภาษาญี่ปุ่น)

Nibi คือ Discord bot สำหรับเรียนภาษาญี่ปุ่น คำสั่งง่าย ๆ:

*   `/dictionary kanji` → แสดงคำจำกัดความ
*   `/pronounce テキスト` → สร้าง TTS (text-to-speech)
*   `/hello` → ข้อความต้อนรับ

แต่ละคำสั่งคือไฟล์ TypeScript:

```plaintext
src/commands/
├── dictionary.ts
├── pronounce.ts
├── hello.ts
└── ...
```

แต่ละคำสั่ง implement interface นี้:

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

### คำสั่ง /pronounce : ทำให้บอทพูดได้

อันนี้ค่อนข้างแปลก คุณส่งข้อความ (romaji, hiragana, kanji, อะไรก็ได้) บอทแปลงเป็น hiragana, สร้าง TTS ผ่าน VOICEVOX หรือ Google TTS, และส่งข้อความเสียงบน Discord

```typescript
const pronounce: Command = {
  data: {
    name: 'pronounce',
    description: 'สร้าง TTS สำหรับข้อความภาษาญี่ปุ่น',
    options: [
      {
        type: 3,  // STRING
        name: 'text',
        description: 'ข้อความที่จะออกเสียง',
        required: true
      }
    ]
  },

  async execute(interaction, env) {
    const text = interaction.data.options[0].value;

    try {
      // 1. แปลง romaji → hiragana ด้วย Kuroshiro
      const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });

      // 2. สร้างไฟล์เสียง TTS
      const audioBuffer = await generateTTS(hiragana);

      // 3. อัปโหลดไฟล์ไปยัง Discord
      const uploadFilename = await uploadToDiscord(
        audioBuffer,
        interaction.channel.id,
        env.BOT_TOKEN
      );

      // 4. ส่งข้อความพร้อมเสียง
      await sendVoiceMessage(
        interaction.channel.id,
        uploadFilename,
        audioBuffer.length / 16000,  // ความยาวเป็นวินาที
        env.BOT_TOKEN
      );

      return {
        type: 4,
        data: { content: `การออกเสียงสำหรับ "${text}"` }
      };
    } catch (err) {
      return {
        type: 4,
        data: {
          content: 'ข้อผิดพลาด: ไม่สามารถสร้างเสียงได้ xD',
          flags: 64  // ephemeral (ข้อความส่วนตัว)
        }
      };
    }
  }
};
```

มันบ้ามาก: คุณเรียก API ภายนอก, อัปโหลดไฟล์ไปยัง Discord, ส่งข้อความพร้อมไฟล์ ทั้งหมดนี้ไม่มี WebSocket, แค่ HTTP

### Persistence ด้วย Supabase

Nibi ใช้ Supabase เป็น key-value store เพื่อตรวจสอบว่าผู้ใช้ลงทะเบียนแล้วหรือไม่:

```typescript
const DatabaseUtils = new DatabaseUtils({
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY
});

const users = await DatabaseUtils.readJson('users');
const user = users.find(u => u.id === interaction.member.user.id);

if (!user) {
  // เพิ่มผู้ใช้
  users.push({ id: interaction.member.user.id, verified: true });
  await DatabaseUtils.writeJson('users', users);
}
```

มันง่ายมาก (ไม่ใช่ SQL query จริง ๆ, แค่ JSON), แต่มันใช้งานได้ สำหรับบอทเล็ก ๆ มันสมบูรณ์แบบ

## กรณีที่ 2 : Konosuba-RPG (เกม Discord พร้อมเรนเดอร์ภาพ)

โอเค อันนี้บ้ามาก

Konosuba-RPG คือ **เกมเต็มรูปแบบ** บน Discord คุณสู้กับ mobs, ได้ XP, สวมใส่装备, เพิ่มเลเวล ทุก battle สร้าง **ภาพ** แบบเรียลไทม์ ไม่มี spritesheet ที่ pre-render ไว้ล่วงหน้า ภาพถูกประกอบแบบไดนามิกจาก stats ของผู้เล่น, mob, และสถานะการต่อสู้

และภาพถูกสร้างใน \<500ms บน Cloudflare Workers จริง ๆ นะ

### สถาปัตยกรรมการเรนเดอร์

```plaintext
Discord (คุณคลิก "Attack")
    ↓
Cloudflare Worker รับ interaction
    ↓
อัปเดต game state (XP, HP, ฯลฯ)
    ↓
สร้าง JSX ด้วย Satori
    ↓
แปลง SVG → PNG ด้วย Resvg (Wasm)
    ↓
อัปโหลดภาพไปยัง Discord
    ↓
ส่งข้อความพร้อมภาพ
```

ทั้งหมดนี้ในเวลาน้อยกว่าหนึ่งวินาที มันสุดยอดมาก

### การเรนเดอร์ภาพบน Workers

Konosuba ใช้ **Satori** (JSX → SVG) และ **Resvg** (SVG → PNG):

```typescript
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. สร้าง JSX สำหรับ UI
  const jsx = (
    <div style="{{" display:="" 'flex',="" gap:="" '20px'="" }}>
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

คุณเขียน JSX ปกติ มันกลายเป็น SVG SVG กลายเป็น PNG \<100ms บน Cloudflare Worker

คุณเห็นพลังไหม ? มันแค่... สวยงาม xD

### Game state และความก้าวหน้า

ข้อมูลของผู้เล่นอยู่ใน Supabase:

```typescript
const player = await db
  .from('players')
  .select('*')
  .eq('discord_id', interaction.user.id)
  .single();

// ผู้เล่นชนะ
const { data: updated } = await db
  .from('players')
  .update({
    level: player.level + 1,
    xp: player.xp + xpGain
  })
  .eq('id', player.id);
```

ทุกการกระทำ (โจมตี, ป้องกัน, รักษา) อัปเดต stats ในฐานข้อมูล จากนั้นคุณสร้างภาพใหม่ด้วย stats ที่อัปเดต

### Interactions : ปุ่มของ gameplay

เกมใช้ **button interactions** สำหรับการกระทำในการต่อสู้:

```typescript
{
  type: 1,  // ActionRow
  components: [
    {
      type: 2,  // Button
      style: 1,  // Primary (สีน้ำเงิน)
      label: 'Attack',
      custom_id: 'battle_attack'
    },
    {
      type: 2,
      style: 2,  // Secondary (สีเทา)
      label: 'Defend',
      custom_id: 'battle_defend'
    }
  ]
}
```

เมื่อคุณคลิก "Attack", Discord POST interaction ด้วย `custom_id: 'battle_attack'` handler จะ route ไปที่:

```typescript
if (interaction.type === 3) {
  // Component interaction (button click, ฯลฯ)
  const customId = interaction.data.custom_id;

  if (customId === 'battle_attack') {
    return await handleAttack(interaction, env);
  }
  if (customId === 'battle_defend') {
    return await handleDefend(interaction, env);
  }
}
```

แล้วบูม, คุณคำนวณดาเมจ, อัปเดตฐานข้อมูล, สร้างภาพใหม่, ส่งออกไป

มันคือเกม turn-based ที่สมบูรณ์แบบโดยไม่ต้องมีการเชื่อมต่อแบบถาวรเลย แค่ HTTP stateless บ้ามาก xD

## Supabase : DB ที่ออกแบบมาสำหรับ Workers

ฐานข้อมูลทั่วไป (PostgreSQL, MySQL, MongoDB) ถูกออกแบบมาสำหรับการเชื่อมต่อ TCP แบบถาวร คุณเปิด socket, รักษาการเชื่อมต่อไว้, ส่ง queries ปัญหาคือ: **Cloudflare Workers ไม่รองรับการเชื่อมต่อ TCP แบบถาวร** แต่ละ request คือ process ที่เกิดขึ้นชั่วคราว ทันทีที่คุณตอบกลับ client, Worker จะหายไป

คุณทำแบบนี้ไม่ได้:

```typescript
// สิ่งนี้ใช้ไม่ได้บน Workers
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // การเชื่อมต่อ TCP แบบถาวร = ตาย
```

และแม้แต่ native PostgreSQL drivers อย่าง `pg` หรือ `postgres.js` ก็ใช้การเชื่อมต่อ TCP บน Workers พวกมันพัง

**Supabase แก้ปัญหาทั้งหมดนี้**

Supabase คือ REST API ที่อยู่บน PostgreSQL คุณทำ HTTP requests ปกติ แต่ละการเรียกเป็นอิสระ ไม่มีการเชื่อมต่อถาวร ไม่มีสถานะที่ต้องจัดการ มันเหมาะสมกับโมเดล serverless อย่างสมบูรณ์แบบ

```typescript
// สิ่งนี้ใช้ได้อย่างสมบูรณ์แบบบน Workers
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

Client Supabase (`@supabase/supabase-js`) ใช้ `fetch` ภายใต้ฝาครอบ และ `fetch` เป็น native บน Workers ไม่ต้อง config, ไม่ต้อง driver, ไม่ต้องเชื่อมต่อถาวร

| ฐานข้อมูล | เข้ากันได้กับ Workers ? | เหตุผล |
| --- | --- | --- |
| **Supabase** | ✅ ใช่ | REST API ไม่มีสถานะ, HTTP ล้วน ๆ |
| **PlanetScale (MySQL)** | ⚠️ บางส่วน | การเชื่อมต่อ HTTPS เท่านั้น, ไม่มี transactions ยาว |
| **Neon** | ⚠️ บางส่วน | serverless branches แต่ต้องใช้ TCP driver |
| **Turso (libSQL)** | ⚠️ บางส่วน | HTTP เป็นไปได้แต่จำกัด |
| **Prisma/Prisma Postgres** | ❌ ไม่ | ต้องใช้ TCP แบบถาวร |
| **MongoDB Atlas** | ❌ ไม่ | TCP driver, ไม่มี REST API พื้นฐาน |
| **Redis (Upstash)** | ✅ ใช่ | REST API HTTP |

ข้อได้เปรียบที่แท้จริงของ Supabase ไม่ใช่แค่ DB -- มันคือระบบนิเวศทั้งหมดที่ถูกออกแบบมาให้ edge-first:

- **Auth** : REST API สำหรับจัดการ sessions, ทำงานแบบไม่มีสถานะ
- **Storage** : อัปโหลด/ดาวน์โหลดไฟล์ผ่าน HTTP
- **Realtime** : WebSocket เป็นตัวเลือก, แต่คุณสามารถ poll ผ่าน REST ได้เช่นกัน
- **Row Level Security** : กฎความปลอดภัยอยู่ใน DB, ไม่ใช่ใน backend ของคุณ

สำหรับ Discord bot แบบ serverless, Supabase คือตัวเลือกที่ง่ายและน่าเชื่อถือที่สุด ไม่ต้องตั้งค่า driver, ไม่ต้องรักษาการเชื่อมต่อ, ไม่ต้องกังวล timeouts แค่ HTTP requests

ถ้าคุณต้องการตัวอย่างจริง, ดู Nibi ด้านบน: โค้ด persistence คือแค่ `readJson()` และ `writeJson()` บน Supabase ไม่ต้อง migrations, ไม่ต้อง schemas ซับซ้อน, ไม่ต้อง config เยอะ มันทำงานได้ทันที และถ้าบอทคุณใหญ่ขึ้น, คุณย้ายไปใช้ SQL queries จริงโดยไม่ต้องเปลี่ยน provider

## Polyfills : เมื่อ Node ต้องการทำงานบน Workers

บางแพ็กเกจคาดหวัง Node APIs Kuromoji (parser คันจิ) ใช้ `XMLHttpRequest` Workers มี `fetch`, ไม่มี `XMLHttpRequest`

วิธีแก้ simples: เพิ่ม polyfill ที่ด้านบนของ index.ts:

```typescript
// Polyfill XMLHttpRequest สำหรับ kuromoji
if (!globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest = class {
    // Stub ขั้นต่ำ
  } as any;
}
```

หรือสร้าง module เฉพาะ:

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

มันคือ hack พื้นฐาน, แต่มันใช้งานได้

## สู่ npm package: hono-discord-interactions

การทำบอทด้วยมือต้องใช้ boilerplate เยอะ:

*   ตรวจสอบลายเซ็น Discord
*   Route ประเภท interactions
*   จัดการ commands, components, modals
*   คืนค่า JSON ที่ถูกต้อง

เราสามารถรวมทุกอย่างไว้ใน npm package แบบ:

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
        data: { content: `สวัสดี ${interaction.member.user.username}!` }
      })
    }
  ]
});

const app = new Hono();
app.post('/interactions', handler);
export default app;
```

บูม 20 บรรทัดแทน 200 บรรทัด มันจะลด Nibi ลงครึ่งหนึ่งได้ง่าย ๆ

ไอเดียไว้ทีหลัง xD

## Deploy

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

URL ที่ได้: `https://mon-bot.workers.dev/interactions`

ค่าใช้จ่าย: **ฟรี** สูงถึง 100k requests/วัน เกินกว่านั้น: $0.50/ล้าน

Spoiler: คุณจะไม่มีวันถึง 100k requests เว้นแต่คุณจะมีผู้ใช้ที่ใช้งานอยู่ 10,000 คน

### Vercel

```plaintext
npm run vercel:deploy
```

URL: `https://mon-bot-xyz.vercel.app/api/interactions`

เหมือนกัน, ฟรี

### ทั้งสองอย่างพร้อมกัน

Hono ทำงานได้ทุกที่ คุณสามารถ deploy โค้ดเดียวกันบน Cloudflare และ Vercel มีประโยชน์สำหรับความซ้ำซ้อน หรือทดสอบก่อนตัดสินใจ

## Checklist ด่วน

1.  สร้าง Application บน Discord Developer Portal
2.  คัดลอก PUBLIC\_KEY, BOT\_TOKEN, APP\_ID
3.  สร้างโปรเจกต์:
4.  เขียน index.ts (ตรวจสอบลายเซ็น + routing)
5.  ลงทะเบียน slash commands (ครั้งเดียว):
6.  Deploy:
7.  ใส่ URL ใน Discord (Developer Portal → Application → Interactions Endpoint URL)
8.  Discord ทดสอบการเชื่อมต่อ (คุณต้องตอบกลับ PING)
9.  เชิญบอทเข้าสู่เซิร์ฟเวอร์
10.  เสร็จ

## ข้อดี vs ข้อจำกัด

**ข้อดี**

*   ไม่แพง (ฟรีสูงถึง 100k req/วัน)
*   Scalable (ไม่ต้องจัดการการเชื่อมต่อ)
*   ง่าย (ไม่มี WebSocket boilerplate)
*   เร็ว (Cloudflare = เซิร์ฟเวอร์ที่ edge)
*   พกพาได้ (โค้ด Hono = หลาย hosts)

**ข้อจำกัด**

*   ไม่มี events จากเซิร์ฟเวอร์แบบเรียลไทม์ (สมาชิกเข้าร่วม, บทบาทถูกเพิ่ม, ข้อความถูกลบ, ฯลฯ) -- คุณได้รับเฉพาะ interactions (slash commands, buttons, modals)
*   Timeout 3 วินาทีในการตอบกลับ -- มิฉะนั้น Discord จะแสดง "Application did not respond"
*   ถ้าคุณต้องการ events จริง -- ต้องมี webhook HTTP แยก หรือการเชื่อมต่อ WebSocket เสริม

สำหรับ 90% ของบอท (ทั้งหมดที่ใช้ slash commands)? ใช้ได้

## สรุป

ผมใช้เวลาพอสมควรในการปรับ KonosubaRPG และ Nibi ให้ประหยัด requests ให้มากที่สุด หรือลดเวลา processor ตอนร้อน หรือลด cold boot ผลลัพธ์คือผมได้ประสิทธิภาพที่ยอดเยี่ยมในเกือบทุกด้าน
ต้องบอกว่าผมเริ่มทำให้โปรเจกต์ส่วนใหญ่กลายเป็น cloud (ไม่แน่ใจด้วยซ้ำว่ามีคำนี้ไหม) เพราะผมขี้เกียจมากที่จะโฮสต์พวกมันบน VM ของตัวเองต่อไป จริง ๆ นะ, ผมว่า Github Actions นี่แหละที่ช่วยชีวิตผมไว้ Workers ก็ช่วยเหมือนกัน แต่พอผมเห็นว่าผมสามารถทำ daemons ด้วย Github Actions และ schedules ได้, มันช่วยชีวิตผมได้จริง ๆ

ผมอาจจะเขียนบทความเกี่ยวกับโปรเจกต์ชื่อ [email-autoreply](https://github.com/fox3000foxy/email-autoreply/), ดังนั้นติดตาม RSS feed เพื่อดูเมื่อมันออกมาเร็ว ๆ นี้ :))

**3 สิ่งที่ต้องจำ:**

1.  **Interaction endpoints = HTTP serverless** -- ไม่มี WebSocket, ไม่มีการเชื่อมต่อแบบถาวร Discord POST, คุณตอบกลับ ฟรีบน Cloudflare
2.  **Hono คือเครื่องมือที่สมบูรณ์แบบ** -- เฟรมเวิร์กน้ำหนักเบา (12KB), multi-runtime, zero dependencies โค้ดเหมือนกันบน Cloudflare, Vercel, Node, ทุกที่
3.  **การเรนเดอร์ภาพบน Workers = บ้า** -- Satori + Resvg (Wasm) ให้คุณประกอบ UI แบบไดนามิกใน JSX และแปลงเป็น PNG ใน \<100ms เกมเต็มรูปแบบสามารถทำงานบนนี้ได้

มันบ้ามาก xD

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
