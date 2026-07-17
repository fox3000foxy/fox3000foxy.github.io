---
title: "Construction de character-factory : des avatars avec génétique"
description: "Un module TypeScript par-dessus DiceBear : génération cohérente
  par pays/ethnie, un petit moteur de génétique pour projeter des enfants, et
  les détails d'ingénierie qui l'ont rendu utilisable dans un jeu de cartes."
date: 2026-05-16
aiGenerated: true
tags:
  - typescript
  - npm
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "p6aJKvvF5xbrfBIRvsEs1vOQtqH4XUfGICmaIJ4xMhFB9XeadKisMzRMiQIOSsxOihD5gF44fFH54dfm+ycaug=="
---

# Construire character-factory : des avatars avec un système génétique

J'avais besoin de milliers d'avatars crédibles et distincts pour [Kurekuta](https://github.com/fox3000foxy/kurekuta/) -- un projet de jeu de cartes privé où chaque carte contient un "ADN" de personnage que le moteur de rendu transforme en portrait. Acheter un pack tout fait, ça se serait vu. Générer des avatars DiceBear au seed par personnage, ça donnait du n'importe quoi : une carte à l'univers japonais pouvait tomber sur une blonde scandinave, et deux "frères et sœurs" ressemblaient à des inconnus.

J'ai donc écrit [character-factory](https://github.com/fox3000foxy/character-factory) -- un module TypeScript par-dessus la collection Lorelei de DiceBear qui apporte trois trucs que DiceBear seul ne donne pas : **des profils démographiques cohérents**, **un petit moteur de génétique**, et **un builder fluide** agréable à utiliser depuis une boucle de jeu.

## Ce que ça fait

Le plus petit snippet utile :

```ts
import { CharacterFactory, Country, Mood } from "character-factory";

const svg = new CharacterFactory()
  .setCountry(Country.Japan)   // ethnicité pondérée → peau/cheveux/coupe/barbe cohérents
  .setMood(Mood.Happy)
  .buildSvg();
```

Cette simple chaîne pioche une ethnie pondérée par la démographie japonaise, tire un teint et une couleur de cheveux qui vont ensemble, choisit une coupe dans le bon sous-groupe de genre, puis verrouille les yeux/sourcils/bouche en mode "joyeux". Le résultat sort en SVG ou, avec `sharp` installé, en PNG à n'importe quelle taille.

Un personnage n'est qu'un objet `CharacterConfig` -- visage, cheveux, accessoires, présentation. Le builder le modifie en interne, et tu peux l'exporter en JSON, base64 ou fichier, puis le recharger à l'identique. Pour Kurekuta c'est crucial : une carte stocke la config, pas l'image rendue. Du coup l'art est toujours reproductible et la taille d'une carte reste minuscule.

## Des profils démographiques cohérents, pas du pixel aléatoire

Les options DiceBear sont des sélecteurs uniformes. Passe `["#ffdbb4", "#2c1b18"]` pour la couleur de peau et t'auras l'un ou l'autre avec la même probabilité -- OK pour un logo, inutile pour "donne-moi un personnage du Brésil."

`character-factory` embarque un pipeline pays → ethnicité → traits :

```ts
// Ce qu'il y a dans le module :
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
  hairColors: [/* surtout noir/brun foncé, pas de blond */],
  hairCuts:   { male: [...], female: [...] },
  beardProbability: 0.15,
};
```

Chaque couche est un tirage pondéré. Les poids ne sont pas une thèse de socio -- c'est une heuristique qui empêche "venu du Japon" de produire un roux et "venu de Suède" de produire un noir de jais. Tout le pipeline se résume à un seul appel : `setCountry(country)` ou `randomizeFromCountry(country, gender?)`.

## Un petit moteur de génétique

La fonction sur laquelle je me suis le plus amusé : `projectChild`. Deux factories peuvent produire un enfant dont les traits sont hérités avec une dominance biologique approximative :

```ts
const parentA = new CharacterFactory().setCountry(Country.Sweden);
const parentB = new CharacterFactory().setCountry(Country.Japan);
const kid     = parentA.projectChild(parentB.getConfig());
```

Sous le capot, c'est un modèle volontairement minuscule. Chaque parent porte un génotype à 2 allèles, un tiré de chaque côté, combiné en dominant ou récessif :

```ts
function combine(a: Allele, b: Allele): "dominant" | "recessive" {
  return a === "D" || b === "D" ? "dominant" : "recessive";
}
```

Les traits qui ont un vrai axe de dominance (peau, yeux, cheveux) sont résolus par une liste ordonnée explicite -- le foncé domine le clair, les yeux marron/noir dominent le bleu, le noir de jais domine le blond :

```ts
const HAIR_DOMINANCE_ORDER = [
  HairColor.LightBlonde,   // le plus récessif
  HairColor.GoldenBlonde,
  HairColor.HoneyBlonde,
  HairColor.Auburn,
  HairColor.Red,
  HairColor.Copper,
  HairColor.LightBrown,
  HairColor.Brown,
  HairColor.DarkBrown,
  HairColor.SoftBlack,
  HairColor.JetBlack,      // le plus dominant
] as const;
```

`resolveByRank` trouve l'index de chaque parent, prend le plus élevé sur une combinaison d'allèles "dominante" et le plus bas sur "récessive". Les couleurs fantasy (rose pastel, lilas) ne sont pas dans l'ordre -- elles font un pile ou face 50/50, ce qui est le bon comportement : elles ne sont pas biologiques, donc la dominance n'a pas de sens.

Les taches de rousseur modélisent MC1R : 75 % si les deux parents en ont, 25 % si un seul en porte, 0 % si aucun. La barbe est liée au SRY : retirée si l'enfant est une femme, sinon héritée du parent qui en avait une. La coupe de cheveux n'a rien de biologique -- c'est un choix culturel, donc l'enfant pioche dans son propre pool de genre, en préservant la texture si possible.

Rien de tout ça n'est de la génétique digne d'une publication. C'est une couche de ressenti : les gamins ressemblent à un mélange plausible de leurs parents, pas à la moyenne de deux inconnus.

## Les parties ingénierie moins glamour qui ont compté

Quelques trucs pas flashy mais qui ont mérité leur place dans le diff :

**Un `pick` plus sûr.** L'original renvoyait `undefined` casté en `T` sur un tableau vide. Avec `strict` + `noUncheckedIndexedAccess` en TypeScript, c'est un mensonge que le compilateur signe. La nouvelle version lance une `RangeError` -- attrapée immédiatement au site d'appel au lieu de produire des props `undefined` trois niveaux plus bas.

**Un `deepMerge` qui ne corrompt pas les tableaux.** L'ancienne récursion s'activait dès que la valeur source était un objet, même si la cible était `null` ou un tableau. `merge({tags: ["a"]}, {tags: ["b"]})` produisait `{tags: {0: "b"}}`. La nouvelle version ne récure que quand les deux côtés sont des objets simples.

**Rendu batch en parallèle.** `batchFactory` rendait les PNG en boucle sérialisée -- une exportation de 1000 cartes prenait des plombes. C'est maintenant un pool de workers avec une concurrence configurable (4 par défaut), qui préserve l'ordre des résultats en écrivant dans un tableau pré-dimensionné :

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

Sur une exportation de 1000 personnages, ça a transformé une pause-café en un "c'est déjà fini ?"

**Un message d'erreur `sharp` qui dit quelque chose.** `buildPng` importe `sharp` en paresseux parce que c'est une dépendance optionnelle que tu ne veux pas imposer aux utilisateurs SVG-only. L'ancien catch avalait la vraie erreur et disait toujours "sharp is required." Si l'échec réel était un conflit de version ou un problème de bindings natifs, tu passais dix minutes à réinstaller un truc déjà installé. La nouvelle version te dit toujours de l'installer, mais inclut l'erreur sous-jacente.

## La suite

Le module est en 1.1.1 sur le [dépôt character-factory](https://github.com/fox3000foxy/character-factory). Le moteur génétique est l'endroit idéal pour continuer d'itérer -- il n'y a pas encore de suite de tests, donc les invariants de cohérence ("un personnage brésilien d'ascendance est-asiatique n'aura jamais les yeux noirs de jais avec des cheveux platine") ne sont assurés que par les poids. Ajouter `bun test` ou `vitest` et écrire un test de cohérence qui lance dix mille `randomizeFromCountry` par pays, c'est la prochaine étape.

Kurekuta lui-même est privé pour l'instant, mais chaque carte que tu verras un jour dedans n'est qu'un blob `CharacterConfig` et un `buildPng()` d'exister.
