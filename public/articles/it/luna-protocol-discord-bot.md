---
title: "Luna Protocol: ho creato un bot Discord autonomo che simula un essere umano"
description: "Luna Protocol è un bot Discord completamente autonomo dotato di un LLM locale, capace di conversazione naturale con sonno, errori di battitura, esitazioni, dimenticanze, stanchezza tematica e messaggi spontanei."
date: 2026-07-11
tags:
  - discord-bot
  - llm
  - typescript
  - architettura-eventi
  - intelligenza-artificiale
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "2I0XSqzmOJ+SAU08QY8cgdiobxsBrOG4hw1X7PXjOEUceai5AR5sqzrHFa05uEuSrmiHVGzBup6rjlKjyVkaAA=="
---

# Luna Protocol: ho creato un bot Discord autonomo che simula un essere umano

E se un bot Discord potesse **dormire**, fare **errori di battitura**, **esitare**, **dimenticare** di rispondere, e qualche volta inviarvi un messaggio di propria iniziativa? Questo è esattamente ciò che fa **Luna Protocol**: un bot Discord completamente autonomo che fa girare un LLM locale (llama.cpp) e conversa come un essere umano imperfetto.

Niente prompt rigidi, niente risposte robotiche. Luna ha un **sistema di attivazione prioritario**, **tempi di attesa variabili**, **orari di sonno**, **messaggi spontanei**, e persino una **pipeline TTS** per inviare messaggi vocali. Il tutto configurato tramite un semplice file `config.yml` hot-reloadable.

In questo articolo, analizziamo l'architettura completa: dal bus di eventi generico alla pipeline TTS, passando per il sistema di attivazione, i componenti umani e il dataset di fine-tuning.

![Schema Architettura -- componenti globali e flusso di dati](/images/luna-protocol/01-architecture-overview.svg)

---

## L'architettura: un bus di eventi tipizzato

Il cuore di Luna è un **TypedBus** -- un bus di eventi generico fortemente tipizzato in TypeScript. È il mattone fondamentale su cui tutto si basa.

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

Due bus principali ne derivano:

- **`llmBus`** -- gestisce i token LLM, gli errori, i crash, il reset
- **`stateBus`** -- gestisce i cambiamenti di stato con persistenza automatica

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

Il vantaggio di questo approccio: ogni modulo è **disconnesso** dal resto. Il LLM emette token sul bus, il bot li consuma, lo stato si aggiorna automaticamente. Nessuna dipendenza circolare.

---

![Elaborazione Messaggi -- flusso completo di elaborazione di un messaggio](/images/luna-protocol/02-message-processing.svg)

## Il sistema di attivazione: chi decide quando Luna risponde?

Ogni messaggio in entrata viene valutato da `evaluateMessage()` che restituisce un `TriggerResult` con una ragione di attivazione. L'ordine di priorità è critico:

| # | Ragione | Condizioni | Bypass ignore | Bypass pausa |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | Sì (0%) | Sì |
| 2 | `dm` | MP con `replyInDM = true` | Sì (0%) | No |
| 3 | `name` | "Luna"/"Pixie"/alias (parola intera) | No (8%) | No |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (parola intera) | No (8%) | No |
| 5 | `follow-up` | Bot era ultimo interlocutore + < 15s + < 3 / 60s | -- | -- |
| 6 | `random` | 1.5% di probabilità sui messaggi non corrispondenti | No (8%) | No |

Il matching è **parola intera** (`\b`): "ai" non corrisponde a "mais", "vrai", "lait".

![Valutazione Trigger -- decisione di ingresso per ogni messaggio](/images/luna-protocol/03-trigger-evaluation.svg)

### Il meccanismo di follow-up

Quando Luna risponde a un messaggio, si registra come `lastSpeaker`. Qualsiasi messaggio successivo entro 15 secondi attiva una risposta **immediata** -- nessun timer, nessuna verifica di keyword. Budget: 3 follow-up per finestra di 60 secondi.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### Il cooldown

8 secondi tra due risposte nello stesso canale. Ignorato dalle menzioni e dai follow-up.

---

## I comportamenti umani: la concentrazione variabile

È qui che Luna diventa interessante. Ogni tipo di attivazione ha le proprie **soglie di concentrazione**: un ritardo minimo/massimo, una probabilità di ignorare e una probabilità di reagire.

| Trigger | Ritardo min | Ritardo max | Ignora | Reazione |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

Il calcolo del ritardo tiene conto anche di:
- **La lunghezza del messaggio**: più il messaggio è lungo, più Luna impiega tempo a "leggere"
- **L'inattività**: se Luna non è stata attiva per 10 minuti, il ritardo viene moltiplicato per 2 (simulazione del "risveglio")
- **Il sonno**: in modalità `slow`, il ritardo viene moltiplicato per 3 a 5

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

## Gli orari di sonno

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

| Modalità | Effetto |
|------|-------|
| `sleep` | Solo le menzioni e i MP passano |
| `slow` | Ritardo ×3-5, reazioni quasi nulle |
| `short` | Probabilità di ignore +30%, reazioni quasi nulle |

