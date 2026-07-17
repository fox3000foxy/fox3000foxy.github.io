---
title: "Luna Protocol: Ich habe einen autonomen Discord-Bot erschaffen, der einen Menschen simuliert"
description: "Luna Protocol ist ein vollstandig autonomer Discord-Bot mit lokalem LLM, der naturliche Konversation mit Schlaf, Tippfehlern, Zogern, Vergesslichkeit, thematischer Ermudung und spontanen Nachrichten beherrscht."
date: 2026-07-11
authors:
  - fox3000foxy
tags:
  - discord
  - llm
  - typescript
  - event-driven-architecture
  - ai
  - open-source
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "t/2dKfZ0LXEhl2d0d/lA6Ql2mXKPtBSlxnbtHQiisZ0syn9LHPVKZ8dqfRSow+bYFpquKf4mkGljvDVRrJFPDg=="
---

# Luna Protocol: Ich habe einen autonomen Discord-Bot erschaffen, der einen Menschen simuliert

Was ware, wenn ein Discord-Bot **schlafen**, **Tippfehler** machen, **zogern**, vergessen konnte zu antworten und manchmal aus eigenem Antrieb eine Nachricht sendet? Genau das tut **Luna Protocol**: ein vollstandig autonomer Discord-Bot, der ein lokales LLM (llama.cpp) betreibt und sich wie ein unvollkommener Mensch unterhalt.

Keine starren Prompts, keine roboterhaften Antworten. Luna verfugt uber ein **priorisiertes Auslosersystem**, **variable Verzogerungen**, **Schlafenszeiten**, **spontane Nachrichten** und sogar eine **TTS-Pipeline** fur Sprachmitteilungen. Alles konfiguriert uber eine einfache, hot-reloadable `config.yml`.

In diesem Artikel zerlegen wir die gesamte Architektur: vom generischen Event-Bus uber die TTS-Pipeline bis hin zum Auslosersystem, den menschlichen Komponenten und dem Fine-Tuning-Datensatz.

![Architekturubersicht -- globale Komponenten und Datenflusse](/images/luna-protocol/01-architecture-overview.svg)

---

## Die Architektur: Ein getypter Event-Bus

Das Herz von Luna ist ein **TypedBus** -- ein generischer, stark typisierter Event-Bus in TypeScript. Es ist der Grundbaustein, auf dem alles aufbaut.

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

Daraus leiten sich zwei Haupt-Busse ab:

- **`llmBus`** -- verwaltet LLM-Tokens, Fehler, Absturze, Rucksetzungen
- **`stateBus`** -- verwaltet Zustandsanderungen mit automatischer Persistierung

```
+-------------------------------------------------------+
|                   core/bus.ts                          |
|  TypedBus<K, V> -- on / off / once / emit              |
+---------------------------+---------------------------+
|   core/llm-bus            |    state/state-bus         |
|  token / done /           |     state:changed          |
|  error / crash /          |     -> Persistierung auto  |
|  flush / ready /          |                            |
|  reset                    |                            |
+---------------------------+---------------------------+
          |                            |
+---------------------+    +----------+--------------------+
| core/llm-core.ts    |    | bot.ts (Eris)                |
| Modus direkt        |    | bot/pending.ts               |
|   llama-server      |    | bot/reactions.ts             |
| Modus online        |    | state/trigger.ts             |
|   OpenAI API        |    | state/state.ts               |
|                     |    | behavior/*                   |
|                     |    | tts/*                        |
|                     |    | spontaneous.ts               |
+---------------------+    +------------------------------+
```

Der Vorteil dieses Ansatzes: Jedes Modul ist **entkoppelt** vom Rest. Das LLM sendet Tokens auf dem Bus, der Bot konsumiert sie, der Zustand aktualisiert sich automatisch. Keine zirkularen Abhangigkeiten.

---

![Nachrichtenverarbeitung -- vollstandiger Verarbeitungsfluss einer Nachricht](/images/luna-protocol/02-message-processing.svg)

## Das Auslosersystem: Wer entscheidet, wann Luna antwortet?

Jede eingehende Nachricht wird von `evaluateMessage()` ausgewertet, das ein `TriggerResult` mit einem Auslosungsgrund zuruckgibt. Die Prioritatsreihenfolge ist entscheidend:

