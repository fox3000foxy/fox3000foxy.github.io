---
title: "Luna Protocol: Warum habe ich ein Modell von 1,5 Milliarden Parametern auf 50k Discord Proben, und warum few-shot priming hat alles verändert"
description: "Ein kleineres Modell, das auf weniger Daten angetrieben wird, kann ein größeres Modell übertreffen – vorausgesetzt, es kann gut gestartet werden. Deshalb ist Luna Protocol von einem Hermes 3B auf einen feinen Qwen 1,5B-Tunnel übergegangen, und warum der few-shot priming der eigentliche Fortschrittsfaktor geworden ist."
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
---
# 

Im [premier article](/articles/en/luna-protocol-discord-bot)Ich baute einen Discord-Bot, der einen Menschen simuliert: Schlaf, Klopfenfehler, Zögern, Vergessenheit, spontane Nachrichten. Das Verhaltenssystem hielt den Weg. Das LLM hinter all dem war ein Hermes Modell mit 3 Milliarden Parametern, quantifiziert in Q8_0, und verbrauchte 3 GB VRAM.

Es funktionierte, aber es war überdimensioniert.

Ein Dicord-Bot braucht kein Modell von 3 Milliarden Parametern, um ✓ nm just chillin, u zu sagen. Was er braucht, ist **stilistische Kohärenz**: die Fähigkeit, einen präzisen Ton zu halten, Nachricht nach Nachricht, ohne in einen Modus zu ziehen ✓ corporate Assistent ←. Und es stellt sich heraus, dass ein kleineres Modell, das auf weniger Daten angetrieben und mit einigen Beispielen begonnen wird, es besser schafft, als ein größeres Modell zu erreichen, das den Durchgang über ein einfaches schnelles System zwingt.

Dieser Artikel behandelt die offiziellen Modelle von Luna Protocol: warum sie existieren, warum 1,5B statt 3B, warum 50k Trainingsproben statt 7,3M, und warum der Few-Shot Priming von dem Status des ✓ netten Bonus ✓ zu dem Herz des gesamten Annäherungs.

---

## Das Problem mit dem Modell 3B

Die ursprüngliche Konfiguration verwendete`Discord-Micae-Hermes-3-3B.Q8_0.gguf`, ein Modell von 3 Milliarden fein-getönten Parametern auf Discord Daten. Es lieferte gute Antworten, aber:

| Metrisch | Hermes-3-3B Q8_0 | Ziel |
|--------|-------------------|--------|
| Verwendung von VRAM | ~3GB | < 1 GB |
| Generierung von Token | ~30 tok/s | ~60+ tok/s |
| Dateigröße Vorlage | ~3,2 GB | < 1 GB |
| Kaltstartzeit | ~8s | ~3s |

Für einen 24/7-Bot auf einem bescheidenen Server, 3 GB VRAM, ist das eine Menge. Und die Erzeugungsgeschwindigkeit, die für gelegentliche Nachrichten korrekt war, schien staubig zu sein, wenn man mit einer Rafale oder mehreren aktiven Kanälen reagierte.

Die Frage war: Können wir den gleichen Discord-Dialogstil mit doppelten Parametern erhalten?

---

## Die Fine-Tuning Entscheidung: Warum 50k, nicht 7,3M

Der Datensatz [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues)enthält **7,3M Austausch** und **17M Sprachtouren**. Es ist ein massives Korpus echter Discord-Gespräche. Der offensichtliche Ansatz wäre gewesen, über den gesamten Satz von Daten zu führen.

Ich habe das Gegenteil getan. Ich habe **50.000 Proben**, das sind weniger als 1 % der verfügbaren Daten, gezogen.

Hier ist der Grund: **Die Größe des Trainingsspiels beeinflusst direkt den Grad der Überlernung des Modells gegenüber seiner Trainingsverteilung**.

Ein Modell, das auf 7,3M-Beispielen getrieben wird, erlernt eine sehr spezifische statistische Verteilung der Gespräche. Es wird ausgezeichnet, um diese Verteilung zu reproduzieren, aber es wird auch **rigid**: es hat weniger Spielraum, sich an neue Motive anzupassen, die zum Zeitpunkt der Inferenz zur Verfügung gestellt werden.

Ein Modell, das mit 50 k Beispielen angetrieben wird, erlernt den Ton und das allgemeine Register der Discord-Gespräche (informal, kurz, Abkürzungen, winzig), aber es behält genügend Flexibilität, um ** durch Beispiele im Kontext gepilotet zu werden**. Die Beispiele few-shot kämpfen nicht gegen eine bereits gelernte Massenverteilung: sie ergänzen eine leichtere Verteilung.

