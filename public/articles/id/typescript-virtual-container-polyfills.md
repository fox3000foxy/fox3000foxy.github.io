---
title: Menjalankan Pustaka Node.js di Browser Tanpa Wasm --
  polyfill typescript-virtual-container
description: Bagaimana Fortune mengimplementasikan ulang node:fs, node:crypto, dan
  belasan modul Node secara manual dalam 640 baris JavaScript agar kontainer
  berjalan di browser tanpa Wasm.
date: 2026-05-29
aiGenerated: true
authors:
  - fox3000foxy
tags:
  - typescript
  - nodejs
  - polyfills
  - browser
  - open-source
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "89opn2Fo7KFAAOU2cb+VdmCG3ty85v5TtE8qeAnPD4PGiFtW0du3mzNCNUuJTRdjmm7cE9kBOscBlohqZvii4g=="
---

# Menjalankan Pustaka Node.js di Browser Tanpa Wasm -- polyfill typescript-virtual-container

Saya baru saja menghabiskan cukup banyak waktu mempelajari kode sumber [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container), proyek [Fortune (Chloé Rolzhausen)](https://itsrealfortune.fr). Dan bagian yang paling mengejutkan saya bukanlah VFS, bukan jaringan virtual, bukan 170 perintah Unix yang diimplementasikan ulang dalam TypeScript. Melainkan direktori `polyfills/`.

Karena modul ini berjalan di browser, tanpa Wasm, dan untuk itu Fortune mengimplementasikan ulang secara manual seluruh lapisan `node:*` yang dibutuhkan pustaka ini. Sekitar 640 baris JavaScript buatan tangan yang menggantikan `node:fs`, `node:crypto`, `node:os`, `node:net`, dan beberapa lainnya.

Artikel ini menjelaskan cara kerjanya, polyfill demi polyfill.

---

## Masalah dasar

Sebuah pustaka Node.js menggunakan API yang tidak ada di browser. Saat Anda menulis `import { readFileSync } from 'node:fs'`, itu adalah panggilan sistem di sisi Node -- akses disk nyata melalui libuv. Di browser, `node:fs` tidak ada sama sekali.

Solusi umumnya adalah:

- **Runtime Wasm** (seperti Emscripten, WASIp1/WASIp2) -- Anda mengompilasi Node.js ke Wasm dan menjalankannya. Hasilnya: bundle 10-50 MB, waktu muat yang signifikan, kompleksitas deployment yang berarti.
- **Polyfill generik** (seperti `browserify`, `webpack node: polyfills`) -- pustaka npm yang menyediakan perkiraan untuk setiap modul Node. Seringkali terlalu berat, kurang cocok untuk kasus spesifik.
- **Menulis ulang polyfill secara manual** -- lebih banyak kerja, tetapi hasil optimal.

Fortune memilih opsi ketiga. Dan hasilnya adalah bundle browser yang hanya berisi pustaka itu sendiri, langsung menyala, dan tidak bergantung pada infrastruktur eksternal apa pun.

---

## Mekanisme build

Semuanya bergantung pada esbuild dan opsinya `alias`. Setiap `import node:*` diarahkan ke file lokal:

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

Opsi `inject` perlu diperhatikan: opsi ini menyuntikkan `process.js` dan `buffer.js` di awal setiap file bundle, sehingga `process` dan `Buffer` tersedia secara global tanpa import eksplisit. Persis seperti yang dilakukan Node.js secara native.

---

## `buffer.js` -- `Buffer` di atas `Uint8Array`

Ini adalah salah satu dari dua global yang disuntikkan. `Buffer` digunakan secara masif dalam kode -- setiap operasi SSH, setiap snapshot VFS, setiap pembacaan/penulisan biner melaluinya.

Solusinya: kelas `BrowserBuffer` yang memperluas `Uint8Array` dan mengimplementasikan seluruh API `Buffer` Node.js.

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

Yang diimplementasikan secara total:
- `Buffer.from`, `Buffer.alloc`, `Buffer.allocUnsafe`, `Buffer.isBuffer`, `Buffer.concat`, `Buffer.byteLength`
- Semua metode penulisan: `writeUInt8/16/32BE/LE`, `writeInt8/16/32BE/LE`, `writeBigUInt64BE/LE`, `writeFloat/DoubleLE/BE`
- Semua metode pembacaan yang sesuai
- `toString` dengan dukungan hex, base64, utf8
- `copy`, `equals`, `slice`, `subarray`

Itu hanya 116 baris. Untuk apa yang digantikannya, ini luar biasa ringkas.

Trik utamanya adalah penggunaan `DataView` untuk akses multi-byte, yang menangani endianness dengan benar tanpa perlu memanipulasi bit secara manual untuk setiap tipe:

```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```

---

## `process.js` -- global `process` minimal

Global lain yang disuntikkan. Kecil namun diperlukan -- kode sering menguji `process.env.NODE_ENV`, `process.platform`, `process.nextTick`, dll.

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

Pemetaan `nextTick` → `queueMicrotask` adalah detail terpenting di sini. `process.nextTick` di Node.js menjadwalkan callback di akhir fase loop acara saat ini, sebelum I/O. `queueMicrotask` di browser melakukan sesuatu yang secara semantik sangat mirip -- ia menjadwalkan microtask, yang dijalankan sebelum rendering atau acara berikutnya. Ini tidak identik, tetapi cukup dekat sehingga semua kode yang menggunakan `nextTick` berfungsi dengan benar di browser.

---

## `node:fs` -- IndexedDB sebagai sistem file sinkron

Ini adalah polyfill paling canggih, dan sejauh ini yang paling menarik secara teknis.

Masalahnya rumit: `node:fs` mengekspos API sinkron (`readFileSync`, `writeFileSync`, dll.), tetapi API penyimpanan browser semuanya asinkron (IndexedDB, Cache API, dll.). Anda tidak bisa melakukan `await` di tengah fungsi sinkron.

Solusi Fortune: cache dua tingkat.

**Tingkat 1 -- Map di memori (sinkron)**  
Semua pembacaan dilakukan dari `Map<string, Uint8Array>` di memori. Instan, sinkron, tanpa masalah API.

**Tingkat 2 -- IndexedDB (asinkron, latar belakang)**  
Saat startup, seluruh konten IndexedDB dimuat ke dalam Map. Penulisan dilakukan segera ke Map *dan* meluncurkan penulisan asinkron ke IndexedDB tanpa memblokir.

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

// Penulisan async ke IndexedDB (non-blocking)
function idbSet(path, value) {
  openDB().then(db => {
    const tx = db.transaction(STORE, 'readwrite');
    if (value === null) tx.objectStore(STORE).delete(path);
    else tx.objectStore(STORE).put(value, path);
  });
}
```

API yang diekspos lengkap: `readFileSync`, `writeFileSync`, `appendFileSync`, `existsSync`, `unlinkSync`, `rmSync` (dengan opsi `recursive`), `mkdirSync` (dengan opsi `recursive`), `readdirSync`, `statSync`, `renameSync`.

Bahkan ada lapisan manajemen file descriptor (`openSync`, `writeSync`, `closeSync`) agar jurnal WAL VFS berfungsi dalam mode browser -- jurnal membuka fd, menulis ke dalamnya, menutupnya, dan datanya tersimpan di IndexedDB.

Properti `ready` diekspor untuk memungkinkan kode mengetahui kapan preload awal selesai:

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

Berkat inilah snapshot VFS bertahan dari muat ulang halaman di browser. Saat Anda memuat ulang demo, VFS akan dikembalikan persis seperti saat Anda tinggalkan, dari IndexedDB, tanpa melibatkan server apa pun.

---

## `node:crypto` -- SHA-256, HMAC, PBKDF2 dalam JS murni

Alih-alih mengimpor pustaka crypto yang dikompilasi ke Wasm, Fortune mengimplementasikan primitif yang diperlukan secara langsung.

**SHA-256** diimplementasikan dari awal dengan konstanta FIPS 180-4:

```js
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, /* ... 60 konstanta lainnya */ 
]);

