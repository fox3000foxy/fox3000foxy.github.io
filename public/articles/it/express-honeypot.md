---
title: "Ho costruito un honeypot Express ultra-realistico"
description: "328 endpoint fittizi con risposte generate al volo, spoofing di intestazioni, registrazione del traffico bot -- un'analisi approfondita di un middleware honeypot Express progettato per ingannare gli scanner."
aiGenerated: true
tags:
  - express
  - nodejs
  - security
  - honeypot
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "4H4Jc4bCJ7ykEM5DGxPnReoZFEy5kPEIHkOSsd6S3wpvBdR8FRsYGH9al/7WF0xBUtY6fQpOOMMCdQF8ANYenA=="
---

## Cos'è un honeypot Express?

Un honeypot è un'esca che imita un sistema reale per attrarre e rilevare gli aggressori. Nel contesto di un'applicazione web Express, è un middleware che intercetta richieste sospette e risponde con contenuti fittizi credibili, permettendo di analizzare il comportamento di bot e scanner senza esporre dati reali.

**express-middleware-honeypot** è un pacchetto npm che trasforma la tua applicazione Express in un vero e proprio vaso di miele. Espone **328 endpoint** che coprono un'ampia gamma di tipici bersagli d'attacco -- file di configurazione, credenziali, pagine di amministrazione, endpoint API, pagine di phishing bancario, e molto altro.

Ogni endpoint genera una risposta **al volo**, con timestamp e ID di richiesta freschi, rendendo ogni risposta unica e credibile.

## Installazione

```bash
npm install express-middleware-honeypot
```

## Utilizzo

### Registrazione automatica con `register()`

Il modo più semplice per usare l'honeypot è chiamare `register()` sulla tua applicazione Express. Questo registra tutti i middleware -- logging, intestazioni, gestore 404 -- in una sola volta:

```js
const express = require("express");
const { createHoneypot } = require("express-middleware-honeypot");

const app = express();

const instance = createHoneypot({
    knownPaths: ["/", "/login", "/support"],
    knownPatterns: [/^\/blogs\/[^/]+$/],
    knownApiPaths: ["/api/cart", "/api/cart/list"],
    knownApiPatterns: [/^\/api\/cart\/[^/]+$/],
    logTraffic: true,
    is404Handler: true,
    isCompleteResponses: false,
});

instance.register(app);

app.listen(3000, () => {
    console.log("Server running on port 3000");
});
```

### Middleware unico con `app.use()`

Per un controllo più preciso, puoi usare il middleware generico:

```js
const { createHoneypot } = require("express-middleware-honeypot");

const app = express();

// Le tue route reali prima
app.get("/", (req, res) => res.send("Home"));

// Poi l'honeypot
const instance = createHoneypot({ /* opzioni */ });
app.use(instance.middleware);
app.use(instance.phpSpoofer);
```

### Mock individuali con `app.all()`

Puoi anche selezionare endpoint specifici:

```js
const instance = createHoneypot({ /* opzioni */ });

app.all('/admin', instance.mocks['/admin']);
app.all('/.env', instance.mocks['/.env']);
app.all('/wp-admin', instance.mocks['/wp-admin']);
```

`instance.mocks` è un `Record<string, Middleware>` indicizzato per percorso endpoint.

## Spoofing delle intestazioni

Il middleware delle intestazioni (`instance.headersMiddleware`) imposta intestazioni di risposta realistiche -- `Server: nginx/1.24.0`, `X-Frame-Options`, `X-XSS-Protection`, e specialmente un'intestazione `X-Powered-By` dinamica basata sull'estensione del file:

- `.php` → `X-Powered-By: PHP/8.1.12`
- `.jsp` → `X-Powered-By: JSP/3.0`
- `.aspx/.ashx/.asmx` → `X-Powered-By: ASP.NET`
- `.do/.action` → `X-Powered-By: Servlet/3.0`
- Altri → nessuna intestazione `X-Powered-By`

```js
app.use(instance.headersMiddleware);
app.use(instance.middleware);
```

## PHP Spoofer

Il `instance.phpSpoofer` va oltre: intercetta le richieste `*.php` e le **proxy verso il tuo server PHP locale**, restituendo un rendering PHP reale invece di una risposta statica:

```js
app.use(instance.phpSpoofer);
```

Come funziona:
1. Cattura richieste con `.php` nel percorso
2. Rimuove il suffisso `.php` e fa proxy verso `http://localhost:<port>/<base>`
3. Se il tuo server PHP locale risponde (Valet, Laravel, ecc.), l'HTML viene restituito
4. Se l'host non è localhost, restituisce un 404 (previene attacchi SSRF)
5. Nessun server PHP locale? Passa al gestore 404

