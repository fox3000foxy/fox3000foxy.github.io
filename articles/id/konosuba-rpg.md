---
title: "Saya menghabiskan akhir pekan membaca kode konosuba-rpg dan inilah yang saya temukan"
description: "RPG turn-based Discord di mana setiap aksi membangkitkan gambar WebP
  langsung : URL sebagai keadaan permainan, RNG deterministik, pipeline WASM, cache 5
  tingkat, bot serverless."
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
author_sig: "yhS0KHQwVM1ZBMfQN/PTJkalGsfHo6YVdoza2e3iaMhwFNCb9B3qjUwIxZYp2JsljrxroDkd5vIyDzUAmM2K0w=="
---

# Saya menghabiskan akhir pekan membaca kode konosuba-rpg dan inilah yang saya temukan

Saya memelihara proyek ini sudah lama, tapi membaca ulang kode sendiri dengan kepala dingin selalu instruktif. konosuba-rpg adalah RPG turn-based Discord di mana setiap aksi membangkitkan gambar WebP langsung. Ini gambar sungguhan yang disusun, dengan sprite, bar nyawa, pesan tempur -- semuanya.

Stack : TypeScript, Hono, Vercel, Cloudflare Workers, Supabase. Hosting sepenuhnya gratis. Dan bot Discord berjalan tanpa server persisten. Post ini menjelaskan bagaimana semuanya nyambung.

![Keadaan awal permainan](/images/konosuba-rpg/game_init.webp)

---

## Desain dasar : URL sebagai keadaan permainan

Hal pertama yang mencolok : tidak ada keadaan sisi server untuk gameplay. Keadaan lengkap satu tempur muat dalam URL.

```
/konosuba-rpg/fr/abc123/ATK/DEF/ATK/HUG?monster=Vanir&difficulty=hard
```

Setiap segmen setelah seed adalah aksi yang dimainkan. Server menerima URL ini, mulai dari awal, memainkan ulang semua aksi berurutan, dan mengembalikan gambar tempur pada momen tepat itu. Tanpa sesi, tanpa keadaan di RAM yang terkait pengguna.

Discord bekerja lewat tombol interaktif -- ketika pemain menekan "Serang", Discord mengirim ke server `custom_id` tombol. Custom_id ini berisi URL tempur terkompresi dengan aksi baru ditambahkan. Server menghitung ulang semuanya dari nol dan mengembalikan gambar yang diperbarui.

```typescript
// processUrl.ts
const VALID_MOVES_SET = new Set(["ATK", "DEF", "HUG", "HEA", "SPE", "USE"]);
// Dikompilasi sebelumnya di luar fungsi -- tidak dibuat ulang di setiap panggilan

export default function processUrl(url: string): [Random, string[], string, string | null, string | null] {
  const urlParts = url.split("/");
  const moves: string[] = [];
  for (const part of urlParts) {
    if (VALID_MOVES_SET.has(part.toUpperCase())) moves.push(part.toUpperCase());
  }
  // seed = segmen ke-6, di hash ke 8096 nilai
  const seedStr = (urlParts[5] || "").toLowerCase();
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed + seedStr.charCodeAt(i)) % 8096;
  }
  return [new Random(seed), moves, seedStr, monster, difficulty];
}
```

`Set` yang dikompilasi sebelumnya di luar fungsi itu detail, tapi menghindari membangun ulang struktur di setiap invokasi dalam konteks edge di mana modul bisa dievaluasi ulang.

### RNG : RC4 yang dimodifikasi

Pembangkit acak adalah implementasi RC4 (algoritma stream cipher) yang dialihkan jadi PRNG.

```typescript
export class Random {
  private S: number[]; // tabel 256 entri
  private i: number;
  private j: number;

  constructor(seed?: number) {
    this.S = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    let workingSeed = seed || Date.now();
    for (let i = 0; i < 256; i++) {
      j = (j + this.S[i] + (workingSeed & 0xff)) & 0xff;
      // tukar S[i] dan S[j]
      [this.S[i], this.S[j]] = [this.S[j], this.S[i]];
      workingSeed >>>= 8;
    }
  }

  next(): number { /* ... */ }
  randint(min: number, max: number): number { /* ... */ }
  choice(array: T[]): T { /* ... */ }
}
```

