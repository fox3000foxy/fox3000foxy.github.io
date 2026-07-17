---
title: "Luna Protocol：我创建了一个模拟人类的自主 Discord 机器人"
description: "Luna Protocol 是一个完全自主的 Discord 机器人，配备本地 LLM，能够进行自然对话，具备睡眠、打字错误、犹豫、遗忘、主题疲劳和自发消息等人类特征。"
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
author_sig: "V6ZnpJKyjFdJPLMCftXPwL3M16ZM6TMdYbOrEG7tJ20Rpsbp65By23IEV0rrQ1pdgLP9p1+vu6jxZG9yBaLEIg=="
---

# Luna Protocol：我创建了一个模拟人类的自主 Discord 机器人

如果一个 Discord 机器人能够**睡觉**、**打错字**、**犹豫**、**忘记**回复，甚至有时主动给你发消息，会怎么样？这正是 **Luna Protocol** 所做的：一个完全自主的 Discord 机器人，运行本地 LLM（llama.cpp），像一个不完美的人类一样交流。

没有僵硬的提示词，没有机械的回复。Luna 拥有**优先级触发系统**、**可变延迟**、**睡眠时间表**、**自发消息**，甚至还有用于发送语音消息的 **TTS 管道**。全部通过一个可热重载的 `config.yml` 文件配置。

本文深入解析完整架构：从通用事件总线到 TTS 管道，再到触发系统、人类行为组件和微调数据集。

![架构概览 -- 全局组件与数据流](/images/luna-protocol/01-architecture-overview.svg)

---

## 架构：类型化事件总线

Luna 的核心是一个 **TypedBus** -- 一个用 TypeScript 编写的强类型通用事件总线。这是所有功能的基础构件。

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

由此衍生出两个主要总线：

- **`llmBus`** -- 管理 LLM 令牌、错误、崩溃、重置
- **`stateBus`** -- 管理状态变更并自动持久化

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

这种方法的优势在于：每个模块都与其他模块**解耦**。LLM 在总线上发出令牌，机器人消费它们，状态自动更新。没有循环依赖。

---

![消息处理 -- 完整的消息处理流程](/images/luna-protocol/02-message-processing.svg)

## 触发系统：谁决定 Luna 何时回复？

每条进入的消息都由 `evaluateMessage()` 评估，返回一个包含触发原因的 `TriggerResult`。优先级顺序至关重要：

| # | 原因 | 条件 | 绕过忽略 | 绕过暂停 |
|---|------|------|----------|----------|
| 1 | `mention` | @机器人 | 是 (0%) | 是 |
| 2 | `dm` | 私信且 `replyInDM = true` | 是 (0%) | 否 |
| 3 | `name` | "Luna"/"Pixie"/别名（完整单词） | 否 (8%) | 否 |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`...（完整单词） | 否 (8%) | 否 |
| 5 | `follow-up` | 机器人是最后发言者 + < 15秒 + < 3次/60秒 | -- | -- |
| 6 | `random` | 1.5% 概率命中不匹配的消息 | 否 (8%) | 否 |

匹配方式是**完整单词**（`\b`）："ai" 不会匹配 "mais"、"vrai"、"lait"。

![触发评估 -- 每条消息的入口决策](/images/luna-protocol/03-trigger-evaluation.svg)

### 跟进机制

当 Luna 回复一条消息时，她会将自己注册为 `lastSpeaker`。之后 15 秒内的任何消息都会触发**即时**回复 -- 无需计时器，无需检查关键词。预算：每 60 秒窗口最多 3 次跟进。

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### 冷却时间

同一频道内两次回复之间间隔 8 秒。提及和跟进可以绕过。

---

## 人类行为：可变的注意力集中度

这就是 Luna 变得有趣的地方。每种触发类型都有自己的**注意力阈值**：最小/最大延迟、忽略概率和反应概率。

| 触发类型 | 最小延迟 | 最大延迟 | 忽略 | 反应 |
|---------|----------|----------|------|------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

延迟计算还考虑：
- **消息长度**：消息越长，Luna "阅读"的时间越长
- **不活跃时间**：如果 Luna 超过 10 分钟没有活动，延迟乘以 2（模拟"唤醒"）
- **睡眠模式**：在 `slow` 模式下，延迟乘以 3 到 5

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
  delay *= 0.5 + Math.random() * 1.5; // 激进抖动
  return delay;
}
```

