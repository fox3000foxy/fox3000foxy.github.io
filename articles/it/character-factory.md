---
title: "Costruire character-factory: avatar con genetica"
description: "Un modulo TypeScript sopra DiceBear: generazione coerente per paese/etnia, un piccolo motore di genetica per proiettare figli, e i dettagli di ingegneria che l'hanno reso usabile in un gioco di carte."
date: 2026-05-16
aiGenerated: true
tags:
  - typescript
  - npm
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "2WWwixE7/iHIJHxKf1s9j1O5Mhur4+SARB1LiZwL5rkVa3+dPkTtYcU1yu1v5LlE2TtvjiqN+QUY1L82J2rOtA=="
---

# Costruire character-factory: avatar con un sistema genetico

Mi servivano migliaia di avatar credibili e distinti per [Kurekuta](https://github.com/fox3000foxy/kurekuta/): un progetto privato di gioco di carte dove ogni carta contiene un "DNA" di personaggio che il motore di rendering trasforma in ritratto. Comprare un pack già fatto, si sarebbe visto. Generare avatar DiceBear a seed per personaggio, dava roba a caso: una carta a universo giapponese poteva cadere su una bionda scandinava, e due "fratelli e sorelle" sembravano sconosciuti.

Quindi ho scritto [character-factory](https://github.com/fox3000foxy/character-factory): un modulo TypeScript sopra la collezione Lorelei di DiceBear che porta tre funzionalità che DiceBear da solo non dà: **profili demografici coerenti**, **un piccolo motore di genetica**, e **un builder fluido** piacevole da usare da un ciclo di gioco.

## Cosa fa

Lo snippet utile più piccolo:

```ts
import { CharacterFactory, Country, Mood } from "character-factory";

const svg = new CharacterFactory()
  .setCountry(Country.Japan)   // etnia pesata → pelle/capelli/taglio/barba coerenti
  .setMood(Mood.Happy)
  .buildSvg();
```

Questa semplice catena pesca un'etnia pesata dalla demografia giapponese, tira una tinta e un colore di capelli che stanno bene insieme, sceglie un taglio nel giusto sottogruppo di genere, poi blocca occhi/sopracciglia/bocca in modalità "felice". Il risultato esce in SVG o, con `sharp` installato, in PNG a qualsiasi taglia.

Un personaggio è solo un oggetto `CharacterConfig`: viso, capelli, accessori, presentazione. Il builder lo modifica internamente, e puoi esportarlo in JSON, base64 o file, poi ricaricarlo identico. Per Kurekuta è cruciale: una carta salva la config, non l'immagine renderizzata. Così l'arte è sempre riproducibile e la taglia di una carta resta minuscola.

## Profili demografici coerenti, non pixel a caso

Le opzioni DiceBear sono selettori uniformi. Passi `["#ffdbb4", "#2c1b18"]` per il colore di pelle e avrai l'uno o l'altro con la stessa probabilità: ok per un logo, inutile per "dammi un personaggio del Brasile."

`character-factory` imbarca una pipeline paese, poi etnia, poi tratti:

```ts
// Cosa c'è nel modulo:
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
  hairColors: [/* soprattutto nero/castano scuro, niente biondo */],
  hairCuts:   { male: [...], female: [...] },
  beardProbability: 0.15,
};
```

Ogni strato è un'estrazione pesata. I pesi non sono una tesi di socio: è un'euristica che impedisce a "venuto dal Giappone" di produrre un rosso e a "venuto dalla Svezia" di produrre un nero corvino. Tutta la pipeline si riassume in una sola chiamata: `setCountry(country)` o `randomizeFromCountry(country, gender?)`.

## Un piccolo motore di genetica

La funzione su cui mi sono divertito di più: `projectChild`. Due factory possono produrre un figlio i cui tratti sono ereditati con una dominanza biologica approssimativa:

```ts
const parentA = new CharacterFactory().setCountry(Country.Sweden);
const parentB = new CharacterFactory().setCountry(Country.Japan);
const kid     = parentA.projectChild(parentB.getConfig());
```

Sotto il cofano, è un modello volutamente minuscolo. Ogni genitore porta un genotipo a 2 alleli, uno tirato da ogni lato, combinato in dominante o recessivo:

```ts
function combine(a: Allele, b: Allele): "dominant" | "recessive" {
  return a === "D" || b === "D" ? "dominant" : "recessive";
}
```

I tratti che hanno un vero asse di dominanza (pelle, occhi, capelli) sono risolti da una lista ordinata esplicita: lo scuro domina il chiaro, gli occhi marroni/neri dominano il blu, il nero corvino domina il biondo:

```ts
const HAIR_DOMINANCE_ORDER = [
  HairColor.LightBlonde,   // il più recessivo
  HairColor.GoldenBlonde,
  HairColor.HoneyBlonde,
  HairColor.Auburn,
  HairColor.Red,
  HairColor.Copper,
  HairColor.LightBrown,
  HairColor.Brown,
  HairColor.DarkBrown,
  HairColor.SoftBlack,
  HairColor.JetBlack,      // il più dominante
] as const;
```

`resolveByRank` trova l'indice di ogni genitore, prende il più alto su una combinazione di alleli "dominante" e il più basso su "recessiva". I colori fantasy (rosa pastello, lilla) non sono nell'ordine: fanno un testa o croce 50/50, che è il comportamento giusto: non sono biologici, quindi la dominanza non ha senso.

Le lentiggini modellano MC1R: 75% se entrambi i genitori ne hanno, 25% se ne porta solo uno, 0% se nessuno. La barba è legata a SRY: rimossa se il figlio è femmina, altrimenti ereditata dal genitore che ne aveva una. Il taglio di capelli non ha niente di biologico: è una scelta culturale, quindi il figlio pesca nel suo pool di genere, preservando la texture se possibile.

Niente di tutto questo è genetica da pubblicazione. È uno strato di sensazione: i ragazzini assomigliano a un mix plausibile dei loro genitori, non alla media di due sconosciuti.

## Le parti ingegneria meno glamour che hanno contato

Qualche dettaglio poco visibile ma che ha meritato il suo posto nel diff:

**Un `pick` più sicuro.** L'originale restituiva `undefined` castato a `T` su una tabella vuota. Con `strict` + `noUncheckedIndexedAccess` in TypeScript, è una bugia che il compilatore firma. La nuova versione lancia una `RangeError`: beccata subito al sito di chiamata invece di produrre prop `undefined` tre livelli più in basso.

**Un `deepMerge` che non corrompe le tabelle.** La vecchia ricorsione scattava appena il valore sorgente era un oggetto, anche se il target era `null` o una tabella. `merge({tags: ["a"]}, {tags: ["b"]})` produceva `{tags: {0: "b"}}`. La nuova versione ricorre solo quando entrambi i lati sono oggetti semplici.

**Rendering batch in parallelo.** `batchFactory` renderizzava i PNG in ciclo serializzato: un'esportazione di 1000 carte prendeva le ore. Ora è un pool di worker con una concorrenza configurabile (4 di default), che preserva l'ordine dei risultati scrivendo in una tabella predimensionata:

```ts
const worker = async () => {
  while (true) {
    const i = nextIndex++;
    if (i >= count) return;
    // renderizza e salva
    results[i] = { index: i + 1, filePath, config: clone.getConfig() };
    done++;
    onProgress?.(done, count);
  }
};
await Promise.all(Array.from({ length: concurrency }, () => worker()));
```

Su un'esportazione di 1000 personaggi, ha trasformato una pausa caffè in un "già finito?"

**Un messaggio di errore `sharp` che dice qualcosa.** `buildPng` importa `sharp` in pigro perché è una dipendenza opzionale che non vuoi imporre agli utenti solo SVG. Il vecchio catch ingoiava il vero errore e diceva sempre "sharp is required." Se il vero fallimento era un conflitto di versione o un problema di binding nativi, passavi dieci minuti a reinstallare un pacchetto già installato. La nuova versione ti dice sempre di installarlo, ma include l'errore sottostante.

## Il seguito

Il modulo è in 1.1.1 sul [repository character-factory](https://github.com/fox3000foxy/character-factory). Il motore genetico è il posto ideale per continuare a iterare: non c'è ancora una suite di test, quindi gli invarianti di coerenza ("un personaggio brasiliano di ascendenza est-asiatica non avrà mai gli occhi neri corvini coi capelli platino") sono assicurati solo dai pesi. Aggiungere `bun test` o `vitest` e scrivere un test di coerenza che lancia diecimila `randomizeFromCountry` per paese, è il prossimo passo.

Kurekuta stesso è privato per ora, ma ogni carta che un giorno vedrai dentro non è che un blob `CharacterConfig` e un `buildPng()` di esistere.
