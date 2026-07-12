---
title: "Luna Protocol: я создал автономного Discord-бота, имитирующего человека"
description: "Luna Protocol -- это полностью автономный Discord-бот с локальным LLM, способный вести естественные беседы со сном, опечатками, колебаниями, забывчивостью, тематической усталостью и спонтанными сообщениями."
date: 2026-07-11
tags:
  - discord-bot
  - llm
  - typescript
  - событийно-ориентированная-архитектура
  - искусственный-интеллект
  - свободное-по
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "5pl9Ioc8yjTP20iuOcJBWkhUNThedG9pZ4/eKVoyejjk2elm2WKxWVrL0buwRD2jXvu96oXhySVabCeS5Z0L2w=="
---

# Luna Protocol: Я создал автономного Discord-бота, имитирующего человека
Что если Discord-бот мог бы **спать**, допускать **опечатки**, **колебаться**, **забывать** отвечать, а иногда отправлять сообщения по собственной инициативе? Именно это и делает **Luna Protocol**: полностью автономный Discord-бот, работающий на локальном LLM (llama.cpp) и ведущий себя как несовершенный человек.
Без жёстких промптов, без роботизированных ответов. У Luna есть **система триггеров с приоритетами**, **переменные задержки**, **режимы сна**, **спонтанные сообщения** и даже **TTS-пайплайн** для отправки голосовых сообщений. Всё настраивается через простой файл `config.yml` с горячей перезагрузкой.
В этой статье мы разбираем полную архитектуру: от универсальной шины событий до TTS-пайплайна, включая систему триггеров, человекоподобные компоненты и набор данных для дообучения.
![Обзор архитектуры -- глобальные компоненты и потоки данных](/images/luna-protocol/01-architecture-overview.svg)

---

## Архитектура: типизированная шина событий

Ядро Luna — это **TypedBus** — обобщённая шину событий с сильной типизацией на TypeScript. Это фундаментальный блок, на котором всё основано.

```typescript
type EventMap = Record<string, unknown[]>;

export class ТипdBus<Events extends EventMap> {
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

Из него вытекают две основные шины:

- **`llmBus`** -- управляет токенами LLM, ошибками, сбоями, сбросом
- **`stateBus`** -- управляет изменениями состояния с автоматической персистентностью

```
┌─────────────────────────────────────────────────────┐
│                   core/bus.ts                        │
│  ТипdBus<K, V> -- on / off / once / emit            │
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

Преимущество этого подхода: каждый модуль **отключён** от остальных. LLM выпускает токены на шину, бот их потребляет, состояние обновляется автоматически. Никаких циклических зависимостей.

---

![Message Processing -- Полный поток обработки сообщений](/images/luna-protocol/02-message-processing.svg)

## Система триггеров: кто решает, когда Luna отвечает?

Каждое входящее сообщение оценивается через `evaluateMessage()`, которое возвращает `TriggerResult` с причиной срабатывания. Порядок приоритета критичен:

| # | Причина | Условия | Bypass ignore | Bypass pause |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | Да (0%) | Да |
| 2 | `dm` | ЛС с `replyInDM = true` | Да (0%) | Нет |
| 3 | `name` | "Luna"/"Pixie"/alias (целое слово) | Нет (8%) | Нет |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (целое слово) | Нет (8%) | Нет |
| 5 | `follow-up` | Бот был последним говорящим + < 15с + < 3 / 60с | -- | -- |
| 6 | `random` | 1,5% вероятность на несовпадающих сообщениях | Нет (8%) | Нет |

Сопоставление идёт по **целому слову** (`\b`) : "ai" не совпадает с "mais", "vrai", "lait".

![Trigger evaluation -- Решение о входе для каждого сообщения](/images/luna-protocol/03-trigger-evaluation.svg)

### Механизм последующих действий

Когда Luna отвечает на сообщение, она регистрируется как `lastSpeaker`. Любое последующее сообщение в течение 15 секунд запускает **немедленный** ответ — без таймера, без проверки ключевого слова. Бюджет: 3 follow-up за окно в 60 секунд.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### Перезарядка

8 секунд между двумя ответами в одном канале. Обходится через упоминания и follow-up.

---

## Человеческое поведение: переменная концентрация

Вот становится интересно. У каждого типа триггера — собственные **пороги концентрации**: мин./макс. задержка, вероятность игнорирования и вероятность реакции.

| Trigger | Мин. задержка | Макс. задержка | Игнор | 반응 |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

Расчёт задержки также учитывает:
- **Длина сообщения** : чем длиннее сообщение, тем больше времени Luna тратит на "чтение"
- **Неактивность** : если Luna не была активна более 10 минут, задержка умножается на 2 (имитация "пробуждения")
- **Сон** : в режиме `slow` задержка умножается от 3 до 5

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
|------|-------|
| `sleep` | Только упоминания и личные сообщения проходят |
| `slow` | Задержка ×3-5, реакции почти нулевые |
| `short` | Вероятность игнорирования +30%, реакции почти нулевые |

