---
title: "Construindo character-factory : avatares com genética"
description: "Um módulo TypeScript sobre DiceBear : geração coerente
  por país/etnia, um pequeno motor de genética para projetar filhos, e
  os detalhes de engenharia que o tornaram utilizável em um jogo de cartas."
date: 2026-05-16
aiGenerated: true
tags:
  - typescript
  - npm
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "isutV12Ph1z9zYJs+/frdFSNFain9yUXLngOHiA7Qu0/nQAtKX3FfIjBLEr3L0fu+Q3KiUPAvgpuINVOjfCHKg=="
---

# Construir character-factory : avatares com um sistema genético

Eu precisava de milhares de avatares críveis e distintos para o [Kurekuta](https://github.com/fox3000foxy/kurekuta/), um projeto privado de jogo de cartas onde cada carta contém um "DNA" de personagem que o motor de renderização transforma em retrato. Comprar um pack pronto ia ficar na cara. Gerar avatares DiceBear com seed por personagem dava qualquer coisa : uma carta de universo japonês podia cair em uma loira escandinava, e dois "irmãos" pareciam desconhecidos.

Então escrevi o [character-factory](https://github.com/fox3000foxy/character-factory), um módulo TypeScript sobre a coleção Lorelei do DiceBear que traz três recursos que o DiceBear sozinho não dá : **perfis demográficos coerentes**, **um pequeno motor de genética**, e **um builder fluente** gostoso de usar em um loop de jogo.

## O que faz

O menor snippet útil :

```ts
import { CharacterFactory, Country, Mood } from "character-factory";

const svg = new CharacterFactory()
  .setCountry(Country.Japan)   // etnia ponderada → pele/cabelo/corte/barba coerentes
  .setMood(Mood.Happy)
  .buildSvg();
```

Essa simples cadeia sorteia uma etnia ponderada pela demografia japonesa, tira um tom de pele e uma cor de cabelo que combinam, escolhe um corte no subgrupo de gênero certo, e depois trava olhos/sobrancelhas/boca no modo "feliz". O resultado sai em SVG ou, com o `sharp` instalado, em PNG em qualquer tamanho.

Um personagem é só um objeto `CharacterConfig`, rosto, cabelo, acessórios, apresentação. O builder modifica internamente, e você pode exportar em JSON, base64 ou arquivo, e depois recarregar idêntico. Para o Kurekuta isso é crucial : uma carta guarda a config, não a imagem renderizada. Assim a arte é sempre reproduzível e o tamanho de uma carta continua minúsculo.

## Perfis demográficos coerentes, não pixel aleatório

As opções do DiceBear são seletores uniformes. Passe `["#ffdbb4", "#2c1b18"]` para a cor da pele e você vai ter um ou outro com a mesma probabilidade, ok para um logo, inútil para "me dá um personagem do Brasil."

O `character-factory` embute um pipeline país → etnia → traços :

```ts
// O que há no módulo :
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
  hairColors: [/* principalmente preto/castanho escuro, nada de loiro */],
  hairCuts:   { male: [...], female: [...] },
  beardProbability: 0.15,
};
```

Cada camada é um sorteio ponderado. Os pesos não são uma tese de socio, é uma heurística que impede "vindo do Japão" de produzir um ruivo e "vindo da Suécia" de produzir um preto azeviche. Todo o pipeline se resume a uma única chamada : `setCountry(country)` ou `randomizeFromCountry(country, gender?)`.

## Um pequeno motor de genética

A função com que mais me diverti : `projectChild`. Duas factories podem produzir um filho cujos traços são herdados com uma dominância biológica aproximada :

```ts
const parentA = new CharacterFactory().setCountry(Country.Sweden);
const parentB = new CharacterFactory().setCountry(Country.Japan);
const kid     = parentA.projectChild(parentB.getConfig());
```

Por baixo do capô, é um modelo de propósito minúsculo. Cada pai carrega um genótipo de 2 alelos, um tirado de cada lado, combinado em dominante ou recessivo :

```ts
// Combina dois alelos : "D" dominante vence, senão recessivo
function combine(a: Allele, b: Allele): "dominant" | "recessive" {
  return a === "D" || b === "D" ? "dominant" : "recessive";
}
```

Os traços que têm um eixo real de dominância (pele, olhos, cabelo) são resolvidos por uma lista ordenada explícita, o escuro domina o claro, os olhos castanhos/pretos dominam o azul, o preto azeviche domina o loiro :

```ts
// Ordem de dominância do cabelo : do mais recessivo ao mais dominante
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

`resolveByRank` acha o índice de cada pai, pega o mais alto em uma combinação de alelos "dominante" e o mais baixo em "recessiva". As cores fantasy (rosa pastel, lilás) não estão na ordem, elas fazem cara ou coroa 50/50, que é o comportamento certo : não são biológicas, então dominância não faz sentido.

As sardas modelam MC1R : 75% se os dois pais têm, 25% se só um tem, 0% se nenhum. A barba está ligada ao SRY : removida se o filho for mulher, senão herdada do pai que tinha. O corte de cabelo não tem nada de biológico, é uma escolha cultural, então o filho sorteia no próprio pool de gênero, preservando a textura se possível.

Nada disso é genética digna de publicação. É uma camada de sensação : as crianças parecem uma mistura plausível dos pais, não a média de dois desconhecidos.

## As partes de engenharia menos glamourosas que contaram

Alguns detalhes pouco visíveis mas que mereceram seu lugar no diff :

**Um `pick` mais seguro.** O original devolvia `undefined` convertido em `T` em array vazio. Com `strict` + `noUncheckedIndexedAccess` em TypeScript, é uma mentira que o compilador assina. A nova versão lança um `RangeError`, pego na hora no local da chamada em vez de produzir props `undefined` três níveis abaixo.

**Um `deepMerge` que não corrompe arrays.** A recursão antiga ativava assim que o valor de origem era um objeto, mesmo que o destino fosse `null` ou um array. `merge({tags: ["a"]}, {tags: ["b"]})` produzia `{tags: {0: "b"}}`. A nova versão só recorre quando os dois lados são objetos simples.

**Render batch em paralelo.** `batchFactory` renderizava os PNG em loop serializado, uma exportação de 1000 cartas levava uma eternidade. Agora é um pool de workers com concorrência configurável (4 por padrão), que preserva a ordem dos resultados escrevendo em um array pré-dimensionado :

```ts
// Worker do pool : pega o próximo índice, renderiza e salva no lugar certo
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

Em uma exportação de 1000 personagens, isso transformou uma pausa para o café em um "já acabou ?"

**Uma mensagem de erro `sharp` que diz alguma coisa.** `buildPng` importa o `sharp` de forma preguiçosa porque é uma dependência opcional que você não quer impor a usuários só de SVG. O catch antigo engolia o erro real e dizia sempre "sharp is required." Se a falha real era um conflito de versão ou um problema de bindings nativos, você passava dez minutos reinstalando um pacote já instalado. A nova versão continua mandando instalar, mas inclui o erro subjacente.

## O próximo passo

O módulo está em 1.1.1 no [repositório character-factory](https://github.com/fox3000foxy/character-factory). O motor genético é o lugar ideal para continuar iterando, ainda não há suíte de testes, então os invariantes de coerência ("um personagem brasileiro de ascendência leste-asiática nunca vai ter olhos pretos azeviche com cabelo platinado") só são garantidos pelos pesos. Adicionar `bun test` ou `vitest` e escrever um teste de coerência que roda dez mil `randomizeFromCountry` por país é o próximo passo.

O próprio Kurekuta está privado por enquanto, mas cada carta que você um dia vir nele é só um blob `CharacterConfig` e um `buildPng()` de existir.
