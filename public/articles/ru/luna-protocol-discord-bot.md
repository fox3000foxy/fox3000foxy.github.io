---
title: "Luna Protocol : я создал автономного Discord-бота, симулирующего человека"
description: "Luna Protocol это полностью автономный Discord-бот с локальным LLM, способный к естественному разговору со сном, опечатками, колебаниями, забываниями, тематической усталостью и спонтанными сообщениями."
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
author_sig: "C3FfkaDht4Igij6XuSzVsaR5iNRWMUuvvkN2Jtv3ul1sKFhzYJXmpPp13V34ykrx6s4ofZrcXVBYDPxvhWbM9g=="
---

# Luna Protocol : я создал автономного Discord-бота, симулирующего человека

А если Discord-бот сможет **спать**, делать **опечатки**, **колебаться**, **забывать** ответить, а иногда присылать тебе сообщение по собственной инициативе? Именно это делает **Luna Protocol** : полностью автономный Discord-бот, крутящий локальный LLM (llama.cpp) и общающийся как несовершенный человек.

Luna работает на контекстных триггерах и осознанно несовершенных ответах. У неё **приоритетная система триггеров**, **переменные задержки**, **расписание сна**, **спонтанные сообщения** и даже **TTS-пайплайн** для отправки голосовых сообщений. Всё настраивается через простой файл `config.yml` с hot-reload.

В этой статье я разбираю полную архитектуру : от обобщённой шины событий до TTS-пайплайна, через систему триггеров, человеческие компоненты и датасет дообучения.

![Architecture Overview -- глобальные компоненты и потоки данных](/images/luna-protocol/01-architecture-overview.svg)

---

## Архитектура : типизированная шина событий

Ядро Luna это **TypedBus** : обобщённая строго типизированная шина событий на TypeScript. Это фундаментальный кирпич, на котором стоит всё. Я построил её так, потому что хотел избежать циклических зависимостей с самого начала.

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

Из неё вытекают две главные шины :

- **`llmBus`** : управляет LLM-токенами, ошибками, крашами, сбросом
- **`stateBus`** : управляет изменениями состояния с автоперсистенсом

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

Преимущество этого подхода : каждый модуль **отвязан** от остального. LLM испускает токены в шину, бот их потребляет, состояние обновляется автоматически. Никаких циклических зависимостей.

---

![Message Processing -- полный поток обработки сообщения](/images/luna-protocol/02-message-processing.svg)

## Система триггеров : кто решает, когда Luna отвечает?

Каждое входящее сообщение оценивается через `evaluateMessage()`, возвращающую `TriggerResult` с причиной срабатывания. Порядок приоритетов критичен :

| # | Причина | Условия | Обход игнора | Обход паузы |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | Да (0%) | Да |
| 2 | `dm` | ЛС с `replyInDM = true` | Да (0%) | Нет |
| 3 | `name` | "Luna"/"Pixie"/alias (целое слово) | Нет (8%) | Нет |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (целое слово) | Нет (8%) | Нет |
| 5 | `follow-up` | Бот был последним говорящим + < 15s + < 3 / 60s | -- | -- |
| 6 | `random` | 1.5% шанса на несовпавших сообщениях | Нет (8%) | Нет |

Матчинг это **целое слово** (`\b`) : "ai" не совпадает с "mais", "vrai", "lait".

![Trigger evaluation -- входное решение для каждого сообщения](/images/luna-protocol/03-trigger-evaluation.svg)

### Механизм follow-up

Когда Luna отвечает на сообщение, она регистрируется как `lastSpeaker`. Любое следующее сообщение в течение 15 секунд триггерит **немедленный** ответ, закорачивая таймеры и проверки ключевых слов. Бюджет : 3 follow-up на окно в 60 секунд.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### Cooldown

8 секунд между двумя ответами в одном канале. Обходится упоминаниями и follow-up.

---

## Человеческие поведения : переменная концентрация

Здесь Luna становится интересной. У каждого типа триггера свои **пороги концентрации** : минимальный/максимальный délai, шанс игнорировать и шанс отреагировать.

| Триггер | Задержка мин | Задержка макс | Игнор | Реакция |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

