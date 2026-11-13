---
title: "Saya membangun honeypot Express yang sangat realistis"
description: "328 endpoint palsu dengan respons yang dibangkitkan langsung, spoofing header, logging trafik bot -- menyelami middleware honeypot Express yang dirancang untuk mengecoh pemindai."
date: 2026-06-10
aiGenerated: true
tags:
  - express
  - nodejs
  - security
  - honeypot
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "jg4v5wkOjAYpCRW9D9gS8+gjAcWKndFkgERLXzC8A52IZxqHSXuzCIYCLJUN9B4Xl8SWIbYhbDRFiOPh55uQBQ=="
---

## TL;DR

Saya membuat middleware Express yang mengekspos **328 endpoint tiruan** dengan pilihan dua varian : `default` (respons singkat tapi kredibel) dan `complete` (respons sangat detail). Setiap respons **dibangkitkan langsung** dengan timestamp dan ID permintaan yang segar, sehingga setiap respons unik. Tidak ada berkas mock di disk. Middleware juga bisa **mencatat trafik** ke berkas teks dan mengekspos rute yang tidak tertangani di `/newBotsRoute` untuk menganalisis apa yang dicari bot.

**Ini jauh lebih dari sekadar mengembalikan 404.** Saya merancang karya rekayasa ini agar menyerupai server sungguhan, supaya pemindai membuang waktu di atasnya. Saya tunjukkan cara kerjanya.

## Masalahnya

Bot keamanan, scraper, dan pelaku jahat terus-menerus memindai server web mencari rute umum :

- `.env`, `wp-config.php`, `admin/`, `phpinfo.php`, dll.
- endpoint API seperti `/api/version`, `/api/config`
- berkas konfigurasi : `dump.sql`, `.git/config`, `docker-compose.yml`
- halaman phishing bank : `/lander/sberbank*`, `/index_sber.php`

Saya melihat batas ini di server saya sendiri : mengembalikan 404 atau 403 langsung memberi tahu pemindai bahwa rute tidak ada, jadi ia lanjut ke berikutnya. Saya memilih kebalikannya dengan honeypot ini : **membuat pemindai percaya semuanya ada**, supaya ia kehilangan waktu pada respons palsu sementara server aslimu tetap terlindungi di balik rute yang kamu kenal.

## Arsitekturnya

### 1. Pengklasifikasi, bukan tabel lookup

Bagian utamanya adalah fungsi `classify()` di `src/services/mockupGenerator.ts` yang menerima path endpoint dan mengembalikan pembangkit respons. Saya membangunnya sebagai kaskade aturan :

1. **Kecocokan persis** : endpoint paling umum punya pembangkit khusus
2. **Kecocokan pola** : regex pada path untuk mendeteksi pola seperti `id_rsa`, `wp-admin`, `sitemap.xml`
3. **Klasifikasi cerdas** : path seperti `/262LBNFp` (6+ karakter acak) diklasifikasikan sebagai "detak jantung C2"
4. **Aturan sapu bersih** : path API, berkas `.php`, `.html`, `.js`, `.json` dan `.asmx` punya pembangkit generik
5. **Catchall terakhir** : `genCatchall()` menghasilkan respons JSON generik dengan metadata

Saya suka pendekatan ini karena respons tetap **segar di setiap permintaan** : tidak ada berkas statis, tidak ada caching, setiap respons membawa timestamp sendiri seolah berasal dari server sungguhan.

### 2. Sistem varian ganda

Setiap pembangkit mendukung dua varian :

```typescript
type Variant = "default" | "complete";
```

- **`default`** : respons ringkas tapi kredibel. Contoh untuk `.env` :
  ```
  DB_HOST=localhost
  DB_USER=root
  DB_PASS=s3cur3P@ss
  APP_ENV=development
  APP_DEBUG=true
  ```

- **`complete`** : respons sangat detail. Contoh untuk `.env` :
  ```
  # Database
  DB_CONNECTION=mysql
  DB_HOST=db-master-01.internal.example.com
  DB_PORT=3306
  DB_DATABASE=production_app_v2
  DB_USER=admin_service
  DB_PASS=mM9k#2$xL!qR7pZ

  # Redis
  REDIS_HOST=redis-cluster-01.internal.example.com
  REDIS_PORT=6379
  REDIS_PASSWORD=R3d!s_S3cur3_K3y_2025

  # App
  APP_ENV=production
  APP_DEBUG=false
  APP_URL=https://admin.internal.example.com
  APP_KEY=base64:qJ3fR8mL2pX5vB7nC4kA9wE1yH6sD0tG
  ...
  ```

