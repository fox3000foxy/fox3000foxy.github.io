---
title: Wasm 없이 브라우저에서 Node.js 라이브러리 돌리기. typescript-virtual-container 폴리필들
description: Fortune이 node:fs, node:crypto, 열 개 넘는 Node 모듈을 손으로 640줄 JavaScript로 다시 구현해서 컨테이너가 Wasm 없이 브라우저에서 도는 방법.
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
author_sig: "4WZASV0t9D+rx1ZHuukWW0soponXMehaGlZOt89e1GECTlZx7Ll9gN4/hZvBtT/GH4wQH2LLtM1YIOMFnSYCQQ=="
---

# Wasm 없이 브라우저에서 Node.js 라이브러리 돌리기. typescript-virtual-container 폴리필들

최근 [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container), [Fortune (Chloé Rolzhausen)](https://itsrealfortune.fr)의 프로젝트 소스 코드를 뜯어보며 꽤 많은 시간을 썼어요. 가장 놀랐던 부분은 VFS나 가상 네트워크, TypeScript로 다시 구현한 170개 Unix 명령이 아니라 `polyfills/` 폴더예요.

모듈이 Wasm 없이 브라우저에서 돌기 때문이고, 그러려고 Fortune이 라이브러리에 필요한 `node:*` 층 전체를 손으로 다시 구현했어요. `node:fs`와 `node:crypto`, `node:os`, `node:net`, 몇 개 더를 대신하는 장인 JavaScript 약 640줄이에요.

이 글에서는 폴리필마다 어떻게 동작하는지 설명해요.

---

## 기본 문제

Node.js 라이브러리는 브라우저에 없는 API를 써요. `import { readFileSync } from 'node:fs'`라고 쓰면 Node 쪽 시스템 호출이에요. libuv 경유 진짜 디스크 접근. 브라우저에는 `node:fs`가 전혀 없어요.

보통 해법은요.

- **Wasm 런타임** (Emscripten, WASIp1과 WASIp2 종류). Node.js를 Wasm으로 컴파일해서 실행해요. 결과: 10~50MB 번들, 눈에 띄는 불러오기 시간, 상당한 배포 복잡함.
- **범용 폴리필** (`browserify`, `webpack node: polyfills` 종류). 각 Node 모듈의 근사치를 주는 npm 라이브러리. 흔히 너무 무겁고 특정 경우에 맞지 않아요.
- **폴리필을 손으로 다시 쓰기**. 일이 더 많지만 결과가 최적이에요.

Fortune은 세 번째를 골랐어요. 결과는 라이브러리 그 자체인 브라우저 번들이고, 바로 시작하고, 외부 인프라에 의존하지 않아요.

---

## 빌드 구조

전부 esbuild와 `alias` 옵션에 기대요. 각 `node:*` import가 로컬 파일로 돌아가요.

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

`inject` 옵션이 주목할 만해요. 번들의 각 파일 앞에 `process.js`와 `buffer.js`를 주입해서, 명시 import 없이 `process`와 `Buffer`를 전역으로 쓸 수 있게 해요. Node.js가 네이티브로 노출하는 것과 정확히 같아요.

---

## `buffer.js`: `Uint8Array` 위의 `Buffer`

주입되는 전역 둘 중 하나예요. 코드에서 `Buffer`를 대량으로 써요. 모든 SSH 연산과 VFS 스냅샷, 이진 읽기와 쓰기가 여기를 거쳐요.

해법: `Uint8Array`를 확장해서 Node.js `Buffer` API 전체를 구현하는 `BrowserBuffer` 클래스.

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

구현된 것은 모두요.

- `Buffer.from`, `Buffer.alloc`, `Buffer.allocUnsafe`, `Buffer.isBuffer`, `Buffer.concat`, `Buffer.byteLength`
- 모든 쓰기 메서드: `writeUInt8/16/32BE/LE`, `writeInt8/16/32BE/LE`, `writeBigUInt64BE/LE`, `writeFloat/DoubleLE/BE`
- 대응하는 모든 읽기 메서드
- hex, base64, utf8 지원 `toString`
- `copy`, `equals`, `slice`, `subarray`

모두 116줄이에요. 대신하는 것에 비하면 놀랍게 간결해요.

핵심 꼼수는 다중 바이트 접근에 `DataView`를 쓰는 것. 각 종류마다 비트를 손으로 다루지 않고 엔디언을 올바로 처리해요.

```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```

---

## `process.js`: 최소 전역 `process`

주입되는 다른 전역이에요. 아주 작지만 필요해요. 코드가 흔히 `process.env.NODE_ENV`, `process.platform`, `process.nextTick` 등을 테스트해요.

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

`nextTick`에서 `queueMicrotask` 매핑이 여기서 가장 중요한 세부 사항이에요. Node.js의 `process.nextTick`은 이벤트 루프 현재 페이즈 끝에, I/O 전에 콜백을 잡아요. 브라우저의 `queueMicrotask`는 의미가 아주 가까워요. 다음 렌더나 이벤트 전에 실행되는 마이크로태스크를 잡아요. `nextTick`을 쓰는 모든 코드가 브라우저에서 제대로 동작하기에 이 가까움이 충분해요.

---

## `node:fs`: 동기 파일시스템으로서의 IndexedDB

가장 정교한 폴리필이고, 기술적으로 단연 가장 흥미로워요.

문제가 까다로워요. `node:fs`는 동기 API(`readFileSync`, `writeFileSync` 등)를 노출하지만, 브라우저 저장 API는 전부 비동기예요 (IndexedDB, Cache API 등). 동기 함수 한가운데서 `await`을 할 수 없어요.

Fortune의 해법: 이중 캐시 수준.

**수준 1: 메모리 Map (동기)**
모든 읽기는 메모리 `Map<string, Uint8Array>`에서 일어나요. 바로, 동기, API 문제 없어요.

**수준 2: IndexedDB (비동기, 백그라운드)**
시작할 때 IndexedDB 내용 전체를 Map에 불러와요. 쓰기는 Map에 바로 하고 IndexedDB에 비동기로 쓰기를 일으켜서 막지 않아요.

```js
const DB_NAME = 'vfs-fs-shim';
const STORE = 'files';
let db = null;

// 동기 캐시 (path → Uint8Array | null)
const memCache = new Map();

// 시작할 때 미리 불러오기
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

// IndexedDB에 비동기 쓰기 (막지 않아요)
function idbSet(path, value) {
  openDB().then(db => {
    const tx = db.transaction(STORE, 'readwrite');
    if (value === null) tx.objectStore(STORE).delete(path);
    else tx.objectStore(STORE).put(value, path);
  });
}
```

노출 API는 완전해요. `readFileSync`, `writeFileSync`, `appendFileSync`, `existsSync`, `unlinkSync`, `rmSync` (`recursive` 옵션과 함께), `mkdirSync` (`recursive` 옵션과 함께), `readdirSync`, `statSync`, `renameSync`.

파일 디스크립터 관리 층(`openSync`, `writeSync`, `closeSync`)까지 있어서 VFS WAL 저널이 브라우저 모드에서 동작해요. 저널이 fd를 열고, 쓰고, 닫으면 자료가 IndexedDB에 들어가요.

초기 미리 불러오기가 끝났는지 코드가 알도록 `ready` 속성을 내보내요.

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

브라우저에서 VFS 스냅샷이 새로고침을 살아남는 것이 바로 이것 덕분이에요. 데모를 새로고침하면 VFS가 남긴 그대로 IndexedDB에서 복원돼요. 서버 하나 없이요.

---

## `node:crypto`: 순수 JS의 SHA-256, HMAC, PBKDF2

Wasm으로 컴파일된 암호 라이브러리를 가져오는 대신, Fortune이 필요한 원시 연산을 직접 구현했어요.

**SHA-256**을 FIPS 180-4 상수와 함께 처음부터 구현했어요.

```js
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, /* ... 60 autres constantes */
]);

function sha256(data) {
  // FIPS 180-4 패딩
  const msg = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
  // ...
  // 64번 압축 라운드
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

SHA-256 위에 **HMAC-SHA256**과 **PBKDF2-HMAC-SHA256**을 쌓아요. 이 두 원시 연산은 SSH 교환 키 유도와 내부 인증에 쓰여요.

내보내는 API는 Node.js와 비슷해요.

```js
// 고전 해시
const hash = createHash('sha256').update('data').digest('hex');

// 무작위 바이트 (표준 Web Crypto API 경유)
const bytes = randomBytes(32);

// UUID
const id = randomUUID();

// timing-safe 비교
const ok = timingSafeEqual(a, b);

// scrypt (PBKDF2로 근사)
const key = scryptSync(password, salt, 32, { N: 16384 });
```

참고: `scryptSync`는 매개변수 `N`에 맞춘 반복 횟수의 PBKDF2로 근사해요. 이 근사가 scrypt 특유의 메모리 구조를 대신하고 프로젝트 쓰임을 커버해요.

브라우저에서 합리적으로 흉내 낼 수 없는 함수(`generateKeyPairSync`, `createCipheriv`, `createDecipheriv`, `createSign`)는 부르면 명시 오류를 던져요. 솔직한 동작이에요.

---

## `node:os`: 브라우저의 진짜 스펙 읽기

고정값을 돌려주는 대신, 이 폴리필은 브라우저 API를 읽어서 사용자 기기에 맞는 정보를 돌려줘요.

```js
export function totalmem() {
  try {
    return navigator?.deviceMemory
      ? navigator.deviceMemory * 1024 * 1024 * 1024
      : 2 * 1024 * 1024 * 1024; // 기본 2GB
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

구체 결과: 브라우저 데모에서 `neofetch`를 실행하면 코어 수와 표시 RAM이 자기 기기와 일치해요. 세부 사항이지만 터미널 그럴듯함에 크게 기여해요.

다른 내보내기: `freemem` (전체 메모리 40퍼센트, 합리적 근사), `platform` → `'browser'`, `type` → `'Linux'`, `release` → `'web'`, `uptime`은 `performance.now()` 경유, `endianness` → `'LE'` (일반 x86과 ARM 프로세서에 참인 리틀엔디언), `loadavg` → `[0, 0, 0]`.

---

## `node:net`: 깔끔한 TCP 스텁

브라우저는 날것 TCP 소켓에 닿지 않아요 (WebSocket은 안 돼요. 다른 애플리케이션 프로토콜이에요). 그래서 `node:net`은 스텁이지만 *잘 쓴* 스텁이에요.

```js
export class Socket {
  connect() { notImpl('Socket.connect')(); }
  on() { return this; }    // 이어붙이기 가능
  once() { return this; }  // 이어붙이기 가능
  pipe() { return this; }  // 이어붙이기 가능
  setEncoding() { return this; }
  remoteAddress = '127.0.0.1';
  remotePort = 0;
  // ...
}
```

중요한 점: 이벤트 등록 메서드(`on`, `once`, `off`, `emit`)가 `this`를 돌려주고 오류를 던지지 않아요. `new net.Socket().on('connect', cb)` 하는 코드가 연결이 절대 안 돼도 죽지 않고 동작하게 해요. *실제로 연결을 시도하는* 메서드만이 오류를 던져요.

가상 네트워크 코드가 소켓을 열지 않고 주소를 검증하려고 쓰기 때문에 `isIP`, `isIPv4`, `isIPv6`은 제대로 구현했어요 (진짜 검증 논리와 함께).

---

## `node:path`: POSIX 경로 연산

POSIX 경로 연산 완전한 다시 구현. 맥락에 맞춰요 (항상 `/`로 시작하는 절대 경로, Unix 스타일만).

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

단순하고 간결하고 프로젝트 쓰임에 정확해요.

---

## `node:url`: 브라우저 API에 위임

우아함이 단순함에 있어요. `URL`과 `URLSearchParams` API가 브라우저에 이미 네이티브로 있어요. 다시 내보내면 돼요.

```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```

Node 고유라서 `fileURLToPath`와 `pathToFileURL`만이 구현이 필요해요.

```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```

대상 플랫폼(브라우저)이 이미 네이티브 대응물을 줄 때 이상적 접근이에요.

---

## `node:zlib`: 항등

```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```

두 줄. 라이브러리는 실제 압축에 `fflate`를 써요 (브라우저에서 네이티브로 동작해요). `node:zlib`은 브라우저 맥락에서 실행되지 않는 코드 경로에서만 import돼요. 그래서 통과가 충분해요.

가끔 올바른 구현이 두 줄이에요.

---

## `node:events`: 최소 EventEmitter

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

Node.js의 완전한 `EventEmitter` 구현은 `maxListeners`와 `once`, `prependListener` 등 처리로 ~600줄이에요. 여기서는 실제로 쓰는 4개 메서드에 12줄이에요. 빌드 도구 트리셰이킹 전부터 머릿속 트리셰이킹.

---

## `ssh2`와 `roxify`: 명시 스텁

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

SSH 서버는 브라우저에서 돌지 않아요 (말이 안 돼요. 누가 접속하겠어요?). 하지만 SSH *클라이언트 이야기*를 하는 코드, SSH 패킷을 만드는 클래스와 프로토콜 파서는 라이브러리에 존재해요. 이 스텁들이 오류 없이 전체 코드를 묶을 수 있게 하면서, 진짜 소켓이 필요한 메서드를 부르려고 하면 명확한 오류가 나도록 보장해요.

`roxify`는 Node 모드 VFS 스냅샷에 쓰는 독점 압축 형식이에요. 브라우저에서는 대신 `fflate`를 써요. 폴리필은 `roxify`를 직접 부르면 오류를 던질 뿐이에요.

---

## `node:worker_threads`: 웹 워커 다시 내보내기

가장 미묘해요. Node.js의 `node:worker_threads`와 브라우저 웹 워커는 서로 다른 API지만 개념적으로 가까워요. 폴리필이 매핑해요.

```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```

`MessageChannel`과 `MessagePort`는 브라우저에서 바로 다시 내보내요 (같은 API). `Worker` 자체는 래퍼가 필요해요. 생성자가 달라서요 (Node는 모듈 경로를 기대하고, 브라우저는 URL을 기대해요). 이 맥락에서 브라우저 쪽 `isMainThread`는 항상 `true`예요.

---

## 전체 보기: 이 640줄이 나타내는 것

| 폴리필 | 줄 수 | 전략 |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array` + `DataView`, `Buffer` API 전체 |
| `node:crypto` | 166 | 처음부터 SHA-256과 HMAC, PBKDF2 + 무작위는 Web Crypto |
| `node:fs` | 210 | 메모리 `Map` + 비동기 IndexedDB |
| `node:net` | 70 | 이어붙이기 스텁 + 진짜 IP 검증 |
| `ssh2` | 74 | 명시 스텁 |
| `process.js` | 14 | 최소 가능한 `process` |
| `node:path` | ~30 | POSIX 경로 연산 |
| `node:url` | ~25 | 브라우저 API에 위임 |
| `node:events` | ~12 | 메서드 4개 EventEmitter |
| `node:os` | ~25 | `navigator.deviceMemory`와 `hardwareConcurrency` |
| `node:zlib` | 4 | 통과 |
| `node:worker_threads` | ~30 | 웹 워커 다시 내보내기 |
| `roxify.js` | 8 | 스텁 |

640줄. npm 의존성 제로. Wasm 제로. 1초 미만으로 시작하고 서버 쪽 인프라 없이 도는 브라우저 번들을 줘요.

---

## 얻을 수 있는 것

다음에 Node.js 라이브러리를 브라우저로 옮기고 싶으면, Fortune 접근이 보여주는 것은요.

1. **실제로 쓰이는 것을 찾아내세요.** 코드가 부르는 메서드만 구현하세요. 여기서는 `EventEmitter`에 `on`과 `emit`, `removeListener`면 충분해요.

2. **가능하면 브라우저 API에 위임하세요.** `URL`, `URLSearchParams`, `MessageChannel`, `MessagePort`, `crypto.getRandomValues`. 브라우저가 이미 가지고 있으니 쓰세요.

3. **비동기 API 앞에 동기 캐시.** `node:fs`용 `Map` + IndexedDB 해법이 폴더 전체에서 가장 재사용 가능한 패턴이에요.

4. **정직한 스텁이 조용한 불완전 구현보다 나아요.** 명시 `throw new Error('not implemented in browser')`가 버그를 10번 호출 뒤에 드러내는 `return undefined`보다 무한히 쓸모 있어요.

5. **esbuild `alias` + `inject`가 과소평가돼요.** 이런 이식에 완벽한 도구예요. webpack 설정 제로, 플러그인 제로, 대체 목록뿐.

---

코드는 저장소에 있어요. [github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills). 각 파일이 한 페이지에 들어가고 GitHub에서 바로 읽혀요. 비슷한 프로젝트를 하면 강력 추천해요.
