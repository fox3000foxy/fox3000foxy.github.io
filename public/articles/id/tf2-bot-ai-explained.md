---
title: "Bot TF2 tidak acak : Saya menemukan ulang setiap parameter kesulitan"
description: "Penglihatan, bidikan, sudut backstab, logika headshot, setiap bug yang diketahui -- Valve tidak pernah mendokumentasikan apa pun. Jadi kami menggali kode dan mengubah semuanya menjadi lembar teknis lengkap."
date: 2026-07-12
authors:
  - fox3000foxy
tags:
  - tf2
  - jeu-ia
  - ingenierie-inversee
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "hRPbuey91dj754i6ydwGL0JFesMqwAsOcF7kYrEv/faWQg1x4DlANbaaec6qJtqunow5dQIJat8kjZcLNLl4sQ=="
---

## Pendahuluan

![Bot Soldier TF2 membidik dengan peluncur roket](assets/tf2-bot-ai-soldier-aim.png)

Setiap pemain TF2 mengatakannya minimal sekali : "bot ini curang." Atau sebaliknya : "kenapa bot Mudah ini diam saja makan roket." Tidak ada yang benar-benar tahu apa arti "Mudah", "Normal", "Sulit" dan "Expert" di balik kapnya : Valve mengirim empat label kesulitan dan tepat nol dokumentasi.

Jadi sekelompok dari kami (saya, awimii, Mush The Possum, dengan sebagian besar pekerjaan dasar dilakukan sigsegv, yang benar-benar menggali kode yang didekompilasi permainan) mengumpulkan dokumen riset lengkap soal perilaku TFBot. Setiap mekanik, setiap bug yang diketahui, setiap probabilitas yang di hardcode. Artikel ini adalah laporan utuh, bukan versi ringkas. Ambil Bonk, ini akan panjang.

---

## Bab I : Dasar

### Bot vs Bot Boneka

TF2 punya dua hal yang sama sekali berbeda yang disebut orang "bot" :

- **Bot AI (TFBot)** : AI sungguhan, dibangun di atas framework PlayerBot/Infected yang sama yang dipakai Valve untuk seri *Left 4 Dead*. Mereka memilih kelas acak, memainkan objektif, berfungsi tanpa `sv_cheats` dan memicu achievement seperti pemain sungguhan.
- **Bot Boneka** : nol AI, tidak bisa bergerak atau bertindak sendiri. Mereka ada hanya untuk dikendalikan manual -- pemain bisa memaksa mereka mengikuti, membidik dan menembak. Terutama dipakai untuk pengujian atau untuk membuat tangkapan layar dan video sinematik. Memunculkannya membutuhkan `sv_cheats 1`, yang juga menonaktifkan achievement untuk sesi itu.

Artikel ini sepenuhnya soal tipe pertama.

### Apa yang (kurang-lebih) bisa kita suruh bot AI lakukan

TFBot tidak bisa dikendalikan langsung, tapi kita bisa mendorong mereka melakukan hal tertentu :

- Bidik bot mana pun (sekutu atau musuh) dengan crosshair-mu dan ia akan mengejekmu kalau kamu memakai perintah suara yang benar.
- Bot Medic sekutu menyembuhkanmu kalau kamu memakai perintah suara "Medic!"
- Kalau bot Medic menyembuhkanmu dan punya UberCharge siap, bilang "Go go go!" atau "Aktifkan charge!" membuatnya memicu charge segera.
- Bot Medic dengan charge siap mengaktifkannya otomatis begitu dirinya atau target sembuhannya menerima damage serius, tanpa perintah suara perlu.
- Bot spontan melakukan ejekan duo (High Five) atau ejekan grup (Conga) dengan rekan setim dekat.

### Membuat bot bekerja di peta yang tidak didukung

Bot bergantung pada mesh navigasi untuk tahu di mana mereka boleh berjalan, dan sebagian besar peta komunitas tidak menyediakannya. Untuk memaksa :

1. `sv_cheats 1`
2. `nav_generate` -- membangun navmesh awal, progresi ditampilkan di konsol
3. Tunggu permainan selesai membangkitkan jalur
4. Opsional, perbaiki manual data navigasi yang buruk dengan `nav_edit 1`
5. Muat ulang atau restart server (melewatkan langkah ini menonaktifkan achievement)
6. `tf_bot_add <jumlah>` untuk memunculkan bot