Durante le ore di sonno, lo stato Discord passa a `invisible`.

---

## Gli errori di battitura

Luna può fare errori di battitura -- e correggerli dopo 2-4 secondi. Il layout della tastiera è configurabile (AZERTY o QWERTY).

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... toutes les touches adjacentes
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

## Le esitazioni e le dimenticanze

**Esitazioni**: 15% di probabilità di iniziare con una parola di riempimento (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**Dimenticanze**: anche dopo aver matchato un trigger, Luna può "dimenticare" di rispondere con una probabilità del 3%. Nessun messaggio, nessuna reazione -- come se non avesse visto nulla.

**Stanchezza tematica**: se una parola ritorna troppo spesso negli ultimi 10 messaggi (soglia: 3 occorrenze), i ritardi vengono moltiplicati e la probabilità di ignore aumenta del 15%.

---

## Il realismo in pratica: quando diventa inquietante

Sulla carta, tutti questi sistemi (ritardi, refusi, esitazioni, dimenticanze) sembrano trovate. Nella pratica, messi insieme, il risultato è sorprendente -- al punto che le persone che parlano con Luna non sospettano nulla. Ecco uno scambio reale in cui qualcuno chiede direttamente a Luna se è un bot, e la conversazione poi scivola su un argomento completamente diverso con una naturalezza che fa venire i brividi.

![Conversazione Discord con Luna -- primo scambio](/images/luna-protocol/realism/realism-01.png)

Il tono, le esitazioni, il ritmo delle risposte -- niente tradisce un bot. Luna schiva la domanda sull'età senza mai uscire dal personaggio.

La conversazione prosegue in modo del tutto naturale, con risposte brevi e umane ("okay, okay", "yay", "yayy") -- esattamente il tipo di messaggi che una persona invierebbe su Discord.

![Conversazione Discord con Luna -- continua](/images/luna-protocol/realism/realism-02.png)

![Conversazione Discord con Luna -- cambio di argomento](/images/luna-protocol/realism/realism-03.png)

![Conversazione Discord con Luna -- il cambio di argomento prosegue](/images/luna-protocol/realism/realism-04.png)

![Conversazione Discord con Luna -- fine dello scambio](/images/luna-protocol/realism/realism-05.png)

Ciò che è inquietante non è solo che Luna "risponde" -- è che **sostiene una conversazione**, con opinioni apparenti, rilanci e un filo di pensiero coerente da un messaggio all'altro. Senza il sistema di trigger, i ritardi di concentrazione e le esitazioni descritti sopra, questa illusione crollerebbe dopo pochi messaggi.

---

## La pipeline LLM: due modalità

### Modalità `direct` (predefinita)

Il bot invia direttamente le richieste a un `llama-server` locale in HTTP. Il modello è condiviso, con prompt cache e 4 slot concorrenti. Due processi PM2: il server LLM e il client bot.

### Modalità `online`

Il bot chiama qualsiasi API compatibile OpenAI (OpenAI, OpenRouter, Groq, Together...). Nessun LLM locale necessario.

### Lo streaming in tempo reale

Il LLM trasmette la risposta riga per riga (`\n`). Ogni riga viene suddivisa in parole, emesse una per una su `llmBus.emit("token", word)`. A ogni `\n`, viene emesso un evento `flush` -- il bot invia immediatamente il messaggio accumulato. Nessun ritardo simulato: il ritmo è quello del LLM.

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

La coda (`requestQueue`) elabora le richieste una per una, con pulizia automatica quando la coda supera i 100 elementi.

---

## I messaggi spontanei

Ogni 5 minuti, 12% di probabilità che Luna pubblichi un messaggio di propria iniziativa. Il server viene selezionato tramite un sistema di **peso lineare**: il server più attivo ha N× più probabilità dell'ultimo.

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

Viene letto il contesto degli ultimi 5 messaggi e Luna si unisce "naturalmente" alla conversazione.

---

## La pipeline TTS: messaggi vocali

Con l'8% di probabilità, Luna invia un messaggio vocale invece del testo. La pipeline completa:

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

![Pipeline TTS -- dal testo sintetizzato al messaggio vocale Discord](/images/luna-protocol/10-tts-pipeline.svg)

---

## L'anti-spam e la persistenza

### Anti-spam

Coda per `channelId:userId`. Un solo messaggio in coda per utente per canale. Elaborato non appena la risposta in corso termina.

### Limiti di sessione

Dopo 8 scambi, Luna fa una pausa di 30 secondi. Il contatore si resetta dopo 3 minuti di inattività.

### Persistenza automatica

Ogni mutazione di stato emette su `stateBus` → salvataggio automatico (debounce 500ms). Niente più chiamate `saveAllState()` manuali. Lo stato persistito include: pendingMessages, paused, cooldowns, timestamps, lastSpeaker, contatori di follow-up.

---

## La configurazione hot-reload

Un singolo file `config.yml`. La maggior parte dei valori sono **hot-reloadable** -- le modifiche vengono applicate senza riavvio.

| Categoria | Hot-reload |
|-----------|-----------|
| Trigger, keywords, nomi | ✅ |
| Concentrazione, ritardi | ✅ |
| Errori di battitura, burst, stanchezza | ✅ |
| Orari di sonno | ✅ |
| TTS, messaggi vocali | ✅ |
| Discord token, modalità LLM | ❌ (riavvio richiesto) |

```typescript
// config.ts -- i getter restituiscono valori live
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## Il dataset: Discord-Dialogues

Il modello è fine-tunato su [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues): **7.3M scambi**, **17M turni**, **140M parole**. Vere conversazioni Discord primavera-estate 2025, filtrate (PII, ToS, bot, comandi). Apache 2.0.

| Metrica | Valore |
|----------|--------|
| Campioni | 7 303 464 |
| Turni totali | 16 881 010 |
| Parole totali | 139 922 950 |
| Token medi | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

Il modello quantizzato utilizzato è un GGUF (ad esempio `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Distribuzione del dataset Discord-Dialogues](/images/luna-protocol/dataset-distribution.svg)

