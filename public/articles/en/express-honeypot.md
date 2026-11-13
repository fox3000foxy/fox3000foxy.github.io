---
title: "I Built an Ultra-Realistic Express Honeypot"
description: "328 fake endpoints with on-the-fly generated responses, header spoofing, bot traffic logging -- a deep dive into an Express honeypot middleware designed to fool scanners."
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
author_sig: "H5KCV907HmlL4GNzz6PXpogYdCtmEqbAyn72XXLpRbtLBQbW1pPAV2nBRxhBv6DsD5M5c1PE49ZmmyhwuyJIhw=="
---

## TL;DR

I created an Express middleware that exposes **328 fake endpoints** with a choice of two variants: `default` (concise but believable responses) and `complete` (very detailed responses). Every response is **generated on the fly** with fresh timestamps and request IDs, which makes each response unique. There's no mock file on disk. The middleware can also **log traffic** to a text file and expose unhandled routes on `/newBotsRoute` to analyze what bots are looking for.

**It's way more than just returning 404s.** I designed this engineering piece to look like a real server, so scanners waste their time on it. Let me show you how it works.

## The problem

Security bots, scrapers, and malicious actors constantly scan web servers for common routes:

- `.env`, `wp-config.php`, `admin/`, `phpinfo.php`, etc.
- API endpoints like `/api/version`, `/api/config`
- Config files: `dump.sql`, `.git/config`, `docker-compose.yml`
- Banking phishing pages: `/lander/sberbank*`, `/index_sber.php`

I saw this limit on my own servers: returning a 404 or 403 immediately tells the scanner the route doesn't exist, so it moves on. I chose the opposite with this honeypot: **make the scanner believe everything exists**, so it wastes time on fake responses while your real server stays protected behind your known routes.

## The architecture

### 1. A classifier, not a lookup table

The centerpiece is a `classify()` function in `src/services/mockupGenerator.ts` that takes an endpoint path and returns a response generator. I built it as a rule cascade:

1. **Exact matches**: the most common endpoints get dedicated generators
2. **Pattern matches**: regexes on the path to detect patterns like `id_rsa`, `wp-admin`, `sitemap.xml`
3. **Smart classification**: paths like `/262LBNFp` (6+ random chars) are classified as "C2 heartbeats"
4. **Catch-all rules**: API paths, `.php`, `.html`, `.js`, `.json`, and `.asmx` files get generic generators
5. **Final catchall**: `genCatchall()` produces a generic JSON response with metadata

I like this approach because responses stay **fresh on every request**: no static files, no caching, every response carries its own timestamp as if it came from a real server.

### 2. The dual-variant system

Each generator supports two variants:

```typescript
type Variant = "default" | "complete";
```

- **`default`**: concise but believable responses. Example for `.env`:
  ```
  DB_HOST=localhost
  DB_USER=root
  DB_PASS=s3cur3P@ss
  APP_ENV=development
  APP_DEBUG=true
  ```

- **`complete`**: very detailed responses. Example for `.env`:
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

The `complete` variant also includes full HTML pages with styled CSS: admin pages, WordPress login screens, banking phishing pages in Russian, etc. I find it formidable when you really want to keep a scanner busy.

### 3. On-the-fly generation

I use `Date.now()` and `Date().toISOString()` to produce unique timestamps and request IDs on every call. Here's the enrichment function:

```typescript
function enrichResponse(response: Record<string, unknown>): Record<string, unknown> {
  return {
    ...response,
    timestamp: getTimestamp(),
    version: "1.0",
    lastUpdated: getTimestamp(),
  };
}
```

For JSON responses, the middleware tries to parse and enrich with those fields. Non-JSON responses are returned as is.

### 4. The header-spoofing middleware

I added a dedicated middleware that sets realistic HTTP headers based on the requested file extension:

```typescript
res.setHeader("Server", "nginx/1.24.0");
res.setHeader("X-Frame-Options", "SAMEORIGIN");
res.setHeader("X-XSS-Protection", "1; mode=block");
res.setHeader("X-Content-Type-Options", "nosniff");
res.setHeader("X-Robots-Tag", "noindex, nofollow");
res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

// Realistic X-Powered-By based on file extension
if (path.endsWith(".php")) res.setHeader("X-Powered-By", "PHP/8.1.12");
else if (path.endsWith(".jsp")) res.setHeader("X-Powered-By", "JSP/3.0");
else if (path.endsWith(".aspx") || path.endsWith(".ashx") || path.endsWith(".asmx"))
  res.setHeader("X-Powered-By", "ASP.NET");
else if (path.endsWith(".do") || path.endsWith(".action"))
  res.setHeader("X-Powered-By", "Servlet/3.0");
```

That makes responses way more believable: a `.php` endpoint with `X-Powered-By: PHP/8.1.12` and `Server: nginx/1.24.0` looks exactly like a real WordPress server. I care about that detail because the header is often what gives away a fake server.

