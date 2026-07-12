---
title: "Luna Protocol: أنشأت بوت Discord مستقلاً يحاكي الكائن البشري"
description: "Luna Protocol هو بوت Discord مستقل تمامًا مزود بنموذج لغة محلي، قادر على المحادثة الطبيعية مع النوم وأخطاء الطباعة والتردد والنسيان وإجهاد المواضيع والرسائل العفوية."
date: 2026-07-11
tags:
  - discord-bot
  - llm
  - typescript
  - هندسة-مبنية-على-الأحداث
  - الذكاء-الاصطناعي
  - مفتوح-المصدر
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "zMF78WWXzao3U5gkySba/ennK7izCQcxMEpxRqH/yhHGL5MCTCahhU8tfy018p9YwZ36TVi97HYPl1d9Hf12ew=="
---

# Luna Protocol: أنشأت بوت Discord مستقلاً يحاكي الكائن البشري
ماذا لو كان بوت Discord قادرًا على **النوم** وارتكاب **أخطاء الطباعة** وال**تردد** و**نسيان** الرد، وأحيانًا إرسال رسالة من تلقاء نفسه؟ هذا بالضبط ما يفعله **Luna Protocol**: بوت Discord مستقل تمامًا يعمل بنموذج لغة محلي (llama.cpp) ويتحدث مثل كائن بشري غير مثالي.
بدون مطالبات صارمة، بدون ردود روبوتية. لدى Luna **نظام إطلاق أولوية** و**تأخيرات متغيرة** و**جداول نوم** و**رسائل عفوية**، وحتى **خط أنابيب TTS** لإرسال الرسائل الصوتية. كل ذلك قابل للتكوين عبر ملف `config.yml` بسيط قابل لإعادة التحميل.
في هذه المقالة، نحلل الهيكلية الكاملة: من ناقل الأحداث العام إلى خط أنابيب TTS، مرورًا بنظام الإطلاق والمكونات البشرية ومجموعة بيانات الضبط الدقيق.
![نظرة عامة على الهيكلية -- المكونات العامة وتدفق البيانات](/images/luna-protocol/01-architecture-overview.svg)

---

## الهندسة المعمارية: ناقل أحداث مُنقَّب

قلب Luna هو **النوعdBus** -- ناقل أحداث عام قوي التنسيق بلغة النوعScript. إنه الأساس الذي يرتكز عليه كل شيء.

```typescript
type EventMap = Record<string, unknown[]>;

export class النوعdBus<Events extends EventMap> {
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

من هنا تتفرع حالتان رئيسيتان:

- **`llmBus`** -- يدير توكنات LLM، الأخطاء، الأعطال، إعادة التعيين
- **`stateBus`** -- يدير تغييرات الحالة مع الحفظ التلقائي

```
┌─────────────────────────────────────────────────────┐
│                   core/bus.ts                        │
│  النوعdBus<K, V> -- on / off / once / emit            │
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

ميزة هذا النهج: كل وحدة **معزولة** عن الباقي. LLM يُصدر التوكنات على الناقل، والبوت يستهلكها، والحالة تتحدث تلقائيًا. لا توجد تبعيات دائرية.

---

![Message Processing -- التدفق الكامل لمعالجة الرسالة](/images/luna-protocol/02-message-processing.svg)

## نظام المُحفِّز: من يقرر متى تستجيب Luna؟

كل رسالة واردة تُقيَّم بواسطة `evaluateMessage()` التي تُرجع `TriggerResult` مع سبب التنشيط. ترتيب الأولوية حاسم:

| # | السبب | الشروط | Bypass ignore | Bypass pause |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | نعم (0%) | نعم |
| 2 | `dm` | رسالة خاصة مع `replyInDM = true` | نعم (0%) | لا |
| 3 | `name` | "Luna"/"Pixie"/alias (كلمة كاملة) | لا (8%) | لا |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (كلمة كاملة) | لا (8%) | لا |
| 5 | `follow-up` | البوت كان آخر متحدث + < 15 ثانية + < 3 / 60 ثانية | -- | -- |
| 6 | `random` | 1.5% احتمال على الرسائل غير المتطابقة | لا (8%) | لا |

