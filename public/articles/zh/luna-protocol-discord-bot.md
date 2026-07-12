---
title: "Luna Protocol: 我创建了一个模拟人类的自主Discord机器人"
description: "Luna Protocol是一个完全自主的Discord机器人，配备本地LLM，能够进行带有睡眠、打字错误、犹豫、遗忘、主题疲劳和自发消息的自然对话。"
date: 2026-07-11
tags:
  - discord-bot
  - llm
  - typescript
  - 事件驱动架构
  - 人工智能
  - 开源
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "JscRarONTPuqLmtJjx3Oh+K2FOPD+O3ivcpoUVGDTparGdwQkqVip/bEjTVm+R7wZFLIyYie2rA0RrE2NjvQiw=="
---

# Luna Protocol: 我创建了一个模拟人类的自主Discord机器人
如果一个Discord机器人可以**睡觉**、**打错字**、**犹豫**、**忘记**回复，有时还会主动给你发消息呢? 这正是**Luna Protocol**所做的: 一个完全自主的Discord机器人，运行本地LLM (llama.cpp)，像一个不完美的人类一样对话。
没有严格的提示，没有机器人式的回答。Luna有一个**优先级触发系统**、**可变延迟**、**睡眠时间表**、**自发消息**，甚至还有一个用于发送语音消息的**TTS流水线**。所有这些都可以通过一个简单的`config.yml`文件热重载配置。
在这篇文章中，我们剖析完整的架构: 从通用事件总线到TTS流水线，包括触发系统、人类组件和微调数据集。
![架构概览 -- 全局组件和数据流](/images/luna-protocol/01-architecture-overview.svg)

---

## 架构：类型化事件总线

Luna的核心是**TypedBus** -- 一个强类型的通用事件总线(TypeScript)。它是所有功能的基础构建块。

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

由此产生两个主要总线：

- **`llmBus`** -- 管理LLM令牌、错误、崩溃、重置
- **`stateBus`** -- 管理带自动持久化的状态变更

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

这种方法的优势：每个模块都与其余部分**断开**。LLM在总线上发布令牌，机器人消费它们，状态自动更新。没有循环依赖。

---

