---
title: "Luna Protocol: Brain-Insasse, emotionale Klassifizierung und interessante/unnötige Routing"
description: "Luna Protocol wechselte von einem Monolith zu einer vierschichtigen Architektur: Adapter, Brain, emotionale Klassifizierung und Deterence. Zum Programm: Zentroids von Embeddings, interessante/unnötige Routing und Anpassung der LLM-Parameter durch Valenz und Arousal."
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
lang: "de"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "12s59TG+4p5b2hpPTLRk2yD1OaOt9bVJzvPVaU94FAAM4nijq4sR8mIp45EWnebAOMgFJVPOCj8gkvDXHEb7BQ=="
---
# 

In den [deux](/articles/fr/luna-protocol-discord-bot) [articles](/articles/fr/luna-protocol-official-models)Vorher habe ich Luna Protocol als einzigartigen Discord-Bot mit einem komplexen Verhaltenssystem und einem fein-getönten Modell vorgestellt. Aber die Architektur hat sich seither gut entwickelt. Was ein Monolith war: ein einziger Node.js-Prozess, der sowohl den Discord Bot, das Verhalten und die LLM-Aufrufe verwaltete, hat sich in **vier unabhängige Schichten** verwandelt, jede mit eigener Verantwortung, Sprache und eigenem Lebenszyklus.

Diese Trennung hat unerwartete Vorteile gebracht: die Bündelung von "Kirschen" zwischen mehreren Plattformen, ein emotionales Klassifizierungssystem, das die Parameter des LLM dynamisch passt, und eine intelligente Routing von Nachrichten zwischen zwei Modellen, je nach der wahrgenommenen Bedeutung des Gesprächs.

Die Evolution hat sich nicht plötzlich vollzogen: sie ist einem organischen Weg gefolgt. Ich habe zuerst die Akte getrennt`server/`des Bot-Repos, so dass **Krystal** auf einer Seite und lassen **Jade** als Discord-Adapter. Dann habe ich **Pixieglow** (Matrix-Adapter) erstellt, indem ich den`llm-core`und der Jade-Eventbus. Dann kam **Sapphire**, um eine GENERIC/SEMANTIC Klassifizierung mit DistilBERT einzuführen. Die Ergebnisse waren nicht schlüssig, so dass ich durch Hunderte von Embeddings gegangen bin, die für die Bereicherung von Beispielen mehr formbar und präziser sind; die Klassifizierung wurde FUtil/INTERESSANT. Schließlich habe ich hunderte von **Vielfalt** und **arousal** hinzugefügt, um die Temperatur und das repeat penalty des LLM zu regulieren. Schließlich hab ich den ganzen Redundant-Code zwischen Jade und Pixieglow durch die Schaffung **Emerald**, das Gehirn vereinfacht, Jade zu Pixeglov in einfache Socket-Driven-Kunden umwandeln.