المطابقة **كلمة كاملة** (`\b`) : "ai" لا يتطابق مع "mais" و"vrai" و"lait".

![Trigger evaluation -- قرار الدخول لكل رسالة](/images/luna-protocol/03-trigger-evaluation.svg)

### آلية المتابعة

عندما ترد Luna على رسالة، تسجل نفسها كـ `lastSpeaker`. أي رسالة تالية خلال 15 ثانية تُنشّط ردًا **فوريًا** -- بدون مؤقت، بدون التحقق من الكلمة المفتاحية. الميزانية: 3 متابعات لكل نافذة 60 ثانية.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### فترة الانتظار

8 ثوانٍ بين ردّين في نفس القناة. يتم التخطي عبر الإشارات والمتابعات.

---

## السلوك البشري: تركيز متغير

هنا تصبح Luna مثيرة. لكل نوع مُنشّط **عتبات تركيز خاصة**: تأخير أدنى/أقصى، احتمال التجاهل، واحتمال التفاعل.

| Trigger | الحد الأدنى للتأخير | الحد الأقصى للتأخير | تجاهل | تفاعل |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

حساب التأخير يأخذ أيضًا في الاعتبار:
- **طول الرسالة**: كلما كانت الرسالة أطول، استغرقت Luna وقتًا أطول في "القراءة"
- **عدم النشاط**: إذا لم تكن Luna نشطة منذ 10 دقائق، يُضرب التأخير في 2 (محاكاة "الاستيقاظ")
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
  delay *= 0.5 + Math.random() * 1.5; // اهتزاز عدواني
  return delay;
}
```

---

## جدول النوم

يمكن لنوم. قابل للتكوين عبر `config.yml`:

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
| `slow` | تأخير ×3-5، تفاعلات شبه معدومة |
| `short` | احتمال التجاهل +30%، تفاعلات شبه معدومة |

خلال ساعات النوم، يتحول حالة Discord إلى `invisible`.

---

## أخطاء الكتابة

يمكن أن ترتكب أخطاء إملائية -- ويُصححها بعد 2-4 ثوانٍ. تخطيط لوحة المفاتيح قابل للتكوين (AZERTY أو QWERTY).

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... جميع المفاتيح المتجاورة
};
```

مثال AZERTY: `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`.

ثلاثة أنماط تصحيح:

| النمط | السلوك |
|-------|-------------|
| `edit` | تعديل الرسالة |
| `message` | رسالة جديدة: `word*` |
| `mixed` | 50/50 عشوائي (افتراضي) |

---

## التردد والنسian

