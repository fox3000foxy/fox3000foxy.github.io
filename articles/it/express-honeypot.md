---
title: "Ho costruito un honeypot Express ultra-realistico"
description: "328 endpoint finti con risposte generate al volo, spoofing di header, logging del traffico bot: immersione nel cuore di un middleware honeypot Express pensato per ingannare gli scanner."
date: 2026-06-10
aiGenerated: true
tags:
  - express
  - nodejs
  - security
  - honeypot
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "FJ7MPH/zjUIV+jyQ5HsnHJ1NRInilVldCReRl3DTFsZTbtYrCGmDU1ckIzkHZqHWNNnbslA3CSrh7501l/JqnA=="
---

## TL;DR

Ho creato un middleware Express che espone **328 endpoint fittizi** a scelta tra due varianti: `default` (risposte sobrie ma credibili) e `complete` (risposte molto dettagliate). Ogni risposta è **generata al volo** con timestamp e identificatori di richiesta freschi, il che rende ogni risposta unica. Non c'è alcun file mock sul disco. Il middleware può anche **registrare il traffico** in un file di testo ed esporre le route non gestite su `/newBotsRoute` per analizzare cosa cercano i bot.

**È molto più di un semplice rinvio di 404.** Ho progettato questo pezzo di ingegneria per assomigliare a un vero server, perché gli scanner sprechino il loro tempo lì sopra. Ti mostro come funziona.

## Il problema

I bot di sicurezza, gli scraper e gli attori malevoli scansionano di continuo i server web in cerca di route comuni:

- `.env`, `wp-config.php`, `admin/`, `phpinfo.php`, ecc.
- endpoint di API come `/api/version`, `/api/config`
- file di configurazione: `dump.sql`, `.git/config`, `docker-compose.yml`
- pagine di phishing bancario: `/lander/sberbank*`, `/index_sber.php`

Ho visto questo limite sui miei server: restituire un 404 o un 403 indica subito allo scanner che la route non esiste, quindi passa alla successiva. Ho scelto l'inverso con questo honeypot: **far credere allo scanner che tutto esista**, per fargli perdere tempo su false risposte mentre il tuo vero server resta protetto dietro le tue route note.

## L'architettura

### 1. Un classificatore, non una lookup table

Il pezzo forte è una funzione `classify()` in `src/services/mockupGenerator.ts` che prende un percorso di endpoint e restituisce un generatore di risposta. L'ho costruita come una cascata di regole:

1. **Corrispondenze esatte**: gli endpoint più comuni hanno generatori dedicati
2. **Corrispondenze per pattern**: regex sul percorso per rilevare pattern come `id_rsa`, `wp-admin`, `sitemap.xml`
3. **Classificazione intelligente**: percorsi come `/262LBNFp` (6+ caratteri casuali) sono classificati come "battiti di cuore C2"
4. **Regole acchiappatutto**: i percorsi di API, i file `.php`, `.html`, `.js`, `.json` e `.asmx` hanno generatori generici
5. **Catchall finale**: `genCatchall()` produce una risposta JSON generica con metadati

Amo questo approccio perché le risposte restano **fresche a ogni richiesta**: nessun file statico, nessuna cache, ogni risposta porta il suo timestamp come se venisse da un vero server.

### 2. Il sistema a doppia variante

Ogni generatore supporta due varianti:

```typescript
// due livelli di dettaglio per ogni risposta
type Variant = "default" | "complete";
```

- **`default`**: risposte concise ma credibili. Esempio per `.env`:
  ```
  DB_HOST=localhost
  DB_USER=root
  DB_PASS=s3cur3P@ss
  APP_ENV=development
  APP_DEBUG=true
  ```

- **`complete`**: risposte molto dettagliate. Esempio per `.env`:
  ```
  # Database
  DB_CONNECTION=mysql
  DB_HOST=db-master-01.internal.example.com
  DB_PORT=3306
  DB_DATABASE=production_app_v2
  DB_USER=admin_service
  DB_PASS=mM9k#2$xL!qR7pZ

  # Redis
  REDIS_HOST=redis-cluster-01.internal.example.com
  REDIS_PORT=6379
  REDIS_PASSWORD=R3d!s_S3cur3_K3y_2025

  # App
  APP_ENV=production
  APP_DEBUG=false
  APP_URL=https://admin.internal.example.com
  APP_KEY=base64:qJ3fR8mL2pX5vB7nC4kA9wE1yH6sD0tG
  ...
  ```

