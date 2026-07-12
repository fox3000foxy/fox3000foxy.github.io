---
title: "Luna Protocol : मैंने एक पूरी तरह से स्वायत्त Discord बॉट बनाया जो एक इंसान का अनुकरण करता है"
description: "Luna Protocol एक पूरी तरह से स्वायत्त Discord बॉट है जिसमें स्थानीय LLM है, जो नींद, टाइपिंग गलतियाँ, हिचकिचाहट, भूलने की आदत, विषयगत थकान और स्वतःस्फूर्त संदेशों के साथ स्वाभाविक बातचीत करने में सक्षम है।"
date: 2026-07-11
tags:
  - discord-bot
  - llm
  - typescript
  - event-driven-architecture
  - artificial-intelligence
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "RPnZi4ePDBMLaWy5zfhqCJpDHROGmFIzzYMHisXKpun7d4/24hvYsj+M38e0FwCxiCrc+u7jv7gpG1BLIIgtGg=="
---

# Luna Protocol : मैंने एक पूरी तरह से स्वायत्त Discord बॉट बनाया जो एक इंसान का अनुकरण करता है

क्या होगा अगर कोई Discord बॉट **सो** सके, **टाइपिंग गलतियाँ** कर सके, **हिचकिचा** सके, जवाब देना **भूल** सके, और कभी-कभी अपनी मर्जी से आपको संदेश भेज सके? यही बिल्कुल **Luna Protocol** करता है : एक पूरी तरह से स्वायत्त Discord बॉट जो स्थानीय LLM (llama.cpp) चलाता है और एक अपूर्ण इंसान की तरह बातचीत करता है।

कोई कठोर प्रॉम्प्ट नहीं, कोई रोबोटिक जवाब नहीं। Luna के पास **प्राथमिकता ट्रिगर सिस्टम**, **परिवर्तनशील विलंब**, **सोने का शेड्यूल**, **स्वतःस्फूर्त संदेश**, और यहाँ तक कि वॉइस संदेश भेजने के लिए **TTS पाइपलाइन** है। यह सब एक साधारण `config.yml` फ़ाइल के माध्यम से कॉन्फ़िगर किया गया है जो हॉट-रिलोडेबल है।

इस लेख में, हम पूरी आर्किटेक्चर का विश्लेषण करेंगे : जेनेरिक इवेंट बस से लेकर TTS पाइपलाइन तक, ट्रिगर सिस्टम, मानवीय व्यवहार घटक, और फ़ाइन-ट्यूनिंग डेटासेट।

![आर्किटेक्चर ओवरव्यू -- वैश्विक घटक और डेटा प्रवाह](/images/luna-protocol/01-architecture-overview.svg)

---

## आर्किटेक्चर : एक टाइप की गई इवेंट बस

Luna का हृदय एक **TypedBus** है -- TypeScript में एक मजबूती से टाइप की गई जेनेरिक इवेंट बस। यह मूलभूत ईंट है जिस पर सब कुछ टिका है।

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

इससे दो मुख्य बसें निकलती हैं :

- **`llmBus`** -- LLM टोकन, त्रुटियाँ, क्रैश, रीसेट को संभालता है
- **`stateBus`** -- स्वचालित पर्सिस्टेंस के साथ स्थिति परिवर्तनों को संभालता है

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

इस दृष्टिकोण का लाभ : प्रत्येक मॉड्यूल बाकी से **डिस्कनेक्टेड** है। LLM बस पर टोकन उत्सर्जित करता है, बॉट उन्हें उपभोग करता है, स्थिति अपने आप अपडेट हो जाती है। कोई चक्रीय निर्भरता नहीं।

---

![संदेश प्रसंस्करण -- एक संदेश के प्रसंस्करण का पूरा प्रवाह](/images/luna-protocol/02-message-processing.svg)

## ट्रिगर सिस्टम : कौन तय करता है कि Luna कब जवाब दे?

प्रत्येक आने वाले संदेश का मूल्यांकन `evaluateMessage()` द्वारा किया जाता है जो ट्रिगर कारण के साथ एक `TriggerResult` लौटाता है। प्राथमिकता क्रम महत्वपूर्ण है :

