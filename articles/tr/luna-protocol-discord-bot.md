---
title: "Luna Protocol: insanı simüle eden özerk bir Discord botu yarattım"
description: "Luna Protocol, uyku, yazım hataları, tereddütler, unutkanlıklar, tematik yorgunluk ve spontan mesajlarla doğal sohbet edebilen yerel LLMli tamamen özerk bir Discord botudur."
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
author_sig: "wpShxUAg9RvQ2GJbHDWrvXLMp7k5+FSs77P2vMYB57LFFGAW9EFchKZE7IjFl5dOM+8tQFXlvsY2dtJNBbv6PQ=="
---

# Luna Protocol: insanı simüle eden özerk bir Discord botu yarattım

Bir Discord botu **uyuyabilir**, **yazım hataları** yapabilir, **tereddüt** edebilir, yanıtlamayı **unutabilir** ve bazen kendi kendine mesaj gönderebilir mi? **Luna Protocol** tam bunu yapar: yerel bir LLM (llama.cpp) çalıştıran ve kusurlu bir insan gibi sohbet eden tamamen özerk bir Discord botu.

Luna bağlamsal tetikleyiciler ve üstlenilmiş kusurlu yanıtlarla çalışır. **Öncelikli tetikleme sistemi**, **değişken gecikmeler**, **uyku saatleri**, **spontan mesajlar** ve hatta sesli mesaj göndermek için **TTS pipelineı** vardır. Hepsi hot-reload yapılabilir basit `config.yml` dosyasıyla yapılandırılır.

Bu makalede tüm mimariyi didiklerim: genel olay veriyolundan TTS pipelineına, tetikleme sisteminden insani bileşenlere ve ince ayar veri kümesine.

![Mimari Genel Bakış: global bileşenler ve veri akışı](/images/luna-protocol/01-architecture-overview.svg)

---

## Mimari: tipli olay veriyolu

Lunanın kalbi bir **TypedBus** tur: TypeScript güçlü tipli genel olay veriyolu. Her şeyin dayandığı temel tuğla budur. Başından döngüsel bağımlılıklardan kaçınmak istediğim için böyle inşa ettim.

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

Buradan iki ana veriyol türetilir:

- **`llmBus`**: LLM jetonları, hatalar, crashler, sıfırlama yönetir
- **`stateBus`**: otomatik kalıcılıkla durum değişikliklerini yönetir

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

Bu yaklaşımın avantajı: her modül geri kalanından **bağlantısızdır**. LLM jetonları veriyolda yayar, bot tüketir, durum otomatik güncellenir. Döngüsel bağımlılık yok.

---

![Mesaj İşleme: bir mesajın eksiksiz işlenme akışı](/images/luna-protocol/02-message-processing.svg)

## Tetikleme sistemi: Luna ne zaman yanıt vereceğine kim karar verir?

Gelen her mesaj nedenli `TriggerResult` döndüren `evaluateMessage()` tarafından değerlendirilir. Öncelik sırası kritiktir:

| # | Neden | Koşullar | Görmezden gelmeyi atlatır | Duraklamayı atlatır |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | Evet (%0) | Evet |
| 2 | `dm` | `replyInDM = true` ile DM | Evet (%0) | Hayır |
| 3 | `name` | "Luna"/"Pixie"/takma ad (tam kelime) | Hayır (%8) | Hayır |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (tam kelime) | Hayır (%8) | Hayır |
| 5 | `follow-up` | Bot son konuşmacıydı + < 15 sn + < 3 / 60 sn | -- | -- |
| 6 | `random` | eşleşmeyen mesajlarda %1,5 şans | Hayır (%8) | Hayır |

Eşleşme **tam kelimedir** (`\b`): "ai", "mais", "vrai", "lait" ile eşleşmez.

![Tetikleyici değerlendirmesi: her mesaj için giriş kararı](/images/luna-protocol/03-trigger-evaluation.svg)

### Takip mekanizması

Luna bir mesaja yanıt verince `lastSpeaker` olarak kaydedilir. Sonraki 15 saniyede her mesaj zamanlayıcı ve anahtar kelime kontrollerini kısa devre eden **anında** yanıt tetikler. Bütçe: 60 saniyelik pencerede 3 takip.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### Bekleme süresi

