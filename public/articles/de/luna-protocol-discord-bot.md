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
author_sig: "fNza1C3TmhoE0r0TRVNvt9vciUzW+PmTjHdV0ITCn1VNh/671t8kat1gZFWVVfu9FanoNYuIrTTrA87da+NMpQ=="
---

# Luna Protocol: Ich habe einen autonomen Discord-Bot erstellt, der einen Menschen simuliert
Was wäre, wenn ein Discord-Bot **schlafen**, **Tippfehler machen**, **zögern**, **vergessen** zu antworten und manchmal von sich aus eine Nachricht senden könnte? Genau das macht **Luna Protocol**: Ein komplett autonomer Discord-Bot, der ein lokales LLM (llama.cpp) betreibt und wie ein fehlerhafter Mensch konversiert.
Keine starren Prompts, keine机器人ischen Antworten. Luna hat ein **prioritätsbasiertes Trigger-System**, **variable Verzögerungen**, **Schlafzeiten**, **spontane Nachrichten** und sogar eine **TTS-Pipeline** für Sprachnachrichten. Alles konfigurierbar über eine einzige `config.yml`-Datei mit Hot-Reload.
In diesem Artikel zerlegen wir die vollständige Architektur: vom generischen Ereignisbus über die TTS-Pipeline bis hin zum Trigger-System, den menschlichen Komponenten und dem Fine-Tuning-Datensatz.
![Architekturübersicht -- globale Komponenten und Datenfluss](/images/luna-protocol/01-architecture-overview.svg)

---

## Architektur: ein typisierter Ereignisbus

Das Herz von Luna ist ein **TypedBus** -- ein stark typisierter generischer Ereignisbus in TypeScript. Es ist der grundlegende Baustein, auf dem alles basiert.

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

Daraus ergeben sich zwei Hauptbusse:

- **`llmBus`** -- verwaltet LLM-Tokens, Fehler, Abstürze, Neustarts
- **`stateBus`** -- verwaltet Statusänderungen mit automatischer Persistenz

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

Der Vorteil dieses Ansatzes: Jedes Modul ist vom Rest **getrennt**. Das LLM sendet Tokens über den Bus, der Bot verbraucht sie, der Status aktualisiert sich automatisch. Keine zirkulären Abhängigkeiten.

---

