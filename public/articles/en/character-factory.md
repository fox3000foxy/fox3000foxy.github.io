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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "Ar3v9aLwu2vuUpr6DwfAqOLchgiN1oAbb3i5AOja9VC++UR4Wg7+rgdyRXL8m4yjbufN7SwGDFaYbmYOAz4daw=="
---

# Building character-factory: avatars with genetics

I needed thousands of believable, distinct avatars for [Kurekuta](https://github.com/fox3000foxy/kurekuta/) -- a private card game project where every card holds a character "DNA" that the renderer turns into a portrait. Buying a stock pack would have looked stock. Generating one-off DiceBear avatars per seed felt random in the wrong way: a Japanese-flavored card could land on a Scandinavian blonde, and two "siblings" looked like strangers.

So I wrote [character-factory](https://github.com/fox3000foxy/character-factory) -- a TypeScript module on top of DiceBear's Lorelei collection that adds three things DiceBear alone doesn't give you: **coherent demographics**, **a small genetics engine**, and **a fluent builder** that's nice to use from a game loop.

## What it does

The smallest useful snippet:

```ts
import { CharacterFactory, Country, Mood } from "character-factory";

const svg = new CharacterFactory()
  .setCountry(Country.Japan)   // weighted ethnicity → coherent skin/hair/cut/beard
  .setMood(Mood.Happy)
  .buildSvg();
```

That single chain picks an ethnicity weighted by Japan's demographic mix, draws a skin tone and hair color that go together, picks a hairstyle from the right gender sub-pool, then locks the eyes/eyebrows/mouth into a "happy" combination. The result renders as SVG or, with `sharp` installed, as a PNG of any size.

A character is just a `CharacterConfig` object -- face, hair, accessories, presentation. The builder mutates one internally, and you can pull it out as JSON, base64, or a file, and reload it the same way. For Kurekuta this matters: a card stores the config, not the rendered image, so the art is always reproducible and the file size of a card stays tiny.

## Coherent demographics, not just random pixels

DiceBear's options are uniform pickers. Pass `["#ffdbb4", "#2c1b18"]` for skin color and you'll get either with equal odds -- fine for a logo, useless for "give me a character from Brazil."

`character-factory` ships a country → ethnicity → traits pipeline:

```ts
// What's actually in the module:
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
  hairColors: [/* mostly black/dark brown, no blonde */],
  hairCuts:   { male: [...], female: [...] },
  beardProbability: 0.15,
};
```

Each layer is a weighted draw. The weights aren't a sociology paper -- they're a heuristic that keeps "from Japan" from producing a redhead and "from Sweden" from producing jet-black hair. The whole pipeline collapses into one call: `setCountry(country)` or `randomizeFromCountry(country, gender?)`.

## A small genetics engine

The feature I had the most fun with: `projectChild`. Two factories can produce a child whose traits are inherited with rough biological dominance:

```ts
const parentA = new CharacterFactory().setCountry(Country.Sweden);
const parentB = new CharacterFactory().setCountry(Country.Japan);
const kid     = parentA.projectChild(parentB.getConfig());
```

Under the hood it's a deliberately tiny model. Each parent is treated as carrying a 2-allele genotype, one drawn from each side, combined into dominant or recessive:

```ts
function combine(a: Allele, b: Allele): "dominant" | "recessive" {
  return a === "D" || b === "D" ? "dominant" : "recessive";
}
```

Traits that have a real dominance axis (skin, eyes, hair) are resolved against an explicit ordered list -- darker dominant over lighter, brown/black eyes dominant over blue, jet black hair dominant over blonde:

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

`resolveByRank` finds each parent's index, picks the higher one on a "dominant" allele combination and the lower one on "recessive." Fantasy colors (pastel pink, lilac) aren't in the order -- they fall back to a 50/50 coin flip, which is the right behavior: they aren't biological, so dominance can't mean anything.

Freckles model MC1R: 75% if both parents have them, 25% if only one carries, 0% if neither. Beard is SRY-linked: stripped if the child is female, otherwise inherited from whichever parent had one. Hairstyle isn't biological at all -- it's a cultural choice, so the child picks from their own gender pool, preserving texture if possible.

None of this is publication-grade genetics. It's a feel layer: kids look like a plausible mix of their parents instead of two strangers averaged together.

## The boring engineering parts that mattered

A few things that aren't flashy but earned their space in the diff:

**A safer `pick`.** The original returned `undefined` cast as `T` on an empty array. With `strict` + `noUncheckedIndexedAccess` in TypeScript, that's a lie the compiler signs off on. New version throws a `RangeError` -- caught immediately at the call site instead of producing `undefined` props three levels down.

**A `deepMerge` that doesn't corrupt arrays.** The old recursion fired whenever the source value was an object, even if the target slot was `null` or an array. `merge({tags: ["a"]}, {tags: ["b"]})` produced `{tags: {0: "b"}}`. The new version only recurses when both sides are plain objects.

**Parallel batch rendering.** `batchFactory` used to render PNGs in a serial loop -- a 1000-card export ran for minutes. It's now a worker pool with a configurable concurrency (default 4), preserving result order by writing into a pre-sized array:

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

On a 1000-character export this turned a coffee break into a "did it already finish?" moment.

**A `sharp` error message that says something.** `buildPng` lazy-imports `sharp` because it's a peer-ish dependency you don't want to force on SVG-only users. The old catch swallowed the real error and always said "sharp is required." If the real failure was a version mismatch or a native binding problem, you'd spend ten minutes installing something that was already installed. New version still tells you to install it, but includes the underlying error.

## What's next

The module is at 1.1.1 on the [character-factory repo](https://github.com/fox3000foxy/character-factory). The genetics engine is the obvious place to keep iterating -- there's no test suite yet, so coherent invariants ("a Brazilian East-Asian-leaning character never has jet-black eyes paired with platinum hair") are only enforced by the weights. Adding `bun test` or `vitest` and writing a coherence test that runs ten thousand `randomizeFromCountry` calls per country is the next step.

Kurekuta itself is private for now, but every card you'll eventually see in it is a `CharacterConfig` blob and one `buildPng()` call away from existing.
