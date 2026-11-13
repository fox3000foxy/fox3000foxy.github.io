---
title: "Luna Protocol : saya membuat bot Discord otonom yang mensimulasikan manusia"
description: "Luna Protocol adalah bot Discord yang sepenuhnya otonom dengan LLM lokal, mampu bercakap alami dengan tidur, salah ketik, keraguan, lupa, kelelahan tematis dan pesan spontan."
date: 2026-07-11
tags:
  - discord
  - llm
  - typescript
  - event-driven-architecture
  - ai
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "XFDa5uHAYFkdBuuirVKbG3Z9MleYOij8uj1379CAq9SJWaYYNC9PNM4j59KTWrsv6tAOkUUEDZviKP5Gaki9Cg=="
---

# Luna Protocol : saya membuat bot Discord otonom yang mensimulasikan manusia

Bagaimana kalau bot Discord bisa **tidur**, membuat **salah ketik**, **ragu**, **lupa** menjawab, dan kadang mengirimi kamu pesan atas kemauannya sendiri? Tepat itulah yang dilakukan **Luna Protocol** : bot Discord yang sepenuhnya otonom yang menjalankan LLM lokal (llama.cpp) dan bercakap seperti manusia yang tidak sempurna.

Luna bekerja dengan pemicu kontekstual dan respons tidak sempurna yang disadari. Ia punya **sistem pemicu berprioritas**, **penundaan variabel**, **jadwal tidur**, **pesan spontan**, bahkan **pipeline TTS** untuk mengirim pesan suara. Semuanya dikonfigurasi lewat satu berkas `config.yml` yang bisa di hot-reload.

Dalam artikel ini, saya membedah arsitektur lengkap : dari bus event generik hingga pipeline TTS, lewat sistem pemicu, komponen manusiawi, dan dataset fine-tuning.

![Gambaran Arsitektur -- komponen global dan alur data](/images/luna-protocol/01-architecture-overview.svg)

---

## Arsitekturnya : bus event bertipe

Jantung Luna adalah **TypedBus** : bus event generik yang bertipe kuat dalam TypeScript. Ini bata fundamental tempat semuanya bersandar. Saya membangunnya begitu karena ingin menghindari dependensi sirkular sejak awal.

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

Dua bus utama berasal darinya :

- **`llmBus`** : menangani token LLM, error, crash, reset
- **`stateBus`** : menangani perubahan keadaan dengan persistensi otomatis

```
┌─────────────────────────────────────────────────────┐
│                   core/bus.ts                        │
│  TypedBus<K, V> -- on / off / once / emit            │
├──────────────────┬──────────────────────────────────┤
│   core/llm-bus   │       state/state-bus             │
│  token / done /  │     state:changed                 │
│  error / crash / │     → persistence auto            │
│  flush / ready / │                                   │
│  reset           │                                   │
└────────┬─────────┴────────┬─────────────────────────┘
         │                  │
┌──────────────────┐  ┌────▼──────────────────────┐
│ core/llm-core.ts │  │ bot.ts (Eris)             │
│ mode direct      │  │ bot/pending.ts             │
│   llama-server   │  │ bot/reactions.ts           │
│ mode online      │  │ state/trigger.ts           │
│   OpenAI API     │  │ state/state.ts             │
│                  │  │ behavior/*                 │
│                  │  │ tts/*                      │
│                  │  │ spontaneous.ts             │
└──────────────────┘  └────────────────────────────┘
```

Keunggulan pendekatan ini : setiap modul **terputus** dari sisanya. LLM memancarkan token ke bus, bot mengonsumsinya, state memperbarui otomatis. Tanpa dependensi sirkular.

---

![Pemrosesan Pesan -- alur lengkap pemrosesan pesan](/images/luna-protocol/02-message-processing.svg)

## Sistem pemicu : siapa memutuskan kapan Luna menjawab?

Setiap pesan masuk dievaluasi oleh `evaluateMessage()` yang mengembalikan `TriggerResult` dengan alasan pemicu. Urutan prioritas kritis :

