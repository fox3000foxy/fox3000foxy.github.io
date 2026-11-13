---
title: "Luna Protocol : मैंने स्वायत्त Discord बॉट बनाया जो मानव का अनुकरण करता है"
description: "Luna Protocol स्थानीय LLM वाला पूरी तरह स्वायत्त Discord बॉट है, नींद, टाइपो, हिचकिचाहट, भूल, विषयगत थकान और स्वतः संदेशों के साथ स्वाभाविक बातचीत में सक्षम।"
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
author_sig: "dkW03bwsPr5VlEVXWzKpjOvujYDl1VIipWAPe5YfEsFx6P9u4MQmlH2vfqeKruprldwwFRs2n+znlsdIVYaDBQ=="
---

# Luna Protocol : मैंने स्वायत्त Discord बॉट बनाया जो मानव का अनुकरण करता है

क्या हो अगर Discord बॉट **सो** सकता, **टाइपो** कर सकता, **हिचकिचा** सकता, जवाब देना **भूल** सकता, और कभी अपनी ओर से संदेश भेज सकता ? ठीक यही **Luna Protocol** करता है : पूरी तरह स्वायत्त Discord बॉट जो स्थानीय LLM (llama.cpp) चलाता है और अपूर्ण मानव की तरह बातचीत करता है।

Luna संदर्भात्मक trigger और स्वीकृत अपूर्ण उत्तरों से काम करती है। उसके पास **प्राथमिकता trigger तंत्र**, **परिवर्तनीय विलंब**, **नींद समय**, **स्वतः संदेश**, और यहाँ तक ध्वनि संदेश भेजने के लिए **TTS पाइपलाइन** है। सब साधारण hot-reloadable `config.yml` फाइल से कॉन्फ़िगर।

इस लेख में, मैं पूरी आर्किटेक्चर चीड़ता हूँ : सामान्य घटना बस से TTS पाइपलाइन तक, trigger तंत्र, मानवीय घटकों, और fine-tuning डेटासेट से गुजरते हुए।

![Architecture Overview , वैश्विक घटक और डेटा प्रवाह](/images/luna-protocol/01-architecture-overview.svg)

---

## आर्किटेक्चर : typed घटना बस

Luna का हृदय **TypedBus** है : TypeScript में कड़ाई से typed सामान्य घटना बस। यह मौलिक ईंट है जिस पर सब टिका है। मैंने इसे ऐसे बनाया क्योंकि मैं शुरू से गोलाकार निर्भरताओं से बचना चाहता था।

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

इससे दो मुख्य बस निकलती हैं :

- **`llmBus`** : LLM token, त्रुटियाँ, crash, reset संभालती है
- **`stateBus`** : स्वचालित स्थायित्व के साथ स्थिति बदलाव संभालती है

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

इस दृष्टिकोण का फायदा : हर मॉड्यूल बाकी से **कटा** है। LLM बस पर token उत्सर्जित करता है, बॉट उन्हें उपभोग करता है, स्थिति अपने आप अद्यतन होती है। कोई गोलाकार निर्भरता नहीं।

---

![Message Processing , संदेश प्रोसेसिंग का पूरा प्रवाह](/images/luna-protocol/02-message-processing.svg)

## trigger तंत्र : कौन तय करता है कि Luna कब जवाब देती है ?

हर आने वाला संदेश `evaluateMessage()` से मूल्यांकित होता है जो trigger कारण वाला `TriggerResult` लौटाता है। प्राथमिकता क्रम महत्वपूर्ण है :

| # | कारण | शर्तें | ignore bypass | pause bypass |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | हाँ (0%) | हाँ |
| 2 | `dm` | `replyInDM = true` के साथ MP | हाँ (0%) | नहीं |
| 3 | `name` | "Luna"/"Pixie"/उपनाम (पूरा शब्द) | नहीं (8%) | नहीं |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (पूरा शब्द) | नहीं (8%) | नहीं |
| 5 | `follow-up` | बॉट अंतिम वक्ता था + < 15s + < 3 / 60s | -- | -- |
| 6 | `random` | अमेल संदेशों पर 1.5% संभावना | नहीं (8%) | नहीं |

मिलान **पूरा शब्द** (`\b`) है : "ai" "mais", "vrai", "lait" से मेल नहीं खाता।

![Trigger evaluation , हर संदेश के लिए प्रवेश निर्णय](/images/luna-protocol/03-trigger-evaluation.svg)

### follow-up तंत्र

