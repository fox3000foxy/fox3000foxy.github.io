---
title: "character-factory bauen: Avatare mit Genetik"
description: "Ein TypeScript-Modul auf DiceBear: konsistente Generierung nach Land/Ethnie, eine kleine Genetik-Engine zum Projizieren von Kindern, und die Engineering-Details, die es in einem Kartenspiel nutzbar gemacht haben."
date: 2026-05-16
aiGenerated: true
tags:
  - typescript
  - npm
  - open-source
authors:
  - fox3000foxy
lang: "de"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "pgCtod/yC89YQrme5bVkhDc9Gd8+6Q6wknokIKdjIv9Zj5Ck0FiwwoooSZUWw8DHdFTGfYW47NZpyoIYVD+RBQ=="
---
# 

Ich brauchte Tausende von glaubwürdigen und separaten Avataren für [Kurekuta](https://github.com/fox3000foxy/kurekuta/)– ein privates Kartenspielprojekt, bei dem jede Karte eine "DNS" von Charakteren enthält, die der Rendering-Engine in ein Porträt verwandelt. Ein vollgestopftes Paket zu kaufen, wäre eins gewesen. Erstellen von DiceBear Avataren für jeden Charakter, das gab alles: eine Karte für das japanische Universum könnte auf eine skandinavische Blonde fallen, und zwei "Brüder und Schwestern" sahen aus wie Fremde.

Ich schrieb [character-factory](https://github.com/fox3000foxy/character-factory)– ein Modul TypeScript über die DiceBear Lorelei Kollektion, die drei Funktionen bietet, die DceBear allein nicht gibt: **konsequente demografische Profile**, **ein kleiner Genmotor** und **ein fließender Builder**, der von einer Spielschleife aus gut zu bedienen ist.

## Wie es sich anfühlt

Der kleinste nützliche Snippet:
```ts
import { CharacterFactory, Country, Mood } from "character-factory";

const svg = new CharacterFactory()
  .setCountry(Country.Japan) // gewichtete Ethnizität → Haut/Färbe/Korrespondierendes Haar/Barbe
  .setMood(Mood.Happy)
  .buildSvg();
```
Diese einfache Kette schneidet eine Ethnie ab, die von der japanischen Demographie gewichtet wird, zieht einen Teint und eine Haarfarbe, die zusammen gehen, wählt einen Schnitt in der richtigen Subgruppe des Genres, dann sperrt die Augen/Sensen/Mund im "Frohen" Modus. Das Ergebnis kommt in SVG oder, mit`sharp`installiert, in PNG in jeder Größe.

Ein Charakter ist nur ein Objekt`CharacterConfig`– Gesicht, Haar, Zubehör, Präsentation. Der Builder ändert es intern und du kannst es in JSON, Base64 oder Datei exportieren und dann auf dieselbe Weise aufladen. Für Kurekuta ist es entscheidend: eine Karte speichert die Konfig, nicht das Bild. Die Kunst ist immer wiederholbar und die Größe einer Karte bleibt winzig.

## Konsequente demographische Profile, keine zufälligen Pixel

DiceBear-Optionen sind einheitliche Auswahlmöglichkeiten. Passe`["#ffdbb4", "#2c1b18"]`für die Hautfarbe und du wirst beide mit der gleichen Wahrscheinlichkeit – OK für ein Logo, unnötig für "Gib mir eine Figur aus Brasilien."

`character-factory`schifft eine route nationa → ethnizität → Eigenschaften:
```ts
// Was in dem Modul ist:
ethnicitiesByCountry[Country.Brazil] = [
  { ethnicity: Ethnicity.WestEuropean,  weight: 35 },
  { ethnicity: Ethnicity.BlackAfrican,  weight: 25 },
  { ethnicity: Ethnicity.Latino,        weight: 30 },
  // 
];

ETHNICITY_PROFILES[Ethnicity.EastAsian] = {
  skinColors: [
    { color: SkinColor.Light,  weight: 35 },
    { color: SkinColor.Warm,   weight: 40 },
    { color: SkinColor.Medium, weight: 20 },
    // 
  ],
  hairColors: [/* surtout noir/brun foncé, pas de blond */],
  hairCuts:   { male: [...], female: [...] },
  beardProbability: 0.15,
};
```
Jede Schicht ist eine gewogene Auflage. Gewichte sind keine These von Sozio - es ist eine Heuristik, die "von Japan" verhindert, dass ein Rotrot und "von Schweden" produziert ein schwarzes Jais. Alle Pipelines sind auf einen einzigen Aufruf beschränkt:`setCountry(country)`oder`randomizeFromCountry(country, gender?)` .

## Ein kleiner Genmotor

Die Funktion, auf der ich am meisten Spaß hatte:`projectChild`. Zwei Faktoren können ein Kind produzieren, dessen Merkmale mit einer ungefähren biologischen Dominanz ererbt werden:
```ts
const parentA = new CharacterFactory().setCountry(Country.Sweden);
const parentB = new CharacterFactory().setCountry(Country.Japan);
const kid     = parentA.projectChild(parentB.getConfig());
```
Unter der Haube ist es ein absichtlich kleines Modell. Jedes Elternteil trägt einen Genotyp mit zwei Allelen, einen Schuss auf jeder Seite, kombiniert mit Dominanz oder rezessiv:
```ts
function combine(a: Allele, b: Allele): "dominant" | "recessive" {
  return a === "D" || b === "D" ? "dominant" : "recessive";
}
```
Die Züge, die eine echte Dominanzachse haben (Haut, Augen, Haar), werden durch eine explizite geordnete Liste gelöst – das dunkle beherrscht das Hell, die braunen/schwarzen Augen dominieren das Blau, das schwarze Jais dominiert das Blonde:
```ts
const HAIR_DOMINANCE_ORDER = [
  HairColor.LightBlonde, // die rezessivste
  HairColor.GoldenBlonde,
  HairColor.HoneyBlonde,
  HairColor.Auburn,
  HairColor.Red,
  HairColor.Copper,
  HairColor.LightBrown,
  HairColor.Brown,
  HairColor.DarkBrown,
  HairColor.SoftBlack,
  HairColor.JetBlack, // am stärksten
] as const;
```
`resolveByRank`findet den Index jedes Elternteils, nimmt den höchsten auf einer Kombination von "dominanten" Allelen und den niedrigsten auf "rezessive." Die fantasy Farben (rosa pastell, lilas) sind nicht in Ordnung - sie machen eine Batterie oder Gesicht 50/50, was das richtige Verhalten ist: sie sind nicht biologisch, so dass Dominanz keinen Sinn ergibt.

Die Sommerrossflecken modellieren MC1R: 75 %, wenn beide Eltern sie haben, 25 %, falls nur eins an der Tür, 0 %, bei keinem. Der Bart ist mit dem SRY verbunden: entfernt, wenn das Kind eine Frau ist, wenn nicht vom Elternteil, der eine hatte. Haarschnitt hat nichts Biologisches – es ist eine kulturelle Wahl, also das Kind sticht in seinem eigenen Genre Pool, wobei die Textur, wenn möglich, erhalten bleibt.

Nichts davon ist genetisch würdig für eine Publikation, sondern eine gefühlsmäßige Schicht: Kinder sehen aus wie eine plausible Mischung ihrer Eltern, nicht wie die durchschnittlichen zwei Fremden.

## Die weniger glamouröse Engineering-Parteien, die gezählt haben

Einige wenige Details, die aber verdienten ihren Platz in der diff:

**Eins`pick`* Das Original wurde zurück geschickt.`undefined`Kasett in`T`auf einem leeren Tisch.`strict` + `noUncheckedIndexedAccess`In TypeScript ist es eine Lüge, die der Compiler unterschreibt. Die neue Version startet eine`RangeError`– sofort an der Rufstelle gefangen, anstatt Props zu produzieren`undefined`Drei Ebenen tiefer.

**Eins`deepMerge`die die Tabellen nicht beschädigt.** Die alte Rekursion wurde aktiviert, sobald der Quellwert ein Objekt war, auch wenn das Ziel`null`Oder ein Bild.`merge({tags: ["a"]}, {tags: ["b"]})`produziert`{tags: {0: "b"}}`Die neue Version ist nur dann rekordiert, wenn beide Seiten einfache Objekte sind.

**Abgegeben parallel.**`batchFactory`Die PNGs wurden in einer serialisierten Schleife – ein Export von 1000 Karten nahm Blei. Es ist jetzt ein Pool von Workers mit konfigurierbarem Wettbewerb (4 standardmäßig), der die Reihenfolge der Ergebnisse durch Schreiben in einer vordimensionalen Tabelle bewahrt:
```ts
const worker = async () => {
  while (true) {
    const i = nextIndex++;
    if (i >= count) return;
    // Render und Speichern
    results[i] = { index: i + 1, filePath, config: clone.getConfig() };
    done++;
    onProgress?.(done, count);
  }
};
await Promise.all(Array.from({ length: concurrency }, () => worker()));
```
Bei einem Export von 1000 Figuren hat das eine Kaffeepause in ein "Es ist schon vorbei" verwandelt.

**Eine Fehlermeldung`sharp`- Das sagt etwas.`buildPng`import`sharp`Faul, weil es eine optionale Abhängigkeit ist, die du den SVG-only-Benutzern nicht aufzwingen willst. Der alte Watch schluckte den wahren Fehler und sagte immer "sharp is required." Wenn das tatsächliche Versagen ein Versionskonflikt oder ein natives Bindingsproblem war, verbrachtest du zehn Minuten damit, ein bereits installiertes Paket neu zu installieren. Die neue Version sagt dir immer, es zu insstallieren, aber beinhaltet den zugrunde liegenden Fehler.

## Die Fortsetzung

Das Modul ist in 1.1.1 auf dem [dépôt character-factory](https://github.com/fox3000foxy/character-factory). Der genetische Motor ist der ideale Ort, um weiter zu itieren – es gibt noch keine Folge von Tests, so dass die Konsistenz Invarianten ("ein brasilianischer Charakter der asiatischen Aszendanz wird nie die schwarzen Augen von Jais mit Platinhaar) nur durch Gewicht versichert werden. Hinzufügen`bun test`oder`vitest`und schreibst du einen Konsistenztest, der zehntausend`randomizeFromCountry`Das ist der nächste Schritt nach Ländern.

Kurekuta selbst ist jetzt privat, aber jede Karte, die du je darin sehen wirst, ist nur ein Blob.`CharacterConfig`und`buildPng()`zu existieren.