**Peringatan :** mengubah navmesh sementara bot aktif di server bisa men crash permainan. Begitu mesh ada, kamu tidak perlu membangkitkannya ulang untuk sesi mendatang : cukup tambahkan bot dengan `tf_bot_add`.

Mesh yang dibangkitkan otomatis bekerja paling baik di peta Point Kontrol, King of the Hill, Payload dan CTF. Di peta Mannpower, bot bawaan berperilaku ala CTF tapi nyaris tidak memakai grapple atau powerup. Kalau peta tidak punya objektif yang dikenali AI bot tapi punya entitas ruang spawn, menyetel `tf_bot_offense_must_push_time 0` memungkinkan bot tetap bertarung.

*(Sumber untuk bagian ini : halaman Bots di wiki resmi TF2.)*

### Status saat ini, peta per peta

Berkat pembaruan Hatless, setiap kelas berfungsi benar sekarang, termasuk Spy yang historisnya bug. Bot berperilaku benar di sebagian besar peta KOTH resmi, beberapa peta Payload, Dustbowl/Gorge Attack-Defense dan peta CTF/Mann Manor. Pada dua yang terakhir, kamu tidak bisa memunculkannya langsung dengan `tf_bot_add`. Pada peta yang tidak didukung (lewat proses nav_generate di atas), mereka berfungsi, tapi jelas kurang bagus meniru pemain sungguhan.

Peta PLR adalah kasus hilang : bot tidak bisa melewati penghalang di Hightower dan terjebak di sudut, dan di semua peta PLR lain mereka hanya... mengadakan pesta dansa alih-alih bermain. Mungkin akan diperbaiki suatu hari, mungkin tetap begitu.

### Perilaku umum bot

Campuran hal yang dilakukan setiap bot terlepas dari levelnya :

- Bot hanya memakai loadout dasar (plugin bisa memaksa mereka memakai senjata non-standar, tapi bot vanilla tidak pernah memilih sendiri).
- Bot Mudah nyaris tidak memakai senjata sekunder. Kesulitan di atasnya beralih ke senjata sekunder begitu magazen utama kosong, atau untuk mengkompensasi jarak.
- Bot mengabaikan teknik gerakan lanjutan : tanpa rocket jump, tanpa relokasi bangunan.
- Setelah kill, bot bisa mengejek, bahkan di bawah tembakan, kecuali ia membawa intelijen musuh, dan aturan ini berlaku juga di MvM.
- Bot Spy yang menyamar (pemain atau AI) benar-benar diabaikan bot lain : sampai mereka menyentuh musuh, menyabot sesuatu, menembak atau menjadi tak terlihat di dekat musuh. Begitu "ketahuan", bot/pemain spesifik itu diingat sebagai Spy sampai ia berganti samaran sambil tetap tak terlihat, mati atau memalsukan kematiannya dengan Dead Ringer.
- Bot Pyro memakai Compression Blast bebas mulai level Normal.
- Bot Medic memprioritaskan penyembuhan atas semua orang kecuali Sniper (dan, dalam kadar lebih kecil, Engineer), bahkan kalau kamu spam "Medic!" sebagai mereka.
- Bot Medic tertarik ke Heavy, Soldier, Demoman dan Pyro : khususnya ketika *manusia* memainkan kelas itu. Perhatian ini mengikuti kehadiran manusia dalam peran itu.
- Bot tetap di posisi selama waktu persiapan di peta Attack/Defense dan Payload, kecuali Engineer, Sniper dan Spy, yang bergerak bebas (bot Demoman juga diizinkan menaruh bom lengket sebelumnya).
- Bot Engineer tidak pernah meningkatkan maupun menonaktifkan bangunan Engineer sekutu lain, kecuali bangunan itu ada di jalan target mereka. Mereka kadang tidak memperbaiki turret sendiri, bahkan ketika tampaknya jelas.
- Bot Spy yang ketahuan beralih ke revolvernya dan mundur alih-alih memaksakan tikaman pisau.
- Bot Demoman yang telah menemukan sentry (umumnya dengan mati di atasnya sekali) bisa sempurna melempar bom lengket ke atasnya dari luar jangkauannya, melengkung melewati dinding dan langit-langit ketika geometrinya memungkinkan.
- Bot Sniper yang tidak menemukan target setelah membidik memakai salah satu baris suara "Negatives."
- Medic sekutu menyembuhkan Spy yang menyamar tanpa ragu.

