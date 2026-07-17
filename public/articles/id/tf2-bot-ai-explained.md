---
title: "Bot TF2 Tidak Acak: Saya Merekayasa Balik Setiap Pengaturan Kesulitan"
description: "Visi, pelacakan bidikan, sudut backstab Spy, logika headshot Sniper, setiap bug yang diketahui -- Valve tidak pernah mendokumentasikannya. Jadi kami menggali kode dan mengubahnya menjadi lembar spesifikasi lengkap."
date: 2026-07-12
authors:
  - fox3000foxy
tags:
  - tf2
  - game-ai
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "hgLVCLYqTt35QeyKnL9FVYh7kstu1Shh283Z3Q6wm8LpWkzMEx3Aj56F9RjqnSxu5HGatrOq+3/M71ApeKlCEw=="
---

## Pendahuluan

![Bot Soldier TF2 membidik peluncur roket](assets/tf2-bot-ai-soldier-aim.png)

Setiap pemain TF2 pernah mengatakannya setidaknya sekali: "bot ini curang." Atau sebaliknya: "kenapa bot Easy ini cuma berdiri di sana makan roket." Tidak ada yang benar-benar tahu apa arti "Easy," "Normal," "Hard," dan "Expert" di balik layar -- Valve mengirimkan empat label kesulitan dan tepat nol dokumentasi.

Jadi sekelompok kami (saya, awimii, Mush The Possum, dengan sebagian besar pekerjaan dasar oleh sigsegv, yang benar-benar menggali kode game yang didekompilasi) menyusun dokumen riset lengkap tentang perilaku TFBot. Setiap mekanik, setiap bug yang diketahui, setiap probabilitas yang dikodekan keras. Artikel ini adalah laporan lengkapnya, bukan yang diringkas. Ambil Bonk, ini bacaan panjang.

---

## Bab I: Dasar-Dasar

### Bot vs Puppet Bot

TF2 memiliki dua hal yang sangat berbeda yang disebut "bot":

- **Bot AI (TFBots)**: AI sungguhan, dibangun di atas kerangka PlayerBot/Infected yang sama yang digunakan Valve untuk seri *Left 4 Dead*. Mereka memilih kelas secara acak, bermain untuk tujuan, bekerja tanpa `sv_cheats`, dan memicu pencapaian seperti pemain sungguhan.
- **Puppet bot**: tanpa AI, tidak bisa bergerak atau bertindak sendiri. Mereka ada semata-mata untuk dikendalikan secara manual -- pemain bisa memaksa mereka untuk mengikuti, membidik, dan menembak, biasanya digunakan untuk pengujian atau membuat tangkapan layar/video sinematik. Memunculkannya membutuhkan `sv_cheats 1`, yang juga menonaktifkan pencapaian untuk sesi tersebut.

Artikel ini sepenuhnya tentang jenis yang pertama.

### Apa yang bisa (kurang lebih) diperintahkan ke bot AI

TFBot tidak bisa dikendalikan langsung, tetapi ada daftar pendek hal yang bisa Anda dorong untuk mereka lakukan:

- Arahkan crosshair ke bot mana pun (teman atau musuh) dan bot akan mengejek Anda jika Anda menggunakan voice binds yang benar.
- Bot Medic teman menyembuhkan Anda jika Anda menggunakan perintah suara "Medic!".
- Jika bot Medic sedang menyembuhkan Anda dan memiliki ÜberCharge siap, mengatakan "Go go go!" atau "Activate charging!" membuatnya mengaktifkan charge segera.
- Bot Medic dengan charge siap akan mengaktifkannya secara otomatis saat target penyembuhan atau dirinya sendiri terkena damage serius, tanpa perlu perintah suara.
- Bot secara spontan akan melakukan partner taunt (High Five) atau group taunt (Conga) dengan rekan setim terdekat.

### Membuat bot bekerja di map yang tidak didukung

Bot bergantung pada navigation mesh untuk tahu di mana mereka boleh berjalan, dan kebanyakan map komunitas tidak menyertakannya. Untuk memaksakannya:

1. `sv_cheats 1`
2. `nav_generate` -- membuat navmesh awal, progres ditampilkan di konsol
3. Tunggu game selesai menghasilkan jalur
4. Opsional: perbaiki data nav yang buruk secara manual dengan `nav_edit 1`
5. Muat ulang atau restart server (melewatkan ini menonaktifkan pencapaian)
6. `tf_bot_add <number>` untuk benar-benar memunculkan bot

