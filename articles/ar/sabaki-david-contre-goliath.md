---
title: "Sabaki ضد System One: داود ضد جالوت، أصغر نموذج قرار في العالم"
description: "20KB مقابل 421M بارامتر. Sabaki يخسر 7 نقاط على typed-decisions لكنه ينزل من 25 ثانية CPU إلى أقل من 1ms أوفلاين. تشريح MoE تنظيمي."
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
author_sig: "0smouvnv8OsWzUol97a/Tjh6KqMj/nlUfaSg7WurS16oli5Q//1tBzS3l79M3bgaDXIiwpZEWT9kiC7J7jH/mg=="
---

## مقدمة

لو تتسكع على Hacker News أو تويتر من سبتمبر، أكيد شفت اسم Jev يمر قدامك.

في 15 سبتمبر 2026، TypeSafe تطلق Jev، أول System One عندها. الفكرة كلها في جملة واحدة: بطلوا تطلبوا من LLM يولد JSON عشان يختار label. اعطوه `state` مع أسئلة مكتوبة بأنواع، وهو يرجع لكم قرارات مكتوبة بأنواع مع احتمالات. تمريرة واحدة، صفر توكن يتولد، ولا شيء يتفكك وراها.

وانفجرت. أول يوم تبني قياسي على Vercel AI Gateway، خمسة عملاء Elixir في كم يوم، والكل يقارن Jev مع شغله. وبصراحة الضجة مفهومة. صار لنا سنين نرقع ببرومبتات `جاوب فقط بهذا الشكل {"choice": ...}` وندعي أن الموديل ما يخترع خيار، وما يكسر JSON، وما يهلوس حقل. Jev سمى الحاجة باسمها ونزلها API نظيفة: `POST /v1/systemone`، أسئلة `choice / score / noul`، وأجوبة مع `probabilities` زائد `confidence`.

عجبتني الفكرة. النموذج الاقتصادي أقل، وللتوضيح، عمري ما دفعت لـ Jev.

لأن ورا الكواليس، Jev يبقى API مقفلة. أوزان مجهولة، ما في self-host، كل قرار يعني رحلة شبكة زائد عداد يشتغل. والبدائل المفتوحة اللي جت بعده تضرب في 400M بارامتر مع GPU إجباري.