La variante `complete` include anche pagine HTML complete con CSS stilizzato: pagine di amministrazione, schermate di login WordPress, pagine di phishing bancario in russo, ecc. La trovo temibile quando vuoi davvero occupare uno scanner.

### 3. Generazione al volo

Uso `Date.now()` e `Date().toISOString()` per produrre timestamp e identificatori di richiesta unici a ogni chiamata. Ecco la funzione di arricchimento:

```typescript
// aggiunge timestamp freschi a ogni risposta
function enrichResponse(response: Record<string, unknown>): Record<string, unknown> {
  return {
    ...response,
    timestamp: getTimestamp(),
    version: "1.0",
    lastUpdated: getTimestamp(),
  };
}
```

Per le risposte JSON, il middleware prova a parsare e arricchire con questi campi. Le risposte non-JSON sono rinviate così come sono.

### 4. Il middleware di spoofing di header

Ho aggiunto un middleware dedicato che definisce header HTTP realistici in base all'estensione del file richiesto:

```typescript
// header credibili in base all'estensione
res.setHeader("Server", "nginx/1.24.0");
res.setHeader("X-Frame-Options", "SAMEORIGIN");
res.setHeader("X-XSS-Protection", "1; mode=block");
res.setHeader("X-Content-Type-Options", "nosniff");
res.setHeader("X-Robots-Tag", "noindex, nofollow");
res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

// X-Powered-By realistico basato sull'estensione del file
if (path.endsWith(".php")) res.setHeader("X-Powered-By", "PHP/8.1.12");
else if (path.endsWith(".jsp")) res.setHeader("X-Powered-By", "JSP/3.0");
else if (path.endsWith(".aspx") || path.endsWith(".ashx") || path.endsWith(".asmx"))
  res.setHeader("X-Powered-By", "ASP.NET");
else if (path.endsWith(".do") || path.endsWith(".action"))
  res.setHeader("X-Powered-By", "Servlet/3.0");
```

Rende le risposte molto più credibili: un endpoint `.php` con `X-Powered-By: PHP/8.1.12` e `Server: nginx/1.24.0` assomiglia esattamente a un vero server WordPress. Tengo a questo dettaglio perché spesso è l'header che tradisce un falso server.

### 5. Il PHP Spoofer

Il `phpSpoofer` resta il mio componente preferito. Se una richiesta arriva per un file `.php` e l'host è localhost, il middleware **fa proxy** della richiesta verso il tuo server PHP locale, che elabora e rinvia una vera pagina PHP. Se l'host è remoto, rinvia un 404 per bloccare ogni tentativo SSRF.

