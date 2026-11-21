---
title: "Luna Protocol : mutualisasi otak, klasifikasi emosional, dan routing menarik/tak berguna"
description: "Luna Protocol beralih dari monolit ke arsitektur empat lapisan : adaptor, brain, pengklasifikasi emosional, dan inference. Isinya : centroid embedding, routing menarik/tak berguna, dan penyesuaian parameter LLM berdasar valence dan arousal."
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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "XT5hmQ6U6NIWMAdQkp9T7X8f7ez9GsfZCi3w8Lkm2eRvU3d/3ZggrSeruHURhspPB2wRV3TJb4DL3eEuKeOYLg=="
---

# Luna Protocol : mutualisasi otak, klasifikasi emosional, dan routing menarik/tak berguna

Dalam [dua](/articles/fr/luna-protocol-discord-bot) [artikel](/articles/fr/luna-protocol-official-models) sebelumnya, saya memperkenalkan Luna Protocol sebagai bot Discord unik dengan sistem perilaku kompleks dan model yang di fine-tune. Tapi arsitekturnya sejak itu banyak berkembang. Yang dulunya monolit : satu proses Node.js yang menangani bot Discord, perilaku, dan panggilan LLM, telah berubah menjadi **empat lapisan independen**, masing-masing dengan tanggung jawab sendiri, bahasa sendiri, dan siklus hidup sendiri.

Pemisahan ini membawa manfaat tak terduga : mutualisasi "otak" antar banyak platform, sistem klasifikasi emosional yang menyesuaikan dinamis parameter LLM, dan routing cerdas pesan antara dua model menurut pentingnya percakapan yang dirasakan.

Evolusinya tidak terjadi sekaligus : ia mengikuti jalan organik. Saya pertama memisahkan folder `server/` dari repo bot, menciptakan **Krystal** di satu sisi dan membiarkan **Jade** sebagai adaptor Discord. Lalu saya membuat **Pixieglow** (adaptor Matrix) dengan memakai ulang `llm-core` dan bus event Jade. Kemudian datang **Sapphire** untuk memperkenalkan klasifikasi GENERIC/SEMANTIC dengan DistilBERT. Hasilnya tidak meyakinkan, jadi saya beralih lewat centroid embedding, yang lebih lentur untuk pengayaan contoh dan lebih tepat ; klasifikasinya menjadi FUTILE/INTERESSANT. Akhirnya saya menambahkan centroid **valence** dan **arousal** untuk meregulasi temperatur dan repeat penalty LLM. Terakhir, saya menyingkirkan semua kode redundan antara Jade dan Pixieglow dengan menciptakan **Emerald**, otak yang dimutualisasi, mengubah Jade dan Pixieglow menjadi klien socket-driven sederhana.

