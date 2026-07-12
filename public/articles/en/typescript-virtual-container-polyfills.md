---
itle: Running a Node.js library in the browser without Wasm --
  typescript-virtual-container's polyfills
description: How Fortune hand-rewrote node:fs, node:crypto, and a dozen more
  Node modules in 640 lines of JavaScript so the container runs in the browser
  without Wasm.
date: 2026-05-29
aiGenerated: trueauthors:
  - fox3000foxy
tags:
  - typescript
  - nodejs
  - polyfills
  - browser
  - open-source
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "LWbwBtsfUnrroU9bA+924AGFNM3huXhbPmi8+2KQytAyltUxQrIOsDGmcl/xqDMpVXNI3WBvwxUYD855BuG8Pw=="
---

# Running a Node.js library in the browser without Wasm -- typescript-virtual-container's polyfills

I recently spent a good chunk of time diving into the source code of [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container), Fortune ([Chloé Rolzhausen](https://itsrealfortune.fr))'s project. And the part that surprised me the most wasn't the VFS, wasn't the virtual network, wasn't the 170 Unix commands reimplemented in TypeScript. It was the `polyfills/` directory.

Because the module runs in the browser, without Wasm, and for that Fortune reimplemented by hand the entire `node:*` layer the library needs. About 640 lines of handcrafted JavaScript replacing `node:fs`, `node:crypto`, `node:os`, `node:net`, and a few others.

This article explains how it works, polyfill by polyfill.

---

## The basic problem

A Node.js library uses APIs that don't exist in the browser. When you write `import { readFileSync } from 'node:fs'`, that's a system call on the Node side -- real disk access via libuv. In the browser, `node:fs` doesn't exist at all.

The usual solutions are:

- **A Wasm runtime** (Emscripten, WASIp1/WASIp2) -- compile Node.js to Wasm and run it. Result: 10-50 MB bundles, noticeable load time, significant deployment complexity.
- **Generic polyfills** (`browserify`, `webpack node: polyfills`) -- npm libraries providing approximations of each Node module. Often too heavy, poorly suited to the specific use case.
- **Write the polyfills by hand** -- more work, but optimal result.

Fortune chose the third option. And the result is a browser bundle that's just the library, starts instantly, and doesn't depend on any external infrastructure.

---

## The build mechanism

Everything relies on esbuild and its `alias` option. Each `node:*` import is redirected to a local file:

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

The `inject` option is worth noting: it injects `process.js` and `buffer.js` at the top of every bundled file, making `process` and `Buffer` globally available without any explicit import. Exactly like Node.js exposes them natively.

---

## `buffer.js` -- `Buffer` on `Uint8Array`

This is one of the two injected globals. `Buffer` is heavily used in the code -- every SSH operation, every VFS snapshot, every binary read/write goes through it.

The solution: a `BrowserBuffer` class extending `Uint8Array` that implements the full Node.js `Buffer` API.

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
- All corresponding read methods
- `toString` with hex, base64, utf8 support
- `copy`, `equals`, `slice`, `subarray`

That's 116 lines. For what it replaces, that's remarkably compact.

The main trick is using `DataView` for multi-byte access, which correctly handles endianness without having to manipulate bits by hand for every type:

```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```

---

## `process.js` -- the minimal `process` global

The other injected global. Tiny but necessary -- the code often checks `process.env.NODE_ENV`, `process.platform`, `process.nextTick`, etc.

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

The `nextTick` → `queueMicrotask` mapping is the most important detail here. `process.nextTick` in Node.js schedules a callback at the end of the current phase of the event loop, before I/O. `queueMicrotask` in the browser does something semantically very close -- it schedules a microtask that runs before the next render or event. It's not identical, but it's close enough that all the code using `nextTick` works correctly in the browser.

---

## `node:fs` -- IndexedDB as a synchronous file system

This is the most sophisticated polyfill, and by far the most technically interesting.

The problem is tricky: `node:fs` exposes a synchronous API (`readFileSync`, `writeFileSync`, etc.), but browser storage APIs are all asynchronous (IndexedDB, Cache API, etc.). You can't `await` in the middle of a synchronous function.

Fortune's solution: a two-level cache.

**Level 1 -- In-memory Map (synchronous)**  
All reads happen from an in-memory `Map<string, Uint8Array>`. Instant, synchronous, no API mismatch.

**Level 2 -- IndexedDB (asynchronous, background)**  
On startup, all IndexedDB content is loaded into the Map. Writes happen immediately to the Map *and* trigger an asynchronous write to IndexedDB without blocking.

```js
const DB_NAME = 'vfs-fs-shim';
const STORE = 'files';
let db = null;

// Sync cache (path → Uint8Array | null)
const memCache = new Map();

// Preload on startup
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

There's even a file descriptor management layer (`openSync`, `writeSync`, `closeSync`) so the VFS's WAL journal works in browser mode -- the journal opens an fd, writes to it, closes it, and the data ends up in IndexedDB.

The `ready` property is exported so code can know when the initial preload is finished:

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

This is how VFS snapshots survive page reloads in the browser. When you reload the demo, the VFS is restored exactly as you left it, from IndexedDB, without any server involvement.

---

## `node:crypto` -- SHA-256, HMAC, PBKDF2 in pure JS

Rather than importing a crypto library compiled to Wasm, Fortune implemented the needed primitives directly.

**SHA-256** is implemented from scratch with the FIPS 180-4 constants:

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

On top of SHA-256, **HMAC-SHA256** and **PBKDF2-HMAC-SHA256** are built. These two primitives are used for key derivation in SSH exchanges and internal authentication.

The exported API mirrors Node.js:

```js
// Standard hash
const hash = createHash('sha256').update('data').digest('hex');

// Random bytes (via Web Crypto API)
const bytes = randomBytes(32);

// UUID
const id = randomUUID();

// Timing-safe comparison
const ok = timingSafeEqual(a, b);

// scrypt (approximated via PBKDF2)
const key = scryptSync(password, salt, 32, { N: 16384 });
```

Note: `scryptSync` is approximated via PBKDF2 with an iteration count calibrated to the `N` parameter. It's not real scrypt (which uses a different memory-hard scheme), but it's sufficient for the project's use cases.

Functions that can't reasonably be emulated in the browser (`generateKeyPairSync`, `createCipheriv`, `createDecipheriv`, `createSign`) throw an explicit error if called. Honest behavior.

---

## `node:os` -- reading real browser specs

Instead of returning fixed values, this polyfill reads browser APIs to return information matching the user's real machine.

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

Concrete result: when you run `neofetch` in the browser demo, the core count and RAM shown match your actual machine. It's a detail, but it contributes enormously to the terminal's believability.

Other exports: `freemem` (40% of total memory, reasonable approximation), `platform` → `'browser'`, `type` → `'Linux'`, `release` → `'web'`, `uptime` via `performance.now()`, `endianness` → `'LE'` (true on all consumer x86/ARM CPUs), `loadavg` → `[0, 0, 0]`.

---

## `node:net` -- clean TCP stubs

The browser doesn't have access to raw TCP sockets (WebSocket doesn't count -- it's a different application-layer protocol). `node:net` is therefore a stub, but a *well-written* stub.

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

The key point: the event registration methods (`on`, `once`, `off`, `emit`) return `this` and don't throw. This lets code doing `new net.Socket().on('connect', cb)` work without crashing, even though the connection never happens. Only methods that *actually attempt to connect* throw an error.

`isIP`, `isIPv4`, `isIPv6` are implemented correctly (not stubs) because they're used by the virtual network code to validate addresses without ever opening a socket.

---

## `node:path` -- POSIX path operations

Complete reimplementation of POSIX path operations, adapted to context (no Windows backslashes, paths always absolute with `/`).

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

Simple, compact, correct for the project's use cases.

---

## `node:url` -- delegation to browser APIs

This one is elegant in its simplicity. The `URL` and `URLSearchParams` APIs already exist natively in the browser -- just re-export them.

```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```

Only `fileURLToPath` and `pathToFileURL` need an implementation, since they're Node-specific:

```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```

This is the ideal approach when the target platform (the browser) already provides the native equivalent.

---

## `node:zlib` -- identity

```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```

Two lines. The library uses `fflate` for actual compression (which works in the browser natively). `node:zlib` is only imported in code paths that don't execute in the browser context -- so a passthrough is sufficient.

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

Node.js's full `EventEmitter` implementation is ~600 lines with `maxListeners`, `once`, `prependListener`, etc. Here it's 12 lines for the 4 methods actually used. Mental tree-shaking before the build tool's tree-shaking.

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

The SSH server doesn't run in the browser (it wouldn't make sense -- who would connect?). But the code that *talks about SSH on the client side* -- the classes building SSH packets, the protocol parsers -- exists in the library. These stubs let all that code be bundled without error, while ensuring a clear error is thrown if someone tries to call a method that needs a real socket.

`roxify` is a proprietary compression format used for VFS snapshots in Node mode. In the browser, `fflate` is used instead -- the polyfill just throws an error if `roxify` is called directly.

---

## `node:worker_threads` -- re-exporting Web Workers

This is the subtlest one. `node:worker_threads` in Node.js and Web Workers in the browser are different APIs, but they're conceptually close. The polyfill maps them:

```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```

`MessageChannel` and `MessagePort` are re-exported directly from the browser (same API). `Worker` itself needs a wrapper because the constructor differs (Node expects a module path, the browser expects a URL). `isMainThread` is always `true` on the browser side in this context.

---

## Overview: what these 640 lines represent

| Polyfill | Lines | Strategy |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array` + `DataView`, full `Buffer` API |
| `node:crypto` | 166 | SHA-256/HMAC/PBKDF2 from scratch + Web Crypto for randoms |
| `node:fs` | 210 | In-memory `Map` + async IndexedDB |
| `node:net` | 70 | Chainable stubs + real IP validation |
| `ssh2` | 74 | Explicit stubs |
| `process.js` | 14 | Minimal viable `process` |
| `node:path` | ~30 | POSIX path ops |
| `node:url` | ~25 | Browser API delegation |
| `node:events` | ~12 | EventEmitter 4 methods |
| `node:os` | ~25 | `navigator.deviceMemory` / `hardwareConcurrency` |
| `node:zlib` | 4 | Passthrough |
| `node:worker_threads` | ~30 | Web Workers re-export |
| `roxify.js` | 8 | Stubs |

640 lines. Zero npm dependencies. Zero Wasm. And it produces a browser bundle that starts in under a second and runs without any server-side infrastructure.

---

## Takeaways

Next time you want to port a Node.js library to the browser, here's what Fortune's approach demonstrates:

1. **Identify what's actually used.** No need to implement the full `EventEmitter` if the code only uses `on`, `emit`, and `removeListener`.

2. **Delegate to browser APIs when possible.** `URL`, `URLSearchParams`, `MessageChannel`, `MessagePort`, `crypto.getRandomValues` -- the browser already has them, might as well use them.

3. **Synchronous cache in front of an async API.** The `Map` + IndexedDB solution for `node:fs` is the most reusable pattern in the entire polyfill directory.

4. **Honest stubs are better than silently incomplete implementations.** An explicit `throw new Error('not implemented in browser')` is infinitely more useful than a `return undefined` that lets the bug surface 10 calls later.

5. **esbuild `alias` + `inject` is underrated.** It's the perfect tool for this kind of porting -- zero webpack config, zero plugins, just a list of replacements.

---

The code is in the repo: [github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills). Every file fits on a single page, readable directly on GitHub. Highly recommended if you're working on a similar project.
