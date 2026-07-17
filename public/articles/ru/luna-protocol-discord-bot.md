---
title: "Luna Protocol: я создал автономного Discord-бота, который симулирует человека"
description: "Luna Protocol -- это полностью автономный Discord-бот с локальным LLM, способный к естественному общению со сном, опечатками, колебаниями, забывчивостью, тематической усталостью и спонтанными сообщениями."
date: 2026-07-11
authors:
  - fox3000foxy
tags:
  - discord
  - llm
  - typescript
  - event-driven-architecture
  - ai
  - open-source
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "NgRzo9KNJCcoSa5YfyoKIlUdzqOnUYQtPoDmveC3kiAa8LovDqwUuB+dwRKvczPw5DBmwUlnzKOXr09aFg+28A=="
---

# Luna Protocol: я создал автономного Discord-бота, который симулирует человека

Что, если бы Discord-бот мог **спать**, делать **опечатки**, **колебаться**, **забывать** ответить, а иногда и сам писать вам сообщения? Именно это и делает **Luna Protocol**: полностью автономный Discord-бот, который запускает локальный LLM (llama.cpp) и общается как несовершенный человек.

Никаких жёстких промптов, никаких роботизированных ответов. У Luna есть **система приоритетного срабатывания**, **переменные задержки**, **расписание сна**, **спонтанные сообщения** и даже **TTS-пайплайн** для отправки голосовых сообщений. Всё настраивается через простой `config.yml` с горячей перезагрузкой.

В этой статье мы разберём полную архитектуру: от универсальной шины событий до TTS-пайплайна, системы срабатывания, человеческих компонентов и датасета для тонкой настройки.

![Обзор архитектуры -- глобальные компоненты и потоки данных](/images/luna-protocol/01-architecture-overview.svg)

---

## Архитектура: типизированная шина событий

Ядро Luna -- это **TypedBus** -- универсальная строго типизированная шина событий на TypeScript. Это фундаментальный строительный блок, на котором всё держится.

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

От неё происходит две основные шины:

- **`llmBus`** -- управляет токенами LLM, ошибками, сбоями, сбросом
- **`stateBus`** -- управляет изменениями состояния с автоматической персистентностью

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

Преимущество такого подхода: каждый модуль **отвязан** от остальных. LLM испускает токены на шину, бот их потребляет, состояние обновляется автоматически. Никаких циклических зависимостей.

---

![Обработка сообщений -- полный поток обработки сообщения](/images/luna-protocol/02-message-processing.svg)

## Система срабатывания: кто решает, когда Luna отвечает?

Каждое входящее сообщение оценивается функцией `evaluateMessage()`, которая возвращает `TriggerResult` с причиной срабатывания. Порядок приоритета критичен:

| # | Причина | Условия | Пропуск игнора | Пропуск паузы |
|---|---------|---------|----------------|---------------|
| 1 | `mention` | @bot | Да (0%) | Да |
| 2 | `dm` | ЛС с `replyInDM = true` | Да (0%) | Нет |
| 3 | `name` | "Luna"/"Pixie"/псевдоним (целое слово) | Нет (8%) | Нет |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (целое слово) | Нет (8%) | Нет |
| 5 | `follow-up` | Бот был последним говорящим + < 15 с + < 3 / 60 с | -- | -- |
| 6 | `random` | 1.5% шанс на несоответствующие сообщения | Нет (8%) | Нет |

Сопоставление по **целому слову** (`\b`): "ai" не соответствует "mais", "vrai", "lait".

![Оценка срабатывания -- решение о входе для каждого сообщения](/images/luna-protocol/03-trigger-evaluation.svg)

### Механизм follow-up

Когда Luna отвечает на сообщение, она регистрируется как `lastSpeaker`. Любое следующее сообщение в течение 15 секунд вызывает **немедленный** ответ -- без таймера, без проверки ключевых слов. Бюджет: 3 follow-up на окно в 60 секунд.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### Кулдаун

8 секунд между двумя ответами в одном канале. Обходится упоминаниями и follow-up.

---

## Человеческое поведение: переменная концентрация

Вот здесь Luna становится интересной. Каждый тип срабатывания имеет свои **пороги концентрации**: минимальная/максимальная задержка, шанс проигнорировать и шанс среагировать.

