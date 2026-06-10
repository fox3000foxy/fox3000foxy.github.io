---
title: บอทฟาร์ม Microsoft Rewards
description: วิธีที่ผมเขียนบอทเพื่อฟาร์มคะแนน Microsoft Rewards แบบ規模ใหญ่ -- และเหตุใด Microsoft จึงเสริมการป้องกันตั้งแต่ตอนนั้น
date: 2026-03-13
tags:
  - automation
  - javascript
  - reverse-engineering
authors:
  - fox3000foxy
---

> **หมายเหตุ (2026):** โปรเจกต์นี้ไม่ได้ดูแลอีกต่อไปแล้ว Microsoft ได้เสริมการตรวจจับแอนตี้บอทอย่างมาก -- สิ่งที่เคยใช้ได้ในตอนนั้นไม่สามารถใช้ได้อีกแล้วในวันนี้ โค้ดและแนวทางที่อธิบายไว้ด้านล่างนี้เก็บไว้เพื่อวัตถุประสงค์ในการเก็บถาวรและสาธิตเท่านั้น

## บทนำ

ผมค้นพบ Microsoft Rewards เมื่อไม่กี่ปีที่แล้ว ตอนนั้นเป็นช่วงล็อกดาวน์ แต่มันก็ไม่ได้เปลี่ยนความจริงที่ว่าผมจำเป็นต้องใช้ระบบควบคุมโดยผู้ปกครอง Microsoft Family Safety และจึงต้องใช้ Edge นั่นคือตอนที่ผมค้นพบ Rewards

ตอนนั้นผมอายุแค่ 14 ปี และไม่มีอะไรในแคตตาล็อกที่สนใจ ตอนนี้ผมคิดว่าด้วยทักษะที่ผมได้มา ผมสามารถฟาร์มคะแนนด้วยบอท แล้วนำโค้ดไปให้หรือ甚至ขายต่อในราคาถูกกว่าถ้าผมอยากจริง ๆ (แต่เอาจริง ๆ ผมคิดว่าคงไม่ทำ) ยังไงก็ตาม ผมจะเล่าให้ฟังว่าผมเขียนบอทที่ฟาร์มบัญชีแบบ規模ใหญ่ได้อย่างไร

---

## Microsoft Rewards คืออะไร ?

พูดสั้น ๆ คือ: มันเป็นโปรแกรมที่ให้รางวัลผู้ใช้ Edge ด้วยคะแนนสำหรับกิจกรรมต่าง ๆ เช่น การค้นหา แบบทดสอบเล็ก ๆ เกม และส่วนขยาย (แต่นั่นเป็นอีกเรื่องหนึ่ง)

คุณเห็นพวก "Explore" ตรงนี้:  
![ภาพหน้าจอ Explore](assets/20260313_135010_image.png)

ตัวอย่างเช่นนี่คือสิ่งที่เขาเรียกว่า "ชุดประจำวัน"  
![ภาพหน้าจอชุดประจำวัน](assets/20260313_135038_image.png)

他甚至ทำระบบสตรีคด้วย นี่มันบ้ามาก  
![ภาพหน้าจอสตรีค](assets/20260313_135210_image.png)

ยังมีระบบเลเวลอีกด้วย และมันสนุกสุด ๆ:  
![ภาพหน้าจอเลเวล](assets/20260313_135340_image.png)

ดังนั้นคุณมีหลายวิธีในการรับคะแนน และส่วนใหญ่เป็นกิจกรรมประจำวัน
แนวคิดคือการทำบอทที่ทำกิจกรรมเหล่านี้แทนคุณ เพื่อฟาร์มคะแนนแบบ規模ใหญ่และทำกิจวัตรการฟาร์มของคุณให้สมบูรณ์

อย่างที่คุณเห็นด้านล่าง รางวัลส่วนใหญ่เป็นบัตรของขวัญ แต่ก็มีของดี ๆ เช่น เกมหรือการสมัครสมาชิกด้วย  
![ภาพหน้าจอรางวัล](assets/20260313_135646_image.png)

