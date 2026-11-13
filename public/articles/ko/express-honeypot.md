---
title: "초현실적인 Express 허니팟을 만들어 봤어요"
description: "즉석에서 만들어내는 응답의 가짜 엔드포인트 328개, 헤더 스푸핑, 봇 트래픽 로깅. 스캐너를 유인하려고 설계된 Express 허니팟 미들웨어 속으로 들어가 봐요."
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
author_sig: "sOz8lRvd86oFUiD4hxPph85bSH9RXFjfPeoXYxPNHZ7NKUYzghtsqD447211dv1YS4j9RU7E7Aq3Ggy/ScAdXA=="
---

## TL;DR

두 가지 변형 중 선택할 수 있는 **328개의 가짜 엔드포인트**를 노출하는 Express 미들웨어를 만들었어요. `default`(차분하지만 믿을 만한 응답)와 `complete`(아주 자세한 응답)이에요. 각 응답은 신선한 타임스탬프와 요청 식별자와 함께 **즉석에서 생성**돼서, 매 응답이 고유해요. 디스크에 목 파일은 전혀 없어요. 미들웨어는 트래픽을 텍스트 파일에 **기록**하고, 봇이 무엇을 찾는지 분석하려고 처리되지 않은 라우트를 `/newBotsRoute`에 노출할 수도 있어요.

**단순한 404 돌려주기가 아니에요.** 스캐너가 시간을 낭비하도록 진짜 서버처럼 보이게 설계된 엔지니어링 작품이에요. 어떻게 동작하는지 보여 드릴게요.

## 문제

보안 봇과 스크레이퍼, 악의적 행위자들은 흔한 라우트를 찾아 웹 서버를 끊임없이 스캔해요.

- `.env`, `wp-config.php`, `admin/`, `phpinfo.php` 등
- `/api/version`, `/api/config` 같은 API 엔드포인트
- 설정 파일: `dump.sql`, `.git/config`, `docker-compose.yml`
- 은행 피싱 페이지: `/lander/sberbank*`, `/index_sber.php`

제 서버에서도 이 한계를 봤어요. 404나 403을 돌려주면 스캐너에게 그 라우트가 없다는 것을 바로 알려주니 다음으로 넘어가요. 이 허니팟에서는 반대를 택했어요. **스캐너에게 모든 것이 존재한다고 믿게 해서**, 진짜 서버는 알려진 라우트 뒤에서 보호받는 동안 가짜 응답에 시간을 허비하게 해요.

## 아키텍처

### 1. 조회 테이블이 아닌 분류기

핵심은 `src/services/mockupGenerator.ts`의 `classify()` 함수로, 엔드포인트 경로를 받아서 응답 생성기를 돌려줘요. 규칙의 캐스케이드로 만들었어요.

1. **정확히 일치**: 가장 흔한 엔드포인트에는 전용 생성기가 있어요
2. **패턴 일치**: `id_rsa`, `wp-admin`, `sitemap.xml` 같은 패턴을 감지하는 경로 정규식
3. **지능형 분류**: `/262LBNFp`(6자 이상 무작위 문자) 같은 경로는 "C2 하트비트"로 분류돼요
4. **포괄 규칙**: API 경로와 `.php`, `.html`, `.js`, `.json`, `.asmx` 파일에는 범용 생성기가 있어요
5. **최종 캐치올**: `genCatchall()`이 메타데이터가 담긴 범용 JSON 응답을 만들어요

이 접근이 좋은 이유는 응답이 **매 요청마다 신선하게** 유지되기 때문이에요. 정적 파일도 없고 캐시도 없고, 각 응답이 진짜 서버에서 온 것처럼 자신만의 타임스탬프를 지녀요.

### 2. 이중 변형 시스템

각 생성기는 두 가지 변형을 지원해요.

```typescript
type Variant = "default" | "complete";
```

- **`default`**: 간결하지만 믿을 만한 응답. `.env` 예시:
  ```
  DB_HOST=localhost
  DB_USER=root
  DB_PASS=s3cur3P@ss
  APP_ENV=development
  APP_DEBUG=true
  ```

- **`complete`**: 아주 자세한 응답. `.env` 예시:
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

