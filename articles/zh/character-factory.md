---
title: 构建 character-factory：带遗传基因的头像生成器
description: 基于 DiceBear 的 TypeScript 模块：按国家和地区合理生成一致性头像、用于预测后代的小型遗传引擎，以及使其在卡牌游戏中可用的工程细节。
date: 2026-05-16
aiGenerated: true
authors:
  - fox3000foxy
tags:
  - typescript
  - npm
  - open-source
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "blThL6KqnBpCKWpy+xiQtqURbfvxoR3skVazlI0dn262y9ccBQWYNrEw6nLSQUcSw2ZgrjS+6Lhvunf0ReKe1Q=="
---

# 构建 character-factory：带遗传基因的头像生成器

我需要为 [Kurekuta](https://github.com/fox3000foxy/kurekuta/) 生成成千上万个可信、各不相同的头像----这是一个私有的卡牌游戏项目，每张卡牌都包含一个角色"DNA"，渲染器将其转化为肖像。购买现成套图看起来千篇一律。按种子生成一次性 DiceBear 头像又感觉随机得不对劲：一张日式卡牌可能生成一个斯堪的纳维亚金发碧眼角色，而两个"兄弟姐妹"看起来像陌生人。

所以我写了 [character-factory](https://github.com/fox3000foxy/character-factory)----一个基于 DiceBear 的 Lorelei 系列的 TypeScript 模块，在 DiceBear 本身的基础上增加了三样东西：**合理的人口统计分布**、**一个小型遗传引擎**和**一个流畅的构建器**，在游戏循环中非常易用。

## 它能做什么

最小的可用代码片段：

```ts
import { CharacterFactory, Country, Mood } from "character-factory";

const svg = new CharacterFactory()
  .setCountry(Country.Japan)   // 加权民族 → 协调的肤色/发色/发型/胡须
  .setMood(Mood.Happy)
  .buildSvg();
```

这一行链式调用根据日本的人口统计分布加权选择民族，抽取搭配的肤色和发色，从正确的性别子池中挑选发型，然后将眼睛/眉毛/嘴巴锁定为"开心"的组合。结果可以渲染为 SVG，如果安装了 `sharp` 库，也可以输出任意尺寸的 PNG。

一个角色就是一个 `CharacterConfig` 对象----面部、头发、配饰、展示方式。构建器在内部修改它，你可以将其导出为 JSON、base64 或文件，也可以用同样的方式重新加载。对 Kurekuta 来说这一点至关重要：卡牌存储的是配置而非渲染好的图像，因此图片总是可重现的，卡牌的文件大小也保持极小。

## 合理的人口统计分布，而非随机像素

DiceBear 的选项是均匀随机选择器。传递 `["#ffdbb4", "#2c1b18"]` 作为肤色，两者被选中的概率是相等的----这对 Logo 来说没问题，但对于"给我一个来自巴西的角色"来说毫无用处。

`character-factory` 提供了一个 国家 → 民族 → 特征 的管道：

```ts
// 模块内部的实际情况：
ethnicitiesByCountry[Country.Brazil] = [
  { ethnicity: Ethnicity.WestEuropean,  weight: 35 },
  { ethnicity: Ethnicity.BlackAfrican,  weight: 25 },
  { ethnicity: Ethnicity.Latino,        weight: 30 },
  // ...
];

ETHNICITY_PROFILES[Ethnicity.EastAsian] = {
  skinColors: [
    { color: SkinColor.Light,  weight: 35 },
    { color: SkinColor.Warm,   weight: 40 },
    { color: SkinColor.Medium, weight: 20 },
    // ...
  ],
  hairColors: [/* 主要是黑色/深棕色，没有金色 */],
  hairCuts:   { male: [...], female: [...] },
  beardProbability: 0.15,
};
```

每一层都是加权随机抽取。这些权重不是社会学论文----它们是启发式的，确保"来自日本"不会产生红头发，"来自瑞典"不会产生乌黑头发。整个管道一次调用就搞定：`setCountry(country)` 或 `randomizeFromCountry(country, gender?)`。

## 一个小型遗传引擎

我最喜欢的功能：`projectChild`。两个工厂可以产生一个后代，其特征通过粗略的生物显性继承：

```ts
const parentA = new CharacterFactory().setCountry(Country.Sweden);
const parentB = new CharacterFactory().setCountry(Country.Japan);
const kid     = parentA.projectChild(parentB.getConfig());
```

在底层这是一个刻意简化的小模型。每个父母被视为携带一个 2-等位基因的基因型，每个基因从另一方抽取一个，组合成显性或隐性：

```ts
function combine(a: Allele, b: Allele): "dominant" | "recessive" {
  return a === "D" || b === "D" ? "dominant" : "recessive";
}
```

具有真实显性轴的特征（皮肤、眼睛、头发）根据一个明确的有序列表来解析----深色显性于浅色，棕/黑色眼睛显性于蓝色，乌黑头发显性于金色：

```ts
const HAIR_DOMINANCE_ORDER = [
  HairColor.LightBlonde,   // 最隐性
  HairColor.GoldenBlonde,
  HairColor.HoneyBlonde,
  HairColor.Auburn,
  HairColor.Red,
  HairColor.Copper,
  HairColor.LightBrown,
  HairColor.Brown,
  HairColor.DarkBrown,
  HairColor.SoftBlack,
  HairColor.JetBlack,      // 最显性
] as const;
```

`resolveByRank` 找到每个父母的索引，在"显性"等位基因组合时取较高值，在"隐性"时取较低值。幻彩色（粉红、淡紫）不在列表中----它们回退到 50/50 的抛硬币结果，这是正确的行为：它们不是生物特征，所以显性没有意义。

雀斑模拟 MC1R 基因：如果父母双方都有，概率 75%；只有一方携带，概率 25%；双方都没有，概率 0%。胡须与 SRY 基因关联：如果后代为女性则去除，否则从有胡须的一方继承。发型完全不是生物特征----它是文化选择，所以后代从自己的性别池中选择，尽可能保留发质。

这些都不是发表级遗传学。它是一个感觉层：孩子看起来像是父母双方合理的混合体，而不是两个陌生人简单平均在一起。

## 那些不起眼但很重要的工程细节

有些事情虽然不炫酷，但在代码中占有一席之地：

**更安全的 `pick`。** 原来的版本在空数组上返回 `undefined` 并强制转换为 `T` 类型。在开启了 `strict` + `noUncheckedIndexedAccess` 的 TypeScript 中，这是编译器批准的一个谎言。新版本抛出 `RangeError`----在调用点立即捕获，而不是在三级之后产生 `undefined` 属性。

**不损坏数组的 `deepMerge`。** 原来的递归在源值是对象时就会触发，即使目标槽是 `null` 或数组。`merge({tags: ["a"]}, {tags: ["b"]})` 会产生 `{tags: {0: "b"}}`。新版本只在双方都是普通对象时递归。

**并行批处理渲染。** `batchFactory` 原来使用串行循环渲染 PNG----导出 1000 张卡牌耗时数分钟。现在它是一个工作池，可配置并发数（默认为 4），通过写入预大小数组来保持结果顺序：

```ts
const worker = async () => {
  while (true) {
    const i = nextIndex++;
    if (i >= count) return;
    // render and save
    results[i] = { index: i + 1, filePath, config: clone.getConfig() };
    done++;
    onProgress?.(done, count);
  }
};
await Promise.all(Array.from({ length: concurrency }, () => worker()));
```

在导出 1000 个角色时，这使原本够喝杯咖啡的时间变成了"已经搞定了？"的瞬间。

**有意义的 `sharp` 错误信息。** `buildPng` 使用惰性导入 `sharp`，因为它是类似 peer 的依赖项，你不想强加给仅需 SVG 的用户。原来的 catch 吞掉了真正的错误，总是显示"需要 sharp"。如果真正的失败是版本不匹配或原生绑定问题，你会花十分钟安装一个已经装好的东西。新版本仍然提示你安装它，但会包含底层错误信息。

## 下一步计划

该模块目前是 1.1.1 版本，在 [character-factory 仓库](https://github.com/fox3000foxy/character-factory)中。遗传引擎显然是继续迭代的方向----目前还没有测试套件，所以像"一个巴西东亚混血角色永远不会拥有乌黑眼睛配铂金色头发"这样的连贯不变量只能靠权重来保证。添加 `bun test` 或 `vitest`，编写一个对每个国家运行一万次 `randomizeFromCountry` 调用的一致性测试，是下一步的计划。

Kurekuta 本身目前还是私有的，但你最终看到的每张卡牌都是一个 `CharacterConfig` 数据块，离实际展现就差一次 `buildPng()` 调用。
