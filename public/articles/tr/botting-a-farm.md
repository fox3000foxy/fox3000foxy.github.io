---
title: Bir Microsoft Rewards Çiftliğini Botlamak
description: Ölçekli olarak Microsoft Rewards puanı toplamak için nasıl bir bot
  kodladığım -- ve Microsoft'un anti-bot tespitinin neden artık işe yaramadığı.
date: 2026-03-13
tags:
  - automation
  - javascript
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "tufa+MvB2Ucs/BtAyYu3MWT1q7GRHKBErY74m2SIe61aijh4fdB5BMERPrE+EXuxa1yDfZeZpeAlNCrhuaMeUQ=="
---

> **Not (2026):** Bu proje artık bakılmıyor. Microsoft, anti-bot tespitini önemli ölçüde güçlendirdi -- o zamanlar işe yarayan şey artık çalışmıyor. Aşağıda açıklanan kod ve yaklaşım sadece arşiv/eğitim amaçlı saklanmaktadır.

### Giriş

Birkaç yıl önce Microsoft Rewards'ı keşfettim. O zamanlar karantina günleriydi, ama bu, Microsoft Family Safety ebeveyn kontrollerini kullanmak zorunda olduğum ve dolayısıyla Edge kullandığım gerçeğini değiştirmiyor. İşte o zaman Rewards'ı keşfettim.

O zamanlar sadece 14 yaşındaydım ve katalogdaki hiçbir şey ilgimi çekmiyordu. Şimdi edindiğim becerilerle, botlarla puan toplayabileceğimi ve sonra kodları verebileceğimi, hatta gerçekten istersem daha ucuza satabileceğimi düşünüyorum (kendimi bilirim, muhtemelen yapmam). Neyse, sana hesapları ölçekli olarak çalıştıran bir botu nasıl kodladığımı anlatacağım.

---

## Microsoft Rewards Nedir?

Kısacası: Edge kullanıcılarını aramalar, küçük testler, oyunlar ve bir uzantı (ki o da bambaşka bir hikaye) gibi aktiviteler için puanlarla ödüllendiren bir program.

Burada "Keşfet" şeylerini görebilirsin:  
![Explore ekran görüntüsü](assets/20260313_135010_image.png)

Bu, örneğin "günün seti" dedikleri şey.  
![Günlük set ekran görüntüsü](assets/20260313_135038_image.png)

Hatta bir seri sistemi bile oluşturmuşlar, oldukça çılgın.  
![Seri ekran görüntüsü](assets/20260313_135210_image.png)

Bir de seviye sistemi var ve tamamen eğlenceli:  
![Seviye ekran görüntüsü](assets/20260313_135340_image.png)

Yani puan kazanmanın bir sürü yolu var ve çoğu günlük.  
Buradaki fikir, aktiviteleri senin için yapan bir bot yapmak, böylece ölçekli olarak puan toplayabilir ve çiftlik rutinini tamamlayabilirsin.

Aşağıda görebileceğin gibi, ödüllerin çoğu hediye kartları, ama ayrıca oyunlar veya servis abonelikleri gibi eğlenceli şeyler de var.  
![Ödüller ekran görüntüsü](assets/20260313_135646_image.png)

