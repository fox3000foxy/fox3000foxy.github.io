---
title: "Discord bot 100% serverless : Hono + Cloudflare Workers"
description: Cách tôi thay thế một bot Discord tốn 50€/tháng bằng
  zero euro -- interaction endpoints, Hono, Workers, render ảnh thời gian
  thực, và một game hoàn chỉnh không cần WebSocket.
date: 2026-05-29
tags:
  - discord
  - cloudflare
  - serverless
  - typescript
  - bots
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "lBC5X/v2O/Qd7xyrH91i9lj3bF7w99DFn8UxIVgsx9blUaKR+xKceRToGqDZ2T7hbj1u7q5ESgN67w8KMVX93g=="
---

## Discord bot 100% serverless : Hono + Cloudflare Workers = 💸 zero

Tôi đã dành vài tháng để duy trì các bot Discord truyền thống trên máy cá nhân.

Kết nối WebSocket luôn mở. Bot tự kết nối lại lúc 3 giờ sáng. Bot crash vì tôi nhìn cừu không đúng cách. Hóa đơn tăng dần.

Một ngày tôi phát hiện: **tại sao phải duy trì một kết nối**? Discord có thể POST chỉ những thứ bạn quan tâm. Bạn trả lời, xong.

Từ 2021, Discord đã cung cấp **interaction endpoints**.

Chỉ là HTTP. Không WebSocket. Không trạng thái liên tục. Bạn nhận một request, bạn gửi JSON, xong. Request tiếp theo tự đến.

Và hay nhất: Cloudflare Workers **miễn phí** đến 100k request/ngày. Với 90% bot, đó là 0€/tháng.

Bài viết này sẽ chỉ bạn cách làm một bot Discord không WebSocket dùng **Hono** (web framework siêu nhẹ) và **Cloudflare Workers**. Tôi sẽ giới thiệu hai dự án thực tế: **Nibi** (bot học tiếng Nhật, TTS, ngầu) và **Konosuba-RPG** (một game Discord _hoàn chỉnh_ với render ảnh thời gian thực xD).

## WebSocket vs. Interaction Endpoints : tại sao đó là ý tưởng tồi

Hãy tưởng tượng một game Minecraft nơi bạn phải giữ kết nối mở ngay cả khi không chơi.

Và server tự động kết nối lại mỗi khi nó crash. Bạn phải xử lý timeout, kết nối lại lũy thừa, tất cả boilerplate chết tiệt mà ai cũng ghét. Chỉ để nhận interactions.

Interaction endpoints thì ngược lại. Discord POST vào URL của bạn. Bạn trả lời. Xong.

Nếu server của bạn crash? Discord thử lại 2-3 lần rồi bỏ qua. Zero drama.

**Chi phí trước** : 50€/tháng trên Heroku chỉ để giữ một tiến trình Node sống.

**Chi phí sau** : 0€/tháng trên Cloudflare đến 100k request/ngày.

## Kiến trúc : nó thực sự là gì ?

Discord POST một request đến endpoint của bạn.

```plaintext
Discord: "Này! Người dùng đã bấm /ping!"
      ↓
   URL của bạn (Cloudflare Worker)
      ↓
   Bạn kiểm tra xem có thực sự là Discord không (kiểm tra chữ ký)
      ↓
   Bạn phân tích loại interaction
      ↓
   Bạn thực thi handler
      ↓
   Bạn trả về JSON
      ↓
   Discord: "Tốt, tôi sẽ hiển thị cái này cho người dùng"
```

Thuần HTTP. Không ma thuật. Không thư viện nặng.

## Hono + Cloudflare Workers : combo tiết kiệm

**Hono** là web framework chỉ nặng 12KB. Nó chạy được ở mọi nơi: Cloudflare Workers, Vercel, AWS Lambda, Deno, Bun... cùng một code ở mọi nơi.

Cloudflare Workers là compute tại edge. Request của bạn đến server gần nhất. Thời gian phản hồi: \<100ms. Chi phí: miễn phí đến 100k request/ngày.

