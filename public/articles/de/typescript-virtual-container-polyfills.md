---
title: Eine Node.js-Bibliothek ohne Wasm im Browser zum Laufen bringen -- die
  Polyfills von typescript-virtual-container
description: Wie Fortune node:fs, node:crypto und ein Dutzend weiterer
  Node-Module in 640 Zeilen JavaScript von Hand neu implementiert hat, damit der
  Container ohne Wasm im Browser läuft.
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
author_sig: "aThkbJ9BujreZho/bgG8FdSAsfH7vEQ8WYB4l1uzRAZ7SVoFiDWyTkDt9ZL8/UdOVP9ysDRUXc485ywtG5z5gQ=="
---

# Eine Node.js-Bibliothek ohne Wasm im Browser zum Laufen bringen -- die Polyfills von typescript-virtual-container

Ich habe vor kurzem einiges an Zeit damit verbracht, den Quellcode von [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) zu durchforsten, dem Projekt von [Fortune (Chloé Rolzhausen)](https://itsrealfortune.fr). Und der Teil, der mich am meisten überrascht hat, ist nicht das VFS, nicht das virtuelle Netzwerk, nicht die 170 in TypeScript neu implementierten Unix-Befehle. Es ist der Ordner `polyfills/`.

Weil das Modul im Browser läuft, ohne Wasm, und dafür hat Fortune von Hand die gesamte `node:*`-Schicht neu implementiert, die die Bibliothek braucht. Etwa 640 Zeilen handgemachtes JavaScript, die `node:fs`, `node:crypto`, `node:os`, `node:net` und einige andere ersetzen.

Dieser Artikel erklärt, wie das funktioniert, Polyfill für Polyfill.

---

## Das grundlegende Problem

Eine Node.js-Bibliothek verwendet APIs, die es im Browser nicht gibt. Wenn du `import { readFileSync } from 'node:fs'` schreibst, ist das ein Systemaufruf auf Node-Seite -- ein echter Plattenzugriff via libuv. Im Browser existiert `node:fs` überhaupt nicht.

Die üblichen Lösungen sind:

- **Ein Wasm-Runtime** (wie Emscripten, WASIp1/WASIp2) -- du kompilierst Node.js nach Wasm und führst es aus. Ergebnis: 10-50 MB große Bundles, eine merkliche Ladezeit, eine erhebliche Deployment-Komplexität.
- **Generische Polyfills** (wie `browserify`, `webpack node: polyfills`) -- npm-Bibliotheken, die Annäherungen an jedes Node-Modul bereitstellen. Oft zu schwer, schlecht an den spezifischen Anwendungsfall angepasst.
- **Polyfills von Hand schreiben** -- mehr Arbeit, aber optimales Ergebnis.

Fortune hat sich für die dritte Option entschieden. Und das Ergebnis ist ein Browser-Bundle, das nur aus der Bibliothek besteht, sofort startet und von keiner externen Infrastruktur abhängt.

---

## Die Build-Mechanik

Alles basiert auf esbuild und seiner `alias`-Option. Jeder `node:*`-Import wird auf eine lokale Datei umgeleitet:

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

Die `inject`-Option ist erwähnenswert: Sie erlaubt es, `process.js` und `buffer.js` an den Anfang jeder Datei des Bundles zu injecten, wodurch `process` und `Buffer` global verfügbar sind, ohne jeden expliziten Import. Genau wie Node.js sie nativ bereitstellt.

---

## `buffer.js` -- `Buffer` auf `Uint8Array`

Das ist einer der beiden injizierten Globals. `Buffer` wird im Code massiv genutzt -- jede SSH-Operation, jeder VFS-Snapshot, jedes binäre Lesen/Schreiben läuft darüber.

Die Lösung: eine `BrowserBuffer`-Klasse, die `Uint8Array` erweitert und die gesamte `Buffer`-API von Node.js implementiert.

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
- `toString` mit Unterstützung für hex, base64, utf8
- `copy`, `equals`, `slice`, `subarray`

Das sind 116 Zeilen. Für das, was es ersetzt, ist das bemerkenswert kompakt.

Der Haupttrick ist die Verwendung von `DataView` für Multi-Byte-Zugriffe, was die Endianness korrekt handhabt, ohne dass man für jeden Typ die Bits manuell manipulieren muss:

```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```

---

## `process.js` -- das minimale `process`-Global

Der andere injizierte Global. Winzig, aber notwendig -- der Code testet oft `process.env.NODE_ENV`, `process.platform`, `process.nextTick` usw.

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

Das Mapping `nextTick` → `queueMicrotask` ist das wichtigste Detail hier. `process.nextTick` in Node.js plant einen Callback am Ende der aktuellen Phase der Ereignisschleife, vor I/O. `queueMicrotask` im Browser macht etwas semantisch sehr Ähnliches -- es plant eine Mikrotask, die vor dem nächsten Rendering oder Ereignis ausgeführt wird. Es ist nicht identisch, aber nah genug, dass der gesamte Code, der `nextTick` verwendet, im Browser korrekt funktioniert.

---

## `node:fs` -- IndexedDB als synchrones Dateisystem

Das ist der anspruchsvollste Polyfill und bei weitem der technisch interessanteste.

Das Problem ist knifflig: `node:fs` bietet eine synchrone API (`readFileSync`, `writeFileSync` usw.), aber die Browser-Speicher-APIs sind alle asynchron (IndexedDB, Cache API usw.). Man kann mitten in einer synchronen Funktion kein `await` machen.

Fortune's Lösung: eine zweistufige Cache-Architektur.

**Stufe 1 -- In-Memory-Map (synchron)**  
Alle Lesevorgänge erfolgen aus einer `Map<string, Uint8Array>` im Speicher. Sofortig, synchron, kein API-Problem.

**Stufe 2 -- IndexedDB (asynchron, im Hintergrund)**  
Beim Start wird der gesamte Inhalt von IndexedDB in die Map geladen. Schreibvorgänge erfolgen sofort in die Map *und* starten einen asynchronen Schreibvorgang in IndexedDB, ohne zu blockieren.

```js
const DB_NAME = 'vfs-fs-shim';
const STORE = 'files';
let db = null;

// Sync cache (path → Uint8Array | null)
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

// Async-Schreibvorgang nach IndexedDB (nicht-blockierend)
function idbSet(path, value) {
  openDB().then(db => {
    const tx = db.transaction(STORE, 'readwrite');
    if (value === null) tx.objectStore(STORE).delete(path);
    else tx.objectStore(STORE).put(value, path);
  });
}
```

Die exportierte API ist vollständig: `readFileSync`, `writeFileSync`, `appendFileSync`, `existsSync`, `unlinkSync`, `rmSync` (mit `recursive`-Option), `mkdirSync` (mit `recursive`-Option), `readdirSync`, `statSync`, `renameSync`.

Es gibt sogar eine Schicht zur Verwaltung von Datei-Deskriptoren (`openSync`, `writeSync`, `closeSync`), damit das WAL-Journal des VFS im Browser-Modus funktioniert -- das Journal öffnet einen fd, schreibt hinein, schließt ihn, und die Daten landen in IndexedDB.

Die Eigenschaft `ready` wird exportiert, damit der Code weiß, wann der initiale Preload abgeschlossen ist:

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

Dadurch überleben VFS-Snapshots Seitenneuladungen im Browser. Wenn du die Demo neu lädst, wird der VFS genau in dem Zustand wiederhergestellt, in dem du ihn verlassen hast, aus IndexedDB, ohne Beteiligung eines Servers.

---

## `node:crypto` -- SHA-256, HMAC, PBKDF2 in purem JS

Anstatt eine kompilierte Wasm-Kryptobibliothek zu importieren, hat Fortune die benötigten Primitive direkt implementiert.

**SHA-256** ist von Grund auf mit den FIPS 180-4-Konstanten implementiert:

```js
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, /* ... 60 weitere Konstanten */ 
]);

function sha256(data) {
  // FIPS 180-4 Padding
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

Auf SHA-256 aufbauend sind **HMAC-SHA256** und **PBKDF2-HMAC-SHA256** konstruiert. Diese beiden Primitive werden für die Schlüsselableitung in SSH-Handshakes und der internen Authentifizierung verwendet.

Die exportierte API ähnelt der von Node.js:

```js
// Klassischer Hash
const hash = createHash('sha256').update('data').digest('hex');

// Zufällige Bytes (über die Standard Web Crypto API)
const bytes = randomBytes(32);

// UUID
const id = randomUUID();

// Timing-sicherer Vergleich
const ok = timingSafeEqual(a, b);

// scrypt (angenähert via PBKDF2)
const key = scryptSync(password, salt, 32, { N: 16384 });
```

Anmerkung: `scryptSync` wird über PBKDF2 mit einer Iterationszahl angenähert, die auf den Parameter `N` abgestimmt ist. Das ist kein echtes scrypt (das ein anderes Speicherschema verwendet), aber für die Zwecke des Projekts ist es ausreichend.

Funktionen, die nicht sinnvoll im Browser emuliert werden können (`generateKeyPairSync`, `createCipheriv`, `createDecipheriv`, `createSign`), werfen einen expliziten Fehler, wenn sie aufgerufen werden. Ehrliches Verhalten.

---

## `node:os` -- die echten Browser-Spezifikationen auslesen

Anstatt feste Werte zurückzugeben, liest dieser Polyfill die Browser-APIs aus, um Informationen zurückzugeben, die der tatsächlichen Maschine des Benutzers entsprechen.

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

Konkretes Ergebnis: Wenn du `neofetch` in der Browser-Demo startest, entsprechen die angezeigte Kernzahl und der RAM deiner tatsächlichen Maschine. Es ist ein Detail, aber es trägt enorm zur Glaubwürdigkeit des Terminals bei.

Die anderen Exports: `freemem` (40% des gesamten Arbeitsspeichers, eine vernünftige Annäherung), `platform` → `'browser'`, `type` → `'Linux'`, `release` → `'web'`, `uptime` via `performance.now()`, `endianness` → `'LE'` (Little-Endian, zutreffend auf allen gängigen x86/ARM-Prozessoren), `loadavg` → `[0, 0, 0]`.

---

## `node:net` -- saubere TCP-Stubs

Der Browser hat keinen Zugriff auf rohe TCP-Sockets (WebSocket zählt nicht -- das ist ein anderes Anwendungsprotokoll). `node:net` ist daher ein Stub, aber ein *gut geschriebener* Stub.

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

Der wichtige Punkt: Die Event-Registrierungsmethoden (`on`, `once`, `off`, `emit`) geben `this` zurück und werfen keinen Fehler. Dadurch kann Code, der `new net.Socket().on('connect', cb)` macht, funktionieren, ohne abzustürzen, auch wenn die Verbindung nie zustande kommt. Nur die Methoden, die *tatsächlich versuchen, eine Verbindung herzustellen*, werfen einen Fehler.

`isIP`, `isIPv4`, `isIPv6` sind korrekt implementiert (keine Stubs), da sie vom virtuellen Netzwerkcode zur Validierung von Adressen verwendet werden, ohne jemals einen Socket zu öffnen.

---

## `node:path` -- POSIX-Pfadoperationen

Vollständige Neuimplementierung der POSIX-Pfadoperationen, an den Kontext angepasst (keine Windows-Backslashes, Pfade immer absolut mit `/`).

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

Einfach, kompakt, korrekt für die Verwendungszwecke des Projekts.

---

## `node:url` -- Delegation an Browser-APIs

Dieser ist elegant in seiner Einfachheit. Die `URL`- und `URLSearchParams`-API existiert bereits nativ im Browser -- man muss sie nur re-exportieren.

```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```

Nur `fileURLToPath` und `pathToFileURL` benötigen eine Implementierung, da sie Node-eigen sind:

```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```

Das ist der ideale Ansatz, wenn die Zielplattform (der Browser) bereits das native Äquivalent bereitstellt.

---

## `node:zlib` -- Identität

```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```

Zwei Zeilen. Die Bibliothek verwendet `fflate` für die eigentliche Komprimierung (das nativ im Browser funktioniert). `node:zlib` wird nur in Codepfaden importiert, die im Browser-Kontext nicht ausgeführt werden -- daher reicht ein Passthrough.

Manchmal ist die richtige Implementierung zwei Zeilen lang.

---

## `node:events` -- Minimaler EventEmitter

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

Die vollständige `EventEmitter`-Implementierung von Node.js umfasst ~600 Zeilen mit der Verwaltung von `maxListeners`, `once`, `prependListener` usw. Hier sind es 12 Zeilen für die 4 tatsächlich verwendeten Methoden. Mentaler Tree-Shaking noch vor dem Tree-Shaking des Build-Tools.

---

## `ssh2` und `roxify` -- explizite Stubs

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

Der SSH-Server läuft nicht im Browser (das wäre sinnlos -- wer sollte sich verbinden?). Aber der Code, der *auf der Client-Seite über SSH spricht* -- die Klassen, die SSH-Pakete zusammenbauen, die Protokollparser -- existiert in der Bibliothek. Diese Stubs erlauben es, all diesen Code fehlerfrei zu bündeln, während gleichzeitig sichergestellt ist, dass ein klarer Fehler geworfen wird, wenn jemand versucht, eine Methode aufzurufen, die einen echten Socket benötigt.

`roxify` ist ein proprietäres Komprimierungsformat, das für VFS-Snapshots im Node-Modus verwendet wird. Im Browser wird stattdessen `fflate` verwendet -- der Polyfill wirft lediglich einen Fehler, wenn `roxify` direkt aufgerufen wird.

---

## `node:worker_threads` -- Re-Export der Web Workers

Das ist das Subtilste. `node:worker_threads` in Node.js und die Web Workers des Browsers sind zwei verschiedene APIs, aber sie sind konzeptionell nahe beieinander. Der Polyfill macht das Mapping:

```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```

`MessageChannel` und `MessagePort` werden direkt aus dem Browser re-exportiert (gleiche API). `Worker` selbst benötigt einen Wrapper, da der Konstruktor anders ist (Node erwartet einen Modulpfad, der Browser erwartet eine URL). `isMainThread` ist in diesem Kontext im Browser immer `true`.

---

## Übersicht: Was diese 640 Zeilen darstellen

| Polyfill | Zeilen | Strategie |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array` + `DataView`, gesamte `Buffer`-API |
| `node:crypto` | 166 | SHA-256/HMAC/PBKDF2 from scratch + Web Crypto für Zufallswerte |
| `node:fs` | 210 | `Map` im Speicher + IndexedDB async |
| `node:net` | 70 | Chainable Stubs + echte IP-Validierungen |
| `ssh2` | 74 | Explizite Stubs |
| `process.js` | 14 | Minimal viable `process` |
| `node:path` | ~30 | POSIX-Pfadoperationen |
| `node:url` | ~25 | Delegation an Browser-APIs |
| `node:events` | ~12 | EventEmitter 4 Methoden |
| `node:os` | ~25 | `navigator.deviceMemory` / `hardwareConcurrency` |
| `node:zlib` | 4 | Passthrough |
| `node:worker_threads` | ~30 | Re-Export Web Workers |
| `roxify.js` | 8 | Stubs |

640 Zeilen. Keine npm-Abhängigkeit. Kein Wasm. Und das ergibt ein Browser-Bundle, das in weniger als einer Sekunde startet und ohne jegliche Server-Infrastruktur läuft.

---

## Was man daraus mitnehmen kann

Wenn du das nächste Mal eine Node.js-Bibliothek in den Browser portieren möchtest, zeigt Fortune's Ansatz Folgendes:

1. **Erkenne, was tatsächlich verwendet wird.** Kein Grund, den gesamten `EventEmitter` zu implementieren, wenn der Code nur `on`, `emit` und `removeListener` verwendet.

2. **Delegiere an Browser-APIs, wenn möglich.** `URL`, `URLSearchParams`, `MessageChannel`, `MessagePort`, `crypto.getRandomValues` -- der Browser hat sie bereits, also nutze sie.

3. **Synchroner Cache vor einer async API.** Die Lösung `Map` + IndexedDB für `node:fs` ist das am meisten wiederverwendbare Pattern im gesamten Ordner.

4. **Ehrliche Stubs sind besser als stille unvollständige Implementierungen.** Ein explizites `throw new Error('not implemented in browser')` ist unendlich nützlicher als ein `return undefined`, das den Bug erst 10 Aufrufe später manifestieren lässt.

5. **esbuild `alias` + `inject` ist unterschätzt.** Es ist das perfekte Werkzeug für diese Art von Portierung -- null webpack-Konfiguration, null Plugin, nur eine Liste von Ersetzungen.

---

Der Code ist im Repo: [github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills). Jede Datei passt auf eine einzelne Seite, sie ist direkt auf GitHub lesbar. Sehr empfehlenswert, wenn du an einem ähnlichen Projekt arbeitest.
