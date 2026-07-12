---
title: "Luna Protocol: Saya Membuat Bot Discord Otonom yang Mensimulasikan Manusia"
description: "Luna Protocol adalah bot Discord sepenuhnya otonom dengan LLM lokal, mampu melakukan percakapan alami dengan tidur, salah ketik, keraguan, kelupaan, kelelahan tematik, dan pesan spontan."
date: 2026-07-11authors:
  - fox3000foxy
tags:
  - discord
  - llm
  - typescript
  - event-driven-architecture
  - ai
  - open-source
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "Jy0hbdXmxwemikmGKwibV9i/ke8+q3zFDpEnFAfJYY/52JtCnBVy+BG5EEgloovHhbGTcSBO7foPat2vOR0puQ=="
---

# Luna Protocol: Saya Membuat Bot Discord Otonom yang Mensimulasikan Manusia

Bagaimana jika sebuah bot Discord bisa **tidur**, melakukan **salah ketik**, **ragu-ragu**, **lupa** membalas, dan terkadang mengirim Anda pesan atas inisiatif sendiri? Inilah yang dilakukan **Luna Protocol**: sebuah bot Discord sepenuhnya otonom yang menjalankan LLM lokal (llama.cpp) dan berbicara seperti manusia yang tidak sempurna.

Tanpa prompt kaku, tanpa jawaban robotik. Luna memiliki **sistem pemicu prioritas**, **penundaan variabel**, **jadwal tidur**, **pesan spontan**, dan bahkan **pipeline TTS** untuk mengirim pesan suara. Semuanya dikonfigurasi melalui file `config.yml` sederhana yang dapat di-hot-reload.

Dalam artikel ini, kita akan membedah arsitektur lengkapnya: dari bus peristiwa generik hingga pipeline TTS, termasuk sistem pemicu, komponen manusia, dan dataset fine-tuning.

![Gambaran Arsitektur -- komponen global dan alur data](/images/luna-protocol/01-architecture-overview.svg)

---

## Arsitektur: Bus Peristiwa yang Diketik

Inti dari Luna adalah **TypedBus** -- sebuah bus peristiwa generik yang diketik secara kuat dalam TypeScript. Ini adalah batu fondasi tempat semuanya dibangun.

```typescript
type EventMap = Record<string, unknown[]>;

export class TypedBus<Events extends EventMap> {
  private listeners = new Map<keyof Events, Set<(...args: unknown[]) => void>>();

  on<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as (...args: unknown[]) => void);
  }

  emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    this.listeners.get(event)?.forEach((fn) => { fn(...args); });
  }
}
```

Dua bus utama turunan:

- **`llmBus`** -- menangani token LLM, kesalahan, crash, reset
- **`stateBus`** -- menangani perubahan status dengan persistensi otomatis

```
+-----------------------------------------------------+
|                   core/bus.ts                        |
|  TypedBus<K, V> -- on / off / once / emit            |
+------------------+----------------------------------+
|   core/llm-bus   |       state/state-bus             |
|  token / done /  |     state:changed                 |
|  error / crash / |     -> persistence auto            |
|  flush / ready / |                                   |
|  reset           |                                   |
+--------+---------+--------+-------------------------+
         |                  |
+------------------+  +----+----------------------+
| core/llm-core.ts |  | bot.ts (Eris)             |
| mode direct      |  | bot/pending.ts             |
|   llama-server   |  | bot/reactions.ts           |
| mode online      |  | state/trigger.ts           |
|   OpenAI API     |  | state/state.ts             |
|                  |  | behavior/*                 |
|                  |  | tts/*                      |
|                  |  | spontaneous.ts             |
+------------------+  +----------------------------+
```

Keuntungan dari pendekatan ini: setiap modul **terputus** dari yang lain. LLM memancarkan token ke bus, bot mengonsumsinya, state memperbarui dirinya sendiri secara otomatis. Tidak ada ketergantungan sirkuler.

---

![Pemrosesan Pesan -- alur lengkap pemrosesan pesan](/images/luna-protocol/02-message-processing.svg)

## Sistem Pemicu: Siapa yang Memutuskan Kapan Luna Merespons?

