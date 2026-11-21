---
title: Bagaimana cara kerja blog ini?
description: "Di balik layar blog : React, Vite, Markdown, pipeline CI/CD
  dan alur penulisan."
date: 2026-03-08
aiGenerated: true
tags:
  - react
  - meta
  - blog
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "lJlFktVMKxREhEXXFaiy5OKtlQGfF34JeF2bg9QxKZvRU9lRnaNKCSkHgBQ9vuuCsgD8FivXkHuP93vzBNV4fQ=="
---

# Bagaimana Cara Kerja Blog Ini?

Pernah bertanya-tanya bagaimana blog ini bekerja di balik kapnya? Dalam artikel ini, saya akan merinci seluruh arsitektur aplikasinya, dari stack teknis sampai proses menulis artikel. Dan ya, saya bahkan akan menunjukkan cara saya menulis artikel dari VS Code!

## Stack Teknis

Blog ini dibangun dengan teknologi web modern :

- **React 19** : untuk antarmuka pengguna
- **TypeScript** : untuk kode bertipe dan lebih andal
- **Vite** : sebagai alat build super cepat
- **React Router v7** : untuk navigasi antar halaman
- **react-markdown** : untuk mengubah Markdown menjadi HTML
- **rehype-raw + rehype-sanitize** : untuk mengizinkan HTML mentah di Markdown dengan aman


## Struktur Proyek

Beginilah tampilan pohon proyeknya :

![](assets/how-this-blog-works/project-structure.png)

```
├── .github/
│   └── workflows/
│       └── deploy.yml              ← Pipeline CI/CD
├── public/
│   ├── home.md                     ← Isi halaman beranda
│   ├── portfolio.md                ← Isi portofolio
│   └── articles/
│       ├── index.json              ← Daftar semua artikel
│       ├── hello-world.md          ← Un article
│       ├── how-this-blog-works.md  ← Cet article !
│       └── assets/                 ← Gambar artikel
├── src/
│   ├── main.tsx                    ← Titik masuk React
│   ├── App.tsx                     ← Router utama
│   ├── components/
│   │   ├── Header.tsx              ← Bilah navigasi
│   │   └── Footer.tsx              ← Kaki halaman
│   └── pages/
│       ├── Home.tsx                ← Halaman beranda
│       ├── BlogList.tsx            ← Daftar artikel
│       ├── Article.tsx             ← Pembaca artikel
│       ├── Portfolio.tsx           ← Halaman portofolio
│       └── NotFound.tsx            ← Halaman 404
└── vite.config.ts                  ← Konfigurasi Vite
```

Ide sentralnya sederhana : **konten dipisahkan dari kode**. Halaman ditulis dalam Markdown di folder `public/`, dan kode React di `src/` mengurus menampilkannya. Saya memegang pemisahan ini : ia membuat konten mudah dibaca ulang dan kode mudah dikembangkan.

## Sistem Routing

Berkas `App.tsx` mendefinisikan semua rute aplikasi dengan React Router :

![](assets/20260308_153440_image.png)


| Route         | Page      | Description                                |
| --------------- | ----------- | -------------------------------------------- |
| `/`           | Home      | Halaman beranda, memuat `home.md`            |
| `/blog`       | BlogList  | Daftar semua artikel                  |
| `/blog/:slug` | Article   | Satu artikel, memuat `articles/{slug}.md`     |
| `/portfolio`  | Portfolio | Halaman portofolio, memuat `portfolio.md`       |
| `*`           | NotFound  | Halaman 404 untuk URL tak dikenal            |

Setiap halaman punya peran yang jelas : ia mengambil berkas Markdown, mengubahnya menjadi HTML dengan `react-markdown`, dan menampilkannya di layar.

## Bagaimana Cara Kerja Sebuah Artikel?

Ini bagian favorit saya! Berikut siklus hidup sebuah artikel :

### 1. Berkas `index.json`

Semua artikel direferensikan di `public/articles/index.json`. Setiap entri berisi metadata artikel :

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

