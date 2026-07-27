---
title: "Luna Protocol: cervelli condivisi, classificazione emotiva e routing interessante/futile"
description: "Luna Protocol è passato da un monolite a un'architettura a quattro livelli: adattatori, brain, classificatore emotivo e inferenza. In programma: centroidi di embedding, routing interessante/futile e regolazione dei parametri del LLM in base a valenza e arousal."
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

# Luna Protocol: cervelli condivisi, classificazione emotiva e routing interessante/futile

Nei [due](/articles/it/luna-protocol-discord-bot) [articoli](/articles/it/luna-protocol-official-models) precedenti ho presentato Luna Protocol come un unico bot Discord con un sistema comportamentale complesso e un modello fine-tuned. Ma l'architettura si è evoluta parecchio da allora. Quello che era un monolite -- un unico processo Node.js che gestiva il bot Discord, il comportamento e le chiamate al LLM -- si è trasformato in **quattro livelli indipendenti**, ognuno con la propria responsabilità, il proprio linguaggio e il proprio ciclo di vita.

Questa separazione ha portato benefici inaspettati: la condivisione dei "cervelli" tra più piattaforme, un sistema di classificazione emotiva che regola dinamicamente i parametri del LLM, e un routing intelligente dei messaggi tra due modelli in base all'importanza percepita della conversazione.

L'evoluzione non è avvenuta tutta insieme -- ha seguito un percorso organico. Ho prima separato la cartella `server/` dal repository del bot, creando così **Krystal** da un lato e lasciando **Jade** come adattatore Discord. Poi ho creato **Pixieglow** (adattatore Matrix) riutilizzando `llm-core` e il bus di eventi di Jade. Poi è arrivato **Sapphire**, che ha introdotto una classificazione GENERIC/SEMANTIC con DistilBERT -- ma i risultati non erano convincenti, quindi sono passato ai centroidi di embedding, più malleabili per l'arricchimento di esempi e più precisi; la classificazione è diventata FUTILE/INTERESSANTE. Infine ho aggiunto centroidi di **valenza** e **arousal** per regolare la temperatura e il repeat penalty del LLM. Per finire, ho eliminato tutto il codice ridondante tra Jade e Pixieglow creando **Emerald**, il cervello condiviso, trasformando Jade e Pixieglow in semplici client guidati da socket.

In parallelo, ho tenuto aggiornato un sito web che documenta l'avanzamento del progetto: [protocol-luna.github.io](https://protocol-luna.github.io/).

