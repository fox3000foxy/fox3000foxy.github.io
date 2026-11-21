---
title: Luna Protocol：大脑复用、情绪分类、有趣/无聊路由
description: Luna Protocol 从单体拆成四层架构：适配器、大脑、情绪分类器、推理。centroid embedding、情绪变量、valence/arousal 调 LLM 参数。
date: 2026-07-27
tags:
  - discord
  - matrix
  - llm
  - architecture
  - embeddings
  - centroids
  - emotion-ai
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "McPGL97liclXymQrKeZdoo6EJS/UKzkZOv7flRy0qPlIwAhlyMaYzhkhSpg2rmSpjJsSTlQXzahRHUTn0tdaIQ=="
---

# Luna Protocol：大脑复用、情绪分类、有趣/无聊路由

前[两篇](/articles/fr/luna-protocol-discord-bot)[文章](/articles/fr/luna-protocol-official-models)里我把 Luna Protocol 讲成单个 Discord 机器人，复杂行为系统加微调模型。但架构早就变了。当初的单体：一个 Node.js 进程管 Discord 机器人、行为、LLM 调用，拆成**四个独立层**，各有职责、语言、生命周期。

拆分带来意外好处：多平台"大脑"复用，按 LLM 参数动态调的情绪分类系统，按对话感知重要性在两模型间路由消息。

演进不是一刀切：有机生长。我先从机器人仓库拆 `server/` 目录，一边 **Krystal** 一边剩下 **Jade** 当 Discord 适配器。再拿 Jade 的 `llm-core` 和事件总线做 **Pixieglow**（Matrix 适配器）。接着 **Sapphire** 上 DistilBERT 做 GENERIC/SEMANTIC 分类。结果不服，换 embedding centroid，更好加示例更准，分类变 FUTILE/INTERESSANT。再加 **valence** 和 **arousal** centroid 调 LLM 温度和 repeat penalty。最后把 Jade 和 Pixieglow 重复代码全抽了造 **Emerald**，共用大脑，Jade 和 Pixieglow 退成 socket 驱动的瘦客户端。