| # | Grund | Bedingungen | Ignorieren umgehen | Pause umgehen |
|---|-------|-------------|-------------------|---------------|
| 1 | `mention` | @Bot | Ja (0%) | Ja |
| 2 | `dm` | PN mit `replyInDM = true` | Ja (0%) | Nein |
| 3 | `name` | ,,Luna''/,,Pixie''/Alias (ganzes Wort) | Nein (8%) | Nein |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (ganzes Wort) | Nein (8%) | Nein |
| 5 | `follow-up` | Bot war letzter Sprecher + < 15s + < 3 / 60s | -- | -- |
| 6 | `random` | 1,5% Wahrscheinlichkeit bei nicht passenden Nachrichten | Nein (8%) | Nein |

Der Abgleich erfolgt auf **ganze Worter** (`\b`): ,,ai'' passt nicht auf ,,mai'', ,,wahr'', ,,Seit''.

![Ausloserbewertung -- Eintrittsentscheidung fur jede Nachricht](/images/luna-protocol/03-trigger-evaluation.svg)

### Der Follow-up-Mechanismus

Wenn Luna auf eine Nachricht antwortet, registriert sie sich als `lastSpeaker`. Jede folgende Nachricht innerhalb von 15 Sekunden lost eine **sofortige** Antwort aus -- kein Timer, keine Keyword-Prufung. Budget: 3 Follow-ups pro 60-Sekunden-Fenster.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### Die Abklingzeit

8 Sekunden zwischen zwei Antworten im selben Kanal. Wird von Erwahnungen und Follow-ups umgangen.

---

## Die menschlichen Verhaltensweisen: Variable Konzentration

Hier wird Luna interessant. Jede Ausloserart hat ihre eigenen **Konzentrationsschwellen**: eine min./max. Verzogerung, eine Wahrscheinlichkeit zu ignorieren und eine Wahrscheinlichkeit zu reagieren.

| Ausloser | Verz. min | Verz. max | Ignorieren | Reaktion |
|----------|-----------|-----------|------------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

Die Berechnung der Verzogerung berucksichtigt auBerdem:
- **Die Nachrichtenlange**: Je langer die Nachricht, desto mehr Zeit braucht Luna zum ,,Lesen''
- **Inaktivitat**: Wenn Luna seit 10 Minuten nicht aktiv war, wird die Verzogerung mit 2 multipliziert (Simulation des ,,Aufwachens'')
- **Schlaf**: Im Modus `slow` wird die Verzogerung mit 3 bis 5 multipliziert

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
  delay *= 0.5 + Math.random() * 1.5; // aggressives Jitter
  return delay;
}
```

---

## Die Schlafenszeiten

Luna kann schlafen. Konfigurierbar uber `config.yml`:

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

| Modus | Wirkung |
|-------|---------|
| `sleep` | Nur Erwahnungen und PNs kommen durch |
| `slow` | Verzogerung x3-5, Reaktionen fast null |
| `short` | Ignorier-Wahrscheinlichkeit +30%, Reaktionen fast null |

Wahrend der Schlafenszeit wechselt der Discord-Status auf `invisible`.

---

## Die Tippfehler

Luna kann Tippfehler machen -- und sie nach 2-4 Sekunden korrigieren. Das Tastaturlayout ist konfigurierbar (AZERTY oder QWERTY).

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... alle benachbarten Tasten
};
```

Beispiel AZERTY: `bonjour -> bonjpur`, `salut -> slaut`, `comment -> cpmment`.

Drei Korrekturstile:

| Stil | Verhalten |
|------|-----------|
| `edit` | Bearbeitet die Nachricht |
| `message` | Neue Nachricht: `wort*` |
| `mixed` | 50/50 zufallig (Standard) |

---

## Das Zogern und die Vergesslichkeit