- **slug** : pengenal unik, dipakai di URL (`/blog/hello-world`)
- **title** : judul yang ditampilkan di daftar
- **description** : ringkasan pendek
- **date** : tanggal publikasi

### 2. Berkas Markdown

Isi artikel adalah berkas `.md` sederhana di `public/articles/`. Nama berkas cocok dengan `slug` yang didefinisikan di `index.json`.

![](assets/20260308_153509_image.png)

Kamu bisa menaruh apa pun di sana : judul, daftar, gambar, tabel, bahkan HTML mentah berkat `rehype-raw` !

### 3. Render Sisi React

Ketika kamu mengunjungi `/blog/hello-world`, inilah yang terjadi :

1. React Router mengambil parameter `slug` dari URL
2. Komponen `Article.tsx` memuat `/articles/hello-world.md`
3. Markdown diubah menjadi HTML oleh `react-markdown`
4. Tautan ke `assets/` otomatis ditulis ulang ke `/articles/assets/`
5. Secara paralel, metadata dimuat dari `index.json` untuk menampilkan tanggal dan deskripsi

Sesederhana itu!

## Halaman Beranda dan Portofolio

Halaman Beranda dan Portofolio bekerja persis dengan cara yang sama : mereka memuat berkas Markdown (`home.md` atau `portfolio.md`) dan me rendernya menjadi HTML.

Kekhasannya adalah mereka memakai skema sanitization kustom yang mengizinkan atribut `class` dan `style` pada semua elemen HTML. Itu memungkinkan saya menulis HTML bergaya langsung di Markdown, seperti galeri gambar misalnya.

## Header dan Footer

Header disematkan di atas halaman dengan `position: fixed`. Ia berisi :

- Avatar GitHub saya (dimuat langsung dari `github.com/fox3000foxy.png`)
- Judul blog
- Tautan navigasi : Beranda, Blog, Portofolio

Footer minimalis : hanya copyright dengan tahun berjalan yang dihitung dinamis.

## Tema Gelap

Situs tetap dalam mode gelap permanen. Saya membuat pilihan ini dengan sengaja agar bacaan tetap nyaman di malam hari : `color-scheme: dark` didefinisikan dalam gaya global, dengan latar hitam `#000` dan teks putih `#fff`. Tautan berwarna biru (`#64b5f6`) dan menjadi hijau saat dihover (`#81c784`).

## Cara Saya Menulis Artikel

Masuk ke praktik! Berikut workflow saya untuk menulis artikel baru :

### Langkah 1 : Membuat Berkas Markdown

Saya membuka VS Code dan membuat berkas `.md` baru di `public/articles/` :

### Langkah 2 : Menulis Isi

Saya menulis isi artikel langsung dalam Markdown. VS Code punya pratinjau Markdown bawaan yang bagus :

![](assets/20260308_153613_image.png)

Untuk gambar, saya menaruhnya di `public/articles/assets/` dan mereferensikannya dengan sintaks Markdown standar :

```markdown
![description](assets/my-image.png)
```

Komponen `Article.tsx` otomatis menulis ulang path `assets/` ke `/articles/assets/` supaya gambar tampil dengan benar.

### Langkah 3 : Mencatat Artikel di index.json

Setelah artikel selesai, saya menambahkannya di `public/articles/index.json` supaya muncul di daftar blog :

![](assets/20260308_153629_image.png)

### Langkah 4 : Menguji Secara Lokal

Saya menjalankan server pengembangan Vite :

```bash
pnpm dev
```

Vite menyala dalam beberapa milidetik dan saya bisa melihat artikel saya waktu nyata di `localhost:5173`. Kecepatan ini memungkinkan saya memeriksa setiap perubahan hampir seketika :

![](assets/20260308_153703_image.png)

### Langkah 5 : Menerbitkan

Satu `git push` saja cukup! Pipeline CI/CD mengurus sisanya otomatis.

## Pipeline Deployment CI/CD

Saya menyiapkan pipeline **GitHub Actions** lengkap yang mengotomatisasi lint, build, dan deployment situs di setiap push ke `main`. Mari lihat detailnya.

