---
title: "Luna Protocol: Warum ich ein 1,5-Milliarden-Parameter-Modell mit 50k Discord-Beispielen fine-getunt und Few-Shot-Priming zur Geheimwaffe gemacht habe"
description: "Ein kleineres Modell, trainiert mit weniger Daten, kann ein größeres übertreffen -- wenn man weiß, wie man es primt. Hier ist, warum Luna Protocol von einem 3B-Hermes zu einem 1,5B-Qwen-Finetune gewechselt ist und warum Few-Shot-Priming zum eigentlichen Game-Changer wurde."
date: 2026-07-17
authors:
  - fox3000foxy
tags:
  - discord
  - llm
  - fine-tuning
  - few-shot-learning
  - qwen
  - unsloth
  - open-source
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "LD+7oNb8g50gHKrid7KiRNeZxom+RH3p4mWuOOOG4W818SzaIphEjA7nSpPnATyg/gNHbiJcdL0vh7QnLhiBJg=="
---

# Luna Protocol: Warum ich ein 1,5-Milliarden-Parameter-Modell mit 50k Discord-Beispielen fine-getunt und Few-Shot-Priming zur Geheimwaffe gemacht habe

Im [ersten Artikel](/articles/en/luna-protocol-discord-bot) habe ich einen Discord-Bot gebaut, der einen Menschen simuliert -- Schlaf, Tippfehler, Zögern, Vergesslichkeit, spontane Nachrichten. Das Verhaltenssystem war solide. Das LLM dahinter war ein 3B-Hermes-Modell, quantisiert auf Q8_0, das 3 GB VRAM verschlang.

Es funktionierte. Aber es war überdimensioniert.

Ein Discord-Bot braucht kein Modell mit 3 Milliarden Parametern, um "nm just chillin, u" zu sagen. Was er braucht, ist **stilistische Konsistenz** -- die Fähigkeit, einen bestimmten Gesprächston beizubehalten, Nachricht für Nachricht, ohne in einen Corporate-Assistant-Modus abzudriften. Und es stellt sich heraus: Ein kleineres Modell, trainiert mit weniger Daten und mit ein paar Beispielen geprimt, macht das besser als ein größeres Modell, das sich mit einem simplen System-Prompt durchzwingt.

Dieser Artikel handelt von den offiziellen Luna-Protocol-Modellen: warum es sie gibt, warum sie 1,5B statt 3B groß sind, warum 50k Trainingsbeispiele statt 7,3 Millionen verwendet wurden, und warum Few-Shot-Priming von einem netten Extra zum Kern des gesamten Ansatzes wurde.

---

## Das Problem mit dem 3B-Modell

Das ursprüngliche Setup nutzte `Discord-Micae-Hermes-3-3B.Q8_0.gguf` -- ein Modell mit 3 Milliarden Parametern, fine-getunt auf Discord-Daten. Es lieferte gute Antworten, aber:

| Metrik | Hermes-3-3B Q8_0 | Ziel |
|--------|-------------------|--------|
| VRAM-Nutzung | ~3 GB | < 1 GB |
| Token-Generierung | ~30 Tok/s | ~60+ Tok/s |
| Modelldateigröße | ~3,2 GB | < 1 GB |
| Kaltstartzeit | ~8s | ~3s |

Für einen Bot, der rund um die Uhr auf einem bescheidenen Server läuft, sind 3 GB VRAM viel. Und die Generierungsgeschwindigkeit -- zwar in Ordnung für gelegentliche Nachrichten -- wirkte träge bei Antwortschüben oder wenn mehrere Kanäle gleichzeitig aktiv waren.

Die Frage war: Lässt sich derselbe Discord-Dialogues-Stil mit halb so vielen Parametern erreichen?

---

## Die Fine-Tuning-Entscheidung: warum 50k statt 7,3M