---

![Ciclo di Vita Completo -- comportamento completo del bot dal messaggio alla risposta, inclusi timer e casi limite](/images/luna-protocol/22-complete-lifecycle.svg)

## I diagrammi di architettura

La cartella `state-machines/` contiene **24 diagrammi Mermaid** che coprono l'intero codice sorgente. Ogni diagramma ha una spiegazione dettagliata in linguaggio umano.

Tra i più importanti:

| # | Diagramma | Tipo |
|---|-----------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (completo) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 backends) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

Questi diagrammi sono una miniera d'oro per comprendere il flusso completo: dal messaggio in entrata alla risposta, passando per i timer e i casi limite.

---

## Il codice di attivazione in dettaglio

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

La cache delle regex (`hasWordCache`) evita di ricompilare i pattern ad ogni messaggio.

---

## Le reazioni

Luna reagisce ai messaggi con emoji. 30% di probabilità di usare un'emoji personalizzata del server, 70% un'emoji unicode. La reazione viene attivata dopo il ritardo di concentrazione, non immediatamente.

I comandi tramite reazione sui messaggi di Luna:
- ❌ → Stop
- ▶️ → Start
- 🗑️ → Clear

---

## Lo stile di risposta

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

In MP, `messageReference` è sempre `false`.

---

## I messaggi in raffica

Con il 15% di probabilità, una risposta viene suddivisa in 2-3 frammenti inviati a ritmo umano (1.5-4 secondi tra ogni frammento). Simula qualcuno che scrive in più volte.

![Diagramma Temporale Gantt -- tempi di attesa reali per ritardi, reazioni, streaming LLM e correzioni](/images/luna-protocol/21-timing-gantt.svg)

---

## Lo stato dinamico

Lo stato Discord di Luna alterna tra diversi preset configurati, ruotando ogni 15 minuti. Tipi supportati: Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). Durante il sonno, lo stato passa a `invisible`.

```yaml
dynamic_status_presets:
  - status: online
    text: "con i pixel"
    type: 0       # Playing
  - status: idle
    text: "rumore bianco"
    type: 2       # Listening
```

Un jitter casuale (×0.5-1.0) evita rotazioni prevedibili. Il 10% dei tentativi viene saltato per evitare ripetizioni.

## L'indicatore di digitazione

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

## Il recupero dopo un crash

Se il LLM crasha (processo `llama-server` che muore), Luna rileva l'evento tramite `llmBus.emit("crash", code)` e tenta di riavviare con un backoff esponenziale. Evita i loop di riavvio infiniti.

## I parametri LLM

I parametri sono hardcodati in `src/config.ts`:

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

Il template ChatML (`<|im_start|>/<|im_end|>`) viene utilizzato. Il numero di thread viene rilevato automaticamente tramite `os.cpus().length`.

---

## Configurazione

```bash
npm install
cp config.example.yml config.yml
# editare config.yml
npm run dev                    # dev (hot reload)
npm run build && npm start     # produzione
```

| Script | Descrizione |
|--------|-------------|
| `build` | Bundle CLI autonomo |
| `start` | Avvia il bot |
| `lint` / `format` / `check` | Biome |
| `test` | Test (Bun) |
| `download-model` | GGUF da HuggingFace |
| `diagrams` | Esporta i diagrammi Mermaid in SVG/PNG |

### Deployment PM2

```bash
./start.sh   # avvia llm-server + llm-client sotto PM2
```

---

## Conclusione

Luna Protocol non è solo un bot Discord con un LLM. È un **sistema comportamentale completo** che simula le imperfezioni umane: le dimenticanze, gli errori di battitura, il sonno, le esitazioni, la stanchezza. Il tutto architettato attorno a un bus di eventi tipizzato, con 24 diagrammi Mermaid che documentano ogni flusso.

Il codice è open source, il dataset è pubblico e la configurazione è hot-reloadable. Se l'argomento vi interessa, immergetevi nel codice -- è più accessibile di quanto sembri.

| Risorsa | Link |
|-----------|------|
| Repository GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