| # | Alasan | Kondisi | Bypass ignore | Bypass pause |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | Ya (0%) | Ya |
| 2 | `dm` | DM dengan `replyInDM = true` | Ya (0%) | Tidak |
| 3 | `name` | "Luna"/"Pixie"/alias (kata utuh) | Tidak (8%) | Tidak |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (kata utuh) | Tidak (8%) | Tidak |
| 5 | `follow-up` | Bot pembicara terakhir + < 15 dtk + < 3 / 60 dtk | -- | -- |
| 6 | `random` | Peluang 1.5% pada pesan yang tidak cocok | Tidak (8%) | Tidak |

Pencocokannya **kata utuh** (`\b`) : "ai" tidak cocok dengan "mais", "vrai", "lait".

![Evaluasi pemicu -- keputusan masuk untuk setiap pesan](/images/luna-protocol/03-trigger-evaluation.svg)

### Mekanisme follow-up

Ketika Luna menjawab pesan, ia mencatat dirinya sebagai `lastSpeaker`. Pesan berikutnya dalam 15 detik memicu respons **segera**, memotong timer dan pemeriksaan keyword. Anggaran : 3 follow-up per jendela 60 detik.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### Cooldown

8 detik antara dua respons di kanal yang sama. Dilangkahi oleh mention dan follow-up.

---

## Perilaku manusiawi : konsentrasi variabel

Di sinilah Luna menjadi menarik. Setiap tipe pemicu punya **ambang konsentrasi** sendiri : penundaan min/maks, peluang mengabaikan, dan peluang bereaksi.

| Pemicu | Penundaan min | Penundaan maks | Abaikan | Reaksi |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

Perhitungan penundaan juga memperhitungkan :
- **Panjang pesan** : makin panjang pesan, makin lama Luna "membaca"
- **Ketidakaktifan** : kalau Luna tidak aktif selama 10 menit, penundaan dikali 2 (simulasi "bangun")
- **Tidur** : dalam mode `slow`, penundaan dikali 3 hingga 5

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

## Jadwal tidur

Luna bisa tidur. Bisa dikonfigurasi lewat `config.yml` :

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
|------|-------|
| `sleep` | Hanya mention dan DM yang lolos |
| `slow` | Penundaan ×3-5, reaksi nyaris nol |
| `short` | Peluang mengabaikan +30%, reaksi nyaris nol |

Selama jam tidur, status Discord beralih ke `invisible`.

---

## Salah ketik