| Триггер | Мин. задержка | Макс. задержка | Игнор | Реакция |
|---------|--------------|---------------|-------|---------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

Расчёт задержки также учитывает:
- **Длину сообщения**: чем длиннее сообщение, тем больше времени Luna тратит на "чтение"
- **Бездействие**: если Luna не была активна более 10 минут, задержка умножается на 2 (симуляция "пробуждения")
- **Сон**: в режиме `slow` задержка умножается на 3-5

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
  delay *= 0.5 + Math.random() * 1.5; // агрессивный jitter
  return delay;
}
```

---

## Расписание сна

Luna может спать. Настраивается через `config.yml`:

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
|-------|--------|
| `sleep` | Проходят только упоминания и ЛС |
| `slow` | Задержка ×3-5, реакции почти нулевые |
| `short` | Шанс игнора +30%, реакции почти нулевые |

В часы сна статус Discord переключается на `invisible`.

---

## Опечатки

Luna может делать опечатки -- и исправлять их через 2-4 секунды. Раскладка клавиатуры настраивается (AZERTY или QWERTY).

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... все соседние клавиши
};
```

Пример AZERTY: `bonjour -> bonjpur`, `salut -> slaut`, `comment -> cpmment`.

Три стиля исправления:

| Стиль | Поведение |
|-------|----------|
| `edit` | Редактирует сообщение |
| `message` | Новое сообщение: `слово*` |
| `mixed` | 50/50 случайно (по умолчанию) |

---

## Колебания и забывчивость

