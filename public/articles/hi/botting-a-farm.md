---
title: Microsoft Rewards फार्म को बॉट करना
description: मैंने बड़े पैमाने पर Microsoft Rewards अंक फार्म करने के लिए बॉट कैसे कोड किया, और तब से Microsoft ने अपनी सुरक्षा क्यों मजबूत की।
date: 2026-03-13
tags:
  - automation
  - javascript
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "eWz1Iwk/uqWYXXCxB1avR8ofbdlX2ka25iO3H9eWCZ3h+7/f7l2rcdg8Lzs0HWIqQ81euejqV4fxxbE5sb1srw=="
---

> **नोट (2026) :** यह प्रोजेक्ट अब अनुरक्षित नहीं है। Microsoft ने अपनी एंटी बॉट पहचान काफी मजबूत कर दी है, इसलिए जो उस समय काम करता था वह आज काम नहीं करता। नीचे वर्णित कोड और दृष्टिकोण सिर्फ अभिलेख और प्रदर्शन के लिए रखे गए हैं।

## परिचय

मैंने Microsoft Rewards की खोज कुछ साल पहले की थी। यह लॉकडाउन के दौरान था, और उस समय मुझे Microsoft Family Safety अभिभावक नियंत्रण इस्तेमाल करना पड़ता था और इसलिए Edge से गुजरना पड़ता था। वहीं मैंने Rewards खोजा।

उस समय मैं सिर्फ 14 साल का था और कैटलॉग में कुछ भी मेरी रुचि का नहीं था। अब मैं सोचता हूँ कि जो कौशल मैंने हासिल किए हैं उनसे मैं बॉट से अंक फार्म कर सकता हूँ, फिर कोड दे सकता हूँ या सच में मन करे तो सस्ते में बेच भी सकता हूँ (लेकिन ईमानदारी से, मुझे नहीं लगता मैं करूँगा)। मैं तुम्हें बताऊँगा कि मैंने बड़े पैमाने पर खाते फार्म करने वाला बॉट कैसे कोड किया।

---

## Microsoft Rewards क्या है ?

संक्षेप में : यह एक प्रोग्राम है जो Edge उपयोगकर्ताओं को खोज, छोटे क्विज, गेम और एक एक्सटेंशन जैसी गतिविधियों के लिए अंकों से पुरस्कृत करता है (लेकिन वह दूसरी कहानी है)।

तुम यहाँ "Explore" ब्लॉक देख रहे हो :
![Explore screenshot](assets/20260313_135010_image.png)

वहाँ उदाहरण के लिए यह वही है जिसे वे "दिन का सेट" कहते हैं।
![Daily set screenshot](assets/20260313_135038_image.png)

उन्होंने streak प्रणाली भी बनाई है, यह काफी पागलपन है।
![Streak screenshot](assets/20260313_135210_image.png)

स्तर प्रणाली भी है और प्रगति दिनचर्या को सच में व्यसनकारी बनाती है :
![Level screenshot](assets/20260313_135340_image.png)

तो तुम्हारे पास अंक कमाने के बहुत सारे तरीके हैं, और ज्यादातर रोजाना हैं।
यहाँ विचार एक बॉट बनाने का होगा जो तुम्हारी जगह गतिविधियाँ करता है, बड़े पैमाने पर अंक फार्म करने और तुम्हारी फार्मिंग दिनचर्या पूरी करने के लिए।

जैसा तुम नीचे देख सकते हो, ज्यादातर पुरस्कार गिफ्ट कार्ड हैं, लेकिन गेम या सदस्यता जैसे दिलचस्प विकल्प भी हैं।
![Rewards screenshot](assets/20260313_135646_image.png)

