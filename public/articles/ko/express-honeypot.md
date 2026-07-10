---
title: "초현실적인 Express 허니팟을 구축했습니다"
description: "328개의 가짜 엔드포인트, 즉석에서 생성되는 응답, 헤더 스푸핑, 봇 트래픽 기록 — 스캐너를 속이기 위해 설계된 Express 허니팟 미들웨어 코드 분석."
date: "2026-06-10"
aiGenerated: true
tags:
  - express
  - nodejs
  - security
  - honeypot
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "fp6VmlJP48GHz1wtZVnLTbXn9ecWr0+OQW9AwSeTikHCrqqmhd5zabwAq1sDEB/aB2NhS3vZ6uMisst+EnxolA=="
---

## 아이디어

봇과 자동 스캐너는 취약점을 찾기 위해 웹 애플리케이션을 끊임없이 스캔합니다. `.env` 파일, 관리자 패널, 데이터베이스 백업, SSH 자격 증명 — 악용할 수 있는 모든 것을 찾습니다.

단순히 404를 반환하는 대신, 더 흥미로운 것을 만들고 싶었습니다: 공격자가 취약한 대상을 찾았다고 믿게 만드는 **신뢰할 수 있는 콘텐츠로 응답하는 Express 허니팟**입니다.

## 기능

이 미들웨어는 2가지 변형(기본 및 전체)으로 나뉜 **328개의 엔드포인트**를 노출합니다. 각 요청은 실제 서버를 모방하여 신선한 타임스탬프와 요청 ID가 포함된 즉석에서 생성된 고유한 응답을 받습니다.

## 시작하기

```bash
npm install express-middleware-honeypot
```

자동 등록을 사용한 기본 사용법:

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
    console.log("서버가 포트 3000에서 실행 중입니다");
});
```

## 작동 방식

### 즉석 생성

디스크에 모의 파일이 없습니다. `mockupGenerator.ts` 서비스는 요청 시 각 응답을 다음과 함께 생성합니다:

- 고유한 타임스탬프와 요청 ID
- 엔드포인트에 맞춤화된 콘텐츠 (자격 증명, 구성, 로그인 페이지, API 응답)
- 동적 `X-Powered-By` 스푸핑이 포함된 실제 HTTP 헤더

### 헤더 스푸핑

`headersMiddleware`는 경로 확장자에 따라 동적으로 `X-Powered-By` 헤더를 선택합니다:

- `.php` → `X-Powered-By: PHP/8.1.12`
- `.jsp` → `X-Powered-By: JSP/3.0`
- `.aspx/.ashx/.asmx` → `X-Powered-By: ASP.NET`
- `.do/.action` → `X-Powered-By: Servlet/3.0`
- 기타 경로 → `X-Powered-By` 헤더 없음

### 328개의 엔드포인트

| 유형 | 엔드포인트 예시 |
|---|---|
| 자격 증명 유출 | `.env`, `secrets.json`, `aws/credentials`, `etc/shadow` |
| SSH 키 | `.ssh/id_rsa`, `.ssh/id_ed25519` |
| 데이터베이스 구성 | `config/database`, `wp-config.php`, `docker-compose.yml` |
| 관리자 패널 | `/admin`, `/wp-admin`, `/manage/account/login` |
| API 응답 | `/api/version`, `/api/config`, `.do`, `.ashx` |
| 은행 피싱 | `/lander/sber*`, `/index_sber.php` |
| C2 하트비트 | 6+자 무작위 경로 (`/262LBNFp`, `/Kd67Fq1x`) |
| 주식/암호화폐 | `/stock/mzhishu`, `/kline/1m/1`, `/m/allticker/1` |
| 도박/게임 | `/proxy/games`, `/Ctrls/GetSysCoin`, `/room/getRoomBangFans` |
| 구성 파일 | `config.json`, `config.yml`, `sitemap.xml`, `ads.txt` |
| 랜딩 페이지 | `/about`, `/contact`, `/products`, `/blog` |

### PHP 스푸핑

`instance.phpSpoofer`는 `*.php` 요청을 가로채 로컬 개발 서버로 프록시하여 정적 모의 응답 대신 실제 PHP 처리 결과를 반환합니다.

### 트래픽 기록

트래픽은 JSON-lines 형식으로 `traffic.txt`에 기록할 수 있습니다. 처리되지 않은 알 수 없는 경로는 `GET /newBotsRoute`를 통해 추출할 수 있습니다.

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

## 효과적인 이유

자동 스캐너는 취약한 사이트에 특정 파일이 있기를 기대합니다. 404 대신 실제 콘텐츠로 응답함으로써 허니팟은 다음을 수행합니다:

1. 공격자가 가짜 결과를 분석하는 **시간을 낭비하게 만듭니다**
2. 나중에 분석할 수 있도록 **그들의 지문을 기록합니다**
3. 실제 취약점에서 **주의를 분산시킵니다**
4. 처리되지 않은 경로를 통해 **새로운 공격 패턴을 드러냅니다**

## 결론

전체 소스 코드는 GitHub의 [github.com/anomalyco/express-honeypot-middleware](https://github.com/anomalyco/express-honeypot-middleware) 에서 확인할 수 있습니다. 직접 사용해보고, 이슈를 제기하거나 기여해보세요.