Combo Hono + Cloudflare là sự kết hợp hoàn hảo cho một bot Discord.

Đây là code tối thiểu của một bot hoàn chỉnh:

```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. Lấy headers
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. Xác minh đó thực sự là Discord (không phải spam)
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3. Parse nội dung gửi đến
  const interaction = JSON.parse(body);

  // 4. Trả lời theo loại
  if (interaction.type === 1) {
    // Discord test (PING)
    return c.json({ type: 1 });
  }

  if (interaction.type === 2) {
    // Đây là slash command
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

Kiểu, 30 dòng và đó là một bot hoạt động.

Không có `bot.login()`. Không event emitter. Không callback hell. Chỉ HTTP.

Để deploy lên Cloudflare:

```plaintext
npm install -D wrangler
npx wrangler deploy
```

Boom. Bạn có một URL kiểu `https://mon-bot.workers.dev/interactions`.

Bạn đặt nó trong Discord Developer Portal dưới "INTERACTIONS ENDPOINT URL", và Discord bắt đầu gửi interactions của bạn đến đó.

## Xác minh chữ ký : không có fake requests

Discord ký mỗi request bằng public key. Nếu bạn nhận request với chữ ký sai? Đó là spam. Bỏ qua và tiếp tục.

Package `discord-interactions` làm việc đó:

```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // văn bản thô chính xác (không phải JSON đã parse!)
  signature,         // header x-signature-ed25519
  timestamp,         // header x-signature-timestamp
  publicKey          // từ Discord Dev Portal
);
```

**Bẫy quan trọng** : chữ ký phụ thuộc vào body _chính xác_. Nếu bạn parse JSON rồi stringify lại, hoặc nếu bạn log body, bạn làm hỏng chữ ký.

Xác minh trước. Parse sau. Thứ tự mới là quan trọng.

## Case 1 : Nibi (bot học tiếng Nhật)

Nibi là bot Discord để học tiếng Nhật. Các lệnh đơn giản:

*   `/dictionary kanji` → hiển thị định nghĩa
*   `/pronounce テキスト` → tạo TTS (text-to-speech)
*   `/hello` → tin nhắn chào mừng

Mỗi lệnh là một file TypeScript:

```plaintext
src/commands/
├── dictionary.ts
├── pronounce.ts
├── hello.ts
└── ...
```

Một lệnh implement interface này:

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

### Lệnh /pronounce : bắt bot nói chuyện

Đây là lệnh khá kỳ lạ. Bạn gửi văn bản (romaji, hiragana, kanji, bất cứ thứ gì), bot chuyển đổi nó thành hiragana, tạo TTS qua VOICEVOX hoặc Google TTS, và gửi tin nhắn âm thanh lên Discord.

```typescript
const pronounce: Command = {
  data: {
    name: 'pronounce',
    description: 'Tạo TTS cho văn bản tiếng Nhật',
    options: [
      {
        type: 3,  // STRING
        name: 'text',
        description: 'Văn bản cần phát âm',
        required: true
      }
    ]
  },

  async execute(interaction, env) {
    const text = interaction.data.options[0].value;

    try {
      // 1. Chuyển romaji → hiragana với Kuroshiro
      const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });

      // 2. Tạo audio TTS
      const audioBuffer = await generateTTS(hiragana);

      // 3. Upload file lên Discord
      const uploadFilename = await uploadToDiscord(
        audioBuffer,
        interaction.channel.id,
        env.BOT_TOKEN
      );

      // 4. Gửi tin nhắn kèm audio
      await sendVoiceMessage(
        interaction.channel.id,
        uploadFilename,
        audioBuffer.length / 16000,  // thời gian tính bằng giây
        env.BOT_TOKEN
      );

      return {
        type: 4,
        data: { content: `Phát âm cho "${text}"` }
      };
    } catch (err) {
      return {
        type: 4,
        data: {
          content: 'Lỗi : không thể tạo audio xD',
          flags: 64  // ephemeral (tin nhắn riêng tư)
        }
      };
    }
  }
};
```

