---
title: AI Belajar Minecraft PvP -- Imitation Learning, Reinforcement Learning, dan 30 Variabel yang Penting
description: "1.000 duel direkam, jaringan saraf dilatih pada piksel, akurasi penekanan tombol 90% : dan bot berjalan lurus ke tembok. Kemudian datang RL, curriculum learning, dan 60 jam pelatihan."
date: 2026-07-09
authors:
  - fox3000foxy
tags:
  - minecraft
  - ai
  - python
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "GZzMRrKQ8vcx9wZcnPVsMcUrYOQwtOtvoCB6Vp4+HPxiuPyvYrBx241U1iEbKawfgVzw3XdPdofLAOBZ0tK/Cg=="
---

## Pendahuluan

![AI Belajar Minecraft PvP thumbnail](assets/ai-pvp-thumbnail.png)

Ada sebuah video berjudul [AI Learns Minecraft PvP (Reinforcement Learning + Behavior Cloning)](https://www.youtube.com/watch?v=j5nxDKAjg6U) oleh Kadambi | AI Engineering, dan ini adalah salah satu catatan paling jujur tentang pelatihan AI bermain game yang pernah saya lihat.

Premisnya: buat bot yang memainkan Minecraft PvP (sword kit, baju diamond fully enchanted) dengan melihat layar dan mengeluarkan perintah mouse dan keyboard. Tidak membaca memori game, tidak ada makro, tidak ada mod : hanya piksel masuk, aksi keluar.

Yang membuat video ini menarik bukanlah hasil akhirnya. Melainkan perjalanannya: kegagalan imitation learning, pivot feature engineering, siklus catastrophic forgetting, dan 60+ jam pelatihan di laptop tanpa GPU.

## Fase 1 : Imitation Learning (kegagalan)

![Bot selama imitation learning: menghadap tembok, melompat-lompat](assets/ai-pvp-imitation-fail.png)

Pembuatnya memulai dengan pendekatan yang masuk akal: merekam 1.000 duel dari permainannya sendiri, memetakan setiap klik mouse dan tekan tombol ke frame yang sesuai, dan melatih jaringan saraf untuk memprediksi aksi dari piksel.

```python
# Pseudocode for the imitation learning pipeline
dataset = record_duels(1000)          # hundreds of thousands of frames
for frame, action in dataset:
    pixels = capture_screen(frame)
    network.train(pixels → action)    # predict keyboard/mouse from image
```

Jaringan belajar memprediksi penekanan tombol dengan akurasi **90%**. Menjanjikan.

Lalu mereka mengujinya dalam pertandingan sungguhan. Bot berjalan lurus ke tepi peta, menghadap tembok, dan melompat-lompat.

Mengapa?

**Perangkap kemalasan.** Dalam pertarungan PvP, tombol W ditekan hampir sepanjang waktu. Jaringan menyadari bahwa ia bisa mencapai akurasi tinggi dengan hanya menahan W dan tidak melakukan apa pun. Ia mengoptimalkan aksi yang paling umum dengan mengorbankan semua yang lain.

**Latensi manusia.** Aksi dalam dataset tertunda ~200ms karena waktu reaksi manusia. Frame demi frame, sebab dan akibat hampir mustahil dipelajari model dari piksel mentah ketika aksi dan konsekuensi visualnya terpisah beberapa frame.

**Demonstrasi yang tidak konsisten.** Permainan pembuatnya sendiri bervariasi : kadang strafe dengan keyboard, kadang membidik dengan mouse dalam situasi yang identik. Input yang saling bertentangan ini membingungkan jaringan.

## Fase 2 : Reinforcement Learning dengan Curriculum

![Bot belajar melacak secara horizontal selama pelatihan RL](assets/ai-pvp-rl-horizontal.png)

Meninggalkan imitation learning, pembuatnya beralih ke RL. Tapi menjatuhkan agen baru ke dalam duel PvP penuh tidak berguna : terlalu banyak hal terjadi sekaligus untuk eksplorasi acak menemukan sesuatu.

Solusinya: **curriculum learning**. Isolasi setiap mekanik dan biarkan bot menguasai dasar-dasarnya sebelum memasuki pertarungan sungguhan.

### Langkah 1 : Bidik Horizontal (7 jam)

Fungsi reward paling sederhana: hadiah positif untuk pukulan, penalti negatif untuk menerima damage.

Awalnya, bot hampir tidak bergerak (jaringan saraf diinisialisasi untuk mengeluarkan nilai netral). Ia berguncang dari sisi ke sisi : itu adalah bot yang menguji berbagai aksi untuk melihat mana yang memberikan reward.

Setelah satu jam, ia belajar memusatkan diri secara horizontal, tapi sangat lambat. Setelah 7 jam, ia bisa melacak musuh ke kiri dan kanan, meskipun asimetris (lebih baik bergerak dari kanan ke kiri daripada kiri ke kanan, perilaku yang bertahan sepanjang pelatihan).

### Langkah 2 : Feature Engineering

Tangkapan layar mentah memiliki lebih dari 2 juta piksel. Bahkan jika diperkecil ke 360p, itu masih 200.000 input : terlalu banyak untuk pembelajaran yang efisien.

Pembuatnya menganalisis ribuan duel dan mengidentifikasi **30 variabel yang benar-benar penting**, dibagi menjadi tiga kelompok:

**Vision (pelacakan musuh)** :
- Jarak musuh dari crosshair
- Ukuran bounding box musuh
- Tinggi musuh
- Status crosshair (tepat sasaran/tidak)
- Kecepatan relatif

Alih-alih memproses seluruh gambar, bot menyaring piksel secara ketat berdasarkan warna armor musuh, membuat deteksi hampir instan. Blok latar belakang dengan warna serupa bisa mengganggu : tapi di Minecraft, Anda bisa mengganti tekstur.

**OCR (membaca HUD)** :
Karena bot tidak bisa mengambil koordinat dari kode game, ia memindai layar secara real-time untuk mengekstrak:
- Kemiringan kamera (pitch)
- Momentum
- Level Y

OCR standar kesulitan dengan teks transparan Minecraft, sehingga data kritis dipaksakan menjadi hitam putih untuk pembacaan instan.

**Waktu (context window)** :
- Waktu sejak Anda memukul musuh
- Waktu sejak mereka memukul Anda
- Buffer bergulir dari aksi bot sebelumnya

Ini memberikan konteks temporal pada jaringan : tanpanya, bot tidak tahu apakah ia sedang di tengah kombo atau baru memulai pertarungan.

### Langkah 3 : Bidik Vertikal (tambah 7 jam)

![Bot belajar membidik ke atas dan ke bawah selama pelatihan RL](assets/ai-pvp-rl-vertical.png)

Menambahkan gerakan mouse vertikal adalah "bencana total" pada awalnya. Performa awal rusak.

Setelah satu jam lagi di sandbox, bot berhasil belajar melihat ke atas dan ke bawah. Namun dalam prosesnya, ia benar-benar lupa cara melacak secara horizontal.

Ini adalah **catastrophic forgetting** : masalah machine learning klasik di mana pengoptimalan untuk data baru menimpa representasi yang telah dipelajari sebelumnya. Dengan mengoptimalkan bidikan vertikal, jaringan saraf secara tidak sengaja menimpa kemajuan horizontalnya, meninggalkan pembuatnya dengan bot yang bisa memegang crosshair secara horizontal tapi tidak bisa mengikuti target.

Diperlukan **6 jam tambahan** untuk mendapatkan kembali pelacakan horizontal sambil mempertahankan kontrol vertikal. Bot kemudian mempertahankan penempatan crosshair yang baik berkat kelompok OCR yang mengekstrak kemiringan kamera.

### Langkah 4 : Kontrol Keyboard

![Bot menekan tombol W terus-menerus, belajar berkomitmen pada gerakan](assets/ai-pvp-keyboard.png)

Memberi bot izin untuk menggunakan keyboard membuat fitur berbasis waktu menjadi lebih kritis. Awalnya, tombol W terus dinyalakan dan dimatikan : pergantian cepat karena jaringan belum belajar berkomitmen.

Perilaku ini diberi penalti, sehingga bot belajar menghaluskannya. Ia mulai lebih sering mendaratkan sprint hit (suara thud vs suara whoosh dari ayunan berdiri). Beberapa kombo terlihat kurang memuaskan karena bot mengeksploitasi keunggulan jangkauannya atas musuh.

Agar adil, pembuatnya menaikkan jangkauan musuh. Banyak strategi yang dipelajari bot berhenti bekerja. Namun dengan waktu tambahan, ia beradaptasi.

### Langkah 5 : Mengajari bot kapan harus klik

Untuk fase terakhir, pembuatnya menggunakan kembali imitation learning : tapi hanya untuk mengajari waktu klik, bukan kebijakan kontrol penuh. Bot mencoba meniru pola klik dari duel yang direkam.

Awalnya ia terlalu takut untuk mencoba apa pun, khawatir akan penalti untuk klik yang salah. Namun akhirnya ia memberanikan diri untuk mengayun dan mendaratkan pukulan. Tentu saja, ia lupa cara membidik lagi dalam prosesnya : pembuatnya harus membiarkannya selama **50 jam lagi** untuk kembali ke kondisi yang memuaskan.

## Perdebatan tentang kecurangan

Video diakhiri dengan bertanya: apakah bot ini curang?

Argumen menentang: bot hanya memproses apa yang dilihat manusia (piksel yang sama), mengirimkan input keyboard/mouse yang sama seperti manusia (tidak ada manipulasi paket seperti anti-knockback), dan tidak membaca memori game (tidak ada X-ray atau ESP).

Argumen mendukung: bot bisa memproses lebih cepat daripada manusia, dan jika lawan mengira mereka bermain melawan manusia padahal tidak, itu adalah penipuan.

Pendapat pembuatnya: tergantung pada niatnya. Jika kedua pihak tahu itu bot, itu adalah pertandingan yang adil. Bot kemudian melanjutkan untuk mengkombo musuh ke dalam void dengan 100-hit streak.

## Hasilnya

![Bot mengeksekusi kombo 100 pukulan](assets/ai-pvp-final-combo.png)

Sebuah bot Minecraft PvP yang dilatih di **laptop tanpa GPU**, dibangun di atas pipeline pelatihan kustom dengan:

- **Screen capture** untuk input piksel (2M+ piksel → 30 fitur rekayasa)
- **Curriculum learning** (horizontal → vertikal → keyboard → klik)
- **RL untuk kontrol motorik** + **imitation learning untuk waktu klik**
- **Feature engineering** pada piksel mentah (3 kelompok: vision, OCR, waktu)
- **60+ jam pelatihan** di berbagai fase

Total waktu pelatihan mencapai puluhan jam, tapi sebagian besar bersifat pasif. Bot berguncang menuju pemahaman, melupakan apa yang dipelajarinya, mempelajarinya kembali, dan akhirnya merangkai kombo 100 pukulan.

Video ada di [youtube.com/watch?v=j5nxDKAjg6U](https://www.youtube.com/watch?v=j5nxDKAjg6U).

---

*Artikel ini hanya mencakup konten video. Untuk konteks yang lebih luas tentang AI Minecraft: VPT, DreamerV3, dan lanskap imitation learning vs RL : bagian di bawah menghubungkan proyek ini dengan bidang yang lebih luas.*

## VPT : Behavior cloning dalam skala besar

![Diagram proyek VPT OpenAI: Inverse Dynamics Model memprediksi aksi dari pasangan frame](assets/vpt-overview.svg)

Pendekatan "behavior cloning" video (Fase 1) adalah teknik yang sama yang digunakan OpenAI dalam proyek **Video PreTraining (VPT)** mereka, tetapi di ujung spektrum sumber daya yang berlawanan. VPT membuktikan bahwa imitation learning bekerja untuk Minecraft jika Anda memiliki 70.000 jam video, 720 GPU, dan inverse dynamics model untuk memberi pseudo-label pada data yang tidak berlabel. Pembuat di sini membuktikan bahwa itu gagal dengan satu laptop dan 1.000 duel : tapi untuk alasan fundamental yang sama: imitation learning dibatasi oleh kualitas demonstrasinya.

![Agen VPT OpenAI menambang pohon di Minecraft](assets/vpt-minecraft.jpg)

Pipeline VPT memecahkan masalah data dengan melatih **Inverse Dynamics Model (IDM)** yang melihat frame t-1 dan frame t+1 untuk memprediksi aksi pada frame t. Karena IDM bersifat non-kausal (ia melihat frame masa depan), tugasnya lebih mudah daripada behavioral cloning dan membutuhkan lebih sedikit data berlabel. Mereka membayar kontraktor ~$2.000 untuk 2.000 jam data berlabel, lalu menggunakan IDM untuk memberi pseudo-label pada 70.000 jam video YouTube Minecraft.

Model fondasi 0,5B parameter yang dihasilkan mencapai kemampuan zero-shot yang mustahil dengan RL saja : menebang pohon, membuat meja kerajinan, pillar jumping : dan setelah fine-tuning dengan RL, menjadi AI pertama yang membuat alat diamond.

![Tingkat kerajinan/koleksi berdasarkan volume data prapelatihan (skala log): meja kerajinan, alat kayu, alat batu](assets/vpt-stone-pickaxe-sequence.svg)

Efek skalanya jelas: pada sumbu log dari 1 jam hingga 100.000 jam data prapelatihan, tingkat di mana model membuat meja kerajinan, alat kayu, lalu alat batu meningkat secara bertahap. Model yang dilatih hanya pada 2.000 jam data berlabel dari kontraktor mencapai puncak pada meja kerajinan; dengan menambahkan 70.000 jam data pseudo-berlabel dari IDM (garis putus-putus pada grafik), alat batu muncul secara zero-shot, tanpa satu pun langkah RL.

![Reward berdasarkan jumlah episode pelatihan RL: memulai dari model yang diinisialisasi acak vs memulai dari model VPT yang sudah diprapelatih](assets/vpt-diamond-pickaxe-sequence.svg)

Grafik ini menunjukkan mengapa prapelatihan mengubah segalanya untuk RL hilir. RL yang dimulai dari jaringan yang diinisialisasi acak (oranye) tetap datar mendekati 0 selama hampir satu juta episode: tugas "mendapatkan diamond" memiliki reward yang terlalu jarang untuk agen naif menemukannya melalui eksplorasi acak. RL yang di-fine-tune dari model VPT yang sudah diprapelatih (hijau) sudah dimulai dengan perilaku dasar (menambang, membuat, menjelajah) dan meningkat secara stabil hingga reward sekitar 25, yang sesuai dengan jalur lengkap menuju beliung diamond.

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/719971231?h=cbdf2617a1" title="VPT agent gameplay demo 1" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045834?h=9cb4118c65" title="VPT agent gameplay demo 2" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045849?h=00398908ed" title="VPT agent gameplay demo 3" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045863?h=060f07e290" title="VPT agent gameplay demo 4" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

*Demo video resmi proyek VPT OpenAI, menunjukkan agen sedang beraksi.*

## OpenAI Five : Masalah reward shaping

![OpenAI Five bermain Dota 2 melawan profesional manusia](assets/openai-five-dota2.jpg)

OpenAI Five (2019) mengalahkan juara dunia Dota 2 menggunakan pure self-play RL : tanpa imitation learning. 256 GPU, 128.000 core CPU, 180 tahun gameplay per hari, 10 bulan pelatihan.

Tapi fungsi reward-nya dibuat secara manual oleh ahli Dota: **28 dari 20.000 fitur yang tersedia**, masing-masing dengan bobot yang disetel manual. Kekayaan, kill, mati, kesehatan menara, tugas jalur : semua dipilih dan diberi bobot oleh manusia. Tanpa shaping ini, agen hampir tidak belajar (eksperimen: reward hanya menang/kalah → plateau di level semi-pro).

Bot dalam video menghadapi masalah yang sama: fungsi reward-nya mengkodekan pemahaman pembuat tentang apa yang penting dalam PvP (mendaratkan pukulan itu baik, menerima damage itu buruk, mempertahankan crosshair itu baik). Ini tidak terhindarkan : RL membutuhkan sinyal reward, dan membentuk sinyal itu mengkodekan bias manusia.

## DreamerV3 : World model dan sparse reward

![Skor benchmark DreamerV3 di lebih dari 150 tugas beragam dengan konfigurasi tunggal](assets/dreamerv3-benchmarks.png)

DreamerV3 dari DeepMind (2023) mengambil pendekatan ketiga. Alih-alih behavior cloning atau RL dengan reward shaping, ia mempelajari **world model** : sebuah jaringan saraf yang memprediksi keadaan masa depan dan reward dari aksi masa lalu : dan merencanakan dengan memimpikan kemungkinan masa depan. Ini adalah algoritma pertama yang mengumpulkan diamond di Minecraft dari awal tanpa data manusia atau kurikulum, diterbitkan di Nature pada tahun 2025.

![DreamerV3 mempelajari world model untuk membayangkan lintasan masa depan](assets/dreamerv3-header.png)

Lingkungan diamond mendefinisikan sparse reward melalui 12 pencapaian (log → planks → stick → crafting table → wooden pickaxe → cobblestone → stone pickaxe → iron ore → furnace → iron ingot → iron pickaxe → diamond), masing-masing memberikan +1 tepat satu kali. Ditambah reward kesehatan kecil (±0,01 per hp). Total yang bisa dicapai: 11,1 dalam episode 36.000 langkah.

World model DreamerV3 memungkinkannya membayangkan lintasan dan mengevaluasinya secara internal : aktor belajar dari rollout yang diimpikan daripada pengalaman nyata, menguji ribuan kemungkinan masa depan untuk setiap langkah nyata. Ini membuat sparse reward menjadi layak di mana mereka akan membunuh agen RL standar.

Di 40 seeds yang dilatih selama 100M langkah lingkungan, 24 dari 40 mengumpulkan setidaknya satu diamond. Diamond pertama muncul setelah 29M langkah (~9 hari di satu GPU).

## ANNA : AI Simbolik Bertemu Minecraft

![Dekomposisi pohon tugas ANNA untuk flint-and-steel](assets/anna-task-tree.png)

Sebelum bot PvP dalam video, sebelum VPT dan DreamerV3, ada **ANNA** : sebuah bot Minecraft yang dibangun dengan filosofi yang sama sekali berbeda. Alih-alih belajar dari piksel atau reward, ANNA menggunakan **state machine simbolik** dengan **parser NLP bahasa Prancis** dan **pohon ketergantungan tugas** yang dibuat secara manual.

Dibuat pada tahun 2022 (sebelum istilah "vibe coding" ada), ANNA terhubung ke server Minecraft melalui Mineflayer dan memahami perintah bahasa alami dalam bahasa Prancis. Katakan *"obtiens un briquet"* (ambilkan korek api), dan parser ANNA mengidentifikasi kata kerja (*obtien* → dapatkan), mencari resep item, dan mendekomposisinya secara rekursif menjadi sub-tugas : tambang kayu oak → buat planks → buat sticks → buat crafting table → buat wooden pickaxe → tambang batu → buat stone pickaxe → tambang bijih besi → smelt iron ingot → buat flint-and-steel.

![Arsitektur parser NLP ANNA untuk pengenalan perintah bahasa Prancis](assets/anna-nlp-diagram.png)

Lapisan NLP (`utils/id_parser.js`) memisahkan perintah pada *"et"* (dan) untuk menangani perintah paralel, memetakan kata kerja bahasa Prancis ke jenis tugas (*craft*, *mine*, *tue*, *suis moi*), dan menerjemahkan nama item bahasa Prancis ke ID Minecraft melalui kamus 5.000 entri. Perintah yang tidak dikenali akan jatuh ke sistem percakapan berbasis GPT yang menjadikan ANNA sebagai pendamping Minecraft yang dikaruniai kesadaran.

**Task tree** (`mc-tasks-tree/`) adalah intinya : sebuah algoritma rekursif yang berjalan melalui grafik item Minecraft (resep kerajinan, hasil tambang, drop mob, resep furnace) untuk menghasilkan rencana langkah demi langkah. Untuk helm diamond, ia menghasilkan rincian 40+ langkah yang mencakup tingkatan kayu, batu, besi, dan diamond.

![Pohon tugas helm diamond ANNA: rincian 40+ langkah](assets/anna-diamond-helmet.png)

Di mana bot PvP dalam video belajar dari pengalaman, ANNA bekerja dari pengetahuan. Ia tidak membutuhkan 1.000 duel atau 60 jam pelatihan : ia membutuhkan pohon, parser, dan server. Tapi ia juga tidak bisa generalisasi melampaui apa yang dikodekan pohonnya. Jumlah rekayasa state machine tidak akan pernah bisa mengajarinya PvP.

Pendekatan ANNA mencerminkan era AI yang berbeda : sebelum end-to-end learning mendominasi, ketika janjinya adalah bahwa penalaran simbolik + rekayasa hati-hati bisa menghasilkan perilaku cerdas. Saat ini, proyek seperti ANNA dan bot PvP mewakili dua kutub AI Minecraft : satu bernalar tentang dunia, yang lain mempersepsikannya.

## Mace Bot Milik Master Gumbo : AI Hanya dengan Command Block

![Arena pelatihan Mace PvP dengan bot](assets/mace-bot-arena.png)

Di sudut yang sama sekali berbeda dari AI Minecraft, YouTuber **Master Gumbo** membangun bot pelatihan PvP menggunakan **hanya command block** : tanpa mod, tanpa plugin, tanpa kode eksternal. Hanya perintah vanilla Minecraft, redstone, dan carpet mod untuk entitas replika pemain. Hasilnya adalah lawan AI mace PvP yang berlatih breach swapping, wind charging, dan mekanik perisai dengan pemain.

Bot mulai sebagai zombie dengan perlengkapan tidak bisa hancur dan totem di tangan kiri (diisi ulang setiap tick via `/item replace`), membuatnya efektif abadi. Kemudian, Master Gumbo beralih ke bot **player replica milik Carpet Mod**, yang mendukung mekanik seperti manusia (mengangkat perisai, mengganti item) yang tidak bisa dilakukan zombie.

![Pusat pengaturan: tombol untuk mengonfigurasi perilaku bot](assets/mace-settings-center.png)

Inovasi intinya adalah **state machine yang digerakkan oleh keacakan**. Sebuah armor stand diteleportasi ke atas lingkaran balok beton berwarna menggunakan perintah `/spreadplayers`, yang menyebarkan entitas secara acak. Di mana armor stand mendarat menentukan aksi bot selanjutnya :

- **Beton merah** → strafe mundur
- **Beton biru** → wind charge ke atas (serangan)
- **Beton hijau** → angkat perisai
- **Beton putih** → jeda (menambahkan penundaan antar aksi)

![Sistem keputusan AI: armor stand di atas beton berwarna](assets/mace-ai-system.png)

Posisi armor stand dibaca oleh command block yang mendeteksi blok di bawahnya dan mengaktifkan mekanisme yang sesuai. Blok redstone ditempatkan atau dihapus untuk mengaktifkan/menonaktifkan setiap perilaku. Karena `/spreadplayers` berjalan berulang, bot terus membuat keputusan baru, menciptakan perilaku yang tidak dapat diprediksi namun terstruktur.

Master Gumbo menyebut ini "bentuk AI yang sangat sederhana dan dasar" : ia tidak belajar dari interaksi seperti jaringan saraf, tetapi keacakan + state machine menghasilkan perilaku PvP realistis yang lebih sulit diprediksi daripada bot yang diprogram. Pusat pengaturan mencakup antarmuka buku untuk menyalakan/mematikan AI, menyesuaikan kesulitan, dan mengonfigurasi pola gerakan.

Setelah berlatih dengan bot dan kemudian berduel dengan pemain yang menyebutnya buruk (di intro video), Master Gumbo menang. Peta dibagikan melalui Discord dengan Carpet Mod diperlukan.

![Bot dalam duel, berlatih teknik mace PvP](assets/mace-final-duel.png)

Di mana bot PvP (Kadambi) belajar dari piksel dan ANNA bernalar melalui pohon tugas, bot Master Gumbo mencapai kecerdasan melalui **transisi keadaan acak** : pendekatan command block murni yang membuktikan Anda tidak perlu jaringan saraf untuk membangun lawan PvP yang meyakinkan.

## Altoclef : Baritone + task tree dalam skala besar

Jika ANNA adalah bot simbolik yang *membaca* untuk tahu apa yang harus dilakukan, dan Mace Bot mengacak keputusan, **Altoclef** adalah agen otonom penuh yang *merencanakan* jalannya melalui seluruh game. Dibangun oleh gaucho-matero sebagai mod Fabric dan didukung oleh **Baritone** pathfinding, Altoclef mendekomposisi tujuan Minecraft apa pun ke dalam task tree dan mengeksekusinya tanpa input manusia.

Antarmukanya sangat sederhana : ketik `@gamer` di chat, dan Altoclef memulai tugas beat-the-game dari world survival. Ia mengumpulkan kayu, membuat tools, menambang besi dan diamond, membangun Nether portal, mengumpulkan blaze rods dan ender pearls, menemukan stronghold, dan membunuh Ender Dragon. Semuanya otonom, semuanya melalui Minecraft client asli, di server vanilla mana pun.

Di balik layar, ini dicapai melalui **sistem recursive task tree** di mana setiap tujuan tingkat tinggi (misalnya, "buat diamond pickaxe") didekomposisi menjadi tugas prasyarat : tambang diamond → smelt → buat sticks → gabungkan. Pohon ini menelusuri seluruh grafik resep Minecraft, menangani production chain, mob drops, loot tables, dan akses container. Tidak seperti pohon ANNA yang dibuat dengan tangan, tugas Altoclef adalah **Java class yang dapat diprogram** yang bisa mengimplementasikan logika arbitrer : strategi tempur, barter dengan piglin, pola eksplorasi.

Wawasan arsitektur utamanya adalah pemisahan antara **apa** (task tree) dari **bagaimana** (Baritone pathfinding). Baritone menangani pergerakan tingkat rendah : pathfinding, penghindaran rintangan, pemecahan blok, manajemen inventory -- sementara sistem tugas mengoordinasikan rencana tingkat tinggi. Modularitas ini berarti tidak ada komponen yang perlu menjadi AI : keduanya adalah algoritma deterministik, namun kombinasinya menghasilkan perilaku kompleks yang diarahkan oleh tujuan dan menyaingi pendekatan yang dipelajari.

Altoclef mewakili batas dari **AI Minecraft simbolik murni** : ia bisa menyelesaikan game dari awal tanpa pelatihan, tanpa GPU, dan tanpa data manusia, tetapi ia tidak bisa beradaptasi dengan tugas yang tidak diantisipasi oleh programmernya, dan ia tidak bisa belajar dari pengalaman. Ia tahu cara membuat diamond pickaxe karena sebuah Java class memberitahunya persis bagaimana, bukan karena ia mengetahuinya sendiri.

## Apa yang menyatukan mereka

| Pendekatan | Metode inti | Data | Komputasi | Hasil |
|----------|------------|------|---------|--------|
| Bot PvP dalam video | RL + imitation learning | 1.000 duel | 1 laptop, 60 jam | Kombo 100 pukulan |
| OpenAI Five | Self-play RL | 180 th gameplay/hari | 256 GPU, 10 bln | Juara dunia Dota 2 |
| VPT | IL semi-supervised | 70K jam YouTube + IDM | 720 GPU, 9 hari | Alat diamond |
| DreamerV3 | World model RL | Lintasan impian | 1 GPU, 9 hari | Diamond dari awal |
| **ANNA** | **NLP simbolik + pohon tugas** | **Resep buatan tangan** | **1 laptop, instan** | **Item apa pun yang bisa dibuat** |
| **Altoclef** | **Baritone + task tree FS** | **Java task classes** | **Fabric mod, tanpa GPU** | **Menyelesaikan seluruh game** |
| **Mace Bot** | **State machine command block** | **Keputusan acak** | **Vanilla MC, tanpa GPU** | **Pelatihan Mace PvP** |

Bot dalam video adalah yang paling terbatas sumber dayanya tetapi yang paling jujur tentang prosesnya. Ia gagal dulu, lalu berulang. Ia melupakan apa yang dipelajarinya, lalu belajar kembali. Ia berakhir dengan kombo 100 pukulan : tapi juga dengan pertanyaan tentang apakah yang dibangunnya itu curang.

---

**Video** : [AI Learns Minecraft PvP](https://www.youtube.com/watch?v=j5nxDKAjg6U) oleh Kadambi | AI Engineering

**VPT** : [Paper](https://cdn.openai.com/vpt/Paper.pdf) · [Blog](https://openai.com/index/vpt/) · [GitHub](https://github.com/openai/Video-Pre-Training)

**OpenAI Five** : [Paper](https://arxiv.org/abs/1912.06680) · [Blog](https://openai.com/index/dota-2/)

**DreamerV3** : [Paper](https://arxiv.org/abs/2301.04104) · [GitHub](https://github.com/danijar/dreamerv3)

**ANNA** : [GitHub](https://github.com/fox3000foxy/ANNA) · (Node.js, Mineflayer, NLP Prancis, pohon tugas)

**Altoclef** : [GitHub](https://github.com/gaucho-matrero/altoclef) · [Active fork](https://github.com/drmcbride12/altoclef) · (Fabric, Baritone, task tree, beat game)

**Mace Bot** : [Video](https://www.youtube.com/watch?v=Fmp2Il70IF8) oleh Master Gumbo · (Command blocks, Carpet Mod, state machine)
