---
title: "Saya menghabiskan akhir pekan membaca kode konosuba-rpg dan inilah yang saya temukan"
description: "RPG giliran Discord di mana setiap tindakan menghasilkan gambar WebP
  secara instan: URL sebagai status permainan, RNG deterministik, pipeline WASM, cache 5
  level, bot serverless."
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
author_sig: "il2U89izurwH6d3s1DQJo34cSjUfjpAOoo+FRFO8SBK/bKkLp+VnX1Vyf1kB9KXUwjR02xzpMJkjlAzjy7x1Bw=="
---

# Saya menghabiskan akhir pekan membaca kode konosuba-rpg dan inilah yang saya temukan

Saya sudah memelihara proyek ini sejak lama, tetapi membaca ulang kode sendiri dengan pikiran tenang selalu memberi pelajaran berharga. konosuba-rpg adalah RPG giliran Discord di mana setiap tindakan menghasilkan gambar WebP secara instan. Bukan embed teks. Gambar asli yang dikomposisi, dengan sprite, bar HP, pesan pertarungan -- semuanya.

Stack-nya: TypeScript, Hono, Vercel, Cloudflare Workers, Supabase. Hosting gratis sepenuhnya. Dan bot Discord berjalan tanpa server persisten. Post ini menjelaskan bagaimana semuanya bekerja bersama.

![Status awal permainan](/images/konosuba-rpg/game_init.webp)

---

## Desain dasar: URL sebagai status permainan

Hal pertama yang mencolok: tidak ada status sisi server untuk gameplay. Status lengkap pertarungan ada di dalam URL.

```
/konosuba-rpg/id/abc123/ATK/DEF/ATK/HUG?monster=Vanir&difficulty=hard
```

Setiap segmen setelah seed adalah tindakan yang dimainkan. Server menerima URL ini, kembali dari awal, memutar ulang semua tindakan secara berurutan, dan mengembalikan gambar pertarungan pada momen tersebut. Tanpa session, tanpa status di RAM yang terkait dengan pengguna.

Discord bekerja dengan tombol interaktif -- ketika pemain menekan "Serang", Discord mengirim ke server `custom_id` tombol tersebut. custom_id ini berisi URL pertarungan yang sudah dikompresi dengan tindakan baru yang ditambahkan. Server menghitung ulang semuanya dari awal dan mengembalikan gambar yang diperbarui.

```typescript
// processUrl.ts
const VALID_MOVES_SET = new Set(["ATK", "DEF", "HUG", "HEA", "SPE", "USE"]);
// Dikompilasi di luar fungsi -- tidak dibuat ulang setiap panggilan

export default function processUrl(url: string): [Random, string[], string, string | null, string | null] {
  const urlParts = url.split("/");
  const moves: string[] = [];
  for (const part of urlParts) {
    if (VALID_MOVES_SET.has(part.toUpperCase())) moves.push(part.toUpperCase());
  }
  // seed = segmen ke-6, di-hash ke 8096 nilai
  const seedStr = (urlParts[5] || "").toLowerCase();
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed + seedStr.charCodeAt(i)) % 8096;
  }
  return [new Random(seed), moves, seedStr, monster, difficulty];
}
```

`Set` yang dikompilasi di luar fungsi adalah detail kecil, tetapi ini menghindari pembangunan ulang struktur setiap kali pemanggilan dalam konteks edge di mana modul bisa dievaluasi ulang.

### RNG: RC4 yang dimodifikasi

