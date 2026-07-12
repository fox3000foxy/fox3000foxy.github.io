---
title: "Luna Protocol: मैंने एक स्वायत्त Discord बॉट बनाया जो इंसान की नकल करता है"
description: "Luna Protocol एक पूर्णतः स्वायत्त Discord बॉट है जिसमें स्थानीय LLM है, जो नींद, टाइपिंग गलतियाँ, हिचकिचाहट, भूलने, विषय-थकान और स्पॉन्टेनियस संदेशों के साथ प्राकृतिक बातचीत कर सकता है।"
date: 2026-07-11
tags:
  - discord-bot
  - llm
  - typescript
  - architecture-evenementielle
  - intelligence-artificielle
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "jeget+tzBVZQxF4ZF+xkctgZgRi62QBqoE4ASiJWMirpGsTrsf7EG8YFGHVbd+qaEK30bG5rmXpltKHDLiw5DQ=="
---

# Luna Protocol: मैंने एक स्वायत्त Discord बॉट बनाया जो इंसान की नकल करता है

अगर एक Discord बॉट **सो सकता**, **टाइपिंग गलतियाँ कर सकता**, **हिचकिचा सकता**, **जवाब देना भूल सकता**, और कभी-कभी अपनी ओर से आपको संदेश भेज सकता तो? यही **Luna Protocol** करता है: एक पूरी तरह से स्वायत्त Discord बॉट जो एक स्थानीय LLM (llama.cpp) चलाता है और एक अपूर्ण इंसान की तरह बातचीत करता है।

कठोर प्रॉम्प्ट नहीं, रोबोटिक उत्तर नहीं। Luna के पास एक **प्राथमिकता ट्रिगर सिस्टम**, **परिवर्तनशील विलंब**, **नींद का समय**, **स्वचालित संदेश**, और यहाँ तक कि वॉयस संदेश भेजने के लिए एक **TTS पाइपलाइन** भी है। सब कुछ एक साधारण हॉट-रीलोडेबल `config.yml` फ़ाइल के माध्यम से कॉन्फ़िगर किया जा सकता है।

इस लेख में, हम पूरी वास्तुकला को तोड़ते हैं: जेनेरिक इवेंट बस से लेकर TTS पाइपलाइन तक, ट्रिगर सिस्टम, मानव-जैसे व्यवहार, और फाइन-ट्यूनिंग डेटासेट तक।

![वास्तुकला अवलोकन -- वैश्विक घटक और डेटा प्रवाह](/images/luna-protocol/01-architecture-overview.svg)

---

## वास्तुकला: एक टाइप किया गया इवेंट बस

Luna के कोर में एक **TypedBus** है -- TypeScript में एक मजबूत रूप से टाइप किया गया जेनेरिक इवेंट बस। यह वह मूलभूत ब्लॉक है जिस पर सब कुछ निर्भर करता है।

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

इससे दो मुख्य बस निकलती हैं:

- **`llmBus`** -- LLM टोकन, त्रुटियाँ, क्रैश, रीसेट को संभालता है
- **`stateBus`** -- स्वचालित स्थायित्व के साथ स्थिति परिवर्तन को संभालता है

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

इस दृष्टिकोण का लाभ: प्रत्येक मॉड्यूल बाकी से **अलग** है। LLM बस पर टोकन उत्सर्जित करता है, बॉट उन्हें उपभोग करता है, और स्थिति स्वचालित रूप से अपडेट होती है। कोई चक्रीय निर्भरता नहीं है।

---

![संदेश प्रसंस्करण -- एक संदेश का पूर्ण प्रवाह](/images/luna-protocol/02-message-processing.svg)

## ट्रिगर सिस्टम: Luna कब जवाब देता है यह कौन तय करता है?

आने वाले प्रत्येक संदेश का `evaluateMessage()` द्वारा मूल्यांकन किया जाता है जो एक ट्रिगर कारण के साथ `TriggerResult` लौटाता है। प्राथमिकता क्रम महत्वपूर्ण है:

| # | कारण | शर्तें | Bypass ignore | Bypass pause |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | हाँ (0%) | हाँ |
| 2 | `dm` | `replyInDM = true` के साथ DM | हाँ (0%) | नहीं |
| 3 | `name` | "Luna"/"Pixie"/उपनाम (पूरा शब्द) | नहीं (8%) | नहीं |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (पूरा शब्द) | नहीं (8%) | नहीं |
| 5 | `follow-up` | बॉट अंतिम वक्ता था + < 15s + < 3 / 60s | -- | -- |
| 6 | `random` | गैर-मैचिंग संदेशों पर 1.5% संभावना | नहीं (8%) | नहीं |

मिलान **पूरा शब्द** (`\b`) के अनुसार होता है: "ai" का "mais", "vrai", "lait" से मिलान नहीं होता।

![ट्रिगर मूल्यांकन -- प्रत्येक संदेश के लिए प्रवेश निर्णय](/images/luna-protocol/03-trigger-evaluation.svg)

### फॉलो-अप मैकेनिज्म

जब Luna किसी संदेश का जवाब देता है, तो वह खुद को `lastSpeaker` के रूप में दर्ज करता है। 15 सेकंड के भीतर कोई भी बाद का संदेश **तत्काल** प्रतिक्रिया को ट्रिगर करता है -- कोई टाइमर नहीं, कोई कीवर्ड जाँच नहीं। बजट: 60-सेकंड विंडो में 3 फॉलो-अप।

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### कूलडाउन

एक ही चैनल में दो प्रतिक्रियाओं के बीच 8 सेकंड। मेंशन और फॉलो-अप से बाइपास।

---

## मानव व्यवहार: परिवर्तनशील एकाग्रता

यहीं पर Luna दिलचस्प हो जाता है। प्रत्येक ट्रिगर प्रकार की अपनी **एकाग्रता सीमा** होती है: न्यूनतम/अधिकतम विलंब, अनदेखा करने की संभावना, और प्रतिक्रिया की संभावना।

| ट्रिगर | न्यूनतम विलंब | अधिकतम विलंब | अनदेखा | प्रतिक्रिया |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

विलंब गणना में निम्नलिखित भी शामिल हैं:
- **संदेश की लंबाई** : संदेश जितना लंबा होगा, Luna को "पढ़ने" में उतना समय लगेगा
- **निष्क्रियता** : अगर Luna 10 मिनट से सक्रिय नहीं है, तो विलंब 2 गुना हो जाता है ("जागने" का सिमुलेशन)
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

## नींद का समय

Luna सो सकता है। `config.yml` के माध्यम से कॉन्फ़िगर करने योग्य:

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
| `sleep` | केवल मेंशन और DM पास होते हैं |
| `slow` | विलंब ×3-5, प्रतिक्रियाएँ लगभग शून्य |
| `short` | अनदेखा करने की संभावना +30%, प्रतिक्रियाएँ लगभग शून्य |

नींद के घंटों के दौरान, Discord स्थिति `invisible` में बदल जाती है।

---

## टाइपिंग गलतियाँ

