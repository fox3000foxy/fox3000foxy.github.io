---
title: "Luna Protocol: condivisione dei cervelli, classificazione emozionale, e routing interessante/futile"
description: "Luna Protocol è passato da un monolite a un'architettura a quattro strati: adattatori, brain, classificatore emozionale, e inference. In programma: centroid di embedding, routing interessante/futile, e regolazione dei parametri LLM per valenza e arousal."
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
author_sig: "jNxFaS75/3TYxkm6rIUAB1h/E2cQcirVPPfZE+b57NVfIspuoUAf71y/Qtl7v5r35AGqFo+GQ9tl1xnNY4WuPA=="
---

# Luna Protocol: condivisione dei cervelli, classificazione emozionale, e routing interessante/futile

Nei [due](/articles/it/luna-protocol-discord-bot) [articoli](/articles/it/luna-protocol-official-models) precedenti, ho presentato Luna Protocol come un bot Discord unico con un sistema comportamentale complesso e un modello fine-tunato. Ma l'architettura da allora si è evoluta molto. Ciò che era un monolite: un solo processo Node.js che gestiva sia il bot Discord, il comportamento, e le chiamate LLM, si è trasformato in **quattro strati indipendenti**, ognuno con la sua responsabilità, il suo linguaggio, e il suo ciclo di vita.

Questa separazione ha portato benefici inattesi: la condivisione dei "cervelli" tra più piattaforme, un sistema di classificazione emozionale che regola dinamicamente i parametri dell'LLM, e un routing intelligente dei messaggi tra due modelli secondo l'importanza percepita della conversazione.

L'evoluzione non è avvenuta d'un colpo: ha seguito un percorso organico. Ho prima separato la cartella `server/` dal repo del bot, creando così **Krystal** da un lato e lasciando **Jade** come adattatore Discord. Poi ho creato **Pixieglow** (adattatore Matrix) riprendendo l'`llm-core` e il bus di eventi di Jade. Poi è arrivato **Sapphire** per introdurre una classificazione GENERIC/SEMANTIC con DistilBERT. I risultati non erano convincenti, quindi sono passato per centroid di embedding, più malleabili per l'arricchimento di esempi e più precisi; la classificazione è diventata FUTILE/INTERESSANTE. Ho infine aggiunto centroid di **valenza** e **arousal** per regolare temperatura e repeat penalty dell'LLM. Per finire, ho tolto tutto il codice ridondante tra Jade e Pixieglow creando **Emerald**, il cervello condiviso, trasformando Jade e Pixieglow in semplici client socket-driven.

In parallelo, ho tenuto aggiornato un sito web che traccia l'avanzamento del progetto: [protocol-luna.github.io](https://protocol-luna.github.io/).

Questo articolo racconta come e perché ho tagliato questi strati, cosa fa esattamente ogni servizio, e come concetti come i **centroid** (vettori medi di embedding) e le **variabili di risentimento** (ispirate al chatbot PARRY anni 70) hanno trasformato un semplice bot Discord in un sistema multi-piattaforma sorprendentemente coerente.

---

## Il problema col monolite

All'inizio, Luna Protocol stava in un solo processo Node.js. Il codice gestiva:

- La connessione a Discord (via la libreria Eris)
- La valutazione dei trigger (menzioni, parole chiave, follow-up...)
- La simulazione di comportamenti umani (refusi, esitazioni, sonno...)
- Le chiamate HTTP al server LLM locale (llama.cpp)
- La gestione delle sessioni e dell'anti-spam
- La pipeline TTS

Tutto era nello stesso processo, comunicando via bus di eventi tipizzati (`TypedBus`). Funzionava, ma con limiti:

- **Impossibile aggiungere un client Matrix** senza duplicare tutto il codice di comportamento
- **LLM e bot erano nello stesso repo**: la cartella `server/` esisteva già, ma impossibile far evolvere l'uno senza toccare l'altro
- **Elaborazione indifferenziata**: ogni messaggio era trattato allo stesso modo, che fosse un "lol" o una domanda esistenziale
- **Amnesia emozionale**: il bot non "sentiva" niente

