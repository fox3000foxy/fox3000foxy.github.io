---
title: "Character-Factory bauen: Avatare mit Genetik"
description: "Ein TypeScript-Modul auf Basis von DiceBear: kohärente
  länder-/ethniebasierte Generierung, eine kleine Genetik-Engine zum Projizieren
  von Kindern und die technischen Details, die es in einem Kartenspiel nutzbar
  gemacht haben."
date: 2026-05-16
aiGenerated: trueauthors:
  - fox3000foxy
tags:
  - typescript
  - npm
  - open-source
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "VMwoLAoDoBGMFW/ASP+gySR6JAGhndWSf1Nd/NRE+7T1+L91vP5/L9Hctu8MbWU6ljeX0GMR+6tMsyCCFStqbA=="
---

# character-factory bauen: Avatare mit Genetik

Ich brauchte tausende glaubwürdige, unverwechselbare Avatare für [Kurekuta](https://github.com/fox3000foxy/kurekuta/) -- ein privates Kartenspiel-Projekt, bei dem jede Karte eine Charakter-„DNA“ enthält, die der Renderer in ein Porträt verwandelt. Ein Stock-Pack zu kaufen, hätte nach Stock ausgesehen. Einmalige DiceBear-Avatare pro Seed zu generieren, fühlte sich auf die falsche Art zufällig an: Eine japanisch angehauchte Karte könnte auf eine skandinavische Blondine landen, und zwei „Geschwister“ sahen aus wie Fremde.

Also habe ich [character-factory](https://github.com/fox3000foxy/character-factory) geschrieben -- ein TypeScript-Modul auf Basis von DiceBears Lorelei-Sammlung, das drei Dinge hinzufügt, die DiceBear allein nicht bietet: **kohärente Demografien**, **eine kleine Genetik-Engine** und **einen flüssigen Builder**, der sich in einer Game-Schleife gut benutzen lässt.

## Was es macht

Das kleinste nützliche Schnipsel:

```ts
import { CharacterFactory, Country, Mood } from "character-factory";

const svg = new CharacterFactory()
  .setCountry(Country.Japan)   // gewichtete Ethnie → kohärente Haut/Haar/Schnitt/Bart
  .setMood(Mood.Happy)
  .buildSvg();
```

Diese einzelne Kette wählt eine nach Japans demografischer Mischung gewichtete Ethnie aus, wählt einen zusammengehörigen Hautton und eine Haarfarbe, sucht eine Frisur aus dem richtigen Geschlechter-Pool und stellt dann Augen/Augenbrauen/Mund zu einer „fröhlichen“ Kombination zusammen. Das Ergebnis wird als SVG oder, mit installiertem `sharp`, als PNG in beliebiger Größe gerendert.

Ein Charakter ist einfach ein `CharacterConfig`-Objekt -- Gesicht, Haare, Accessoires, Präsentation. Der Builder mutiert eines intern, und du kannst es als JSON, Base64 oder Datei extrahieren und auf demselben Weg wieder laden. Für Kurekuta ist das wichtig: Eine Karte speichert die Konfiguration, nicht das gerenderte Bild, sodass die Kunst immer reproduzierbar ist und die Dateigröße einer Karte winzig bleibt.

## Kohärente Demografien, nicht nur zufällige Pixel

DiceBears Optionen sind einheitliche Picker. Übergib `["#ffdbb4", "#2c1b18"]` für die Hautfarbe und du bekommst eine von beiden mit gleicher Wahrscheinlichkeit -- gut für ein Logo, nutzlos für „gib mir einen Charakter aus Brasilien.“

`character-factory` liefert eine Land → Ethnie → Eigenschaften-Pipeline:

```ts
// Was tatsächlich im Modul ist:
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
  hairColors: [/* hauptsächlich schwarz/dunkelbraun, kein blond */],
  hairCuts:   { male: [...], female: [...] },
  beardProbability: 0.15,
};
```

Jede Schicht ist eine gewichtete Ziehung. Die Gewichte sind keine soziologische Abhandlung -- sie sind eine Heuristik, die verhindert, dass „aus Japan“ eine Rothaarige produziert und „aus Schweden" pechschwarze Haare. Die gesamte Pipeline bricht auf einen einzigen Aufruf zusammen: `setCountry(country)` oder `randomizeFromCountry(country, gender?)`.

## Eine kleine Genetik-Engine

Das Feature, mit dem ich am meisten Spaß hatte: `projectChild`. Zwei Factories können ein Kind produzieren, dessen Eigenschaften mit grober biologischer Dominanz vererbt werden:

```ts
const parentA = new CharacterFactory().setCountry(Country.Sweden);
const parentB = new CharacterFactory().setCountry(Country.Japan);
const kid     = parentA.projectChild(parentB.getConfig());
```

Unter der Haube steckt ein bewusst winziges Modell. Jeder Elternteil trägt einen 2-Allel-Genotyp, einen von jeder Seite gezogen, kombiniert zu dominant oder rezessiv:

```ts
function combine(a: Allele, b: Allele): "dominant" | "recessive" {
  return a === "D" || b === "D" ? "dominant" : "recessive";
}
```

Eigenschaften mit einer echten Dominanzachse (Haut, Augen, Haare) werden gegen eine explizite geordnete Liste aufgelöst -- dunkler dominant über heller, braune/schwarze Augen dominant über blau, pechschwarze Haare dominant über blond:

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

`resolveByRank` findet den Index jedes Elternteils, wählt den höheren bei einer „dominanten“ Allelkombination und den niedrigeren bei „rezessiv.“ Fantasiefarben (Pastellpink, Lila) sind nicht in der Reihenfolge -- sie fallen auf einen 50/50-Münzwurf zurück, was das richtige Verhalten ist: Sie sind nicht biologisch, also kann Dominanz nichts bedeuten.

Sommersprossen modellieren MC1R: 75%, wenn beide Elternteile sie haben, 25%, wenn nur einer sie trägt, 0%, wenn keiner. Bart ist SRY-gebunden: entfernt, wenn das Kind weiblich ist, ansonsten von dem Elternteil geerbt, der einen hatte. Die Frisur ist überhaupt nicht biologisch -- sie ist eine kulturelle Wahl, also wählt das Kind aus seinem eigenen Geschlechter-Pool und bewahrt, wenn möglich, die Textur.

Nichts davon ist publikationsreife Genetik. Es ist eine Gefühlsebene: Kinder sehen aus wie eine plausible Mischung ihrer Eltern, anstatt wie zwei Fremde, die gemittelt wurden.

## Die langweiligen Engineering-Teile, die wichtig waren

Ein paar Dinge, die nicht spektakulär sind, aber ihren Platz im Diff verdient haben:

**Ein sichereres `pick`.** Das Original gab `undefined` zurück, gecastet als `T` bei einem leeren Array. Mit `strict` + `noUncheckedIndexedAccess` in TypeScript ist das eine Lüge, die der Compiler absegnet. Die neue Version wirft einen `RangeError` -- sofort an der Aufrufstelle abgefangen, anstatt `undefined`-Props drei Ebenen tiefer zu produzieren.

**Ein `deepMerge`, das Arrays nicht korrumpiert.** Die alte Rekursion feuert, wenn der Quellwert ein Objekt ist, selbst wenn der Zielslot `null` oder ein Array ist. `merge({tags: ["a"]}, {tags: ["b"]})` produzierte `{tags: {0: "b"}}`. Die neue Version rekursiert nur, wenn beide Seiten einfache Objekte sind.

**Paralleles Batch-Rendering.** `batchFactory` renderte früher PNGs in einer seriellen Schleife – ein 1000-Karten-Export lief Minuten. Jetzt ist es ein Worker-Pool mit konfigurierbarem Parallelitätsgrad (Standard 4), der die Ergebnisreihenfolge durch Schreiben in ein vorab dimensioniertes Array beibehält:

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

Bei einem 1000-Charakter-Export verwandelte sich eine Kaffeepause in einen „Ist das schon fertig?“-Moment.

**Eine `sharp`-Fehlermeldung, die etwas aussagt.** `buildPng` importiert `sharp` lazy, weil es eine Peer-ähnliche Abhängigkeit ist, die man SVG-only-Benutzern nicht aufzwingen will. Der alte Catch verschluckte den eigentlichen Fehler und gab immer „sharp wird benötigt“ aus. Wenn der eigentliche Fehler ein Versionskonflikt oder ein natives Binding-Problem war, verbrachte man zehn Minuten damit, etwas zu installieren, das bereits installiert war. Die neue Version sagt dir immer noch, dass du es installieren sollst, enthält aber den zugrunde liegenden Fehler.

## Was als Nächstes kommt

Das Modul ist auf Version 1.1.1 im [character-factory-Repository](https://github.com/fox3000foxy/character-factory). Die Genetik-Engine ist der offensichtliche Ort, um weiterzuentwickeln -- es gibt noch keine Testsuite, also werden kohärente Invarianten („ein brasilianischer Ostasien-lastiger Charakter hat niemals pechschwarze Augen mit platinblonden Haaren“) nur durch die Gewichte erzwungen. `bun test` oder `vitest` hinzuzufügen und einen Kohärenztest zu schreiben, der zehntausend `randomizeFromCountry`-Aufrufe pro Land ausführt, ist der nächste Schritt.

Kurekuta selbst ist vorerst privat, aber jede Karte, die du irgendwann darin sehen wirst, ist ein `CharacterConfig`-Blob und einen `buildPng()`-Aufruf davon entfernt zu existieren.
