---
title: "Luna Protocol : لماذا ضبطت نموذجا من 1,5 مليار معامل على 50k عينة Discord، ولماذا غيّر التمهيد few-shot كل شيء"
description: "نموذج أصغر مدرّب على بيانات أقل يمكنه التفوق على نموذج أكبر، بشرط معرفة تمهيده جيدا. إليكم لماذا انتقل Luna Protocol من Hermes 3B إلى ضبط Qwen 1,5B، ولماذا صار التمهيد few-shot عامل التقدم الحقيقي."
date: 2026-07-17
authors:
  - fox3000foxy
tags:
  - discord
  - llm
  - fine-tuning
  - few-shot-learning
  - qwen
  - unsloth
  - open-source
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "WchV65f4k2zQSesxcXHKRBzoK9/+TpQlB7Eg8J+zl4SvsAWHmIowW2TB2udwWqzJ3sTO59pr5v/Vm+NQHLZlsA=="
---

# Luna Protocol : لماذا ضبطت نموذجا من 1,5 مليار معامل على 50k عينة Discord، ولماذا غيّر التمهيد few-shot كل شيء

في [المقال الأول](/articles/en/luna-protocol-discord-bot)، بنيت بوت Discord يحاكي إنسانا : نوم وأخطاء مطبعية وتردد ونسيان ورسائل عفوية. النظام السلوكي كان متماسكا. وكان الـLLM خلف كل ذلك نموذج Hermes من 3 مليارات معامل، مُكمَّم Q8_0، يستهلك 3 Go من VRAM.

كان يعمل. لكنه كان أكبر من اللازم.

بوت Discord لا يحتاج نموذجا من 3 مليارات معامل ليقول «nm just chillin, u». ما يحتاجه هو **اتساق أسلوبي** : القدرة على الحفاظ على نبرة محادثة دقيقة، رسالة بعد رسالة، دون الانحراف نحو وضع «مساعد مؤسساتي». وتبين أن نموذجا أصغر، مُدرَّبا على بيانات أقل وممهَّدا ببضعة أمثلة، ينجح في ذلك أفضل من نموذج أكبر يفرض المرور عبر prompt نظام بسيط.

هذا المقال عن نماذج Luna Protocol الرسمية : لماذا توجد، ولماذا 1,5B بدلا من 3B، ولماذا 50k عينة تدريب بدلا من 7,3M، ولماذا انتقل التمهيد few-shot من مرتبة «إضافة لطيفة» إلى قلب المقاربة كلها.

---

## المشكلة مع نموذج 3B

كان الإعداد الأصلي يستخدم `Discord-Micae-Hermes-3-3B.Q8_0.gguf`، نموذجا من 3 مليارات معامل مضبوطا على بيانات Discord. كان ينتج ردودا جيدة، لكن :

| المقياس | Hermes-3-3B Q8_0 | الهدف |
|--------|-------------------|--------|
| استخدام VRAM | ~3 Go | < 1 Go |
| توليد الرموز | ~30 tok/s | ~60+ tok/s |
| حجم ملف النموذج | ~3,2 Go | < 1 Go |
| زمن الإقلاع البارد | ~8s | ~3s |

لبوت يعمل 24/7 على خادم متواضع، 3 Go من VRAM كثير. وسرعة التوليد، المقبولة للرسائل العرضية، بدت متثاقلة أثناء الردود المتتابعة أو مع عدة قنوات نشطة.

وكان السؤال : هل يمكن الحصول على نفس أسلوب Discord-Dialogues بنصف المعاملات ؟

---

## قرار الضبط : لماذا 50k، لا 7,3M

يحوي طقم البيانات [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) **7,3M تبادل** و**17M دور كلام**. إنه مدونة ضخمة من محادثات Discord الحقيقية. وكانت المقاربة البديهية هي التدريب على طقم البيانات كاملا.

فعلت العكس. درّبت على **50 000 عينة**، أي أقل من 1% من البيانات المتاحة.

إليكم لماذا : **حجم طقم التدريب يؤثر مباشرة على درجة الإفراط في تخصيص النموذج لتوزيع تدريبه**.

النموذج المدرّب على 7,3M مثال يتعلم توزيعا إحصائيا شديد الخصوصية للمحادثات. يصبح ممتازا في إعادة إنتاج هذا التوزيع، لكنه يصبح أيضا **صلبا** : تقل لديه الهوامش للتكيف مع أنماط جديدة تُقدَّم لحظة الاستدلال.

النموذج المدرّب على 50k مثال يتعلم النبرة والسجل العام لمحادثات Discord (غير رسمي وقصير واختصارات وحروف صغيرة)، لكنه يحتفظ بمرونة كافية ليُقاد **بأمثلة في السياق**. أمثلة few-shot لا تصارع توزيعا ضخما مُتعلَّما فعلا : بل تُكمّل توزيعا أخف.