Расчёт задержки учитывает и :
- **Длину сообщения** : чем длиннее сообщение, тем дольше Luna его "читает"
- **Неактивность** : если Luna не была активна 10 минут, задержка умножается на 2 (симуляция "пробуждения")
- **Сон** : в режиме `slow` задержка умножается на 3-5

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
  delay *= 0.5 + Math.random() * 1.5; // агрессивный джиттер
  return delay;
}
```

---

## Расписание сна

Luna может спать. Настраивается через `config.yml` :

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

| Режим | Эффект |
|------|-------|
| `sleep` | Проходят только упоминания и ЛС |
| `slow` | Задержка ×3-5, реакции почти нулевые |
| `short` | Шанс игнора +30%, реакции почти нулевые |

В часы сна статус Discord переходит в `invisible`.

---

## Опечатки

Luna может делать опечатки, исправляемые через 2-4 секунды. Раскладка клавиатуры настраивается (AZERTY или QWERTY). Я оставил настраиваемым, потому что бота, пишущего слишком чисто, видно сразу.

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... все соседние клавиши
};
```

Пример AZERTY : `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`.

Три стиля исправления :

| Стиль | Поведение |
|-------|-------------|
| `edit` | Редактирует сообщение |
| `message` | Новое сообщение : `word*` |
| `mixed` | 50/50 случайно (дефолт) |

---

## Колебания и забывания

