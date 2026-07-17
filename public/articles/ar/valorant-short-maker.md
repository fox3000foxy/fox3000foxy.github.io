---
title: "valorant-short-maker: البنية التي تولد Shorts Valorant الخاصة بي تلقائياً"
description: "Groq/Llama للكتابة، Piper للأصوات، FFmpeg لكل شيء آخر. كيف ينتج cron job وينشر فيديو يومياً على @valorant_agents، من الألف إلى الياء."
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "uoR165wfdpZiTWnlO4s0OuAc/6QlRj7BLuYs8kJA4TX6ik9GNeWR8C97jWovxyeZzE6ta+VH2cTJhRejozoViQ=="
---

# valorant-short-maker: البنية التي تولد Shorts Valorant الخاصة بي تلقائياً

منذ بضعة أشهر، هناك قناة يوتيوب تعمل دون أن ألمسها: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop). عملاء Valorant يتناقشون بين الجولات، مدبلجين، مع ترجمة كاريوكي، منشورين كـ Shorts. كل شيء يولده [`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker)، بنية TypeScript/Bun تعمل بـ cron وتنشر دون أن يضطر أحد للنقر على أي شيء.

إليكم كيف يعمل، خطوة بخطوة.

## النتيجة

ثلاث إطارات مأخوذة من الفيديو المولد لـ "Duelist Debate" (Phoenix، Yoru، و Jett):

![مقدمة Short، دائرة العميل مع عنوان المشهد](/images/valorant-short-maker/vsm-01-intro.png)

![جملة حوار جارية، ترجمة كاريوكي تضيء](/images/valorant-short-maker/vsm-02-dialogue.png)

![جملة أخرى، لون الترجمة يتغير حسب العميل المتحدث](/images/valorant-short-maker/vsm-03-dialogue.png)

النتيجة المباشرة على هذا الـ Short: [Duelist Debate -- youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU). على القناة، تدور الـ Shorts حول 1.2 إلى 1.5 ألف مشاهدة. لا شيء ضخم، لكنها قناة تعمل بمفردها منذ البداية، لذا الرقم المهم حقاً هو صفر -- صفر دقيقة قضيتها عليها منذ تشغيل cron.

## البنية، بالترتيب

### 1. كتابة النص -- Groq + Llama 3.3

كل دورة تختار عشوائياً 3 إلى 4 عملاء من أصل 26 متاحاً، وترسل إلى Llama 3.3 70B (عبر Groq) توجيهاً نظامياً يحتوي، لكل عميل مختار، على ملخص مدمج لشخصيته وعلاقاته مع العملاء الآخرين الموجودين في المشهد (هذه الشخصيات تعيش في `src/lore/`، ملف لكل عميل). يفرض التوجيه قواعد صارمة: جملة قصيرة وقوية لكل سطر، تناوب عادل بين الشخصيات، الفكاهة أولاً، وقبل كل شيء الوقفات.

مثال ملموس مع "Duelist Debate" -- Phoenix، Yoru، و Jett يتجادلون حول من سيلعب duelist، تم توليده في 6 يوليو 2026:

```
phoenix: I'm telling you, I've got the skills to play duelist this match.
yoru: Skills, you call burning things skills, Phoenix.
jett: I'm the fastest one here, I should play duelist.
phoenix: Fastest, but can you handle the heat, Jett [0.3] I doubt it.
yoru: Heat, ha, you think your flames are hotter than my rifts.
jett: This isn't about heat or flames, it's about speed and agility.
phoenix: Oh, I see, so now you're an expert on duelists, Yoru [0.3] that's rich.
yoru: At least I don't rely on cheap fire tricks.
jett: Cheap fire tricks, that's what you call Phoenix's abilities.
phoenix: Hey, my fire tricks have gotten us out of tight spots before [0.3] can't say the same for your rifts, Yoru.
yoru: Tight spots, you mean like the time I rifted us out of that trap.
jett: Enough, this is getting nowhere, let's just decide already.
phoenix: Fine, but I'm still saying I'm the best duelist here.
yoru: Please, you think you can take on the enemy team alone [0.3] I doubt it.
jett: I can take them on, no problem, I'm the fastest.
phoenix: Fastest, yeah, but can you outmaneuver them [0.3] that's the question.
yoru: Outmaneuver, ha, you think you can outmaneuver anyone, Phoenix.
jett: This is stupid, we're not going to agree on this.
phoenix: Fine, let's just play and see who comes out on top [0.3] I'm game if you are.
yoru: Bring it on, I'll show you what a real duelist looks like.
jett: I'm not backing down, I'm playing duelist.
phoenix: Oh, this should be good [0.3] let's see how you two do.
yoru: We'll see who comes out on top, won't we, Jett.
jett: Yeah, let's end this debate once and for all.
pause: 0.3
phoenix: Alright, let's get started then [0.3] may the best duelist win.
yoru: I'll make sure to burn you, Phoenix, not with fire, but with my rifts.
jett: I'll take you both down, no problem.
```

الوقفات هي التفصيل الذي يجعل الإيقاع طبيعياً: `[0.3]` المدرج في منتصف الجملة يخلق صمتاً لمدة 0.3 ثانية في الصوت دون قطع دائرة العميل على الشاشة، بينما سطر `pause: 1.0` المستقل يخلق صمتاً حقيقياً بين متحدثين اثنين، الدائرة مخفية. بدون ذلك، TTS الذي يسرد الجمل دون توقف يبدو آلياً.

### 2. إعطاء صوت -- Piper، نموذج لكل عميل

كل عميل لديه نموذج Piper (`.onnx`) الخاص به والمدرّب خصيصاً، مخزن في `voices/<agent>/`. النص المولد يمر عبر النموذج المناسب، الذي يخرج ملف WAV. إنها نفس التقنية التي أستخدمها لتدريب الأصوات المخصصة بشكل عام (انظر المقال حول بنية Piper/Kaggle) -- هنا مطبقة مباشرة في الإنتاج، بشكل فوري، عند كل توليد فيديو.

### 3. ترجمة كاريوكي -- ASS مولد، لون مستخرج من الأيقونة

الترجمة ليست مجرد `.srt`. إنها ملف `.ass` (Advanced SubStation Alpha) مولد كلمة بكلمة، بتأثير كاريوكي: كل كلمة تضيء بلون أثناء نطقها، بينما يبقى باقي النص بلون محايد. لون التمييز ليس ثابتاً -- يتم استخراجه ديناميكياً من أيقونة العميل المتحدث (سكريبت Python يشغل PIL على PNG الأيقونة، يعيّن البكسلات غير الشفافة، ويعيد الألوان السائدة). النتيجة: ترجمة Killjoy تضيء بالبنفسجي، وترجمة Jett بالأزرق المخضر، دون أن يتم ترميز أي لون بشكل ثابت في أي مكان.

### 4. الدائرة المتفاعلة مع الصوت -- تعبير FFmpeg لكل إطار

هذا هو الجزء الأكثر تعقيداً في البنية، وربما الأكثر فخراً به. الأيقونة الدائرية للعميل المتحدث لا تبقى ثابتة: إنها تكبر وتصغر قليلاً على إيقاع صوته.

الحساب يقرأ WAV الخام للجملة، ويحسب غلاف RMS (جذر متوسط المربعات، مقياس لطاقة الإشارة) إطاراً إطاراً بمعدل 60 إطاراً في الثانية، يعيّره بالنسبة للقيمة القصوى، ثم ينعمه على نافذة من 3 إطارات لتجنب الاهتزاز. كل قيمة غلاف تُحول بعد ذلك إلى عامل مقياس محدد بـ `MAX_ZOOM_VARIATION` (0.2، أي ±20% حول الحجم الأساسي).

نتيجة هذا الحساب لا تُطبق عبر كود يتلاعب بالبكسلات -- بل تُترجم إلى تعبير شرطي FFmpeg ضخم (`lt(n,K)*val + between(n,K,K')*val + ...`، فرع لكل مجموعة إطارات) يقود مباشرة معامل `scale` لمرشح الفيديو. FFmpeg يقيم هذا التعبير في كل إطار من العرض. لجملة من بضع ثوانٍ بمعدل 60 إطاراً في الثانية، سرعان ما يصبح هناك مئات الفروع في تعبير واحد -- ومن هنا يأتي معامل `STEP` الذي يجمع الإطارات للحد من العمق.

### 5. العرض لكل مقطع، ثم تأثير عين السمكة على المقدمة

كل جملة تُعرض بشكل فردي: خلفية فيديو (مقطع لعب عشوائي من `bg-video/`، مقصوص للمدة المناسبة)، دائرة العميل فوقها مع تكبير متفاعل مع الصوت، الترجمة مدمجة عبر مرشح `ass` في FFmpeg، صوت TTS ممزوج بصوت اللعب في الخلفية.

المقطع الأول يتلقى معالجة خاصة: تشويه عين السمكة يتلاشى تدريجياً على أول 20% من الإطارات (مرشح `lenscorrection` يُقيم إطاراً إطاراً، بالإضافة إلى `tmix=frames=3` الذي يمزج الإطارات المتجاورة لمحاكاة ضبابية الحركة)، متزامناً مع صوت "whoosh". هذا هو انتقال المقدمة الذي يعطي انطباعاً بأن الكاميرا "تدخل" المشهد.

### 6. التوصيل والمزج النهائي

جميع المقاطع موصولة من البداية إلى النهاية، الموسيقى الخلفية (Sneaky Snitch، Kevin MacLeod، رخصة Creative Commons) تُمزج فوقها مع **audio ducking** -- ضغط جانبي يخفض تلقائياً مستوى صوت الموسيقى أثناء حديث العميل، ويرفعه أثناء فترات الصمت. كل شيء يعمل بمعدل 60 إطاراً في الثانية من البداية إلى النهاية، دون أي تحويل لمعدل الإطارات بين المراحل.

### 7. النشر التلقائي

سكريبت `run-cron.sh`، الذي يشغله cron عادي، ينشط بيئة Python، يحمل `.env`، ويشغل `bun src/workflow.ts --upload`. العلم `--upload` يشغل بالإضافة إلى ذلك توليد البيانات الوصفية (العنوان، الوصف، الوسوم) ويستدعي `uploaders/upload.py`، الذي ينشر الفيديو على YouTube و Instagram عبر سكريبتين منفصلين (`uploaders/youtube/upload.py` و `uploaders/instagram/`). السلسلة بأكملها، من توجيه LLM إلى الفيديو على الإنترنت، تعمل دون تدخل بشري.

## لماذا TypeScript/Bun بدلاً من Python بالكامل

الاختيار ليس أيديولوجياً -- بل لأن Bun يتيح وصولاً مباشراً وسريعاً إلى `Bun.spawn` لتحكم في FFmpeg كعملية فرعية، وتنميطاً قوياً على هياكل بيانات البنية (`Phrase`، `SegmentInfo`)، وبيئة تشغيل أسرع بكثير في البدء من Node لسكريبت يعمل بـ cron كل بضع ساعات. القطعتان الوحيدتان من Python في المشروع هما حيث Python هي الأداة الأفضل فعلاً: PIL لاستخراج الألوان، وواجهات API للنشر (`google-api-python-client` لـ YouTube، وInstagram Graph API لـ IG).

## ما يوضحه هذا

هذا المشروع مثال جيد على ما يمكن بناؤه اليوم بمكونات مجانية بالكامل أو مفتوحة المصدر: LLM سريع ومجاني عبر Groq API، محرك TTS محلي يعمل بدون GPU مخصص، FFmpeg لكل عرض الفيديو -- والرابط بينها ليس سوى بضع مئات من أسطر TypeScript. لا شيء من هذه المكونات جديد بمفرده. ما يصنع البنية هو التنسيق: توليد نص متماسك بعلاقات شخصيات حقيقية، تحويله إلى صوت معبر بوقفات طبيعية، مزامنة عرض مرئي مع طاقة ذلك الصوت إطاراً بإطار، وأتمتة السلسلة بأكملها حتى النشر.

---

**الموارد**

- **المستودع**: [github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **القناة**: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**3 نقاط رئيسية**

1. النص يولده LLM (Groq/Llama 3.3) بشخصيات وعلاقات خاصة بكل عميل، وليس مجرد قائمة نكات مكتوبة مسبقاً.
2. تكبير دائرة العميل يُدار بتعبير FFmpeg يُحسب إطاراً بإطار من غلاف RMS لـ WAV -- ليس تحريكاً تقليدياً بـ keyframes.
3. السلسلة بأكملها، من التوجيه إلى منشور YouTube/Instagram، تعمل عبر cron job واحد دون أي تدخل بشري.
