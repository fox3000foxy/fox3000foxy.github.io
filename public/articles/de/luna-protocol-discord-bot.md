---
title: "Luna Protocol: Ich habe einen autonomen Discord-Bot gebaut, der einen Menschen simuliert"
description: "Luna Protocol ist ein vollständig autonomer Discord-Bot mit lokalem LLM, fähig zu natürlicher Konversation mit Schlaf, Tippfehlern, Zögern, Vergessen, Themenmüdigkeit und spontanen Nachrichten."
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
author_sig: "QABNLe7eGckLSgJoESyDEGpizTC+Z9jGO3cToWy70QU0SWrLOmr6w3F3OjX2onXXIOag5zFzLBrhCLecfpW3vA=="
---

# Luna Protocol: Ich habe einen autonomen Discord-Bot gebaut, der einen Menschen simuliert

Was, wenn ein Discord-Bot **schlafen**, **Tippfehler machen**, **zögern**, **vergessen** zu antworten und dir manchmal von sich aus eine Nachricht schicken könnte? Genau das macht **Luna Protocol**: Ein vollständig autonomer Discord-Bot, der ein lokales LLM (llama.cpp) laufen lässt und wie ein unvollkommener Mensch konversiert.

Luna funktioniert mit kontextuellen Auslösern und eingestandenen unvollkommenen Antworten. Sie hat ein **prioritäres Auslösersystem**, **variable Verzögerungen**, **Schlafzeiten**, **spontane Nachrichten** und sogar eine **TTS-Pipeline**, um Sprachnachrichten zu schicken. Alles konfiguriert via einer simplen hot-reloadbaren `config.yml`-Datei.

In diesem Artikel zerlege ich die komplette Architektur: Vom generischen Eventbus bis zur TTS-Pipeline, über das Auslösersystem, die menschlichen Komponenten und das Fine-Tuning-Dataset.

![Architecture Overview -- globale Komponenten und Datenflüsse](/images/luna-protocol/01-architecture-overview.svg)

---

## Die Architektur: ein typisierter Eventbus

Das Herz von Luna ist ein **TypedBus**: Ein generischer stark typisierter Eventbus in TypeScript. Die fundamentale Baustelle, auf der alles ruht. Ich habe ihn so gebaut, weil ich zirkuläre Abhängigkeiten von Anfang an vermeiden wollte.

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

Zwei Hauptbusse leiten sich ab:

- **`llmBus`**: Handhabt LLM-Tokens, Fehler, Crashes, Reset
- **`stateBus`**: Handhabt Zustandsänderungen mit automatischer Persistenz

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

Der Vorteil dieses Ansatzes: Jedes Modul ist vom Rest **entkoppelt**. Das LLM emittiert Tokens auf den Bus, der Bot konsumiert sie, der State aktualisiert sich automatisch. Keine zirkuläre Abhängigkeit.

---

![Message Processing -- kompletter Verarbeitungsfluss einer Nachricht](/images/luna-protocol/02-message-processing.svg)

## Das Auslösersystem: wer entscheidet, wann Luna antwortet?

Jede eingehende Nachricht wird von `evaluateMessage()` bewertet, das ein `TriggerResult` mit Auslösegrund zurückgibt. Die Prioritätsreihenfolge ist kritisch:

| # | Grund | Bedingungen | Bypass Ignore | Bypass Pause |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | Ja (0%) | Ja |
| 2 | `dm` | DM mit `replyInDM = true` | Ja (0%) | Nein |
| 3 | `name` | "Luna"/"Pixie"/Alias (ganzes Wort) | Nein (8%) | Nein |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (ganzes Wort) | Nein (8%) | Nein |
| 5 | `follow-up` | Bot war letzter Sprecher + < 15s + < 3 / 60s | -- | -- |
| 6 | `random` | 1.5% Chance auf nicht-treffende Nachrichten | Nein (8%) | Nein |

Das Matching ist **ganzes Wort** (`\b`): "ai" matcht nicht "mais", "vrai", "lait".

![Trigger evaluation -- Eingangsentscheidung für jede Nachricht](/images/luna-protocol/03-trigger-evaluation.svg)

### Der Follow-up-Mechanismus

