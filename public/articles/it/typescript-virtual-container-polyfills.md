# Far funzionare una libreria Node.js nel browser senza Wasm -- i polyfill di typescript-virtual-container

Di recente ho passato parecchio tempo a spulciare il codice sorgente di [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container), il progetto di [Fortune (Chloé Rolzhausen)](https://itsrealfortune.fr). E la parte che mi ha sorpreso di più non è il VFS, non è la rete virtuale, non sono i 170 comandi Unix reimplementati in TypeScript. È la cartella `polyfills/`.

Perché il modulo gira nel browser, senza Wasm, e per farlo Fortune ha reimplementato a mano tutto il layer `node:*` di cui la libreria ha bisogno. Circa 640 righe di JavaScript artigianale che sostituiscono `node:fs`, `node:crypto`, `node:os`, `node:net` e qualche altro.

Questo articolo spiega come funziona, polyfill per polyfill.

---

## Il problema di base

Una libreria Node.js usa API che non esistono nel browser. Quando scrivi `import { readFileSync } from 'node:fs'`, è una chiamata di sistema lato Node -- un vero accesso al disco via libuv. Nel browser, `node:fs` non esiste affatto.

Le soluzioni abituali sono:

- **Un runtime Wasm** (tipo Emscripten, WASIp1/WASIp2) -- compili Node.js in Wasm e lo esegui. Risultato: bundle da 10-50 MB, un tempo di caricamento notevole, una complessità di deploy significativa.
- **Polyfill generici** (tipo `browserify`, `webpack node: polyfills`) -- librerie npm che forniscono approssimazioni di ogni modulo Node. Spesso troppo pesanti, mal adattate al caso specifico.
- **Riscrivere i polyfill a mano** -- più lavoro, ma risultato ottimale.

Fortune ha scelto la terza opzione. E il risultato è un bundle per browser che è solo la libreria, che si avvia istantaneamente e che non dipende da nessuna infrastruttura esterna.

---

## La meccanica di build

Tutto si basa su esbuild e la sua opzione `alias`. Ogni import `node:*` viene reindirizzato a un file locale:

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

L'opzione `inject` merita attenzione: permette di iniettare `process.js` e `buffer.js` in testa a ogni file del bundle, rendendo `process` e `Buffer` disponibili globalmente senza alcun import esplicito. Esattamente come Node.js li espone nativamente.

---

## `buffer.js` -- `Buffer` su `Uint8Array`

È uno dei due globali iniettati. `Buffer` è massicciamente usato nel codice -- ogni operazione SSH, ogni snapshot VFS, ogni lettura/scrittura binaria passa di qui.

La soluzione: una classe `BrowserBuffer` che estende `Uint8Array` e implementa tutta l'API `Buffer` di Node.js.

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

Quello che è implementato in totale:
- `Buffer.from`, `Buffer.alloc`, `Buffer.allocUnsafe`, `Buffer.isBuffer`, `Buffer.concat`, `Buffer.byteLength`
- Tutti i metodi di scrittura: `writeUInt8/16/32BE/LE`, `writeInt8/16/32BE/LE`, `writeBigUInt64BE/LE`, `writeFloat/DoubleLE/BE`
- Tutti i metodi di lettura corrispondenti
- `toString` con supporto hex, base64, utf8
- `copy`, `equals`, `slice`, `subarray`

Sono 116 righe. Per quello che sostituisce, è notevolmente compatto.

Il trucco principale è l'uso di `DataView` per gli accessi multi-byte, che gestisce correttamente l'endianness senza dover manipolare i bit a mano per ogni tipo:

```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```

---

## `process.js` -- il globale `process` minimo

L'altro globale iniettato. Minuscolo ma necessario -- il codice verifica spesso `process.env.NODE_ENV`, `process.platform`, `process.nextTick`, ecc.

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

Il mapping `nextTick` → `queueMicrotask` è il dettaglio più importante qui. `process.nextTick` in Node.js pianifica un callback alla fine della fase corrente del ciclo di eventi, prima degli I/O. `queueMicrotask` nel browser fa qualcosa di semanticamente molto vicino -- pianifica una microtask, che viene eseguita prima del prossimo rendering o evento. Non è identico, ma è abbastanza vicino perché tutto il codice che usa `nextTick` funzioni correttamente nel browser.

---

## `node:fs` -- IndexedDB come filesystem sincrono

Questo è il polyfill più sofisticato, e di gran lunga il più interessante tecnicamente.

Il problema è delicato: `node:fs` espone un'API sincrona (`readFileSync`, `writeFileSync`, ecc.), ma le API di storage del browser sono tutte asincrone (IndexedDB, Cache API, ecc.). Non si può fare un `await` in mezzo a una funzione sincrona.

La soluzione di Fortune: un doppio livello di cache.

**Livello 1 -- Map in memoria (sincrono)**  
Tutte le letture avvengono da un `Map<string, Uint8Array>` in memoria. Istantaneo, sincrono, nessun problema di API.

**Livello 2 -- IndexedDB (asincrono, in background)**  
All'avvio, tutto il contenuto di IndexedDB viene caricato nella Map. Le scritture avvengono immediatamente nella Map *e* lanciano una scrittura asincrona verso IndexedDB senza bloccare.

```js
const DB_NAME = 'vfs-fs-shim';
const STORE = 'files';
let db = null;

// Sync cache (path → Uint8Array | null)
const memCache = new Map();

// Preload all'avvio
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

// Scrittura async verso IndexedDB (non bloccante)
function idbSet(path, value) {
  openDB().then(db => {
    const tx = db.transaction(STORE, 'readwrite');
    if (value === null) tx.objectStore(STORE).delete(path);
    else tx.objectStore(STORE).put(value, path);
  });
}
```

L'API esposta è completa: `readFileSync`, `writeFileSync`, `appendFileSync`, `existsSync`, `unlinkSync`, `rmSync` (con opzione `recursive`), `mkdirSync` (con opzione `recursive`), `readdirSync`, `statSync`, `renameSync`.

C'è persino un layer di gestione dei file descriptor (`openSync`, `writeSync`, `closeSync`) per far funzionare il journal WAL del VFS in modalità browser -- il journal apre un fd, scrive al suo interno, lo chiude, e i dati finiscono in IndexedDB.

La proprietà `ready` viene esportata per permettere al codice di sapere quando il precarico iniziale è terminato:

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

È grazie a questo che gli snapshot VFS sopravvivono ai ricaricamenti di pagina nel browser. Quando ricarichi la demo, il VFS viene ripristinato esattamente nello stato in cui lo avevi lasciato, da IndexedDB, senza alcun server coinvolto.

---

## `node:crypto` -- SHA-256, HMAC, PBKDF2 in JS puro

Invece di importare una libreria crypto compilata in Wasm, Fortune ha implementato le primitive necessarie direttamente.

**SHA-256** è implementato from scratch con le costanti FIPS 180-4:

```js
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, /* ... 60 altre costanti */ 
]);

function sha256(data) {
  // padding FIPS 180-4
  const msg = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
  // ...
  // 64 round di compressione
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

Sopra SHA-256, vengono costruiti **HMAC-SHA256** e **PBKDF2-HMAC-SHA256**. Queste due primitive sono usate per la derivazione delle chiavi negli scambi SSH e l'autenticazione interna.

L'API esportata assomiglia a quella di Node.js:

```js
// Hash classico
const hash = createHash('sha256').update('data').digest('hex');

// Byte casuali (via l'API Web Crypto standard)
const bytes = randomBytes(32);

// UUID
const id = randomUUID();

// Confronto timing-safe
const ok = timingSafeEqual(a, b);

// scrypt (approssimato via PBKDF2)
const key = scryptSync(password, salt, 32, { N: 16384 });
```

Nota: `scryptSync` è approssimato via PBKDF2 con un numero di iterazioni calibrato sul parametro `N`. Non è un vero scrypt (che usa uno schema di memoria diverso), ma per gli usi del progetto è sufficiente.

Le funzioni che non possono essere emulate ragionevolmente nel browser (`generateKeyPairSync`, `createCipheriv`, `createDecipheriv`, `createSign`) lanciano un errore esplicito se vengono chiamate. Comportamento onesto.

---

## `node:os` -- leggere le vere specifiche del browser

Invece di restituire valori fissi, questo polyfill legge le API del browser per restituire informazioni che corrispondono alla macchina reale dell'utente.

```js
export function totalmem() {
  try {
    return navigator?.deviceMemory
      ? navigator.deviceMemory * 1024 * 1024 * 1024
      : 2 * 1024 * 1024 * 1024; // 2 GB di default
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

Risultato concreto: quando lanci `neofetch` nella demo del browser, il numero di core e la RAM mostrati corrispondono alla tua macchina. È un dettaglio, ma contribuisce enormemente alla verosimiglianza del terminale.

Gli altri export: `freemem` (40% della memoria totale, approssimazione ragionevole), `platform` → `'browser'`, `type` → `'Linux'`, `release` → `'web'`, `uptime` via `performance.now()`, `endianness` → `'LE'` (little-endian, vero su tutti i processori x86/ARM consumer), `loadavg` → `[0, 0, 0]`.

---

## `node:net` -- stub TCP puliti

Il browser non ha accesso ai socket TCP grezzi (WebSocket non conta -- è un protocollo applicativo diverso). `node:net` è quindi uno stub, ma uno stub *ben scritto*.

```js
export class Socket {
  connect() { notImpl('Socket.connect')(); }
  on() { return this; }    // incatenabile
  once() { return this; }  // incatenabile
  pipe() { return this; }  // incatenabile
  setEncoding() { return this; }
  remoteAddress = '127.0.0.1';
  remotePort = 0;
  // ...
}
```

Il punto importante: i metodi di registrazione degli eventi (`on`, `once`, `off`, `emit`) restituiscono `this` e non lanciano errori. Questo permette al codice che fa `new net.Socket().on('connect', cb)` di funzionare senza crash, anche se la connessione non avviene mai. Solo i metodi che *tentano effettivamente di connettersi* lanciano un errore.

`isIP`, `isIPv4`, `isIPv6` sono implementati correttamente (non sono stub) perché vengono usati dal codice di rete virtuale per validare indirizzi, senza mai aprire un socket.

---

## `node:path` -- operazioni di percorso POSIX

Reimplementazione completa delle operazioni di percorso POSIX, adattata al contesto (niente backslash Windows, percorsi sempre assoluti con `/`).

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

Semplice, compatto, corretto per gli usi del progetto.

---

## `node:url` -- delega alle API del browser

Questa è elegante per la sua semplicità. L'API `URL` e `URLSearchParams` esiste già nativamente nel browser -- basta re-esportarle.

```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```

Solo `fileURLToPath` e `pathToFileURL` necessitano di implementazione, perché sono specifiche di Node:

```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```

È l'approccio ideale quando la piattaforma di destinazione (il browser) fornisce già l'equivalente nativo.

---

## `node:zlib` -- identità

```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```

Due righe. La libreria usa `fflate` per la compressione reale (che funziona nel browser nativamente). `node:zlib` viene importato solo in percorsi di codice che non vengono eseguiti nel contesto del browser -- quindi un passthrough è sufficiente.

A volte la buona implementazione sono due righe.

---

## `node:events` -- EventEmitter minimo

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

L'implementazione completa di `EventEmitter` di Node.js è di ~600 righe con la gestione di `maxListeners`, `once`, `prependListener`, ecc. Qui sono 12 righe per i 4 metodi effettivamente usati. Tree-shaking mentale prima ancora del tree-shaking dello strumento di build.

---

## `ssh2` e `roxify` -- stub espliciti

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

Il server SSH non gira nel browser (non avrebbe senso -- chi si connetterebbe?). Ma il codice che *parla di SSH lato client* -- le classi che costruiscono pacchetti SSH, i parser di protocollo -- esiste nella libreria. Questi stub permettono a tutto quel codice di essere bundleato senza errori, garantendo al contempo che venga lanciato un errore chiaro se qualcuno tenta di chiamare un metodo che richiede un socket reale.

`roxify` è un formato di compressione proprietario usato per gli snapshot VFS in modalità Node. Nel browser, viene usato `fflate` al suo posto -- il polyfill si limita a lanciare un errore se `roxify` viene chiamato direttamente.

---

## `node:worker_threads` -- riesportazione dei Web Worker

Questo è il più sottile. `node:worker_threads` in Node.js e i Web Worker del browser sono due API diverse, ma concettualmente vicine. Il polyfill fa il mapping:

```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```

`MessageChannel` e `MessagePort` vengono riesportati direttamente dal browser (stessa API). `Worker` stesso necessita di un wrapper perché il costruttore è diverso (Node aspetta un percorso di modulo, il browser aspetta un URL). `isMainThread` è sempre `true` lato browser in questo contesto.

---

## Panoramica: cosa rappresentano queste 640 righe

| Polyfill | Righe | Strategia |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array` + `DataView`, tutta l'API `Buffer` |
| `node:crypto` | 166 | SHA-256/HMAC/PBKDF2 from scratch + Web Crypto per i random |
| `node:fs` | 210 | `Map` in memoria + IndexedDB async |
| `node:net` | 70 | Stub incatenabili + validazioni IP reali |
| `ssh2` | 74 | Stub espliciti |
| `process.js` | 14 | Minimo vitale `process` |
| `node:path` | ~30 | Operazioni di percorso POSIX |
| `node:url` | ~25 | Delega alle API del browser |
| `node:events` | ~12 | EventEmitter 4 metodi |
| `node:os` | ~25 | `navigator.deviceMemory` / `hardwareConcurrency` |
| `node:zlib` | 4 | Passthrough |
| `node:worker_threads` | ~30 | Riesportazione Web Worker |
| `roxify.js` | 8 | Stub |

640 righe. Nessuna dipendenza npm. Nessun Wasm. E regala un bundle per browser che si avvia in meno di un secondo e gira senza alcuna infrastruttura lato server.

---

## Cosa possiamo imparare

La prossima volta che vuoi portare una libreria Node.js nel browser, ecco cosa dimostra l'approccio di Fortune:

1. **Identifica ciò che è realmente usato.** Non serve implementare `EventEmitter` per intero se il codice usa solo `on`, `emit` e `removeListener`.

2. **Delega alle API del browser quando possibile.** `URL`, `URLSearchParams`, `MessageChannel`, `MessagePort`, `crypto.getRandomValues` -- il browser le ha già, tanto vale usarle.

3. **Cache sincrona davanti a un'API async.** La soluzione `Map` + IndexedDB per `node:fs` è il pattern più riutilizzabile di tutta la cartella.

4. **Gli stub onesti sono meglio delle implementazioni incomplete silenziose.** Un `throw new Error('not implemented in browser')` esplicito è infinitamente più utile di un `return undefined` che lascia che il bug si manifesti 10 chiamate più avanti.

5. **esbuild `alias` + `inject` è sottovalutato.** È lo strumento perfetto per questo tipo di porting -- zero configurazione webpack, zero plugin, solo una lista di sostituzioni.

---

Il codice è nel repo: [github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills). Ogni file sta in una sola pagina, si legge direttamente su GitHub. Fortemente raccomandato se lavori a un progetto simile.
