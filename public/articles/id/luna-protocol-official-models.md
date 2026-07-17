---
title: "Luna Protocol: Mengapa saya melakukan fine-tune model 1,5B pada 50k sampel Discord dan menjadikan few-shot priming sebagai senjata rahasia"
description: "Model yang lebih kecil yang dilatih dengan data lebih sedikit bisa mengungguli model yang lebih besar -- jika Anda tahu cara mempersiapkannya. Inilah mengapa Luna Protocol beralih dari Hermes 3B ke fine-tune Qwen 1,5B, dan mengapa few-shot priming menjadi pengubah permainan yang sesungguhnya."
date: 2026-07-17
authors:
  - fox3000foxy
tags:
  - discord
  - llm
  - fine-tuning
  - few-shot-learning
  - qwen
  - unsloth
  - open-source
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "Kr9b0TOLokSC8TjZLACg2c9lu/GsAB8T5QFv+QeVCJOFJ9fB+NlvBPug3SCMtSLyLkgMYD1Eq22O94LKFSSYoQ=="
---

# Luna Protocol: Mengapa saya melakukan fine-tune model 1,5B pada 50k sampel Discord dan menjadikan few-shot priming sebagai senjata rahasia

Pada [artikel pertama](/articles/en/luna-protocol-discord-bot), saya membuat bot Discord yang mensimulasikan manusia -- tidur, typo, keraguan, kelupaan, pesan spontan. Sistem perilakunya solid. LLM di belakangnya adalah model Hermes 3B, terkuantisasi ke Q8_0, memakan 3GB VRAM.

Itu berhasil. Tapi itu berlebihan.

Bot Discord tidak membutuhkan model 3B parameter untuk mengatakan "nm just chillin, u". Yang dibutuhkan adalah **konsistensi gaya** -- kemampuan untuk mempertahankan nada percakapan tertentu, pesan demi pesan, tanpa melenceng ke mode asisten korporat. Ternyata, model yang lebih kecil yang dilatih dengan data lebih sedikit, dipersiapkan dengan beberapa contoh, melakukannya lebih baik daripada model yang lebih besar yang memaksakan jalannya melalui prompt sistem.

Artikel ini membahas model resmi Luna Protocol: mengapa mereka ada, mengapa 1,5B bukan 3B, mengapa 50k sampel pelatihan bukan 7,3M, dan mengapa few-shot priming berubah dari sesuatu yang "nice-to-have" menjadi inti dari seluruh pendekatan.

---

## Masalah dengan model 3B

Pengaturan awal menggunakan `Discord-Micae-Hermes-3-3B.Q8_0.gguf` -- model 3B parameter yang di-fine-tune pada data Discord. Model ini menghasilkan respons yang baik, tetapi:

| Metrik | Hermes-3-3B Q8_0 | Target |
|--------|-------------------|--------|
| Penggunaan VRAM | ~3 GB | < 1 GB |
| Generasi token | ~30 tok/s | ~60+ tok/s |
| Ukuran file model | ~3,2 GB | < 1 GB |
| Waktu cold start | ~8s | ~3s |

Untuk bot yang berjalan 24/7 di server sederhana, 3GB VRAM sangat besar. Dan kecepatan generasi -- meskipun cukup untuk pesan sesekali -- terasa lambat saat respons burst atau ketika beberapa kanal aktif.

Pertanyaannya: bisakah kita mendapatkan gaya Discord-Dialogues yang sama dengan setengah parameter?

---

## Keputusan fine-tuning: mengapa 50k, bukan 7,3M

Dataset [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) berisi **7,3M pertukaran** dan **17M giliran**. Ini adalah korpus besar percakapan Discord nyata. Pendekatan yang jelas adalah melatih pada dataset lengkap.

Saya melakukan sebaliknya. Saya melatih pada **50.000 sampel** -- kurang dari 1% dari data yang tersedia.

Inilah alasannya: **ukuran set pelatihan secara langsung mempengaruhi seberapa banyak model overfit pada distribusi pelatihannya**.

Model yang dilatih pada 7,3M contoh mempelajari distribusi statistik percakapan yang sangat spesifik. Model menjadi sangat baik dalam mereproduksi distribusi itu, tetapi juga menjadi **kaku** -- memiliki fleksibilitas lebih sedikit untuk beradaptasi dengan pola baru yang diberikan pada waktu inferensi.