Der Datensatz [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) enthält **7,3 Millionen Austausche** und **17 Millionen Redebeiträge**. Er ist ein riesiges Korpus echter Discord-Gespräche. Der naheliegende Ansatz wäre gewesen, mit dem gesamten Datensatz zu trainieren.

Ich habe das Gegenteil getan. Ich habe mit **50.000 Beispielen** trainiert -- weniger als 1 % der verfügbaren Daten.

Der Grund: **Die Größe des Trainingssatzes beeinflusst direkt, wie stark das Modell auf seine Trainingsverteilung überanpasst.**

Ein Modell, das mit 7,3 Millionen Beispielen trainiert wird, lernt eine sehr spezifische statistische Verteilung von Gesprächen. Es wird hervorragend darin, diese Verteilung zu reproduzieren, aber es wird auch **starr** -- es hat weniger Flexibilität, sich an neue Muster anzupassen, die zur Inferenzzeit bereitgestellt werden.

Ein Modell, das mit 50k Beispielen trainiert wird, lernt den allgemeinen Ton und das Register von Discord-Gesprächen (informell, kurz, mit Abkürzungen, klein geschrieben), behält aber genug Flexibilität, um durch **In-Context-Beispiele gesteuert** zu werden. Die Few-Shot-Beispiele kämpfen nicht gegen eine massive, bereits erlernte Verteilung an -- sie ergänzen eine leichtere.

Das ist die zentrale Erkenntnis: **Begrenzte Trainingsdaten machen Few-Shot-Priming effektiver.**

---

## Das Modell: technische Details

Das Luna-Protocol-Modell ist ein **QLoRA-Finetune** von [Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct):

