---
title: "Discord bot 100% serverless : Hono + Cloudflare Workers"
description: Bagaimana saya mengganti bot Discord yang menghabiskan 50€/bulan menjadi
  nol euro -- interaction endpoints, Hono, Workers, render gambar real-time,
  dan game lengkap tanpa WebSocket.
date: 2026-05-29authors:
  - fox3000foxy
tags:
  - discord
  - cloudflare
  - serverless
  - typescript
  - bots
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "LElzB7vGcERhTEOX6sz/R62n2vZTV0M3j+JZ8MBTf1cN6419hjEGQrLhfMvtr1ybCHJY3qGjs7NMhMcX+KIXSA=="
---

## Discord bot 100% serverless : Hono + Cloudflare Workers = 💸 nol

Saya menghabiskan beberapa bulan memelihara bot Discord biasa di mesin saya sendiri.

Koneksi WebSocket selalu terbuka. Bot reconnect sendiri jam 3 pagi. Bot crash karena saya lihat dompet salah. Tagihan membengkak.

Suatu hari saya menemukan: **kenapa harus maintain koneksi** ? Discord bisa POST langsung hal-hal yang kamu minati. Kamu jawab, selesai.

Sejak 2021, Discord menyediakan **interaction endpoints**.

Ini cuma HTTP. Tanpa WebSocket. Tanpa state persisten. Kamu terima request, kirim JSON, selesai. Request berikutnya datang sendiri.

Dan yang terbaik: Cloudflare Workers itu **gratis** sampai 100k request/hari. Untuk 90% bot, ini 0€/bulan.

Artikel ini menunjukkan cara membuat bot Discord tanpa WebSocket menggunakan **Hono** (framework web ultra-ringan) dan **Cloudflare Workers**. Saya akan tunjukkan dua proyek nyata: **Nibi** (bot belajar bahasa Jepang, TTS, keren) dan **Konosuba-RPG** (game Discord _lengkap_ dengan render gambar real-time xD).

## WebSocket vs. Interaction Endpoints : kenapa dulu itu ide buruk

Bayangkan game Minecraft dimana kamu harus menjaga koneksi tetap terbuka bahkan saat tidak bermain.

Dan server reconnect otomatis setiap kali crash. Kamu harus handle timeout, exponential backoff, semua boilerplate menyebalkan yang kita benci. Hanya untuk menerima interaksi.

Interaction endpoints kebalikannya. Discord POST ke URL kamu. Kamu jawab. Selesai.

Jika server kamu crash? Discord retry 2-3 kali lalu lanjut. Zero drama.

**Biaya dulu** : 50€/bulan di Heroku cuma untuk menjaga proses Node tetap hidup.

**Biaya sekarang** : 0€/bulan di Cloudflare sampai 100k request/hari.

## Arsitekturnya : sebenarnya apa sih?

Discord POST request ke endpoint kamu.

```plaintext
Discord: "Eh! User klik /ping!"
      ↓
   URL kamu (Cloudflare Worker)
      ↓
Kamu verifikasi itu benar-benar Discord (signature check)
      ↓
Kamu parse tipe interaksi
      ↓
Kamu eksekusi handler
      ↓
Kamu return JSON
      ↓
Discord: "OK, saya tampilkan itu ke user"
```

Ini HTTP murni. Tanpa sihir. Tanpa library berat.

## Hono + Cloudflare Workers : combo hemat

**Hono** adalah framework web seberat 12KB. Jalan di mana saja: Cloudflare Workers, Vercel, AWS Lambda, Deno, Bun... kode yang sama di mana saja.

Cloudflare Workers adalah compute di edge. Request kamu tiba di server terdekat. Response time: \<100ms. Biaya: gratis sampai 100k request/hari.

Kombo Hono + Cloudflare adalah pasangan sempurna untuk bot Discord.

Ini kode minimal bot lengkap:

```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. Ambil headers
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. Verifikasi itu benar-benar Discord (bukan spam)
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3. Parse apa yang dikirim
  const interaction = JSON.parse(body);

  // 4. Jawab sesuai tipe
  if (interaction.type === 1) {
    // Discord test (PING)
    return c.json({ type: 1 });
  }

  if (interaction.type === 2) {
    // Ini slash command
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

Kayak, 30 baris dan jadi bot fungsional.

Ga ada `bot.login()`. Ga ada event emitter. Ga ada callback hell. Cuma HTTP.

Untuk deploy ke Cloudflare:

```plaintext
npm install -D wrangler
npx wrangler deploy
```

Boom. Kamu punya URL kayak `https://mon-bot.workers.dev/interactions`.

Kamu masukin itu ke Discord Developer Portal di "INTERACTIONS ENDPOINT URL", dan Discord mulai kirim interaksi kamu ke sana.