**Peringatan:** mengubah navmesh saat bot aktif di server bisa membuat game crash. Setelah mesh ada, Anda tidak perlu membuatnya ulang untuk sesi berikutnya -- cukup tambahkan bot lagi dengan `tf_bot_add`.

Mesh yang dibuat otomatis bekerja paling baik di map Control Point, King of the Hill, Payload, dan CTF. Di map Mannpower, bot secara default bermain seperti gaya CTF tetapi jarang menggunakan grapple hook atau powerup. Jika map tidak memiliki tujuan yang dikenali AI bot tetapi memiliki entity spawn room, mengatur `tf_bot_offense_must_push_time 0` memungkinkan bot bertarung.

*(Sumber untuk bagian ini: halaman Bots di Wiki Resmi TF2.)*

### Status terkini, map per map

Berkat pembaruan Hatless, setiap kelas berfungsi dengan benar sekarang, termasuk Spy yang secara historis bermasalah. Bot berperilaku baik di sebagian besar map KOTH resmi, beberapa map Payload, Dustbowl/Gorge Attack-Defense, dan map CTF/Mann Manor -- meskipun di dua yang terakhir Anda tidak bisa memunculkannya langsung dengan `tf_bot_add`. Di map yang tidak didukung (melalui proses nav_generate di atas) mereka tetap bekerja, hanya saja terasa lebih buruk dalam meniru pemain sungguhan.

Map PLR adalah kasus yang sia-sia: bot tidak bisa melewati pembatas di Hightower dan macet di sudut, dan di semua map PLR lainnya mereka... mengadakan pesta dansa alih-alih bermain. Ini mungkin diperbaiki suatu hari nanti. Mungkin tidak.

### Perilaku umum bot

Kumpulan hal-hal yang dilakukan setiap bot terlepas dari kemampuan:

- Bot hanya menggunakan perlengkapan stok (plugin bisa memaksa senjata non-stok pada mereka, tetapi bot vanilla tidak pernah memilih sendiri).
- Bot Easy jarang menyentuh senjata sekunder mereka. Kesulitan lebih tinggi beralih ke sekunder begitu amunisi utama habis, atau untuk mengimbangi jarak.
- Bot tidak bisa melakukan movement tech -- tidak ada rocket jump, tidak ada relokasi bangunan.
- Setelah membunuh, bot mungkin mengejek, bahkan saat ditembaki -- kecuali saat membawa intelijen musuh, dan aturan ini juga berlaku di MvM.
- Bot Spy yang menyamar (pemain atau AI) diabaikan dengan benar oleh bot lain -- sampai mereka menyentuh musuh, menyabot sesuatu, menembak, atau menyelinap di dekat mereka. Setelah "terbongkar," bot/pemain tertentu itu diingat sebagai Spy sampai ia mengganti penyamaran sambil tetap tidak terlihat, mati, atau pura-pura mati dengan Dead Ringer.
- Bot Pyro menggunakan Compression Blast secara bebas pada apa pun di atas Easy.
- Bot Medic memprioritaskan menyembuhkan semua orang daripada Sniper (dan, pada tingkat lebih rendah, Engineer), bahkan jika Anda memencet "Medic!" sebagai salah satunya.
- Bot Medic tertarik pada Heavy, Soldier, Demoman, dan Pyro -- terutama jika *manusia* yang memainkan kelas-kelas tersebut. Jika tidak ada manusia di peran tersebut, tidak ada perhatian khusus dari Medic.
- Bot bertahan selama waktu setup di map Attack/Defense dan Payload -- kecuali Engineer, Sniper, dan Spy, yang bergerak bebas (bot Demoman juga diizinkan untuk menempatkan sticky bomb sebelumnya).
- Bot Engineer tidak pernah meningkatkan atau menghilangkan sabotase dari bangunan Engineer teman, kecuali jika bangunan itu kebetulan berada di jalur target mereka. Mereka juga kadang... tidak memperbaiki turret mereka sendiri, bahkan saat aman untuk melakukannya.
- Bot Spy yang terlihat beralih ke revolver dan mundur alih-alih memaksakan backstab.
- Bot Demoman yang telah menemukan sentry (biasanya dengan mati karenanya sekali) bisa dengan sempurna melemparkan sticky bomb ke atasnya dari luar jangkauan, melengkung melewati dinding dan langit-langit jika geometri memungkinkan.
- Bot Sniper yang tidak bisa menemukan target setelah membidik menggunakan salah satu baris suara "Negative".
- Medic teman akan menyembuhkan Spy yang menyamar tanpa keraguan.