| # | कारण | शर्तें | Bypass ignore | Bypass pause |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | हाँ (0%) | हाँ |
| 2 | `dm` | `replyInDM = true` के साथ DM | हाँ (0%) | नहीं |
| 3 | `name` | "Luna"/"Pixie"/उपनाम (पूरा शब्द) | नहीं (8%) | नहीं |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (पूरा शब्द) | नहीं (8%) | नहीं |
| 5 | `follow-up` | बॉट अंतिम वक्ता था + < 15s + < 3 / 60s | -- | -- |
| 6 | `random` | असंबंधित संदेशों पर 1.5% संभावना | नहीं (8%) | नहीं |

मैचिंग **पूरे शब्द** (`\b`) पर होती है : "ai" "mais", "vrai", "lait" से मेल नहीं खाता।

![ट्रिगर मूल्यांकन -- प्रत्येक संदेश के लिए प्रवेश निर्णय](/images/luna-protocol/03-trigger-evaluation.svg)

### फ़ॉलो-अप तंत्र

जब Luna किसी संदेश का जवाब देती है, तो वह स्वयं को `lastSpeaker` के रूप में पंजीकृत करती है। 15 सेकंड के भीतर कोई भी अगला संदेश **तत्काल** प्रतिक्रिया ट्रिगर करता है -- कोई टाइमर नहीं, कोई कीवर्ड जाँच नहीं। बजट : 60 सेकंड की विंडो में 3 फ़ॉलो-अप।

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### कूलडाउन

एक ही चैनल में दो प्रतिक्रियाओं के बीच 8 सेकंड। मेंशन और फ़ॉलो-अप द्वारा इसे दरकिनार किया जाता है।

---

## मानवीय व्यवहार : परिवर्तनशील एकाग्रता

यहाँ Luna दिलचस्प हो जाती है। प्रत्येक ट्रिगर प्रकार की अपनी **एकाग्रता सीमाएँ** होती हैं : न्यूनतम/अधिकतम विलंब, अनदेखा करने की संभावना, और प्रतिक्रिया करने की संभावना।

| ट्रिगर | न्यूनतम विलंब | अधिकतम विलंब | अनदेखा | प्रतिक्रिया |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

विलंब की गणना इन्हें भी ध्यान में रखती है :
- **संदेश की लंबाई** : संदेश जितना लंबा, Luna को "पढ़ने" में उतना ही अधिक समय
- **निष्क्रियता** : यदि Luna 10 मिनट से सक्रिय नहीं है, तो विलंब 2 गुना हो जाता है ("जागने" का अनुकरण)
- **नींद** : `slow` मोड में, विलंब 3 से 5 गुना हो जाता है

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
  delay *= 0.5 + Math.random() * 1.5; // आक्रामक जिटर
  return delay;
}
```

---

## सोने का शेड्यूल

Luna सो सकती है। `config.yml` के माध्यम से कॉन्फ़िगरेबल :

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

| मोड | प्रभाव |
|------|-------|
| `sleep` | केवल मेंशन और DM ही गुज़रते हैं |
| `slow` | विलंब ×3-5, प्रतिक्रियाएँ लगभग शून्य |
| `short` | अनदेखा करने की संभावना +30%, प्रतिक्रियाएँ लगभग शून्य |

सोने के घंटों के दौरान, Discord स्टेटस `invisible` हो जाता है।

---

## टाइपिंग गलतियाँ

Luna टाइपिंग गलतियाँ कर सकती है -- और उन्हें 2-4 सेकंड बाद सुधार सकती है। कीबोर्ड लेआउट कॉन्फ़िगरेबल है (AZERTY या QWERTY)।

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... सभी आसन्न कुंजियाँ
};
```

AZERTY उदाहरण : `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`।

तीन सुधार शैलियाँ :

| शैली | व्यवहार |
|-------|-------------|
| `edit` | संदेश को संपादित करता है |
| `message` | नया संदेश : `word*` |
| `mixed` | 50/50 यादृच्छिक (डिफ़ॉल्ट) |

---

## हिचकिचाहट और भूलने की आदत

**हिचकिचाहट** : 15% संभावना कि एक भराव शब्द से शुरू हो (`uh...`, `um...`, `well...`, `hmm...`, `so...`)।

