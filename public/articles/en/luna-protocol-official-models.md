---
title: "Luna Protocol: Why I fine-tuned a 1.5B model on 50k Discord samples and made few-shot priming the secret weapon"
description: "A smaller model trained on less data can outperform a bigger one -- if you know how to prime it. Here is why Luna Protocol switched from a 3B Hermes to a 1.5B Qwen fine-tune, and why few-shot priming became the real game-changer."
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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "z79zSyS0ox+Op3OeFQtaaW46lIkHZqlF2HEnCWRx4vv4W59dcjeHhc7/dnyU4Wj2neiB+2jWXty7N2Lw5fJmlg=="
---

# Luna Protocol: Why I fine-tuned a 1.5B model on 50k Discord samples and made few-shot priming the secret weapon

In the [first article](/articles/en/luna-protocol-discord-bot), I built a Discord bot that simulates a human being -- sleep, typos, hesitations, forgetfulness, spontaneous messages. The behavioral system was solid. The LLM behind it was a 3B Hermes model, quantized to Q8_0, eating 3GB of VRAM.

It worked. But it was overkill.

A Discord bot does not need a 3B parameter model to say "nm just chillin, u". What it needs is **style consistency** -- the ability to match a specific conversational tone, message after message, without drifting into corporate assistant mode. And it turns out, a smaller model trained on less data, primed with a few examples, does that better than a bigger model brute-forcing its way through a system prompt.

This article is about the official Luna Protocol models: why they exist, why they are 1.5B instead of 3B, why 50k training samples instead of 7.3M, and why few-shot priming went from a nice-to-have to the core of the whole approach.

---

## The problem with the 3B model

The original setup used `Discord-Micae-Hermes-3-3B.Q8_0.gguf` -- a 3B parameter model fine-tuned on Discord data. It produced good responses, but:

| Metric | Hermes-3-3B Q8_0 | Target |
|--------|-------------------|--------|
| VRAM usage | ~3 GB | < 1 GB |
| Token generation | ~30 tok/s | ~60+ tok/s |
| Model file size | ~3.2 GB | < 1 GB |
| Cold start time | ~8s | ~3s |

For a bot running 24/7 on a modest server, 3GB of VRAM is a lot. And the generation speed -- while fine for occasional messages -- felt sluggish during burst responses or when multiple channels were active.

The question was: can we get the same Discord-Dialogues style with half the parameters?

---

## The fine-tuning decision: why 50k, not 7.3M

The [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) dataset contains **7.3M exchanges** and **17M turns**. It is a massive corpus of real Discord conversations. The obvious approach would be to train on the full dataset.

I did the opposite. I trained on **50,000 samples** -- less than 1% of the available data.

Here is why: **the size of the training set directly affects how much the model overfits to its training distribution**.

A model trained on 7.3M examples learns a very specific statistical distribution of conversations. It becomes excellent at reproducing that distribution, but it also becomes **rigid** -- it has less flexibility to adapt to new patterns provided at inference time.

A model trained on 50k examples learns the general tone and register of Discord conversations (informal, short-form, abbreviations, lowercase), but it retains enough flexibility to be **steered by in-context examples**. The few-shot examples do not fight against a massive learned distribution -- they complement a lighter one.

This is the core insight: **limited training data makes few-shot priming more efficient**.

---

## The model: technical details

The Luna Protocol model is a **QLoRA fine-tune** of [Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct):

