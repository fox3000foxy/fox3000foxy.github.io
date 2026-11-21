---
title: "Tôi đã xây một honeypot Express siêu thực"
description: "328 endpoint giả với phản hồi sinh tức thì, giả mạo header, ghi log lưu lượng bot -- lặn sâu vào một middleware honeypot Express thiết kế để đánh lừa scanner."
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
author_sig: "yRnrE1QYzmoUV4YNuwrG7fib9lYdEwCGs0jH7FH77c15HsOOAKUM5uZs5+xeKvhyUACCy/y26WyIWbALQDyhgw=="
---

## TL;DR

Tôi đã tạo một middleware Express phơi bày **328 endpoint giả** tùy chọn giữa hai biến thể : `default` (phản hồi gọn nhưng đáng tin) và `complete` (phản hồi rất chi tiết). Mỗi phản hồi được **sinh tức thì** với timestamp và định danh yêu cầu mới, khiến mỗi phản hồi là duy nhất. Không có tệp mock nào trên đĩa. Middleware còn có thể **ghi log lưu lượng** vào tệp văn bản và phơi bày các route chưa xử lý trên `/newBotsRoute` để phân tích bot đang tìm gì.

**Đây không chỉ là trả về 404 đơn thuần.** Tôi thiết kế mẩu kỹ thuật này để giống máy chủ thật, để scanner phí thời gian vào đó. Tôi sẽ cho bạn thấy nó hoạt động thế nào.

## Vấn đề

Bot bảo mật, scraper và tác nhân độc hại liên tục quét máy chủ web để tìm các route phổ biến :

- `.env`, `wp-config.php`, `admin/`, `phpinfo.php`, v.v.
- endpoint API như `/api/version`, `/api/config`
- tệp cấu hình : `dump.sql`, `.git/config`, `docker-compose.yml`
- trang phishing ngân hàng : `/lander/sberbank*`, `/index_sber.php`

Tôi đã thấy giới hạn này trên chính máy chủ của mình : trả về 404 hay 403 báo ngay cho scanner rằng route không tồn tại, nên nó chuyển sang route tiếp theo. Tôi chọn ngược lại với honeypot này : **khiến scanner tin rằng mọi thứ tồn tại**, để nó mất thời gian vào phản hồi giả trong khi máy chủ thật của bạn vẫn được bảo vệ sau các route đã biết của bạn.

## Kiến trúc

### 1. Một bộ phân loại, không phải bảng tra

Mảnh trung tâm là hàm `classify()` trong `src/services/mockupGenerator.ts` nhận đường dẫn endpoint và trả về bộ sinh phản hồi. Tôi xây nó như thác quy tắc :

1. **Khớp chính xác** : các endpoint phổ biến nhất có bộ sinh riêng
2. **Khớp theo mẫu** : regex trên đường dẫn để phát hiện mẫu như `id_rsa`, `wp-admin`, `sitemap.xml`
3. **Phân loại thông minh** : đường dẫn như `/262LBNFp` (6+ ký tự ngẫu nhiên) được phân loại là "nhịp tim C2"
4. **Quy tắc vét** : đường dẫn API, tệp `.php`, `.html`, `.js`, `.json` và `.asmx` có bộ sinh chung
5. **Catchall cuối** : `genCatchall()` sinh phản hồi JSON chung kèm metadata

Tôi thích cách tiếp cận này vì phản hồi vẫn **tươi mỗi yêu cầu** : không tệp tĩnh, không cache, mỗi phản hồi mang timestamp riêng như thể tới từ máy chủ thật.

### 2. Hệ thống hai biến thể

Mỗi bộ sinh hỗ trợ hai biến thể :

```typescript
type Variant = "default" | "complete";
```

- **`default`** : phản hồi súc tích nhưng đáng tin. Ví dụ cho `.env` :
  ```
  DB_HOST=localhost
  DB_USER=root
  DB_PASS=s3cur3P@ss
  APP_ENV=development
  APP_DEBUG=true
  ```

- **`complete`** : phản hồi rất chi tiết. Ví dụ cho `.env` :
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

