---
title: "Laupok ने AI बनाई जो Super Mario World खुद खेलती है, यह कैसे काम करता है"

date: 2026-07-11
tags:
  - ai
  - lua
  - emulation
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "NgJU/EmQAyz5Rz4JigKCQX1HcUCmimFAcq2lppGTS1npBbnth1JeHNEOhxKWlwNos/RPVyM+XQoTMjGhjbZd3A=="
---

# Laupok ने AI बनाई जो Super Mario World खुद खेलती है, यह कैसे काम करता है

Laupok ने कृत्रिम बुद्धि बनाई है जो **Super Mario World** पूरी तरह स्वायत्त खेलती है। वह शून्य से शुरू करती है : कोई पूर्वनिर्धारित स्क्रिप्ट नहीं, कोई रिकॉर्ड किया फ्रेम नहीं। AI खुद सीखती है, बेतरतीब उत्परिवर्तन और प्राकृतिक चयन से, खेल के स्तर खत्म करना। प्रोजेक्ट **BizHawk** पर चलता है, बहु मंच emulator, लगभग **4200 पंक्तियों** की Lua स्क्रिप्ट से।

जो इस प्रोजेक्ट को आकर्षक बनाता है, वह है कि यह कंप्यूटिंग पर लागू जैविक अवधारणाओं पर टिका है : **Darwin का विकास सिद्धांत**, **कृत्रिम neural network**, और खासकर एक विशिष्ट एल्गोरिदम जिसे **NEAT** (NeuroEvolution of Augmenting Topologies) कहते हैं। AI शुरू में खेल के बारे में कुछ नहीं जानती। वह बेतरतीब क्रियाएँ परखती है, हजारों बार विफल होती है, और धीरे धीरे समझती है कि आगे कैसे बढ़ना, कूदना और बचना है।

इस लेख में, हम यह सब चीड़ेंगे, अवधारणा दर अवधारणा, कोड पंक्ति दर कोड पंक्ति।

![Laupok कैमरे के सामने NEAT एल्गोरिदम पेश करता है](/images/laupok-mario-ai/neat-title.jpg)

---

## setup : BizHawk, Lua, और Super Mario World

### BizHawk emulator

BizHawk ओपन सोर्स emulator है जो बहुत सारे console समर्थन करता है, NES, SNES, Genesis, PS1, Game Boy, और बहुत अन्य। उसकी विशेषता यह है कि वह खेल के समानांतर **Lua स्क्रिप्ट** चलाने देता है। इन स्क्रिप्टों की emulation की **RAM** तक पहुँच होती है, यानी वे वास्तविक समय में खेल का कोई भी डेटा पढ़ सकते हैं, और बदल सकते हैं।

ठोस रूप में, इसका मतलब है कि हम कर सकते हैं :
- स्तर में Mario की स्थिति पढ़ना
- जानना कि कौन से sprite (शत्रु, item) स्क्रीन पर हैं
- Mario के आसपास हर tile (ब्लॉक) की स्थिति जानना
- controller नियंत्रित करना, किसी भी बटन दबाना

ठीक वही है जो AI को खिलवाने के लिए चाहिए।

### Super Mario World स्मृति पते

Super Mario World RAM में, हर डेटा विशिष्ट पते पर संग्रहित है। यह थोड़ा मोहल्ले जैसा है : हर पता "घर" से मेल खाता है जिसमें जानकारी होती है। उदाहरण के लिए :

| पता | डेटा |
|---------|--------|
| `0x94`-`0x95` | Mario की X स्थिति (16 बिट, little-endian) |
| `0x96`-`0x97` | Mario की Y स्थिति |
| `0x14C8`+`i` | sprite `i` की स्थिति (>7 = जीवित) |
| `0xE4`+`i` | sprite `i` की निचली X स्थिति |
| `0x14E0`+`i` | sprite `i` की ऊपरी X स्थिति |
| `0xD8`+`i` | sprite `i` की निचली Y स्थिति |
| `0x14D4`+`i` | sprite `i` की ऊपरी Y स्थिति |
| `0x170B`+`i` | extended sprite `i` का प्रकार |
| `0x0100` | खेल स्थिति (12 = स्तर खत्म) |
| `0x13D4` | सक्रिय pause |
| `0x0071` | Mario मृत्यु एनीमेशन (9 = मरा) |
| `0x1C800`+... | स्तर tile तालिका |

sprite स्थिति दो octet इस्तेमाल करती है : "निचला" octet और "ऊपरी" octet, क्योंकि स्थिति 255 pixel से पार कर सकती है। सूत्र हमेशा `निचला + ऊपरी × 256` है।

