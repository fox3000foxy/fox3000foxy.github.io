---
title: "Luna Protocol: ho creato un bot Discord autonomo che simula un essere umano"
description: "Luna Protocol è un bot Discord interamente autonomo con un LLM locale, capace di conversazione naturale con sonno, refusi, esitazioni, dimenticanze, fatica tematica e messaggi spontanei."
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
author_sig: "hJdBoeQQ1YrrZ5I+fuIgdzrOIxaG7zmxHQv00ORmcH77HR1541b2eIQZx7agOszeneaN9fVajeIyQ+wD/s9d0g=="
---

# Luna Protocol: ho creato un bot Discord autonomo che simula un essere umano

E se un bot Discord potesse **dormire**, fare **refusi**, **esitare**, **dimenticare** di rispondere, e a volte inviarti un messaggio di sua iniziativa? È esattamente ciò che fa **Luna Protocol**: un bot Discord interamente autonomo che fa girare un LLM locale (llama.cpp) e conversa come un essere umano imperfetto.

Luna funziona con trigger contestuali e risposte imperfette volute. Ha un **sistema di trigger prioritario**, **ritardi variabili**, **orari di sonno**, **messaggi spontanei**, e persino una **pipeline TTS** per inviare messaggi vocali. Il tutto configurato via un semplice file `config.yml` hot-reloadable.

In questo articolo, smonto l'architettura completa: dal bus di eventi generico alla pipeline TTS, passando per il sistema di trigger, i componenti umani, e il dataset di fine-tuning.

![Architecture Overview -- componenti globali e flusso di dati](/images/luna-protocol/01-architecture-overview.svg)

---

## L'architettura: un bus di eventi tipizzato

Il cuore di Luna è un **TypedBus**: un bus di eventi generico fortemente tipizzato in TypeScript. È il mattone fondamentale su cui poggia tutto. L'ho costruito così perché volevo evitare dipendenze circolari fin dall'inizio.

```typescript
// bus di eventi tipizzato: on / emit
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

- **`llmBus`**: gestisce i token LLM, gli errori, i crash, il reset
- **`stateBus`**: gestisce i cambi di stato con persistenza automatica

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

Il vantaggio di questo approccio: ogni modulo è **scollegato** dal resto. L'LLM emette token sul bus, il bot li consuma, lo stato si aggiorna automaticamente. Nessuna dipendenza circolare.

---

![Message Processing -- flusso completo di elaborazione di un messaggio](/images/luna-protocol/02-message-processing.svg)

## Il sistema di trigger: chi decide quando Luna risponde?

Ogni messaggio in ingresso è valutato da `evaluateMessage()` che restituisce un `TriggerResult` con una ragione di trigger. L'ordine di priorità è critico:

| # | Ragione | Condizioni | Bypass ignore | Bypass pausa |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | Sì (0%) | Sì |
| 2 | `dm` | DM con `replyInDM = true` | Sì (0%) | No |
| 3 | `name` | "Luna"/"Pixie"/alias (parola intera) | No (8%) | No |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (parola intera) | No (8%) | No |
| 5 | `follow-up` | Bot era ultimo parlante + < 15s + < 3 / 60s | -- | -- |
| 6 | `random` | 1.5% di probabilità sui messaggi non matchati | No (8%) | No |

Il matching è **parola intera** (`\b`): "ai" non matcha "mais", "vrai", "lait".

![Trigger evaluation -- decisione di ingresso per ogni messaggio](/images/luna-protocol/03-trigger-evaluation.svg)

### Il meccanismo di follow-up

Quando Luna risponde a un messaggio, si registra come `lastSpeaker`. Qualsiasi messaggio seguente entro 15 secondi innesca una risposta **immediata**, cortocircuitando timer e verifiche di keyword. Budget: 3 follow-up per finestra di 60 secondi.

```typescript
// follow-up se il bot era l'ultimo a parlare
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### Il cooldown

8 secondi tra due risposte nello stesso canale. Aggirato da menzioni e follow-up.

---

## I comportamenti umani: la concentrazione variabile

È qui che Luna diventa interessante. Ogni tipo di trigger ha le sue **soglie di concentrazione**: un ritardo min/max, una probabilità di ignorare, e una probabilità di reagire.

| Trigger | Ritardo min | Ritardo max | Ignore | Reazione |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

