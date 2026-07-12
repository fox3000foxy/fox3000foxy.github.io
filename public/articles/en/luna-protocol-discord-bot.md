---
title: "Luna Protocol: I Built an Autonomous Discord Bot That Simulates a Human Being"
description: "Luna Protocol is a fully autonomous Discord bot powered by a local LLM, capable of natural conversation with sleep, typos, hesitations, forgetfulness, thematic fatigue, and spontaneous messages."
date: 2026-07-11
tags:
  - discord-bot
  - llm
  - typescript
  - architecture-evenementielle
  - intelligence-artificielle
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "jeget+tzBVZQxF4ZF+xkctgZgRi62QBqoE4ASiJWMirpGsTrsf7EG8YFGHVbd+qaEK30bG5rmXpltKHDLiw5DQ=="
---

# Luna Protocol: I Built an Autonomous Discord Bot That Simulates a Human Being

What if a Discord bot could **sleep**, make **typos**, **hesitate**, **forget** to reply, and sometimes send you a message on its own? That's exactly what **Luna Protocol** does: a fully autonomous Discord bot running a local LLM (llama.cpp) that converses like an imperfect human being.

No rigid prompts, no robotic responses. Luna has a **priority trigger system**, **variable delays**, **sleep schedules**, **spontaneous messages**, and even a **TTS pipeline** to send voice messages. All configured through a simple hot-reloadable `config.yml` file.

In this article, we break down the complete architecture: from the generic event bus to the TTS pipeline, through the trigger system, human-like behaviors, and the fine-tuning dataset.

![Architecture Overview -- global components and data flow](/images/luna-protocol/01-architecture-overview.svg)

---

## The Architecture: A Typed Event Bus

At the core of Luna est un **TypedBus** -- un bus d'événements générique fortement typé en TypeScript. C'est la brique fondamentale sur laquelle tout repose.

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

Deux buses principaux en découlent :

- **`llmBus`** -- handles LLM tokens, errors, crashes, reset
- **`stateBus`** -- handles state changes with automatic persistence

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

The advantage of this approach: each module is **decoupled** from the rest. The LLM emits tokens on the bus, the bot consumes them, and the state updates automatically. No circular dependencies.

---

![Message Processing -- flux complet de traitement d'un message](/images/luna-protocol/02-message-processing.svg)

## The Trigger System: Who Decides When Luna Responds?

Chaque message entrant est évalué par `evaluateMessage()` qui retourne un `TriggerResult` avec une raison de déclenchement. L'ordre de priorité est critique :

| # | Raison | Conditions | Bypass ignore | Bypass pause |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | Oui (0%) | Oui |
| 2 | `dm` | MP avec `replyInDM = true` | Oui (0%) | Non |
| 3 | `name` | "Luna"/"Pixie"/alias (mot entier) | Non (8%) | Non |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (mot entier) | Non (8%) | Non |
| 5 | `follow-up` | Bot était dernier locuteur + < 15s + < 3 / 60s | -- | -- |
| 6 | `random` | 1.5% de chance sur les messages non correspondants | Non (8%) | Non |

Matching is **whole word** (`\b`): "ai" does not match "mais", "vrai", "lait".

![Trigger evaluation -- entry decision for each message](/images/luna-protocol/03-trigger-evaluation.svg)

### The Follow-Up Mechanism

When Luna replies to a message, she registers herself as `lastSpeaker`. Any subsequent message within 15 seconds triggers an **immediate** response -- no timer, no keyword check. Budget: 3 follow-ups per 60-second window.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### The Cooldown

8 secondes entre deux réponses dans le même canal. Contourné par les mentions et les follow-ups.

---

## Human Behaviors: Variable Concentration

C'est ici que Luna devient intéressante. Chaque type de déclenchement a ses propres **seuils de concentration** : un délai min/max, une chance d'ignorer, et une chance de réagir.

| Trigger | Délai min | Délai max | Ignore | Réaction |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

Le calcul du délai prend aussi en compte :
- **La longueur du message** : plus le message est long, plus Luna met de temps à "lire"
- **L'inactivité** : si Luna n'a pas été active depuis 10 minutes, le délai est multiplié par 2 (simulation du "réveil")
- **Le sommeil** : en mode `slow`, le délai est multiplié par 3 à 5

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
  delay *= 0.5 + Math.random() * 1.5; // jitter agressif
  return delay;
}
```

---

## Sleep Schedules

Luna peut dormir. Configurable via `config.yml` :

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

| Mode | Effet |
|------|-------|
| `sleep` | Seules les mentions et MP passent |
| `slow` | Délai ×3-5, réactions quasi nulles |
| `short` | Chance d'ignore +30%, réactions quasi nulles |

Pendant les heures de sommeil, le statut Discord passe en `invisible`.

---

## Typos

Luna peut faire des fautes de frappe -- et les corriger après 2-4 secondes. Le layout clavier est configurable (AZERTY ou QWERTY).

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... toutes les touches adjacentes
};
```

