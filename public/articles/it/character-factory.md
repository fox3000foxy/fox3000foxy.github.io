---
title: "Costruire character-factory: avatar con la genetica"
description: "Un modulo TypeScript basato su DiceBear: generazione coerente
  paese/etnia, un piccolo motore genetico per proiettare figli, e i dettagli
  ingegneristici che lo hanno reso utilizzabile in un gioco di carte."
date: 2026-05-16
aiGenerated: true
authors:
  - fox3000foxy
tags:
  - typescript
  - npm
  - open-source
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "P0xkJeMIczYaFHdb7VbVXs+dwkZJMktxu/cJHM/6f2ah6st3TNfhV3aAIaXKcxwy6oPLWkPOklVs9wL/mBG4sw=="
---

# Costruire character-factory: avatar con la genetica

Mi servivano migliaia di avatar credibili e distinti per [Kurekuta](https://github.com/fox3000foxy/kurekuta/) -- un progetto di gioco di carte privato dove ogni carta contiene un "DNA" del personaggio che il renderer trasforma in un ritratto. Comprare un pacchetto stock sarebbe stato troppo banale. Generare avatar DiceBear casuali per seed sembrava casuale nel modo sbagliato: una carta in stile giapponese poteva capitare su una bionda scandinava, e due "fratelli" sembravano estranei.

Così ho scritto [character-factory](https://github.com/fox3000foxy/character-factory) -- un modulo TypeScript basato sulla collezione Lorelei di DiceBear che aggiunge tre cose che DiceBear da solo non offre: **demografie coerenti**, **un piccolo motore genetico**, e **un builder fluido** che è piacevole da usare in un loop di gioco.

## Cosa fa

Il frammento più piccolo utile:

```ts
import { CharacterFactory, Country, Mood } from "character-factory";

const svg = new CharacterFactory()
  .setCountry(Country.Japan)   // etnia pesata → carnagione/capelli/taglio/barba coerenti
  .setMood(Mood.Happy)
  .buildSvg();
```

Quella singola catena sceglie un'etnia pesata in base alla composizione demografica del Giappone, abbina un tono della pelle e un colore di capelli che stanno bene insieme, sceglie un taglio di capelli dal sotto-gruppo di genere corretto, e blocca occhi/sopracciglia/bocca in una combinazione "felice". Il risultato viene renderizzato come SVG o, con `sharp` installato, come PNG di qualsiasi dimensione.

Un personaggio è semplicemente un oggetto `CharacterConfig` -- volto, capelli, accessori, presentazione. Il builder lo modifica internamente, e puoi estrarlo come JSON, base64 o file, e ricaricarlo allo stesso modo. Per Kurekuta questo è importante: una carta memorizza la configurazione, non l'immagine renderizzata, quindi l'arte è sempre riproducibile e la dimensione del file della carta rimane minima.

## Demografie coerenti, non pixel casuali

Le opzioni di DiceBear sono selettori uniformi. Passa `["#ffdbb4", "#2c1b18"]` per il colore della pelle e otterrai l'uno o l'altro con pari probabilità -- va bene per un logo, inutile per "dammi un personaggio dal Brasile."

`character-factory` fornisce una pipeline paese → etnia → tratti:

```ts
// Cosa c'è effettivamente nel modulo:
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

Ogni livello è un'estrazione pesata. I pesi non sono un trattato di sociologia -- sono un'euristica che impedisce a "dal Giappone" di produrre una rossa e a "dalla Svezia" di produrre capelli nero corvino. L'intera pipeline si riduce a una singola chiamata: `setCountry(country)` o `randomizeFromCountry(country, gender?)`.

## Un piccolo motore genetico

La funzionalità con cui mi sono divertito di più: `projectChild`. Due factory possono produrre un figlio i cui tratti vengono ereditati con una grezza dominanza biologica:

```ts
const parentA = new CharacterFactory().setCountry(Country.Sweden);
const parentB = new CharacterFactory().setCountry(Country.Japan);
const kid     = parentA.projectChild(parentB.getConfig());
```

Sotto il cofano è un modello volutamente minuscolo. Ogni genitore viene trattato come portatore di un genotipo a 2 alleli, uno da ciascun lato, combinati in dominante o recessivo:

```ts
function combine(a: Allele, b: Allele): "dominant" | "recessive" {
  return a === "D" || b === "D" ? "dominant" : "recessive";
}
```

I tratti che hanno un vero asse di dominanza (pelle, occhi, capelli) vengono risolti rispetto a una lista ordinata esplicita -- scuro dominante su chiaro, occhi marroni/neri dominanti su azzurri, capelli nero corvino dominanti su biondi:

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

`resolveByRank` trova l'indice di ogni genitore, sceglie quello più alto su una combinazione di alleli "dominante" e quello più basso su "recessivo." I colori fantasy (rosa pastello, lilla) non sono nell'ordine -- ripiegano su un lancio della moneta 50/50, che è il comportamento giusto: non sono biologici, quindi la dominanza non può significare nulla.

Le lentiggini modellano MC1R: 75% se entrambi i genitori le hanno, 25% se solo uno le porta, 0% se nessuno. La barba è legata a SRY: rimossa se il figlio è femmina, altrimenti ereditata dal genitore che ne aveva una. Il taglio di capelli non è affatto biologico -- è una scelta culturale, quindi il figlio sceglie dal proprio pool di genere, preservando la consistenza se possibile.

Niente di tutto questo è genetica da pubblicazione. È un livello di sensazione: i figli sembrano una miscela plausibile dei loro genitori invece di due estranei messi insieme.

## Le parti ingegneristiche noiose che contavano

Un paio di cose che non sono appariscenti ma si sono guadagnate il loro posto nel diff:

**Un `pick` più sicuro.** L'originale restituiva `undefined` castato come `T` su un array vuoto. Con `strict` + `noUncheckedIndexedAccess` in TypeScript, è una bugia che il compilatore approva. La nuova versione lancia un `RangeError` -- catturato immediatamente nel sito di chiamata invece di produrre proprietà `undefined` tre livelli più in profondità.

**Un `deepMerge` che non corrompe gli array.** La vecchia ricorsione si attivava ogni volta che il valore sorgente era un oggetto, anche se la destinazione era `null` o un array. `merge({tags: ["a"]}, {tags: ["b"]})` produceva `{tags: {0: "b"}}`. La nuova versione ricorre solo quando entrambi i lati sono oggetti semplici.

**Rendering batch parallelo.** `batchFactory` renderizzava i PNG in un loop seriale -- un'esportazione di 1000 carte richiedeva minuti. Ora è un pool di worker con una concorrenza configurabile (default 4), preservando l'ordine dei risultati scrivendo in un array pre-dimensionato:

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

Con un'esportazione di 1000 personaggi, ha trasformato una pausa caffè in un momento "ha già finito?"

**Un messaggio di errore di `sharp` che dice qualcosa.** `buildPng` importa `sharp` in modo lazy perché è una dipendenza peer-like che non vuoi imporre a chi usa solo SVG. Il vecchio catch ingoiava l'errore reale e diceva sempre "sharp is required." Se il vero problema era un mismatch di versione o un problema di binding nativo, perdevi dieci minuti a installare qualcosa che era già installato. La nuova versione ti dice ancora di installarlo, ma include l'errore sottostante.

## Prossimi passi

Il modulo è alla versione 1.1.1 sul [repository character-factory](https://github.com/fox3000foxy/character-factory). Il motore genetico è il posto ovvio dove continuare a iterare -- non c'è ancora una suite di test, quindi invarianti coerenti ("un personaggio brasiliano con ascendenza est-asiatica non ha mai occhi nero corvino abbinati a capelli platino") sono imposti solo dai pesi. Aggiungere `bun test` o `vitest` e scrivere un test di coerenza che esegua diecimila chiamate `randomizeFromCountry` per paese è il prossimo passo.

Kurekuta stesso è privato per ora, ma ogni carta che alla fine vedrai è a un blob `CharacterConfig` e una chiamata `buildPng()` di distanza dall'esistere.