| पुरस्कार | श्रेणी | अंकों में लागत |
| --- | --- | --- |
| **Rakuten TV – 1 HD फिल्म** | डिजिटल सामग्री | 1 785 |
| **Roblox (डिजिटल कार्ड)** | गेम / डिजिटल सामग्री | 6 750 |
| **Microsoft गिफ्ट कार्ड** | दुकान / सेवा | 5 660 |
| **Xbox गिफ्ट कार्ड** | दुकान / सेवा | 5 660 |
| **Microsoft Solitaire Collection गिफ्ट कार्ड** | गेम / डिजिटल सामग्री | 1 500 |
| **Minecraft Minecoins** | गेम / डिजिटल सामग्री | 2 500 |
| **League of Legends गिफ्ट कार्ड** | गेम / डिजिटल सामग्री | 2 000 |
| **Overwatch सिक्का कोड (डिजिटल)** | गेम / डिजिटल सामग्री | 2 000 |
| **Sea of Thieves – प्राचीन सिक्का पैक** | गेम / डिजिटल सामग्री | 1 700 |
| **Zalando – गिफ्ट कार्ड** | दुकान / सेवा | 7 205 |
| **Carrefour – गिफ्ट कार्ड** | दुकान / सेवा | 14 410 |
| **Cultura – गिफ्ट कार्ड** | दुकान / सेवा | 14 410 |
| **Fnac‑Darty – गिफ्ट कार्ड** | दुकान / सेवा | 14 410 |
| **La Redoute – गिफ्ट कार्ड** | दुकान / सेवा | 14 410 |
| **Mango – गिफ्ट कार्ड** | दुकान / सेवा | 36 025 |
| **Wonderbox – गिफ्ट कार्ड** | दुकान / सेवा | 14 410 |
| **Yves Rocher – गिफ्ट कार्ड** | दुकान / सेवा | 14 410 |
| **Amazon.fr – गिफ्ट चेक** | दुकान / सेवा | 7 205 |
| **Foot Locker – गिफ्ट कार्ड** | दुकान / सेवा | 14 410 |
| **IKEA FR – गिफ्ट कार्ड** | दुकान / सेवा | 36 025 |
| **IKEA FR – गिफ्ट कार्ड (अन्य डिजाइन)** | दुकान / सेवा | 7 200 |
| **Marionnaud – गिफ्ट कार्ड** | दुकान / सेवा | 14 410 |
| **Asos – गिफ्ट कार्ड** | दुकान / सेवा | 14 410 |
| **Adidas FR – गिफ्ट कार्ड** | दुकान / सेवा | 14 410 |
| **Deliveroo France – गिफ्ट कार्ड** | दुकान / सेवा | 21 615 |
| **H&M France – गिफ्ट कार्ड** | दुकान / सेवा | 14 410 |
| **Global Hotel Card (Expedia Group)** | दुकान / सेवा | 7 205 |
| **Uber Eats France – गिफ्ट कार्ड** | दुकान / सेवा | 36 025 |

अब जब तुम प्रोग्राम की रुचि समझते हो, बॉटिंग पर ध्यान देते हैं।

---

## पहले परीक्षण

अपना बॉट बनाने से पहले, मैं सुनिश्चित होना चाहता था कि एक ही पते से सैकड़ों खाते इस्तेमाल करने के लिए मेरा IP चिह्नित नहीं होगा। तुम मुझे जानते हो, मैं घूर्णन प्रॉक्सी के साथ Tor से गुजरता हूँ। मैं इसे VPS के बजाय GitHub Action में चलाना चाहता हूँ।

इसलिए मैंने एक साधारण वर्कफ़्लो लिखा :

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

यह वर्कफ़्लो बस Tor स्थापित करता है, उसे शुरू करता है, और उसके माध्यम से curl अनुरोध करता है।

पहले run ने यह परिणाम दिया :
![Tor curl first run](assets/20260313_140705_image.png)

समय आँकड़े थे :
!Timings

दूसरे run ने यह परिणाम दिया :
![Tor curl second run](assets/20260313_140928_image.png)

जैसा तुम देख सकते हो, IP अलग हैं, इसलिए हम एक ही IP से दुरुपयोग के लिए चिह्नित होने से बचते हैं। अच्छी खबर : हम फार्मिंग बॉट विकसित करना जारी रख सकते हैं।

---

## Selenium के साथ पहला परीक्षण

इंटरफेस स्वचालित करने के लिए, मैं **Selenium** इस्तेमाल करूँगा : एक उपकरण जो उपयोगकर्ता की जगह असली ब्राउजर (Chrome/Edge/Firefox) नियंत्रित करता है। GitHub Action संदर्भ में, इसका मतलब ब्राउजर + उसका driver स्थापित करना, फिर एक स्क्रिप्ट चलाना है जो Microsoft Rewards से जुड़ती है और जहाँ जरूरी वहाँ क्लिक करती है।

### JavaScript स्क्रिप्ट उदाहरण (Node.js + selenium-webdriver)

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

स्क्रिप्ट का परिणाम :

```
DevTools listening on ws://127.0.0.1:50274/devtools/browser/37b9ea79-0e5d-4673-9e91-7ffeaf0d37f8
After navigation: url= https://rewards.bing.com/welcome?idru=%2F
After navigation: title= Bienvenue dans Microsoft Rewards!
Page loaded, sign in button found: Se connecter
```

यह परिणाम पुष्टि करता है कि हम अभी भी लॉगआउट हैं, इसलिए अब मैं login अनुरोध बनाऊँगा और गतिविधियाँ स्वचालित करने के लिए अपने Microsoft Rewards खाते से जुड़ने का परीक्षण करूँगा।
<!-- ## CET ARTICLE EST ENCORE EN COURS DE RÉDACTION, JE METTRAI À JOUR AVEC LES ÉTAPES DE CONNEXION ET DE BOTTING DES ACTIVITÉS BIENTÔT ! RESTE À L'ÉCOUTE. -->
