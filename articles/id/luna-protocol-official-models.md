---
title: "Luna Protocol : kenapa saya men fine-tune model 1,5 miliar parameter pada 50k sampel Discord, dan kenapa few-shot priming mengubah segalanya"
description: "Model lebih kecil yang dilatih pada lebih sedikit data bisa melampaui model lebih besar -- asal tahu cara meng priming dengan baik. Inilah kenapa Luna Protocol beralih dari Hermes 3B ke fine-tune Qwen 1,5B, dan kenapa few-shot priming menjadi faktor kemajuan yang sesungguhnya."
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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "oDYZwbWFaCJ+utn5wX7ofAPrdK6wB4oPy0VER/azMQyO55wXBnz/TUBfGAPlLIafDyqfG2W9EOg/GWZ8gyb3uw=="
---

# Luna Protocol : kenapa saya men fine-tune model 1,5 miliar parameter pada 50k sampel Discord, dan kenapa few-shot priming mengubah segalanya

Dalam [artikel pertama](/articles/en/luna-protocol-discord-bot), saya membangun bot Discord yang mensimulasikan manusia : tidur, salah ketik, keraguan, kelupaan, pesan spontan. Sistem perilakunya bertahan. LLM di balik semuanya adalah model Hermes 3 miliar parameter, terkuantisasi Q8_0, mengonsumsi 3 GB VRAM.

Itu berfungsi. Tapi terlalu besar.

Bot Discord tidak butuh model 3 miliar parameter untuk bilang "nm just chillin, u". Yang dibutuhkannya adalah **koherensi stilistika** : kemampuan menjaga nada percakapan yang tepat, pesan demi pesan, tanpa melayang ke mode "asisten korporat". Dan ternyata model lebih kecil, yang dilatih pada lebih sedikit data dan di priming dengan beberapa contoh, mencapainya lebih baik daripada model lebih besar yang dipaksa lewat prompt sistem sederhana.

Artikel ini soal model resmi Luna Protocol : kenapa mereka ada, kenapa 1,5B alih-alih 3B, kenapa 50k sampel pelatihan alih-alih 7,3 juta, dan kenapa few-shot priming beralih dari status "bonus manis" menjadi jantung seluruh pendekatan.

---

## Masalah dengan model 3B

Konfigurasi aslinya memakai `Discord-Micae-Hermes-3-3B.Q8_0.gguf`, model 3 miliar parameter yang di fine-tune pada data Discord. Ia menghasilkan respons bagus, tapi :

| Metrik | Hermes-3-3B Q8_0 | Target |
|--------|-------------------|--------|
| Pemakaian VRAM | ~3 GB | < 1 GB |
| Pembangkitan token | ~30 tok/dtk | ~60+ tok/dtk |
| Ukuran berkas model | ~3,2 GB | < 1 GB |
| Waktu startup dingin | ~8 dtk | ~3 dtk |

Untuk bot yang berjalan 24/7 di server sederhana, 3 GB VRAM itu banyak. Dan kecepatan pembangkitan, yang oke untuk pesan sesekali, terasa lambat saat respons beruntun atau dengan banyak kanal aktif.

Pertanyaannya adalah : bisakah kita mendapatkan gaya Discord-Dialogues yang sama dengan setengah parameter?

---

## Keputusan fine-tuning : kenapa 50k, bukan 7,3 juta

Himpunan data [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) berisi **7,3 juta pertukaran** dan **17 juta putaran bicara**. Ini korpus masif percakapan Discord sungguhan. Pendekatan jelasnya adalah melatih pada seluruh himpunan data.

Saya melakukan kebalikannya. Saya melatih pada **50 000 sampel**, kurang dari 1% data yang tersedia.

Inilah kenapanya : **ukuran himpunan pelatihan langsung memengaruhi derajat overfitting model terhadap distribusi pelatihannya**.

Model yang dilatih pada 7,3 juta contoh mempelajari distribusi statistik percakapan yang sangat spesifik. Ia menjadi hebat mereproduksi distribusi itu, tapi ia juga menjadi **kaku** : ia punya lebih sedikit ruang untuk beradaptasi pada pola baru yang diberikan saat inferensi.

