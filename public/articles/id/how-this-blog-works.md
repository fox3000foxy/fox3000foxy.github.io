---
title: Bagaimana Cara Kerja Blog Ini?
description: "Di balik layar blog: React, Vite, Markdown, pipeline CI/CD dan alur penulisan."
date: 2026-03-08
aiGenerated: true
authors:
  - fox3000foxy
tags:
  - react
  - meta
  - blog
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "2UpR8cjAnNaYmIPoV3JN3PLUT2ETgILuIvwQo6+szTNSdirFoREzCpZJtfc7zthG8ggBww131mNYzjaBxa1F3w=="
---

# Bagaimana Cara Kerja Blog Ini?

Kamu pernah bertanya-tanya bagaimana blog ini bekerja di balik layar? Di artikel ini, aku akan menjelaskan seluruh arsitektur aplikasi, dari stack teknis hingga proses penulisan artikel. Dan ya, aku bahkan akan menunjukkan cara aku menulis artikel dari VS Code!

## Stack Teknis

Blog ini dibangun dengan teknologi web modern:

- **React 19** -- untuk antarmuka pengguna
- **TypeScript** -- untuk kode yang tertipe dan lebih andal
- **Vite** -- sebagai alat build yang sangat cepat
- **React Router v7** -- untuk navigasi antar halaman
- **react-markdown** -- untuk mengubah Markdown menjadi HTML
- **rehype-raw + rehype-sanitize** -- untuk mengizinkan HTML mentah dalam Markdown dengan aman

Semua dihosting di **GitHub Pages** langsung dari repositori `fox3000foxy.github.io`.

## Struktur Proyek

Berikut adalah struktur direktori proyek:

![](assets/how-this-blog-works/project-structure.png)

```
├── .github/
│   └── workflows/
│       └── deploy.yml              ← Pipeline CI/CD
├── public/
│   ├── home.md                     ← Konten halaman utama
│   ├── portfolio.md                ← Konten portofolio
│   └── articles/
│       ├── index.json              ← Daftar semua artikel
│       ├── hello-world.md          ← Sebuah artikel
│       ├── how-this-blog-works.md  ← Artikel ini!
│       └── assets/                 ← Gambar artikel
├── src/
│   ├── main.tsx                    ← Entry point React
│   ├── App.tsx                     ← Router utama
│   ├── components/
│   │   ├── Header.tsx              ← Bilah navigasi
│   │   └── Footer.tsx              ← Catatan kaki
│   └── pages/
│       ├── Home.tsx                ← Halaman utama
│       ├── BlogList.tsx            ← Daftar artikel
│       ├── Article.tsx             ← Pembaca artikel
│       ├── Portfolio.tsx           ← Halaman portofolio
│       └── NotFound.tsx            ← Halaman 404
└── vite.config.ts                  ← Konfigurasi Vite
```

Ide utamanya sederhana: **konten dipisahkan dari kode**. Halaman ditulis dalam Markdown di folder `public/`, dan kode React di `src/` bertugas menampilkannya.

## Sistem Routing

File `App.tsx` mendefinisikan semua rute aplikasi dengan React Router:

![](assets/20260308_153440_image.png)


| Rute          | Halaman    | Deskripsi                                 |
| --------------- | ----------- | ------------------------------------------- |
| `/`           | Home       | Halaman utama, memuat `home.md`            |
| `/blog`       | BlogList   | Daftar semua artikel                       |
| `/blog/:slug` | Article    | Sebuah artikel, memuat `articles/{slug}.md` |
| `/portfolio`  | Portfolio  | Halaman portofolio, memuat `portfolio.md`  |
| `*`           | NotFound   | Halaman 404 untuk URL yang tidak dikenal   |

Setiap halaman memiliki peran yang jelas: mengambil file Markdown, mengubahnya menjadi HTML dengan `react-markdown`, dan menampilkannya di layar.

## Bagaimana Cara Kerja Sebuah Artikel?

Ini bagian yang paling menarik! Berikut siklus hidup sebuah artikel:

### 1. File `index.json`

Semua artikel direferensikan di `public/articles/index.json`. Setiap entri berisi metadata artikel:

```json
[
  {
    "slug": "hello-world",
    "title": "Hello World",
    "description": "A sample post for Fox's Blog.",
    "date": "2026-03-08"
  }
]
```

- **slug** -- pengidentifikasi unik, digunakan di URL (`/blog/hello-world`)
- **title** -- judul yang ditampilkan di daftar
- **description** -- ringkasan singkat
- **date** -- tanggal publikasi

