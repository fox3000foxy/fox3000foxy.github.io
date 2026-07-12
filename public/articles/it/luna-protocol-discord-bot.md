---
title: "Luna Protocol: ho creato un bot Discord autonomo che simula un essere umano"
description: "Luna Protocol è un bot Discord completamente autonomo con LLM locale, in grado di conversazione naturale con sonno, refusi, esitazioni, dimenticanze, fatica tematica e messaggi spontanei."
date: 2026-07-11
tags:
  - discord-bot
  - llm
  - typescript
  - architettura-event-driven
  - intelligenza-artificiale
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "TJh31IUIHudiSZx4y1w9kxZL+ttPcOVB5BTawpONfne29hpe2NKq0I23msTjYzbP++6KFENbokmTU7BxTAbGaQ=="
---

# Luna Protocol: Ho creato un bot Discord autonomo che simula un essere umano
E se un bot Discord potesse **dormire**, fare **errori di battitura**, **esitare**, **dimenticare** di rispondere, e a volte mandarti un messaggio di sua iniziativa? Ecco cosa fa **Luna Protocol**: un bot Discord completamente autonomo che esegue un LLM locale (llama.cpp) e conversa come un essere umano imperfetto.
Nessun prompt rigido, nessuna risposta robotica. Luna ha un **sistema di trigger prioritario**, **ritardi variabili**, **orari di sonno**, **messaggi spontanei**, e persino una **pipeline TTS** per inviare messaggi vocali. Tutto configurabile tramite un semplice file `config.yml` hot-reloadable.
In questo articolo, analizziamo l'architettura completa: dal bus di eventi generico alla pipeline TTS, passando per il sistema di trigger, i componenti umani e il dataset di fine-tuning.
![Panoramica dell'architettura -- componenti globali e flusso dati](/images/luna-protocol/01-architecture-overview.svg)

---

## Architettura: un bus di eventi tipizzato

Il cuore di Luna è un **TypedBus** -- un bus di eventi generico fortemente tipizzato in TypeScript. È il mattone fondamentale su cui tutto si basa.

```typescript
type EventMap = Record<string, unknown[]>;

export class TipodBus<Events extends EventMap> {
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

Da qui derivano due bus principali:

- **`llmBus`** -- gestisce token LLM, errori, crash, reset
- **`stateBus`** -- gestisce le modifiche di stato con persistenza automatica

```
┌─────────────────────────────────────────────────────┐
│                   core/bus.ts                        │
│  TipodBus<K, V> -- on / off / once / emit            │
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

Il vantaggio di questo approccio: ogni modulo è **scollegato** dal resto. Il LLM emette token sul bus, il bot li consuma, lo stato si aggiorna automaticamente. Nessuna dipendenza circolare.

---

![Message Processing -- Flusso completo di elaborazione dei messaggi](/images/luna-protocol/02-message-processing.svg)

## Sistema di trigger: chi decide quando Luna risponde?

Ogni messaggio in entrata viene valutato da `evaluateMessage()` che restituisce un `TriggerResult` con un motivo di attivazione. L'ordine di priorità è critico:

| # | Motivo | Condizioni | Bypass ignore | Bypass pause |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | Sì (0%) | Sì |
| 2 | `dm` | DM con `replyInDM = true` | Sì (0%) | No |
| 3 | `name` | "Luna"/"Pixie"/alias (parola intera) | No (8%) | No |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (parola intera) | No (8%) | No |
| 5 | `follow-up` | Bot era l'ultimo interlocutore + < 15s + < 3 / 60s | -- | -- |
| 6 | `random` | 1.5% di possibilità sui messaggi non corrispondenti | No (8%) | No |

Il matching è a **parola intera** (`\b`) : "ai" non corrisponde a "mais", "vrai", "lait".

![Trigger evaluation -- Decisione di ingresso per ogni messaggio](/images/luna-protocol/03-trigger-evaluation.svg)

### Meccanismo di follow-up

Quando Luna risponde a un messaggio, si registra come `lastSpeaker`. Ogni messaggio successivo entro 15 secondi attiva una risposta **immediata** -- nessun timer, nessuna verifica keyword. Budget: 3 follow-up per finestra di 60 secondi.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### Cooldown

8 secondi tra due risposte nello stesso canale. Eluso da menzioni e follow-up.

---

## Comportamenti umani: concentrazione variabile

È qui che Luna diventa interessante. Ogni tipo di trigger ha le proprie **soglie di concentrazione**: un ritardo min/max, una probabilità di ignorare, e una probabilità di reagire.

| Trigger | Ritardo min | Ritardo max | Ignora | 반응 |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

Il calcolo del ritardo tiene anche conto di:
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
  delay *= 0.5 + Math.random() * 1.5; // jitter aggressivo
  return delay;
}
```

---

## Orari di sonno

Luna può dormire. Configurabile tramite `config.yml`:

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

| Modo | Effetto |
|------|-------|
| `sleep` | Solo menzioni e MP passano |
| `slow` | Ritardo ×3-5, reazioni quasi nulle |
| `short` | Probabilità di ignorare +30%, reazioni quasi nulle |

Durante le ore di sonno, lo stato Discord passa a `invisible`.

---

## Errori di battitura

Luna può fare errori di digitazione -- e correggerli dopo 2-4 secondi. Il layout della tastiera è configurabile (AZERTY o QWERTY).

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... tutti i tasti adiacenti
};
```

