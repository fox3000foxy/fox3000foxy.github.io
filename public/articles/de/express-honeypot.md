---
title: "Ich habe ein ultra-realistisches Express-Honeypot gebaut"
description: "328 Fake-Endpoints mit on-the-fly generierten Antworten, Header-Spoofing, Bot-Traffic-Logging, ein Tauchgang ins Herz einer Express-Honeypot-Middleware, gebaut um Scanner zu ködern."
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
author_sig: "ZPb5I0mQ5bFQgTmpcHPq7x/Vgcd59RkCBCCTL04ebSoePgYqVkrmgZ/SaDPdLHTgSyxvedixK58DowaRCNp0Pw=="
---

## TL;DR

Ich habe eine Express-Middleware erstellt, die **328 Fake-Endpoints** zur Wahl aus zwei Varianten exponiert: `default` (nüchterne, aber glaubwürdige Antworten) und `complete` (sehr detaillierte Antworten). Jede Antwort wird **on the fly** mit frischen Timestamps und Request-IDs generiert, was jede Antwort einzigartig macht. Es gibt keine Mock-Dateien auf der Platte. Die Middleware kann auch **Traffic loggen** in eine Textdatei und unbehandelte Routen auf `/newBotsRoute` exponieren, um zu analysieren, was die Bots suchen.

**Das ist weit mehr als ein simples 404-Zurückschicken.** Ich habe dieses Stück Engineering so entworfen, dass es wie ein echter Server aussieht, damit Scanner ihre Zeit darauf verschwenden. Ich zeige dir, wie es funktioniert.

## Das Problem

Sicherheitsbots, Scraper und böswillige Akteure scannen ständig Webserver nach gängigen Routen:

- `.env`, `wp-config.php`, `admin/`, `phpinfo.php` usw.
- API-Endpoints wie `/api/version`, `/api/config`
- Konfigurationsdateien: `dump.sql`, `.git/config`, `docker-compose.yml`
- Bank-Phishing-Seiten: `/lander/sberbank*`, `/index_sber.php`

Ich habe diese Grenze auf meinen eigenen Servern gesehen: Ein 404 oder 403 zurückzuschicken zeigt dem Scanner sofort, dass die Route nicht existiert, also geht er zur nächsten. Ich habe mit diesem Honeypot das Gegenteil gewählt: **Den Scanner glauben lassen, dass alles existiert**, um ihn Zeit auf falschen Antworten verlieren zu lassen, während dein echter Server hinter deinen bekannten Routen geschützt bleibt.

## Die Architektur

### 1. Ein Klassifizierer, keine Lookup-Tabelle

Das Herzstück ist eine `classify()`-Funktion in `src/services/mockupGenerator.ts`, die einen Endpoint-Pfad nimmt und einen Antwortgenerator zurückgibt. Ich habe sie als Regelkaskade gebaut:

1. **Exakte Treffer**: Die gängigsten Endpoints haben dedizierte Generatoren
2. **Muster-Treffer**: Regex auf dem Pfad, um Muster wie `id_rsa`, `wp-admin`, `sitemap.xml` zu erkennen
3. **Intelligente Klassifizierung**: Pfade wie `/262LBNFp` (6+ zufällige Zeichen) werden als "C2-Hearbeats" klassifiziert
4. **Catch-all-Regeln**: API-Pfade, `.php`-, `.html`-, `.js`-, `.json`- und `.asmx`-Dateien haben generische Generatoren
5. **Finaler Catchall**: `genCatchall()` produziert eine generische JSON-Antwort mit Metadaten

Ich mag diesen Ansatz, weil die Antworten **bei jeder Anfrage frisch** bleiben: Keine statischen Dateien, kein Caching, jede Antwort trägt ihren eigenen Timestamp, als käme sie von einem echten Server.

### 2. Das Doppel-Varianten-System

Jeder Generator unterstützt zwei Varianten:

```typescript
type Variant = "default" | "complete";
```

- **`default`**: Kurze, aber glaubwürdige Antworten. Beispiel für `.env`:
  ```
  DB_HOST=localhost
  DB_USER=root
  DB_PASS=s3cur3P@ss
  APP_ENV=development
  APP_DEBUG=true
  ```