tile के लिए, यह जटिल है : आधार पता `0x1C800` है, और offset दुनिया में tile के `x` और `y` निर्देशांक अनुसार गणना किया जाता है, प्रति tile 16 pixel कदम के साथ।

![डिबग overlay वाला Super Mario World जो sprite स्मृति पते और Mario स्थिति दिखाता है](/images/laupok-mario-ai/memory-debug.jpg)

---

## आधार : आनुवंशिक एल्गोरिदम और neural network

कोड में गोता लगाने से पहले, दो मौलिक अवधारणाएँ समझनी होंगी। उनके बिना, बाकी का कोई अर्थ नहीं।

### आनुवंशिक एल्गोरिदम

आनुवंशिक एल्गोरिदम **विकास सिद्धांत** का अनुकरण है। केंद्रीय विचार : हम व्यक्तियों की **आबादी** बनाते हैं, हर एक थोड़ी अलग विशेषताओं ("जीन") के साथ। हम उन्हें वातावरण में "जीवित" कराते हैं। जो सबसे अच्छा करते हैं वे बचते और प्रजनन करते हैं। जो बुरा करते हैं वे गायब हो जाते हैं।

Laupok इसे **Kirby** सादृश्य से दर्शाता है :
- काँटों और टमाटरों वाले मैदान पर Kirby की आबादी प्रकट होती है
- काँटे जीवन अंक हटाते हैं, टमाटर वापस देते हैं
- हर Kirby के जीन हैं : आकार, गति, जीवन अंक, व्यवहार (भागना, टमाटर खोजना, कहीं भी दौड़ना)

![DNA दोहरी कुंडली "le bébé", "taille", "vitesse", "couleur" लेबल के साथ, व्यक्ति बनाने वाले जीन](/images/laupok-mario-ai/dna-genes.jpg)

- 15 सेकंड बाद, देखते हैं कौन सबसे लंबा बचा
- सबसे अच्छा Kirby दूसरों से प्रजनन करता है : बच्चे सबसे अच्छे के आधे जीन और "सबसे बुरे" के आधे विरासत में पाते हैं
- बच्चे बेतरतीब **उत्परिवर्तन** झेलते हैं (थोड़ा बड़ा, थोड़ा तेज...)
- पुराने Kirby नए से बदले जाते हैं
- फिर से चलाते हैं

180 पीढ़ियों (~15 घंटे) बाद, Kirby 15 सेकंड बचने से **15 मिनट** जाते हैं। वे छोटे हो गए (टक्कर क्षेत्र घटा), तेज, और लगातार खतरे से भागते हैं।

![Kirby अनुकरण पीढ़ी 0 : बेतरतीब बिखरे रंगीन गोले काली पृष्ठभूमि पर, सभी समान आकार](/images/laupok-mario-ai/kirby-gen0.jpg)

![Kirby अनुकरण पीढ़ी 1866 : Kirby छोटे, तेज हैं, और व्यवस्थित खतरे से भागते हैं](/images/laupok-mario-ai/kirby-gen1866.jpg)

![Kirby अनुकरण आँकड़े : fitness, जीवन अंक संख्या, प्रदर्शन से वर्गीकृत हर व्यक्ति का व्यवहार](/images/laupok-mario-ai/kirby-stats.jpg)

महत्वपूर्ण बिंदु : **हम समाधान परिभाषित नहीं करते**। एल्गोरिदम उसे **खुद खोजता है**। और ठीक यही उसे उन समस्याओं के लिए शक्तिशाली बनाता है जहाँ हम नहीं जानते कि पैरामीटर का कौन सा संयोजन इष्टतम होगा।

### कृत्रिम neural network

neural network मानव मस्तिष्क का सरलीकृत गणितीय मॉडल है। वह बना है :
- **प्रवेश neuron** (input) : network क्या "देखता" है
- **निकास neuron** (output) : network क्या "तय" करता है
- **कनेक्शन** (भार) : हर कनेक्शन का **भार** होता है जो संकेत बढ़ाता या घटाता है

सिद्धांत सरल है : हर प्रवेश neuron अपना मान भेजता है। वह कनेक्शन भार से गुणा होता है, फिर अन्य संकेतों में जोड़ा जाता है। अगर परिणाम निश्चित सीमा (सक्रियण फंक्शन) पार करता है, तो निकास neuron सक्रिय होता है।

Mario और चूहे के टुकड़े के साथ Laupok सादृश्य में :
- प्रवेश neuron = Mario और टुकड़े के बीच दूरी
- कनेक्शन भार = Mario की संवेदनशीलता
- निकास neuron = Mario चिल्लाता है या नहीं

