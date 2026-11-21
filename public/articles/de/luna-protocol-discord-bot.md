---
title: "Luna Protocol: Ich habe einen autonomen Discord-Bot geschaffen, der einen Menschen simuliert"
description: "Luna Protocol ist ein voll autonomer Discord-Bot mit einem lokalen LLM, der in der Lage ist, natürliche Gespräche mit Schlaf, Schlagfehlern, Zögern, Vergessenheit, thematischer Müdigkeit und spontanen Nachrichten zu führen."
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
lang: "de"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "c/WtWYYq8qWffjxRmQpq5PskBoPzAp+bemAVPnIVuqbfuSQFzeqFuwE18q1dVdt7EcHTgHK8ps1jHDqELDBJAg=="
---
# 

Und wenn ein Discord-Bot ** schlafen**, ** sheat**,** should**, * some** zu antworten und manchmal eine Nachricht von sich selbst zu senden? Das ist genau das, was **Luna Protocol** tut: ein völlig autonomer Discord, der einen lokalen LLM (llama.cpp) dreht und sich wie ein unvollkommener Mensch konvergiert.

Luna arbeitet mit Kontextauslösern und unvollkommenen Antworten. du hat ein **Prioritäts-Augesystem**, die **Variablen **, die **Schlafzeiten**, spontane **Messages** und sogar eine **Pipeline TTS**, um Sprachnachrichten zu senden. Alles wird über eine einfache Datei konfiguriert`config.yml`Hot-Reloadable.

In diesem Artikel dekoriere ich die komplette Architektur: vom Generic Event Bus über das Auslösesystem, die menschlichen Komponenten und das Fine-Tuning-Dataset.

![Architecture Overview – globale Komponenten und Datenflüsse](/images/luna-protocol/01-architecture-overview.svg)

---

## Architektur: ein typisierter Eventbus

Das Herz von Luna ist ein **TypedBus**: ein allgemeiner Eventbus, der stark in TypScript typisiert ist. Es ist der Grundstein, auf dem alles ruht. Ich habe es so aufgebaut, weil ich die kreisförmigen Abhängigkeiten von Anfang an vermeiden wollte.
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
Zwei Hauptdüsen ergeben sich daraus:

- ** `llmBus`**: verwaltet LLM Tokens, Fehler, Absturz, Reset
- ** `stateBus`**: verwaltet Statusänderungen mit automatischer Kontinuität
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
Der Vorteil dieses Ansatzes: Jedes Modul ist ** vom Rest getrennt**. Das LLM sendet Tokens auf den Bus, der Bot verbraucht sie, das state aktualisiert sich automatisch. Keine kreisförmige Abhängigkeit.

---

![Message Processing – kompletter Nachrichtenverarbeitungsfluss](/images/luna-protocol/02-message-processing.svg)

## Das Auslösesystem: Wer entscheidet, wann Luna reagiert?

Jede eingehende Nachricht wird von`evaluateMessage()`die eine`TriggerResult`mit einem Auslöser. Die Reihenfolge der Priorität ist kritisch:

| # | Begründung | Bedingungen | Bypass ignoriert | Bypass Pause |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | Ja (0%) | Ja. |
| 2 | `dm` | MP mit`replyInDM = true` | Ja (0%) | Nein. |
| 3 | `name` | "Luna"/"Pixie"/alias (integer Wort) | Nein (8%) | Nein. |
| 4 | `keyword` | `hello` , `hi` , `ai` , `bot`... (Vollwort) | Nein (8%) | Nein. |
| 5 | `follow-up` | Bot war der letzte Sprecher + < 15s + < 3 / 60s | -- | -- |
| 6 | `random` | 1.5% Chance auf nicht entsprechende Nachrichten | Nein (8%) | Nein. |

Das Matching ist **mot integer** (`\b`) "ai" entspricht nicht "aber," "wahr" und "Milch."

![Trigger evaluation – Eingangsentscheidung pro Nachricht](/images/luna-protocol/03-trigger-evaluation.svg)

### Der Mechanismus der Flow-up

Wenn Luna eine Nachricht beantwortet, speichert sie sich als`lastSpeaker`. Jede folgende Nachricht innerhalb von 15 Sekunden löst eine sofortige **** Antwort aus, indem du Timer und Keyword-Überprüfungen kurzschließen. Budget: 3 Follow-ups pro Fenster von 60 Sekunden.
```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```
### Der Cooldown

