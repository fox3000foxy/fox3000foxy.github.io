---
title: "Luna Protocol : أنشأت بوت Discord مستقلا يحاكي إنسانا"
description: "Luna Protocol هو بوت Discord مستقل بالكامل مزود بـLLM محلي، قادر على محادثة طبيعية مع النوم، والأخطاء المطبعية، والتردد، والنسيان، والتعب الموضوعي، والرسائل العفوية."
date: 2026-07-11
tags:
  - discord
  - llm
  - typescript
  - event-driven-architecture
  - ai
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "aLt3VX/M0JHs/c7ZCcxe50ZZuXEE3QDibkvgWlpYEwfm/X05O/WlXRHhhfCO29OK1XuJo8nfvxh9Yvunc+OvNQ=="
---

# Luna Protocol : أنشأت بوت Discord مستقلا يحاكي إنسانا

وماذا لو استطاع بوت Discord أن **ينام**، ويرتكب **أخطاء مطبعية**، و**يتردد**، و**ينسى** الرد، وأحيانا يرسل لك رسالة من تلقاء نفسه ؟ هذا بالضبط ما يفعله **Luna Protocol** : بوت Discord مستقل بالكامل يشغّل LLM محليا (llama.cpp) ويحادث كإنسان ناقص.

تعمل Luna بمحفزات سياقية وردود ناقصة مفترضة. لديها **نظام محفزات ذو أولوية**، و**مهلات متغيرة**، و**جداول نوم**، و**رسائل عفوية**، وحتى **خط أنابيب TTS** لإرسال رسائل صوتية. الكل مُعدَّل عبر ملف `config.yml` بسيط قابل لإعادة التحميل حيا.

في هذا المقال، أشرّح البنية الكاملة : من ناقل الأحداث العام إلى خط TTS، مرورا بنظام المحفزات والمكونات الإنسانية وطقم الضبط.

![Architecture Overview -- composants globaux et flux de données](/images/luna-protocol/01-architecture-overview.svg)

---

## البنية : ناقل أحداث مُنمَّط

قلب Luna هو **TypedBus** : ناقل أحداث عام شديد التنميط في TypeScript. إنه اللبنة الأساسية التي يرتكز عليها كل شيء. بنيته هكذا لأنني أردت تجنب التبعيات الدائرية منذ البداية.

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

ينبثق عنه ناقلان رئيسيان :

- **`llmBus`** : يدير رموز LLM والأخطاء والانهيارات وإعادة الضبط
- **`stateBus`** : يدير تغيرات الحالة مع حفظ تلقائي

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

ميزة هذه المقاربة : كل وحدة **منفصلة** عن الباقي. يبث LLM الرموز على الناقل، ويستهلكها البوت، وتتحدث الحالة تلقائيا. لا تبعية دائرية.

---