Kenapa RC4? Karena ini PRNG deterministik dengan distribusi yang benar dan ketahanan tabrakan seed yang lumayan. Seed sama = urutan angka sama = tempur sama setiap kali. Ini memungkinkan "memutar ulang" tempur mana pun dengan menyimpan URL-nya, dan menjamin dua server berbeda (Vercel + Cloudflare) menghasilkan tepat hasil yang sama untuk URL yang sama.

---

## Masalah batas 100 karakter Discord

Discord memberlakukan batas 100 karakter pada `custom_id` tombol. Setelah beberapa puluh aksi, URL tempur melampaui batas itu dengan mudah.

Dua mekanisme menjawab itu.

### 1. Kompresi RLE pada aksi

Aksi dienkode dengan satu karakter (`a`=attack, `d`=defend, `h`=hug...) dan dikompresi lewat run-length encoding :

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

Sederhana, tapi ketika pemain spam Serang x10 itu berubah dari `aaaaaaaaaa` (10 char) menjadi `a10` (3 char). Tombol "Serang x4" dan "Serang x10" di UI memang ada untuk itu -- mempercepat tempur sekaligus mengompresi payload dengan baik.

### 2. Token sesi ketika kompresi tidak cukup

Kalau payload terkompresi tetap terlalu panjang, ia disimpan di basis data dengan token pendek :

```typescript
// gameSessionService.ts
const TOKEN_PREFIX = "gs.";
const TOKEN_SIZE = 10; // "gs.aBcDeFgHiJ"

export async function encodeGameplayButtons(buttons: RawButton[]): Promise {
  // Mengelompokkan payload per battle_key, menyisipkan batch ke Supabase
  // Mengganti custom_id dengan "gs.{token}:{userId}"
}

export async function decodeGameplayPayloadWithStatus(encodedPayload: string, userID: string) {
  if (!encodedPayload.startsWith(TOKEN_PREFIX)) {
    return { payload: encodedPayload }; // Tanpa lookup kalau tidak perlu
  }
  // Lookup di memori dulu, lalu Supabase kalau tidak ada
  const cached = tokenToSession.get(token) || await loadTokenRowByToken(token);
  // Memeriksa kepemilikan, TTL (7 hari), dan turn_version (mencegah memutar ulang keadaan lama)
}
```

Sesi punya TTL 7 hari dan pruning otomatis setiap 10 menit. Pemeriksaan `turnVersion` mencegah memutar ulang keadaan kedaluwarsa kalau pemain sudah maju dalam permainan -- perlindungan diam-diam terhadap "mundur" yang tidak disengaja.

Kedua Map di memori (`tokenToSession`, `latestTurnByBattle`) memakai pola yang sama `globalThis as unknown as GameSessionGlobals` seperti cache gambar, karena alasan yang sama yang akan kita lihat di bawah.

---

## Pipeline render gambar

![Awal tempur melawan Slime](/images/konosuba-rpg/shot_01_start.webp)

Rute `/konosuba-rpg/:lang/*` tidak mengembalikan JSON. Ia mengembalikan gambar WebP yang dibangkitkan berdasarkan permintaan.

Pipeline disusun dalam 3 layer yang dikompositkan :

```
Background (board + frame)
    +
Characters layer (sprite pemain + mob, posisi tetap)
    +
UI overlay (bar HP, pesan, ikon karakter lewat Satori → SVG → PNG)
    ↓
Photon.watermark() × 2
    ↓
WebP output
```

**Background** : dua gambar tetap (papan dan bingkai), dimuat dari filesystem dan dikompositkan sekali.

**Characters layer** : sprite diposisikan menurut koordinat yang dihitung. Pemain mati dikecualikan (`activeSlots = slots.filter(s => playerHp[s.i] > 0)`). Sprite musuh di mirror horizontal dengan `flipX` kustom -- loop piksel per piksel alih-alih dependensi eksternal.

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

**UI overlay** : ini bagian beratnya. JSX antarmuka (bar nyawa, teks, ikon) dideskripsikan ala React dengan Satori, di render jadi SVG, dikonversi jadi PNG oleh `@cf-wasm/resvg`, lalu diimpor ke Photon untuk komposisi akhir. Satori + resvg adalah dua modul WASM yang dikompilasi khusus untuk Cloudflare Workers dengan flag `edge-light`.

