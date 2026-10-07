---
title: "Luna Protocol: otak bersama, klasifikasi emosi, dan routing menarik/sia-sia"
description: "Luna Protocol berkembang dari monolit menjadi arsitektur empat lapis: adapter, brain, pengklasifikasi emosi, dan inference. Yang dibahas: centroid embedding, routing menarik/sia-sia, dan penyesuaian parameter LLM berdasarkan valence dan arousal."
date: 2026-07-27
tags:
  - discord
  - matrix
  - llm
  - architecture
  - embeddings
  - centroids
  - emotion-ai
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "c7uZE6rKXoPifAMCWHpuBRCWIZPE5TO8/vOMmFisSLc7m7QC9v72EiR7g+4Qn629USnGrAW49wbwa6arWyoMiw=="
---

# Luna Protocol: otak bersama, klasifikasi emosi, dan routing menarik/sia-sia

Dalam [dua](/articles/id/luna-protocol-discord-bot) [artikel](/articles/id/luna-protocol-official-models) sebelumnya, saya memperkenalkan Luna Protocol sebagai satu bot Discord tunggal dengan sistem perilaku yang kompleks dan model yang telah di-fine-tune. Namun arsitekturnya telah berkembang jauh sejak saat itu. Yang dulunya sebuah monolit -- satu proses Node.js tunggal yang menangani bot Discord, perilaku, dan pemanggilan LLM -- kini telah berubah menjadi **empat lapisan independen**, masing-masing dengan tanggung jawabnya sendiri, bahasanya sendiri, dan siklus hidupnya sendiri.

Pemisahan ini membawa manfaat tak terduga: berbagi "otak" lintas beberapa platform, sistem klasifikasi emosi yang secara dinamis menyesuaikan parameter LLM, dan routing pintar pesan antara dua model berdasarkan tingkat kepentingan percakapan yang dirasakan.

Evolusi ini tidak terjadi sekaligus -- ia mengikuti jalur yang organik. Saya pertama kali memisahkan folder `server/` dari repo bot, menciptakan **Krystal** di satu sisi dan membiarkan **Jade** sebagai adapter Discord. Kemudian saya membuat **Pixieglow** (adapter Matrix) dengan menggunakan kembali `llm-core` dan event bus milik Jade. Selanjutnya muncul **Sapphire**, yang memperkenalkan klasifikasi GENERIC/SEMANTIC dengan DistilBERT -- tetapi hasilnya kurang meyakinkan, sehingga saya beralih ke centroid embedding, yang lebih fleksibel untuk memperkaya contoh dan lebih akurat; klasifikasinya pun menjadi FUTILE/INTERESTING (sia-sia/menarik). Akhirnya saya menambahkan centroid **valence** dan **arousal** untuk mengatur temperature dan repeat penalty LLM. Terakhir, saya menghapus semua kode redundan antara Jade dan Pixieglow dengan membuat **Emerald**, otak bersama, yang mengubah Jade dan Pixieglow menjadi klien sederhana berbasis socket.