### Masalah / bug yang diketahui

Dokumen mendaftar cukup banyak keanehan lama :

- Bot bisa mencoba berjalan atau menembak menembus prop statis tertentu.
- Setiap kali pemain/bot membuka samaran, menyamar atau terungkap, bot dekat "melihatnya" dan berbalik bereaksi : bahkan kalau kejadiannya di luar bidang penglihatan nyata mereka. Ini tidak berdasarkan suara ; ini jalan memutar dari tes penglihatan.
- Jarang, bot bisa terjebak bersama secara fisik memakai teleporter Engineer.
- Perintah suara bot (mis. "Spy!", "Maju!") tidak muncul sebagai teks di chat seperti milik pemain.
- Bot Medic yang aktif menyembuhkan seseorang tidak akan menghindari tembakan masuk maupun mengambil kit penyembuh, bahkan pada HP kritis.
- Bot bisa terus bergerak selama ejekan duo, yang merusak efek yang dimaksud dari Festive Critical Strike.
- Bot Medic yang baru terluka sering menolak memakai Syringe Gun dari jauh, lebih memilih jarak dekat (atau, dalam kasus sangat jarang, mencoba menyentuhmu dengan sinar Medi Gun itu sendiri).
- Bot Medic tidak mengkompensasi gravitasi untuk tembakan Syringe Gun : mungkin karena senjata tidak ditandai benar sebagai non-hitscan dalam kode AI.
- Bot Spy bisa melihat dan mengikuti Spy tak terlihat (pemain atau AI) kalau Spy itu sudah pernah ketahuan sekali, terlepas dari tingkat keterampilan bot yang mengikuti.
- Meski pemain-Spy menyamar sebagai kelas timnya sendiri, menyentuh musuh tetap membuka samarannya (bot tidak pernah melakukan itu pada diri sendiri, karena bot tidak pernah menyamar sebagai timnya sendiri).
- Bot menghormati penyeimbangan tim otomatis : kalau kamu mencoba menumpuk bot di satu sisi, kamu harus dulu memakai `mp_teams_unbalance_limit 0`.
- Bot Engineer bisa sepenuhnya mengabaikan bangunannya sendiri sampai dihancurkan.
- Bot Heavy kadang mencoba menembak Minigun padahal kehabisan amunisi, terutama di bawah level Sulit.
- Bot Medic tim yang kalah kadang bunuh diri selama fase Penghinaan ketika tidak ada musuh dekat -- sesuatu yang tidak bisa direproduksi pemain manusia bahkan dengan mencoba.
- Menyetel pratinjau timmu ke BLU di layar pemuatan membuat bot RED tampak ter render BLU secara visual.
- Bot dengan senjata jarak dekat keluar kadang menolak ganti senjata bahkan setelah mengambil amunisi.
- Setelah Jungle Inferno, bot yang dimunculkan dengan parameter eksplisit (mis. `tf_bot_add 5 pyro bleu normal`) bisa langsung mati di ruang spawn mereka sendiri. Perbaikan : `tf_bot_reevaluate_class_in_spawnroom 0` (membutuhkan `sv_cheats 1`).

### Nama AI

Nama bot diambil dari waduk besar referensi TF2, permainan Valve lain, dan budaya pemrograman, sebagian besar karena komunitas terus meminta yang spesifik di forum Steam. Sampel dari daftar : *AimBot, Aperture Science Prototype XR7, Black Mesa, Companion Cube, C++, Divide by Zero, GLaDOS, H@XX0RZ, Saxton Hale, The G-Man, trigger_hurt, 0xDEADBEEF*, dan puluhan lainnya sejenis.

Ada juga setumpuk nama yang ditemukan dalam build sumber bocor yang tidak pernah dikirim ke produksi, karena alasan yang tidak jelas : terutama referensi *Last Dragon* dan *The Fifth Element* seperti *John Spartan, Leeloo Dallas Multipass, Sho'nuff, Bruce Leroy, Big Gulp Huh?* dan *I'm your huckleberry*.

