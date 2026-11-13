---
title: "Luna Protocol: Gehirn-Pooling, emotionale Klassifikation und interessant/futil-Routing"
description: "Luna Protocol ist von einem Monolithen zu einer Vier-Schichten-Architektur geworden: Adapter, Brain, emotionaler Klassifizierer und Inference. Auf dem Programm: Embedding-Centroide, interessant/futil-Routing und Anpassung der LLM-Parameter nach Valenz und Arousal."
date: 2026-07-27
tags:
  - discord
  - matrix
  - llm
  - architecture
  - embeddings
  - centroids
  - emotion-ai
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "XrHu/1YkX/G0KTAPkIebG35sjj1xTjqt2T/IeOfG0MPKwpExPc+DTXt9/3+pj9G1GpMZpmfytQKHpXLQf8Fzvw=="
---

# Luna Protocol: Gehirn-Pooling, emotionale Klassifikation und interessant/futil-Routing

In den [zwei](/articles/fr/luna-protocol-discord-bot) [vorherigen Artikeln](/articles/fr/luna-protocol-official-models) habe ich Luna Protocol als einen einzigen Discord-Bot mit komplexem Verhaltenssystem und feingetuntem Modell vorgestellt. Aber die Architektur hat sich seitdem gut weiterentwickelt. Was ein Monolith war: Ein einziger Node.js-Prozess, der zugleich Discord-Bot, Verhalten und LLM-Calls handhabte, hat sich in **vier unabhängige Schichten** verwandelt, jede mit eigener Verantwortung, eigener Sprache und eigenem Lebenszyklus.

Diese Trennung brachte unerwartete Vorteile: Das Pooling der "Gehirne" zwischen mehreren Plattformen, ein emotionales Klassifikationssystem, das die LLM-Parameter dynamisch anpasst, und ein intelligentes Routing der Nachrichten zwischen zwei Modellen je nach wahrgenommener Wichtigkeit der Konversation.

Die Evolution passierte nicht auf einmal: Sie folgte einem organischen Weg. Ich habe zuerst den `server/`-Ordner aus dem Bot-Repo getrennt und so **Krystal** auf der einen Seite geschaffen und **Jade** als Discord-Adapter gelassen. Dann habe ich **Pixieglow** (Matrix-Adapter) erstellt, indem ich `llm-core` und den Eventbus von Jade wiederverwendet habe. Danach kam **Sapphire**, um eine GENERIC/SEMANTIC-Klassifikation mit DistilBERT einzuführen. Die Ergebnisse waren nicht überzeugend, also bin ich zu Embedding-Centroiden übergegangen, formbarer für Beispielanreicherung und präziser; die Klassifikation wurde FUTILE/INTERESSANT. Schließlich habe ich **Valenz**- und **Arousal**-Centroide hinzugefügt, um Temperatur und Repeat Penalty des LLM zu regulieren. Zum Schluss habe ich den ganzen redundanten Code zwischen Jade und Pixieglow beseitigt, indem ich **Emerald** geschaffen habe, das gepoolte Gehirn, und Jade und Pixieglow zu simplen Socket-driven Clients transformiert habe.

