---
title: "Luna Protocol: Bir insanı simüle eden, kendi kendine yeten bir Discord botu yaptım"
description: "Luna Protocol, yerel bir LLM ile çalışan, tamamen otonom bir Discord botudur. Uyuma, yazım hatası yapma, tereddüt etme, unutma, konu yorgunluğu çekme ve kendiliğinden mesaj gönderme gibi doğal konuşma yeteneklerine sahiptir."
date: 2026-07-11
tags:
  - discord-bot
  - llm
  - typescript
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "1UcU0pBEZg+0KXNCTpdbyeBoxDb+UM5i/s+RicxIwXmyWnzuha2pHmgA+jOECs1lEDWV0ufyaMTp3eG8saqIKA=="
---

# Luna Protocol: Bir insanı simüle eden, kendi kendine yeten bir Discord botu yaptım

Ya bir Discord botu **uyuyabilse**, **yazım hatası yapabilse**, **tereddüt edebilse**, cevap vermeyi **unutabilse** ve bazen kendi isteğiyle size mesaj gönderebilseydi? **Luna Protocol** tam olarak bunu yapıyor: yerel bir LLM (llama.cpp) çalıştıran ve kusurlu bir insan gibi konuşan, tamamen otonom bir Discord botu.

Katı promptlar yok, robotik cevaplar yok. Luna'nın bir **öncelikli tetikleme sistemi**, **değişken gecikmeleri**, **uyku saatleri**, **kendiliğinden mesajları** ve hatta sesli mesaj göndermek için bir **TTS hattı** var. Tamamı hot-reload destekli basit bir `config.yml` dosyasıyla yapılandırılır.

Bu yazıda, genel olay bus'ından TTS hattına, tetikleme sisteminden insan benzeri bileşenlere ve fine-tuning veri setine kadar tüm mimariyi ayrıntılı olarak inceliyoruz.

![Genel Mimari -- bileşenler ve veri akışı](/images/luna-protocol/01-architecture-overview.svg)

---

## Mimari: tipli bir olay bus'ı

Luna'nın kalbinde **TypedBus** -- TypeScript'te güçlü tipli, genel bir olay bus'ı bulunur. Her şeyin üzerine inşa edildiği temel yapı taşıdır.

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

Bundan iki ana bus türetilmiştir:

- **`llmBus`** -- LLM token'larını, hataları, çökmeleri, sıfırlamaları yönetir
- **`stateBus`** -- otomatik kalıcılıkla durum değişikliklerini yönetir

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

Bu yaklaşımın avantajı: her modül diğerlerinden **bağımsızdır**. LLM bus üzerinden token'ları yayar, bot bunları tüketir, durum otomatik olarak güncellenir. Döngüsel bağımlılık yoktur.

---

![Mesaj İşleme -- bir mesajın tam işlem akışı](/images/luna-protocol/02-message-processing.svg)

## Tetikleme sistemi: Luna'nın ne zaman cevap vereceğine kim karar veriyor?

Gelen her mesaj, bir tetikleme nedeni döndüren `evaluateMessage()` tarafından değerlendirilir. Öncelik sırası kritiktir:

| # | Neden | Koşullar | Yoksaymayı atla | Duraklatmayı atla |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | Evet (%0) | Evet |
| 2 | `dm` | `replyInDM = true` ile ÖM | Evet (%0) | Hayır |
| 3 | `name` | "Luna"/"Pixie"/takma ad (tam kelime) | Hayır (%8) | Hayır |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (tam kelime) | Hayır (%8) | Hayır |
| 5 | `follow-up` | Bot son konuşmacıydı + < 15sn + < 3 / 60sn | -- | -- |
| 6 | `random` | Eşleşmeyen mesajlarda %1.5 şans | Hayır (%8) | Hayır |

Eşleştirme **tam kelime** (`\b`) esasına dayanır: "ai", "mais", "vrai", "lait" ile eşleşmez.

![Tetikleme değerlendirmesi -- her mesaj için giriş kararı](/images/luna-protocol/03-trigger-evaluation.svg)

### Follow-up mekanizması