![Message Processing -- flux complet de traitement d'un message](/images/luna-protocol/02-message-processing.svg)

## نظام المحفزات : من يقرر متى ترد Luna ؟

كل رسالة واردة تُقيَّم بواسطة `evaluateMessage()` التي تعيد `TriggerResult` مع سبب تحفيز. ترتيب الأولوية حاسم :

| # | السبب | الشروط | تجاوز التجاهل | تجاوز الإيقاف |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | نعم (0%) | نعم |
| 2 | `dm` | رسالة خاصة مع `replyInDM = true` | نعم (0%) | لا |
| 3 | `name` | "Luna"/"Pixie"/alias (كلمة كاملة) | لا (8%) | لا |
| 4 | `keyword` | `hello` و`hi` و`ai` و`bot`... (كلمة كاملة) | لا (8%) | لا |
| 5 | `follow-up` | البوت كان آخر متكلم + < 15s + < 3 / 60s | -- | -- |
| 6 | `random` | 1.5% احتمال على الرسائل غير المطابقة | لا (8%) | لا |

المطابقة **كلمة كاملة** (`\b`) : "ai" لا تطابق "mais" و"vrai" و"lait".

![Trigger evaluation -- décision d'entrée pour chaque message](/images/luna-protocol/03-trigger-evaluation.svg)

### آلية المتابعة

عندما ترد Luna على رسالة، تسجّل نفسها كـ`lastSpeaker`. كل رسالة تالية خلال 15 ثانية تحفّز ردا **فوريا**، متجاوزة المؤقتات وفحوص الكلمات. الميزانية : 3 متابعات لكل نافذة 60 ثانية.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### فترة التهدئة

8 ثوانٍ بين ردين في نفس القناة. تتجاوزها الإشارات والمتابعات.

---

## السلوكيات الإنسانية : التركيز المتغير

هنا تصبح Luna مثيرة. لكل نوع تحفيز **عتبات تركيز** خاصة به : مهلة دنيا/قصوى، واحتمال تجاهل، واحتمال تفاعل.

| المحفز | المهلة الدنيا | المهلة القصوى | التجاهل | التفاعل |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

يأخذ حساب المهلة في الاعتبار أيضا :
- **طول الرسالة** : كلما طالت الرسالة، زاد وقت Luna "لقراءتها"
- **الخمول** : إذا لم تكن Luna نشطة منذ 10 دقائق، تُضرب المهلة في 2 (محاكاة "الاستيقاظ")
- **النوم** : في وضع `slow`، تُضرب المهلة في 3 إلى 5

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
  delay *= 0.5 + Math.random() * 1.5; // jitter قوي
  return delay;
}
```

---

## جداول النوم

يمكن لـLuna أن تنام. قابل للضبط عبر `config.yml` :

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

| الوضع | الأثر |
|------|-------|
| `sleep` | الإشارات والرسائل الخاصة فقط تمر |
| `slow` | المهلة ×3-5، والتفاعلات شبه معدومة |
| `short` | احتمال التجاهل +30%، والتفاعلات شبه معدومة |

أثناء ساعات النوم، تتحول حالة Discord إلى `invisible`.

---

## الأخطاء المطبعية

يمكن لـLuna ارتكاب أخطاء مطبعية، تُصحَّح بعد 2-4 ثوانٍ. تخطيط لوحة المفاتيح قابل للضبط (AZERTY أو QWERTY). تركته قابلا للضبط لأنك ترصد فورا بوتا يكتب بنظافة أكثر من اللازم.

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... كل المفاتيح المتجاورة
};
```

مثال AZERTY : `bonjour ← bonjpur` و`salut ← slaut` و`comment ← cpmment`.

ثلاثة أساليب تصحيح :

| الأسلوب | السلوك |
|-------|-------------|
| `edit` | يحرر الرسالة |
| `message` | رسالة جديدة : `word*` |
| `mixed` | 50/50 عشوائي (افتراضي) |

---

## التردد والنسيان

**التردد** : 15% احتمال البدء بكلمة حشو (`uh...` و`um...` و`well...` و`hmm...` و`so...`).

**النسيان** : حتى بعد مطابقة محفز، قد "تنسى" Luna الرد باحتمال 3%. تبقى حينها صامتة تماما، كأنها لم ترَ شيئا. أعشق هذا السلوك لأنك رأيت فعلا بشرا يفوّتون رسالة دون قصد.

**التعب الموضوعي** : إذا تكررت كلمة أكثر من اللازم في آخر 10 رسائل (العتبة : 3 occurrences)، تُضرب المهلات ويزيد احتمال التجاهل بـ15%.

---

## الواقعية عمليا : عندما يصبح الأمر مخيفا

على الورق، تبدو كل هذه الأنظمة (المهلات والأخطاء المطبعية والتردد والنسيان) مجرد إكسسوارات. في الحقيقة، متراكمة طرفا لطرف، النتيجة مبهرة : أناس في محادثة مع Luna لا يشكون في شيء. إليكم تبادلا حقيقيا حيث يسأل شخص Luna مباشرة إن كانت بوتا، ثم تنحرف المحادثة بعد ذلك نحو موضوع آخر تماما، بطبيعية تقشعر لها الأبدان. لم أتوقع أن يكون بهذه المصداقية في الظروف الحقيقية.

![Conversation Discord avec Luna -- premier échange](/images/luna-protocol/realism/realism-01.png)

النبرة والتردد وإيقاع الردود : لا شيء يخون بوتا. تتهرب Luna من سؤال العمر دون كسر الشخصية أبدا.

![Conversation Discord avec Luna -- suite de l'échange](/images/luna-protocol/realism/realism-02.png)

تستمر المحادثة بسلاسة تامة، مع ردود قصيرة وطبيعية ("okay, okay" و"yay" و"yayy") : بالضبط نوع الرسائل التي يرسلها إنسان على Discord.

![Conversation Discord avec Luna -- dérive du sujet](/images/luna-protocol/realism/realism-03.png)

![Conversation Discord avec Luna -- suite de la dérive](/images/luna-protocol/realism/realism-04.png)

![Conversation Discord avec Luna -- fin de l'échange](/images/luna-protocol/realism/realism-05.png)

المخيف ليس أن Luna "ترد" فقط : بل أنها **تحافظ على محادثة**، بآراء ظاهرية ومتابعات وخيط فكر متسق من رسالة لأخرى. دون نظام المحفزات ومهلات التركيز والتردد الموصوفة أعلاه، لانهار هذا الوهم في بضع رسائل.

**مفاجأة صغيرة** : في اللقطات أعلاه، **الحسابان المتحادثان هما نسختان من Luna**. `PixieGlow` و`Sujet d'SBlow` ليسا إنسانا يختبر بوتا : بل بوتان يتكلمان بينهما، كل واحد مقتنع (بالمعنى السلوكي للكلمة) أنه يحادث شخصا "عاديا". إذا افترضت أثناء قراءة التبادل أعلاه أن أحد المتحاورين إنسان، فتهانينا : لقد وقعت في الفخ تماما كما يفعل أي كان على خادم Discord حقيقي.

إنها **dead internet theory** بنسخة عملية : هذه النظرية (التآمرية الأصل) تفترض أن حصة متزايدة من المحتوى والتفاعلات على الإنترنت ستُولَّد بواسطة بوتات بدلا من بشر، حتى يصبح الإنترنت الإنساني "الحقيقي" أقلية. لطالما اعتُبرت مبالغا فيها، وتصبح أقل عبثية كلما أظهرت أنظمة مثل Luna Protocol أنه لا يلزم الكثير من الوسائل ولا نموذج ضخم لمحاكاة حضور إنساني موثوق على نطاق واسع. نسختان من نفس البوت قادرتان على الحفاظ على محادثة مطولة دون أن تخونا أبدا، تعطيان لمحة ملموسة عما قد يبدو عليه ويب تسكنه غالبية بوتات تتكلم بينها.

---

## خط LLM : وضعان

### وضع `direct` (افتراضي)

يرسل البوت الطلبات مباشرة إلى `llama-server` محلي عبر HTTP. النموذج مشترك، مع كاش prompt و4 slots متزامنة. عمليتا PM2 : خادم LLM وعميل البوت.

### وضع `online`

يستدعي البوت أي API متوافقة مع OpenAI (OpenAI وOpenRouter وGroq وTogether...). تحتاج فقط مفتاح API، ويعمل LLM جهة المزود.

### البث في الوقت الحقيقي

يبث LLM رده سطرا بسطر (`\n`). كل سطر يُقطَّع إلى كلمات، تُبث واحدة بواحدة على `llmBus.emit("token", word)`. ومع كل `\n`، يُبث حدث `flush` : يرسل البوت فورا الرسالة المتراكمة. الإيقاع يتبع مباشرة إيقاع LLM.

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

تعالج قائمة الانتظار (`requestQueue`) الطلبات واحدا بواحد، مع تنظيف تلقائي عندما تتجاوز القائمة 100 عنصر.

---

## الرسائل العفوية

كل 5 دقائق، 12% احتمال أن تنشر Luna رسالة من تلقاء نفسها. يُختار الخادم بنظام **أوزان خطية** : الخادم الأكثر نشاطا له احتمال أكبر N× من الأخير.

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

يُقرأ سياق آخر 5 رسائل، وتنضم Luna للمحادثة "طبيعيا".

---

## خط TTS : الرسائل الصوتية

مع 8% احتمال، ترسل Luna رسالة صوتية بدلا من نص. الخط الكامل :

1. **Piper TTS** يركّب النص إلى WAV
2. **ffmpeg** يحوّل إلى OGG
3. يُحسب الـwaveform لمعاينة Discord
4. يُرفع الملف عبر Discord CDN API
5. تُرسل الرسالة الصوتية

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

![TTS Pipeline -- du texte synthétisé au message vocal Discord](/images/luna-protocol/10-tts-pipeline.svg)

---

## مكافحة السبام والحفظ

### مكافحة السبام

قائمة انتظار لكل `channelId:userId`. رسالة واحدة في الانتظار لكل مستخدم لكل قناة. تُعالَج بمجرد انتهاء الرد الجاري.

### حدود الجلسة

بعد 8 تبادلات، تأخذ Luna استراحة 30 ثانية. يُصفَّر العداد بعد 3 دقائق خمول.

### حفظ تلقائي

كل تغيير حالة يبث على `stateBus` ← حفظ تلقائي (debounce 500ms). لا حاجة لاستدعاءات `saveAllState()` يدوية. تتضمن الحالة المحفوظة : pendingMessages وpaused وcooldowns وtimestamps وlastSpeaker وعدادات المتابعة.

---

## الإعداد القابل لإعادة التحميل حيا

ملف `config.yml` واحد. معظم القيم **قابلة لإعادة التحميل حيا** : تُؤخذ التغييرات دون إعادة تشغيل. أردت ضبط المهلات مباشرة، دون قطع المحادثات الجارية.

| الفئة | إعادة تحميل حية |
|-----------|-----------|
| Triggers وkeywords والأسماء | ✅ |
| التركيز والمهلات | ✅ |
| Typos والdفعة والتعب | ✅ |
| جداول النوم | ✅ |
| TTS والرسائل الصوتية | ✅ |
| رمز Discord ووضع LLM | ❌ (يلزم إعادة تشغيل) |

```typescript
// config.ts -- المُحصِّلات تعيد قيما حية
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## الطقم : Discord-Dialogues

النموذج مضبوط على [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) : **7.3M تبادل** و**17M دور** و**140M كلمة**. محادثات Discord حقيقية ربيع-صيف 2025، مُرشَّحة (PII وToS وبوتات وأوامر). Apache 2.0.

| المقياس | القيمة |
|----------|--------|
| العينات | 7 303 464 |
| الأدوار الإجمالية | 16 881 010 |
| الكلمات الإجمالية | 139 922 950 |
| متوسط الرموز | 32.8 |
| المرمّز | Hermes-3-Llama-3.1-8B |

النموذج المُكمَّم المستخدم هو GGUF (مثلا `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Distribution du dataset Discord-Dialogues](/images/luna-protocol/dataset-distribution.svg)

---

![Complete Lifecycle -- comportement complet du bot du message à la réponse, incluant les timers et cas limites](/images/luna-protocol/22-complete-lifecycle.svg)

## مخططات البنية

يحوي مجلد `state-machines/` **24 مخطط Mermaid** تغطي كامل الكود المصدري. لكل مخطط شرح مفصل بلغة بشرية.

من أهمها :

| # | المخطط | النوع |
|---|-----------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (complet) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 backends) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

هذه المخططات منجم ذهب لفهم التدفق الكامل : من الرسالة الواردة إلى الرد، مرورا بالمؤقتات والحالات الحدية.

---

## كود التحفيز بالتفصيل

يُقيَّم المحفز بواسطة `evaluateMessage()` في `state/trigger.ts`. إليكم المنطق الكامل :

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

  // ... مطابقة بالاسم والكلمة والمتابعة والعشوائي
}
```

كاش الـregex (`hasWordCache`) يتجنب إعادة ترجمة الأنماط مع كل رسالة.

---

## التفاعلات

تتفاعل Luna مع الرسائل بالإيموجي. 30% احتمال استخدام إيموجي مخصص من الخادم، و70% إيموجي unicode. ينطلق التفاعل بعد مهلة التركيز، بنفس الإيقاع المتأخر كالردود. أحب هذا التأخر لأنك تشعر أنها أخذت وقت القراءة.

أوامر التفاعل على رسائل Luna :
- ❌ ← Stop
- ▶️ ← Start
- 🗑️ ← Clear

---

## أسلوب الرد

أسلوب الرد موزون حسب نشاط Luna الأخير في القناة :

| السياق | messageReference | mentionRepliedUser | الوزن |
|----------|-----------------|-------------------|-------|
| بارد | true | false | 70% |
| بارد | true | true | 20% |
| بارد | false | false | 10% |
| نشط | true | false | 50% |
| نشط | true | true | 15% |
| نشط | false | false | 30% |
| نشط | false | true | 5% |

في الرسائل الخاصة، `messageReference` دائما `false`.

---

## الرسائل المتتابعة

مع 15% احتمال، يُقطَّع رد إلى 2-3 أجزاء تُرسل بالإيقاع البشري (1.5-4 ثوانٍ بين كل جزء). يحاكي شخصا يكتب على عدة دفعات.

![Timing Gantt -- temps d'attente réels pour les délais, réactions, streaming LLM et corrections](/images/luna-protocol/21-timing-gantt.svg)

---

## الحالة الديناميكية

تتناوب حالة Discord الخاصة بـLuna بين عدة إعدادات مسبقة، كل 15 دقيقة. الأنواع المدعومة : Playing (0) وStreaming (1) وListening (2) وWatching (3) وCustom (4) وCompeting (5). أثناء النوم، تتحول الحالة إلى `invisible`.

```yaml
dynamic_status_presets:
  - status: online
    text: "avec les pixels"
    type: 0       # Playing
  - status: idle
    text: "du bruit blanc"
    type: 2       # Listening
