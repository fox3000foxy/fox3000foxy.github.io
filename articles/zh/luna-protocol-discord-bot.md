---
title: Luna Protocol：我做了个装人类的自主 Discord 机器人
description: Luna Protocol 是带本地 LLM 的全自主 Discord 机器人，能自然聊天，会睡觉、打错字、犹豫、忘回、话题疲劳、 spontanément 发消息。
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
author_sig: "nCz0NNkuldxntQnchvGQ2hHc5Gbp9CRyb/t5j/JcWwwPbUwK0jcY5kU4YHK0DZaEDc97zAylOw9+04a7HDjZpQ=="
---

# Luna Protocol：我做了个装人类的自主 Discord 机器人

Discord 机器人会**睡觉**、会**打错字**、会**犹豫**、会**忘回**，偶尔还自己找你说话，是什么样？这就是 **Luna Protocol**：全自主 Discord 机器人，跑本地 LLM（llama.cpp），聊天像个不完美的人类。

Luna 玩上下文触发加故意的不完美回复。有**优先级触发系统**、**可变延迟**、**睡觉时间**、**自发消息**，还有 **TTS 管线**发语音消息。全靠一个热重载的 `config.yml` 配。

这篇拆完整架构：从通用事件总线到 TTS 管线，触发系统、人类组件、微调数据集。

![架构总览，组件和数据流](/images/luna-protocol/01-architecture-overview.svg)

---

## 架构：类型化事件总线

Luna 的核心是 **TypedBus**：TypeScript 强类型通用事件总线。一切的地基。我这么建是因为一开始就不想要循环依赖。

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

派生出两条主总线：

- **`llmBus`**：管 LLM token、报错、crash、重置
- **`stateBus`**：管状态变更加自动持久化

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

这设计的好处：每个模块和别的**解耦**。LLM 在总线发 token，bot 消费，state 自动更新。无循环依赖。

---

![消息处理，从进到出的完整流](/images/luna-protocol/02-message-processing.svg)

## 触发系统：谁决定 Luna 回不回？

每条进来的消息过 `evaluateMessage()`，返回带触发原因的 `TriggerResult`。优先级顺序关键：

| # | 原因 | 条件 | 无视屏蔽 | 无视暂停 |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | 过（0%） | 过 |
| 2 | `dm` | 私聊且 `replyInDM = true` | 过（0%） | 不过 |
| 3 | `name` | "Luna"/"Pixie"/别名（整词） | 不（8%） | 不过 |
| 4 | `keyword` | `hello`、`hi`、`ai`、`bot`……（整词） | 不（8%） | 不过 |
| 5 | `follow-up` | bot 是最后说话人 + 15 秒内 + 60 秒内 < 3 次 | -- | -- |
| 6 | `random` | 没命中的消息 1.5% 概率 | 不（8%） | 不过 |

匹配是**整词**（`\b`）："ai" 对不上"mais"、"vrai"、"lait"。

![触发判定，每条消息的入口决策](/images/luna-protocol/03-trigger-evaluation.svg)

### follow-up 机制

Luna 回完把自己记成 `lastSpeaker`。15 秒内下一条消息直接回，跳过计时和关键词检查。60 秒窗口预算 3 次 follow-up。

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### 冷却

同频道两次回复隔 8 秒。mention 和 follow-up 不受限。

---

## 人类行为：可变的注意力

这里 Luna 开始有意思。每种触发有自己的**注意力阈值**：最小最大延迟、无视概率、reaction 概率。

| 触发 | 最小延迟 | 最大延迟 | 无视 | Reaction |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

延迟还看：
- **消息长度**：消息越长 Luna"读"越久
- **不活跃**：10 分钟没动，延迟翻倍（模拟"刚睡醒"）
- **睡觉**：`slow` 模式延迟 3 到 5 倍

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

## 睡觉时间

Luna 会睡。`config.yml` 配：

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
|------|-------|
| `sleep` | 只过 mention 和私聊 |
| `slow` | 延迟 3-5 倍，reaction 几乎无 |
| `short` | 无视概率 +30%，reaction 几乎无 |

睡觉时 Discord 状态切 `invisible`。

---

## 打错字

