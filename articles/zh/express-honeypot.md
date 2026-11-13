---
title: 我写了个超逼真的 Express 蜜罐
description: 328 个假 endpoint，响应实时生成，头部伪造，机器人流量日志，深入一个为溜扫描器设计的 Express 蜜罐中间件。
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
author_sig: "peSivuvjgZ77Vpou1cwdv36F+yL9SopboNzP0kdB0FaOGbakKqxENFXIifWoGp8y9vL5Fti24qk4cATMOqiiLg=="
---

## TL;DR

我写了个 Express 中间件，暴露 **328 个假 endpoint**，两种变体可选：`default`（简洁可信）和 `complete`（超详细）。每个响应都**实时生成**，带新鲜的时间戳和请求 ID，所以每次响应都唯一。磁盘上没有任何 mock 文件。中间件还能把**流量记日志**到文本文件，并在 `/newBotsRoute` 上暴露未覆盖的路由，分析机器人在找什么。

**这远不止返回个 404。** 我把它做成像真服务器的样子，让扫描器在上面浪费时间。下面拆给你看。

## 问题

安全机器人、爬虫和坏人一直在扫 web 服务器的常见路径：

- `.env`、`wp-config.php`、`admin/`、`phpinfo.php` 等
- API endpoint 如 `/api/version`、`/api/config`
- 配置文件：`dump.sql`、`.git/config`、`docker-compose.yml`
- 银行钓鱼页：`/lander/sberbank*`、`/index_sber.php`

我自己服务器上见过这个局限：直接回 404 或 403，扫描器立刻知道这路不存在，换下一条。这个蜜罐反着来：**让扫描器以为条条路都存在**，在假响应上烧时间，你的真服务器躲在已知路由后面安然无恙。

## 架构

### 1. 分类器，不是查表

核心是 `src/services/mockupGenerator.ts` 里的 `classify()` 函数，输入 endpoint 路径，输出响应生成器。我做成级联规则：

1. **精确匹配**：最常见的 endpoint 有专用生成器
2. **模式匹配**：路径正则，识别 `id_rsa`、`wp-admin`、`sitemap.xml` 这类模式
3. **智能分类**：像 `/262LBNFp`（6 个以上随机字符）归为"C2 心跳"
4. **兜底规则**：API 路径、`.php`、`.html`、`.js`、`.json`、`.asmx` 文件有通用生成器
5. **最终 catchall**：`genCatchall()` 生成带元数据的通用 JSON 响应

我喜欢这个设计，因为响应**每次请求都新鲜**：没有静态文件，没有缓存，每个响应自带时间戳，像刚从真服务器出来。

### 2. 双变体系统

每个生成器支持两种变体：

```typescript
type Variant = "default" | "complete";
```

- **`default`**：简洁但可信。比如 `.env`：
  ```
  DB_HOST=localhost
  DB_USER=root
  DB_PASS=s3cur3P@ss
  APP_ENV=development
  APP_DEBUG=true
  ```

- **`complete`**：超详细。比如 `.env`：
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

`complete` 变体还带完整 HTML 页面和 CSS 样式：管理后台、WordPress 登录页、俄语银行钓鱼页等。想真正拖住扫描器时很好用。

### 3. 实时生成

我用 `Date.now()` 和 `Date().toISOString()` 给每次调用产新鲜时间戳和请求 ID。丰富函数长这样：

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

JSON 响应中间件会尝试解析并加上这些字段。非 JSON 原样返回。

### 4. 头部伪造中间件

我加了个专用中间件，按请求文件扩展名设置逼真的 HTTP 头：

```typescript
res.setHeader("Server", "nginx/1.24.0");
res.setHeader("X-Frame-Options", "SAMEORIGIN");
res.setHeader("X-XSS-Protection", "1; mode=block");
res.setHeader("X-Content-Type-Options", "nosniff");
res.setHeader("X-Robots-Tag", "noindex, nofollow");
res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

// 按文件扩展名的逼真 X-Powered-By
if (path.endsWith(".php")) res.setHeader("X-Powered-By", "PHP/8.1.12");
else if (path.endsWith(".jsp")) res.setHeader("X-Powered-By", "JSP/3.0");
else if (path.endsWith(".aspx") || path.endsWith(".ashx") || path.endsWith(".asmx"))
  res.setHeader("X-Powered-By", "ASP.NET");
else if (path.endsWith(".do") || path.endsWith(".action"))
  res.setHeader("X-Powered-By", "Servlet/3.0");
```

响应可信度高很多：`.php` endpoint 配 `X-Powered-By: PHP/8.1.12` 加 `Server: nginx/1.24.0`，就是一台真 WordPress。我抠这个细节，因为头部最容易出卖假服务器。

### 5. PHP Spoofer

`phpSpoofer` 还是我最喜欢的组件。请求 `.php` 文件且 host 是 localhost 时，中间件**代理**到你本地 PHP 服务器，处理并返回真 PHP 页面。host 是远程就回 404，挡掉一切 SSRF 尝试。

