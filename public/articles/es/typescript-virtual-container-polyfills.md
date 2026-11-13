---
title: "Hacer correr una librería Node.js en el navegador sin Wasm : los polyfills de typescript-virtual-container"
description: "Cómo Fortune reimplementó a mano node:fs, node:crypto y una docena de módulos Node en 640 líneas de JavaScript para que el contenedor corra en el navegador sin Wasm."
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
author_sig: "5dgRq5VOjlNB4xReKKB7d3zVhXrFUNMAANwy17h434SCUTL/TYt6LCt2h6fbhDX/hd3r07uDgyITWsq7R1z6DQ=="
---

# Hacer correr una librería Node.js en el navegador sin Wasm: los polyfills de typescript-virtual-container

Pasé hace poco bastante tiempo escrutando el código fuente de [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container), el proyecto de [Fortune (Chloé Rolzhausen)](https://itsrealfortune.fr). Y la parte que más me sorprendió es la carpeta `polyfills/`, aún más que el VFS, la red virtual o los 170 comandos Unix reimplementados en TypeScript.

Porque el módulo corre en el navegador, sin Wasm, y para eso, Fortune reimplementó a mano toda la capa `node:*` que la librería necesita. Unas 640 líneas de JavaScript artesanal que reemplazan `node:fs`, `node:crypto`, `node:os`, `node:net`, y algunos otros.

Este artículo explica cómo funciona, polyfill por polyfill.

---

## El problema base

Una librería Node.js usa APIs que no existen en el navegador. Cuando escribes `import { readFileSync } from 'node:fs'`, es una llamada sistema en Node: un verdadero acceso disco vía libuv. En el navegador, `node:fs` no existe en absoluto.

Las soluciones habituales son:

- **Un runtime Wasm** (tipo Emscripten, WASIp1/WASIp2): compilas Node.js en Wasm y lo ejecutas. Resultado: bundles de 10-50 MB, un tiempo de carga notable, una complejidad de despliegue significativa.
- **Polyfills genéricos** (tipo `browserify`, `webpack node: polyfills`): librerías npm que aportan aproximaciones de cada módulo Node. A menudo demasiado pesadas, mal adaptadas al caso específico.
- **Reescribir los polyfills a mano**: más trabajo, pero resultado óptimo.

Fortune eligió la tercera opción. Y el resultado es un bundle navegador que es justo la librería, que arranca al instante, y que no depende de ninguna infraestructura exterior.

---

## La mecánica de build

Todo se apoya en esbuild y su opción `alias`. Cada import `node:*` se redirige hacia un archivo local:

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

La opción `inject` merece notarse: permite inyectar `process.js` y `buffer.js` al inicio de cada archivo del bundle, lo que hace `process` y `Buffer` disponibles globalmente sin ningún import explícito. Exactamente como Node.js los expone nativamente.

---

## `buffer.js`: `Buffer` sobre `Uint8Array`

Es uno de los dos globales inyectados. `Buffer` se usa masivamente en el código: cada operación SSH, cada snapshot VFS, cada lectura/escritura binaria pasa por ahí.

La solución: una clase `BrowserBuffer` que extiende `Uint8Array` e implementa toda la API `Buffer` de Node.js.

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

Lo implementado en total:
- `Buffer.from`, `Buffer.alloc`, `Buffer.allocUnsafe`, `Buffer.isBuffer`, `Buffer.concat`, `Buffer.byteLength`
- Todos los métodos de escritura: `writeUInt8/16/32BE/LE`, `writeInt8/16/32BE/LE`, `writeBigUInt64BE/LE`, `writeFloat/DoubleLE/BE`
- Todos los métodos de lectura correspondientes
- `toString` con soporte hex, base64, utf8
- `copy`, `equals`, `slice`, `subarray`

Eso representa 116 líneas. Para lo que reemplaza, es notablemente compacto.

El truco principal es el uso de `DataView` para los accesos multibyte, lo que gestiona correctamente el endianness sin tener que manipular los bits a mano para cada tipo:

```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```

---

## `process.js`: el global `process` mínimo

El otro global inyectado. Minúsculo pero necesario: el código suele probar `process.env.NODE_ENV`, `process.platform`, `process.nextTick`, etc.

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

El mapeo `nextTick` → `queueMicrotask` es el detalle más importante aquí. `process.nextTick` en Node.js agenda un callback al final de la fase actual del bucle de eventos, antes de las I/O. `queueMicrotask` en el navegador ofrece una semántica muy cercana: agenda una microtarea, que se ejecuta antes del próximo render o evento, y esa cercanía basta para que todo el código que usa `nextTick` funcione correctamente en el browser.

---

## `node:fs`: IndexedDB como sistema de archivos síncrono

Es el polyfill más sofisticado, y de lejos el más interesante técnicamente.

El problema es delicado: `node:fs` expone una API síncrona (`readFileSync`, `writeFileSync`, etc.), pero las APIs de almacenamiento browser son todas asíncronas (IndexedDB, Cache API, etc.). No puedes hacer un `await` en medio de una función síncrona.

La solución de Fortune: un doble nivel de caché.

**Nivel 1: Map en memoria (síncrono)**
Todas las lecturas se hacen desde un `Map<string, Uint8Array>` en memoria. Instantáneo, síncrono, sin problema de API.

**Nivel 2: IndexedDB (asíncrono, en segundo plano)**
Al arrancar, todo el contenido de IndexedDB se carga en el Map. Las escrituras se hacen de inmediato en el Map *y* lanzan una escritura asíncrona hacia IndexedDB sin bloquear.

```js
const DB_NAME = 'vfs-fs-shim';
const STORE = 'files';
let db = null;

// Caché sync (ruta → Uint8Array | null)
const memCache = new Map();

// Precarga al arranque
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

// Escritura async hacia IndexedDB (no bloqueante)
function idbSet(path, value) {
  openDB().then(db => {
    const tx = db.transaction(STORE, 'readwrite');
    if (value === null) tx.objectStore(STORE).delete(path);
    else tx.objectStore(STORE).put(value, path);
  });
}
```

La API expuesta está completa: `readFileSync`, `writeFileSync`, `appendFileSync`, `existsSync`, `unlinkSync`, `rmSync` (con opción `recursive`), `mkdirSync` (con opción `recursive`), `readdirSync`, `statSync`, `renameSync`.

Hasta hay una capa de gestión de file descriptors (`openSync`, `writeSync`, `closeSync`) para que el diario WAL del VFS funcione en modo browser: el diario abre un fd, escribe dentro, lo cierra, y los datos acaban en IndexedDB.

La propiedad `ready` se exporta para permitir al código saber cuándo terminó la precarga inicial:

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

Gracias a eso los snapshots VFS sobreviven a las recargas de página en el navegador. Cuando recargas la demo, el VFS se restaura justo en el estado donde lo habías dejado, desde IndexedDB, sin ningún servidor implicado.

---

## `node:crypto`: SHA-256, HMAC, PBKDF2 en JS puro

En vez de importar una librería crypto compilada en Wasm, Fortune implementó las primitivas necesarias directamente.

**SHA-256** está implementado from scratch con las constantes FIPS 180-4:

```js
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, /* ... 60 otras constantes */
]);

function sha256(data) {
  // padding FIPS 180-4
  const msg = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
  // ...
  // 64 rondas de compresión
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

Encima de SHA-256, **HMAC-SHA256** y **PBKDF2-HMAC-SHA256** están construidos. Esas dos primitivas se usan para la derivación de claves en los intercambios SSH y la autenticación interna.

La API exportada se parece a la de Node.js:

```js
// Hash clásico
const hash = createHash('sha256').update('data').digest('hex');

// Bytes aleatorios (vía la API Web Crypto estándar)
const bytes = randomBytes(32);

// UUID
const id = randomUUID();

// Comparación timing-safe
const ok = timingSafeEqual(a, b);

// scrypt (aproximado vía PBKDF2)
const key = scryptSync(password, salt, 32, { N: 16384 });
```

Nota: `scryptSync` se aproxima vía PBKDF2 con un número de iteraciones calibrado sobre el parámetro `N`. Esa aproximación reemplaza el esquema memoria específico de scrypt y cubre los usos del proyecto.

Las funciones que no pueden emularse razonablemente en el browser (`generateKeyPairSync`, `createCipheriv`, `createDecipheriv`, `createSign`) lanzan un error explícito si se llaman. Comportamiento honesto.

---

## `node:os`: leer las verdaderas specs del navegador

En vez de devolver valores fijos, este polyfill lee las APIs del navegador para devolver información que corresponde a la máquina real del usuario.

```js
export function totalmem() {
  try {
    return navigator?.deviceMemory
      ? navigator.deviceMemory * 1024 * 1024 * 1024
      : 2 * 1024 * 1024 * 1024; // 2 GB por defecto
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

Resultado concreto: cuando lanzas `neofetch` en la demo navegador, el número de núcleos y la RAM mostrados corresponden a tu máquina. Es un detalle, pero contribuye enormemente a la verosimilitud del terminal.

Los demás exports: `freemem` (40% de la memoria total, aproximación razonable), `platform` → `'browser'`, `type` → `'Linux'`, `release` → `'web'`, `uptime` vía `performance.now()`, `endianness` → `'LE'` (little-endian, verdad en todos los procesadores x86/ARM gran público), `loadavg` → `[0, 0, 0]`.

---

## `node:net`: stubs TCP limpios

El navegador no tiene acceso a los sockets TCP en bruto (WebSocket no cuenta: es un protocolo aplicativo distinto). `node:net` es por tanto un stub, pero un stub *bien escrito*.

```js
export class Socket {
  connect() { notImpl('Socket.connect')(); }
  on() { return this; }    // encadenable
  once() { return this; }  // encadenable
  pipe() { return this; }  // encadenable
  setEncoding() { return this; }
  remoteAddress = '127.0.0.1';
  remotePort = 0;
  // ...
}
```

El punto importante: los métodos de registro de eventos (`on`, `once`, `off`, `emit`) devuelven `this` y no lanzan error. Eso permite al código que hace `new net.Socket().on('connect', cb)` funcionar sin petar, aunque la conexión nunca se haga. Solo los métodos que *intentan de verdad conectarse* lanzan un error.

`isIP`, `isIPv4`, `isIPv6` están implementados correctamente (con verdadera lógica de validación) porque los usa el código red virtual para validar direcciones, sin abrir jamás un socket.

---

## `node:path`: POSIX path operations

Reimplementación completa de las operaciones de ruta POSIX, adaptada al contexto (rutas siempre absolutas con `/`, estilo Unix solo).

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

Simple, compacto, correcto para los usos del proyecto.

---

## `node:url`: delegación a las APIs navegador

Esta es elegante por su simplicidad. La API `URL` y `URLSearchParams` ya existe nativamente en el navegador: basta reexportarlas.

```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```

Solo `fileURLToPath` y `pathToFileURL` necesitan una implementación, porque son propias de Node:

```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```

Es el enfoque ideal cuando la plataforma objetivo (el navegador) ya aporta el equivalente nativo.

---

## `node:zlib`: identidad

```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```

Dos líneas. La librería usa `fflate` para la compresión real (que funciona en browser nativamente). `node:zlib` solo se importa en rutas de código que no se ejecutan en el contexto browser: así que un passthrough basta.

A veces la buena implementación son dos líneas.

---

## `node:events`: EventEmitter mínimo

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

La implementación completa de `EventEmitter` de Node.js hace ~600 líneas con la gestión de los `maxListeners`, `once`, `prependListener`, etc. Aquí son 12 líneas para los 4 métodos realmente usados. Tree-shaking mental incluso antes del tree-shaking de la herramienta de build.

---

## `ssh2` y `roxify`: stubs explícitos

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

El servidor SSH no corre en el navegador (no tendría ningún sentido: ¿quién se conectaría?). Pero el código que *habla de SSH en cliente*: las clases que construyen paquetes SSH, los parsers de protocolo, existe en la librería. Esos stubs permiten que todo ese código se bundlee sin error, garantizando que se lanza un error claro si alguien intenta llamar un método que necesita un verdadero socket.

`roxify` es un formato de compresión propietario usado para los snapshots VFS en modo Node. En el navegador, es `fflate` el que se usa en su lugar: el polyfill se contenta con lanzar un error si `roxify` se llama directamente.

---

## `node:worker_threads`: reexport de los Web Workers

Es el más sutil. `node:worker_threads` en Node.js y los Web Workers del navegador son dos APIs distintas, pero conceptualmente cercanas. El polyfill hace el mapeo:

```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```

`MessageChannel` y `MessagePort` se reexportan directamente desde el browser (misma API). `Worker` en sí necesita un wrapper porque el constructor es distinto (Node espera una ruta de módulo, el browser espera una URL). `isMainThread` siempre es `true` en navegador en este contexto.

---

## Vista de conjunto: lo que representan esas 640 líneas

| Polyfill | Líneas | Estrategia |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array` + `DataView`, toda la API `Buffer` |
| `node:crypto` | 166 | SHA-256/HMAC/PBKDF2 from scratch + Web Crypto para los randoms |
| `node:fs` | 210 | `Map` en memoria + IndexedDB async |
| `node:net` | 70 | Stubs encadenables + validaciones IP reales |
| `ssh2` | 74 | Stubs explícitos |
| `process.js` | 14 | `process` mínimo viable |
| `node:path` | ~30 | POSIX path ops |
| `node:url` | ~25 | Delegación a las APIs browser |
| `node:events` | ~12 | EventEmitter 4 métodos |
| `node:os` | ~25 | `navigator.deviceMemory` / `hardwareConcurrency` |
| `node:zlib` | 4 | Passthrough |
| `node:worker_threads` | ~30 | Reexport Web Workers |
| `roxify.js` | 8 | Stubs |

640 líneas. Ninguna dependencia npm. Ningún Wasm. Y eso da un bundle navegador que arranca en menos de un segundo y corre sin ninguna infraestructura en servidor.

---

## Lo que se puede sacar

La próxima vez que quieras llevar una librería Node.js al navegador, esto demuestra el enfoque de Fortune:

1. **Identifica lo realmente usado.** Implementa solo los métodos llamados por el código: aquí `on`, `emit` y `removeListener` bastan para `EventEmitter`.

2. **Delega a las APIs navegador cuando es posible.** `URL`, `URLSearchParams`, `MessageChannel`, `MessagePort`, `crypto.getRandomValues`: el navegador ya los tiene, úsalos.

3. **El caché síncrono ante una API async.** La solución `Map` + IndexedDB para `node:fs` es el patrón más reutilizable de toda la carpeta.

4. **Los stubs honestos valen más que las implementaciones incompletas silenciosas.** Un `throw new Error('not implemented in browser')` explícito es infinitamente más útil que un `return undefined` que deja el bug manifestarse 10 llamadas después.

5. **esbuild `alias` + `inject` está subestimado.** Es la herramienta perfecta para ese tipo de porteo: cero configuración webpack, cero plugin, solo una lista de reemplazos.

---

El código está en el repo: [github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills). Cada archivo cabe en una sola página, se lee directo en GitHub. Muy recomendado si trabajas en un proyecto similar.
