---
title: Hacer funcionar una biblioteca Node.js en el navegador sin Wasm -- los
  polyfills de typescript-virtual-container
description: Cómo Fortune reimplementó a mano node:fs, node:crypto y una docena
  de módulos Node más en 640 líneas de JavaScript para que el contenedor
  funcione en el navegador sin Wasm.
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
author_sig: "7G8jwnN1/9i1bro1H7LdIksPAqAo71vxmS6PdRZ2ECIAQCOHAlVXdxTbIz7XcbdwZ015e0pX9TYvx23F0BXqbA=="
---

# Hacer funcionar una biblioteca Node.js en el navegador sin Wasm -- los polyfills de typescript-virtual-container

Recientemente pasé bastante tiempo analizando el código fuente de [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container), el proyecto de [Fortune (Chloé Rolzhausen)](https://itsrealfortune.fr). Y la parte que más me sorprendió no es el VFS, no es la red virtual, no son los 170 comandos Unix reimplementados en TypeScript. Es la carpeta `polyfills/`.

Porque el módulo se ejecuta en el navegador, sin Wasm, y para eso Fortune reimplementó a mano toda la capa `node:*` que la biblioteca necesita. Unas 640 líneas de JavaScript artesanal que reemplazan `node:fs`, `node:crypto`, `node:os`, `node:net` y algunos más.

Este artículo explica cómo funciona, polyfill por polyfill.

---

## El problema de base

Una biblioteca Node.js usa APIs que no existen en el navegador. Cuando escribes `import { readFileSync } from 'node:fs'`, es una llamada al sistema del lado de Node -- un acceso real a disco vía libuv. En el navegador, `node:fs` no existe en absoluto.

Las soluciones habituales son:

- **Un runtime Wasm** (tipo Emscripten, WASIp1/WASIp2) -- compilas Node.js en Wasm y lo ejecutas. Resultado: bundles de 10-50 MB, un tiempo de carga notable, una complejidad de despliegue significativa.
- **Polyfills genéricos** (tipo `browserify`, `webpack node: polyfills`) -- bibliotecas npm que proporcionan aproximaciones de cada módulo Node. A menudo demasiado pesadas, mal adaptadas al caso específico.
- **Reescribir los polyfills a mano** -- más trabajo, pero resultado óptimo.

Fortune eligió la tercera opción. Y el resultado es un bundle para navegador que es solo la biblioteca, que arranca instantáneamente y que no depende de ninguna infraestructura externa.

---

## La mecánica de build

Todo se basa en esbuild y su opción `alias`. Cada import `node:*` se redirige a un archivo local:

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

La opción `inject` merece atención: permite inyectar `process.js` y `buffer.js` al inicio de cada archivo del bundle, haciendo que `process` y `Buffer` estén disponibles globalmente sin ningún import explícito. Exactamente como Node.js los expone de forma nativa.

---

## `buffer.js` -- `Buffer` sobre `Uint8Array`

Es uno de los dos globales inyectados. `Buffer` se usa masivamente en el código -- cada operación SSH, cada snapshot VFS, cada lectura/escritura binaria pasa por ahí.

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

Lo que está implementado en total:
- `Buffer.from`, `Buffer.alloc`, `Buffer.allocUnsafe`, `Buffer.isBuffer`, `Buffer.concat`, `Buffer.byteLength`
- Todos los métodos de escritura: `writeUInt8/16/32BE/LE`, `writeInt8/16/32BE/LE`, `writeBigUInt64BE/LE`, `writeFloat/DoubleLE/BE`
- Todos los métodos de lectura correspondientes
- `toString` con soporte hex, base64, utf8
- `copy`, `equals`, `slice`, `subarray`

Son 116 líneas. Para lo que reemplaza, es notablemente compacto.

El truco principal es el uso de `DataView` para los accesos multi-byte, que maneja correctamente el endianness sin tener que manipular los bits a mano para cada tipo:

```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```

---

## `process.js` -- el global `process` mínimo

El otro global inyectado. Diminuto pero necesario -- el código a menudo verifica `process.env.NODE_ENV`, `process.platform`, `process.nextTick`, etc.

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

El mapeo `nextTick` → `queueMicrotask` es el detalle más importante aquí. `process.nextTick` en Node.js programa un callback al final de la fase actual del bucle de eventos, antes de los I/O. `queueMicrotask` en el navegador hace algo semánticamente muy cercano -- programa una microtarea, que se ejecuta antes del próximo renderizado o evento. No es idéntico, pero es suficientemente cercano para que todo el código que usa `nextTick` funcione correctamente en el navegador.

---

## `node:fs` -- IndexedDB como sistema de archivos síncrono

Este es el polyfill más sofisticado, y de lejos el más interesante técnicamente.

El problema es delicado: `node:fs` expone una API síncrona (`readFileSync`, `writeFileSync`, etc.), pero las APIs de almacenamiento del navegador son todas asíncronas (IndexedDB, Cache API, etc.). No se puede hacer un `await` en medio de una función síncrona.

La solución de Fortune: un doble nivel de caché.

**Nivel 1 -- Map en memoria (síncrono)**  
Todas las lecturas se hacen desde un `Map<string, Uint8Array>` en memoria. Instantáneo, síncrono, sin problema de API.

**Nivel 2 -- IndexedDB (asíncrono, en segundo plano)**  
Al inicio, todo el contenido de IndexedDB se carga en el Map. Las escrituras se hacen inmediatamente en el Map *y* lanzan una escritura asíncrona hacia IndexedDB sin bloquear.

```js
const DB_NAME = 'vfs-fs-shim';
const STORE = 'files';
let db = null;

// Sync cache (path → Uint8Array | null)
const memCache = new Map();

// Preload al inicio
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

La API expuesta es completa: `readFileSync`, `writeFileSync`, `appendFileSync`, `existsSync`, `unlinkSync`, `rmSync` (con opción `recursive`), `mkdirSync` (con opción `recursive`), `readdirSync`, `statSync`, `renameSync`.

Incluso hay una capa de gestión de file descriptors (`openSync`, `writeSync`, `closeSync`) para que el journal WAL del VFS funcione en modo navegador -- el journal abre un fd, escribe en él, lo cierra, y los datos terminan en IndexedDB.

La propiedad `ready` se exporta para permitir que el código sepa cuándo ha terminado la precarga inicial:

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

Gracias a esto, los snapshots VFS sobreviven a las recargas de página en el navegador. Cuando recargas la demo, el VFS se restaura exactamente en el estado en que lo dejaste, desde IndexedDB, sin ningún servidor involucrado.

---

## `node:crypto` -- SHA-256, HMAC, PBKDF2 en JS puro

En lugar de importar una biblioteca crypto compilada en Wasm, Fortune implementó las primitivas necesarias directamente.

**SHA-256** está implementado from scratch con las constantes FIPS 180-4:

```js
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, /* ... 60 constantes más */ 
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

Sobre SHA-256, se construyen **HMAC-SHA256** y **PBKDF2-HMAC-SHA256**. Estas dos primitivas se usan para la derivación de claves en los intercambios SSH y la autenticación interna.

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

Nota: `scryptSync` se aproxima vía PBKDF2 con un número de iteraciones ajustado al parámetro `N`. No es un scrypt real (que usa un esquema de memoria diferente), pero para los usos del proyecto es suficiente.

Las funciones que no pueden emularse razonablemente en el navegador (`generateKeyPairSync`, `createCipheriv`, `createDecipheriv`, `createSign`) lanzan un error explícito si se llaman. Comportamiento honesto.

---

## `node:os` -- leer las specs reales del navegador

En lugar de devolver valores fijos, este polyfill lee las APIs del navegador para devolver información que corresponde a la máquina real del usuario.

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

Resultado concreto: cuando lanzas `neofetch` en la demo del navegador, el número de núcleos y la RAM mostrados corresponden a tu máquina. Es un detalle, pero contribuye enormemente a la verosimilitud del terminal.

Los otros exports: `freemem` (40% de la memoria total, aproximación razonable), `platform` → `'browser'`, `type` → `'Linux'`, `release` → `'web'`, `uptime` vía `performance.now()`, `endianness` → `'LE'` (little-endian, cierto en todos los procesadores x86/ARM de consumo), `loadavg` → `[0, 0, 0]`.

---

## `node:net` -- stubs TCP limpios

El navegador no tiene acceso a sockets TCP brutos (WebSocket no cuenta -- es un protocolo de aplicación diferente). `node:net` es por tanto un stub, pero un stub *bien escrito*.

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

El punto importante: los métodos de registro de eventos (`on`, `once`, `off`, `emit`) devuelven `this` y no lanzan error. Esto permite que el código que hace `new net.Socket().on('connect', cb)` funcione sin fallar, incluso si la conexión nunca se realiza. Solo los métodos que *realmente intentan conectarse* lanzan un error.

`isIP`, `isIPv4`, `isIPv6` están implementados correctamente (no son stubs) porque los usa el código de red virtual para validar direcciones, sin abrir nunca un socket.

---

## `node:path` -- operaciones de ruta POSIX

Reimplementación completa de las operaciones de ruta POSIX, adaptada al contexto (sin backslash Windows, rutas siempre absolutas con `/`).

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

## `node:url` -- delegación a las APIs del navegador

Esta es elegante por su simplicidad. La API `URL` y `URLSearchParams` ya existe de forma nativa en el navegador -- solo hay que re-exportarlas.

```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```

Solo `fileURLToPath` y `pathToFileURL` necesitan implementación, porque son propias de Node:

```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```

Es el enfoque ideal cuando la plataforma objetivo (el navegador) ya proporciona el equivalente nativo.

---

## `node:zlib` -- identidad

```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```

Dos líneas. La biblioteca usa `fflate` para la compresión real (que funciona en el navegador de forma nativa). `node:zlib` solo se importa en caminos de código que no se ejecutan en el contexto del navegador -- por lo tanto un passthrough es suficiente.

A veces la buena implementación son dos líneas.

---

## `node:events` -- EventEmitter mínimo

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

La implementación completa de `EventEmitter` de Node.js tiene ~600 líneas con la gestión de `maxListeners`, `once`, `prependListener`, etc. Aquí son 12 líneas para los 4 métodos realmente usados. Tree-shaking mental antes incluso del tree-shaking de la herramienta de build.

---

## `ssh2` y `roxify` -- stubs explícitos

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

El servidor SSH no se ejecuta en el navegador (no tendría sentido -- ¿quién se conectaría?). Pero el código que *habla de SSH del lado cliente* -- las clases que construyen paquetes SSH, los analizadores de protocolo -- existe en la biblioteca. Estos stubs permiten que todo ese código se bundlee sin error, garantizando al mismo tiempo que se lanza un error claro si alguien intenta llamar a un método que requiere un socket real.

`roxify` es un formato de compresión propietario usado para los snapshots VFS en modo Node. En el navegador, se usa `fflate` en su lugar -- el polyfill se limita a lanzar un error si se llama a `roxify` directamente.

---

## `node:worker_threads` -- re-exportación de Web Workers

Este es el más sutil. `node:worker_threads` en Node.js y los Web Workers del navegador son dos APIs diferentes, pero conceptualmente cercanas. El polyfill hace el mapeo:

```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```

`MessageChannel` y `MessagePort` se re-exportan directamente desde el navegador (misma API). `Worker` en sí mismo necesita un wrapper porque el constructor es diferente (Node espera una ruta de módulo, el navegador espera una URL). `isMainThread` es siempre `true` en el lado del navegador en este contexto.

---

## Vista general: qué representan estas 640 líneas

| Polyfill | Líneas | Estrategia |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array` + `DataView`, toda la API `Buffer` |
| `node:crypto` | 166 | SHA-256/HMAC/PBKDF2 from scratch + Web Crypto para los randoms |
| `node:fs` | 210 | `Map` en memoria + IndexedDB async |
| `node:net` | 70 | Stubs encadenables + validaciones IP reales |
| `ssh2` | 74 | Stubs explícitos |
| `process.js` | 14 | Mínimo viable `process` |
| `node:path` | ~30 | Operaciones de ruta POSIX |
| `node:url` | ~25 | Delegación a APIs del navegador |
| `node:events` | ~12 | EventEmitter 4 métodos |
| `node:os` | ~25 | `navigator.deviceMemory` / `hardwareConcurrency` |
| `node:zlib` | 4 | Passthrough |
| `node:worker_threads` | ~30 | Re-exportación Web Workers |
| `roxify.js` | 8 | Stubs |

640 líneas. Ninguna dependencia npm. Ningún Wasm. Y da como resultado un bundle para navegador que arranca en menos de un segundo y se ejecuta sin ninguna infraestructura del lado del servidor.

---

## Qué podemos aprender de esto

La próxima vez que quieras portar una biblioteca Node.js al navegador, esto es lo que demuestra el enfoque de Fortune:

1. **Identifica lo que realmente se usa.** No hace falta implementar `EventEmitter` entero si el código solo usa `on`, `emit` y `removeListener`.

2. **Delega en las APIs del navegador cuando sea posible.** `URL`, `URLSearchParams`, `MessageChannel`, `MessagePort`, `crypto.getRandomValues` -- el navegador ya las tiene, mejor usarlas.

3. **Caché síncrono delante de una API async.** La solución `Map` + IndexedDB para `node:fs` es el patrón más reutilizable de toda la carpeta.

4. **Los stubs honestos valen más que las implementaciones incompletas silenciosas.** Un `throw new Error('not implemented in browser')` explícito es infinitamente más útil que un `return undefined` que deja que el bug se manifieste 10 llamadas más adelante.

5. **esbuild `alias` + `inject` está infravalorado.** Es la herramienta perfecta para este tipo de portabilidad -- cero configuración webpack, cero plugins, solo una lista de reemplazos.

---

El código está en el repo: [github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills). Cada archivo cabe en una sola página, se puede leer directamente en GitHub. Muy recomendado si trabajas en un proyecto similar.