Setiap pesan masuk dievaluasi oleh `evaluateMessage()` yang mengembalikan `TriggerResult` dengan alasan pemicu. Urutan prioritas sangat kritis:

| # | Alasan | Kondisi | Bypass ignore | Bypass pause |
|---|--------|---------|---------------|--------------|
| 1 | `mention` | @bot | Ya (0%) | Ya |
| 2 | `dm` | DM dengan `replyInDM = true` | Ya (0%) | Tidak |
| 3 | `name` | "Luna"/"Pixie"/alias (kata utuh) | Tidak (8%) | Tidak |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (kata utuh) | Tidak (8%) | Tidak |
| 5 | `follow-up` | Bot adalah pembicara terakhir + < 15d + < 3 / 60d | -- | -- |
| 6 | `random` | 1.5% kemungkinan pada pesan yang tidak cocok | Tidak (8%) | Tidak |

Pencocokan adalah **kata utuh** (`\b`): "ai" tidak cocok dengan "baik", "sampai", "pakai".

![Evaluasi Pemicu -- keputusan masuk untuk setiap pesan](/images/luna-protocol/03-trigger-evaluation.svg)

### Mekanisme Follow-up

Saat Luna merespons sebuah pesan, ia mendaftarkan dirinya sebagai `lastSpeaker`. Setiap pesan berikutnya dalam 15 detik memicu respons **segera** -- tanpa timer, tanpa pemeriksaan kata kunci. Anggaran: 3 follow-up per jendela 60 detik.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### Cooldown

8 detik antara dua respons di kanal yang sama. Dilewati oleh mention dan follow-up.

---

## Perilaku Manusia: Konsentrasi Variabel

Di sinilah Luna menjadi menarik. Setiap jenis pemicu memiliki **ambang konsentrasi** sendiri: penundaan min/maks, kemungkinan mengabaikan, dan kemungkinan bereaksi.

| Pemicu | Tunda Min | Tunda Maks | Abaikan | Reaksi |
|--------|-----------|------------|---------|--------|
| `mention` | 300md | 1500md | 0% | 8% |
| `dm` | 400md | 1800md | 0% | 5% |
| `name` | 800md | 4000md | 5% | 6% |
| `keyword` | 1000md | 3500md | 8% | 4% |
| `follow-up` | 500md | 2000md | 0% | 3% |
| `random` | 1500md | 5000md | 15% | 2% |

Perhitungan penundaan juga mempertimbangkan:
- **Panjang pesan**: semakin panjang pesan, semakin lama waktu yang dibutuhkan Luna untuk "membaca"
- **Tidak aktif**: jika Luna tidak aktif selama 10 menit, penundaan dikalikan 2 (simulasi "bangun")
- **Tidur**: dalam mode `slow`, penundaan dikalikan 3 hingga 5

```typescript
export function computeDelay(
  reason: string | null = null,
  sleepBehavior?: string | null,
  msgLength?: number,
  inactivityMs?: number
): number {
  const t = getThresholds(reason);
  let delay = t.delay_min + Math.random() * (t.delay_max - t.delay_min);
  if (msgLength) {
    const readingFactor = Math.min(msgLength / 500, 3);
    delay *= 1 + readingFactor * (0.3 + Math.random() * 0.7);
  }
  if (sleepBehavior === "slow") {
    delay *= 3 + Math.random() * 2;
  }
  delay *= 0.5 + Math.random() * 1.5; // jitter agresif
  return delay;
}
```

---

## Jadwal Tidur

Luna bisa tidur. Dapat dikonfigurasi melalui `config.yml`:

```yaml
timezone: "Europe/Paris"
time_schedules:
  - start: "00:00"
    end: "07:00"
    behavior: sleep
  - start: "23:00"
    end: "00:00"
    behavior: slow
  - start: "07:00"
    end: "08:00"
    behavior: short
```

| Mode | Efek |
|------|------|
| `sleep` | Hanya mention dan DM yang lewat |
| `slow` | Penundaan x3-5, reaksi hampir nol |
| `short` | Kemungkinan abaikan +30%, reaksi hampir nol |

