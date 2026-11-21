---
title: "Ho fatto evolvere una rete neurale per selezione naturale invece che per discesa del gradiente"
description: "Come ho sostituito l'allenamento classico per discesa del gradiente con un algoritmo genetico NSGA-II per far evolvere agenti DQN di trading: quattro versioni, dall'overfitting all'evoluzione lamarckiana dei pesi."
date: 2026-07-13
tags: ["ai", "nsga-ii", "dqn", "trading", "typescript"]
authors: ["docteur-turboss"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "3mon1t8ea9NnXu6F9n3BmFZSJwsLJC9i0HJfn0Ve1KcV5nPUfQTUTebX6kfuxUEMk3YZWTXXpwJHweTQbxUL9A=="
---

## Il problema con la sola discesa del gradiente

Allenare un agente DQN per trading algoritmico con la classica discesa del gradiente pone un problema semplice da enunciare e difficile da risolvere: il gradiente ottimizza _una_ rete verso _un_ minimo locale, su _una_ finestra di mercato. Niente garantisce che questo minimo generalizzi a un regime di mercato diverso, e niente nel ciclo di allenamento spinge verso la diversità; due run che partono da seed diversi convergono spesso verso strategie quasi identiche, con gli stessi angoli ciechi.

La risposta che ho esplorato: sostituire (o meglio sovrapporre) la discesa del gradiente con un algoritmo genetico. Invece di allenare un agente, facciamo evolvere una popolazione di agenti; ognuno un genoma che codifica un'architettura e iperparametri; e lasciamo che la selezione naturale faccia la cernita, mentre il gradiente continua a rifinire ogni individuo dentro la sua vita.

Questo runner ha attraversato quattro versioni in una sola sessione di lavoro intensiva. Ognuna ha corretto un difetto strutturale della precedente.

## v1: la versione ingenua, e perché non bastava

La prima versione faceva ciò che ci si aspetta da un GA basico: una popolazione di genomi, una funzione di fitness, selezione, crossover, mutazione, generazione successiva. Ogni genoma codificava la topologia della rete (numero di strati, larghezza), gli iperparametri DQN (learning rate, epsilon decay, taglia del replay buffer), e qualche scelta architetturale (quali fonti di dati consumare, quale taglia di embedding).

Il difetto principale: la fitness era calcolata sugli stessi dati dell'allenamento. Un agente poteva letteralmente memorizzare una finestra di mercato e ottenere un punteggio ottimo senza aver imparato una strategia generalizzabile. Classico overfitting, ma amplificato dalla selezione genetica; il GA seleziona attivamente gli individui che sfruttano meglio questa falla.

## v2: separare allenamento e valutazione

La correzione ovvia era separare le fasi: ogni genoma si allena su una finestra di mercato, poi è valutato su una finestra diversa, mai vista durante l'allenamento. Solo la performance in valutazione conta per la fitness.

Questo solo cambiamento ha fatto cadere la fitness media della popolazione; segno che una buona parte di ciò che sembrava performance in v1 era memorizzazione pura. Doloroso da vedere, ma è esattamente il segnale che vogliamo: un punteggio più basso ma onesto vale meglio di un punteggio gonfiato e ingannevole.

## v3: passaggio a NSGA-II e fitness multi-obiettivo

Ottimizzare un solo punteggio di fitness (diciamo il rendimento) spinge meccanicamente verso agenti che prendono rischi estremi per massimizzare quel solo numero. La soluzione è stata passare a NSGA-II (Non-dominated Sorting Genetic Algorithm II), che ottimizza insieme più obiettivi senza ridurli a una somma pesata arbitraria: rendimento, drawdown massimo, rapporto di Sharpe, stabilità inter-finestre.

NSGA-II costruisce un fronte di Pareto: l'insieme dei genomi per cui nessun miglioramento su un obiettivo è possibile senza degradarne un altro. Invece di forzare un unico compromesso tra rendimento e rischio via una pesatura scelta in anticipo, teniamo tutta la frontiera di compromesso e lasciamo la scelta finale aperta.

```
// ordina la popolazione in fronti di non-dominanza
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

Seconda aggiunta della v3: un **archivio di Pareto persistente**. Senza, un buon genoma trovato alla generazione 12 può sparire alla generazione 15 se il caso del crossover non lo riproduce; anche se restava migliore di tutto ciò che l'ha sostituito. L'archivio conserva, attraverso tutte le generazioni, l'insieme degli individui non dominati mai incontrati, indipendentemente dalla popolazione corrente.

## v4: evoluzione lamarckiana e diversità ambientale

La v3 aveva un angolo cieco strutturale: il genoma descriveva l'architettura, ma i pesi appresi durante l'allenamento sparivano a ogni nuova generazione. Un discendente nato dal crossover di due buoni genitori ereditava la loro architettura, ma doveva reimparare da zero; nessuna traccia dei pesi che avevano reso i suoi genitori performanti.

La v4 introduce l'**evoluzione lamarckiana**: i pesi allenati sono reiniettati nel genoma dopo l'allenamento, e trasmessi (con mutazione) alla discendenza. È un'eresia biologica assunta; Lamarck aveva torto per gli organismi viventi, l'ereditarietà dei caratteri acquisiti non esiste in biologia; ma niente impedisce a un GA numerico di barare in modo intelligente: qui, trasmettere l'acquisito accelera radicalmente la convergenza, dato che ogni generazione riparte da un punto di inizializzazione già informato invece che da pesi casuali.

Altri tre cambiamenti strutturali in questa versione:

*   **Diversità ambientale**: ogni genoma non è più valutato su una sola finestra di mercato ma su varie, tirate da regimi diversi (rialzista, ribassista, range). Un agente che eccelle su una finestra e crolla su un'altra non può più dominare il fronte di Pareto.

*   **Regolarizzazione per complessità FLOPs**: il costo di calcolo della rete (in FLOPs) diventa un obiettivo a sé in NSGA-II. Evita che l'evoluzione converga verso architetture enormi solo perché hanno più capacità grezza, senza che sia giustificato dal guadagno di performance.

*   Interfaccia `RLBackend` **disaccoppiata**: il GA non conosce più i dettagli di DQN. Manipola un genoma e chiama `train()` / `evaluate()` attraverso un'interfaccia astratta, il che permette in teoria di collegare un altro algoritmo RL senza toccare il motore evolutivo.


```
// backend RL astratto per il motore evolutivo
interface RLBackend {
  train(genome: Genome, window: MarketWindow): Promise<TrainedWeights>;
  evaluate(genome: Genome, weights: TrainedWeights, window: MarketWindow): Promise<FitnessVector>;
}
```

Ultimo punto tecnico: la valutazione è passata in **concorrenza asincrona limitata**; un pool di N valutazioni in parallelo invece di un ciclo sequenziale, con un limite esplicito per non saturare le risorse GPU/CPU disponibili.

## Cosa corregge la v4 rispetto alla v3 in pratica

Difetto v3 Correzione v4 Pesi persi a ogni generazione Reiniezione lamarckiana dei pesi allenati Overfitting a una sola finestra di mercato Valutazione su finestre multiple, regimi variati Architetture che crescono senza vincolo FLOPs come obiettivo Pareto esplicito GA accoppiato ai dettagli di DQN Interfaccia `RLBackend` astratta Valutazione sequenziale lenta Concorrenza async limitata

La v4 ha anche corretto dieci bug concreti di "grounding" API; casi dove il codice del GA supponeva un'interfaccia per `TradingAgent` che non corrispondeva esattamente all'implementazione reale. Questo tipo di bug è invisibile finché non confronti il codice al vero codice sorgente dell'agente: la v4 è stata validata solo dopo rilettura riga per riga contro il file reale.

## Perché mescolare evoluzione e gradiente invece di sceglierne uno

Ci si potrebbe chiedere perché non fare solo RL puro, o evoluzione pura stile NEAT. La risposta sta in una frase: il gradiente è ottimo per rifinire localmente (aggiustare pesi continui verso un ottimo vicino), l'evoluzione è ottima per esplorare globalmente (scoprire architetture e combinazioni di iperparametri che nessun gradiente può raggiungere, perché lo spazio di ricerca discreto non è differenziabile). Usare l'uno senza l'altro, è privarsi di una delle due forme di esplorazione.

Il prezzo da pagare è la complessità di ingegneria; quattro versioni non erano un lusso, era il numero di iterazioni necessarie perché il ciclo GA + RL smettesse di sabotarsi da solo (overfitting, perdita di buoni individui, perdita di pesi acquisiti). Ma il risultato è un sistema che esplora uno spazio di progettazione molto più ampio di un semplice grid search di iperparametri, tenendo l'efficienza locale del gradiente per ogni candidato valutato.

## Prossimo passo

Questa architettura evolutiva a un solo livello (una popolazione piatta di genomi DQN) raggiunge i suoi limiti quando il numero di asset da coprire sale. È ciò che ha motivato il passaggio a un'architettura gerarchica a tre livelli (Asset Analysts, poi Sector Managers, poi Portfolio Allocator), con un GA che opera indipendentemente a ogni livello... ma questa è materia di un altro articolo.