जब Luna संदेश का जवाब देती है, तो वह `lastSpeaker` के रूप में दर्ज होती है। 15 सेकंड में अगला हर संदेश **तुरंत** उत्तर trigger करता है, timer और keyword जाँच short-circuit करके। बजट : 60 सेकंड विंडो में 3 follow-up।

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### cooldown

उसी चैनल में दो उत्तरों के बीच 8 सेकंड। उल्लेख और follow-up से दरकिनार होता है।

---

## मानवीय व्यवहार : परिवर्तनीय एकाग्रता

यहीं Luna दिलचस्प होती है। हर trigger तरह की अपनी **एकाग्रता सीमाएँ** हैं : न्यूनतम/अधिकतम विलंब, नजरअंदाज संभावना, और प्रतिक्रिया संभावना।

| Trigger | न्यूनतम विलंब | अधिकतम विलंब | नजरअंदाज | प्रतिक्रिया |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

विलंब गणना यह भी ध्यान में लेती है :
- **संदेश लंबाई** : संदेश जितना लंबा, Luna उसे "पढ़ने" में उतना समय लेती है
- **निष्क्रियता** : अगर Luna 10 मिनट से सक्रिय नहीं रही, तो विलंब 2 से गुणा होता है ("जागने" का अनुकरण)
- **नींद** : `slow` मोड में, विलंब 3 से 5 गुणा होता है

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
  delay *= 0.5 + Math.random() * 1.5; // आक्रामक jitter
  return delay;
}
```

---

## नींद समय

Luna सो सकती है। `config.yml` से कॉन्फ़िगर करने योग्य :

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
| `sleep` | सिर्फ उल्लेख और MP गुजरते हैं |
| `slow` | विलंब ×3-5, प्रतिक्रियाएँ लगभग शून्य |
| `short` | नजरअंदाज संभावना +30%, प्रतिक्रियाएँ लगभग शून्य |

नींद घंटों के दौरान, Discord स्थिति `invisible` हो जाती है।

---

## टाइपो

Luna टाइपो कर सकती है, 2-4 सेकंड बाद सुधारी गई। keyboard layout कॉन्फ़िगर करने योग्य (AZERTY या QWERTY)। मैंने इसे कॉन्फ़िगर करने योग्य छोड़ा क्योंकि तुम तुरंत पहचानते हो कि बॉट बहुत साफ लिखता है।

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... सभी आसन्न कुंजियाँ
};
```

AZERTY उदाहरण : `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`।

सुधार की तीन शैलियाँ :

| शैली | व्यवहार |
|-------|-------------|
| `edit` | संदेश संपादित करता है |
| `message` | नया संदेश : `word*` |
| `mixed` | 50/50 बेतरतीब (डिफ़ॉल्ट) |

---

## हिचकिचाहट और भूल

**हिचकिचाहट** : भराव शब्द (`uh...`, `um...`, `well...`, `hmm...`, `so...`) से शुरू करने की 15% संभावना।

**भूल** : trigger मिलाने के बाद भी, Luna 3% संभावना से जवाब देना "भूल" सकती है। वह तब पूरी तरह मौन रहती है, जैसे उसने कुछ देखा ही नहीं। मुझे यह व्यवहार पसंद है क्योंकि तुमने पहले ही मानवों को बिना इरादे संदेश भूलते देखा है।

**विषयगत थकान** : अगर कोई शब्द पिछले 10 संदेशों में बहुत बार लौटता है (सीमा : 3 घटनाएँ), तो विलंब गुणा होते हैं और नजरअंदाज संभावना 15% बढ़ जाती है।

---

## व्यवहार में यथार्थवाद : जब यह डरावना होता है

कागज पर, ये सभी तंत्र (विलंब, टाइपो, हिचकिचाहट, भूल) gadget लगते हैं। असल में, एक के बाद एक, परिणाम चौंकाने वाला है : Luna से बातचीत में लोग कुछ संदेह नहीं करते। यहाँ असली आदान प्रदान है जहाँ कोई सीधे Luna से पूछता है कि क्या यह बॉट है, और जहाँ बातचीत फिर पूरी तरह दूसरे विषय पर बहती है, स्वाभाविकता के साथ जिससे रीढ़ ठंडी होती है। मुझे उम्मीद नहीं थी कि वास्तविक स्थितियों में यह इतना विश्वसनीय होगा।

![Luna के साथ Discord बातचीत, पहला आदान प्रदान](/images/luna-protocol/realism/realism-01.png)

स्वर, हिचकिचाहट, उत्तर लय : कुछ बॉट को धोखा नहीं देता। Luna उम्र प्रश्न को पात्र कभी तोड़े बिना टालती है।

