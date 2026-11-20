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
author_sig: "uMGnhDj3QYmnvHSkZ7gUC8gsVuWQq57u/hoaq+aYszOJcdlN6pgAYUTIDPnnYMiFsHUsCaPprEZrjC0YiOmdMA=="
---
## 

Ich habe einen middleware Express erstellt, der **328 modische Endpunkte** aus zwei Varianten heraussetzt:`default`(unbesorgte, aber glaubwürdige Antworten) und`complete`(sehr detaillierte Antworten). Jede Antwort wird mit timestamps und kühlen Abfrage-IDs **generiert, was jede Antwort einzigartig macht. Es gibt keine Mock-Datei auf der Festplatte. Die Middleware kann auch ** den Verkehr** in eine Textdatei journalisieren und die nicht verwalteten Routen auf der Karteikarte anzeigen.`/newBotsRoute`um zu analysieren, was Bots suchen.

**Das ist mehr als nur eine 404-Schritte.** Ich habe dieses Ingenieurstück entworfen, um wie ein echter Server zu aussehen, damit die Scanner ihre Zeit darauf verschwenden.

## Das Problem

Sicherheitsbots, Scrapers und bösartige Akteure scannen ständig Webserver auf der Suche nach gängigen Routen:

- `.env` , `wp-config.php` , `admin/` , `phpinfo.php`, etc.
- API-Endpunkte als`/api/version` , `/api/config`
- Konfigurationsdateien:`dump.sql` , `.git/config` , `docker-compose.yml`
- Banking Seiten:`/lander/sberbank*` , `/index_sber.php`

Ich habe diese Grenze auf meinen eigenen Servern gesehen: Einen 404 oder einen 403 zurückschicken, sagt dem Scanner sofort, dass die Route nicht existiert, also geht sie auf die nächste. Ich habe das Gegenteil mit diesem Honeypot gewählt: ** dem Scannen glauben lassen, dass alles existiert**, damit er Zeit auf falschen Antworten verschwendet, während dein echter Server hinter deinen bekannten Routen geschützt bleibt.

## Architektur

### 1. Ein Klassifizierungs-, kein Lookup-Tabelle

Das Herzstück ist eine Funktion`classify()`in`src/services/mockupGenerator.ts`Das nimmt einen Endpoint-Pfad und gibt einen Antwortgenerator zurück. Ich habe es als eine Stunt-Regeln gebaut:

1. **Genaue Äquivalente**: Die häufigsten Endpunkte haben spezielle Generatoren
2. **Beschreibungen nach Muster**: regex auf dem Pfad, um Muster als`id_rsa` , `wp-admin` , `sitemap.xml`
3. **Intelligente Einstufung**: Pfade wie`/262LBNFp`(6+ zufällige Zeichen) werden als "C2-Herzschlag" eingestuft
4. **Regeln für alle**: API-Pfade, Dateien`.php` , `.html` , `.js` , `.json`und`.asmx`Generika haben
5. **Catchall final**:`genCatchall()`produziert eine generische JSON-Antwort mit Metadaten

Ich mag diesen Ansatz, weil die Antworten auf jede Abfrage **frei bleiben**: keine statische Datei, keine Zwischenspeicherung, jede Antwort trägt ihren eigenen Timestamp, als ob sie von einem echten Server stammte.

### 2. Das System der doppelten Variante

Jeder Generator unterstützt zwei Varianten:
```typescript
type Variant = "default" | "complete";
```
- ** `default`**: kurze, aber glaubwürdige Antworten. Beispiel für`.env`:
  ```
  DB_HOST=localhost
  DB_USER=root
  DB_PASS=s3cur3P@ss
  APP_ENV=development
  APP_DEBUG=true
  ```
