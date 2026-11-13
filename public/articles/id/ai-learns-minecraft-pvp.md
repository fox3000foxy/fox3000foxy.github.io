---
title: AI belajar PvP Minecraft -- Imitation Learning, Reinforcement Learning, dan 30 variabel yang penting
description: "1 000 duel direkam, jaringan saraf dilatih pada piksel, akurasi pukulan 90% : dan bot melaju lurus ke tembok. Lalu datang RL, pembelajaran kurikuler, dan 60 jam pelatihan."
date: 2026-07-09
tags:
  - minecraft
  - ai
  - python
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "Yq9upMCVkucVuIlY/+XS+F2Vf4JxK5NQ0B44kv70o7hUMxAEfoYmB6MBOd9FQKxl0b7S8SxyAI0UFye8yIvSIw=="
---

## Pendahuluan

![AI Learns Minecraft PvP thumbnail](assets/ai-pvp-thumbnail.png)

Ada video berjudul [AI Learns Minecraft PvP (Reinforcement Learning + Behavior Cloning)](https://www.youtube.com/watch?v=j5nxDKAjg6U) oleh Kadambi | AI Engineering, dan ini salah satu kisah paling jujur tentang pelatihan AI permainan video yang pernah saya lihat.

Prinsipnya : membangun bot yang memainkan PvP Minecraft (kit pedang, armor berlian yang di enchant penuh) dengan melihat layar dan mengirim perintah mouse dan keyboard. Ia berfungsi hanya dengan piksel sebagai masukan dan aksi sebagai keluaran, tanpa membaca memori permainan, tanpa makro dan tanpa mod.

Yang membuat video menarik bukan hasil akhirnya. Melainkan perjalanannya : kegagalan imitation learning, pivot ke feature engineering, siklus lupa katastrofik, dan 60+ jam pelatihan di laptop tanpa GPU.

## Fase 1 : Imitation Learning (kegagalan)

![The bot during imitation learning: facing a wall, jumping up and down](assets/ai-pvp-imitation-fail.png)

Kreator memulai dengan pendekatan yang masuk akal : merekam 1 000 duel dari gameplaynya sendiri, mengaitkan setiap klik mouse dan penekanan tombol dengan gambar yang cocok, dan melatih jaringan saraf untuk memprediksi aksi dari piksel.

```python
# Pseudocode untuk pipeline imitation learning
dataset = record_duels(1000)          # ratusan ribu frame
for frame, action in dataset:
    pixels = capture_screen(frame)
    network.train(pixels → action)    # memprediksi keyboard/mouse dari gambar
```

Jaringan belajar memprediksi pukulan dengan **akurasi 90%**. Menjanjikan.

Lalu mereka mengujinya dalam match sungguhan. Bot berjalan lurus ke tepi peta, menghadap tembok, dan melompat naik turun.

Kenapa?

**Jebakan kemalasan.** Dalam tempur PvP, tombol W ditekan sebagian besar waktu. Jaringan menyadari ia bisa mencapai akurasi tinggi hanya dengan menahan W dan tidak melakukan apa pun. Ia mengoptimalkan aksi paling sering dengan mengorbankan semua lainnya.

**Latensi manusia.** Aksi dalam himpunan data tertunda sekitar 200 ms waktu reaksi manusia. Gambar per gambar, sebab dan akibat nyaris mustahil dipelajari model dari piksel mentah ketika aksi dan konsekuensi terlihatnya dipisahkan beberapa gambar.

**Demonstrasi yang tidak konsisten.** Gameplay kreator sendiri bervariasi : kadang strafing dengan keyboard, kadang membidik dengan mouse dalam situasi identik. Masukan yang kontradiktif ini mengganggu jaringan.

## Fase 2 : Reinforcement learning dengan kurikulum

![The bot learning to track horizontally during RL training](assets/ai-pvp-rl-horizontal.png)

Meninggalkan imitation learning, kreator beralih ke RL. Tapi menjatuhkan agen segar ke duel PvP lengkap tidak berguna : terlalu banyak hal terjadi sekaligus sampai eksplorasi acak tidak menemukan apa pun.

Solusinya : **pembelajaran kurikuler**. Mengisolasi tiap mekanik dan membiarkan bot menguasai dasar sebelum masuk tempur sungguhan.

### Langkah 1 : Bidik horizontal (7 jam)

Fungsi reward paling sederhana : reward positif untuk mendaratkan pukulan, penalti negatif untuk menerima damage.

Awalnya, bot nyaris tidak bergerak (jaringan saraf diinisialisasi dengan nilai netral). Ia bergetar lateral : inilah bot yang menguji aksi berbeda untuk melihat mana yang memberi reward.

Setelah sejam, ia belajar memusatkan horizontal, tapi menyakitkan lambat. Setelah 7 jam, ia bisa mengikuti musuh ke kiri dan kanan, meski asimetris (lebih baik bergerak dari kanan ke kiri daripada kiri ke kanan, perilaku yang bertahan selama pelatihan).

### Langkah 2 : Feature Engineering

Tangkapan layar mentah lebih dari 2 juta piksel. Bahkan diperkecil ke 360p, itu 200 000 masukan : terlalu banyak untuk pembelajaran efisien.

Kreator menganalisis ribuan duel dan mengidentifikasi **30 variabel yang benar-benar penting**, terbagi dalam tiga grup :

**Penglihatan (pelacakan musuh)** :
- Jarak musuh dari crosshair
- Ukuran kotak pembatas musuh
- Ketinggian musuh
- Keadaan crosshair (pada target / di luar target)
- Kecepatan relatif

Alih-alih memproses seluruh gambar, bot menyaring piksel ketat berdasar warna armor musuh, membuat deteksi nyaris seketika. Blok latar warna mirip bisa mengganggu penyaringan ini : tapi di Minecraft, kamu bisa mengganti tekstur.

**OCR (membaca HUD)** :
Karena bot tidak bisa mengambil koordinat dari kode permainan, ia memindai layar waktu nyata untuk mengekstrak :
- Pitch kamera
- Momentum
- Level Y

OCR standar kesulitan dengan teks transparan Minecraft, jadi data kritis dipaksa hitam putih untuk pembacaan seketika.

**Waktu (jendela konteks)** :
- Waktu berlalu sejak kamu menyentuh musuh
- Waktu berlalu sejak ia menyentuhmu
- Buffer geser aksi bot sebelumnya

Ini memberi jaringan konteks temporal : tanpanya, bot tidak tahu apakah ia di tengah combo atau baru memulai tempur.

### Langkah 3 : Bidik vertikal (7 jam lagi)

![The bot learning to aim up and down during RL training](assets/ai-pvp-rl-vertical.png)

Menambahkan gerakan mouse vertikal adalah "bencana total" pada awalnya. Performa awal rusak.

Setelah sejam lagi di bak pasir, bot paham cara melihat ke atas dan bawah. Tapi dalam prosesnya, ia sepenuhnya lupa cara mengikuti horizontal.

Ini **lupa katastrofik** : masalah klasik pembelajaran mesin di mana optimasi untuk data baru menimpa representasi yang dipelajari sebelumnya. Dengan mengoptimalkan bidik vertikal, jaringan saraf tidak sengaja menimpa kemajuan horizontalnya, membuat kreator punya bot yang bisa menjaga bidikannya sejajar tapi tidak bisa mengikuti target.

Butuh **6 jam tambahan** untuk mendapatkan kembali pelacakan horizontal sambil menjaga kendali vertikal. Bot lalu menjaga penempatan bidik yang baik berkat grup OCR yang mengekstrak pitch kamera.

### Langkah 4 : Kendali keyboard

![The bot toggling the W key constantly, learning to commit to movement](assets/ai-pvp-keyboard.png)

Memberi bot izin memakai keyboard membuat karakteristik temporal makin kritis. Awalnya, tombol W terus dinyalakan dan dimatikan : perubahan cepat karena jaringan belum belajar berkomitmen.

Perilaku ini dipenalti, jadi bot belajar menghaluskannya. Ia mulai mendaratkan lebih banyak pukulan sambil sprint (bunyi gedebuk lawan desis pukulan berdiri). Beberapa combo tampak tidak memuaskan karena bot mengeksploitasi keunggulan jangkauannya atas musuh.

Untuk membuatnya adil, kreator meningkatkan jangkauan musuh. Banyak strategi yang dipelajari bot berhenti berfungsi. Tapi seiring waktu, ia beradaptasi.

### Langkah 5 : Mengajari bot kapan mengklik

Untuk fase final, kreator membawa kembali imitation learning : tapi hanya untuk mengajari timing klik, bukan kebijakan kendali lengkap. Bot mencoba meniru pola klik dari duel yang direkam.

Awalnya, ia terlalu takut mencoba apa pun, takut penalti untuk klik yang buruk. Tapi akhirnya ia menemukan keberanian memukul dan mendaratkan pukulan. Tentu saja, ia lupa cara membidik lagi dalam prosesnya : kreator harus membiarkannya sendiri selama **50 jam tambahan** untuk kembali ke keadaan memuaskan.

## Perdebatan curang

Video diakhiri dengan bertanya : apakah bot ini curang?

Argumen kontra : bot hanya memproses apa yang dilihat manusia (piksel yang sama), mengirim masukan keyboard/mouse yang sama seperti manusia (tanpa manipulasi paket seperti anti-knockback), dan tidak membaca memori permainan (tanpa X-ray maupun ESP).

Argumen pro : bot bisa memproses lebih cepat daripada manusia, dan kalau lawan mengira bermain melawan manusia padahal bukan, itu penipuan.

Pendapat kreator : tergantung niat. Kalau kedua pihak tahu itu bot, match adil. Bot merantai musuh di kehampaan dengan rangkaian 100 pukulan.

## Hasilnya

![The bot executing a 100-hit combo](assets/ai-pvp-final-combo.png)

Bot PvP Minecraft yang dilatih pada **laptop tanpa GPU**, dibangun di atas pipeline pelatihan kustom dengan :

- **Tangkapan layar** untuk masukan piksel (2 juta+ piksel → 30 fitur yang dirancang)
- **Pembelajaran kurikuler** (horizontal → vertikal → keyboard → klik)
- **RL untuk kendali motor** + **imitation learning untuk timing klik**
- **Feature engineering** pada piksel mentah (3 grup : penglihatan, OCR, waktu)
- **60+ jam pelatihan** dalam banyak fase

Total waktu pelatihan puluhan jam, tapi sebagian besar pasif. Bot bergetar hingga paham, lupa apa yang dipelajari, belajar ulang, dan akhirnya merangkai rangkaian 100 pukulan.

Videonya ada di [youtube.com/watch?v=j5nxDKAjg6U](https://www.youtube.com/watch?v=j5nxDKAjg6U).

---

*Artikel ini hanya mencakup isi video. Untuk konteks lebih luas soal AI Minecraft : VPT, DreamerV3, dan lanskap imitation learning vs RL : bagian di bawah menghubungkan proyek ini ke bidang yang lebih luas.*

## VPT : Behavior cloning skala besar

![OpenAI's VPT project diagram : the Inverse Dynamics Model predicts actions from pairs of frames](assets/vpt-overview.svg)

Pendekatan "behavior cloning" dari video (Fase 1) adalah teknik yang sama yang dipakai OpenAI dalam proyek **Video PreTraining (VPT)**-nya, tapi di ujung berlawanan spektrum sumber daya. VPT membuktikan imitation learning berfungsi untuk Minecraft ketika kamu punya 70 000 jam video, 720 GPU, dan inverse dynamics model untuk memberi label semu pada data tak berlabel. Kreator di sini membuktikan ia gagal dengan laptop dan 1 000 duel : tapi karena alasan dasar yang sama : imitation learning dibatasi kualitas demonstrasinya.

![OpenAI's VPT agent mining a tree in Minecraft](assets/vpt-minecraft.jpg)

Pipeline VPT menyelesaikan masalah data dengan melatih **Inverse Dynamics Model (IDM)** yang melihat gambar t-1 dan gambar t+1 untuk memprediksi aksi di gambar t. Karena IDM non-kausal (ia melihat gambar masa depan), tugasnya lebih mudah daripada behavior cloning dan membutuhkan jauh lebih sedikit data berlabel. Mereka membayar kontraktor sekitar 2 000 $ untuk 2 000 jam data berlabel, lalu memakai IDM untuk memberi label semu pada 70 000 jam video YouTube Minecraft.

![Laju crafting/pengumpulan menurut volume data pra-pelatihan (skala log) : meja craft, alat kayu, alat batu](assets/vpt-stone-pickaxe-sequence.svg)

Efek skalanya jelas : pada sumbu log dari 1 jam hingga 100 000 jam data pra-pelatihan, laju model membuat meja craft, alat kayu, lalu alat batu menanjak bertahap. Model yang dilatih hanya pada 2 000 jam berlabel kontraktor mentok di meja craft ; dengan menambahkan 70 000 jam berlabel semu oleh IDM (garis putus-putus pada grafik) alat batu muncul secara zero-shot, tanpa satu langkah RL pun.

Model fondasi 0,5B parameter hasilnya mencapai kemampuan zero-shot yang mustahil dengan RL saja : menebang pohon, membuat meja, lompat tiang : dan di fine-tune dengan RL, ia menjadi AI pertama yang membuat alat berlian.

![Reward menurut jumlah episode pelatihan RL : berangkat dari model yang diinisialisasi acak vs berangkat dari model VPT pra-terlatih](assets/vpt-diamond-pickaxe-sequence.svg)

Grafik ini menunjukkan kenapa pra-pelatihan mengubah segalanya untuk RL hilir. RL yang berangkat dari jaringan yang diinisialisasi acak (oranye) tetap datar dekat 0 selama hampir sejuta episode : tugas "mendapatkan berlian" punya reward terlalu jarang sampai agen naif menemukannya lewat eksplorasi acak. RL yang di fine-tune dari model VPT pra-terlatih (hijau) sudah berangkat dengan perilaku dasar (menambang, membuat, menjelajah) dan menanjak stabil hingga reward sekitar 25, yang cocok dengan jalan lengkap menuju pickaxe berlian.

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

*Demo video resmi proyek VPT OpenAI, menunjukkan agen beraksi.*

## OpenAI Five : Masalah reward shaping

![OpenAI Five playing Dota 2 against human professionals](assets/openai-five-dota2.jpg)

OpenAI Five (2019) mengalahkan juara dunia Dota 2 memakai RL murni dalam self-play : tanpa imitation learning. 256 GPU, 128 000 core CPU, 180 tahun permainan per hari, 10 bulan pelatihan.

Tapi fungsi reward dirancang tangan oleh ahli Dota : **28 karakteristik dari 20 000 yang tersedia**, masing-masing dengan bobot yang disetel manual. Nilai bersih, kill, kematian, nyawa tower, penugasan lane : semuanya dipilih dan dibobot manusia. Tanpa pemodelan ini, agen nyaris tidak belajar (eksperimen : reward hanya menang/kalah → mentok di level semi-pro).

Bot dalam video menghadapi masalah yang sama : fungsi rewardnya mengenkode pemahaman kreator tentang apa yang penting di PvP (mendaratkan pukulan baik, terkena pukulan buruk, menjaga bidik baik). Ini tak terhindarkan : RL butuh sinyal reward, dan pemodelan sinyal itu mengenkode bias manusia.

## DreamerV3 : World model dan reward jarang

![DreamerV3 benchmark scores across over 150 diverse tasks with a single configuration](assets/dreamerv3-benchmarks.png)

DreamerV3 dari DeepMind (2023) mengambil pendekatan ketiga. Alih-alih behavior cloning atau RL dengan insentif, ia mempelajari **world model** : jaringan saraf yang memprediksi keadaan masa depan dan reward dari aksi lampau : dan merencanakan dengan memimpikan masa depan yang mungkin. Ini algoritma pertama yang mengumpulkan berlian di Minecraft dari nol tanpa data manusia maupun kurikulum, diterbitkan di Nature pada 2025.

![DreamerV3 learns a world model to imagine future trajectories](assets/dreamerv3-header.png)

Lingkungan berlian mendefinisikan reward jarang atas 12 tonggak (kayu → papan → stik → meja craft → pickaxe kayu → batu → pickaxe batu → bijih besi → tungku → batangan besi → pickaxe besi → berlian), masing-masing memberi +1 sekali saja. Ditambah reward nyawa kecil (±0,01 per hp). Total yang bisa dicapai : 11,1 dalam episode 36 000 langkah.

World model DreamerV3 memungkinkannya membayangkan lintasan dan mengevaluasinya secara internal : aktor belajar dari rollout yang dimimpikan alih-alih pengalaman nyata, menguji ribuan masa depan yang mungkin untuk setiap langkah nyata. Ini membuat reward jarang mungkin di mana mereka akan menghancurkan agen RL standar.

Pada 40 seed yang dilatih untuk 100M langkah lingkungan, 24 dari 40 mengumpulkan setidaknya satu berlian. Berlian pertama muncul setelah 29M langkah (~9 hari pada satu GPU).

## ANNA : AI simbolis bertemu Minecraft

![ANNA's task tree decomposition for a flint-and-steel](assets/anna-task-tree.png)

Sebelum bot PvP video, sebelum VPT dan DreamerV3, ada **ANNA** : bot Minecraft yang dibangun dengan filosofi yang sama sekali berbeda. Alih-alih belajar dari piksel atau reward, ANNA memakai **mesin keadaan simbolis** dengan **parser NLP Prancis** dan **pohon dependensi tugas** yang ditulis tangan.

Dibuat pada 2022 (sebelum "vibe coding" menjadi istilah), ANNA terhubung ke server Minecraft lewat Mineflayer dan memahami perintah bahasa alami dalam bahasa Prancis. Bilang "dapatkan korek api", dan ANNA mengurai kata kerja (dapatkan → memperoleh), mencari resep objek, dan mengurainya rekursif menjadi sub-tugas : menambang oak → membuat papan → membuat stik → membuat meja craft → membuat pickaxe kayu → menambang batu → membuat pickaxe batu → menambang bijih besi → melebur batangan besi → membuat korek api.

![ANNA's NLP parser architecture for French command recognition](assets/anna-nlp-diagram.png)

Lapisan NLP (`utils/id_parser.js`) memecah perintah pada "dan" untuk menangani perintah paralel, memetakan kata kerja Prancis ke tipe tugas, dan menerjemahkan nama objek Prancis menjadi ID Minecraft lewat kamus 5 000 entri. Perintah tak dikenal diteruskan ke sistem percakapan berbasis GPT yang menampilkan ANNA sebagai pendamping Minecraft yang sadar.

**Pohon tugas** (`mc-tasks-tree/`) adalah jantungnya : algoritma rekursif yang melintasi graf objek Minecraft (resep craft, hasil tambang, drop monster, resep tungku) untuk menghasilkan rencana langkah demi langkah. Untuk helm berlian, ia membangkitkan uraian 40+ langkah yang mencakup tingkat kayu, batu, besi dan berlian.

![ANNA's diamond helmet task tree : a 40+ step breakdown](assets/anna-diamond-helmet.png)

Di mana bot PvP video belajar dari pengalaman, ANNA berfungsi dari pengetahuan. Ia tidak butuh 1 000 duel atau 60 jam pelatihan : ia butuh pohon, parser dan server/distributor. Tapi ia juga tidak bisa menggeneralisasi di luar apa yang dienkode pohonnya. Tidak ada jumlah rekayasa mesin keadaan yang akan mengajarinya PvP.

Pendekatan ANNA mencerminkan era AI yang berbeda : sebelum pembelajaran end-to-end mendominasi, ketika janjinya adalah penalaran simbolis yang dikombinasikan dengan rekayasa cermat bisa menghasilkan perilaku cerdas. Hari ini, proyek seperti ANNA dan bot PvP mewakili dua kutub AI Minecraft : satu menalar tentang dunia, satunya memahaminya.

## Master Gumbo's Mace Bot : AI hanya dengan command block

![The Mace PvP training arena with the bot](assets/mace-bot-arena.png)

Di sudut AI Minecraft yang sama sekali berbeda, YouTuber **Master Gumbo** membangun bot latihan PvP memakai **hanya command block**, hanya dengan perintah Minecraft vanilla, redstone, dan carpet mod untuk entitas tiruan pemain. Hasilnya adalah lawan AI untuk massa yang berlatih breach swap, wind charge dan mekanisme perisai dengan pemain.

Bot dimulai sebagai zombie dengan perlengkapan tak bisa hancur dan totem di tangan keduanya (diisi ulang tiap tick lewat `/item replace`), membuatnya efektif abadi. Belakangan, Master Gumbo beralih ke **replica pemain Carpet Mod** yang mendukung mekanik humanoid (mengangkat perisai, mengganti objek) yang tidak bisa dilakukan zombie.

![The settings center : buttons to configure bot behavior](assets/mace-settings-center.png)

Inovasi sentralnya adalah **mesin keadaan yang digerakkan keacakan**. Armor stand di teleport di atas lingkaran blok beton berwarna lewat perintah `/spreadplayers`, yang menyebar entitas acak. Warna blok beton tempat armor stand mendarat menentukan aksi bot berikutnya :

- **Beton merah** → strafe mundur
- **Beton biru** → naik ke atas (menyerang) dengan wind charge
- **Beton hijau** → mengangkat perisai
- **Beton putih** → jeda (menambah jeda antar aksi)

![The AI decision system : an armor stand on colored concrete](assets/mace-ai-system.png)

Posisi armor stand dibaca oleh command block yang mendeteksi blok di bawahnya dan mengaktifkan mekanisme yang cocok. Blok redstone ditempatkan atau dihapus untuk mengaktifkan/menonaktifkan tiap perilaku. Karena `/spreadplayers` berjalan berulang, bot terus mengambil keputusan baru, menciptakan perilaku yang tak bisa diprediksi tapi terstruktur.

Master Gumbo menyebut ini "bentuk AI yang sangat sederhana dan dasar" : ia tidak belajar dari interaksi seperti jaringan saraf, tapi keacakan + mesin keadaan menghasilkan perilaku PvP realistis yang lebih sulit diprediksi daripada bot berskrip. Pusat pengaturan menyertakan antarmuka buku untuk mengaktifkan/menonaktifkan AI, menyesuaikan kesulitan dan mengonfigurasi pola gerakan.

Setelah latihan mereka dengan bot lalu duel melawan pemain yang menyebutnya payah (di intro videonya), Master Gumbo menang. Peta dibagikan lewat Discord, Carpet Mod diperlukan.

![The bot in a duel, practicing mace PvP techniques](assets/mace-final-duel.png)

Di mana bot PvP (Kadambi) belajar dari piksel dan ANNA menalar lewat pohon tugas, bot Master Gumbo mencapai kecerdasan lewat **transisi keadaan acak** : pendekatan command block murni yang membuktikan kamu tidak butuh jaringan saraf untuk membangun lawan PvP yang meyakinkan.

## Altoclef : Baritone + pohon tugas skala besar

Kalau ANNA adalah bot simbolis yang *membaca* untuk tahu apa yang dilakukan, dan Mace Bot mengacak keputusan, **Altoclef** adalah agen otonom lengkap yang *merencanakan* jalannya lewat seluruh permainan. Dibangun oleh gaucho-matero sebagai mod Fabric dan didukung pathfinding **Baritone**, Altoclef mengurai objektif Minecraft apa pun menjadi pohon tugas dan mengeksekusinya tanpa intervensi manusia.

Antarmukanya menipu sederhana : ketik `@gamer` di chat, dan Altoclef memulai tugas "menyelesaikan permainan" dari survival. Ia memanen kayu, membuat alat, menambang besi dan berlian, membangun portal Nether, mengumpulkan blaze rod dan ender pearl, menemukan stronghold, dan membunuh Ender Dragon. Semua otonom, lewat klien Minecraft native, di server vanilla mana pun.

Di balik kapnya, ini dicapai berkat **sistem pohon tugas rekursif** di mana setiap objektif tingkat tinggi (misalnya, "membuat pickaxe berlian") diurai menjadi prasyarat : menambang berlian → meleburnya → membuat stik → menggabungnya. Pohon melintasi graf lengkap resep Minecraft, menangani rantai produksi, drop monster, tabel loot dan akses kontainer. Berlawanan dengan pohon tulis tangan ANNA, tugas Altoclef adalah **kelas Java yang bisa diprogram** yang bisa mengimplementasikan logika sembarang : strategi tempur, barter dengan piglin, pola eksplorasi.

Ide arsitektural kuncinya adalah pemisahan **apa** (pohon tugas) dari **bagaimana** (pathfinding Baritone). Baritone menangani gerakan tingkat rendah : pathfinding, penghindaran rintangan, pemecahan blok, manajemen inventaris, sementara sistem tugas mengatur rencana tingkat tinggi. Modularitas ini berarti tidak ada komponen yang perlu menjadi AI : keduanya algoritma deterministik, tapi kombinasinya menghasilkan perilaku kompleks dan berorientasi tujuan yang menyaingi pendekatan pembelajaran.

Altoclef mewakili batas **AI Minecraft simbolis murni** : ia bisa menyelesaikan permainan dari nol tanpa pelatihan, tanpa GPU, dan tanpa data manusia, tapi ia tidak bisa beradaptasi pada tugas yang tidak diantisipasi programmernya, dan ia tidak bisa belajar dari pengalaman. Ia tahu membuat pickaxe berlian karena kelas Java memberitahunya tepat caranya, bukan karena ia menemukannya sendiri.

## Yang menghubungkan mereka

| Pendekatan | Metode utama | Data | Komputasi | Hasil | |
|--------------------------|---------------------|---------|--------|-----------|-|
| Bot PvP video | RL + imitation learning | 1 000 duel | 1 laptop, 60 jam | Combo 100 pukulan | |
| OpenAI Five | RL self-play | 180 tahun permainan/hari | 256 GPU, 10 bulan | Juara dunia Dota 2 | |
| VPT | IL semi-supervisi | 70 ribu jam YouTube + IDM | 720 GPU, 9 hari | Alat berlian | |
| DreamerV3 | RL model dunia | Trajek yang dimimpikan | 1 GPU, 9 hari | Berlian dari nol | |
| **ANNA** | **NLP simbolis + pohon tugas** | **Resep tertulis** | **1 laptop, instan** | **Objek apa pun yang bisa dicraft** | |
| **Altoclef** | **Baritone + pohon tugas FS** | **Kelas Java tugas** | **Mod Fabric, tanpa GPU** | **Menyelesaikan seluruh permainan** | |
| **Mace Bot** | **Mesin keadaan Command block** | **Keputusan acak** | **Vanilla MC, tanpa GPU** | **Latihan PvP mace** | |

Bot dalam video paling terkendala sumber daya tapi paling jujur soal prosesnya. Ia gagal dulu, lalu beriterasi. Ia lupa apa yang dipelajari, lalu mempelajarinya lagi. Ia berakhir dengan combo 100 pukulan : tapi juga dengan pertanyaan tentang apakah yang dibangunnya curang.

---

**Video** : [AI Learns Minecraft PvP](https://www.youtube.com/watch?v=j5nxDKAjg6U) oleh Kadambi | AI Engineering

**VPT** : [Artikel](https://cdn.openai.com/vpt/Paper.pdf) · [Blog](https://openai.com/index/vpt/) · [GitHub](https://github.com/openai/Video-Pre-Training)

**OpenAI Five** : [Artikel](https://arxiv.org/abs/1912.06680) · [Blog](https://openai.com/index/dota-2/)

**DreamerV3** : [Artikel](https://arxiv.org/abs/2301.04104) · [GitHub](https://github.com/danijar/dreamerv3)

**ANNA** : [GitHub](https://github.com/fox3000foxy/ANNA) · (Node.js, Mineflayer, NLP Prancis, pohon tugas)

**Altoclef** : [GitHub](https://github.com/gaucho-matrero/altoclef) · [Fork aktif](https://github.com/drmcbride12/altoclef) · (Fabric, Baritone, task tree, beats game)

**Mace Bot** : [Video](https://www.youtube.com/watch?v=Fmp2Il70IF8) oleh Master Gumbo · (Command blocks, Carpet Mod, mesin keadaan)
