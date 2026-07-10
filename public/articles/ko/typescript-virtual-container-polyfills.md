---
title: Wasm 없이 Node.js 라이브러리를 브라우저에서 돌리기 -- typescript-virtual-container의 polyfill들
description: Fortune이 node:fs, node:crypto, 그리고 수십 개의 Node 모듈을 640줄의 JavaScript로
  손수 재구현해서 Wasm 없이 컨테이너를 브라우저에서 돌리는 방법
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
author_sig: "rgB9aCyC5cCr7S8t34RSFthXQlfGHRoAy0N2XuJElcWIr+iOaxYN/HHJ0TaiwdpXfXvv4vd7F7mqCd/fs8Lktw=="
---

# Wasm 없이 Node.js 라이브러리를 브라우저에서 돌리기 -- typescript-virtual-container의 polyfill들

최근에 [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) 소스 코드를 열심히 뜯어봤어. [Fortune (Chloé Rolzhausen)](https://itsrealfortune.fr)의 프로젝트인데. 가장 놀라웠던 부분은 VFS도, 가상 네트워크도, TypeScript로 재구현한 170개의 Unix 명령어도 아니야. `polyfills/` 디렉토리였어.

왜냐고? 이 모듈은 브라우저에서 돌아가거든, Wasm 없이. 그리고 그걸 위해 Fortune은 라이브러리가 필요한 `node:*` 레이어 전체를 손수 재구현했어. 약 640줄의 수제 JavaScript로 `node:fs`, `node:crypto`, `node:os`, `node:net` 등을 대체했지.

이 글은 polyfill별로 어떻게 동작하는지 설명할게.

---

## 기본적인 문제

Node.js 라이브러리는 브라우저에 존재하지 않는 API를 써. `import { readFileSync } from 'node:fs'`라고 쓰면, 그건 Node 쪽 시스템 콜이야 -- libuv를 통한 실제 디스크 접근. 브라우저에는 `node:fs` 같은 건 아예 없어.

일반적인 해결책은:

- **Wasm 런타임** (Emscripten, WASIp1/WASIp2 등) -- Node.js를 Wasm으로 컴파일해서 실행. 결과: 10-50MB 번들, 눈에 띄는 로딩 시간, 상당한 배포 복잡성.
- **범용 polyfill** (`browserify`, `webpack node: polyfills` 등) -- 각 Node 모듈의 근사치를 제공하는 npm 라이브러리. 보통 너무 무겁고 특정 유스케이스에 맞지 않아.
- **polyfill을 손수 작성** -- 작업량은 더 들지만 결과는 최적.

Fortune은 세 번째 옵션을 골랐어. 그 결과 브라우저 번들은 라이브러리 그 자체만 있고, 즉시 시작되며, 외부 인프라에 전혀 의존하지 않아.

---

## 빌드의 메커니즘

전부 esbuild와 그 `alias` 옵션에 기반해. 각 `node:*` 임포트는 로컬 파일로 리다이렉트돼:

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

`inject` 옵션은 주목할 만해: 번들 내 각 파일의 앞부분에 `process.js`와 `buffer.js`를 주입해서, 명시적인 임포트 없이 `process`와 `Buffer`를 전역에서 사용할 수 있게 해줘. 정확히 Node.js가 네이티브로 노출하는 방식이야.

---

## `buffer.js` -- `Uint8Array` 위의 `Buffer`

이것은 주입되는 두 전역 중 하나야. `Buffer`는 코드 내에서 엄청나게 사용돼 -- 모든 SSH 작업, 모든 VFS 스냅샷, 모든 바이너리 읽기/쓰기가 이걸 거쳐가.

해결책: `Uint8Array`를 확장해서 Node.js `Buffer` API 전체를 구현한 `BrowserBuffer` 클래스.

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

구현된 것들:
- `Buffer.from`, `Buffer.alloc`, `Buffer.allocUnsafe`, `Buffer.isBuffer`, `Buffer.concat`, `Buffer.byteLength`
- 모든 쓰기 메서드: `writeUInt8/16/32BE/LE`, `writeInt8/16/32BE/LE`, `writeBigUInt64BE/LE`, `writeFloat/DoubleLE/BE`
- 대응되는 모든 읽기 메서드
- hex, base64, utf8을 지원하는 `toString`
- `copy`, `equals`, `slice`, `subarray`

116줄이야. 이게 대체하는 걸 생각하면 놀랍도록 컴팩트해.

주요 트릭은 멀티바이트 접근에 `DataView`를 사용하는 거야. 이걸로 엔디언을 올바르게 처리할 수 있고, 타입마다 수동으로 비트를 조작할 필요가 없어:

```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```

---

## `process.js` -- 최소한의 `process` 전역

또 다른 주입되는 전역. 작지만 필요해 -- 코드는 종종 `process.env.NODE_ENV`, `process.platform`, `process.nextTick` 등을 체크하거든.

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

`nextTick` → `queueMicrotask` 매핑이 여기서 가장 중요한 세부사항이야. Node.js의 `process.nextTick`은 이벤트 루프의 현재 페이즈 끝, I/O 직전에 콜백을 스케줄링해. 브라우저의 `queueMicrotask`는 의미상 매우 비슷한 일을 해 -- 마이크로태스크를 스케줄링해서 다음 렌더링이나 이벤트 전에 실행되지. 완전히 동일하지는 않지만, `nextTick`을 사용하는 모든 코드가 브라우저에서 올바르게 동작할 만큼 충분히 가까워.

---

## `node:fs` -- 동기 파일시스템으로서의 IndexedDB

이것이 가장 정교한 polyfill이고, 기술적으로 단연코 가장 흥미로워.

문제는 까다로워: `node:fs`는 동기 API(`readFileSync`, `writeFileSync` 등)를 노출하는데, 브라우저의 스토리지 API는 전부 비동기야(IndexedDB, Cache API 등). 동기 함수 중간에 `await`를 쓸 수가 없어.

Fortune의 해결책: 이중 캐시.

**레벨 1 -- 인메모리 Map (동기)**
모든 읽기는 인메모리 `Map<string, Uint8Array>`에서 이루어져. 즉시, 동기, API 문제 없음.

**레벨 2 -- IndexedDB (비동기, 백그라운드)**
시작할 때 IndexedDB의 전체 콘텐츠가 Map으로 로드돼. 쓰기는 즉시 Map에 되고, *그리고* 블로킹 없이 비동기로 IndexedDB에 쓰기를 시작해.

```js
const DB_NAME = 'vfs-fs-shim';
const STORE = 'files';
let db = null;

// Sync cache (path → Uint8Array | null)
const memCache = new Map();

// Preload at startup
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

노출되는 API는 완전해: `readFileSync`, `writeFileSync`, `appendFileSync`, `existsSync`, `unlinkSync`, `rmSync` (`recursive` 옵션 포함), `mkdirSync` (`recursive` 옵션 포함), `readdirSync`, `statSync`, `renameSync`.

VFS의 WAL 저널이 브라우저 모드에서 동작하도록 파일 디스크립터 관리 레이어(`openSync`, `writeSync`, `closeSync`)까지 있어 -- 저널은 fd를 열고, 쓰고, 닫으면 데이터가 IndexedDB에 반영돼.

`ready` 프로퍼티가 익스포트되어서 초기 프리로드가 완료됐는지 코드가 알 수 있어:

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

이 덕분에 VFS 스냅샷이 브라우저에서 페이지 새로고침 후에도 유지돼. 데모를 리로드하면 VFS는 서버를 전혀 거치지 않고 IndexedDB에서 정확히 이전 상태로 복원돼.

---

## `node:crypto` -- 순수 JS의 SHA-256, HMAC, PBKDF2

Wasm으로 컴파일된 암호 라이브러리를 임포트하는 대신, Fortune은 필요한 프리미티브를 직접 구현했어.

**SHA-256**은 FIPS 180-4 상수로 스크래치부터 구현됐어:

```js
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, /* ... 60 more constants */ 
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

SHA-256 위에 **HMAC-SHA256**과 **PBKDF2-HMAC-SHA256**이 구축됐어. 이 두 프리미티브는 SSH 핸드셰이크와 내부 인증에서 키 유도에 사용돼.

익스포트되는 API는 Node.js의 것과 비슷해:

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

참고: `scryptSync`는 PBKDF2를 통해 근사되고, 반복 횟수는 파라미터 `N`에 맞춰 조정됐어. 진짜 scrypt(다른 메모리 스키마를 사용하는)는 아니지만, 프로젝트 용도로는 충분해.

브라우저에서 합리적으로 에뮬레이션할 수 없는 함수들(`generateKeyPairSync`, `createCipheriv`, `createDecipheriv`, `createSign`)은 호출되면 명시적 에러를 던져. 정직한 행동이야.

---

## `node:os` -- 브라우저의 실제 스펙 읽기

고정된 값을 반환하는 대신, 이 polyfill은 브라우저 API를 읽어서 사용자의 실제 머신에 해당하는 정보를 반환해.

```js
export function totalmem() {
  try {
    return navigator?.deviceMemory
      ? navigator.deviceMemory * 1024 * 1024 * 1024
      : 2 * 1024 * 1024 * 1024; // 2 GB by default
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

실제 결과: 브라우저 데모에서 `neofetch`를 실행하면 표시되는 코어 수와 RAM이 자기 머신에 맞춰져. 사소한 디테일이지만 터미널의 사실감에 엄청나게 기여해.

다른 익스포트들: `freemem` (전체 메모리의 40%, 합리적 근사), `platform` → `'browser'`, `type` → `'Linux'`, `release` → `'web'`, `uptime`은 `performance.now()` 경유, `endianness` → `'LE'` (리틀 엔디언, 모든 일반적인 x86/ARM 프로세서에서 참), `loadavg` → `[0, 0, 0]`.

---

## `node:net` -- 깔끔한 TCP 스텁

브라우저는 raw TCP 소켓에 접근할 수 없어 (WebSocket은 다른 애플리케이션 계층 프로토콜이라 카운트 안 돼). 그래서 `node:net`은 스텁이지만, *잘 쓰여진* 스텁이야.

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

중요한 점: 이벤트 등록 메서드(`on`, `once`, `off`, `emit`)는 `this`를 반환하고 에러를 던지지 않아. 이 덕분에 `new net.Socket().on('connect', cb)` 같은 코드가 실제로 연결이 이루어지지 않더라도 크래시 없이 동작해. *실제로 연결을 시도하는* 메서드만 에러를 던져.

`isIP`, `isIPv4`, `isIPv6`는 (스텁이 아니라) 올바르게 구현됐어. 왜냐하면 가상 네트워크 코드가 소켓을 열지 않고 주소를 검증하는 데 사용하거든.

---

## `node:path` -- POSIX 경로 연산

POSIX 경로 연산의 완전한 재구현. 컨텍스트에 맞게 조정됐어 (윈도우 백슬래시 없음, 경로는 항상 `/`로 절대 경로).

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

심플하고, 컴팩트하고, 프로젝트 용도에 맞아.

---

## `node:url` -- 브라우저 API에 위임

이건 단순함 때문에 우아해. `URL`과 `URLSearchParams` API는 브라우저에 이미 네이티브로 존재해 -- 다시 익스포트하기만 하면 돼.

```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```

`fileURLToPath`와 `pathToFileURL`만 구현이 필요해. Node 고유의 것들이니까:

```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```

타겟 플랫폼(브라우저)이 이미 네이티브 동등 기능을 제공할 때의 이상적인 접근 방식이야.

---

## `node:zlib` -- 아이덴티티

```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```

두 줄. 라이브러리는 실제 압축에 `fflate`를 사용해 (브라우저에서 네이티브로 동작). `node:zlib`는 브라우저 컨텍스트에서 실행되지 않는 코드 경로에서만 임포트돼 -- 그래서 패스스루로 충분해.

때로는 올바른 구현이 두 줄이면 되는 거야.

---

## `node:events` -- 최소한의 EventEmitter

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

Node.js의 완전한 `EventEmitter` 구현은 `maxListeners`, `once`, `prependListener` 등을 포함해 약 600줄이야. 여기는 실제로 사용되는 4개 메서드에 대해 12줄. 빌드 도구의 tree-shaking 이전에 멘탈 tree-shaking을 하고 있는 거지.

---

## `ssh2`와 `roxify` -- 명시적 스텁

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

SSH 서버는 브라우저에서 돌지 않아 (의미가 없잖아 -- 누가 접속하겠어?). 하지만 *SSH에 대해 클라이언트 쪽에서 말하는* 코드 -- SSH 패킷을 구성하는 클래스들, 프로토콜 파서들 -- 는 라이브러리 안에 존재해. 이 스텁들은 그런 모든 코드가 에러 없이 번들되도록 하면서, 실제 소켓이 필요한 메서드를 누군가 호출하려 하면 명확한 에러가 발생하도록 보장해.

`roxify`는 Node 모드에서 VFS 스냅샷에 사용되는 독점 압축 포맷이야. 브라우저에서는 대신 `fflate`가 사용돼 -- polyfill은 `roxify`가 직접 호출되면 에러를 던질 뿐이야.

---

## `node:worker_threads` -- Web Workers 재익스포트

이게 가장 미묘해. Node.js의 `node:worker_threads`와 브라우저의 Web Workers는 다른 API지만, 개념적으로는 가까워. polyfill이 매핑을 해:

```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```

`MessageChannel`과 `MessagePort`는 브라우저에서 직접 재익스포트돼 (같은 API). `Worker` 자체는 생성자가 다르기 때문에 (Node는 모듈 경로, 브라우저는 URL을 기대) 래퍼가 필요해. `isMainThread`는 이 컨텍스트에서 브라우저 쪽에서 항상 `true`야.

---

## 개요: 이 640줄이 나타내는 것

| Polyfill | 줄 수 | 전략 |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array` + `DataView`, 완전한 `Buffer` API |
| `node:crypto` | 166 | SHA-256/HMAC/PBKDF2를 스크래치부터 + 랜덤용 Web Crypto |
| `node:fs` | 210 | 인메모리 `Map` + 비동기 IndexedDB |
| `node:net` | 70 | 체인 가능한 스텁 + 실제 IP 검증 |
| `ssh2` | 74 | 명시적 스텁 |
| `process.js` | 14 | 최소 viable `process` |
| `node:path` | ~30 | POSIX 경로 연산 |
| `node:url` | ~25 | 브라우저 API에 위임 |
| `node:events` | ~12 | 4메서드 EventEmitter |
| `node:os` | ~25 | `navigator.deviceMemory` / `hardwareConcurrency` |
| `node:zlib` | 4 | 패스스루 |
| `node:worker_threads` | ~30 | Web Workers 재익스포트 |
| `roxify.js` | 8 | 스텁 |

640줄. npm 의존성 제로. Wasm 제로. 그리고 1초도 안 되어 시작되고 서버사이드 인프라가 하나도 필요 없는 브라우저 번들이 완성돼.

---

## 여기서 배울 점

다음에 Node.js 라이브러리를 브라우저로 포팅하고 싶을 때, Fortune의 접근 방식이 보여주는 것:

1. **실제로 사용되는 것을 파악해.** 코드가 `on`, `emit`, `removeListener`만 쓴다면 `EventEmitter` 전체를 구현할 필요 없어.

2. **가능하면 브라우저 API에 위임해.** `URL`, `URLSearchParams`, `MessageChannel`, `MessagePort`, `crypto.getRandomValues` -- 브라우저가 이미 가지고 있으니 활용해.

3. **비동기 API 앞의 동기 캐시.** `node:fs`의 `Map` + IndexedDB 해결책은 이 디렉토리 전체에서 가장 재사용 가능한 패턴이야.

4. **정직한 스텁이 불완전한 구현을 조용히 하는 것보다 나아.** 명시적인 `throw new Error('not implemented in browser')`는 10호출 뒤에 버그가 드러나는 `return undefined`보다 무한히 더 유용해.

5. **esbuild의 `alias` + `inject`는 과소평가됐어.** 이런 종류의 포팅에 완벽한 도구야 -- webpack 설정 제로, 플러그인 제로, 단순한 대체 목록.

---

코드는 리포지토리에 있어: [github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills). 각 파일은 한 페이지에 들어가고, GitHub에서 직접 읽을 수 있어. 비슷한 프로젝트를 하고 있다면 강력히 추천해.