![Message Processing -- flux complet de traitement d'un message](/images/luna-protocol/02-message-processing.svg)

## Auslösesystem: Wer entscheidet wann Luna antwortet?

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

### Follow-up-Mechanismus

Quand Luna répond à un message, elle s'enregistre comme `lastSpeaker`. Tout message suivant dans les 15 secondes déclenche une réponse **immédiate** -- pas de timer, pas de vérification de keyword. Budget : 3 follow-ups par fenêtre de 60 secondes.

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

C'est ici que Luna devient intéressante. Chaque type de déclenchement a ses propres **seuils de concentration** : un délai min/max, une chance d'ignorer, et une chance de réagir.

| Trigger | Délai min | Délai max | Ignore | Réaction |
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
  delay *= 0.5 + Math.random() * 1.5; // jitter agressif
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

| Mode | Effet |
|------|-------|
| `sleep` | Seules les mentions et MP passent |
| `slow` | Délai ×3-5, réactions quasi nulles |
| `short` | Chance d'ignore +30%, réactions quasi nulles |

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

Exemple AZERTY : `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`.

Drei Korrekturstile:

| Style | Comportement |
|-------|-------------|
| `edit` | Édite le message |
| `message` | Nouveau message : `word*` |
| `mixed` | 50/50 aléatoire (défaut) |

---

## Zögern und Vergesslichkeit

**Hésitations** : 15% de chance de commencer par un mot de remplissage (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**Oublis** : même après avoir matché un trigger, Luna peut "oublier" de répondre avec une probabilité de 3%. Pas de message, pas de réaction -- comme si elle n'avait rien vu.

**Fatigue thématique** : si un mot revient trop souvent dans les 10 derniers messages (seuil : 3 occurrences), les délais sont multipliés et la chance d'ignore augmente de 15%.

---

## Die LLM-Pipeline: zwei Modi

### Modus `direct` (Standard)

Der Bot sendet Anfragen direkt an einen lokalen `llama-server` über HTTP. Das Modell ist geteilt, mit Prompt-Cache und 4 gleichzeitigen Slots. Zwei PM2-Prozesse: der LLM-Server und der Bot-Client.

### Modus `online`

Der Bot ruft jede OpenAI-kompatible API auf (OpenAI, OpenRouter, Groq, Together...). Kein lokales LLM nötig.

### Echtzeit-Streaming

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

Die Warteschlange (`requestQueue`) verarbeitet Anfragen nacheinander mit automatischer Bereinigung bei mehr als 100 Elementen.

---

## Spontane Nachrichten

Toutes les 5 minutes, 12% de chance que Luna poste un message de son propre chef. Der Server wird durch ein System **linearer Gewichtung** ausgewählt: Der aktivste Server hat N× mehr Chancen als der letzte.

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

Avec 8% de chance, Luna envoie un message vocal au lieu de texte. La pipeline complète :

1. **Piper TTS** synthétise le texte en WAV
2. **ffmpeg** convertit en OGG
3. Le waveform est calculé pour l'aperçu Discord
4. Le fichier est uploadé via l'API Discord CDN
5. Le message vocal est envoyé

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

## Anti-Spam und Persistenz

### Anti-Spam

Warteschlange pro `channelId:userId`. Nur eine Nachricht pro Benutzer und Kanal in der Warteschlange. Wird verarbeitet, sobald die aktuelle Antwort fertig ist.

### Sitzungslimits

Nach 8 Austauschen macht Luna eine 30-Sekunden-Pause. Der Zähler wird nach 3 Minuten Inaktivität zurückgesetzt.

### Automatische Persistenz

Chaque mutation d'état émet sur `stateBus` → sauvegarde automatique (debounce 500ms). Plus besoin d'appels `saveAllState()` manuels. L'état persisté inclut : pendingMessages, paused, cooldowns, timestamps, lastSpeaker, compteurs de follow-up.

---

## Hot-Reload-Konfiguration

Eine einzige `config.yml`-Datei. Die meisten Werte sind **hot-reloadable** -- Änderungen werden ohne Neustart übernommen.

| Catégorie | Hot-reload |
|-----------|-----------|
| Triggers, keywords, noms | ✅ |
| Concentration, délais | ✅ |
| Typos, burst, fatigue | ✅ |
| Sleep schedules | ✅ |
| TTS, voice messages | ✅ |
| Discord token, LLM mode | ❌ (redémarrage requis) |

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

Le modèle est fine-tuné sur [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) : **7.3M échanges**, **17M tours**, **140M mots**. Des vraies conversations Discord printemps-été 2025, filtrées (PII, ToS, bots, commandes). Apache 2.0.

| Métrique | Valeur |
|----------|--------|
| Échantillons | 7 303 464 |
| Tours totaux | 16 881 010 |
| Mots totaux | 139 922 950 |
| Tokens moyens | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

Das verwendete quantisierte Modell ist ein GGUF (z.B. `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Distribution du dataset Discord-Dialogues](/images/luna-protocol/dataset-distribution.svg)

---

![Complete Lifecycle -- comportement complet du bot du message à la réponse, incluant les timers et cas limites](/images/luna-protocol/22-complete-lifecycle.svg)

## Architekturdiagramme

Der Ordner `state-machines/` enthält **24 Mermaid-Diagramme**, die den gesamten Quellcode abdecken. Jedes Diagramm hat eine detaillierte Erklärung in menschlicher Sprache.

Darunter die wichtigsten:

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

Diese Diagramme sind eine Goldmine, um den vollständigen Fluss zu verstehen: Von der eingehenden Nachricht bis zur Antwort, einschließlich Timer und Grenzfälle.

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

| Contexte | messageReference | mentionRepliedUser | Poids |
|----------|-----------------|-------------------|-------|
| Froid | true | false | 70% |
| Froid | true | true | 20% |
| Froid | false | false | 10% |
| Actif | true | false | 50% |
| Actif | true | true | 15% |
| Actif | false | false | 30% |
| Actif | false | true | 5% |

In DMs ist `messageReference` immer `false`.

---

## Seriennachrichten

Avec 15% de chance, une réponse est découpée en 2-3 fragments envoyés au rythme humain (1.5-4 secondes entre chaque fragment). Simule quelqu'un qui tape en plusieurs fois.

![Timing Gantt -- temps d'attente réels pour les délais, réactions, streaming LLM et corrections](/images/luna-protocol/21-timing-gantt.svg)

---

## Dynamischer Status

Der Discord-Status von Luna wechselt zwischen mehreren konfigurierten Presets alle 15 Minuten. Unterstützte Typen: Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). Während des Schlafs wechselt der Status auf `invisible`.

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

Le template ChatML (`<|im_start|>/<|im_end|>`) est utilisé. Le nombre de threads est auto-détecté via `os.cpus().length`.

---

## Einrichtung

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

### PM2-Bereitstellung

```bash
./start.sh   # lance llm-server + llm-client sous PM2
```

---

## Fazit

Luna Protocol n'est pas juste un bot Discord avec un LLM. C'est un **système comportemental complet** qui simule les imperfections humaines : les oublis, les fautes de frappe, le sommeil, les hésitations, la fatigue. Le tout architecturé autour d'un bus d'événements typé, avec 24 diagrammes Mermaid documentant chaque flux.

Le code est open source, le dataset est public, et la configuration est hot-reloadable. Si le sujet vous intéresse, plongez dans le code -- c'est plus accessible qu'il n'y paraît.

| Ressource | Lien |
|-----------|------|
| Dépôt GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
