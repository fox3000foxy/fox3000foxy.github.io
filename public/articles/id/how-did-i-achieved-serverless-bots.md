---
title: "Bot Discord 100% serverless : Hono + Cloudflare Workers"
description: Bagaimana saya mengganti bot Discord yang menghabiskan 50€/bulan dengan
  nol euro -- interaction endpoints, Hono, Workers, render gambar waktu
  nyata, dan permainan lengkap tanpa WebSocket.
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
author_sig: "G7VTey5w8L7OBf90AML8/zIk3LTWZorrJNYR8LUO6WChSNqvBH8potigl7zpwrPY0SX9idXczNKLf06AosJ7DA=="
---

## Bot Discord 100% serverless : Hono + Cloudflare Workers = 💸 nol

Saya menghabiskan beberapa bulan memelihara bot Discord klasik di mesin saya sendiri.

Koneksi WebSocket selalu terbuka. Bot menyambung ulang sendiri jam 3 pagi. Bot crash karena saya memandang domba dengan cara yang salah. Tagihannya naik.

Suatu hari saya menemukan : **kenapa mempertahankan koneksi** ? Discord bisa POST saja event yang menarik buatmu. Kamu menjawab, selesai.

Sejak 2021, Discord menawarkan **interaction endpoints**.

Ini cuma HTTP. Kamu bekerja tanpa WebSocket, tanpa keadaan persisten. Kamu menerima permintaan, kamu mengirim JSON, selesai. Permintaan berikutnya datang sendiri.

Dan yang terbaik : Cloudflare Workers **gratis** hingga 100k permintaan/hari. Untuk 90% bot, itu 0€/bulan.

Artikel ini menunjukkan cara membuat bot Discord tanpa WebSocket memakai **Hono** (framework web ultra ringan) dan **Cloudflare Workers**. Saya akan menunjukkan dua proyek nyata : **Nibi** (bot untuk belajar bahasa Jepang, TTS, keren) dan **Konosuba-RPG** (permainan Discord _lengkap_ dengan render gambar waktu nyata).

## WebSocket vs. Interaction Endpoints : kenapa itu ide buruk

Bayangkan permainan Minecraft di mana kamu harus menjaga koneksi tetap terbuka bahkan ketika tidak bermain.

Dan server menyambung ulang otomatis setiap kali crash. Kamu harus menangani timeout, reconnect eksponensial, semua boilerplate menyebalkan yang kita benci. Hanya untuk menerima interaksi.

Interaction endpoints kebalikannya. Discord POST ke URL-mu. Kamu menjawab. Selesai.

Kalau servermu crash? Discord retry 2-3 kali lalu lanjut. Zero drama.

**Biaya sebelumnya** : 50€/bulan di Heroku hanya supaya proses Node tetap hidup.

**Biaya sesudahnya** : 0€/bulan di Cloudflare hingga 100k permintaan/hari.

## Arsitekturnya : sebenarnya apa?

Discord POST permintaan ke endpoint-mu.

```plaintext
Discord: "Eh! Pengguna mengklik /ping!"
      ↓
    URL-mu (Cloudflare Worker)
      ↓
 Kamu memverifikasi bahwa ini benar-benar Discord (pemeriksaan tanda tangan)
      ↓
 Kamu memparsing tipe interaksi
      ↓
 Kamu mengeksekusi handler
      ↓
 Kamu mengembalikan JSON
      ↓
Discord: "Oke, saya tampilkan ke pengguna"
```

Ini HTTP murni, dengan stack minimal dan mudah dibaca.

## Hono + Cloudflare Workers : kombo hemat

**Hono** adalah framework web seberat 12KB. Ia berjalan di mana-mana : Cloudflare Workers, Vercel, AWS Lambda, Deno, Bun... kode yang sama di mana-mana.

Cloudflare Workers adalah komputasi di edge. Permintaanmu tiba di server terdekat. Waktu respons : \<100ms. Biaya : gratis hingga 100k permintaan/hari.