---

## 睡眠时间表

Luna 可以睡觉。通过 `config.yml` 配置：

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

| 模式 | 效果 |
|------|------|
| `sleep` | 只有提及和私信通过 |
| `slow` | 延迟 ×3-5，反应几乎为零 |
| `short` | 忽略概率 +30%，反应几乎为零 |

在睡眠时段，Discord 状态切换为 `invisible`。

---

## 打字错误

Luna 可以打错字 -- 并在 2-4 秒后修正。键盘布局可配置（AZERTY 或 QWERTY）。

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... 所有相邻按键
};
```

AZERTY 示例：`bonjour → bonjpur`，`salut → slaut`，`comment → cpmment`。

三种修正样式：

| 样式 | 行为 |
|------|------|
| `edit` | 编辑原消息 |
| `message` | 新消息：`word*` |
| `mixed` | 随机 50/50（默认） |

---

## 犹豫和遗忘

**犹豫**：15% 的概率以填充词开头（`uh...`、`um...`、`well...`、`hmm...`、`so...`）。

**遗忘**：即使触发了触发器，Luna 仍有 3% 的概率"忘记"回复。没有消息，没有反应 -- 就像什么也没看到。

**主题疲劳**：如果某个词在最近 10 条消息中出现过于频繁（阈值：3 次），延迟会成倍增加，忽略概率增加 15%。

---

## 现实中的真实感：细思极恐的时刻

纸面上看，这些机制(延迟、打字错误、犹豫、遗忘)听起来像是噱头。但实际上，把它们组合在一起，效果令人震惊----以至于和 Luna 聊天的人完全察觉不到异样。下面是一段真实的对话，有人直接问 Luna 是不是机器人，随后话题又自然地转移到完全不同的方向，那种自然感让人不寒而栗。

![与 Luna 的 Discord 对话 -- 第一段](/images/luna-protocol/realism/realism-01.png)

语气、犹豫、回复节奏----完全看不出是机器人。Luna 巧妙地回避了年龄问题，全程没有露出破绽。

对话继续自然流畅地进行，简短而真实的回复("okay, okay"、"yay"、"yayy")----正是人类在 Discord 上会发的那种消息。

![与 Luna 的 Discord 对话 -- 继续](/images/luna-protocol/realism/realism-02.png)

![与 Luna 的 Discord 对话 -- 话题转移](/images/luna-protocol/realism/realism-03.png)

![与 Luna 的 Discord 对话 -- 话题继续转移](/images/luna-protocol/realism/realism-04.png)

![与 Luna 的 Discord 对话 -- 对话结束](/images/luna-protocol/realism/realism-05.png)

真正让人毛骨悚然的不只是 Luna 会“回复”----而是她**能维持一段对话**，有看似真实的观点、追问，以及从一条消息到下一条消息一以贯之的思路。如果没有前面提到的触发系统、专注延迟和犹豫机制，这种幻觉几条消息内就会破功。

**小小的反转**: 上面截图里，**这两个在聊天的账号其实都是 Luna 的实例**。`PixieGlow` 和 `Sujet d'SBlow` 不是一个人类在测试机器人----而是两个机器人在互相对话，每一个(在行为层面上)都"确信"自己在和一个"正常"的人聊天。如果你在读上面的对话时以为其中一个是人类，恭喜----你刚刚和在真实 Discord 服务器上的任何人一样，掉进了这个陷阱。

这基本上就是**死亡互联网理论**的实践版本：这个理论(最初算是比较边缘的阴谋论)认为，越来越多的网络内容和互动是由机器人而非人类生成的，以至于"真正"由人类构成的互联网正变成少数派。长期以来这个说法被认为夸张，但当 Luna Protocol 这样的系统证明，要在大规模上模拟出可信的人类存在，既不需要多少算力，也不需要一个庞大的模型时，这个理论就显得越来越不荒谬了。同一个机器人的两个实例能够进行一场很长的对话而从不露馅，这相当具体地展示了一个主要由机器人互相对话构成的网络会是什么样子。

