---
title: 我用自然选择进化神经网络，而不是梯度下降
description: 我怎么把经典梯度下降训练换成 NSGA-II 遗传算法，进化交易 DQN 智能体：四个版本，从过拟合一路到权重的拉马克式进化。
date: 2026-07-13
tags: ["ai", "nsga-ii", "dqn", "trading", "typescript"]
authors: ["docteur-turboss"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "ZOBj4Yx3JgLmK0nkvwsbbYqWBbhFe0Ok4bEQoXleoQYTZo6c06ChZiNRLYy8OPteVrIrvXD1jda21FJl8xlYBg=="
---

## 只用梯度下降的问题

用经典梯度下降训交易算法 DQN 智能体，有个说起来简单、解决起来难的问题：梯度只优化*一个*网络，朝*一个*局部最优，在*一个*市场窗口上。没有任何东西保证这个最优能泛化到别的市场状态，训练循环里也没有任何推动多样性的东西，两个从不同种子起跑的训练最后经常收敛到几乎一样的策略，盲区也一样。

我试的解法：把梯度下降换掉（或者说叠一层），换成遗传算法。不训一个智能体，进化一群智能体，每个是个编码架构和超参数的基因组，让自然选择筛，梯度在每个个体自己的一生里继续微调。

这个 runner 在一次高强度 session 里迭代了四个版本。每个版本修前一个的结构性缺陷。

## v1：天真版本，以及为什么不够

第一版就是标准 GA 该有的样子：基因组种群，fitness 函数，选择，交叉，变异，下一代。每个基因组编码网络拓扑（层数、宽度）、DQN 超参数（学习率、epsilon 衰减、replay buffer 大小），再加几个架构选择（吃哪些数据源、embedding 多大）。

主要缺陷：fitness 和训练算在同一份数据上。智能体可以直接背下个市场窗口，拿高分，看似学会了策略，实则死记硬背。经典过拟合，但被遗传选择放大了，GA 会主动选出最会钻这个空子的个体。

## v2：训练和评估分离

显然的修法：分阶段。每个基因组在一个市场窗口上训练，在另一个训练时没见过的窗口上评估。只有评估成绩算 fitness。

只这一改，种群平均 fitness 就掉了，一大块 v1 里的"成绩"是纯背诵。看着疼，但这正是我们要的信号：低但是诚实的分，胜过虚高作弊的分。

## v3：上 NSGA-II，多目标 fitness

只优化一个 fitness 分数（比如收益率）会机械地把智能体推向为刷这一个数字冒极端风险。解法是上 NSGA-II（Non-dominated Sorting Genetic Algorithm II），同时优化多个目标，不做成武断的加权和：收益率、最大回撤、夏普比率、跨窗口稳定性。

NSGA-II 建 Pareto 前沿：找不到不损害别的目标准则还能改进某个目标的基因组集合。不预先用权重拍板收益和风险怎么换算，整条 trade-off 边界留着，最后再选。

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
  // ... 按迭代剥离建后面的前沿
  return fronts;
}
```

v3 第二个东西：**持久 Pareto 存档**。没有它，第 12 代发现的好基因组可能第 15 代就丢了，交叉随机性没复现出来，哪怕它比后来所有都强。存档跨全部代保留见过的所有非支配个体，不看当前种群。

## v4：拉马克式进化和环境多样性

v3 有个结构盲区：基因组描述架构，但训练学到的权重每代一到就扔了。两个好亲本的后代继承架构，却从零重学，亲本靠那些权重才强的痕迹一点没留。

v4 引入**拉马克式进化**：训练好的权重写回基因组，传给后代（加变异）。生物学上这是异端，拉马克错了，后天获得性状遗传在生物里不存在，但数字 GA 作弊没人管：传获得性让收敛快得多，每代都从已被告知过的初始化点起步，而不是随机权重。

这个版本另外三个结构改动：

*   **环境多样性**：每个基因组不再只在一个市场窗口评估，而是多个，抽不同状态（牛市、熊市、震荡）。只会在一种窗口上强的智能体再也统治不了 Pareto 前沿。
*   **FLOPs 复杂度正则**：网络算力成本（FLOPs）成了 NSGA-II 里的独立目标。防止进化只因容量大就把架构吹大，而不管性能涨没涨。
*   **解耦的 `RLBackend` 接口**：GA 不再知道 DQN 细节。它操作基因组，调 `train()` / `evaluate()` 走抽象接口，理论上换别的 RL 算法不用动进化引擎。

```
interface RLBackend {
  train(genome: Genome, window: MarketWindow): Promise<TrainedWeights>;
  evaluate(genome: Genome, weights: TrainedWeights, window: MarketWindow): Promise<FitnessVector>;
}
```

最后一个技术点：评估改成**有界异步并发**，N 个评估并行的池子，显式上限，不把 GPU/CPU 资源打爆。

## v4 相对 v3 修了什么

缺陷 v3 修正 v4 每代丢权重 训练权重拉马克式写回基因组 只在一个市场窗口过拟合 多窗口评估，状态多样 架构无约束膨胀 FLOPs 做 Pareto 显式目标 GA 和 DQN 细节耦合 抽象 `RLBackend` 接口 串行评估慢 有界异步并发

v4 还修了十个具体的 API "grounding" bug，GA 以为 `TradingAgent` 接口长这样，实际文件长那样。不逐行对照真实源码根本看不见：v4 是对着真实文件逐行读完才算验证通过的。

## 为什么进化加梯度都要，而不是二选一

会问为什么不纯 RL，或者纯进化比如 NEAT。一句话：梯度擅长局部精调（连续权重往近处最优挪），进化擅长全局探索（发现梯度到不了的离散空间里的架构和超参数组合，因为不可微）。只用一个，等于主动扔掉一种探索。

代价是工程复杂度，四个版本不是奢侈，是 GA + RL 循环不再自己坑自己（过拟合、丢好个体、丢学到的权重）所需的迭代数。但结果是设计空间比简单 grid search 大得多，每个候选还保留梯度的局部效率。

## 下一步

这种单层进化架构（扁平的一群 DQN 基因组）资产一多就到头了。这才有了三层分级架构（Asset Analysts → Sector Managers → Portfolio Allocator），GA 在每一层独立跑……但那是另一篇文章的事了。
