---
title: "Sabaki vs System One : डेविड बनाम गोलियत, दुनिया का सबसे छोटा डिसीजन मॉडल"
description: "20KB बनाम 421M पैरामीटर। Sabaki typed-decisions पर 7 पॉइंट हारता है लेकिन 25s CPU से <1ms offline पर आ जाता है। एक ऑर्गनाइजेशनल MoE की चीरफाड़।"
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
author_sig: "QHcxyfjqaNdCmefAhyyDRPLgOsx8zHRJ5pOVOJZHcUaNPBLEZl1Tt+X1/EwJzgjGwcy0t8CyYifFGmNrZxEp/w=="
---

## परिचय

अगर तुम सितंबर से Hacker News या Twitter पर घूम रहे हो, तो Jev तुम्हारी नजर से बचा नहीं होगा।

15 सितंबर 2026 को TypeSafe ने Jev निकाला, उनका पहला "System One"। पिच एक लाइन में निपट जाता है : LLM से JSON उगलवाकर label चुनना बंद करो। उसे एक `state` दो और typed सवाल दो, वह typed decision लौटाएगा probas के साथ। एक pass, sample करने के लिए zero token, पीछे कुछ parse नहीं करना।

यह फट पड़ा। Vercel AI Gateway पर पहले दिन रिकॉर्ड adoption, कुछ दिनों में पांच Elixir client, हर कोई Jev को अपनी चीज से benchmark कर रहा। और ईमानदारी से hype समझ आता है। सालों से हम `सिर्फ {"choice": ...} के साथ जवाब दो` वाले prompt जुगाड़ रहे थे और मन्नत मांग रहे थे कि मॉडल कोई option गढ़ न ले, JSON न तोड़े, कोई field hallucinate न करे। Jev ने इस जरूरत को नाम दिया और clean API में ship कर दिया : `POST /v1/systemone`, सवाल `choice / score / noul`, जवाब `probabilities` + `confidence` के साथ।

मुझे idea बहुत पसंद आया। eco मॉडल, कम खर्च, और साफ कहूं तो मैंने Jev के लिए कभी पैसे नहीं दिए।

क्योंकि पीछे Jev अब भी closed API है। weights अज्ञात, self-host नामुमकिन, हर decision मतलब एक network round-trip और एक मीटर जो घूमता रहता है। और जो open alternative पीछे आए वे GPU अनिवार्य के साथ 400M पैरामीटर पर खेल रहे हैं।