Luna bir mesaja cevap verdiğinde, kendini `lastSpeaker` olarak kaydeder. Sonraki 15 saniye içinde gelen her mesaj **anında** bir cevap tetikler -- zamanlayıcı yok, anahtar kelime kontrolü yok. Bütçe: 60 saniyelik pencere başına 3 follow-up.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### Bekleme süresi

Aynı kanalda iki cevap arasında 8 saniye. Bahsedilmeler ve follow-up'lar tarafından atlanır.

---

## İnsan benzeri davranışlar: değişken konsantrasyon

Luna'nın ilginçleştiği yer burasıdır. Her tetikleme türünün kendi **konsantrasyon eşikleri** vardır: min/maks gecikme, yoksayma şansı ve tepki verme şansı.

| Tetikleyici | Min gecikme | Maks gecikme | Yoksay | Tepki |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | %0 | %8 |
| `dm` | 400ms | 1800ms | %0 | %5 |
| `name` | 800ms | 4000ms | %5 | %6 |
| `keyword` | 1000ms | 3500ms | %8 | %4 |
| `follow-up` | 500ms | 2000ms | %0 | %3 |
| `random` | 1500ms | 5000ms | %15 | %2 |

Gecikme hesaplaması ayrıca şunları da dikkate alır:
- **Mesaj uzunluğu**: mesaj ne kadar uzunsa, Luna'nın "okuması" o kadar uzun sürer
- **Hareketlilik**: Luna 10 dakikadır aktif değilse, gecikme 2 ile çarpılır ("uyanma" simülasyonu)
- **Uyku**: `slow` modunda, gecikme 3 ila 5 ile çarpılır

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

Luna uyuyabilir. `config.yml` ile yapılandırılabilir:

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
| `sleep` | Yalnızca bahsedilmeler ve ÖM geçer |
| `slow` | Gecikme ×3-5, tepkiler neredeyse sıfır |
| `short` | Yoksayma şansı +%30, tepkiler neredeyse sıfır |

Uyku saatlerinde Discord durumu `invisible` olarak değişir.

---

## Yazım hataları

Luna yazım hatası yapabilir -- ve 2-4 saniye sonra düzeltebilir. Klavye düzeni yapılandırılabilir (AZERTY veya QWERTY).

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

## Tereddütler ve unutmalar

**Tereddütler**: Bir dolgu kelimesiyle (`uh...`, `um...`, `well...`, `hmm...`, `so...`) başlama şansı %15.

**Unutmalar**: Bir tetikleyiciyi eşleştirdikten sonra bile, Luna %3 olasılıkla cevap vermeyi "unutabilir". Mesaj yok, tepki yok -- hiçbir şey görmemiş gibi.

**Konu yorgunluğu**: Bir kelime son 10 mesajda çok sık tekrarlanırsa (eşik: 3 tekrar), gecikmeler çarpılır ve yoksayma şansı %15 artar.

---

## Pratikte gerçekçilik: iş ürpertici hale geldiğinde

Kağıt üzerinde, tüm bu sistemler (gecikmeler, yazım hataları, tereddütler, unutkanlık) bir gimmick gibi görünür. Pratikte ise, hepsi bir araya geldiğinde sonuç şaşırtıcıdır -- öyle ki Luna ile konuşan insanlar hiçbir şeyden şüphelenmez. İşte birinin Luna'ya doğrudan bot olup olmadığını sorduğu, ardından sohbetin tamamen başka bir konuya ürkütücü bir doğallıkla kaydığı gerçek bir alışveriş.

![Luna ile Discord sohbeti -- ilk kısım](/images/luna-protocol/realism/realism-01.png)

Ton, tereddütler, yanıt temposu -- hiçbir şey bot olduğunu ele vermiyor. Luna, karakterinden hiç çıkmadan yaş sorusunu ustaca geçiştiriyor.

Sohbet tamamen doğal bir şekilde devam ediyor, kısa ve insana özgü yanıtlarla ("okay, okay", "yay", "yayy") -- tam olarak bir insanın Discord'da göndereceği türden mesajlar.

![Luna ile Discord sohbeti -- devamı](/images/luna-protocol/realism/realism-02.png)