| Parameter | Value |
|-----------|-------|
| Base model | `unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit` |
| Method | QLoRA (4-bit) |
| LoRA rank | `r=16`, `lora_alpha=16` |
| Target modules | `q/k/v/o_proj`, `gate/up/down_proj` |
| Trainable params | 18,464,768 / 1,562,179,072 (1.18%) |
| Training data | ~50,000 examples (Discord-Dialogues subset) |
| Filter | 8-512 tokens per sample |
| Epochs | 2-3 |
| Hardware | Kaggle T4 |
| Framework | [Unsloth](https://github.com/unslothai/unsloth) |

The dataset is a preprocessed fork of Discord-Dialogues, filtered to contain only clean `user`/`assistant` turns -- no system messages, no metadata, no bot commands. This is important for later.

### Available quantizations

| File | Quantization | Size | Notes |
|------|-------------|------|-------|
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q2_K.gguf` | Q2_K | 676 MB | Noticeably degraded -- not recommended |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf` | Q4_K_M | 986 MB | Good size/quality balance (recommended) |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q8_0.gguf` | Q8_0 | 1.65 GB | Best style fidelity |

The recommended model is **Q4_K_M** -- under 1GB, fast, and preserves the conversational style well. Q2_K degrades too much on a model this small. Q8_0 is the best quality but uses 68% more memory.

---

## The few-shot priming breakthrough

Here is the part that changed everything.

The HuggingFace model card has a warning:

> With a bare prompt and no priming, this model tends to fall back on Qwen's default assistant tone. A short few-shot prime makes a large difference.

This is not a bug -- it is a direct consequence of how the training data was structured.

### Why system prompts alone do not work

The Discord-Dialogues training data contains only `user`/`assistant` turns. There are **no system-role examples** in the training set. The model was never trained to follow system prompts as style directives.

When you give it a system prompt like "Your name is Luna, talk casually", it hears the instruction but does not have a strong learned pattern for how to translate that into output. It falls back to Qwen's default: helpful, structured, slightly formal.

### Why few-shot examples work

When you inject example conversations in the same ChatML format the model was trained on (using the `user`/`assistant` turn structure), something clicks. The model recognizes the pattern from its training data and aligns its output to match.

Here is what a few-shot prime looks like in practice:

```yaml
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

These examples are injected after the system prompt and before the real conversation. The model sees them as part of the conversation history, not as instructions. This is a critical distinction -- it is not being *told* to be casual, it is being *shown* what casual looks like.

### Before and after

Without few-shot priming (bare system prompt):

```
User: yo whats good
Bot: Hello! I am doing well, thank you for asking. How can I assist you today?
```

With few-shot priming (3 examples):

```
User: yo whats good
Bot: nm just chillin, u
```

The difference is stark. The model does not just produce different words -- it adopts the entire register: lowercase, abbreviations, casual tone, short responses. It matches the style of the examples, not the style of Qwen's training data.

---

## Memory and speed: the concrete numbers

The switch from Hermes-3-3B to Luna-Protocol-1.5B delivers measurable gains:

| Metric | Hermes-3-3B Q8_0 | Luna-Protocol Q4_K_M | Improvement |
|--------|-------------------|----------------------|-------------|
| VRAM usage | ~3 GB | ~986 MB | **67% less** |
| Model file size | ~3.2 GB | ~986 MB | **69% smaller** |
| Token generation | ~30 tok/s | ~60+ tok/s | **2x faster** |
| Cold start | ~8s | ~3s | **62% faster** |
| Context window | 8192 | 8192 | Same |

### Why the speed gain is real

Smaller models are not just "less slow" -- they are fundamentally faster for inference. With 1.5B parameters instead of 3B:

- **Fewer matrix multiplications** per token: the attention layers, FFN layers, and output projection all scale linearly with parameter count
- **Better cache utilization**: the smaller model fits more of its weights in L2/L3 cache
- **Lower memory bandwidth pressure**: fewer bytes to read from VRAM per token

On a modest CPU-only setup (2 cores, no GPU), the 1.5B model generates tokens at roughly **2x the speed** of the 3B model. This is the difference between "feels like a bot" and "feels like a person typing".

### Prompt caching amplifies the advantage

Luna Protocol uses `llama-server` with prompt caching enabled (`--cache-reuse 256`). This means:

1. The first message in a session pays the full prompt processing cost (system prompt + few-shot examples + user message)
2. Subsequent messages only process the *new* tokens -- the cached prefix is reused
3. With 5 few-shot examples (~50-150 tokens), the overhead is negligible after the first request

The few-shot examples are effectively "free" after the first message in a session. The model gets style guidance at zero marginal cost.

---

## The implementation: how it works in code

The few-shot system in Luna Protocol is clean and minimal. Three files handle everything:

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

Config is hot-reloadable. Change the examples, save, and the bot picks up the new style immediately -- no restart needed.

### 2. Formatting and injection (`src/core/few-shot.ts`)

The `formatFewShotExamples()` function converts the YAML examples into ChatML message objects:

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

Before every LLM call, the few-shot examples are injected if enabled:

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

- **Short messages**: average 32.8 tokens per turn
- **Informal register**: abbreviations, lowercase, no punctuation
- **Rapid back-and-forth**: multiple short exchanges rather than long monologues
- **Natural imperfections**: typos, "lol", "fr", "ngl", "tbh"

The Luna-Protocol model preserves this style through two mechanisms:

### 1. Fine-tuning shifts the base distribution

The 50k training samples teach the model the *statistical fingerprint* of Discord conversations. It learns that responses are typically short, lowercase, and informal. This shifts the model's default output away from Qwen's helpful-assistant mode.

### 2. Few-shot priming locks it in

The few-shot examples reinforce the exact patterns the model learned during fine-tuning. They act as a **style anchor** -- even if the model drifts slightly toward formal tone during a long conversation, the examples in context keep pulling it back.

The combination is more powerful than either mechanism alone:
- Fine-tuning without few-shot: the model is *generally* casual but inconsistent
- Few-shot without fine-tuning: the model tries to follow examples but keeps reverting to assistant mode
- Fine-tuning + few-shot: the model is **consistently** in character

---

## The philosophy: smaller model, smarter prompting

The conventional wisdom in LLM deployment is "bigger is better". More parameters, more training data, more VRAM. Luna Protocol takes the opposite approach:

- **1.5B instead of 3B**: half the parameters, half the memory, twice the speed
- **50k samples instead of 7.3M**: less training data, more flexibility for in-context learning
- **Few-shot priming instead of system prompts**: show the model what you want, do not just tell it

This is not just a technical optimization -- it is a design philosophy. A Discord bot does not need to be a general-purpose assistant. It needs to say "nm just chillin, u" consistently, quickly, and without eating your server's entire VRAM budget.

The result: a bot that runs on a $5/month VPS, generates tokens fast enough to feel like real-time typing, and maintains a consistent personality through a combination of fine-tuning and few-shot priming that is greater than the sum of its parts.

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

### Run

```bash
npm run dev                    # dev (hot reload)
npm run build && npm start     # production
./start.sh                     # PM2 (production with llama-server)
```

---

## Conclusion

The Luna Protocol models prove that for style-specific conversational AI, **less is more**. A 1.5B model trained on 50k carefully chosen samples, primed with a few examples, outperforms a 3B model trained on millions of examples -- at a fraction of the memory cost and twice the generation speed.

Few-shot priming is not just a nice-to-have for small models. It is the mechanism that makes them viable for real-time conversational applications. The examples do not just "help" -- they fundamentally change how the model behaves, by matching the exact format it was trained on.

The code is open source, the model is on HuggingFace, and the dataset is public. If you want to build a conversational bot that feels human, the recipe is: small model, limited fine-tuning, strong few-shot priming.

| Resource | Link |
|----------|------|
| GitHub repository | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Model (HuggingFace) | [fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| First article | [Luna Protocol: I created an autonomous Discord bot](/articles/en/luna-protocol-discord-bot) |
