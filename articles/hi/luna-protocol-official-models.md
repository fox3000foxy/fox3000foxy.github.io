---
title: "Luna Protocol : मैंने 50k Discord नमूनों पर 1,5 अरब पैरामीटर मॉडल fine-tune क्यों किया, और few-shot priming ने सब क्यों बदला"
description: "कम डेटा पर प्रशिक्षित छोटा मॉडल बड़े मॉडल से बेहतर हो सकता है, बशर्ते उसे अच्छी तरह शुरू करना आता हो। Luna Protocol Hermes 3B से fine-tune Qwen 1,5B पर क्यों गया, और few-shot priming प्यारा बोनस से पूरे दृष्टिकोण का हृदय क्यों बना।"
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
author_sig: "LtqoALGURHIGalId+jzU1V7Y/OzC8ToxWyGUSG7xmWbvtA54aR8rSzoViU69kC0ZiVoCzFHx+X+EMyIO10FcZg=="
---

# Luna Protocol : मैंने 50k Discord नमूनों पर 1,5 अरब पैरामीटर मॉडल fine-tune क्यों किया, और few-shot priming ने सब क्यों बदला

[पहले लेख](/articles/en/luna-protocol-discord-bot) में, मैंने Discord बॉट बनाया जो मानव का अनुकरण करता है : नींद, टाइपो, हिचकिचाहट, भूल, स्वतः संदेश। व्यवहार तंत्र चलता था। उस सबके पीछे LLM 3 अरब पैरामीटर का Hermes मॉडल था, Q8_0 में quantize, 3 Go VRAM उपभोग करता हुआ।

यह काम करता था। लेकिन यह जरूरत से बड़ा था।

Discord बॉट को "nm just chillin, u" कहने के लिए 3 अरब पैरामीटर मॉडल नहीं चाहिए। उसे **शैलीगत सुसंगतता** चाहिए : संदेश दर संदेश सटीक बातचीत स्वर बनाए रखने की क्षमता, बिना "corporate सहायक" मोड की ओर बहके। और पता चलता है कि कम डेटा पर प्रशिक्षित और कुछ उदाहरणों से शुरू किया छोटा मॉडल वहाँ साधारण तंत्र प्रॉम्प्ट से जबरदस्ती गुजरने वाले बड़े मॉडल से बेहतर पहुँचता है।

यह लेख Luna Protocol आधिकारिक मॉडलों पर है : वे क्यों मौजूद हैं, 3B के बजाय 1,5B क्यों, 7,3M के बजाय 50k प्रशिक्षण नमूने क्यों, और few-shot priming "प्यारा बोनस" स्थिति से पूरे दृष्टिकोण के हृदय स्थिति में क्यों गया।

---

## 3B मॉडल की समस्या

मूल कॉन्फ़िगरेशन `Discord-Micae-Hermes-3-3B.Q8_0.gguf` इस्तेमाल करती थी, Discord डेटा पर fine-tune 3 अरब पैरामीटर मॉडल। वह अच्छे उत्तर बनाता था, लेकिन :

| मीट्रिक | Hermes-3-3B Q8_0 | लक्ष्य |
|--------|-------------------|--------|
| VRAM उपयोग | ~3 Go | < 1 Go |
| token पीढ़ी | ~30 tok/s | ~60+ tok/s |
| मॉडल फाइल आकार | ~3,2 Go | < 1 Go |
| cold शुरू समय | ~8s | ~3s |

मामूली serveur पर 24/7 चलने वाले बॉट के लिए, 3 Go VRAM बहुत है। और पीढ़ी गति, कभी कभार संदेशों के लिए सही, बौछार उत्तरों या कई सक्रिय चैनलों पर धीमी लगती थी।

प्रश्न था : क्या वही Discord-Dialogues शैली आधे पैरामीटर से पाई जा सकती है ?

---

## fine-tuning निर्णय : 7,3M क्यों नहीं, 50k क्यों

[Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) डेटासेट में **7,3M आदान प्रदान** और **17M वाणी मोड़** हैं। यह असली Discord बातचीत का विशाल corpus है। स्पष्ट दृष्टिकोण पूरे डेटासेट पर प्रशिक्षित करना होता।