### 5. The PHP Spoofer

The `phpSpoofer` remains my favorite component. If a request comes in for a `.php` file and the host is localhost, the middleware **proxies** the request to your local PHP server, which processes it and returns a real PHP page. If the host is remote, it returns a 404 to block any SSRF attempt.

```typescript
const phpSpoofer = async (req, res, next) => {
  if (!req.path?.match(/\.php$/)) return next();
  const host = req.headers?.host;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]")) {
    const baseUrl = req.originalUrl.replace(/\.php.*$/, "");
    const response = await fetch(`http://${host}${baseUrl}`);
    // return the real PHP response
  } else {
    res.status(404).send("404 Not Found");
  }
};
```

That way, when you're running WordPress locally, the honeypot serves **real** WordPress pages to bots: the maximum realism in my experience.

### 6. Traffic logging and analysis

I separated two responsibilities: the `TrafficService` logs every request in a JSON-lines file. The `UnhandledRoutesService` then analyzes those logs to identify paths bots request that the honeypot doesn't cover yet.

```typescript
app.get("/newBotsRoute", async (_req, res) => {
  const routes = await unhandledRoutesService.getUnhandledRoutes(
    additionalEndpoints, knownPathOptions
  );
  res.setHeader("Content-Type", "text/plain");
  res.send(routes.join("\n"));
});
```

I love that feedback loop: the longer you let the honeypot run, the more you learn what bots are looking for, and you can add those paths to your known endpoints.

### 7. Known endpoints and exclusion

The middleware accepts lists of `knownPaths`, `knownPatterns`, `knownApiPaths`, and `knownApiPatterns`. Any route matching them passes through the middleware to your real app. I find that filter essential: your real endpoints stay intact, the honeypot never intercepts them.

```typescript
const matches = (p) => p === endpoint || p.startsWith(endpoint + "/");
```

## The 328 endpoints in detail

Here's how they're classified (excerpt from the classifier):

| Category | Example endpoints |
|---|---|
| Credential leaks | `.env`, `secrets.json`, `aws/credentials`, `etc/shadow` |
| SSH keys | `.ssh/id_rsa`, `.ssh/id_ed25519` |
| Database configs | `config/database`, `wp-config.php`, `docker-compose.yml` |
| Admin panels | `/admin`, `/wp-admin`, `/manage/account/login` |
| API responses | `/api/version`, `/api/config`, `.do`, `.ashx` |
| Banking phishing | `/lander/sber*`, `/index_sber.php` |
| C2 heartbeats | Random 6+ char paths (`/262LBNFp`) |
| Stock/Trading | `/stock/mzhishu`, `/kline/1m/1`, `/m/allticker/1` |
| Games/Casino | `/proxy/games`, `/Ctrls/GetSysCoin`, `/room/getRoomBangFans` |
| Config files | `config.json`, `config.yml`, `sitemap.xml`, `ads.txt` |
| Landing pages | `/about`, `/contact`, `/products`, `/blog` |

## Special codes and endpoints

I added specialized generators for particular cases:

- **`genLanding()`**: banking phishing pages in Russian for СберБанк, Тинькофф, Газпромбанк
- **`genC2Heartbeat()`**: realistic C2 heartbeat response with `agent_id`, `group`, `version`
- **`genScannerPath()`**: traps for specific scanners (nmap NICE ports, Hazelcast, CGI)
- **`genChineseApi()`**: Chinese API responses with `msg: "成功"` (success)
- **`genMerchant()`**: merchant profiles with `balance`, `fee_rate`, `tier`

## How to use it

### Install

```bash
npm install express-middleware-honeypot
```

### Basic usage with auto-registration

```javascript
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

### With app.use() (single catch-all middleware)

```javascript
const { createHoneypot } = require("express-middleware-honeypot");
const app = express();

// Your real routes first
app.get("/", (req, res) => res.send("Home"));

// Then the catch-all honeypot
const instance = createHoneypot({ /* options */ });
app.use(instance.headersMiddleware);
app.use(instance.middleware);
```

### Complete vs. default responses

```javascript
// Detailed responses with full HTML pages
const instance = createHoneypot({ isCompleteResponses: true });
```

### Traffic logging

```javascript
const instance = createHoneypot({ logTraffic: true });
// Check the traffic.txt file to see what bots request
```

## Conclusion

This Express honeypot middleware goes way beyond a simple decoy. With **328 endpoints**, **on-the-fly generation**, **dynamic header spoofing**, **traffic logging**, and even a **PHP proxy** for real WordPress responses, I designed it to stay as realistic as possible.

Scanners waste time on fake admin pages, believable `.env` files, and banking phishing pages while your real app stays protected. I particularly like the dual-variant system and the smart classification: every response stays fresh and matched to the requested path.

The source code is on GitHub: [https://github.com/fox3000foxy/express-honeypot-middleware](https://github.com/fox3000foxy/express-honeypot-middleware)
