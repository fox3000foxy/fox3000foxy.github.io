---
title: "valorant-short-maker : خط الأنابيب الذي يولّد Shorts Valorant الخاصة بي وحده"
description: "Groq/Llama للسكربت، وPiper للأصوات، وFFmpeg لكل الباقي. كيف ينتج cron job وينشر فيديو يوميا على @valorant_agents، من الألف إلى الياء."
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "w+/5ipicODWkYlmmWWtKV8mlbg1AGLUnhfmEuduVr7G6v4tuMAlukf3m4VNxp6AY4di/34zTU0RiQvCvq/9pig=="
---

# valorant-short-maker : خط الأنابيب الذي يولّد Shorts Valorant الخاصة بي وحده

منذ أشهر، تعمل قناة YouTube دون أن ألمسها : [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop). وكلاء Valorant يتشاجرون بين جولتين، مدبلجون، ومترجمون بترجمة كاريوكي، ومنشورون كـShorts. كل شيء مولّد بواسطة [`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker)، وهو خط أنابيب TypeScript/Bun يعمل في cron وينشر دون أن يضغط أحد على أي شيء.

إليكم كيف يعمل، خطوة بخطوة.

## ما النتيجة

ثلاث لقطات مستخرجة من الفيديو المولّد لـ"Duelist Debate" (Phoenix وYoru وJett) :

![مقدمة short، دائرة وكيل مع عنوان المشهد](/images/valorant-short-maker/vsm-01-intro.png)

![رد جارٍ، ترجمة كاريوكي تضيء](/images/valorant-short-maker/vsm-02-dialogue.png)

![رد آخر، لون الترجمة يتغير حسب الوكيل](/images/valorant-short-maker/vsm-03-dialogue.png)

النتيجة مباشرة على هذا Short : [Duelist Debate -- youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU). على القناة، تدور الـShorts حول 1,2 إلى 1,5k مشاهدة. لا شيء ضخم، لكنها قناة تعمل وحدها منذ البداية، لذا الرقم الذي يهم فعلا هو صفر، صفر دقيقة تُقضى عليها بمجرد إطلاق الـcron.

## خط الأنابيب، بالترتيب

### 1. كتابة السكربت -- Groq + Llama 3.3

كل تشغيل يسحب 3 إلى 4 وكلاء عشوائيا من 26 متاحا، ويرسل إلى Llama 3.3 70B (عبر Groq) prompt نظام يحوي، لكل وكيل مختار، ملخصا مضغوطا لشخصيته وعلاقاته مع الوكلاء الآخرين الحاضرين في المشهد (هذه الـpersonas تعيش في `src/lore/`، ملف لكل وكيل). يفرض الـprompt قواعد دقيقة : جملة قصيرة ومؤثرة لكل رد، وتناوب عادل بين الشخصيات، والفكاهة أولا، وقبل كل شيء فواصل.

مثال ملموس مع "Duelist Debate"، يتجادل Phoenix وYoru وJett لمعرفة من سيلعب duelist، مُولَّد في 6 يوليو 2026 :

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

الفواصل هي التفصيل الذي يجعل الإيقاع طبيعيا : `[0.3]` المُدخَل في وسط رد يخلق صمت 0.3s في الملف الصوتي دون قطع دائرة الوكيل على الشاشة، بينما سطر `pause: 1.0` كامل يخلق صمتا حقيقيا بين متكلمين، والدائرة مخفية. دون ذلك، TTS الذي يسلسل الردود دون تنفس يبدو آليا.

### 2. إعطاء صوت -- Piper، نموذج لكل وكيل

لكل وكيل نموذج Piper الخاص به (`.onnx`) مُدرَّب خصيصا، ومخزّن في `voices/<agent>/`. النص المولّد يمر في النموذج الموافق، فيخرج WAV. إنها نفس التقنية التي أستخدمها لتدريب الأصوات المخصصة عموما (انظر المقال عن خط أنابيب Piper/Kaggle)، هنا مطبقة مباشرة في الإنتاج، لحظيا، مع كل توليد فيديو.

### 3. ترجمة كاريوكي -- ASS مولّد، لون مستخرج من الأيقونة

الترجمة ليست مجرد `.srt`. إنها ملف `.ass` (Advanced SubStation Alpha) مولّد كلمة بكلمة، مع أثر كاريوكي : كل كلمة تضيء بلون كلما نُطقت، بينما يبقى بقية النص بلون محايد. لون التمييز ليس ثابتا، بل يُستخرج ديناميكيا من أيقونة الوكيل المتكلم (سكربت Python يشغّل PIL على PNG الأيقونة، ويعيّن البكسلات غير الشفافة، ويعيد الألوان السائدة). النتيجة : ترجمة Killjoy تضيء بالبنفسجي، وترجمة Jett بالأزرق المخضر، دون أن يُرمَّز أي لون بشكل صلب في أي مكان.

### 4. الدائرة المتفاعلة مع الصوت -- تعبير FFmpeg لكل إطار

هذا هو الجزء الأكثر التواء في خط الأنابيب، وربما الذي أفتخر به أكثر. أيقونة الوكيل المتكلم الدائرية لا تبقى ثابتة : تكبّر وتصغّر قليلا على إيقاع صوته.

يُحسب ذلك بقراءة WAV الخام للرد، وحساب غلاف RMS (root mean square، مقياس طاقة الإشارة) إطارا بإطار بسرعة 60 fps، والتطبيع بالأقصى، ثم التنعيم على نافذة 3 إطارات لتجنب التقطعات. كل قيمة غلاف تُحوَّل بعد ذلك إلى عامل مقياس محدود بـ`MAX_ZOOM_VARIATION` (0.2، أي ±20% حول الحجم الأساسي).

نتيجة هذا الحساب لا تُطبَّق عبر كود يتلاعب بالبكسلات، بل تُترجم إلى تعبير شرطي FFmpeg ضخم (`lt(n,K)*val + between(n,K,K')*val + ...`، فرع لكل مجموعة إطارات) يقود مباشرة معامل `scale` في مرشح الفيديو. يقيّم FFmpeg هذا التعبير مع كل إطار من العرض. لرد بضع ثوانٍ بسرعة 60 fps، يصنع هذا سريعا مئات الفروع في تعبير واحد، ومن هنا معامل `STEP` الذي يجمّع الإطارات للحد من العمق.

### 5. العرض لكل مقطع، ثم fisheye على المقدمة

كل رد يُعرض منفردا : خلفية فيديو (مقتطف عشوائي من أحد مقاطع اللعب في `bg-video/`، مقصوص للمدة الصحيحة)، ودائرة الوكيل فوقها مع زوم متفاعل صوتيا، وترجمة مطمورة عبر مرشح `ass` في FFmpeg، وصوت TTS ممزوج بصوت اللعب في الخلفية.

أول مقطع يحظى بمعالجة خاصة : تشويه fisheye يتلاشى تدريجيا على أول 20% من الإطارات (مرشح `lenscorrection` مُقيَّم إطارا بإطار، مع `tmix=frames=3` الذي يمزج الإطارات المتجاورة لمحاكاة motion blur)، متزامن مع صوت "whoosh". إنه انتقال المقدمة الذي يعطي انطباع أن الكاميرا "تدخل" المشهد.

### 6. التسلسل والمزج النهائي

كل المقاطع تُسلسَل طرفا لطرف، وموسيقى الخلفية (Sneaky Snitch، Kevin MacLeod، رخصة Creative Commons) تُمزج فوقها مع **ducking صوتي**، ضغط sidechain يخفض تلقائيا صوت الموسيقى بينما يتكلم وكيل، ويرفعه أثناء الصمت. الكل يعمل بسرعة 60 fps من البداية للنهاية، دون تحويل framerate بين الخطوات.

### 7. النشر التلقائي

سكربت `run-cron.sh`، الذي يطلقه cron تقليدي، يفعّل بيئة Python، ويحمّل `.env`، ويشغّل `bun src/workflow.ts --upload`. علم `--upload` يطلق إضافة توليد البيانات الوصفية (عنوان ووصف ووسوم) ويستدعي `uploaders/upload.py`، الذي ينشر الفيديو على YouTube وInstagram عبر سكربتين منفصلين (`uploaders/youtube/upload.py` و`uploaders/instagram/`). السلسلة كاملة، من prompt الـLLM إلى الفيديو المنشور، تعمل دون تدخل بشري.

## لماذا TypeScript/Bun بدلا من شيء Python بالكامل

الاختيار ليس إيديولوجيا، بل لأن Bun يعطي وصولا مباشرا وسريعا إلى `Bun.spawn` لقيادة FFmpeg في عملية فرعية، وتنميطا قويا على هياكل بيانات خط الأنابيب (`Phrase` و`SegmentInfo`)، وruntime أسرع بكثير عند الإقلاع من Node لسكربت يعمل في cron كل X ساعات. القطعتان الوحيدتان من Python في المشروع هما حيث Python مجهز فعلا الأفضل : PIL لاستخراج الألوان، وواجهات الرفع (`google-api-python-client` لـYouTube، وحزمة Instagram Graph API لـIG).

## ما الذي يوضحه

هذا المشروع مثال جيد على ما يمكن بناؤه اليوم بلبنات مجانية كليا أو مفتوحة المصدر : LLM سريع ومجاني عبر Groq API، ومحرك TTS محلي يعمل دون GPU مخصص، وFFmpeg لكل عرض الفيديو، والرابط ليس إلا بضع مئات من أسطر TypeScript. لا شيء من هذه اللبنات جديد منفردا. ما يصنع خط الأنابيب هو الترتيب : توليد سكربت متسق مع علاقات حقيقية بين الشخصيات، وتحويله إلى صوت معبّر مع فواصل طبيعية، ومزامنة عرض بصري على طاقة هذا الصوت إطارا بإطار، وأتمتة السلسلة كاملة حتى النشر.

---

**الموارد**

- **المستودع** : [github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **القناة** : [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**3 نقاط أساسية**

1. السكربت مولّد بواسطة LLM (Groq/Llama 3.3) مع personas وعلاقات لكل وكيل، لا مجرد قائمة نكات مكتوبة مسبقا.
2. زوم دائرة الوكيل يقوده تعبير FFmpeg محسوب إطارا بإطار من غلاف RMS للـWAV، لا تحريك keyframes تقليدي.
3. السلسلة كاملة، من الـprompt إلى منشور YouTube/Instagram، تعمل عبر cron job واحد دون تدخل بشري.