टुकड़ा जितना करीब, प्रवेश मान उतना ऊँचा। अगर भार मजबूत है, तो निकास भेजा संकेत मजबूत है, और Mario चिल्लाएगा। भार बदलकर, Mario की संवेदनशीलता बदलती है।

![Mario डरा डेमो : Boo के सामने Mario जिसमें प्रवेश और निकास के बीच कनेक्शन भार दिखाती synapse पट्टी](/images/laupok-mario-ai/mario-fear-demo.jpg)

AI के असली neural network में, वही तर्क है, लेकिन बड़े पैमाने पर :
- **99 प्रवेश neuron** (Mario दृश्य के 11×9 tile)
- **8 निकास neuron** (A, B, X, Y, ऊपर, नीचे, बाएँ, दाएँ)
- दोनों के बीच **छिपे neuron** (hidden)
- विविध भारों वाले सैकड़ों कनेक्शन

---

## NEAT : एल्गोरिदम जो सब बदलता है

### क्लासिक आनुवंशिक एल्गोरिदम की समस्या

अगर हम neural network के साथ आनुवंशिक एल्गोरिदम भोले तरीके से जोड़ते हैं, तो हमें समस्या है : हम 100 पूरी तरह अलग neural network बनाते हैं, और नहीं जानते उनकी तुलना कैसे करें। हर एक के अपने neuron, अपने कनेक्शन, अपने भार हैं। कैसे जानें कि दो network "करीब" हैं या "दूर" ?

यहीं **NEAT** आता है, NeuroEvolution of Augmenting Topologies। **Kenneth Stanley** और **Risto Miikkulainen** ने 2002 में आविष्कृत, यह एल्गोरिदम ठीक यह समस्या सुलझाता है।

### प्रजातियाँ

NEAT का पहला मुख्य तंत्र **प्रजातियाँ** हैं। जब neural network दूसरे से बहुत अलग हो जाता है, तो वह अलग प्रजाति में वर्गीकृत होता है। समानता तीन पैरामीटर से गणना की जाती है :

1. **Excess** (`EXCES_COEF = 0.50`) : कनेक्शन संख्या जिनका दो network के बीच कोई संबंध नहीं (अलग नवाचार)
2. **Disjoint** : वही, लेकिन बीच में स्थित कनेक्शन के लिए
3. **Weight difference** (`POIDSDIFF_COEF = 0.92`) : वही नवाचार साझा करने वाले कनेक्शन के बीच औसत भार अंतर

स्कोर सूत्र :

```
score = (EXCES_COEF × disjoint) / max(nbConnexions1 + nbConnexions2, 1)
      + POIDSDIFF_COEF × diffPoids
```

अगर यह स्कोर `DIFF_LIMITE` (1.0) से कम है, तो दोनों network उसी प्रजाति में हैं। वरना, नई प्रजाति बनती है।

### नवाचार

यह NEAT की प्रतिभा है। हर बार जब कनेक्शन बनता है, तो उसे अद्वितीय और वैश्विक **नवाचार** संख्या मिलती है। यह संख्या neural network का अनुसरण करती है जब वह प्रजनन करता है।

ठोस रूप में, जब बच्चा crossover से बनता है, वह अपने माता पिता के नवाचार विरासत में पाता है। अगर दो network वही नवाचार साझा करते हैं, तो इसका मतलब है कि उनका कनेक्शन उसी पूर्वज से आता है। यही अलग आकार के network तुलना करने देता है।

### crossover

जब दो neural network प्रजनन करते हैं, तो **crossover** इस तरह काम करता है :

![Laupok crossover अवधारणा समझाता है जिसमें "CROSSOVER" पाठ overlay में](/images/laupok-mario-ai/crossover-label.jpg)

1. सबसे प्रदर्शनकारी network "प्रमुख माता पिता" बनता है
2. बच्चा प्रमुख के सभी कनेक्शन विरासत में पाता है
3. वही नवाचार साझा करने वाले हर कनेक्शन के लिए, दूसरा माता पिता उसे बदल सकता है (50% संभावना)
4. सिर्फ गैर प्रमुख माता पिता के सक्रिय कनेक्शन बदल सकते हैं

यह गारंटी देता है कि बच्चा हमेशा सर्वश्रेष्ठ माता पिता जितना अच्छा है।

### उत्परिवर्तन

crossover बाद, बच्चा कॉन्फ़िगर करने योग्य संभावनाओं से उत्परिवर्तन झेलता है :

![Laupok उत्परिवर्तन समझाता है जिसमें "(petite modif = mutation)" पाठ overlay में](/images/laupok-mario-ai/mutation-label.jpg)