**تردد**: 15% احتمال للبدء بكلمة ملء (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**النسيان**: حتى بعد مطابقة المُنشّط، يمكن لـ Luna "تنسى" الرد باحتمال 3%. لا رسالة، لا تفاعل -- كما لو أنها لم تر شيئًا.

**إجهاد المواضيع**: إذا تكررت كلمة بشكل مفرط في آخر 10 رسائل (عتبة: 3 مرات)، يُضرب التأخير ويزداد احتمال التجاهل بنسبة 15%.

---

## خط أنابيب LLM: وضعان

### الوضع `direct` (الافتراضي)

يُرسل البوت الطلبات مباشرة إلى `llama-server` محلي عبر HTTP. النموذج مشترك، مع ذاكرة مؤقتة للمطالبات و4 فتحات متزامنة. عمليتان PM2: خادم LLM وعميل البوت.

### الوضع `online`

يُتصل البوت بأي API متوافق مع OpenAI (OpenAI, OpenRouter, Groq, Together...). لا حاجة لـ LLM محلي.

### البث المباشر

LLM يُبثّ إجابته سطرًا بسطر (`\n`). كل سطر يُقسم إلى كلمات، تُصدر واحدة تلو الأخرى عبر `llmBus.emit("token", word)`. عند كل `\n`، يُصدر حدث `flush` -- البوت يُرسل فورًا الرسالة المتراكمة. لا تأخير مُحاكاة: الإيقاع هو إيقاع LLM.

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

القائمة (`requestQueue`) تعالج الطلبات واحدًا تلو الآخر، مع تنظيف تلقائي عند تجاوز 100 عنصر.

---

## الرسائل العفوية

كل 5 دقائق، 12% احتمال أن تنشر Luna رسالة منبثق عنها. يُختار الخادم بواسطة نظام **وزن خطي**: الخادم الأكثر نشاطًا لديه N× فرصًا أكثر من الأخير.

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

يتم قراءة سياق آخر 5 رسائل، وتُنضم Luna إلى المحادثة "بشكل طبيعي".

---

## خط أنابيب TTS: الرسائل الصوتية

بشكل 12% احتمال، تُرسل Luna رسالة صوتية بدلاً من النص. خط الأنابيب الكامل:

1. **Piper TTS** يُنشئ النص إلى WAV
2. **ffmpeg** يُحوّل إلى OGG
3. يتم حساب الموجة الصوتية لمعاينة Discord
4. يتم رفع الملف عبر واجهة برمجة تطبيقات Discord CDN
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

![TTS Pipeline -- من النص المُولد إلى رسالة Discord الصوتية](/images/luna-protocol/10-tts-pipeline.svg)

---

## مكافحة البريد العشوائي والاستمرارية

### Anti-spam

قائمة لكل `channelId:userId`. رسالة واحدة في القائمة لكل مستخدم لكل قناة. تُعالج فورًا عند اكتمال الرد الحالي.

### حدود الجلسة

بعد 8 تبادلات، تأخذ Luna استراحة 30 ثانية. يُعاد العداد بعد 3 دقائق من عدم النشاط.

### الحفظ التلقائي

كل تغيير حالة يُنشر على `stateBus` → حفظ تلقائي (debounce 500 مللي ثانية). لم تعد هناك حاجة لاستدعاءات `saveAllState()` يدويًا. الحالة المحفوظة تشمل: pendingMessages, paused, cooldowns, timestamps, lastSpeaker، عدادات المتابعة.

---

## تكوين إعادة التحميل الفوري

ملف `config.yml` واحد. معظم القيم **قابلة لإعادة التحميل** -- التغييرات تُطبق دون إعادة تشغيل.

| الفئة | إعادة التحميل الفوري |
|-----------|-----------|
| المُنشّطات، الكلمات المفتاحية، الأسماء | ✅ |
| التركيز، التأخيرات | ✅ |
| أخطاء الطباعة، الاندفاع، الإجهاد | ✅ |
| جداول النوم | ✅ |
| TTS، الرسائل الصوتية | ✅ |
| توكن Discord، وضع LLM | ❌ (إعادة تشغيل مطلوبة) |

```typescript
// config.ts -- المحصّلات تُرجع قيمًا مباشرة
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## مجموعة البيانات: Discord-Dialogues

النموذج تم تدريبه على [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) : **7.3M تبادل**، **17M جولة**، **140M كلمة**. محادثات Discord حقيقية من ربيع-صيف 2025، مُصفاة (PII، شروط الخدمة، بوتات، أوامر). Apache 2.0.

| المقياس | القيمة |
|----------|--------|
| العينات | 7 303 464 |
| إجمالي الجولات | 16 881 010 |
| إجمالي الكلمات | 139 922 950 |
| متوسط التوكنات | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

النموذج المُكمَّم المستخدم هو GGUF (على سبيل المثال `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![توزيع بيانات Discord-Dialogues](/images/luna-protocol/dataset-distribution.svg)

---

![Complete Lifecycle -- السلوك الكامل للبوت من الرسالة إلى الرد، بما في ذلك المؤقتات وحالات الحد](/images/luna-protocol/22-complete-lifecycle.svg)

## مخططات الهندسة المعمارية

مجلد `state-machines/` يحتوي على **24 مخطط Mermaid** يغطي جميع الكود المصدري. لكل مخطط شرح مفصل بلغة بشرية.

من أهمها:

| # | المخطط | النوع |
|---|-----------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (مكتمل) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 backends) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

هذه المخططات كنز لفهم التدفق الكامل: من الرسالة الواردة إلى الرد، مع المؤقتات وحالات الحد.

---

## تفاصيل كود المُحفِّز