मैंने उल्टा किया। मैंने **50 000 नमूनों** पर प्रशिक्षित किया, उपलब्ध डेटा के 1 % से कम।

यहाँ क्यों : **प्रशिक्षण सेट आकार सीधे प्रभावित करता है कि मॉडल अपने प्रशिक्षण वितरण के प्रति कितना अति अनुकूलित है**।

7,3M उदाहरणों पर प्रशिक्षित मॉडल बातचीत का बहुत विशिष्ट सांख्यिकीय वितरण सीखता है। वह इस वितरण को दोहराने में उत्कृष्ट होता है, लेकिन वह **कठोर** भी होता है : अनुमान समय दिए नए पैटर्न अनुकूल होने की उसके पास कम गुंजाइश होती है।

50k उदाहरणों पर प्रशिक्षित मॉडल Discord बातचीत का सामान्य स्वर और register सीखता है (अनौपचारिक, छोटा, संक्षिप्त, छोटे अक्षर), लेकिन **संदर्भ में उदाहरणों से चलाए जाने** के लिए पर्याप्त लचीलापन रखता है। few-shot उदाहरण पहले से सीखे विशाल वितरण से नहीं लड़ते : वे हल्के वितरण को पूरा करने आते हैं।

यही केंद्रीय अंतर्ज्ञान है : **सीमित प्रशिक्षण डेटा few-shot priming को ज्यादा प्रभावी बनाता है**।

---

## मॉडल : तकनीकी विवरण

Luna Protocol मॉडल [Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct) का **QLoRA fine-tune** है :

