---
title: "PiperHub: 536 ओपन सोर्स TTS आवाजें, एक मॉडल में 7 भावनाएं, शून्य GPU, शून्य बिल"
description: "VITS, espeak, ONNX, LJSpeech: Piper Raspberry Pi को कैसे बुलवाता है। 7 भावनाओं वाला Fortune multi, Kokoro 82M, PocketTTS, sanoTTS, ElevenLabs, और आधिकारिक Python wrapper से 10x तेज नेटिव pipertts।"
date: 2026-11-12
tags:
  - tts
  - piper
  - open-source
  - typescript
  - ai
  - catalogue
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "CbjBu+0X9pF+JfJdEZqQzCbJNTVOYDTyXR4r8C6dsCRy7GWEMLwMkEWlLRvLqEvANaZ2QSmf3PVxBuF6319abQ=="
---

## परिचय

Discord बॉट को बुलवाना महंगा पड़ता है। टेक्स्ट नहीं: एक लोकल LLM कुछ सेंट के GPU में वाक्य बना देता है। आवाज का भुगतान हर वाक्य पर होता है। सिंथेसिस API प्रति अक्षर पैसे लेती हैं, और जब बॉट पूरी रात बोलता है, तो बिल भी साथ चलता है।

यही दिक्कत मुझे Luna Protocol के साथ हुई। मेरा Discord बॉट अपने संदेश लोकल LLM से बनाता है, फिर उन्हें Piper आवाज से ऊंचा पढ़वाता है, OGG में बदलता है, और वॉइस संदेशों की तरह भेजता है। सब कुछ मेरे अपने सर्वर पर, प्रति वाक्य 0 यूरो में, रात 3 बजे भी जब Luna अकेले अपनी जीवन कहानी सुनाने का फैसला कर लेती है।