## Verifikasi signature : no fake requests

Discord menandatangani setiap request dengan public key. Jika kamu terima request dengan signature salah? Itu spam. Abaikan dan lanjut.

Paket `discord-interactions` yang handle:

```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // teks mentah persis (bukan JSON yang sudah diparse!)
  signature,         // header x-signature-ed25519
  timestamp,         // header x-signature-timestamp
  publicKey          // dari Discord Dev Portal
);
```

**Jebakan penting**: signature tergantung body _yang persis_. Jika kamu parse JSON lalu re-stringify, atau jika kamu log body, signature-nya rusak.

Verifikasi dulu. Parse setelahnya. Urutannya penting.

## Kasus 1 : Nibi (bot belajar bahasa Jepang)

Nibi adalah bot Discord untuk belajar bahasa Jepang. Perintah sederhana:

*   `/dictionary kanji` → menampilkan definisi
*   `/pronounce テキスト` → generate TTS (text-to-speech)
*   `/hello` → pesan sambutan

Setiap perintah adalah file TypeScript:

```plaintext
src/commands/
├── dictionary.ts
├── pronounce.ts
├── hello.ts
└── ...
```

Sebuah command mengimplementasikan interface ini:

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

### Command /pronounce : bikin bot bicara

Ini yang agak gila. Kamu kirim teks (romaji, hiragana, kanji, apapun), bot mengonversinya ke hiragana, generate TTS via VOICEVOX atau Google TTS, dan kirim pesan audio ke Discord.

```typescript
const pronounce: Command = {
  data: {
    name: 'pronounce',
    description: 'Generate TTS untuk teks bahasa Jepang',
    options: [
      {
        type: 3,  // STRING
        name: 'text',
        description: 'Teks yang akan diucapkan',
        required: true
      }
    ]
  },

  async execute(interaction, env) {
    const text = interaction.data.options[0].value;

    try {
      // 1. Konversi romaji → hiragana dengan Kuroshiro
      const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });

      // 2. Generate audio TTS
      const audioBuffer = await generateTTS(hiragana);

      // 3. Upload file ke Discord
      const uploadFilename = await uploadToDiscord(
        audioBuffer,
        interaction.channel.id,
        env.BOT_TOKEN
      );

      // 4. Kirim pesan dengan audio
      await sendVoiceMessage(
        interaction.channel.id,
        uploadFilename,
        audioBuffer.length / 16000,  // durasi dalam detik
        env.BOT_TOKEN
      );

      return {
        type: 4,
        data: { content: `Pengucapan untuk "${text}"` }
      };
    } catch (err) {
      return {
        type: 4,
        data: {
          content: 'Error : gagal generate audio xD',
          flags: 64  // ephemeral (pesan pribadi)
        }
      };
    }
  }
};
```

Gila sih: kamu panggil API eksternal, upload file ke Discord, kirim pesan dengan file. Semua tanpa WebSocket, cuma HTTP.

### Persistensi dengan Supabase

Nibi menggunakan Supabase sebagai key-value store. Untuk cek apakah user terdaftar:

```typescript
const DatabaseUtils = new DatabaseUtils({
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY
});

const users = await DatabaseUtils.readJson('users');
const user = users.find(u => u.id === interaction.member.user.id);

if (!user) {
  // Tambah user
  users.push({ id: interaction.member.user.id, verified: true });
  await DatabaseUtils.writeJson('users', users);
}
```

Ini sangat basic (bukan SQL query beneran, cuma JSON), tapi berhasil. Untuk bot kecil ini sempurna.

## Kasus 2 : Konosuba-RPG (game Discord dengan render gambar)

OK yang ini gila.

Konosuba-RPG adalah **game lengkap** di Discord. Kamu lawan mob, dapat XP, pakai aksesoris, naik level. Setiap battle menghasilkan **gambar** real-time. Bukan spritesheet pre-render. Gambar dikomposisi secara dinamis dari stats pemain, mob, dan status pertarungan.

Dan gambar digenerate dalam \<500ms di Cloudflare Workers. Beneran.

### Arsitektur render

```plaintext
Discord (kamu klik "Attack")
    ↓
Cloudflare Worker menerima interaksi
    ↓
Update game state (XP, HP, dll)
    ↓
Generate JSX dengan Satori
    ↓
Konversi SVG → PNG dengan Resvg (Wasm)
    ↓
Upload gambar ke Discord
    ↓
Kirim pesan dengan gambar
```

Semua dalam kurang dari satu detik. Gila banget.

### Render gambar di sisi Workers

Konosuba menggunakan **Satori** (JSX → SVG) dan **Resvg** (SVG → PNG):

