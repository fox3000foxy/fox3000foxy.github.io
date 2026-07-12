---
itle: "Laupok بنى ذكاءً اصطناعياً يلعب سوبر ماريو وورلد بمفرده -- كيف يعمل"
description: "استعمق في مشروع لاوبوك: ذكاء اصطناعي مبني على خوارزمية NEAT يتعلم لعب سوبر ماريو وورلد بشكل مستقل. الخوارزميات الجينية، والشبكات العصبية، والتطور العصبي لل;topologies المتميزة، و4200 سطر من لوكا."
date: 2026-07-11authors:
  - fox3000foxy
tags:
  - ai
  - lua
  - emulation
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "cFzWwxf8/MukNR5IL8S1RuShO0EOOcMhCPMXDTYOTnd1s2uSMKEyRsQjiZ9VC0Ehwe/faG5rsUO0EyeyzK1Xaw=="
---

# Laupok بنى ذكاءً اصطناعياً يلعب سوبر ماريو وورلد بمفرده -- كيف يعمل

أنشأ لاوبوك ذكاءً اصطناعياً يلعب **سوبر ماريو وورلد** بشكل كامل ومستقل. لا مدخلات مبرمجة مسبقاً، ولا إطارات مسجلة. الذكاء الاصطناعي يتعلم بمفرده، من خلال الطفرات العشوائية والانتقاء الطبيعي، لإتمام مراحل اللعبة. يعمل المشروع على **BizHawk**، محاكي متعدد المنصات، عبر سكربت لوكا يتكون من حوالي **4200 سطر**.

ما يجعل هذا المشروع مثيراً للإعجاب هو أنه يعتمد على مفاهيم بيولوجية مطبقة على الحوسبة: **نظرية التطور** لداروين، **الشبكات العصبية الاصطناعية**، والأهم من ذلك كله خوارزمية محددة تسمى **NEAT** (التطور العصبي;topologies المتميزة). الذكاء الاصطناعي لا يعرف شيئاً عن اللعبة في البداية. يحاول أشياء عشوائية، يفشل آلاف المرات، وتدريجياً يفهم كيفية التحرك والقفز والبقاء.

في هذه المقالة، سنقوم بتحليل كل شيء -- مفهوماً بعد مفهوم، وسطراً بعد سطر من الكود.

![لاوبوك يشرح خوارزمية NEAT أمام الكاميرا](/images/laupok-mario-ai/neat-title.jpg)

---

## الإعداد: BizHawk ولوكا وسوبر ماريو وورلد

### محاكي BizHawk

BizHawk هو محاكي مفتوح المصدر يدعم العديد من الأجهزة -- NES وSNES وGenesis وPS1 وGame Boy والعديد غيرها. ميزته الرئيسية هي أنه يمكنه تشغيل **سكربتات لوكا** جنباً إلى جنب مع اللعبة. يمكن لهذه السكربتات الوصول إلى **RAM** المحاكي (الذاكرة العشوائية)، مما يعني أنها يمكنها قراءة -- وتعديل -- أي بيانات اللعبة في الوقت الفعلي.

عملياً، هذا يعني أنه يمكنك:
- قراءة موقع ماريو في المستوى
- معرفة أي سبرايت (عداء، عناصر) موجودة على الشاشة
- معرفة حالة كل بلاطة (كتلة) حول ماريو
- التحكم بالجهاز -- الضغط على أي زر

هذا بالضبط ما تحتاجه لجعل الذكاء الاصطناعي يلعب.

### عناوين الذاكرة في سوبر ماريو وورلد

في ذاكرة سوبر ماريو وورلد، يتم تخزين كل قطعة بيانات عند عنوان محدد. إنه مثل الحي: كل عنوان يقابل "بيتاً" تحتوي على قطعة معلومات واحدة. على سبيل المثال:

