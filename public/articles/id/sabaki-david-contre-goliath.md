---
title: "Sabaki vs System One : Daud melawan Goliath, model keputusan terkecil di dunia"
description: "20KB melawan 421M parameter. Sabaki kalah 7 poin di typed-decisions tapi turun dari 25 detik CPU ke kurang dari 1ms secara offline. Anatomi sebuah MoE organisasional."
date: 2026-11-12
tags:
  - ai
  - system-one
  - typescript
  - cpu
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "m7WqaYcAdwN7j21+23cNJVj4ToES2lf+2npgLOpIjA8b+kN3zNiP4hElt6/VCWMW/g1AaXfF02/KN2Uotb5iCA=="
---

## Pengantar

Kalau kamu nongkrong di Hacker News atau Twitter sejak September, kamu pasti sudah lihat Jev lewat.

Pada 15 September 2026, TypeSafe merilis Jev, "System One" pertama mereka. Pitch-nya muat dalam satu kalimat: berhenti minta LLM menghasilkan JSON untuk memilih label. Kasih dia `state` plus pertanyaan bertipe, dia mengembalikan keputusan bertipe dengan probabilitas. Satu pass, nol token yang di-sample, tidak ada yang perlu di-parse sesudahnya.

Langsung meledak. Hari pertama adopsi rekor di Vercel AI Gateway, lima klien Elixir dalam beberapa hari, semua orang membenchmark Jev melawan jagoannya masing-masing. Dan jujur hype-nya masuk akal. Bertahun-tahun kita mengakali prompt `jawab HANYA dengan {"choice": ...}` sambil berdoa model tidak mengarang opsi, tidak merusak JSON, tidak menghalusinasi field. Jev memberi nama untuk kebutuhan itu dan mengirimkannya sebagai API yang rapi: `POST /v1/systemone`, pertanyaan `choice / score / noul`, jawaban dengan `probabilities` + `confidence`.

Aku suka idenya. Model bisnisnya, kurang. Dan biar jelas, aku tidak pernah bayar untuk Jev.

Karena di balik itu, Jev tetap API tertutup. Bobot tidak diketahui, tidak bisa self-host, tiap keputusan = satu round-trip jaringan + meteran yang jalan. Dan alternatif open yang muncul setelahnya main di 400M parameter dengan GPU wajib.