**Zogern**: 15% Wahrscheinlichkeit, mit einem Fullwort zu beginnen (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**Vergesslichkeit**: Selbst nachdem ein Ausloser erkannt wurde, kann Luna ,,vergessen'' zu antworten -- mit einer Wahrscheinlichkeit von 3%. Keine Nachricht, keine Reaktion -- als hatte sie nichts gesehen.

**Thematische Ermudung**: Wenn ein Wort in den letzten 10 Nachrichten zu oft vorkommt (Schwelle: 3 Vorkommen), werden die Verzogerungen multipliziert und die Ignorier-Wahrscheinlichkeit steigt um 15%.

---

## Realismus in der Praxis: wenn es gruselig wird

Auf dem Papier klingen all diese Systeme (Verzögerungen, Tippfehler, Zögern, Vergesslichkeit) nach Spielerei. In der Praxis, alles zusammen, ist das Ergebnis verblüffend -- so sehr, dass Leute, die mit Luna reden, nichts ahnen. Hier ein echter Austausch, bei dem jemand Luna direkt fragt, ob sie ein Bot ist, und das Gespräch danach zu einem ganz anderen Thema abdriftet, mit einer Natürlichkeit, die einem einen Schauer über den Rücken jagt.

![Discord-Gespräch mit Luna -- erster Austausch](/images/luna-protocol/realism/realism-01.png)

Der Ton, das Zögern, das Tempo der Antworten -- nichts verrät einen Bot. Luna weicht der Altersfrage aus, ohne je aus der Rolle zu fallen.

Das Gespräch läuft völlig flüssig weiter, mit kurzen, menschlichen Antworten ("okay, okay", "yay", "yayy") -- genau die Art von Nachrichten, die ein Mensch auf Discord schreiben würde.

![Discord-Gespräch mit Luna -- Fortsetzung](/images/luna-protocol/realism/realism-02.png)

![Discord-Gespräch mit Luna -- Themenwechsel](/images/luna-protocol/realism/realism-03.png)

![Discord-Gespräch mit Luna -- Themenwechsel geht weiter](/images/luna-protocol/realism/realism-04.png)

![Discord-Gespräch mit Luna -- Ende des Austauschs](/images/luna-protocol/realism/realism-05.png)

Das Beunruhigende ist nicht nur, dass Luna "antwortet" -- sondern dass sie ein **Gespräch führt**, mit scheinbaren Meinungen, Anschlussfragen und einem kohärenten Gedankengang von Nachricht zu Nachricht. Ohne das oben beschriebene Trigger-System, die Konzentrationsverzögerungen und das Zögern würde diese Illusion nach wenigen Nachrichten zusammenbrechen.

**Kleiner Plot-Twist**: Auf den obigen Screenshots sind **beide Accounts, die sich unterhalten, Instanzen von Luna**. `PixieGlow` und `Sujet d'SBlow` sind kein Mensch, der einen Bot testet -- es sind zwei Bots, die miteinander reden, jeder im verhaltenstechnischen Sinne "überzeugt", mit jemandem "Normalem" zu sprechen. Wer beim Lesen des obigen Austauschs angenommen hat, einer der beiden sei menschlich, ist genau darauf hereingefallen -- so wie es auf einem echten Discord-Server jedem passieren würde.

Das ist quasi eine praktische Version der **Dead-Internet-Theorie**: Diese (ursprünglich eher als Verschwörungstheorie geltende) These besagt, dass ein wachsender Teil der Online-Inhalte und -Interaktionen von Bots statt von Menschen erzeugt wird -- bis das "echte" menschliche Internet zur Minderheit wird. Lange als übertrieben abgetan, wirkt sie immer weniger absurd, wenn Systeme wie Luna Protocol zeigen, dass es weder viel Rechenleistung noch ein riesiges Modell braucht, um eine glaubwürdige menschliche Präsenz im großen Maßstab zu simulieren. Zwei Instanzen desselben Bots, die ein langes Gespräch führen, ohne sich je zu verraten, geben einen ziemlich konkreten Vorgeschmack darauf, wie ein Web aussehen könnte, das überwiegend aus Bots besteht, die miteinander reden.

---

## Die LLM-Pipeline: Zwei Modi

### Modus `direct` (Standard)

Der Bot sendet Anfragen direkt an einen lokalen `llama-server` per HTTP. Das Modell wird geteilt, mit Prompt-Cache und 4 gleichzeitigen Slots. Zwei PM2-Prozesse: der LLM-Server und der Bot-Client.

### Modus `online`

Der Bot ruft jede OpenAI-kompatible API auf (OpenAI, OpenRouter, Groq, Together...). Kein lokales LLM erforderlich.

### Das Echtzeit-Streaming

Das LLM streamt seine Antwort Zeile fur Zeile (`\n`). Jede Zeile wird in Worter zerlegt, die einzeln uber `llmBus.emit("token", word)` gesendet werden. Bei jedem `\n` wird ein `flush`-Event ausgelost -- der Bot sendet sofort die gesammelte Nachricht. Keine simulierte Verzogerung: Der Rhythmus ist der des LLMs.

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

Die Warteschlange (`requestQueue`) verarbeitet Anfragen eine nach der anderen, mit automatischer Bereinigung, wenn die Schlange 100 Elemente uberschreitet.

---

## Die spontanen Nachrichten

Alle 5 Minuten besteht eine 12%ige Chance, dass Luna aus eigenem Antrieb eine Nachricht postet. Der Server wird uber ein **lineares Gewichtungssystem** ausgewahlt: Der aktivste Server hat N-mal mehr Chancen als der letzte.

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

Der Kontext der letzten 5 Nachrichten wird gelesen, und Luna steigt ,,naturlich'' in die Unterhaltung ein.

---

## Die TTS-Pipeline: Sprachmitteilungen

Mit 8% Wahrscheinlichkeit sendet Luna eine Sprachmitteilung statt Text. Die vollstandige Pipeline:

1. **Piper TTS** synthetisiert den Text in WAV
2. **ffmpeg** konvertiert in OGG
3. Die Wellenform wird fur die Discord-Vorschau berechnet
4. Die Datei wird uber die Discord-CDN-API hochgeladen
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

![TTS-Pipeline -- vom synthetisierten Text zur Discord-Sprachnachricht](/images/luna-protocol/10-tts-pipeline.svg)

---

## Anti-Spam und Persistierung

### Anti-Spam

Warteschlange pro `channelId:userId`. Nur eine Nachricht pro Benutzer pro Kanal in der Schlange. Wird verarbeitet, sobald die aktuelle Antwort abgeschlossen ist.

### Sitzungsgrenzen

Nach 8 Austauschen macht Luna eine Pause von 30 Sekunden. Der Zahler setzt sich nach 3 Minuten Inaktivitat zuruck.

### Automatische Persistierung

Jede Zustandsanderung lost ein Event auf `stateBus` aus -- automatische Speicherung (Debounce 500ms). Keine manuellen `saveAllState()`-Aufrufe mehr notig. Der persistierte Zustand umfasst: pendingMessages, paused, cooldowns, timestamps, lastSpeaker, Follow-up-Zahler.

---

## Die Hot-Reload-Konfiguration

Eine einzige `config.yml`. Die meisten Werte sind **hot-reloadable** -- Anderungen werden ohne Neustart ubernommen.

| Kategorie | Hot-Reload |
|-----------|------------|
| Ausloser, Keywords, Namen | Ja |
| Konzentration, Verzogerungen | Ja |
| Tippfehler, Burst, Ermudung | Ja |
| Schlafplane | Ja |
| TTS, Sprachnachrichten | Ja |
| Discord-Token, LLM-Modus | Nein (Neustart erforderlich) |

```typescript
// config.ts -- die Getter geben Live-Werte zuruck
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## Der Datensatz: Discord-Dialogues

Das Modell ist auf [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) fine-getuned: **7,3 Mio. Austausche**, **17 Mio. Runden**, **140 Mio. Worter**. Echte Discord-Unterhaltungen aus dem Fruhjahr/Sommer 2025, gefiltert (PII, ToS, Bots, Befehle). Apache 2.0.

| Metrik | Wert |
|--------|------|
| Stichproben | 7.303.464 |
| Runden gesamt | 16.881.010 |
| Worter gesamt | 139.922.950 |
| Durchschnittliche Tokens | 32,8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

Das verwendete quantisierte Modell ist ein GGUF (z. B. `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Verteilung des Discord-Dialogues-Datensatzes](/images/luna-protocol/dataset-distribution.svg)