**Колебания**: 15% шанс начать со слова-заполнителя (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**Забывчивость**: даже после совпадения триггера Luna может "забыть" ответить с вероятностью 3%. Никакого сообщения, никакой реакции -- как будто ничего не заметила.

**Тематическая усталость**: если слово встречается слишком часто в последних 10 сообщениях (порог: 3 вхождения), задержки умножаются, а шанс игнора увеличивается на 15%.

---

## Реализм на практике: когда становится жутковато

На бумаге все эти механизмы (задержки, опечатки, заминки, забывчивость) звучат как трюк. На практике, всё вместе, результат впечатляет -- настолько, что собеседники Луны ни о чём не догадываются. Вот реальный диалог, где кто-то напрямую спрашивает Луну, бот ли она, а разговор затем уходит совсем в другую тему с пугающей естественностью.

![Переписка в Discord с Луной -- начало диалога](/images/luna-protocol/realism/realism-01.png)

Тон, заминки, темп ответов -- ничто не выдаёт бота. Луна уходит от вопроса о возрасте, ни разу не выйдя из роли.

Разговор продолжается совершенно естественно, с короткими человеческими репликами ("okay, okay", "yay", "yayy") -- именно такими сообщениями обычно переписываются в Discord.

![Переписка в Discord с Луной -- продолжение](/images/luna-protocol/realism/realism-02.png)

![Переписка в Discord с Луной -- смена темы](/images/luna-protocol/realism/realism-03.png)

![Переписка в Discord с Луной -- тема продолжает меняться](/images/luna-protocol/realism/realism-04.png)

![Переписка в Discord с Луной -- конец диалога](/images/luna-protocol/realism/realism-05.png)

Пугает не то, что Луна "отвечает" -- а то, что она **ведёт разговор**, с явными мнениями, уточнениями и связной мыслью от сообщения к сообщению. Без описанной выше системы триггеров, задержек концентрации и заминок эта иллюзия рассыпалась бы за пару сообщений.

**Небольшой твист**: на скриншотах выше **оба аккаунта, ведущих беседу, -- это инстансы Луны**. `PixieGlow` и `Sujet d'SBlow` -- это не человек, тестирующий бота, а два бота, разговаривающих друг с другом, каждый из которых поведенчески "уверен", что общается с кем-то "нормальным". Если, читая диалог выше, вы решили, что один из собеседников -- человек, поздравляем -- вы только что попались точно так же, как попался бы любой на настоящем Discord-сервере.

По сути, это практическая версия **теории мёртвого интернета**: согласно ей (изначально довольно маргинальной идее), всё большая доля онлайн-контента и взаимодействий генерируется ботами, а не людьми, настолько, что "настоящий" человеческий интернет становится меньшинством. Долгое время эта теория считалась преувеличением, но она выглядит всё менее абсурдной, когда такие системы, как Luna Protocol, показывают, что для убедительной имитации человеческого присутствия в больших масштабах не нужно ни много вычислительных ресурсов, ни огромной модели. Два инстанса одного и того же бота, способные вести длинный разговор, ни разу не выдав себя, дают вполне конкретное представление о том, каким может быть веб, населённый преимущественно ботами, разговаривающими друг с другом.

---

## Пайплайн LLM: два режима

### Режим `direct` (по умолчанию)

Бот отправляет запросы напрямую локальному `llama-server` по HTTP. Модель общая, с кэшем промптов и 4 одновременными слотами. Два процесса PM2: сервер LLM и клиент бота.

### Режим `online`

Бот вызывает любую API, совместимую с OpenAI (OpenAI, OpenRouter, Groq, Together...). Локальный LLM не требуется.

### Стриминг в реальном времени

LLM стримит ответ построчно (`\n`). Каждая строка разбивается на слова, которые испускаются по одному через `llmBus.emit("token", word)`. На каждом `\n` испускается событие `flush` -- бот немедленно отправляет накопленное сообщение. Без симулированной задержки: ритм задаётся LLM.

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

Очередь (`requestQueue`) обрабатывает запросы по одному, с автоматической очисткой при превышении 100 элементов.

---

## Спонтанные сообщения

Каждые 5 минут с вероятностью 12% Luna может самостоятельно опубликовать сообщение. Сервер выбирается через систему **линейных весов**: самый активный сервер имеет в N раз больше шансов, чем последний.

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

Читается контекст последних 5 сообщений, и Luna "естественно" вливается в разговор.

---

## TTS-пайплайн: голосовые сообщения

С вероятностью 8% Luna отправляет голосовое сообщение вместо текста. Полный пайплайн:

1. **Piper TTS** синтезирует текст в WAV
2. **ffmpeg** конвертирует в OGG
3. Вычисляется форма волны для превью Discord
4. Файл загружается через API CDN Discord
5. Отправляется голосовое сообщение

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

![TTS-пайплайн -- от синтезированного текста до голосового сообщения в Discord](/images/luna-protocol/10-tts-pipeline.svg)

---

## Антиспам и персистентность

### Антиспам

Очередь по `channelId:userId`. Одно сообщение в очереди на пользователя на канал. Обрабатывается, как только завершается текущий ответ.

### Лимиты сессии

После 8 обменов Luna делает паузу на 30 секунд. Счётчик сбрасывается после 3 минут бездействия.

### Автоматическая персистентность

Каждая мутация состояния испускает событие на `stateBus` -> автоматическое сохранение (debounce 500ms). Ручные вызовы `saveAllState()` больше не нужны. Сохраняемое состояние включает: pendingMessages, paused, cooldowns, timestamps, lastSpeaker, счётчики follow-up.

---

## Конфигурация с горячей перезагрузкой

Единый файл `config.yml`. Большинство значений **горяче перезагружаемы** -- изменения применяются без перезапуска.

| Категория | Горячая перезагрузка |
|-----------|---------------------|
| Триггеры, ключевые слова, имена | ✅ |
| Концентрация, задержки | ✅ |
| Опечатки, burst, усталость | ✅ |
| Расписание сна | ✅ |
| TTS, голосовые сообщения | ✅ |
| Discord token, режим LLM | ❌ (требуется перезапуск) |

```typescript
// config.ts -- геттеры возвращают актуальные значения
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## Датасет: Discord-Dialogues

Модель дообучена на [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues): **7.3M обменов**, **17M реплик**, **140M слов**. Реальные Discord-диалоги весна-лето 2025, отфильтрованные (PII, ToS, боты, команды). Apache 2.0.

| Метрика | Значение |
|---------|----------|
| Сэмплов | 7 303 464 |
| Всего реплик | 16 881 010 |
| Всего слов | 139 922 950 |
| Среднее токенов | 32.8 |
| Токенизатор | Hermes-3-Llama-3.1-8B |

Используется квантованная модель GGUF (например, `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Распределение датасета Discord-Dialogues](/images/luna-protocol/dataset-distribution.svg)

---

![Полный жизненный цикл -- полное поведение бота от сообщения до ответа, включая таймеры и граничные случаи](/images/luna-protocol/22-complete-lifecycle.svg)

