---
title: "Chlone : enam hari untuk mengkloning cara saya bicara di Discord"
description: "Kisah build, hari demi hari : bagaimana agen opencode bernama chloeai, yang terhubung ke memori OpenSelf, belajar bicara seperti saya di Discord dalam enam hari dan 146 commit."
date: 2026-09-18
tags: ["discord", "ai", "llm-agents", "openself", "python", "selfbot", "clone"]
authors: ["itsrealfortune"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "jzivbjSZhVi+34L9M/mHnqLbv8IiH1zZXhOZDk4cf3M75PGi3VbKn1bAvz9RTFns08msWiyMAsYkG40R0dFYaA=="
---

# Chlone : enam hari untuk mengkloning cara saya bicara di Discord

*Kisah build, hari demi hari - oleh itsrealfortune*

---

Inilah kisah nyata proyek yang berlangsung enam hari : **Chlone**, bot Discord yang bicara seperti saya. Saya menceritakan perjalanannya sebagaimana terjadi, dalam urutan 146 commit repo, dengan jam, kegagalan, jalan memutar dan keinginan membuang segalanya lewat jendela, tapi tanpa membebanimu dengan pesan commit.

Semuanya berawal dari **kompetisi dengan Fox**. Subjeknya, candaan : masing-masing harus menghidupkan tiruannya sendiri di Discord. Dan saya mengambil pendekatan yang sangat berbeda dari **Protocol Luna** : saya ingin bertaruh pada agentik, agen yang memakai kenangan dan semua alat yang mungkin dibutuhkan AI. Ironi nasib : setelah membangun seluruh kotak alat, saya hanya butuh MCP OpenSelf.

Prinsipnya, satu kalimat : agen [opencode](https://opencode.ai) bernama `chloeai` berjalan di balik server HTTP (port 4096), menjaga sesi persisten per kanal, mengambil kenanganku di OpenSelf, dan menulis dengan gayaku, yang ditangkap dalam `STYLE.md` dari pesan asliku. Dan supaya tidak terdengar robot : burst pesan, salah ketik yang disadari, vokal, GIF, reaksi, diam ketika saya tidur, dan banyak detail dan mekanisme lain yang membuat lebih dari selusin orang ragu tentang sifat bot.

**Apa itu, OpenSelf?**

OpenSelf adalah memori. CLI (`openself`, dipasang lewat `npm i -g openself`) yang berfungsi sebagai vault konteks privat dan persisten untuk agen AI saya. Di repo ia tidak muncul dalam pohon, tapi ada di mana-mana : dalam arsip `ecosystem.config.cjs` (MCP dan dashboard OpenSelf yang dijalankan di bawah PM2 sejak commit pertama), dalam `setup.sh` (`npm i -g openself`), dan dalam seluruh `tools/brain/memory.py`.

Konkretnya, OpenSelf adalah :

- **kenangan bertipe** (`fact`, `preference`, `decision`, `relationship`, `event`, `note`), dengan sensitivitas (public / personal / private / restricted), catatan kepercayaan, sumber, tag ;
- **scope** : setiap kenangan termasuk konteks, milik saya, atau `discord/dm/<id>` untuk orang tertentu ;
- **pencarian hibrida** (leksikal + vektorial) yang diekspos dalam MCP (`openself_openself_search_memory`, `openself_openself_get_context`) yang ditanyai agen `chloeai` sebelum setiap respons ;
- **deteksi konflik** (sweep bulanan saya di hari 5) dan dedupe saat penulisan ;
- **vault terenkripsi** (kunci di Bitwarden) dan **dashboard lokal** (port 3210) untuk memeriksanya ;
- dan bagi yang lebih malas dariku : `openself feed` untuk memberi makan kepribadianmu dari riwayat WhatsApp/Telegram-mu, `openself test`, `openself share` ("Talk to My Clone", halaman web), `openself arena` (dua tiruan berdebat) atau `openself ghost` (ia menjawab ketika kamu offline). Saya membuat milik saya manual, tapi infrastrukturnya ada.

Secara teori, OpenSelf cukup sendiri untuk punya tiruan, tapi mengingat semua yang saya rencanakan tambahkan sebagai fitur, dan mengingat Discord tidak didukung, saya memilih hanya memakai bagian kenangan.

**Dan dari mana kenangan dan gaya berasal?**

Sebelum semua itu, saya menganalisis pesan Discord asliku. Tooling menyaring DM dan kanalku untuk mengekstrak dua hal :

1. **Profil menulisku** - distribusi huruf besar/kecil di awal kalimat, jumlah emoji per pesan dan posisinya, tanda baca (atau ketiadaannya : kalimat tanpa titik akhir dalam percakapan normal), panjang rata-rata, slang (`mdr`, `tkt`, `tho`), ekspresi favorit ("Bah", "En vrai") dan refleks seperti `quoi` -> `Feur`. Semua itu hidup di `STYLE.md`, yang dibaca agen saat startup setiap sesi.
2. **Korpus kenangan** yang mengisi OpenSelf : siapa orang yang saya ajak bicara, apa yang dibicarakan, apa yang perlu diingat dari riwayat kita, siapa siapa. Bot tidak menjawab dalam kehampaan : ia menjawab *tentang* orang yang "dikenalnya". Ia membaca kenangan orang yang muncul dalam percakapan untuk tahu siapa mereka. Itu memungkinkan menjaga konteks persisten tentang orang lain, tidak melupakan mereka.

Bot tidak menciptakan apa pun : ia dikalibrasi angka per angka pada yang nyata. Makanya terdengar pas, dan perkiraan "saya mencatat gayamu" yang dibuat kira-kira tampak menyedihkan di sampingnya.

Di Chlone, OpenSelf lalu memainkan peran sentral : ketika sesuatu yang penting lewat di kanal (kata kunci "proyek", "teman", "relasi", atau permintaan eksplisit "ingat bahwa..."), bot mengetik kenangan ke vault lewat `save_to_memory`, bertipe, di scope per orang, di dedupe, diverifikasi terhadap konflik. Dan ketika percakapan berlanjut, agen menggali kenangannya sebelum menjawab. Itulah perbedaan antara cermin dan tiruan.

---

---

## JUMAT 11 SEPTEMBER - Hari 1 : percikan

### 08.24 - commit pertama

Semuanya berangkat dari nol, tapi semuanya sudah ada, berantakan. `discord_watch_bot.py` 372 baris, selfbot yang mendengarkan channel dan menjawab lewat server HTTP opencode. Prompt identitas `CHLOEAI_PROMPT.md`. `STYLE.md`. Skenario dan laporan uji untuk tiruan yang, waktu itu, masih bernama **Mimo**. Config PM2 untuk menjalankan MCP dan dashboard OpenSelf. Dan basis data sqlite yang berfungsi sebagai konteks.

Ini chaos pendiri. Saya tidak merencanakan proyek : saya merencanakan eksperimen. Bisakah kita membuat bot yang terdengar *sungguh* manusiawi di Discord?

### 08.27 - gitignore pertama

Pelajaran pertama Jumat pagi : jangan pernah meng commit basis data sqlite `-wal` / `-shm`. Berkas penguncian SQLite bukan memori, melainkan sampah. `.gitignore` lahir.

### 08.44 - merapikan warisan

Saya merapikan warisan Mimo : laporan uji, skenario, skrip integrasi, config PM2. Arah `archives/`. Saya tidak menghapus apa pun, proyek terlalu muda untuk saya buang. Ini akan menjadi kebiasaan.

Laporan uji layak berhenti sejenak : Mimo telah diuji pada **15 skenario** (chat santai, candaan absurd, dukungan emosional, opini negatif, konflik dengan orang asing, proposal kolaborasi...) untuk **9.1/10**. Komentar penguji adalah puisi : *"candaan absurd terlalu menjelaskan"*, *"kadang 2 kalimat padahal 1 cukup"*, *""Jaga dirimu juga" agak panjang"*. Ini peta jalan proyek bahkan sebelum proyek ada : **pendek = lebih baik**.

### 08.48, 09.07 - bolak-balik intent

`.pyc` dibuang, dan bersih-bersih pertama pada config... yang saya rusak dua puluh menit kemudian : tanpa intent diaktifkan, kita tidak menerima isi pesan. Kembali, ditambah skrip peluncuran (`run_watch_bot.sh`). Bolak-balik dalam 20 menit : itulah eksplorasi. Menulis versi pertama, merusak, menulis ulang.

### 09.13 → 09.58 - penghalusan prompt

Paginya adalah rangkaian pemolesan, pertama gaya, lalu konteks :

- beberapa baris respons = beberapa pesan dikirim satu demi satu (burst), prompt menjadi sadar percakapan berjalan ;
- selesai sudah cache buatan sendiri untuk mengambil DM : kita menembak langsung REST API Discord ;
- identitas diingatkan ulang setiap 5 pesan, supaya bot tidak lupa siapa dirinya di tengah jalan ;
- pelacakan penulis yang sudah dilihat : untuk wajah baru, instruksi eksplisit untuk mencari dalam kenangan ;
- menampilkan nama asli alih-alih objek internal ;
- pesan yang kita pilih abaikan menjadi konteks pasif untuk respons berikutnya ;
- "Bah" ditakar : jarang, kalau tidak tiruan menjadi karikatur diriku ;
- bot tahu ada kenangan yang perlu dicari sebelum menjawab.

Setiap lintasan adalah putaran sekrup. Bot "bicara", pada tahap ini, hanya karena saya mengingatkannya siapa dirinya dalam interval teratur.

### 10.16 - salah ketik

Commit yang akan mendefinisikan proyek. Salah eja bukan bug : melainkan **bukti kemanusiaan**. Peluang 6% salah ketik pada keyboard AZERTY, 4% menukar dua huruf. Pesan berangkat dengan salahnya, lalu **diedit 1-2 detik kemudian** dengan koreksi. Karena orang sungguhan mengirim lalu memperbaiki.

### 10.29, 10.32 - suara

`fortune-v6.onnx` : model TTS, dilatih menyerupai suara*ku*. Bot tidak hanya akan menulis seperti saya, ia pada akhirnya akan *bicara* seperti saya. Di sinilah proyek berhenti menjadi lelucon dan menjadi agak aneh. Saya suka.

Mekanikanya muat dalam satu commit : Piper membangkitkan audio, ffmpeg mengonversi ke opus, API Discord mengirim "voice message" sungguhan dengan waveform dan durasi. Dibuat dalam 3 menit setelah model tiba. Keinginannya sudah ada sejak awal.

### 11.27 - refactor besar pertama

Tiga jam setelah commit pertama, monolit 456 baris tidak lagi bisa dikelola. Saya memecahnya ke `tools/` : `config.py`, `discord_api.py`, `memory.py`, `opencode.py` (188 baris), `typo.py`, `voice.py`. Siklusnya klasik : menggandeng cepat, merusak, menyusun ulang.

Mengikuti, beruntun :

- token keluar dari kode dan lewat `.env` ;
- bot mengawasi satu channel, daftar, atau semua (`*`) ;
- basis data sqlite lama tidak ada gunanya lagi : memori lewat OpenSelf ;
- `README.md` pertama, dan dok pertama yang kurang-lebih bisa dibaca ;
- `setup.sh` : venv khusus (python sistem membawa discord.py lain, jebakan klasik), symlink agen ke `~/.config/opencode/agents/`, siap jalan ;
- memori tahu *di mana* ia dilatih (pengenal channel), dan laju vokal menyesuaikan.

### 12.00 - refleks

Bagian baru di STYLE : refleks. Refleks adalah stimulus -> respons, tanpa refleksi. Pintu terbuka untuk respons absurd.

Lalu tiba jam makan siang, dan pertanyaan eksistensial : apakah bot menjawab `Feur` ketika dikatakan `quoi`?

### 13.03 - "quoi ?" -> "Feur"

Ya. Tentu saja ya. Ini commit terpenting proyek, secara budaya. Saya bahkan akan bilang : satu-satunya unit test yang penting.

Lalu kita lumasi :

- penulis ditampilkan lewat *global name* mereka ;
- tanda baca dipotong sebelum menguji refleks (harus memotong `quoi ?`, kalau tidak `Feur` tidak berangkat) ;
- `tqt` terkenal yang dikoreksi menjadi `tkt` di STYLE, orang yang tidak kenal proyek akan bertanya kenapa saya meng commit itu. Saya tahu : tiruan yang menulis `tqt` adalah tiruan yang salah kalibrasi, dan tidak ada yang ingin bicara dengan tiruan yang salah kalibrasi ;
- mention `@123456789` diganti nama sungguhan dalam konteks ;
- bot mulai mengawasi semua kanal secara bawaan.

### 16.37 - keheningan

`[void response]`. Bot mempelajari kata terpenting agar tidak menjadi parasit sosial : **diam**. Pesan ambien antara dua orang yang tidak menyangkutnya memanggil keheningan. Cadangan adalah fitur.

**Akhir hari 1 : 38 commit. Bot menulis, salah, bicara, diam.**

---

---

## SENIN 14 SEPTEMBER - Hari 2 : kepribadian

Kita lanjut, jam 10 pagi.

### 10.12 - siapa bicara dengan siapa

Setiap nama yang diterima diawali emoji oleh sistem : 🧑 manusia, 🤖 bot (diperlakukan lebih kering), 👑 **kreator, yaitu saya** pada akun utama saya. Konvensi ini akan memerintah sisa proyek : tiruan tidak boleh memperlakukan "model aslinya" sebagai orang asing.

### 10.16 - aturan tanda baca

Saya memformalkan di STYLE : kalimat tanpa titik akhir dalam percakapan normal, titik disediakan untuk situasi serius. Aturan mutlak. Tiruan yang menaruh titik di mana-mana langsung terasa.

### 10.58 - GIF

Pustaka GIF pribadi saya, dengan aturan pakainya : Patrick Jane ketika saya memprediksi seseorang, Miss Fortune ketika saya tenang menghadapi orang yang kesal, gif bescherelle yang jatuh ketika lawan membuat salah. MCP statis mengeksposnya ke agen. Bot, lewat GIF saya, menjadi sedikit saya.

### 11.07 → 11.35 - penghalusan

Hint GIF di prompt dihaluskan, emoji kustom Discord masuk (milik saya yang asli, 14 ID terbaru), dan manajemen nama dalam hint memori dipoles.

### 11.41 - satu kanal, satu kepribadian

Sesi menjadi **per kanal** : saya tidak bicara dengan cara yang sama di dua server berbeda, dan bot juga tidak.

### 12.02 - kotak alat ekspresi

Prompt kini tahu mengusulkan GIF *dan* emoji kustom saya pada momen yang tepat. Kotak ini terisi, dan bot mulai punya pilihan alih-alih selalu menjawab sama.

### 12.37 - higiene identitas

- bot TIDAK PERNAH berhak bilang model apa ia, mustahil menyebut opencode, provider, nama model ;
- koreksi "barista" dalam identitas (bot sudah lebih baik dariku) ;
- saya menghabiskan sejam menyelaraskan tanda baca prompt saya sendiri, yang ironisnya sempurna.

### 12.50 - skrip membangun kepribadian

Bagian media dari prompt dibangkitkan dari kamus (`render_medias.py`), selesai sudah edit tangan.

### 12.59 → 13.18 - menakar identitas

Pengingat identitas, yang dikirim setiap 5 pesan, menjadi terlalu hadir : beralih setiap 20 pesan. Menambahkan reset konteks yang bersih. Dan membersihkan panduan gaya : kita menghapus ekspresi dan formulasi negatif yang kedaluwarsa.

### 14.09 - bot bicara sendiri

Bot berhenti menjadi refleks : ia bisa **bicara tanpa disapa**, ketika konteks memicu sesuatu (berkas `behavior.py` lahir, 91 baris). Di sinilah kita beralih dari "penjawab" ke "kehadiran" : teman sungguhan bisa menulis padamu duluan.

### 14.20, 14.22 - membuat respons andal

Penanganan error ketika pengiriman gagal, dan kemungkinan reaksi alih-alih respons, kadang reaksi lebih berarti seribu kata.

### 18.16 - meluangkan waktu

Bot tidak lagi menjawab dalam 200ms seperti skrip. Ia membiarkan penundaan ketidakaktifan manusiawi lewat, ia "meluangkan waktu". Inilah yang membuat bot tak terdeteksi dalam demo : penundaanlah yang selalu mengkhianati yang lainnya.

### 23.45 - kerjaan malam

Hampir tengah malam dan saya mendorong deteksi URL yang diperluas ke domain telanjang. Inilah ritme nyata harinya : kemajuan cemerlang jam 14.00, lalu kerjaan malam karena saya masih di zona.

**Akhir hari 2 : 61 commit kumulatif. Bot punya kepribadian, media, refleks.**

---

---

## SELASA 15 SEPTEMBER - Hari 3 : hari monster

57 commit dalam sehari. Inilah hari ketika proyek menjadi... semua yang ia wakili hari ini.

### 08.18 → 08.37 - penyerutan pagi

- penundaan ketidakaktifan yang kita ciptakan menjadi terlalu panjang : dibatasi 30 detik (dan disesuaikan dua kali, bukti kita meraba nilai yang benar) ;
- berkas `.bak` pertama dan simpanan pertama basis data : insting konservasi berkembang ;
- memori mengingat *siapa* (nama tampilan) dan *dalam rangka apa* (scope) ;
- ID penulis bersirkulasi di seluruh pipeline penyimpanan ;
- manajemen "kreator" menjadi daftar admin sungguhan (`ADMIN_IDS`), dan semua yang menyentuh penulis bermigrasi ke `authors.py`. Monolit terpecah lagi.

### 08.43 - daftar TODO humanisasi

Daftar khusus untuk hal kecil yang membuat mesin tidak lagi terasa. Ini peta jalan sprint berikutnya.

### 08.44 → 08.46 - pakta mesin manusiawi

- bot diam di malam hari, dalam rentang jam tenang yang bisa dikonfigurasi (dinonaktifkan secara bawaan, tidak semua orang punya jadwalku) ;
- satu baris per respons bisa kehilangan aksen. Orang lelah menulis begitu. Bot juga, kadang ;
- baris kecil "Chloé bermain ..." berubah sendiri setiap 30 menit, supaya profilku tampak hidup bahkan tanpa pesan.

### 08.46 - reaksi, bukan novel

Pesan terlalu lemah untuk layak kalimat? Reaksi cukup. Ekonomi energi sosial, dan itu sangat saya.

### 08.51 - PARRY, mood

148 baris di `tools/mood.py`. Bot kini punya **mood**, ala sistem PARRY (chatbot psikotik tahun 70-an, yang saya inspirasi terbuka) : energi, sosiabilitas, godaan, tiga float yang berkembang antara 0 dan 1 dan mewarnai setiap respons. `.mood.json` saat itu, untuk anak cucu : energi 0.88, sosiabilitas 0.68, godaan 0.56. Hari yang baik.

### 09.00 → 09.43 - suara dua arah + soundboard

- bot bisa bergabung ke kanal **vokal**, bicara lewat Piper, dan pergi sendiri ketika selesai ;
- lalu ide besar kedua : bot **mendengarkan** kanal (tangkapan RTP, deteksi bicara VAD, transkripsi Whisper), dan bisa membiarkan orang memotongnya ;
- di antara keduanya, soundboard muncul : katalog suara dengan maknanya, agen **memilih** suara bahkan sebelum bicara, dan aturan akhirnya adalah "soundboard dulu, suara sebagai pilihan terakhir", bot lebih suka mengirim suara daripada bicara. Seperti saya ;
- pengaturan probabilitas vokal yang membuat semuanya viable ;
- dan kedatangan `davey`, lib yang saya pelajari keberadaannya sepuluh menit lalu dan akan saya kutuk selama sejam.

### 09.51 - momen ketika Discord bilang tidak. Tidak, tidak, tapi tidak.

**MLS** tiba. Discord baru-baru ini mengenkripsi aliran audio end-to-end, dan tangkapan saya hanya menerima noise. Harus mendekripsi, dan dekripsi menolak menyerah. Terbuka saga terbesar repo, tiga puluh commit untuk belajar mendengarkan.

Kita mencoba segalanya : layout nonce transport, penonaktifan E2E (server melemparkannya kembali ke wajah kita, ia memaksakannya), kandidat kunci yang diambil dari grup, error detail, fallback transport, introspeksi dari dalam grup, kandidat per leaf-index dengan backoff, pemetaan hook SPEAKING, percobaan dalam tipe media video (gagal), dan skip ssrc video...

Saya meninggalkan respons vokal selama debug (dikomentari, tidak dihapus), menambahkan mode tangkapan handshake, lalu membuang struktur paket yang gagal, seperti arkeolog. Enam layout nonce. Backoff. Introspeksi grup. Saya menaruh bot dalam debug total dan membuka setiap paket untuk melihat isinya.

Yang esensial bukan ia berhasil, melainkan **saya tidak membuang apa pun**. Daftar commit adalah buku lab : setiap percobaan gagal diarsipkan dengan hipotesisnya. Ini sisiku yang "saya menyimpan segalanya, akan berguna untuk debug masa depan" yang terbayar.

### 10.43 - bot terpotong

Bahkan di tengah perang MLS, saya lanjut beres-beres. 546 baris hilang dari bot utama, untuk lahir ulang dalam `pipeline.py` (intake, alasan mengabaikan, pemrosesan), `sender.py` (burst, typo, voice) dan `loops.py` (spontanitas, aktivitas).

### 10.47 - arsitektur sungguhan

`tools/` menjadi terorganisasi : `brain/` (opencode, memory, mood), `voice/` (voice, vocal, listen, soundboard), `fun/` (behavior, typo, emotes, gif). Proyek kini punya kerangka.

### 10.49 → 11.16 - kenyamanan dev

- ambang penyuntikan mood disesuaikan ;
- empat commit kecil untuk pengecualian editor (`data/`, `voices/`, log, basis data), ya, saya menaruh empat, proyeklah yang mendefinisikan prioritas, bukan spek ;
- basis data metadata keluar dari pelacakan ;
- proyek menjadi **bisa dipakai ulang oleh orang lain** : template generik `PERSONA.example.md` dan `STYLE.example.md` untuk mengkloning gaya*nya* sendiri ;
- identitas diganti nama bersih (`CHLOEAI_PROMPT` menjadi `PERSONA`), dan README didepersonalisasi, saya menghapus "Chloé" dari dok publik, ia hanya menceritakan dirinya secara privat ;
- seluruh tuning bot beralih ke `config.yaml` yang di overload (di gitignore), dengan contoh yang dikomentari baris per baris ;
- skrip instalasi kini juga menyiapkan berkas env dan config.

### 11.49 - emoji yang terlepas

Emoji kustom menempel pada teks alih-alih terlepas bersih. Perbaikan sepele, efek raksasa : tidak ada yang berteriak "bot" seperti emoji yang buruk menempel di akhir kalimat.

### 14.19 - penjaga vokal

Kalau seseorang meluncurkan perintah vokal, kita tidak memproses pesan seperti pesan normal. Kedipan mata : tugas malam selalu kembali di malam hari.

**Akhir hari 3 : 118 commit kumulatif. Bot mendengar, bicara, diam di malam hari, punya mood dan kartu nama.**

---

---

## RABU 16 SEPTEMBER - Hari 4 : kredibilitas

13 commit. Hari "serius".

### 08.49 → 08.59 - usia dewasa

Dokumen legal : lisensi **proprietari**, kode etik, panduan kontribusi, kebijakan keamanan, dalam bahasa Inggris lalu Prancis, dengan bolak-balik koreksi dan penggantian nama berkas yang hampir cerewet. Saya menghabiskan berjam-jam untuknya, dan ini sisi repo yang paling tidak menyenangkan, sejauh ini.

### 09.56 - bot melihat

Gambar terlampir ditranskripsikan lewat OCR lokal dan teks disuntikkan ke prompt. OCR berjalan lokal di tempat saya. Saya tidak mengirim mememu ke server pihak ketiga, bahkan secara teori.

### 11.09 - anggaran yang wajar

Revolusi diam-diam dalam anggaran : ketika kanal melarang pengiriman atau membatasi GIF, embed dan emoji, **kita bahkan tidak memanggil model**. Kita tidak membelanjakan token untuk pesan yang tidak bisa kita kirim.

### 11.42 → 12.55 - rumah yang dibangun ulang

- sapu bersih besar : kode mati dihapus, bug pengiriman dan auth diperbaiki, helper difaktorkan ;
- sesi yang terlalu tua dikeluarkan, cache DM kedaluwarsa, deteksi bicara lebih murah ;
- import yang saya rusak saat memindahkan modul dipulihkan, dan seluruh keadaan runtime (sesi, penulis terlihat, pesan diabaikan, mood) bertahan dari restart di `data/`.

### 14.41 - dua dunia, satu bot

Lapisan kompatibilitas otomatis mendeteksi versi `discord` yang dipasang dan menyesuaikan intent dan auth REST. Hasilnya : kode yang sama berjalan sebagai **app resmi** (discord.py) atau sebagai **selfbot** (discord.py-self). Dua dunia, satu bot.

### 15.05 - kehadiran yang menyesuaikan

Cara menampilkan kehadiran menyesuaikan mode, dan daftar admin terbaru.

**Akhir hari 4 : 131 commit kumulatif. Proyek yang legal, wajar, dan berjalan di mana-mana.**

---

---

## KAMIS 17 SEPTEMBER - Hari 5 : rilis

14 commit. Hari kedewasaan.

### 09.15 → 09.30 - memori menjadi disiplin

- kenangan diurutkan berdasar scope, dan kita tidak mengutip kenangan DM di server (atau sebaliknya) tanpa berpikir ;
- kita mengklasifikasikan kenangan (fakta, preferensi, keputusan, relasi...) dan mendeduplikasi penulisannya : dua kenangan kontradiktif tidak bisa lagi hidup berdampingan diam-diam ;
- blacklist opsional (`aventuros`) mencegah bot melayang ke topik tertentu. Dinonaktifkan secara bawaan, tersedia untuk yang penakut ;
- config vokal mati dihapus.

### 10.12 - memori yang diaudit

**Sweep konflik memori bulanan** + bench A/B pencarian. Memori bot telah menjadi aset yang diperiksa. Kita sangat, sangat jauh dari Jumat 11, 08.24.

### 10.54 - lockdown

Hari ketika saya bermain paranoid. Penguncian agen :

- penulisan memori **ditolak** (agen tidak bisa mengotori vault, bahkan kalau disuntikkan) ;
- alat Discord **hanya baca** (pengiriman lewat kode, tidak pernah lewat agen) ;
- **tanpa sub-agen** (jalan memutar lockdown), tanpa webfetch (SSRF localhost, eksfiltrasi), tanpa pertanyaan headless ;
- Docker yang dikeraskan : bot non-root, `no-new-privileges`, `cap_drop: ALL`, batas memori/CPU, antrean proses berbatas, secret lewat `.env` yang tidak pernah di baked.

Saya menulis prinsipnya dalam kode, sebagai komentar : *"dev lewat sesi manusia, bukan di sini"*.

### 11.02 → 11.15 - penyelesaian keamanan

Kata kunci penyimpanan memori diperketat dan penulisan makin restriktif. Kita juga menambahkan ke gitignore berkas cadangan konteks, saya mulai tidak mengarsipkan semuanya, tapi nyaris.

### 12.39 - mood yang lebih ringan

Mood PARRY tidak lagi disuntikkan di setiap pesan : sekali per keadaan. Selesai sudah membuat 3 float hidup di setiap respons.

### 12.47 - commit pembebas

`PERSONA.md`, `STYLE.md` dan `chloeai.md` menjadi **contoh** (`chloeai.example.md`, `PERSONA.example.md`, `STYLE.example.md`), suaraku `fortune-v6.onnx` keluar dari repo, data dan log juga, `.env.example` lahir. Proyek tidak lagi berisi kepribadian*ku* : ia berisi **mekanik** untuk membawa satu.

### 12.52 - v1.0.0

**Tag v1.0.0, ditandatangani SSH.** Changelog, runbook operator, kill-switch (berhenti tanpa menghapus apa pun). Enam hari tepat, antara commit pertama dan rilis.

### 12.53 → 13.14 - cucian

Tanda baca komentar diselaraskan, izin memori dan aturan scope didokumentasikan terbaru.

**Akhir hari 5 : 145 commit kumulatif. v1.0.0 keluar.**

---

---

## JUMAT 18 SEPTEMBER - Hari 6 : anti-klimaks

Satu commit, jam 00.02.

Commit terakhir proyek, dan ia remeh. Model "free tier" yang dipakai agen mengidentifikasi klien OpenCode lewat **keberadaan** alat tertentu dalam permintaan (`bash`, `glob`, `grep`). Kalau kita menghapusnya, bahkan karena alasan keamanan yang sah, penyedia mengembalikan `403 FreeTierError: can only be used from within OpenCode`. Jadi saya harus mengotorisasi ulang, sehari setelah mengunci semuanya, tepat yang baru saja saya blokir, supaya bot terus berjalan gratis.

Ini commit terlucu repo dan saya mempertahankannya : setelah 6 hari menjinakkan Discord, Piper, MLS, OpenSelf dan Docker, **model AI gratis** yang mendikte kebijakan keamananku.

---

---

## Angka

|                                               |                                                |
| --------------------------------------------- | ---------------------------------------------- |
| Commit                                        | **146**                                        |
| Hari aktif                                    | **6** (11 -> 18 September 2026)                |
| Berkas terlacak                             | 65                                             |
| Baris Python final                         | ~4 000                                         |
| Skor tes gaya (Mimo, hari pertama) | **9.1/10**                                     |
| Versi final                                | v1.0.0 (tag bertanda SSH, lisensi proprietari) |

## Apa yang saya ambil dari 6 hari ini

1. **Urutan prioritasnya berantakan, dan itu metode yang benar.** Saya pertama membangun bot yang *menjawab*, lalu bot yang *terdengar pas*, lalu bot yang *kredibel*, lalu bot yang *aman*, dan akhirnya bot yang *bisa didistribusikan*. Kepribadian sebelum keamanan, `Feur` sebelum lisensi. Kita tidak akan bertahan pada ritme ini dengan mengikuti aturan proyek yang "dibuat baik".
2. **Gaya pertama-tama daftar "jangan".** `STYLE.md` saya yang paling berguna tidak menggambarkan apa yang saya katakan, ia mengecualikan apa yang tidak saya lakukan : mengakhiri kalimat tanpa titik, membatasi emoji hanya satu, menulis `mdr` huruf kecil, menyerang langsung tanpa pembuka seperti "Saya cek detail" di awal respons. Parasit bot lebih mudah dikenali daripada sifat karakter yang didefinisikan.
3. **Kegagalan adalah proyek.** Tiga puluh commit untuk MLS, satu tes dibuang, enam layout nonce diuji. Riwayat paling setia dari apa yang saya jalani adalah rangkaian percobaan gagal hari Selasa.
4. **Tiruan adalah memori, bukan gaya.** Gaya menciptakan ilusi sepuluh pesan. Memori (OpenSelf, scope, dedupe, sweep konflik) membuatnya bertahan. Inilah yang memisahkan cermin dari seseorang.
5. **Commit terakhir selalu paling lucu.** Yang ke-146, yang mengotorisasi ulang `bash`, `glob` dan `grep` karena free tier menuntut alatnya sendiri hadir, adalah favorit saya.

Dan neraca, sebagai penutup : **hasilnya memukau, bahkan membuat melongo.** Tiruan menjalani percakapan tanpa menebak mesin, mengingat orang, proyek, candaan lampau, mengambil inisiatif dan menandainya dengan mood, dan mengalahkan Fox dalam perjalanan. Menyeramkan, sedikit, dan tepat itulah yang kita cari.

---

*Proyek tidak publik : lisensi proprietari, hak dilindungi. Tapi riwayatnya, saya ceritakan padamu. Kalau suatu hari kamu bertemu "·Chloé" yang menjawabmu dengan GIF Patrick Jane setelah waktu ketidakaktifan yang sempurna manusiawi... kamu sekarang tahu apa yang bersembunyi di baliknya.*

---

Tiruanku menulis versinya sendiri dari artikel, yang bisa kamu baca [di sini](./article-chlone-timeline-chloeai.md).