function sha256(data) {
  // padding FIPS 180-4
  const msg = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
  // ...
  // 64 putaran kompresi
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

Di atas SHA-256, **HMAC-SHA256** dan **PBKDF2-HMAC-SHA256** dibangun. Kedua primitif ini digunakan untuk derivasi kunci dalam pertukaran SSH dan autentikasi internal.

API yang diekspor mirip dengan Node.js:

```js
// Hash klasik
const hash = createHash('sha256').update('data').digest('hex');

// Byte acak (via Web Crypto API standar)
const bytes = randomBytes(32);

// UUID
const id = randomUUID();

// Perbandingan timing-safe
const ok = timingSafeEqual(a, b);

// scrypt (didekati via PBKDF2)
const key = scryptSync(password, salt, 32, { N: 16384 });
```

Catatan: `scryptSync` didekati via PBKDF2 dengan jumlah iterasi yang disetel ke parameter `N`. Ini bukan scrypt asli (yang menggunakan skema memori berbeda), tetapi untuk penggunaan proyek ini sudah cukup.

Fungsi yang tidak dapat diemulasi secara wajar di browser (`generateKeyPairSync`, `createCipheriv`, `createDecipheriv`, `createSign`) akan melontarkan error eksplisit jika dipanggil. Perilaku yang jujur.

---

## `node:os` -- membaca spesifikasi nyata browser

Alih-alih mengembalikan nilai tetap, polyfill ini membaca API browser untuk mengembalikan informasi yang sesuai dengan mesin nyata pengguna.

```js
export function totalmem() {
  try {
    return navigator?.deviceMemory
      ? navigator.deviceMemory * 1024 * 1024 * 1024
      : 2 * 1024 * 1024 * 1024; // 2 GB default
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

Hasil nyata: saat Anda menjalankan `neofetch` di demo browser, jumlah core dan RAM yang ditampilkan sesuai dengan mesin Anda. Ini detail kecil, tetapi sangat berkontribusi pada kredibilitas terminal.

Ekspor lainnya: `freemem` (40% dari total memori, perkiraan wajar), `platform` → `'browser'`, `type` → `'Linux'`, `release` → `'web'`, `uptime` via `performance.now()`, `endianness` → `'LE'` (little-endian, benar untuk semua prosesor x86/ARM konsumen), `loadavg` → `[0, 0, 0]`.

---

## `node:net` -- stub TCP yang bersih

Browser tidak memiliki akses ke socket TCP mentah (WebSocket tidak dihitung -- itu protokol aplikasi yang berbeda). `node:net` karenanya adalah stub, tetapi stub yang *ditulis dengan baik*.

```js
export class Socket {
  connect() { notImpl('Socket.connect')(); }
  on() { return this; }    // chainable
  once() { return this; }  // chainable
  pipe() { return this; }  // chainable
  setEncoding() { return this; }
  remoteAddress = '127.0.0.1';
  remotePort = 0;
  // ...
}
```

Poin penting: metode pendaftaran acara (`on`, `once`, `off`, `emit`) mengembalikan `this` dan tidak melontarkan error. Ini memungkinkan kode yang melakukan `new net.Socket().on('connect', cb)` berfungsi tanpa crash, meskipun koneksi tidak pernah terjadi. Hanya metode yang *benar-benar mencoba terhubung* yang melontarkan error.

`isIP`, `isIPv4`, `isIPv6` diimplementasikan dengan benar (bukan stub) karena digunakan oleh kode jaringan virtual untuk memvalidasi alamat, tanpa pernah membuka socket.

---

## `node:path` -- operasi path POSIX

Implementasi ulang lengkap dari operasi path POSIX, disesuaikan dengan konteks (tanpa backslash Windows, path selalu absolut dengan `/`).

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

Sederhana, ringkas, benar untuk penggunaan proyek.

---

## `node:url` -- delegasi ke API browser

Yang ini elegan karena kesederhanaannya. API `URL` dan `URLSearchParams` sudah ada secara native di browser -- cukup diekspor ulang.

```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```

Hanya `fileURLToPath` dan `pathToFileURL` yang memerlukan implementasi, karena khusus untuk Node:

```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```

Ini adalah pendekatan ideal ketika platform target (browser) sudah menyediakan padanan native.

---

## `node:zlib` -- identitas

```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```

Dua baris. Pustaka menggunakan `fflate` untuk kompresi sebenarnya (yang berfungsi secara native di browser). `node:zlib` hanya diimpor di jalur kode yang tidak dijalankan dalam konteks browser -- jadi passthrough sudah cukup.

Terkadang implementasi yang tepat hanya dua baris.

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

Implementasi lengkap `EventEmitter` Node.js sekitar ~600 baris dengan penanganan `maxListeners`, `once`, `prependListener`, dll. Di sini hanya 12 baris untuk 4 metode yang benar-benar digunakan. Tree-shaking mental sebelum tree-shaking alat build.

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

Server SSH tidak berjalan di browser (tidak masuk akal -- siapa yang akan terhubung?). Tetapi kode yang *berbicara tentang SSH di sisi klien* -- kelas yang membangun paket SSH, parser protokol -- ada di pustaka. Stub ini memungkinkan semua kode tersebut dibundle tanpa error, sambil memastikan error yang jelas dilontarkan jika seseorang mencoba memanggil metode yang membutuhkan socket sungguhan.

`roxify` adalah format kompresi kepemilikan yang digunakan untuk snapshot VFS dalam mode Node. Di browser, `fflate` digunakan sebagai gantinya -- polyfill hanya melontarkan error jika `roxify` dipanggil secara langsung.

---

## `node:worker_threads` -- reekspor Web Workers

Ini yang paling halus. `node:worker_threads` di Node.js dan Web Workers di browser adalah dua API yang berbeda, tetapi secara konseptual dekat. Polyfill melakukan pemetaan:

```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```

`MessageChannel` dan `MessagePort` diekspor ulang langsung dari browser (API yang sama). `Worker` sendiri memerlukan wrapper karena konstruktornya berbeda (Node menerima path modul, browser menerima URL). `isMainThread` selalu `true` di sisi browser dalam konteks ini.

---

## Gambaran umum: apa arti 640 baris ini

| Polyfill | Baris | Strategi |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array` + `DataView`, seluruh API `Buffer` |
| `node:crypto` | 166 | SHA-256/HMAC/PBKDF2 from scratch + Web Crypto untuk random |
| `node:fs` | 210 | `Map` di memori + IndexedDB async |
| `node:net` | 70 | Stub chainable + validasi IP nyata |
| `ssh2` | 74 | Stub eksplisit |
| `process.js` | 14 | `process` minimal yang layak |
| `node:path` | ~30 | Operasi path POSIX |
| `node:url` | ~25 | Delegasi ke API browser |
| `node:events` | ~12 | EventEmitter 4 metode |
| `node:os` | ~25 | `navigator.deviceMemory` / `hardwareConcurrency` |
| `node:zlib` | 4 | Passthrough |
| `node:worker_threads` | ~30 | Reekspor Web Workers |
| `roxify.js` | 8 | Stub |

640 baris. Tanpa dependensi npm. Tanpa Wasm. Dan itu menghasilkan bundle browser yang menyala dalam waktu kurang dari satu detik dan berjalan tanpa infrastruktur sisi server sama sekali.

---

## Yang bisa dipetik

Lain kali Anda ingin memindahkan pustaka Node.js ke browser, inilah yang ditunjukkan oleh pendekatan Fortune:

1. **Identifikasi apa yang benar-benar digunakan.** Tidak perlu mengimplementasikan `EventEmitter` secara keseluruhan jika kode hanya menggunakan `on`, `emit`, dan `removeListener`.

2. **Delegasikan ke API browser jika memungkinkan.** `URL`, `URLSearchParams`, `MessageChannel`, `MessagePort`, `crypto.getRandomValues` -- browser sudah memilikinya, manfaatkan saja.

3. **Cache sinkron di depan API async.** Solusi `Map` + IndexedDB untuk `node:fs` adalah pola yang paling dapat digunakan kembali dari seluruh direktori.

4. **Stub yang jujur lebih baik daripada implementasi tidak lengkap yang diam.** `throw new Error('not implemented in browser')` yang eksplisit jauh lebih berguna daripada `return undefined` yang membiarkan bug muncul 10 panggilan kemudian.

5. **esbuild `alias` + `inject` diremehkan.** Ini adalah alat yang sempurna untuk jenis porting ini -- tanpa konfigurasi webpack, tanpa plugin, hanya daftar penggantian.

---

Kodenya ada di repo: [github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills). Setiap file muat dalam satu halaman, bisa dibaca langsung di GitHub. Sangat direkomendasikan jika Anda mengerjakan proyek serupa.
