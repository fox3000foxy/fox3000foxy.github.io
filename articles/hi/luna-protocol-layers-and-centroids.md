---
title: "Luna Protocol : दिमागों की साझेदारी, भावनात्मक वर्गीकरण, और दिलचस्प/तुच्छ routing"
description: "Luna Protocol monolithe से चार परत आर्किटेक्चर में गया : adaptateur, brain, भावनात्मक वर्गीकरणकर्ता, और inference। कार्यक्रम में : embedding centroid, दिलचस्प/तुच्छ routing, और valence और arousal से LLM पैरामीटर समायोजन।"
date: 2026-07-27
tags:
  - discord
  - matrix
  - llm
  - architecture
  - embeddings
  - centroids
  - emotion-ai
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "7U67LVfGJQ96M5S4VxBk3ScCyizRiSC3p0T1DV+ooN2weaJRFy0CKhE5fmiJH16QN89F0b3Q34YbD+uqe4luWQ=="
---

# Luna Protocol : दिमागों की साझेदारी, भावनात्मक वर्गीकरण, और दिलचस्प/तुच्छ routing

पिछले [दो](/articles/fr/luna-protocol-discord-bot) [लेखों](/articles/fr/luna-protocol-official-models) में, मैंने Luna Protocol को जटिल व्यवहार तंत्र और fine-tune मॉडल वाले अनोखे Discord बॉट के रूप में पेश किया। लेकिन आर्किटेक्चर तब से काफी विकसित हुआ है। जो monolithe था : एक ही Node.js प्रक्रिया जो Discord बॉट, व्यवहार, और LLM कॉल एक साथ संभालती थी, वह **चार स्वतंत्र परतों** में बदल गया है, हर एक अपनी जिम्मेदारी, अपनी भाषा, और अपने जीवन चक्र के साथ।

इस अलगाव ने अप्रत्याशित लाभ लाए : कई प्लेटफार्मों के बीच "दिमागों" की साझेदारी, भावनात्मक वर्गीकरण तंत्र जो LLM पैरामीटर गतिशील समायोजित करता है, और बातचीत के महसूस महत्व अनुसार दो मॉडलों के बीच संदेशों का बुद्धिमान routing।

विकास एक बार में नहीं हुआ : वह जैविक रास्ते चला। मैंने पहले बॉट repo से `server/` फोल्डर अलग किया, इस तरह एक तरफ **Krystal** बनाया और **Jade** को Discord adaptateur छोड़ा। फिर मैंने Jade के `llm-core` और घटना बस लेकर **Pixieglow** (Matrix adaptateur) बनाया। फिर DistilBERT से GENERIC/SEMANTIC वर्गीकरण लाने के लिए **Sapphire** आया। परिणाम निर्णायक नहीं थे, इसलिए मैं embedding centroid से गुजरा, उदाहरण समृद्धि के लिए ज्यादा लचीले और ज्यादा सटीक ; वर्गीकरण FUTILE/INTERESSANT बना। मैंने LLM तापमान और repeat penalty नियमित करने के लिए **valence** और **arousal** centroid आखिर जोड़े। अंत में, **Emerald**, साझा दिमाग बनाकर Jade और Pixieglow के बीच सारा अतिरेक कोड हटाया, Jade और Pixieglow को साधारण socket-driven client बनाया।

