---
title: توفير مزرعة Microsoft Rewards بالبوتات
description: كيف برمجت بوتا لتوفير نقاط Microsoft Rewards على نطاق واسع،
  ولماذا شددت Microsoft دفاعاتها منذ ذلك الحين.
date: 2026-03-13
tags:
  - automation
  - javascript
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "0cp5Ar3i8XyuoKyxRlWH3eW3tjAUCFS9VqsVUVQmMpQGiEOD5g/zmTm2vxmjayXFVOS5IO6HVe8//BGvhKYXkA=="
---

> **ملاحظة (2026) :** لم يعد هذا المشروع مصانا. شددت Microsoft كثيرا كشفها ضد البوتات، فما كان يعمل آنذاك لم يعد يعمل اليوم. الكود والمقاربة الموصوفان أدناه محفوظان لأغراض الأرشفة والعرض فقط.

## مقدمة

اكتشفت Microsoft Rewards قبل سنوات. كان ذلك أثناء الحجر، وكنت آنذاك مجبرا على استخدام الرقابة الأبوية Microsoft Family Safety وبالتالي المرور عبر Edge. وهناك اكتشفت Rewards.

آنذاك كان عمري 14 فقط ولا شيء في الفهرس يهمني. الآن أقول لنفسي أنه بالمهارات التي اكتسبتها، أستطيع توفير نقاط ببوتات، ثم إعطاء الرموز أو حتى إعادة بيعها أرخص إذا أردت فعلا (لكن بصراحة، لا أظنني سأفعل). سأروي لك كيف برمجت بوتا يوفّر حسابات على نطاق واسع.

---

## ما هو Microsoft Rewards ؟

باختصار : إنه برنامج يكافئ مستخدمي Edge بنقاط لأنشطة مثل البحوث والاختبارات الصغيرة والألعاب وإضافة (لكن تلك قصة أخرى).

ترى هنا كتل "Explore" :
![Explore screenshot](assets/20260313_135010_image.png)

هنا مثلا ما يسمونه "set اليوم" :
![Daily set screenshot](assets/20260313_135038_image.png)

وصنعوا حتى نظام streak، وهذا جنوني بعض الشيء.
![Streak screenshot](assets/20260313_135210_image.png)

وهناك أيضا نظام مستوى والتقدم يجعل الروتين مُدمنا فعلا :
![Level screenshot](assets/20260313_135340_image.png)

إذن لديك طرق كثيرة لكسب النقاط، ومعظمها يومي.
الفكرة هنا ستكون صنع بوت يقوم بالأنشطة مكانك، لتوفير نقاط على نطاق واسع وإكمال روتين التوفير خاصتك.

كما ترى أدناه، معظم المكافآت بطاقات هدايا، لكن هناك أيضا خيارات مثيرة مثل ألعاب أو اشتراكات.
![Rewards screenshot](assets/20260313_135646_image.png)

| المكافأة | الفئة | Kost بالنقاط |
| --- | --- | --- |
| **Rakuten TV – 1 فيلم HD** | محتوى رقمي | 1 785 |
| **Roblox (بطاقة رقمية)** | لعبة / محتوى رقمي | 6 750 |
| **بطاقة هدايا Microsoft** | متجر / خدمة | 5 660 |
| **بطاقة هدايا Xbox** | متجر / خدمة | 5 660 |
| **بطاقة هدايا Microsoft Solitaire Collection** | لعبة / محتوى رقمي | 1 500 |
| **Minecraft Minecoins** | لعبة / محتوى رقمي | 2 500 |
| **بطاقة هدايا League of Legends** | لعبة / محتوى رقمي | 2 000 |
| **رمز Overwatch عملات (رقمي)** | لعبة / محتوى رقمي | 2 000 |
| **Sea of Thieves – حزمة العملات القديمة** | لعبة / محتوى رقمي | 1 700 |
| **Zalando – بطاقة هدايا** | متجر / خدمة | 7 205 |
| **Carrefour – بطاقة هدايا** | متجر / خدمة | 14 410 |
| **Cultura – بطاقة هدايا** | متجر / خدمة | 14 410 |
| **Fnac‑Darty – بطاقة هدايا** | متجر / خدمة | 14 410 |
| **La Redoute – بطاقة هدايا** | متجر / خدمة | 14 410 |
| **Mango – بطاقة هدايا** | متجر / خدمة | 36 025 |
| **Wonderbox – بطاقة هدايا** | متجر / خدمة | 14 410 |
| **Yves Rocher – بطاقة هدايا** | متجر / خدمة | 14 410 |
| **Amazon.fr – شيك هدايا** | متجر / خدمة | 7 205 |
| **Foot Locker – بطاقة هدايا** | متجر / خدمة | 14 410 |
| **IKEA FR – بطاقة هدايا** | متجر / خدمة | 36 025 |
| **IKEA FR – بطاقة هدايا (تصميم آخر)** | متجر / خدمة | 7 200 |
| **Marionnaud – بطاقة هدايا** | متجر / خدمة | 14 410 |
| **Asos – بطاقة هدايا** | متجر / خدمة | 14 410 |
| **Adidas FR – بطاقة هدايا** | متجر / خدمة | 14 410 |
| **Deliveroo France – بطاقة هدايا** | متجر / خدمة | 21 615 |
| **H&M France – بطاقة هدايا** | متجر / خدمة | 14 410 |
| **Global Hotel Card (Expedia Group)** | متجر / خدمة | 7 205 |
| **Uber Eats France – بطاقة هدايا** | متجر / خدمة | 36 025 |