Gleichzeitig habe ich eine Website auf dem neuesten Stand gehalten, die den Fortschritt des Projekts nachvollziehen soll:[protocol-luna.github.io](https://protocol-luna.github.io/) .

Dieser Artikel erzählt, wie und warum ich diese Schichten geschnitten habe, was jeder Dienst genau tut, und wie Konzepte wie **centroids** (mittlere Embeddingsvektoren) und **Variablen von Groll** (inspiriert von dem PARRY-Catbot der 70er Jahre) einen einfachen Discord-Bot in ein erstaunlich zusammenhängendes Multiplattformsystem verwandelt haben.

---

## Das Problem mit dem Monolith

Luna Protocol hatte zunächst nur einen Node.js-Prozess. Der Code war:

- Verbindung zu Discord (über die Bibliothek Eris)
- Die Auswertung der Auslöser (Erläuterungen, Schlüsselwörter, Follow-up...)
- Simulation menschlicher Verhaltensweisen (Schlagfehler, Zögern, Schlaf...)
- HTTP-Aufrufe an den lokalen LLM-Server (llama.cpp)
- Verwaltung von Sitzungen und Anti-Spam
- Die TTS-Pipeline

Alles war im selben Prozess, mit dem Bus von typischen Ereignissen (`TypedBus`Es funktionierte, aber mit Grenzen:

- **Keine Matrix** Clients hinzufügen, ohne den gesamten Verhaltenscode zu duplizieren
- **LM und Bot waren im selben Repo**:`server/`Es gab bereits, aber es konnte nicht das eine verändern, ohne das andere zu berühren.
- **Undifferenzierte Behandlung**: Jede Nachricht wurde auf dieselbe Weise behandelt, unabhängig davon, ob es sich um einen "Lol" oder um eine existenzielle Frage handelte.
- **Emotionale Amnesie**: der Bot "erhielt" nichts

Die Schichtschnitte haben all diese Probleme gelöst.

---

## Die vier Schichten

Die aktuelle Architektur von Luna Protocol ist als ein Vier-Stufen-Trichter organisiert:
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
Jede Schicht kann unabhängig von ihrem Standort neu gestartet, aktualisiert oder ersetzt werden.

---

### Schlafzimmer 1: Adapter (Pixieglow und Jade)

Das sind die einfachsten Schichten. deine einzige Aufgabe ist es, die Ereignisse einer E-Mail-Plattform in ein standardisiertes Protokoll zu Emerald zu übersetzen:

- **Jade** ist der Discord-Adapter. Er verwendet die Eris-Bibliothek, um sich mit Discord zu verbinden und Nachrichten über WebSocket an Emerald zu forwardieren. Er verwaltet auch die TTS-Pipeline (Sprachsynthese über Piper, Umwandlung in OGG, Upload auf Discord).
- **Pixieglow** ist der Matrix-Adapter. Er verwendet die Matrix-Client-Server-API direkt (keine SDK), mit einem langen Sync-Poll. Es hat keine TTS.

Beide Adapter teilen das gleiche WebSocket-Protokoll, das in`emerald-client.ts`:
```typescript
type ClientId = "jade" | "pixieglow";

// Ereignisse (Adapter -> Emerald)
type InEvent = MessageEvent | ReadyEvent | BotMessageEvent | PresenceEvent;

// Befehle (Emerald -> Adapter)
type OutCommand = RespondCommand | TypingCommand | SetPresenceCommand
                | SpontaneousCommand | ForgotCommand;
```
Die Existenz von zwei Adaptern mit derselben Schnittstelle beweist die gemeinsame Schnittstelle: **derselbe "Hirn" (Emerald) dient gleichzeitig einem Discord-Bot und einem Matrix-Bort** mit identischen Verhaltensweisen. Das Protokoll ist deklarativ: Emerald sagt dem Adapter nicht *wie* eine Nachricht senden, er sagt * was* senden (der Text mit einer Verzögerung, möglicherweise einem Burstplan, einer Reaktion usw.). Jeder Adapter implementiert die konkrete Ausführung nach seiner Plattform.

Das ist die Stärke dieser Architektur: Um die Unterstützung von Telegram, Signal oder anderen hinzuzufügen, schreibst du einfach einen Adapter, der das WebSocket-Protokoll implementiert.

---

### Schlafen du 2: das Gehirn (Emerald)

Emerald ist der zentrale Entscheidungsdienst. Er hört auf den Port 3126 in WebSocket und verwaltet:

- **Die Bewertung der Auslöser**: Erwähnung, DM, Name, Schlüsselwort, follow-up, zufällig
- ** Verhaltenssimulation**: Konzentrationsverzögerungen, Fehler beim Schlagen, Zögern, Vergessenheit, Burst, thematische Ermüdung
- **Schlafzyklen**: sleep / slow / short Modi
- **Die Verwaltung der Sitzungen**: cooldown, Sitzungsgrenzen, Spam-Anti-Spam
- **Routing nach Sapphire**: Nachrichten senden, Antworten empfangen

Emerald ist der zentrale Dienst, der die Gegenseitigkeit ermöglicht hat, und es ist derjenige, der am meisten von der Trennung profitiert hat. Vorher war jedes Verhalten (typo, burst, hesitation) mit dem Discord Code verwoben. Jetzt sind sie in dedizierten Modulen in`behavior/`:
```
emerald/src/behavior/
  burst.ts         -- Planification des messages en rafales
  mannerisms.ts    -- Délais, hésitations, réactions, oublis
  sleep.ts         -- Évaluation des horaires de sommeil
  typo.ts          -- Simulation de fautes de frappe (AZERTY/QWERTY)
```
Das Gehirn weiß nicht, auf welcher Plattform es läuft.`MessageEvent`mit einem`clientId`("jade" oder "pixieglow"), entscheidet über eine Entscheidung und gibt einen Befehl zurück. Der Adapter kümmert sich um den Rest.

---

### Schicht 3: Der emotionale Klassifizierungs- (Sapphire)

Sapphire ist der technisch interessanteste Service. Es ist ein **middleware LLM** in Python mit FastAPI geschrieben, die vier kritische Rollen spielt:

1. **FUTIL/INTERESSANT**-Binär-Klasse** via Zentroids von Embeddings
2. **Emotionaler Spiegel** (Vielfalt / Arousal) über Zentroids
3. **Backends-Ruter** nach Krystal (kleines Modell vs. großes Modell)
4. **Few-shot-Injektor** und Sitzungsmanager

#### Die Zentroids: das Herz der Klassifikation

Ein **centroid** ist ein einfaches Konzept: es ist der Durchschnitt einer Reihe von Embeddings-Vektoren. Konkret habe ich Hunderte von Beispielen von Nachrichten gesammelt, ich habe sie in einem Embedsding-Modell (`BAAI/bge-small-en-v1.5`384 Dimensionen), und ich habe die Vektoren gemittelt.

Es gibt **2hundert Klassifikationen**:

- `futile_centroid`: ~683 trivial messages ("lol", "ok", hallo") via k-means (k=10, seed=42)
- `interessant_centroid`: ~678 wesentliche Botschaften (technische, persönliche, philosophische) über k-means (k=10, seed=42)

Wenn eine Nachricht kommt:
```python
def classify(text, embedder, futile_centroids, interessant_centroids):
    emb = embedder.query_embed(text)                     # vecteur 384-D
    sim_f = max(cos(emb, c) for c in futile_centroids)     # max sur 10
    sim_i = max(cos(emb, c) for c in interessant_centroids) # max sur 10
    diff = sim_i - sim_f
    label = "INTERESSANT" if diff > 0 else "FUTILE"
    return label, abs(diff), sim_f, sim_i
```
Der Klassenpunkt ist die maximale kosinusähnliche ** von seinen 10 Zentimetern. Dies erfasst Subtypen in jeder Kategorie: Ein Gruß und ein Abschied fallen beide fast eines der 10 vergeblichen Zentroids, auch wenn sie im Embedding Raum entfernt sind. Nur vom K-Means beim Start und von den skalarischen Produkten bei der Ausführung: ohne Training, ohne GPU.

#### Warum zwei Modelle?

Das Ergebnis dieser Klassifizierung entscheidet , welches RLM-Backend verwendet wird:

| Label | Backend Krystal | Muster | Port |
|-------|----------------|--------|------|
| `FUTILE` | `generic` | Luna-Protocol-1.5B (941 MB, Q4_K_M) | 3124 |
| `INTERESSANT` | `semantic` | Hermes-3-3B oder 8B (nach config) | 3125 |

Die Intuition ist einfach: Ein "Lol" oder ein "nm just challin u" verdient nicht ein Modell von 8 Milliarden Parametern. Das kleine fein-getönte Modell Luna 1.5B, angetrieben von 200.000 Proben Discord, reicht für den leichten Austausch aus. Andererseits wird eine Frage über das Leben, ein Vertrauen oder eine technische Debatte zum großen Modell, das eine reichere Antwort erzeugen kann, gedreht.

Dieses wirtschaftliche Routing reduziert die Belastung auf dem LLM Server erheblich: etwa 70% der Nachrichten werden von der kleinen Vorlage als FUTILE eingestuft und verarbeitet, wodurch das große Modell für Gespräche freigegeben wird, die es wirklich wert sind.

#### Die emotionale Achse: Valenz und Arousal

Aber das ist nicht alles. Sapphire verwendet den **selben Centroid-Mechanismus** auf einer unabhängigen Achse, um die Emotion der Nachricht zu bewerten:

Es gibt **4.100 emotionaler Troika**:

| Pol | Beispiele |
|------|----------|
| `positive` | "Hölle ja", "Liebe das", "Das ist großartig" |
| `negative` | "Scheiße, ich hasse das", "das ist scheiße" |
| `high_arousal` | "WAS HOLLE", "omg omg omg", "AAAAA" |
| `low_arousal` | "Just chilling", "Meh" und "I guess" |

Der Punkt wird als Differenz der Ähnlichkeit auf jeder Achse berechnet:
```python
valence = sim(emb, positive) - sim(emb, negative)     # [-1, +1]
arousal = sim(emb, high_arousal) - sim(emb, low_arousal)  # [-1, +1]
```
**Valence** misst, ob die Nachricht positiv oder negativ ist. **Arousal** misst ihre emotionale Intensität. Zusammen bilden sie das cirkumplex Modell der Affäre (Russell, 1980), das gleiche psychologische Modell, das den Katzebot **PARRY** 1972 inspirierte.

#### Die Grollvariablen: Wie die Emotionen das LLM kontrollieren

Dort wird die Inspiration von PARRY spürbar. PARY (gegründet von Kenneth Colby 1972) war ein Kater, der einen paranoiden Patienten simulieren sollte. Er besaß innere Variablen (Angst, Wut, Misstrauen), die seine Antworten änderten. Zum Beispiel reagierte ein "schreckender" PARY aggressiver.

Sapphire tut das Gleiche, aber mit kontinuierlichen Variablen und einer eleganten Methode: Die LLM-Stichprobenparameter werden in Echtzeit entsprechend dem emotionalen Zustand des Gesprächs angepasst.

##### Die Temperatur folgt dem Arusal
```python
temperature = clamp(0.7 + arousal * 0.3, 0.4, 1.0)
```
| Arousal | Temperatur | Wirkung |
|---------|-------------|-------|
| -1,0 (calm) | 0,40 | Niedrige Kreativität, vorhersehbare Antworten |
| 0.0 (neutral) | 0,70 | Standard-Ergeblichkeit |
| +1,0 (aufregend) | 1,00 | Maximale Randomität, überraschende Antworten |

Wenn jemand aufgeregt oder verärgert ist (hoher Arusal), steigt die Temperatur. Das Modell erzeugt vielfältigere, kreativere und manchmal chaotischere Antworten, wie ein Mensch, der "sich ärgern" kann. Wenn das Gespräch ruhig ist, sinkt die Temperatur, die Antworten werden mehr gestellt.

##### Die repeat penalty folgt der Valenz
```python
repeat_penalty = clamp(1.15 - valence * 0.1, 1.0, 1.3)
```
| Valencia | Repeat Penalty | Wirkung |
|---------|---------------|-------|
| -1,0 (negativ) | 1.25 | Hohe Strafe, vermeiden Wiederholungen |
| 0.0 (neutral) | 1.15 | Standardwert |
| +1.0 (positiv) | 1.05 | Niedrige Strafe, erlaubt Wiederholungen |

Je negativ das Gespräch ist, desto mehr wird das Modell dazu gedrängt, sich nicht zu wiederholen, wie jemand, der seine Worte in einem angespannten Streit sucht. Je positiver das Gespräch, des desto länger kann sich das Modell redundante Aussagen wie ein entspanntes Gespräch leisten.

##### Der emotionale Zustand der Kumulation

Diese Punkte beziehen sich nicht nur auf die unmittelbare Nachricht.`EmotionState`hält eine •exponentielle mittlere mobile** Valenz und Arousal pro Sitzung:
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
Das`decay`0.85 bedeutet, dass 85% des vorherigen Zustandes bei jeder Nachricht gehalten wird, und 15% des neuen Signals ist integriert. Dies gibt ein ** emotionales Gedächtnis**, das die brutalen Variationen glättet: eine einzige negative Nachricht macht den Bot nicht "trüb," aber eine Reihe von negativen Botschaften macht allmählich seine Stimmung ablenken.

In der Praxis: Wenn jemand beginnt ein Gespräch sehr aufgeregt (`arousal=+0.8`), die Temperatur bleibt während mehrerer Austausche hoch, auch wenn die folgenden Nachrichten ruhiger sind. Die Emotion dauert Zeit, um zu sinken, wie ein Mensch, der "heiß" bleibt nach einem Streit.

---

### Schlafens 4: die Krystal-Konferenz

Krystal ist die unterste Schicht: ein Wrapper um`llama.cpp`die eine OpenAI-kompatible API (`/v1/chat/completions`) Es dreht sich in zwei PM2 Instanzen:

- `krystal-small`: das Modell Luna 1.5B fein-getönte, auf dem Port 3124, mit CPU-Verwandtschaft 0
- `krystal-large`: ein Modell Hermes 3B, am Port 3125, mit CPU-Verwandtschaft 0,1

Beide Instanzen sind Prozesse`llama-server`vorkompiliert, mit`taskset`für Pinning CPU.

Auch der Feinton des Luna-Modells hat sich seit dem zweiten Artikel verändert: Es wird jetzt auf **200.000 Proben** (gegenüber 50.000 vorher) angetrieben, immer von Qwen2.5-1.5B-Instruct über QLoRA. 200k Proben sind Teil des Discord-Dialogs, gefiltert, um nur die natürlichsten und die verschiedensten Gespräche zu halten. Das Ziel , das stilistische Register des Modells zu erweitern, ohne die Flexibilität zu verlieren, die den Few-Shot Priming so effektiv macht.

---

## Das vollständige Schema: eine Transitnachricht

Hier ist, was konkret geschieht, wenn jemand sendet "Ich bin wirklich traurig heute" auf Discord:

1. **Jade** erhält die Nachricht über die Gateway Discord API. Er verwandelt sie in`MessageEvent`und schickt sie über WebSocket an Emerald.
2. **Emerald** bewertet den Auslöser (Erläuterung?Name?Schlüsselwort?). Dies ist eine direkte Erwähnung. Es berechnet eine Konzentrationszeit, überprüft den Cooldown, die Sitzung, die thematische Müdigkeit. Er entscheidet, zu antworten und sendet die Nachricht über HTTP an Sapphire.
3. **Sapphire** embedd die Nachricht mit`bge-small-en-v1.5` .
   - Klassifizierung: Die Nachricht näher an den Zentroid`interessant`nur von Zentroid`futile`(diff = +0.31) -> **INTERESSANT**
   - Emotion: negative Valenz (-0.42), mäßig arousal (0.35)
   - Lenken: Richtung`KRYSTAL_SEMANTIC_URL`(Port 3125, großes Modell)
   - Parameter Probenahme: Temperatur = 0.80 (erhöhter Aroma), repeat_penalty = 1.19 (negative Wirkung)
   - Der emotionale Status der Sitzung wird mit diesen Werten aktualisiert
4. **Krystal** (große Instanz) erzeugt die Antwort mit emotional angepassten Parametern und verweist sie auf Sapphire.
5. **Sapphire** stream die Antwort auf Emerald mit Metadaten (Label, Valenz, Arousal, Debugging-Statistiken).
6. **Emerald** entscheidet, ein Zögern ("oh..."), plant einen Burst (2 Fragmente), und wählt eine Reaktion.`RespondCommand`Jade.
7. **Jade** führt aus: Wartet auf die anfängliche Zeit, sendet das erste Fragment mit Zögern, wartet auf 1.5s, sendet den zweiten Fragment. Es zeigt die Tastenanzeige während der ganzen Generation.

All dies in weniger als 3 Sekunden für den Benutzer.

---

## Die Zentroids: Warum ist es besser als ein neuronaler Klassifizierungsapparat

Die Wahl der hundertköpfigen Embeddings statt eines traditionellen Klassifizierungs- (wie DistilBERT, das ich vorher benutzte) verdient eine Erklärung.

Ein neuronaler Klassifizierungsapparat lernt eine Entscheidungsgrenze zwischen den Klassen, typischerweise eine nichtlineare Transformation, die die Eingänge auf Wahrscheinlichkeiten projiziert.

- Es erfordert etikettierte Trainingsdaten
- Es reagiert empfindlich auf den Vertrieb (data drift)
- Es ist schwer zu interpretieren
- Er muss wieder trainiert werden, um eine neue Klasse hinzuzufügen.

Ein Zentroid dagegen ist ein durchschnittliches **-Vektor von Beispielen. Die Klassifizierung erfolgt durch kosinus Ähnlichkeit mit diesem durchschnittlichen Vektor.

- **Keine Trainingsvoraussetzung**: Es wird nur der Durchschnitt der Embeddings von hand gewählten Beispielen berechnet
- **Geradlinig zu interpretieren**: Man kann sich die Beispiele ansehen, die dem Zentroud am nächsten stehen, um zu verstehen, "was der Zentroid gelernt hat."
- **Klassen hinzufügen**: Es wird nur ein neuer Zentroid hinzugefügt, ohne erneut zu trainieren
- **Robuste**: Zentroid ist ein Durchschnitt, so dass Outliers wenig Wirkung haben

Die wahre Macht der Zentroiden ist, dass sie ein Klassifizierungsproblem in ein Problem der ** Raumfernmessung** verwandeln. Die Kategorien können als Regionen in einem 384-dimensionalen Raum (oder in 2D/3D nach der Größenreduzierung PCA/t-SNE) dargestellt werden.

### 3D-Visualisierung von Zentroids

In der Praxis sehen die Zentroids für die Klassifizierung im Embedding-Raum so aus. Jeder Punkt ist eine Beispielmeldung, die von PCA in 3D projiziert wird (die Originalgrößen werden auf 3 reduziert). Blaue Punkte sind leere Nachrichten, die gelben Punkte sind interessante Nachrichten. **20 Diamantmarker** sind die k-means-Zentroid (10 pro Klasse, seed=42).

<iframe src="assets/centroids-plot.html" style="width:100%;height:550px;border:none;border-radius:8px;" loading="lazy" title="Zentrifugalsystem - interaktive 3D-Ansicht"></iframe>

Zwei Testbeispiele werden in rot angezeigt: "lol" (vergebliche Abfolge) und "i feel sad today" (interessante Ablage). Auch nach einer Verringerung von 384 auf 3 Dimensionen (14,7% der Varianz erklärt) sind die beiden Cluster klar getrennt. Die Anmerkung oben zeigt die genauen Konten und die zweideutige Zone.

Der Zentroid der Eingabemeldung geht in diesem Raum nach seinem Inhalt. Die FUTILE/INTERESSANT Klassifikation besteht einfach darin, zu messen, welcher Zentrold der nächste ist durch cosinus Ähnlichkeit. So kann jede Nachricht als Punkt in einem mehrdimensionalen Raum dargestellt werden, jede Dimension entspricht einer semantischen Eigenschaft.

---

## Was es in der Praxis ändert

Die Benutzer sehen keine Schichten, Zentroids oder Temperaturanpassungen. Aber sie fühlen die Auswirkungen:

- **Schnellere Antworten** für einfache Nachrichten (das kleine Modell ist 2x schneller und verwaltet 70% des Verkehrs)
- **Dein adaptiver**: Wenn du sauer sind, "spornt" der Bot ihn an und passt seinen Stil an
- **Cross-Plattform-Kohärenz**: ein Bot Matrix und ein Bot Discord teilen das gleiche Gehirn und den gleichen emotionalen Zustand
- **Dein authentisches erhalten**: Fein-Tun + Few-Shot + intelligente Routing vermeidet Corporate-Antworten

Der Übergang zu 200k Trainingsproben für das kleine Modell hat diese Effekte noch verstärkt: Das Modell erfasst die Vielfalt der Discord-Gespräche besser, ohne die Schattierungsfähigkeit zu verlieren, die der Few-Shot Priming ermöglicht.

---

## Die vollständige Infrastruktur

Hier sind die Dienstleistungen, die derzeit laufen:

| Dienst | Technologie | Port(s) | Rolle |
|---------|------------|---------|------|
| Pixieglow | TypScript (Bun) | -- | Adapter Matrix |
| Jade | TypeScript (esbuild) | -- | Discord-Adapter |
| Emerald | TypScript (Bun) | 3126 (WebSocket) | Gehirn / Entscheidungen |
| Sapphire | Python (FastAPI) | 3123 (HTTP) | Classifier + Emotion |
| Krystal small | llama.cpp (PM2) | 3124 | Kleines Modell (1,5B, leer) |
| Krystal breit | llama.cpp (PM2) | 3125 | Großartiges Modell (3B+, interessant) |

Die Abhängigkeiten zwischen den Diensten sind unidirektional: Der Adapter hängt von Emerald ab, Emerald hängt von Sapphire ab, Sapphire hängt von Krystal ab. Der Graphen bleibt azyklisch. Jeder Service kann unabhängig neu gestartet werden.

---

## Schlussfolgerung

Luna Protocol in vier Schichten zu teilen, war nicht nur eine Übung der Architektur. Es war eine Antwort auf konkrete Einschränkungen: Unmöglichkeit, Matrix zu ertragen, Mangel an emotionalem Bewusstsein, keine intelligente Priorisierung der Botschaften.

Heute ist das System robuster (ein LLM-Absturz tötet den Bot nicht), erweiterbar (ein Telegram-Adapter oder WhatsApp würde dasselbe WebSocket-Protokoll folgen) und "lebend": der Bot passt sein Verhalten, seinen Ton und sogar die Parameter des LLLM an den emotionalen Zustand des Gesprächs an.

Die Zentroiden von Embeddings sind das Schlüsselelement, das all dies ohne übermäßige Komplexität möglich macht: kein Netzwerk von angetriebenen Neuronen, keine Pipeline von gekennzeichneten Daten, nur mittlere Vektoren und cosinus Ähnlichkeiten. Es ist eine einfache, unglaublich effiziente und schrecklich unterschätzte Technik.

| Ressourcen | Zusammenhang |
|----------|------|
| Projekt-Website | [protocol-luna.github.io](https://protocol-luna.github.io/) |
| Pixieglow | [protocol-luna/pixieglow](https://github.com/protocol-luna/pixieglow) |
| Emerald | [protocol-luna/emerald](https://github.com/protocol-luna/emerald) |
| Sapphire | [protocol-luna/sapphire](https://github.com/protocol-luna/sapphire) |
| Krystal | [protocol-luna/krystal](https://github.com/protocol-luna/krystal) |
| Artikel 1: Der Zwiespalt | [Luna Protocol: j'ai créé un bot Discord autonome](/articles/fr/luna-protocol-discord-bot) |
| Artikel 2: Fine-Tuning | [Luna Protocol: pourquoi j'ai fine-tuné un modèle de 1,5B](/articles/fr/luna-protocol-official-models) |