![Luna ile Discord sohbeti -- konu kayması](/images/luna-protocol/realism/realism-03.png)

![Luna ile Discord sohbeti -- konu kayması devam ediyor](/images/luna-protocol/realism/realism-04.png)

![Luna ile Discord sohbeti -- sohbetin sonu](/images/luna-protocol/realism/realism-05.png)

Ürkütücü olan şey sadece Luna'nın "yanıt vermesi" değil -- görünürde fikirleri, takip sorularıyla ve mesajdan mesaja tutarlı bir düşünce akışıyla **bir sohbeti sürdürebilmesi**. Yukarıda anlatılan tetikleyici sistemi, odaklanma gecikmeleri ve tereddütler olmadan bu illüzyon birkaç mesaj içinde çökerdi.

**Küçük bir sürpriz**: yukarıdaki ekran görüntülerinde, **konuşan iki hesap da Luna'nın örnekleri**. `PixieGlow` ve `Sujet d'SBlow`, bir botu test eden bir insan değil -- birbiriyle konuşan iki bot, her biri (davranışsal anlamda) "normal" biriyle sohbet ettiğine "ikna olmuş" durumda. Eğer yukarıdaki alışverişi okurken ikisinden birinin insan olduğunu düşündüyseniz, tebrikler -- gerçek bir Discord sunucusunda herkesin düşeceği tuzağa tam olarak siz de düştünüz.

Bu aslında **ölü internet teorisi**nin pratikteki bir versiyonu gibi: bu teori (aslen oldukça komplo teorisi sayılan bir fikir) çevrimiçi içerik ve etkileşimlerin giderek artan bir kısmının insanlar yerine botlar tarafından üretildiğini, öyle ki "gerçek" insan internetinin azınlıkta kaldığını öne sürer. Uzun süre abartılı bulunan bu teori, Luna Protocol gibi sistemlerin büyük ölçekte inandırıcı bir insan varlığını simüle etmek için ne çok fazla işlem gücüne ne de dev bir modele ihtiyaç olmadığını göstermesiyle giderek daha az saçma görünüyor. Aynı botun iki örneğinin kendini hiç ele vermeden uzun bir sohbeti sürdürebilmesi, birbiriyle konuşan botlarla dolu bir web'in nasıl görünebileceğine dair oldukça somut bir fikir veriyor.

---

## LLM hattı: iki mod

### `direct` modu (varsayılan)

Bot, istekleri doğrudan HTTP üzerinden yerel bir `llama-server`'a gönderir. Model paylaşılır, prompt önbelleği ve 4 eşzamanlı slot ile. İki PM2 süreci: LLM sunucusu ve bot istemcisi.

### `online` modu

Bot, OpenAI uyumlu herhangi bir API'yi çağırır (OpenAI, OpenRouter, Groq, Together...). Yerel LLM gerekmez.

### Gerçek zamanlı akış

LLM, cevabını satır satır (`\n`) akışla gönderir. Her satır kelimelere ayrılır ve `llmBus.emit("token", word)` ile tek tek yayınlanır. Her `\n`'de bir `flush` olayı yayınlanır -- bot birikmiş mesajı hemen gönderir. Simüle edilmiş gecikme yoktur: tempo LLM'nin kendisine aittir.

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

Kuyruk (`requestQueue`), istekleri tek tek işler ve kuyruk 100 öğeyi aştığında otomatik temizlik yapar.

---

## Kendiliğinden mesajlar

Her 5 dakikada bir, %12 olasılıkla Luna kendi isteğiyle bir mesaj gönderir. Sunucu, **doğrusal ağırlık** sistemiyle seçilir: en aktif sunucunun, son sunucuya göre N kat daha fazla şansı vardır.

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

Son 5 mesajın bağlamı okunur ve Luna konuşmaya "doğal olarak" katılır.

---

## TTS hattı: sesli mesajlar

%8 olasılıkla Luna, metin yerine sesli mesaj gönderir. Tam hat:

1. **Piper TTS** metni WAV'a sentezler
2. **ffmpeg** OGG'ye dönüştürür
3. Discord önizlemesi için dalga formu hesaplanır
4. Dosya Discord CDN API'si üzerinden yüklenir
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

![TTS Hattı -- sentezlenen metinden Discord sesli mesajına](/images/luna-protocol/10-tts-pipeline.svg)

---

## Anti-spam ve kalıcılık

### Anti-spam

`channelId:userId` bazında kuyruk. Kanal başına kullanıcı başına yalnızca bir mesaj kuyruğa alınır. Devam eden cevap bittiğinde işlenir.

### Oturum limitleri

8 etkileşimden sonra Luna 30 saniyelik bir mola verir. Sayaç, 3 dakikalık hareketsizlikten sonra sıfırlanır.

### Otomatik kalıcılık

Her durum değişikliği `stateBus` üzerinden yayınlanır → otomatik kaydetme (debounce 500ms). Artık manuel `saveAllState()` çağrılarına gerek yoktur. Kalıcı durum şunları içerir: pendingMessages, paused, cooldowns, timestamps, lastSpeaker, follow-up sayaçları.

---

## Hot-reload yapılandırma

Tek bir `config.yml` dosyası. Değerlerin çoğu **hot-reload edilebilir** -- değişiklikler yeniden başlatma gerektirmeden uygulanır.

| Kategori | Hot-reload |
|-----------|-----------|
| Tetikleyiciler, anahtar kelimeler, isimler | ✅ |
| Konsantrasyon, gecikmeler | ✅ |
| Yazım hataları, patlamalar, yorgunluk | ✅ |
| Uyku programları | ✅ |
| TTS, sesli mesajlar | ✅ |
| Discord token'ı, LLM modu | ❌ (yeniden başlatma gerekli) |

```typescript
// config.ts -- getter'lar canlı değerler döndürür
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## Veri seti: Discord-Dialogues