Wenn Luna auf eine Nachricht antwortet, registriert sie sich als `lastSpeaker`. Jede folgende Nachricht innerhalb von 15 Sekunden triggert eine **sofortige** Antwort und short-circuited Timer und Keywordprüfungen. Budget: 3 Follow-ups pro 60-Sekunden-Fenster.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### Der Cooldown

8 Sekunden zwischen zwei Antworten im selben Channel. Umgangen von Mentions und Follow-ups.

---

## Die menschlichen Verhaltensweisen: die variable Konzentration

Hier wird Luna interessant. Jeder Auslösetyp hat seine eigenen **Konzentrationsschwellen**: Eine Min/Max-Verzögerung, eine Ignore-Chance und eine Reaktionschance.

| Trigger | Min-Verzögerung | Max-Verzögerung | Ignore | Reaktion |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

Die Verzögerungsberechnung berücksichtigt auch:
- **Die Nachrichtenlänge**: Je länger die Nachricht, desto länger braucht Luna zum "Lesen"
- **Die Inaktivität**: Wenn Luna seit 10 Minuten nicht aktiv war, wird die Verzögerung mit 2 multipliziert (Simulation des "Aufwachens")
- **Den Schlaf**: Im `slow`-Modus wird die Verzögerung mit 3 bis 5 multipliziert

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
  delay *= 0.5 + Math.random() * 1.5; // aggressiver Jitter
  return delay;
}
```

---

## Die Schlafzeiten

Luna kann schlafen. Konfigurierbar via `config.yml`:

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

| Modus | Effekt |
|------|-------|
| `sleep` | Nur Mentions und DMs kommen durch |
| `slow` | Verzögerung ×3-5, quasi keine Reaktionen |
| `short` | Ignore-Chance +30%, quasi keine Reaktionen |

Während der Schlafstunden wechselt der Discord-Status auf `invisible`.

---

## Die Tippfehler

Luna kann Tippfehler machen, korrigiert nach 2-4 Sekunden. Das Tastaturlayout ist konfigurierbar (AZERTY oder QWERTY). Ich habe es konfigurierbar gelassen, weil du einen Bot, der zu sauber schreibt, sofort erkennst.

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... alle benachbarten Tasten
};
```

Beispiel AZERTY: `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`.

Drei Korrekturstile:

| Stil | Verhalten |
|-------|-------------|
| `edit` | Editiert die Nachricht |
| `message` | Neue Nachricht: `word*` |
| `mixed` | 50/50 zufällig (Standard) |

---

## Das Zögern und Vergessen

