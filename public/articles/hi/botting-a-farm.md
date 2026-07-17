---
title: माइक्रोसॉफ्ट रिवॉर्ड्स फार्मिंग बॉट
description: मैंने कैसे एक बॉट कोड किया जो बड़े पैमाने पर माइक्रोसॉफ्ट रिवॉर्ड्स पॉइंट्स
  फार्म करता है -- और माइक्रोसॉफ्ट ने तब से अपनी सुरक्षा कैसे मजबूत की।
date: 2026-03-13
authors:
  - fox3000foxy
tags:
  - automation
  - javascript
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "uhW+wKrA/FQzMIAnsJ4V63FEFk0ME9w1I4l96783u7z2TUNOJ2+e4Qq3dk6F0NEdGD1xf9Jj3Wc7hyERDXTzEA=="
---

> **नोट (2026):** यह प्रोजेक्ट अब मेंटेन नहीं किया जाता। माइक्रोसॉफ्ट ने अपनी एंटी-बॉट डिटेक्शन को काफी मजबूत कर लिया है -- जो उस समय काम करता था वह आज काम नहीं करता। नीचे वर्णित कोड और दृष्टिकोण केवल आर्काइव और प्रदर्शन उद्देश्यों के लिए संरक्षित किए गए हैं।

## परिचय

मैंने माइक्रोसॉफ्ट रिवॉर्ड्स की खोज कुछ साल पहले की थी। यह लॉकडाउन के दौरान की बात है, लेकिन इससे यह तथ्य नहीं बदलता कि मुझे माइक्रोसॉफ्ट फैमिली सेफ्टी के पैरेंटल कंट्रोल का उपयोग करना पड़ता था और इसलिए एज के ज़रिए ही जाना पड़ता था। तभी मैंने रिवॉर्ड्स की खोज की।

उस समय मैं केवल 14 साल का था और कैटलॉग में मेरी रुचि की कोई चीज़ नहीं थी। अब मैं सोचता हूँ कि मैंने जो कौशल हासिल किए हैं, उनके साथ मैं बॉट्स के ज़रिए पॉइंट्स फार्म कर सकता हूँ, फिर कोड दे सकता हूँ या अगर सचमुच चाहूँ तो उन्हें सस्ते में बेच भी सकता हूँ (लेकिन ईमानदारी से कहूँ तो, मुझे नहीं लगता कि मैं ऐसा करूँगा)। खैर, मैं आपको बताने जा रहा हूँ कि कैसे मैंने एक ऐसा बॉट कोड किया जो बड़े पैमाने पर अकाउंट्स फार्म करता है।

---

## माइक्रोसॉफ्ट रिवॉर्ड्स क्या है?

संक्षेप में: यह एक प्रोग्राम है जो एज उपयोगकर्ताओं को सर्च, छोटे क्विज़, गेम और एक एक्सटेंशन (लेकिन यह दूसरी कहानी है) जैसी गतिविधियों के लिए पॉइंट्स से पुरस्कृत करता है।

यहाँ आप "एक्सप्लोर" चीज़ें देख सकते हैं:  
![Explore screenshot](assets/20260313_135010_image.png)

उदाहरण के लिए, यह वह है जिसे वे "डेली सेट" कहते हैं।  
![Daily set screenshot](assets/20260313_135038_image.png)

उन्होंने स्ट्रीक सिस्टम भी बनाया है, जो काफी हैरान करने वाला है।  
![Streak screenshot](assets/20260313_135210_image.png)

एक लेवल सिस्टम भी है और यह बिल्कुल मजेदार है:  
![Level screenshot](assets/20260313_135340_image.png)

तो आपके पास पॉइंट्स कमाने के कई तरीके हैं, और उनमें से अधिकांश दैनिक हैं।  
यहाँ विचार एक ऐसा बॉट बनाने का है जो आपके लिए गतिविधियाँ करेगा, ताकि बड़े पैमाने पर पॉइंट्स फार्म किए जा सकें और आपकी फार्मिंग रूटीन को पूरा किया जा सके।

जैसा कि आप नीचे देख सकते हैं, अधिकांश रिवॉर्ड्स गिफ्ट कार्ड हैं, लेकिन कुछ अच्छी चीज़ें भी हैं जैसे गेम या सब्सक्रिप्शन।  
![Rewards screenshot](assets/20260313_135646_image.png)

