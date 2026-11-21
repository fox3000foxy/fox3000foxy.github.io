---
title: Ich habe ein ultra-realistisches Express-Honeypot gebaut
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
lang: "de"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "9MeFl4223pYsTRbs/Lx3MvvX9+DW/iYFpwadV4AY80YX0pG0lHujsTJn2nigiSWV82kGMD/glJOSIH92cqmZmw=="
---

## TL;DR

Ich habe eine Express-Middleware gebaut, die **328 Fake-Endpoints** bereitstellt, mit der Wahl zwischen zwei Varianten: `default` (knappe, aber glaubwürdige Antworten) und `complete` (sehr detaillierte Antworten). Jede Antwort wird **on the fly** erzeugt, mit frischen Zeitstempeln und Request-IDs, sodass jede Antwort einzigartig ist. Auf der Festplatte liegt keine Mock-Datei. Die Middleware kann außerdem den **Traffic** in eine Textdatei protokollieren und nicht behandelte Routen unter `/newBotsRoute` ausgeben, um zu analysieren, wonach Bots suchen.

**Das ist weit mehr als das Zurückgeben von 404-Fehlern.** Ich habe dieses Stück Engineering so entworfen, dass es wie ein echter Server aussieht, damit Scanner ihre Zeit darin verschwenden. Ich zeige dir, wie es funktioniert.

## Das Problem

Sicherheits-Bots, Scraper und böswillige Akteure scannen Webserver ständig nach gängigen Routen:

- `.env`, `wp-config.php`, `admin/`, `phpinfo.php` usw.
- API-Endpunkte wie `/api/version`, `/api/config`
- Konfigurationsdateien: `dump.sql`, `.git/config`, `docker-compose.yml`
- Phishing-Seiten für Banken: `/lander/sberbank*`, `/index_sber.php`

Ich habe diese Grenze auf meinen eigenen Servern gesehen: Eine 404- oder 403-Antwort sagt dem Scanner sofort, dass die Route nicht existiert, also zieht er weiter. Ich habe mit diesem Honeypot das Gegenteil gewählt: **den Scanner glauben lassen, dass alles existiert**. So verschwendet er Zeit mit Fake-Antworten, während dein echter Server hinter deinen bekannten Routen geschützt bleibt.

## Die Architektur

### 1. Ein Klassifikator statt einer Lookup-Tabelle

Das Herzstück ist eine Funktion `classify()` in `src/services/mockupGenerator.ts`, die einen Endpunkt-Pfad entgegennimmt und einen Antwortgenerator zurückgibt. Ich habe sie als Kaskade von Regeln gebaut:

1. **Exakte Treffer**: Die häufigsten Endpunkte haben eigene Generatoren
2. **Musterübereinstimmungen**: Reguläre Ausdrücke auf dem Pfad erkennen Muster wie `id_rsa`, `wp-admin`, `sitemap.xml`
3. **Intelligente Einordnung**: Pfade wie `/262LBNFp` (6+ zufällige Zeichen) werden als „C2-Heartbeats" eingestuft
4. **Regeln für alles Übrige**: API-Pfade sowie Dateien mit `.php`, `.html`, `.js`, `.json` und `.asmx` bekommen generische Generatoren
5. **Letzter Auffangfall**: `genCatchall()` liefert eine generische JSON-Antwort mit Metadaten

Ich mag diesen Ansatz, weil die Antworten bei **jeder Anfrage frisch** bleiben: keine statischen Dateien, kein Caching, jede Antwort trägt ihren eigenen Zeitstempel, als käme sie von einem echten Server.

### 2. Das Zwei-Varianten-System

Jeder Generator unterstützt zwei Varianten:

```typescript
type Variant = "default" | "complete";
```

- **`default`**: knappe, aber glaubwürdige Antworten. Beispiel für `.env`:
  ```
  DB_HOST=localhost
  DB_USER=root
  DB_PASS=s3cur3P@ss
  APP_ENV=development
  APP_DEBUG=true
  ```

- **`complete`**: sehr detaillierte Antworten. Beispiel für `.env`:
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

