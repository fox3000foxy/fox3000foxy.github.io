---
title: Running a Node.js Library in the Browser Without Wasm --
  typescript-virtual-container's polyfills
description: How Fortune hand-reimplemented node:fs, node:crypto, and
  a dozen Node modules in 640 lines of JavaScript so the container
  runs in the browser with no Wasm.
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
author_sig: "4TOVs/nYYk79FmxWPSWs7iDPXLilAzj0v5R1CNq9nmXfx0mt6oYfV+3hB1/NjjlQPyIo23rNyhYsBkYvnn5/uA=="
---

# Running a Node.js library in the browser without Wasm -- typescript-virtual-container's polyfills

I recently spent quite a while combing through the source code of [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container), [Fortune (Chloé Rolzhausen)](https://itsrealfortune.fr)'s project. And the part that surprised me most is the `polyfills/` folder, even more than the VFS, the virtual network, or the 170 Unix commands reimplemented in TypeScript.

Because the module runs in the browser, with no Wasm, and for that, Fortune hand-reimplemented the whole `node:*` layer the library needs. About 640 lines of handcrafted JavaScript replacing `node:fs`, `node:crypto`, `node:os`, `node:net`, and a few others.

This article explains how it works, polyfill by polyfill.

---

## The base problem

A Node.js library uses APIs that don't exist in the browser. When you write `import { readFileSync } from 'node:fs'`, that's a Node-side system call -- real disk access via libuv. In the browser, `node:fs` doesn't exist at all.

The usual solutions are:

- **A Wasm runtime** (Emscripten style, WASIp1/WASIp2) -- you compile Node.js to Wasm and run it. Result: 10-50MB bundles, noticeable load time, significant deploy complexity.
- **Generic polyfills** (like `browserify`, `webpack node: polyfills`) -- npm libraries providing approximations of each Node module. Often too heavy, poorly suited to the specific case.
- **Hand-writing the polyfills** -- more work, but optimal result.

Fortune picked the third option. And the result is a browser bundle that is just the library, booting instantly, depending on no outside infrastructure.

---

## The build mechanics

Everything rests on esbuild and its `alias` option. Each `node:*` import redirects to a local file:

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

The `inject` option deserves a note: it injects `process.js` and `buffer.js` at the top of every bundle file, making `process` and `Buffer` globally available with no explicit import. Exactly like Node.js exposes them natively.

---

## `buffer.js` -- `Buffer` on `Uint8Array`

It's one of the two injected globals. `Buffer` is massively used in the code -- every SSH op, every VFS snapshot, every binary read/write goes through it.

The solution: a `BrowserBuffer` class extending `Uint8Array` and implementing Node.js's whole `Buffer` API.

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

What's implemented in total:
- `Buffer.from`, `Buffer.alloc`, `Buffer.allocUnsafe`, `Buffer.isBuffer`, `Buffer.concat`, `Buffer.byteLength`
- All write methods: `writeUInt8/16/32BE/LE`, `writeInt8/16/32BE/LE`, `writeBigUInt64BE/LE`, `writeFloat/DoubleLE/BE`
- All matching read methods
- `toString` with hex, base64, utf8 support
- `copy`, `equals`, `slice`, `subarray`

That's 116 lines. For what it replaces, it's remarkably compact.

The main trick is using `DataView` for multi-byte access, which correctly handles endianness without hand-mangling bits for each type:

```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```

---

## `process.js` -- the minimal `process` global

The other injected global. Tiny but necessary -- code often tests `process.env.NODE_ENV`, `process.platform`, `process.nextTick`, etc.

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

The `nextTick` → `queueMicrotask` mapping is the most important detail here. `process.nextTick` in Node.js schedules a callback at the end of the current event-loop phase, before I/O. `queueMicrotask` in the browser offers very close semantics: it schedules a microtask, running before the next render or event, and that closeness is enough for all code using `nextTick` to work correctly in the browser.

---

## `node:fs` -- IndexedDB as a synchronous filesystem

The most sophisticated polyfill, and by far the most technically interesting.

The problem is tricky: `node:fs` exposes a synchronous API (`readFileSync`, `writeFileSync`, ...), but browser storage APIs are all async (IndexedDB, Cache API, ...). You can't `await` in the middle of a sync function.

Fortune's solution: a two-level cache.

**Level 1 -- in-memory Map (sync)**
All reads come from an in-memory `Map<string, Uint8Array>`. Instant, sync, no API problem.

**Level 2 -- IndexedDB (async, in background)**
At startup, all of IndexedDB's content loads into the Map. Writes go immediately into the Map *and* fire an async write to IndexedDB without blocking.

```js
const DB_NAME = 'vfs-fs-shim';
const STORE = 'files';
let db = null;

// Sync cache (path → Uint8Array | null)
const memCache = new Map();

// Preload at startup
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

// Async write to IndexedDB (non-blocking)
function idbSet(path, value) {
  openDB().then(db => {
    const tx = db.transaction(STORE, 'readwrite');
    if (value === null) tx.objectStore(STORE).delete(path);
    else tx.objectStore(STORE).put(value, path);
  });
}
```

The exposed API is complete: `readFileSync`, `writeFileSync`, `appendFileSync`, `existsSync`, `unlinkSync`, `rmSync` (with `recursive` option), `mkdirSync` (with `recursive` option), `readdirSync`, `statSync`, `renameSync`.

There's even a file-descriptor layer (`openSync`, `writeSync`, `closeSync`) so the VFS WAL journal works in browser mode -- the journal opens an fd, writes into it, closes it, and the data lands in IndexedDB.

The `ready` property is exported so code can know when the initial preload is done:

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

That's how VFS snapshots survive page reloads in the browser. When you reload the demo, the VFS restores to exactly the state you left it in, from IndexedDB, with no server involved.

---

## `node:crypto` -- SHA-256, HMAC, PBKDF2 in pure JS

Rather than importing a Wasm-compiled crypto library, Fortune implemented the needed primitives directly.

**SHA-256** is implemented from scratch with FIPS 180-4 constants:

```js
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, /* ... 60 more constants */ 
]);

function sha256(data) {
  // FIPS 180-4 padding
  const msg = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
  // ...
  // 64 compression rounds
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

On top of SHA-256, **HMAC-SHA256** and **PBKDF2-HMAC-SHA256** are built. Those two primitives serve key derivation in SSH exchanges and internal authentication.

The exported API looks like Node.js's:

```js
// Classic hash
const hash = createHash('sha256').update('data').digest('hex');

// Random bytes (via the standard Web Crypto API)
const bytes = randomBytes(32);

// UUID
const id = randomUUID();

// Timing-safe comparison
const ok = timingSafeEqual(a, b);

// scrypt (approximated via PBKDF2)
const key = scryptSync(password, salt, 32, { N: 16384 });
```

Note: `scryptSync` is approximated via PBKDF2 with an iteration count tuned to the `N` parameter. That approximation replaces scrypt's memory-specific scheme and covers the project's uses.

Functions that can't reasonably be emulated in the browser (`generateKeyPairSync`, `createCipheriv`, `createDecipheriv`, `createSign`) throw an explicit error if called. Honest behavior.

---

## `node:os` -- reading the browser's real specs

Instead of returning hardcoded values, this polyfill reads browser APIs to return info matching the user's real machine.

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

Concrete result: when you run `neofetch` in the browser demo, the core count and RAM shown match your machine. It's a detail, but it hugely contributes to the terminal's believability.

Other exports: `freemem` (40% of total memory, reasonable approximation), `platform` → `'browser'`, `type` → `'Linux'`, `release` → `'web'`, `uptime` via `performance.now()`, `endianness` → `'LE'` (little-endian, true on all mainstream x86/ARM CPUs), `loadavg` → `[0, 0, 0]`.

---

## `node:net` -- clean TCP stubs

The browser has no raw TCP socket access (WebSocket doesn't count -- it's a different application protocol). So `node:net` is a stub, but a well-written one.

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

The important point: event-registration methods (`on`, `once`, `off`, `emit`) return `this` and don't throw. That lets code doing `new net.Socket().on('connect', cb)` run without crashing, even if the connection never happens. Only methods that *actually try connecting* throw.

`isIP`, `isIPv4`, `isIPv6` are correctly implemented (with real validation logic) since the virtual network code uses them to validate addresses, never opening a socket.

---

## `node:path` -- POSIX path operations

Full reimplementation of POSIX path ops, adapted to context (paths always absolute with `/`, Unix-style only).

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

Simple, compact, correct for the project's uses.

---

## `node:url` -- delegating to browser APIs

This one is elegant in its simplicity. The `URL` and `URLSearchParams` APIs already exist natively in the browser -- just re-export them.

```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```

Only `fileURLToPath` and `pathToFileURL` need implementing, since they're Node-specific:

```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```

That's the ideal approach when the target platform (the browser) already provides the native equivalent.

---

## `node:zlib` -- identity

```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```

Two lines. The library uses `fflate` for real compression (which works natively in the browser). `node:zlib` is only imported in code paths that don't run in browser context -- so a passthrough suffices.

Sometimes the right implementation is two lines.

---

## `node:events` -- minimal EventEmitter

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

Node.js's full `EventEmitter` is ~600 lines with `maxListeners`, `once`, `prependListener`, etc. Here it's 12 lines for the 4 actually used methods. Mental tree-shaking before the build tool's tree-shaking.

---

## `ssh2` and `roxify` -- explicit stubs

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

The SSH server doesn't run in the browser (it would make no sense -- who would connect?). But the code that *talks about SSH client-side* -- classes building SSH packets, protocol parsers -- exists in the library. Those stubs let all that code bundle without errors, while guaranteeing a clear error if someone calls a method needing a real socket.

`roxify` is a proprietary compression format used for VFS snapshots in Node mode. In the browser, `fflate` is used instead -- the polyfill just throws if `roxify` gets called directly.

---

## `node:worker_threads` -- re-exporting Web Workers

The subtlest one. `node:worker_threads` in Node.js and browser Web Workers are two different APIs, but conceptually close. The polyfill maps them:

```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```

`MessageChannel` and `MessagePort` re-export straight from the browser (same API). `Worker` itself needs a wrapper since the constructor differs (Node expects a module path, the browser expects a URL). `isMainThread` is always `true` in the browser in this context.

---

## Overview: what those 640 lines represent

| Polyfill | Lines | Strategy |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array` + `DataView`, full `Buffer` API |
| `node:crypto` | 166 | SHA-256/HMAC/PBKDF2 from scratch + Web Crypto for randoms |
| `node:fs` | 210 | In-memory `Map` + async IndexedDB |
| `node:net` | 70 | Chainable stubs + real IP validations |
| `ssh2` | 74 | Explicit stubs |
| `process.js` | 14 | Minimal viable `process` |
| `node:path` | ~30 | POSIX path ops |
| `node:url` | ~25 | Delegation to browser APIs |
| `node:events` | ~12 | 4-method EventEmitter |
| `node:os` | ~25 | `navigator.deviceMemory` / `hardwareConcurrency` |
| `node:zlib` | 4 | Passthrough |
| `node:worker_threads` | ~30 | Web Workers re-export |
| `roxify.js` | 8 | Stubs |

640 lines. No npm dependencies. No Wasm. And it gives a browser bundle booting in under a second and running with zero server-side infrastructure.

---

## What to take from it

Next time you want to port a Node.js library to the browser, here's what Fortune's approach demonstrates:

1. **Identify what's actually used.** Only implement methods the code calls: here `on`, `emit`, and `removeListener` suffice for EventEmitter.

2. **Delegate to browser APIs when possible.** `URL`, `URLSearchParams`, `MessageChannel`, `MessagePort`, `crypto.getRandomValues` -- the browser already has them, use them.

3. **Sync cache in front of an async API.** The `Map` + IndexedDB solution for `node:fs` is the most reusable pattern in the whole folder.

4. **Honest stubs beat silently incomplete implementations.** An explicit `throw new Error('not implemented in browser')` is infinitely more useful than a `return undefined` letting the bug surface 10 calls later.

5. **esbuild `alias` + `inject` is underrated.** It's the perfect tool for that kind of port -- zero webpack config, zero plugin, just a replacement list.

---

The code is in the repo: [github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills). Each file fits on a single page, readable directly on GitHub. Strongly recommended if you're working on a similar project.