Luna bisa membuat salah ketik, yang dikoreksi setelah 2-4 detik. Tata letak keyboard bisa dikonfigurasi (AZERTY atau QWERTY). Saya membiarkannya bisa dikonfigurasi karena kamu langsung mengenali bot yang menulis terlalu bersih.

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... semua tombol bersebelahan
};
```

Contoh AZERTY : `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`.

Tiga gaya koreksi :

| Gaya | Perilaku |
|-------|-------------|
| `edit` | Mengedit pesan |
| `message` | Pesan baru : `word*` |
| `mixed` | 50/50 acak (bawaan) |

---

## Keraguan dan kelupaan

**Keraguan** : peluang 15% memulai dengan kata pengisi (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**Kelupaan** : bahkan setelah mencocokkan pemicu, Luna bisa "lupa" menjawab dengan probabilitas 3%. Ia lalu tetap diam total, seolah tidak melihat apa-apa. Saya suka perilaku ini karena kamu pernah melihat manusia melewatkan pesan tanpa sengaja.

**Kelelahan tematis** : kalau sebuah kata kembali terlalu sering dalam 10 pesan terakhir (ambang : 3 kemunculan), penundaan dikali dan peluang mengabaikan naik 15%.

---

## Realisme dalam praktik : ketika jadi menyeramkan

Di atas kertas, semua sistem ini (penundaan, salah ketik, keraguan, kelupaan) tampak seperti gadget. Kenyataannya, digabung, hasilnya mengejutkan : orang yang bercakap dengan Luna tidak curiga apa-apa. Berikut pertukaran nyata di mana seseorang langsung bertanya pada Luna apakah ia bot, dan percakapan lalu melayang ke topik yang sama sekali lain, dengan kealamian yang membuat bulu kuduk berdiri. Saya tidak menyangka akan sekredibel itu dalam kondisi nyata.

![Percakapan Discord dengan Luna -- pertukaran pertama](/images/luna-protocol/realism/realism-01.png)

Nada, keraguan, ritme respons : tidak ada yang mengkhianati bot. Luna mengelak soal pertanyaan umur tanpa pernah merusak karakter.

![Percakapan Discord dengan Luna -- lanjutan pertukaran](/images/luna-protocol/realism/realism-02.png)

Percakapan lanjut dengan sangat lancar, dengan respons pendek dan alami ("okay, okay", "yay", "yayy") : tepat jenis pesan yang dikirim manusia di Discord.

![Percakapan Discord dengan Luna -- pergeseran topik](/images/luna-protocol/realism/realism-03.png)

![Percakapan Discord dengan Luna -- lanjutan pergeseran](/images/luna-protocol/realism/realism-04.png)

![Percakapan Discord dengan Luna -- akhir pertukaran](/images/luna-protocol/realism/realism-05.png)

Yang mengerikan bukan sekadar Luna "menjawab" : melainkan ia **menjalin percakapan**, dengan opini yang tampak, umpan balik, benang pikir yang koheren dari satu pesan ke pesan lain. Tanpa sistem pemicu, penundaan konsentrasi dan keraguan yang dijelaskan di atas, ilusi ini runtuh dalam beberapa pesan.

**Plot twist kecil** : dalam tangkapan layar di atas, **kedua akun yang berdiskusi adalah instans Luna**. `PixieGlow` dan `Sujet d'SBlow` bukan manusia yang menguji bot : melainkan dua bot yang saling bicara, masing-masing yakin (dalam arti perilaku) sedang berdiskusi dengan seseorang yang "normal". Kalau saat membaca pertukaran di atas kamu mengira salah satu dari dua lawan bicara adalah manusia, selamat : kamu baru saja jatuh ke jebakan persis seperti siapa pun di server Discord sungguhan.

Ini agak versi praktis **teori internet mati** : teori ini (awalnya agak konspiratoris) berpostulat bahwa sebagian besar konten dan interaksi online dibangkitkan bot alih-alih manusia, sampai "internet" manusia yang sungguhan menjadi minoritas. Lama dianggap berlebihan, ia menjadi makin tidak absurd seiring sistem seperti Luna Protocol menunjukkan bahwa tidak perlu banyak sarana maupun model raksasa untuk mensimulasikan kehadiran manusia yang kredibel dalam skala besar. Dua instans bot yang sama yang mampu menjalin percakapan panjang tanpa pernah mengkhianati diri, itu memberi gambaran cukup konkret tentang seperti apa web yang dihuni mayoritas bot yang saling bicara.

---

## Pipeline LLM : dua mode

### Mode `direct` (bawaan)

Bot langsung mengirim permintaan ke `llama-server` lokal lewat HTTP. Model dibagi, dengan prompt cache dan 4 slot bersamaan. Dua proses PM2 : server LLM dan klien bot.

### Mode `online`

Bot memanggil API apa pun yang kompatibel OpenAI (OpenAI, OpenRouter, Groq, Together...). Kamu hanya butuh kunci API, LLM berjalan di sisi penyedia.

### Streaming waktu nyata

LLM me streaming responsnya baris per baris (`\n`). Setiap baris dipotong menjadi kata, dipancarkan satu per satu di `llmBus.emit("token", word)`. Di setiap `\n`, event `flush` dipancarkan : bot segera mengirim pesan yang terakumulasi. Irama langsung mengikuti LLM.

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

Antrean permintaan (`requestQueue`) memproses permintaan satu per satu, dengan pembersihan otomatis ketika antrean melampaui 100 elemen.

---

## Pesan spontan