```typescript
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. Buat JSX untuk UI
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

Kamu nulis JSX biasa. Jadi SVG. SVG jadi PNG. \<100ms di Cloudflare Worker.

Bayangin kekuatannya? Ini... indah banget xD

### Game state dan progresi

Data pemain disimpan di Supabase:

```typescript
const player = await db
  .from('players')
  .select('*')
  .eq('discord_id', interaction.user.id)
  .single();

// Pemain menang
const { data: updated } = await db
  .from('players')
  .update({
    level: player.level + 1,
    xp: player.xp + xpGain
  })
  .eq('id', player.id);
```

Setiap aksi (serang, bertahan, heal) mengupdate stats di database. Lalu kamu regenerate gambar dengan stats baru.

### Interaksi : tombol gameplay

Game menggunakan **button interactions** untuk aksi dalam pertarungan:

```typescript
{
  type: 1,  // ActionRow
  components: [
    {
      type: 2,  // Button
      style: 1,  // Primary (biru)
      label: 'Attack',
      custom_id: 'battle_attack'
    },
    {
      type: 2,
      style: 2,  // Secondary (abu-abu)
      label: 'Defend',
      custom_id: 'battle_defend'
    }
  ]
}
```

Saat kamu klik "Attack", Discord POST interaksi dengan `custom_id: 'battle_attack'`. Handler me-routenya:

```typescript
if (interaction.type === 3) {
  // Component interaction (klik tombol, dll)
  const customId = interaction.data.custom_id;

  if (customId === 'battle_attack') {
    return await handleAttack(interaction, env);
  }
  if (customId === 'battle_defend') {
    return await handleDefend(interaction, env);
  }
}
```

Dan boom, kamu hitung damage, update database, regen gambar, kirim.

Ini game turn-based lengkap tanpa persistence koneksi sama sekali. Cuma HTTP stateless. Benar-benar gila xD

## Supabase : DB yang dibuat untuk Workers

Database tradisional (PostgreSQL, MySQL, MongoDB) dirancang untuk koneksi TCP persisten. Kamu buka socket, jaga koneksi tetap terbuka, kirim query. Masalahnya: **Cloudflare Workers tidak mendukung koneksi TCP persisten**. Setiap request adalah proses ephemeral. Begitu kamu menjawab client, Worker-nya hilang.

Kamu ga bisa lakuin ini:

```typescript
// Ini GA BISA di Workers
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // koneksi TCP persisten = mati
```

Bahkan driver PostgreSQL native seperti `pg` atau `postgres.js` menggunakan koneksi TCP. Di Workers, mereka crash.

**Supabase menyelesaikan semua itu.**

Supabase adalah REST API di atas PostgreSQL. Kamu lakukan request HTTP biasa. Setiap panggilan independen, tanpa koneksi persisten, tanpa state yang perlu dikelola. Ini sangat cocok dengan model serverless.

```typescript
// Ini BERHASIL SEMPURNA di Workers
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

Client Supabase (`@supabase/supabase-js`) menggunakan `fetch` di dalamnya. Dan `fetch` adalah native di Workers. Zero konfigurasi, zero driver, zero koneksi persisten.

| Database | Kompatibel Workers ? | Kenapa |
| --- | --- | --- |
| **Supabase** | ✅ Ya | REST API tanpa state, HTTP murni |
| **PlanetScale (MySQL)** | ⚠️ Sebagian | Koneksi HTTPS saja, tidak ada transaksi panjang |
| **Neon** | ⚠️ Sebagian | Serverless branches tapi driver TCP diperlukan |
| **Turso (libSQL)** | ⚠️ Sebagian | HTTP dimungkinkan tapi terbatas |
| **Prisma/Prisma Postgres** | ❌ Tidak | Membutuhkan TCP persisten |
| **MongoDB Atlas** | ❌ Tidak | Driver TCP, tidak ada REST API native |
| **Redis (Upstash)** | ✅ Ya | REST API HTTP |

Keunggulan sebenarnya Supabase bukan cuma DB -- seluruh ekosistemnya dirancang edge-first:

- **Auth** : REST API untuk manage session, bekerja tanpa state
- **Storage** : Upload/download file via HTTP
- **Realtime** : WebSocket opsional, tapi kamu juga bisa poll via REST
- **Row Level Security** : aturan keamanan ada di DB, bukan di backend kamu

Untuk bot Discord serverless, Supabase adalah pilihan paling sederhana dan paling reliable. Tidak ada driver yang perlu dikonfigurasi, tidak ada koneksi yang perlu di-maintain, tidak ada timeout. Hanya request HTTP.

Jika kamu mau contoh nyata, lihat Nibi di atas: kode persistensi-nya literally `readJson()` dan `writeJson()` di Supabase. Tidak ada migrasi, tidak ada skema kompleks, tidak ada konfigurasi gila. Langsung jalan. Dan jika bot kamu menjadi besar, kamu migrasi ke SQL query beneran tanpa ganti provider.

