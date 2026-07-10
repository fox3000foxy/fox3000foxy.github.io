---
title: WasmなしでNode.jsライブラリをブラウザで動かす -- typescript-virtual-containerのpolyfill群
description: Fortuneがnode:fs、node:crypto、その他十数個のNodeモジュールを640行のJavaScriptで手書き再実装して、Wasmなしでコンテナをブラウザで動かす方法
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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "MEYCIQCLlY0s/quduhpPgZiE/lkX/ld7mEsDfBHX0Ulaw6PCTAIhAKU18tiX6pML2Lx5ImetMWrMStvukgHC2SoqW1g+pjw9"
---

# WasmなしでNode.jsライブラリをブラウザで動かす -- typescript-virtual-containerのpolyfill群

最近、[typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)のソースコードをじっくり読んでたんだ。[Fortune (Chloé Rolzhausen)](https://itsrealfortune.fr)のプロジェクトでね。で、一番驚いたのは、VFSでも仮想ネットワークでも、TypeScriptで再実装された170のUnixコマンドでもない。`polyfills/`ディレクトリだ。

なぜかって？このモジュールはブラウザで動くんだ、Wasmなしで。そのためにFortuneは、ライブラリが必要とする`node:*`レイヤー全体を手書きで再実装してる。約640行の手作りJavaScriptで、`node:fs`、`node:crypto`、`node:os`、`node:net`、その他いくつかを置き換えてる。

この記事では、polyfillごとにどう動いてるかを説明する。

---

## 基本的な問題

Node.jsライブラリはブラウザに存在しないAPIを使う。`import { readFileSync } from 'node:fs'`と書くと、それはNode側のシステムコール -- libuv経由の実際のディスクアクセスだ。ブラウザには`node:fs`なんてまったくない。

よくある解決策は：

- **Wasmランタイム** (Emscripten、WASIp1/WASIp2など) -- Node.jsをWasmにコンパイルして実行する。結果：10-50MBのバンドル、目立つロード時間、かなりのデプロイ複雑性。
- **汎用polyfill** (`browserify`、`webpack node: polyfills`など) -- 各Nodeモジュールの近似を提供するnpmライブラリ。大抵は重すぎて、特定のユースケースに合わない。
- **polyfillを手書きする** -- 手間はかかるが、結果は最適。

Fortuneは3番目の選択肢を選んだ。その結果、ブラウザバンドルはライブラリそのものだけになり、即座に起動し、外部インフラに一切依存しない。

---

## ビルドの仕組み

すべてはesbuildとその`alias`オプションに基づいてる。各`node:*`インポートはローカルファイルにリダイレクトされる：

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

`inject`オプションは注目に値する：バンドル内の各ファイルの先頭に`process.js`と`buffer.js`を注入し、明示的なインポートなしで`process`と`Buffer`をグローバルに使えるようにしてる。まさにNode.jsがネイティブに公開しているのと同じ方法だ。

---

## `buffer.js` -- `Uint8Array`上の`Buffer`

これは注入される2つのグローバルのうちの1つ。`Buffer`はコード内で大量に使われてる -- SSH操作、VFSスナップショット、バイナリ読み書きのすべてがこれを通る。

解決策：`Uint8Array`を拡張してNode.jsの`Buffer` API全体を実装した`BrowserBuffer`クラス。

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

実装されてるもの：
- `Buffer.from`、`Buffer.alloc`、`Buffer.allocUnsafe`、`Buffer.isBuffer`、`Buffer.concat`、`Buffer.byteLength`
- すべての書き込みメソッド：`writeUInt8/16/32BE/LE`、`writeInt8/16/32BE/LE`、`writeBigUInt64BE/LE`、`writeFloat/DoubleLE/BE`
- 対応するすべての読み取りメソッド
- hex、base64、utf8をサポートする`toString`
- `copy`、`equals`、`slice`、`subarray`

116行だ。これが置き換えてるものを考えると、驚くほどコンパクトだ。

主なトリックは、マルチバイトアクセスに`DataView`を使っていること。これでエンディアンネスを正しく処理でき、型ごとに手動でビット操作する必要がない：

```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```

---

## `process.js` -- 最小限の`process`グローバル

もう1つの注入されるグローバル。小さいけど必要 -- コードはしばしば`process.env.NODE_ENV`、`process.platform`、`process.nextTick`などをチェックする。

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

`nextTick` → `queueMicrotask`のマッピングがここで最も重要な詳細だ。Node.jsの`process.nextTick`はイベントループの現在のフェーズの最後、I/Oの前にコールバックをスケジュールする。ブラウザの`queueMicrotask`は意味的に非常に近いことをする -- マイクロタスクをスケジュールし、次のレンダリングやイベントの前に実行される。同一ではないが、`nextTick`を使うすべてのコードがブラウザで正しく動作するのに十分近い。

---

## `node:fs` -- 同期ファイルシステムとしてのIndexedDB

これが最も洗練されたpolyfillで、技術的に断然一番面白い。

問題は厄介だ：`node:fs`は同期API（`readFileSync`、`writeFileSync`など）を公開しているが、ブラウザのストレージAPIはすべて非同期だ（IndexedDB、Cache APIなど）。同期関数の途中で`await`はできない。

Fortuneの解決策：二重キャッシュ。

**レベル1 -- インメモリMap（同期）**
すべての読み取りはインメモリの`Map<string, Uint8Array>`から行われる。即座、同期、APIの問題なし。

**レベル2 -- IndexedDB（非同期、バックグラウンド）**
起動時に、IndexedDBの全コンテンツがMapにロードされる。書き込みは即座にMapに行われ、*かつ*ブロックせずに非同期でIndexedDBへの書き込みを開始する。

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

公開されるAPIは完全だ：`readFileSync`、`writeFileSync`、`appendFileSync`、`existsSync`、`unlinkSync`、`rmSync`（`recursive`オプション付き）、`mkdirSync`（`recursive`オプション付き）、`readdirSync`、`statSync`、`renameSync`。

VFSのWALジャーナルがブラウザモードで動作するように、ファイルディスクリプタ管理レイヤー（`openSync`、`writeSync`、`closeSync`）まである -- ジャーナルはfdを開き、書き込み、閉じると、データがIndexedDBに反映される。

`ready`プロパティがエクスポートされていて、初期プリロードが完了したことをコードが知ることができる：

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

これのおかげで、VFSスナップショットがブラウザでのページ再読み込み後も保持される。デモをリロードすると、VFSはサーバーを一切介さずに、IndexedDBから正確に以前の状態に復元される。

---

## `node:crypto` -- 純粋なJSのSHA-256、HMAC、PBKDF2

Wasmにコンパイルされた暗号ライブラリをインポートする代わりに、Fortuneは必要なプリミティブを直接実装した。

**SHA-256**はFIPS 180-4定数を使ってスクラッチから実装されている：

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

SHA-256の上に、**HMAC-SHA256**と**PBKDF2-HMAC-SHA256**が構築されている。これらの2つのプリミティブは、SSHハンドシェイクと内部認証での鍵導出に使われる。

エクスポートされるAPIはNode.jsのものに近い：

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

注意：`scryptSync`はPBKDF2経由で近似され、イテレーション回数はパラメータ`N`に合わせて調整されている。本当のscrypt（メモリの異なるスキームを使う）ではないが、プロジェクトの用途には十分だ。

ブラウザで合理的にエミュレートできない関数（`generateKeyPairSync`、`createCipheriv`、`createDecipheriv`、`createSign`）は、呼び出されると明示的なエラーを投げる。正直な振る舞いだ。

---

## `node:os` -- ブラウザの実際のスペックを読む

固定値を返す代わりに、このpolyfillはブラウザのAPIを読み取って、ユーザーの実際のマシンに対応する情報を返す。

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

実際の結果：ブラウザデモで`neofetch`を実行すると、表示されるコア数とRAMが自分のマシンに対応する。細かいことだが、ターミナルのリアリティに大きく貢献している。

その他のエクスポート：`freemem`（合計メモリの40%、妥当な近似）、`platform` → `'browser'`、`type` → `'Linux'`、`release` → `'web'`、`uptime`は`performance.now()`経由、`endianness` → `'LE'`（リトルエンディアン、すべての一般的なx86/ARMプロセッサで正しい）、`loadavg` → `[0, 0, 0]`。

---

## `node:net` -- きれいなTCPスタブ

ブラウザは生のTCPソケットにアクセスできない（WebSocketは別のアプリケーション層プロトコルなのでカウントされない）。なので`node:net`はスタブだが、*よく書かれた*スタブだ。

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

重要な点：イベント登録メソッド（`on`、`once`、`off`、`emit`）は`this`を返し、エラーを投げない。これにより、`new net.Socket().on('connect', cb)`のようなコードが、接続が実際に行われることはなくても、クラッシュせずに動作する。*実際に接続を試みる*メソッドだけがエラーを投げる。

`isIP`、`isIPv4`、`isIPv6`は（スタブではなく）正しく実装されている。なぜなら、仮想ネットワークコードがソケットを開くことなくアドレスを検証するために使っているからだ。

---

## `node:path` -- POSIXパス操作

POSIXパス操作の完全な再実装。コンテキストに合わせて調整済み（Windowsのバックスラッシュなし、パスは常に`/`で絶対パス）。

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

シンプル、コンパクト、プロジェクトの用途には正しい。

---

## `node:url` -- ブラウザAPIへの委譲

これはそのシンプルさゆえにエレガントだ。`URL`と`URLSearchParams`のAPIはブラウザにネイティブに存在する -- 再エクスポートするだけでいい。

```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```

`fileURLToPath`と`pathToFileURL`だけは実装が必要だ。なぜなら、これらはNode固有だから：

```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```

ターゲットプラットフォーム（ブラウザ）がすでにネイティブの同等機能を提供している場合の理想的なアプローチだ。

---

## `node:zlib` -- アイデンティティ

```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```

2行。ライブラリは実際の圧縮に`fflate`を使っている（ブラウザでネイティブに動作する）。`node:zlib`はブラウザコンテキストでは実行されないコードパスでのみインポートされる -- なのでパススルーで十分だ。

時には正しい実装は2行で済む。

---

## `node:events` -- 最小限のEventEmitter

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

Node.jsの完全な`EventEmitter`の実装は、`maxListeners`、`once`、`prependListener`などの管理を含めて約600行だ。ここでは実際に使われている4つのメソッドに対して12行。ビルドツールのtree-shakingの前に、メンタルなtree-shakingを行っている。

---

## `ssh2`と`roxify` -- 明示的なスタブ

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

SSHサーバーはブラウザでは動作しない（意味がない -- 誰が接続するんだ？）。しかし、*SSHについてクライアント側で語る*コード -- SSHパケットを構築するクラス、プロトコルパーサー -- はライブラリ内に存在する。これらのスタブにより、そのようなコードがすべてエラーなくバンドルされ、実際のソケットを必要とするメソッドを誰かが呼び出そうとすると明確なエラーが発生することが保証される。

`roxify`はNodeモードでVFSスナップショットに使われる独自の圧縮フォーマットだ。ブラウザでは代わりに`fflate`が使われる -- polyfillは`roxify`が直接呼び出された場合にエラーを投げるだけだ。

---

## `node:worker_threads` -- Web Workersの再エクスポート

これが最も微妙だ。Node.jsの`node:worker_threads`とブラウザのWeb Workersは異なるAPIだが、概念的には近い。polyfillがマッピングを行う：

```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```

`MessageChannel`と`MessagePort`はブラウザから直接再エクスポートされる（同じAPI）。`Worker`自体はコンストラクタが異なるため（Nodeはモジュールパス、ブラウザはURLを期待する）ラッパーが必要。`isMainThread`はこのコンテキストではブラウザ側で常に`true`だ。

---

## 概要：これらの640行が表すもの

| Polyfill | 行数 | 戦略 |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array` + `DataView`、完全な`Buffer` API |
| `node:crypto` | 166 | SHA-256/HMAC/PBKDF2をスクラッチから + ランダム用Web Crypto |
| `node:fs` | 210 | インメモリ`Map` + 非同期IndexedDB |
| `node:net` | 70 | チェーン可能なスタブ + 実際のIP検証 |
| `ssh2` | 74 | 明示的なスタブ |
| `process.js` | 14 | 最小 viable `process` |
| `node:path` | ~30 | POSIXパス操作 |
| `node:url` | ~25 | ブラウザAPIへの委譲 |
| `node:events` | ~12 | 4メソッドのEventEmitter |
| `node:os` | ~25 | `navigator.deviceMemory` / `hardwareConcurrency` |
| `node:zlib` | 4 | パススルー |
| `node:worker_threads` | ~30 | Web Workersの再エクスポート |
| `roxify.js` | 8 | スタブ |

640行。npmの依存関係ゼロ。Wasmなし。そして、1秒足らずで起動し、サーバーサイドインフラを一切必要としないブラウザバンドルができあがる。

---

## ここから学べること

次にNode.jsライブラリをブラウザに移植したいとき、Fortuneのアプローチが示しているのは：

1. **実際に使われているものを特定する。** コードが`on`、`emit`、`removeListener`しか使っていないなら、`EventEmitter`全体を実装する必要はない。

2. **可能な限りブラウザAPIに委譲する。** `URL`、`URLSearchParams`、`MessageChannel`、`MessagePort`、`crypto.getRandomValues` -- ブラウザはすでに持っている、使おう。

3. **非同期APIの前の同期キャッシュ。** `node:fs`の`Map` + IndexedDBの解決策は、このディレクトリ全体で最も再利用可能なパターンだ。

4. **正直なスタブは、不完全な実装を黙って行うよりまし。** 明示的な`throw new Error('not implemented in browser')`は、10呼び出し先でバグが顕在化する`return undefined`よりも無限に役立つ。

5. **esbuildの`alias` + `inject`は過小評価されている。** この種の移植に最適なツールだ -- webpack設定ゼロ、プラグインゼロ、単なる置き換えリスト。

---

コードはリポジトリにある：[github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills)。各ファイルは1ページに収まり、GitHub上で直接読める。似たようなプロジェクトに取り組んでいるなら、強くおすすめする。
