---
title: بوتنة مزرعة Microsoft Rewards
description: كيف برمجت بوتًا لجني نقاط Microsoft Rewards على نطاق واسع -- ولماذا عززت
  مايكروسوفت دفاعاتها منذ ذلك الحين.
date: 2026-03-13
authors:
  - fox3000foxy
tags:
  - automation
  - javascript
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "Dw+n/tDUUsJIiOvIMd7WB5dQViMEmbdD4akR9ItF1Y/duTVLwjqKVC8OnJf9kGp57800/yTh2qdtG8eCX3hl/A=="
---

> **ملاحظة (2026):** هذا المشروع لم يعد قيد الصيانة. مايكروسوفت عززت بشكل كبير اكتشافها لمكافحة البوتات -- ما كان يعمل في ذلك الوقت لم يعد يعمل اليوم. الكود والمنهجية الموصوفة أدناه مُحتفظ بها لأغراض الأرشفة والتوضيح فقط.

## مقدمة

اكتشفت Microsoft Rewards منذ بضع سنوات. كان ذلك خلال فترة الحجر الصحي، لكن ذلك لا يغير حقيقة أنني كنت مضطرًا لاستخدام الرقابة الأبوية Microsoft Family Safety وبالتالي المرور عبر Edge. وهناك اكتشفت Rewards.

في ذلك الوقت كان عمري 14 سنة فقط ولم يكن هناك شيء في الكتالوج يثير اهتمامي. الآن أقول لنفسي أنه مع المهارات التي اكتسبتها، يمكنني جني النقاط باستخدام البوتات، ثم إعطاء الرموز أو حتى بيعها بسعر أقل إذا أردت حقًا (لكن بصراحة، لا أعتقد أنني سأفعل ذلك). المهم، سأخبرك كيف برمجت بوتًا يجني الحسابات على نطاق واسع.

---

## ما هو Microsoft Rewards؟

باختصار: هو برنامج يكافئ مستخدمي Edge بنقاط مقابل أنشطة مثل عمليات البحث، اختبارات صغيرة، ألعاب، وإضافة (لكن تلك قصة أخرى).

ترى هنا أشياء "Explore":
![Explore screenshot](assets/20260313_135010_image.png)

هذا مثلاً ما يسمونه "مجموعة اليوم".
![Daily set screenshot](assets/20260313_135038_image.png)

حتى أنهم صنعوا نظامًا للتتابع، هذا مذهل جدًا.
![Streak screenshot](assets/20260313_135210_image.png)

يوجد أيضًا نظام مستويات وهذا ممتع تمامًا:
![Level screenshot](assets/20260313_135340_image.png)

إذن لديك طرق عديدة لكسب النقاط، ومعظمها يومية.
الفكرة هنا ستكون صنع بوت يقوم بالأنشطة نيابة عنك، لجني النقاط على نطاق واسع وإكمال روتين الجني الخاص بك.

كما ترى أدناه، معظم المكافآت هي بطاقات هدايا، لكن هناك أيضًا أشياء رائعة مثل الألعاب أو الاشتراكات.
![Rewards screenshot](assets/20260313_135646_image.png)

