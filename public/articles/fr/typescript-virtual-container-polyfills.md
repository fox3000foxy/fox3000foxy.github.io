---
title: Faire tourner une bibliothèque Node.js dans le navigateur sans Wasm --
  les polyfills de typescript-virtual-container
description: Comment Fortune a réimplémenté à la main node:fs, node:crypto et
  une douzaine de modules Node en 640 lignes de JavaScript pour que le conteneur
  tourne dans le navigateur sans Wasm.
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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "2D+Oh85Kovogq6/Zpx7n1WnHZLakmZP4go/UuaPDq7aldAI0f6FFkodST5GLdn+UcdN6G974kXj7XfVLBDke2w=="
---

# Faire tourner une bibliothèque Node.js dans le navigateur sans Wasm -- les polyfills de typescript-virtual-container

J'ai récemment passé pas mal de temps à éplucher le code source de [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container), le projet de [Fortune (Chloé Rolzhausen)](https://itsrealfortune.fr). Et la partie qui m'a le plus surpris, c'est pas le VFS, c'est pas le réseau virtuel, c'est pas les 170 commandes Unix réimplémentées en TypeScript. C'est le dossier `polyfills/`.

Parce que le module tourne dans le navigateur, sans Wasm, et que pour ça, Fortune a réimplémenté à la main toute la couche `node:*` dont la bibliothèque a besoin. Environ 640 lignes de JavaScript artisanal qui remplacent `node:fs`, `node:crypto`, `node:os`, `node:net`, et quelques autres.

Cet article explique comment ça marche, polyfill par polyfill.

---

## Le problème de base

Une bibliothèque Node.js utilise des APIs qui n'existent pas dans le navigateur. Quand tu écris `import { readFileSync } from 'node:fs'`, c'est un appel système côté Node -- un vrai accès disque via libuv. Dans le navigateur, `node:fs` n'existe pas du tout.

Les solutions habituelles sont :

- **Un runtime Wasm** (type Emscripten, WASIp1/WASIp2) -- tu compile Node.js en Wasm et tu l'exécutes. Résultat : des bundles de 10-50 MB, un temps de chargement notable, une complexité de déploiement significative.
- **Des polyfills génériques** (type `browserify`, `webpack node: polyfills`) -- des bibliothèques npm qui fournissent des approximations de chaque module Node. Souvent trop lourdes, mal adaptées au cas spécifique.
- **Récrire les polyfills à la main** -- plus de travail, mais résultat optimal.

Fortune a choisi la troisième option. Et le résultat, c'est un bundle navigateur qui est juste la bibliothèque, qui démarre instantanément, et qui ne dépend d'aucune infrastructure extérieure.

---

## La mécanique de build

Tout repose sur esbuild et son option `alias`. Chaque import `node:*` est redirigé vers un fichier local :

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

L'option `inject` mérite d'être notée : elle permet d'injecter `process.js` et `buffer.js` en tête de chaque fichier du bundle, ce qui rend `process` et `Buffer` disponibles globalement sans aucun import explicite. Exactement comme Node.js les expose nativement.

---

## `buffer.js` -- `Buffer` sur `Uint8Array`

C'est l'un des deux globaux injectés. `Buffer` est massivement utilisé dans le code -- chaque opération SSH, chaque snapshot VFS, chaque lecture/écriture binaire passe par là.

La solution : une classe `BrowserBuffer` qui étend `Uint8Array` et implémente toute l'API `Buffer` de Node.js.

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

Ce qui est implémenté au total :
- `Buffer.from`, `Buffer.alloc`, `Buffer.allocUnsafe`, `Buffer.isBuffer`, `Buffer.concat`, `Buffer.byteLength`
- Toutes les méthodes d'écriture : `writeUInt8/16/32BE/LE`, `writeInt8/16/32BE/LE`, `writeBigUInt64BE/LE`, `writeFloat/DoubleLE/BE`
- Toutes les méthodes de lecture correspondantes
- `toString` avec support hex, base64, utf8
- `copy`, `equals`, `slice`, `subarray`

Ça représente 116 lignes. Pour ce que ça remplace, c'est remarquablement compact.

L'astuce principale est l'utilisation de `DataView` pour les accès multi-octets, ce qui gère correctement l'endianness sans avoir à manipuler les bits à la main pour chaque type :

