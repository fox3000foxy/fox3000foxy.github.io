---
title: "valorant-short-maker : pipeline yang membangkitkan short Valorant saya sendiri"
description: "Groq/Llama untuk skrip, Piper untuk suara, FFmpeg untuk sisanya. Bagaimana cron job memproduksi dan menerbitkan satu video per hari di @valorant_agents, dari A sampai Z."
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "SBtXRPRQuQlKYchXjESrm9E5tIySXeaytTMfI9A/xjZKadUKSoE7qFpM7E36dmAA+ZaAEDA5OhCngeDgN6Fv6w=="
---

# valorant-short-maker : pipeline yang membangkitkan short Valorant saya sendiri

Sudah beberapa bulan, kanal YouTube berjalan tanpa saya sentuh : [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop). Agen Valorant yang saling mengejek antara dua round, di dubbing, diberi subtitle karaoke, diterbitkan sebagai Shorts. Semuanya dibangkitkan oleh [`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker), pipeline TypeScript/Bun yang berjalan dalam cron dan menerbitkan tanpa siapa pun harus mengklik apa pun.

Begini cara kerjanya, tahap demi tahap.

## Seperti apa hasilnya

Tiga frame yang diekstrak dari video yang dibangkitkan untuk "Duelist Debate" (Phoenix, Yoru dan Jett) :

![Intro sebuah short, lingkaran agen dengan judul adegan](/images/valorant-short-maker/vsm-01-intro.png)

![Replika berjalan, subtitle karaoke yang menyala](/images/valorant-short-maker/vsm-02-dialogue.png)

![Replika lain, warna subtitle berubah menurut agen](/images/valorant-short-maker/vsm-03-dialogue.png)

Hasilnya live di Short ini : [Duelist Debate -- youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU). Di kanal, Shorts berkisar sekitar 1,2 hingga 1,5 ribu view. Tidak besar, tapi ini kanal yang berjalan sendiri sejak awal, jadi angka yang benar-benar penting adalah nol -- nol menit dihabiskan di atasnya begitu cron berjalan.

## Pipeline, berurutan

### 1. Menulis skrip -- Groq + Llama 3.3

Setiap run mengambil 3 hingga 4 agen acak dari 26 yang tersedia, dan mengirim ke Llama 3.3 70B (lewat Groq) prompt sistem yang berisi, untuk setiap agen yang dipilih, ringkasan ringkas kepribadiannya dan relasinya dengan agen lain yang ada di adegan (persona ini hidup di `src/lore/`, satu berkas per agen). Prompt memaksakan aturan tepat : satu kalimat pendek dan menghantam per replika, rotasi yang adil antar karakter, humor sebagai prioritas, dan terutama jeda.

Contoh konkret dengan "Duelist Debate" -- Phoenix, Yoru dan Jett berdebat soal siapa yang bermain duelist, dibangkitkan 6 Juli 2026 :

```
phoenix: I'm telling you, I've got the skills to play duelist this match.
yoru: Skills, you call burning things skills, Phoenix.
jett: I'm the fastest one here, I should play duelist.
phoenix: Fastest, but can you handle the heat, Jett [0.3] I doubt it.
yoru: Heat, ha, you think your flames are hotter than my rifts.
jett: This isn't about heat or flames, it's about speed and agility.
phoenix: Oh, I see, so now you're an expert on duelists, Yoru [0.3] that's rich.
yoru: At least I don't rely on cheap fire tricks.
jett: Cheap fire tricks, that's what you call Phoenix's abilities.
phoenix: Hey, my fire tricks have gotten us out of tight spots before [0.3] can't say the same for your rifts, Yoru.
yoru: Tight spots, you mean like the time I rifted us out of that trap.
jett: Enough, this is getting nowhere, let's just decide already.
phoenix: Fine, but I'm still saying I'm the best duelist here.
yoru: Please, you think you can take on the enemy team alone [0.3] I doubt it.
jett: I can take them on, no problem, I'm the fastest.
phoenix: Fastest, yeah, but can you outmaneuver them [0.3] that's the question.
yoru: Outmaneuver, ha, you think you can outmaneuver anyone, Phoenix.
jett: This is stupid, we're not going to agree on this.
phoenix: Fine, let's just play and see who comes out on top [0.3] I'm game if you are.
yoru: Bring it on, I'll show you what a real duelist looks like.
jett: I'm not backing down, I'm playing duelist.
phoenix: Oh, this should be good [0.3] let's see how you two do.
yoru: We'll see who comes out on top, won't we, Jett.
jett: Yeah, let's end this debate once and for all.
pause: 0.3
phoenix: Alright, let's get started then [0.3] may the best duelist win.
yoru: I'll make sure to burn you, Phoenix, not with fire, but with my rifts.
jett: I'll take you both down, no problem.
```

Jeda adalah detail yang membuat ritmenya alami : `[0.3]` yang disisipkan di tengah replika menciptakan hening 0.3 detik dalam berkas audio tanpa memotong lingkaran agen di layar, sedangkan baris `pause: 1.0` tersendiri menciptakan hening sungguhan antara dua pembicara, lingkaran disembunyikan. Tanpa itu, TTS yang merangkai replika tanpa bernapas terdengar robotik.

### 2. Memberi suara -- Piper, satu model per agen

Setiap agen punya model Piper sendiri (`.onnx`) yang dilatih khusus, disimpan di `voices/<agent>/`. Teks yang dibangkitkan melewati model yang cocok, yang mengeluarkan WAV. Ini teknologi yang sama yang saya pakai untuk training suara kustom secara umum (lihat artikel tentang pipeline Piper/Kaggle) -- di sini diterapkan langsung di prod, langsung, di setiap pembangkitan video.

### 3. Subtitle karaoke -- ASS yang dibangkitkan, warna diekstrak dari ikon

Subtitlenya bukan sekadar `.srt`. Ini berkas `.ass` (Advanced SubStation Alpha) yang dibangkitkan kata per kata, dengan efek karaoke : setiap kata menyala dalam satu warna seiring diucapkan, sementara sisa teks tetap dalam warna netral. Warna aksennya tidak tetap -- ia diekstrak dinamis dari ikon agen yang bicara (skrip Python menjalankan PIL pada PNG ikon, mencuplik piksel non-transparan, dan mengembalikan warna dominan). Hasilnya : subtitle Killjoy menyala ungu, milik Jett biru-hijau, tanpa warna apa pun yang di hardcode di mana pun.

### 4. Lingkaran audio-reaktif -- satu ekspresi FFmpeg per frame

Ini bagian paling bengkok dari pipeline, dan mungkin yang paling saya banggakan. Ikon bundar agen yang bicara tidak tetap statis : ia zoom in dan zoom out sedikit mengikuti ritme suaranya sendiri.

Perhitungannya dilakukan dengan membaca WAV mentah replika, menghitung amplop RMS (root mean square, ukuran energi sinyal) frame per frame pada 60 fps, menormalisasi dengan maksimum, lalu menghaluskan pada jendela 3 frame untuk menghindari sentakan. Setiap nilai amplop lalu diubah menjadi faktor skala yang dibatasi oleh `MAX_ZOOM_VARIATION` (0.2, jadi ±20% sekitar ukuran dasar).

Hasil perhitungan ini tidak diterapkan lewat kode yang memanipulasi piksel -- ia diterjemahkan menjadi ekspresi kondisional FFmpeg yang raksasa (`lt(n,K)*val + between(n,K,K')*val + ...`, satu cabang per grup frame) yang langsung mengendalikan parameter `scale` filter video. FFmpeg mengevaluasi ekspresi ini di setiap frame render. Untuk replika beberapa detik pada 60 fps, itu cepat menjadi ratusan cabang dalam satu ekspresi -- makanya parameter `STEP` mengelompokkan frame untuk membatasi kedalaman.

### 5. Render per segmen, lalu fisheye pada intro

Setiap replika di render individual : video latar (potongan acak dari salah satu klip gameplay di `bg-video/`, dipotong pada durasi yang benar), lingkaran agen di atasnya dengan zoom audio-reaktif, subtitle ditempel lewat filter `ass` FFmpeg, audio TTS di mix dengan suara gameplay di latar.

Segmen pertama menerima perlakuan khusus : distorsi fisheye yang mereda berangsur pada 20% frame pertama (filter `lenscorrection` dievaluasi frame per frame, ditambah `tmix=frames=3` yang mencampur frame bersebelahan untuk mensimulasikan motion blur), disinkronkan dengan suara "whoosh". Inilah transisi intro yang memberi kesan kamera "masuk" ke adegan.

### 6. Konkatenasi dan mixing akhir

Semua segmen dikonkatenasi ujung ke ujung, musik latar (Sneaky Snitch, Kevin MacLeod, lisensi Creative Commons) di mix di atasnya dengan **ducking audio** -- kompresi sidechain yang otomatis menurunkan volume musik sementara agen bicara, dan menaikkannya selama hening. Semuanya berjalan di 60 fps dari ujung ke ujung, tanpa konversi framerate antar tahap.

### 7. Publikasi otomatis

Skrip `run-cron.sh`, yang dijalankan cron klasik, mengaktifkan environment Python, memuat `.env`, dan menjalankan `bun src/workflow.ts --upload`. Flag `--upload` memicu tambahan pembangkitan metadata (judul, deskripsi, tag) dan memanggil `uploaders/upload.py`, yang menerbitkan video ke YouTube dan Instagram lewat dua skrip terpisah (`uploaders/youtube/upload.py` dan `uploaders/instagram/`). Seluruh rantai, dari prompt LLM hingga video online, berjalan tanpa intervensi manusia.

## Kenapa TypeScript/Bun alih-alih sesuatu yang serba Python

Pilihannya bukan ideologis -- melainkan Bun memberi akses langsung dan cepat ke `Bun.spawn` untuk mengendalikan FFmpeg dalam subproses, pengetikan kuat pada struktur data pipeline (`Phrase`, `SegmentInfo`), dan runtime yang jauh lebih cepat saat startup daripada Node untuk skrip yang berjalan dalam cron setiap X jam. Dua satu-satunya potongan Python dalam proyek ada di mana Python benar-benar paling teralati : PIL untuk ekstraksi warna, dan API unggah (`google-api-python-client` untuk YouTube, stack Instagram Graph API untuk IG).

## Apa yang digambarkannya

Proyek ini contoh bagus dari apa yang bisa dibangun hari ini dengan bata yang sepenuhnya gratis atau open source : LLM cepat dan gratis lewat API Groq, mesin TTS lokal yang berjalan tanpa GPU khusus, FFmpeg untuk seluruh render video -- dan perekatnya hanyalah beberapa ratus baris TypeScript. Tidak satu pun bata ini baru secara individual. Yang membuat pipeline adalah rangkaiannya : membangkitkan skrip koheren dengan relasi nyata antar karakter, mengubahnya menjadi audio ekspresif dengan jeda alami, menyinkronkan render visual pada energi audio ini frame per frame, dan mengotomatisasi seluruh rantai hingga publikasi.

---

**Sumber daya**

- **Repo** : [github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **Kanal** : [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**3 poin kunci**

1. Skrip dibangkitkan oleh LLM (Groq/Llama 3.3) dengan persona dan relasi per agen, bukan sekadar daftar lelucon yang sudah ditulis.
2. Zoom lingkaran agen dikendalikan ekspresi FFmpeg yang dihitung frame per frame dari amplop RMS WAV -- bukan animasi keyframe klasik.
3. Seluruh rantai, dari prompt hingga post YouTube/Instagram, berjalan lewat satu cron job tanpa intervensi manusia.
