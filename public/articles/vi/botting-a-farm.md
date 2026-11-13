---
title: Cày một nông trại Microsoft Rewards bằng bot
description: Cách tôi code một bot để cày điểm Microsoft Rewards ở
  quy mô lớn -- và vì sao Microsoft từ đó đã siết chặt phòng thủ.
date: 2026-03-13
tags:
  - automation
  - javascript
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "djafmdLLk00eg4YUKmYfl7XCoj0cfyah41Xou45efLrb3YoMngMPTKM6s9l/OcrZzNuq5/6moNbj697zWEa0+g=="
---

> **Ghi chú (2026) :** Dự án này không còn được duy trì. Microsoft đã tăng cường đáng kể khả năng phát hiện bot, nên những gì từng hoạt động thời đó nay không còn chạy nữa. Mã và cách tiếp cận mô tả bên dưới chỉ được giữ lại cho mục đích lưu trữ và minh họa.

## Giới thiệu

Tôi phát hiện Microsoft Rewards vài năm trước. Đó là thời gian phong tỏa, và hồi đó tôi buộc phải dùng kiểm soát phụ huynh Microsoft Family Safety nên phải đi qua Edge. Chính ở đó tôi phát hiện Rewards.

Hồi đó tôi mới 14 tuổi và chẳng có gì trong danh mục khiến tôi hứng thú. Giờ tôi nghĩ với các kỹ năng đã tích lũy, tôi có thể cày điểm bằng bot, rồi cho đi các mã hoặc thậm chí bán lại rẻ hơn nếu tôi thực sự muốn (nhưng thật lòng, tôi nghĩ mình sẽ không làm). Tôi sẽ kể bạn nghe cách tôi code một con bot cày tài khoản ở quy mô lớn.

---

## Microsoft Rewards là gì?

Nói ngắn gọn : đó là chương trình thưởng người dùng Edge bằng điểm cho các hoạt động như tìm kiếm, quiz nhỏ, trò chơi, và một tiện ích mở rộng (nhưng đó là chuyện khác).

Bạn thấy ở đây các khối "Explore" :
![Explore screenshot](assets/20260313_135010_image.png)

Ví dụ đây là cái họ gọi là "set trong ngày".
![Daily set screenshot](assets/20260313_135038_image.png)

Họ thậm chí làm hệ thống streak, khá điên.
![Streak screenshot](assets/20260313_135210_image.png)

Ngoài ra còn có hệ thống cấp độ và tiến trình khiến thói quen thực sự gây nghiện :
![Level screenshot](assets/20260313_135340_image.png)

Vậy bạn có đủ cách kiếm điểm, và hầu hết là hằng ngày.
Ý tưởng ở đây sẽ là làm một con bot thực hiện các hoạt động thay bạn, để cày điểm ở quy mô lớn và hoàn thành thói quen cày của bạn.

Như bạn thấy bên dưới, hầu hết phần thưởng là thẻ quà tặng, nhưng cũng có các lựa chọn thú vị như game hay gói đăng ký.
![Rewards screenshot](assets/20260313_135646_image.png)