---

![Vollstandiger Lebenszyklus -- vollstandiges Bot-Verhalten von der Nachricht bis zur Antwort, einschlieBlich Timer und Grenzfalle](/images/luna-protocol/22-complete-lifecycle.svg)

## Die Architekturdiagramme

Der Ordner `state-machines/` enthalt **24 Mermaid-Diagramme**, die das gesamte Quellcode abdecken. Jedes Diagramm enthalt eine ausfuhrliche Erklarung in menschlicher Sprache.

Zu den wichtigsten gehoren:

| # | Diagramm | Typ |
|---|----------|-----|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (vollstandig) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 Backends) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

Diese Diagramme sind eine Goldgrube, um den gesamten Ablauf zu verstehen: von der eingehenden Nachricht bis zur Antwort, einschlieBlich Timer und Grenzfalle.

---

## Der Auslosercode im Detail

Der Ausloser wird von `evaluateMessage()` in `state/trigger.ts` ausgewertet. Hier ist die vollstandige Logik:

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

  // ... Abgleich nach Name, Keyword, Follow-up, Random
}
```

Der Regex-Cache (`hasWordCache`) vermeidet die Neukompilierung der Muster bei jeder Nachricht.

---

## Die Reaktionen

Luna reagiert auf Nachrichten mit Emojis. 30% Wahrscheinlichkeit fur ein benutzerdefiniertes Server-Emoji, 70% fur ein Unicode-Emoji. Die Reaktion erfolgt nach der Konzentrationsverzogerung, nicht sofort.

Die Reaktionsbefehle auf Lunas Nachrichten:
- ❌ → Stopp
- ▶️ → Start
- 🗑️ → Loschen

---

## Der Antwortstil

Der Antwortstil wird je nach aktueller Aktivitat von Luna im Kanal gewichtet:

| Kontext | messageReference | mentionRepliedUser | Gewicht |
|---------|-----------------|-------------------|---------|
| Kalt | true | false | 70% |
| Kalt | true | true | 20% |
| Kalt | false | false | 10% |
| Aktiv | true | false | 50% |
| Aktiv | true | true | 15% |
| Aktiv | false | false | 30% |
| Aktiv | false | true | 5% |

In PNs ist `messageReference` immer `false`.

---

## Die Burst-Nachrichten

Mit 15% Wahrscheinlichkeit wird eine Antwort in 2-3 Fragmente aufgeteilt, die in menschlichem Tempo gesendet werden (1,5-4 Sekunden zwischen den Fragmenten). Simuliert jemanden, der in mehreren Durchgangen tippt.

![Timing Gantt -- tatsachliche Wartezeiten fur Verzogerungen, Reaktionen, LLM-Streaming und Korrekturen](/images/luna-protocol/21-timing-gantt.svg)

---

## Der dynamische Status

Lunas Discord-Status wechselt zwischen mehreren konfigurierten Presets, die alle 15 Minuten rotieren. Unterstutzte Typen: Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). Im Schlaf wechselt der Status zu `invisible`.

```yaml
dynamic_status_presets:
  - status: online
    text: "mit den Pixeln"
    type: 0       # Playing
  - status: idle
    text: "weiBes Rauschen"
    type: 2       # Listening
