---
title: "Я построил ультрареалистичный honeypot на Express"
description: "328 фейковых эндпоинтов с ответами, генерируемыми на лету, спуфинг заголовков, логирование бот-трафика -- погружение в сердце honeypot-middleware для Express, задуманного дурить сканеры."
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
author_sig: "xDnCyazVo2h7y1P1kmP9u5NRu/rlerUgXq1P6oaKv6OwO+JFqvQrKqGl64GGT+rWoGtJh/9r+x+KKwE+bA9XbA=="
---

## TL;DR

Я создал middleware для Express, выставляющий **328 фейковых эндпоинтов** на выбор из двух вариантов : `default` (сдержанные, но правдоподобные ответы) и `complete` (очень детальные ответы). Каждый ответ **генерируется на лету** со свежими timestamp и идентификаторами запроса, что делает каждый ответ уникальным. Никаких мок-файлов на диске. Middleware умеет также **журналировать трафик** в текстовый файл и выставлять необработанные роуты на `/newBotsRoute`, чтобы анализировать, что ищут боты.

**Это куда больше, чем простой возврат 404.** Я проектировал эту инженерную штуку так, чтобы походить на настоящий сервер, чтобы сканеры тратили на неё время. Показываю, как это работает.

## Проблема

Боты безопасности, скраперы и злоумышленники постоянно сканируют веб-серверы в поисках распространённых роутов :

- `.env`, `wp-config.php`, `admin/`, `phpinfo.php` и т.д.
- API-эндпоинты вроде `/api/version`, `/api/config`
- файлы конфигурации : `dump.sql`, `.git/config`, `docker-compose.yml`
- страницы банковского фишинга : `/lander/sberbank*`, `/index_sber.php`

Я видел этот предел на собственных серверах : возврат 404 или 403 сразу говорит сканеру, что роута нет, и он идёт к следующей. С этим honeypot я выбрал обратное : **заставить сканер поверить, что существует всё**, чтобы он терял время на фейковых ответах, пока твой настоящий сервер остаётся защищён за известными роутами.

## Архитектура

### 1. Классификатор, а не lookup-таблица

Центральная деталь это функция `classify()` в `src/services/mockupGenerator.ts`, принимающая путь эндпоинта и возвращающая генератор ответа. Я построил её как каскад правил :

1. **Точные совпадения** : у самых распространённых эндпоинтов выделенные генераторы
2. **Совпадения по паттерну** : regex по пути для детекта паттернов вроде `id_rsa`, `wp-admin`, `sitemap.xml`
3. **Умная классификация** : пути вроде `/262LBNFp` (6+ случайных символов) классифицируются как "сердцебиения C2"
4. **Правила-заглушки** : пути API, файлы `.php`, `.html`, `.js`, `.json` и `.asmx` имеют общие генераторы
5. **Финальный catchall** : `genCatchall()` даёт общий JSON-ответ с метаданными

Мне нравится этот подход, потому что ответы остаются **свежими при каждом запросе** : никаких статичных файлов, никакого кэширования, каждый ответ несёт собственный timestamp, будто пришёл с настоящего сервера.

### 2. Система двойного варианта

Каждый генератор поддерживает два варианта :

```typescript
type Variant = "default" | "complete";
```

- **`default`** : краткие, но правдоподобные ответы. Пример для `.env` :
  ```
  DB_HOST=localhost
  DB_USER=root
  DB_PASS=s3cur3P@ss
  APP_ENV=development
  APP_DEBUG=true
  ```

- **`complete`** : очень детальные ответы. Пример для `.env` :
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

Вариант `complete` включает также полные HTML-страницы со стилизованным CSS : админки, экраны логина WordPress, страницы банковского фишинга на русском и т.д. Считаю его грозным, когда хочешь реально занять сканер.

### 3. Генерация на лету

Я использую `Date.now()` и `Date().toISOString()`, чтобы давать уникальные timestamp и идентификаторы запроса при каждом вызове. Вот функция обогащения :

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

Для JSON-ответов middleware пытается парсить и обогащать этими полями. Не-JSON ответы возвращаются как есть.

### 4. Middleware спуфинга заголовков

Я добавил выделенный middleware, ставящий реалистичные HTTP-заголовки в зависимости от расширения запрошенного файла :

```typescript
res.setHeader("Server", "nginx/1.24.0");
res.setHeader("X-Frame-Options", "SAMEORIGIN");
res.setHeader("X-XSS-Protection", "1; mode=block");
res.setHeader("X-Content-Type-Options", "nosniff");
res.setHeader("X-Robots-Tag", "noindex, nofollow");
res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

// Реалистичный X-Powered-By по расширению файла
if (path.endsWith(".php")) res.setHeader("X-Powered-By", "PHP/8.1.12");
else if (path.endsWith(".jsp")) res.setHeader("X-Powered-By", "JSP/3.0");
else if (path.endsWith(".aspx") || path.endsWith(".ashx") || path.endsWith(".asmx"))
  res.setHeader("X-Powered-By", "ASP.NET");
else if (path.endsWith(".do") || path.endsWith(".action"))
  res.setHeader("X-Powered-By", "Servlet/3.0");
```

Это делает ответы куда правдоподобнее : эндпоинт `.php` с `X-Powered-By: PHP/8.1.12` и `Server: nginx/1.24.0` выглядит ровно как настоящий сервер WordPress. Держусь за эту деталь, потому что часто именно заголовок выдаёт фейковый сервер.

### 5. PHP-спуфер

