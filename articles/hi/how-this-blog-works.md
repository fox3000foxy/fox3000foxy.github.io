---
title: यह ब्लॉग कैसे काम करता है ?
description: "ब्लॉग के परदे के पीछे : React, Vite, Markdown, CI/CD पाइपलाइन और लेखन प्रवाह।"
date: 2026-03-08
aiGenerated: true
tags:
  - react
  - meta
  - blog
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "K/3MXY1FZo7Sse8blqpPMUoSpi0fCBR0dxxPIMJJuPE0tBA538mIH5AiT52gVh8x0zZrpN1dS3RyFIkBaq10ng=="
---

# यह ब्लॉग कैसे काम करता है ?

तुमने कभी सोचा यह ब्लॉग हुड के नीचे कैसे काम करता है ? इस लेख में, मैं application की पूरी आर्किटेक्चर विस्तार से बताऊँगा, तकनीकी स्टैक से लेकर लेख लिखने की प्रक्रिया तक। और हाँ, मैं यह भी दिखाऊँगा कि मैं VS Code से अपने लेख कैसे लिखता हूँ !

## तकनीकी स्टैक

यह ब्लॉग आधुनिक वेब तकनीकों से बना है :

- **React 19** : उपयोगकर्ता इंटरफेस के लिए
- **TypeScript** : typed और ज्यादा विश्वसनीय कोड के लिए
- **Vite** : अति तेज build उपकरण के रूप में
- **React Router v7** : पेजों के बीच नेविगेशन के लिए
- **react-markdown** : Markdown को HTML में बदलने के लिए
- **rehype-raw + rehype-sanitize** : Markdown में कच्चा HTML सुरक्षित अनुमति देने के लिए


## प्रोजेक्ट संरचना

प्रोजेक्ट वृक्ष ऐसा दिखता है :

![](assets/how-this-blog-works/project-structure.png)

```
├── .github/
│   └── workflows/
│       └── deploy.yml              ← Pipeline CI/CD
├── public/
│   ├── home.md                     ← Contenu de la page d'accueil
│   ├── portfolio.md                ← Contenu du portfolio
│   └── articles/
│       ├── index.json              ← Liste de tous les articles
│       ├── hello-world.md          ← Un article
│       ├── how-this-blog-works.md  ← Cet article !
│       └── assets/                 ← Images des articles
├── src/
│   ├── main.tsx                    ← Point d'entrée React
│   ├── App.tsx                     ← Routeur principal
│   ├── components/
│   │   ├── Header.tsx              ← Barre de navigation
│   │   └── Footer.tsx              ← Pied de page
│   └── pages/
│       ├── Home.tsx                ← Page d'accueil
│       ├── BlogList.tsx            ← Liste des articles
│       ├── Article.tsx             ← Lecteur d'article
│       ├── Portfolio.tsx           ← Page portfolio
│       └── NotFound.tsx            ← Page 404
└── vite.config.ts                  ← Configuration Vite
```

केंद्रीय विचार सरल है : **सामग्री कोड से अलग है**। पेज `public/` फोल्डर में Markdown में लिखे हैं, और `src/` में React कोड उन्हें दिखाने का काम करता है। मैं इस अलगाव से जुड़ा हूँ : यह सामग्री को फिर से पढ़ना आसान और कोड को विकसित करना आसान बनाता है।

## routing तंत्र

`App.tsx` फाइल React Router से application के सभी route परिभाषित करती है :

![](assets/20260308_153440_image.png)


| Route         | Page      | Description                                |
| --------------- | ----------- | -------------------------------------------- |
| `/`           | Home      | Page d'accueil, charge `home.md`            |
| `/blog`       | BlogList  | Liste de tous les articles                  |
| `/blog/:slug` | Article   | Un article, charge `articles/{slug}.md`     |
| `/portfolio`  | Portfolio | Page portfolio, charge `portfolio.md`       |
| `*`           | NotFound  | Page 404 pour les URLs inconnues            |

हर पेज की अच्छी तरह परिभाषित भूमिका है : वह Markdown फाइल लाता है, उसे `react-markdown` से HTML में बदलता है, और स्क्रीन पर दिखाता है।

## लेख कैसे काम करता है ?

यह वह हिस्सा है जो मुझे सबसे ज्यादा पसंद है ! यहाँ लेख का जीवन चक्र है :

### 1. `index.json` फाइल

सभी लेख `public/articles/index.json` में संदर्भित हैं। हर प्रविष्टि में लेख के मेटाडेटा हैं :

```json
[
  {
    "slug": "hello-world",
    "title": "Hello World",
    "description": "A sample post for Fox's Blog.",
    "date": "2026-03-08"
  }
]
```

- **slug** : अद्वितीय पहचान, URL में इस्तेमाल (`/blog/hello-world`)
- **title** : सूची में दिखाया शीर्षक
- **description** : संक्षिप्त सारांश
- **date** : प्रकाशन तिथि

### 2. Markdown फाइल

