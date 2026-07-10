---
title: character-factoryの構築：遺伝子を持つアバター
description: DiceBear上に構築したTypeScriptモジュール：国・民族に基づいた一貫性のある生成、子供を投影する小さな遺伝子エンジン、そしてカードゲームで使えるようにしたエンジニアリングの詳細。
date: 2026-05-16
aiGenerated: true
tags:
  - typescript
  - npm
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "4nwtir0veqKNoX8Yq4VGYUw4xtIMmA7jha2uq5jMqXegxwv7dtVUN8OdjOIne4Ry6LcPmr7udTDE3s+6U9Tl6g=="
---

# character-factoryの構築：遺伝子を持つアバター

[Kurekuta](https://github.com/fox3000foxy/kurekuta/)のために、何千もの信憑性のある個性的なアバターが必要だった----これは非公開のカードゲームプロジェクトで、各カードにキャラクターの「DNA」が入っていて、レンダラーがそれを肖像画に変換する仕組みだ。ストックパックを買うと、どうしてもありきたりに見えてしまう。DiceBearのシードごとのアバターを1回限り生成すると、変な方向にランダムすぎる：日本風のカードなのにスカンジナビアのブロンドが出てきたり、「兄弟」なのにまったくの他人に見えたりする。

そこで[character-factory](https://github.com/fox3000foxy/character-factory)を書いた----DiceBearのLoreleiコレクションの上に乗せるTypeScriptモジュールで、DiceBear単体ではできない3つのことを追加している：**首尾一貫した人口統計**、**小さな遺伝子エンジン**、そして**ゲームループで使いやすい流暢なビルダー**だ。

## 何ができるか

最小の実用的なコード：

```ts
import { CharacterFactory, Country, Mood } from "character-factory";

const svg = new CharacterFactory()
  .setCountry(Country.Japan)   // 重み付けされた民族 → 一貫した肌/髪/髪型/髭
  .setMood(Mood.Happy)
  .buildSvg();
```

この1連のチェーンで、日本の人口構成で重み付けされた民族を選び、調和のとれた肌の色と髪の色を引き出し、適切な性別のサブプールから髪型を選び、目/眉毛/口を「ハッピー」な組み合わせに固定する。結果はSVGとして、または`sharp`がインストールされていれば任意のサイズのPNGとしてレンダリングされる。

キャラクターは単なる`CharacterConfig`オブジェクト----顔、髪、アクセサリー、プレゼンテーション。ビルダーが内部でそれを変更し、JSON、base64、またはファイルとして取り出して、同じ方法で再読み込みできる。Kurekutaではこれが重要だ：カードはレンダリング画像ではなく設定を保存するので、アートは常に再現可能で、カードのファイルサイズは超小さく保たれる。

## ただのランダムピクセルじゃなく、首尾一貫した人口統計

DiceBearのオプションは均一なピッカーだ。`["#ffdbb4", "#2c1b18"]`を肌の色に渡すと、どちらかが等確率で出る----ロゴには問題ないが、「ブラジルのキャラクターをくれ」には使えない。

`character-factory`は国→民族→特徴のパイプラインを搭載している：

```ts
// モジュール内の実際のデータ：
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
  hairColors: [/* ほとんど黒/ダークブラウン、ブロンドなし */],
  hairCuts:   { male: [...], female: [...] },
  beardProbability: 0.15,
};
```

各レイヤーは重み付けされた抽選だ。重みは社会学の論文じゃない----「日本出身」から赤毛が出たり、「スウェーデン出身」から漆黒の髪が出たりしないようにするヒューリスティックだ。パイプライン全体が1回の呼び出しに集約される：`setCountry(country)`または`randomizeFromCountry(country, gender?)`。

## 小さな遺伝子エンジン

一番楽しんで作った機能：`projectChild`。2つのファクトリーが子供を生成でき、その特徴は大まかな生物学的優性で継承される：

```ts
const parentA = new CharacterFactory().setCountry(Country.Sweden);
const parentB = new CharacterFactory().setCountry(Country.Japan);
const kid     = parentA.projectChild(parentB.getConfig());
```

内部では意図的に小さなモデルになっている。各親は2アレル遺伝子型を持っていると見なされ、それぞれ片方の側から引かれ、優性か劣性かに組み合わされる：

```ts
function combine(a: Allele, b: Allele): "dominant" | "recessive" {
  return a === "D" || b === "D" ? "dominant" : "recessive";
}
```

実際の優性軸を持つ特徴（肌、目、髪）は、明示的な順序付きリストに対して解決される----暗い方が明るい方より優性、茶色/黒の目が青より優性、漆黒の髪がブロンドより優性：

```ts
const HAIR_DOMINANCE_ORDER = [
  HairColor.LightBlonde,   // 最も劣性
  HairColor.GoldenBlonde,
  HairColor.HoneyBlonde,
  HairColor.Auburn,
  HairColor.Red,
  HairColor.Copper,
  HairColor.LightBrown,
  HairColor.Brown,
  HairColor.DarkBrown,
  HairColor.SoftBlack,
  HairColor.JetBlack,      // 最も優性
] as const;
```

`resolveByRank`は各親のインデックスを見つけ、「優性」のアレル組み合わせでは高い方を、「劣性」では低い方を選ぶ。ファンタジー色（パステルピンク、ライラック）は順序に含まれていない----50/50のコイントスにフォールバックする。これが正しい動作だ：生物学的じゃないから、優性は意味を持たない。

そばかすはMC1Rをモデル化：両親が持っていれば75%、片方だけなら25%、どちらもなければ0%。髭はSRY連鎖：子供が女性なら削除、そうでなければ髭がある方の親から継承。髪型は全く生物学的ではない----文化的選択なので、子供は自分の性別プールから選び、可能ならテクスチャを保持する。

どれも論文レベルの遺伝学じゃない。感覚レイヤーだ：子供が見知らぬ二人を平均したようには見えず、両親の妥当なミックスに見える。

## 地味だけど重要だったエンジニアリング部分

派手じゃないけど、差分に含める価値があったいくつかのこと：

**より安全な`pick`。** 元の実装は空の配列で`undefined`を`T`としてキャストして返していた。TypeScriptで`strict` + `noUncheckedIndexedAccess`を使うと、それはコンパイラが承認する嘘になる。新しいバージョンは`RangeError`をスローする----3階層下で`undefined`のプロパティを生成する代わりに、呼び出し元で即座に捕捉される。

**配列を壊さない`deepMerge`。** 以前の再帰は、ターゲットが`null`や配列でも、ソース値がオブジェクトなら常に発火していた。`merge({tags: ["a"]}, {tags: ["b"]})`が`{tags: {0: "b"}}`を生成していた。新しいバージョンは両方がプレーンオブジェクトの場合のみ再帰する。

**並列バッチレンダリング。** `batchFactory`はPNGをシリアルループでレンダリングしていて、1000枚のカードエクスポートに数分かかっていた。今は設定可能な並行数（デフォルト4）のワーカープールで、結果の順序を維持するために事前確保された配列に書き込む：

```ts
const worker = async () => {
  while (true) {
    const i = nextIndex++;
    if (i >= count) return;
    // レンダリングして保存
    results[i] = { index: i + 1, filePath, config: clone.getConfig() };
    done++;
    onProgress?.(done, count);
  }
};
await Promise.all(Array.from({ length: concurrency }, () => worker()));
```

1000キャラクターのエクスポートで、コーヒーブレイクが「もう終わったの？」になる。

**意味のあるエラーメッセージを出す`sharp`。** `buildPng`は`sharp`を遅延インポートする。なぜなら、SVGのみのユーザーに強制したくないピア的依存関係だからだ。以前のcatchは実際のエラーを飲み込んで、常に「sharpが必要です」とだけ言っていた。実際の失敗がバージョンの不一致やネイティブバインディングの問題でも、すでにインストールされているものを10分かけてインストールすることになる。新しいバージョンはインストールを促すが、根本的なエラーも含める。

## 今後の予定

モジュールは[character-factoryリポジトリ](https://github.com/fox3000foxy/character-factory)でv1.1.1。遺伝子エンジンは明らかに改良を続ける場所だ----まだテストスイートがないので、「ブラジルの東アジア寄りのキャラクターが漆黒の目とプラチナブロンドの髪の組み合わせにならない」といった一貫性の不変条件は重みによってのみ強制されている。`bun test`や`vitest`を追加して、国ごとに`randomizeFromCountry`を1万回実行する一貫性テストを書くのが次のステップだ。

Kurekuta自体は今のところ非公開だが、いずれ表示されるすべてのカードは`CharacterConfig`ブロブと1回の`buildPng()`呼び出しで存在できるようになる。