```js
writeUInt32BE(val, offset = 0) {
  new DataView(this.buffer, this.byteOffset + offset).setUint32(0, val, false);
  return offset + 4;
}
```

---

## `process.js` -- le global `process` minimal

L'autre global injecté. Minuscule mais nécessaire -- le code teste souvent `process.env.NODE_ENV`, `process.platform`, `process.nextTick`, etc.

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

Le mapping `nextTick` → `queueMicrotask` est le détail le plus important ici. `process.nextTick` dans Node.js schedule un callback à la fin de la phase courante de la boucle d'événements, avant les I/O. `queueMicrotask` dans le navigateur fait quelque chose de sémantiquement très proche -- il schedule une microtâche, qui s'exécute avant le prochain rendu ou événement. C'est pas identique, mais c'est suffisamment proche pour que tout le code qui utilise `nextTick` fonctionne correctement dans le browser.

---

## `node:fs` -- IndexedDB comme système de fichiers synchrone

C'est le polyfill le plus sophistiqué, et de loin le plus intéressant techniquement.

Le problème est délicat : `node:fs` expose une API synchrone (`readFileSync`, `writeFileSync`, etc.), mais les APIs de stockage browser sont toutes asynchrones (IndexedDB, Cache API, etc.). On ne peut pas faire un `await` au milieu d'une fonction synchrone.

La solution de Fortune : un double niveau de cache.

**Niveau 1 -- Map en mémoire (synchrone)**  
Toutes les lectures se font depuis un `Map<string, Uint8Array>` en mémoire. Instantané, synchrone, pas de problème d'API.

**Niveau 2 -- IndexedDB (asynchrone, en arrière-plan)**  
Au démarrage, tout le contenu d'IndexedDB est chargé dans la Map. Les écritures se font immédiatement dans la Map *et* lancent une écriture asynchrone vers IndexedDB sans bloquer.

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

// Écriture async vers IndexedDB (non-bloquante)
function idbSet(path, value) {
  openDB().then(db => {
    const tx = db.transaction(STORE, 'readwrite');
    if (value === null) tx.objectStore(STORE).delete(path);
    else tx.objectStore(STORE).put(value, path);
  });
}
```

L'API exposée est complète : `readFileSync`, `writeFileSync`, `appendFileSync`, `existsSync`, `unlinkSync`, `rmSync` (avec option `recursive`), `mkdirSync` (avec option `recursive`), `readdirSync`, `statSync`, `renameSync`.

Il y a même une couche de gestion de file descriptors (`openSync`, `writeSync`, `closeSync`) pour que le journal WAL du VFS fonctionne en mode browser -- le journal ouvre un fd, écrit dedans, le ferme, et les données se retrouvent dans IndexedDB.

La propriété `ready` est exportée pour permettre au code de savoir quand le preload initial est terminé :

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

C'est grâce à ça que les snapshots VFS survivent aux rechargements de page dans le navigateur. Quand tu recharges le démo, le VFS est restauré exactement dans l'état où tu l'avais laissé, depuis IndexedDB, sans aucun serveur impliqué.

---

## `node:crypto` -- SHA-256, HMAC, PBKDF2 en JS pur

Plutôt que d'importer une bibliothèque crypto compilée en Wasm, Fortune a implémenté les primitives nécessaires directement.

**SHA-256** est implémenté from scratch avec les constantes FIPS 180-4 :

```js
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, /* ... 60 autres constantes */ 
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

Par-dessus SHA-256, **HMAC-SHA256** et **PBKDF2-HMAC-SHA256** sont construits. Ces deux primitives sont utilisées pour la dérivation de clés dans les échanges SSH et l'authentification interne.

L'API exportée ressemble à celle de Node.js :

```js
// Hash classique
const hash = createHash('sha256').update('data').digest('hex');

// Bytes aléatoires (via l'API Web Crypto standard)
const bytes = randomBytes(32);

// UUID
const id = randomUUID();

// Comparaison timing-safe
const ok = timingSafeEqual(a, b);

// scrypt (approché via PBKDF2)
const key = scryptSync(password, salt, 32, { N: 16384 });
```