**भूलने की आदत** : ट्रिगर मैच करने के बाद भी, Luna 3% संभावना के साथ जवाब देना "भूल" सकती है। कोई संदेश नहीं, कोई प्रतिक्रिया नहीं -- जैसे उसने कुछ देखा ही नहीं।

**विषयगत थकान** : यदि कोई शब्द पिछले 10 संदेशों में बहुत बार आता है (सीमा : 3 बार), तो विलंब गुणा हो जाता है और अनदेखा करने की संभावना 15% बढ़ जाती है।

---

## LLM पाइपलाइन : दो मोड

### `direct` मोड (डिफ़ॉल्ट)

बॉट सीधे HTTP पर स्थानीय `llama-server` को अनुरोध भेजता है। मॉडल साझा किया जाता है, जिसमें प्रॉम्प्ट कैश और 4 समवर्ती स्लॉट होते हैं। दो PM2 प्रक्रियाएँ : LLM सर्वर और बॉट क्लाइंट।

### `online` मोड

बॉट किसी भी OpenAI-संगत API (OpenAI, OpenRouter, Groq, Together...) को कॉल करता है। किसी स्थानीय LLM की आवश्यकता नहीं।

### रीयल-टाइम स्ट्रीमिंग

LLM अपना उत्तर पंक्ति दर पंक्ति (`\n`) स्ट्रीम करता है। प्रत्येक पंक्ति को शब्दों में विभाजित किया जाता है, एक-एक करके `llmBus.emit("token", word)` पर उत्सर्जित किया जाता है। प्रत्येक `\n` पर, एक `flush` इवेंट उत्सर्जित होता है -- बॉट तुरंत संचित संदेश भेजता है। कोई अनुकरण विलंब नहीं : गति LLM की है।

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

अनुरोध कतार (`requestQueue`) अनुरोधों को एक-एक करके संसाधित करती है, जब कतार 100 तत्वों से अधिक हो जाती है तो स्वचालित सफाई होती है।

---

## स्वतःस्फूर्त संदेश

हर 5 मिनट में, 12% संभावना कि Luna अपनी मर्जी से एक संदेश पोस्ट करे। सर्वर का चयन **रैखिक भार** प्रणाली द्वारा किया जाता है : सबसे सक्रिय सर्वर की संभावना अंतिम सर्वर से N× अधिक होती है।

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

पिछले 5 संदेशों का संदर्भ पढ़ा जाता है, और Luna "स्वाभाविक रूप से" बातचीत में शामिल होती है।

---

## TTS पाइपलाइन : वॉइस संदेश

8% संभावना के साथ, Luna टेक्स्ट के बजाय एक वॉइस संदेश भेजती है। पूरी पाइपलाइन :

1. **Piper TTS** टेक्स्ट को WAV में संश्लेषित करता है
2. **ffmpeg** OGG में परिवर्तित करता है
3. Discord पूर्वावलोकन के लिए वेवफ़ॉर्म की गणना की जाती है
4. फ़ाइल Discord CDN API के माध्यम से अपलोड की जाती है
5. वॉइस संदेश भेजा जाता है

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

![TTS पाइपलाइन -- संश्लेषित टेक्स्ट से Discord वॉइस संदेश तक](/images/luna-protocol/10-tts-pipeline.svg)

---

## एंटी-स्पैम और पर्सिस्टेंस

### एंटी-स्पैम

`channelId:userId` द्वारा कतार। प्रति उपयोगकर्ता प्रति चैनल केवल एक संदेश कतार में। जैसे ही वर्तमान उत्तर समाप्त होता है, संसाधित होता है।

### सत्र सीमाएँ

8 आदान-प्रदान के बाद, Luna 30 सेकंड का ब्रेक लेती है। 3 मिनट की निष्क्रियता के बाद काउंटर रीसेट हो जाता है।

### स्वचालित पर्सिस्टेंस

प्रत्येक स्थिति परिवर्तन `stateBus` पर उत्सर्जित होता है -- स्वचालित सहेज (debounce 500ms)। मैन्युअल `saveAllState()` कॉल की कोई आवश्यकता नहीं। संग्रहीत स्थिति में शामिल हैं : pendingMessages, paused, cooldowns, timestamps, lastSpeaker, फ़ॉलो-अप काउंटर।

