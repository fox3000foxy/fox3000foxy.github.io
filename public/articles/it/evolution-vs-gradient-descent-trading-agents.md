---
title: "Ho evoluto una rete neurale tramite selezione naturale invece della discesa del gradiente"
description: "Come ho sostituito il classico addestramento con discesa del gradiente con un algoritmo genetico NSGA-II per evolvere agenti di trading DQN: quattro versioni, dall'overfitting all'evoluzione lamarckiana dei pesi."
date: 2026-07-13
tags: ["ai", "nsga-ii", "dqn", "trading", "typescript"]
authors: ["docteur-turboss"]
lang: "it"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "3HdYBSzwrOna9F8J4FtWB8kJCL/ilDqLZgELyCoEoIVUjhwTK4s0mqvS4NhqIT42Zf5zGLrHIgzlKXNo06VURw=="
---

## Il problema della sola discesa del gradiente

Addestrare un agente DQN per il trading algoritmico con la classica discesa del gradiente ha un problema semplice da enunciare e uno difficile da risolvere: la discesa del gradiente ottimizza _una_ rete verso _un_ minimo locale, su _una_ finestra di mercato. Nulla garantisce che questo minimo generalizzi a un diverso regime di mercato, e nulla nel ciclo di addestramento spinge verso la diversità; due esecuzioni che partono da semi diversi spesso convergono a strategie quasi identiche, con gli stessi punti ciechi.

La risposta che ho esplorato: sostituire (o meglio sovrapporre) la discesa del gradiente con un algoritmo genetico. Invece di addestrare un agente, si evolve una popolazione di agenti; ogni genoma codifica un'architettura e iperparametri; e la selezione naturale fa il resto, mentre la discesa del gradiente continua a mettere a punto ogni individuo all'interno della propria vita.

Questo progetto è passato attraverso quattro versioni in una singola sessione intensiva. Ogni versione ha corretto un difetto strutturale della precedente.

## v1: la versione ingenua, e perché non bastava