فعملت الطرف الآخر تماما: [Sabaki](https://sabaki.fox3000foxy.com/). راوتر كلمات مفتاحية زائد انحدار لوجستي بـ TypeScript صافي يتكلم نفس عقد Jev (نفس أشكال `choice / score / noul`، نفس endpoint في `/v1/systemone` مخدوم بـ `serve()`)، لكنه يشتغل في **أقل من 1ms** مع **20 كيلوبايت** JSON. صفر اعتماد في وضع nano، أوفلاين، 0 يورو.

عشان تتصور: Laya هي 843 ميغا safetensors تتحمل. OpenDecider-nano هي 2 غيغا RAM. Sabaki nano invoices هي 20 كيلو. نسبة الوزن تدور حول **40 000**.

لو تبغى النسخة الجادة بالأرقام، فيه preprint v1 لأكتوبر 2026 على الموقع: *Sabaki: An Organizational Mixture-of-Experts for Typed Decisions on CPU* ([PDF](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf)). التصميم، القياسات، المقايضات، كله هناك. هذا المقال هو النسخة المقروءة، مع الكود مفتوح جنبه.

ما كتبته لحالي على طريقة ورقة بنشمارك. أنا أساهم في [azalio/doomLaya](https://github.com/azalio/doomLaya) (الفورك حقي: [fox3000foxy/doomLaya](https://github.com/fox3000foxy/doomLaya))، harness فيه Laya وJev يلعبون FreeDoom فعلا بقرارات model-owned، وتليمتري لكل tick وفيديوهات. شفت جالوت يلعب حقيقي، وشفت أنه أول ما الشبكة تكح، هو يكح معها.

حنفك المحركات واحد واحد. وكالعادة، بالكود الحقيقي.

## الحلبة اللي الكل متفق يتقاتل فيها

يوجد dataset واحد يستشهد به Jev وLaya وOpenDecider كلهم: [LocalLLaMA/typed-decisions](https://huggingface.co/datasets/LocalLLaMA/typed-decisions). 4 workflows مصنعة (دعم، فواتير، أمن، آثار agents)، 5 أسئلة لكل حالة، 1200 حالة تدريب، 400 اختبار، 2000 قرار.

| الموديل | البارامترات | نتيجة الاختبار | التأخير | أين يشتغل |
|---|---|---|---|---|
| OpenDecider-nano | ~400M | 0.796 | 17ms GPU | GPU، 2 غيغا RAM |
| Laya typed-decisions | 421M | 0.766 | ~25s/state CPU، ~830ms/حالة MLX | GPU |
| Jev 1.13 | مقفل | ~0.73-0.75 | ~710ms API | API فقط |
| **Sabaki mini** | 22M int8 | **0.69** | **~20ms CPU** | CPU، 22 ميغا |
| **Sabaki nano** | ~0 | **0.61** | **<1ms** | في كل مكان |
| Laya base صفر شوت | 421M | 0.362 | نفسه | GPU |

العشوائي هو 0.318، والأغلبية 0.461. يعني Laya base على 0.362 بدون fine-tune، هذا مستوى "أجاوب عشوائي بأدب". احفظها، حتحتاجها بعدين.

7 نقاط تفصل Sabaki عن الأفضل. 1000x تأخير يفصلهم بالاتجاه المعاكس لما ما عندك GPU. هذا المقال كله في جملتين، والباقي عشان نفهم ليش.

لكن انتبه: ورا نفس الواجهة `choice / score / noul`، المطابخ ما لها علاقة ببعض. Jev يعني API مقفلة. Laya يعني ModernBERT-large مضروب fine-tune. OpenDecider يعني Ettin-encoder مقطر. Sabaki يعني عد كلمات زائد MiniLM int8. نفس العقد، وميزانيات لا تقارن.

## Jev، الصفعة اللي الكل شافها تمر

لازم نعطي TypeSafe حقها: عقد System One، فكرة ممتازة فعلا.

قبل، عشان تفرز تذكرة، كنت تعمل كذا: تطلب من LLM "اختار بين billing وتقني وسبام، وجاوب JSON"، وتفك الرد، وتتعامل مع الحالات اللي يقول فيها "أظن billing ! 😊" أو يخترع فئة رابعة. كل سؤال يكلف توكنات، وكل جواب ممكن يكسر pipeline حقك.

Jev يغير الصفقة: ترسل النص زائد أسئلة مع معاييرها، وهو يقيم كل سؤال بالتوازي ويرجع لك قيمة مكتوبة بنوع مع توزيعها.

```bash
curl https://api.typesafe.ai/v1/systemone \
 -H "Authorization: Bearer $KEY" \
 -H 'content-type: application/json' \
 -d '{"state":"charge double ce mois-ci","questions":{"dept":{"type":"choice","instructions":"Route ce message.","criteria":{"billing":"paiements","technical":"bugs"}}}}}'
```

الجواب: `{ choice, probabilities, confidence }`. ما في نص حر. كودك يقدر يتشعب عليه مباشرة.

عشان كذا صار فيروسي: SDK بايثون زائد JS، إضافة Claude Code، تكامل LangChain، الكل قدر يشبك agents عليه في بعد ظهر واحد. وثائق TypeSafe نفسها تدفع النمط السليم: Jev للأحكام الصغيرة السريعة، وكود حتمي حوله يركب القرار الحقيقي، وLLM بطيء أو إنسان أول ما الثقة تنزل.

المشكلة في الباقي. أوزان مقفلة، أوفلاين مستحيل، سعر لكل call. لـ agent ياخذ 100 قرار في كل run، الضريبة توجع. لـ Doom على 35 ticks/s، ميت: في doomLaya، Jev يخلص MAP01 seed 48 في 68.97s مع p50 HTTP على 357ms. الـ run يبلغ $0.0046 تكلفة API، مو فاتورتي، فاتورة البنشمارك. يشتغل، والـ run نظيف، بدون موت. لكن 357ms على 35 ticks/s، يعني 12 ticks اللعبة تكمل فيها وأنت تنتظر الشبكة.

Sabaki سرق نفس العقد بالضبط، نفس الأسئلة، نفس الأجوبة، نفس endpoint في `/v1/systemone` مخدوم بـ `serve()`، وشال كل شيء يحتاج datacenter.

## Laya، الكبير المفتوح اللي أثبت أنها ممكنة بدون API

[Laya](https://github.com/NandhaKishorM/laya) من Convai Innovations، Apache-2.0. تحت الغطاء: ModernBERT-large، 421M، مع توكن `[MASK]` واحد لكل خيار. الـ hidden state لكل علامة يمر في MLP صغير، softmax على خيارات السؤال. تمريرة واحدة لكل سؤال، مثل Jev.

```python
pipe = pipeline("text-classification", model="convaiinnovations/laya-typed-decisions")
```

الـ 0.766 تستاهل نوقف عندها. هذا checkpoint **مضروب fine-tune على train البنشمارك**: 1200 حالة، RLCD مع ضجيج غاوسي على logits، مكافأة log زائد spherical. نفس الموديل بدون هذا الضبط ينزل لـ 0.362. يعني يخمن. فسكور Laya هو "مشفر كبير زائد تدريب على الدومين"، مو "مشفر كبير سحري".

على CPU، هو طابوقة. منفذ ONNX المقاس يدور حول 25 ثانية لكل state. على MLX FP16، احسب 830ms لكل حالة كمعدل مع p99 على 5.3s. ولازم تحمل 843 ميغا قبل ما تجاوب على أي شيء.

في doomLaya، الـ Laya stock تفشل MAP01 في 180s. النسخة v3 المعدلة ([azalio/laya-doom-v3](https://huggingface.co/azalio/laya-doom-v3))، المعاد تدريبها على Doom، تخلص في 61.43s مع p50 على 108ms على MPS، وتلقط الشوتغن في الطريق. يعني أيوه، تلعب، لكن بعد تدريب مخصص، على GPU آبل، مع منفذ مسكربت يعمل الشغل الحقيقي (A*، أبواب مع latch على 15 ticks، تصويب تلقائي).

خلاصتي: بدون تدريب على مهمتك، Laya تصلح ثقالة ورق بـ 421M. معه، هي قوية جدا، لكن لازم GPU والداتا اللي تروح معه.

## OpenDecider، اللي فاز بالليدربورد

[OpenDecider](https://github.com/manjunathshiva/opendecider)، هذا Manjunath قرر يجيب الكل على البنشمارك حقهم. النتيجة: **0.796** مع Ettin-encoder-400m مضروب full fine-tune زائد رأس MLP، خسارة KL على soft targets مقطرة من Qwen3-235B زائد DeepSeek.

```bash
pip install opendecider
# 17ms/سؤال على L40S، 18ms على M4 Max، ~9ms بالدفعات
```

عند 50% تغطية، الدقة الانتقائية تطلع لـ 0.943 مقابل 0.882 لـ Jev. على الورق، أفضل العالمين: مفتوح، معاير، سريع.

في الواقع: 2 غيغا RAM لتحميل nano، GPU لازم عشان تمسك 17ms، تصيد على 0.63 مقابل 0.90 لـ Jev (الـ OOD يمسح فيه)، ومثل Laya، مدرب على train البنشمارك. الاختبار ما انشاف، لكن الدومين أيوه.

يفوز في المصارعة، لكنه يبقى 400M مع GPU وراه. ما تلزقه في Worker على Cloudflare ولا في حلقة لعبة على لابتوب.

## الـ 150M، والفراغ اللي تحتها

openJev-verdict-2.0 (151M)، julia-1 (144M متعدد اللغات)، Open Jev (150M)، Largha-150M (144M en+zh)، Vela (0.3B-9B). كلها ModernBERT أو mmBERT-small، كلها قادرة تشتغل على CPU، وكلها لطيفة في التدريب (Open Jev يعلن 30 دقيقة على T4 Colab). أرقام self-reported، بروتوكولات مختلفة، فخذها بملقط، لكن العائلة موجودة.

الـ generalist حق Sabaki يعمل **22.7M**. حوالي 6.5x أصغر من أصغر واحد في هذه الشلة. ولا أحد ثاني ينزل تحت 100M عشان يجاوب على أسئلة تتعرف في runtime.

هذا هو "الأصغر في العالم": مو أفضل سكور، أصغر ظرف يقرأ `instructions` زائد `criteria` حقك ويحسم لما ولا مختص يعرف يجاوب.

## Sabaki، الراوتر الغبي وخبراؤه المرمى

طيب، كفاية كلام عن الكبار. نروح لداود، لأن هنا تصير ممتعة.

Sabaki لا يحاول يكون موديل كبير ذكي يفهم العالم. هو MoE تنظيمي: راوتر sparse واحد على مستوى النظام، خبراء مستقلون، واحد نشط فقط لكل input. كل plugin هو حزمة npm منفصلة، مع manifest وأوزان ونسخة. تثبت بس اللي توجه له.

المنظمة [sabaki-js](https://github.com/sabaki-js): 13 ريبو، الـ core اسمه `sabaki` (129 commits)، 6 plugins من نوع `@sabaki-js/*`، الأوزان، worker على Cloudflare، والقالب عشان تكتب حقك.

الـ `package.json` للـ core يحكي القصة لحاله:

```json
"dependencies": { "@typesafe-ai/sdk": "^0.7.0" },
"optionalDependencies": { "onnxruntime-node": "^1.22.0" }
```

في وضع nano، صفر اعتماد runtime. TypeScript مترجم فقط، لا شيء يتثبت، لا شيء ينكسر بين نسختين من ONNX.

### الراوتر، أو كيف تقرر في كم سطر

الراوتر يعيش في `src/index.ts`، والـ tokenization تشبه هذا (`src/index.ts:129`):

```ts
function tokens(s: string): string[] {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/).filter((w) => w.length > 3);
}
```

أحرف صغيرة، لهجات مشالة، كلمات 4 أحرف على الأقل. هذا الفلتر يشيل كل الضجيج ("le"، "de"، "ok"). على تذاكر الدعم، يغير كل شيء لأن المطابقة حقك تصير على كلمات تحمل معنى.

السكور نفسه في `route()` (`src/index.ts:251`)، وهنا ينلعب كل شيء:

```ts
const hits = kws.filter((k) =>
  words.some((w) => w.includes(k) || k.includes(w))).length;
const score = hits / Math.sqrt(kws.length);
```

مطابقة مرخية بالاتجاهين: `billing` تلقط `billed`، و`invoice` تلقط `invoicing`. القسمة على الجذر تمنع معاقبة قوائم keywords الكبيرة، وإلا plugin الميل مع 600 كلمة حقته يسحق الكل أول ما إيميل يحتوي "hello".

كل plugin له عتبته، الافتراضي 0.15 مخزن في `src/index.ts:139`، والميل على 0.03 لأن المواضيع قصيرة. تحتها:

```ts
return { domain: "unknown", decision: null, confidence: 0, plugin: null };
```

دومين مجهول يعني `unknown`، أبدا تخمين مخترع عشان يفرحك. مقصودة غبية بهذا الشكل، وهذا بالضبط اللي يخلي العتبة `automate > 0.8` صالحة للاستعمال بعدين: لما Sabaki يجاوب، فهذا لأن مختص فعلا طابق.

يوجد محور لغة إضافي عبر `langid`: plugin يعلن `languages` لا ينافس إلا على لغاته. عملي لفصل تصيد لاتيني عن CJK. نص قصير جدا يعني لا فلتر، الكل ينافس.

التكلفة الكلية: كم ميكروثانية لكل قرار. لا مصفوفة تنضرب، لا شبكة تندعى، فقط مقارنات strings وقسمة.

### Nano، ملفي المفضل في الريبو

`src/logreg.ts:28`، الـ tokenization:

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

Unigrammes زائد bigrammes. `charged twice` تعطي `charged`، و`twice`، والزوج `charged twice`. هذا كل ما تحتاجه عشان تلقط "فواترة مزدوجة" بدون ما تطلع transformer بـ 400M.

`src/logreg.ts:46`، التحويل لمتجهات، هنا TF-IDF يشتغل شغله:

```ts
const tf = 1 + Math.log(c);  // TF تحت خطي
const val = tf * w.idf[i]!;  // IDF ملساء على طريقة sklearn
```

المرة العاشرة لكلمة تحسب أقل من الأولى، والكلمات النادرة توزن أكثر من "please". بالضبط وصفة sklearn، تطابق تام متحقق عليه على 20 سؤال.

والتعليق اللي ضحكني وأنا أراجع:

```ts
// يلمس فقط المصطلحات الموجودة (متناثرة) بدل مسح 3000 بعد.
for (const [t, c] of counts) {
```

بدل ما تمسح 3000 بعد في كل تذكرة، تلمس فقط عشرين كلمة موجودة. عشان كذا يجاوب في أقل من 1ms. هذا النوع من التفاصيل الخفية اللي يغير كل شيء في الإنتاج، لأن التعقيد يتبع حجم التذكرة مو حجم المفردات.

`src/logreg.ts:86`، الاستدلال، اللي ينحشر في ثلاثة أسطر:

```ts
// ثنائي: سطر معاملات واحد زائد سيغمويد
const pPos = 1 / (1 + Math.exp(-s));
// متعدد الفئات: جداء نقطي زائد softmax، argmax
```

جداء نقطي واحد، سيغمويد أو softmax حسب عدد الفئات. تمريرة واحدة وخلاص. صفر توكن متولد، يعني صفر JSON مكسور تصلحه وراها بـ retry وحيل تفكيك.

وصفة `train.py`: 300 تدريب / 100 اختبار لكل workflow، تقسيم حتمي (1 عنصر من 5 للاختبار عشان تتفادى الانحياز الزمني)، مفردات 3000-6000، معاملات مقربة لـ 1e-4 مع صفر خسارة مقاسة. تصدير JSON بصيغة `{ vocab, idf, questions }`.

الأوزان: 20 كيلو لـ invoices (الـ `duplicate` على 0.89) إلى 650 كيلو للميل (الـ `bucket` على 0.889). النوع من الأحجام اللي يدخل في bundle واجهة.

التفصيل اللي صدمني: على الميل، MiniLM يلصق TF-IDF بفارق +/-0.02. يعني nano يتشحن كما هو. أدفع GPU عشان أفرز إيميلات، لا شكرا. بالمقابل agent_trace يعلق (الـ `needs_review` على 0.59 في nano): نص المراقبية فقير، ولا كلمة تحمل القرار فعلا.

المصنع اللي يحول الأوزان لـ plugin، في `src/plugin.ts:52`:

```ts
export function nanoClassifier(manifest, weights, opts = {}) {
  return definePlugin({ manifest,
    classify: (input) => {
      const r = predict(`${from}${input.state}`, weights, q);
      return { decision: r.decision, confidence: r.confidence, domain: manifest.domain };
    }});
}
```

الـ `decide()` تبقى متزامنة في nano، والـ `decideAsync()` تفتح ONNX لـ mini. مساران، وقاعدة بسيطة: لو تحتاج async فهذا لأنك تبغى mini، وإلا nano تكفي. سهلة تتذكر وأنت تكود، وسهلة تتصلح لما تنكسر.

عشان أوريك أنه مو بس نظرية، هذا شكل استعمال حقيقي:

```ts
import { Sabaki } from "sabaki";
import customerService from "@sabaki-js/customer-service";

const sabaki = new Sabaki().register(customerService);
sabaki.decide({ state: "charged twice, refund please" });
// { decision: "billing", confidence: 0.31, domain: "customer_service" }
```

### Mini، 22 ميغا تغير اللعبة على الحالات الصعبة

Nano لها حدود، شفتها على agent_trace فوق. MiniLM-L6 يستلم الشعلة: مشفر مشترك لكل الدومين، زائد رأس خطي لكل سؤال. Fine-tune من أوله لآخره على 8-12 epochs، lr على 2e-5، على GPU CUDA للتدريب (الاستدلال يبقى CPU، هذا اللي يهم).

الأرقام اللي حسمت، مقاسة على نفس التقسيمات:
- مشفر مجمد زائد MLP: 0.65
- full fine-tune: 0.68
- تقطير 400M نحو embeddings مجمدة: تجربت، وانرمت، أسوأ من gold labels

تصدير ONNX عبر dynamo، تطابق تام متحقق، ثم تكميم ديناميكي int8: من 90 ميغا إلى 22 ميغا، **-0.004 دقة** على customer_service. ECE ثابتة أو أفضل. كل تصدير يعاد قياسه، وإلا التحسين ما يعني شيئا.

من 1.0.2، الأوزان مضمنة في الحزمة (`models/<workflow>-int8/` زائد `modelDir` مصدر). `npm i` تكفي، وضع طيران OK. التحديث يعني نشر patch، موقع عبر trusted publishing.

عمليا: الـ `needs_review` تطلع من 0.59 إلى **0.82**. الـ `disposition` من 0.73 إلى 0.76. ECE تحت 0.14 في كل مكان، مع شك OOD صحي (0.2-0.5 على تنانين ووصفات وstrings فارغة). هذا الشك هو اللي يسمح بالعتبة العدوانية في الإنتاج.

### Generalist، الشبكة اللي تخلي Sabaki فعلا System One

Jev وغيره يجاوبون على كل شيء: أي سؤال، أي خيارات، تتعرف في runtime. هذا هو عقد System One اللي خلى Jev فيروسي، تطرح `instructions` زائد `criteria` مع خياراتك، وهو يحسم.

مختصو Sabaki ما يعرفون يعملون هذا. يعرفون أسئلتهم (`category`، `duplicate`، `bucket`) ولا شيء غيرها. بدون شبكة، Sabaki يرجع `unknown` أول ما تطلع عن النص، بينما Jev يجاوب دائما شيئا.

الـ generalist هو هذه الشبكة. cross-encoder يقرأ سؤال زائد خيار زائد state ويطلع سكور، تمريرة لكل خيار، softmax، argmax. 22.7M MiniLM int8، أصغر 6.5x من 144-151M حق الشلة. لكن شغله مو السكور، شغله التوافق: معه موصول كـ fallback، الـ `POST /v1/systemone` يقبل أي state وأي أسئلة، مثل Jev. حقل `model` يقول مين جاوب فعلا (`@sabaki-js/mail@1.1.2+mini`، `sabaki-generalist-v1`...)، فمن جهة المنادي ما تغير شيئا.

والأهم، هو fallback، مو رئيس. القاعدة الذهبية في `decideAsync()`: لو مختص كسب التوجيه، هو يجاوب. الـ generalist لا يتكلم إلا على `unknown`. أبدا العكس. هذا يمنع جنرالست متوسط يسحق مختص ممتاز في دومينه.

الـ loader يعيش في `src/generalist.ts`، مع cache لكل مجلد عشان لا يعيد تحميل جلسة ONNX في كل call:

```ts
export function loadGeneralist(modelDir: string) {
  // كاش لكل مجلد، جلسة ONNX يعاد استعمالها
  // tokenizer.json -> Unigram أو wordpiece، يكتشف تلقائيا
  const sess = await ort.InferenceSession.create(
    path.join(modelDir, "generalist.onnx"),
    { intraOpNumThreads: 2 },
  );
}
```

توجه `SABAKI_GENERALIST_DIR` نحو مجلد فيه `generalist.onnx` زائد `tokenizer/`، والموديل قابل للتبديل. الـ id يجي من `config.json`، وإلا `"sabaki-generalist"`. الـ cache من نوع `Map` يمنع إعادة تحميل الجلسة في كل call.

صيغة الدخل، cross-encoder كلاسيكي: سؤال وخيار وstate ملزقة بفواصل، سطر لكل خيار يتقيم:

```ts
const texts = options.map(
  (o) => `${input.question ?? "decision"} [SEP] ${o} [SEP] ${input.state}`,
);
```

سؤال زائد خيار زائد state، مفصولة بـ `[SEP]`، سطر لكل خيار. الخيارات مسقوفة عند 8 (`slice(0, 8)`)، والافتراضي `["yes", "no"]` لو ما تعطي شيئا. فوقها، لازم تقطع من جهة المنادي، 8 واسعة أصلا لقرار مكتوب بنوع.

ثم تجي الدفعة الذكية، نوع التحسين اللي ما يدفع شكله لكنه يقسم التأخير على عدد الخيارات. بدل `session.run` لكل خيار، كله ينطلق في forward واحد:

```ts
// forward واحد مدفع لكل الخيارات
// (مبطنة للطول الأقصى) بدل run لكل خيار.
const L = Math.max(...encs.map((e) => e.ids.length));
// ids زائد attention_mask في [options.length, L]، حشو عند padId
const out = await sess.run({ input_ids, attention_mask });
const scores = Array.from(out["score"].data).map(Number);
```

كل نص يتشفر (wordpiece على طريقة BERT أو unigram SentencePiece حسب `tokenizer.json`)، يتبطن لأقصى طول في الدفعة، يترص في تنسور `[nb_options, L]`. `sess.run` واحد، وتسترجع سكور لكل خيار. على CPU هذا يغير كل شيء: 20-36ms بدل 8x هذا الوقت.

ثم يجي softmax زائد argmax، مع الاحتمالات الكاملة لكل خيار، بالضبط بالصيغة اللي نشرها Jev:

```ts
const pr = softmax(scores);
// bi = مؤشر الأقصى
const confidence = Math.round(pr[bi] * 1000) / 1000;
const probs = Object.fromEntries(
  options.map((o, i) => [o, Math.round(pr[i] * 1000) / 1000]),
);
```

والتفصيل اللي يخلي الشيء صالحا للإنتاج بدل ما يبقى ديمو، هو `abstainAt`:

```ts
if (input.abstainAt !== undefined && confidence < input.abstainAt) {
  return { decision: null, confidence, domain: "generalist", probabilities: probs };
}
```

Opt-in، لا امتناع افتراضيا. تمرر `abstainAt: 0.6-0.7` وكل ما هو طري يرجع `null` بدل تخمين. وبما أن softmax يطلع 1.00 حتى لما يغلط خارج التوزيع، فهذا مو رفاهية. الـ GUIDE يوصي به لكل استعمال ذاتي: تحت العتبة، تطلب توضيحا بدل الحل التلقائي.

للختام، هذا نفس التركيب مع fallback الـ generalist: لما ولا مختص يطابق، هو يستلم بدل ما يرجع `unknown`.

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
// مختص الميل لو التوجيه طابق، وإلا generalist كشبكة على طريقة Jev
```

أجيال الـ generalist، كلها مقاسة بنفس الطريقة على PhishNChips (2000 إيميل) وعلى اختبار typed-decisions عشان نقارن ما يقارن:
- v4: 0.29 اختبار، R=0.026 تصيد. تترمي، كانت تجاوب جنب الموضوع.
- A (22M 80k): 0.546، R=0.406. بدأت تشبه شيئا.
- mini v1 المخدومة: **0.536، R=0.616**. هذه اللي شغالة على الموقع. recall تصيد سليم، اختبار متوسط.
- B (144M scratch): 0.568، R=0.062. أكبر، أفضل بشوية في الاختبار، ولا شيء في التصيد.

الـ 144M from scratch اللي ما ينقل أفضل، هذا هداني كثير عن فكرة "نرمي بارامترات أكثر عشان نعمم". على نفس المهمة، الكبير يكلف أكثر بدون تخمين أفضل. حتى كشبكة، الصغير يعمل الشغل. ويبقى EN فقط (`all-MiniLM-L6-v2`)، توجيه EN، وFR خارج التوزيع. للفرنسي، لازم تمر بمختص مدرب عليه، مو بالـ generalist.

## Doom، الاختبار الوحيد اللي يهمني فعلا

doomLaya، هي Laya وJev يلعبون FreeDoom حقيقي. الموديل يختار `command / target / weapon`، والمنفذ يرسم طريق A*، يفتح الأبواب، يصوب، ينقر. تليمتري لكل tick، فيديوهات، SHA للـ runs. أساهم فيه، فما أتكلم عن ليدربورد مقروء من بعيد.

v0.1.0، MAP01 seed 48، skill 3، 35 ticks/s، نفس المنفذ:

| الموديل | النتيجة | p50 HTTP | تكلفة API |
|---|---|---|---|
| Laya stock | فشل 180s | 106ms | $0 |
| Laya v3 المعدلة | خروج 61.43s | 108ms | $0 |
| Jev 1.13 | خروج 68.97s | 357ms | $0.0046 |

خروجان نظيفان، بدون موت، مع Laya تلقط الشوتغن في الطريق لأن المنفذ يدير الالتقاط لحاله. للأمانة: Laya v3 تدربت على Doom، وJev لا. seed واحد، خريطة واحدة، لا يثبت شيئا عاما. README المشروع يقولها أسود على أبيض، وهذا من شرفه أنه لا يبالغ في النتيجة.

جهة Sabaki ([plugin-doom](https://github.com/sabaki-js/plugin-doom)): ViZDoom ببايثون ينادي سيرفر JS في كل tick. Nano حوالي 18k req/s، وmini حوالي 71 req/s على thread i5 واحد. الـ tick على 35Hz يمر مرتاح، حتى على لابتوب متوسط.

مع بوصلة خروج، mini تخلص MAP01 في 2-4 runs من 6، وnano صفر من 6. منطقي: النص يضيع المكاني، وحالات doomLaya النصية تسقف نحو 0.57 سواء MiniLM أو ModernBERT-base. لما المعلومة المكانية ناقصة، ولا مصنف نصي يخترعها.

الجيران أعادوا المباراة ببيانات متساوية: [doomgemma](https://github.com/dexmac221/doomgemma) يلصق LoRA في 27 دقيقة على RTX 4070 ويوصل Gemma 4 E2B لمستوى Laya v3 في اللعب (6/6 مقابل 6/6) وفوقها في القرارات المعزولة. بحجم متساو، مفكك يمشي بنفس سرعة Laya (270M: 22ms مقابل 23ms). بنتيجة متساوية، Laya تبقى أسرع 3x تقريبا لأنها توصل بموديل أصغر.

قراءتي: التدريب على المهمة يهم أكثر من المعمارية. مختص صغير مدرب يغلب جنرالست كبير يكتشف. بالضبط رهان Sabaki. الورقة اللي تليه، *System Switch* ([arXiv:2610.09683](https://arxiv.org/abs/2610.09683))، تدفع المنطق للآخر: موديل صغير سريع يلعب، وموديل مفكر كبير يستلم لما بوابة تنفتح. الفرز الأولي حق Sabaki (الـ `automate > 0.85 وإلا تصعيد`) مطبق على اللعب.

## ما تم التضحية به

كل ميزة غائبة تمول أخرى، هذه قاعدة اللعبة لما تستهدف CPU. القائمة الصادقة، مثل Bareiron حيث كل سطر C كان مقايضة:

**Sabaki لا يحكي.** هو يحسم بين خيارات تعطيها له، مع احتمال. لشرح، أو ملخص، أو نص حر، خذ LLM.

**الفرنسية تبقى خارج التوزيع للـ generalist.** توجيه EN (الـ `all-MiniLM-L6-v2`)، مسبار 1/4 فرنسي مقابل 3/4 إنجليزي على حالات متشابهة. plugin الميل جاء من شركة أغلبها فرنسية لكن مجهولة: صفر PII، -0.024 دقة مقابل مفردات بدون مصطلحات شخصية. إخفاء الهوية يندفع ثمنه، لكنه كان غير قابل للتفاوض.

**الـ softmax يظهر واثقا جدا لما يخرج من منطقته.** شوهدت أخطاء على 1.00، أيوه. عشان كذا الفرز الأولي الموصى به في GUIDE: الـ `abstainAt: 0.6-0.7` ليرجع `null` تحت العتبة، ثم بوابة `confidence > 0.85` للأتمتة، وإنسان للباقي. مرجع مقاس: recall تصيد 0.62 بدقة 0.87. يكفي يقص الطابور نصفين، مو يكفي يطرد المراجعين.

**Nano يتعثر على آثار agents.** من 0.34 إلى 0.59 حسب السؤال. Mini ترفع الـ `needs_review` إلى 0.82، لكن الـ `risk / urgency / action` تبقى صعبة. نص المراقبية فقير في الإشارات المعجمية فقط.

**Doom نصيا يسقف.** نحو 0.57، MiniLM مثل ModernBERT-base. طول ما تبقى على نص بدون بكسلات، MAP02 توقفك. الطريق الموثوق للاعب حقيقي، هو رؤية زائد RL (tiny-doom-defender، 1.1M بارامتر من بكسلات)، مو مصنف نصي أفضل.

**البنشمارك ينجرف بالدفعات.** typed-decisions متولد بدفعات، والتقسيم الزمني هو في الحقيقة تقسيم دفعات. الـ `drift_tool.py` يطلع 0.82 على customer_service، و0.67 على agent_trace (0.5 يعني لا يميز). النتيجة المقاسة: الأوزان المنشورة تعمل 0.733 مختلط مقابل 0.61 على التقسيم الرسمي. فالرقم الرسمي محافظ إذن. المعايرة Platt / temperature+bias لا تنتقل بين الدفعات، فنشحن فقط temperature scaling معاير على دفعات حديثة. قاعدة البيت: الـ `drift_tool.py` أولا، تحذير فوق 0.6، ومنع فوق 0.8. ولا أحد ثاني ينشر هذا، والكل لازم.

## النتيجة النهائية، بالأرقام في اليد

من جهة لابتوب i5، ومن جهة API تحاسب لكل call. هذا ما يعطيه كل وضع عمليا:

- nano: أقل من 1ms، حوالي 18k req/s، 20-650 كيلو، صفر اعتماد
- mini: حوالي 20ms، حوالي 71 req/s، 22 ميغا int8، onnxruntime اختياري
- generalist: 20-36ms، 22.7M، أصغر جنرالست مفتوح أعرفه

عدة دومينات محملة: حوالي 0.5 غيغا RAM في lazy-load لكل دومين بدل حوالي 2 غيغا للكل. حتمي: 100/100 inputs متطابقة تعطي نفس المخرج. عتبات لكل سؤال، بوابة على `confidence`، و`unknown` لما لا شيء يطابق.

على Bareiron، تشغيل 3 لاعبين فأكثر كان يعلق لأن كل لاعب يكلف chunk على 200ms. هنا تشغيل 3 دومينات فأكثر يمر بدون ما يتنحنح، لأن كل خبير صغير جدا ويتحمل عند الطلب بدل تحميل الكل دفعة واحدة. نفس فلسفة "الصغير يكفي"، مطبقة على عتاد آخر.

## الفلسفة

p2r3 قال: *"أحب فقط فكرة أن هذه الشريحة الصغيرة جدا بألف تكلفة تقدر تشغل شيئا متقدما مثل Minecraft."*

نفس الجو هنا: أحب فكرة أن 20 كيلو JSON ومئة سطر TS تعوض call على GPU عشان تختار label. واضح ما تعوض كل شيء، لا نبالغ. تعوض الحالة المزعجة حيث تبغى label في مللي ثانية، محليا، مع ثقة تقدر تعتبها بشكل معقول بدل ما تصلب أصابعك.

المقايضات، مكتوبة أسود على أبيض:
- مشفر نحو عد كلمات: 7 نقاط أقل، تأخير مقسوم على 1000، بنية صفر
- موديل كبير واحد نحو plugins على npm: بوابة أخشن، عمليات أبسط بلا حدود
- توليد نحو قرار مكتوب بنوع: خلاص تفكيك يتكسر وخيارات مخترعة
- ثقة خام نحو فرز أولي: امتناع أولا، أتمتة فوق 0.85، وإنسان للباقي

**الـ 3 أشياء تتذكرها:**

1. **7 نقاط أقل، أسرع 1000x**، 0.61/0.69 مقابل 0.75-0.80، لكن أقل من 1ms/20ms على CPU أوفلاين مقابل 25 ثانية CPU أو API مدفوعة. سكور بدون تكلفته لا يعني شيئا.
2. **راوتر بسيط زائد خبراء منفصلون**، `hits / sqrt(keywords)`، عتبة، `unknown`. كل plugin يتدرب ويتنسخ ويتشحن لحاله. على الميل، TF-IDF يلصق MiniLM: الـ GPU لا فائدة منه هنا.
3. **أوفلاين أولا مع معايرة صادقة**، `npm i`، أوزان مضمنة، صفر GPU، ECE تحت 0.14، امتناع، أداة drift. الـ stack الوحيد في المقارنة اللي يمسك حلقة لعب على 35Hz بدون GPU.

لو المشروع يهمك، كله MIT على [github.com/sabaki-js](https://github.com/sabaki-js). النسخة الأكاديمية مع القياسات وbibtex، هي [preprint v1](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf). ولو تبغى تشوف جالوت يلعب Doom حقيقي، على [azalio/doomLaya](https://github.com/azalio/doomLaya) xD