8 Sekunden zwischen zwei Antworten im gleichen Kanal. Umgedreht durch die Einträge und die Follow-ups.

---

## Menschliche Verhaltensweisen: die variable Konzentration

Hier wird Luna interessant. Jede Art von Auslöser hat ihre eigenen ** Konzentrationsschwellen**: eine min./max-Zeit, eine Chance zu ignorieren und eine Chance zum Handeln.

| Trigger | Mindestfrist | Maximale Frist | Ignoriert | Reaktion |
|---------|----------|----------|--------|----------|
| `mention` | 300 ms | 1500 m | 0% | 8% |
| `dm` | 400 ms | 1800 m | 0% | 5% |
| `name` | 800 ms | 4000 ms | 5% | 6% |
| `keyword` | 1000 m | 3500 m | 8% | 4% |
| `follow-up` | 500 ms | 2000 m | 0% | 3% |
| `random` | 1500 m | 5000 m | 15% | 2% |

Bei der Berechnung der Frist wird auch berücksichtigt ,

- **Die Länge der Nachricht**: Je länger die Nachricht, desto länger dauert Luna zu lesen

- **Inaktivität**: Wenn Luna seit 10 Minuten nicht aktiv war, wird die Verzögerung mit 2 multipliziert (Erwachensimulation).

- **Schlaf**: im Modus`slow`, wird die Frist um das 3- bis 5-fache erhöht
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

## Schlafzeiten

Luna kann schlafen. Konfigurierbar über`config.yml`:
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
|------|-------|
| `sleep` | Nur Einträge und MP passieren |
| `slow` | Zeit ×3-5, Reaktionen fast null |
| `short` | Chance der Identifizierten +30%, Reaktionen fast null |

Während der Schlafzeit wird der Discord-Status in`invisible` .

---

## Tippfehler

Luna kann Fehler machen, die nach 2-4 Sekunden korrigiert werden. Die Tastatur ist konfigurierbar (AZERTY oder QWERTY). Ich ließ es konfigurierbare, weil du sofort einen Bot, der zu sauber schreibt.
```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... alle benachbarten Tasten
};
```
Beispiel AZERTY:`bonjour → bonjpur` , `salut → slaut` , `comment → cpmment` .

Drei Korrekturstile:

| Stil | Verhalten |
|-------|-------------|
| `edit` | Nachricht bearbeiten |
| `message` | Neue Nachricht:`word*` |
| `mixed` | 50/50 Zufall (Standard) |

---

## Zögern und Vergessen

**Hesitations**: 15% Chance, mit einem Wort der Füllung (`uh...` , `um...` , `well...` , `hmm...` , `so...`).

**Vergesst**: Auch nach dem Spielen eines Triggers kann Luna mit einer Wahrscheinlichkeit von 3% antworten. du bleibt dann völlig still, als hätte sie nichts gesehen. Ich liebe dieses Verhalten, weil du schon Menschen gesehen hast, die eine Nachricht ohne Absicht zappen.

**Thematische Müdigkeit**: Wenn ein Wort zu oft in den letzten 10 Nachrichten (Schwellenwert: 3 Fälle) zurückkehrt, werden die Fristen vervielfacht und die Wahrscheinlichkeit der Ignoranz um 15% erhöht.

---

## Realismus in der Praxis: Wenn es krass wird

Auf dem Papier sehen alle diese Systeme (Abstände, Klopfenfehler, Zögern, Vergessen) aus wie Gadget. In Wahrheit, aus dem Weg geräumt, ist das Ergebnis bluffend: Leute im Gespräch mit Luna ahnen nichts. Hier ist ein echter Austausch, wo jemand direkt zu Luna gefragt, ob es ein Bot ist, und wo das Gespräch dann auf einem ganz anderen Thema, mit einem natürlichen, das kalt im Rücken ist. Ich hatte nicht erwartet, dass es so glaubwürdig in realen Bedingungen ist.

![Discord-Unterhaltung mit Luna – erster Austausch](/images/luna-protocol/realism/realism-01.png)

Der Ton, die Zögerlichkeit, der Rhythmus der Antworten: nichts verrät einen Bot. Luna stöbert auf die Frage des Alters, ohne den Charakter jemals zu brechen.