![Message Processing -- flux complet de traitement d'un message](/images/luna-protocol/02-message-processing.svg)

## 触发系统：谁决定Luna何时回复

Chaque message entrant est évalué par `evaluateMessage()` qui retourne un `TriggerResult` avec une raison de déclenchement. L'ordre de priorité est critique :

| # | Raison | Conditions | Bypass ignore | Bypass pause |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | Oui (0%) | Oui |
| 2 | `dm` | MP avec `replyInDM = true` | Oui (0%) | Non |
| 3 | `name` | "Luna"/"Pixie"/alias (mot entier) | Non (8%) | Non |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (mot entier) | Non (8%) | Non |
| 5 | `follow-up` | Bot était dernier locuteur + < 15s + < 3 / 60s | -- | -- |
| 6 | `random` | 1.5% de chance sur les messages non correspondants | Non (8%) | Non |

Le matching est **mot entier** (`\b`) : "ai" ne correspond pas à "mais", "vrai", "lait".

![Trigger evaluation -- décision d'entrée pour chaque message](/images/luna-protocol/03-trigger-evaluation.svg)

### 跟进机制

Quand Luna répond à un message, elle s'enregistre comme `lastSpeaker`. Tout message suivant dans les 15 secondes déclenche une réponse **immédiate** -- pas de timer, pas de vérification de keyword. Budget : 3 follow-ups par fenêtre de 60 secondes.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### 冷却时间

同一频道中两次回复之间的8秒。通过提及和跟进绕过。

---

## 人类行为：可变注意力

C'est ici que Luna devient intéressante. Chaque type de déclenchement a ses propres **seuils de concentration** : un délai min/max, une chance d'ignorer, et une chance de réagir.

| Trigger | Délai min | Délai max | Ignore | Réaction |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

延迟计算还考虑：
- **消息长度**：消息越长，Luna"阅读"的时间越长
- **不活跃**：如果Luna10分钟未活跃，延迟乘以2（模拟"唤醒"）
- **睡眠**：在`slow`模式下，延迟乘以3到5

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

## 睡眠时间表

Luna可以睡觉。通过`config.yml`配置：

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

| Mode | Effet |
|------|-------|
| `sleep` | Seules les mentions et MP passent |
| `slow` | Délai ×3-5, réactions quasi nulles |
| `short` | Chance d'ignore +30%, réactions quasi nulles |

在睡眠期间，Discord状态变为`invisible`。

---

## 打字错误

Luna可能会打错字 -- 2-4秒后修正。键盘布局可配置（AZERTY或QWERTY）。

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... 所有相邻键
};
```

Exemple AZERTY : `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`.

三种纠正风格：

| Style | Comportement |
|-------|-------------|
| `edit` | Édite le message |
| `message` | Nouveau message : `word*` |
| `mixed` | 50/50 aléatoire (défaut) |

---

## 犹豫和遗忘

**Hésitations** : 15% de chance de commencer par un mot de remplissage (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**Oublis** : même après avoir matché un trigger, Luna peut "oublier" de répondre avec une probabilité de 3%. Pas de message, pas de réaction -- comme si elle n'avait rien vu.

**Fatigue thématique** : si un mot revient trop souvent dans les 10 derniers messages (seuil : 3 occurrences), les délais sont multipliés et la chance d'ignore augmente de 15%.

---

## LLM管道：两种模式

### `direct`模式（默认）

机器人通过HTTP直接向本地`llama-server`发送请求。模型共享，带提示缓存和4个并发插槽。两个PM2进程：LLM服务器和机器人客户端。

### `online`模式

机器人调用任何OpenAI兼容API（OpenAI、OpenRouter、Groq、Together...）。无需本地LLM。

### 实时流式传输

Le LLM stream sa réponse ligne par ligne (`\n`). Chaque ligne est découpée en mots, émis un par un sur `llmBus.emit("token", word)`. À chaque `\n`, un événement `flush` est émis -- le bot envoie immédiatement le message accumulé. Pas de délai simulé : le rythme est celui du LLM.

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

队列(`requestQueue`)逐一处理请求，超过100个元素时自动清理。

---

## 自发消息

Toutes les 5 minutes, 12% de chance que Luna poste un message de son propre chef. 服务器通过**线性权重**系统选择：最活跃的服务器比最后一个服务器有N×更多的机会。

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

读取最近5条消息的上下文，Luna"自然地"加入对话。

---

## TTS管道：语音消息

Avec 8% de chance, Luna envoie un message vocal au lieu de texte. La pipeline complète :

1. **Piper TTS** synthétise le texte en WAV
2. **ffmpeg** convertit en OGG
3. Le waveform est calculé pour l'aperçu Discord
4. Le fichier est uploadé via l'API Discord CDN
5. Le message vocal est envoyé

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

## 反垃圾邮件和持久化

### 反垃圾邮件

按`channelId:userId`的队列。每个用户每个频道队列中只有一条消息。当前回复完成后立即处理。

### 会话限制

8次交流后，Luna休息30秒。计数器在3分钟不活动后重置。

### 自动持久化

Chaque mutation d'état émet sur `stateBus` → sauvegarde automatique (debounce 500ms). Plus besoin d'appels `saveAllState()` manuels. L'état persisté inclut : pendingMessages, paused, cooldowns, timestamps, lastSpeaker, compteurs de follow-up.

---

## 热重载配置

`config.yml`一个文件。大多数值**可热重载** -- 更改无需重启即可生效。

| Catégorie | Hot-reload |
|-----------|-----------|
| Triggers, keywords, noms | ✅ |
| Concentration, délais | ✅ |
| Typos, burst, fatigue | ✅ |
| Sleep schedules | ✅ |
| TTS, voice messages | ✅ |
| Discord token, LLM mode | ❌ (redémarrage requis) |

```typescript
// config.ts -- getter返回实时值
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## 数据集：Discord-Dialogues

Le modèle est fine-tuné sur [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) : **7.3M échanges**, **17M tours**, **140M mots**. Des vraies conversations Discord printemps-été 2025, filtrées (PII, ToS, bots, commandes). Apache 2.0.

| Métrique | Valeur |
|----------|--------|
| Échantillons | 7 303 464 |
| Tours totaux | 16 881 010 |
| Mots totaux | 139 922 950 |
| Tokens moyens | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

使用的量化模型是GGUF（例如`Discord-Hermes-3-8B.Q3_K_M.gguf`）。

![Distribution du dataset Discord-Dialogues](/images/luna-protocol/dataset-distribution.svg)

---

![Complete Lifecycle -- comportement complet du bot du message à la réponse, incluant les timers et cas limites](/images/luna-protocol/22-complete-lifecycle.svg)

## 架构图

`state-machines/`文件夹包含覆盖整个源代码的**24个Mermaid图表**。每个图表都有人类语言的详细说明。

最重要的参数：

| # | Diagramme | Type |
|---|-----------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (complet) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 backends) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