| उत्परिवर्तन | संभावना | प्रभाव |
|----------|------------|-------|
| कनेक्शन भार reset | 25% | भार पूरी तरह बेतरतीब होता है |
| भार उत्परिवर्तन | 95% | भार ±0.80 बदलता है |
| कनेक्शन जोड़ना | 85% | अभी जुड़े नहीं दो neuron के बीच नया कनेक्शन |
| neuron जोड़ना | 39% | जुड़े दो neuron के बीच छिपा neuron डाला जाता है |

neuron जोड़ दर महत्वपूर्ण है : यही network को **बढ़ने** देती है। शुरू में, सिर्फ प्रवेश और निकास हैं। धीरे धीरे, छिपे neuron प्रकट होते हैं, network जटिल बनता जाता है।

---

## कोड : पूरा walkthrough

### स्थिरांक

स्क्रिप्ट स्थिरांक ब्लॉक से शुरू होती है जो सारा पैरामीटर परिभाषित करता है :

```lua
-- Mario के आसपास दृश्य
TAILLE_TILE = 16
TAILLE_VUE_W = TAILLE_TILE * 11  -- चौड़ाई में 176 pixel
TAILLE_VUE_H = TAILLE_TILE * 9   -- ऊँचाई में 144 pixel
NB_TILE_W = TAILLE_VUE_W / TAILLE_TILE  -- 11 tile
NB_TILE_H = TAILLE_VUE_H / TAILLE_TILE  -- 9 tile

-- neural network
NB_INPUT = NB_TILE_W * NB_TILE_H  -- 99 input (दिखते tile)
NB_OUTPUT = 8  -- A, B, X, Y, ऊपर, नीचे, बाएँ, दाएँ
NB_INDIVIDU_POPULATION = 100  -- प्रति आबादी व्यक्ति
NB_NEURONE_MAX = 100000  -- छिपे neuron सीमा

-- Fitness
FITNESS_LEVEL_FINI = 1000000  -- स्तर खत्म होने पर मान
NB_FRAME_RESET_BASE = 33  -- प्रगति रहित reset से पहले frame
NB_FRAME_RESET_PROGRES = 300  -- प्रगति पकड़ी जाने पर frame

-- प्रजातियाँ
EXCES_COEF = 0.50
POIDSDIFF_COEF = 0.92
DIFF_LIMITE = 1.00

-- उत्परिवर्तन
CHANCE_MUTATION_RESET_CONNEXION = 0.25
POIDS_CONNEXION_MUTATION_AJOUT = 0.80
CHANCE_MUTATION_POIDS = 0.95
CHANCE_MUTATION_CONNEXION = 0.85
CHANCE_MUTATION_NEURONE = 0.39
```

`NB_INPUT` 99 है क्योंकि Mario दृश्य 11×9 tile करता है। हर tile प्रवेश neuron है। अगर tile खाली है, तो वह 0 है। अगर ब्लॉक है, तो वह 1 है। अगर शत्रु है, तो वह -1 है।

8 निकास SNES controller बटन से मेल खाते हैं : A, B, X, Y, ऊपर, नीचे, बाएँ, दाएँ। निर्णय जरूरी तक सीमित करने के लिए Start, Select, L और R बाहर हैं।

### डेटा संरचनाएँ

स्क्रिप्ट तीन मुख्य संरचनाएँ परिभाषित करती है :

```lua
function newNeurone()
    local neurone = {}
    neurone.valeur = 0    -- neuron का वर्तमान मान
    neurone.id = 0        -- अद्वितीय पहचान
    neurone.type = ""     -- "input", "output", या "hidden"
    return neurone
end

function newConnexion()
    local connexion = {}
    connexion.entree = 0     -- स्रोत neuron ID
    connexion.sortie = 0     -- गंतव्य neuron ID
    connexion.actif = true   -- निष्क्रिय हो सकता है अगर छिपा neuron डाला जाए
    connexion.poids = 0      -- कनेक्शन भार
    connexion.innovation = 0 -- अद्वितीय नवाचार संख्या
    connexion.allume = false -- प्रदर्शन के लिए : true अगर संकेत गुजरता है
    return connexion
end

function newReseau()
    local reseau = {
        nbNeurone = 0,        -- छिपे neuron संख्या
        fitness = 1,          -- प्रदर्शन (तय दूरी)
        idEspeceParent = 0,   -- किस प्रजाति का है
        lesNeurones = {},     -- neuron तालिका
        lesConnexions = {}    -- कनेक्शन तालिका
    }
    -- input से आरंभीकरण
    for j = 1, NB_INPUT, 1 do
        ajouterNeurone(reseau, j, "input", 1)
    end
    -- फिर output
    for j = NB_INPUT + 1, NB_INPUT + NB_OUTPUT, 1 do
        ajouterNeurone(reseau, j, "output", 0)
    end
    return reseau
end
```