Parallel habe ich eine Website gepflegt, die den Projektfortschritt nachzeichnet: [protocol-luna.github.io](https://protocol-luna.github.io/).

Dieser Artikel erzählt, wie und warum ich diese Schichten aufgeschnitten habe, was jeder Service exakt tut, und wie Konzepte wie **Centroide** (gemittelte Embedding-Vektoren) und **Ressentiment-Variablen** (inspiriert vom PARRY-Chatbot der 70er) aus einem simplen Discord-Bot ein erstaunlich kohärentes Multi-Plattform-System gemacht haben.

---

## Das Problem mit dem Monolithen

Anfangs passte Luna Protocol in einen einzigen Node.js-Prozess. Der Code handhabte:

- Die Discord-Verbindung (via Eris-Bibliothek)
- Die Trigger-Evaluierung (Mentions, Keywords, Follow-up...)
- Die Simulation menschlichen Verhaltens (Tippfehler, Zögern, Schlaf...)
- Die HTTP-Calls an den lokalen LLM-Server (llama.cpp)
- Session- und Anti-Spam-Verwaltung
- Die TTS-Pipeline

Alles war im selben Prozess und kommunizierte via typisierte Eventbusse (`TypedBus`). Das funktionierte, aber mit Grenzen:

- **Unmöglich, einen Matrix-Client hinzuzufügen**, ohne den ganzen Verhaltenscode zu duplizieren
- **LLM und Bot waren im selben Repo**: Der `server/`-Ordner existierte schon, aber unmöglich, das eine weiterzuentwickeln, ohne das andere anzufassen
- **Undifferenzierte Verarbeitung**: Jede Nachricht wurde gleich behandelt, ob "lol" oder existenzielle Frage
- **Emotionale Amnesie**: Der Bot "fühlte" nichts

Die Schichtenaufteilung hat all diese Probleme gelöst.

---

## Die vier Schichten

Die aktuelle Luna-Protocol-Architektur ist wie ein vierstufiger Trichter organisiert:

```
Matrix / Discord
      |
      v
  [ADAPTATEURS]      Pixieglow (Matrix) / Jade (Discord)
      |
      v
  [BRAIN]            Emerald (WebSocket, port 3126)
      |
      v
  [CLASSIFIEUR]      Sapphire (HTTP, port 3123)
      |
      v
  [INFERENCE]        Krystal (llama.cpp, ports 3124 / 3125)
```

Jede Schicht kann unabhängig neu gestartet, aktualisiert oder ersetzt werden.

---

### Schicht 1: die Adapter (Pixieglow und Jade)

Das sind die simpelsten Schichten. Ihr einziger Job ist, Events einer Messaging-Plattform in ein standardisiertes Protokoll zu Emerald zu übersetzen:

- **Jade** ist der Discord-Adapter. Er nutzt die Eris-Bibliothek, um sich mit Discord zu verbinden und Nachrichten via WebSocket an Emerald weiterzuleiten. Er handhabt auch die TTS-Pipeline (Sprachsynthese via Piper, Konvertierung zu OGG, Upload auf Discord).
- **Pixieglow** ist der Matrix-Adapter. Er nutzt die Matrix-HTTP-Client-Server-API direkt (kein SDK), mit Long-Poll-Sync. Er hat kein TTS.

Beide Adapter teilen dasselbe in `emerald-client.ts` definierte WebSocket-Protokoll:

```typescript
type ClientId = "jade" | "pixieglow";

// Events (Adapter -> Emerald)
type InEvent = MessageEvent | ReadyEvent | BotMessageEvent | PresenceEvent;

// Commands (Emerald -> Adapter)
type OutCommand = RespondCommand | TypingCommand | SetPresenceCommand
                | SpontaneousCommand | ForgotCommand;
```

Die Existenz zweier Adapter mit derselben Schnittstelle beweist das Pooling: **Dasselbe "Gehirn" (Emerald) bedient unterschiedslos einen Discord-Bot und einen Matrix-Bot**, mit identischen Verhaltensweisen. Das Protokoll ist deklarativ: Emerald sagt dem Adapter nicht, *wie* er eine Nachricht schicken soll, es sagt, *was* es schicken soll (der Text mit einer Verzögerung, eventuell ein Burst-Plan, eine Reaktion usw.). Jeder Adapter implementiert die konkrete Ausführung je nach Plattform.

Das ist die Stärke dieser Architektur: Um Telegram-, Signal- oder anderen Support hinzuzufügen, reicht es, einen Adapter zu schreiben, der das WebSocket-Protokoll implementiert.

---

### Schicht 2: das Gehirn (Emerald)

Emerald ist der zentrale Entscheidungsservice. Er lauscht auf Port 3126 per WebSocket und handhabt:

- **Die Trigger-Evaluierung**: Mention, DM, Name, Keyword, Follow-up, Random
- **Die Verhaltenssimulation**: Konzentrationsverzögerungen, Tippfehler, Zögern, Vergessen, Burst, Themenmüdigkeit
- **Die Schlafzyklen**: Sleep-/Slow-/Short-Modi
- **Die Sessionverwaltung**: Cooldown, Session-Limits, Anti-Spam
- **Das Routing zu Sapphire**: Nachrichtensendung, Empfang gestreamter Antworten

Emerald ist der zentrale Service, der das Pooling ermöglicht hat, und er hat am meisten von der Trennung profitiert. Vorher war jedes Verhalten (Typo, Burst, Hesitation) mit dem Discord-Code verwoben. Jetzt liegen sie in dedizierten Modulen in `behavior/`:

```
emerald/src/behavior/
  burst.ts         -- Planung von Burst-Nachrichten
  mannerisms.ts    -- Verzögerungen, Zögern, Reaktionen, Vergessen
  sleep.ts         -- Evaluierung der Schlafzeiten
  typo.ts          -- Simulation von Tippfehlern (AZERTY/QWERTY)
```

Das Gehirn weiß nicht, auf welcher Plattform es läuft. Es empfängt ein `MessageEvent` mit einer `clientId` ("jade" oder "pixieglow"), trifft eine Entscheidung und schickt einen Command zurück. Der Adapter kümmert sich um den Rest.

---

### Schicht 3: der emotionale Klassifizierer (Sapphire)

Sapphire ist technisch der interessanteste Service. Es ist eine **LLM-Middleware** geschrieben in Python mit FastAPI, die vier kritische Rollen spielt:

1. **Binärer FUTILE / INTERESSANT-Klassifizierer** via Embedding-Centroide
2. **Emotionaler Scorer** (Valenz / Arousal) via Centroide
3. **Backend-Router** zu Krystal (kleines Modell vs. großes Modell)
4. **Few-Shot-Injektor** und Sessionmanager

#### Die Centroide: das Herz der Klassifikation

Ein **Centroid** ist ein simples Konzept: Es ist der Mittelwert einer Menge von Embedding-Vektoren. Konkret habe ich Hunderte Beispielnachrichten gesammelt, sie durch ein Embedding-Modell (`BAAI/bge-small-en-v1.5`, 384 Dimensionen) geschickt und die erhaltenen Vektoren gemittelt.

Es gibt **zwei Klassifikations-Centroide**:

- `futile_centroid`: ~683 triviale Nachrichten ("lol", "ok", "hello") via k-means (k=10, seed=42)
- `interessant_centroid`: ~678 substanzielle Nachrichten (technisch, persönlich, philosophisch) via k-means (k=10, seed=42)

Wenn eine Nachricht reinkommt:

```python
def classify(text, embedder, futile_centroids, interessant_centroids):
    emb = embedder.query_embed(text)                     # 384-D Vektor
    sim_f = max(cos(emb, c) for c in futile_centroids)     # max über 10
    sim_i = max(cos(emb, c) for c in interessant_centroids) # max über 10
    diff = sim_i - sim_f
    label = "INTERESSANT" if diff > 0 else "FUTILE"
    return label, abs(diff), sim_f, sim_i
```

Der Score pro Klasse ist die **maximale Kosinus-Ähnlichkeit** unter ihren 10 Centroiden. Das erfasst die Subtypen in jeder Kategorie: Eine Begrüßung und ein Abschied fallen beide nahe eines der 10 futilen Centroide, selbst wenn sie im Embedding-Raum weit entfernt sind. Nur k-means beim Start und Skalarprodukte zur Runtime: Ohne Training, ohne GPU.

#### Warum zwei Modelle?

Das Ergebnis dieser Klassifikation entscheidet, welches LLM-Backend aufgerufen wird:

| Label | Krystal-Backend | Modell | Port |
|-------|----------------|--------|------|
| `FUTILE` | `generic` | Luna-Protocol-1.5B (941 Mo, Q4_K_M) | 3124 |
| `INTERESSANT` | `semantic` | Hermes-3-3B oder 8B (je nach Config) | 3125 |

Die Intuition ist simpel: Ein "lol" oder "nm just chillin u" verdient es nicht, ein 8-Milliarden-Parameter-Modell aufzurufen. Das kleine feingetunte Luna-1.5B-Modell, trainiert auf 200.000 Discord-Samples, reicht für leichte Austausche völlig. Dagegen wird eine Lebensfrage, ein Geständnis oder eine technische Debatte an das große Modell geroutet, das eine reichere Antwort produzieren kann.

Dieses ökonomische Routing reduziert die Last auf dem LLM-Server erheblich: Etwa 70% der Nachrichten werden FUTILE klassifiziert und vom kleinen Modell verarbeitet, was das große Modell für Gespräche freimacht, die es wirklich wert sind.

#### Die Emotionsachse: Valenz und Arousal

Aber das ist nicht alles. Sapphire nutzt **denselben Centroid-Mechanismus** auf einer unabhängigen Achse, um die Emotion der Nachricht zu evaluieren:

Es gibt **vier emotionale Centroide**:

| Pol | Beispiele |
|------|----------|
| `positive` | "hell yeah", "love that", "this is great" |
| `negative` | "shut up", "i hate this", "this sucks" |
| `high_arousal` | "WHAT THE HELL", "omg omg omg", "AAAAA" |
| `low_arousal` | "just chilling", "meh", "i guess" |

Der Score berechnet sich als Ähnlichkeitsdifferenz auf jeder Achse:

```python
valence = sim(emb, positive) - sim(emb, negative)     # [-1, +1]
arousal = sim(emb, high_arousal) - sim(emb, low_arousal)  # [-1, +1]
```

**Valenz** misst, ob die Nachricht positiv oder negativ ist. **Arousal** misst ihre emotionale Intensität. Zusammen bilden sie das Circumplex-Affektmodell (Russell, 1980), dasselbe psychologische Modell, das den Chatbot **PARRY** 1972 inspirierte.

#### Die Ressentiment-Variablen: wie Emotionen das LLM steuern

Hier wird die PARRY-Inspiration greifbar. PARRY (1972 von Kenneth Colby geschaffen) war ein Chatbot, entworfen um einen paranoiden Patienten zu simulieren. Er besaß interne Variablen (Angst, Wut, Misstrauen), die seine Antworten modifizierten. Zum Beispiel antwortete ein "verängstigter" PARRY aggressiver.

Sapphire macht dasselbe, aber mit kontinuierlichen Variablen und einer eleganteren Methode: Die Sampling-Parameter des LLM werden live nach dem emotionalen Zustand der Konversation justiert.

##### Die Temperatur folgt dem Arousal

```python
temperature = clamp(0.7 + arousal * 0.3, 0.4, 1.0)
```

| Arousal | Temperatur | Effekt |
|---------|-------------|-------|
| -1.0 (ruhig) | 0.40 | Niedrige Kreativität, vorhersehbare Antworten |
| 0.0 (neutral) | 0.70 | Standardkreativität |
| +1.0 (aufgeregt) | 1.00 | Maximum an Zufälligkeit, überraschende Antworten |

Wenn jemand aufgeregt oder genervt ist (hohes Arousal), steigt die Temperatur. Das Modell produziert variablere, kreativere, manchmal chaotischere Antworten, wie ein Mensch, der sich "ereifert". Wenn die Konversation ruhig ist, sinkt die Temperatur, die Antworten sind gesetzter.

##### Der Repeat Penalty folgt der Valenz

```python
repeat_penalty = clamp(1.15 - valence * 0.1, 1.0, 1.3)
```

| Valenz | Repeat Penalty | Effekt |
|---------|---------------|-------|
| -1.0 (negativ) | 1.25 | Starke Penalty, vermeidet Wiederholungen |
| 0.0 (neutral) | 1.15 | Standardwert |
| +1.0 (positiv) | 1.05 | Schwache Penalty, erlaubt Wiederholungen |

Je negativer die Konversation, desto mehr wird das Modell gedrängt, sich nicht zu wiederholen, wie jemand, der in einem angespannten Streit nach Worten sucht. Je positiver die Konversation, desto mehr kann sich das Modell redundante Bekräftigungen erlauben, wie in einer entspannten Unterhaltung.

##### Der kumulative Emotionszustand

Diese Scores betreffen nicht nur die unmittelbare Nachricht. Ein `EmotionState` pflegt einen **exponentiellen gleitenden Mittelwert** von Valenz und Arousal pro Session:

```python
class EmotionState:
    def __init__(self, decay=0.85, deadzone=0.06):
        self.decay = decay
        self.deadzone = deadzone

    def update(self, key, valence_delta, arousal_delta):
        if abs(valence_delta) < self.deadzone:
            valence_delta = 0.0
        if abs(arousal_delta) < self.deadzone:
            arousal_delta = 0.0
        s = self._state.setdefault(key, {"valence": 0.0, "arousal": 0.0})
        s["valence"] = s["valence"] * self.decay + valence_delta * (1 - self.decay)
        s["arousal"] = s["arousal"] * self.decay + arousal_delta * (1 - self.decay)
        return s
```

Das `decay` von 0.85 heißt, dass 85% des vorherigen Zustands bei jeder Nachricht erhalten bleiben und 15% des neuen Signals integriert werden. Das gibt ein **emotionales Gedächtnis**, das brutale Schwankungen glättet: Eine einzige negative Nachricht macht den Bot nicht "traurig", aber eine Serie negativer Nachrichten lässt seine Stimmung progressiv driften.

In der Praxis: Wenn jemand eine Konversation sehr aufgeregt beginnt (`arousal=+0.8`), bleibt die Temperatur über mehrere Austausche hoch, selbst wenn die folgenden Nachrichten ruhiger sind. Die Emotion braucht Zeit zum Absinken, wie ein Mensch, der nach einem Streit noch "heiß" bleibt.

---

### Schicht 4: die Inference (Krystal)

Krystal ist die unterste Schicht: Ein Wrapper um `llama.cpp`, der eine OpenAI-kompatible API exponiert (`/v1/chat/completions`). Es läuft in zwei PM2-Instanzen:

- `krystal-small`: Das feingetunte Luna-1.5B-Modell, auf Port 3124, mit CPU-Affinität 0
- `krystal-large`: Ein Hermes-3B-Modell, auf Port 3125, mit CPU-Affinität 0,1

Beide Instanzen sind präkompilierte `llama-server`-Prozesse, gestartet mit `taskset` für CPU-Pinning.

Das Fine-Tune des Luna-Modells hat sich seit dem zweiten Artikel auch weiterentwickelt: Es ist jetzt auf **200.000 Samples** trainiert (gegenüber 50.000 zuvor), weiterhin ausgehend von Qwen2.5-1.5B-Instruct via QLoRA. Die 200k Samples sind eine Teilmenge des Discord-Dialogues-Datasets, gefiltert, um nur die natürlichsten und diversesten Gespräche zu behalten. Das Ziel: Das stilistische Register des Modells erweitern, ohne die Flexibilität zu verlieren, die Few-Shot-Priming so effektiv macht.

---

## Das komplette Schema: eine Nachricht im Transit

Hier passiert konkret, wenn jemand "je suis vraiment triste aujourd'hui" auf Discord schickt:

1. **Jade** empfängt die Nachricht via Discord-Gateway-API. Er transformiert sie in ein `MessageEvent` und schickt es via WebSocket an Emerald.
2. **Emerald** evaluiert den Trigger (Mention? Name? Keyword ?). Es ist eine direkte Mention. Es berechnet eine Konzentrationsverzögerung, prüft Cooldown, Session, Themenmüdigkeit. Es entscheidet zu antworten und schickt die Nachricht via HTTP an Sapphire.
3. **Sapphire** embeddet die Nachricht mit `bge-small-en-v1.5`.
   - Klassifikation: Die Nachricht liegt näher am `interessant`-Centroid als am `futile`-Centroid (diff = +0.31) -> **INTERESSANT**
   - Emotion: Negative Valenz (-0.42), moderates Arousal (0.35)
   - Routing: Richtung `KRYSTAL_SEMANTIC_URL` (Port 3125, großes Modell)
   - Sampling-Parameter: Temperatur = 0.80 (erhöhtes Arousal), repeat_penalty = 1.19 (negative Valenz)
   - Der emotionale Sessionzustand wird mit diesen Werten aktualisiert
4. **Krystal** (große Instanz) generiert die Antwort mit den emotional justierten Parametern und gibt sie an Sapphire zurück.
5. **Sapphire** streamt die Antwort mit den Metadaten (Label, Valenz, Arousal, Debug-Statistiken) an Emerald.
6. **Emerald** entscheidet, ein Zögern hinzuzufügen ("oh..."), plant einen Burst (2 Fragmente) und wählt eine Reaktion. Es schickt ein `RespondCommand` an Jade.
7. **Jade** führt aus: Wartet die initiale Verzögerung ab, schickt das erste Fragment mit dem Zögern, wartet 1.5s, schickt das zweite Fragment. Er zeigt den Tippindikator während der ganzen Generierung.

Alles in weniger als 3 Sekunden für den Nutzer.

---

## Die Centroide: warum es besser ist als ein neuronaler Klassifizierer

Die Wahl von Embedding-Centroiden statt eines traditionellen Klassifizierers (wie dem DistilBERT, das ich vorher nutzte) verdient eine Erklärung.

Ein neuronaler Klassifizierer lernt eine Entscheidungsgrenze zwischen Klassen, typischerweise eine nicht-lineare Transformation, die Eingaben auf Wahrscheinlichkeiten projiziert. Er ist präzise, aber:

- Er braucht gelabelte Trainingsdaten
- Er ist sensitiv für Distributionswechsel (Data Drift)
- Er ist schwer interpretierbar
- Er muss für eine neue Klasse neu trainiert werden

Ein Centroid dagegen ist ein **gemittelter Vektor** von Beispiel-Embeddings. Die Klassifikation passiert per Kosinus-Ähnlichkeit zu diesem gemittelten Vektor. Vorteile:

- **Kein Training nötig**: Man berechnet nur den Mittelwert von Embeddings handgewählter Beispiele
- **Leicht interpretierbar**: Man kann schauen, welche Beispiele dem Centroid am nächsten sind, um zu verstehen, "was der Centroid gelernt hat"
- **Hinzufügen einer Klasse**: Man fügt nur einen neuen Centroid hinzu, ohne Neutraining
- **Robust**: Der Centroid ist ein Mittelwert, also haben Outlier wenig Impact

Die wahre Macht der Centroide ist, dass sie ein Klassifikationsproblem in ein **räumliches Distanzmessungs**-Problem verwandeln. Man kann Kategorien als Regionen in einem 384-dimensionalen Raum visualisieren (oder in 2D/3D nach PCA/t-SNE-Dimensionsreduktion).

### 3D-Visualisierung der Centroide

In der Praxis sehen die Klassifikations-Centroide im Embedding-Raum so aus. Jeder Punkt ist eine Beispielnachricht, per PCA in 3D projiziert (die 384 Originaldimensionen sind auf 3 zur Visualisierung reduziert). Die blauen Punkte sind futile Nachrichten, die gelben Punkte interessante Nachrichten. Die **20 Diamantmarker** sind die k-means-Centroide (10 pro Klasse, seed=42). Fahre mit der Maus über einen Punkt, um den Originaltext des Beispiels zu sehen.

<iframe src="assets/centroids-plot.html" style="width:100%;height:550px;border:none;border-radius:8px;" loading="lazy" title="Klassifikation per Centroide, interaktive 3D-Ansicht"></iframe>

Zwei Testbeispiele werden rot angezeigt: "lol" (als futil klassifiziert) und "i feel sad today" (als interessant klassifiziert). Selbst nach Reduktion von 384 auf 3 Dimensionen (14,7% erklärte Varianz) sind beide Cluster klar getrennt. Die Annotation oben zeigt die exakten Counts und die ambige Zone.

Der Centroid der Eingabenachricht wandert in diesem Raum je nach Inhalt. Die FUTILE/INTERESSANT-Klassifikation besteht schlicht darin zu messen, welcher Centroid per Kosinus-Ähnlichkeit am nächsten ist. So kann man jede Nachricht als Punkt in einem mehrdimensionalen Raum darstellen, jede Dimension entspricht einer semantischen Eigenschaft.

---

## Was das in der Praxis ändert

Die Nutzer sehen weder Schichten noch Centroide noch Temperaturanpassungen. Aber sie spüren die Effekte:

- **Schnellere Antworten** für simple Nachrichten (das kleine Modell ist 2x schneller und handhabt 70% des Traffics)
- **Adaptiver Ton**: Wenn du genervt bist, "spürt" der Bot die Genervtheit und passt seinen Stil an
- **Plattformübergreifende Kohärenz**: Ein Matrix-Bot und ein Discord-Bot teilen dasselbe Gehirn und denselben emotionalen Zustand
- **Authentischer Ton bewahrt**: Fine-Tune + Few-Shot + intelligentes Routing vermeidet Corporate-Antworten

Der Wechsel auf 200k Trainingssamples für das kleine Modell hat diese Effekte noch verstärkt: Das Modell erfasst die Diversität der Discord-Gespräche besser, ohne die Formbarkeit zu verlieren, die Few-Shot-Priming erlaubt.

---

## Die komplette Infrastruktur

Hier die aktuell laufenden Services:

| Service | Technologie | Port(s) | Rolle |
|---------|------------|---------|------|
| Pixieglow | TypeScript (Bun) | -- | Matrix-Adapter |
| Jade | TypeScript (esbuild) | -- | Discord-Adapter |
| Emerald | TypeScript (Bun) | 3126 (WebSocket) | Gehirn / Entscheidungen |
| Sapphire | Python (FastAPI) | 3123 (HTTP) | Klassifizierer + Emotion |
| Krystal small | llama.cpp (PM2) | 3124 | Kleines Modell (1.5B, futil) |
| Krystal large | llama.cpp (PM2) | 3125 | Großes Modell (3B+, interessant) |

Die Abhängigkeiten zwischen Services sind unidirektional: Der Adapter hängt von Emerald ab, Emerald hängt von Sapphire ab, Sapphire hängt von Krystal ab. Der Graph bleibt azyklisch. Jeder Service kann unabhängig neu gestartet werden.

---

## Fazit

Luna Protocol in vier Schichten zu teilen war nicht nur eine Architekturübung. Es war eine Antwort auf konkrete Limitationen: Unmöglichkeit, Matrix zu supporten, fehlendes emotionales Bewusstsein, fehlende intelligente Nachrichtenpriorisierung.

Heute ist das System robuster (ein LLM-Crash tötet den Bot nicht), erweiterbarer (ein Telegram- oder WhatsApp-Adapter würde demselben WebSocket-Protokoll folgen) und "lebendiger": Der Bot passt sein Verhalten, seinen Ton und sogar die LLM-Parameter an den wahrgenommenen emotionalen Zustand der Konversation an.

Die Embedding-Centroide sind das Schlüsselelement, das all das ohne übermäßige Komplexität möglich macht: Kein trainiertes neuronales Netz, keine gelabelte Datenpipeline, nur Vektormittelwerte und Kosinus-Ähnlichkeiten. Eine simple, unglaublich effektive und schrecklich unterschätzte Technik.

| Ressource | Link |
|----------|------|
| Projektwebsite | [protocol-luna.github.io](https://protocol-luna.github.io/) |
| Pixieglow | [protocol-luna/pixieglow](https://github.com/protocol-luna/pixieglow) |
| Emerald | [protocol-luna/emerald](https://github.com/protocol-luna/emerald) |
| Sapphire | [protocol-luna/sapphire](https://github.com/protocol-luna/sapphire) |
| Krystal | [protocol-luna/krystal](https://github.com/protocol-luna/krystal) |
| Artikel 1: der Discord-Bot | [Luna Protocol: Ich habe einen autonomen Discord-Bot gebaut](/articles/de/luna-protocol-discord-bot) |
| Artikel 2: das Fine-Tuning | [Luna Protocol: warum ich ein 1,5B-Modell feingetunt habe](/articles/de/luna-protocol-official-models) |