**Zögern**: 15% Chance, mit einem Füllwort zu beginnen (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**Vergessen**: Selbst nach gematchtem Trigger kann Luna mit 3% Wahrscheinlichkeit "vergessen" zu antworten. Sie bleibt dann völlig still, als hätte sie nichts gesehen. Ich liebe dieses Verhalten, weil du schon Menschen gesehen hast, die eine Nachricht unabsichtlich zappen.

**Themenmüdigkeit**: Wenn ein Wort in den letzten 10 Nachrichten zu oft vorkommt (Schwelle: 3 Vorkommen), werden die Verzögerungen multipliziert und die Ignore-Chance steigt um 15%.

---

## Der Realismus in der Praxis: wenn es gruselig wird

Auf dem Papier wirken all diese Systeme (Verzögerungen, Tippfehler, Zögern, Vergessen) wie Gadget. In echt, aneinandergereiht, ist das Ergebnis verblüffend: Leute im Gespräch mit Luna ahnen nichts. Hier ein echter Austausch, wo jemand Luna direkt fragt, ob sie ein Bot ist, und wo das Gespräch danach auf ein ganz anderes Thema abdriftet, mit einer Natürlichkeit, die einem kalt den Rücken runterläuft. Ich hatte nicht erwartet, dass es unter realen Bedingungen so glaubwürdig wäre.

![Discord-Unterhaltung mit Luna, erster Austausch](/images/luna-protocol/realism/realism-01.png)

Ton, Zögern, Antwortrhythmus: Nichts verrät einen Bot. Luna weicht der Altersfrage aus, ohne je die Rolle zu brechen.

![Discord-Unterhaltung mit Luna, Fortsetzung des Austauschs](/images/luna-protocol/realism/realism-02.png)

Das Gespräch läuft völlig flüssig weiter, mit kurzen natürlichen Antworten ("okay, okay", "yay", "yayy"): Genau die Art Nachrichten, die ein Mensch auf Discord schicken würde.

![Discord-Unterhaltung mit Luna, Themenabdrift](/images/luna-protocol/realism/realism-03.png)

![Discord-Unterhaltung mit Luna, Fortsetzung der Abdrift](/images/luna-protocol/realism/realism-04.png)

![Discord-Unterhaltung mit Luna, Ende des Austauschs](/images/luna-protocol/realism/realism-05.png)

Das Erschreckende ist nicht nur, dass Luna "antwortet": Sie **hält ein Gespräch**, mit scheinbaren Meinungen, Nachfragen, einem kohärenten Gedankenfaden von einer Nachricht zur nächsten. Ohne das oben beschriebene Auslösersystem, die Konzentrationsverzögerungen und das Zögern würde diese Illusion nach wenigen Nachrichten zusammenbrechen.

**Kleiner Plot Twist**: In den Screenshots oben **sind beide diskutierenden Konten Luna-Instanzen**. `PixieGlow` und `Sujet d'SBlow` sind kein Mensch, der einen Bot testet: Es sind zwei Bots, die miteinander reden, jeder (im verhaltensorientierten Sinn) überzeugt, mit jemand "Normalem" zu diskutieren. Wenn du beim Lesen des Austauschs oben angenommen hast, einer der zwei Gesprächspartner wäre menschlich, Glückwunsch: Du bist genau in die Falle getappt wie jeder auf einem echten Discord-Server.

Das ist ein bisschen die **Dead-Internet-Theory** in der Praxis: Diese (ursprünglich eher verschwörungstheoretische) Theorie postuliert, dass ein wachsender Anteil der Online-Inhalte und Interaktionen von Bots statt von Menschen generiert würde, bis das "echte" menschliche Internet minoritär geworden wäre. Lange als übertrieben betrachtet, wird sie immer weniger absurd, je mehr Systeme wie Luna Protocol zeigen, dass es weder viele Mittel noch ein riesiges Modell braucht, um eine glaubwürdige menschliche Präsenz in großem Maßstab zu simulieren. Zwei Instanzen desselben Bots, fähig, eine lange Unterhaltung zu halten, ohne sich je zu verraten, geben einen ziemlich konkreten Vorgeschmack darauf, wie ein mehrheitlich von miteinander redenden Bots bevölkertes Web aussehen könnte.

---

## Die LLM-Pipeline: zwei Modi

### `direct`-Modus (Standard)

Der Bot schickt die Requests direkt an einen lokalen `llama-server` per HTTP. Das Modell wird geteilt, mit Prompt Cache und 4 konkurrierenden Slots. Zwei PM2-Prozesse: Der LLM-Server und der Bot-Client.

### `online`-Modus

Der Bot ruft jede OpenAI-kompatible API auf (OpenAI, OpenRouter, Groq, Together...). Du brauchst nur einen API-Schlüssel, das LLM läuft anbieterseitig.

### Das Echtzeit-Streaming

Das LLM streamt seine Antwort Zeile für Zeile (`\n`). Jede Zeile wird in Wörter zerlegt, eines nach dem anderen auf `llmBus.emit("token", word)` emittiert. Bei jedem `\n` wird ein `flush`-Event emittiert: Der Bot schickt sofort die akkumulierte Nachricht. Der Rhythmus folgt direkt dem des LLM.

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

Die Warteschlange (`requestQueue`) verarbeitet die Requests einen nach dem anderen, mit automatischem Aufräumen, wenn die Schlange 100 Elemente übersteigt.

---

## Die spontanen Nachrichten

Alle 5 Minuten 12% Chance, dass Luna von sich aus eine Nachricht postet. Der Server wird von einem **linearen Gewichts**-System gewählt: Der aktivste Server hat N× mehr Chancen als der letzte.

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

Der Kontext der letzten 5 Nachrichten wird gelesen, und Luna steigt "natürlich" ins Gespräch ein.

---

## Die TTS-Pipeline: Sprachnachrichten

Mit 8% Chance schickt Luna eine Sprachnachricht statt Text. Die komplette Pipeline:

1. **Piper TTS** synthetisiert den Text zu WAV
2. **ffmpeg** konvertiert zu OGG
3. Die Waveform wird für die Discord-Vorschau berechnet
4. Die Datei wird via Discord-CDN-API hochgeladen
5. Die Sprachnachricht wird geschickt

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

![TTS Pipeline -- vom synthetisierten Text zur Discord-Sprachnachricht](/images/luna-protocol/10-tts-pipeline.svg)

---

## Der Anti-Spam und die Persistenz

### Anti-Spam

Warteschlange pro `channelId:userId`. Eine einzige Nachricht in der Schlange pro Nutzer pro Channel. Verarbeitet, sobald die laufende Antwort endet.

### Session-Limits

Nach 8 Austauschen macht Luna 30 Sekunden Pause. Der Zähler setzt sich nach 3 Minuten Inaktivität zurück.

### Automatische Persistenz

Jede Zustandsmutation emittiert auf `stateBus` → automatisches Speichern (500ms Debounce). Keine manuellen `saveAllState()`-Aufrufe mehr nötig. Der persistierte Zustand umfasst: pendingMessages, paused, cooldowns, timestamps, lastSpeaker, Follow-up-Zähler.

---

## Die Hot-Reload-Konfiguration

Eine einzige `config.yml`-Datei. Die meisten Werte sind **hot-reloadbar**: Änderungen werden ohne Neustart übernommen. Ich wollte die Verzögerungen live justieren können, ohne laufende Gespräche abzuschneiden.

| Kategorie | Hot-Reload |
|-----------|-----------|
| Trigger, Keywords, Namen | ✅ |
| Konzentration, Verzögerungen | ✅ |
| Typos, Burst, Müdigkeit | ✅ |
| Sleep-Schedules | ✅ |
| TTS, Sprachnachrichten | ✅ |
| Discord-Token, LLM-Modus | ❌ (Neustart nötig) |

```typescript
// config.ts -- die Getter geben Live-Werte zurück
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## Das Dataset: Discord-Dialogues

Das Modell ist auf [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) feingetunt: **7.3M Austausche**, **17M Turns**, **140M Wörter**. Echte Discord-Gespräche Frühling-Sommer 2025, gefiltert (PII, ToS, Bots, Commands). Apache 2.0.

| Metrik | Wert |
|----------|--------|
| Samples | 7 303 464 |
| Turns gesamt | 16 881 010 |
| Wörter gesamt | 139 922 950 |
| Tokens im Schnitt | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

Das genutzte quantisierte Modell ist ein GGUF (zum Beispiel `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Verteilung des Discord-Dialogues-Datasets](/images/luna-protocol/dataset-distribution.svg)