这些图表是理解从接收消息到回复的完整流程的金矿。包括定时器和边缘情况。

---

## 触发器详细代码

触发器由`state/trigger.ts`中的`evaluateMessage()`评估。完整逻辑：

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

  // ... 按名称、关键词、跟进、随机匹配
}
```

正则表达式缓存(`hasWordCache`)避免每次消息时重新编译模式。

---

## 反应

Luna用表情符号对消息做出反应。使用服务器自定义表情的概率30%，Unicode表情70%。反应在集中延迟后触发，不是立即。

对Luna消息的反应命令：
- ❌ → Stop
- ▶️ → Start
- 🗑️ → Clear

---

## 回复风格

回复风格根据Luna在频道中的最近活动加权：

| Contexte | messageReference | mentionRepliedUser | Poids |
|----------|-----------------|-------------------|-------|
| Froid | true | false | 70% |
| Froid | true | true | 20% |
| Froid | false | false | 10% |
| Actif | true | false | 50% |
| Actif | true | true | 15% |
| Actif | false | false | 30% |
| Actif | false | true | 5% |

在私信中，`messageReference`始终为`false`。

---

## 突发消息

Avec 15% de chance, une réponse est découpée en 2-3 fragments envoyés au rythme humain (1.5-4 secondes entre chaque fragment). Simule quelqu'un qui tape en plusieurs fois.

![Timing Gantt -- temps d'attente réels pour les délais, réactions, streaming LLM et corrections](/images/luna-protocol/21-timing-gantt.svg)

---

## 动态状态

Luna的Discord状态在配置的预设之间每15分钟轮换。支持的类型：Playing (0)、Streaming (1)、Listening (2)、Watching (3)、Custom (4)、Competing (5)。睡眠期间状态变为`invisible`。

```yaml
dynamic_status_presets:
  - status: online
    text: "用像素"
    type: 0       # Playing
  - status: idle
    text: "白噪音"
    type: 2       # Listening
```

随机抖动(×0.5-1.0)防止可预测的轮换。10%的尝试被跳过以避免重复。

## 打字指示器

在调用LLM之前，Luna调用`startTyping()`。`setInterval`在生成期间每8秒刷新指示器。在`finally`中清理（`clearInterval`）。

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

## 崩溃后恢复

Si le LLM crash (processus `llama-server` qui meurt), Luna détecte l'événement via `llmBus.emit("crash", code)` et tente de redémarrer avec un backoff exponentiel. Évite les boucles de redémarrage infini.

## LLM参数

参数硬编码在`src/config.ts`中：

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

Le template ChatML (`<|im_start|>/<|im_end|>`) est utilisé. Le nombre de threads est auto-détecté via `os.cpus().length`.

---

## 设置

```bash
npm install
cp config.example.yml config.yml
# éditer config.yml
npm run dev                    # dev (hot reload)
npm run build && npm start     # production
```

| Script | Description |
|--------|-------------|
| `build` | Bundle CLI autonome |
| `start` | Lance le bot |
| `lint` / `format` / `check` | Biome |
| `test` | Tests (Bun) |
| `download-model` | GGUF depuis HuggingFace |
| `diagrams` | Exporte les diagrammes Mermaid en SVG/PNG |

### PM2部署

```bash
./start.sh   # lance llm-server + llm-client sous PM2
```

---

## 结论

Luna Protocol n'est pas juste un bot Discord avec un LLM. C'est un **système comportemental complet** qui simule les imperfections humaines : les oublis, les fautes de frappe, le sommeil, les hésitations, la fatigue. Le tout architecturé autour d'un bus d'événements typé, avec 24 diagrammes Mermaid documentant chaque flux.

Le code est open source, le dataset est public, et la configuration est hot-reloadable. Si le sujet vous intéresse, plongez dans le code -- c'est plus accessible qu'il n'y paraît.

| Ressource | Lien |
|-----------|------|
| Dépôt GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
