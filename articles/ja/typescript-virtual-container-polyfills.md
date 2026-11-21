---
title: "WasmなしでブラウザでNode.jsライブラリを動かす。typescript-virtual-containerのポリフィル"
description: "Fortuneがどうやってnode:fsやnode:cryptoや十数のNodeモジュールを手書き640行JavaScriptで再実装して、コンテナをWasmなしでブラウザ動作させたか。"
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
author_sig: "q4Rm7EHBv1oalT/qKsHer2+kc6O8HbOuQqPip7c095NFUYw8yBaXSvc3wlgXsz9nY3xIcoRPUCO2dEUMEomn1Q=="
---

# WasmなしでブラウザでNode.jsライブラリを動かす。typescript-virtual-containerのポリフィル

[typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)のソースコード漁りに最近かなり時間かけた。[Fortune（Chloé Rolzhausen）](https://itsrealfortune.fr)のプロジェクトだ。いちばん驚いたのは`polyfills/`フォルダだ。VFSや仮想ネットワークやTypeScript再実装の170 Unixコマンドよりもっとね。

だってモジュールはWasmなしでブラウザで動く。そのためにFortuneはライブラリが要る`node:*`層全部を手書きで再実装した。職人芸JavaScript約640行で`node:fs`も`node:crypto`も`node:os`も`node:net`も他いくつかを置き換える。

この記事では仕組みを解説する。ポリフィルごとにね。

---

## 基本問題

Node.jsライブラリはブラウザにないAPIを使う。`import { readFileSync } from 'node:fs'`って書いたら、Node側システムコールだ。libuv経由の本物ディスクアクセスだ。ブラウザでは`node:fs`はまったくない。

普通の解はこうだ。

- **Wasmランタイム**（Emscripten型、WASIp1やWASIp2）→ Node.jsをWasmにコンパイルして実行する。結果：10-50MBバンドル、目立つ読み込み時間、大きなデプロイ複雑さだ。
- **汎用ポリフィル**（`browserify`型、`webpack node: polyfills`）→ 各Nodeモジュールの近似を出すnpmライブラリだ。重すぎることが多くて、特定ケースに合わない。
- **ポリフィルを手で書く** → 手間は増えるけど結果は最適だ。

Fortuneは3つ目を選んだ。結果はただのライブラリなブラウザバンドルで、即起動して、外部土台に何も依存しない。

---

## buildの仕組み

全部はesbuildと`alias`選択肢に載る。各`node:*` import はローカルファイルへ向け直す。

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

`inject`選択肢は記す価値がある。バンドル内各ファイルの頭に`process.js`と`buffer.js`を注入する。明示 import なしで`process`と`Buffer`がグローバルに使える。Node.jsがネイティブに出すのとまったく同じだ。

---

## `buffer.js`。`Uint8Array`上の`Buffer`

2つの注入グローバルの1つだ。コードでは`Buffer`が大量に使われる。各SSH演算、各VFSスナップショット、各バイナリ読み書きが通る。

解：`Uint8Array`を継承してNode.js `Buffer` API全部を実装する`BrowserBuffer`クラスだ。

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

合計で実装してるのはこうだ。
- `Buffer.from`、`Buffer.alloc`、`Buffer.allocUnsafe`、`Buffer.isBuffer`、`Buffer.concat`、`Buffer.byteLength`
- 書き込みメソッド全部：`writeUInt8/16/32BE/LE`、`writeInt8/16/32BE/LE`、`writeBigUInt64BE/LE`、`writeFloat/DoubleLE/BE`
- 対応する読み取りメソッド全部
- hex、base64、utf8対応の`toString`
- `copy`、`equals`、`slice`、`subarray`

116行になる。置き換えるものにしては驚くほど小さい。

主な技は複数バイトアクセスに`DataView`を使うことだ。エンディアンを正しく扱う。各型に手でビット操作しなくていい。

```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```

---

## `process.js`。最小グローバル`process`

もう1つの注入グローバルだ。ちっぽけだが必須だ。コードは`process.env.NODE_ENV`や`process.platform`や`process.nextTick`などをよく試す。

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

`nextTick`から`queueMicrotask`への対応がここでいちばん大事な詳細だ。Node.jsの`process.nextTick`は現イベントループ段階の終わり、I/O前にコールバックを入れる。ブラウザの`queueMicrotask`はとても近い意味だ。マイクロタスクを入れて、次描画やイベント前に実行する。この近さで`nextTick`使うコード全部がブラウザで正しく動くに足りる。

---

## `node:fs`。同期ファイルシステムとしてのIndexedDB

いちばん洗練されたポリフィルで、技術的に断然いちばん面白い。

問題は微妙だ。`node:fs`は同期API（`readFileSync`、`writeFileSync`など）を出す。でもブラウザ保存APIは全部非同期だ（IndexedDB、Cache APIなど）。同期関数真ん中で`await`はできない。

Fortuneの解：2層キャッシュだ。

**層1。メモリ内Map（同期）**  
全読み取りはメモリ内`Map<string, Uint8Array>`からする。即時で、同期で、API問題なしだ。

**層2。IndexedDB（非同期、バックグラウンド）**  
起動時、IndexedDB内容全部をMapへ読み込む。書き込みは即Mapへ*して*、止めず非同期でIndexedDBへ書き込む。

```js
const DB_NAME = 'vfs-fs-shim';
const STORE = 'files';
let db = null;

// Sync cache (path → Uint8Array | null)
const memCache = new Map();

// 起動時プリロード
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

// IndexedDBへの非同期書き込み（ノンブロック）
function idbSet(path, value) {
  openDB().then(db => {
    const tx = db.transaction(STORE, 'readwrite');
    if (value === null) tx.objectStore(STORE).delete(path);
    else tx.objectStore(STORE).put(value, path);
  });
}
```

出すAPIは完全だ。`readFileSync`、`writeFileSync`、`appendFileSync`、`existsSync`、`unlinkSync`、`rmSync`（`recursive`選択肢付き）、`mkdirSync`（`recursive`選択肢付き）、`readdirSync`、`statSync`、`renameSync`だ。

ファイル記述子層（`openSync`、`writeSync`、`closeSync`）まである。ブラウザモードでVFSのWAL日誌が動くためだ。日誌はfdを開いて、書いて、閉じる。データはIndexedDBに入る。

`ready`特性は初期プリロード終わりを知らせるために出す。

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

ブラウザでVFSスナップショットがページ再読み込みを生き延びるのはこのおかげだ。デモ再読み込みで、VFSは残したままの状態に正確復元する。サーバー関与なしでね。

---

## `node:crypto`。純JSのSHA-256、HMAC、PBKDF2

Wasmコンパイル暗号ライブラリを入れる代わり、Fortuneは要る基本要素を直接実装した。

**SHA-256**はFIPS 180-4定数付きでゼロから実装する。

```js
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, /* ... 残り60定数 */ 
]);

function sha256(data) {
  // padding FIPS 180-4
  const msg = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
  // ...
  // 64 rounds de compression
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

SHA-256の上に**HMAC-SHA256**と**PBKDF2-HMAC-SHA256**を組む。この2基本要素はSSH交換の鍵導出と内部認証に使う。

出すAPIはNode.jsっぽい。

```js
// 古典ハッシュ
const hash = createHash('sha256').update('data').digest('hex');

// ランダムバイト（標準Web Crypto API経由）
const bytes = randomBytes(32);

// UUID
const id = randomUUID();

// timing-safe比較
const ok = timingSafeEqual(a, b);

// scrypt（PBKDF2経由で近似）
const key = scryptSync(password, salt, 32, { N: 16384 });
```

注意：`scryptSync`はPBKDF2で反復回数を`N`パラメータに合わせ近似する。この近似はscrypt固有のメモリ方式を置き換える。プロジェクト用途をカバーする。

ブラウザでまともに真似できない関数（`generateKeyPairSync`、`createCipheriv`、`createDecipheriv`、`createSign`）は呼ばれたら明示エラーを投げる。正直な挙動だ。

---

## `node:os`。ブラウザの本物 spec を読む

固定値を返す代わり、このポリフィルはブラウザAPIを読んでユーザー実機に対応する情報を返す。

```js
export function totalmem() {
  try {
    return navigator?.deviceMemory
      ? navigator.deviceMemory * 1024 * 1024 * 1024
      : 2 * 1024 * 1024 * 1024; // 2 GB par défaut
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

具体結果：ブラウザデモで`neofetch`を叩けば、コア数もRAMも自分のマシンに対応する。細部だが、端末の本物らしさに大きく寄与する。

他 export：`freemem`（合計メモリ40パーセント、まともな近似）、`platform`は`'browser'`、`type`は`'Linux'`、`release`は`'web'`、`uptime`は`performance.now()`経由、`endianness`は`'LE'`（一般x86やARMプロセッサ全部でリトルエンディアンで正しい）、`loadavg`は`[0, 0, 0]`だ。

---

## `node:net`。きれいなTCPスタブ

ブラウザは素TCPソケットに触れない（WebSocketは別。違う応用プロトコルだ）。だから`node:net`はスタブだ。でも*よく書けた*スタブだ。

```js
export class Socket {
  connect() { notImpl('Socket.connect')(); }
  on() { return this; }    // つなげられる
  once() { return this; }  // つなげられる
  pipe() { return this; }  // つなげられる
  setEncoding() { return this; }
  remoteAddress = '127.0.0.1';
  remotePort = 0;
  // ...
}
```

大事な点：イベント登録メソッド（`on`、`once`、`off`、`emit`）は`this`を返してエラーを投げない。`new net.Socket().on('connect', cb)`するコードは落ちずに動き続ける。接続しなくてもね。*本当に接続しようとする*メソッドだけエラーを投げる。

`isIP`、`isIPv4`、`isIPv6`は正しく実装する（本物の検証理屈付き）。仮想ネットワークコードがソケット開かずアドレス検証に使うからね。

---

## `node:path`。POSIXパス演算

POSIXパス演算の完全再実装だ。文脈適合（パスはつねに`/`付き絶対、Unix式のみ）。

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

単純で、小さくて、プロジェクト用途に正しい。

---

## `node:url`。ブラウザAPIへの委譲

優雅なのは単純さだ。`URL`と`URLSearchParams` APIはブラウザにもうネイティブにある。再 export すればいい。

```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```

`fileURLToPath`と`pathToFileURL`だけ実装要だ。Node固有だからね。

```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```

対象平台（ブラウザ）がすでにネイティブ同等物を出すときの理想手法だ。

---

## `node:zlib`。恒等

```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```

2行だ。ライブラリは本物圧縮に`fflate`を使う（ブラウザネイティブで動く）。`node:zlib`はブラウザ文脈で実行されないコード道にしか import されない。だから pass-through で十分だ。

ときどき正しい実装は2行だ。

---

## `node:events`。最小EventEmitter

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

Node.jsの完全`EventEmitter`実装は`maxListeners`や`once`や`prependListener`などの管理で約600行だ。ここは本当に使う4メソッドで12行だ。build道具の tree-shaking 前の頭の tree-shaking だ。

---

## `ssh2`と`roxify`。明示スタブ

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

SSHサーバーはブラウザで回らない（意味ない。誰が接続するの）。でもSSHクライアント側を*語る*コード、SSHパケットを作るクラスやプロトコルパーサーはライブラリ内にある。このスタブで全部コードをエラーなしでまとめられる。真のソケット要メソッドを誰か呼ぼうとしたら明確エラーが上がることが保証付きだ。

`roxify`はNodeモードVFSスナップショット用の独自圧縮形式だ。ブラウザでは代わりに`fflate`を使う。ポリフィルは`roxify`直接呼び出しでエラーを投げるだけだ。

---

## `node:worker_threads`。Web Workersの再 export

いちばん微妙だ。Node.jsの`node:worker_threads`とブラウザのWeb Workersは違うAPIだ。でも概念的に近い。ポリフィルは対応付けする。

```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```

`MessageChannel`と`MessagePort`はブラウザから直接再 export する（同じAPI）。`Worker`自体はラッパー要だ。コンストラクタが違う（Nodeはモジュールパス待ち、ブラウザはURL待ち）。`isMainThread`はこの文脈のブラウザ側でつねに`true`だ。

---

## 概観：この640行が表すもの

| ポリフィル | 行数 | 戦略 |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array`と`DataView`、全`Buffer` API |
| `node:crypto` | 166 | ゼロからのSHA-256やHMACやPBKDF2とランダム用Web Crypto |
| `node:fs` | 210 | メモリ内`Map`と非同期IndexedDB |
| `node:net` | 70 | つなげられるスタブと本物IP検証 |
| `ssh2` | 74 | 明示スタブ |
| `process.js` | 14 | 最小の動く`process` |
| `node:path` | 約30 | POSIXパス演算 |
| `node:url` | 約25 | ブラウザAPIへの委譲 |
| `node:events` | 約12 | 4メソッドEventEmitter |
| `node:os` | 約25 | `navigator.deviceMemory`や`hardwareConcurrency` |
| `node:zlib` | 4 | Pass-through |
| `node:worker_threads` | 約30 | Web Workers再 export |
| `roxify.js` | 8 | スタブ |

640行だ。npm依存ゼロだ。Wasmゼロだ。1秒未満で起動してサーバー土台なしで回るブラウザバンドルが出る。

---

## 得られること

次にNode.jsライブラリをブラウザへ移植したくなったら、Fortuneの手法が示すのはこうだ。

1. **本当に使うものを特定する。** コードが呼ぶメソッドだけ実装する。ここでは`EventEmitter`に`on`と`emit`と`removeListener`で足りる。

2. **可能ならブラウザAPIへ委譲する。** `URL`、`URLSearchParams`、`MessageChannel`、`MessagePort`、`crypto.getRandomValues`。ブラウザはすでにある。使うべきだ。

3. **非同期APIの前に同期キャッシュ。** `node:fs`用`Map`とIndexedDB解がフォルダ内でいちばん再利用できるパターンだ。

4. **正直なスタブは静かな不完全実装より良い。** 明示`throw new Error('not implemented in browser')`は、バグが10呼び出し先で現れる`return undefined`より無限に有用だ。

5. **esbuild `alias`と`inject`は過小評価だ。** この種の移植に最適な道具だ。webpack設定ゼロ、プラグインゼロ。置換一覧だけだ。

---

コードはリポジトリにある。[github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills)だ。各ファイルは1ページに収まる。GitHubで直接読める。似たプロジェクトで働くなら強く勧める。
