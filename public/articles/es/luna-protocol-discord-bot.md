---
title: "Luna Protocol: creé un bot Discord autónomo que simula un ser humano"
description: "Luna Protocol es un bot Discord completamente autónomo con un LLM local, capaz de conversación natural con sueño, errores de escritura, vacilaciones, olvidos, fatiga temática y mensajes espontáneos."
date: 2026-07-11
tags:
  - discord-bot
  - llm
  - typescript
  - arquitectura-eventos
  - inteligencia-artificial
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "U1e4uYPw6GU5mjJW+tHdeE3T7r7Fj3Gn8qbOt0kUJzMmo7cHs+w2DVkWh7cmh5xTDxUV25C/k8E14KioEeIpGw=="
---

# Luna Protocol : creé un bot Discord autónomo que simula un ser humano
Y si un bot Discord pudiera **dormir**, cometer **errores de escritura**, **dudar**, **olvidar** responder, y a veces enviarte un mensaje por su propia cuenta? Eso es exactamente lo que hace **Luna Protocol**: un bot Discord completamente autónomo que ejecuta un LLM local (llama.cpp) y conversa como un ser humano imperfecto.
Sin prompts rígidos, sin respuestas robóticas. Luna tiene un **sistema de activación prioritaria**, **retrasos variables**, **horarios de sueño**, **mensajes espontáneos**, e incluso una **pipeline TTS** para enviar mensajes de voz. Todo configurable a través de un simple archivo `config.yml` recargable en caliente.
En este artículo, desgranamos la arquitectura completa: desde el bus de eventos genérico hasta la pipeline TTS, pasando por el sistema de activación, los componentes humanos y el dataset de fine-tuning.
![Vista general de la arquitectura -- componentes globales y flujo de datos](/images/luna-protocol/01-architecture-overview.svg)

---

## La arquitectura: un bus de eventos tipado

El corazón de Luna es un **TypedBus** -- un bus de eventos genérico fuertemente tipado en TypeScript. Es la pieza fundamental sobre la que todo se sustenta.

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

De este enfoque se derivan dos buses principales:

- **`llmBus`** -- gestiona los tokens LLM, errores, crashes, reinicio
- **`stateBus`** -- gestiona los cambios de estado con persistencia automática

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

La ventaja de este enfoque: cada módulo está **desconectado** del resto. El LLM emite tokens en el bus, el bot los consume, el estado se actualiza automáticamente. Sin dependencias circulares.

---

