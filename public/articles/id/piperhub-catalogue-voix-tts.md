---
title: "PiperHub: 536 suara TTS open source, 7 emosi dalam satu model, nol GPU, nol tagihan"
description: "VITS, espeak, ONNX, LJSpeech: cara Piper membuat Raspberry Pi bisa bicara. Fortune multi dengan 7 emosi, Kokoro 82M, PocketTTS, sanoTTS, ElevenLabs - dan pipertts natif 10x lebih cepat dari wrapper Python."
date: 2026-11-12
tags:
  - tts
  - piper
  - open-source
  - typescript
  - ai
  - catalogue
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "4DrqSwtrCMqIOuwGtZf/jJFLv3Ca6Q9kv6s0oUdTfY3Qea6WaVN/PBTSJICEJ9SzWmT11ztTuxo1gI55iZSQeg=="
---

## Pendahuluan

Membuat bot Discord bisa bicara itu mahal. Bukan teksnya: LLM lokal menghasilkan kalimat hanya dengan beberapa sen GPU. Suaranya yang dibayar per kalimat. API sintesis menagih per karakter, dan kalau bot ngomong semalaman, tagihannya ikut jalan.

Itu masalah yang aku alami dengan Luna Protocol. Bot Discord-ku menghasilkan pesan dengan LLM lokal, lalu membacakannya dengan suara Piper, mengonversi ke OGG, dan mengirimnya sebagai pesan suara. Semuanya di server-ku sendiri, seharga 0 euro per kalimat, bahkan jam 3 pagi saat Luna memutuskan curhat sendirian.