**Колебания** : 15 % шанса начать с filler-слова (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**Забывания** : даже сматчив триггер, Luna может "забыть" ответить с вероятностью 3 %. Она остаётся полностью молчаливой, будто ничего не видела. Обожаю это поведение, потому что ты уже видел людей, случайно заппивших сообщение.

**Тематическая усталость** : если слово возвращается слишком часто в последних 10 сообщениях (порог : 3 вхождения), задержки умножаются, а шанс игнора растёт на 15 %.

---

## Реализм на практике : когда становится жутко

На бумаге все эти системы (задержки, опечатки, колебания, забывания) выглядят гаджетом. Вживую, сложенные вместе, результат ошеломляет : люди в разговоре с Luna ни о чём не догадываются. Вот реальный обмен, где кто-то прямо спрашивает Luna, бот ли она, и где разговор затем съезжает на совсем другую тему с естественностью, от которой мороз по коже. Я не ожидал, что это будет так убедительно в реальных условиях.

![Разговор Discord с Luna -- первый обмен](/images/luna-protocol/realism/realism-01.png)

Тон, колебания, ритм ответов : ничего не выдаёт бота. Luna уходит от вопроса про возраст, ни разу не сломав персонажа.

![Разговор Discord с Luna -- продолжение обмена](/images/luna-protocol/realism/realism-02.png)

Разговор продолжается совершенно плавно, с короткими естественными ответами ("okay, okay", "yay", "yayy") : ровно такие сообщения человек слал бы в Discord.

![Разговор Discord с Luna -- съезд темы](/images/luna-protocol/realism/realism-03.png)

![Разговор Discord с Luna -- продолжение съезда](/images/luna-protocol/realism/realism-04.png)

![Разговор Discord с Luna -- конец обмена](/images/luna-protocol/realism/realism-05.png)

Жуткое не то, что Luna "отвечает" : а то, что она **держит разговор** с видимыми мнениями, подхватами, связной нитью мысли от сообщения к сообщению. Без системы триггеров, задержек концентрации и колебаний, описанных выше, эта иллюзия рухнула бы за несколько сообщений.

**Маленький plot twist** : на скриншотах выше **оба обсуждающих аккаунта это инстансы Luna**. `PixieGlow` и `Sujet d'SBlow` не человек, тестирующий бота : это два бота, говорящие друг с другом, каждый (в поведенческом смысле) уверен, что общается с кем-то "нормальным". Если, читая обмен выше, ты предположил, что один из собеседников человек, поздравляю : ты только что попался в ловушку ровно как любой на настоящем сервере Discord.

Это немного **dead internet theory** на практике : эта теория (изначально скорее конспирологическая) постулирует, что растущая доля онлайн-контента и взаимодействий генерировалась бы ботами, а не людьми, до точки, где "настоящий" человеческий интернет стал бы меньшинством. Долго считавшаяся преувеличенной, она становится всё менее абсурдной по мере того, как системы вроде Luna Protocol показывают, что не нужно ни больших средств, ни огромной модели, чтобы симулировать убедительное человеческое присутствие в большом масштабе. Два инстанса одного бота, способных держать длинный разговор, ни разу себя не выдав, дают довольно конкретное представление о том, как мог бы выглядеть веб, населённый в основном ботами, говорящими друг с другом.

---

## LLM-пайплайн : два режима

### Режим `direct` (дефолт)

Бот шлёт запросы напрямую локальному `llama-server` по HTTP. Модель общая, с кэшем промпта и 4 конкурентными слотами. Два процесса PM2 : LLM-сервер и клиент-бот.

### Режим `online`

Бот зовёт любой OpenAI-совместимый API (OpenAI, OpenRouter, Groq, Together...). Нужен только API-ключ, LLM крутится на стороне провайдера.

### Стриминг в реальном времени

LLM стримит свой ответ построчно (`\n`). Каждая строка режется на слова, испускаемые по одному в `llmBus.emit("token", word)`. На каждом `\n` испускается событие `flush` : бот сразу отправляет накопленное сообщение. Ритм следует напрямую за LLM.

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

Очередь (`requestQueue`) обрабатывает запросы по одному, с авточисткой, когда очередь превышает 100 элементов.

---

## Спонтанные сообщения

Каждые 5 минут 12 % шанса, что Luna запостит сообщение по собственной инициативе. Сервер выбирается системой **линейных весов** : самый активный сервер имеет в N раз больше шансов, чем последний.

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

Контекст последних 5 сообщений читается, и Luna присоединяется к разговору "естественно".

---

## TTS-пайплайн : голосовые сообщения

С шансом 8 % Luna отправляет голосовое сообщение вместо текста. Полный пайплайн :

1. **Piper TTS** синтезирует текст в WAV
2. **ffmpeg** конвертирует в OGG
3. Waveform вычисляется для предпросмотра Discord
4. Файл загружается через Discord CDN API
5. Голосовое сообщение отправляется

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

![TTS Pipeline -- от синтезированного текста к голосовому сообщению Discord](/images/luna-protocol/10-tts-pipeline.svg)

---

## Антиспам и персистентность

### Антиспам

Очередь на `channelId:userId`. Одно сообщение в очереди на пользователя на канал. Обрабатывается, как только текущий ответ завершается.

### Лимиты сессий

После 8 обменов Luna делает паузу на 30 секунд. Счётчик сбрасывается после 3 минут неактивности.

### Автоперсистентность

Каждая мутация состояния испускает в `stateBus` → автосохранение (debounce 500ms). Больше не нужны ручные вызовы `saveAllState()`. Персистимое состояние включает : pendingMessages, paused, cooldowns, timestamps, lastSpeaker, счётчики follow-up.

---

## Hot-reload конфигурации

Один файл `config.yml`. Большинство значений **hot-reloadable** : изменения учитываются без перезапуска. Я хотел подкручивать задержки вживую, не обрывая текущие разговоры.

| Категория | Hot-reload |
|-----------|-----------|
| Триггеры, keywords, имена | ✅ |
| Концентрация, задержки | ✅ |
| Опечатки, burst, усталость | ✅ |
| Расписания сна | ✅ |
| TTS, голосовые сообщения | ✅ |
| Токен Discord, режим LLM | ❌ (нужен рестарт) |

```typescript
// config.ts -- геттеры возвращают живые значения
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## Датасет : Discord-Dialogues

Модель дообучена на [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) : **7.3M обменов**, **17M ходов**, **140M слов**. Настоящие разговоры Discord весна-лето 2025, отфильтрованные (PII, ToS, боты, команды). Apache 2.0.

| Метрика | Значение |
|----------|--------|
| Образцы | 7 303 464 |
| Всего ходов | 16 881 010 |
| Всего слов | 139 922 950 |
| Средне токенов | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

Используемая квантованная модель это GGUF (например `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Распределение датасета Discord-Dialogues](/images/luna-protocol/dataset-distribution.svg)

---

![Complete Lifecycle -- полное поведение бота от сообщения до ответа, включая таймеры и пограничные случаи](/images/luna-protocol/22-complete-lifecycle.svg)

## Диаграммы архитектуры

Папка `state-machines/` содержит **24 диаграммы Mermaid**, покрывающие весь исходник. У каждой диаграммы детальное объяснение человеческим языком.

Среди важнейших :

| # | Диаграмма | Тип |
|---|-----------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Обработка сообщений (полная) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 backends) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