- ** `complete`**: sehr detaillierte Antworten. Beispiel für`.env`:
  ```
  # Database
  DB_CONNECTION=mysql
  DB_HOST=db-master-01.internal.example.com
  DB_PORT=3306
  DB_DATABASE=production_app_v2
  DB_USER=admin_service
  DB_PASS=mM9k#2$xL!qR7pZ

  # Wiederholen
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
Die Variante`complete`enthält auch komplette HTML-Seiten mit stilisierten CSS: Verwaltungsseiten, WordPress-Verbindungsbildschirme, Banking-Seites in Russisch, etc. Ich finde es furchtbar, wenn du wirklich einen Scanner zu besetzen wollen.

### 3. Generierung im Flug

Ich benutze`Date.now()`und`Date().toISOString()`um für jeden Aufruf einzelne Timestamps und Abfrage-IDs zu erzeugen. Hier ist die Anreicherungsfunktion:
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
Für JSON-Antworten versucht die Middleware, mit diesen Feldern zu gehen und zu bereichern. Nicht-JSON-Anfrage wird als solche zurückgegeben.

### 4. Die middleware des Kopfzeilenspooofing

Ich habe eine dedizierte middleware, die realistische HTTP-Header auf der Grundlage der Erweiterung der gewünschten Datei definiert:
```typescript
res.setHeader("Server", "nginx/1.24.0");
res.setHeader("X-Frame-Options", "SAMEORIGIN");
res.setHeader("X-XSS-Protection", "1; mode=block");
res.setHeader("X-Content-Type-Options", "nosniff");
res.setHeader("X-Robots-Tag", "noindex, nofollow");
res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

// Realistischer X-Powered-By basierend auf der Dateierweiterung
if (path.endsWith(".php")) res.setHeader("X-Powered-By", "PHP/8.1.12");
else if (path.endsWith(".jsp")) res.setHeader("X-Powered-By", "JSP/3.0");
else if (path.endsWith(".aspx") || path.endsWith(".ashx") || path.endsWith(".asmx"))
  res.setHeader("X-Powered-By", "ASP.NET");
else if (path.endsWith(".do") || path.endsWith(".action"))
  res.setHeader("X-Powered-By", "Servlet/3.0");
