---
title: "Bot Discord 100% serverless : Hono + Cloudflare Workers"
description: Cách tôi thay bot Discord tốn 50€/tháng bằng
  0 euro -- interaction endpoint, Hono, Workers, render ảnh thời gian
  thực, và game đầy đủ không WebSocket.
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
author_sig: "vEL8MBo8CiWoC8J8BRlpWEAwY+GJSF9bwWiS4XMnXpwDhQmwVYdDOy9ZNByU1m9J9TibeHYPO4WNbNgNczRCcQ=="
---

## Bot Discord 100% serverless : Hono + Cloudflare Workers = 💸 0 đồng

Tôi từng dành vài tháng duy trì bot Discord cổ điển trên máy của mình.

Kết nối WebSocket luôn mở. Bot tự reconnect lúc 3h sáng. Bot crash vì tôi nhìn cừu chằm chằm sai cách. Hóa đơn leo thang.

Một ngày tôi phát hiện : **vì sao phải duy trì kết nối**? Discord có thể POST đúng sự kiện bạn quan tâm. Bạn trả lời, xong.

Từ 2021, Discord cung cấp **interaction endpoint**.

Đó chỉ là HTTP. Bạn làm việc không WebSocket, không trạng thái bền vững. Bạn nhận yêu cầu, gửi JSON, xong. Yêu cầu tiếp theo tự tới.

Và hay nhất : Cloudflare Workers **miễn phí** tới 100k yêu cầu/ngày. Với 90% bot, là 0€/tháng.

Bài này chỉ bạn cách làm bot Discord không WebSocket bằng **Hono** (framework web siêu nhẹ) và **Cloudflare Workers**. Tôi sẽ cho bạn thấy hai dự án thật : **Nibi** (bot học tiếng Nhật, TTS, ngầu) và **Konosuba-RPG** (game Discord _đầy đủ_ với render ảnh thời gian thực).

## WebSocket so với Interaction Endpoint : vì sao ý cũ tệ

Tưởng tượng game Minecraft nơi bạn phải giữ kết nối mở ngay cả khi không chơi.

Và máy chủ tự reconnect mỗi lần crash. Bạn phải quản lý timeout, reconnect lũy thừa, cả đống boilerplate rác ta ghét. Chỉ để nhận tương tác.

Interaction endpoint thì ngược lại. Discord POST lên URL của bạn. Bạn trả lời. Xong.

Nếu máy chủ của bạn crash? Discord retry 2-3 lần rồi bỏ qua. Không drama.

**Chi phí trước** : 50€/tháng trên Heroku chỉ để một tiến trình Node sống.

**Chi phí sau** : 0€/tháng trên Cloudflare tới 100k yêu cầu/ngày.

## Kiến trúc : thực chất là gì?

Discord POST yêu cầu lên endpoint của bạn.

```plaintext
Discord: "Ê! Người dùng vừa bấm /ping!"
      ↓
   URL của bạn (Cloudflare Worker)
      ↓
 Bạn kiểm tra đúng là Discord (kiểm tra chữ ký)
      ↓
 Bạn phân tích kiểu tương tác
      ↓
 Bạn chạy handler
      ↓
 Bạn trả về JSON
      ↓
Discord: "Hay, tôi sẽ hiện nó cho người dùng"
```

Đó là HTTP thuần, với stack tối thiểu và dễ đọc.

## Hono + Cloudflare Workers : combo tiết kiệm

**Hono** là framework web nặng 12KB. Nó chạy khắp nơi : Cloudflare Workers, Vercel, AWS Lambda, Deno, Bun... cùng mã khắp nơi.

Cloudflare Workers là compute ở biên. Yêu cầu của bạn tới máy chủ gần nhất. Thời gian phản hồi : \<100ms. Chi phí : miễn phí tới 100k yêu cầu/ngày.

Combo Hono + Cloudflare là cặp hoàn hảo cho bot Discord.

Đây là mã tối thiểu của một bot đầy đủ :

```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. Lấy header
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. Kiểm tra đúng là Discord (không phải spam)
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3. Phân tích những gì nó gửi
  const interaction = JSON.parse(body);

  // 4. Trả lời theo kiểu
  if (interaction.type === 1) {
    // Discord kiểm tra (PING)
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

30 dòng đủ cho bot chạy được.

Bạn quên `bot.login()`, event emitter và callback hell. Bạn chỉ giữ HTTP.

Để deploy lên Cloudflare :

```plaintext
npm install -D wrangler
npx wrangler deploy
```

Bùm. Bạn có URL kiểu `https://mon-bot.workers.dev/interactions`.