中间我还搭网站记录进展：[protocol-luna.github.io](https://protocol-luna.github.io/)。

这篇讲为什么切这几层，每层服务到底干什么，**centroid**（embedding 平均向量）和**怨念变量**（70 年代 PARRY 聊天机器人来的灵感）怎么把简单 Discord 机器人变成跨平台还出奇一致的系统。

---

## 单体的问题

最初 Luna Protocol 是一个 Node.js 进程。管：

- Discord 连接（Eris 库）
- 触发判定（mention、关键词、follow-up……）
- 人类行为模拟（typo、犹豫、睡觉……）
- 本地 llama.cpp HTTP 调用
- session 管理和反 spam
- TTS 管线

全一进程，类型化事件总线（`TypedBus`）串着。能跑，但有墙：

- 加 Matrix 客户端要复制整套行为代码
- LLM 和机器人同仓库：`server/` 目录早就在，但动一边必碰另一边
- 无差别处理： "lol" 和存在主义问题走同一套
- 情绪失忆：机器人"没感觉"

切层全解了。

---

## 四层

现在 Luna Protocol 架构是四级漏斗：

```
Matrix / Discord
      |
      v
  [适配器]      Pixieglow（Matrix）/ Jade（Discord）
      |
      v
  [大脑]            Emerald（WebSocket，3126 端口）
      |
      v
  [分类]          Sapphire（HTTP，3123 端口）
      |
      v
  [推理]          Krystal（llama.cpp，3124 / 3125 端口）
```

每层独立重启、升级、换掉。

---

### 第 1 层：适配器（Pixieglow 和 Jade）

最薄的两层。只做一件事：把聊天平台事件翻译成往 Emerald 发的标准协议：

- **Jade** 是 Discord 适配器。Eris 库连 Discord，经 WebSocket 把消息转发 Emerald。还管 TTS 管线（Piper 语音合成、转 OGG、传 Discord）。
- **Pixieglow** 是 Matrix 适配器。直接调 Matrix Client-Server HTTP API（不用 SDK），长轮询 sync。没 TTS。

两适配器共享 `emerald-client.ts` 定的同一 WebSocket 协议：

```typescript
type ClientId = "jade" | "pixieglow";

// 事件（适配器 → Emerald）
type InEvent = MessageEvent | ReadyEvent | BotMessageEvent | PresenceEvent;

// 命令（Emerald → 适配器）
type OutCommand = RespondCommand | TypingCommand | SetPresenceCommand
                | SpontaneousCommand | ForgotCommand;
```

两适配器同接口证明复用成立：**同一个"大脑"（Emerald）同时伺候 Discord 机器人和 Matrix 机器人**，行为一致。协议是声明式的：Emerald 不教适配器*怎么*发消息，告诉它发*什么*（文本加延迟，可能带 burst 计划、reaction 等）。各适配器按平台具体执行。

这架构的力：加 Telegram、Signal 之类，写个实现 WebSocket 协议的适配器就行。

---

### 第 2 层：大脑（Emerald）

Emerald 是中央决策服务。3126 端口听 WebSocket，管：

- 触发判定：mention、DM、名字、关键词、follow-up、随机
- 行为模拟：注意力延迟、typo、犹豫、忘事、burst、话题疲劳
- 睡眠周期：sleep / slow / short 模式
- session 管理：冷却、session 上限、反 spam
- 往 Sapphire 路由：发消息，收流式回复

Emerald 是促成复用的中央层，也是拆分受益最大的。以前每种行为（typo、burst、hesitation）和 Discord 代码绞在一起。现在 `behavior/` 下独立模块：

```
emerald/src/behavior/
  burst.ts         -- 连发消息计划
  mannerisms.ts    -- 延迟、犹豫、reaction、忘事
  sleep.ts         -- 睡眠时间判定
  typo.ts          -- typo 模拟（AZERTY/QWERTY）
```

大脑不知道自己在哪个平台。它收带 `clientId`（"jade" 或 "pixieglow"）的 `MessageEvent`，做决定，回命令。执行适配器管。

---

### 第 3 层：情绪分类器（Sapphire）

Sapphire 技术上最有意思。是 Python FastAPI 写的 **LLM 中间件**，四个关键角色：

1. **二分类 FUTILE / INTERESSANT** 走 embedding centroid
2. **情绪打分**（valence / arousal）走 centroid
3. 往 Krystal **路由后端**（小模型对大模型）
4. **few-shot 注入**和 session 管理

#### centroid：分类的心脏

**centroid** 概念简单：embedding 向量集合的平均。实际我攒几百条消息示例，过 embedding 模型（`BAAI/bge-small-en-v1.5`，384 维），平均向量。

两颗**分类 centroid**：

- `futile_centroid`：约 683 条琐碎消息（"lol"、"ok"、"hello"），k-means（k=10，seed=42）
- `interessant_centroid`：约 678 条实质消息（技术、个人、哲学），k-means（k=10，seed=42）

消息进来：

```python
def classify(text, embedder, futile_centroids, interessant_centroids):
    emb = embedder.query_embed(text)                     # 384 维向量
    sim_f = max(cos(emb, c) for c in futile_centroids)     # 10 个取最大
    sim_i = max(cos(emb, c) for c in interessant_centroids) # 10 个取最大
    diff = sim_i - sim_f
    label = "INTERESSANT" if diff > 0 else "FUTILE"
    return label, abs(diff), sim_f, sim_i
```

每类分数是 10 个 centroid 里**最大余弦相似度**。抓住每类子类：问候和道别都靠近某颗 futile centroid，哪怕 embedding 空间里离得远。启动 k-means 一次，运行全点积：不训练，不用 GPU。

#### 为什么两模型？

分类结果定调哪个 LLM 后端：

| 标签 | Krystal 后端 | 模型 | 端口 |
|-------|----------------|--------|------|
| `FUTILE` | `generic` | Luna-Protocol-1.5B（941M，Q4_K_M） | 3124 |
| `INTERESSANT` | `semantic` | Hermes-3-3B 或 8B（看配置） | 3125 |

直觉简单："lol" 或 "nm just chillin u" 不值得调 80 亿参数模型。Discord 微调小 Luna 1.5B（20 万样本训）应付闲聊足够。人生问题、掏心窝、硬核技术 debate 路由大模型给更厚回复。

经济路由大幅减 LLM 服务器负载：约 70% 消息判 FUTILE 走小模型，大模型留给真值得的对话。

#### 情绪轴：valence 和 arousal

不止这些。Sapphire **同 centroid 机制**独立轴给消息打情绪分：

四颗**情绪 centroid**：

| 极 | 示例 |
|------|----------|
| `positive` | "hell yeah"、"love that"、"this is great" |
| `negative` | "shut up"、"i hate this"、"this sucks" |
| `high_arousal` | "WHAT THE HELL"、"omg omg omg"、"AAAAA" |
| `low_arousal` | "just chilling"、"meh"、"i guess" |

分数是两轴相似度差：

```python
valence = sim(emb, positive) - sim(emb, negative)     # [-1, +1]
arousal = sim(emb, high_arousal) - sim(emb, low_arousal)  # [-1, +1]
```

**valence** 量正负。**arousal** 量情绪强度。合起来是情感环状模型（Russell，1980），1972 年 **PARRY** 聊天机器人灵感来源的同一心理学模型。

#### 怨念变量：情绪怎么调 LLM

PARRY 灵感落地的点。PARRY（Kenneth Colby 1972 年造）是装偏执病人的聊天机器人。它有内部变量（恐惧、愤怒、猜疑）改回复。比如"害怕"的 PARRY 回得更冲。

Sapphire 同样的事，连续变量加更优雅的方法：LLM 采样参数按对话情绪状态实时调。

##### 温度跟 arousal 走

```python
temperature = clamp(0.7 + arousal * 0.3, 0.4, 1.0)
```

| Arousal | 温度 | 效果 |
|---------|-------------|-------|
| -1.0（平静） | 0.40 | 低 creativity，可预测回复 |
| 0.0（中性） | 0.70 | 默认 creativity |
| +1.0（激动） | 1.00 | 最大随机，意外回复 |

人激动上头（arousal 高），温度升。模型输出更多变更 creative 甚至混乱，像人"上头"。对话平静温度降，回复稳。

##### repeat penalty 跟 valence 走

```python
repeat_penalty = clamp(1.15 - valence * 0.1, 1.0, 1.3)
```

| Valence | Repeat Penalty | 效果 |
|---------|---------------|-------|
| -1.0（负） | 1.25 | 重罚，避重复 |
| 0.0（中性） | 1.15 | 默认 |
| +1.0（正） | 1.05 | 轻罚，允许重复 |

对话越负，模型越被推着别复读，像紧张吵架找词的人。对话越正，越允许肯定式复读，像松弛闲聊。

##### 累积情绪状态

分数不只看当下消息。`EmotionState` 按 session 维护 valence 和 arousal **指数滑动平均**：

```python
class EmotionState:
    def __init__(self, decay=0.85, deadzone=0.06):
        self.decay = decay
        self.deadzone = deadzone

    def update(self, key, valence_delta, arousal_delta):
        if abs(valence_delta) < self.deadzone:
            valence_delta = 0.0
        if abs(arousal_delta) < self.deadzone:
            arousal_delta = 0.0
        s = self._state.setdefault(key, {"valence": 0.0, "arousal": 0.0})
        s["valence"] = s["valence"] * self.decay + valence_delta * (1 - self.decay)
        s["arousal"] = s["arousal"] * self.decay + arousal_delta * (1 - self.decay)
        return s
```

`decay` 0.85 意思是每消息保留 85% 旧状态，融 15% 新信号。得到**情绪记忆**抹平剧烈抖动：一条负消息不让机器人"难过"，一连串负的慢慢带偏心情。

实际：有人开场很激动（`arousal=+0.8`），后面消息平了温度还高几轮。情绪下来慢，像人吵完还"热"着。

---

### 第 4 层：推理（Krystal）

Krystal 最底层：llama.cpp 套 OpenAI 兼容 API（`/v1/chat/completions`）壳。PM2 起两实例：

- `krystal-small`：Luna 微调 1.5B 模型，3124 端口，CPU 亲和 0
- `krystal-large`：Hermes 3B 模型，3125 端口，CPU 亲和 0、1

两实例是预编译 `llama-server` 进程，`taskset` 绑 CPU。

Luna 微调相对第二篇也进化了：训练到 **20 万样本**（之前 5 万），还是 Qwen2.5-1.5B-Instruct QLoRA。20 万是从 Discord-Dialogues 子集滤的，留最自然最多样的对话。目标：拓宽小模型风格 register，不丢 few-shot 启动的弹性。

---

## 全图：一句话旅行

"我今天真难过"发 Discord 上，具体发生什么：

1. **Jade** 经 Discord Gateway API 收消息。转 `MessageEvent` 经 WebSocket 发 Emerald。
2. **Emerald** 判触发（mention？名字？关键词？）。直接 mention。它算注意力延迟，查冷却、session、话题疲劳。定回复，经 HTTP 发 Sapphire。
3. **Sapphire** 拿 `bge-small-en-v1.5` embed 消息。
   - 分类：消息离 `interessant` centroid 比 `futile` 近（diff = +0.31）→ **INTERESSANT**
   - 情绪：valence 负（-0.42），arousal 中（0.35）
   - 路由：`KRYSTAL_SEMANTIC_URL`（3125 端口，大模型）
   - 采样参数：温度 = 0.80（arousal 推高），repeat_penalty = 1.19（valence 负）
   - session 情绪状态更新
4. **Krystal**（大实例）按情绪调参生成回复，回 Sapphire。
5. **Sapphire** 流式回 Emerald，带元数据（标签、valence、arousal、debug 统计）。
6. **Emerald** 定加犹豫（"oh……"），排 burst（2 段），挑 reaction。发 `RespondCommand` 给 Jade。
7. **Jade** 执行：等初始延迟，发第一段带犹豫，1.5 秒后发第二段。生成全程打字指示器开着。

用户侧全程不到 3 秒。

---

## centroid：为什么比神经分类器好

Sapphire 以前 DistilBERT 分类器，值得解释为什么换 embedding centroid。

神经分类器学类间决策边界，一般非线性投影到概率。准，但：

- 要标注训练数据
- 数据漂移敏感（data drift）
- 难解释
- 加类要重训

centroid 是示例 embedding **平均向量**。分类靠和平均向量的余弦相似度。好处：

- **零训练**：手挑示例 embedding 平均一下
- **好解释**：看离 centroid 最近的示例就知道"它学了什么"
- **加类**：加颗 centroid，不重训
- **稳健**：平均抹掉 outlier

centroid 真威力是把分类变成**空间距离度量**。类别是 384 维空间区域（PCA/t-SNE 降 2D/3D 可视化）。

### centroid 3D 可视化

实际分类 centroid 在 embedding 空间长这样。每点一条示例消息，PCA 压 3D（384 维压 3 维看）。蓝点 futile 消息，黄点 interessant 消息。**20 颗钻石标记**是 k-means centroid（每类 10 颗，seed=42）。悬停看示例原文。

<iframe src="assets/centroids-plot.html" style="width:100%;height:550px;border:none;border-radius:8px;" loading="lazy" title="按 centroid 分类，3D 交互视图"></iframe>

两条红色测试示例："lol"（判 futile），"i feel sad today"（判 interessant）。384 压 3 维只剩 14.7% 解释方差，两簇还清楚分开。顶部注记总样本数和模糊区。

输入消息的 centroid 在空间里按内容飘。FUTILE/INTERESSANT 分类就是量它离哪颗 centroid 余弦最近。每条消息能看成多维空间一点，每维对应某种语义属性。

---

## 实际改变什么

用户看不见层、centroid、温度调。但感觉得到：

- 简单消息**回更快**（小模型快 2 倍，吃 70% 流量）
- **语气自适应**：你急机器人"感"到急，风格跟变
- **跨平台一致**：Matrix 机器人和 Discord 机器人共享大脑和情绪状态
- **本味保住**：微调加 few-shot 加智能路由，不出企业腔

小模型训到 20 万样本又强化了这些：Discord 对话多样性吃更好，few-shot 弹性还在。

---

## 完整 infra

现在跑的服务：

| 服务 | 技术 | 端口 | 角色 |
|---------|------------|---------|------|
| Pixieglow | TypeScript（Bun） | -- | Matrix 适配器 |
| Jade | TypeScript（esbuild） | -- | Discord 适配器 |
| Emerald | TypeScript（Bun） | 3126（WebSocket） | 大脑 / 决策 |
| Sapphire | Python（FastAPI） | 3123（HTTP） | 分类加情绪 |
| Krystal small | llama.cpp（PM2） | 3124 | 小模型（1.5B，futile） |
| Krystal large | llama.cpp（PM2） | 3125 | 大模型（3B+，interessant） |

服务依赖单向：适配器依赖 Emerald，Emerald 依赖 Sapphire，Sapphire 依赖 Krystal。图无环。每服务独立重启。

---

## 结语

Luna Protocol 拆四层不只是架构练习。是对具体墙的回应：Matix 支持不了，情绪感知没有，消息轻重不分。

现在系统更稳（LLM crash 不杀机器人），更能长（Telegram、WhatsApp 适配器走同一 WebSocket 协议就行），更"活"：行为、语气、甚至 LLM 参数都随感知到的对话情绪变。

embedding centroid 是让一切成立的关键，还简单得离谱：不训神经网络，不搞标注管线，平均向量加余弦相似度。简单，巨有效，严重被低估。

| 资源 | 链接 |
|----------|------|
| 项目站 | [protocol-luna.github.io](https://protocol-luna.github.io/) |
| Pixieglow | [protocol-luna/pixieglow](https://github.com/protocol-luna/pixieglow) |
| Emerald | [protocol-luna/emerald](https://github.com/protocol-luna/emerald) |
| Sapphire | [protocol-luna/sapphire](https://github.com/protocol-luna/sapphire) |
| Krystal | [protocol-luna/krystal](https://github.com/protocol-luna/krystal) |
| 第 1 篇：Discord 机器人 | [Luna Protocol：我做了个装人类的 Discord 机器人](/articles/fr/luna-protocol-discord-bot) |
| 第 2 篇：微调 | [Luna Protocol：为什么我在 5 万 Discord 样本上微调 15 亿参数模型](/articles/fr/luna-protocol-official-models) |