### 2. File Markdown

Konten artikel adalah file `.md` biasa di `public/articles/`. Nama file sesuai dengan `slug` yang ditentukan di `index.json`.

![](assets/20260308_153509_image.png)

Kamu bisa menaruh apa pun yang kamu mau: judul, daftar, gambar, tabel, dan bahkan HTML mentah berkat `rehype-raw`!

### 3. Render di Sisi React

Saat kamu mengunjungi `/blog/hello-world`, inilah yang terjadi:

1. React Router mengambil parameter `slug` dari URL
2. Komponen `Article.tsx` memuat `/articles/hello-world.md`
3. Markdown diubah menjadi HTML oleh `react-markdown`
4. Tautan ke `assets/` secara otomatis ditulis ulang ke `/articles/assets/`
5. Secara paralel, metadata dimuat dari `index.json` untuk menampilkan tanggal dan deskripsi

Sesederhana itu!

## Halaman Utama dan Portofolio

Halaman Beranda dan Portofolio bekerja persis dengan cara yang sama: mereka memuat file Markdown (`home.md` atau `portfolio.md`) dan merendernya menjadi HTML.

Keunikannya, mereka menggunakan skema sanitasi kustom yang mengizinkan atribut `class` dan `style` pada semua elemen HTML. Ini memungkinkanku menulis HTML bergaya langsung di Markdown, seperti galeri gambar misalnya.

## Header dan Footer

Header disematkan di bagian atas halaman dengan `position: fixed`. Isinya:

- Avatar GitHub-ku (dimuat langsung dari `github.com/fox3000foxy.png`)
- Judul blog
- Tautan navigasi: Beranda, Blog, Portofolio

Footer minimalis: hanya hak cipta dengan tahun berjalan yang dihitung secara dinamis.

## Tema Gelap

Situs ini **selalu dalam mode gelap** -- tanpa toggle siang/malam. Ini adalah pilihan yang disengaja: `color-scheme: dark` ditentukan di gaya global, dengan latar belakang hitam `#000` dan teks putih `#fff`. Tautan berwarna biru (`#64b5f6`) dan berubah menjadi hijau saat dihover (`#81c784`).

## Bagaimana Aku Menulis Artikel

Mari kita praktik! Berikut alur kerjaku untuk menulis artikel baru:

### Langkah 1: Membuat File Markdown

Aku membuka VS Code dan membuat file `.md` baru di `public/articles/`:

### Langkah 2: Menulis Konten

Aku menulis konten artikel langsung dalam Markdown. VS Code memiliki pratinjau Markdown yang sangat baik:

![](assets/20260308_153613_image.png)

Untuk gambar, aku meletakkannya di `public/articles/assets/` dan mereferensikannya dengan sintaks Markdown standar:

```markdown
![description](assets/my-image.png)
```

Komponen `Article.tsx` secara otomatis menulis ulang jalur `assets/` ke `/articles/assets/` agar gambar ditampilkan dengan benar.

### Langkah 3: Mendaftarkan Artikel di index.json

Setelah artikel selesai, aku menambahkannya ke `public/articles/index.json` agar muncul di daftar blog:

![](assets/20260308_153629_image.png)

### Langkah 4: Uji Coba Lokal

Aku menjalankan server pengembangan Vite:

```bash
pnpm dev
```

Vite mulai dalam hitungan milidetik dan aku bisa melihat artikel secara real-time di `localhost:5173`:

![](assets/20260308_153703_image.png)

### Langkah 5: Publikasi

Cukup `git push`! Pipeline CI/CD menangani sisanya secara otomatis.

## Pipeline Deployment CI/CD

Aku menyiapkan pipeline **GitHub Actions** lengkap yang mengotomatiskan lint, build, dan deployment situs setiap kali push ke `main`. Mari kita lihat secara detail.

Workflow-nya ada di `.github/workflows/deploy.yml` dan dibagi menjadi dua job: **build** dan **deploy**.

### Pemicu

```yaml
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
```

Pipeline berjalan setiap **push** ke `main` dan setiap **pull request** yang menuju `main`. Jadi PR diperiksa (lint + build) sebelum digabung, tetapi hanya push ke `main` yang memicu deployment.

### Job 1: Build

Job build berjalan di `ubuntu-latest` dan mengikuti langkah-langkah berikut:

