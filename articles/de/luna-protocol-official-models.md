---
title: "Luna Protocol: Warum ich ein Modell mit 1,5 Milliarden Parametern auf 50k Discord-Beispielen feinabgestimmt habe und warum Few-Shot-Priming alles verändert hat"
description: "Ein kleineres Modell, das mit weniger Daten trainiert wurde, kann ein größeres übertreffen, wenn man es richtig vorbereitet. Warum Luna Protocol von einem Hermes 3B auf einen Qwen-1,5B-Fine-Tune umgestiegen ist und warum Few-Shot-Priming zum eigentlichen Fortschrittstreiber wurde."
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
lang: "de"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "yz4Ubdq0yK0sMGKao21A0N3diff0MshA8pQeiy7m3qMvDknza1EQM7LTtwpuVtLq1TZtQnOdpDcTbpItNHjfqQ=="
---

# Luna Protocol: Warum ich ein Modell mit 1,5 Milliarden Parametern auf 50k Discord-Beispielen feinabgestimmt habe und warum Few-Shot-Priming alles verändert hat

Im [ersten Artikel](/articles/en/luna-protocol-discord-bot) habe ich einen Discord-Bot gebaut, der einen Menschen simuliert: Schlaf, Tippfehler, Zögern, Vergesslichkeit, spontane Nachrichten. Das Verhaltenssystem hat sich bewährt. Das LLM dahinter war ein Hermes-Modell mit 3 Milliarden Parametern, quantisiert als Q8_0, das 3 GB VRAM belegte.

Es hat funktioniert. Aber es war überdimensioniert.

Ein Discord-Bot braucht kein Modell mit 3 Milliarden Parametern, um „nm just chillin, u" zu sagen. Was er braucht, ist **stilistische Konsistenz**: die Fähigkeit, einen präzisen Gesprächston zu halten, Nachricht für Nachricht, ohne in den Modus „Unternehmensassistent" abzurutschen. Und es zeigt sich, dass ein kleineres Modell, das mit weniger Daten trainiert und mit ein paar Beispielen vorbereitet wurde, das besser schafft als ein größeres Modell, dem man nur einen einfachen System-Prompt gibt.

Dieser Artikel behandelt die offiziellen Modelle von Luna Protocol: warum es sie gibt, warum 1,5B statt 3B, warum 50k Trainingsbeispiele statt 7,3 Millionen und warum Few-Shot-Priming von einem „netten Bonus" zum Herzstück des ganzen Ansatzes geworden ist.

---

## Das Problem mit dem 3B-Modell

Das ursprüngliche Setup nutzte `Discord-Micae-Hermes-3-3B.Q8_0.gguf`, ein Modell mit 3 Milliarden Parametern, das auf Discord-Daten feinabgestimmt war. Es lieferte gute Antworten, aber:

| Kennzahl | Hermes-3-3B Q8_0 | Ziel |
|--------|-------------------|--------|
| VRAM-Verbrauch | ~3 GB | < 1 GB |
| Token-Generierung | ~30 Tok/s | ~60+ Tok/s |
| Dateigröße des Modells | ~3,2 GB | < 1 GB |
| Kaltstartzeit | ~8 s | ~3 s |

Für einen Bot, der rund um die Uhr auf einem bescheidenen Server läuft, sind 3 GB VRAM viel. Und die Generierungsgeschwindigkeit, für gelegentliche Nachrichten ausreichend, fühlte sich bei Burst-Antworten oder mehreren aktiven Kanälen träge an.

Die Frage war: Lässt sich derselbe Discord-Dialogstil mit der Hälfte der Parameter erreichen?

---

## Die Entscheidung zum Fine-Tuning: warum 50k statt 7,3 Millionen

Der Datensatz [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) umfasst **7,3 Millionen Austausche** und **17 Millionen Turns**. Es ist ein riesiges Korpus echter Discord-Gespräche. Der naheliegende Ansatz wäre, den gesamten Datensatz zu verwenden.

Ich habe das Gegenteil getan. Ich habe mit **50.000 Beispielen** trainiert, also weniger als 1 % der verfügbaren Daten.

Der Grund: **Die Größe des Trainingssets bestimmt direkt, wie stark das Modell an seine Trainingsverteilung angepasst wird.**

Ein Modell, das mit 7,3 Millionen Beispielen trainiert wird, lernt eine sehr spezifische statistische Verteilung von Gesprächen. Es wird hervorragend darin, diese Verteilung nachzubilden, wird aber auch **starr**: Es hat weniger Spielraum, sich an neue Muster anzupassen, die erst zur Inferenzzeit vorgegeben werden.