शुरू में, हर network में सिर्फ input और output होते हैं : कोई छिपा neuron नहीं, कोई कनेक्शन नहीं। एल्गोरिदम तय करेगा कि क्या चाहिए।

### विस्तार में उत्परिवर्तन

#### भार उत्परिवर्तन

```lua
function mutationPoidsConnexions(unReseau)
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            if math.random() < CHANCE_MUTATION_RESET_CONNEXION then
                -- 25% : भार का कुल reset
                unReseau.lesConnexions[i].poids = genererPoids()
            else
                -- 75% : ±0.80 बदलाव
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

प्रारंभिक भार हमेशा 1 या -1 (`genererPoids()`) होता है। ±0.80 बदलाव उसे नकारात्मक और सकारात्मक मानों के बीच दोलन करा सकता है, जो network व्यवहार मौलिक बदलता है।

#### कनेक्शन जोड़ना

```lua
function mutationAjouterConnexion(unReseau)
    local liste = {}
    -- neuron सूची बेतरतीब करना
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
                -- वैध कनेक्शन : input→output, hidden→hidden, hidden→output
                if (n1.type == "input" and n2.type == "output") or
                   (n1.type == "hidden" and n2.type == "hidden") or
                   (n1.type == "hidden" and n2.type == "output") then
                    -- जाँचना कि पहले से कनेक्शन नहीं है
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

हम output को input से नहीं जोड़ सकते (यह चक्र बनाएगा), और हम पहले से जुड़े दो neuron नहीं जोड़ सकते। बेतरतीबता गारंटी देती है कि हम हर बार अलग संभावनाएँ खोजते हैं।

#### neuron जोड़ना

यह सबसे दिलचस्प उत्परिवर्तन है :

```lua
function mutationAjouterNeurone(unReseau)
    if #unReseau.lesConnexions == 0 then return nil end
    if unReseau.nbNeurone == NB_NEURONE_MAX then return nil end

    -- कनेक्शन बेतरतीब करना
    local listeRandom = {}
    for i = 1, #unReseau.lesConnexions, 1 do
        local pos = math.random(1, #listeRandom+1)
        table.insert(listeRandom, pos, i)
    end

    for i = 1, #listeRandom, 1 do
        if unReseau.lesConnexions[listeRandom[i]].actif then
            -- मौजूदा कनेक्शन निष्क्रिय करना
            unReseau.lesConnexions[listeRandom[i]].actif = false
            unReseau.nbNeurone = unReseau.nbNeurone + 1
            local indice = unReseau.nbNeurone + NB_INPUT + NB_OUTPUT

            -- छिपा neuron बनाना
            ajouterNeurone(unReseau, indice, "hidden", 1)

            -- प्रवेश को छिपे neuron से जोड़ना
            ajouterConnexion(unReseau,
                unReseau.lesConnexions[listeRandom[i]].entree,
                indice, genererPoids())

            -- छिपे neuron को निकास से जोड़ना
            ajouterConnexion(unReseau,
                indice,
                unReseau.lesConnexions[listeRandom[i]].sortie,
                genererPoids())
            break
        end
    end
end
```

तंत्र : हम मौजूदा कनेक्शन लेते हैं, उसे **निष्क्रिय** करते हैं, और बीच में छिपा neuron डालते हैं। मूल कनेक्शन दो नए कनेक्शन से बदला जाता है : प्रवेश→छिपा और छिपा→निकास। जैसे हम switch डालने के लिए तार "काटते" हैं।

यही NEAT को "augmenting topologies" बनाता है : network समय के साथ **बढ़ता** है। वह सरल शुरू होता है और सिर्फ जरूरत होने पर जटिल बनता है।

### feedForward

यह फंक्शन है जो network में संकेत फैलाता है :

