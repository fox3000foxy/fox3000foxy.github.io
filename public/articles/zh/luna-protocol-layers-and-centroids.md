---
title: "Luna Protocol：共享大脑、情感分类，以及有趣/无聊的路由机制"
description: "Luna Protocol 从一个单体架构演变为四层架构：适配器、大脑、情感分类器和推理层。本文将介绍嵌入质心、有趣/无聊路由，以及根据效价和唤醒度调整 LLM 参数的方法。"
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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: ""
---

# Luna Protocol：共享大脑、情感分类，以及有趣/无聊的路由机制

在[前两篇](/articles/zh/luna-protocol-discord-bot)[文章](/articles/zh/luna-protocol-official-models)中，我把 Luna Protocol 介绍成一个拥有复杂行为系统和微调模型的单一 Discord 机器人。但此后架构发生了巨大的演变。曾经的单体架构——一个处理 Discord 机器人、行为逻辑和 LLM 调用的单一 Node.js 进程——如今已经变成了**四个独立的层**，每一层都有自己的职责、自己的语言和自己的生命周期。

这次拆分带来了意想不到的好处：跨多个平台共享"大脑"、一个能动态调整 LLM 参数的情感分类系统，以及根据对话感知重要性在两个模型之间智能路由消息的机制。

这次演进并非一蹴而就——而是遵循了一条有机的路径。我首先把 `server/` 文件夹从机器人仓库中拆分出来，创建了 **Krystal**，并保留 **Jade** 作为 Discord 适配器。接着我复用了 Jade 的 `llm-core` 和事件总线，创建了 **Pixieglow**（Matrix 适配器）。然后是 **Sapphire** 的加入，它引入了基于 DistilBERT 的 GENERIC/SEMANTIC 分类——但效果并不理想，于是我转向了嵌入质心，这种方法在丰富示例方面更灵活，也更精确；分类变成了无聊/有趣。最终我加入了**效价**和**唤醒度**质心，用来调节 LLM 的温度和重复惩罚。最后，我通过创建共享大脑 **Emerald**，消除了 Jade 和 Pixieglow 之间所有冗余代码，把它们变成了简单的、由 socket 驱动的客户端。