Luna टाइपिंग गलतियाँ कर सकता है -- और उन्हें 2-4 सेकंड बाद ठीक कर सकता है। कीबोर्ड लेआउट कॉन्फ़िगर करने योग्य है (AZERTY या QWERTY)।

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... सभी आसन्न कुंजियाँ
};
```

उदाहरण AZERTY : `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`।

तीन सुधार शैलियाँ:

| शैली | व्यवहार |
|-------|-------------|
| `edit` | संदेश संपादित करता है |
| `message` | नया संदेश : `word*` |
| `mixed` | 50/50 यादृच्छिक (डिफ़ॉल्ट) |

---

## हिचकिचाहट और भूलने की प्रवृत्ति

**हिचकिचाहट** : 15% संभावना कि भराव शब्द से शुरू हो (`uh...`, `um...`, `well...`, `hmm...`, `so...`)।

**भूलना** : ट्रिगर मिलान के बाद भी, Luna 3% संभावना से जवाब देना "भूल" सकता है। कोई संदेश नहीं, कोई प्रतिक्रिया नहीं -- जैसे उसने कुछ देखा ही न हो।

**विषय-थकान** : अगर पिछले 10 संदेशों में कोई शब्द बहुत बार आता है (सीमा: 3 घटनाएँ), तो विलंब गुना हो जाता है और अनदेखा करने की संभावना 15% बढ़ जाती है।

---

## LLM पाइपलाइन: दो मोड

### `direct` मोड (डिफ़ॉल्ट)

बॉट सीधे एक स्थानीय `llama-server` को HTTP पर अनुरोध भेजता है। मॉडल साझा है, प्रॉम्प्ट कैश और 4 समवर्ती स्लॉट्स के साथ। दो PM2 प्रक्रियाएँ: LLM सर्वर और बॉट क्लाइंट।

### `online` मोड

बॉट किसी भी OpenAI-संगत API को कॉल करता है (OpenAI, OpenRouter, Groq, Together...)। कोई स्थानीय LLM आवश्यक नहीं।

### रियल-टाइम स्ट्रीमिंग

LLM अपनी प्रतिक्रिया पंक्ति दर पंक्ति (`\n`) स्ट्रीम करता है। प्रत्येक पंक्ति को शब्दों में विभाजित किया जाता है, `llmBus.emit("token", word)` पर एक-एक करके उत्सर्जित किया जाता है। प्रत्येक `\n` पर, एक `flush` इवेंट उत्सर्जित होता है -- बॉट संचित संदेश तुरंत भेज देता है। कोई विलंब सिमुलेशन नहीं: लय LLM की है।

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

कतार (`requestQueue`) अनुरोधों को एक-एक करके संसाधित करती है, और जब कतार 100 तत्वों से अधिक हो जाती है तो स्वचालित सफाई होती है。

---

## स्वतः संदेश

हर 5 मिनट में, 12% संभावना है कि Luna स्वयं एक संदेश पोस्ट करेगा। सर्वर एक **रैखिक भार** प्रणाली का उपयोग करके चुना जाता है: सबसे सक्रिय सर्वर के पास सबसे कम सक्रिय सर्वर की तुलना में N गुना अधिक संभावना है।

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

पिछले 5 संदेशों का संदर्भ पढ़ा जाता है, और Luna "प्राकृतिक रूप से" बातचीत में शामिल होता है。

---

## TTS पाइपलाइन: वॉयस संदेश

8% संभावना से, Luna पाठ के बजाय एक वॉयस संदेश भेजता है। पूरी पाइपलाइन:

1. **Piper TTS** पाठ को WAV में संश्लेषित करता है
2. **ffmpeg** को OGG में बदलता है
3. Discord पूर्वावलोकन के लिए वेवफॉर्म की गणना की जाती है
4. फ़ाइल Discord CDN API के माध्यम से अपलोड की जाती है
5. वॉयस संदेश भेजा जाता है

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

![TTS पाइपलाइन -- संश्लेषित पाठ से Discord वॉयस संदेश तक](/images/luna-protocol/10-tts-pipeline.svg)

---

## स्पैम-रोधी और स्थायित्व

### स्पैम-रोधी

`channelId:userId` अनुसार कतार। प्रति उपयोगकर्ता प्रति चैनल कतार में केवल एक संदेश। वर्तमान प्रतिक्रिया समाप्त होते ही संसाधित।

### सत्र सीमाएँ

8 विनिमय के बाद, Luna 30 सेकंड का ब्रेक लेता है। काउंटर 3 मिनट की निष्क्रियता के बाद रीसेट होता है।

### स्वचालित स्थायित्व

प्रत्येक स्थिति परिवर्तन `stateBus` पर उत्सर्जित होता है → स्वचालित सहेजना (500ms डिबाउंस)। अब मैनुअल `saveAllState()` कॉल की आवश्यकता नहीं है। स्थायी स्थिति में शामिल हैं: pendingMessages, paused, cooldowns, timestamps, lastSpeaker, फॉलो-अप काउंटर।

---

## हॉट-रीलोड कॉन्फ़िगरेशन

एक ही `config.yml` फ़ाइल। अधिकांश मान **हॉट-रीलोडेबल** हैं -- बिना रीस्टार्ट के परिवर्तन लागू हो जाते हैं।

| श्रेणी | हॉट-रीलोड |
|-----------|-----------|
| ट्रिगर, कीवर्ड, नाम | ✅ |
| एकाग्रता, विलंब | ✅ |
| टाइपिंग गलतियाँ, बर्स्ट, थकान | ✅ |
| नींद का समय | ✅ |
| TTS, वॉयस संदेश | ✅ |
| Discord टोकन, LLM मोड | ❌ (रीस्टार्ट आवश्यक) |

```typescript
// config.ts -- गेटर लाइव मान लौटाते हैं
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## डेटासेट: Discord-Dialogues