Varian `complete` juga menyertakan halaman HTML lengkap dengan CSS bergaya : halaman administrasi, layar login WordPress, halaman phishing bank berbahasa Rusia, dll. Menurut saya ia mematikan kalau kamu benar-benar ingin menyibukkan pemindai.

### 3. Pembangkitan langsung

Saya memakai `Date.now()` dan `Date().toISOString()` untuk menghasilkan timestamp dan ID permintaan unik di setiap panggilan. Berikut fungsi pengayaannya :

```typescript
function enrichResponse(response: Record<string, unknown>): Record<string, unknown> {
  return {
    ...response,
    timestamp: getTimestamp(),
    version: "1.0",
    lastUpdated: getTimestamp(),
  };
}
```

Untuk respons JSON, middleware mencoba mem parsing dan memperkaya dengan kolom ini. Respons non-JSON dikembalikan apa adanya.

### 4. Middleware spoofing header

Saya menambahkan middleware khusus yang menetapkan header HTTP realistis tergantung ekstensi berkas yang diminta :

```typescript
res.setHeader("Server", "nginx/1.24.0");
res.setHeader("X-Frame-Options", "SAMEORIGIN");
res.setHeader("X-XSS-Protection", "1; mode=block");
res.setHeader("X-Content-Type-Options", "nosniff");
res.setHeader("X-Robots-Tag", "noindex, nofollow");
res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

// X-Powered-By realistis berdasarkan ekstensi berkas
if (path.endsWith(".php")) res.setHeader("X-Powered-By", "PHP/8.1.12");
else if (path.endsWith(".jsp")) res.setHeader("X-Powered-By", "JSP/3.0");
else if (path.endsWith(".aspx") || path.endsWith(".ashx") || path.endsWith(".asmx"))
  res.setHeader("X-Powered-By", "ASP.NET");
else if (path.endsWith(".do") || path.endsWith(".action"))
  res.setHeader("X-Powered-By", "Servlet/3.0");
```

Ini membuat respons jauh lebih kredibel : endpoint `.php` dengan `X-Powered-By: PHP/8.1.12` dan `Server: nginx/1.24.0` tampak persis seperti server WordPress sungguhan. Saya memegang detail ini karena sering kali headerlah yang mengkhianati server palsu.

### 5. PHP Spoofer

`phpSpoofer` tetap komponen favorit saya. Kalau permintaan datang untuk berkas `.php` dan hostnya localhost, middleware **memproxy** permintaan ke server PHP lokalmu, yang memproses dan mengembalikan halaman PHP sungguhan. Kalau hostnya jarak jauh, ia mengembalikan 404 untuk memblokir upaya SSRF apa pun.

