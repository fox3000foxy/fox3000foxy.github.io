---
title: Chạy thư viện Node.js trong trình duyệt không cần Wasm --
  các polyfill của typescript-virtual-container
description: Cách Fortune tự tay tái hiện node:fs, node:crypto và hàng tá
  module Node trong 640 dòng JavaScript để container chạy trong trình duyệt
  không cần Wasm.
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
---

# Chạy thư viện Node.js trong trình duyệt không cần Wasm -- các polyfill của typescript-virtual-container

Gần đây tôi đã dành kha khá thời gian để nghiền ngẫm mã nguồn của [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container), dự án của [Fortune (Chloé Rolzhausen)](https://itsrealfortune.fr). Và phần khiến tôi bất ngờ nhất không phải VFS, không phải mạng ảo, không phải 170 lệnh Unix được tái hiện bằng TypeScript. Mà là thư mục `polyfills/`.

Bởi vì module chạy trong trình duyệt, không cần Wasm, và để làm được điều đó, Fortune đã tự tay tái hiện toàn bộ tầng `node:*` mà thư viện cần. Khoảng 640 dòng JavaScript thủ công thay thế `node:fs`, `node:crypto`, `node:os`, `node:net`, và một số module khác.

Bài viết này giải thích cách nó hoạt động, từng polyfill một.

---

## Vấn đề cơ bản

Một thư viện Node.js sử dụng các API không tồn tại trong trình duyệt. Khi bạn viết `import { readFileSync } from 'node:fs'`, đó là một lệnh gọi hệ thống phía Node -- một truy cập đĩa thực qua libuv. Trong trình duyệt, `node:fs` hoàn toàn không tồn tại.

Các giải pháp thông thường là:

- **Một runtime Wasm** (kiểu Emscripten, WASIp1/WASIp2) -- bạn biên dịch Node.js thành Wasm và chạy nó. Kết quả: bundle 10-50 MB, thời gian tải đáng kể, độ phức tạp triển khai lớn.
- **Các polyfill chung chung** (kiểu `browserify`, `webpack node: polyfills`) -- các thư viện npm cung cấp xấp xỉ của mỗi module Node. Thường quá nặng, không phù hợp với trường hợp cụ thể.
- **Tự viết polyfill bằng tay** -- tốn nhiều công hơn, nhưng kết quả tối ưu.

Fortune đã chọn phương án thứ ba. Và kết quả là một bundle trình duyệt chỉ gồm thư viện, khởi động tức thì, và không phụ thuộc vào bất kỳ hạ tầng bên ngoài nào.

---

## Cơ chế build

Tất cả dựa trên esbuild và tùy chọn `alias` của nó. Mỗi import `node:*` được chuyển hướng đến một file cục bộ:

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

Tùy chọn `inject` đáng được chú ý: nó cho phép tiêm `process.js` và `buffer.js` vào đầu mỗi file trong bundle, giúp `process` và `Buffer` có sẵn toàn cục mà không cần import tường minh. Giống hệt cách Node.js expose chúng nguyên bản.

---

## `buffer.js` -- `Buffer` trên `Uint8Array`

Đây là một trong hai global được inject. `Buffer` được sử dụng rộng rãi trong code -- mọi thao tác SSH, mọi snapshot VFS, mọi đọc/ghi nhị phân đều đi qua nó.

Giải pháp: một lớp `BrowserBuffer` mở rộng `Uint8Array` và triển khai toàn bộ API `Buffer` của Node.js.

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

Tổng cộng những gì được triển khai:
- `Buffer.from`, `Buffer.alloc`, `Buffer.allocUnsafe`, `Buffer.isBuffer`, `Buffer.concat`, `Buffer.byteLength`
- Tất cả các phương thức ghi: `writeUInt8/16/32BE/LE`, `writeInt8/16/32BE/LE`, `writeBigUInt64BE/LE`, `writeFloat/DoubleLE/BE`
- Tất cả các phương thức đọc tương ứng
- `toString` hỗ trợ hex, base64, utf8
- `copy`, `equals`, `slice`, `subarray`

Nó chiếm 116 dòng. So với những gì nó thay thế, nó nhỏ gọn một cách đáng kinh ngạc.

Mẹo chính là sử dụng `DataView` cho các truy cập đa byte, xử lý endianness chính xác mà không cần thao tác bit thủ công cho từng kiểu:

```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```

---

## `process.js` -- global `process` tối thiểu

Global được inject còn lại. Nhỏ nhưng cần thiết -- code thường kiểm tra `process.env.NODE_ENV`, `process.platform`, `process.nextTick`, v.v.

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

Ánh xạ `nextTick` → `queueMicrotask` là chi tiết quan trọng nhất ở đây. `process.nextTick` trong Node.js lên lịch một callback ở cuối phase hiện tại của event loop, trước I/O. `queueMicrotask` trong trình duyệt làm điều gì đó rất gần về mặt ngữ nghĩa -- nó lên lịch một microtask, chạy trước lần render hoặc sự kiện tiếp theo. Không hoàn toàn giống hệt, nhưng đủ gần để mọi code sử dụng `nextTick` hoạt động chính xác trong trình duyệt.

---

## `node:fs` -- IndexedDB như hệ thống file đồng bộ

Đây là polyfill tinh vi nhất, và xa nhất là thú vị nhất về mặt kỹ thuật.

Vấn đề khá tế nhị: `node:fs` expose một API đồng bộ (`readFileSync`, `writeFileSync`, v.v.), nhưng các API lưu trữ của trình duyệt đều bất đồng bộ (IndexedDB, Cache API, v.v.). Bạn không thể `await` ở giữa một hàm đồng bộ.

Giải pháp của Fortune: hai tầng cache.

**Tầng 1 -- Map trong bộ nhớ (đồng bộ)**  
Mọi thao tác đọc đều từ một `Map<string, Uint8Array>` trong bộ nhớ. Tức thì, đồng bộ, không vấn đề về API.

**Tầng 2 -- IndexedDB (bất đồng bộ, chạy nền)**  
Khi khởi động, toàn bộ nội dung từ IndexedDB được tải vào Map. Các thao tác ghi được thực hiện ngay lập tức vào Map *và* khởi chạy một ghi bất đồng bộ vào IndexedDB mà không chặn.

```js
const DB_NAME = 'vfs-fs-shim';
const STORE = 'files';
let db = null;

// Sync cache (path → Uint8Array | null)
const memCache = new Map();

// Preload khi khởi động
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

// Ghi bất đồng bộ vào IndexedDB (không chặn)
function idbSet(path, value) {
  openDB().then(db => {
    const tx = db.transaction(STORE, 'readwrite');
    if (value === null) tx.objectStore(STORE).delete(path);
    else tx.objectStore(STORE).put(value, path);
  });
}
```

API được expose đầy đủ: `readFileSync`, `writeFileSync`, `appendFileSync`, `existsSync`, `unlinkSync`, `rmSync` (với tùy chọn `recursive`), `mkdirSync` (với tùy chọn `recursive`), `readdirSync`, `statSync`, `renameSync`.

Thậm chí còn có một tầng quản lý file descriptors (`openSync`, `writeSync`, `closeSync`) để journal WAL của VFS hoạt động ở chế độ trình duyệt -- journal mở một fd, ghi vào đó, đóng nó, và dữ liệu sẽ nằm trong IndexedDB.

Thuộc tính `ready` được export để cho phép code biết khi nào quá trình preload ban đầu hoàn tất:

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

Nhờ đó mà các snapshot VFS sống sót qua các lần tải lại trang trong trình duyệt. Khi bạn tải lại bản demo, VFS được phục hồi chính xác trạng thái bạn đã để lại, từ IndexedDB, không cần bất kỳ máy chủ nào.

---

## `node:crypto` -- SHA-256, HMAC, PBKDF2 trong JS thuần

Thay vì import một thư viện crypto được biên dịch thành Wasm, Fortune đã triển khai trực tiếp các primitive cần thiết.

**SHA-256** được triển khai từ đầu với các hằng số FIPS 180-4:

```js
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, /* ... 60 hằng số khác */ 
]);

function sha256(data) {
  // padding FIPS 180-4
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

Trên nền SHA-256, **HMAC-SHA256** và **PBKDF2-HMAC-SHA256** được xây dựng. Hai primitive này được sử dụng để dẫn xuất khóa trong trao đổi SSH và xác thực nội bộ.

API được export tương tự như của Node.js:

```js
// Hash thông thường
const hash = createHash('sha256').update('data').digest('hex');

// Bytes ngẫu nhiên (qua Web Crypto API chuẩn)
const bytes = randomBytes(32);

// UUID
const id = randomUUID();

// So sánh timing-safe
const ok = timingSafeEqual(a, b);

// scrypt (xấp xỉ qua PBKDF2)
const key = scryptSync(password, salt, 32, { N: 16384 });
```

Lưu ý: `scryptSync` được xấp xỉ qua PBKDF2 với số vòng lặp khớp với tham số `N`. Đây không phải scrypt thực sự (vốn sử dụng lược đồ bộ nhớ khác), nhưng với các mục đích sử dụng của dự án thì nó đủ dùng.

Các hàm không thể được mô phỏng hợp lý trong trình duyệt (`generateKeyPairSync`, `createCipheriv`, `createDecipheriv`, `createSign`) sẽ ném ra lỗi tường minh nếu bị gọi. Hành vi trung thực.

---

## `node:os` -- đọc thông số thực của trình duyệt

Thay vì trả về các giá trị cố định, polyfill này đọc các API của trình duyệt để trả về thông tin tương ứng với máy thực của người dùng.

```js
export function totalmem() {
  try {
    return navigator?.deviceMemory
      ? navigator.deviceMemory * 1024 * 1024 * 1024
      : 2 * 1024 * 1024 * 1024; // 2 GB mặc định
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

Kết quả cụ thể: khi bạn chạy `neofetch` trong bản demo trình duyệt, số nhân và RAM hiển thị tương ứng với máy của bạn. Đó là một chi tiết nhỏ, nhưng nó đóng góp rất lớn vào tính chân thực của terminal.

Các export khác: `freemem` (40% tổng bộ nhớ, xấp xỉ hợp lý), `platform` → `'browser'`, `type` → `'Linux'`, `release` → `'web'`, `uptime` qua `performance.now()`, `endianness` → `'LE'` (little-endian, đúng trên mọi CPU x86/ARM phổ thông), `loadavg` → `[0, 0, 0]`.

---

## `node:net` -- các stub TCP sạch sẽ

Trình duyệt không có quyền truy cập vào socket TCP thô (WebSocket không được tính -- đó là một giao thức ứng dụng khác). `node:net` do đó là một stub, nhưng là một stub *được viết tốt*.

```js
export class Socket {
  connect() { notImpl('Socket.connect')(); }
  on() { return this; }    // có thể chuỗi
  once() { return this; }  // có thể chuỗi
  pipe() { return this; }  // có thể chuỗi
  setEncoding() { return this; }
  remoteAddress = '127.0.0.1';
  remotePort = 0;
  // ...
}
```

Điểm quan trọng: các phương thức đăng ký sự kiện (`on`, `once`, `off`, `emit`) trả về `this` và không ném lỗi. Điều này cho phép code viết `new net.Socket().on('connect', cb)` hoạt động không crash, ngay cả khi kết nối không bao giờ được thực hiện. Chỉ các phương thức *thực sự cố gắng kết nối* mới ném lỗi.

`isIP`, `isIPv4`, `isIPv6` được triển khai chính xác (không phải stub) vì chúng được code mạng ảo sử dụng để xác thực địa chỉ, mà không bao giờ mở socket.

---

## `node:path` -- thao tác đường dẫn POSIX

Tái hiện đầy đủ các thao tác đường dẫn POSIX, điều chỉnh cho phù hợp với ngữ cảnh (không có backslash Windows, đường dẫn luôn tuyệt đối với `/`).

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

Đơn giản, gọn nhẹ, chính xác cho các mục đích sử dụng của dự án.

---

## `node:url` -- ủy quyền cho API trình duyệt

Cái này thanh lịch bởi sự đơn giản của nó. API `URL` và `URLSearchParams` đã tồn tại sẵn trong trình duyệt -- chỉ cần tái xuất chúng.

```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```

Chỉ `fileURLToPath` và `pathToFileURL` cần triển khai, vì chúng là riêng của Node:

```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```

Đây là cách tiếp cận lý tưởng khi nền tảng đích (trình duyệt) đã cung cấp sẵn bản địa tương đương.

---

## `node:zlib` -- định danh

```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```

Hai dòng. Thư viện sử dụng `fflate` cho nén thực tế (hoạt động native trên trình duyệt). `node:zlib` chỉ được import trong các nhánh code không chạy trong ngữ cảnh trình duyệt -- do đó một passthrough là đủ.

Đôi khi triển khai tốt nhất chỉ là hai dòng.

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

Triển khai đầy đủ `EventEmitter` của Node.js dài ~600 dòng với quản lý `maxListeners`, `once`, `prependListener`, v.v. Ở đây chỉ 12 dòng cho 4 phương thức thực sự được sử dụng. Tree-shaking tinh thần trước cả tree-shaking của công cụ build.

---

## `ssh2` và `roxify` -- stub tường minh

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

Máy chủ SSH không chạy trong trình duyệt (điều đó chẳng có nghĩa lý gì -- ai sẽ kết nối?). Nhưng code *nói về SSH phía client* -- các lớp xây dựng gói SSH, trình phân tích giao thức -- vẫn tồn tại trong thư viện. Các stub này cho phép toàn bộ code đó được bundle mà không lỗi, đồng thời đảm bảo một lỗi rõ ràng được ném ra nếu ai đó cố gọi một phương thức yêu cầu socket thực sự.

`roxify` là một định dạng nén độc quyền được sử dụng cho các snapshot VFS ở chế độ Node. Trong trình duyệt, `fflate` được sử dụng thay thế -- polyfill chỉ đơn giản ném lỗi nếu `roxify` được gọi trực tiếp.

---

## `node:worker_threads` -- tái xuất Web Workers

Đây là cái tinh tế nhất. `node:worker_threads` trong Node.js và Web Workers của trình duyệt là hai API khác nhau, nhưng chúng gần gũi về mặt khái niệm. Polyfill thực hiện ánh xạ:

```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```

`MessageChannel` và `MessagePort` được tái xuất trực tiếp từ trình duyệt (cùng API). `Worker` bản thân nó cần một wrapper vì constructor khác nhau (Node nhận đường dẫn module, trình duyệt nhận URL). `isMainThread` luôn là `true` phía trình duyệt trong ngữ cảnh này.

---

## Tổng quan: 640 dòng này đại diện cho điều gì

| Polyfill | Số dòng | Chiến lược |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array` + `DataView`, toàn bộ API `Buffer` |
| `node:crypto` | 166 | SHA-256/HMAC/PBKDF2 từ đầu + Web Crypto cho random |
| `node:fs` | 210 | `Map` trong bộ nhớ + IndexedDB bất đồng bộ |
| `node:net` | 70 | Stubs có thể chuỗi + xác thực IP thực |
| `ssh2` | 74 | Stub tường minh |
| `process.js` | 14 | `process` tối thiểu khả dụng |
| `node:path` | ~30 | Thao tác đường dẫn POSIX |
| `node:url` | ~25 | Ủy quyền cho API trình duyệt |
| `node:events` | ~12 | EventEmitter 4 phương thức |
| `node:os` | ~25 | `navigator.deviceMemory` / `hardwareConcurrency` |
| `node:zlib` | 4 | Passthrough |
| `node:worker_threads` | ~30 | Tái xuất Web Workers |
| `roxify.js` | 8 | Stubs |

640 dòng. Không phụ thuộc npm. Không Wasm. Và nó tạo ra một bundle trình duyệt khởi động trong chưa đầy một giây và chạy mà không cần bất kỳ hạ tầng máy chủ nào.

---

## Điều có thể rút ra

Lần tới khi bạn muốn port một thư viện Node.js vào trình duyệt, đây là những gì cách tiếp cận của Fortune chứng minh:

1. **Xác định những gì thực sự được sử dụng.** Không cần triển khai toàn bộ `EventEmitter` nếu code chỉ dùng `on`, `emit`, và `removeListener`.

2. **Ủy quyền cho API trình duyệt khi có thể.** `URL`, `URLSearchParams`, `MessageChannel`, `MessagePort`, `crypto.getRandomValues` -- trình duyệt đã có sẵn, hãy tận dụng chúng.

3. **Cache đồng bộ phía trước API bất đồng bộ.** Giải pháp `Map` + IndexedDB cho `node:fs` là pattern có thể tái sử dụng nhất trong toàn bộ thư mục.

4. **Stub trung thực tốt hơn triển khai không đầy đủ thầm lặng.** Một `throw new Error('not implemented in browser')` tường minh hữu ích hơn vô cùng so với `return undefined` để lỗi tự biểu hiện 10 lần gọi sau đó.

5. **esbuild `alias` + `inject` bị đánh giá thấp.** Đó là công cụ hoàn hảo cho kiểu port này -- zero cấu hình webpack, zero plugin, chỉ một danh sách các thay thế.

---

Mã nguồn nằm trong repo: [github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills). Mỗi file chỉ gói gọn trong một trang, có thể đọc trực tiếp trên GitHub. Rất khuyến khích nếu bạn đang làm việc trên một dự án tương tự.
