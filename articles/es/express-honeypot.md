---
title: "Construí un honeypot Express ultrarealista"
description: "328 endpoints falsos con respuestas generadas sobre la marcha, spoofing de cabeceras, registro de tráfico de bots -- inmersión en un middleware honeypot Express diseñado para engañar a escáneres."
aiGenerated: true
tags:
  - express
  - nodejs
  - security
  - honeypot
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "u0+gImq2oK6fWI7egrH9+LWhnVkTkY5d78zz/G6HoT5INJ5elDllzDImJMnOs7IEM52bsIxABtn0RujxURjOeA=="
---

## ¿Qué es un honeypot Express?

Un honeypot es un señuelo que imita un sistema real para atraer y detectar atacantes. En el contexto de una aplicación web Express, es un middleware que intercepta peticiones sospechosas y responde con contenidos falsos creíbles, permitiendo analizar el comportamiento de bots y escáneres sin exponer datos reales.

**express-middleware-honeypot** es un paquete npm que convierte tu aplicación Express en un auténtico señuelo. Expone **328 endpoints** que cubren una amplia gama de objetivos de ataque típicos -- archivos de configuración, credenciales, páginas de administración, endpoints API, páginas de phishing bancario, y mucho más.

Cada endpoint genera una respuesta **sobre la marcha**, con marcas de tiempo e identificadores de solicitud frescos, haciendo que cada respuesta sea única y creíble.

## Instalación

```bash
npm install express-middleware-honeypot
```

## Uso

### Registro automático con `register()`

La forma más sencilla de usar el honeypot es llamando a `register()` en tu aplicación Express. Esto registra todos los middlewares -- logging, cabeceras, manejador 404 -- de una sola vez:

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

### Middleware único con `app.use()`

Para un control más preciso, puedes usar el middleware comodín:

```js
const { createHoneypot } = require("express-middleware-honeypot");

const app = express();

// Tus rutas reales primero
app.get("/", (req, res) => res.send("Home"));

// Luego el honeypot
const instance = createHoneypot({ /* opciones */ });
app.use(instance.middleware);
app.use(instance.phpSpoofer);
```

### Mocks individuales con `app.all()`

También puedes seleccionar endpoints específicos:

```js
const instance = createHoneypot({ /* opciones */ });

app.all('/admin', instance.mocks['/admin']);
app.all('/.env', instance.mocks['/.env']);
app.all('/wp-admin', instance.mocks['/wp-admin']);
```

`instance.mocks` es un `Record<string, Middleware>` indexado por ruta de endpoint.

## Spoofing de cabeceras

El middleware de cabeceras (`instance.headersMiddleware`) establece cabeceras de respuesta realistas -- `Server: nginx/1.24.0`, `X-Frame-Options`, `X-XSS-Protection`, y especialmente una cabecera `X-Powered-By` dinámica basada en la extensión del archivo:

- `.php` → `X-Powered-By: PHP/8.1.12`
- `.jsp` → `X-Powered-By: JSP/3.0`
- `.aspx/.ashx/.asmx` → `X-Powered-By: ASP.NET`
- `.do/.action` → `X-Powered-By: Servlet/3.0`
- Otros → sin cabecera `X-Powered-By`

```js
app.use(instance.headersMiddleware);
app.use(instance.middleware);
```

## PHP Spoofer

El `instance.phpSpoofer` va más allá: intercepta las peticiones `*.php` y las **proxy a tu servidor PHP local**, devolviendo un renderizado PHP real en lugar de una respuesta estática:

```js
app.use(instance.phpSpoofer);
```

Cómo funciona:
1. Captura peticiones con `.php` en la ruta
2. Elimina el sufijo `.php` y hace proxy a `http://localhost:<port>/<base>`
3. Si tu servidor PHP local responde (Valet, Laravel, etc.), se devuelve el HTML
4. Si el host no es localhost, devuelve un 404 (previene ataques SSRF)
5. ¿No hay servidor PHP local? Pasa al manejador 404

Esto permite ejecutar una aplicación WordPress/PHP real en local y servir páginas realmente renderizadas a los bots mientras se usan respuestas estáticas en producción.

## Opciones de configuración