Bạn đặt nó vào Discord Developer Portal dưới "INTERACTIONS ENDPOINT URL", và Discord bắt đầu gửi tương tác của bạn tới đó.

## Kiểm tra chữ ký : không yêu cầu giả mạo

Discord ký mỗi yêu cầu bằng khóa công khai. Nếu bạn nhận yêu cầu chữ ký sai? Đó là spam. Bỏ qua và tiếp tục.

Gói `discord-interactions` làm việc này :

```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // văn bản thô chính xác (không phải JSON đã parse!)
  signature,         // header x-signature-ed25519
  timestamp,         // header x-signature-timestamp
  publicKey          // từ Discord Dev Portal
);
```

**Bẫy quan trọng** : chữ ký phụ thuộc body _chính xác_. Nếu bạn parse JSON rồi stringify lại, hay log body, bạn phá chữ ký.

Kiểm tra trước. Parse sau. Thứ tự mới là điều quan trọng.

## Trường hợp 1 : Nibi (bot học tiếng Nhật)

Nibi là bot Discord học tiếng Nhật. Lệnh đơn giản :

*   `/dictionary kanji` → hiện định nghĩa
*   `/pronounce テキスト` → tạo TTS (text-to-speech)
*   `/hello` → tin nhắn chào

Mỗi lệnh là một tệp TypeScript :

```plaintext
src/commands/
├── dictionary.ts
├── pronounce.ts
├── hello.ts
└── ...
```

Một lệnh triển khai interface này :

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

### Lệnh /pronounce : bắt bot nói

Đây là cái hay ho. Bạn gửi văn bản (romaji, hiragana, kanji, bất cứ gì), bot đổi nó sang hiragana, tạo TTS qua VOICEVOX hay Google TTS, và gửi tin nhắn thoại trên Discord.

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
      // 1. Đổi romaji → hiragana bằng Kuroshiro
      const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });

      // 2. Tạo âm thanh TTS
      const audioBuffer = await generateTTS(hiragana);

      // 3. Tải tệp lên Discord
      const uploadFilename = await uploadToDiscord(
        audioBuffer,
        interaction.channel.id,
        env.BOT_TOKEN
      );

      // 4. Gửi tin nhắn kèm âm thanh
      await sendVoiceMessage(
        interaction.channel.id,
        uploadFilename,
        audioBuffer.length / 16000,  // độ dài tính bằng giây
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
          content: 'Lỗi : không tạo được âm thanh xD',
          flags: 64  // ephemeral (tin nhắn riêng tư)
        }
      };
    }
  }
};
```

Thật điên : bạn gọi API ngoài, tải tệp lên Discord, gửi tin nhắn kèm tệp. Tất cả không WebSocket, chỉ HTTP.

### Bền vững với Supabase

Nibi dùng Supabase làm key-value store. Để kiểm tra người dùng đã đăng ký chưa :

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

Rất cơ bản (không truy vấn SQL thật, chỉ JSON), nhưng chạy được. Với bot nhỏ là hoàn hảo.

## Trường hợp 2 : Konosuba-RPG (game Discord render ảnh)

OK cái này điên thật.

Konosuba-RPG là **game đầy đủ** trên Discord. Bạn đánh mob, nhận XP, trang bị phụ kiện, lên cấp. Mỗi trận tạo một **ảnh** thời gian thực. Bạn tránh spritesheet render trước. Ảnh được dựng động từ stat người chơi, mob, và trạng thái trận.

Và ảnh sinh ra trong \<500ms trên Cloudflare Workers. Theo nghĩa đen.

### Kiến trúc render

```plaintext
Discord (bạn bấm "Attack")
    ↓
Cloudflare Worker nhận tương tác
    ↓
Cập nhật trạng thái game (XP, HP, v.v.)
    ↓
Tạo JSX bằng Satori
    ↓
Đổi SVG → PNG bằng Resvg (Wasm)
    ↓
Tải ảnh lên Discord
    ↓
Gửi tin nhắn kèm ảnh
```

Tất cả dưới một giây. Thật kinh ngạc.

### Render ảnh phía Workers

Konosuba dùng **Satori** (JSX → SVG) và **Resvg** (SVG → PNG) :

```typescript
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. Tạo JSX cho UI
  const jsx = (
    <div style="{{" display="" 'flex',="" gap:="" '20px'="" }}="">
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

Bạn nắm sức mạnh chưa? Đẹp đơn thuần.

### Trạng thái game và tiến trình

Dữ liệu người chơi nằm trong Supabase :

```typescript
const player = await db
  .from('players')
  .select('*')
  .eq('discord_id', interaction.user.id)
  .single();

// Người chơi thắng
const { data: updated } = await db
  .from('players')
  .update({
    level: player.level + 1,
    xp: player.xp + xpGain
  })
  .eq('id', player.id);
```

