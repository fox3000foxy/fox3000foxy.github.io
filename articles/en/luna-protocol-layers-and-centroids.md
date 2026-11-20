---
title: "Luna Protocol: Shared Brains, Emotion Classification, and Interesting/Futile Routing"
description: "Luna Protocol moved from a monolith to a four-layer architecture: adapters, brain, emotion classifier, and inference. Featuring embedding centroids, interesting/futile routing, and LLM parameter tuning by valence and arousal."
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
author_sig: "znnn9BDGtbsMztgpo9HEBIk5S8US7vcmiO4qKaIbfAFt7qHIpp2WfhV3tnajg9naKuaKK5/tE1pW0cgxXrqpFA=="
---

# Luna Protocol: shared brains, emotion classification, and interesting/futile routing

In the [two](/articles/en/luna-protocol-discord-bot) [previous articles](/articles/en/luna-protocol-official-models), I presented Luna Protocol as a single Discord bot with a complex behavioral system and a fine-tuned model. But the architecture has evolved a lot since. What was a monolith -- a single Node.js process handling the Discord bot, behavior, and LLM calls -- turned into **four independent layers**, each with its own responsibility, language, and lifecycle.

That split brought unexpected benefits: sharing "brains" across several platforms, an emotion classification system that dynamically tunes LLM parameters, and smart message routing between two models based on perceived conversation importance.

The evolution didn't happen at once: it followed an organic path. I first split the `server/` folder out of the bot repo, creating **Krystal** on one side and leaving **Jade** as the Discord adapter. Then I created **Pixieglow** (Matrix adapter) by reusing Jade's `llm-core` and event bus. Then came **Sapphire** to introduce GENERIC/SEMANTIC classification with DistilBERT. Results weren't conclusive, so I moved to embedding centroids, more malleable for example enrichment and more precise; classification became FUTILE/INTERESTING. I finally added **valence** and **arousal** centroids to regulate the LLM's temperature and repeat penalty. Lastly, I removed all redundant code between Jade and Pixieglow by creating **Emerald**, the shared brain, turning Jade and Pixieglow into plain socket-driven clients.

In parallel, I kept a website tracking the project's progress: [protocol-luna.github.io](https://protocol-luna.github.io/).

This article tells how and why I cut those layers, what each service does exactly, and how concepts like **centroids** (mean embedding vectors) and **resentment variables** (inspired by the 70s PARRY chatbot) turned a plain Discord bot into a surprisingly coherent multi-platform system.

---

## The problem with the monolith

Originally, Luna Protocol fit in a single Node.js process. The code handled:

- Connecting to Discord (via the Eris library)
- Trigger evaluation (mentions, keywords, follow-up...)
- Human behavior simulation (typos, hesitations, sleep...)
- HTTP calls to the local LLM server (llama.cpp)
- Session and anti-spam management
- The TTS pipeline

Everything lived in the same process, communicating through typed event buses (`TypedBus`). It worked, but with limits:

- **Impossible to add a Matrix client** without duplicating all behavior code
- **The LLM and bot were in the same repo**: the `server/` folder already existed, but evolving one without touching the other was impossible
- **Undifferentiated processing**: every message was handled the same way, whether a "lol" or an existential question
- **Emotional amnesia**: the bot "felt" nothing

Cutting into layers solved all those problems.

---

## The four layers

Luna Protocol's current architecture is organized as a four-level funnel:

```
Matrix / Discord
      |
      v
  [ADAPTERS]       Pixieglow (Matrix) / Jade (Discord)
      |
      v
  [BRAIN]          Emerald (WebSocket, port 3126)
      |
      v
  [CLASSIFIER]     Sapphire (HTTP, port 3123)
      |
      v
  [INFERENCE]      Krystal (llama.cpp, ports 3124 / 3125)
```

Each layer can be restarted, updated, or replaced independently.

---

### Layer 1: adapters (Pixieglow and Jade)

