---
title: "Luna Protocol: creé un bot Discord autónomo que simula un ser humano"
description: "Luna Protocol es un bot Discord totalmente autónomo con un LLM local, capaz de conversación natural con sueño, erratas, vacilaciones, olvidos, fatiga temática y mensajes espontáneos."
date: 2026-07-11
tags:
  - discord
  - llm
  - typescript
  - event-driven-architecture
  - ai
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "VEUeKix0cVrnkJPD09opE/+B9GspphyGO4Ov5VpDELDePt/SdOhenofiTWnoIS08ksYltHnD0d4sIaj3FTsxjw=="
---

# Luna Protocol: creé un bot Discord autónomo que simula un ser humano

¿Y si un bot Discord pudiera **dormir**, meter **erratas**, **vacilar**, **olvidar** responder, y a veces enviarte un mensaje por iniciativa propia? Eso es justo lo que hace **Luna Protocol**: un bot Discord totalmente autónomo que corre un LLM local (llama.cpp) y conversa como un ser humano imperfecto.

Luna funciona con disparos contextuales y respuestas imperfectas asumidas. Tiene un **sistema de disparo prioritario**, **retardos variables**, **horarios de sueño**, **mensajes espontáneos**, e incluso un **pipeline TTS** para enviar mensajes vocales. Todo configurado vía un simple `config.yml` hot-reloadable.

En este artículo, disecciono la arquitectura completa: del bus de eventos genérico al pipeline TTS, pasando por el sistema de disparo, los componentes humanos, y el dataset de fine-tuning.

![Architecture Overview: componentes globales y flujo de datos](/images/luna-protocol/01-architecture-overview.svg)

---

## La arquitectura: un bus de eventos tipado

El corazón de Luna es un **TypedBus**: un bus de eventos genérico fuertemente tipado en TypeScript. Es la pieza fundamental sobre la que descansa todo. Lo construí así porque quería evitar las dependencias circulares desde el principio.

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

Dos buses principales se derivan:

- **`llmBus`**: gestiona los tokens LLM, los errores, los crashes, el reset
- **`stateBus`**: gestiona los cambios de estado con persistencia automática

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

La ventaja de este enfoque: cada módulo está **desconectado** del resto. El LLM emite tokens en el bus, el bot los consume, el state se actualiza automáticamente. Ninguna dependencia circular.

---

![Message Processing: flujo completo de procesamiento de un mensaje](/images/luna-protocol/02-message-processing.svg)

## El sistema de disparo: quién decide cuándo responde Luna

Cada mensaje entrante lo evalúa `evaluateMessage()` que devuelve un `TriggerResult` con una razón de disparo. El orden de prioridad es crítico:

| # | Razón | Condiciones | Bypass ignore | Bypass pause |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | Sí (0%) | Sí |
| 2 | `dm` | MP con `replyInDM = true` | Sí (0%) | No |
| 3 | `name` | "Luna"/"Pixie"/alias (palabra entera) | No (8%) | No |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (palabra entera) | No (8%) | No |
| 5 | `follow-up` | Bot fue último locutor + < 15s + < 3 / 60s | -- | -- |
| 6 | `random` | 1.5% de probabilidad en los mensajes no coincidentes | No (8%) | No |

El matching es **palabra entera** (`\b`): "ai" no coincide con "mais", "vrai", "lait".

![Trigger evaluation: decisión de entrada para cada mensaje](/images/luna-protocol/03-trigger-evaluation.svg)

### El mecanismo de follow-up

Cuando Luna responde un mensaje, se registra como `lastSpeaker`. Todo mensaje siguiente en los 15 segundos dispara una respuesta **inmediata**, cortocircuitando timers y comprobaciones de keyword. Presupuesto: 3 follow-ups por ventana de 60 segundos.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### El cooldown

8 segundos entre dos respuestas en el mismo canal. Rodeado por las menciones y los follow-ups.

---

## Los comportamientos humanos: la concentración variable

Aquí Luna se vuelve interesante. Cada tipo de disparo tiene sus propios **umbrales de concentración**: un retardo mín/máx, una probabilidad de ignorar, y una probabilidad de reaccionar.

| Trigger | Retardo mín | Retardo máx | Ignore | Reacción |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

