---
title: "Luna Protocol: I Built an Autonomous Discord Bot That Simulates a Human Being"
description: "Luna Protocol is a fully autonomous Discord bot running a local LLM, capable of natural conversation with sleep, typos, hesitations, forgetfulness, thematic fatigue, and spontaneous messages."
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
author_sig: "ZHqLPjzxz3XEbF0J4iyiVAv5HV+JYUKK6hsu6kz6aVKCYBJ5rvIpOUsakj3Xkop/bmLpSWWOZfJa7ww/sNFNfg=="
---

# Luna Protocol: I built an autonomous Discord bot that simulates a human being

What if a Discord bot could **sleep**, make **typos**, **hesitate**, **forget** to reply, and sometimes message you on its own? That's exactly what **Luna Protocol** does: a fully autonomous Discord bot running a local LLM (llama.cpp) that converses like an imperfect human.

Luna runs on contextual triggers and assumed imperfect replies. She has a **priority trigger system**, **variable delays**, **sleep schedules**, **spontaneous messages**, and even a **TTS pipeline** for voice messages. All configured via a single hot-reloadable `config.yml` file.

In this article, I break down the full architecture: from the generic event bus to the TTS pipeline, through the trigger system, the human components, and the fine-tuning dataset.

![Architecture Overview -- global components and data flow](/images/luna-protocol/01-architecture-overview.svg)

---

## The architecture: a typed event bus

Luna's core is a **TypedBus**: a strongly typed generic event bus in TypeScript. It's the foundational brick everything rests on. I built it that way because I wanted to avoid circular dependencies from the start.

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

Two main buses derive from it:

- **`llmBus`**: handles LLM tokens, errors, crashes, reset
- **`stateBus`**: handles state changes with automatic persistence

```
┌─────────────────────────────────────────────────────┐
│                   core/bus.ts                        │
│  TypedBus<K, V> -- on / off / once / emit            │
├──────────────────┬──────────────────────────────────┤
│   core/llm-bus   │       state/state-bus             │
│  token / done /  │     state:changed                 │
│  error / crash / │     → auto persistence            │
│  flush / ready / │                                   │
│  reset           │                                   │
└────────┬─────────┴────────┬─────────────────────────┘
          │                  │
┌──────────────────┐  ┌────▼──────────────────────┐
│ core/llm-core.ts │  │ bot.ts (Eris)             │
│ direct mode      │  │ bot/pending.ts             │
│   llama-server   │  │ bot/reactions.ts           │
│ online mode      │  │ state/trigger.ts           │
│   OpenAI API     │  │ state/state.ts             │
│                  │  │ behavior/*                 │
│                  │  │ tts/*                      │
│                  │  │ spontaneous.ts             │
└──────────────────┘  └────────────────────────────┘
```

The advantage of that approach: every module is **disconnected** from the rest. The LLM emits tokens on the bus, the bot consumes them, state updates automatically. No circular dependencies.

---

![Message Processing -- full message processing flow](/images/luna-protocol/02-message-processing.svg)

## The trigger system: who decides when Luna replies?

Every incoming message is evaluated by `evaluateMessage()`, which returns a `TriggerResult` with a trigger reason. Priority order is critical:

| # | Reason | Conditions | Bypass ignore | Bypass pause |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | Yes (0%) | Yes |
| 2 | `dm` | DM with `replyInDM = true` | Yes (0%) | No |
| 3 | `name` | "Luna"/"Pixie"/alias (whole word) | No (8%) | No |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (whole word) | No (8%) | No |
| 5 | `follow-up` | Bot was last speaker + < 15s + < 3 / 60s | -- | -- |
| 6 | `random` | 1.5% chance on unmatched messages | No (8%) | No |

Matching is **whole word** (`\b`): "ai" doesn't match "mais", "vrai", "lait".

![Trigger evaluation -- entry decision for each message](/images/luna-protocol/03-trigger-evaluation.svg)

### The follow-up mechanism

When Luna replies to a message, she registers as `lastSpeaker`. Any message in the next 15 seconds triggers an **immediate** reply, short-circuiting timers and keyword checks. Budget: 3 follow-ups per 60-second window.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### The cooldown

