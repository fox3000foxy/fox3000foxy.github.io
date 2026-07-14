---
title: "Cara Mendapatkan Jubah Apapun di Minecraft Bedrock"
description: "Launcher pihak ketiga, versi lama game, dan pemilih jubah yang tidak pernah belajar bilang tidak. Tutorial lengkap plus penjelasan kemungkinan kenapa ini bekerja."
date: 2026-07-14
tags:
  - minecraft
  - bedrock
  - tutorial
  - reverse-engineering
authors:
  - 9stown
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "+XOTQFeUFpQ9OC4UBFgvoVEqDHefCsQ9/LSTwSjjHf14/jSCz74h9Qtl17x5II1DrFdHRiE4/LfbHQKn2jlXrg=="
---

# Cara Mendapatkan Jubah Apapun di Minecraft Bedrock

Di Java, ada banyak cara berbelit untuk mendapatkan jubah yang seharusnya tidak Anda miliki (lihat artikel `cape-mod`). Di Bedrock, gamenya berbeda, autentikasinya berbeda, tapi tetap ada caranya -- tidak perlu mod, tidak perlu menyentuh paket jaringan apapun. Cukup launcher pihak ketiga dan versi game yang cukup tua sehingga belum memiliki validasi yang diharapkan.

Ini caranya, lalu kita lihat apa yang mungkin terjadi di balik layar.

## Yang Anda butuhkan

- Akun Microsoft yang sudah memiliki Minecraft Bedrock (akun Anda sendiri cukup)
- Launcher Minecraft resmi terinstal
- [BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher), launcher pihak ketiga open source yang memungkinkan Anda menginstal dan menjalankan versi historis Bedrock manapun
- .NET 8.0 Desktop Runtime
- Mode pengembang diaktifkan di Windows

## Langkah 1 -- Instal Bedrock setidaknya sekali dengan launcher resmi

Sebelum melakukan apapun, buka launcher Minecraft resmi, buka tab **Minecraft: Bedrock Edition**, dan klik **Install**. Bedrock harus sudah terinstal dan dijalankan setidaknya sekali melalui jalur resmi sebelum menyentuh BedrockLauncher.

![Instal Bedrock Edition dari launcher resmi](/images/bedrock-cape/bedrock-cape-01-install-bedrock.png)

## Langkah 2 -- Unduh BedrockLauncher

Pergi ke halaman rilis GitHub proyek ini. Ambil zip versi terbaru yang tercantum di **Assets**.

![Halaman rilis GitHub BedrockLauncher](/images/bedrock-cape/bedrock-cape-02-github-release.png)

## Langkah 3 -- Ekstrak arsip

Setelah zip terunduh, ekstrak ke folder `Downloads` Anda (atau di manapun, asal Anda bisa menemukan foldernya nanti).

![Ekstrak arsip BedrockLauncher](/images/bedrock-cape/bedrock-cape-03-extract-zip.png)

## Langkah 4 -- Jalankan file eksekusinya

Masuk ke folder hasil ekstrak dan jalankan `BedrockLauncher.exe`.

![Menjalankan BedrockLauncher.exe](/images/bedrock-cape/bedrock-cape-04-run-exe.png)

## Langkah 5 -- Instal .NET Desktop Runtime dan aktifkan mode pengembang

Saat pertama kali dijalankan, Windows kemungkinan besar akan meminta **.NET 8.0 Desktop Runtime** -- instal. Anda juga perlu mengaktifkan **mode pengembang** di `Pengaturan > Sistem > Untuk pengembang`, karena BedrockLauncher menginstal game sebagai paket lepas (file mentah, bukan paket Store asli yang ditandatangani), dan Windows menolak instalasi seperti ini tanpa mode itu.

![Instal .NET Runtime dan aktifkan mode pengembang](/images/bedrock-cape/bedrock-cape-05-dotnet-devmode.png)

## Langkah 6 -- Buat instalasi baru

Luncurkan lagi BedrockLauncher, masuk dengan akun Microsoft Anda, buka tab **Installations**, lalu klik **New installation**.

![Membuat instalasi baru di BedrockLauncher](/images/bedrock-cape/bedrock-cape-06-new-installation.png)

## Langkah 7 -- Pilih versi lama

Beri nama instalasi, lalu di daftar versi, pilih versi **lama** -- biasanya `1.16.x` atau lebih awal. Klik **Create**.

![Memilih versi lama, di sini 1.16.0.2](/images/bedrock-cape/bedrock-cape-07-pick-old-version.png)

## Langkah 8 -- Luncurkan instalasi

Klik **Play**. Ekstraksi file bisa memakan waktu hingga sepuluh menit tergantung mesin -- launcher akan tampak beku ("Not Responding"), ini normal, biarkan berjalan.

![Ekstraksi sedang berlangsung, launcher tampak tidak merespons](/images/bedrock-cape/bedrock-cape-08-launch-extracting.png)

## Langkah 9 -- Pilih jubah

Setelah game diluncurkan, masuk dengan akun Anda, buat karakter baru dan buka editor skin, tab **Jubah**. Di sana Anda akan menemukan daftar lengkap semua jubah yang ada di dalam game -- termasuk yang tidak pernah Anda miliki (jubah event promo, festival lampau, Mob Vote, dll). Pilih yang Anda mau.

**Jangan sentuh tampilan skin lainnya di tahap ini**, biarkan saja jubanya.

![Memilih jubah di editor karakter](/images/bedrock-cape/bedrock-cape-09-choose-cape.png)

## Langkah 10 -- Instal ulang versi resmi