---

## LLM 管道：两种模式

### `direct` 模式（默认）

机器人直接通过 HTTP 向本地 `llama-server` 发送请求。模型共享，支持提示缓存和 4 个并发槽位。两个 PM2 进程：LLM 服务器和机器人客户端。

### `online` 模式

机器人调用任何兼容 OpenAI 的 API（OpenAI、OpenRouter、Groq、Together...）。无需本地 LLM。

### 实时流式传输

LLM 逐行流式输出响应（`\n`）。每行被分割成单词，通过 `llmBus.emit("token", word)` 逐个发出。每遇到 `\n`，发出 `flush` 事件 -- 机器人立即发送累积的消息。没有模拟延迟：节奏由 LLM 决定。

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

请求队列（`requestQueue`）逐个处理请求，队列超过 100 项时自动清理。

---

## 自发消息

每 5 分钟，Luna 有 12% 的概率主动发一条消息。服务器通过**线性权重**系统选择：最活跃的服务器概率是最后的 N 倍。

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

读取最近 5 条消息的上下文，Luna "自然地"加入对话。

---

## TTS 管道：语音消息

有 8% 的概率，Luna 发送语音消息而不是文本。完整流程：

1. **Piper TTS** 将文本合成为 WAV
2. **ffmpeg** 转换为 OGG
3. 计算波形用于 Discord 预览
4. 通过 Discord CDN API 上传文件
5. 发送语音消息

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

![TTS 管道 -- 从合成文本到 Discord 语音消息](/images/luna-protocol/10-tts-pipeline.svg)

---

## 反垃圾和持久化

### 反垃圾

按 `channelId:userId` 排队。每个用户每个频道只排队一条消息。当前回复结束后立即处理。

### 会话限制

8 次对话后，Luna 暂停 30 秒。计数器在 3 分钟不活动后重置。

### 自动持久化

每次状态变更都会在 `stateBus` 上发出事件 → 自动保存（防抖 500ms）。不再需要手动调用 `saveAllState()`。持久化状态包括：pendingMessages、paused、冷却时间、时间戳、lastSpeaker、跟进计数器。

---

## 热重载配置

单一 `config.yml` 文件。大多数值都是**热重载的** -- 更改无需重启即可生效。

| 类别 | 热重载 |
|------|--------|
| 触发器、关键词、名称 | ✅ |
| 注意力、延迟 | ✅ |
| 打字错误、突发、疲劳 | ✅ |
| 睡眠时间表 | ✅ |
| TTS、语音消息 | ✅ |
| Discord 令牌、LLM 模式 | ❌（需要重启） |

