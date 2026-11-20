---
title: "Ich habe ein Netz von Neuronen durch natürliche Auswahl entwickelt, anstatt durch Gradientenabstieg."
description: "Wie ich das klassische Training durch Gradientenabstieg durch einen genetischen NSGA-II-Algorithmus ersetzte, um DQN-Trading-Agenten zu entwickeln: vier Versionen, vom Überlernen bis zur lamarckischen Entwicklung der Gewichte."
date: 2026-07-13
tags: ["ai", "nsga-ii", "dqn", "trading", "typescript"]
authors: ["docteur-turboss"]
lang: "de"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "fHxWwg9iq3xS4LQSmLf87Do2RgY9PwF0Jyf6+ke400mNqT3ETBnK7DFjHP+VgUP4RJFh2zqZwHRPoeZza9ZVbg=="
---
## 

Ein DQN-Agenten für algorithmisches Trading mit dem klassischen Gradientenabstieg zu trainieren, stellt ein einfaches und schwer zu lösendes Problem dar: der optimierte Gradienten _un_-Netzwerk zu _un' minimal lokal, auf einem Marktfenster. Es gibt keine Garantie dafür, dass dieses Minimum bei einer anderen Marktordnung allgemein gilt, und nichts im Trainingsring wächst in Richtung Vielfalt; zwei Runs, die von verschiedenen Samen ausgehen, konvergen sich häufig in nahezu identische Strategien mit den gleichen toten Winkeln.

Die Antwort, die ich erforscht habe: den Gradientenabstieg mit einem genetischen Algorithmus ersetzen (oder vielmehr überlagern). Statt einen Agenten zu trainieren, wird eine Population von Agenten entwickelt; jeder von ihnen wird ein Genom mit Architektur und Hyperparametern verschlüsselt; und die natürliche Auswahl lässt sich sortieren, während der Gradienten jedes Individuum im eigenen Leben weiterfeinert.

Dieser Runner hat vier Versionen in einer einzigen intensiven Arbeitssitzung durchgemacht. Jede hat einen strukturellen Fehler der vorherigen korrigiert.

## v1: die naive Version, und warum es nicht genug

Die erste Version war das, was man von einer grundlegenden GA erwartet: eine Population von Genomen, eine Fitnessfunktion, Auswahl, Kreuzung, Mutation, nächste Generation. Jedes Genome verdarb die Netztopologie (Schichtenzahl, Breite), DQN-Hyperparameter (Learning rate, Epsilon decay, Größe der Replay-Buffer) und einige architektonische Auswahl (welche Datenquellen verbrauchen, welche Größe des Embedding).

Der Hauptfehler: Fitness wurde auf den gleichen Daten wie Training berechnet. Ein Agent konnte sich ein Marktfenster buchstäblich auswendig lernen und eine ausgezeichnete Punktzahl erzielen, ohne eine allgemein zugängliche Strategie kennengelernt zu haben. Klassisch überlernt, aber durch genetische Selektion verstärkt; die GA wählt aktiv die Personen aus, die diese Lücke am besten nutzen.

## v2: Abtrennung von Training und Bewertung

Die offensichtliche Korrektur war, die Phasen zu trennen: jedes Genome trainiert in einem Marktfenster und wird dann auf einem anderen Fenster bewertet, das während des Trainings nie gesehen wurde. Nur die Leistung in der Bewertung zählt für Fitness.

Diese Veränderung allein hat die durchschnittliche Fitness der Bevölkerung zum Absturz gebracht; ein Zeichen dafür, dass ein großer Teil von dem, was von der Leistung in v1 zu sein schien, reiner Gedächtnis war. Traurig zu sehen, aber genau das ist das Signal, das man will: ein niedrigerer, aber ehrlicher Punkt ist besser als ein aufgeblasener und trügerischer Punkt.

## v3: Wechseln du zu NSGA-II und einem Multi-Objektiv-Fitness

Optimieren du einen einzigen Fitness-Score (z.B. die Rendite) treibt mechanisch zu Agenten, die extreme Risiken eingehen, um diese einzige Zahl zu maximieren. Die Lösung war, auf NSGA-II (Non-dominated Sorting Genetic Algorithm II) umzusteigen, die gleichzeitig mehrere Ziele optimiert, ohne sie auf eine willkürlich gewichtete Summe zu reduzieren: Rendite, maximale Drawdown, Sharpe-Verhältnis, inter-Fensterstabilität.