| العنوان | البيانات |
|---------|------|
| `0x94`-`0x95` | موقع ماريو أفقياً (16 بت، little-endian) |
| `0x96`-`0x97` | موقع ماريو عمودياً |
| `0x14C8`+`i` | حالة السبرايت `i` (>7 = حي) |
| `0xE4`+`i` | الجزء المنخفض من الموقع الأفقي للسبرايت `i` |
| `0x14E0`+`i` | الجزء العالي من الموقع الأفقي للسبرايت `i` |
| `0xD8`+`i` | الجزء المنخفض من الموقع العمودي للسبرايت `i` |
| `0x14D4`+`i` | الجزء العالي من الموقع العمودي للسبرايت `i` |
| `0x170B`+`i` | نوع السبرايت الممتد `i` |
| `0x0100` | حالة اللعبة (12 = تم إنهاء المستوى) |
| `0x13D4` | الإيقاف مؤقت نشط |
| `0x0071` | رسوم ماريو للموت (9 = ميت) |
| `0x1C800`+... | جدول بلاطات المستوى |

تستخدم مواقع السبرايت بايتيْن: بايت "منخفض" وبايت "عالي"، لأن الموقع قد يتجاوز 255 بكسل. الصيغة دائماً `منخفض + عالي × 256`.

بالنسبة للبلاطات الأمر أكثر تعقيداً: العنوان الأساسي هو `0x1C800`، وتحسب الإزاحة بناءً على إحداثيات `x` و`y` للبلاطة في العالم، بخطوة 16 بكسل لكل بلاطة.

![سوبر ماريو وورلد مع طبقة تصحيح تظهر عناوين ذاكرة السبرايت وموقع ماريو](/images/laupok-mario-ai/memory-debug.jpg)

---

## الأساسيات: الخوارزميات الجينية والشبكات العصبية

قبل التعمق في الكود، عليك أن تفهم مفهومين أساسيين. بدونهما، لا معنى لأي شيء آخر.

### الخوارزميات الجينية

الخوارزمية الجينية هي محاكاة **نظرية التطور**. الفكرة الأساسية: أنت تنشئ **سكاناً** من الأفراد، لكل منهم خصوصيات مختلفة قليلاً ("جينات"). ت让他们在 بيئة "يعيشون". الأفضل أداءً يبقون ويت繁殖ون. الأسوأ أداءً يتلاشون.

يوضح لاوبوك هذا بتشبيه **كربي**:
- تظهر مجموعة من كربي على أرضية مع أسنان حادة وطماطم
- الأسنان الحادة تقل نقاط الحياة، الطماطم تستعيدها
- كل كربي لديه جينات: الحجم، السرعة، نقاط الحياة، السلوك (الهروب، البحث عن الطماطم، الركض بشكل عشوائي)

![حلزون مزدوج للDNA مع تسميات "الطفل"، "الحجم"، "السرعة"، "اللون" -- الجينات التي تشكل فرد](/images/laupok-mario-ai/dna-genes.jpg)

- بعد 15 ثانية، تتحقق من من بقي على قيد الحياة لفترة أطول
- أفضل كربي يتزاوج مع الآخرين: الأطفال يرثون نصف جينات الأفضل ونصف جينات "الأسوأ"
- الأطفال يخضعون لطفرات عشوائية (أكبر قليلاً، أسرع قليلاً...)
- كربي القديمة يتم استبدالها بالجديدة
- تبدأ من جديد

بعد 180 جيلاً (~15 ساعة)، يتحول كربي من 15 ثانية من البقاء إلى **15 دقيقة**. أصبحوا أصغر (مساحة لمس أقل)، وأسرع، ويهربون باستمرار من الخطر.

![محاكاة كربي الجيل 0: دوائر ملونة مبعثرة عشوائياً على خلفية سوداء، جميعها متشابهة في الحجم](/images/laupok-mario-ai/kirby-gen0.jpg)

![محاكاة كربي الجيل 1866: كربي أصغر وأسرع، ويهرب بشكل منهجي من الخطر](/images/laupok-mario-ai/kirby-gen1866.jpg)

![إحصائيات محاكاة كربي: اللياقة، نقاط الحياة، سلوك كل فرد مصنف حسب الأداء](/images/laupok-mario-ai/kirby-stats.jpg)

