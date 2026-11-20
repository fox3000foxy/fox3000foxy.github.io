---
title: 让 Node.js 库在浏览器跑不用 Wasm，typescript-virtual-container 的 polyfill
description: Fortune 怎么手写 node:fs、node:crypto 等十几个 Node 模块共 640 行 JavaScript，让容器在浏览器跑不用 Wasm。
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
author_sig: "bJYTbGb2pft7GzHjo2GREnbXfi3PwQ71kD3Xx5cJydSBu3MRMs83aMR10q6ksSKEOiW7u3ADiJAdGaHbL5ZvBQ=="
---

# 让 Node.js 库在浏览器跑不用 Wasm，typescript-virtual-container 的 polyfill

我最近花不少时间啃 [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) 源码，[Fortune（Chloé Rolzhausen）](https://itsrealfortune.fr) 的项目。最让我惊的不是 `polyfills/` 文件夹，是 VFS、虚拟网络、170 个 Unix 命令 TypeScript 重写。

因为模块在浏览器跑，不用 Wasm，为此 Fortune 手写了整个库要的 `node:*` 层。约 640 行手艺 JavaScript 替代 `node:fs`、`node:crypto`、`node:os`、`node:net` 等。

这篇一个个讲怎么跑的。

---

## 原始问题

Node.js 库用的 API 浏览器没有。`import { readFileSync } from 'node:fs'` 在 Node 是经 libuv 的真磁盘访问。浏览器里 `node:fs` 压根不存在。

常见解法：

- **Wasm 运行时**（Emscripten、WASIp1/WASIp2 这类），Node.js 编进 Wasm 跑。结果：10-50M 包，加载慢，部署复杂。
- **通用 polyfill**（`browserify`、`webpack node: polyfills` 这类 npm 库），每个 Node 模块给近似。经常太重，和具体场景不对付。
- **手写 polyfill**，活多，但结果最优。

Fortune 选第三条。结果：浏览器包就是库本身，瞬间启动，不依赖任何外部 infra。

---

## 构建机制

全靠 esbuild 的 `alias` 选项。每个 `node:*` 导入重定向到本地文件：

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

`inject` 值得单说：把 `process.js` 和 `buffer.js` 注进包里每个文件头，`process` 和 `Buffer` 全局可用，不用显式导入。和 Node.js 原生暴露一模一样。

---

## `buffer.js`，`Uint8Array` 上的 `Buffer`

两个注入全局之一。`Buffer` 代码里到处用，每个 SSH 操作、VFS 快照、读写二进制全走它。

解法：`BrowserBuffer` 类继承 `Uint8Array`，实现 Node.js `Buffer` 全 API。

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

总共实现：
- `Buffer.from`、`Buffer.alloc`、`Buffer.allocUnsafe`、`Buffer.isBuffer`、`Buffer.concat`、`Buffer.byteLength`
- 全部写方法：`writeUInt8/16/32BE/LE`、`writeInt8/16/32BE/LE`、`writeBigUInt64BE/LE`、`writeFloat/DoubleLE/BE`
- 对应全部读方法
- `toString` 支持 hex、base64、utf8
- `copy`、`equals`、`slice`、`subarray`

共 116 行。替代的东西看，紧凑得离谱。

主要技巧是用 `DataView` 做多字节访问，endianness 交给它，不用每类型手玩 bit：

```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```

---

## `process.js`，最小 `process` 全局

另一个注入全局。小但必要，代码到处查 `process.env.NODE_ENV`、`process.platform`、`process.nextTick` 等。

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

`nextTick` → `queueMicrotask` 映射是最重要的一笔。Node.js `process.nextTick` 在事件循环当前阶段尾、I/O 前调回调。浏览器 `queueMicrotask` 语义很近：微任务，下次渲染或事件前跑，这点近似够全部用 `nextTick` 的代码在浏览器跑对。

---

## `node:fs`，IndexedDB 上的同步文件系统

技术上最精巧的 polyfill，断层领先。

难题微妙：`node:fs` 暴露同步 API（`readFileSync`、`writeFileSync` 等），浏览器存储 API 全异步（IndexedDB、Cache API 等）。同步函数中间不能 `await`。

Fortune 解法：双层缓存。

**第 1 层，内存 Map（同步）**
全部读走 `Map<string, Uint8Array>` 内存。瞬时，同步，API 没问题。

**第 2 层，IndexedDB（异步，后台）**
启动全量 IndexedDB 载进 Map。写先写 Map*再*后台异步写 IndexedDB 不阻塞。

```js
const DB_NAME = 'vfs-fs-shim';
const STORE = 'files';
let db = null;

// 同步缓存（路径 → Uint8Array | null）
const memCache = new Map();

// 启动预载
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

// 后台异步写 IndexedDB（不阻塞）
function idbSet(path, value) {
  openDB().then(db => {
    const tx = db.transaction(STORE, 'readwrite');
    if (value === null) tx.objectStore(STORE).delete(path);
    else tx.objectStore(STORE).put(value, path);
  });
}
```

暴露 API 全：`readFileSync`、`writeFileSync`、`appendFileSync`、`existsSync`、`unlinkSync`、`rmSync`（带 `recursive`）、`mkdirSync`（带 `recursive`）、`readdirSync`、`statSync`、`renameSync`。

还有文件描述符层（`openSync`、`writeSync`、`closeSync`）给 VFS 的 WAL 日志在浏览器跑，日志开 fd 写关，数据进 IndexedDB。

`ready` 导出给代码知道预载完没：

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

浏览器 VFS 快照刷新不丢全靠这个。demo 页重载，VFS 从 IndexedDB 原样恢复，零服务器。

---

## `node:crypto`，纯 JS 的 SHA-256、HMAC、PBKDF2

不引 Wasm 编译的密码库，Fortune 需要的原语直接写。

**SHA-256** 从零按 FIPS 180-4 常量实现：

```js
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, /* 另外 60 个常量 */
]);

function sha256(data) {
  // FIPS 180-4 padding
  const msg = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
  // ...
  // 64 轮压缩
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

SHA-256 上建 **HMAC-SHA256** 和 **PBKDF2-HMAC-SHA256**。这两个做 SSH 密钥派生和内部认证。

导出 API 像 Node.js：

```js
// 常规哈希
const hash = createHash('sha256').update('data').digest('hex');

// 随机字节（走标准 Web Crypto）
const bytes = randomBytes(32);

// UUID
const id = randomUUID();

// 常时比较
const ok = timingSafeEqual(a, b);

// scrypt（PBKDF2 近似）
const key = scryptSync(password, salt, 32, { N: 16384 });
```

注：`scryptSync` 按 `N` 参数折迭代数走 PBKDF2 近似。替代 scrypt 特有的内存 hard 方案，覆盖项目用法。

浏览器合理模拟不了的（`generateKeyPairSync`、`createCipheriv`、`createDecipheriv`、`createSign`）调了就抛明确错误。诚实。

---

## `node:os`，读浏览器真规格

不返回写死值，这 polyfill 读浏览器 API 返回贴用户真机的信息。

```js
export function totalmem() {
  try {
    return navigator?.deviceMemory
      ? navigator.deviceMemory * 1024 * 1024 * 1024
      : 2 * 1024 * 1024 * 1024; // 默认 2G
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

具体效果：浏览器 demo 跑 `neofetch`，核数内存显示的是你真机。细节，但终端像真的一大半功劳。

别的导出：`freemem`（总内存 40%，合理近似）、`platform` → `'browser'`、`type` → `'Linux'`、`release` → `'web'`、`uptime` 走 `performance.now()`、`endianness` → `'LE'`（x86/ARM 民用全小端）、`loadavg` → `[0, 0, 0]`。

---

## `node:net`，干净 TCP stub

浏览器开不了裸 TCP socket（WebSocket 不算，那是另一应用协议）。`node:net` 是 stub，但写得*体面*。

```js
export class Socket {
  connect() { notImpl('Socket.connect')(); }
  on() { return this; }    // 可链
  once() { return this; }  // 可链
  pipe() { return this; }  // 可链
  setEncoding() { return this; }
  remoteAddress = '127.0.0.1';
  remotePort = 0;
  // ...
}
```

重点：事件注册方法（`on`、`once`、`off`、`emit`）返回 `this` 不抛错。`new net.Socket().on('connect', cb)` 这类代码不断，哪怕连永远建不起。只有*真尝试连接*的方法抛错。

`isIP`、`isIPv4`、`isIPv6` 真逻辑实现（确实的校验），因为虚拟网络代码拿它们验地址，从不开 socket。

---

## `node:path`，POSIX 路径运算

POSIX 路径运算完整重写，按场景来（路径永远 `/` 开头，只 Unix 风格）。

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

简单，紧凑，项目用法全对。

---

## `node:url`，转交浏览器原生 API

这个优雅在简单。浏览器原生有 `URL` 和 `URLSearchParams`，直接重导出。

```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```

只 `fileURLToPath` 和 `pathToFileURL` 要手写，因为 Node 专有：

```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```

目标平台（浏览器）已有等价原生，这是理想做法。

---

## `node:zlib`，恒等

```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```

两行。库真压缩走 `fflate`（浏览器原生跑）。`node:zlib` 只在浏览器跑不到的代码路径导入，直通够用。

有时对的实现就是两行。

---

## `node:events`，最小 EventEmitter

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

Node.js 完整 `EventEmitter` 约 600 行管 `maxListeners`、`once`、`prependListener` 等。这里 12 行实现真正用到的 4 方法。构建工具 tree-shaking 之前先人肉 tree-shaking。

---

## `ssh2` 和 `roxify`，明确 stub

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

SSH 服务端不在浏览器跑（跑了给谁连？）。但*讲 SSH 客户端*的代码，包构造类、协议解析器，在库里，打包全进。这些 stub 让全部代码正常打包，调到真要 socket 的方法明确报错。

`roxify` 是 Node 下 VFS 快照专有压缩格式。浏览器用 `fflate`，polyfill 直接调就报错。

---

## `node:worker_threads`，重导出 Web Worker

最绕。Node.js `node:worker_threads` 和浏览器 Web Worker 是两 API，但概念近。polyfill 做映射：

```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```

`MessageChannel` 和 `MessagePort` 直接重导出浏览器版（同 API）。`Worker` 要包一层因为构造不同（Node 传模块路径，浏览器传 URL）。浏览器语境 `isMainThread` 永远 `true`。

---

## 总览：640 行是什么

| Polyfill | 行数 | 策略 |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array` 加 `DataView`，`Buffer` 全 API |
| `node:crypto` | 166 | 手写 SHA-256/HMAC/PBKDF2 加 Web Crypto 取随机 |
| `node:fs` | 210 | 内存 `Map` 加后台 IndexedDB |
| `node:net` | 70 | 可链 stub 加真 IP 校验 |
| `ssh2` | 74 | 明确 stub |
| `process.js` | 14 | 最小可用 `process` |
| `node:path` | 约 30 | POSIX 路径运算 |
| `node:url` | 约 25 | 转交浏览器 API |
| `node:events` | 约 12 | 4 方法 EventEmitter |
| `node:os` | 约 25 | `navigator.deviceMemory` / `hardwareConcurrency` |
| `node:zlib` | 4 | 直通 |
| `node:worker_threads` | 约 30 | 重导出 Web Worker |
| `roxify.js` | 8 | Stub |

640 行。零 npm 依赖。零 Wasm。浏览器包不到一秒启动，零服务端 infra。

---

## 能学到什么

下次把 Node.js 库搬浏览器，Fortune 做法证明：

1. **只实现真用到的。** 这里 `on`、`emit`、`removeListener` 够 `EventEmitter`。
2. **浏览器有的直接用。** `URL`、`URLSearchParams`、`MessageChannel`、`MessagePort`、`crypto.getRandomValues`，浏览器全有，拿来用。
3. **同步缓存挡异步 API。** `Map` 加 IndexedDB 解 `node:fs`，整文件夹最可复用的模式。
4. **诚实的 stub 胜过沉默的半实现。** 明确 `throw new Error('not implemented in browser')` 比默默 `return undefined` 强百倍，bug 不会十层调用后才爆。
5. **esbuild `alias` 加 `inject` 被低估。** 这种移植完美工具，零 webpack 配置，零插件，一个替换表。

---

代码在仓库：[github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills)。每文件一页，GitHub 直接读。做类似项目强烈推荐看一遍。
