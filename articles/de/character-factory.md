---
title: "character-factory bauen: Avatare mit Genetik"
description: "Ein TypeScript-Modul auf DiceBear: konsistente Generierung
  nach Land/Ethnie, eine kleine Genetik-Engine zum Projizieren von Kindern, und
  die Engineering-Details, die es in einem Kartenspiel nutzbar gemacht haben."
date: 2026-05-16
aiGenerated: true
tags:
  - typescript
  - npm
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "p33ELq0YgXbSwTPNI2f3jT4sRwtGUruilxlo52vhD/nw2VdrUWlEoGamCfJR6qxOfYDDh79QdCbUkFkfnrIzyA=="
---

# character-factory bauen: Avatare mit Genetiksystem

Ich brauchte Tausende glaubwürdige und unterschiedliche Avatare für [Kurekuta](https://github.com/fox3000foxy/kurekuta/), ein privates Kartenspielprojekt, bei dem jede Karte eine Charakter-"DNA" enthält, die die Render-Engine in ein Porträt verwandelt. Ein fertiges Pack zu kaufen hätte man gesehen. DiceBear-Avatare pro Charakter zu seeden gab Unsinn: Eine Karte mit japanischem Universum konnte auf eine skandinavische Blondine fallen, und zwei "Geschwister" sahen aus wie Fremde.

Also habe ich [character-factory](https://github.com/fox3000foxy/character-factory) geschrieben, ein TypeScript-Modul auf der Lorelei-Collection von DiceBear, das drei Funktionen mitbringt, die DiceBear allein nicht gibt: **konsistente demografische Profile**, **eine kleine Genetik-Engine** und **einen flüssigen Builder**, der sich angenehm aus einer Spielschleife nutzen lässt.

## Was es tut

Das kleinste nützliche Snippet:

```ts
import { CharacterFactory, Country, Mood } from "character-factory";

const svg = new CharacterFactory()
  .setCountry(Country.Japan)   // gewichtete Ethnizität → konsistente Haut/Haare/Schnitt/Bart
  .setMood(Mood.Happy)
  .buildSvg();
```

Diese einfache Kette zieht eine nach der japanischen Demografie gewichtete Ethnie, zieht einen Teint und eine Haarfarbe, die zusammenpassen, wählt einen Schnitt aus der passenden Gender-Untergruppe und verriegelt dann Augen/Brauen/Mund in den "fröhlich"-Modus. Das Ergebnis kommt als SVG raus oder, mit installiertem `sharp`, als PNG in beliebiger Größe.

Ein Charakter ist nur ein `CharacterConfig`-Objekt, Gesicht, Haare, Accessoires, Darstellung. Der Builder verändert es intern, und du kannst es als JSON, Base64 oder Datei exportieren und dann identisch wieder laden. Für Kurekuta ist das entscheidend: Eine Karte speichert die Config, nicht das gerenderte Bild. Dadurch ist die Kunst immer reproduzierbar und die Größe einer Karte bleibt winzig.

## Konsistente demografische Profile statt zufälliger Pixel

Die DiceBear-Optionen sind uniforme Selektoren. Gib `["#ffdbb4", "#2c1b18"]` für die Hautfarbe an und du bekommst das eine oder das andere mit derselben Wahrscheinlichkeit, OK für ein Logo, nutzlos für "gib mir einen Charakter aus Brasilien."

`character-factory` bringt eine Land → Ethnie → Merkmale-Pipeline mit:

```ts
// Was im Modul steckt :
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
  hairColors: [/* vor allem schwarz/dunkelbraun, kein blond */],
  hairCuts:   { male: [...], female: [...] },
  beardProbability: 0.15,
};
```

Jede Schicht ist eine gewichtete Ziehung. Die Gewichte sind keine Sozio-These, es ist eine Heuristik, die verhindert, dass "aus Japan" einen Rothaarigen produziert und "aus Schweden" ein tiefes Schwarz. Die ganze Pipeline löst sich in einen einzigen Aufruf auf: `setCountry(country)` oder `randomizeFromCountry(country, gender?)`.

## Eine kleine Genetik-Engine

Die Funktion, mit der ich mich am meisten amüsiert habe: `projectChild`. Zwei Factories können ein Kind produzieren, dessen Merkmale mit ungefährer biologischer Dominanz vererbt werden:

```ts
const parentA = new CharacterFactory().setCountry(Country.Sweden);
const parentB = new CharacterFactory().setCountry(Country.Japan);
const kid     = parentA.projectChild(parentB.getConfig());
```

Unter der Haube ist es ein absichtlich winziges Modell. Jeder Elternteil trägt einen Genotyp mit 2 Allelen, eines von jeder Seite gezogen, kombiniert zu dominant oder rezessiv:

```ts
function combine(a: Allele, b: Allele): "dominant" | "recessive" {
  return a === "D" || b === "D" ? "dominant" : "recessive";
}
```

Merkmale, die eine echte Dominanzachse haben (Haut, Augen, Haare), werden über eine explizite geordnete Liste aufgelöst, dunkel dominiert hell, braune/schwarze Augen dominieren blau, tiefes Schwarz dominiert blond:

```ts
const HAIR_DOMINANCE_ORDER = [
  HairColor.LightBlonde,   // am rezessivsten
  HairColor.GoldenBlonde,
  HairColor.HoneyBlonde,
  HairColor.Auburn,
  HairColor.Red,
  HairColor.Copper,
  HairColor.LightBrown,
  HairColor.Brown,
  HairColor.DarkBrown,
  HairColor.SoftBlack,
  HairColor.JetBlack,      // am dominantesten
] as const;
```

`resolveByRank` findet den Index jedes Elternteils, nimmt den höheren bei einer "dominanten" Allelkombination und den niedrigeren bei "rezessiv". Fantasy-Farben (Pastellrosa, Flieder) stehen nicht in der Ordnung, sie machen 50/50-Kopf-oder-Zahl, was das richtige Verhalten ist: Sie sind nicht biologisch, also ergibt Dominanz keinen Sinn.

Sommersprossen modellieren MC1R: 75 %, wenn beide Eltern sie haben, 25 %, wenn nur einer sie trägt, 0 %, wenn keiner. Der Bart hängt an SRY: entfernt, wenn das Kind eine Frau ist, sonst vom Elternteil vererbt, der einen hatte. Der Haarschnitt hat nichts Biologisches, es ist eine kulturelle Wahl, also zieht das Kind aus seinem eigenen Gender-Pool und bewahrt dabei wenn möglich die Textur.

Nichts davon ist publikationswürdige Genetik. Es ist eine Gefühlsschicht: Die Kinder sehen aus wie eine plausible Mischung ihrer Eltern, nicht wie der Durchschnitt zweier Fremder.

## Die weniger glamourösen Engineering-Teile, die gezählt haben

Einige wenig sichtbare Details, die ihren Platz im Diff verdient haben:

**Ein sichereres `pick`.** Das Original gab `undefined` gecastet zu `T` bei leerem Array zurück. Mit `strict` + `noUncheckedIndexedAccess` in TypeScript ist das eine Lüge, die der Compiler unterschreibt. Die neue Version wirft einen `RangeError`, sofort an der Aufrufstelle gefangen, statt drei Ebenen tiefer `undefined`-Props zu produzieren.

**Ein `deepMerge`, das Arrays nicht korrumpiert.** Die alte Rekursion aktivierte sich, sobald der Quellwert ein Objekt war, selbst wenn das Ziel `null` oder ein Array war. `merge({tags: ["a"]}, {tags: ["b"]})` produzierte `{tags: {0: "b"}}`. Die neue Version rekursiert nur, wenn beide Seiten einfache Objekte sind.

**Paralleles Batch-Rendering.** `batchFactory` renderte die PNGs in serialisierter Schleife, ein Export von 1000 Karten dauerte ewig. Jetzt ist es ein Worker-Pool mit konfigurierbarer Konkurrenz (Standard 4), der die Ergebnisreihenfolge bewahrt, indem er in ein vordimensioniertes Array schreibt:

```ts
const worker = async () => {
  while (true) {
    const i = nextIndex++;
    if (i >= count) return;
    // rendern und speichern
    results[i] = { index: i + 1, filePath, config: clone.getConfig() };
    done++;
    onProgress?.(done, count);
  }
};
await Promise.all(Array.from({ length: concurrency }, () => worker()));
```

Bei einem Export von 1000 Charakteren hat das eine Kaffeepause in ein "schon fertig ?" verwandelt.

**Eine `sharp`-Fehlermeldung, die etwas aussagt.** `buildPng` importiert `sharp` faul, weil es eine optionale Abhängigkeit ist, die du SVG-only-Nutzern nicht aufzwingen willst. Der alte Catch verschluckte den echten Fehler und sagte immer "sharp is required." Wenn der echte Fehler ein Versionskonflikt oder ein natives Binding-Problem war, hast du zehn Minuten damit verbracht, ein schon installiertes Paket neu zu installieren. Die neue Version sagt dir immer noch, es zu installieren, schließt aber den zugrunde liegenden Fehler ein.

## Wie weiter

Das Modul steht auf 1.1.1 im [character-factory-Repository](https://github.com/fox3000foxy/character-factory). Die Genetik-Engine ist der ideale Ort, um weiter zu iterieren, es gibt noch keine Testsuite, also werden die Konsistenzinvarianten ("ein brasilianischer Charakter ostasiatischer Abstammung wird nie tiefschwarze Augen mit platinblonden Haaren haben") nur durch die Gewichte sichergestellt. `bun test` oder `vitest` hinzuzufügen und einen Konsistenztest zu schreiben, der zehntausend `randomizeFromCountry` pro Land laufen lässt, ist der nächste Schritt.

Kurekuta selbst ist vorerst privat, aber jede Karte, die du eines Tages darin siehst, ist nur ein `CharacterConfig`-Blob und ein `buildPng()` von der Existenz entfernt.