8 seconds between two replies in the same channel. Bypassed by mentions and follow-ups.

---

## Human behaviors: variable concentration

This is where Luna gets interesting. Each trigger type has its own **concentration thresholds**: a min/max delay, an ignore chance, and a react chance.

| Trigger | Min delay | Max delay | Ignore | React |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

Delay computation also factors in:
- **Message length**: the longer the message, the longer Luna takes to "read" it
- **Inactivity**: if Luna hasn't been active for 10 minutes, the delay doubles ("waking up" simulation)
- **Sleep**: in `slow` mode, the delay is multiplied by 3 to 5

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
  delay *= 0.5 + Math.random() * 1.5; // aggressive jitter
  return delay;
}
```

---

## Sleep schedules

Luna can sleep. Configurable via `config.yml`:

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

| Mode | Effect |
|------|-------|
| `sleep` | Only mentions and DMs get through |
| `slow` | Delay ×3-5, near-zero reactions |
| `short` | Ignore chance +30%, near-zero reactions |

During sleep hours, the Discord status switches to `invisible`.

---

## Typos

Luna can make typos, corrected after 2-4 seconds. The keyboard layout is configurable (AZERTY or QWERTY). I left it configurable because you immediately spot a bot that types too cleanly.

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... every adjacent key
};
```

AZERTY example: `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`.

Three correction styles:

| Style | Behavior |
|-------|-------------|
| `edit` | Edits the message |
| `message` | New message: `word*` |
| `mixed` | 50/50 random (default) |

---

## Hesitations and forgetfulness