तो मैंने दूसरा extreme बना दिया : [Sabaki](https://sabaki.fox3000foxy.com/)। एक keyword router और pure TypeScript में logistic regression जो Jev वाला contract बोलता है (वही `choice / score / noul` shapes, वही `/v1/systemone` endpoint), लेकिन जो चलता है **<1ms** में **20 kilobyte** JSON के साथ। nano mode में zero dependency, offline, 0€।

scale समझने के लिए : Laya मतलब 843 MB safetensors load करना। OpenDecider-nano मतलब 2 GB RAM। Sabaki nano invoices मतलब 20 KB। वजन का ratio करीब **40 000** बैठता है।

अगर तुम्हें नपी-तुली version चाहिए, तो साइट पर अक्टूबर 2026 का preprint v1 है : *Sabaki: An Organizational Mixture-of-Experts for Typed Decisions on CPU* ([PDF](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf))। Design, माप, tradeoff, सब कुछ उसमें है। यह article वही readable version है, साथ में खुला code।

मैंने इसे कोने में बैठकर paper-benchmark mode में नहीं लिखा। मैं contribute करता हूं [azalio/doomLaya](https://github.com/azalio/doomLaya) पर (मेरा fork : [fox3000foxy/doomLaya](https://github.com/fox3000foxy/doomLaya)), एक harness जहां Laya और Jev सच में FreeDoom खेलते हैं, model-owned decision, per-tick telemetry और video के साथ। मैंने Goliath को सच में खेलते देखा है, और network खांसते ही वह भी अटकता है।

चलो engine एक-एक करके खोलते हैं। हमेशा की तरह, असली code के साथ।

## वह ring जहां सब लड़ने को तैयार हैं

एक ही dataset है जिसे Jev, Laya और OpenDecider तीनों quote करते हैं : [LocalLLaMA/typed-decisions](https://huggingface.co/datasets/LocalLLaMA/typed-decisions)। 4 synthetic workflow (support, invoice, security, agent trace), हर case पर 5 सवाल, 1200 train case, 400 test, 2000 decision।

| मॉडल | पैरामीटर | टेस्ट स्कोर | लेटेंसी | कहां चलता है |
|---|---|---|---|---|
| OpenDecider-nano | ~400M | 0.796 | 17ms GPU | GPU, 2 Go RAM |
| Laya typed-decisions | 421M | 0.766 | ~25s/state CPU, ~830ms/cas MLX | GPU |
| Jev 1.13 | बंद | ~0.73-0.75 | ~710ms API | API only |
| **Sabaki mini** | 22M int8 | **0.69** | **~20ms CPU** | CPU, 22 Mo |
| **Sabaki nano** | ~0 | **0.61** | **<1ms** | हर जगह |
| Laya base zéro-shot | 421M | 0.362 | वही | GPU |

random 0.318 है, majority 0.461। तो fine-tune के बिना 0.362 पर Laya base मतलब "शराफत से तुक्का मार रहा हूं" वाला level। इसे याद रखो, आगे काम आएगा।

Sabaki को best से 7 पॉइंट अलग करते हैं। जब GPU नहीं है तो latency में 1000x का फासला दूसरी तरफ अलग करता है। पूरा article इन्हीं दो लाइनों में है, बाकी सब यह समझने के लिए है कि क्यों।

फिर भी ध्यान रहे : एक ही `choice / score / noul` socket के पीछे kitchen बिल्कुल अलग है। Jev मतलब closed API। Laya मतलब fine-tuned ModernBERT-large। OpenDecider मतलब distilled Ettin-encoder। Sabaki मतलब word count और int8 MiniLM। एक जैसा contract, कहीं अलग budget।

## Jev, वह थप्पड़ जो सबने देखा

TypeSafe का हक TypeSafe को देना पड़ेगा : System One contract सच में अच्छा idea है।

पहले ticket sort करने के लिए तुम यह करते थे : LLM से कहते "billing, technique और spam में चुनो, JSON में जवाब दो", जवाब parse करते, उन case को संभालते जहां वह बोलता "मेरे हिसाब से billing ! 😊" या चौथी category गढ़ लेता। हर सवाल token खर्च करता, हर जवाब तुम्हारी pipeline तोड़ सकता था।

Jev deal बदल देता है : तुम text और criteria वाले सवाल भेजते हो, वह हर सवाल को parallel में score करता है और typed value लौटाता है उसके distribution के साथ।

```bash
curl https://api.typesafe.ai/v1/systemone \
 -H "Authorization: Bearer $KEY" \
 -H 'content-type: application/json' \
 -d '{"state":"charge double ce mois-ci","questions":{"dept":{"type":"choice","instructions":"Route ce message.","criteria":{"billing":"paiements","technical":"bugs"}}}}}'
```

जवाब : `{ choice, probabilities, confidence }`। कोई free text नहीं। तुम्हारा code सीधे इस पर branch कर सकता है।

इसीलिए यह viral हुआ : Python और JS SDK, Claude Code plugin, LangChain integration, सब अपने agent एक दोपहर में जोड़ सकते थे। TypeSafe की doc healthy pattern भी धकेलती है : तेज छोटे judgment के लिए Jev, असली decision compose करने के लिए आसपास deterministic code, confidence low होते ही slow LLM या human।

दिक्कत बाकी चीज है। weights बंद, offline नामुमकिन, हर call पर कीमत। एक agent जो हर run में 100 decision लेता है, वहां tax चुभता है। 35 ticks/s वाले Doom के लिए तो dead है : doomLaya में Jev MAP01 seed 48 को 68.97s में निकालता है, p50 HTTP 357ms के साथ। run $0.0046 API cost दिखाता है, यह मेरा bill नहीं, benchmark का bill है। यह चलता है, run clean है, बिना मौत। लेकिन 35 ticks/s पर 357ms मतलब 12 tick जब game चलता रहता है और तुम network का wait करते हो।

Sabaki ने ठीक यही contract उठाया, वही सवाल, वही जवाब, वही `/v1/systemone` endpoint जो `serve()` serve करता है, और datacenter मांगने वाली हर चीज हटा दी।

## Laya, बड़ा open जिसने दिखाया कि बिना API भी हो सकता है

[Laya](https://github.com/NandhaKishorM/laya), Convai Innovations से, Apache-2.0। hood के नीचे : ModernBERT-large, 421M, हर option के लिए 1 `[MASK]` token। हर marker का hidden state छोटे MLP में जाता है, सवाल के option पर softmax। Jev की तरह हर सवाल पर एक pass।

```python
pipe = pipeline("text-classification", model="convaiinnovations/laya-typed-decisions")
```

0.766 पर रुकना बनता है। यह **benchmark के train पर fine-tuned** checkpoint है : 1200 case, logits पर Gaussian noise के साथ RLCD, log और spherical reward। वही मॉडल इस fit के बिना 0.362 पर गिरता है। सीधे कहें तो अंदाजा लगाता है। तो Laya स्कोर मतलब "बड़ा encoder और domain पर training", "जादुई बड़ा encoder" नहीं।

CPU पर यह ईंट है। नापा हुआ ONNX port हर state पर करीब 25s घूमता है। MLX FP16 में हर case पर औसत 830ms गिनो, p99 5.3s के साथ। और कुछ जवाब देने से पहले 843 MB load करना पड़ता है।

doomLaya में stock Laya MAP01 में 180s में fail होती है। adapted v3 ([azalio/laya-doom-v3](https://huggingface.co/azalio/laya-doom-v3)), Doom पर फिर से trained, 61.43s में p50 108ms MPS पर निकालती है, रास्ते में shotgun उठाते हुए। तो हां, यह खेलती है, dedicated training के बाद, Apple GPU पर, scripted executor के साथ जो असली काम करता है (A*, 15 tick latch वाले दरवाजे, auto aim)।

मेरा सार : तुम्हारी task पर training के बिना Laya 421M का paperweight है। training के साथ बहुत strong है, लेकिन GPU और साथ का data चाहिए।

## OpenDecider, जिसने leaderboard जीता

[OpenDecider](https://github.com/manjunathshiva/opendecider), यानी Manjunath ने सबको उनके अपने benchmark पर लेने की ठानी। नतीजा : **0.796**, full fine-tune Ettin-encoder-400m और MLP head के साथ, Qwen3-235B और DeepSeek से distilled soft target पर KL loss।

```bash
pip install opendecider
# L40S पर 17ms/question, M4 Max पर 18ms, batch में ~9ms
```

50% coverage पर selective accuracy 0.943 तक जाती है, Jev के 0.882 के खिलाफ। कागज पर दोनों दुनिया का best : open, calibrated, तेज।

practically : nano load करने के लिए 2 GB RAM, 17ms पकड़ने के लिए GPU जरूरी, phishing पर 0.63 बनाम Jev का 0.90 (OOD में धुल जाता है), और Laya की तरह benchmark के train पर trained। test कभी देखा नहीं, लेकिन domain हां।

यह arm-wrestling जीतता है, लेकिन पीछे अब भी GPU वाला 400M है। इसे Cloudflare Worker में या laptop पर game loop में नहीं घुसाओगे।

## 150M वाले, और नीचे खाली गड्ढा

openJev-verdict-2.0 (151M), julia-1 (144M multilingual), Open Jev (150M), Largha-150M (144M en+zh), Vela (0.3B-9B)। सब ModernBERT या mmBERT-small, सब CPU पर चलने लायक, सब train करने में मस्त (Open Jev Colab T4 पर 30min बताता है)। आंकड़े self-reported, protocol अलग-अलग, तो चुटकी भर नमक के साथ लो, लेकिन family मौजूद है।

generalist Sabaki **22.7M** है। इस पट्टी के सबसे छोटे से करीब 6.5x छोटा। runtime में define हुए सवालों का जवाब देने के लिए 100M से नीचे और कोई नहीं उतरता।

"दुनिया का सबसे छोटा" का यही मतलब है : best स्कोर नहीं, सबसे छोटा envelope जो तुम्हारे `instructions` और `criteria` पढ़ता है और फैसला करता है जब कोई specialist जवाब नहीं जानता।

## Sabaki, बेवकूफ router और उसके फेंकने लायक expert

चलो, बड़ों की बात बहुत हुई। David पर आते हैं, क्योंकि मजा यहीं शुरू होता है।

Sabaki दुनिया समझने वाला smart बड़ा मॉडल बनने की कोशिश नहीं करता। यह organizational MoE है : system level पर 1 sparse router, independent expert, हर input पर एक ही active। हर plugin अलग npm package है, अपना manifest, अपने weight, अपना version। जो route होता है वही install करते हो।

org [sabaki-js](https://github.com/sabaki-js) : 13 repo, core `sabaki` (129 commit), 6 `@sabaki-js/*` plugin, weight, Cloudflare worker, अपना वाला लिखने का template।

core का `package.json` पहले ही कहानी कह देता है :

```json
"dependencies": { "@typesafe-ai/sdk": "^0.7.0" },
"optionalDependencies": { "onnxruntime-node": "^1.22.0" }
```

nano mode में zero runtime dependency। सिर्फ compiled TypeScript, install करने को कुछ नहीं, दो ONNX version के बीच टूटने को कुछ नहीं।

### Router, या कुछ लाइनों में decide करना

router `src/index.ts` में रहता है, और tokenization ऐसी दिखती है (`src/index.ts:129`) :

```ts
function tokens(s: string): string[] {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/).filter((w) => w.length > 3);
}
```

lowercase, accent साफ, कम से कम 4 letter वाले शब्द। यह filter सारा noise उड़ा देता है ("le", "de", "ok")। support ticket पर इससे सब बदल जाता है क्योंकि matching meaningful शब्दों पर होती है।

scoring खुद `route()` में है (`src/index.ts:251`), और खेल यहीं निपटता है :

```ts
const hits = kws.filter((k) =>
  words.some((w) => w.includes(k) || k.includes(w))).length;
const score = hits / Math.sqrt(kws.length);
```

दोनों तरफ loose matching : `billing` पकड़ लेता है `billed` को, `invoice` पकड़ लेता है `invoicing` को। root से भाग देने से बड़ी keyword list penalize नहीं होती, वरना 600 शब्द वाला mail plugin हर mail में "hello" देखते ही सबको कुचल देता।

हर plugin का अपना threshold है, default 0.15 `src/index.ts:139` में रखा है, mail 0.03 पर क्योंकि subject छोटे होते हैं। इसके नीचे :

```ts
return { domain: "unknown", decision: null, confidence: 0, plugin: null };
```

unknown domain मतलब `unknown`, खुश करने के लिए गढ़ा हुआ guess कभी नहीं। यह जानबूझकर बेवकूफ approach है, और ठीक इसी से बाद में `automate > 0.8` thresholding usable बनती है : जब Sabaki जवाब देता है, मतलब सच में किसी specialist ने match किया है।

ऊपर से bonus language axis `langid` से : जो plugin `languages` declare करता है वह सिर्फ अपनी भाषा के लिए दौड़ता है। Latin बनाम CJK phishing अलग करने में handy। बहुत छोटा text मतलब कोई filter नहीं, सब दौड़ते हैं।

कुल cost : हर decision पर कुछ microsecond। multiply करने को कोई matrix नहीं, call करने को कोई network नहीं, सिर्फ string compare और एक division।

### Nano, repo में मेरी पसंदीदा file

`src/logreg.ts:28`, tokenization :

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

unigram और bigram। `charged twice` देता है `charged`, `twice`, और जोड़ी `charged twice`। 400M transformer निकाले बिना "double billing" पकड़ने के लिए बस इतना काफी है।

`src/logreg.ts:46`, vectorization, जहां TF-IDF असली काम करता है :

```ts
const tf = 1 + Math.log(c);  // सबलीनियर TF
const val = tf * w.idf[i]!;  // sklearn जैसा स्मूथ IDF
```

किसी शब्द की 10वीं बार मौजूदगी पहली से कम गिनती है, rare शब्द "please" से भारी हैं। बिल्कुल sklearn recipe, 20 सवालों पर exact parity verified।

और वह comment जिसने दोबारा पढ़ते हुए हंसाया :

```ts
// 3000 डाइमेंशन घुमाने के बजाय सिर्फ मौजूद टर्म छूता है (स्पार्स)।
for (const [t, c] of counts) {
```

हर ticket पर 3000 dimension घुमाने के बजाय तुम सिर्फ मौजूद बीस शब्द छूते हो। इसीलिए जवाब <1ms में आता है। ऐसा invisible detail जो prod में सब बदल देता है, क्योंकि complexity vocab size से नहीं ticket size से चलती है।

`src/logreg.ts:86`, inference, जो तीन लाइन में निपट जाता है :

```ts
// बाइनरी : कोएफ की 1 लाइन और सिग्मॉइड
const pPos = 1 / (1 + Math.exp(-s));
// मल्टीक्लास : डॉट प्रोडक्ट और सॉफ्टमैक्स, argmax
```

class की संख्या के हिसाब से एक dot product, sigmoid या softmax। एक pass और खत्म। zero token generate, तो पीछे retry और parsing heuristic से ठीक करने को कोई टूटा JSON नहीं।

`train.py` recipe : हर workflow पर 300 train / 100 test, deterministic split (temporal bias से बचने के लिए हर 5 में 1 item test में), vocab 3000-6000, coef 1e-4 पर round, नपा हुआ zero loss। JSON export `{ vocab, idf, questions }`।

weight : invoices के लिए 20 KB (`duplicate` 0.89) से mail के लिए 650 KB (`bucket` 0.889) तक। ऐसा size जो frontend bundle में घुस जाता है।

वह detail जिसने मुझे चौंकाया : mail पर MiniLM TF-IDF से +/-0.02 पर चिपका है। तो nano ऐसे ही ship होता है। mail sort करने के लिए GPU का पैसा, मुझे नहीं देना। उधर agent_trace अटकता है (`needs_review` nano में 0.59) : observability text गरीब है, कोई शब्द सच में decision नहीं उठाता।

वह factory जो weight को plugin बनाती है, `src/plugin.ts:52` में :

```ts
export function nanoClassifier(manifest, weights, opts = {}) {
  return definePlugin({ manifest,
    classify: (input) => {
      const r = predict(`${from}${input.state}`, weights, q);
      return { decision: r.decision, confidence: r.confidence, domain: manifest.domain };
    }});
}
```

`decide()` nano में sync रहता है, `decideAsync()` mini के लिए ONNX खोलता है। दो रास्ते, एक simple नियम : async चाहिए मतलब mini चाहिए, वरना nano काफी है। code लिखते हुए याद रखना आसान, टूटने पर debug करना आसान।

यह दिखाने के लिए कि यह सिर्फ theory नहीं है, real usage ऐसा दिखता है :

```ts
import { Sabaki } from "sabaki";
import customerService from "@sabaki-js/customer-service";

const sabaki = new Sabaki().register(customerService);
sabaki.decide({ state: "charged twice, refund please" });
// { decision: "billing", confidence: 0.31, domain: "customer_service" }
```

### Mini, 22 MB जो मुश्किल case पलट देता है

Nano की limit है, agent_trace पर ऊपर देख ही लिया। MiniLM-L6 आगे संभालता है : पूरे domain के लिए shared encoder, हर सवाल पर linear head। 8-12 epoch end-to-end fine-tune, lr 2e-5, training के लिए CUDA GPU (inference CPU ही रहता है, यही मायने रखता है)।

वही split पर नपे आंकड़े जिन्होंने फैसला किया :
- frozen encoder और MLP : 0.65
- full fine-tune : 0.68
- 400M से frozen embedding तक distillation : try करके फेंका, gold label से खराब

dynamo से ONNX export, exact parity verified, फिर dynamic int8 quant : 90 MB से 22 MB, customer_service पर **-0.004 accuracy**। ECE same या better। हर export फिर से नापा जाता है, वरना optimization का मतलब नहीं।

1.0.2 से weight package में बंडल हैं (`models/<workflow>-int8/` और exported `modelDir`)। `npm i` काफी है, airplane mode OK। update करना मतलब patch publish करना, trusted publishing से signed।

concrete : `needs_review` 0.59 से **0.82** जाता है। `disposition` 0.73 से 0.76। हर जगह ECE < 0.14, OOD पर healthy doubt के साथ (dragon, recipe और empty string पर 0.2-0.5)। यही doubt prod में aggressive thresholding की इजाजत देता है।

### Generalist, वह catch-all जो Sabaki को सच में System One बनाता है

Jev और बाकी सब हर चीज का जवाब देते हैं : कोई भी सवाल, कोई भी option, runtime में define हुए। यही System One contract है जिसने Jev को viral किया, तुम अपने option के साथ `instructions` और `criteria` रखते हो, वह काट देता है।

Sabaki specialist यह नहीं जानते। वे अपने सवाल जानते हैं (`category`, `duplicate`, `bucket`) और कुछ नहीं। net के बिना Sabaki script से बाहर निकलते ही `unknown` लौटाता, जहां Jev हमेशा कुछ न कुछ बोलता है।

generalist यही net है। एक cross-encoder जो सवाल और option और state पढ़ता है और score निकालता है, हर option पर एक pass, softmax, argmax। 22.7M int8 MiniLM, पट्टी के 144-151M से 6.5x छोटा। लेकिन उसका काम स्कोर नहीं, compatibility है : उसके fallback में लगे होने से `POST /v1/systemone` कोई भी state और कोई भी सवाल मानता है, Jev की तरह। `model` field बताता है किसने सच में जवाब दिया (`@sabaki-js/mail@1.1.2+mini`, `sabaki-generalist-v1`...), तो caller तरफ कुछ नहीं बदलना।

और सबसे जरूरी, यह fallback है, boss नहीं। `decideAsync()` में golden rule : अगर specialist routing जीतता है, वही बोलता है। generalist सिर्फ `unknown` पर बोलता है। कभी उल्टा नहीं। इससे बचा जाता है कि average generalist अपने domain में अच्छे specialist को कुचल दे।

loader `src/generalist.ts` में रहता है, हर call पर ONNX session दोबारा load न हो इसलिए folder-wise cache के साथ :

```ts
export function loadGeneralist(modelDir: string) {
  // हर फोल्डर के लिए कैश, ONNX सेशन दोबारा इस्तेमाल होता है
  // tokenizer.json -> Unigram या wordpiece, ऑटो डिटेक्ट
  const sess = await ort.InferenceSession.create(
    path.join(modelDir, "generalist.onnx"),
    { intraOpNumThreads: 2 },
  );
}
```

तुम `SABAKI_GENERALIST_DIR` को `generalist.onnx` और `tokenizer/` वाले folder पर point करते हो, मॉडल swappable है। id `config.json` से आती है, वरना `"sabaki-generalist"`। `Map` cache हर call पर session reload से बचाता है।

input format classic cross-encoder है : सवाल, option और state separator के साथ जोड़े हुए, score करने को हर option पर एक लाइन :

```ts
const texts = options.map(
  (o) => `${input.question ?? "decision"} [SEP] ${o} [SEP] ${input.state}`,
);
```

सवाल और option और state, `[SEP]` से अलग, हर option पर एक लाइन। option 8 पर capped (`slice(0, 8)`), कुछ न दो तो default `["yes", "no"]`। इससे आगे caller तरफ काटना पड़ेगा, typed decision के लिए 8 पहले ही काफी बड़ा है।

फिर smart batch आता है, ऐसा optimization जो दिखता छोटा है लेकिन latency को option की संख्या से भाग दे देता है। हर option पर एक `session.run` के बजाय सब एक forward में जाता है :

```ts
// हर ऑप्शन पर एक रन के बजाय सभी ऑप्शन के लिए एक बैच्ड फॉरवर्ड
// (अधिकतम लंबाई तक पैड किया हुआ)।
const L = Math.max(...encs.map((e) => e.ids.length));
// [options.length, L] में ids और attention_mask, padId से पैडिंग
const out = await sess.run({ input_ids, attention_mask });
const scores = Array.from(out["score"].data).map(Number);
```

हर text encode होता है (`tokenizer.json` के हिसाब से BERT जैसा wordpiece या SentencePiece unigram), batch की max length तक pad होता है, `[nb_options, L]` tensor में stack होता है। एक `sess.run`, हर option पर एक score। CPU पर इससे सब बदल जाता है : 8x समय के बजाय 20-36ms।

फिर softmax और argmax आता है, हर option के लिए पूरी proba के साथ, ठीक उसी format में जिसे Jev ने popular किया :

```ts
const pr = softmax(scores);
// bi = अधिकतम का इंडेक्स
const confidence = Math.round(pr[bi] * 1000) / 1000;
const probs = Object.fromEntries(
  options.map((o, i) => [o, Math.round(pr[i] * 1000) / 1000]),
);
```

और वह detail जो इसे demo से उठाकर prod में usable बनाता है, वह `abstainAt` है :

```ts
if (input.abstainAt !== undefined && confidence < input.abstainAt) {
  return { decision: null, confidence, domain: "generalist", probabilities: probs };
}
```

Opt-in, default में कोई abstention नहीं। तुम `abstainAt: 0.6-0.7` देते हो और नरम हर चीज guess के बजाय `null` लौटती है। softmax out-of-distrib पर गलत होकर भी 1.00 निकालता है, इसलिए यह luxury नहीं है। GUIDE autonomous use में यही recommend करता है : threshold के नीचे clarification मांगो, auto-resolve मत करो।

आखिर में, fallback generalist वाला वही setup : जब कोई specialist match नहीं करता, `unknown` देने के बजाय यही संभालता है।

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
// रूटिंग मैच करे तो मेल स्पेशलिस्ट, वरना Jev जैसा catch-all generalist
```

generalist की generation, सब एक जैसे नापी हुई PhishNChips (2000 mail) पर और compare लायक चीज के लिए typed-decisions test पर :
- v4 : 0.29 test, R=0.026 phishing। फेंकने लायक, बगल में जवाब दे रहा था।
- A (22M 80k) : 0.546, R=0.406। अब कुछ शक्ल बनने लगी है।
- mini v1 served : **0.536, R=0.616**। यही साइट पर चलती है। phishing recall ठीक, test औसत।
- B (144M scratch) : 0.568, R=0.062। बड़ा, test में बस थोड़ा better, phishing में zero।

144M scratch जो better transfer नहीं करता, इसने "generalize करने के लिए ज्यादा param डालो" वाला idea ठंडा कर दिया। बराबर task पर बड़ा ज्यादा खर्च करता है बिना better अंदाजा लगाए। catch-all में भी छोटा काम चला लेता है। और यह EN-only ही रहता है (`all-MiniLM-L6-v2`), EN routing, मिलते-जुलते case पर FR 1/4 बनाम EN 3/4 probe। FR के लिए trained specialist से जाओ, generalist से नहीं।

## Doom, मेरे लिए इकलौता test जो सच में मायने रखता है

doomLaya मतलब Laya और Jev सच में FreeDoom खेलते हैं। मॉडल चुनता है `command / target / weapon`, executor A* path बनाता है, दरवाजे खोलता है, aim करता है, click करता है। per-tick telemetry, video, run का SHA। मैं इसमें contribute करता हूं, तो दूर से पढ़े leaderboard की बात नहीं कर रहा।

v0.1.0, MAP01 seed 48, skill 3, 35 ticks/s, same executor :

| मॉडल | नतीजा | p50 HTTP | API लागत |
|---|---|---|---|
| Laya stock | असफल 180s | 106ms | $0 |
| Laya v3 adapted | निकास 61.43s | 108ms | $0 |
| Jev 1.13 | निकास 68.97s | 357ms | $0.0046 |

दो clean निकास, बिना मौत, Laya रास्ते में shotgun उठाती है क्योंकि executor pickup खुद संभालता है। ईमानदारी से : Laya v3 Doom पर trained थी, Jev नहीं। एक seed, एक map, general कुछ साबित नहीं करता। project का README यह काला-सफेद कहता है, और नतीजा न बेचना उसके सम्मान में है।

Sabaki तरफ ([plugin-doom](https://github.com/sabaki-js/plugin-doom)) : Python में ViZDoom जो हर tick पर JS server call करता है। i5 के एक thread पर nano ~18k req/s, mini ~71 req/s। 35Hz tick आराम से निकलता है, औसत laptop पर भी।

exit compass के साथ mini 6 में 2-4 run में MAP01 निकालता है, nano 0/6। logical है : text में spatial खो जाता है, doomLaya state MiniLM हो या ModernBERT-base 0.57 के आसपास cap होते हैं। जब spatial info missing है, कोई text classifier उसे दोबारा नहीं गढ़ता।

पड़ोसियों ने बराबर data पर rematch किया : [doomgemma](https://github.com/dexmac221/doomgemma) RTX 4070 पर 27min LoRA चिपकाता है और Gemma 4 E2B को game में Laya v3 के level पर लाता है (6/6 बनाम 6/6) और isolated decision में ऊपर। बराबर size पर decoder Laya जितना तेज है (270M : 22ms बनाम 23ms)। बराबर नतीजे पर Laya ~3x तेज रहती है क्योंकि वह छोटे मॉडल से वहां पहुंचती है।

मेरी पढ़त : task पर training architecture से ज्यादा मायने रखती है। trained छोटा specialist खोज रहे बड़े generalist को हराता है। बिल्कुल Sabaki वाला दांव। पीछे आया paper, *System Switch* ([arXiv:2610.09683](https://arxiv.org/abs/2610.09683)), logic को आखिर तक ले जाता है : तेज छोटा मॉडल जो खेलता है, बड़ा reasoner मॉडल जो gate खुलते ही संभालता है। game पर लगाया Sabaki pre-triage (`automate > 0.85 वरना escalate`)।

## क्या कुर्बान किया

हर missing feature दूसरी feature का पैसा देती है, CPU निशाने पर हो तो यही नियम है। ईमानदार list, Bareiron की तरह जहां C की हर लाइन tradeoff थी :

**Sabaki कहानी नहीं सुनाता।** वह तुम्हारे दिए option के बीच काटता है, proba के साथ। explanation, summary, free text के लिए LLM लो।

**generalist के लिए French अब भी out-of-distrib है।** EN routing (`all-MiniLM-L6-v2`), मिलते-जुलते case पर 3/4 EN बनाम 1/4 FR probe। mail plugin ज्यादातर FR कंपनी से आया लेकिन anonymized : 0 PII, personal term बिना vocab के लिए -0.024 accuracy। anonymization की कीमत है, लेकिन यह non-negotiable था।

**softmax zone से बाहर निकलकर ज्यादा sure दिखता है।** 1.00 पर false देखे हैं, हां। इसीलिए GUIDE में recommended pre-triage : threshold के नीचे `null` लौटाने के लिए `abstainAt: 0.6-0.7`, फिर automate करने के लिए `confidence > 0.85` gate, वरना human। नपा reference : 0.87 precision पर 0.62 phishing recall। लाइन दो हिस्सों में काटने लायक, reviewer हटाने लायक नहीं।

**Nano agent trace पर जूझता है।** सवाल के हिसाब से 0.34 से 0.59। Mini `needs_review` को 0.82 तक उठाता है, लेकिन `risk / urgency / action` मुश्किल रहते हैं। observability text में lexical signal बस गरीब है।

**Text में Doom cap होता है।** MiniLM हो या ModernBERT-base, 0.57 के आसपास। pixel के बिना text पर रहोगे तो MAP02 रोक देगा। असली player का credible रास्ता vision और RL है (pixel से 1.1M param वाला tiny-doom-defender), better text classifier नहीं।

**benchmark batch से drift करता है।** typed-decisions batch में generate होता है, temporal split असल में batch split है। `drift_tool.py` customer_service पर 0.82 निकालता है, agent_trace पर 0.67 (0.5 मतलब अलग नहीं कर सकते)। नपा नतीजा : published weight official split पर 0.61 बनाम mixed में 0.733 करते हैं। तो official आंकड़ा conservative है। Platt / temperature+bias calibration batch के बीच transfer नहीं होती, इसलिए recent batch पर calibrated temperature scaling ही ship होता है। घर का नियम : पहले `drift_tool.py`, 0.6 के ऊपर warn, 0.8 के ऊपर block। यह और कोई publish नहीं करता, सबको करना चाहिए।

## आखिरी नतीजा, आंकड़े हाथ में

एक तरफ laptop का i5, दूसरी तरफ हर call पर bill बनाने वाली API। हर mode concretely यह देता है :

- nano : <1ms, ~18k req/s, 20-650 KB, 0 dep
- mini : ~20ms, ~71 req/s, 22 MB int8, optional onnxruntime
- generalist : 20-36ms, 22.7M, सबसे छोटा open generalist जिसे मैं जानता हूं

कई domain load : सबके लिए ~2 GB के बजाय lazy-load में domain-wise ~0.5 GB RAM। deterministic : 100/100 same input वही output देते हैं। हर सवाल पर threshold, `confidence` पर gate, कुछ match न हो तो `unknown`।

Bareiron पर 3+ player चलाना अटकता था क्योंकि हर player 200ms chunk खर्च करता था। यहां 3+ domain चलाना बिना खांसे निकलता है, क्योंकि हर expert छोटा है और सब एक साथ load करने के बजाय मांग पर load होता है। "छोटा जो काफी है" वाली वही philosophy, दूसरे hardware पर लगाई हुई।

## फलसफा

p2r3 कहता था : *"मुझे बस यही idea पसंद है कि 1 डॉलर वाली वह नन्ही चिप Minecraft जितनी advanced चीज चला सकती है।"*

वही धुन यहां : मुझे यह idea पसंद है कि 20 KB JSON और सौ लाइन TS label चुनने के लिए GPU call हटा देते हैं। यह जाहिर है सब कुछ replace नहीं करता, बकवास नहीं करना चाहिए। यह उस खिजाने वाले case को replace करता है जहां label millisecond में चाहिए, local में, ऐसे confidence के साथ जिसे आंख बंद करने के बजाय ठीक-ठाक threshold कर सको।

tradeoff, काले पर सफेद :
- encoder से word count : 7 पॉइंट कम, latency 1000 से भाग, infra zero
- अकेले बड़े मॉडल से npm plugin : मोटी gate, infinitaly simple ops
- generation से typed decision : टूटने वाला parsing और गढ़े option खत्म
- कच्चे भरोसे से pre-triage : पहले abstain, 0.85 के ऊपर automate, बाकी के लिए human

**याद रखने की 3 चीजें :**

1. **7 पॉइंट कम, 1000x तेज** : 0.61/0.69 बनाम 0.75-0.80, लेकिन 25s CPU या paid API के खिलाफ <1ms/20ms CPU offline। cost के बिना स्कोर का मतलब नहीं।
2. **simple router और अलग expert** : `hits / sqrt(keywords)`, threshold, `unknown`। हर plugin अकेला train, version और ship होता है। mail पर TF-IDF MiniLM से चिपका है : यहां GPU बेकार है।
3. **offline-first ईमानदार calibration के साथ** : `npm i`, बंडल weight, 0 GPU, ECE < 0.14, abstain, drift tool। compare में इकलौता stack जो बिना GPU 35Hz game loop पकड़ता है।

अगर project में दिलचस्पी है, सब MIT में है [github.com/sabaki-js](https://github.com/sabaki-js) पर। नाप और bibtex वाली academic version [preprint v1](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf) है। और अगर Goliath को सच में Doom खेलते देखना है, तो [azalio/doomLaya](https://github.com/azalio/doomLaya) की तरफ जाओ xD