Tetap di 0 euro artinya kamu harus cari suara gratis dan hosting sendiri. Dan di situlah mulai rumit: model tersebar di puluhan repo Hugging Face, lisensi tidak jelas, tidak ada cara tahu suara itu dari mana atau masih jalan atau tidak. Jadi aku membangun [PiperHub](https://piperhub.org/), katalog open source untuk suara Piper TTS.

Angka hari ini: **536 model** ditampilkan, **71 bahasa** terwakili, **3755 speaker** terdaftar. Setiap model ditautkan ke dataset asalnya kalau aku tahu, asal-usul adalah bagian dari suara, seperti kata halaman utama.

Sisa satu pertanyaan yang sering ditanyakan ke aku: bagaimana Piper dibanding Kokoro, PocketTTS, sanoTTS dan ElevenLabs? Dan kenapa modul `pipertts` Fortune 10x lebih cepat dari wrapper Python resmi? Artikel ini membuka mesinnya, dengan kode sebagai bukti.

## PiperHub, katalognya

Sebelum membuka mesin, lihat dulu masalah yang diselesaikan PiperHub.

### Suara-suara itu dari mana

Kodenya ada di [github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank). Astro, situs statis, nol server: bahasa Inggris di root, 15 locale lain di bawah `/<code>/` (fr, de, es, it, pt, ru, tr, ja, ko, zh, id, hi, ar, vi, th). Sebenarnya pattern yang sama seperti blog-ku.

Sumber kebenaran, tidak ada yang mengedit manual. Ini pipeline:

```bash
npm install
npm run data    # regenerasi src/data/*.json (python3 scripts/generate_data.py)
npx astro dev   # dev lokal
npm run build   # build statis ke dist/
```

Konkretnya: satu repo crawler memelihara `models_mapping.csv` dan `datasets_mapping.csv`, suara mirror tinggal di Hugging Face, sample adalah file audio. `npm run data` menarik semuanya dan memuntahkan `src/data/*.json`. Situsnya hanya membaca JSON statis.

Dalam data mentah saat ini (555 entri, situs menampilkan 536, crawl selalu sedikit lebih maju dari tampilan):

| Kualitas | Model |
|---|---|
| medium | 437 |
| high | 67 |
| low | 50 |

| Sample rate | Model |
|---|---|
| 22050 Hz | 486 |
| 16000 Hz | 47 |

486 suara di 22050 Hz, standar Piper. 47 di 16000 Hz, suara-suara kecil yang cepat untuk embedded. Phonemizer-nya `espeak` dalam 509 kasus, kita kembali ke sana, itu jantung sistemnya.

### Asal-usul, atau kenapa setiap model punya dataset

Hal yang membuat PiperHub berguna bukan sekadar list adalah tautan model <-> dataset. Contoh diambil dari home: suara **Astra - Valorant Piper TTS** ditautkan ke dataset **Astra - LJSpeech Dataset**. Kamu buka kedua halaman, kamu verifikasi repo dan lisensi di tiap sisi.

130 dataset dirujuk. Dan katalog jujur soal kondisi pasukan: 25 model ditandai `usable: false` (file rusak, atau format `piperPlus` yang butuh runtime fork). Modul `pipertts` menolak suara-suara ini dengan error eksplisit daripada crash aneh belakangan. 48 model adalah multi-speaker, termasuk dua yang akan menarik perhatian kita.

Soal panduan, situs beres dalam tiga langkah: **Build a dataset**, **Train a voice**, **Use a voice**, plus satu halaman Piper Plus. Dataset format LJSpeech sebagai input, ONNX sebagai output. Gampang diomong, lama dikerjakan, makanya ada bagian berikut.

## Piper di balik kap: VITS, espeak, ONNX

### Satu kalimat, tiga langkah

Saat kamu meminta Piper mengucapkan "bonjour", kejadiannya begini:

```
"bonjour"
  -> [phonémisation espeak-ng] -> b O~ Z u R
  -> [encodeur VITS + flow + décodeur] -> waveform 22050 Hz
```

Nol vocoder terpisah. Itulah VITS: satu model end-to-end yang langsung dari teks (yang sudah difonemkan) ke waveform. Di mana pipeline lama mengerjakan teks -> spektrogram (Tacotron) lalu spektrogram -> audio (HiFi-GAN, dua model, dua training), VITS mempelajari semuanya sekaligus dengan VAE kondisional, flow normalisasi dan diskriminator ala GAN pada decoder. Satu training, satu model, satu export ONNX.

Decoder memuntahkan 22050 Hz langsung. Pada sample rate itu, satu detik bicara sama dengan 22050 angka. Modelnya kecil (beberapa puluh MB di kualitas medium) dan inferensinya murni CPU: perkalian matriks di atas graf ONNX yang dioptimasi. Makanya Raspberry Pi jadi target resmi, Piper lahir di Rhasspy, asisten suara open source yang dibuat untuk jalan di Pi.

### espeak-ng, phonemizer yang mengerjakan semua kerjaan kotor

Sebelum VITS, teks harus diubah jadi fonem. 509 model dari 555 memakai `espeak`:

```bash
echo "bonjour" | espeak-ng --ipa -v fr
# bO~'ZuR
```

espeak-ng tahu pelafalan puluhan bahasa. Model VITS tidak pernah belajar ejaan Prancis dengan `eau` yang dibaca `o`, ia belajar dari fonem ke suara. Ini sangat menyederhanakan training dan menjelaskan kenapa Piper mencakup 71 bahasa: untuk bahasa baru, kamu colok suara espeak yang cocok lalu training.

Yang tidak pakai espeak punya phonemizer sendiri, dan di sinilah jadi eksotis: `hebrew` (Nakdimon ONNX + 494 baris aturan IPA), `pinyin` (BERT g2pW lengkap dengan disambiguasi polyphone, karakter Tiongkok yang sama dibaca beda tergantung katanya), `thai` (TLTK asli tanpa modifikasi), `japanese` (segmentasi lindera + UniDic). Modul `pipertts` mem-port ketujuhnya, terverifikasi identik dengan referensi Python. Kita kembali ke sana.

### Dataset: LJSpeech, selalu LJSpeech

Format training standar adalah LJSpeech: folder `wavs/` penuh klip, plus `metadata.csv`:

```
LJ001-0001|Printing, in the only sense with which we are at present concerned...|printing in the only sense...
LJ001-0002|in being comparatively modern...|in being comparatively modern...
```

`fileid|transcription|normalized`, satu klip sama dengan satu kalimat, beberapa detik. Dataset aslinya 13 000 kalimat Inggris dibaca satu penutur, domain publik. Untuk melatih suara Prancis, kamu merekam struktur yang sama dalam bahasa Prancis: teks + audio yang sejajar, beberapa jam cukup untuk medium yang layak, lebih banyak untuk high.

Tiga kualitas di katalog kurang lebih sesuai ukuran model + durasi training. Low: kecil, cepat, robotik. Medium: titik manis, dengan 437 model. High: lebih besar, lebih lambat, lebih natural, 67 model, termasuk para Fortune.

### Tiga tombol ajaib

Setiap suara Piper punya tiga parameter inferensi, dengan default yang hampir universal:

```json
"inference": { "noise_scale": 0.667, "length_scale": 1, "noise_w": 0.8 }
```

- `noise_scale` (0.667): variabilitas suara. Lebih tinggi berarti lebih ekspresif, lebih rendah berarti lebih stabil. Output-nya stokastik: dua sintesis dari kalimat yang sama menghasilkan dua audio yang sedikit berbeda.
- `noise_w` (0.8): variabilitas timing, ritme.
- `length_scale` (1.0): kecepatan. Di atas 1 melambat, di bawah itu mempercepat. Cara paling gampang membuat Luna bicara lebih cepat saat dia kesal.

Ingat `noise_scale`, ia akan dipakai untuk emosi.

## Fortune multi: 7 emosi, 1 ONNX saja

Oke, masuk ke bintang lokal.

Katalog mendaftar tiga model Fortune yang dilatih ItsRealFortune (halo):

| Model | Repo | Suara |
|---|---|---|
| ItsRealFortune - French (FR) High | `fox3000foxy/piper-fortune-v6` | 1 (voice-0) |
| ItsRealFortune - French (FR) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-fr-multi` | **7** |
| ItsRealFortune - English (EN) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-en-multi` | **7** |

Multi FR itu begini:

```
normal, joyeuse, storytelling, colere, triste, surprise, interrogative
```

Tujuh varian emosional dalam **satu file ONNX**. Multi EN sama, dengan typo historis di nama: `suprised` bukan `surprised`. Ia ada di weight, kita pertahankan, itu bagian dari folklore.

### Bagaimana cara kerja speakerId?

VITS multi-speaker adalah model yang sama dengan satu input tambahan: embedding speaker. Saat training, setiap klip diberi tag dengan gayanya, model mempelajari tabel embedding (satu per gaya) bersamaan dengan sisanya. Saat inferensi, kamu pilih baris tabelnya:

```ts
import { PiperNativeTTS } from "pipertts";

const tts = await PiperNativeTTS.load({
  model: "hub:itsrealfortune-french-fr-multi-high",
  modelsDir: "./models",
});

const styles = [
  "normal", "joyeuse", "storytelling",
  "colere", "triste", "surprise", "interrogative",
];

for (let i = 0; i < styles.length; i++) {
  const r = await tts.synthesize("Quelle merveilleuse nouvelle !", {
    speakerId: i,           // 0 = normal ... 5 = surprise
    outputFile: `./fortune-${styles[i]}.wav`,
  });
}
```

Kalimat yang sama, tujuh pembacaan. `speakerId: 5` (surprise) dengan `noise_scale` sedikit didorong, dan kamu dapat seruan yang meyakinkan. `speakerId: 4` (triste), `length_scale: 1.1` untuk melambat, dan kamu dapat pengumuman duka. Begitulah Luna memodulasi suaranya: otak memilih emosi (valence/arousal, lihat artikelku soal centroid), TTS memilih speakerId.

Dataset di belakangnya bernama sederhana **Fortune French - Dataset**, dengan lisensi bernama "Fortune's Café". Ya, lisensinya bernama seperti kafe. Tidak, ia tetap begitu.

### Kenapa ini cerdas secara ekonomi

Tujuh emosi sama dengan satu unduhan, satu loading di RAM, satu sesi ONNX. Alternatifnya (tujuh model terpisah) akan melipatgandakan penyimpanan dan memaksa reload graf setiap ganti emosi, tidak bisa dimainkan untuk bot yang ganti nada di tengah kalimat. Di sini, `speakerId` hanya indeks ke tensor. Biaya marjinal: nol.

## Pesaing: Kokoro, PocketTTS, sanoTTS

Piper berbagi CPU dengan tiga penantang serius, tiga filosofi berbeda.

### Kokoro 82M, raja kualitas harga

[Kokoro](https://huggingface.co/hexgrad/Kokoro-82M), oleh hexgrad. 82 juta parameter, arsitektur StyleTTS 2 yang dimodifikasi dengan decoder ISTFTNet, **tanpa langkah difusi**. Tidak adanya difusi inilah segalanya: tidak ada loop denoising iteratif, jadi inferensi sangat cepat.

| | Kokoro-82M |
|---|---|
| Params | 82M |
| Poids | ~300 Mo (164 Mo en FP16) |
| Licence | Apache 2.0 (commercial OK) |
| Langues | 8, 54 voix preset + blending |
| CPU | quasi temps réel |
| GPU | 36 à 96x temps réel |
| Tests aveugles | au niveau de Google et Amazon |

Dilatih dengan kurang dari 100 jam audio seharga sekitar 1000 dolar, dan pendengar buta menempatkannya setara suara premium Google dan Amazon. Makanya ia meledak: kualitas premium, gratis, lokal, permisif.

Melawan Piper: Kokoro menang di naturalitas murni (StyleTTS 2 di atas VITS kecil) dan lisensi (Apache 2.0 lawan mesin GPL-3.0 untuk Piper). Piper menang di cakupan (71 bahasa lawan 8, 3755 speaker lawan 54 suara) dan ekosistem suara komunitas. Untuk narasi Inggris, Kokoro sulit dikalahkan. Untuk Prancis dengan 7 emosi, Turki atau Swahili, Piper sering satu-satunya kandidat.

### PocketTTS (Kyutai), kloning di CPU

[Kyutai](https://kyutai.org/tts/) memainkan partitur lain: model kecil **dengan kloning suara**, yang jalan di CPU.

| Model | Params | WER | UTMOS | SIM | Kecepatan CPU (1 thread) |
|---|---|---|---|---|---|
| Pocket TTS | ~100M | 0.92% | 4.364 | 0.923 | 2.8x temps réel |
| Pocket TTS small | 1.9M / 6.9M / 18.2M | - | - | - | CPU, clonage inclus |

WER di bawah 1% (pelafalannya benar), UTMOS 4.36 (kualitas yang dirasakan luar biasa), SIM 0.923 (klonnya benar-benar mirip target). Dan versi small turun sampai **1.9M parameter** dengan kloning. 1.9M. Router Sabaki-ku hampir sebesar itu dalam JSON.

Melawan Piper: PocketTTS menang di kloning (Piper membaca dengan suara tetap) dan kekompakan flagship. Piper menang di bahasa (small untuk sekarang English-only) dan kematangan ekosistem (536 suara siap lawan "latih sendiri").

### sanoTTS, model yang muat di chip 3 dolar

[sanoTTS](https://github.com/ampixa/sanoTTS) (`sano` artinya "kecil" dalam bahasa Nepal), ini Bareiron-nya TTS: stack neural lengkap yang pergi dari fonem ke PCM 22.05 kHz **di mikrokontroler**.

| Sistem | Params | SCOREQ | UTMOS | DNS-SIG |
|---|---|---|---|---|
| sanoTTS (heart-nano) | 0.29M | 2.29 | 2.45 | 3.35 |
| TinyTTS | 1.62M | 3.94 | 3.65 | 3.62 |

0.29M parameter. 2 MB per suara. `pip install sanotts`, `sanotts say "Hello" --voice amy`, ia bicara. Di browser juga.

Tapi lihat skornya: SCOREQ 2.29 lawan 3.94 untuk TinyTTS, UTMOS 2.45. Ia bicara, ya. Ia bernyanyi, tidak. Itulah tradeoff pamungkas: di 0.29M kamu muat di mana saja tapi kualitas mengikuti ukuran. Piper medium beratnya 100x untuk suara di liga lain.

### Tabel ringkasannya

| | Piper | Kokoro 82M | PocketTTS | sanoTTS |
|---|---|---|---|---|
| Params typiques | ~10-60M | 82M | ~100M / 2-18M | 0.3-1.4M |
| Langues | 71 | 8 | EN (+ smalls EN) | multilingue, petit |
| Voix dispos | 3755 speakers | 54 + blending | clonage (la tienne) | quelques voix |
| Clonage | non | non (natif) | **oui, CPU** | non |
| Licence moteur | GPL-3.0 | Apache 2.0 | open (Kyutai) | open |
| Entraînable maison | oui (LJSpeech) | oui (plus lourd) | oui | oui |
| Qualité FR | bonne (multi émotions) | correcte (EN-first) | EN-only | faible |

Pilihan tergantung batasanmu, tidak ada pemenang mutlak: kualitas EN murni pilih Kokoro. Kloning CPU pilih PocketTTS. Mikrokontroler pilih sanoTTS. Cakupan bahasa + suara Prancis emosional + nol infra pilih Piper.

## ElevenLabs, Goliath yang ditagih

Lalu ada ElevenLabs. 70+ bahasa, Eleven v3 ekspresif dengan audio tag dan dialog dramatis, kualitas top blind test. Semacam Jev-nya TTS: semua orang pernah melihatnya lewat, semua orang pernah benchmark melawannya.

Harga 2026, angka bulat:

| Model API | Harga / 1000 karakter |
|---|---|
| Flash / Turbo, v3 Conversational | $0.05 |
| Multilingual v2, Eleven v3 | $0.10 |

1000 karakter menghasilkan sekitar 1 menit audio. Jadi $0.05 sampai $0.10 per menit. Paket Pro $99 mencakup sekitar 990k karakter, overage kena tarif yang sama. Untuk channel YouTube yang merilis satu video sehari dengan voice over (tool `valorant-short-maker`-ku melakukan persis itu, tapi dengan Piper gratis), hitung $1.50 sampai $3 per bulan untuk setiap menit voice over harian. Sepuluh menit sehari: $15 sampai $30/bulan. Bisa dibayar, tapi harus dihitung.

Kapan layak: saat suara **adalah** produknya (d Sulih suara, audiobook, iklan), saat butuh 70 bahasa besok pagi, saat kloning harus sempurna dari percobaan pertama. Sebaliknya tidak pernah layak untuk: bot Discord yang ngomong semalaman, notifikasi internal, dev, volume yang meledak. Luna yang curhat jam 3 pagi pakai ElevenLabs, tagihan listrikku yang menangis.

Hitungannya sederhana: Piper sama dengan 0 euro marjinal, kualitas "bagus". ElevenLabs sama dengan meteran yang berputar, kualitas "luar biasa". Di antaranya, ada dunia di mana "bagus dan gratis" menang, itu seluruh taruhan PiperHub.

## pipertts: kenapa yang natif 10x lebih cepat dari wrapper Python

Repo [itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts), 75 commit: port natif Piper ke TypeScript. Judul README: "In-process Piper TTS for Node.js. No Python required."

### Biaya spawn

Wrapper historis (`PiperTTS`) adalah `python3 -m piper` yang di-spawn sebagai subprocess **setiap sintesis**:

```
synthèse = spawn(python) + chargement du modèle + inférence + kill
```

Setiap kalimat membayar startup interpreter + loading weight. Diukur pada `en_US-lessac-medium`: **sekitar 2.2 detik per baris**.

Yang natif (`PiperNativeTTS`) menjaga sesi ONNX **tetap hangat di memori**:

```
load une fois -> session persistante -> inférence par phrase
```

Diukur sama: **sekitar 0.22 detik per baris**. Angka 10x datang dari sana: kita membunuh spawn dan reload, inferensi ajaib tidak ada hubungannya di sini. Inferensi ONNX sendiri sama di kedua sisi.

Bonus, load pertama meng-cache graf yang dioptimasi di samping `.onnx` (`<model>.ortopt-<platform>-<arch>-v<ort>.onnx`), yang membuat loading berikutnya sekitar 35% lebih cepat. Kunci cache menggabungkan platform, arch dan versi ORT, dan ia refresh jika model berubah. Bisa dimatikan dengan `cacheOptimizedModel: false`.

### Jembatan espeak: 0.4ms lawan 15ms

Logika yang sama untuk fonemisasi. Wrapper memanggil biner `espeak-ng` via CLI per kalimat: sekitar 15ms spawn setiap kali. Yang natif menyertakan bridge N-API (`src/native/espeak-bridge/`, port dari `espeakbridge.c`), dengan prebuild untuk Linux x64/arm64: **sekitar 0.4ms per panggilan**, fonem identik per byte. Tanpa addon, fallback otomatis ke CLI. `PIPER_ESPEAK_BRIDGE=0` untuk memaksa CLI.

### 7 phoneme_type, semuanya di-port

| Tipe | Mesin | Catatan |
|---|---|---|
| `espeak` | bridge N-API ou CLI | clauses byte-identiques |
| `text` | passthrough codepoints | trivial |
| `hebrew` | Nakdimon ONNX + règles IPA | sorties identiques |
| `lithuanian` | espeak + dico de stress 189k entrées | sorties identiques |
| `pinyin` | BERT g2pW ONNX + WordPiece | désambiguïsation des polyphones OK |
| `thai` | vrai TLTK non modifié sous Pyodide/WASM | 7/7 identiques (1er appel lent, suite rapide) |
| `japanese` | lindera-wasm + UniDic + moteur de mores TS | segmentation exacte, **pas d'accent lexical** |

Dan bahasa Arab didiakritik otomatis (tashkeel, bisa dimatikan). 509 suara espeak di katalog lewat bridge cepat, yang eksotis lewat mesin khusus. 71 tes dalam suite, batasan didokumentasikan di tempat yang macet (aksen Jepang, UniDic tidak memberi data apa pun, diakui, tidak ada yang disembunyikan).

### Format dan streaming

`wav` default, `raw` PCM, `mp3`, `ogg`, `opus`: ffmpeg kalau ada, kalau tidak fallback JS murni (lamejs untuk mp3, opusscript + muxer Ogg untuk opus, korelasi 0.993 dengan sumber). Dan terutama `synthesizeChunks()`: generator async yang yield per kalimat, dengan `sentenceSilence` antar kalimat. Untuk Luna, artinya mulai memutar audio sementara bagian akhir disintesis, streaming TTS tanpa server khusus.

Pemakaian lengkap, dengan katalog PiperHub terintegrasi (`hub:` + fallback mirror otomatis jika repo penulis tidak lagi menyajikan file):

```ts
const tts = await PiperNativeTTS.load({
  model: "hub:glados-french-medium-voice",
  modelsDir: "./models",
});

const r = await tts.synthesize("Bonjour, je suis GLaDOS.", {
  outputFormat: "ogg",   // langsung untuk Discord
  lengthScale: 0.95,     // sedikit lebih cepat
});
```

Suara komunitas (GLaDOS dan karakter game) absen dari manifest resmi, itulah tepatnya kenapa PiperHub ada, dan `pipertts` tahu betul: `hub:<slug>`, URL halaman piperhub, atau slug telanjang, semua jalan. Suara yang ditandai `usable: false` ditolak dengan error yang jelas.

## Yang dikorbankan

Setiap fitur yang absen membiayai fitur lain. Daftar jujurnya:

**Piper terdengar robotik di samping ElevenLabs.** VITS medium pada 22050 Hz bersih tapi datar dibanding model ekspresif besar. Multi-emosi mengkompensasi sebagian (7 gaya lebih baik dari 1 gaya datar), tapi audiobook ElevenLabs v3 tetap di atas. Itulah harga puluhan MB.

**espeak salah baca.** Nama proper, anglisisme, singkatan: fonemisasi berbasis aturan punya titik buta. "Spoiler" dalam bahasa Prancis, espeak membacanya semampunya. Model besar dengan G2P neural lebih jarang salah. Di prod, perlu kamus pengecualian untuk istilah bisnis.

**Nol kloning natif.** Piper membaca dengan suara tetap. Kalau kamu mau suaramu SENDIRI, arahnya PocketTTS atau ElevenLabs. Multi-speaker memberi variasi, tidak pernah timbre-mu.

**Jepang tetap tanpa aksen leksikal.** UniDic tidak memberi data aksen apa pun, jadi segmentasi tepat tapi melodinya perkiraan. Didokumentasikan di README, tidak ada yang disembunyikan.

**Thai lambat di panggilan pertama.** TLTK jalan di bawah Pyodide/WASM tanpa modifikasi: panggilan pertama makan detik (loading), berikutnya cepat. 7/7 identik dengan referensi, tapi sediakan warm-up.

**Datanya lapar.** Suara high yang layak butuh jam audio bersih yang sejajar. Dataset Fortune adalah jam rekaman + bersih-bersih. Nol sihir: sampah masuk, robot keluar.

**Katalog punya suara mati.** 25 model ditandai `usable: false`. Diakui dan difilter, tapi mengingatkan bahwa crowdsourcing suara juga crowdsourcing pengabaian.

## Hasil akhir

Di satu sisi meteran ElevenLabs, di sisi lain Raspberry Pi:

- PiperHub: 536 model ditampilkan, 71 bahasa, 3755 speaker, 130 dataset tertaut, panduan dataset -> training -> usage
- Piper: VITS end-to-end, espeak, ONNX CPU, LJSpeech, low/medium/high, standar 22050 Hz
- Fortune multi: 7 emosi FR + 7 EN, masing-masing 1 ONNX, `speakerId` untuk ganti, lisensi "Fortune's Café"
- Kokoro 82M: kualitas premium EN, Apache 2.0, 54 suara, hampir realtime CPU
- PocketTTS: kloning CPU, sekitar 100M lalu 2-18M, WER 0.92%
- sanoTTS: 0.29M, 2 MB, mikrokontroler, kualitas mengikuti ukuran
- ElevenLabs: $0.05-0.10/1000 karakter, 70+ bahasa, top kualitas, meteran berputar
- pipertts natif: sekitar 0.22 detik/baris lawan sekitar 2.2 detik wrapper, bridge espeak 0.4ms, 7 phoneme_type, wav/raw/mp3/ogg/opus, streaming per kalimat

Luna bicara dengan ini setiap hari. 0 euro TTS, emosi dikemudikan otak, OGG langsung untuk Discord. Dibanding ElevenLabs kedengaran bedanya, jelas. Tapi jam 3 pagi saat dia memutuskan curhat, tagihanku tidur tenang.

## Filosofinya

p2r3 bilang: *"J'aime juste l'idée que cette toute petite puce à 1 balles puisse faire tourner quelque chose d'aussi avancé que Minecraft."*

Vibe yang sama di sini, diterapkan ke suara: aku suka ide bahwa beberapa puluh MB ONNX membuat Raspberry Pi bicara 71 bahasa, tanpa cloud, tanpa akun, tanpa meteran. Ini jelas tidak menggantikan studio dubbing mana pun. Ini menggantikan kasus menyebalkan di mana kamu mau suara yang layak, lokal, gratis, yang bicara malam tanpa menagihmu.

Tradeoff, tertulis hitam di atas putih:
- kualitas premium -> VITS kecil: sedikit robotik, tapi lokal dan gratis
- satu model per emosi -> speakerId: 7 suara seharga satu di RAM
- spawn Python -> sesi persisten: 10x lebih cepat, nol Python diinstal
- katalog liar -> asal-usul tertaut: setiap suara tahu dari mana ia datang dan masih jalan atau tidak
- API berbayar -> 0 euro marjinal: kurang bagus dari ElevenLabs, tapi tagihan tidur tenang

**3 hal yang perlu diingat:**

1. **Piper adalah TTS-nya CPU** - VITS + espeak + ONNX, 71 bahasa, suara-ground puluhan MB yang jalan di Pi. Kurang bagus dari ElevenLabs, jauh lebih murah.
2. **Fortune multi sama dengan 7 emosi seharga satu** - satu ONNX saja, `speakerId` untuk ganti, FR + EN. Embedding speaker bukan 7 model.
3. **Yang natif membunuh spawn** - `pipertts` menjaga sesi ONNX tetap hangat: 0.22 detik/baris lawan 2.2 detik, bridge espeak 0.4ms lawan 15ms CLI. Inferensi yang sama, 10x lebih sedikit menunggu.

Kalau proyek ini menarik buat kamu, katalognya di [piperhub.org](https://piperhub.org/), kode situs di [github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank), modul natif di [github.com/itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts). Dan kalau kamu mau dengar Luna curhat jam 3 pagi, ketemu di Discord xD
