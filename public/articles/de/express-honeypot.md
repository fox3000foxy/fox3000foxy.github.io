---
title: "Ich habe einen ultra-realistischen Express-Honeypot gebaut"
description: "328 gefälschte Endpoints mit spontan generierten Antworten, Header-Spoofing, Bot-Traffic-Aufzeichnung -- ein tiefer Einblick in eine Express-Honeypot-Middleware, die Scanner täuschen soll."
aiGenerated: true
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "8MP98sMNmsy/ehtVlbabUQaK+CZvDI4ypfCZPjasnByYuRILnm8NkUS3Id10hB7GOf1f2caovT1hIq304pTaSw=="
tags:
  - express
  - nodejs
  - security
  - honeypot
---

## Was ist ein Express-Honeypot?

Ein Honeypot ist ein Köder, der ein echtes System nachahmt, um Angreifer anzulocken und zu erkennen. Im Kontext einer Express-Webanwendung ist es eine Middleware, die verdächtige Anfragen abfängt und mit glaubwürdigen gefälschten Inhalten antwortet, sodass das Verhalten von Bots und Scannern analysiert werden kann, ohne echte Daten preiszugeben.

**express-middleware-honeypot** ist ein npm-Paket, das Ihre Express-Anwendung in einen echten Honeypot verwandelt. Es legt **328 Endpoints** frei, die eine breite Palette typischer Angriffsziele abdecken -- Konfigurationsdateien, Anmeldedaten, Administrationsseiten, API-Endpoints, Bank-Phishing-Seiten und vieles mehr.

Jeder Endpoint generiert eine Antwort **spontan**, mit frischen Zeitstempeln und Anfrage-IDs, was jede Antwort einzigartig und glaubwürdig macht.

## Installation

```bash
npm install express-middleware-honeypot
```

## Verwendung

### Automatische Registrierung mit `register()`

Der einfachste Weg, den Honeypot zu nutzen, ist der Aufruf von `register()` auf Ihrer Express-Anwendung. Damit werden alle Middleware-Komponenten -- Logging, Header, 404-Handler -- auf einmal registriert:

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

### Einzelne Middleware mit `app.use()`

Für eine feinere Kontrolle können Sie die Allzweck-Middleware verwenden:

```js
const { createHoneypot } = require("express-middleware-honeypot");

const app = express();

// Ihre echten Routen zuerst
app.get("/", (req, res) => res.send("Home"));

// Dann der Honeypot
const instance = createHoneypot({ /* Optionen */ });
app.use(instance.middleware);
app.use(instance.phpSpoofer);
```

### Individuelle Mocks mit `app.all()`

Sie können auch bestimmte Endpoints auswählen:

```js
const instance = createHoneypot({ /* Optionen */ });

app.all('/admin', instance.mocks['/admin']);
app.all('/.env', instance.mocks['/.env']);
app.all('/wp-admin', instance.mocks['/wp-admin']);
```

`instance.mocks` ist ein `Record<string, Middleware>`, indexiert nach Endpoint-Pfad.

## Header-Spoofing

Die Header-Middleware (`instance.headersMiddleware`) setzt realistische Antwort-Header -- `Server: nginx/1.24.0`, `X-Frame-Options`, `X-XSS-Protection`, und insbesondere einen dynamischen `X-Powered-By`-Header basierend auf der Dateierweiterung:

- `.php` → `X-Powered-By: PHP/8.1.12`
- `.jsp` → `X-Powered-By: JSP/3.0`
- `.aspx/.ashx/.asmx` → `X-Powered-By: ASP.NET`
- `.do/.action` → `X-Powered-By: Servlet/3.0`
- Andere → kein `X-Powered-By`-Header

```js
app.use(instance.headersMiddleware);
app.use(instance.middleware);
```

## PHP Spoofer

Der `instance.phpSpoofer` geht noch weiter: Er fängt `*.php`-Anfragen ab und **leitet sie an Ihren lokalen PHP-Server weiter**, sodass eine echte PHP-Ausgabe statt einer statischen Antwort zurückgegeben wird:

```js
app.use(instance.phpSpoofer);
```

So funktioniert es:
1. Fängt Anfragen mit `.php` im Pfad ab
2. Entfernt das Suffix `.php` und leitet an `http://localhost:<port>/<base>` weiter
3. Wenn Ihr lokaler PHP-Server antwortet (Valet, Laravel, etc.), wird das HTML zurückgegeben
4. Wenn der Host nicht localhost ist, wird ein 404 zurückgegeben (verhindert SSRF-Angriffe)
5. Kein lokaler PHP-Server? Fällt auf den 404-Handler zurück

Damit können Sie eine echte WordPress/PHP-Anwendung lokal ausführen und den Bots tatsächlich gerenderte Seiten ausliefern, während in der Produktion statische Antworten verwendet werden.