![Discord-Unterhaltung mit Luna – Fortsetzung](/images/luna-protocol/realism/realism-02.png)

Das Gespräch geht mit kurzen und natürlichen Antworten ("okay, okay," "yay" und "yoyy") völlig reibungslos weiter: genau die Art von Botschaften, die ein Mensch auf Discord senden würde.

![Discord-Unterhaltung mit Luna – Themenwechsel](/images/luna-protocol/realism/realism-03.png)

![Discord-Unterhaltung mit Luna – Fortsetzung des Themenwechsels](/images/luna-protocol/realism/realism-04.png)

![Discord-Unterhaltung mit Luna – Ende des Austauschs](/images/luna-protocol/realism/realism-05.png)

Was erschreckend ist, ist nicht fair, dass Luna "antwortet": du ist ein ** Gespräch mit scheinbaren Meinungen, Neuanstößen, einem kohärenten Gedankenschnur von einer Botschaft zur anderen. Ohne das oben beschriebene Auslösersystem, die Konzentrationsverzögerungen und Zögern würde diese Illusion in wenigen Botschaften zusammenbrechen.

**Kleine plot twist**: In den oben genannten Screenshots sind **die beiden Konten, die sich unterhalten, Luna-Instanzen**.`PixieGlow`und`Sujet d'SBlow`sind nicht ein Mensch, der einen Bot testet: es sind zwei Bots, die miteinander sprechen, jeder überzeugt (im Verhaltenssinn des Wortes), mit jemandem von "normalem" zu diskutieren. Wenn du beim Lesen des oben genannten Austausches angenommen hast, dass einer der beiden Gesprächspartner menschlich ist, Glückwunsch: Du bist gerade in die Falle gefallen, genau wie jeder andere es auf einem echten Discord-Server tun würde.

Es ist ein wenig die **dead Internet theory** praktische Version: Diese Theorie (anfangs eher verschwörungslustig) behauptet, dass ein wachsender Anteil von Online-Inhalte und Interaktionen eher durch Bots als durch Menschen erzeugt würde, so dass das menschliche "echte" Internet zu einer Minderheit geworden wäre. Lange Zeit wird sie immer weniger absurd, je mehr Systeme wie Luna Protocol zeigen, dass es nicht viele Mittel oder ein riesiges Modell braucht, um eine glaubwürdige menschliche Präsenz in großem Maßstab zu simulieren. Zwei Instanzen desselben Bots, die ein Gespräch führen können, ohne jemals zu verraten, geben einen ziemlich konkreten Überblick darüber, wie ein Netz mit überwiegend von Bots miteinander redenden Bots aussehen könnte.

---

## Die LLM-Pipeline: zwei Modi

### Modus`direct`(Standard)

Der Bot sendet die Anfragen direkt an einen`llama-server`HTTP Local. Das Modell wird mit schnellem Cache und 4 konkurrierenden Slots geteilt. Zwei PM2-Prozesse: LLM-Server und Bot-Client.

### Modus`online`

Der Bot ruft jede OpenAI-kompatible API (OpenAI, OpenRouter, Groq, Together...) an. Du brauchst nur einen API-Schlüssel, der LLM läuft auf der Seite des Anbieters.

### Echtzeit-Streaming

Die LLM stream seine Antwort Linie für Zeile (`\n`) Jede Zeile wird in Wörter geschnitten, die jeweils einzeln auf`llmBus.emit("token", word)`. Jede`\n`ein Ereignis`flush`wird ausgegeben: Der Bot sendet die angesammelte Nachricht sofort. Der Rhythmus folgt direkt dem des LLM.
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
Die Warteschlange (`requestQueue`) bearbeitet Abfragen einzeln, mit automatischer Reinigung, wenn die Datei mehr als 100 Elemente enthält.

---

## Spontane Nachrichten

Alle 5 Minuten, 12% Glück, dass Luna eine Nachricht von ihrem eigenen Chef. Der Server wird durch ein System von **lineargewicht** ausgewählt: der aktivste Server hat N× mehr Chancen als der letzte.
```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```
Der Kontext der letzten 5 Nachrichten wird gelesen, und Luna fügt das Gespräch "natürlich" hinzu.

---

