---
title: Membot peternakan Microsoft Rewards
description: Bagaimana saya mengoding bot untuk memanen poin Microsoft Rewards dalam
  skala besar -- dan kenapa Microsoft sejak itu memperkuat pertahanannya.
date: 2026-03-13
tags:
  - automation
  - javascript
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "2UoGwed/fdgplSeh5MTNK6FfAhEumCkV3/0MDKfcETHTsVTTSuTEFgABONy3tNaml2+C4BwmbmC4EHMaMEKaRg=="
---

> **Catatan (2026) :** Proyek ini tidak lagi dipelihara. Microsoft telah memperkuat deteksi anti-botnya secara signifikan, jadi apa yang berhasil waktu itu sudah tidak berfungsi hari ini. Kode dan pendekatan yang dijelaskan di bawah disimpan untuk tujuan pengarsipan dan demonstrasi saja.

## Pendahuluan

Saya menemukan Microsoft Rewards beberapa tahun lalu. Waktu itu pas penguncian, dan saat itu saya wajib memakai kontrol orang tua Microsoft Family Safety sehingga harus lewat Edge. Di sanalah saya menemukan Rewards.

Waktu itu saya baru 14 tahun dan tidak ada yang menarik di katalognya. Sekarang saya berpikir dengan keterampilan yang saya peroleh, saya bisa memanen poin dengan bot, lalu memberikan kodenya atau bahkan menjualnya kembali lebih murah kalau saya benar-benar mau (tapi sejujurnya, saya kira tidak akan melakukannya). Saya akan menceritakan bagaimana saya mengoding bot yang memanen akun dalam skala besar.

---

## Apa itu Microsoft Rewards?

Singkatnya : ini program yang menghadiahi pengguna Edge dengan poin untuk aktivitas seperti pencarian, kuis kecil, permainan, dan ekstensi (tapi itu cerita lain).

Kamu lihat di sini blok "Explore" :
![Explore screenshot](assets/20260313_135010_image.png)

Di sana misalnya yang mereka sebut "set harian".
![Daily set screenshot](assets/20260313_135038_image.png)

Mereka bahkan membuat sistem streak, cukup gila.
![Streak screenshot](assets/20260313_135210_image.png)

Ada juga sistem level dan progresnya membuat rutinitas benar-benar adiktif :
![Level screenshot](assets/20260313_135340_image.png)

Jadi kamu punya banyak cara mendapatkan poin, dan sebagian besar harian.
Idenya di sini adalah membuat bot yang melakukan aktivitas itu menggantikanmu, untuk memanen poin dalam skala besar dan melengkapi rutinitas panenmu.

Seperti bisa kamu lihat di bawah, sebagian besar hadiah adalah kartu hadiah, tapi ada juga opsi menarik seperti permainan atau langganan.
![Rewards screenshot](assets/20260313_135646_image.png)

| Hadiah | Kategori | Biaya dalam poin |
| --- | --- | --- |
| **Rakuten TV – 1 film HD** | Konten digital | 1 785 |
| **Roblox (kartu digital)** | Game / konten digital | 6 750 |
| **Kartu hadiah Microsoft** | Toko / layanan | 5 660 |
| **Kartu hadiah Xbox** | Toko / layanan | 5 660 |
| **Kartu hadiah Microsoft Solitaire Collection** | Game / konten digital | 1 500 |
| **Minecraft Minecoins** | Game / konten digital | 2 500 |
| **Kartu hadiah League of Legends** | Game / konten digital | 2 000 |
| **Kode Overwatch coins (digital)** | Game / konten digital | 2 000 |
| **Sea of Thieves – Pack Pièces anciennes** | Game / konten digital | 1 700 |
| **Zalando – Kartu hadiah** | Toko / layanan | 7 205 |
| **Carrefour – Kartu hadiah** | Toko / layanan | 14 410 |
| **Cultura – Kartu hadiah** | Toko / layanan | 14 410 |
| **Fnac‑Darty – Kartu hadiah** | Toko / layanan | 14 410 |
| **La Redoute – Kartu hadiah** | Toko / layanan | 14 410 |
| **Mango – Kartu hadiah** | Toko / layanan | 36 025 |
| **Wonderbox – Kartu hadiah** | Toko / layanan | 14 410 |
| **Yves Rocher – Kartu hadiah** | Toko / layanan | 14 410 |
| **Amazon.fr – Cek hadiah** | Toko / layanan | 7 205 |
| **Foot Locker – Kartu hadiah** | Toko / layanan | 14 410 |
| **IKEA FR – Kartu hadiah** | Toko / layanan | 36 025 |
| **IKEA FR – Kartu hadiah (desain lain)** | Toko / layanan | 7 200 |
| **Marionnaud – Kartu hadiah** | Toko / layanan | 14 410 |
| **Asos – Kartu hadiah** | Toko / layanan | 14 410 |
| **Adidas FR – Kartu hadiah** | Toko / layanan | 14 410 |
| **Deliveroo France – Kartu hadiah** | Toko / layanan | 21 615 |
| **H&M France – Kartu hadiah** | Toko / layanan | 14 410 |
| **Global Hotel Card (Expedia Group)** | Toko / layanan | 7 205 |
| **Uber Eats France – Kartu hadiah** | Toko / layanan | 36 025 |

Sekarang kamu paham menariknya program ini, mari tertarik pada botting.

---

## Tes pertama

Sebelum membangun bot saya, saya ingin memastikan IP saya tidak ditandai karena memakai ratusan akun dari alamat yang sama. Kamu kenal saya, saya lewat Tor dengan proxy berputar. Saya ingin menjalankannya di GitHub Action alih-alih di VPS.

Jadi saya menulis workflow sederhana :

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

Workflow ini cuma menginstal Tor, menjalankannya, dan membuat permintaan curl melaluinya.

Run pertama memberikan hasil ini :
![Tor curl first run](assets/20260313_140705_image.png)

Statistik waktunya adalah :
!Timings

Run kedua memberikan hasil ini :
![Tor curl second run](assets/20260313_140928_image.png)

Seperti bisa kamu lihat, IP-nya berbeda, jadi kita menghindari penandaan karena penyalahgunaan dari IP yang sama. Kabar baik : kita bisa lanjut mengembangkan bot panennya.

---

## Tes pertama dengan Selenium

Untuk mengotomatisasi antarmuka, saya akan memakai **Selenium** : alat yang mengendalikan peramban sungguhan (Chrome/Edge/Firefox) menggantikan pengguna. Dalam konteks GitHub Action, artinya menginstal peramban + drivernya, lalu menjalankan skrip yang masuk ke Microsoft Rewards dan mengklik yang perlu.

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
  // Menyuntikkan skrip sebelum JS halaman apa pun berjalan untuk mengurangi sidik jari otomatisasi.
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

Hasil skripnya :

```
DevTools listening on ws://127.0.0.1:50274/devtools/browser/37b9ea79-0e5d-4673-9e91-7ffeaf0d37f8
After navigation: url= https://rewards.bing.com/welcome?idru=%2F
After navigation: title= Bienvenue dans Microsoft Rewards!
Page loaded, sign in button found: Se connecter
```

Hasil ini memastikan kita masih keluar, jadi sekarang saya akan membangun permintaan login dan menguji koneksi ke akun Microsoft Rewards saya untuk mengotomatisasi aktivitas.
<!-- ## ARTIKEL INI MASIH DALAM PENULISAN, SAYA AKAN MEMPERBARUI DENGAN LANGKAH LOGIN DAN BOTTING AKTIVITAS SEGERA! TETAP PANTAU. -->