## Диаграммы архитектуры

Папка `state-machines/` содержит **24 Mermaid-диаграммы**, покрывающие весь исходный код. Каждая диаграмма имеет подробное объяснение на человеческом языке.

Среди наиболее важных:

| # | Диаграмма | Тип |
|---|-----------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (полная) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 бэкенда) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

Эти диаграммы -- настоящий клад для понимания полного потока: от входящего сообщения до ответа, включая таймеры и граничные случаи.

---

## Код срабатывания в деталях

Триггер оценивается функцией `evaluateMessage()` в `state/trigger.ts`. Вот полная логика:

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

  // ... сопоставление по имени, ключевому слову, follow-up, случайно
}
```

Кэш regex (`hasWordCache`) предотвращает перекомпиляцию шаблонов при каждом сообщении.

---

## Реакции

Luna реагирует на сообщения эмодзи. 30% шанс использовать кастомный эмодзи сервера, 70% -- Unicode-эмодзи. Реакция срабатывает после задержки концентрации, а не мгновенно.

Команды через реакции на сообщения Luna:
- ❌ -> Stop
- ▶️ -> Start
- 🗑️ -> Clear

---

## Стиль ответа

Стиль ответа взвешивается в зависимости от недавней активности Luna в канале:

| Контекст | messageReference | mentionRepliedUser | Вес |
|----------|-----------------|-------------------|-----|
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

С вероятностью 15% ответ разбивается на 2-3 фрагмента, отправляемых в человеческом темпе (1.5-4 секунды между фрагментами). Симулирует человека, который печатает в несколько заходов.

![Временная диаграмма Ганта -- реальное время ожидания для задержек, реакций, стриминга LLM и исправлений](/images/luna-protocol/21-timing-gantt.svg)

---

## Динамический статус

Статус Discord Luna переключается между несколькими настроенными пресетами, меняясь каждые 15 минут. Поддерживаемые типы: Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). Во время сна статус переключается на `invisible`.

```yaml
dynamic_status_presets:
  - status: online
    text: "с пикселями"
    type: 0       # Playing
  - status: idle
    text: "белый шум"
    type: 2       # Listening
```

Случайный jitter (×0.5-1.0) предотвращает предсказуемые смены. 10% попыток пропускаются во избежание повторений.

## Индикатор печати

Перед вызовом LLM Luna вызывает `startTyping()`. `setInterval` обновляет индикатор каждые 8 секунд во время генерации. Очищается в блоке `finally` (`clearInterval`).

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

## Восстановление после сбоя

Если LLM падает (процесс `llama-server` умирает), Luna обнаруживает событие через `llmBus.emit("crash", code)` и пытается перезапуститься с экспоненциальной задержкой. Избегает бесконечных циклов перезапуска.

## Параметры LLM

Параметры жестко заданы в `src/config.ts`:

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

Используется шаблон ChatML (`<|im_start|>/<|im_end|>`). Количество потоков определяется автоматически через `os.cpus().length`.

---

## Установка

```bash
npm install
cp config.example.yml config.yml
# отредактировать config.yml
npm run dev                    # dev (горячая перезагрузка)
npm run build && npm start     # production
```

| Скрипт | Описание |
|--------|----------|
| `build` | Сборка автономного CLI-бандла |
| `start` | Запуск бота |
| `lint` / `format` / `check` | Biome |
| `test` | Тесты (Bun) |
| `download-model` | GGUF с HuggingFace |
| `diagrams` | Экспорт Mermaid-диаграмм в SVG/PNG |

### Развёртывание PM2

```bash
./start.sh   # запускает llm-server + llm-client под PM2
```

---

## Заключение

Luna Protocol -- это не просто Discord-бот с LLM. Это **полноценная поведенческая система**, симулирующая человеческие несовершенства: забывчивость, опечатки, сон, колебания, усталость. Вся архитектура построена вокруг типизированной шины событий, с 24 Mermaid-диаграммами, документирующими каждый поток.

Код открыт, датасет публичен, а конфигурация поддерживает горячую перезагрузку. Если вам это интересно -- погружайтесь в код, всё доступнее, чем кажется.

| Ресурс | Ссылка |
|--------|--------|
| GitHub-репозиторий | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Датасет | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
