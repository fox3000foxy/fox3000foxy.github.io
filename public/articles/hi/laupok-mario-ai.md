---
title: "Laupok ने एक AI बनाया जो सुपर मारियो वर्ल्ड खुद खेलता है -- यह कैसे काम करता है"
description: "Laupok के प्रोजेक्ट पर गहरी नज़र: एक NEAT-आधारित AI जो सुपर मारियो वर्ल्ड को स्वायत्त रूप से खेलना सीखता है। जेनेटिक एल्गोरिदम, न्यूरल नेटवर्क, न्यूरोएवोल्यूशन ऑफ ऑगमेंटिंग टोपोलॉजीज़, और 4200 लाइनें Lua की।"
date: 2026-07-11
authors:
  - fox3000foxy
tags:
  - ai
  - lua
  - emulation
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "ZAmpXrUJoJH5VAHtLrqX6I+D3bJz2GJRFxPE+V+Jj/++9sypDV2RvxHCk7bctVOgR8FjA7W4jI/kWP6oOlaQEw=="
---

# Laupok ने एक AI बनाया जो सुपर मारियो वर्ल्ड खुद खेलता है -- यह कैसे काम करता है

Laupok ने एक कृत्रिम बुद्धिमत्ता बनाई जो **सुपर मारियो वर्ल्ड** को पूरी तरह से स्वायत्त रूप से खेलती है। कोई पूर्व-स्क्रिप्टेड इनपुट नहीं, कोई रिकॉर्डेड फ्रेम नहीं। AI अपने आप सीखता है, यादृच्छिक उत्परिवर्तन और प्राकृतिक चयन के माध्यम से, गेम के लेवल को पूरा करना। यह प्रोजेक्ट **BizHawk** पर चलता है, जो एक मल्टी-प्लेटफॉर्म एम्यूलेटर है, लगभग **4200 लाइनों** की Lua स्क्रिप्ट के माध्यम से।

यह प्रोजेक्ट इसलिए आकर्षक है क्योंकि यह कंप्यूटिंग में लागू जैविक अवधारणाओं पर निर्भर करता है: डार्विन का **विकास का सिद्धांत**, **कृत्रिम न्यूरल नेटवर्क**, और सबसे महत्वपूर्ण **NEAT** (न्यूरोएवोल्यूशन ऑफ ऑगमेंटिंग टोपोलॉजीज़) नामक एक विशिष्ट एल्गोरिदम। AI को शुरुआत में गेम के बारे में कुछ भी पता नहीं होता। यह यादृच्छिक चीज़ें आज़माता है, हज़ारों बार असफल होता है, और धीरे-धीरे समझ जाता है कि कैसे चलना है, कूदना है, और जीवित रहना है।

इस लेख में, हम सब कुछ विस्तार से समझेंगे -- अवधारणा दर अवधारणा, कोड की लाइन दर लाइन।

![Laupok कैमरे पर NEAT एल्गोरिदम पेश करते हैं](/images/laupok-mario-ai/neat-title.jpg)

---

## सेटअप: BizHawk, Lua, और सुपर मारियो वर्ल्ड

### BizHawk एम्यूलेटर

BizHawk एक ओपन-सोर्स एम्यूलेटर है जो कई कंसोल को सपोर्ट करता है -- NES, SNES, Genesis, PS1, Game Boy, और बहुत कुछ। इसकी मुख्य विशेषता यह है कि यह गेम के साथ **Lua स्क्रिप्ट** चला सकता है। इन स्क्रिप्ट्स की एम्यूलेशन की **RAM** (रैंडम एक्सेस मेमोरी) तक पहुंच होती है, जिसका अर्थ है कि वे किसी भी गेम डेटा को रीयल-टाइम में पढ़ -- और संशोधित -- कर सकते हैं।

व्यावहारिक रूप से, इसका मतलब है कि आप कर सकते हैं:
- मारियो की लेवल में स्थिति पढ़ना
- यह जानना कि स्क्रीन पर कौन से स्प्राइट्स (दुश्मन, आइटम) हैं
- मारियो के आसपास हर टाइल (ब्लॉक) की स्थिति जानना
- कंट्रोलर को नियंत्रित करना -- कोई भी बटन दबाना

यही वह है जो AI को खेलने के लिए चाहिए।

### सुपर मारियो वर्ल्ड के मेमोरी एड्रेस

सुपर मारियो वर्ल्ड की RAM में, हर डेटा एक विशिष्ट एड्रेस पर संग्रहीत होता है। यह एक मोहल्ले जैसा है: प्रत्येक एड्रेस एक "घर" के अनुरूप होता है जिसमें एक जानकारी का टुकड़ा होता है। उदाहरण के लिए:

| एड्रेस | डेटा |
|---------|------|
| `0x94`-`0x95` | मारियो की X स्थिति (16-बिट, लिटिल-एंडियन) |
| `0x96`-`0x97` | मारियो की Y स्थिति |
| `0x14C8`+`i` | स्प्राइट `i` स्थिति (>7 = जीवित) |
| `0xE4`+`i` | स्प्राइट `i` लो X स्थिति |
| `0x14E0`+`i` | स्प्राइट `i` हाई X स्थिति |
| `0xD8`+`i` | स्प्राइट `i` लो Y स्थिति |
| `0x14D4`+`i` | स्प्राइट `i` हाई Y स्थिति |
| `0x170B`+`i` | एक्सटेंडेड स्प्राइट `i` प्रकार |
| `0x0100` | गेम स्थिति (12 = लेवल समाप्त) |
| `0x13D4` | पॉज़ सक्रिय |
| `0x0071` | मारियो की मृत्यु एनिमेशन (9 = मृत) |
| `0x1C800`+... | लेवल टाइल टेबल |

