---
title: "Luna Protocol: shared brains, emotion classification, and interesting/futile routing"
description: "Luna Protocol went from a monolith to a four-layer architecture: adapters, brain, emotion classifier, and inference. On the menu: embedding centroids, interesting/futile routing, and LLM parameter tuning by valence and arousal."
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
author_sig: "lZrext0IlTlYLPMltsqEPEMezdmehE53ZirKRbfzGu8mp/ppHXjBW+FbHhnndOQRR7MLZlT6nwJCtuvRww5NGQ=="
---

# Luna Protocol: shared brains, emotion classification, and interesting/futile routing

In the [two](/articles/en/luna-protocol-discord-bot) [previous](/articles/en/luna-protocol-official-models) articles, I presented Luna Protocol as a single Discord bot with a complex behavioral system and a fine-tuned model. But the architecture has evolved a lot since then. What used to be a monolith -- a single Node.js process handling the Discord bot, the behavior, and the LLM calls -- has turned into **four independent layers**, each with its own responsibility, its own language, and its own lifecycle.

This split brought unexpected benefits: sharing "brains" across multiple platforms, an emotion classification system that dynamically tunes the LLM's parameters, and smart routing of messages between two models based on the perceived importance of the conversation.

The evolution didn't happen all at once -- it followed an organic path. I first split the `server/` folder out of the bot's repo, creating **Krystal** on one side and leaving **Jade** as the Discord adapter. Then I created **Pixieglow** (Matrix adapter) by reusing Jade's `llm-core` and event bus. Next came **Sapphire**, introducing a GENERIC/SEMANTIC classification with DistilBERT -- but the results weren't convincing, so I switched to embedding centroids, which are more malleable for enriching examples and more accurate; the classification became FUTILE/INTERESTING. I eventually added **valence** and **arousal** centroids to regulate the LLM's temperature and repeat penalty. Finally, I removed all the redundant code between Jade and Pixieglow by creating **Emerald**, the shared brain, turning Jade and Pixieglow into simple socket-driven clients.