与此同时，我一直维护着一个网站，用来追踪项目的进展：[protocol-luna.github.io](https://protocol-luna.github.io/)。

本文将讲述我为什么以及如何拆分这些层，每个服务具体做什么，以及**质心**（嵌入向量的平均值）和**怨恨变量**（灵感来自 1970 年代的聊天机器人 PARRY）等概念，是如何把一个简单的 Discord 机器人变成一个出人意料地连贯一致的多平台系统的。

---

## 单体架构的问题

最初，Luna Protocol 只需要一个 Node.js 进程。代码负责处理：

- Discord 连接（通过 Eris 库）
- 触发条件的评估（提及、关键词、跟进消息……）
- 人类行为的模拟（打字错误、犹豫、睡眠……）
- 对本地 LLM 服务器（llama.cpp）的 HTTP 调用
- 会话管理与反垃圾信息
- TTS 流水线

一切都运行在同一个进程中，通过类型化的事件总线（`TypedBus`）进行通信。它能用，但存在局限：

- **无法添加 Matrix 客户端**，除非复制全部行为代码
- **LLM 和机器人在同一个仓库中**：`server/` 文件夹虽已存在，但无法在不影响另一方的情况下独立演进其中一方
- **没有智能分类**：无论是一句"lol"还是一个存在主义式的问题，每条消息都被同等对待
- **没有持久的情感状态**：机器人什么都"感觉"不到

分层拆分解决了所有这些问题。

---

## 四个层级

Luna Protocol 目前的架构被组织成一个四级漏斗：

```
Matrix / Discord
      |
      v
  [适配器]        Pixieglow (Matrix) / Jade (Discord)
      |
      v
  [大脑]          Emerald (WebSocket, 端口 3126)
      |
      v
  [分类器]        Sapphire (HTTP, 端口 3123)
      |
      v
  [推理层]        Krystal (llama.cpp, 端口 3124 / 3125)
```

每一层都可以独立重启、更新或替换。

---

### 第一层：适配器（Pixieglow 和 Jade）

这是最简单的一层。它们唯一的工作就是把某个消息平台的事件，翻译成发往 Emerald 的标准化协议：

- **Jade** 是 Discord 适配器。它使用 Eris 库连接 Discord，并通过 WebSocket 把消息转发给 Emerald。它还负责 TTS 流水线（通过 Piper 进行语音合成、转换为 OGG、上传到 Discord）。
- **Pixieglow** 是 Matrix 适配器。它直接使用 Matrix 的 Client-Server HTTP API（不依赖 SDK），采用长轮询同步。它没有 TTS 功能。

两个适配器共享同一个在 `emerald-client.ts` 中定义的 WebSocket 协议：

```typescript
type ClientId = "jade" | "pixieglow";

// 事件（适配器 -> Emerald）
type InEvent = MessageEvent | ReadyEvent | BotMessageEvent | PresenceEvent;

// 命令（Emerald -> 适配器）
type OutCommand = RespondCommand | TypingCommand | SetPresenceCommand
                | SpontaneousCommand | ForgotCommand;
```

两个拥有相同接口的适配器同时存在，证明了共享机制确实有效：**同一个"大脑"（Emerald）可以无差别地为 Discord 机器人和 Matrix 机器人服务**，且行为完全一致。这个协议是声明式的：Emerald 并不会告诉适配器*如何*发送一条消息，而是告诉它*应该发送什么*（带延迟的文本、可能的连发计划、一个反应等等）。每个适配器根据自身平台实现具体的执行逻辑。

这正是这套架构的优势所在：要支持 Telegram、Signal 或其他任何平台，只需编写一个实现该 WebSocket 协议的适配器即可。

---

### 第二层：大脑（Emerald）

Emerald 是中枢决策服务。它通过 WebSocket 在 3126 端口监听，负责：

- **触发条件评估**：提及、私信、名字、关键词、跟进消息、随机
- **行为模拟**：专注延迟、打字错误、犹豫、遗忘、连发消息、话题疲劳
- **睡眠周期**：sleep / slow / short 三种模式
- **会话管理**：冷却时间、会话限制、反垃圾信息
- **向 Sapphire 的路由**：发送消息、接收流式返回的响应

Emerald 是使共享成为可能的核心服务，也是从这次拆分中受益最多的一个。以前，每种行为（打字错误、连发消息、犹豫）都与 Discord 代码紧密纠缠在一起。现在它们都被放在 `behavior/` 目录下的专用模块中：

```
emerald/src/behavior/
  burst.ts         -- 连发消息的规划
  mannerisms.ts    -- 延迟、犹豫、反应、遗忘
  sleep.ts         -- 睡眠时间表的评估
  typo.ts          -- 打字错误模拟 (AZERTY/QWERTY)
```

大脑并不知道自己运行在哪个平台上。它接收一个带有 `clientId`（"jade" 或 "pixieglow"）的 `MessageEvent`，做出决定，并返回一条命令。剩下的事情由适配器负责。

---

### 第三层：情感分类器（Sapphire）

Sapphire 是技术上最有趣的服务。它是一个用 Python 和 FastAPI 编写的 **LLM 中间件**，承担着四个关键角色：

1. 通过嵌入质心实现的**无聊 / 有趣二元分类器**
2. 通过质心实现的**情感评分器**（效价 / 唤醒度）
3. 面向 Krystal 的**后端路由器**（小模型 vs 大模型）
4. **少样本（few-shot）注入器**与会话管理器

#### 质心：分类的核心

**质心**是一个简单的概念：它是一组嵌入向量的平均值。具体来说，我收集了数百条示例消息，把它们输入一个嵌入模型（`BAAI/bge-small-en-v1.5`，384 维），然后对得到的向量取平均值。

有**两个分类质心**：

- `futile_centroid`：约 500 条琐碎消息（"lol"、"ok"、"hello"、"nm just chillin u"）的嵌入平均值
- `interesting_centroid`：约 550 条有实质内容的消息（技术问题、心事倾诉、哲学讨论）的嵌入平均值

当一条消息到来时：

```python
def classify(text, embedder, futile_centroid, interesting_centroid):
    emb = embedder.query_embed(text)          # 消息的 384 维向量
    sim_f = cosine_similarity(emb, futile_centroid)
    sim_i = cosine_similarity(emb, interesting_centroid)
    diff = sim_i - sim_f
    label = "INTERESTING" if diff > 0 else "FUTILE"
    return label, abs(diff), sim_f, sim_i
```

消息与每个质心之间的余弦相似度决定了它的类别。绝对差值则给出置信度。这种方法简单、快速（不需要 LLM 的前向传播），而且效果出奇地好。

#### 为什么用两个模型？

这次分类的结果决定了要调用哪个 LLM 后端：

| 标签 | Krystal 后端 | 模型 | 端口 |
|------|--------------|------|------|
| `FUTILE`（无聊） | `generic` | Luna-Protocol-1.5B（941 MB, Q4_K_M） | 3124 |
| `INTERESTING`（有趣） | `semantic` | Hermes-3-3B 或 8B（视配置而定） | 3125 |

这个直觉很简单：一句"lol"或"nm just chillin u"不值得调用一个 80 亿参数的模型。经过 20 万条 Discord 样本微调的小型 Luna 1.5B 模型，处理轻松的对话已经绰绰有余。而关于人生的问题、心事倾诉或技术辩论，则会被路由到能产生更丰富回复的大模型上。

这种经济型路由大大降低了 LLM 服务器的负载：大约 70% 的消息被分类为"无聊"，由小模型处理，从而把大模型解放出来，专门服务于那些真正值得的对话。

#### 情感维度：效价与唤醒度

但这还不是全部。Sapphire 在一个独立的维度上使用了**同样的质心机制**，来评估消息的情感：

有**四个情感质心**：

| 极点 | 示例 |
|------|------|
| `positive`（正面） | "hell yeah"、"love that"、"this is great" |
| `negative`（负面） | "shut up"、"i hate this"、"this sucks" |
| `high_arousal`（高唤醒） | "WHAT THE HELL"、"omg omg omg"、"AAAAA" |
| `low_arousal`（低唤醒） | "just chilling"、"meh"、"i guess" |

分数的计算方式是各维度上相似度的差值：

```python
valence = sim(emb, positive) - sim(emb, negative)     # [-1, +1]
arousal = sim(emb, high_arousal) - sim(emb, low_arousal)  # [-1, +1]
```

**效价（Valence）**衡量消息是正面还是负面。**唤醒度（Arousal）**衡量它的情感强度。两者结合起来构成了情感环状模型（Russell，1980）——正是这个心理学模型，启发了 1972 年的聊天机器人 **PARRY**。

#### 怨恨变量：情感如何控制 LLM

正是在这里，PARRY 的启发变得具体可感。PARRY（由 Kenneth Colby 于 1972 年创建）是一个用于模拟偏执型患者的聊天机器人。它拥有内部变量——恐惧、愤怒、猜疑——这些变量会改变它的回应方式。比如，一个"受到惊吓"的 PARRY 会做出更具攻击性的回应。

Sapphire 做的是同样的事情，但采用了连续变量和更优雅的方法：LLM 的采样参数会根据对话的情感状态实时调整。

##### 温度跟随唤醒度

```python
temperature = clamp(0.7 + arousal * 0.3, 0.4, 1.0)
```

| 唤醒度 | 温度 | 效果 |
|--------|------|------|
| -1.0（平静） | 0.40 | 创造性低，回应可预测 |
| 0.0（中性） | 0.70 | 默认创造性 |
| +1.0（激动） | 1.00 | 最大随机性，回应令人意外 |

当有人感到兴奋或恼怒时（高唤醒度），温度会上升。模型会产生更加多样、更有创造性、有时更混乱的回应——就像一个"忘乎所以"的人。当对话平静时，温度下降，回应变得更加沉稳。

##### 重复惩罚跟随效价

```python
repeat_penalty = clamp(1.15 - valence * 0.1, 1.0, 1.3)
```

| 效价 | 重复惩罚 | 效果 |
|------|----------|------|
| -1.0（负面） | 1.25 | 惩罚力度大，避免重复 |
| 0.0（中性） | 1.15 | 默认值 |
| +1.0（正面） | 1.05 | 惩罚力度小，允许重复 |

对话越负面，模型就越被推动去避免重复自己——就像一个人在紧张的争吵中努力寻找措辞。对话越正面，模型就越能容忍冗余的表述，就像在一场轻松的闲聊中一样。

##### 累积的情感状态

这些分数并不只针对当下这一条消息。`EmotionState` 会为每个会话维护一个效价和唤醒度的**指数移动平均值**：

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

`decay` 值为 0.85，意味着每条消息都会保留 85% 的先前状态，并融入 15% 的新信号。这形成了一种**情感记忆**，能够平滑掉剧烈波动：单独一条负面消息不会让机器人"悲伤"起来，但一连串的负面消息会逐渐让它的情绪发生偏移。

在实践中：如果有人以非常兴奋的状态开始一段对话（`arousal=+0.8`），即使后续消息更加平静，温度也会在好几轮交流中保持在较高水平。情绪需要时间才能平复下来——就像一个人在争吵之后仍然"余怒未消"一样。

---

### 第四层：推理（Krystal）

Krystal 是最底层：它是围绕 `llama.cpp` 构建的一个封装层，对外暴露一个与 OpenAI 兼容的 API（`/v1/chat/completions`）。它以两个 PM2 实例的形式运行：

- `krystal-small`：微调后的 Luna 1.5B 模型，运行在 3124 端口，CPU 亲和性为 0
- `krystal-large`：Hermes 3B 模型，运行在 3125 端口，CPU 亲和性为 0、1

两个实例都是预编译好的 `llama-server` 进程，通过 `taskset` 启动以实现 CPU 绑定。

自第二篇文章以来，Luna 模型的微调也发生了演进：现在它使用**20 万条样本**进行训练（相比之前的 5 万条），仍然是基于 Qwen2.5-1.5B-Instruct 通过 QLoRA 进行微调。这 20 万条样本是 Discord-Dialogues 数据集的一个子集，经过筛选，只保留了最自然、最多样化的对话。目标是：在不损失使少样本引导（few-shot priming）如此有效的灵活性的前提下，拓宽模型的风格表达范围。

---

## 完整流程：一条消息的旅程

下面是当有人在 Discord 上发送"我今天真的很难过"时具体发生的事情：

1. **Jade** 通过 Discord Gateway API 接收到消息。它将消息转换为一个 `MessageEvent`，并通过 WebSocket 发送给 Emerald。
2. **Emerald** 评估触发条件（是提及？名字？还是关键词？）。这是一次直接提及。它计算出一个专注延迟，检查冷却时间、会话状态、话题疲劳度。它决定回应，并通过 HTTP 把消息发送给 Sapphire。
3. **Sapphire** 使用 `bge-small-en-v1.5` 对消息进行嵌入。
   - 分类：该消息更接近 `interesting` 质心而非 `futile` 质心（差值 = +0.31）-> **有趣（INTERESTING）**
   - 情感：负面效价（-0.42），中等唤醒度（0.35）
   - 路由：方向为 `KRYSTAL_SEMANTIC_URL`（3125 端口，大模型）
   - 采样参数：温度 = 0.80（唤醒度提高所致），repeat_penalty = 1.19（负面效价所致）
   - 会话的情感状态被更新为这些数值
4. **Krystal**（大模型实例）用经过情感调整的参数生成回应，并返回给 Sapphire。
5. **Sapphire** 将这个回应连同元数据（标签、效价、唤醒度、调试统计信息）流式传输给 Emerald。
6. **Emerald** 决定加入一句犹豫的话（"哦……"），规划一次连发（2 个片段），并选择一个反应。它向 Jade 发送一个 `RespondCommand`。
7. **Jade** 执行操作：等待初始延迟，发送带有犹豫语气的第一个片段，等待 1.5 秒，再发送第二个片段。在整个生成过程中，它会一直显示"正在输入"的提示。

这一切在用户看来，都发生在不到 3 秒的时间里。

---

## 质心：为什么它比神经网络分类器更好

选择嵌入质心而不是传统分类器（比如我之前使用的 DistilBERT）的原因，值得解释一下。

神经网络分类器学习的是各个类别之间的决策边界——通常是一种把输入映射为概率的非线性变换。它很精确，但存在以下问题：

- 需要有标签的训练数据
- 对分布变化（数据漂移）很敏感
- 难以解释
- 每添加一个新类别都需要重新训练

而质心则是一组示例嵌入的**平均向量**。分类过程通过与这个平均向量的余弦相似度来完成。它的优点包括：

- **无需训练**：只需计算手工挑选的示例嵌入的平均值即可
- **易于解释**：可以查看哪些示例最接近质心，从而理解"这个质心学到了什么"
- **添加类别很简单**：只需添加一个新的质心——无需重新训练
- **鲁棒性强**：质心是一种平均值，因此离群点的影响很小

质心真正的力量在于，它把一个分类问题转化成了一个**空间距离度量**问题。我们可以把各个类别想象成 384 维空间中的一个个区域（经过 PCA/t-SNE 降维后，也可以在 2D/3D 中可视化）。

### 质心的 3D 可视化

在实践中，嵌入空间中的分类质心大致是这个样子。每个点代表一条示例消息，通过 PCA 投影到 3D 空间中（原始的 384 维被降维到 3 维用于可视化）。蓝色的点是"无聊"消息，黄色的点是"有趣"消息。两个大的菱形是计算出的质心——即每组的平均值。把鼠标悬停在某个点上，即可看到该示例的原始文本。

<iframe src="assets/centroids-plot.html" style="width:100%;height:550px;border:none;border-radius:8px;" loading="lazy" title="质心分类 - 交互式 3D 视图"></iframe>

图中用红色标出了两个示例："lol"（被分类为无聊）和 "i feel sad today"（被分类为有趣）。"lol" 落在了"无聊"消息的蓝色云团中，而 "i feel sad today" 则位于黄色点的一侧。即使降维到 3 维之后，这种分离依然清晰可见（尽管只解释了总方差的 15.6%）。在完整的 384 维空间中，分类边界要清晰得多。

输入消息的质心会根据其内容在这个空间中游走。无聊/有趣的分类，本质上就是通过余弦相似度来判断哪个质心更近。这样一来，每条消息都可以被表示成多维空间中的一个点，每个维度对应一种语义属性。

---

## 这在实践中改变了什么

用户看不到这些层、质心，或是温度调整。但他们能感受到这些效果：

- **更快的响应速度**：对于简单消息（小模型速度快 2 倍，处理 70% 的流量）
- **自适应的语气**：如果你感到恼怒，机器人能"感受到"这种恼怒，并调整自己的表达风格
- **跨平台一致性**：Matrix 机器人和 Discord 机器人共享同一个大脑和同一个情感状态
- **没有"助手模式"**：微调 + 少样本引导 + 智能路由，避免了那种公司腔调的回应

将小模型的训练样本增加到 20 万条，进一步强化了这些效果：模型能更好地捕捉 Discord 对话的多样性，同时又不失少样本引导所带来的灵活性。

---

## 完整的基础设施

以下是目前正在运行的各项服务：

| 服务 | 技术 | 端口 | 角色 |
|------|------|------|------|
| Pixieglow | TypeScript (Bun) | -- | Matrix 适配器 |
| Jade | TypeScript (esbuild) | -- | Discord 适配器 |
| Emerald | TypeScript (Bun) | 3126 (WebSocket) | 大脑 / 决策 |
| Sapphire | Python (FastAPI) | 3123 (HTTP) | 分类器 + 情感 |
| Krystal small | llama.cpp (PM2) | 3124 | 小模型 (1.5B, 无聊) |
| Krystal large | llama.cpp (PM2) | 3125 | 大模型 (3B+, 有趣) |

服务之间的依赖关系是单向的：适配器依赖 Emerald，Emerald 依赖 Sapphire，Sapphire 依赖 Krystal。没有循环依赖。每个服务都可以独立重启。

---

## 结语

把 Luna Protocol 拆分成四个层，不仅仅是一次架构上的练习。它是对一系列具体局限的回应：无法支持 Matrix、缺乏情感感知能力、缺少智能的消息优先级排序。

如今，这个系统变得更加健壮（LLM 崩溃不会导致整个机器人挂掉）、更加可扩展（一个 Telegram 或 WhatsApp 适配器只需遵循同样的 WebSocket 协议即可接入），也变得更加"有生命力"：机器人会根据对话感知到的情感状态，调整自己的行为、语气，甚至是 LLM 的参数。

嵌入质心是让这一切得以实现、同时又不带来过度复杂性的关键要素：没有训练好的神经网络，没有带标签的数据流水线，只有向量平均值和余弦相似度。这是一种简单、效果惊人、却又被严重低估的技术。

| 资源 | 链接 |
|------|------|
| 项目网站 | [protocol-luna.github.io](https://protocol-luna.github.io/) |
| Pixieglow | [protocol-luna/pixieglow](https://github.com/protocol-luna/pixieglow) |
| Emerald | [protocol-luna/emerald](https://github.com/protocol-luna/emerald) |
| Sapphire | [protocol-luna/sapphire](https://github.com/protocol-luna/sapphire) |
| Krystal | [protocol-luna/krystal](https://github.com/protocol-luna/krystal) |
| 文章一：Discord 机器人 | [Luna Protocol：我打造了一个自主的 Discord 机器人](/articles/zh/luna-protocol-discord-bot) |
| 文章二：微调过程 | [Luna Protocol：为什么我要微调一个 1.5B 模型](/articles/zh/luna-protocol-official-models) |