Setiap 5 menit, peluang 12% Luna memposting pesan atas kemauannya sendiri. Server dipilih lewat sistem **bobot linear** : server paling aktif punya peluang N× lebih besar daripada yang terakhir.

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

Konteks 5 pesan terakhir dibaca, dan Luna bergabung ke percakapan "secara alami".

---

## Pipeline TTS : pesan suara

Dengan peluang 8%, Luna mengirim pesan suara alih-alih teks. Pipeline lengkap :

1. **Piper TTS** mensintesis teks menjadi WAV
2. **ffmpeg** mengonversi menjadi OGG
3. Waveform dihitung untuk pratinjau Discord
4. Berkas diunggah lewat API CDN Discord
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

![Pipeline TTS -- dari teks tersintesis ke pesan suara Discord](/images/luna-protocol/10-tts-pipeline.svg)

---

## Anti-spam dan persistensi

### Anti-spam

Antrean per `channelId:userId`. Satu pesan dalam antrean per pengguna per kanal. Diproses begitu respons berjalan selesai.

### Batas sesi

Setelah 8 pertukaran, Luna jeda 30 detik. Penghitung di reset setelah 3 menit ketidakaktifan.

### Persistensi otomatis

Setiap mutasi keadaan memancarkan di `stateBus` → penyimpanan otomatis (debounce 500ms). Tidak perlu lagi panggilan `saveAllState()` manual. Keadaan yang dipersistenkan mencakup : pendingMessages, paused, cooldown, timestamp, lastSpeaker, penghitung follow-up.

---

## Konfigurasi hot-reload

Satu berkas `config.yml`. Sebagian besar nilai **bisa di hot-reload** : perubahan diperhitungkan tanpa restart. Saya ingin bisa menyesuaikan penundaan secara live, tanpa memutus percakapan berjalan.

| Kategori | Hot-reload |
|-----------|-----------|
| Pemicu, kata kunci, nama | ✅ |
| Konsentrasi, penundaan | ✅ |
| Typo, burst, kelelahan | ✅ |
| Jadwal tidur | ✅ |
| TTS, pesan suara | ✅ |
| Token Discord, mode LLM | ❌ (perlu restart) |

```typescript
// config.ts -- getter mengembalikan nilai live
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## Dataset : Discord-Dialogues

Model di fine-tune pada [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) : **7,3 juta pertukaran**, **17 juta putaran**, **140 juta kata**. Percakapan Discord sungguhan musim semi-panas 2025, difilter (PII, ToS, bot, perintah). Apache 2.0.

| Metrik | Nilai |
|----------|--------|
| Sampel | 7 303 464 |
| Total putaran | 16 881 010 |
| Total kata | 139 922 950 |
| Rata-rata token | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

Model terkuantisasi yang dipakai adalah GGUF (misalnya `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Distribusi dataset Discord-Dialogues](/images/luna-protocol/dataset-distribution.svg)

---

![Siklus Hidup Lengkap -- perilaku lengkap bot dari pesan hingga respons, termasuk timer dan kasus batas](/images/luna-protocol/22-complete-lifecycle.svg)

## Diagram arsitektur

Folder `state-machines/` berisi **24 diagram Mermaid** yang mencakup seluruh kode sumber. Setiap diagram punya penjelasan detail dalam bahasa manusia.

Di antara yang terpenting :

| # | Diagram | Tipe |
|---|-----------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (lengkap) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 backend) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

Diagram ini tambang emas untuk memahami alur lengkap : dari pesan masuk hingga respons, lewat timer dan kasus batas.

---

## Kode pemicu secara detail