```typescript
// config.ts -- getter 返回实时值
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## 数据集：Discord-Dialogues

模型基于 [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) 进行微调：**730 万次对话**、**1690 万轮**、**1.4 亿词**。来自 2025 年春夏季的真实 Discord 对话，经过过滤（PII、ToS、机器人、命令）。Apache 2.0。

| 指标 | 值 |
|------|-----|
| 样本数 | 7 303 464 |
| 总轮数 | 16 881 010 |
| 总词数 | 139 922 950 |
| 平均令牌数 | 32.8 |
| 分词器 | Hermes-3-Llama-3.1-8B |

使用的量化模型是 GGUF（例如 `Discord-Hermes-3-8B.Q3_K_M.gguf`）。

![Discord-Dialogues 数据集分布](/images/luna-protocol/dataset-distribution.svg)

---

![完整生命周期 -- 从消息到回复的完整机器人行为，包括计时器和边界情况](/images/luna-protocol/22-complete-lifecycle.svg)

## 架构图

`state-machines/` 目录包含 **24 张 Mermaid 图**，覆盖了整个源代码。每张图都配有详细的人类语言说明。

其中最重要的：

| # | 图 | 类型 |
|---|-----|------|
| 01 | 架构概览 | `graph` |
| 02 | 消息处理（完整） | `stateDiagram` |
| 03 | 触发评估 | `flowchart` |
| 04 | LLM 核心队列（3 个后端） | `stateDiagram` |
| 10 | TTS 管道 | `flowchart` |
| 13 | 状态持久化 | `flowchart` |
| 21 | 时间甘特图 | `gantt` |
| 22 | 完整生命周期 | `stateDiagram` |

这些图是理解完整流程的宝库：从消息进入到回复，包括计时器和边界情况。

---

## 触发代码详解

触发器由 `state/trigger.ts` 中的 `evaluateMessage()` 评估。以下是完整逻辑：

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

正则缓存（`hasWordCache`）避免为每条消息重新编译模式。

---

## 反应

Luna 使用表情符号对消息做出反应。30% 概率使用服务器自定义表情，70% 使用 Unicode 表情。反应在注意力延迟之后触发，而非立即。

对 Luna 消息的反应命令：
- ❌ → 停止
- ▶️ → 开始
- 🗑️ → 清除

---

## 回复风格

回复风格根据 Luna 在频道中的最近活动进行加权：

| 上下文 | messageReference | mentionRepliedUser | 权重 |
|--------|-----------------|-------------------|------|
| 冷 | true | false | 70% |
| 冷 | true | true | 20% |
| 冷 | false | false | 10% |
| 活跃 | true | false | 50% |
| 活跃 | true | true | 15% |
| 活跃 | false | false | 30% |
| 活跃 | false | true | 5% |

在私信中，`messageReference` 始终为 `false`。

---

## 突发消息

有 15% 的概率，一条回复被分成 2-3 个片段，以人类的速度发送（每个片段间隔 1.5-4 秒）。模拟某人分多次打字。

![时间甘特图 -- 延迟、反应、LLM 流和修正的实际等待时间](/images/luna-protocol/21-timing-gantt.svg)

---

## 动态状态

Luna 的 Discord 状态在多个配置的预设之间轮换，每 15 分钟切换一次。支持的类型：Playing (0)、Streaming (1)、Listening (2)、Watching (3)、Custom (4)、Competing (5)。睡眠期间，状态切换为 `invisible`。

```yaml
dynamic_status_presets:
  - status: online
    text: "avec les pixels"
    type: 0       # Playing
  - status: idle
    text: "du bruit blanc"
    type: 2       # Listening
```

随机抖动（×0.5-1.0）避免可预测的轮换。10% 的尝试被跳过以避免重复。

## 打字指示器

在调用 LLM 之前，Luna 调用 `startTyping()`。一个 `setInterval` 在生成期间每 8 秒刷新一次打字指示器。在 `finally` 块中清理（`clearInterval`）。

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

## 崩溃恢复

如果 LLM 崩溃（`llama-server` 进程终止），Luna 通过 `llmBus.emit("crash", code)` 检测到事件，并尝试以指数退避策略重启。避免无限重启循环。

## LLM 参数

参数硬编码在 `src/config.ts` 中：

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

使用 ChatML 模板（`<|im_start|>/<|im_end|>`）。线程数通过 `os.cpus().length` 自动检测。

---

## 部署

```bash
npm install
cp config.example.yml config.yml
# 编辑 config.yml
npm run dev                    # 开发（热重载）
npm run build && npm start     # 生产
```

| 脚本 | 说明 |
|------|------|
| `build` | 独立 CLI 打包 |
| `start` | 启动机器人 |
| `lint` / `format` / `check` | Biome |
| `test` | 测试（Bun） |
| `download-model` | 从 HuggingFace 下载 GGUF |
| `diagrams` | 将 Mermaid 图导出为 SVG/PNG |

### PM2 部署

```bash
./start.sh   # 在 PM2 下启动 llm-server + llm-client
```

---

## 结论

Luna Protocol 不仅仅是一个带 LLM 的 Discord 机器人。它是一个**完整的行为系统**，模拟人类的不完美之处：遗忘、打字错误、睡眠、犹豫、疲劳。整个架构围绕类型化事件总线构建，配有 24 张 Mermaid 图记录每个流程。

代码是开源的，数据集是公开的，配置是可热重载的。如果你对这个主题感兴趣，深入代码看看吧 -- 它比看起来更容易上手。

| 资源 | 链接 |
|------|------|
| GitHub 仓库 | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| 数据集 | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
