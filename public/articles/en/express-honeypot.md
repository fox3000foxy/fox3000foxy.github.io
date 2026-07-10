---
title: "I built an ultra-realistic Express honeypot"
description: "328 fake endpoints with on-the-fly generated responses, header spoofing, bot traffic logging — a deep dive into an Express honeypot middleware designed to fool scanners."
date: 2026-06-10
aiGenerated: true
tags:
  - express
  - nodejs
  - security
  - honeypot
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "MEUCIE99/X/hCxHt5i0iTXi9yEAjjztCLRd0sEPy3v1tPF+yAiEA+vm/pClenPJJbWj9rQBfFNzeRcKAI4y5O4RFo9e0eSc="
---

## TL;DR

I built an Express middleware that exposes **328 fake endpoints** in two variants: `default` (terse but credible responses) and `complete` (highly detailed responses). Every response is **generated on-the-fly** with fresh timestamps and request IDs, making each reply unique. There are no mock files on disk. The middleware can also **log traffic** to a text file and expose unhandled routes at `/newBotsRoute` to analyze what bots are looking for.

**This isn't just another 404 bait.** It's a piece of engineering designed to look like a real server so scanners waste their time. Let's dive into how it works.

## The problem

Security bots, scrapers, and malicious actors constantly scan web servers for common routes:

- `.env`, `wp-config.php`, `admin/`, `phpinfo.php`, etc.
- API endpoints like `/api/version`, `/api/config`
- configuration files: `dump.sql`, `.git/config`, `docker-compose.yml`
- banking phishing pages: `/lander/sberbank*`, `/index_sber.php`

A typical approach is to block these requests, return a 404 or 403. But that immediately gives the scanner valuable information — the route doesn't exist, so it moves on. A honeypot does the opposite: **it makes the scanner believe everything exists**, wasting its time processing fake responses while your real server is protected behind known routes.

## The architecture

### 1. A classifier, not a lookup table

The core is a `classify()` function in `src/services/mockupGenerator.ts` that takes an endpoint path and returns a response generator. This function uses hierarchical rules:

1. **Exact matches** — the most common endpoints have dedicated generators
2. **Pattern matches** — regex on the path to detect patterns like `id_rsa`, `wp-admin`, `sitemap.xml`
3. **Smart classification** — paths like `/262LBNFp` (6+ random characters) are classified as "C2 heartbeats"
4. **Catchall rules** — API paths, `.php`, `.html`, `.js`, `.json` and `.asmx` files have generic generators
5. **Final catchall** — `genCatchall()` produces a generic JSON response with metadata

This approach means responses are **fresh per request** — no static files, no caching, every response looks like it came from a real server with its own timestamp.

### 2. The dual-variant system

Every generator supports two variants:

```typescript
type Variant = "default" | "complete";
```

- **`default`** — concise yet credible responses. Example for `.env`:
  ```
  DB_HOST=localhost
  DB_USER=root
  DB_PASS=s3cur3P@ss
  APP_ENV=development
  APP_DEBUG=true
  ```

- **`complete`** — highly detailed responses. Example for `.env`:
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

The `complete` variant also includes full HTML pages with styled CSS — admin panels, WordPress login screens, Russian banking phishing pages, and so on.

### 3. On-the-fly generation

The generator uses `Date.now()` and `Date().toISOString()` to produce unique timestamps and request IDs per call. Here's the enrichment function:

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

For JSON responses, the middleware attempts to parse and enrich with these fields. Non-JSON responses are sent as-is.

### 4. The header spoofing middleware

A dedicated middleware sets realistic HTTP headers based on the requested file extension:

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

This makes responses far more credible — a `.php` endpoint with `X-Powered-By: PHP/8.1.12` and `Server: nginx/1.24.0` looks exactly like a real WordPress server.

### 5. The PHP Spoofer

One of the most interesting components is the `phpSpoofer`. If a request comes in for a `.php` file and the host is localhost, the middleware **proxies** the request to your local PHP server, which processes and returns a real PHP page. If the host is not localhost, it returns a 404 (to prevent SSRF attacks).

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