Jadi aku membangun ekstrem sebaliknya: [Sabaki](https://sabaki.fox3000foxy.com/). Sebuah router keyword + regresi logistik dalam TypeScript murni yang bicara kontrak yang sama seperti Jev (shape `choice / score / noul` yang sama, endpoint `/v1/systemone` yang sama), tapi jalan dalam **kurang dari 1ms** dengan JSON **20 kilobyte**. Nol dependensi dalam mode nano, offline, gratis.

Buat gambaran: Laya itu 843 MB safetensors yang harus di-load. OpenDecider-nano itu 2 GB RAM. Sabaki nano invoices itu 20 KB. Rasio beratnya sekitar **40.000**.

Kalau kamu mau versi yang rapi dan berangka, ada preprint v1 Oktober 2026 di situs: *Sabaki: An Organizational Mixture-of-Experts for Typed Decisions on CPU* ([PDF](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf)). Desain, pengukuran, tradeoff, semua ada di sana. Artikel ini versi yang enak dibaca, dengan kode terbuka di sebelahnya.

Aku tidak menulisnya sendirian dengan gaya benchmark kertas. Aku berkontribusi ke [azalio/doomLaya](https://github.com/azalio/doomLaya) (fork-ku: [fox3000foxy/doomLaya](https://github.com/fox3000foxy/doomLaya)), sebuah harness tempat Laya dan Jev benar-benar main FreeDoom dengan keputusan model-owned, telemetri per tick dan video. Aku sudah lihat Goliath main secara langsung, dan begitu jaringan batuk, dia ikut batuk juga.

Kita bedah mesinnya satu per satu. Seperti biasa, dengan kode aslinya.

## Ring tempat semua orang setuju bertarung

Hanya ada satu dataset yang dikutip Jev, Laya dan OpenDecider semuanya: [LocalLLaMA/typed-decisions](https://huggingface.co/datasets/LocalLLaMA/typed-decisions). 4 workflow sintetis (support, invoice, keamanan, trace agen), 5 pertanyaan per kasus, 1200 kasus train, 400 test, 2000 keputusan.

| Model | Params | Skor test | Latensi | Jalan di mana |
|---|---|---|---|---|
| OpenDecider-nano | ~400M | 0.796 | 17ms GPU | GPU, 2 GB RAM |
| Laya typed-decisions | 421M | 0.766 | ~25s/state CPU, ~830ms/kasus MLX | GPU |
| Jev 1.13 | tertutup | ~0.73-0.75 | ~710ms API | hanya API |
| **Sabaki mini** | 22M int8 | **0.69** | **~20ms CPU** | CPU, 22 MB |
| **Sabaki nano** | ~0 | **0.61** | **<1ms** | di mana saja |
| Laya base zero-shot | 421M | 0.362 | sama | GPU |

Acak itu 0.318, mayoritas 0.461. Jadi Laya base di 0.362 tanpa fine-tune, itu level "jawab ngasal tapi sopan". Ingat itu, nanti kepakai.

7 poin memisahkan Sabaki dari yang terbaik. 1000x latensi memisahkan mereka ke arah sebaliknya kalau kamu tidak punya GPU. Seluruh artikel ini dalam dua kalimat, sisanya buat memahami kenapanya.

Tapi hati-hati: di balik soket `choice / score / noul` yang sama, dapurnya beda total. Jev = API tertutup. Laya = ModernBERT-large yang di-fine-tune. OpenDecider = Ettin-encoder hasil distilasi. Sabaki = hitung kata + MiniLM int8. Kontrak sama, budget tidak sebanding.

## Jev, tamparan yang dilihat semua orang

Kasih kredit ke TypeSafe: kontrak System One itu memang ide yang bagus.

Dulu, buat memilah tiket, kamu melakukannya seperti ini: kamu minta LLM "pilih antara billing, teknis dan spam, jawab dalam JSON", kamu parse jawabannya, kamu menangani kasus saat dia menjawab "Kurasa billing! 😊" atau mengarang kategori ke-4. Tiap pertanyaan makan token, tiap jawaban bisa merusak pipeline-mu.

Jev mengubah kesepakatan: kamu kirim teks + pertanyaan dengan kriterianya, dia mengevaluasi tiap pertanyaan secara paralel dan mengembalikan nilai bertipe dengan distribusinya.

```bash
curl https://api.typesafe.ai/v1/systemone \
 -H "Authorization: Bearer $KEY" \
 -H 'content-type: application/json' \
 -d '{"state":"charge double ce mois-ci","questions":{"dept":{"type":"choice","instructions":"Route ce message.","criteria":{"billing":"paiements","technical":"bugs"}}}}}'
```

Jawabannya: `{ choice, probabilities, confidence }`. Tanpa teks bebas. Kodemu bisa langsung mencabangkannya.

Itu sebabnya ini jadi viral: SDK Python + JS, plugin Claude Code, integrasi LangChain, semua orang bisa mencolokkan agennya dalam satu sore. Dok TypeSafe bahkan mendorong pola yang sehat: Jev untuk penilaian kecil yang cepat, kode deterministik di sekitarnya untuk menyusun keputusan sebenarnya, LLM lambat atau manusia begitu confidence rendah.

Masalahnya sisanya. Bobot tertutup, offline mustahil, harga per call. Untuk agen yang mengambil 100 keputusan per run, pajaknya terasa. Untuk Doom pada 35 tick/s, itu mati: di doomLaya, Jev menyelesaikan MAP01 seed 48 dalam 68.97 detik dengan p50 HTTP 357ms. Run itu mencatat biaya API $0.0046, bukan tagihanku, tagihan benchmark-nya. Itu jalan, run-nya bersih, tanpa mati. Tapi 357ms pada 35 tick/s, itu 12 tick di mana game terus jalan selagi kamu menunggu jaringan.

Sabaki mencuri tepat kontrak itu, pertanyaan sama, jawaban sama, endpoint `/v1/systemone` yang sama dilayani oleh `serve()`, sambil membuang semua yang butuh datacenter.

## Laya, si raksasa open yang membuktikan ini bisa jalan tanpa API

[Laya](https://github.com/NandhaKishorM/laya) oleh Convai Innovations, Apache-2.0. Di balik kap: ModernBERT-large, 421M, dengan 1 token `[MASK]` per opsi. Hidden state tiap marker masuk ke MLP kecil, softmax di atas opsi pertanyaan. Satu pass per pertanyaan, seperti Jev.

```python
pipe = pipeline("text-classification", model="convaiinnovations/laya-typed-decisions")
```

Angka 0.766 layak dibahas. Itu checkpoint yang **di-fine-tune di train benchmark**: 1200 kasus, RLCD dengan noise Gaussian pada logit, reward log + spherical. Model yang sama tanpa fitting itu jatuh ke 0.362. Intinya dia menebak. Jadi skor Laya itu "encoder besar + latihan di domain", bukan "encoder besar yang ajaib".

Di CPU, ini batu bata. Port ONNX yang diukur jalan sekitar 25 detik per state. Di MLX FP16, hitung 830ms per kasus rata-rata dengan p99 5.3 detik. Dan kamu harus me-load 843 MB sebelum menjawab apa pun.

Di doomLaya, Laya standar gagal di MAP01 dalam 180 detik. Versi v3 yang diadaptasi ([azalio/laya-doom-v3](https://huggingface.co/azalio/laya-doom-v3)), dilatih ulang di Doom, keluar dalam 61.43 detik dengan p50 108ms di MPS, sambil memungut shotgun karena eksekutor menangani pickup sendiri. Jadi ya, itu main, setelah latihan khusus, di GPU Apple, dengan eksekutor script yang mengerjakan kerjaan sebenarnya (A*, pintu dengan latch 15 tick, bidik otomatis).

Ringkasanku: tanpa latihan di tugasmu, Laya berguna sebagai tatakan kertas 421M. Dengan latihan, itu kuat banget, tapi kamu butuh GPU dan data yang cocok.

## OpenDecider, yang memenangkan leaderboard

[OpenDecider](https://github.com/manjunathshiva/opendecider), itu Manjunath yang memutuskan mengejar semua orang di benchmark mereka sendiri. Hasil: **0.796** dengan Ettin-encoder-400m full fine-tune + kepala MLP, loss KL di soft target distilasi dari Qwen3-235B + DeepSeek.

```bash
pip install opendecider
# 17ms/pertanyaan di L40S, 18ms di M4 Max, ~9ms secara batch
```

Pada coverage 50%, selective accuracy naik ke 0.943 melawan 0.882 untuk Jev. Di atas kertas, terbaik dari dua dunia: open, terkalibrasi, cepat.

Praktiknya: 2 GB RAM buat me-load nano, GPU wajib buat menahan 17ms, phishing di 0.63 melawan 0.90 untuk Jev (OOD mencucinya bersih), dan seperti Laya, dilatih di train benchmark. Test tidak pernah dilihat, tapi domainnya sudah.

Dia menang adu panco, tapi tetap 400M dengan GPU di belakang. Kamu tidak akan menempelkannya di Worker Cloudflare atau di game loop laptop.

## Kelas 150M, dan lubang di bawahnya

openJev-verdict-2.0 (151M), julia-1 (144M multilingual), Open Jev (150M), Largha-150M (144M en+zh), Vela (0.3B-9B). Semua ModernBERT atau mmBERT-small, semua bisa jalan di CPU, semua enak dilatih (Open Jev mengklaim 30 menit di T4 Colab). Angka self-reported, protokol beda-beda, jadi ambil dengan sejumput garam, tapi keluarganya ada.

Generalist Sabaki itu **22.7M**. Sekitar 6.5x lebih kecil dari yang terkecil di kelompok itu. Tidak ada orang lain yang turun di bawah 100M untuk menjawab pertanyaan yang didefinisikan saat runtime.

Itu maksud "terkecil di dunia": bukan skor terbaik, amplop terkecil yang membaca `instructions` + `criteria`-mu dan memotong saat tidak ada spesialis yang tahu jawabannya.

## Sabaki, router bego dan ahli sekali pakainya

Oke, cukup soal yang besar-besar. Lanjut ke Daud, karena di sinilah jadi seru.

Sabaki tidak mencoba jadi model besar pintar yang memahami dunia. Ini MoE organisasional: 1 router sparse level sistem, ahli yang independen, satu yang aktif per input. Tiap plugin adalah package npm terpisah, dengan manifest, bobot, versinya sendiri. Kamu install hanya yang kamu route.

Org [sabaki-js](https://github.com/sabaki-js): 13 repo, core `sabaki` (129 commit), 6 plugin `@sabaki-js/*`, bobot, worker Cloudflare, template buat menulis milikmu sendiri.

`package.json` core sudah menceritakan kisahnya:

```json
"dependencies": { "@typesafe-ai/sdk": "^0.7.0" },
"optionalDependencies": { "onnxruntime-node": "^1.22.0" }
```

Dalam mode nano, nol dependensi runtime. Hanya TypeScript yang dikompilasi, tidak ada yang perlu di-install, tidak ada yang bisa rusak di antara dua versi ONNX.

### Router, atau cara memutuskan dalam beberapa baris

Router tinggal di `src/index.ts`, dan tokenisasi terlihat seperti ini (`src/index.ts:129`):

```ts
function tokens(s: string): string[] {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/).filter((w) => w.length > 3);
}
```

Huruf kecil, aksen dibuang, kata minimal 4 huruf. Filter ini membuang semua noise ("le", "de", "ok"). Di tiket support, ini mengubah segalanya karena matching-mu terjadi pada kata yang membawa makna.

Scoring-nya sendiri ada di `route()` (`src/index.ts:251`), dan di sinilah semuanya dimainkan:

```ts
const hits = kws.filter((k) =>
  words.some((w) => w.includes(k) || k.includes(w))).length;
const score = hits / Math.sqrt(kws.length);
```

Matching longgar dua arah: `billing` menangkap `billed`, `invoice` menangkap `invoicing`. Pembagian dengan akar menghindari menghukum daftar keyword besar, kalau tidak plugin mail dengan 600 katanya akan menghancurkan semua orang begitu sebuah mail berisi "hello".

Tiap plugin punya threshold-nya, default 0.15 disimpan di `src/index.ts:139`, mail di 0.03 karena subjeknya pendek. Di bawahnya:

```ts
return { domain: "unknown", decision: null, confidence: 0, plugin: null };
```

Domain tidak dikenal = `unknown`, tidak pernah tebakan ngarang biar terlihat senang. Ini sengaja dibuat bego, dan justru itu yang bikin threshold `automate > 0.8` bisa dipakai nanti: saat Sabaki menjawab, itu karena spesialis benar-benar cocok.

Ada bonus sumbu bahasa via `langid`: plugin yang mendeklarasikan `languages` hanya bersaing untuk bahasanya. Praktis buat memisahkan phishing latin dan CJK. Teks terlalu pendek = tanpa filter, semua ikut bersaing.

Total biaya: beberapa mikrodetik per keputusan. Tidak ada matriks yang dikalikan, tidak ada jaringan yang dipanggil, hanya perbandingan string dan satu pembagian.

### Nano, file favoritku di repo ini

`src/logreg.ts:28`, tokenisasinya:

```ts
function tokens(s: string): string[] {
  const words = s.toLowerCase().split(/[^a-z0-9]+/)
    .filter((w) => /^[a-z]{3,}$/.test(w));
  const out = [...words];
  for (let i = 0; i < words.length - 1; i++)
    out.push(`${words[i]} ${words[i + 1]}`);
  return out;
}
```

Unigram + bigram. `charged twice` memberi `charged`, `twice`, dan pasangan `charged twice`. Itu saja cukup buat menangkap "tagihan ganda" tanpa mengeluarkan transformer 400M.

`src/logreg.ts:46`, vektorisasi, tempat TF-IDF bekerja:

```ts
const tf = 1 + Math.log(c);  // TF sublinear
const val = tf * w.idf[i]!;  // IDF smooth ala sklearn
```

Kemunculan kata ke-10 bobotnya lebih kecil dari yang pertama, kata langka lebih berat dari "please". Tepat resep sklearn, paritas eksak terverifikasi pada 20 pertanyaan.

Dan komentar yang bikin aku senyum saat baca ulang:

```ts
// Hanya sentuh term yang muncul (sparse) daripada menyapu 3000 dim.
for (const [t, c] of counts) {
```

Daripada menyapu 3000 dimensi tiap tiket, kamu hanya menyentuh sekitar dua puluh kata yang muncul. Itu kenapa jawabannya kurang dari 1ms. Ini jenis detail tak terlihat yang mengubah segalanya di prod, karena kompleksitas mengikuti ukuran tiket bukan ukuran kosakata.

`src/logreg.ts:86`, inferensi, yang muat dalam tiga baris:

```ts
// biner: 1 baris koef + sigmoid
const pPos = 1 / (1 + Math.exp(-s));
// multikelas: dot product + softmax, argmax
```

Satu dot product, satu sigmoid atau softmax tergantung jumlah kelas. Satu pass dan selesai. Nol token yang di-generate, jadi nol JSON rusak yang harus diperbaiki di belakang dengan retry dan heuristik parsing.

Resep `train.py`: 300 train / 100 test per workflow, split deterministik (1 item dari 5 masuk test biar tidak bias temporal), vocab 3000-6000, koef dibulatkan ke 1e-4 dengan nol loss terukur. Ekspor JSON `{ vocab, idf, questions }`.

Bobot: 20 KB untuk invoices (`duplicate` 0.89) sampai 650 KB untuk mail (`bucket` 0.889). Jenis ukuran yang muat dalam bundle frontend.

Detail yang bikin aku kaget: di mail, MiniLM menempel TF-IDF dalam +/-0.02. Jadi nano dikirim apa adanya. Bayar GPU buat memilah mail, ogah banget. Sebaliknya agent_trace mentok (`needs_review` 0.59 di nano): teks observabilitas miskin, tidak ada kata yang benar-benar membawa keputusan.

Pabrik yang mengubah bobot jadi plugin, di `src/plugin.ts:52`:

```ts
export function nanoClassifier(manifest, weights, opts = {}) {
  return definePlugin({ manifest,
    classify: (input) => {
      const r = predict(`${from}${input.state}`, weights, q);
      return { decision: r.decision, confidence: r.confidence, domain: manifest.domain };
    }});
}
```

`decide()` tetap sinkron untuk nano, `decideAsync()` membuka ONNX untuk mini. Dua jalur, satu aturan simpel: kalau kamu butuh async berarti kamu mau mini, kalau tidak nano cukup. Gampang diingat saat kamu ngoding, gampang di-debug saat rusak.

Biar kamu lihat ini bukan sekadar teori, ini contoh pemakaian nyata:

```ts
import { Sabaki } from "sabaki";
import customerService from "@sabaki-js/customer-service";

const sabaki = new Sabaki().register(customerService);
sabaki.decide({ state: "charged twice, refund please" });
// { decision: "billing", confidence: 0.31, domain: "customer_service" }
```

### Mini, 22 MB yang mengubah permainan di kasus sulit

Nano punya batas, kamu sudah lihat di agent_trace barusan. MiniLM-L6 mengambil alih: satu encoder bersama untuk seluruh domain, plus satu kepala linear per pertanyaan. Fine-tune end-to-end selama 8-12 epoch, lr 2e-5, di GPU CUDA untuk training (inferensi tetap CPU, itu yang penting).

Angka yang menentukan, diukur pada split yang sama:
- encoder beku + MLP: 0.65
- full fine-tune: 0.68
- distilasi 400M ke embedding beku: dicoba, dibuang, lebih jelek dari gold label

Ekspor ONNX via dynamo, paritas eksak terverifikasi, lalu kuantisasi dinamis int8: 90 MB -> 22 MB, **-0.004 accuracy** di customer_service. ECE tidak berubah atau lebih baik. Tiap ekspor diukur ulang, kalau tidak optimasi tidak ada artinya.

Sejak 1.0.2, bobot disertakan dalam package (`models/<workflow>-int8/` + `modelDir` yang diekspor). `npm i` cukup, mode pesawat OK. Update = terbitkan patch, ditandatangani via trusted publishing.

Konkret: `needs_review` naik dari 0.59 ke **0.82**. `disposition` 0.73 -> 0.76. ECE < 0.14 di mana-mana, dengan keraguan OOD yang sehat (0.2-0.5 pada dragon, resep dan string kosong). Keraguan inilah yang membolehkan threshold agresif di prod.

### Generalist, catch-all yang bikin Sabaki benar-benar System One

Jev dan yang lain menjawab segalanya: pertanyaan apa pun, opsi apa pun, didefinisikan saat runtime. Itu kontrak System One yang bikin Jev viral, kamu menaruh `instructions` + `criteria` dengan opsimu, dia memotong.

Spesialis Sabaki tidak bisa begitu. Mereka tahu pertanyaannya (`category`, `duplicate`, `bucket`) dan tidak yang lain. Tanpa jaring pengaman, Sabaki akan mengembalikan `unknown` begitu kamu keluar naskah, di mana Jev selalu menjawab sesuatu.

Generalist adalah jaring itu. Sebuah cross-encoder yang membaca pertanyaan + opsi + state dan mengeluarkan skor, satu pass per opsi, softmax, argmax. 22.7M MiniLM int8, 6.5x lebih kecil dari 144-151M di kelompok itu. Tapi tugasnya bukan skor, tapi kompatibilitas: dengan dia dicolok sebagai fallback, `POST /v1/systemone` menerima state apa pun dan pertanyaan apa pun, seperti Jev. Field `model` bilang siapa yang benar-benar menjawab (`@sabaki-js/mail@1.1.2+mini`, `sabaki-generalist-v1`...), jadi di sisi pemanggil kamu tidak mengubah apa pun.

Dan yang penting, ini fallback, bukan bos. Aturan emas di `decideAsync()`: kalau spesialis menang routing, dia yang menjawab. Generalist hanya bicara saat `unknown`. Tidak pernah sebaliknya. Ini mencegah generalis yang pas-pasan menindih spesialis yang bagus di domainnya.

Loader tinggal di `src/generalist.ts`, dengan cache per folder biar tidak me-load ulang sesi ONNX tiap call:

```ts
export function loadGeneralist(modelDir: string) {
  // cache per folder, sesi ONNX dipakai ulang
  // tokenizer.json -> Unigram atau wordpiece, terdeteksi otomatis
  const sess = await ort.InferenceSession.create(
    path.join(modelDir, "generalist.onnx"),
    { intraOpNumThreads: 2 },
  );
}
```

Kamu arahkan `SABAKI_GENERALIST_DIR` ke folder berisi `generalist.onnx` + `tokenizer/`, model bisa ditukar. Id berasal dari `config.json`, kalau tidak ada `"sabaki-generalist"`. Cache `Map` menghindari reload sesi tiap call.

Format input, itu cross-encoder klasik: pertanyaan, opsi dan state digabung dengan separator, satu baris per opsi yang di-skor:

```ts
const texts = options.map(
  (o) => `${input.question ?? "decision"} [SEP] ${o} [SEP] ${input.state}`,
);
```

Pertanyaan + opsi + state, dipisah `[SEP]`, satu baris per opsi. Opsi dibatasi 8 (`slice(0, 8)`), default `["yes", "no"]` kalau kamu tidak memberi apa pun. Di atas itu, potong di sisi pemanggil, 8 sudah lega untuk keputusan bertipe.

Lalu datang batch yang pintar, jenis optimasi yang terlihat sepele tapi membagi latensi dengan jumlah opsi. Bukan satu `session.run` per opsi, semua berangkat dalam satu forward:

```ts
// Satu forward batch untuk semua opsi
// (dipadding ke panjang maks) bukan satu run per opsi.
const L = Math.max(...encs.map((e) => e.ids.length));
// ids + attention_mask dalam [options.length, L], padding ke padId
const out = await sess.run({ input_ids, attention_mask });
const scores = Array.from(out["score"].data).map(Number);
```

Tiap teks di-encode (wordpiece ala BERT atau unigram SentencePiece tergantung `tokenizer.json`), di-padding ke panjang maks batch, ditumpuk jadi tensor `[nb_opsi, L]`. Satu `sess.run`, kamu dapat satu skor per opsi. Di CPU ini mengubah segalanya: 20-36ms bukan 8x waktu itu.

Lalu softmax + argmax, dengan proba lengkap untuk tiap opsi, tepat dalam format yang dipopulerkan Jev:

```ts
const pr = softmax(scores);
// bi = indeks nilai maks
const confidence = Math.round(pr[bi] * 1000) / 1000;
const probs = Object.fromEntries(
  options.map((o, i) => [o, Math.round(pr[i] * 1000) / 1000]),
);
```

Dan detail yang bikin ini bisa dipakai di prod bukan sekadar demo, itu `abstainAt`:

```ts
if (input.abstainAt !== undefined && confidence < input.abstainAt) {
  return { decision: null, confidence, domain: "generalist", probabilities: probs };
}
```

Opt-in, tanpa abstain default. Kamu oper `abstainAt: 0.6-0.7` dan semua yang lembek kembali `null` bukan tebakan. Karena softmax mengeluarkan 1.00 bahkan saat salah di luar distribusi, ini bukan kemewahan. GUIDE merekomendasikannya untuk semua pemakaian otonom: di bawah threshold, kamu minta klarifikasi daripada auto-resolve.

Terakhir, ini rakitan yang sama dengan fallback generalist: saat tidak ada spesialis yang cocok, dia yang mengambil alih bukan mengembalikan `unknown`.

```ts
import { Sabaki, definePlugin, loadGeneralist } from "sabaki";
import mail from "@sabaki-js/mail";

const backend = loadGeneralist(process.env.SABAKI_GENERALIST_DIR!);
const generalist = definePlugin({
  manifest: { name: "@sabaki-js/generalist", domain: "generalist",
    version: "0.1.0", questions: ["decision"], keywords: [] },
  classify: (input) => backend.decide(input),
});

const sabaki = new Sabaki().register(mail).setFallback(generalist);

await sabaki.decideAsync({
  state: "le client dit que l'app a supprimé ses données",
  question: "c'est urgent ?",
  options: ["yes", "no"],
  abstainAt: 0.65,
});
// spesialis mail kalau routing cocok, kalau tidak generalist jadi catch-all ala Jev
```

Generasi generalist, semua diukur sama di PhishNChips (2000 mail) dan di test typed-decisions biar yang sebanding bisa dibandingkan:
- v4: 0.29 test, R=0.026 phishing. Buang, jawabnya ke mana-mana.
- A (22M 80k): 0.546, R=0.406. Mulai mirip sesuatu.
- mini v1 yang diserve: **0.536, R=0.616**. Ini yang jalan di situs. Recall phishing lumayan, test sedang.
- B (144M scratch): 0.568, R=0.062. Lebih besar, sedikit lebih baik di test, nol di phishing.

Si 144M from scratch yang tidak transfer lebih baik, itu menyadarkanku soal ide "tambah parameter biar generalisasi". Di tugas yang sama, yang besar bayar lebih mahal tanpa menebak lebih baik. Bahkan sebagai catch-all, yang kecil mengerjakan tugasnya. Dan dia tetap EN-only (`all-MiniLM-L6-v2`), routing EN, FR di luar distribusi. Untuk FR, lewat spesialis yang dilatih di sana, bukan via generalist.

## Doom, satu-satunya tes yang benar-benar penting buatku

doomLaya, itu Laya dan Jev yang benar-benar main FreeDoom. Model memilih `command / target / weapon`, eksekutor menelusuri jalur A*, membuka pintu, membidik, mengklik. Telemetri per tick, video, SHA run. Aku berkontribusi di sana, jadi aku tidak bicara soal leaderboard yang dibaca dari jauh.

v0.1.0, MAP01 seed 48, skill 3, 35 tick/s, eksekutor sama:

| Model | Hasil | p50 HTTP | Biaya API |
|---|---|---|---|
| Laya standar | gagal 180 detik | 106ms | $0 |
| Laya v3 adaptasi | keluar 61.43 detik | 108ms | $0 |
| Jev 1.13 | keluar 68.97 detik | 357ms | $0.0046 |

Dua exit bersih, tanpa mati, dengan Laya memungut shotgun karena eksekutor menangani pickup sendiri. Jujur: Laya v3 dilatih di Doom, Jev tidak. Satu seed, satu map, tidak membuktikan hal umum. README proyek bilang hitam di atas putih, dan itu terhormat karena tidak oversell hasil.

Sisi Sabaki ([plugin-doom](https://github.com/sabaki-js/plugin-doom)): ViZDoom dalam Python yang memanggil server JS tiap tick. Nano ~18k req/s, mini ~71 req/s pada satu thread i5. Tick 35Hz lewat lega, bahkan di laptop sedang.

Dengan kompas exit, mini keluar MAP01 dalam 2-4 run dari 6, nano 0/6. Logis: teks kehilangan spasial, state doomLaya mentok sekitar 0.57 baik MiniLM maupun ModernBERT-base. Saat info spasial hilang, tidak ada pengklasifikasi teks yang menciptakannya ulang.

Tetangga mengulang pertandingan dengan data setara: [doomgemma](https://github.com/dexmac221/doomgemma) menempel LoRA 27 menit di RTX 4070 dan membawa Gemma 4 E2B ke level Laya v3 dalam game (6/6 vs 6/6) dan di atasnya dalam keputusan terisolasi. Pada ukuran setara, decoder secepat Laya (270M: 22ms vs 23ms). Pada hasil setara, Laya tetap ~3x lebih cepat karena mencapai itu dengan model lebih kecil.

Bacaanku: latihan di tugas lebih penting dari arsitektur. Spesialis kecil yang dilatih mengalahkan generalis besar yang baru kenal. Tepat taruhan Sabaki. Paper berikutnya, *System Switch* ([arXiv:2610.09683](https://arxiv.org/abs/2610.09683)), mendorong logika sampai habis: model kecil cepat yang main, model penalar besar yang mengambil alih saat gate terbuka. Pre-triage Sabaki (`automate > 0.85 kalau tidak eskalasi`) diterapkan ke game.

## Yang dikorbankan

Tiap fitur yang hilang membiayai yang lain, itu aturan main saat kamu membidik CPU. Daftar jujur, seperti untuk Bareiron di mana tiap baris C adalah tradeoff:

**Sabaki tidak bercerita.** Dia memotong di antara opsi yang kamu beri, dengan proba. Untuk penjelasan, ringkasan, teks bebas, ambil LLM.

**Bahasa Prancis tetap di luar distribusi untuk generalist.** Routing EN (`all-MiniLM-L6-v2`), probe 1/4 FR vs 3/4 EN pada kasus mirip. Plugin mail berasal dari perusahaan yang mayoritas FR tapi dianonimkan: 0 PII, -0.024 accuracy untuk vocab tanpa term personal. Anonimisasi ada harganya, tapi itu tidak bisa ditawar.

**Softmax tampil terlalu yakin saat keluar zonanya.** False dengan 1.00 terlihat, ya. Makanya pre-triage yang direkomendasikan di GUIDE: `abstainAt: 0.6-0.7` buat mengembalikan `null` di bawah threshold, lalu gate `confidence > 0.85` buat otomatisasi, manusia untuk sisanya. Referensi terukur: recall phishing 0.62 pada presisi 0.87. Cukup buat membelah antrean jadi dua, tidak cukup buat memecat reviewer.

**Nano kesulitan di trace agen.** 0.34 sampai 0.59 tergantung pertanyaan. Mini menaikkan `needs_review` ke 0.82, tapi `risk / urgency / action` tetap keras. Teks observabilitas memang miskin sinyal leksikal.

**Doom dalam teks mentok.** Sekitar 0.57, MiniLM maupun ModernBERT-base. Selama kamu tetap di teks tanpa piksel, MAP02 memblokirmu. Jalur kredibel untuk pemain beneran, itu vision + RL (tiny-doom-defender, 1.1M param dari piksel), bukan pengklasifikasi teks yang lebih baik.

**Benchmark bergeser per batch.** typed-decisions dibuat per batch, split temporal sebenarnya split batch. `drift_tool.py` keluar 0.82 di customer_service, 0.67 di agent_trace (0.5 = tak terbedakan). Konsekuensi terukur: bobot yang dipublikasikan 0.733 campuran vs 0.61 pada split resmi. Angka resmi jadi konservatif. Kalibrasi Platt / temperature+bias tidak transfer antar batch, jadi kita hanya kirim temperature scaling yang dikalibrasi pada batch terbaru. Aturan rumah: `drift_tool.py` dulu, warn di atas 0.6, block di atas 0.8. Tidak ada orang lain yang mempublikasi ini, semua orang seharusnya.

## Hasil akhir, dengan angka di tangan

Di satu sisi laptop i5, di sisi lain API yang menagih per call. Ini yang diberikan tiap mode secara konkret:

- nano: <1ms, ~18k req/s, 20-650 KB, 0 dep
- mini: ~20ms, ~71 req/s, 22 MB int8, onnxruntime opsional
- generalist: 20-36ms, 22.7M, generalis open terkecil yang kukenal

Beberapa domain dimuat: ~0.5 GB RAM dalam lazy-load per domain bukan ~2 GB untuk semua. Deterministik: 100/100 input identik memberi output sama. Threshold per pertanyaan, gate pada `confidence`, `unknown` saat tidak ada yang cocok.

Di Bareiron, menjalankan 3+ pemain tersendat karena tiap pemain makan satu chunk 200ms. Di sini menjalankan 3+ domain lewat tanpa ngos-ngosan, karena tiap ahli mungil dan dimuat saat diminta bukan me-load semuanya sekaligus. Filosofi "kecil yang cukup" yang sama, diterapkan ke hardware lain.

## Filosofinya

p2r3 bilang: *"Aku suka ide chip kecil seharga 1 dolar ini bisa menjalankan sesuatu sekeren Minecraft."*

Vibe yang sama di sini: aku suka ide 20 KB JSON dan seratus baris TS menggantikan panggilan GPU buat memilih label. Itu jelas tidak menggantikan segalanya, jangan ngaco. Itu menggantikan kasus menyebalkan saat kamu mau label dalam milidetik, lokal, dengan confidence yang bisa kamu threshold dengan masuk akal bukan sekadar berdoa.

Tradeoff, ditulis hitam di atas putih:
- encoder -> hitung kata: 7 poin hilang, latensi dibagi 1000, infra nol
- model besar tunggal -> plugin npm: gate lebih kasar, ops jauh lebih simpel
- generasi -> keputusan bertipe: selesai parsing yang rusak dan opsi yang dikarang
- confidence mentah -> pre-triage: abstain dulu, otomatisasi di atas 0.85, manusia untuk sisanya

**3 hal yang perlu diingat:**

1. **7 poin hilang, 1000x lebih cepat** - 0.61/0.69 vs 0.75-0.80, tapi <1ms/20ms CPU offline melawan 25 detik CPU atau API berbayar. Skor tanpa biayanya tidak ada artinya.
2. **Router sederhana + ahli terpisah** - `hits / sqrt(keywords)`, threshold, `unknown`. Tiap plugin dilatih, diberi versi dan dikirim sendiri. Di mail, TF-IDF menempel MiniLM: GPU tidak berguna di sini.
3. **Offline-first dengan kalibrasi jujur** - `npm i`, bobot disertakan, 0 GPU, ECE < 0.14, abstain, drift tool. Satu-satunya stack di perbandingan yang menahan game loop 35Hz tanpa GPU.

Kalau proyek ini menarik buatmu, semua ada dalam MIT di [github.com/sabaki-js](https://github.com/sabaki-js). Versi akademis dengan pengukuran dan bibtex, itu [preprint v1](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf). Dan kalau kamu mau lihat Goliath main Doom beneran, ke [azalio/doomLaya](https://github.com/azalio/doomLaya) xD