La prima versione faceva ciò che ci si aspetterebbe da un GA base: una popolazione di genomi, una funzione di fitness, selezione, crossover, mutazione, generazione successiva. Ogni genoma codificava la topologia della rete (numero di layer, larghezza), gli iperparametri DQN (tasso di apprendimento, decadimento epsilon, dimensione del buffer di replay), e alcune scelte architetturali (quali fonti di dati consumare, dimensione dell'embedding).

Il difetto principale: il fitness veniva calcolato sugli stessi dati usati per l'addestramento. Un agente poteva letteralmente memorizzare una finestra di mercato e ottenere un punteggio eccellente senza aver appreso una strategia generalizzabile. Classico overfitting, ma amplificato dalla selezione genetica; il GA seleziona attivamente gli individui che sfruttano meglio questa scappatoia.

## v2: separare addestramento e valutazione

La soluzione ovvia era separare le fasi: ogni genoma si addestra su una finestra di mercato, poi viene valutato su una finestra diversa, mai vista durante l'addestramento. Solo la performance in valutazione conta per il fitness.

Questo singolo cambiamento ha causato un calo del fitness medio della popolazione; un segno che gran parte di ciò che sembrava performance in v1 era pura memorizzazione. È doloroso da vedere, ma è esattamente il segnale che si vuole: un punteggio più basso ma onesto è meglio di uno gonfiato e fuorviante.

## v3: passaggio a NSGA-II e fitness multi-obiettivo

Ottimizzare un unico punteggio di fitness (ad esempio, i rendimenti) spinge meccanicamente gli agenti ad assumersi rischi estremi per massimizzare quel singolo numero. La soluzione è stata passare a NSGA-II (Non-dominated Sorting Genetic Algorithm II), che ottimizza simultaneamente diversi obiettivi senza ridurli a una somma pesata arbitraria: rendimenti, drawdown massimo, indice di Sharpe, stabilità tra finestre.

NSGA-II costruisce un fronte di Pareto: l'insieme dei genomi per cui nessun miglioramento su un obiettivo è possibile senza degradarne un altro. Invece di forzare un unico compromesso rendimento-rischio attraverso una ponderazione predefinita, si mantiene l'intera frontiera di compromesso e si lascia aperta la scelta finale.

```
function nonDominatedSort(population: Genome[]): Genome[][] {
  const fronts: Genome[][] = [[]];
  for (const p of population) {
    p.dominationCount = 0;
    p.dominatedSet = [];
    for (const q of population) {
      if (dominates(p, q)) p.dominatedSet.push(q);
      else if (dominates(q, p)) p.dominationCount++;
    }
    if (p.dominationCount === 0) {
      p.rank = 0;
      fronts[0].push(p);
    }
  }
  // ... costruzione dei fronti successivi per rimozione iterativa
  return fronts;
}
```

Seconda aggiunta in v3: un **archivio di Pareto persistente**. Senza di esso, un buon genoma trovato alla generazione 12 può scomparire entro la generazione 15 se la fortuna del crossover non lo riproduce; anche se rimaneva migliore di tutto ciò che lo ha sostituito. L'archivio conserva, attraverso tutte le generazioni, l'insieme di tutti gli individui non dominati mai incontrati, indipendentemente dalla popolazione corrente.

## v4: evoluzione lamarckiana e diversità ambientale

V3 aveva un punto cieco strutturale: il genoma descriveva l'architettura, ma i pesi appresi durante l'addestramento scomparivano a ogni nuova generazione. Un figlio nato dal crossover di due buoni genitori ereditava la loro architettura, ma doveva reimparare da zero; nessuna traccia dei pesi che avevano reso performanti i suoi genitori.

V4 introduce l'**evoluzione lamarckiana**: i pesi addestrati vengono reimmessi nel genoma dopo l'addestramento e trasmessi (con mutazione) alla prole. Questa è una deliberata eresia biologica; Lamarck aveva torto per gli organismi viventi -- l'ereditarietà dei caratteri acquisiti non esiste in biologia -- ma nulla impedisce a un GA digitale di barare intelligentemente: qui, trasmettere conoscenza acquisita accelera radicalmente la convergenza, poiché ogni generazione riparte da un'inizializzazione già informata anziché da pesi casuali.

Tre altri cambiamenti strutturali in questa versione:

*   **Diversità ambientale**: ogni genoma non viene più valutato su una singola finestra di mercato ma su diverse, tratte da regimi differenti (rialzista, ribassista, laterale). Un agente che eccelle su una finestra e crolla su un'altra non può più dominare il fronte di Pareto.
    
*   **Regolarizzazione della complessità in FLOPs**: il costo computazionale della rete (in FLOPs) diventa un obiettivo a pieno titolo in NSGA-II. Questo impedisce all'evoluzione di convergere verso architetture massicce solo perché hanno maggiore capacità grezza, senza un giustificato guadagno prestazionale.
    
*   **Interfaccia `RLBackend` disaccoppiata**: il GA non conosce più i dettagli di DQN. Manipola un genoma e chiama `train()` / `evaluate()` attraverso un'interfaccia astratta, che teoricamente permette di sostituire un altro algoritmo RL senza toccare il motore evolutivo.
    

```
interface RLBackend {
  train(genome: Genome, window: MarketWindow): Promise<TrainedWeights>;
  evaluate(genome: Genome, weights: TrainedWeights, window: MarketWindow): Promise<FitnessVector>;
}
```

Ultimo punto tecnico: la valutazione è passata a **concorrenza asincrona limitata**; un pool di N valutazioni parallele invece di un ciclo sequenziale, con un limite esplicito per evitare di saturare le risorse GPU/CPU disponibili.

## Cosa risolve v4 rispetto a v3 nella pratica

Problema v3 Soluzione v4 Pesi persi ogni generazione Re-iniezione lamarckiana dei pesi addestrati Overfitting su una singola finestra di mercato Valutazione su più finestre, regimi variati Architetture che crescono senza vincoli FLOPs come obiettivo Pareto esplicito GA accoppiato ai dettagli DQN Interfaccia astratta `RLBackend` Valutazione sequenziale lenta Concorrenza asincrona limitata

V4 ha anche corretto dieci bug concreti di "grounding" dell'API; casi in cui il codice GA assumeva un'interfaccia per `TradingAgent` che non corrispondeva esattamente all'implementazione reale. Questo tipo di bug è invisibile finché non si confronta il codice con il codice sorgente effettivo dell'agente: v4 è stato validato solo dopo una rilettura riga per riga confrontata con il file reale.

## Perché mescolare evoluzione e gradiente invece di sceglierne uno

Potresti chiederti perché non usare solo RL puro, o solo evoluzione come NEAT. La risposta è una frase: il gradiente è eccellente per la messa a punto locale (aggiustare pesi continui verso un ottimo vicino), l'evoluzione è eccellente per l'esplorazione globale (scoprire architetture e combinazioni di iperparametri che nessun gradiente può raggiungere, perché lo spazio di ricerca discreto non è differenziabile). Usare uno senza l'altro significa privarsi di una delle due forme di esplorazione.

Il prezzo è la complessità ingegneristica; quattro versioni non sono state un lusso, ma il numero di iterazioni necessarie perché il ciclo GA + RL smettesse di sabotarsi da solo (overfitting, perdita di buoni individui, perdita di pesi acquisiti). Ma il risultato è un sistema che esplora uno spazio di progettazione molto più ampio di una semplice ricerca a griglia di iperparametri, mantenendo al contempo l'efficienza locale della discesa del gradiente per ogni candidato valutato.

## Prossimo passo

Questa architettura evolutiva a singolo livello (una popolazione piatta di genomi DQN) raggiunge i suoi limiti quando il numero di asset da coprire cresce. Questo è ciò che ha motivato il passaggio a un'architettura gerarchica a tre livelli (Analisti di Asset → Gestori di Settore → Allocatore di Portafoglio), con un GA che opera indipendentemente a ogni livello... ma questo è argomento di un altro articolo.