Model, [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) üzerinde fine-tune edilmiştir: **7.3M etkileşim**, **17M tur**, **140M kelime**. 2025 ilkbahar-yaz döneminden gerçek Discord konuşmaları, filtrelenmiş (PII, ToS, botlar, komutlar). Apache 2.0.

| Metrik | Değer |
|----------|--------|
| Örneklem | 7 303 464 |
| Toplam tur | 16 881 010 |
| Toplam kelime | 139 922 950 |
| Ortalama token | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

Kullanılan nicelenmiş model bir GGUF'tür (örneğin `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Discord-Dialogues veri seti dağılımı](/images/luna-protocol/dataset-distribution.svg)

---

![Tam Yaşam Döngüsü -- mesajdan cevaba kadar botun tüm davranışı, zamanlayıcılar ve uç durumlar dahil](/images/luna-protocol/22-complete-lifecycle.svg)

## Mimari diyagramları

`state-machines/` klasörü, kaynak kodun tamamını kapsayan **24 Mermaid diyagramı** içerir. Her diyagram, insan dilinde ayrıntılı bir açıklamaya sahiptir.

En önemlileri arasında:

| # | Diyagram | Tür |
|---|-----------|------|
| 01 | Mimari Genel Bakış | `graph` |
| 02 | Mesaj İşleme (tam) | `stateDiagram` |
| 03 | Tetikleme Değerlendirmesi | `flowchart` |
| 04 | LLM Çekirdek Kuyruğu (3 arka uç) | `stateDiagram` |
| 10 | TTS Hattı | `flowchart` |
| 13 | Durum Kalıcılığı | `flowchart` |
| 21 | Zamanlama Gantt'ı | `gantt` |
| 22 | Tam Yaşam Döngüsü | `stateDiagram` |

Bu diyagramlar, gelen mesajdan cevaba, zamanlayıcılar ve uç durumlar dahil olmak üzere tüm akışı anlamak için bir altın madenidir.

---

## Tetikleme kodunun detaylı incelenmesi

