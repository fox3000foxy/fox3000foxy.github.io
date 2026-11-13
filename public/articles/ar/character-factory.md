---
title: "بناء character-factory : أفاتار بجينات"
description: "وحدة TypeScript فوق DiceBear : توليد متسق حسب البلد/العرق، محرك
  جينات صغير لإسقاط الأطفال، وتفاصيل الهندسة التي جعلته قابلا للاستخدام في لعبة ورق."
date: 2026-05-16
aiGenerated: true
tags:
  - typescript
  - npm
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "GZu4IVUJzV8nIK4J3F4DdFDa+e9zsb0xGKE6PSXI6wsMRjHL0LFpvHWxV6P+SBEd02tGtkXU1M/azs0Ytk7LAA=="
---

# بناء character-factory : أفاتار بنظام جيني

احتجت آلاف الأفاتار الموثوقة والمميزة لـ[Kurekuta](https://github.com/fox3000foxy/kurekuta/)، وهو مشروع لعبة ورق خاص حيث تحمل كل بطاقة "DNA" شخصية يحوّله محرك العرض إلى بورتريه. شراء حزمة جاهزة كان سيُرى. توليد أفاتار DiceBear بالـseed لكل شخصية أعطى أي شيء : بطاقة بعالم ياباني قد تقع على شقراء اسكندنافية، و"أخ وأخت" كانا يشبهان غريبين.

فكتبت [character-factory](https://github.com/fox3000foxy/character-factory)، وهي وحدة TypeScript فوق مجموعة Lorelei من DiceBear تضيف ثلاث مزايا لا يعطيها DiceBear وحده : **ملفات ديموغرافية متسقة**، و**محرك جينات صغير**، و**باني انسيابي** ممتع الاستخدام من حلقة لعبة.

## ما الذي يفعله

أصغر مقتطف مفيد :

```ts
import { CharacterFactory, Country, Mood } from "character-factory";

const svg = new CharacterFactory()
  .setCountry(Country.Japan)   // عرق موزون ← بشرة/شعر/قصة/لحية متسقة
  .setMood(Mood.Happy)
  .buildSvg();
```

هذه السلسلة البسيطة تسحب عرقا موزونا بالديموغرافيا اليابانية، وتسحب لون بشرة ولون شعر يتوافقان، وتختار قصة من المجموعة الفرعية الصحيحة للجنس، ثم تقفل العيون/الحاجبين/الفم على وضع "سعيد". النتيجة تخرج SVG أو، مع تثبيت `sharp`، PNG بأي حجم.

الشخصية ليست إلا كائن `CharacterConfig`، وجه وشعر وإكسسوارات وعرض. الباني يعدّله داخليا، ويمكنك تصديره JSON أو base64 أو ملفا، ثم إعادة تحميله كما هو. بالنسبة لـKurekuta هذا حاسم : البطاقة تخزن الإعداد، لا الصورة المعروضة. وهكذا يبقى الفن دائما قابلا لإعادة الإنتاج ويبقى حجم البطاقة ضئيلا.

## ملفات ديموغرافية متسقة، لا بكسل عشوائي

خيارات DiceBear منتقاة منتظمة. مرر `["#ffdbb4", "#2c1b18"]` للون البشرة وستحصل على أحدهما أو الآخر بنفس الاحتمال، جيد لشعار، وعديم الفائدة لـ"أعطني شخصية من البرازيل."

يضمّن `character-factory` خط أنابيب بلد ← عرق ← سمات :

```ts
// ما يوجد في الوحدة :
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
  hairColors: [/* غالبا أسود/بني غامق، لا أشقر */],
  hairCuts:   { male: [...], female: [...] },
  beardProbability: 0.15,
};
```

كل طبقة سحب موزون. الأوزان ليست أطروحة اجتماعية، بل استدلال يمنع "القادم من اليابان" من إنتاج أحمر و"القادم من السويد" من إنتاج أسود فاحم. كل خط الأنابيب يتلخص في استدعاء واحد : `setCountry(country)` أو `randomizeFromCountry(country, gender?)`.

## محرك جينات صغير

الدالة التي استمتعت بها أكثر : `projectChild`. يمكن لمصنعين إنتاج طفل تُورَّث سماته بدومينانس بيولوجية تقريبية :

```ts
const parentA = new CharacterFactory().setCountry(Country.Sweden);
const parentB = new CharacterFactory().setCountry(Country.Japan);
const kid     = parentA.projectChild(parentB.getConfig());
```

تحت الغطاء، نموذج صغير عمدا. كل والد يحمل نمطا جينيا بأليلين، واحد مسحوب من كل جهة، مدمج في سائد أو متنحٍ :

```ts
function combine(a: Allele, b: Allele): "dominant" | "recessive" {
  return a === "D" || b === "D" ? "dominant" : "recessive";
}
```

السمات ذات محور دومينانس حقيقي (بشرة، عيون، شعر) تُحل بقائمة مرتبة صريحة، الداكن يسود الفاتح، والعيون البنية/السوداء تسود الزرقاء، والأسود الفاحم يسود الأشقر :

```ts
const HAIR_DOMINANCE_ORDER = [
  HairColor.LightBlonde,   // الأكثر تنحيا
  HairColor.GoldenBlonde,
  HairColor.HoneyBlonde,
  HairColor.Auburn,
  HairColor.Red,
  HairColor.Copper,
  HairColor.LightBrown,
  HairColor.Brown,
  HairColor.DarkBrown,
  HairColor.SoftBlack,
  HairColor.JetBlack,      // الأكثر سيادة
] as const;
```

تجد `resolveByRank` فهرس كل والد، وتأخذ الأعلى على تركيبة أليلات "سائدة" والأدنى على "متنحية". ألوان الفانتازيا (وردي باستيل، ليلكي) ليست في الترتيب، بل تقوم بقرعة 50/50، وهو السلوك الصحيح : فهي ليست بيولوجية، لذا لا معنى للدومينانس.

النمش يصمم MC1R : 75% إذا كان لدى الوالدين، و25% إذا حملها واحد فقط، و0% إذا لم يحملها أحد. اللحية مرتبطة بـSRY : تُزال إذا كان الطفل أنثى، وإلا تُورَّث من الوالد الذي كانت لديه. قصة الشعر لا بيولوجيا فيها، بل خيار ثقافي، لذا يسحب الطفل من مجموعته الجندرية الخاصة، مع الحفاظ على الملمس إن أمكن.

لا شيء من هذا جينات تصلح للنشر. إنها طبقة إحساس : الأطفال يشبهون مزيجا معقولا لوالديهم، لا متوسط غريبين.

## الأجزاء الهندسية الأقل بريقا التي كانت مهمة

بعض التفاصيل قليلة الظهور لكنها استحقت مكانها في الـdiff :

**`pick` أكثر أمانا.** الأصلي كان يعيد `undefined` مصبوبا كـ`T` على مصفوفة فارغة. مع `strict` + `noUncheckedIndexedAccess` في TypeScript، هذه كذبة يوقعها المترجم. النسخة الجديدة ترمي `RangeError`، تُمسك فورا في موقع الاستدعاء بدلا من إنتاج props بقيمة `undefined` ثلاثة مستويات أدناه.

**`deepMerge` لا يفسد المصفوفات.** التكرار القديم كان ينشط بمجرد أن تكون القيمة المصدر كائنا، حتى لو كان الهدف `null` أو مصفوفة. `merge({tags: ["a"]}, {tags: ["b"]})` كان ينتج `{tags: {0: "b"}}`. النسخة الجديدة لا تعيد التكرار إلا عندما يكون الطرفان كائنين بسيطين.

**عرض دفعي بالتوازي.** كان `batchFactory` يعرض الـPNG في حلقة متسلسلة، فتصدير 1000 بطاقة كان يستغرق دهورا. صار الآن مجموعة workers بتزامن قابل للضبط (4 افتراضيا)، تحفظ ترتيب النتائج بالكتابة في مصفوفة مسبقة الأبعاد :

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

في تصدير 1000 شخصية، حول هذا استراحة قهوة إلى "هل انتهى فعلا ؟"

**رسالة خطأ `sharp` تقول شيئا.** يستورد `buildPng` مكتبة `sharp` بكسل لأنها تبعية اختيارية لا تريد فرضها على مستخدمي SVG-only. الـcatch القديم كان يبتلع الخطأ الحقيقي ويقول دائما "sharp is required." فإذا كان الفشل الحقيقي تعارض إصدار أو مشكلة bindings أصلية، قضيت عشر دقائق تعيد تثبيت حزمة مثبتة فعلا. النسخة الجديدة تطلب التثبيت دائما، لكنها تضمّن الخطأ الكامن.

## التالي

الوحدة في 1.1.1 على [مستودع character-factory](https://github.com/fox3000foxy/character-factory). المحرك الجيني هو المكان المثالي لمواصلة التكرار، فلا توجد بعد سلسلة اختبارات، لذا ثوابت الاتساق ("شخصية برازيلية من أصل شرق آسيوي لن تملك أبدا عيونا سوداء فاحمة مع شعر بلاتيني") لا يضمنها إلا الأوزان. إضافة `bun test` أو `vitest` وكتابة اختبار اتساق يشغّل عشرة آلاف `randomizeFromCountry` لكل بلد، هي الخطوة التالية.

Kurekuta نفسه خاص حاليا، لكن كل بطاقة ستراها فيه يوما ما ليست إلا blob من `CharacterConfig` واستدعاء `buildPng()` من الوجود.
