---
title: Luna Protocol：为什么我在 5 万 Discord 样本上微调 15 亿参数模型，以及 few-shot 启动为什么改变一切
description: 小模型少数据能赢大模型，前提是启动方式对。Luna Protocol 为什么从 Hermes 3B 换到 Qwen 1.5B 微调，few-shot 启动怎么从“加分项”变成核心。
date: 2026-07-17
authors:
  - fox3000foxy
tags:
  - discord
  - llm
  - fine-tuning
  - few-shot-learning
  - qwen
  - unsloth
  - open-source
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "nHBT0iqELTjIMQpd9kKK5I3Crcyq7klAihliyY2DWLIoEApuu+3kBs7QDaCGTFIu9HnyB5aSs6MCeqewNaBO3Q=="
---

# Luna Protocol：为什么我在 5 万 Discord 样本上微调 15 亿参数模型，以及 few-shot 启动为什么改变一切

[第一篇](/articles/en/luna-protocol-discord-bot)里我做了装人类的 Discord 机器人：睡觉、typo、犹豫、忘事、自发消息。行为系统立住了。后面的 LLM 是 30 亿 Hermes 模型，Q8_0 量化，吃 3G 显存。

能跑。但超配了。

Discord 机器人说"nm just chillin, u"用不着 30 亿参数。它要的是**风格一致性**：一句话接一句话守住 casual 语气，不滑回"企业助理"腔。而小模型少数据加几个示例，守这事比大模型硬靠系统提示词强。

这篇讲 Luna Protocol 官方模型：为什么存在，为什么 1.5B 不 3B，为什么 5 万训练样本不 730 万，few-shot 启动怎么从" bonus"变成全套打法的核心。

---

## 3B 模型的问题

原来配置用 `Discord-Micae-Hermes-3-3B.Q8_0.gguf`，30 亿参数 Discord 微调模型。回复质量好，但：

| 指标 | Hermes-3-3B Q8_0 | 目标 |
|--------|-------------------|--------|
| 显存占用 | 约 3G | < 1G |
| token 生成 | 约 30 tok/s | 约 60+ tok/s |
| 模型文件 | 约 3.2G | < 1G |
| 冷启动 | 约 8 秒 | 约 3 秒 |

24/7 跑在小服务器的机器人，3G 显存很多。生成速度偶发消息还行，连发或多频道齐飞就肉。

问题：同样 Discord-Dialogues 味，能不能一半参数拿下？

---

## 微调决策：为什么 5 万，不 730 万

[Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) 数据集有 **730 万对话**、**1700 万轮**。巨型真 Discord 对话库。直觉做法是全量训。

我反着来。训 **5 万样本**，不到数据的 1%。

为什么：**训练集大小直接决定模型对训练分布的过拟合程度**。

730 万样本训出的模型学到很尖的对话统计分布。复现这个分布无敌，但也**僵**：推理时给新模式，腾挪空间小。

5 万样本训出的模型学到 Discord 语气的大致样子（随意、短、缩写、小写），但留着被上下文示例**带**的余地。few-shot 示例不用和海量学死的分布打架：补轻分布刚刚好。

核心直觉：**训练数据有限，few-shot 启动更有效**。

---

## 模型：技术细节

Luna Protocol 模型是 [Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct) 的 **QLoRA** 微调：