0 यूरो पर रहना मतलब मुफ्त आवाजें खोजना और खुद होस्ट करना। और यहीं मामला उलझ गया: दर्जनों Hugging Face रिपो में बिखरे मॉडल, धुंधले लाइसेंस, यह जानने का कोई तरीका नहीं कि कोई आवाज कहां से आई या अब भी चलती है या नहीं। इसलिए मैंने [PiperHub](https://piperhub.org/) बनाया, जो Piper TTS के लिए आवाजों का ओपन सोर्स कैटलॉग है।

आज के आंकड़े: **536 मॉडल** दिख रहे हैं, **71 भाषाएं** शामिल हैं, **3755 speakers** सूचीबद्ध हैं। हर मॉडल अपने मूल डेटासेट से जुड़ा है जब हमें वह पता होता है, स्रोत आवाज का हिस्सा है, जैसा होमपेज कहता है।

एक सवाल मुझसे अक्सर पूछा जाता है: Kokoro, PocketTTS, sanoTTS और ElevenLabs के सामने Piper की क्या औकात है? और Fortune का `pipertts` मॉड्यूल आधिकारिक Python wrapper से 10x तेज क्यों है? यह लेख इंजन खोलता है, कोड सबूत के साथ।

## PiperHub, कैटलॉग

इंजन खोलने से पहले, देखते हैं PiperHub कौन सी समस्या हल करता है।

### आवाजें कहां से आती हैं

कोड [github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank) पर है। Astro, स्टैटिक साइट, शून्य सर्वर: रूट पर अंग्रेजी, `/<code>/` के नीचे 15 और भाषाएं (fr, de, es, it, pt, ru, tr, ja, ko, zh, id, hi, ar, vi, th)। असल में मेरे ब्लॉग वाला ही पैटर्न है।

सच्चाई का स्रोत कोई हाथ से एडिट नहीं करता। यह एक पाइपलाइन है:

```bash
npm install
npm run data    # src/data/*.json फिर से बनाता है (python3 scripts/generate_data.py)
npx astro dev   # लोकल विकास
npm run build   # dist/ में स्टैटिक बिल्ड
```

व्यवहार में: एक crawler रिपो `models_mapping.csv` और `datasets_mapping.csv` संभालता है, मिरर की गई आवाजें Hugging Face पर रहती हैं, सैंपल ऑडियो फाइलें हैं। `npm run data` यह सब खींचता है और `src/data/*.json` निकालता है। साइट सिर्फ स्टैटिक JSON पढ़ती है।

मौजूदा कच्चे डेटा में (555 एंट्री, साइट 536 दिखाती है, क्रॉल हमेशा डिस्प्ले से थोड़ा आगे रहता है):

| क्वालिटी | मॉडल |
|---|---|
| medium | 437 |
| high | 67 |
| low | 50 |

| सैंपल रेट | मॉडल |
|---|---|
| 22050 Hz | 486 |
| 16000 Hz | 47 |

486 आवाजें 22050 Hz में, Piper का स्टैंडर्ड। 47 आवाजें 16000 Hz में, एंबेडेड के लिए छोटी तेज आवाजें। phonemizer 509 केसों में `espeak` है, इस पर लौटेंगे, यही सिस्टम का दिल है।

### स्रोत, या हर मॉडल का डेटासेट क्यों है

PiperHub को सिर्फ सूची के बजाय उपयोगी बनाने वाली चीज मॉडल और डेटासेट का लिंक है। होम से लिया उदाहरण: आवाज **Astra - Valorant Piper TTS** डेटासेट **Astra - LJSpeech Dataset** से जुड़ी है। दोनों पेज खोलते हो, दोनों तरफ रिपो और लाइसेंस जांचते हो।

130 डेटासेट दर्ज हैं। और कैटलॉग हालत के बारे में ईमानदार है: 25 मॉडल `usable: false` फ्लैग वाले हैं (टूटी फाइलें, या `piperPlus` फॉर्मेट जिसे fork रनटाइम चाहिए)। `pipertts` मॉड्यूल इन आवाजों को बाद में अजीब तरह क्रैश होने के बजाय साफ एरर के साथ मना करता है। 48 मॉडल multi-speaker हैं, जिनमें दो दिलचस्प वाले शामिल हैं।

गाइड की तरफ, साइट तीन चरणों में काम करती है: **Build a dataset**, **Train a voice**, **Use a voice**, साथ में Piper Plus पेज। इनपुट में LJSpeech फॉर्मेट वाला डेटासेट, आउटपुट में ONNX। कहना आसान, करना लंबा, इसलिए अगला सेक्शन।

## बोनट के नीचे Piper: VITS, espeak, ONNX

### एक वाक्य, तीन चरण

जब तुम Piper से "bonjour" बोलने को कहते हो, तो यह होता है:

```
"bonjour"
  -> [phonémisation espeak-ng] -> b O~ Z u R
  -> [encodeur VITS + flow + décodeur] -> waveform 22050 Hz
```

कोई अलग vocoder नहीं। यही VITS है: एक end-to-end मॉडल जो टेक्स्ट (phonemize किया हुआ) से सीधे waveform तक जाता है। जहां पुरानी पाइपलाइन टेक्स्ट से spectrogram (Tacotron) फिर spectrogram से ऑडियो (HiFi-GAN, दो मॉडल, दो ट्रेनिंग) बनाती थी, VITS conditional VAE, normalizing flows और decoder पर GAN स्टाइल discriminator के साथ सब कुछ एक साथ सीखता है। एक ट्रेनिंग, एक मॉडल, एक ONNX एक्सपोर्ट।

Decoder सीधे 22050 Hz निकालता है। इस सैंपल रेट पर, एक सेकंड बोली मतलब 22050 नंबर। मॉडल छोटा है (medium क्वालिटी में कुछ दर्जन MB) और inference शुद्ध CPU है: ऑप्टिमाइज्ड ONNX ग्राफ पर matrix गुणा। इसलिए Raspberry Pi आधिकारिक टारगेट है, Piper Rhasspy में पैदा हुआ था, जो Pi पर चलने के लिए बना ओपन सोर्स वॉइस असिस्टेंट है।

### espeak-ng, वह phonemizer जो सारा गंदा काम करता है

VITS से पहले, टेक्स्ट को phoneme में बदलना पड़ता है। 555 में से 509 मॉडल `espeak` इस्तेमाल करते हैं:

```bash
echo "bonjour" | espeak-ng --ipa -v fr
# bO~'ZuR
```

espeak-ng दर्जनों भाषाओं का उच्चारण जानता है। VITS मॉडल फ्रेंच स्पेलिंग कभी नहीं सीखता, जिसमें `eau` का उच्चारण `o` होता है, वह phoneme से आवाज तक सीखता है। इससे ट्रेनिंग बहुत आसान होती है और समझ आता है Piper 71 भाषाएं क्यों कवर करता है: नई भाषा के लिए संबंधित espeak आवाज जोड़ो और ट्रेन करो।

जो आवाजें espeak के बिना चलती हैं, उनका अपना phonemizer है, और यहीं मामला मजेदार होता है: `hebrew` (Nakdimon ONNX और IPA नियमों की 494 लाइनें), `pinyin` (polyphone disambiguation वाला पूरा BERT g2pW, एक ही चीनी अक्षर शब्द के हिसाब से अलग बोला जाता है), `thai` (असल बिना बदला TLTK), `japanese` (lindera segmentation और UniDic)। `pipertts` मॉड्यूल सातों को लाता है, Python रेफरेंस से identical सत्यापित। इस पर लौटेंगे।

### डेटासेट: LJSpeech, हमेशा LJSpeech

स्टैंडर्ड ट्रेनिंग फॉर्मेट LJSpeech है: क्लिप से भरा `wavs/` फोल्डर, साथ में `metadata.csv`:

```
LJ001-0001|Printing, in the only sense with which we are at present concerned...|printing in the only sense...
LJ001-0002|in being comparatively modern...|in being comparatively modern...
```

`fileid|transcription|normalized`, एक क्लिप मतलब एक वाक्य, कुछ सेकंड। मूल डेटासेट एक ही स्पीकर से पढ़े 13,000 अंग्रेजी वाक्य हैं, पब्लिक डोमेन। फ्रेंच आवाज ट्रेन करने के लिए, वही संरचना फ्रेंच में रिकॉर्ड करते हो: अलाइन किया टेक्स्ट और ऑडियो, ठीक medium के लिए कुछ घंटे काफी हैं, high के लिए ज्यादा।

कैटलॉग की तीन क्वालिटी मोटे तौर पर मॉडल साइज और ट्रेनिंग अवधि से मेल खाती हैं। Low: छोटा, तेज, रोबोटिक। Medium: sweet spot, 437 मॉडल के साथ। High: बड़ा, धीमा, ज्यादा प्राकृतिक, 67 मॉडल, जिनमें Fortune वाले हैं।

### तीन जादुई बटन

हर Piper आवाज inference के तीन पैरामीटर देती है, लगभग सार्वभौमिक डिफॉल्ट के साथ:

```json
"inference": { "noise_scale": 0.667, "length_scale": 1, "noise_w": 0.8 }
```

- `noise_scale` (0.667): आवाज की विविधता। ज्यादा मतलब ज्यादा अभिव्यंजक, कम मतलब ज्यादा स्थिर। आउटपुट stochastic है: एक ही वाक्य के दो सिंथेसिस दो थोड़े अलग ऑडियो देते हैं।
- `noise_w` (0.8): टाइमिंग की विविधता, यानी लय।
- `length_scale` (1.0): गति। 1 से ऊपर धीमा करता है, नीचे तेज करता है। जब Luna गुस्से में होती है तो उसे तेज बुलवाने का सबसे आसान तरीका।

`noise_scale` याद रखो, भावनाओं के लिए काम आएगा।

## Fortune multi: 7 भावनाएं, 1 ही ONNX

चलो, लोकल स्टार पर आते हैं।

कैटलॉग ItsRealFortune (हाय) से ट्रेन किए तीन Fortune मॉडल सूचीबद्ध करता है:

| मॉडल | रिपो | आवाजें |
|---|---|---|
| ItsRealFortune - French (FR) High | `fox3000foxy/piper-fortune-v6` | 1 (voice-0) |
| ItsRealFortune - French (FR) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-fr-multi` | **7** |
| ItsRealFortune - English (EN) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-en-multi` | **7** |

FR multi यह है:

```
normal, joyeuse, storytelling, colere, triste, surprise, interrogative
```

**एक ही ONNX फाइल** में सात भावनात्मक रूप। EN multi भी वैसा ही, नामों में ऐतिहासिक typo के साथ: `surprised` की जगह `suprised`। यह weights में है, हम रखते हैं, यही folklore का हिस्सा है।

### speakerId कैसे काम करता है?

Multi-speaker VITS वही मॉडल है, एक extra इनपुट के साथ: speaker embedding। ट्रेनिंग में, हर क्लिप अपने style से टैग होता है, मॉडल बाकी के साथ embedding टेबल (हर style के लिए एक) सीखता है। Inference में, टेबल की लाइन चुनते हो:

```ts
import { PiperNativeTTS } from "pipertts";

const tts = await PiperNativeTTS.load({
  model: "hub:itsrealfortune-french-fr-multi-high",
  modelsDir: "./models",
});

const styles = [
  "normal", "joyeuse", "storytelling",
  "colere", "triste", "surprise", "interrogative",
];

for (let i = 0; i < styles.length; i++) {
  const r = await tts.synthesize("Quelle merveilleuse nouvelle !", {
    speakerId: i,           // 0 = normal ... 5 = surprise
    outputFile: `./fortune-${styles[i]}.wav`,
  });
}
```

एक ही वाक्य, सात readings। थोड़ा बढ़ाए `noise_scale` के साथ `speakerId: 5` (surprise), और विश्वसनीय exclamation मिलता है। धीमा करने के लिए `length_scale: 1.1` के साथ `speakerId: 4` (triste), और मातमी घोषणा मिलती है। Luna अपनी आवाज ऐसे ही modulate करती है: दिमाग भावना चुनता है (valence/arousal, centroids पर मेरा लेख देखो), TTS speakerId चुनता है।

पीछे का डेटासेट सीधा नाम वाला **Fortune French - Dataset** है, "Fortune's Café" नाम के लाइसेंस के साथ। हां, लाइसेंस का नाम कैफे जैसा है। नहीं, वह रहेगा।

### यह आर्थिक रूप से समझदार क्यों है

सात भावनाएं मतलब एक डाउनलोड, RAM में एक लोड, एक ONNX सेशन। विकल्प (सात अलग मॉडल) स्टोरेज को गुणा करता और हर भावना बदलाव पर ग्राफ reload करवाता, वाक्य के बीच टोन बदलने वाले बॉट के लिए नामुमकिन। यहां `speakerId` tensor में सिर्फ index है। सीमांत लागत: शून्य।

## प्रतियोगी: Kokoro, PocketTTS, sanoTTS

Piper CPU तीन गंभीर challengers के साथ बांटता है, तीन अलग दर्शन।

### Kokoro 82M, क्वालिटी प्राइस का राजा

[Kokoro](https://huggingface.co/hexgrad/Kokoro-82M), hexgrad से। 82 मिलियन पैरामीटर, बदला StyleTTS 2 आर्किटेक्चर ISTFTNet decoder के साथ, **बिना diffusion चरण**। diffusion की अनुपस्थिति ही सब कुछ करती है: कोई iterative denoising लूप नहीं, इसलिए ultra तेज inference।

| | Kokoro-82M |
|---|---|
| Params | 82M |
| Poids | ~300 Mo (164 Mo en FP16) |
| Licence | Apache 2.0 (commercial OK) |
| Langues | 8, 54 voix preset + blending |
| CPU | quasi temps réel |
| GPU | 36 à 96x temps réel |
| Tests aveugles | au niveau de Google et Amazon |

100 घंटे से कम ऑडियो पर लगभग 1000 डॉलर में ट्रेन किया, और blind सुनने वाले इसे Google और Amazon की प्रीमियम आवाजों के स्तर पर रखते हैं। इसलिए यह फटा: प्रीमियम क्वालिटी, मुफ्त, लोकल, permissive।

Piper के सामने: Kokoro शुद्ध प्राकृतिकता में जीतता है (StyleTTS 2 छोटे VITS से बेहतर) और लाइसेंस में (Piper के GPL-3.0 इंजन के खिलाफ Apache 2.0)। Piper कवरेज में जीतता है (8 के खिलाफ 71 भाषाएं, 54 आवाजों के खिलाफ 3755 speakers) और community आवाज ecosystem में। अंग्रेजी narration के लिए, Kokoro को हराना मुश्किल है। 7 भावनाओं वाली फ्रेंच, तुर्की या स्वाहिली के लिए, अक्सर Piper ही दौड़ में अकेला है।

### PocketTTS (Kyutai), CPU पर cloning

[Kyutai](https://kyutai.org/tts/) दूसरी धुन बजाता है: **voice cloning वाला** छोटा मॉडल, जो CPU पर चलता है।

| मॉडल | पैरामीटर | WER | UTMOS | SIM | CPU गति (1 thread) |
|---|---|---|---|---|---|
| Pocket TTS | ~100M | 0.92% | 4.364 | 0.923 | 2.8x temps réel |
| Pocket TTS small | 1.9M / 6.9M / 18.2M | - | - | - | CPU, clonage inclus |

WER 1% से नीचे (सही उच्चारण करता है), UTMOS 4.36 (शानदार perceived क्वालिटी), SIM 0.923 (क्लोन सच में target जैसा लगता है)। और small वर्जन cloning सहित **1.9M पैरामीटर** तक उतरते हैं। 1.9M. मेरा Sabaki router JSON में लगभग इतना ही है।

Piper के सामने: PocketTTS cloning में जीतता है (Piper fixed आवाजों से पढ़ता है) और flagship की compactness में। Piper भाषाओं में जीतता है (small अभी English-only है) और ecosystem maturity में (536 तैयार आवाजें बनाम "अपनी खुद ट्रेन करो")।

### sanoTTS, वह मॉडल जो 3 डॉलर की चिप पर चलता है

[sanoTTS](https://github.com/ampixa/sanoTTS) (`sano` नेपाली में "छोटा"), TTS का Bareiron है: पूरा neural stack जो phoneme से 22.05 kHz PCM तक **microcontroller पर** जाता है।

| सिस्टम | पैरामीटर | SCOREQ | UTMOS | DNS-SIG |
|---|---|---|---|---|
| sanoTTS (heart-nano) | 0.29M | 2.29 | 2.45 | 3.35 |
| TinyTTS | 1.62M | 3.94 | 3.65 | 3.62 |

0.29M पैरामीटर। आवाज 2 MB. `pip install sanotts`, `sanotts say "Hello" --voice amy`, और बोलता है। ब्राउजर में भी।

पर स्कोर देखो: TinyTTS के 3.94 के खिलाफ SCOREQ 2.29, UTMOS 2.45. बोलता है, हां। गाता है, नहीं। यही ultimate tradeoff है: 0.29M पर हर जगह चलता है पर क्वालिटी साइज के साथ चलती है। Piper medium दूसरी league की आवाज के लिए 100x ज्यादा weights है।

### सारांश वाली तालिका

| | Piper | Kokoro 82M | PocketTTS | sanoTTS |
|---|---|---|---|---|
| Params typiques | ~10-60M | 82M | ~100M / 2-18M | 0.3-1.4M |
| Langues | 71 | 8 | EN (+ smalls EN) | multilingue, petit |
| Voix dispos | 3755 speakers | 54 + blending | clonage (la tienne) | quelques voix |
| Clonage | non | non (natif) | **oui, CPU** | non |
| Licence moteur | GPL-3.0 | Apache 2.0 | open (Kyutai) | open |
| Entraînable maison | oui (LJSpeech) | oui (plus lourd) | oui | oui |
| Qualité FR | bonne (multi émotions) | correcte (EN-first) | EN-only | faible |

चुनाव तुम्हारी constraint पर निर्भर है, कोई पूर्ण विजेता नहीं: शुद्ध EN क्वालिटी चाहिए तो Kokoro। CPU cloning चाहिए तो PocketTTS। Microcontroller चाहिए तो sanoTTS। भाषाओं की कवरेज और भावनात्मक फ्रेंच आवाजें और शून्य infra चाहिए तो Piper।

## ElevenLabs, बिल वाला Goliath

और फिर ElevenLabs है। 70 से ज्यादा भाषाएं, audio tags और dramatic dialogues वाला expressive Eleven v3, blind test में top क्वालिटी। एक तरह से TTS का Jev: सबने देखा, सबने benchmark किया।

2026 pricing, गोल आंकड़ों में:

| API मॉडल | कीमत / 1000 अक्षर |
|---|---|
| Flash / Turbo, v3 Conversational | $0.05 |
| Multilingual v2, Eleven v3 | $0.10 |

1000 अक्षर लगभग 1 मिनट ऑडियो बनाते हैं। यानी प्रति मिनट $0.05 से $0.10. $99 वाला Pro प्लान लगभग 990k अक्षर देता है, overage उसी दर पर लगता है। YouTube चैनल के लिए जो रोज voice over वाला वीडियो निकालता है (मेरा `valorant-short-maker` ठीक यही करता है, पर मुफ्त Piper के साथ), हर रोजाना voice over मिनट के लिए महीने के $1.50 से $3 गिनो। रोज दस मिनट: $15 से $30 महीना। चुकाया जा सकता है, पर गिना जाता है।

कब सही है: जब आवाज ही product हो (dubbing, audiobook, ad), जब कल सुबह 70 भाषाएं चाहिए, जब cloning पहली बार में perfect होना चाहिए। इसके उलट कभी सही नहीं: पूरी रात बोलने वाला Discord बॉट, internal notification, dev, फटते volume। ElevenLabs पर रात 3 बजे अपनी जीवन कहानी सुनाती Luna मतलब मेरा बिजली बिल रो रहा है।

हिसाब सरल है: Piper मतलब 0 यूरो सीमांत, "अच्छी" क्वालिटी। ElevenLabs मतलब चलता मीटर, "शानदार" क्वालिटी। दोनों के बीच एक दुनिया है जहां "अच्छी और मुफ्त" जीतती है, यही पूरा PiperHub दांव है।

## pipertts: नेटिव Python wrapper से 10x तेज क्यों है

रिपो [itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts), 75 commits: TypeScript में Piper का नेटिव port। README शीर्षक: "In-process Piper TTS for Node.js. No Python required."

### spawn की लागत

ऐतिहासिक wrapper (`PiperTTS`) **हर synthesis पर** sub-process में spawn किया `python3 -m piper` है:

```
synthèse = spawn(python) + chargement du modèle + inférence + kill
```

हर वाक्य interpreter start और weights load की कीमत चुकाता है। `en_US-lessac-medium` पर मापा: **प्रति लाइन लगभग 2.2 सेकंड**।

नेटिव (`PiperNativeTTS`) ONNX सेशन **मेमोरी में गर्म** रखता है:

```
load une fois -> session persistante -> inférence par phrase
```

वैसे ही मापा: **प्रति लाइन लगभग 0.22 सेकंड**। 10x यहीं से आता है: spawn और reload मारते हैं, चमत्कारी inference का इससे लेना देना नहीं। ONNX inference खुद दोनों तरफ वही है।

बोनस में, पहला load `.onnx` के बगल में optimized graph cache करता है (`<model>.ortopt-<platform>-<arch>-v<ort>.onnx`), जिससे अगले load लगभग 35% तेज होते हैं। cache key platform, arch और ORT वर्जन जोड़ती है, और मॉडल बदले तो refresh होती है। `cacheOptimizedModel: false` से बंद कर सकते हो।

### espeak bridge: 15ms के खिलाफ 0.4ms

phonemization के लिए वही तर्क। wrapper हर वाक्य पर CLI में `espeak-ng` binary बुलाता है: हर बार लगभग 15ms spawn। नेटिव N-API bridge लाता है (`src/native/espeak-bridge/`, `espeakbridge.c` का port), Linux x64/arm64 के लिए prebuilds के साथ: **प्रति कॉल लगभग 0.4ms**, byte-identical phoneme। addon के बिना, CLI पर automatic fallback। CLI force करने के लिए `PIPER_ESPEAK_BRIDGE=0`।

### 7 phoneme_type, सभी port किए

| प्रकार | इंजन | नोट्स |
|---|---|---|
| `espeak` | bridge N-API ou CLI | clauses byte-identiques |
| `text` | passthrough codepoints | trivial |
| `hebrew` | Nakdimon ONNX + règles IPA | sorties identiques |
| `lithuanian` | espeak + dico de stress 189k entrées | sorties identiques |
| `pinyin` | BERT g2pW ONNX + WordPiece | désambiguïsation des polyphones OK |
| `thai` | vrai TLTK non modifié sous Pyodide/WASM | 7/7 identiques (1er appel lent, suite rapide) |
| `japanese` | lindera-wasm + UniDic + moteur de mores TS | segmentation exacte, **pas d'accent lexical** |

और अरबी automatic diacritize होती है (tashkeel, बंद कर सकते हो)। कैटलॉग की 509 espeak आवाजें तेज bridge से गुजरती हैं, exotic अपने dedicated इंजन से। suite में 71 tests, जहां अटकता है वहां documented constraint (जापानी accent, UniDic कोई डेटा नहीं देता, माना हुआ, कुछ छिपा नहीं)।

### फॉर्मेट और streaming

डिफॉल्ट `wav`, `raw` PCM, `mp3`, `ogg`, `opus`: जब ffmpeg है तो वही, वरना शुद्ध JS fallback (mp3 के लिए lamejs, opus के लिए opusscript और Ogg muxer, स्रोत से 0.993 correlation)। और खास तौर पर `synthesizeChunks()`: async generator जो वाक्य दर वाक्य yield करता है, वाक्यों के बीच `sentenceSilence` के साथ। Luna के लिए इसका मतलब dedicated सर्वर बिना TTS streaming: अंत synthesize होते समय शुरुआत बजनी शुरू।

पूरा usage, integrated PiperHub कैटलॉग के साथ (अगर author रिपो फाइलें देना बंद करे तो `hub:` और automatic mirror fallback):

```ts
const tts = await PiperNativeTTS.load({
  model: "hub:glados-french-medium-voice",
  modelsDir: "./models",
});

const r = await tts.synthesize("Bonjour, je suis GLaDOS.", {
  outputFormat: "ogg",   // Discord के लिए सीधे
  lengthScale: 0.95,     // थोड़ा तेज
});
```

Community आवाजें (GLaDOS और game character) आधिकारिक manifest से गायब हैं, यही वजह है PiperHub मौजूद है, और `pipertts` इसे अच्छी तरह जानता है: `hub:<slug>`, piperhub पेज URL, या नंगा slug, सब चलता है। `usable: false` फ्लैग वाली आवाजें साफ एरर के साथ मना होती हैं।

## क्या कुर्बान किया

हर गायब feature दूसरे को fund करता है। ईमानदार सूची:

**ElevenLabs के बगल में Piper रोबोटिक लगता है।** 22050 Hz पर VITS medium साफ पर flat है, बड़े expressive मॉडल की तुलना में। multi-emotion आंशिक भरपाई करता है (1 flat style से 7 styles बेहतर), पर ElevenLabs v3 audiobook ऊपर रहता है। यही दर्जनों MB की कीमत है।

**espeak गलती करता है।** proper noun, anglicism, abbreviation: नियमों वाला phonemization blind spot रखता है। फ्रेंच में "Spoiler", espeak जैसे बनता है पढ़ता है। neural G2P वाले बड़े मॉडल कम गलती करते हैं। prod में business term के लिए exception dictionary चाहिए।

**शून्य नेटिव cloning।** Piper fixed आवाजों से पढ़ता है। अगर तुम्हें अपनी आवाज चाहिए, तो PocketTTS या ElevenLabs जाओ। multi-speaker variation देता है, तुम्हारा timbre कभी नहीं।

**जापानी lexical accent के बिना रहती है।** UniDic कोई accent डेटा नहीं देता, इसलिए segmentation exact पर melody approximate है। README में documented, कालीन के नीचे कुछ नहीं।

**थाई पहले कॉल पर धीमी है।** TLTK बिना बदले Pyodide/WASM के नीचे चलता है: पहला कॉल सेकंड लेता है (loading), अगले तेज हैं। रेफरेंस से 7/7 identical, पर warm-up plan करो।

**डेटा भूखा है।** सही high आवाज के लिए घंटे अलाइन साफ ऑडियो चाहिए। Fortune डेटासेट घंटों recording और सफाई है। शून्य जादू: garbage in, robot out।

**कैटलॉग में मरी आवाजें हैं।** 25 मॉडल `usable: false` फ्लैग वाले। यह माना हुआ और filtered है, पर याद दिलाता है कि आवाजों का crowdsourcing abandonment का crowdsourcing भी है।

## अंतिम परिणाम

एक तरफ ElevenLabs मीटर, दूसरी तरफ Raspberry Pi:

- PiperHub: 536 मॉडल दिख रहे, 71 भाषाएं, 3755 speakers, 130 जुड़े डेटासेट, डेटासेट से training से usage तक गाइड
- Piper: end-to-end VITS, espeak, CPU पर ONNX, LJSpeech, low/medium/high, 22050 Hz स्टैंडर्ड
- Fortune multi: 7 FR भावनाएं और 7 EN, हर एक 1 ONNX, switch करने के लिए `speakerId`, "Fortune's Café" लाइसेंस
- Kokoro 82M: प्रीमियम EN क्वालिटी, Apache 2.0, 54 आवाजें, CPU पर लगभग real time
- PocketTTS: CPU cloning, लगभग 100M फिर 2-18M, WER 0.92%
- sanoTTS: 0.29M, 2 MB, microcontroller, साइज के साथ चलती क्वालिटी
- ElevenLabs: $0.05-0.10/1000 अक्षर, 70 से ज्यादा भाषाएं, top क्वालिटी, चलता मीटर
- नेटिव pipertts: wrapper के लगभग 2.2 सेकंड प्रति लाइन के खिलाफ लगभग 0.22 सेकंड प्रति लाइन, 0.4ms espeak bridge, 7 phoneme_type, wav/raw/mp3/ogg/opus फॉर्मेट, वाक्य दर वाक्य streaming

Luna रोज इससे बोलती है। 0 यूरो TTS, दिमाग से चलती भावनाएं, Discord के लिए सीधा OGG। ElevenLabs के सामने सुनाई देता है, जाहिर है। पर रात 3 बजे जब वह अपनी जीवन कहानी सुनाने का फैसला करती है, मेरा बिल शांति से सोता है।

## दर्शन

p2r3 ने कहा: *"J'aime juste l'idée que cette toute petite puce à 1 balles puisse faire tourner quelque chose d'aussi avancé que Minecraft."*

वही जुनून यहां, आवाज पर लागू: मुझे यह idea पसंद है कि ONNX के कुछ दर्जन MB Raspberry Pi को 71 भाषाओं में बुलवाते हैं, बिना cloud, बिना account, बिना मीटर। यह obviously कोई dubbing studio replace नहीं करता। यह उस annoying case को replace करता है जहां सही, लोकल, मुफ्त आवाज चाहिए, जो रात में बिना बिल बनाए बोले।

tradeoff, साफ साफ लिखे:
- प्रीमियम क्वालिटी बनाम छोटा VITS: थोड़ा रोबोटिक, पर लोकल और मुफ्त
- प्रति भावना एक मॉडल बनाम speakerId: RAM में एक की कीमत पर 7 आवाजें
- Python spawn बनाम persistent session: 10x तेज, install करने को शून्य Python
- जंगली कैटलॉग बनाम जुड़ा स्रोत: हर आवाज जानती है वह कहां से आई और अब भी चलती है या नहीं
- बिल वाली API बनाम 0 यूरो सीमांत: ElevenLabs से कम सुंदर, पर बिल शांति से सोता है

**याद रखने वाली 3 चीजें:**

1. **Piper CPU का TTS है**, यह VITS और espeak और ONNX है, 71 भाषाएं, दर्जनों MB की आवाजें जो Pi पर चलती हैं। ElevenLabs से कम सुंदर, असीम सस्ता।
2. **Fortune multi एक की कीमत पर 7 भावनाएं है**, यह एक ONNX है, switch करने के लिए `speakerId`, FR और EN। 7 मॉडल के बजाय speaker embedding।
3. **नेटिव spawn मारता है**, `pipertts` ONNX सेशन गर्म रखता है: 2.2 सेकंड के खिलाफ 0.22 सेकंड प्रति लाइन, 15ms CLI के खिलाफ 0.4ms espeak bridge। वही inference, 10x कम इंतजार।

अगर project में दिलचस्पी है, कैटलॉग [piperhub.org](https://piperhub.org/) है, साइट कोड [github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank), नेटिव मॉड्यूल [github.com/itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts)। और अगर Luna को रात 3 बजे जीवन कहानी सुनाते सुनना है, तो Discord पर है xD