| Opción | Tipo | Defecto | Descripción |
|---|---|---|---|
| `knownPaths` | `string[]` | `[]` | Rutas manejadas por la app real (excluidas de los mocks) |
| `knownPatterns` | `RegExp[]` | `[]` | Expresiones regulares para rutas reales |
| `knownApiPaths` | `string[]` | `[]` | Rutas API de la app real |
| `knownApiPatterns` | `RegExp[]` | `[]` | Expresiones regulares para rutas API reales |
| `logTraffic` | `boolean` | `false` | Registra todo el tráfico en `traffic.txt` |
| `is404Handler` | `boolean` | `false` | Registra un manejador 404 de respaldo |
| `isCompleteResponses` | `boolean` | `false` | Usa la variante «complete» (rica en detalles) |
| `additionalEndpoints` | `string[]` | `["/not_covered_endpoint_test"]` | Endpoints adicionales más allá de los 328 integrados |
| `enrichResponses` | `boolean` | `true` | Enriquece respuestas JSON con timestamp/versión |

## Los mocks -- 328 endpoints en dos variantes

El generador de mocks (`src/services/mockupGenerator.ts`) produce respuestas **sobre la marcha** para 328 endpoints, cada uno en dos variantes:

- **Default** -- sucinto pero creíble (`{ code: 0, message: "ok", data: {...} }`)
- **Complete** -- respuestas ricas con marcas de tiempo, ID de solicitud, metadatos, cabeceras de versión, etc.

Para escribir los mocks a disco (depuración):

```bash
bun run scripts/generate-mockups.ts --dry-run          # solo vista previa
bun run scripts/generate-mockups.ts --list-uncategorized  # endpoints comodín
```

### Tipos de contenido servidos

| Tipo | Ejemplos de endpoints |
|---|---|
| Fugas de credenciales | `.env`, `secrets.json`, `aws/credentials`, `etc/shadow` |
| Claves SSH | `.ssh/id_rsa`, `.ssh/id_ed25519` |
| Configs de base de datos | `config/database`, `wp-config.php`, `docker-compose.yml` |
| Paneles de administración | `/admin`, `/wp-admin`, `/manage/account/login` |
| Respuestas API | `/api/version`, `/api/config`, `.do`, `.ashx` |
| Phishing bancario | `/lander/sber*`, `/index_sber.php` |
| Latidos C2 | Rutas aleatorias de 6+ caracteres (`/262LBNFp`, `/Kd67Fq1x`) |
| Acciones/Crypto | `/stock/mzhishu`, `/kline/1m/1`, `/m/allticker/1` |
| Juegos/Apuestas | `/proxy/games`, `/Ctrls/GetSysCoin`, `/room/getRoomBangFans` |
| Archivos de configuración | `config.json`, `config.yml`, `sitemap.xml`, `ads.txt` |
| Páginas de inicio | `/about`, `/contact`, `/products`, `/blog` |

## Endpoints de análisis

| Ruta | Descripción |
|---|---|
| `GET /newBotsRoute` | Devuelve rutas desconocidas no gestionadas encontradas en los logs de tráfico |
| `GET /notCoveredAdditionalEndpoints` | Devuelve endpoints adicionales no cubiertos por los 328 integrados |

## API HoneypotInstance

```ts
interface HoneypotInstance {
  mocks: Record<string, Middleware>;       // Manejadores individuales
  middleware: Middleware;                  // Middleware comodín
  headersMiddleware: Middleware;           // Cabeceras de respuesta realistas
  phpSpoofer: Middleware;                  // Middleware de spoofing PHP
  notFoundHandler: Middleware;             // Manejador 404 de respaldo
  register(app: RouteApp): void;           // Registra todos los manejadores
  getUnhandledRoutes(): Promise<string[]>; // Rutas de bots no gestionadas
  getNotCoveredEndpoints(): string[];      // Endpoints adicionales no cubiertos
}
```

## Desarrollo

```bash
bun install
bun test          # 36+ tests
bun run build     # TypeScript → dist/
```

## Nota de seguridad

Este paquete es una herramienta de señuelo/engaño. No expongas datos sensibles reales a través de tu aplicación mientras se ejecuta.

## Licencia

MIT

---

El código fuente está disponible en GitHub : [express-honeypot-middleware](https://github.com/fox3000foxy/express-honeypot-middleware)
