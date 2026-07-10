---
title: बिना Wasm के ब्राउज़र में Node.js लाइब्रेरी चलाना --
  typescript-virtual-container के polyfills
description: कैसे Fortune ने node:fs, node:crypto और एक दर्जन Node मॉड्यूल को
  640 लाइनों JavaScript में हाथ से रीइम्प्लीमेंट किया ताकि कंटेनर
  बिना Wasm के ब्राउज़र में चले।
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
author_sig: "MEQCIB+LZrT/p4m4T0UzCtXzwZ0tdtGgA+yOWzTasJWeps6SAiA0p4iFvuVuucaY8AxMrVnvIg+jCudY4VGl2bb4tYaQYQ=="
---

# बिना Wasm के ब्राउज़र में Node.js लाइब्रेरी चलाना -- typescript-virtual-container के polyfills

मैंने हाल ही में [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) के सोर्स कोड को खंगालने में काफी समय बिताया, जो [Fortune (Chloé Rolzhausen)](https://itsrealfortune.fr) का प्रोजेक्ट है। और जिस हिस्से ने मुझे सबसे ज्यादा हैरान किया, वह VFS नहीं है, वह वर्चुअल नेटवर्क नहीं है, वह 170 यूनिक्स कमांड नहीं हैं जो TypeScript में रीइम्प्लीमेंट की गई हैं। वह `polyfills/` फ़ोल्डर है।

क्योंकि मॉड्यूल ब्राउज़र में बिना Wasm के चलता है, और इसके लिए Fortune ने हाथ से वह पूरी `node:*` लेयर रीइम्प्लीमेंट की है जिसकी लाइब्रेरी को ज़रूरत है। लगभग 640 लाइनों की हस्तनिर्मित JavaScript जो `node:fs`, `node:crypto`, `node:os`, `node:net`, और कुछ अन्य को रिप्लेस करती है।

यह लेख बताता है कि यह कैसे काम करता है, polyfill दर polyfill।

---

## मूल समस्या

एक Node.js लाइब्रेरी ऐसी APIs का उपयोग करती है जो ब्राउज़र में मौजूद नहीं हैं। जब आप `import { readFileSync } from 'node:fs'` लिखते हैं, तो यह Node की ओर से एक सिस्टम कॉल है -- libuv के ज़रिए एक वास्तविक डिस्क एक्सेस। ब्राउज़र में, `node:fs` मौजूद ही नहीं है।

सामान्य समाधान हैं:

- **एक Wasm रनटाइम** (जैसे Emscripten, WASIp1/WASIp2) -- आप Node.js को Wasm में कंपाइल करके चलाते हैं। परिणाम: 10-50 MB के बंडल, ध्यान देने योग्य लोडिंग समय, महत्वपूर्ण डिप्लॉयमेंट जटिलता।
- **जेनेरिक polyfills** (जैसे `browserify`, `webpack node: polyfills`) -- npm पैकेज जो हर Node मॉड्यूल का अनुमानित संस्करण प्रदान करते हैं। अक्सर बहुत भारी, विशिष्ट उपयोग के लिए अनुपयुक्त।
- **हाथ से polyfills लिखना** -- अधिक काम, लेकिन इष्टतम परिणाम।

Fortune ने तीसरा विकल्प चुना। और परिणाम एक ब्राउज़र बंडल है जो सिर्फ लाइब्रेरी है, तुरंत स्टार्ट होता है, और किसी बाहरी इंफ्रास्ट्रक्चर पर निर्भर नहीं करता।

---

## बिल्ड मैकेनिज्म

सब कुछ esbuild और इसके `alias` ऑप्शन पर आधारित है। हर `node:*` इम्पोर्ट एक लोकल फ़ाइल पर रीडायरेक्ट होता है:

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

`inject` ऑप्शन ध्यान देने योग्य है: यह `process.js` और `buffer.js` को बंडल की हर फ़ाइल की शुरुआत में इंजेक्ट करता है, जिससे `process` और `Buffer` बिना किसी स्पष्ट इम्पोर्ट के वैश्विक रूप से उपलब्ध हो जाते हैं। बिल्कुल वैसे ही जैसे Node.js उन्हें मूल रूप से एक्सपोज़ करता है।

---

## `buffer.js` -- `Buffer` ऑन `Uint8Array`

यह दो इंजेक्टेड ग्लोबल्स में से एक है। `Buffer` का कोड में बड़े पैमाने पर उपयोग होता है -- हर SSH ऑपरेशन, हर VFS स्नैपशॉट, हर बाइनरी रीड/राइट इसी से होकर गुज़रता है।

समाधान: एक `BrowserBuffer` क्लास जो `Uint8Array` को एक्सटेंड करती है और Node.js के पूरे `Buffer` API को इम्प्लीमेंट करती है।

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

कुल मिलाकर जो इम्प्लीमेंट किया गया है:
- `Buffer.from`, `Buffer.alloc`, `Buffer.allocUnsafe`, `Buffer.isBuffer`, `Buffer.concat`, `Buffer.byteLength`
- सभी राइट मेथड्स: `writeUInt8/16/32BE/LE`, `writeInt8/16/32BE/LE`, `writeBigUInt64BE/LE`, `writeFloat/DoubleLE/BE`
- सभी संबंधित रीड मेथड्स
- `toString` जिसमें hex, base64, utf8 सपोर्ट है
- `copy`, `equals`, `slice`, `subarray`

यह 116 लाइनें हैं। जो चीज़ यह रिप्लेस करता है, उसके लिए यह उल्लेखनीय रूप से कॉम्पैक्ट है।

मुख्य ट्रिक मल्टी-बाइट एक्सेस के लिए `DataView` का उपयोग है, जो हर टाइप के लिए मैन्युअली बिट्स मैनिपुलेट किए बिना endianness को सही ढंग से संभालता है:

```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```

---

## `process.js` -- न्यूनतम `process` ग्लोबल

दूसरा इंजेक्टेड ग्लोबल। छोटा लेकिन आवश्यक -- कोड अक्सर `process.env.NODE_ENV`, `process.platform`, `process.nextTick`, आदि चेक करता है।

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

`nextTick` → `queueMicrotask` मैपिंग यहाँ सबसे महत्वपूर्ण डिटेल है। Node.js में `process.nextTick` इवेंट लूप के वर्तमान फेज़ के अंत में, I/O से पहले एक कॉलबैक शेड्यूल करता है। ब्राउज़र में `queueMicrotask` शब्दार्थ की दृष्टि से बहुत समान काम करता है -- यह एक माइक्रोटास्क शेड्यूल करता है, जो अगले रेंडर या इवेंट से पहले निष्पादित होता है। यह एकदम समान नहीं है, लेकिन इतना करीब है कि `nextTick` का उपयोग करने वाला सारा कोड ब्राउज़र में सही ढंग से काम करता है।

---

## `node:fs` -- IndexedDB एक सिंक्रोनस फ़ाइल सिस्टम के रूप में

यह सबसे परिष्कृत polyfill है, और अब तक तकनीकी रूप से सबसे दिलचस्प है।

समस्या नाजुक है: `node:fs` एक सिंक्रोनस API एक्सपोज़ करता है (`readFileSync`, `writeFileSync`, आदि), लेकिन ब्राउज़र की स्टोरेज APIs सभी एसिंक्रोनस हैं (IndexedDB, Cache API, आदि)। आप एक सिंक्रोनस फ़ंक्शन के बीच में `await` नहीं कर सकते।

Fortune का समाधान: कैश का डबल लेवल।

**लेवल 1 -- इन-मेमोरी Map (सिंक्रोनस)**  
सभी रीड्स मेमोरी में एक `Map<string, Uint8Array>` से होती हैं। तत्काल, सिंक्रोनस, कोई API समस्या नहीं।

**लेवल 2 -- IndexedDB (एसिंक्रोनस, बैकग्राउंड में)**  
स्टार्टअप पर, IndexedDB की पूरी सामग्री Map में लोड हो जाती है। राइट्स तुरंत Map में होती हैं *और* बिना ब्लॉक किए IndexedDB में एक एसिंक्रोनस राइट शुरू करती हैं।

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

एक्सपोज़्ड API पूर्ण है: `readFileSync`, `writeFileSync`, `appendFileSync`, `existsSync`, `unlinkSync`, `rmSync` (`recursive` ऑप्शन के साथ), `mkdirSync` (`recursive` ऑप्शन के साथ), `readdirSync`, `statSync`, `renameSync`।

फ़ाइल डिस्क्रिप्टर मैनेजमेंट (`openSync`, `writeSync`, `closeSync`) की एक लेयर भी है ताकि VFS का WAL जर्नल ब्राउज़र मोड में काम करे -- जर्नल एक fd खोलता है, उसमें लिखता है, उसे बंद करता है, और डेटा IndexedDB में पहुँच जाता है।

`ready` प्रॉपर्टी एक्सपोर्ट की गई है ताकि कोड को पता चले कि शुरुआती प्रीलोड कब पूरा हुआ:

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

यही वजह है कि VFS स्नैपशॉट ब्राउज़र में पेज रीलोड होने पर भी बचे रहते हैं। जब आप डेमो को रीलोड करते हैं, तो VFS ठीक उसी स्थिति में बहाल हो जाता है जिसमें आपने इसे छोड़ा था, IndexedDB से, बिना किसी सर्वर के।

---

## `node:crypto` -- SHA-256, HMAC, PBKDF2 शुद्ध JS में

Wasm में कंपाइल्ड क्रिप्टो लाइब्रेरी इम्पोर्ट करने के बजाय, Fortune ने आवश्यक प्रिमिटिव को सीधे इम्प्लीमेंट किया।

**SHA-256** को FIPS 180-4 कॉन्स्टेंट के साथ स्क्रैच से इम्प्लीमेंट किया गया है:

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

SHA-256 के ऊपर, **HMAC-SHA256** और **PBKDF2-HMAC-SHA256** बनाए गए हैं। इन दो प्रिमिटिव का उपयोग SSH एक्सचेंजों और आंतरिक प्रमाणीकरण में की डेरिवेशन के लिए किया जाता है।

एक्सपोर्टेड API Node.js जैसा दिखता है:

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

नोट: `scryptSync` को PBKDF2 के ज़रिए `N` पैरामीटर पर आधारित इटरेशन काउंट के साथ अनुमानित किया गया है। यह असली scrypt नहीं है (जो एक अलग मेमोरी स्कीम का उपयोग करता है), लेकिन प्रोजेक्ट के उपयोगों के लिए यह पर्याप्त है।

जो फ़ंक्शन ब्राउज़र में उचित रूप से इम्युलेट नहीं किए जा सकते (`generateKeyPairSync`, `createCipheriv`, `createDecipheriv`, `createSign`), वे कॉल किए जाने पर एक स्पष्ट एरर फेंकते हैं। ईमानदार व्यवहार।

---

## `node:os` -- ब्राउज़र की वास्तविक स्पेसिफिकेशन पढ़ना

यह polyfill निश्चित मान लौटाने के बजाय, उपयोगकर्ता की वास्तविक मशीन से मेल खाने वाली जानकारी लौटाने के लिए ब्राउज़र APIs पढ़ता है।

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

ठोस परिणाम: जब आप ब्राउज़र डेमो में `neofetch` चलाते हैं, तो दिखाए गए कोर और RAM की संख्या आपकी मशीन से मेल खाती है। यह एक छोटी बात है, लेकिन यह टर्मिनल की विश्वसनीयता में बहुत योगदान देता है।

अन्य एक्सपोर्ट्स: `freemem` (कुल मेमोरी का 40%, उचित अनुमान), `platform` → `'browser'`, `type` → `'Linux'`, `release` → `'web'`, `uptime` `performance.now()` के ज़रिए, `endianness` → `'LE'` (लिटिल-एंडियन, सभी मुख्यधारा x86/ARM प्रोसेसर पर सही), `loadavg` → `[0, 0, 0]`.

---

## `node:net` -- साफ TCP stubs

ब्राउज़र के पास कच्चे TCP सॉकेट तक पहुँच नहीं है (WebSocket मायने नहीं रखता -- यह एक अलग एप्लिकेशन-लेयर प्रोटोकॉल है)। इसलिए `node:net` एक stub है, लेकिन एक *अच्छी तरह से लिखा गया* stub।

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

महत्वपूर्ण बिंदु: इवेंट रजिस्ट्रेशन मेथड्स (`on`, `once`, `off`, `emit`) `this` लौटाती हैं और एरर नहीं फेंकतीं। इससे `new net.Socket().on('connect', cb)` करने वाला कोड बिना क्रैश हुए काम करता है, भले ही कनेक्शन कभी न हो। केवल वे मेथड्स जो *वास्तव में कनेक्ट करने का प्रयास करती हैं* एरर फेंकती हैं।

`isIP`, `isIPv4`, `isIPv6` सही ढंग से इम्प्लीमेंट किए गए हैं (stubs नहीं) क्योंकि इनका उपयोग वर्चुअल नेटवर्क कोड द्वारा बिना कोई सॉकेट खोले पतों को मान्य करने के लिए किया जाता है।

---

## `node:path` -- POSIX पथ ऑपरेशन

POSIX पथ ऑपरेशनों की पूर्ण रीइम्प्लीमेंटेशन, संदर्भ के अनुकूल (कोई विंडोज बैकस्लैश नहीं, पथ हमेशा `/` से शुरू होते हैं)।

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

सरल, कॉम्पैक्ट, प्रोजेक्ट के उपयोगों के लिए सही।

---

## `node:url` -- ब्राउज़र APIs को डेलिगेशन

यह अपनी सादगी में सुंदर है। `URL` और `URLSearchParams` APIs ब्राउज़र में पहले से ही मूल रूप से मौजूद हैं -- बस उन्हें री-एक्सपोर्ट करना है।

```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```

केवल `fileURLToPath` और `pathToFileURL` को इम्प्लीमेंटेशन की आवश्यकता है, क्योंकि वे Node के लिए विशिष्ट हैं:

```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```

यह आदर्श दृष्टिकोण है जब लक्ष्य प्लेटफ़ॉर्म (ब्राउज़र) पहले से ही मूल समकक्ष प्रदान करता है।

---

## `node:zlib` -- आइडेंटिटी

```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```

दो लाइनें। लाइब्रेरी वास्तविक कंप्रेशन के लिए `fflate` का उपयोग करती है (जो ब्राउज़र में मूल रूप से काम करता है)। `node:zlib` केवल उन कोड पथों में इम्पोर्ट किया जाता है जो ब्राउज़र संदर्भ में निष्पादित नहीं होते -- इसलिए एक passthrough पर्याप्त है।

कभी-कभी सही इम्प्लीमेंटेशन सिर्फ दो लाइनें होती है।

---

## `node:events` -- न्यूनतम EventEmitter

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

Node.js की पूर्ण `EventEmitter` इम्प्लीमेंटेशन `maxListeners`, `once`, `prependListener`, आदि के साथ लगभग 600 लाइनों की है। यहाँ वास्तव में उपयोग की जाने वाली 4 मेथड्स के लिए 12 लाइनें हैं। बिल्ड टूल के tree-shaking से पहले ही मेंटल tree-shaking।

---

## `ssh2` और `roxify` -- स्पष्ट stubs

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

SSH सर्वर ब्राउज़र में नहीं चलता (इसका कोई मतलब नहीं होगा -- कौन कनेक्ट होगा?)। लेकिन जो कोड *SSH के बारे में क्लाइंट साइड पर बात करता है* -- SSH पैकेट बनाने वाली क्लासेस, प्रोटोकॉल पार्सर्स -- वह लाइब्रेरी में मौजूद है। ये stubs उस सारे कोड को बिना एरर के बंडल होने देते हैं, साथ ही यह गारंटी देते हैं कि अगर कोई ऐसी मेथड कॉल करने की कोशिश करता है जिसके लिए वास्तविक सॉकेट की आवश्यकता है, तो एक स्पष्ट एरर उठेगा।

`roxify` Node मोड में VFS स्नैपशॉट के लिए उपयोग किया जाने वाला एक मालिकाना कंप्रेशन फ़ॉर्मेट है। ब्राउज़र में, इसके बजाय `fflate` का उपयोग किया जाता है -- polyfill अगर `roxify` को सीधे कॉल किया जाता है तो एरर फेंक देता है।

---

## `node:worker_threads` -- वेब वर्कर्स का री-एक्सपोर्ट

यह सबसे सूक्ष्म है। Node.js में `node:worker_threads` और ब्राउज़र के वेब वर्कर्स दो अलग APIs हैं, लेकिन वे वैचारिक रूप से करीब हैं। polyfill मैपिंग करता है:

```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```

`MessageChannel` और `MessagePort` को ब्राउज़र से सीधे री-एक्सपोर्ट किया गया है (एक ही API)। `Worker` को खुद एक रैपर की आवश्यकता है क्योंकि कंस्ट्रक्टर अलग है (Node एक मॉड्यूल पथ की अपेक्षा करता है, ब्राउज़र एक URL की)। इस संदर्भ में ब्राउज़र साइड पर `isMainThread` हमेशा `true` है।

---

## समग्र दृष्टिकोण: ये 640 लाइनें क्या दर्शाती हैं

| Polyfill | लाइनें | रणनीति |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array` + `DataView`, पूरा `Buffer` API |
| `node:crypto` | 166 | SHA-256/HMAC/PBKDF2 स्क्रैच से + रैंडम के लिए वेब क्रिप्टो |
| `node:fs` | 210 | मेमोरी में `Map` + एसिंक IndexedDB |
| `node:net` | 70 | चेन करने योग्य stubs + वास्तविक IP वैलिडेशन |
| `ssh2` | 74 | स्पष्ट stubs |
| `process.js` | 14 | न्यूनतम व्यवहार्य `process` |
| `node:path` | ~30 | POSIX पथ ऑपरेशन |
| `node:url` | ~25 | ब्राउज़र APIs को डेलिगेशन |
| `node:events` | ~12 | EventEmitter 4 मेथड्स |
| `node:os` | ~25 | `navigator.deviceMemory` / `hardwareConcurrency` |
| `node:zlib` | 4 | Passthrough |
| `node:worker_threads` | ~30 | वेब वर्कर्स का री-एक्सपोर्ट |
| `roxify.js` | 8 | Stubs |

640 लाइनें। कोई npm डिपेंडेंसी नहीं। कोई Wasm नहीं। और यह एक ब्राउज़र बंडल देता है जो एक सेकंड से भी कम में स्टार्ट होता है और बिना किसी सर्वर-साइड इंफ्रास्ट्रक्चर के चलता है।

---

## हम क्या सीख सकते हैं

अगली बार जब आप किसी Node.js लाइब्रेरी को ब्राउज़र में पोर्ट करना चाहें, तो Fortune का दृष्टिकोण यह दर्शाता है:

1. **पहचानें कि वास्तव में क्या उपयोग होता है।** पूरा `EventEmitter` इम्प्लीमेंट करने की ज़रूरत नहीं है अगर कोड केवल `on`, `emit`, और `removeListener` का उपयोग करता है।

2. **जब संभव हो ब्राउज़र APIs को डेलिगेट करें।** `URL`, `URLSearchParams`, `MessageChannel`, `MessagePort`, `crypto.getRandomValues` -- ब्राउज़र में ये पहले से मौजूद हैं, इनका उपयोग करें।

3. **एसिंक API के सामने सिंक कैश।** `node:fs` के लिए `Map` + IndexedDB का समाधान पूरे फ़ोल्डर का सबसे पुन: उपयोग योग्य पैटर्न है।

4. **ईमानदार stubs खामोश अधूरे इम्प्लीमेंटेशन से बेहतर हैं।** एक स्पष्ट `throw new Error('not implemented in browser')` एक `return undefined` से अत्यधिक अधिक उपयोगी है जो बग को 10 कॉल बाद प्रकट होने देता है।

5. **esbuild `alias` + `inject` को कम आंका गया है।** यह इस तरह के पोर्टिंग के लिए एकदम सही टूल है -- शून्य वेबपैक कॉन्फिगरेशन, शून्य प्लगिन, बस रिप्लेसमेंट की एक सूची।

---

कोड रिपॉजिटरी में है: [github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills). हर फ़ाइल एक पेज में समा जाती है, GitHub पर सीधे पढ़ने लायक है। अगर आप किसी समान प्रोजेक्ट पर काम कर रहे हैं तो अत्यधिक अनुशंसित।