| Phần thưởng | Danh mục | Giá điểm |
| --- | --- | --- |
| **Rakuten TV – 1 phim HD** | Nội dung số | 1 785 |
| **Roblox (thẻ số)** | Game / nội dung số | 6 750 |
| **Thẻ quà tặng Microsoft** | Cửa hàng / dịch vụ | 5 660 |
| **Thẻ quà tặng Xbox** | Cửa hàng / dịch vụ | 5 660 |
| **Thẻ quà tặng Microsoft Solitaire Collection** | Game / nội dung số | 1 500 |
| **Minecraft Minecoins** | Game / nội dung số | 2 500 |
| **Thẻ quà tặng League of Legends** | Game / nội dung số | 2 000 |
| **Mã Overwatch coins (số)** | Game / nội dung số | 2 000 |
| **Sea of Thieves – Gói Ancient Coins** | Game / nội dung số | 1 700 |
| **Zalando – Thẻ quà tặng** | Cửa hàng / dịch vụ | 7 205 |
| **Carrefour – Thẻ quà tặng** | Cửa hàng / dịch vụ | 14 410 |
| **Cultura – Thẻ quà tặng** | Cửa hàng / dịch vụ | 14 410 |
| **Fnac‑Darty – Thẻ quà tặng** | Cửa hàng / dịch vụ | 14 410 |
| **La Redoute – Thẻ quà tặng** | Cửa hàng / dịch vụ | 14 410 |
| **Mango – Thẻ quà tặng** | Cửa hàng / dịch vụ | 36 025 |
| **Wonderbox – Thẻ quà tặng** | Cửa hàng / dịch vụ | 14 410 |
| **Yves Rocher – Thẻ quà tặng** | Cửa hàng / dịch vụ | 14 410 |
| **Amazon.fr – Phiếu quà tặng** | Cửa hàng / dịch vụ | 7 205 |
| **Foot Locker – Thẻ quà tặng** | Cửa hàng / dịch vụ | 14 410 |
| **IKEA FR – Thẻ quà tặng** | Cửa hàng / dịch vụ | 36 025 |
| **IKEA FR – Thẻ quà tặng (thiết kế khác)** | Cửa hàng / dịch vụ | 7 200 |
| **Marionnaud – Thẻ quà tặng** | Cửa hàng / dịch vụ | 14 410 |
| **Asos – Thẻ quà tặng** | Cửa hàng / dịch vụ | 14 410 |
| **Adidas FR – Thẻ quà tặng** | Cửa hàng / dịch vụ | 14 410 |
| **Deliveroo France – Thẻ quà tặng** | Cửa hàng / dịch vụ | 21 615 |
| **H&M France – Thẻ quà tặng** | Cửa hàng / dịch vụ | 14 410 |
| **Global Hotel Card (Expedia Group)** | Cửa hàng / dịch vụ | 7 205 |
| **Uber Eats France – Thẻ quà tặng** | Cửa hàng / dịch vụ | 36 025 |

Giờ bạn đã hiểu lợi ích của chương trình, hãy quan tâm tới botting.

---

## Thử nghiệm đầu tiên

Trước khi xây bot, tôi muốn chắc IP của mình sẽ không bị đánh dấu vì dùng hàng trăm tài khoản từ cùng một địa chỉ. Bạn biết tôi mà, tôi đi qua Tor với proxy xoay. Tôi muốn chạy nó trong GitHub Action thay vì trên VPS.

Vì vậy tôi viết một workflow đơn giản :

```yaml
name: Tor Proxy Curl

on:
  workflow_dispatch:

jobs:
  tor-proxy-curl:
    runs-on: ubuntu-latest

    steps:
      - name: Install Tor and curl
        run: |
          sudo apt-get update
          sudo apt-get install -y tor curl

      - name: Start Tor service
        run: |
          sudo systemctl enable tor
          sudo systemctl start tor
          for i in {1..30}; do
            if ss -lnt | grep -q ':9050'; then
              echo "Tor SOCKS proxy is listening on 127.0.0.1:9050"
              exit 0
            fi
            sleep 1
          done
          echo "Tor SOCKS proxy did not start in time"
          sudo journalctl -u tor --no-pager | tail -n 50
          exit 1

      - name: Set proxy environment variables
        run: |
          echo "ALL_PROXY=socks5h://127.0.0.1:9050" >> "$GITHUB_ENV"
          echo "all_proxy=socks5h://127.0.0.1:9050" >> "$GITHUB_ENV"
          echo "HTTP_PROXY=socks5h://127.0.0.1:9050" >> "$GITHUB_ENV"
          echo "http_proxy=socks5h://127.0.0.1:9050" >> "$GITHUB_ENV"
          echo "HTTPS_PROXY=socks5h://127.0.0.1:9050" >> "$GITHUB_ENV"
          echo "https_proxy=socks5h://127.0.0.1:9050" >> "$GITHUB_ENV"
          echo "NO_PROXY=localhost,127.0.0.1" >> "$GITHUB_ENV"
          echo "no_proxy=localhost,127.0.0.1" >> "$GITHUB_ENV"

      - name: Execute curl via Tor proxy
        run: |
          echo "Using proxy: $ALL_PROXY"
          curl --fail --silent --show-error --proxy "$ALL_PROXY" https://check.torproject.org/api/ip
```