Generator acaknya adalah implementasi RC4 (algoritma enkripsi stream) yang dialihfungsikan menjadi PRNG.

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
      // swap S[i] dan S[j]
      [this.S[i], this.S[j]] = [this.S[j], this.S[i]];
      workingSeed >>>= 8;
    }
  }

  next(): number { /* ... */ }
  randint(min: number, max: number): number { /* ... */ }
  choice(array: T[]): T { /* ... */ }
}
```

Kenapa RC4? Karena ini PRNG deterministik dengan distribusi yang baik dan resistensi tabrakan seed yang memadai. Seed sama = urutan angka sama = pertarungan sama setiap kali. Ini memungkinkan "memutar ulang" pertarungan apa pun dengan menyimpan URL-nya, dan menjamin bahwa dua server berbeda (Vercel + Cloudflare) menghasilkan hasil yang persis sama untuk URL yang sama.

---

## Masalah batas 100 karakter Discord

Discord memberlakukan batas 100 karakter pada `custom_id` tombol. Setelah beberapa puluh tindakan, URL pertarungan dengan mudah melebihi batas ini.

Dua mekanisme mengatasi hal ini.

### 1. Kompresi RLE tindakan

Tindakan dienkode dengan satu karakter (`a`=attack, `d`=defend, `h`=hug...) dan dikompresi dengan run-length encoding:

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

Sederhana, tetapi ketika pemain spam Serang x10, `aaaaaaaaaa` (10 char) berubah menjadi `a10` (3 char). Tombol "Serang x4" dan "Serang x10" di UI ada tepat untuk ini -- mempercepat pertarungan sambil mengompresi payload dengan baik.

### 2. Token session saat kompresi tidak cukup

Jika payload yang dikompresi masih terlalu panjang, payload disimpan di database dengan token pendek:

```typescript
// gameSessionService.ts
const TOKEN_PREFIX = "gs.";
const TOKEN_SIZE = 10; // "gs.aBcDeFgHiJ"

export async function encodeGameplayButtons(buttons: RawButton[]): Promise {
  // Mengelompokkan payload berdasarkan battle_key, menyisipkan secara batch ke Supabase
  // Mengganti custom_id dengan "gs.{token}:{userId}"
}

export async function decodeGameplayPayloadWithStatus(encodedPayload: string, userID: string) {
  if (!encodedPayload.startsWith(TOKEN_PREFIX)) {
    return { payload: encodedPayload }; // Tidak perlu lookup jika tidak diperlukan
  }
  // Lookup di memori dulu, lalu Supabase jika tidak ada
  const cached = tokenToSession.get(token) || await loadTokenRowByToken(token);
  // Memeriksa kepemilikan, TTL (7 hari), dan turn_version (mencegah memutar ulang status lama)
}
```

Session memiliki TTL 7 hari dan pruning otomatis setiap 10 menit. Pemeriksaan `turnVersion` mencegah pemutaran ulang status yang sudah kedaluwarsa jika pemain sudah maju dalam permainan -- perlindungan halus terhadap "mundur" yang tidak disengaja.

Kedua Map di memori (`tokenToSession`, `latestTurnByBattle`) menggunakan pola `globalThis as unknown as GameSessionGlobals` yang sama dengan cache gambar, untuk alasan yang sama yang akan kita lihat nanti.

---

## Pipeline rendering gambar

![Awal pertarungan melawan Slime](/images/konosuba-rpg/shot_01_start.webp)

Rute `/konosuba-rpg/:lang/*` tidak mengembalikan JSON. Rute ini mengembalikan gambar WebP yang dihasilkan sesuai permintaan.

Pipeline diatur dalam 3 layer yang dikomposisikan:

```
Background (board + frame)
    +
Characters layer (sprite pemain + mob, posisi tetap)
    +
UI overlay (bar HP, pesan, ikon karakter via Satori → SVG → PNG)
    ↓
Photon.watermark() × 2
    ↓
WebP output
```

**Background**: dua gambar tetap (papan dan bingkai), dimuat dari filesystem dan dikomposisi sekali.

**Characters layer**: sprite diposisikan berdasarkan koordinat yang dihitung. Pemain yang mati dikecualikan (`activeSlots = slots.filter(s => playerHp[s.i] > 0)`). Sprite musuh dicerminkan horizontal dengan `flipX` khusus -- loop pixel per pixel alih-alih dependensi eksternal.

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

**UI overlay**: ini bagian yang berat. JSX antarmuka (bar HP, teks, ikon) dideskripsikan dalam React-like dengan Satori, di-render ke SVG, dikonversi ke PNG oleh `@cf-wasm/resvg`, lalu diimpor ke Photon untuk komposisi akhir. Satori + resvg adalah dua modul WASM yang dikompilasi khusus untuk Cloudflare Workers dengan flag `edge-light`.

![Aksi Bertahan](/images/konosuba-rpg/shot_03_defend.webp)

![Pertarungan berlangsung](/images/konosuba-rpg/shot_02_combat.webp)

![Aksi Pelukan](/images/konosuba-rpg/shot_04_hug.webp)

---

## Sistem cache -- bagian yang paling rumit

Ada 5 level cache yang berbeda. Masing-masing menargetkan granularitas pipeline yang berbeda.

```typescript
// renderImage.ts -- semuanya di globalThis
G.__imageCache  ??= {} as Record; // aset mentah
G.__base64Cache ??= {} as Record;       // base64 aset (untuk Satori)
G.__fontCache   ??= {} as Record; // font
G.__photonCache    ??= new LRUCache(40, freePhoton);
G.__layerCache     ??= new LRUCache(12, freePhoton);
G.__uiPhotonCache  ??= new LRUCache(30, freePhoton);
G.__renderOutputCache ??= new LRUCache(120);
```

Pola `??=` pada `globalThis`: modul JavaScript di worker edge dapat dievaluasi ulang antar permintaan pada konfigurasi tertentu. Menyimpan cache di `globalThis` dengan `??=` memastikan cache bertahan dari evaluasi ulang ini tanpa dibuat ulang.

### Eviction WASM

Cache gambar Photon (`photonCache`, `layerCache`, `uiPhotonCache`) menggunakan callback eviction:

```typescript
function freePhoton(_key: string, img: Photon.PhotonImage): void {
  try { img.free(); } catch { /* sudah dibebaskan */ }
}