| रिवॉर्ड | श्रेणी | पॉइंट्स लागत |
| --- | --- | --- |
| **Rakuten TV – 1 HD फ़िल्म** | डिजिटल सामग्री | 1 785 |
| **Roblox (डिजिटल कार्ड)** | गेम / डिजिटल सामग्री | 6 750 |
| **माइक्रोसॉफ्ट गिफ्ट कार्ड** | स्टोर / सेवा | 5 660 |
| **Xbox गिफ्ट कार्ड** | स्टोर / सेवा | 5 660 |
| **माइक्रोसॉफ्ट सॉलिटेयर कलेक्शन गिफ्ट कार्ड** | गेम / डिजिटल सामग्री | 1 500 |
| **Minecraft Minecoins** | गेम / डिजिटल सामग्री | 2 500 |
| **League of Legends गिफ्ट कार्ड** | गेम / डिजिटल सामग्री | 2 000 |
| **Overwatch कॉइन्स कोड (डिजिटल)** | गेम / डिजिटल सामग्री | 2 000 |
| **Sea of Thieves – पैक एंशिएंट कॉइन्स** | गेम / डिजिटल सामग्री | 1 700 |
| **Zalando – गिफ्ट कार्ड** | स्टोर / सेवा | 7 205 |
| **Carrefour – गिफ्ट कार्ड** | स्टोर / सेवा | 14 410 |
| **Cultura – गिफ्ट कार्ड** | स्टोर / सेवा | 14 410 |
| **Fnac‑Darty – गिफ्ट कार्ड** | स्टोर / सेवा | 14 410 |
| **La Redoute – गिफ्ट कार्ड** | स्टोर / सेवा | 14 410 |
| **Mango – गिफ्ट कार्ड** | स्टोर / सेवा | 36 025 |
| **Wonderbox – गिफ्ट कार्ड** | स्टोर / सेवा | 14 410 |
| **Yves Rocher – गिफ्ट कार्ड** | स्टोर / सेवा | 14 410 |
| **Amazon.fr – गिफ्ट वाउचर** | स्टोर / सेवा | 7 205 |
| **Foot Locker – गिफ्ट कार्ड** | स्टोर / सेवा | 14 410 |
| **IKEA FR – गिफ्ट कार्ड** | स्टोर / सेवा | 36 025 |
| **IKEA FR – गिफ्ट कार्ड (दूसरा डिज़ाइन)** | स्टोर / सेवा | 7 200 |
| **Marionnaud – गिफ्ट कार्ड** | स्टोर / सेवा | 14 410 |
| **Asos – गिफ्ट कार्ड** | स्टोर / सेवा | 14 410 |
| **Adidas FR – गिफ्ट कार्ड** | स्टोर / सेवा | 14 410 |
| **Deliveroo France – गिफ्ट कार्ड** | स्टोर / सेवा | 21 615 |
| **H&M France – गिफ्ट कार्ड** | स्टोर / सेवा | 14 410 |
| **ग्लोबल होटल कार्ड (Expedia Group)** | स्टोर / सेवा | 7 205 |
| **Uber Eats France – गिफ्ट कार्ड** | स्टोर / सेवा | 36 025 |

अब जब आप प्रोग्राम के महत्व को समझ गए हैं, तो बॉटिंग पर ध्यान देते हैं।

---

## पहले परीक्षण

अपना बॉट बनाने से पहले, मैं सुनिश्चित होना चाहता था कि एक ही पते से सैकड़ों अकाउंट्स का उपयोग करने पर मेरा आईपी फ्लैग न हो। आप मुझे जानते हैं, मैं रोटेटिंग प्रॉक्सी के साथ टोर का उपयोग करूँगा। और मैं अपना बॉट किसी VPS पर होस्ट नहीं करना चाहता -- मैं चाहता हूँ कि वह गिटहब एक्शन में चले।

इसलिए मैंने एक सरल वर्कफ़्लो लिखा:

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

यह वर्कफ़्लो बस टोर इंस्टॉल करता है, उसे शुरू करता है, और उसके माध्यम से एक कर्ल रिक्वेस्ट करता है।

पहले रन का परिणाम यह रहा:  
![Tor curl first run](assets/20260313_140705_image.png)

समय के आँकड़े ये थे:  
!Timings

दूसरे रन का परिणाम यह रहा:  
![Tor curl second run](assets/20260313_140928_image.png)

जैसा कि आप देख सकते हैं, आईपी अलग-अलग हैं, इसलिए हम एक ही आईपी से दुरुपयोग के लिए फ्लैग नहीं होंगे। अच्छी खबर है -- हम फार्मिंग बॉट विकसित करना जारी रख सकते हैं।

---

## Selenium के साथ पहला परीक्षण

इंटरफ़ेस को ऑटोमेट करने के लिए, मैं **Selenium** का उपयोग करने जा रहा हूँ: एक टूल जो उपयोगकर्ता की जगह एक वास्तविक ब्राउज़र (Chrome/Edge/Firefox) को नियंत्रित करता है। गिटहब एक्शन के संदर्भ में, इसका मतलब है एक ब्राउज़र + उसका ड्राइवर इंस्टॉल करना, फिर एक स्क्रिप्ट चलाना जो माइक्रोसॉफ्ट रिवॉर्ड्स में लॉग इन करे और जहाँ ज़रूरत हो वहाँ क्लिक करे।

### JavaScript स्क्रिप्ट का उदाहरण (Node.js + selenium-webdriver)

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

स्क्रिप्ट का परिणाम:

```
DevTools listening on ws://127.0.0.1:50274/devtools/browser/37b9ea79-0e5d-4673-9e91-7ffeaf0d37f8
After navigation: url= https://rewards.bing.com/welcome?idru=%2F
After navigation: title= Bienvenue dans Microsoft Rewards!
Page loaded, sign in button found: Se connecter
```

ठीक है, इसका मतलब है कि हमने अभी तक लॉग इन नहीं किया है, तो अब हम लॉगिन रिक्वेस्ट बनाएँगे और देखेंगे कि क्या हम अपने माइक्रोसॉफ्ट रिवॉर्ड्स अकाउंट में लॉग इन करके गतिविधियाँ कर सकते हैं।
<!-- इस लेख पर अभी भी काम चल रहा है, मैं जल्द ही लॉगिन और गतिविधियों की बॉटिंग के चरणों के साथ अपडेट करूँगा! बने रहें। -->