Aynı kanalda iki yanıt arası 8 saniye. Bahsetmeler ve takiplerle atlatılır.

---

## İnsani davranışlar: değişken konsantrasyon

Lunanın ilginçleştiği yer burasıdır. Her tetikleyici türünün kendi **konsantrasyon eşikleri** vardır: min/maks gecikme, görmezden gelme şansı ve tepki şansı.

| Tetikleyici | Min gecikme | Maks gecikme | Görmezden gelme | Tepki |
|---------|----------|----------|--------|----------|
| `mention` | 300 ms | 1500 ms | %0 | %8 |
| `dm` | 400 ms | 1800 ms | %0 | %5 |
| `name` | 800 ms | 4000 ms | %5 | %6 |
| `keyword` | 1000 ms | 3500 ms | %8 | %4 |
| `follow-up` | 500 ms | 2000 ms | %0 | %3 |
| `random` | 1500 ms | 5000 ms | %15 | %2 |

Gecikme hesabı şunları da dikkate alır:
- **Mesaj uzunluğu**: mesaj ne uzun, Luna "okumaya" o kadar zaman harcar
- **Hareketsizlik**: Luna 10 dakikadır aktif değilse gecikme 2 ile çarpılır ("uyanma" simülasyonu)
- **Uyku**: `slow` modunda gecikme 3 ila 5 ile çarpılır

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
  delay *= 0.5 + Math.random() * 1.5; // agresif jitter
  return delay;
}
```

---

## Uyku saatleri

Luna uyuyabilir. `config.yml` ile yapılandırılır:

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

| Mod | Etki |
|------|-------|
| `sleep` | Yalnızca bahsetmeler ve DMler geçer |
| `slow` | Gecikme ×3-5, tepkiler neredeyse sıfır |
| `short` | Görmezden gelme şansı +%30, tepkiler neredeyse sıfır |

Uyku saatlerinde Discord durumu `invisible` geçer.

---

## Yazım hataları

Luna 2-4 saniye sonra düzeltilen yazım hataları yapabilir. Klavye düzeni yapılandırılabilir (AZERTY ya da QWERTY). Yapılandırılabilir bıraktım çünkü fazla temiz yazan bir botu hemen fark edersin.

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... tüm bitişik tuşlar
};
```

AZERTY örneği: `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`.

Üç düzeltme stili:

| Stil | Davranış |
|-------|-------------|
| `edit` | Mesajı düzenler |
| `message` | Yeni mesaj: `word*` |
| `mixed` | %50/50 rastgele (varsayılan) |

---

## Tereddütler ve unutkanlıklar