स्प्राइट स्थितियां दो बाइट्स का उपयोग करती हैं: एक "लो" बाइट और एक "हाई" बाइट, क्योंकि स्थिति 255 पिक्सेल से अधिक हो सकती है। सूत्र हमेशा `लो + हाई × 256` होता है।

टाइल्स के लिए यह अधिक जटिल है: बेस एड्रेस `0x1C800` है, और आप दुनिया में टाइल के `x` और `y` निर्देशांक के आधार पर ऑफ़सेट की गणना करते हैं, प्रति टाइल 16 पिक्सेल के कदम के साथ।

![सुपर मारियो वर्ल्ड जिसमें एक डीबग ओवरले है जो स्प्राइट मेमोरी एड्रेस और मारियो की स्थिति दिखाता है](/images/laupok-mario-ai/memory-debug.jpg)

---

## बेसिक्स: जेनेटिक एल्गोरिदम और न्यूरल नेटवर्क

कोड में गोता लगाने से पहले, आपको दो मौलिक अवधारणाओं को समझना होगा। इनके बिना, बाकी कुछ भी समझ में नहीं आता।

### जेनेटिक एल्गोरिदम

जेनेटिक एल्गोरिदम **विकास के सिद्धांत** का एक सिमुलेशन है। मुख्य विचार: आप व्यक्तियों की एक **आबादी** बनाते हैं, जिनमें से प्रत्येक की थोड़ी अलग विशेषताएं ("जीन") होती हैं। आप उन्हें एक वातावरण में "जीने" देते हैं। जो सबसे अच्छा करते हैं वे जीवित रहते हैं और प्रजनन करते हैं। जो खराब करते हैं वे समाप्त हो जाते हैं।

Laupok इसे एक **किर्बी** एनालॉजी से समझाते हैं:
- किर्बी की एक आबादी कीलों और टमाटरों वाले टेरेन पर दिखाई देती है
- कीलें हिट पॉइंट्स कम करती हैं, टमाटर उन्हें पुनर्स्थापित करते हैं
- हर किर्बी के जीन हैं: आकार, गति, एचपी, व्यवहार (भागो, टमाटर खोजो, अंधेरे में भागो)

![DNA डबल हेलिक्स जिस पर "बेबी", "आकार", "गति", "रंग" के लेबल हैं -- वे जीन जो एक व्यक्ति बनाते हैं](/images/laupok-mario-ai/dna-genes.jpg)

- 15 सेकंड के बाद, आप जांचते हैं कि किसने सबसे लंबे समय तक जीवित रहा
- सबसे अच्छा किर्बी दूसरों के साथ प्रजनन करता है: बच्चे सबसे अच्छे के आधे जीन और "सबसे खराब" के आधे जीन विरासत में पाते हैं
- बच्चे यादृच्छिक **उत्परिवर्तन** से गुज़रते हैं (थोड़ा बड़ा, थोड़ा तेज़...)
- पुराने किर्बी नए से बदल दिए जाते हैं
- आप फिर से शुरू करते हैं

180 पीढ़ियों (~15 घंटे) के बाद, किर्बी 15 सेकंड के जीवन से **15 मिनट** तक पहुंच जाते हैं। वे छोटे (छोटे हिटबॉक्स), तेज़ बन गए, और लगातार खतरे से भागते हैं।

![किर्बी सिमुलेशन जनरेशन 0: रंगीन सर्किल एक काली पृष्ठभूमि पर बिखरे हुए, सभी आकार में समान](/images/laupok-mario-ai/kirby-gen0.jpg)

![किर्बी सिमुलेशन जनरेशन 1866: किर्बी छोटे, तेज़ हैं, और व्यवस्थित रूप से खतरे से भागते हैं](/images/laupok-mario-ai/kirby-gen1866.jpg)

![किर्बी सिमुलेशन आंकड़े: फिटनेस, एचपी, प्रदर्शन के अनुसार रैंक किए गए प्रत्येक व्यक्ति का व्यवहार](/images/laupok-mario-ai/kirby-stats.jpg)

निर्णायक बिंदु: **आप समाधान परिभाषित नहीं करते**। एल्गोरिदम **स्वयं इसे खोज लेता है**। और यही इसे उन समस्याओं के लिए शक्तिशाली बनाता है जहां आपको पता नहीं होता कि इष्टतम पैरामीटर संयोजन क्या होगा।

### कृत्रिम न्यूरल नेटवर्क

न्यूरल नेटवर्क मानव मस्तिष्क का एक सरलीकृत गणितीय मॉडल है। इसमें शामिल हैं:
- **इनपुट न्यूरॉन्स**: नेटवर्क क्या "देखता" है
- **आउटपुट न्यूरॉन्स**: नेटवर्क क्या "निर्णय लेता" है
- **कनेक्शन (वेट्स)**: प्रत्येक कनेक्शन का एक **वेट** होता है जो सिग्नल को बढ़ाता या कम करता है

सिद्धांत सरल है: प्रत्येक इनपुट न्यूरॉन अपना मान भेजता है। इसे कनेक्शन वेट से गुणा किया जाता है, फिर अन्य सिग्नलों में जोड़ा जाता है। यदि परिणाम एक निश्चित थ्रेशोल्ड (**एक्टिवेशन फंक्शन**) से अधिक हो जाता है, तो आउटपुट न्यूरॉन फायर करता है।

Laupok की मारियो और माउस कर्सर के साथ एनालॉजी में:
- इनपुट न्यूरॉन = मारियो और कर्सर के बीच दूरी
- कनेक्शन वेट = मारियो की संवेदनशीलता
- आउटपुट न्यूरॉन = मारियो चिल्लाता है या नहीं