![Aksi Bertahan](/images/konosuba-rpg/shot_03_defend.webp)

![Tempur berjalan](/images/konosuba-rpg/shot_02_combat.webp)

![Aksi Pelukan](/images/konosuba-rpg/shot_04_hug.webp)

---

## Sistem cache -- bagian yang paling digarap

Ada 5 tingkat cache berbeda. Masing-masing menarget granularitas berbeda dari pipeline.

```typescript
// renderImage.ts -- semua di globalThis
G.__imageCache  ??= {} as Record; // aset mentah
G.__base64Cache ??= {} as Record;       // base64 aset (untuk Satori)
G.__fontCache   ??= {} as Record; // font
G.__photonCache    ??= new LRUCache(40, freePhoton);
G.__layerCache     ??= new LRUCache(12, freePhoton);
G.__uiPhotonCache  ??= new LRUCache(30, freePhoton);
G.__renderOutputCache ??= new LRUCache(120);
```

Pola `??=` di `globalThis` : modul JavaScript di worker edge bisa dievaluasi ulang antar permintaan pada konfigurasi tertentu. Menyimpan cache di `globalThis` dengan `??=` menjamin mereka bertahan dari evaluasi ulang tanpa dibuat ulang.

### Eviksi WASM

Cache gambar Photon (`photonCache`, `layerCache`, `uiPhotonCache`) memakai callback eviksi :

```typescript
function freePhoton(_key: string, img: Photon.PhotonImage): void {
  try { img.free(); } catch { /* sudah dibebaskan */ }
}

new LRUCache(40, freePhoton)
```

`Photon.PhotonImage` adalah objek WASM dengan memori yang dialokasikan di sisi linear WASM, di luar GC JavaScript. Memori ini tetap dialokasikan selama `.free()` tidak dipanggil eksplisit. Eeviksi LRU memicu `.free()` otomatis -- ini RAII yang dibawa ke JavaScript.

### Kunci cache sengaja lossy

```typescript
function buildCharactersKey(playerImages: string[][], playerHp: number[], creatureImages: string[], creatureHp: number): string {
  const players = playerImages.map((imgs, i) => `${imgs[0]}:${playerHp[i] > 0 ? 1 : 0}`).join("|");
  return `chars::${players}::${creatureImages[0]}:${creatureHp > 0 ? 1 : 0}`;
}
```

Kunci characters layer tidak mengenkode nilai HP persis -- hanya `1` (hidup) atau `0` (mati). Karena sprite pemain ber HP 40 dan pemain ber HP 15 identik. Hit cache jadi bertahan dari damage apa pun selama tidak ada yang jatuh.

Kunci UI sebaliknya mengenkode HP persis (bar nyawa berubah di setiap pukulan) dan hash pesan :

```typescript
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0; // integer 32-bit bertanda
  }
  return hash.toString(16);
}
```

`Math.imul` memaksa perkalian dalam integer 32 bit, yang menghindari konversi float64 dan memberikan hash polinomial yang stabil. Ini menghindari penambahan dependensi eksternal untuk itu.

### Konversi base64 tanpa stack overflow

```typescript
function getBase64Cached(key: string, buf: ArrayBuffer): string {
  if (base64Cache[key]) return base64Cache[key];
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000; // 32768 oktet
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  const b64 = btoa(binary);
  base64Cache[key] = b64;
  return b64;
}
```

`String.fromCharCode(...largeArray)` bisa menyebabkan stack overflow pada gambar besar karena argumen dilewatkan di call stack. Chunking per 32Ko menghindari itu. Hasilnya di cache -- konversi base64 gambar yang sama hanya dilakukan sekali per instans worker.

---

## STRIPPER.md -- audit await sekuensial

Ada berkas `STRIPPER.md` di repo yang mendokumentasikan audit paralelisasi `await`. Beberapa contoh dari yang tercatat di sana :

- Pemuatan profil pemain melakukan 3 query Supabase seri (progresi, ringkasan run, achievement). Mereka dipindah ke `Promise.all` -- tanpa dependensi di antara mereka.
- Distribusi hadiah akhir tempur (aksesori + consumable) dulunya sekuensial. Diparalelkan juga.
- Pembuatan token sesi untuk tombol dilakukan grup per grup. Grup independen sekarang dibuat paralel.