Ein Modell, das mit 50k Beispielen trainiert wird, lernt den allgemeinen Ton und das Register von Discord-Gesprächen (informell, kurz, Abkürzungen, Kleinschreibung), behält aber genug Flexibilität, um **durch Beispiele im Kontext gesteuert** zu werden. Few-Shot-Beispiele kämpfen nicht gegen eine riesige, bereits gelernte Verteilung an: Sie vervollständigen eine leichtere.

Das ist die Kerneinsicht: **Begrenzte Trainingsdaten machen Few-Shot-Priming wirksamer.**

---

## Das Modell: technische Details

Das Luna-Protocol-Modell ist ein **QLoRA-Fine-Tune** von [Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct):

| Parameter | Wert |
|-----------|-------|
| Basismodell | `unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit` |
| Methode | QLoRA (4-Bit) |
| LoRA-Rang | `r=16`, `lora_alpha=16` |
| Angesprochene Module | `q/k/v/o_proj`, `gate/up/down_proj` |
| Trainierbare Parameter | 18.464.768 / 1.562.179.072 (1,18 %) |
| Trainingsdaten | ~50.000 Beispiele (Teilmenge von Discord-Dialogues) |
| Filter | 8–512 Token pro Beispiel |
| Epochen | 2–3 |
| Hardware | Kaggle T4 |
| Framework | [Unsloth](https://github.com/unslothai/unsloth) |

Der Datensatz ist ein vorverarbeiteter Fork von Discord-Dialogues, gefiltert auf saubere `user`/`assistant`-Turns: nur Austausche zwischen Nutzer und Assistent, keine System-Nachrichten, keine Metadaten, keine Bot-Befehle. Das ist für das Folgende wichtig.

### Verfügbare Quantisierungen

| Datei | Quantisierung | Größe | Hinweise |
|------|-------------|------|-------|
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q2_K.gguf` | Q2_K | 676 MB | Deutlich verschlechtert, nicht empfohlen |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf` | Q4_K_M | 986 MB | Gutes Verhältnis von Größe und Qualität (empfohlen) |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q8_0.gguf` | Q8_0 | 1,65 GB | Beste stilistische Treue |

Das empfohlene Modell ist **Q4_K_M**: unter 1 GB, schnell und mit gutem Erhalt des Gesprächsstils. Q2_K verschlechtert sich bei dieser Modellgröße zu stark. Q8_0 liefert die beste Qualität, verbraucht aber 68 % mehr Speicher.

---

## Der Durchbruch beim Few-Shot-Priming

Hier liegt der Teil, der alles verändert hat.

Die HuggingFace-Seite des Modells enthält eine Warnung:

> Mit einem nackten Prompt ohne Priming neigt dieses Modell dazu, in den Standard-„Assistenten"-Ton von Qwen zurückzufallen. Ein kurzes Few-Shot-Priming macht einen großen Unterschied.

Das ist eine direkte Folge davon, wie die Trainingsdaten aufgebaut waren.

### Warum System-Prompts allein nicht funktionieren

Die Discord-Dialogues-Trainingsdaten enthalten nur `user`/`assistant`-Turns. Im Trainingsset gibt es **kein Beispiel mit Systemrolle**. Das Modell wurde nie darauf trainiert, System-Prompts als Stilvorgaben zu befolgen.

Gibt man ihm einen System-Prompt wie „Dein Name ist Luna, sprich locker", hört es die Anweisung, hat aber kein festes gelerntes Muster, um sie in Ausgabe umzusetzen. Also fällt es auf das Standardverhalten von Qwen zurück: hilfsbereit, strukturiert, leicht förmlich.

### Warum Few-Shot-Beispiele funktionieren

Wenn man Gesprächsbeispiele im selben ChatML-Format einfügt, das beim Training verwendet wurde (mit der Struktur `user`/`assistant`), klickt etwas. Das Modell erkennt das Muster aus dem Training und richtet seine Ausgabe entsprechend aus.

So sieht Few-Shot-Priming in der Praxis aus:

```yaml
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

Diese Beispiele werden nach dem System-Prompt und vor dem echten Gespräch eingefügt. Das Modell nimmt sie als Teil des Gesprächsverlaufs wahr, also als echten Austausch und nicht als Anweisung. Das ist ein wesentlicher Unterschied: Man **zeigt** dem Modell, wie der lockere Ton aussieht, statt ihn zu **befehlen**.

### Vorher / nachher

Ohne Few-Shot-Priming (nur System-Prompt):

```
User: yo whats good
Bot: Hello! I am doing well, thank you for asking. How can I assist you today?
```

Mit Few-Shot-Priming (3 Beispiele):

```
User: yo whats good
Bot: nm just chillin, u
```

Der Unterschied ist drastisch. Das Modell übernimmt das gesamte Register: Kleinschreibung, Abkürzungen, lockerer Ton, kurze Antworten. Es spiegelt den Stil der Beispiele wider, statt der Trainingsdaten von Qwen.

---

## Speicher und Geschwindigkeit: die konkreten Zahlen

Der Wechsel von Hermes-3-3B auf Luna-Protocol-1.5B bringt messbare Gewinne:

| Kennzahl | Hermes-3-3B Q8_0 | Luna-Protocol Q4_K_M | Verbesserung |
|--------|-------------------|----------------------|-------------|
| VRAM-Verbrauch | ~3 GB | ~986 MB | **67 % weniger** |
| Dateigröße des Modells | ~3,2 GB | ~986 MB | **69 % kleiner** |
| Token-Generierung | ~30 Tok/s | ~60+ Tok/s | **2x schneller** |
| Kaltstart | ~8 s | ~3 s | **62 % schneller** |
| Kontextfenster | 8192 | 8192 | identisch |

### Warum der Geschwindigkeitsgewinn echt ist

Kleinere Modelle sind bei der Inferenz grundsätzlich schneller. Mit 1,5 Milliarden statt 3 Milliarden Parametern gilt:

- **Weniger Matrixmultiplikationen** pro Token: Attention-Schichten, FFN-Schichten und die Ausgabeprojektion skalieren linear mit der Parameterzahl
- **Besser genutzter Cache**: Das kleinere Modell passt mehr seiner Gewichte in den L2/L3-Cache
- **Weniger Druck auf die Speicherbandbreite**: pro Token müssen weniger Bytes aus dem VRAM gelesen werden

Auf einem bescheidenen CPU-only-Setup (2 Kerne, keine GPU) erzeugt das 1,5B-Modell Token mit etwa **doppelter Geschwindigkeit** des 3B-Modells. Das ist der Unterschied zwischen „riecht nach Bot" und „wirkt wie ein echter Mensch beim Tippen".

### Der Prompt-Cache verstärkt den Vorteil

Luna Protocol nutzt `llama-server` mit aktiviertem Prompt-Cache (`--cache-reuse 256`). Das bedeutet:

1. Die erste Nachricht einer Sitzung zahlt die volle Kosten der Prompt-Verarbeitung (System-Prompt + Few-Shot-Beispiele + Nutzernachricht)
2. Spätere Nachrichten verarbeiten nur die *neuen* Token, weil das gecachte Präfix wiederverwendet wird
3. Bei 5 Few-Shot-Beispielen (~50–150 Token) wird der Mehraufwand nach der ersten Anfrage vernachlässigbar

Few-Shot-Beispiele werden nach der ersten Nachricht einer Sitzung praktisch kostenlos. Das Modell erhält die Stilvorgabe zu nahezu null Grenzkosten.

---

## Die Umsetzung: wie es im Code funktioniert

Das Few-Shot-System von Luna Protocol ist sauber und minimal. Drei Dateien erledigen alles.

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

Die Konfiguration lässt sich im laufenden Betrieb neu laden. Du änderst die Beispiele, speicherst, und der Bot übernimmt den neuen Stil sofort, ohne Neustart.

### 2. Formatierung und Einfügen (`src/core/few-shot.ts`)

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

Vor jedem LLM-Aufruf werden die Few-Shot-Beispiele eingefügt, sofern aktiviert:

```typescript
let finalMessages = messages;
if (FEW_SHOT_ENABLED && FEW_SHOT_EXAMPLES.length > 0) {
  const fewShotMessages = formatFewShotExamples(FEW_SHOT_EXAMPLES);
  finalMessages = injectFewShotIntoConversation(messages, fewShotMessages);
}
```

Das Modell erhält: `[System-Prompt] + [Few-Shot-Beispiele] + [Gesprächsverlauf]`

---

## Den Stil von Discord-Dialogues erhalten

Der ursprüngliche Datensatz Discord-Dialogues hat eine sehr spezifische Gesprächssignatur:

- **Kurze Nachrichten**: durchschnittlich 32,8 Token pro Turn
- **Informelles Register**: Abkürzungen, Kleinschreibung, keine Interpunktion
- **Schnelle Wortwechsel**: mehrere kurze Austausche statt langer Monologe
- **Natürliche Unvollkommenheiten**: Tippfehler, „lol", „fr", „ngl", „tbh"

Das Luna-Protocol-Modell bewahrt diesen Stil über zwei Mechanismen:

### 1. Das Fine-Tuning verschiebt die Grundverteilung

Die 50k Trainingsbeispiele vermitteln dem Modell den **statistischen Fingerabdruck** von Discord-Gesprächen. Es lernt, dass Antworten typischerweise kurz, kleingeschrieben und informell sind. Das verschiebt die Standardausgabe des Modells weg vom „hilfsbereiten Assistenten" von Qwen.

### 2. Few-Shot-Priming fixiert das Ergebnis

Few-Shot-Beispiele verstärken genau die Muster, die beim Fine-Tuning gelernt wurden. Sie wirken als **stilistischer Anker**: Selbst wenn das Modell im Laufe eines langen Gesprächs leicht zu einem förmlicheren Ton driftet, ziehen die Beispiele im Kontext es zurück.

Die Kombination schlägt jeden Mechanismus für sich:
- Fine-Tuning ohne Few-Shot: Das Modell ist *grundsätzlich* locker, aber inkonsistent
- Few-Shot ohne Fine-Tuning: Das Modell versucht, den Beispielen zu folgen, fällt aber immer wieder in den Assistentenmodus zurück
- Fine-Tuning + Few-Shot: Das Modell bleibt **durchgehend** in seiner Rolle

---

## Die Philosophie: kleineres Modell, klügeres Prompting

Die übliche Weisheit beim Einsatz von LLMs lautet: größer ist besser. Mehr Parameter, mehr Trainingsdaten, mehr VRAM. Luna Protocol geht den umgekehrten Weg:

- **1,5B statt 3B**: halb so viele Parameter, halber Speicher, doppelt so schnell
- **50k Beispiele statt 7,3 Millionen**: weniger Trainingsdaten, mehr Flexibilität beim In-Context-Learning
- **Few-Shot-Priming statt System-Prompts**: dem Modell zeigen, was man will, nicht nur sagen

Das ist eine bewusste Designentscheidung und weit mehr als eine technische Optimierung. Ein Discord-Bot muss ein leichter Gesprächsbegleiter bleiben und kein Allzweck-Assistent. Er muss konsequent „nm just chillin, u" sagen können, schnell, und ohne das gesamte VRAM-Budget des Servers zu fressen.

Ergebnis: ein Bot, der auf einem VPS für 5 Dollar im Monat läuft, Token schnell genug generiert, um sich wie Echtzeit-Tippen anzufühlen, und eine kohärente Persönlichkeit durch die Kombination aus Fine-Tuning und Few-Shot-Priming beibehält, die mehr wert ist als die Summe ihrer Teile.

---

## Einrichtung

### Modell herunterladen

```bash
npm run download-model
# Lädt Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf
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

### Starten

```bash
npm run dev                    # Entwicklung (Hot Reload)
npm run build && npm start     # Produktion
./start.sh                     # PM2 (Produktion mit llama-server)
```

---

## Fazit

Die Luna-Protocol-Modelle zeigen, dass bei stilgetriebener Gesprächs-KI **weniger mehr ist**. Ein Modell mit 1,5 Milliarden Parametern, trainiert auf 50k sorgfältig ausgewählten Beispielen und mit wenigen Beispielen vorbereitet, übertrifft ein Modell mit 3 Milliarden Parametern, das mit Millionen Beispielen trainiert wurde, bei einem Bruchteil des Speicherbedarfs und doppelter Generierungsgeschwindigkeit.

Few-Shot-Priming ist der Kernmechanismus für kleine Modelle. Er macht sie für Echtzeit-Gesprächsanwendungen tragfähig. Beispiele leisten weit mehr als „helfen": Sie verändern das Verhalten des Modells grundlegend und spiegeln genau das Format wider, auf dem es trainiert wurde.

Der Code ist Open Source, das Modell liegt auf HuggingFace, und der Datensatz ist öffentlich. Wenn du einen Gesprächsbot bauen willst, der sich menschlich anfühlt, lautet das Rezept: kleines Modell, begrenztes Fine-Tuning, solides Few-Shot-Priming.

| Ressource | Link |
|----------|------|
| GitHub-Repo | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Modell (HuggingFace) | [fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) |
| Datensatz | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Erster Artikel | [Luna Protocol: Ich habe einen autonomen Discord-Bot gebaut](/articles/en/luna-protocol-discord-bot) |