Selama jam tidur, status Discord berubah menjadi `invisible`.

---

## Salah Ketik

Luna bisa melakukan salah ketik -- dan memperbaikinya setelah 2-4 detik. Tata letak keyboard dapat dikonfigurasi (AZERTY atau QWERTY).

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... semua tombol yang berdekatan
};
```

Contoh AZERTY: `bonjour -> bonjpur`, `salut -> slaut`, `comment -> cpmment`.

Tiga gaya koreksi:

| Gaya | Perilaku |
|------|----------|
| `edit` | Mengedit pesan |
| `message` | Pesan baru: `word*` |
| `mixed` | 50/50 acak (default) |

---

## Keraguan dan Kelupaan

**Keraguan**: 15% kemungkinan memulai dengan kata pengisi (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**Kelupaan**: bahkan setelah mencocokkan pemicu, Luna bisa "lupa" merespons dengan probabilitas 3%. Tidak ada pesan, tidak ada reaksi -- seolah-olah dia tidak melihat apa pun.

**Kelelahan Tematik**: jika sebuah kata muncul terlalu sering dalam 10 pesan terakhir (ambang: 3 kemunculan), penundaan dikalikan dan kemungkinan abaikan meningkat 15%.

---

## Realisme dalam praktik: saat semuanya jadi mengerikan

Di atas kertas, semua sistem ini (jeda, typo, keraguan, kelupaan) terdengar seperti gimmick belaka. Namun dalam praktiknya, saat digabungkan, hasilnya sangat mengejutkan -- sampai-sampai orang yang mengobrol dengan Luna tidak curiga sama sekali. Berikut percakapan nyata di mana seseorang langsung bertanya kepada Luna apakah dia bot, dan percakapan kemudian bergeser ke topik yang sama sekali berbeda dengan kealamian yang bikin merinding.

![Percakapan Discord dengan Luna -- bagian pertama](/images/luna-protocol/realism/realism-01.png)

Nada bicara, keraguan, ritme balasan -- tidak ada yang mengkhianati identitasnya sebagai bot. Luna mengelak dari pertanyaan usia tanpa pernah keluar dari karakternya.

Percakapan terus mengalir secara alami, dengan balasan singkat dan manusiawi ("okay, okay", "yay", "yayy") -- persis jenis pesan yang akan dikirim manusia di Discord.

![Percakapan Discord dengan Luna -- lanjutan](/images/luna-protocol/realism/realism-02.png)

![Percakapan Discord dengan Luna -- pergeseran topik](/images/luna-protocol/realism/realism-03.png)

![Percakapan Discord dengan Luna -- pergeseran topik berlanjut](/images/luna-protocol/realism/realism-04.png)

![Percakapan Discord dengan Luna -- akhir percakapan](/images/luna-protocol/realism/realism-05.png)

Yang mengerikan bukan cuma karena Luna "membalas" -- tapi karena dia **mempertahankan sebuah percakapan**, dengan opini yang tampak nyata, tanggapan lanjutan, dan alur pemikiran yang koheren dari satu pesan ke pesan berikutnya. Tanpa sistem trigger, jeda konsentrasi, dan keraguan yang dijelaskan di atas, ilusi ini akan runtuh hanya dalam beberapa pesan.

**Sedikit plot twist**: dalam tangkapan layar di atas, **kedua akun yang mengobrol sama-sama merupakan instance dari Luna**. `PixieGlow` dan `Sujet d'SBlow` bukan manusia yang sedang menguji bot -- keduanya adalah dua bot yang saling berbicara, masing-masing "yakin" (secara perilaku) bahwa mereka sedang mengobrol dengan seseorang yang "normal". Jika saat membaca percakapan di atas kamu mengira salah satunya manusia, selamat -- kamu baru saja terjebak persis seperti siapa pun yang akan terjebak di server Discord sungguhan.