**Tereddütler**: dolgu kelimesiyle başlama %15 şans (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**Unutkanlıklar**: tetikleyici eşleşse bile Luna %3 olasılıkla yanıtlamayı "unutabilir". O zaman hiçbir şey görmemiş gibi tamamen sessiz kalır. Bu davranışı severim çünkü insanların kazara bir mesajı es geçtiğini zaten gördün.

**Tematik yorgunluk**: bir kelime son 10 mesajda fazla dönerse (eşik: 3 kez) gecikmeler çarpılır ve görmezden gelme şansı %15 artar.

---

## Pratikte gerçekçilik: ürkütücüleştiği an

Kâğıt üstünde tüm bu sistemler (gecikmeler, yazım hataları, tereddütler, unutkanlıklar) alet gibi görünür. Gerçekte uç uca koyunca sonuç blufftur: Lunayla sohbette insanlar hiçbir şeyden şüphelenmez. Birinin Lunaya doğrudan bot olup olmadığını sorduğu ve sohbetin sonra tüyler ürpertici doğallıkla tamamen başka konuya saptığı gerçek bir değiş tokuş işte. Gerçek koşullarda bu kadar inandırıcı olmasını beklemiyordum.

![Luna ile Discord konuşması: ilk değiş tokuş](/images/luna-protocol/realism/realism-01.png)

Ton, tereddütler, yanıt ritmi: botu ele veren hiçbir şey yok. Luna yaş sorusunu karakteri hiç bozmadan savuşturur.

![Luna ile Discord konuşması: değiş tokuşun devamı](/images/luna-protocol/realism/realism-02.png)

Sohbet tamamen akıcı devam eder, kısa ve doğal yanıtlarla ("okay, okay", "yay", "yayy"): Discordda bir insanın göndereceği türden mesajlar tam olarak.

![Luna ile Discord konuşması: konu sapması](/images/luna-protocol/realism/realism-03.png)

![Luna ile Discord konuşması: sapmanın devamı](/images/luna-protocol/realism/realism-04.png)

![Luna ile Discord konuşması: değiş tokuşun sonu](/images/luna-protocol/realism/realism-05.png)

Ürkütücü olan Luna "yanıt vermesi" değildir: **sohbet sürdürmesidir**, görünen fikirlerle, dönüşlerle, mesajdan mesaja tutarlı düşünce ipiyle. Yukarıda anlatılan tetikleme sistemi, konsantrasyon gecikmeleri ve tereddütler olmadan bu illüzyon birkaç mesajda çökerdi.

**Küçük olay örgüsü dönüşü**: yukarıdaki ekran görüntülerinde **sohbet eden iki hesap Luna örnekleridir**. `PixieGlow` ve `Sujet d'SBlow` bir botu test eden insan değildir: birbirleriyle konuşan iki bottur, her biri (davranışsal anlamda) "normal" biriyle konuştuğuna iknadır. Yukarıdaki değiş tokuşu okurken muhataplardan birinin insan olduğunu varsaydıysan tebrikler: gerçek bir Discord sunucusunda herkesin düşeceği tuzağa az önce düştün.

Bu biraz **ölü internet teorisinin** pratik sürümüdür: bu teori (başlangıçta epey komplo teorisi) çevrimiçi içerik ve etkileşimlerin giderek artan payının insanlardan çok botlarca üretileceğini, "gerçek" insani internetin azınlığa düştüğünü öne sürer. Uzun süre abartılı sayıldı, Luna Protocol gibi sistemler inandırıcı insani mevcudiyeti büyük ölçekte simüle etmek için ne çok araç ne devasa model gerekmediğini gösterdikçe giderek daha az absürt olur. Hiç ele vermeden uzun sohbet sürdürebilen aynı botun iki örneği, çoğu botların birbirleriyle konuştuğu bir webin neye benzeyebileceğine epey somut bir bakış verir.

---

## LLM pipelineı: iki mod

### `direct` modu (varsayılan)

Bot istekleri yerel `llama-server` HTTP sunucusuna doğrudan gönderir. Model paylaşımlıdır, istem önbelleği ve 4 eşzamanlı slot ile. İki PM2 süreci: LLM sunucusu ve bot istemcisi.

### `online` modu

Bot herhangi OpenAI uyumlu API çağırır (OpenAI, OpenRouter, Groq, Together...). Sadece API anahtarı gerekir, LLM sağlayıcı tarafında döner.

### Gerçek zamanlı akış

LLM yanıtını satır satır (`\n`) akıtır. Her satır kelimelere bölünür, `llmBus.emit("token", word)` üzerinde tek tek yayılır. Her `\n`de `flush` olayı yayılır: bot birikmiş mesajı hemen gönderir. Ritim doğrudan LLMyi izler.

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

İstek kuyruğu (`requestQueue`) istekleri tek tek işler, kuyruk 100 öğeyi aşınca otomatik temizlikle.

---

## Spontan mesajlar

Her 5 dakikada Lunannın kendi kendine mesaj gönderme şansı %12dir. Sunucu **doğrusal ağırlık** sistemiyle seçilir: en aktif sunucunun en sonuncudan N kat şansı vardır.

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

Son 5 mesajın bağlamı okunur ve Luna sohbete "doğal" katılır.

---

## TTS pipelineı: sesli mesajlar

%8 şansla Luna metin yerine sesli mesaj gönderir. Eksiksiz pipeline:

1. **Piper TTS** metni WAVa sentezler
2. **ffmpeg** OGGye çevirir
3. Dalga formu Discord önizlemesi için hesaplanır
4. Dosya Discord CDN API üzerinden yüklenir
5. Sesli mesaj gönderilir

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

![TTS Pipeline: sentezlenmiş metinden Discord sesli mesajına](/images/luna-protocol/10-tts-pipeline.svg)

---

## Anti-spam ve kalıcılık

### Anti-spam

`channelId:userId` başına kuyruk. Kanal başına kullanıcı başına kuyrukta tek mesaj. Devam eden yanıt biter bitmez işlenir.

### Oturum limitleri

8 değiş tokuştan sonra Luna 30 saniye mola verir. Sayaç 3 dakika hareketsizlikten sonra sıfırlanır.

### Otomatik kalıcılık

Her durum mutasyonu `stateBus` üzerinde yayılır → otomatik kayıt (500 ms debounce). Manuel `saveAllState()` çağrılarına artık gerek yok. Kalıcı durum şunları içerir: pendingMessages, paused, cooldowns, timestamps, lastSpeaker, takip sayaçları.

---

## Hot-reload yapılandırması

Tek bir `config.yml` dosyası. Çoğu değer **hot-reload yapılabilir**: değişiklikler yeniden başlatmadan dikkate alınır. Gecikmeleri devam eden sohbetleri kesmeden canlı ayarlamak istedim.

| Kategori | Hot-reload |
|-----------|-----------|
| Tetikleyiciler, anahtar kelimeler, adlar | ✅ |
| Konsantrasyon, gecikmeler | ✅ |
| Yazım hataları, patlama, yorgunluk | ✅ |
| Uyku programları | ✅ |
| TTS, sesli mesajlar | ✅ |
| Discord jetonu, LLM modu | ❌ (yeniden başlatma gerekir) |

```typescript
// config.ts: getterlar canlı değerler döndürür
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## Veri kümesi: Discord-Dialogues

Model [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) üzerinde ince ayarlıdır: **7,3M değiş tokuş**, **17M tur**, **140M kelime**. 2025 ilkbahar-yaz gerçek Discord konuşmaları, filtrelenmiş (PII, ToS, botlar, komutlar). Apache 2.0.

| Metrik | Değer |
|----------|--------|
| Örnekler | 7 303 464 |
| Toplam tur | 16 881 010 |
| Toplam kelime | 139 922 950 |
| Ortalama jeton | 32.8 |
| Jetonlaştırıcı | Hermes-3-Llama-3.1-8B |

Kullanılan nicemlenmiş model bir GGUFtur (örneğin `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Discord-Dialogues veri kümesi dağılımı](/images/luna-protocol/dataset-distribution.svg)