النقطة الجوهرية: **أنت لا تحدد الحل**. الخوارزمية **تجده بمفردها**. وهذا بالضبط ما يجعلها قوية للمشاكل التي لا تعرف فيها ما سيكون عليه الم组合 المثالي للإعدادات.

### الشبكات العصبية الاصطناعية

الشبكة العصبية هي نموذج رياضي مبسط للدماغ البشري. تتكون من:
- **نيورونات الإدخال**: ما "تره" الشبكة
- **نيورونات الإخراج**: ما "تقرره" الشبكة
- **الاتصالات (الأوزان)**: كل اتصال له **وزن** يقوّي أو يضعف الإشارة

المبدأ بسيط: كل نيورون إدخال يرسل قيمته. يتم ضربها في وزن الاتصال، ثم تُضاف إلى إشارات أخرى. إذا تجاوز النتيجة عتبة معينة (**دالة التنشيط**)، يطلق النيورون إشارة.

في تشبيه لاوبوك مع ماريو ومؤشر الماوس:
- نيورون الإدخال = المسافة بين ماريو ومؤشر الماوس
- وزن الاتصال = حساسية ماريو
- نيورون الإخراج = ماريو يصرخ أم لا

كلما كان المؤشر أقرب، كانت قيمة الإدخال أعلى. إذا كان الوزن قوياً، كانت الإشارة قوية، وصارخ ماريو. بتغيير الوزن، تغير حساسية ماريو.

![عرض "ماريو خائف": ماريو يواجه بو مع شريط مشبكي يظهر وزن الاتصال بين الإدخال والإخراج](/images/laupok-mario-ai/mario-fear-demo.jpg)

في الشبكة العصبية الفعلية للذكاء الاصطناعي، المنطق نفسه، لكن على نطاق ضخم:
- **99 نيورون إدخال** (11×9 بلاطة من رؤية ماريو)
- **8 نيورونات إخراج** (A، B، X، Y، فوق، أسفل، يسار، يمين)
- **نيورونات مخفية** بينها
- مئات الاتصالات بأوزان مختلفة

---

## NEAT: الخوارزمية التي تغير كل شيء

### مشكلة الخوارزميات الجينية الأساسية

إذا دمجت بسهولة خوارزمية جينية مع شبكة عصبية، فعندك مشكلة: أنت تنشئ 100 شبكة عصبية مختلفة تماماً، ولا يمكنك مقارنتها. كل شبكة لها نيوروناتها وإتصالاتها وأوزانها. كيف تعرف إذا كانت شبكتان "متشابهتان" أو "مختلفتان"؟

هنا يأتي دور **NEAT** -- التطور العصبي;topologies المتميزة. اخترعها **كينيث ستانلي** و**ريستو ميكولاينين** عام 2002، وتحل هذه المشكلة بالضبط.

### الأنواع

أول آلية رئيسية في NEAT هي **الأنواع**. عندما تصبح شبكة عصبية مختلفة جداً عن أخرى، يتم تصنيفها في نوع مختلف. يتم حساب التشابه عبر ثلاثة معايير:

1. **الزيادة** (`EXCES_COEF = 0.50`): عدد الاتصالات التي ليس لها أي شيء مشترك بين شبكتين (ابتكارات مختلفة)
2. **المتبقي**: نفس الشيء، ولكن لوسط الاتصالات
3. **فرق الأوزان** (`POIDSDIFF_COEF = 0.92`): متوسط فرق الأوزان بين الاتصالات التي تشارك نفس الابتكار

صيغة النقاط:

```
score = (EXCES_COEF × disjoint) / max(nbConnexions1 + nbConnexions2, 1)
      + POIDSDIFF_COEF × diffPoids
```

إذا كانت هذه النتيجة أقل من `DIFF_LIMITE` (1.0)، فإن الشبكتين في نفس النوع. وإلا، يتم إنشاء نوع جديد.

### الابتكارات

هذا هو عبقري NEAT. في كل مرة يتم فيها إنشاء اتصال، يحصل على رقم **ابتكار** عالمي وفريد. هذا الرقم يتبع الشبكة العصبية حتى عندما تت繁殖.