Die Variante `complete` enthält außerdem vollständige HTML-Seiten mit gestyltem CSS: Admin-Oberflächen, WordPress-Login-Bildschirme, Phishing-Seiten für Banken auf Russisch usw. Ich finde das sehr wirkungsvoll, wenn man einen Scanner wirklich beschäftigt halten will.

### 3. Generierung on the fly

Ich verwende `Date.now()` und `Date().toISOString()`, um bei jedem Aufruf eindeutige Zeitstempel und Request-IDs zu erzeugen. Hier die Anreicherungsfunktion:

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

Bei JSON-Antworten versucht die Middleware, die Antwort zu parsen und mit diesen Feldern anzureichern. Nicht-JSON-Antworten werden unverändert zurückgegeben.

### 4. Die Header-Spoofing-Middleware

Ich habe eine eigene Middleware ergänzt, die je nach angefragter Dateiendung realistische HTTP-Header setzt:

```typescript
res.setHeader("Server", "nginx/1.24.0");
res.setHeader("X-Frame-Options", "SAMEORIGIN");
res.setHeader("X-XSS-Protection", "1; mode=block");
res.setHeader("X-Content-Type-Options", "nosniff");
res.setHeader("X-Robots-Tag", "noindex, nofollow");
res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

// Realistisches X-Powered-By je nach Dateiendung
if (path.endsWith(".php")) res.setHeader("X-Powered-By", "PHP/8.1.12");
else if (path.endsWith(".jsp")) res.setHeader("X-Powered-By", "JSP/3.0");
else if (path.endsWith(".aspx") || path.endsWith(".ashx") || path.endsWith(".asmx"))
  res.setHeader("X-Powered-By", "ASP.NET");
else if (path.endsWith(".do") || path.endsWith(".action"))
  res.setHeader("X-Powered-By", "Servlet/3.0");
```

Das macht die Antworten deutlich glaubwürdiger: Ein `.php`-Endpunkt mit `X-Powered-By: PHP/8.1.12` und `Server: nginx/1.24.0` sieht genau aus wie ein echter WordPress-Server. Auf dieses Detail lege ich Wert, weil oft gerade der Header einen Fake-Server verrät.

### 5. Der PHP-Spoofer

Der `phpSpoofer` bleibt meine Lieblingskomponente. Kommt eine Anfrage für eine `.php`-Datei und der Host ist localhost, **leitet** die Middleware die Anfrage an deinen lokalen PHP-Server weiter, der sie verarbeitet und eine echte PHP-Seite zurückliefert. Ist der Host remote, antwortet sie mit 404, um jeden SSRF-Versuch zu blockieren.