```typescript
// proxy verso PHP locale, 404 se host remoto
const phpSpoofer = async (req, res, next) => {
  if (!req.path?.match(/\.php$/)) return next();
  const host = req.headers?.host;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]")) {
    const baseUrl = req.originalUrl.replace(/\.php.*$/, "");
    const response = await fetch(`http://${host}${baseUrl}`);
    // rinvia la vera risposta PHP
  } else {
    res.status(404).send("404 Not Found");
  }
};
```

Permette, quando fai girare WordPress in locale, di avere l'honeypot che serve **vere** pagine WordPress ai bot: il massimo del realismo secondo la mia esperienza.

### 6. Registrazione e analisi del traffico

Ho separato due responsabilità: il `TrafficService` registra ogni richiesta in un file JSON-lines. L'`UnhandledRoutesService` analizza poi questi log per identificare i percorsi richiesti dai bot che restano da coprire nell'honeypot.

```typescript
// espone le route viste dai bot ma non ancora coperte
app.get("/newBotsRoute", async (_req, res) => {
  const routes = await unhandledRoutesService.getUnhandledRoutes(
    additionalEndpoints, knownPathOptions
  );
  res.setHeader("Content-Type", "text/plain");
  res.send(routes.join("\n"));
});
```

Adoro questo ciclo di feedback: più lasci girare l'honeypot, più impari cosa cercano i bot, e puoi aggiungere questi percorsi ai tuoi endpoint noti.

### 7. Endpoint noti ed esclusione

Il middleware accetta liste di `knownPaths`, `knownPatterns`, `knownApiPaths` e `knownApiPatterns`. Qualsiasi route che corrisponde a queste attraversa il middleware verso la tua vera applicazione. Trovo questo filtro indispensabile: i tuoi veri endpoint restano intatti, l'honeypot non li intercetta mai.

```typescript
// le route note passano oltre l'honeypot
const matches = (p) => p === endpoint || p.startsWith(endpoint + "/");
```

## I 328 endpoint in dettaglio

Ecco come sono classificati (estratto dal classificatore):

| Categoria | Esempi di endpoint |
|---|---|
| Fughe di credenziali | `.env`, `secrets.json`, `aws/credentials`, `etc/shadow` |
| Chiavi SSH | `.ssh/id_rsa`, `.ssh/id_ed25519` |
| Config di database | `config/database`, `wp-config.php`, `docker-compose.yml` |
| Pannelli di amministrazione | `/admin`, `/wp-admin`, `/manage/account/login` |
| Risposte API | `/api/version`, `/api/config`, `.do`, `.ashx` |
| Phishing bancario | `/lander/sber*`, `/index_sber.php` |
| Battiti di cuore C2 | Percorsi casuali di 6+ caratteri (`/262LBNFp`) |
| Azioni/Borsa | `/stock/mzhishu`, `/kline/1m/1`, `/m/allticker/1` |
| Giochi/Casinò | `/proxy/games`, `/Ctrls/GetSysCoin`, `/room/getRoomBangFans` |
| File di configurazione | `config.json`, `config.yml`, `sitemap.xml`, `ads.txt` |
| Pagine di atterraggio | `/about`, `/contact`, `/products`, `/blog` |

## Codici ed endpoint speciali

Ho aggiunto generatori specializzati per casi particolari:

- **`genLanding()`**: pagine di phishing bancario in russo per СберБанк, Тинькофф, Газпромбанк
- **`genC2Heartbeat()`**: risposta di battito di cuore C2 realistica con `agent_id`, `group`, `version`
- **`genScannerPath()`**: trappole per scanner specifici (porte nmap NICE, Hazelcast, CGI)
- **`genChineseApi()`**: risposte di API cinesi con `msg: "成功"` (successo)
- **`genMerchant()`**: profili di commercianti con `balance`, `fee_rate`, `tier`

## Come usarlo

### Installazione

```bash
npm install express-middleware-honeypot
```

### Uso base con auto-registrazione

```javascript
// registra l'honeypot su express
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
app.listen(3000);
```

### Con app.use() (middleware acchiappatutto unico)

```javascript
// vere route prima, honeypot dopo
const { createHoneypot } = require("express-middleware-honeypot");
const app = express();

// Le tue vere route per prime
app.get("/", (req, res) => res.send("Home"));

// Poi l'honeypot acchiappatutto
const instance = createHoneypot({ /* opzioni */ });
app.use(instance.headersMiddleware);
app.use(instance.middleware);
```

### Risposte complete contro default

```javascript
// Risposte dettagliate con pagine HTML complete
const instance = createHoneypot({ isCompleteResponses: true });
```

### Registrazione del traffico

```javascript
// logga ciò che i bot chiedono in traffic.txt
const instance = createHoneypot({ logTraffic: true });
// Consulta il file traffic.txt per vedere cosa chiedono i bot
```

## Conclusione

Questo middleware honeypot Express va ben oltre una semplice esca. Con **328 endpoint**, una **generazione al volo**, uno **spoofing di header dinamico**, una **registrazione del traffico** e persino un **proxy PHP** per vere risposte WordPress, l'ho pensato per restare il più realistico possibile.

Gli scanner perdono tempo su pagine di amministrazione fittizie, file `.env` credibili e pagine di phishing bancario mentre la tua vera applicazione resta protetta. Apprezzo in particolare il sistema a doppia variante e la classificazione intelligente: ogni risposta resta fresca e adatta al percorso richiesto.

Il codice sorgente è disponibile su GitHub: [https://github.com/fox3000foxy/express-honeypot-middleware](https://github.com/fox3000foxy/express-honeypot-middleware)