### Masalah/bug yang diketahui

Dokumen tersebut mencantumkan tumpukan keanehan yang sudah berlangsung lama:

- Bot bisa mencoba berjalan atau menembak melalui prop statis tertentu.
- Setiap kali pemain/bot membuka topeng, menyamar, atau terungkap, bot di dekatnya "melihat" itu dan berbalik untuk bereaksi -- bahkan jika kejadian itu terjadi di luar bidang pandang aktual mereka. Ini bukan berbasis suara; ini adalah bypass pemeriksaan penglihatan.
- Jarang, bot bisa saling menempel secara fisik saat menggunakan teleporter Engineer.
- Perintah suara bot (mis. "Spy!", "Forward!") tidak ditampilkan sebagai teks chat seperti milik pemain.
- Bot Medic yang sedang menyembuhkan seseorang tidak akan menghindari tembakan masuk atau mengambil health kit, bahkan saat HP sangat kritis.
- Bot bisa terus bergerak saat melakukan partner taunt, yang merusak efek yang dimaksudkan dari Festive Critical Strike.
- Bot Medic yang baru saja terluka sering menolak menggunakan Syringe Gun dari jarak jauh, lebih memilih pertarungan jarak dekat (atau, dalam kasus yang sangat jarang, mencoba memukul Anda dengan sinar Medi Gun itu sendiri).
- Bot Medic tidak mengompensasi gravitasi pada tembakan Syringe Gun -- kemungkinan karena senjata tersebut tidak ditandai dengan benar sebagai non-hitscan dalam kode AI.
- Bot Spy bisa melihat dan melacak Spy yang terselinap (pemain atau AI) jika Spy itu sudah pernah terbongkar sebelumnya, terlepas dari tingkat kemampuan bot pelacak.
- Bahkan jika pemain-Spy menyamar sebagai kelas timnya sendiri, menabrak musuh masih membongkarnya (bot tidak pernah melakukan ini pada diri mereka sendiri, karena bot tidak pernah menyamar sebagai tim mereka sendiri).
- Bot menghormati auto-balance tim -- jika Anda mencoba menumpuk bot di satu tim, Anda perlu `mp_teams_unbalance_limit 0` terlebih dahulu.
- Bot Engineer bisa mengabaikan bangunan mereka sendiri sampai hancur.
- Bot Heavy kadang mencoba menembak Minigun saat amunisi sangat rendah, sebagian besar di bawah kesulitan Hard.
- Bot Medic tim yang kalah kadang bunuh diri selama fase Humiliasi saat tidak ada musuh di dekatnya -- sesuatu yang tidak bisa ditiru pemain manusia bahkan dengan mencoba.
- Mengatur pratinjau tim layar pemuatan ke BLU membuat bot RED terlihat sebagai BLU bagi Anda.
- Bot dengan senjata jarak dekat kadang menolak mengganti senjata bahkan setelah mengambil amunisi.
- Pasca-Jungle Inferno, bot yang dipanggil dengan parameter eksplisit (mis. `tf_bot_add 5 pyro blue normal`) bisa mati seketika di spawn room mereka sendiri. Perbaikan: `tf_bot_reevaluate_class_in_spawnroom 0` (membutuhkan `sv_cheats 1`).

### Nama AI

Nama bot diambil dari kumpulan besar referensi ke TF2, game Valve lainnya, dan budaya pemrograman, sebagian besar karena komunitas terus meminta nama tertentu di forum Steam. Contoh dari daftar: *AimBot, Aperture Science Prototype XR7, Black Mesa, Companion Cube, C++, Divide by Zero, GLaDOS, H@XX0RZ, Saxton Hale, The G-Man, trigger_hurt, 0xDEADBEEF*, dan puluhan lainnya dengan nada yang sama.

Ada juga sekumpulan nama yang ditemukan dalam source build yang bocor tetapi tidak pernah dirilis dalam produksi, karena alasan yang tidak jelas -- sebagian besar referensi *Last Dragon* dan *The Fifth Element* seperti *John Spartan, Leeloo Dallas Multipass, Sho'nuff, Bruce Leroy, Big Gulp Huh?*, dan *I'm your huckleberry*.