عملياً، عندما يتم إنشاء طفل عبر التجانس، يرث ابتكارات والديه. إذا شاركت شبكتان نفس الابتكار، فهذا يعني أنهما لديهما اتصال من نفس الجد. هذا ما يسمح بمقارنة شبكات بأحجام مختلفة.

### التجانس

عندما تت繁殖 شبكتان عصبيتان، يعمل **التجانس** هكذا:

![لاوبوك يشرح مفهوم التجانس مع نص "CROSSOVER" overlaid](/images/laupok-mario-ai/crossover-label.jpg)

1. الشبكة ذات الأداء الأفضل تصبح "الوالد السائد"
2. الطفل يرث جميع اتصالات الوالد السائد
3. لكل اتصال يشارك نفس الابتكار، يمكن للوالد الآخر استبداله (فرصة 50%)
4. فقط الاتصالات النشطة من الوالد غير السائد يمكنها الاستبدال

هذا يضمن أن الطفل دائماً على الأقل بنفس جودة الوالد الأفضل.

### الطفرات

بعد التجانس، يخضع الطفل لطفرات باحتمالات قابلة للتعديل:

![لاوبوك يشرح الطفرات مع نص "(small modif = mutation)" overlaid](/images/laupok-mario-ai/mutation-label.jpg)

| الطفرة | الاحتمال | التأثير |
|----------|------------|--------|
| إعادة تعيين وزن الاتصال | 25% | يتم تعيين الوزن بالكامل بشكل عشوائي |
| طفرة الوزن | 95% | يتغير الوزن بنسبة ±0.80 |
| إضافة اتصال | 85% | اتصال جديد بين نيورون غير مرتبطين |
| إضافة نيورون | 39% | يتم إدراج نيورون مخفي بين نيورونين متصلين |

معدل إضافة النيورونات مهم: هذا ما يسمح للشبكة **بالنمو**. في البداية، هناك فقط مداخل ومخارج. تدريجياً، تظهر النيورونات المخفية، مما يجعل الشبكة أكثر تعقيداً.

---

## الكود: استعراض كامل

### الثوابت

يبدأ السكربت بكتلة من الثوابت التي تحدد جميع الإعدادات:

```lua
-- ماريو يرى من حوله
TAILLE_TILE = 16
TAILLE_VUE_W = TAILLE_TILE * 11  -- 176 بكسل عرضاً
TAILLE_VUE_H = TAILLE_TILE * 9   -- 144 بكسل ارتفاعاً
NB_TILE_W = TAILLE_VUE_W / TAILLE_TILE  -- 11 بلاطة
NB_TILE_H = TAILLE_VUE_H / TAILLE_TILE  -- 9 بلاطة

-- الشبكة العصبية
NB_INPUT = NB_TILE_W * NB_TILE_H  -- 99 مدخلاً (البلاطات المرئية)
NB_OUTPUT = 8  -- A, B, X, Y, فوق، أسفل، يسار، يمين
NB_INDIVIDU_POPULATION = 100  -- أفراد لكل سكان
NB_NEURONE_MAX = 100000  -- أقصى عدد لنيورونات مخفية

-- اللياقة
FITNESS_LEVEL_FINI = 1000000  -- القيمة عند إنهاء المستوى
NB_FRAME_RESET_BASE = 33  -- إطارات بدون تقدم قبل إعادة التعيين
NB_FRAME_RESET_PROGRES = 300  -- إطارات إذا تم اكتشاف تقدم

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

`NB_INPUT` هو 99 لأن رؤية ماريو 11×9 بلاطة. كل بلاطة هي نيورون إدخال. بلاطة فارغة = 0. كتلة = 1. عدو = -1.

المخارج ال8 تقابل أزرار جهاز تحكم SNES: A، B، X، Y، فوق، أسفل، يسار، يمين. Start وSelect وL وR مستبعدة حتى لا "تشتت" ماريو.

### هياكل البيانات

يحدد السكربت ثلاث هياكل رئيسية:

```lua
function newNeurone()
    local neurone = {}
    neurone.valeur = 0    -- قيمة النيورون الحالية
    neurone.id = 0        -- معرف فريد
    neurone.type = ""     -- "input" أو "output" أو "hidden"
    return neurone