```lua
function feedForward(unReseau)
    -- निकास neuron reset
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur = 0
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].allume = false
        end
    end

    -- फैलाव
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

हर सक्रिय कनेक्शन निकास neuron की ओर `प्रवेश_मान × भार` भेजता है। मान **जमा** (जोड़ा) होता है। `allume` ध्वज सिर्फ network के दृश्य प्रदर्शन के लिए है।

### खेल स्मृति पढ़ना

`getLesInputs()` फंक्शन वह है जो Super Mario World दुनिया को network समझने वाले डेटा में बदलता है :

```lua
function getLesInputs()
    local lesInputs = {}
    -- 0 पर आरंभीकरण (धूसर = कुछ नहीं)
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            lesInputs[getIndiceLesInputs(i, j)] = 0
        end
    end

    -- sprite (शत्रु) = -1 (काला)
    local lesSprites = getLesSprites()
    for i = 1, #lesSprites, 1 do
        local input = convertirPositionPourInput(getLesSprites()[i])
        if input.x > 0 and input.x < (TAILLE_VUE_W / TAILLE_TILE) + 1 then
            lesInputs[getIndiceLesInputs(input.x, input.y)] = -1
        end
    end

    -- tile (ब्लॉक) = tile मान (0 से ज्यादा होने पर सफेद)
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

input ग्रिड Mario केंद्रित दृश्य है : चौड़ाई में 11 tile, ऊँचाई में 9। हर tile है :
- **0** (धूसर) : कुछ नहीं
- **1** (सफेद) : ठोस ब्लॉक
- **-1** (काला) : शत्रु

शत्रु RAM में दो सूचियों से पढ़े जाते हैं : सामान्य sprite (`0x14C8`-`0x14F8`) और extended sprite (`0x170B`-`0x173B`)। हर जीवित sprite (स्थिति > 7) के लिए, हम Mario सापेक्ष tile में उसकी स्थिति गणना करते हैं और संबंधित खाने में -1 रखते हैं।

### fitness : AI कैसे जानती है कि वह प्रगति कर रही है

```lua
function majReseau(unReseau, marioBase)
    local mario = getPositionMario()

    if not niveauFini and memory.readbyte(0x0100) == 12 then
        -- स्तर खत्म !
        unReseau.fitness = FITNESS_LEVEL_FINI
        niveauFini = true
    elseif marioBase.x < mario.x then
        -- Mario दाएँ आगे बढ़ता है
        unReseau.fitness = unReseau.fitness + (mario.x - marioBase.x)
        marioBase.x = mario.x
    end

    -- input अद्यतन
    local lesInputs = getLesInputs()
    for i = 1, NB_INPUT, 1 do
        unReseau.lesNeurones[i].valeur = lesInputs[i]
    end
end
```

fitness सरल है : यह **दाएँ तय दूरी** है। अगर Mario 10 pixel आगे बढ़ता है, तो fitness 10 बढ़ती है। अगर Mario पीछे हटता है, तो कुछ नहीं होता (कोई दंड नहीं)। अगर स्तर खत्म होता है (पता `0x0100` == 12), तो fitness 1 000 000 हो जाती है।

यह जानबूझकर सरल है। सिर्फ दाएँ प्रगति गिनती है : शत्रु मारना कुछ नहीं लाता, मरना कुछ खर्च नहीं करता।

### बुद्धिमान reset

अगर Mario 33 frame नहीं हिलता, तो हम स्तर reset करते हैं और अगले व्यक्ति पर जाते हैं। लेकिन अगर Mario ने प्रगति की है (उसकी वर्तमान fitness शुरुआती से अलग है), तो हम 300 frame प्रतीक्षा करते हैं, यह network को उसने अच्छा क्या किया यह "समझने" का मौका देता है।

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

`memory.readbyte(0x0071) ~= 9` शर्त जाँचती है कि Mario मृत्यु एनीमेशन में नहीं है। जब Mario पहले ही मृत्यु एनीमेशन में है तो reset बेकार हो जाता है।

### मुख्य लूप

लूप 30 fps (Super Mario World सामान्य गति) चलता है :

```lua
while true do
    local fitnessAvant = laPopulation[idPopulation].fitness

    -- प्रदर्शन (network, जानकारी)
    if forms.ischecked(estAccelere) then
        emu.limitframerate(false)  -- तेज करना
    else
        emu.limitframerate(true)   -- 30 fps
    end

    -- 3 महत्वपूर्ण फंक्शन
    majReseau(laPopulation[idPopulation], marioBase)
    feedForward(laPopulation[idPopulation])
    appliquerLesBoutons(laPopulation[idPopulation])

    emu.frameadvance()
    nbFrame = nbFrame + 1

    -- प्रगति न होने पर Reset
    -- ...
    -- सभी व्यक्ति परखे जाने पर नई पीढ़ी
    -- ...
end
```

तीन महत्वपूर्ण फंक्शन `majReseau`, `feedForward`, और `appliquerLesBoutons` हैं। अगर हम एक भी निष्क्रिय करते हैं, तो Mario नहीं हिलता।

### crossover

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

