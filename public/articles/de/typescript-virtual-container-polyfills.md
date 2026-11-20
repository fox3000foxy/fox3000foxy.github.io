---
title: "Eine Node.js-Bibliothek im Browser laufen lassen ohne Wasm, die Polyfills von typescript-virtual-container"
description: "Wie Fortune von Hand node:fs, node:crypto und ein Dutzend Node-Module in 640 Zeilen JavaScript reimplementiert hat, damit der Container im Browser ohne Wasm läuft."
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
lang: "de"
---
# 

Ich habe vor kurzem viel Zeit damit verbracht, den Quellcode von [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container), den Entwurf des [Fortune (Chloé Rolzhausen)](https://itsrealfortune.fr)Und der Teil, der mich am meisten überrascht hat, ist die Akte.`polyfills/`Noch mehr als das VFS, das virtuelle Netzwerk oder die 170 neu implementierten Unix-Befehle im TypeScript.

Weil das Modul im Browser läuft, ohne Wasm, und dafür hat Fortune die ganze Schicht von Hand implementiert.`node:*`die die Bibliothek benötigt. Etwa 640 Linien von JavaScript Handwerk, die ersetzen`node:fs` , `node:crypto` , `node:os` , `node:net`- Und ein paar andere.

Dieser Artikel erklärt, wie es funktioniert, Polyfill aus Polyfill.

---

## Das grundlegende Problem

Eine Node.js-Bibliothek verwendet APIs, die im Browser nicht existieren.`import { readFileSync } from 'node:fs'`, es ist ein Systemanruf auf der Seite Node – ein echter Festplattenzugriff über libuv. Im Browser,`node:fs`Es gibt überhaupt keine.

Die üblichen Lösungen sind:

- **Ein Runtime Wasm** (Typ Emscripten, WASIP1/WASIP2) – kompiliert Node.js in Wasm und führt es aus. Ergebnis: Bundles von 10-50 MB, eine bemerkenswerte Ladezeit, eine signifikante Komplexität der Bereitstellung.
- **Generische Polyfille** (Typ`browserify` , `webpack node: polyfills`) – npm-Bibliotheken, die Näherungswerte für jedes Node-Modul liefern. Oft zu schwer, für den Einzelfall nicht geeignet.
- **Mehrschicht-Farbe per Hand** – mehr Arbeit, aber optimales Ergebnis.

Fortune hat die dritte Option gewählt. Und das Ergebnis ist ein Browser-Bund, der nur die Bibliothek ist, die sofort startet und nicht von einer externen Infrastruktur abhängt.

---

## Die Bauform

Alles basiert auf Esbuild und seiner Option`alias`. Jeder Import`node:*`wird zu einer lokalen Datei umgeleitet:
```js
// Vorbemerkung/build.js
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
Die Option`inject`• eine Bewertung der Wirksamkeit: Es ermöglicht die Injektion`process.js`und`buffer.js`an der Spitze jeder Datei im Bundle, was macht`process`und`Buffer`die insgesamt ohne ausdrücklichen Import verfügbar sind. Genau wie Node.js sie nativ ausstellt.

---

## `buffer.js` – `Buffer`über`Uint8Array`

Es ist einer der beiden injizierten Globals.`Buffer`wird im Code massiv verwendet – jede SSH-Operation, jede VFS-Snapshot, jede Binär-Lese/Buchung geht durch.

Die Lösung: eine Klasse`BrowserBuffer`die`Uint8Array`und implementiert die gesamte API`Buffer`Node.js.
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
  // 
}
globalThis.Buffer = BrowserBuffer;
```
Was wird insgesamt implementiert:

- `Buffer.from` , `Buffer.alloc` , `Buffer.allocUnsafe` , `Buffer.isBuffer` , `Buffer.concat` , `Buffer.byteLength`

- Alle Schreibmethoden:`writeUInt8/16/32BE/LE` , `writeInt8/16/32BE/LE` , `writeBigUInt64BE/LE` , `writeFloat/DoubleLE/BE`

- Alle entsprechenden Lesemethoden

- `toString`mit Hex-Hex-Unterstützung, Base64, utf8

- `copy` , `equals` , `slice` , `subarray`

Das sind 116 Zeilen, und das ist bemerkenswert kompakt.

Der Haupttipp ist die Verwendung von`DataView`für mehrbyte-Zugriffe, die das Endianness richtig verwaltet, ohne dass die Bits von Hand für jeden Typ manipuliert werden müssen:
```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```
---

## `process.js`– das Gesamtergebnis`process`Minimum

Das andere Gesamtsystem injiziert. Klein, aber notwendig – der Code testet oft`process.env.NODE_ENV` , `process.platform` , `process.nextTick`, etc.
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
Mapping`nextTick` → `queueMicrotask`ist das wichtigste Detail hier.`process.nextTick`in Node.js schedule einen Callback am Ende der aktuellen Phase der Ereignisschleife, vor den I/O.`queueMicrotask`im Browser bietet eine sehr nahe Semantik: es schedule eine Mikrotasking, die vor dem nächsten Rendering oder Ereignis ausgeführt wird, und diese Nähe reicht aus, um den gesamten Code, der verwendet`nextTick`funktioniert im Browser richtig.

---

## `node:fs`– IndexedDB als Synchrondateisystem

Es ist das hochmodernste Polyfill, und bei weitem das technisch interessanteste.

Das Problem ist:`node:fs`eine synchrone API (`readFileSync` , `writeFileSync`, etc.), aber die Browser-Speicher-APIs sind alle asynchron (IndexedDB, Cache API, etc).`await`in der Mitte einer Synchronfunktion.

Die Fortune-Lösung: eine doppelte Cache-Ebene.

**Niveau 1 – Map im Speicher(synchron)** Alle Wiedergaben werden von einem`Map<string, Uint8Array>`Instant, synchron, kein API-Problem.

**Niveau 2 – IndexedDB (asynchron, im Hintergrund)** Beim Start wird der gesamte Inhalt von IndexeddB in die Map geladen. Die Schriften werden sofort in die map *et* geschrieben und führen asynchrone Schriften zu Indexed DB aus, ohne dass sie blockiert werden.
```js
const DB_NAME = 'vfs-fs-shim';
const STORE = 'files';
let db = null;

// Cache synchronisieren (Pfad → Uint8 Array-Null)
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

// Async-Schreib zu IndexedDB (nicht blockiert)
function idbSet(path, value) {
  openDB().then(db => {
    const tx = db.transaction(STORE, 'readwrite');
    if (value === null) tx.objectStore(STORE).delete(path);
    else tx.objectStore(STORE).put(value, path);
  });
}
```
Die vorgelegte API ist vollständig:`readFileSync` , `writeFileSync` , `appendFileSync` , `existsSync` , `unlinkSync` , `rmSync`(mit Option`recursive`), `mkdirSync`(mit Option`recursive`), `readdirSync` , `statSync` , `renameSync` .

Es gibt sogar eine Datei-Management-Schicht descriptors (`openSync` , `writeSync` , `closeSync`) Damit das WAL-Protokoll des VFS im Browser-Modus läuft – öffnet das Protokoll ein Fd, das innen geschrieben ist, das Bauernhaus, und die Daten finden sich in IndexedDB.

Eigentum`ready`wird exportiert , damit der Code wissen kann , wann der ursprüngliche Preload abgeschlossen ist:
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
Deshalb überleben VFS-Snapshots das Nachladen von Seiten im Browser. Wenn du die Demo laden, wird der VFS genau in dem Zustand wiederhergestellt, in dem du ihn zurückgelassen haben, von IndexedDB aus, ohne irgendeinen Server beteiligt.

---

## `node:crypto`– SHA-256, HMAC, PBKDF2 in reinem JS

Anstatt eine Kryptobibliothek in Wasm zu importieren, hat Fortune die notwendigen Primitivheiten direkt implementiert.

**SHA-256** wird mit FIPS 180-4 Konstanten von scratch implementiert:
```js
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, /* ... 60 autres constantes */ 
]);

function sha256(data) {
  // padding FIPS180-4
  const msg = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
  // 
  // 64 Kompressionsrunden
  for (let j = 0; j < 64; j++) {
    const S1  = (e>>>6|e<<26)^(e>>>11|e<<21)^(e>>>25|e<<7);
    const ch  = (e&f)^(~e&g);
    const t1  = (hh + S1 + ch + K[j] + w[j]) | 0;
    const S0  = (a>>>2|a<<30)^(a>>>13|a<<19)^(a>>>22|a<<10);
    const maj = (a&b)^(a&c)^(b&c);
    const t2  = (S0 + maj) | 0;
    // 
  }
}
```
Über SHA-256, **HMAC-SHA256** und **PBKDF2-HMAC -SHA256** werden gebaut. Diese beiden Primitiven werden für die Schlüsselbypass- und interne Authentifizierung im SSH-Handel verwendet.

Die exportierte API ähnelt der von Node.js:
```js
// Klassische Hash
const hash = createHash('sha256').update('data').digest('hex');

// Zufällige Bytes (über die Standard-Crypto Web-API)
const bytes = randomBytes(32);

// UUID
const id = randomUUID();

// Timing-Safe-Vergleich
const ok = timingSafeEqual(a, b);

// scrypt (über PBKDF2)
const key = scryptSync(password, salt, 32, { N: 16384 });
```
Anmerkung:`scryptSync`wird über PBKDF2 mit einer Anzahl von Iterationen auf den Parameter gedrückt`N`Diese Annäherung ersetzt das spezifische Script-Speicherschema und deckt die Anwendung des Projekts ab.

Funktionen, die nicht in angemessener Weise im Browser emulgiert werden können (`generateKeyPairSync` , `createCipheriv` , `createDecipheriv` , `createSign`) einen ausdrücklichen Fehler machen, wenn sie aufgerufen werden.

---

## `node:os`– die wahren Browser-Spekte lesen

Anstatt feste Werte zurückzugeben, liest dieses Polyfill die Browser-APIs, um Informationen zurückzugeben die der tatsächlichen Maschine des Benutzers entsprechen.
```js
export function totalmem() {
  try {
    return navigator?.deviceMemory
      ? navigator.deviceMemory * 1024 * 1024 * 1024
      : 2 * 1024 * 1024 * 1024; // 2 Standard GB
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
Konkretes Ergebnis: Wenn du startest`neofetch`Im Browser entsprechen die Anzahl der angezeigten Kerne und RAMs deiner Maschine. Das ist ein Detail, aber es trägt wesentlich zur Wahrscheinlichkeit des Terminals bei.

Sonstige Ausfuhren:`freemem`(40% des gesamten Speichers, angemessene Näherung),`platform` → `'browser'` , `type` → `'Linux'` , `release` → `'web'` , `uptime`via`performance.now()` , `endianness` → `'LE'`(Lit-endian, wahrhaftig auf allen Prozessoren x86/ARM für die breite Öffentlichkeit),`loadavg` → `[0, 0, 0]` .

---

## `node:net`– eigene TCP-Stubs

Der Browser hat keinen Zugriff auf rohe TCP-Sockets (WebSocket zählt nicht - es ist ein anderes Anwendungsprotokoll).`node:net`ist also ein Stub, aber ein gut geschriebener Stub*.
```js
export class Socket {
  connect() { notImpl('Socket.connect')(); }
  on() { return this; } // linkbar
  once() { return this; } // linkbar
  pipe() { return this; } // linkbar
  setEncoding() { return this; }
  remoteAddress = '127.0.0.1';
  remotePort = 0;
  // 
}
```
Der wichtigste Punkt: die Methoden der Ereignisregister (`on` , `once` , `off` , `emit`) zurück`this`Das erlaubt dem Code, der`new net.Socket().on('connect', cb)`, ohne zu pflanzen, auch wenn die Verbindung nie erfolgt. Nur die Methoden, die sich wirklich anmelden*, führen einen Fehler aus.

`isIP` , `isIPv4` , `isIPv6`werden korrekt implementiert (mit einer echten Validierungslogik), da sie vom virtuellen Netzwerkcode verwendet werden, um Adressen zu validieren, ohne jemals Socket zu öffnen.

---

## `node:path`– POSIX path operations

Vollständige Implementierung von POSIX-Pfadoperationen, die dem Kontext angepasst sind (immer absolute Pfade mit`/`, nur Unix-Stil).
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
Einfach, kompakt, korrekt für die Anwendung des Projekts.

---

## `node:url`– Übertragung an die Browser-APIs

Diese ist elegant durch ihre Einfachheit.`URL`und`URLSearchParams`existiert bereits navigativ im Browser – nur um sie wieder zu exportieren.
```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```
Nur`fileURLToPath`und`pathToFileURL`erfordern eine Implementierung, da sie für Node spezifisch sind:
```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```
Dies ist der ideale Ansatz, wenn die Zielplattform (der Browser) bereits das native Äquivalent liefert.

---

## `node:zlib`– Identität
```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```
Zwei Zeilen. Die Bibliothek verwendet`fflate`für die tatsächliche Kompression (die als Browser nativ funktioniert).`node:zlib`wird nur in Codepfade importiert, die nicht im Kontext browser ausgeführt werden - also reicht ein Passthrough aus.

Manchmal ist die richtige Implementierung zwei Zeilen.

---

## `node:events`– MindesteventEmitter
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
Die vollständige Implementierung von`EventEmitter`von Node.js macht ~600 Linien mit Management`maxListeners` , `once` , `prependListener`Hier sind 12 Zeilen für die vier tatsächlich verwendeten Methoden. Verstandliches Tree-Shaking vor dem Treeshaking des Build-Werkzeugs.

---

## `ssh2`und`roxify`– explizite Stubs
```js
// Polyfills/ssh2/index.js
function notImpl(name) {
  return function() {
    throw new Error(`ssh2: ${name} not implemented in browser`);
  };
}

export class Client {
  connect()  { notImpl('Client.connect')(); }
  end()      { notImpl('Client.end')(); }
  exec()     { notImpl('Client.exec')(); }
  // 
}
```
Der SSH-Server läuft nicht im Browser (es würde keinen Sinn ergeben - wer würde sich anmelden?). Aber der Code, der * von SSH auf Client-Seite spricht* – Klassen, die SSH Pakete bauen, Protokoll-Parser – existiert in der Bibliothek. Diese Stubs ermöglichen es, diesen Code ohne Fehler zu verbinden, während gleichzeitig sichergestellt wird, dass ein klarer Fehler aufgehoben wird, wenn jemand versucht, eine Methode zu nennen, die einen echten Socket erfordert.

`roxify`ist ein proprietäres Kompressionsformat für VFS-Snapshots im Node-Modus. Im Browser ist es`fflate`das stattdessen verwendet wird – das Polyfill startet nur einen Fehler, wenn`roxify`wird direkt angerufen.

---

## `node:worker_threads`– Reexport von Web Workers

Das ist das subtilste.`node:worker_threads`in Node.js und Web Workers des Browsers sind zwei verschiedene APIs, aber sie sind konzeptuell nahe. Polyfill macht Mapping:
```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```
`MessageChannel`und`MessagePort`werden direkt aus dem Browser (die gleiche API) exportiert.`Worker`selbst erfordert ein Wrapper, da der Hersteller anders ist (Node erwartet einen Modulpfad, der Browser erwartet eine URL).`isMainThread`ist immer`true`Browser-Seite in diesem Zusammenhang.

---

## Überblick: Was diese 640 Linien darstellen

| Polyfill | Zeilen | Strategie |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array` + `DataView`, die gesamte API`Buffer` |
| `node:crypto` | 166 | SHA-256/HMAC/PBKDF2 from scratch + Web Crypto für Randoms |
| `node:fs` | 210 | `Map`en mémoire + IndexedDB async |
| `node:net` | 70 | Kettenstebs + tatsächliche IP-Validierungen |
| `ssh2` | 74 | Explizite Stubs |
| `process.js` | 14 | Existenzminimum`process` |
| `node:path` | ~30 | POSIX path ops |
| `node:url` | ~25 | Delegation für die browser-APIs |
| `node:events` | ~12 | EventEmitter 4 Methoden |
| `node:os` | ~25 | `navigator.deviceMemory` / `hardwareConcurrency` |
| `node:zlib` | 4 | Passthrough |
| `node:worker_threads` | ~30 | Web Workers Reexport |
| `roxify.js` | 8 | Stubs |

640 Zeilen. Keine Abhängigkeit npm. Keine Wasm. Und es gibt ein Browser-Bund, der in weniger als einer Sekunde startet und ohne Server-Infrastructure läuft.

---

## Was wir daraus lernen können

Das nächste Mal, wenn du eine Node.js-Bibliothek im Browser tragen willst, zeigt das Fortune-Anflug:

1. **Identifiziert, was tatsächlich verwendet wird.** Fügt nur die Methoden ein, die mit dem Code aufgerufen werden: hier`on` , `emit`und`removeListener`•`EventEmitter` .
2. **Berechtigen du Browser-APIs, wenn möglich.**`URL` , `URLSearchParams` , `MessageChannel` , `MessagePort` , `crypto.getRandomValues`– der Browser hat sie bereits, so viel sie zu benutzen.
3. **Der Synchron-Cache vor einer async API.** Die Lösung`Map`+ IndexedDB für`node:fs`ist die wiederverwendbarste Pattern der ganzen Akte.
4. **Ehrliche Stubs sind besser als unvollständige stille Implementationen.** Ein`throw new Error('not implemented in browser')`explicit ist unendlich nützlicher als ein`return undefined`Das lässt den Fehler 10 Anrufe weiter zu manifestieren.
5. **esbuild`alias` + `inject`** Dies ist das perfekte Werkzeug für diese Art von Portierung – Null Webpack-Konfiguration, Null Plugin, nur eine Liste von Ersatz.

---

Der Code ist in der repo:[github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills)Jede Datei hält auf einer Seite, sie ist direkt auf GitHub lesbar. Sehr empfehlenswert, wenn du an einem ähnlichen Projekt arbeiten.
