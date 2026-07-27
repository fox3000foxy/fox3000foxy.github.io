---
title: "Luna Protocol: geteilte Gehirne, Emotionsklassifikation und interessant/belanglos-Routing"
description: "Luna Protocol hat sich von einem Monolithen zu einer vierschichtigen Architektur entwickelt: Adapter, Brain, Emotionsklassifikator und Inferenz. Im Programm: Embedding-Centroids, interessant/belanglos-Routing und LLM-Parameteranpassung nach Valenz und Erregung."
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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: ""
---

# Luna Protocol: geteilte Gehirne, Emotionsklassifikation und interessant/belanglos-Routing

In den [beiden](/articles/de/luna-protocol-discord-bot) [vorherigen](/articles/de/luna-protocol-official-models) Artikeln habe ich Luna Protocol als einen einzelnen Discord-Bot mit einem komplexen Verhaltenssystem und einem fine-getunten Modell vorgestellt. Doch die Architektur hat sich seitdem stark weiterentwickelt. Was einmal ein Monolith war -- ein einziger Node.js-Prozess, der den Discord-Bot, das Verhalten und die LLM-Aufrufe verwaltete -- ist zu **vier unabhängigen Schichten** geworden, jede mit eigener Verantwortung, eigener Sprache und eigenem Lebenszyklus.

Diese Trennung brachte unerwartete Vorteile: die gemeinsame Nutzung von "Gehirnen" über mehrere Plattformen hinweg, ein Emotionsklassifikationssystem, das die LLM-Parameter dynamisch anpasst, und ein intelligentes Routing von Nachrichten zwischen zwei Modellen je nach wahrgenommener Wichtigkeit der Konversation.

Die Entwicklung geschah nicht auf einen Schlag -- sie folgte einem organischen Weg. Zuerst habe ich den `server/`-Ordner aus dem Bot-Repository ausgelagert und so **Krystal** geschaffen, während **Jade** als Discord-Adapter zurückblieb. Dann erstellte ich **Pixieglow** (Matrix-Adapter), indem ich Jades `llm-core` und Event-Bus wiederverwendete. Danach kam **Sapphire**, das eine GENERIC/SEMANTIC-Klassifikation mit DistilBERT einführte -- aber die Ergebnisse waren nicht überzeugend, also wechselte ich zu Embedding-Centroids, die formbarer für die Anreicherung von Beispielen und genauer sind; die Klassifikation wurde zu BELANGLOS/INTERESSANT. Schließlich fügte ich **Valenz**- und **Erregungs**-Centroids hinzu, um Temperatur und Repeat Penalty des LLM zu regulieren. Zum Schluss habe ich den gesamten redundanten Code zwischen Jade und Pixieglow entfernt, indem ich **Emerald**, das geteilte Gehirn, schuf, und Jade und Pixieglow in einfache socket-gesteuerte Clients verwandelte.