Эти диаграммы золотая жила для понимания полного потока : от входящего сообщения до ответа, через таймеры и пограничные случаи.

---

## Код триггеров в деталях

Триггер оценивается через `evaluateMessage()` в `state/trigger.ts`. Вот полная логика :

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

  // ... матчинг по имени, keyword, follow-up, random
}
```

Кэш regex (`hasWordCache`) избегает перекомпиляции паттернов при каждом сообщении.

---

## Реакции

Luna реагирует на сообщения эмодзи. 30 % шанса использовать кастомный эмодзи сервера, 70 % unicode-эмодзи. Реакция уходит после задержки концентрации, с тем же сдвинутым ритмом, что и ответы. Люблю этот сдвиг, потому что чувствуется, что она потратила время на чтение.

Команды реакциями на сообщения Luna :
- ❌ → Stop
- ▶️ → Start
- 🗑️ → Clear

---

## Стиль ответа

Стиль ответа взвешивается по недавней активности Luna в канале :

| Контекст | messageReference | mentionRepliedUser | Вес |
|----------|-----------------|-------------------|-------|
| Холодный | true | false | 70% |
| Холодный | true | true | 20% |
| Холодный | false | false | 10% |
| Активный | true | false | 50% |
| Активный | true | true | 15% |
| Активный | false | false | 30% |
| Активный | false | true | 5% |

В ЛС `messageReference` всегда `false`.

---

## Сообщения очередями

С шансом 15 % ответ режется на 2-3 фрагмента, отправляемых в человеческом ритме (1.5-4 секунды между фрагментами). Симулирует человека, печатающего в несколько приёмов.

![Timing Gantt -- реальные времена ожидания для задержек, реакций, стриминга LLM и исправлений](/images/luna-protocol/21-timing-gantt.svg)

---

## Динамический статус

Статус Discord у Luna чередуется между несколькими настроенными пресетами, ротация каждые 15 минут. Поддерживаемые типы : Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). Во время сна статус переходит в `invisible`.

```yaml
dynamic_status_presets:
  - status: online
    text: "с пикселями"
    type: 0       # Играет
  - status: idle
    text: "белый шум"
    type: 2       # Слушает
```

Случайный джиттер (×0.5-1.0) избегает предсказуемых ротаций. 10 % попыток пропускаются, чтобы избежать повторов.

## Индикатор печати

Перед вызовом LLM Luna зовёт `startTyping()`. `setInterval` обновляет индикатор каждые 8 секунд во время генерации. Чистится в `finally` (`clearInterval`).

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

## Восстановление после краша

Если LLM крашится (умирает процесс `llama-server`), Luna детектит событие через `llmBus.emit("crash", code)` и пытается перезапуститься с экспоненциальным backoff. Избегает бесконечных петель перезапуска.

## Параметры LLM

Параметры захардкожены в `src/config.ts` :

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

Используется шаблон ChatML (`<|im_start|>/<|im_end|>`). Число потоков автодетектится через `os.cpus().length`.

---

## Установка

```bash
npm install
cp config.example.yml config.yml
# редактируем config.yml
npm run dev                    # dev (hot reload)
npm run build && npm start     # production
```

| Скрипт | Описание |
|--------|-------------|
| `build` | Автономный CLI-бандл |
| `start` | Запускает бота |
| `lint` / `format` / `check` | Biome |
| `test` | Tests (Bun) |
| `download-model` | GGUF с HuggingFace |
| `diagrams` | Экспорт диаграмм Mermaid в SVG/PNG |

### Деплой PM2

```bash
./start.sh   # запускает llm-server + llm-client под PM2
```

---

## Заключение

Luna Protocol идёт сильно дальше Discord-бота с LLM. Это **полная поведенческая система**, симулирующая человеческие несовершенства : забывания, опечатки, сон, колебания, усталость. Всё заархитектурено вокруг типизированной шины событий, с 24 диаграммами Mermaid, документирующими каждый поток.

Код открытый, датасет публичный, а конфигурация с hot-reload. Если тема интересна, ныряй в код : он доступнее, чем кажется. Я использовал это как базу для проверки многих идей про поведение, и ты можешь переиспользовать каждый модуль отдельно.

| Ресурс | Ссылка |
|-----------|------|
| Репозиторий GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
