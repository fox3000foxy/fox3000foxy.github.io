---
title: "Luna Protocol: Ich habe einen autonomen Discord-Bot erstellt, der einen Menschen simuliert"
description: "Luna Protocol ist ein vollständig autonomer Discord-Bot mit lokalem LLM, der natürliche Unterhaltungen mit Schlaf, Tippfehlern, Zögern, Vergesslichkeit, thematischer Müdigkeit und spontanen Nachrichten führen kann."
date: 2026-07-11
tags:
  - discord-bot
  - llm
  - typescript
  - ereignisgesteuerte-architektur
  - kuenstliche-intelligenz
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "ggSUsi3C2dtyK4j10whsNx7BJPTIa6sbCvTiGogchE9+cHrLCqWio6XL2xJkaUOy1zZYEG5VXequ+y3IqBLYEQ=="
---

# Luna Protocol: Ich habe einen autonomen Discord-Bot erstellt, der einen Menschen simuliert
Was wäre, wenn ein Discord-Bot **schlafen**, **Tippfehler machen**, **zögern**, **vergessen** zu antworten und manchmal von sich aus eine Nachricht senden könnte? Genau das macht **Luna Protocol**: Ein komplett autonomer Discord-Bot, der ein lokales LLM (llama.cpp) betreibt und wie ein fehlerhafter Mensch konversiert.
Keine starren Prompts, keine机器人ischen Antworten. Luna hat ein **prioritätsbasiertes Trigger-System**, **variable Verzögerungen**, **Schlafzeiten**, **spontane Nachrichten** und sogar eine **TTS-Pipeline** für Sprachnachrichten. Alles konfigurierbar über eine einzige `config.yml`-Datei mit Hot-Reload.
In diesem Artikel zerlegen wir die vollständige Architektur: vom generischen Ereignisbus über die TTS-Pipeline bis hin zum Trigger-System, den menschlichen Komponenten und dem Fine-Tuning-Datensatz.
![Architekturübersicht -- globale Komponenten und Datenfluss](/images/luna-protocol/01-architecture-overview.svg)

---

## Architektur: ein typisierter Ereignisbus

Das Herz von Luna ist ein **TypdBus** -- ein stark typisierter generischer Ereignisbus in TypScript. Es ist der grundlegende Baustein, auf dem alles basiert.

```typescript
type EventMap = Record<string, unknown[]>;

export class TypdBus<Events extends EventMap> {
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

Daraus ergeben sich zwei Hauptbusse:

- **`llmBus`** -- verwaltet LLM-Tokens, Fehler, Abstürze, Neustarts
- **`stateBus`** -- verwaltet Statusänderungen mit automatischer Persistenz

```
┌─────────────────────────────────────────────────────┐
│                   core/bus.ts                        │
│  TypdBus<K, V> -- on / off / once / emit            │
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

Der Vorteil dieses Ansatzes: Jedes Modul ist vom Rest **getrennt**. Das LLM sendet Tokens über den Bus, der Bot verbraucht sie, der Status aktualisiert sich automatisch. Keine zirkulären Abhängigkeiten.

---

![Message Processing -- vollständiger Ablauf der Nachrichtenverarbeitung](/images/luna-protocol/02-message-processing.svg)

## Auslösesystem: Wer entscheidet wann Luna antwortet?

Jede eingehende Nachricht wird von `evaluateMessage()` ausgewertet, das ein `TriggerResult` mit einem Auslösgrund zurückgibt. Die Prioritätsreihenfolge ist entscheidend:

| # | Grund | Bedingungen | Bypass ignore | Bypass pause |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | Ja (0%) | Ja |
| 2 | `dm` | DM mit `replyInDM = true` | Ja (0%) | Nein |
| 3 | `name` | "Luna"/"Pixie"/alias (ganzes Wort) | Nein (8%) | Nein |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (ganzes Wort) | Nein (8%) | Nein |
| 5 | `follow-up` | Bot war letzter Sprecher + < 15s + < 3 / 60s | -- | -- |
| 6 | `random` | 1.5% Chance bei nicht übereinstimmenden Nachrichten | Nein (8%) | Nein |

Das Matching ist **ganzes Wort** (`\b`) : "ai" stimmt nicht mit "aber", "wahr", "Milch" überein.