| पैरामीटर | मान |
|-----------|-------|
| आधार मॉडल | `unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit` |
| विधि | QLoRA (4-bit) |
| LoRA rank | `r=16`, `lora_alpha=16` |
| लक्षित मॉड्यूल | `q/k/v/o_proj`, `gate/up/down_proj` |
| प्रशिक्षण योग्य पैरामीटर | 18 464 768 / 1 562 179 072 (1,18 %) |
| प्रशिक्षण डेटा | ~50 000 उदाहरण (Discord-Dialogues का उपसमुच्चय) |
| फ़िल्टर | प्रति नमूना 8-512 token |
| युग | 2-3 |
| हार्डवेयर | Kaggle T4 |
| Framework | [Unsloth](https://github.com/unslothai/unsloth) |

डेटासेट Discord-Dialogues का पूर्व प्रोसेस fork है, सिर्फ साफ `user`/`assistant` मोड़ रखने के लिए छाँटा गया : सिर्फ उपयोगकर्ता और सहायक आदान प्रदान, बिना तंत्र संदेश या मेटाडेटा या बॉट कमांड। आगे के लिए यह महत्वपूर्ण है।

### उपलब्ध quantization

| फाइल | Quantization | आकार | टिप्पणियाँ |
|------|-------------|------|-------|
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q2_K.gguf` | Q2_K | 676 Mo | स्पष्ट बिगड़ा , अनुशंसित नहीं |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf` | Q4_K_M | 986 Mo | अच्छा आकार/गुणवत्ता समझौता (अनुशंसित) |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q8_0.gguf` | Q8_0 | 1,65 Go | सर्वश्रेष्ठ शैलीगत निष्ठा |

अनुशंसित मॉडल **Q4_K_M** है : 1 Go से कम, तेज, और वह बातचीत शैली अच्छी तरह संरक्षित करता है। Q2_K इस आकार के मॉडल के लिए बहुत बिगड़ता है। Q8_0 सर्वश्रेष्ठ गुणवत्ता देता है लेकिन 68 % ज्यादा स्मृति उपभोग करता है।

---

## few-shot priming सफलता

यहाँ वह हिस्सा है जिसने सब बदला।

HuggingFace पर मॉडल कार्ड में चेतावनी है :

> नंगे प्रॉम्प्ट और बिना शुरुआत के, यह मॉडल Qwen के डिफ़ॉल्ट "सहायक" स्वर में लौटता है। छोटी few-shot शुरुआत बड़ा अंतर लाती है।

यह सीधा परिणाम है कि प्रशिक्षण डेटा कैसे संरचित किए गए थे।

### सिर्फ तंत्र प्रॉम्प्ट क्यों काम नहीं करते

Discord-Dialogues प्रशिक्षण डेटा में सिर्फ `user`/`assistant` मोड़ हैं। प्रशिक्षण सेट में **तंत्र भूमिका का कोई उदाहरण** नहीं है। मॉडल शैली निर्देश के रूप में तंत्र प्रॉम्प्ट पालन करना कभी प्रशिक्षित नहीं हुआ।

जब उसे "तुम Luna हो, शांत तरीके से बोलो" तरह का तंत्र प्रॉम्प्ट दिया जाता है, तो वह निर्देश सुनता है लेकिन उसे output में अनुवाद करने का कोई ठोस सीखा पैटर्न नहीं है। वह तब Qwen डिफ़ॉल्ट व्यवहार पर लौटता है : सहायक, संरचित, हल्का औपचारिक।

### few-shot उदाहरण क्यों काम करते हैं

जब बातचीत उदाहरण प्रशिक्षण में इस्तेमाल ChatML प्रारूप (`user`/`assistant` मोड़ संरचना) में डाले जाते हैं, तो कुछ trigger होता है। मॉडल अपने प्रशिक्षण का पैटर्न पहचानता है और तदनुसार output संरेखित करता है।

व्यवहार में few-shot शुरुआत ऐसी दिखती है :

```yaml
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

ये उदाहरण तंत्र प्रॉम्प्ट बाद और असली बातचीत से पहले डाले जाते हैं। मॉडल उन्हें निर्देशों के बजाय बातचीत इतिहास हिस्से के रूप में देखता है, इसलिए असली आदान प्रदान के रूप में बजाय निर्देशों के। यह जरूरी भेद है : हम उसे बताने के बजाय *दिखाते* हैं कि शांत स्वर कैसा दिखता है।

### पहले / बाद में

few-shot शुरुआत के बिना (नंगा तंत्र प्रॉम्प्ट) :

```
User: yo whats good
Bot: Hello! I am doing well, thank you for asking. How can I assist you today?
```

few-shot शुरुआत के साथ (3 उदाहरण) :

```
User: yo whats good
Bot: nm just chillin, u
```

अंतर स्पष्ट है। मॉडल पूरा register अपनाता है : छोटे अक्षर, संक्षिप्त, शांत स्वर, छोटे उत्तर। वह Qwen प्रशिक्षण डेटा शैली के बजाय उदाहरणों की शैली नकल करता है।

---

## स्मृति और गति : ठोस अंक

Hermes-3-3B से Luna-Protocol-1.5B जाने पर मापने योग्य लाभ लाता है :

| मीट्रिक | Hermes-3-3B Q8_0 | Luna-Protocol Q4_K_M | सुधार |
|--------|-------------------|----------------------|-------------|
| VRAM उपयोग | ~3 Go | ~986 Mo | **67 % कम** |
| मॉडल फाइल आकार | ~3,2 Go | ~986 Mo | **69 % छोटा** |
| token पीढ़ी | ~30 tok/s | ~60+ tok/s | **2x तेज** |
| cold शुरू | ~8s | ~3s | **62 % तेज** |
| संदर्भ विंडो | 8192 | 8192 | समान |

### गति लाभ असली क्यों है

छोटे मॉडल अनुमान में मौलिक तेज हैं। 3B के बजाय 1,5B पैरामीटर से :

- प्रति token **कम आव्यूह गुणा** : attention परतें, FFN परतें और output प्रक्षेपण सभी पैरामीटर संख्या से रैखिक बढ़ते हैं
- **बेहतर cache उपयोग** : छोटा मॉडल अपने ज्यादा भार L2/L3 cache में रखता है
- **स्मृति bandwidth पर कम दबाव** : प्रति token VRAM से पढ़ने को कम octet

मामूली कॉन्फ़िगरेशन, सिर्फ CPU (2 core, बिना GPU) पर, 1,5B मॉडल 3B मॉडल की लगभग **2 गुना गति** से token बनाता है। यही "बॉट जैसा लगता है" और "वास्तविक व्यक्ति टाइप करता लगता है" के बीच अंतर है।

### prompt cache फायदा बढ़ाता है

Luna Protocol cache सक्षम (`--cache-reuse 256`) `llama-server` इस्तेमाल करता है। इसका मतलब है :

1. सत्र का पहला संदेश prompt प्रोसेसिंग की पूरी लागत चुकाता है (तंत्र प्रॉम्प्ट + few-shot उदाहरण + उपयोगकर्ता संदेश)
2. अगले संदेश सिर्फ *नए* token प्रोसेस करते हैं, क्योंकि cache उपसर्ग फिर से इस्तेमाल होता है
3. 5 few-shot उदाहरणों (~50-150 token) से, पहली query बाद overhead नगण्य हो जाता है

few-shot उदाहरण व्यवहार में सत्र के पहले संदेश बाद "मुफ्त" हो जाते हैं। मॉडल शून्य सीमांत लागत पर शैली मार्गदर्शन पाता है।

---

## कार्यान्वयन : कोड में यह कैसे काम करता है

Luna Protocol few-shot तंत्र साफ और न्यूनतम है। तीन फाइलें सब संभालती हैं।

### 1. कॉन्फ़िगरेशन (`config.yml`)

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

कॉन्फ़िगरेशन गर्म reload योग्य है। उदाहरण बदलते हैं, सहेजते हैं, और बॉट बिना पुनरारंभ तुरंत नई शैली अपनाता है।

### 2. स्वरूपण और इंजेक्शन (`src/core/few-shot.ts`)

`formatFewShotExamples()` फंक्शन YAML उदाहरणों को ChatML संदेश ऑब्जेक्ट में बदलता है :

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

`injectFewShotIntoConversation()` फंक्शन उन्हें तंत्र प्रॉम्प्ट ठीक बाद रखता है :

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

### 3. एकीकरण (`src/core/llm-client.ts`)

LLM के हर कॉल से पहले, few-shot उदाहरण डाले जाते हैं अगर वे सक्षम हैं :

```typescript
let finalMessages = messages;
if (FEW_SHOT_ENABLED && FEW_SHOT_EXAMPLES.length > 0) {
  const fewShotMessages = formatFewShotExamples(FEW_SHOT_EXAMPLES);
  finalMessages = injectFewShotIntoConversation(messages, fewShotMessages);
}
```

मॉडल पाता है : `[तंत्र_प्रॉम्प्ट] + [few_shot_उदाहरण] + [बातचीत_इतिहास]`

---

## Discord-Dialogues शैली बनाए रखना

मूल Discord-Dialogues डेटासेट की बहुत विशिष्ट बातचीत हस्ताक्षर है :

- **छोटे संदेश** : प्रति मोड़ औसत 32,8 token
- **अनौपचारिक register** : संक्षिप्त, छोटे अक्षर, विराम चिह्न अनुपस्थिति
- **तेज आदान प्रदान** : लंबे एकालाप के बजाय कई छोटे आदान प्रदान
- **स्वाभाविक अपूर्णताएँ** : टाइपो, "lol", "fr", "ngl", "tbh"

Luna Protocol मॉडल दो तंत्रों से यह शैली संरक्षित करता है :

### 1. fine-tuning आधार वितरण खिसकाता है

50k प्रशिक्षण नमूने मॉडल को Discord बातचीत की **सांख्यिकीय छाप** सिखाते हैं। वह सीखता है कि उत्तर आमतौर पर छोटे, छोटे अक्षरों और अनौपचारिक होते हैं। यह मॉडल का डिफ़ॉल्ट output Qwen के "सहायक सहायक" मोड से दूर करता है।

### 2. few-shot priming परिणाम lock करता है

few-shot उदाहरण ठीक fine-tuning के दौरान सीखे पैटर्न मजबूत करते हैं। वे **शैलीगत लंगर** की तरह काम करते हैं : भले ही मॉडल लंबी बातचीत में थोड़ा औपचारिक स्वर की ओर बहे, संदर्भ में मौजूद उदाहरण उसे पीछे लाते हैं।

संयोजन हर तंत्र अकेले से ज्यादा शक्तिशाली है :
- few-shot के बिना fine-tuning : मॉडल *वैश्विक* शांत है लेकिन असंगत
- fine-tuning के बिना few-shot : मॉडल उदाहरण पालन करने की कोशिश करता है लेकिन बार बार सहायक मोड में लौटता है
- fine-tuning + few-shot : मॉडल **लगातार** पात्र में रहता है

---

## दर्शन : छोटा मॉडल, चतुर prompting

LLM परिनियोजन में परंपरागत बुद्धि कहती है "बड़ा बेहतर है"। ज्यादा पैरामीटर, ज्यादा प्रशिक्षण डेटा, ज्यादा VRAM। Luna Protocol उल्टा रास्ता लेता है :

- **3B के बजाय 1,5B** : आधे पैरामीटर, आधी स्मृति, दो गुना तेज
- **7,3M के बजाय 50k नमूने** : कम प्रशिक्षण डेटा, संदर्भ में सीखने के लिए ज्यादा लचीलापन
- **तंत्र प्रॉम्प्ट के बजाय few-shot priming** : मॉडल को सिर्फ बताने के बजाय वह दिखाना जो हम चाहते हैं

यह माना डिजाइन चुनाव है, साधारण तकनीकी अनुकूलन से कहीं ज्यादा। Discord बॉट को सामान्यवादी सहायक के बजाय हल्का बातचीत साथी रहना होगा। उसे serveur के पूरे VRAM बजट निगले बिना, सुसंगत, तेज "nm just chillin, u" कहना होगा।

परिणाम : बॉट जो 5 $/महीना VPS पर चलता है, वास्तविक समय टाइपिंग का आभास देने को काफी तेज token बनाता है, और fine-tuning और few-shot priming संयोजन से सुसंगत व्यक्तित्व बनाए रखता है जो हिस्सों योग से ज्यादा है।

---

## स्थापना

### मॉडल डाउनलोड करना

```bash
npm run download-model
# Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf डाउनलोड करता है
```

या [HuggingFace](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) से मैन्युअल।

### कॉन्फ़िगर करना

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

### चलाना

```bash
npm run dev                    # dev (गर्म reload)
npm run build && npm start     # production
./start.sh                     # PM2 (llama-server के साथ production)
```

---

## निष्कर्ष

Luna Protocol मॉडल साबित करते हैं कि शैली केंद्रित संवादात्मक AI के लिए, **कम बेहतर है**। सावधानी से चुने 50k नमूनों पर प्रशिक्षित 1,5B मॉडल, कुछ उदाहरणों से शुरू किया, लाखों उदाहरणों पर प्रशिक्षित 3B मॉडल से बेहतर होता है, स्मृति लागत के अंश और दो गुना पीढ़ी गति के लिए।

few-shot priming छोटे मॉडलों के लिए केंद्रीय तंत्र है। यही उन्हें वास्तविक समय बातचीत application के लिए व्यवहार्य बनाता है। उदाहरण सिर्फ "मदद" से कहीं ज्यादा करते हैं : वे मौलिक मॉडल व्यवहार बदलते हैं, ठीक उस प्रारूप को नकल करके जिस पर वह प्रशिक्षित हुआ था।

कोड ओपन सोर्स है, मॉडल HuggingFace पर है, और डेटासेट सार्वजनिक है। अगर तुम बातचीत बॉट बनाना चाहते हो जो मानव लगता है, तो नुस्खा है : छोटा मॉडल, सीमित fine-tuning, ठोस few-shot शुरुआत।

| संसाधन | लिंक |
|----------|------|
| GitHub रिपॉजिटरी | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| मॉडल (HuggingFace) | [fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) |
| डेटासेट | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| पहला लेख | [Luna Protocol : मैंने स्वायत्त Discord बॉट बनाया](/articles/en/luna-protocol-discord-bot) |
