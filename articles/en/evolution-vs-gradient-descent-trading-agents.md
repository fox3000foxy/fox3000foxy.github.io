---
title: "I Evolved a Neural Network Through Natural Selection Instead of Gradient Descent"
description: "How I replaced classic gradient descent training with a NSGA-II genetic algorithm to evolve DQN trading agents: four versions, from overfitting to Lamarckian weight evolution."
date: 2026-07-13
tags: ["ai", "nsga-ii", "dqn", "trading", "typescript"]
authors: ["docteur-turboss"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "zuDVjfuxWJwjBPRu+JYYC4HwWrLSbLHqW0PlgKFYgkXcW2ahga1bR3vJkrpAeIR4cUMPZRh2qPwJw8XYlDropw=="
---

## The problem with gradient descent alone

Training a DQN agent for algorithmic trading with classic gradient descent has a simple problem to state and a hard one to solve: gradient descent optimizes _one_ network toward _one_ local minimum, on _one_ market window. Nothing guarantees that minimum generalizes to a different market regime, and nothing in the training loop pushes toward diversity; two runs starting from different seeds often converge to nearly identical strategies, with the same blind spots.

The answer I explored: replace (or rather overlay) gradient descent with a genetic algorithm. Instead of training one agent, you evolve a population of agents; each one a genome encoding an architecture and hyperparameters; and you let natural selection do the sorting, while gradient descent keeps refining each individual within its own lifetime.

This runner went through four versions in a single intensive work session. Each one fixed a structural defect of the previous one.

## v1: the naive version, and why it was not enough

The first version did what you expect from a basic GA: a population of genomes, a fitness function, selection, crossover, mutation, next generation. Each genome encoded the network topology (layer count, width), the DQN hyperparameters (learning rate, epsilon decay, replay buffer size), and a few architectural choices (which data sources to consume, what embedding size).

The main defect: fitness was computed on the same data as training. An agent could literally memorize a market window and score excellently without having learned a generalizable strategy. Classic overfitting, but amplified by genetic selection; the GA actively selects the individuals that best exploit that loophole.

## v2: separating training and evaluation

The obvious fix was to separate the phases: each genome trains on one market window, then is evaluated on a different window, never seen during training. Only evaluation performance counts toward fitness.

That change alone dropped the population's average fitness; a sign that a good chunk of what looked like performance in v1 was pure memorization. Painful to watch, but exactly the signal you want: a lower but honest score beats an inflated, misleading one.

## v3: moving to NSGA-II and multi-objective fitness

Optimizing a single fitness score (say returns) mechanically pushes toward agents that take extreme risks to maximize that one number. The solution was to move to NSGA-II (Non-dominated Sorting Genetic Algorithm II), which optimizes several objectives simultaneously without reducing them to an arbitrary weighted sum: returns, max drawdown, Sharpe ratio, cross-window stability.

NSGA-II builds a Pareto front: the set of genomes for which no improvement on one objective is possible without degrading another. Instead of forcing a single returns-vs-risk tradeoff through a pre-chosen weighting, you keep the whole tradeoff frontier and leave the final choice open.

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
  // ... building later fronts by iterative removal
  return fronts;
}
```

Second addition in v3: a **persistent Pareto archive**. Without it, a good genome found at generation 12 can vanish by generation 15 if crossover luck fails to reproduce it; even if it stayed better than everything that replaced it. The archive keeps, across all generations, the set of ever-encountered non-dominated individuals, independent of the current population.

## v4: Lamarckian evolution and environmental diversity

v3 had a structural blind spot: the genome described the architecture, but the weights learned during training disappeared with each new generation. A child born from crossing two good parents inherited their architecture, but had to relearn from scratch; no trace of the weights that had made its parents performant.

v4 introduces **Lamarckian evolution**: trained weights are reinjected into the genome after training, and passed on (with mutation) to offspring. An admitted biological heresy; Lamarck was wrong about living organisms, acquired traits are not inherited in biology; but nothing stops a numerical GA from cheating smartly: here, passing on what was learned radically speeds up convergence, since each generation restarts from an already-informed initialization instead of random weights.

Three other structural changes in this version:

*   **Environmental diversity**: each genome is no longer evaluated on a single market window but on several, drawn from different regimes (bull, bear, range). An agent that excels on one window and collapses on another can no longer dominate the Pareto front.
*   **FLOPs complexity regularization**: the network's compute cost (in FLOPs) becomes an objective of its own in NSGA-II. That stops evolution from converging on massive architectures simply because they have more raw capacity, without that being justified by the performance gain.
*   **Decoupled `RLBackend` interface**: the GA no longer knows DQN details. It manipulates a genome and calls `train()` / `evaluate()` through an abstract interface, which in theory lets you plug in a different RL algorithm without touching the evolutionary engine.

```
interface RLBackend {
  train(genome: Genome, window: MarketWindow): Promise<TrainedWeights>;
  evaluate(genome: Genome, weights: TrainedWeights, window: MarketWindow): Promise<FitnessVector>;
}
```

Last technical point: evaluation moved to **bounded async concurrency**; a pool of N parallel evaluations instead of a sequential loop, with an explicit cap so available GPU/CPU resources never get saturated.

## What v4 fixes over v3 in practice

v3 defect / v4 fix: Lost weights each generation / Lamarckian reinjection of trained weights. Overfitting to a single market window / Evaluation on multiple windows, varied regimes. Architectures growing without constraint / FLOPs as an explicit Pareto objective. GA coupled to DQN internals / Abstract `RLBackend` interface. Slow sequential evaluation / Bounded async concurrency.

v4 also fixed ten concrete "grounding" API bugs; cases where the GA code assumed an interface for `TradingAgent` that did not exactly match the real implementation. That kind of bug stays invisible until you confront the code with the agent's actual source: v4 was only validated after a line-by-line re-read against the real file.

## Why mix evolution and gradient instead of picking one

You could ask why not just do pure RL, or pure evolution like NEAT. The answer fits in one sentence: gradient is excellent at refining locally (tuning continuous weights toward a nearby optimum), evolution is excellent at exploring globally (discovering architectures and hyperparameter combinations no gradient can reach, because the discrete search space is not differentiable). Using one without the other means giving up one of the two forms of exploration.

The price is engineering complexity; four versions were not a luxury, they were the number of iterations needed for the GA + RL loop to stop sabotaging itself (overfitting, losing good individuals, losing acquired weights). But the result is a system that explores a far wider design space than a plain hyperparameter grid search, while keeping the gradient's local efficiency for each evaluated candidate.

## Next step

This single-level evolutionary architecture (a flat population of DQN genomes) hits its limits as the number of assets to cover grows. That is what motivated the move to a three-level hierarchical architecture (Asset Analysts, Sector Managers, Portfolio Allocator), with a GA operating independently at each level... but that is the subject of another article.