Ini pada dasarnya adalah versi praktis dari **dead internet theory**: teori ini (yang awalnya cukup bersifat teori konspirasi) menyatakan bahwa porsi konten dan interaksi online yang dihasilkan oleh bot, bukan manusia, terus meningkat, sampai-sampai internet "asli" milik manusia menjadi minoritas. Lama dianggap berlebihan, teori ini menjadi semakin tidak absurd seiring sistem seperti Luna Protocol menunjukkan bahwa tidak dibutuhkan banyak daya komputasi atau model raksasa untuk mensimulasikan kehadiran manusia yang meyakinkan dalam skala besar. Dua instance dari bot yang sama yang mampu mempertahankan percakapan panjang tanpa pernah ketahuan memberikan gambaran yang cukup konkret tentang seperti apa web yang sebagian besar dihuni oleh bot-bot yang saling berbicara.

---

## Pipeline LLM: Dua Mode

### Mode `direct` (default)

Bot mengirim permintaan langsung ke `llama-server` lokal melalui HTTP. Model dibagikan, dengan cache prompt dan 4 slot konkuren. Dua proses PM2: server LLM dan klien bot.

### Mode `online`

Bot memanggil API apa pun yang kompatibel dengan OpenAI (OpenAI, OpenRouter, Groq, Together...). Tidak memerlukan LLM lokal.

### Streaming Waktu Nyata

LLM melakukan stream respons baris demi baris (`\n`). Setiap baris dipotong menjadi kata-kata, dipancarkan satu per satu melalui `llmBus.emit("token", word)`. Pada setiap `\n`, sebuah peristiwa `flush` dipancarkan -- bot segera mengirim pesan yang telah terakumulasi. Tidak ada penundaan simulasi: ritmenya adalah ritme LLM.

```typescript
function emitWordTokens(chunk: string): void {
  const words = chunk.match(/\S+/g) ?? [];
  wordEmitQueue.push(() => {
    let i = 0;
    const emitNext = () => {
      llmBus.emit("token", words[i]);
      i++;
      if (i < words.length) {
        const delay = MIN_WORD_DELAY + Math.random() * (MAX_WORD_DELAY - MIN_WORD_DELAY);
        setTimeout(emitNext, delay);
      } else {
        llmBus.emit("flush");
      }
    };
    emitNext();
  });
}
```

Antrean (`requestQueue`) memproses permintaan satu per satu, dengan pembersihan otomatis ketika antrean melebihi 100 elemen.

---

## Pesan Spontan

Setiap 5 menit, 12% kemungkinan Luna mengirim pesan atas inisiatif sendiri. Server dipilih oleh sistem **bobot linier**: server paling aktif memiliki N kali lebih banyak kemungkinan daripada yang terakhir.

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

Konteks 5 pesan terakhir dibaca, dan Luna bergabung dengan percakapan "secara alami".

---

## Pipeline TTS: Pesan Suara

Dengan 8% kemungkinan, Luna mengirim pesan suara alih-alih teks. Pipeline lengkap:

1. **Piper TTS** mensintesis teks menjadi WAV
2. **ffmpeg** mengonversi ke OGG
3. Waveform dihitung untuk pratinjau Discord
4. File diunggah melalui API CDN Discord
5. Pesan suara dikirim

```typescript
export async function sendTextAsVoiceMessage(
  channelId: string, replyToMessageId: string, text: string
): Promise<void> {
  const safe = sanitizeForTTS(text);
  const { audio: wavBuf } = await synthesize(safe);
  const oggBuf = await wavToOgg(wavBuf);
  const durationSecs = await getAudioDuration(oggBuf);
  const waveform = buildWaveformBase64();
  const { uploadUrl, uploadFilename } = await requestUploadUrl(channelId, oggBuf.byteLength, durationSecs);
  await putFileToUploadUrl(uploadUrl, oggBuf);
  await postVoiceMessage(channelId, uploadFilename, durationSecs, waveform, replyToMessageId);
}
```

![Pipeline TTS -- dari teks yang disintesis ke pesan suara Discord](/images/luna-protocol/10-tts-pipeline.svg)

---

## Anti-Spam dan Persistensi

### Anti-Spam

Antrean per `channelId:userId`. Hanya satu pesan dalam antrean per pengguna per kanal. Diproses setelah respons saat ini selesai.

### Batas Sesi