يُقيَّم المُنشّط بواسطة `evaluateMessage()` في `state/trigger.ts`. إليك المنطق الكامل:

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

  // ... مطابقة بالاسم، الكلمة المفتاحية، المتابعة، العشوائي
}
```

الذاكرة المؤقتة للتعبيرات النمطية (`hasWordCache`) تمنع إعادة تجميع الأنماط عند كل رسالة.

---

## ردود الفعل

تتفاعل Luna بالرسائل باستخدام الرموز التعبيرية. 30% احتمال لاستخدام رمز تعبيري مخصص للخادم، 70% رمز تعبيري يونيكود. يُنشّط التفاعل بعد تأخير التركيز، وليس فورًا.

أوامر التفاعل على رسائل Luna:
- ❌ → Stop
- ▶️ → Start
- 🗑️ → Clear

---

## أسلوب الرد

أسلوب الرد يوزّع حسب نشاط Luna الأخير في القناة:

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

## رسائل متسلسلة

بشكل 12% احتمال، يُقسم الرد إلى 2-3 أجزاء تُرسل بإيقاع بشري (1.5-4 ثوانٍ بين كل جزء). يحاكي شخصًا يكتب عدة مرات.

![Timing Gantt -- أوقات الانتظار الفعلية للتأخيرات، ردود الفعل، بث LLM، والتصحيحات](/images/luna-protocol/21-timing-gantt.svg)

---

## الحالة الديناميكية

حالة Luna على Discord تتنقل بين عدة إعدادات مسبقة، تدور كل 15 دقيقة. الأنواع المدعومة: Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). أثناء النوم، تتحول الحالة إلى `invisible`.

```yaml
dynamic_status_presets:
  - status: online
    text: "مع البكسلات"
    type: 0       # Playing
  - status: idle
    text: "ضوضاء بيضاء"
    type: 2       # Listening
```

اهتزاز عشوائي (×0.5-1.0) يمنع الدوران القابل للتنبؤ. 10% من المحاولات يتم تخطيها لتجنب التكرار.

## مؤشر الكتابة

قبل استدعاء LLM، تستدعي Luna `startTyping()`. `setInterval` يُحدّث المؤشر كل 8 ثوانٍ أثناء التوليد. يُنظّف في `finally` (`clearInterval`).

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

## الاستراثاع بعد التعطل

إذا تعطل LLM (ية `llama-server` تتوقف)، تكتشف Luna الحدث عبر `llmBus.emit("crash", code)` وتحاول إعادة التشغيل بتأخير أُسّي. تمنع حلقات إعادة التشغيل اللانهائية.

## معلمات LLM

المعلمات مُثبتة في `src/config.ts`:

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

قالب ChatML (`<|im_start|>/<|im_end|>`) يُستخدم. عدد الخيوط يُكتشف تلقائيًا عبر `os.cpus().length`.

---

## الإعداد

```bash
npm install
cp config.example.yml config.yml
# تعديل config.yml
npm run dev                    # dev (hot reload)
npm run build && npm start     # production
```

| Script | Description |
|--------|-------------|
| `build` | حزمة CLI مستقلة |
| `start` | تشغيل البوت |
| `lint` / `format` / `check` | Biome |
| `test` | Tests (Bun) |
| `download-model` | GGUF من HuggingFace |
| `diagrams` |تصدير مخططات Mermaid إلى SVG/PNG |

### نشر PM2

```bash
./start.sh   # تشغيل llm-server + llm-client تحت PM2
```

---

## الخلاصة

Luna Protocol ليس مجرد بوت Discord بـ LLM. إنه **نظام سلوكي كامل** يحاكي نقصانات بشرية: النسيان، أخطاء الكتابة، النوم، التردد، الإجهاد. كل شيء مُعمّر حول ناقل أحداث مُنسّق، مع 24 مخطط Mermaid توثق كل تدفق.

الكود مفتوح المصدر، مجموعة البيانات عامة، والتكوين قابل لإعادة التحميل. إذا كنت مهتمًا بالموضوع، اغمر في الكود -- إنه أسهل مما يبدو.

| الموارد | الرابط |
|-----------|------|
| مستودع GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