Il taglio in strati ha risolto tutti questi problemi.

---

## I quattro strati

L'architettura attuale di Luna Protocol è organizzata come un imbuto a quattro livelli:

```
Matrix / Discord
      |
      v
  [ADATTATORI]      Pixieglow (Matrix) / Jade (Discord)
      |
      v
  [BRAIN]            Emerald (WebSocket, porta 3126)
      |
      v
  [CLASSIFICATORE]   Sapphire (HTTP, porta 3123)
      |
      v
  [INFERENCE]        Krystal (llama.cpp, porte 3124 / 3125)
```

Ogni strato può essere riavviato, aggiornato, o sostituito in modo indipendente.

---

### Strato 1: gli adattatori (Pixieglow e Jade)

Sono gli strati più semplici. Il loro unico lavoro è tradurre gli eventi di una piattaforma di messaggistica in un protocollo standardizzato verso Emerald:

- **Jade** è l'adattatore Discord. Usa la libreria Eris per connettersi a Discord e inoltrare i messaggi verso Emerald via WebSocket. Gestisce anche la pipeline TTS (sintesi vocale via Piper, conversione in OGG, upload su Discord).
- **Pixieglow** è l'adattatore Matrix. Usa l'API HTTP Client-Server di Matrix direttamente (niente SDK), con un long-poll sync. Non ha TTS.

Entrambi gli adattatori condividono lo stesso protocollo WebSocket definito in `emerald-client.ts`:

```typescript
// protocollo WebSocket condiviso tra adattatori ed Emerald
type ClientId = "jade" | "pixieglow";

// Eventi (adattatore -> Emerald)
type InEvent = MessageEvent | ReadyEvent | BotMessageEvent | PresenceEvent;

// Comandi (Emerald -> adattatore)
type OutCommand = RespondCommand | TypingCommand | SetPresenceCommand
                | SpontaneousCommand | ForgotCommand;
```

L'esistenza di due adattatori con la stessa interfaccia prova la condivisione: **lo stesso "cervello" (Emerald) serve indifferentemente un bot Discord e un bot Matrix**, con comportamenti identici. Il protocollo è dichiarativo: Emerald non dice all'adattatore *come* inviare un messaggio, dice *cosa* inviare (il testo con un ritardo, eventualmente un piano di burst, una reazione, ecc.). Ogni adattatore implementa l'esecuzione concreta secondo la sua piattaforma.

È la forza di questa architettura: per aggiungere il supporto di Telegram, Signal, o altro, basta scrivere un adattatore che implementa il protocollo WebSocket.

---

### Strato 2: il cervello (Emerald)

Emerald è il servizio centrale di decisione. Ascolta sulla porta 3126 in WebSocket e gestisce:

- **La valutazione dei trigger**: menzione, DM, nome, parola chiave, follow-up, casuale
- **La simulazione comportamentale**: ritardi di concentrazione, refusi, esitazioni, dimenticanze, burst, fatica tematica
- **I cicli di sonno**: modalità sleep / slow / short
- **La gestione delle sessioni**: cooldown, limiti di sessione, anti-spam
- **Il routing verso Sapphire**: invio dei messaggi, ricezione delle risposte in stream

Emerald è il servizio centrale che ha permesso la condivisione, ed è quello che ha beneficiato di più dalla separazione. Prima, ogni comportamento (typo, burst, hesitation) era intrecciato col codice Discord. Ora, stanno in moduli dedicati in `behavior/`:

```
emerald/src/behavior/
  burst.ts         -- Pianificazione dei messaggi a raffica
  mannerisms.ts    -- Ritardi, esitazioni, reazioni, dimenticanze
  sleep.ts         -- Valutazione degli orari di sonno
  typo.ts          -- Simulazione di refusi (AZERTY/QWERTY)
```

Il cervello non sa su quale piattaforma gira. Riceve un `MessageEvent` con un `clientId` ("jade" o "pixieglow"), prende una decisione, e rinvia un comando. L'adattatore si occupa del resto.

---

### Strato 3: il classificatore emozionale (Sapphire)