```typescript
const phpSpoofer = async (req, res, next) => {
  if (!req.path?.match(/\.php$/)) return next();
  const host = req.headers?.host;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]")) {
    const baseUrl = req.originalUrl.replace(/\.php.*$/, "");
    const response = await fetch(`http://${host}${baseUrl}`);
    // die echte PHP-Antwort zurückgeben
  } else {
    res.status(404).send("404 Not Found");
  }
};
```

Wenn du WordPress lokal betreibst, liefert der Honeypot Bots so **echte** WordPress-Seiten. Das ist nach meiner Erfahrung das Maximum an Realismus.

### 6. Traffic-Logging und Analyse

Ich habe zwei Verantwortlichkeiten getrennt: Der `TrafficService` protokolliert jede Anfrage in einer JSON-Lines-Datei. Der `UnhandledRoutesService` wertet diese Logs dann aus, um Pfade zu finden, die Bots anfragen und die der Honeypot noch nicht abdeckt.

```typescript
app.get("/newBotsRoute", async (_req, res) => {
  const routes = await unhandledRoutesService.getUnhandledRoutes(
    additionalEndpoints, knownPathOptions
  );
  res.setHeader("Content-Type", "text/plain");
  res.send(routes.join("\n"));
});
```

Ich liebe diese Feedback-Schleife: Je länger du den Honeypot laufen lässt, desto mehr erfährst du, wonach Bots suchen, und du kannst diese Pfade zu deinen bekannten Endpunkten hinzufügen.

### 7. Bekannte Endpunkte und Ausnahmen

Die Middleware akzeptiert Listen mit `knownPaths`, `knownPatterns`, `knownApiPaths` und `knownApiPatterns`. Jede Route, die darauf passt, wird an deine echte App durchgereicht. Dieser Filter ist für mich unverzichtbar: Deine echten Endpunkte bleiben unangetastet, der Honeypot fängt sie nie ab.

```typescript
const matches = (p) => p === endpoint || p.startsWith(endpoint + "/");
```

## Die 328 Endpunkte im Detail

So sind sie klassifiziert (Auszug aus dem Klassifikator):

| Kategorie | Beispiel-Endpunkte |
|---|---|
| Zugangsdaten-Leaks | `.env`, `secrets.json`, `aws/credentials`, `etc/shadow` |
| SSH-Schlüssel | `.ssh/id_rsa`, `.ssh/id_ed25519` |
| Datenbank-Konfigurationen | `config/database`, `wp-config.php`, `docker-compose.yml` |
| Admin-Panels | `/admin`, `/wp-admin`, `/manage/account/login` |
| API-Antworten | `/api/version`, `/api/config`, `.do`, `.ashx` |
| Phishing für Banken | `/lander/sber*`, `/index_sber.php` |
| C2-Heartbeats | Zufällige Pfade mit 6+ Zeichen (`/262LBNFp`) |
| Börse/Trading | `/stock/mzhishu`, `/kline/1m/1`, `/m/allticker/1` |
| Spiele/Casino | `/proxy/games`, `/Ctrls/GetSysCoin`, `/room/getRoomBangFans` |
| Konfigurationsdateien | `config.json`, `config.yml`, `sitemap.xml`, `ads.txt` |
| Landingpages | `/about`, `/contact`, `/products`, `/blog` |

## Spezialfälle und Sonderendpunkte

Ich habe spezialisierte Generatoren für bestimmte Fälle ergänzt:

- **`genLanding()`**: Phishing-Seiten für Banken auf Russisch, für Sberbank, Tinkoff und Gazprombank
- **`genC2Heartbeat()`**: realistische C2-Heartbeat-Antwort mit `agent_id`, `group` und `version`
- **`genScannerPath()`**: Fallen für bestimmte Scanner (nmap-NICE-Ports, Hazelcast, CGI)
- **`genChineseApi()`**: chinesische API-Antworten mit `msg: "成功"` (Erfolg)
- **`genMerchant()`**: Händlerprofile mit `balance`, `fee_rate` und `tier`

## Verwendung

### Installation

```bash
npm install express-middleware-honeypot
```

### Grundlegende Nutzung mit automatischer Registrierung

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

### Mit app.use() (einzelne Catch-all-Middleware)

```javascript
const { createHoneypot } = require("express-middleware-honeypot");
const app = express();

// Zuerst deine echten Routen
app.get("/", (req, res) => res.send("Home"));

// Dann der Catch-all-Honeypot
const instance = createHoneypot({ /* Optionen */ });
app.use(instance.headersMiddleware);
app.use(instance.middleware);
```

### Vollständige vs. Standardantworten

```javascript
// Detaillierte Antworten mit vollständigen HTML-Seiten
const instance = createHoneypot({ isCompleteResponses: true });
```

### Traffic-Logging

```javascript
const instance = createHoneypot({ logTraffic: true });
// Die Datei traffic.txt zeigt, was Bots anfragen
```

## Fazit

Diese Express-Honeypot-Middleware geht weit über einen einfachen Köder hinaus. Mit **328 Endpunkten**, **Generierung on the fly**, **dynamischem Header-Spoofing**, **Traffic-Logging** und sogar einem **PHP-Proxy** für echte WordPress-Antworten habe ich sie so realistisch wie möglich gestaltet.

Scanner verschwenden ihre Zeit mit Fake-Admin-Seiten, glaubwürdigen `.env`-Dateien und Phishing-Seiten für Banken, während deine echte App geschützt bleibt. Besonders gefallen mir das Zwei-Varianten-System und die intelligente Einordnung: Jede Antwort bleibt frisch und passt zum angefragten Pfad.

Der Quellcode steht auf GitHub: [https://github.com/fox3000foxy/express-honeypot-middleware](https://github.com/fox3000foxy/express-honeypot-middleware)
