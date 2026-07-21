---
title: "Luna Protocol：为什么我用5万条Discord样本微调了一个1.5B模型，让少样本提示成为秘密武器"
description: "一个在更少数据上训练的小模型可以胜过更大的模型----只要你知道如何提示它。本文讲述了Luna Protocol为何从3B Hermes转向1.5B Qwen微调模型，以及为什么少样本提示成为了真正的游戏规则改变者。"
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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "9EOsfVaVR8P4iONGephG/TIG1CKC8NNix32ud5Vq6wDcJLR9dmMOh6PfYJYWmDnuaFl5TL5Dsx/a6Uw/BSLdtg=="
---

# Luna Protocol：为什么我用5万条Discord样本微调了一个1.5B模型，让少样本提示成为秘密武器

在第一[篇文章](/articles/zh/luna-protocol-discord-bot)中，我构建了一个模拟真人的Discord机器人----包括睡眠、打字错误、犹豫、健忘和自发消息。行为系统很扎实。其背后的LLM是一个3B参数的Hermes模型，量化为Q8_0，占用3GB显存。

它能用。但杀鸡用了牛刀。

一个Discord机器人不需要3B参数的模型来说一句"nm just chillin, u"。它需要的是**风格一致性**----在每条消息中保持特定的对话语气，不偏离到企业助手模式。事实证明，一个在更少数据上训练的小模型，加上几个示例的提示，比一个靠系统提示蛮力输出的更大模型做得更好。

本文介绍Luna Protocol的官方模型：它们为什么存在，为什么是1.5B而不是3B，为什么用5万条训练样本而不是730万条，以及为什么少样本提示从锦上添花变成了整个方法的核心。

---

## 3B模型的问题

原始配置使用了`Discord-Micae-Hermes-3-3B.Q8_0.gguf`----一个在Discord数据上微调的3B参数模型。它能产生不错的回复，但是：

| 指标 | Hermes-3-3B Q8_0 | 目标 |
|--------|-------------------|--------|
| 显存占用 | ~3 GB | < 1 GB |
| Token生成速度 | ~30 tok/s | ~60+ tok/s |
| 模型文件大小 | ~3.2 GB | < 1 GB |
| 冷启动时间 | ~8s | ~3s |

对于一个在普通服务器上全天候运行的机器人来说，3GB显存太多了。而且生成速度----虽然对偶尔的消息来说还行----在突发响应或多个频道活跃时显得迟缓。

问题是：我们能否用一半的参数获得同样的Discord-Dialogues风格？

---

## 微调决策：为什么是5万条，而不是730万条

[Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues)数据集包含**730万次对话**和**1700万个轮次**。这是一个庞大的真实Discord对话语料库。显而易见的做法是在整个数据集上训练。

我反其道而行之。我只用了**5万个样本**----不到可用数据的1%。

原因如下：**训练集的大小直接影响模型对其训练分布的过拟合程度**。

在730万个示例上训练的模型学会了对话的非常具体的统计分布。它擅长复现这种分布，但也变得**僵化**----它在推理时适应新模式的能力较弱。

在5万个示例上训练的模型学会了Discord对话的总体语气和语域（非正式、简短、缩写、小写），但保留了足够的灵活性，可以通过**上下文示例来引导**。少样本示例不需要对抗庞大的已学习分布----它们只是补充了一个较轻量的分布。

这是核心洞察：**有限的训练数据使少样本提示更加高效**。

---

## 模型：技术细节

Luna Protocol模型是对[Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct)的**QLoRA微调**：

