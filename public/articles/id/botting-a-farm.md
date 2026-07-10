---
title: Membot sebuah Farm Microsoft Rewards
description: Bagaimana saya membuat bot untuk memanen poin Microsoft Rewards secara
  besar-besaran -- dan mengapa Microsoft sejak itu telah memperkuat pertahanannya.
date: 2026-03-13
tags:
  - automation
  - javascript
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "o1IZL5QuPfGZFk2zZaNxHWmIWKS5/ZUUvWOO31li+F06iEAnBsI9CSP5kSdeDHSC+U2LqqqXGzzXgh77aPMRZA=="
---

> **Catatan (2026) :** Proyek ini tidak lagi dipertahankan. Microsoft telah secara signifikan memperkuat deteksi anti-bot mereka -- apa yang dulu berhasil sekarang sudah tidak berfungsi lagi. Kode dan pendekatan yang dijelaskan di bawah ini disimpan untuk tujuan arsip dan demonstrasi saja.

## Pendahuluan

Saya menemukan Microsoft Rewards beberapa tahun yang lalu. Itu terjadi selama masa karantina, tapi itu tidak mengubah fakta bahwa saya diharuskan menggunakan parental control Microsoft Family Safety dan oleh karena itu harus melalui Edge. Saat itulah saya menemukan Rewards.

Saat itu saya baru berusia 14 tahun dan tidak ada apa pun di katalog yang menarik minat saya. Sekarang saya berpikir, dengan keterampilan yang saya peroleh, saya bisa memanen poin dengan bot, lalu memberikan kode-kodenya atau bahkan menjualnya kembali dengan harga lebih murah jika saya benar-benar menginginkannya (tapi sejujurnya, saya rasa tidak akan melakukannya). Singkat cerita, saya akan menceritakan bagaimana saya membuat bot yang memanen akun secara besar-besaran.

---

## Apa itu Microsoft Rewards?

Singkatnya: ini adalah program yang memberi penghargaan kepada pengguna Edge dengan poin untuk aktivitas seperti pencarian, kuis kecil, permainan, dan sebuah ekstensi (tapi itu cerita lain).

Kamu bisa lihat di sini hal-hal "Explore":  
![Explore screenshot](assets/20260313_135010_image.png)

Misalnya ini yang mereka sebut "set harian".  
![Daily set screenshot](assets/20260313_135038_image.png)

Mereka bahkan membuat sistem streak, cukup gila.  
![Streak screenshot](assets/20260313_135210_image.png)

Ada juga sistem level dan itu benar-benar menyenangkan:  
![Level screenshot](assets/20260313_135340_image.png)

Jadi ada banyak cara untuk mendapatkan poin, dan sebagian besar dilakukan setiap hari.  
Idenya di sini adalah membuat bot yang melakukan aktivitas untukmu, untuk memanen poin secara besar-besaran dan melengkapi rutinitas farming-mu.

Seperti yang bisa kamu lihat di bawah, sebagian besar hadiah adalah kartu hadiah, tapi ada juga hal-hal keren seperti game atau langganan.  
![Rewards screenshot](assets/20260313_135646_image.png)