Selain itu, saya terus memperbarui sebuah situs web yang melacak kemajuan proyek: [protocol-luna.github.io](https://protocol-luna.github.io/).

Artikel ini menceritakan bagaimana dan mengapa saya memisahkan lapisan-lapisan ini, apa sebenarnya yang dilakukan tiap layanan, dan bagaimana konsep seperti **centroid** (vektor embedding rata-rata) dan **variabel resentment** (terinspirasi dari chatbot PARRY tahun 1970-an) mengubah bot Discord sederhana menjadi sistem multi-platform yang mengejutkan koherensinya.

---

## Masalah dengan monolit

Awalnya, Luna Protocol muat dalam satu proses Node.js tunggal. Kode tersebut menangani:

- Koneksi Discord (melalui library Eris)
- Evaluasi trigger (mention, kata kunci, follow-up...)
- Simulasi perilaku manusia (typo, keraguan, tidur...)
- Panggilan HTTP ke server LLM lokal (llama.cpp)
- Manajemen sesi dan anti-spam
- Pipeline TTS

Semuanya berada dalam proses yang sama, berkomunikasi melalui event bus bertipe (`TypedBus`). Ini berfungsi, tapi dengan keterbatasan:

- **Tidak mungkin menambahkan klien Matrix** tanpa menduplikasi semua kode perilaku
- **LLM dan bot berada dalam repo yang sama**: folder `server/` sudah ada, tetapi Anda tidak bisa mengembangkan satu tanpa menyentuh yang lain
- **Tidak ada klasifikasi pintar**: setiap pesan diperlakukan sama, entah itu "lol" atau pertanyaan eksistensial
- **Tidak ada status emosional yang persisten**: bot tidak "merasakan" apa pun

Pemisahan menjadi lapisan-lapisan menyelesaikan semua masalah ini.

---

## Empat lapisan

Arsitektur Luna Protocol saat ini diatur sebagai corong empat tingkat:

```
Matrix / Discord
      |
      v
  [ADAPTERS]      Pixieglow (Matrix) / Jade (Discord)
      |
      v
  [BRAIN]         Emerald (WebSocket, port 3126)
      |
      v
  [CLASSIFIER]    Sapphire (HTTP, port 3123)
      |
      v
  [INFERENCE]     Krystal (llama.cpp, port 3124 / 3125)
```

Setiap lapisan dapat di-restart, diperbarui, atau diganti secara independen.

---

### Lapisan 1: adapter (Pixieglow dan Jade)

Ini adalah lapisan paling sederhana. Satu-satunya tugas mereka adalah menerjemahkan event dari platform pesan menjadi protokol standar menuju Emerald:

- **Jade** adalah adapter Discord. Ia menggunakan library Eris untuk terhubung ke Discord dan meneruskan pesan ke Emerald melalui WebSocket. Ia juga menangani pipeline TTS (sintesis suara via Piper, konversi OGG, upload ke Discord).
- **Pixieglow** adalah adapter Matrix. Ia menggunakan Matrix Client-Server HTTP API secara langsung (tanpa SDK), dengan long-poll sync. Ia tidak memiliki TTS.

Kedua adapter berbagi protokol WebSocket yang sama yang didefinisikan di `emerald-client.ts`:

```typescript
type ClientId = "jade" | "pixieglow";

// Event (adapter -> Emerald)
type InEvent = MessageEvent | ReadyEvent | BotMessageEvent | PresenceEvent;

// Perintah (Emerald -> adapter)
type OutCommand = RespondCommand | TypingCommand | SetPresenceCommand
                | SpontaneousCommand | ForgotCommand;
```

Keberadaan dua adapter dengan interface yang sama membuktikan bahwa berbagi otak benar-benar berhasil: **"otak" yang sama (Emerald) melayani bot Discord dan bot Matrix tanpa perbedaan**, dengan perilaku yang identik. Protokolnya bersifat deklaratif: Emerald tidak memberi tahu adapter *bagaimana* mengirim pesan, tetapi memberi tahu *apa* yang harus dikirim (teks dengan delay, mungkin rencana burst, reaksi, dll). Setiap adapter mengimplementasikan eksekusi konkret untuk platformnya masing-masing.

Itulah kekuatan arsitektur ini: untuk menambahkan dukungan Telegram, Signal, atau apa pun lainnya, Anda hanya perlu menulis sebuah adapter yang mengimplementasikan protokol WebSocket.

Otak tidak tahu di platform mana ia berjalan. Ia menerima `MessageEvent` dengan sebuah `clientId` ("jade" atau "pixieglow"), membuat keputusan, dan mengembalikan sebuah perintah. Adapter menangani sisanya.

---

### Lapisan 2: otak (Emerald)

Emerald adalah layanan pengambilan keputusan pusat. Ia mendengarkan di port 3126 melalui WebSocket dan menangani:

- **Evaluasi trigger**: mention, DM, nama, kata kunci, follow-up, acak
- **Simulasi perilaku**: delay fokus, typo, keraguan, kelupaan, burst, kelelahan topik
- **Siklus tidur**: mode sleep / slow / short
- **Manajemen sesi**: cooldown, batas sesi, anti-spam
- **Routing ke Sapphire**: mengirim pesan, menerima respons yang di-stream

Emerald adalah layanan pusat yang memungkinkan berbagi otak, dan menjadi yang paling diuntungkan dari pemisahan ini. Sebelumnya, setiap perilaku (typo, burst, keraguan) terjalin dengan kode Discord. Sekarang mereka berada dalam modul khusus di bawah `behavior/`:

```
emerald/src/behavior/
  burst.ts         -- Perencanaan pesan burst
  mannerisms.ts    -- Delay, keraguan, reaksi, kelupaan
  sleep.ts         -- Evaluasi jadwal tidur
  typo.ts          -- Simulasi typo (AZERTY/QWERTY)
```

---

### Lapisan 3: pengklasifikasi emosi (Sapphire)

Sapphire adalah layanan yang paling menarik secara teknis. Ia adalah **middleware LLM** yang ditulis dalam Python dengan FastAPI, memainkan empat peran penting:

1. **Pengklasifikasi biner FUTILE / INTERESTING** melalui centroid embedding
2. **Penilai emosi** (valence / arousal) melalui centroid
3. **Router backend** ke Krystal (model kecil vs model besar)
4. **Penyuntik few-shot** dan manajer sesi

#### Centroid: jantung dari klasifikasi

**Centroid** adalah konsep sederhana: rata-rata dari sekumpulan vektor embedding. Secara konkret, saya mengumpulkan ratusan contoh pesan, memprosesnya melalui model embedding (`BAAI/bge-small-en-v1.5`, 384 dimensi), dan merata-ratakan vektor hasilnya.

Ada **dua centroid klasifikasi**:

- `futile_centroid`: embedding rata-rata dari ~683 pesan sepele via k-means (k=10, seed=42) ("lol", "ok", "hello", "nm just chillin u")
- `interesting_centroid`: embedding rata-rata dari ~678 pesan substansial (pertanyaan teknis, pengakuan, filosofi)

Ketika sebuah pesan masuk:

```python
def classify(text, embedder, futile_centroids, interesting_centroids):
    emb = embedder.query_embed(text)                        # 384-D vector
    sim_f = max(cos(emb, c) for c in futile_centroids)     # max over 10
    sim_i = max(cos(emb, c) for c in interesting_centroids)     # max over 10
    diff = sim_i - sim_f
    label = "INTERESSANT" if diff > 0 else "FUTILE"
    return label, abs(diff), sim_f, sim_i
```

Kemiripan kosinus antara pesan dan tiap centroid menentukan kategorinya. Selisih absolutnya memberikan tingkat kepercayaan. Ini sederhana, cepat (tanpa forward pass LLM), dan mengejutkan efektivitasnya.

#### Mengapa dua model?

Hasil klasifikasi ini menentukan backend LLM mana yang dipanggil:

| Label | Backend Krystal | Model | Port |
|-------|-----------------|-------|------|
| `FUTILE` | `generic` | Luna-Protocol-1.5B (941 MB, Q4_K_M) | 3124 |
| `INTERESTING` | `semantic` | Hermes-3-3B atau 8B (tergantung konfigurasi) | 3125 |

Intuisinya sederhana: "lol" atau "nm just chillin u" tidak pantas memanggil model dengan delapan miliar parameter. Model Luna 1.5B kecil yang telah di-fine-tune, dilatih pada 200.000 sampel Discord, lebih dari cukup untuk percakapan ringan. Sebaliknya, pertanyaan tentang kehidupan, pengakuan, atau debat teknis dirutekan ke model besar, yang dapat menghasilkan respons yang lebih kaya.

Routing yang hemat ini secara signifikan mengurangi beban pada server LLM: sekitar 70% pesan diklasifikasikan sebagai FUTILE dan ditangani oleh model kecil, membebaskan model besar untuk percakapan yang benar-benar layak.

#### Sumbu emosional: valence dan arousal

Namun itu belum semuanya. Sapphire menggunakan **mekanisme centroid yang sama** pada sumbu independen untuk mengevaluasi emosi pesan:

Ada **empat centroid emosional**:

| Kutub | Contoh |
|------|----------|
| `positive` | "hell yeah", "love that", "this is great" |
| `negative` | "shut up", "i hate this", "this sucks" |
| `high_arousal` | "WHAT THE HELL", "omg omg omg", "AAAAA" |
| `low_arousal` | "just chilling", "meh", "i guess" |

Skor dihitung sebagai selisih kemiripan pada setiap sumbu:

```python
valence = sim(emb, positive) - sim(emb, negative)     # [-1, +1]
arousal = sim(emb, high_arousal) - sim(emb, low_arousal)  # [-1, +1]
```

**Valence** mengukur apakah pesan bersifat positif atau negatif. **Arousal** mengukur intensitas emosionalnya. Bersama-sama, keduanya membentuk model circumplex afek (Russell, 1980) -- model psikologis yang sama yang menginspirasi chatbot **PARRY** pada tahun 1972.

#### Variabel resentment: bagaimana emosi mengendalikan LLM

Di sinilah inspirasi PARRY menjadi nyata. PARRY (dibuat oleh Kenneth Colby pada 1972) adalah chatbot yang dirancang untuk mensimulasikan pasien paranoid. Ia memiliki variabel internal -- ketakutan, kemarahan, ketidakpercayaan -- yang mengubah responsnya. Misalnya, PARRY yang "ketakutan" akan merespons lebih agresif.

Sapphire melakukan hal yang sama, tetapi dengan variabel kontinu dan metode yang lebih elegan: parameter sampling LLM disesuaikan secara real-time berdasarkan status emosional percakapan.

##### Temperature mengikuti arousal

```python
temperature = clamp(0.7 + arousal * 0.3, 0.4, 1.0)
```

| Arousal | Temperature | Efek |
|---------|-------------|--------|
| -1.0 (tenang) | 0.40 | Kreativitas rendah, respons yang dapat diprediksi |
| 0.0 (netral) | 0.70 | Kreativitas default |
| +1.0 (bersemangat) | 1.00 | Keacakan maksimum, respons yang mengejutkan |

Ketika seseorang bersemangat atau kesal (arousal tinggi), temperature naik. Model menghasilkan respons yang lebih beragam, lebih kreatif, kadang lebih kacau -- seperti manusia yang "terbawa suasana". Ketika percakapan tenang, temperature turun, dan respons menjadi lebih terukur.

##### Repeat penalty mengikuti valence

```python
repeat_penalty = clamp(1.15 - valence * 0.1, 1.0, 1.3)
```

| Valence | Repeat Penalty | Efek |
|---------|-----------------|--------|
| -1.0 (negatif) | 1.25 | Penalti kuat, menghindari pengulangan |
| 0.0 (netral) | 1.15 | Nilai default |
| +1.0 (positif) | 1.05 | Penalti rendah, mengizinkan pengulangan |

Semakin negatif percakapan, semakin model didorong untuk menghindari pengulangan dirinya sendiri -- seperti seseorang yang mencari kata-kata dalam perdebatan yang tegang. Semakin positif percakapan, semakin model dapat menerima pernyataan yang berulang, seperti percakapan yang santai.

##### Status emosional kumulatif

Skor-skor ini tidak hanya berlaku untuk pesan langsung. Sebuah `EmotionState` menjaga **rata-rata bergerak eksponensial** dari valence dan arousal per sesi:

```python
class EmotionState:
    def __init__(self, decay=0.85, deadzone=0.06):
        self.decay = decay
        self.deadzone = deadzone

    def update(self, key, valence_delta, arousal_delta):
        if abs(valence_delta) < self.deadzone:
            valence_delta = 0.0
        if abs(arousal_delta) < self.deadzone:
            arousal_delta = 0.0
        s = self._state.setdefault(key, {"valence": 0.0, "arousal": 0.0})
        s["valence"] = s["valence"] * self.decay + valence_delta * (1 - self.decay)
        s["arousal"] = s["arousal"] * self.decay + arousal_delta * (1 - self.decay)
        return s
```

`decay` sebesar 0,85 berarti 85% status sebelumnya dipertahankan di setiap pesan, dengan 15% sinyal baru diintegrasikan. Ini menciptakan **memori emosional** yang meredam perubahan mendadak: satu pesan negatif tidak membuat bot "sedih", tetapi serangkaian pesan negatif secara bertahap menggeser suasana hatinya.

Dalam praktiknya: jika seseorang memulai percakapan dengan sangat bersemangat (`arousal=+0.8`), temperature tetap tinggi selama beberapa pertukaran berikutnya, bahkan jika pesan-pesan selanjutnya lebih tenang. Emosi butuh waktu untuk mereda kembali -- seperti manusia yang tetap "panas" setelah bertengkar.

---

### Lapisan 4: inference (Krystal)

Krystal adalah lapisan paling bawah: sebuah wrapper di sekitar `llama.cpp` yang mengekspos API yang kompatibel dengan OpenAI (`/v1/chat/completions`). Ia berjalan sebagai dua instance PM2:

- `krystal-small`: model Luna 1.5B yang telah di-fine-tune, di port 3124, dengan CPU affinity 0
- `krystal-large`: model Hermes 3B, di port 3125, dengan CPU affinity 0,1

Kedua instance adalah proses `llama-server` yang telah dikompilasi sebelumnya, dijalankan dengan `taskset` untuk CPU pinning.

Fine-tune model Luna juga telah berkembang sejak artikel kedua: kini dilatih pada **200.000 sampel** (naik dari 50.000 sebelumnya), masih dimulai dari Qwen2.5-1.5B-Instruct melalui QLoRA. 200 ribu sampel tersebut adalah subset dari dataset Discord-Dialogues, difilter untuk hanya menyimpan percakapan yang paling alami dan beragam. Tujuannya: memperluas jangkauan gaya model tanpa kehilangan fleksibilitas yang membuat few-shot priming begitu efektif.

---

## Gambaran lengkap: sebuah pesan dalam perjalanan

Berikut adalah yang sebenarnya terjadi ketika seseorang mengirim "i'm really sad today" di Discord:

1. **Jade** menerima pesan melalui Discord Gateway API. Ia mengubahnya menjadi `MessageEvent` dan mengirimkannya ke Emerald melalui WebSocket.
2. **Emerald** mengevaluasi trigger (mention? nama? kata kunci?). Ini adalah mention langsung. Ia menghitung delay fokus, memeriksa cooldown, sesi, kelelahan topik. Ia memutuskan untuk merespons dan mengirim pesan ke Sapphire melalui HTTP.
3. **Sapphire** meng-embed pesan dengan `bge-small-en-v1.5`.
   - Klasifikasi: pesan lebih dekat ke centroid `interesting` daripada centroid `futile` (diff = +0.31) -> **INTERESTING**
   - Emosi: valence negatif (-0.42), arousal sedang (0.35)
   - Routing: arah `KRYSTAL_SEMANTIC_URL` (port 3125, model besar)
   - Parameter sampling: temperature = 0.80 (arousal meningkat), repeat_penalty = 1.19 (valence negatif)
   - Status emosional sesi diperbarui dengan nilai-nilai ini
4. **Krystal** (instance besar) menghasilkan respons dengan parameter yang telah disesuaikan secara emosional dan mengirimkannya kembali ke Sapphire.
5. **Sapphire** men-stream respons ke Emerald bersama metadata (label, valence, arousal, statistik debug).
6. **Emerald** memutuskan untuk menambahkan keraguan ("oh..."), merencanakan burst (2 fragmen), dan memilih reaksi. Ia mengirim `RespondCommand` ke Jade.
7. **Jade** mengeksekusi: menunggu delay awal, mengirim fragmen pertama dengan keraguan, menunggu 1,5 detik, mengirim fragmen kedua. Ia menampilkan indikator mengetik selama proses generasi berlangsung.

Semua ini terjadi dalam waktu kurang dari 3 detik bagi pengguna.

---

## Centroid: mengapa lebih baik daripada pengklasifikasi neural

Pilihan menggunakan centroid embedding dibandingkan pengklasifikasi tradisional (seperti DistilBERT yang saya gunakan sebelumnya) layak untuk dijelaskan.

Sebuah pengklasifikasi neural mempelajari batas keputusan antar kelas -- biasanya transformasi non-linear yang memetakan input menjadi probabilitas. Ini akurat, tetapi:

- Membutuhkan data pelatihan berlabel
- Sensitif terhadap pergeseran distribusi (data drift)
- Sulit diinterpretasikan
- Perlu dilatih ulang untuk menambahkan kelas baru

Sebaliknya, centroid adalah **vektor rata-rata** dari embedding contoh. Klasifikasi dilakukan dengan kemiripan kosinus terhadap vektor rata-rata tersebut. Keuntungannya:

- **Tanpa pelatihan**: Anda hanya perlu menghitung rata-rata embedding dari contoh-contoh yang dipilih secara manual
- **Mudah diinterpretasikan**: Anda dapat melihat contoh mana yang paling dekat dengan centroid untuk memahami "apa yang telah dipelajari centroid tersebut"
- **Menambahkan kelas**: Anda cukup menambahkan centroid baru -- tanpa perlu pelatihan ulang
- **Kuat**: centroid adalah rata-rata, sehingga outlier memiliki dampak kecil

Kekuatan sejati dari centroid adalah mereka mengubah masalah klasifikasi menjadi masalah **pengukuran jarak spasial**. Anda dapat memvisualisasikan kategori sebagai wilayah dalam ruang 384 dimensi (atau dalam 2D/3D setelah reduksi dimensi PCA/t-SNE).

### Visualisasi centroid 3D

Dalam praktiknya, berikut adalah tampilan centroid klasifikasi dalam ruang embedding. Setiap titik adalah contoh pesan, diproyeksikan dalam 3D melalui PCA (384 dimensi asli direduksi menjadi 3 untuk visualisasi). Titik biru adalah pesan sia-sia (futile), titik kuning adalah pesan menarik (interesting). Dua berlian besar adalah centroid yang telah dihitung -- rata-rata dari tiap kelompok. Arahkan kursor ke sebuah titik untuk melihat teks asli dari contoh tersebut.

<iframe src="assets/centroids-plot.html" style="width:100%;height:550px;border:none;border-radius:8px;" loading="lazy" title="Klasifikasi centroid - tampilan 3D interaktif"></iframe>

Dua contoh ditampilkan dengan warna merah: "lol" (diklasifikasikan futile) dan "i feel sad today" (diklasifikasikan interesting). "lol" jatuh ke dalam awan biru pesan sia-sia, sementara "i feel sad today" berada di sisi titik-titik kuning. Pemisahan terlihat bahkan setelah direduksi menjadi 3 dimensi (hanya 14,7% dari total varian yang dijelaskan). Dalam 384 dimensi, batasnya jauh lebih tajam.

Centroid dari pesan input bergerak melalui ruang ini tergantung pada isinya. Klasifikasi FUTILE/INTERESTING sederhananya hanya mengukur centroid mana yang lebih dekat dengan kemiripan kosinus. Ini memungkinkan kita merepresentasikan setiap pesan sebagai titik dalam ruang multi-dimensi, dengan setiap dimensi sesuai dengan properti semantik.

---

## Apa yang berubah dalam praktik

Pengguna tidak melihat lapisan-lapisan, centroid, atau penyesuaian temperature. Tetapi mereka merasakan efeknya:

- **Respons lebih cepat** untuk pesan sederhana (model kecil 2x lebih cepat dan menangani 70% lalu lintas)
- **Nada adaptif**: jika Anda kesal, bot "merasakan" iritasi tersebut dan menyesuaikan gayanya
- **Konsistensi lintas platform**: bot Matrix dan bot Discord berbagi otak yang sama dan status emosional yang sama
- **Tanpa "mode asisten"**: fine-tune + few-shot + routing pintar menghindari respons yang terdengar seperti korporat

Meningkatkan set pelatihan model kecil menjadi 200.000 sampel semakin memperkuat efek-efek ini: model lebih baik menangkap keragaman percakapan Discord tanpa kehilangan fleksibilitas yang diberikan few-shot priming.

---

## Infrastruktur lengkap

Berikut adalah layanan yang saat ini berjalan:

| Layanan | Teknologi | Port | Peran |
|---------|------------|---------|------|
| Pixieglow | TypeScript (Bun) | -- | Adapter Matrix |
| Jade | TypeScript (esbuild) | -- | Adapter Discord |
| Emerald | TypeScript (Bun) | 3126 (WebSocket) | Otak / keputusan |
| Sapphire | Python (FastAPI) | 3123 (HTTP) | Pengklasifikasi + emosi |
| Krystal small | llama.cpp (PM2) | 3124 | Model kecil (1.5B, futile) |
| Krystal large | llama.cpp (PM2) | 3125 | Model besar (3B+, interesting) |

Ketergantungan antar layanan bersifat satu arah: adapter bergantung pada Emerald, Emerald bergantung pada Sapphire, Sapphire bergantung pada Krystal. Tidak ada siklus. Setiap layanan dapat di-restart secara independen.

---

## Kesimpulan

Memisahkan Luna Protocol menjadi empat lapisan bukan sekadar latihan arsitektur. Ini adalah respons terhadap keterbatasan konkret: ketidakmampuan mendukung Matrix, kurangnya kesadaran emosional, dan tidak adanya prioritas pesan yang cerdas.

Hari ini, sistem ini lebih tangguh (crash LLM tidak mematikan bot), lebih dapat diperluas (adapter Telegram atau WhatsApp akan mengikuti protokol WebSocket yang sama), dan lebih "hidup": bot menyesuaikan perilakunya, nadanya, dan bahkan parameter LLM-nya terhadap status emosional percakapan yang dirasakan.

Centroid embedding adalah bagian kunci yang membuat semua ini mungkin tanpa kompleksitas berlebihan: tidak ada jaringan neural yang dilatih, tidak ada pipeline data berlabel, hanya rata-rata vektor dan kemiripan kosinus. Ini adalah teknik yang sederhana, luar biasa efektif, dan sangat diremehkan.

| Sumber daya | Tautan |
|----------|------|
| Situs web proyek | [protocol-luna.github.io](https://protocol-luna.github.io/) |
| Pixieglow | [protocol-luna/pixieglow](https://github.com/protocol-luna/pixieglow) |
| Emerald | [protocol-luna/emerald](https://github.com/protocol-luna/emerald) |
| Sapphire | [protocol-luna/sapphire](https://github.com/protocol-luna/sapphire) |
| Krystal | [protocol-luna/krystal](https://github.com/protocol-luna/krystal) |
| Artikel 1: bot Discord | [Luna Protocol: saya membangun bot Discord otonom](/articles/id/luna-protocol-discord-bot) |
| Artikel 2: fine-tuning | [Luna Protocol: mengapa saya melakukan fine-tune model 1,5B](/articles/id/luna-protocol-official-models) |