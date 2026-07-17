---
title: "Saya membangun honeypot Express yang sangat realistis"
description: "328 endpoint palsu dengan respons yang dihasilkan saat itu juga, spoofing header, pencatatan lalu lintas bot -- menyelami kode middleware honeypot Express yang dirancang untuk menipu pemindai."
date: "2026-06-10"
aiGenerated: true
authors:
  - fox3000foxy
tags:
  - express
  - nodejs
  - security
  - honeypot
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "bIFnlfK/jhw+jyaOOqXS9cZeONGodo38K21uhrNzoXpEnyLq5qciq9EwqnYYaKFxhK/5mLK544wnjEqs0dXWOg=="
---

## Idenya

Bot dan pemindai otomatis terus-menerus memindai aplikasi web untuk mencari kerentanan. Mereka mencari file `.env`, panel admin, cadangan basis data, kredensial SSH -- apa pun yang dapat dieksploitasi.

Alih-alih hanya mengembalikan 404, saya ingin membuat sesuatu yang lebih menarik: sebuah **honeypot Express** yang merespons dengan konten kredibel, membuat penyerang percaya bahwa mereka telah menemukan target yang rentan.

## Fungsinya

Middleware ini mengekspos **328 endpoint** yang dibagi menjadi dua varian (default dan lengkap). Setiap permintaan menerima respons unik yang dihasilkan saat itu juga dengan stempel waktu dan ID permintaan baru, meniru server sungguhan.

## Memulai

```bash
npm install express-middleware-honeypot
```

Penggunaan dasar dengan pendaftaran otomatis:

```js
const express = require("express");
const { createHoneypot } = require("express-middleware-honeypot");

const app = express();

const instance = createHoneypot({
    knownPaths: ["/", "/login", "/support"],
    knownPatterns: [/^\/blogs\/[^/]+$/],
    knownApiPaths: ["/api/cart", "/api/cart/list"],
    knownApiPatterns: [/^\/api\/cart\/[^/]+$/],
    logTraffic: true,
    is404Handler: true,
    isCompleteResponses: false,
});

instance.register(app);

app.listen(3000, () => {
    console.log("Server berjalan di port 3000");
});
```

## Cara kerjanya

### Generasi saat itu juga

Tidak ada file tiruan di disk. Layanan `mockupGenerator.ts` membuat setiap respons pada saat permintaan dengan:

- Stempel waktu dan ID permintaan yang unik
- Konten yang disesuaikan dengan endpoint (kredensial, konfigurasi, halaman login, respons API)
- Header HTTP realistis dengan spoofing `X-Powered-By` dinamis

### Spoofing header

`headersMiddleware` secara dinamis memilih header `X-Powered-By` berdasarkan ekstensi jalur:

- `.php` → `X-Powered-By: PHP/8.1.12`
- `.jsp` → `X-Powered-By: JSP/3.0`
- `.aspx/.ashx/.asmx` → `X-Powered-By: ASP.NET`
- `.do/.action` → `X-Powered-By: Servlet/3.0`
- Jalur lainnya → tanpa header `X-Powered-By`

### 328 endpoint

| Tipe | Contoh endpoint |
|---|---|
| Kebocoran kredensial | `.env`, `secrets.json`, `aws/credentials`, `etc/shadow` |
| Kunci SSH | `.ssh/id_rsa`, `.ssh/id_ed25519` |
| Konfigurasi basis data | `config/database`, `wp-config.php`, `docker-compose.yml` |
| Panel admin | `/admin`, `/wp-admin`, `/manage/account/login` |
| Respons API | `/api/version`, `/api/config`, `.do`, `.ashx` |
| Phising perbankan | `/lander/sber*`, `/index_sber.php` |
| Detak jantung C2 | Jalur acak 6+ karakter (`/262LBNFp`, `/Kd67Fq1x`) |
| Saham/Kripto | `/stock/mzhishu`, `/kline/1m/1`, `/m/allticker/1` |
| Judi/Game | `/proxy/games`, `/Ctrls/GetSysCoin`, `/room/getRoomBangFans` |
| File konfigurasi | `config.json`, `config.yml`, `sitemap.xml`, `ads.txt` |
| Halaman arahan | `/about`, `/contact`, `/products`, `/blog` |

### Spoofing PHP

`instance.phpSpoofer` mencegat permintaan `*.php` dan memproksinya ke server pengembangan lokal Anda, mengembalikan output PHP asli alih-alih tiruan statis.

### Pencatatan lalu lintas

Lalu lintas dapat dicatat dalam format JSON-lines ke `traffic.txt`. Rute tidak dikenal yang belum ditangani dapat diekstraksi melalui `GET /newBotsRoute`.

## API HoneypotInstance

```ts
interface HoneypotInstance {
  mocks: Record<string, Middleware>;
  middleware: Middleware;
  headersMiddleware: Middleware;
  phpSpoofer: Middleware;
  notFoundHandler: Middleware;
  register(app: RouteApp): void;
  getUnhandledRoutes(): Promise<string[]>;
  getNotCoveredEndpoints(): string[];
}
```

## Mengapa efektif

Pemindai otomatis mengharapkan situs yang rentan memiliki file tertentu. Dengan merespons dengan konten nyata, bukan 404, honeypot dapat:

1. **Membuang waktu** penyerang untuk menganalisis hasil palsu
2. **Merekam jejak mereka** untuk analisis nanti
3. **Mengalihkan perhatian** dari kerentanan yang sebenarnya
4. **Mengungkap pola serangan baru** melalui rute yang tidak ditangani

## Kesimpulan

Kode sumber lengkap tersedia di GitHub di [github.com/anomalyco/express-honeypot-middleware](https://github.com/anomalyco/express-honeypot-middleware). Silakan coba, buka issue, atau berkontribusi.