إنها الحدس المركزي : **بيانات تدريب محدودة تجعل التمهيد few-shot أكثر فعالية**.

---

## النموذج : تفاصيل تقنية

نموذج Luna Protocol هو **ضبط QLoRA** لـ[Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct) :

| المعامل | القيمة |
|-----------|-------|
| النموذج الأساسي | `unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit` |
| الطريقة | QLoRA (4-bit) |
| رتبة LoRA | `r=16` و`lora_alpha=16` |
| الوحدات المستهدفة | `q/k/v/o_proj` و`gate/up/down_proj` |
| المعاملات القابلة للتدريب | 18 464 768 / 1 562 179 072 (1,18 %) |
| بيانات التدريب | ~50 000 مثال (مجموعة فرعية من Discord-Dialogues) |
| المرشح | 8-512 tokens لكل عينة |
| الحقب | 2-3 |
| العتاد | Kaggle T4 |
| الإطار | [Unsloth](https://github.com/unslothai/unsloth) |

طقم البيانات fork مُعالَج مسبقا من Discord-Dialogues، مُرشَّح للاحتفاظ بأدوار `user`/`assistant` النظيفة فقط : تبادلات مستخدم ومساعد فقط، دون رسائل نظام ولا بيانات وصفية ولا أوامر بوت. وهذا مهم لما يلي.

### التكميمات المتاحة

| الملف | التكميم | الحجم | ملاحظات |
|------|-------------|------|-------|
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q2_K.gguf` | Q2_K | 676 Mo | متدهور بوضوح، غير موصى به |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf` | Q4_K_M | 986 Mo | حل وسط جيد حجم/جودة (موصى به) |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q8_0.gguf` | Q8_0 | 1,65 Go | أفضل وفاء أسلوبي |

النموذج الموصى به هو **Q4_K_M** : أقل من 1 Go، وسريع، ويحفظ جيدا الأسلوب المحادثي. يتدهور Q2_K أكثر من اللازم لنموذج بهذا الحجم. يقدم Q8_0 أفضل جودة لكنه يستهلك ذاكرة أكثر بـ68%.

---

## اختراق التمهيد few-shot

إليكم الجزء الذي غيّر كل شيء.

تحمل بطاقة النموذج على HuggingFace تحذيرا :

> مع prompt عارٍ ودون تمهيد، يميل هذا النموذج للسقوط في نبرة «المساعد» الافتراضية لـQwen. تمهيد few-shot قصير يصنع فرقا كبيرا.

إنها عاقبة مباشرة لطريقة هيكلة بيانات التدريب.

### لماذا prompts النظام وحدها لا تعمل

لا تحوي بيانات تدريب Discord-Dialogues إلا أدوار `user`/`assistant`. لا يوجد **أي مثال لدور نظام** في طقم التدريب. لم يُدرَّب النموذج أبدا على اتباع prompts النظام كتوجيهات أسلوب.

وعندما نعطيه prompt نظام من نوع «اسمك Luna، تكلمي بارتياح»، يسمع التعليمات لكن لا يملك نمطا مُتعلَّما صلبا لترجمتها إلى مخرجات. فيسقط على سلوك Qwen الافتراضي : خدوم ومنظم ورسمي بعض الشيء.

### لماذا تعمل أمثلة few-shot

عندما نحقن أمثلة محادثة بنفس صيغة ChatML المستخدمة في التدريب (مع بنية أدوار `user`/`assistant`)، يتحفز شيء ما. يتعرف النموذج على النمط من تدريبه ويوائم مخرجاته تبعا لذلك.

إليكم كيف يبدو تمهيد few-shot عمليا :

```yaml
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

تُحقن هذه الأمثلة بعد prompt النظام وقبل المحادثة الحقيقية. يدركها النموذج كجزء من سجل المحادثة، أي كتبادل حقيقي بدلا من تعليمات. إنه تمييز أساسي : نُريه كيف تبدو النبرة المريحة بدلا من أن نأمره بها.

### قبل / بعد

دون تمهيد few-shot (prompt نظام عارٍ) :

```
User: yo whats good
Bot: Hello! I am doing well, thank you for asking. How can I assist you today?
```

مع تمهيد few-shot (3 أمثلة) :

```
User: yo whats good
Bot: nm just chillin, u
```

الفرق صارخ. يتبنى النموذج السجل كله : حروف صغيرة واختصارات ونبرة مريحة وردود قصيرة. يحاكي أسلوب الأمثلة بدلا من أسلوب بيانات تدريب Qwen.

---

## الذاكرة والسرعة : الأرقام الملموسة

يجلب الانتقال من Hermes-3-3B إلى Luna-Protocol-1.5B مكاسب قابلة للقياس :

| المقياس | Hermes-3-3B Q8_0 | Luna-Protocol Q4_K_M | التحسن |
|--------|-------------------|----------------------|-------------|
| استخدام VRAM | ~3 Go | ~986 Mo | **أقل بـ67%** |
| حجم ملف النموذج | ~3,2 Go | ~986 Mo | **أصغر بـ69%** |
| توليد الرموز | ~30 tok/s | ~60+ tok/s | **أسرع بمرتين** |
| الإقلاع البارد | ~8s | ~3s | **أسرع بـ62%** |
| نافذة السياق | 8192 | 8192 | متطابقة |

### لماذا مكسب السرعة حقيقي

النماذج الأصغر أسرع جوهريا في الاستدلال. مع 1,5B معامل بدلا من 3B :

- **ضرب مصفوفات أقل** لكل رمز : طبقات الانتباه وطبقات FFN وإسقاط المخرجات تتدرج كلها خطيا مع عدد المعاملات
- **استخدام أفضل للكاش** : النموذج الأصغر يُبقي المزيد من أوزانه في كاش L2/L3
- **ضغط أقل على عرض نطاق الذاكرة** : بايتات أقل تُقرأ من VRAM لكل رمز

على إعداد متواضع، CPU وحده (نواتان، دون GPU)، يولد نموذج 1,5B الرموز بسرعة **ضعفي** سرعة نموذج 3B تقريبا. إنه الفرق بين «تفوح منه رائحة البوت» و«يبدو شخصا حقيقيا يكتب».

### كاش الـprompt يضخّم الميزة

يستخدم Luna Protocol خادم `llama-server` مع تفعيل كاش الـprompt (`--cache-reuse 256`). وهذا يعني أن :

1. أول رسالة في جلسة تدفع Kost الكامل لمعالجة الـprompt (prompt النظام + أمثلة few-shot + رسالة المستخدم)
2. الرسائل التالية لا تعالج إلا الرموز *الجديدة*، لأن البادئة المخزنة يُعاد استخدامها
3. مع 5 أمثلة few-shot (~50-150 token)، يصبح العبء الإضافي مهملا بعد أول طلب

تصبح أمثلة few-shot عمليا "مجانية" بعد أول رسالة في جلسة. يستفيد النموذج من توجيه أسلوبي بـkost هامشي معدوم.

---

## التنفيذ : كيف يعمل في الكود

نظام few-shot في Luna Protocol نظيف وبسيط. ثلاثة ملفات تدير كل شيء.

### 1. الإعداد (`config.yml`)

```yaml
few_shot_enabled: true
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
  - user: "whats up"
    assistant: "yooo not much, what about you"
  - user: "how was your day"
    assistant: "it was alright, nothing crazy happened lol"
```

الإعداد قابل لإعادة التحميل حيا. نعدّل الأمثلة ونسجّل، فيتبنى البوت فورا الأسلوب الجديد، دون إعادة تشغيل.

### 2. الصياغة والحقن (`src/core/few-shot.ts`)

تحوّل الدالة `formatFewShotExamples()` أمثلة YAML إلى كائنات رسائل ChatML :

```typescript
export function formatFewShotExamples(
  examples: FewShotExample[],
  username = "user"
): Array<{ role: "user" | "assistant"; content: string }> {
  const messages = [];
  for (const example of examples) {
    messages.push({ role: "user", content: `${username}: ${example.user}` });
    messages.push({ role: "assistant", content: example.assistant });
  }
  return messages;
}
```

وتضعها الدالة `injectFewShotIntoConversation()` بعد prompt النظام مباشرة :

```typescript
export function injectFewShotIntoConversation(
  messages: Message[],
  fewShotMessages: Message[]
): Message[] {
  const systemMessage = messages[0];
  const userMessages = messages.slice(1);
  return [systemMessage, ...fewShotMessages, ...userMessages];
}
```

### 3. التكامل (`src/core/llm-client.ts`)

قبل كل استدعاء للـLLM، تُحقن أمثلة few-shot إذا فُعّلت :

```typescript
let finalMessages = messages;
if (FEW_SHOT_ENABLED && FEW_SHOT_EXAMPLES.length > 0) {
  const fewShotMessages = formatFewShotExamples(FEW_SHOT_EXAMPLES);
  finalMessages = injectFewShotIntoConversation(messages, fewShotMessages);
}
```

يستلم النموذج : `[prompt_النظام] + [أمثلة_few_shot] + [سجل_المحادثة]`

---

## الحفاظ على أسلوب Discord-Dialogues

لطقم البيانات الأصلي Discord-Dialogues بصمة محادثية شديدة الخصوصية :

- **رسائل قصيرة** : 32,8 token في المتوسط لكل دور
- **سجل غير رسمي** : اختصارات وحروف صغيرة وغياب ترقيم
- **تبادلات سريعة** : عدة تبادلات قصيرة بدلا من مونولوغات طويلة
- **عيوب طبيعية** : أخطاء مطبعية و«lol» و«fr» و«ngl» و«tbh»

يحفظ نموذج Luna Protocol هذا الأسلوب بآليتين :

### 1. الضبط ينقل التوزيع الأساسي

تعلّم عينات التدريب الـ50k النموذج **البصمة الإحصائية** لمحادثات Discord. يتعلم أن الردود قصيرة عادة وصغيرة وغير رسمية. وهذا يبعد المخرجات الافتراضية للنموذج عن وضع «المساعد الخدوم» لـQwen.

### 2. التمهيد few-shot يقفل النتيجة

تعزز أمثلة few-shot بالضبط الأنماط المُتعلَّمة أثناء الضبط. تعمل كـ**مرساة أسلوبية** : حتى لو انحرف النموذج قليلا نحو نبرة أكثر رسمية أثناء محادثة طويلة، تعيده الأمثلة الحاضرة في السياق إلى الخلف.

التركيبة أقوى من كل آلية منفردة :
- ضبط دون few-shot : النموذج مريح *عموما* لكن غير متسق
- few-shot دون ضبط : النموذج يحاول اتباع الأمثلة لكن يسقط باستمرار في وضع المساعد
- ضبط + few-shot : النموذج يبقى **باستمرار** في الشخصية

---

## الفلسفة : نموذج أصغر، prompting أذكى

تقول الحكمة التقليدية في نشر LLM "الأكبر أفضل". معاملات أكثر وبيانات تدريب أكثر وVRAM أكثر. يسلك Luna Protocol الطريق المعاكس :

- **1,5B بدلا من 3B** : نصف المعاملات، ونصف الذاكرة، وسرعة مضاعفة
- **50k عينة بدلا من 7,3M** : بيانات تدريب أقل، ومرونة أكثر للتعلم في السياق
- **تمهيد few-shot بدلا من prompts النظام** : إظهار ما نريد للنموذج، لا مجرد قوله له

إنه خيار تصميم مفترض، أكثر بكثير من مجرد تحسين تقني. بوت Discord يحتاج أن يبقى رفيق محادثة خفيفا بدلا من مساعد عام. يجب أن يقول «nm just chillin, u» باتساق وسرعة، ودون ابتلاع كل ميزانية VRAM للخادم.

النتيجة : بوت يعمل على VPS بـ5 $/شهر، ويولد الرموز بسرعة كافية لإعطاء انطباع كتابة في الوقت الحقيقي، ويحافظ على شخصية متسقة بتركيبة ضبط وتمهيد few-shot تساوي أكثر من مجموع أجزائها.

---

## الإعداد

### تنزيل النموذج

```bash
npm run download-model
# تحميل Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf
```

أو يدويا من [HuggingFace](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues).

### الإعداد

```yaml
# config.yml
llama_model_path: "./models/Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf"
few_shot_enabled: true
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

### التشغيل

```bash
npm run dev                    # تطوير (إعادة تحميل حية)
npm run build && npm start     # إنتاج
./start.sh                     # PM2 (إنتاج مع llama-server)
```

---

## الخلاصة

تثبت نماذج Luna Protocol أنه لذكاء اصطناعي محادثي متمحور على الأسلوب، **الأقل أفضل**. نموذج 1,5B مُدرَّب على 50k عينة مختارة بعناية، وممهَّد ببضعة أمثلة، يتفوق على نموذج 3B مُدرَّب على ملايين الأمثلة، بجزء من kost الذاكرة وسرعة توليد مضاعفة.

يشكل التمهيد few-shot الآلية المركزية للنماذج الصغيرة. إنه ما يجعلها قابلة للحياة لتطبيقات محادثة في الوقت الحقيقي. تفعل الأمثلة أكثر بكثير من "المساعدة" : إنها تغير جوهريا سلوك النموذج، بمحاكاة الصيغة التي دُرّب عليها بالضبط.

الكود مفتوح المصدر، والنموذج على HuggingFace، وطقم البيانات عام. إذا أردت بناء بوت محادثي يعطي انطباع الإنسان، فالوصفة هي : نموذج صغير، وضبط محدود، وتمهيد few-shot صلب.

| المورد | الرابط |
|----------|------|
| مستودع GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| النموذج (HuggingFace) | [fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) |
| طقم البيانات | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| المقال الأول | [Luna Protocol : أنشأت بوت Discord مستقلا](/articles/en/luna-protocol-discord-bot) |