Kombo Hono + Cloudflare adalah pasangan sempurna untuk bot Discord.

Inilah kode minimal bot lengkap :

```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. Mengambil header
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. Memverifikasi bahwa ini benar-benar Discord (bukan spam)
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3. Parse apa yang ia kirim
  const interaction = JSON.parse(body);

  // 4. Menjawab menurut tipe
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

30 baris cukup untuk bot fungsional.

Kamu melupakan `bot.login()`, event emitter dan callback hell. Kamu hanya menyimpan HTTP.

Untuk deploy ke Cloudflare :

```plaintext
npm install -D wrangler
npx wrangler deploy
```

Boom. Kamu punya URL seperti `https://mon-bot.workers.dev/interactions`.

Kamu menaruh itu di Discord Developer Portal di bawah "INTERACTIONS ENDPOINT URL", dan Discord mulai mengirim interaksimu ke sana.

## Memverifikasi tanda tangan : tanpa permintaan palsu

Discord menandatangani setiap permintaan dengan kunci publik. Kalau kamu menerima permintaan dengan tanda tangan buruk? Itu spam. Abaikan dan lanjut.

Paket `discord-interactions` mengerjakan tugasnya :

```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // teks mentah yang persis (bukan JSON ter parsing !)
  signature,         // header x-signature-ed25519
  timestamp,         // header x-signature-timestamp
  publicKey          // dari Discord Dev Portal
);
```

**Jebakan penting** : tanda tangan bergantung pada body yang _persis_. Kalau kamu memparsing JSON dan me re-stringify, atau kalau kamu log body, kamu merusak tanda tangan.

Verifikasi dulu. Parsing setelahnya. Urutan itulah yang penting.

## Kasus 1 : Nibi (bot belajar bahasa Jepang)

Nibi adalah bot Discord untuk belajar bahasa Jepang. Perintah sederhana :

*   `/dictionary kanji` → menampilkan definisi
*   `/pronounce テキスト` → membangkitkan TTS (text-to-speech)
*   `/hello` → pesan sambutan

Setiap perintah adalah satu berkas TypeScript :

```plaintext
src/commands/
├── dictionary.ts
├── pronounce.ts
├── hello.ts
└── ...
```

Satu perintah mengimplementasikan antarmuka ini :

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

### Perintah /pronounce : membuat bot bicara

Inilah yang aneh banget. Kamu mengirim teks (romaji, hiragana, kanji, apa saja), bot mengubahnya menjadi hiragana, membangkitkan TTS lewat VOICEVOX atau Google TTS, dan mengirim pesan audio di Discord.

```typescript
const pronounce: Command = {
  data: {
    name: 'pronounce',
    description: 'Membangkitkan TTS untuk teks Jepang',
    options: [
      {
        type: 3,  // STRING
        name: 'text',
        description: 'Texte à prononcer',
        required: true
      }
    ]
  },

  async execute(interaction, env) {
    const text = interaction.data.options[0].value;

    try {
      // 1. Mengonversi romaji → hiragana dengan Kuroshiro
      const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });

      // 2. Membangkitkan audio TTS
      const audioBuffer = await generateTTS(hiragana);

      // 3. Mengunggah berkas ke Discord
      const uploadFilename = await uploadToDiscord(
        audioBuffer,
        interaction.channel.id,
        env.BOT_TOKEN
      );

      // 4. Mengirim pesan dengan audio
      await sendVoiceMessage(
        interaction.channel.id,
        uploadFilename,
        audioBuffer.length / 16000,  // durée en secondes
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
          content: 'Erreur : impossible de générer l\'audio xD',
          flags: 64  // ephemeral (message privé)
        }
      };
    }
  }
};
```

Ini gila : kamu memanggil API eksternal, mengunggah berkas ke Discord, mengirim pesan dengan berkasnya. Semua itu tanpa WebSocket, hanya HTTP.

