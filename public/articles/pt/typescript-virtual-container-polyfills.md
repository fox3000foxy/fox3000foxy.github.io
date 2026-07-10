---
title: Executando uma biblioteca Node.js no navegador sem Wasm -- os polyfills
  do typescript-virtual-container
description: Como Fortune reimplementou manualmente node:fs, node:crypto e uma
  dúzia de módulos Node em 640 linhas de JavaScript para fazer o contêiner
  rodar no navegador sem Wasm.
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
author_sig: "MEUCIBX/mavyUqw9FGhjzK7FGiDqCoNnFC5p9z0qV/mLCpihAiEAvZkm7A9aSMp0Oy9Q/zp2EUxPje8nRMcfvSLjaGkJX4I="
---

# Executando uma biblioteca Node.js no navegador sem Wasm -- os polyfills do typescript-virtual-container

Passei um bom tempo recentemente examinando o código-fonte do [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container), o projeto de [Fortune (Chloé Rolzhausen)](https://itsrealfortune.fr). E a parte que mais me surpreendeu não foi o VFS, não foi a rede virtual, não foram os 170 comandos Unix reimplementados em TypeScript. Foi a pasta `polyfills/`.

Porque o módulo roda no navegador, sem Wasm, e para isso a Fortune reimplementou manualmente toda a camada `node:*` que a biblioteca precisa. Cerca de 640 linhas de JavaScript artesanal que substituem `node:fs`, `node:crypto`, `node:os`, `node:net`, e alguns outros.

Este artigo explica como funciona, polyfill por polyfill.

---

## O problema básico

Uma biblioteca Node.js usa APIs que não existem no navegador. Quando você escreve `import { readFileSync } from 'node:fs'`, é uma chamada de sistema do Node -- um acesso real a disco via libuv. No navegador, `node:fs` simplesmente não existe.

As soluções comuns são:

- **Um runtime Wasm** (tipo Emscripten, WASIp1/WASIp2) -- você compila o Node.js em Wasm e o executa. Resultado: bundles de 10-50 MB, tempo de carregamento notável, complexidade de deploy significativa.
- **Polyfills genéricos** (tipo `browserify`, `webpack node: polyfills`) -- bibliotecas npm que fornecem aproximações de cada módulo Node. Frequentemente pesadas demais, mal adaptadas ao caso específico.
- **Reescrever os polyfills manualmente** -- mais trabalho, mas resultado ideal.

Fortune escolheu a terceira opção. E o resultado é um bundle para navegador que é apenas a biblioteca, que inicia instantaneamente, e que não depende de nenhuma infraestrutura externa.

---

## A mecânica de build

Tudo se baseia no esbuild e sua opção `alias`. Cada import `node:*` é redirecionado para um arquivo local:

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

A opção `inject` merece destaque: ela permite injetar `process.js` e `buffer.js` no cabeçalho de cada arquivo do bundle, tornando `process` e `Buffer` disponíveis globalmente sem nenhum import explícito. Exatamente como o Node.js os expõe nativamente.

---

## `buffer.js` -- `Buffer` sobre `Uint8Array`

É um dos dois globais injetados. `Buffer` é massivamente usado no código -- cada operação SSH, cada snapshot VFS, cada leitura/escrita binária passa por ele.

A solução: uma classe `BrowserBuffer` que estende `Uint8Array` e implementa toda a API `Buffer` do Node.js.

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

O que é implementado no total:
- `Buffer.from`, `Buffer.alloc`, `Buffer.allocUnsafe`, `Buffer.isBuffer`, `Buffer.concat`, `Buffer.byteLength`
- Todos os métodos de escrita: `writeUInt8/16/32BE/LE`, `writeInt8/16/32BE/LE`, `writeBigUInt64BE/LE`, `writeFloat/DoubleLE/BE`
- Todos os métodos de leitura correspondentes
- `toString` com suporte a hex, base64, utf8
- `copy`, `equals`, `slice`, `subarray`

São 116 linhas. Pelo que substitui, é notavelmente compacto.

O truque principal é o uso de `DataView` para acessos multibyte, que lida corretamente com endianness sem precisar manipular bits manualmente para cada tipo:

```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```

---

## `process.js` -- o global `process` mínimo

O outro global injetado. Minúsculo mas necessário -- o código frequentemente testa `process.env.NODE_ENV`, `process.platform`, `process.nextTick`, etc.

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

O mapeamento `nextTick` → `queueMicrotask` é o detalhe mais importante aqui. `process.nextTick` no Node.js agenda um callback ao final da fase atual do loop de eventos, antes de I/O. `queueMicrotask` no navegador faz algo semanticamente muito próximo -- ele agenda uma microtask, que é executada antes do próximo render ou evento. Não é idêntico, mas é próximo o suficiente para que todo o código que usa `nextTick` funcione corretamente no navegador.

---

## `node:fs` -- IndexedDB como sistema de arquivos síncrono

Este é o polyfill mais sofisticado, e de longe o mais interessante tecnicamente.

O problema é delicado: `node:fs` expõe uma API síncrona (`readFileSync`, `writeFileSync`, etc.), mas as APIs de armazenamento do navegador são todas assíncronas (IndexedDB, Cache API, etc.). Não é possível fazer um `await` no meio de uma função síncrona.

A solução da Fortune: um duplo nível de cache.

**Nível 1 -- Map em memória (síncrono)**  
Todas as leituras são feitas a partir de um `Map<string, Uint8Array>` em memória. Instantâneo, síncrono, sem problema de API.

**Nível 2 -- IndexedDB (assíncrono, em segundo plano)**  
Na inicialização, todo o conteúdo do IndexedDB é carregado no Map. As escritas são feitas imediatamente no Map *e* disparam uma escrita assíncrona para o IndexedDB sem bloquear.

```js
const DB_NAME = 'vfs-fs-shim';
const STORE = 'files';
let db = null;

// Sync cache (path → Uint8Array | null)
const memCache = new Map();

// Preload na inicialização
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

// Escrita async para IndexedDB (não-bloqueante)
function idbSet(path, value) {
  openDB().then(db => {
    const tx = db.transaction(STORE, 'readwrite');
    if (value === null) tx.objectStore(STORE).delete(path);
    else tx.objectStore(STORE).put(value, path);
  });
}
```

A API exposta é completa: `readFileSync`, `writeFileSync`, `appendFileSync`, `existsSync`, `unlinkSync`, `rmSync` (com opção `recursive`), `mkdirSync` (com opção `recursive`), `readdirSync`, `statSync`, `renameSync`.

Há até uma camada de gerenciamento de file descriptors (`openSync`, `writeSync`, `closeSync`) para que o journal WAL do VFS funcione no modo navegador -- o journal abre um fd, escreve nele, fecha, e os dados vão parar no IndexedDB.

A propriedade `ready` é exportada para permitir que o código saiba quando o preload inicial terminou:

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

É graças a isso que os snapshots VFS sobrevivem a recarregamentos de página no navegador. Quando você recarrega a demo, o VFS é restaurado exatamente no estado em que estava, a partir do IndexedDB, sem nenhum servidor envolvido.

---

## `node:crypto` -- SHA-256, HMAC, PBKDF2 em JS puro

Em vez de importar uma biblioteca crypto compilada em Wasm, a Fortune implementou as primitivas necessárias diretamente.

**SHA-256** é implementado do zero com as constantes FIPS 180-4:

```js
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, /* ... outras 60 constantes */ 
]);

function sha256(data) {
  // padding FIPS 180-4
  const msg = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
  // ...
  // 64 rounds de compressão
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

Sobre o SHA-256, **HMAC-SHA256** e **PBKDF2-HMAC-SHA256** são construídos. Essas duas primitivas são usadas para derivação de chaves nas trocas SSH e autenticação interna.

A API exportada se assemelha à do Node.js:

```js
// Hash clássico
const hash = createHash('sha256').update('data').digest('hex');

// Bytes aleatórios (via Web Crypto API padrão)
const bytes = randomBytes(32);

// UUID
const id = randomUUID();

// Comparação timing-safe
const ok = timingSafeEqual(a, b);

// scrypt (aproximado via PBKDF2)
const key = scryptSync(password, salt, 32, { N: 16384 });
```

Nota: `scryptSync` é aproximado via PBKDF2 com um número de iterações baseado no parâmetro `N`. Não é um scrypt real (que usa um esquema de memória diferente), mas para os usos do projeto é suficiente.

As funções que não podem ser emuladas razoavelmente no navegador (`generateKeyPairSync`, `createCipheriv`, `createDecipheriv`, `createSign`) lançam um erro explícito se forem chamadas. Comportamento honesto.

---

## `node:os` -- lendo as specs reais do navegador

Em vez de retornar valores fixos, este polyfill lê as APIs do navegador para retornar informações que correspondem à máquina real do usuário.

```js
export function totalmem() {
  try {
    return navigator?.deviceMemory
      ? navigator.deviceMemory * 1024 * 1024 * 1024
      : 2 * 1024 * 1024 * 1024; // 2 GB padrão
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

Resultado concreto: quando você executa `neofetch` na demo do navegador, o número de núcleos e a RAM exibidos correspondem à sua máquina. É um detalhe, mas contribui enormemente para a verossimilhança do terminal.

Os outros exports: `freemem` (40% da memória total, aproximação razoável), `platform` → `'browser'`, `type` → `'Linux'`, `release` → `'web'`, `uptime` via `performance.now()`, `endianness` → `'LE'` (little-endian, verdadeiro em todos os processadores x86/ARM de consumo), `loadavg` → `[0, 0, 0]`.

---

## `node:net` -- stubs TCP limpos

O navegador não tem acesso a sockets TCP brutos (WebSocket não conta -- é um protocolo de aplicação diferente). `node:net` é portanto um stub, mas um stub *bem escrito*.

```js
export class Socket {
  connect() { notImpl('Socket.connect')(); }
  on() { return this; }    // encadeável
  once() { return this; }  // encadeável
  pipe() { return this; }  // encadeável
  setEncoding() { return this; }
  remoteAddress = '127.0.0.1';
  remotePort = 0;
  // ...
}
```

O ponto importante: os métodos de registro de eventos (`on`, `once`, `off`, `emit`) retornam `this` e não lançam erro. Isso permite que o código que faz `new net.Socket().on('connect', cb)` funcione sem quebrar, mesmo que a conexão nunca seja estabelecida. Apenas os métodos que *tentam realmente se conectar* lançam um erro.

`isIP`, `isIPv4`, `isIPv6` são implementados corretamente (não são stubs) pois são usados pelo código de rede virtual para validar endereços, sem nunca abrir um socket.

---

## `node:path` -- operações de caminho POSIX

Reimplementação completa das operações de caminho POSIX, adaptada ao contexto (sem barras invertidas do Windows, caminhos sempre absolutos com `/`).

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

Simples, compacto, correto para os usos do projeto.

---

## `node:url` -- delegação para APIs do navegador

Esta é elegante pela sua simplicidade. A API `URL` e `URLSearchParams` já existe nativamente no navegador -- basta reexportá-las.

```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```

Apenas `fileURLToPath` e `pathToFileURL` precisam de implementação, pois são próprias do Node:

```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```

É a abordagem ideal quando a plataforma alvo (o navegador) já fornece o equivalente nativo.

---

## `node:zlib` -- identidade

```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```

Duas linhas. A biblioteca usa `fflate` para a compressão real (que funciona nativamente no navegador). `node:zlib` só é importado em caminhos de código que não são executados no contexto do navegador -- portanto um pass-through é suficiente.

Às vezes a boa implementação são duas linhas.

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

A implementação completa do `EventEmitter` do Node.js tem ~600 linhas com gerenciamento de `maxListeners`, `once`, `prependListener`, etc. Aqui são 12 linhas para os 4 métodos realmente usados. Tree-shaking mental antes mesmo do tree-shaking da ferramenta de build.

---

## `ssh2` e `roxify` -- stubs explícitos

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

O servidor SSH não roda no navegador (não faria sentido -- quem se conectaria?). Mas o código que *fala de SSH do lado cliente* -- as classes que constroem pacotes SSH, os parsers de protocolo -- existe na biblioteca. Esses stubs permitem que todo esse código seja empacotado sem erro, ao mesmo tempo que garantem que um erro claro seja lançado se alguém tentar chamar um método que requer um socket real.

`roxify` é um formato de compressão proprietário usado para snapshots VFS no modo Node. No navegador, `fflate` é usado em seu lugar -- o polyfill apenas lança um erro se `roxify` for chamado diretamente.

---

## `node:worker_threads` -- reexportação de Web Workers

Este é o mais sutil. `node:worker_threads` no Node.js e os Web Workers do navegador são duas APIs diferentes, mas são conceitualmente próximas. O polyfill faz o mapeamento:

```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```

`MessageChannel` e `MessagePort` são reexportados diretamente do navegador (mesma API). O `Worker` em si precisa de um wrapper pois o construtor é diferente (Node espera um caminho de módulo, o navegador espera uma URL). `isMainThread` é sempre `true` no lado do navegador neste contexto.

---

## Visão geral: o que essas 640 linhas representam

| Polyfill | Linhas | Estratégia |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array` + `DataView`, toda a API `Buffer` |
| `node:crypto` | 166 | SHA-256/HMAC/PBKDF2 do zero + Web Crypto para aleatórios |
| `node:fs` | 210 | `Map` em memória + IndexedDB async |
| `node:net` | 70 | Stubs encadeáveis + validações IP reais |
| `ssh2` | 74 | Stubs explícitos |
| `process.js` | 14 | `process` mínimo viável |
| `node:path` | ~30 | Operações de caminho POSIX |
| `node:url` | ~25 | Delegação para APIs do navegador |
| `node:events` | ~12 | EventEmitter 4 métodos |
| `node:os` | ~25 | `navigator.deviceMemory` / `hardwareConcurrency` |
| `node:zlib` | 4 | Pass-through |
| `node:worker_threads` | ~30 | Reexportação de Web Workers |
| `roxify.js` | 8 | Stubs |

640 linhas. Nenhuma dependência npm. Nenhum Wasm. E isso produz um bundle para navegador que inicia em menos de um segundo e roda sem nenhuma infraestrutura do lado do servidor.

---

## O que podemos aprender com isso

Da próxima vez que você quiser portar uma biblioteca Node.js para o navegador, eis o que a abordagem da Fortune demonstra:

1. **Identifique o que é realmente usado.** Não precisa implementar o `EventEmitter` inteiro se o código só usa `on`, `emit`, e `removeListener`.

2. **Delegue para APIs do navegador quando possível.** `URL`, `URLSearchParams`, `MessageChannel`, `MessagePort`, `crypto.getRandomValues` -- o navegador já tem tudo isso, é só usar.

3. **Cache síncrono na frente de uma API async.** A solução `Map` + IndexedDB para `node:fs` é o padrão mais reutilizável de toda a pasta.

4. **Stubs honestos são melhores que implementações incompletas silenciosas.** Um `throw new Error('not implemented in browser')` explícito é infinitamente mais útil que um `return undefined` que deixa o bug se manifestar 10 chamadas depois.

5. **esbuild `alias` + `inject` é subestimado.** É a ferramenta perfeita para esse tipo de portabilidade -- zero configuração webpack, zero plugin, apenas uma lista de substituições.

---

O código está no repositório: [github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills). Cada arquivo cabe em uma única página, é legível diretamente no GitHub. Altamente recomendado se você estiver trabalhando em um projeto similar.