`complete` 변형에는 스타일된 CSS가 들어간 완전한 HTML 페이지도 포함돼요. 관리자 페이지, WordPress 로그인 화면, 러시아어 은행 피싱 페이지 등이요. 스캐너를 정말 붙잡아 두고 싶을 때 강력하다고 생각해요.

### 3. 즉석 생성

호출마다 고유한 타임스탬프와 요청 식별자를 만들기 위해 `Date.now()`와 `Date().toISOString()`을 써요. 보강 함수는 이렇습니다.

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

JSON 응답의 경우 미들웨어가 파싱해서 이 필드들로 보강해요. JSON이 아닌 응답은 그대로 돌려줘요.

### 4. 헤더 스푸핑 미들웨어

요청된 파일 확장자에 따라 현실적인 HTTP 헤더를 설정하는 전용 미들웨어를 추가했어요.

```typescript
res.setHeader("Server", "nginx/1.24.0");
res.setHeader("X-Frame-Options", "SAMEORIGIN");
res.setHeader("X-XSS-Protection", "1; mode=block");
res.setHeader("X-Content-Type-Options", "nosniff");
res.setHeader("X-Robots-Tag", "noindex, nofollow");
res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

// 파일 확장자 기반의 현실적인 X-Powered-By
if (path.endsWith(".php")) res.setHeader("X-Powered-By", "PHP/8.1.12");
else if (path.endsWith(".jsp")) res.setHeader("X-Powered-By", "JSP/3.0");
else if (path.endsWith(".aspx") || path.endsWith(".ashx") || path.endsWith(".asmx"))
  res.setHeader("X-Powered-By", "ASP.NET");
else if (path.endsWith(".do") || path.endsWith(".action"))
  res.setHeader("X-Powered-By", "Servlet/3.0");
```

이렇게 하면 응답이 훨씬 믿을 만해져요. `X-Powered-By: PHP/8.1.12`와 `Server: nginx/1.24.0`이 붙은 `.php` 엔드포인트는 정확히 진짜 WordPress 서버처럼 보여요. 가짜 서버임을 드러내는 것이 흔히 헤더이기 때문에 이 세부 사항을 고수해요.

### 5. PHP 스푸퍼

`phpSpoofer`는 여전히 제가 가장 좋아하는 컴포넌트예요. `.php` 파일 요청이 들어오고 호스트가 localhost이면, 미들웨어가 요청을 여러분의 로컬 PHP 서버로 **프록시**해서 진짜 PHP 페이지를 처리하고 돌려줘요. 호스트가 원격이면 SSRF 시도를 막으려고 404를 돌려줘요.

