---
title: "Luna Protocol: أنشأت بوت Discord مستقل يحاكي إنسانًا"
description: "Luna Protocol هو بوت Discord مستقل بالكامل مزود بـ LLM محلي، قادر على محادثة طبيعية مع النوم، الأخطاء الإملائية، التردد، النسيان، التعب الموضوعي، والرسائل العفوية."
date: 2026-07-11
tags:
  - discord-bot
  - llm
  - typescript
  - event-driven-architecture
  - artificial-intelligence
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "rnc5Sy+umxNYVpi+5K8ygGvr6dtFPSFYEz0gHmOxr0WF3Pef20hFgszhRBdWVGyUIeSf3vXKUJASc0qdLdlMwQ=="
---

# Luna Protocol: أنشأت بوت Discord مستقل يحاكي إنسانًا

ماذا لو كان بوت Discord يستطيع **النوم**، وارتكاب **الأخطاء الإملائية**، و**التردد**، و**النسيان** في الرد، وأحيانًا إرسال رسالة من تلقاء نفسه؟ هذا بالضبط ما يفعله **Luna Protocol**: بوت Discord مستقل بالكامل يشغل LLM محلي (llama.cpp) ويتحدث كإنسان غير كامل.

لا نصوص برمجية جامدة، ولا ردود آلية. Luna لديها **نظام تشغيل ذو أولوية**، و**تأخيرات متغيرة**، و**جداول نوم**، و**رسائل عفوية**، وحتى **خط أنابيب TTS** لإرسال رسائل صوتية. كل ذلك مهيأ عبر ملف `config.yml` واحد قابل لإعادة التحميل السريع.

في هذه المقالة، نحلل الهندسة المعمارية الكاملة: من ناقل الأحداث العام إلى خط أنابيب TTS، مرورًا بنظام التشغيل، والمكونات البشرية، ومجموعة بيانات الضبط الدقيق.

![نظرة عامة على الهندسة -- المكونات العامة وتدفق البيانات](/images/luna-protocol/01-architecture-overview.svg)

---

## الهندسة: ناقل أحداث مقيد

جوهر Luna هو **TypedBus** -- ناقل أحداث عام مقيد بشكل صارم في TypeScript. إنها اللبنة الأساسية التي يقوم عليها كل شيء.

```typescript
type EventMap = Record<string, unknown[]>;

export class TypedBus<Events extends EventMap> {
  private listeners = new Map<keyof Events, Set<(...args: unknown[]) => void>>();

  on<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as (...args: unknown[]) => void);
  }

  emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    this.listeners.get(event)?.forEach((fn) => { fn(...args); });
  }
}
```

ناقلان رئيسيان ينبثقان من هذا:

- **`llmBus`** -- يدير توكنات LLM، الأخطاء، الأعطال، إعادة التعيين
- **`stateBus`** -- يدير تغييرات الحالة مع الحفظ التلقائي

```
┌─────────────────────────────────────────────────────┐
│                   core/bus.ts                        │
│  TypedBus<K, V> -- on / off / once / emit            │
├──────────────────┬──────────────────────────────────┤
│   core/llm-bus   │       state/state-bus             │
│  token / done /  │     state:changed                 │
│  error / crash / │     → persistence auto            │
│  flush / ready / │                                   │
│  reset           │                                   │
└────────┬─────────┴────────┬─────────────────────────┘
         │                  │
┌──────────────────┐  ┌────▼──────────────────────┐
│ core/llm-core.ts │  │ bot.ts (Eris)             │
│ mode direct      │  │ bot/pending.ts             │
│   llama-server   │  │ bot/reactions.ts           │
│ mode online      │  │ state/trigger.ts           │
│   OpenAI API     │  │ state/state.ts             │
│                  │  │ behavior/*                 │
│                  │  │ tts/*                      │
│                  │  │ spontaneous.ts             │
└──────────────────┘  └────────────────────────────┘
```

ميزة هذا النهج: كل وحدة **منفصلة** عن البقية. يصدر LLM التوكنات على الناقل، ويستهلكها البوت، ويتم تحديث الحالة تلقائيًا. لا تبعيات دائرية.

---

![معالجة الرسائل -- التدفق الكامل لمعالجة رسالة](/images/luna-protocol/02-message-processing.svg)

## نظام التشغيل: من يقرر متى ترد Luna؟