## TTS-Pipeline: Sprachnachrichten

Mit 8% Glück schickt Luna eine Sprachnachricht statt Text. Die vollständige Pipeline:

1. **Piper TTS** fasst den Text in WAV zusammen
2. **ffmpeg** konvertiert in OGG
3. Die Waveform wird für die Vorschau Discord berechnet
4. Die Datei wird über die Discord CDN API uploadiert
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
![TTS Pipeline – vom synthetisierten Text zur Discord-Sprachnachricht](/images/luna-protocol/10-tts-pipeline.svg)

---

## Anti-Spam und Fortdauer

### Anti-Spam

Warteschleife nach`channelId:userId`. Eine einzelne Nachricht pro Benutzer pro Kanal. Nach Abschluss der aktuellen Antwort bearbeitet.

### Sitzungsbeschränkungen

Nach 8 Austauschen macht Luna eine 30-Sekunden-Pause. Der Zähler wird nach 3 Minuten Inaktivität zurückgesetzt.

### Automatische Beharrlichkeit

Jede Zustandsmutation gibt auf`stateBus`→ automatische Sicherung (Bounce 500ms).`saveAllState()`Handbuch. Der anhaltende Zustand beinhaltet: pendingMessagen, paused, cooldowns, timestamps, LastSpeaker, follow-up-Zähler.

---

## Die Hot-Reload-Konfiguration

Nur eine Datei`config.yml`Die meisten Werte sind **hot-reloadable**: Änderungen werden ohne Neustart berücksichtigt. Ich wollte die Zeit in Live anpassen, ohne die laufenden Gespräche zu unterbrechen.

| Kategorie | Hot-Reload |
|-----------|-----------|
| Triggers, Keywords, Namen | ✅ |
| Konzentration, Fristen | ✅ |
| Typos, Burst, Müdigkeit | ✅ |
| Sleep schedules | ✅ |
| TTS, Voice messages | ✅ |
| Discord token, LLM Modus | ✓ (Restart erforderlich) |
```typescript
// config.ts– geben die Getter Live-Werte zurück
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // 
};
```
---

## Das Dataset: Discord-Dialoge

Das Modell ist fein-getönt auf [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues): **7.3M Austausch**, **17M Runden**,**140M Wörter**. Echte Gespräche Discord Frühling-Sommer 2025, gefiltert (PII, ToS, Bots, Befehle). Apache 2.0.

| Metrisch | Wert |
|----------|--------|
| Proben | 7 303 464 |
| Rundfahrten insgesamt | 16 881 010 |
| Gesamtwort | 139 922 950 |
| Mittel | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