लेख की सामग्री `public/articles/` में साधारण `.md` फाइल है। फाइल नाम `index.json` में परिभाषित `slug` से मेल खाता है।

![](assets/20260308_153509_image.png)

तुम उसमें जो चाहो रख सकते हो : शीर्षक, सूचियाँ, चित्र, तालिकाएँ, और `rehype-raw` से कच्चा HTML भी !

### 3. React तरफ रेंडर

जब तुम `/blog/hello-world` देखते हो, तो यह होता है :

1. React Router URL से `slug` पैरामीटर लेता है
2. `Article.tsx` घटक `/articles/hello-world.md` लोड करता है
3. Markdown `react-markdown` से HTML में बदला जाता है
4. `assets/` की ओर लिंक अपने आप `/articles/assets/` की ओर फिर से लिखे जाते हैं
5. समानांतर में, तिथि और विवरण दिखाने के लिए मेटाडेटा `index.json` से लोड किए जाते हैं

इतना ही सरल है !

## होम पेज और Portfolio

होम और Portfolio पेज बिल्कुल वैसे ही काम करते हैं : वे Markdown फाइल (`home.md` या `portfolio.md`) लोड करते हैं और उसे HTML में रेंडर करते हैं।

विशेषता यह है कि वे कस्टम sanitization schema इस्तेमाल करते हैं जो सभी HTML तत्वों पर `class` और `style` विशेषताएँ अनुमति देता है। यह मुझे सीधे Markdown में स्टाइल HTML लिखने देता है, जैसे चित्र गैलरी उदाहरण के लिए।

## Header और Footer

Header `position: fixed` से पेज के ऊपर टिका है। इसमें है :

- मेरा GitHub अवतार (सीधे `github.com/fox3000foxy.png` से लोड)
- ब्लॉग शीर्षक
- नेविगेशन लिंक : होम, ब्लॉग, Portfolio

Footer न्यूनतम है : सिर्फ गतिशील गणना किए वर्तमान वर्ष के साथ copyright।

## गहरा थीम

साइट स्थायी रूप से गहरे मोड में रहती है। मैंने शाम को आरामदायक पढ़ने के लिए जानबूझकर यह चुनाव किया : वैश्विक शैलियों में `color-scheme: dark` परिभाषित है, काली पृष्ठभूमि `#000` और सफेद पाठ `#fff` के साथ। लिंक नीले हैं (`#64b5f6`) और होवर पर हरे हो जाते हैं (`#81c784`)।

## मैं लेख कैसे लिखता हूँ

व्यवहार पर आते हैं ! नया लेख लिखने का मेरा workflow यहाँ है :

### चरण 1 : Markdown फाइल बनाना

मैं VS Code खोलता हूँ और `public/articles/` में नई `.md` फाइल बनाता हूँ :

### चरण 2 : सामग्री लिखना

मैं लेख की सामग्री सीधे Markdown में लिखता हूँ। VS Code में उत्कृष्ट अंतर्निहित Markdown पूर्वावलोकन है :

![](assets/20260308_153613_image.png)

चित्रों के लिए, मैं उन्हें `public/articles/assets/` में रखता हूँ और मानक Markdown syntax से संदर्भित करता हूँ :

```markdown
![description](assets/my-image.png)
```

`Article.tsx` घटक `assets/` पथ को अपने आप `/articles/assets/` की ओर फिर से लिखता है ताकि चित्र सही दिखें।

### चरण 3 : index.json में लेख दर्ज करना

लेख खत्म होने पर, मैं उसे `public/articles/index.json` में जोड़ता हूँ ताकि वह ब्लॉग सूची में दिखे :

![](assets/20260308_153629_image.png)

### चरण 4 : स्थानीय परीक्षण

मैं Vite विकास सर्वर चलाता हूँ :

```bash
pnpm dev
```

Vite कुछ मिलीसेकंड में शुरू होता है और मैं अपना लेख `localhost:5173` पर वास्तविक समय देख सकता हूँ। यह गति मुझे लगभग तुरंत हर बदलाव जाँचने देती है :

![](assets/20260308_153703_image.png)

### चरण 5 : प्रकाशित करना

साधारण `git push` काफी है ! CI/CD पाइपलाइन बाकी अपने आप संभालती है।

## CI/CD परिनियोजन पाइपलाइन

मैंने पूरा **GitHub Actions** पाइपलाइन लगाया है जो `main` पर हर push पर साइट का lint, build और परिनियोजन स्वचालित करता है। विस्तार से देखते हैं।

workflow `.github/workflows/deploy.yml` में है और दो job में बँटा है : **build** और **deploy**।

### trigger

```yaml
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
```

पाइपलाइन `main` पर हर **push** और `main` को लक्षित हर **pull request** पर चलता है। इसलिए PR merge होने से पहले जाँचे जाते हैं (lint + build), लेकिन सिर्फ `main` पर push परिनियोजन ट्रिगर करते हैं।

### Job 1 : Build

build job `ubuntu-latest` पर चलता है और इन चरणों का पालन करता है :