الآن وقد فهمت فائدة البرنامج، لنهتم بالتوفير بالبوتات.

---

## اختبارات أولى

قبل بناء بوتي، أردت التأكد أن IP خاصتي لن يُوسَم لاستخدام مئات الحسابات من نفس العنوان. تعرفني، أمر عبر Tor مع وكيل دوّار. أريد تنفيذه في GitHub Action بدلا من VPS.

فكتبت workflow بسيطا :

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

هذا workflow يثبت فقط Tor، ويشغّله، وينفذ طلب curl عبره.

أعطى أول تشغيل هذه النتيجة :
![Tor curl first run](assets/20260313_140705_image.png)

كانت إحصاءات الزمن :
!Timings

أعطى تشغيل ثانٍ هذه النتيجة :
![Tor curl second run](assets/20260313_140928_image.png)

كما ترى، IP مختلفة، إذن نتجنب وسم الاستخدام المسيء من نفس IP. خبر سار : نستطيع مواصلة تطوير بوت التوفير.

---

## أول اختبار مع Selenium

لأتمتة الواجهة، سأستخدم **Selenium** : أداة تتحكم بمتصفح حقيقي (Chrome/Edge/Firefox) مكان مستخدم. في سياق GitHub Action، يعني ذلك تثبيت متصفح + مشغّله، ثم إطلاق سكربت يتصل بـMicrosoft Rewards وينقر حيث يلزم.

### مثال سكربت JavaScript (Node.js + selenium-webdriver)

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
  // حقن سكربت قبل عمل أي JS للصفحة لتقليل بصمة الأتمتة.
  await (driver as any).sendDevToolsCommand('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });

      // بعض المواقع تتحقق من chrome runtime والإضافات
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

    console.log('بعد التنقل : الرابط=', await driver.getCurrentUrl());
    console.log('بعد التنقل : العنوان=', await driver.getTitle());

    const signInButton = await driver.wait(
      until.elementLocated(By.css('#rewards-header-sign-in')),
      20000,
      'انتهت المهلة بانتظار زر الدخول (قد يشير لصفحة 400/محظورة)'
    );

    console.log('حُمّلت الصفحة، وُجد زر الدخول:', await signInButton.getText());
  } finally {
    await driver.quit();
  }
})();
```

نتيجة السكربت :

```
DevTools listening on ws://127.0.0.1:50274/devtools/browser/37b9ea79-0e5d-4673-9e91-7ffeaf0d37f8
After navigation: url= https://rewards.bing.com/welcome?idru=%2F
After navigation: title= Bienvenue dans Microsoft Rewards!
Page loaded, sign in button found: Se connecter
```

تؤكد هذه النتيجة أننا ما زلنا غير متصلين، إذن سأبني الآن طلب الدخول وأختبر الاتصال بحساب Microsoft Rewards خاصتي لأتمتة الأنشطة.
<!-- ## هذا المقال ما زال قيد التحرير، سأحدّث مع خطوات الاتصال وتوفير الأنشطة قريبا ! ابقَ مستمعا. -->