| Parameter | Wert |
|-----------|-------|
| Basismodell | `unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit` |
| Methode | QLoRA (4-bit) |
| LoRA-Rang | `r=16`, `lora_alpha=16` |
| Zielmodule | `q/k/v/o_proj`, `gate/up/down_proj` |
| Trainierbare Parameter | 18.464.768 / 1.562.179.072 (1,18 %) |
| Trainingsdaten | ~50.000 Beispiele (Teilmenge von Discord-Dialogues) |
| Filter | 8-512 Tokens pro Beispiel |
| Epochen | 2-3 |
| Hardware | Kaggle T4 |
| Framework | [Unsloth](https://github.com/unslothai/unsloth) |

Der Datensatz ist ein vorverarbeiteter Fork von Discord-Dialogues, gefiltert auf saubere `user`/`assistant`-Beiträge -- keine Systemnachrichten, keine Metadaten, keine Bot-Befehle. Das ist später wichtig.

### Verfügbare Quantisierungen

| Datei | Quantisierung | Größe | Anmerkungen |
|------|-------------|------|-------|
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q2_K.gguf` | Q2_K | 676 MB | Deutlich degradiert -- nicht empfohlen |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf` | Q4_K_M | 986 MB | Gutes Verhältnis von Größe zu Qualität (empfohlen) |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q8_0.gguf` | Q8_0 | 1,65 GB | Beste Stiltreue |

Das empfohlene Modell ist **Q4_K_M** -- unter 1 GB, schnell, und es bewahrt den Gesprächsstil gut. Q2_K degradiert bei einem so kleinen Modell zu stark. Q8_0 bietet die beste Qualität, verbraucht aber 68 % mehr Speicher.

---

## Der Durchbruch beim Few-Shot-Priming

Hier kommt der Teil, der alles verändert hat.

Die HuggingFace-Modellkarte enthält eine Warnung:

> Bei einem bloßen Prompt ohne Priming fällt dieses Modell tendenziell in Qwens Standard-Assistententon zurück. Ein kurzes Few-Shot-Priming macht einen großen Unterschied.

Das ist kein Bug -- es ist eine direkte Folge davon, wie die Trainingsdaten strukturiert wurden.

### Warum System-Prompts allein nicht funktionieren

Die Discord-Dialogues-Trainingsdaten enthalten ausschließlich `user`/`assistant`-Beiträge. Es gibt **keine Beispiele mit System-Rolle** im Trainingssatz. Das Modell wurde nie darauf trainiert, System-Prompts als Stilvorgaben zu befolgen.

Gibt man ihm einen System-Prompt wie "Du heißt Luna, sprich locker", hört es die Anweisung, hat aber kein starkes gelerntes Muster, um sie in eine Ausgabe zu übersetzen. Es fällt dann auf Qwens Standard zurück: hilfsbereit, strukturiert, leicht formell.

### Warum Few-Shot-Beispiele funktionieren

Injiziert man Beispielgespräche im selben ChatML-Format, mit dem das Modell trainiert wurde (mit der `user`/`assistant`-Struktur), klickt etwas ein. Das Modell erkennt das Muster aus seinen Trainingsdaten und richtet seine Ausgabe danach aus.

So sieht ein Few-Shot-Priming in der Praxis aus:

```yaml
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

Diese Beispiele werden nach dem System-Prompt und vor dem eigentlichen Gespräch eingefügt. Das Modell nimmt sie als Teil des Gesprächsverlaufs wahr, nicht als Anweisungen. Das ist ein entscheidender Unterschied -- ihm wird nicht *gesagt*, locker zu sein, es wird ihm *gezeigt*, wie das aussieht.

### Vorher und nachher

Ohne Few-Shot-Priming (bloßer System-Prompt):

```
User: yo whats good
Bot: Hello! I am doing well, thank you for asking. How can I assist you today?
```

Mit Few-Shot-Priming (3 Beispiele):

```
User: yo whats good
Bot: nm just chillin, u
```

Der Unterschied ist frappierend. Das Modell produziert nicht nur andere Wörter -- es übernimmt das gesamte Register: Kleinschreibung, Abkürzungen, lockerer Ton, kurze Antworten. Es passt sich dem Stil der Beispiele an, nicht dem Stil von Qwens Trainingsdaten.

---

## Speicher und Geschwindigkeit: die konkreten Zahlen

Der Wechsel von Hermes-3-3B zu Luna-Protocol-1.5B bringt messbare Gewinne:

| Metrik | Hermes-3-3B Q8_0 | Luna-Protocol Q4_K_M | Verbesserung |
|--------|-------------------|----------------------|-------------|
| VRAM-Nutzung | ~3 GB | ~986 MB | **67 % weniger** |
| Modelldateigröße | ~3,2 GB | ~986 MB | **69 % kleiner** |
| Token-Generierung | ~30 Tok/s | ~60+ Tok/s | **2x schneller** |
| Kaltstart | ~8s | ~3s | **62 % schneller** |
| Kontextfenster | 8192 | 8192 | Gleich |

### Warum der Geschwindigkeitsgewinn real ist

Kleinere Modelle sind nicht nur "etwas weniger langsam" -- sie sind bei der Inferenz grundlegend schneller. Mit 1,5B Parametern statt 3B:

- **Weniger Matrixmultiplikationen** pro Token: Attention-Layer, FFN-Layer und Ausgabeprojektion skalieren alle linear mit der Parameterzahl
- **Bessere Cache-Nutzung**: Das kleinere Modell passt mit mehr seiner Gewichte in den L2/L3-Cache
- **Geringerer Druck auf die Speicherbandbreite**: weniger Bytes, die pro Token aus dem VRAM gelesen werden müssen

Auf einem bescheidenen reinen CPU-Setup (2 Kerne, keine GPU) generiert das 1,5B-Modell Tokens etwa **doppelt so schnell** wie das 3B-Modell. Das ist der Unterschied zwischen "fühlt sich wie ein Bot an" und "fühlt sich an wie ein tippender Mensch".

### Prompt-Caching verstärkt den Vorteil

Luna Protocol nutzt `llama-server` mit aktiviertem Prompt-Caching (`--cache-reuse 256`). Das bedeutet:

1. Die erste Nachricht einer Sitzung zahlt die vollen Kosten der Prompt-Verarbeitung (System-Prompt + Few-Shot-Beispiele + Nutzernachricht)
2. Nachfolgende Nachrichten verarbeiten nur die *neuen* Tokens -- das gecachte Präfix wird wiederverwendet
3. Bei 5 Few-Shot-Beispielen (~50-150 Tokens) ist der Mehraufwand nach der ersten Anfrage vernachlässigbar

Die Few-Shot-Beispiele sind nach der ersten Nachricht einer Sitzung praktisch "kostenlos". Das Modell erhält Stilvorgaben zu null Grenzkosten.

---

## Die Implementierung: wie es im Code funktioniert

Das Few-Shot-System in Luna Protocol ist schlank und minimalistisch. Drei Dateien erledigen alles.

### 1. Konfiguration (`config.yml`)

```yaml
few_shot_enabled: true
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
  - user: "whats up"
    assistant: "yooo not much, what about you"
  - user: "how was your day"
    assistant: "it was alright, nothing crazy happened lol"
```

Die Konfiguration kann im laufenden Betrieb neu geladen werden. Beispiele ändern, speichern, und der Bot übernimmt den neuen Stil sofort -- kein Neustart nötig.

### 2. Formatierung und Injektion (`src/core/few-shot.ts`)

Die Funktion `formatFewShotExamples()` wandelt die YAML-Beispiele in ChatML-Nachrichtenobjekte um:

```typescript
export function formatFewShotExamples(
  examples: FewShotExample[],
  username = "user"
): Array<{ role: "user" | "assistant"; content: string }> {
  const messages = [];
  for (const example of examples) {
    messages.push({ role: "user", content: `${username}: ${example.user}` });
    messages.push({ role: "assistant", content: example.assistant });
  }
  return messages;
}
```

Die Funktion `injectFewShotIntoConversation()` platziert sie direkt nach dem System-Prompt:

```typescript
export function injectFewShotIntoConversation(
  messages: Message[],
  fewShotMessages: Message[]
): Message[] {
  const systemMessage = messages[0];
  const userMessages = messages.slice(1);
  return [systemMessage, ...fewShotMessages, ...userMessages];
}
```

### 3. Integration (`src/core/llm-client.ts`)

Vor jedem LLM-Aufruf werden die Few-Shot-Beispiele injiziert, sofern aktiviert:

```typescript
let finalMessages = messages;
if (FEW_SHOT_ENABLED && FEW_SHOT_EXAMPLES.length > 0) {
  const fewShotMessages = formatFewShotExamples(FEW_SHOT_EXAMPLES);
  finalMessages = injectFewShotIntoConversation(messages, fewShotMessages);
}
```

Das Modell erhält: `[System-Prompt] + [Few-Shot-Beispiele] + [Gesprächsverlauf]`

---

## Den Discord-Dialogues-Stil bewahren

Der ursprüngliche Discord-Dialogues-Datensatz hat eine sehr spezifische Gesprächssignatur:

- **Kurze Nachrichten**: durchschnittlich 32,8 Tokens pro Beitrag
- **Informelles Register**: Abkürzungen, Kleinschreibung, keine Zeichensetzung
- **Schneller Hin-und-Her**: mehrere kurze Austausche statt langer Monologe
- **Natürliche Unvollkommenheiten**: Tippfehler, "lol", "fr", "ngl", "tbh"

Das Luna-Protocol-Modell bewahrt diesen Stil durch zwei Mechanismen:

### 1. Fine-Tuning verschiebt die Basisverteilung

Die 50k Trainingsbeispiele lehren das Modell den *statistischen Fingerabdruck* von Discord-Gesprächen. Es lernt, dass Antworten typischerweise kurz, klein geschrieben und informell sind. Das verschiebt die Standardausgabe des Modells weg vom hilfsbereiten Assistentenmodus von Qwen.

### 2. Few-Shot-Priming verankert es

Die Few-Shot-Beispiele verstärken genau die Muster, die das Modell während des Fine-Tunings gelernt hat. Sie fungieren als **Stilanker** -- selbst wenn das Modell während eines langen Gesprächs leicht in Richtung eines formelleren Tons abdriftet, ziehen die Beispiele im Kontext es zurück.

Die Kombination ist stärker als jeder Mechanismus für sich allein:
- Fine-Tuning ohne Few-Shot: Das Modell ist *im Allgemeinen* locker, aber inkonsistent
- Few-Shot ohne Fine-Tuning: Das Modell versucht, den Beispielen zu folgen, fällt aber immer wieder in den Assistentenmodus zurück
- Fine-Tuning + Few-Shot: Das Modell bleibt **durchgängig** in seiner Rolle

---

## Die Philosophie: kleineres Modell, klügeres Prompting

Die konventionelle Weisheit beim LLM-Deployment lautet "größer ist besser". Mehr Parameter, mehr Trainingsdaten, mehr VRAM. Luna Protocol geht den entgegengesetzten Weg:

- **1,5B statt 3B**: halb so viele Parameter, halb so viel Speicher, doppelte Geschwindigkeit
- **50k Beispiele statt 7,3M**: weniger Trainingsdaten, mehr Flexibilität für In-Context-Lernen
- **Few-Shot-Priming statt System-Prompts**: dem Modell zeigen, was man will, statt es ihm nur zu sagen

Das ist nicht nur eine technische Optimierung -- es ist eine Designphilosophie. Ein Discord-Bot muss kein universeller Assistent sein. Er muss "nm just chillin, u" konsistent, schnell und ohne das gesamte VRAM-Budget des Servers zu verschlingen sagen.

Das Ergebnis: ein Bot, der auf einem VPS für 5 $/Monat läuft, Tokens schnell genug generiert, um wie Echtzeit-Tippen zu wirken, und durch eine Kombination aus Fine-Tuning und Few-Shot-Priming eine konsistente Persönlichkeit aufrechterhält, die mehr ist als die Summe ihrer Teile.

---

## Einrichtung

### Modell herunterladen

```bash
npm run download-model
# Lädt Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf herunter
```

Oder manuell von [HuggingFace](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues).

### Konfigurieren

```yaml
# config.yml
llama_model_path: "./models/Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf"
few_shot_enabled: true
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

### Ausführen

```bash
npm run dev                    # dev (Hot Reload)
npm run build && npm start     # Produktion
./start.sh                     # PM2 (Produktion mit llama-server)
```

---

## Fazit

Die Luna-Protocol-Modelle beweisen, dass bei stilspezifischer konversationeller KI **weniger mehr ist**. Ein 1,5B-Modell, trainiert mit 50k sorgfältig ausgewählten Beispielen und mit ein paar Beispielen geprimt, übertrifft ein 3B-Modell, das mit Millionen von Beispielen trainiert wurde -- bei einem Bruchteil der Speicherkosten und doppelter Generierungsgeschwindigkeit.

Few-Shot-Priming ist nicht nur ein nettes Extra für kleine Modelle. Es ist der Mechanismus, der sie für Echtzeit-Konversationsanwendungen tauglich macht. Die Beispiele "helfen" nicht nur -- sie verändern grundlegend, wie sich das Modell verhält, indem sie genau dem Format entsprechen, mit dem es trainiert wurde.

Der Code ist Open Source, das Modell ist auf HuggingFace, und der Datensatz ist öffentlich. Wer einen Konversationsbot bauen möchte, der sich menschlich anfühlt, dem lautet das Rezept: kleines Modell, begrenztes Fine-Tuning, starkes Few-Shot-Priming.

| Ressource | Link |
|----------|------|
| GitHub-Repository | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Modell (HuggingFace) | [fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) |
| Datensatz | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Erster Artikel | [Luna Protocol: Ich habe einen autonomen Discord-Bot erstellt](/articles/en/luna-protocol-discord-bot) |