---
title: "character-factory बनाना : आनुवंशिकी वाले अवतार"
description: "DiceBear के ऊपर एक TypeScript मॉड्यूल : देश/नस्ल के अनुसार सुसंगत पीढ़ी, बच्चों की भविष्यवाणी के लिए छोटा आनुवंशिकी इंजन, और इंजीनियरिंग विवरण जिन्होंने इसे कार्ड गेम में उपयोगी बनाया।"
date: 2026-05-16
aiGenerated: true
tags:
  - typescript
  - npm
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "bJ6sWIqXDm6lla/r4y4N0tNmTl+cMVD19HxFmz6ndNn6NLD+kgF6U3lz1YR1W7QuhsQlBC7UR4gS4EBPxcam/A=="
---

# character-factory बनाना : आनुवंशिक प्रणाली वाले अवतार

मुझे [Kurekuta](https://github.com/fox3000foxy/kurekuta/) के लिए हजारों विश्वसनीय और अलग अवतार चाहिए थे, एक निजी कार्ड गेम प्रोजेक्ट जहाँ हर कार्ड में पात्र का "DNA" होता है जिसे रेंडर इंजन पोर्ट्रेट में बदलता है। बना बनाया पैक खरीदना दिख जाता। प्रति पात्र seed वाले DiceBear अवतार बनाना बकवास देता था : जापानी ब्रह्मांड का कार्ड स्कैंडिनेवियाई गोरी पर पड़ सकता था, और दो "भाई बहन" अजनबियों जैसे लगते थे।

इसलिए मैंने [character-factory](https://github.com/fox3000foxy/character-factory) लिखा, DiceBear के Lorelei संग्रह के ऊपर एक TypeScript मॉड्यूल जो तीन सुविधाएँ लाता है जो अकेले DiceBear नहीं देता : **सुसंगत जनसांख्यिकीय प्रोफाइल**, **छोटा आनुवंशिकी इंजन**, और गेम लूप से इस्तेमाल में सुखद **प्रवाही builder**।

## यह क्या करता है

सबसे छोटा उपयोगी snippet :

```ts
import { CharacterFactory, Country, Mood } from "character-factory";

const svg = new CharacterFactory()
  .setCountry(Country.Japan)   // भारित नस्ल → सुसंगत त्वचा/बाल/कट/दाढ़ी
  .setMood(Mood.Happy)
  .buildSvg();
```

यह साधारण शृंखला जापानी जनसांख्यिकी से भारित नस्ल चुनती है, एक साथ जाने वाला रंग और बालों का रंग निकालती है, सही लिंग उपसमूह से कट चुनती है, फिर आँखें/भौंहें/मुँह "खुश" मोड में लॉक करती है। परिणाम SVG में निकलता है या, `sharp` स्थापित होने पर, किसी भी आकार में PNG में।

एक पात्र सिर्फ एक `CharacterConfig` ऑब्जेक्ट है, चेहरा, बाल, सहायक वस्तुएँ, प्रस्तुति। builder इसे अंदर संशोधित करता है, और तुम इसे JSON, base64 या फाइल में निर्यात कर सकते हो, फिर हूबहू फिर से लोड कर सकते हो। Kurekuta के लिए यह महत्वपूर्ण है : एक कार्ड रेंडर की गई छवि नहीं, कॉन्फ़िग संग्रहित करता है। इसलिए कला हमेशा पुनरुत्पादनीय है और कार्ड का आकार छोटा रहता है।

## सुसंगत जनसांख्यिकीय प्रोफाइल, बेतरतीब पिक्सेल नहीं

DiceBear विकल्प एकसमान चयनकर्ता हैं। त्वचा रंग के लिए `["#ffdbb4", "#2c1b18"]` दो और तुम्हें समान संभावना के साथ एक या दूसरा मिलेगा, लोगो के लिए ठीक, "मुझे ब्राजील का पात्र दो" के लिए बेकार।

`character-factory` देश → नस्ल → लक्षण पाइपलाइन रखता है :

```ts
// मॉड्यूल में क्या है :
ethnicitiesByCountry[Country.Brazil] = [
  { ethnicity: Ethnicity.WestEuropean,  weight: 35 },
  { ethnicity: Ethnicity.BlackAfrican,  weight: 25 },
  { ethnicity: Ethnicity.Latino,        weight: 30 },
  // ...
];

ETHNICITY_PROFILES[Ethnicity.EastAsian] = {
  skinColors: [
    { color: SkinColor.Light,  weight: 35 },
    { color: SkinColor.Warm,   weight: 40 },
    { color: SkinColor.Medium, weight: 20 },
    // ...
  ],
  hairColors: [/* ज्यादातर काला/गहरा भूरा, गोरा नहीं */],
  hairCuts:   { male: [...], female: [...] },
  beardProbability: 0.15,
};
```

हर परत भारित चयन है। भार समाजशास्त्र थीसिस नहीं हैं, यह एक अनुमान है जो "जापान से आया" को लाल बाल बनाने और "स्वीडन से आया" को गहरा काला बनाने से रोकता है। पूरा पाइपलाइन एक ही कॉल में सिमटता है : `setCountry(country)` या `randomizeFromCountry(country, gender?)`।

## छोटा आनुवंशिकी इंजन

वह फंक्शन जिस पर मैं सबसे ज्यादा मजे से काम किया : `projectChild`। दो factory एक बच्चा बना सकती हैं जिसके लक्षण अनुमानित जैविक प्रभुत्व के साथ विरासत में मिलते हैं :

```ts
const parentA = new CharacterFactory().setCountry(Country.Sweden);
const parentB = new CharacterFactory().setCountry(Country.Japan);
const kid     = parentA.projectChild(parentB.getConfig());
```

हुड के नीचे, यह जानबूझकर छोटा मॉडल है। हर माता पिता 2 एलील वाला जीनोटाइप रखते हैं, हर तरफ से एक निकाला गया, प्रमुख या अप्रभावी में संयोजित :

```ts
function combine(a: Allele, b: Allele): "dominant" | "recessive" {
  return a === "D" || b === "D" ? "dominant" : "recessive";
}
```

जिन लक्षणों में प्रभुत्व का असली अक्ष है (त्वचा, आँखें, बाल) वे स्पष्ट क्रमित सूची से सुलझाए जाते हैं, गहरा हल्के पर हावी होता है, भूरी/काली आँखें नीली पर हावी होती हैं, गहरा काला गोरे पर हावी होता है :

```ts
const HAIR_DOMINANCE_ORDER = [
  HairColor.LightBlonde,   // सबसे अप्रभावी
  HairColor.GoldenBlonde,
  HairColor.HoneyBlonde,
  HairColor.Auburn,
  HairColor.Red,
  HairColor.Copper,
  HairColor.LightBrown,
  HairColor.Brown,
  HairColor.DarkBrown,
  HairColor.SoftBlack,
  HairColor.JetBlack,      // सबसे प्रमुख
] as const;
```

`resolveByRank` हर माता पिता का सूचकांक खोजता है, "प्रमुख" एलील संयोजन पर उच्चतम लेता है और "अप्रभावी" पर निम्नतम। फैंटेसी रंग (पेस्टल गुलाबी, लाइलैक) क्रम में नहीं हैं, वे 50/50 सिक्का उछाल करते हैं, जो सही व्यवहार है : वे जैविक नहीं हैं, इसलिए प्रभुत्व का कोई अर्थ नहीं।

झाइयाँ MC1R मॉडल करती हैं : 75% अगर दोनों माता पिता में हैं, 25% अगर सिर्फ एक में है, 0% अगर किसी में नहीं। दाढ़ी SRY से जुड़ी है : अगर बच्चा लड़की है तो हटाई जाती है, वरना उस माता पिता से विरासत में मिलती है जिसके पास थी। बाल कट में कुछ जैविक नहीं है, यह सांस्कृतिक चुनाव है, इसलिए बच्चा अपने लिंग पूल से चुनता है, संभव होने पर बनावट संरक्षित करते हुए।

इसमें से कुछ भी प्रकाशन योग्य आनुवंशिकी नहीं है। यह एहसास की परत है : बच्चे अपने माता पिता के प्रशंसनीय मिश्रण जैसे लगते हैं, दो अजनबियों के औसत जैसे नहीं।

## कम आकर्षक इंजीनियरिंग हिस्से जो मायने रखते थे

कुछ कम दिखने वाले विवरण लेकिन जिन्होंने diff में अपनी जगह कमाई :

**ज्यादा सुरक्षित `pick`।** मूल खाली सरणी पर `T` में cast `undefined` लौटाता था। TypeScript में `strict` + `noUncheckedIndexedAccess` के साथ, यह एक झूठ है जिस पर कंपाइलर हस्ताक्षर करता है। नया संस्करण `RangeError` फेंकता है, तीन स्तर नीचे `undefined` props बनाने के बजाय कॉल साइट पर तुरंत पकड़ा गया।

**`deepMerge` जो सरणियों को भ्रष्ट नहीं करता।** पुराना recursion तब सक्रिय होता था जब स्रोत मान ऑब्जेक्ट था, भले ही लक्ष्य `null` या सरणी हो। `merge({tags: ["a"]}, {tags: ["b"]})` `{tags: {0: "b"}}` बनाता था। नया संस्करण सिर्फ तभी recurse करता है जब दोनों तरफ सादे ऑब्जेक्ट हों।

**समानांतर में बैच रेंडर।** `batchFactory` PNG को क्रमिक लूप में रेंडर करता था, 1000 कार्ड निर्यात में घंटों लगते थे। अब यह कॉन्फ़िगर करने योग्य समवर्तीता (डिफ़ॉल्ट 4) वाला worker पूल है, जो पूर्व आकार वाली सरणी में लिखकर परिणामों का क्रम संरक्षित करता है :

```ts
const worker = async () => {
  while (true) {
    const i = nextIndex++;
    if (i >= count) return;
    // render and save
    results[i] = { index: i + 1, filePath, config: clone.getConfig() };
    done++;
    onProgress?.(done, count);
  }
};
await Promise.all(Array.from({ length: concurrency }, () => worker()));
```

1000 पात्रों के निर्यात पर, इसने चाय ब्रेक को "क्या पहले ही खत्म हो गया ?" में बदल दिया।

**`sharp` त्रुटि संदेश जो कुछ कहता है।** `buildPng` `sharp` को आलसी आयात करता है क्योंकि यह वैकल्पिक निर्भरता है जिसे तुम सिर्फ SVG वाले उपयोगकर्ताओं पर नहीं थोपना चाहते। पुराना catch असली त्रुटि निगल जाता था और हमेशा कहता था "sharp is required."। अगर असली विफलता संस्करण संघर्ष या नेटिव बाइंडिंग समस्या थी, तो तुम पहले से स्थापित पैकेज फिर से स्थापित करने में दस मिनट बिताते थे। नया संस्करण तुम्हें हमेशा इसे स्थापित करने को कहता है, लेकिन अंतर्निहित त्रुटि शामिल करता है।

## आगे

मॉड्यूल [character-factory रिपॉजिटरी](https://github.com/fox3000foxy/character-factory) पर 1.1.1 में है। आनुवंशिकी इंजन दोहराते रहने के लिए आदर्श जगह है, अभी कोई परीक्षण सुइट नहीं है, इसलिए सुसंगतता अपरिवर्तनीय ("पूर्व एशियाई वंश का ब्राजीलियाई पात्र प्लेटिनम बालों के साथ गहरे काले आँखें कभी नहीं पाएगा") सिर्फ भारों से सुनिश्चित हैं। `bun test` या `vitest` जोड़ना और सुसंगतता परीक्षण लिखना जो प्रति देश दस हजार `randomizeFromCountry` चलाता है, अगला चरण है।

Kurekuta खुद अभी निजी है, लेकिन हर कार्ड जो तुम एक दिन उसमें देखोगे सिर्फ एक `CharacterConfig` blob और अस्तित्व का एक `buildPng()` है।