Alongside this, I've kept a website up to date that tracks the project's progress: [protocol-luna.github.io](https://protocol-luna.github.io/).

This article tells the story of how and why I split these layers, what each service does exactly, and how concepts like **centroids** (average embedding vectors) and **resentment variables** (inspired by the 1970s PARRY chatbot) turned a simple Discord bot into a surprisingly coherent multi-platform system.

---

## The problem with the monolith

At first, Luna Protocol fit in a single Node.js process. The code handled:

- The Discord connection (via the Eris library)
- Trigger evaluation (mentions, keywords, follow-ups...)
- Simulation of human behaviors (typos, hesitations, sleep...)
- HTTP calls to the local LLM server (llama.cpp)
- Session management and anti-spam
- The TTS pipeline

Everything lived in the same process, communicating through typed event buses (`TypedBus`). It worked, but with limitations:

- **Impossible to add a Matrix client** without duplicating all the behavior code
- **The LLM and the bot were in the same repo**: the `server/` folder already existed, but you couldn't evolve one without touching the other
- **No smart classification**: every message was treated the same way, whether it was a "lol" or an existential question
- **No persistent emotional state**: the bot didn't "feel" anything

Splitting into layers solved all of these problems.

---

## The four layers

Luna Protocol's current architecture is organized as a four-level funnel:

```
Matrix / Discord
      |
      v
  [ADAPTERS]      Pixieglow (Matrix) / Jade (Discord)
      |
      v
  [BRAIN]         Emerald (WebSocket, port 3126)
      |
      v
  [CLASSIFIER]    Sapphire (HTTP, port 3123)
      |
      v
  [INFERENCE]     Krystal (llama.cpp, ports 3124 / 3125)
```

Each layer can be restarted, updated, or replaced independently.

---

### Layer 1: the adapters (Pixieglow and Jade)

These are the simplest layers. Their only job is to translate events from a messaging platform into a standardized protocol toward Emerald:

- **Jade** is the Discord adapter. It uses the Eris library to connect to Discord and forwards messages to Emerald via WebSocket. It also handles the TTS pipeline (speech synthesis via Piper, OGG conversion, upload to Discord).
- **Pixieglow** is the Matrix adapter. It uses the Matrix Client-Server HTTP API directly (no SDK), with a long-poll sync. It has no TTS.

Both adapters share the same WebSocket protocol defined in `emerald-client.ts`:

```typescript
type ClientId = "jade" | "pixieglow";

// Events (adapter -> Emerald)
type InEvent = MessageEvent | ReadyEvent | BotMessageEvent | PresenceEvent;

// Commands (Emerald -> adapter)
type OutCommand = RespondCommand | TypingCommand | SetPresenceCommand
                | SpontaneousCommand | ForgotCommand;
```

The existence of two adapters with the same interface proves the brain-sharing works: **the same "brain" (Emerald) serves a Discord bot and a Matrix bot indifferently**, with identical behaviors. The protocol is declarative: Emerald doesn't tell the adapter *how* to send a message, it tells it *what* to send (the text with a delay, possibly a burst plan, a reaction, etc.). Each adapter implements the concrete execution for its platform.

That's the strength of this architecture: to add support for Telegram, Signal, or anything else, you just need to write an adapter that implements the WebSocket protocol.

---

### Layer 2: the brain (Emerald)

Emerald is the central decision-making service. It listens on port 3126 over WebSocket and handles:

- **Trigger evaluation**: mention, DM, name, keyword, follow-up, random
- **Behavioral simulation**: focus delays, typos, hesitations, forgetfulness, bursts, topic fatigue
- **Sleep cycles**: sleep / slow / short modes
- **Session management**: cooldown, session limits, anti-spam
- **Routing to Sapphire**: sending messages, receiving streamed responses

Emerald is the central service that enabled brain-sharing, and it's the one that benefited most from the split. Before, every behavior (typo, burst, hesitation) was tangled up with the Discord code. Now they live in dedicated modules under `behavior/`:

```
emerald/src/behavior/
  burst.ts         -- Burst message planning
  mannerisms.ts    -- Delays, hesitations, reactions, forgetfulness
  sleep.ts         -- Sleep schedule evaluation
  typo.ts          -- Typo simulation (AZERTY/QWERTY)
```

The brain doesn't know which platform it's running on. It receives a `MessageEvent` with a `clientId` ("jade" or "pixieglow"), makes a decision, and returns a command. The adapter handles the rest.

---

### Layer 3: the emotion classifier (Sapphire)

Sapphire is the most technically interesting service. It's an **LLM middleware** written in Python with FastAPI, playing four critical roles:

1. **Binary FUTILE / INTERESTING classifier** via embedding centroids
2. **Emotion scorer** (valence / arousal) via centroids
3. **Backend router** to Krystal (small model vs large model)
4. **Few-shot injector** and session manager

#### Centroids: the heart of classification

A **centroid** is a simple concept: it's the average of a set of embedding vectors. Concretely, I gathered hundreds of example messages, ran them through an embedding model (`BAAI/bge-small-en-v1.5`, 384 dimensions), and averaged the resulting vectors.

There are **two classification centroids**:

- `futile_centroid`: ~683 trivial messages ("lol", "ok", "hello", "nm just chillin u") via k-means (k=10, seed=42)
- `interesting_centroid`: ~678 substantial messages (technical, personal, philosophical) via k-means (k=10, seed=42)

When a message comes in:

```python
def classify(text, embedder, futile_centroids, interesting_centroids):
    emb = embedder.query_embed(text)            # 384-D vector of the message
    sim_f = max(cos(emb, c) for c in futile_centroids)     # max over 10
    sim_i = max(cos(emb, c) for c in interesting_centroids) # max over 10
    diff = sim_i - sim_f
    label = "INTERESTING" if diff > 0 else "FUTILE"
    return label, abs(diff), sim_f, sim_i
```

The score per class is the **maximum cosine similarity** across its 10 centroids. This captures sub-types within each category -- a greeting and a farewell both land near one of the 10 futile centroids even though they're far from each other in embedding space. No training, no GPU, just k-means at startup and dot products at runtime.

#### Why two models?

The result of this classification decides which LLM backend is invoked:

| Label | Krystal backend | Model | Port |
|-------|-----------------|-------|------|
| `FUTILE` | `generic` | Luna-Protocol-1.5B (941 MB, Q4_K_M) | 3124 |
| `INTERESTING` | `semantic` | Hermes-3-3B or 8B (depending on config) | 3125 |

The intuition is simple: a "lol" or a "nm just chillin u" doesn't deserve to invoke an 8-billion-parameter model. The small fine-tuned Luna 1.5B model, trained on 200,000 Discord samples, is more than enough for light exchanges. On the other hand, a question about life, a confession, or a technical debate gets routed to the large model, which can produce a richer response.

This economical routing considerably reduces the load on the LLM server: about 70% of messages are classified as FUTILE and handled by the small model, freeing up the large model for conversations that actually deserve it.

#### The emotional axis: valence and arousal

But that's not all. Sapphire uses the **same centroid mechanism** on an independent axis to evaluate the emotion of the message:

There are **four emotional centroids**:

| Pole | Examples |
|------|----------|
| `positive` | "hell yeah", "love that", "this is great" |
| `negative` | "shut up", "i hate this", "this sucks" |
| `high_arousal` | "WHAT THE HELL", "omg omg omg", "AAAAA" |
| `low_arousal` | "just chilling", "meh", "i guess" |

The score is computed as a difference of similarities on each axis:

```python
valence = sim(emb, positive) - sim(emb, negative)     # [-1, +1]
arousal = sim(emb, high_arousal) - sim(emb, low_arousal)  # [-1, +1]
```

**Valence** measures whether the message is positive or negative. **Arousal** measures its emotional intensity. Together they form the circumplex model of affect (Russell, 1980) -- the same psychological model that inspired the **PARRY** chatbot in 1972.

#### Resentment variables: how emotions control the LLM

This is where the PARRY inspiration becomes tangible. PARRY (created by Kenneth Colby in 1972) was a chatbot designed to simulate a paranoid patient. It had internal variables -- fear, anger, mistrust -- that altered its responses. For example, a "scared" PARRY would respond more aggressively.

Sapphire does the same thing, but with continuous variables and a more elegant method: the LLM's sampling parameters are adjusted in real time based on the conversation's emotional state.

##### Temperature follows arousal

```python
temperature = clamp(0.7 + arousal * 0.3, 0.4, 1.0)
```

| Arousal | Temperature | Effect |
|---------|-------------|--------|
| -1.0 (calm) | 0.40 | Low creativity, predictable responses |
| 0.0 (neutral) | 0.70 | Default creativity |
| +1.0 (excited) | 1.00 | Maximum randomness, surprising responses |

When someone is excited or upset (high arousal), the temperature goes up. The model produces more varied, more creative, sometimes more chaotic responses -- like a human who "gets carried away." When the conversation is calm, the temperature drops, and responses become more measured.

##### Repeat penalty follows valence

```python
repeat_penalty = clamp(1.15 - valence * 0.1, 1.0, 1.3)
```

| Valence | Repeat Penalty | Effect |
|---------|-----------------|--------|
| -1.0 (negative) | 1.25 | Strong penalty, avoids repetition |
| 0.0 (neutral) | 1.15 | Default value |
| +1.0 (positive) | 1.05 | Low penalty, allows repetition |

The more negative the conversation, the more the model is pushed to avoid repeating itself -- like someone searching for words in a tense argument. The more positive the conversation, the more the model can afford redundant statements, like a relaxed conversation.

##### Cumulative emotional state

These scores don't just apply to the immediate message. An `EmotionState` maintains an **exponential moving average** of valence and arousal per session:

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

The `decay` of 0.85 means that 85% of the previous state is kept at each message, with 15% of the new signal integrated. This creates an **emotional memory** that smooths out sudden swings: a single negative message doesn't make the bot "sad," but a series of negative messages gradually drifts its mood.

In practice: if someone starts a conversation very excitedly (`arousal=+0.8`), the temperature stays high for several exchanges, even if the following messages are calmer. The emotion takes time to come back down -- like a human who stays "heated" after an argument.

---

### Layer 4: inference (Krystal)

Krystal is the lowest layer: a wrapper around `llama.cpp` that exposes an OpenAI-compatible API (`/v1/chat/completions`). It runs as two PM2 instances:

- `krystal-small`: the fine-tuned Luna 1.5B model, on port 3124, with CPU affinity 0
- `krystal-large`: a Hermes 3B model, on port 3125, with CPU affinity 0,1

Both instances are pre-compiled `llama-server` processes, launched with `taskset` for CPU pinning.

The Luna model's fine-tune has also evolved since the second article: it's now trained on **200,000 samples** (up from 50,000 previously), still starting from Qwen2.5-1.5B-Instruct via QLoRA. The 200k samples are a subset of the Discord-Dialogues dataset, filtered to keep only the most natural and diverse conversations. The goal: broaden the model's stylistic range without losing the flexibility that makes few-shot priming so effective.

---

## The full picture: a message in transit

Here's what actually happens when someone sends "i'm really sad today" on Discord:

1. **Jade** receives the message via the Discord Gateway API. It converts it into a `MessageEvent` and sends it to Emerald over WebSocket.
2. **Emerald** evaluates the trigger (mention? name? keyword?). It's a direct mention. It computes a focus delay, checks the cooldown, the session, the topic fatigue. It decides to respond and sends the message to Sapphire over HTTP.
3. **Sapphire** embeds the message with `bge-small-en-v1.5`.
   - Classification: the message is closer to the `interesting` centroid than the `futile` centroid (diff = +0.31) -> **INTERESTING**
   - Emotion: negative valence (-0.42), moderate arousal (0.35)
   - Routing: direction `KRYSTAL_SEMANTIC_URL` (port 3125, large model)
   - Sampling parameters: temperature = 0.80 (arousal increased), repeat_penalty = 1.19 (negative valence)
   - The session's emotional state is updated with these values
4. **Krystal** (large instance) generates the response with the emotionally-adjusted parameters and sends it back to Sapphire.
5. **Sapphire** streams the response to Emerald along with metadata (label, valence, arousal, debug statistics).
6. **Emerald** decides to add a hesitation ("oh..."), plans a burst (2 fragments), and picks a reaction. It sends a `RespondCommand` to Jade.
7. **Jade** executes: waits the initial delay, sends the first fragment with the hesitation, waits 1.5s, sends the second fragment. It shows the typing indicator throughout the generation.

All of this in under 3 seconds for the user.

---

## Centroids: why they're better than a neural classifier

The choice of embedding centroids over a traditional classifier (like the DistilBERT I used before) deserves an explanation.

A neural classifier learns a decision boundary between classes -- typically a non-linear transformation that maps inputs to probabilities. It's accurate, but:

- It requires labeled training data
- It's sensitive to distribution shift (data drift)
- It's hard to interpret
- It needs to be retrained to add a new class

A centroid, on the other hand, is an **average vector** of example embeddings. Classification is done by cosine similarity to that average vector. Advantages:

- **No training**: you just compute the average of embeddings for hand-picked examples
- **Easy to interpret**: you can look at which examples are closest to the centroid to understand "what the centroid has learned"
- **Adding a class**: you just add a new centroid -- no retraining needed
- **Robust**: the centroid is an average, so outliers have little impact

The real power of centroids is that they turn a classification problem into a **spatial distance measurement** problem. You can visualize categories as regions in a 384-dimensional space (or in 2D/3D after PCA/t-SNE dimensionality reduction).

### 3D centroid visualization

In practice, here's what the classification centroids look like in embedding space. Each point is an example message, projected in 3D via PCA (the original 384 dimensions are reduced to 3 for visualization). Blue points are futile messages, yellow points are interesting messages. The **20 diamond markers** are the k-means centroids (10 per class, seed=42). Hover over a point to see the example's original text.

<iframe src="assets/centroids-plot.html" style="width:100%;height:550px;border:none;border-radius:8px;" loading="lazy" title="Centroid classification - interactive 3D view"></iframe>

Two test examples are shown in red: "lol" (classified futile) and "i feel sad today" (classified interesting). Even after reducing from 384 to 3 dimensions (14.7% explained variance), the two clusters are clearly separated. The annotation at the top shows exact counts and the ambiguous zone.

The centroid of the input message wanders through this space depending on its content. FUTILE/INTERESTING classification simply consists of measuring which centroid is closer by cosine similarity. This lets us represent each message as a point in a multi-dimensional space, with each dimension corresponding to a semantic property.

---

## What this changes in practice

Users don't see the layers, the centroids, or the temperature adjustments. But they feel the effects:

- **Faster responses** for simple messages (the small model is 2x faster and handles 70% of the traffic)
- **Adaptive tone**: if you're annoyed, the bot "senses" the irritation and adapts its style
- **Cross-platform consistency**: a Matrix bot and a Discord bot share the same brain and the same emotional state
- **No "assistant mode"**: the fine-tune + few-shot + smart routing avoids corporate-sounding responses

Bumping the small model's training set to 200k samples further reinforced these effects: the model better captures the diversity of Discord conversations without losing the malleability that few-shot priming provides.

---

## The complete infrastructure

Here are the services currently running:

| Service | Technology | Port(s) | Role |
|---------|------------|---------|------|
| Pixieglow | TypeScript (Bun) | -- | Matrix adapter |
| Jade | TypeScript (esbuild) | -- | Discord adapter |
| Emerald | TypeScript (Bun) | 3126 (WebSocket) | Brain / decisions |
| Sapphire | Python (FastAPI) | 3123 (HTTP) | Classifier + emotion |
| Krystal small | llama.cpp (PM2) | 3124 | Small model (1.5B, futile) |
| Krystal large | llama.cpp (PM2) | 3125 | Large model (3B+, interesting) |

Dependencies between services are unidirectional: the adapter depends on Emerald, Emerald depends on Sapphire, Sapphire depends on Krystal. No cycles. Each service can be restarted independently.

---

## Conclusion

Splitting Luna Protocol into four layers wasn't just an architectural exercise. It was a response to concrete limitations: the inability to support Matrix, the lack of emotional awareness, and the absence of smart message prioritization.

Today, the system is more robust (an LLM crash doesn't kill the bot), more extensible (a Telegram or WhatsApp adapter would follow the same WebSocket protocol), and more "alive": the bot adapts its behavior, its tone, and even the LLM's parameters to the perceived emotional state of the conversation.

Embedding centroids are the key piece that makes all of this possible without excessive complexity: no trained neural network, no labeled data pipeline, just vector averages and cosine similarities. It's a simple technique, incredibly effective, and terribly underrated.

| Resource | Link |
|----------|------|
| Project website | [protocol-luna.github.io](https://protocol-luna.github.io/) |
| Pixieglow | [protocol-luna/pixieglow](https://github.com/protocol-luna/pixieglow) |
| Emerald | [protocol-luna/emerald](https://github.com/protocol-luna/emerald) |
| Sapphire | [protocol-luna/sapphire](https://github.com/protocol-luna/sapphire) |
| Krystal | [protocol-luna/krystal](https://github.com/protocol-luna/krystal) |
| Article 1: the Discord bot | [Luna Protocol: I built an autonomous Discord bot](/articles/en/luna-protocol-discord-bot) |
| Article 2: fine-tuning | [Luna Protocol: why I fine-tuned a 1.5B model](/articles/en/luna-protocol-official-models) |