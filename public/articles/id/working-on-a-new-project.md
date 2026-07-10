---
title: Bekerja pada Proyek Baru
description: Gambaran umum tentang proses memulai dan mengembangkan situs web baru.
date: 2026-03-13
tags:
  - meta
  - webdev
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "L6zVvVEyad18kwbao7dcA5DNhkP+0tzlH+QkN3AShj4sSQYL9O4atYAZk/k7gh9H/BO8pkEdZfEykVZVKk2EiA=="
---

# Proyek

Proyek yang sedang saya kerjakan bernama LLJT :

![](assets/20260313_092734_image.png)

Ini adalah situs web yang juga merupakan PWA, jadi juga aplikasi mobile. Ia menggunakan MaterialUI untuk memberikan kesan seperti aplikasi telepon sungguhan.
Saya baru-baru ini harus menangani impor Mui, dan saya berhasil mengurangi dari 11707 modul menjadi hanya 595 pada akhirnya, dengan mengimpor setiap ikon secara manual baris per baris, daripada menggunakan impor terdestruktur: saya belajar bahwa ketika melakukan impor terdestruktur, sebenarnya kita memuat seluruh pustaka ikon, padahal jika mengimpornya satu per satu, kita hanya mengimpor yang kita butuhkan.

Nibi adalah bot yang terhubung ke situs web ini.![](assets/20260313_093102_image.png)Sistem penilaiannya didasarkan pada Google Forms :
![](assets/20260313_093255_image.png)
Kami menggunakan QCM untuk mengevaluasi siswa kami, dan kami juga memberikan peran Discord, serta emoji dan saluran, kepada siswa kami jika mereka lulus ujian penting.

![](assets/20260313_093707_image.png)

Tujuan dari proyek ini adalah untuk membantu orang belajar bahasa Jepang bersama kami, karena ini juga sesuatu yang ingin saya lakukan sendiri.
Para siswa juga akan membuka kemitraan dengan Crunchyroll dan platform lainnya, untuk memberi penghargaan atas keterampilan mereka.

Nibi dan situs web masing-masing dihosting oleh Cloudflare Workers (Interaction URL dengan Hono Server) dan GitHub Pages dengan React.
Kode situs web tidak bersifat open source, tetapi Nibi bersifat open source, dan Anda dapat menemukannya di [repositori GitHub ini](https://github.com/let-s-Learn-Japanese-Together/nibi). Situs web tidak bersifat open source karena berisi informasi pribadi, tetapi jika Anda ingin tahu bagaimana saya membuatnya, Anda dapat bertanya kepada saya di Discord atau di tempat lain, dan saya akan dengan senang hati membagikan prosesnya! Situs ini sebenarnya menggunakan GitHub Action yang saya buat agar tidak perlu membayar GitHub Enterprise, dan juga menggunakan banyak alat dan teknik keren lainnya yang dapat saya bagikan jika Anda tertarik!

Beberapa hari terakhir ini, saya sangat suka mencari solusi untuk menghindari menghosting proyek saya dan harus membayar untuk hosting mereka. Itulah mengapa saya membuat Nibi sebagai bot Interaction Endpoint, sehingga bisa dihosting secara gratis di Cloudflare Workers, dan saya juga membuat GitHub Action untuk menyebarkan situs secara gratis di GitHub Pages, agar tidak perlu membayar untuk hostingnya. Menurut saya, mencari solusi adalah salah satu bagian paling menyenangkan dalam coding, dan itu adalah sesuatu yang sangat saya nikmati! Kita benar-benar harus berpikir out of the box dan mencari solusi kreatif untuk masalah, dan itulah yang saya sukai. Ini bukan hanya tentang menulis kode, ini tentang mencari cara untuk membuat semuanya berfungsi tanpa mengeluarkan uang, dan itu adalah tantangan yang sangat saya nikmati!

Menggunakan GitHub Actions dengan cara yang tidak secara khusus dimaksudkan, dan menggunakan Cloudflare Workers untuk "menghosting" bot, juga merupakan cara untuk mempelajari hal-hal baru dan menemukan teknologi baru, seperti cloud hosting, yang juga saya hargai. Saya benar-benar tidak ingin lagi membayar untuk hosting.

Saya masih mengerjakannya tetapi Anda dapat bergabung dengan [server Discord](https://discord.gg/frKZ9cJ4fD) jika Anda ingin mengikuti perkembangannya dan melihat bagaimana proyek ini berkembang, dan mungkin bahkan bergabung dengan proyek jika Anda tertarik! Server ini terbuka untuk semua orang, dan kami ingin lebih banyak orang menemani kami dalam perjalanan belajar bahasa Jepang bersama ini! Anda dapat menemukan tautan undangan di situs web, atau Anda dapat memintanya kepada saya jika Anda mau!