These are the simplest layers. Their only job is translating a messaging platform's events into a standardized protocol toward Emerald:

- **Jade** is the Discord adapter. It uses the Eris library to connect to Discord and forwards messages to Emerald over WebSocket. It also handles the TTS pipeline (voice synthesis via Piper, OGG conversion, Discord upload).
- **Pixieglow** is the Matrix adapter. It uses the Matrix Client-Server HTTP API directly (no SDK), with long-poll sync. No TTS.

Both adapters share the same WebSocket protocol defined in `emerald-client.ts`:

```typescript
type ClientId = "jade" | "pixieglow";

// Events (adapter -> Emerald)
type InEvent = MessageEvent | ReadyEvent | BotMessageEvent | PresenceEvent;

// Commands (Emerald -> adapter)
type OutCommand = RespondCommand | TypingCommand | SetPresenceCommand
                | SpontaneousCommand | ForgotCommand;
```

The existence of two adapters with the same interface proves the sharing: **the same "brain" (Emerald) serves a Discord bot and a Matrix bot alike**, with identical behaviors. The protocol is declarative: Emerald doesn't tell the adapter *how* to send a message, it says *what* to send (the text with a delay, possibly a burst plan, a reaction, etc.). Each adapter implements concrete execution for its platform.

That's the strength of this architecture: to add Telegram, Signal, or other support, you just write an adapter implementing the WebSocket protocol.

---

### Layer 2: the brain (Emerald)

Emerald is the central decision service. It listens on port 3126 over WebSocket and handles:

- **Trigger evaluation**: mention, DM, name, keyword, follow-up, random
- **Behavior simulation**: concentration delays, typos, hesitations, forgetfulness, burst, thematic fatigue
- **Sleep cycles**: sleep / slow / short modes
- **Session management**: cooldown, session limits, anti-spam
- **Routing to Sapphire**: sending messages, receiving streamed replies

Emerald is the central service that enabled sharing, and the one that benefited most from the split. Before, each behavior (typo, burst, hesitation) was tangled with Discord code. Now they're in dedicated modules under `behavior/`:

```
emerald/src/behavior/
  burst.ts         -- Burst message planning
  mannerisms.ts    -- Delays, hesitations, reactions, forgetfulness
  sleep.ts         -- Sleep schedule evaluation
  typo.ts          -- Typo simulation (AZERTY/QWERTY)
```

The brain doesn't know which platform it runs on. It receives a `MessageEvent` with a `clientId` ("jade" or "pixieglow"), makes a decision, and returns a command. The adapter handles the rest.

---

### Layer 3: the emotion classifier (Sapphire)

Sapphire is the most technically interesting service. It's a **LLM middleware** written in Python with FastAPI, playing four critical roles:

1. **Binary FUTILE / INTERESTING classifier** via embedding centroids
2. **Emotion scorer** (valence / arousal) via centroids
3. **Backend router** to Krystal (small model vs big model)
4. **Few-shot injector** and session manager

#### Centroids: the heart of classification

A **centroid** is a simple concept: the mean of a set of embedding vectors. Concretely, I gathered hundreds of example messages, ran them through an embedding model (`BAAI/bge-small-en-v1.5`, 384 dimensions), and averaged the resulting vectors.

There are **two classification centroids**:

- `futile_centroid`: ~683 trivial messages ("lol", "ok", "hello") via k-means (k=10, seed=42)
- `interessant_centroid`: ~678 substantial messages (technical, personal, philosophical) via k-means (k=10, seed=42)

When a message arrives:

```python
def classify(text, embedder, futile_centroids, interessant_centroids):
    emb = embedder.query_embed(text)                     # 384-D vector
    sim_f = max(cos(emb, c) for c in futile_centroids)     # max over 10
    sim_i = max(cos(emb, c) for c in interessant_centroids) # max over 10
    diff = sim_i - sim_f
    label = "INTERESSANT" if diff > 0 else "FUTILE"
    return label, abs(diff), sim_f, sim_i
```

