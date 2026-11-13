---
title: تشغيل مكتبة Node.js في المتصفح دون Wasm، polyfills الخاصة بـtypescript-virtual-container
description: كيف أعادت Fortune تنفيذ node:fs وnode:crypto يدويا وعشر وحدات Node
  في 640 سطر JavaScript لكي يعمل الحاوي في المتصفح دون Wasm.
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
author_sig: "8FA7kk1ZFl5Hpe62jk8b8MYQ5KLeEvhLde0KGGFaqrMfhUpexAcNtw3SZ2k6RWot8WXve8i1oYBPDlJ87hAEVg=="
---

# تشغيل مكتبة Node.js في المتصفح دون Wasm، polyfills الخاصة بـtypescript-virtual-container

قضيت مؤخرا وقتا طويلا أنقّب في الكود المصدري لـ[typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)، مشروع [Fortune (Chloé Rolzhausen)](https://itsrealfortune.fr). والجزء الذي فاجأني أكثر هو مجلد `polyfills/`، أكثر حتى من VFS أو الشبكة الافتراضية أو أوامر Unix الـ170 المُعاد تنفيذها في TypeScript.

لأن الوحدة تعمل في المتصفح، دون Wasm، ولهذا أعادت Fortune تنفيذ يدويا كل طبقة `node:*` التي تحتاجها المكتبة. حوالي 640 سطر JavaScript حرفية تستبدل `node:fs` و`node:crypto` و`node:os` و`node:net` وبضعة أخرى.

يشرح هذا المقال كيف يعمل ذلك، polyfill بـpolyfill.

---

## المشكلة الأساسية

تستخدم مكتبة Node.js واجهات غير موجودة في المتصفح. عندما تكتب `import { readFileSync } from 'node:fs'`، فهو استدعاء نظام جهة Node، وصول قرص حقيقي عبر libuv. في المتصفح، لا توجد `node:fs` إطلاقا.

الحلول المعتادة هي :

- **Runtime في Wasm** (نوع Emscripten وWASIp1/WASIp2)، تجمّع Node.js في Wasm وتنفذه. النتيجة : حزم 10-50 MB وزمن تحميل ملحوظ وتعقيد نشر كبير.
- **polyfills عامة** (نوع `browserify` و`webpack node: polyfills`)، مكتبات npm توفر تقريبات لكل وحدة Node. غالبا أثقل من اللازم وغير ملائمة للحالة الخاصة.
- **إعادة كتابة polyfills يدويا**، عمل أكثر، لكن نتيجة مثلى.

اختارت Fortune الخيار الثالث. والنتيجة حزمة متصفح هي فقط المكتبة، تقلع فورا، ولا تعتمد على أي بنية خارجية.

---

## آلية البناء

يرتكز كل شيء على esbuild وخيار `alias`. يُعاد توجيه كل استيراد `node:*` نحو ملف محلي :

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

يستحق خيار `inject` الملاحظة : يسمح بحقن `process.js` و`buffer.js` في رأس كل ملف من الحزمة، مما يجعل `process` و`Buffer` متاحين شموليا دون أي استيراد صريح. تماما كما يعرضهما Node.js أصليا.

---

## `buffer.js`، `Buffer` فوق `Uint8Array`

إنه أحد الشموليين المحقونين. يُستخدَم `Buffer` بكثافة في الكود، فكل عملية SSH وكل لقطة VFS وكل قراءة/كتابة ثنائية تمر من هناك.

الحل : فئة `BrowserBuffer` تمتد `Uint8Array` وتنفذ واجهة `Buffer` كاملة في Node.js.

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

ما هو منفذ إجمالا :
- `Buffer.from` و`Buffer.alloc` و`Buffer.allocUnsafe` و`Buffer.isBuffer` و`Buffer.concat` و`Buffer.byteLength`
- كل طرق الكتابة : `writeUInt8/16/32BE/LE` و`writeInt8/16/32BE/LE` و`writeBigUInt64BE/LE` و`writeFloat/DoubleLE/BE`
- كل طرق القراءة الموافقة
- `toString` مع دعم hex وbase64 وutf8
- `copy` و`equals` و`slice` و`subarray`

يمثل ذلك 116 سطرا. لما يستبدله، إنه مدمج بشكل لافت.

الحيلة الرئيسية هي استخدام `DataView` للوصول متعدد البايتات، مما يدير endianness صحيحا دون التلاعب بالبتات يدويا لكل نوع :

```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```

---

## `process.js`، الشمولي `process` الدنيا

الشمولي الآخر المحقون. ضئيل لكن ضروري، فالكود يختبر غالبا `process.env.NODE_ENV` و`process.platform` و`process.nextTick`، إلخ.

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

رسم `nextTick` ← `queueMicrotask` هو التفصيل الأهم هنا. يجدول `process.nextTick` في Node.js رد اتصال في نهاية المرحلة الراهنة من حلقة الأحداث، قبل إدخال/إخراج. يقدم `queueMicrotask` في المتصفح دلالة قريبة جدا : يجدول مهمة دقيقة، تُنفَّذ قبل العرض أو الحدث التالي، وهذا القرب يكفي ليعمل صحيحا في المتصفح كل كود يستخدم `nextTick`.

---

## `node:fs`، IndexedDB كنظام ملفات متزامن

إنه polyfill الأكثر تطورا، والأكثر إثارة تقنيا بلا منازع.

المشكلة دقيقة : تعرض `node:fs` واجهة متزامنة (`readFileSync` و`writeFileSync`، إلخ)، لكن واجهات تخزين المتصفح كلها غير متزامنة (IndexedDB وCache API، إلخ). لا يمكن عمل `await` في وسط دالة متزامنة.

حل Fortune : مستوى مزدوج من الكاش.

**مستوى 1، Map في الذاكرة (متزامن)**
تتم كل القراءات من `Map<string, Uint8Array>` في الذاكرة. فوري ومتزامن، ولا مشكلة واجهة.

**مستوى 2، IndexedDB (غير متزامن، في الخلفية)**
عند الإقلاع، يُحمَّل كل محتوى IndexedDB في Map. تتم الكتابات فورا في Map *وتطلق* كتابة غير متزامنة نحو IndexedDB دون حظر.

```js
const DB_NAME = 'vfs-fs-shim';
const STORE = 'files';
let db = null;

// كاش متزامن (مسار ← Uint8Array | null)
const memCache = new Map();

// تحميل مسبق عند الإقلاع
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

// كتابة غير متزامنة نحو IndexedDB (غير حاجبة)
function idbSet(path, value) {
  openDB().then(db => {
    const tx = db.transaction(STORE, 'readwrite');
    if (value === null) tx.objectStore(STORE).delete(path);
    else tx.objectStore(STORE).put(value, path);
  });
}
```

الواجهة المعروضة كاملة : `readFileSync` و`writeFileSync` و`appendFileSync` و`existsSync` و`unlinkSync` و`rmSync` (مع خيار `recursive`) و`mkdirSync` (مع خيار `recursive`) و`readdirSync` و`statSync` و`renameSync`.

وهناك حتى طبقة إدارة واصفات ملفات (`openSync` و`writeSync` و`closeSync`) لكي يعمل سجل WAL الخاص بـVFS في وضع المتصفح، فيفتح السجل fd ويكتب فيه ويغلقه، وتنتهي البيانات في IndexedDB.

تُصدَّر الخاصية `ready` ليعرف الكود متى انتهى التحميل المسبق الأولي :

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

وبفضل ذلك تنجو لقطات VFS من إعادة تحميل الصفحة في المتصفح. عندما تعيد تحميل العرض، يُستعاد VFS بالضبط في الحالة التي تركته فيها، من IndexedDB، دون أي خادم مشمول.

---

## `node:crypto`، SHA-256 وHMAC وPBKDF2 في JS خالص

بدلا من استيراد مكتبة تشفير مُجمَّعة في Wasm، نفذت Fortune البدائيات اللازمة مباشرة.

**SHA-256** منفذ من الصفر مع ثوابت FIPS 180-4 :

```js
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, /* ... 60 ثابتا آخر */
]);

function sha256(data) {
  // حشو FIPS 180-4
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

وفوق SHA-256، يُبنَى **HMAC-SHA256** و**PBKDF2-HMAC-SHA256**. تُستخدَم هاتان البدائيتان لاشتقاق المفاتيح في تبادلات SSH والمصادقة الداخلية.

تبدو الواجهة المُصدَّرة كتلك الخاصة بـNode.js :

```js
// تجزئة تقليدية
const hash = createHash('sha256').update('data').digest('hex');

// بايتات عشوائية (عبر واجهة Web Crypto القياسية)
const bytes = randomBytes(32);

// UUID
const id = randomUUID();

// مقارنة آمنة زمنيا
const ok = timingSafeEqual(a, b);

// scrypt (تقريب عبر PBKDF2)
const key = scryptSync(password, salt, 32, { N: 16384 });
```

ملاحظة : `scryptSync` مُقرَّب عبر PBKDF2 مع عدد تكرارات مضبوط على المعامل `N`. يغطي هذا التقريب مخطط الذاكرة الخاص بـscrypt ويغطي استخدامات المشروع.

الدوال التي لا يمكن محاكاتها معقولا في المتصفح (`generateKeyPairSync` و`createCipheriv` و`createDecipheriv` و`createSign`) ترمي خطأ صريحا إذا استُدعيت. سلوك صادق.

---

## `node:os`، قراءة مواصفات المتصفح الحقيقية

بدلا من إعادة قيم ثابتة، يقرأ polyfill واجهات المتصفح ليعيد معلومات تطابق آلة المستخدم الحقيقية.

```js
export function totalmem() {
  try {
    return navigator?.deviceMemory
      ? navigator.deviceMemory * 1024 * 1024 * 1024
      : 2 * 1024 * 1024 * 1024; // 2 Go افتراضيا
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

نتيجة ملموسة : عندما تشغّل `neofetch` في عرض المتصفح، يطابق عدد الأنوية وRAM المعروضان آلتك. إنه تفصيل، لكنه يسهم كثيرا في مصداقية الطرفية.

الصادرات الأخرى : `freemem` (40% من الذاكرة الإجمالية، تقريب معقول) و`platform` ← `'browser'` و`type` ← `'Linux'` و`release` ← `'web'` و`uptime` عبر `performance.now()` و`endianness` ← `'LE'` (little-endian، صحيح على كل معالجات x86/ARM العامة) و`loadavg` ← `[0, 0, 0]`.

---

## `node:net`، بدائل TCP نظيفة

لا وصول للمتصفح لمقابس TCP الخام (WebSocket لا يُحتسَب، فهو بروتوكول تطبيقي مختلف). إذن `node:net` بديل، لكن بديل *مكتوب جيدا*.

```js
export class Socket {
  connect() { notImpl('Socket.connect')(); }
  on() { return this; }    // قابل للسلسلة
  once() { return this; }  // قابل للسلسلة
  pipe() { return this; }  // قابل للسلسلة
  setEncoding() { return this; }
  remoteAddress = '127.0.0.1';
  remotePort = 0;
  // ...
}
```

النقطة المهمة : طرق سجل الأحداث (`on` و`once` و`off` و`emit`) تعيد `this` ولا ترمي خطأ. وهذا يسمح لكود يفعل `new net.Socket().on('connect', cb)` بالعمل دون انهيار، حتى لو لم يحدث الاتصال أبدا. وحده الطرق التي *تحاول الاتصال فعلا* ترمي خطأ.

`isIP` و`isIPv4` و`isIPv6` منفذة صحيحا (مع منطق تحقق حقيقي) لأنها تُستخدَم من كود الشبكة الافتراضية للتحقق من عناوين، دون فتح مقبس أبدا.

---

## `node:path`، عمليات مسارات POSIX

إعادة تنفيذ كاملة لعمليات مسارات POSIX، مكيَّفة للسياق (مسارات مطلقة دائما مع `/` ونمط Unix فقط).

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

بسيط ومدمج وصحيح لاستخدامات المشروع.

---

## `node:url`، تفويض لواجهات المتصفح

هذه أنيقة ببساطتها. واجهة `URL` و`URLSearchParams` موجودة أصليا فعلا في المتصفح، فيكفي إعادة تصديرهما.

```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```

وحده `fileURLToPath` و`pathToFileURL` تتطلبان تنفيذا، لأنهما خاصتان بـNode :

```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```

إنها المقاربة المثلى عندما توفر المنصة المستهدفة (المتصفح) المكافئ الأصلي فعلا.

---

## `node:zlib`، هوية

```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```

سطران. تستخدم المكتبة `fflate` للضغط الحقيقي (الذي يعمل في المتصفح أصليا). لا يُستورَد `node:zlib` إلا في مسارات كود لا تُنفَّذ في سياق المتصفح، فيكفي تمرير.

أحيانا التنفيذ الصحيح سطران.

---

## `node:events`، EventEmitter دنيا

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

تنفيذ `EventEmitter` الكامل في Node.js حوالي 600 سطر مع إدارة `maxListeners` و`once` و`prependListener`، إلخ. وهنا 12 سطرا للطرق الأربع المستخدمة فعلا. تقليم ذهني قبل حتى تقليم أداة البناء.

---

## `ssh2` و`roxify`، بدائل صريحة

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

لا يعمل خادم SSH في المتصفح (لا معنى لذلك، فمن سيتصل ؟). لكن الكود الذي *يتكلم عن SSH جهة العميل*، الفئات التي تبني حزم SSH ومحللات البروتوكول، موجود في المكتبة. تسمح هذه البدائل بتحزيم كل هذا الكود دون خطأ، مع ضمان رمي خطأ واضح إذا حاول شخص استدعاء طريقة تتطلب مقبسا حقيقيا.

`roxify` صيغة ضغط ملكية تُستخدَم للقطات VFS في وضع Node. في المتصفح، يُستخدَم `fflate` بدلا منه، فيكتفي polyfill برمي خطأ إذا استُدعي `roxify` مباشرة.

---

## `node:worker_threads`، إعادة تصدير Web Workers

إنه الأكثر دقة. `node:worker_threads` في Node.js وWeb Workers في المتصفح واجهتان مختلفتان، لكنهما متقاربتان مفاهيميا. يقوم polyfill بالربط :

```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```

يُعاد تصدير `MessageChannel` و`MessagePort` مباشرة من المتصفح (نفس الواجهة). أما `Worker` نفسه فيتطلب غلافا لأن الباني مختلف (تنتظر Node مسار وحدة، وينتظر المتصفح رابطا). `isMainThread` دائما `true` جهة المتصفح في هذا السياق.

---

## نظرة شاملة : ما تمثله هذه 640 سطرا

| Polyfill | أسطر | الاستراتيجية |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array` + `DataView`، واجهة `Buffer` كاملة |
| `node:crypto` | 166 | SHA-256/HMAC/PBKDF2 من الصفر + Web Crypto للعشوائيات |
| `node:fs` | 210 | `Map` في الذاكرة + IndexedDB غير متزامنة |
| `node:net` | 70 | بدائل قابلة للسلسلة + تحققات IP حقيقية |
| `ssh2` | 74 | بدائل صريحة |
| `process.js` | 14 | `process` دنيا قابلة للحياة |
| `node:path` | ~30 | عمليات مسارات POSIX |
| `node:url` | ~25 | تفويض لواجهات المتصفح |
| `node:events` | ~12 | EventEmitter بأربع طرق |
| `node:os` | ~25 | `navigator.deviceMemory` / `hardwareConcurrency` |
| `node:zlib` | 4 | تمرير |
| `node:worker_threads` | ~30 | إعادة تصدير Web Workers |
| `roxify.js` | 8 | بدائل |

640 سطرا. لا تبعية npm. لا Wasm. وتعطي حزمة متصفح تقلع في أقل من ثانية وتعمل دون أي بنية جهة الخادم.

---

## ما يمكن استخلاصه

في المرة التالية التي تريد نقل مكتبة Node.js للمتصفح، إليكم ما تثبته مقاربة Fortune :

1. **حدد ما هو مستخدم فعلا.** نفّذ فقط الطرق التي يستدعيها الكود : هنا تكفي `on` و`emit` و`removeListener` لـ`EventEmitter`.

2. **فوّض لواجهات المتصفح عندما يمكن.** `URL` و`URLSearchParams` و`MessageChannel` و`MessagePort` و`crypto.getRandomValues`، المتصفح لديها فعلا، فاستخدمها.

3. **الكاش المتزامن أمام واجهة غير متزامنة.** حل `Map` + IndexedDB لـ`node:fs` هو النمط الأكثر قابلية لإعادة الاستخدام في المجلد كله.

4. **البدائل الصادقة أفضل من التنفيذات الناقصة الصامتة.** رمي `throw new Error('not implemented in browser')` صريح أنفع بما لا يقاس من `return undefined` يترك bug يظهر بعد 10 استدعاءات.

5. **esbuild مع `alias` + `inject` مُقلَّل من شأنه.** إنه الأداة المثالية لهذا النوع من النقل، صفر إعداد webpack وصفر إضافة، فقط قائمة استبدالات.

---

الكود في المستودع : [github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills). كل ملف يتسع في صفحة واحدة، وهو مقروء مباشرة على GitHub. موصى به بشدة إذا عملت على مشروع مشابه.