end

function newConnexion()
    local connexion = {}
    connexion.entree = 0     -- معرف النيورون المصدر
    connexion.sortie = 0     -- معرف النيورون المقصد
    connexion.actif = true   -- يمكن تعطيله إذا تم إدراج نيورون مخفي
    connexion.poids = 0      -- وزن الاتصال
    connexion.innovation = 0 -- رقم الابتكار الفريد
    connexion.allume = false -- للعرض: true إذا مر الإشارة
    return connexion
end

function newReseau()
    local reseau = {
        nbNeurone = 0,        -- عدد النيورونات المخفية
        fitness = 1,          -- الأداء (المسافة المقطوعة)
        idEspeceParent = 0,   -- النوع التابع له
        lesNeurones = {},     -- مصفوفة النيورونات
        lesConnexions = {}    -- مصفوفة الاتصالات
    }
    -- تهيئة بالمداخل
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

في البداية، كل شبكة لديها فقط مداخل ومخارج. لا نيورونات مخفية، لا اتصالات. الخوارزمية تقرر ما إذا كانت تحتاج أياً منها.

### الطفرات بالتفصيل

#### طفرة الوزن

```lua
function mutationPoidsConnexions(unReseau)
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            if math.random() < CHANCE_MUTATION_RESET_CONNEXION then
                -- 25%: إعادة تعيين كاملة للوزن
                unReseau.lesConnexions[i].poids = genererPoids()
            else
                -- 75%: تغير بنسبة ±0.80
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

الوزن الأولي دائماً 1 أو -1 (`genererPoids()`). التغير بنسبة ±0.80 يمكن أن يحركه بين القيم السالبة والموجبة، مما يغير سلوك الشبكة بشكل جذري.

#### إضافة اتصال

```lua
function mutationAjouterConnexion(unReseau)
    local liste = {}
    -- خلط قائمة النيورونات
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
                -- اتصال صالح: input→output, hidden→hidden, hidden→output
                if (n1.type == "input" and n2.type == "output") or
                   (n1.type == "hidden" and n2.type == "hidden") or
                   (n1.type == "hidden" and n2.type == "output") then
                    -- التحقق من عدم وجود اتصال موجود مسبقاً
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

لا يمكنك ربط الإخراج بالإدخال (هذا سيخلق دورة)، ولا يمكنك ربط نيورينين مرتبطين مسبقاً. الخلط يضمن استكشاف احتمالات مختلفة في كل مرة.

#### إضافة نيورون

هذه هي الطفرة الأكثر إثارة للاهتمام:

```lua
function mutationAjouterNeurone(unReseau)
    if #unReseau.lesConnexions == 0 then return nil end
    if unReseau.nbNeurone == NB_NEURONE_MAX then return nil end

    -- خلط الاتصالات
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

            -- إنشاء النيورون المخفي
            ajouterNeurone(unReseau, indice, "hidden", 1)

            -- ربط الإدخال بالنيورون المخفي
            ajouterConnexion(unReseau,
                unReseau.lesConnexions[listeRandom[i]].entree,
                indice, genererPoids())

            -- ربط النيورون المخفي بالإخراج
            ajouterConnexion(unReseau,
                indice,
                unReseau.lesConnexions[listeRandom[i]].sortie,
                genererPoids())
            break
        end
    end
end
```

الآلية: تأخذ اتصالاً موجوداً، **تعطله**، وتُدرج نيورون مخفي في المنتصف. يتم استبدال الاتصال الأصلي باتصالين جديدين: input→hidden وhidden→output. إنه مثل قطع سلك لإدخال مفتاح فيه.

هذا ما يجعل NEAT "topologies متميزة": الشبكة **تنمو** مع الوقت. تبدأ بسيطة وتصبح معقدة فقط عند الضرورة.

### دالة feedForward

هذه هي الدالة التي تنتشر الإشارات عبر الشبكة:

```lua
function feedForward(unReseau)
    -- إعادة تعيين نيورونات الإخراج
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

كل اتصال نشط يرسل `input_value × weight` إلى النيورون المخرج. القيمة **تتراكم** (تُضاف). العلامة `allume` هي فقط لعرض الشبكة بصرياً.

### قراءة ذاكرة اللعبة

دالة `getLesInputs()` تترجم عالم سوبر ماريو وورلد إلى بيانات يمكن للشبكة فهمها:

```lua
function getLesInputs()
    local lesInputs = {}
    -- التهيئة إلى 0 (رمادي = لا شيء)
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            lesInputs[getIndiceLesInputs(i, j)] = 0
        end
    end

    -- السبرايت (العداء) = -1 (أسود)
    local lesSprites = getLesSprites()
    for i = 1, #lesSprites, 1 do
        local input = convertirPositionPourInput(getLesSprites()[i])
        if input.x > 0 and input.x < (TAILLE_VUE_W / TAILLE_TILE) + 1 then
            lesInputs[getIndiceLesInputs(input.x, input.y)] = -1
        end
    end

    -- البلاطات (الكتل) = قيمة البلاطة (أبيض إذا > 0)
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

شبكة الإدخال هي رؤية مركزة على ماريو: 11 بلاطة عرضاً، 9 طولاً. قيمة كل بلاطة:
- **0** (رمادي): لا شيء
- **1** (أبيض): كتلة صلبة
- **-1** (أسود): عدو

يتم قراءة الأعداء من قائمتين في الذاكرة: السبرايت العادية (`0x14C8`-`0x14F8`) والسبرايت الممتد (`0x170B`-`0x173B`). لكل سبرايت حي (حالة > 7)، يتم حساب موقعه بالنسبة لماريو ووضع -1 في الخلية المقابلة.

### اللياقة: كيف يعرف الذكاء الاصطناعي أنه يتطور

```lua
function majReseau(unReseau, marioBase)
    local mario = getPositionMario()

    if not niveauFini and memory.readbyte(0x0100) == 12 then
        -- تم إنهاء المستوى!
        unReseau.fitness = FITNESS_LEVEL_FINI
        niveauFini = true
    elseif marioBase.x < mario.x then
        -- ماريو تحرّك يميناً
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

اللياقة بسيطة: إنها **المسافة المقطوعة يميناً**. إذا تحرّك ماريو 10 بكسلات، تزداد اللياقة بـ 10. إذا تحرّك ماريو يساراً، لا يحدث شيء (لا عقوبة). إذا تم إنهاء المستوى (العنوان `0x0100` == 12)، تصبح اللياقة 1,000,000.

إنها بسيطة عن قصد. لا مكافأة لقتل الأعداء، لا عقوبة للموت. فقط: تحرّك يميناً.

### إعادة تعيين ذكية

إذا لم يتحرّك ماريو لمدة 33 إطاراً، يتم إعادة تعيين المستوى والانتقال إلى الفرد التالي. لكن إذا تحرّك ماريو (اللياقة الحالية تختلف عن البداية)، ننتظر 300 إطاراً -- مما يعطي الشبكة فرصة لـ"فهم" ما فعلته بشكل صحيح.

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

 الشرط `memory.readbyte(0x0071) ~= 9` يتحقق من أن ماريو ليس في رسومات موته. لا داعي لإعادة التعيين إذا كان ماريو ميتاً بالفعل.

### الحلقة الرئيسية

الحلقة تعمل بـ 30 إطاراً في الثانية (سرعة سوبر ماريو وورلد العادية):

```lua
while true do
    local fitnessAvant = laPopulation[idPopulation].fitness

    -- العرض (الشبكة، المعلومات)
    if forms.ischecked(estAccelere) then
        emu.limitframerate(false)  -- تسريع
    else
        emu.limitframerate(true)   -- 30 إطاراً في الثانية
    end

    -- الدوال الثلاث الحيوية
    majReseau(laPopulation[idPopulation], marioBase)
    feedForward(laPopulation[idPopulation])
    appliquerLesBoutons(laPopulation[idPopulation])

    emu.frameadvance()
    nbFrame = nbFrame + 1

    -- إعادة التعيين إذا لا تقدم
    -- ...
    -- جيل جديد إذا تم اختبار جميع الأفراد
    -- ...