The class score is the **maximum cosine similarity** across its 10 centroids. That captures subtypes within each category: a greeting and a goodbye both land near one of the 10 futile centroids even if far apart in embedding space. Just k-means at startup and dot products at runtime: no training, no GPU.

#### Why two models?

That classification result decides which LLM backend gets invoked:

| Label | Krystal backend | Model | Port |
|-------|----------------|-------|------|
| `FUTILE` | `generic` | Luna-Protocol-1.5B (941 MB, Q4_K_M) | 3124 |
| `INTERESSANT` | `semantic` | Hermes-3-3B or 8B (per config) | 3125 |

The intuition is simple: a "lol" or "nm just chillin u" doesn't deserve invoking an 8 billion parameter model. The small fine-tuned Luna 1.5B model, trained on 200,000 Discord samples, is plenty for light exchanges. A question about life, a confidence, or a technical debate gets routed to the big model that can produce a richer reply.

That economical routing considerably reduces load on the LLM server: about 70% of messages classify as FUTILE and get handled by the small model, freeing the big model for conversations truly worth it.

#### The emotion axis: valence and arousal

But that's not all. Sapphire uses the **same centroid mechanism** on an independent axis to evaluate the message's emotion:

There are **four emotion centroids**:

| Pole | Examples |
|------|----------|
| `positive` | "hell yeah", "love that", "this is great" |
| `negative` | "shut up", "i hate this", "this sucks" |
| `high_arousal` | "WHAT THE HELL", "omg omg omg", "AAAAA" |
| `low_arousal` | "just chilling", "meh", "i guess" |

The score computes as a similarity difference on each axis:

```python
valence = sim(emb, positive) - sim(emb, negative)     # [-1, +1]
arousal = sim(emb, high_arousal) - sim(emb, low_arousal)  # [-1, +1]
```

**Valence** measures whether the message is positive or negative. **Arousal** measures its emotional intensity. Together they form the circumplex model of affect (Russell, 1980), the same psychological model that inspired the **PARRY** chatbot in 1972.

#### Resentment variables: how emotions control the LLM

This is where the PARRY inspiration becomes tangible. PARRY (created by Kenneth Colby in 1972) was a chatbot designed to simulate a paranoid patient. It had internal variables (fear, anger, mistrust) that modified its replies. A "scared" PARRY, for example, replied more aggressively.

Sapphire does the same thing, but with continuous variables and a more elegant method: the LLM's sampling parameters adjust in real time based on the conversation's emotional state.

##### Temperature follows arousal

```python
temperature = clamp(0.7 + arousal * 0.3, 0.4, 1.0)
```

| Arousal | Temperature | Effect |
|---------|-------------|--------|
| -1.0 (calm) | 0.40 | Low creativity, predictable replies |
| 0.0 (neutral) | 0.70 | Default creativity |
| +1.0 (excited) | 1.00 | Max randomness, surprising replies |

When someone is excited or angry (high arousal), temperature rises. The model produces more varied, more creative, sometimes more chaotic replies, like a human getting "worked up". When the conversation is calm, temperature drops, replies stay level-headed.

##### Repeat penalty follows valence

```python
repeat_penalty = clamp(1.15 - valence * 0.1, 1.0, 1.3)
```

| Valence | Repeat Penalty | Effect |
|---------|---------------|--------|
| -1.0 (negative) | 1.25 | Strong penalty, avoids repetition |
| 0.0 (neutral) | 1.15 | Default value |
| +1.0 (positive) | 1.05 | Weak penalty, allows repetition |

The more negative the conversation, the more the model is pushed to avoid repeating itself, like someone picking their words in a tense argument. The more positive the conversation, the more the model can allow redundant affirmations, like a relaxed chat.

##### Cumulative emotional state

Those scores don't just cover the immediate message. An `EmotionState` keeps an **exponential moving average** of valence and arousal per session:

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