Mỗi hành động (tấn công, phòng thủ, hồi máu) cập nhật stat trong DB. Rồi bạn tạo lại ảnh với stat mới.

### Tương tác : nút bấm gameplay

Game dùng **tương tác nút bấm** cho hành động trận :

```typescript
{
  type: 1,  // ActionRow
  components: [
    {
      type: 2,  // Button
      style: 1,  // Primary (xanh)
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

Khi bạn bấm "Attack", Discord POST tương tác với `custom_id: 'battle_attack'`. Handler định tuyến nó :

```typescript
if (interaction.type === 3) {
  // Tương tác thành phần (bấm nút, v.v.)
  const customId = interaction.data.custom_id;

  if (customId === 'battle_attack') {
    return await handleAttack(interaction, env);
  }
  if (customId === 'battle_defend') {
    return await handleDefend(interaction, env);
  }
}
```

Và bùm, bạn tính sát thương, cập nhật DB, tạo lại ảnh, gửi đi.

Đó là game theo lượt đầy đủ không cần chút bền vững kết nối nào. Chỉ HTTP stateless. Hoàn toàn điên.

## Supabase : DB làm cho Workers

Cơ sở dữ liệu cổ điển (PostgreSQL, MySQL, MongoDB) thiết kế cho kết nối TCP bền vững. Bạn mở socket, giữ kết nối mở, gửi truy vấn. Vấn đề : **Cloudflare Workers không hỗ trợ kết nối TCP bền vững**. Mỗi yêu cầu là tiến trình phù du. Hễ bạn trả lời client, Worker biến mất.

Bạn không thể làm vầy :

```typescript
// Việc này KHÔNG chạy trên Workers
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // kết nối TCP bền vững = chết
```

Và ngay cả driver PostgreSQL gốc như `pg` hay `postgres.js` cũng dùng kết nối TCP. Trên Workers, chúng sập.

**Supabase giải quyết tất cả.**

Supabase là API REST trên PostgreSQL. Bạn gửi yêu cầu HTTP bình thường. Mỗi gọi độc lập, không kết nối bền vững, không trạng thái cần quản lý. Hoàn toàn hợp mô hình serverless.

```typescript
// Việc này chạy HOÀN HẢO trên Workers
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

Client Supabase (`@supabase/supabase-js`) dùng `fetch` bên dưới. Và `fetch` gốc trên Workers. Không cấu hình, không driver, không kết nối bền vững.

| Cơ sở dữ liệu | Tương thích Workers? | Vì sao |
| --- | --- | --- |
| **Supabase** | ✅ Có | API REST không trạng thái, HTTP thuần |
| **PlanetScale (MySQL)** | ⚠️ Một phần | Chỉ kết nối HTTPS, không giao dịch dài |
| **Neon** | ⚠️ Một phần | Nhánh serverless nhưng cần driver TCP |
| **Turso (libSQL)** | ⚠️ Một phần | HTTP khả thi nhưng giới hạn |
| **Prisma/Prisma Postgres** | ❌ Không | Đòi TCP bền vững |
| **MongoDB Atlas** | ❌ Không | Driver TCP, không API REST gốc |
| **Redis (Upstash)** | ✅ Có | API REST HTTP |

Lợi thế thật của Supabase không chỉ là DB -- mà là cả hệ sinh thái nghĩ edge-first :

- **Auth** : API REST quản lý phiên, chạy không trạng thái
- **Storage** : Tải lên/tải xuống tệp qua HTTP
- **Realtime** : WebSocket tùy chọn, nhưng bạn cũng có thể poll qua REST
- **Row Level Security** : quy tắc bảo mật nằm trong DB, không trong backend của bạn

Với bot Discord serverless, Supabase là lựa chọn đơn giản và đáng tin nhất. Bạn không cấu hình driver, không duy trì kết nối, không quản lý timeout. Bạn chỉ gửi yêu cầu HTTP.

Nếu bạn muốn ví dụ thật, xem Nibi ở trên : mã bền vững đúng là `readJson()` và `writeJson()` trên Supabase. Bạn khởi động không migration, không schema phức tạp, không config nặng. Chạy ngay. Và nếu bot của bạn lớn lên, bạn chuyển sang truy vấn SQL thật mà không đổi provider.

## Polyfill : khi Node muốn chạy trên Workers

Vài gói mong đợi API Node. Kuromoji (trình phân tích kanji) dùng `XMLHttpRequest`. Workers có `fetch`, không có `XMLHttpRequest`.

