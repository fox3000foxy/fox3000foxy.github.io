---
title: "I evolved a neural network through natural selection instead of gradient descent"
description: "How I replaced classic gradient descent training with a NSGA-II genetic algorithm to evolve DQN trading agents: four versions, from overfitting to Lamarckian weight evolution."
date: 2026-07-13
tags: ["ai", "nsga-ii", "dqn", "trading", "typescript"]
authors: ["docteur-turboss"]
lang: "en"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "H1D3kKkKzT9bvFY7bULYKdWBIzQXzDynhznD2XiTReKfdx9t/oVpJqb6zjPqTy40uzvMxgkd6zs6UjNT1IJoJQ=="
---

## The problem with gradient descent alone

Training a DQN agent for algorithmic trading with classic gradient descent has a simple problem to state and a hard one to solve: gradient descent optimizes _one_ network toward _one_ local minimum, on _one_ market window. Nothing guarantees this minimum generalizes to a different market regime, and nothing in the training loop pushes for diversity; two runs starting from different seeds often converge to nearly identical strategies, with the same blind spots.

The answer I explored: replace (or rather overlay) gradient descent with a genetic algorithm. Instead of training one agent, you evolve a population of agents; each genome encodes an architecture and hyperparameters; and natural selection does the sorting, while gradient descent keeps fine-tuning each individual within its own lifetime.

This runner went through four versions in a single intensive session. Each version fixed a structural flaw in the previous one.

## v1: the naive version, and why it wasn't enough

The first version did what you'd expect from a basic GA: a population of genomes, a fitness function, selection, crossover, mutation, next generation. Each genome encoded the network topology (number of layers, width), DQN hyperparameters (learning rate, epsilon decay, replay buffer size), and a few architectural choices (which data sources to consume, what embedding size).

The main flaw: fitness was computed on the same data used for training. An agent could literally memorize a market window and get an excellent score without having learned a generalizable strategy. Classic overfitting, but amplified by genetic selection; the GA actively selects individuals that best exploit this loophole.

## v2: separating training and evaluation

The obvious fix was to separate the phases: each genome trains on one market window, then is evaluated on a different window, never seen during training. Only the evaluation performance counts toward fitness.

This change alone caused the average population fitness to drop; a sign that a large portion of what looked like performance in v1 was pure memorization. Painful to see, but it's exactly the signal you want: a lower but honest score is better than an inflated, misleading one.

## v3: moving to NSGA-II and multi-objective fitness

Optimizing a single fitness score (say, returns) mechanically pushes agents toward taking extreme risks to maximize that single number. The solution was switching to NSGA-II (Non-dominated Sorting Genetic Algorithm II), which simultaneously optimizes several objectives without reducing them to an arbitrary weighted sum: returns, maximum drawdown, Sharpe ratio, inter-window stability.

NSGA-II builds a Pareto front: the set of genomes for which no improvement on one objective is possible without degrading another. Instead of forcing a single return-risk trade-off through a pre-chosen weighting, you keep the entire compromise frontier and leave the final choice open.

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
  // ... subsequent front construction by iterative removal
  return fronts;
}
```

Second addition in v3: a **persistent Pareto archive**. Without it, a good genome found at generation 12 can disappear by generation 15 if crossover luck doesn't reproduce it; even if it remained better than everything that replaced it. The archive keeps, across all generations, the set of all non-dominated individuals ever encountered, regardless of the current population.

## v4: Lamarckian evolution and environmental diversity

V3 had a structural blind spot: the genome described the architecture, but the weights learned during training disappeared at each new generation. A child born from crossover of two good parents inherited their architecture, but had to relearn from scratch; no trace of the weights that had made its parents performant.

V4 introduces **Lamarckian evolution**: trained weights are fed back into the genome after training, and transmitted (with mutation) to the offspring. This is deliberate biological heresy; Lamarck was wrong for living organisms -- inheritance of acquired characteristics doesn't exist in biology -- but nothing stops a digital GA from cheating intelligently: here, transmitting acquired knowledge radically accelerates convergence, since each generation restarts from an already-informed initialization rather than random weights.

Three other structural changes in this version:

*   **Environmental diversity**: each genome is no longer evaluated on a single market window but on several, drawn from different regimes (bullish, bearish, ranging). An agent that excels on one window and collapses on another can no longer dominate the Pareto front.
    
*   **FLOPs complexity regularization**: the network's computational cost (in FLOPs) becomes a full objective in NSGA-II. This prevents evolution from converging to massive architectures simply because they have more raw capacity, without a justified performance gain.
    
*   **Decoupled `RLBackend` interface**: the GA no longer knows DQN details. It manipulates a genome and calls `train()` / `evaluate()` through an abstract interface, which theoretically allows swapping in another RL algorithm without touching the evolutionary engine.
    

```
interface RLBackend {
  train(genome: Genome, window: MarketWindow): Promise<TrainedWeights>;
  evaluate(genome: Genome, weights: TrainedWeights, window: MarketWindow): Promise<FitnessVector>;
}
```

Last technical point: evaluation switched to **bounded async concurrency**; a pool of N parallel evaluations instead of a sequential loop, with an explicit limit to avoid saturating available GPU/CPU resources.

## What v4 fixes versus v3 in practice

V3 flaw V4 fix Weights lost each generation Lamarckian re-injection of trained weights Overfitting to a single market window Evaluation on multiple windows, varied regimes Architectures growing unconstrained FLOPs as explicit Pareto objective GA coupled to DQN details Abstract `RLBackend` interface Slow sequential evaluation Bounded async concurrency

V4 also fixed ten concrete API "grounding" bugs; cases where the GA code assumed an interface for `TradingAgent` that didn't exactly match the real implementation. This kind of bug is invisible until you confront the code against the actual agent source: v4 was only validated after a line-by-line re-reading against the real file.

## Why mix evolution and gradient rather than choose one

You might wonder why not just use pure RL, or pure evolution like NEAT. The answer is one sentence: gradient is excellent for local fine-tuning (adjusting continuous weights toward a nearby optimum), evolution is excellent for global exploration (discovering architectures and hyperparameter combinations no gradient can reach, because the discrete search space isn't differentiable). Using one without the other means depriving yourself of one of the two forms of exploration.

The price is engineering complexity; four versions weren't a luxury, they were the number of iterations needed for the GA + RL loop to stop sabotaging itself (overfitting, loss of good individuals, loss of acquired weights). But the result is a system that explores a much wider design space than a simple grid search of hyperparameters, while keeping the local efficiency of gradient descent for each evaluated candidate.

## Next step

This single-level evolutionary architecture (a flat population of DQN genomes) reaches its limits when the number of assets to cover grows. That's what motivated the move to a three-level hierarchical architecture (Asset Analysts → Sector Managers → Portfolio Allocator), with a GA operating independently at each level... but that's the subject of another article.