```typescript
const phpSpoofer = async (req, res, next) => {
  if (!req.path?.match(/\.php$/)) return next();
  const host = req.headers?.host;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]")) {
    const baseUrl = req.originalUrl.replace(/\.php.*$/, "");
    const response = await fetch(`http://${host}${baseUrl}`);
    // 返回真实 PHP 响应
  } else {
    res.status(404).send("404 Not Found");
  }
};
```

本地跑 WordPress 时，蜜罐给机器人喂**真** WordPress 页面：按我的经验逼真度拉满。

### 6. 流量日志与分析

我把两个职责分开：`TrafficService` 把每次请求记进 JSON-lines 文件。`UnhandledRoutesService` 再分析这些日志，找出机器人要的、蜜罐还没覆盖的路径。

```typescript
app.get("/newBotsRoute", async (_req, res) => {
  const routes = await unhandledRoutesService.getUnhandledRoutes(
    additionalEndpoints, knownPathOptions
  );
  res.setHeader("Content-Type", "text/plain");
  res.send(routes.join("\n"));
});
```

我喜欢这个反馈环：蜜罐跑越久，你越知道机器人在找什么，再把这些路径加进已知 endpoint。

### 7. 已知 endpoint 与放行

中间件接受 `knownPaths`、`knownPatterns`、`knownApiPaths`、`knownApiPatterns` 列表。匹配的路由穿过中间件，直达你的真应用。我觉得这个过滤必不可少：真 endpoint 原样保留，蜜罐一个不拦。

```typescript
const matches = (p) => p === endpoint || p.startsWith(endpoint + "/");
```

## 328 个 endpoint 明细

分类器里是这么分的（摘录）：

| 类别 | endpoint 示例 |
|---|---|
| 凭证泄露 | `.env`、`secrets.json`、`aws/credentials`、`etc/shadow` |
| SSH 密钥 | `.ssh/id_rsa`、`.ssh/id_ed25519` |
| 数据库配置 | `config/database`、`wp-config.php`、`docker-compose.yml` |
| 管理后台 | `/admin`、`/wp-admin`、`/manage/account/login` |
| API 响应 | `/api/version`、`/api/config`、`.do`、`.ashx` |
| 银行钓鱼 | `/lander/sber*`、`/index_sber.php` |
| C2 心跳 | 6 字符以上随机路径（`/262LBNFp`） |
| 行情/股票 | `/stock/mzhishu`、`/kline/1m/1`、`/m/allticker/1` |
| 游戏/赌场 | `/proxy/games`、`/Ctrls/GetSysCoin`、`/room/getRoomBangFans` |
| 配置文件 | `config.json`、`config.yml`、`sitemap.xml`、`ads.txt` |
| 落地页 | `/about`、`/contact`、`/products`、`/blog` |

## 特殊代码与 endpoint

针对特殊情况我写了专用生成器：

- **`genLanding()`**：俄语银行钓鱼页，СберБанк、Тинькофф、Газпромбанк
- **`genC2Heartbeat()`**：逼真 C2 心跳响应，带 `agent_id`、`group`、`version`
- **`genScannerPath()`**：扫描器陷阱（nmap 端口、Hazelcast、CGI）
- **`genChineseApi()`**：中文 API 响应，带 `msg: "成功"`
- **`genMerchant()`**：商户画像，带 `balance`、`fee_rate`、`tier`

## 怎么用

### 安装

```bash
npm install express-middleware-honeypot
```

### 基础用法，自动注册

```javascript
const { createHoneypot } = require("express-middleware-honeypot");

const app = express();
const instance = createHoneypot({
    knownPaths: ["/", "/login", "/support"],
    knownPatterns: [/^\/blogs\/[^/]+$/],
    knownApiPaths: ["/api/cart", "/api/cart/list"],
    knownApiPatterns: [/^\/api\/cart\/[^/]+$/],
    logTraffic: true,
    is404Handler: false,
    isCompleteResponses: false,
});

instance.register(app);
app.listen(3000);
```

### 用 app.use()（单个兜底中间件）

```javascript
const { createHoneypot } = require("express-middleware-honeypot");
const app = express();

// 真路由先行
app.get("/", (req, res) => res.send("Home"));

// 蜜罐兜底
const instance = createHoneypot({ /* options */ });
app.use(instance.headersMiddleware);
app.use(instance.middleware);
```

### 完整响应 vs 默认

```javascript
// 详细响应，带完整 HTML 页面
const instance = createHoneypot({ isCompleteResponses: true });
```

### 流量日志

```javascript
const instance = createHoneypot({ logTraffic: true });
// 看 traffic.txt 就知道机器人在要什么
```

## 结语

这个 Express 蜜罐中间件远不止一个诱饵。**328 个 endpoint**、**实时生成**、**动态头部伪造**、**流量日志**，还有给真 WordPress 响应的 **PHP 代理**，我按尽可能逼真来做的。

扫描器在假管理后台、可信 `.env`、银行钓鱼页上烧时间，你的真应用安然无恙。我最喜欢双变体系统和智能分类：每个响应都新鲜，且正好长在请求路径该长的样子。

源码在 GitHub：[https://github.com/fox3000foxy/express-honeypot-middleware](https://github.com/fox3000foxy/express-honeypot-middleware)