Anda bisa menimpa semua ini sendiri: `tf_bot_add heavyweapons blue "Blu Hoovy"` memunculkan Heavy BLU bernama "Blu Hoovy."

---

## Bab II: Bot Asli / TFBot -- Penyelaman Mendalam Tingkat Kemampuan

Penjelasan asli Sigsegv masih berlaku: jelas bahwa bot Expert mengalahkan bot Easy, tetapi Valve tidak pernah menjelaskan *seberapa banyak* atau *mengapa*. Jadi satu-satunya cara untuk tahu adalah membaca kodenya. Berikut setiap mekanik yang berubah seiring kemampuan.

### Mengatur kesulitan

Di luar MvM, kesulitan dikendalikan oleh satu cvar:

| `tf_bot_difficulty` | Tingkat kemampuan |
| --- | --- |
| 0 | Easy |
| 1 | Normal (default) |
| 2 | Hard |
| 3 | Expert |

`tf_bot_add` juga menerima argumen kesulitan secara langsung (`easy`/`normal`/`hard`/`expert`).

### Popfile MvM

Dalam Mann vs. Machine, setiap blok spawner `TFBot` di popfile memiliki kunci `Skill` opsional. Tanpa kunci berarti Easy. Di misi Valve sendiri: Giant hampir selalu Expert, Engineer dan Spy hampir selalu Expert, dan Sniper biasanya Hard (kadang Expert). Jika Anda menggunakan `EventChangeAttributes` (ditambahkan dalam pembaruan Two Cities) untuk mengubah bot secara dinamis di tengah gelombang berdasarkan peristiwa map, kemampuan bot adalah salah satu properti yang boleh diubah dengan cepat.

### Mode Endless MvM

Mode Endless tidak pernah dirilis secara resmi, tetapi di dalamnya, bot membelanjakan uang mereka untuk upgrade seperti pemain -- termasuk upgrade eksklusif bot yang meningkatkan tingkat kemampuan AI mereka di tengah game.

### Entity `bot_generator`

Entity yang tidak jelas dan sebagian besar tidak terdokumentasi, diyakini telah digunakan dalam mode pelatihan dan mungkin dalam pengembangan awal MvM. Ia mengekspos input `SetDifficulty` untuk mengontrol tingkat kemampuan. Di luar itu, jejaknya menghilang -- Valve tidak pernah mendokumentasikannya dan tidak ada yang memetakan perilakunya secara penuh.

### Warna pancaran mata

Robot MvM memiliki partikel pancaran mata yang berubah warna sesuai tingkat kemampuan -- indikator visual yang tidak pernah dijelaskan oleh siapa pun di luar komunitas:

| Kemampuan | Warna mata | RGB |
| --- | --- | --- |
| Easy/Normal | Biru | `#24b4ff` |
| Hard/Expert | Kuning | `#fff000` |

![Bot Heavy TF2 dalam posisi diam](assets/tf2-bot-ai-heavy-idle.png)

### Visi: waktu pengenalan

Bot tidak bereaksi begitu sesuatu memasuki bidang pandangnya -- ada jeda yang dikodekan keras sebelum seluruh AI diizinkan untuk mengakui ancaman:

| Kemampuan | Waktu pengenalan minimum |
| --- | --- |
| Easy | 1,00 dtk |
| Normal | 0,50 dtk |
| Hard | 0,30 dtk |
| Expert | 0,20 dtk |

Itulah sebagian besar efek "bot Easy terlihat bodoh" dalam satu angka -- bot Easy tidak membidik lebih buruk setelah melihat Anda, hanya butuh waktu lima kali lebih lama untuk menyadari keberadaan Anda.

### Bidikan: tingkat pelacakan

Bot tidak melacak Anda secara terus-menerus. Mereka mengambil sampel posisi dan kecepatan Anda pada interval tetap dan memprediksi garis lurus dari sana:

| Kemampuan | Interval perhitungan ulang | Tingkat ekuivalen |
| --- | --- | --- |
| Easy | 1,00 dtk | 1x/dtk |
| Normal | 0,25 dtk | 4x/dtk |
| Hard | 0,10 dtk | 10x/dtk |
| Expert | 0,05 dtk | 20x/dtk |

**Pengecualian:** Bot Spy dikodekan keras ke tingkat pelacakan Normal terlepas dari tingkat kemampuan sebenarnya -- Spy Expert masih membidik seperti bot Normal. Ada juga video demonstrasi publik yang membandingkan tingkat pelacakan secara berdampingan jika Anda ingin melihat kesenjangan 1x vs 20x dalam gerakan.

