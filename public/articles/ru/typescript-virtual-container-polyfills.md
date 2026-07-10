---
title: Как заставить Node.js библиотеку работать в браузере без Wasm --
  полифиллы typescript-virtual-container
description: Как Fortune вручную переписала node:fs, node:crypto и дюжину других
  Node-модулей в 640 строках JavaScript, чтобы контейнер работал в браузере без
  Wasm.
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
author_sig: "R71+gfy0Dl4RSWIqFy5SP9Cy22S91mDfLWaEIEjaf9miczSPfuCA0grj3FNYuG3cws5fFyzQe8/la6WmPGSbCQ=="
---

# Как заставить Node.js библиотеку работать в браузере без Wasm -- полифиллы typescript-virtual-container

Я недавно потратил немало времени, изучая исходный код [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container), проект [Fortune (Chloé Rolzhausen)](https://itsrealfortune.fr). И часть, которая удивила меня больше всего -- это не VFS, не виртуальная сеть, не 170 команд Unix, переписанных на TypeScript. Это папка `polyfills/`.

Потому что модуль работает в браузере, без Wasm, и для этого Fortune вручную переписала весь слой `node:*`, который нужен библиотеке. Около 640 строк ручного JavaScript, заменяющих `node:fs`, `node:crypto`, `node:os`, `node:net` и некоторые другие.

Эта статья объясняет, как это работает, полифилл за полифиллом.

---

## Основная проблема

Node.js библиотека использует API, которых нет в браузере. Когда ты пишешь `import { readFileSync } from 'node:fs'`, это системный вызов на стороне Node -- настоящий доступ к диску через libuv. В браузере `node:fs` вообще не существует.

Обычные решения:

- **Wasm-рантайм** (вроде Emscripten, WASIp1/WASIp2) -- ты компилируешь Node.js в Wasm и запускаешь его. Результат: бандлы по 10-50 МБ, заметное время загрузки, значительная сложность развёртывания.
- **Универсальные полифиллы** (вроде `browserify`, `webpack node: polyfills`) -- npm-библиотеки, предоставляющие приближения каждого Node-модуля. Часто слишком тяжёлые, плохо подходят под конкретный случай.
- **Написать полифиллы вручную** -- больше работы, но оптимальный результат.

Fortune выбрала третий вариант. И результат -- это браузерный бандл, который представляет собой просто библиотеку, запускается мгновенно и не зависит ни от какой внешней инфраструктуры.

---

## Механика сборки

Всё строится вокруг esbuild и его опции `alias`. Каждый импорт `node:*` перенаправляется на локальный файл:

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

Опция `inject` заслуживает внимания: она позволяет внедрить `process.js` и `buffer.js` в начало каждого файла бандла, делая `process` и `Buffer` глобально доступными без явного импорта. Именно так Node.js предоставляет их нативно.

---

## `buffer.js` -- `Buffer` на основе `Uint8Array`

Это один из двух глобально внедряемых файлов. `Buffer` массово используется в коде -- каждая SSH-операция, каждый VFS-снэпшот, каждое чтение/запись бинарных данных проходят через него.

Решение: класс `BrowserBuffer`, расширяющий `Uint8Array` и реализующий всё API `Buffer` из Node.js.

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

Что реализовано в сумме:
- `Buffer.from`, `Buffer.alloc`, `Buffer.allocUnsafe`, `Buffer.isBuffer`, `Buffer.concat`, `Buffer.byteLength`
- Все методы записи: `writeUInt8/16/32BE/LE`, `writeInt8/16/32BE/LE`, `writeBigUInt64BE/LE`, `writeFloat/DoubleLE/BE`
- Все соответствующие методы чтения
- `toString` с поддержкой hex, base64, utf8
- `copy`, `equals`, `slice`, `subarray`

Это 116 строк. Для того, что они заменяют, это поразительно компактно.

Главный трюк -- использование `DataView` для многобайтового доступа, который корректно обрабатывает порядок байтов без необходимости ручной работы с битами для каждого типа:

```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```

---

## `process.js` -- минимальный глобальный `process`

Другой глобально внедряемый файл. Крошечный, но необходимый -- код часто проверяет `process.env.NODE_ENV`, `process.platform`, `process.nextTick` и т.д.

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

Сопоставление `nextTick` → `queueMicrotask` -- самая важная деталь. `process.nextTick` в Node.js планирует callback в конце текущей фазы цикла событий, перед I/O. `queueMicrotask` в браузере делает нечто семантически очень близкое -- он планирует микротаску, которая выполняется перед следующим рендером или событием. Это не идентично, но достаточно близко, чтобы весь код, использующий `nextTick`, работал корректно в браузере.

---

## `node:fs` -- IndexedDB как синхронная файловая система

Это самый сложный полифилл и, безусловно, самый интересный с технической точки зрения.

Проблема деликатная: `node:fs` предоставляет синхронное API (`readFileSync`, `writeFileSync` и т.д.), но все браузерные API для хранения -- асинхронные (IndexedDB, Cache API и т.д.). Нельзя сделать `await` посреди синхронной функции.

Решение Fortune: двойной уровень кэша.

**Уровень 1 -- Map в памяти (синхронный)**  
Все чтения выполняются из `Map<string, Uint8Array>` в памяти. Мгновенно, синхронно, никаких проблем с API.

**Уровень 2 -- IndexedDB (асинхронный, фоновый)**  
При запуске всё содержимое IndexedDB загружается в Map. Записи немедленно попадают в Map *и* запускают асинхронную запись в IndexedDB без блокировки.

```js
const DB_NAME = 'vfs-fs-shim';
const STORE = 'files';
let db = null;

// Sync cache (path → Uint8Array | null)
const memCache = new Map();

// Preload au démarrage
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

Предоставляемое API полноценно: `readFileSync`, `writeFileSync`, `appendFileSync`, `existsSync`, `unlinkSync`, `rmSync` (с опцией `recursive`), `mkdirSync` (с опцией `recursive`), `readdirSync`, `statSync`, `renameSync`.

Есть даже слой управления файловыми дескрипторами (`openSync`, `writeSync`, `closeSync`), чтобы WAL-журнал VFS работал в браузерном режиме -- журнал открывает fd, пишет в него, закрывает его, и данные оказываются в IndexedDB.

Свойство `ready` экспортируется, чтобы код мог узнать, когда завершена начальная загрузка:

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

Именно благодаря этому VFS-снэпшоты переживают перезагрузки страницы в браузере. Когда ты перезагружаешь демо, VFS восстанавливается точно в том состоянии, в котором ты его оставил, из IndexedDB, без какого-либо сервера.

---

## `node:crypto` -- SHA-256, HMAC, PBKDF2 на чистом JS

Вместо того чтобы импортировать криптобиблиотеку, скомпилированную в Wasm, Fortune реализовала необходимые примитивы напрямую.

**SHA-256** реализован с нуля, с константами FIPS 180-4:

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

Поверх SHA-256 построены **HMAC-SHA256** и **PBKDF2-HMAC-SHA256**. Эти два примитива используются для вывода ключей в SSH-обменах и внутренней аутентификации.

Экспортируемое API напоминает API Node.js:

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

Примечание: `scryptSync` аппроксимирован через PBKDF2 с числом итераций, привязанным к параметру `N`. Это не настоящий scrypt (использующий другую схему памяти), но для нужд проекта этого достаточно.

Функции, которые невозможно разумно эмулировать в браузере (`generateKeyPairSync`, `createCipheriv`, `createDecipheriv`, `createSign`), при вызове выбрасывают явную ошибку. Честное поведение.

---

## `node:os` -- чтение реальных характеристик браузера

Вместо возврата фиксированных значений этот полифилл читает браузерные API, чтобы возвращать информацию, соответствующую реальной машине пользователя.

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

Конкретный результат: когда ты запускаешь `neofetch` в браузерном демо, отображаемые количество ядер и RAM соответствуют твоей машине. Это деталь, но она огромна для правдоподобия терминала.

Остальные экспорты: `freemem` (40% от общей памяти, разумная аппроксимация), `platform` → `'browser'`, `type` → `'Linux'`, `release` → `'web'`, `uptime` через `performance.now()`, `endianness` → `'LE'` (little-endian, верно для всех массовых x86/ARM процессоров), `loadavg` → `[0, 0, 0]`.

---

## `node:net` -- чистые заглушки TCP

У браузера нет доступа к сырым TCP-сокетам (WebSocket не в счёт -- это другой протокол прикладного уровня). Поэтому `node:net` -- заглушка, но *хорошо написанная* заглушка.

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

Важный момент: методы регистрации событий (`on`, `once`, `off`, `emit`) возвращают `this` и не выбрасывают ошибку. Это позволяет коду, делающему `new net.Socket().on('connect', cb)`, работать без падения, даже если соединение никогда не устанавливается. Только методы, которые *действительно пытаются подключиться*, выбрасывают ошибку.

`isIP`, `isIPv4`, `isIPv6` реализованы корректно (не заглушки), потому что они используются виртуальным сетевым кодом для валидации адресов, никогда не открывая сокет.

---

## `node:path` -- операции с POSIX-путями

Полная переработка операций с POSIX-путями, адаптированная под контекст (без обратной косой черты Windows, пути всегда абсолютные с `/`).

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

Просто, компактно, корректно для нужд проекта.

---

## `node:url` -- делегирование браузерным API

Этот элегантен своей простотой. API `URL` и `URLSearchParams` уже существует нативно в браузере -- достаточно их реэкспортировать.

```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```

Только `fileURLToPath` и `pathToFileURL` требуют реализации, поскольку они специфичны для Node:

```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```

Это идеальный подход, когда целевая платформа (браузер) уже предоставляет нативный эквивалент.

---

## `node:zlib` -- идентичность

```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```

Две строки. Библиотека использует `fflate` для настоящего сжатия (который работает в браузере нативно). `node:zlib` импортируется только в тех путях кода, которые не выполняются в браузерном контексте -- поэтому сквозного пропускания достаточно.

Иногда правильная реализация -- это две строки.

---

## `node:events` -- минимальный EventEmitter

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

Полная реализация `EventEmitter` из Node.js составляет ~600 строк с обработкой `maxListeners`, `once`, `prependListener` и т.д. Здесь 12 строк для 4 методов, которые реально используются. Мысленный tree-shaking до того, как за него взялся инструмент сборки.

---

## `ssh2` и `roxify` -- явные заглушки

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

SSH-сервер не работает в браузере (в этом не было бы смысла -- кто бы подключался?). Но код, который *говорит о SSH на стороне клиента* -- классы, собирающие SSH-пакеты, парсеры протокола -- присутствует в библиотеке. Эти заглушки позволяют всему этому коду быть собранным без ошибок, гарантируя при этом, что при попытке вызвать метод, требующий настоящий сокет, будет выброшена понятная ошибка.

`roxify` -- проприетарный формат сжатия, используемый для VFS-снэпшотов в Node-режиме. В браузере вместо него используется `fflate` -- полифилл просто выбрасывает ошибку, если `roxify` вызывается напрямую.

---

## `node:worker_threads` -- реэкспорт Web Workers

Это самый тонкий момент. `node:worker_threads` в Node.js и Web Workers в браузере -- это разные API, но они концептуально близки. Полифилл делает сопоставление:

```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```

`MessageChannel` и `MessagePort` реэкспортируются напрямую из браузера (то же API). `Worker` сам требует обёртки, потому что конструкторы различаются (Node ожидает путь к модулю, браузер ожидает URL). `isMainThread` всегда `true` на стороне браузера в этом контексте.

---

## Обзор: что представляют собой эти 640 строк

| Полифилл | Строк | Стратегия |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array` + `DataView`, весь API `Buffer` |
| `node:crypto` | 166 | SHA-256/HMAC/PBKDF2 с нуля + Web Crypto для randoms |
| `node:fs` | 210 | `Map` в памяти + асинхронная IndexedDB |
| `node:net` | 70 | Цепочные заглушки + реальная IP-валидация |
| `ssh2` | 74 | Явные заглушки |
| `process.js` | 14 | Минимальный жизнеспособный `process` |
| `node:path` | ~30 | Операции с POSIX-путями |
| `node:url` | ~25 | Делегирование браузерным API |
| `node:events` | ~12 | EventEmitter 4 метода |
| `node:os` | ~25 | `navigator.deviceMemory` / `hardwareConcurrency` |
| `node:zlib` | 4 | Сквозное пропускание |
| `node:worker_threads` | ~30 | Реэкспорт Web Workers |
| `roxify.js` | 8 | Заглушки |

640 строк. Никаких npm-зависимостей. Никакого Wasm. И это даёт браузерный бандл, который запускается меньше чем за секунду и работает без какой-либо серверной инфраструктуры.

---

## Что можно из этого вынести

В следующий раз, когда ты захочешь портировать Node.js библиотеку в браузер, вот что демонстрирует подход Fortune:

1. **Определи, что действительно используется.** Нет нужды реализовывать весь `EventEmitter`, если код использует только `on`, `emit` и `removeListener`.

2. **Делегируй браузерным API, когда возможно.** `URL`, `URLSearchParams`, `MessageChannel`, `MessagePort`, `crypto.getRandomValues` -- в браузере они уже есть, стоит их использовать.

3. **Синхронный кэш перед асинхронным API.** Решение `Map` + IndexedDB для `node:fs` -- самый переиспользуемый паттерн во всей папке.

4. **Честные заглушки лучше молчаливых неполных реализаций.** Явный `throw new Error('not implemented in browser')` бесконечно полезнее, чем `return undefined`, который позволит багу проявиться 10 вызовов спустя.

5. **esbuild `alias` + `inject` недооценён.** Это идеальный инструмент для такого рода портирования -- ноль конфигурации webpack, ноль плагинов, просто список замен.

---

Код в репозитории: [github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills). Каждый файл умещается на одну страницу, это читабельно прямо на GitHub. Крайне рекомендую, если ты работаешь над похожим проектом.