NSGA-II baut eine Front von Pareto: Alle Genome, für die keine Verbesserung an einem Ziel möglich ist, ohne ein anderes zu verschlechtern. Anstatt einen einzigen Kompromiss zwischen Rendite und Risiko durch eine im Voraus ausgewählte Gewichtung zu erzwingen, bleibt die gesamte Kompromißgrenze erhalten und die endgültige Wahl bleibt offen.
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
  // ... Bau der folgenden Fronten durch iterative Abschaltung
  return fronts;
}
```
Zweite Ergänzung der v3: ein ** Archiv von Persistent Pareto**. Ohne sie kann ein gutes Genome, das in der Generation 12 gefunden wurde, in Generation 15 verschwinden, wenn der Zufall der Kreuzung es nicht nachahmt; auch wenn es besser blieb als alles, was es ersetzt hat. Das Archiv bewahrt durch alle Generationen alle nicht dominierten Individuen, die je getroffen wurden, unabhängig von der gegenwärtigen Bevölkerung.

## v4: lamarckische Entwicklung und ökologische Vielfalt

Der V3 hatte einen strukturellen toten Winkel: das Genom beschrieb die Architektur, aber die während des Trainings gelernten Gewichte verschwanden in jeder neuen Generation. Ein Nachkomme, der aus der Kreuzung zweier guter Eltern geboren wurde, erbte ihre Architektur, musste aber von Null wieder lernen; keine Spur der Gewichte, die seine Eltern leistungsfähig gemacht hatten.

Die V4 führt die** lamarckische Evolution** ein: die angetriebenen Gewichte werden nach dem Training in das Genom zurückgebracht und (mit Mutation) an die Nachkommen weitergegeben. Es ist eine übernommene biologische Häresie; Lamarck hatte Unrecht für lebende Organismen, die Vererbung der erworbenen Zeichen existiert nicht in der Biologie; aber nichts hindert eine digitale GA, intelligent zu betrügen: Hier, die Übertragung des Acquis beschleunigt radikal die Konvergenz, da jede Generation von einem bereits informierten Anfangspunkt zurückkehrt anstatt von zufälligen Gewichten.

Drei weitere strukturelle Änderungen in dieser Version:

*   **Umweltvielfalt**: Jeder Genome wird nicht mehr auf einem einzigen Marktfenster bewertet, sondern auf mehreren, die aus verschiedenen Systemen (Schuh, Kassierer, Range) stammen. Ein Agent, der auf einem Fenster auftrifft und auf einem anderen einstürzt, kann nicht mehr die Front von Pareto beherrschen.
*   **Komplexe Regulierung von FLOPs**: Die Netzberechnungskosten (in FLOP) werden in NSGA-II zu einem eigenständigen Ziel. Dadurch wird vermieden, dass die Entwicklung zu massiven Architekturen umgeht, nur weil sie mehr Bruttokapazität haben, ohne dass dies durch Leistungsgewinn gerechtfertigt ist.
*   **Schnittstelle**`RLBackend`**entkoppelt**: Die GA kennt die Details von DQN nicht mehr. du manipuliert einen Genome und ruft`train()` / `evaluate()`über eine abstrakte Schnittstelle, die theoretisch einen anderen RL-Algorithmus ohne Berührung mit dem Evolutionsmotor anschließt.
```
interface RLBackend {
  train(genome: Genome, window: MarketWindow): Promise<TrainedWeights>;
  evaluate(genome: Genome, weights: TrainedWeights, window: MarketWindow): Promise<FitnessVector>;
}
```
Letzter technischer Punkt: Die Bewertung wurde in **geschränkte asynchrone Wettbewerb** umgewandelt; ein Pool von N-Bewertungen parallel statt einer Sequenzschleife, mit einer expliziten Begrenzung, um die verfügbaren GPU/CPU-Ressourcen nicht zu sättigen.

## Was der v4 gegenüber v3 in der Praxis korrigiert

Voreinstellung v3 Korrektur v4 Verlorene Gewichte bei jeder Generation Wiedereinsetzung von trainierten Gewichten Über ein einziges Marktfenster Bewertung auf mehreren Fenstern, unterschiedliche Architekturen, die ohne Belastung FLOPs als explizites Pareto-Objektiv GA in Verbindung mit DQN-Details vergrößern`RLBackend`Abstrakt Sequenzbewertung langsam Wettbewerb sync bornée

Die v4 hat auch zehn konkrete Fehler der "grounding" API behoben; Fälle, in denen der GA-Code eine Schnittstelle für`TradingAgent`Diese Art von Fehler ist unsichtbar, solange der Code nicht mit dem wahren Quellcode des Agenten verglichen wird: Der v4 wurde erst nach Zeilenumlauf mit der tatsächlichen Datei validiert.

## Warum Evolution und Gradienten mischen, anstatt sich für eine oder andere zu entscheiden

Man könnte sich fragen, warum man nicht einfach reiner RL oder reiner NEAT-Evolution macht. Die Antwort lautet: Der Gradienten ist ausgezeichnet, um lokal zu verfeinern (kontinuierliche Gewichte auf ein nahes Optimum einzustellen), die Evolution ist ausgezeichnet für die globale Erforschung (Erkundung von Architekturen und Hyperparameterkombinationen, die keine Gradienten erreichen können, weil der diskrete Suchraum nicht unterschiedlich ist).

Der Preis ist die Komplexität des Engineerings; vier Versionen waren kein Luxus, es war die Anzahl der Iterationen, die erforderlich waren, damit die GA + RL-Schleife nicht mehr sich selbst sabotieren (Überlernung, Verlust guter Menschen, erworbener Gewichtsverlust). Aber das Ergebnis ist ein System, das einen weit größeren Designraum als ein einfaches Grid-Suche von Hyperparametern erforscht, während die lokale Effizienz des Gradienten für jeden bewerteten Bewerber beibehalten.

## Nächster Schritt

Diese evolutionäre Architektur auf einer Ebene (eine flache Bevölkerung von DQN-Genomen) erreicht ihre Grenzen, wenn die Anzahl der zu deckenden Vermögenswerte steigt. Dies hat den Übergang zu einer dreistufigen hierarchischen Architektur (Asset Analysts → Sector Managers © Portfolio Allocator) mit einer unabhängig von jeder Ebene operierenden GA motiviert... aber das ist das Thema eines anderen Artikels.