Il calcolo del ritardo tiene anche conto di:
- **La lunghezza del messaggio**: più il messaggio è lungo, più Luna mette tempo a "leggerlo"
- **L'inattività**: se Luna non è stata attiva da 10 minuti, il ritardo è moltiplicato per 2 (simulazione del "risveglio")
- **Il sonno**: in modalità `slow`, il ritardo è moltiplicato per 3 a 5

```typescript
// ritardo umanizzato: lettura, sonno, jitter
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

## Gli orari di sonno

Luna può dormire. Configurabile via `config.yml`:

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
| `sleep` | Passano solo menzioni e DM |
| `slow` | Ritardo ×3-5, reazioni quasi nulle |
| `short` | Probabilità di ignore +30%, reazioni quasi nulle |

Durante le ore di sonno, lo stato Discord passa a `invisible`.

---

## I refusi

Luna può fare refusi, corretti dopo 2-4 secondi. Il layout tastiera è configurabile (AZERTY o QWERTY). L'ho lasciato configurabile perché becchi subito un bot che scrive troppo pulito.

```typescript
// tasti adiacenti AZERTY per refusi realistici
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
| `message` | Nuovo messaggio: `parola*` |
| `mixed` | 50/50 casuale (default) |

---

## Le esitazioni e le dimenticanze

**Esitazioni**: 15% di probabilità di iniziare con una parola di riempimento (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**Dimenticanze**: anche dopo aver matchato un trigger, Luna può "dimenticare" di rispondere con una probabilità del 3%. Resta allora totalmente silenziosa, come se non avesse visto niente. Adoro questo comportamento perché hai già visto umani saltare un messaggio senza farlo apposta.

**Fatica tematica**: se una parola torna troppo spesso negli ultimi 10 messaggi (soglia: 3 occorrenze), i ritardi sono moltiplicati e la probabilità di ignore aumenta del 15%.

---

## Il realismo in pratica: quando diventa inquietante

Sulla carta, tutti questi sistemi (ritardi, refusi, esitazioni, dimenticanze) sembrano gadget. In realtà, messi capo a capo, il risultato è bluffante: persone in conversazione con Luna non sospettano niente. Ecco uno scambio reale dove qualcuno chiede direttamente a Luna se è un bot, e dove la conversazione deriva poi su tutt'altro tema, con una naturalezza che fa venire i brividi. Non mi aspettavo fosse così credibile in condizioni reali.

![Conversazione Discord con Luna: primo scambio](/images/luna-protocol/realism/realism-01.png)

Il tono, le esitazioni, il ritmo delle risposte: niente tradisce un bot. Luna schiva la domanda sull'età senza mai rompere il personaggio.

![Conversazione Discord con Luna: seguito dello scambio](/images/luna-protocol/realism/realism-02.png)

La conversazione continua in modo totalmente fluido, con risposte corte e naturali ("okay, okay", "yay", "yayy"): esattamente il tipo di messaggi che un umano invierebbe su Discord.

![Conversazione Discord con Luna: deriva del tema](/images/luna-protocol/realism/realism-03.png)

![Conversazione Discord con Luna: seguito della deriva](/images/luna-protocol/realism/realism-04.png)

![Conversazione Discord con Luna: fine dello scambio](/images/luna-protocol/realism/realism-05.png)

Ciò che è terrificante, non è solo che Luna "risponde": è che **tiene una conversazione**, con opinioni apparenti, rilanci, un filo di pensiero coerente da un messaggio all'altro. Senza il sistema di trigger, i ritardi di concentrazione e le esitazioni descritti più sopra, questa illusione crollerebbe in pochi messaggi.

**Piccolo plot twist**: negli screenshot qui sopra, **entrambi gli account che discutono sono istanze di Luna**. `PixieGlow` e `Sujet d'SBlow` non sono un umano che testa un bot: sono due bot che parlano tra loro, ognuno persuaso (in senso comportamentale) di discutere con qualcuno di "normale". Se leggendo lo scambio qui sopra hai supposto che uno dei due interlocutori fosse umano, congratulazioni: sei appena caduto nella trappola esattamente come chiunque farebbe su un vero server Discord.

È un po' la **dead internet theory** in versione pratica: questa teoria (all'origine piuttosto cospirazionista) postula che una parte crescente del contenuto e delle interazioni online sarebbe generata da bot invece che da umani, al punto che il "vero" internet umano sarebbe diventato minoritario. A lungo considerata esagerata, diventa sempre meno assurda via via che sistemi come Luna Protocol mostrano che non servono né tanti mezzi né un modello enorme per simulare una presenza umana credibile su larga scala. Due istanze dello stesso bot capaci di tenere una conversazione lunga senza mai tradirsi, danno un'idea abbastanza concreta di come potrebbe essere un web popolato in maggioranza da bot che parlano tra loro.