### Persistensi dengan Supabase

Nibi memakai Supabase sebagai key-value store. Untuk memeriksa apakah pengguna terdaftar :

```typescript
const DatabaseUtils = new DatabaseUtils({
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY
});

const users = await DatabaseUtils.readJson('users');
const user = users.find(u => u.id === interaction.member.user.id);

if (!user) {
  // Menambahkan pengguna
  users.push({ id: interaction.member.user.id, verified: true });
  await DatabaseUtils.writeJson('users', users);
}
```

Ini sangat dasar (tanpa query SQL sungguhan, hanya JSON), tapi berhasil. Untuk bot kecil ini sempurna.

## Kasus 2 : Konosuba-RPG (permainan Discord dengan render gambar)

Oke yang ini gila.

Konosuba-RPG adalah **permainan lengkap** di Discord. Kamu melawan mob, mendapatkan XP, melengkapi aksesori, naik level. Setiap battle membangkitkan **gambar** waktu nyata. Kamu menghindari spritesheet pra-render. Gambar disusun dinamis dari stat pemain, mob, dan keadaan tempur.

Dan gambar dibangkitkan dalam \<500ms di Cloudflare Workers. Secara harfiah.

### Arsitektur render

```plaintext
Discord (tu cliques "Attack")
    ↓
Cloudflare Worker reçoit l'interaction
    ↓
Pembaruan game state (XP, HP, dll.)
    ↓
Membangkitkan JSX dengan Satori
    ↓
Mengonversi SVG → PNG dengan Resvg (Wasm)
    ↓
Mengunggah gambar ke Discord
    ↓
Mengirim pesan dengan gambar
```

Semua itu dalam kurang dari sedetik. Gila.

### Render gambar di sisi Workers

Konosuba memakai **Satori** (JSX → SVG) dan **Resvg** (SVG → PNG) :

```typescript
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. Membuat JSX untuk UI
  const jsx = (
    <div style="{{" display:="" 'flex',="" gap:="" '20px'="" }}="">
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

Kamu menulis JSX normal. Itu menjadi SVG. SVG menjadi PNG. \<100ms di Cloudflare Worker.

Kamu menangkap kekuatannya? Ini indah banget.

### Game state dan progresi

Data pemain ada di Supabase :

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

Setiap aksi (serang, bertahan, sembuh) memperbarui stat di basis data. Lalu kamu membangkitkan ulang gambar dengan stat baru.

### Interaksi : tombol gameplay

Permainan memakai **interaksi tombol** untuk aksi tempur :

```typescript
{
  type: 1,  // ActionRow
  components: [
    {
      type: 2,  // Button
      style: 1,  // Primary (bleu)
      label: 'Attack',
      custom_id: 'battle_attack'
    },
    {
      type: 2,
      style: 2,  // Secondary (gris)
      label: 'Defend',
      custom_id: 'battle_defend'
    }
  ]
}
```

Ketika kamu mengklik "Attack", Discord POST interaksi dengan `custom_id: 'battle_attack'`. Handler me route itu :

```typescript
if (interaction.type === 3) {
  // Component interaction (button click, etc.)
  const customId = interaction.data.custom_id;

  if (customId === 'battle_attack') {
    return await handleAttack(interaction, env);
  }
  if (customId === 'battle_defend') {
    return await handleDefend(interaction, env);
  }
}
```

Dan boom, kamu menghitung damage, memperbarui basis data, membangkitkan ulang gambar, mengirim.

Ini permainan turn-based lengkap tanpa persistensi koneksi apa pun. Hanya HTTP stateless. Benar-benar rusak.

## Supabase : DB yang dibuat untuk Workers

Basis data klasik (PostgreSQL, MySQL, MongoDB) dirancang untuk koneksi TCP persisten. Kamu membuka socket, menjaga koneksi tetap terbuka, mengirim query. Masalah : **Cloudflare Workers tidak mendukung koneksi TCP persisten**. Setiap permintaan adalah proses fana. Begitu kamu menjawab klien, Worker menghilang.

Kamu tidak bisa melakukan ini :

```typescript
// Ini TIDAK jalan di Workers
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // connexion TCP persistante = dead
```

Dan bahkan driver PostgreSQL native seperti `pg` atau `postgres.js` memakai koneksi TCP. Di Workers, mereka crash.

**Supabase menyelesaikan semua itu.**

Supabase adalah API REST di atas PostgreSQL. Kamu membuat permintaan HTTP normal. Setiap panggilan independen, tanpa koneksi persisten, tanpa keadaan yang dikelola. Ini sangat cocok dengan model serverless.

```typescript
// Ini jalan SEMPURNA di Workers
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