Pemicu dievaluasi oleh `evaluateMessage()` di `state/trigger.ts`. Berikut logika lengkapnya :

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

  // ... pencocokan nama, kata kunci, follow-up, acak
}
```

Cache regex (`hasWordCache`) menghindari mengompilasi ulang pola di setiap pesan.

---

## Reaksi

Luna bereaksi pada pesan dengan emoji. Peluang 30% memakai emoji kustom server, 70% emoji unicode. Reaksi berangkat setelah penundaan konsentrasi, dengan ritme bergeser yang sama seperti respons. Saya suka pergeseran ini karena kamu merasakan ia meluangkan waktu membaca.

Perintah lewat reaksi pada pesan Luna :
- ❌ → Stop
- ▶️ → Start
- 🗑️ → Clear

---

## Gaya respons

Gaya respons dibobot menurut aktivitas terbaru Luna di kanal :

| Konteks | messageReference | mentionRepliedUser | Bobot |
|----------|-----------------|-------------------|-------|
| Dingin | true | false | 70% |
| Dingin | true | true | 20% |
| Dingin | false | false | 10% |
| Aktif | true | false | 50% |
| Aktif | true | true | 15% |
| Aktif | false | false | 30% |
| Aktif | false | true | 5% |

Di DM, `messageReference` selalu `false`.

---

## Pesan beruntun

Dengan peluang 15%, respons dipotong menjadi 2-3 fragmen yang dikirim dengan ritme manusia (1.5-4 detik antara tiap fragmen). Mensimulasikan seseorang yang mengetik berkali-kali.

![Gantt Pewaktuan -- waktu tunggu nyata untuk penundaan, reaksi, streaming LLM dan koreksi](/images/luna-protocol/21-timing-gantt.svg)

---

## Status dinamis

Status Discord Luna bergantian antara beberapa preset yang dikonfigurasi, berputar setiap 15 menit. Tipe yang didukung : Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). Selama tidur, status beralih ke `invisible`.

```yaml
dynamic_status_presets:
  - status: online
    text: "dengan piksel"
    type: 0       # Playing
  - status: idle
    text: "white noise"
    type: 2       # Listening
```

Jitter acak (×0.5-1.0) menghindari rotasi yang bisa diprediksi. 10% upaya dilewati untuk menghindari pengulangan.

## Indikator mengetik

Sebelum memanggil LLM, Luna memanggil `startTyping()`. `setInterval` menyegarkan indikator setiap 8 detik selama pembangkitan. Dibersihkan di `finally` (`clearInterval`).

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

## Pemulihan setelah crash

Kalau LLM crash (proses `llama-server` yang mati), Luna mendeteksi event lewat `llmBus.emit("crash", code)` dan mencoba menyalakan ulang dengan backoff eksponensial. Menghindari loop restart tak berujung.

## Parameter LLM

Parameter di hardcode di `src/config.ts` :

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

Template ChatML (`<|im_start|>/<|im_end|>`) dipakai. Jumlah thread terdeteksi otomatis lewat `os.cpus().length`.

---

## Penyiapan

```bash
npm install
cp config.example.yml config.yml
# mengedit config.yml
npm run dev                    # dev (hot reload)
npm run build && npm start     # produksi
```

| Skrip | Deskripsi |
|--------|-------------|
| `build` | Bundle CLI mandiri |
| `start` | Menjalankan bot |
| `lint` / `format` / `check` | Biome |
| `test` | Tes (Bun) |
| `download-model` | GGUF dari HuggingFace |
| `diagrams` | Mengekspor diagram Mermaid ke SVG/PNG |

### Deployment PM2

```bash
./start.sh   # menjalankan llm-server + llm-client di bawah PM2
```

---

## Kesimpulan

Luna Protocol jauh melampaui bot Discord dengan LLM. Ini **sistem perilaku lengkap** yang mensimulasikan ketidaksempurnaan manusia : kelupaan, salah ketik, tidur, keraguan, kelelahan. Semuanya diarsiteki sekitar bus event bertipe, dengan 24 diagram Mermaid yang mendokumentasikan setiap alur.

Kodenya open source, datasetnya publik, dan konfigurasinya bisa di hot-reload. Kalau topik ini menarik buatmu, selami kodenya : lebih mudah diakses daripada kelihatannya. Saya memakainya sebagai dasar untuk menguji banyak ide soal perilaku, dan kamu bisa memakai ulang setiap modul terpisah.

| Sumber daya | Tautan |
|-----------|------|
| Depot GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