| รางวัล | หมวดหมู่ | ต้นทุนคะแนน |
| --- | --- | --- |
| **Rakuten TV – 1 ภาพยนตร์ HD** | เนื้อหาดิจิทัล | 1 785 |
| **Roblox (บัตรดิจิทัล)** | เกม / เนื้อหาดิจิทัล | 6 750 |
| **บัตรของขวัญ Microsoft** | ร้านค้า / บริการ | 5 660 |
| **บัตรของขวัญ Xbox** | ร้านค้า / บริการ | 5 660 |
| **บัตรของขวัญ Microsoft Solitaire Collection** | เกม / เนื้อหาดิจิทัล | 1 500 |
| **Minecraft Minecoins** | เกม / เนื้อหาดิจิทัล | 2 500 |
| **บัตรของขวัญ League of Legends** | เกม / เนื้อหาดิจิทัล | 2 000 |
| **โค้ด Overwatch เหรียญ (ดิจิทัล)** | เกม / เนื้อหาดิจิทัล | 2 000 |
| **Sea of Thieves – ชุดเหรียญโบราณ** | เกม / เนื้อหาดิจิทัล | 1 700 |
| **Zalando – บัตรของขวัญ** | ร้านค้า / บริการ | 7 205 |
| **Carrefour – บัตรของขวัญ** | ร้านค้า / บริการ | 14 410 |
| **Cultura – บัตรของขวัญ** | ร้านค้า / บริการ | 14 410 |
| **Fnac‑Darty – บัตรของขวัญ** | ร้านค้า / บริการ | 14 410 |
| **La Redoute – บัตรของขวัญ** | ร้านค้า / บริการ | 14 410 |
| **Mango – บัตรของขวัญ** | ร้านค้า / บริการ | 36 025 |
| **Wonderbox – บัตรของขวัญ** | ร้านค้า / บริการ | 14 410 |
| **Yves Rocher – บัตรของขวัญ** | ร้านค้า / บริการ | 14 410 |
| **Amazon.fr – เช็คของขวัญ** | ร้านค้า / บริการ | 7 205 |
| **Foot Locker – บัตรของขวัญ** | ร้านค้า / บริการ | 14 410 |
| **IKEA FR – บัตรของขวัญ** | ร้านค้า / บริการ | 36 025 |
| **IKEA FR – บัตรของขวัญ (แบบอื่น)** | ร้านค้า / บริการ | 7 200 |
| **Marionnaud – บัตรของขวัญ** | ร้านค้า / บริการ | 14 410 |
| **Asos – บัตรของขวัญ** | ร้านค้า / บริการ | 14 410 |
| **Adidas FR – บัตรของขวัญ** | ร้านค้า / บริการ | 14 410 |
| **Deliveroo France – บัตรของขวัญ** | ร้านค้า / บริการ | 21 615 |
| **H&M France – บัตรของขวัญ** | ร้านค้า / บริการ | 14 410 |
| **Global Hotel Card (Expedia Group)** | ร้านค้า / บริการ | 7 205 |
| **Uber Eats France – บัตรของขวัญ** | ร้านค้า / บริการ | 36 025 |

ตอนนี้คุณเข้าใจถึงความน่าสนใจของโปรแกรมแล้ว มาดูเรื่องบอทติ้งกันดีกว่า

---

## การทดสอบครั้งแรก

ก่อนที่จะสร้างบอท ผมอยากแน่ใจว่า IP ของผมจะไม่ถูก标记เพราะใช้หลายร้อยบัญชีจากที่อยู่เดียวกัน คุณรู้จักผมนะ ผมจะใช้ Tor พร้อมพร็อกซีหมุนเวียน และผมไม่อยากโฮสต์บอทบน VPS -- ผมอยากให้มันทำงานใน GitHub Action

ดังนั้นผมจึงเขียน workflow ง่าย ๆ:

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

workflow นี้แค่ติดตั้ง Tor เริ่มมัน แล้วส่งคำขอ curl ผ่านมัน

การรันครั้งแรกได้ผลลัพธ์นี้:  
![Tor curl รันครั้งแรก](assets/20260313_140705_image.png)

สถิติเวลาเป็นดังนี้:  
![](assets/20260313_140928_image.png)

การรันครั้งที่สองได้ผลลัพธ์นี้:  
![Tor curl รันครั้งที่สอง](assets/20260313_140928_image.png)

อย่างที่คุณเห็น IP แตกต่างกัน ดังนั้นเราจะไม่ถูกธงว่ามีการใช้งานที่ผิดปกติจาก IP เดียวกัน ข่าวดี -- เราสามารถพัฒนาบอทฟาร์มต่อได้

---

## การทดสอบครั้งแรกกับ Selenium

เพื่อทำให้อินเทอร์เฟซเป็นอัตโนมัติ ผมจะใช้ **Selenium**: เครื่องมือที่ควบคุมเบราว์เซอร์จริง (Chrome/Edge/Firefox) แทนผู้ใช้ ในบริบทของ GitHub Action นั่นหมายถึงการติดตั้งเบราว์เซอร์ + ไดรเวอร์ของมัน จากนั้นรันสคริปต์ที่เข้าสู่ระบบ Microsoft Rewards และคลิกในที่ที่ต้องการ

### ตัวอย่างสคริปต์ JavaScript (Node.js + selenium-webdriver)

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

ผลลัพธ์ของสคริปต์:

```
DevTools listening on ws://127.0.0.1:50274/devtools/browser/37b9ea79-0e5d-4673-9e91-7ffeaf0d37f8
After navigation: url= https://rewards.bing.com/welcome?idru=%2F
After navigation: title= Bienvenue dans Microsoft Rewards!
Page loaded, sign in button found: Se connecter
```

โอเค นั่นหมายความว่าเรายังไม่ได้เข้าสู่ระบบ ตอนนี้เราจะสร้างคำขอเข้าสู่ระบบและดูว่าเราสามารถเข้าสู่บัญชี Microsoft Rewards ของเราเพื่อทำกิจกรรมได้หรือไม่
<!-- ## บทความนี้ยังอยู่ในระหว่างการเขียน ผมจะอัปเดตพร้อมขั้นตอนการเข้าสู่ระบบและการบอทกิจกรรมเร็ว ๆ นี้! คอยติดตาม -->
