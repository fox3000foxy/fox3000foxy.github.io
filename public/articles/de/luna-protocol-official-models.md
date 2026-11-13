---
title: "Luna Protocol: warum ich ein 1,5-Milliarden-Parameter-Modell auf 50k Discord-Samples feingetunt habe, und warum Few-Shot-Priming alles geändert hat"
description: "Ein kleineres Modell trainiert auf weniger Daten kann ein größeres Modell übertreffen, vorausgesetzt man weiß, wie man es gut anstößt. Darum ist Luna Protocol von einem Hermes 3B zu einem Qwen-1,5B-Fine-Tune gewechselt, und warum Few-Shot-Priming vom 'netten Bonus' zum echten Fortschrittsfaktor wurde."
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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "RPSSozraP1nPftowD5j1KaLLdF0DZyspeCXg6AFobCxdS/jn16CRj7wdDgZ/oAfVv7yse0+i9FOG0Wte7/aAOA=="
---

# Luna Protocol: warum ich ein 1,5-Milliarden-Parameter-Modell auf 50k Discord-Samples feingetunt habe, und warum Few-Shot-Priming alles geändert hat

Im [ersten Artikel](/articles/en/luna-protocol-discord-bot) habe ich einen Discord-Bot gebaut, der einen Menschen simuliert: Schlaf, Tippfehler, Zögern, Vergessen, spontane Nachrichten. Das Verhaltenssystem hielt stand. Das LLM dahinter war ein 3-Milliarden-Parameter-Hermes-Modell, quantisiert in Q8_0, 3 GB VRAM verbrauchend.

Das funktionierte. Aber es war überdimensioniert.

Ein Discord-Bot braucht kein 3-Milliarden-Parameter-Modell, um "nm just chillin, u" zu sagen. Was er braucht, ist **stilistische Kohärenz**: Die Fähigkeit, einen präzisen Konversationston beizubehalten, Nachricht für Nachricht, ohne in einen "Corporate-Assistent"-Modus abzudriften. Und es stellt sich heraus, dass ein kleineres Modell, trainiert auf weniger Daten und angestoßen mit ein paar Beispielen, das besser schafft als ein größeres Modell, das via simplem Systemprompt durchforciert.

Dieser Artikel handelt von den offiziellen Luna-Protocol-Modellen: Warum sie existieren, warum 1,5B statt 3B, warum 50k Trainingssamples statt 7,3M, und warum Few-Shot-Priming vom Status "netter Bonus" zum Herzen des ganzen Ansatzes wurde.

---

## Das Problem mit dem 3B-Modell

Die Ursprungskonfiguration nutzte `Discord-Micae-Hermes-3-3B.Q8_0.gguf`, ein 3-Milliarden-Parameter-Modell feingetunt auf Discord-Daten. Es produzierte gute Antworten, aber:

| Metrik | Hermes-3-3B Q8_0 | Ziel |
|--------|-------------------|--------|
| VRAM-Nutzung | ~3 Go | < 1 Go |
| Token-Generierung | ~30 tok/s | ~60+ tok/s |
| Modelldateigröße | ~3,2 Go | < 1 Go |
| Kaltstartzeit | ~8s | ~3s |

Für einen Bot, der 24/7 auf einem bescheidenen Server läuft, sind 3 GB VRAM viel. Und die Generierungsgeschwindigkeit, korrekt für gelegentliche Nachrichten, wirkte schleppend bei Burst-Antworten oder mehreren aktiven Channels.

Die Frage war: Kann man denselben Discord-Dialogues-Stil mit halb so vielen Parametern bekommen?

---

## Die Fine-Tuning-Entscheidung: warum 50k, nicht 7,3M

Das [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues)-Dataset enthält **7,3M Austausche** und **17M Sprechtakte**. Ein massives Korpus echter Discord-Gespräche. Der offensichtliche Ansatz wäre gewesen, auf dem gesamten Dataset zu trainieren.

Ich habe das Gegenteil getan. Ich habe auf **50.000 Samples** trainiert, also weniger als 1 % der verfügbaren Daten.

Darum: **Die Trainingsdatengröße beeinflusst direkt den Overfitting-Grad des Modells gegenüber seiner Trainingsverteilung**.

Ein auf 7,3M Beispielen trainiertes Modell lernt eine sehr spezifische statistische Verteilung von Gesprächen. Es wird exzellent darin, diese Verteilung zu reproduzieren, wird aber auch **starr**: Es hat weniger Spielraum, sich an neue zur Inferencezeit gelieferte Muster anzupassen.