Questo articolo racconta come e perché ho suddiviso questi livelli, cosa fa esattamente ogni servizio, e come concetti come i **centroidi** (vettori medi di embedding) e le **variabili di risentimento** (ispirate al chatbot PARRY degli anni '70) hanno trasformato un semplice bot Discord in un sistema multipiattaforma sorprendentemente coerente.

---

## Il problema con il monolite

All'inizio, Luna Protocol stava in un unico processo Node.js. Il codice gestiva:

- La connessione a Discord (tramite la libreria Eris)
- La valutazione dei trigger (menzioni, parole chiave, follow-up...)
- La simulazione di comportamenti umani (errori di battitura, esitazioni, sonno...)
- Le chiamate HTTP al server LLM locale (llama.cpp)
- La gestione delle sessioni e l'anti-spam
- La pipeline TTS

Tutto era nello stesso processo, comunicando tramite bus di eventi tipizzati (`TypedBus`). Funzionava, ma con dei limiti:

- **Impossibile aggiungere un client Matrix** senza duplicare tutto il codice di comportamento
- **Il LLM e il bot erano nello stesso repository**: la cartella `server/` esisteva già, ma era impossibile far evolvere l'uno senza toccare l'altro
- **Nessuna classificazione intelligente**: ogni messaggio veniva trattato allo stesso modo, che fosse un "lol" o una domanda esistenziale
- **Nessuno stato emotivo persistente**: il bot non "provava" nulla

La suddivisione in livelli ha risolto tutti questi problemi.

---

## I quattro livelli

L'architettura attuale di Luna Protocol è organizzata come un imbuto a quattro livelli:

```
Matrix / Discord
      |
      v
  [ADATTATORI]    Pixieglow (Matrix) / Jade (Discord)
      |
      v
  [BRAIN]         Emerald (WebSocket, porta 3126)
      |
      v
  [CLASSIFICATORE] Sapphire (HTTP, porta 3123)
      |
      v
  [INFERENZA]     Krystal (llama.cpp, porte 3124 / 3125)
```

Ogni livello può essere riavviato, aggiornato o sostituito in modo indipendente.

---

### Livello 1: gli adattatori (Pixieglow e Jade)

Sono i livelli più semplici. Il loro unico compito è tradurre gli eventi di una piattaforma di messaggistica in un protocollo standardizzato verso Emerald:

- **Jade** è l'adattatore Discord. Usa la libreria Eris per connettersi a Discord e inoltra i messaggi a Emerald via WebSocket. Gestisce anche la pipeline TTS (sintesi vocale via Piper, conversione in OGG, upload su Discord).
- **Pixieglow** è l'adattatore Matrix. Usa direttamente l'API HTTP Client-Server di Matrix (senza SDK), con una sincronizzazione long-poll. Non ha il TTS.

I due adattatori condividono lo stesso protocollo WebSocket definito in `emerald-client.ts`:

```typescript
type ClientId = "jade" | "pixieglow";

// Eventi (adattatore -> Emerald)
type InEvent = MessageEvent | ReadyEvent | BotMessageEvent | PresenceEvent;

// Comandi (Emerald -> adattatore)
type OutCommand = RespondCommand | TypingCommand | SetPresenceCommand
                | SpontaneousCommand | ForgotCommand;
```

L'esistenza di due adattatori con la stessa interfaccia dimostra che la condivisione funziona: **lo stesso "cervello" (Emerald) serve indifferentemente un bot Discord e un bot Matrix**, con comportamenti identici. Il protocollo è dichiarativo: Emerald non dice all'adattatore *come* inviare un messaggio, gli dice *cosa* inviare (il testo con un ritardo, eventualmente un piano di burst, una reazione, ecc.). Ogni adattatore implementa l'esecuzione concreta secondo la propria piattaforma.

È questa la forza di questa architettura: per aggiungere il supporto a Telegram, Signal, o altro, basta scrivere un adattatore che implementi il protocollo WebSocket.

---

### Livello 2: il cervello (Emerald)

Emerald è il servizio centrale di decisione. Ascolta sulla porta 3126 via WebSocket e gestisce:

- **La valutazione dei trigger**: menzione, DM, nome, parola chiave, follow-up, casuale
- **La simulazione comportamentale**: ritardi di concentrazione, errori di battitura, esitazioni, dimenticanze, burst, affaticamento tematico
- **I cicli di sonno**: modalità sleep / slow / short
- **La gestione delle sessioni**: cooldown, limiti di sessione, anti-spam
- **Il routing verso Sapphire**: invio dei messaggi, ricezione delle risposte in streaming

Emerald è il servizio centrale che ha permesso la condivisione, ed è quello che ha beneficiato di più della separazione. Prima, ogni comportamento (errore di battitura, burst, esitazione) era intrecciato con il codice Discord. Ora sono in moduli dedicati sotto `behavior/`:

```
emerald/src/behavior/
  burst.ts         -- Pianificazione dei messaggi in burst
  mannerisms.ts    -- Ritardi, esitazioni, reazioni, dimenticanze
  sleep.ts         -- Valutazione degli orari del sonno
  typo.ts          -- Simulazione di errori di battitura (AZERTY/QWERTY)
```

Il cervello non sa su quale piattaforma sta girando. Riceve un `MessageEvent` con un `clientId` ("jade" o "pixieglow"), prende una decisione e restituisce un comando. L'adattatore si occupa del resto.

---

### Livello 3: il classificatore emotivo (Sapphire)

Sapphire è il servizio tecnicamente più interessante. È un **middleware LLM** scritto in Python con FastAPI, che svolge quattro ruoli critici:

1. **Classificatore binario FUTILE / INTERESSANTE** tramite centroidi di embedding
2. **Valutatore emotivo** (valenza / arousal) tramite centroidi
3. **Router di backend** verso Krystal (modello piccolo vs modello grande)
4. **Iniettore few-shot** e gestore delle sessioni

#### I centroidi: il cuore della classificazione

Un **centroide** è un concetto semplice: è la media di un insieme di vettori di embedding. In pratica, ho raccolto centinaia di messaggi di esempio, li ho passati attraverso un modello di embedding (`BAAI/bge-small-en-v1.5`, 384 dimensioni), e ho mediato i vettori ottenuti.

Ci sono **due centroidi di classificazione**:

- `futile_centroid`: la media degli embedding di ~500 messaggi banali ("lol", "ok", "hello", "nm just chillin u")
- `interessante_centroid`: la media degli embedding di ~550 messaggi sostanziali (domande tecniche, confidenze, filosofia)

Quando arriva un messaggio:

```python
def classify(text, embedder, futile_centroid, interessante_centroid):
    emb = embedder.query_embed(text)          # vettore 384-D del messaggio
    sim_f = cosine_similarity(emb, futile_centroid)
    sim_i = cosine_similarity(emb, interessante_centroid)
    diff = sim_i - sim_f
    label = "INTERESSANTE" if diff > 0 else "FUTILE"
    return label, abs(diff), sim_f, sim_i
```

La similarità coseno tra il messaggio e ciascun centroide determina la categoria. La differenza assoluta dà la confidenza. È semplice, veloce (nessun forward pass del LLM) e sorprendentemente efficace.

#### Perché due modelli?

Il risultato di questa classificazione decide quale backend LLM viene invocato:

| Etichetta | Backend Krystal | Modello | Porta |
|-----------|------------------|---------|-------|
| `FUTILE` | `generic` | Luna-Protocol-1.5B (941 MB, Q4_K_M) | 3124 |
| `INTERESSANTE` | `semantic` | Hermes-3-3B o 8B (a seconda della configurazione) | 3125 |

L'intuizione è semplice: un "lol" o un "nm just chillin u" non merita di invocare un modello da 8 miliardi di parametri. Il piccolo modello Luna 1.5B fine-tuned, addestrato su 200.000 campioni Discord, basta abbondantemente per gli scambi leggeri. Al contrario, una domanda sulla vita, una confidenza o un dibattito tecnico viene instradata verso il modello grande, che può produrre una risposta più ricca.

Questo routing economico riduce notevolmente il carico sul server LLM: circa il 70% dei messaggi viene classificato come FUTILE e gestito dal modello piccolo, liberando il modello grande per le conversazioni che ne valgono davvero la pena.

#### L'asse emotivo: valenza e arousal

Ma non è tutto. Sapphire usa lo **stesso meccanismo di centroidi** su un asse indipendente per valutare l'emozione del messaggio:

Ci sono **quattro centroidi emotivi**:

| Polo | Esempi |
|------|--------|
| `positivo` | "hell yeah", "love that", "this is great" |
| `negativo` | "shut up", "i hate this", "this sucks" |
| `arousal alto` | "WHAT THE HELL", "omg omg omg", "AAAAA" |
| `arousal basso` | "just chilling", "meh", "i guess" |

Il punteggio viene calcolato come differenza di similarità su ciascun asse:

```python
valence = sim(emb, positive) - sim(emb, negative)     # [-1, +1]
arousal = sim(emb, high_arousal) - sim(emb, low_arousal)  # [-1, +1]
```

La **valenza** misura se il messaggio è positivo o negativo. L'**arousal** misura la sua intensità emotiva. Insieme formano il modello circumplesso dell'affetto (Russell, 1980) -- lo stesso modello psicologico che ha ispirato il chatbot **PARRY** nel 1972.

#### Le variabili di risentimento: come le emozioni controllano il LLM

È qui che l'ispirazione di PARRY diventa tangibile. PARRY (creato da Kenneth Colby nel 1972) era un chatbot progettato per simulare un paziente paranoico. Possedeva variabili interne -- paura, rabbia, diffidenza -- che modificavano le sue risposte. Ad esempio, un PARRY "spaventato" rispondeva in modo più aggressivo.

Sapphire fa la stessa cosa, ma con variabili continue e un metodo più elegante: i parametri di campionamento del LLM vengono regolati in tempo reale in base allo stato emotivo della conversazione.

##### La temperatura segue l'arousal

```python
temperature = clamp(0.7 + arousal * 0.3, 0.4, 1.0)
```

| Arousal | Temperatura | Effetto |
|---------|--------------|---------|
| -1.0 (calmo) | 0.40 | Bassa creatività, risposte prevedibili |
| 0.0 (neutro) | 0.70 | Creatività predefinita |
| +1.0 (eccitato) | 1.00 | Massima casualità, risposte sorprendenti |

Quando qualcuno è eccitato o arrabbiato (arousal alto), la temperatura sale. Il modello produce risposte più variegate, più creative, a volte più caotiche -- come un umano che "si lascia trasportare". Quando la conversazione è calma, la temperatura scende, e le risposte diventano più posate.

##### Il repeat penalty segue la valenza

```python
repeat_penalty = clamp(1.15 - valence * 0.1, 1.0, 1.3)
```

| Valenza | Repeat Penalty | Effetto |
|---------|-----------------|---------|
| -1.0 (negativa) | 1.25 | Penalità forte, evita le ripetizioni |
| 0.0 (neutra) | 1.15 | Valore predefinito |
| +1.0 (positiva) | 1.05 | Penalità bassa, permette le ripetizioni |

Più la conversazione è negativa, più il modello viene spinto a evitare di ripetersi -- come qualcuno che cerca le parole in una discussione tesa. Più la conversazione è positiva, più il modello può permettersi affermazioni ridondanti, come in una chiacchierata rilassata.

##### Lo stato emotivo cumulativo

Questi punteggi non riguardano solo il messaggio immediato. Un `EmotionState` mantiene una **media mobile esponenziale** di valenza e arousal per sessione:

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

Il `decay` a 0.85 significa che l'85% dello stato precedente viene conservato ad ogni messaggio, e il 15% del nuovo segnale viene integrato. Questo dà una **memoria emotiva** che attenua le variazioni brusche: un singolo messaggio negativo non rende il bot "triste", ma una serie di messaggi negativi fa progressivamente slittare il suo umore.

In pratica: se qualcuno inizia una conversazione in modo molto eccitato (`arousal=+0.8`), la temperatura rimane alta per diversi scambi, anche se i messaggi successivi sono più calmi. L'emozione impiega tempo a scendere -- come un umano che rimane "accaldato" dopo una discussione.

---

### Livello 4: l'inferenza (Krystal)

Krystal è il livello più basso: un wrapper attorno a `llama.cpp` che espone un'API compatibile con OpenAI (`/v1/chat/completions`). Gira in due istanze PM2:

- `krystal-small`: il modello Luna 1.5B fine-tuned, sulla porta 3124, con affinità CPU 0
- `krystal-large`: un modello Hermes 3B, sulla porta 3125, con affinità CPU 0,1

Entrambe le istanze sono processi `llama-server` precompilati, avviati con `taskset` per il pinning della CPU.

Anche il fine-tuning del modello Luna si è evoluto dal secondo articolo: ora è addestrato su **200.000 campioni** (contro i 50.000 precedenti), sempre partendo da Qwen2.5-1.5B-Instruct via QLoRA. I 200k campioni sono un sottoinsieme del dataset Discord-Dialogues, filtrati per mantenere solo le conversazioni più naturali e diversificate. L'obiettivo: ampliare il registro stilistico del modello senza perdere la flessibilità che rende il few-shot priming così efficace.

---

## Lo schema completo: un messaggio in transito

Ecco cosa succede concretamente quando qualcuno invia "oggi sono davvero triste" su Discord:

1. **Jade** riceve il messaggio tramite l'API Gateway di Discord. Lo trasforma in un `MessageEvent` e lo invia a Emerald via WebSocket.
2. **Emerald** valuta il trigger (menzione? nome? parola chiave?). È una menzione diretta. Calcola un ritardo di concentrazione, verifica il cooldown, la sessione, l'affaticamento tematico. Decide di rispondere e invia il messaggio a Sapphire via HTTP.
3. **Sapphire** genera l'embedding del messaggio con `bge-small-en-v1.5`.
   - Classificazione: il messaggio è più vicino al centroide `interessante` che al centroide `futile` (diff = +0.31) -> **INTERESSANTE**
   - Emozione: valenza negativa (-0.42), arousal moderato (0.35)
   - Routing: direzione `KRYSTAL_SEMANTIC_URL` (porta 3125, modello grande)
   - Parametri di campionamento: temperatura = 0.80 (arousal aumentato), repeat_penalty = 1.19 (valenza negativa)
   - Lo stato emotivo della sessione viene aggiornato con questi valori
4. **Krystal** (istanza large) genera la risposta con i parametri regolati emotivamente e la restituisce a Sapphire.
5. **Sapphire** trasmette in streaming la risposta a Emerald con i metadati (etichetta, valenza, arousal, statistiche di debug).
6. **Emerald** decide di aggiungere un'esitazione ("oh..."), pianifica un burst (2 frammenti), e sceglie una reazione. Invia un `RespondCommand` a Jade.
7. **Jade** esegue: aspetta il ritardo iniziale, invia il primo frammento con l'esitazione, aspetta 1.5s, invia il secondo frammento. Mostra l'indicatore di digitazione durante tutta la generazione.

Tutto questo in meno di 3 secondi per l'utente.

---

## I centroidi: perché sono meglio di un classificatore neurale

La scelta dei centroidi di embedding rispetto a un classificatore tradizionale (come il DistilBERT che usavo prima) merita una spiegazione.

Un classificatore neurale apprende un confine di decisione tra le classi -- tipicamente una trasformazione non lineare che proietta gli input verso delle probabilità. È preciso, ma:

- Richiede dati di addestramento etichettati
- È sensibile al cambiamento di distribuzione (data drift)
- È difficile da interpretare
- Deve essere riaddestrato per aggiungere una nuova classe

Un centroide, invece, è un **vettore medio** di embedding di esempi. La classificazione avviene tramite similarità coseno con questo vettore medio. Vantaggi:

- **Nessun addestramento**: si calcola semplicemente la media degli embedding di esempi scelti a mano
- **Facile da interpretare**: si può vedere quali esempi sono più vicini al centroide per capire "cosa ha imparato il centroide"
- **Aggiunta di una classe**: si aggiunge semplicemente un nuovo centroide -- nessun riaddestramento
- **Robusto**: il centroide è una media, quindi i valori anomali hanno poco impatto

Il vero potere dei centroidi è che trasformano un problema di classificazione in un problema di **misurazione della distanza spaziale**. Si possono visualizzare le categorie come regioni in uno spazio a 384 dimensioni (o in 2D/3D dopo una riduzione dimensionale PCA/t-SNE).

### Visualizzazione 3D dei centroidi

In pratica, ecco come appaiono i centroidi di classificazione nello spazio di embedding. Ogni punto è un messaggio di esempio, proiettato in 3D tramite PCA (le 384 dimensioni originali vengono ridotte a 3 per la visualizzazione). I punti blu sono messaggi futili, i punti gialli sono messaggi interessanti. I due grandi diamanti sono i centroidi calcolati -- la media di ciascun gruppo. Passa il mouse su un punto per vedere il testo originale dell'esempio.

<iframe src="assets/centroids-plot.html" style="width:100%;height:550px;border:none;border-radius:8px;" loading="lazy" title="Classificazione per centroidi - vista 3D interattiva"></iframe>

Due esempi sono mostrati in rosso: "lol" (classificato futile) e "i feel sad today" (classificato interessante). "lol" ricade nella nuvola blu dei futili, mentre "i feel sad today" si trova dal lato dei punti gialli. La separazione è visibile anche dopo una riduzione a 3 dimensioni (solo il 15,6% della varianza totale spiegata). In 384 dimensioni, il confine è molto più netto.

Il centroide del messaggio in ingresso si muove in questo spazio in base al suo contenuto. La classificazione FUTILE/INTERESSANTE consiste semplicemente nel misurare quale centroide è più vicino per similarità coseno. Si può così rappresentare ogni messaggio come un punto in uno spazio multidimensionale, dove ogni dimensione corrisponde a una proprietà semantica.

---

## Cosa cambia in pratica

Gli utenti non vedono i livelli, i centroidi o le regolazioni di temperatura. Ma ne percepiscono gli effetti:

- **Risposte più rapide** per i messaggi semplici (il modello piccolo è 2 volte più veloce e gestisce il 70% del traffico)
- **Tono adattivo**: se sei nervoso, il bot "sente" il nervosismo e adatta il suo stile
- **Coerenza cross-piattaforma**: un bot Matrix e un bot Discord condividono lo stesso cervello e lo stesso stato emotivo
- **Nessuna "modalità assistente"**: il fine-tune + few-shot + routing intelligente evita risposte da assistente aziendale

Il passaggio a 200k campioni di addestramento per il modello piccolo ha rafforzato ulteriormente questi effetti: il modello cattura meglio la diversità delle conversazioni Discord senza perdere la malleabilità garantita dal few-shot priming.

---

## L'infrastruttura completa

Ecco i servizi attualmente in esecuzione:

| Servizio | Tecnologia | Porta/e | Ruolo |
|----------|------------|---------|-------|
| Pixieglow | TypeScript (Bun) | -- | Adattatore Matrix |
| Jade | TypeScript (esbuild) | -- | Adattatore Discord |
| Emerald | TypeScript (Bun) | 3126 (WebSocket) | Cervello / decisioni |
| Sapphire | Python (FastAPI) | 3123 (HTTP) | Classificatore + emozione |
| Krystal small | llama.cpp (PM2) | 3124 | Modello piccolo (1.5B, futile) |
| Krystal large | llama.cpp (PM2) | 3125 | Modello grande (3B+, interessante) |

Le dipendenze tra i servizi sono unidirezionali: l'adattatore dipende da Emerald, Emerald dipende da Sapphire, Sapphire dipende da Krystal. Nessun ciclo. Ogni servizio può essere riavviato in modo indipendente.

---

## Conclusione

Dividere Luna Protocol in quattro livelli non è stato solo un esercizio di architettura. È stata una risposta a limiti concreti: l'impossibilità di supportare Matrix, la mancanza di consapevolezza emotiva, l'assenza di una prioritizzazione intelligente dei messaggi.

Oggi, il sistema è più robusto (un crash del LLM non uccide il bot), più estensibile (un adattatore Telegram o WhatsApp seguirebbe lo stesso protocollo WebSocket), e più "vivo": il bot adatta il suo comportamento, il suo tono, e persino i parametri del LLM allo stato emotivo percepito della conversazione.

I centroidi di embedding sono l'elemento chiave che rende tutto questo possibile senza una complessità eccessiva: nessuna rete neurale addestrata, nessuna pipeline di dati etichettati, solo medie di vettori e similarità coseno. È una tecnica semplice, incredibilmente efficace, e terribilmente sottovalutata.

| Risorsa | Link |
|---------|------|
| Sito web del progetto | [protocol-luna.github.io](https://protocol-luna.github.io/) |
| Pixieglow | [protocol-luna/pixieglow](https://github.com/protocol-luna/pixieglow) |
| Emerald | [protocol-luna/emerald](https://github.com/protocol-luna/emerald) |
| Sapphire | [protocol-luna/sapphire](https://github.com/protocol-luna/sapphire) |
| Krystal | [protocol-luna/krystal](https://github.com/protocol-luna/krystal) |
| Articolo 1: il bot Discord | [Luna Protocol: ho creato un bot Discord autonomo](/articles/it/luna-protocol-discord-bot) |
| Articolo 2: il fine-tuning | [Luna Protocol: perché ho fatto il fine-tuning di un modello da 1,5B](/articles/it/luna-protocol-official-models) |