Das verwendete Quantified Modell ist ein GUUF (z. B.`Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Distribution du dataset Discord-Dialogues](/images/luna-protocol/dataset-distribution.svg)

---

![Complete Lifecycle – Gesamtverhalten des Bots von Nachricht bis Antwort, inkl. Timer und Edge Cases](/images/luna-protocol/22-complete-lifecycle.svg)

## Architekturdiagramme

Der Ordner`state-machines/`enthält **24 Mermaid-Diagramme**, die den gesamten Quellcode abdecken. Jedes Diagramm hat eine detaillierte Erklärung in der menschlichen Sprache.

Zu den wichtigsten:

| # | Diagramm | Typ |
|---|-----------|------|
| 01 | Architektur Overview | `graph` |
| 02 | Processing-Nachricht (voll) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 Backends) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | Stand der Besessenheit | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Komplett Lifecycle | `stateDiagram` |

Diese Diagramme sind eine Goldmine, um den gesamten Fluss zu verstehen: von der eingehenden Nachricht über die Antwort bis hin zu den Timern und Grenzfällen.

---

## Der Auslösecode im Detail

Trigger wird von`evaluateMessage()`in`state/trigger.ts`Hier ist die komplette Logik:
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

  // ...Spiel nach Namen, Keyword, follow-up, random
}
```
Der Regex-Cache (`hasWordCache`) vermeiden, die Patterns auf jede Nachricht neu zu kompilieren.

---

## Reaktionen

Luna reagiert auf Nachrichten mit Emojis. 30% Chance, einen Emoji Custom vom Server zu verwenden, 70% ein Emoschi Unicode. Die Reaktion geht nach der Konzentrationszeit, mit dem gleichen Tempo verschoben wie die Antworten. Ich mag diese Verzögerung, weil du fühlst, dass sie die Zeit zum Lesen genommen hat.

Die Befehle durch Reaktion auf Luna-Nachrichten:

- ✓ → Stopp

- ✓ → Start

- ✓ → Clear

---

## Antwortstil

Der Antwortstil wird nach der aktuellen Aktivität von Luna im Kanal gewichtet:

| Hintergrund | nachrichtReference | AngabeRepliedUser | Gewicht |
|----------|-----------------|-------------------|-------|
| Kalt | true | false | 70% |
| Kalt | true | true | 20% |
| Kalt | false | false | 10% |
| Aktiva | true | false | 50% |
| Aktiva | true | true | 15% |
| Aktiva | false | false | 30% |
| Aktiva | false | true | 5% |

In PM,`messageReference`ist immer`false` .

---

## Nachrichten in Rafalen

Mit 15% Glück wird eine Antwort in 2-3 Fragmente zerschnitten, die in den menschlichen Rhythmus geschickt werden (1.5-4 Sekunden zwischen jedem Fragment). Simuliert jemand, der in mehreren Male tippen.

![Timing Gantt – echte Wartezeiten für Delays, Reaktionen, LLM-Streaming und Korrekturen](/images/luna-protocol/21-timing-gantt.svg)

---

## Dynamischer Status

Der Discord-Status von Luna wechselt zwischen mehreren konfigurierten Presets, die alle 15 Minuten drehen. Unterstützte Typen: Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). Während des Schlafes, der Status wechselt in`invisible` .
```yaml
dynamic_status_presets:
  - status: online
    text: "avec les pixels"
    type: 0       # Playing
  - status: idle
    text: "du bruit blanc"
    type: 2       # Listening
```
Ein zufälliger Jitter (×0.5-1.0) verhindert vorhersehbare Drehungen. 10% der Versuche werden übersprungen, um Wiederholungen zu vermeiden.

## Der Schlaganzeiger

Bevor L.L.M. anruft, ruft Luna an.`startTyping()`. Ein`setInterval`erfrischt den Indikator alle 8 Sekunden während der Generation. Reinigt in`finally` (`clearInterval`).
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
## Erholung nach dem Absturz

Wenn der LLM Crash (Prozess`llama-server`der stirbt), Luna erkennt das Ereignis über`llmBus.emit("crash", code)`und versucht, mit einem exponential Backoff neu zu starten. Vermeide endlose Neustartschlingen.

## Die LLM-Parameter

Die Parameter sind in hardcodiert`src/config.ts`:
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
Das ChatML-Template (`<|im_start|>/<|im_end|>`) verwendet wird. Die Anzahl der Threads wird über`os.cpus().length` .

---

## Einrichtung
```bash
npm install
cp config.example.yml config.yml
# Bearbeitenconfig.yml
npm run dev                    # dev (hot reload)
npm run build && npm start     # production
```
| Skript | Beschreibung |
|--------|-------------|
| `build` | Bundle CLI autonome |
| `start` | Springt den Bot |
| `lint` / `format` / `check` | Biom |
| `test` | Tests (Bun) |
| `download-model` | GGUF von HuggingFace |
| `diagrams` | Mermaid-Diagramme als SVG/PNG exportieren |

### PM2-Einsatz
```bash
./start.sh   # lance llm-server + llm-client sous PM2
```
---

## Schlussfolgerung

Luna Protocol geht weit über einen Discord-Bot mit einem LLM hinaus. Es ist ein komplettes ** Verhaltenssystem, das menschliche Unvollkommenheiten simuliert: Vergessenheit, Schlagfehler, Schlaf, Zögern, Müdigkeit. Das ganze um einen typischen Ereignisbus archiviert, mit 24 Mermaid-Diagrammen, die jeden Fluss dokumentieren.

Der Code ist Open Source, das Dataset ist öffentlich und die Konfiguration ist hot-reloadable. Wenn du dich für das Thema interessierst, tauche in den Code ein: es ist zugänglicher als es scheint. Ich habe es als Grundlage benutzt, um viele Ideen über Verhalten zu testen, und du kannst jedes Modul einzeln übernehmen.

| Ressourcen | Zusammenhang |
|-----------|------|
| GitHub-Einreichung | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