| 参数 | 值 |
|-----------|-------|
| 基座 | `unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit` |
| 方法 | QLoRA（4-bit） |
| LoRA 秩 | `r=16`，`lora_alpha=16` |
| 目标模块 | `q/k/v/o_proj`、`gate/up/down_proj` |
| 可训参数 | 18 464 768 / 1 562 179 072（1.18%） |
| 训练数据 | 约 5 万样本（Discord-Dialogues 子集） |
| 过滤 | 每样本 8-512 token |
| Epoch | 2-3 |
| 硬件 | Kaggle T4 |
| 框架 | [Unsloth](https://github.com/unslothai/unsloth) |

数据集是预处理的 Discord-Dialogues fork，只留干净 `user`/`assistant` 轮：只要用户和助手轮，不要系统消息、元数据、机器人命令。这点后面关键。

### 量化版本

| 文件 | 量化 | 大小 | 备注 |
|------|-------------|------|-------|
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q2_K.gguf` | Q2_K | 676M | 掉点明显，不推荐 |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf` | Q4_K_M | 986M | 大小质量平衡（推荐） |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q8_0.gguf` | Q8_0 | 1.65G | 风格保真最好 |

推荐 **Q4_K_M**：不到 1G，快，聊天味保得好。Q2_K 这尺寸掉太多。Q8_0 质量最好但多 68% 内存。

---

## few-shot 启动的突破

下面是改命的部分。

HuggingFace 模型卡上有句警告：

> 光秃系统提示词不加启动，这模型爱滑回 Qwen 默认"助理"腔。短 few-shot 启动效果差很大。

直接原因是训练数据的结构。

### 为什么纯系统提示词不行

Discord-Dialogues 训练数据只有 `user`/`assistant` 轮。**训练集里没有任何 system role 示例**。模型从没学过把系统提示词当风格指令跟。

给它"你叫 Luna，随意点"这类系统提示词，它听懂指令，但没有学实的映射转成输出。于是滑回 Qwen 默认：热心、结构化、偏正式。

### 为什么 few-shot 示例行

把同训练 ChatML 格式的对话示例注进去，开关触发。模型认出训练里的模式，对齐输出。

实际 few-shot 启动长这样：

```yaml
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

示例注在系统提示词后、真对话前。模型当它们是历史对话的一部分，真聊过，而不是指令。区别关键：给它*看*随意长什么样，不*命令*它随意。

### 前后对比

无 few-shot 启动（光秃系统提示词）：

```
User: yo whats good
Bot: Hello! I am doing well, thank you for asking. How can I assist you today?
```

加 few-shot 启动（3 例）：

```
User: yo whats good
Bot: nm just chillin, u
```

差天差地。整套 register 跟过去：小写、缩写、随意、短。它抄示例风格，不抄 Qwen 训练的风格。

---

## 内存和速度：具体数字

Hermes-3-3B 换 Luna-Protocol-1.5B，实测收益：

| 指标 | Hermes-3-3B Q8_0 | Luna-Protocol Q4_K_M | 提升 |
|--------|-------------------|----------------------|-------------|
| 显存占用 | 约 3G | 约 986M | **少 67%** |
| 模型文件 | 约 3.2G | 约 986M | **小 69%** |
| token 生成 | 约 30 tok/s | 约 60+ tok/s | **快 2 倍** |
| 冷启动 | 约 8 秒 | 约 3 秒 | **快 62%** |
| 上下文窗 | 8192 | 8192 | 一样 |

### 速度收益是真的

小模型推理本质上快。15 亿对 30 亿：

- 每 token **矩阵乘法少**：注意力层、FFN 层、输出投影全随参数线性走
- **缓存更友好**：小模型更多权重塞进 L2/L3
- **显存带宽压力小**：每 token 从显存放的字节少

丐版配置纯 CPU（2 核无 GPU），1.5B 生成速度约 3B **2 倍**。"像机器人"和"像真人在敲字"的区别。

### prompt 缓存放大优势

Luna Protocol 用 `llama-server` 开 prompt 缓存（`--cache-reuse 256`）。效果：

1. session 首条消息付全 prompt 处理（系统提示词加 few-shot 示例加用户消息）
2. 后面消息只处理*新* token，缓存前缀复用
3. 5 个 few-shot 示例（约 50-150 token）首条之后开销忽略

few-shot 示例实际首条消息之后"免费"。风格引导边际成本零。

---

## 实现：代码怎么跑

Luna Protocol 的 few-shot 系统干净极简。三个文件管全部。

### 1. 配置（`config.yml`）

```yaml
few_shot_enabled: true
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
  - user: "whats up"
    assistant: "yooo not much, what about you"
  - user: "how was your day"
    assistant: "it was alright, nothing crazy happened lol"
```

配置热重载。改示例，保存，机器人立刻换风格，不重启。

### 2. 格式化和注入（`src/core/few-shot.ts`）

`formatFewShotExamples()` 把 YAML 示例转 ChatML 消息：

```typescript
export function formatFewShotExamples(
  examples: FewShotExample[],
  username = "user"
): Array<{ role: "user" | "assistant"; content: string }> {
  const messages = [];
  for (const example of examples) {
    messages.push({ role: "user", content: `${username}: ${example.user}` });
    messages.push({ role: "assistant", content: example.assistant });
  }
  return messages;
}
```

`injectFewShotIntoConversation()` 插到系统提示词后面：

```typescript
export function injectFewShotIntoConversation(
  messages: Message[],
  fewShotMessages: Message[]
): Message[] {
  const systemMessage = messages[0];
  const userMessages = messages.slice(1);
  return [systemMessage, ...fewShotMessages, ...userMessages];
}
```

### 3. 接入（`src/core/llm-client.ts`）

每次调 LLM 前开着就注入 few-shot 示例：

```typescript
let finalMessages = messages;
if (FEW_SHOT_ENABLED && FEW_SHOT_EXAMPLES.length > 0) {
  const fewShotMessages = formatFewShotExamples(FEW_SHOT_EXAMPLES);
  finalMessages = injectFewShotIntoConversation(messages, fewShotMessages);
}
```

模型收到：`[系统提示词] + [few-shot 示例] + [对话历史]`

---

## 守住 Discord-Dialogues 味

Discord-Dialogues 原数据集对话签名很鲜明：

- **消息短**：平均每轮 32.8 token
- **随意 register**：缩写、小写、不加标点
- **快节奏**：多短轮，不长独白
- **自然瑕疵**：typo、"lol"、"fr"、"ngl"、"tbh"

Luna Protocol 模型靠两机制守住风格：

### 1. 微调挪基准分布

5 万训练样本教模型 Discord 对话的**统计指纹**。它学到回复一般短、小写、随意。模型默认输出离 Qwen"热心助理"模式远了。

### 2. few-shot 启动锁死

few-shot 示例强化训练学过的模式。起**风格锚**作用：长对话里模型往正式滑，上下文里的示例把它拽回来。

组合比单用强：
- 只微调不 few-shot：整体随意但不稳
- 只 few-shot 不微调：跟着示例走但老滑回助理模式
- 微调加 few-shot：**一直**在人物里

---

## 哲学：小模型，加聪明的启动

LLM 部署的传统智慧说"越大越好"。更多参数，更多训练数据，更多显存。Luna Protocol 反着走：

- **1.5B 不 3B**：一半参数，一半内存，两倍速度
- **5 万样本不 730 万**：训练数据少，上下文学习余地大
- **few-shot 启动不系统提示词**：给模型看要什么，不只告诉它

这是深思熟虑的设计选择，不只是技术优化。Discord 机器人要的是轻量聊天伙伴，不是通用助理。它要稳定快速说"nm just chillin, u"，不吃光服务器显存预算。

结果：5 美元/月 VPS 跑的机器人，token 生成快到像实时敲字，微调加 few-shot 组合守住一致人格，1 加 1 大于 2。

---

## 部署

### 下模型

```bash
npm run download-model
# 下 Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf
```

或手动从 [HuggingFace](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) 拿。

### 配置

```yaml
# config.yml
llama_model_path: "./models/Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf"
few_shot_enabled: true
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

### 跑

```bash
npm run dev                    # 开发（热重载）
npm run build && npm start     # 生产
./start.sh                     # PM2（生产加 llama-server）
```

---

## 结语

Luna Protocol 模型证明，风格向对话 AI **少即是多**。15 亿模型 5 万精挑样本训，加几个示例启动，赢 30 亿几百万样本训的，内存零头，生成快一倍。

few-shot 启动是小模型的核心机制。没有它小模型做不了实时对话。示例不只是"有帮助"：它们根本改变模型行为，按训练格式原样对齐。

代码开源，模型在 HuggingFace，数据集公开。想做装人类的聊天机器人，配方是：小模型、有限微调、扎实 few-shot 启动。
