---
title: "Cara mendapatkan cape apa pun di Minecraft Bedrock"
description: "Peluncur pihak ketiga, versi lama permainan, dan pemilih cape yang tidak pernah belajar berkata tidak. Tutorial lengkap ditambah penjelasan yang mungkin tentang kenapa ini berhasil."
date: 2026-07-14
tags:
  - minecraft
  - bedrock
  - tutorial
  - reverse-engineering
authors:
  - 9stown
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "dfjiMK+iYZRWz1BDUI8IIHUU17XbdLVmSjUXXAwLoMMlLzmKaSCuEqyl7XbkL+Ainlhu/AIAnxacAU720L+Org=="
---

# Cara mendapatkan cape apa pun di Minecraft Bedrock

Di Java, ada banyak cara aneh untuk berakhir dengan cape yang seharusnya tidak kamu miliki (lihat artikel tentang `cape-mod`). Di Bedrock, permainannya berbeda, auth-nya berbeda, tapi tetap ada caranya -- kamu cuma butuh peluncur pihak ketiga dan versi permainan yang cukup tua untuk mengabaikan validasi yang dianggap sudah pasti.

Begini caranya, lalu kita lihat apa yang mungkin terjadi di balik kapnya.

## Yang kamu butuhkan

- Akun Microsoft yang sudah memiliki Minecraft Bedrock (punyamu sudah cukup)
- Peluncur Minecraft resmi yang terpasang
- [BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher), peluncur pihak ketiga open source yang memungkinkan menginstal dan menjalankan versi historis Bedrock mana pun
- .NET 8.0 Desktop Runtime
- Mode pengembang yang aktif di Windows

## Langkah 1 -- Instal Bedrock minimal sekali dengan peluncur resmi

Sebelum melakukan apa pun, buka peluncur Minecraft resmi, pergi ke tab **Minecraft: Bedrock Edition**, dan klik **Install**. Bedrock harus sudah dipasang dan dijalankan minimal sekali lewat jalur resmi sebelum menyentuh BedrockLauncher.

![Menginstal Bedrock Edition dari peluncur resmi](/images/bedrock-cape/bedrock-cape-01-install-bedrock.png)

## Langkah 2 -- Unduh BedrockLauncher

Pergi ke halaman rilis GitHub proyek. Ambil zip versi terbaru yang terdaftar di **Assets**.

![Halaman rilis GitHub BedrockLauncher](/images/bedrock-cape/bedrock-cape-02-github-release.png)

## Langkah 3 -- Ekstrak arsipnya

Setelah zip terunduh, ekstrak ke folder `Downloads`-mu (atau di mana saja, asal kamu menemukan foldernya setelahnya).

![Ekstraksi arsip BedrockLauncher](/images/bedrock-cape/bedrock-cape-03-extract-zip.png)

## Langkah 4 -- Jalankan executable-nya

Masuk ke folder hasil ekstrak dan jalankan `BedrockLauncher.exe`.

![Peluncuran BedrockLauncher.exe](/images/bedrock-cape/bedrock-cape-04-run-exe.png)

## Langkah 5 -- Instal .NET Desktop Runtime dan aktifkan mode pengembang

Pada peluncuran pertama, Windows kemungkinan besar akan memintamu memasang **.NET 8.0 Desktop Runtime** -- pasanglah. Kamu juga harus mengaktifkan **mode pengembang** di `Pengaturan > Sistem > Untuk pengembang`, karena BedrockLauncher memasang permainan sebagai paket loose (berkas mentah, bukan paket bertanda tangan Store sungguhan), dan Windows menolak instalasi semacam itu tanpa mode ini.

![Instalasi runtime .NET dan aktivasi mode pengembang](/images/bedrock-cape/bedrock-cape-05-dotnet-devmode.png)

## Langkah 6 -- Buat instalasi baru

Jalankan ulang BedrockLauncher, masuk dengan akun Microsoft-mu, pergi ke tab **Installations**, lalu klik **New installation**.

![Pembuatan instalasi baru di BedrockLauncher](/images/bedrock-cape/bedrock-cape-06-new-installation.png)

## Langkah 7 -- Pilih versi lama

Beri nama pada instalasinya, lalu di daftar versi, pilih versi **lama** -- biasanya versi `1.16.x` atau lebih tua. Klik **Create**.

![Pemilihan versi lama, di sini 1.16.0.2](/images/bedrock-cape/bedrock-cape-07-pick-old-version.png)

## Langkah 8 -- Jalankan instalasinya

Klik **Play**. Ekstraksi berkas bisa memakan waktu hingga sepuluh menit tergantung mesin -- peluncurnya akan tampak beku ("Not Responding"), itu normal, biarkan berjalan.

![Ekstraksi berjalan, peluncur tampak tidak merespons](/images/bedrock-cape/bedrock-cape-08-launch-extracting.png)

## Langkah 9 -- Pilih capenya

Setelah permainan berjalan, masuk dengan akunmu, buat karakter baru dan pergi ke editor skin, tab **Capes**. Di sana, kamu akan menemukan daftar lengkap semua cape yang ada di Minecraft -- termasuk yang tidak pernah kamu miliki (cape event promo, festival lampau, Mob Vote, dll). Pilih yang kamu mau.

**Jangan sentuh sisa tampilan skin pada tahap ini**, biarkan saja capenya.

![Pemilihan cape di editor karakter](/images/bedrock-cape/bedrock-cape-09-choose-cape.png)

## Langkah 10 -- Instal ulang versi resmi

