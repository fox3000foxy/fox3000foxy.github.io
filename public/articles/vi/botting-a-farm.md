---
title: Bot một trang trại Microsoft Rewards
description: Cách tôi đã viết bot để farm điểm Microsoft Rewards trên quy mô lớn -- và tại sao Microsoft từ đó đã tăng cường phòng thủ.
date: 2026-03-13
tags:
  - automation
  - javascript
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "lLcT03bVHkz6DPXaRpaqF/yKTLc/zueEEmTkUUthMhSbxAoAbr0e+VqGvkhww5jLMZ+2xrqYvUib2V4hcwvorA=="
---

> **Ghi chú (2026):** Dự án này không còn được bảo trì nữa. Microsoft đã tăng cường đáng kể khả năng phát hiện chống bot -- những gì từng hoạt động trước đây giờ không còn hiệu quả. Mã và cách tiếp cận được mô tả dưới đây được giữ lại chỉ với mục đích lưu trữ và minh họa.

## Giới thiệu

Tôi phát hiện ra Microsoft Rewards vài năm trước. Đó là trong thời gian phong tỏa, nhưng điều đó không thay đổi sự thật là tôi bị buộc phải sử dụng tính năng kiểm soát của phụ huynh Microsoft Family Safety và do đó phải dùng Edge. Đó là lúc tôi biết đến Rewards.

Lúc đó tôi mới chỉ 14 tuổi và chẳng có gì trong danh mục khiến tôi hứng thú. Bây giờ tôi nghĩ, với những kỹ năng đã học được, tôi có thể farm điểm bằng bot, rồi tặng mã hoặc thậm chí bán lại với giá rẻ hơn nếu tôi thực sự muốn (nhưng thành thật mà nói, tôi nghĩ mình sẽ không làm vậy). Dù sao thì, tôi sẽ kể cho bạn nghe cách tôi đã viết một bot farm tài khoản trên quy mô lớn.

---

## Microsoft Rewards là gì?

Nói ngắn gọn: đó là chương trình thưởng cho người dùng Edge bằng điểm cho các hoạt động như tìm kiếm, câu đố nhỏ, trò chơi và tiện ích mở rộng (nhưng đó là chuyện khác).

Bạn thấy các mục "Explore" ở đây:  
![Explore screenshot](assets/20260313_135010_image.png)

Ví dụ đây là cái họ gọi là "set trong ngày".  
![Daily set screenshot](assets/20260313_135038_image.png)

Họ còn có cả hệ thống streak, khá là điên rồ.  
![Streak screenshot](assets/20260313_135210_image.png)

Cũng có hệ thống cấp độ và nó thực sự rất vui:  
![Level screenshot](assets/20260313_135340_image.png)

Vậy là có rất nhiều cách để kiếm điểm, và hầu hết đều là hàng ngày.  
Ý tưởng ở đây là tạo một bot làm các hoạt động thay bạn, để farm điểm trên quy mô lớn và hoàn thành thói quen farm của bạn.

Như bạn thấy bên dưới, hầu hết phần thưởng là thẻ quà tặng, nhưng cũng có những thứ thú vị như trò chơi hoặc gói đăng ký.  
![Rewards screenshot](assets/20260313_135646_image.png)