### Membidik: kemampuan spesifik senjata

Bot tidak hanya mengarahkan ke pusat massa Anda -- mereka memiliki logika per-senjata, beberapa di antaranya benar-benar bermasalah:

**Grenade Launcher & Sticky Launcher.** Semua tingkat kemampuan mengompensasi lintasan vertikal, menggunakan nilai tetap dari cvar `tf_bot_ballistic_elevation_rate`. Karena kompensasi itu hanya berlaku untuk ID senjata dasar, varian proyektil yang lebih cepat (Loch-n-Load, apa pun dengan pengubah kecepatan proyektil) tidak mendapatkan lintasan yang disesuaikan dengan benar. Dan karena dikunci berdasarkan ID senjata, Loose Cannon -- ID yang berbeda sama sekali -- tidak mendapat kompensasi lintasan sama sekali.

**Huntsman.** Bot Easy tidak mengompensasi jatuhnya anak panah dan tidak pernah membidik kepala. Bot Normal mengompensasi lintasan, tetapi hanya membidik kepala dalam jarak 150 HU. Bot Hard/Expert selalu membidik kepala.

**Peluncur Roket.** Di atas 150 HU, bot non-Easy membidik kaki Anda alih-alih pusat massa, memaksimalkan damage percikan dan peluang knockback. Dalam 150 HU mereka beralih ke headshot. Bot Easy selalu membidik pusat massa terlepas dari jarak. Ini juga terkunci ID senjata: Direct Hit dan Cow Mangler tidak mewarisi perilaku ini. Masuk akal untuk Direct Hit (tanpa AoE untuk dieksploitasi); tidak masuk akal sama sekali untuk Cow Mangler -- bagian AI ini mendahului keberadaan senjata tersebut dan tidak pernah ditinjau ulang.

**Sniper Rifle.** Easy membidik tubuh. Normal membidik sekitar 33% dari tubuh ke kepala. Hard/Expert membidik langsung ke kepala. Kurang berpengaruh di MvM, di mana headshot bot tidak mendapatkan bonus damage.

### Pendengaran: sensitivitas terhadap tembakan sembunyi

Setiap tembakan senjata memberi tahu bot di dekatnya tentang posisi penembak, bahkan melalui dinding, hingga 3000 HU dengan peluang 100% (`tf_bot_notice_gunfire_range`). Tetapi sebagian senjata ditandai "sembunyi" -- hanya terdengar dalam 500 HU (`tf_bot_notice_quiet_gunfire_range`), dan bahkan dengan peluang tergantung kemampuan:

| Kemampuan | Peluang mendengar tembakan sembunyi |
| --- | --- |
| Easy | 10% |
| Normal | 30% |
| Hard | 60% |
| Expert | 90% |

Probabilitas itu dibagi dua jika tembakan *keras* terdengar dalam 3 detik terakhir -- suara keras menutupi suara pelan.

Daftar ID senjata sembunyi belum diperbarui sejak Desember 2010. Apa pun yang ditambahkan setelah tanggal itu menggunakan ID senjata baru diperlakukan sebagai keras secara default, tidak peduli seberapa pelan seharusnya, kecuali jika kebetulan menggunakan ID yang lebih lama. Secara konkret:

| ID Senjata | Mencakup |
| --- | --- |
| `TF_WEAPON_KNIFE` | Semua pisau Spy |
| `TF_WEAPON_FISTS` | Pukulan spesifik Heavy (pukulan multi-kelasnya sebenarnya `TF_WEAPON_FIREAXE`) |
| `TF_WEAPON_PDA` | Diyakini tidak digunakan langsung |
| `TF_WEAPON_PDA_ENGINEER_BUILD` | PDA Pembangunan Engineer |
| `TF_WEAPON_PDA_ENGINEER_DESTROY` | PDA Penghancuran Engineer |
| `TF_WEAPON_PDA_SPY` | Perlengkapan penyamaran Spy |
| `TF_WEAPON_BUILDER` | Perlengkapan Engineer/Sapper Spy |
| `TF_WEAPON_MEDIGUN` | Semua Medi Gun |
| `TF_WEAPON_DISPENSER` | Kemungkinan tidak digunakan (Dispenser adalah objek, bukan senjata) |
| `TF_WEAPON_INVIS` | Semua jam tangan selubung Spy |
| `TF_WEAPON_FLAREGUN` | Semua flare gun Pyro *kecuali* Manmelter |
| `TF_WEAPON_LUNCHBOX` | Sandwich, Dalokohs Bar, Buffalo Steak Sandvich, Bonk!, Crit-a-Cola |
| `TF_WEAPON_JAR` | Jarate (bukan Mad Milk -- ID terpisah, non-sembunyi) |
| `TF_WEAPON_COMPOUND_BOW` | Huntsman |
| `TF_WEAPON_SWORD` | Eyelander, Skullcutter, Claidheamh Mòr, Persian Persuader, Half-Zatoichi |
| `TF_WEAPON_CROSSBOW` | Crusader's Crossbow |