| Ödül | Kategori | Puan cinsinden maliyet |
| --- | --- | --- |
| **Rakuten TV – 1 HD film** | Dijital içerik | 1 785 |
| **Roblox (dijital kart)** | Oyun / dijital içerik | 6 750 |
| **Microsoft hediye kartı** | Mağaza / hizmet | 5 660 |
| **Xbox hediye kartı** | Mağaza / hizmet | 5 660 |
| **Microsoft Solitaire Collection hediye kartı** | Oyun / dijital içerik | 1 500 |
| **Minecraft Minecoins** | Oyun / dijital içerik | 2 500 |
| **League of Legends hediye kartı** | Oyun / dijital içerik | 2 000 |
| **Overwatch coin kodu (dijital)** | Oyun / dijital içerik | 2 000 |
| **Sea of Thieves – Old Coins paketi** | Oyun / dijital içerik | 1 700 |
| **Zalando – Hediye kartı** | Mağaza / hizmet | 7 205 |
| **Carrefour – Hediye kartı** | Mağaza / hizmet | 14 410 |
| **Cultura – Hediye kartı** | Mağaza / hizmet | 14 410 |
| **Fnac‑Darty – Hediye kartı** | Mağaza / hizmet | 14 410 |
| **La Redoute – Hediye kartı** | Mağaza / hizmet | 14 410 |
| **Mango – Hediye kartı** | Mağaza / hizmet | 36 025 |
| **Wonderbox – Hediye kartı** | Mağaza / hizmet | 14 410 |
| **Yves Rocher – Hediye kartı** | Mağaza / hizmet | 14 410 |
| **Amazon.fr – Hediye çeki** | Mağaza / hizmet | 7 205 |
| **Foot Locker – Hediye kartı** | Mağaza / hizmet | 14 410 |
| **IKEA FR – Hediye kartı** | Mağaza / hizmet | 36 025 |
| **IKEA FR – Hediye kartı (diğer tasarım)** | Mağaza / hizmet | 7 200 |
| **Marionnaud – Hediye kartı** | Mağaza / hizmet | 14 410 |
| **Asos – Hediye kartı** | Mağaza / hizmet | 14 410 |
| **Adidas FR – Hediye kartı** | Mağaza / hizmet | 14 410 |
| **Deliveroo France – Hediye kartı** | Mağaza / hizmet | 21 615 |
| **H&M France – Hediye kartı** | Mağaza / hizmet | 14 410 |
| **Global Hotel Card (Expedia Group)** | Mağaza / hizmet | 7 205 |
| **Uber Eats France – Hediye kartı** | Mağaza / hizmet | 36 025 |

Artık bu programın amacını anladığına göre, bot işine bakalım.

---

## İlk testler

Botumu inşa etmeden önce, aynı adresten yüzlerce hesap kullandığım için IP'nin işaretlenmeyeceğinden emin olmak istedim. Beni tanırsın, dönen proxy ile Tor kullanacağım. Ve botumu bir VPS'de barındırmak istemiyorum -- bir GitHub Action'da çalışmasını istiyorum.

Basit bir workflow yazdım:

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

Bu workflow sadece Tor'u kurar, başlatır ve üzerinden bir curl isteği yapar.

İlk çalıştırma şu sonucu verdi:  
![Tor curl ilk çalıştırma](assets/20260313_140705_image.png)

Zaman istatistikleri şöyleydi:  
!Zamanlamalar

İkinci çalıştırma şu sonucu verdi:  
![Tor curl ikinci çalıştırma](assets/20260313_140928_image.png)

Gördüğün gibi, IP'ler farklı, bu yüzden aynı IP'den aşırı kullanım nedeniyle işaretlenmeyiz. Bu iyi haber--çiftlik botunu geliştirmeye devam edebiliriz.

---

## Selenium ile ilk test

Arayüzü otomatikleştirmek için **Selenium** kullanacağım: bir kullanıcı yerine gerçek bir tarayıcıyı (Chrome/Edge/Firefox) kontrol eden bir araç. Bir GitHub Action bağlamında bu, bir tarayıcı + sürücüsünü kurmak, ardından Microsoft Rewards'a giriş yapan ve gereken yerlere tıklayan bir script çalıştırmak anlamına geliyor.

### Örnek JavaScript scripti (Node.js + selenium-webdriver)

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
  // Herhangi bir sayfa JS'si çalışmadan önce script enjekte ederek otomasyon parmak izini azaltır.
  await (driver as any).sendDevToolsCommand('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });

      // Bazı siteler chrome runtime ve eklentileri kontrol eder
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

Scriptin sonucu:

```
DevTools listening on ws://127.0.0.1:50274/devtools/browser/37b9ea79-0e5d-4673-9e91-7ffeaf0d37f8
After navigation: url= https://rewards.bing.com/welcome?idru=%2F
After navigation: title= Bienvenue dans Microsoft Rewards!
Page loaded, sign in button found: Se connecter
```

Tamam, bu henüz giriş yapmadığımız anlamına geliyor, şimdi giriş isteğini oluşturacağız ve aktiviteleri yapmak için Microsoft Rewards hesabımıza giriş yapıp yapamayacağımıza bakacağız.
<!-- ## BU MAKALE HÂLÂ YAPIM AŞAMASINDADIR, YAKINDA GİRİŞ ADIMLARI VE AKTİVİTE BOTLAMA ADIMLARIYLA GÜNCELLEYECEĞİM! TAKİPTE KALIN. -->
