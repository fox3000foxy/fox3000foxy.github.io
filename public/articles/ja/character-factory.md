---
title: "character-factoryを作る：遺伝子付きアバター"
description: "DiceBearの上のTypeScriptモジュール：国や民族で一貫した生成、子を投影する小さな遺伝エンジン、カードゲームで使えるようにした工学的詳細。"
date: 2026-05-16
aiGenerated: true
tags:
  - typescript
  - npm
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "l6K6b0E6L5oc/4D6mzNTIphLW2aymA7jVO3BIp/0xTugqIy7O8uXVB/KTOCKDim8b2FjWHKMqpJgoE+nH14lTA=="
---

# character-factoryを作る：遺伝子付きアバターシステム

[Kurekuta](https://github.com/fox3000foxy/kurekuta/)用に、信憑性があって互いに違うアバターが何千も要った。プライベートのカードゲームプロジェクトで、各カードはキャラクターの「DNA」を持ってて、レンダーエンジンが肖像に変換する。既製パックを買えばバレる。キャラごとにDiceBearをシード生成すればめちゃくちゃになる。日本が舞台のカードがスカンジナビアの金髪になったり、「兄弟」が他人みたいになったりする。

だから[character-factory](https://github.com/fox3000foxy/character-factory)を書いた。DiceBearのLoreleiコレクションの上のTypeScriptモジュールで、DiceBear単体にない3機能を足す。**一貫した人口統計プロフィール**と**小さな遺伝エンジン**と、ゲームループから使いやすい**流暢ビルダー**だ。

## できること

最小の useful スニペットはこうだ。

```ts
import { CharacterFactory, Country, Mood } from "character-factory";

const svg = new CharacterFactory()
  .setCountry(Country.Japan)   // 民族重み付けから肌や髪や髭が一貫する
  .setMood(Mood.Happy)
  .buildSvg();
```

この単純な連鎖が、日本の人口統計で重み付けした民族を引いて、合う肌色と髪色を引いて、性別サブグループから合う髪型を選んで、目や眉や口を「嬉しい」モードに固定する。結果はSVGで出る。`sharp`が入ってれば任意サイズのPNGでも出る。

キャラクターは`CharacterConfig`オブジェクト1つに過ぎない。顔、髪、アクセサリ、見せ方だ。ビルダーが内部で変更して、JSONやbase64やファイルで出して、そのまま読み戻せる。Kurekutaでは大事だ。カードはレンダー画像じゃなく設定を保存する。だからアートは常に再現可能で、カード1枚のサイズは極小のまま保てる。

## ランダムピクセルじゃない一貫した人口統計プロフィール

DiceBearの選択肢は一様セレクタだ。肌色に`["#ffdbb4", "#2c1b18"]`を渡せば同確率でどっちかが出る。ロゴにはいいけど「ブラジルの人出して」には役立たない。

`character-factory`は国から民族から特徴へのパイプラインを内蔵してる。

```ts
// モジュール内ではこうなってる：
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
  hairColors: [/* ほぼ黒や濃茶、金髪なし */],
  hairCuts:   { male: [...], female: [...] },
  beardProbability: 0.15,
};
```

各層が重み付き抽選だ。重みは社会学の論文じゃない。「日本出身」が赤毛になったり「スウェーデン出身」が真っ黒になったりを防ぐヒューリスティックだ。パイプライン全体は1呼び出しにまとまる。`setCountry(country)`か`randomizeFromCountry(country, gender?)`だ。

## 小さな遺伝エンジン

いちばん楽しんだ機能が`projectChild`だ。2つのファクトリーが、だいたいの優劣生物学で継承される特徴の子を産める。

```ts
const parentA = new CharacterFactory().setCountry(Country.Sweden);
const parentB = new CharacterFactory().setCountry(Country.Japan);
const kid     = parentA.projectChild(parentB.getConfig());
```

中身はわざとちっぽけなモデルだ。各親は2対立遺伝子の遺伝子型を持って、両側から1つずつ引いて、優性か劣性に組み合わせる。

```ts
function combine(a: Allele, b: Allele): "dominant" | "recessive" {
  return a === "D" || b === "D" ? "dominant" : "recessive";
}
```

優劣の本当の軸がある特徴（肌、目、髪）は明示の順序リストで解く。濃いが薄いに勝ち、茶や黒目が青目に勝ち、漆黒が金髪に勝つ。

```ts
const HAIR_DOMINANCE_ORDER = [
  HairColor.LightBlonde,   // いちばん劣性
  HairColor.GoldenBlonde,
  HairColor.HoneyBlonde,
  HairColor.Auburn,
  HairColor.Red,
  HairColor.Copper,
  HairColor.LightBrown,
  HairColor.Brown,
  HairColor.DarkBrown,
  HairColor.SoftBlack,
  HairColor.JetBlack,      // いちばん優性
] as const;
```

`resolveByRank`は両親の順位を見て、「優性」組み合わせでは高い方、「劣性」組み合わせでは低い方を取る。ファンタジー色（パステルピンク、ライラック）は順序外だ。50/50のコイントスになる。正しい挙動だ。生物学的じゃないから優劣に意味はない。

そばかすはMC1Rをモデル化する。両親ともあれば75パーセント、片方だけなら25パーセント、なければ0パーセントだ。髭はSRY連動だ。子が女性なら除去、そうじゃなければ髭持ち親から継承する。髪型に生物学はない。文化の選択だから、子は自分の性別プールから引く。質感は保てれば保つ。

どれも論文になる遺伝学じゃない。感触の層だ。子は2人の他人平均じゃなく、両親のもっともらしい混ざりに見える。

## 地味だけど効いた工学的部分

目立たないけどdiffに入れる価値があった詳細がいくつかある。

**安全な`pick`。** オリジナルは空配列に`T`にキャストした`undefined`を返してた。TypeScriptの`strict`と`noUncheckedIndexedAccess`では、コンパイラが署名する嘘だ。新版は`RangeError`を投げる。3層下の`undefined`プロパティになる代わりに呼び出し元で即捕まる。

**配列を壊さない`deepMerge`。** 古い再帰はソース値がオブジェクトなら発動してた。ターゲットが`null`でも配列でもだ。`merge({tags: ["a"]}, {tags: ["b"]}`は`{tags: {0: "b"}}`を作ってた。新版は両側がプレーンオブジェクトのときだけ潜る。

**並列バッチレンダー。** `batchFactory`はPNGを直列ループでレンダーしてた。カード1000枚の書き出しはえらく時間がかかってた。今は設定可能並行数（デフォルト4）のワーカープールで、事前確保配列への書き込みで結果順序を保つ。

```ts
const worker = async () => {
  while (true) {
    const i = nextIndex++;
    if (i >= count) return;
    // レンダーして保存
    results[i] = { index: i + 1, filePath, config: clone.getConfig() };
    done++;
    onProgress?.(done, count);
  }
};
await Promise.all(Array.from({ length: concurrency }, () => worker()));
```

1000人書き出しが、コーヒー休憩から「もう終わったの」に変わった。

**何を言ってるか分かる`sharp`エラーメッセージ。** `buildPng`は`sharp`を遅延importする。SVG専用ユーザーに強いりたくない任意依存だからね。古いcatchは本当のエラーを飲んでいつも「sharp is required」とだけ言ってた。本当の失敗がバージョン衝突やネイティブバインディング問題なら、入ってるパッケージの再インストールに10分溶かすことになる。新版はインストールを促しつつ、元のエラーを含める。

## 今後

モジュールは[character-factoryリポジトリ](https://github.com/fox3000foxy/character-factory)で1.1.1だ。遺伝エンジンは反復を続けるのに最適な場所だ。テストスイートがまだないから、一貫性不変条件（「東アジア系のブラジル人キャラが漆黒目とプラチナ髪になることはない」）は重みだけで保たれてる。`bun test`か`vitest`を足して、国ごとに1万回`randomizeFromCountry`を回す一貫性テストを書くのが次の段階だ。

Kurekuta自体は今はプライベートだけど、いつかそこで見る各カードは`CharacterConfig`のblob1つと`buildPng()`1回があるだけだ。