Note : `scryptSync` est approximé via PBKDF2 avec un nombre d'itérations calé sur le paramètre `N`. C'est pas un vrai scrypt (qui utilise un schéma mémoire différent), mais pour les usages du projet c'est suffisant.

Les fonctions qui ne peuvent pas être émulées raisonnablement dans le browser (`generateKeyPairSync`, `createCipheriv`, `createDecipheriv`, `createSign`) lancent une erreur explicite si elles sont appelées. Comportement honnête.

---

## `node:os` -- lire les vraies specs du navigateur

Au lieu de retourner des valeurs fixes, ce polyfill lit les APIs du navigateur pour retourner des informations qui correspondent à la machine réelle de l'utilisateur.

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

Résultat concret : quand tu lances `neofetch` dans le démo navigateur, le nombre de coeurs et la RAM affichés correspondent à ta machine. C'est un détail, mais ça contribue énormément à la vraisemblance du terminal.

Les autres exports : `freemem` (40% de la mémoire totale, approximation raisonnable), `platform` → `'browser'`, `type` → `'Linux'`, `release` → `'web'`, `uptime` via `performance.now()`, `endianness` → `'LE'` (little-endian, vrai sur tous les processeurs x86/ARM grand public), `loadavg` → `[0, 0, 0]`.

---

## `node:net` -- stubs TCP propres

Le navigateur n'a pas accès aux sockets TCP bruts (WebSocket ne compte pas -- c'est un protocole applicatif différent). `node:net` est donc un stub, mais un stub *bien écrit*.

```js
export class Socket {
  connect() { notImpl('Socket.connect')(); }
  on() { return this; }    // chaînable
  once() { return this; }  // chaînable
  pipe() { return this; }  // chaînable
  setEncoding() { return this; }
  remoteAddress = '127.0.0.1';
  remotePort = 0;
  // ...
}
```

Le point important : les méthodes de registre d'événements (`on`, `once`, `off`, `emit`) retournent `this` et ne lancent pas d'erreur. Ça permet au code qui fait `new net.Socket().on('connect', cb)` de fonctionner sans planter, même si la connexion ne se fait jamais. Seules les méthodes qui *tentent réellement de se connecter* lancent une erreur.

`isIP`, `isIPv4`, `isIPv6` sont implémentés correctement (pas des stubs) car ils sont utilisés par le code réseau virtuel pour valider des adresses, sans jamais ouvrir de socket.

---

## `node:path` -- POSIX path operations

Réimplémentation complète des opérations de chemin POSIX, adaptée au contexte (pas de backslash Windows, chemins toujours absolus avec `/`).

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

Simple, compact, correct pour les usages du projet.

---

## `node:url` -- délégation aux APIs navigateur

Celle-là est élégante par sa simplicité. L'API `URL` et `URLSearchParams` existe déjà nativement dans le navigateur -- il suffit de les ré-exporter.

```js
const _URL = globalThis.URL;
const _URLSearchParams = globalThis.URLSearchParams;
export { _URL as URL, _URLSearchParams as URLSearchParams };
```

Seules `fileURLToPath` et `pathToFileURL` nécessitent une implémentation, car elles sont propres à Node :

```js
export function fileURLToPath(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') throw new TypeError('...');
  return decodeURIComponent(u.pathname);
}
```

C'est l'approche idéale quand la plateforme cible (le navigateur) fournit déjà l'équivalent natif.

---

## `node:zlib` -- identité

```js
export function gzipSync(buf) { return buf; }
export function gunzipSync(buf) { return buf; }
export default { gzipSync, gunzipSync };
```

Deux lignes. La bibliothèque utilise `fflate` pour la compression réelle (qui fonctionne en browser nativement). `node:zlib` n'est importé que dans des chemins de code qui ne s'exécutent pas dans le contexte browser -- donc un passthrough est suffisant.

Parfois la bonne implémentation c'est deux lignes.

---

## `node:events` -- EventEmitter minimal

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

L'implémentation complète de `EventEmitter` de Node.js fait ~600 lignes avec la gestion des `maxListeners`, `once`, `prependListener`, etc. Ici c'est 12 lignes pour les 4 méthodes réellement utilisées. Tree-shaking mental avant même le tree-shaking de l'outil de build.

---

## `ssh2` et `roxify` -- stubs explicites

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

