---
title: "我构建了一个超逼真的 Express 蜜罐"
description: "328 个虚假端点，响应即时生成，头部伪装，机器人流量记录 -- 深入一个旨在欺骗扫描器的 Express 蜜罐中间件的代码。"
date: "2026-06-10"
aiGenerated: true
authors:
  - fox3000foxy
tags:
  - express
  - nodejs
  - security
  - honeypot
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "pW7Jz7G/iN4QXExhO4Yk2K4TzTz/8Kragk0maJgIcyQ8t9iLcItVpgLpvID2DDkdgm/JEBtQgMuI08sBeaVXKQ=="
---

## 想法

机器人和自动扫描器不断探测 Web 应用程序以寻找漏洞。它们寻找 `.env` 文件、管理面板、数据库备份、SSH 凭据----任何可能被利用的东西。

我不想简单地返回 404，而是想创建更有趣的东西：一个 **Express 蜜罐**，它用可信的内容进行响应，让攻击者相信他们找到了一个易受攻击的目标。

## 功能

该中间件公开了 **328 个端点**，分为两种变体（默认和完整）。每个请求都会收到一个独特的即时生成的响应，包含新鲜的时间戳和请求 ID，模仿真实的服务器。

## 入门

```bash
npm install express-middleware-honeypot
```

使用自动注册的基本用法：

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
    console.log("服务器正在端口 3000 上运行");
});
```

## 工作原理

### 即时生成

磁盘上没有模拟文件。`mockupGenerator.ts` 服务在请求时创建每个响应，包含：

- 唯一的时间戳和请求 ID
- 针对端点定制的内容（凭据、配置、登录页面、API 响应）
- 真实的 HTTP 头部，带有动态的 `X-Powered-By` 伪装

### 头部伪装

`headersMiddleware` 根据路径扩展名动态选择 `X-Powered-By` 头部：

- `.php` → `X-Powered-By: PHP/8.1.12`
- `.jsp` → `X-Powered-By: JSP/3.0`
- `.aspx/.ashx/.asmx` → `X-Powered-By: ASP.NET`
- `.do/.action` → `X-Powered-By: Servlet/3.0`
- 其他路径 → 无 `X-Powered-By` 头部

### 328 个端点

| 类型 | 端点示例 |
|---|---|
| 凭据泄露 | `.env`, `secrets.json`, `aws/credentials`, `etc/shadow` |
| SSH 密钥 | `.ssh/id_rsa`, `.ssh/id_ed25519` |
| 数据库配置 | `config/database`, `wp-config.php`, `docker-compose.yml` |
| 管理面板 | `/admin`, `/wp-admin`, `/manage/account/login` |
| API 响应 | `/api/version`, `/api/config`, `.do`, `.ashx` |
| 银行钓鱼 | `/lander/sber*`, `/index_sber.php` |
| C2 心跳 | 6+ 字符随机路径 (`/262LBNFp`, `/Kd67Fq1x`) |
| 股票/加密货币 | `/stock/mzhishu`, `/kline/1m/1`, `/m/allticker/1` |
| 赌博/游戏 | `/proxy/games`, `/Ctrls/GetSysCoin`, `/room/getRoomBangFans` |
| 配置文件 | `config.json`, `config.yml`, `sitemap.xml`, `ads.txt` |
| 登陆页面 | `/about`, `/contact`, `/products`, `/blog` |

### PHP 伪装

`instance.phpSpoofer` 拦截 `*.php` 请求并将其代理到您的本地开发服务器，返回真正的 PHP 处理输出而不是静态模拟。

### 流量记录

流量可以以 JSON-lines 格式记录到 `traffic.txt`。未处理的未知路由可以通过 `GET /newBotsRoute` 提取。

## HoneypotInstance API

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

## 为什么有效

自动扫描器期望易受攻击的站点拥有某些文件。通过用真实的内容而不是 404 来响应，蜜罐可以：

1. **浪费攻击者时间**，让他们分析虚假结果
2. **记录他们的指纹**，供以后分析
3. **转移注意力**，远离真正的漏洞
4. **揭示新的攻击模式**，通过未处理的路由

## 结论

完整的源代码可在 GitHub 上获取，地址为 [github.com/anomalyco/express-honeypot-middleware](https://github.com/anomalyco/express-honeypot-middleware)。欢迎随时试用、提交问题或贡献代码。