Contoh klasik dari daftar yang membusuk: Manmelter mendapat ID sendiri (`TF_WEAPON_RAYGUN_REVENGE`), ditambahkan setelah daftar sembunyi dibekukan -- jadi diperlakukan sebagai keras, meskipun secara praktis adalah flare gun. Scorch Shot, dirilis bahkan lebih lambat, menggunakan kembali ID dasar `TF_WEAPON_FLAREGUN` dan oleh karena itu masih dianggap sembunyi. Tidak masuk akal, tetapi itulah kodenya.

### Strategi: prioritisasi ancaman

Ketika beberapa musuh terlihat sekaligus, bot mempertimbangkan jarak, apakah mereka sedang ditembaki, dan -- di atas Easy -- apakah ancaman utama sedang disembuhkan:

| Kemampuan | Menargetkan penyembuh sebagai gantinya? |
| --- | --- |
| Easy | Tidak |
| Normal | Peluang 50% |
| Hard | Ya |
| Expert | Ya |

Musuh di atas 500 HU biasanya diprioritaskan lebih rendah sebagai tidak langsung. Pengecualian: bot Hard/Expert selalu menganggap Medic dan Engineer jarak jauh sebagai ancaman langsung, dan setiap Sniper musuh yang membidik ke arah Anda selalu dianggap langsung terlepas dari jarak dan kemampuan.

| Kemampuan | Medic/Engineer jarak jauh / Sniper membidik = ancaman langsung? |
| --- | --- |
| Easy/Normal | Tidak |
| Hard/Expert | Ya |

Pemeriksaan Sniper itu memiliki sejarah yang sungguh menarik. Tulisan asli sigsegv mengasumsikan game membutuhkan perkalian titik antara vektor bidik sniper dan posisi relatif bot menjadi *tepat nol* -- perbandingan yang sangat presisi sehingga hampir tidak pernah terpicu dalam aritmatika floating point, membuat seluruh fitur efektif menjadi kode mati. Koreksi yang dirilis kemudian (berkat pembersihan dekompilasi Hex-Rays) menunjukkan pemeriksaan sebenarnya adalah `perkalian titik > 0`: setiap Sniper yang menghadap ke mana pun dari langsung-ke-Anda hingga tegak-lurus-ke-Anda dianggap ancaman langsung; apa pun dari tegak-lurus hingga membelakangi tidak. Kesalahan pembacaan asli berasal dari dekompilasi buruk dari perbandingan float SSE -- merekayasa balik biner AAA bukanlah ilmu pasti.

### Gerakan: menghindar

Bot Easy tidak pernah menghindar, titik. Bot Normal ke atas menghindar kiri/kanan (33% kiri, 33% kanan, 33% tidak melakukan apa-apa, dibobot terhadap celah yang terdeteksi) ketika mereka memegang senjata tempur, telah melihat musuh dalam 3 detik terakhir, dan musuh itu memiliki garis pandang ke mereka.

Mereka *tidak* akan menghindar jika salah satu dari ini berlaku: atribut `DisableDodge` diatur, perilaku saat ini menyuruh untuk buru-buru, sedang kebal (uber apa pun), sedang mengejek/provokasi, bermain Engineer, tidak terlihat atau menyamar sebagai Spy, membidik sebagai Sniper atau memutar sebagai Heavy, atau sedang menarik Huntsman.

### Gerakan: menghindari mendorong musuh

Di atas Normal, bot secara khusus berusaha untuk tidak menabrak musuh saat bergerak:

| Kemampuan | Menghindari menabrak musuh? |
| --- | --- |
| Easy | Tidak |
| Normal | Tidak |
| Hard | Ya |
| Expert | Ya |

Dalam praktiknya ini hanya benar-benar penting untuk bot Spy -- menghindari tabrakan canggung dengan pemain musuh adalah hal yang bisa membongkar penyamaran.