Model yang dilatih pada 50k contoh mempelajari nada dan register umum percakapan Discord (informal, pendek, singkatan, huruf kecil), tapi ia menyimpan cukup fleksibilitas untuk **dipandu oleh contoh dalam konteks**. Contoh few-shot tidak melawan distribusi masif yang sudah dipelajari : mereka melengkapi distribusi yang lebih ringan.

Inilah intuisi sentral : **data pelatihan yang terbatas membuat few-shot priming lebih efektif**.

---

## Modelnya : detail teknis

Model Luna Protocol adalah **fine-tune QLoRA** dari [Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct) :

| Parameter | Nilai |
|-----------|-------|
| Model dasar | `unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit` |
| Metode | QLoRA (4-bit) |
| Peringkat LoRA | `r=16`, `lora_alpha=16` |
| Modul yang ditarget | `q/k/v/o_proj`, `gate/up/down_proj` |
| Parameter yang bisa dilatih | 18 464 768 / 1 562 179 072 (1,18 %) |
| Data pelatihan | ~50 000 contoh (subset Discord-Dialogues) |
| Filter | 8-512 token per sampel |
| Epoch | 2-3 |
| Perangkat keras | Kaggle T4 |
| Framework | [Unsloth](https://github.com/unslothai/unsloth) |

Himpunan data adalah fork Discord-Dialogues yang diproses sebelumnya, difilter untuk hanya menyimpan putaran `user`/`assistant` yang bersih : hanya pertukaran pengguna dan asisten, tanpa pesan sistem maupun metadata maupun perintah bot. Ini penting untuk kelanjutannya.

### Kuantisasi yang tersedia

| Berkas | Kuantisasi | Ukuran | Catatan |
|------|-------------|------|-------|
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q2_K.gguf` | Q2_K | 676 MB | Jelas terdegradasi -- tidak disarankan |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf` | Q4_K_M | 986 MB | Kompromi ukuran/kualitas yang bagus (disarankan) |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q8_0.gguf` | Q8_0 | 1,65 GB | Kesetiaan stilistika terbaik |

Model yang disarankan adalah **Q4_K_M** : kurang dari 1 GB, cepat, dan menjaga baik gaya percakapan. Q2_K terlalu terdegradasi untuk model ukuran ini. Q8_0 menawarkan kualitas terbaik tapi mengonsumsi 68% memori lebih banyak.

---

## Terobosan few-shot priming

Inilah bagian yang mengubah segalanya.

Lembar model di HuggingFace memuat peringatan :

> Dengan prompt telanjang dan tanpa priming, model ini cenderung jatuh kembali ke nada bawaan "asisten" Qwen. Priming few-shot yang singkat membuat perbedaan besar.

Ini akibat langsung dari cara data pelatihan distrukturkan.

### Kenapa prompt sistem saja tidak berhasil

Data pelatihan Discord-Dialogues hanya berisi putaran `user`/`assistant`. Tidak ada **contoh peran sistem** dalam himpunan pelatihan. Model tidak pernah dilatih mengikuti prompt sistem sebagai arahan gaya.

Ketika kita memberinya prompt sistem seperti "Namamu Luna, bicara santai", ia mendengar instruksinya tapi tidak punya pola kuat yang dipelajari untuk menerjemahkannya menjadi keluaran. Ia lalu jatuh kembali pada perilaku bawaan Qwen : membantu, terstruktur, sedikit formal.

### Kenapa contoh few-shot berhasil

Ketika kita menyuntikkan contoh percakapan dalam format ChatML yang sama dengan yang dipakai saat pelatihan (dengan struktur putaran `user`/`assistant`), sesuatu terpicu. Model mengenali pola dari pelatihannya dan menyelaraskan keluarannya sesuai itu.

Beginilah tampilan priming few-shot dalam praktik :

```yaml
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

Contoh ini disuntikkan setelah prompt sistem dan sebelum percakapan sungguhan. Model memahaminya sebagai bagian dari riwayat percakapan, jadi sebagai pertukaran nyata alih-alih instruksi. Ini perbedaan esensial : kita *menunjukkannya* seperti apa nada santai alih-alih *memerintahkannya*.

### Sebelum / sesudah

Tanpa priming few-shot (prompt sistem telanjang) :

```
User: yo whats good
Bot: Hello! I am doing well, thank you for asking. How can I assist you today?
```

Dengan priming few-shot (3 contoh) :

```
User: yo whats good
Bot: nm just chillin, u
```

Perbedaannya mencolok. Model mengadopsi seluruh register : huruf kecil, singkatan, nada santai, respons pendek. Ia meniru gaya contoh alih-alih gaya data pelatihan Qwen.

---

## Memori dan kecepatan : angka konkret

Peralihan dari Hermes-3-3B ke Luna-Protocol-1.5B membawa perolehan yang terukur :

| Metrik | Hermes-3-3B Q8_0 | Luna-Protocol Q4_K_M | Peningkatan |
|--------|-------------------|----------------------|-------------|
| Pemakaian VRAM | ~3 GB | ~986 MB | **67% lebih sedikit** |
| Ukuran berkas model | ~3,2 GB | ~986 MB | **69% lebih kecil** |
| Pembangkitan token | ~30 tok/dtk | ~60+ tok/dtk | **2x lebih cepat** |
| Startup dingin | ~8 dtk | ~3 dtk | **62% lebih cepat** |
| Jendela konteks | 8192 | 8192 | Sama |

### Kenapa perolehan kecepatan nyata

Model lebih kecil secara fundamental lebih cepat dalam inferensi. Dengan 1,5B parameter alih-alih 3B :

- **Lebih sedikit perkalian matriks** per token : lapisan atensi, lapisan FFN dan proyeksi keluaran semuanya berskala linear dengan jumlah parameter
- **Pemakaian cache lebih baik** : model lebih kecil lebih memuat bobotnya dalam cache L2/L3
- **Lebih sedikit tekanan pada bandwidth memori** : lebih sedikit byte yang dibaca dari VRAM per token

Pada konfigurasi sederhana, CPU saja (2 core, tanpa GPU), model 1,5B membangkitkan token sekitar **2 kali kecepatan** model 3B. Inilah perbedaan antara "terasa seperti bot" dan "seperti orang sungguhan sedang mengetik".

### Cache prompt memperkuat keunggulan

Luna Protocol memakai `llama-server` dengan cache prompt aktif (`--cache-reuse 256`). Artinya :

1. Pesan pertama sesi membayar biaya penuh pemrosesan prompt (prompt sistem + contoh few-shot + pesan pengguna)
2. Pesan berikutnya hanya memproses token *baru*, karena awalan yang di cache dipakai ulang
3. Dengan 5 contoh few-shot (~50-150 token), overhead menjadi bisa diabaikan setelah permintaan pertama

Contoh few-shot menjadi dalam praktik "gratis" setelah pesan pertama sesi. Model mendapat manfaat panduan gaya dengan biaya marjinal nol.

---

## Implementasinya : cara kerjanya dalam kode

Sistem few-shot Luna Protocol bersih dan minimal. Tiga berkas menangani semuanya.

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

Konfigurasinya bisa di hot-reload. Kita mengubah contoh, menyimpan, dan bot segera mengadopsi gaya baru, tanpa restart.

### 2. Pemformatan dan penyuntikan (`src/core/few-shot.ts`)

Fungsi `formatFewShotExamples()` mengubah contoh YAML menjadi objek pesan ChatML :

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

Fungsi `injectFewShotIntoConversation()` menaruhnya tepat setelah prompt sistem :

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

Sebelum setiap panggilan ke LLM, contoh few-shot disuntikkan kalau diaktifkan :

```typescript
let finalMessages = messages;
if (FEW_SHOT_ENABLED && FEW_SHOT_EXAMPLES.length > 0) {
  const fewShotMessages = formatFewShotExamples(FEW_SHOT_EXAMPLES);
  finalMessages = injectFewShotIntoConversation(messages, fewShotMessages);
}
```

Model menerima : `[prompt_sistem] + [contoh_few_shot] + [riwayat_percakapan]`

---

## Menjaga gaya Discord-Dialogues

Himpunan data Discord-Dialogues asli punya ciri percakapan yang sangat spesifik :

- **Pesan pendek** : 32,8 token rata-rata per putaran
- **Register informal** : singkatan, huruf kecil, ketiadaan tanda baca
- **Pertukaran cepat** : banyak pertukaran pendek alih-alih monolog panjang
- **Ketidaksempurnaan alami** : salah ketik, "lol", "fr", "ngl", "tbh"

Model Luna Protocol menjaga gaya ini berkat dua mekanisme :

### 1. Fine-tuning menggeser distribusi dasar

50k sampel pelatihan mengajarkan model **jejak statistik** percakapan Discord. Ia belajar bahwa respons tipikalnya pendek, huruf kecil dan informal. Ini menjauhkan keluaran bawaan model dari mode "asisten membantu" Qwen.

### 2. Few-shot priming mengunci hasil

Contoh few-shot memperkuat tepat pola yang dipelajari selama fine-tuning. Mereka bertindak sebagai **jangkar stilistika** : meski model sedikit melayang ke nada lebih formal selama percakapan panjang, contoh yang ada dalam konteks menariknya kembali.

Kombinasinya lebih kuat daripada tiap mekanisme sendiri :
- Fine-tuning tanpa few-shot : model *secara umum* santai tapi tidak konsisten
- Few-shot tanpa fine-tuning : model mencoba mengikuti contoh tapi terus jatuh kembali ke mode asisten
- Fine-tuning + few-shot : model tetap **konstan** dalam karakter

---

## Filosofi : model lebih kecil, prompting lebih cerdas

Kebijaksanaan konvensional dalam deployment LLM bilang "makin besar, makin baik". Lebih banyak parameter, lebih banyak data pelatihan, lebih banyak VRAM. Luna Protocol mengambil jalan sebaliknya :

- **1,5B alih-alih 3B** : setengah parameter, setengah memori, dua kali lebih cepat
- **50k sampel alih-alih 7,3 juta** : lebih sedikit data pelatihan, lebih banyak fleksibilitas untuk pembelajaran dalam konteks
- **Few-shot priming alih-alih prompt sistem** : menunjukkan pada model apa yang kita inginkan, bukan sekadar memberitahunya

Ini pilihan desain yang disadari, jauh lebih dari sekadar optimasi teknis. Bot Discord perlu tetap menjadi teman percakapan yang ringan alih-alih asisten generalis. Ia harus bilang "nm just chillin, u" secara koheren, cepat, dan tanpa melahap seluruh anggaran VRAM server.

Hasilnya : bot yang berjalan di VPS 5 $/bulan, membangkitkan token cukup cepat untuk memberi kesan pengetikan waktu nyata, dan menjaga kepribadian koheren berkat kombinasi fine-tuning dan few-shot priming yang lebih berharga daripada jumlah bagiannya.

---

## Penyiapan

### Mengunduh model

```bash
npm run download-model
# Mengunduh Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf
```

Atau manual dari [HuggingFace](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues).

### Mengonfigurasi

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

### Menjalankan

```bash
npm run dev                    # dev (pemuatan ulang panas)
npm run build && npm start     # produksi
./start.sh                     # PM2 (produksi dengan llama-server)
```

---

## Kesimpulan

Model Luna Protocol membuktikan bahwa untuk AI percakapan yang berfokus gaya, **lebih sedikit, lebih baik**. Model 1,5B yang dilatih pada 50k sampel yang dipilih cermat, di priming dengan beberapa contoh, melampaui model 3B yang dilatih pada jutaan contoh, dengan sebagian kecil biaya memori dan kecepatan pembangkitan dua kali lipat.

Few-shot priming merupakan mekanisme sentral untuk model kecil. Dialah yang membuat mereka viable untuk aplikasi percakapan waktu nyata. Contoh melakukan jauh lebih dari "membantu" : mereka secara fundamental mengubah perilaku model, dengan meniru tepat format tempat ia dilatih.

Kodenya open source, modelnya ada di HuggingFace, dan himpunan datanya publik. Kalau kamu ingin membangun bot percakapan yang memberi kesan manusiawi, resepnya adalah : model kecil, fine-tuning terbatas, priming few-shot yang solid.

| Sumber daya | Tautan |
|----------|------|
| Depot GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Model (HuggingFace) | [fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) |
| Himpunan data | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Artikel pertama | [Luna Protocol : saya membuat bot Discord otonom](/articles/en/luna-protocol-discord-bot) |