समानांतर में, मैंने web साइट अद्यतन रखी जो प्रोजेक्ट प्रगति बताती है : [protocol-luna.github.io](https://protocol-luna.github.io/)।

यह लेख बताता है कि मैंने ये परतें कैसे और क्यों काटीं, हर service ठीक क्या करता है, और **centroid** (embedding के औसत सदिश) और **भावना चर** (70 के दशक के PARRY chatbot से प्रेरित) जैसी अवधारणाओं ने साधारण Discord बॉट को आश्चर्यजनक सुसंगत बहु मंच तंत्र में कैसे बदला।

---

## monolithe की समस्या

शुरू में, Luna Protocol एक ही Node.js प्रक्रिया में समाता था। कोड संभालता था :

- Discord कनेक्शन (Eris लाइब्रेरी से)
- trigger मूल्यांकन (उल्लेख, keyword, follow-up...)
- मानवीय व्यवहार अनुकरण (टाइपो, हिचकिचाहट, नींद...)
- स्थानीय LLM serveur (llama.cpp) को HTTP कॉल
- सत्र और एंटी spam प्रबंधन
- TTS पाइपलाइन

सब उसी प्रक्रिया में था, typed घटना बस (`TypedBus`) से संवाद करता हुआ। यह काम करता था, लेकिन सीमाओं के साथ :

- Matrix client **जोड़ना असंभव** व्यवहार का सारा कोड दोहराए बिना
- **एक ही repo में LLM और बॉट** : `server/` फोल्डर पहले से मौजूद था, लेकिन एक को दूसरे को छुए बिना विकसित करना असंभव
- **अविभेदित प्रोसेसिंग** : हर संदेश वैसे ही प्रोसेस होता था, "lol" हो या अस्तित्वगत प्रश्न
- **भावनात्मक स्मृतिलोप** : बॉट कुछ "महसूस" नहीं करता था

परतों में काटने ने ये सभी समस्याएँ सुलझाईं।

---

## चार परतें

Luna Protocol की वर्तमान आर्किटेक्चर चार स्तर funnel की तरह व्यवस्थित है :

```
Matrix / Discord
      |
      v
  [ADAPTATEURS]      Pixieglow (Matrix) / Jade (Discord)
      |
      v
  [BRAIN]            Emerald (WebSocket, port 3126)
      |
      v
  [CLASSIFIEUR]      Sapphire (HTTP, port 3123)
      |
      v
  [INFERENCE]        Krystal (llama.cpp, ports 3124 / 3125)
```

हर परत स्वतंत्र पुनरारंभ, अद्यतन, या बदली जा सकती है।

---

### परत 1 : adaptateur (Pixieglow और Jade)

ये सबसे सरल परतें हैं। उनका एकमात्र काम संदेश मंच की घटनाओं को Emerald की ओर मानकीकृत प्रोटोकॉल में अनुवाद करना है :

- **Jade** Discord adaptateur है। वह Discord से जुड़ने के लिए Eris लाइब्रेरी इस्तेमाल करता है और WebSocket से Emerald की ओर संदेश forward करता है। वह TTS पाइपलाइन भी संभालता है (Piper से ध्वनि संश्लेषण, OGG में रूपांतरण, Discord पर upload)।
- **Pixieglow** Matrix adaptateur है। वह सीधे Matrix HTTP Client-Server API इस्तेमाल करता है (कोई SDK नहीं), long-poll sync के साथ। उसके पास TTS नहीं है।

दोनों adaptateur `emerald-client.ts` में परिभाषित वही WebSocket प्रोटोकॉल साझा करते हैं :

```typescript
type ClientId = "jade" | "pixieglow";

// घटनाएँ (adaptateur -> Emerald)
type InEvent = MessageEvent | ReadyEvent | BotMessageEvent | PresenceEvent;

// कमांड (Emerald -> adaptateur)
type OutCommand = RespondCommand | TypingCommand | SetPresenceCommand
                | SpontaneousCommand | ForgotCommand;
```

वही इंटरफेस वाले दो adaptateur का अस्तित्व साझेदारी साबित करता है : **वही "दिमाग" (Emerald) उदासीन Discord बॉट और Matrix बॉट सेवा देता है**, समान व्यवहारों के साथ। प्रोटोकॉल घोषणात्मक है : Emerald adaptateur को नहीं कहता संदेश *कैसे* भेजना है, वह कहता है *क्या* भेजना है (विलंब वाला पाठ, संभवतः burst योजना, प्रतिक्रिया, आदि)। हर adaptateur अपने मंच अनुसार ठोस निष्पादन लागू करता है।

इस आर्किटेक्चर की ताकत यही है : Telegram, Signal, या अन्य समर्थन जोड़ने के लिए, WebSocket प्रोटोकॉल लागू करने वाला adaptateur लिखना काफी है।

---

### परत 2 : दिमाग (Emerald)

Emerald केंद्रीय निर्णय service है। वह WebSocket पर port 3126 सुनता है और संभालता है :

- **trigger मूल्यांकन** : उल्लेख, DM, नाम, keyword, follow-up, बेतरतीब
- **व्यवहार अनुकरण** : एकाग्रता विलंब, टाइपो, हिचकिचाहट, भूल, burst, विषयगत थकान
- **नींद चक्र** : sleep / slow / short मोड
- **सत्र प्रबंधन** : cooldown, सत्र सीमाएँ, एंटी spam
- **Sapphire की ओर routing** : संदेश भेजना, stream उत्तर प्राप्ति

Emerald केंद्रीय service है जिसने साझेदारी संभव की, और वह है जिसने अलगाव से सबसे ज्यादा लाभ पाया। पहले, हर व्यवहार (typo, burst, hesitation) Discord कोड से गुँथा था। अब, वे `behavior/` में समर्पित मॉड्यूल में हैं :

```
emerald/src/behavior/
  burst.ts         -- बौछार संदेश योजना
  mannerisms.ts    -- विलंब, हिचकिचाहट, प्रतिक्रियाएँ, भूल
  sleep.ts         -- नींद समय मूल्यांकन
  typo.ts          -- टाइपो अनुकरण (AZERTY/QWERTY)
```

दिमाग नहीं जानता कि वह किस मंच पर चलता है। वह `clientId` ("jade" या "pixieglow") वाला `MessageEvent` पाता है, निर्णय लेता है, और कमांड लौटाता है। बाकी adaptateur संभालता है।

---

### परत 3 : भावनात्मक वर्गीकरणकर्ता (Sapphire)

Sapphire तकनीकी तल पर सबसे दिलचस्प service है। यह FastAPI वाला Python **LLM middleware** है, जो चार महत्वपूर्ण भूमिकाएँ निभाता है :

1. embedding centroid से **द्विआधारी वर्गीकरण FUTILE / INTERESSANT**
2. centroid से **भावनात्मक स्कोरर** (valence / arousal)
3. Krystal की ओर **backend router** (छोटा मॉडल बनाम बड़ा मॉडल)
4. **few-shot इंजेक्टर** और सत्र प्रबंधक

#### centroid : वर्गीकरण का हृदय

**centroid** सरल अवधारणा है : embedding सदिशों के समुच्चय का औसत है। ठोस रूप में, मैंने संदेशों के सैकड़ों उदाहरण एकत्र किए, उन्हें embedding मॉडल (`BAAI/bge-small-en-v1.5`, 384 आयाम) में डाला, और प्राप्त सदिशों का औसत निकाला।

**दो वर्गीकरण centroid** हैं :

- `futile_centroid` : k-means (k=10, seed=42) से ~683 तुच्छ संदेश ("lol", "ok", "hello")
- `interessant_centroid` : k-means (k=10, seed=42) से ~678 महत्वपूर्ण संदेश (तकनीकी, व्यक्तिगत, दार्शनिक)

जब संदेश आता है :

```python
def classify(text, embedder, futile_centroids, interessant_centroids):
    emb = embedder.query_embed(text)                     # 384-D सदिश
    sim_f = max(cos(emb, c) for c in futile_centroids)     # 10 पर अधिकतम
    sim_i = max(cos(emb, c) for c in interessant_centroids) # 10 पर अधिकतम
    diff = sim_i - sim_f
    label = "INTERESSANT" if diff > 0 else "FUTILE"
    return label, abs(diff), sim_f, sim_i
```

प्रति वर्ग स्कोर उसके 10 centroid में **अधिकतम cosine समानता** है। यह हर श्रेणी में उप प्रकार पकड़ता है : अभिवादन और विदाई दोनों 10 तुच्छ centroid में से एक के पास गिरते हैं भले ही वे embedding स्थान में दूर हों। शुरू में सिर्फ k-means और निष्पादन पर बिंदु गुणनफल : बिना प्रशिक्षण, बिना GPU।

#### दो मॉडल क्यों ?

इस वर्गीकरण का परिणाम तय करता है कि कौन सा LLM backend बुलाया जाता है :

| लेबल | Krystal Backend | मॉडल | Port |
|-------|----------------|--------|------|
| `FUTILE` | `generic` | Luna-Protocol-1.5B (941 Mo, Q4_K_M) | 3124 |
| `INTERESSANT` | `semantic` | Hermes-3-3B या 8B (config अनुसार) | 3125 |

अंतर्ज्ञान सरल है : "lol" या "nm just chillin u" 8 अरब पैरामीटर मॉडल बुलाने योग्य नहीं है। 200 000 Discord नमूनों पर प्रशिक्षित छोटा fine-tune Luna 1.5B मॉडल हल्के आदान प्रदान के लिए काफी है। इसके विपरीत, जीवन प्रश्न, विश्वास, या तकनीकी बहस बड़े मॉडल की ओर route होती है जो समृद्ध उत्तर बना सकता है।

यह किफायती routing LLM serveur भार काफी घटाता है : लगभग 70% संदेश FUTILE वर्गीकृत होते हैं और छोटे मॉडल से प्रोसेस होते हैं, बड़े मॉडल को उन बातचीत के लिए मुक्त करते हुए जो सच में योग्य हैं।

#### भावनात्मक अक्ष : valence और arousal

लेकिन बस इतना नहीं। Sapphire संदेश भावना मूल्यांकन के लिए स्वतंत्र अक्ष पर **वही centroid तंत्र** इस्तेमाल करता है :

**चार भावनात्मक centroid** हैं :

| ध्रुव | उदाहरण |
|------|----------|
| `positive` | "hell yeah", "love that", "this is great" |
| `negative` | "shut up", "i hate this", "this sucks" |
| `high_arousal` | "WHAT THE HELL", "omg omg omg", "AAAAA" |
| `low_arousal` | "just chilling", "meh", "i guess" |

स्कोर हर अक्ष पर समानता अंतर के रूप में गणना होता है :

```python
valence = sim(emb, positive) - sim(emb, negative)     # [-1, +1]
arousal = sim(emb, high_arousal) - sim(emb, low_arousal)  # [-1, +1]
```

**Valence** मापती है कि संदेश सकारात्मक है या नकारात्मक। **Arousal** उसकी भावनात्मक तीव्रता मापता है। एक साथ, वे affect का circumplex मॉडल (Russell, 1980) बनाते हैं, वही मनोवैज्ञानिक मॉडल जिसने 1972 में **PARRY** chatbot प्रेरित किया था।

#### भावना चर : भावनाएँ LLM कैसे नियंत्रित करती हैं

यहीं PARRY प्रेरणा ठोस होती है। PARRY (1972 में Kenneth Colby बनाया) chatbot था जो पागल रोगी अनुकरण के लिए डिजाइन किया गया था। उसके पास आंतरिक चर (भय, क्रोध, अविश्वास) थे जो उसके उत्तर बदलते थे। उदाहरण के लिए, "डरा" PARRY ज्यादा आक्रामक जवाब देता था।

Sapphire वही करता है, लेकिन सतत चरों और ज्यादा सुरुचिपूर्ण विधि से : LLM नमूनाकरण पैरामीटर बातचीत भावनात्मक स्थिति अनुसार वास्तविक समय समायोजित होते हैं।

##### तापमान arousal का अनुसरण करता है

```python
temperature = clamp(0.7 + arousal * 0.3, 0.4, 1.0)
```

| Arousal | तापमान | प्रभाव |
|---------|-------------|-------|
| -1.0 (शांत) | 0.40 | कम रचनात्मकता, पूर्वानुमेय उत्तर |
| 0.0 (तटस्थ) | 0.70 | डिफ़ॉल्ट रचनात्मकता |
| +1.0 (उत्तेजित) | 1.00 | अधिकतम बेतरतीबता, आश्चर्यजनक उत्तर |

जब कोई उत्तेजित या नाराज होता है (उच्च arousal), तापमान बढ़ता है। मॉडल ज्यादा विविध, ज्यादा रचनात्मक, कभी ज्यादा अराजक उत्तर बनाता है, मानव की तरह जो "बहक जाता" है। जब बातचीत शांत होती है, तापमान घटता है, उत्तर ज्यादा शांत होते हैं।

##### repeat penalty valence का अनुसरण करता है

```python
repeat_penalty = clamp(1.15 - valence * 0.1, 1.0, 1.3)
```

| Valence | Repeat Penalty | प्रभाव |
|---------|---------------|-------|
| -1.0 (नकारात्मक) | 1.25 | मजबूत दंड, दोहराव से बचता है |
| 0.0 (तटस्थ) | 1.15 | डिफ़ॉल्ट मान |
| +1.0 (सकारात्मक) | 1.05 | कमजोर दंड, दोहराव देता है |

बातचीत जितनी नकारात्मक, मॉडल उतना दोहराने से बचने को धकेला जाता है, किसी की तरह जो तनावपूर्ण बहस में शब्द खोजता है। बातचीत जितनी सकारात्मक, मॉडल उतना अतिरेक कथन दे सकता है, शांत बातचीत की तरह।

##### संचयी भावनात्मक स्थिति

ये स्कोर सिर्फ तात्कालिक संदेश पर नहीं हैं। `EmotionState` प्रति सत्र valence और arousal की **घातांकीय चल औसत** रखता है :

```python
class EmotionState:
    def __init__(self, decay=0.85, deadzone=0.06):
        self.decay = decay
        self.deadzone = deadzone

    def update(self, key, valence_delta, arousal_delta):
        if abs(valence_delta) < self.deadzone:
            valence_delta = 0.0
        if abs(arousal_delta) < self.deadzone:
            arousal_delta = 0.0
        s = self._state.setdefault(key, {"valence": 0.0, "arousal": 0.0})
        s["valence"] = s["valence"] * self.decay + valence_delta * (1 - self.decay)
        s["arousal"] = s["arousal"] * self.decay + arousal_delta * (1 - self.decay)
        return s
```

0.85 `decay` का मतलब है कि हर संदेश पर पिछली स्थिति का 85% रखा जाता है, और नए संकेत का 15% एकीकृत होता है। यह **भावनात्मक स्मृति** देता है जो क्रूर बदलाव चिकना करती है : एक ही नकारात्मक संदेश बॉट को "उदास" नहीं बनाता, लेकिन नकारात्मक संदेशों की शृंखला धीरे धीरे उसका मूड बहाती है।

व्यवहार में : अगर कोई बातचीत बहुत उत्तेजित (`arousal=+0.8`) शुरू करता है, तो तापमान कई आदान प्रदान तक ऊँचा रहता है, भले ही अगले संदेश शांत हों। भावना नीचे आने में समय लेती है, मानव की तरह जो बहस बाद "गरम" रहता है।

---

### परत 4 : inference (Krystal)

Krystal सबसे निचली परत है : `llama.cpp` के चारों ओर wrapper जो OpenAI संगत API (`/v1/chat/completions`) उजागर करता है। वह दो PM2 उदाहरणों में चलता है :

- `krystal-small` : fine-tune Luna 1.5B मॉडल, port 3124 पर, CPU आत्मीयता 0 के साथ
- `krystal-large` : Hermes 3B मॉडल, port 3125 पर, CPU आत्मीयता 0,1 के साथ

दोनों उदाहरण पूर्व संकलित `llama-server` प्रक्रियाएँ हैं, CPU pinning के लिए `taskset` से चलाई गई।

Luna मॉडल fine-tune भी दूसरे लेख से विकसित हुआ है : वह अब **200 000 नमूनों** (पहले 50 000 के मुकाबले) पर प्रशिक्षित है, हमेशा QLoRA से Qwen2.5-1.5B-Instruct से। 200k नमूने Discord-Dialogues डेटासेट का उपसमुच्चय हैं, सिर्फ सबसे स्वाभाविक और सबसे विविध बातचीत रखने के लिए छाँटे गए। लक्ष्य : few-shot priming को प्रभावी बनाने वाले लचीलेपन खोए बिना मॉडल का शैलीगत दायरा बढ़ाना।

---

## पूरा schema : पारगमन में संदेश

यहाँ ठोस रूप में होता है जब कोई Discord पर "je suis vraiment triste aujourd'hui" भेजता है :

1. **Jade** Discord API Gateway से संदेश पाता है। वह उसे `MessageEvent` में बदलता है और WebSocket से Emerald को भेजता है।
2. **Emerald** trigger मूल्यांकित करता है (उल्लेख ? नाम ? keyword ?)। यह सीधा उल्लेख है। वह एकाग्रता विलंब गणना करता है, cooldown, सत्र, विषयगत थकान जाँचता है। वह जवाब देने का फैसला करता है और HTTP से Sapphire को संदेश भेजता है।
3. **Sapphire** संदेश `bge-small-en-v1.5` से embed करता है।
   - वर्गीकरण : संदेश `futile` centroid से ज्यादा `interessant` centroid के करीब है (diff = +0.31) -> **INTERESSANT**
   - भावना : नकारात्मक valence (-0.42), मध्यम arousal (0.35)
   - Routing : दिशा `KRYSTAL_SEMANTIC_URL` (port 3125, बड़ा मॉडल)
   - नमूनाकरण पैरामीटर : तापमान = 0.80 (बढ़ा arousal), repeat_penalty = 1.19 (नकारात्मक valence)
   - सत्र भावनात्मक स्थिति इन मानों से अद्यतन होती है
4. **Krystal** (बड़ा उदाहरण) भावनात्मक समायोजित पैरामीटर से उत्तर बनाता है और Sapphire को लौटाता है।
5. **Sapphire** उत्तर Emerald की ओर stream करता है मेटाडेटा (लेबल, valence, arousal, डिबग आँकड़े) के साथ।
6. **Emerald** हिचकिचाहट ("oh...") जोड़ने का फैसला करता है, burst योजना बनाता है (2 टुकड़े), और प्रतिक्रिया चुनता है। वह Jade को `RespondCommand` भेजता है।
7. **Jade** निष्पादित करता है : प्रारंभिक विलंब प्रतीक्षा करता है, हिचकिचाहट वाला पहला टुकड़ा भेजता है, 1.5s प्रतीक्षा करता है, दूसरा टुकड़ा भेजता है। वह पूरी पीढ़ी के दौरान टाइपिंग सूचक दिखाता है।

यह सब उपयोगकर्ता के लिए 3 सेकंड से कम में।

---

## centroid : neural वर्गीकरणकर्ता से बेहतर क्यों है

DistilBERT जैसे पारंपरिक वर्गीकरणकर्ता (जैसा मैं पहले इस्तेमाल करता था) के बजाय embedding centroid चुनाव व्याख्या योग्य है।

neural वर्गीकरणकर्ता वर्गों के बीच निर्णय सीमा सीखता है, आमतौर पर अरैखिक रूपांतरण जो input को संभावनाओं की ओर प्रक्षेपित करता है। वह सटीक है, लेकिन :

- उसे लेबल प्रशिक्षण डेटा चाहिए
- वह वितरण बदलाव (data drift) के प्रति संवेदनशील है
- उसे व्याख्या करना मुश्किल है
- नई वर्ग जोड़ने के लिए उसे फिर से प्रशिक्षित करना होगा

centroid, इसके विपरीत, उदाहरण embedding का **औसत सदिश** है। वर्गीकरण इस औसत सदिश से cosine समानता से होता है। फायदे :

- **कोई प्रशिक्षण जरूरी नहीं** : हम हाथ से चुने उदाहरणों के embedding का औसत गणना करते हैं
- **व्याख्या आसान** : हम देख सकते हैं कि कौन से उदाहरण centroid के सबसे करीब हैं यह समझने के लिए "centroid ने क्या सीखा"
- **वर्ग जोड़ना** : हम बिना पुनः प्रशिक्षण नया centroid जोड़ते हैं
- **मजबूत** : centroid औसत है, इसलिए outlier का कम प्रभाव

centroid की असली शक्ति यह है कि वे वर्गीकरण समस्या को **स्थानिक दूरी माप** समस्या में बदलते हैं। हम श्रेणियों को 384 आयाम वाले स्थान में क्षेत्रों के रूप में देख सकते हैं (या आयाम न्यूनीकरण PCA/t-SNE बाद 2D/3D में)।

### centroid का 3D दृश्य

व्यवहार में, embedding स्थान में वर्गीकरण centroid ऐसे दिखते हैं। हर बिंदु उदाहरण संदेश है, PCA से 3D में प्रक्षेपित (दृश्य के लिए 384 मूल आयाम 3 घटाए गए)। नीले बिंदु तुच्छ संदेश हैं, पीले बिंदु दिलचस्प संदेश हैं। **20 हीरा marker** k-means centroid हैं (प्रति वर्ग 10, seed=42)। मूल उदाहरण पाठ देखने के लिए बिंदु पर mouse ले जाओ।

<iframe src="assets/centroids-plot.html" style="width:100%;height:550px;border:none;border-radius:8px;" loading="lazy" title="Classification par centroïdes - vue 3D interactive"></iframe>

दो परीक्षण उदाहरण लाल में दिखाए गए हैं : "lol" (तुच्छ वर्गीकृत) और "i feel sad today" (दिलचस्प वर्गीकृत)। 384 से 3 आयाम न्यूनीकरण बाद भी (14,7% व्याख्या भिन्नता), दोनों cluster स्पष्ट अलग हैं। ऊपर annotation सटीक गिनती और अस्पष्ट क्षेत्र दिखाता है।

input संदेश का centroid उसकी सामग्री अनुसार इस स्थान में घूमता है। FUTILE/INTERESSANT वर्गीकरण बस cosine समानता से निकटतम centroid मापना है। हम इस तरह हर संदेश को बहु आयामी स्थान में बिंदु के रूप में दर्शा सकते हैं, हर आयाम अर्थगत गुण से मेल खाता है।

---

## व्यवहार में यह क्या बदलता है

उपयोगकर्ता परतें, centroid, या तापमान समायोजन नहीं देखते। लेकिन वे प्रभाव महसूस करते हैं :

- सरल संदेशों के लिए **तेज उत्तर** (छोटा मॉडल 2x तेज है और 70% ट्रैफिक संभालता है)
- **अनुकूली स्वर** : अगर तुम नाराज हो, तो बॉट नाराजगी "महसूस" करता है और अपनी शैली अनुकूलित करता है
- **cross-platform सुसंगतता** : Matrix बॉट और Discord बॉट वही दिमाग और वही भावनात्मक स्थिति साझा करते हैं
- **संरक्षित प्रामाणिक स्वर** : fine-tune + few-shot + बुद्धिमान routing corporate उत्तरों से बचता है

छोटे मॉडल के लिए 200k प्रशिक्षण नमूनों पर जाना इन प्रभावों को और मजबूत करता है : मॉडल few-shot priming संभव बनाने वाले लचीलेपन खोए बिना Discord बातचीत विविधता बेहतर पकड़ता है।

---

## पूरी बुनियादी ढाँचा

यहाँ वर्तमान में चल रही services हैं :

| Service | तकनीक | Port | भूमिका |
|---------|------------|---------|------|
| Pixieglow | TypeScript (Bun) | -- | Matrix Adaptateur |
| Jade | TypeScript (esbuild) | -- | Discord Adaptateur |
| Emerald | TypeScript (Bun) | 3126 (WebSocket) | दिमाग / निर्णय |
| Sapphire | Python (FastAPI) | 3123 (HTTP) | वर्गीकरणकर्ता + भावना |
| Krystal small | llama.cpp (PM2) | 3124 | छोटा मॉडल (1.5B, तुच्छ) |
| Krystal large | llama.cpp (PM2) | 3125 | बड़ा मॉडल (3B+, दिलचस्प) |

service निर्भरताएँ एकदिश हैं : adaptateur Emerald पर निर्भर, Emerald Sapphire पर निर्भर, Sapphire Krystal पर निर्भर। ग्राफ अचक्रीय रहता है। हर service स्वतंत्र पुनरारंभ हो सकती है।

---

## निष्कर्ष

Luna Protocol को चार परतों में बाँटना सिर्फ आर्किटेक्चर अभ्यास नहीं था। यह ठोस सीमाओं का उत्तर था : Matrix समर्थन असंभव, भावनात्मक चेतना कमी, संदेशों की बुद्धिमान प्राथमिकता अनुपस्थिति।

आज, तंत्र ज्यादा मजबूत है (LLM crash बॉट नहीं मारता), ज्यादा विस्तार योग्य (Telegram या WhatsApp adaptateur वही WebSocket प्रोटोकॉल चलेगा), और ज्यादा "जीवंत" : बॉट अपना व्यवहार, अपना स्वर, और यहाँ तक LLM पैरामीटर बातचीत की महसूस भावनात्मक स्थिति अनुकूलित करता है।

embedding centroid मुख्य तत्व हैं जो यह सब अत्यधिक जटिलता के बिना संभव बनाते हैं : कोई प्रशिक्षित neural network नहीं, कोई लेबल डेटा पाइपलाइन नहीं, सिर्फ सदिश औसत और cosine समानताएँ। यह सरल, अविश्वसनीय प्रभावी, और भयानक कम आँकी तकनीक है।

| संसाधन | लिंक |
|----------|------|
| प्रोजेक्ट web साइट | [protocol-luna.github.io](https://protocol-luna.github.io/) |
| Pixieglow | [protocol-luna/pixieglow](https://github.com/protocol-luna/pixieglow) |
| Emerald | [protocol-luna/emerald](https://github.com/protocol-luna/emerald) |
| Sapphire | [protocol-luna/sapphire](https://github.com/protocol-luna/sapphire) |
| Krystal | [protocol-luna/krystal](https://github.com/protocol-luna/krystal) |
| लेख 1 : Discord बॉट | [Luna Protocol : मैंने स्वायत्त Discord बॉट बनाया](/articles/fr/luna-protocol-discord-bot) |
| लेख 2 : fine-tuning | [Luna Protocol : मैंने 1,5B मॉडल fine-tune क्यों किया](/articles/fr/luna-protocol-official-models) |
