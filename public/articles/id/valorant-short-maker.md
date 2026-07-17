---
title: "valorant-short-maker: pipeline yang menghasilkan Shorts Valorant saya sendirian"
description: "Groq/Llama untuk skrip, Piper untuk suara, FFmpeg untuk sisanya. Bagaimana cron job memproduksi dan mempublikasikan satu video per hari di @valorant_agents, dari A sampai Z."
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "0Ph45nS+VmIO2KvFlmxUmX1WT326qlgmOJbcckWbqjHP5stjScR+5YzekrJAFi7IY814xCFM/GU4z5irhxLuEA=="
---

# valorant-short-maker: pipeline yang menghasilkan Shorts Valorant saya sendirian

Selama beberapa bulan, sebuah channel YouTube berjalan tanpa saya sentuh: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop). Agen-agen Valorant yang saling mengejek di antara ronde, di-dubbing, dengan subtitle karaoke, dipublikasikan sebagai Shorts. Semuanya dihasilkan oleh [`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker), sebuah pipeline TypeScript/Bun yang berjalan di cron dan mempublikasikan tanpa siapa pun harus mengklik apa pun.

Begini cara kerjanya, langkah demi langkah.

## Hasilnya

Tiga frame diambil dari video yang dihasilkan untuk "Duelist Debate" (Phoenix, Yoru, dan Jett):

![Intro Short, lingkaran agen dengan judul adegan](/images/valorant-short-maker/vsm-01-intro.png)

![Sebuah dialog sedang berlangsung, subtitle karaoke menyala](/images/valorant-short-maker/vsm-02-dialogue.png)

![Dialog lain, warna subtitle berubah sesuai agen yang berbicara](/images/valorant-short-maker/vsm-03-dialogue.png)

Hasil langsung di Short ini: [Duelist Debate -- youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU). Di channel, Shorts berkisar di 1,2 sampai 1,5k views. Bukan apa-apa, tapi ini channel yang berjalan sendiri sejak awal, jadi angka yang benar-benar penting adalah nol -- nol menit yang dihabiskan sejak cron dinyalakan.

## Pipeline-nya, berurutan

### 1. Menulis skrip -- Groq + Llama 3.3

Setiap run mengambil 3 sampai 4 agen secara acak dari 26 yang tersedia, dan mengirim ke Llama 3.3 70B (via Groq) sebuah prompt sistem yang berisi, untuk setiap agen yang dipilih, ringkasan singkat tentang kepribadiannya dan hubungannya dengan agen lain yang ada di adegan (persona ini disimpan di `src/lore/`, satu file per agen). Prompt memberlakukan aturan ketat: satu kalimat pendek dan tajam per dialog, rotasi adil antar karakter, humor diprioritaskan, dan yang terpenting -- jeda.

Contoh nyata dengan "Duelist Debate" -- Phoenix, Yoru, dan Jett berdebat siapa yang akan main duelist, dihasilkan 6 Juli 2026:

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

Jeda adalah detail yang membuat ritme terasa natural: `[0.3]` yang disisipkan di tengah dialog menciptakan keheningan 0,3 detik di audio tanpa memotong lingkaran agen di layar, sementara baris `pause: 1.0` yang utuh menciptakan keheningan nyata antara dua pembicara, lingkaran disembunyikan. Tanpa ini, TTS yang membacakan dialog tanpa jeda terdengar seperti robot.

### 2. Memberi suara -- Piper, satu model per agen

Setiap agen punya model Piper (`.onnx`) sendiri yang dilatih khusus, disimpan di `voices/<agent>/`. Teks yang dihasilkan melewati model yang sesuai, yang menghasilkan WAV. Teknologi yang sama yang saya gunakan untuk training suara kustom secara umum (lihat artikel pipeline Piper/Kaggle) -- di sini diterapkan langsung di production, on-the-fly, setiap kali generasi video.

### 3. Subtitle karaoke -- ASS dihasilkan, warna diekstrak dari ikon

Subtitling bukan sekadar `.srt`. Ini adalah file `.ass` (Advanced SubStation Alpha) yang dihasilkan kata per kata, dengan efek karaoke: setiap kata menyala dalam satu warna saat diucapkan, sementara teks lainnya tetap dalam warna netral. Warna aksen tidak tetap -- diekstrak secara dinamis dari ikon agen yang berbicara (script Python menjalankan PIL pada PNG ikon, mengambil sampel piksel non-transparan, dan mengembalikan warna dominan). Hasilnya: subtitle Killjoy menyala ungu, Jett menyala biru kehijauan, tanpa ada satu warna pun yang di-hardcode di mana pun.

### 4. Lingkaran reaktif audio -- satu ekspresi FFmpeg per frame

Ini bagian paling rumit dari pipeline, dan mungkin yang paling saya banggakan. Ikon bulat agen yang berbicara tidak diam: dia zoom sedikit mengikuti irama suaranya sendiri.

Perhitungannya membaca WAV mentah dari dialog, menghitung envelope RMS (root mean square, ukuran energi sinyal) frame demi frame pada 60 fps, dinormalisasi dengan nilai maksimum, lalu dihaluskan pada jendela 3 frame untuk menghindari sentakan. Setiap nilai envelope kemudian dikonversi menjadi faktor skala yang dibatasi oleh `MAX_ZOOM_VARIATION` (0,2, atau ±20% dari ukuran dasar).

Hasil perhitungan ini tidak diterapkan lewat kode yang memanipulasi piksel -- melainkan diterjemahkan menjadi ekspresi kondisional FFmpeg raksasa (`lt(n,K)*val + between(n,K,K')*val + ...`, satu cabang per kelompok frame) yang langsung mengendalikan parameter `scale` dari filter video. FFmpeg mengevaluasi ekspresi ini di setiap frame render. Untuk dialog beberapa detik pada 60 fps, dengan cepat terbentuk ratusan cabang dalam satu ekspresi -- makanya ada parameter `STEP` yang mengelompokkan frame untuk membatasi kedalaman.

### 5. Render per segmen, lalu fisheye di intro

Setiap dialog dirender secara individual: latar video (klip gameplay acak dari `bg-video/`, dipotong sesuai durasi), lingkaran agen di atasnya dengan zoom reaktif audio, subtitle dibakar via filter `ass` FFmpeg, audio TTS dicampur dengan suara gameplay latar.

Segmen pertama mendapat perlakuan khusus: distorsi fisheye yang perlahan menghilang pada 20% frame pertama (filter `lenscorrection` dievaluasi frame demi frame, ditambah `tmix=frames=3` yang memadukan frame berdekatan untuk mensimulasikan motion blur), disinkronkan dengan suara "whoosh". Itu adalah transisi intro yang memberi kesan kamera "masuk" ke dalam adegan.

### 6. Konkatenasi dan mixing final

Semua segmen disambung dari ujung ke ujung, musik latar (Sneaky Snitch, Kevin MacLeod, lisensi Creative Commons) dicampur di atasnya dengan **audio ducking** -- kompresi sidechain yang otomatis menurunkan volume musik saat agen berbicara, dan menaikkannya kembali saat hening. Semuanya berjalan dalam 60 fps dari awal hingga akhir, tidak ada konversi framerate antar langkah.

### 7. Publikasi otomatis

Script `run-cron.sh`, dijalankan oleh cron biasa, mengaktifkan environment Python, memuat `.env`, dan menjalankan `bun src/workflow.ts --upload`. Flag `--upload` juga memicu generasi metadata (judul, deskripsi, tag) dan memanggil `uploaders/upload.py`, yang mempublikasikan video ke YouTube dan Instagram melalui dua script terpisah (`uploaders/youtube/upload.py` dan `uploaders/instagram/`). Seluruh rantai, dari prompt LLM hingga video online, berjalan tanpa campur tangan manusia.

## Kenapa TypeScript/Bun bukan semuanya Python

Pilihannya bukan ideologis -- Bun memberi akses langsung dan cepat ke `Bun.spawn` untuk mengendalikan FFmpeg sebagai subproses, strong typing pada struktur data pipeline (`Phrase`, `SegmentInfo`), dan runtime yang mulai jauh lebih cepat daripada Node untuk script yang berjalan di cron setiap beberapa jam. Dua potongan Python satu-satunya di proyek ini adalah di tempat Python benar-benar alat terbaik: PIL untuk ekstraksi warna, dan API upload (`google-api-python-client` untuk YouTube, stack Instagram Graph API untuk IG).

## Apa yang diilustrasikan

Proyek ini adalah contoh bagus tentang apa yang bisa dibangun hari ini dengan blok bangunan yang sepenuhnya gratis atau open source: LLM cepat dan gratis via Groq API, mesin TTS lokal yang berjalan tanpa GPU khusus, FFmpeg untuk semua rendering video -- dan perekatnya hanya beberapa ratus baris TypeScript. Tak satu pun dari blok-blok ini baru secara individual. Yang membuat pipeline adalah pengaturannya: menghasilkan skrip yang koheren dengan hubungan karakter nyata, mengubahnya menjadi audio ekspresif dengan jeda alami, menyinkronkan render visual ke energi audio itu frame demi frame, dan mengotomatiskan seluruh rantai sampai publikasi.

---

**Sumber Daya**

- **Repo**: [github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **Channel**: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**3 poin kunci**

1. Skrip dihasilkan oleh LLM (Groq/Llama 3.3) dengan persona dan hubungan per agen, bukan sekadar daftar lelucon yang sudah ditulis sebelumnya.
2. Zoom lingkaran agen dikendalikan oleh ekspresi FFmpeg yang dihitung frame demi frame dari envelope RMS WAV -- bukan animasi keyframe klasik.
3. Seluruh rantai, dari prompt hingga posting YouTube/Instagram, berjalan lewat satu cron job tanpa campur tangan manusia.