Esempio AZERTY: `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`.

Tre stili di correzione:

| Stile | Comportamento |
|-------|-------------|
| `edit` | Modifica il messaggio |
| `message` | Nuovo messaggio: `word*` |
| `mixed` | 50/50 casuale (predefinito) |

---

## Esitazioni e dimenticanze

**Esitazioni**: 15% di possibilità di iniziare con una parola di riempimento (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**Oblì**: anche dopo aver abbinate un trigger, Luna può "dimenticare" di rispondere con una probabilità del 3%. Nessun messaggio, nessuna reazione -- come se non avesse visto nulla.

**Affaticamento tematico**: se una parola ricorre troppo spesso negli ultimi 10 messaggi (soglia: 3 occorrenze), i ritardi vengono moltiplicati e la probabilità di ignorare aumenta del 15%.

---

## Pipeline LLM: due modalità

### Modo `direct` (défaut)

Il bot invia direttamente le richieste a un `llama-server` locale in HTTP. Il modello è condiviso, con prompt cache e 4 slot concorrenti. Due processi PM2: il server LLM e il client bot.

### Modo `online`

Le bot appelle n'importe quelle API compatible OpenAI (OpenAI, OpenRouter, Groq, Together...). Pas de LLM local nécessaire.

### Streaming in tempo reale

Il LLM trasmette la risposta riga per riga (`\n`). Ogni riga viene suddivisa in parole, emesse una per una su `llmBus.emit("token", word)`. Ad ogni `\n`, viene emesso un evento `flush` -- il bot invia immediatamente il messaggio accumulato. Nessun ritardo simulato: il ritmo è quello del LLM.

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

La coda (`requestQueue`) elabora le richieste una per una, con pulizia automatica quando la coda supera 100 elementi.

---

## Messaggi spontanei

Ogni 5 minuti, il 12% di possibilità che Luna pubblichi un messaggio di sua iniziativa. Il server è selezionato da un sistema di **peso lineare**: il server più attivo ha N× più possibilità dell'ultimo.

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

Il contesto degli ultimi 5 messaggi viene letto, e Luna si unisce alla conversazione "naturalmente".

---

## Pipeline TTS: messaggi vocali

Con l'8% di possibilità, Luna invia un messaggio vocale invece del testo. La pipeline completa:

1. **Piper TTS** sintetizza il testo in WAV
2. **ffmpeg** converte in OGG
3. La forma d'onda viene calcolata per l'anteprima Discord
4. Il file viene caricato tramite l'API Discord CDN
5. Il messaggio vocale viene inviato

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

![TTS Pipeline -- Dal testo sintetizzato al messaggio vocale Discord](/images/luna-protocol/10-tts-pipeline.svg)

---

## Anti-spam e persistenza

### Anti-spam

Coda per `channelId:userId`. Un solo messaggio in coda per utente per canale. Elaborato non appena la risposta corrente termina.

### Limites de session

Dopo 8 scambi, Luna fa una pausa di 30 secondi. Il contatore si resetta dopo 3 minuti di inattività.

### Persistence automatique

Ogni mutazione di stato viene emessa su `stateBus` → salvataggio automatico (debounce 500ms). Non servono più chiamate manuali a `saveAllState()`. Lo stato persistente include: pendingMessages, paused, cooldowns, timestamps, lastSpeaker, contatori follow-up.

---

## Configurazione hot-reload

Un solo file `config.yml`. La maggior parte dei valori è **hot-reloadable** -- le modifiche vengono applicate senza riavvio.

| Categoria | Hot-reload |
|-----------|-----------|
| Triggers, keywords, noms | ✅ |
| Concentration, délais | ✅ |
| Typos, burst, fatigue | ✅ |
| Sleep schedules | ✅ |
| TTS, voice messages | ✅ |
| Discord token, LLM mode | ❌ (redémarrage requis) |

```typescript
// config.ts -- i getter restituiscono valori live
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## Dataset: Discord-Dialogues

Il modello è fine-tuned su [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) : **7.3M échanges**, **17M tours**, **140M mots**. Vere conversazioni Discord primavera-estate 2025, filtrate (PII, ToS, bot, comandi). Apache 2.0.

| Metrica | Valore |
|----------|--------|
| Campioni | 7 303 464 |
| Turni totali | 16 881 010 |
| Parole totali | 139 922 950 |
| Token medi | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

Il modello quantizzato utilizzato è un GGUF (per esempio `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Distribuzione del dataset Discord-Dialogues](/images/luna-protocol/dataset-distribution.svg)

