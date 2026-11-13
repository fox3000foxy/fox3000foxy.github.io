---
title: "Construí un honeypot Express ultrarrealista"
description: "328 endpoints falsos con respuestas generadas al vuelo, spoofing de cabeceras, registro del tráfico bot: inmersión en un middleware honeypot Express diseñado para engañar a los escáneres."
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
author_sig: "s/aPh5syofpoF+LlROgreCAFq8209HC9/fxwKWVsabgQ2FwTSCLflSlA2C93j++C99bbWkQYEAMn+evBxsGPrA=="
---

## TL;DR

Creé un middleware Express que expone **328 endpoints ficticios** a elegir entre dos variantes: `default` (respuestas sobrias pero creíbles) y `complete` (respuestas muy detalladas). Cada respuesta se **genera al vuelo** con timestamps e identificadores de petición frescos, lo que hace cada respuesta única. No hay ningún archivo mock en el disco. El middleware también puede **registrar el tráfico** en un archivo de texto y exponer las rutas no gestionadas en `/newBotsRoute` para analizar lo que buscan los bots.

**Es mucho más que un simple retorno de 404.** Diseñé esta pieza de ingeniería para parecerse a un servidor real, para que los escáneres pierdan su tiempo en él. Te muestro cómo funciona.

## El problema

Los bots de seguridad, los scrapers y los actores maliciosos escanean constantemente los servidores web buscando rutas comunes:

- `.env`, `wp-config.php`, `admin/`, `phpinfo.php`, etc.
- endpoints de API como `/api/version`, `/api/config`
- archivos de configuración: `dump.sql`, `.git/config`, `docker-compose.yml`
- páginas de phishing bancario: `/lander/sberbank*`, `/index_sber.php`

Vi ese límite en mis propios servidores: devolver un 404 o un 403 indica enseguida al escáner que la ruta no existe, así que pasa a la siguiente. Elegí lo contrario con este honeypot: **hacer creer al escáner que todo existe**, para hacerle perder tiempo en respuestas falsas mientras tu servidor real queda protegido tras tus rutas conocidas.

## La arquitectura

### 1. Un clasificador, no una lookup table

La pieza maestra es una función `classify()` en `src/services/mockupGenerator.ts` que toma una ruta de endpoint y devuelve un generador de respuesta. La construí como una cascada de reglas:

1. **Coincidencias exactas**: los endpoints más comunes tienen generadores dedicados
2. **Coincidencias por patrón**: regex sobre la ruta para detectar patrones como `id_rsa`, `wp-admin`, `sitemap.xml`
3. **Clasificación inteligente**: rutas como `/262LBNFp` (6+ caracteres aleatorios) se clasifican como "latidos C2"
4. **Reglas comodín**: las rutas de API, los archivos `.php`, `.html`, `.js`, `.json` y `.asmx` tienen generadores genéricos
5. **Catchall final**: `genCatchall()` produce una respuesta JSON genérica con metadatos

Me gusta este enfoque porque las respuestas quedan **frescas en cada petición**: ningún archivo estático, ningún cacheo, cada respuesta lleva su propio timestamp como si viniera de un servidor real.

### 2. El sistema de doble variante

Cada generador soporta dos variantes:

```typescript
type Variant = "default" | "complete";
```

- **`default`**: respuestas concisas pero creíbles. Ejemplo para `.env`:
  ```
  DB_HOST=localhost
  DB_USER=root
  DB_PASS=s3cur3P@ss
  APP_ENV=development
  APP_DEBUG=true
  ```

- **`complete`**: respuestas muy detalladas. Ejemplo para `.env`:
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

La variante `complete` incluye además páginas HTML completas con CSS estilizado: páginas de administración, pantallas de login de WordPress, páginas de phishing bancario en ruso, etc. La encuentro temible cuando de verdad quieres ocupar un escáner.

### 3. Generación al vuelo

Uso `Date.now()` y `Date().toISOString()` para producir timestamps e identificadores de petición únicos en cada llamada. Aquí la función de enriquecimiento:

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

Para las respuestas JSON, el middleware intenta parsear y enriquecer con esos campos. Las respuestas no-JSON se devuelven tal cual.

### 4. El middleware de spoofing de cabeceras

Añadí un middleware dedicado que define cabeceras HTTP realistas según la extensión del archivo pedido:

```typescript
res.setHeader("Server", "nginx/1.24.0");
res.setHeader("X-Frame-Options", "SAMEORIGIN");
res.setHeader("X-XSS-Protection", "1; mode=block");
res.setHeader("X-Content-Type-Options", "nosniff");
res.setHeader("X-Robots-Tag", "noindex, nofollow");
res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

// X-Powered-By realista basado en la extensión del archivo
if (path.endsWith(".php")) res.setHeader("X-Powered-By", "PHP/8.1.12");
else if (path.endsWith(".jsp")) res.setHeader("X-Powered-By", "JSP/3.0");
else if (path.endsWith(".aspx") || path.endsWith(".ashx") || path.endsWith(".asmx"))
  res.setHeader("X-Powered-By", "ASP.NET");
else if (path.endsWith(".do") || path.endsWith(".action"))
  res.setHeader("X-Powered-By", "Servlet/3.0");
```

Eso hace las respuestas mucho más creíbles: un endpoint `.php` con `X-Powered-By: PHP/8.1.12` y `Server: nginx/1.24.0` se parece exactamente a un servidor WordPress real. Me importa ese detalle porque a menudo es la cabecera la que delata un servidor falso.

### 5. El PHP Spoofer