Kamu bisa mengganti semuanya sendiri : `tf_bot_add heavyweapons blue "Blu Hoovy"` memunculkan Heavy BLU bernama "Blu Hoovy."

---

## Bab II : Bot Asli / TFBot -- Menyelami Tingkat Keterampilan

Kerangka asli Sigsegv tetap bertahan : jelas bot Expert melampaui bot Mudah, tapi Valve tidak pernah menjelaskan *berapa* maupun *kenapa*. Jadi satu-satunya cara tahu adalah membaca kode. Berikut setiap mekanik yang berkembang dengan keterampilan.

### Menyetel kesulitan

Di luar MvM, kesulitan dikendalikan oleh cvar :

| `tf_bot_difficulty` | Tingkat kesulitan |
| --- | --- |
| 0 | Mudah |
| 1 | Normal (bawaan) |
| 2 | Sulit |
| 3 | Expert |

`tf_bot_add` juga menerima argumen kesulitan langsung (`easy`/`normal`/`hard`/`expert`).

### Popfile MvM

Di Mann vs. Machine, setiap blok spawn `TFBot` dalam popfile punya kunci `Skill` opsional. Ketiadaan kunci cocok dengan level Mudah. Di misi Valve : Giant nyaris selalu Expert, Engineer dan Spy nyaris selalu Expert, dan Sniper umumnya Sulit (kadang Expert). Kalau kamu memakai `EventChangeAttributes` (ditambahkan dalam pembaruan Two Cities) untuk mengubah dinamis bot di tengah gelombang menurut event peta, keterampilan bot adalah salah satu properti yang bisa kamu ubah langsung.

### Mode Endless MvM

Mode Endless tidak pernah resmi dikirim, tapi di dalamnya, bot membelanjakan uang mereka untuk peningkatan seperti pemain, termasuk peningkatan eksklusif bot yang menaikkan tingkat keterampilan AI mereka di tengah permainan.

### Entitas `bot_generator`

Entitas yang tidak jelas, sebagian besar tidak didokumentasikan, diduga dipakai dalam mode pelatihan dan mungkin dalam pengembangan awal MvM. Ia mengekspos masukan `SetDifficulty` untuk mengendalikan tingkat keterampilan. Selebihnya, jejaknya dingin : Valve tidak pernah mendokumentasikannya dan tidak ada yang sepenuhnya memetakan perilakunya.

### Warna kilau mata

Robot MvM punya partikel kilau mata yang berubah warna dengan tingkat keterampilan, indikator visual yang tidak pernah dijelaskan siapa pun di luar komunitas :

| Keterampilan | Warna mata | RGB |
| --- | --- | --- |
| Mudah/Normal | Biru | `#24b4ff` |
| Sulit/Expert | Kuning | `#fff000` |