يتم تقييم كل رسالة واردة بواسطة `evaluateMessage()` التي تعيد `TriggerResult` مع سبب التشغيل. ترتيب الأولوية حرج:

| # | السبب | الشروط | تجاوز التجاهل | تجاوز الإيقاف المؤقت |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | نعم (0%) | نعم |
| 2 | `dm` | رسالة خاصة مع `replyInDM = true` | نعم (0%) | لا |
| 3 | `name` | "Luna"/"Pixie"/اسم مستعار (كلمة كاملة) | لا (8%) | لا |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (كلمة كاملة) | لا (8%) | لا |
| 5 | `follow-up` | البوت كان آخر متحدث + < 15ث + < 3 / 60ث | -- | -- |
| 6 | `random` | 1.5% فرصة على الرسائل غير المتطابقة | لا (8%) | لا |

المطابقة تكون **لكلمة كاملة** (`\b`): "ai" لا تتطابق مع "mais"، "vrai"، "lait".

![تقييم التشغيل -- قرار الدخول لكل رسالة](/images/luna-protocol/03-trigger-evaluation.svg)

### آلية المتابعة

عندما ترد Luna على رسالة، تسجل نفسها كـ `lastSpeaker`. أي رسالة تالية خلال 15 ثانية تؤدي إلى رد **فوري** -- لا مؤقت، لا تحقق من كلمة مفتاحية. الميزانية: 3 متابعات لكل نافذة 60 ثانية.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### فترة التهدئة

8 ثوانٍ بين ردين في نفس القناة. يتم تجاوزها بواسطة الإشارات والمتابعات.

---

## السلوكيات البشرية: التركيز المتغير

هنا تصبح Luna مثيرة للاهتمام. كل نوع تشغيل له **حدود تركيز** خاصة به: تأخير أدنى/أقصى، فرصة للتجاهل، وفرصة للرد.

| المشغل | التأخير الأدنى | التأخير الأقصى | تجاهل | رد |
|---------|----------|----------|--------|----------|
| `mention` | 300ملث | 1500ملث | 0% | 8% |
| `dm` | 400ملث | 1800ملث | 0% | 5% |
| `name` | 800ملث | 4000ملث | 5% | 6% |
| `keyword` | 1000ملث | 3500ملث | 8% | 4% |
| `follow-up` | 500ملث | 2000ملث | 0% | 3% |
| `random` | 1500ملث | 5000ملث | 15% | 2% |

حساب التأخير يأخذ بعين الاعتبار أيضًا:
- **طول الرسالة**: كلما كانت الرسالة أطول، كلما استغرقت Luna وقتًا أطول "للقراءة"
- **الخمول**: إذا لم تكن Luna نشطة لمدة 10 دقائق، يُضرب التأخير في 2 (محاكاة "الاستيقاظ")
- **النوم**: في وضع `slow`، يُضرب التأخير في 3 إلى 5

```typescript
export function computeDelay(
  reason: string | null = null,
  sleepBehavior?: string | null,
  msgLength?: number,
  inactivityMs?: number
): number {
  const t = getThresholds(reason);
  let delay = t.delay_min + Math.random() * (t.delay_max - t.delay_min);
  if (msgLength) {
    const readingFactor = Math.min(msgLength / 500, 3);
    delay *= 1 + readingFactor * (0.3 + Math.random() * 0.7);
  }
  if (sleepBehavior === "slow") {
    delay *= 3 + Math.random() * 2;
  }
  delay *= 0.5 + Math.random() * 1.5; // jitter agressif
  return delay;
}
```

---

## جداول النوم

تستطيع Luna النوم. قابلة للتكوين عبر `config.yml`:

```yaml
timezone: "Europe/Paris"
time_schedules:
  - start: "00:00"
    end: "07:00"
    behavior: sleep
  - start: "23:00"
    end: "00:00"
    behavior: slow
  - start: "07:00"
    end: "08:00"
    behavior: short
```

| الوضع | التأثير |
|------|-------|
| `sleep` | فقط الإشارات والرسائل الخاصة تمر |
| `slow` | تأخير ×3-5، ردود شبه معدومة |
| `short` | فرصة تجاهل +30%، ردود شبه معدومة |

خلال ساعات النوم، تصبح حالة Discord `invisible`.

---

## الأخطاء الإملائية