![Trigger evaluation -- Entscheidungslogik für jede Nachricht](/images/luna-protocol/03-trigger-evaluation.svg)

### Follow-up-Mechanismus

Wenn Luna auf eine Nachricht antwortet, registriert sie sich als `lastSpeaker`. Jede folgende Nachricht innerhalb von 15 Sekunden löst eine **sofortige** Antwort aus -- kein Timer, keine Keyword-Prüfung. Budget: 3 Follow-ups pro 60-Sekunden-Fenster.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### Abklingzeit

8 Sekunden zwischen zwei Antworten im selben Kanal. Umgeht durch Erwähnungen und Follow-ups.

---

## Menschliche Verhaltensweisen: variable Konzentration

Hier wird Luna interessant. Jede Auslöseart hat eigene **Konzentrationsschwellen**: eine min/max-Verzögerung, eine Ignorierwahrscheinlichkeit und eine Reaktionswahrscheinlichkeit.

| Trigger | Min. Verzögerung | Max. Verzögerung | Ignorieren | Reaktion |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

Die Berechnung der Verzögerung berücksichtigt auch:
- **Die Nachrichtenlänge**: Je länger die Nachricht, desto länger braucht Luna zum "Lesen"
- **Die Inaktivität**: Wenn Luna 10 Minuten lang nicht aktiv war, wird die Verzögerung mit 2 multipliziert (Simulation des "Aufwachens")
- **Der Schlaf**: Im `slow`-Modus wird die Verzögerung mit 3 bis 5 multipliziert

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
  delay *= 0.5 + Math.random() * 1.5; // agressiver Jitter
  return delay;
}
```

---

## Schlafzeiten

Luna kann schlafen. Konfigurierbar über `config.yml`:

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
| `sleep` | Nur Erwähnungen und DMs werden beantwortet |
| `slow` | Verzögerung ×3-5, Reaktionen fast null |
| `short` | Ignorierwahrscheinlichkeit +30%, Reaktionen fast null |

Während der Schlafzeiten wechselt der Discord-Status auf `invisible`.

---

## Tippfehler

Luna kann Tippfehler machen -- und diese nach 2-4 Sekunden korrigieren. Das Tastaturlayout ist konfigurierbar (AZERTY oder QWERTY).

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... alle benachbarten Tasten
};
```

AZERTY-Beispiel: `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`.

Drei Korrekturstile:

| Stil | Verhalten |
|-------|-------------|
| `edit` | Nachricht bearbeiten |
| `message` | Neue Nachricht: `word*` |
| `mixed` | 50/50 zufällig (Standard) |

---

## Zögern und Vergesslichkeit