Ein auf 50k Beispielen trainiertes Modell lernt den allgemeinen Ton und das Register von Discord-Gesprächen (informell, kurz, Abkürzungen, Kleinschreibung), behält aber genug Flexibilität, um **von Beispielen im Kontext gesteuert** zu werden. Die Few-Shot-Beispiele kämpfen nicht gegen eine schon gelernte massive Verteilung: Sie ergänzen eine leichtere Verteilung.

Das ist die zentrale Intuition: **Begrenzte Trainingsdaten machen Few-Shot-Priming effektiver**.

---

## Das Modell: technische Details

Das Luna-Protocol-Modell ist ein **QLoRA-Fine-Tune** von [Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct):

| Parameter | Wert |
|-----------|-------|
| Basismodell | `unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit` |
| Methode | QLoRA (4-bit) |
| LoRA-Rang | `r=16`, `lora_alpha=16` |
| Zielmodule | `q/k/v/o_proj`, `gate/up/down_proj` |
| Trainierbare Parameter | 18 464 768 / 1 562 179 072 (1,18 %) |
| Trainingsdaten | ~50 000 Beispiele (Teilmenge von Discord-Dialogues) |
| Filter | 8-512 Tokens pro Sample |
| Epochen | 2-3 |
| Hardware | Kaggle T4 |
| Framework | [Unsloth](https://github.com/unslothai/unsloth) |

Das Dataset ist ein vorverarbeiteter Fork von Discord-Dialogues, gefiltert, um nur saubere `user`/`assistant`-Takte zu behalten: Nur Nutzer- und Assistentenaustausche, ohne Systemnachrichten, Metadaten oder Bot-Commands. Wichtig für die Fortsetzung.

### Verfügbare Quantisierungen

| Datei | Quantisierung | Größe | Anmerkungen |
|------|-------------|------|-------|
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q2_K.gguf` | Q2_K | 676 Mo | Deutlich degradiert, abgeraten |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf` | Q4_K_M | 986 Mo | Guter Größen/Qualitäts-Kompromiss (empfohlen) |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q8_0.gguf` | Q8_0 | 1,65 Go | Beste stilistische Treue |

Das empfohlene Modell ist **Q4_K_M**: Unter 1 GB, schnell, und es bewahrt den Konversationsstil gut. Das Q2_K degradiert zu stark für ein Modell dieser Größe. Das Q8_0 bietet die beste Qualität, verbraucht aber 68 % mehr Speicher.

---

## Der Few-Shot-Priming-Durchbruch

Hier der Teil, der alles geändert hat.

Die Modellkarte auf HuggingFace trägt eine Warnung:

> Mit nacktem Prompt und ohne Anstoß neigt dieses Modell dazu, in Qwens Standard-"Assistenten"-Ton zurückzufallen. Ein kurzer Few-Shot-Anstoß macht einen großen Unterschied.

Das ist eine direkte Folge davon, wie die Trainingsdaten strukturiert wurden.

### Warum Systemprompts allein nicht funktionieren

Die Discord-Dialogues-Trainingsdaten enthalten nur `user`/`assistant`-Takte. Es gibt **kein Systemrollen-Beispiel** im Trainingsset. Das Modell wurde nie trainiert, Systemprompts als Stildirektiven zu folgen.

Wenn man ihm einen Systemprompt a la "Du heißt Luna, rede lässig" gibt, hört es die Instruktion, hat aber kein gelerntes solides Muster, um sie in Output zu übersetzen. Es fällt dann auf Qwens Standardverhalten zurück: Hilfsbereit, strukturiert, leicht formell.

### Warum Few-Shot-Beispiele funktionieren

Wenn man Gesprächsbeispiele im selben ChatML-Format injiziert wie das zum Training genutzte (mit der `user`/`assistant`-Taktstruktur), löst sich etwas aus. Das Modell erkennt das Muster aus seinem Training und richtet seinen Output entsprechend aus.

So sieht ein Few-Shot-Anstoß in der Praxis aus:

```yaml
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

Diese Beispiele werden nach dem Systemprompt und vor der echten Konversation injiziert. Das Modell nimmt sie als Teil der Gesprächshistorie wahr, also als echten Austausch statt als Instruktionen. Eine essenzielle Unterscheidung: Man *zeigt* ihm, wie der lässige Ton aussieht, statt ihn ihm zu *befehlen*.

### Vorher / nachher

Ohne Few-Shot-Anstoß (nackter Systemprompt):

```
User: yo whats good
Bot: Hello! I am doing well, thank you for asking. How can I assist you today?
```

Mit Few-Shot-Anstoß (3 Beispiele):

```
User: yo whats good
Bot: nm just chillin, u
```

Der Unterschied ist flagrant. Das Modell übernimmt das ganze Register: Kleinschreibung, Abkürzungen, lässiger Ton, kurze Antworten. Es kopiert den Stil der Beispiele statt den der Qwen-Trainingsdaten.

---

## Speicher und Geschwindigkeit: die konkreten Zahlen

Der Wechsel von Hermes-3-3B zu Luna-Protocol-1.5B bringt messbare Gewinne:

| Metrik | Hermes-3-3B Q8_0 | Luna-Protocol Q4_K_M | Verbesserung |
|--------|-------------------|----------------------|-------------|
| VRAM-Nutzung | ~3 Go | ~986 Mo | **67 % weniger** |
| Modelldateigröße | ~3,2 Go | ~986 Mo | **69 % kleiner** |
| Token-Generierung | ~30 tok/s | ~60+ tok/s | **2x schneller** |
| Kaltstart | ~8s | ~3s | **62 % schneller** |
| Kontextfenster | 8192 | 8192 | Identisch |

### Warum der Geschwindigkeitsgewinn real ist

Kleinere Modelle sind in der Inference fundamental schneller. Mit 1,5B statt 3B Parametern:

- **Weniger Matrixmultiplikationen** pro Token: Attention-Layer, FFN-Layer und Output-Projektion skalieren alle linear mit der Parameterzahl
- **Bessere Cache-Nutzung**: Das kleinere Modell hält mehr seiner Gewichte im L2/L3-Cache
- **Weniger Speicherbandbreitendruck**: Weniger Bytes pro Token aus dem VRAM zu lesen

Auf einer bescheidenen Config, nur CPU (2 Kerne, ohne GPU), generiert das 1,5B-Modell Tokens mit etwa **2-facher Geschwindigkeit** des 3B-Modells. Das ist der Unterschied zwischen "riecht nach Bot" und "klingt wie eine echte tippende Person".

### Der Prompt-Cache verstärkt den Vorteil

Luna Protocol nutzt `llama-server` mit aktiviertem Prompt-Cache (`--cache-reuse 256`). Das heißt:

1. Die erste Nachricht einer Session zahlt die vollen Prompt-Verarbeitungskosten (Systemprompt + Few-Shot-Beispiele + Nutzernachricht)
2. Folgende Nachrichten verarbeiten nur die *neuen* Tokens, weil der gecachte Präfix wiederverwendet wird
3. Mit 5 Few-Shot-Beispielen (~50-150 Tokens) wird der Overhead nach der ersten Anfrage vernachlässigbar

Die Few-Shot-Beispiele werden in der Praxis nach der ersten Nachricht einer Session "gratis". Das Modell profitiert von Stilführung zu marginalen Nullkosten.

---

## Die Implementierung: wie es im Code funktioniert

Das Few-Shot-System von Luna Protocol ist sauber und minimal. Drei Dateien handhaben alles.

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

Die Konfiguration ist hot-reloadbar. Man ändert die Beispiele, speichert, und der Bot übernimmt sofort den neuen Stil, ohne Neustart.

### 2. Formatierung und Injektion (`src/core/few-shot.ts`)

Die Funktion `formatFewShotExamples()` konvertiert die YAML-Beispiele in ChatML-Nachrichtenobjekte:

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

Die Funktion `injectFewShotIntoConversation()` platziert sie direkt nach dem Systemprompt:

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

Vor jedem LLM-Call werden die Few-Shot-Beispiele injiziert, wenn sie aktiviert sind:

```typescript
let finalMessages = messages;
if (FEW_SHOT_ENABLED && FEW_SHOT_EXAMPLES.length > 0) {
  const fewShotMessages = formatFewShotExamples(FEW_SHOT_EXAMPLES);
  finalMessages = injectFewShotIntoConversation(messages, fewShotMessages);
}
```

Das Modell empfängt: `[system_prompt] + [few_shot_beispiele] + [gesprächshistorie]`

---

## Den Discord-Dialogues-Stil bewahren

Das ursprüngliche Discord-Dialogues-Dataset hat eine sehr spezifische Konversationssignatur:

- **Kurze Nachrichten**: 32,8 Tokens im Schnitt pro Tak
- **Informelles Register**: Abkürzungen, Kleinschreibung, fehlende Interpunktion
- **Schnelle Austausche**: Mehrere kurze Austausche statt langer Monologe
- **Natürliche Imperfektionen**: Tippfehler, "lol", "fr", "ngl", "tbh"

Das Luna-Protocol-Modell bewahrt diesen Stil dank zweier Mechanismen:

### 1. Das Fine-Tuning verschiebt die Basisverteilung

Die 50k Trainingssamples lehren dem Modell den **statistischen Fingerabdruck** von Discord-Gesprächen. Es lernt, dass Antworten typischerweise kurz, kleingeschrieben und informell sind. Das entfernt den Standard-Output des Modells vom "hilfsbereiten Assistenten"-Modus von Qwen.

### 2. Das Few-Shot-Priming verriegelt das Ergebnis

Die Few-Shot-Beispiele verstärken exakt die während des Fine-Tunings gelernten Muster. Sie wirken als **stilistischer Anker**: Selbst wenn das Modell im Laufe einer langen Konversation leicht zu einem formelleren Ton driftet, ziehen die im Kontext vorhandenen Beispiele es zurück.

Die Kombination ist mächtiger als jeder Mechanismus isoliert:
- Fine-Tuning ohne Few-Shot: Das Modell ist *global* lässig, aber inkonsistent
- Few-Shot ohne Fine-Tuning: Das Modell versucht, den Beispielen zu folgen, fällt aber ständig in den Assistentenmodus zurück
- Fine-Tuning + Few-Shot: Das Modell bleibt **konstant** in der Rolle

---

## Die Philosophie: kleineres Modell, smarteres Prompting

Die konventionelle Weisheit im LLM-Deployment sagt "größer ist besser". Mehr Parameter, mehr Trainingsdaten, mehr VRAM. Luna Protocol geht den umgekehrten Weg:

- **1,5B statt 3B**: Halb so viele Parameter, halb so viel Speicher, doppelt so schnell
- **50k Samples statt 7,3M**: Weniger Trainingsdaten, mehr Flexibilität für In-Context-Lernen
- **Few-Shot-Priming statt Systemprompts**: Dem Modell zeigen, was man will, nicht nur sagen

Das ist eine eingestandene Designentscheidung, weit mehr als eine simple technische Optimierung. Ein Discord-Bot muss ein leichter Konversationsbegleiter bleiben statt ein generalistischer Assistent. Er muss "nm just chillin, u" kohärent sagen, schnell, und ohne das ganze VRAM-Budget des Servers zu verschlingen.

Ergebnis: Ein Bot, der auf einem 5-$/Monat-VPS läuft, Tokens schnell genug generiert, um den Eindruck von Echtzeit-Tippen zu geben, und eine kohärente Persönlichkeit dank einer Kombination aus Fine-Tuning und Few-Shot-Priming pflegt, die mehr wert ist als die Summe ihrer Teile.

---

## Einrichtung

### Das Modell herunterladen

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

### Starten

```bash
npm run dev                    # dev (Hot Reload)
npm run build && npm start     # Produktion
./start.sh                     # PM2 (Produktion mit llama-server)
```

---

## Fazit

Die Luna-Protocol-Modelle beweisen, dass für stilfokussierte Konversations-KI **weniger mehr ist**. Ein 1,5B-Modell trainiert auf 50k sorgfältig gewählten Samples, angestoßen mit ein paar Beispielen, übertrifft ein 3B-Modell trainiert auf Millionen Beispielen, für einen Bruchteil der Speicherkosten und doppelte Generierungsgeschwindigkeit.

Few-Shot-Priming bildet den zentralen Mechanismus für kleine Modelle. Es macht sie erst viabel für Echtzeit-Konversationsanwendungen. Die Beispiele tun weit mehr als "helfen": Sie ändern das Modellverhalten fundamental, indem sie exakt das Format kopieren, auf das es trainiert wurde.

Der Code ist Open Source, das Modell liegt auf HuggingFace, und das Dataset ist öffentlich. Wenn du einen Konversationsbot bauen willst, der menschlich wirkt, lautet das Rezept: Kleines Modell, begrenztes Fine-Tuning, solides Few-Shot-Priming.

| Ressource | Link |
|----------|------|
| GitHub-Repo | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Modell (HuggingFace) | [fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Erster Artikel | [Luna Protocol: Ich habe einen autonomen Discord-Bot gebaut](/articles/de/luna-protocol-discord-bot) |