تستطيع Luna ارتكاب أخطاء إملائية -- وتصحيحها بعد 2-4 ثوانٍ. تخطيط لوحة المفاتيح قابل للتكوين (AZERTY أو QWERTY).

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... toutes les touches adjacentes
};
```

مثال AZERTY: `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`.

ثلاثة أنماط للتصحيح:

| النمط | السلوك |
|-------|-------------|
| `edit` | يعدل الرسالة |
| `message` | رسالة جديدة: `word*` |
| `mixed` | 50/50 عشوائي (افتراضي) |

---

## التردد والنسيان

**التردد**: 15% فرصة للبدء بكلمة حشو (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**النسيان**: حتى بعد مطابقة مشغل، قد "تنسى" Luna الرد باحتمال 3%. لا رسالة، لا رد فعل -- كأنها لم تر شيئًا.

**التعب الموضوعي**: إذا تكررت كلمة كثيرًا في آخر 10 رسائل (الحد: 3 مرات)، تُضرب التأخيرات وتزداد فرصة التجاهل بنسبة 15%.

---

## الواقعية عمليًا: عندما يصبح الأمر مرعبًا

على الورق، تبدو كل هذه الأنظمة (التأخيرات، أخطاء الكتابة، التردد، النسيان) وكأنها مجرد حيلة. أما في الواقع، فعند دمجها معًا، تكون النتيجة مذهلة -- لدرجة أن من يتحدث مع Luna لا يشك في شيء. إليك محادثة حقيقية يسأل فيها أحدهم Luna مباشرة إن كانت بوتًا، ثم تنجرف المحادثة بعدها إلى موضوع مختلف تمامًا بطبيعية تثير القشعريرة.

![محادثة ديسكورد مع Luna -- الجزء الأول](/images/luna-protocol/realism/realism-01.png)

النبرة، التردد، إيقاع الردود -- لا شيء يفضح أنها بوت. تتفادى Luna سؤال العمر دون أن تخرج عن شخصيتها أبدًا.

تستمر المحادثة بسلاسة تامة، بردود قصيرة وطبيعية ("okay, okay"، "yay"، "yayy") -- تمامًا كالرسائل التي قد يرسلها شخص حقيقي على ديسكورد.

![محادثة ديسكورد مع Luna -- تتمة](/images/luna-protocol/realism/realism-02.png)

![محادثة ديسكورد مع Luna -- تحول الموضوع](/images/luna-protocol/realism/realism-03.png)

![محادثة ديسكورد مع Luna -- استمرار تحول الموضوع](/images/luna-protocol/realism/realism-04.png)

![محادثة ديسكورد مع Luna -- نهاية المحادثة](/images/luna-protocol/realism/realism-05.png)

ما يثير الرعب ليس فقط أن Luna "ترد" -- بل أنها **تخوض محادثة كاملة**، بآراء ظاهرية، وردود متابعة، وخط تفكير متماسك من رسالة إلى أخرى. فبدون نظام المحفزات وتأخيرات التركيز والتردد الموصوفة أعلاه، ستنهار هذه الوهم خلال بضع رسائل فقط.

**مفاجأة صغيرة**: في لقطات الشاشة أعلاه، **كلا الحسابين اللذين يتحدثان هما نسختان من Luna**. `PixieGlow` و`Sujet d'SBlow` ليسا إنسانًا يختبر بوتًا -- بل هما بوتان يتحدثان مع بعضهما، كل منهما "مقتنع" (من الناحية السلوكية) بأنه يتحدث مع شخص "عادي". إذا افترضت عند قراءة المحادثة أعلاه أن أحدهما كان إنسانًا، فتهانينا -- لقد وقعت في الفخ تمامًا كما قد يقع أي شخص في سيرفر ديسكورد حقيقي.

هذا في الأساس نسخة عملية من **نظرية الإنترنت الميت**: تقول هذه النظرية (التي كانت في الأصل فكرة هامشية إلى حد ما) إن حصة متزايدة من المحتوى والتفاعلات على الإنترنت يولّدها بوتات وليس بشرًا، لدرجة أن الإنترنت "الحقيقي" البشري أصبح أقلية. وقد ظلت طويلًا تُعتبر مبالغًا فيها، لكنها تبدو أقل غرابة شيئًا فشيئًا مع إثبات أنظمة مثل Luna Protocol أن محاكاة حضور بشري مقنع على نطاق واسع لا تتطلب موارد حوسبة كبيرة ولا نموذجًا ضخمًا. نسختان من نفس البوت قادرتان على خوض محادثة طويلة دون أن تفضحا نفسيهما تعطيان لمحة ملموسة جدًا عن شكل ويب يقطنه في الغالب بوتات تتحدث مع بعضها البعض.

