---
title: "Luna Protocol: Why I Fine-Tuned a 1.5 Billion Parameter Model on 50k Discord Samples, and Why Few-Shot Priming Changed Everything"
description: "A smaller model trained on less data can outperform a bigger model -- if you know how to prime it. Why Luna Protocol moved from a Hermes 3B to a Qwen 1.5B fine-tune, and why few-shot priming became the real progress driver."
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
author_sig: "ctz/c0xnXYXaT2BcZazCiRFKf3AC8+ZYqwpgjdF5VIEkQo9PB/JQdBKAhw9mXy2Z5G/sQkAT8YrAXUs+ueSZIg=="
---

# Luna Protocol: why I fine-tuned a 1.5 billion parameter model on 50k Discord samples, and why few-shot priming changed everything

In the [first article](/articles/en/luna-protocol-discord-bot), I built a Discord bot that simulates a human being: sleep, typos, hesitations, forgetfulness, spontaneous messages. The behavioral system held up. The LLM behind it all was a 3 billion parameter Hermes model, quantized in Q8_0, consuming 3 GB of VRAM.

It worked. But it was oversized.

A Discord bot doesn't need a 3 billion parameter model to say "nm just chillin, u". What it needs is **stylistic consistency**: the ability to keep a precise conversational tone, message after message, without drifting into "corporate assistant" mode. And it turns out a smaller model, trained on less data and primed with a few examples, does that better than a bigger model forced through a plain system prompt.

This article covers Luna Protocol's official models: why they exist, why 1.5B instead of 3B, why 50k training samples instead of 7.3M, and why few-shot priming went from "nice bonus" to the heart of the whole approach.

---

## The problem with the 3B model

The original setup used `Discord-Micae-Hermes-3-3B.Q8_0.gguf`, a 3 billion parameter model fine-tuned on Discord data. It produced good replies, but:

| Metric | Hermes-3-3B Q8_0 | Goal |
|--------|-------------------|--------|
| VRAM usage | ~3 GB | < 1 GB |
| Token generation | ~30 tok/s | ~60+ tok/s |
| Model file size | ~3.2 GB | < 1 GB |
| Cold start time | ~8s | ~3s |

For a bot running 24/7 on a modest server, 3 GB of VRAM is a lot. And generation speed, fine for occasional messages, felt sluggish during burst replies or with several active channels.

The question was: can you get the same Discord-Dialogues style with half the parameters?

---

## The fine-tuning decision: why 50k, not 7.3M

The [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) dataset holds **7.3M exchanges** and **17M turns**. It's a massive corpus of real Discord conversations. The obvious approach would have been training on the whole dataset.

I did the opposite. I trained on **50,000 samples**, under 1% of the available data.

Here's why: **training set size directly affects how overfitted the model gets to its training distribution**.

A model trained on 7.3M examples learns a very specific statistical distribution of conversations. It gets excellent at reproducing that distribution, but it also becomes **rigid**: it has less room to adapt to new patterns provided at inference time.

A model trained on 50k examples learns the general tone and register of Discord conversations (informal, short, abbreviations, lowercase), but keeps enough flexibility to be **steered by in-context examples**. Few-shot examples don't fight a massive already-learned distribution: they complete a lighter one.

That's the core intuition: **limited training data makes few-shot priming more effective**.

---

## The model: technical details

The Luna Protocol model is a **QLoRA fine-tune** of [Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct):