Exemple AZERTY : `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`.

Three correction styles:

| Style | Comportement |
|-------|-------------|
| `edit` | Édite le message |
| `message` | Nouveau message : `word*` |
| `mixed` | 50/50 aléatoire (défaut) |

---

## Hesitations and Forgetfulness

**Hésitations** : 15% de chance de commencer par un mot de remplissage (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**Oublis** : même après avoir matché un trigger, Luna peut "oublier" de répondre avec une probabilité de 3%. Pas de message, pas de réaction -- comme si elle n'avait rien vu.

**Fatigue thématique** : si un mot revient trop souvent dans les 10 derniers messages (seuil : 3 occurrences), les délais sont multipliés et la chance d'ignore augmente de 15%.

---

## The LLM Pipeline: Two Modes

### `direct` Mode (default)

Le bot envoie directement les requêtes à un `llama-server` local en HTTP. Le modèle est partagé, avec prompt cache et 4 slots concurrents. Deux processus PM2 : le serveur LLM et le client bot.

### `online` Mode

Le bot appelle n'importe quelle API compatible OpenAI (OpenAI, OpenRouter, Groq, Together...). Pas de LLM local nécessaire.

### Real-Time Streaming

The LLM streams its response line by line (`\n`). Each line is split into words, emitted one by one on `llmBus.emit("token", word)`. On each `\n`, a `flush` event is emitted -- the bot immediately sends the accumulated message. No simulated delay: the pace is that of the LLM.

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

The queue (`requestQueue`) processes requests one by one, with automatic cleanup when the queue exceeds 100 elements.

---

## Spontaneous Messages

Every 5 minutes, there's a 12% chance Luna posts a message on her own. The server is selected using a **linear weight** system: the most active server has N times more chance than the least active.

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

The context of the last 5 messages is read, and Luna joins the conversation "naturally".

---

## The TTS Pipeline: Voice Messages

With an 8% chance, Luna sends a voice message instead of text. The complete pipeline:

1. **Piper TTS** synthesizes text into WAV
2. **ffmpeg** converts to OGG
3. The waveform is calculated for Discord preview
4. The file is uploaded via the Discord CDN API
5. The voice message is sent

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

![TTS Pipeline -- from synthesized text to Discord voice message](/images/luna-protocol/10-tts-pipeline.svg)

---

## Anti-Spam and Persistence

### Anti-Spam

Queue per `channelId:userId`. Only one message queued per user per channel. Processed as soon as the current response finishes.

### Session Limits

After 8 exchanges, Luna takes a 30-second break. The counter resets after 3 minutes of inactivity.

### Automatic Persistence

Every state mutation emits on `stateBus` → automatic save (500ms debounce). No more manual `saveAllState()` calls. Persisted state includes: pendingMessages, paused, cooldowns, timestamps, lastSpeaker, follow-up counters.

---

## Hot-Reload Configuration

A single `config.yml` file. Most values are **hot-reloadable** -- changes take effect without restart.

| Catégorie | Hot-reload |
|-----------|-----------|
| Triggers, keywords, noms | ✅ |
| Concentration, délais | ✅ |
| Typos, burst, fatigue | ✅ |
| Sleep schedules | ✅ |
| TTS, voice messages | ✅ |
| Discord token, LLM mode | ❌ (redémarrage requis) |

```typescript
// config.ts -- les getters retournent des valeurs live
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## The Dataset: Discord-Dialogues

Le modèle est fine-tuné sur [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) : **7.3M échanges**, **17M tours**, **140M mots**. Des vraies conversations Discord printemps-été 2025, filtrées (PII, ToS, bots, commandes). Apache 2.0.

| Métrique | Valeur |
|----------|--------|
| Échantillons | 7 303 464 |
| Tours totaux | 16 881 010 |
| Mots totaux | 139 922 950 |
| Tokens moyens | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

Le modèle quantifié utilisé est un GGUF (par exemple `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Distribution du dataset Discord-Dialogues](/images/luna-protocol/dataset-distribution.svg)

---

![Complete Lifecycle -- comportement complet du bot du message à la réponse, incluant les timers et cas limites](/images/luna-protocol/22-complete-lifecycle.svg)