---

## La pipeline LLM: due modalità

### Modalità `direct` (default)

Il bot invia direttamente le richieste a un `llama-server` locale in HTTP. Il modello è condiviso, con prompt cache e 4 slot concorrenti. Due processi PM2: il server LLM e il client bot.

### Modalità `online`

Il bot chiama qualsiasi API compatibile OpenAI (OpenAI, OpenRouter, Groq, Together...). Ti serve solo una chiave API, l'LLM gira lato fornitore.

### Lo streaming in tempo reale

L'LLM fa stream della sua risposta riga per riga (`\n`). Ogni riga è tagliata in parole, emesse una a una su `llmBus.emit("token", word)`. A ogni `\n`, un evento `flush` è emesso: il bot invia subito il messaggio accumulato. Il ritmo segue direttamente quello dell'LLM.

```typescript
// emette le parole una a una, poi flush a fine riga
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

La coda di richieste (`requestQueue`) elabora le richieste una a una, con pulizia automatica quando la coda supera 100 elementi.

---

## I messaggi spontanei

Ogni 5 minuti, 12% di probabilità che Luna posti un messaggio di sua iniziativa. Il server è selezionato con un sistema di **peso lineare**: il server più attivo ha N volte più probabilità dell'ultimo.

```typescript
// selezione pesata del server più attivo
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

Il contesto degli ultimi 5 messaggi è letto, e Luna si unisce alla conversazione "naturalmente".

---

## La pipeline TTS: messaggi vocali

Con l'8% di probabilità, Luna invia un messaggio vocale invece di testo. La pipeline completa:

1. **Piper TTS** sintetizza il testo in WAV
2. **ffmpeg** converte in OGG
3. Il waveform è calcolato per l'anteprima Discord
4. Il file è caricato via l'API Discord CDN
5. Il messaggio vocale è inviato

```typescript
// testo → WAV Piper → OGG ffmpeg → upload Discord
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

![TTS Pipeline -- dal testo sintetizzato al messaggio vocale Discord](/images/luna-protocol/10-tts-pipeline.svg)

---

## L'anti-spam e la persistenza

### Anti-spam

Coda per `channelId:userId`. Un solo messaggio in coda per utente per canale. Elaborato appena la risposta in corso finisce.

### Limiti di sessione

Dopo 8 scambi, Luna fa una pausa di 30 secondi. Il contatore si azzera dopo 3 minuti di inattività.

### Persistenza automatica

Ogni mutazione di stato emette su `stateBus` → salvataggio automatico (debounce 500ms). Niente più chiamate `saveAllState()` manuali. Lo stato persistito include: pendingMessages, paused, cooldown, timestamp, lastSpeaker, contatori di follow-up.

---

## La configurazione hot-reload

Un solo file `config.yml`. Quasi tutti i valori sono **hot-reloadable**: i cambiamenti sono presi in conto senza riavvio. Volevo poter regolare i ritardi in live, senza tagliare le conversazioni in corso.

| Categoria | Hot-reload |
|-----------|-----------|
| Trigger, keyword, nomi | Sì |
| Concentrazione, ritardi | Sì |
| Typo, burst, fatica | Sì |
| Sleep schedule | Sì |
| TTS, messaggi vocali | Sì |
| Token Discord, modalità LLM | No (serve riavvio) |

```typescript
// config.ts: i getter restituiscono valori live
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