```typescript
// progressionService.ts -- sebelum (sekuensial)
await grantAccessoryDropRewards(...);
await grantConsumableDropRewards(...);

// sesudah
await Promise.all([
  grantAccessoryDropRewards(...),
  grantConsumableDropRewards(...),
]);
```

Tidak ada yang revolusioner, tapi dalam konteks serverless di mana setiap milidetik waktu respons ditagih (atau berkontribusi pada cold start), itu penting.

---

## Bot Discord tanpa server persisten

![Kemenangan](/images/konosuba-rpg/shot_05_win.webp)

Poin yang sering disalahpahami : bot Discord tidak selalu membutuhkan koneksi WebSocket persisten. Discord menawarkan alternatif : **Interactions Endpoint URL**. Kamu memberikan URL HTTPS ke Discord, dan Discord mengirimmu POST untuk setiap interaksi (slash command, tombol, autocomplete).

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

Discord mengirim POST, handler berjalan 50-200ms di fungsi Vercel atau Cloudflare Worker, menjawab, dan selesai. Tanpa koneksi permanen yang dipelihara, tanpa server yang dijaga menyala. Seluruh bot Discord dihosting di free tier Vercel.

Verifikasi Ed25519 (`verifyKey` dari `discord-interactions`) wajib -- Discord mengirim tanda tangan di header yang harus kamu validasi, kalau tidak ia menolak endpoint.

### Animasi spesial -- satu-satunya await yang disengaja

```typescript
// handleSpecialButton.ts
await new Promise(resolve => setTimeout(resolve, 3000)); // 3 detik
await fetch(`${DISCORD_API_URL}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
  method: "PATCH",
  // ...
});
```

Penundaan sukarela 3 detik ini didokumentasikan di STRIPPER.md sebagai disengaja. Serangan spesial Megumin (Explosion) punya animasi di sisi Discord -- pesan pertama diperbarui dengan visual antara, lalu diubah 3 detik kemudian dengan hasilnya. Ini satu-satunya kasus di mana fungsi Vercel berjalan sengaja lebih lama dari yang perlu.

![Serangan spesial](/images/konosuba-rpg/shot_08_special.webp)

---

## Keterdeployan di dua platform

Codebase yang sama berjalan di Vercel (Node.js) dan di Cloudflare Workers (V8 isolates) tanpa modifikasi :

```typescript
// worker.ts -- entrypoint Cloudflare
export default {
  fetch(request: Request, env: WorkerBindings): Promise {
    syncBindingsToProcessEnv(env); // menyuntikkan secret CF ke process.env
    return app.fetch(request, env, ctx);
  }
};

// index.ts -- entrypoint Vercel/Node
const isVercelRuntime = process.env.VERCEL === "1";
if (!isVercelRuntime) { start(); }
```

Perbedaan utama : aset statis. Di Vercel, mereka dibaca dari filesystem (`/var/task/assets/`). Di Cloudflare Workers, mereka lewat binding `ASSETS` (aset statis CF) dengan fallback ke mirror HTTPS (`fox3000foxy.com/konosuba-rpg/assets`). `getAssetBytes` di `assetLoader.ts` menangani kedua path dengan mencoba filesystem dulu, lalu fetch.

WASM (`@cf-wasm/photon/edge-light`, `@cf-wasm/resvg`) punya build terpisah untuk tiap runtime. Flag `edge-light` pada nama paket menunjuk build yang kompatibel Cloudflare Workers, yang tidak mengizinkan `new WebAssembly.Module()` saat runtime -- WASM harus dikompilasi sebelumnya.

---

## Progresi : XP, level, afinitas

![Satu bos, 650 HP](/images/konosuba-rpg/shot_06_boss.webp)

Meta-progresi bersandar pada Supabase free tier. Skemanya punya tabel `players` (XP global, level, gold), `character_progress` (XP/level/afinitas per karakter untuk Darkness, Aqua, Megumin), `runs` (riwayat tempur), `inventory_items`, `daily_quests_progress`, `achievements_unlocked`, `game_sessions`.

Model progresinya sederhana :

```typescript
// characterService.ts
export function computeLevelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1; // 100 XP per level
}