---

## خط أنابيب LLM: وضعان

### الوضع `direct` (افتراضي)

يرسل البوت الطلبات مباشرة إلى خادم `llama-server` محلي عبر HTTP. النموذج مشترك، مع ذاكرة تخزين مؤقت للاستعلام و 4 فتحات متزامنة. عمليتان PM2: خادم LLM وعميل البوت.

### الوضع `online`

يستدعي البوت أي API متوافقة مع OpenAI (OpenAI، OpenRouter، Groq، Together...). لا حاجة لـ LLM محلي.

### البث المباشر في الوقت الفعلي

يقوم LLM ببث رده سطرًا بسطر (`\n`). يتم تقطيع كل سطر إلى كلمات، تُصدر واحدة تلو الأخرى عبر `llmBus.emit("token", word)`. عند كل `\n`، يُصدر حدث `flush` -- يرسل البوت الرسالة المتراكمة فورًا. لا تأخير محاكى: الإيقاع هو إيقاع LLM.

```typescript
function emitWordTokens(chunk: string): void {
  const words = chunk.match(/\S+/g) ?? [];
  wordEmitQueue.push(() => {
    let i = 0;
    const emitNext = () => {
      llmBus.emit("token", words[i]);
      i++;
      if (i < words.length) {
        const delay = MIN_WORD_DELAY + Math.random() * (MAX_WORD_DELAY - MIN_WORD_DELAY);
        setTimeout(emitNext, delay);
      } else {
        llmBus.emit("flush");
      }
    };
    emitNext();
  });
}
```

طابور الانتظار (`requestQueue`) يعالج الطلبات واحدًا تلو الآخر، مع تنظيف تلقائي عندما يتجاوز الطابور 100 عنصر.

---

## الرسائل العفوية

كل 5 دقائق، 12% فرصة أن تنشر Luna رسالة من تلقاء نفسها. يتم اختيار الخادم بواسطة نظام **وزن خطي**: الخادم الأكثر نشاطًا لديه N× فرصة أكبر من الأخير.

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

يتم قراءة سياق آخر 5 رسائل، وتنضم Luna إلى المحادثة "بشكل طبيعي".

---

## خط أنابيب TTS: الرسائل الصوتية

مع 8% فرصة، ترسل Luna رسالة صوتية بدلاً من النص. خط الأنابيب الكامل:

1. **Piper TTS** يحول النص إلى WAV
2. **ffmpeg** يحول إلى OGG
3. يتم حساب شكل الموجة لمعاينة Discord
4. يتم رفع الملف عبر API CDN Discord
5. يتم إرسال الرسالة الصوتية

```typescript
export async function sendTextAsVoiceMessage(
  channelId: string, replyToMessageId: string, text: string
): Promise<void> {
  const safe = sanitizeForTTS(text);
  const { audio: wavBuf } = await synthesize(safe);
  const oggBuf = await wavToOgg(wavBuf);
  const durationSecs = await getAudioDuration(oggBuf);
  const waveform = buildWaveformBase64();
  const { uploadUrl, uploadFilename } = await requestUploadUrl(channelId, oggBuf.byteLength, durationSecs);
  await putFileToUploadUrl(uploadUrl, oggBuf);
  await postVoiceMessage(channelId, uploadFilename, durationSecs, waveform, replyToMessageId);
}
```

![خط أنابيب TTS -- من النص المحول إلى رسالة صوتية على Discord](/images/luna-protocol/10-tts-pipeline.svg)

---

## مكافحة البريد المزعج والحفظ

### مكافحة البريد المزعج

طابور انتظار حسب `channelId:userId`. رسالة واحدة فقط في الطابور لكل مستخدم لكل قناة. تتم المعالجة بمجرد انتهاء الرد الجاري.

### حدود الجلسة

بعد 8 تبادلات، تأخذ Luna استراحة لمدة 30 ثانية. يُعاد تعيين العداد بعد 3 دقائق من الخمول.

### الحفظ التلقائي