The `decay` at 0.85 means 85% of the previous state is kept on each message, and 15% of the new signal is folded in. That gives an **emotional memory** smoothing brutal variations: a single negative message doesn't make the bot "sad", but a series of negative messages gradually shifts its mood.

In practice: if someone starts a conversation very excited (`arousal=+0.8`), temperature stays high for several exchanges, even if later messages are calmer. Emotion takes time to come down, like a human staying "heated" after an argument.

---

### Layer 4: inference (Krystal)

Krystal is the lowest layer: a wrapper around `llama.cpp` exposing an OpenAI-compatible API (`/v1/chat/completions`). It runs as two PM2 instances:

- `krystal-small`: the fine-tuned Luna 1.5B model, on port 3124, with CPU affinity 0
- `krystal-large`: a Hermes 3B model, on port 3125, with CPU affinity 0,1

Both instances are precompiled `llama-server` processes, launched with `taskset` for CPU pinning.

The Luna model fine-tune also evolved since the second article: it is now trained on **200,000 samples** (up from 50,000), still from Qwen2.5-1.5B-Instruct via QLoRA. The 200k samples are a subset of the Discord-Dialogues dataset, filtered to keep only the most natural and diverse conversations. The goal: widen the model's stylistic register without losing the flexibility that makes few-shot priming so effective.

---

## The full picture: a message in transit

Here's what concretely happens when someone sends "je suis vraiment triste aujourd'hui" ("i feel really sad today") on Discord:

1. **Jade** receives the message via the Discord Gateway API. It turns it into a `MessageEvent` and sends it to Emerald over WebSocket.
2. **Emerald** evaluates the trigger (direct mention? name? keyword?). It's a direct mention. It computes a concentration delay, checks cooldown, session, thematic fatigue. It decides to reply and sends the message to Sapphire over HTTP.
3. **Sapphire** embeds the message with `bge-small-en-v1.5`.
   - Classification: the message is closer to the `interessant` centroid than the `futile` one (diff = +0.31) -> **INTERESSANT**
   - Emotion: negative valence (-0.42), moderate arousal (0.35)
   - Routing: toward `KRYSTAL_SEMANTIC_URL` (port 3125, big model)
   - Sampling params: temperature = 0.80 (raised arousal), repeat_penalty = 1.19 (negative valence)
   - The session's emotional state gets updated with those values
4. **Krystal** (large instance) generates the reply with the emotionally tuned parameters and returns it to Sapphire.
5. **Sapphire** streams the reply to Emerald with metadata (label, valence, arousal, debug stats).
6. **Emerald** decides to add a hesitation ("oh..."), plans a burst (2 fragments), and picks a reaction. It sends a `RespondCommand` to Jade.
7. **Jade** executes: waits the initial delay, sends the first fragment with the hesitation, waits 1.5s, sends the second fragment. It shows the typing indicator throughout generation.

All of that in under 3 seconds for the user.

---

## Centroids: why it's better than a neural classifier

The choice of embedding centroids over a traditional classifier (like the DistilBERT I used before) deserves an explanation.

A neural classifier learns a decision boundary between classes, typically a non-linear transform projecting inputs to probabilities. It's precise, but:

- It needs labeled training data
- It's sensitive to distribution shift (data drift)
- It's hard to interpret
- It must be retrained to add a new class

A centroid, in contrast, is a **mean vector** of example embeddings. Classification happens by cosine similarity to that mean vector. Advantages:

- **No training required**: you just average embeddings of hand-picked examples
- **Easy to interpret**: you can look at which examples sit closest to the centroid to understand "what the centroid learned"
- **Adding a class**: you just add a new centroid, no retraining
- **Robust**: the centroid is a mean, so outliers have little impact

The real power of centroids is turning a classification problem into a **spatial distance measurement** problem. You can visualize categories as regions in a 384-dimensional space (or in 2D/3D after PCA/t-SNE dimensionality reduction).

