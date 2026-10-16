---
title: "J'ai fait évoluer un réseau de neurones par sélection naturelle plutôt que par descente de gradient"
description: "Comment j'ai remplacé l'entraînement classique par descente de gradient par un algorithme génétique NSGA-II pour faire évoluer des agents DQN de trading : quatre versions, du surapprentissage à l'évolution lamarckienne des poids."
date: 2026-07-13
tags: ["ai", "nsga-ii", "dqn", "trading", "typescript"]
authors: ["docteur-turboss"]
lang: "fr"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "Ft0V1HGWtR3YYmR2bNpc+KcPI4fJjCi30AULtrufA51MXtNvIDnMliXqLFx5xwRfHBr6+z0nXocm2bPZ4B+CHg=="
---
## Le problème avec la descente de gradient seule

Entraîner un agent DQN pour du trading algorithmique avec la descente de gradient classique pose un problème simple à énoncer et difficile à résoudre : le gradient optimise _un_ réseau vers _un_ minimum local, sur _une_ fenêtre de marché. Rien ne garantit que ce minimum généralise à un régime de marché différent, et rien dans la boucle d'entraînement ne pousse vers la diversité; deux runs qui partent de graines différentes convergent souvent vers des stratégies presque identiques, avec les mêmes angles morts.

La réponse que j'ai explorée : remplacer (ou plutôt superposer) la descente de gradient avec un algorithme génétique. Au lieu d'entraîner un agent, on fait évoluer une population d'agents; chacun un génome encodant une architecture et des hyperparamètres; et on laisse la sélection naturelle faire le tri, pendant que le gradient continue de peaufiner chaque individu à l'intérieur de sa propre vie.

Ce runner a traversé quatre versions en une seule session de travail intensive. Chacune a corrigé un défaut structurel de la précédente.

## v1 : la version naïve, et pourquoi elle ne suffisait pas