El cálculo del retardo también tiene en cuenta:
- **La longitud del mensaje**: cuanto más largo el mensaje, más tarda Luna en "leerlo"
- **La inactividad**: si Luna no estuvo activa desde hace 10 minutos, el retardo se multiplica por 2 (simulación del "despertar")
- **El sueño**: en modo `slow`, el retardo se multiplica por 3 a 5

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

Luna puede dormir. Configurable vía `config.yml`:

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

| Modo | Efecto |
|------|-------|
| `sleep` | Solo pasan menciones y MPs |
| `slow` | Retardo ×3-5, reacciones casi nulas |
| `short` | Probabilidad de ignore +30%, reacciones casi nulas |

Durante las horas de sueño, el estado Discord pasa a `invisible`.

---

## Las erratas

Luna puede meter erratas, corregidas tras 2-4 segundos. El layout de teclado es configurable (AZERTY o QWERTY). Lo dejé configurable porque detectas de inmediato un bot que escribe demasiado limpio.

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... todas las teclas adyacentes
};
```

Ejemplo AZERTY: `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`.

Tres estilos de corrección:

| Estilo | Comportamiento |
|-------|-------------|
| `edit` | Edita el mensaje |
| `message` | Nuevo mensaje: `word*` |
| `mixed` | 50/50 aleatorio (defecto) |

---

## Las vacilaciones y los olvidos

**Vacilaciones**: 15% de probabilidad de empezar con una muletilla (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**Olvidos**: incluso tras coincidir con un trigger, Luna puede "olvidar" responder con una probabilidad del 3%. Queda entonces totalmente silenciosa, como si no hubiera visto nada. Me encanta ese comportamiento porque ya viste humanos saltarse un mensaje sin querer.

**Fatiga temática**: si una palabra vuelve demasiado a menudo en los 10 últimos mensajes (umbral: 3 ocurrencias), los retardos se multiplican y la probabilidad de ignore sube 15%.

---

## El realismo en la práctica: cuando da miedo

Sobre el papel, todos esos sistemas (retardos, erratas, vacilaciones, olvidos) parecen gadget. En realidad, puestos juntos, el resultado es alucinante: gente conversando con Luna no sospecha nada. Aquí un intercambio real donde alguien pregunta directamente a Luna si es un bot, y donde la conversación deriva luego a otro tema totalmente distinto, con una naturalidad que da escalofríos. No esperaba que fuera tan creíble en condiciones reales.

![Conversación Discord con Luna: primer intercambio](/images/luna-protocol/realism/realism-01.png)

El tono, las vacilaciones, el ritmo de las respuestas: nada delata un bot. Luna esquiva la pregunta de la edad sin romper nunca el personaje.

![Conversación Discord con Luna: continuación del intercambio](/images/luna-protocol/realism/realism-02.png)

La conversación sigue de forma totalmente fluida, con respuestas cortas y naturales ("okay, okay", "yay", "yayy"): justo el tipo de mensajes que un humano enviaría en Discord.

![Conversación Discord con Luna: deriva del tema](/images/luna-protocol/realism/realism-03.png)

![Conversación Discord con Luna: continuación de la deriva](/images/luna-protocol/realism/realism-04.png)

![Conversación Discord con Luna: fin del intercambio](/images/luna-protocol/realism/realism-05.png)

Lo terrorífico no es solo que Luna "responda": es que **mantiene una conversación**, con opiniones aparentes, réplicas, un hilo de pensamiento coherente de un mensaje a otro. Sin el sistema de disparo, los retardos de concentración y las vacilaciones descritos arriba, esa ilusión se derrumbaría en pocos mensajes.

**Pequeño plot twist**: en los screenshots de arriba, **ambas cuentas que discuten son instancias de Luna**. `PixieGlow` y `Sujet d'SBlow` no son un humano probando un bot: son dos bots hablándose entre ellos, cada uno convencido (en el sentido conductual del término) de discutir con alguien "normal". Si al leer el intercambio de arriba supusiste que uno de los dos interlocutores era humano, felicidades: acabas de caer en la trampa exactamente como cualquiera lo haría en un verdadero servidor Discord.

Es un poco la **dead internet theory** en versión práctica: esa teoría (al origen más bien conspiracionista) postula que una parte creciente del contenido y de las interacciones en línea la generarían bots más que humanos, hasta que el "verdadero" internet humano se habría vuelto minoritario. Largo tiempo considerada exagerada, se vuelve cada vez menos absurda a medida que sistemas como Luna Protocol muestran que no hacen falta muchos medios ni un modelo enorme para simular una presencia humana creíble a gran escala. Dos instancias del mismo bot capaces de mantener una conversación larga sin delatarse nunca dan una muestra bastante concreta de cómo podría verse una web poblada mayormente por bots que hablan entre ellos.

