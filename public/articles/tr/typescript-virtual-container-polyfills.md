# Bir Node.js kütüphanesini Wasm olmadan tarayıcıda çalıştırmak -- typescript-virtual-container polyfill'leri

Geçenlerde [Fortune (Chloé Rolzhausen)](https://itsrealfortune.fr)'un projesi olan [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)'ın kaynak kodunu incelemeye epey zaman harcadım. Ve beni en çok şaşırtan kısım VFS değil, sanal ağ değil, TypeScript'te yeniden uygulanmış 170 Unix komutu değil. `polyfills/` klasörüydü.

Çünkü modül tarayıcıda, Wasm olmadan çalışıyor ve bunun için Fortune, kütüphanenin ihtiyaç duyduğu tüm `node:*` katmanını elle yeniden uygulamış. Yaklaşık 640 satır el yapımı JavaScript ile `node:fs`, `node:crypto`, `node:os`, `node:net` ve diğerlerini değiştiriyor.

Bu makale, polyfill polyfill nasıl çalıştığını açıklıyor.

---

## Temel Problem

Bir Node.js kütüphanesi, tarayıcıda var olmayan API'ler kullanır. `import { readFileSync } from 'node:fs'` yazdığında, bu Node tarafında bir sistem çağrısıdır -- libuv üzerinden gerçek bir disk erişimi. Tarayıcıda `node:fs` diye bir şey yoktur.

Olağan çözümler şunlardır:

- **Bir Wasm Runtime** (Emscripten, WASIp1/WASIp2 gibi) -- Node.js'i Wasm'a derler ve çalıştırırsın. Sonuç: 10-50 MB'lık bundle'lar, belirgin bir yüklenme süresi, önemli bir dağıtım karmaşıklığı.
- **Genel Polyfill'ler** (`browserify`, `webpack node: polyfills` gibi) -- her Node modülünün yaklaşımlarını sağlayan npm kütüphaneleri. Genelde çok ağır, özel kullanım durumuna uygun değil.
- **Polyfill'leri elle yazmak** -- daha çok iş, ama optimal sonuç.

Fortune üçüncü seçeneği tercih etti. Ve sonuç, sadece kütüphanenin kendisi olan, anında başlayan ve hiçbir dış altyapıya bağımlı olmayan bir tarayıcı bundle'ı.

---

## Build Mekaniği

Her şey esbuild ve onun `alias` seçeneğine dayanıyor. Her `node:*` import'u yerel bir dosyaya yönlendiriliyor:

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

`inject` seçeneği dikkate değer: `process.js` ve `buffer.js` dosyalarını bundle'daki her dosyanın başına enjekte etmeyi sağlar, böylece `process` ve `Buffer` hiçbir açık import gerektirmeden global olarak kullanılabilir olur. Tıpkı Node.js'in onları yerel olarak sunması gibi.

---

## `buffer.js` -- `Uint8Array` üzerinde `Buffer`

Bu, enjekte edilen iki globalden biri. `Buffer`, kodda yoğun olarak kullanılıyor -- her SSH işlemi, her VFS anlık görüntüsü, her ikili okuma/yazma işlemi onun üzerinden geçiyor.

Çözüm: `Uint8Array`'i genişleten ve Node.js'in tüm `Buffer` API'sini uygulayan bir `BrowserBuffer` sınıfı.

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

Toplamda uygulananlar:
- `Buffer.from`, `Buffer.alloc`, `Buffer.allocUnsafe`, `Buffer.isBuffer`, `Buffer.concat`, `Buffer.byteLength`
- Tüm yazma metodları: `writeUInt8/16/32BE/LE`, `writeInt8/16/32BE/LE`, `writeBigUInt64BE/LE`, `writeFloat/DoubleLE/BE`
- Tüm karşılık gelen okuma metodları
- hex, base64, utf8 desteğiyle `toString`
- `copy`, `equals`, `slice`, `subarray`

Bu 116 satır ediyor. Değiştirdiği şeye bakarsak, oldukça kompakt.

Ana numara, çok baytlı erişimler için `DataView` kullanımı; bu, her tür için bitleri elle manipüle etmek zorunda kalmadan endianness'i doğru şekilde yönetiyor:

```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```

---

## `process.js` -- minimal `process` global'ı

Diğer enjekte edilen global. Küçük ama gerekli -- kod sık sık `process.env.NODE_ENV`, `process.platform`, `process.nextTick` vb. kontrol ediyor.

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

`nextTick` → `queueMicrotask` eşlemesi buradaki en önemli detay. Node.js'te `process.nextTick`, olay döngüsünün mevcut aşamasının sonunda, I/O'dan önce bir callback planlar. Tarayıcıda `queueMicrotask` anlamsal olarak çok benzer bir şey yapar -- bir sonraki render veya olaydan önce yürütülen bir mikro görev planlar. Aynı değil, ancak `nextTick` kullanan tüm kodun tarayıcıda doğru çalışması için yeterince yakın.

---

## `node:fs` -- Senkron dosya sistemi olarak IndexedDB

Bu, en karmaşık polyfill ve teknik olarak açık ara en ilginç olanı.

Problem zorlu: `node:fs` senkron bir API sunar (`readFileSync`, `writeFileSync` vb.), ancak tarayıcı depolama API'lerinin tümü asenkrondur (IndexedDB, Cache API vb.). Senkron bir fonksiyonun ortasında `await` yapamazsın.

Fortune'un çözümü: iki seviyeli bir önbellek.

**Seviye 1 -- Bellek içi Map (senkron)**  
Tüm okumalar, bellekteki bir `Map<string, Uint8Array>` üzerinden yapılır. Anlık, senkron, API sorunu yok.

**Seviye 2 -- IndexedDB (asenkron, arka planda)**  
Başlangıçta, IndexedDB'nin tüm içeriği Map'e yüklenir. Yazmalar hemen Map'e yapılır *ve* bloke etmeden IndexedDB'ye asenkron bir yazma başlatır.

```js
const DB_NAME = 'vfs-fs-shim';
const STORE = 'files';
let db = null;

// Sync cache (path → Uint8Array | null)
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

// IndexedDB'ye async yazma (bloke etmeyen)
function idbSet(path, value) {
  openDB().then(db => {
    const tx = db.transaction(STORE, 'readwrite');
    if (value === null) tx.objectStore(STORE).delete(path);
    else tx.objectStore(STORE).put(value, path);
  });
}
```

Dışa aktarılan API eksiksiz: `readFileSync`, `writeFileSync`, `appendFileSync`, `existsSync`, `unlinkSync`, `rmSync` (`recursive` seçeneğiyle), `mkdirSync` (`recursive` seçeneğiyle), `readdirSync`, `statSync`, `renameSync`.

Hatta VFS'in WAL günlüğünün tarayıcı modunda çalışması için bir dosya tanımlayıcı yönetim katmanı bile var (`openSync`, `writeSync`, `closeSync`) -- günlük bir fd açar, içine yazar, kapatır ve veriler IndexedDB'ye gider.

`ready` özelliği, kodun ilk ön yüklemenin ne zaman tamamlandığını bilmesini sağlamak için dışa aktarılır:

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

Bu sayede VFS anlık görüntüleri tarayıcıda sayfa yenilemelerine dayanır. Demoyu yeniden yüklediğinde, VFS IndexedDB'den, hiçbir sunucu olmadan, tam olarak bıraktığın durumda geri yüklenir.

---

## `node:crypto` -- Saf JS ile SHA-256, HMAC, PBKDF2

Wasm'da derlenmiş bir kripto kütüphanesi ithal etmek yerine, Fortune gerekli primitifleri doğrudan uygulamış.

**SHA-256**, FIPS 180-4 sabitleriyle sıfırdan uygulanmış:

```js
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, /* ... 60 diğer sabit */ 
]);

function sha256(data) {
  // FIPS 180-4 padding
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

SHA-256 üzerine **HMAC-SHA256** ve **PBKDF2-HMAC-SHA256** inşa edilmiş. Bu iki primitif, SSH el sıkışmalarında ve iç kimlik doğrulamada anahtar türetme için kullanılıyor.

Dışa aktarılan API Node.js'inkine benziyor:

```js
// Klasik Hash
const hash = createHash('sha256').update('data').digest('hex');

// Rastgele baytlar (standart Web Crypto API ile)
const bytes = randomBytes(32);

// UUID
const id = randomUUID();

// Timing-güvenli karşılaştırma
const ok = timingSafeEqual(a, b);

// scrypt (PBKDF2 ile yaklaşık)
const key = scryptSync(password, salt, 32, { N: 16384 });
```

Not: `scryptSync`, `N` parametresine göre ayarlanmış bir iterasyon sayısıyla PBKDF2 üzerinden yaklaşık olarak hesaplanır. Gerçek scrypt değildir (farklı bir bellek şeması kullanır), ancak projenin kullanımları için yeterlidir.

Tarayıcıda makul bir şekilde öykünemeyen fonksiyonlar (`generateKeyPairSync`, `createCipheriv`, `createDecipheriv`, `createSign`), çağrıldıklarında açık bir hata fırlatır. Dürüst davranış.

---

## `node:os` -- tarayıcının gerçek özelliklerini okumak

Sabit değerler döndürmek yerine, bu polyfill tarayıcı API'lerini okuyarak kullanıcının gerçek makinesine karşılık gelen bilgileri döndürür.

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

Somut sonuç: Tarayıcı demosunda `neofetch` çalıştırdığında, görüntülenen çekirdek sayısı ve RAM, gerçek makinenle eşleşir. Bu bir detay, ancak terminalin inandırıcılığına büyük katkı sağlar.

Diğer dışa aktarımlar: `freemem` (toplam belleğin %40'ı, makul bir yaklaşım), `platform` → `'browser'`, `type` → `'Linux'`, `release` → `'web'`, `uptime` `performance.now()` ile, `endianness` → `'LE'` (tüm yaygın x86/ARM işlemcilerde geçerli olan little-endian), `loadavg` → `[0, 0, 0]`.

---

## `node:net` -- temiz TCP stub'ları

Tarayıcının ham TCP soketlerine erişimi yoktur (WebSocket sayılmaz -- bu farklı bir uygulama katmanı protokolüdür). Bu nedenle `node:net` bir stub, ama *iyi yazılmış* bir stub.

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

Önemli nokta: olay kayıt metodları (`on`, `once`, `off`, `emit`) `this` döndürür ve hata fırlatmaz. Bu, `new net.Socket().on('connect', cb)` yapan kodun, bağlantı hiç gerçekleşmese bile çökmeden çalışmasını sağlar. Sadece *gerçekten bağlantı kurmayı deneyen* metodlar hata fırlatır.

`isIP`, `isIPv4`, `isIPv6` doğru şekilde uygulanmıştır (stub değil), çünkü sanal ağ kodu tarafından hiçbir zaman soket açmadan adresleri doğrulamak için kullanılırlar.

---

## `node:path` -- POSIX yol işlemleri

POSIX yol işlemlerinin, bağlama uyarlanmış (Windows ters eğik çizgisi yok, yollar her zaman `/` ile mutlak) tamamen yeniden uygulanması.

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

## `node:url` -- tarayıcı API'lerine delegasyon

Bu, basitliğiyle zarif. `URL` ve `URLSearchParams` API'si tarayıcıda zaten yerel olarak var -- sadece yeniden dışa aktarmak yeterli.

```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```

Sadece `fileURLToPath` ve `pathToFileURL` bir uygulama gerektirir, çünkü bunlar Node'a özgüdür:

```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```

Hedef platform (tarayıcı) zaten yerel eşdeğerini sağladığında ideal yaklaşım budur.

---

## `node:zlib` -- kimlik

```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```

İki satır. Kütüphane gerçek sıkıştırma için `fflate` kullanır (tarayıcıda yerel olarak çalışır). `node:zlib` yalnızca tarayıcı bağlamında yürütülmeyen kod yollarında içe aktarılır -- bu nedenle bir passthrough yeterlidir.

Bazen doğru uygulama iki satırdır.

---

## `node:events` -- Minimal EventEmitter

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

Node.js'in tam `EventEmitter` uygulaması, `maxListeners`, `once`, `prependListener` vb. yönetimiyle ~600 satırdır. Burada gerçekten kullanılan 4 metot için 12 satır. Build aracının tree-shaking'inden önce zihinsel tree-shaking.

---

## `ssh2` ve `roxify` -- açık stub'lar

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

SSH sunucusu tarayıcıda çalışmaz (bunun bir anlamı olmazdı -- kim bağlanacak ki?). Ancak *istemci tarafında SSH hakkında konuşan* kod -- SSH paketleri oluşturan sınıflar, protokol ayrıştırıcıları -- kütüphanede mevcuttur. Bu stub'lar, tüm bu kodun hatasız bir şekilde bundle edilmesine izin verirken, birisi gerçek bir soket gerektiren bir metodu çağırmaya kalkışırsa net bir hata fırlatılmasını garanti eder.

`roxify`, Node modunda VFS anlık görüntüleri için kullanılan özel bir sıkıştırma biçimidir. Tarayıcıda bunun yerine `fflate` kullanılır -- polyfill, `roxify` doğrudan çağrılırsa sadece bir hata fırlatır.

---

## `node:worker_threads` -- Web Workers'ları yeniden dışa aktarma

Bu en ince olanı. Node.js'teki `node:worker_threads` ve tarayıcıdaki Web Workers iki farklı API'dir, ancak kavramsal olarak birbirlerine yakındır. Polyfill eşlemeyi yapar:

```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```

`MessageChannel` ve `MessagePort` doğrudan tarayıcıdan yeniden dışa aktarılır (aynı API). `Worker`'ın kendisi bir wrapper gerektirir çünkü yapıcı farklıdır (Node bir modül yolu bekler, tarayıcı bir URL bekler). `isMainThread` bu bağlamda tarayıcı tarafında her zaman `true`'dur.

---

## Genel Bakış: Bu 640 satır neyi temsil ediyor

| Polyfill | Satır | Strateji |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array` + `DataView`, tüm `Buffer` API'si |
| `node:crypto` | 166 | SHA-256/HMAC/PBKDF2 sıfırdan + Rastgeleler için Web Crypto |
| `node:fs` | 210 | Bellekte `Map` + IndexedDB async |
| `node:net` | 70 | Zincirlenebilir Stub'lar + gerçek IP doğrulamaları |
| `ssh2` | 74 | Açık Stub'lar |
| `process.js` | 14 | Minimal viable `process` |
| `node:path` | ~30 | POSIX yol işlemleri |
| `node:url` | ~25 | Tarayıcı API'lerine delegasyon |
| `node:events` | ~12 | EventEmitter 4 metot |
| `node:os` | ~25 | `navigator.deviceMemory` / `hardwareConcurrency` |
| `node:zlib` | 4 | Passthrough |
| `node:worker_threads` | ~30 | Web Workers'ları yeniden dışa aktarma |
| `roxify.js` | 8 | Stub'lar |

640 satır. Hiçbir npm bağımlılığı yok. Hiçbir Wasm yok. Ve bu, bir saniyeden kısa sürede başlayan ve hiçbir sunucu altyapısı gerektirmeyen bir tarayıcı bundle'ı üretiyor.

---

## Bundan çıkarılacak dersler

Bir dahaki sefere bir Node.js kütüphanesini tarayıcıya taşımak istediğinde, Fortune'un yaklaşımı şunları gösteriyor:

1. **Gerçekten neyin kullanıldığını belirle.** Kod sadece `on`, `emit` ve `removeListener` kullanıyorsa tüm `EventEmitter`'ı uygulamaya gerek yok.

2. **Mümkün olduğunda tarayıcı API'lerine devret.** `URL`, `URLSearchParams`, `MessageChannel`, `MessagePort`, `crypto.getRandomValues` -- tarayıcıda zaten var, kullan onları.

3. **Async API'nin önünde senkron önbellek.** `node:fs` için `Map` + IndexedDB çözümü, tüm klasördeki en yeniden kullanılabilir desen.

4. **Dürüst stub'lar, sessiz eksik uygulamalardan iyidir.** Açık bir `throw new Error('not implemented in browser')`, hatanın 10 çağrı sonra ortaya çıkmasına izin veren bir `return undefined`'dan sonsuz derecede daha kullanışlıdır.

5. **esbuild `alias` + `inject` hafife alınıyor.** Bu tür bir taşıma için mükemmel araç -- sıfır webpack yapılandırması, sıfır eklenti, sadece bir değiştirme listesi.

---

Kod repo'da: [github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills). Her dosya tek bir sayfaya sığıyor, doğrudan GitHub'da okunabilir. Benzer bir proje üzerinde çalışıyorsan şiddetle tavsiye edilir.
