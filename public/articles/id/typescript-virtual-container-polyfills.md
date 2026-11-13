---
title: Menjalankan pustaka Node.js di peramban tanpa Wasm --
  polyfill typescript-virtual-container
description: Bagaimana Fortune mengimplementasikan ulang manual node:fs, node:crypto dan
  selusin modul Node dalam 640 baris JavaScript supaya kontainer
  berjalan di peramban tanpa Wasm.
date: 2026-05-29
aiGenerated: true
tags:
  - typescript
  - nodejs
  - polyfills
  - browser
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "lanQdNNlu+i2MQz0mckOPTVE67QI1FBIY887zRF7Ap5Ruc9EYHKZW5ePttL3pkQ1vFusZ4mrGW8qO1LPMmFG6Q=="
---

# Menjalankan pustaka Node.js di peramban tanpa Wasm -- polyfill typescript-virtual-container

Saya baru-baru ini menghabiskan cukup banyak waktu menelusuri kode sumber [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container), proyek [Fortune (Chloé Rolzhausen)](https://itsrealfortune.fr). Dan bagian yang paling mengejutkan saya adalah folder `polyfills/`, bahkan lebih dari VFS, jaringan virtual, atau 170 perintah Unix yang diimplementasikan ulang dalam TypeScript.

Karena modul berjalan di peramban, tanpa Wasm, dan untuk itu, Fortune mengimplementasikan ulang manual seluruh lapisan `node:*` yang dibutuhkan pustaka. Sekitar 640 baris JavaScript artisanal yang menggantikan `node:fs`, `node:crypto`, `node:os`, `node:net`, dan beberapa lainnya.

Artikel ini menjelaskan cara kerjanya, polyfill per polyfill.

---

## Masalah dasar

Pustaka Node.js memakai API yang tidak ada di peramban. Ketika kamu menulis `import { readFileSync } from 'node:fs'`, itu panggilan sistem sisi Node -- akses disk sungguhan lewat libuv. Di peramban, `node:fs` sama sekali tidak ada.

Solusi biasanya adalah :

- **Runtime Wasm** (tipe Emscripten, WASIp1/WASIp2) -- kamu mengompilasi Node.js ke Wasm dan menjalankannya. Hasilnya : bundle 10-50 MB, waktu pemuatan yang terasa, kompleksitas deployment yang signifikan.
- **Polyfill generik** (tipe `browserify`, `webpack node: polyfills`) -- pustaka npm yang menyediakan perkiraan tiap modul Node. Sering terlalu berat, tidak cocok dengan kasus spesifik.
- **Menulis ulang polyfill manual** -- lebih banyak kerja, tapi hasil optimal.

Fortune memilih opsi ketiga. Dan hasilnya adalah bundle peramban yang hanyalah pustakanya, yang menyala seketika, dan tidak bergantung pada infrastruktur luar apa pun.

---

## Mekanika build

Semuanya bersandar pada esbuild dan opsi `alias`-nya. Setiap import `node:*` dialihkan ke berkas lokal :

```js
// demo/build.js
esbuild.build({
  entryPoints: ['app.ts'],
  bundle: true,
  platform: 'browser',
  alias: {
    'node:events':         '../polyfills/node_events/index.js',
    'node:path':           '../polyfills/node_path/index.js',
    'node:os':             '../polyfills/node_os/index.js',
    'node:fs':             '../polyfills/node_fs/index.js',
    'node:fs/promises':    '../polyfills/node_fs/promises.js',
    'node:crypto':         '../polyfills/node_crypto/index.js',
    'node:child_process':  '../polyfills/node_child_process/index.js',
    'node:zlib':           '../polyfills/node_zlib/index.js',
    'node:vm':             '../polyfills/node_vm/index.js',
    'node:net':            '../polyfills/node_net/index.js',
    'node:url':            '../polyfills/node_url/index.js',
    'node:worker_threads': '../polyfills/node_worker_threads/index.js',
    'ssh2':                '../polyfills/ssh2/index.js',
    'roxify':              '../polyfills/roxify.js',
  },
  inject: ['../polyfills/process.js', '../polyfills/buffer.js'],
  minify: true,
  treeShaking: true,
});
```

Opsi `inject` layak dicatat : ia memungkinkan menyuntikkan `process.js` dan `buffer.js` di kepala setiap berkas bundle, yang membuat `process` dan `Buffer` tersedia global tanpa import eksplisit apa pun. Tepat seperti Node.js mengeksposnya secara native.

---

## `buffer.js` -- `Buffer` di atas `Uint8Array`

Ini salah satu dari dua global yang disuntikkan. `Buffer` dipakai masif di kode -- setiap operasi SSH, setiap snapshot VFS, setiap baca/tulis biner lewat sana.

Solusinya : kelas `BrowserBuffer` yang memperluas `Uint8Array` dan mengimplementasikan seluruh API `Buffer` Node.js.

```js
class BrowserBuffer extends Uint8Array {
  static from(data, encoding) {
    if (typeof data === 'string') {
      if (encoding === 'hex') {
        const arr = new BrowserBuffer(data.length / 2);
        for (let i = 0; i < arr.length; i++)
          arr[i] = parseInt(data.slice(i * 2, i * 2 + 2), 16);
        return arr;
      }
      if (encoding === 'base64') {
        const bin = atob(data);
        const arr = new BrowserBuffer(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return arr;
      }
      return new BrowserBuffer(new TextEncoder().encode(data));
    }
    if (data instanceof ArrayBuffer) return new BrowserBuffer(data);
    return new BrowserBuffer(data);
  }
  // ...
}
globalThis.Buffer = BrowserBuffer;
```

Yang diimplementasikan total :
- `Buffer.from`, `Buffer.alloc`, `Buffer.allocUnsafe`, `Buffer.isBuffer`, `Buffer.concat`, `Buffer.byteLength`
- Semua metode penulisan : `writeUInt8/16/32BE/LE`, `writeInt8/16/32BE/LE`, `writeBigUInt64BE/LE`, `writeFloat/DoubleLE/BE`
- Semua metode pembacaan yang bersesuaian
- `toString` dengan dukungan hex, base64, utf8
- `copy`, `equals`, `slice`, `subarray`

Itu mewakili 116 baris. Untuk apa yang digantikannya, ini luar biasa ringkas.

Trik utamanya adalah pemakaian `DataView` untuk akses multi-oktet, yang menangani endianness dengan benar tanpa harus memanipulasi bit manual untuk tiap tipe :

```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```

---

## `process.js` -- global `process` minimal

Global lain yang disuntikkan. Mungil tapi perlu -- kode sering menguji `process.env.NODE_ENV`, `process.platform`, `process.nextTick`, dll.

```js
globalThis.startedat = Date.now();
export const process = {
  env: { NODE_ENV: 'production' },
  version: 'v20.0.0',
  platform: 'browser',
  browser: true,
  argv: [],
  cwd: () => '/',
  exit: () => {},
  nextTick: (fn, ...args) => queueMicrotask(() => fn(...args)),
  memoryUsage: () => ({ rss: 0, heapTotal: 0, heapUsed: 0, external: 0 }),
  uptime: () => (Date.now() - globalThis.startedat) / 1000,
};
globalThis.process = process;
```

Pemetaan `nextTick` → `queueMicrotask` adalah detail terpenting di sini. `process.nextTick` di Node.js menjadwalkan callback di akhir fase berjalan dari event loop, sebelum I/O. `queueMicrotask` di peramban menawarkan semantik yang sangat dekat : ia menjadwalkan microtask, yang berjalan sebelum render atau event berikutnya, dan kedekatan ini cukup supaya semua kode yang memakai `nextTick` berfungsi benar di browser.

---

## `node:fs` -- IndexedDB sebagai sistem berkas sinkron

Ini polyfill paling canggih, dan sejauh ini paling menarik secara teknis.

Masalahnya pelik : `node:fs` mengekspos API sinkron (`readFileSync`, `writeFileSync`, dll.), tapi API penyimpanan browser semuanya asinkron (IndexedDB, Cache API, dll.). Kita tidak bisa melakukan `await` di tengah fungsi sinkron.

Solusi Fortune : cache dua tingkat.

**Tingkat 1 -- Map di memori (sinkron)**
Semua pembacaan dilakukan dari `Map<string, Uint8Array>` di memori. Seketika, sinkron, tanpa masalah API.

**Tingkat 2 -- IndexedDB (asinkron, di latar belakang)**
Saat startup, seluruh isi IndexedDB dimuat ke Map. Penulisan dilakukan segera ke Map *dan* memicu penulisan asinkron ke IndexedDB tanpa memblokir.

```js
const DB_NAME = 'vfs-fs-shim';
const STORE = 'files';
let db = null;

// Cache sinkron (path → Uint8Array | null)
const memCache = new Map();

// Preload saat startup
openDB().then(db => {
  const tx = db.transaction(STORE, 'readonly');
  const req = tx.objectStore(STORE).openCursor();
  req.onsuccess = e => {
    const cursor = e.target.result;
    if (!cursor) return;
    memCache.set(cursor.key, cursor.value);
    cursor.continue();
  };
});

// Penulisan async ke IndexedDB (non-blokir)
function idbSet(path, value) {
  openDB().then(db => {
    const tx = db.transaction(STORE, 'readwrite');
    if (value === null) tx.objectStore(STORE).delete(path);
    else tx.objectStore(STORE).put(value, path);
  });
}
```

API yang diekspos lengkap : `readFileSync`, `writeFileSync`, `appendFileSync`, `existsSync`, `unlinkSync`, `rmSync` (dengan opsi `recursive`), `mkdirSync` (dengan opsi `recursive`), `readdirSync`, `statSync`, `renameSync`.

Bahkan ada lapisan manajemen file descriptor (`openSync`, `writeSync`, `closeSync`) supaya jurnal WAL VFS berfungsi dalam mode browser -- jurnal membuka fd, menulis di dalamnya, menutupnya, dan datanya berakhir di IndexedDB.

Properti `ready` diekspor untuk memungkinkan kode tahu kapan preload awal selesai :

```js
export const ready = openDB().then(db => new Promise(resolve => {
  const tx = db.transaction(STORE, 'readonly');
  const req = tx.objectStore(STORE).openCursor();
  req.onsuccess = e => {
    const cursor = e.target.result;
    if (!cursor) return resolve(true);
    memCache.set(cursor.key, cursor.value);
    cursor.continue();
  };
}));
globalThis.__fsReady__ = ready;
```

Berkat inilah snapshot VFS bertahan dari pemuatan ulang halaman di peramban. Ketika kamu memuat ulang demo, VFS dipulihkan tepat dalam keadaan kamu meninggalkannya, dari IndexedDB, tanpa server apa pun terlibat.

---

## `node:crypto` -- SHA-256, HMAC, PBKDF2 dalam JS murni

Alih-alih mengimpor pustaka crypto yang dikompilasi ke Wasm, Fortune mengimplementasikan primitif yang diperlukan langsung.

**SHA-256** diimplementasikan dari nol dengan konstanta FIPS 180-4 :

```js
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, /* ... 60 konstanta lain */
]);

function sha256(data) {
  // padding FIPS 180-4
  const msg = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
  // ...
  // 64 ronde kompresi
  for (let j = 0; j < 64; j++) {
    const S1  = (e>>>6|e<<26)^(e>>>11|e<<21)^(e>>>25|e<<7);
    const ch  = (e&f)^(~e&g);
    const t1  = (hh + S1 + ch + K[j] + w[j]) | 0;
    const S0  = (a>>>2|a<<30)^(a>>>13|a<<19)^(a>>>22|a<<10);
    const maj = (a&b)^(a&c)^(b&c);
    const t2  = (S0 + maj) | 0;
    // ...
  }
}
```

Di atas SHA-256, **HMAC-SHA256** dan **PBKDF2-HMAC-SHA256** dibangun. Kedua primitif ini dipakai untuk derivasi kunci dalam pertukaran SSH dan autentikasi internal.

API yang diekspor menyerupai Node.js :

```js
// Hash klasik
const hash = createHash('sha256').update('data').digest('hex');

// Byte acak (lewat API Web Crypto standar)
const bytes = randomBytes(32);

// UUID
const id = randomUUID();

// Perbandingan timing-safe
const ok = timingSafeEqual(a, b);

// scrypt (didekati lewat PBKDF2)
const key = scryptSync(password, salt, 32, { N: 16384 });
```

Catatan : `scryptSync` didekati lewat PBKDF2 dengan jumlah iterasi yang disetel pada parameter `N`. Pendekatan ini menggantikan skema memori spesifik scrypt dan mencakup pemakaian proyek.

Fungsi yang tidak bisa diemulasi wajar di browser (`generateKeyPairSync`, `createCipheriv`, `createDecipheriv`, `createSign`) melempar error eksplisit kalau dipanggil. Perilaku jujur.

---

## `node:os` -- membaca spek nyata peramban

Alih-alih mengembalikan nilai tetap, polyfill ini membaca API peramban untuk mengembalikan informasi yang cocok dengan mesin nyata pengguna.

```js
export function totalmem() {
  try {
    return navigator?.deviceMemory
      ? navigator.deviceMemory * 1024 * 1024 * 1024
      : 2 * 1024 * 1024 * 1024; // 2 GB secara bawaan
  } catch(e) { return 2 * 1024 * 1024 * 1024; }
}

export function cpus() {
  try {
    const n = navigator?.hardwareConcurrency || 2;
    const ua = navigator?.userAgent || '';
    let model = 'Browser CPU';
    const m = ua.match(/\(([^)]+)\)/);
    if (m) model = m[1].split(';').slice(-1)[0].trim() || model;
    return Array.from({ length: n }, () => ({ model, speed: 2400 }));
  } catch(e) { return [{ model: 'Browser CPU', speed: 2400 }]; }
}

export function arch() {
  const ua = navigator?.userAgent || '';
  if (ua.includes('arm64') || ua.includes('aarch64')) return 'aarch64';
  return 'x86_64';
}
```

Hasil konkret : ketika kamu menjalankan `neofetch` di demo peramban, jumlah core dan RAM yang ditampilkan cocok dengan mesinmu. Ini detail, tapi sangat berkontribusi pada kewajaran terminal.

Ekspor lainnya : `freemem` (40% memori total, perkiraan wajar), `platform` → `'browser'`, `type` → `'Linux'`, `release` → `'web'`, `uptime` lewat `performance.now()`, `endianness` → `'LE'` (little-endian, benar di semua prosesor x86/ARM publik), `loadavg` → `[0, 0, 0]`.

---

## `node:net` -- stub TCP yang bersih

Peramban tidak punya akses ke socket TCP mentah (WebSocket tidak dihitung -- itu protokol aplikatif berbeda). Jadi `node:net` adalah stub, tapi stub yang *ditulis baik*.

```js
export class Socket {
  connect() { notImpl('Socket.connect')(); }
  on() { return this; }    // bisa dirantai
  once() { return this; }  // bisa dirantai
  pipe() { return this; }  // bisa dirantai
  setEncoding() { return this; }
  remoteAddress = '127.0.0.1';
  remotePort = 0;
  // ...
}
```

Poin pentingnya : metode pendaftaran event (`on`, `once`, `off`, `emit`) mengembalikan `this` dan tidak melempar error. Itu memungkinkan kode yang melakukan `new net.Socket().on('connect', cb)` berfungsi tanpa crash, meski koneksi tidak pernah terjadi. Hanya metode yang *benar-benar mencoba terhubung* yang melempar error.

`isIP`, `isIPv4`, `isIPv6` diimplementasikan benar (dengan logika validasi sungguhan) karena dipakai kode jaringan virtual untuk memvalidasi alamat, tanpa pernah membuka socket.

---

## `node:path` -- operasi path POSIX

Implementasi ulang lengkap operasi path POSIX, disesuaikan dengan konteks (path selalu absolut dengan `/`, gaya Unix saja).

```js
export const posix = {
  basename(p) {
    const parts = p.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  },
  dirname(p) {
    if (!p) return '.';
    const parts = p.split('/').filter(Boolean);
    parts.pop();
    return parts.length ? '/' + parts.join('/') : '/';
  },
  join(...parts) {
    return parts.join('/').replace(/\/+/g, '/');
  },
  normalize(p) {
    const parts = p.split('/');
    const stack = [];
    for (const part of parts) {
      if (part === '..') stack.pop();
      else if (part && part !== '.') stack.push(part);
    }
    return (p.startsWith('/') ? '/' : '') + stack.join('/') || '.';
  }
};
```

Sederhana, ringkas, benar untuk pemakaian proyek.

---

## `node:url` -- delegasi ke API peramban

Yang ini elegan karena kesederhanaannya. API `URL` dan `URLSearchParams` sudah ada native di peramban -- cukup mengekspor ulang.

```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```

Hanya `fileURLToPath` dan `pathToFileURL` yang membutuhkan implementasi, karena mereka khas Node :

```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```

Ini pendekatan ideal ketika platform target (peramban) sudah menyediakan padanan nativenya.

---

## `node:zlib` -- identitas

```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```

Dua baris. Pustaka memakai `fflate` untuk kompresi nyata (yang berfungsi native di browser). `node:zlib` hanya diimpor di path kode yang tidak berjalan dalam konteks browser -- jadi passthrough sudah cukup.

Kadang implementasi yang benar itu dua baris.

---

## `node:events` -- EventEmitter minimal

```js
export class EventEmitter {
  constructor() { this._events = Object.create(null); }
  on(ev, fn) { (this._events[ev] ||= []).push(fn); return this; }
  addListener(ev, fn) { return this.on(ev, fn); }
  emit(ev, ...args) {
    const fns = this._events[ev] || [];
    for (const f of fns) try { f(...args); } catch(e) {}
    return fns.length > 0;
  }
  removeListener(ev, fn) {
    if (!this._events[ev]) return;
    this._events[ev] = this._events[ev].filter(x => x !== fn);
  }
}
```

Implementasi lengkap `EventEmitter` Node.js sekitar 600 baris dengan penanganan `maxListeners`, `once`, `prependListener`, dll. Di sini 12 baris untuk 4 metode yang benar-benar dipakai. Tree-shaking mental bahkan sebelum tree-shaking alat build.

---

## `ssh2` dan `roxify` -- stub eksplisit

```js
// polyfills/ssh2/index.js
function notImpl(name) {
  return function() {
    throw new Error(`ssh2: ${name} not implemented in browser`);
  };
}

export class Client {
  connect()  { notImpl('Client.connect')(); }
  end()      { notImpl('Client.end')(); }
  exec()     { notImpl('Client.exec')(); }
  // ...
}
```

Server SSH tidak berjalan di peramban (itu tidak masuk akal -- siapa yang terhubung?). Tapi kode yang *bicara soal SSH sisi klien* -- kelas yang membangun paket SSH, parser protokol -- ada di pustaka. Stub ini memungkinkan semua kode itu di bundle tanpa error, sekaligus menjamin error jelas dilempar kalau seseorang mencoba memanggil metode yang membutuhkan socket sungguhan.

`roxify` adalah format kompresi proprietari yang dipakai untuk snapshot VFS dalam mode Node. Di peramban, `fflate`-lah yang dipakai sebagai gantinya -- polyfill cukup melempar error kalau `roxify` dipanggil langsung.

---

## `node:worker_threads` -- mengekspor ulang Web Worker

Ini yang paling subtil. `node:worker_threads` di Node.js dan Web Worker peramban adalah dua API berbeda, tapi secara konsep dekat. Polyfill memetakan :

```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```

`MessageChannel` dan `MessagePort` diekspor ulang langsung dari browser (API yang sama). `Worker` sendiri membutuhkan wrapper karena konstruktornya berbeda (Node mengharapkan path modul, browser mengharapkan URL). `isMainThread` selalu `true` di sisi peramban dalam konteks ini.

---

## Gambaran umum : apa yang diwakili 640 baris ini

| Polyfill | Baris | Strategi |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array` + `DataView`, seluruh API `Buffer` |
| `node:crypto` | 166 | SHA-256/HMAC/PBKDF2 dari nol + Web Crypto untuk random |
| `node:fs` | 210 | `Map` di memori + IndexedDB async |
| `node:net` | 70 | Stub bisa dirantai + validasi IP sungguhan |
| `ssh2` | 74 | Stub eksplisit |
| `process.js` | 14 | `process` minimal viable |
| `node:path` | ~30 | Operasi path POSIX |
| `node:url` | ~25 | Delegasi ke API browser |
| `node:events` | ~12 | EventEmitter 4 metode |
| `node:os` | ~25 | `navigator.deviceMemory` / `hardwareConcurrency` |
| `node:zlib` | 4 | Passthrough |
| `node:worker_threads` | ~30 | Ekspor ulang Web Worker |
| `roxify.js` | 8 | Stub |

640 baris. Tanpa dependensi npm. Tanpa Wasm. Dan itu memberikan bundle peramban yang menyala dalam kurang dari sedetik dan berjalan tanpa infrastruktur sisi server apa pun.

---

## Apa yang bisa dipetik

Lain kali kamu ingin mem porting pustaka Node.js ke peramban, inilah yang ditunjukkan pendekatan Fortune :

1. **Identifikasi apa yang benar-benar dipakai.** Implementasikan hanya metode yang dipanggil kode : di sini `on`, `emit` dan `removeListener` cukup untuk `EventEmitter`.

2. **Delegasikan ke API peramban kalau memungkinkan.** `URL`, `URLSearchParams`, `MessageChannel`, `MessagePort`, `crypto.getRandomValues` -- peramban sudah punya, pakai saja.

3. **Cache sinkron di depan API async.** Solusi `Map` + IndexedDB untuk `node:fs` adalah pola paling bisa dipakai ulang dari seluruh folder.

4. **Stub jujur lebih baik daripada implementasi tak lengkap yang diam.** `throw new Error('not implemented in browser')` yang eksplisit jauh lebih berguna daripada `return undefined` yang membiarkan bug muncul 10 panggilan kemudian.

5. **esbuild `alias` + `inject` diremehkan.** Ini alat sempurna untuk porting semacam itu -- nol konfigurasi webpack, nol plugin, hanya daftar penggantian.

---

Kode ada di repo : [github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills). Setiap berkas muat dalam satu halaman, bisa dibaca langsung di GitHub. Sangat direkomendasikan kalau kamu mengerjakan proyek serupa.