Biến thể `complete` còn gồm các trang HTML đầy đủ với CSS tạo kiểu : trang quản trị, màn hình đăng nhập WordPress, trang phishing ngân hàng tiếng Nga, v.v. Tôi thấy nó đáng gờm khi bạn thực sự muốn giữ chân scanner.

### 3. Sinh tức thì

Tôi dùng `Date.now()` và `Date().toISOString()` để tạo timestamp và định danh yêu cầu duy nhất mỗi lần gọi. Đây là hàm làm giàu :

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

Với phản hồi JSON, middleware cố parse và làm giàu bằng các trường này. Phản hồi không phải JSON được trả nguyên.

### 4. Middleware giả mạo header

Tôi thêm một middleware riêng đặt các header HTTP thực tế tùy theo phần mở rộng tệp được yêu cầu :

```typescript
res.setHeader("Server", "nginx/1.24.0");
res.setHeader("X-Frame-Options", "SAMEORIGIN");
res.setHeader("X-XSS-Protection", "1; mode=block");
res.setHeader("X-Content-Type-Options", "nosniff");
res.setHeader("X-Robots-Tag", "noindex, nofollow");
res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

// X-Powered-By thực tế dựa trên phần mở rộng tệp
if (path.endsWith(".php")) res.setHeader("X-Powered-By", "PHP/8.1.12");
else if (path.endsWith(".jsp")) res.setHeader("X-Powered-By", "JSP/3.0");
else if (path.endsWith(".aspx") || path.endsWith(".ashx") || path.endsWith(".asmx"))
  res.setHeader("X-Powered-By", "ASP.NET");
else if (path.endsWith(".do") || path.endsWith(".action"))
  res.setHeader("X-Powered-By", "Servlet/3.0");
```

Việc này khiến phản hồi đáng tin hơn nhiều : một endpoint `.php` với `X-Powered-By: PHP/8.1.12` và `Server: nginx/1.24.0` trông đúng như máy chủ WordPress thật. Tôi coi trọng chi tiết này vì thường chính header tố cáo một máy chủ giả.

### 5. PHP Spoofer

`phpSpoofer` vẫn là thành phần tôi thích nhất. Nếu yêu cầu tới cho tệp `.php` và host là localhost, middleware **proxy** yêu cầu tới máy chủ PHP cục bộ của bạn, nơi xử lý và trả về trang PHP thật. Nếu host ở xa, nó trả 404 để chặn mọi mưu toan SSRF.