Sapphire è il servizio più interessante sul piano tecnico. È un **middleware LLM** scritto in Python con FastAPI, che gioca quattro ruoli critici:

1. **Classificatore binario FUTILE / INTERESSANTE** via centroid di embedding
2. **Punteggiatore emozionale** (valenza / arousal) via centroid
3. **Router di backend** verso Krystal (modello piccolo contro modello grande)
4. **Iniettore few-shot** e gestore di sessioni

#### I centroid: il cuore della classificazione

Un **centroid** è un concetto semplice: è la media di un insieme di vettori di embedding. In concreto, ho raccolto centinaia di esempi di messaggi, li ho passati in un modello di embedding (`BAAI/bge-small-en-v1.5`, 384 dimensioni), e ho mediato i vettori ottenuti.

Ci sono **due centroid di classificazione**:

- `futile_centroid`: circa 683 messaggi banali ("lol", "ok", "hello") via k-means (k=10, seed=42)
- `interessant_centroid`: circa 678 messaggi sostanziali (tecnici, personali, filosofici) via k-means (k=10, seed=42)

Quando arriva un messaggio:

```python
# classifica per similarità coseno max ai centroid
def classify(text, embedder, futile_centroids, interessant_centroids):
    emb = embedder.query_embed(text)                     # vettore 384-D
    sim_f = max(cos(emb, c) for c in futile_centroids)     # max su 10
    sim_i = max(cos(emb, c) for c in interessant_centroids) # max su 10
    diff = sim_i - sim_f
    label = "INTERESSANT" if diff > 0 else "FUTILE"
    return label, abs(diff), sim_f, sim_i
```

Il punteggio per classe è la **similarità coseno massima** tra i suoi 10 centroid. Cattura i sottotipi in ogni categoria: un saluto e un arrivederci cadono entrambi vicino a uno dei 10 centroid futili anche se sono lontani nello spazio di embedding. Solo k-means all'avvio e prodotti scalari all'esecuzione: senza allenamento, senza GPU.

#### Perché due modelli?

Il risultato di questa classificazione decide quale backend LLM è invocato:

| Label | Backend Krystal | Modello | Porta |
|-------|----------------|--------|------|
| `FUTILE` | `generic` | Luna-Protocol-1.5B (941 MB, Q4_K_M) | 3124 |
| `INTERESSANT` | `semantic` | Hermes-3-3B o 8B (secondo config) | 3125 |

L'intuizione è semplice: un "lol" o un "nm just chillin u" non merita di invocare un modello da 8 miliardi di parametri. Il piccolo modello fine-tunato Luna 1.5B, allenato su 200 000 campioni Discord, basta ampiamente per gli scambi leggeri. Invece, una domanda sulla vita, una confidenza, o un dibattito tecnico è instradato verso il grande modello che può produrre una risposta più ricca.

Questo routing economico riduce molto il carico sul server LLM: circa il 70% dei messaggi è classificato FUTILE e trattato dal piccolo modello, liberando il grande modello per le conversazioni che valgono davvero la pena.

#### L'asse emozionale: valenza e arousal

Ma non è tutto. Sapphire usa lo **stesso meccanismo di centroid** su un asse indipendente per valutare l'emozione del messaggio:

Ci sono **quattro centroid emozionali**:

| Polo | Esempi |
|------|----------|
| `positive` | "hell yeah", "love that", "this is great" |
| `negative` | "shut up", "i hate this", "this sucks" |
| `high_arousal` | "WHAT THE HELL", "omg omg omg", "AAAAA" |
| `low_arousal` | "just chilling", "meh", "i guess" |

Il punteggio si calcola come differenza di similarità su ogni asse:

```python
# valenza e arousal come differenze di similarità
valence = sim(emb, positive) - sim(emb, negative)     # [-1, +1]
arousal = sim(emb, high_arousal) - sim(emb, low_arousal)  # [-1, +1]
```

**Valenza** misura se il messaggio è positivo o negativo. **Arousal** misura la sua intensità emozionale. Insieme, formano il modello circumplex dell'affect (Russell, 1980), lo stesso modello psicologico che ha ispirato il chatbot **PARRY** nel 1972.

