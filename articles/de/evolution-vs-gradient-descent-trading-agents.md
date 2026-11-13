---
title: "Ich habe ein neuronales Netz durch natürliche Selektion evolviert statt durch Gradientenabstieg"
description: "Wie ich klassisches Training per Gradientenabstieg durch einen genetischen NSGA-II-Algorithmus ersetzt habe, um DQN-Trading-Agenten zu evolvieren: vier Versionen, von Overfitting bis zur lamarckschen Evolution der Gewichte."
date: 2026-07-13
tags: ["ai", "nsga-ii", "dqn", "trading", "typescript"]
authors: ["docteur-turboss"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "u+s3JrhnsjULeu6wR0J4DV/xm+Elpx4uJZU3GOXFeauH8OxYwRlqVETULUB7V6iIC6U5i8y7NbC+Rrylh+4uZA=="
---

## Das Problem mit Gradientenabstieg allein

Einen DQN-Agenten für algorithmisches Trading mit klassischem Gradientenabstieg zu trainieren stellt ein einfach zu formulierendes und schwer zu lösendes Problem: Der Gradient optimiert _ein_ Netz hin zu _einem_ lokalen Minimum, auf _einem_ Marktfenster. Nichts garantiert, dass dieses Minimum auf ein anderes Marktregime generalisiert, und nichts in der Trainingsschleife drängt zu Diversität; zwei Runs, die von unterschiedlichen Seeds starten, konvergieren oft zu fast identischen Strategien mit denselben blinden Flecken.

Die Antwort, die ich erkundet habe: Den Gradientenabstieg durch einen genetischen Algorithmus ersetzen (oder eher überlagern). Statt einen Agenten zu trainieren, evolviert man eine Population von Agenten; jeder ein Genom, das eine Architektur und Hyperparameter kodiert; und man lässt die natürliche Selektion sortieren, während der Gradient jeden Einzelnen innerhalb seines eigenen Lebens weiter feinschleift.

Dieser Runner hat vier Versionen in einer einzigen intensiven Arbeitssession durchlaufen. Jede hat einen strukturellen Defekt der vorherigen korrigiert.

## v1: die naive Version, und warum sie nicht reichte

Die erste Version tat, was man von einem Basis-GA erwartet: Eine Population von Genomen, eine Fitnessfunktion, Selektion, Crossover, Mutation, nächste Generation. Jedes Genom kodierte die Netztopologie (Schichtzahl, Breite), die DQN-Hyperparameter (Learning Rate, Epsilon Decay, Replay-Buffer-Größe) und einige Architekturentscheidungen (welche Datenquellen konsumieren, welche Embedding-Größe).

Der Hauptdefekt: Die Fitness wurde auf denselben Daten berechnet wie das Training. Ein Agent konnte buchstäblich ein Marktfenster auswendig lernen und einen exzellenten Score bekommen, ohne eine generalisierbare Strategie gelernt zu haben. Klassisches Overfitting, aber durch die genetische Selektion verstärkt; der GA selektiert aktiv die Individuen, die diese Lücke am besten ausnutzen.

## v2: Training und Evaluierung trennen

Die offensichtliche Korrektur war, die Phasen zu trennen: Jedes Genom trainiert auf einem Marktfenster und wird dann auf einem anderen, während des Trainings nie gesehenen Fenster evaluiert. Nur die Evaluierungsleistung zählt für die Fitness.

Diese Änderung allein ließ die Durchschnittsfitness der Population fallen; ein Zeichen, dass ein guter Teil dessen, was in v1 wie Leistung aussah, reines Auswendiglernen war. Schmerzlich anzusehen, aber genau das Signal, das man will: Ein niedrigerer, aber ehrlicher Score ist besser als ein aufgeblähter und irreführender.

## v3: Wechsel zu NSGA-II und Multi-Objective-Fitness

Einen einzigen Fitnessscore zu optimieren (sagen wir die Rendite) drängt mechanisch zu Agenten, die extreme Risiken eingehen, um diese eine Zahl zu maximieren. Die Lösung war der Wechsel zu NSGA-II (Non-dominated Sorting Genetic Algorithm II), der mehrere Ziele gleichzeitig optimiert, ohne sie auf eine arbiträre gewichtete Summe zu reduzieren: Rendite, maximaler Drawdown, Sharpe-Ratio, Stabilität über Fenster.

NSGA-II baut eine Pareto-Front: Die Menge der Genome, bei denen keine Verbesserung bei einem Ziel möglich ist, ohne ein anderes zu verschlechtern. Statt einen einzigen Kompromiss zwischen Rendite und Risiko über eine vorab gewählte Gewichtung zu erzwingen, behält man die gesamte Kompromissgrenze und lässt die finale Wahl offen.

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
  // ... Aufbau der folgenden Fronts durch iteratives Entfernen
  return fronts;
}
```

Zweite Neuerung der v3: Ein **persistentes Pareto-Archiv**. Ohne es kann ein gutes Genom, das in Generation 12 gefunden wurde, in Generation 15 verschwinden, wenn der Zufall des Crossovers es nicht reproduziert; selbst wenn es besser blieb als alles, was es ersetzt hat. Das Archiv bewahrt über alle Generationen die Menge der je angetroffenen nicht-dominierten Individuen, unabhängig von der aktuellen Population.

## v4: lamarcksche Evolution und Umgebungsdiversität

Die v3 hatte einen strukturellen blinden Fleck: Das Genom beschrieb die Architektur, aber die während des Trainings gelernten Gewichte verschwanden mit jeder neuen Generation. Ein Nachkomme aus der Kreuzung zweier guter Eltern erbte ihre Architektur, musste aber von null neu lernen; keine Spur der Gewichte, die seine Eltern leistungsfähig gemacht hatten.

Die v4 führt die **lamarcksche Evolution** ein: Die trainierten Gewichte werden nach dem Training wieder in das Genom injiziert und (mit Mutation) an die Nachkommen weitergegeben. Es ist eine eingestandene biologische Häresie; Lamarck lag falsch für lebende Organismen, die Vererbung erworbener Merkmale existiert in der Biologie nicht; aber nichts hindert einen numerischen GA daran, intelligent zu schummeln: Hier beschleunigt das Weitergeben des Erworbenen die Konvergenz radikal, weil jede Generation von einem schon informierten Initialisierungspunkt startet statt von zufälligen Gewichten.

Drei weitere strukturelle Änderungen in dieser Version:

*   **Umgebungsdiversität**: Jedes Genom wird nicht mehr auf einem einzigen Marktfenster evaluiert, sondern auf mehreren, aus unterschiedlichen Regimen gezogen (bullisch, bärisch, Range). Ein Agent, der auf einem Fenster glänzt und auf einem anderen zusammenbricht, kann die Pareto-Front nicht mehr dominieren.
*   **FLOPs-Komplexitätsregularisierung**: Die Rechenkosten des Netzes (in FLOPs) werden ein eigenes Ziel in NSGA-II. Das verhindert, dass die Evolution zu massiven Architekturen konvergiert, einfach weil sie mehr rohe Kapazität haben, ohne dass es durch den Leistungsgewinn gerechtfertigt wäre.
*   **Entkoppelte** `RLBackend`-**Schnittstelle**: Der GA kennt die DQN-Details nicht mehr. Er handhabt ein Genom und ruft `train()` / `evaluate()` über eine abstrakte Schnittstelle auf, was es theoretisch erlaubt, einen anderen RL-Algorithmus anzustöpseln, ohne die Evolutionsengine anzufassen.

```
interface RLBackend {
  train(genome: Genome, window: MarketWindow): Promise<TrainedWeights>;
  evaluate(genome: Genome, weights: TrainedWeights, window: MarketWindow): Promise<FitnessVector>;
}
```

Letzter technischer Punkt: Die Evaluierung läuft jetzt in **begrenzter asynchroner Konkurrenz**; ein Pool von N parallelen Evaluierungen statt einer sequenziellen Schleife, mit explizitem Limit, um die verfügbaren GPU/CPU-Ressourcen nicht zu sättigen.

## Was die v4 gegenüber der v3 in der Praxis korrigiert

Defekt v3 Korrektur v4 Verlorene Gewichte bei jeder Generation Lamarcksche Reinjektion der trainierten Gewichte Overfitting auf ein einziges Marktfenster Evaluierung auf mehreren Fenstern, variierte Regime Architekturen, die ohne Zwang wachsen FLOPs als explizites Pareto-Ziel GA an DQN-Details gekoppelt Abstrakte `RLBackend`-Schnittstelle Langsame sequenzielle Evaluierung Begrenzte Async-Konkurrenz

Die v4 hat auch zehn konkrete "Grounding"-Bugs der API korrigiert; Fälle, in denen der GA-Code eine Schnittstelle für `TradingAgent` annahm, die nicht genau der echten Implementierung entsprach. Diese Art Bug ist unsichtbar, solange man den Code nicht mit dem echten Quellcode des Agenten konfrontiert: Die v4 wurde erst nach Zeile-für-Zeile-Nachlese gegen die echte Datei validiert.

## Warum Evolution und Gradient mischen statt eines von beiden

Man könnte fragen, warum nicht einfach pures RL oder pure Evolution nach Art von NEAT. Die Antwort passt in einen Satz: Der Gradient ist exzellent zum lokalen Feinschliff (kontinuierliche Gewichte hin zu einem nahen Optimum justieren), die Evolution ist exzellent zur globalen Erkundung (Architekturen und Hyperparameterkombinationen entdecken, die kein Gradient erreichen kann, weil der diskrete Suchraum nicht differenzierbar ist). Eines ohne das andere zu nutzen heißt, sich einer der beiden Erkundungsformen zu berauben.

Der Preis ist Engineering-Komplexität; vier Versionen waren kein Luxus, es war die Zahl nötiger Iterationen, damit die GA + RL-Schleife aufhört, sich selbst zu sabotieren (Overfitting, Verlust guter Individuen, Verlust erworbener Gewichte). Aber das Ergebnis ist ein System, das einen deutlich breiteren Designraum erkundet als ein simples Hyperparameter-Grid-Search und dabei die lokale Effizienz des Gradienten für jeden evaluierten Kandidaten behält.

## Nächster Schritt

Diese einstufige evolutive Architektur (eine flache Population von DQN-Genomen) erreicht ihre Grenzen, wenn die Zahl abzudeckender Assets steigt. Das hat den Wechsel zu einer hierarchischen Drei-Ebenen-Architektur motiviert (Asset Analysts → Sector Managers → Portfolio Allocator), mit einem GA, der auf jeder Ebene unabhängig operiert... aber das ist das Thema eines anderen Artikels.