1. **Checkout** -- Meng-clone repositori dengan seluruh riwayat (`fetch-depth: 0`)
2. **Setup pnpm** -- Menginstal versi terbaru pnpm dengan `pnpm/action-setup@v4`
3. **Setup Node.js 20** -- Mengonfigurasi Node dengan cache pnpm yang diaktifkan untuk instalasi yang lebih cepat
4. **Install dependencies** -- Menjalankan `pnpm install --frozen-lockfile` untuk menjamin build yang reprodusibel (tidak ada modifikasi lockfile yang diizinkan)
5. **Lint** -- Menjalankan `pnpm run lint` (ESLint) untuk memeriksa kualitas kode sebelum build
6. **Build** -- Menjalankan `pnpm run build`, yang pertama-tama memeriksa tipe TypeScript (`tsc -b`) lalu membundle semuanya dengan Vite
7. **Upload artifact** -- Mengunggah folder `dist/` sebagai artefak build untuk job deployment

Jika ada langkah yang gagal -- kesalahan lint, tipe, atau build -- seluruh pipeline berhenti dan tidak ada yang di-deploy. Ini melindungi situs produksi dari kode yang rusak.

### Job 2: Deploy

Job deployment hanya berjalan jika:

- Job build berhasil (`needs: build`)
- Event-nya adalah **push** (bukan PR)
- Branch-nya adalah **main**

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

Kemudian melanjutkan:

1. **Mengunduh artefak build** -- Mengambil folder `dist/` yang dihasilkan oleh job build
2. **Mengonfigurasi GitHub Pages** -- Menyiapkan environment Pages
3. **Mengunggah ke Pages** -- Menyiapkan folder `dist/` untuk GitHub Pages
4. **Deploy** -- Mempublikasikan situs dengan `actions/deploy-pages@v4`

### Tabel Lengkap

Berikut yang terjadi dari penulisan hingga deployment:

```
Menulis artikel di VS Code
         ↓
   git add & commit
         ↓
      git push
         ↓
  GitHub Actions terpicu
         ↓
  ┌─────────────────┐
  │   BUILD JOB     │
  │  1. Checkout    │
  │  2. Setup pnpm  │
  │  3. Setup Node  │
  │  4. Install     │
  │  5. Lint ✓      │
  │  6. Build ✓     │
  │  7. Upload dist │
  └────────┬────────┘
           ↓
  ┌─────────────────┐
  │  DEPLOY JOB     │
  │  1. Download    │
  │  2. Configure   │
  │  3. Upload      │
  │  4. Deploy 🚀   │
  └─────────────────┘
           ↓
    Live di GitHub Pages!
```

Seluruh proses memakan waktu sekitar satu menit antara push dan go-live. Tanpa deployment manual, tanpa FTP, tanpa SSH -- cukup `git push` dan selesai.

## Build Produksi

Di balik layar, perintah `pnpm build` menjalankan:

1. `tsc -b` -- Memeriksa tipe TypeScript
2. `vite build` -- Membundle dan mengoptimalkan semua kode

Vite menghasilkan file yang diminifikasi dan dioptimalkan dengan pemisahan kode otomatis. Hasilnya adalah situs statis yang sangat cepat.

## Mengapa Arsitektur Ini?

Aku bisa saja menggunakan CMS, generator situs statis seperti Hugo atau Jekyll, atau bahkan Next.js. Tapi inilah alasan aku memilih pendekatan ini:

- **Kesederhanaan** -- Tulis di Markdown, push ke GitHub, langsung online
- **Kontrol penuh** -- Tanpa ketergantungan pada CMS atau database
- **Kinerja** -- Vite + React = pemuatan cepat
- **Fleksibilitas** -- Aku bisa mencampur Markdown dan HTML sesuka hati
- **Pembelajaran** -- Proyek yang bagus untuk menguasai React dan TypeScript
- **CI/CD** -- Pemeriksaan kualitas dan deployment otomatis dengan GitHub Actions

## Kesimpulan

Blog ini adalah proyek yang sederhana namun dirancang dengan baik: Markdown untuk konten, React untuk rendering, Vite untuk kinerja, GitHub Actions untuk CI/CD, dan GitHub Pages untuk hosting. Tanpa database, tanpa server backend, hanya file statis yang dilayani secara efisien dengan pipeline otomatis yang menjamin kualitas setiap push.

Jika kamu ingin membuat blog sendiri dengan arsitektur serupa, jangan ragu untuk melihat [kode sumber di GitHub](https://github.com/fox3000foxy/fox3000foxy.github.io)!

Terima kasih telah membaca, sampai jumpa di artikel berikutnya! 🦊