1. **Checkout** : पूरे इतिहास के साथ रिपॉजिटरी clone करता है (`fetch-depth: 0`)
2. **Setup pnpm** : `pnpm/action-setup@v4` से pnpm का नवीनतम संस्करण स्थापित करता है
3. **Setup Node.js 20** : तेज स्थापना के लिए सक्षम pnpm cache के साथ Node कॉन्फ़िगर करता है
4. **Install dependencies** : पुनरुत्पादनीय build गारंटी के लिए `pnpm install --frozen-lockfile` निष्पादित करता है (lockfile का कोई बदलाव अनुमत नहीं)
5. **Lint** : build से पहले कोड गुणवत्ता जाँचने के लिए `pnpm run lint` (ESLint) निष्पादित करता है
6. **Build** : `pnpm run build` निष्पादित करता है, जो पहले TypeScript प्रकार जाँचता है (`tsc -b`) फिर Vite से सब bundle करता है
7. **Upload artifact** : परिनियोजन job के लिए `dist/` फोल्डर build कलाकृति के रूप में अपलोड करता है

अगर कोई चरण विफल होता है (lint, प्रकार या build त्रुटि), तो पूरा पाइपलाइन रुकता है और कुछ परिनियोजित नहीं होता। यह सुरक्षा मुझे production में टूटे कोड से बचाती है और मैं हर push पर इस पर भरोसा करता हूँ।

### Job 2 : Deploy

परिनियोजन job तभी चलता है अगर :

- build job सफल हुआ (`needs: build`)
- घटना **push** है (PR नहीं)
- शाखा **main** है

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

फिर वह आगे बढ़ता है :

1. **build कलाकृति डाउनलोड** : build job द्वारा बनाई `dist/` फोल्डर लेता है
2. **GitHub Pages कॉन्फ़िगर** : Pages वातावरण स्थापित करता है
3. **Pages की ओर अपलोड** : GitHub Pages के लिए `dist/` फोल्डर तैयार करता है
4. **परिनियोजन** : `actions/deploy-pages@v4` से साइट प्रकाशित करता है

### पूरा चित्र

लेखन से परिनियोजन तक यह होता है :

```
VS Code में लेख लिखना
          ↓
    git add & commit
          ↓
       git push
          ↓
   GitHub Actions ट्रिगर होता है
          ↓
   ┌─────────────────┐
   │   BUILD JOB     │
   │  1. Checkout    │
   │  2. Setup pnpm  │
   │  3. Setup Node  │
   │  4. Install     │
   │  5. Lint ✓      │
   │  6. Build ✓     │
   │  7. Upload dist │
   └────────┬────────┘
            ↓
   ┌─────────────────┐
   │  DEPLOY JOB     │
   │  1. Download    │
   │  2. Configure   │
   │  3. Upload      │
   │  4. Deploy 🚀   │
   └─────────────────┘
            ↓
     GitHub Pages पर ऑनलाइन !
```

पूरी प्रक्रिया push और ऑनलाइन होने के बीच लगभग एक मिनट लेती है। मैं साधारण `git push` से प्रकाशित करता हूँ, सब FTP या SSH के बिना स्वचालित रहता है।

## Production Build

हुड के नीचे, `pnpm build` कमांड निष्पादित करता है :

1. `tsc -b` : TypeScript प्रकार जाँचता है
2. `vite build` : सारा कोड bundle और अनुकूलित करता है

Vite स्वचालित code-splitting के साथ minified और अनुकूलित फाइलें बनाता है। परिणाम अति तेज स्थिर साइट है।

## यह आर्किटेक्चर क्यों ?

मैं CMS, Hugo या Jekyll जैसा स्थिर साइट जनरेटर, या Next.js भी इस्तेमाल कर सकता था। लेकिन मैंने यह दृष्टिकोण क्यों चुना :

- **सरलता** : Markdown में लिखो, GitHub पर push करो, ऑनलाइन है
- **पूर्ण नियंत्रण** : CMS या डेटाबेस पर कोई निर्भरता नहीं
- **प्रदर्शन** : Vite + React = तेज लोडिंग
- **लचीलापन** : मैं Markdown और HTML जैसे चाहूँ मिला सकता हूँ
- **सीखना** : React और TypeScript में महारत का बढ़िया प्रोजेक्ट है
- **CI/CD** : GitHub Actions से स्वचालित गुणवत्ता जाँच और परिनियोजन

## निष्कर्ष

यह ब्लॉग सरल लेकिन सोच समझा प्रोजेक्ट है : सामग्री के लिए Markdown, रेंडर के लिए React, प्रदर्शन के लिए Vite, CI/CD के लिए GitHub Actions, और होस्टिंग के लिए GitHub Pages। यह सिर्फ कुशलता से परोसी स्थिर फाइलों पर टिका है, स्वचालित पाइपलाइन के साथ जो हर push पर गुणवत्ता गारंटी करती है।


पढ़ने के लिए धन्यवाद, और अगले लेख में मिलते हैं ! 🦊