Thật điên rồ: bạn gọi API bên ngoài, upload file lên Discord, gửi tin nhắn kèm file. Tất cả không cần WebSocket, chỉ HTTP.

### Lưu trữ với Supabase

Nibi sử dụng Supabase như key-value store. Để kiểm tra người dùng đã đăng ký chưa:

```typescript
const DatabaseUtils = new DatabaseUtils({
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY
});

const users = await DatabaseUtils.readJson('users');
const user = users.find(u => u.id === interaction.member.user.id);

if (!user) {
  // Thêm người dùng
  users.push({ id: interaction.member.user.id, verified: true });
  await DatabaseUtils.writeJson('users', users);
}
```

Rất cơ bản (không có truy vấn SQL thực sự, chỉ JSON), nhưng nó hoạt động. Với bot nhỏ thì hoàn hảo.

## Case 2 : Konosuba-RPG (game Discord với render ảnh)

Okay cái này điên rồ đây.

Konosuba-RPG là một **game hoàn chỉnh** trên Discord. Bạn chiến đấu với quái, kiếm XP, trang bị phụ kiện, lên cấp. Mỗi trận chiến tạo ra một **ảnh** thời gian thực. Không spritesheet được render sẵn. Ảnh được tạo động từ chỉ số người chơi, quái vật, và trạng thái chiến đấu.

Và ảnh được tạo trong \<500ms trên Cloudflare Workers. Thật đấy.

### Kiến trúc render

```plaintext
Discord (bạn bấm "Attack")
    ↓
Cloudflare Worker nhận interaction
    ↓
Cập nhật game state (XP, HP, v.v.)
    ↓
Tạo JSX với Satori
    ↓
Chuyển đổi SVG → PNG với Resvg (Wasm)
    ↓
Upload ảnh lên Discord
    ↓
Gửi tin nhắn kèm ảnh
```

Tất cả trong chưa đầy một giây. Thật kinh ngạc.

### Render ảnh trên Workers

Konosuba sử dụng **Satori** (JSX → SVG) và **Resvg** (SVG → PNG):

```typescript
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. Tạo JSX cho UI
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

Bạn viết JSX bình thường. Nó thành SVG. SVG thành PNG. \<100ms trên Cloudflare Worker.

Bạn thấy sức mạnh chưa? Nó chỉ là... đẹp xD

### Game state và tiến trình

Dữ liệu người chơi được lưu trong Supabase:

```typescript
const player = await db
  .from('players')
  .select('*')
  .eq('discord_id', interaction.user.id)
  .single();

// Người chơi đã thắng
const { data: updated } = await db
  .from('players')
  .update({
    level: player.level + 1,
    xp: player.xp + xpGain
  })
  .eq('id', player.id);
```

Mỗi hành động (tấn công, phòng thủ, hồi máu) cập nhật chỉ số trong database. Và sau đó bạn render lại ảnh với chỉ số mới.

### Interactions : các nút gameplay

Game sử dụng **button interactions** cho các hành động trong chiến đấu:

```typescript
{
  type: 1,  // ActionRow
  components: [
    {
      type: 2,  // Button
      style: 1,  // Primary (xanh dương)
      label: 'Attack',
      custom_id: 'battle_attack'
    },
    {
      type: 2,
      style: 2,  // Secondary (xám)
      label: 'Defend',
      custom_id: 'battle_defend'
    }
  ]
}
```

Khi bạn bấm "Attack", Discord POST một interaction với `custom_id: 'battle_attack'`. Handler route nó:

```typescript
if (interaction.type === 3) {
  // Component interaction (bấm nút, v.v.)
  const customId = interaction.data.custom_id;

  if (customId === 'battle_attack') {
    return await handleAttack(interaction, env);
  }
  if (customId === 'battle_defend') {
    return await handleDefend(interaction, env);
  }
}
```

Và boom, bạn tính sát thương, cập nhật database, render lại ảnh, gửi đi.

Đó là một game turn-based hoàn chỉnh không cần bất kỳ kết nối liên tục nào. Chỉ HTTP stateless. Hoàn toàn điên rồ xD

## Supabase : DB dành cho Workers

Các database truyền thống (PostgreSQL, MySQL, MongoDB) được thiết kế cho kết nối TCP liên tục. Bạn mở socket, giữ kết nối, gửi truy vấn. Vấn đề: **Cloudflare Workers không hỗ trợ kết nối TCP liên tục**. Mỗi request là một tiến trình tạm thời. Ngay khi bạn trả lời client, Worker biến mất.

Bạn không thể làm thế này:

```typescript
// Cái này KHÔNG chạy trên Workers
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // kết nối TCP liên tục = chết
```

Và ngay cả driver PostgreSQL gốc như `pg` hay `postgres.js` cũng dùng kết nối TCP. Trên Workers, chúng bị crash.

**Supabase giải quyết tất cả.**

Supabase là REST API trên nền PostgreSQL. Bạn thực hiện các request HTTP thông thường. Mỗi lần gọi độc lập, không cần kết nối liên tục, không cần quản lý trạng thái. Hoàn toàn phù hợp với mô hình serverless.

```typescript
// Cái này chạy HOÀN HẢO trên Workers
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

