---
title: "valorant-short-maker: वह पाइपलाइन जो खुद-ब-खुद मेरे Valorant शॉर्ट्स बनाती है"
description: "Groq/Llama स्क्रिप्ट के लिए, Piper आवाज़ों के लिए, FFmpeg बाकी सब के लिए। कैसे एक cron job @valorant_agents पर रोज़ एक वीडियो A से Z तक बनाता और पब्लिश करता है।"
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "5kV3SE0W7xq0l3pRTz44k4aR+rNWHrUWvKiKSDJ81kgQlGaFGvkOtFF0NGKxb1IFb+2NOkKq6N6C0cbUm4/Z6g=="
---

# valorant-short-maker: वह पाइपलाइन जो खुद-ब-खुद मेरे Valorant शॉर्ट्स बनाती है

पिछले कुछ महीनों से, एक YouTube चैनल बिना मेरे छुए चल रहा है: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)। Valorant एजेंट राउंड के बीच एक-दूसरे को चिढ़ाते हैं, डब होते हैं, कराओके सबटाइटल के साथ, Shorts के रूप में पब्लिश होते हैं। सब कुछ [`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker) से जनरेट होता है, एक TypeScript/Bun पाइपलाइन जो cron पर चलती है और बिना किसी के क्लिक किए पब्लिश करती है।

यहाँ बताता हूँ कि यह कैसे काम करता है, स्टेप बाय स्टेप।

## नतीजा कैसा दिखता है

"Duelist Debate" (Phoenix, Yoru, और Jett) के लिए जनरेट किए गए वीडियो से तीन फ्रेम:

![शॉर्ट का इंट्रो, एजेंट सर्कल के साथ सीन का टाइटल](/images/valorant-short-maker/vsm-01-intro.png)

![एक डायलॉग चल रहा है, कराओके सबटाइटल चमक रहा है](/images/valorant-short-maker/vsm-02-dialogue.png)

![एक और डायलॉग, बोलने वाले एजेंट के हिसाब से सबटाइटल का रंग बदलता है](/images/valorant-short-maker/vsm-03-dialogue.png)

इस Short का लाइव रिज़ल्ट: [Duelist Debate -- youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU)। चैनल पर Shorts करीब 1.2 से 1.5k व्यूज़ पर चलते हैं। कुछ बड़ा नहीं, लेकिन यह एक ऐसा चैनल है जो शुरू से पूरी तरह अपने आप चलता है, तो असली मायने रखने वाला नंबर है ज़ीरो -- cron जॉब शुरू करने के बाद से उस पर बिताए गए ज़ीरो मिनट।

## पाइपलाइन, क्रम से

### 1. स्क्रिप्ट लिखना -- Groq + Llama 3.3

हर रन 26 उपलब्ध एजेंटों में से 3 से 4 को रैंडम चुनता है, और Llama 3.3 70B (Groq के ज़रिए) को एक सिस्टम प्रॉम्प्ट भेजता है जिसमें हर चुने हुए एजेंट के लिए उसकी पर्सनैलिटी और सीन में मौजूद दूसरे एजेंटों के साथ उसके रिलेशनशिप का कॉम्पैक्ट समरी होता है (ये personas `src/lore/` में रहते हैं, हर एजेंट की एक फ़ाइल)। प्रॉम्प्ट सख्त नियम लागू करता है: हर लाइन एक छोटा और दमदार वाक्य, किरदारों के बीच न्यायसंगत रोटेशन, ह्यूमर को प्राथमिकता, और सबसे ज़रूरी -- ठहराव।

"Duelist Debate" का ठोस उदाहरण -- Phoenix, Yoru, और Jett इस बात पर बहस कर रहे हैं कि duelist कौन खेलेगा, 6 जुलाई 2026 को जनरेट किया गया:

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

ठहराव वह डिटेल है जो रिदम को नैचुरल बनाती है: लाइन के बीच में डाला गया `[0.3]` ऑडियो में 0.3 सेकंड की ख़ामोशी बनाता है बिना स्क्रीन पर एजेंट सर्कल को काटे, जबकि एक अलग `pause: 1.0` लाइन दो बोलने वालों के बीच असली ख़ामोशी बनाती है, सर्कल छिपा हुआ। इसके बिना, TTS बिना साँस लिए लाइनें पढ़ता है और रोबोटिक लगता है।

### 2. आवाज़ देना -- Piper, हर एजेंट का अपना मॉडल

हर एजेंट का अपना खास तौर पर ट्रेन किया हुआ Piper मॉडल (`.onnx`) है, जो `voices/<agent>/` में स्टोर है। जनरेट किया गया टेक्स्ट उसी मॉडल से गुज़रता है, जो WAV आउटपुट देता है। यह वही टेक्नोलॉजी है जो मैं आमतौर पर कस्टम वॉइस ट्रेनिंग के लिए इस्तेमाल करता हूँ (Piper/Kaggle पाइपलाइन आर्टिकल देखें) -- यहाँ सीधे प्रोडक्शन में, ऑन-द-फ्लाई, हर वीडियो जनरेशन पर लागू होती है।

### 3. कराओके सबटाइटल -- ASS जनरेटेड, आइकन से कलर निकाला गया

सबटाइटलिंग सिर्फ एक `.srt` नहीं है। यह एक `.ass` (Advanced SubStation Alpha) फ़ाइल है जो शब्द दर शब्द जनरेट होती है, कराओके इफ़ेक्ट के साथ: हर शब्द बोले जाने पर एक रंग में चमकता है, जबकि बाकी टेक्स्ट न्यूट्रल रंग में रहता है। एक्सेंट कलर फिक्स नहीं है -- यह बोलने वाले एजेंट के आइकन से डायनामिकली निकाला जाता है (एक Python स्क्रिप्ट आइकन के PNG पर PIL चलाती है, नॉन-ट्रांसपेरेंट पिक्सल सैंपल करती है, और डॉमिनेंट कलर्स लौटाती है)। नतीजा: Killjoy का सबटाइटल पर्पल में चमकता है, Jett का टील में, बिना कहीं कोई कलर हार्डकोड किए।

### 4. ऑडियो-रिएक्टिव सर्कल -- हर फ्रेम पर एक FFmpeg एक्सप्रेशन

यह पाइपलाइन का सबसे पेचीदा हिस्सा है, और शायद वह जिस पर मुझे सबसे ज़्यादा गर्व है। बोलने वाले एजेंट का गोल आइकन स्थिर नहीं रहता: यह अपनी ही आवाज़ की लय पर हल्का ज़ूम इन और आउट करता है।

कैलकुलेशन लाइन के रॉ WAV को पढ़ता है, RMS एन्वलप (root mean square, सिग्नल एनर्जी का माप) को 60 fps पर फ्रेम दर फ्रेम कैलकुलेट करता है, मैक्सिमम से नॉर्मलाइज़ करता है, फिर झटके रोकने के लिए 3-फ्रेम विंडो पर स्मूथ करता है। हर एन्वलप वैल्यू फिर `MAX_ZOOM_VARIATION` (0.2, यानी बेस साइज़ का ±20%) से सीमित स्केल फ़ैक्टर में बदली जाती है।

इस कैलकुलेशन का नतीजा पिक्सल मैनिपुलेट करने वाले कोड से लागू नहीं होता -- यह एक विशाल FFmpeg कंडीशनल एक्सप्रेशन में अनुवादित होता है (`lt(n,K)*val + between(n,K,K')*val + ...`, हर फ्रेम ग्रुप के लिए एक ब्रांच) जो सीधे वीडियो फ़िल्टर के `scale` पैरामीटर को ड्राइव करता है। FFmpeg इस एक्सप्रेशन को रेंडर के हर फ्रेम पर इवैल्यूएट करता है। 60 fps पर कुछ सेकंड की लाइन के लिए, एक ही एक्सप्रेशन में सैकड़ों ब्रांच बन जाती हैं -- इसीलिए `STEP` पैरामीटर है जो फ्रेम को ग्रुप करके गहराई सीमित करता है।

### 5. सेगमेंट-दर-सेगमेंट रेंडर, फिर इंट्रो पर fisheye

हर लाइन अलग-अलग रेंडर होती है: वीडियो बैकग्राउंड (`bg-video/` से एक रैंडम गेमप्ले क्लिप, सही अवधि में कटा हुआ), एजेंट सर्कल ऊपर ऑडियो-रिएक्टिव ज़ूम के साथ, सबटाइटल FFmpeg के `ass` फ़िल्टर से जड़े गए, TTS ऑडियो बैकग्राउंड गेमप्ले साउंड के साथ मिक्स।

सबसे पहले सेगमेंट को स्पेशल ट्रीटमेंट मिलता है: एक fisheye डिस्टॉर्शन जो पहले 20% फ्रेम पर धीरे-धीरे गायब होता है (फ्रेम दर फ्रेम इवैल्यूएट होने वाला `lenscorrection` फ़िल्टर, प्लस `tmix=frames=3` जो मोशन ब्लर सिम्युलेट करने के लिए आस-पास के फ्रेम ब्लेंड करता है), "whoosh" साउंड के साथ सिंक। यह इंट्रो ट्रांज़िशन है जो ऐसा महसूस कराता है कि कैमरा सीन में "घुस" रहा है।

### 6. कनकैटनेशन और फ़ाइनल मिक्स

सभी सेगमेंट आख़िर से आख़िर तक जोड़े जाते हैं, बैकग्राउंड म्यूज़िक (Sneaky Snitch, Kevin MacLeod, Creative Commons लाइसेंस) **ऑडियो डकिंग** के साथ ऊपर मिक्स होती है -- एक साइडचेन कंप्रेशन जो एजेंट के बोलने के दौरान म्यूज़िक का वॉल्यूम ऑटोमैटिकली कम करता है, और ख़ामोशी के दौरान वापस बढ़ा देता है। सब कुछ शुरू से आख़िर तक 60 fps पर चलता है, स्टेप्स के बीच कोई framerate कन्वर्ज़न नहीं।

### 7. ऑटोमैटिक पब्लिशिंग

`run-cron.sh` स्क्रिप्ट, एक स्टैंडर्ड cron जॉब से लॉन्च होकर, Python एन्वायरमेंट एक्टिवेट करती है, `.env` लोड करती है, और `bun src/workflow.ts --upload` चलाती है। `--upload` फ़्लैग अतिरिक्त रूप से मेटाडेटा जनरेशन (टाइटल, डिस्क्रिप्शन, टैग्स) ट्रिगर करता है और `uploaders/upload.py` को कॉल करता है, जो दो अलग स्क्रिप्ट्स (`uploaders/youtube/upload.py` और `uploaders/instagram/`) के ज़रिए YouTube और Instagram पर वीडियो पब्लिश करता है। पूरी चेन, LLM प्रॉम्प्ट से लेकर वीडियो ऑनलाइन होने तक, बिना किसी इंसानी दखल के चलती है।

## TypeScript/Bun क्यों, पूरा Python क्यों नहीं

यह चुनाव विचारधारा का नहीं है -- Bun `Bun.spawn` के ज़रिए FFmpeg को सबप्रोसेस की तरह डायरेक्ट और तेज़ एक्सेस देता है, पाइपलाइन के डेटा स्ट्रक्चर (`Phrase`, `SegmentInfo`) पर स्ट्रॉन्ग टाइपिंग, और एक रनटाइम जो हर कुछ घंटों में cron से चलने वाली स्क्रिप्ट के लिए Node से काफ़ी तेज़ स्टार्ट होता है। प्रोजेक्ट में Python के सिर्फ दो टुकड़े हैं जहाँ Python सचमुच सबसे अच्छा टूल है: कलर एक्सट्रैक्शन के लिए PIL, और अपलोड APIs (YouTube के लिए `google-api-python-client`, IG के लिए Instagram Graph API स्टैक)।

## यह क्या दिखाता है

यह प्रोजेक्ट इस बात का अच्छा उदाहरण है कि आज पूरी तरह फ्री या ओपन सोर्स बिल्डिंग ब्लॉक्स से क्या बनाया जा सकता है: Groq API के ज़रिए एक तेज़ और फ्री LLM, बिना डेडिकेटेड GPU के चलने वाला लोकल TTS इंजन, सारे वीडियो रेंडरिंग के लिए FFmpeg -- और जोड़ने वाला सिर्फ कुछ सौ लाइनों का TypeScript है। इनमें से कोई भी ब्लॉक अलग से नया नहीं है। पाइपलाइन को बनाने वाली चीज़ है संयोजन: असली कैरेक्टर रिलेशनशिप के साथ एक कोहेरेंट स्क्रिप्ट जनरेट करना, उसे नैचुरल ठहराव के साथ एक्सप्रेसिव ऑडियो में बदलना, उस ऑडियो की एनर्जी पर फ्रेम दर फ्रेम विज़ुअल रेंडर सिंक करना, और पब्लिकेशन तक पूरी चेन ऑटोमेट करना।

---

**संसाधन**

- **Repo**: [github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **चैनल**: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**3 मुख्य बातें**

1. स्क्रिप्ट एक LLM (Groq/Llama 3.3) द्वारा हर एजेंट की persona और रिलेशनशिप के साथ जनरेट होती है, पहले से लिखे चुटकुलों की लिस्ट नहीं।
2. एजेंट सर्कल का ज़ूम WAV के RMS एन्वलप से फ्रेम दर फ्रेम कैलकुलेट किए गए FFmpeg एक्सप्रेशन से ड्राइव होता है -- क्लासिक कीफ्रेम एनिमेशन नहीं।
3. पूरी चेन, प्रॉम्प्ट से YouTube/Instagram पोस्ट तक, एक ही cron job से बिना किसी इंसानी दखल के चलती है।