Во время сна статус Discord меняется на `invisible`.

---

## Опечатки

Luna может допускать опечатки — и исправлять их через 2-4 секунды. Раскладка клавиатуры настраивается (AZERTY или QWERTY).

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... все соседние клавиши
};
```

Пример AZERTY: `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`.

Три стиля исправления:

| Стиль | Поведение |
|-------|-------------|
| `edit` | Редактирует сообщение |
| `message` | Новое сообщение: `word*` |
| `mixed` | 50/50 случайно (по умолчанию) |

---

## Колебания и забывчивость

**Колебания**: 15% вероятность начать со слова-заполнителя (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**Забывчивость**: даже после срабатывания триггера Luna может «забыть» ответить с вероятностью 3%. Ни сообщения, ни реакции — как будто ничего не видела.

**Тематическая усталость**: если слово слишком часто повторяется в последних 10 сообщениях (порог: 3 вхождения), задержки умножаются, а вероятность игнорирования увеличивается на 15%.

---

## Пайплайн LLM: два режима

### Режим `direct` (по умолчанию)

Бот отправляет запросы напрямую на локальный `llama-server` по HTTP. Модель разделяется, с prompt cache и 4 одновременными слотами. Два процесса PM2: LLM-сервер и клиент бота.

### Режим `online`

Бот вызывает любую API, совместимую с OpenAI (OpenAI, OpenRouter, Groq, Together...). Локальный LLM не требуется.

### Стриминг в реальном времени

LLM транслирует ответ построчно (`\n`). Каждая строка разбивается на слова, испускаемые по одному через `llmBus.emit("token", word)`. При каждом `\n` событие `flush` испускается — бот немедленно отправляет накопленное сообщение. Без имитации задержки: ритм задаёт LLM.

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

Очередь (`requestQueue`) обрабатывает запросы по одному с автоматической очисткой при превышении 100 элементов.

---

## Спонтанные сообщения

Каждые 5 минут — 12% вероятность, что Luna опубликует сообщение по собственной инициативе. Сервер выбирается системой **линейного веса**: наиболее активный сервер имеет N× больше шансов, чем последний.

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

Контекст последних 5 сообщений считывается, и Luna «естественно» вступает в разговор.

---

## Пайплайн TTS: голосовые сообщения

С 8% вероятностью Luna отправляет голосовое сообщение вместо текста. Полный пайплайн:

1. **Piper TTS** синтезирует текст в WAV
2. **ffmpeg** конвертирует в OGG
3. Волновая форма вычисляется для предпросмотра Discord
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

![TTS Pipeline -- От синтезированного текста к голосовому сообщению Discord](/images/luna-protocol/10-tts-pipeline.svg)

---

## Антиспам и персистентность

### Антиспам

Очередь по `channelId:userId`. Одно сообщение в очереди на пользователя на канал. Обрабатывается сразу после завершения текущего ответа.

### Лимиты сессии

После 8 обменов Luna делает паузу 30 секунд. Счётчик сбрасывается после 3 минут неактивности.

### Автоматическая персистентность

Каждое изменение состояния публикуется на `stateBus` → автосохранение (debounce 500мс). Ручные вызовы `saveAllState()` больше не нужны. Персистентное состояние включает: pendingMessages, paused, cooldowns, timestamps, lastSpeaker, счётчики follow-up.

---

## Конфигурация горячей перезагрузки

Один файл `config.yml`. Большинство значений **горячеперезагружаемые** — изменения применяются без перезапуска.

| Категория | Горячая перезагрузка |
|-----------|-----------|
| Триггеры, ключевые слова, имена | ✅ |
| Концентрация, задержки | ✅ |
| Опечатки, всплески, усталость | ✅ |
| Расписания сна | ✅ |
| TTS, голосовые сообщения | ✅ |
| Discord token, режим LLM | ❌ (требуется перезапуск) |

```typescript
// config.ts -- геттеры возвращают значения в реальном времени
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## Набор данных: Discord-Dialogues

Модель дообучена на [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) : **7,3M обменов**, **17M туров**, **140M слов**. Реальные разговоры Discord весна-лето 2025, отфильтрованные (PII, ToS, боты, команды). Apache 2.0.

| Метрика | Значение |
|----------|--------|
| Образцы | 7 303 464 |
| Всего раундов | 16 881 010 |
| Всего слов | 139 922 950 |
| Ср. токены | 32.8 |
| Токенизатор | Hermes-3-Llama-3.1-8B |

