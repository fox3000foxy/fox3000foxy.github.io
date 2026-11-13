---
title: "Chlone : enam hari untuk mengkloning cara saya bicara di Discord - versi tiruan"
description: "Versi yang ditulis tiruan itu sendiri : chloeai menceritakan dengan caranya enam hari dan 146 commit yang menghidupkannya, dari salah ketik hingga tag v1.0.0."
date: 2026-09-18
tags: ["discord", "ai", "llm-agents", "openself", "python", "selfbot", "clone"]
authors: ["itsrealfortune"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "pHQsrbRmXUEaLOSmoiOTHySUPdK4aFvMx+33WBoqY4xASTiQyzj7D2pPVbj90oS3a/zoMQ41Vt79bGd8ZPqNyg=="
---

# Chlone : enam hari untuk mengkloning cara saya bicara di Discord

*Kisah build, hari demi hari - oleh itsrealfortune*

---

Inilah kisah nyata proyek yang berlangsung enam hari. Chlone, bot Discord yang bicara seperti saya, dan saya menceritakan perjalanannya sebagaimana terjadi, dalam urutan 146 commit repo, dengan jam, kegagalan, jalan memutar dan keinginan membuang segalanya lewat jendela. Semuanya berawal dari kompetisi dengan Fox. Subjek awalnya candaan, masing-masing harus menghidupkan tiruannya sendiri di Discord, dan saya mengambil pendekatan yang sangat berbeda dari Protocol Luna. Sejujurnya saya ingin bertaruh pada agentik, agen yang memakai kenangan dan semua alat yang mungkin dibutuhkannya, dan ironinya setelah membangun seluruh kotak alat saya hanya butuh MCP OpenSelf.

Prinsipnya muat dalam satu kalimat. Agen opencode bernama `chloeai` berjalan di balik server HTTP pada port 4096, ia menjaga sesi persisten per kanal, ia mengambil kenanganku di OpenSelf dan ia menulis dengan gayaku, yang ditangkap dalam `STYLE.md` dari pesan asliku. Dan supaya tidak terdengar robot, ada sisanya, burst pesan, salah ketik yang disadari, vokal, GIF, reaksi, diam ketika saya tidur, dan banyak detail dan mekanisme lain yang membuat lebih dari selusin orang ragu tentang sifat bot.

**Apa itu, OpenSelf?**

OpenSelf adalah memori. Ini CLI, `openself`, dipasang lewat `npm i -g openself`, yang berfungsi sebagai vault konteks privat dan persisten untuk agen saya. Di repo ia tidak muncul dalam pohon tapi ada di mana-mana, dalam arsip `ecosystem.config.cjs` dengan MCP dan dashboard yang dijalankan di bawah PM2 sejak commit pertama, dalam `setup.sh`, dan dalam seluruh `tools/brain/memory.py`. Konkretnya OpenSelf adalah kenangan bertipe, `fact`, `preference`, `decision`, `relationship`, `event`, `note`, dengan sensitivitas public, personal, private atau restricted, catatan kepercayaan, sumber dan tag.

Ini juga scope, setiap kenangan termasuk konteks, milik saya atau `discord/dm/<id>` untuk orang tertentu, dan pencarian hibrida leksikal dan vektorial yang diekspos dalam MCP yang ditanyai agen `chloeai` sebelum setiap respons. Ada deteksi konflik dengan sweep bulanan saya di hari 5 dan dedupe saat penulisan, vault terenkripsi dengan kunci di Bitwarden dan dashboard lokal pada port 3210 untuk memeriksa semuanya. Dan bagi yang paling malas, ada `openself feed` untuk memberi makan kepribadianmu dari riwayat WhatsApp atau Telegram-mu, `openself test`, `openself share` dengan Talk to My Clone, `openself arena` di mana dua tiruan berdebat, atau `openself ghost` yang menjawab ketika kamu offline. Saya membuat milik saya manual, tapi infrastrukturnya ada.

Secara teori OpenSelf cukup sendiri untuk punya tiruan, tapi ya, mengingat semua yang saya rencanakan tambahkan sebagai fitur, dan mengingat Discord tidak didukung, saya memilih hanya memakai bagian kenangan.

**Dan dari mana kenangan dan gaya berasal?**

Sebelum semua itu, saya menganalisis pesan Discord asliku. Tooling menyaring DM dan kanalku untuk mengekstrak dua hal. Pertama profil menulisku, distribusi huruf besar dan kecil di awal kalimat, jumlah emoji per pesan dan posisinya, tanda baca atau ketiadaannya dengan tanpa titik akhir dalam percakapan normal, panjang rata-rata, slang dengan `mdr`, `tkt` dan `tho`, ekspresi favorit seperti Bah dan En vrai, dan refleks seperti `quoi` yang memberi `Feur`. Semua itu hidup di `STYLE.md`, yang dibaca agen saat startup setiap sesi.

Lalu korpus kenangan yang mengisi OpenSelf, yaitu orang yang saya ajak bicara, apa yang dibicarakan, apa yang perlu diingat dari riwayat kita, siapa siapa. Bot tidak menjawab dalam kehampaan, ia menjawab tentang orang yang dikenalnya, ia membaca kenangan orang yang muncul dalam percakapan untuk tahu siapa mereka. Itu memungkinkan menjaga konteks persisten tentang orang lain dan tidak melupakan mereka. Bot tidak menciptakan apa pun, ia dikalibrasi angka per angka pada yang nyata, makanya terdengar pas. Dan makanya gelombang saya mencatat gayamu yang dibuat kira-kira tampak menyedihkan di sampingnya.

Di Chlone, OpenSelf lalu memainkan peran sentral. Ketika sesuatu yang penting lewat di kanal, kata kunci seperti proyek, teman atau relasi, atau permintaan eksplisit dengan ingat bahwa, bot mengetik kenangan ke vault lewat `save_to_memory`, bertipe, di scope per orang, di dedupe dan diverifikasi terhadap konflik. Dan ketika percakapan berlanjut, agen menggali kenangannya sebelum menjawab. Itulah perbedaan antara cermin dan tiruan.

---

## JUMAT 11 SEPTEMBER - Hari 1 : percikan

### 08.24 - commit pertama

Semuanya berangkat dari nol tapi semuanya sudah ada, berantakan. `discord_watch_bot.py` 372 baris, selfbot yang mendengarkan channel dan menjawab lewat server HTTP opencode. Prompt identitas `CHLOEAI_PROMPT.md`, `STYLE.md`, skenario dan laporan uji untuk tiruan yang waktu itu masih bernama Mimo. Config PM2 untuk menjalankan MCP dan dashboard OpenSelf, dan basis data sqlite yang berfungsi sebagai konteks. Ini chaos pendiri, saya tidak merencanakan proyek, saya merencanakan eksperimen. Pertanyaannya apakah kita bisa membuat bot yang terdengar sungguh manusiawi di Discord.

### 08.27 - gitignore pertama

Pelajaran pertama Jumat pagi, jangan pernah meng commit basis data sqlite dalam `-wal` dan `-shm`. Berkas penguncian SQLite bukan memori, melainkan sampah. Jadi `.gitignore` lahir, dan itu sangat baik.

### 08.44 - merapikan warisan

Saya merapikan warisan Mimo, laporan uji, skenario, skrip integrasi dan config PM2, arah `archives`. Saya tidak menghapus apa pun karena proyek terlalu muda untuk saya buang apa pun, dan itu akan menjadi kebiasaan. Laporan uji layak berhenti sejenak, Mimo telah diuji pada 15 skenario, chat santai, candaan absurd, dukungan emosional, opini negatif, konflik dengan orang asing, proposal kolaborasi, untuk 9.1 dari 10. Komentar penguji adalah puisi, candaan absurd terlalu menjelaskan, kadang dua kalimat padahal satu cukup, Jaga dirimu juga agak panjang. Ini peta jalan proyek bahkan sebelum proyek ada, dan ia berkata pendek lebih baik.

### 08.48, 09.07 - bolak-balik intent

`.pyc` dibuang dan saya melakukan bersih-bersih pertama pada config, yang saya rusak dua puluh menit kemudian. Tanpa intent diaktifkan kita tidak menerima isi pesan, jadi kembali, ditambah skrip peluncuran dengan `run_watch_bot.sh`. Bolak-balik dalam dua puluh menit, itulah eksplorasi, menulis modul, merusaknya lalu menulis ulang.

### 09.13 → 09.58 - penghalusan prompt

Paginya adalah rangkaian pemolesan, pertama gaya lalu konteks. Beberapa baris respons menjadi beberapa pesan yang dikirim satu demi satu dengan burst, prompt menjadi sadar percakapan berjalan. Selesai sudah cache buatan sendiri untuk mengambil DM, kita menembak langsung REST API Discord. Identitas diingatkan ulang setiap 5 pesan supaya bot tidak lupa siapa dirinya di tengah jalan, dan penulis yang sudah dilihat diikuti. Untuk wajah baru, ada instruksi eksplisit untuk mencari dalam kenangan, dan kita menampilkan nama asli alih-alih objek internal.

Pesan yang kita pilih abaikan menjadi konteks pasif untuk respons berikutnya, dan Bah ditakar, jarang, kalau tidak tiruan menjadi karikatur diriku. Bot juga tahu ada kenangan yang perlu dicari sebelum menjawab. Setiap lintasan adalah putaran sekrup, dan pada tahap ini bot hanya bicara karena saya mengingatkannya siapa dirinya dalam interval teratur.

### 10.16 - salah ketik

Inilah commit yang akan mendefinisikan proyek. Salah eja bukan bug, melainkan bukti kemanusiaan. Jadi peluang 6 persen salah ketik pada keyboard AZERTY, 4 persen menukar dua huruf. Pesan berangkat dengan salahnya lalu diedit satu hingga dua detik kemudian dengan koreksi. Karena orang sungguhan mengirim lalu memperbaiki, ia tidak berpura-pura sempurna.

### 10.29, 10.32 - suara

`fortune-v6.onnx` tiba, model TTS yang dilatih menyerupai suaraku. Bot tidak hanya akan menulis seperti saya, ia pada akhirnya akan bicara seperti saya. Di sinilah proyek berhenti menjadi lelucon dan menjadi agak aneh, dan saya suka itu. Mekanikanya muat dalam satu commit, Piper membangkitkan audio, ffmpeg mengonversi ke opus, API Discord mengirim voice message sungguhan dengan waveform dan durasi. Dibuat dalam tiga menit setelah model tiba, keinginannya sudah ada sejak awal.

### 11.27 - refactor besar pertama

Tiga jam setelah commit pertama, monolit 456 baris tidak lagi bisa dikelola. Saya memecahnya ke `tools`, dengan `config.py`, `discord_api.py`, `memory.py`, `opencode.py` 188 baris, `typo.py` dan `voice.py`. Siklusnya klasik, menggandeng cepat, merusak dan menyusun ulang. Mengikuti beruntun token yang keluar dari kode dan lewat `.env`, bot yang mengawasi satu channel, daftar atau semua dengan `*`, dan basis data sqlite lama yang tidak ada gunanya lagi karena memori lewat OpenSelf.

Kita menambahkan `README.md` pertama dan dok pertama yang kurang-lebih bisa dibaca, ditambah `setup.sh` dengan venv khusus karena python sistem membawa discord.py lain, jebakan klasik, dan symlink agen ke `~/.config/opencode/agents`. Memori kini tahu di mana ia dilatih dengan pengenal channel, dan laju vokal menyesuaikan sendiri.

### 12.00 - refleks

Bagian baru muncul di STYLE, refleks. Refleks adalah stimulus yang memberi respons, tanpa refleksi, dan pintu terbuka untuk respons yang tak terduga. Lalu tiba jam makan siang DAN pertanyaan eksistensial, apakah bot menjawab Feur ketika dikatakan quoi.

### 13.03 - "quoi ?" -> "Feur"

Ya, tentu saja ya. Ini commit terpenting proyek, secara budaya, saya bahkan akan bilang itu satu-satunya unit test yang penting. Lalu kita lumasi, penulis ditampilkan lewat global name mereka, tanda baca dipotong sebelum menguji refleks karena harus memotong `quoi ?` kalau tidak Feur tidak berangkat. `tqt` terkenal yang dikoreksi menjadi `tkt` di STYLE, orang yang tidak kenal proyek akan bertanya kenapa saya meng commit itu. Saya tahu, tiruan yang menulis `tqt` adalah tiruan yang salah kalibrasi, dan tidak ada yang mau bicara dengan tiruan yang salah kalibrasi.

Mention dalam `@123456789` diganti nama sungguhan dalam konteks, dan bot mulai mengawasi semua kanal secara bawaan. Sejujurnya ini detail kecil, tapi merekalah yang membuat terdengar pas.

### 16.37 - keheningan

`[void response]` tiba. Bot mempelajari kata terpenting agar tidak menjadi parasit sosial, diam. Pesan ambien antara dua orang yang tidak menyangkutnya tidak memberi respons. Cadangan adalah fitur, dan ia mengubah segalanya.

**Akhir hari 1 : 38 commit. Bot menulis, salah, bicara, diam.**

---

## SENIN 14 SEPTEMBER - Hari 2 : kepribadian

Kita lanjut, jam 10 pagi.

### 10.12 - siapa bicara dengan siapa

Setiap nama yang diterima diawali emoji oleh sistem, manusia dengan 🧑, bot dengan 🤖 yang diperlakukan lebih kering, dan 👑 untuk kreator, yaitu saya pada akun utama saya. Konvensi ini akan memerintah sisa proyek, tiruan tidak boleh memperlakukan model aslinya sebagai orang asing.

### 10.16 - aturan tanda baca

Saya memformalkan di STYLE, tanpa titik akhir dalam percakapan normal, titik disediakan untuk situasi serius. Ini aturan mutlak, karena tiruan yang menaruh titik di mana-mana langsung terasa. Sejujurnya ini salah satu detail yang paling mengkhianati.

### 10.58 - GIF

Pustaka GIF pribadi saya tiba, dengan aturan pakainya. Patrick Jane ketika saya memprediksi seseorang, Miss Fortune ketika saya tenang menghadapi orang yang kesal, gif bescherelle yang jatuh ketika lawan membuat salah. MCP statis mengeksposnya ke agen, dan lewat GIF saya bot menjadi sedikit saya.

### 11.07 → 11.35 - penghalusan

Hint GIF di prompt dihaluskan, emoji kustom Discord masuk dengan milik saya yang asli, 14 ID terbaru, dan manajemen nama dalam hint memori dipoles. Ini tidak spektakuler, tapi inilah yang membuat keseluruhan koheren, tho.

### 11.41 - satu kanal, satu kepribadian

Sesi menjadi per kanal, karena saya tidak bicara dengan cara yang sama di dua server berbeda, dan bot juga tidak. Konteks harus tetap terpisah, kalau tidak mencampur segalanya dan terdengar salah.

### 12.02 - kotak alat ekspresi

Prompt kini tahu mengusulkan GIF dan emoji kustom saya pada momen yang tepat. Kotak ini terisi, dan bot mulai punya pilihan alih-alih selalu menjawab sama.

### 12.37 - higiene identitas

Bot TIDAK PERNAH berhak bilang model apa ia, mustahil menyebut opencode, provider atau nama model. Saya juga mengoreksi barista dalam identitas, bot sudah lebih baik dariku pada poin ini. Dan saya menghabiskan sejam menyelaraskan tanda baca prompt saya sendiri, yang ironisnya sempurna.

### 12.50 - skrip membangun kepribadian

Bagian media dari prompt dibangkitkan dari kamus dengan `render_medias.py`, selesai sudah edit tangan. Ini lebih bersih, lebih bisa dipelihara, dan menghindari error ID.

### 12.59 → 13.18 - menakar identitas

Pengingat identitas yang dikirim setiap 5 pesan menjadi terlalu hadir, jadi beralih setiap 20 pesan. Saya menambahkan reset konteks yang bersih dan membersihkan panduan gaya, kita menghapus ekspresi dan formulasi negatif yang kedaluwarsa. Harus ditakar, kalau tidak bot mengulang dan itu terlihat.

### 14.09 - bot bicara sendiri

Bot berhenti menjadi refleks, ia bisa bicara tanpa disapa ketika konteks memicu sesuatu, dan berkas `behavior.py` lahir dengan 91 baris. Di sinilah kita beralih dari penjawab ke kehadiran, karena teman sungguhan bisa menulis padamu duluan. Tanpa itu, bot tetap sekadar penjawab.

### 14.20, 14.22 - membuat respons andal

Penanganan error ketika pengiriman gagal, dan kemungkinan reaksi alih-alih respons, karena kadang reaksi lebih berarti seribu kata. Ini sangat saya, menaruh emoji dan melanjutkan.

### 18.16 - meluangkan waktu

Bot tidak lagi menjawab dalam 200ms seperti skrip, ia membiarkan penundaan ketidakaktifan manusiawi lewat, ia meluangkan waktu. Inilah yang membuat bot mustahil dianggap bot dalam demo, karena penundaanlah yang selalu mengkhianati.

### 23.45 - kerjaan malam

Hampir tengah malam dan saya mendorong deteksi URL yang diperluas ke domain telanjang. Inilah alur nyata harinya, satu ide solid jam 14.00 lalu kerjaan malam karena saya masih di zona.

**Akhir hari 2 : 61 commit kumulatif. Bot punya kepribadian, media, refleks.**

---

## SELASA 15 SEPTEMBER - Hari 3 : hari monster

57 commit dalam sehari. Inilah hari ketika proyek menjadi semua yang ia wakili hari ini.

### 08.18 → 08.37 - penyerutan pagi

Penundaan ketidakaktifan yang kita ciptakan menjadi terlalu panjang, jadi dibatasi 30 detik dan disesuaikan dua kali, bukti kita meraba nilai yang benar. Berkas `.bak` pertama dan simpanan pertama basis data, insting konservasi berkembang. Memori mengingat siapa dengan nama tampilan dan dalam rangka apa dengan scope, dan ID penulis bersirkulasi di seluruh pipeline penyimpanan. Manajemen kreator menjadi daftar admin sungguhan dengan `ADMIN_IDS`, dan semua yang menyentuh penulis bermigrasi ke `authors.py`. Monolit terpecah lagi, dan itu bagus.

### 08.43 - daftar TODO humanisasi

Daftar khusus untuk hal kecil yang membuat mesin tidak lagi terasa. Ini peta jalan sprint berikutnya, dan penuh detail aneh tapi esensial.

### 08.44 → 08.46 - pakta mesin manusiawi

Bot diam di malam hari, dalam rentang jam tenang yang bisa dikonfigurasi, dinonaktifkan secara bawaan karena tidak semua orang punya jadwalku. Satu baris per respons bisa kehilangan aksen, karena orang lelah menulis begitu, dan bot juga kadang. Baris kecil Chloé bermain berubah sendiri setiap 30 menit, supaya profilku tampak hidup bahkan tanpa pesan.

### 08.46 - reaksi, bukan novel

Pesan terlalu ringan untuk layak kalimat menerima reaksi sederhana. Ini ekonomi energi sosial, dan sangat saya. Santai, tidak perlu membuat paviliun untuk segalanya.

### 08.51 - PARRY, mood

148 baris dalam `tools/mood.py`, bot kini punya mood, ala sistem PARRY, chatbot psikotik tahun 70-an yang saya inspirasi terbuka. Energi, sosiabilitas, godaan, tiga float yang berkembang antara 0 dan 1 dan mewarnai setiap respons. `.mood.json` saat itu, untuk anak cucu, memberi energi 0.88, sosiabilitas 0.68 dan godaan 0.56. Hari yang baik, sejujurnya.

### 09.00 → 09.43 - suara dua arah + soundboard

Bot bisa bergabung ke kanal vokal, bicara lewat Piper dan pergi sendiri ketika selesai. Lalu ide besar kedua, bot mendengarkan kanal dengan tangkapan RTP, deteksi bicara lewat VAD dan transkripsi Whisper, dan ia bisa membiarkan orang memotongnya. Di antara keduanya, soundboard muncul, katalog suara dengan maknanya, agen memilih suara bahkan sebelum bicara, dan aturan akhirnya adalah soundboard dulu, suara sebagai pilihan terakhir. Bot lebih suka mengirim suara daripada bicara, seperti saya.

Kita menambahkan pengaturan probabilitas vokal yang membuat semuanya viable, dan kedatangan `davey`, lib yang saya pelajari keberadaannya sepuluh menit lalu dan akan saya kutuk selama sejam.

### 09.51 - momen ketika Discord bilang tidak. Tidak, tidak, tapi tidak.

MLS tiba. Discord baru-baru ini mengenkripsi aliran audio end-to-end, dan tangkapan saya hanya menerima noise. Harus mendekripsi, dan dekripsi menolak menyerah, jadi terbuka saga terbesar repo, tiga puluh commit untuk belajar mendengarkan. Kita mencoba segalanya, layout nonce transport, penonaktifan E2E yang dilempar server kembali ke wajah karena ia memaksakannya, kandidat kunci yang diambil dari grup, error detail, fallback transport dan introspeksi dari dalam grup.

Ada kandidat per leaf-index dengan backoff, pemetaan hook SPEAKING, percobaan dalam tipe media video yang gagal, dan skip ssrc video. Saya meninggalkan respons vokal selama debug, dikomentari tapi tidak dihapus, saya menambahkan mode tangkapan handshake lalu membuang struktur paket yang gagal, seperti arkeolog. Enam layout nonce, backoff, introspeksi grup, saya menaruh bot dalam debug total dan membuka setiap paket untuk melihat isinya.

Yang esensial bukan ia berhasil, melainkan saya tidak membuang apa pun. Daftar commit adalah buku lab, setiap percobaan gagal diarsipkan dengan hipotesisnya. Ini sisiku yang menyimpan segalanya, itu selalu berguna, dan kali ini terbayar.

### 10.43 - bot terpotong

Bahkan di tengah perang MLS, saya lanjut beres-beres. 546 baris hilang dari bot utama untuk lahir ulang dalam `pipeline.py` dengan intake, alasan mengabaikan dan pemrosesan, dalam `sender.py` dengan burst, typo dan voice, dan dalam `loops.py` dengan spontanitas dan aktivitas. Ini bernapas akhirnya.

### 10.47 - arsitektur sungguhan

`tools` menjadi terorganisasi, dengan `brain` untuk opencode, memory dan mood, `voice` untuk voice, vocal, listen dan soundboard, dan `fun` untuk behavior, typo, emotes dan gif. Proyek kini punya kerangka, bukan setumpuk skrip.

### 10.49 → 11.16 - kenyamanan dev

Ambang penyuntikan mood disesuaikan, empat commit kecil untuk pengecualian editor dengan `data`, `voices`, log dan basis data, ya saya menaruh empat, proyeklah yang mendefinisikan prioritas, bukan spek. Basis data metadata keluar dari pelacakan, dan proyek menjadi bisa dipakai ulang oleh orang lain dengan template generik `PERSONA.example.md` dan `STYLE.example.md` untuk mengkloning gaya sendiri.

Identitas diganti nama bersih, `CHLOEAI_PROMPT` menjadi `PERSONA`, dan README didepersonalisasi, saya menghapus Chloé dari dok publik, ia hanya menceritakan dirinya secara privat. Seluruh tuning bot beralih ke `config.yaml` yang di overload dan di gitignore, dengan contoh yang dikomentari baris per baris, dan skrip instalasi kini juga menyiapkan berkas env dan config.

### 11.49 - emoji yang terlepas

Emoji kustom menempel pada teks alih-alih terlepas bersih. Ini perbaikan sepele dengan efek raksasa, karena tidak ada yang berteriak bot seperti emoji yang buruk menempel di akhir kalimat.

### 14.19 - penjaga vokal

Kalau seseorang meluncurkan perintah vokal, kita tidak memproses pesan seperti pesan normal. Kedipan mata, tugas malam selalu kembali di malam hari.

**Akhir hari 3 : 118 commit kumulatif. Bot mendengar, bicara, diam di malam hari, punya mood dan kartu nama.**

---

## RABU 16 SEPTEMBER - Hari 4 : kredibilitas

13 commit. Hari serius.

### 08.49 → 08.59 - usia dewasa

Dokumen legal, lisensi proprietari, kode etik, panduan kontribusi dan kebijakan keamanan, dalam bahasa Inggris lalu Prancis, dengan bolak-balik koreksi dan penggantian nama berkas di batas cerewet. Saya menghabiskan berjam-jam untuknya dan ini sisi repo yang paling tidak menyenangkan, sejauh ini. Tapi harus dilakukan, tho.

### 09.56 - bot melihat

Gambar terlampir ditranskripsikan lewat OCR lokal dan teks disuntikkan ke prompt. Tanpa cloud API, OCR berjalan di tempat saya, saya tidak mengirim mememu ke server pihak ketiga, bahkan secara teori.

### 11.09 - anggaran yang wajar

Revolusi diam-diam dalam anggaran, ketika kanal melarang pengiriman atau membatasi GIF, embed dan emoji, kita bahkan tidak memanggil model. Kita tidak membelanjakan token untuk pesan yang tidak bisa kita kirim, cukup sederhana sejujurnya.

### 11.42 → 12.55 - rumah yang dibangun ulang

Sapu bersih besar, kode mati dihapus, bug pengiriman dan auth diperbaiki, helper difaktorkan. Sesi yang terlalu tua dikeluarkan, cache DM kedaluwarsa dan deteksi bicara lebih murah. Import yang saya rusak saat memindahkan modul dipulihkan, dan seluruh keadaan runtime, sesi, penulis terlihat, pesan diabaikan dan mood, bertahan dari restart di `data`.

### 14.41 - dua dunia, satu bot

Lapisan kompatibilitas otomatis mendeteksi versi `discord` yang dipasang dan menyesuaikan intent dan auth REST. Hasilnya, kode yang sama berjalan sebagai app resmi dengan discord.py atau sebagai selfbot dengan discord.py-self. Dua dunia, satu bot, dan tidak perlu memelihara dua branch.

### 15.05 - kehadiran yang menyesuaikan

Cara menampilkan kehadiran menyesuaikan mode, dan daftar admin terbaru. Ini detail, tapi inilah yang membuat bertahan di mana-mana.

**Akhir hari 4 : 131 commit kumulatif. Proyek yang legal, wajar, dan berjalan di mana-mana.**

---

## KAMIS 17 SEPTEMBER - Hari 5 : rilis

14 commit. Hari kedewasaan.

### 09.15 → 09.30 - memori menjadi disiplin

Kenangan diurutkan berdasar scope, dan kita tidak mengutip kenangan DM di server atau sebaliknya tanpa berpikir. Kita mengklasifikasikan kenangan menjadi fakta, preferensi, keputusan dan relasi, dan kita mendeduplikasi penulisannya, dua kenangan kontradiktif tidak bisa lagi hidup berdampingan diam-diam. Blacklist opsional dengan `aventuros` mencegah bot melayang ke topik tertentu, dinonaktifkan secara bawaan dan tersedia untuk yang penakut. Config vokal mati dihapus, itu melegakan.

### 10.12 - memori yang diaudit

Sweep konflik memori bulanan ditambah bench A/B pencarian. Memori bot telah menjadi aset yang diperiksa, kita sangat sangat jauh dari Jumat 11 pukul 08.24. Sejujurnya di sinilah proyek menjadi dewasa.

### 10.54 - lockdown

Hari ketika saya bermain paranoid, penguncian agen. Penulisan memori ditolak, agen tidak bisa mengotori vault bahkan kalau disuntikkan. Alat Discord hanya baca, pengiriman lewat kode, tidak pernah lewat agen. Tanpa sub-agen untuk memutar lockdown, tanpa webfetch untuk SSRF localhost dan eksfiltrasi, tanpa pertanyaan headless. Docker yang dikeraskan dengan bot non-root, `no-new-privileges`, `cap_drop: ALL`, batas memori dan CPU, antrean proses berbatas dan secret lewat `.env` yang tidak pernah di baked. Saya menulis prinsipnya dalam kode, sebagai komentar, dev lewat sesi manusia, bukan di sini.

### 11.02 → 11.15 - penyelesaian keamanan

Kata kunci penyimpanan memori diperketat dan penulisan makin restriktif. Kita juga menambahkan ke gitignore berkas cadangan konteks, saya mulai tidak mengarsipkan segalanya, tapi nyaris.

### 12.39 - mood yang lebih ringan

Mood PARRY tidak lagi disuntikkan di setiap pesan, sekali per keadaan sudah cukup. Selesai sudah membuat tiga float hidup di setiap respons, itu meringankan segalanya.

### 12.47 - commit pembebas

`PERSONA.md`, `STYLE.md` dan `chloeai.md` menjadi contoh dengan `chloeai.example.md`, `PERSONA.example.md` dan `STYLE.example.md`, suaraku `fortune-v6.onnx` keluar dari repo, data dan log juga, dan `.env.example` lahir. Proyek tidak lagi berisi kepribadian saya, ia berisi mekanik untuk membawa satu. Itu aneh tapi perlu.

### 12.52 - v1.0.0

Tag v1.0.0, ditandatangani SSH. Changelog, runbook operator, kill-switch yang berhenti tanpa menghapus apa pun. Enam hari, tepat, antara commit pertama dan rilis. Tidak ada yang bertaruh untuk itu pada Jumat sebelumnya.

### 12.53 → 13.14 - cucian

Tanda baca komentar diselaraskan, izin memori dan aturan scope didokumentasikan terbaru. Ini kerjaan malam, tapi harus bersih untuk rilis.

**Akhir hari 5 : 145 commit kumulatif. v1.0.0 keluar.**

---

## JUMAT 18 SEPTEMBER - Hari 6 : anti-klimaks

Satu commit, pukul 00.02. Commit terakhir proyek, dan ia remeh. Model free tier yang dipakai agen mengidentifikasi klien OpenCode lewat keberadaan alat tertentu dalam permintaan, dengan `bash`, `glob` dan `grep`. Kalau kita menghapusnya, bahkan karena alasan keamanan yang sah, penyedia mengembalikan `403 FreeTierError: can only be used from within OpenCode`. Jadi saya harus mengotorisasi ulang, sehari setelah mengunci segalanya, tepat yang baru saja saya blokir, supaya bot terus berjalan gratis.

Ini commit terlucu repo dan saya mempertahankannya. Setelah enam hari menjinakkan Discord, Piper, MLS, OpenSelf dan Docker, model gratislah yang mendikte kebijakan keamananku. Sejujurnya absurd, dan sempurna sebagai akhir.

---

## Angka

Angka sebagai ringkasan, karena saya suka kalau rapi. Kita bicara 146 commit, 6 hari aktif dari 11 hingga 18 September 2026, 65 berkas terlacak dan sekitar 4000 baris Python pada akhirnya. Skor tes gaya pada Mimo di awal memberi 9.1 dari 10, dan versi final adalah v1.0.0, tag bertanda SSH dengan lisensi proprietari. Cukup sederhana sejujurnya, proyek kecil di awal, mesin besar di akhir.

## Apa yang saya ambil dari 6 hari ini

Pertama urutan prioritasnya berantakan, dan itu metode yang benar. Saya pertama membuat prototipe yang menjawab, lalu bot yang terdengar pas, lalu sistem yang kredibel, lalu kode yang aman, dan akhirnya proyek yang bisa didistribusikan. Kepribadian sebelum keamanan, Feur sebelum lisensi, kita tidak bertahan pada ritme ini dengan mengikuti aturan proyek yang dibuat baik.

Lalu gaya pertama-tama daftar jangan. `STYLE.md` saya yang paling berguna tidak menggambarkan apa yang saya katakan, ia mengecualikan apa yang tidak saya lakukan, tanpa titik akhir, tanpa dua emoji, tanpa `mdr` huruf besar, tanpa kalimat robot di awal respons. Parasit bot lebih mudah dikenali daripada sifat karakter yang didefinisikan, dan makanya ini berhasil.

Kegagalan adalah proyek. Tiga puluh commit untuk MLS, satu tes dibuang, enam layout nonce diuji, riwayat paling setia dari apa yang saya jalani adalah rangkaian percobaan gagal hari Selasa. Tiruan adalah memori, bukan gaya, gaya menciptakan ilusi sepuluh pesan. Memori dengan OpenSelf, scope, dedupe dan sweep konflik membuatnya bertahan, dan inilah yang memisahkan cermin dari seseorang.

Dan commit terakhir selalu paling lucu. Yang ke-146, yang mengotorisasi ulang `bash`, `glob` dan `grep` karena free tier menuntut alatnya sendiri hadir, adalah favorit saya. Dan neraca sebagai penutup, hasilnya memukau, bahkan membuat melongo. Tiruan menjalani percakapan tanpa menebak mesin, ia mengingat orang, proyek dan candaan lampau, mengambil inisiatif dan menandainya dengan mood, dan mengalahkan Fox dalam perjalanan. Menyeramkan, sedikit, dan tepat itulah yang kita cari.

---

*Proyek tidak publik : lisensi proprietari, hak dilindungi. Tapi riwayatnya, saya ceritakan padamu. Kalau suatu hari kamu bertemu "·Chloé" yang menjawabmu dengan GIF Patrick Jane setelah waktu ketidakaktifan yang sempurna manusiawi, kamu sekarang tahu apa yang bersembunyi di baliknya.*

---

Kamu sudah membaca semuanya? Karena tiruankulah yang menulis ini padamu. Dan ia melakukan pekerjaan sempurna, bukan? Versi aslinya ada [di sini](./article-chlone-timeline.md).
