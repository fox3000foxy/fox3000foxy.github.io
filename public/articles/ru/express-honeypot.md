---
title: "Я создал ultra-реалистичный Express honeypot"
description: "328 поддельных endpoint'ов с генерируемыми на лету ответами, подмена заголовков, запись трафика ботов — погружение в код middleware-ловушки для Express, созданной для обмана сканеров."
aiGenerated: true
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "MEUCIHkv9TwCQ8zQG63ZwfAz+xVpgLlrsv/md832NhmIwJfnAiEA14bupG3uUz8ZinJ28LsIs8C0oJwYnUID2c79lbsOca0="
---

## Идея

Вы когда-нибудь смотрели логи своего Express-сервера и видели странные запросы к `/wp-admin`, `/.env`, `/etc/shadow`? Это боты, сканеры и любопытные, проверяющие ваше приложение на уязвимости.

Поэтому я решил создать **middleware-honeypot для Express** — приманку, которая отвечает на такие запросы ультра-реалистичными ответами, как будто каждая конечная точка — настоящий открытый сервис.

## Зачем honeypot, а не просто 404

Когда бот натыкается на ваше приложение:

- **С 404**: он понимает, что путь не существует, и идёт дальше.
- **С фальшивым ответом**: он думает, что нашёл что-то интересное, и продолжает исследование, раскрывая своё поведение и техники.

Хорошо сделанный honeypot позволяет:
- Записывать трафик ботов для анализа
- Тратить время сканеров впустую
- Обнаруживать новые паттерны атак
- Изучать техники ботнетов

## 328 endpoint'ов

Middleware охватывает **328 endpoint'ов** (в 2 вариантах: `default` и `complete`). Каждый endpoint возвращает правдоподобный контент, генерируемый на лету.

Вот их распределение:

| Категория | Примеры |
|---|---|
| Утечки credentials | `.env`, `secrets.json`, `aws/credentials` |
| SSH-ключи | `.ssh/id_rsa`, `.ssh/id_ed25519` |
| Конфиги БД | `config/database`, `wp-config.php`, `docker-compose.yml` |
| Панели администрирования | `/admin`, `/wp-admin`, `/manage/account/login` |
| API-ответы | `/api/version`, `/api/config` |
| Банковский фишинг | `/lander/sber*`, `/index_sber.php` |
| C2 heartbeats | Случайные пути (`/262LBNFp`, `/Kd67Fq1x`) |
| Крипто/акции | `/stock/mzhishu`, `/kline/1m/1` |
| Игры/гемблинг | `/proxy/games`, `/Ctrls/GetSysCoin` |
| Статические страницы | `/about`, `/contact`, `/products`, `/blog` |

## Архитектура middleware

В основе проекта лежит генератор mockup'ов, создающий каждый ответ на лету:

```ts
// Генератор назначает уникальные timestamp и request_id
function generateMockResponse(endpoint: string): MockResponse {
    return {
        timestamp: Date.now(),
        requestId: crypto.randomUUID(),
        data: generateContentFor(endpoint),
    };
}
```

### Два уровня реализма

Режим `default` возвращает краткие, но правдоподобные ответы:

```json
{
    "code": 0,
    "message": "ok",
    "data": { "user": "admin", "role": "superadmin" }
}
```

Режим `complete` добавляет метаданные, таймстемпы и заголовки версии для максимального реализма:

```json
{
    "code": 0,
    "message": "ok",
    "timestamp": 1718032412000,
    "request_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "version": "1.2.3",
    "data": { "user": "admin", "role": "superadmin" }
}
```

## Подмена заголовков

Критический аспект правдоподобия — HTTP-заголовки. Middleware выбирает их динамически в зависимости от расширения запрашиваемого файла:

| Расширение | `X-Powered-By` |
|---|---|
| `.php` | `PHP/8.1.12` |
| `.jsp` | `JSP/3.0` |
| `.aspx`, `.ashx`, `.asmx` | `ASP.NET` |
| `.do`, `.action` | `Servlet/3.0` |
| остальные | без заголовка |

## PHP Spoofer

Интересный компонент — `phpSpoofer`. Вместо статического ответа он может **проксировать `.php`-запросы на локальный PHP-сервер**:

1. Перехватывает запросы с `.php` в пути
2. Удаляет суффикс `.php` и проксирует на `http://localhost:<port>/<base>`
3. Если локальный сервер отвечает, HTML возвращается боту
4. Если хост не localhost, возвращает 404 (защита SSRF)

Это позволяет отдавать ботам **настоящие страницы WordPress** в режиме разработки.

## Публичное API

Middleware предоставляет компонуемое API:

```ts
interface HoneypotInstance {
    mocks: Record<string, Middleware>;
    middleware: Middleware;
    headersMiddleware: Middleware;
    phpSpoofer: Middleware;
    notFoundHandler: Middleware;
    register(app: RouteApp): void;
    getUnhandledRoutes(): Promise<string[]>;
    getNotCoveredEndpoints(): string[];
}
```

### Простое использование

```js
const { createHoneypot } = require("express-middleware-honeypot");
const instance = createHoneypot({ logTraffic: true });
instance.register(app);
```

### Продвинутое — отдельные endpoint'ы

```js
const instance = createHoneypot({});
app.all('/admin', instance.mocks['/admin']);
app.all('/.env', instance.mocks['/.env']);
```

### Режим catch-all

```js
app.use(instance.middleware);
app.use(instance.phpSpoofer);
```

## Запись трафика

С опцией `logTraffic: true` каждый входящий запрос записывается в формате JSON-lines в `traffic.txt`. Неизвестные маршруты (не входящие в 328 встроенных endpoint'ов) доступны через `/newBotsRoute`, что позволяет расширять покрытие.

## Генерация mockup'ов для отладки

Для записи mockup'ов на диск и их просмотра:

```bash
bun run scripts/generate-mockups.ts --dry-run
bun run scripts/generate-mockups.ts --list-uncategorized
```

## Результаты

С момента установки этого honeypot на staging-сервер:

- **Более 5000 подозрительных запросов** записано за 48 часов
- **Новые боты** обнаруживаются ежедневно через неохваченные маршруты
- **Выявлены новые паттерны атак** (новые C2, техники сканирования)
- **Ноль ложных срабатываний** — реальные пользователи никогда не заходят на эти пути

## Заключение

Этот проект показывает, что операционную слабость (нежелательные запросы) можно превратить в разведывательный инструмент. Middleware доступен на npm, а код опубликован в открытом доступе.

Исходный код доступен здесь: [https://github.com/fox3000foxy/express-honeypot-middleware](https://github.com/fox3000foxy/express-honeypot-middleware)