This allows developers running WordPress locally to have the honeypot serve **real** WordPress pages to bots — the ultimate in realism.

### 6. Traffic logging and analysis

The `TrafficService` logs every request to a JSON-lines file. The `UnhandledRoutesService` then analyzes these logs to identify paths that bots have requested but are not yet covered by the honeypot.

```typescript
app.get("/newBotsRoute", async (_req, res) => {
  const routes = await unhandledRoutesService.getUnhandledRoutes(
    additionalEndpoints, knownPathOptions
  );
  res.setHeader("Content-Type", "text/plain");
  res.send(routes.join("\n"));
});
```

This feedback loop means the longer you run the honeypot, the more you learn about what bots are looking for — and you can add those paths to your known endpoints.

### 7. Known paths and exclusion

The middleware accepts lists of `knownPaths`, `knownPatterns`, `knownApiPaths`, and `knownApiPatterns`. Any route matching these passes through the middleware (to your real app). This ensures your actual endpoints are not intercepted by the honeypot.

```typescript
const matches = (p) => p === endpoint || p.startsWith(endpoint + "/");
```

## The 328 endpoints in detail

Here's how they are classified (excerpt from the classifier):

| Category | Example endpoints |
|---|---|
| Credential leaks | `.env`, `secrets.json`, `aws/credentials`, `etc/shadow` |
| SSH keys | `.ssh/id_rsa`, `.ssh/id_ed25519` |
| Database configs | `config/database`, `wp-config.php`, `docker-compose.yml` |
| Admin panels | `/admin`, `/wp-admin`, `/manage/account/login` |
| API responses | `/api/version`, `/api/config`, `.do`, `.ashx` |
| Banking phishing | `/lander/sber*`, `/index_sber.php` |
| C2 heartbeats | Random 6+ char paths (`/262LBNFp`) |
| Stock/Crypto | `/stock/mzhishu`, `/kline/1m/1`, `/m/allticker/1` |
| Gambling/Gaming | `/proxy/games`, `/Ctrls/GetSysCoin`, `/room/getRoomBangFans` |
| Config files | `config.json`, `config.yml`, `sitemap.xml`, `ads.txt` |
| Landing pages | `/about`, `/contact`, `/products`, `/blog` |

## Special codes and endpoints

The classifier contains specialized generators for edge cases:

- **`genLanding()`** — Russian banking phishing pages for СберБанк, Тинькофф, Газпромбанк
- **`genC2Heartbeat()`** — realistic C2 heartbeat response with `agent_id`, `group`, `version`
- **`genScannerPath()`** — traps for specific scanners (nmap nice ports, Hazelcast, CGI)
- **`genChineseApi()`** — Chinese API responses with `msg: "成功"` (success)
- **`genMerchant()`** — merchant profiles with `balance`, `fee_rate`, `tier`

## How to use it

### Installation

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

// Then the honeypot catch-all
const instance = createHoneypot({ /* options */ });
app.use(instance.headersMiddleware);
app.use(instance.middleware);
```

### Complete vs. default responses

```javascript
// Rich responses with full HTML pages
const instance = createHoneypot({ isCompleteResponses: true });
```

### Traffic logging

```javascript
const instance = createHoneypot({ logTraffic: true });
// Check traffic.txt to see what bots are requesting
```

## Conclusion

This Express honeypot middleware goes far beyond a simple decoy. With **328 endpoints**, **on-the-fly generation**, **dynamic header spoofing**, **traffic logging**, and even a **PHP proxy** for real WordPress responses, it's engineered to be as realistic as possible.

Scanners waste time crawling fake admin panels, credible `.env` files, and banking phishing pages while your real application stays protected. The dual-variant system and smart classification ensure every response is fresh and tailored to the requested path.

The source code is available on GitHub: [https://github.com/fox3000foxy/express-honeypot-middleware](https://github.com/fox3000foxy/express-honeypot-middleware)