Tetikleyici, `state/trigger.ts` içindeki `evaluateMessage()` tarafından değerlendirilir. İşte tam mantık:

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

  // ... isim, anahtar kelime, follow-up, rastgele eşleştirme
}
```

Regex önbelleği (`hasWordCache`), desenlerin her mesajda yeniden derlenmesini önler.

---

## Tepkiler

Luna, mesajlara emojilerle tepki verir. %30 olasılıkla sunucudan özel bir emoji, %70 olasılıkla unicode emoji kullanır. Tepki, konsantrasyon gecikmesinden sonra tetiklenir, hemen değil.

Luna'nın mesajlarındaki tepki komutları:
- ❌ → Durdur
- ▶️ → Başlat
- 🗑️ → Temizle

---

## Cevap stili

Cevap stili, Luna'nın kanaldaki son aktivitesine göre ağırlıklandırılır:

| Bağlam | messageReference | mentionRepliedUser | Ağırlık |
|----------|-----------------|-------------------|-------|
| Soğuk | true | false | %70 |
| Soğuk | true | true | %20 |
| Soğuk | false | false | %10 |
| Aktif | true | false | %50 |
| Aktif | true | true | %15 |
| Aktif | false | false | %30 |
| Aktif | false | true | %5 |

ÖM'de `messageReference` her zaman `false`'tur.

---

## Patlama mesajları

%15 olasılıkla, bir cevap insan temposunda (her parça arasında 1.5-4 saniye) gönderilen 2-3 parçaya bölünür. Birinin birkaç seferde yazmasını simüle eder.

![Zamanlama Gantt'ı -- gecikmeler, tepkiler, LLM akışı ve düzeltmeler için gerçek bekleme süreleri](/images/luna-protocol/21-timing-gantt.svg)

---

## Dinamik durum

Luna'nın Discord durumu, yapılandırılmış birkaç preset arasında geçiş yaparak her 15 dakikada bir değişir. Desteklenen türler: Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). Uyku sırasında durum `invisible` olur.

```yaml
dynamic_status_presets:
  - status: online
    text: "piksellerle oynuyor"
    type: 0       # Playing
  - status: idle
    text: "beyaz gürültü"
    type: 2       # Listening
```

Rastgele bir jitter (×0.5-1.0) öngörülebilir dönüşleri önler. Tekrarı önlemek için denemelerin %10'u atlanır.

## Yazıyor göstergesi

LLM'i çağırmadan önce Luna `startTyping()` işlevini çağırır. Bir `setInterval`, üretim sırasında yazıyor göstergesini her 8 saniyede bir yeniler. `finally` bloğunda temizlenir (`clearInterval`).

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

## Çökme sonrası kurtarma

LLM çökerse (`llama-server` süreci ölürse), Luna `llmBus.emit("crash", code)` aracılığıyla olayı algılar ve üstel geri çekilme ile yeniden başlatmayı dener. Sonsuz yeniden başlatma döngülerini önler.

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

ChatML şablonu (`<|im_start|>/<|im_end|>`) kullanılır. İş parçacığı sayısı `os.cpus().length` ile otomatik algılanır.

---

## Kurulum

```bash
npm install
cp config.example.yml config.yml
# config.yml'yi düzenleyin
npm run dev                    # geliştirme (hot reload)
npm run build && npm start     # üretim
```

| Script | Açıklama |
|--------|-------------|
| `build` | Bağımsız CLI paketi oluşturur |
| `start` | Botu başlatır |
| `lint` / `format` / `check` | Biome |
| `test` | Testler (Bun) |
| `download-model` | HuggingFace'den GGUF |
| `diagrams` | Mermaid diyagramlarını SVG/PNG'ye aktarır |

### PM2 dağıtımı

```bash
./start.sh   # PM2 altında llm-server + llm-client başlatır
```

---

## Sonuç

Luna Protocol, sadece LLM'li bir Discord botu değildir. İnsan kusurlarını simüle eden **eksiksiz bir davranışsal sistemdir**: unutmalar, yazım hataları, uyku, tereddütler, yorgunluk. Tümü, her akışı belgeleyen 24 Mermaid diyagramıyla, tipli bir olay bus'ı etrafında yapılandırılmıştır.

Kod açık kaynaktır, veri seti herkese açıktır ve yapılandırma hot-reload edilebilir. Konu ilginizi çekiyorsa, koda dalın -- göründüğünden daha erişilebilirdir.

| Kaynak | Bağlantı |
|-----------|------|
| GitHub Deposu | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Veri Seti | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Haritası | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