Workflow này chỉ cài Tor, khởi động nó, và gửi một yêu cầu curl qua nó.

Lần chạy đầu cho kết quả này :
![Tor curl first run](assets/20260313_140705_image.png)

Thống kê thời gian là :
!Timings

Lần chạy thứ hai cho kết quả này :
![Tor curl second run](assets/20260313_140928_image.png)

Như bạn thấy, các IP khác nhau, nên ta tránh bị đánh dấu vì lạm dụng từ cùng một IP. Tin tốt : có thể tiếp tục phát triển bot cày.

---

## Thử nghiệm đầu với Selenium

Để tự động hóa giao diện, tôi sẽ dùng **Selenium** : một công cụ điều khiển trình duyệt thật (Chrome/Edge/Firefox) thay cho người dùng. Trong bối cảnh GitHub Action, nghĩa là cài trình duyệt + driver của nó, rồi chạy script đăng nhập Microsoft Rewards và bấm đúng chỗ cần.

### Ví dụ script JavaScript (Node.js + selenium-webdriver)

```js
import { Builder, By, Capabilities, until, WebDriver } from 'selenium-webdriver';

const chromeOptions = {
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    // '--proxy-server=socks5://127.0.0.1:9050'
  ],
  excludeSwitches: ['enable-automation'],
  useAutomationExtension: false,
};

async function applyStealth(driver: WebDriver) {
  // Inject script before any page JS runs to reduce automation fingerprinting.
  await (driver as any).sendDevToolsCommand('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });

      // Some sites check for chrome runtime and plugins
      window.chrome = { runtime: {} };
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
    `,
  });
}

(async () => {
  const caps = Capabilities.chrome().set('goog:chromeOptions', chromeOptions);
  const driver = await new Builder().withCapabilities(caps).build();

  await applyStealth(driver);

  try {
    const targetUrl = 'https://rewards.bing.com/';
    await driver.get(targetUrl);

    console.log('After navigation: url=', await driver.getCurrentUrl());
    console.log('After navigation: title=', await driver.getTitle());

    const signInButton = await driver.wait(
      until.elementLocated(By.css('#rewards-header-sign-in')),
      20000,
      'Timed out waiting for sign-in button (may indicate 400/blocked page)'
    );

    console.log('Page loaded, sign in button found:', await signInButton.getText());
  } finally {
    await driver.quit();
  }
})();
```

Kết quả của script :

```
DevTools listening on ws://127.0.0.1:50274/devtools/browser/37b9ea79-0e5d-4673-9e91-7ffeaf0d37f8
After navigation: url= https://rewards.bing.com/welcome?idru=%2F
After navigation: title= Bienvenue dans Microsoft Rewards!
Page loaded, sign in button found: Se connecter
```

Kết quả này xác nhận ta vẫn đang đăng xuất, nên giờ tôi sẽ xây dựng yêu cầu login và thử kết nối tới tài khoản Microsoft Rewards của mình để tự động hóa các hoạt động.
<!-- ## BÀI NÀY VẪN ĐANG VIẾT DỞ, TÔI SẼ CẬP NHẬT VỚI CÁC BƯỚC ĐĂNG NHẬP VÀ CÀY HOẠT ĐỘNG SỚM! HÃY ĐÓN XEM. -->