`phpSpoofer` остаётся моим любимым компонентом. Если запрос приходит за файлом `.php` и хост это localhost, middleware **проксирует** запрос на твой локальный PHP-сервер, который обрабатывает и возвращает настоящую PHP-страницу. Если хост удалённый, он возвращает 404, чтобы блокировать попытки SSRF.

```typescript
const phpSpoofer = async (req, res, next) => {
  if (!req.path?.match(/\.php$/)) return next();
  const host = req.headers?.host;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]")) {
    const baseUrl = req.originalUrl.replace(/\.php.*$/, "");
    const response = await fetch(`http://${host}${baseUrl}`);
    // возвращает настоящий PHP-ответ
  } else {
    res.status(404).send("404 Not Found");
  }
};
```

Это позволяет, когда крутишь WordPress локально, honeypot отдаёт ботам **настоящие** страницы WordPress : максимум реализма по моему опыту.

### 6. Журналирование и анализ трафика

Я разделил две ответственности : `TrafficService` журналирует каждый запрос в файл JSON-lines. `UnhandledRoutesService` затем анализирует эти логи, чтобы выявлять пути, запрашиваемые ботами, которые honeypot пока не покрывает.

```typescript
app.get("/newBotsRoute", async (_req, res) => {
  const routes = await unhandledRoutesService.getUnhandledRoutes(
    additionalEndpoints, knownPathOptions
  );
  res.setHeader("Content-Type", "text/plain");
  res.send(routes.join("\n"));
});
```

Обожаю эту петлю обратной связи : чем дольше крутится honeypot, тем больше узнаёшь, что ищут боты, и можешь добавлять эти пути в известные эндпоинты.

### 7. Известные эндпоинты и исключение

Middleware принимает списки `knownPaths`, `knownPatterns`, `knownApiPaths` и `knownApiPatterns`. Любой роут, совпавший с ними, проходит сквозь middleware к твоему настоящему приложению. Считаю этот фильтр обязательным : настоящие эндпоинты остаются нетронутыми, honeypot их никогда не перехватывает.

```typescript
const matches = (p) => p === endpoint || p.startsWith(endpoint + "/");
```

## 328 эндпоинтов в деталях

Вот как они классифицированы (выдержка из классификатора) :

| Catégorie | Exemples d'endpoints |
|---|---|
| Fuites de credentials | `.env`, `secrets.json`, `aws/credentials`, `etc/shadow` |
| Clés SSH | `.ssh/id_rsa`, `.ssh/id_ed25519` |
| Configs de base de données | `config/database`, `wp-config.php`, `docker-compose.yml` |
| Panneaux d'administration | `/admin`, `/wp-admin`, `/manage/account/login` |
| Réponses API | `/api/version`, `/api/config`, `.do`, `.ashx` |
| Phishing bancaire | `/lander/sber*`, `/index_sber.php` |
| Battements de cœur C2 | Chemins aléatoires de 6+ caractères (`/262LBNFp`) |
| Actions/Bourse | `/stock/mzhishu`, `/kline/1m/1`, `/m/allticker/1` |
| Jeux/Casino | `/proxy/games`, `/Ctrls/GetSysCoin`, `/room/getRoomBangFans` |
| Fichiers de configuration | `config.json`, `config.yml`, `sitemap.xml`, `ads.txt` |
| Pages d'atterrissage | `/about`, `/contact`, `/products`, `/blog` |

## Специальные коды и эндпоинты

Я добавил специализированные генераторы для частных случаев :

- **`genLanding()`** : страницы банковского фишинга на русском для СберБанка, Тинькофф, Газпромбанка
- **`genC2Heartbeat()`** : реалистичный ответ сердцебиения C2 с `agent_id`, `group`, `version`
- **`genScannerPath()`** : ловушки для конкретных сканеров (порты nmap NICE, Hazelcast, CGI)
- **`genChineseApi()`** : ответы китайских API с `msg: "成功"` (успех)
- **`genMerchant()`** : профили торговцев с `balance`, `fee_rate`, `tier`

## Как использовать

### Установка

```bash
npm install express-middleware-honeypot
```

### Базовое использование с авторегистрацией

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

### Через app.use() (единый catch-all middleware)

```javascript
const { createHoneypot } = require("express-middleware-honeypot");
const app = express();

// Сначала настоящие роуты
app.get("/", (req, res) => res.send("Home"));

// Затем catch-all honeypot
const instance = createHoneypot({ /* options */ });
app.use(instance.headersMiddleware);
app.use(instance.middleware);
```

### Полные против дефолтных ответов

```javascript
// Детальные ответы с полными HTML-страницами
const instance = createHoneypot({ isCompleteResponses: true });
```

### Журналирование трафика

```javascript
const instance = createHoneypot({ logTraffic: true });
// Смотри файл traffic.txt, чтобы видеть, что просят боты
```

## Заключение

Этот honeypot-middleware для Express идёт сильно дальше простой приманки. С **328 эндпоинтами**, **генерацией на лету**, **динамическим спуфингом заголовков**, **журналированием трафика** и даже **PHP-прокси** для настоящих ответов WordPress, я проектировал его максимально реалистичным.

Сканеры теряют время на фейковых админках, правдоподобных файлах `.env` и страницах банковского фишинга, пока настоящее приложение остаётся защищённым. Особенно ценю систему двойного варианта и умную классификацию : каждый ответ остаётся свежим и подходящим запрошенному пути.

Исходник доступен на GitHub : [https://github.com/fox3000foxy/express-honeypot-middleware](https://github.com/fox3000foxy/express-honeypot-middleware)
