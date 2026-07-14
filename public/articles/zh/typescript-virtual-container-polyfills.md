---
title: 如何让 Node.js 库在浏览器中运行而无需 Wasm -- typescript-virtual-container 的 polyfill
description: Fortune 如何用 640 行 JavaScript 手动重新实现了 node:fs、node:crypto 等一打 Node
  模块，让容器在浏览器中无需 Wasm 即可运行。
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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "0MFrZQH+KKI9mVoX0ODW8JSZMz7ce5NKHSnTXwZ92CtU6Ra4sdF1X340CssftPC4qLILfY6L3dsHK5lZbCgz5A=="
---

# 如何让 Node.js 库在浏览器中运行而无需 Wasm -- typescript-virtual-container 的 polyfill

我最近花了不少时间阅读 [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) 的源代码，这是 [Fortune (Chloé Rolzhausen)](https://itsrealfortune.fr) 的项目。最让我惊讶的部分不是 VFS，不是虚拟网络，也不是用 TypeScript 重写的 170 个 Unix 命令，而是 `polyfills/` 文件夹。

因为这个模块在浏览器中运行，没有 Wasm，而且为此 Fortune 手动重写了库所需的整个 `node:*` 层。大约 640 行手工 JavaScript，替代了 `node:fs`、`node:crypto`、`node:os`、`node:net` 等模块。

这篇文章将逐一解释每个 polyfill 的工作原理。

---

## 基本问题

Node.js 库使用了浏览器中不存在的 API。当你写 `import { readFileSync } from 'node:fs'` 时，这是 Node 端的系统调用 ---- 通过 libuv 的真实磁盘访问。在浏览器中，`node:fs` 根本不存在。

常见的解决方案：

- **Wasm 运行时**（如 Emscripten、WASIp1/WASIp2）---- 你把 Node.js 编译成 Wasm 然后运行它。结果：10-50 MB 的 bundle，明显的加载时间，显著的部署复杂度。
- **通用 polyfill**（如 `browserify`、`webpack node: polyfills`）---- 提供每个 Node 模块近似实现的 npm 库。通常过于臃肿，不适合特定场景。
- **手写 polyfill** ---- 工作量更大，但结果最优。

Fortune 选择了第三个方案。结果就是：一个纯粹的浏览器端 bundle，即刻启动，不依赖任何外部基础设施。

---

## 构建机制

一切都基于 esbuild 及其 `alias` 选项。每个 `node:*` 导入都被重定向到本地文件：

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

`inject` 选项值得注意：它允许将 `process.js` 和 `buffer.js` 注入到 bundle 中每个文件的开头，使 `process` 和 `Buffer` 全局可用，无需任何显式导入。这正是 Node.js 原生提供它们的方式。

---

## `buffer.js` -- 基于 `Uint8Array` 的 `Buffer`

这是两个全局注入文件之一。`Buffer` 在代码中被大量使用 ---- 每次 SSH 操作、每个 VFS 快照、每次二进制读写都经过它。

解决方案：一个继承 `Uint8Array` 并实现 Node.js 全部 `Buffer` API 的 `BrowserBuffer` 类。

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

总共实现了：
- `Buffer.from`、`Buffer.alloc`、`Buffer.allocUnsafe`、`Buffer.isBuffer`、`Buffer.concat`、`Buffer.byteLength`
- 所有写入方法：`writeUInt8/16/32BE/LE`、`writeInt8/16/32BE/LE`、`writeBigUInt64BE/LE`、`writeFloat/DoubleLE/BE`
- 所有相应的读取方法
- 支持 hex、base64、utf8 的 `toString`
- `copy`、`equals`、`slice`、`subarray`

这只有 116 行。考虑到它替代的内容，相当紧凑。

主要的技巧是使用 `DataView` 进行多字节访问，它正确处理了字节序，无需为每种类型手动操作位：

```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```

---

## `process.js` -- 最小的全局 `process`

另一个全局注入文件。很小但必不可少 ---- 代码经常检查 `process.env.NODE_ENV`、`process.platform`、`process.nextTick` 等。

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

`nextTick` → `queueMicrotask` 的映射是最重要的细节。Node.js 中的 `process.nextTick` 在当前事件循环阶段结束时、I/O 之前调度一个回调。浏览器中的 `queueMicrotask` 在语义上非常接近 ---- 它调度一个微任务，在下次渲染或事件之前执行。这不完全相同，但对于使用 `nextTick` 的所有代码来说，已经足够在浏览器中正常运行。

---

## `node:fs` -- 将 IndexedDB 用作同步文件系统

这是最复杂的 polyfill，也是技术上最有趣的一个。

问题很微妙：`node:fs` 提供的是同步 API（`readFileSync`、`writeFileSync` 等），但浏览器的存储 API 都是异步的（IndexedDB、Cache API 等）。你不能在同步函数中间执行 `await`。

Fortune 的解决方案：双层缓存。

**第一层 -- 内存中的 Map（同步）**  
所有读取都从内存中的 `Map<string, Uint8Array>` 进行。即时、同步、没有 API 问题。

**第二层 -- IndexedDB（异步、后台）**  
启动时，IndexedDB 的所有内容被加载到 Map 中。写入立即进入 Map *并*启动异步写入 IndexedDB，不会阻塞。

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

暴露的 API 很完整：`readFileSync`、`writeFileSync`、`appendFileSync`、`existsSync`、`unlinkSync`、`rmSync`（支持 `recursive` 选项）、`mkdirSync`（支持 `recursive` 选项）、`readdirSync`、`statSync`、`renameSync`。

甚至还有一个文件描述符管理层（`openSync`、`writeSync`、`closeSync`），让 VFS 的 WAL 日志在浏览器模式下工作 ---- 日志打开一个 fd，写入数据，关闭它，数据最终存入 IndexedDB。

导出 `ready` 属性，让代码知道初始预加载何时完成：

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

正是凭借这一点，VFS 快照才能在浏览器中跨页面刷新而持久存在。当你刷新演示页面时，VFS 会从 IndexedDB 恢复到之前的状态，无需任何服务器参与。

---

## `node:crypto` -- 纯 JS 实现的 SHA-256、HMAC、PBKDF2

Fortune 没有导入编译成 Wasm 的加密库，而是直接实现了所需的原语。

**SHA-256** 使用 FIPS 180-4 常量从头实现：

```js
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, /* ... 60 other constants */ 
]);

function sha256(data) {
  // padding FIPS 180-4
  const msg = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
  // ...
  // 64 rounds of compression
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

在 SHA-256 之上构建了 **HMAC-SHA256** 和 **PBKDF2-HMAC-SHA256**。这两个原语用于 SSH 密钥交换和内部认证中的密钥派生。

导出的 API 类似于 Node.js 的 API：

```js
// Classic hash
const hash = createHash('sha256').update('data').digest('hex');

// Random bytes (via standard Web Crypto API)
const bytes = randomBytes(32);

// UUID
const id = randomUUID();

// Timing-safe comparison
const ok = timingSafeEqual(a, b);

// scrypt (approximated via PBKDF2)
const key = scryptSync(password, salt, 32, { N: 16384 });
```

注意：`scryptSync` 是通过 PBKDF2 近似的，迭代次数与参数 `N` 对应。这不是真正的 scrypt（它使用不同的内存方案），但对项目的用途来说已经足够了。

无法合理在浏览器中模拟的函数（`generateKeyPairSync`、`createCipheriv`、`createDecipheriv`、`createSign`）在被调用时会抛出明确的错误。诚实的行为。

---

## `node:os` -- 读取浏览器的真实规格

这个 polyfill 不是返回固定值，而是读取浏览器的 API 来返回用户真实机器的信息。

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

实际效果：当你在浏览器演示中运行 `neofetch` 时，显示的核心数和内存数量与实际机器一致。这是一个小细节，但对终端的真实感贡献巨大。

其他导出项：`freemem`（总内存的 40%，合理的近似值）、`platform` → `'browser'`、`type` → `'Linux'`、`release` → `'web'`、通过 `performance.now()` 实现的 `uptime`、`endianness` → `'LE'`（小端序，对所有主流 x86/ARM 处理器都成立）、`loadavg` → `[0, 0, 0]`。

---

## `node:net` -- 干净的存根

浏览器无法访问原始 TCP 套接字（WebSocket 不算 ---- 这是一个不同的应用层协议）。所以 `node:net` 是一个存根，但是一个*写得很好*的存根。

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

关键点：事件注册方法（`on`、`once`、`off`、`emit`）返回 `this` 且不抛出错误。这使得执行 `new net.Socket().on('connect', cb)` 的代码能正常运行而不会崩溃，即使连接从未建立。只有*实际尝试连接*的方法才抛出错误。

`isIP`、`isIPv4`、`isIPv6` 被正确实现（不是存根），因为它们被虚拟网络代码用来验证地址，而无需打开套接字。

---

## `node:path` -- POSIX 路径操作

完整的 POSIX 路径操作重实现，适应当前上下文（没有 Windows 反斜杠，路径总是以 `/` 开头的绝对路径）。

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

简单、紧凑、对项目用途来说正确。

---

## `node:url` -- 委托给浏览器 API

这个因其简洁性而优雅。`URL` 和 `URLSearchParams` API 已经原生存在于浏览器中 ---- 只需重新导出它们即可。

```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```

只有 `fileURLToPath` 和 `pathToFileURL` 需要实现，因为它们特定于 Node：

```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```

当目标平台（浏览器）已经提供了原生等价物时，这是理想的做法。

---

## `node:zlib` -- 透传

```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```

两行代码。库使用 `fflate` 进行实际的压缩（它在浏览器中原生工作）。`node:zlib` 只在不会在浏览器上下文中执行的代码路径中被导入 ---- 因此透传就足够了。

有时候正确的实现就是两行代码。

---

## `node:events` -- 最小的 EventEmitter

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

Node.js 中 `EventEmitter` 的完整实现约 600 行，包含 `maxListeners`、`once`、`prependListener` 等处理。这里只有 12 行代码处理实际使用的 4 个方法。在构建工具进行 tree-shaking 之前，先做了心智层面的 tree-shaking。

---

## `ssh2` 和 `roxify` -- 显式存根

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

SSH 服务器不在浏览器中运行（这没有意义 ---- 谁会连接进来？）。但是*在客户端侧谈论 SSH* 的代码 ---- 构建 SSH 包的类、协议解析器 ---- 存在于库中。这些存根让所有这些代码能够被打包而不会出错，同时确保如果有人尝试调用需要真实套接字的方法，会抛出明确的错误。

`roxify` 是一种专有压缩格式，用于 Node 模式下的 VFS 快照。在浏览器中，使用 `fflate` 替代 ---- polyfill 只是在 `roxify` 被直接调用时抛出一个错误。

---

## `node:worker_threads` -- 重新导出 Web Workers

这是最微妙的部分。Node.js 中的 `node:worker_threads` 和浏览器中的 Web Workers 是两个不同的 API，但它们在概念上是相似的。Polyfill 做了映射：

```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```

`MessageChannel` 和 `MessagePort` 直接从浏览器重新导出（相同的 API）。`Worker` 本身需要一个包装，因为构造函数不同（Node 接受一个模块路径，浏览器接受一个 URL）。`isMainThread` 在浏览器端始终为 `true`。

---

## 概览：这 640 行代表了什么

| Polyfill | 行数 | 策略 |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array` + `DataView`，完整的 `Buffer` API |
| `node:crypto` | 166 | 从头实现 SHA-256/HMAC/PBKDF2 + Web Crypto 生成随机数 |
| `node:fs` | 210 | 内存 `Map` + 异步 IndexedDB |
| `node:net` | 70 | 可链式调用的存根 + 真实的 IP 验证 |
| `ssh2` | 74 | 显式存根 |
| `process.js` | 14 | 最小可行的 `process` |
| `node:path` | ~30 | POSIX 路径操作 |
| `node:url` | ~25 | 委托给浏览器 API |
| `node:events` | ~12 | 4 个方法的 EventEmitter |
| `node:os` | ~25 | `navigator.deviceMemory` / `hardwareConcurrency` |
| `node:zlib` | 4 | 透传 |
| `node:worker_threads` | ~30 | 重新导出 Web Workers |
| `roxify.js` | 8 | 存根 |

640 行。没有 npm 依赖。没有 Wasm。结果是一个不到一秒就能启动、无需任何服务器端基础设施即可运行的浏览器 bundle。

---

## 可以学到的经验

下次你想把 Node.js 库移植到浏览器时，Fortune 的方法展示了以下几点：

1. **找出实际使用的内容。** 如果代码只使用 `on`、`emit` 和 `removeListener`，就无需实现完整的 `EventEmitter`。

2. **尽可能委托给浏览器 API。** `URL`、`URLSearchParams`、`MessageChannel`、`MessagePort`、`crypto.getRandomValues` ---- 浏览器已经有了，直接使用它们。

3. **在异步 API 前加同步缓存。** `Map` + IndexedDB 用于 `node:fs` 的方案是整个文件夹中最可复用的模式。

4. **诚实的存根胜过沉默的不完整实现。** 明确的 `throw new Error('not implemented in browser')` ---- 比让 bug 在 10 个调用后才显现的 `return undefined` 有用无数倍。

5. **esbuild 的 `alias` + `inject` 被低估了。** 这是进行此类移植的完美工具 ---- 零 webpack 配置、零插件，只是一个替换列表。

---

代码在仓库中：[github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills)。每个文件只有一页，可以直接在 GitHub 上阅读。如果你在做类似的项目，强烈推荐。