```typescript
const phpSpoofer = async (req, res, next) => {
  if (!req.path?.match(/\.php$/)) return next();
  const host = req.headers?.host;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]")) {
    const baseUrl = req.originalUrl.replace(/\.php.*$/, "");
    const response = await fetch(`http://${host}${baseUrl}`);
    // 진짜 PHP 응답을 돌려줘요
  } else {
    res.status(404).send("404 Not Found");
  }
};
```

이렇게 하면 WordPress를 로컬로 돌릴 때 허니팟이 봇에게 **진짜** WordPress 페이지를 서빙해요. 제 경험상 최대의 현실감이에요.

### 6. 트래픽 기록과 분석

두 책임을 나눴어요. `TrafficService`는 각 요청을 JSON-lines 파일에 기록해요. `UnhandledRoutesService`는 이 로그를 분석해서 봇이 요청하는데 허니팟에서 아직 커버하지 못하는 경로를 찾아내요.

```typescript
app.get("/newBotsRoute", async (_req, res) => {
  const routes = await unhandledRoutesService.getUnhandledRoutes(
    additionalEndpoints, knownPathOptions
  );
  res.setHeader("Content-Type", "text/plain");
  res.send(routes.join("\n"));
});
```

이 피드백 루프가 정말 좋아요. 허니팟을 오래 돌릴수록 봇이 무엇을 찾는지 더 배우고, 그 경로들을 알려진 엔드포인트에 추가할 수 있어요.

### 7. 알려진 엔드포인트와 제외

미들웨어는 `knownPaths`, `knownPatterns`, `knownApiPaths`, `knownApiPatterns` 목록을 받아요. 여기에 해당하는 라우트는 미들웨어를 통과해서 진짜 애플리케이션으로 가요. 이 필터가 필수라고 생각해요. 진짜 엔드포인트는 손대지 않고, 허니팟이 절대 가로채지 않아요.

```typescript
const matches = (p) => p === endpoint || p.startsWith(endpoint + "/");
```

## 328개 엔드포인트 자세히 보기

분류되는 방식은 이렇습니다 (분류기에서 발췌).

| 카테고리 | 엔드포인트 예시 |
|---|---|
| 자격 증명 유출 | `.env`, `secrets.json`, `aws/credentials`, `etc/shadow` |
| SSH 키 | `.ssh/id_rsa`, `.ssh/id_ed25519` |
| 데이터베이스 설정 | `config/database`, `wp-config.php`, `docker-compose.yml` |
| 관리자 패널 | `/admin`, `/wp-admin`, `/manage/account/login` |
| API 응답 | `/api/version`, `/api/config`, `.do`, `.ashx` |
| 은행 피싱 | `/lander/sber*`, `/index_sber.php` |
| C2 하트비트 | 6자 이상 무작위 경로 (`/262LBNFp`) |
| 주식/거래소 | `/stock/mzhishu`, `/kline/1m/1`, `/m/allticker/1` |
| 게임/카지노 | `/proxy/games`, `/Ctrls/GetSysCoin`, `/room/getRoomBangFans` |
| 설정 파일 | `config.json`, `config.yml`, `sitemap.xml`, `ads.txt` |
| 랜딩 페이지 | `/about`, `/contact`, `/products`, `/blog` |

## 특수 코드와 엔드포인트

특별한 경우를 위한 전문화된 생성기를 추가했어요.

- **`genLanding()`**: СберБанк, Тинькофф, Газпромбанк용 러시아어 은행 피싱 페이지
- **`genC2Heartbeat()`**: `agent_id`, `group`, `version`이 담긴 현실적인 C2 하트비트 응답
- **`genScannerPath()`**: 특정 스캐너용 함정 (nmap NICE 포트, Hazelcast, CGI)
- **`genChineseApi()`**: `msg: "成功"`(성공)이 담긴 중국어 API 응답
- **`genMerchant()`**: `balance`, `fee_rate`, `tier`가 담긴 상인 프로필

## 사용 방법

### 설치

```bash
npm install express-middleware-honeypot
```

### 자동 등록과 함께 기본 사용

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

### app.use()와 함께 (단일 포괄 미들웨어)

```javascript
const { createHoneypot } = require("express-middleware-honeypot");
const app = express();

// 진짜 라우트를 먼저
app.get("/", (req, res) => res.send("Home"));

// 그 다음 포괄 허니팟
const instance = createHoneypot({ /* options */ });
app.use(instance.headersMiddleware);
app.use(instance.middleware);
```

### 완전한 응답과 기본 응답

```javascript
// 완전한 HTML 페이지가 담긴 자세한 응답
const instance = createHoneypot({ isCompleteResponses: true });
```

### 트래픽 기록

```javascript
const instance = createHoneypot({ logTraffic: true });
// 봇이 무엇을 요청하는지 traffic.txt 파일에서 확인하세요
```

## 결론

이 Express 허니팟 미들웨어는 단순한 미끼를 훨씬 넘어서요. **328개 엔드포인트**와 **즉석 생성**, **동적 헤더 스푸핑**, **트래픽 기록**, 심지어 진짜 WordPress 응답을 위한 **PHP 프록시**까지 갖춰서, 최대한 현실적으로 느껴지도록 설계했어요.

스캐너는 가짜 관리자 페이지와 믿을 만한 `.env` 파일, 은행 피싱 페이지에 시간을 허비하는 동안 진짜 애플리케이션은 보호받아요. 이중 변형 시스템과 지능형 분류가 특히 마음에 들어요. 각 응답이 신선하고 요청된 경로에 맞게 유지되거든요.

소스 코드는 GitHub에 있어요. [https://github.com/fox3000foxy/express-honeypot-middleware](https://github.com/fox3000foxy/express-honeypot-middleware)
