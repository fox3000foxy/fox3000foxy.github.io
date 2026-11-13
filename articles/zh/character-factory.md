---
title: 搭建 character-factory：带遗传学的头像
description: 一个构建在 DiceBear 之上的 TypeScript 模块：按国家/族群生成一致的头像，一个能推导孩子的小遗传引擎，以及让它能在卡牌游戏里真正好用的工程细节。
date: 2026-05-16
aiGenerated: true
tags:
  - typescript
  - npm
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "lmu9JoNt7/2eJaNczGGSZoZWa8+YXS//a3UgCkiH3gKPbpEfEq6yzTcgXcVAbSehadIdMJitp8LKuSHMpRFsBA=="
---

# 搭建 character-factory：带遗传系统的头像

[Kurekuta](https://github.com/fox3000foxy/kurekuta/) 需要成千上万张可信又各不相同的人物头像，这是个私有卡牌游戏项目，每张卡存一段人物"DNA"，渲染引擎把它变成肖像。买现成素材包，一眼假。按人物 seed 随机 DiceBear，结果是灾难：日本世界观的卡能抽出金发北欧人，亲"兄妹"长得像陌生人。

于是我写了 [character-factory](https://github.com/fox3000foxy/character-factory)，一个盖在 DiceBear Lorelei 集合上的 TypeScript 模块，补了 DiceBear 本身给不了的三样东西：**人口统计学一致的画像**、**小遗传引擎**、**好用的链式 builder**，在游戏循环里调用很舒服。

## 它能干嘛

最短的有用 snippet：

```ts
import { CharacterFactory, Country, Mood } from "character-factory";

const svg = new CharacterFactory()
  .setCountry(Country.Japan)   // 按族群加权 → 肤色/发色/发型/胡子自洽
  .setMood(Mood.Happy)
  .buildSvg();
```

这一串做了：按日本人口加权抽族群，抽配套的肤色和发色，按性别分组选发型，锁眼/眉/嘴到"开心"态。结果出 SVG，装了 `sharp` 还能出任意尺寸 PNG。

人物就是一个 `CharacterConfig` 对象，脸、头发、饰品、表情。builder 在内部改它，你可以导出 JSON、base64、文件，再原样读回。对 Kurekuta 很关键：卡只存配置，不存渲染图。美术永远可复现，卡面积极小。

## 人口统计学一致，而不是纯随机像素

DiceBear 的选项是均匀选择器。传 `["#ffdbb4", "#2c1b18"]` 当肤色，两个颜色等概率出，做 logo 行，做"给我来个巴西人"不行。

`character-factory` 内置国家 → 族群 → 特征的流水线：

```ts
// 模块里是这样的：
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
  hairColors: [/* 基本黑和深棕，没金发 */],
  hairCuts:   { male: [...], female: [...] },
  beardProbability: 0.15,
};
```

每一层都是加权抽。权重不是社会学论文，是启发式："来自日本"不出红发，"来自瑞典"不出深黑。整条流水线收敛成一个调用：`setCountry(country)` 或 `randomizeFromCountry(country, gender?)`。

## 小遗传引擎

我玩得最开心的函数：`projectChild`。两个 factory 能生孩子，孩子的特征按近似显隐性遗传：

```ts
const parentA = new CharacterFactory().setCountry(Country.Sweden);
const parentB = new CharacterFactory().setCountry(Country.Japan);
const kid     = parentA.projectChild(parentB.getConfig());
```

底层是故意做小的模型。每个亲本带 2 等位基因的基因型，两边各抽一个，按显隐性合并：

```ts
function combine(a: Allele, b: Allele): "dominant" | "recessive" {
  return a === "D" || b === "D" ? "dominant" : "recessive";
}
```

有明确显隐轴的特征（肤、眼、发）走显式排序表，深色压浅色，棕黑眼压蓝眼，深黑发压金发：

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

`resolveByRank` 看双亲的 index，"显性"组合取高的，"隐性"取低的。幻想色（粉、紫）不在表里，50/50 抛硬币，这处理是对的：它们不生物，显隐无意义。

雀斑按 MC1R 建模：双亲都有 75%，一方有 25%，都没有 0%。胡子跟 SRY 走：孩子是女孩直接去掉，否则继承有胡子那方。发型不生物，是文化选择，孩子从自己性别池里抽，尽量保留质感。

这都不是能发论文的遗传学。是手感层：孩子像双亲 plausibly 的混合，不像两个陌生人的平均。

## 不起眼但重要的工程活

几个藏在 diff 里但值得说的细节：

**更安全的 `pick`。** 原版空数组返回 `undefined` 强转 `T`，开了 `strict` + `noUncheckedIndexedAccess` 的 TypeScript 里，这是编译器签字的谎言。新版抛 `RangeError`，在调用处立刻炸，而不是三层之后冒出 `undefined` 的 props。

**不腐蚀数组的 `deepMerge`。** 老递归只要源值是对象就 recurse，哪怕目标是 `null` 或数组。`merge({tags: ["a"]}, {tags: ["b"]})` 得到 `{tags: {0: "b"}}`。新版只在两边都是 plain object 时才 recurse。

**并行批量渲染。** `batchFactory` 原来是串行渲 PNG，导出 1000 张卡要等到天荒地老。现在是 worker 池，可配并发（默认 4），写预分配数组保序：

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

1000 个人物导出，从"去泡咖啡"变成"啊？渲完了？"

**会说话的 `sharp` 报错。** `buildPng` 懒加载 `sharp`，因为是不想强加给纯 SVG 用户的可选依赖。老 catch 吞掉真错误，永远说"sharp is required."。真问题是版本冲突或 native binding 坏掉时，你白重装十分钟。新版照样提示安装，但把底层错误一起带上。

## 下一步

模块在 [character-factory 仓库](https://github.com/fox3000foxy/character-factory) 的 1.1.1。遗传引擎是最值得继续迭代的地方，现在还没测试套件，一致性约束（"东亚血统的巴西人物不会黑眼睛配铂金发"）只靠权重保证。下一步是加上 `bun test` 或 `vitest`，写个一致性测试，每个国家跑一万次 `randomizeFromCountry`。

Kurekuta 本体暂时私有，但以后你看到的每张卡，都只是一个 `CharacterConfig` blob 加一次 `buildPng()`。