Le serveur SSH ne tourne pas dans le navigateur (ça n'aurait aucun sens -- qui se connecterait ?). Mais le code qui *parle de SSH côté client* -- les classes qui construisent des paquets SSH, les parseurs de protocole -- existe dans la bibliothèque. Ces stubs permettent à tout ce code d'être bundlé sans erreur, tout en garantissant qu'une erreur claire est levée si quelqu'un tente d'appeler une méthode qui nécessite un vrai socket.

`roxify` est un format de compression propriétaire utilisé pour les snapshots VFS en mode Node. Dans le navigateur, c'est `fflate` qui est utilisé à la place -- le polyfill se contente de lancer une erreur si `roxify` est appelé directement.

---

## `node:worker_threads` -- réexport des Web Workers

C'est le plus subtil. `node:worker_threads` dans Node.js et les Web Workers du navigateur sont deux APIs différentes, mais elles sont conceptuellement proches. Le polyfill fait le mapping :

```js
const _MessageChannel = globalThis.MessageChannel;
const _MessagePort = globalThis.MessagePort;
const _Worker = globalThis.Worker;

export { _MessageChannel as MessageChannel, _MessagePort as MessagePort };
export const isMainThread = true;
export const workerData = null;
export const parentPort = null;
```

`MessageChannel` et `MessagePort` sont ré-exportés directement depuis le browser (même API). `Worker` lui-même nécessite un wrapper car le constructeur est différent (Node attend un chemin de module, le browser attend une URL). `isMainThread` est toujours `true` côté navigateur dans ce contexte.

---

## Vue d'ensemble : ce que représentent ces 640 lignes

| Polyfill | Lignes | Stratégie |
|---|---|---|
| `buffer.js` | 116 | `Uint8Array` + `DataView`, toute l'API `Buffer` |
| `node:crypto` | 166 | SHA-256/HMAC/PBKDF2 from scratch + Web Crypto pour les randoms |
| `node:fs` | 210 | `Map` en mémoire + IndexedDB async |
| `node:net` | 70 | Stubs chainables + validations IP réelles |
| `ssh2` | 74 | Stubs explicites |
| `process.js` | 14 | Minimal viable `process` |
| `node:path` | ~30 | POSIX path ops |
| `node:url` | ~25 | Délégation aux APIs browser |
| `node:events` | ~12 | EventEmitter 4 méthodes |
| `node:os` | ~25 | `navigator.deviceMemory` / `hardwareConcurrency` |
| `node:zlib` | 4 | Passthrough |
| `node:worker_threads` | ~30 | Réexport Web Workers |
| `roxify.js` | 8 | Stubs |

640 lignes. Aucune dépendance npm. Aucun Wasm. Et ça donne un bundle navigateur qui démarre en moins d'une seconde et tourne sans aucune infrastructure côté serveur.

---

## Ce qu'on peut en tirer

La prochaine fois que tu veux porter une bibliothèque Node.js dans le navigateur, voilà ce que l'approche de Fortune démontre :

1. **Identifie ce qui est réellement utilisé.** Pas besoin d'implémenter `EventEmitter` en entier si le code n'utilise que `on`, `emit`, et `removeListener`.

2. **Délègue aux APIs navigateur quand c'est possible.** `URL`, `URLSearchParams`, `MessageChannel`, `MessagePort`, `crypto.getRandomValues` -- le navigateur les a déjà, autant les utiliser.

3. **Le cache synchrone devant une API async.** La solution `Map` + IndexedDB pour `node:fs` est le pattern le plus réutilisable de tout le dossier.

4. **Les stubs honnêtes valent mieux que les implémentations incomplètes silencieuses.** Un `throw new Error('not implemented in browser')` explicit est infiniment plus utile qu'un `return undefined` qui laisse le bug se manifester 10 appels plus loin.

5. **esbuild `alias` + `inject` est sous-estimé.** C'est l'outil parfait pour ce genre de portage -- zéro configuration webpack, zéro plugin, juste une liste de remplacements.

---

Le code est dans le repo : [github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills](https://github.com/itsrealfortune/typescript-virtual-container/tree/main/polyfills). Chaque fichier tient en une seule page, c'est lisible directement sur GitHub. Fortement recommandé si tu travailles sur un projet similaire.