![Heavy bot TF2 en position d'attente](assets/tf2-bot-ai-heavy-idle.png)

### Penglihatan : waktu pengenalan

Bot tidak bereaksi seketika ketika sesuatu masuk bidang penglihatannya : ada penundaan yang di hardcode sebelum sisa AI bahkan diizinkan mengenali ancaman :

| Keterampilan | Waktu pengenalan minimum |
| --- | --- |
| Mudah | 1,00 dtk |
| Normal | 0,50 dtk |
| Sulit | 0,30 dtk |
| Expert | 0,20 dtk |

Ini inti dari efek "bot Mudah tampak bodoh" dalam satu angka : bot Mudah tidak membidik lebih buruk begitu ia memperhatikanmu, ia hanya butuh lima kali lebih lama untuk memperhatikan keberadaanmu.

### Bidikan : laju pelacakan

Bot tidak melacakmu terus-menerus. Mereka mencuplik posisimu dan kecepatanmu pada interval tetap dan memprakirakan garis lurus dari sana :

| Keterampilan | Interval hitung ulang | Laju setara |
| --- | --- | --- |
| Mudah | 1,00 dtk | 1x/dtk |
| Normal | 0,25 dtk | 4x/dtk |
| Sulit | 0,10 dtk | 10x/dtk |
| Expert | 0,05 dtk | 20x/dtk |

**Pengecualian :** bot Spy di hardcode dengan laju pelacakan Normal apa pun tingkat keterampilan nyatanya : Spy Expert selalu membidik seperti bot Normal. Ada juga video demonstrasi publik yang membandingkan laju pelacakan berdampingan kalau kamu ingin melihat kesenjangan 1x vs 20x bergerak.

### Bidikan : keterampilan khusus senjata

Bot tidak hanya membidik pusat massamu : mereka punya logika per senjata, kadang benar-benar bug :

**Peluncur granat dan Peluncur bom lengket.** Semua tingkat keterampilan mengkompensasi busur vertikal, memakai nilai tetap dari cvar `tf_bot_ballistic_elevation_rate`. Karena kompensasi ini hanya aktif untuk ID senjata dasar, varian proyektil lebih cepat (Loch-n-Load, apa pun yang punya pengubah kecepatan proyektil) tidak punya busur yang disesuaikan benar. Dan karena terikat oleh ID senjata spesifik, Loose Cannon (ID berbeda) tidak menerima kompensasi busur apa pun.

**Huntsman.** Bot Mudah tidak mengkompensasi jatuhnya panah dan tidak pernah mencari headshot. Bot level Normal mengkompensasi busur, tapi hanya membidik kepala pada kurang dari 150 HU. Bot Sulit/Expert selalu membidik kepala.

**Peluncur roket.** Di atas 150 HU, bot non-Mudah membidik kakimu alih-alih pusat massa, memaksimalkan peluang damage area dan dorongan. Di bawah 150 HU, mereka beralih ke headshot. Bot Mudah selalu membidik pusat massa apa pun jaraknya. Ini juga terkunci oleh ID senjata : Direct Hit dan Cow Mangler tidak mewarisi perilaku ini. Logis untuk Direct Hit (tanpa efek area yang bisa dieksploitasi) ; nol makna untuk Cow Mangler : bagian AI ini mendahului keberadaan senjata dan tidak pernah ditinjau ulang.

**Senapan sniper.** Mudah membidik badan. Normal membidik sekitar 33% dari badan ke kepala. Sulit/Expert langsung membidik kepala. Kurang penting di MvM, di mana headshot bot tidak mendapatkan bonus damage.

### Pendengaran : sensitivitas pada tembakan diam

Setiap tembakan memperingatkan bot dekat tentang posisi penembak, bahkan menembus dinding, hingga 3000 HU dengan peluang 100% diperhatikan (`tf_bot_notice_gunfire_range`). Tapi subset senjata ditandai "diam" : hanya terdengar dalam 500 HU (`tf_bot_notice_quiet_gunfire_range`), dan bahkan itu pun dengan peluang tergantung keterampilan :

| Keterampilan | Peluang memperhatikan tembakan diam |
| --- | --- |
| Mudah | 10% |
| Normal | 30% |
| Sulit | 60% |
| Expert | 90% |

Probabilitas ini dibagi dua kalau tembakan *berisik* terdengar dalam 3 detik terakhir : suara keras menutupi suara lemah.

Daftar ID senjata diam tidak diperbarui sejak Desember 2010. Semua tambahan berikutnya yang memakai ID senjata baru diperlakukan sebagai berisik secara bawaan, tidak peduli seberapa logis seharusnya diam, kecuali ia memakai ulang ID lama. Konkretnya :

| ID senjata | Mencakup |
| --- | --- |
| `TF_WEAPON_KNIFE` | Semua pisau Spy |
| `TF_WEAPON_FISTS` | Pukulan spesifik Heavy (pukulannya multi-kelas sebenarnya `TF_WEAPON_FIREAXE`) |
| `TF_WEAPON_PDA` | Diduga tidak dipakai langsung |
| `TF_WEAPON_PDA_ENGINEER_BUILD` | PDA pembangunan Engineer |
| `TF_WEAPON_PDA_ENGINEER_DESTROY` | PDA penghancuran Engineer |
| `TF_WEAPON_PDA_SPY` | Kit samaran Spy |
| `TF_WEAPON_BUILDER` | Kit alat Spy/Engineer/Saboteur |
| `TF_WEAPON_MEDIGUN` | Semua Medi Gun |
| `TF_WEAPON_DISPENSER` | Mungkin tidak dipakai (Dispenser adalah objek, bukan senjata) |
| `TF_WEAPON_INVIS` | Semua jam tak terlihat Spy |
| `TF_WEAPON_FLAREGUN` | Semua pistol suar Pyro *kecuali* Manmelter |
| `TF_WEAPON_LUNCHBOX` | Sandwich, Dalokohs Bar, Buffalo Steak Sandvich, Bonk!, Crit-a-Cola |
| `TF_WEAPON_JAR` | Jarate (bukan Mad Milk -- ID terpisah, tidak-diam) |
| `TF_WEAPON_COMPOUND_BOW` | Huntsman |
| `TF_WEAPON_SWORD` | Eyelander, Skullcutter, Claidheamh Mor, Persian Persuader, Half-Zatoichi |
| `TF_WEAPON_CROSSBOW` | Crusader's Crossbow |

Contoh klasik daftar yang membusuk : Manmelter menerima ID sendiri (`TF_WEAPON_RAYGUN_REVENGE`), ditambahkan setelah daftar senjata diam dibekukan, jadi diperlakukan sebagai berisik, meski pistol suar dalam semua arti praktis. Scorch Shot, keluar lebih belakangan, memakai ulang ID dasar `TF_WEAPON_FLAREGUN` sehingga tetap dianggap diam. Gila, tapi itulah kodenya.

### Strategi : prioritas ancaman

Ketika banyak musuh terlihat bersamaan, bot membobot jarak, apakah mereka ditembaki dan, di atas Mudah, apakah ancaman utama sedang disembuhkan :

| Keterampilan | Membidik penyembuh sebagai gantinya? |
| --- | --- |
| Mudah | Tidak |
| Normal | Peluang 50% |
| Sulit | Ya |
| Expert | Ya |

Musuh pada lebih dari 500 HU normalnya dideprioritas sebagai tidak-segera. Pengecualian : bot Sulit/Expert selalu memperlakukan Medic dan Engineer jauh sebagai ancaman segera, dan Sniper musuh mana pun yang membidik kira-kira ke arahmu selalu diperlakukan sebagai segera apa pun jarak dan keterampilannya.

| Keterampilan | Medic/Engineer/Sniper jauh yang membidik = ancaman segera? |
| --- | --- |
| Mudah/Normal | Tidak |
| Sulit/Expert | Ya |

Pemeriksaan Sniper ini punya riwayat mengejutkan yang selalu saya suka ceritakan. Tulisan asli Sigsegv mengasumsikan permainan menuntut dot product antara vektor bidikan sniper dan posisi relatif bot *tepat nol* : perbandingan sepresisi itu hampir tidak pernah terpicu dalam komputasi float, membuat seluruh fungsionalitas efektif kode mati. Koreksi yang diterbitkan belakangan (kredit pada dekompilasi Hex-Rays yang lebih bersih) menunjukkan pemeriksaan nyatanya adalah `dot product > 0` : Sniper mana pun yang menghadap dari langsung ke arahmu hingga tegak lurus denganmu dianggap ancaman segera ; apa pun dari tegak lurus hingga membelakangi tidak. Salah baca aslinya berasal dari dekompilasi buruk atas perbandingan SSE float. Melakukan rekayasa balik pada biner AAA tetap latihan perkiraan.

### Gerakan : menghindar

Bot Mudah tidak pernah menghindar, titik. Bot Normal ke atas menghindar ke kiri/kanan (33% kiri, 33% kanan, 33% tidak melakukan apa-apa, dibobot melawan lubang yang terdeteksi) ketika memegang senjata tempur, telah melihat musuh dalam 3 detik terakhir dan musuh itu punya garis pandang atas mereka.

Mereka *tidak* akan menghindar kalau salah satu kasus ini berlaku : atribut `DisableDodge` disetel, perilaku saat ini bilang bergegas, sedang tak terkalahkan (uber apa pun), sedang mengejek/provokasi, memainkan Engineer, tak terlihat atau menyamar sebagai Spy, sedang membidik sebagai Sniper atau memutar sebagai Heavy, atau sedang menarik Huntsman.

### Gerakan : menghindari menabrak musuh

Di atas Normal, bot secara spesifik mencoba tidak masuk ke musuh saat bergerak :

| Keterampilan | Menghindari menabrak musuh? |
| --- | --- |
| Mudah | Tidak |
| Normal | Tidak |
| Sulit | Ya |
| Expert | Ya |

Dalam praktik, ini hanya penting bagi bot Spy : menghindari tabrakan canggung dengan pemain musuh tepat hal yang membongkar samaran.

### Pyro : penguasaan airblast

Airblast berfungsi untuk dua hal : memantulkan proyektil (PvP dan MvM) dan mendorong musuh di dekat tepi (hanya PvP). Apakah bot menekan pemicu menghadapi peluang valid adalah lemparan koin berdasarkan keterampilan :

| Keterampilan | Peluang memicu airblast |
| --- | --- |
| Mudah | 0% |
| Normal | 50% |
| Sulit | 90% |
| Expert | 100% |

Bot Pyro Mudah secara harfiah tidak bisa airblast : undiannya di hardcode untuk tidak pernah berhasil, bukan sekadar "jarang."

### Spy : efektivitas samaran

Dua sumbu berbeda berkembang dengan keterampilan. Pilihan *samaran* :

| Keterampilan | Metode samaran |
| --- | --- |
| Mudah/Normal | Kelas acak, mengabaikan apa yang benar-benar dimainkan tim musuh |
| Sulit/Expert | Memilih pemain musuh sungguhan dan menyalin tepat kelasnya |

*Perilaku* dalam samaran :

| Keterampilan | Perilaku dalam samaran/ketidaknampakan |
| --- | --- |
| Mudah/Normal | Menatap pemain musuh ketika melihat mereka (mencurigakan) |
| Sulit/Expert | Sengaja menghindari kontak mata (lebih meyakinkan) |

### Spy : agresivitas backstab

Pada jarak jauh (hingga 300 HU, `tf_bot_spy_knife_range`), bot Spy hanya terlibat backstab kalau ia bisa melihat korban dan punggung korban setidaknya sebagian menghadap. Keterampilan menentukan seberapa melenceng sudut punggung ini boleh :

| Keterampilan | Toleransi sudut |
| --- | --- |
| Mudah | Mencoba bahkan kalau kamu menghadapnya langsung |
| Normal | ±45° dari punggungmu |
| Sulit | ±78° dari punggungmu |
| Expert | ±90° dari punggungmu (busur belakang penuh 180°) |

Bot Spy Mudah fungsionalnya bunuh diri : mereka akan mencoba tikaman pisau pada seseorang yang menatap mereka tepat di mata. **Pengecualian :** di Mann vs. Machine, setiap bot Spy dipaksa ke batasan sudut Normal apa pun tingkat keterampilan nyatanya.

### Taktik : pemilihan senjata

Logika ini hanya menyangkut level di atas Mudah, dengan kepentingan berkurang di MvM karena bot di sana umumnya punya pembatasan senjata ketat :

- **Scout** : beralih ke senjata sekunder ketika magazen primer kosong.
- **Soldier** : beralih ke senjata sekunder ketika magazen kosong *dan* target kurang dari 500 HU.
- **Sniper** : beralih ke senjata sekunder untuk target kurang dari 750 HU.
- **Pyro** : beralih ke senjata sekunder untuk target lebih dari 750 HU, kecuali target itu Soldier atau Demoman.

### Taktik : mengisi ulang di balik perlindungan

Logika absen dari MvM. Kalau perilaku bot saat ini tidak menyuruhnya mundur, magazen utamanya kosong dan ia tetap rentan tanpa uber, bot level atas mundur sementara ke perlindungan untuk mengisi ulang alih-alih mengklik senjata kosong menghadapimu :

| Keterampilan | Mundur untuk mengisi ulang? |
| --- | --- |
| Mudah | Tidak |
| Normal | Tidak |
| Sulit | Ya |
| Expert | Ya |

### Mode CP : pengembaraan pembela

Logika absen dari MvM. Saat membela point kontrol, bot level atas lebih mungkin meninggalkan point untuk memburu kill ("search and destroy"), tapi hanya dengan waktu tersisa yang layak di `tf_bot_defense_must_defend_time` :

| Keterampilan | Peluang mengembara |
| --- | --- |
| Mudah | 10% |
| Normal | 50% |
| Sulit | 75% |
| Expert | 90% |

### Mode CP : pemblokiran capture

Logika absen dari MvM. Bot pembela yang memperebutkan upaya capture musuh :

| Keterampilan | Akan mencoba memblokir capture? |
| --- | --- |
| Mudah | Tidak |
| Normal | Peluang 50% |
| Sulit | Ya |
| Expert | Ya |

---

## Tabel rekap lengkap

<div style="overflow-x:auto">

| Aspek | Mudah | Normal | Sulit | Expert | Catatan |
| --- | --- | --- | --- | --- | --- |
| Penglihatan : waktu pengenalan | 1,00 dtk | 0,50 dtk | 0,30 dtk | 0,20 dtk | |
| Bidikan : laju pelacakan | 1x/dtk | 4x/dtk | 10x/dtk | 20x/dtk | Spy selalu memakai Normal |
| Kompensasi busur granat/bom lengket | Ya | Ya | Ya | Ya | Loose Cannon dikecualikan |
| Kompensasi vertikal Huntsman | Tidak | Ya | Ya | Ya | |
| Headshot Huntsman | Tidak | <150 HU | Ya | Ya | |
| Tembakan kaki Peluncur roket | Tidak | Ya | Ya | Ya | Direct Hit dan Cow Mangler dikecualikan |
| Titik bidik Senapan sniper | Badan | ~33% ke kepala | Kepala | Kepala | |
| Peluang memperhatikan tembakan diam | 10% | 30% | 60% | 90% | Dibagi dua kalau tertutup tembakan berisik |
| Membidik penyembuh | Tidak | 50% | Ya | Ya | |
| Medic/Engineer/Sniper jauh = ancaman | Tidak | Tidak | Ya | Ya | |
| Menghindar | Tidak | Ya | Ya | Ya | Daftar pengecualian panjang |
| Menghindari menabrak musuh | Tidak | Tidak | Ya | Ya | Terutama penting untuk Spy |
| Peluang memicu airblast | 0% | 50% | 90% | 100% | |
| Pilihan kelas samaran Spy | Acak | Acak | Cocok musuh sungguhan | Cocok musuh sungguhan | |
| Kontak mata Spy dalam samaran | Menatap (jelas) | Menatap | Menghindari (meyakinkan) | Menghindari | |
| Sudut backstab Spy | ~0° | ±45° | ±78° | ±90° | MvM memaksa Normal |
| Logika pemilihan senjata | Tidak | Ya | Ya | Ya | Kurang relevan di MvM |
| Mengisi ulang di balik perlindungan | Tidak | Tidak | Ya | Ya | Tidak di MvM |
| Pengembaraan pembela CP | 10% | 50% | 75% | 90% | Tidak di MvM |
| Pemblokiran capture CP | Tidak | 50% | Ya | Ya | Tidak di MvM |

</div>

---

## Kesimpulan

![Bot Heavy TF2 membidik dengan minigun](assets/tf2-bot-ai-heavy-aim.png)

Semua ini mencerminkan sistem Valve yang disengaja : skor dan probabilitas yang sepenuhnya deterministik, hanya tidak pernah didokumentasikan resmi. Berikut poin yang saya ingat setelah penyelaman ini :

1. **"Keterampilan" adalah himpunan slider independen**, bukan pengali global. Waktu reaksi, irama bidikan dan setiap perilaku taktis berkembang terpisah, dan sebagian (laju pelacakan Spy, sudut backstab MvM) punya timpaan yang di hardcode apa pun levelnya.
2. **Sebagian benar-benar bug, bukan sekadar tua.** Daftar senjata diam yang beku sejak 2010, Cow Mangler tanpa logika tembakan kaki tanpa alasan bagus, pemeriksaan dot product Sniper yang butuh bertahun-tahun untuk didekompilasi benar : kode AI Valve punya bekas luka seperti basis kode 17 tahun mana pun.
3. **Kamu bisa memakai semua ini.** Ketahuilah bahwa bot Sniper tidak akan meng headshotmu di Normal, bahwa Pyro Mudah secara harfiah tidak bisa memantulkan roketmu, bahwa Spy Mudah akan mencoba menikammu tatap muka. Ini bukan keberuntungan. Ini lembar teknis.

Terima kasih besar untuk sigsegv atas penyelaman kode asli yang membuat sebagian besar ini mungkin, untuk wiki TF2 atas dokumentasi dasar perintah bot dan dukungan peta, dan untuk semua orang di komunitas yang terus mengutak-atik AI bot berusia 17 tahun untuk memahami tepat kenapa ia melakukan apa yang dilakukannya.