Workflow ada di `.github/workflows/deploy.yml` dan dibagi dua job : **build** dan **deploy**.

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

Pipeline berjalan di setiap **push** ke `main` dan setiap **pull request** yang menarget `main`. Jadi PR diverifikasi (lint + build) sebelum di merge, tapi hanya push ke `main` yang memicu deployment.

### Job 1 : Build

Job build berjalan di `ubuntu-latest` dan mengikuti langkah ini :

1. **Checkout** : Clone repositori dengan seluruh riwayat (`fetch-depth: 0`)
2. **Setup pnpm** : Memasang versi terbaru pnpm dengan `pnpm/action-setup@v4`
3. **Setup Node.js 20** : Mengonfigurasi Node dengan cache pnpm aktif untuk instalasi lebih cepat
4. **Install dependencies** : Menjalankan `pnpm install --frozen-lockfile` untuk menjamin build yang bisa direproduksi (tidak ada modifikasi lockfile yang diizinkan)
5. **Lint** : Menjalankan `pnpm run lint` (ESLint) untuk memeriksa kualitas kode sebelum build
6. **Build** : Menjalankan `pnpm run build`, yang pertama memeriksa tipe TypeScript (`tsc -b`) lalu membundel semuanya dengan Vite
7. **Upload artifact** : Mengunggah folder `dist/` sebagai artefak build untuk job deployment

Kalau satu langkah gagal (error lint, tipe, atau build), seluruh pipeline berhenti dan tidak ada yang di deploy. Penjagaan ini melindungi saya dari kode rusak di produksi dan saya mengandalkannya di setiap push.

### Job 2 : Deploy

Job deployment hanya berjalan kalau :

- Job build berhasil (`needs: build`)
- Eventnya **push** (bukan PR)
- Branchnya **main**

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

Lalu ia melanjutkan :

1. **Mengunduh artefak build** : Mengambil folder `dist/` yang dihasilkan job build
2. **Mengonfigurasi GitHub Pages** : Menyiapkan lingkungan Pages
3. **Mengunggah ke Pages** : Menyiapkan folder `dist/` untuk GitHub Pages
4. **Mendeploy** : Menerbitkan situs dengan `actions/deploy-pages@v4`

### Tabel Lengkap

Inilah yang terjadi dari penulisan hingga deployment :

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
      Online di GitHub Pages !
```

Seluruh proses memakan waktu sekitar satu menit antara push dan online. Saya menerbitkan dengan satu `git push`, semuanya tetap otomatis tanpa lewat FTP maupun SSH.

## Build Produksi

Di balik kapnya, perintah `pnpm build` menjalankan :

1. `tsc -b` : Memeriksa tipe TypeScript
2. `vite build` : Membundel dan mengoptimalkan seluruh kode

Vite menghasilkan berkas yang diminifikasi dan dioptimalkan dengan code-splitting otomatis. Hasilnya adalah situs statis super cepat.

## Kenapa Arsitektur Ini?

Saya bisa saja memakai CMS, pembangkit situs statis seperti Hugo atau Jekyll, atau bahkan Next.js. Tapi inilah kenapa saya memilih pendekatan ini :

- **Kesederhanaan** : Tulis dalam Markdown, push ke GitHub, online
- **Kontrol total** : Tidak ada ketergantungan pada CMS atau basis data
- **Performa** : Vite + React = pemuatan cepat
- **Fleksibilitas** : Saya bisa mencampur Markdown dan HTML sesuka saya
- **Pembelajaran** : Ini proyek bagus untuk menguasai React dan TypeScript
- **CI/CD** : Pemeriksaan kualitas dan deployment otomatis dengan GitHub Actions

## Kesimpulan

Blog ini proyek sederhana tapi dipikirkan matang : Markdown untuk konten, React untuk render, Vite untuk performa, GitHub Actions untuk CI/CD, dan GitHub Pages untuk hosting. Ia hanya bersandar pada berkas statis yang disajikan efisien, dengan pipeline otomatis yang menjamin kualitas di setiap push.


Terima kasih sudah membaca, dan sampai jumpa di artikel berikutnya! 🦊