---

## हॉट-रिलोड कॉन्फ़िगरेशन

एक ही `config.yml` फ़ाइल। अधिकांश मान **हॉट-रिलोडेबल** हैं -- परिवर्तन बिना पुनरारंभ के प्रभावी होते हैं।

| श्रेणी | हॉट-रिलोड |
|-----------|-----------|
| ट्रिगर, कीवर्ड, नाम | ✅ |
| एकाग्रता, विलंब | ✅ |
| टाइपो, बर्स्ट, थकान | ✅ |
| नींद शेड्यूल | ✅ |
| TTS, वॉइस संदेश | ✅ |
| Discord टोकन, LLM मोड | ❌ (पुनरारंभ आवश्यक) |

```typescript
// config.ts -- गेटर्स लाइव मान लौटाते हैं
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## डेटासेट : Discord-Dialogues

मॉडल को [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) पर फ़ाइन-ट्यून किया गया है : **7.3M आदान-प्रदान**, **17M टर्न**, **140M शब्द**। 2025 के वसंत-ग्रीष्म की वास्तविक Discord बातचीत, फ़िल्टर की गई (PII, ToS, बॉट, कमांड)। Apache 2.0।

| मीट्रिक | मान |
|----------|--------|
| नमूने | 7 303 464 |
| कुल टर्न | 16 881 010 |
| कुल शब्द | 139 922 950 |
| औसत टोकन | 32.8 |
| टोकनाइज़र | Hermes-3-Llama-3.1-8B |

उपयोग किया गया क्वांटाइज़्ड मॉडल एक GGUF है (उदाहरण `Discord-Hermes-3-8B.Q3_K_M.gguf`)।

![Discord-Dialogues डेटासेट वितरण](/images/luna-protocol/dataset-distribution.svg)

---

![पूर्ण जीवनचक्र -- संदेश से उत्तर तक बॉट का पूरा व्यवहार, जिसमें टाइमर और सीमा मामले शामिल हैं](/images/luna-protocol/22-complete-lifecycle.svg)

## आर्किटेक्चर आरेख

`state-machines/` फ़ोल्डर में **24 Mermaid आरेख** हैं जो पूरे स्रोत कोड को कवर करते हैं। प्रत्येक आरेख में मानव भाषा में विस्तृत व्याख्या है।

सबसे महत्वपूर्ण में से :

| # | आरेख | प्रकार |
|---|-----------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (पूर्ण) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 बैकएंड) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

ये आरेख पूरे प्रवाह को समझने के लिए एक सोने की खान हैं : आने वाले संदेश से उत्तर तक, जिसमें टाइमर और सीमा मामले शामिल हैं।

---

## ट्रिगर कोड विस्तार से

ट्रिगर का मूल्यांकन `state/trigger.ts` में `evaluateMessage()` द्वारा किया जाता है। यहाँ पूरा तर्क है :

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

  // ... नाम, कीवर्ड, फ़ॉलो-अप, रैंडम द्वारा मैचिंग
}
```

रेगेक्स कैश (`hasWordCache`) प्रत्येक संदेश पर पैटर्न को पुनः संकलित करने से बचाता है।

---

## प्रतिक्रियाएँ

Luna इमोजी के साथ संदेशों पर प्रतिक्रिया करती है। 30% संभावना सर्वर के कस्टम इमोजी का उपयोग करने की, 70% यूनिकोड इमोजी का। प्रतिक्रिया तुरंत नहीं, बल्कि एकाग्रता विलंब के बाद ट्रिगर होती है।

Luna के संदेशों पर प्रतिक्रिया कमांड :
- ❌ स्टॉप
- ▶️ स्टार्ट
- 🗑️ क्लियर

---

## उत्तर शैली

उत्तर शैली चैनल में Luna की हालिया गतिविधि के अनुसार भारित होती है :

| संदर्भ | messageReference | mentionRepliedUser | भार |
|----------|-----------------|-------------------|-------|
| ठंडा | true | false | 70% |
| ठंडा | true | true | 20% |
| ठंडा | false | false | 10% |
| सक्रिय | true | false | 50% |
| सक्रिय | true | true | 15% |
| सक्रिय | false | false | 30% |
| सक्रिय | false | true | 5% |