| 参数 | 值 |
|-----------|-------|
| 基础模型 | `unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit` |
| 方法 | QLoRA（4-bit） |
| LoRA秩 | `r=16`, `lora_alpha=16` |
| 目标模块 | `q/k/v/o_proj`, `gate/up/down_proj` |
| 可训练参数 | 18,464,768 / 1,562,179,072（1.18%） |
| 训练数据 | ~50,000个示例（Discord-Dialogues子集） |
| 筛选条件 | 每个样本8-512个token |
| 训练轮次 | 2-3 |
| 硬件 | Kaggle T4 |
| 框架 | [Unsloth](https://github.com/unslothai/unsloth) |

数据集是Discord-Dialogues的一个预处理分支，经过筛选只保留干净的`user`/`assistant`轮次----没有系统消息、没有元数据、没有机器人命令。这对后续很重要。

### 可用的量化版本

| 文件 | 量化方式 | 大小 | 说明 |
|------|-------------|------|-------|
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q2_K.gguf` | Q2_K | 676 MB | 明显降质----不推荐 |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf` | Q4_K_M | 986 MB | 大小/质量平衡好（推荐） |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q8_0.gguf` | Q8_0 | 1.65 GB | 最佳风格保真度 |

推荐的模型是**Q4_K_M**----不到1GB，速度快，能很好地保留对话风格。Q2_K在这种小模型上降质太严重。Q8_0质量最好但多占用68%的内存。

---

## 少样本提示的突破

这部分改变了一切。

HuggingFace模型卡片上有一条警告：

> 在没有提示的裸提示词下，该模型倾向于退回到Qwen的默认助手语气。短的少样本提示会产生巨大差异。

这不是一个bug----这是训练数据结构化的直接结果。

### 为什么单独使用系统提示没用

Discord-Dialogues训练数据只包含`user`/`assistant`轮次。训练集中**没有系统角色的示例**。模型从未被训练过将系统提示作为风格指令来遵循。

当你给它一个系统提示，比如"你的名字是Luna，随便聊聊"，它听到了指令，但没有一个强大的已学习模式来将其转化为输出。它会退回到Qwen的默认模式：乐于助人、结构化、略显正式。

### 为什么少样本示例有效

当你注入与模型训练所用的相同ChatML格式（使用`user`/`assistant`轮次结构）的对话示例时，模型会"咔嗒"一声理解。它识别出训练数据中的模式，并将输出对齐以匹配。

以下是少样本提示的实际样子：

```yaml
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

这些示例被注入到系统提示之后、真实对话之前。模型将它们视为对话历史的一部分，而不是指令。这是一个关键区别----不是*告诉*它要随意，而是*展示*随意是什么样子。

### 前后对比

没有少样本提示（裸系统提示）：

```
User: yo whats good
Bot: Hello! I am doing well, thank you for asking. How can I assist you today?
```

有少样本提示（3个示例）：

```
User: yo whats good
Bot: nm just chillin, u
```

差异巨大。模型不仅仅是产生不同的词汇----它还采用了整个语域：小写、缩写、随意语气、简短回复。它匹配了示例的风格，而不是Qwen训练数据的风格。

---

## 内存与速度：具体数字

从Hermes-3-3B切换到Luna-Protocol-1.5B带来了可衡量的提升：

| 指标 | Hermes-3-3B Q8_0 | Luna-Protocol Q4_K_M | 提升 |
|--------|-------------------|----------------------|-------------|
| 显存占用 | ~3 GB | ~986 MB | **减少67%** |
| 模型文件大小 | ~3.2 GB | ~986 MB | **缩小69%** |
| Token生成速度 | ~30 tok/s | ~60+ tok/s | **快2倍** |
| 冷启动 | ~8s | ~3s | **快62%** |
| 上下文窗口 | 8192 | 8192 | 相同 |

### 为什么速度提升是真实的

较小的模型不仅仅是"不那么慢"----它们在推理时本质上更快。使用1.5B参数而不是3B：

- **每个token的矩阵乘法更少**：注意力层、FFN层和输出投影都随参数数量线性扩展
- **更好的缓存利用**：较小的模型能将更多权重放入L2/L3缓存
- **更低的内存带宽压力**：每个token从显存读取的字节更少

在普通的纯CPU配置（2核，无GPU）上，1.5B模型的token生成速度大约是3B模型的**2倍**。这就是"感觉像机器人"和"感觉像真人在打字"之间的区别。

### 提示缓存放大了优势

Luna Protocol使用启用了提示缓存的`llama-server`（`--cache-reuse 256`）。这意味着：

1. 会话中的第一条消息支付完整的提示处理成本（系统提示 + 少样本示例 + 用户消息）
2. 后续消息只处理*新的*token----缓存的前缀被重用
3. 使用5个少样本示例（约50-150个token），第一次请求后开销可以忽略不计

在会话的第一条消息之后，少样本示例实际上就是"免费"的。模型以零边际成本获得风格指导。

---

## 实现：代码如何工作

Luna Protocol中的少样本系统简洁而精炼。三个文件处理所有逻辑：

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

配置支持热重载。修改示例，保存，机器人立即采用新风格----无需重启。

### 2. 格式化与注入（`src/core/few-shot.ts`）

`formatFewShotExamples()`函数将YAML示例转换为ChatML消息对象：

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

`injectFewShotIntoConversation()`函数将它们放置在系统提示之后：

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

### 3. 集成（`src/core/llm-client.ts`）

每次LLM调用前，如果启用则注入少样本示例：

```typescript
let finalMessages = messages;
if (FEW_SHOT_ENABLED && FEW_SHOT_EXAMPLES.length > 0) {
  const fewShotMessages = formatFewShotExamples(FEW_SHOT_EXAMPLES);
  finalMessages = injectFewShotIntoConversation(messages, fewShotMessages);
}
```

模型接收到：`[system_prompt] + [few_shot_examples] + [conversation_history]`

---

## 保持Discord-Dialogues风格

原始Discord-Dialogues数据集具有非常独特的对话特征：

- **短消息**：每轮平均32.8个token
- **非正式语域**：缩写、小写、无标点
- **快速来回**：多次简短交流而非长篇独白
- **自然的不完美**：打字错误、"lol"、"fr"、"ngl"、"tbh"

Luna-Protocol模型通过两种机制保持这种风格：

### 1. 微调改变基础分布

5万条训练样本教会了模型Discord对话的*统计特征*。它学会了回复通常是简短、小写且非正式的。这使得模型的默认输出脱离了Qwen的乐于助人的助手模式。

### 2. 少样本提示锁定风格

少样本示例强化了模型在微调期间学到的确切模式。它们起到了**风格锚点**的作用----即使模型在长时间对话中略微向正式语气偏移，上下文中的示例也会持续将其拉回。

两者的结合比任何一种机制单独使用都更强大：
- 无少样本的微调：模型*大致*随意但不一致
- 无微调的少样本：模型尝试跟随示例但不断退回到助手模式
- 微调 + 少样本：模型**始终如一**地保持角色

---

## 理念：更小的模型，更聪明的提示

LLM部署的传统智慧是"越大越好"。更多参数、更多训练数据、更多显存。Luna Protocol采取了相反的方法：

- **1.5B而不是3B**：一半的参数，一半的内存，两倍的速度
- **5万样本而不是730万**：更少的训练数据，更多的上下文学习灵活性
- **少样本提示而不是系统提示**：向模型展示你想要什么，而不只是告诉它

这不仅仅是技术优化----这是一种设计理念。Discord机器人不需要成为通用助手。它需要一致、快速地说出"nm just chillin, u"，而不会吃掉你服务器的全部显存预算。

结果：一个在5美元/月的VPS上运行的机器人，生成token的速度足以让人感觉像实时打字，并通过微调和少样本提示的结合保持一致的个性----两者的结合效果大于各自之和。

---

## 设置

### 下载模型

```bash
npm run download-model
# 下载 Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf
```

或从[HuggingFace](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues)手动下载。

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

### 运行

```bash
npm run dev                    # 开发（热重载）
npm run build && npm start     # 生产环境
./start.sh                     # PM2（生产环境，带llama-server）
```

---

## 结论

Luna Protocol模型证明了对于风格特定的对话式AI来说，**少即是多**。一个在5万个精心挑选样本上训练的1.5B模型，加上几个示例的提示，在内存成本极小和生成速度翻倍的情况下，胜过在数百万示例上训练的3B模型。

少样本提示对于小模型来说不仅仅是锦上添花。它是使它们适用于实时对话应用的关键机制。示例不仅仅是"帮助"----它们通过匹配模型训练时使用的确切格式，从根本上改变了模型的行为方式。

代码是开源的，模型在HuggingFace上，数据集也是公开的。如果你想构建一个感觉像真人的对话机器人，配方是：小模型、有限微调、强大的少样本提示。

| 资源 | 链接 |
|----------|------|
| GitHub仓库 | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| 模型（HuggingFace） | [fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) |
| 数据集 | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| 第一篇文章 | [Luna Protocol：我创建了一个自主Discord机器人](/articles/zh/luna-protocol-discord-bot) |
