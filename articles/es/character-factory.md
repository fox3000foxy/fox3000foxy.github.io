---
title: "Construyendo character-factory: avatares con genética"
description: "Un módulo TypeScript sobre DiceBear: generación coherente por
  país/etnia, un pequeño motor de genética para proyectar hijos, y
  los detalles de ingeniería que lo hicieron usable en un juego de cartas."
date: 2026-05-16
aiGenerated: true
tags:
  - typescript
  - npm
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "W9h88wooDp8zvRWchz0mMV5NYg8JgxIrLcEiKShP6n1PUNqLoEEgGeMyb4RhhH0hV/EP0fdWUe/BeXrs2hS4+A=="
---

# Construir character-factory: avatares con un sistema genético

Necesitaba miles de avatares creíbles y distintos para [Kurekuta](https://github.com/fox3000foxy/kurekuta/): un proyecto privado de juego de cartas donde cada carta contiene un "ADN" de personaje que el motor de render transforma en retrato. Comprar un pack ya hecho se habría notado. Generar avatares DiceBear con seed por personaje daba cualquier cosa: una carta de universo japonés podía caer en una rubia escandinava, y dos "hermanos" parecían desconocidos.

Así que escribí [character-factory](https://github.com/fox3000foxy/character-factory): un módulo TypeScript sobre la colección Lorelei de DiceBear que aporta tres funciones que DiceBear solo no da: **perfiles demográficos coherentes**, **un pequeño motor de genética**, y **un builder fluido** agradable de usar desde un bucle de juego.

## Qué hace

El snippet útil más pequeño:

```ts
import { CharacterFactory, Country, Mood } from "character-factory";

const svg = new CharacterFactory()
  .setCountry(Country.Japan)   // etnia ponderada → piel/pelo/corte/barba coherentes
  .setMood(Mood.Happy)
  .buildSvg();
```

Esta simple cadena elige una etnia ponderada por la demografía japonesa, saca un tono de piel y un color de pelo que combinan, elige un corte en el subgrupo de género correcto, y luego fija ojos/cejas/boca en modo "alegre". El resultado sale en SVG o, con `sharp` instalado, en PNG a cualquier tamaño.

Un personaje no es más que un objeto `CharacterConfig`: cara, pelo, accesorios, presentación. El builder lo modifica internamente, y puedes exportarlo en JSON, base64 o archivo, y recargarlo idéntico. Para Kurekuta es crucial: una carta guarda la config, no la imagen renderizada. Así el arte siempre es reproducible y el tamaño de una carta queda minúsculo.

## Perfiles demográficos coherentes, no píxel aleatorio

Las opciones de DiceBear son selectores uniformes. Pasa `["#ffdbb4", "#2c1b18"]` para el color de piel y tendrás uno u otro con la misma probabilidad: OK para un logo, inútil para "dame un personaje de Brasil".

`character-factory` incluye un pipeline país → etnia → rasgos:

```ts
// Lo que hay en el módulo:
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
  hairColors: [/* sobre todo negro/castaño oscuro, nada de rubio */],
  hairCuts:   { male: [...], female: [...] },
  beardProbability: 0.15,
};
```

Cada capa es un sorteo ponderado. Los pesos no son una tesis de sociología: es una heurística que impide que "venido de Japón" produzca un pelirrojo y que "venido de Suecia" produzca un negro azabache. Todo el pipeline se resume en una sola llamada: `setCountry(country)` o `randomizeFromCountry(country, gender?)`.

## Un pequeño motor de genética

La función con la que más me divertí: `projectChild`. Dos factories pueden producir un hijo cuyos rasgos se heredan con una dominancia biológica aproximada:

```ts
const parentA = new CharacterFactory().setCountry(Country.Sweden);
const parentB = new CharacterFactory().setCountry(Country.Japan);
const kid     = parentA.projectChild(parentB.getConfig());
```

Bajo el capó, es un modelo deliberadamente minúsculo. Cada padre lleva un genotipo de 2 alelos, uno sacado de cada lado, combinado en dominante o recesivo:

```ts
function combine(a: Allele, b: Allele): "dominant" | "recessive" {
  return a === "D" || b === "D" ? "dominant" : "recessive";
}
```

Los rasgos que tienen un verdadero eje de dominancia (piel, ojos, pelo) se resuelven con una lista ordenada explícita: lo oscuro domina lo claro, los ojos marrones/negros dominan el azul, el negro azabache domina el rubio:

```ts
const HAIR_DOMINANCE_ORDER = [
  HairColor.LightBlonde,   // el más recesivo
  HairColor.GoldenBlonde,
  HairColor.HoneyBlonde,
  HairColor.Auburn,
  HairColor.Red,
  HairColor.Copper,
  HairColor.LightBrown,
  HairColor.Brown,
  HairColor.DarkBrown,
  HairColor.SoftBlack,
  HairColor.JetBlack,      // el más dominante
] as const;
```

`resolveByRank` encuentra el índice de cada padre, toma el más alto en una combinación de alelos "dominante" y el más bajo en "recesiva". Los colores fantasía (rosa pastel, lila) no están en el orden: hacen un cara o cruz 50/50, que es el comportamiento correcto: no son biológicos, así que la dominancia no tiene sentido.

Las pecas modelan MC1R: 75% si ambos padres las tienen, 25% si solo uno las lleva, 0% si ninguno. La barba está ligada al SRY: se quita si el hijo es mujer, si no se hereda del padre que la tenía. El corte de pelo no tiene nada de biológico: es una elección cultural, así que el hijo elige de su propio pool de género, conservando la textura si es posible.

Nada de esto es genética digna de publicación. Es una capa de sensación: los críos parecen una mezcla plausible de sus padres, no la media de dos desconocidos.

## Las partes de ingeniería menos glamurosas que contaron

Algunos detalles poco visibles pero que merecieron su sitio en el diff:

**Un `pick` más seguro.** El original devolvía `undefined` casteado a `T` sobre un array vacío. Con `strict` + `noUncheckedIndexedAccess` en TypeScript, es una mentira que firma el compilador. La nueva versión lanza un `RangeError`: capturado de inmediato en el sitio de llamada en vez de producir props `undefined` tres niveles más abajo.

**Un `deepMerge` que no corrompe los arrays.** La vieja recursión se activaba en cuanto el valor fuente era un objeto, aunque el destino fuera `null` o un array. `merge({tags: ["a"]}, {tags: ["b"]})` producía `{tags: {0: "b"}}`. La nueva versión solo recurre cuando ambos lados son objetos simples.

**Render batch en paralelo.** `batchFactory` renderizaba los PNG en bucle serializado: una exportación de 1000 cartas tardaba una eternidad. Ahora es un pool de workers con concurrencia configurable (4 por defecto), que conserva el orden de los resultados escribiendo en un array predimensionado:

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

En una exportación de 1000 personajes, eso transformó una pausa para el café en un "¿ya terminó?".

**Un mensaje de error `sharp` que dice algo.** `buildPng` importa `sharp` de forma perezosa porque es una dependencia opcional que no quieres imponer a los usuarios solo-SVG. El viejo catch tragaba el error real y siempre decía "sharp is required." Si el fallo real era un conflicto de versión o un problema de bindings nativos, pasabas diez minutos reinstalando un paquete ya instalado. La nueva versión te sigue diciendo que lo instales, pero incluye el error subyacente.

## Lo que sigue

El módulo está en la 1.1.1 en el [repo character-factory](https://github.com/fox3000foxy/character-factory). El motor genético es el sitio ideal para seguir iterando: aún no hay suite de tests, así que los invariantes de coherencia ("un personaje brasileño de ascendencia esteasiática nunca tendrá ojos negro azabache con pelo platino") solo los aseguran los pesos. Añadir `bun test` o `vitest` y escribir un test de coherencia que lance diez mil `randomizeFromCountry` por país es el próximo paso.

Kurekuta en sí es privado por ahora, pero cada carta que veas algún día ahí dentro no es más que un blob `CharacterConfig` y un `buildPng()` de existir.