Klien Supabase (`@supabase/supabase-js`) memakai `fetch` di balik kapnya. Dan `fetch` native di Workers. Nol konfigurasi, nol driver, nol koneksi persisten.

| Basis data | Kompatibel Workers? | Kenapa |
| --- | --- | --- |
| **Supabase** | ✅ Ya | REST API tanpa keadaan, HTTP murni |
| **PlanetScale (MySQL)** | ⚠️ Sebagian | Koneksi HTTPS saja, tanpa transaksi panjang |
| **Neon** | ⚠️ Sebagian | Branch serverless tapi driver TCP diperlukan |
| **Turso (libSQL)** | ⚠️ Sebagian | HTTP mungkin tapi dibatasi |
| **Prisma/Prisma Postgres** | ❌ Tidak | Membutuhkan TCP persisten |
| **MongoDB Atlas** | ❌ Tidak | Driver TCP, tanpa REST API native |
| **Redis (Upstash)** | ✅ Ya | REST API HTTP |

Keunggulan nyata Supabase bukan sekadar DB -- melainkan seluruh ekosistem yang dirancang edge-first :

- **Auth** : API REST untuk mengelola sesi, berfungsi tanpa keadaan
- **Storage** : Upload/download berkas lewat HTTP
- **Realtime** : WebSocket opsional, tapi kamu juga bisa polling lewat REST
- **Row Level Security** : aturan keamanan ada di DB, bukan di backend-mu

Untuk bot Discord serverless, Supabase adalah pilihan paling sederhana dan paling andal. Kamu tidak mengonfigurasi driver apa pun, tidak memelihara koneksi apa pun, tidak mengelola timeout apa pun. Kamu hanya mengirim permintaan HTTP.

Kalau kamu mau contoh nyata, lihat Nibi di atas : kode persistensinya secara harfiah `readJson()` dan `writeJson()` di Supabase. Kamu mulai tanpa migrasi, tanpa skema rumit, tanpa config berat. Langsung jalan. Dan kalau botmu jadi besar, kamu migrasi ke query SQL sungguhan tanpa ganti provider.

## Polyfill : ketika Node ingin berjalan di Workers

Beberapa paket mengharapkan API Node. Kuromoji (parser kanji) memakai `XMLHttpRequest`. Workers punya `fetch`, bukan `XMLHttpRequest`.

Solusi sederhana : tambahkan polyfill di atas index.ts :

```typescript
// Polyfill XMLHttpRequest untuk kuromoji
if (!globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest = class {
    // Stub minimal
  } as any;
}
```

Atau buat modul khusus :

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

Ini hack dasar, tapi berhasil.

## Menuju paket npm : hono-discord-interactions

Dengan tangan, membuat bot itu banyak boilerplate :

*   Memverifikasi tanda tangan Discord
*   Me route tipe interaksi
*   Mengelola perintah, komponen, modal
*   Mengembalikan JSON valid

Kita bisa mengabstraksi semua itu dalam paket npm. Semisal :

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