#### Le variabili di risentimento: come le emozioni controllano l'LLM

È lì che l'ispirazione di PARRY diventa tangibile. PARRY (creato da Kenneth Colby nel 1972) era un chatbot pensato per simulare un paziente paranoico. Aveva variabili interne (paura, rabbia, diffidenza) che modificavano le sue risposte. Per esempio, un PARRY "spaventato" rispondeva in modo più aggressivo.

Sapphire fa la stessa cosa, ma con variabili continue e un metodo più elegante: i parametri di campionamento dell'LLM sono regolati in tempo reale secondo lo stato emozionale della conversazione.

##### La temperatura segue l'arousal

```python
# temperatura più alta quando la conversazione si scalda
temperature = clamp(0.7 + arousal * 0.3, 0.4, 1.0)
```

| Arousal | Temperatura | Effetto |
|---------|-------------|-------|
| -1.0 (calmo) | 0.40 | Bassa creatività, risposte prevedibili |
| 0.0 (neutro) | 0.70 | Creatività di default |
| +1.0 (eccitato) | 1.00 | Massimo di casualità, risposte sorprendenti |

Quando qualcuno è eccitato o arrabbiato (arousal alto), la temperatura sale. Il modello produce risposte più varie, più creative, a volte più caotiche, come un umano che "si scalda". Quando la conversazione è calma, la temperatura scende, le risposte sono più posate.

##### Il repeat penalty segue la valenza

```python
# repeat penalty più forte su conversazioni negative
repeat_penalty = clamp(1.15 - valence * 0.1, 1.0, 1.3)
```

| Valenza | Repeat Penalty | Effetto |
|---------|---------------|-------|
| -1.0 (negativo) | 1.25 | Forte penalità, evita ripetizioni |
| 0.0 (neutro) | 1.15 | Valore di default |
| +1.0 (positivo) | 1.05 | Debole penalità, permette ripetizioni |

Più la conversazione è negativa, più il modello è spinto a evitare di ripetersi, come qualcuno che cerca le parole in una lite tesa. Più la conversazione è positiva, più il modello può permettersi affermazioni ridondanti, come una conversazione rilassata.

##### Lo stato emozionale cumulativo

Questi punteggi non riguardano solo il messaggio immediato. Un `EmotionState` mantiene una **media esponenziale mobile** di valenza e arousal per sessione:

