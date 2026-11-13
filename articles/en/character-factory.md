---
title: "Building character-factory: avatars with genetics"
description: "A TypeScript module on top of DiceBear: coherent
  country/ethnicity-based generation, a small genetics engine for projecting
  children, and the engineering details that made it usable in a card game."
date: 2026-05-16
aiGenerated: true
tags:
  - typescript
  - npm
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "dP2H46GnSP+GvCHkHE1TSFzWrhd2VJwarqX/docaHsKz4Qs3VXTcqckksuT5SFD2/rCQ0ZhgRUX922cvpbsw8A=="
---

# Building character-factory: avatars with a genetics system

I needed thousands of believable, distinct avatars for [Kurekuta](https://github.com/fox3000foxy/kurekuta/) -- a private card game project where each card holds a character "DNA" blob that the render engine turns into a portrait. Buying a ready-made pack would have looked off. Generating DiceBear avatars seeded per character gave nonsense: a card with a Japanese setting could land on a Scandinavian blonde, and two "siblings" looked like strangers.

So I wrote [character-factory](https://github.com/fox3000foxy/character-factory) -- a TypeScript module on top of the DiceBear Lorelei collection that adds three things DiceBear alone does not give you: **coherent demographic profiles**, **a small genetics engine**, and **a fluent builder** that feels good to use from a game loop.

## What it does

The smallest useful snippet:

```ts
import { CharacterFactory, Country, Mood } from "character-factory";

const svg = new CharacterFactory()
  .setCountry(Country.Japan)   // weighted ethnicity → coherent skin/haircut/beard
  .setMood(Mood.Happy)
  .buildSvg();
```

That single chain picks a weighted ethnicity from Japanese demographics, draws a skin tone and hair color that go together, picks a haircut from the right gender subgroup, then locks eyes/eyebrows/mouth into "happy" mode. The result comes out as SVG or, with `sharp` installed, as PNG at any size.

A character is just a `CharacterConfig` object -- face, hair, accessories, presentation. The builder mutates it internally, and you can export it as JSON, base64, or file, then reload it identically. For Kurekuta that matters: a card stores the config, not the rendered image. So the art is always reproducible and a card stays tiny.

## Coherent demographic profiles, not random pixels

DiceBear options are uniform selectors. Pass `["#ffdbb4", "#2c1b18"]` for skin color and you get one or the other with equal probability -- fine for a logo, useless for "give me someone from Brazil."

`character-factory` ships a country → ethnicity → traits pipeline:

```ts
// What's in the module:
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
  hairColors: [/* mostly black/dark brown, no blond */],
  hairCuts:   { male: [...], female: [...] },
  beardProbability: 0.15,
};
```

Each layer is a weighted draw. The weights are not a sociology thesis -- they're a heuristic that stops "from Japan" from producing a redhead and "from Sweden" from producing jet black. The whole pipeline boils down to one call: `setCountry(country)` or `randomizeFromCountry(country, gender?)`.

## A small genetics engine

The function I had the most fun with: `projectChild`. Two factories can produce a child whose traits are inherited with approximate biological dominance:

```ts
const parentA = new CharacterFactory().setCountry(Country.Sweden);
const parentB = new CharacterFactory().setCountry(Country.Japan);
const kid     = parentA.projectChild(parentB.getConfig());
```

Under the hood, it's a deliberately tiny model. Each parent carries a 2-allele genotype, one drawn from each side, combined into dominant or recessive:

```ts
function combine(a: Allele, b: Allele): "dominant" | "recessive" {
  return a === "D" || b === "D" ? "dominant" : "recessive";
}
```

Traits with a real dominance axis (skin, eyes, hair) resolve through an explicit ordered list -- dark dominates light, brown/black eyes dominate blue, jet black dominates blond:

```ts
const HAIR_DOMINANCE_ORDER = [
  HairColor.LightBlonde,   // most recessive
  HairColor.GoldenBlonde,
  HairColor.HoneyBlonde,
  HairColor.Auburn,
  HairColor.Red,
  HairColor.Copper,
  HairColor.LightBrown,
  HairColor.Brown,
  HairColor.DarkBrown,
  HairColor.SoftBlack,
  HairColor.JetBlack,      // most dominant
] as const;
```

`resolveByRank` finds each parent's index, takes the highest on a "dominant" allele combination and the lowest on "recessive". Fantasy colors (pastel pink, lilac) are not in the order -- they do a 50/50 coin flip, which is the right behavior: they're not biological, so dominance makes no sense.

Freckles model MC1R: 75% if both parents have them, 25% if one carries them, 0% if neither. Beards are SRY-linked: dropped if the child is female, otherwise inherited from whichever parent had one. Haircuts are not biological at all -- it's a cultural choice, so the child picks from its own gender pool, preserving texture when possible.

None of this is publication-grade genetics. It's a feel layer: kids look like a plausible mix of their parents, not the average of two strangers.

## The less glamorous engineering parts that mattered

A few low-visibility details that still earned their place in the diff:

**A safer `pick`.** The original returned `undefined` cast as `T` on an empty array. With `strict` + `noUncheckedIndexedAccess` in TypeScript, that's a lie the compiler signs off on. The new version throws a `RangeError` -- caught immediately at the call site instead of producing `undefined` props three levels down.

**A `deepMerge` that does not corrupt arrays.** The old recursion kicked in whenever the source value was an object, even when the target was `null` or an array. `merge({tags: ["a"]}, {tags: ["b"]})` produced `{tags: {0: "b"}}`. The new version only recurses when both sides are plain objects.

**Parallel batch rendering.** `batchFactory` rendered PNGs in a serialized loop -- a 1000-card export took forever. It's now a worker pool with configurable concurrency (4 by default), preserving result order by writing into a pre-sized array:

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

On a 1000-character export, that turned a coffee break into a "wait, it's done already?"

**A `sharp` error message that actually says something.** `buildPng` lazily imports `sharp` because it's an optional dependency you don't want to force on SVG-only users. The old catch swallowed the real error and always said "sharp is required." If the actual failure was a version conflict or a broken native binding, you spent ten minutes reinstalling an already-installed package. The new version still tells you to install it, but includes the underlying error.

## What's next

The module is at 1.1.1 on the [character-factory repo](https://github.com/fox3000foxy/character-factory). The genetics engine is the ideal place to keep iterating -- there's no test suite yet, so coherence invariants ("a Brazilian character of East-Asian descent will never get jet-black eyes with platinum hair") are only enforced by the weights. Adding `bun test` or `vitest` and writing a coherence test that runs ten thousand `randomizeFromCountry` per country is the next step.

Kurekuta itself is private for now, but every card you'll ever see in it is just a `CharacterConfig` blob and a `buildPng()` away from existing.