Giải pháp đơn giản : thêm polyfill lên đầu index.ts :

```typescript
// Polyfill XMLHttpRequest cho kuromoji
if (!globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest = class {
    // Stub tối thiểu
  } as any;
}
```

Hay làm module chuyên :

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

Đó là hack cơ bản, nhưng chạy.

## Hướng tới gói npm : hono-discord-interactions

Làm tay, bot là nhiều boilerplate :

*   Kiểm tra chữ ký Discord
*   Định tuyến kiểu tương tác
*   Quản lý lệnh, component, modal
*   Trả về JSON hợp lệ

Ta có thể trừu tượng tất cả vào gói npm. Kiểu :

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

Bùm. 20 dòng thay vì 200. Việc đó giảm Nibi một nửa dễ dàng.

Ý tưởng để sau.

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

URL kết quả : `https://mon-bot.workers.dev/interactions`

Chi phí : **miễn phí** tới 100k yêu cầu/ngày. Vượt : $0.50/triệu.

Tiết lộ : bạn sẽ không bao giờ xài hết 100k yêu cầu trừ khi có 10 000 người dùng hoạt động.

### Vercel

```plaintext
npm run vercel:deploy
```

URL : `https://mon-bot-xyz.vercel.app/api/interactions`

Cũng vậy, miễn phí.

### Cả hai cùng lúc

Hono chạy khắp nơi. Bạn có thể deploy cùng mã lên Cloudflare VÀ Vercel. Hữu ích cho dự phòng hay thử trước khi chọn.

## Checklist nhanh

1.  Tạo Application trên Discord Developer Portal
2.  Chép PUBLIC\_KEY, BOT\_TOKEN, APP\_ID
3.  Tạo dự án :
4.  Viết index.ts (kiểm tra chữ ký + định tuyến)
5.  Đăng ký slash command (một lần) :
6.  Deploy :
7.  Đặt URL vào Discord (Developer Portal → Application → Interactions Endpoint URL)
8.  Discord kiểm tra kết nối (bạn phải trả lời PING)
9.  Mời bot lên máy chủ
10.  Xong

## Ưu điểm so với Giới hạn

**Ưu điểm**

*   Chi phí tối thiểu (miễn phí tới 100k req/ngày)
*   Mở rộng được (không quản lý kết nối)
*   Đơn giản (không boilerplate WebSocket)
*   Nhanh (Cloudflare = máy chủ ở biên)
*   Di động (mã Hono = nhiều host)

**Giới hạn**

*   Bạn chỉ nhận tương tác (slash command, nút, modal), không có sự kiện máy chủ thời gian thực (thành viên tham gia, vai trò thêm, tin nhắn xóa, v.v.)
*   Timeout 3 giây để trả lời -- nếu không Discord hiện "Application did not respond"
*   Nếu bạn cần event thật -- cần webhook HTTP riêng hay kết nối WebSocket phụ

Với 90% bot (mọi thứ dựa trên slash command)? Ổn.

## Kết luận

Tôi đã dành khá nhiều thời gian tối ưu KonosubaRPG và Nibi để tiết kiệm hoặc nhiều yêu cầu nhất có thể, hoặc giảm thời gian xử lý nóng, hoặc giảm khởi động lạnh. Kết quả, tôi có hiệu năng khá ngon trên gần như mọi thứ.
Phải biết là tôi đã bắt đầu cloud hóa (tôi thậm chí không biết có từ này không) hầu hết dự án của mình vì tôi lười khủng khiếp việc tiếp tục host chúng trên VM của mình. Thật lòng, tôi nghĩ chính Github Actions đã cứu mạng tôi. Workers cũng vậy, nhưng thực ra khi tôi thấy mình có thể làm daemon bằng Github Actions và schedule, việc đó thực sự cứu tôi.

Tôi có lẽ sẽ viết bài về dự án tên [email-autoreply](https://github.com/fox3000foxy/email-autoreply/), nên hãy đăng ký feed RSS để thấy nó ra mắt sớm :)).

**3 điểm cần nhớ :**

1.  **Interaction endpoint = HTTP serverless** -- không WebSocket, không kết nối bền vững. Discord POST, bạn trả lời. Miễn phí trên Cloudflare.
2.  **Hono là công cụ hoàn hảo** -- Framework nhẹ (12KB), đa runtime, không phụ thuộc. Mã giống hệt trên Cloudflare, Vercel, Node, khắp nơi.
3.  **Render ảnh trên Workers = điên** -- Satori + Resvg (Wasm) cho bạn dựng UI động bằng JSX và đổi sang PNG trong \<100ms. Game đầy đủ có thể chạy trên đó.

Điên thật.

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