कर्सर जितना करीब, इनपुट वैल्यू उतनी अधिक। यदि वेट मजबूत है, तो आउटपुट सिग्नल मजबूत होगा, और मारियो चिल्लाएगा। वेट बदलकर, आप मारियो की संवेदनशीलता बदलते हैं।

![\"मारियो डरा हुआ है\" डेमो: मारियो एक बू का सामना कर रहा है जिसमें एक सिनैप्स बार है जो इनपुट और आउटपुट के बीच कनेक्शन वेट दिखाता है](/images/laupok-mario-ai/mario-fear-demo.jpg)

वास्तविक AI के न्यूरल नेटवर्क में, यही तर्क है, लेकिन बड़े पैमाने पर:
- **99 इनपुट न्यूरॉन्स** (11×9 टाइल्स मारियो का दृश्य)
- **8 आउटपुट न्यूरॉन्स** (A, B, X, Y, Up, Down, Left, Right)
- इनके बीच **हिडन न्यूरॉन्स**
- सैकड़ों कनेक्शन विभिन्न वेट्स के साथ

---

## NEAT: वह एल्गोरिदम जो सब बदल देता है

### बेसिक जेनेटिक एल्गोरिदम की समस्या

यदि आप सादगी से जेनेटिक एल्गोरिदम को न्यूरल नेटवर्क के साथ जोड़ते हैं, तो एक समस्या होती है: आप 100 पूरी तरह से अलग न्यूरल नेटवर्क बनाते हैं, और आप उनकी तुलना नहीं कर सकते। प्रत्येक के अपने न्यूरॉन्स, कनेक्शन और वेट्स हैं। आप कैसे जानते हैं कि दो नेटवर्क "समान" हैं या "अलग"?

यहीं पर **NEAT** आता है -- न्यूरोएवोल्यूशन ऑफ ऑगमेंटिंग टोपोलॉजीज़। **केनेथ स्टैनली** और **रिस्टो मिकुलाइनेन** द्वारा 2002 में आविष्कारित, यह इस समस्या का समाधान करता है।

### प्रजातियां (Species)

NEAT का पहला प्रमुख तंत्र **प्रजातियां** है। जब एक न्यूरल नेटवर्क किसी अन्य से बहुत अलग हो जाता है, तो उसे एक अलग प्रजाति में वर्गीकृत किया जाता है। समानता तीन पैरामीटर्स के माध्यम से गणना की जाती है:

1. **एक्सेस** (`EXCES_COEF = 0.50`): दो नेटवर्क के बीच कोई समानता नहीं रखने वाले कनेक्शन की संख्या (अलग इनोवेशन्स)
2. **डिसजॉइंट**: समान, लेकिन बीच में कनेक्शन के लिए
3. **वेट डिफरेंस** (`POIDSDIFF_COEF = 0.92`): उन कनेक्शन के बीच औसत वेट अंतर जिनका एक ही इनोवेशन है

स्कोर सूत्र:

```
score = (EXCES_COEF × disjoint) / max(nbConnexions1 + nbConnexions2, 1)
      + POIDSDIFF_COEF × diffPoids
```

यदि यह स्कोर `DIFF_LIMITE` (1.0) से कम है, तो दो नेटवर्क एक ही प्रजाति में हैं। अन्यथा, एक नई प्रजाति बनाई जाती है।

### इनोवेशन्स

यह NEAT की प्रतिभा है। हर बार जब एक कनेक्शन बनाया जाता है, उसे एक अद्वितीय, वैश्विक **इनोवेशन** नंबर मिलता है। यह नंबर न्यूरल नेटवर्क के साथ तब भी रहता है जब यह प्रजनन करता है।

व्यावहारिक रूप से, जब क्रॉसओवर के माध्यम से एक बच्चा बनाया जाता है, वह अपने माता-पिता के इनोवेशन्स विरासत में पाता है। यदि दो नेटवर्क एक ही इनोवेशन साझा करते हैं, तो इसका मतलब है कि उनके पास एक ही पूर्वज से एक कनेक्शन है। यही वह है जो विभिन्न आकारों के नेटवर्क की तुलना करने की अनुमति देता है।

### क्रॉसओवर

जब दो न्यूरल नेटवर्क प्रजनन करते हैं, **क्रॉसओवर** इस तरह काम करता है:

![Laupok क्रॉसओवर अवधारणा को समझाते हैं जिसमें "CROSSOVER" टेक्स्ट ओवरलेड है](/images/laupok-mario-ai/crossover-label.jpg)

1. बेहतर प्रदर्शन करने वाला नेटवर्क "प्रभावी माता-पिता" बन जाता है
2. बच्चा प्रभावी से सभी कनेक्शन विरासत में पाता है
3. प्रत्येक कनेक्शन के लिए जिसका एक ही इनोवेशन है, दूसरा माता-पिता उसे बदल सकता है (50% संभावना)
4. केवल गैर-प्रभावी माता-पिता के सक्रिय कनेक्शन ही बदल सकते हैं

यह गारंटी देता है कि बच्चा हमेशा कम से कम सर्वोत्तम माता-पिता के बराबर होता है।

### उत्परिवर्तन (Mutations)

क्रॉसओवर के बाद, बच्चा कॉन्फ़िगर करने योग्य संभावनाओं के साथ उत्परिवर्तन से गुज़रता है:

![Laupok उत्परिवर्तन को समझाते हैं जिसमें "(छोटा संशोधन = उत्परिवर्तन)" टेक्स्ट ओवरलेड है](/images/laupok-mario-ai/mutation-label.jpg)

| उत्परिवर्तन | संभावना | प्रभाव |
|----------|------------|--------|
| कनेक्शन वेट रीसेट | 25% | वेट पूरी तरह से यादृच्छिक हो जाता है |
| वेट उत्परिवर्तन | 95% | वेट ±0.80 से बदलता है |
| कनेक्शन जोड़ना | 85% | दो असंबद्ध न्यूरॉन्स के बीच नया कनेक्शन |
| न्यूरॉन जोड़ना | 39% | दो जुड़े न्यूरॉन्स के बीच एक हिडन न्यूरॉन डाला जाता है |

न्यूरॉन जोड़ने की दर महत्वपूर्ण है: यही नेटवर्क को **बढ़ने** की अनुमति देता है। शुरुआत में, केवल इनपुट और आउटपुट होते हैं। धीरे-धीरे, हिडन न्यूरॉन्स दिखाई देते हैं, जिससे नेटवर्क और अधिक जटिल होता जाता है।

---

## कोड: पूरी वॉकथ्रू

### कॉन्स्टेंट्स

स्क्रिप्ट एक कॉन्स्टेंट्स ब्लॉक से शुरू होती है जो सभी सेटिंग्स परिभाषित करती है:

```lua
-- Mario's view around him
TAILLE_TILE = 16
TAILLE_VUE_W = TAILLE_TILE * 11  -- 176 pixels wide
TAILLE_VUE_H = TAILLE_TILE * 9   -- 144 pixels tall
NB_TILE_W = TAILLE_VUE_W / TAILLE_TILE  -- 11 tiles
NB_TILE_H = TAILLE_VUE_H / TAILLE_TILE  -- 9 tiles

-- Neural network
NB_INPUT = NB_TILE_W * NB_TILE_H  -- 99 inputs (visible tiles)
NB_OUTPUT = 8  -- A, B, X, Y, Up, Down, Left, Right
NB_INDIVIDU_POPULATION = 100  -- individuals per population
NB_NEURONE_MAX = 100000  -- max hidden neurons

-- Fitness
FITNESS_LEVEL_FINI = 1000000  -- value when level is finished
NB_FRAME_RESET_BASE = 33  -- frames without progress before reset
NB_FRAME_RESET_PROGRES = 300  -- frames if progress detected

-- Species
EXCES_COEF = 0.50
POIDSDIFF_COEF = 0.92
DIFF_LIMITE = 1.00

-- Mutations
CHANCE_MUTATION_RESET_CONNEXION = 0.25
POIDS_CONNEXION_MUTATION_AJOUT = 0.80
CHANCE_MUTATION_POIDS = 0.95
CHANCE_MUTATION_CONNEXION = 0.85
CHANCE_MUTATION_NEURONE = 0.39
```

`NB_INPUT` 99 है क्योंकि मारियो का दृश्य 11×9 टाइल्स का है। प्रत्येक टाइल एक इनपुट न्यूरॉन है। खाली टाइल = 0। ब्लॉक = 1। दुश्मन = -1।

8 आउटपुट SNES कंट्रोलर बटनों के अनुरूप हैं: A, B, X, Y, Up, Down, Left, Right। Start, Select, L और R को बाहर रखा गया है ताकि वे मारियो को "भटकाएं" नहीं।

### डेटा स्ट्रक्चर्स

स्क्रिप्ट तीन मुख्य संरचनाएं परिभाषित करती है:

```lua
function newNeurone()
    local neurone = {}
    neurone.valeur = 0    -- current neuron value
    neurone.id = 0        -- unique identifier
    neurone.type = ""     -- "input", "output", or "hidden"
    return neurone
end

function newConnexion()
    local connexion = {}
    connexion.entree = 0     -- source neuron ID
    connexion.sortie = 0     -- destination neuron ID
    connexion.actif = true   -- can be disabled if a hidden neuron is inserted
    connexion.poids = 0      -- connection weight
    connexion.innovation = 0 -- unique innovation number
    connexion.allume = false -- for display: true if signal passes
    return connexion
end

function newReseau()
    local reseau = {
        nbNeurone = 0,        -- number of hidden neurons
        fitness = 1,          -- performance (distance traveled)
        idEspeceParent = 0,   -- which species it belongs to
        lesNeurones = {},     -- neuron array
        lesConnexions = {}    -- connection array
    }
    -- Initialize with inputs
    for j = 1, NB_INPUT, 1 do
        ajouterNeurone(reseau, j, "input", 1)
    end
    -- Then outputs
    for j = NB_INPUT + 1, NB_INPUT + NB_OUTPUT, 1 do
        ajouterNeurone(reseau, j, "output", 0)
    end
    return reseau
end
```

शुरुआत में, प्रत्येक नेटवर्क में केवल इनपुट और आउटपुट होते हैं। कोई हिडन न्यूरॉन नहीं, कोई कनेक्शन नहीं। एल्गोरिदम तय करता है कि क्या किसी की आवश्यकता है।

### उत्परिवर्तन विस्तार से

#### वेट उत्परिवर्तन

```lua
function mutationPoidsConnexions(unReseau)
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            if math.random() < CHANCE_MUTATION_RESET_CONNEXION then
                -- 25%: total weight reset
                unReseau.lesConnexions[i].poids = genererPoids()
            else
                -- 75%: variation of ±0.80
                if math.random() >= 0.5 then
                    unReseau.lesConnexions[i].poids =
                        unReseau.lesConnexions[i].poids - POIDS_CONNEXION_MUTATION_AJOUT
                else
                    unReseau.lesConnexions[i].poids =
                        unReseau.lesConnexions[i].poids + POIDS_CONNEXION_MUTATION_AJOUT
                end
            end
        end
    end
end
```

प्रारंभिक वेट हमेशा 1 या -1 होता है (`genererPoids()`)। ±0.80 की भिन्नता इसे नकारात्मक और सकारात्मक दोनों मानों के बीच झूल सकती है, नेटवर्क के व्यवहार को मूल रूप से बदलते हुए।

#### कनेक्शन जोड़ना

```lua
function mutationAjouterConnexion(unReseau)
    local liste = {}
    -- Shuffle the neuron list
    for i, v in ipairs(unReseau.lesNeurones) do
        local pos = math.random(1, #liste+1)
        table.insert(liste, pos, v)
    end

    local traitement = false
    for i = 1, #liste, 1 do
        for j = 1, #liste, 1 do
            if i ~= j then
                local n1 = liste[i]
                local n2 = liste[j]
                -- Valid connection: input→output, hidden→hidden, hidden→output
                if (n1.type == "input" and n2.type == "output") or
                   (n1.type == "hidden" and n2.type == "hidden") or
                   (n1.type == "hidden" and n2.type == "output") then
                    -- Check no connection already exists
                    local dejaConnexion = false
                    for k = 1, #unReseau.lesConnexions, 1 do
                        if unReseau.lesConnexions[k].entree == n1.id
                            and unReseau.lesConnexions[k].sortie == n2.id then
                            dejaConnexion = true
                            break
                        end
                    end
                    if dejaConnexion == false then
                        traitement = true
                        ajouterConnexion(unReseau, n1.id, n2.id)
                    end
                end
            end
            if traitement then break end
        end
        if traitement then break end
    end
end
```

आप आउटपुट को इनपुट से नहीं जोड़ सकते (वह एक साइकिल बनाएगा), और आप दो न्यूरॉन्स को नहीं जोड़ सकते जो पहले से जुड़े हैं। शफल करने से हर बार अलग-अलग संभावनाओं का पता चलता है।

#### न्यूरॉन जोड़ना

यह सबसे दिलचस्प उत्परिवर्तन है:

```lua
function mutationAjouterNeurone(unReseau)
    if #unReseau.lesConnexions == 0 then return nil end
    if unReseau.nbNeurone == NB_NEURONE_MAX then return nil end

    -- Shuffle connections
    local listeRandom = {}
    for i = 1, #unReseau.lesConnexions, 1 do
        local pos = math.random(1, #listeRandom+1)
        table.insert(listeRandom, pos, i)
    end

    for i = 1, #listeRandom, 1 do
        if unReseau.lesConnexions[listeRandom[i]].actif then
            -- Disable the existing connection
            unReseau.lesConnexions[listeRandom[i]].actif = false
            unReseau.nbNeurone = unReseau.nbNeurone + 1
            local indice = unReseau.nbNeurone + NB_INPUT + NB_OUTPUT

            -- Create the hidden neuron
            ajouterNeurone(unReseau, indice, "hidden", 1)

            -- Connect input to hidden neuron
            ajouterConnexion(unReseau,
                unReseau.lesConnexions[listeRandom[i]].entree,
                indice, genererPoids())

            -- Connect hidden neuron to output
            ajouterConnexion(unReseau,
                indice,
                unReseau.lesConnexions[listeRandom[i]].sortie,
                genererPoids())
            break
        end
    end
end
```

तंत्र: आप एक मौजूदा कनेक्शन लेते हैं, उसे **अक्षम** करते हैं, और बीच में एक हिडन न्यूरॉन डालते हैं। मूल कनेक्शन को दो नए से बदल दिया जाता है: इनपुट→हिडन और हिडन→आउटपुट। यह एक तार काटकर बीच में स्विच लगाने जैसा है।

यही NEAT को "ऑगमेंटिंग टोपोलॉजीज़" बनाता है: नेटवर्क समय के साथ **बढ़ता** है। यह सरल शुरू होता है और केवल तभी जटिल होता है जब आवश्यक होता है।

### फीडफॉर्वर्ड

यह वह फंक्शन है जो नेटवर्क के माध्यम से सिग्नल प्रसारित करता है:

```lua
function feedForward(unReseau)
    -- Reset output neurons
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur = 0
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].allume = false
        end
    end

    -- Propagation
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            local avantTraitement = unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur =
                unReseau.lesNeurones[unReseau.lesConnexions[i].entree].valeur *
                unReseau.lesConnexions[i].poids +
                unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur

            if avantTraitement ~= unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur then
                unReseau.lesConnexions[i].allume = true
            else
                unReseau.lesConnexions[i].allume = false
            end
        end
    end
end
```

प्रत्येक सक्रिय कनेक्शन `इनपुट_वैल्यू × वेट` आउटपुट न्यूरॉन को भेजता है। वैल्यू **संचित** (जोड़ी जाती) है। `allume` फ्लैग केवल विज़ुअल नेटवर्क डिस्प्ले के लिए है।

### गेम की मेमोरी पढ़ना

`getLesInputs()` फंक्शन सुपर मारियो वर्ल्ड की दुनिया को उस डेटा में बदलता है जिसे नेटवर्क समझ सकता है:

```lua
function getLesInputs()
    local lesInputs = {}
    -- Initialize to 0 (gray = nothing)
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            lesInputs[getIndiceLesInputs(i, j)] = 0
        end
    end

    -- Sprites (enemies) = -1 (black)
    local lesSprites = getLesSprites()
    for i = 1, #lesSprites, 1 do
        local input = convertirPositionPourInput(getLesSprites()[i])
        if input.x > 0 and input.x < (TAILLE_VUE_W / TAILLE_TILE) + 1 then
            lesInputs[getIndiceLesInputs(input.x, input.y)] = -1
        end
    end

    -- Tiles (blocks) = tile value (white if > 0)
    local lesTiles = getLesTiles()
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            local indice = getIndiceLesInputs(i, j)
            if lesTiles[indice] ~= 0 then
                lesInputs[indice] = lesTiles[indice]
            end
        end
    end

    return lesInputs
end
```

इनपुट ग्रिड मारियो पर केंद्रित एक दृश्य है: 11 टाइल्स चौड़ा, 9 ऊंचा। प्रत्येक टाइल का मान:
- **0** (ग्रे): कुछ नहीं
- **1** (सफेद): ठोस ब्लॉक
- **-1** (काला): दुश्मन

दुश्मनों को RAM में दो सूचियों से पढ़ा जाता है: सामान्य स्प्राइट्स (`0x14C8`-`0x14F8`) और एक्सटेंडेड स्प्राइट्स (`0x170B`-`0x173B`)। प्रत्येक जीवित स्प्राइट (स्थिति > 7) के लिए, मारियो के सापेक्ष इसकी टाइल स्थिति की गणना की जाती है और संगत सेल में -1 रखा जाता है।

### फिटनेस: AI कैसे जानता है कि वह आगे बढ़ रहा है

```lua
function majReseau(unReseau, marioBase)
    local mario = getPositionMario()

    if not niveauFini and memory.readbyte(0x0100) == 12 then
        -- Level finished!
        unReseau.fitness = FITNESS_LEVEL_FINI
        niveauFini = true
    elseif marioBase.x < mario.x then
        -- Mario moved right
        unReseau.fitness = unReseau.fitness + (mario.x - marioBase.x)
        marioBase.x = mario.x
    end

    -- Update inputs
    local lesInputs = getLesInputs()
    for i = 1, NB_INPUT, 1 do
        unReseau.lesNeurones[i].valeur = lesInputs[i]
    end
end
```

फिटनेस सरल है: यह **दाईं ओर तय की गई दूरी** है। यदि मारियो 10 पिक्सेल चलता है, फिटनेस 10 बढ़ जाती है। यदि मारियो बाईं ओर चलता है, कुछ नहीं होता (कोई पेनल्टी नहीं)। यदि लेवल समाप्त हो जाता है (एड्रेस `0x0100` == 12), फिटनेस 1,000,000 हो जाती है।

यह जानबूझकर सरल है। दुश्मनों को मारने के लिए कोई बोनस नहीं, मरने के लिए कोई पेनल्टी नहीं। बस: दाईं ओर चलो।

### स्मार्ट रीसेट

यदि मारियो 33 फ्रेम तक नहीं चलता, तो लेवल रीसेट हो जाता है और हम अगले व्यक्ति पर चले जाते हैं। लेकिन यदि मारियो ने प्रगति की (वर्तमान फिटनेस शुरुआत से भिन्न है), तो हम 300 फ्रेम प्रतीक्षा करते हैं -- नेटवर्क को यह समझने का मौका देते हैं कि उसने क्या सही किया।

```lua
if fitnessAvant == laPopulation[idPopulation].fitness
   and memory.readbyte(0x13D4) == 0 then
    nbFrameStop = nbFrameStop + 1
    local nbFrameReset = NB_FRAME_RESET_BASE
    if fitnessInit ~= laPopulation[idPopulation].fitness
       and memory.readbyte(0x0071) ~= 9 then
        nbFrameReset = NB_FRAME_RESET_PROGRES
    end
    if nbFrameStop > nbFrameReset then
        nbFrameStop = 0
        lancerNiveau()
        idPopulation = idPopulation + 1
        -- ...
    end
end
```

शर्त `memory.readbyte(0x0071) ~= 9` जांचती है कि मारियो अपनी मृत्यु एनिमेशन में नहीं है। यदि मारियो पहले से मर चुका है तो रीसेट करने का कोई फायदा नहीं।

### मेन लूप

लूप 30 fps पर चलता है (सुपर मारियो वर्ल्ड की सामान्य गति):

```lua
while true do
    local fitnessAvant = laPopulation[idPopulation].fitness

    -- Display (network, info)
    if forms.ischecked(estAccelere) then
        emu.limitframerate(false)  -- speed up
    else
        emu.limitframerate(true)   -- 30 fps
    end

    -- The 3 vital functions
    majReseau(laPopulation[idPopulation], marioBase)
    feedForward(laPopulation[idPopulation])
    appliquerLesBoutons(laPopulation[idPopulation])

    emu.frameadvance()
    nbFrame = nbFrame + 1

    -- Reset if no progress
    -- ...
    -- New generation if all individuals tested
    -- ...
end
```

तीन मुख्य फंक्शन `majReseau`, `feedForward`, और `appliquerLesBoutons` हैं। इनमें से किसी एक को अक्षम करें और मारियो चलना बंद कर देता है।

### क्रॉसओवर

```lua
function crossover(unReseau1, unReseau2)
    local leReseau = newReseau()
    local leBon = unReseau1
    local leNul = unReseau2

    if leBon.fitness < leNul.fitness then
        leBon = unReseau2
        leNul = unReseau1
    end

    leReseau = copier(leBon)

    for i = 1, #leReseau.lesConnexions, 1 do
        for j = 1, #leNul.lesConnexions, 1 do
            if leReseau.lesConnexions[i].innovation == leNul.lesConnexions[j].innovation
               and leNul.lesConnexions[j].actif then
                if math.random() > 0.5 then
                    leReseau.lesConnexions[i] = leNul.lesConnexions[j]
                end
            end
        end
    end
    leReseau.fitness = 1
    return leReseau
end
```

बच्चा बेहतर माता-पिता से विरासत पाता है। प्रत्येक कनेक्शन के लिए जिसका एक ही इनोवेशन है, दूसरे माता-पिता के पास इसे बदलने की 50% संभावना है -- लेकिन **केवल तभी जब कनेक्शन सक्रिय हो**। यह एक महत्वपूर्ण सुधार है: इसके बिना, बेकार हिडन न्यूरॉन्स बन सकते हैं।

### प्रजाति चयन

```lua
function nouvelleGeneration(laPopulation, lesEspeces)
    local laNouvellePopulation = newPopulation()
    local nbIndividuACreer = NB_INDIVIDU_POPULATION

    -- Calculate average fitness per species
    for i = 1, #lesEspeces, 1 do
        lesEspeces[i].fitnessMoyenne = 0
        for j = 1, #lesEspeces[i].lesReseaux, 1 do
            lesEspeces[i].fitnessMoyenne =
                lesEspeces[i].fitnessMoyenne + lesEspeces[i].lesReseaux[j].fitness
        end
        lesEspeces[i].fitnessMoyenne =
            lesEspeces[i].fitnessMoyenne / #lesEspeces[i].lesReseaux
    end

    -- Each species creates a number of children proportional to its average fitness
    for i = 1, #lesEspeces, 1 do
        local nbEnfant = math.ceil(
            #lesEspeces[i].lesReseaux *
            lesEspeces[i].fitnessMoyenne / fitnessMoyenneGlobal)

        for j = 1, nbEnfant, 1 do
            local unReseau = crossover(
                choisirParent(lesEspeces[i].lesReseaux),
                choisirParent(lesEspeces[i].lesReseaux))
            mutation(unReseau)
            laNouvellePopulation[indiceNouvelleEspece] = copier(unReseau)
        end
    end
end
```

विचार: 10,000 की औसत फिटनेस वाली प्रजाति 1 की औसत फिटनेस वाली प्रजाति की तुलना में कहीं अधिक बच्चे बना सकती है। यह **प्राकृतिक चयन** कार्रवाई में है।

`choisirParent` रूलेट चयन का उपयोग करता है: जितनी अधिक व्यक्ति की फिटनेस होती है, माता-पिता के रूप में चयनित होने की संभावना उतनी अधिक होती है।

### सेविंग और लोडिंग

आबादियों को `.pop` फाइलों में सहेजा जाता है:

```lua
function sauvegarderUnReseau(unReseau, fichier)
    io.write(unReseau.nbNeurone .. "\n")
    io.write(#unReseau.lesConnexions .. "\n")
    io.write(unReseau.fitness .. "\n")
    for i = 1, unReseau.nbNeurone, 1 do
        local indice = NB_INPUT + NB_OUTPUT + i
        io.write(unReseau.lesNeurones[indice].id .. "\n")
    end
    for i = 1, #unReseau.lesConnexions, 1 do
        local actif = 1
        if unReseau.lesConnexions[i].actif ~= true then actif = 0 end
        io.write(actif .. "\n" ..
            unReseau.lesConnexions[i].entree .. "\n" ..
            unReseau.lesConnexions[i].sortie .. "\n" ..
            unReseau.lesConnexions[i].poids .. "\n" ..
            unReseau.lesConnexions[i].innovation .. "\n")
    end
end
```

सेव में सभी पिछली आबादियों का सर्वोत्तम व्यक्ति भी शामिल है। यदि पुरानी आबादी का सर्वोत्तम नए से बेहतर है, तो हम पुराने को बेस के रूप में वापस लौटते हैं। यह **एलीटिज़्म** का एक रूप है: सर्वोत्तम कभी नहीं खोता।

### नेटवर्क विज़ुअलाइज़ेशन

Laupok ने गेम पर ओवरलेड एक न्यूरल नेटवर्क विज़ुअलाइज़र जोड़ा:

```lua
function dessinerUnReseau(unReseau)
    -- Inputs: 11×9 grid around Mario
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            local xT = ENCRAGE_X_INPUT + (i - 1) * TAILLE_INPUT
            local yT = ENCRAGE_Y_INPUT + (j - 1) * TAILLE_INPUT
            local couleurFond = "gray"
            if unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur < 0 then
                couleurFond = "black"   -- enemy
            elseif unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur > 0 then
                couleurFond = "white"   -- block
            end
            gui.drawRectangle(xT, yT, TAILLE_INPUT, TAILLE_INPUT, "black", couleurFond)
        end
    end

    -- Outputs: 8 buttons
    for i = 1, NB_OUTPUT, 1 do
        local xT = ENCRAGE_X_OUTPUT
        local yT = ENCRAGE_Y_OUTPUT + ESPACE_Y_OUTPUT * (i - 1)
        if sigmoid(unReseau.lesNeurones[i + NB_INPUT].valeur) then
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "white")
        else
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "black")
        end
    end

    -- Connections
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            local alpha = 25
            if unReseau.lesConnexions[i].allume then alpha = 255 end
            local couleur = forms.createcolor(255, 255, 255, alpha)
            gui.drawLine(
                lesPositions[unReseau.lesConnexions[i].entree].x,
                lesPositions[lesConnexions[i].entree].y,
                lesPositions[unReseau.lesConnexions[i].sortie].x,
                lesPositions[lesConnexions[i].sortie].y,
                couleur)
        end
    end
end
```

यह यह समझने के लिए अविश्वसनीय रूप से उपयोगी है कि नेटवर्क क्या करता है। सक्रिय कनेक्शन सफेद हैं, निष्क्रिय अर्ध-पारदर्शी। इनपुट सफेद/काले/ग्रे सेल्स का एक ग्रिड है। आउटपुट दिखाते हैं कि कौन से बटन दबाए गए हैं।

---

## परिणाम

### AI ने क्या सीखा

घंटों (और दिनों) के निष्पादन के दौरान, AI ने अपने आप खोज लिया:

1. **दाईं ओर चलो**: सबसे बुनियादी व्यवहार, लेकिन Right बटन दबाए रखने की आवश्यकता है
2. **दुश्मनों पर कूदो**: "दुश्मन का पता चला" इनपुट को A या B बटन से जोड़कर
3. **बाधाओं से बचो**: कुछ नेटवर्क्स ने आगे बढ़ने के लिए अस्थायी रूप से पीछे हटना सीखा
4. **लेवल पूरा करो**: सर्वोत्तम व्यक्ति सुपर मारियो वर्ल्ड का पहला लेवल पूरा करने में सक्षम था

![AI द्वारा नियंत्रित मारियो सुपर मारियो वर्ल्ड लेवल में एक बू का सामना कर रहा है -- न्यूरल नेटवर्क रीयल-टाइम में क्रियाएं निर्धारित करता है](/images/laupok-mario-ai/mario-ai-playing.jpg)

### सीमाएं

प्रोजेक्ट की अपनी सीमाएं हैं:

- **एकल लेवल**: AI एक विशिष्ट लेवल पर प्रशिक्षित है। यह स्वचालित रूप से अन्य लेवल पर सामान्यीकृत नहीं होता
- **प्रशिक्षण समय**: संतोषजनक परिणाम प्राप्त करने में दसियों घंटे लगते हैं
- **कोई समझ नहीं**: AI को यह "समझ" नहीं होता कि वह क्या कर रहा है। यह यादृच्छिक उत्परिवर्तन के माध्यम से एक फिटनेस फंक्शन (तय की गई दूरी) को अनुकूलित करता है
- **टी-बैगिंग**: Laupok नोट करते हैं कि मारियो दुश्मन देखकर जगह पर कूदने की प्रवृत्ति रखता है, बस इसलिए क्योंकि यह फिटनेस बढ़ाता है (वह कूदते समय थोड़ा आगे बढ़ता है)

---

## प्रयोग कैसे दोहराएं

Laupok ने सब कुछ साझा किया। चरण इस प्रकार हैं:

1. **BizHawk डाउनलोड करें** [tasvideos.org](https://tasvideos.org/BizHawk) से (डाउनलोड सेक्शन)
2. **सुपर मारियो वर्ल्ड की USA ROM प्राप्त करें** (अपने अपने कार्ट्रिज की निजी कॉपी)
3. **Lua स्क्रिप्ट डाउनलोड करें** [Pastebin](https://pastebin.com/Jcvdqhqm) से -- `mario.lua` में नाम बदलें
4. **स्क्रिप्ट को ROM के उसी फोल्डर में रखें**
5. **BizHawk लॉन्च करें**, ROM खोलें
6. **Lua कंसोल में**: `dofile("mario.lua")` या Script > Open Script मेनू के माध्यम से
7. **लेवल की शुरुआत में एक स्टेट सेव करें** (Savestate > Save State मेनू) और इसे `debut.state` नाम दें
8. **स्क्रिप्ट फिर से लॉन्च करें** -- यह काम करता है

स्क्रिप्ट में विकल्पों के साथ एक फॉर्म शामिल है:
- **एक्सेलरेट**: 30 fps सीमा को तेज़ जाने के लिए अक्षम करता है
- **नेटवर्क दिखाएं**: न्यूरल नेटवर्क को गेम पर ओवरलेड दिखाता है
- **जानकारी दिखाएं**: जनरेशन, फिटनेस और प्रजाति गणना वाला एक बैनर दिखाता है
- **पॉज़**: निष्पादन रोकता है
- **सेव/लोड**: वर्तमान आबादी को `.pop` फाइल में संग्रहीत करता है

---

## स्रोत और संदर्भ

| संसाधन | लिंक |
|----------|------|
| Laupok का मुख्य वीडियो | [मैंने एक AI बनाया जो मारियो खुद खेलता है](https://www.youtube.com/watch?v=F63GNXGHVwM) |
| कोड रिव्यू + सेटअप वीडियो | [AI कैसे सेट करें + सोर्स कोड रिव्यू](https://www.youtube.com/watch?v=u5xCl1bSe6o) |
| पूरा सोर्स कोड | [Pastebin Jcvdqhqm](https://pastebin.com/Jcvdqhqm) |
| मूल NEAT पेपर | Stanley & Miikkulainen, "Evolving Neural Networks through Augmenting Topologies", 2002 |
| N8Programs ट्यूटोरियल | [NEAT इम्प्लीमेंटेशन वॉकथ्रू](https://n8programs.github.io/) (JavaScript, लेकिन अवधारणाएं समान हैं) |
| 16blings (Laupok की प्रेरणा) | [AI सुपर मारियो वर्ल्ड खेलता है](https://www.youtube.com/watch?v=qv6IFaOz3bA) |
| BizHawk | [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) |
| सुपर मारियो वर्ल्ड मेमोरी | [SMW Central - RAM Map](https://www.smwcentral.net/?p=section&a=details&id=21702) |

---

## निष्कर्ष

Laupok ने जो किया वह एक शैक्षणिक एल्गोरिदम (NEAT, 2002) लेना था, इसे एम्यूलेटर (BizHawk) के लिए Lua में फिर से लिखना था, और इसे सुपर मारियो वर्ल्ड पर लागू करना था। परिणाम: एक AI जो शून्य से खेलना सीखता है, कोई पूर्व ज्ञान नहीं, केवल यादृच्छिक उत्परिवर्तन और प्राकृतिक चयन के माध्यम से।

यह जेनेटिक एल्गोरिदम की शक्ति का एक सुंदर उदाहरण है। कोई डीप लर्निंग नहीं, कोई GPU नहीं, कोई लाखों प्रशिक्षण डेटा पॉइंट्स नहीं। बस प्राकृतिक चयन, कुछ Lua, और बहुत धैर्य।

कोड कमेंटेड है, साझा है, और Laupok ने दो समझाने वाले वीडियो बनाए -- एक बड़ी अवधारणाओं के लिए, एक कोड के लिए। यदि विषय में रुचि है, तो गोता लगाएं। यह दिखने से कहीं अधिक सुलभ है।