export function getLevelFactor(level: number): number {
  return 1 + 0.2 * (level - 1); // +20% stat per level
}

export function getAffinityFactor(affinity: number): number {
  const stars = Math.floor(affinity / 20); // 20 poin per bintang, 5 bintang maks
  return 1.2 ** stars; // progresi eksponensial
}
```

Faktor ini diterapkan pada stat karakter di awal setiap `processGame`. Kazuma mengikuti level global pemain, tiga lainnya masing-masing punya XP/level sendiri. Afinitas (didapat dengan mengambil drop yang terkait karakter) mengalikan statnya secara independen.

![Penyembuhan](/images/konosuba-rpg/shot_07_heal.webp)

Sistem drop memakai loot table yang dibobot per kesulitan :

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
  // ...hingga Legendary
};
```

---

## Tes

Tiga rangkaian : uniter, perf, dan leak.

Leak test terutama langsung :

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
  expect(after - before).toBeLessThan(20); // maks 20MB pertumbuhan heap
});
```

1200 iterasi `processGame`, GC dipaksa sebelum dan sesudah, delta heap < 20MB. Kalau tes ini lolos, `processGame` tidak bocor. Tes render (`renderImage.spec.ts`) memeriksa waktu eksekusi di bawah ambang praktis.

Ada juga skrip `bench.ts` untuk memprofilkan pipeline lengkap :

```
RENDER_PERF=1 npx tsx bench.ts --runs=20 --warmup=3 --monster=Dragon
```

Dengan `RENDER_PERF=1`, wrapper `withPerf` di setiap layanan mencatat timing :

```typescript
export async function withPerf(scope: string, label: string, work: () => Promise): Promise {
  const perf = createPerfLogger(scope);
  if (!perf.enabled) return work(); // nol overhead kalau dinonaktifkan
  perf.mark(`${label}:start`);
  try { return await work(); }
  finally { perf.done(`${label}:done`); }
}
```

`createPerfLogger` mengembalikan no-op kalau `DEV_MODE` dan `RENDER_PERF` tidak disetel ke `1`. Tanpa overhead di produksi.

---

## Berapa biaya menjalankannya

- **Vercel free tier** : 100GB bandwidth, 1 juta invokasi serverless per bulan. Render gambar dihitung sebagai satu invokasi.
- **Cloudflare Workers free tier** : 100K permintaan/hari, 10ms waktu CPU per permintaan (render bisa melebihi itu di Workers, makanya Vercel sebagai primer).
- **Supabase free tier** : 500MB basis data, 5GB bandwidth. Cukup untuk ribuan pemain.

Seluruh backend berjalan dengan biaya nol hingga volume signifikan. Satu-satunya titik gesekan adalah batas CPU Cloudflare Workers -- render gambar intensif CPU karena WASM, makanya strateginya Vercel sebagai primer dan Workers sebagai CDN failover.

---

## 3 hal yang layak diingat

1. **URL sebagai keadaan permainan** bukan sekadar trik manis -- ini batasan yang dipaksakan Discord (tombol punya batas 100 char) yang memaksa arsitektur stateless dengan kompresi RLE + token sesi sebagai fallback. Batasannya mendikte desain.

2. **Cache WASM dengan eviksi eksplisit** : `PhotonImage` mengalokasikan di luar heap JavaScript dan tidak akan pernah di GC tanpa `.free()`. Menghubungkan `freePhoton` pada eviksi LRU itu RAII dalam JavaScript. Ini diam-diam di kode, tapi tanpanya worker bocor di produksi.

3. **Bot Discord serverless tanpa WebSocket** : ini kurang dikenal daripada pendekatan gateway WebSocket, tapi untuk bot yang melakukan pemrosesan stateless (setiap interaksi independen), Interactions Endpoint jauh lebih unggul -- tanpa reconnect, tanpa heartbeat, tanpa proses yang dipelihara. Discord menangani ketersediaan di sisi infra mereka.

---

*Repo : [fox3000foxy/konosuba-rpg](https://github.com/fox3000foxy/konosuba-rpg)*

*Lisensi source-available kustom -- tanpa redistribusi, bebas dipakai.*