Paralel dengan itu, saya memelihara situs web yang menelusuri kemajuan proyek : [protocol-luna.github.io](https://protocol-luna.github.io/).

Artikel ini menceritakan bagaimana dan kenapa saya memotong lapisan ini, apa yang dilakukan tiap layanan tepatnya, dan bagaimana konsep seperti **centroid** (vektor rata-rata embedding) dan **variabel kebencian** (terinspirasi chatbot PARRY tahun 70-an) mengubah bot Discord sederhana menjadi sistem multi-platform yang mengejutkan koheren.

---

## Masalah dengan monolit

Awalnya, Luna Protocol muat dalam satu proses Node.js. Kode menangani :

- Koneksi ke Discord (lewat pustaka Eris)
- Evaluasi pemicu (mention, kata kunci, follow-up...)
- Simulasi perilaku manusia (salah ketik, keraguan, tidur...)
- Panggilan HTTP ke server LLM lokal (llama.cpp)
- Manajemen sesi dan anti-spam
- Pipeline TTS

Semuanya dalam proses yang sama, berkomunikasi lewat bus event bertipe (`TypedBus`). Itu berhasil, tapi dengan batas :

- **Mustahil menambahkan klien Matrix** tanpa menduplikasi seluruh kode perilaku
- **LLM dan bot ada dalam repo yang sama** : folder `server/` sudah ada, tapi mustahil mengembangkan satu tanpa menyentuh yang lain
- **Pemrosesan tak terdiferensiasi** : setiap pesan diperlakukan sama, entah "lol" atau pertanyaan eksistensial
- **Amnesia emosional** : bot tidak "merasakan" apa pun

Pemotongan berlapis menyelesaikan semua masalah ini.

---

## Empat lapisan

Arsitektur Luna Protocol saat ini disusun seperti corong empat tingkat :

```
Matrix / Discord
      |
      v
  [ADAPTOR]      Pixieglow (Matrix) / Jade (Discord)
      |
      v
  [BRAIN]            Emerald (WebSocket, port 3126)
      |
      v
  [PENGKLASIFIKASI]      Sapphire (HTTP, port 3123)
      |
      v
  [INFERENCE]        Krystal (llama.cpp, port 3124 / 3125)
```

Setiap lapisan bisa di restart, diperbarui, atau diganti independen.

---

### Lapisan 1 : adaptor (Pixieglow dan Jade)

Ini lapisan paling sederhana. Satu-satunya tugas mereka adalah menerjemahkan event platform pesan menjadi protokol terstandarisasi ke Emerald :

- **Jade** adalah adaptor Discord. Ia memakai pustaka Eris untuk terhubung ke Discord dan meneruskan pesan ke Emerald lewat WebSocket. Ia juga menangani pipeline TTS (sintesis vokal lewat Piper, konversi ke OGG, unggah ke Discord).
- **Pixieglow** adalah adaptor Matrix. Ia memakai API HTTP Client-Server Matrix langsung (tanpa SDK), dengan long-poll sync. Ia tidak punya TTS.

Kedua adaptor berbagi protokol WebSocket yang sama yang didefinisikan di `emerald-client.ts` :

```typescript
type ClientId = "jade" | "pixieglow";

// Event (adaptor -> Emerald)
type InEvent = MessageEvent | ReadyEvent | BotMessageEvent | PresenceEvent;

// Perintah (Emerald -> adaptor)
type OutCommand = RespondCommand | TypingCommand | SetPresenceCommand
                | SpontaneousCommand | ForgotCommand;
```

Keberadaan dua adaptor dengan antarmuka yang sama membuktikan mutualisasi : **"otak" yang sama (Emerald) melayani bot Discord dan bot Matrix secara acuh**, dengan perilaku identik. Protokolnya deklaratif : Emerald tidak memberi tahu adaptor *cara* mengirim pesan, ia memberi tahu *apa* yang dikirim (teks dengan penundaan, mungkin rencana burst, reaksi, dll.). Setiap adaptor mengimplementasikan eksekusi konkret menurut platformnya.

Inilah kekuatan arsitektur ini : untuk menambah dukungan Telegram, Signal, atau lain, cukup menulis adaptor yang mengimplementasikan protokol WebSocket.

---

### Lapisan 2 : otak (Emerald)

Emerald adalah layanan keputusan sentral. Ia mendengarkan di port 3126 dalam WebSocket dan menangani :

- **Evaluasi pemicu** : mention, DM, nama, kata kunci, follow-up, acak
- **Simulasi perilaku** : penundaan konsentrasi, salah ketik, keraguan, kelupaan, burst, kelelahan tematis
- **Siklus tidur** : mode sleep / slow / short
- **Manajemen sesi** : cooldown, batas sesi, anti-spam
- **Routing ke Sapphire** : pengiriman pesan, penerimaan respons yang di stream

Emerald adalah layanan sentral yang memungkinkan mutualisasi, dan dialah yang paling diuntungkan dari pemisahan. Sebelumnya, setiap perilaku (typo, burst, hesitation) terjalin dengan kode Discord. Sekarang, mereka ada dalam modul khusus di `behavior/` :

```
emerald/src/behavior/
  burst.ts         -- Perencanaan pesan beruntun
  mannerisms.ts    -- Penundaan, keraguan, reaksi, kelupaan
  sleep.ts         -- Evaluasi jadwal tidur
  typo.ts          -- Simulasi salah ketik (AZERTY/QWERTY)
```

Otak tidak tahu di platform mana ia berjalan. Ia menerima `MessageEvent` dengan `clientId` ("jade" atau "pixieglow"), mengambil keputusan, dan mengembalikan perintah. Adaptor mengurus sisanya.

---

### Lapisan 3 : pengklasifikasi emosional (Sapphire)

Sapphire adalah layanan paling menarik secara teknis. Ini **middleware LLM** yang ditulis dalam Python dengan FastAPI, yang memainkan empat peran kritis :

1. **Pengklasifikasi biner FUTILE / INTERESSANT** lewat centroid embedding
2. **Penskora emosional** (valence / arousal) lewat centroid
3. **Perute backend** ke Krystal (model kecil vs model besar)
4. **Penyuntik few-shot** dan manajer sesi

#### Centroid : jantung klasifikasi

**Centroid** adalah konsep sederhana : rata-rata dari himpunan vektor embedding. Konkretnya, saya mengumpulkan ratusan contoh pesan, melewatkannya ke model embedding (`BAAI/bge-small-en-v1.5`, 384 dimensi), dan merata-ratakan vektor yang didapat.

Ada **dua centroid klasifikasi** :

- `futile_centroid` : ~683 pesan trivial ("lol", "ok", "hello") lewat k-means (k=10, seed=42)
- `interessant_centroid` : ~678 pesan substansial (teknis, personal, filosofis) lewat k-means (k=10, seed=42)

Ketika pesan tiba :

```python
def classify(text, embedder, futile_centroids, interessant_centroids):
    emb = embedder.query_embed(text)                     # vektor 384-D
    sim_f = max(cos(emb, c) for c in futile_centroids)     # maks atas 10
    sim_i = max(cos(emb, c) for c in interessant_centroids) # maks atas 10
    diff = sim_i - sim_f
    label = "INTERESSANT" if diff > 0 else "FUTILE"
    return label, abs(diff), sim_f, sim_i
```

Skor per kelas adalah **kemiripan kosinus maksimal** di antara 10 centroidnya. Ini menangkap subtipe dalam tiap kategori : sapaan dan perpisahan keduanya jatuh dekat salah satu dari 10 centroid tak berguna meski jauh di ruang embedding. Hanya k-means saat startup dan dot product saat runtime : tanpa pelatihan, tanpa GPU.

#### Kenapa dua model?

Hasil klasifikasi ini memutuskan backend LLM mana yang dipanggil :

| Label | Backend Krystal | Model | Port |
|-------|----------------|--------|------|
| `FUTILE` | `generic` | Luna-Protocol-1.5B (941 MB, Q4_K_M) | 3124 |
| `INTERESSANT` | `semantic` | Hermes-3-3B atau 8B (menurut config) | 3125 |

Intuisinya sederhana : "lol" atau "nm just chillin u" tidak layak memanggil model 8 miliar parameter. Model kecil Luna 1.5B yang di fine-tune, dilatih pada 200 000 sampel Discord, sudah lebih dari cukup untuk pertukaran ringan. Sebaliknya, pertanyaan tentang hidup, curhatan, atau debat teknis di route ke model besar yang bisa menghasilkan respons lebih kaya.

Routing ekonomis ini sangat mengurangi beban pada server LLM : sekitar 70% pesan diklasifikasikan FUTILE dan diproses model kecil, membebaskan model besar untuk percakapan yang benar-benar layak.

#### Sumbu emosional : valence dan arousal

Tapi belum semuanya. Sapphire memakai **mekanisme centroid yang sama** pada sumbu independen untuk menilai emosi pesan :

Ada **empat centroid emosional** :

| Kutub | Contoh |
|------|----------|
| `positive` | "hell yeah", "love that", "this is great" |
| `negative` | "shut up", "i hate this", "this sucks" |
| `high_arousal` | "WHAT THE HELL", "omg omg omg", "AAAAA" |
| `low_arousal` | "just chilling", "meh", "i guess" |

Skor dihitung sebagai perbedaan kemiripan pada tiap sumbu :

```python
valence = sim(emb, positive) - sim(emb, negative)     # [-1, +1]
arousal = sim(emb, high_arousal) - sim(emb, low_arousal)  # [-1, +1]
```

**Valence** mengukur apakah pesan positif atau negatif. **Arousal** mengukur intensitas emosionalnya. Bersama, mereka membentuk model circumplex dari afek (Russell, 1980), model psikologis yang sama yang menginspirasi chatbot **PARRY** pada 1972.

#### Variabel kebencian : cara emosi mengendalikan LLM

Di sinilah inspirasi PARRY menjadi nyata. PARRY (dibuat Kenneth Colby pada 1972) adalah chatbot yang dirancang mensimulasikan pasien paranoid. Ia punya variabel internal (takut, marah, curiga) yang mengubah responsnya. Misalnya, PARRY yang "takut" menjawab lebih agresif.

Sapphire melakukan hal yang sama, tapi dengan variabel kontinu dan metode lebih elegan : parameter sampling LLM disesuaikan waktu nyata menurut keadaan emosional percakapan.

##### Temperatur mengikuti arousal

```python
temperature = clamp(0.7 + arousal * 0.3, 0.4, 1.0)
```

| Arousal | Temperatur | Efek |
|---------|-------------|-------|
| -1.0 (tenang) | 0.40 | Kreativitas rendah, respons bisa diprediksi |
| 0.0 (netral) | 0.70 | Kreativitas bawaan |
| +1.0 (bersemangat) | 1.00 | Randomitas maksimum, respons mengejutkan |

Ketika seseorang bersemangat atau kesal (arousal tinggi), temperatur naik. Model menghasilkan respons lebih bervariasi, lebih kreatif, kadang lebih kacau, seperti manusia yang "terbawa". Ketika percakapan tenang, temperatur turun, respons lebih tenang.

##### Repeat penalty mengikuti valence

```python
repeat_penalty = clamp(1.15 - valence * 0.1, 1.0, 1.3)
```

| Valence | Repeat Penalty | Efek |
|---------|---------------|-------|
| -1.0 (negatif) | 1.25 | Penalti kuat, menghindari pengulangan |
| 0.0 (netral) | 1.15 | Nilai bawaan |
| +1.0 (positif) | 1.05 | Penalti lemah, memungkinkan pengulangan |

Makin negatif percakapan, makin model didorong menghindari pengulangan, seperti seseorang yang mencari kata dalam perdebatan tegang. Makin positif percakapan, makin model bisa membiarkan penegasan redundan, seperti percakapan santai.

##### Keadaan emosional kumulatif

Skor ini tidak hanya soal pesan segera. `EmotionState` memelihara **rata-rata bergerak eksponensial** valence dan arousal per sesi :

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

`decay` 0.85 berarti 85% keadaan sebelumnya dipertahankan di setiap pesan, dan 15% sinyal baru diintegrasikan. Ini memberikan **memori emosional** yang menghaluskan variasi brutal : satu pesan negatif tidak membuat bot "sedih", tapi rangkaian pesan negatif berangsur menggeser moodnya.

Dalam praktik : kalau seseorang memulai percakapan dengan sangat bersemangat (`arousal=+0.8`), temperatur tetap tinggi selama beberapa pertukaran, meski pesan berikutnya lebih tenang. Emosi butuh waktu untuk turun, seperti manusia yang tetap "panas" setelah perdebatan.

---

### Lapisan 4 : inference (Krystal)

Krystal adalah lapisan terbawah : wrapper sekitar `llama.cpp` yang mengekspos API yang kompatibel OpenAI (`/v1/chat/completions`). Ia berjalan dalam dua instans PM2 :

- `krystal-small` : model Luna 1.5B yang di fine-tune, di port 3124, dengan afinitas CPU 0
- `krystal-large` : model Hermes 3B, di port 3125, dengan afinitas CPU 0,1

Kedua instans adalah proses `llama-server` yang dikompilasi sebelumnya, diluncurkan dengan `taskset` untuk pinning CPU.

Fine-tune model Luna juga berkembang sejak artikel kedua : kini dilatih pada **200 000 sampel** (lawan 50 000 sebelumnya), tetap dari Qwen2.5-1.5B-Instruct lewat QLoRA. 200k sampel adalah subset dataset Discord-Dialogues, difilter untuk hanya menyimpan percakapan paling alami dan paling beragam. Tujuannya : memperluas register stilistika model tanpa kehilangan fleksibilitas yang membuat few-shot priming begitu efektif.

---

## Skema lengkap : pesan dalam transit

Berikut yang terjadi konkret ketika seseorang mengirim "saya benar-benar sedih hari ini" di Discord :

1. **Jade** menerima pesan lewat API Gateway Discord. Ia mengubahnya menjadi `MessageEvent` dan mengirimnya ke Emerald lewat WebSocket.
2. **Emerald** mengevaluasi pemicu (mention? nama? kata kunci?). Ini mention langsung. Ia menghitung penundaan konsentrasi, memeriksa cooldown, sesi, kelelahan tematis. Ia memutuskan menjawab dan mengirim pesan ke Sapphire lewat HTTP.
3. **Sapphire** meng embed pesan dengan `bge-small-en-v1.5`.
   - Klasifikasi : pesan lebih dekat ke centroid `interessant` daripada centroid `futile` (diff = +0.31) -> **INTERESSANT**
   - Emosi : valence negatif (-0.42), arousal sedang (0.35)
   - Routing : arah `KRYSTAL_SEMANTIC_URL` (port 3125, model besar)
   - Parameter sampling : temperatur = 0.80 (arousal naik), repeat_penalty = 1.19 (valence negatif)
   - Keadaan emosional sesi diperbarui dengan nilai ini
4. **Krystal** (instans besar) membangkitkan respons dengan parameter yang disesuaikan emosional dan mengembalikannya ke Sapphire.
5. **Sapphire** me stream respons ke Emerald dengan metadata (label, valence, arousal, statistik debug).
6. **Emerald** memutuskan menambahkan keraguan ("oh..."), merencanakan burst (2 fragmen), dan memilih reaksi. Ia mengirim `RespondCommand` ke Jade.
7. **Jade** mengeksekusi : menunggu penundaan awal, mengirim fragmen pertama dengan keraguan, menunggu 1.5 dtk, mengirim fragmen kedua. Ia menunjukkan indikator mengetik selama seluruh pembangkitan.

Semua itu dalam kurang dari 3 detik bagi pengguna.

---

## Centroid : kenapa lebih baik daripada pengklasifikasi neural

Pilihan centroid embedding alih-alih pengklasifikasi tradisional (seperti DistilBERT yang saya pakai sebelumnya) layak dijelaskan.

Pengklasifikasi neural mempelajari batas keputusan antara kelas, biasanya transformasi non-linear yang memproyeksikan masukan ke probabilitas. Ia tepat, tapi :

- Ia membutuhkan data pelatihan berlabel
- Ia sensitif pada perubahan distribusi (data drift)
- Ia sulit diinterpretasikan
- Ia harus dilatih ulang untuk menambah kelas baru

Centroid, sebaliknya, adalah **vektor rata-rata** dari embedding contoh. Klasifikasi dilakukan lewat kemiripan kosinus pada vektor rata-rata ini. Keunggulan :

- **Tanpa pelatihan apa pun yang dibutuhkan** : kita hanya menghitung rata-rata embedding contoh yang dipilih tangan
- **Mudah diinterpretasikan** : kita bisa melihat contoh mana yang paling dekat dengan centroid untuk memahami "apa yang dipelajari centroid"
- **Penambahan kelas** : kita hanya menambah centroid baru, tanpa pelatihan ulang
- **Tangguh** : centroid adalah rata-rata, jadi outlier sedikit berdampak

Kekuatan sejati centroid adalah mereka mengubah masalah klasifikasi menjadi masalah **pengukuran jarak spasial**. Kita bisa memvisualisasikan kategori sebagai wilayah dalam ruang 384 dimensi (atau dalam 2D/3D setelah reduksi dimensional PCA/t-SNE).

### Visualisasi 3D centroid

Dalam praktik, beginilah tampilan centroid klasifikasi di ruang embedding. Setiap titik adalah pesan contoh, diproyeksikan ke 3D oleh PCA (384 dimensi asli direduksi menjadi 3 untuk visualisasi). Titik biru adalah pesan tak berguna, titik kuning pesan menarik. **20 penanda berlian** adalah centroid k-means (10 per kelas, seed=42). Arahkan mouse pada titik untuk melihat teks asli contohnya.

<iframe src="assets/centroids-plot.html" style="width:100%;height:550px;border:none;border-radius:8px;" loading="lazy" title="Classification par centroïdes - vue 3D interactive"></iframe>

Dua contoh uji ditampilkan merah : "lol" (diklasifikasikan tak berguna) dan "i feel sad today" (diklasifikasikan menarik). Bahkan setelah reduksi dari 384 ke 3 dimensi (14,7% varians yang dijelaskan), kedua cluster jelas terpisah. Anotasi di atas menunjukkan hitungan persis dan zona ambigu.

Centroid pesan masukan berjalan di ruang ini menurut isinya. Klasifikasi FUTILE/INTERESSANT hanya mengukur centroid mana yang paling dekat lewat kemiripan kosinus. Kita bisa merepresentasikan setiap pesan sebagai titik dalam ruang multi-dimensi, tiap dimensi cocok dengan properti semantik.

---

## Apa yang berubah dalam praktik

Pengguna tidak melihat lapisan, centroid, atau penyesuaian temperatur. Tapi mereka merasakan efeknya :

- **Respons lebih cepat** untuk pesan sederhana (model kecil 2x lebih cepat dan menangani 70% trafik)
- **Nada adaptif** : kalau kamu kesal, bot "merasakan" kekesalan dan menyesuaikan gayanya
- **Koherensi lintas platform** : bot Matrix dan bot Discord berbagi otak dan keadaan emosional yang sama
- **Nada otentik terjaga** : fine-tune + few-shot + routing cerdas menghindari respons korporat

Peralihan ke 200k sampel pelatihan untuk model kecil makin memperkuat efek ini : model lebih menangkap keragaman percakapan Discord tanpa kehilangan kelenturan yang dimungkinkan few-shot priming.

---

## Infrastruktur lengkap

Berikut layanan yang berjalan saat ini :

| Layanan | Teknologi | Port | Peran |
|---------|------------|---------|------|
| Pixieglow | TypeScript (Bun) | -- | Adaptor Matrix |
| Jade | TypeScript (esbuild) | -- | Adaptor Discord |
| Emerald | TypeScript (Bun) | 3126 (WebSocket) | Otak / keputusan |
| Sapphire | Python (FastAPI) | 3123 (HTTP) | Pengklasifikasi + emosi |
| Krystal small | llama.cpp (PM2) | 3124 | Model kecil (1.5B, tak berguna) |
| Krystal large | llama.cpp (PM2) | 3125 | Model besar (3B+, menarik) |

Dependensi antar layanan satu arah : adaptor bergantung pada Emerald, Emerald bergantung pada Sapphire, Sapphire bergantung pada Krystal. Graf tetap asiklik. Setiap layanan bisa di restart independen.

---

## Kesimpulan

Membagi Luna Protocol menjadi empat lapisan bukan sekadar latihan arsitektur. Ini jawaban atas batasan konkret : ketidakmungkinan mendukung Matrix, ketiadaan kesadaran emosional, ketiadaan prioritasasi cerdas pesan.

Hari ini, sistem lebih tangguh (crash LLM tidak membunuh bot), lebih bisa diperluas (adaptor Telegram atau WhatsApp akan mengikuti protokol WebSocket yang sama), dan lebih "hidup" : bot menyesuaikan perilakunya, nadanya, bahkan parameter LLM pada keadaan emosional percakapan yang dirasakan.

Centroid embedding adalah elemen kunci yang membuat semua ini mungkin tanpa kerumitan berlebihan : tanpa jaringan saraf yang dilatih, tanpa pipeline data berlabel, hanya rata-rata vektor dan kemiripan kosinus. Ini teknik sederhana, luar biasa efektif, dan sangat diremehkan.

| Sumber daya | Tautan |
|----------|------|
| Situs web proyek | [protocol-luna.github.io](https://protocol-luna.github.io/) |
| Pixieglow | [protocol-luna/pixieglow](https://github.com/protocol-luna/pixieglow) |
| Emerald | [protocol-luna/emerald](https://github.com/protocol-luna/emerald) |
| Sapphire | [protocol-luna/sapphire](https://github.com/protocol-luna/sapphire) |
| Krystal | [protocol-luna/krystal](https://github.com/protocol-luna/krystal) |
| Artikel 1 : bot Discord | [Luna Protocol : saya membuat bot Discord otonom](/articles/fr/luna-protocol-discord-bot) |
| Artikel 2 : fine-tuning | [Luna Protocol : kenapa saya men fine-tune model 1,5B](/articles/fr/luna-protocol-official-models) |