- **`complete`**: Sehr detaillierte Antworten. Beispiel für `.env`:
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

Die `complete`-Variante enthält auch komplette HTML-Seiten mit gestyltem CSS: Admin-Seiten, WordPress-Login-Screens, russische Bank-Phishing-Seiten usw. Ich finde sie furchterregend, wenn du einen Scanner wirklich beschäftigen willst.

### 3. On-the-fly-Generierung

Ich nutze `Date.now()` und `Date().toISOString()`, um bei jedem Aufruf einzigartige Timestamps und Request-IDs zu produzieren. Hier die Anreicherungsfunktion:

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

Für JSON-Antworten versucht die Middleware zu parsen und mit diesen Feldern anzureichern. Nicht-JSON-Antworten werden so zurückgeschickt, wie sie sind.

### 4. Die Header-Spoofing-Middleware

Ich habe eine dedizierte Middleware hinzugefügt, die realistische HTTP-Header setzt, je nach Endung der angefragten Datei:

```typescript
res.setHeader("Server", "nginx/1.24.0");
res.setHeader("X-Frame-Options", "SAMEORIGIN");
res.setHeader("X-XSS-Protection", "1; mode=block");
res.setHeader("X-Content-Type-Options", "nosniff");
res.setHeader("X-Robots-Tag", "noindex, nofollow");
res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

// Realistisches X-Powered-By basierend auf der Dateiendung
if (path.endsWith(".php")) res.setHeader("X-Powered-By", "PHP/8.1.12");
else if (path.endsWith(".jsp")) res.setHeader("X-Powered-By", "JSP/3.0");
else if (path.endsWith(".aspx") || path.endsWith(".ashx") || path.endsWith(".asmx"))
  res.setHeader("X-Powered-By", "ASP.NET");
else if (path.endsWith(".do") || path.endsWith(".action"))
  res.setHeader("X-Powered-By", "Servlet/3.0");
```

Das macht die Antworten viel glaubwürdiger: Ein `.php`-Endpoint mit `X-Powered-By: PHP/8.1.12` und `Server: nginx/1.24.0` sieht exakt wie ein echter WordPress-Server aus. Mir liegt an diesem Detail, weil es oft der Header ist, der einen Fake-Server verrät.

### 5. Der PHP-Spoofer

Der `phpSpoofer` bleibt meine Lieblingskomponente. Wenn eine Anfrage für eine `.php`-Datei reinkommt und der Host localhost ist, **proxyt** die Middleware die Anfrage an deinen lokalen PHP-Server, der eine echte PHP-Seite verarbeitet und zurückschickt. Wenn der Host remote ist, gibt sie ein 404 zurück, um jeden SSRF-Versuch zu blockieren.