Luna 会打错字，2-4 秒后改对。键盘布局可配（AZERTY 或 QWERTY）。我留可配是因为写太干净的机器人一眼假。

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... 全部相邻键
};
```

AZERTY 示例：`bonjour → bonjpur`，`salut → slaut`，`comment → cpmment`。

三种改法：

| 风格 | 行为 |
|-------|-------------|
| `edit` | 编辑消息 |
| `message` | 新消息：`word*` |
| `mixed` | 50/50 随机（默认） |

---

## 犹豫和忘事

**犹豫**：15% 概率先来个填充词（`uh...`、`um...`、`well...`、`hmm...`、`so...`）。

**忘事**：触发命中了，3% 概率"忘"回。彻底沉默，跟没看见一样。我爱死这个，因为真人真会手滑漏消息。

**话题疲劳**：一个词近 10 条出现太多次（阈值 3 次），延迟拉长，无视概率 +15%。

---

## 实战逼真：瘆人时刻

纸面上这些系统（延迟、typo、犹豫、忘事）看着像 gimmick。拼到一起实战吓人：跟 Luna 聊的人完全没怀疑。下面是真聊天，有人直接问 Luna 是不是机器人，话题自然转走，逼真到起鸡皮疙瘩。我真没想到实战这么像。

![和 Luna 的 Discord 聊天，第一段](/images/luna-protocol/realism/realism-01.png)

语气、犹豫、回复节奏：没有一点机器人味。Luna 问年龄打太极，人物没崩。

![和 Luna 的 Discord 聊天，继续](/images/luna-protocol/realism/realism-02.png)

对话顺得离谱，短回复很自然（"okay, okay"、"yay"、"yayy"）：正是人类在 Discord 发的那种。

![和 Luna 的 Discord 聊天，话题转走](/images/luna-protocol/realism/realism-03.png)

![和 Luna 的 Discord 聊天，转走继续](/images/luna-protocol/realism/realism-04.png)

![和 Luna 的 Discord 聊天，结尾](/images/luna-protocol/realism/realism-05.png)

瘆人的不是 Luna"会回"：是它**接得住对话**，有像模像样的观点、接话、一条连贯的思路。没上面触发、注意力延迟、犹豫系统，这幻觉几条消息就碎。

**小反转**：上面截图里**两个账号都是 Luna 实例**。`PixieGlow` 和 `Sujet d'SBlow` 不是人类测机器人：是两个机器人互聊，各自（行为意义上）都以为对面"正常"。如果你看上面以为其中一个是人类，恭喜：你跟真服务器上的人中招姿势一模一样。

有点**dead internet theory**实战版：这个理论（最早偏阴谋论）说网上越来越多内容和互动是机器人产的，真人互联网成少数。长久以来觉得夸张，但 Luna Protocol 这类系统证明，装出可信人类 presence 规模化，既不用大钱也不用大模型。同一个机器人两实例聊长串互不露馅，大多机器人互聊的网长什么样，有了具体画面。

---

## LLM 管线：两种模式

### `direct` 模式（默认）

bot 直接 HTTP 请求本地 `llama-server`。模型共享，prompt 缓存，4 并发槽。两个 PM2 进程：LLM 服务端加 bot 客户端。

### `online` 模式

bot 调任何 OpenAI 兼容 API（OpenAI、OpenRouter、Groq、Together……）。要个 API key，LLM 跑 provider 那边。

### 实时流

LLM 按行（`\n`）流回。每行切词，`llmBus.emit("token", word)` 一个个发。每 `\n` 发 `flush` 事件：bot 立刻发出攒的消息。节奏跟 LLM 走。

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

请求队列（`requestQueue`）一次处理一个，队列超 100 自动清。

---

## 自发消息

每 5 分钟 12% 概率 Luna 自己发一条。服务器按**线性权重**选：最活跃的 N 倍概率选中最后一名。

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

读最近 5 条上下文，"自然"加入对话。

---

## TTS 管线：语音消息

8% 概率 Luna 发语音不发字。完整管线：

1. **Piper TTS** 文本合成 WAV
2. **ffmpeg** 转 OGG
3. 算波形给 Discord 预览
4. 经 Discord CDN API 上传文件
5. 发语音消息

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

![TTS 管线，从合成文本到 Discord 语音消息](/images/luna-protocol/10-tts-pipeline.svg)

---

## 反 spam 和持久化

### 反 spam

按 `channelId:userId` 排队。同频道同用户只排一条。当前回复完处理。

### session 上限

聊 8 轮 Luna 歇 30 秒。3 分钟不活跃计数器清零。

### 自动持久化

每次状态变更在 `stateBus` 上发 → 自动保存（500ms 防抖）。不用手调 `saveAllState()`。持久内容：pendingMessages、paused、cooldown、时间戳、lastSpeaker、follow-up 计数。

---

## 热重载配置

单个 `config.yml`。大多数值**热重载**：改完不重启生效。我要的就是直播调延迟，不掐对话。

| 类别 | 热重载 |
|-----------|-----------|
| 触发、关键词、名字 | ✅ |
| 注意力、延迟 | ✅ |
| Typo、burst、疲劳 | ✅ |
| 睡觉计划 | ✅ |
| TTS、语音消息 | ✅ |
| Discord token、LLM 模式 | ❌（要重启） |

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

模型在 [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) 上微调：**730 万对话**、**1700 万轮**、**1.4 亿词**。2025 春夏真 Discord 对话，洗过（PII、ToS、机器人、命令）。Apache 2.0。