### Pyro: penguasaan airblast

Airblast melayani dua tujuan: memantulkan proyektil (PvP dan MvM) dan mendorong musuh di dekatnya dari tepi (hanya PvP). Apakah bot benar-benar menarik pelatuk pada kesempatan yang valid adalah lemparan koin berbasis kemampuan:

| Kemampuan | Peluang memicu airblast |
| --- | --- |
| Easy | 0% |
| Normal | 50% |
| Hard | 90% |
| Expert | 100% |

Bot Pyro Easy secara harfiah tidak bisa melakukan airblast -- lemparannya dikodekan keras untuk tidak pernah berhasil, bukan hanya "jarang."

### Spy: efektivitas penyamaran

Dua sumbu terpisah berubah seiring kemampuan. Pemilihan *penyamaran*:

| Kemampuan | Metode penyamaran |
| --- | --- |
| Easy/Normal | Kelas acak, mengabaikan apa yang sebenarnya dimainkan tim musuh |
| Hard/Expert | Memilih pemain musuh sungguhan dan menyalin kelas persis mereka |

*Akting* penyamaran:

| Kemampuan | Perilaku saat menyamar/terselinap |
| --- | --- |
| Easy/Normal | Menatap pemain musuh saat melihat mereka (mencurigakan) |
| Hard/Expert | Sengaja menghindari kontak mata (lebih meyakinkan) |

### Spy: agresivitas backstab

Pada jarak jauh (hingga 300 HU, `tf_bot_spy_knife_range`), bot Spy hanya melakukan backstab jika bisa melihat korban dan punggung korban setidaknya sebagian berbalik. Kemampuan menentukan seberapa jauh dari pusat sudut belakang itu diizinkan:

| Kemampuan | Toleransi sudut |
| --- | --- |
| Easy | Mencoba bahkan jika menghadap Anda langsung |
| Normal | ±45° dari punggung Anda |
| Hard | ±78° dari punggung Anda |
| Expert | ±90° dari punggung Anda (busur 180° belakang penuh) |

Bot Spy Easy secara fungsional adalah bunuh diri -- mereka akan mencoba backstab pada seseorang yang menatap langsung ke mereka. **Pengecualian:** dalam Mann vs. Machine, setiap bot Spy dipaksa ke batasan sudut Normal terlepas dari kemampuan sebenarnya.

### Taktik: pemilihan senjata

Hanya berlaku di atas Easy, dan sebagian besar tidak relevan di MvM karena bot di sana biasanya memiliki batasan senjata yang ketat:

- **Scout**: beralih ke sekunder ketika magazen senjata utama kosong.
- **Soldier**: beralih ke sekunder ketika magazen kosong *dan* target lebih dekat dari 500 HU.
- **Sniper**: beralih ke sekunder untuk target lebih dekat dari 750 HU.
- **Pyro**: beralih ke sekunder untuk target lebih jauh dari 750 HU, kecuali jika target itu adalah Soldier atau Demoman.

### Taktik: isi ulang di balik perlindungan

Tidak digunakan di MvM. Jika perilaku bot saat ini tidak menyuruhnya mundur, magazen utamanya kosong, dan tidak sedang uber, bot dengan kemampuan lebih tinggi akan mundur sementara ke perlindungan untuk mengisi ulang alih-alih mengklik senjata kosong ke arah Anda:

| Kemampuan | Mundur untuk mengisi ulang? |
| --- | --- |
| Easy | Tidak |
| Normal | Tidak |
| Hard | Ya |
| Expert | Ya |

### Mode CP: pengembaraan defender

Tidak digunakan di MvM. Saat mempertahankan control point, bot dengan kemampuan lebih tinggi lebih mungkin meninggalkan point untuk berburu kill ("search and destroy"), tetapi hanya dengan sisa waktu yang cukup pada `tf_bot_defense_must_defend_time`:

| Kemampuan | Peluang mengembara |
| --- | --- |
| Easy | 10% |
| Normal | 50% |
| Hard | 75% |
| Expert | 90% |

### Mode CP: pemblokiran capture

Tidak digunakan di MvM. Bot bertahan yang melawan upaya capture musuh:

| Kemampuan | Akan mencoba memblokir capture? |
| --- | --- |
| Easy | Tidak |
| Normal | Peluang 50% |
| Hard | Ya |
| Expert | Ya |

---