बच्चा सर्वश्रेष्ठ माता पिता विरासत में पाता है। वही नवाचार साझा करने वाले हर कनेक्शन के लिए, दूसरे माता पिता के पास 50% बदलने की संभावना है, लेकिन **सिर्फ कनेक्शन सक्रिय होने पर**। यह महत्वपूर्ण सुधार है : इसके बिना, बेकार छिपे neuron बनाए जा सकते थे।

### प्रजाति चयन

```lua
function nouvelleGeneration(laPopulation, lesEspeces)
    local laNouvellePopulation = newPopulation()
    local nbIndividuACreer = NB_INDIVIDU_POPULATION

    -- प्रति प्रजाति औसत fitness गणना
    for i = 1, #lesEspeces, 1 do
        lesEspeces[i].fitnessMoyenne = 0
        for j = 1, #lesEspeces[i].lesReseaux, 1 do
            lesEspeces[i].fitnessMoyenne =
                lesEspeces[i].fitnessMoyenne + lesEspeces[i].lesReseaux[j].fitness
        end
        lesEspeces[i].fitnessMoyenne =
            lesEspeces[i].fitnessMoyenne / #lesEspeces[i].lesReseaux
    end

    -- हर प्रजाति अपनी औसत fitness अनुपात में बच्चों की संख्या बनाती है
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

विचार : 10 000 औसत fitness वाली प्रजाति को 1 औसत fitness वाली प्रजाति से कहीं ज्यादा बच्चे बनाने का अधिकार है। यह क्रिया में **प्राकृतिक चयन** है।

`choisirParent` roulette चयन इस्तेमाल करता है : व्यक्ति की fitness जितनी ज्यादा, माता पिता चुने जाने की संभावना उतनी ज्यादा।

### सहेजना और लोड करना

आबादी `.pop` फाइलों में सहेजी जाती हैं :

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

सहेजने में पिछली सभी आबादी का सर्वश्रेष्ठ व्यक्ति भी शामिल है। अगर पुरानी आबादी का सर्वश्रेष्ठ नई आबादी के सर्वश्रेष्ठ से बेहतर है, तो हम पुराने को आधार बनाते हैं। यह **अभिजातवाद** रूप है : हम सर्वश्रेष्ठ कभी नहीं खोते।

### network चित्रण

Laupok ने खेल पर neural network visualizer जोड़ा :

```lua
function dessinerUnReseau(unReseau)
    -- Input : Mario के आसपास 11×9 ग्रिड
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            local xT = ENCRAGE_X_INPUT + (i - 1) * TAILLE_INPUT
            local yT = ENCRAGE_Y_INPUT + (j - 1) * TAILLE_INPUT
            local couleurFond = "gray"
            if unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur < 0 then
                couleurFond = "black"   -- शत्रु
            elseif unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur > 0 then
                couleurFond = "white"   -- ब्लॉक
            end
            gui.drawRectangle(xT, yT, TAILLE_INPUT, TAILLE_INPUT, "black", couleurFond)
        end
    end

    -- Output : 8 बटन
    for i = 1, NB_OUTPUT, 1 do
        local xT = ENCRAGE_X_OUTPUT
        local yT = ENCRAGE_Y_OUTPUT + ESPACE_Y_OUTPUT * (i - 1)
        if sigmoid(unReseau.lesNeurones[i + NB_INPUT].valeur) then
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "white")
        else
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "black")
        end
    end

    -- कनेक्शन
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

यह समझने के लिए बहुत उपयोगी है कि network क्या करता है। सक्रिय कनेक्शन सफेद हैं, निष्क्रिय अर्ध पारदर्शी हैं। input सफेद/काले/धूसर खानों की ग्रिड हैं। output दिखाते हैं कि कौन से बटन दबे हैं।

---

## परिणाम

### AI ने क्या सीखा

निष्पादन के घंटों (और दिनों) के साथ, AI ने खुद खोजा :

1. **दाएँ आगे बढ़ना** : सबसे बुनियादी व्यवहार, लेकिन जिसके लिए दाएँ बटन दबाए रखना पड़ता है
2. **शत्रुओं के ऊपर कूदना** : "शत्रु पकड़ा" input को A या B बटन से जोड़कर
3. **बाधाओं से बचना** : कुछ network बेहतर आगे बढ़ने के लिए अस्थायी पीछे हटना सीखे
4. **स्तर खत्म करना** : सर्वश्रेष्ठ व्यक्ति Super Mario World का पहला स्तर पूरा कर पाया

![Super Mario World स्तर में Boo के सामने AI नियंत्रित Mario, neural network वास्तविक समय क्रियाएँ तय करता है](/images/laupok-mario-ai/mario-ai-playing.jpg)