Questo permette di eseguire una vera applicazione WordPress/PHP in locale e servire pagine realmente renderizzate ai bot mentre si usano risposte statiche in produzione.

## Opzioni di configurazione

| Opzione | Tipo | Default | Descrizione |
|---|---|---|---|
| `knownPaths` | `string[]` | `[]` | Percorsi gestiti dall'app reale (esclusi dai mock) |
| `knownPatterns` | `RegExp[]` | `[]` | Espressioni regolari per percorsi reali |
| `knownApiPaths` | `string[]` | `[]` | Percorsi API dell'app reale |
| `knownApiPatterns` | `RegExp[]` | `[]` | Espressioni regolari per percorsi API reali |
| `logTraffic` | `boolean` | `false` | Registra tutto il traffico in `traffic.txt` |
| `is404Handler` | `boolean` | `false` | Registra un gestore 404 di fallback |
| `isCompleteResponses` | `boolean` | `false` | Usa la variante «complete» (ricca di dettagli) |
| `additionalEndpoints` | `string[]` | `["/not_covered_endpoint_test"]` | Endpoint aggiuntivi oltre ai 328 integrati |
| `enrichResponses` | `boolean` | `true` | Arricchisce risposte JSON con timestamp/versione |

## I mock -- 328 endpoint in due varianti

Il generatore di mock (`src/services/mockupGenerator.ts`) produce risposte **al volo** per 328 endpoint, ciascuno in due varianti:

- **Default** -- succinto ma credibile (`{ code: 0, message: "ok", data: {...} }`)
- **Complete** -- risposte ricche con timestamp, ID richiesta, metadati, intestazioni di versione, ecc.

Per scrivere i mock su disco (debug):

```bash
bun run scripts/generate-mockups.ts --dry-run          # solo anteprima
bun run scripts/generate-mockups.ts --list-uncategorized  # endpoint generici
```

### Tipi di contenuto serviti

| Tipo | Esempi di endpoint |
|---|---|
| Fughe di credenziali | `.env`, `secrets.json`, `aws/credentials`, `etc/shadow` |
| Chiavi SSH | `.ssh/id_rsa`, `.ssh/id_ed25519` |
| Config di database | `config/database`, `wp-config.php`, `docker-compose.yml` |
| Pannelli di amministrazione | `/admin`, `/wp-admin`, `/manage/account/login` |
| Risposte API | `/api/version`, `/api/config`, `.do`, `.ashx` |
| Phishing bancario | `/lander/sber*`, `/index_sber.php` |
| Battiti C2 | Percorsi casuali di 6+ caratteri (`/262LBNFp`, `/Kd67Fq1x`) |
| Azioni/Crypto | `/stock/mzhishu`, `/kline/1m/1`, `/m/allticker/1` |
| Giochi/Scommesse | `/proxy/games`, `/Ctrls/GetSysCoin`, `/room/getRoomBangFans` |
| File di configurazione | `config.json`, `config.yml`, `sitemap.xml`, `ads.txt` |
| Pagine iniziali | `/about`, `/contact`, `/products`, `/blog` |

## Endpoint di analisi

| Route | Descrizione |
|---|---|
| `GET /newBotsRoute` | Restituisce route sconosciute non gestite trovate nei log di traffico |
| `GET /notCoveredAdditionalEndpoints` | Restituisce endpoint aggiuntivi non coperti dai 328 integrati |

## API HoneypotInstance

```ts
interface HoneypotInstance {
  mocks: Record<string, Middleware>;       // Gestori individuali
  middleware: Middleware;                  // Middleware generico
  headersMiddleware: Middleware;           // Intestazioni di risposta realistiche
  phpSpoofer: Middleware;                  // Middleware di spoofing PHP
  notFoundHandler: Middleware;             // Gestore 404 di fallback
  register(app: RouteApp): void;           // Registra tutti i gestori
  getUnhandledRoutes(): Promise<string[]>; // Route bot non gestite
  getNotCoveredEndpoints(): string[];      // Endpoint aggiuntivi non coperti
}
```

## Sviluppo

```bash
bun install
bun test          # 36+ test
bun run build     # TypeScript → dist/
```

## Nota di sicurezza

Questo pacchetto è uno strumento di esca/inganno. Non esporre dati sensibili reali attraverso la tua applicazione mentre è in esecuzione.

## Licenza

MIT

---

Il codice sorgente è disponibile su GitHub : [express-honeypot-middleware](https://github.com/fox3000foxy/express-honeypot-middleware)