## Tabel ringkasan lengkap

<div style="overflow-x:auto">

| Aspek | Easy | Normal | Hard | Expert | Catatan |
| --- | --- | --- | --- | --- | --- |
| Visi: waktu pengenalan | 1,00dtk | 0,50dtk | 0,30dtk | 0,20dtk | |
| Bidikan: tingkat pelacakan | 1x/dtk | 4x/dtk | 10x/dtk | 20x/dtk | Spy selalu pakai Normal |
| Kompensasi lintasan granat/sticky | Ya | Ya | Ya | Ya | Loose Cannon dikecualikan |
| Kompensasi vertikal Huntsman | Tidak | Ya | Ya | Ya | |
| Headshot Huntsman | Tidak | <150 HU | Ya | Ya | |
| Tembakan kaki Peluncur Roket | Tidak | Ya | Ya | Ya | Direct Hit & Cow Mangler dikecualikan |
| Titik bidik Sniper Rifle | Tubuh | ~33% ke kepala | Kepala | Kepala | |
| Peluang mendengar tembakan sembunyi | 10% | 30% | 60% | 90% | Dibagi dua jika tertutup suara keras |
| Menargetkan penyembuh | Tidak | 50% | Ya | Ya | |
| Medic/Engineer/Sniper jarak jauh = ancaman | Tidak | Tidak | Ya | Ya | |
| Menghindar | Tidak | Ya | Ya | Ya | Daftar pengecualian panjang |
| Menghindari menabrak musuh | Tidak | Tidak | Ya | Ya | Sebagian besar penting untuk Spy |
| Peluang memicu airblast | 0% | 50% | 90% | 100% | |
| Pemilihan kelas samaran Spy | Acak | Acak | Cocok dengan musuh asli | Cocok dengan musuh asli | |
| Kontak mata Spy saat menyamar | Menatap (jelas) | Menatap | Menghindari (meyakinkan) | Menghindari | |
| Sudut backstab Spy | ~0° | ±45° | ±78° | ±90° | MvM memaksa Normal |
| Logika pemilihan senjata | Tidak | Ya | Ya | Ya | Kurang relevan di MvM |
| Isi ulang di perlindungan | Tidak | Tidak | Ya | Ya | Tidak di MvM |
| Pengembaraan defender CP | 10% | 50% | 75% | 90% | Tidak di MvM |
| Pemblokiran capture CP | Tidak | 50% | Ya | Ya | Tidak di MvM |

</div>

---

## Kesimpulan

![Bot Heavy TF2 membidik minigun](assets/tf2-bot-ai-heavy-aim.png)

Tidak satu pun dari ini adalah tebakan yang salah dari pihak Valve -- ini adalah sistem penilaian dan probabilitas yang disengaja, sepenuhnya deterministik, hanya tidak pernah ditulis di mana pun secara resmi. Beberapa hal yang perlu diingat:

1. **"Kemampuan" adalah kumpulan dial independen**, bukan satu pengali global. Waktu reaksi, tingkat bidikan, dan setiap perilaku taktis berskala secara terpisah, dan beberapa (tingkat pelacakan Spy, sudut backstab MvM) mendapatkan timpaan kode keras terlepas dari kemampuan.
2. **Beberapa dari ini benar-benar bermasalah, bukan hanya tua.** Daftar senjata sembunyi yang dibekukan sejak 2010, Cow Mangler yang kehilangan logika tembakan kaki tanpa alasan yang jelas, pemeriksaan perkalian titik Sniper yang butuh waktu bertahun-tahun untuk didekompilasi dengan benar -- kode AI Valve memiliki jaringan parut seperti basis kode berusia 17 tahun lainnya.
3. **Anda bisa menggunakan semua ini.** Ketahuilah bahwa bot Sniper tidak akan melakukan headshot pada Anda di Normal, bahwa Pyro Easy secara harfiah tidak bisa menghembuskan roket Anda kembali, bahwa Spy Easy akan mencoba menusuk Anda secara tatap muka. Ini bukan keberuntungan. Ini adalah lembar spesifikasi.

Terima kasih besar kepada sigsegv untuk penyelaman kode asli yang memungkinkan sebagian besar ini, kepada Wiki TF2 untuk dokumentasi dasar tentang perintah bot dan dukungan map, dan kepada semua orang di komunitas yang masih mengutak-atik AI bot berusia 17 tahun untuk mencari tahu persis mengapa ia melakukan apa yang ia lakukan.
