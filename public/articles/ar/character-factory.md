---
title: "بناء character-factory: صور رمزية بعلم الوراثة"
description: "وحدة TypeScript فوق DiceBear: توليد متسق حسب البلد/العرق،
  محرك وراثي صغير لإسقاط الأطفال، وتفاصيل هندسية جعلته قابلًا
  للاستخدام في لعبة ورق."
date: 2026-05-16
aiGenerated: true
authors:
  - fox3000foxy
tags:
  - typescript
  - npm
  - open-source
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "rWqNWOHuh5TEojXkosdYplkpfT8BIXmEDv9IRzjJTUgPhEgj1yvJ99i60Liegbhc2QxZxX1BRe3mJ8ywBALdvA=="
---

# بناء character-factory: صور رمزية بنظام وراثي

كنت بحاجة لآلاف الصور الرمزية المعقولة والمتميزة من أجل [Kurekuta](https://github.com/fox3000foxy/kurekuta/) -- مشروع لعبة ورق خاص حيث كل بطاقة تحتوي على "حمض نووي" للشخصية يحوله محرك التصيير إلى صورة شخصية. شراء حزمة جاهزة كان سيكون مكشوفًا. توليد صور DiceBear عشوائيًا لكل شخصية كان ينتج فوضى: بطاقة بطابع ياباني قد تظهر بشخصية شقراء إسكندنافية، وشخصيتان "أخ وأخت" كانتا تبدوان كغرباء.

لذا كتبت [character-factory](https://github.com/fox3000foxy/character-factory) -- وحدة TypeScript فوق مجموعة Lorelei من DiceBear توفر ثلاث ميزات لا يوفرها DiceBear وحده: **ملفات ديموغرافية متسقة**، **محرك وراثي صغير**، **وسيط بناء سلس** سهل الاستخدام من حلقة اللعبة.

## ما الذي يفعله

أصغر مقطع مفيد:

```ts
import { CharacterFactory, Country, Mood } from "character-factory";

const svg = new CharacterFactory()
  .setCountry(Country.Japan)   // عرق مرجح → بشرة/شعر/قصة/لحية متسقة
  .setMood(Mood.Happy)
  .buildSvg();
```

هذه السلسلة البسيطة تختار عرقًا مرجحًا حسب الديموغرافيا اليابانية، تسحب لون بشرة ولون شعر متناسبين، تختار قصة شعر من المجموعة الفرعية الصحيحة حسب الجنس، ثم تثبت العيون/الحواجب/الفم على وضع "سعيد". النتيجة تخرج بصيغة SVG أو، مع تثبيت `sharp`، بصيغة PNG بأي حجم.

الشخصية هي مجرد كائن `CharacterConfig` -- الوجه، الشعر، الإكسسوارات، المظهر. يعدله وسيط البناء داخليًا، ويمكنك تصديره بصيغة JSON أو base64 أو ملف، ثم إعادة تحميله كما هو. بالنسبة لـ Kurekuta هذا أمر حاسم: البطاقة تخزن الإعدادات، وليس الصورة المصيرة. وبالتالي يكون الفن دائمًا قابلًا لإعادة الإنتاج ويظل حجم البطاقة صغيرًا جدًا.

## ملفات ديموغرافية متسقة، لا بكسلات عشوائية

خيارات DiceBear هي محددات موحدة. مرر `["#ffdbb4", "#2c1b18"]` للون البشرة وستحصل على أحدهما بنفس الاحتمال -- جيد لشعار، لكنه عديم الفائدة لعبارة "أعطني شخصية من البرازيل."

يحتوي `character-factory` على أنبوب بلد → عرق → سمات:

```ts
// ما يوجد في الوحدة:
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
  hairColors: [// خاصة أسود/بني غامق، لا أشقر],
  hairCuts:   { male: [...], female: [...] },
  beardProbability: 0.15,
};
```

كل طبقة هي سحب مرجح. الأوزان ليست أطروحة اجتماعية -- إنها استدلال يمنع "قادم من اليابان" من إنتاج شخص أحمر الشعر و"قادم من السويد" من إنتاج شخص أسود حالك. أنبوب العمل بأكمله يختزل في استدعاء واحد: `setCountry(country)` أو `randomizeFromCountry(country, gender?)`.

## محرك وراثي صغير

الوظيفة الأكثر متعة في الكتابة: `projectChild`. يمكن لوسيطي بناء إنتاج طفلة ترث الصفات مع هيمنة بيولوجية تقريبية:

```ts
const parentA = new CharacterFactory().setCountry(Country.Sweden);
const parentB = new CharacterFactory().setCountry(Country.Japan);
const kid     = parentA.projectChild(parentB.getConfig());
```

تحت الغطاء، هو نموذج صغير عمدًا. كل والد يحمل نمطًا جينيًا من أليلين، واحد من كل جانب، يجمع إلى سائد أو متنحٍ:

```ts
function combine(a: Allele, b: Allele): "dominant" | "recessive" {
  return a === "D" || b === "D" ? "dominant" : "recessive";
}
```

الصفات التي لها محور هيمنة حقيقي (البشرة، العيون، الشعر) تُحل بقائمة مرتبة صريحة -- الداكن يهيمن على الفاتح، العيون البنية/السوداء تهيمن على الزرقاء، الأسود حالك يهيمن على الأشقر:

```ts
const HAIR_DOMINANCE_ORDER = [
  HairColor.LightBlonde,   // الأكثر تنحيًا
  HairColor.GoldenBlonde,
  HairColor.HoneyBlonde,
  HairColor.Auburn,
  HairColor.Red,
  HairColor.Copper,
  HairColor.LightBrown,
  HairColor.Brown,
  HairColor.DarkBrown,
  HairColor.SoftBlack,
  HairColor.JetBlack,      // الأكثر هيمنة
] as const;
```

`resolveByRank` يجد ترتيب كل والد، ويأخذ الأعلى على تركيبة أليلات "سائدة" والأدنى على "متنحية". الألوان الخيالية (وردي باستيل، أرجواني) ليست في الترتيب -- تخضع للقرعة 50/50، وهو السلوك الصحيح: ليست بيولوجية، لذا الهيمنة لا معنى لها.

النمش يمثل MC1R: 75٪ إذا كان كلا الوالدين لديه نمش، 25٪ إذا كان واحد فقط يحمله، 0٪ إذا لم يكن لأي منهما. اللحية مرتبطة بـ SRY: تُزال إذا كانت الطفلة أنثى، وإلا تُورث من الوالد الذي كان لديه لحية. قصة الشعر ليست بيولوجية -- إنها اختيار ثقافي، لذا تختار الطفلة من مجموعتها حسب الجنس، مع الحفاظ على الملمس إن أمكن.

لا شيء من هذا هو علم وراثة يستحق النشر. إنها طبقة إحساس: يشبه الأطفال مزيجًا معقولًا من والديهم، لا متوسط شخصين غريبين.

## الجوانب الهندسية الأقل بريقًا التي كانت مهمة

بعض الأشياء غير المبهرجة ولكنها استحقت مكانها في التعديل:

**`pick` أكثر أمانًا.** الأصلية كانت تُرجع `undefined` م coerced إلى `T` على مصفوفة فارغة. مع `strict` + `noUncheckedIndexedAccess` في TypeScript، هذه كذبة يوقعها المترجم. النسخة الجديدة ترمي `RangeError` -- تُلتقط فورًا في موقع الاستدعاء بدل إنتاج خصائص `undefined` على عمق ثلاثة مستويات.

**`deepMerge` لا يفسد المصفوفات.** التكرار القديم كان ينشط بمجرد أن تكون القيمة المصدر كائنًا، حتى لو كان الهدف `null` أو مصفوفة. `merge({tags: ["a"]}, {tags: ["b"]})` كان يُنتج `{tags: {0: "b"}}`. النسخة الجديدة لا تتكرر إلا عندما يكون كلا الجانبين كائنات بسيطة.

**تصيير دفعي متوازي.** `batchFactory` كان يصير PNG في حلقة تسلسلية -- تصدير 1000 بطاقة كان يستغرق وقتًا طويلاً. الآن هو تجمع عمال مع توازٍ قابل للتكوين (4 افتراضيًا)، يحافظ على ترتيب النتائج بالكتابة في مصفوفة مسبقة الأبعاد:

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

على تصدير 1000 شخصية، حوّل هذا استراحة القهوة إلى "هل انتهى بالفعل؟"

**رسالة خطأ `sharp` ذات معنى.** `buildPng` يستورد `sharp` بشكل كسول لأنه تابع اختياري لا تريد فرضه على مستخدمي SVG-only. القديم كان يبتلع الخطأ الحقيقي ويقول دائمًا "sharp is required." إذا كان الفشل الحقيقي تعارض إصدار أو مشكلة ربط أصلي، كنت تقضي عشر دقائق تعيد تثبيت شيء مثبت بالفعل. النسخة الجديدة تخبرك دائمًا بتثبيته، لكنها تتضمن الخطأ الأساسي.

## الخطوات القادمة

الوحدة في الإصدار 1.1.1 على [مستودع character-factory](https://github.com/fox3000foxy/character-factory). المحرك الوراثي هو المكان المثالي لمواصلة التطوير -- لا توجد مجموعة اختبارات بعد، لذا فإن ثوابت الاتساق ("شخصية برازيلية من أصل شرق آسيوي لن يكون لها أبدًا عيون سوداء حالكة مع شعر بلاتيني") مضمونة فقط بالأوزان. إضافة `bun test` أو `vitest` وكتابة اختبار اتساق يشغل عشرة آلاف `randomizeFromCountry` لكل بلد، هي الخطوة التالية.

Kurekuta نفسه خاص حاليًا، لكن كل بطاقة ستراها فيه يومًا ما ليست سوى blob `CharacterConfig` واحدة و`buildPng()` واحدة لتصبح موجودة.