मॉडल [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) पर फाइन-ट्यून किया गया है: **7.3M विनिमय**, **17M चक्र**, **140M शब्द**। वास्तविक Discord बातचीत वसंत-ग्रीष्म 2025, फ़िल्टर किया गया (PII, ToS, बॉट, कमांड)। Apache 2.0।

| मेट्रिक | मान |
|----------|--------|
| नमूने | 7 303 464 |
| कुल चक्र | 16 881 010 |
| कुल शब्द | 139 922 950 |
| औसत टोकन | 32.8 |
| टोकनाइज़र | Hermes-3-Llama-3.1-8B |

उपयोग किया गया क्वांटाइज़्ड मॉडल एक GGUF है (जैसे `Discord-Hermes-3-8B.Q3_K_M.gguf`)।

![Discord-Dialogues डेटासेट वितरण](/images/luna-protocol/dataset-distribution.svg)

---

![पूर्ण जीवनचक्र -- संदेश से प्रतिक्रिया तक पूर्ण बॉट व्यवहार, टाइमर और सीमा मामलों सहित](/images/luna-protocol/22-complete-lifecycle.svg)

## वास्तुकला आरेख

`state-machines/` फ़ोल्डर में **24 Mermaid आरेख** हैं जो पूरे स्रोत कोड को कवर करते हैं। प्रत्येक आरेख का मानव भाषा में विस्तृत विवरण है।

सबसे महत्वपूर्ण में से:

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

ये आरेख पूरे प्रवाह को समझने के लिए एक स्वर्ण खदान हैं: आने वाले संदेश से लेकर प्रतिक्रिया तक, टाइमर और सीमा मामलों से गुजरते हुए।

---

## ट्रिगर कोड विस्तार से