### 3D visualization of centroids

In practice, here's what classification centroids look like in embedding space. Each point is an example message, projected to 3D by PCA (the original 384 dimensions reduced to 3 for visualization). Blue points are futile messages, yellow points interesting messages. The **20 diamond markers** are the k-means centroids (10 per class, seed=42). Hover a point to see the example's original text.

<iframe src="assets/centroids-plot.html" style="width:100%;height:550px;border:none;border-radius:8px;" loading="lazy" title="Centroid classification -- interactive 3D view"></iframe>

Two test examples show in red: "lol" (classified futile) and "i feel sad today" (classified interesting). Even after reducing 384 to 3 dimensions (14.7% explained variance), both clusters are clearly separated. The top annotation shows exact counts and the ambiguous zone.

The input message's centroid wanders that space based on its content. FUTILE/INTERESSANT classification is simply measuring which centroid is closest by cosine similarity. So you can picture each message as a point in a multi-dimensional space, each dimension matching a semantic property.

---

## What it changes in practice

Users never see the layers, centroids, or temperature tweaks. But they feel the effects:

- **Faster replies** for simple messages (the small model is 2x faster and handles 70% of traffic)
- **Adaptive tone**: if you're angry, the bot "senses" the anger and adapts its style
- **Cross-platform coherence**: a Matrix bot and a Discord bot share the same brain and emotional state
- **Preserved authentic tone**: fine-tune + few-shot + smart routing avoid corporate replies

Moving to 200k training samples for the small model reinforced those effects: the model better captures Discord conversation diversity without losing the malleability that few-shot priming enables.

---

## The full infrastructure

Here are the services currently running:

| Service | Technology | Port(s) | Role |
|---------|------------|---------|------|
| Pixieglow | TypeScript (Bun) | -- | Matrix adapter |
| Jade | TypeScript (esbuild) | -- | Discord adapter |
| Emerald | TypeScript (Bun) | 3126 (WebSocket) | Brain / decisions |
| Sapphire | Python (FastAPI) | 3123 (HTTP) | Classifier + emotion |
| Krystal small | llama.cpp (PM2) | 3124 | Small model (1.5B, futile) |
| Krystal large | llama.cpp (PM2) | 3125 | Big model (3B+, interesting) |

Service dependencies are one-way: the adapter depends on Emerald, Emerald depends on Sapphire, Sapphire depends on Krystal. The graph stays acyclic. Each service can restart independently.

---

## Conclusion

Splitting Luna Protocol into four layers wasn't just an architecture exercise. It answered concrete limits: no Matrix support, no emotional awareness, no smart message prioritization.

Today the system is more robust (an LLM crash doesn't kill the bot), more extensible (a Telegram or WhatsApp adapter would follow the same WebSocket protocol), and more "alive": the bot adapts its behavior, tone, and even LLM parameters to the conversation's perceived emotional state.

Embedding centroids are the key element making all of that possible without undue complexity: no trained neural net, no labeled data pipeline, just vector means and cosine similarities. A simple technique, incredibly effective, and terribly underestimated.

| Resource | Link |
|----------|------|
| Project website | [protocol-luna.github.io](https://protocol-luna.github.io/) |
| Pixieglow | [protocol-luna/pixieglow](https://github.com/protocol-luna/pixieglow) |
| Emerald | [protocol-luna/emerald](https://github.com/protocol-luna/emerald) |
| Sapphire | [protocol-luna/sapphire](https://github.com/protocol-luna/sapphire) |
| Krystal | [protocol-luna/krystal](https://github.com/protocol-luna/krystal) |
| Article 1: the Discord bot | [Luna Protocol: I built an autonomous Discord bot](/articles/en/luna-protocol-discord-bot) |
| Article 2: fine-tuning | [Luna Protocol: why I fine-tuned a 1.5B model](/articles/en/luna-protocol-official-models) |
