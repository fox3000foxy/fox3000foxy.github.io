---
title: "أنشأ Laupok ذكاء اصطناعيا يلعب Super Mario World وحده، كيف يعمل"
date: 2026-07-11
tags:
  - ai
  - lua
  - emulation
  - reverse-engineering
authors:
  - fox3000foxy
description: "أنشأ Laupok ذكاء اصطناعيا يلعب Super Mario World وحده، شرح آلية عمله."
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "X3MRETpcY1uYAWtbZavZB+4KizArNR0LbgtcKX/gkdAO9+DH7FgTVZ+Bv52pr7pZhB9Sz/JwkDIv/g0WctCh5g=="
---

# أنشأ Laupok ذكاء اصطناعيا يلعب Super Mario World وحده، كيف يعمل

أنشأ Laupok ذكاء اصطناعيا يلعب **Super Mario World** باستقلالية تامة. ينطلق من الصفر : لا سكربت مُعَد مسبقا، ولا إطار مسجل. يتعلم الذكاء وحده، بضربات طفرات عشوائية وانتقاء طبيعي، إنهاء مستويات اللعبة. يعمل المشروع على **BizHawk**، محاكي متعدد المنصات، عبر سكربت Lua من حوالي **4200 سطر**.

ما يجعل هذا المشروع ساحرا أنه يرتكز على مفاهيم بيولوجية مطبقة على المعلوميات : **نظرية داروين في التطور**، و**الشبكات العصبونية الاصطناعية**، وقبل كل شيء خوارزمية بعينها تسمى **NEAT** (NeuroEvolution of Augmenting Topologies). لا يعرف الذكاء شيئا عن اللعبة في البداية. يجرب أفعالا عشوائيا، ويفشل آلاف المرات، وشيئا فشيئا، يفهم كيف يتقدم ويقفز وينجو.

في هذا المقال سنشرّح كل ذلك، مفهوما بمفهوم وسطر كود بسطر كود.