### सीमाएँ

प्रोजेक्ट की सीमाएँ हैं :

- **एक ही स्तर** : AI विशिष्ट एक स्तर पर प्रशिक्षित है। वह अन्य स्तरों पर अपने आप सामान्यीकरण नहीं करती
- **प्रशिक्षण समय** : संतोषजनक परिणाम पाने के लिए दसियों घंटे चाहिए
- **कोई समझ नहीं** : AI "समझती" नहीं कि वह क्या करती है। वह बेतरतीब उत्परिवर्तन से fitness फंक्शन (तय दूरी) अनुकूलित करती है
- **T-bagging** : Laupok नोट करता है कि Mario शत्रु देखकर जगह पर कूदता है, बस इसलिए कि यह fitness बढ़ाता है (कूदते हुए थोड़ा आगे बढ़ता है)

---

## अनुभव कैसे दोहराएँ

Laupok ने सब साझा किया। चरण यहाँ हैं :

1. [tasvideos.org](https://tasvideos.org/BizHawk) से **BizHawk डाउनलोड** करो (Download खंड)
2. **Super Mario World की USA ROM लो** (अपने कार्ट्रिज की निजी प्रति)
3. [Pastebin](https://pastebin.com/Jcvdqhqm) से **Lua स्क्रिप्ट डाउनलोड** करो, `mario.lua` नाम दो
4. **स्क्रिप्ट ROM वाले फोल्डर में रखो**
5. **BizHawk चलाओ**, ROM खोलो
6. **Lua console में** : `dofile("mario.lua")` या मेनू Script > Open Script से
7. स्तर शुरुआत में **state सहेजो** (मेनू Savestate > Save State) और उसे `debut.state` नाम दो
8. **स्क्रिप्ट फिर से चलाओ**, यह काम करता है

स्क्रिप्ट में विकल्पों वाला फॉर्म शामिल है :
- **तेज करना** : तेज जाने के लिए 30 fps सीमा निष्क्रिय करता है
- **network दिखाना** : overlay में neural network दिखाता है
- **जानकारी दिखाना** : पीढ़ी, fitness, प्रजाति संख्या वाला banner दिखाता है
- **Pause** : निष्पादन रोकता है
- **सहेजना/लोड करना** : वर्तमान आबादी `.pop` फाइल में बनाए रखता है

---

## स्रोत और संदर्भ

| संसाधन | लिंक |
|-----------|------|
| Laupok का मुख्य वीडियो | [j'ai créé une IA qui joue à mario toute seule](https://www.youtube.com/watch?v=F63GNXGHVwM) |
| वीडियो code review + setup | [comment setup l'ia + code source review](https://www.youtube.com/watch?v=u5xCl1bSe6o) |
| पूरा स्रोत कोड | [Pastebin Jcvdqhqm](https://pastebin.com/Jcvdqhqm) |
| NEAT का मूल लेख | Stanley & Miikkulainen, "Evolving Neural Networks through Augmenting Topologies", 2002 |
| N8Programs ट्यूटोरियल | [NEAT implementation walkthrough](https://n8programs.github.io/) (JavaScript, लेकिन अवधारणाएँ समान हैं) |
| 16blings (Laupok प्रेरणा) | [AI plays Super Mario World](https://www.youtube.com/watch?v=qv6IFaOz3bA) |
| BizHawk | [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) |
| Super Mario World स्मृति | [SMW Central - RAM Map](https://www.smwcentral.net/?p=section&a=details&id=21702) |

---

## निष्कर्ष

Laupok ने जो किया, वह है शैक्षणिक एल्गोरिदम (NEAT, 2002) लेना, उसे emulator (BizHawk) के लिए Lua में फिर से लिखना, और उसे Super Mario World पर लागू करना। परिणाम : AI जो शून्य से खेल खेलना सीखती है, बिना किसी पूर्व ज्ञान, सिर्फ बेतरतीब उत्परिवर्तन और प्राकृतिक चयन से।

यह आनुवंशिक एल्गोरिदम शक्ति का शानदार उदाहरण है। नुस्खा तीन सामग्री में सिमटता है : प्राकृतिक चयन, थोड़ा Lua, और बहुत धैर्य। कोई deep learning नहीं, कोई GPU नहीं, कोई विशाल प्रशिक्षण डेटा नहीं।

कोड टिप्पणित, साझा है, और Laupok ने दो व्याख्यात्मक वीडियो बनाए हैं, एक बड़ी अवधारणाओं के लिए, एक कोड के लिए। अगर विषय तुम्हारी रुचि का है, तो गोता लगाओ। यह दिखता से ज्यादा सुलभ है।