```python
# memoria emozionale con media mobile esponenziale
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

Il `decay` a 0.85 significa che l'85% dello stato precedente è conservato a ogni messaggio, e il 15% del nuovo segnale è integrato. Dà una **memoria emozionale** che smussa le variazioni brutali: un solo messaggio negativo non rende il bot "triste", ma una serie di messaggi negativi fa derivare progressivamente il suo umore.

In pratica: se qualcuno inizia una conversazione in modo molto eccitato (`arousal=+0.8`), la temperatura resta alta per vari scambi, anche se i messaggi seguenti sono più calmi. L'emozione mette tempo a scendere, come un umano che resta "caldo" dopo una lite.

---

### Strato 4: l'inferenza (Krystal)

Krystal è lo strato più basso: un wrapper intorno a `llama.cpp` che espone un'API compatibile OpenAI (`/v1/chat/completions`). Gira in due istanze PM2:

- `krystal-small`: il modello Luna 1.5B fine-tunato, sulla porta 3124, con affinità CPU 0
- `krystal-large`: un modello Hermes 3B, sulla porta 3125, con affinità CPU 0,1

Entrambe le istanze sono processi `llama-server` pre-compilati, lanciati con `taskset` per il pinning CPU.

Il fine-tune del modello Luna si è evoluto anche lui dal secondo articolo: è ormai allenato su **200 000 campioni** (contro 50 000 prima), sempre da Qwen2.5-1.5B-Instruct via QLoRA. I 200k campioni sono un sottoinsieme del dataset Discord-Dialogues, filtrati per tenere solo le conversazioni più naturali e diverse. Lo scopo: allargare il registro stilistico del modello senza perdere la flessibilità che rende il few-shot priming così efficace.

---

## Lo schema completo: un messaggio in transito

Ecco cosa succede in concreto quando qualcuno invia "sono davvero triste oggi" su Discord:

1. **Jade** riceve il messaggio via l'API Gateway Discord. Lo trasforma in `MessageEvent` e lo invia a Emerald via WebSocket.
2. **Emerald** valuta il trigger (menzione? nome? parola chiave?). È una menzione diretta. Calcola un ritardo di concentrazione, verifica cooldown, sessione, fatica tematica. Decide di rispondere e invia il messaggio a Sapphire via HTTP.
3. **Sapphire** fa embed del messaggio con `bge-small-en-v1.5`.
   - Classificazione: il messaggio è più vicino al centroid `interessant` che al centroid `futile` (diff = +0.31) -> **INTERESSANT**
   - Emozione: valenza negativa (-0.42), arousal moderato (0.35)
   - Routing: direzione `KRYSTAL_SEMANTIC_URL` (porta 3125, grande modello)
   - Parametri campionamento: temperatura = 0.80 (arousal aumentato), repeat_penalty = 1.19 (valenza negativa)
   - Lo stato emozionale della sessione è aggiornato con questi valori
4. **Krystal** (istanza large) genera la risposta coi parametri regolati emozionalmente e la rinvia a Sapphire.
5. **Sapphire** fa stream della risposta verso Emerald coi metadati (label, valenza, arousal, statistiche di debug).
6. **Emerald** decide di aggiungere un'esitazione ("oh..."), pianifica un burst (2 frammenti), e sceglie una reazione. Invia una `RespondCommand` a Jade.
7. **Jade** esegue: aspetta il ritardo iniziale, invia il primo frammento con l'esitazione, aspetta 1.5s, invia il secondo frammento. Mostra l'indicatore di digitazione durante tutta la generazione.

Tutto questo in meno di 3 secondi per l'utente.

---

## I centroid: perché è meglio di un classificatore neurale

La scelta dei centroid di embedding invece di un classificatore tradizionale (come il DistilBERT che usavo prima) merita una spiegazione.

Un classificatore neurale impara una frontiera di decisione tra le classi, tipicamente una trasformazione non lineare che proietta gli input verso probabilità. È preciso, ma:

- Richiede dati di allenamento etichettati
- È sensibile al cambio di distribuzione (data drift)
- È difficile da interpretare
- Deve essere ri-allenato per aggiungere una nuova classe

Un centroid, invece, è un **vettore medio** di embedding di esempi. La classificazione avviene per similarità coseno a questo vettore medio. Vantaggi:

- **Nessun allenamento richiesto**: calcoliamo solo la media di embedding di esempi scelti a mano
- **Facile da interpretare**: possiamo guardare quali esempi sono più vicini al centroid per capire "cosa ha imparato il centroid"
- **Aggiunta di una classe**: aggiungiamo solo un nuovo centroid, senza ri-allenamento
- **Robusto**: il centroid è una media, quindi gli outlier hanno poco impatto

Il vero potere dei centroid, è che trasformano un problema di classificazione in un problema di **misura di distanza spaziale**. Possiamo visualizzare le categorie come regioni in uno spazio a 384 dimensioni (o in 2D/3D dopo riduzione dimensionale PCA/t-SNE).

### Visualizzazione 3D dei centroid

In pratica, ecco come sono i centroid di classificazione nello spazio di embedding. Ogni punto è un messaggio di esempio, proiettato in 3D con PCA (le 384 dimensioni originali sono ridotte a 3 per la visualizzazione). I punti blu sono i messaggi futili, i punti gialli i messaggi interessanti. I **20 marcatori a diamante** sono i centroid k-means (10 per classe, seed=42). Passa il mouse su un punto per vedere il testo originale dell'esempio.

<iframe src="assets/centroids-plot.html" style="width:100%;height:550px;border:none;border-radius:8px;" loading="lazy" title="Classification par centroïdes - vue 3D interactive"></iframe>

Due esempi di test sono mostrati in rosso: "lol" (classificato futile) e "i feel sad today" (classificato interessante). Anche dopo riduzione da 384 a 3 dimensioni (14,7% di varianza spiegata), i due cluster sono chiaramente separati. L'annotazione in alto mostra i conteggi esatti e la zona ambigua.

Il centroid del messaggio in ingresso passeggia in questo spazio in base al suo contenuto. La classificazione FUTILE/INTERESSANTE consiste semplicemente a misurare quale centroid è più vicino per similarità coseno. Possiamo così rappresentare ogni messaggio come un punto in uno spazio a più dimensioni, ogni dimensione corrispondente a una proprietà semantica.

---

## Cosa cambia in pratica

Gli utenti non vedono gli strati, i centroid, o le regolazioni di temperatura. Ma sentono gli effetti:

- **Risposte più rapide** per i messaggi semplici (il piccolo modello è 2x più rapido e gestisce il 70% del traffico)
- **Tono adattivo**: se sei arrabbiato, il bot "sente" l'arrabbiatura e adatta il suo stile
- **Coerenza cross-piattaforma**: un bot Matrix e un bot Discord condividono lo stesso cervello e lo stesso stato emozionale
- **Tono autentico preservato**: il fine-tune + few-shot + routing intelligente evita risposte corporate

Il passaggio a 200k campioni di allenamento per il piccolo modello ha rafforzato ancora questi effetti: il modello cattura meglio la diversità delle conversazioni Discord senza perdere la malleabilità che permette il few-shot priming.

---

## L'infrastruttura completa

Ecco i servizi che girano attualmente:

| Servizio | Tecnologia | Porta/e | Ruolo |
|---------|------------|---------|------|
| Pixieglow | TypeScript (Bun) | -- | Adattatore Matrix |
| Jade | TypeScript (esbuild) | -- | Adattatore Discord |
| Emerald | TypeScript (Bun) | 3126 (WebSocket) | Cervello / decisioni |
| Sapphire | Python (FastAPI) | 3123 (HTTP) | Classificatore + emozione |
| Krystal small | llama.cpp (PM2) | 3124 | Piccolo modello (1.5B, futile) |
| Krystal large | llama.cpp (PM2) | 3125 | Grande modello (3B+, interessante) |

Le dipendenze tra servizi sono unidirezionali: l'adattatore dipende da Emerald, Emerald dipende da Sapphire, Sapphire dipende da Krystal. Il grafo resta aciclico. Ogni servizio può essere riavviato in modo indipendente.

---

## Conclusione

Dividere Luna Protocol in quattro strati non è stato solo un esercizio di architettura. Era una risposta a limitazioni concrete: impossibilità di supportare Matrix, mancanza di consapevolezza emozionale, assenza di prioritizzazione intelligente dei messaggi.

Oggi, il sistema è più robusto (un crash dell'LLM non uccide il bot), più estensibile (un adattatore Telegram o WhatsApp seguirebbe lo stesso protocollo WebSocket), e più "vivo": il bot adatta il suo comportamento, il suo tono, e persino i parametri dell'LLM allo stato emozionale percepito della conversazione.

I centroid di embedding sono l'elemento chiave che rende tutto questo possibile senza complessità smisurata: niente rete neurale allenata, niente pipeline di dati etichettati, solo medie di vettori e similarità coseno. È una tecnica semplice, incredibilmente efficace, e terribilmente sottovalutata.

| Risorsa | Link |
|----------|------|
| Sito web del progetto | [protocol-luna.github.io](https://protocol-luna.github.io/) |
| Pixieglow | [protocol-luna/pixieglow](https://github.com/protocol-luna/pixieglow) |
| Emerald | [protocol-luna/emerald](https://github.com/protocol-luna/emerald) |
| Sapphire | [protocol-luna/sapphire](https://github.com/protocol-luna/sapphire) |
| Krystal | [protocol-luna/krystal](https://github.com/protocol-luna/krystal) |
| Articolo 1: il bot Discord | [Luna Protocol: ho creato un bot Discord autonomo](/articles/it/luna-protocol-discord-bot) |
| Articolo 2: il fine-tuning | [Luna Protocol: perché ho fine-tunato un modello da 1,5B](/articles/it/luna-protocol-official-models) |