| Phần thưởng | Danh mục | Chi phí (điểm) |
| --- | --- | --- |
| **Rakuten TV – 1 phim HD** | Nội dung số | 1 785 |
| **Roblox (thẻ kỹ thuật số)** | Trò chơi / Nội dung số | 6 750 |
| **Thẻ quà tặng Microsoft** | Cửa hàng / Dịch vụ | 5 660 |
| **Thẻ quà tặng Xbox** | Cửa hàng / Dịch vụ | 5 660 |
| **Thẻ quà tặng Microsoft Solitaire Collection** | Trò chơi / Nội dung số | 1 500 |
| **Minecraft Minecoins** | Trò chơi / Nội dung số | 2 500 |
| **Thẻ quà tặng League of Legends** | Trò chơi / Nội dung số | 2 000 |
| **Mã Overwatch coins (kỹ thuật số)** | Trò chơi / Nội dung số | 2 000 |
| **Sea of Thieves – Gói Cổ vật** | Trò chơi / Nội dung số | 1 700 |
| **Zalando – Thẻ quà tặng** | Cửa hàng / Dịch vụ | 7 205 |
| **Carrefour – Thẻ quà tặng** | Cửa hàng / Dịch vụ | 14 410 |
| **Cultura – Thẻ quà tặng** | Cửa hàng / Dịch vụ | 14 410 |
| **Fnac‑Darty – Thẻ quà tặng** | Cửa hàng / Dịch vụ | 14 410 |
| **La Redoute – Thẻ quà tặng** | Cửa hàng / Dịch vụ | 14 410 |
| **Mango – Thẻ quà tặng** | Cửa hàng / Dịch vụ | 36 025 |
| **Wonderbox – Thẻ quà tặng** | Cửa hàng / Dịch vụ | 14 410 |
| **Yves Rocher – Thẻ quà tặng** | Cửa hàng / Dịch vụ | 14 410 |
| **Amazon.fr – Séc quà tặng** | Cửa hàng / Dịch vụ | 7 205 |
| **Foot Locker – Thẻ quà tặng** | Cửa hàng / Dịch vụ | 14 410 |
| **IKEA FR – Thẻ quà tặng** | Cửa hàng / Dịch vụ | 36 025 |
| **IKEA FR – Thẻ quà tặng (kiểu khác)** | Cửa hàng / Dịch vụ | 7 200 |
| **Marionnaud – Thẻ quà tặng** | Cửa hàng / Dịch vụ | 14 410 |
| **Asos – Thẻ quà tặng** | Cửa hàng / Dịch vụ | 14 410 |
| **Adidas FR – Thẻ quà tặng** | Cửa hàng / Dịch vụ | 14 410 |
| **Deliveroo France – Thẻ quà tặng** | Cửa hàng / Dịch vụ | 21 615 |
| **H&M France – Thẻ quà tặng** | Cửa hàng / Dịch vụ | 14 410 |
| **Global Hotel Card (Expedia Group)** | Cửa hàng / Dịch vụ | 7 205 |
| **Uber Eats France – Thẻ quà tặng** | Cửa hàng / Dịch vụ | 36 025 |

Giờ bạn đã hiểu chương trình này hấp dẫn thế nào, hãy cùng tìm hiểu về botting.

---

## Thử nghiệm đầu tiên

Trước khi xây dựng bot, tôi muốn chắc chắn rằng IP của mình sẽ không bị đánh dấu vì đã sử dụng hàng trăm tài khoản từ cùng một địa chỉ. Bạn biết tôi mà, tôi sẽ dùng Tor với proxy xoay vòng. Và tôi không muốn host bot trên VPS -- tôi muốn nó chạy trong một GitHub Action.

Vậy là tôi đã viết một workflow đơn giản:

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

Workflow này chỉ cài Tor, khởi động nó và thực hiện một yêu cầu curl qua nó.

Lần chạy đầu tiên cho kết quả này:  
![Tor curl first run](assets/20260313_140705_image.png)

Thống kê thời gian:  
!Timings

Lần chạy thứ hai cho kết quả này:  
![Tor curl second run](assets/20260313_140928_image.png)

Như bạn thấy, các IP đều khác nhau, nên chúng ta sẽ không bị gắn cờ vì lạm dụng từ cùng một IP. Tin tốt -- chúng ta có thể tiếp tục phát triển bot farm.

---

## Thử nghiệm đầu tiên với Selenium

Để tự động hóa giao diện, tôi sẽ sử dụng **Selenium**: một công cụ điều khiển trình duyệt thật (Chrome/Edge/Firefox) thay cho người dùng. Trong bối cảnh GitHub Action, điều này có nghĩa là cài đặt trình duyệt + driver của nó, sau đó chạy một script đăng nhập vào Microsoft Rewards và nhấp vào những chỗ cần thiết.

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

Kết quả script:

```
DevTools listening on ws://127.0.0.1:50274/devtools/browser/37b9ea79-0e5d-4673-9e91-7ffeaf0d37f8
After navigation: url= https://rewards.bing.com/welcome?idru=%2F
After navigation: title= Bienvenue dans Microsoft Rewards!
Page loaded, sign in button found: Se connecter
```

Ok, điều đó có nghĩa là chúng ta chưa đăng nhập, vậy bây giờ chúng ta sẽ xây dựng yêu cầu đăng nhập và xem liệu có thể đăng nhập vào tài khoản Microsoft Rewards để thực hiện các hoạt động hay không.
<!-- ## BÀI VIẾT NÀY VẪN ĐANG ĐƯỢC VIẾT, TÔI SẼ CẬP NHẬT CÁC BƯỚC ĐĂNG NHẬP VÀ BOT CÁC HOẠT ĐỘNG SỚM! HÃY CHỜ ĐÓN. -->