```typescript
const phpSpoofer = async (req, res, next) => {
  if (!req.path?.match(/\.php$/)) return next();
  const host = req.headers?.host;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]")) {
    const baseUrl = req.originalUrl.replace(/\.php.*$/, "");
    const response = await fetch(`http://${host}${baseUrl}`);
    // trả về phản hồi PHP thật
  } else {
    res.status(404).send("404 Not Found");
  }
};
```

Nhờ vậy, khi bạn chạy WordPress cục bộ, honeypot phục vụ cho bot các trang WordPress **thật** : mức thực tế tối đa theo kinh nghiệm của tôi.

### 6. Ghi log và phân tích lưu lượng

Tôi tách hai trách nhiệm : `TrafficService` ghi mỗi yêu cầu vào tệp JSON-lines. `UnhandledRoutesService` sau đó phân tích các log này để nhận diện đường dẫn bot yêu cầu mà honeypot chưa phủ.

```typescript
app.get("/newBotsRoute", async (_req, res) => {
  const routes = await unhandledRoutesService.getUnhandledRoutes(
    additionalEndpoints, knownPathOptions
  );
  res.setHeader("Content-Type", "text/plain");
  res.send(routes.join("\n"));
});
```

Tôi rất thích vòng phản hồi này : càng để honeypot chạy lâu, bạn càng học được bot đang tìm gì, và có thể thêm các đường dẫn đó vào endpoint đã biết của bạn.

### 7. Endpoint đã biết và loại trừ

Middleware chấp nhận danh sách `knownPaths`, `knownPatterns`, `knownApiPaths` và `knownApiPatterns`. Mọi route khớp với chúng đi xuyên middleware tới ứng dụng thật của bạn. Tôi thấy bộ lọc này không thể thiếu : các endpoint thật của bạn còn nguyên, honeypot không bao giờ chặn chúng.

```typescript
const matches = (p) => p === endpoint || p.startsWith(endpoint + "/");
```

## 328 endpoint chi tiết

Đây là cách chúng được phân loại (trích từ bộ phân loại) :

| Danh mục | Ví dụ endpoint |
|---|---|
| Rò rỉ credential | `.env`, `secrets.json`, `aws/credentials`, `etc/shadow` |
| Khóa SSH | `.ssh/id_rsa`, `.ssh/id_ed25519` |
| Cấu hình cơ sở dữ liệu | `config/database`, `wp-config.php`, `docker-compose.yml` |
| Bảng quản trị | `/admin`, `/wp-admin`, `/manage/account/login` |
| Phản hồi API | `/api/version`, `/api/config`, `.do`, `.ashx` |
| Phishing ngân hàng | `/lander/sber*`, `/index_sber.php` |
| Nhịp tim C2 | Đường dẫn ngẫu nhiên 6+ ký tự (`/262LBNFp`) |
| Hành động/Chứng khoán | `/stock/mzhishu`, `/kline/1m/1`, `/m/allticker/1` |
| Game/Casino | `/proxy/games`, `/Ctrls/GetSysCoin`, `/room/getRoomBangFans` |
| Tệp cấu hình | `config.json`, `config.yml`, `sitemap.xml`, `ads.txt` |
| Trang đích | `/about`, `/contact`, `/products`, `/blog` |

## Mã và endpoint đặc biệt

Tôi thêm các bộ sinh chuyên biệt cho trường hợp riêng :

- **`genLanding()`** : trang phishing ngân hàng tiếng Nga cho СберБанк, Тинькофф, Газпромбанк
- **`genC2Heartbeat()`** : phản hồi nhịp tim C2 thực tế với `agent_id`, `group`, `version`
- **`genScannerPath()`** : bẫy cho scanner cụ thể (cổng nmap NICE, Hazelcast, CGI)
- **`genChineseApi()`** : phản hồi API Trung Quốc với `msg: "成功"` (thành công)
- **`genMerchant()`** : hồ sơ thương nhân với `balance`, `fee_rate`, `tier`

## Cách dùng

### Cài đặt

```bash
npm install express-middleware-honeypot
```

### Dùng cơ bản với tự đăng ký

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

### Với app.use() (middleware vét duy nhất)

```javascript
const { createHoneypot } = require("express-middleware-honeypot");
const app = express();

// Các route thật của bạn trước
app.get("/", (req, res) => res.send("Home"));

// Rồi tới honeypot vét
const instance = createHoneypot({ /* options */ });
app.use(instance.headersMiddleware);
app.use(instance.middleware);
```

### Phản hồi đầy đủ so với mặc định

```javascript
// Phản hồi chi tiết với trang HTML đầy đủ
const instance = createHoneypot({ isCompleteResponses: true });
```

### Ghi log lưu lượng

```javascript
const instance = createHoneypot({ logTraffic: true });
// Xem tệp traffic.txt để thấy bot yêu cầu gì
```

## Kết luận

Middleware honeypot Express này đi xa hơn nhiều so với mồi nhử đơn thuần. Với **328 endpoint**, **sinh tức thì**, **giả mạo header động**, **ghi log lưu lượng** và thậm chí **proxy PHP** cho phản hồi WordPress thật, tôi thiết kế nó để thực tế nhất có thể.

Scanner mất thời gian vào trang quản trị giả, tệp `.env` đáng tin và trang phishing ngân hàng trong khi ứng dụng thật của bạn vẫn được bảo vệ. Tôi đặc biệt thích hệ thống hai biến thể và phân loại thông minh : mỗi phản hồi vẫn tươi mới và hợp với đường dẫn được yêu cầu.

Mã nguồn có trên GitHub : [https://github.com/fox3000foxy/express-honeypot-middleware](https://github.com/fox3000foxy/express-honeypot-middleware)