```
Dies macht die Antworten viel glaubwürdiger: ein Endpoint`.php`mit`X-Powered-By: PHP/8.1.12`und`Server: nginx/1.24.0`Ich mag dieses Detail, weil es oft der Kopf ist, der einen falschen Server verrät.

### 5. Der PHP Spoofer

Das`phpSpoofer`bleibt meine Lieblingskomponente. Wenn eine Abfrage für eine Datei kommt`.php`und der Host localhost ist, wird die Abfrage mit der middleware ** auf deinen lokalen PHP Server gesetzt, der eine echte PHP-Seite bearbeitet und zurückgibt. Wenn der Host entfernt ist, gibt er einen 404 zurück, um jeden SSRF-Versuch zu blockieren.
```typescript
const phpSpoofer = async (req, res, next) => {
  if (!req.path?.match(/\.php$/)) return next();
  const host = req.headers?.host;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]")) {
    const baseUrl = req.originalUrl.replace(/\.php.*$/, "");
    const response = await fetch(`http://${host}${baseUrl}`);
    // gibt die tatsächliche PHP-Antwort zurück
  } else {
    res.status(404).send("404 Not Found");
  }
};
```
Dies ermöglicht, wenn du WordPress auf lokaler Ebene drehen, hast du den Honeypot, der verwendet **vraies** Wordpress-Seiten zu Bots: die maximale Realismus nach meiner Erfahrung.

### 6. Protokollierung und Analyse des Verkehrs

Ich habe zwei Aufgaben getrennt:`TrafficService`protokolliert jede Abfrage in einer JSON-lines-Datei.`UnhandledRoutesService`analysiert dann diese Logs, um die Pfade zu identifizieren, die von Bots verlangt werden, die im Honeypot noch zu erfassen sind.
```typescript
app.get("/newBotsRoute", async (_req, res) => {
  const routes = await unhandledRoutesService.getUnhandledRoutes(
    additionalEndpoints, knownPathOptions
  );
  res.setHeader("Content-Type", "text/plain");
  res.send(routes.join("\n"));
});
```
Ich liebe diese Rückkopplungsschleife: Je mehr du den Honeypot drehen lässt, desto mehr lernst du, was die Bots suchen, und du kannst diese Pfade zu deinen bekannten Endpoints hinzufügen.

### 7. Bekannte Endpunkte und Ausschluß

Die Middleware akzeptiert Listen von`knownPaths` , `knownPatterns` , `knownApiPaths`und`knownApiPatterns`Jede Route, die dieser Route entspricht, durchquert die Middleware zu deiner echten App. Ich finde diesen Filter unerlässlich: Deine wahren Endpoints bleiben intakt, der Honeypot fängt sie nie ab.
```typescript
const matches = (p) => p === endpoint || p.startsWith(endpoint + "/");
```
## Die 328 Endpunkte im Detail

Hier ist, wie sie klassifiziert werden (Auszug aus dem Klassifizierungs-):

| Kategorie | Beispiele für Endpunkte |
|---|---|
| Kredentialabsaugung | `.env` , `secrets.json` , `aws/credentials` , `etc/shadow` |
| SSH-Schlüssel | `.ssh/id_rsa` , `.ssh/id_ed25519` |
| Datenbankkonfigurationen | `config/database` , `wp-config.php` , `docker-compose.yml` |
| Anwendungstafeln | `/admin` , `/wp-admin` , `/manage/account/login` |
| API-Antworten | `/api/version` , `/api/config` , `.do` , `.ashx` |
| Banking | `/lander/sber*` , `/index_sber.php` |
| Herzschläge C2 | Zufällige Pfade von 6+ Zeichen (`/262LBNFp`) |
| Aktionen/Bourse | `/stock/mzhishu` , `/kline/1m/1` , `/m/allticker/1` |
| Spiele/Casino | `/proxy/games` , `/Ctrls/GetSysCoin` , `/room/getRoomBangFans` |
| Konfigurationsdateien | `config.json` , `config.yml` , `sitemap.xml` , `ads.txt` |
| Landeseiten | `/about` , `/contact` , `/products` , `/blog` |

## Codes und Sonderstellen

Ich habe spezielle Generatoren für besondere Fälle hinzugefügt:

- ** `genLanding()`**: Banking Seiten auf Russisch für СберБанк, Тинькофф, Сбербанк
- ** `genC2Heartbeat()`**: realistische C2-Herzschlag-Antwort mit`agent_id` , `group` , `version`
- ** `genScannerPath()`**: spezifische Scannerfallen (Nmap-Ports NICE, Hazelcast, CGI)
- ** `genChineseApi()`**: Antworten von chinesischen APIs mit`msg: "成功"`(Erfolg)
- ** `genMerchant()`**: Handelsprofile mit`balance` , `fee_rate` , `tier`

## Wie wird es verwendet?

### Installation
```bash
npm install express-middleware-honeypot
```
### Grundnutzung mit Selbstregistrierung
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
### Mit app.use() (Middleware einzigartiger All-To-Füller)
```javascript
const { createHoneypot } = require("express-middleware-honeypot");
const app = express();

// Ihre wahren Straßen zuerst
app.get("/", (req, res) => res.send("Home"));

// Dann der Honeypot-Staub
const instance = createHoneypot({ /* options */ });
app.use(instance.headersMiddleware);
app.use(instance.middleware);
```
### Volle Antworten vs. Standard
```javascript
// Detaillierte Antworten mit vollständigen HTML-Seiten
const instance = createHoneypot({ isCompleteResponses: true });
```
### Verkehrsprotokollierung
```javascript
const instance = createHoneypot({ logTraffic: true });
// Datei anzeigentraffic.txtum zu sehen, was Bots verlangen
```
## Schlussfolgerung

Dieses honeypot Express-Middleware geht weit über einen einfachen Trick hinaus. Mit **328 Endpoints**, einer **Generation mit dem Volume**, einem **Spoofing mit dynamischen Kopfzeilen**, **Traffic Journalisation** und sogar einem **Proxy PHP** für echte WordPress-Antworten, habe ich es so realistisch wie möglich gestaltet.

Scanner verlieren Zeit auf gefälschten Verwaltungsseiten, Dateien`.env`Glaubwürdigkeit und Banking Seiten während deine wahre Anwendung geschützt bleibt. Ich schätze besonders das System der doppelten Variante und intelligente Klassifizierung: jede Antwort bleibt frisch und angepasst auf den gewünschten Weg.

Der Quellcode ist auf GitHub verfügbar:[https://github.com/fox3000foxy/express-honeypot-middleware](https://github.com/fox3000foxy/express-honeypot-middleware)