Kembali ke launcher resmi, tab **Instalasi**, dan klik **Uninstall** pada instalasi Bedrock utama, lalu instal ulang (atau tekan **Check for Updates**). Luncurkan Minecraft Bedrock kali ini dari launcher resmi.

![Uninstal dan instal ulang dari launcher resmi](/images/bedrock-cape/bedrock-cape-10-reinstall-official.png)

Dan selesai -- jubah Anda sudah ada, di versi resmi, di profil asli Anda.

## Apa yang mungkin terjadi

Saya belum mengoprek kode sumber tertutup Bedrock (tidak seperti Java yang bisa didekompilasi), jadi berikut ini adalah penjelasan **kemungkinan**, bukan kepastian mutlak. Tapi perilaku yang diamati cukup cocok dengan hipotesis berikut.

### Pemilih jubah tidak pernah menjadi kontrol akses

Di Bedrock, layar pemilihan jubah kemungkinan besar menampilkan **daftar lengkap semua jubah yang ada di game**, bukan hanya yang dimiliki akun Anda. Di klien terbaru, filter aplikasi (sisi klien atau melalui panggilan jaringan ke layanan entititlement Xbox/Microsoft) membuat abu-abu atau menyembunyikan jubah yang tidak Anda miliki.

Poin kuncinya adalah filter ini kemungkinan ditambahkan **belakangan**, di versi game yang cukup baru. Versi seperti 1.16.x mendahului filter ini, atau menggunakan mekanisme verifikasi yang berbeda (atau tidak ada sama sekali): semua yang ada di daftar menjadi bisa dipilih, dengan atau tanpa entititlement.

### Di mana tepatnya jubah disimpan?

Ini bagian yang menjelaskan mengapa pilihan bertahan setelah instal ulang. Pilihan skin/jubah di Bedrock bukan sekadar file lokal yang dibuang -- kemungkinan besar disinkronkan ke profil Xbox Live yang terhubung ke akun Microsoft Anda (sistem yang sama yang mengelola skin Anda di platform Bedrock lain -- seluler, konsol, dll). Saat Anda memilih jubah di klien lama, klien kemungkinan besar mengirim pilihan itu ke layanan profil, persis seperti cara klien terbaru melakukannya dengan jubah yang sah -- karena dari sudut pandang klien, tidak ada bedanya antara jubah "milik Anda" dan jubah "yang dipilih". Layanan profil, dari pihaknya, memercayai klien dalam hal ini: ia mencatat pilihan tanpa memvalidasi ulang apakah entititlementnya benar-benar ada di belakangnya, setidaknya tidak pada saat penulisan.

Hasilnya: ketika Anda meluncurkan ulang game resmi terbaru, game mengambil skin/jubah Anda saat ini dari layanan profil -- dan layanan dengan setia mengembalikan apa yang disimpan, termasuk jubah yang tidak sah. Pemeriksaan entititlement, jika ada, kemungkinan terjadi pada saat **pemilihan** di UI (makanya ada filter di klien terbaru), bukan pada saat **penampilan** dari apa yang sudah tersimpan di profil.

### Paralel dengan Java

Ini adalah keluarga cacat logika yang sama dengan `cape-mod` di Java: sebuah layanan memercayai data tanpa memeriksa ulang asal-usulnya di setiap langkah. Di Java, ini adalah tanda tangan RSA valid yang diputar ulang di profil yang salah. Di Bedrock, ini kemungkinan adalah pilihan jubah yang diterima oleh klien lama yang tidak pernah memiliki filter yang benar, lalu disebarkan tanpa validasi ulang ke status persisten akun. Dalam kedua kasus, masalahnya bukan pada titik masuk (mod Java, klien Bedrock lama) -- melainkan bahwa lapisan yang seharusnya memvalidasi ulang entititlement di hilir tidak melakukannya, atau hanya melakukannya sekali, di tempat yang salah.

## Kenapa masih berfungsi

Dua penjelasan yang mungkin, tidak saling eksklusif:

1. **Mojang kemungkinan tidak menganggap ini prioritas.** Butuh launcher pihak ketiga, proses multi-langkah, dan hasilnya murni kosmetik -- tidak ada keunggulan gameplay, tidak ada data orang lain yang dikompromikan.
2. **Menambal ini dengan benar akan membutuhkan validasi ulang entititlement pada setiap pembacaan profil**, bukan hanya saat pemilihan -- yang berarti panggilan jaringan tambahan di setiap penampilan skin, untuk masalah yang hanya menyangkut estetika.

## Kesimpulan

Tutorial ini muat dalam sepuluh tangkapan layar, tapi mengilustrasikan prinsip yang bisa ditemukan di mana-mana dalam keamanan perangkat lunak: begitu sistem lawas (versi klien lama, API lawas, layanan yang tidak pernah diperbarui) masih bisa menulis ke status bersama, kontrol akses masa kini hanya melindungi apa yang melewati masa kini. Apapun yang masih bisa berbicara dengan API lama melewati filter yang lebih baru -- bukan karena filternya rusak, tapi karena filter itu tidak pernah diterapkan ke versi sebelumnya.

---

**Sumber daya**

- **BedrockLauncher** : [github.com/bedrockLauncher/BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher)
- **Artikel terkait** : Cape Mod, ekuivalen Java dengan injeksi tanda tangan RSA

**3 poin utama**

1. Pemilih jubah di versi Bedrock lama kemungkinan menampilkan daftar lengkap semua jubah game, tanpa filter entititlement.
2. Pilihan kemudian disinkronkan ke profil Xbox Live Anda seperti jubah sah manapun -- layanan profil memercayai klien.
3. Pemeriksaan entititlement, jika ada, terjadi saat pemilihan di UI terbaru -- bukan saat membaca apa yang sudah tersimpan di akun.