Parallel dazu habe ich eine Website aktuell gehalten, die den Fortschritt des Projekts dokumentiert: [protocol-luna.github.io](https://protocol-luna.github.io/).

Dieser Artikel erzählt, wie und warum ich diese Schichten aufgeteilt habe, was jeder Dienst genau macht, und wie Konzepte wie **Centroids** (durchschnittliche Embedding-Vektoren) und **Ressentiment-Variablen** (inspiriert vom PARRY-Chatbot der 1970er Jahre) einen einfachen Discord-Bot in ein erstaunlich kohärentes plattformübergreifendes System verwandelt haben.

---

## Das Problem mit dem Monolithen

Anfangs passte Luna Protocol in einen einzigen Node.js-Prozess. Der Code kümmerte sich um:

- Die Discord-Verbindung (über die Eris-Bibliothek)
- Die Auswertung von Triggern (Erwähnungen, Schlüsselwörter, Follow-ups...)
- Die Simulation menschlichen Verhaltens (Tippfehler, Zögern, Schlaf...)
- HTTP-Aufrufe an den lokalen LLM-Server (llama.cpp)
- Sitzungsverwaltung und Anti-Spam
- Die TTS-Pipeline

Alles lief im selben Prozess und kommunizierte über typisierte Event-Busse (`TypedBus`). Es funktionierte, aber mit Einschränkungen:

- **Unmöglich, einen Matrix-Client hinzuzufügen**, ohne den gesamten Verhaltenscode zu duplizieren
- **Das LLM und der Bot waren im selben Repository**: der `server/`-Ordner existierte bereits, aber es war unmöglich, das eine weiterzuentwickeln, ohne das andere anzufassen
- **Keine intelligente Klassifikation**: jede Nachricht wurde gleich behandelt, egal ob "lol" oder eine existenzielle Frage
- **Kein dauerhafter emotionaler Zustand**: der Bot "fühlte" nichts

Die Aufteilung in Schichten hat all diese Probleme gelöst.

---

## Die vier Schichten

Die aktuelle Architektur von Luna Protocol ist als vierstufiger Trichter organisiert:

```
Matrix / Discord
      |
      v
  [ADAPTER]       Pixieglow (Matrix) / Jade (Discord)
      |
      v
  [BRAIN]         Emerald (WebSocket, Port 3126)
      |
      v
  [KLASSIFIKATOR] Sapphire (HTTP, Port 3123)
      |
      v
  [INFERENZ]      Krystal (llama.cpp, Ports 3124 / 3125)
```

Jede Schicht kann unabhängig neu gestartet, aktualisiert oder ersetzt werden.

---

### Schicht 1: die Adapter (Pixieglow und Jade)

Das sind die einfachsten Schichten. Ihre einzige Aufgabe ist es, Ereignisse einer Messaging-Plattform in ein standardisiertes Protokoll zu Emerald zu übersetzen:

- **Jade** ist der Discord-Adapter. Er nutzt die Eris-Bibliothek, um sich mit Discord zu verbinden und leitet Nachrichten per WebSocket an Emerald weiter. Er verwaltet auch die TTS-Pipeline (Sprachsynthese via Piper, OGG-Konvertierung, Upload zu Discord).
- **Pixieglow** ist der Matrix-Adapter. Er nutzt direkt die Matrix-Client-Server-HTTP-API (kein SDK), mit einem Long-Poll-Sync. Er hat kein TTS.

Beide Adapter teilen sich dasselbe WebSocket-Protokoll, das in `emerald-client.ts` definiert ist:

```typescript
type ClientId = "jade" | "pixieglow";

// Ereignisse (Adapter -> Emerald)
type InEvent = MessageEvent | ReadyEvent | BotMessageEvent | PresenceEvent;

// Befehle (Emerald -> Adapter)
type OutCommand = RespondCommand | TypingCommand | SetPresenceCommand
                | SpontaneousCommand | ForgotCommand;
```

Die Existenz zweier Adapter mit derselben Schnittstelle beweist die gemeinsame Nutzung: **dasselbe "Gehirn" (Emerald) bedient gleichermaßen einen Discord-Bot und einen Matrix-Bot**, mit identischem Verhalten. Das Protokoll ist deklarativ: Emerald sagt dem Adapter nicht, *wie* er eine Nachricht senden soll, sondern *was* gesendet werden soll (den Text mit einer Verzögerung, eventuell einen Burst-Plan, eine Reaktion usw.). Jeder Adapter implementiert die konkrete Ausführung entsprechend seiner Plattform.

Das ist die Stärke dieser Architektur: Um Telegram-, Signal- oder anderen Support hinzuzufügen, muss man nur einen Adapter schreiben, der das WebSocket-Protokoll implementiert.

---

### Schicht 2: das Gehirn (Emerald)

Emerald ist der zentrale Entscheidungsdienst. Er lauscht auf Port 3126 per WebSocket und verwaltet:

- **Die Trigger-Auswertung**: Erwähnung, DM, Name, Schlüsselwort, Follow-up, zufällig
- **Die Verhaltenssimulation**: Konzentrationsverzögerungen, Tippfehler, Zögern, Vergesslichkeit, Bursts, thematische Ermüdung
- **Die Schlafzyklen**: sleep / slow / short Modi
- **Die Sitzungsverwaltung**: Cooldown, Sitzungsgrenzen, Anti-Spam
- **Das Routing zu Sapphire**: Senden von Nachrichten, Empfangen von gestreamten Antworten

Emerald ist der zentrale Dienst, der die gemeinsame Nutzung ermöglicht hat, und derjenige, der am meisten von der Trennung profitiert hat. Vorher war jedes Verhalten (Tippfehler, Burst, Zögern) mit dem Discord-Code verflochten. Jetzt liegen sie in dedizierten Modulen unter `behavior/`:

```
emerald/src/behavior/
  burst.ts         -- Planung von Nachrichten-Bursts
  mannerisms.ts    -- Verzögerungen, Zögern, Reaktionen, Vergesslichkeit
  sleep.ts         -- Auswertung der Schlafzeiten
  typo.ts          -- Tippfehler-Simulation (AZERTY/QWERTY)
```

Das Gehirn weiß nicht, auf welcher Plattform es läuft. Es empfängt ein `MessageEvent` mit einer `clientId` ("jade" oder "pixieglow"), trifft eine Entscheidung und gibt einen Befehl zurück. Der Adapter kümmert sich um den Rest.

---

### Schicht 3: der Emotionsklassifikator (Sapphire)

Sapphire ist der technisch interessanteste Dienst. Es ist eine in Python mit FastAPI geschriebene **LLM-Middleware**, die vier kritische Rollen erfüllt:

1. **Binärer BELANGLOS / INTERESSANT-Klassifikator** über Embedding-Centroids
2. **Emotions-Scorer** (Valenz / Erregung) über Centroids
3. **Backend-Router** zu Krystal (kleines vs. großes Modell)
4. **Few-Shot-Injektor** und Sitzungsverwalter

#### Die Centroids: das Herzstück der Klassifikation

Ein **Centroid** ist ein einfaches Konzept: es ist der Durchschnitt einer Menge von Embedding-Vektoren. Konkret habe ich Hunderte von Beispielnachrichten gesammelt, sie durch ein Embedding-Modell laufen lassen (`BAAI/bge-small-en-v1.5`, 384 Dimensionen) und die entstandenen Vektoren gemittelt.

Es gibt **zwei Klassifikations-Centroids**:

- `futile_centroid`: der Durchschnitt der Embeddings von ~500 trivialen Nachrichten ("lol", "ok", "hello", "nm just chillin u")
- `interessant_centroid`: der Durchschnitt der Embeddings von ~550 inhaltsreichen Nachrichten (technische Fragen, Vertraulichkeiten, Philosophie)

Wenn eine Nachricht eintrifft:

```python
def classify(text, embedder, futile_centroid, interessant_centroid):
    emb = embedder.query_embed(text)          # 384-D-Vektor der Nachricht
    sim_f = cosine_similarity(emb, futile_centroid)
    sim_i = cosine_similarity(emb, interessant_centroid)
    diff = sim_i - sim_f
    label = "INTERESSANT" if diff > 0 else "BELANGLOS"
    return label, abs(diff), sim_f, sim_i
```

Die Kosinus-Ähnlichkeit zwischen der Nachricht und jedem Centroid bestimmt die Kategorie. Die absolute Differenz gibt die Konfidenz an. Es ist einfach, schnell (kein LLM-Forward-Pass) und erstaunlich effektiv.

#### Warum zwei Modelle?

Das Ergebnis dieser Klassifikation entscheidet, welches LLM-Backend aufgerufen wird:

| Label | Krystal-Backend | Modell | Port |
|-------|-----------------|--------|------|
| `BELANGLOS` | `generic` | Luna-Protocol-1.5B (941 MB, Q4_K_M) | 3124 |
| `INTERESSANT` | `semantic` | Hermes-3-3B oder 8B (je nach Konfiguration) | 3125 |

Die Intuition ist einfach: ein "lol" oder ein "nm just chillin u" verdient es nicht, ein Modell mit 8 Milliarden Parametern aufzurufen. Das kleine fine-getunte Luna-1.5B-Modell, trainiert auf 200.000 Discord-Beispielen, reicht für leichte Konversationen völlig aus. Eine Frage über das Leben, eine Vertraulichkeit oder eine technische Debatte hingegen wird an das große Modell weitergeleitet, das eine reichhaltigere Antwort produzieren kann.

Dieses sparsame Routing reduziert die Last auf dem LLM-Server erheblich: etwa 70% der Nachrichten werden als BELANGLOS klassifiziert und vom kleinen Modell bearbeitet, wodurch das große Modell für Konversationen frei bleibt, die es wirklich wert sind.

#### Die emotionale Achse: Valenz und Erregung

Aber das ist nicht alles. Sapphire nutzt **denselben Centroid-Mechanismus** auf einer unabhängigen Achse, um die Emotion der Nachricht zu bewerten:

Es gibt **vier emotionale Centroids**:

| Pol | Beispiele |
|-----|-----------|
| `positiv` | "hell yeah", "love that", "this is great" |
| `negativ` | "shut up", "i hate this", "this sucks" |
| `hohe Erregung` | "WHAT THE HELL", "omg omg omg", "AAAAA" |
| `niedrige Erregung` | "just chilling", "meh", "i guess" |

Der Score wird als Differenz der Ähnlichkeiten auf jeder Achse berechnet:

```python
valence = sim(emb, positive) - sim(emb, negative)     # [-1, +1]
arousal = sim(emb, high_arousal) - sim(emb, low_arousal)  # [-1, +1]
```

**Valenz** misst, ob die Nachricht positiv oder negativ ist. **Erregung** misst ihre emotionale Intensität. Zusammen bilden sie das zirkumplexe Modell des Affekts (Russell, 1980) -- dasselbe psychologische Modell, das den Chatbot **PARRY** im Jahr 1972 inspirierte.

#### Die Ressentiment-Variablen: wie Emotionen das LLM steuern

Hier wird die PARRY-Inspiration greifbar. PARRY (1972 von Kenneth Colby geschaffen) war ein Chatbot, der entwickelt wurde, um einen paranoiden Patienten zu simulieren. Er besaß interne Variablen -- Angst, Wut, Misstrauen -- die seine Antworten veränderten. Ein "verängstigtes" PARRY antwortete beispielsweise aggressiver.

Sapphire macht dasselbe, aber mit kontinuierlichen Variablen und einer eleganteren Methode: die Sampling-Parameter des LLM werden in Echtzeit je nach emotionalem Zustand der Konversation angepasst.

##### Die Temperatur folgt der Erregung

```python
temperature = clamp(0.7 + arousal * 0.3, 0.4, 1.0)
```

| Erregung | Temperatur | Effekt |
|----------|------------|--------|
| -1,0 (ruhig) | 0,40 | Geringe Kreativität, vorhersehbare Antworten |
| 0,0 (neutral) | 0,70 | Standard-Kreativität |
| +1,0 (aufgeregt) | 1,00 | Maximale Zufälligkeit, überraschende Antworten |

Wenn jemand aufgeregt oder verärgert ist (hohe Erregung), steigt die Temperatur. Das Modell produziert vielfältigere, kreativere, manchmal chaotischere Antworten -- wie ein Mensch, der sich "hineinsteigert". Wenn die Konversation ruhig ist, sinkt die Temperatur, und die Antworten werden gelassener.

##### Der Repeat Penalty folgt der Valenz

```python
repeat_penalty = clamp(1.15 - valence * 0.1, 1.0, 1.3)
```

| Valenz | Repeat Penalty | Effekt |
|--------|-----------------|--------|
| -1,0 (negativ) | 1,25 | Starke Strafe, vermeidet Wiederholungen |
| 0,0 (neutral) | 1,15 | Standardwert |
| +1,0 (positiv) | 1,05 | Geringe Strafe, erlaubt Wiederholungen |

Je negativer die Konversation, desto mehr wird das Modell dazu gedrängt, Wiederholungen zu vermeiden -- wie jemand, der in einem angespannten Streit nach Worten sucht. Je positiver die Konversation, desto mehr kann sich das Modell redundante Aussagen erlauben, wie in einer entspannten Unterhaltung.

##### Der kumulative emotionale Zustand

Diese Scores beziehen sich nicht nur auf die unmittelbare Nachricht. Ein `EmotionState` führt einen **exponentiell gleitenden Durchschnitt** von Valenz und Erregung pro Sitzung:

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

Der `decay`-Wert von 0,85 bedeutet, dass bei jeder Nachricht 85% des vorherigen Zustands erhalten bleiben und 15% des neuen Signals integriert werden. Das ergibt ein **emotionales Gedächtnis**, das abrupte Schwankungen glättet: eine einzelne negative Nachricht macht den Bot nicht "traurig", aber eine Reihe negativer Nachrichten lässt seine Stimmung schrittweise abdriften.

In der Praxis: Wenn jemand ein Gespräch sehr aufgeregt beginnt (`arousal=+0.8`), bleibt die Temperatur über mehrere Austausche hinweg hoch, selbst wenn die folgenden Nachrichten ruhiger sind. Die Emotion braucht Zeit, um wieder abzuklingen -- wie ein Mensch, der nach einem Streit noch "aufgeheizt" bleibt.

---

### Schicht 4: die Inferenz (Krystal)

Krystal ist die unterste Schicht: ein Wrapper um `llama.cpp`, der eine OpenAI-kompatible API (`/v1/chat/completions`) bereitstellt. Er läuft in zwei PM2-Instanzen:

- `krystal-small`: das fine-getunte Luna-1.5B-Modell, auf Port 3124, mit CPU-Affinität 0
- `krystal-large`: ein Hermes-3B-Modell, auf Port 3125, mit CPU-Affinität 0,1

Beide Instanzen sind vorkompilierte `llama-server`-Prozesse, die mit `taskset` für das CPU-Pinning gestartet werden.

Auch das Fine-Tuning des Luna-Modells hat sich seit dem zweiten Artikel weiterentwickelt: es wird jetzt auf **200.000 Beispielen** trainiert (gegenüber vorher 50.000), weiterhin ausgehend von Qwen2.5-1.5B-Instruct via QLoRA. Die 200k Beispiele sind eine Teilmenge des Discord-Dialogues-Datensatzes, gefiltert, um nur die natürlichsten und vielfältigsten Konversationen zu behalten. Das Ziel: das stilistische Spektrum des Modells zu erweitern, ohne die Flexibilität zu verlieren, die Few-Shot-Priming so effektiv macht.

---

## Das vollständige Schema: eine Nachricht im Durchlauf

Hier ist, was konkret passiert, wenn jemand "ich bin heute wirklich traurig" auf Discord sendet:

1. **Jade** empfängt die Nachricht über die Discord Gateway API. Sie wandelt sie in ein `MessageEvent` um und sendet es per WebSocket an Emerald.
2. **Emerald** wertet den Trigger aus (Erwähnung? Name? Schlüsselwort?). Es ist eine direkte Erwähnung. Es berechnet eine Konzentrationsverzögerung, prüft Cooldown, Sitzung und thematische Ermüdung. Es entscheidet sich zu antworten und sendet die Nachricht per HTTP an Sapphire.
3. **Sapphire** embeddet die Nachricht mit `bge-small-en-v1.5`.
   - Klassifikation: die Nachricht ist näher am `interessant`-Centroid als am `belanglos`-Centroid (Diff = +0,31) -> **INTERESSANT**
   - Emotion: negative Valenz (-0,42), moderate Erregung (0,35)
   - Routing: Richtung `KRYSTAL_SEMANTIC_URL` (Port 3125, großes Modell)
   - Sampling-Parameter: Temperatur = 0,80 (Erregung erhöht), repeat_penalty = 1,19 (negative Valenz)
   - Der emotionale Zustand der Sitzung wird mit diesen Werten aktualisiert
4. **Krystal** (große Instanz) generiert die Antwort mit den emotional angepassten Parametern und sendet sie an Sapphire zurück.
5. **Sapphire** streamt die Antwort zusammen mit Metadaten (Label, Valenz, Erregung, Debug-Statistiken) an Emerald.
6. **Emerald** entscheidet sich, ein Zögern hinzuzufügen ("oh..."), plant einen Burst (2 Fragmente) und wählt eine Reaktion. Es sendet ein `RespondCommand` an Jade.
7. **Jade** führt aus: wartet die anfängliche Verzögerung ab, sendet das erste Fragment mit dem Zögern, wartet 1,5s, sendet das zweite Fragment. Es zeigt während der gesamten Generierung den Tipp-Indikator an.

Das alles in weniger als 3 Sekunden für den Nutzer.

---

## Die Centroids: warum sie besser sind als ein neuronaler Klassifikator

Die Wahl von Embedding-Centroids gegenüber einem traditionellen Klassifikator (wie dem DistilBERT, das ich vorher nutzte) verdient eine Erklärung.

Ein neuronaler Klassifikator lernt eine Entscheidungsgrenze zwischen den Klassen -- typischerweise eine nicht-lineare Transformation, die Eingaben auf Wahrscheinlichkeiten abbildet. Er ist präzise, aber:

- Er benötigt gelabelte Trainingsdaten
- Er ist empfindlich gegenüber Verteilungsverschiebungen (Data Drift)
- Er ist schwer zu interpretieren
- Er muss neu trainiert werden, um eine neue Klasse hinzuzufügen

Ein Centroid hingegen ist ein **Durchschnittsvektor** von Beispiel-Embeddings. Die Klassifikation erfolgt durch Kosinus-Ähnlichkeit zu diesem Durchschnittsvektor. Vorteile:

- **Kein Training**: man berechnet einfach den Durchschnitt der Embeddings von handverlesenen Beispielen
- **Leicht zu interpretieren**: man kann sich ansehen, welche Beispiele dem Centroid am nächsten sind, um zu verstehen, "was der Centroid gelernt hat"
- **Hinzufügen einer Klasse**: man fügt einfach einen neuen Centroid hinzu -- kein Neutraining nötig
- **Robust**: der Centroid ist ein Durchschnitt, daher haben Ausreißer wenig Einfluss

Die wahre Stärke der Centroids liegt darin, dass sie ein Klassifikationsproblem in ein Problem der **räumlichen Distanzmessung** verwandeln. Man kann Kategorien als Regionen in einem 384-dimensionalen Raum visualisieren (oder in 2D/3D nach PCA/t-SNE-Dimensionsreduktion).

### 3D-Visualisierung der Centroids

In der Praxis sehen die Klassifikations-Centroids im Embedding-Raum so aus. Jeder Punkt ist eine Beispielnachricht, per PCA in 3D projiziert (die ursprünglichen 384 Dimensionen werden zur Visualisierung auf 3 reduziert). Blaue Punkte sind belanglose Nachrichten, gelbe Punkte interessante Nachrichten. Die beiden großen Diamanten sind die berechneten Centroids -- der Durchschnitt jeder Gruppe. Fahren Sie mit der Maus über einen Punkt, um den Originaltext des Beispiels zu sehen.

<iframe src="assets/centroids-plot.html" style="width:100%;height:550px;border:none;border-radius:8px;" loading="lazy" title="Centroid-Klassifikation - interaktive 3D-Ansicht"></iframe>

Zwei Beispiele werden in Rot angezeigt: "lol" (als belanglos klassifiziert) und "i feel sad today" (als interessant klassifiziert). "lol" fällt in die blaue Wolke der belanglosen Nachrichten, während "i feel sad today" auf der Seite der gelben Punkte liegt. Die Trennung ist selbst nach einer Reduktion auf 3 Dimensionen sichtbar (nur 15,6% der Gesamtvarianz erklärt). In 384 Dimensionen ist die Grenze weit deutlicher.

Der Centroid der Eingangsnachricht bewegt sich je nach ihrem Inhalt durch diesen Raum. Die BELANGLOS/INTERESSANT-Klassifikation besteht einfach darin, zu messen, welcher Centroid per Kosinus-Ähnlichkeit näher liegt. So kann man jede Nachricht als Punkt in einem mehrdimensionalen Raum darstellen, wobei jede Dimension einer semantischen Eigenschaft entspricht.

---

## Was das in der Praxis ändert

Nutzer sehen die Schichten, die Centroids oder die Temperaturanpassungen nicht. Aber sie spüren die Effekte:

- **Schnellere Antworten** bei einfachen Nachrichten (das kleine Modell ist 2x schneller und bewältigt 70% des Verkehrs)
- **Adaptiver Ton**: wenn Sie verärgert sind, "spürt" der Bot die Verärgerung und passt seinen Stil an
- **Plattformübergreifende Konsistenz**: ein Matrix-Bot und ein Discord-Bot teilen sich dasselbe Gehirn und denselben emotionalen Zustand
- **Kein "Assistenten-Modus"**: das Fine-Tuning + Few-Shot + intelligentes Routing vermeidet unternehmerisch klingende Antworten

Die Erweiterung auf 200k Trainingsbeispiele für das kleine Modell hat diese Effekte weiter verstärkt: das Modell erfasst die Vielfalt der Discord-Konversationen besser, ohne die durch Few-Shot-Priming ermöglichte Formbarkeit zu verlieren.

---

## Die vollständige Infrastruktur

Hier sind die derzeit laufenden Dienste:

| Dienst | Technologie | Port(s) | Rolle |
|--------|-------------|---------|-------|
| Pixieglow | TypeScript (Bun) | -- | Matrix-Adapter |
| Jade | TypeScript (esbuild) | -- | Discord-Adapter |
| Emerald | TypeScript (Bun) | 3126 (WebSocket) | Gehirn / Entscheidungen |
| Sapphire | Python (FastAPI) | 3123 (HTTP) | Klassifikator + Emotion |
| Krystal small | llama.cpp (PM2) | 3124 | Kleines Modell (1.5B, belanglos) |
| Krystal large | llama.cpp (PM2) | 3125 | Großes Modell (3B+, interessant) |

Die Abhängigkeiten zwischen den Diensten sind unidirektional: der Adapter hängt von Emerald ab, Emerald hängt von Sapphire ab, Sapphire hängt von Krystal ab. Kein Zyklus. Jeder Dienst kann unabhängig neu gestartet werden.

---

## Fazit

Luna Protocol in vier Schichten aufzuteilen war nicht nur eine architektonische Übung. Es war eine Antwort auf konkrete Einschränkungen: die Unfähigkeit, Matrix zu unterstützen, das Fehlen emotionalen Bewusstseins, das Fehlen intelligenter Nachrichtenpriorisierung.

Heute ist das System robuster (ein LLM-Absturz tötet den Bot nicht), erweiterbarer (ein Telegram- oder WhatsApp-Adapter würde demselben WebSocket-Protokoll folgen) und "lebendiger": der Bot passt sein Verhalten, seinen Ton und sogar die LLM-Parameter an den wahrgenommenen emotionalen Zustand der Konversation an.

Embedding-Centroids sind das Schlüsselelement, das all das ohne übermäßige Komplexität ermöglicht: kein trainiertes neuronales Netzwerk, keine gelabelte Datenpipeline, nur Vektordurchschnitte und Kosinus-Ähnlichkeiten. Es ist eine einfache Technik, unglaublich effektiv und schrecklich unterschätzt.

| Ressource | Link |
|-----------|------|
| Projekt-Website | [protocol-luna.github.io](https://protocol-luna.github.io/) |
| Pixieglow | [protocol-luna/pixieglow](https://github.com/protocol-luna/pixieglow) |
| Emerald | [protocol-luna/emerald](https://github.com/protocol-luna/emerald) |
| Sapphire | [protocol-luna/sapphire](https://github.com/protocol-luna/sapphire) |
| Krystal | [protocol-luna/krystal](https://github.com/protocol-luna/krystal) |
| Artikel 1: der Discord-Bot | [Luna Protocol: Ich habe einen autonomen Discord-Bot erschaffen](/articles/de/luna-protocol-discord-bot) |
| Artikel 2: das Fine-Tuning | [Luna Protocol: warum ich ein 1,5B-Modell fine-getunt habe](/articles/de/luna-protocol-official-models) |