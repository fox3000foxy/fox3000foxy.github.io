---
title: تشغيل مكتبة Node.js في المتصفح بدون Wasm -- polyfills
  typescript-virtual-container
description: كيف أعادت Fortune تنفيذ node:fs و node:crypto وعشرات وحدات Node
  النمطية في 640 سطرًا من JavaScript لجعل الحاوية تعمل في المتصفح بدون Wasm.
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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "wYe/DYscvRwcXxVV4e755gKmQMbgLrxvRgDYWQ+P5Iqvt7WO6DZ1LmBAxGWZs6HMOlcyJ2RvjcdxsOp0ZitTUA=="
---

# تشغيل مكتبة Node.js في المتصفح بدون Wasm -- polyfills لـ typescript-virtual-container

قضيت مؤخرًا وقتًا طويلاً في دراسة الكود المصدري لـ [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)، مشروع [Fortune (Chloé Rolzhausen)](https://itsrealfortune.fr). والجزء الذي أدهشني أكثر ليس VFS، ولا الشبكة الافتراضية، ولا أوامر Unix الـ 170 المعاد تنفيذها في TypeScript. بل مجلد `polyfills/`.

لأن الوحدة تعمل في المتصفح، بدون Wasm، ولتحقيق ذلك أعادت Fortune تنفيذ طبقة `node:*` التي تحتاجها المكتبة يدويًا بالكامل. حوالي 640 سطرًا من JavaScript الحرفي الذي يحل محل `node:fs` و `node:crypto` و `node:os` و `node:net` وغيرها.

يشرح هذا المقال كيف يعمل ذلك، polyfill تلو الآخر.

---

## المشكلة الأساسية

مكتبة Node.js تستخدم واجهات برمجة تطبيقات (APIs) غير موجودة في المتصفح. عندما تكتب `import { readFileSync } from 'node:fs'`، هذا استدعاء نظام من جانب Node -- وصول حقيقي للقرص عبر libuv. في المتصفح، `node:fs` غير موجودة إطلاقًا.

الحلول المعتادة هي:

- **بيئة تشغيل Wasm** (مثل Emscripten، WASIp1/WASIp2) -- تقوم بترجمة Node.js إلى Wasm وتشغيله. النتيجة: حزم بحجم 10-50 MB، وقت تحميل ملحوظ، تعقيد نشر كبير.
- **polyfills عامة** (مثل `browserify`، `webpack node: polyfills`) -- مكتبات npm توفر تقريبات لكل وحدة Node نمطية. غالبًا ما تكون ثقيلة جدًا، وغير مناسبة للحالة المحددة.
- **إعادة كتابة polyfills يدويًا** -- عمل أكثر، لكن بنتيجة مثالية.

اختارت Fortune الخيار الثالث. والنتيجة هي حزمة متصفح هي مجرد المكتبة، تبدأ فورًا، ولا تعتمد على أي بنية تحتية خارجية.

---

## آلية البناء

كل شيء يعتمد على esbuild وخياره `alias`. كل استيراد `node:*` يُعاد توجيهه إلى ملف محلي:

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

خيار `inject` يستحق الذكر: يسمح بحقن `process.js` و `buffer.js` في رأس كل ملف من الحزمة، مما يجعل `process` و `Buffer` متاحين عمومًا دون أي استيراد صريح. تمامًا كما تعرضها Node.js بشكل أصلي.

---

## `buffer.js` -- `Buffer` على `Uint8Array`

هذا أحد المتغيرين العموميين المحقونين. `Buffer` يُستخدم بشكل مكثف في الكود -- كل عملية SSH، كل لقطة VFS، كل قراءة/كتابة ثنائية تمر عبره.

الحل: كلاس `BrowserBuffer` يمتد `Uint8Array` وينفذ كامل واجهة `Buffer` الخاصة بـ Node.js.

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

ما تم تنفيذه إجمالاً:
- `Buffer.from`, `Buffer.alloc`, `Buffer.allocUnsafe`, `Buffer.isBuffer`, `Buffer.concat`, `Buffer.byteLength`
- جميع طرق الكتابة: `writeUInt8/16/32BE/LE`, `writeInt8/16/32BE/LE`, `writeBigUInt64BE/LE`, `writeFloat/DoubleLE/BE`
- جميع طرق القراءة المقابلة
- `toString` مع دعم hex و base64 و utf8
- `copy`, `equals`, `slice`, `subarray`

هذا يمثل 116 سطرًا. مقابل ما يستبدله، إنه مدمج بشكل ملحوظ.

الحيلة الرئيسية هي استخدام `DataView` للوصول متعدد البايتات، مما يعالج ترتيب البايتات (endianness) بشكل صحيح دون الحاجة للتلاعب بالبتات يدويًا لكل نوع:

```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```

---

## `process.js` -- المتغير العمومي `process` الأدنى

المتغير العمومي الآخر المحقون. صغير جدًا لكنه ضروري -- الكود يختبر غالبًا `process.env.NODE_ENV` و `process.platform` و `process.nextTick` إلخ.

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

التعيين `nextTick` → `queueMicrotask` هو أهم تفصيل هنا. `process.nextTick` في Node.js يجدول استدعاءً في نهاية المرحلة الحالية من حلقة الأحداث، قبل الإدخال/الإخراج. `queueMicrotask` في المتصفح يفعل شيئًا مشابهًا جدًا من الناحية الدلالية -- يجدول مهمة صغرى (microtask)، تُنفذ قبل الرسم التالي أو الحدث التالي. ليس مطابقًا، لكنه قريب كفاية ليعمل كل الكود الذي يستخدم `nextTick` بشكل صحيح في المتصفح.

---

## `node:fs` -- IndexedDB كنظام ملفات متزامن

هذا هو polyfill الأكثر تعقيدًا، والأكثر إثارة للاهتمام تقنيًا وبفارق كبير.

المشكلة صعبة: `node:fs` يعرض واجهة برمجة تطبيقات متزامنة (`readFileSync`, `writeFileSync` إلخ)، لكن واجهات تخزين المتصفح كلها غير متزامنة (IndexedDB، Cache API إلخ). لا يمكنك عمل `await` في منتصف دالة متزامنة.

حل Fortune: مستوى مزدوج من التخزين المؤقت.

**المستوى 1 -- Map في الذاكرة (متزامن)**  
كل القراءات تتم من `Map<string, Uint8Array>` في الذاكرة. فوري، متزامن، لا مشكلة في واجهة API.

**المستوى 2 -- IndexedDB (غير متزامن، في الخلفية)**  
عند بدء التشغيل، يُحمّل كل محتوى IndexedDB في الـ Map. تتم الكتابة فورًا في الـ Map *وتطلق* كتابة غير متزامنة نحو IndexedDB دون حظر.

```js
const DB_NAME = 'vfs-fs-shim';
const STORE = 'files';
let db = null;

// Sync cache (path → Uint8Array | null)
const memCache = new Map();

// Preload عند بدء التشغيل
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

// كتابة غير متزامنة نحو IndexedDB (غير محظورة)
function idbSet(path, value) {
  openDB().then(db => {
    const tx = db.transaction(STORE, 'readwrite');
    if (value === null) tx.objectStore(STORE).delete(path);
    else tx.objectStore(STORE).put(value, path);
  });
}
```

واجهة API المعروضة كاملة: `readFileSync`, `writeFileSync`, `appendFileSync`, `existsSync`, `unlinkSync`, `rmSync` (مع خيار `recursive`)، `mkdirSync` (مع خيار `recursive`)، `readdirSync`, `statSync`, `renameSync`.

يوجد حتى طبقة لإدارة واصفات الملفات (file descriptors) (`openSync`, `writeSync`, `closeSync`) ليعمل سجل WAL الخاص بـ VFS في وضع المتصفح -- يفتح السجل fd، يكتب فيه، يغلقه، وتنتهي البيانات في IndexedDB.

الخاصية `ready` مُصدّرة للسماح للكود بمعرفة متى ينتهي التحميل المسبق الأولي:

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

بفضل هذا تستمر لقطات VFS في النجاة من إعادة تحميل الصفحة في المتصفح. عندما تعيد تحميل العرض التجريبي، يُستعاد VFS بالضبط في الحالة التي تركته فيها، من IndexedDB، دون أي خادم وسيط.

---

## `node:crypto` -- SHA-256 و HMAC و PBKDF2 في JS خالص

بدلاً من استيراد مكتبة تشفير مُجمّعة في Wasm، نفذت Fortune الأساسيات الضرورية مباشرة.

**SHA-256** منفذ من الصفر باستخدام ثوابت FIPS 180-4:

```js
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, /* ... 60 ثابتًا أخرى */ 
]);

function sha256(data) {
  // padding FIPS 180-4
  const msg = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
  // ...
  // 64 جولة ضغط
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

فوق SHA-256، بُني **HMAC-SHA256** و **PBKDF2-HMAC-SHA256**. هاتان البدائيتان تُستخدمان لاشتقاق المفاتيح في تبادلات SSH والمصادقة الداخلية.

واجهة API المُصدّرة تشبه واجهة Node.js:

```js
// Hash عادي
const hash = createHash('sha256').update('data').digest('hex');

// بايتات عشوائية (عبر واجهة Web Crypto القياسية)
const bytes = randomBytes(32);

// UUID
const id = randomUUID();

// مقارنة آمنة زمنيًا
const ok = timingSafeEqual(a, b);

// scrypt (مقرب عبر PBKDF2)
const key = scryptSync(password, salt, 32, { N: 16384 });
```

ملاحظة: `scryptSync` مُقرّب عبر PBKDF2 مع عدد تكرارات مضبوط على المعامل `N`. ليس scrypt حقيقيًا (الذي يستخدم مخطط ذاكرة مختلفًا)، لكنه كافٍ لاستخدامات المشروع.

الدوال التي لا يمكن محاكاتها بشكل معقول في المتصفح (`generateKeyPairSync`, `createCipheriv`, `createDecipheriv`, `createSign`) تُلقي خطأً صريحًا إذا تم استدعاؤها. سلوك أمين.

---

## `node:os` -- قراءة مواصفات المتصفح الحقيقية

بدلاً من إرجاع قيم ثابتة، يقرأ هذا polyfill واجهات المتصفح لإرجاع معلومات تطابق جهاز المستخدم الحقيقي.

```js
export function totalmem() {
  try {
    return navigator?.deviceMemory
      ? navigator.deviceMemory * 1024 * 1024 * 1024
      : 2 * 1024 * 1024 * 1024; // 2 GB افتراضيًا
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

النتيجة الملموسة: عندما تشغل `neofetch` في العرض التجريبي للمتصفح، عدد الأنوية والذاكرة RAM المعروضة تطابق جهازك. إنها تفصيلة صغيرة، لكنها تساهم بشكل هائل في مصداقية الطرفية.

الصادرات الأخرى: `freemem` (40% من إجمالي الذاكرة، تقريب معقول)، `platform` ← `'browser'`، `type` ← `'Linux'`، `release` ← `'web'`، `uptime` عبر `performance.now()`، `endianness` ← `'LE'` (little-endian، صحيح على جميع معالجات x86/ARM الاستهلاكية)، `loadavg` ← `[0, 0, 0]`.

---

## `node:net` -- stubs TCP نظيفة

المتصفح لا يملك وصولاً إلى مقابس TCP الخام (WebSocket لا يُحتسب -- إنه بروتوكول تطبيقي مختلف). لذلك `node:net` هو stub، لكن stub *مكتوب جيدًا*.

```js
export class Socket {
  connect() { notImpl('Socket.connect')(); }
  on() { return this; }    // قابل للتسلسل
  once() { return this; }  // قابل للتسلسل
  pipe() { return this; }  // قابل للتسلسل
  setEncoding() { return this; }
  remoteAddress = '127.0.0.1';
  remotePort = 0;
  // ...
}
```

النقطة المهمة: طرق تسجيل الأحداث (`on`, `once`, `off`, `emit`) تُرجع `this` ولا تُلقي خطأً. هذا يسمح للكود الذي يفعل `new net.Socket().on('connect', cb)` بالعمل دون تعطل، حتى لو لم يتم الاتصال أبدًا. فقط الطرق التي *تحاول فعلاً الاتصال* تُلقي خطأً.

`isIP`, `isIPv4`, `isIPv6` منفذة بشكل صحيح (ليست stubs) لأنها تُستخدم بواسطة كود الشبكة الافتراضية للتحقق من صحة العناوين، دون فتح أي مقبس.

---

## `node:path` -- عمليات مسار POSIX

إعادة تنفيذ كاملة لعمليات مسار POSIX، مكيفة مع السياق (لا backslash في Windows، المسارات دائمًا مطلقة مع `/`).

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

بسيط، مدمج، صحيح لاستخدامات المشروع.

---

## `node:url` -- تفويض لواجهات المتصفح

هذه أنيقة ببساطتها. واجهة `URL` و `URLSearchParams` موجودة أصلاً في المتصفح -- يكفي إعادة تصديرها.

```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```

فقط `fileURLToPath` و `pathToFileURL` تحتاجان تنفيذًا، لأنهما خاصتان بـ Node:

```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```

هذا هو النهج المثالي عندما توفر المنصة الهدف (المتصفح) بالفعل المكافئ الأصلي.

---

## `node:zlib` -- هوية

```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```

سطران. المكتبة تستخدم `fflate` للضغط الفعلي (الذي يعمل في المتصفح أصلاً). `node:zlib` يُستورد فقط في مسارات كود لا تُنفذ في سياق المتصفح -- لذا فإن التمرير المباشر (passthrough) كافٍ.

أحيانًا أفضل تنفيذ هو سطران.

---

## `node:events` -- EventEmitter أدنى

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

التنفيذ الكامل لـ `EventEmitter` في Node.js يبلغ حوالي 600 سطر مع إدارة `maxListeners` و `once` و `prependListener` إلخ. هنا 12 سطرًا لأربع طرق مستخدمة فعلاً. tree-shaking ذهني قبل حتى tree-shaking أداة البناء.

---

## `ssh2` و `roxify` -- stubs صريحة

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

خادم SSH لا يعمل في المتصفح (لن يكون له معنى -- من سيتصل؟). لكن الكود الذي *يتحدث عن SSH من جانب العميل* -- الكلاسات التي تبني حزم SSH، محللات البروتوكول -- موجود في المكتبة. هذه الـ stubs تسمح بضم كل هذا الكود في الحزمة دون خطأ، مع ضمان رفع خطأ واضح إذا حاول أحد استدعاء طريقة تتطلب مقبسًا حقيقيًا.

`roxify` هو تنسيق ضغط مملوك يُستخدم للقطات VFS في وضع Node. في المتصفح، يُستخدم `fflate` بدلاً منه -- يكتفي polyfill برفع خطأ إذا تم استدعاء `roxify` مباشرة.

---

## `node:worker_threads` -- إعادة تصدير Web Workers

هذه الأكثر دقة. `node:worker_threads` في Node.js و Web Workers في المتصفح هما واجهتا API مختلفتان، لكنهما متقاربتان conceptually. polyfill يقوم بالتعيين:

```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```

`MessageChannel` و `MessagePort` مُعاد تصديرهما مباشرة من المتصفح (نفس API). `Worker` نفسه يحتاج غلافًا (wrapper) لأن المُنشئ مختلف (Node يتوقع مسار وحدة، المتصفح يتوقع URL). `isMainThread` دائمًا `true` في جانب المتصفح في هذا السياق.

---

## نظرة عامة: ماذا تمثل هذه الـ 640 سطرًا

| Polyfill | أسطر | إستراتيجية |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array` + `DataView`، كل واجهة `Buffer` |
| `node:crypto` | 166 | SHA-256/HMAC/PBKDF2 من الصفر + Web Crypto للعشوائيات |
| `node:fs` | 210 | `Map` في الذاكرة + IndexedDB غير متزامن |
| `node:net` | 70 | Stubs قابلة للتسلسل + تحقق IP حقيقي |
| `ssh2` | 74 | Stubs صريحة |
| `process.js` | 14 | `process` أدنى قابل للحياة |
| `node:path` | ~30 | عمليات مسار POSIX |
| `node:url` | ~25 | تفويض لواجهات المتصفح |
| `node:events` | ~12 | EventEmitter بـ 4 طرق |
| `node:os` | ~25 | `navigator.deviceMemory` / `hardwareConcurrency` |
| `node:zlib` | 4 | تمرير مباشر (Passthrough) |
| `node:worker_threads` | ~30 | إعادة تصدير Web Workers |
| `roxify.js` | 8 | Stubs |

640 سطرًا. لا اعتماديات npm. لا Wasm. وهذا يعطيك حزمة متصفح تبدأ في أقل من ثانية وتعمل دون أي بنية تحتية من جانب الخادم.

---

## ما يمكننا استخلاصه

في المرة القادمة التي تريد فيها نقل مكتبة Node.js إلى المتصفح، هذا ما يثبته نهج Fortune:

1. **حدد ما هو مستخدم فعلاً.** لا حاجة لتنفيذ `EventEmitter` بالكامل إذا كان الكود يستخدم فقط `on` و `emit` و `removeListener`.

2. **فوض لواجهات المتصفح عندما يمكن ذلك.** `URL` و `URLSearchParams` و `MessageChannel` و `MessagePort` و `crypto.getRandomValues` -- المتصفح يملكها بالفعل، فلنستخدمها.

3. **التخزين المؤقت المتزامن أمام واجهة غير متزامنة.** حل `Map` + IndexedDB لـ `node:fs` هو النمط الأكثر قابلية لإعادة الاستخدام في المجلد بأكمله.

4. **الـ stubs الصريحة أفضل من التنفيذات غير المكتملة الصامتة.** الأمر `throw new Error('not implemented in browser')` الصريح مفيد بشكل لا نهائي أكثر من `return undefined` الذي يترك الخلل يظهر بعد 10 استدعاءات.

5. **esbuild `alias` + `inject` مُقَلَّم من قيمته.** إنها الأداة المثالية لهذا النوع من النقل -- لا إعداد webpack، لا إضافة، مجرد قائمة استبدالات.

---

الكود موجود في المستودع: [github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills). كل ملف يتسع في صفحة واحدة، قابل للقراءة مباشرة على GitHub. موصى به بشدة إذا كنت تعمل على مشروع مماثل.