---

![Complete Lifecycle -- komplettes Botverhalten von Nachricht bis Antwort, inklusive Timer und Edge Cases](/images/luna-protocol/22-complete-lifecycle.svg)

## Die Architekturdiagramme

Der `state-machines/`-Ordner enthält **24 Mermaid-Diagramme**, die den gesamten Quellcode abdecken. Jedes Diagramm hat eine detaillierte Erklärung in menschlicher Sprache.

Unter den wichtigsten:

| # | Diagramm | Typ |
|---|-----------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (komplett) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 Backends) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

Diese Diagramme sind eine Goldmine, um den kompletten Fluss zu verstehen: Von der eingehenden Nachricht bis zur Antwort, über Timer und Edge Cases.

---

## Der Triggercode im Detail

Der Trigger wird von `evaluateMessage()` in `state/trigger.ts` evaluiert. Hier die komplette Logik:

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

  // ... Matching nach Name, Keyword, Follow-up, Random
}
```

Der Regex-Cache (`hasWordCache`) vermeidet, die Patterns bei jeder Nachricht neu zu kompilieren.

---

## Die Reaktionen

Luna reagiert mit Emojis auf Nachrichten. 30% Chance, ein Custom-Emoji des Servers zu nutzen, 70% ein Unicode-Emoji. Die Reaktion geht nach der Konzentrationsverzögerung raus, mit demselben versetzten Rhythmus wie die Antworten. Ich mag diese Verschiebung, weil du spürst, dass sie sich Zeit zum Lesen genommen hat.

Die Reaktionscommands auf Lunas Nachrichten:
- ❌ → Stop
- ▶️ → Start
- 🗑️ → Clear

---

## Der Antwortstil

Der Antwortstil wird nach Lunas jüngster Aktivität im Channel gewichtet:

| Kontext | messageReference | mentionRepliedUser | Gewicht |
|----------|-----------------|-------------------|-------|
| Kalt | true | false | 70% |
| Kalt | true | true | 20% |
| Kalt | false | false | 10% |
| Aktiv | true | false | 50% |
| Aktiv | true | true | 15% |
| Aktiv | false | false | 30% |
| Aktiv | false | true | 5% |

In DM ist `messageReference` immer `false`.

---

## Die Burst-Nachrichten

Mit 15% Chance wird eine Antwort in 2-3 Fragmente zerlegt, im menschlichen Rhythmus geschickt (1.5-4 Sekunden zwischen den Fragmenten). Simuliert jemanden, der in mehreren Schüben tippt.

![Timing Gantt -- reale Wartezeiten für Verzögerungen, Reaktionen, LLM-Streaming und Korrekturen](/images/luna-protocol/21-timing-gantt.svg)

---

## Der dynamische Status

Lunas Discord-Status alterniert zwischen mehreren konfigurierten Presets, rotierend alle 15 Minuten. Unterstützte Typen: Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). Während des Schlafs wechselt der Status auf `invisible`.

```yaml
dynamic_status_presets:
  - status: online
    text: "mit den Pixeln"
    type: 0       # Playing
  - status: idle
    text: "weißem Rauschen"
    type: 2       # Listening