DM में, `messageReference` हमेशा `false` होता है।

---

## बर्स्ट संदेश

15% संभावना के साथ, एक उत्तर 2-3 टुकड़ों में विभाजित होता है जो मानव गति से भेजे जाते हैं (प्रत्येक टुकड़े के बीच 1.5-4 सेकंड)। किसी ऐसे व्यक्ति का अनुकरण करता है जो कई बार में टाइप करता है।

![Timing Gantt -- विलंब, प्रतिक्रियाओं, LLM स्ट्रीमिंग और सुधारों के लिए वास्तविक प्रतीक्षा समय](/images/luna-protocol/21-timing-gantt.svg)

---

## गतिशील स्टेटस

Luna का Discord स्टेटस कई कॉन्फ़िगर किए गए प्रीसेट के बीच बदलता रहता है, हर 15 मिनट में घूमता है। समर्थित प्रकार : Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5)। नींद के दौरान, स्टेटस `invisible` हो जाता है।

```yaml
dynamic_status_presets:
  - status: online
    text: "पिक्सेल के साथ"
    type: 0       # Playing
  - status: idle
    text: "सफेद शोर"
    type: 2       # Listening
```

एक यादृच्छिक जिटर (×0.5-1.0) पूर्वानुमानित रोटेशन से बचाता है। पुनरावृत्ति से बचने के लिए 10% प्रयास छोड़ दिए जाते हैं।

## टाइपिंग संकेतक

LLM को कॉल करने से पहले, Luna `startTyping()` कॉल करती है। एक `setInterval` जनरेशन के दौरान हर 8 सेकंड में संकेतक को रीफ्रेश करता है। `finally` (`clearInterval`) में साफ किया जाता है।

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

## क्रैश के बाद रिकवरी

यदि LLM क्रैश होता है (`llama-server` प्रक्रिया मर जाती है), तो Luna `llmBus.emit("crash", code)` के माध्यम से इवेंट का पता लगाती है और घातीय बैकऑफ़ के साथ पुनरारंभ करने का प्रयास करती है। अनंत पुनरारंभ लूप से बचाती है।

## LLM पैरामीटर

पैरामीटर `src/config.ts` में हार्डकोडेड हैं :

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

ChatML टेम्पलेट (`<|im_start|>/<|im_end|>`) का उपयोग किया जाता है। थ्रेड्स की संख्या `os.cpus().length` के माध्यम से स्वचालित रूप से पता लगाई जाती है।

---

## सेटअप

```bash
npm install
cp config.example.yml config.yml
# config.yml संपादित करें
npm run dev                    # dev (hot reload)
npm run build && npm start     # production
```

| स्क्रिप्ट | विवरण |
|--------|-------------|
| `build` | स्टैंडअलोन CLI बंडल |
| `start` | बॉट लॉन्च करें |
| `lint` / `format` / `check` | Biome |
| `test` | परीक्षण (Bun) |
| `download-model` | HuggingFace से GGUF |
| `diagrams` | Mermaid आरेखों को SVG/PNG में निर्यात करें |

### PM2 डिप्लॉयमेंट

```bash
./start.sh   # PM2 के तहत llm-server + llm-client लॉन्च करें
```

---

## निष्कर्ष

Luna Protocol सिर्फ LLM वाला एक Discord बॉट नहीं है। यह एक **पूर्ण व्यवहार प्रणाली** है जो मानवीय अपूर्णताओं का अनुकरण करती है : भूलने की आदत, टाइपिंग गलतियाँ, नींद, हिचकिचाहट, थकान। यह सब एक टाइप की गई इवेंट बस के चारों ओर आर्किटेक्चर किया गया है, जिसमें प्रत्येक प्रवाह को दस्तावेज़ित करने वाले 24 Mermaid आरेख हैं।

कोड ओपन सोर्स है, डेटासेट सार्वजनिक है, और कॉन्फ़िगरेशन हॉट-रिलोडेबल है। यदि यह विषय आपको रुचिकर लगता है, तो कोड में गोता लगाएँ -- यह जितना लगता है उससे कहीं अधिक सुलभ है।

| संसाधन | लिंक |
|-----------|------|
| GitHub रिपॉज़िटरी | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| डेटासेट | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