| المكافأة | الفئة | التكلفة بالنقاط |
| --- | --- | --- |
| **Rakuten TV – فيلم HD** | محتوى رقمي | 1٬785 |
| **Roblox (بطاقة رقمية)** | لعبة / محتوى رقمي | 6٬750 |
| **بطاقة هدايا Microsoft** | متجر / خدمة | 5٬660 |
| **بطاقة هدايا Xbox** | متجر / خدمة | 5٬660 |
| **بطاقة هدايا Microsoft Solitaire Collection** | لعبة / محتوى رقمي | 1٬500 |
| **Minecraft Minecoins** | لعبة / محتوى رقمي | 2٬500 |
| **بطاقة هدايا League of Legends** | لعبة / محتوى رقمي | 2٬000 |
| **رمز عملات Overwatch (رقمي)** | لعبة / محتوى رقمي | 2٬000 |
| **Sea of Thieves – حزمة العملات القديمة** | لعبة / محتوى رقمي | 1٬700 |
| **Zalando – بطاقة هدايا** | متجر / خدمة | 7٬205 |
| **Carrefour – بطاقة هدايا** | متجر / خدمة | 14٬410 |
| **Cultura – بطاقة هدايا** | متجر / خدمة | 14٬410 |
| **Fnac‑Darty – بطاقة هدايا** | متجر / خدمة | 14٬410 |
| **La Redoute – بطاقة هدايا** | متجر / خدمة | 14٬410 |
| **Mango – بطاقة هدايا** | متجر / خدمة | 36٬025 |
| **Wonderbox – بطاقة هدايا** | متجر / خدمة | 14٬410 |
| **Yves Rocher – بطاقة هدايا** | متجر / خدمة | 14٬410 |
| **Amazon.fr – شيك هدية** | متجر / خدمة | 7٬205 |
| **Foot Locker – بطاقة هدايا** | متجر / خدمة | 14٬410 |
| **IKEA FR – بطاقة هدايا** | متجر / خدمة | 36٬025 |
| **IKEA FR – بطاقة هدايا (تصميم آخر)** | متجر / خدمة | 7٬200 |
| **Marionnaud – بطاقة هدايا** | متجر / خدمة | 14٬410 |
| **Asos – بطاقة هدايا** | متجر / خدمة | 14٬410 |
| **Adidas FR – بطاقة هدايا** | متجر / خدمة | 14٬410 |
| **Deliveroo France – بطاقة هدايا** | متجر / خدمة | 21٬615 |
| **H&M France – بطاقة هدايا** | متجر / خدمة | 14٬410 |
| **Global Hotel Card (Expedia Group)** | متجر / خدمة | 7٬205 |
| **Uber Eats France – بطاقة هدايا** | متجر / خدمة | 36٬025 |

الآن بعد أن فهمت قيمة البرنامج، دعنا ننتقل إلى البوتنة.

---

## الاختبارات الأولى

قبل بناء البوت، أردت التأكد من أن عنوان IP الخاص بي لن يتم وضع علامة عليه لاستخدام مئات الحسابات من نفس العنوان. أنت تعرفني، سأستخدم Tor مع وكيل دوار. ولا أريد استضافة البوت على VPS -- أريده أن يعمل في GitHub Action.

لذا كتبت workflow بسيطًا:

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

هذا الـ workflow يقوم فقط بتثبيت Tor، تشغيله، وإجراء طلب curl عبره.

التشغيل الأول أعطى هذه النتيجة:
![Tor curl first run](assets/20260313_140705_image.png)

إحصائيات الوقت كانت:
!Timings

تشغيل ثانٍ أعطى هذه النتيجة:
![Tor curl second run](assets/20260313_140928_image.png)

كما ترى، عناوين IP مختلفة، لذا لن يتم الإبلاغ عنا لاستخدامنا المسيء من نفس IP. خبر جيد -- يمكننا مواصلة تطوير بوت الجني.

---

## أول اختبار مع Selenium

لأتمتة الواجهة، سأستخدم **Selenium**: أداة تتحكم بمتصفح حقيقي (Chrome/Edge/Firefox) بدلاً من المستخدم. في سياق GitHub Action، هذا يعني تثبيت متصفح + مشغله، ثم تشغيل script يتصل بـ Microsoft Rewards وينقر حيث يجب.

### مثال script بلغة JavaScript (Node.js + selenium-webdriver)

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

نتيجة الـ script:

```
DevTools listening on ws://127.0.0.1:50274/devtools/browser/37b9ea79-0e5d-4673-9e91-7ffeaf0d37f8
After navigation: url= https://rewards.bing.com/welcome?idru=%2F
After navigation: title= Bienvenue dans Microsoft Rewards!
Page loaded, sign in button found: Se connecter
```

حسنًا، هذا يعني أننا لم نسجل الدخول بعد، لذا سنقوم الآن ببناء طلب تسجيل الدخول ونرى ما إذا كان بإمكاننا تسجيل الدخول إلى حساب Microsoft Rewards الخاص بنا للقيام بالأنشطة.
<!-- ## CET ARTICLE EST ENCORE EN COURS DE RÉDACTION, JE METTRAI À JOUR AVEC LES ÉTAPES DE CONNEXION ET DE BOTTING DES ACTIVITÉS BIENTÔT ! RESTE À L'ÉCOUTE. -->