```typescript
const phpSpoofer = async (req, res, next) => {
  if (!req.path?.match(/\.php$/)) return next();
  const host = req.headers?.host;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]")) {
    const baseUrl = req.originalUrl.replace(/\.php.*$/, "");
    const response = await fetch(`http://${host}${baseUrl}`);
    // echte PHP-Antwort zurückschicken
  } else {
    res.status(404).send("404 Not Found");
  }
};
```

Das erlaubt, wenn du WordPress lokal laufen lässt, dass das Honeypot den Bots **echte** WordPress-Seiten serviert: Nach meiner Erfahrung das Maximum an Realismus.

### 6. Traffic-Logging und -Analyse

Ich habe zwei Verantwortlichkeiten getrennt: Der `TrafficService` loggt jede Anfrage in eine JSON-Lines-Datei. Der `UnhandledRoutesService` analysiert dann diese Logs, um die von Bots angefragten Pfade zu identifizieren, die im Honeypot noch abzudecken sind.

```typescript
app.get("/newBotsRoute", async (_req, res) => {
  const routes = await unhandledRoutesService.getUnhandledRoutes(
    additionalEndpoints, knownPathOptions
  );
  res.setHeader("Content-Type", "text/plain");
  res.send(routes.join("\n"));
});
```

Ich liebe diese Feedbackschleife: Je länger du das Honeypot laufen lässt, desto mehr lernst du, was die Bots suchen, und du kannst diese Pfade zu deinen bekannten Endpoints hinzufügen.

### 7. Bekannte Endpoints und Ausschluss

Die Middleware akzeptiert Listen von `knownPaths`, `knownPatterns`, `knownApiPaths` und `knownApiPatterns`. Jede Route, die darauf passt, läuft durch die Middleware zu deiner echten Applikation. Ich finde diesen Filter unverzichtbar: Deine echten Endpoints bleiben intakt, das Honeypot fängt sie niemals ab.

```typescript
const matches = (p) => p === endpoint || p.startsWith(endpoint + "/");
```

## Die 328 Endpoints im Detail

So werden sie klassifiziert (Auszug aus dem Klassifizierer):

| Kategorie | Endpoint-Beispiele |
|---|---|
| Credential-Leaks | `.env`, `secrets.json`, `aws/credentials`, `etc/shadow` |
| SSH-Schlüssel | `.ssh/id_rsa`, `.ssh/id_ed25519` |
| Datenbank-Configs | `config/database`, `wp-config.php`, `docker-compose.yml` |
| Admin-Panels | `/admin`, `/wp-admin`, `/manage/account/login` |
| API-Antworten | `/api/version`, `/api/config`, `.do`, `.ashx` |
| Bank-Phishing | `/lander/sber*`, `/index_sber.php` |
| C2-Heartbeats | Zufällige 6+ Zeichen-Pfade (`/262LBNFp`) |
| Aktien/Börse | `/stock/mzhishu`, `/kline/1m/1`, `/m/allticker/1` |
| Spiele/Casino | `/proxy/games`, `/Ctrls/GetSysCoin`, `/room/getRoomBangFans` |
| Konfigurationsdateien | `config.json`, `config.yml`, `sitemap.xml`, `ads.txt` |
| Landingpages | `/about`, `/contact`, `/products`, `/blog` |

## Spezielle Codes und Endpoints

Ich habe spezialisierte Generatoren für besondere Fälle hinzugefügt:

- **`genLanding()`**: Russische Bank-Phishing-Seiten für СберБанк, Тинькофф, Газпромбанк
- **`genC2Heartbeat()`**: Realistische C2-Heartbeat-Antwort mit `agent_id`, `group`, `version`
- **`genScannerPath()`**: Fallen für spezifische Scanner (nmap NICE-Ports, Hazelcast, CGI)
- **`genChineseApi()`**: Chinesische API-Antworten mit `msg: "成功"` (Erfolg)
- **`genMerchant()`**: Händlerprofile mit `balance`, `fee_rate`, `tier`

## Wie man es nutzt

### Installation

```bash
npm install express-middleware-honeypot
```

### Basisnutzung mit Auto-Registrierung

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

### Mit app.use() (einzige Catch-all-Middleware)

```javascript
const { createHoneypot } = require("express-middleware-honeypot");
const app = express();

// Deine echten Routen zuerst
app.get("/", (req, res) => res.send("Home"));

// Dann das Catch-all-Honeypot
const instance = createHoneypot({ /* options */ });
app.use(instance.headersMiddleware);
app.use(instance.middleware);
```

### Vollständige vs. Standardantworten

```javascript
// Detaillierte Antworten mit kompletten HTML-Seiten
const instance = createHoneypot({ isCompleteResponses: true });
```

### Traffic-Logging

```javascript
const instance = createHoneypot({ logTraffic: true });
// Schau in die Datei traffic.txt, um zu sehen, was die Bots anfragen
```

## Fazit

Diese Express-Honeypot-Middleware geht weit über einen simplen Köder hinaus. Mit **328 Endpoints**, **On-the-fly-Generierung**, **dynamischem Header-Spoofing**, **Traffic-Logging** und sogar einem **PHP-Proxy** für echte WordPress-Antworten habe ich sie so realistisch wie möglich entworfen.

Scanner verlieren Zeit auf gefälschten Admin-Seiten, glaubwürdigen `.env`-Dateien und Bank-Phishing-Seiten, während deine echte Applikation geschützt bleibt. Ich schätze besonders das Doppel-Varianten-System und die intelligente Klassifizierung: Jede Antwort bleibt frisch und an den angefragten Pfad angepasst.

Der Quellcode ist auf GitHub verfügbar: [https://github.com/fox3000foxy/express-honeypot-middleware](https://github.com/fox3000foxy/express-honeypot-middleware)
