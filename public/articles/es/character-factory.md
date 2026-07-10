---
title: "Construyendo character-factory: avatares con genética"
description: "Un módulo de TypeScript sobre DiceBear: generación coherente
  basada en país/etnia, un pequeño motor genético para proyectar hijos, y los
  detalles de ingeniería que lo hicieron usable en un juego de cartas."
date: 2026-05-16
aiGenerated: true
tags:
  - typescript
  - npm
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "VAuUtSnfnF8I+0BjUJua0diCWRxAqxPRwMfglBCjThcRK+FCxW3tErB+h3XKvGNy5e8MiEvVuMidMIkys+1VTw=="
---

# Construyendo character-factory: avatares con genética

Necesitaba miles de avatares creíbles y distintos para [Kurekuta](https://github.com/fox3000foxy/kurekuta/) -- un proyecto privado de juego de cartas donde cada carta contiene un «ADN» de personaje que el renderizador convierte en un retrato. Comprar un paquete de stock se habría visto genérico. Generar avatares únicos de DiceBear por semilla se sentía aleatorio de la manera incorrecta: una carta de temática japonesa podía dar con una escandinava rubia, y dos «hermanos» parecían desconocidos.

Así que escribí [character-factory](https://github.com/fox3000foxy/character-factory) -- un módulo de TypeScript sobre la colección Lorelei de DiceBear que añade tres cosas que DiceBear solo no te da: **demografía coherente**, **un pequeño motor de genética** y **un builder fluido** que es agradable de usar desde un bucle de juego.

## Lo que hace

El fragmento útil más pequeño:

```ts
import { CharacterFactory, Country, Mood } from "character-factory";

const svg = new CharacterFactory()
  .setCountry(Country.Japan)   // etnia ponderada → piel/cabello/corte/barba coherentes
  .setMood(Mood.Happy)
  .buildSvg();
```

Esa sola cadena elige una etnia ponderada por la mezcla demográfica de Japón, selecciona un tono de piel y color de cabello que combinen, elige un peinado del subconjunto de género correcto, y luego fija los ojos/cejas/boca en una combinación «feliz». El resultado se renderiza como SVG o, con `sharp` instalado, como PNG de cualquier tamaño.

Un personaje es solo un objeto `CharacterConfig` -- rostro, cabello, accesorios, presentación. El builder lo muta internamente, y puedes extraerlo como JSON, base64 o un archivo, y recargarlo de la misma manera. Para Kurekuta esto importa: una carta almacena la configuración, no la imagen renderizada, así que el arte siempre es reproducible y el tamaño de archivo de una carta se mantiene mínimo.

## Demografía coherente, no solo píxeles aleatorios

Las opciones de DiceBear son selectores uniformes. Pasa `["#ffdbb4", "#2c1b18"]` para el color de piel y obtendrás cualquiera con las mismas probabilidades -- bien para un logo, inútil para «dame un personaje de Brasil».

`character-factory` trae un pipeline país → etnia → rasgos:

```ts
// Lo que realmente está en el módulo:
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
  hairColors: [/* mayormente negro/marrón oscuro, sin rubio */],
  hairCuts:   { male: [...], female: [...] },
  beardProbability: 0.15,
};
```

Cada capa es una selección ponderada. Los pesos no son un artículo de sociología -- son una heurística que evita que «de Japón» produzca una pelirroja y «de Suecia» produzca cabello negro azabache. Todo el pipeline se reduce a una llamada: `setCountry(country)` o `randomizeFromCountry(country, gender?)`.

## Un pequeño motor de genética

La funcionalidad con la que más me divertí: `projectChild`. Dos fábricas pueden producir un hijo cuyos rasgos se heredan con dominancia biológica aproximada:

```ts
const parentA = new CharacterFactory().setCountry(Country.Sweden);
const parentB = new CharacterFactory().setCountry(Country.Japan);
const kid     = parentA.projectChild(parentB.getConfig());
```

Bajo el capó es un modelo deliberadamente pequeño. Cada progenitor se trata como portador de un genotipo de 2 alelos, uno extraído de cada lado, combinado en dominante o recesivo:

```ts
function combine(a: Allele, b: Allele): "dominant" | "recessive" {
  return a === "D" || b === "D" ? "dominant" : "recessive";
}
```

Los rasgos que tienen un eje de dominancia real (piel, ojos, cabello) se resuelven contra una lista ordenada explícita -- más oscuro dominante sobre más claro, ojos marrones/negros dominantes sobre azules, cabello negro azabache dominante sobre rubio:

```ts
const HAIR_DOMINANCE_ORDER = [
  HairColor.LightBlonde,   // más recesivo
  HairColor.GoldenBlonde,
  HairColor.HoneyBlonde,
  HairColor.Auburn,
  HairColor.Red,
  HairColor.Copper,
  HairColor.LightBrown,
  HairColor.Brown,
  HairColor.DarkBrown,
  HairColor.SoftBlack,
  HairColor.JetBlack,      // más dominante
] as const;
```

`resolveByRank` encuentra el índice de cada progenitor, elige el más alto en una combinación de alelos «dominante» y el más bajo en «recesivo». Los colores fantásticos (rosa pastel, lila) no están en el orden -- recurren a un volado 50/50, que es el comportamiento correcto: no son biológicos, así que la dominancia no puede significar nada.

Las pecas modelan MC1R: 75% si ambos padres las tienen, 25% si solo uno porta, 0% si ninguno. La barba está ligada a SRY: se elimina si el hijo es mujer, de lo contrario se hereda del progenitor que tuviera barba. El peinado no es biológico en absoluto -- es una elección cultural, así que el hijo elige de su propio conjunto de género, preservando la textura si es posible.

Nada de esto es genética de publicación académica. Es una capa de sensación: los hijos se ven como una mezcla plausible de sus padres en lugar de dos desconocidos promediados.

## Las partes de ingeniería aburridas que importaron

Algunas cosas que no son llamativas pero se ganaron su espacio en el diff:

**Un `pick` más seguro.** El original devolvía `undefined` casteado como `T` en un array vacío. Con `strict` + `noUncheckedIndexedAccess` en TypeScript, eso es una mentira que el compilador aprueba. La nueva versión lanza un `RangeError` -- atrapado inmediatamente en el lugar de la llamada en lugar de producir props `undefined` tres niveles más abajo.

**Un `deepMerge` que no corrompe arrays.** La recursión antigua se disparaba cuando el valor fuente era un objeto, incluso si el destino era `null` o un array. `merge({tags: ["a"]}, {tags: ["b"]})` producía `{tags: {0: "b"}}`. La nueva versión solo recurre cuando ambos lados son objetos planos.

**Renderizado por lotes en paralelo.** `batchFactory` solía renderizar PNGs en un bucle serial -- una exportación de 1000 cartas se ejecutaba durante minutos. Ahora es un pool de workers con concurrencia configurable (por defecto 4), preservando el orden de los resultados escribiendo en un array pre-dimensionado:

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

En una exportación de 1000 personajes, esto convirtió una pausa para el café en un momento de «¿ya terminó?».

**Un mensaje de error de `sharp` que dice algo.** `buildPng` importa `sharp` de forma diferida porque es una dependencia «peer-ish» que no quieres forzar a usuarios solo de SVG. El antiguo catch se tragaba el error real y siempre decía «sharp es necesario». Si el fallo real era una incompatibilidad de versión o un problema de enlace nativo, pasabas diez minutos instalando algo que ya estaba instalado. La nueva versión aún te dice que lo instales, pero incluye el error subyacente.

## Lo que sigue

El módulo está en la versión 1.1.1 en el [repositorio de character-factory](https://github.com/fox3000foxy/character-factory). El motor de genética es el lugar obvio para seguir iterando -- todavía no hay suite de pruebas, así que los invariantes coherentes («un personaje brasileño de ascendencia asiática nunca tiene ojos negro azabache con cabello platino») solo se aplican mediante los pesos. Añadir `bun test` o `vitest` y escribir una prueba de coherencia que ejecute diez mil llamadas `randomizeFromCountry` por país es el siguiente paso.

Kurekuta en sí mismo es privado por ahora, pero cada carta que eventualmente veas en él es un blob `CharacterConfig` a una llamada `buildPng()` de distancia de existir.
