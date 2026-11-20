---
title: "Saya mengaudit agen AI coding saya alih-alih memercayai mereka secara membabi buta"
description: "Bagaimana dua audit yang dilakukan untuk menulis laporan teknis ke-4 platform trading saya mengungkapkan dua penyimpangan berbeda : satu agen yang lupa karena repo tidak muat lagi di jendela konteksnya, dan satu agen yang menulis kode sepuluh kali lebih banyak dari yang perlu karena tidak ada yang mendorongnya untuk ringkas."
date: 2026-09-15
tags: ["ai", "llm-agents", "code-review", "context-window", "trading", "typescript"]
authors: ["docteur-turboss"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "OjdhTWrnNifyVJ4+7FWYGzC27sAs0e+ULZZmn9SXe2Llv2S/KH7T4GWWZUzbj9BLsJ1tYwm05RvLJ/fAKzF51g=="
---

## Gejala sebelum diagnosis

Setiap edisi laporan teknis platform memaksa saya menelusuri ulang seluruh arsitekturnya : layanan, agen, pipeline data. Saat menyiapkan edisi ke-4 itulah volume repo akhirnya menyentak mata saya, padahal saya melihatnya membesar sedikit demi sedikit tanpa pernah berhenti memperhatikannya : repo yang awalnya hanya beberapa ribu baris, kurang dari 10ko, kini mencapai 100Mo. Platformnya nyaris tidak punya fitur lebih banyak. Saya hanya bersandar pada agen sejenis Claude Chat untuk mengimplementasikan dan memperbaiki kode, tanpa membingkai secara tepat apa yang saya minta maupun cakupannya.

Menulis laporan memaksa saya keluar dari mode "pokoknya jalan" untuk kembali ke mode "apa yang sebenarnya terjadi". Saya melakukan dua audit berbeda atas riwayat repo. Keduanya menunjuk ke penyebab yang sama, karena dua alasan yang sama sekali berbeda.

## Audit no 1 : jendela konteks yang berbohong

Audit pertama adalah menelusuri ulang, layanan demi layanan, perbaikan yang dilakukan agen AI selama beberapa bulan, dan memeriksa apakah perbaikan itu konsisten dengan sisa repo pada saat diterapkan.

Pola yang terus kembali : agen memperbaiki masalah secara lokal, di berkas atau modul yang ada di depan matanya, tanpa pernah melihat padanannya di tempat lain di repo, atau tanpa mengingatnya. Hasilnya : antarmuka yang sama didefinisikan ulang sedikit berbeda di dua layanan, penggantian nama yang diterapkan setengah karena kemunculan kedua berada di luar jendela konteks saat prompt diberikan, konvensi penamaan yang dihormati di satu modul dan diabaikan di modul berikutnya. Tidak ada yang spektakuler kalau dilihat satu per satu, tapi diakumulasi selama puluhan sesi, inilah yang menghasilkan redundansi dan code smell yang membuat alat berikutnya yang dijalankan di atasnya kehilangan jejak. Lingkaran yang menghidupi dirinya sendiri : makin besar dan terfragmentasi repo, makin sulit bagi agen untuk memegangnya utuh di kepalanya, makin lokal dan parsial perbaikannya, makin besar repo.

Masalahnya bukan agen "berbohong" atau mengarang ; ia menjawab dengan benar pertanyaan yang diajukan atas konteks yang diberikan kepadanya. Masalahnya adalah saya, sebagian besar waktu, tidak pernah mendefinisikan cakupan pertanyaan itu di awal. Saya meminta "perbaiki typo ini, perilaku ini, fungsi ini" tanpa bertanya pada diri sendiri apakah bug ini punya padanan di tempat lain di repo yang tidak bisa dilihat agen.

## Audit no 2 : ketika verbositas menjadi kode

Audit kedua lebih mekanis : menjalankan `git log --numstat` atas seluruh riwayat, mengagregasi baris yang ditambahkan dan karakter yang ditambahkan per commit lalu melihat distribusinya.

30 commit terbesar dalam baris yang ditambahkan mewakili, sendirian, porsi yang sangat tidak proporsional dari total volume repo. Secara sistematis, commit yang sama juga muncul sebagai yang terbesar dalam karakter yang ditambahkan. Itu bisa ditebak, hanya saja rasio karakter/baris commit-commit itu bukan sekadar soal jumlah baris : baris-barisnya sendiri lebih verbose, dengan lebih banyak komentar penjelasan yang redundan dengan nama fungsi, lebih banyak blok penanganan error yang diduplikasi alih-alih difaktorisasi, lebih banyak docstring yang merumuskan ulang tiga kali hal yang sama.

Ini akibat langsung dari perilaku yang sudah dikenal saat berinteraksi dengan LLM lewat chat : tanpa instruksi eksplisit untuk ringkas, ia cenderung banyak bicara, membenarkan, mengomentari, merumuskan ulang. Dalam percakapan, itu menghabiskan token keluaran. Dalam pembangkitan kode, refleks yang sama berubah menjadi baris-baris yang tinggal di repo selamanya, commit demi commit, tanpa benar-benar dibaca ulang selama kodenya berjalan.

## Apa yang ditunjukkan kedua audit, berdampingan

Untuk laporan pertama : konsistensi antar-layanan menderita karena jendela konteks terlalu kecil untuk menampung seluruh repo, yang berujung pada perbaikan lokal, redundansi, dan divergensi konvensi.

Untuk yang kedua : `git log --numstat` menunjukkan verbositas bawaan dari LLM yang tidak dibingkai, yang menyebabkan baris dan karakter yang ditambahkan tidak proporsional serta kode yang kurang difaktorisasi.

Keduanya digabung menunjuk pada redundansi dan volume : hasilnya adalah repo yang terlalu besar untuk dipegang utuh oleh agen masa depan, yang makin memperparah masalah pertama yang diungkap audit pertama.

Baris terakhir inilah yang paling mengkhawatirkan saya saat menulis laporan : kedua masalah saling terkait, mereka saling menghidupi. Makin verbose kode yang dihasilkan, makin cepat repo membesar ; makin besar, makin tidak bisa dipegang agen dalam konteks ; makin tidak bisa dipegang dalam konteks, makin lokal dan redundan perbaikannya ; makin redundan, makin menambah volume. Lingkaran umpan balik negatif, sepenuhnya disebabkan oleh penggunaan agen tanpa pembingkaian.

## Kenapa ini bukan bug sesaat dari satu alat tertentu

Tidak ada dalam diagnosis ini yang spesifik untuk satu model atau produk tertentu. Agen sejenis chat, apa pun itu, beroperasi atas apa yang diperlihatkan kepadanya di jendelanya pada saat T, dan secara bawaan menghasilkan jawaban yang selengkap dan seberalasan mungkin. Itu tepat perilaku yang diharapkan dari asisten percakapan, dan tepat perilaku yang harus dihindari untuk alat yang menulis di repo produksi. Masalahnya berasal dari ketiadaan pembingkaian antara alat dan repo : cakupan berkas yang perlu dipertimbangkan, format keluaran yang diharapkan, anggaran baris atau verbositas, kewajiban mengutip secara tepat apa yang sudah ada sebelum menulis sesuatu yang baru.

## Apa yang saya ubah sejak itu

Refleks logisnya adalah memangkas drastis apa yang sudah ditulis. Secara pribadi, saya memutuskan melakukan hal lain. Audit-audit itu saya pakai untuk hal lain : memindai kode untuk menemukan code smell di dalamnya, dan memakainya untuk membatasi secara tepat di mana letak masalah sebenarnya. Ketidakkonsistenan antar-layanan, redundansi, tempat-tempat di mana jejaknya hilang, alih-alih menebak. Volume kode yang ditulis tetap signifikan sama : verbose atau tidak, ia tetap berguna kalau dipakai dengan baik. Tuasnya adalah tahu persis ke mana melihat untuk memperbaiki apa yang tidak cocok, alih-alih mencegah agen menulis.

## Langkah berikutnya

Memecah repo menjadi unit-unit yang lebih kecil dan dibatasi lebih baik. Serta pagar produksi untuk eksekusi dan dokumentasi. Masalah yang muncul berikutnya adalah soal arsitektur : bagaimana menganalisis, mengkritik, dan membuat layanan, komponen, dan dokumentasi yang, sekali dipisahkan, tetap harus mengoordinasikan keputusan mereka dengan bersih tanpa kembali ke monolit yang sama seperti sebelumnya.
