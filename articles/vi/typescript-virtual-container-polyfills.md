---
title: Chạy thư viện Node.js trong trình duyệt không cần Wasm --
  polyfill của typescript-virtual-container
description: Cách Fortune tái triển khai tay node:fs, node:crypto và
  cả tá module Node trong 640 dòng JavaScript để container
  chạy trong trình duyệt không cần Wasm.
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
author_sig: "XI5WHndp32TONbuCjAUNXqNKGrvmPx5HDPxoasF2zpUdhuZq0m991o0Tn7gb7sNN789BiI45zcXFRl+arVo8Wg=="
---

# Chạy thư viện Node.js trong trình duyệt không cần Wasm -- polyfill của typescript-virtual-container

Gần đây tôi đã dành khá nhiều thời gian mổ xẻ mã nguồn [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container), dự án của [Fortune (Chloé Rolzhausen)](https://itsrealfortune.fr). Và phần khiến tôi bất ngờ nhất là thư mục `polyfills/`, hơn cả VFS, mạng ảo hay 170 lệnh Unix tái triển khai bằng TypeScript.

Vì module chạy trong trình duyệt, không cần Wasm, và vì vậy, Fortune đã tái triển khai tay toàn bộ lớp `node:*` mà thư viện cần. Khoảng 640 dòng JavaScript thủ công thay thế `node:fs`, `node:crypto`, `node:os`, `node:net`, và vài cái khác.

Bài này giải thích nó chạy thế nào, polyfill theo polyfill.

---

## Bài toán nền

Thư viện Node.js dùng các API không tồn tại trong trình duyệt. Khi bạn viết `import { readFileSync } from 'node:fs'`, đó là gọi hệ thống phía Node -- truy cập đĩa thật qua libuv. Trong trình duyệt, `node:fs` hoàn toàn không tồn tại.

Các giải pháp thường thấy là :

- **Runtime Wasm** (kiểu Emscripten, WASIp1/WASIp2) -- bạn biên dịch Node.js sang Wasm và thực thi nó. Kết quả : bundle 10-50 MB, thời gian tải đáng kể, độ phức tạp triển khai lớn.
- **Polyfill chung** (kiểu `browserify`, `webpack node: polyfills`) -- các thư viện npm cung cấp xấp xỉ mỗi module Node. Thường quá nặng, không hợp ca cụ thể.
- **Viết lại polyfill bằng tay** -- nhiều việc hơn, nhưng kết quả tối ưu.

Fortune chọn lựa chọn thứ ba. Và kết quả là bundle trình duyệt đúng là thư viện, khởi động tức thì, và không phụ thuộc hạ tầng ngoài nào.

---

## Cơ chế build

Mọi thứ dựa trên esbuild và tùy chọn `alias` của nó. Mỗi import `node:*` được chuyển hướng tới tệp cục bộ :

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

Tùy chọn `inject` đáng chú ý : nó cho phép bơm `process.js` và `buffer.js` lên đầu mỗi tệp bundle, khiến `process` và `Buffer` có sẵn toàn cục mà không cần import rõ nào. Đúng như Node.js phơi bày chúng gốc.

---

## `buffer.js` -- `Buffer` trên `Uint8Array`

Đây là một trong hai global được bơm. `Buffer` được dùng dày đặc trong mã -- mỗi thao tác SSH, mỗi snapshot VFS, mỗi đọc/ghi nhị phân đều qua đó.

Giải pháp : lớp `BrowserBuffer` mở rộng `Uint8Array` và triển khai toàn bộ API `Buffer` của Node.js.

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

Những gì triển khai tổng cộng :
- `Buffer.from`, `Buffer.alloc`, `Buffer.allocUnsafe`, `Buffer.isBuffer`, `Buffer.concat`, `Buffer.byteLength`
- Mọi phương thức ghi : `writeUInt8/16/32BE/LE`, `writeInt8/16/32BE/LE`, `writeBigUInt64BE/LE`, `writeFloat/DoubleLE/BE`
- Mọi phương thức đọc tương ứng
- `toString` với hỗ trợ hex, base64, utf8
- `copy`, `equals`, `slice`, `subarray`

Việc đó chiếm 116 dòng. Với những gì nó thay thế, gọn đáng kể.

Mẹo chính là dùng `DataView` cho truy cập đa byte, xử lý đúng endianness mà không phải thao tác bit tay cho mỗi kiểu :

```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```

---

## `process.js` -- global `process` tối thiểu

Global bơm còn lại. Tí hon mà cần thiết -- mã thường kiểm tra `process.env.NODE_ENV`, `process.platform`, `process.nextTick`, v.v.

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

Ánh xạ `nextTick` → `queueMicrotask` là chi tiết quan trọng nhất ở đây. `process.nextTick` trong Node.js lên lịch callback cuối pha hiện tại của vòng lặp sự kiện, trước I/O. `queueMicrotask` trong trình duyệt cho ngữ nghĩa rất gần : nó lên lịch microtask, chạy trước lần render hay sự kiện tiếp theo, và gần gũi này đủ để mọi mã dùng `nextTick` chạy đúng trong browser.

---

## `node:fs` -- IndexedDB làm hệ thống tệp đồng bộ

Đây là polyfill tinh vi nhất, và vượt xa thú vị nhất về kỹ thuật.

Bài toán tế nhị : `node:fs` phơi bày API đồng bộ (`readFileSync`, `writeFileSync`, v.v.), nhưng các API lưu trữ browser đều bất đồng bộ (IndexedDB, Cache API, v.v.). Ta không thể `await` giữa hàm đồng bộ.

Giải pháp của Fortune : cache hai tầng.

**Tầng 1 -- Map trong bộ nhớ (đồng bộ)**
Mọi lần đọc đều từ `Map<string, Uint8Array>` trong bộ nhớ. Tức thì, đồng bộ, không vấn đề API.

**Tầng 2 -- IndexedDB (bất đồng bộ, trong nền)**
Lúc khởi động, toàn bộ nội dung IndexedDB được tải vào Map. Ghi đi ngay vào Map *và* kích hoạt ghi bất đồng bộ sang IndexedDB mà không chặn.

```js
const DB_NAME = 'vfs-fs-shim';
const STORE = 'files';
let db = null;

// Cache đồng bộ (đường dẫn → Uint8Array | null)
const memCache = new Map();

// Tải trước lúc khởi động
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

// Ghi async sang IndexedDB (không chặn)
function idbSet(path, value) {
  openDB().then(db => {
    const tx = db.transaction(STORE, 'readwrite');
    if (value === null) tx.objectStore(STORE).delete(path);
    else tx.objectStore(STORE).put(value, path);
  });
}
```

API phơi bày đầy đủ : `readFileSync`, `writeFileSync`, `appendFileSync`, `existsSync`, `unlinkSync`, `rmSync` (với tùy chọn `recursive`), `mkdirSync` (với tùy chọn `recursive`), `readdirSync`, `statSync`, `renameSync`.

Thậm chí có lớp quản lý file descriptor (`openSync`, `writeSync`, `closeSync`) để nhật ký WAL của VFS chạy ở chế độ browser -- nhật ký mở fd, ghi vào, đóng, và dữ liệu tới IndexedDB.

Thuộc tính `ready` được xuất để mã biết khi nào tải trước ban đầu xong :

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

Nhờ đó snapshot VFS sống sót qua tải lại trang trong trình duyệt. Khi bạn tải lại demo, VFS được khôi phục đúng trạng thái bạn để lại, từ IndexedDB, không máy chủ nào dính dáng.

---

## `node:crypto` -- SHA-256, HMAC, PBKDF2 bằng JS thuần

Thay vì nhập thư viện crypto biên dịch sang Wasm, Fortune đã triển khai trực tiếp các nguyên thủy cần thiết.

**SHA-256** được triển khai from scratch với hằng số FIPS 180-4 :

```js
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, /* ... 60 hằng số nữa */
]);

function sha256(data) {
  // đệm FIPS 180-4
  const msg = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
  // ...
  // 64 vòng nén
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

Trên SHA-256, **HMAC-SHA256** và **PBKDF2-HMAC-SHA256** được dựng lên. Hai nguyên thủy này dùng cho dẫn xuất khóa trong trao đổi SSH và xác thực nội bộ.

API xuất ra giống Node.js :

```js
// Băm cổ điển
const hash = createHash('sha256').update('data').digest('hex');

// Byte ngẫu nhiên (qua API Web Crypto chuẩn)
const bytes = randomBytes(32);

// UUID
const id = randomUUID();

// So sánh an toàn thời gian
const ok = timingSafeEqual(a, b);

// scrypt (xấp xỉ qua PBKDF2)
const key = scryptSync(password, salt, 32, { N: 16384 });
```

Lưu ý : `scryptSync` được xấp xỉ qua PBKDF2 với số vòng lặp căn theo tham số `N`. Xấp xỉ này thay lược đồ bộ nhớ riêng của scrypt và nó phủ các cách dùng của dự án.

Các hàm không thể mô phỏng hợp lý trong browser (`generateKeyPairSync`, `createCipheriv`, `createDecipheriv`, `createSign`) ném lỗi rõ nếu bị gọi. Hành vi trung thực.

---

## `node:os` -- đọc spec thật của trình duyệt

Thay vì trả giá trị cố định, polyfill này đọc các API của trình duyệt để trả về thông tin khớp máy thật của người dùng.

```js
export function totalmem() {
  try {
    return navigator?.deviceMemory
      ? navigator.deviceMemory * 1024 * 1024 * 1024
      : 2 * 1024 * 1024 * 1024; // mặc định 2 GB
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

Kết quả cụ thể : khi bạn chạy `neofetch` trong demo trình duyệt, số lõi và RAM hiện ra khớp máy của bạn. Đó là chi tiết, nhưng đóng góp lớn vào vẻ thật của terminal.

Các xuất khác : `freemem` (40% tổng bộ nhớ, xấp xỉ hợp lý), `platform` → `'browser'`, `type` → `'Linux'`, `release` → `'web'`, `uptime` qua `performance.now()`, `endianness` → `'LE'` (little-endian, đúng trên mọi bộ xử lý x86/ARM phổ thông), `loadavg` → `[0, 0, 0]`.

---

## `node:net` -- stub TCP sạch

Trình duyệt không truy cập socket TCP thô (WebSocket không tính -- đó là giao thức ứng dụng khác). Nên `node:net` là stub, nhưng stub *viết tốt*.

```js
export class Socket {
  connect() { notImpl('Socket.connect')(); }
  on() { return this; }    // nối được
  once() { return this; }  // nối được
  pipe() { return this; }  // nối được
  setEncoding() { return this; }
  remoteAddress = '127.0.0.1';
  remotePort = 0;
  // ...
}
```

Điểm quan trọng : các phương thức đăng ký sự kiện (`on`, `once`, `off`, `emit`) trả về `this` và không ném lỗi. Việc này cho phép mã kiểu `new net.Socket().on('connect', cb)` chạy không sập, dù kết nối không bao giờ thành. Chỉ các phương thức *thực sự cố kết nối* mới ném lỗi.

`isIP`, `isIPv4`, `isIPv6` được triển khai đúng (với logic kiểm tra thật) vì chúng được mã mạng ảo dùng để kiểm tra địa chỉ, mà không bao giờ mở socket.

---

## `node:path` -- thao tác đường dẫn POSIX

Tái triển khai đầy đủ thao tác đường dẫn POSIX, thích ứng ngữ cảnh (đường dẫn luôn tuyệt đối với `/`, chỉ kiểu Unix).

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

Đơn giản, gọn, đúng cho các cách dùng của dự án.

---

## `node:url` -- ủy thác cho API trình duyệt

Cái này thanh lịch ở đơn giản. API `URL` và `URLSearchParams` đã tồn tại gốc trong trình duyệt -- chỉ cần xuất lại chúng.

```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```

Chỉ `fileURLToPath` và `pathToFileURL` cần triển khai, vì chúng riêng của Node :

```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```

Đó là cách lý tưởng khi nền tảng đích (trình duyệt) đã cung cấp bản tương đương gốc.

---

## `node:zlib` -- đồng nhất

```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```

Hai dòng. Thư viện dùng `fflate` cho nén thật (chạy gốc trong browser). `node:zlib` chỉ được import trong các đường mã không chạy trong ngữ cảnh browser -- nên passthrough là đủ.

Đôi khi triển khai đúng là hai dòng.

---

## `node:events` -- EventEmitter tối thiểu

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

Triển khai đầy đủ `EventEmitter` của Node.js khoảng 600 dòng với quản lý `maxListeners`, `once`, `prependListener`, v.v. Ở đây 12 dòng cho 4 phương thức thực sự dùng. Tree-shaking trong đầu trước cả tree-shaking của công cụ build.

---

## `ssh2` và `roxify` -- stub rõ ràng

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

Máy chủ SSH không chạy trong trình duyệt (việc đó vô nghĩa -- ai sẽ kết nối?). Nhưng mã *nói về SSH phía client* -- các lớp dựng gói SSH, trình phân tích giao thức -- tồn tại trong thư viện. Các stub này cho phép mọi mã đó được bundle không lỗi, đồng thời đảm bảo lỗi rõ được ném nếu ai đó cố gọi phương thức đòi socket thật.

`roxify` là định dạng nén độc quyền dùng cho snapshot VFS ở chế độ Node. Trong trình duyệt, `fflate` được dùng thay -- polyfill chỉ ném lỗi nếu `roxify` bị gọi trực tiếp.

---

## `node:worker_threads` -- xuất lại Web Workers

Đây là cái tinh tế nhất. `node:worker_threads` trong Node.js và Web Workers của trình duyệt là hai API khác nhau, nhưng chúng gần nhau về khái niệm. Polyfill làm ánh xạ :

```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```

`MessageChannel` và `MessagePort` được xuất lại trực tiếp từ browser (cùng API). Bản thân `Worker` cần wrapper vì constructor khác (Node chờ đường dẫn module, browser chờ URL). `isMainThread` luôn `true` phía trình duyệt trong ngữ cảnh này.

---

## Tổng quan : 640 dòng này đại diện gì

| Polyfill | Dòng | Chiến lược |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array` + `DataView`, toàn bộ API `Buffer` |
| `node:crypto` | 166 | SHA-256/HMAC/PBKDF2 from scratch + Web Crypto cho random |
| `node:fs` | 210 | `Map` trong bộ nhớ + IndexedDB async |
| `node:net` | 70 | Stub nối được + kiểm tra IP thật |
| `ssh2` | 74 | Stub rõ ràng |
| `process.js` | 14 | `process` khả thi tối thiểu |
| `node:path` | ~30 | Thao tác đường dẫn POSIX |
| `node:url` | ~25 | Ủy thác cho API browser |
| `node:events` | ~12 | EventEmitter 4 phương thức |
| `node:os` | ~25 | `navigator.deviceMemory` / `hardwareConcurrency` |
| `node:zlib` | 4 | Passthrough |
| `node:worker_threads` | ~30 | Xuất lại Web Workers |
| `roxify.js` | 8 | Stub |

640 dòng. Không phụ thuộc npm nào. Không Wasm nào. Và cho ra bundle trình duyệt khởi động dưới một giây và chạy không hạ tầng phía máy chủ nào.

---

## Rút ra được gì

Lần tới khi bạn muốn mang thư viện Node.js vào trình duyệt, đây là điều cách của Fortune chứng minh :

1. **Xác định điều thực sự dùng.** Chỉ triển khai các phương thức mã gọi : ở đây `on`, `emit` và `removeListener` là đủ cho `EventEmitter`.

2. **Ủy thác cho API trình duyệt khi có thể.** `URL`, `URLSearchParams`, `MessageChannel`, `MessagePort`, `crypto.getRandomValues` -- trình duyệt đã có, cứ dùng.

3. **Cache đồng bộ trước API async.** Giải pháp `Map` + IndexedDB cho `node:fs` là mẫu tái dùng nhất cả thư mục.

4. **Stub trung thực tốt hơn triển khai thiếu lặng lẽ.** `throw new Error('not implemented in browser')` rõ ràng vô hạn hữu ích hơn `return undefined` để bug lộ mười lần gọi sau.

5. **esbuild `alias` + `inject` bị đánh giá thấp.** Đó là công cụ hoàn hảo cho kiểu port này -- không cấu hình webpack, không plugin, chỉ danh sách thay thế.

---

Mã trong repo : [github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills). Mỗi tệp gói trong một trang, đọc được trực tiếp trên GitHub. Rất khuyên nếu bạn làm dự án tương tự.