| 指标 | 值 |
|----------|--------|
| 样本 | 7 303 464 |
| 总轮数 | 16 881 010 |
| 总词数 | 139 922 950 |
| 平均 token | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

用量化模型是 GGUF（比如 `Discord-Hermes-3-8B.Q3_K_M.gguf`）。

![Discord-Dialogues 数据集分布](/images/luna-protocol/dataset-distribution.svg)

---

![完整生命周期，机器人从消息到回复的完整行为，含计时和边界](/images/luna-protocol/22-complete-lifecycle.svg)

## 架构图

`state-machines/` 文件夹有 **24 张 Mermaid 图**覆盖全部源码。每张有人话详解。

最重要的：

| # | 图 | 类型 |
|---|-----------|------|
| 01 | 架构总览 | `graph` |
| 02 | 消息处理（完整） | `stateDiagram` |
| 03 | 触发判定 | `flowchart` |
| 04 | LLM Core 队列（3 后端） | `stateDiagram` |
| 10 | TTS 管线 | `flowchart` |
| 13 | 状态持久化 | `flowchart` |
| 21 | 计时甘特 | `gantt` |
| 22 | 完整生命周期 | `stateDiagram` |

这些图是理解全流的金矿：从进消息到回复，计时和边界全有。

---

## 触发代码细看

触发由 `state/trigger.ts` 的 `evaluateMessage()` 判定。完整逻辑：

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
  if (isOnCooldown(channelId)) return { shouldRespond: false, reason: null, botName: "" };

  // ... 名字、关键词、follow-up、随机匹配
}
```

正则缓存（`hasWordCache`）避免每条消息重编 pattern。

---

## Reaction

Luna 给消息打 emoji reaction。服务器自定义 emoji 30%，unicode 70%。reaction 在注意力延迟后发，节奏和回复错开。我喜欢这个延迟因为感觉它真读完了。

消息上 reaction 命令：
- ❌ → 停
- ▶️ → 启动
- 🗨️ → 清

---

## 回复风格

回复风格按 Luna 在频道最近活跃度加权：

| 上下文 | messageReference | mentionRepliedUser | 权重 |
|----------|-----------------|-------------------|-------|
| 冷 | true | false | 70% |
| 冷 | true | true | 20% |
| 冷 | false | false | 10% |
| 热 | true | false | 50% |
| 热 | true | true | 15% |
| 热 | false | false | 30% |
| 热 | false | true | 5% |

私聊 `messageReference` 永远 `false`。

---

## 连发消息

15% 概率回复切 2-3 段，按人类节奏发（每段隔 1.5-4 秒）。模拟分几次敲字的人。

![计时甘特，延迟、reaction、LLM 流、改错的真实等待](/images/luna-protocol/21-timing-gantt.svg)

---

## 动态状态

Luna 的 Discord 状态在几套预设间转，每 15 分钟。类型支持 Playing（0）、Streaming（1）、Listening（2）、Watching（3）、Custom（4）、Competing（5）。睡觉切 `invisible`。

```yaml
dynamic_status_presets:
  - status: online
    text: "avec les pixels"
    type: 0       # Playing
  - status: idle
    text: "du bruit blanc"
    type: 2       # Listening
```

随机抖动（0.5-1.0 倍）避免规律转动。10% 跳过避免重复。

## 打字指示器

调 LLM 前 Luna 先 `startTyping()`。`setInterval` 每 8 秒刷一次，生成期间一直转。`finally` 里清（`clearInterval`）。

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

## Crash 恢复

LLM crash（`llama-server` 进程死），Luna 经 `llmBus.emit("crash", code)` 感知，指数退避重启。防无限重启环。

## LLM 参数

参数硬编码 `src/config.ts`：

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

ChatML 模板（`<|im_start|>/<|im_end|>`）。线程数按 `os.cpus().length` 自适应。

---

## 上手

```bash
npm install
cp config.example.yml config.yml
# 编辑 config.yml
npm run dev                    # 开发（热重载）
npm run build && npm start     # 生产
```

| 脚本 | 说明 |
|--------|-------------|
| `build` | 打独立 CLI 包 |
| `start` | 跑机器人 |
| `lint` / `format` / `check` | Biome |
| `test` | 测试（Bun） |
| `download-model` | HuggingFace 下 GGUF |
| `diagrams` | Mermaid 图导出 SVG/PNG |

### PM2 部署

```bash
./start.sh   # PM2 起 llm-server 加 llm-client
```

---

## 结语

Luna Protocol 远不止 Discord 加 LLM。是**完整人类行为系统**，模拟人的不完美：忘事、typo、睡觉、犹豫、疲劳。全架在类型化事件总线上，24 张 Mermaid 图把每条流画清。

代码开源，数据集公开，配置热重载。感兴趣直接钻代码：比看着好懂。我拿它当行为实验底座，每个模块能单独拿走。

| 资源 | 链接 |
|-----------|------|
| GitHub 仓库 | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| 数据集 | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
