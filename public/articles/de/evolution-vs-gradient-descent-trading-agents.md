---
title: "Ich habe ein neuronales Netz durch natürliche Selektion statt Gradientenabstieg evolviert"
description: "Wie ich das klassische Gradientenabstiegs-Training durch einen NSGA-II-Genetischen-Algorithmus ersetzt habe, um DQN-Trading-Agenten zu evolvieren: vier Versionen, von Overfitting bis zur lamarckschen Gewichtsentwicklung."
date: 2026-07-13
tags: ["ai", "nsga-ii", "dqn", "trading", "typescript"]
authors: ["docteur-turboss"]
lang: "de"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "LxVSQsIi2FX7dH+xF287gsh6iumd69ASkoJuUJ53zrOowGh1hMSeeOg3wE0YOgv7KTuo4F5TQE5+RZUT6neM3w=="
---

## Das Problem des reinen Gradientenabstiegs

Das Training eines DQN-Agenten für algorithmischen Handel mit klassischem Gradientenabstieg hat ein einfach zu formulierendes und ein schwer zu lösendes Problem: Der Gradientenabstieg optimiert _ein_ Netzwerk in Richtung _eines_ lokalen Minimums, auf _einem_ Marktfenster. Nichts garantiert, dass dieses Minimum auf ein anderes Marktregime generalisiert, und nichts im Trainingszyklus fördert Vielfalt; zwei Läufe mit unterschiedlichen Startwerten konvergieren oft zu nahezu identischen Strategien mit denselben blinden Flecken.

Der von mir untersuchte Ansatz: den Gradientenabstieg durch einen genetischen Algorithmus ersetzen (oder vielmehr überlagern). Statt eines Agenten wird eine Population von Agenten evolviert; jedes Genom codiert eine Architektur und Hyperparameter; und die natürliche Selektion übernimmt die Sortierung, während der Gradientenabstieg jeden Individuum innerhalb seiner eigenen Lebenszeit weiter verfeinert.

Dieses Projekt durchlief vier Versionen in einer einzigen intensiven Sitzung. Jede Version behob einen strukturellen Fehler der vorherigen.

## v1: die naive Version und warum sie nicht ausreichte

Die erste Version tat, was man von einem einfachen GA erwartet: eine Population von Genomen, eine Fitnessfunktion, Selektion, Crossover, Mutation, nächste Generation. Jedes Genom codierte die Netzwerktopologie (Anzahl der Layer, Breite), DQN-Hyperparameter (Lernrate, Epsilon-Dekay, Replay-Buffer-Größe) und einige architektonische Entscheidungen (welche Datenquellen verwendet werden, welche Embedding-Größe).

Der Hauptfehler: Die Fitness wurde auf denselben Daten berechnet, die für das Training verwendet wurden. Ein Agent konnte buchstäblich ein Marktfenster auswendig lernen und eine hervorragende Bewertung erzielen, ohne eine generalisierbare Strategie gelernt zu haben. Klassisches Overfitting, aber verstärkt durch genetische Selektion; der GA selektiert aktiv die Individuen, die diese Gesetzeslücke am besten ausnutzen.

## v2: Trennung von Training und Evaluierung

Die offensichtliche Lösung war die Trennung der Phasen: Jedes Genom trainiert auf einem Marktfenster und wird dann auf einem anderen, während des Trainings nie gesehenen Fenster evaluiert. Nur die Evaluierungsleistung zählt für die Fitness.

Diese einzelne Änderung führte zu einem Abfall der durchschnittlichen Populationsfitness; ein Zeichen dafür, dass ein großer Teil dessen, was in v1 wie Leistung aussah, reines Auswendiglernen war. Es ist schmerzhaft anzusehen, aber es ist genau das Signal, das man haben möchte: Eine niedrigere, aber ehrliche Bewertung ist besser als eine aufgeblähte, irreführende.

## v3: Umstellung auf NSGA-II und multi-objective Fitness

Die Optimierung einer einzelnen Fitnesskennzahl (z. B. Rendite) treibt Agenten mechanisch dazu, extreme Risiken einzugehen, um diese einzelne Zahl zu maximieren. Die Lösung war die Umstellung auf NSGA-II (Non-dominated Sorting Genetic Algorithm II), der mehrere Ziele gleichzeitig optimiert, ohne sie auf eine willkürlich gewichtete Summe zu reduzieren: Rendite, maximaler Drawdown, Sharpe-Ratio, Stabilität zwischen Fenstern.