Kembali ke peluncur resmi, tab **Installation**, dan klik **Uninstall** pada instalasi Bedrock utama, lalu instal ulang (atau lakukan **Check for Updates**). Jalankan ulang Minecraft Bedrock dari peluncur resmi kali ini.

![Uninstal dan instal ulang dari peluncur resmi](/images/bedrock-cape/bedrock-cape-10-reinstall-official.png)

Dan selesai -- capemu ada di sana, di versi resmi, di profil aslimu.

## Apa yang mungkin terjadi

Saya belum mengoprek kode sumber tertutup Bedrock (tidak seperti Java yang bisa didekompilasi), jadi yang berikut adalah penjelasan yang **mungkin**, bukan kepastian mutlak. Tapi perilaku yang teramati cukup cocok dengan hipotesis berikut.

### Pemilih cape tidak pernah menjadi kontrol akses

Di Bedrock, layar pemilihan cape kemungkinan menampilkan **daftar lengkap cape yang ada di permainan**, bukan hanya yang dimiliki akunmu. Pada klien terbaru, filter aplikatif (sisi klien atau lewat panggilan jaringan ke layanan entitlements Xbox/Microsoft) mengabukan atau menyembunyikan cape yang tidak kamu miliki.

Poin kuncinya adalah filter ini mungkin ditambahkan **belakangan**, pada versi permainan yang cukup baru. Versi seperti 1.16.x lebih tua dari filter ini, atau memakai mekanisme verifikasi berbeda (bahkan tidak ada) : semua yang ada di daftar menjadi bisa dipilih, entitlement atau tidak.

### Cape disimpan di mana, tepatnya?

Ini bagian yang menjelaskan kenapa ia bertahan setelah instal ulang. Pilihan skin/cape di Bedrock bukan sekadar berkas lokal yang bisa dibuang -- ia mungkin disinkronkan ke profil Xbox Live yang terkait dengan akun Microsoft-mu (sistem yang sama yang mengelola skinmu di platform Bedrock lain -- ponsel, konsol, dll.). Ketika kamu memilih cape di klien lama, ia kemungkinan mengirim pilihan itu ke layanan profil, persis seperti klien terbaru dengan cape sah -- karena dari sudut pandang klien, tidak ada bedanya antara cape "milikmu" dan cape "terpilih". Layanan profil, pada pihaknya, memercayai klien soal ini : ia mencatat pilihan tanpa memvalidasi ulang apakah entitlement benar-benar ada di baliknya, setidaknya tidak pada saat penulisan.

Hasilnya : ketika kamu menjalankan ulang permainan resmi yang terbaru, ia mencari skin/cape-mu saat ini di layanan profil -- dan layanan mengembalikan dengan setia apa yang tercatat, termasuk cape yang tidak sah. Cek entitlement, kalau ada, mungkin hanya dilakukan pada saat **pemilihan** di UI (makanya ada filter pada klien terbaru), dan membiarkan lewat **tampilan** dari apa yang sudah tercatat di profil.

### Paralel dengan Java

Ini keluarga cacat logika yang sama dengan `cape-mod` di Java : layanan memercayai sebuah data tanpa memeriksa ulang asalnya di setiap tahap. Di Java, itu tanda tangan RSA valid tapi di replay pada profil yang salah. Di Bedrock, kemungkinan itu pilihan cape yang diterima klien lama yang tidak pernah punya filter yang benar, lalu disebar tanpa verifikasi ulang ke keadaan persisten akun. Dalam kedua kasus, masalahnya bukan titik masuk (mod Java, klien Bedrock lama) -- melainkan lapisan yang seharusnya memvalidasi ulang entitlement di hilir tidak melakukannya, atau hanya melakukannya sekali, di tempat yang salah.

## Kenapa ini masih berhasil

Dua penjelasan yang mungkin, tidak saling meniadakan :

1. **Mojang mungkin tidak menganggap ini prioritas.** Butuh peluncur pihak ketiga, manipulasi beberapa langkah, dan hasilnya murni kosmetik -- tidak ada keunggulan gameplay, tidak ada data orang lain yang dikompromikan.
2. **Menambalnya dengan benar menuntut validasi ulang entitlements di setiap pembacaan profil**, bukan hanya saat pemilihan -- yang berarti panggilan jaringan tambahan di setiap tampilan skin, untuk masalah yang hanya soal estetika.

## Kesimpulan

Tutorial ini muat dalam sepuluh tangkapan layar, tapi menggambarkan prinsip yang ditemukan di mana-mana dalam keamanan perangkat lunak : begitu sistem historis (versi klien lama, API legacy, layanan yang tidak pernah diperbarui) masih bisa menulis ke keadaan bersama, kontrol akses masa kini hanya melindungi apa yang lewat masa kini. Semua yang masih bisa bicara ke API lama memotong filter yang lebih baru -- filter berfungsi pada versi terbaru, tapi tidak pernah diterapkan pada versi yang mendahuluinya.

---

**Sumber daya**

- **BedrockLauncher** : [github.com/bedrockLauncher/BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher)
- **Artikel terkait** : Cape Mod, padanan Java lewat injeksi tanda tangan RSA

**3 poin kunci**

1. Pemilih cape versi lama Bedrock kemungkinan menampilkan daftar lengkap cape permainan, tanpa filter entitlement.
2. Pilihan itu lalu disinkronkan ke profil Xbox Live-mu seperti cape sah mana pun -- layanan profil memercayai klien.
3. Cek entitlement, kalau ada, dilakukan saat pemilihan di UI terbaru -- bukan saat pembacaan apa yang sudah tercatat di akun.