## Konfigurationsoptionen

| Option | Typ | Standard | Beschreibung |
|---|---|---|---|
| `knownPaths` | `string[]` | `[]` | Pfade, die von der echten App verwaltet werden (von Mocks ausgeschlossen) |
| `knownPatterns` | `RegExp[]` | `[]` | Reguläre Ausdrücke für echte Pfade |
| `knownApiPaths` | `string[]` | `[]` | API-Pfade der echten App |
| `knownApiPatterns` | `RegExp[]` | `[]` | Reguläre Ausdrücke für echte API-Pfade |
| `logTraffic` | `boolean` | `false` | Zeichnet gesamten Traffic in `traffic.txt` auf |
| `is404Handler` | `boolean` | `false` | Registriert einen Fallback-404-Handler |
| `isCompleteResponses` | `boolean` | `false` | Verwendet die Variante «complete» (detailreich) |
| `additionalEndpoints` | `string[]` | `["/not_covered_endpoint_test"]` | Zusätzliche Endpoints über die 328 integrierten hinaus |
| `enrichResponses` | `boolean` | `true` | Reichert JSON-Antworten mit Zeitstempel/Version an |

## Die Mocks -- 328 Endpoints in zwei Varianten

Der Mock-Generator (`src/services/mockupGenerator.ts`) produziert Antworten **spontan** für 328 Endpoints, jeder in zwei Varianten:

- **Default** -- knapp aber glaubwürdig (`{ code: 0, message: "ok", data: {...} }`)
- **Complete** -- reichhaltige Antworten mit Zeitstempeln, Anfrage-ID, Metadaten, Versions-Headern, etc.

Um Mocks auf die Festplatte zu schreiben (Debugging):

```bash
bun run scripts/generate-mockups.ts --dry-run          # nur Vorschau
bun run scripts/generate-mockups.ts --list-uncategorized  # Allzweck-Endpoints
```

### Bediente Inhaltstypen

| Typ | Beispiele für Endpoints |
|---|---|
| Credential-Leaks | `.env`, `secrets.json`, `aws/credentials`, `etc/shadow` |
| SSH-Schlüssel | `.ssh/id_rsa`, `.ssh/id_ed25519` |
| Datenbank-Konfigs | `config/database`, `wp-config.php`, `docker-compose.yml` |
| Admin-Panels | `/admin`, `/wp-admin`, `/manage/account/login` |
| API-Antworten | `/api/version`, `/api/config`, `.do`, `.ashx` |
| Bank-Phishing | `/lander/sber*`, `/index_sber.php` |
| C2-Heartbeats | Zufällige 6+ Zeichen Pfade (`/262LBNFp`, `/Kd67Fq1x`) |
| Aktien/Krypto | `/stock/mzhishu`, `/kline/1m/1`, `/m/allticker/1` |
| Spiele/Glücksspiel | `/proxy/games`, `/Ctrls/GetSysCoin`, `/room/getRoomBangFans` |
| Konfigurationsdateien | `config.json`, `config.yml`, `sitemap.xml`, `ads.txt` |
| Landingpages | `/about`, `/contact`, `/products`, `/blog` |

## Analyse-Endpoints

| Route | Beschreibung |
|---|---|
| `GET /newBotsRoute` | Gibt nicht behandelte unbekannte Routen aus den Traffic-Logs zurück |
| `GET /notCoveredAdditionalEndpoints` | Gibt zusätzliche Endpoints zurück, die nicht in den 328 integrierten enthalten sind |

## HoneypotInstance-API

```ts
interface HoneypotInstance {
  mocks: Record<string, Middleware>;       // Einzelne Mock-Handler
  middleware: Middleware;                  // Allzweck-Middleware
  headersMiddleware: Middleware;           // Setzt realistische Antwort-Header
  phpSpoofer: Middleware;                  // PHP-Spoofing-Middleware
  notFoundHandler: Middleware;             // Fallback-404-Handler
  register(app: RouteApp): void;           // Registriert alle Handler
  getUnhandledRoutes(): Promise<string[]>; // Nicht behandelte Bot-Routen
  getNotCoveredEndpoints(): string[];      // Zusätzliche nicht abgedeckte Endpoints
}
```

## Entwicklung

```bash
bun install
bun test          # 36+ Tests
bun run build     # TypeScript → dist/
```

## Sicherheitshinweis

Dieses Paket ist ein Köder-/Täuschungswerkzeug. Legen Sie während der Ausführung keine echten sensiblen Daten über Ihre Anwendung offen.

## Lizenz

MIT

---

Der Quellcode ist auf GitHub verfügbar : [express-honeypot-middleware](https://github.com/fox3000foxy/express-honeypot-middleware)
