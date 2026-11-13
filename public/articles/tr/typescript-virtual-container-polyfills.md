---
title: Wasm olmadan Node.js kütüphanesini tarayıcıda çalıştırmak,
  typescript-virtual-container polyfilleri
description: Fortune node:fs, node:crypto ve bir düzine Node modülünü konteynerin
  tarayıcıda Wasmsız dönmesi için 640 satır el yapımı JavaScriptle nasıl yeniden
  uyguladı.
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
author_sig: "DCIW+4un21nBSe5eTR92ilYG02ut1D3eEoABLSd7FFOIquVF4vN1N0BM3A4Wg9rmTyJ2Hn3V8yb9GOK8PrpwtQ=="
---

# Wasm olmadan Node.js kütüphanesini tarayıcıda çalıştırmak: typescript-virtual-container polyfilleri

Yakın zamanda [Fortune (Chloé Rolzhausen)](https://itsrealfortune.fr) projesi [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) kaynak kodunu epey inceledim. Ve beni en çok şaşırtan kısım VFS, sanal ağ ya da TypeScript ile yeniden uygulanmış 170 Unix komutundan bile çok `polyfills/` klasörüydü.

Çünkü modül tarayıcıda döner, Wasmsız ve bunun için Fortune kütüphanenin ihtiyaç duyduğu tüm `node:*` katmanını elle yeniden uygulamış. `node:fs`, `node:crypto`, `node:os`, `node:net` ve birkaç diğerinin yerini alan yaklaşık 640 satır el yapımı JavaScript.

Bu makale polyfill polyfill nasıl çalıştığını açıklar.

---

## Temel sorun

Bir Node.js kütüphanesi tarayıcıda var olmayan APIler kullanır. `import { readFileSync } from 'node:fs'` yazdığında bu Node tarafında bir sistem çağrısıdır: libuv üzerinden gerçek disk erişimi. Tarayıcıda `node:fs` hiç yoktur.

Alışılmış çözümler:

- **Wasm çalışma ortamı** (Emscripten türü, WASIp1/WASIp2): Node.jsi Wasme derleyip çalıştırırsın. Sonuç: 10-50 MB paketler, belirgin yükleme süresi, anlamlı dağıtım karmaşıklığı.
- **Genel polyfiller** (`browserify`, `webpack node: polyfills` türü): her Node modülünün yaklaşımlarını sağlayan npm kütüphaneleri. Genelde fazla ağır, özel duruma kötü uyarlanmış.
- **Polyfilleri elle yeniden yazmak**: daha fazla iş ama en iyi sonuç.

Fortune üçüncü seçeneği seçti. Ve sonuç yalnızca kütüphane olan bir tarayıcı paketi, anında başlar ve hiçbir dış altyapıya bağlı değildir.

---

## Derleme mekaniği

Her şey esbuild ve `alias` seçeneğine dayanır. Her `node:*` içe aktarma yerel bir dosyaya yönlendirilir:

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

`inject` seçeneği not edilmeyi hak eder: paketin her dosyasının başına `process.js` ve `buffer.js` enjekte etmeye izin verir, bu da `process` ve `Buffer`ı açık içe aktarma olmadan global kullanılabilir yapar. Tıpkı Node.jsin onları yerel sunması gibi.

---

## `buffer.js`: `Uint8Array` üstünde `Buffer`

Enjekte edilen iki globalden biri. `Buffer` kodda yoğun kullanılır: her SSH işlemi, her VFS anlık görüntüsü, her ikili okuma/yazma oradan geçer.

Çözüm: `Uint8Array` genişleten ve Node.js `Buffer` API tamamını uygulayan bir `BrowserBuffer` sınıfı.

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

Toplam uygulanan şey:
- `Buffer.from`, `Buffer.alloc`, `Buffer.allocUnsafe`, `Buffer.isBuffer`, `Buffer.concat`, `Buffer.byteLength`
- Tüm yazma yöntemleri: `writeUInt8/16/32BE/LE`, `writeInt8/16/32BE/LE`, `writeBigUInt64BE/LE`, `writeFloat/DoubleLE/BE`
- Karşılık gelen tüm okuma yöntemleri
- hex, base64, utf8 destekli `toString`
- `copy`, `equals`, `slice`, `subarray`

Bu 116 satır eder. Değiştirdiği şey için kayda değer kompakt.

Ana numara çok baytlı erişimler için `DataView` kullanımıdır, bu her tür için biti elle manipüle etmeden endiannessı doğru yönetir:

```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```

---

## `process.js`: minimal global `process`

Enjekte edilen diğer global. Minicik ama gerekli: kod sık `process.env.NODE_ENV`, `process.platform`, `process.nextTick` vs. test eder.

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

Buradaki en önemli detay `nextTick` → `queueMicrotask` eşlemesidir. Node.js içinde `process.nextTick`, olay döngüsünün mevcut fazının sonunda, G/Çden önce bir geri çağrı zamanlar. Tarayıcıda `queueMicrotask` çok yakın bir semantik sunar: sonraki render ya da olaydan önce çalışan bir mikrogörev zamanlar ve bu yakınlık `nextTick` kullanan tüm kodun tarayıcıda doğru çalışmasına yeter.

---

## `node:fs`: senkron dosya sistemi olarak IndexedDB

Bu açık ara en sofistike polyfill ve teknik olarak en ilginç olanıdır.

Sorun inceliklidir: `node:fs` senkron bir API sunar (`readFileSync`, `writeFileSync` vs.) ama tarayıcı depolama APIlerinin hepsi asenkrondur (IndexedDB, Cache API vs.). Senkron bir fonksiyonun ortasında `await` yapılamaz.

Fortuneun çözümü: çift katmanlı önbellek.

**Katman 1: bellekte Map (senkron)**
Tüm okumalar bellekteki `Map<string, Uint8Array>` üzerinden yapılır. Anlık, senkron, API sorunu yok.

**Katman 2: IndexedDB (asenktron, arka planda)**
Başlangıçta IndexedDBnin tüm içeriği Mape yüklenir. Yazmalar hemen Mape yapılır *ve* bloklamadan IndexedDBye asenkron yazma başlatır.

```js
const DB_NAME = 'vfs-fs-shim';
const STORE = 'files';
let db = null;

// Senkron önbellek (path → Uint8Array | null)
const memCache = new Map();

// Başlangıçta ön yükleme
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

// IndexedDBye asenkron yazma (bloklamaz)
function idbSet(path, value) {
  openDB().then(db => {
    const tx = db.transaction(STORE, 'readwrite');
    if (value === null) tx.objectStore(STORE).delete(path);
    else tx.objectStore(STORE).put(value, path);
  });
}
```

Sunulan API eksiksizdir: `readFileSync`, `writeFileSync`, `appendFileSync`, `existsSync`, `unlinkSync`, `rmSync` (`recursive` seçeneğiyle), `mkdirSync` (`recursive` seçeneğiyle), `readdirSync`, `statSync`, `renameSync`.

VFS WAL günlüğünün tarayıcı modunda çalışması için dosya tanımlayıcı yönetim katmanı bile vardır (`openSync`, `writeSync`, `closeSync`): günlük bir fd açar, içine yazar, kapatır ve veriler IndexedDBde bulunur.

Kodun başlangıç ön yüklemesinin bittiğini bilmesine izin vermek için `ready` özelliği dışa aktarılır:

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

VFS anlık görüntülerinin tarayıcıda sayfa yeniden yüklemelerine dayanması bunun sayesindedir. Demoyu yeniden yükleyince VFS hiç sunucu karışmadan IndexedDBden, bıraktığın halde aynen geri yüklenir.

---

## `node:crypto`: saf JSde SHA-256, HMAC, PBKDF2

Wasme derlenmiş kripto kütüphanesi içe aktarmak yerine Fortune gerekli ilkelleri doğrudan uygulamış.

**SHA-256** FIPS 180-4 sabitleriyle sıfırdan uygulanır:

```js
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, /* ... 60 diğer sabit */ 
]);

function sha256(data) {
  // FIPS 180-4 dolgusu
  const msg = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
  // ...
  // 64 sıkıştırma turu
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

SHA-256 üstüne **HMAC-SHA256** ve **PBKDF2-HMAC-SHA256** inşa edilir. Bu iki ilkel SSH değişimlerinde anahtar türetme ve dahili kimlik doğrulama için kullanılır.

Dışa aktarılan API Node.jsinkine benzer:

```js
// Klasik hash
const hash = createHash('sha256').update('data').digest('hex');

// Rastgele baytlar (standart Web Crypto API üzerinden)
const bytes = randomBytes(32);

// UUID
const id = randomUUID();

// Zamanlamaya güvenli karşılaştırma
const ok = timingSafeEqual(a, b);

// scrypt (PBKDF2 üzerinden yaklaştırılmış)
const key = scryptSync(password, salt, 32, { N: 16384 });
```

Not: `scryptSync`, parametre `N` üzerine ayarlı yineleme sayısıyla PBKDF2 üzerinden yaklaştırılır. Bu yaklaşım scrypte özel bellek şemasının yerini alır ve projenin kullanımlarını kapsar.

Tarayıcıda makul öykünülemeyecek fonksiyonlar (`generateKeyPairSync`, `createCipheriv`, `createDecipheriv`, `createSign`) çağrılırsa açık hata fırlatır. Dürüst davranış.

---

## `node:os`: tarayıcının gerçek özelliklerini okumak

Sabit değerler döndürmek yerine bu polyfill gerçek makineye karşılık gelen bilgileri döndürmek için tarayıcı APIlerini okur.

```js
export function totalmem() {
  try {
    return navigator?.deviceMemory
      ? navigator.deviceMemory * 1024 * 1024 * 1024
      : 2 * 1024 * 1024 * 1024; // varsayılan 2 GB
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

Somut sonuç: tarayıcı demoda `neofetch` çalıştırınca gösterilen çekirdek sayısı ve RAM makinene karşılık gelir. Detaydır ama terminalin gerçekliğine çok katkıda bulunur.

Diğer dışa aktarmalar: `freemem` (toplam belleğin %40ı, makul yaklaşım), `platform` → `'browser'`, `type` → `'Linux'`, `release` → `'web'`, `performance.now()` üzerinden `uptime`, `endianness` → `'LE'` (tüm genel x86/ARM işlemcilerde doğru little-endian), `loadavg` → `[0, 0, 0]`.

---

## `node:net`: temiz TCP saplamaları

Tarayıcı ham TCP soketlerine erişemez (WebSocket sayılmaz: farklı bir uygulama protokolüdür). `node:net` o yüzden bir saplama ama *iyi yazılmış* bir saplama.

```js
export class Socket {
  connect() { notImpl('Socket.connect')(); }
  on() { return this; }    // zincirlenebilir
  once() { return this; }  // zincirlenebilir
  pipe() { return this; }  // zincirlenebilir
  setEncoding() { return this; }
  remoteAddress = '127.0.0.1';
  remotePort = 0;
  // ...
}
```

Önemli nokta: olay kayıt yöntemleri (`on`, `once`, `off`, `emit`) `this` döndürür ve hata fırlatmaz. Bu `new net.Socket().on('connect', cb)` yapan kodun bağlantı hiç kurulmasa bile çökmeden çalışmasına izin verir. Yalnızca *gerçekten bağlanmaya çalışan* yöntemler hata fırlatır.

`isIP`, `isIPv4`, `isIPv6` doğru uygulanır (gerçek doğrulama mantığıyla) çünkü soket açmadan adresleri doğrulamak için sanal ağ kodunca kullanılır.

---

## `node:path`: POSIX yol işlemleri

Tam POSIX yol işlemlerinin yeniden uygulaması, bağlama uyarlanmış (hep `/` ile mutlak yollar, yalnızca Unix tarzı).

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

Basit, kompakt, projenin kullanımları için doğru.

---

## `node:url`: tarayıcı APIlerine yetki

Bu sadeliğiyle zariftir. `URL` ve `URLSearchParams` API tarayıcıda zaten yerel vardır: yeniden dışa aktarmak yeter.

```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```

Yalnızca `fileURLToPath` ve `pathToFileURL` uygulama gerektirir çünkü Nodea özgüdür:

```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```

Hedef platform (tarayıcı) zaten yerel eşdeğeri sağlıyorsa ideal yaklaşımdır.

---

## `node:zlib`: kimlik

```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```

İki satır. Kütüphane gerçek sıkıştırma için `fflate` kullanır (tarayıcıda yerel çalışır). `node:zlib` yalnızca tarayıcı bağlamında çalışmayan kod yollarında içe aktarılır: o yüzden geçiş yeterlidir.

Bazen doğru uygulama iki satırdır.

---

## `node:events`: minimal EventEmitter

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

Node.js `EventEmitter` tam uygulaması `maxListeners`, `once`, `prependListener` vs. yönetimiyle ~600 satır yapar. Burada gerçekten kullanılan 4 yöntem için 12 satırdır. Derleme aracının tree-shakinginden önce bile zihinsel tree-shaking.

---

## `ssh2` ve `roxify`: açık saplamalar

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

SSH sunucusu tarayıcıda dönmez (anlamı olmazdı: kim bağlanırdı?). Ama SSH *istemci tarafında konuşan* kod: SSH paketleri kuran sınıflar, protokol ayrıştırıcılar, kütüphanede vardır. Bu saplamalar tüm bu kodun hatasız paketlenmesine izin verirken gerçek soket gerektiren yöntemi çağırmaya kalkan olursa açık hata garanti eder.

`roxify`, Node modunda VFS anlık görüntüleri için kullanılan sahipli bir sıkıştırma formatıdır. Tarayıcıda yerine `fflate` kullanılır: polyfill `roxify` doğrudan çağrılırsa hata fırlatmakla yetinir.

---

## `node:worker_threads`: Web Workerların yeniden dışa aktarımı

En incesi budur. Node.js içinde `node:worker_threads` ile tarayıcının Web Workerları iki farklı APIdir ama kavramsal yakındırlar. Polyfill eşlemeyi yapar:

```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```

`MessageChannel` ve `MessagePort` tarayıcıdan doğrudan yeniden dışa aktarılır (aynı API). `Worker`ın kendisi sarmalayıcı gerektirir çünkü kurucu farklıdır (Node modül yolu bekler, tarayıcı URL bekler). Bu bağlamda tarayıcı tarafında `isMainThread` hep `true`dur.

---

## Genel bakış: bu 640 satır neyi temsil eder

| Polyfill | Satır | Strateji |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array` + `DataView`, tüm `Buffer` API |
| `node:crypto` | 166 | Sıfırdan SHA-256/HMAC/PBKDF2 + randomlar için Web Crypto |
| `node:fs` | 210 | Bellekte `Map` + asenkron IndexedDB |
| `node:net` | 70 | Zincirlenebilir saplamalar + gerçek IP doğrulamaları |
| `ssh2` | 74 | Açık saplamalar |
| `process.js` | 14 | Minimal yaşayabilir `process` |
| `node:path` | ~30 | POSIX yol işlemleri |
| `node:url` | ~25 | Tarayıcı APIlerine yetki |
| `node:events` | ~12 | 4 yöntemli EventEmitter |
| `node:os` | ~25 | `navigator.deviceMemory` / `hardwareConcurrency` |
| `node:zlib` | 4 | Geçiş |
| `node:worker_threads` | ~30 | Web Worker yeniden dışa aktarımı |
| `roxify.js` | 8 | Saplamalar |

640 satır. Sıfır npm bağımlılığı. Sıfır Wasm. Ve bir saniyeden kısa başlayan, hiç sunucu altyapısı olmadan dönen bir tarayıcı paketi verir.

---

## Buradan ne çıkarılabilir

Bir dahaki sefere Node.js kütüphanesini tarayıcıya taşımak isteyince Fortuneun yaklaşımının gösterdiği şey:

1. **Gerçekten kullanılanı belirle.** Yalnızca kodun çağırdığı yöntemleri uygula: burada `EventEmitter` için `on`, `emit` ve `removeListener` yeter.

2. **Mümkünse tarayıcı APIlerine yetki ver.** `URL`, `URLSearchParams`, `MessageChannel`, `MessagePort`, `crypto.getRandomValues`: tarayıcı zaten sahiptir, kullanmak gerekir.

3. **Asenkron API önünde senkron önbellek.** `node:fs` için `Map` + IndexedDB çözümü tüm klasörün en yeniden kullanılabilir desenidir.

4. **Dürüst saplamalar sessiz eksik uygulamalardan iyidir.** Açık `throw new Error('not implemented in browser')`, hatanın 10 çağrı sonra belirmesine bırakan `return undefined`den sonsuz faydalıdır.

5. **esbuild `alias` + `inject` az değer görür.** Bu tür taşıma için mükemmel araçtır: sıfır webpack yapılandırması, sıfır eklenti, sadece değiştirme listesi.

---

Kod depodadır: [github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills). Her dosya tek sayfaya sığar, doğrudan GitHubda okunabilir. Benzer bir projede çalışıyorsan şiddetle önerilir.
