---
title: ब्राउज़र में Wasm के बिना Node.js लाइब्रेरी चलाना, typescript-virtual-container के polyfill
description: Fortune ने node:fs, node:crypto और एक दर्जन Node मॉड्यूल हाथ से 640 JavaScript पंक्तियों में फिर से लागू कैसे किए ताकि कंटेनर ब्राउज़र में बिना Wasm चले।
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
author_sig: "g7mq39KkgP4U05fWn+0QwxezP8ie1L6pSV+W7TF2dZB4NqhNtI1A817KxfblMufJeUi5fLBQBsExjnGBlRxj0A=="
---

# ब्राउज़र में Wasm के बिना Node.js लाइब्रेरी चलाना, typescript-virtual-container के polyfill

मैंने हाल ही में [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container), [Fortune (Chloé Rolzhausen)](https://itsrealfortune.fr) का प्रोजेक्ट, का स्रोत कोड खँगालने में काफी समय बिताया। और जिस हिस्से ने मुझे सबसे ज्यादा चौंकाया, वह `polyfills/` फोल्डर है, VFS, आभासी नेटवर्क या TypeScript में फिर से लागू 170 Unix कमांड से भी ज्यादा।

क्योंकि मॉड्यूल ब्राउज़र में चलता है, बिना Wasm, और इसके लिए, Fortune ने हाथ से पूरी `node:*` परत फिर से लागू की जिसकी लाइब्रेरी को जरूरत है। लगभग 640 हस्तशिल्प JavaScript पंक्तियाँ जो `node:fs`, `node:crypto`, `node:os`, `node:net`, और कुछ अन्य बदलती हैं।

यह लेख समझाता है कि यह कैसे काम करता है, polyfill दर polyfill।

---

## बुनियादी समस्या

Node.js लाइब्रेरी API इस्तेमाल करती है जो ब्राउज़र में मौजूद नहीं हैं। जब तुम `import { readFileSync } from 'node:fs'` लिखते हो, तो यह Node तरफ तंत्र कॉल है, libuv से असली डिस्क पहुँच। ब्राउज़र में, `node:fs` बिल्कुल मौजूद नहीं है।

सामान्य समाधान हैं :

- **Wasm runtime** (Emscripten, WASIp1/WASIp2 तरह) , तुम Node.js को Wasm में संकलित करते हो और उसे निष्पादित करते हो। परिणाम : 10-50 MB bundle, उल्लेखनीय लोड समय, महत्वपूर्ण परिनियोजन जटिलता।
- **सामान्य polyfill** (`browserify`, `webpack node: polyfill` तरह) , npm लाइब्रेरी जो हर Node मॉड्यूल के अनुमान देती हैं। अक्सर बहुत भारी, विशिष्ट मामले के लिए खराब अनुकूल।
- **polyfill हाथ से फिर से लिखना** , ज्यादा काम, लेकिन इष्टतम परिणाम।

Fortune ने तीसरा विकल्प चुना। और परिणाम यह है कि ब्राउज़र bundle बस लाइब्रेरी है, जो तुरंत शुरू होता है, और किसी बाहरी बुनियादी ढाँचे पर निर्भर नहीं करता।

---

## build यांत्रिकी

सब esbuild और उसके `alias` विकल्प पर टिका है। हर `node:*` आयात स्थानीय फाइल की ओर redirect किया जाता है :

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

`inject` विकल्प ध्यान योग्य है : यह bundle की हर फाइल के सिर में `process.js` और `buffer.js` डालने देता है, जो बिना किसी स्पष्ट आयात `process` और `Buffer` वैश्विक उपलब्ध बनाता है। बिल्कुल जैसे Node.js उन्हें स्वाभाविक उजागर करता है।

---

## `buffer.js` , `Uint8Array` पर `Buffer`

यह दो डाले गए global में से एक है। `Buffer` कोड में बड़े पैमाने इस्तेमाल होता है, हर SSH ऑपरेशन, हर VFS snapshot, हर बाइनरी पढ़ना/लिखना इससे गुजरता है।

समाधान : `BrowserBuffer` क्लास जो `Uint8Array` बढ़ाती है और Node.js की पूरी `Buffer` API लागू करती है।

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

कुल क्या लागू है :
- `Buffer.from`, `Buffer.alloc`, `Buffer.allocUnsafe`, `Buffer.isBuffer`, `Buffer.concat`, `Buffer.byteLength`
- सभी लिखने विधियाँ : `writeUInt8/16/32BE/LE`, `writeInt8/16/32BE/LE`, `writeBigUInt64BE/LE`, `writeFloat/DoubleLE/BE`
- सभी संबंधित पढ़ने विधियाँ
- hex, base64, utf8 समर्थन के साथ `toString`
- `copy`, `equals`, `slice`, `subarray`

यह 116 पंक्तियाँ दर्शाता है। जो यह बदलता है उसके लिए, यह उल्लेखनीय संक्षिप्त है।

मुख्य चाल multi-octet पहुँच के लिए `DataView` इस्तेमाल है, जो हर प्रकार के लिए हाथ से बिट हेरफेर किए बिना endianness सही संभालता है :

```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```

---

## `process.js` , न्यूनतम global `process`

दूसरा डाला गया global। छोटा लेकिन जरूरी, कोड अक्सर `process.env.NODE_ENV`, `process.platform`, `process.nextTick`, आदि परखता है।

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

`nextTick` → `queueMicrotask` mapping यहाँ सबसे महत्वपूर्ण विवरण है। Node.js में `process.nextTick` घटना लूप के वर्तमान चरण अंत में, I/O से पहले callback schedule करता है। ब्राउज़र में `queueMicrotask` बहुत करीबी अर्थ देता है : वह microtask schedule करता है, जो अगले रेंडर या घटना से पहले निष्पादित होता है, और यह निकटता काफी है कि `nextTick` इस्तेमाल करने वाला सारा कोड browser में सही काम करे।

---

## `node:fs` , तुल्यकालिक filesystem के रूप में IndexedDB

यह सबसे परिष्कृत polyfill है, और तकनीकी रूप से सबसे दिलचस्प।

समस्या नाजुक है : `node:fs` तुल्यकालिक API उजागर करता है (`readFileSync`, `writeFileSync`, आदि), लेकिन browser भंडारण API सभी अतुल्यकालिक हैं (IndexedDB, Cache API, आदि)। हम तुल्यकालिक फंक्शन बीच में `await` नहीं कर सकते।

Fortune समाधान : दोहरी cache परत।

**परत 1 , स्मृति Map (तुल्यकालिक)**
सभी पढ़ना स्मृति में `Map<string, Uint8Array>` से होता है। तुरंत, तुल्यकालिक, कोई API समस्या नहीं।

**परत 2 , IndexedDB (अतुल्यकालिक, पृष्ठभूमि में)**
शुरू में, IndexedDB की पूरी सामग्री Map में लोड होती है। लिखना Map में तुरंत *और* बिना अवरुद्ध अतुल्यकालिक IndexedDB लिखना शुरू करता है।

```js
const DB_NAME = 'vfs-fs-shim';
const STORE = 'files';
let db = null;

// Sync cache (path → Uint8Array | null)
const memCache = new Map();

// शुरू में Preload
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

// IndexedDB की ओर Async लिखना (गैर अवरुद्ध)
function idbSet(path, value) {
  openDB().then(db => {
    const tx = db.transaction(STORE, 'readwrite');
    if (value === null) tx.objectStore(STORE).delete(path);
    else tx.objectStore(STORE).put(value, path);
  });
}
```

उजागर API पूर्ण है : `readFileSync`, `writeFileSync`, `appendFileSync`, `existsSync`, `unlinkSync`, `rmSync` (`recursive` विकल्प के साथ), `mkdirSync` (`recursive` विकल्प के साथ), `readdirSync`, `statSync`, `renameSync`।

file descriptor प्रबंधन परत भी है (`openSync`, `writeSync`, `closeSync`) ताकि VFS WAL journal browser मोड में काम करे, journal fd खोलता है, उसमें लिखता है, उसे बंद करता है, और डेटा IndexedDB में पहुँचता है।

`ready` गुण निर्यात किया गया है ताकि कोड जान सके कि प्रारंभिक preload कब खत्म हुआ :

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

इसी से ब्राउज़र में VFS snapshot पेज reload बचते हैं। जब तुम डेमो reload करते हो, तो VFS ठीक उस स्थिति में पुनर्स्थापित होता है जहाँ तुमने उसे छोड़ा था, IndexedDB से, बिना किसी serveur शामिल।

---

## `node:crypto` , शुद्ध JS में SHA-256, HMAC, PBKDF2

Wasm में संकलित crypto लाइब्रेरी आयात करने के बजाय, Fortune ने जरूरी primitive सीधे लागू किए।

**SHA-256** FIPS 180-4 स्थिरांक से scratch लागू किया गया है :

```js
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, /* ... 60 अन्य स्थिरांक */
]);

function sha256(data) {
  // FIPS 180-4 padding
  const msg = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
  // ...
  // संपीड़न के 64 round
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

SHA-256 के ऊपर, **HMAC-SHA256** और **PBKDF2-HMAC-SHA256** बनाए गए हैं। ये दो primitive SSH आदान प्रदान में कुंजी व्युत्पत्ति और आंतरिक प्रमाणीकरण के लिए इस्तेमाल होते हैं।

निर्यात API Node.js जैसी है :

```js
// क्लासिक Hash
const hash = createHash('sha256').update('data').digest('hex');

// बेतरतीब Byte (मानक Web Crypto API से)
const bytes = randomBytes(32);

// UUID
const id = randomUUID();

// timing-safe तुलना
const ok = timingSafeEqual(a, b);

// scrypt (PBKDF2 से अनुमानित)
const key = scryptSync(password, salt, 32, { N: 16384 });
```

नोट : `scryptSync` PBKDF2 से अनुमानित है जिसमें पुनरावृत्ति संख्या `N` पैरामीटर पर बाँधी गई है। यह अनुमान scrypt की विशिष्ट स्मृति योजना बदलता है और यह प्रोजेक्ट उपयोगों को कवर करता है।

फंक्शन जिन्हें browser में युक्तिसंगत अनुकरण नहीं किया जा सकता (`generateKeyPairSync`, `createCipheriv`, `createDecipheriv`, `createSign`) बुलाए जाने पर स्पष्ट त्रुटि फेंकते हैं। ईमानदार व्यवहार।

---

## `node:os` , ब्राउज़र की असली spec पढ़ना

स्थिर मान लौटाने के बजाय, यह polyfill उपयोगकर्ता की असली मशीन से मेल खाने वाली जानकारी लौटाने के लिए ब्राउज़र API पढ़ता है।

```js
export function totalmem() {
  try {
    return navigator?.deviceMemory
      ? navigator.deviceMemory * 1024 * 1024 * 1024
      : 2 * 1024 * 1024 * 1024; // डिफ़ॉल्ट 2 GB
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

ठोस परिणाम : जब तुम ब्राउज़र डेमो में `neofetch` चलाते हो, तो दिखाए core संख्या और RAM तुम्हारी मशीन से मेल खाते हैं। यह विवरण है, लेकिन यह terminal विश्वसनीयता में बहुत योगदान देता है।

अन्य निर्यात : `freemem` (कुल स्मृति का 40%, उचित अनुमान), `platform` → `'browser'`, `type` → `'Linux'`, `release` → `'web'`, `performance.now()` से `uptime`, `endianness` → `'LE'` (little-endian, सभी सार्वजनिक x86/ARM processor पर सच), `loadavg` → `[0, 0, 0]`।

---

## `node:net` , साफ TCP stub

ब्राउज़र के पास कच्चे TCP socket पहुँच नहीं है (WebSocket गिना नहीं जाता, यह अलग applicative प्रोटोकॉल है)। इसलिए `node:net` stub है, लेकिन *अच्छी तरह लिखा* stub।

```js
export class Socket {
  connect() { notImpl('Socket.connect')(); }
  on() { return this; }    // शृंखलाबद्ध करने योग्य
  once() { return this; }  // शृंखलाबद्ध करने योग्य
  pipe() { return this; }  // शृंखलाबद्ध करने योग्य
  setEncoding() { return this; }
  remoteAddress = '127.0.0.1';
  remotePort = 0;
  // ...
}
```

महत्वपूर्ण बिंदु : घटना पंजीकरण विधियाँ (`on`, `once`, `off`, `emit`) `this` लौटाती हैं और त्रुटि नहीं फेंकतीं। यह `new net.Socket().on('connect', cb)` करने वाले कोड को बिना crash काम करने देता है, भले ही कनेक्शन कभी न हो। सिर्फ वे विधियाँ जो *सच में जुड़ने की कोशिश* करती हैं त्रुटि फेंकती हैं।

`isIP`, `isIPv4`, `isIPv6` सही लागू हैं (असली मान्यता तर्क के साथ) क्योंकि वे आभासी नेटवर्क कोड से पते मान्य करने के लिए इस्तेमाल होते हैं, बिना कभी socket खोले।

---

## `node:path` , POSIX path operation

POSIX पथ operation का पूरा पुनर्कार्यान्वयन, संदर्भ अनुकूल (हमेशा `/` वाले पूर्ण पथ, सिर्फ Unix शैली)।

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

सरल, संक्षिप्त, प्रोजेक्ट उपयोगों के लिए सही।

---

## `node:url` , ब्राउज़र API को सौंपना

यह अपनी सरलता से सुरुचिपूर्ण है। `URL` और `URLSearchParams` API ब्राउज़र में पहले से स्वाभाविक मौजूद हैं, बस उन्हें फिर से निर्यात करना है।

```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```

सिर्फ `fileURLToPath` और `pathToFileURL` को कार्यान्वयन चाहिए, क्योंकि वे Node विशिष्ट हैं :

```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```

यह आदर्श दृष्टिकोण है जब लक्ष्य मंच (ब्राउज़र) पहले से स्वाभाविक समतुल्य देता है।

---

## `node:zlib` , पहचान

```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```

दो पंक्तियाँ। लाइब्रेरी असली संपीड़न के लिए `fflate` इस्तेमाल करती है (जो browser में स्वाभाविक काम करता है)। `node:zlib` सिर्फ कोड रास्तों में आयात किया जाता है जो browser संदर्भ में निष्पादित नहीं होते, इसलिए passthrough काफी है।

कभी कभी सही कार्यान्वयन दो पंक्तियाँ होती हैं।

---

## `node:events` , न्यूनतम EventEmitter

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

Node.js का पूरा `EventEmitter` कार्यान्वयन `maxListeners`, `once`, `prependListener`, आदि प्रबंधन के साथ ~600 पंक्तियाँ करता है। यहाँ सच में इस्तेमाल 4 विधियों के लिए यह 12 पंक्तियाँ है। build उपकरण के tree-shaking से पहले ही मानसिक tree-shaking।

---

## `ssh2` और `roxify` , स्पष्ट stub

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

SSH serveur ब्राउज़र में नहीं चलता (इसका कोई अर्थ नहीं होगा, कौन जुड़ेगा ?)। लेकिन *client तरफ SSH की बात* करने वाला कोड, SSH पैकेट बनाने वाली क्लासें, प्रोटोकॉल parser, लाइब्रेरी में मौजूद है। ये stub इस सारे कोड को बिना त्रुटि bundle होने देते हैं, साथ ही गारंटी देते हैं कि अगर कोई असली socket चाहने वाली विधि बुलाने की कोशिश करता है तो स्पष्ट त्रुटि फेंकी जाती है।

`roxify` Node मोड में VFS snapshot के लिए इस्तेमाल मालिकाना संपीड़न प्रारूप है। ब्राउज़र में, उसकी जगह `fflate` इस्तेमाल होता है, polyfill सिर्फ त्रुटि फेंकने से संतोष करता है अगर `roxify` सीधे बुलाया जाता है।

---

## `node:worker_threads` , Web Worker फिर से निर्यात

यह सबसे सूक्ष्म है। Node.js में `node:worker_threads` और ब्राउज़र के Web Worker दो अलग API हैं, लेकिन वे अवधारणात्मक करीब हैं। polyfill mapping करता है :

```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```

`MessageChannel` और `MessagePort` सीधे browser से फिर से निर्यात किए जाते हैं (वही API)। `Worker` को खुद wrapper चाहिए क्योंकि constructor अलग है (Node मॉड्यूल पथ अपेक्षा करता है, browser URL अपेक्षा करता है)। इस संदर्भ में ब्राउज़र तरफ `isMainThread` हमेशा `true` है।

---

## अवलोकन : ये 640 पंक्तियाँ क्या दर्शाती हैं

| Polyfill | पंक्तियाँ | रणनीति |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array` + `DataView`, पूरी `Buffer` API |
| `node:crypto` | 166 | scratch से SHA-256/HMAC/PBKDF2 + random के लिए Web Crypto |
| `node:fs` | 210 | स्मृति में `Map` + async IndexedDB |
| `node:net` | 70 | शृंखलाबद्ध stub + असली IP मान्यताएँ |
| `ssh2` | 74 | स्पष्ट stub |
| `process.js` | 14 | न्यूनतम व्यवहार्य `process` |
| `node:path` | ~30 | POSIX path op |
| `node:url` | ~25 | browser API को सौंपना |
| `node:events` | ~12 | 4 विधियों वाला EventEmitter |
| `node:os` | ~25 | `navigator.deviceMemory` / `hardwareConcurrency` |
| `node:zlib` | 4 | Passthrough |
| `node:worker_threads` | ~30 | Web Worker फिर से निर्यात |
| `roxify.js` | 8 | Stub |

640 पंक्तियाँ। कोई npm निर्भरता नहीं। कोई Wasm नहीं। और यह ब्राउज़र bundle देता है जो एक सेकंड से कम में शुरू होता है और बिना किसी serveur बुनियादी ढाँचे चलता है।

---

## इससे क्या लिया जा सकता है

अगली बार जब तुम ब्राउज़र में Node.js लाइब्रेरी लाना चाहो, तो Fortune दृष्टिकोण यह दर्शाता है :

1. **पहचानो कि सच में क्या इस्तेमाल होता है।** सिर्फ कोड बुलाने वाली विधियाँ लागू करो : यहाँ `EventEmitter` के लिए `on`, `emit` और `removeListener` काफी हैं।

2. **संभव होने पर ब्राउज़र API को सौंपो।** `URL`, `URLSearchParams`, `MessageChannel`, `MessagePort`, `crypto.getRandomValues`, ब्राउज़र के पास पहले से हैं, उतना इस्तेमाल करो।

3. **async API के सामने तुल्यकालिक cache।** `node:fs` के लिए `Map` + IndexedDB समाधान पूरे फोल्डर का सबसे पुनः प्रयोज्य pattern है।

4. **ईमानदार stub मौन अपूर्ण कार्यान्वयन से बेहतर हैं।** स्पष्ट `throw new Error('not implemented in browser')` अनंत ज्यादा उपयोगी है बजाय `return undefined` जो bug को 10 कॉल बाद प्रकट होने देता है।

5. **esbuild `alias` + `inject` कम आँका गया है।** यह इस तरह के portage के लिए सही उपकरण है, शून्य webpack कॉन्फ़िगरेशन, शून्य plugin, सिर्फ प्रतिस्थापन सूची।

---

कोड repo में है : [github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills)। हर फाइल एक ही पेज में समाती है, सीधे GitHub पर पठनीय है। अगर तुम समान प्रोजेक्ट पर काम करते हो तो दृढ़ अनुशंसित।
