---
title: Запустить библиотеку Node.js в браузере без Wasm --
  полифиллы typescript-virtual-container
description: Как Fortune вручную реимплементировала node:fs, node:crypto и
  дюжину модулей Node в 640 строках JavaScript, чтобы контейнер крутился
  в браузере без Wasm.
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
author_sig: "xOnrlPr/GbGBGpKR7Uj0/wAZtWR3AZI+XCkwcvMRCa2zIKM5hL+p9eO9r4M5T7pr1uxZCfSRK/qMUJbqp1yi9w=="
---

# Запустить библиотеку Node.js в браузере без Wasm -- полифиллы typescript-virtual-container

Я недавно провёл немало времени, разбирая исходник [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container), проекта [Fortune (Chloé Rolzhausen)](https://itsrealfortune.fr). А часть, удивившая меня сильнее всего, это папка `polyfills/`, даже сильнее VFS, виртуальной сети или 170 Unix-команд, реимплементированных на TypeScript.

Потому что модуль крутится в браузере, без Wasm, и для этого Fortune вручную реимплементировала весь слой `node:*`, нужный библиотеке. Около 640 строк кустарного JavaScript, заменяющих `node:fs`, `node:crypto`, `node:os`, `node:net` и несколько других.

Эта статья объясняет, как это работает, полифилл за полифиллом.

---

## Базовая проблема

Библиотека Node.js использует API, которых нет в браузере. Когда пишешь `import { readFileSync } from 'node:fs'`, это системный вызов на стороне Node -- настоящий доступ к диску через libuv. В браузере `node:fs` вообще нет.

Обычные решения такие :

- **Wasm-рантайм** (типа Emscripten, WASIp1/WASIp2) -- компилируешь Node.js в Wasm и исполняешь. Итог : бандлы на 10-50 MB, заметное время загрузки, значительная сложность деплоя.
- **Общие полифиллы** (типа `browserify`, `webpack node: polyfills`) -- npm-библиотеки, дающие аппроксимации каждого модуля Node. Часто слишком тяжёлые, плохо подходящие конкретному случаю.
- **Переписать полифиллы вручную** -- больше работы, но оптимальный результат.

Fortune выбрала третий вариант. А итог это браузерный бандл, являющийся просто библиотекой, стартующий мгновенно и не зависящий ни от какой внешней инфраструктуры.

---

## Механика сборки

Всё опирается на esbuild и его опцию `alias`. Каждый импорт `node:*` перенаправляется на локальный файл :

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

Опция `inject` заслуживает отметки : она позволяет впрыскивать `process.js` и `buffer.js` в голову каждого файла бандла, что делает `process` и `Buffer` доступными глобально безо всякого явного импорта. Ровно как Node.js выставляет их нативно.

---

## `buffer.js` -- `Buffer` поверх `Uint8Array`

Это один из двух впрыскиваемых глобалов. `Buffer` массированно используется в коде -- каждая SSH-операция, каждый снапшот VFS, каждое бинарное чтение/запись идёт через него.

Решение : класс `BrowserBuffer`, расширяющий `Uint8Array` и реализующий весь API `Buffer` из Node.js.

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

Что реализовано итого :
- `Buffer.from`, `Buffer.alloc`, `Buffer.allocUnsafe`, `Buffer.isBuffer`, `Buffer.concat`, `Buffer.byteLength`
- Все методы записи : `writeUInt8/16/32BE/LE`, `writeInt8/16/32BE/LE`, `writeBigUInt64BE/LE`, `writeFloat/DoubleLE/BE`
- Все соответствующие методы чтения
- `toString` с поддержкой hex, base64, utf8
- `copy`, `equals`, `slice`, `subarray`

Это 116 строк. На то, что заменяет, замечательно компактно.

Главный трюк это использование `DataView` для многобайтовых доступов, корректно рулящего endianness без ручной манипуляции битами под каждый тип :

```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```

---

## `process.js` -- минимальный глобал `process`

Другой впрыскиваемый глобал. Крошечный, но нужный -- код часто проверяет `process.env.NODE_ENV`, `process.platform`, `process.nextTick` и т.д.

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

Маппинг `nextTick` → `queueMicrotask` здесь важнейшая деталь. `process.nextTick` в Node.js шедулит колбэк на конец текущей фазы event loop, до I/O. `queueMicrotask` в браузере даёт очень близкую семантику : он шедулит микрозадачу, исполняющуюся до следующего рендера или события, и этой близости достаточно, чтобы весь код, использующий `nextTick`, корректно работал в браузере.

---

## `node:fs` -- IndexedDB как синхронная файловая система

Это самый утончённый полифилл и с отрывом технически интереснейший.

Проблема деликатна : `node:fs` выставляет синхронный API (`readFileSync`, `writeFileSync` и т.д.), а браузерные API хранения все асинхронны (IndexedDB, Cache API и т.д.). Нельзя сделать `await` посреди синхронной функции.

Решение Fortune : двухуровневый кэш.

**Уровень 1 -- Map в памяти (синхронно)**
Все чтения идут из `Map<string, Uint8Array>` в памяти. Мгновенно, синхронно, без проблем API.

**Уровень 2 -- IndexedDB (асинхронно, в фоне)**
На старте всё содержимое IndexedDB грузится в Map. Записи идут сразу в Map *и* запускают асинхронную запись в IndexedDB без блокировки.

```js
const DB_NAME = 'vfs-fs-shim';
const STORE = 'files';
let db = null;

// Синхронный кэш (path → Uint8Array | null)
const memCache = new Map();

// Предзагрузка на старте
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

// Асинхронная запись в IndexedDB (неблокирующая)
function idbSet(path, value) {
  openDB().then(db => {
    const tx = db.transaction(STORE, 'readwrite');
    if (value === null) tx.objectStore(STORE).delete(path);
    else tx.objectStore(STORE).put(value, path);
  });
}
```

Выставленный API полон : `readFileSync`, `writeFileSync`, `appendFileSync`, `existsSync`, `unlinkSync`, `rmSync` (с опцией `recursive`), `mkdirSync` (с опцией `recursive`), `readdirSync`, `statSync`, `renameSync`.

Есть даже слой управления file descriptor (`openSync`, `writeSync`, `closeSync`), чтобы журнал WAL у VFS работал в браузерном режиме -- журнал открывает fd, пишет туда, закрывает, и данные оказываются в IndexedDB.

Свойство `ready` экспортируется, чтобы код знал, когда начальная предзагрузка завершена :

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

Благодаря этому снапшоты VFS переживают перезагрузки страницы в браузере. Когда перезагружаешь демо, VFS восстанавливается ровно в оставленном состоянии из IndexedDB безо всякого задействованного сервера.

---

## `node:crypto` -- SHA-256, HMAC, PBKDF2 на чистом JS

Вместо импорта скомпилированной в Wasm криптобиблиотеки Fortune реализовала нужные примитивы напрямую.

**SHA-256** реализован с нуля с константами FIPS 180-4 :

```js
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, /* ... ещё 60 констант */
]);

function sha256(data) {
  // паддинг FIPS 180-4
  const msg = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
  // ...
  // 64 раунда компрессии
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

Экспортированный API похож на нодовский :

```js
// Классический хэш
const hash = createHash('sha256').update('data').digest('hex');

// Случайные байты (через стандартный Web Crypto API)
const bytes = randomBytes(32);

// UUID
const id = randomUUID();

// Тайминг-безопасное сравнение
const ok = timingSafeEqual(a, b);

// scrypt (аппроксимирован через PBKDF2)
const key = scryptSync(password, salt, 32, { N: 16384 });
```

Заметка : `scryptSync` аппроксимирован через PBKDF2 с числом итераций, привязанным к параметру `N`. Эта аппроксимация заменяет специфичную memory-схему scrypt и покрывает применения проекта.

Функции, которые нельзя разумно эмулировать в браузере (`generateKeyPairSync`, `createCipheriv`, `createDecipheriv`, `createSign`), бросают явную ошибку при вызове. Честное поведение.

---

## `node:os` -- читать настоящие спеки браузера

Вместо возврата фиксированных значений этот полифилл читает браузерные API, чтобы возвращать информацию, соответствующую реальной машине пользователя.

```js
export function totalmem() {
  try {
    return navigator?.deviceMemory
      ? navigator.deviceMemory * 1024 * 1024 * 1024
      : 2 * 1024 * 1024 * 1024; // 2 GB по умолчанию
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

Конкретный итог : когда запускаешь `neofetch` в браузерном демо, показанные число ядер и RAM соответствуют твоей машине. Деталь, но она сильно работает на правдоподобие терминала.

Остальные экспорты : `freemem` (40 % общей памяти, разумная аппроксимация), `platform` → `'browser'`, `type` → `'Linux'`, `release` → `'web'`, `uptime` через `performance.now()`, `endianness` → `'LE'` (little-endian, правда на всех массовых x86/ARM-процессорах), `loadavg` → `[0, 0, 0]`.

---

## `node:net` -- чистые TCP-стабы

У браузера нет доступа к сырым TCP-сокетам (WebSocket не считается -- это другой прикладной протокол). `node:net`, стало быть, стаб, но *хорошо написанный* стаб.

```js
export class Socket {
  connect() { notImpl('Socket.connect')(); }
  on() { return this; }    // чейнится
  once() { return this; }  // чейнится
  pipe() { return this; }  // чейнится
  setEncoding() { return this; }
  remoteAddress = '127.0.0.1';
  remotePort = 0;
  // ...
}
```

Важное : методы регистрации событий (`on`, `once`, `off`, `emit`) возвращают `this` и не бросают ошибок. Это позволяет коду вида `new net.Socket().on('connect', cb)` работать без падения, даже если соединение никогда не состоится. Только методы, *реально пытающиеся подключиться*, бросают ошибку.

`isIP`, `isIPv4`, `isIPv6` реализованы корректно (с настоящей логикой валидации), потому что используются виртуальным сетевым кодом для валидации адресов, ни разу не открывая сокет.

---

## `node:path` -- операции POSIX-путей

Полная реимплементация операций POSIX-путей, адаптированная под контекст (пути всегда абсолютные с `/`, только стиль Unix).

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

Просто, компактно, корректно для применений проекта.

---

## `node:url` -- делегирование браузерным API

Эта элегантна простотой. API `URL` и `URLSearchParams` уже существуют нативно в браузере -- достаточно их реэкспортировать.

```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```

Только `fileURLToPath` и `pathToFileURL` требуют реализации, потому что они специфичны для Node :

```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```

Идеальный подход, когда целевая платформа (браузер) уже даёт нативный эквивалент.

---

## `node:zlib` -- идентичность

```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```

Две строки. Библиотека использует `fflate` для реального сжатия (работающего в браузере нативно). `node:zlib` импортируется только в путях кода, не исполняющихся в браузерном контексте -- так что passthrough достаточно.

Порой правильная реализация это две строки.

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

Полная реализация `EventEmitter` из Node.js это ~600 строк с управлением `maxListeners`, `once`, `prependListener` и т.д. Здесь 12 строк на 4 реально используемых метода. Ментальный tree-shaking ещё до tree-shaking сборщика.

---

## `ssh2` и `roxify` -- явные стабы

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

SSH-сервер не крутится в браузере (это было бы бессмысленно -- кто бы подключался?). Но код, *говорящий про SSH на клиентской стороне* -- классы, строящие SSH-пакеты, парсеры протокола -- в библиотеке есть. Эти стабы позволяют всему этому коду бандлиться без ошибок, гарантируя при этом явную ошибку, если кто-то попытается вызвать метод, требующий настоящего сокета.

`roxify` это проприетарный формат сжатия, используемый для снапшотов VFS в Node-режиме. В браузере вместо него используется `fflate` -- полифилл просто бросает ошибку, если `roxify` вызван напрямую.

---

## `node:worker_threads` -- реэкспорт Web Workers

Самый тонкий. `node:worker_threads` в Node.js и Web Workers браузера это два разных API, но концептуально близкие. Полифилл делает маппинг :

```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```

`MessageChannel` и `MessagePort` реэкспортируются прямо из браузера (тот же API). Сам `Worker` требует обёртки, потому что конструктор разный (Node ждёт путь модуля, браузер ждёт URL). `isMainThread` всегда `true` на стороне браузера в этом контексте.

---

## Обзор : что представляют эти 640 строк

| Полифилл | Строки | Стратегия |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array` + `DataView`, весь API `Buffer` |
| `node:crypto` | 166 | SHA-256/HMAC/PBKDF2 с нуля + Web Crypto для random |
| `node:fs` | 210 | `Map` в памяти + асинхронный IndexedDB |
| `node:net` | 70 | Чейнящиеся стабы + настоящие IP-валидации |
| `ssh2` | 74 | Явные стабы |
| `process.js` | 14 | Минимально жизнеспособный `process` |
| `node:path` | ~30 | Операции POSIX-путей |
| `node:url` | ~25 | Делегирование браузерным API |
| `node:events` | ~12 | EventEmitter на 4 метода |
| `node:os` | ~25 | `navigator.deviceMemory` / `hardwareConcurrency` |
| `node:zlib` | 4 | Сквозной passthrough |
| `node:worker_threads` | ~30 | Реэкспорт Web Workers |
| `roxify.js` | 8 | Заглушки |

640 строк. Ноль npm-зависимостей. Ноль Wasm. А даёт браузерный бандл, стартующий меньше чем за секунду и крутящийся безо всякой серверной инфраструктуры.

---

## Что из этого вынести

В следующий раз, когда захочешь портировать библиотеку Node.js в браузер, вот что демонстрирует подход Fortune :

1. **Выяви реально используемое.** Реализуй только методы, вызываемые кодом : здесь `on`, `emit` и `removeListener` достаточно для `EventEmitter`.

2. **Делегируй браузерным API, когда возможно.** `URL`, `URLSearchParams`, `MessageChannel`, `MessagePort`, `crypto.getRandomValues` -- у браузера они уже есть, используй.

3. **Синхронный кэш перед асинхронным API.** Решение `Map` + IndexedDB для `node:fs` самый переиспользуемый паттерн всей папки.

4. **Честные стабы лучше молчаливых неполных реализаций.** Явный `throw new Error('not implemented in browser')` бесконечно полезнее `return undefined`, дающего багу проявиться 10 вызовов спустя.

5. **esbuild `alias` + `inject` недооценён.** Идеальный инструмент для такого портирования -- ноль конфигурации webpack, ноль плагинов, просто список замен.

---

Код в репозитории : [github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills). Каждый файл умещается на одну страницу, читается прямо на GitHub. Настоятельно рекомендовано, если работаешь над похожим проектом.