---

## El pipeline LLM: dos modos

### Modo `direct` (defecto)

El bot envía directamente las peticiones a un `llama-server` local en HTTP. El modelo es compartido, con prompt cache y 4 slots concurrentes. Dos procesos PM2: el servidor LLM y el bot cliente.

### Modo `online`

El bot llama cualquier API compatible OpenAI (OpenAI, OpenRouter, Groq, Together...). Solo necesitas una clave API, el LLM corre en el proveedor.

### El streaming en tiempo real

El LLM streamea su respuesta línea por línea (`\n`). Cada línea se trocea en palabras, emitidas una por una en `llmBus.emit("token", word)`. En cada `\n`, se emite un evento `flush`: el bot envía de inmediato el mensaje acumulado. El ritmo sigue directamente el del LLM.

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

La cola de peticiones (`requestQueue`) procesa las peticiones una por una, con limpieza automática cuando la cola supera 100 elementos.

---

## Los mensajes espontáneos

Cada 5 minutos, 12% de probabilidad de que Luna publique un mensaje por iniciativa propia. El servidor se selecciona con un sistema de **peso lineal**: el servidor más activo tiene N× más probabilidades que el último.

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

Se lee el contexto de los 5 últimos mensajes, y Luna se une a la conversación "naturalmente".

---

## La pipeline TTS: mensajes vocales

Con 8% de probabilidad, Luna envía un mensaje vocal en vez de texto. La pipeline completa:

1. **Piper TTS** sintetiza el texto en WAV
2. **ffmpeg** convierte a OGG
3. El waveform se calcula para la vista previa Discord
4. El archivo se sube vía la API Discord CDN
5. El mensaje vocal se envía

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

![TTS Pipeline: del texto sintetizado al mensaje vocal Discord](/images/luna-protocol/10-tts-pipeline.svg)

---

## El antispam y la persistencia

### Antispam

Cola por `channelId:userId`. Un solo mensaje en cola por usuario por canal. Procesado en cuanto termina la respuesta en curso.

### Límites de sesión

Tras 8 intercambios, Luna hace una pausa de 30 segundos. El contador se reinicia tras 3 minutos de inactividad.

### Persistencia automática

Cada mutación de estado emite en `stateBus` → guardado automático (debounce 500ms). Ya no hacen falta llamadas `saveAllState()` manuales. El estado persistido incluye: pendingMessages, paused, cooldowns, timestamps, lastSpeaker, contadores de follow-up.

---

## La configuración hot-reload

Un solo archivo `config.yml`. La mayoría de los valores son **hot-reloadable**: los cambios se tienen en cuenta sin reinicio. Quería poder ajustar los retardos en directo, sin cortar las conversaciones en curso.

| Categoría | Hot-reload |
|-----------|-----------|
| Triggers, keywords, nombres | ✅ |
| Concentración, retardos | ✅ |
| Typos, burst, fatiga | ✅ |
| Sleep schedules | ✅ |
| TTS, voice messages | ✅ |
| Discord token, LLM mode | ❌ (reinicio requerido) |

```typescript
// config.ts: los getters devuelven valores live
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## El dataset: Discord-Dialogues

El modelo está fine-tuneado sobre [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues): **7.3M intercambios**, **17M turnos**, **140M palabras**. Verdaderas conversaciones Discord primavera-verano 2025, filtradas (PII, ToS, bots, comandos). Apache 2.0.

| Métrica | Valor |
|----------|--------|
| Muestras | 7 303 464 |
| Turnos totales | 16 881 010 |
| Palabras totales | 139 922 950 |
| Tokens medios | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

El modelo cuantizado usado es un GGUF (por ejemplo `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Distribución del dataset Discord-Dialogues](/images/luna-protocol/dataset-distribution.svg)

---

![Complete Lifecycle: comportamiento completo del bot del mensaje a la respuesta, incluyendo timers y casos límite](/images/luna-protocol/22-complete-lifecycle.svg)

## Los diagramas de arquitectura

La carpeta `state-machines/` contiene **24 diagramas Mermaid** cubriendo todo el código fuente. Cada diagrama tiene una explicación detallada en lenguaje humano.

Entre los más importantes:

| # | Diagrama | Tipo |
|---|-----------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (completo) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 backends) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

Esos diagramas son una mina de oro para entender el flujo completo: del mensaje entrante a la respuesta, pasando por los timers y los casos límite.

---

## El código de disparo en detalle

El trigger lo evalúa `evaluateMessage()` en `state/trigger.ts`. Aquí la lógica completa:

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

  // ... matching por nombre, keyword, follow-up, random
}
```

El caché de regex (`hasWordCache`) evita recompilar los patrones en cada mensaje.

---

## Las reacciones

Luna reacciona a los mensajes con emojis. 30% de probabilidad de usar un emoji custom del servidor, 70% un emoji unicode. La reacción sale tras el retardo de concentración, con el mismo ritmo desfasado que las respuestas. Me gusta ese desfase porque sientes que se tomó el tiempo de leer.

Los comandos por reacción sobre los mensajes de Luna:
- ❌ → Stop
- ▶️ → Start
- 🗑️ → Clear

---

## El estilo de respuesta

El estilo de respuesta se pondera según la actividad reciente de Luna en el canal:

| Contexto | messageReference | mentionRepliedUser | Peso |
|----------|-----------------|-------------------|-------|
| Frío | true | false | 70% |
| Frío | true | true | 20% |
| Frío | false | false | 10% |
| Activo | true | false | 50% |
| Activo | true | true | 15% |
| Activo | false | false | 30% |
| Activo | false | true | 5% |

En MP, `messageReference` siempre es `false`.

---

## Los mensajes en ráfaga

Con 15% de probabilidad, una respuesta se trocea en 2-3 fragmentos enviados a ritmo humano (1.5-4 segundos entre cada fragmento). Simula alguien que escribe en varias veces.

![Timing Gantt: tiempos de espera reales para los retardos, reacciones, streaming LLM y correcciones](/images/luna-protocol/21-timing-gantt.svg)

---

## El estado dinámico

El estado Discord de Luna alterna entre varios presets configurados, rotando cada 15 minutos. Tipos soportados: Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). Durante el sueño, el estado pasa a `invisible`.

```yaml
dynamic_status_presets:
  - status: online
    text: "avec les pixels"
    type: 0       # Playing
  - status: idle
    text: "du bruit blanc"
    type: 2       # Listening
```

Un jitter aleatorio (×0.5-1.0) evita las rotaciones previsibles. 10% de los intentos se saltan para evitar la repetición.

## El indicador de escritura

Antes de llamar el LLM, Luna llama `startTyping()`. Un `setInterval` refresca el indicador cada 8 segundos durante la generación. Limpiado en el `finally` (`clearInterval`).

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

## La recuperación tras crash

Si el LLM crashea (proceso `llama-server` que muere), Luna detecta el evento vía `llmBus.emit("crash", code)` e intenta reiniciar con un backoff exponencial. Evita los bucles de reinicio infinito.

## Los parámetros LLM

Los parámetros están hardcodeados en `src/config.ts`:

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

El template ChatML (`<|im_start|>/<|im_end|>`) se usa. El número de threads se autodetecta vía `os.cpus().length`.

---

## Puesta en marcha

```bash
npm install
cp config.example.yml config.yml
# editar config.yml
npm run dev                    # dev (hot reload)
npm run build && npm start     # producción
```

| Script | Descripción |
|--------|-------------|
| `build` | Bundle CLI autónomo |
| `start` | Lanza el bot |
| `lint` / `format` / `check` | Biome |
| `test` | Tests (Bun) |
| `download-model` | GGUF desde HuggingFace |
| `diagrams` | Exporta los diagramas Mermaid en SVG/PNG |

### Despliegue PM2

```bash
./start.sh   # lanza llm-server + llm-client bajo PM2
```

---

## Conclusión

Luna Protocol va mucho más allá de un bot Discord con un LLM. Es un **sistema conductual completo** que simula las imperfecciones humanas: los olvidos, las erratas, el sueño, las vacilaciones, la fatiga. Todo arquitecturado alrededor de un bus de eventos tipado, con 24 diagramas Mermaid documentando cada flujo.

El código es open source, el dataset es público, y la configuración es hot-reloadable. Si el tema te interesa, sumérgete en el código: es más accesible de lo que parece. Me sirvió de base para probar muchas ideas sobre el comportamiento, y puedes retomar cada módulo por separado.

| Recurso | Enlace |
|-----------|------|
| Repo GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