ट्रिगर का मूल्यांकन `state/trigger.ts` में `evaluateMessage()` द्वारा किया जाता है। यहाँ पूरी तर्क है:

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

  // ... नाम, कीवर्ड, फॉलो-अप, यादृच्छिक द्वारा मिलान
}
```

रेगुलर एक्सप्रेशन कैश (`hasWordCache`) प्रत्येक संदेश में पैटर्न को फिर से संकलित करने से रोकता है।

---

## प्रतिक्रियाएँ

Luna इमोजी के साथ संदेशों पर प्रतिक्रिया करता है। सर्वर के कस्टम इमोजी का उपयोग करने की 30% संभावना, यूनिकोड इमोजी की 70%। प्रतिक्रिया एकाग्रता विलंब के बाद ट्रिगर होती है, तुरंत नहीं।

Luna के संदेशों पर प्रतिक्रिया कमांड:
- ❌ → Stop
- ▶️ → Start
- 🗑️ → Clear

---

## प्रतिक्रिया शैली

प्रतिक्रिया शैली Luna की हाल की चैनल गतिविधि के अनुसार भारित होती है:

| संदर्भ | messageReference | mentionRepliedUser | भार |
|----------|-----------------|-------------------|-------|
| ठंडा | true | false | 70% |
| ठंडा | true | true | 20% |
| ठंडा | false | false | 10% |
| सक्रिय | true | false | 50% |
| सक्रिय | true | true | 15% |
| सक्रिय | false | false | 30% |
| सक्रिय | false | true | 5% |

DM में, `messageReference` हमेशा `false` होता है。

---

## बर्स्ट संदेश

15% संभावना से, प्रतिक्रिया को 2-3 टुकड़ों में मानव लय (1.5-4 सेकंड) में विभाजित करके भेजा जाता है। कई बार टाइप करने वाले व्यक्ति का सिमुलेश।

![टाइमिंग गांट -- विलंब, प्रतिक्रियों, LLM स्ट्रीमिंग और सुधारों के लिए वास्तविक प्रतीक्षा समय](/images/luna-protocol/21-timing-gantt.svg)

---

## गतिशील स्थिति

Luna की Discord स्थिति कॉन्फ़िगर किए गए प्रीसेट के बीच बदलती है, हर 15 मिनट में चक्रित। समर्थित प्रकार: Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5)। नींद के दौरान, स्थिति `invisible` में बदल जाती है।

```yaml
dynamic_status_presets:
  - status: online
    text: "avec les pixels"
    type: 0       # Playing
  - status: idle
    text: "du bruit blanc"
    type: 2       # Listening
```

यादृच्हिक जिटर (×0.5-1.0) अनुमानित चक्रण को रोकता है। दोहराव से बचने के लिए 10% प्रयास छोड़ दिए जाते हैं।

## टाइपिंग इंडिकेटर

LLM को कॉल करने से पहले, Luna `startTyping()` कॉल करता है। `setInterval` जनरेशन के दौरान हर 8 सेकंड में इंडिकेटर को रीफ्रेश करता है। `finally` (`clearInterval`) में साफ़ किया जाता है।

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

## क्रैश से पुनर्प्राप्ति

अगर LLM क्रैश होता है (`llama-server` प्रक्रिया मरती है), तो Luna `llmBus.emit("crash", code)` के माध्यम से इवेंट का पता लगाता है और एक्स्पोनेशियल बैकऑफ के साथ पुनरारंभ का प्रयास करता है। अनंत पुनरारंभ लूप से बचाता है।

## LLM पैरामीटर

पैरामीटर `src/config.ts` में हार्डकोड किए गए हैं:

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

ChatML टेम्पलेट (›im_start‹/›im_end‹) का उपयोग किया जाता है। थ्रेड्स संख्या `os.cpus().length` से स्वचालित।

---

## सेटअप

```bash
npm install
cp config.example.yml config.yml
# config.yml संपादित करें
cd config.yml
npm run dev                    # dev (hot reload)
npm run build && npm start     # production
```

| स्क्रिप्ट | विवरण |
|--------|-------------|
| `build` | स्वायत्न कला CLI बंडल |
| `start` | बॉट सुरू करता है |
| `lint` / `format` / `check` | Biome |
| `test` | टेस्ट (Bun) |
| `download-model` | HuggingFace से GGUF |
| `diagrams` | Mermaid आरेखों को SVG/PNG में निर्यात |

### PM2 तैनाव

```bash
./start.sh   # PM2 में llm-server + llm-client सुरू करें
d:
```

---

## निष्कर्ष

Luna Protocol सिर्फ LLM से लैस Discord बॉट नहीं है। यह एक पूर्ण व्वहार स्मूहिया है जो इंसानी अपूर्णताओं -- भूलना, टाइपिंग गलतियां, नींद, हिचकिचाहट, थकान -- को सिमुलेट करता है। सब एक याता टायप बसब बनाया गया है: टाइप किया जाने वाले इवेंट बस, बाकी से टायप होता है।

| सहायता | लिंक |
|-----------|------|
| GitHub रिपो | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