NSGA-II erstellt eine Pareto-Front: die Menge der Genome, bei denen keine Verbesserung eines Ziels möglich ist, ohne ein anderes zu verschlechtern. Anstatt einen einzigen Rendite-Risiko-Kompromiss durch eine vorab festgelegte Gewichtung zu erzwingen, behält man die gesamte Kompromissfront und lässt die endgültige Wahl offen.

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
  // ... Konstruktion nachfolgender Fronten durch iterative Entfernung
  return fronts;
}
```

Zweite Ergänzung in v3: ein **persistentes Pareto-Archiv**. Ohne dieses kann ein gutes, in Generation 12 gefundenes Genom bis Generation 15 verschwinden, wenn das Crossover-Glück es nicht reproduziert; selbst wenn es besser blieb als alles, was es ersetzte. Das Archiv bewahrt über alle Generationen hinweg die Menge aller jemals gefundenen nicht-dominierten Individuen, unabhängig von der aktuellen Population.

## v4: Lamarck'sche Evolution und Umweltvielfalt

V3 hatte einen strukturellen blinden Fleck: Das Genom beschrieb die Architektur, aber die während des Trainings gelernten Gewichte verschwanden bei jeder neuen Generation. Ein aus dem Crossover zweier guter Eltern geborenes Kind erbte deren Architektur, musste aber von Grund auf neu lernen; keine Spur der Gewichte, die seine Eltern leistungsfähig gemacht hatten.

V4 führt die **Lamarck'sche Evolution** ein: trainierte Gewichte werden nach dem Training zurück in das Genom eingespeist und (mit Mutation) an die Nachkommen weitergegeben. Dies ist eine bewusste biologische Häresie; Lamarck lag bei Lebewesen falsch -- die Vererbung erworbener Eigenschaften gibt es in der Biologie nicht -- aber nichts hindert einen digitalen GA daran, intelligent zu betrügen: Hier beschleunigt die Weitergabe erworbener Kenntnisse die Konvergenz radikal, da jede Generation von einer bereits informierten Initialisierung statt von zufälligen Gewichten ausgeht.

Drei weitere strukturelle Änderungen in dieser Version:

*   **Umweltvielfalt**: Jedes Genom wird nicht mehr auf einem einzigen Marktfenster evaluiert, sondern auf mehreren, die aus verschiedenen Regimen stammen (bullisch, bärisch, seitwärts). Ein Agent, der auf einem Fenster hervorragend abschneidet und auf einem anderen zusammenbricht, kann die Pareto-Front nicht mehr dominieren.
    
*   **FLOPs-Komplexitätsregulierung**: Die Rechenkosten des Netzwerks (in FLOPs) werden zu einem vollwertigen Ziel in NSGA-II. Dies verhindert, dass die Evolution zu massiven Architekturen konvergiert, nur weil sie mehr rohe Kapazität haben, ohne einen gerechtfertigten Leistungsgewinn.
    
*   **Entkoppeltes `RLBackend`-Interface**: Der GA kennt keine DQN-Details mehr. Er manipuliert ein Genom und ruft `train()` / `evaluate()` über ein abstraktes Interface auf, was theoretisch den Austausch gegen einen anderen RL-Algorithmus ermöglicht, ohne die Evolutions-Engine zu berühren.
    

```
interface RLBackend {
  train(genome: Genome, window: MarketWindow): Promise<TrainedWeights>;
  evaluate(genome: Genome, weights: TrainedWeights, window: MarketWindow): Promise<FitnessVector>;
}
```

Letzter technischer Punkt: Die Evaluierung wurde auf **gebundene asynchrone Nebenläufigkeit** umgestellt; ein Pool von N parallelen Evaluierungen statt einer sequenziellen Schleife, mit einer expliziten Grenze, um eine Sättigung der verfügbaren GPU-/CPU-Ressourcen zu vermeiden.

## Was v4 gegenüber v3 in der Praxis behebt

V3-Fehler V4-Behebung Gewichte pro Generation verloren Lamarck'sche Wiedereinführung trainierter Gewichte Overfitting auf ein einzelnes Marktfenster Evaluierung auf mehreren Fenstern, verschiedenen Regimen Unbegrenzt wachsende Architekturen FLOPs als explizites Pareto-Ziel GA an DQN-Details gekoppelt Abstraktes `RLBackend`-Interface Langsame sequenzielle Evaluierung Gebundene asynchrone Nebenläufigkeit

V4 behob auch zehn konkrete API-"Grounding"-Fehler; Fälle, in denen der GA-Code ein Interface für `TradingAgent` annahm, das nicht exakt mit der tatsächlichen Implementierung übereinstimmte. Diese Art von Fehler ist unsichtbar, bis man den Code mit der tatsächlichen Agentenquelle abgleicht: v4 wurde erst nach einem zeilenweisen Neuabgleich mit der echten Datei validiert.

## Warum Evolution und Gradient mischen statt sich für eines zu entscheiden

Du fragst dich vielleicht, warum nicht einfach reines RL oder reine Evolution wie NEAT verwendet wird. Die Antwort ist ein Satz: Der Gradient eignet sich hervorragend für die lokale Feinabstimmung (Anpassen kontinuierlicher Gewichte in Richtung eines nahen Optimums), die Evolution eignet sich hervorragend für die globale Erkundung (Entdecken von Architekturen und Hyperparameterkombinationen, die kein Gradient erreichen kann, da der diskrete Suchraum nicht differenzierbar ist). Nur eines zu verwenden bedeutet, sich einer der beiden Erkundungsformen zu berauben.

Der Preis ist die ingenieurtechnische Komplexität; vier Versionen waren kein Luxus, sondern die Anzahl der Iterationen, die nötig waren, damit die GA + RL-Schleife aufhörte, sich selbst zu sabotieren (Overfitting, Verlust guter Individuen, Verlust erworbener Gewichte). Aber das Ergebnis ist ein System, das einen viel größeren Entwurfsraum erkundet als eine einfache Gittersuche von Hyperparametern, während es die lokale Effizienz des Gradientenabstiegs für jeden evaluierten Kandidaten beibehält.

## Nächster Schritt

Diese einstufige evolutionäre Architektur (eine flache Population von DQN-Genomen) stößt an ihre Grenzen, wenn die Anzahl der abzudeckenden Assets wächst. Das war die Motivation für den Umstieg auf eine dreistufige hierarchische Architektur (Asset-Analysten → Sektor-Manager → Portfolio-Allokator), mit einem GA, der auf jeder Ebene unabhängig operiert... aber das ist das Thema eines anderen Artikels.
