---
title: Mengerjakan Proyek Baru
description: Sekilas tentang proses memulai dan mengembangkan sebuah situs web baru.
date: 2026-03-13
tags:
  - meta
  - webdev
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "bnopOTaNPHT3eXleRLCiNV9QvfutKcYuUUS+/Hy1Dkg2XII2XRzoOib5y2S8ahN/tC14N3XH+3aW4Mgr2eVr+w=="
---

# Proyeknya

Proyek yang sedang saya kerjakan bernama LLJT :

![](assets/20260313_092734_image.png)

Ini situs web yang juga PWA, jadi bisa dipakai seperti aplikasi ponsel. Ia memakai MaterialUI supaya terasa seperti aplikasi telepon sungguhan.
Saya sempat menghabiskan waktu untuk import Mui : saya turun dari 11707 modul menjadi 595 pada akhirnya, dengan mengimpor setiap ikon baris per baris alih-alih import destrukturisasi. Saat itu saya belajar bahwa import destrukturisasi memuat seluruh pustaka ikon, sedangkan import individual hanya memuat ikon yang dipakai.

Nibi adalah bot yang terhubung ke situs web ini.![](assets/20260313_093102_image.png)Penilaiannya memakai Google Forms :
![](assets/20260313_093255_image.png)
Kami memakai pilihan ganda untuk menilai murid-murid kami, dan kami juga memberikan peran Discord, serta emoji dan kanal, kepada murid kami ketika mereka lulus ujian penting.

![](assets/20260313_093707_image.png)

Tujuan proyek ini adalah membantu orang belajar bahasa Jepang bersama kami, karena itu juga sesuatu yang ingin saya lakukan sendiri.
Para murid juga akan membuka kemitraan dengan Crunchyroll dan platform lain, sebagai hadiah atas kemajuan mereka.

Nibi dan situsnya masing-masing dihosting oleh Cloudflare Workers (Interaction URL dengan Hono Server) dan GitHub Pages dengan React.
Kode situsnya tidak open source, tapi Nibi open source, dan kamu bisa menemukannya di [repositori GitHub ini](https://github.com/let-s-Learn-Japanese-Together/nibi). Situsnya tetap privat karena berisi informasi privat, tapi kalau kamu mau tahu cara saya membangunnya, tanya saya di Discord dan saya akan menjelaskan prosesnya dengan senang hati! Ia memakai GitHub Action yang saya buat supaya tidak perlu membayar GitHub Enterprise, ditambah beberapa alat dan teknik lain yang bisa saya jelaskan kalau kamu tertarik!

Beberapa hari terakhir ini, saya sangat menikmati mencari akal-akalan untuk menghosting proyek saya tanpa membayar hosting. Makanya saya menjadikan Nibi bot Interaction Endpoint, supaya bisa dihosting gratis di Cloudflare Workers, dan saya membuat GitHub Action untuk mendeploy situsnya gratis di GitHub Pages. Mencari akal-akalan seperti itu tetap menjadi salah satu bagian paling seru dari ngoding buat saya : harus berpikir dengan cara lain dan membangun solusi kreatif, dan justru tantangan tanpa anggaran itulah yang memotivasi saya!

Memakai GitHub Actions di luar peruntukannya, dan memakai Cloudflare Workers untuk "menghosting" bot, juga cara untuk mempelajari hal baru dan menemukan teknologi baru, seperti hosting cloud. Saya tidak mau lagi membayar hosting.

Saya masih mengerjakannya tapi kamu bisa bergabung ke [server Discord](https://discord.gg/frKZ9cJ4fD) kalau mau mengikuti perkembangannya dan melihat bagaimana ia berkembang, dan mungkin bahkan ikut proyeknya kalau kamu tertarik! Servernya terbuka untuk semua orang, dan kami senang kalau makin banyak orang belajar bahasa Jepang bersama! Kamu akan menemukan tautan undangannya di situs, atau kamu bisa langsung memintanya ke saya!