```typescript
const phpSpoofer = async (req, res, next) => {
  if (!req.path?.match(/\.php$/)) return next();
  const host = req.headers?.host;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]")) {
    const baseUrl = req.originalUrl.replace(/\.php.*$/, "");
    const response = await fetch(`http://${host}${baseUrl}`);
    // mengembalikan respons PHP yang nyata
  } else {
    res.status(404).send("404 Not Found");
  }
};
```

Ini memungkinkan, ketika kamu menjalankan WordPress secara lokal, honeypot menyajikan halaman WordPress **sungguhan** kepada bot : realisme maksimal menurut pengalaman saya.

### 6. Pencatatan dan analisis trafik

Saya memisahkan dua tanggung jawab : `TrafficService` mencatat setiap permintaan ke berkas JSON-lines. `UnhandledRoutesService` lalu menganalisis log ini untuk mengidentifikasi path yang diminta bot yang masih perlu dicakup di honeypot.

```typescript
app.get("/newBotsRoute", async (_req, res) => {
  const routes = await unhandledRoutesService.getUnhandledRoutes(
    additionalEndpoints, knownPathOptions
  );
  res.setHeader("Content-Type", "text/plain");
  res.send(routes.join("\n"));
});
```

Saya suka lingkaran umpan balik ini : makin lama kamu membiarkan honeypot berjalan, makin banyak kamu belajar apa yang dicari bot, dan kamu bisa menambahkan path itu ke endpoint yang kamu kenal.

### 7. Endpoint dikenal dan pengecualian

Middleware menerima daftar `knownPaths`, `knownPatterns`, `knownApiPaths` dan `knownApiPatterns`. Rute apa pun yang cocok melewati middleware menuju aplikasi aslimu. Menurut saya filter ini tak tergantikan : endpoint aslimu tetap utuh, honeypot tidak pernah mencegatnya.

```typescript
const matches = (p) => p === endpoint || p.startsWith(endpoint + "/");
```

## 328 endpoint secara detail

Begini klasifikasinya (kutipan dari pengklasifikasi) :

| Kategori | Contoh endpoint |
|---|---|
| Kebocoran kredensial | `.env`, `secrets.json`, `aws/credentials`, `etc/shadow` |
| Kunci SSH | `.ssh/id_rsa`, `.ssh/id_ed25519` |
| Config basis data | `config/database`, `wp-config.php`, `docker-compose.yml` |
| Panel administrasi | `/admin`, `/wp-admin`, `/manage/account/login` |
| Respons API | `/api/version`, `/api/config`, `.do`, `.ashx` |
| Phishing bank | `/lander/sber*`, `/index_sber.php` |
| Detak jantung C2 | Path acak 6+ karakter (`/262LBNFp`) |
| Aksi/Bursa | `/stock/mzhishu`, `/kline/1m/1`, `/m/allticker/1` |
| Game/Kasino | `/proxy/games`, `/Ctrls/GetSysCoin`, `/room/getRoomBangFans` |
| Berkas konfigurasi | `config.json`, `config.yml`, `sitemap.xml`, `ads.txt` |
| Halaman arahan | `/about`, `/contact`, `/products`, `/blog` |

## Kode dan endpoint khusus

Saya menambahkan pembangkit khusus untuk kasus tertentu :

- **`genLanding()`** : halaman phishing bank berbahasa Rusia untuk СберБанк, Тинькофф, Газпромбанк
- **`genC2Heartbeat()`** : respons detak jantung C2 realistis dengan `agent_id`, `group`, `version`
- **`genScannerPath()`** : jebakan untuk pemindai spesifik (port nmap NICE, Hazelcast, CGI)
- **`genChineseApi()`** : respons API Tiongkok dengan `msg: "成功"` (sukses)
- **`genMerchant()`** : profil pedagang dengan `balance`, `fee_rate`, `tier`

## Cara menggunakannya

### Instalasi

```bash
npm install express-middleware-honeypot
```

### Penggunaan dasar dengan pendaftaran otomatis

```javascript
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
app.listen(3000);
```

### Dengan app.use() (middleware sapu bersih tunggal)

```javascript
const { createHoneypot } = require("express-middleware-honeypot");
const app = express();

// Rute aslimu dulu
app.get("/", (req, res) => res.send("Home"));

// Lalu honeypot sapu bersih
const instance = createHoneypot({ /* options */ });
app.use(instance.headersMiddleware);
app.use(instance.middleware);
```

### Respons lengkap vs bawaan

```javascript
// Respons detail dengan halaman HTML lengkap
const instance = createHoneypot({ isCompleteResponses: true });
```

### Pencatatan trafik

```javascript
const instance = createHoneypot({ logTraffic: true });
// Lihat berkas traffic.txt untuk melihat apa yang diminta bot
```

## Kesimpulan

Middleware honeypot Express ini jauh melampaui umpan sederhana. Dengan **328 endpoint**, **pembangkitan langsung**, **spoofing header dinamis**, **pencatatan trafik** bahkan **proxy PHP** untuk respons WordPress sungguhan, saya merancangnya agar tetap serealistis mungkin.

Pemindai kehilangan waktu pada halaman administrasi tiruan, berkas `.env` yang kredibel dan halaman phishing bank sementara aplikasi aslimu tetap terlindungi. Saya terutama menghargai sistem varian ganda dan klasifikasi cerdasnya : setiap respons tetap segar dan sesuai dengan path yang diminta.

Kode sumber tersedia di GitHub : [https://github.com/fox3000foxy/express-honeypot-middleware](https://github.com/fox3000foxy/express-honeypot-middleware)