Boum. 20 baris alih-alih 200. Itu akan memangkas Nibi setengahnya dengan mudah.

Ide untuk nanti.

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

URL hasilnya : `https://mon-bot.workers.dev/interactions`

Biaya : **gratis** hingga 100k permintaan/hari. Sesudahnya : $0.50/juta.

Bocoran : kamu tidak akan pernah menghabiskan 100k permintaan kecuali punya 10 000 pengguna aktif.

### Vercel

```plaintext
npm run vercel:deploy
```

URL : `https://mon-bot-xyz.vercel.app/api/interactions`

Sama, gratis.

### Keduanya sekaligus

Hono berjalan di mana-mana. Kamu bisa mendeploy kode yang sama di Cloudflare DAN Vercel. Berguna untuk redundansi atau menguji sebelum memilih.

## Checklist cepat

1.  Membuat Aplikasi di Discord Developer Portal
2.  Menyalin PUBLIC\_KEY, BOT\_TOKEN, APP\_ID
3.  Membuat proyek :
4.  Menulis index.ts (verif tanda tangan + routing)
5.  Mendaftarkan slash command (sekali) :
6.  Deploy :
7.  Menaruh URL di Discord (Developer Portal → Application → Interactions Endpoint URL)
8.  Discord menguji koneksi (kamu harus menjawab PING)
9.  Mengundang bot ke server
10.  Selesai

## Kelebihan vs Keterbatasan

**Kelebihan**

*   Biaya minimal (gratis hingga 100k req/hari)
*   Skalabel (tanpa manajemen koneksi)
*   Sederhana (tanpa boilerplate WebSocket)
*   Cepat (Cloudflare = server di edge)
*   Portabel (kode Hono = banyak host)

**Keterbatasan**

*   Kamu hanya menerima interaksi (slash command, tombol, modal), tanpa event server waktu nyata (anggota bergabung, peran ditambahkan, pesan dihapus, dll.)
*   Timeout 3 detik untuk menjawab -- kalau tidak Discord menampilkan "Application did not respond"
*   Kalau kamu butuh event sungguhan -- perlu webhook HTTP terpisah atau koneksi WebSocket tambahan

Untuk 90% bot (semua berbasis slash command)? Ini cukup.

## Untuk menyimpulkan

Saya menghabiskan cukup banyak waktu mengoptimalkan KonosubaRPG dan Nibi untuk menghemat entah permintaan sebanyak mungkin, atau mengurangi waktu prosesor panas, atau mengurangi boot dingin. Hasilnya, saya punya performa gila di hampir semuanya.
Perlu tahu bahwa saya mulai meng cloudifikasi (entah itu kata yang benar) sebagian besar proyek saya karena saya malas banget terus menghostingnya di VM saya sendiri. Sungguh, saya rasa Github Actions-lah yang menyelamatkan kulit pantat saya. Workers juga, tapi sebenarnya ketika saya melihat bahwa saya bisa membuat daemon dengan Github Actions dan schedule, itu benar-benar menyelamatkan saya.

Saya mungkin akan menulis artikel tentang proyek bernama [email-autoreply](https://github.com/fox3000foxy/email-autoreply/), jadi berlanggananlah ke feed RSS untuk melihatnya keluar segera :)).

**3 poin yang perlu diingat :**

1.  **Interaction endpoints = HTTP serverless** -- tanpa WebSocket, tanpa koneksi persisten. Discord POST, kamu menjawab. Gratis di Cloudflare.
2.  **Hono alat yang sempurna** -- Framework ringan (12KB), multi-runtime, nol dependensi. Kode identik di Cloudflare, Vercel, Node, di mana-mana.
3.  **Render gambar di Workers = gila** -- Satori + Resvg (Wasm) membiarkanmu menyusun UI dinamis dalam JSX dan mengubahnya menjadi PNG dalam \<100ms. Permainan lengkap bisa berjalan di atas itu.

Ini sakit.

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