![Luna के साथ Discord बातचीत, आदान प्रदान जारी](/images/luna-protocol/realism/realism-02.png)

बातचीत पूरी तरह तरल जारी रहती है, छोटे और स्वाभाविक उत्तरों ("okay, okay", "yay", "yayy") के साथ : ठीक वैसे संदेश जो मानव Discord पर भेजेगा।

![Luna के साथ Discord बातचीत, विषय बहाव](/images/luna-protocol/realism/realism-03.png)

![Luna के साथ Discord बातचीत, बहाव जारी](/images/luna-protocol/realism/realism-04.png)

![Luna के साथ Discord बातचीत, आदान प्रदान अंत](/images/luna-protocol/realism/realism-05.png)

जो भयानक है, वह सिर्फ यह नहीं है कि Luna "जवाब देती" है : यह है कि वह **बातचीत बनाए रखती** है, स्पष्ट राय, फिर से शुरूआत, एक संदेश से दूसरे तक सुसंगत विचार सूत्र के साथ। ऊपर वर्णित trigger तंत्र, एकाग्रता विलंब और हिचकिचाहट के बिना, यह भ्रम कुछ संदेशों में ढह जाएगा।

**छोटा plot twist** : ऊपर screenshot में, **चर्चा करने वाले दोनों खाते Luna के उदाहरण हैं**। `PixieGlow` और `Sujet d'SBlow` बॉट परखता मानव नहीं हैं : वे दो बॉट हैं जो एक दूसरे से बात करते हैं, हर एक (व्यवहार अर्थ में) आश्वस्त कि वह किसी "सामान्य" से चर्चा कर रहा है। अगर ऊपर आदान प्रदान पढ़ते हुए तुमने माना कि दो वार्ताकारों में से एक मानव था, बधाई : तुम ठीक जाल में गिरे जैसे कोई भी असली Discord serveur पर गिरता।

यह थोड़ा **dead internet theory** व्यावहारिक संस्करण है : यह सिद्धांत (मूलतः बल्कि षड्यंत्रकारी) मानता है कि ऑनलाइन सामग्री और interaction का बढ़ता हिस्सा मानवों के बजाय बॉट से उत्पन्न होगा, यहाँ तक कि "असली" मानव internet अल्पमत हो गया होगा। लंबे समय अतिरंजित माना गया, वह कम बेतुका होता जाता है जैसे Luna Protocol जैसे तंत्र दिखाते हैं कि बड़े पैमाने विश्वसनीय मानवीय उपस्थिति अनुकरण के लिए न बहुत साधन चाहिए न विशाल मॉडल। एक ही बॉट के दो उदाहरण जो लंबी बातचीत बिना कभी धोखा दिए बनाए रख सकते हैं, यह काफी ठोस झलक देता है कि बहुमत बॉटों से आबाद web कैसा लग सकता है जो एक दूसरे से बात करते हैं।

---

## LLM पाइपलाइन : दो मोड

### `direct` मोड (डिफ़ॉल्ट)

बॉट अनुरोध सीधे स्थानीय `llama-server` को HTTP में भेजता है। मॉडल साझा है, prompt cache और 4 समवर्ती slot के साथ। दो PM2 प्रक्रियाएँ : LLM serveur और बॉट client।

### `online` मोड

बॉट OpenAI संगत कोई भी API बुलाता है (OpenAI, OpenRouter, Groq, Together...)। तुम्हें बस API कुंजी चाहिए, LLM provider तरफ चलता है।

### वास्तविक समय streaming

LLM उत्तर पंक्ति दर पंक्ति (`\n`) stream करता है। हर पंक्ति शब्दों में काटी जाती है, एक एक करके `llmBus.emit("token", word)` पर उत्सर्जित। हर `\n` पर, `flush` घटना उत्सर्जित होती है : बॉट जमा संदेश तुरंत भेजता है। लय सीधे LLM का अनुसरण करती है।

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

अनुरोध कतार (`requestQueue`) अनुरोध एक एक करके प्रोसेस करती है, कतार 100 तत्व पार करने पर स्वचालित सफाई के साथ।

---

## स्वतः संदेश

हर 5 मिनट, 12% संभावना कि Luna अपनी ओर से संदेश post करे। serveur **रैखिक भार** तंत्र से चुना जाता है : सबसे सक्रिय serveur को आखिरी से N× ज्यादा संभावना।

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

पिछले 5 संदेशों का संदर्भ पढ़ा जाता है, और Luna बातचीत "स्वाभाविक" जुड़ती है।

---

## TTS पाइपलाइन : ध्वनि संदेश