end
```

الدوال الثلاث الحيوية هي `majReseau` و`feedForward` و`appliquerLesBoutons`. تعطيل أي واحدة منها يتوقف ماريو عن التحرك.

### التجانس

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

الطفل يرث من الوالد الأفضل. لكل اتصال يشارك نفس الابتكار، للوالد الآخر فرصة 50% لاستبداله -- لكن **فقط إذا كان الاتصال نشطاً**. هذا إصلاح مهم: بدونه، يمكن إنشاء نيورونات مخفية عديمة الفائدة.

### اختيار الأنواع

```lua
function nouvelleGeneration(laPopulation, lesEspeces)
    local laNouvellePopulation = newPopulation()
    local nbIndividuACreer = NB_INDIVIDU_POPULATION

    -- حساب متوسط اللياقة لكل نوع
    for i = 1, #lesEspeces, 1 do
        lesEspeces[i].fitnessMoyenne = 0
        for j = 1, #lesEspeces[i].lesReseaux, 1 do
            lesEspeces[i].fitnessMoyenne =
                lesEspeces[i].fitnessMoyenne + lesEspeces[i].lesReseaux[j].fitness
        end
        lesEspeces[i].fitnessMoyenne =
            lesEspeces[i].fitnessMoyenne / #lesEspeces[i].lesReseaux
    end

    -- كل نوع ينشئ عدداً من الأبناء يتناسب مع متوسط لياقته
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

الفكرة: نوع بمتوسط لياقة 10,000 ينشئ أبناء أكثر بكثير من نوع بمتوسط لياقة 1. هذا **الانتقاء الطبيعي** أثناء العمل.

`choisirParent` يستخدم اختيار عجلة الحظ: كلما كانت لياقة الفرد أعلى، زادت فرص اختياره كوالد.

### الحفظ والاسترجاع

يتم حفظ المجموعات السكانية في ملفات `.pop`:

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

يشمل الحفظ أيضاً الفرد الأفضل من جميع المجموعات السكانية السابقة. إذا كان الأفضل في المجموعة القديمة أفضل من الجديدة، نعود إلى القديمة كأساس. هذه شكل من أشكال **النخبوية**: الأفضل لا يضيع أبداً.

### عرض الشبكة

أضاف لاوبوك مُعاينة للشبكة العصبية فوق اللعبة:

```lua
function dessinerUnReseau(unReseau)
    -- المداخل: شبكة 11×9 حول ماريو
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

    -- المخارج: 8 أزرار
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

إنها مفيدة بشكل لا يصدق لفهم ما تفعله الشبكة. الاتصالات النشطة بيضاء، غير النشطة شبه شفافة. المداخل شبكة من الخلايا البيضاء/السوداء/الرمادية. المخارج تظهر أي أزرار يتم الضغط عليها.

---

## النتائج

### ما تعلمه الذكاء الاصطناعي

على مدى ساعات (وأيام) من التنفيذ، اكتشف الذكاء الاصطناعي بمفرده:

1. **التحرك يميناً**: السلوك الأساسي ביותר، لكنه يتطلب ضغط زر يمين باستمرار
2. **القفز فوق الأعداء**: عن طريق ربط مدخل "تم اكتشاف عدو" بزر A أو B
3. **تجنب العقبات**: تعلمت بعض الشبكات التراجع مؤقتاً للمضي أبعد
4. **إتمام المراحل**: الفرد الأفضل استطاع إنهاء المستوى الأول من سوبر ماريو وورلد

![ماريو المتحكم به من الذكاء الاصطناعي يواجه بو في مستوى سوبر ماريو وورلد -- الشبكة العصبية تقرر الإجراءات في الوقت الفعلي](/images/laupok-mario-ai/mario-ai-playing.jpg)

### القيود

لديه المشروع قيوده:

- **مستوى واحد**: الذكاء الاصطناعي مدرب على مستوى محدد واحد. لا ينتقل تلقائياً إلى مستويات أخرى
- **وقت التدريب**: يستغرق عشرات الساعات للحصول على نتائج مرضية
- **لا فهم**: الذكاء الاصطناعي لا "يفهم" ما يفعله. يحسّن دالة لياقة (المسافة المقطوعة) من خلال طفرات عشوائية
- **الت-باكنج**: يلاحظ لاوبوك أن ماريو يميل للقفز في مكانه عند رؤية عدو، ببساطة لأنه يزيد اللياقة (تقدّم قليلاً أثناء القفز)

---

## كيف تكرر التجربة

شارك لاوبوك كل شيء. إليك الخطوات:

1. **حمّل BizHawk** من [tasvideos.org](https://tasvideos.org/BizHawk) (قسم التحميل)
2. **احصل على ROM أمريكية من سوبر ماريو وورلد** (نسخة خاصة من كرتون الخاصة بك)
3. **حمّل السكربت** من [Pastebin](https://pastebin.com/Jcvdqhqm) -- أعد تسميته إلى `mario.lua`
4. **ضع السكربت في نفس المجلد مع الـ ROM**
5. **شغّل BizHawk**، وافتح الـ ROM
6. **في وحدة لوكا**: `dofile("mario.lua")` أو عبر السكربت > افتح قائمة السكربت
7. **احفظ حالة** في بداية المستوى (Savestate > Save State) وسمّها `debut.state`
8. **أعد تشغيل السكربت** -- يعمل

يتضمن السكربت نموذجاً مع خيارات:
- **تسريع**: يعطل حد 30 إطاراً في الثانية للذهاب أسرع
- **عرض الشبكة**: يعرض الشبكة العصبية فوق اللعبة
- **عرض المعلومات**: يعرض شريطاً بالجيل واللياقة وعدد الأنواع
- **إيقاف مؤقت**: يوقف التنفيذ
- **حفظ/استرجاع**: يحفظ المجموعة السكانية الحالية في ملف `.pop`

---

## المصادر والمراجع

| المورد | الرابط |
|----------|------|
| الفيديو الرئيسي للاوبوك | [بنيت ذكاءً اصطناعياً يلعب ماريو بمفرده](https://www.youtube.com/watch?v=F63GNXGHVwM) |
| مراجعة الكود + فيديو الإعداد | [كيف تعداد الذكاء الاصطناعي + مراجعة الكود المصدري](https://www.youtube.com/watch?v=u5xCl1bSe6o) |
| الكود المصدري الكامل | [Pastebin Jcvdqhqm](https://pastebin.com/Jcvdqhqm) |
| ورقة NEAT الأصلية | Stanley & Miikkulainen, "Evolving Neural Networks through Augmenting Topologies", 2002 |
| درس N8Programs | [شرح تنفيذ NEAT](https://n8programs.github.io/) (جافاسكريبت، لكن المفاهيم متطابقة) |
| 16blings (إلهام لاوبوك) | [الذكاء الاصطناعي يلعب سوبر ماريو وورلد](https://www.youtube.com/watch?v=qv6IFaOz3bA) |
| BizHawk | [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) |
| ذاكرة سوبر ماريو وورلد | [SMW Central - RAM Map](https://www.smwcentral.net/?p=section&a=details&id=21702) |

---

## الخاتمة

ما فعله لاوبوك هو أخذ خوارزمية أكاديمية (NEAT، 2002)، وإعادة كتابتها بلوكا لمحاكي (BizHawk)، وتطبيقها على سوبر ماريو وورلد. النتيجة: ذكاء اصطناعي يتعلم من الصفر لعب اللعبة، بدون أي معرفة مسبقة، من خلال طفرات عشوائية والانتقاء الطبيعي فقط.

إنه مثال جميل على قوة الخوارزميات الجينية. لا تعلم عميق، لا وحدة معالجة رسومات، لا ملايين نقاط بيانات التدريب. فقط الانتقاء الطبيعي، بعض لوكا، والكثير من الصبر.

الكود موثق ومشترك، ولاوبوك صنع فيديوين شارحين -- واحد للمفاهيم الأساسية، وواحد للكود. إذا كنت مهتماً بالtopic، تعمق فيه. إنه أكثر سهولة مما يبدو.