Il modello quantizzato usato è un GGUF (per esempio `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Distribuzione del dataset Discord-Dialogues](/images/luna-protocol/dataset-distribution.svg)

---

![Complete Lifecycle -- comportamento completo del bot dal messaggio alla risposta, inclusi timer e casi limite](/images/luna-protocol/22-complete-lifecycle.svg)

## I diagrammi di architettura

La cartella `state-machines/` contiene **24 diagrammi Mermaid** che coprono l'intero codice sorgente. Ogni diagramma ha una spiegazione dettagliata in linguaggio umano.

Tra i più importanti:

| # | Diagramma | Tipo |
|---|-----------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (completo) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 backend) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

Questi diagrammi sono una miniera d'oro per capire il flusso completo: dal messaggio in ingresso alla risposta, passando per timer e casi limite.

---

## Il codice di trigger in dettaglio

Il trigger è valutato da `evaluateMessage()` in `state/trigger.ts`. Ecco la logica completa:

```typescript
// valuta menzioni, DM, pausa, cooldown, nome, keyword, follow-up
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

  // ... matching per nome, keyword, follow-up, random
}
```

La cache di regex (`hasWordCache`) evita di ricompilare i pattern a ogni messaggio.

---

## Le reazioni

Luna reagisce ai messaggi con emoji. 30% di probabilità di usare un'emoji custom del server, 70% un'emoji unicode. La reazione parte dopo il ritardo di concentrazione, con lo stesso ritmo sfalsato delle risposte. Amo questo sfalsamento perché senti che si è presa il tempo di leggere.

I comandi per reazione sui messaggi di Luna:
- ❌ → Stop
- ▶️ → Start
- 🗑️ → Clear

---

## Lo stile di risposta

Lo stile di risposta è pesato secondo l'attività recente di Luna nel canale:

| Contesto | messageReference | mentionRepliedUser | Peso |
|----------|-----------------|-------------------|-------|
| Freddo | true | false | 70% |
| Freddo | true | true | 20% |
| Freddo | false | false | 10% |
| Attivo | true | false | 50% |
| Attivo | true | true | 15% |
| Attivo | false | false | 30% |
| Attivo | false | true | 5% |

In DM, `messageReference` è sempre `false`.

---

## I messaggi a raffica

Con il 15% di probabilità, una risposta è tagliata in 2-3 frammenti inviati a ritmo umano (1.5-4 secondi tra ogni frammento). Simula qualcuno che digita in più volte.

![Timing Gantt -- tempi di attesa reali per ritardi, reazioni, streaming LLM e correzioni](/images/luna-protocol/21-timing-gantt.svg)

---

## Lo stato dinamico

Lo stato Discord di Luna alterna vari preset configurati, a rotazione ogni 15 minuti. Tipi supportati: Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). Durante il sonno, lo stato passa a `invisible`.

```yaml
dynamic_status_presets:
  - status: online
    text: "avec les pixels"
    type: 0       # Playing
  - status: idle
    text: "du bruit blanc"
    type: 2       # Listening
```

Un jitter casuale (×0.5-1.0) evita rotazioni prevedibili. Il 10% dei tentativi è saltato per evitare ripetizione.

## L'indicatore di digitazione

Prima di chiamare l'LLM, Luna chiama `startTyping()`. Un `setInterval` rinfresca l'indicatore ogni 8 secondi durante la generazione. Pulito nel `finally` (`clearInterval`).

```typescript
// mostra "sta scrivendo" durante la generazione
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

## Il recupero dopo crash

Se l'LLM crasha (processo `llama-server` che muore), Luna rileva l'evento via `llmBus.emit("crash", code)` e prova a riavviare con backoff esponenziale. Evita cicli di riavvio infiniti.

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

Il template ChatML (`<|im_start|>/<|im_end|>`) è usato. Il numero di thread è auto-rilevato via `os.cpus().length`.

---

## Setup

```bash
npm install
cp config.example.yml config.yml
# modifica config.yml
npm run dev                    # dev (hot reload)
npm run build && npm start     # produzione
```

| Script | Descrizione |
|--------|-------------|
| `build` | Bundle CLI autonomo |
| `start` | Lancia il bot |
| `lint` / `format` / `check` | Biome |
| `test` | Test (Bun) |
| `download-model` | GGUF da HuggingFace |
| `diagrams` | Esporta i diagrammi Mermaid in SVG/PNG |

### Deploy PM2

```bash
./start.sh   # lancia llm-server + llm-client sotto PM2
```

---

## Conclusione

Luna Protocol va ben oltre un bot Discord con un LLM. È un **sistema comportamentale completo** che simula le imperfezioni umane: le dimenticanze, i refusi, il sonno, le esitazioni, la fatica. Il tutto architettato intorno a un bus di eventi tipizzato, con 24 diagrammi Mermaid che documentano ogni flusso.

Il codice è open source, il dataset è pubblico, e la configurazione è hot-reloadable. Se il tema ti interessa, tuffati nel codice: è più accessibile di quanto sembri. Me ne sono servito come base per testare molte idee sul comportamento, e puoi riprendere ogni modulo separatamente.

| Risorsa | Link |
|-----------|------|
| Deposito GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