```

تتجنب jitter عشوائية (×0.5-1.0) التناوبات المتوقعة. تُتخطَّى 10% من المحاولات لتجنب التكرار.

## مؤشر الكتابة

قبل استدعاء LLM، تستدعي Luna دالة `startTyping()`. يُحدّث `setInterval` المؤشر كل 8 ثوانٍ أثناء التوليد. يُنظَّف في `finally` (`clearInterval`).

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

## الاستعادة بعد الانهيار

إذا انهار LLM (عملية `llama-server` تموت)، تكشف Luna الحدث عبر `llmBus.emit("crash", code)` وتحاول إعادة التشغيل مع backoff أسّي. تتجنب حلقات إعادة التشغيل اللانهائية.

## معاملات LLM

المعاملات مُرمَّزة صلبا في `src/config.ts` :

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

يُستخدم قالب ChatML (`<|im_start|>/<|im_end|>`). عدد الخيوط مُكتَشَف تلقائيا عبر `os.cpus().length`.

---

## الإعداد

```bash
npm install
cp config.example.yml config.yml
# تحرير config.yml
npm run dev                    # تطوير (إعادة تحميل حية)
npm run build && npm start     # production
```

| السكربت | الوصف |
|--------|-------------|
| `build` | حزمة CLI مستقلة |
| `start` | يشغّل البوت |
| `lint` / `format` / `check` | Biome |
| `test` | اختبارات (Bun) |
| `download-model` | GGUF من HuggingFace |
| `diagrams` | يصدّر مخططات Mermaid إلى SVG/PNG |

### النشر بـPM2

```bash
./start.sh   # lance llm-server + llm-client sous PM2
```

---

## الخلاصة

يتجاوز Luna Protocol بكثير بوت Discord مع LLM. إنه **نظام سلوكي كامل** يحاكي العيوب الإنسانية : النسيان والأخطاء المطبعية والنوم والتردد والتعب. الكل مُبنَى حول ناقل أحداث مُنمَّط، مع 24 مخطط Mermaid توثق كل تدفق.

الكود مفتوح المصدر، والطقم عام، والإعداد قابل لإعادة التحميل حيا. إذا كان الموضوع يهمك، اغُص في الكود : إنه أسهل مما يبدو. استخدمته كأساس لاختبار الكثير من الأفكار حول السلوك، ويمكنك استعادة كل وحدة منفردة.

| المورد | الرابط |
|-----------|------|
| مستودع GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| الطقم | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| خريطة Atlas | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