![Message Processing -- flux complet de traitement d'un message](/images/luna-protocol/02-message-processing.svg)

## El sistema de activación: ¿quién decide cuándo responde Luna?

Chaque message entrant est évalué par `evaluateMessage()` qui retourne un `TriggerResult` avec une raison de déclenchement. L'ordre de priorité est critique :

| # | Raison | Conditions | Bypass ignore | Bypass pause |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | Oui (0%) | Oui |
| 2 | `dm` | MP avec `replyInDM = true` | Oui (0%) | Non |
| 3 | `name` | "Luna"/"Pixie"/alias (mot entier) | Non (8%) | Non |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (mot entier) | Non (8%) | Non |
| 5 | `follow-up` | Bot était dernier locuteur + < 15s + < 3 / 60s | -- | -- |
| 6 | `random` | 1.5% de chance sur les messages non correspondants | Non (8%) | Non |

Le matching est **mot entier** (`\b`) : "ai" ne correspond pas à "mais", "vrai", "lait".

![Trigger evaluation -- décision d'entrée pour chaque message](/images/luna-protocol/03-trigger-evaluation.svg)

### El mecanismo de follow-up

Quand Luna répond à un message, elle s'enregistre comme `lastSpeaker`. Tout message suivant dans les 15 secondes déclenche une réponse **immédiate** -- pas de timer, pas de vérification de keyword. Budget : 3 follow-ups par fenêtre de 60 secondes.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### El cooldown

8 segundos entre dos respuestas en el mismo canal. Evitado por menciones y follow-ups.

---

## Los comportamientos humanos: la concentración variable

C'est ici que Luna devient intéressante. Chaque type de déclenchement a ses propres **seuils de concentration** : un délai min/max, une chance d'ignorer, et une chance de réagir.

| Trigger | Délai min | Délai max | Ignore | Réaction |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

El cálculo del retraso también tiene en cuenta:
- **La longitud del mensaje**: cuanto más largo el mensaje, más tiempo tarda Luna en "leerlo"
- **La inactividad**: si Luna no ha estado activa durante 10 minutos, el retraso se multiplica por 2 (simulación de "despertar")
- **El sueño**: en modo `slow`, el retraso se multiplica por 3 a 5

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

## Los horarios de sueño

Luna puede dormir. Configurable a través de `config.yml`:

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

Durante las horas de sueño, el estado de Discord cambia a `invisible`.

---

## Los errores de escritura

Luna puede cometer errores de escritura -- y corregirlos después de 2-4 segundos. El diseño del teclado es configurable (AZERTY o QWERTY).

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... todas las teclas adyacentes
};
```

Exemple AZERTY : `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`.

Tres estilos de corrección:

| Style | Comportement |
|-------|-------------|
| `edit` | Édite le message |
| `message` | Nouveau message : `word*` |
| `mixed` | 50/50 aléatoire (défaut) |

---

## Las vacilaciones y los olvidos

**Hésitations** : 15% de chance de commencer par un mot de remplissage (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**Oublis** : même après avoir matché un trigger, Luna peut "oublier" de répondre avec une probabilité de 3%. Pas de message, pas de réaction -- comme si elle n'avait rien vu.

**Fatigue thématique** : si un mot revient trop souvent dans les 10 derniers messages (seuil : 3 occurrences), les délais sont multipliés et la chance d'ignore augmente de 15%.

---

## La pipeline LLM: dos modos

### Modo `direct` (predeterminado)

El bot envía directamente las solicitudes a un `llama-server` local en HTTP. El modelo es compartido, con caché de prompts y 4 slots concurrentes. Dos procesos PM2: el servidor LLM y el cliente del bot.

### Modo `online`

El bot llama a cualquier API compatible con OpenAI (OpenAI, OpenRouter, Groq, Together...). No se necesita LLM local.

### El streaming en tiempo real

Le LLM stream sa réponse ligne par ligne (`\n`). Chaque ligne est découpée en mots, émis un par un sur `llmBus.emit("token", word)`. À chaque `\n`, un événement `flush` est émis -- le bot envoie immédiatement le message accumulé. Pas de délai simulé : le rythme est celui du LLM.

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

La cola (`requestQueue`) procesa las solicitudes una por una, con limpieza automática cuando la cola supera los 100 elementos.

---

## Los mensajes espontáneos

Toutes les 5 minutes, 12% de chance que Luna poste un message de son propre chef. El servidor se selecciona mediante un sistema de **pesos lineales**: el servidor más activo tiene N× más de probabilidades que el último.

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

Se lee el contexto de los últimos 5 mensajes, y Luna se une a la conversación "naturalmente".

---

## La pipeline TTS: mensajes de voz

Con un 8% de probabilidad, Luna envía un mensaje de voz en lugar de texto. La pipeline completa:

1. **Piper TTS** sintetiza el texto en WAV
2. **ffmpeg** convierte a OGG
3. Se calcula la forma de onda para la vista previa de Discord
4. El archivo se carga a través de la API de Discord CDN
5. Se envía el mensaje de voz

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

![TTS Pipeline -- du texte synthétisé au message vocal Discord](/images/luna-protocol/10-tts-pipeline.svg)

---

## El anti-spam y la persistencia

### Anti-spam

Cola por `channelId:userId`. Un solo mensaje en cola por usuario por canal. Se procesa tan pronto como termina la respuesta en curso.

### Límites de sesión

Después de 8 intercambios, Luna hace una pausa de 30 segundos. El contador se reinicia después de 3 minutos de inactividad.

### Persistencia automática

Chaque mutation d'état émet sur `stateBus` → sauvegarde automatique (debounce 500ms). Plus besoin d'appels `saveAllState()` manuels. L'état persisté inclut : pendingMessages, paused, cooldowns, timestamps, lastSpeaker, compteurs de follow-up.

---

## La configuración con recarga en caliente

Un solo archivo `config.yml`. La mayoría de los valores son **recargables en caliente** -- los cambios se aplican sin reinicio.

| Catégorie | Hot-reload |
|-----------|-----------|
| Triggers, keywords, noms | ✅ |
| Concentration, délais | ✅ |
| Typos, burst, fatigue | ✅ |
| Sleep schedules | ✅ |
| TTS, voice messages | ✅ |
| Discord token, LLM mode | ❌ (redémarrage requis) |

```typescript
// config.ts -- los getters devuelven valores en vivo
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## El dataset: Discord-Dialogues

Le modèle est fine-tuné sur [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) : **7.3M échanges**, **17M tours**, **140M mots**. Des vraies conversations Discord printemps-été 2025, filtrées (PII, ToS, bots, commandes). Apache 2.0.

| Métrique | Valeur |
|----------|--------|
| Échantillons | 7 303 464 |
| Tours totaux | 16 881 010 |
| Mots totaux | 139 922 950 |
| Tokens moyens | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

El modelo cuantizado utilizado es un GGUF (por ejemplo, `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Distribution du dataset Discord-Dialogues](/images/luna-protocol/dataset-distribution.svg)

---

![Complete Lifecycle -- comportement complet du bot du message à la réponse, incluant les timers et cas limites](/images/luna-protocol/22-complete-lifecycle.svg)

## Los diagramas de arquitectura

La carpeta `state-machines/` contiene **24 diagramas Mermaid** que cubren todo el código fuente. Cada diagrama tiene una explicación detallada en lenguaje humano.

Entre los más importantes:

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

Estos diagramas son una mina de oro para comprender el flujo completo: desde el mensaje entrante hasta la respuesta, pasando por los temporizadores y los casos límite.

---

## El código de activación en detalle

El trigger es evaluado por `evaluateMessage()` en `state/trigger.ts`. Esta es la lógica completa:

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

  // ... coincidencia por nombre, keyword, follow-up, random
}
```

La caché de regex (`hasWordCache`) evita recompilar los patrones en cada mensaje.

---

## Las reacciones

Luna reacciona a los mensajes con emojis. 30% de probabilidad de usar un emoji personalizado del servidor, 70% un emoji unicode. La reacción se activa después del retraso de concentración, no inmediatamente.

Las comandos por reacción en los mensajes de Luna:
- ❌ → Stop
- ▶️ → Start
- 🗑️ → Clear

---

## El estilo de respuesta

El estilo de respuesta se pondera según la actividad reciente de Luna en el canal:

| Contexte | messageReference | mentionRepliedUser | Poids |
|----------|-----------------|-------------------|-------|
| Froid | true | false | 70% |
| Froid | true | true | 20% |
| Froid | false | false | 10% |
| Actif | true | false | 50% |
| Actif | true | true | 15% |
| Actif | false | false | 30% |
| Actif | false | true | 5% |

En MP, `messageReference` siempre es `false`.

---

## Los mensajes en ráfaga

Avec 15% de chance, une réponse est découpée en 2-3 fragments envoyés au rythme humain (1.5-4 secondes entre chaque fragment). Simule quelqu'un qui tape en plusieurs fois.

![Timing Gantt -- temps d'attente réels pour les délais, réactions, streaming LLM et corrections](/images/luna-protocol/21-timing-gantt.svg)

---

## El estado dinámico

El estado de Discord de Luna alterna entre varios preajustes configurados, girando cada 15 minutos. Tipos compatibles: Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). Durante el sueño, el estado cambia a `invisible`.

```yaml
dynamic_status_presets:
  - status: online
    text: "con los píxeles"
    type: 0       # Playing
  - status: idle
    text: "ruido blanco"
    type: 2       # Listening
```

Un jitter aleatorio (×0.5-1.0) evita rotaciones predecibles. El 10% de los intentos se saltan para evitar la repetición.

## El indicador de escritura

Antes de llamar al LLM, Luna llama a `startTyping()`. Un `setInterval` actualiza el indicador cada 8 segundos durante la generación. Se limpia en el `finally` (`clearInterval`).

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

## La recuperación después de crash

Si le LLM crash (processus `llama-server` qui meurt), Luna détecte l'événement via `llmBus.emit("crash", code)` et tente de redémarrer avec un backoff exponentiel. Évite les boucles de redémarrage infini.

## Los parámetros LLM

Los parámetros están codificados en `src/config.ts`:

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

## Puesta en marcha

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

### Despliegue PM2

```bash
./start.sh   # lance llm-server + llm-client sous PM2
```

---

## Conclusión

Luna Protocol n'est pas juste un bot Discord avec un LLM. C'est un **système comportemental complet** qui simule les imperfections humaines : les oublis, les fautes de frappe, le sommeil, les hésitations, la fatigue. Le tout architecturé autour d'un bus d'événements typé, avec 24 diagrammes Mermaid documentant chaque flux.

Le code est open source, le dataset est public, et la configuration est hot-reloadable. Si le sujet vous intéresse, plongez dans le code -- c'est plus accessible qu'il n'y paraît.

| Ressource | Lien |
|-----------|------|
| Dépôt GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