```

Ein zufalliges Jitter (x0,5-1,0) vermeidet vorhersehbare Rotationen. 10% der Versuche werden ubersprungen, um Wiederholungen zu vermeiden.

## Der Tipp-Anzeiger

Vor dem Aufruf des LLMs ruft Luna `startTyping()` auf. Ein `setInterval` aktualisiert die Anzeige wahrend der Generierung alle 8 Sekunden. Bereinigt im `finally`-Block (`clearInterval`).

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

## Die Wiederherstellung nach Absturzen

Wenn das LLM absturzt (`llama-server`-Prozess stirbt), erkennt Luna das Ereignis uber `llmBus.emit("crash", code)` und versucht einen Neustart mit exponentiellem Backoff. Vermeidet Endlos-Neustartschleifen.

## Die LLM-Parameter

Die Parameter sind in `src/config.ts` fest codiert:

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

Die ChatML-Vorlage (`<|im_start|>/<|im_end|>`) wird verwendet. Die Anzahl der Threads wird automatisch uber `os.cpus().length` erkannt.

---

## Einrichtung

```bash
npm install
cp config.example.yml config.yml
# config.yml bearbeiten
npm run dev                    # Entwicklung (Hot Reload)
npm run build && npm start     # Produktion
```

| Skript | Beschreibung |
|--------|--------------|
| `build` | Standalone-CLI-Bundle |
| `start` | Startet den Bot |
| `lint` / `format` / `check` | Biome |
| `test` | Tests (Bun) |
| `download-model` | GGUF von HuggingFace |
| `diagrams` | Exportiert Mermaid-Diagramme als SVG/PNG |

### PM2-Bereitstellung

```bash
./start.sh   # startet llm-server + llm-client unter PM2
```

---

## Fazit

Luna Protocol ist nicht nur ein Discord-Bot mit einem LLM. Es ist ein **vollstandiges Verhaltenssystem**, das menschliche Unvollkommenheiten simuliert: Vergesslichkeit, Tippfehler, Schlaf, Zogern, Ermudung. Alles architektonisch um einen getypten Event-Bus herum aufgebaut, mit 24 Mermaid-Diagrammen, die jeden Ablauf dokumentieren.

Der Code ist Open Source, der Datensatz ist offentlich, und die Konfiguration ist hot-reloadable. Wenn Sie sich fur das Thema interessieren, tauchen Sie in den Code ein -- er ist zuganglicher, als es scheint.

| Ressource | Link |
|-----------|------|
| GitHub-Repository | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Datensatz | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