El `phpSpoofer` sigue siendo mi componente favorito. Si llega una petición para un archivo `.php` y el host es localhost, el middleware **proxifica** la petición hacia tu servidor PHP local, que procesa y devuelve una página PHP real. Si el host es remoto, devuelve un 404 para bloquear cualquier intento SSRF.

```typescript
const phpSpoofer = async (req, res, next) => {
  if (!req.path?.match(/\.php$/)) return next();
  const host = req.headers?.host;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]")) {
    const baseUrl = req.originalUrl.replace(/\.php.*$/, "");
    const response = await fetch(`http://${host}${baseUrl}`);
    // devuelve la respuesta PHP real
  } else {
    res.status(404).send("404 Not Found");
  }
};
```

Eso permite, cuando corres WordPress en local, que el honeypot sirva **verdaderas** páginas WordPress a los bots: el máximo realismo según mi experiencia.

### 6. Registro y análisis del tráfico

Separé dos responsabilidades: el `TrafficService` registra cada petición en un archivo JSON-lines. El `UnhandledRoutesService` analiza después esos logs para identificar las rutas que piden los bots y que quedan por cubrir en el honeypot.

```typescript
app.get("/newBotsRoute", async (_req, res) => {
  const routes = await unhandledRoutesService.getUnhandledRoutes(
    additionalEndpoints, knownPathOptions
  );
  res.setHeader("Content-Type", "text/plain");
  res.send(routes.join("\n"));
});
```

Me encanta ese bucle de retroalimentación: cuanto más dejas correr el honeypot, más aprendes lo que buscan los bots, y puedes añadir esas rutas a tus endpoints conocidos.

### 7. Endpoints conocidos y exclusión

El middleware acepta listas de `knownPaths`, `knownPatterns`, `knownApiPaths` y `knownApiPatterns`. Toda ruta que coincida con ellas atraviesa el middleware hacia tu verdadera aplicación. Encuentro ese filtro indispensable: tus endpoints reales quedan intactos, el honeypot nunca los intercepta.

```typescript
const matches = (p) => p === endpoint || p.startsWith(endpoint + "/");
```

## Los 328 endpoints en detalle

Así se clasifican (extracto del clasificador):

| Categoría | Ejemplos de endpoints |
|---|---|
| Fugas de credentials | `.env`, `secrets.json`, `aws/credentials`, `etc/shadow` |
| Claves SSH | `.ssh/id_rsa`, `.ssh/id_ed25519` |
| Configs de base de datos | `config/database`, `wp-config.php`, `docker-compose.yml` |
| Paneles de administración | `/admin`, `/wp-admin`, `/manage/account/login` |
| Respuestas API | `/api/version`, `/api/config`, `.do`, `.ashx` |
| Phishing bancario | `/lander/sber*`, `/index_sber.php` |
| Latidos C2 | Rutas aleatorias de 6+ caracteres (`/262LBNFp`) |
| Acciones/Bolsa | `/stock/mzhishu`, `/kline/1m/1`, `/m/allticker/1` |
| Juegos/Casino | `/proxy/games`, `/Ctrls/GetSysCoin`, `/room/getRoomBangFans` |
| Archivos de configuración | `config.json`, `config.yml`, `sitemap.xml`, `ads.txt` |
| Páginas de aterrizaje | `/about`, `/contact`, `/products`, `/blog` |

## Códigos y endpoints especiales

Añadí generadores especializados para casos particulares:

- **`genLanding()`**: páginas de phishing bancario en ruso para СберБанк, Тинькофф, Газпромбанк
- **`genC2Heartbeat()`**: respuesta de latido C2 realista con `agent_id`, `group`, `version`
- **`genScannerPath()`**: trampas para escáneres específicos (puertos nmap NICE, Hazelcast, CGI)
- **`genChineseApi()`**: respuestas de API chinas con `msg: "成功"` (éxito)
- **`genMerchant()`**: perfiles de comerciantes con `balance`, `fee_rate`, `tier`

## Cómo usarlo

### Instalación

```bash
npm install express-middleware-honeypot
```

### Uso básico con autorregistro

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

### Con app.use() (middleware comodín único)

```javascript
const { createHoneypot } = require("express-middleware-honeypot");
const app = express();

// Tus verdaderas rutas primero
app.get("/", (req, res) => res.send("Home"));

// Después el honeypot comodín
const instance = createHoneypot({ /* options */ });
app.use(instance.headersMiddleware);
app.use(instance.middleware);
```

### Respuestas completas vs. por defecto

```javascript
// Respuestas detalladas con páginas HTML completas
const instance = createHoneypot({ isCompleteResponses: true });
```

### Registro del tráfico

```javascript
const instance = createHoneypot({ logTraffic: true });
// Consulta el archivo traffic.txt para ver qué piden los bots
```

## Conclusión

Este middleware honeypot Express va mucho más allá de un simple señuelo. Con **328 endpoints**, una **generación al vuelo**, un **spoofing de cabeceras dinámico**, un **registro del tráfico** e incluso un **proxy PHP** para verdaderas respuestas WordPress, lo diseñé para quedar lo más realista posible.

Los escáneres pierden tiempo en páginas de administración ficticias, archivos `.env` creíbles y páginas de phishing bancario mientras tu aplicación real queda protegida. Aprecio en particular el sistema de doble variante y la clasificación inteligente: cada respuesta queda fresca y adaptada a la ruta pedida.

El código fuente está disponible en GitHub: [https://github.com/fox3000foxy/express-honeypot-middleware](https://github.com/fox3000foxy/express-honeypot-middleware)