## Polyfills : saat Node mau jalan di Workers

Beberapa package mengharapkan API Node. Kuromoji (parser kanji) menggunakan `XMLHttpRequest`. Workers punya `fetch`, bukan `XMLHttpRequest`.

Solusi sederhana: tambah polyfill di atas index.ts:

```typescript
// Polyfill XMLHttpRequest untuk kuromoji
if (!globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest = class {
    // Stub minimal
  } as any;
}
```

Atau buat module dedicated:

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

Ini hack basic, tapi berhasil.

## Menuju paket npm : hono-discord-interactions

Dengan cara manual, bikin bot itu banyak boilerplate:

*   Verifikasi signature Discord
*   Route tipe interaksi
*   Handle commands, components, modals
*   Return JSON valid

Kita bisa abstrak semua itu dalam satu paket npm. Kayak:

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

Boom. 20 baris daripada 200. Ini bakal ngurangin Nibi setengahnya dengan mudah.

Ide buat nanti xD

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

URL hasil: `https://mon-bot.workers.dev/interactions`

Biaya: **gratis** sampai 100k request/hari. Lebih dari itu: $0.50/juta.

Spoiler: kamu ga bakal pernah capai 100k request kecuali punya 10.000 user aktif.

### Vercel

```plaintext
npm run vercel:deploy
```

URL: `https://mon-bot-xyz.vercel.app/api/interactions`

Sama, gratis.

### Keduanya sekaligus

Hono jalan di mana saja. Kamu bisa deploy kode yang sama di Cloudflare DAN Vercel. Berguna untuk redundansi atau testing sebelum memilih.

## Checklist cepat

1.  Buat Application di Discord Developer Portal
2.  Copy PUBLIC\_KEY, BOT\_TOKEN, APP\_ID
3.  Buat project:
4.  Tulis index.ts (verif signature + routing)
5.  Daftarkan slash commands (sekali):
6.  Deploy:
7.  Masukkan URL di Discord (Developer Portal → Application → Interactions Endpoint URL)
8.  Discord test koneksi (kamu harus jawab PING)
9.  Invite bot ke server
10.  Selesai

## Kelebihan vs Kekurangan

**Kelebihan**

*   Murah (gratis sampai 100k req/hari)
*   Scalable (tanpa connection management)
*   Sederhana (tanpa WebSocket boilerplate)
*   Cepat (Cloudflare = server di edge)
*   Portabel (kode Hono = banyak host)

**Kekurangan**

*   Tidak ada event server real-time (member join, role ditambahkan, pesan dihapus, dll.) -- kamu hanya menerima interaksi (slash commands, buttons, modals)
*   Timeout 3 detik untuk merespon -- jika tidak, Discord tampilkan "Application did not respond"
*   Jika butuh event beneran -- perlu webhook HTTP terpisah atau koneksi WebSocket tambahan

Untuk 90% bot (semua berbasis slash commands)? Ini sudah cukup.

## Kesimpulan

Saya menghabiskan cukup banyak waktu mengoptimalkan KonosubaRPG dan Nibi untuk menghemat sebanyak mungkin request, atau mengurangi waktu prosesor panas, atau mengurangi cold boot. Hasilnya, saya punya performa gila di hampir semuanya.  
Perlu diketahui bahwa saya mulai cloudify (saya bahkan ga tau itu istilah beneran) sebagian besar proyek saya karena rasa males yang luar biasa untuk terus hosting di VM sendiri. Sungguh, saya rasa Github Actions-lah yang menyelamatkan pantat saya. Workers juga, tapi sebenarnya ketika saya lihat saya bisa bikin daemon dengan Github Actions dan schedules, itu benar-benar nyelametin gw bro.

Saya mungkin akan menulis artikel tentang proyek bernama [email-autoreply](https://github.com/fox3000foxy/email-autoreply/), jadi subscribe ke RSS feed biar lihat saat rilis :)).

**3 hal yang perlu diingat:**

1.  **Interaction endpoints = HTTP serverless** -- Tanpa WebSocket, tanpa koneksi persisten. Discord POST, kamu jawab. Gratis di Cloudflare.
2.  **Hono alat yang sempurna** -- Framework ringan (12KB), multi-runtime, zero dependensi. Kode identik di Cloudflare, Vercel, Node, di mana saja.
3.  **Render gambar di Workers = gila** -- Satori + Resvg (Wasm) memungkinkan kamu komposisi UI dinamis dalam JSX dan konversi ke PNG dalam \<100ms. Game lengkap bisa jalan di atasnya.

Ini gila banget xD

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