---

![Complete Lifecycle: zamanlayıcılar ve uç durumlar dahil botun mesajdan yanıta eksiksiz davranışı](/images/luna-protocol/22-complete-lifecycle.svg)

## Mimari şemaları

`state-machines/` klasörü kaynak kodun tamamını kapsayan **24 Mermaid şeması** içerir. Her şemanın insan dilinde ayrıntılı açıklaması vardır.

En önemlilerinden:

| # | Şema | Tür |
|---|-----------|------|
| 01 | Mimari Genel Bakış | `graph` |
| 02 | Mesaj İşleme (eksiksiz) | `stateDiagram` |
| 03 | Tetikleyici Değerlendirme | `flowchart` |
| 04 | LLM Çekirdek Kuyruğu (3 backend) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | Durum Kalıcılığı | `flowchart` |
| 21 | Zamanlama Gantt | `gantt` |
| 22 | Eksiksiz Yaşam Döngüsü | `stateDiagram` |

Bu şemalar tüm akışı anlamak için altın madenidir: gelen mesajdan yanıta, zamanlayıcılar ve uç durumlar üzerinden.

---

## Tetikleme kodu ayrıntılı

Tetikleyici `state/trigger.ts` içinde `evaluateMessage()` ile değerlendirilir. Eksiksiz mantık:

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

  // ... ad, anahtar kelime, takip, rastgele eşleştirme
}
```

Regex önbelleği (`hasWordCache`) kalıpları her mesajda yeniden derlemekten kaçınır.

---

## Tepkiler

Luna mesajlara emojilerle tepki verir. Sunucunun özel emojisini kullanma şansı %30, unicode emoji %70. Tepki konsantrasyon gecikmesinden sonra gider, yanıtlarla aynı kayık ritimle. Bu kaymayı severim çünkü okumaya zaman ayırdığını hissedersin.

Luna mesajlarında tepkili komutlar:
- ❌ → Durdur
- ▶️ → Başlat
- 🗑️ → Temizle

---

## Yanıt stili

Yanıt stili Lunannın kanaldaki güncel aktivitesine göre ağırlıklandırılır:

| Bağlam | messageReference | mentionRepliedUser | Ağırlık |
|----------|-----------------|-------------------|-------|
| Soğuk | true | false | %70 |
| Soğuk | true | true | %20 |
| Soğuk | false | false | %10 |
| Aktif | true | false | %50 |
| Aktif | true | true | %15 |
| Aktif | false | false | %30 |
| Aktif | false | true | %5 |

DMde `messageReference` hep `false`tur.

---

## Patlama mesajlar

%15 şansla yanıt insani ritimde gönderilen 2-3 parçaya bölünür (parçalar arası 1,5-4 saniye). Birkaç seferde yazan birini simüle eder.

![Zamanlama Gantt: gecikmeler, tepkiler, LLM akışı ve düzeltmeler için gerçek bekleme süreleri](/images/luna-protocol/21-timing-gantt.svg)

---

## Dinamik durum

Lunannın Discord durumu yapılandırılmış birkaç hazır durum arasında döner, her 15 dakikada. Desteklenen türler: Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). Uyurken durum `invisible` geçer.

```yaml
dynamic_status_presets:
  - status: online
    text: "avec les pixels"
    type: 0       # Playing
  - status: idle
    text: "du bruit blanc"
    type: 2       # Listening