Dies ist die zentrale Intuition: **Begrenzte Trainingsdaten machen Few-Shot Priming effizienter**.

---

## Das Modell: Technische Details

Das Modell Luna Protocol ist ein **Fine-tune QLoRA** von [Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct):

| Parameter | Wert |
|-----------|-------|
| Grundmodell | `unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit` |
| Methode | QLoRA (4-bit) |
| Rang LoRA | `r=16` , `lora_alpha=16` |
| Zielmodule | `q/k/v/o_proj` , `gate/up/down_proj` |
| Zu motivierende Parameter | 18 464 768 / 1 562 179 072 (1,18 %) |
| Trainingsdaten | ~50 000 Beispiele (Teilmenge von Discord-Dialogen) |
| Filter | 8-512 Tokens je Probe |
| Epochen | 2-3 |
| Material | Kaggle T4 |
| Framework | [Unsloth](https://github.com/unslothai/unsloth) |

Der Datensatz ist ein vordefinierter Fork von Discord-Dialogen, gefiltert, um nur Tricks zu behalten`user` / `assistant`Eigen: Nur Benutzer- und Assistentenaustausch, ohne Systemnachrichten, Metadaten oder Botbefehle.

### Verfügbare Quantifikatoren

| Datei | Quantifizierung | Größe | Bemerkungen |
|------|-------------|------|-------|
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q2_K.gguf` | Q2_K | 676 MB | Schärfe Verschwommenheit – nicht empfohlen |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf` | Q4_K_M | 986 MB | Guter Kompromiss Größe/Qualität (empfohlen) |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q8_0.gguf` | Q8_0 | 1,65 GB | Bessere stilistische Treue |

Das empfohlene Modell ist **Q4_K_M**: weniger als 1 GB, schnell und hält den Konversationsstil gut. Q2_K verschlechtert sich zu sehr für ein Modell dieser Größe. Q8_0 bietet die beste Qualität, verbraucht aber 68 % Speicher zusätzlich.

---

## Der Durchbruch des Few-Shot Priming

Das ist der Teil, der alles verändert hat.

Das Musterblatt auf HuggingFace enthält eine Warnung:

> Mit einem nackten und bootfreien Tempo neigt dieses Modell dazu, in Qwens Standardton zu sinken. Ein kurzer Start von few-shot macht einen großen Unterschied.

Dies ist eine direkte Folge der Art und Weise, wie Trainingsdaten strukturiert wurden.

### Warum die schnellen Systeme allein nicht funktionieren

Discord-Dialoge Trainingsdaten enthalten nur Drehungen`user` / `assistant`. Es gibt keine Beispiele für Systemrollen** im Trainingsspiel. Das Modell wurde nie dazu geführt, dass schnell ein System als Stilrichtlinien folgt.

Wenn man ihm ein schnelles System des Typs ✓ gibt, nenne dich Luna, sprich entspannt ←, hört er die Anweisung, hat aber keinen starken Grund, sie in den Ausgang zu übersetzen. Es fällt auf das Standardverhalten von Qwen zurück: hilfsbereit, strukturiert, leicht formal.

### Warum few-shot-Beispiele funktionieren

Wenn du Beispiele für ChatML-Konversation in das gleiche Format wie das beim Training (mit der Turmstruktur)`user` / `assistant`Das Modell erkennt das Motiv aus seinem Training und passt seinen Ausgang entsprechend an.

So sieht ein Few-Shot-Start in der Praxis aus:
```yaml
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```
Diese Beispiele werden nach dem schnellen System und vor dem wahren Gespräch injiziert. Das Modell sieht sie als Teil der Gesprächsgeschichte, also als einen echten Austausch statt als Anweisungen. Es ist eine wesentliche Unterscheidung: es wird gezeigt* wie der entspannte Ton aussah, anstatt es zu ordnen*.

### Vor / nach

Ohne Start few-shot (Business System Prompt):
```
User: yo whats good
Bot: Hello! I am doing well, thank you for asking. How can I assist you today?
```
Mit few-shot (3 Beispiele)
```
User: yo whats good
Bot: nm just chillin, u
```
Der Unterschied ist eklatant. Das Modell nimmt das ganze Register an: winzig, Abkürzungen, Ton entspannt, kurze Antworten. Es legt den Stil der Beispiele statt des Qwen Trainingsdaten.

---

## Speichern und Geschwindigkeit: Konkrete Zahlen

Der Übergang von Hermes-3-3B zu Luna-Protocol-1.5B bringt messbare Gewinne:

| Metrisch | Hermes-3-3B Q8_0 | Luna-Protocol Q4_K_M | Verbesserung |
|--------|-------------------|----------------------|-------------|
| Verwendung von VRAM | ~3GB | ~986 MB | **67 % weniger** |
| Dateigröße Vorlage | ~3,2 GB | ~986 MB | **69 % kleiner** |
| Generierung von Token | ~30 tok/s | ~60+ tok/s | **2x schneller** |
| Kaltstart | ~8s | ~3s | **62 % schneller** |
| Kontextfenster | 8192 | 8192 | Genauso wie die anderen. |

### Warum die Geschwindigkeitsgewinne real sind

Kleinere Modelle sind im Grunde schneller in der Inferenz. Mit 1,5B Parameter anstelle von 3B:

- **Weniger Matrix-Vermehrung** durch Token: Die Aufmerksamkeitsschichten, die FFN-Schichten und die Ausgabeprojektion entwickeln sich alle linear mit der Anzahl der Parameter
- **Beste Verwendung des Cache**: Das kleinere Modell hält mehr Gewicht in der L2/L3-Cache
- **Weniger Druck auf die Speicherbandbreite**: Weniger Bytes, die von der VRAM per Token gelesen werden

Bei einer bescheidenen Konfiguration erzeugt CPU allein (2 Kerne, ohne GPU) das 1,5B-Modell Tokens mit etwa **2 mal der Geschwindigkeit** des 3B-Musters. Dies ist der Unterschied zwischen ^ riecht nach Bot ✓ und ^ man sieht aus wie eine echte Person, die ^ tippen.

### Schnelle Cache verstärkt den Vorteil

Luna Protocol verwendet`llama-server`mit aktiviertem Schnellabschirm (`–cache-reuse 256`) bedeutet:

1. Die erste Nachricht einer Sitzung zahlt die vollen Kosten der Bearbeitung des Schnelllaufs (Systemprompt + Beispiel few-shot + Benutzernachricht)
2. Die folgenden Nachrichten werden nur mit *neuen* tokens behandelt, da das Zwischenspeicher-Präfix wiederverwendet wird.
3. Mit 5 Beispielen few-shot (~50-150 tokens) wird der Zusatzkostennach der ersten Abfrage vernachlässigbar.

Die Beispiele few-shot werden nach der ersten Nachricht einer Sitzung in der Praxis kostenlos ✓. Das Modell erhält eine Stilführung mit einem Grenzkosten-Null.

---

## Implementation: Wie es im Code funktioniert

Das Few-Shot-System von Luna Protocol ist sauber und minimal. Drei Dateien verwalten alles.

### 1. Einstellungen (`config.yml`)
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
Die Konfiguration ist heiß aufladbar. Beispiele werden geändert, aufgezeichnet und der Bot nimmt den neuen Stil sofort an, ohne erneut zu starten.

### 2. Formatierung und Injektion (`src/core/few-shot.ts`)

Funktion`formatFewShotExamples()`Konvertiert Yaml-Beispiele in ChatML-Nachrichtenobjekte:
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
Funktion`injectFewShotIntoConversation()`die Stelle unmittelbar nach dem schnellen System:
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

Vor jedem Anruf auf LLM werden die Beispiele few-shot injiziert, wenn sie aktiviert sind:
```typescript
let finalMessages = messages;
if (FEW_SHOT_ENABLED && FEW_SHOT_EXAMPLES.length > 0) {
  const fewShotMessages = formatFewShotExamples(FEW_SHOT_EXAMPLES);
  finalMessages = injectFewShotIntoConversation(messages, fewShotMessages);
}
```
Das Modell erhält:`[prompt_système] + [exemples_few_shot] + [historique_de_conversation]`

---

## Discord-Dialoge beibehalten

Das ursprüngliche Discord-Dialoge-Datensatz hat eine sehr spezifische Konversation Unterschrift:

- **Kurze Nachrichten** durchschnittlich 32,8 tokens pro Drehung
- **Informelles Register**: Abkürzungen, winzige Abkürzungen, keine Interpunktion
- **Schnellwechsel**: mehrere kurze statt lange Monologe
- **Naturbedingte Verletzungen**: Tippfehler, ✓ lol ✓, ← fr having, ← ngl approximate, having tbh Ё

Das Modell Luna Protocol bewahrt diesen Stil mit zwei Mechanismen:

### 1. Fine-Tuning bewegt die Basisverteilung

Die 50k Trainingsproben lehren das Modell den statistischen Abdruck** der Discord-Gespräche. Er erfährt, dass die Antworten typischerweise kurz, klein und informell sind. Dies entfernt die Standardausgabe des Modus ✓ hilfsbereiter Assistenten von Qwen.

### 2. Die few-shot priming sperrt das Ergebnis

Die Beispiele few-shot verstärken genau die während des Fine-Tuning gelernten Motive. du wirken wie ** stilistische Verankerung**: Auch wenn das Modell während eines langen Gesprächs leicht in einen formelleren Ton ableitet, werden die im Kontext enthaltenen Beispiele durch die im Zusammenhang enthaltenen Beispiele zurückgebracht.

Die Kombination ist stärker als jeder einzelne Mechanismus:

- Fine-Tuning ohne Few-Shot: Das Modell ist insgesamt* entspannt, aber unbeständig

- Few-shot ohne Feintuning: Das Modell versucht, den Beispielen zu folgen, fällt aber immer wieder im Assistentenmodus zurück

- Fine-Tuning + few-shot: Das Modell bleibt **consultant** im Charakter

---

## Philosophie: kleineres Modell, cleverer Playing

Die herkömmliche Weisheit in der Einführung von LLM sagt ✓ größer, es ist besser ←. Mehr Parameter, mehr Trainingsdaten, mehr VRAM. Luna Protocol nimmt den umgekehrten Weg:

- **1,5B statt 3B**: Hälfte weniger Parameter, Hälfte weniger Speicher, doppelt so schnell
- **50k Proben statt 7,3M**: weniger Trainingsdaten, mehr Flexibilität für das Lernen im Kontext
- **Few-shot priming statt schnelle System**: zeigen dem Modell, was man will, nicht nur sagen es ihm

Es ist eine akzeptierte Design-Entscheidung, mehr als nur eine technische Optimierung. Ein Discord-Bot muss ein leichter Gesprächsgefährte bleiben anstatt ein allgemeiner Assistent. Er muss sagen ✓ nm just chillin, u ← konsequent, schnell und ohne das gesamte VRAM-Budget des Servers zu verschlingen.

Ergebnis: Ein Bot, der auf einem 5 $/Monat VPS läuft, erzeugt Tokens schnell genug, um den Eindruck eines Echtzeit-Schlags zu geben, und hält eine kohärente Persönlichkeit durch eine Kombination von Fine-Tuning und Few-Shot Priming, die mehr als die Summe seiner Teile wert ist.

---

## Einrichtung

### Vorlage herunterladen
```bash
npm run download-model
# Download Luna-Protocol-1.5 B-Fine-Tuned-Qwen2.5 . Q4_K_M.gguf
```
Oder manuell aus [HuggingFace](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) .

### Einrichten
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
### Start
```bash
npm run dev                    # dev (rechargement à chaud)
npm run build && npm start     # production
./start.sh                     # PM2 (production avec llama-server)
```
---

## Schlussfolgerung

Die Modelle Luna Protocol zeigen, dass für eine styleorientierte IA-Konversation **weniger besser** ist. Ein 1,5B-Modell, das mit sorgfältig ausgewählten 50k-Proben angetrieben wird, mit einigen Beispielen begonnen, übertrifft ein 3B- Modell, das auf Millionen von Beispielen, auf einen Bruchteil der Speicherkosten und auf eine doppelte Generationsgeschwindigkeit angetrieben wird.

Few-shot priming ist der zentrale Mechanismus für kleine Modelle, der sie für Echtzeit-Konversationszwecke lebensfähig macht. Beispiele helfen viel mehr als ✓: Sie verändern das Verhalten des Modells grundlegend und passen das Format genau an, auf dem es angetrieben wurde.

Der Code ist Open Source, das Modell ist auf HuggingFace, und das Datenspiel ist öffentlich. Wenn du einen Gesprächsbot bauen wollen, der den Eindruck von Mensch gibt, ist das Rezept: kleines Modell, begrenztes Fine-Tuning, solides Few-Shot-Boot.

| Ressourcen | Zusammenhang |
|----------|------|
| GitHub-Einreichung | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Modell (HuggingFace) | [fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) |
| Datensatz | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Artikel 1 | [Luna Protocol: j'ai créé un bot Discord autonome](/articles/en/luna-protocol-discord-bot) |