---

![Complete Lifecycle -- Comportamento completo del bot dal messaggio alla risposta, incluse timer e casi limite](/images/luna-protocol/22-complete-lifecycle.svg)

## Diagrammi di architettura

La cartella `state-machines/` contiene **24 diagrammi Mermaid** che coprono l'intero codice sorgente. Ogni diagramma ha una spiegazione dettagliata in linguaggio umano.

Parmi les plus importants :

| # | Diagramma | Tipo |
|---|-----------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (complet) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 backends) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

Questi diagrammi sono una miniera d'oro per comprendere il flusso completo: dal messaggio in entrata alla risposta, passando per i timer e i casi limite.

---

## Codice di trigger in dettaglio

Il trigger viene valutato da `evaluateMessage()` in `state/trigger.ts`. Ecco la logica completa:

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

La cache regex (`hasWordCache`) evita di ricompilare i pattern ad ogni messaggio.

---

## Reazioni

Luna reagisce ai messaggi con le emoji. 30% di possibilità di usare un'emoji personalizzata del server, 70% un'emoji unicode. La reazione viene attivata dopo il ritardo di concentrazione, non immediatamente.

Comandi per reazione sui messaggi di Luna:
- ❌ → Stop
- ▶️ → Start
- 🗑️ → Clear

---

## Stile di risposta

Lo stile di risposta è ponderato in base all'attività recente di Luna nel canale:

| Contesto | messageReference | mentionRepliedUser | Peso |
|----------|-----------------|-------------------|-------|
| Freddo | true | false | 70% |
| Freddo | true | true | 20% |
| Freddo | false | false | 10% |
| Attivo | true | false | 50% |
| Attivo | true | true | 15% |
| Attivo | false | false | 30% |
| Attivo | false | true | 5% |

Nelle DM, `messageReference` è sempre `false`.

---

## Messaggi in raffica

Con il 15% di possibilità, una risposta viene suddivisa in 2-3 frammenti inviati a ritmo umano (1.5-4 secondi tra ogni frammento). Simula qualcuno che digita più volte.

![Timing Gantt -- Tempi di attesa reali per ritardi, reazioni, streaming LLM e correzioni](/images/luna-protocol/21-timing-gantt.svg)

---

## Stato dinamico

Lo stato Discord di Luna alterna tra più preset configurati, ruotando ogni 15 minuti. Tipi supportati: Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). Durante il sonno, lo stato passa a `invisible`.

```yaml
dynamic_status_presets:
  - status: online
    text: "avec les pixels"
    type: 0       # Playing
  - status: idle
    text: "du bruit blanc"
    type: 2       # Listening
```

Un jitter casuale (×0.5-1.0) evita rotazioni prevedibili. Il 10% dei tentativi viene saltato per evitare la ripetizione.

## Indicatore di digitazione

Prima di chiamare il LLM, Luna chiama `startTyping()`. Un `setInterval` aggiorna l'indicatore ogni 8 secondi durante la generazione. Pulito nel `finally` (`clearInterval`).

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

## Ripristino dopo crash

Se il LLM crasha (il processo `llama-server` muore), Luna rileva l'evento tramite `llmBus.emit("crash", code)` e tenta di riavviare con backoff esponenziale. Evita loop di riavvio infiniti.

## Parametri LLM

I parametri sono hardcoded in `src/config.ts`:

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

Il template ChatML (`<|im_start|>/<|im_end|>`) è utilizzato. Il numero di thread viene auto-rilevato tramite `os.cpus().length`.

---

## Configurazione

```bash
npm install
cp config.example.yml config.yml
# modifica config.yml
npm run dev                    # dev (hot reload)
npm run build && npm start     # production
```

| Script | Description |
|--------|-------------|
| `build` | Bundle CLI autonomo |
| `start` | Avvia il bot |
| `lint` / `format` / `check` | Biome |
| `test` | Tests (Bun) |
| `download-model` | GGUF from HuggingFace |
| `diagrams` | Esporta i diagrammi Mermaid in SVG/PNG |

### Déploiement PM2

```bash
./start.sh   # avvia llm-server + llm-client sotto PM2
```

---

## Conclusione

Luna Protocol non è solo un bot Discord con un LLM. È un **sistema comportamentale completo** che simula le imperfezioni umane: gli obli, gli errori di digitazione, il sonno, le esitazioni, la fatica. Il tutto architettato attorno a un bus di eventi tipizzato, con 24 diagrammi Mermaid che documentano ogni flusso.

Il codice è open source, il dataset è pubblico, e la configurazione è hot-reloadable. Se l'argomento vi interessa, immergetevi nel codice -- è più accessibile di quanto sembri.

| Risorse | Link |
|-----------|------|
| Repository GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