```

Ein zufälliger Jitter (×0.5-1.0) vermeidet vorhersehbare Rotationen. 10% der Versuche werden übersprungen, um Wiederholung zu vermeiden.

## Der Tippindikator

Vor dem LLM-Call ruft Luna `startTyping()` auf. Ein `setInterval` frischt den Indikator alle 8 Sekunden während der Generierung auf. Aufgeräumt im `finally` (`clearInterval`).

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

## Die Crash-Recovery

Wenn das LLM crasht (`llama-server`-Prozess stirbt), erkennt Luna das Event via `llmBus.emit("crash", code)` und versucht einen Neustart mit exponentiellem Backoff. Vermeidet endlose Neustartschleifen.

## Die LLM-Parameter

Die Parameter sind in `src/config.ts` hardcoded:

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

Das ChatML-Template (`<|im_start|>/<|im_end|>`) wird genutzt. Die Threadzahl wird via `os.cpus().length` autodetekiert.

---

## Einrichtung

```bash
npm install
cp config.example.yml config.yml
# config.yml editieren
npm run dev                    # dev (hot reload)
npm run build && npm start     # Produktion
```

| Skript | Beschreibung |
|--------|-------------|
| `build` | Autonomes CLI-Bundle |
| `start` | Startet den Bot |
| `lint` / `format` / `check` | Biome |
| `test` | Tests (Bun) |
| `download-model` | GGUF von HuggingFace |
| `diagrams` | Exportiert Mermaid-Diagramme als SVG/PNG |

### PM2-Deployment

```bash
./start.sh   # startet llm-server + llm-client unter PM2
```

---

## Fazit

Luna Protocol geht weit über einen Discord-Bot mit LLM hinaus. Es ist ein **komplettes Verhaltenssystem**, das menschliche Unvollkommenheiten simuliert: Vergessen, Tippfehler, Schlaf, Zögern, Müdigkeit. Das Ganze architekturiert um einen typisierten Eventbus, mit 24 Mermaid-Diagrammen, die jeden Fluss dokumentieren.

Der Code ist Open Source, das Dataset ist öffentlich, und die Konfiguration ist hot-reloadbar. Wenn dich das Thema interessiert, tauch in den Code ein: Es ist zugänglicher, als es scheint. Ich habe es als Basis genutzt, um viele Ideen über Verhalten zu testen, und du kannst jedes Modul separat wiederverwenden.

| Ressource | Link |
|-----------|------|
| GitHub-Repo | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
