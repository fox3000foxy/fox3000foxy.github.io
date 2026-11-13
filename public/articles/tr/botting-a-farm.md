---
title: Microsoft Rewards çiftliği botlamak
description: Microsoft Rewards puanlarını büyük ölçekte kasan bir botu nasıl
  kodladım ve Microsoft o zamandan beri savunmalarını neden güçlendirdi.
date: 2026-03-13
tags:
  - automation
  - javascript
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "1aFmyrnAjhQb8eRCk2V7VAuev6pgPKGRG5Bxjp6wkcdsjQLtQtSbJnhKGET4YZrzwejVtrAKuZKpkugXn8v1GA=="
---

> **Not (2026):** Bu proje artık bakımlı değil. Microsoft bot karşıtı tespitini önemli ölçüde güçlendirdi, o yüzden o zamanlar işe yarayan şey bugün artık çalışmıyor. Aşağıda anlatılan kod ve yaklaşım yalnızca arşiv ve tanıtım amacıyla saklanmaktadır.

## Giriş

Microsoft Rewardsı birkaç yıl önce keşfettim. Kapanma dönemindeydi ve o zaman Microsoft Family Safety ebeveyn denetimini kullanmak zorunda olduğum için Edge üzerinden geçiyordum. Rewardsı orada keşfettim.

O zamanlar sadece 14 yaşındaydım ve katalogdaki hiçbir şey ilgimi çekmiyordu. Şimdi edindiğim becerilerle botlarla puan kasabileceğimi, sonra kodları gerçekten istersem dağıtılabileceğini ya da daha ucuza satılabileceğini düşünüyorum (ama dürüstçe yapacağımı sanmıyorum). Ölçekte hesap kasan bir botu nasıl kodladığımı anlatacağım.

---

## Microsoft Rewards nedir?

Kısaca: Edge kullanıcılarını aramalar, küçük quizler, oyunlar gibi aktiviteler ve bir uzantı karşılığında puanlarla ödüllendiren bir program (ama o başka bir hikâye).

Burada "Explore" bloklarını görüyorsun:
![Explore ekran görüntüsü](assets/20260313_135010_image.png)

Burada örneğin "günün seti" dedikleri şey var.
![Günlük set ekran görüntüsü](assets/20260313_135038_image.png)

Bir seri sistemi bile yapmışlar, epey çılgınca.
![Seri ekran görüntüsü](assets/20260313_135210_image.png)

Bir de seviye sistemi var ve ilerleme rutini gerçekten bağımlılık yapıyor:
![Seviye ekran görüntüsü](assets/20260313_135340_image.png)

Yani puan kazanmanın bir sürü yolu var ve çoğu günlük.
Buradaki fikir senin yerine aktiviteleri yapan bir bot yapmak, puanları ölçekte kasmak ve kasım rutinini tamamlamak.

Aşağıda görebileceğin gibi ödüllerin çoğu hediye kartı ama oyunlar ya da abonelikler gibi ilginç seçenekler de var.
![Ödüller ekran görüntüsü](assets/20260313_135646_image.png)

| Ödül | Kategori | Puan maliyeti |
| --- | --- | --- |
| **Rakuten TV – 1 HD film** | Dijital içerik | 1 785 |
| **Roblox (dijital kart)** | Oyun / dijital içerik | 6 750 |
| **Microsoft hediye kartı** | Mağaza / hizmet | 5 660 |
| **Xbox hediye kartı** | Mağaza / hizmet | 5 660 |
| **Microsoft Solitaire Collection hediye kartı** | Oyun / dijital içerik | 1 500 |
| **Minecraft Minecoins** | Oyun / dijital içerik | 2 500 |
| **League of Legends hediye kartı** | Oyun / dijital içerik | 2 000 |
| **Overwatch jeton kodu (dijital)** | Oyun / dijital içerik | 2 000 |
| **Sea of Thieves – Antik Para Paketi** | Oyun / dijital içerik | 1 700 |
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
| **IKEA FR – Hediye kartı (başka tasarım)** | Mağaza / hizmet | 7 200 |
| **Marionnaud – Hediye kartı** | Mağaza / hizmet | 14 410 |
| **Asos – Hediye kartı** | Mağaza / hizmet | 14 410 |
| **Adidas FR – Hediye kartı** | Mağaza / hizmet | 14 410 |
| **Deliveroo France – Hediye kartı** | Mağaza / hizmet | 21 615 |
| **H&M France – Hediye kartı** | Mağaza / hizmet | 14 410 |
| **Global Hotel Card (Expedia Group)** | Mağaza / hizmet | 7 205 |
| **Uber Eats France – Hediye kartı** | Mağaza / hizmet | 36 025 |

Programın neye yaradığını artık anladığına göre botlamaya gelelim.

---

## İlk testler

Botumu inşa etmeden önce aynı adresten yüzlerce hesap kullandığım için IPmin işaretlenmeyeceğinden emin olmak istedim. Beni tanırsın, dönen vekille Tor üzerinden geçiyorum. Onu bir VPS yerine bir GitHub Action içinde çalıştırmak istiyorum.

O yüzden basit bir workflow yazdım:

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

Bu workflow sadece Tor kurar, başlatır ve üzerinden bir curl isteği yapar.

İlk run şu sonucu verdi:
![Tor curl ilk run](assets/20260313_140705_image.png)

Zaman istatistikleri şöyleydi:
!Timings

İkinci bir run şu sonucu verdi:
![Tor curl ikinci run](assets/20260313_140928_image.png)

Görebileceğin gibi IPler farklı, yani aynı IPden kötüye kullanım damgası yemekten kaçınıyoruz. İyi haber: kasım botunu geliştirmeye devam edebiliriz.

---

## Selenium ile ilk test

Arayüzü otomatikleştirmek için **Selenium** kullanacağım: bir kullanıcının yerine gerçek bir tarayıcıyı (Chrome/Edge/Firefox) süren bir araç. Bir GitHub Action bağlamında bu, bir tarayıcı + sürücüsünü kurmak, sonra Microsoft Rewardsa bağlanıp gereken yerlere tıklayan bir script çalıştırmak demektir.

### JavaScript örnek scripti (Node.js + selenium-webdriver)

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
  // Otomasyon parmak izini azaltmak için herhangi bir sayfa JSsi çalışmadan önce script enjekte et.
  await (driver as any).sendDevToolsCommand('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });

      // Bazı siteler chrome çalışma ortamını ve eklentileri kontrol eder
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

Bu sonuç hâlâ bağlantının kesik olduğunu doğruluyor, o yüzden şimdi giriş isteğini inşa edip aktiviteleri otomatikleştirmek için Microsoft Rewards hesabıma bağlantıyı test edeceğim.
<!-- ## CET ARTICLE EST ENCORE EN COURS DE RÉDACTION, JE METTRAI À JOUR AVEC LES ÉTAPES DE CONNEXION ET DE BOTTING DES ACTIVITÉS BIENTÔT ! RESTE À L'ÉCOUTE. -->