![Laupok introduit l'algorithme NEAT devant la caméra](/images/laupok-mario-ai/neat-title.jpg)

---

## الإعداد : BizHawk وLua وSuper Mario World

### محاكي BizHawk

BizHawk محاكي مفتوح المصدر يدعم طنا من المنصات، NES وSNES وGenesis وPS1 وGame Boy وغيرها الكثير. خصوصيته أنه يسمح بإطلاق **سكربتات Lua** بالتوازي مع اللعبة. لهذه السكربتات وصول إلى **ذاكرة الوصول العشوائي** (RAM) الخاصة بالمحاكاة، مما يعني أنها تستطيع قراءة أي بيانات لعبة في الوقت الحقيقي وتعديلها.

عمليا، يعني ذلك أننا نستطيع :
- قراءة موضع Mario في المستوى
- معرفة أي sprites (أعداء وعناصر) على الشاشة
- معرفة حالة كل tile (كتلة) حول Mario
- التحكم بيد التحكم، الضغط على أي زر

وهذا بالضبط ما نحتاجه لجعل ذكاء اصطناعي يلعب.

### عناوين ذاكرة Super Mario World

في RAM الخاصة بـSuper Mario World، تُخزَّن كل بيانة في عنوان بعينه. إنه كحي : كل عنوان يقابل "بيتا" يحوي معلومة. مثلا :

| العنوان | البيانة |
|---------|--------|
| `0x94`-`0x95` | موضع X لـMario (16 بت، little-endian) |
| `0x96`-`0x97` | موضع Y لـMario |
| `0x14C8`+`i` | حالة sprite رقم `i` (>7 = حي) |
| `0xE4`+`i` | موضع X المنخفض لـsprite رقم `i` |
| `0x14E0`+`i` | موضع X المرتفع لـsprite رقم `i` |
| `0xD8`+`i` | موضع Y المنخفض لـsprite رقم `i` |
| `0x14D4`+`i` | موضع Y المرتفع لـsprite رقم `i` |
| `0x170B`+`i` | نوع extended sprite رقم `i` |
| `0x0100` | حالة اللعبة (12 = مستوى منتهٍ) |
| `0x13D4` | إيقاف مؤقت نشط |
| `0x0071` | حركة موت Mario (9 = ميت) |
| `0x1C800`+... | جدول tiles المستوى |

يستخدم موضع sprites بايتين : بايت "منخفض" وبايت "مرتفع"، لأن الموضع قد يتجاوز 255 بكسل. والصيغة دائما `منخفض + مرتفع × 256`.

بالنسبة للـtiles، الأمر أعقد : العنوان الأساسي `0x1C800`، ونحسب الإزاحة حسب إحداثيي `x` و`y` للـtile في العالم، بخطوة 16 بكسل لكل tile.

![Super Mario World avec overlay de débogage montrant les adresses mémoire des sprites et la position de Mario](/images/laupok-mario-ai/memory-debug.jpg)

---

## الأساسيات : خوارزميات جينية وشبكات عصبونية

قبل الغوص في الكود، يجب فهم مفهومين أساسيين. دونهما، لا معنى للباقي.

### الخوارزميات الجينية

الخوارزمية الجينية محاكاة لـ**نظرية التطور**. الفكرة المركزية : ننشئ **مجموعة** أفراد، لكل واحد خصائص ("جينات") مختلفة قليلا. نجعلهم "يعيشون" في بيئة. من ينجح أفضل ينجو ويتكاثر. ومن ينجح سيئا يختفي.

يوضح Laupok ذلك بمثال **Kirby** :
- تظهر مجموعة Kirby على أرض فيها أشواك وطماطم
- الأشواك تنزع نقاط حياة، والطماطم تعيدها
- لكل Kirby جينات : حجم وسرعة ونقاط حياة وسلوك (هروب وبحث عن طماطم واندفاع أي مكان)

![Double hélice d'ADN avec les étiquettes "le bébé", "taille", "vitesse", "couleur" -- les gènes qui composent un individu](/images/laupok-mario-ai/dna-genes.jpg)

- بعد 15 ثانية، ننظر من نجا أطول
- أفضل Kirby يتكاثر مع الآخرين : يرث الأطفال نصف جينات الأفضل ونصف "الأسوأ"
- يتعرض الأطفال لـ**طفرات** عشوائية (أكبر قليلا وأسرع قليلا...)
- يُستبدَل Kirby القدامى بالجدد
- نعيد الإطلاق

بعد 180 جيلا (~15 ساعة)، ينتقل Kirby من 15 ثانية نجاة إلى **15 دقيقة**. صاروا صغارا (منطقة تصادم مخفضة) وسريعين، ويهربون من الخطر باستمرار.

![Simulation Kirby génération 0 : des cercles colorés dispersés aléatoirement sur un fond noir, tous de taille similaire](/images/laupok-mario-ai/kirby-gen0.jpg)

![Simulation Kirby génération 1866 : les Kirby sont plus petits, plus rapides, et fuient systématiquement les dangers](/images/laupok-mario-ai/kirby-gen1866.jpg)

![Statistiques de la simulation Kirby : fitness, nombre de points de vie, comportement de chaque individu classés par performance](/images/laupok-mario-ai/kirby-stats.jpg)

النقطة الحاسمة : **لا نعرّف الحل**. تجده الخوارزمية **وحدها**. وهذا بالضبط ما يجعلها قوية لمشاكل لا نعرف أي تركيبة معاملات ستكون مثلى.

### الشبكات العصبونية الاصطناعية

الشبكة العصبونية نموذج رياضي مبسط للدماغ البشري. تتكون من :
- **عصبونات مدخل** (inputs) : ما "يراه" الشبكة
- **عصبونات مخرج** (outputs) : ما "تقرره" الشبكة
- **اتصالات** (أوزان) : لكل اتصال **وزن** يضخم الإشارة أو يوهنها

المبدأ بسيط : كل عصبون مدخل يرسل قيمته. تُضرَب بوزن الاتصال، ثم تُجمَع مع الإشارات الأخرى. إذا تجاوزت النتيجة عتبة معينة (**دالة التفعيل**)، ينشط عصبون المخرج.

في مثال Laupok مع Mario وطرف الفأرة :
- عصبون المدخل = المسافة بين Mario والطرف
- وزن الاتصال = حساسية Mario
- عصبون المخرج = هل يصرخ Mario أم لا

كلما كان الطرف أقرب، ارتفعت قيمة المدخل. وإذا كان الوزن قويا، كانت الإشارة المرسلة للمخرج قوية، وصرخ Mario. بتعديل الوزن، نعدل حساسية Mario.

![Démo "Mario a peur" : Mario face à un Boo avec une barre de synapse affichant le poids de la connexion entre l'entrée et la sortie](/images/laupok-mario-ai/mario-fear-demo.jpg)

في الشبكة العصبونية الحقيقية للذكاء، نفس المنطق، لكن بمقياس ضخم :
- **99 عصبون مدخل** (11×9 tiles من رؤية Mario)
- **8 عصبونات مخرج** (A وB وX وY وأعلى وأسفل ويسار ويمين)
- **عصبونات مخفية** (hidden) بين الاثنين
- مئات الاتصالات بأوزان متنوعة

---

## NEAT : الخوارزمية التي تغيّر كل شيء

### مشكلة الخوارزميات الجينية التقليدية

إذا دمجنا خوارزمية جينية مع شبكة عصبونية بسذاجة، نواجه مشكلة : ننشئ 100 شبكة عصبونية مختلفة تماما، ولا نعرف مقارنتها. لكل واحدة عصبوناتها واتصالاتها وأوزانها. كيف نعرف إن كانت شبكتان "قريبتين" أو "بعيدتين" ؟

هنا يتدخل **NEAT**، NeuroEvolution of Augmenting Topologies. اخترعه **Kenneth Stanley** و**Risto Miikkulainen** في 2002، وهو خوارزمية تحل هذه المشكلة بالضبط.

### الأنواع

أول آلية أساسية في NEAT هي **الأنواع**. عندما تصبح شبكة عصبونية مختلفة أكثر من اللازم عن أخرى، تُصنَّف في نوع مختلف. يُحسَب التشابه عبر ثلاثة معاملات :

1. **Excess** (`EXCES_COEF = 0.50`) : عدد الاتصالات التي لا علاقة لها بين شبكتين (ابتكارات مختلفة)
2. **Disjoint** : نفس الشيء، لكن للاتصالات الواقعة في الوسط
3. **فرق الوزن** (`POIDSDIFF_COEF = 0.92`) : فرق الأوزان المتوسط بين الاتصالات المتشاركة نفس الابتكار

صيغة النتيجة :

```
score = (EXCES_COEF × disjoint) / max(nbConnexions1 + nbConnexions2, 1)
      + POIDSDIFF_COEF × diffPoids
```

إذا كانت هذه النتيجة أدنى من `DIFF_LIMITE` (1.0)، فالشبكتان في نفس النوع. وإلا، ننشئ نوعا جديدا.

### الابتكارات

إنه عبقرية NEAT. كلما أُنشئ اتصال، يتلقى رقما **ابتكار** فريدا وشاملا. يتبع هذا الرقم الشبكة العصبونية حتى عندما تتكاثر.

عمليا، عندما يُنشأ طفل بالتزاوج، يرث ابتكارات والديه. وإذا تشاركت شبكتان نفس الابتكار، فهذا يعني أن لديهما اتصالا من نفس السلف. وهذا ما يسمح بمقارنة شبكات بأحجام مختلفة.

### التزاوج

عندما تتكاثر شبكتان عصبونيتان، يعمل **التزاوج** هكذا :

![Laupok explique le concept de crossover avec le texte "CROSSOVER" en overlay](/images/laupok-mario-ai/crossover-label.jpg)

1. تصبح الشبكة الأعلى أداء "الوالد المهيمن"
2. يرث الطفل كل اتصالات المهيمن
3. لكل اتصال متشارك نفس الابتكار، يمكن للوالد الآخر استبداله (50% احتمال)
4. وحده الاتصالات النشطة للوالد غير المهيمن يمكنها الاستبدال

وهذا يضمن أن الطفل جيد على الأقل كأفضل والد.

### الطفرات

بعد التزاوج، يتعرض الطفل لطفرات باحتمالات قابلة للضبط :

![Laupok explique les mutations avec le texte "(petite modif = mutation)" en overlay](/images/laupok-mario-ai/mutation-label.jpg)

| الطفرة | الاحتمال | الأثر |
|----------|------------|-------|
| إعادة ضبط وزن اتصال | 25% | يُعشَّن الوزن تماما |
| طفرة وزن | 95% | يتغير الوزن بـ±0.80 |
| إضافة اتصال | 85% | اتصال جديد بين عصبونين غير مرتبطين بعد |
| إضافة عصبون | 39% | يُدرَج عصبون مخفي بين عصبونين متصلين |

معدل إضافة العصبون مهم : إنه ما يسمح للشبكة بـ**النمو**. في البداية، لا توجد إلا مداخل ومخارج. وتدريجيا، تظهر عصبونات مخفية، فتصبح الشبكة أعقد فأعقد.

---

## الكود : شرح كامل

### الثوابت

يبدأ السكربت بكتلة ثوابت تعرّف كل الضبط :

```lua
-- رؤية Mario حوله
TAILLE_TILE = 16
TAILLE_VUE_W = TAILLE_TILE * 11  -- 176 بكسل عرضا
TAILLE_VUE_H = TAILLE_TILE * 9   -- 144 بكسل ارتفاعا
NB_TILE_W = TAILLE_VUE_W / TAILLE_TILE  -- 11 tiles
NB_TILE_H = TAILLE_VUE_H / TAILLE_TILE  -- 9 tiles

-- الشبكة العصبونية
NB_INPUT = NB_TILE_W * NB_TILE_H  -- 99 مدخلا (tiles مرئية)
NB_OUTPUT = 8  -- A وB وX وY وأعلى وأسفل ويسار ويمين
NB_INDIVIDU_POPULATION = 100  -- أفراد لكل مجموعة
NB_NEURONE_MAX = 100000  -- حد العصبونات المخفية

-- اللياقة
FITNESS_LEVEL_FINI = 1000000  -- قيمة عندما ينتهي المستوى
NB_FRAME_RESET_BASE = 33  -- إطارات دون تقدم قبل إعادة الضبط
NB_FRAME_RESET_PROGRES = 300  -- إطارات إذا كُشف تقدم

-- الأنواع
EXCES_COEF = 0.50
POIDSDIFF_COEF = 0.92
DIFF_LIMITE = 1.00

-- الطفرات
CHANCE_MUTATION_RESET_CONNEXION = 0.25
POIDS_CONNEXION_MUTATION_AJOUT = 0.80
CHANCE_MUTATION_POIDS = 0.95
CHANCE_MUTATION_CONNEXION = 0.85
CHANCE_MUTATION_NEURONE = 0.39
```

قيمة `NB_INPUT` هي 99 لأن رؤية Mario تبلغ 11×9 tiles. كل tile عصبون مدخل. إذا كانت tile فارغة، قيمتها 0. وإذا كانت كتلة، قيمتها 1. وإذا كانت عدوا، قيمتها -1.

تطابق المخارج الثمانية أزرار يد SNES : A وB وX وY وأعلى وأسفل ويسار ويمين. نستبعد Start وSelect وL وR لحصر قراراته في الأساس.

### هياكل البيانات

يعرّف السكربت ثلاث بنى رئيسية :

```lua
function newNeurone()
    local neurone = {}
    neurone.valeur = 0    -- القيمة الحالية للعصبون
    neurone.id = 0        -- معرف فريد
    neurone.type = ""     -- "input" أو "output" أو "hidden"
    return neurone
end

function newConnexion()
    local connexion = {}
    connexion.entree = 0     -- معرف العصبون المصدر
    connexion.sortie = 0     -- معرف العصبون الوجهة
    connexion.actif = true   -- يمكن تعطيله إذا أُدرج عصبون مخفي
    connexion.poids = 0      -- وزن الاتصال
    connexion.innovation = 0 -- رقم ابتكار فريد
    connexion.allume = false -- للعرض : true إذا مرت الإشارة
    return connexion
end

function newReseau()
    local reseau = {
        nbNeurone = 0,        -- عدد العصبونات المخفية
        fitness = 1,          -- الأداء (المسافة المقطوعة)
        idEspeceParent = 0,   -- لأي نوع ينتمي
        lesNeurones = {},     -- جدول عصبونات
        lesConnexions = {}    -- جدول اتصالات
    }
    -- التهيئة مع المداخل
    for j = 1, NB_INPUT, 1 do
        ajouterNeurone(reseau, j, "input", 1)
    end
    -- ثم المخارج
    for j = NB_INPUT + 1, NB_INPUT + NB_OUTPUT, 1 do
        ajouterNeurone(reseau, j, "output", 0)
    end
    return reseau
end
```

في البداية، تحوي كل شبكة مداخل ومخارج فقط : لا عصبون مخفي، ولا اتصال. الخوارزمية هي التي ستقرر إن لزم الأمر.

### الطفرات بالتفصيل

#### طفرة الأوزان

```lua
function mutationPoidsConnexions(unReseau)
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            if math.random() < CHANCE_MUTATION_RESET_CONNEXION then
                -- 25% : إعادة ضبط كاملة للوزن
                unReseau.lesConnexions[i].poids = genererPoids()
            else
                -- 75% : تغير بـ±0.80
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

الوزن الأولي دائما 1 أو -1 (`genererPoids()`). يمكن لتغير ±0.80 أن يؤرجحه بين قيم سالبة وموجبة، مما يغيّر جذريا سلوك الشبكة.

#### إضافة اتصال

```lua
function mutationAjouterConnexion(unReseau)
    local liste = {}
    -- عشوائية قائمة العصبونات
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
                -- اتصال صالح : مدخل←مخرج ومخفي←مخفي ومخفي←مخرج
                if (n1.type == "input" and n2.type == "output") or
                   (n1.type == "hidden" and n2.type == "hidden") or
                   (n1.type == "hidden" and n2.type == "output") then
                    -- تحقق من عدم وجود اتصال فعلا
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

لا يمكن ربط مخرج بمدخل (سيخلق دورة)، ولا يمكن ربط عصبونين مرتبطين فعلا. تضمن العشوائية استكشاف احتمالات مختلفة في كل مرة.

#### إضافة عصبون

إنها الطفرة الأكثر إثارة :

```lua
function mutationAjouterNeurone(unReseau)
    if #unReseau.lesConnexions == 0 then return nil end
    if unReseau.nbNeurone == NB_NEURONE_MAX then return nil end

    -- عشوائية الاتصالات
    local listeRandom = {}
    for i = 1, #unReseau.lesConnexions, 1 do
        local pos = math.random(1, #listeRandom+1)
        table.insert(listeRandom, pos, i)
    end

    for i = 1, #listeRandom, 1 do
        if unReseau.lesConnexions[listeRandom[i]].actif then
            -- تعطيل الاتصال الموجود
            unReseau.lesConnexions[listeRandom[i]].actif = false
            unReseau.nbNeurone = unReseau.nbNeurone + 1
            local indice = unReseau.nbNeurone + NB_INPUT + NB_OUTPUT

            -- إنشاء العصبون المخفي
            ajouterNeurone(unReseau, indice, "hidden", 1)

            -- ربط المدخل بالعصبون المخفي
            ajouterConnexion(unReseau,
                unReseau.lesConnexions[listeRandom[i]].entree,
                indice, genererPoids())

            -- ربط العصبون المخفي بالمخرج
            ajouterConnexion(unReseau,
                indice,
                unReseau.lesConnexions[listeRandom[i]].sortie,
                genererPoids())
            break
        end
    end
end
```

الآلية : نأخذ اتصالا موجودا، **نعطّله**، وندرج عصبونا مخفيا في الوسط. يُستبدَل الاتصال الأصلي باتصالين جديدين : مدخل←مخفي ومخفي←مخرج. كأننا "نقطع" سلكا لإقحام مفتاح.

وهذا ما يجعل NEAT "متزايدة الطوبولوجيات" : **تكبر** الشبكة مع الوقت. تبدأ بسيطة وتصبح أعقد فقط إذا لزم الأمر.

### feedForward

إنها الدالة التي تنشر الإشارات عبر الشبكة :

```lua
function feedForward(unReseau)
    -- إعادة ضبط عصبونات المخرج
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur = 0
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].allume = false
        end
    end

    -- الانتشار
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

يرسل كل اتصال نشط `قيمة_المدخل × الوزن` نحو عصبون المخرج. تُجمَع القيمة (تُجمَع). علم `allume` فقط للعرض البصري للشبكة.

### قراءة ذاكرة اللعبة

دالة `getLesInputs()` هي التي تترجم عالم Super Mario World إلى بيانات مفهومة للشبكة :

```lua
function getLesInputs()
    local lesInputs = {}
    -- تهيئة إلى 0 (رمادي = لا شيء)
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            lesInputs[getIndiceLesInputs(i, j)] = 0
        end
    end

    -- sprites (أعداء) = -1 (أسود)
    local lesSprites = getLesSprites()
    for i = 1, #lesSprites, 1 do
        local input = convertirPositionPourInput(getLesSprites()[i])
        if input.x > 0 and input.x < (TAILLE_VUE_W / TAILLE_TILE) + 1 then
            lesInputs[getIndiceLesInputs(input.x, input.y)] = -1
        end
    end

    -- tiles (كتل) = قيمة tile (أبيض إذا > 0)
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

شبكة المداخل رؤية متمركزة على Mario : 11 tile عرضا و9 ارتفاعا. كل tile تساوي :
- **0** (رمادي) : لا شيء
- **1** (أبيض) : كتلة صلبة
- **-1** (أسود) : عدو

تُقرَأ الأعداء من قائمتين في RAM : sprites العادية (`0x14C8`-`0x14F8`) وextended sprites (`0x170B`-`0x173B`). لكل sprite حي (حالة > 7)، نحسب موضعه بـtiles بالنسبة لـMario ونضع -1 في الخانة الموافقة.

### اللياقة : كيف يعرف الذكاء إن تقدم

```lua
function majReseau(unReseau, marioBase)
    local mario = getPositionMario()

    if not niveauFini and memory.readbyte(0x0100) == 12 then
        -- انتهى المستوى !
        unReseau.fitness = FITNESS_LEVEL_FINI
        niveauFini = true
    elseif marioBase.x < mario.x then
        -- يتقدم Mario نحو اليمين
        unReseau.fitness = unReseau.fitness + (mario.x - marioBase.x)
        marioBase.x = mario.x
    end

    -- تحديث المداخل
    local lesInputs = getLesInputs()
    for i = 1, NB_INPUT, 1 do
        unReseau.lesNeurones[i].valeur = lesInputs[i]
    end
end
```

اللياقة بسيطة : إنها **المسافة المقطوعة نحو اليمين**. إذا تقدم Mario 10 بكسل، تزيد اللياقة 10. وإذا تراجع Mario، لا يحدث شيء (لا عقوبة). وإذا انتهى المستوى (العنوان `0x0100` == 12)، تصبح اللياقة 1 000 000.

إنها بسيطة عمدا. وحده التقدم نحو اليمين يُحتسَب : قتل الأعداء لا يعطي شيئا، والموت لا يkost شيئا.

### إعادة الضبط الذكية

إذا لم يتحرك Mario 33 إطارا، نعيد ضبط المستوى وننتقل للفرد التالي. لكن إذا أحرز Mario تقدما (لياقته الحالية مختلفة عن لياقة البداية)، ننتظر 300 إطار، فهذا يعطي الشبكة فرصة "لفهم" ما فعلته جيدا.

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

يتحقق الشرط `memory.readbyte(0x0071) ~= 9` من أن Mario ليس في حركة موت. تصبح إعادة الضبط عديمة الفائدة عندما يكون Mario فعلا في حركة موت.

### الحلقة الرئيسية

تدور الحلقة بسرعة 30 fps (السرعة العادية لـSuper Mario World) :

```lua
while true do
    local fitnessAvant = laPopulation[idPopulation].fitness

    -- العرض (شبكة ومعلومات)
    if forms.ischecked(estAccelere) then
        emu.limitframerate(false)  -- تسريع
    else
        emu.limitframerate(true)   -- 30 fps
    end

    -- الدوال الثلاث الحيوية
    majReseau(laPopulation[idPopulation], marioBase)
    feedForward(laPopulation[idPopulation])
    appliquerLesBoutons(laPopulation[idPopulation])

    emu.frameadvance()
    nbFrame = nbFrame + 1

    -- إعادة ضبط إذا لا تقدم
    -- ...
    -- جيل جديد إذا اختُبر كل الأفراد
    -- ...
end
```

الدوال الثلاث الحيوية هي `majReseau` و`feedForward` و`appliquerLesBoutons`. وإذا عطّلنا واحدة فقط، لا يتحرك Mario بعد.

### التزاوج

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

يرث الطفل الوالد الأفضل. ولكل اتصال متشارك نفس الابتكار، للوالد الآخر 50% احتمال الاستبدال، لكن **فقط إذا كان الاتصال نشطا**. إنه تصحيح مهم : دونه، كان يمكن إنشاء عصبونات مخفية عديمة الفائدة.

### الانتقاء بالأنواع

```lua
function nouvelleGeneration(laPopulation, lesEspeces)
    local laNouvellePopulation = newPopulation()
    local nbIndividuACreer = NB_INDIVIDU_POPULATION

    -- حساب اللياقة المتوسطة لكل نوع
    for i = 1, #lesEspeces, 1 do
        lesEspeces[i].fitnessMoyenne = 0
        for j = 1, #lesEspeces[i].lesReseaux, 1 do
            lesEspeces[i].fitnessMoyenne =
                lesEspeces[i].fitnessMoyenne + lesEspeces[i].lesReseaux[j].fitness
        end
        lesEspeces[i].fitnessMoyenne =
            lesEspeces[i].fitnessMoyenne / #lesEspeces[i].lesReseaux
    end

    -- ينشئ كل نوع عدد أطفال متناسبا مع لياقته المتوسطة
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

الفكرة : نوع بلياقة متوسطة 10 000 له الحق في إنشاء أطفال أكثر بكثير من نوع بلياقة متوسطة 1. إنه **الانتقاء الطبيعي** أثناء العمل.

يستخدم `choisirParent` انتقاء بالروليت : كلما ارتفعت لياقة فرد، زاد احتمال اختياره والدا.

### الحفظ والتحميل

تُحفَظ المجموعات في ملفات `.pop` :

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

يتضمن الحفظ أيضا أفضل فرد من كل المجموعات السابقة. إذا كان أفضل المجموعة القديمة أفضل من أفضل الجديدة، نستعيد القديم كأساس. إنه شكل **نخبوية** : لا نفقد الأفضل أبدا.

### رسم الشبكة

أضاف Laupok عارض شبكة عصبونية فوق اللعبة :

```lua
function dessinerUnReseau(unReseau)
    -- المداخل : شبكة 11×9 حول Mario
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            local xT = ENCRAGE_X_INPUT + (i - 1) * TAILLE_INPUT
            local yT = ENCRAGE_Y_INPUT + (j - 1) * TAILLE_INPUT
            local couleurFond = "gray"
            if unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur < 0 then
                couleurFond = "black"   -- عدو
            elseif unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur > 0 then
                couleurFond = "white"   -- كتلة
            end
            gui.drawRectangle(xT, yT, TAILLE_INPUT, TAILLE_INPUT, "black", couleurFond)
        end
    end

    -- المخارج : 8 أزرار
    for i = 1, NB_OUTPUT, 1 do
        local xT = ENCRAGE_X_OUTPUT
        local yT = ENCRAGE_Y_OUTPUT + ESPACE_Y_OUTPUT * (i - 1)
        if sigmoid(unReseau.lesNeurones[i + NB_INPUT].valeur) then
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "white")
        else
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "black")
        end
    end

    -- الاتصالات
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

إنه مفيد جدا لفهم ما تفعله الشبكة. الاتصالات النشطة بيضاء، وغير النشطة شبه شفافة. المداخل شبكة خانات بيضاء/سوداء/رمادية. والمخارج تظهر أي أزرار مضغوطة.

---

## النتائج

### ما تعلمه الذكاء

على مدى ساعات (وأيام) التشغيل، اكتشف الذكاء وحده :

1. **التقدم نحو اليمين** : السلوك الأساسي، لكنه يتطلب إبقاء زر اليمين مضغوطا
2. **القفز فوق الأعداء** : بربط مدخل "كُشف عدو" بالزر A أو B
3. **تجنب العوائق** : تعلمت بعض الشبكات التراجع مؤقتا للتقدم أفضل
4. **إنهاء مستويات** : استطاع أفضل فرد إنهاء أول مستوى في Super Mario World

![Mario contrôlé par l'IA face à un Boo dans un niveau de Super Mario World -- le réseau de neurones décide des actions en temps réel](/images/laupok-mario-ai/mario-ai-playing.jpg)

### الحدود

للمشروع حدوده :

- **مستوى واحد** : يُدرَّب الذكاء على مستوى بعينه. لا يعمم تلقائيا لمستويات أخرى
- **زمن تدريب** : يلزم عشرات الساعات لبلوغ نتائج مُرضية
- **لا فهم** : لا "يفهم" الذكاء ما يفعله. إنه يحسّن دالة لياقة (مسافة مقطوعة) عبر طفرات عشوائية
- **T-bagging** : يلاحظ Laupok أن Mario يميل للقفز في مكانه عندما يرى عدوا، لمجرد أن ذلك يزيد اللياقة (يتقدم قليلا بالقفز)

---

## كيف تعيد التجربة

شارك Laupok كل شيء. إليكم الخطوات :

1. **تنزيل BizHawk** على [tasvideos.org](https://tasvideos.org/BizHawk) (قسم Download)
2. **الحصول على ROM أمريكية لـSuper Mario World** (نسخة خاصة من خرطوشتك الخاصة)
3. **تنزيل سكربت Lua** من [Pastebin](https://pastebin.com/Jcvdqhqm)، وإعادة تسميته `mario.lua`
4. **وضع السكربت في نفس مجلد ROM**
5. **تشغيل BizHawk**، وفتح ROM
6. **في طرفية Lua** : `dofile("mario.lua")` أو عبر قائمة Script > Open Script
7. **حفظ state** في بداية المستوى (قائمة Savestate > Save State) وتسميتها `debut.state`
8. **إعادة تشغيل السكربت**، يعمل

يتضمن السكربت نموذجا مع خيارات :
- **تسريع** : يعطل حد 30 fps للذهاب أسرع
- **عرض شبكة** : يعرض الشبكة العصبونية فوق اللعبة
- **عرض معلومات** : يعرض شريطا مع الجيل واللياقة وعدد الأنواع
- **إيقاف مؤقت** : يوقف التنفيذ
- **حفظ/تحميل** : يثبت المجموعة الحالية في ملف `.pop`

---

## المصادر والمراجع

| المورد | الرابط |
|-----------|------|
| فيديو Laupok الرئيسي | [أنتجت ذكاء اصطناعيا يلعب ماريو وحده](https://www.youtube.com/watch?v=F63GNXGHVwM) |
| فيديو مراجعة الكود + الإعداد | [كيف تجهز الذكاء + مراجعة الكود المصدري](https://www.youtube.com/watch?v=u5xCl1bSe6o) |
| الكود المصدري الكامل | [Pastebin Jcvdqhqm](https://pastebin.com/Jcvdqhqm) |
| مقال NEAT الأصلي | Stanley وMiikkulainen، "Evolving Neural Networks through Augmenting Topologies"، 2002 |
| شرح N8Programs | [NEAT implementation walkthrough](https://n8programs.github.io/) (JavaScript، لكن المفاهيم متطابقة) |
| 16blings (إلهام Laupok) | [AI plays Super Mario World](https://www.youtube.com/watch?v=qv6IFaOz3bA) |
| BizHawk | [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) |
| ذاكرة Super Mario World | [SMW Central - RAM Map](https://www.smwcentral.net/?p=section&a=details&id=21702) |

---

## الخلاصة

ما فعله Laupok هو أخذ خوارزمية أكاديمية (NEAT، 2002)، وإعادة كتابتها في Lua لمحاكي (BizHawk)، وتطبيقها على Super Mario World. النتيجة : ذكاء اصطناعي يتعلم من الصفر لعب اللعبة، دون أي معرفة مسبقة، فقط بطفرات عشوائية وانتقاء طبيعي.

إنه مثال رائع لقوة الخوارزميات الجينية. الوصفة في ثلاثة مكونات : الانتقاء الطبيعي وقليل من Lua والكثير من الصبر. لا تعلم عميق، ولا GPU، ولا بيانات تدريب ضخمة.

الكود مُعلَّق ومُشارَك، وصنع Laupok فيديوهين تفسيريين، واحد للمفاهيم الكبرى وواحد للكود. إذا كان الموضوع يهمك، اغُص فيه. إنه أسهل مما يبدو.