| Parameter | Value |
|-----------|-------|
| Base model | `unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit` |
| Method | QLoRA (4-bit) |
| LoRA rank | `r=16`, `lora_alpha=16` |
| Targeted modules | `q/k/v/o_proj`, `gate/up/down_proj` |
| Trainable params | 18 464 768 / 1 562 179 072 (1.18%) |
| Training data | ~50,000 samples (Discord-Dialogues subset) |
| Filter | 8-512 tokens per sample |
| Epochs | 2-3 |
| Hardware | Kaggle T4 |
| Framework | [Unsloth](https://github.com/unslothai/unsloth) |

The dataset is a preprocessed fork of Discord-Dialogues, filtered to keep only clean `user`/`assistant` turns: only user and assistant exchanges, no system messages, no metadata, no bot commands. That matters for what follows.

### Available quantizations

| File | Quantization | Size | Notes |
|------|-------------|------|-------|
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q2_K.gguf` | Q2_K | 676 MB | Clearly degraded -- not recommended |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf` | Q4_K_M | 986 MB | Good size/quality tradeoff (recommended) |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q8_0.gguf` | Q8_0 | 1.65 GB | Best stylistic fidelity |

The recommended model is **Q4_K_M**: under 1 GB, fast, and it preserves conversational style well. Q2_K degrades too much for a model that size. Q8_0 gives the best quality but consumes 68% more memory.

---

## The few-shot priming breakthrough

Here's the part that changed everything.

The model's HuggingFace card carries a warning:

> With a bare prompt and no priming, this model tends to fall back into Qwen's default "assistant" tone. A short few-shot priming makes a big difference.

That's a direct consequence of how the training data was structured.

### Why system prompts alone don't work

The Discord-Dialogues training data only contains `user`/`assistant` turns. There is **no system-role example** in the training set. The model was never trained to follow system prompts as style directives.

When you give it a system prompt like "Your name is Luna, talk casually", it hears the instruction but has no solid learned pattern to translate it into output. So it falls back to Qwen's default behavior: helpful, structured, slightly formal.

### Why few-shot examples work

When you inject conversation examples in the same ChatML format used at training (with the `user`/`assistant` turn structure), something clicks. The model recognizes the pattern from its training and aligns its output accordingly.

Here's what few-shot priming looks like in practice:

```yaml
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

Those examples are injected after the system prompt and before the real conversation. The model perceives them as part of the conversation history, so as a real exchange rather than as instructions. That's an essential distinction: you *show* it what the casual tone looks like instead of *ordering* it.

### Before / after

No few-shot priming (bare system prompt):

```
User: yo whats good
Bot: Hello! I am doing well, thank you for asking. How can I assist you today?
```

With few-shot priming (3 examples):

```
User: yo whats good
Bot: nm just chillin, u
```

The difference is stark. The model adopts the whole register: lowercase, abbreviations, casual tone, short replies. It mirrors the examples' style rather than Qwen's training data.

---

## Memory and speed: the concrete numbers

Moving from Hermes-3-3B to Luna-Protocol-1.5B brings measurable gains:

| Metric | Hermes-3-3B Q8_0 | Luna-Protocol Q4_K_M | Improvement |
|--------|-------------------|----------------------|-------------|
| VRAM usage | ~3 GB | ~986 MB | **67% less** |
| Model file size | ~3.2 GB | ~986 MB | **69% smaller** |
| Token generation | ~30 tok/s | ~60+ tok/s | **2x faster** |
| Cold start | ~8s | ~3s | **62% faster** |
| Context window | 8192 | 8192 | Identical |

### Why the speed gain is real

Smaller models are fundamentally faster at inference. With 1.5B parameters instead of 3B:

- **Fewer matrix multiplications** per token: attention layers, FFN layers, and the output projection all scale linearly with parameter count
- **Better cache usage**: the smaller model fits more of its weights in L2/L3 cache
- **Less memory bandwidth pressure**: fewer bytes to read from VRAM per token

On a modest CPU-only setup (2 cores, no GPU), the 1.5B model generates tokens at about **2x the speed** of the 3B model. That's the difference between "smells like a bot" and "feels like a real person typing".

### Prompt cache amplifies the advantage

Luna Protocol uses `llama-server` with prompt cache enabled (`--cache-reuse 256`). That means:

1. The first message of a session pays the full prompt-processing cost (system prompt + few-shot examples + user message)
2. Later messages only process the *new* tokens, since the cached prefix is reused
3. With 5 few-shot examples (~50-150 tokens), the overhead becomes negligible after the first request

Few-shot examples become effectively "free" after a session's first message. The model gets style guidance at near-zero marginal cost.

---

## The implementation: how it works in code

Luna Protocol's few-shot system is clean and minimal. Three files handle everything.

### 1. Configuration (`config.yml`)

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

Configuration is hot-reloadable. You edit the examples, save, and the bot immediately adopts the new style, no restart.

### 2. Formatting and injection (`src/core/few-shot.ts`)

The `formatFewShotExamples()` function converts YAML examples into ChatML message objects:

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

The `injectFewShotIntoConversation()` function places them right after the system prompt:

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

### 3. Integration (`src/core/llm-client.ts`)

Before each LLM call, few-shot examples are injected if enabled:

```typescript
let finalMessages = messages;
if (FEW_SHOT_ENABLED && FEW_SHOT_EXAMPLES.length > 0) {
  const fewShotMessages = formatFewShotExamples(FEW_SHOT_EXAMPLES);
  finalMessages = injectFewShotIntoConversation(messages, fewShotMessages);
}
```

The model receives: `[system_prompt] + [few_shot_examples] + [conversation_history]`

---

## Keeping the Discord-Dialogues style

The original Discord-Dialogues dataset has a very specific conversational signature:

- **Short messages**: 32.8 tokens average per turn
- **Informal register**: abbreviations, lowercase, no punctuation
- **Fast exchanges**: several short exchanges rather than long monologues
- **Natural imperfections**: typos, "lol", "fr", "ngl", "tbh"

The Luna Protocol model preserves that style through two mechanisms:

### 1. Fine-tuning shifts the base distribution

The 50k training samples teach the model the **statistical fingerprint** of Discord conversations. It learns replies are typically short, lowercase, and informal. That moves the model's default output away from Qwen's "helpful assistant" mode.

### 2. Few-shot priming locks the result

Few-shot examples reinforce exactly the patterns learned during fine-tuning. They act as a **stylistic anchor**: even if the model slightly drifts toward a more formal tone over a long conversation, the examples in context pull it back.

The combination beats each mechanism on its own:
- Fine-tuning without few-shot: the model is *globally* casual but inconsistent
- Few-shot without fine-tuning: the model tries to follow examples but keeps falling back into assistant mode
- Fine-tuning + few-shot: the model stays **consistently** in character

---

## The philosophy: smaller model, smarter prompting

Conventional wisdom in LLM deployment says "bigger is better". More parameters, more training data, more VRAM. Luna Protocol takes the opposite path:

- **1.5B instead of 3B**: half the parameters, half the memory, twice as fast
- **50k samples instead of 7.3M**: less training data, more flexibility for in-context learning
- **Few-shot priming instead of system prompts**: showing the model what you want, not just telling it

That's a deliberate design choice, far more than a technical optimization. A Discord bot needs to stay a lightweight conversational companion, not a generalist assistant. It must say "nm just chillin, u" consistently, fast, and without eating the server's whole VRAM budget.

Result: a bot running on a $5/month VPS, generating tokens fast enough to feel like real-time typing, and keeping a coherent personality through a fine-tuning + few-shot priming combo worth more than the sum of its parts.

---

## Setup

### Download the model

```bash
npm run download-model
# Downloads Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf
```

Or manually from [HuggingFace](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues).

### Configure

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

### Launch

```bash
npm run dev                    # dev (hot reload)
npm run build && npm start     # production
./start.sh                     # PM2 (production with llama-server)
```

---

## Conclusion

The Luna Protocol models prove that for style-driven conversational AI, **less is more**. A 1.5B model trained on 50k carefully picked samples, primed with a few examples, outperforms a 3B model trained on millions of examples, for a fraction of the memory cost and twice the generation speed.

Few-shot priming is the core mechanism for small models. It's what makes them viable for real-time conversational apps. Examples do way more than "help": they fundamentally change the model's behavior, mirroring exactly the format it trained on.

The code is open source, the model is on HuggingFace, and the dataset is public. If you want to build a conversational bot that feels human, the recipe is: small model, limited fine-tuning, solid few-shot priming.

| Resource | Link |
|----------|------|
| GitHub repo | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Model (HuggingFace) | [fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| First article | [Luna Protocol: I built an autonomous Discord bot](/articles/en/luna-protocol-discord-bot) |