8% संभावना से, Luna पाठ के बजाय ध्वनि संदेश भेजती है। पूरी पाइपलाइन :

1. **Piper TTS** पाठ WAV में संश्लेषित करता है
2. **ffmpeg** OGG में बदलता है
3. Discord पूर्वावलोकन के लिए waveform गणना की जाती है
4. फाइल Discord CDN API से upload की जाती है
5. ध्वनि संदेश भेजा जाता है

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

![TTS Pipeline , संश्लेषित पाठ से Discord ध्वनि संदेश तक](/images/luna-protocol/10-tts-pipeline.svg)

---

## एंटी spam और स्थायित्व

### एंटी spam

`channelId:userId` दर कतार। प्रति चैनल प्रति उपयोगकर्ता कतार में एक ही संदेश। चल रहे उत्तर खत्म होते ही प्रोसेस किया जाता है।

### सत्र सीमाएँ

8 आदान प्रदान बाद, Luna 30 सेकंड pause लेती है। 3 मिनट निष्क्रियता बाद counter reset होता है।

### स्वचालित स्थायित्व

हर स्थिति उत्परिवर्तन `stateBus` पर उत्सर्जित होता है → स्वचालित सहेजना (debounce 500ms)। मैन्युअल `saveAllState()` कॉल की जरूरत नहीं। स्थायी स्थिति शामिल करती है : pendingMessages, paused, cooldown, timestamp, lastSpeaker, follow-up counter।

---

## hot-reload कॉन्फ़िगरेशन

एक ही `config.yml` फाइल। ज्यादातर मान **hot-reloadable** हैं : बदलाव बिना पुनरारंभ ध्यान में लिए जाते हैं। मैं live विलंब समायोजित करना चाहता था, बिना चल रही बातचीत काटे।

| श्रेणी | Hot-reload |
|-----------|-----------|
| Trigger, keyword, नाम | ✅ |
| एकाग्रता, विलंब | ✅ |
| Typo, burst, थकान | ✅ |
| Sleep schedule | ✅ |
| TTS, ध्वनि संदेश | ✅ |
| Discord token, LLM मोड | ❌ (पुनरारंभ जरूरी) |

```typescript
// config.ts , getter live मान लौटाते हैं
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## डेटासेट : Discord-Dialogues

मॉडल [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) पर fine-tune है : **7.3M आदान प्रदान**, **17M मोड़**, **140M शब्द**। वसंत ग्रीष्म 2025 की असली Discord बातचीत, छँटी हुई (PII, ToS, बॉट, कमांड)। Apache 2.0।

| मीट्रिक | मान |
|----------|--------|
| नमूने | 7 303 464 |
| कुल मोड़ | 16 881 010 |
| कुल शब्द | 139 922 950 |
| औसत token | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

इस्तेमाल किया quantize मॉडल GGUF है (उदाहरण के लिए `Discord-Hermes-3-8B.Q3_K_M.gguf`)।

![Discord-Dialogues डेटासेट वितरण](/images/luna-protocol/dataset-distribution.svg)

---

![Complete Lifecycle , संदेश से उत्तर तक बॉट का पूरा व्यवहार, timer और सीमांत मामलों सहित](/images/luna-protocol/22-complete-lifecycle.svg)

## आर्किटेक्चर चित्र

`state-machines/` फोल्डर में पूरे स्रोत कोड को कवर **24 Mermaid चित्र** हैं। हर चित्र में मानव भाषा में विस्तृत व्याख्या है।

सबसे महत्वपूर्ण में :

| # | चित्र | प्रकार |
|---|-----------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (पूरा) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 backend) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

ये चित्र पूरा प्रवाह समझने के लिए सोने की खान हैं : आने वाले संदेश से उत्तर तक, timer और सीमांत मामलों से गुजरते हुए।

---

## विस्तार में trigger कोड

trigger `state/trigger.ts` में `evaluateMessage()` से मूल्यांकित होता है। पूरी तर्क यहाँ है :

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

  // ... नाम, keyword, follow-up, बेतरतीब से मिलान
}
```

regex cache (`hasWordCache`) हर संदेश पर पैटर्न फिर से संकलित करने से रोकता है।

---

## प्रतिक्रियाएँ

Luna emoji से संदेशों पर प्रतिक्रिया करती है। serveur के custom emoji इस्तेमाल की 30% संभावना, unicode emoji की 70%। प्रतिक्रिया एकाग्रता विलंब बाद जाती है, उत्तरों वाली उसी décalage लय के साथ। मुझे यह décalage पसंद है क्योंकि तुम महसूस करते हो कि उसने पढ़ने का समय लिया।

