---
title: "valorant-short-maker : वह पाइपलाइन जो मेरे Valorant शॉर्ट्स खुद बनाती है"
description: "स्क्रिप्ट के लिए Groq/Llama, आवाजों के लिए Piper, बाकी सब के लिए FFmpeg। एक cron job @valorant_agents पर A से Z तक रोज एक वीडियो कैसे बनाता और प्रकाशित करता है।"
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "6n4y4xVEuCPY1cGgEDYCcZ8Xz+wAqUQuSgFITjc4tqYQTkRZhnVCrWoMDvagewROVCQb2o3WKGjcad6TGaKnaQ=="
---

# valorant-short-maker : वह पाइपलाइन जो मेरे Valorant शॉर्ट्स खुद बनाती है

कुछ महीनों से, एक YouTube चैनल चल रहा है बिना मैंने उसे छुए : [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)। Valorant एजेंट जो दो राउंड के बीच एक दूसरे को छेड़ते हैं, डब किए हुए, कराओके उपशीर्षकों के साथ, Shorts में प्रकाशित। सब कुछ [`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker) द्वारा उत्पन्न है, एक TypeScript/Bun पाइपलाइन जो cron में चलती है और बिना किसी को कुछ क्लिक किए प्रकाशित करती है।

यह कैसे काम करता है, चरण दर चरण।

## परिणाम कैसा दिखता है

"Duelist Debate" (Phoenix, Yoru और Jett) के लिए उत्पन्न वीडियो से निकाले गए तीन फ्रेम :

![एक शॉर्ट का इंट्रो, दृश्य के शीर्षक के साथ एजेंट का गोला](/images/valorant-short-maker/vsm-01-intro.png)

![एक संवाद चल रहा है, कराओके उपशीर्षक जो जगमगाता है](/images/valorant-short-maker/vsm-02-dialogue.png)

![एक और संवाद, उपशीर्षक का रंग एजेंट के अनुसार बदलता है](/images/valorant-short-maker/vsm-03-dialogue.png)

इस Short पर लाइव परिणाम : [Duelist Debate -- youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU)। चैनल पर, Shorts लगभग 1,2 से 1,5k व्यूज पर घूमते हैं। कुछ बड़ा नहीं, लेकिन यह एक ऐसा चैनल है जो शुरू से खुद चलता है, इसलिए जो संख्या सच में मायने रखती है वह शून्य है, cron शुरू होने के बाद उस पर बिताए गए शून्य मिनट।

## पाइपलाइन, क्रम में

### 1. स्क्रिप्ट लिखना, Groq + Llama 3.3

हर रन 26 उपलब्ध एजेंटों में से बेतरतीब 3 से 4 एजेंट चुनता है, और Llama 3.3 70B (Groq के माध्यम से) को एक सिस्टम प्रॉम्प्ट भेजता है जिसमें, चुने गए हर एजेंट के लिए, उसके व्यक्तित्व और दृश्य में मौजूद अन्य एजेंटों के साथ उसके संबंधों का संक्षिप्त सार होता है (ये personas `src/lore/` में रहते हैं, प्रति एजेंट एक फाइल)। प्रॉम्प्ट सटीक नियम थोपता है : प्रति संवाद एक छोटी और दमदार पंक्ति, पात्रों के बीच निष्पक्ष बारी, हास्य प्राथमिकता में, और सबसे बढ़कर ठहराव।

"Duelist Debate" के साथ ठोस उदाहरण, Phoenix, Yoru और Jett बहस करते हैं कि duelist कौन खेलेगा, 6 जुलाई 2026 को उत्पन्न :

```
phoenix: I'm telling you, I've got the skills to play duelist this match.
yoru: Skills, you call burning things skills, Phoenix.
jett: I'm the fastest one here, I should play duelist.
phoenix: Fastest, but can you handle the heat, Jett [0.3] I doubt it.
yoru: Heat, ha, you think your flames are hotter than my rifts.
jett: This isn't about heat or flames, it's about speed and agility.
phoenix: Oh, I see, so now you're an expert on duelists, Yoru [0.3] that's rich.
yoru: At least I don't rely on cheap fire tricks.
jett: Cheap fire tricks, that's what you call Phoenix's abilities.
phoenix: Hey, my fire tricks have gotten us out of tight spots before [0.3] can't say the same for your rifts, Yoru.
yoru: Tight spots, you mean like the time I rifted us out of that trap.
jett: Enough, this is getting nowhere, let's just decide already.
phoenix: Fine, but I'm still saying I'm the best duelist here.
yoru: Please, you think you can take on the enemy team alone [0.3] I doubt it.
jett: I can take them on, no problem, I'm the fastest.
phoenix: Fastest, yeah, but can you outmaneuver them [0.3] that's the question.
yoru: Outmaneuver, ha, you think you can outmaneuver anyone, Phoenix.
jett: This is stupid, we're not going to agree on this.
phoenix: Fine, let's just play and see who comes out on top [0.3] I'm game if you are.
yoru: Bring it on, I'll show you what a real duelist looks like.
jett: I'm not backing down, I'm playing duelist.
phoenix: Oh, this should be good [0.3] let's see how you two do.
yoru: We'll see who comes out on top, won't we, Jett.
jett: Yeah, let's end this debate once and for all.
pause: 0.3
phoenix: Alright, let's get started then [0.3] may the best duelist win.
yoru: I'll make sure to burn you, Phoenix, not with fire, but with my rifts.
jett: I'll take you both down, no problem.
```

ठहराव वह विवरण है जो लय को स्वाभाविक बनाता है : किसी संवाद के बीच में डाला गया `[0.3]` स्क्रीन पर एजेंट के गोले को काटे बिना ऑडियो फाइल में 0.3s का मौन बनाता है, जबकि अपने आप में एक पूरी `pause: 1.0` पंक्ति दो वक्ताओं के बीच एक असली मौन बनाती है, गोला छिपा हुआ। इसके बिना, एक TTS जो बिना साँस लिए संवादों को जोड़ता है, रोबोटिक लगता है।

### 2. आवाज देना, Piper, प्रति एजेंट एक मॉडल

हर एजेंट का अपना Piper मॉडल (`.onnx`) है जो विशेष रूप से प्रशिक्षित है, `voices/<agent>/` में संग्रहित। उत्पन्न पाठ संबंधित मॉडल से गुजरता है, जिससे एक WAV निकलता है। यह वही तकनीक है जिसका मैं सामान्य रूप से कस्टम आवाज प्रशिक्षण के लिए उपयोग करता हूँ (Piper/Kaggle पाइपलाइन पर लेख देखें), यहाँ सीधे prod में लागू, हर वीडियो पीढ़ी पर तुरंत।

### 3. कराओके उपशीर्षक, उत्पन्न ASS, आइकन से निकाला गया रंग

उपशीर्षक कोई साधारण `.srt` नहीं है। यह शब्द दर शब्द उत्पन्न `.ass` फाइल (Advanced SubStation Alpha) है, कराओके प्रभाव के साथ : हर शब्द एक रंग में जगमगाता है जैसे ही वह बोला जाता है, जबकि बाकी पाठ तटस्थ रंग में रहता है। एक्सेंट रंग स्थिर नहीं है, यह बोलने वाले एजेंट के आइकन से गतिशील रूप से निकाला जाता है (एक Python स्क्रिप्ट आइकन के PNG पर PIL चलाती है, गैर पारदर्शी पिक्सेल का नमूना लेती है, और प्रमुख रंग लौटाती है)। परिणाम : Killjoy का उपशीर्षक बैंगनी में जगमगाता है, Jett का नीले हरे में, बिना कहीं कोई रंग हार्ड कोड किए।

### 4. ऑडियो प्रतिक्रियाशील गोला, प्रति फ्रेम एक FFmpeg अभिव्यक्ति

यह पाइपलाइन का सबसे टेढ़ा हिस्सा है, और शायद वह जिस पर मुझे सबसे ज्यादा गर्व है। बोलने वाले एजेंट का गोल आइकन स्थिर नहीं रहता : यह अपनी खुद की आवाज की लय पर हल्का जूम इन और आउट करता है।

गणना संवाद के कच्चे WAV को पढ़कर, 60 fps पर फ्रेम दर फ्रेम RMS एन्वेलप (root mean square, सिग्नल ऊर्जा का माप) की गणना करके, अधिकतम से सामान्य करके, फिर झटकों से बचने के लिए 3 फ्रेम की विंडो पर चिकना करके की जाती है। एन्वेलप के हर मान को फिर `MAX_ZOOM_VARIATION` (0.2, इसलिए आधार आकार के आसपास ±20%) से सीमित स्केल कारक में बदला जाता है।

इस गणना का परिणाम पिक्सेल में हेरफेर करने वाले कोड के माध्यम से लागू नहीं होता, यह एक विशाल सशर्त FFmpeg अभिव्यक्ति (`lt(n,K)*val + between(n,K,K')*val + ...`, फ्रेम समूह प्रति एक शाखा) में अनुवादित होता है जो सीधे वीडियो फ़िल्टर के `scale` पैरामीटर को चलाता है। FFmpeg रेंडर के हर फ्रेम पर इस अभिव्यक्ति का मूल्यांकन करता है। 60 fps पर कुछ सेकंड के संवाद के लिए, यह एक ही अभिव्यक्ति में जल्दी सैकड़ों शाखाएँ बना देता है, इसीलिए `STEP` पैरामीटर फ्रेमों को समूहित करता है ताकि गहराई सीमित रहे।

### 5. खंड दर खंड रेंडर, फिर इंट्रो पर fisheye

हर संवाद अलग से रेंडर किया जाता है : वीडियो पृष्ठभूमि (`bg-video/` में गेमप्ले क्लिप में से एक का बेतरतीब अंश, सही अवधि में काटा गया), ऊपर ऑडियो प्रतिक्रियाशील गोले वाला एजेंट, FFmpeg के `ass` फ़िल्टर के माध्यम से जड़े गए उपशीर्षक, पृष्ठभूमि में गेमप्ले ध्वनि के साथ मिश्रित TTS ऑडियो।

सबसे पहला खंड विशेष उपचार पाता है : एक fisheye विकृति जो पहले 20% फ्रेमों पर धीरे धीरे ठीक होती है (फ्रेम दर फ्रेम मूल्यांकित `lenscorrection` फ़िल्टर, साथ में एक `tmix=frames=3` जो मोशन ब्लर का अनुकरण करने के लिए आसन्न फ्रेमों को मिलाता है), "whoosh" ध्वनि के साथ समकालिक। यह इंट्रो संक्रमण है जो यह आभास देता है कि कैमरा दृश्य में "प्रवेश" करता है।

### 6. संयोजन और अंतिम मिश्रण

सभी खंड एक के बाद एक जोड़े जाते हैं, पृष्ठभूमि संगीत (Sneaky Snitch, Kevin MacLeod, Creative Commons लाइसेंस) **ऑडियो डकिंग** के साथ ऊपर मिश्रित किया जाता है, एक sidechain संपीड़न जो जब कोई एजेंट बोलता है तो संगीत की आवाज अपने आप कम कर देता है, और मौन के दौरान बढ़ा देता है। सब कुछ शुरू से अंत तक 60 fps में चलता है, चरणों के बीच कोई फ्रेमरेट रूपांतरण नहीं।

### 7. स्वचालित प्रकाशन

`run-cron.sh` स्क्रिप्ट, एक क्लासिक cron द्वारा शुरू की गई, Python वातावरण सक्रिय करती है, `.env` लोड करती है, और `bun src/workflow.ts --upload` चलाती है। `--upload` ध्वज मेटाडेटा (शीर्षक, विवरण, टैग) की पीढ़ी को भी ट्रिगर करता है और `uploaders/upload.py` को कॉल करता है, जो दो अलग स्क्रिप्टों (`uploaders/youtube/upload.py` और `uploaders/instagram/`) के माध्यम से वीडियो YouTube और Instagram पर प्रकाशित करता है। पूरी शृंखला, LLM प्रॉम्प्ट से ऑनलाइन वीडियो तक, बिना मानवीय हस्तक्षेप चलती है।

## सब कुछ Python वाली चीज के बजाय TypeScript/Bun क्यों

चुनाव वैचारिक नहीं है, यह है कि Bun `Bun.spawn` के माध्यम से उप प्रक्रिया में FFmpeg चलाने के लिए सीधी और तेज पहुँच देता है, पाइपलाइन डेटा संरचनाओं (`Phrase`, `SegmentInfo`) पर मजबूत टाइपिंग, और एक ऐसे स्क्रिप्ट के लिए Node से शुरू होने पर काफी तेज रनटाइम जो cron में हर X घंटे चलता है। प्रोजेक्ट में Python के सिर्फ दो टुकड़े वहीं हैं जहाँ Python सच में सबसे अच्छी तरह सुसज्जित है : रंग निकालने के लिए PIL, और अपलोड API (`google-api-python-client` YouTube के लिए, IG के लिए Instagram Graph API स्टैक)।

## यह क्या दर्शाता है

यह प्रोजेक्ट इस बात का अच्छा उदाहरण है कि आज पूरी तरह मुफ्त या ओपन सोर्स ईंटों से क्या बनाया जा सकता है : Groq API के माध्यम से तेज और मुफ्त LLM, एक स्थानीय TTS इंजन जो समर्पित GPU के बिना चलता है, पूरे वीडियो रेंडर के लिए FFmpeg, और जोड़ने वाला बस TypeScript की कुछ सौ पंक्तियाँ। इनमें से कोई भी ईंट अलग से नई नहीं है। जो पाइपलाइन बनाता है वह संयोजन है : पात्रों के बीच असली संबंधों के साथ सुसंगत स्क्रिप्ट उत्पन्न करना, उसे स्वाभाविक ठहराव के साथ अभिव्यंजक ऑडियो में बदलना, इस ऑडियो की ऊर्जा पर फ्रेम दर फ्रेम एक दृश्य रेंडर समकालिक करना, और प्रकाशन तक पूरी शृंखला स्वचालित करना।

---

**संसाधन**

- **Repo** : [github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **चैनल** : [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**3 मुख्य बिंदु**

1. स्क्रिप्ट एक LLM (Groq/Llama 3.3) द्वारा प्रति एजेंट personas और संबंधों के साथ उत्पन्न होती है, पहले से लिखे चुटकुलों की साधारण सूची नहीं।
2. एजेंट गोले का जूम WAV के RMS एन्वेलप से फ्रेम दर फ्रेम गणना की गई FFmpeg अभिव्यक्ति द्वारा चलाया जाता है, क्लासिक keyframes एनीमेशन नहीं।
3. पूरी शृंखला, प्रॉम्प्ट से YouTube/Instagram पोस्ट तक, बिना मानवीय हस्तक्षेप एक ही cron job से चलती है।
