---
title: "Construindo character-factory: avatares com genética"
description: "Um módulo TypeScript sobre o DiceBear: geração consistente
  por país/etnia, um pequeno motor de genética para projetar crianças, e
  os detalhes de engenharia que o tornaram utilizável em um jogo de cartas."
date: 2026-05-16
aiGenerated: true
tags:
  - typescript
  - npm
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "UFyVgQGAM5+Edr5uTyXO+VXszgoYdbKfJIbpl1FN4QkKsG+E5BRXL5KgbIHHoXIqoTehJGwdj8WyMDgjMmcdxA=="
---

# Construindo character-factory: avatares com um sistema genético

Eu precisava de milhares de avatares críveis e distintos para o [Kurekuta](https://github.com/fox3000foxy/kurekuta/) -- um projeto de jogo de cartas privado onde cada carta contém um "DNA" de personagem que o motor de renderização transforma em retrato. Comprar um pacote pronto, isso se notaria. Gerar avatares DiceBear com seed por personagem, dava em qualquer coisa: uma carta no universo japonês podia cair numa loira escandinava, e dois "irmãos" pareciam estranhos.

Então escrevi o [character-factory](https://github.com/fox3000foxy/character-factory) -- um módulo TypeScript sobre a coleção Lorelei do DiceBear que traz três coisas que o DiceBear sozinho não dá: **perfis demográficos consistentes**, **um pequeno motor de genética**, e **um builder fluido** agradável de usar desde um loop de jogo.

## O que faz

O menor snippet útil:

```ts
import { CharacterFactory, Country, Mood } from "character-factory";

const svg = new CharacterFactory()
  .setCountry(Country.Japan)   // etnia ponderada → pele/cabelo/corte/barba consistentes
  .setMood(Mood.Happy)
  .buildSvg();
```

Essa simples cadeia escolhe uma etnia ponderada pela demografia japonesa, sorteia um tom de pele e cor de cabelo que combinam, seleciona um corte no subgrupo de gênero correto, e então trava os olhos/sobrancelhas/boca no modo "feliz". O resultado sai em SVG ou, com `sharp` instalado, em PNG em qualquer tamanho.

Um personagem é apenas um objeto `CharacterConfig` -- rosto, cabelo, acessórios, apresentação. O builder o modifica internamente, e você pode exportá-lo como JSON, base64 ou arquivo, e então recarregá-lo identicamente. Para o Kurekuta isso é crucial: uma carta armazena a config, não a imagem renderizada. Assim a arte é sempre reproduzível e o tamanho de uma carta permanece minúsculo.

## Perfis demográficos consistentes, não pixel aleatório

As opções do DiceBear são seletores uniformes. Passe `["#ffdbb4", "#2c1b18"]` para a cor da pele e você terá um ou outro com a mesma probabilidade -- OK para um logotipo, inútil para "me dê um personagem do Brasil."

O `character-factory` embarca um pipeline país → etnia → traços:

```ts
// O que está no módulo:
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
  hairColors: [/* sobretudo preto/castanho escuro, sem loiro */],
  hairCuts:   { male: [...], female: [...] },
  beardProbability: 0.15,
};
```

Cada camada é um sorteio ponderado. Os pesos não são uma tese de sociologia -- é uma heurística que impede "vindo do Japão" de produzir um ruivo e "vindo da Suécia" de produzir um preto retinto. Todo o pipeline se resume a uma única chamada: `setCountry(country)` ou `randomizeFromCountry(country, gender?)`.

## Um pequeno motor de genética

A função que mais me divertiu: `projectChild`. Duas factories podem produzir uma criança cujos traços são herdados com dominância biológica aproximada:

```ts
const parentA = new CharacterFactory().setCountry(Country.Sweden);
const parentB = new CharacterFactory().setCountry(Country.Japan);
const kid     = parentA.projectChild(parentB.getConfig());
```

Sob o capô, é um modelo voluntariamente minúsculo. Cada parental carrega um genótipo de 2 alelos, um puxado de cada lado, combinado em dominante ou recessivo:

```ts
function combine(a: Allele, b: Allele): "dominant" | "recessive" {
  return a === "D" || b === "D" ? "dominant" : "recessive";
}
```

Os traços que têm um eixo real de dominância (pele, olhos, cabelo) são resolvidos por uma lista ordenada explícita -- o escuro domina o claro, os olhos castanhos/pretos dominam o azul, o preto retinto domina o loiro:

```ts
const HAIR_DOMINANCE_ORDER = [
  HairColor.LightBlonde,   // o mais recessivo
  HairColor.GoldenBlonde,
  HairColor.HoneyBlonde,
  HairColor.Auburn,
  HairColor.Red,
  HairColor.Copper,
  HairColor.LightBrown,
  HairColor.Brown,
  HairColor.DarkBrown,
  HairColor.SoftBlack,
  HairColor.JetBlack,      // o mais dominante
] as const;
```

O `resolveByRank` encontra o índice de cada parental, pega o mais alto numa combinação de alelos "dominante" e o mais baixo em "recessiva". As cores fantasia (rosa pastel, lilás) não estão na ordem -- elas fazem um cara ou coroa 50/50, que é o comportamento correto: elas não são biológicas, então a dominância não faz sentido.

As sardas modelam MC1R: 75% se ambos os pais têm, 25% se apenas um carrega, 0% se nenhum. A barba está ligada ao SRY: removida se a criança for mulher, caso contrário herdada do parental que tinha uma. O corte de cabelo não tem nada de biológico -- é uma escolha cultural, então a criança escolhe no seu próprio pool de gênero, preservando a textura se possível.

Nada disso é genética digna de publicação. É uma camada de sensação: as crianças se parecem com uma mistura plausível de seus pais, não com a média de dois estranhos.

## As partes de engenharia menos glamourosas que importaram

Algumas coisas não chamativas mas que mereceram seu lugar no diff:

**Um `pick` mais seguro.** O original retornava `undefined` castado para `T` num array vazio. Com `strict` + `noUncheckedIndexedAccess` no TypeScript, isso é uma mentira que o compilador assina. A nova versão lança um `RangeError` -- capturado imediatamente no local da chamada em vez de produzir props `undefined` três níveis abaixo.

**Um `deepMerge` que não corrompe arrays.** A antiga recursão ativava-se assim que o valor fonte era um objeto, mesmo se o alvo fosse `null` ou um array. `merge({tags: ["a"]}, {tags: ["b"]})` produzia `{tags: {0: "b"}}`. A nova versão só recorre quando ambos os lados são objetos simples.

**Renderização em lote paralela.** O `batchFactory` renderizava os PNGs em loop serializado -- uma exportação de 1000 cartas levava uma eternidade. Agora é um pool de workers com concorrência configurável (4 por padrão), que preserva a ordem dos resultados escrevendo num array pré-dimensionado:

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

Numa exportação de 1000 personagens, isso transformou uma pausa para café em um "já acabou?"

**Uma mensagem de erro `sharp` que diz alguma coisa.** O `buildPng` importa o `sharp` de forma lazy porque é uma dependência opcional que você não quer impor aos usuários SVG-only. O antigo catch engolia o erro real e sempre dizia "sharp is required." Se a falha real era um conflito de versão ou um problema de bindings nativos, você passava dez minutos reinstalando algo já instalado. A nova versão sempre diz para instalá-lo, mas inclui o erro subjacente.

## O futuro

O módulo está na 1.1.1 no [repositório character-factory](https://github.com/fox3000foxy/character-factory). O motor genético é o lugar ideal para continuar iterando -- ainda não há suite de testes, então os invariantes de consistência ("um personagem brasileiro de ascendência asiática nunca terá olhos pretos retintos com cabelo platinado") só são garantidos pelos pesos. Adicionar `bun test` ou `vitest` e escrever um teste de consistência que rode dez mil `randomizeFromCountry` por país, é o próximo passo.

O Kurekuta em si é privado por enquanto, mas cada carta que você verá um dia nele é apenas um blob `CharacterConfig` e um `buildPng()` de existir.
