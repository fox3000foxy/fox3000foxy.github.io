---
title: Eine Node.js-Bibliothek im Browser laufen lassen ohne Wasm,
  die Polyfills von typescript-virtual-container
description: Wie Fortune von Hand node:fs, node:crypto und
  ein Dutzend Node-Module in 640 Zeilen JavaScript reimplementiert hat, damit der Container
  im Browser ohne Wasm läuft.
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
author_sig: "2A1Ccj6+2+MlT0EhQ1EaW9bFeO2myPCcVwQEz1YilCR2gubQHgHVwpu3P3XtDor3IIwReV/jzFE80Eqls/i3uQ=="
---

# Eine Node.js-Bibliothek im Browser laufen lassen ohne Wasm, die Polyfills von typescript-virtual-container

Ich habe kürzlich ziemlich viel Zeit damit verbracht, den Quellcode von [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) zu durchforsten, das Projekt von [Fortune (Chloe Rolzhausen)](https://itsrealfortune.fr). Und der Teil, der mich am meisten überrascht hat, ist der `polyfills/`-Ordner, noch mehr als das VFS, das virtuelle Netz oder die 170 in TypeScript reimplementierten Unix-Commands.

Weil das Modul im Browser läuft, ohne Wasm, und dafür hat Fortune von Hand die ganze `node:*`-Schicht reimplementiert, die die Bibliothek braucht. Etwa 640 Zeilen handgemachtes JavaScript, das `node:fs`, `node:crypto`, `node:os`, `node:net` und einige andere ersetzt.

Dieser Artikel erklärt, wie es funktioniert, Polyfill für Polyfill.

---

## Das Basisproblem

Eine Node.js-Bibliothek nutzt APIs, die im Browser nicht existieren. Wenn du `import { readFileSync } from 'node:fs'` schreibst, ist das ein Systemaufruf auf Node-Seite, ein echter Plattenzugriff via libuv. Im Browser existiert `node:fs` überhaupt nicht.

Die üblichen Workarounds sind:

- **Eine Wasm-Runtime** (Typ Emscripten, WASIp1/WASIp2), du kompilierst Node.js zu Wasm und führst es aus. Ergebnis: 10-50 MB Bundles, spürbare Ladezeit, signifikante Deploymentkomplexität.
- **Generische Polyfills** (Typ `browserify`, `webpack node: polyfills`), npm-Bibliotheken, die Annäherungen jedes Node-Moduls liefern. Oft zu schwer, schlecht an den spezifischen Fall angepasst.
- **Die Polyfills von Hand neu schreiben**, mehr Arbeit, aber optimales Ergebnis.

Fortune hat die dritte Option gewählt. Und das Ergebnis ist ein Browserbundle, das nur die Bibliothek ist, das augenblicklich startet und von keiner externen Infrastruktur abhängt.

---

## Die Build-Mechanik

Alles beruht auf esbuild und seiner `alias`-Option. Jeder `node:*`-Import wird auf eine lokale Datei umgeleitet:

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

Die `inject`-Option verdient Beachtung: Sie erlaubt, `process.js` und `buffer.js` an den Kopf jeder Bundle-Datei zu injizieren, was `process` und `Buffer` global verfügbar macht ohne expliziten Import. Exakt wie Node.js sie nativ exponiert.

---

## `buffer.js`, `Buffer` auf `Uint8Array`

Das ist eines der zwei injizierten Globals. `Buffer` wird massiv im Code genutzt, jede SSH-Operation, jeder VFS-Snapshot, jedes binäre Lesen/Schreiben geht dadurch.

Die Lösung: Eine `BrowserBuffer`-Klasse, die `Uint8Array` erweitert und die ganze Node.js-`Buffer`-API implementiert.

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

Was insgesamt implementiert ist:
- `Buffer.from`, `Buffer.alloc`, `Buffer.allocUnsafe`, `Buffer.isBuffer`, `Buffer.concat`, `Buffer.byteLength`
- Alle Schreibmethoden: `writeUInt8/16/32BE/LE`, `writeInt8/16/32BE/LE`, `writeBigUInt64BE/LE`, `writeFloat/DoubleLE/BE`
- Alle entsprechenden Lesemethoden
- `toString` mit Hex-, Base64-, UTF8-Support
- `copy`, `equals`, `slice`, `subarray`

Das sind 116 Zeilen. Für das, was es ersetzt, bemerkenswert kompakt.

Der Haupttrick ist die Nutzung von `DataView` für Multi-Byte-Zugriffe, was Endianness korrekt handhabt, ohne die Bits für jeden Typ von Hand manipulieren zu müssen:

```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```

---

## `process.js`, das minimale `process`-Global

Das andere injizierte Global. Winzig, aber nötig, der Code testet oft `process.env.NODE_ENV`, `process.platform`, `process.nextTick` usw.

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

Das `nextTick` → `queueMicrotask`-Mapping ist hier das wichtigste Detail. `process.nextTick` in Node.js schedult einen Callback ans Ende der aktuellen Eventloop-Phase, vor I/O. `queueMicrotask` im Browser bietet eine sehr nahe Semantik: Es schedult eine Mikrotask, die vor dem nächsten Render oder Event läuft, und diese Nähe reicht, damit aller Code, der `nextTick` nutzt, im Browser korrekt funktioniert.

---

## `node:fs`, IndexedDB als synchrones Dateisystem

Das ist der ausgefeilteste Polyfill und technisch bei Weitem der interessanteste.

Das Problem ist knifflig: `node:fs` exponiert eine synchrone API (`readFileSync`, `writeFileSync` usw.), aber Browser-Speicher-APIs sind alle asynchron (IndexedDB, Cache API usw.). Man kann kein `await` mitten in einer synchronen Funktion machen.

Fortunes Lösung: Ein doppelter Cache-Level.

**Level 1, Map im Speicher (synchron)**  
Alle Lesevorgänge kommen aus einer `Map<string, Uint8Array>` im Speicher. Augenblicklich, synchron, kein API-Problem.

**Level 2, IndexedDB (asynchron, im Hintergrund)**  
Beim Start wird der ganze IndexedDB-Inhalt in die Map geladen. Schreibvorgänge gehen sofort in die Map *und* stoßen einen asynchronen Write nach IndexedDB an, ohne zu blockieren.

```js
const DB_NAME = 'vfs-fs-shim';
const STORE = 'files';
let db = null;

// Sync-Cache (path → Uint8Array | null)
const memCache = new Map();

// Preload beim Start
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

// Async-Write nach IndexedDB (nicht-blockierend)
function idbSet(path, value) {
  openDB().then(db => {
    const tx = db.transaction(STORE, 'readwrite');
    if (value === null) tx.objectStore(STORE).delete(path);
    else tx.objectStore(STORE).put(value, path);
  });
}
```

Die exponierte API ist komplett: `readFileSync`, `writeFileSync`, `appendFileSync`, `existsSync`, `unlinkSync`, `rmSync` (mit `recursive`-Option), `mkdirSync` (mit `recursive`-Option), `readdirSync`, `statSync`, `renameSync`.

Es gibt sogar eine File-Descriptor-Verwaltungsschicht (`openSync`, `writeSync`, `closeSync`), damit das WAL-Journal des VFS im Browsermodus funktioniert, das Journal öffnet einen FD, schreibt hinein, schließt ihn, und die Daten landen in IndexedDB.

Die `ready`-Eigenschaft wird exportiert, damit der Code wissen kann, wann der initiale Preload fertig ist:

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

Dank dem überleben VFS-Snapshots Seiten-Reloads im Browser. Wenn du die Demo neu lädst, wird das VFS exakt in dem Zustand restauriert, in dem du es gelassen hast, aus IndexedDB, ohne involvierten Server.

---

## `node:crypto`, SHA-256, HMAC, PBKDF2 in purem JS

Statt eine in Wasm kompilierte Kryptobibliothek zu importieren, hat Fortune die nötigen Primitive direkt implementiert.

**SHA-256** ist from scratch mit FIPS-180-4-Konstanten implementiert:

```js
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, /* ... 60 weitere Konstanten */
]);

function sha256(data) {
  // Padding FIPS 180-4
  const msg = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
  // ...
  // 64 Kompressionsrunden
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

Über SHA-256 werden **HMAC-SHA256** und **PBKDF2-HMAC-SHA256** aufgebaut. Diese zwei Primitive werden für Schlüsselableitung in SSH-Austauschen und interne Authentifizierung genutzt.

Die exportierte API sieht wie die von Node.js aus:

```js
// Klassischer Hash
const hash = createHash('sha256').update('data').digest('hex');

// Zufallsbytes (via Standard-Web-Crypto-API)
const bytes = randomBytes(32);

// UUID
const id = randomUUID();

// Timing-sicherer Vergleich
const ok = timingSafeEqual(a, b);

// scrypt (angenähert via PBKDF2)
const key = scryptSync(password, salt, 32, { N: 16384 });
```

Hinweis: `scryptSync` wird via PBKDF2 mit einer auf Parameter `N` geeichten Iterationszahl angenähert. Diese Annäherung ersetzt das spezifische Memory-Schema von scrypt und deckt die Nutzungen des Projekts ab.

Funktionen, die im Browser nicht vernünftig emuliert werden können (`generateKeyPairSync`, `createCipheriv`, `createDecipheriv`, `createSign`), werfen einen expliziten Fehler, wenn sie aufgerufen werden. Ehrliches Verhalten.

---

## `node:os`, die echten Specs des Browsers lesen

Statt fixe Werte zurückzugeben, liest dieser Polyfill Browser-APIs, um Informationen zurückzugeben, die der echten Maschine des Nutzers entsprechen.

```js
export function totalmem() {
  try {
    return navigator?.deviceMemory
      ? navigator.deviceMemory * 1024 * 1024 * 1024
      : 2 * 1024 * 1024 * 1024; // 2 GB Standard
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

Konkretes Ergebnis: Wenn du `neofetch` in der Browserdemo startest, entsprechen Kernzahl und angezeigtes RAM deiner Maschine. Ein Detail, aber es trägt enorm zur Glaubwürdigkeit des Terminals bei.

Die anderen Exporte: `freemem` (40 % des Gesamtspeichers, vernünftige Annäherung), `platform` → `'browser'`, `type` → `'Linux'`, `release` → `'web'`, `uptime` via `performance.now()`, `endianness` → `'LE'` (Little-Endian, wahr auf allen gängigen x86/ARM-Prozessoren), `loadavg` → `[0, 0, 0]`.

---

## `node:net`, saubere TCP-Stubs

Der Browser hat keinen Zugriff auf rohe TCP-Sockets (WebSocket zählt nicht, das ist ein anderes Anwendungsprotokoll). `node:net` ist also ein Stub, aber ein *gut geschriebener* Stub.

```js
export class Socket {
  connect() { notImpl('Socket.connect')(); }
  on() { return this; }    // verkettbar
  once() { return this; }  // verkettbar
  pipe() { return this; }  // verkettbar
  setEncoding() { return this; }
  remoteAddress = '127.0.0.1';
  remotePort = 0;
  // ...
}
```

Der wichtige Punkt: Die Event-Registermethoden (`on`, `once`, `off`, `emit`) geben `this` zurück und werfen keinen Fehler. Das erlaubt Code, der `new net.Socket().on('connect', cb)` macht, ohne Crash zu funktionieren, selbst wenn die Verbindung nie zustande kommt. Nur Methoden, die *wirklich zu verbinden versuchen*, werfen einen Fehler.

`isIP`, `isIPv4`, `isIPv6` sind korrekt implementiert (mit echter Validierungslogik), weil sie vom virtuellen Netzwerkcode genutzt werden, um Adressen zu validieren, ohne je einen Socket zu öffnen.

---

## `node:path`, POSIX-Path-Operationen

Komplette Reimplementierung der POSIX-Pfadoperationen, an den Kontext angepasst (Pfade immer absolut mit `/`, nur Unix-Stil).

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

Simpel, kompakt, korrekt für die Nutzungen des Projekts.

---

## `node:url`, Delegation an Browser-APIs

Die ist elegant durch ihre Einfachheit. Die `URL`- und `URLSearchParams`-API existiert schon nativ im Browser, es reicht, sie zu re-exportieren.

```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```

Nur `fileURLToPath` und `pathToFileURL` brauchen eine Implementierung, weil sie Node-eigen sind:

```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```

Das ist der ideale Ansatz, wenn die Zielplattform (der Browser) das native Äquivalent schon liefert.

---

## `node:zlib`, Identität

```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```

Zwei Zeilen. Die Bibliothek nutzt `fflate` für echte Kompression (die nativ im Browser funktioniert). `node:zlib` wird nur in Codepfaden importiert, die im Browserkontext nicht laufen, also reicht ein Passthrough.

Manchmal ist die gute Implementierung zwei Zeilen.

---

## `node:events`, minimaler EventEmitter

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

Die komplette Node.js-`EventEmitter`-Implementierung macht ~600 Zeilen mit `maxListeners`-, `once`-, `prependListener`-Handhabung usw. Hier sind es 12 Zeilen für die 4 wirklich genutzten Methoden. Mentales Tree-Shaking schon vor dem Tree-Shaking des Buildtools.

---

## `ssh2` und `roxify`, explizite Stubs

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

Der SSH-Server läuft nicht im Browser (das ergäbe keinen Sinn, wer würde sich verbinden ?). Aber der Code, der *von SSH auf Clientseite redet*, die Klassen, die SSH-Pakete bauen, die Protokollparser, existiert in der Bibliothek. Diese Stubs erlauben, all diesen Code ohne Fehler zu bundlen und garantieren gleichzeitig, dass ein klarer Fehler geworfen wird, wenn jemand versucht, eine Methode aufzurufen, die einen echten Socket braucht.

`roxify` ist ein proprietäres Kompressionsformat für VFS-Snapshots im Node-Modus. Im Browser wird stattdessen `fflate` genutzt, der Polyfill wirft nur einen Fehler, wenn `roxify` direkt aufgerufen wird.

---

## `node:worker_threads`, Re-Export der Web Workers

Das ist der subtilste. `node:worker_threads` in Node.js und die Web Workers des Browsers sind zwei unterschiedliche APIs, aber konzeptuell nah. Der Polyfill macht das Mapping:

```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```

`MessageChannel` und `MessagePort` werden direkt aus dem Browser re-exportiert (gleiche API). `Worker` selbst braucht einen Wrapper, weil der Konstruktor unterschiedlich ist (Node erwartet einen Modulpfad, der Browser eine URL). `isMainThread` ist in diesem Kontext browser-seitig immer `true`.

---

## Überblick: was diese 640 Zeilen darstellen

| Polyfill | Zeilen | Strategie |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array` + `DataView`, ganze `Buffer`-API |
| `node:crypto` | 166 | SHA-256/HMAC/PBKDF2 from scratch + Web Crypto für Randoms |
| `node:fs` | 210 | `Map` im Speicher + async IndexedDB |
| `node:net` | 70 | Verkettbare Stubs + echte IP-Validierungen |
| `ssh2` | 74 | Explizite Stubs |
| `process.js` | 14 | Minimal viable `process` |
| `node:path` | ~30 | POSIX-Path-Ops |
| `node:url` | ~25 | Delegation an Browser-APIs |
| `node:events` | ~12 | EventEmitter mit 4 Methoden |
| `node:os` | ~25 | `navigator.deviceMemory` / `hardwareConcurrency` |
| `node:zlib` | 4 | Passthrough |
| `node:worker_threads` | ~30 | Re-Export Web Workers |
| `roxify.js` | 8 | Stubs |

640 Zeilen. Keine npm-Abhängigkeit. Kein Wasm. Und das gibt ein Browserbundle, das in weniger als einer Sekunde startet und ohne jegliche serverseitige Infrastruktur läuft.

---

## Was man daraus mitnehmen kann

Wenn du das nächste Mal eine Node.js-Bibliothek in den Browser porten willst, zeigt Fortunes Ansatz Folgendes:

1. **Identifiziere, was wirklich genutzt wird.** Implementiere nur die vom Code aufgerufenen Methoden: Hier reichen `on`, `emit` und `removeListener` für `EventEmitter`.

2. **Delegiere an Browser-APIs, wenn möglich.** `URL`, `URLSearchParams`, `MessageChannel`, `MessagePort`, `crypto.getRandomValues`, der Browser hat sie schon, nutze sie.

3. **Der synchrone Cache vor einer async API.** Die `Map` + IndexedDB-Lösung für `node:fs` ist das wiederverwendbarste Pattern des ganzen Ordners.

4. **Ehrliche Stubs sind besser als stille unvollständige Implementierungen.** Ein explizites `throw new Error('not implemented in browser')` ist unendlich nützlicher als ein `return undefined`, das den Bug 10 Calls später aufplatzen lässt.

5. **esbuild `alias` + `inject` wird unterschätzt.** Das ist das perfekte Tool für diese Art Portierung, null Webpack-Config, null Plugin, nur eine Ersetzungsliste.

---

Der Code liegt im Repo: [github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills). Jede Datei passt auf eine einzige Seite, direkt auf GitHub lesbar. Stark empfohlen, wenn du an einem ähnlichen Projekt arbeitest.