```

Öngörülebilir rotasyonlardan kaçınmak için rastgele jitter (×0,5-1,0). Tekrarı önlemek için girişimlerin %10u atlanır.

## Yazıyor göstergesi

LLMyi çağırmadan önce Luna `startTyping()` çağırır. `setInterval`, üretim boyunca göstergeyi her 8 saniyede yeniler. `finally` içinde temizlenir (`clearInterval`).

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

## Crash sonrası kurtarma

LLM crashlerse (`llama-server` süreci ölür) Luna olayı `llmBus.emit("crash", code)` üzerinden tespit eder ve üstel backoff ile yeniden başlatmayı dener. Sonsuz yeniden başlatma döngülerinden kaçınır.

## LLM parametreleri

Parametreler `src/config.ts` içinde sabit kodlanmıştır:

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

ChatML şablonu (`<|im_start|>/<|im_end|>`) kullanılır. Thread sayısı `os.cpus().length` ile otomatik tespit edilir.

---

## Kurulum

```bash
npm install
cp config.example.yml config.yml
# config.yml düzenle
npm run dev                    # geliştirme (hot reload)
npm run build && npm start     # üretim
```

| Script | Açıklama |
|--------|-------------|
| `build` | Bağımsız CLI paketi |
| `start` | Botu çalıştırır |
| `lint` / `format` / `check` | Biome |
| `test` | Testler (Bun) |
| `download-model` | HuggingFaceden GGUF |
| `diagrams` | Mermaid şemalarını SVG/PNG dışa aktarır |

### PM2 dağıtımı

```bash
./start.sh   # llm-server + llm-client PM2 altında çalıştırır
```

---

## Sonuç

Luna Protocol LLMli Discord botunun çok ötesine geçer. İnsani kusurları simüle eden eksiksiz bir **davranış sistemidir**: unutkanlıklar, yazım hataları, uyku, tereddütler, yorgunluk. Hepsi tipli olay veriyolu etrafında mimarilenmiş, her akışı belgeleyen 24 Mermaid şemasıyla.

Kod açık kaynaktır, veri kümesi herkese açıktır ve yapılandırma hot-reload yapılabilir. Konu ilgini çekerse koda dal: göründüğünden erişilebilir. Davranış üzerine birçok fikri test etmek için temel kullandım ve her modülü ayrı ayrı geri alabilirsin.

| Kaynak | Bağlantı |
|-----------|------|
| GitHub deposu | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Veri kümesi | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Haritası | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