Client Supabase (`@supabase/supabase-js`) sử dụng `fetch` bên dưới. Và `fetch` là native trên Workers. Zero cấu hình, zero driver, zero kết nối liên tục.

| Database | Tương thích Workers ? | Tại sao |
| --- | --- | --- |
| **Supabase** | ✅ Có | REST API không trạng thái, HTTP thuần |
| **PlanetScale (MySQL)** | ⚠️ Một phần | Chỉ kết nối HTTPS, không có transaction dài |
| **Neon** | ⚠️ Một phần | Branch serverless nhưng cần driver TCP |
| **Turso (libSQL)** | ⚠️ Một phần | HTTP khả thi nhưng giới hạn |
| **Prisma/Prisma Postgres** | ❌ Không | Cần TCP liên tục |
| **MongoDB Atlas** | ❌ Không | Driver TCP, không có REST API gốc |
| **Redis (Upstash)** | ✅ Có | REST API HTTP |

Lợi thế thực sự của Supabase không chỉ là DB -- mà là toàn bộ hệ sinh thái được thiết kế edge-first:

- **Auth** : REST API để quản lý session, hoạt động không trạng thái
- **Storage** : Upload/download file qua HTTP
- **Realtime** : WebSocket tùy chọn, nhưng bạn cũng có thể poll qua REST
- **Row Level Security** : rules bảo mật nằm trong DB, không phải backend

Với bot Discord serverless, Supabase là lựa chọn đơn giản và đáng tin cậy nhất. Không cần cấu hình driver, không cần duy trì kết nối, không có timeout. Chỉ các request HTTP.

Nếu bạn muốn một ví dụ thực tế, hãy xem Nibi ở trên: code lưu trữ chỉ đơn giản là `readJson()` và `writeJson()` trên Supabase. Không migration, không schema phức tạp, không cấu hình gì cả. Chạy ngay. Và nếu bot của bạn lớn lên, bạn có thể chuyển sang truy vấn SQL thực sự mà không cần đổi provider.

## Polyfills : khi Node muốn chạy trên Workers

Một số package mong đợi API Node. Kuromoji (parser kanji) sử dụng `XMLHttpRequest`. Workers có `fetch`, không phải `XMLHttpRequest`.

Giải pháp đơn giản: thêm polyfill ở đầu index.ts:

```typescript
// Polyfill XMLHttpRequest cho kuromoji
if (!globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest = class {
    // Stub tối thiểu
  } as any;
}
```

Hoặc tạo một module riêng:

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

Đó là hack cơ bản, nhưng nó hoạt động.

## Hướng tới một package npm : hono-discord-interactions

Làm thủ công, tạo một bot là rất nhiều boilerplate:

*   Xác minh chữ ký Discord
*   Route các loại interaction
*   Xử lý commands, components, modals
*   Trả về JSON hợp lệ

Chúng ta có thể trừu tượng hóa tất cả vào một package npm. Kiểu:

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