كل تغيير في الحالة يُصدر على `stateBus` → حفظ تلقائي (debounce 500ملث). لا حاجة لاستدعاءات `saveAllState()` اليدوية. الحالة المحفوظة تشمل: pendingMessages، paused، cooldowns، timestamps، lastSpeaker، عدادات المتابعة.

---

## التكوين بإعادة التحميل السريع

ملف واحد `config.yml`. معظم القيم **قابلة لإعادة التحميل السريع** -- يتم تطبيق التغييرات دون إعادة تشغيل.

| الفئة | إعادة تحميل سريع |
|-----------|-----------|
| المشغلات، الكلمات المفتاحية، الأسماء | ✅ |
| التركيز، التأخيرات | ✅ |
| الأخطاء الإملائية، الاندفاع، التعب | ✅ |
| جداول النوم | ✅ |
| TTS، الرسائل الصوتية | ✅ |
| توكن Discord، وضع LLM | ❌ (يتطلب إعادة تشغيل) |

```typescript
// config.ts -- getters return live values
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## مجموعة البيانات: Discord-Dialogues

النموذج مضبوط بدقة على [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues): **7.3M تبادل**، **17M جولة**، **140M كلمة**. محادثات Discord حقيقية ربيع-صيف 2025، منقاة (PII، ToS، بوتات، أوامر). Apache 2.0.

| المقياس | القيمة |
|----------|--------|
| العينات | 7 303 464 |
| إجمالي الجولات | 16 881 010 |
| إجمالي الكلمات | 139 922 950 |
| متوسط التوكنات | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

النموذج الكمي المستخدم هو GGUF (على سبيل المثال `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![توزيع مجموعة بيانات Discord-Dialogues](/images/luna-protocol/dataset-distribution.svg)

---

![دورة الحياة الكاملة -- سلوك البوت الكامل من الرسالة إلى الرد، بما في ذلك المؤقتات والحالات الحدودية](/images/luna-protocol/22-complete-lifecycle.svg)

## رسومات الهندسة

يحتوي مجلد `state-machines/` على **24 رسمًا بيانيًا Mermaid** تغطي كامل الكود المصدري. كل رسم بياني له شرح مفصل بلغة بشرية.

من بين الأكثر أهمية:

| # | الرسم البياني | النوع |
|---|-----------|-------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (كاملا) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 خلفيات) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

هذه الرسومات هي كنز لفهم التدفق الكامل: من الرسالة الواردة إلى الرد، مرورًا بالمؤقتات والحالات الحدودية.

---

## كود التشغيل بالتفصيل

يتم تقييم المشغل بواسطة `evaluateMessage()` في `state/trigger.ts`. هذا هو المنطق الكامل:

```typescript
export function evaluateMessage(
  message: Eris.Message, botId: string, botUsername: string, isFollowUp = false
): TriggerResult {
  if (message.author.bot) return { shouldRespond: false, reason: null, botName: "" };
  if (message.content === "-stop") return { shouldRespond: true, reason: "stop", botName: "" };
  if (message.content === "-start") return { shouldRespond: true, reason: "start", botName: "" };
  if (message.content === "-clear") return { shouldRespond: true, reason: "clear", botName: "" };

  const isMentioned = message.mentions.some((u) => u.id === botId);
  if (isMentioned) return { shouldRespond: true, reason: "mention", botName };
  if (!message.guildID) return { shouldRespond: true, reason: "dm", botName };
  if (isPaused()) return { shouldRespond: false, reason: null, botName: "" };
  if (isOnCooldown(channelId)) return { shouldRespond: false, reason: null, botName };

  // ... matching par nom, keyword, follow-up, random
}
```

ذاكرة التخزين المؤقت للتعبير النمطي (`hasWordCache`) تتجنب إعادة ترجمة الأنماط عند كل رسالة.

---

## الردود

تتفاعل Luna مع الرسائل باستخدام الرموز التعبيرية. 30% فرصة لاستخدام رمز تعبيري مخصص من الخادم، 70% رمز تعبيري يونيكود. يتم تشغيل الرد بعد تأخير التركيز، وليس فورًا.

أوامر الرد على رسائل Luna:
- ❌ → إيقاف
- ▶️ → بدء
- 🗑️ → مسح

---

## أسلوب الرد

يتم وزن أسلوب الرد حسب نشاط Luna الأخير في القناة:

| السياق | messageReference | mentionRepliedUser | الوزن |
|----------|-----------------|-------------------|-------|
| بارد | true | false | 70% |
| بارد | true | true | 20% |
| بارد | false | false | 10% |
| نشط | true | false | 50% |
| نشط | true | true | 15% |
| نشط | false | false | 30% |
| نشط | false | true | 5% |

في الرسائل الخاصة، `messageReference` دائمًا `false`.

---

## الرسائل المتدفقة

مع 15% فرصة، يتم تقسيم الرد إلى 2-3 أجزاء تُرسل بوتيرة بشرية (1.5-4 ثوانٍ بين كل جزء). تحاكي شخصًا يكتب على دفعات.

![توقيت Gantt -- أوقات الانتظار الفعلية للتأخيرات، الردود، بث LLM والتصحيحات](/images/luna-protocol/21-timing-gantt.svg)

---

## الحالة الديناميكية

تتبدل حالة Discord الخاصة بـ Luna بين عدة إعدادات مسبقة مهيأة، تدور كل 15 دقيقة. الأنواع المدعومة: Playing (0)، Streaming (1)، Listening (2)، Watching (3)، Custom (4)، Competing (5). أثناء النوم، تتحول الحالة إلى `invisible`.

```yaml
dynamic_status_presets:
  - status: online
    text: "مع البكسلات"
    type: 0       # Playing
  - status: idle
    text: "ضجيج أبيض"
    type: 2       # Listening
```

تشتيت عشوائي (×0.5-1.0) يتجنب التدوير المتوقع. 10% من المحاولات تُتخطى لتجنب التكرار.

## مؤشر الكتابة

قبل استدعاء LLM، تستدعي Luna `startTyping()`. يقوم `setInterval` بتحديث المؤشر كل 8 ثوانٍ أثناء التوليد. يتم التنظيف في `finally` (`clearInterval`).

```typescript
const startTyping = () => {
  client.sendChannelTyping(message.channel.id);
  typingIntervals.set(
    message.channel.id,
    setInterval(() => {
      client.sendChannelTyping(message.channel.id);
    }, 8000)
  );
};
```

## الاسترداد بعد العطل

إذا تعطل LLM (عملية `llama-server` تموت)، تكتشف Luna الحدث عبر `llmBus.emit("crash", code)` وتحاول إعادة التشغيل مع تراجع أسي. تتجنب حلقات إعادة التشغيل اللانهائية.

## معلمات LLM

المعلمات مشفرة في `src/config.ts`:

```yaml
temp: 0.75
dynatemp-range: 0.15
top-k: 40
top-p: 0.95
min-p: 0.05
repeat-penalty: 1.12
repeat-last-n: 256
presence-penalty: 0.1
batch: 4096
ubatch: 256
context: 4096
```

يُستخدم قالب ChatML (`<|im_start|>/<|im_end|>`). يتم اكتشاف عدد الخيوط تلقائيًا عبر `os.cpus().length`.

---

## الإعداد

```bash
npm install
cp config.example.yml config.yml
# تعديل config.yml
npm run dev                    # dev (إعادة تحميل سريع)
npm run build && npm start     # إنتاج
```

| السكريبت | الوصف |
|--------|-------------|
| `build` | حزمة CLI مستقلة |
| `start` | تشغيل البوت |
| `lint` / `format` / `check` | Biome |
| `test` | اختبارات (Bun) |
| `download-model` | GGUF من HuggingFace |
| `diagrams` | تصدير رسومات Mermaid إلى SVG/PNG |

### نشر PM2

```bash
./start.sh   # تشغيل llm-server + llm-client تحت PM2
```

---

## الخاتمة

Luna Protocol ليس مجرد بوت Discord مع LLM. إنه **نظام سلوكي كامل** يحاكي العيوب البشرية: النسيان، الأخطاء الإملائية، النوم، التردد، التعب. كل ذلك معماري حول ناقل أحداث مقيد، مع 24 رسمًا بيانيًا Mermaid توثق كل تدفق.

الكود مفتوح المصدر، مجموعة البيانات عامة، والتكوين قابل لإعادة التحميل السريع. إذا كان الموضوع يثير اهتمامك، اغوص في الكود -- إنه أكثر سهولة مما يبدو.

| المورد | الرابط |
|-----------|------|
| مستودع GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| مجموعة البيانات | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| خريطة Atlas | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