Model yang dilatih pada 50k contoh mempelajari nada dan register umum percakapan Discord (informal, pendek, singkatan, huruf kecil), tetapi tetap mempertahankan fleksibilitas yang cukup untuk **diarahkan oleh contoh dalam konteks**. Contoh few-shot tidak melawan distribusi besar yang telah dipelajari -- mereka melengkapi distribusi yang lebih ringan.

Inilah wawasan intinya: **data pelatihan terbatas membuat few-shot priming lebih efisien**.

---

## Model: detail teknis

Model Luna Protocol adalah **fine-tune QLoRA** dari [Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct):

| Parameter | Nilai |
|-----------|-------|
| Model dasar | `unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit` |
| Metode | QLoRA (4-bit) |
| Rank LoRA | `r=16`, `lora_alpha=16` |
| Modul target | `q/k/v/o_proj`, `gate/up/down_proj` |
| Parameter yang dapat dilatih | 18.464.768 / 1.562.179.072 (1,18%) |
| Data pelatihan | ~50.000 contoh (subset Discord-Dialogues) |
| Filter | 8-512 token per sampel |
| Epoch | 2-3 |
| Perangkat keras | Kaggle T4 |
| Framework | [Unsloth](https://github.com/unslothai/unsloth) |

Dataset adalah fork pra-pemrosesan dari Discord-Dialogues, difilter hanya untuk berisi giliran `user`/`assistant` yang bersih -- tanpa pesan sistem, tanpa metadata, tanpa perintah bot. Ini penting untuk nanti.

### Kuantisasi yang tersedia

| File | Kuantisasi | Ukuran | Catatan |
|------|-------------|------|-------|
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q2_K.gguf` | Q2_K | 676 MB | Terdegradasi signifikan -- tidak direkomendasikan |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf` | Q4_K_M | 986 MB | Keseimbangan ukuran/kualitas yang baik (direkomendasikan) |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q8_0.gguf` | Q8_0 | 1,65 GB | Fidelitas gaya terbaik |

Model yang direkomendasikan adalah **Q4_K_M** -- di bawah 1GB, cepat, dan mempertahankan gaya percakapan dengan baik. Q2_K terlalu terdegradasi pada model sekecil ini. Q8_0 adalah kualitas terbaik tetapi menggunakan memori 68% lebih banyak.

---

## Terobosan few-shot priming

Inilah bagian yang mengubah segalanya.

Kartu model HuggingFace memiliki peringatan:

> Dengan prompt kosong tanpa persiapan, model ini cenderung kembali ke nada asisten default Qwen. Persiapan few-shot pendek membuat perbedaan besar.

Ini bukan bug -- ini adalah konsekuensi langsung dari bagaimana data pelatihan distrukturkan.

### Mengapa prompt sistem saja tidak berfungsi

Data pelatihan Discord-Dialogues hanya berisi giliran `user`/`assistant`. Tidak ada **contoh peran sistem** dalam set pelatihan. Model tidak pernah dilatih untuk mengikuti prompt sistem sebagai arahan gaya.

Ketika Anda memberikan prompt sistem seperti "Nama kamu Luna, bicaralah dengan santai", model mendengar instruksi tetapi tidak memiliki pola belajar yang kuat untuk menerjemahkannya ke output. Model kembali ke default Qwen: membantu, terstruktur, sedikit formal.

### Mengapa contoh few-shot berfungsi

Ketika Anda menyuntikkan contoh percakapan dalam format ChatML yang sama dengan yang digunakan model saat dilatih (menggunakan struktur giliran `user`/`assistant`), sesuatu terhubung. Model mengenali pola dari data pelatihannya dan menyelaraskan outputnya untuk mencocokkan.

Inilah tampilan persiapan few-shot dalam praktik:

```yaml
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

Contoh-contoh ini disuntikkan setelah prompt sistem dan sebelum percakapan nyata. Model melihatnya sebagai bagian dari riwayat percakapan, bukan sebagai instruksi. Ini adalah perbedaan kritis -- model tidak *diperintahkan* untuk menjadi santai, ia *diperlihatkan* bagaimana wujud santai itu.

### Sebelum dan sesudah

Tanpa persiapan few-shot (hanya prompt sistem):

```
User: yo whats good
Bot: Hello! I am doing well, thank you for asking. How can I assist you today?
```

Dengan persiapan few-shot (3 contoh):

```
User: yo whats good
Bot: nm just chillin, u
```

Perbedaannya sangat mencolok. Model tidak hanya menghasilkan kata-kata yang berbeda -- ia mengadopsi seluruh register: huruf kecil, singkatan, nada santai, respons pendek. Model mencocokkan gaya contoh, bukan gaya data pelatihan Qwen.

---

## Memori dan kecepatan: angka konkret

Peralihan dari Hermes-3-3B ke Luna-Protocol-1.5B memberikan peningkatan yang terukur:

| Metrik | Hermes-3-3B Q8_0 | Luna-Protocol Q4_K_M | Peningkatan |
|--------|-------------------|----------------------|-------------|
| Penggunaan VRAM | ~3 GB | ~986 MB | **67% lebih sedikit** |
| Ukuran file model | ~3,2 GB | ~986 MB | **69% lebih kecil** |
| Generasi token | ~30 tok/s | ~60+ tok/s | **2x lebih cepat** |
| Cold start | ~8s | ~3s | **62% lebih cepat** |
| Jendela konteks | 8192 | 8192 | Sama |

### Mengapa peningkatan kecepatan nyata

Model yang lebih kecil tidak hanya "kurang lambat" -- mereka secara fundamental lebih cepat untuk inferensi. Dengan 1,5B parameter, bukan 3B:

- **Lebih sedikit perkalian matriks** per token: lapisan attention, lapisan FFN, dan proyeksi output semuanya berskala linear dengan jumlah parameter
- **Pemanfaatan cache yang lebih baik**: model yang lebih kecil dapat memuat lebih banyak bobotnya di cache L2/L3
- **Tekanan bandwidth memori lebih rendah**: lebih sedikit byte yang dibaca dari VRAM per token

Pada pengaturan sederhana hanya CPU (2 inti, tanpa GPU), model 1,5B menghasilkan token dengan kecepatan kira-kira **2x lipat** dari model 3B. Ini adalah perbedaan antara "terasa seperti bot" dan "terasa seperti orang yang mengetik".

### Cache prompt memperkuat keuntungan

Luna Protocol menggunakan `llama-server` dengan cache prompt diaktifkan (`--cache-reuse 256`). Ini berarti:

1. Pesan pertama dalam sesi membayar biaya pemrosesan prompt penuh (prompt sistem + contoh few-shot + pesan pengguna)
2. Pesan berikutnya hanya memproses token *baru* -- prefiks yang di-cache digunakan kembali
3. Dengan 5 contoh few-shot (~50-150 token), overhead menjadi dapat diabaikan setelah permintaan pertama

Contoh few-shot secara efektif "gratis" setelah pesan pertama dalam sesi. Model mendapatkan panduan gaya dengan biaya marjinal nol.

---

## Implementasi: bagaimana cara kerjanya dalam kode

Sistem few-shot di Luna Protocol bersih dan minimal. Tiga file menangani semuanya:

### 1. Konfigurasi (`config.yml`)

```yaml
few_shot_enabled: true
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
  - user: "whats up"
    assistant: "yooo not much, what about you"
  - user: "how was your day"
    assistant: "it was alright, nothing crazy happened lol"
```

Konfigurasi dapat di-reload panas. Ubah contoh, simpan, dan bot langsung mengadopsi gaya baru -- tanpa perlu restart.

### 2. Pemformatan dan injeksi (`src/core/few-shot.ts`)

Fungsi `formatFewShotExamples()` mengonversi contoh YAML menjadi objek pesan ChatML:

```typescript
export function formatFewShotExamples(
  examples: FewShotExample[],
  username = "user"
): Array<{ role: "user" | "assistant"; content: string }> {
  const messages = [];
  for (const example of examples) {
    messages.push({ role: "user", content: `${username}: ${example.user}` });
    messages.push({ role: "assistant", content: example.assistant });
  }
  return messages;
}
```

Fungsi `injectFewShotIntoConversation()` menempatkannya tepat setelah prompt sistem:

```typescript
export function injectFewShotIntoConversation(
  messages: Message[],
  fewShotMessages: Message[]
): Message[] {
  const systemMessage = messages[0];
  const userMessages = messages.slice(1);
  return [systemMessage, ...fewShotMessages, ...userMessages];
}
```

### 3. Integrasi (`src/core/llm-client.ts`)

Sebelum setiap panggilan LLM, contoh few-shot disuntikkan jika diaktifkan:

```typescript
let finalMessages = messages;
if (FEW_SHOT_ENABLED && FEW_SHOT_EXAMPLES.length > 0) {
  const fewShotMessages = formatFewShotExamples(FEW_SHOT_EXAMPLES);
  finalMessages = injectFewShotIntoConversation(messages, fewShotMessages);
}
```

Model menerima: `[prompt_sistem] + [contoh_few_shot] + [riwayat_percakapan]`

---

## Mempertahankan gaya Discord-Dialogues

Dataset asli Discord-Dialogues memiliki ciri khas percakapan yang sangat spesifik:

- **Pesan pendek**: rata-rata 32,8 token per giliran
- **Register informal**: singkatan, huruf kecil, tanpa tanda baca
- **Bolak-balik cepat**: beberapa pertukaran pendek, bukan monolog panjang
- **Ketidaksempurnaan alami**: typo, "lol", "fr", "ngl", "tbh"

Model Luna-Protocol mempertahankan gaya ini melalui dua mekanisme:

### 1. Fine-tuning menggeser distribusi dasar

50k sampel pelatihan mengajarkan model **sidik jari statistik** percakapan Discord. Model belajar bahwa respons biasanya pendek, huruf kecil, dan informal. Ini menggeser output default model menjauh dari mode asisten-membantu Qwen.

### 2. Few-shot priming menguncinya

Contoh few-shot memperkuat pola-pola persis yang dipelajari model selama fine-tuning. Mereka bertindak sebagai **jangkar gaya** -- bahkan jika model sedikit melenceng ke nada formal selama percakapan panjang, contoh dalam konteks terus menariknya kembali.

Kombinasinya lebih kuat daripada masing-masing mekanisme saja:
- Fine-tuning tanpa few-shot: model *umumnya* santai tetapi tidak konsisten
- Few-shot tanpa fine-tuning: model mencoba mengikuti contoh tetapi terus kembali ke mode asisten
- Fine-tuning + few-shot: model **secara konsisten** dalam karakter

---

## Filosofi: model lebih kecil, prompting lebih cerdas

Kebijaksanaan konvensional dalam penerapan LLM adalah "lebih besar lebih baik". Lebih banyak parameter, lebih banyak data pelatihan, lebih banyak VRAM. Luna Protocol mengambil pendekatan sebaliknya:

- **1,5B bukan 3B**: setengah parameter, setengah memori, dua kali kecepatan
- **50k sampel bukan 7,3M**: lebih sedikit data pelatihan, lebih banyak fleksibilitas untuk pembelajaran dalam konteks
- **Few-shot priming bukan prompt sistem**: tunjukkan model apa yang Anda inginkan, jangan hanya katakan

Ini bukan hanya optimasi teknis -- ini adalah filosofi desain. Bot Discord tidak perlu menjadi asisten tujuan umum. Ia perlu mengatakan "nm just chillin, u" secara konsisten, cepat, dan tanpa memakan seluruh anggaran VRAM server Anda.

Hasilnya: bot yang berjalan di VPS $5/bulan, menghasilkan token cukup cepat untuk terasa like mengetik real-time, dan mempertahankan kepribadian yang konsisten melalui kombinasi fine-tuning dan few-shot priming yang lebih besar dari jumlah bagian-bagiannya.

---

## Pengaturan

### Unduh model

```bash
npm run download-model
# Mengunduh Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf
```

Atau secara manual dari [HuggingFace](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues).

### Konfigurasi

```yaml
# config.yml
llama_model_path: "./models/Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf"
few_shot_enabled: true
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

### Jalankan

```bash
npm run dev                    # dev (hot reload)
npm run build && npm start     # produksi
./start.sh                     # PM2 (produksi dengan llama-server)
```

---

## Kesimpulan

Model Luna Protocol membuktikan bahwa untuk AI percakapan yang spesifik-gaya, **lebih sedikit lebih baik**. Model 1,5B yang dilatih pada 50k sampel yang dipilih dengan cermat, dipersiapkan dengan beberapa contoh, mengungguli model 3B yang dilatih pada jutaan contoh -- dengan sebagian kecil dari biaya memori dan kecepatan generasi dua kali lipat.

Few-shot priming bukan hanya sesuatu yang "nice-to-have" untuk model kecil. Ini adalah mekanisme yang membuat mereka layak untuk aplikasi percakapan real-time. Contoh-contoh tidak hanya "membantu" -- mereka secara fundamental mengubah bagaimana model berperilaku, dengan mencocokkan format persis di mana model dilatih.

Kode bersifat open source, model ada di HuggingFace, dan dataset bersifat publik. Jika Anda ingin membangun bot percakapan yang terasa manusiawi, resepnya adalah: model kecil, fine-tuning terbatas, persiapan few-shot yang kuat.

| Sumber Daya | Tautan |
|----------|------|
| Repositori GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Model (HuggingFace) | [fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Artikel pertama | [Luna Protocol: Saya membuat bot Discord otonom](/articles/en/luna-protocol-discord-bot) |