Используется квантованная модель GGUF (например `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Распределение набора данных Discord-Dialogues](/images/luna-protocol/dataset-distribution.svg)

---

![Complete Lifecycle -- Полное поведение бота от сообщения до ответа, включая таймеры и граничные случаи](/images/luna-protocol/22-complete-lifecycle.svg)

## Диаграммы архитектуры

Папка `state-machines/` содержит **24 диаграммы Mermaid**, покрывающие весь исходный код. Каждая диаграмма имеет подробное объяснение простым языком.

Среди наиболее важных:

| # | Диаграмма | Тип |
|---|-----------|------|
| 01 | Обзор архитектуры | `graph` |
| 02 | Обработка сообщений (полная) | `stateDiagram` |
| 03 | Оценка триггеров | `flowchart` |
| 04 | Очередь LLM Core (3 бэкенда) | `stateDiagram` |
| 10 | TTS-пайплайн | `flowchart` |
| 13 | Персистентность состояния | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Полный жизненный цикл | `stateDiagram` |

Эти диаграммы — кладезь для понимания полного потока: от входящего сообщения до ответа, включая таймеры и граничные случаи.

---

## Подробный код триггера

Триггер оценивается через `evaluateMessage()` в `state/trigger.ts`. Вот полная логика:

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

  // ... сопоставление по имени, ключевому слову, follow-up, случайным образом
}
```

Кэш регулярных выражений (`hasWordCache`) предотвращает перекомпиляцию шаблонов при каждом сообщении.

---

## Реакции

Luna реагирует на сообщения эмодзи. 30% вероятность использования пользовательского эмодзи сервера, 70% — юникода. Реакция запускается после задержки концентрации, не сразу.

Команды по реакциям на сообщения Luna:
- ❌ → Stop
- ▶️ → Start
- 🗑️ → Clear

---

## Стиль ответа

Стиль ответа взвешивается по недавней активности Luna в канале:

| Контекст | messageReference | mentionRepliedUser | Вес |
|----------|-----------------|-------------------|-------|
| Холодный | true | false | 70% |
| Холодный | true | true | 20% |
| Холодный | false | false | 10% |
| Активный | true | false | 50% |
| Активный | true | true | 15% |
| Активный | false | false | 30% |
| Активный | false | true | 5% |

В личных сообщениях `messageReference` всегда `false`.

---

## Пакетные сообщения

С 15% вероятностью ответ разбивается на 2-3 фрагмента, отправляемых в человеческом ритме (1,5-4 секунды между фрагментами). Имитирует человека, печатающего несколько раз.

![Timing Gantt -- Реальное время ожидания для задержек, реакций, стриминга LLM и исправлений](/images/luna-protocol/21-timing-gantt.svg)

---

## Динамическое состояние

Статус Luna в Discord чередуется между настроенными пресетами, меняясь каждые 15 минут. Поддерживаемые типы: Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). Во время сна статус меняется на `invisible`.

```yaml
dynamic_status_presets:
  - status: online
    text: "с пикселями"
    type: 0       # Playing
  - status: idle
    text: "белый шум"
    type: 2       # Listening
```

Случайный джиттер (×0.5-1,0) предотвращает предсказуемую ротацию. 10% попыток пропускаются во избежание повторений.

## Индикатор набора текста

Перед вызовом LLM Luna вызывает `startTyping()`. `setInterval` обновляет индикатор каждые 8 секунд во время генерации. Очистка в `finally` (`clearInterval`).

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

Если LLM падает (процесс `llama-server` умирает), Luna обнаруживает событие через `llmBus.emit("crash", code)` и пытается перезапустить с экспоненциальной задержкой. Предотвращает бесконечные циклы перезапуска.

## Параметры LLM

Параметры захардкожены в `src/config.ts`:

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

Шаблон ChatML (`<|im_start|>/<|im_end|>`) est utilisé. Количество потоков определяется автоматически через `os.cpus().length`.

---

## Установка

```bash
npm install
cp config.example.yml config.yml
# редактирование config.yml
npm run dev                    # dev (hot reload)
npm run build && npm start     # production
```

| Script | Description |
|--------|-------------|
| `build` | Автономный CLI-бандл |
| `start` | Запуск бота |
| `lint` / `format` / `check` | Biome |
| `test` | Tests (Bun) |
| `download-model` | GGUF from HuggingFace |
| `diagrams` | Экспорт диаграмм Mermaid в SVG/PNG |

### Déploiement PM2

```bash
./start.sh   # запуск llm-server + llm-client под PM2
```

---

## Заключение

Luna Protocol — это не просто Discord-бот с LLM. Это **полноценная поведенческая система**, имитирующая человеческие несовершенства: забывчивость, опечатки, сон, колебания, усталость. Всё построено вокруг типизированной шины событий с 24 диаграммами Mermaid, документирующими каждый поток.

Код открытый, набор данных публичный, конфигурация горячеперезагружаемая. Если тема заинтересовала — погрузитесь в код, он доступнее, чем кажется.

| Ресурсы | Ссылка |
|-----------|------|
| Репозиторий GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