Setelah 8 percakapan, Luna berhenti sejenak selama 30 detik. Penghitung direset setelah 3 menit tidak aktif.

### Persistensi Otomatis

Setiap perubahan status memancar ke `stateBus` -> penyimpanan otomatis (debounce 500md). Tidak perlu lagi panggilan `saveAllState()` manual. Status yang dipersistensikan meliputi: pendingMessages, paused, cooldowns, timestamps, lastSpeaker, penghitung follow-up.

---

## Konfigurasi Hot-Reload

Satu file `config.yml`. Sebagian besar nilai dapat **di-hot-reload** -- perubahan diterapkan tanpa restart.

| Kategori | Hot-reload |
|----------|-----------|
| Pemicu, kata kunci, nama | Ya |
| Konsentrasi, penundaan | Ya |
| Salah ketik, semburan, kelelahan | Ya |
| Jadwal tidur | Ya |
| TTS, pesan suara | Ya |
| Token Discord, mode LLM | Tidak (restart diperlukan) |

```typescript
// config.ts -- getter mengembalikan nilai langsung
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## Dataset: Discord-Dialogues

Model di-fine-tune pada [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues): **7.3M percakapan**, **17M giliran**, **140M kata**. Percakapan Discord nyata musim semi-panas 2025, difilter (PII, ToS, bot, perintah). Apache 2.0.

| Metrik | Nilai |
|--------|-------|
| Sampel | 7 303 464 |
| Total giliran | 16 881 010 |
| Total kata | 139 922 950 |
| Rata-rata token | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

Model terkuantifikasi yang digunakan adalah GGUF (misalnya `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Distribusi dataset Discord-Dialogues](/images/luna-protocol/dataset-distribution.svg)

---

![Siklus Hidup Lengkap -- perilaku bot lengkap dari pesan ke respons, termasuk timer dan kasus batas](/images/luna-protocol/22-complete-lifecycle.svg)

## Diagram Arsitektur

Direktori `state-machines/` berisi **24 diagram Mermaid** yang mencakup seluruh kode sumber. Setiap diagram memiliki penjelasan rinci dalam bahasa manusia.

Di antara yang terpenting:

| # | Diagram | Tipe |
|---|---------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (lengkap) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 backend) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

Diagram-diagram ini adalah tambang emas untuk memahami alur lengkap: dari pesan masuk hingga respons, termasuk timer dan kasus batas.

---

## Kode Pemicu Secara Detail

Pemicu dievaluasi oleh `evaluateMessage()` di `state/trigger.ts`. Berikut logika lengkapnya:

```typescript
export function evaluateMessage(
  message: Eris.Message, botId: string, botUsername: string, isFollowUp = false
): TriggerResult {
  if (message.author.bot) return { shouldRespond: false, reason: null, botName: "" };
  if (message.content === "-stop") return { shouldRespond: true, reason: "stop", botName: "" };
  if (message.content === "-start") return { shouldRespond: true, reason: "start", botName: "" };
  if (message.content === "-clear") return { shouldRespond: true, reason: "clear", botName: "" };

  const isMentioned = message.mentions.some((u) => u.id === botId);
  if (isMentioned) return { shouldRespond: true, reason: "mention", botName };
  if (!message.guildID) return { shouldRespond: true, reason: "dm", botName };
  if (isPaused()) return { shouldRespond: false, reason: null, botName: "" };
  if (isOnCooldown(channelId)) return { shouldRespond: false, reason: null, botName };

  // ... pencocokan berdasarkan nama, kata kunci, follow-up, acak
}
```

Cache regex (`hasWordCache`) menghindari kompilasi ulang pola pada setiap pesan.

---

## Reaksi

Luna bereaksi terhadap pesan dengan emoji. 30% kemungkinan menggunakan emoji kustom server, 70% emoji unicode. Reaksi dipicu setelah penundaan konsentrasi, tidak segera.

Perintah melalui reaksi pada pesan Luna:
- ❌ -> Stop
- ▶️ -> Start
- 🗑️ -> Clear

---

## Gaya Respons

Gaya respons ditimbang berdasarkan aktivitas terakhir Luna di kanal:

| Konteks | messageReference | mentionRepliedUser | Bobot |
|---------|-----------------|-------------------|-------|
| Dingin | true | false | 70% |
| Dingin | true | true | 20% |
| Dingin | false | false | 10% |
| Aktif | true | false | 50% |
| Aktif | true | true | 15% |
| Aktif | false | false | 30% |
| Aktif | false | true | 5% |

Dalam DM, `messageReference` selalu `false`.

---

## Pesan Beruntun

Dengan 15% kemungkinan, sebuah respons dipotong menjadi 2-3 fragmen yang dikirim dengan kecepatan manusia (1.5-4 detik antara setiap fragmen). Mensimulasikan seseorang yang mengetik beberapa kali.

![Timing Gantt -- waktu tunggu nyata untuk penundaan, reaksi, streaming LLM, dan koreksi](/images/luna-protocol/21-timing-gantt.svg)

---

## Status Dinamis

Status Discord Luna bergantian di antara beberapa preset yang dikonfigurasi, berputar setiap 15 menit. Tipe yang didukung: Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). Selama tidur, status berubah menjadi `invisible`.

```yaml
dynamic_status_presets:
  - status: online
    text: "dengan piksel"
    type: 0       # Playing
  - status: idle
    text: "white noise"
    type: 2       # Listening
```

Jitter acak (x0.5-1.0) menghindari rotasi yang dapat diprediksi. 10% percobaan dilewati untuk menghindari pengulangan.

## Indikator Mengetik

Sebelum memanggil LLM, Luna memanggil `startTyping()`. Sebuah `setInterval` menyegarkan indikator setiap 8 detik selama generasi. Dibersihkan di `finally` (`clearInterval`).

```typescript
const startTyping = () => {
  client.sendChannelTyping(message.channel.id);
  typingIntervals.set(
    message.channel.id,
    setInterval(() => {
      client.sendChannelTyping(message.channel.id);
    }, 8000)
  );
};
```

## Pemulihan Setelah Crash

Jika LLM crash (proses `llama-server` mati), Luna mendeteksi peristiwa melalui `llmBus.emit("crash", code)` dan mencoba restart dengan backoff eksponensial. Menghindari loop restart tak terbatas.

## Parameter LLM

Parameter di-hardcode di `src/config.ts`:

```yaml
temp: 0.75
dynatemp-range: 0.15
top-k: 40
top-p: 0.95
min-p: 0.05
repeat-penalty: 1.12
repeat-last-n: 256
presence-penalty: 0.1
batch: 4096
ubatch: 256
context: 4096
```

Template ChatML (`<|im_start|>/<|im_end|>`) digunakan. Jumlah thread terdeteksi otomatis melalui `os.cpus().length`.

---

## Pengaturan

```bash
npm install
cp config.example.yml config.yml
# edit config.yml
npm run dev                    # dev (hot reload)
npm run build && npm start     # produksi
```

| Skrip | Deskripsi |
|-------|-----------|
| `build` | Bundle CLI mandiri |
| `start` | Menjalankan bot |
| `lint` / `format` / `check` | Biome |
| `test` | Tes (Bun) |
| `download-model` | GGUF dari HuggingFace |
| `diagrams` | Ekspor diagram Mermaid ke SVG/PNG |

### Deployment PM2

```bash
./start.sh   # menjalankan llm-server + llm-client di bawah PM2
```

---

## Kesimpulan

Luna Protocol bukan sekadar bot Discord dengan LLM. Ini adalah **sistem perilaku lengkap** yang mensimulasikan ketidaksempurnaan manusia: kelupaan, salah ketik, tidur, keraguan, kelelahan. Semuanya diarsitekturkan di sekitar bus peristiwa yang diketik, dengan 24 diagram Mermaid yang mendokumentasikan setiap alur.

Kode bersifat open source, dataset bersifat publik, dan konfigurasi dapat di-hot-reload. Jika topik ini menarik bagi Anda, selami kodenya -- ini lebih mudah diakses daripada yang terlihat.

| Sumber Daya | Tautan |
|-------------|--------|
| Repositori GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