La première version faisait ce qu'on attend d'un GA basique : une population de genomes, une fonction de fitness, sélection, croisement, mutation, génération suivante. Chaque genome encodait la topologie du réseau (nombre de couches, largeur), les hyperparamètres DQN (learning rate, epsilon decay, taille du replay buffer), et quelques choix architecturaux (quelles sources de données consommer, quelle taille d'embedding).

Le défaut principal : la fitness était calculée sur les mêmes données que l'entraînement. Un agent pouvait littéralement mémoriser une fenêtre de marché et obtenir un score excellent sans avoir appris une stratégie généralisable. Classique surapprentissage, mais amplifié par la sélection génétique; le GA sélectionne activement les individus qui exploitent le mieux cette faille.

## v2 : séparer entraînement et évaluation

La correction évidente était de séparer les phases : chaque genome s'entraîne sur une fenêtre de marché, puis est évalué sur une fenêtre différente, jamais vue pendant l'entraînement. Seule la performance en évaluation compte pour la fitness.

Ce changement seul a fait chuter la fitness moyenne de la population; signe qu'une bonne partie de ce qui semblait être de la performance en v1 était de la mémorisation pure. Douloureux à voir, mais c'est exactement le signal qu'on veut : un score plus bas mais honnête vaut mieux qu'un score gonflé et trompeur.

## v3 : passer à NSGA-II et une fitness multi-objectif

Optimiser un seul score de fitness (disons le rendement) pousse mécaniquement vers des agents qui prennent des risques extrêmes pour maximiser ce seul chiffre. La solution a été de passer à NSGA-II (Non-dominated Sorting Genetic Algorithm II), qui optimise simultanément plusieurs objectifs sans les réduire à une somme pondérée arbitraire : rendement, drawdown maximal, ratio de Sharpe, stabilité inter-fenêtres.

NSGA-II construit un front de Pareto : l'ensemble des genomes pour lesquels aucune amélioration sur un objectif n'est possible sans dégrader un autre. Plutôt que de forcer un compromis unique entre rendement et risque via une pondération choisie à l'avance, on garde toute la frontière de compromis et on laisse le choix final ouvert.

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
  // ... construction des fronts suivants par retrait itératif
  return fronts;
}
```

Deuxième ajout de la v3 : une **archive de Pareto persistante**. Sans elle, un bon genome trouvé à la génération 12 peut disparaître à la génération 15 si le hasard du croisement ne le reproduit pas; même s'il restait meilleur que tout ce qui l'a remplacé. L'archive conserve, à travers toutes les générations, l'ensemble des individus non dominés jamais rencontrés, indépendamment de la population courante.

## v4 : évolution lamarckienne et diversité environnementale

La v3 avait un angle mort structurel : le génome décrivait l'architecture, mais les poids appris pendant l'entraînement disparaissaient à chaque nouvelle génération. Un descendant né du croisement de deux bons parents héritait de leur architecture, mais devait réapprendre depuis zéro; aucune trace des poids qui avaient rendu ses parents performants.

La v4 introduit l'**évolution lamarckienne** : les poids entraînés sont réinjectés dans le génome après l'entraînement, et transmis (avec mutation) à la descendance. C'est une hérésie biologique assumée; Lamarck avait tort pour les organismes vivants, l'hérédité des caractères acquis n'existe pas en biologie; mais rien n'empêche un GA numérique de tricher intelligemment : ici, transmettre l'acquis accélère radicalement la convergence, puisque chaque génération repart d'un point d'initialisation déjà informé plutôt que de poids aléatoires.

Trois autres changements structurels dans cette version :

*   **Diversité environnementale** : chaque genome n'est plus évalué sur une seule fenêtre de marché mais sur plusieurs, tirées de régimes différents (haussier, baissier, range). Un agent qui excelle sur une fenêtre et s'effondre sur une autre ne peut plus dominer le front de Pareto.
    
*   **Régularisation par complexité FLOPs** : le coût de calcul du réseau (en FLOPs) devient un objectif à part entière dans NSGA-II. Ça évite que l'évolution ne converge vers des architectures massives simplement parce qu'elles ont plus de capacité brute, sans que ce soit justifié par le gain de performance.
    
*   **Interface** `RLBackend` **découplée** : le GA ne connaît plus les détails de DQN. Il manipule un genome et appelle `train()` / `evaluate()` à travers une interface abstraite, ce qui permet en théorie de brancher un autre algorithme RL sans toucher au moteur évolutif.
    

```
interface RLBackend {
  train(genome: Genome, window: MarketWindow): Promise<TrainedWeights>;
  evaluate(genome: Genome, weights: TrainedWeights, window: MarketWindow): Promise<FitnessVector>;
}
```

Dernier point technique : l'évaluation est passée en **concurrence asynchrone bornée**; un pool de N évaluations en parallèle plutôt qu'une boucle séquentielle, avec une limite explicite pour ne pas saturer les ressources GPU/CPU disponibles.

## Ce que corrige la v4 par rapport à la v3 en pratique

Défaut v3 Correction v4 Poids perdus à chaque génération Réinjection lamarckienne des poids entraînés Surapprentissage à une seule fenêtre de marché Évaluation sur fenêtres multiples, régimes variés Architectures qui grossissent sans contrainte FLOPs comme objectif Pareto explicite GA couplé aux détails de DQN Interface `RLBackend` abstraite Évaluation séquentielle lente Concurrence async bornée

La v4 a aussi corrigé dix bugs concrets de "grounding" API; des cas où le code du GA supposait une interface pour `TradingAgent` qui ne correspondait pas exactement à l'implémentation réelle. Ce genre de bug est invisible tant qu'on ne confronte pas le code au véritable code source de l'agent : la v4 n'a été validée qu'après relecture ligne à ligne face au fichier réel.

## Pourquoi mélanger évolution et gradient plutôt que choisir l'un ou l'autre

On pourrait se demander pourquoi ne pas simplement faire du RL pur, ou de l'évolution pure façon NEAT. La réponse tient en une phrase : le gradient est excellent pour affiner localement (ajuster des poids continus vers un optimum proche), l'évolution est excellente pour explorer globalement (découvrir des architectures et des combinaisons d'hyperparamètres qu'aucun gradient ne peut atteindre, parce que l'espace de recherche discret n'est pas différentiable). Utiliser l'un sans l'autre, c'est se priver d'une des deux formes d'exploration.

Le prix à payer est la complexité d'ingénierie; quatre versions n'étaient pas un luxe, c'était le nombre d'itérations nécessaires pour que la boucle GA + RL cesse de se saboter elle-même (surapprentissage, perte de bons individus, perte de poids acquis). Mais le résultat est un système qui explore un espace de conception bien plus large qu'un simple grid search d'hyperparamètres, tout en gardant l'efficacité locale du gradient pour chaque candidat évalué.

## Prochaine étape

Cette architecture évolutive à un seul niveau (une population plate de genomes DQN) atteint ses limites quand le nombre d'actifs à couvrir grimpe. C'est ce qui a motivé le passage à une architecture hiérarchique à trois niveaux (Asset Analysts → Sector Managers → Portfolio Allocator), avec un GA opérant indépendamment à chaque niveau... mais ça, c'est le sujet d'un autre article.