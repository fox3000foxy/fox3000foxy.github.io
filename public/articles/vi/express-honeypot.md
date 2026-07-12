---
itle: "Tôi đã xây dựng một honeypot Express siêu thực"
description: "328 điểm cuối giả với phản hồi được tạo ngay lập tức, giả mạo tiêu đề, ghi lại lưu lượng bot -- đi sâu vào mã của một middleware honeypot Express được thiết kế để đánh lừa các trình quét."
date: "2026-06-10"
aiGenerated: trueauthors:
  - fox3000foxy
tags:
  - express
  - nodejs
  - security
  - honeypot
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "7f4+TH7wT9OJy7SiMmPvjPqUAt0kojxqktCIHitxhkb7/Vddm5MOr9QzPE1AC994EyiWyfrvjvl2dqlwLBdr5Q=="
---

## Ý tưởng

Bot và các trình quét tự động liên tục quét các ứng dụng web để tìm lỗ hổng. Chúng tìm kiếm các tệp `.env`, bảng quản trị, bản sao lưu cơ sở dữ liệu, thông tin đăng nhập SSH -- bất cứ thứ gì có thể bị khai thác.

Thay vì chỉ trả về 404, tôi muốn tạo ra thứ gì đó thú vị hơn: một **honeypot Express** phản hồi bằng nội dung đáng tin cậy, khiến những kẻ tấn công tin rằng chúng đã tìm thấy một mục tiêu dễ bị tổn thương.

## Tính năng

Middleware này phơi bày **328 điểm cuối** được chia thành hai biến thể (mặc định và đầy đủ). Mỗi yêu cầu nhận được một phản hồi duy nhất được tạo ngay lập tức với dấu thời gian và ID yêu cầu mới, mô phỏng một máy chủ thực.

## Bắt đầu

```bash
npm install express-middleware-honeypot
```

Sử dụng cơ bản với tính năng tự động đăng ký:

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
    console.log("Máy chủ đang chạy trên cổng 3000");
});
```

## Cách hoạt động

### Tạo ngay lập tức

Không có tệp giả trên đĩa. Dịch vụ `mockupGenerator.ts` tạo mỗi phản hồi tại thời điểm yêu cầu với:

- Dấu thời gian và ID yêu cầu duy nhất
- Nội dung phù hợp với điểm cuối (thông tin đăng nhập, cấu hình, trang đăng nhập, phản hồi API)
- Tiêu đề HTTP thực tế với giả mạo `X-Powered-By` động

### Giả mạo tiêu đề

`headersMiddleware` chọn động tiêu đề `X-Powered-By` dựa trên phần mở rộng đường dẫn:

- `.php` → `X-Powered-By: PHP/8.1.12`
- `.jsp` → `X-Powered-By: JSP/3.0`
- `.aspx/.ashx/.asmx` → `X-Powered-By: ASP.NET`
- `.do/.action` → `X-Powered-By: Servlet/3.0`
- Đường dẫn khác → không có tiêu đề `X-Powered-By`

### 328 điểm cuối

| Loại | Ví dụ điểm cuối |
|---|---|
| Rò rỉ thông tin đăng nhập | `.env`, `secrets.json`, `aws/credentials`, `etc/shadow` |
| Khóa SSH | `.ssh/id_rsa`, `.ssh/id_ed25519` |
| Cấu hình cơ sở dữ liệu | `config/database`, `wp-config.php`, `docker-compose.yml` |
| Bảng quản trị | `/admin`, `/wp-admin`, `/manage/account/login` |
| Phản hồi API | `/api/version`, `/api/config`, `.do`, `.ashx` |
| Lừa đảo ngân hàng | `/lander/sber*`, `/index_sber.php` |
| Nhịp tim C2 | Đường dẫn ngẫu nhiên 6+ ký tự (`/262LBNFp`, `/Kd67Fq1x`) |
| Chứng khoán/Tiền điện tử | `/stock/mzhishu`, `/kline/1m/1`, `/m/allticker/1` |
| Cờ bạc/Trò chơi | `/proxy/games`, `/Ctrls/GetSysCoin`, `/room/getRoomBangFans` |
| Tệp cấu hình | `config.json`, `config.yml`, `sitemap.xml`, `ads.txt` |
| Trang đích | `/about`, `/contact`, `/products`, `/blog` |

### Giả mạo PHP

`instance.phpSpoofer` chặn các yêu cầu `*.php` và ủy quyền chúng đến máy chủ phát triển cục bộ của bạn, trả về kết quả PHP thực thay vì mô phỏng tĩnh.

### Ghi lại lưu lượng

Lưu lượng có thể được ghi ở định dạng JSON-lines vào `traffic.txt`. Các tuyến đường không xác định chưa được xử lý có thể được trích xuất qua `GET /newBotsRoute`.

## API HoneypotInstance

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

## Tại sao hiệu quả

Các trình quét tự động mong đợi các trang web dễ bị tổn thương có một số tệp nhất định. Bằng cách phản hồi bằng nội dung thực tế thay vì 404, honeypot có thể:

1. **Làm lãng phí thời gian** của kẻ tấn công khi phân tích kết quả giả
2. **Ghi lại dấu vết của chúng** để phân tích sau
3. **Đánh lạc hướng sự chú ý** khỏi các lỗ hổng thực sự
4. **Tiết lộ các mẫu tấn công mới** thông qua các tuyến đường chưa được xử lý

## Kết luận

Mã nguồn hoàn chỉnh có sẵn trên GitHub tại [github.com/anomalyco/express-honeypot-middleware](https://github.com/anomalyco/express-honeypot-middleware). Hãy dùng thử, mở issue hoặc đóng góp nhé.