new LRUCache(40, freePhoton)
```

`Photon.PhotonImage` adalah objek WASM dengan memori yang dialokasikan di sisi linier WASM, di luar GC JavaScript. Tanpa panggilan eksplisit ke `.free()`, memori ini tidak akan pernah dibebaskan. Eviction LRU memicu `.free()` secara otomatis -- ini RAII yang diimplementasikan dalam JavaScript.

### Kunci cache sengaja lossy

```typescript
function buildCharactersKey(playerImages: string[][], playerHp: number[], creatureImages: string[], creatureHp: number): string {
  const players = playerImages.map((imgs, i) => `${imgs[0]}:${playerHp[i] > 0 ? 1 : 0}`).join("|");
  return `chars::${players}::${creatureImages[0]}:${creatureHp > 0 ? 1 : 0}`;
}
```

Kunci untuk characters layer tidak mengenkode nilai HP yang tepat -- hanya `1` (hidup) atau `0` (mati). Karena sprite pemain dengan 40 HP dan pemain dengan 15 HP identik. Cache hit bertahan terhadap kerusakan apa pun selama tidak ada yang tumbang.

Kunci UI sebaliknya mengenkode HP yang tepat (bar HP berubah setiap pukulan) dan hash pesan:

```typescript
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0; // integer 32-bit signed
  }
  return hash.toString(16);
}
```

`Math.imul` memaksa perkalian dalam integer 32-bit, yang menghindari konversi float64 dan memberikan hash polinomial yang stabil. Tanpa dependensi eksternal untuk ini.

### Konversi base64 tanpa stack overflow

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

`String.fromCharCode(...largeArray)` dapat menyebabkan stack overflow pada gambar besar karena argumen dilewatkan di call stack. Chunking 32KB menghindari hal ini. Hasilnya di-cache -- konversi base64 dari gambar yang sama hanya dilakukan sekali per instance worker.

---

## STRIPPER.md -- audit await sekuensial

Ada file `STRIPPER.md` di repo yang mendokumentasikan audit paralelisasi `await`. Beberapa contoh yang tercatat:

- Pemuatan profil pemain melakukan 3 permintaan Supabase secara serial (progresi, ringkasan run, pencapaian). Semuanya diubah menjadi `Promise.all` -- tidak ada dependensi di antara mereka.
- Distribusi hadiah akhir pertarungan (aksesoris + consumable) tadinya sekuensial. Diparalelkan juga.
- Pembuatan token session untuk tombol dilakukan grup per grup. Grup independen sekarang dibuat secara paralel.

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

Tidak ada yang revolusioner, tetapi dalam konteks serverless di mana setiap milidetik waktu respons dikenakan biaya (atau berkontribusi pada cold start), ini berarti.

---

## Bot Discord tanpa server persisten

![Kemenangan](/images/konosuba-rpg/shot_05_win.webp)

Hal yang sering disalahpahami: bot Discord tidak selalu memerlukan koneksi WebSocket persisten. Discord menawarkan alternatif: **Interactions Endpoint URL**. Anda menyediakan URL HTTPS ke Discord, dan Discord mengirimkan POST untuk setiap interaksi (slash command, tombol, autocomplete).

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

Discord mengirim POST, handler berjalan 50-200ms di fungsi Vercel atau Cloudflare Worker, merespons, dan selesai. Tidak perlu koneksi permanen, tidak perlu server menyala terus. Seluruh bot Discord dihosting di free tier Vercel.

Verifikasi Ed25519 (`verifyKey` dari `discord-interactions`) wajib -- Discord mengirimkan tanda tangan di header yang harus Anda validasi, jika tidak endpoint akan ditolak.

### Animasi spesial -- satu-satunya await yang disengaja

```typescript
// handleSpecialButton.ts
await new Promise(resolve => setTimeout(resolve, 3000)); // 3 detik
await fetch(`${DISCORD_API_URL}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
  method: "PATCH",
  // ...
});
```

Penundaan 3 detik yang disengaja ini didokumentasikan di STRIPPER.md sebagai hal yang disengaja. Serangan spesial Megumin (Explosion) memiliki animasi di sisi Discord -- pesan pertama diperbarui dengan visual antara, lalu dimodifikasi 3 detik kemudian dengan hasil akhir. Ini satu-satunya kasus di mana fungsi Vercel sengaja berjalan lebih lama dari yang diperlukan.

![Serangan spesial](/images/konosuba-rpg/shot_08_special.webp)

---

## Deployabilitas di dua platform

Codebase yang sama berjalan di Vercel (Node.js) dan Cloudflare Workers (V8 isolates) tanpa modifikasi:

```typescript
// worker.ts -- entrypoint Cloudflare
export default {
  fetch(request: Request, env: WorkerBindings): Promise {
    syncBindingsToProcessEnv(env); // menyuntikkan rahasia CF ke process.env
    return app.fetch(request, env, ctx);
  }
};

// index.ts -- entrypoint Vercel/Node
const isVercelRuntime = process.env.VERCEL === "1";
if (!isVercelRuntime) { start(); }
```

Perbedaan utama: aset statis. Di Vercel, aset dibaca dari filesystem (`/var/task/assets/`). Di Cloudflare Workers, aset melalui binding `ASSETS` (aset statis CF) dengan fallback ke mirror HTTPS (`fox3000foxy.com/konosuba-rpg/assets`). `getAssetBytes` di `assetLoader.ts` menangani kedua jalur dengan mencoba filesystem dulu, lalu fetch.

WASM (`@cf-wasm/photon/edge-light`, `@cf-wasm/resvg`) memiliki build terpisah untuk setiap runtime. Flag `edge-light` di nama paket menunjukkan build yang kompatibel dengan Cloudflare Workers, yang tidak mengizinkan `new WebAssembly.Module()` saat runtime -- WASM harus dikompilasi sebelumnya.

---

## Progresi: XP, level, afinitas

![Sebuah boss, 650 HP](/images/konosuba-rpg/shot_06_boss.webp)

Meta-progresi bertumpu pada Supabase free tier. Skema mencakup tabel `players` (XP global, level, gold), `character_progress` (XP/level/afinitas per karakter untuk Darkness, Aqua, Megumin), `runs` (riwayat pertarungan), `inventory_items`, `daily_quests_progress`, `achievements_unlocked`, `game_sessions`.

Model progresinya sederhana:

```typescript
// characterService.ts
export function computeLevelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1; // 100 XP per level
}

export function getLevelFactor(level: number): number {
  return 1 + 0.2 * (level - 1); // +20% stat per level
}

export function getAffinityFactor(affinity: number): number {
  const stars = Math.floor(affinity / 20); // 20 poin per bintang, maks 5 bintang
  return 1.2 ** stars; // progresi eksponensial
}
```

Faktor-faktor ini diterapkan pada stat karakter di awal setiap `processGame`. Kazuma mengikuti level global pemain, tiga lainnya memiliki XP/level masing-masing. Afinitas (diperoleh dengan mengumpulkan drop terkait karakter) mengalikan stat karakter secara independen.

![Penyembuhan](/images/konosuba-rpg/shot_07_heal.webp)

Sistem drop menggunakan tabel jarahan yang ditimbang berdasarkan tingkat kesulitan:

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

## Pengujian

Tiga suite: unit, perf, dan leaks.

Test leak sangat langsung:

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

1200 iterasi `processGame`, GC dipaksa sebelum dan sesudah, delta heap < 20MB. Jika test ini lolos, `processGame` tidak bocor. Test render (`renderImage.spec.ts`) lebih memeriksa waktu eksekusi di bawah ambang praktis.

Ada juga script `bench.ts` untuk memprofilkan pipeline lengkap:

```
RENDER_PERF=1 npx tsx bench.ts --runs=20 --warmup=3 --monster=Dragon
```

Dengan `RENDER_PERF=1`, wrapper `withPerf` di setiap service mencatat timing:

```typescript
export async function withPerf(scope: string, label: string, work: () => Promise): Promise {
  const perf = createPerfLogger(scope);
  if (!perf.enabled) return work(); // zero overhead jika dinonaktifkan
  perf.mark(`${label}:start`);
  try { return await work(); }
  finally { perf.done(`${label}:done`); }
}
```

`createPerfLogger` mengembalikan no-op jika `DEV_MODE` dan `RENDER_PERF` tidak diset ke `1`. Tanpa overhead di production.

---

## Biaya menjalankannya

- **Vercel free tier**: 100GB bandwidth, 1M invokasi serverless per bulan. Render gambar dihitung sebagai satu invokasi.
- **Cloudflare Workers free tier**: 100K permintaan/hari, 10ms CPU time per permintaan (render bisa melebihi ini di Workers, makanya Vercel sebagai primary).
- **Supabase free tier**: 500MB database, 5GB bandwidth. Cukup untuk ribuan pemain.

Seluruh backend berjalan dengan biaya nol hingga volume yang signifikan. Satu-satunya titik gesekan adalah batas CPU Cloudflare Workers -- render gambar intensif CPU karena WASM, makanya strategi Vercel sebagai primary dan Workers sebagai CDN failover.

---

## 3 hal yang patut diingat

1. **URL sebagai status permainan** bukan sekadar trik keren -- ini adalah kendala yang dipaksakan oleh Discord (tombol memiliki batas 100 karakter) yang memaksa arsitektur stateless dengan kompresi RLE + token session sebagai fallback. Kendala tersebut mendikte desain.

2. **Cache WASM dengan eviction eksplisit**: `PhotonImage` mengalokasi di luar heap JavaScript dan tidak akan pernah di-GC tanpa `.free()`. Menghubungkan `freePhoton` ke eviction LRU adalah RAII dalam JavaScript. Ini hal yang kecil dalam kode, tetapi tanpanya worker akan bocor di production.

3. **Bot Discord serverless tanpa WebSocket**: ini kurang dikenal dibanding pendekatan WebSocket gateway, tetapi untuk bot yang melakukan pemrosesan stateless (setiap interaksi independen), Interactions Endpoint secara ketat lebih unggul -- tidak perlu koneksi ulang, tidak perlu heartbeat, tidak perlu proses yang dijaga. Discord menangani ketersediaan dari sisi infrastruktur mereka.

---

*Repo: [fox3000foxy/konosuba-rpg](https://github.com/fox3000foxy/konosuba-rpg)*

*Lisensi source-available custom -- tidak untuk redistribusi, free to use.*