## Architecture Diagrams

Le dossier `state-machines/` contient **24 diagrammes Mermaid** couvrant l'ensemble du code source. Chaque diagramme a une explication détaillée en langage humain.

Parmi les plus importants :

| # | Diagramme | Type |
|---|-----------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (complet) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 backends) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

Ces diagrammes sont une mine d'or pour comprendre le flux complet : du message entrant à la réponse, en passant par les timers et les cas limites.

---

## The Trigger Code in Detail

Le trigger est évalué par `evaluateMessage()` dans `state/trigger.ts`. Voici la logique complète :

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

  // ... matching par nom, keyword, follow-up, random
}
```

Le cache de regex (`hasWordCache`) évite de recompiler les patterns à chaque message.

---

## Reactions

Luna réagit aux messages avec des emojis. 30% de chance d'utiliser un emoji custom du serveur, 70% un emoji unicode. La réaction est déclenchée après le délai de concentration, pas immédiatement.

Les commandes par réaction sur les messages de Luna :
- ❌ → Stop
- ▶️ → Start
- 🗑️ → Clear

---

## Response Style

Le style de réponse est pondéré selon l'activité récente de Luna dans le canal :

| Contexte | messageReference | mentionRepliedUser | Poids |
|----------|-----------------|-------------------|-------|
| Froid | true | false | 70% |
| Froid | true | true | 20% |
| Froid | false | false | 10% |
| Actif | true | false | 50% |
| Actif | true | true | 15% |
| Actif | false | false | 30% |
| Actif | false | true | 5% |

En MP, `messageReference` est toujours `false`.

---

## Burst Messages

Avec 15% de chance, une réponse est découpée en 2-3 fragments envoyés au rythme humain (1.5-4 secondes entre chaque fragment). Simule quelqu'un qui tape en plusieurs fois.

![Timing Gantt -- temps d'attente réels pour les délais, réactions, streaming LLM et corrections](/images/luna-protocol/21-timing-gantt.svg)

---

## Dynamic Status

Le statut Discord de Luna alterne entre plusieurs presets configurés, tournant toutes les 15 minutes. Types supportés : Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). Pendant le sommeil, le statut passe en `invisible`.

```yaml
dynamic_status_presets:
  - status: online
    text: "avec les pixels"
    type: 0       # Playing
  - status: idle
    text: "du bruit blanc"
    type: 2       # Listening
```

Un jitter aléatoire (×0.5-1.0) évite les rotations prévisibles. 10% des tentatives sont sautées pour éviter la répétition.

## Typing Indicator

Avant d'appeler le LLM, Luna appelle `startTyping()`. Un `setInterval` rafraîchit l'indicateur toutes les 8 secondes pendant la génération. Nettoyé dans le `finally` (`clearInterval`).

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

## Crash Recovery

Si le LLM crash (processus `llama-server` qui meurt), Luna détecte l'événement via `llmBus.emit("crash", code)` et tente de redémarrer avec un backoff exponentiel. Évite les boucles de redémarrage infini.

## LLM Parameters

Les paramètres sont hardcodés dans `src/config.ts` :

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

Le template ChatML (`<|im_start|>/<|im_end|>`) est utilisé. Le nombre de threads est auto-détecté via `os.cpus().length`.

---

## Getting Started

```bash
npm install
cp config.example.yml config.yml
# éditer config.yml
npm run dev                    # dev (hot reload)
npm run build && npm start     # production
```

| Script | Description |
|--------|-------------|
| `build` | Bundle CLI autonome |
| `start` | Lance le bot |
| `lint` / `format` / `check` | Biome |
| `test` | Tests (Bun) |
| `download-model` | GGUF depuis HuggingFace |
| `diagrams` | Exporte les diagrammes Mermaid en SVG/PNG |

### Déploiement PM2

```bash
./start.sh   # lance llm-server + llm-client sous PM2
```

---

## Conclusion

Luna Protocol n'est pas juste un bot Discord avec un LLM. C'est un **système comportemental complet** qui simule les imperfections humaines : les oublis, les fautes de frappe, le sommeil, les hésitations, la fatigue. Le tout architecturé autour d'un bus d'événements typé, avec 24 diagrammes Mermaid documentant chaque flux.

Le code est open source, le dataset est public, et la configuration est hot-reloadable. Si le sujet vous intéresse, plongez dans le code -- c'est plus accessible qu'il n'y paraît.

| Ressource | Lien |
|-----------|------|
| Dépôt GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