| Hadiah | Kategori | Biaya poin |
| --- | --- | --- |
| **Rakuten TV – 1 film HD** | Konten digital | 1 785 |
| **Roblox (kartu digital)** | Game / konten digital | 6 750 |
| **Kartu Hadiah Microsoft** | Toko / layanan | 5 660 |
| **Kartu Hadiah Xbox** | Toko / layanan | 5 660 |
| **Kartu Hadiah Microsoft Solitaire Collection** | Game / konten digital | 1 500 |
| **Minecraft Minecoins** | Game / konten digital | 2 500 |
| **Kartu Hadiah League of Legends** | Game / konten digital | 2 000 |
| **Kode Overwatch koin (digital)** | Game / konten digital | 2 000 |
| **Sea of Thieves – Paket Koin Kuno** | Game / konten digital | 1 700 |
| **Zalando – Kartu Hadiah** | Toko / layanan | 7 205 |
| **Carrefour – Kartu Hadiah** | Toko / layanan | 14 410 |
| **Cultura – Kartu Hadiah** | Toko / layanan | 14 410 |
| **Fnac‑Darty – Kartu Hadiah** | Toko / layanan | 14 410 |
| **La Redoute – Kartu Hadiah** | Toko / layanan | 14 410 |
| **Mango – Kartu Hadiah** | Toko / layanan | 36 025 |
| **Wonderbox – Kartu Hadiah** | Toko / layanan | 14 410 |
| **Yves Rocher – Kartu Hadiah** | Toko / layanan | 14 410 |
| **Amazon.fr – Cek Hadiah** | Toko / layanan | 7 205 |
| **Foot Locker – Kartu Hadiah** | Toko / layanan | 14 410 |
| **IKEA FR – Kartu Hadiah** | Toko / layanan | 36 025 |
| **IKEA FR – Kartu Hadiah (desain lain)** | Toko / layanan | 7 200 |
| **Marionnaud – Kartu Hadiah** | Toko / layanan | 14 410 |
| **Asos – Kartu Hadiah** | Toko / layanan | 14 410 |
| **Adidas FR – Kartu Hadiah** | Toko / layanan | 14 410 |
| **Deliveroo France – Kartu Hadiah** | Toko / layanan | 21 615 |
| **H&M France – Kartu Hadiah** | Toko / layanan | 14 410 |
| **Global Hotel Card (Expedia Group)** | Toko / layanan | 7 205 |
| **Uber Eats France – Kartu Hadiah** | Toko / layanan | 36 025 |

Sekarang setelah kamu memahami manfaat program ini, mari kita bahas tentang botting.

---

## Pengujian awal

Sebelum membangun bot, saya ingin memastikan bahwa IP saya tidak akan ditandai karena telah menggunakan ratusan akun dari alamat yang sama. Kamu tahu saya, saya akan menggunakan Tor dengan proxy rotasi. Dan saya tidak ingin menghosting bot di VPS -- saya ingin bot berjalan di GitHub Action.

Jadi saya menulis workflow sederhana:

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

Workflow ini hanya menginstal Tor, menjalankannya, dan membuat permintaan curl melaluinya.

Jalankan pertama memberikan hasil ini:  
![Tor curl first run](assets/20260313_140705_image.png)

Statistik waktunya adalah:  
!Timings

Jalankan kedua memberikan hasil ini:  
![Tor curl second run](assets/20260313_140928_image.png)

Seperti yang kamu lihat, IP-nya berbeda, jadi kita tidak akan ditandai karena penggunaan berlebihan dari IP yang sama. Kabar baik -- kita bisa lanjut mengembangkan bot farming.

---

## Pengujian pertama dengan Selenium

Untuk mengotomatiskan antarmuka, saya akan menggunakan **Selenium**: sebuah alat yang mengontrol peramban sungguhan (Chrome/Edge/Firefox) sebagai pengganti pengguna. Dalam konteks GitHub Action, ini berarti menginstal peramban + driver-nya, lalu menjalankan skrip yang terhubung ke Microsoft Rewards dan mengklik di tempat yang diperlukan.

### Contoh skrip JavaScript (Node.js + selenium-webdriver)

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

Hasil skrip:

```
DevTools listening on ws://127.0.0.1:50274/devtools/browser/37b9ea79-0e5d-4673-9e91-7ffeaf0d37f8
After navigation: url= https://rewards.bing.com/welcome?idru=%2F
After navigation: title= Selamat datang di Microsoft Rewards!
Page loaded, sign in button found: Masuk
```

Ok, itu berarti kita belum login, jadi sekarang kita akan membangun permintaan login dan melihat apakah kita bisa masuk ke akun Microsoft Rewards kita untuk melakukan aktivitas.
<!-- ## ARTIKEL INI MASIH DALAM PROSES PENULISAN, SAYA AKAN MEMPERBARUI DENGAN LANGKAH-LANGKAH LOGIN DAN PEMBOTAN AKTIVITAS SEGERA! TETAP IKUTI PERKEMBANGANNYA. -->