Bùm. 20 dòng thay vì 200. Nó sẽ giảm Nibi xuống một nửa dễ dàng.

Ý tưởng để sau xD

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

URL kết quả: `https://mon-bot.workers.dev/interactions`

Chi phí: **miễn phí** đến 100k request/ngày. Quá mức: $0.50/triệu.

Spoiler: bạn sẽ không bao giờ dùng hết 100k request trừ khi bạn có 10.000 người dùng hoạt động.

### Vercel

```plaintext
npm run vercel:deploy
```

URL: `https://mon-bot-xyz.vercel.app/api/interactions`

Tương tự, miễn phí.

### Cả hai cùng lúc

Hono chạy được ở mọi nơi. Bạn có thể deploy cùng một code lên cả Cloudflare VÀ Vercel. Hữu ích cho dự phòng hoặc thử nghiệm trước khi chọn.

## Checklist nhanh

1.  Tạo Application trên Discord Developer Portal
2.  Sao chép PUBLIC\_KEY, BOT\_TOKEN, APP\_ID
3.  Tạo project:
4.  Viết index.ts (xác minh chữ ký + routing)
5.  Đăng ký slash commands (một lần):
6.  Deploy:
7.  Đặt URL trong Discord (Developer Portal → Application → Interactions Endpoint URL)
8.  Discord kiểm tra kết nối (bạn phải trả lời PING)
9.  Mời bot vào server
10.  Xong

## Ưu điểm vs Hạn chế

**Ưu điểm**

*   Rẻ (miễn phí đến 100k req/ngày)
*   Co giãn (không cần quản lý kết nối)
*   Đơn giản (không boilerplate WebSocket)
*   Nhanh (Cloudflare = server tại edge)
*   Di động (code Hono = nhiều host)

**Hạn chế**

*   Không có sự kiện server thời gian thực (thành viên tham gia, role được thêm, tin nhắn bị xóa, v.v.) -- bạn chỉ nhận được interactions (slash commands, buttons, modals)
*   Timeout 3 giây để trả lời -- nếu không Discord hiển thị "Application did not respond"
*   Nếu bạn cần sự kiện thực sự -- cần một webhook HTTP riêng hoặc kết nối WebSocket phụ trợ

Với 90% bot (tất cả dựa trên slash commands)? Ổn cả.

## Kết luận

Tôi đã dành khá nhiều thời gian để tối ưu KonosubaRPG và Nibi nhằm tiết kiệm càng nhiều request càng tốt, hoặc giảm thời gian xử lý nóng, hoặc giảm boot cold. Kết quả là tôi có hiệu suất khá ấn tượng trên hầu hết mọi thứ.
Cần biết rằng tôi đã bắt đầu cloud hóa (tôi cũng không biết từ này có tồn tại không) phần lớn các dự án của mình vì tôi cực kỳ lười tiếp tục tự host chúng trên VM cá nhân. Thực sự, tôi nghĩ chính Github Actions đã cứu tôi. Workers cũng vậy, nhưng thực ra khi tôi thấy mình có thể tạo daemon với Github Actions và schedule, điều đó thực sự đã cứu tôi.

Tôi có lẽ sẽ viết một bài về dự án tên là [email-autoreply](https://github.com/fox3000foxy/email-autoreply/), vì vậy hãy đăng ký theo dõi RSS để xem nó ra mắt sắp tới :)).

**3 điều cần nhớ:**

1.  **Interaction endpoints = HTTP serverless** -- Không WebSocket, không kết nối liên tục. Discord POST, bạn trả lời. Miễn phí trên Cloudflare.
2.  **Hono là công cụ hoàn hảo** -- Framework nhẹ (12KB), đa runtime, zero dependencies. Code giống hệt trên Cloudflare, Vercel, Node, mọi nơi.
3.  **Render ảnh trên Workers = điên rồ** -- Satori + Resvg (Wasm) cho phép bạn tạo UI động bằng JSX và chuyển đổi thành PNG trong \<100ms. Một game hoàn chỉnh có thể chạy trên nó.

Thật bệnh hoạn xD

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
