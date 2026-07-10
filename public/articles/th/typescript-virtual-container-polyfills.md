---
title: ไลบรารี Node.js ทำงานในเบราว์เซอร์โดยไม่ต้องใช้ Wasm --
  polyfills ของ typescript-virtual-container
description: Fortune ได้สร้าง node:fs, node:crypto และโมดูล Node อีกกว่าสิบโมดูล
  ขึ้นมาใหม่ด้วย JavaScript 640 บรรทัดเพื่อให้คอนเทนเนอร์ทำงานในเบราว์เซอร์โดยไม่ต้องใช้ Wasm
date: 2026-05-29
aiGenerated: true
tags:
  - typescript
  - node.js
  - polyfills
  - browser
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "u+u+wX5GP3d/x8DAU6Bps0S11DNzM5L0AyKKS7OAdPRIExTcrTlXCTHmpfMbXlQen6k+e/132VkFLAUuykZ8gw=="
---

# ไลบรารี Node.js ทำงานในเบราว์เซอร์โดยไม่ต้องใช้ Wasm -- polyfills ของ typescript-virtual-container

ผมเพิ่งใช้เวลาพอสมควรในการไล่อ่านซอร์สโค้ดของ [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) โปรเจกต์ของ [Fortune (Chloé Rolzhausen)](https://itsrealfortune.fr) และส่วนที่ทำให้ผมประหลาดใจที่สุด ไม่ใช่ VFS ไม่ใช่เครือข่ายเสมือน ไม่ใช่ 170 คำสั่ง Unix ที่ถูกเขียนใหม่ใน TypeScript แต่มันคือโฟลเดอร์ `polyfills/`

เพราะว่าโมดูลนี้ทำงานในเบราว์เซอร์ โดยไม่ต้องใช้ Wasm และเพื่อให้เป็นเช่นนั้น Fortune ได้เขียนเลเยอร์ `node:*` ทั้งหมดที่ไลบรารีต้องการขึ้นมาใหม่ด้วยมือ ประมาณ 640 บรรทัดของ JavaScript ที่ทำขึ้นเองเพื่อแทนที่ `node:fs`, `node:crypto`, `node:os`, `node:net` และอื่น ๆ อีกสองสามโมดูล

บทความนี้จะอธิบายว่ามันทำงานอย่างไร polyfill ทีละตัว

---

## ปัญหาพื้นฐาน

ไลบรารี Node.js ใช้ APIs ที่ไม่มีอยู่ในเบราว์เซอร์ เมื่อคุณเขียน `import { readFileSync } from 'node:fs'` นั่นคือการเรียกใช้ระบบฝั่ง Node -- การเข้าถึงดิสก์จริงผ่าน libuv ในเบราว์เซอร์ `node:fs` ไม่มีอยู่เลย

วิธีแก้ปัญหาทั่วไปคือ:

- **Runtime Wasm** (แบบ Emscripten, WASIp1/WASIp2) -- คุณคอมไพล์ Node.js เป็น Wasm แล้วรันมัน ผลลัพธ์: bundle ขนาด 10-50 MB, เวลาโหลดที่นาน, ความซับซ้อนในการปรับใช้ที่มาก
- **Polyfills ทั่วไป** (แบบ `browserify`, `webpack node: polyfills`) -- ไลบรารี npm ที่ให้การประมาณค่าของแต่ละโมดูล Node มักจะหนักเกินไป ไม่เหมาะกับกรณีเฉพาะ
- **เขียน polyfills ด้วยมือ** -- ทำงานมากขึ้นแต่ผลลัพธ์ดีที่สุด

Fortune เลือกตัวเลือกที่สาม และผลลัพธ์คือ bundle สำหรับเบราว์เซอร์ที่เป็นแค่ตัวไลบรารี เริ่มต้นทันที และไม่พึ่งพาโครงสร้างพื้นฐานภายนอกใด ๆ

---

## กลไกการ Build

ทุกอย่างขึ้นอยู่กับ esbuild และตัวเลือก `alias` ของมัน แต่ละ `import node:*` จะถูกเปลี่ยนเส้นทางไปยังไฟล์ในเครื่อง:

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

ตัวเลือก `inject` น่าสนใจ: มันช่วยให้สามารถแทรก `process.js` และ `buffer.js` ไว้ที่หัวของทุกไฟล์ใน bundle ทำให้ `process` และ `Buffer` พร้อมใช้งานทั่วโลกโดยไม่ต้อง import อย่างชัดเจน เหมือนกับที่ Node.js ให้มาแบบดั้งเดิม

---

## `buffer.js` -- `Buffer` บน `Uint8Array`

นี่คือหนึ่งในสอง globals ที่ถูกแทรก `Buffer` ถูกใช้อย่างมหาศาลในโค้ด -- ทุกการดำเนินการ SSH, ทุก VFS snapshot, ทุกการอ่าน/เขียนไบนารี่ล้วนผ่านมัน

วิธีแก้: คลาส `BrowserBuffer` ที่ extends `Uint8Array` และ implement API `Buffer` ทั้งหมดของ Node.js

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

สิ่งที่ถูก implement ทั้งหมด:
- `Buffer.from`, `Buffer.alloc`, `Buffer.allocUnsafe`, `Buffer.isBuffer`, `Buffer.concat`, `Buffer.byteLength`
- วิธีการเขียนทั้งหมด: `writeUInt8/16/32BE/LE`, `writeInt8/16/32BE/LE`, `writeBigUInt64BE/LE`, `writeFloat/DoubleLE/BE`
- วิธีการอ่านที่สอดคล้องกันทั้งหมด
- `toString` รองรับ hex, base64, utf8
- `copy`, `equals`, `slice`, `subarray`

นั่นคือ 116 บรรทัด เทียบกับสิ่งที่มันแทนที่ได้แล้ว ถือว่ากะทัดรัดอย่างน่าทึ่ง

เคล็ดลับหลักคือการใช้ `DataView` สำหรับการเข้าถึงแบบหลายไบต์ ซึ่งจัดการ endianness ได้อย่างถูกต้องโดยไม่ต้องจัดการบิตด้วยมือสำหรับแต่ละประเภท:

```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```

---

## `process.js` -- global `process` แบบขั้นต่ำ

global อีกตัวที่ถูกแทรก เล็กมากแต่จำเป็น -- โค้ดมักจะทดสอบ `process.env.NODE_ENV`, `process.platform`, `process.nextTick` ฯลฯ

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

การแมป `nextTick` → `queueMicrotask` คือรายละเอียดที่สำคัญที่สุดตรงนี้ `process.nextTick` ใน Node.js กำหนดการ callback เมื่อสิ้นสุดเฟสปัจจุบันของ event loop ก่อน I/O `queueMicrotask` ในเบราว์เซอร์ทำสิ่งที่ใกล้เคียงกันในเชิงความหมาย -- มันกำหนดการ microtask ซึ่งจะทำงานก่อนการเรนเดอร์หรือ event ถัดไป มันไม่เหมือนกันทุกประการ แต่มันใกล้เคียงพอที่โค้ดทั้งหมดที่ใช้ `nextTick` จะทำงานได้อย่างถูกต้องในเบราว์เซอร์

---

## `node:fs` -- IndexedDB เป็นระบบไฟล์แบบซิงโครนัส

นี่คือ polyfill ที่ซับซ้อนที่สุด และน่าสนใจทางเทคนิคมากที่สุดโดยเทียบเคียง

ปัญหาคือ: `node:fs` เปิดเผย API แบบซิงโครนัส (`readFileSync`, `writeFileSync` ฯลฯ) แต่ APIs พื้นที่จัดเก็บในเบราว์เซอร์ทั้งหมดเป็นแบบอะซิงโครนัส (IndexedDB, Cache API ฯลฯ) คุณไม่สามารถทำ `await` กลางฟังก์ชันซิงโครนัสได้

วิธีแก้ของ Fortune: แคชสองระดับ

**ระดับ 1 -- Map ในหน่วยความจำ (ซิงโครนัส)**  
การอ่านทั้งหมดทำจาก `Map<string, Uint8Array>` ในหน่วยความจำ ทันที, ซิงโครนัส, ไม่มีปัญหาเรื่อง API

**ระดับ 2 -- IndexedDB (อะซิงโครนัส, ทำงานเบื้องหลัง)**  
เมื่อเริ่มต้น เนื้อหาทั้งหมดของ IndexedDB จะถูกโหลดเข้า Map การเขียนจะเกิดขึ้นทันทีใน Map *และ* เริ่มการเขียนแบบอะซิงโครนัสไปยัง IndexedDB โดยไม่บล็อก

```js
const DB_NAME = 'vfs-fs-shim';
const STORE = 'files';
let db = null;

// Sync cache (path → Uint8Array | null)
const memCache = new Map();

// Preload เมื่อเริ่มต้น
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

// การเขียน async ไปยัง IndexedDB (ไม่บล็อก)
function idbSet(path, value) {
  openDB().then(db => {
    const tx = db.transaction(STORE, 'readwrite');
    if (value === null) tx.objectStore(STORE).delete(path);
    else tx.objectStore(STORE).put(value, path);
  });
}
```

API ที่ถูกเปิดเผยมีความครบถ้วน: `readFileSync`, `writeFileSync`, `appendFileSync`, `existsSync`, `unlinkSync`, `rmSync` (พร้อมตัวเลือก `recursive`), `mkdirSync` (พร้อมตัวเลือก `recursive`), `readdirSync`, `statSync`, `renameSync`

ยังมีเลเยอร์การจัดการ file descriptors (`openSync`, `writeSync`, `closeSync`) เพื่อให้ WAL journal ของ VFS ทำงานในโหมดเบราว์เซอร์ -- journal จะเปิด fd, เขียนลงไป, ปิดมัน, และข้อมูลจะไปอยู่ใน IndexedDB

พร็อพเพอร์ตี้ `ready` ถูก export เพื่อให้โค้ดรู้ว่าการโหลดเริ่มต้นเสร็จสมบูรณ์เมื่อใด:

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

นี่คือสาเหตุที่ VFS snapshots อยู่รอดจากการโหลดหน้าเว็บซ้ำในเบราว์เซอร์ เมื่อคุณโหลดเดโม่ซ้ำ VFS จะถูกกู้คืนในสภาพที่คุณทิ้งไว้อย่างแม่นยำ จาก IndexedDB โดยไม่มีเซิร์ฟเวอร์ใดเกี่ยวข้อง

---

## `node:crypto` -- SHA-256, HMAC, PBKDF2 ใน JS ล้วน

แทนที่จะ import ไลบรารี crypto ที่ถูกคอมไพล์เป็น Wasm Fortune ได้ implement พรีมิทีฟที่จำเป็นโดยตรง

**SHA-256** ถูก implement from scratch ด้วยค่าคงที่ FIPS 180-4:

```js
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, /* ... 60 ค่าคงที่อื่น ๆ */ 
]);

function sha256(data) {
  // padding FIPS 180-4
  const msg = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
  // ...
  // 64 รอบของการบีบอัด
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

บน SHA-256, **HMAC-SHA256** และ **PBKDF2-HMAC-SHA256** ถูกสร้างขึ้น พรีมิทีฟทั้งสองนี้ใช้สำหรับการ derive คีย์ในการแลกเปลี่ยน SSH และการยืนยันตัวตนภายใน

API ที่ถูก export มีลักษณะคล้ายกับของ Node.js:

```js
// Hash ทั่วไป
const hash = createHash('sha256').update('data').digest('hex');

// ไบต์สุ่ม (ผ่าน Web Crypto API มาตรฐาน)
const bytes = randomBytes(32);

// UUID
const id = randomUUID();

// การเปรียบเทียบแบบ timing-safe
const ok = timingSafeEqual(a, b);

// scrypt (ประมาณผ่าน PBKDF2)
const key = scryptSync(password, salt, 32, { N: 16384 });
```

หมายเหตุ: `scryptSync` ถูกประมาณผ่าน PBKDF2 ด้วยจำนวนรอบที่สอดคล้องกับพารามิเตอร์ `N` มันไม่ใช่ scrypt จริง (ซึ่งใช้โครงสร้างหน่วยความจำที่แตกต่าง) แต่สำหรับการใช้งานของโปรเจกต์มันก็เพียงพอ

ฟังก์ชันที่ไม่สามารถจำลองได้อย่างสมเหตุสมผลในเบราว์เซอร์ (`generateKeyPairSync`, `createCipheriv`, `createDecipheriv`, `createSign`) จะ throw ข้อผิดพลาดอย่างชัดเจนหากถูกเรียก เป็นพฤติกรรมที่ซื่อสัตย์

---

## `node:os` -- อ่านสเปกจริงของเบราว์เซอร์

แทนที่จะคืนค่าตายตัว polyfill นี้จะอ่าน APIs ของเบราว์เซอร์เพื่อคืนข้อมูลที่ตรงกับเครื่องจริงของผู้ใช้

```js
export function totalmem() {
  try {
    return navigator?.deviceMemory
      ? navigator.deviceMemory * 1024 * 1024 * 1024
      : 2 * 1024 * 1024 * 1024; // 2 GB โดยค่าเริ่มต้น
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

ผลลัพธ์ที่ได้: เมื่อคุณรัน `neofetch` ในเดโม่เบราว์เซอร์ จำนวนคอร์และ RAM ที่แสดงจะตรงกับเครื่องของคุณ มันเป็นรายละเอียดเล็กน้อย แต่มันมีส่วนอย่างมากต่อความสมจริงของเทอร์มินัล

exports อื่น ๆ: `freemem` (40% ของหน่วยความจำทั้งหมด, การประมาณที่สมเหตุสมผล), `platform` → `'browser'`, `type` → `'Linux'`, `release` → `'web'`, `uptime` ผ่าน `performance.now()`, `endianness` → `'LE'` (little-endian, จริงบนโปรเซสเซอร์ x86/ARM ทั่วไปทั้งหมด), `loadavg` → `[0, 0, 0]`

---

## `node:net` -- stubs TCP ที่สะอาด

เบราว์เซอร์ไม่สามารถเข้าถึง raw TCP sockets (WebSocket ไม่นับ -- มันเป็นโปรโตคอลระดับแอปพลิเคชันที่แตกต่าง) ดังนั้น `node:net` จึงเป็น stub แต่เป็น stub *ที่เขียนได้ดี*

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

จุดสำคัญ: เมธอดการลงทะเบียนเหตุการณ์ (`on`, `once`, `off`, `emit`) คืนค่า `this` และไม่ throw ข้อผิดพลาด ทำให้โค้ดที่ทำ `new net.Socket().on('connect', cb)` ทำงานได้โดยไม่พัง แม้ว่าการเชื่อมต่อจะไม่เกิดขึ้นจริง มีเพียงเมธอดที่ *พยายามเชื่อมต่อจริง ๆ* เท่านั้นที่ throw ข้อผิดพลาด

`isIP`, `isIPv4`, `isIPv6` ถูก implement อย่างถูกต้อง (ไม่ใช่ stubs) เพราะพวกมันถูกใช้โดยโค้ดเครือข่ายเสมือนเพื่อตรวจสอบที่อยู่ โดยไม่ต้องเปิด socket เลย

---

## `node:path` -- การดำเนินการเส้นทางแบบ POSIX

การ implement ใหม่ทั้งหมดของการดำเนินการเส้นทางแบบ POSIX ปรับให้เข้ากับบริบท (ไม่มี backslash ของ Windows, เส้นทางเป็น absolute ด้วย `/` เสมอ)

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

เรียบง่าย กะทัดรัด ถูกต้องสำหรับการใช้งานของโปรเจกต์

---

## `node:url` -- การมอบหมายให้ APIs ของเบราว์เซอร์

อันนี้สวยงามเพราะความเรียบง่ายของมัน API `URL` และ `URLSearchParams` มีอยู่แล้วโดยธรรมชาติในเบราว์เซอร์ -- แค่ต้อง re-export

```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```

มีเพียง `fileURLToPath` และ `pathToFileURL` ที่ต้องการ implement เพราะมันเฉพาะของ Node:

```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```

นี่คือแนวทางที่เหมาะที่สุดเมื่อแพลตฟอร์มเป้าหมาย (เบราว์เซอร์) มีสิ่งที่เทียบเท่าโดยธรรมชาติอยู่แล้ว

---

## `node:zlib` -- identity

```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```

สองบรรทัด ไลบรารีใช้ `fflate` สำหรับการบีบอัดจริง (ซึ่งทำงานในเบราว์เซอร์โดยธรรมชาติ) `node:zlib` ถูก import ใน path ของโค้ดที่ไม่ทำงานในบริบทเบราว์เซอร์เท่านั้น -- ดังนั้น passthrough ก็เพียงพอ

บางครั้งการ implement ที่ดีก็แค่สองบรรทัด

---

## `node:events` -- EventEmitter ขั้นต่ำ

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

การ implement `EventEmitter` เต็มรูปแบบของ Node.js มีประมาณ 600 บรรทัดพร้อมการจัดการ `maxListeners`, `once`, `prependListener` ฯลฯ ที่นี่มันคือ 12 บรรทัดสำหรับ 4 เมธอดที่ใช้งานจริง Tree-shaking ทางความคิดก่อนที่จะถึง tree-shaking ของเครื่องมือ build

---

## `ssh2` และ `roxify` -- stubs ที่ชัดเจน

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

เซิร์ฟเวอร์ SSH ไม่ทำงานในเบราว์เซอร์ (มันไม่สมเหตุสมผล -- ใครจะมาเชื่อมต่อ?) แต่โค้ดที่ *พูดถึง SSH ฝั่งไคลเอ็นต์* -- คลาสที่สร้างแพ็กเก็ต SSH, ตัวแยกวิเคราะห์โปรโตคอล -- มีอยู่ในไลบรารี stubs เหล่านี้ทำให้โค้ดทั้งหมดนี้ถูก bundle ได้โดยไม่มีข้อผิดพลาด พร้อมรับประกันว่าข้อผิดพลาดที่ชัดเจนจะถูก throw ถ้ามีคนพยายามเรียกเมธอดที่ต้องการ socket จริง

`roxify` เป็นรูปแบบการบีบอัดกรรมสิทธิ์ที่ใช้สำหรับ VFS snapshots ในโหมด Node ในเบราว์เซอร์ `fflate` ถูกใช้แทน -- polyfill แค่ throw ข้อผิดพลาดถ้า `roxify` ถูกเรียกโดยตรง

---

## `node:worker_threads` -- การ re-export Web Workers

อันนี้ละเอียดที่สุด `node:worker_threads` ใน Node.js และ Web Workers ของเบราว์เซอร์เป็นสอง APIs ที่แตกต่างกัน แต่มันใกล้เคียงกันในเชิงแนวคิด polyfill ทำการแมป:

```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```

`MessageChannel` และ `MessagePort` ถูก re-export โดยตรงจากเบราว์เซอร์ (API เดียวกัน) `Worker` เองต้องการ wrapper เพราะ constructor แตกต่างกัน (Node คาดหวัง path ของโมดูล, เบราว์เซอร์คาดหวัง URL) `isMainThread` เป็น `true` เสมอฝั่งเบราว์เซอร์ในบริบทนี้

---

## ภาพรวม: สิ่งที่ 640 บรรทัดนี้เป็นตัวแทน

| Polyfill | บรรทัด | กลยุทธ์ |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array` + `DataView`, API `Buffer` ทั้งหมด |
| `node:crypto` | 166 | SHA-256/HMAC/PBKDF2 from scratch + Web Crypto สำหรับ randoms |
| `node:fs` | 210 | `Map` ในหน่วยความจำ + IndexedDB async |
| `node:net` | 70 | Stubs ที่ chainable ได้ + การตรวจสอบ IP จริง |
| `ssh2` | 74 | Stubs ที่ชัดเจน |
| `process.js` | 14 | `process` ขนาดเล็กที่สุดที่ใช้งานได้ |
| `node:path` | ~30 | การดำเนินการเส้นทางแบบ POSIX |
| `node:url` | ~25 | มอบหมายให้ browser APIs |
| `node:events` | ~12 | EventEmitter 4 เมธอด |
| `node:os` | ~25 | `navigator.deviceMemory` / `hardwareConcurrency` |
| `node:zlib` | 4 | Passthrough |
| `node:worker_threads` | ~30 | Re-export Web Workers |
| `roxify.js` | 8 | Stubs |

640 บรรทัด ไม่มีการพึ่งพา npm ไม่มี Wasm และมันให้ bundle สำหรับเบราว์เซอร์ที่เริ่มต้นในเวลาไม่ถึงวินาทีและทำงานโดยไม่มีโครงสร้างพื้นฐานฝั่งเซิร์ฟเวอร์ใด ๆ

---

## สิ่งที่เราเรียนรู้ได้

ครั้งหน้าที่คุณต้องการพอร์ตไลบรารี Node.js ไปยังเบราว์เซอร์ นี่คือสิ่งที่แนวทางของ Fortune แสดงให้เห็น:

1. **ระบุสิ่งที่ใช้งานจริง** ไม่จำเป็นต้อง implement `EventEmitter` ทั้งหมดถ้าโค้ดใช้แค่ `on`, `emit`, และ `removeListener`

2. **มอบหมายให้ browser APIs เมื่อเป็นไปได้** `URL`, `URLSearchParams`, `MessageChannel`, `MessagePort`, `crypto.getRandomValues` -- เบราว์เซอร์มีสิ่งเหล่านี้อยู่แล้ว ใช้มันให้เป็นประโยชน์

3. **แคชซิงโครนัสหน้า async API** วิธีแก้แบบ `Map` + IndexedDB สำหรับ `node:fs` เป็น pattern ที่นำกลับมาใช้ซ้ำได้มากที่สุดในทั้งโฟลเดอร์

4. **stubs ที่ซื่อสัตย์ดีกว่าการ implement ที่ไม่สมบูรณ์อย่างเงียบ ๆ** การ `throw new Error('not implemented in browser')` อย่างชัดเจนมีประโยชน์มากกว่า `return undefined` ที่ปล่อยให้บั๊กแสดงตัวอีก 10 การเรียกข้างหน้า

5. **esbuild `alias` + `inject` ถูกประเมินค่าต่ำเกินไป** มันเป็นเครื่องมือที่สมบูรณ์แบบสำหรับการพอร์ตแบบนี้ -- ไม่ต้องกำหนดค่า webpack, ไม่ต้องมีปลั๊กอิน, แค่รายการการแทนที่

---

โค้ดอยู่ใน repo: [github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills) แต่ละไฟล์อยู่ในหน้าเดียว สามารถอ่านได้โดยตรงบน GitHub แนะนำอย่างยิ่งถ้าคุณทำงานบนโปรเจกต์ที่คล้ายกัน