Luna संदेशों पर प्रतिक्रिया कमांड :
- ❌ → Stop
- ▶️ → Start
- 🗑️ → Clear

---

## उत्तर शैली

उत्तर शैली चैनल में Luna की हाल गतिविधि अनुसार भारित होती है :

| संदर्भ | messageReference | mentionRepliedUser | भार |
|----------|-----------------|-------------------|-------|
| ठंडा | true | false | 70% |
| ठंडा | true | true | 20% |
| ठंडा | false | false | 10% |
| सक्रिय | true | false | 50% |
| सक्रिय | true | true | 15% |
| सक्रिय | false | false | 30% |
| सक्रिय | false | true | 5% |

MP में, `messageReference` हमेशा `false` है।

---

## बौछार संदेश

15% संभावना से, उत्तर मानवीय लय (हर टुकड़े के बीच 1.5-4 सेकंड) में भेजे 2-3 टुकड़ों में काटा जाता है। किसी का कई बार टाइप करने का अनुकरण करता है।

![Timing Gantt , विलंब, प्रतिक्रियाओं, LLM streaming और सुधारों के लिए वास्तविक प्रतीक्षा समय](/images/luna-protocol/21-timing-gantt.svg)

---

## गतिशील स्थिति

Luna की Discord स्थिति कई कॉन्फ़िगर preset के बीच बदलती है, हर 15 मिनट घूमती है। समर्थित प्रकार : Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5)। नींद के दौरान, स्थिति `invisible` हो जाती है।

```yaml
dynamic_status_presets:
  - status: online
    text: "avec les pixels"
    type: 0       # Playing
  - status: idle
    text: "du bruit blanc"
    type: 2       # Listening
```

बेतरतीब jitter (×0.5-1.0) पूर्वानुमेय घूर्णन रोकता है। दोहराव से बचने के लिए 10% प्रयास छोड़े जाते हैं।

## टाइपिंग सूचक

LLM बुलाने से पहले, Luna `startTyping()` बुलाती है। `setInterval` पीढ़ी के दौरान हर 8 सेकंड सूचक ताजा करता है। `finally` में साफ किया गया (`clearInterval`)।

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

## crash बाद पुनर्प्राप्ति

अगर LLM crash करता है (`llama-server` प्रक्रिया मरती है), Luna `llmBus.emit("crash", code)` घटना से पहचानती है और घातांकीय backoff से पुनरारंभ प्रयास करती है। अनंत पुनरारंभ लूप से बचती है।

## LLM पैरामीटर

पैरामीटर `src/config.ts` में hardcoded हैं :

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

ChatML template (`<|im_start|>/<|im_end|>`) इस्तेमाल होता है। thread संख्या `os.cpus().length` से स्वतः पहचानी जाती है।

---

## स्थापना

```bash
npm install
cp config.example.yml config.yml
# config.yml संपादित करो
npm run dev                    # dev (hot reload)
npm run build && npm start     # production
```

| स्क्रिप्ट | विवरण |
|--------|-------------|
| `build` | स्वायत्त CLI bundle करता है |
| `start` | बॉट चलाता है |
| `lint` / `format` / `check` | Biome |
| `test` | परीक्षण (Bun) |
| `download-model` | HuggingFace से GGUF |
| `diagrams` | Mermaid चित्र SVG/PNG में निर्यात करता है |

### PM2 परिनियोजन

```bash
./start.sh   # PM2 के नीचे llm-server + llm-client चलाता है
```

---

## निष्कर्ष

Luna Protocol LLM वाले Discord बॉट से कहीं आगे जाता है। यह **पूर्ण व्यवहार तंत्र** है जो मानवीय अपूर्णताएँ अनुकरण करता है : भूल, टाइपो, नींद, हिचकिचाहट, थकान। सब typed घटना बस के चारों ओर architected, हर प्रवाह प्रलेखित 24 Mermaid चित्रों के साथ।

कोड ओपन सोर्स है, डेटासेट सार्वजनिक है, और कॉन्फ़िगरेशन hot-reloadable है। अगर विषय तुम्हारी रुचि का है, तो कोड में गोता लगाओ : यह दिखता से ज्यादा सुलभ है। मैंने इसे व्यवहार पर बहुत से विचार परखने के आधार के रूप में इस्तेमाल किया, और तुम हर मॉड्यूल अलग फिर से ले सकते हो।

| संसाधन | लिंक |
|-----------|------|
| GitHub रिपॉजिटरी | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| डेटासेट | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