**Hesitationen**: 15% Chance, mit einem Füllwort zu beginnen (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**Vergesslichkeit**: Selbst nach einem Trigger-Match kann Luna "vergessen" zu antworten, mit einer Wahrscheinlichkeit von 3%. Keine Nachricht, keine Reaktion -- als hätte sie nichts gesehen.

**Thematische Müdigkeit**: Wenn ein Wort in den letzten 10 Nachrichten zu oft vorkommt (Schwelle: 3 Vorkommen), werden die Verzögerungen multipliziert und die Ignorierwahrscheinlichkeit um 15% erhöht.

---

## Die LLM-Pipeline: zwei Modi

### Modus `direct` (Standard)

Der Bot sendet Anfragen direkt an einen lokalen `llama-server` über HTTP. Das Modusll ist geteilt, mit Prompt-Cache und 4 gleichzeitigen Slots. Zwei PM2-Prozesse: der LLM-Server und der Bot-Client.

### Modus `online`

Der Bot ruft jede OpenAI-kompatible API auf (OpenAI, OpenRouter, Groq, Together...). Kein lokales LLM nötig.

### Echtzeit-Streaming

Das LLM streamt seine Antwort Zeile für Zeile (`\n`). Jede Zeile wird in Wörter aufgeteilt und einzeln über `llmBus.emit("token", word)`. Bei jedem `\n` wird ein `flush`-Ereignis ausgelöst -- der Bot sendet sofort die kumulierte Nachricht. Keine simulierte Verzögerung: Das Tempo ist das des LLM.

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

Die Warteschlange (`requestQueue`) verarbeitet Anfragen nacheinander mit automatischer Bereinigung bei mehr als 100 Elementen.

---

## Spontane Nachrichten

Alle 5 Minuten gibt es 12% Chance, dass Luna eine Nachricht aus eigenem Antrieb postet. Der Server wird durch ein System **linearer Gewichtung** ausgewählt: Der aktivste Server hat N× mehr Chancen als der letzte.

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

Der Kontext der letzten 5 Nachrichten wird gelesen, und Luna steigt "natürlich" in das Gespräch ein.

---

## Die TTS-Pipeline: Sprachnachrichten

Mit 8% Wahrscheinlichkeit sendet Luna eine Sprachnachricht statt Text. Die vollständige Pipeline:

1. **Piper TTS** synthetisiert den Text als WAV
2. **ffmpeg** konvertiert zu OGG
3. Die Wellenform wird für Discord-Vorschau berechnet
4. Die Datei wird über die Discord CDN API hochgeladen
5. Die Sprachnachricht wird gesendet

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

## Anti-Spam und Persistenz

### Anti-Spam

Warteschlange pro `channelId:userId`. Nur eine Nachricht pro Benutzer und Kanal in der Warteschlange. Wird verarbeitet, sobald die aktuelle Antwort fertig ist.

### Sitzungslimits

Nach 8 Austauschen macht Luna eine 30-Sekunden-Pause. Der Zähler wird nach 3 Minuten Inaktivität zurückgesetzt.

### Automatische Persistenz

Jede Statusänderung wird über `stateBus` emittiert → automatische Speicherung (Debounce 500ms). Keine manuellen `saveAllState()`-Aufrufe mehr nötig. Der persistierte Status umfasst: pendingMessages, paused, cooldowns, timestamps, lastSpeaker, Follow-up-Zähler.

---

## Hot-Reload-Konfiguration

Eine einzige `config.yml`-Datei. Die meisten Werte sind **hot-reloadable** -- Änderungen werden ohne Neustart übernommen.

| Kategorie | Hot-reload |
|-----------|-----------|
| Triggers, keywords, Noms | ✅ |
| Konzentration, Verzögerungen | ✅ |
| Typos, Burst, Müdigkeit | ✅ |
| Schlafzeiten | ✅ |
| TTS, Sprachnachrichten | ✅ |
| Discord token, LLM-Modus | ❌ (Neustart erforderlich) |

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

Das Modell ist auf [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) fine-tuned: **7.3M Austausche**, **17M Runden**, **140M Wörter**. Echte Discord-Gespräche Frühling-Sommer 2025, gefiltert (PII, ToS, Bots, Befehle). Apache 2.0.

| Metrik | Wert |
|----------|--------|
| Stichproben | 7 303 464 |
| Gesamtrunden | 16 881 010 |
| Gesamtwörter | 139 922 950 |
| Ø Tokens | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

Das verwendete quantisierte Modusll ist ein GGUF (z.B. `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Verteilung des Discord-Dialogues-Datensatzes](/images/luna-protocol/dataset-distribution.svg)

---

![Complete Lifecycle -- vollständiges Bot-Verhalten von der Nachricht bis zur Antwort, einschließlich Timer und Grenzfälle](/images/luna-protocol/22-complete-lifecycle.svg)

## Architekturdiagramme

Der Ordner `state-machines/` enthält **24 Mermaid-Diagramm**, die den gesamten Quellcode abdecken. Jedes Diagramm hat eine detaillierte Erklärung in menschlicher Sprache.

Darunter die wichtigsten:

| # | Diagramm | Typ |
|---|-----------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (complet) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 backends) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

Diese Diagramm sind eine Goldmine, um den vollständigen Fluss zu verstehen: Von der eingehenden Nachricht bis zur Antwort, einschließlich Timer und Grenzfälle.

---

## Der Auslöser im Detail

Der Trigger wird durch `evaluateMessage()` in `state/trigger.ts` bewertet. Hier ist die vollständige Logik:

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

  // ... Abgleich nach Name, Keyword, Follow-up, Zufall
}
```

Der Regex-Cache (`hasWordCache`) verhindert das Neu kompilieren der Patterns bei jeder Nachricht.

---

## Reaktionen

Luna reagiert auf Nachrichten mit Emojis. 30% Chance, ein benutzerdefiniertes Server-Emoji zu verwenden, 70% ein Unicode-Emoji. Die Reaktion wird nach der Konzentrationsverzögerung ausgelöst, nicht sofort.

Reaktionsbefehle auf Lunas Nachrichten:
- ❌ → Stop
- ▶️ → Start
- 🗑️ → Clear

---

## Antwortstil

Der Antwortstil wird nach Lunas jüngster Aktivität im Kanal gewichtet:

| Kontext | messageReference | mentionRepliedUser | Gewicht |
|----------|-----------------|-------------------|-------|
| Kalt | true | false | 70% |
| Kalt | true | true | 20% |
| Kalt | false | false | 10% |
| Aktiv | true | false | 50% |
| Aktiv | true | true | 15% |
| Aktiv | false | false | 30% |
| Aktiv | false | true | 5% |

In DMs ist `messageReference` immer `false`.

---

## Seriennachrichten

Mit 15% Wahrscheinlichkeit wird eine Antwort in 2-3 Fragmente aufgeteilt, die im menschlichen Tempo gesendet werden (1,5-4 Sekunden zwischen jedem Fragment). Simuliert jemanden, der in mehreren Schritten tippt.

![Timing Gantt -- reale Wartezeiten für Verzögerungen, Reaktionen, LLM-Streaming und Korrekturen](/images/luna-protocol/21-timing-gantt.svg)

---

## Dynamischer Status

Der Discord-Status von Luna wechselt zwischen mehreren konfigurierten Presets alle 15 Minuten. Unterstützte Typn: Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). Während des Schlafs wechselt der Status auf `invisible`.

```yaml
dynamic_status_presets:
  - status: online
    text: "mit den Pixeln"
    type: 0       # Playing
  - status: idle
    text: "weißes Rauschen"
    type: 2       # Listening
```

Ein zufälliger Jitter (×0.5-1.0) verhindert vorhersagbare Rotationen. 10% der Versuche werden übersprungen, um Wiederholungen zu vermeiden.

## Tippindikator

Vor dem Aufruf des LLM ruft Luna `startTyping()`. Ein `setInterval` aktualisiert den Indikator alle 8 Sekunden während der Generierung. Bereinigung im `finally` (`clearInterval`).

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

## Crash-Wiederherstellung

Wenn das LLM abstürzt (der `llama-server`-Prozess stirbt), erkennt Luna das Ereignis über `llmBus.emit("crash", code)` und versucht einen Neustart mit exponentiellem Backoff. Verhindert endlose Neustartschleifen.

## LLM-Parameter

Die Parameter sind in `src/config.ts` fest kodiert:

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

Die ChatML-Vorlage (`<|im_start|>/<|im_end|>`) wird verwendet. Die Anzahl der Threads wird automatisch erkannt über `os.cpus().length`.

---

## Einrichtung

```bash
npm install
cp config.example.yml config.yml
# config.yml bearbeiten
npm run dev                    # dev (hot reload)
npm run build && npm start     # production
```

| Script | Description |
|--------|-------------|
| `build` | Eigenständiges CLI-Bundle |
| `start` | Bot starten |
| `lint` / `format` / `check` | Biome |
| `test` | Tests (Bun) |
| `download-model` | GGUF von HuggingFace |
| `diagrams` | Exportiert Mermaid-Diagramm als SVG/PNG |

### PM2-Bereitstellung

```bash
./start.sh   # startet llm-server + llm-client unter PM2
```

---

## Fazit

Luna Protocol ist nicht nur ein Discord-Bot mit einem LLM. Es ist ein **vollständiges Verhaltenssystem**, menschliche Unvollkommenheiten simuliert: Vergesslichkeit, Tippfehler, Schlaf, Zögern, Müdigkeit. Alles aufgebaut um eine typisierte Ereignisbus, mit 24 Mermaid-Diagrammn, die jeden Fluss dokumentieren.

Der Code ist Open Source, der Datensatz ist öffentlich, und die Konfiguration ist hot-reloadable. Wenn euch das Thema interessiert, taucht in den Code -- es ist zugänglicher, als es scheint.

| Ressource | Link |
|-----------|------|
| GitHub-Repository | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