**Hesitations**: 15% chance of starting with a filler word (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**Forgetfulness**: even after matching a trigger, Luna can "forget" to reply with a 3% probability. She then stays totally silent, as if she'd seen nothing. I love that behavior because you've already seen humans blank on a message by accident.

**Thematic fatigue**: if a word comes up too often in the last 10 messages (threshold: 3 occurrences), delays get longer and ignore chance rises by 15%.

---

## Realism in practice: when it gets creepy

On paper, all those systems (delays, typos, hesitations, forgetfulness) look gadgety. In real life, put end to end, the result is striking: people chatting with Luna suspect nothing. Here's a real exchange where someone directly asks Luna if she's a bot, and the conversation then drifts onto a totally different topic, with a naturalness that gives you chills. I didn't expect it to be that believable in real conditions.

![Discord conversation with Luna -- first exchange](/images/luna-protocol/realism/realism-01.png)

The tone, hesitations, reply pacing: nothing gives away a bot. Luna dodges the age question without ever breaking character.

![Discord conversation with Luna -- exchange continues](/images/luna-protocol/realism/realism-02.png)

The conversation keeps flowing totally naturally, with short natural replies ("okay, okay", "yay", "yayy"): exactly the kind of messages a human would send on Discord.

![Discord conversation with Luna -- topic drift](/images/luna-protocol/realism/realism-03.png)

![Discord conversation with Luna -- drift continues](/images/luna-protocol/realism/realism-04.png)

![Discord conversation with Luna -- end of exchange](/images/luna-protocol/realism/realism-05.png)

What's scary isn't just that Luna "replies": it's that she **holds a conversation**, with apparent opinions, follow-ups, a coherent thread from one message to the next. Without the trigger system, concentration delays, and hesitations described above, that illusion would collapse within a few messages.

**Little plot twist**: in the screenshots above, **both chatting accounts are Luna instances**. `PixieGlow` and `Sujet d'SBlow` aren't a human testing a bot: they're two bots talking to each other, each behaviorally convinced it's chatting with someone "normal". If while reading the exchange above you assumed one of the two speakers was human, congratulations: you just fell for the trap exactly like anyone would on a real Discord server.

It's the **dead internet theory** in practice: that theory (originally rather conspiratorial) postulates that a growing share of online content and interactions is generated by bots rather than humans, to the point the "real" human web would have become the minority. Long considered exaggerated, it feels less and less absurd as systems like Luna Protocol show it takes neither much money nor a huge model to simulate believable human presence at scale. Two instances of the same bot holding a long conversation without ever giving themselves away gives a pretty concrete preview of what a web populated mostly by bots talking to each other could look like.

---

## The LLM pipeline: two modes

### `direct` mode (default)

The bot sends requests directly to a local `llama-server` over HTTP. The model is shared, with prompt cache and 4 concurrent slots. Two PM2 processes: the LLM server and the bot client.

### `online` mode

The bot calls any OpenAI-compatible API (OpenAI, OpenRouter, Groq, Together...). You just need an API key, the LLM runs on the provider side.

### Real-time streaming

The LLM streams its reply line by line (`\n`). Each line is split into words, emitted one by one on `llmBus.emit("token", word)`. On each `\n`, a `flush` event fires: the bot immediately sends the accumulated message. The pacing directly follows the LLM's.

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

The queue (`requestQueue`) processes requests one by one, with automatic cleanup when the queue exceeds 100 items.

---

## Spontaneous messages

Every 5 minutes, 12% chance Luna posts a message on her own. The server is picked by a **linear weight** system: the most active server is N× more likely than the last.

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

The last 5 messages' context is read, and Luna joins the conversation "naturally".

---

## The TTS pipeline: voice messages

With 8% chance, Luna sends a voice message instead of text. The full pipeline:

1. **Piper TTS** synthesizes the text to WAV
2. **ffmpeg** converts to OGG
3. The waveform is computed for the Discord preview
4. The file is uploaded via the Discord CDN API
5. The voice message is sent

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

![TTS Pipeline -- from synthesized text to Discord voice message](/images/luna-protocol/10-tts-pipeline.svg)

---

## Anti-spam and persistence

### Anti-spam

Queue per `channelId:userId`. One queued message per user per channel. Processed as soon as the current reply finishes.

### Session limits

After 8 exchanges, Luna pauses for 30 seconds. The counter resets after 3 minutes of inactivity.

### Automatic persistence

Every state mutation emits on `stateBus` → automatic save (500ms debounce). No more manual `saveAllState()` calls. Persisted state includes: pendingMessages, paused, cooldowns, timestamps, lastSpeaker, follow-up counters.

---

## Hot-reload configuration

A single `config.yml` file. Most values are **hot-reloadable**: changes apply without restart. I wanted to tune delays live, without cutting conversations.

| Category | Hot-reload |
|-----------|-----------|
| Triggers, keywords, names | ✅ |
| Concentration, delays | ✅ |
| Typos, burst, fatigue | ✅ |
| Sleep schedules | ✅ |
| TTS, voice messages | ✅ |
| Discord token, LLM mode | ❌ (restart required) |

```typescript
// config.ts -- getters return live values
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## The dataset: Discord-Dialogues

The model is fine-tuned on [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues): **7.3M exchanges**, **17M turns**, **140M words**. Real Discord conversations from spring-summer 2025, filtered (PII, ToS, bots, commands). Apache 2.0.

| Metric | Value |
|----------|-------|
| Samples | 7 303 464 |
| Total turns | 16 881 010 |
| Total words | 139 922 950 |
| Average tokens | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

The quantized model used is a GGUF (e.g. `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Discord-Dialogues dataset distribution](/images/luna-protocol/dataset-distribution.svg)

---

![Complete Lifecycle -- full bot behavior from message to reply, including timers and edge cases](/images/luna-protocol/22-complete-lifecycle.svg)

## Architecture diagrams

The `state-machines/` folder holds **24 Mermaid diagrams** covering the whole source code. Each diagram has a detailed human-language explanation.

Among the most important:

| # | Diagram | Type |
|---|-----------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (full) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 backends) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

Those diagrams are a goldmine for understanding the full flow: from incoming message to reply, through timers and edge cases.

---

## The trigger code in detail

The trigger is evaluated by `evaluateMessage()` in `state/trigger.ts`. Here's the full logic:

```typescript
export function evaluateMessage(
  message: Eris.Message, botId: string, botUsername: string, isFollowUp = false
): TriggerResult {
  if (message.author.bot) return { shouldRespond: true, reason: null, botName: "" };
  if (message.content === "-stop") return { shouldRespond: true, reason: "stop", botName: "" };
  if (message.content === "-start") return { shouldRespond: true, reason: "start", botName: "" };
  if (message.content === "-clear") return { shouldRespond: true, reason: "clear", botName: "" };

  const isMentioned = message.mentions.some((u) => u.id === botId);
  if (isMentioned) return { shouldRespond: true, reason: "mention", botName };
  if (!message.guildID) return { shouldRespond: true, reason: "dm", botName };
  if (isPaused()) return { shouldRespond: false, reason: null, botName: "" };
  if (isOnCooldown(channelId)) return { shouldRespond: false, reason: null, botName };

  // ... matching by name, keyword, follow-up, random
}
```

The regex cache (`hasWordCache`) avoids recompiling patterns on every message.

---

## Reactions

Luna reacts to messages with emojis. 30% chance of using a server custom emoji, 70% a unicode emoji. The reaction goes out after the concentration delay, with the same staggered pacing as replies. I like that lag because you feel she took time to read.

Reaction commands on Luna's messages:
- ❌ → Stop
- ▶️ → Start
- 🗑️ → Clear

---

## Reply style

Reply style is weighted by Luna's recent activity in the channel:

| Context | messageReference | mentionRepliedUser | Weight |
|----------|-----------------|-------------------|-------|
| Cold | true | false | 70% |
| Cold | true | true | 20% |
| Cold | false | false | 10% |
| Active | true | false | 50% |
| Active | true | true | 15% |
| Active | false | false | 30% |
| Active | false | true | 5% |

In DMs, `messageReference` is always `false`.

---

## Burst messages

With 15% chance, a reply is split into 2-3 fragments sent at human pace (1.5-4 seconds between fragments). Simulates someone typing in several goes.

![Timing Gantt -- real wait times for delays, reactions, LLM streaming, and corrections](/images/luna-protocol/21-timing-gantt.svg)

---

## Dynamic status

Luna's Discord status rotates between several configured presets, every 15 minutes. Supported types: Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). During sleep, status goes `invisible`.

```yaml
dynamic_status_presets:
  - status: online
    text: "with pixels"
    type: 0       # Playing
  - status: idle
    text: "white noise"
    type: 2       # Listening
```

Random jitter (×0.5-1.0) avoids predictable rotations. 10% of attempts are skipped to avoid repetition.

## Typing indicator

Before calling the LLM, Luna calls `startTyping()`. A `setInterval` refreshes the indicator every 8 seconds during generation. Cleaned up in `finally` (`clearInterval`).

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

## Crash recovery

If the LLM crashes (`llama-server` process dying), Luna detects the event via `llmBus.emit("crash", code)` and tries restarting with exponential backoff. Avoids infinite restart loops.

## LLM parameters

Parameters are hardcoded in `src/config.ts`:

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

The ChatML template (`<|im_start|>/<|im_end|>`) is used. Thread count is auto-detected via `os.cpus().length`.

---

## Setup

```bash
npm install
cp config.example.yml config.yml
# edit config.yml
npm run dev                    # dev (hot reload)
npm run build && npm start     # production
```

| Script | Description |
|--------|-------------|
| `build` | Build standalone CLI |
| `start` | Launch the bot |
| `lint` / `format` / `check` | Biome |
| `test` | Tests (Bun) |
| `download-model` | GGUF from HuggingFace |
| `diagrams` | Export Mermaid diagrams to SVG/PNG |

### PM2 deployment

```bash
./start.sh   # launch llm-server + llm-client under PM2
```

---

## Conclusion

Luna Protocol goes way beyond a Discord bot with an LLM. It's a **full behavioral system** simulating human imperfections: forgetfulness, typos, sleep, hesitations, fatigue. All architected around a typed event bus, with 24 Mermaid diagrams documenting every flow.

The code is open source, the dataset is public, and configuration is hot-reloadable. If the topic interests you, dive into the code: it's more approachable than it looks. I used it as a base to test lots of behavior ideas, and you can reuse each module separately.

| Resource | Link |
|-----------|------|
| GitHub repo | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
