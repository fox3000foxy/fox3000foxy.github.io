---
title: "Sabaki vs System One: ダビデ対ゴリアテ、世界最小の意思決定モデル"
description: "20KB対421Mパラメータ。Sabakiはtyped-decisionsで7ポイント落とす代わりに、CPU 25秒から1ms未満のオフラインに落とした。組織型MoEの中身。"
date: 2026-11-12
tags:
  - ai
  - system-one
  - typescript
  - cpu
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "Ot0vB6jO6THYu3ZzZOZpEbhxn3zBuKnq55mxQQUJ7MI0Z/e4tf1XsTPr9y4y8UGW3fEO7aobq8ASAjIhGwoJwA=="
---

## はじめに

9月以降Hacker NewsやTwitterを見てたら、Jevを絶対目にしてるはずだ。

2026年9月15日、TypeSafeがJevを出した。初の「System One」だ。売り文句は一言で終わる。ラベルを選ぶためにLLMにJSONを生成させるのはもうやめろ。`state`と型付きの質問を渡せば、型付きの決定が確率つきで返ってくる。1パス、サンプルするトークンゼロ、後段のパースなし。

これが爆発した。Vercel AI Gatewayで初日の採用記録、数日でElixirクライアントが5つ、みんな自分のやつとJevをベンチマークし始めた。正直、盛り上がる理由はわかる。何年も「`{"choice": ...}`だけで答えてくれ」と祈りながらプロンプトを書いてきた。モデルが選択肢を捏造したり、JSONを壊したり、存在しないフィールドを幻覚したりしないように祈る作業だ。Jevはその需要に名前をつけて、きれいなAPIで出した。`POST /v1/systemone`、質問は`choice / score / noul`、答えは`probabilities`と`confidence`つき。

アイデアは大好きだ。エコなモデルはもっと好きだ。はっきり言うと、自分はJevに課金したことはない。

理由は単純で、Jevは中身が閉じたAPIのままだからだ。重みは非公開、セルフホスト不可、1回の決定ごとにネットワークの往復と課金メーターが回る。後追いのオープンな代替も400Mパラメータ級でGPU必須だった。

だから逆の極端を作った。[Sabaki](https://sabaki.fox3000foxy.com/)だ。キーワードルーターとTypeScript純正のロジスティック回帰で、Jevと同じ契約をしゃべる(同じ`choice / score / noul`の形、同じ`/v1/systemone`エンドポイント)。でも**1ms未満**で動いて、重みは**20キロバイト**のJSONだ。nanoモードは依存ゼロ、オフライン、0円。

サイズ感で言うと、Layaは843MBのsafetensorsをロードする。OpenDecider-nanoはRAMを2GB食う。Sabaki nano invoicesは20KBだ。重さの比率はだいたい**40000倍**違う。

きっちり数字で見たい人向けに、2026年10月のpreprint v1をサイトに置いてある。*Sabaki: An Organizational Mixture-of-Experts for Typed Decisions on CPU* ([PDF](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf))だ。設計も測定もトレードオフも全部そこにある。この記事は読み物版で、横にオープンなコードつきだ。

机上のベンチマーク論文みたいに一人で書いたわけじゃない。自分は[azalio/doomLaya](https://github.com/azalio/doomLaya)(自分のフォークは[fox3000foxy/doomLaya](https://github.com/fox3000foxy/doomLaya))にコントリビュートしてる。LayaとJevがFreeDoomを実際にプレイするハーネスで、決定はモデル持ち、tick単位のテレメトリと動画つきだ。ゴリアテが実際にプレイするところを見たし、ネットワークが咳き込むとそいつも咳き込むのを見た。

エンジンを一つずつ開けていこう。いつも通り、本物のコードつきで。

## みんなが認める土俵

JevもLayaもOpenDeciderも引用するデータセットは一つだけだ。[LocalLLaMA/typed-decisions](https://huggingface.co/datasets/LocalLLaMA/typed-decisions)。合成ワークフロー4種(サポート、請求書、セキュリティ、エージェントのトレース)、ケースごとに質問5つ、train 1200ケース、test 400ケース、決定2000件。

| モデル | パラメータ | テストスコア | レイテンシ | 動作環境 |
|---|---|---|---|---|
| OpenDecider-nano | ~400M | 0.796 | 17ms GPU | GPU、RAM 2GB |
| Laya typed-decisions | 421M | 0.766 | ~25s/state CPU、~830ms/件 MLX | GPU |
| Jev 1.13 | 非公開 | ~0.73-0.75 | ~710ms API | APIのみ |
| **Sabaki mini** | 22M int8 | **0.69** | **~20ms CPU** | CPU、22MB |
| **Sabaki nano** | ~0 | **0.61** | **<1ms** | どこでも |
| Laya base ゼロショット | 421M | 0.362 | 同じ | GPU |

ランダムは0.318、多数決は0.461だ。つまりファインチューンなしのLaya baseの0.362は「丁寧に当てずっぽう」レベルってことだ。覚えておいてほしい、後で効いてくる。

トップとSabakiの差は7ポイント。GPUがないときのレイテンシは逆方向に1000倍違う。この記事の全部はこの2文に尽きる。残りはなぜそうなるかを理解するためだ。

ただし注意がある。同じ`choice / score / noul`の口に見えて、中の台所は全然違う。Jevは閉じたAPI、LayaはファインチューンしたModernBERT-large、OpenDeciderは蒸留したEttin-encoder、Sabakiは単語カウントとMiniLM int8だ。契約は同じ、予算が比較にならない。

## Jev、みんなが食らった衝撃

TypeSafeのものはTypeSafeに返そう。System Oneの契約は本当にいいアイデアだった。

昔、チケットを振り分けるにはこうしてた。LLMに「billing、technical、spamから選んでJSONで答えて」と頼んで、返答をパースして、「billingだと思うよ! 😊」と返してきたり4つ目のカテゴリを捏造したりするケースに対処する。質問1つごとにトークン課金、返答1つごとにパイプラインが壊れる可能性があった。

Jevは条件を変えた。テキストと基準つきの質問を送ると、各質問を並列に評価して、分布つきの型付き値を返してくる。

```bash
curl https://api.typesafe.ai/v1/systemone \
 -H "Authorization: Bearer $KEY" \
 -H 'content-type: application/json' \
 -d '{"state":"charge double ce mois-ci","questions":{"dept":{"type":"choice","instructions":"Route ce message.","criteria":{"billing":"paiements","technical":"bugs"}}}}}'
```

返答は`{ choice, probabilities, confidence }`だ。自由テキストなし。コードはそのまま分岐できる。

バズった理由はここだ。PythonとJSのSDK、Claude Codeプラグイン、LangChain統合、みんな午後のうちにエージェントに繋げた。TypeSafeのドキュメントも健全なパターンを推してる。速い小さな判断はJev、本当の決定の合成は周りの決定的コード、低速LLMや人間は信頼度が低いときだ。

問題はそれ以外だ。重みは非公開、オフライン不可、従量課金。1回のrunで100回決定するエージェントだと税金が痛い。35 ticks/sのDoomだと死ぬ。doomLayaでは、JevはMAP01 seed 48を68.97秒で抜けて、HTTP p50は357msだ。runのコストは$0.0046と報告されてる。自分の請求じゃなくてベンチマークの分だ。動くし、runはきれいで死なない。でも35 ticks/sで357msは、ネットワーク待ちの間にゲームが12 tick進むってことだ。

Sabakiはこの契約だけをそのままもらった。同じ質問、同じ答え、同じ`/v1/systemone`を`serve()`で served して、データセンターが必要な部分を全部捨てた。

## Laya、APIなしでもいけることを見せたデカいオープン勢

[ Laya](https://github.com/NandhaKishorM/laya)はConvai Innovations製、Apache-2.0だ。中身はModernBERT-largeの421Mで、選択肢ごとに`[MASK]`トークンを1つ置く。各マーカーのhidden stateを小さなMLPに通して、質問の選択肢にsoftmaxする。Jevと同じで質問ごとに1パスだ。

```python
pipe = pipeline("text-classification", model="convaiinnovations/laya-typed-decisions")
```

0.766はちゃんと見たほうがいい。これはベンチマークのtrainに**ファインチューンしたチェックポイント**の数字だ。1200ケース、logitsにガウスノイズを載せたRLCD、log + sphericalリワードだ。同じモデルでもこのフィットなしだと0.362に落ちる。ほぼ当てずっぽうだ。つまりLayaのスコアは「でかいエンコーダとドメイン学習」であって「魔法のでかいエンコーダ」じゃない。

CPUだと文鎮だ。ONNX移植の実測で1 stateあたり約25秒。MLX FP16だと1件平均830ms、p99で5.3秒だ。何か答える前に843MBをロードする。

doomLayaだと、素のLayaはMAP01を180秒で失敗する。Doom用に再学習したv3 ([azalio/laya-doom-v3](https://huggingface.co/azalio/laya-doom-v3))は61.43秒で抜けて、MPSでp50 108ms、ついでにショットガンを拾ってくる。つまり、ちゃんと遊べる。専用学習の後で、Apple GPUの上で、実際に動く部分(A*、15 tickラッチのドア、自動照準)を書いたスクリプト実行部があってこそだ。

自分のまとめはこうだ。タスク学習なしのLayaは421Mのクリップボードだ。ありならめちゃ強い。でもGPUとデータが必要だ。

## OpenDecider、リーダーボードを獲ったやつ

[OpenDecider](https://github.com/manjunathshiva/opendecider)は、Manjunathがみんなの土俵に乗り込んで獲りにいったやつだ。結果は**0.796**。Ettin-encoder-400mのフルファインチューンとMLPヘッド、Qwen3-235BとDeepSeekから蒸留したソフトターゲットへのKL損失だ。

```bash
pip install opendecider
# L40Sで17ms/question、M4 Maxで18ms、バッチ化で約9ms
```

カバレッジ50%だとselective accuracyは0.943で、Jevの0.882を上回る。紙の上ではいいとこ取りだ。オープンで、キャリブレーションされていて、速い。

実際はこうだ。nanoのロードにRAM 2GB、17msを保つにはGPU必須、phishingは0.63でJevの0.90に洗われる(OODに弱い)。Layaと同じでベンチマークのtrainで学習してる。テストは見てないがドメインは見てる。

腕相撲には勝った。でもやっぱりGPU背負いの400Mだ。Cloudflare Workerにも、ノートPCのゲームループにも突っ込めない。

## 150M勢と、その下の空白

openJev-verdict-2.0 (151M)、julia-1 (144M多言語)、Open Jev (150M)、Largha-150M (144M en+zh)、Vela (0.3B-9B)。全部ModernBERTかmmBERT-smallで、全部CPUで回せて、学習も軽い(Open JevはColabのT4で30分と言ってる)。数字は自己申告でプロトコルもバラバラだから割り引いて見るべきだが、ファミリーは存在する。

汎用のSabaki generalistは**22.7M**だ。この中で一番小さいやつの約6.5分の1になる。ランタイム定義の質問に答える用途で100Mを切るやつは他にいない。

「世界最小」の意味はここだ。トップのスコアじゃない。`instructions`と`criteria`を読んで、スペシャリストが誰もわからないときに決める、一番小さい入れ物の話だ。

## Sabaki、バカ正直なルーターと使い捨てエキスパート

よし、デカい連中の話は終わり。ダビデに行こう。面白いのはここからだ。

Sabakiは世界を理解する賢いデカいモデルになろうとしない。組織型MoEだ。システムレベルのスパースルーターが1つ、独立したエキスパートが複数、入力ごとに動くのは1つだけ。各プラグインは別々のnpmパッケージで、マニフェストと重みとバージョンを持つ。ルーティングする分だけ入れればいい。

[sabaki-js](https://github.com/sabaki-js) orgは13リポジトリ。coreの`sabaki`(129コミット)、`@sabaki-js/*`のプラグイン6つ、重み、Cloudflare worker、自分のやつを書くテンプレートだ。

coreの`package.json`がもう物語ってる。

```json
"dependencies": { "@typesafe-ai/sdk": "^0.7.0" },
"optionalDependencies": { "onnxruntime-node": "^1.22.0" }
```

nanoモードはランタイム依存ゼロだ。コンパイルされたTypeScriptだけで、インストールするものなし、ONNXのバージョン間で壊れるものなし。

### ルーター、数行で決める仕組み

ルーターは`src/index.ts`に住んでて、トークン化はこんな感じ(`src/index.ts:129`)。

```ts
function tokens(s: string): string[] {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/).filter((w) => w.length > 3);
}
```

小文字化、アクセント除去、4文字以上の単語だけ残す。このフィルタでノイズ(「le」とか「de」とか「ok」)が消える。サポートチケットだとここが効く。マッチングが意味を持つ単語同士になるからだ。

スコアリング自体は`route()`の中(`src/index.ts:251`)。勝負はここで決まる。

```ts
const hits = kws.filter((k) =>
  words.some((w) => w.includes(k) || k.includes(w))).length;
const score = hits / Math.sqrt(kws.length);
```

両方向のゆるいマッチだ。`billing`は`billed`を拾うし、`invoice`は`invoicing`を拾う。ルート割りでキーワード数が多いリストを不利にしない。じゃないと600語持ちのmailプラグインが「hello」が入っただけで全部持っていく。

各プラグインにしきい値があって、デフォルトは`src/index.ts:139`の0.15、mailは件名が短いから0.03だ。それ以下だとこうなる。

```ts
return { domain: "unknown", decision: null, confidence: 0, plugin: null };
```

未知ドメインは`unknown`で、喜ばせるための捏造-guessは返さない。わざとバカにしてある。後で`automate > 0.8`のしきい値が使えるのはこのおかげだ。Sabakiが答えるときは、本当にマッチしたスペシャリストがいるってことだ。

おまけで`langid`の言語軸もある。`languages`を宣言したプラグインは自分の言語のときだけ出場する。ラテン系phishingとCJKの分離に便利だ。テキストが短すぎるときはフィルタなしで全員出場だ。

合計コストは1決定あたり数マイクロ秒だ。掛ける行列なし、呼ぶネットワークなし、文字列比較と割り算だけだ。

### Nano、リポジトリで一番好きなファイル

`src/logreg.ts:28`、トークン化はこうだ。

```ts
function tokens(s: string): string[] {
  const words = s.toLowerCase().split(/[^a-z0-9]+/)
    .filter((w) => /^[a-z]{3,}$/.test(w));
  const out = [...words];
  for (let i = 0; i < words.length - 1; i++)
    out.push(`${words[i]} ${words[i + 1]}`);
  return out;
}
```

ユニグラムとバイグラムだ。`charged twice`は`charged`と`twice`とペアの`charged twice`になる。400Mのtransformerを出さずに「二重請求」を掴むにはこれで十分だ。

`src/logreg.ts:46`のベクトル化、TF-IDFが働く場所だ。

```ts
const tf = 1 + Math.log(c);  // TFは対数で抑える
const val = tf * w.idf[i]!;  // IDFはsklearn風のスムージング
```

同じ単語の10回目は1回目より軽いし、レアな単語は「please」より重い。sklearnのレシピそのままで、20問で完全一致を確認した。

読み返して笑ったコメントがこれだ。

```ts
// 3000次元を全部舐めず、存在する語だけ触る(スパース)
for (const [t, c] of counts) {
```

チケットごとに3000次元を全部舐めず、入ってる20語くらいだけ触る。1ms未満の理由はここだ。本番だと効くタイプの見えない工夫で、計算量が語彙サイズじゃなくてチケット長さにしか依存しない。

`src/logreg.ts:86`の推論、3行で終わる。

```ts
// バイナリ: 係数1行 + シグモイド
const pPos = 1 / (1 + Math.exp(-s));
// マルチクラス: 内積 + softmax、argmax
```

内積を1回、クラス数でシグモイドかsoftmaxかを使い分ける。1パスで終わりだ。生成トークンゼロだから、壊れたJSONをリトライとパース職人芸で直す作業もゼロだ。

`train.py`のレシピはこうだ。ワークフローごとにtrain 300、test 100、決定的split(時間バイアス避けに5件に1件をtest)、語彙3000から6000、係数は1e-4に丸めて測定上の劣化ゼロだ。JSONで`{ vocab, idf, questions }`を吐く。

重みはinvoicesの20KB (`duplicate` 0.89)からmailの650KB (`bucket` 0.889)までだ。フロントのバンドルに入るサイズ感だ。

痺れた細部がある。mailだとMiniLMとTF-IDFがプラスマイナス0.02で張り合う。だからnanoはそのまま出す。メール振り分けにGPU課金とかごめんだ。逆にagent_traceは詰まる(nanoだと`needs_review` 0.59)。観測テキストが貧しくて、決定を担う単語がほぼないからだ。

重みをプラグインに変える工場は`src/plugin.ts:52`にある。

```ts
export function nanoClassifier(manifest, weights, opts = {}) {
  return definePlugin({ manifest,
    classify: (input) => {
      const r = predict(`${from}${input.state}`, weights, q);
      return { decision: r.decision, confidence: r.confidence, domain: manifest.domain };
    }});
}
```

`decide()`はnanoのまま同期、`decideAsync()`でONNXのminiが解禁される。2経路でルールは単純だ。asyncが必要ならminiが要る、要らないならnanoで足りる。書くときに覚えやすいし、壊れたときにデバッグしやすい。

理論だけじゃないのを見せるために、実際の使い方を貼る。

```ts
import { Sabaki } from "sabaki";
import customerService from "@sabaki-js/customer-service";

const sabaki = new Sabaki().register(customerService);
sabaki.decide({ state: "charged twice, refund please" });
// { decision: "billing", confidence: 0.31, domain: "customer_service" }
```

### Mini、難しいケースを変える22MB

nanoの限界はさっきのagent_traceで見た通りだ。MiniLM-L6が引き継ぐ。ドメイン全体で共有のエンコーダ1つと、質問ごとの線形ヘッドだ。8から12 epochでend-to-endファインチューン、lr 2e-5、学習はCUDA GPUでやる(推論はCPUのまま、重要なのはこっちだ)。

同じsplitで測って結論が出た数字だ。
- 凍結エンコーダとMLP: 0.65
- フルファインチューン: 0.68
- 400Mから凍結embeddingへの蒸留: 試して捨てた、goldラベルより悪かった

dynamo経由でONNX化して完全一致を確認、それから動的int8量子化だ。90MBから22MBへ、customer_serviceでaccuracy **マイナス0.004**だ。ECEは同じか改善だ。各exportは測り直す。測らない最適化に意味はない。

1.0.2から重みはパッケージ内蔵だ(`models/<workflow>-int8/`とexportされた`modelDir`)。`npm i`で終わり、機内モードOKだ。更新はパッチ公開で、trusted publishingで署名する。

具体的に言うと、`needs_review`が0.59から**0.82**になる。`disposition`は0.73から0.76だ。ECEは全部0.14未満で、OODだと健全に迷う(dragonsやレシピや空文字で0.2から0.5)。この迷いがあるから本番の強気なしきい値が許される。

### Generalist、Sabakiを本当にSystem Oneにするフォールバック

Jevたちは何にでも答える。どんな質問でも、どんな選択肢でも、ランタイム定義でだ。これがJevをバズらせたSystem Oneの契約で、`instructions`と`criteria`と選択肢を渡せば切り分けてくれる。

Sabakiのスペシャリストはそれができない。知ってるのは自分の質問(`category`とか`duplicate`とか`bucket`)だけだ。網がなければ台本から外れた瞬間に`unknown`を返して、Jevなら何か返すところで止まる。

generalistはその網だ。質問と選択肢とstateを読んでスコアを出すcross-encoderで、選択肢ごとに1パス、softmaxしてargmaxだ。22.7MのMiniLM int8で、150M前後の連中の6.5分の1だ。でも仕事はスコアじゃない、互換性だ。これをフォールバックに繋ぐと、`POST /v1/systemone`がJevと同じで任意のstateと任意の質問を受け付ける。`model`フィールドが本当に答えたやつを言う(`@sabaki-js/mail@1.1.2+mini`とか`sabaki-generalist-v1`とか)から、呼ぶ側は変えなくていい。

大事なのは、こいつはフォールバックであってボスじゃないってことだ。`decideAsync()`の鉄則はこうだ。スペシャリストがルーティングに勝ったらそいつが答える。generalistがしゃべるのは`unknown`のときだけだ。逆はやらない。中の上のジェネラリストが、得意領域の優秀なスペシャリストを潰さないためだ。

ローダーは`src/generalist.ts`にいて、ONNXセッションを毎回ロードしないようにフォルダ単位でキャッシュする。

```ts
export function loadGeneralist(modelDir: string) {
  // フォルダ単位でキャッシュ、ONNXセッションを使い回す
  // tokenizer.jsonからUnigramかwordpieceかを自動判定
  const sess = await ort.InferenceSession.create(
    path.join(modelDir, "generalist.onnx"),
    { intraOpNumThreads: 2 },
  );
}
```

`SABAKI_GENERALIST_DIR`を`generalist.onnx`と`tokenizer/`が入ったフォルダに向ければ、モデルは差し替え可能だ。idは`config.json`から来て、なければ`"sabaki-generalist"`になる。`Map`のキャッシュで毎callの再ロードを避ける。

入力形式は古典的なcross-encoderだ。質問と選択肢とstateをセパレータで繋いで、スコア付けたい選択肢の数だけ行を作る。

```ts
const texts = options.map(
  (o) => `${input.question ?? "decision"} [SEP] ${o} [SEP] ${input.state}`,
);
```

質問と選択肢とstateを`[SEP]`で区切って、選択肢ごと1行だ。選択肢は8個で頭打ち(`slice(0, 8)`)、何もなければ`["yes", "no"]`だ。それ以上は呼ぶ側で刻んでくれ。型付き決定に8枠はもう広い。

次は地味に効くバッチ化だ。見た目は地味だがレイテンシを選択肢数で割る。選択肢ごとに`session.run`せず、全部1 forwardで流す。

```ts
// 全オプションを1回のバッチforwardで処理
// (最大長までパディング) オプション毎にrunしない
const L = Math.max(...encs.map((e) => e.ids.length));
// ids + attention_maskは[options.length, L]、padIdでパディング
const out = await sess.run({ input_ids, attention_mask });
const scores = Array.from(out["score"].data).map(Number);
```

各テキストをエンコードして(BERT風wordpieceか、`tokenizer.json`次第でSentencePiece unigram)、バッチの最大長までパディングして、`[選択肢数, L]`のテンソルに積む。`sess.run`は1回で、選択肢ごとのスコアが返る。CPUだとこれが全部だ。20から36msが、その8倍にならずに済む。

それからsoftmaxとargmaxで、Jevが広めた形式そのままで全選択肢の確率を出す。

```ts
const pr = softmax(scores);
// bi = 最大値のインデックス
const confidence = Math.round(pr[bi] * 1000) / 1000;
const probs = Object.fromEntries(
  options.map((o, i) => [o, Math.round(pr[i] * 1000) / 1000]),
);
```

デモで終わらせず本番で使えるようにする細部が`abstainAt`だ。

```ts
if (input.abstainAt !== undefined && confidence < input.abstainAt) {
  return { decision: null, confidence, domain: "generalist", probabilities: probs };
}
```

オプトインで、デフォルトの棄権なしだ。`abstainAt: 0.6-0.7`を渡すと、ふわっとしたやつはguessじゃなくて`null`で返る。分布外だと間違ってるときに1.00を出すsoftmaxだから、これは贅沢品じゃない。GUIDEは自律用途の全部に推奨してる。しきい値以下は自動解決じゃなくて確認を聞けってことだ。

最後に、generalistフォールバックありの同じ組み立てだ。スペシャリストが誰もマッチしないとき、こいつが`unknown`の代わりに受ける。

```ts
import { Sabaki, definePlugin, loadGeneralist } from "sabaki";
import mail from "@sabaki-js/mail";

const backend = loadGeneralist(process.env.SABAKI_GENERALIST_DIR!);
const generalist = definePlugin({
  manifest: { name: "@sabaki-js/generalist", domain: "generalist",
    version: "0.1.0", questions: ["decision"], keywords: [] },
  classify: (input) => backend.decide(input),
});

const sabaki = new Sabaki().register(mail).setFallback(generalist);

await sabaki.decideAsync({
  state: "le client dit que l'app a supprimé ses données",
  question: "c'est urgent ?",
  options: ["yes", "no"],
  abstainAt: 0.65,
});
// mailスペシャリストがマッチすればそちら、ダメならgeneralistがJev風のcatch-allで受ける
```

generalistの世代は全部同じ測り方だ。PhishNChips (2000通)と、比較できる分はtyped-decisionsのtestで測ってる。
- v4: test 0.29、phishing R=0.026。外してた、捨てだ。
- A (22M 80k): 0.546、R=0.406。形になってきた。
- mini v1 served: **0.536、R=0.616**。サイトで動いてるのはこれだ。phishingのrecallはまとも、testは並だ。
- B (144M scratch): 0.568、R=0.062。でかくてtestはちょい上、phishingはダメだ。

144Mのscratchが転移で勝てないのを見て「パラメータを積めば汎化する」の夢は冷めた。同じタスクだと、デカいやつは金がかかって当てない。catch-allとしても小さいやつで足りる。あとこいつはEN専用(`all-MiniLM-L6-v2`)で、ルーティングもEN、FRは分布外だ。FRはgeneralistじゃなくて、そこで学習したスペシャリストに回してくれ。

## Doom、自分にとって本当に大事なテスト

doomLayaは、LayaとJevがFreeDoomを本気で遊ぶ場所だ。モデルが`command / target / weapon`を選んで、実行部がA*で寄せてドアを開けて狙って撃つ。tick単位のテレメトリ、動画、runのSHAつきだ。自分も貢献してるから、遠くのリーダーボードを眺めた話じゃない。

v0.1.0、MAP01 seed 48、skill 3、35 ticks/s、同じ実行部だ。

| モデル | 結果 | p50 HTTP | APIコスト |
|---|---|---|---|
| Laya stock | 失敗 180s | 106ms | $0 |
| Laya v3 adapted | 脱出 61.43s | 108ms | $0 |
| Jev 1.13 | 脱出 68.97s | 357ms | $0.0046 |

2つともきれいな脱出で死なない。Layaは実行部がpickupをやるからショットガンを拾ってくる。正直に言うと、Laya v3はDoomで学習してるしJevはしてない。1 seedの1 mapじゃ一般的なことは言えない。プロジェクトのREADMEも黒白はっきり書いてて、盛らないのは立派だ。

Sabaki側 ([plugin-doom](https://github.com/sabaki-js/plugin-doom))はこうだ。PythonのViZDoomが毎tick JSサーバーを叩く。nanoは約18k req/s、miniはi5の1スレッドで約71 req/sだ。35Hzのtickは平均的なノートでも余裕で回る。

出口コンパスありだと、miniは6回中2から4回脱出、nanoは0/6だ。道理だ。テキスト化で空間情報が落ちるし、doomLayaの状態文はMiniLMでもModernBERT-baseでも0.57あたりで頭打ちになる。空間情報がないのにテキスト分類器がそれを発明するわけがない。

隣の連中も同じデータで殴り返してきた。[doomgemma](https://github.com/dexmac221/doomgemma)はRTX 4070で27分のLoRAを当てて、Gemma 4 E2BをゲームではLaya v3並み(6/6対6/6)、単体決定だと上まで持っていった。同じサイズだとデコーダはLayaと同じ速さだ(270Mで22ms対23ms)。同じ結果なら小さいモデルで届くLayaが約3倍速い。

自分の読みはこうだ。アーキテクチャよりタスク学習が効く。学習済みの小さいスペシャリストは、初見のデカいジェネラリストに勝つ。Sabakiの賭けそのものだ。後追いの論文*System Switch* ([arXiv:2610.09683](https://arxiv.org/abs/2610.09683))はこの理屈を最後まで押してる。速い小さいモデルが遊んで、ゲートが開いたらデカい推論モデルが引き継ぐ。Sabakiのpre-triage (`automate > 0.85、ダメならエスカレ`)のゲーム版だ。

## 犠牲にしたもの

ない機能が別の機能を払う。これがCPU狙いのルールだ。正直リストを置く。BareironでCの1行1行がトレードオフだったのと同じだ。

**Sabakiは語らない。**渡された選択肢から確率つきで切り分けるだけだ。説明も要約も自由文も要るならLLMを呼んでくれ。

**フランス語はgeneralistの分布外のままだ。**ルーティングはEN (`all-MiniLM-L6-v2`)で、似たケースの1/4 FR対3/4 ENのプローブ通りだ。mailプラグインはほぼFRの会社のものだが匿名化してる。PIIゼロ、その代わり個人語彙なしでaccuracyマイナス0.024だ。匿名化のコストは払う。ここは譲れない。

**softmaxは縄張りの外だと自信満々になる。**外れなのに1.00を出すのを見た、ある。だからGUIDEのpre-triage推奨だ。`abstainAt: 0.6-0.7`でしきい値以下を`null`にして、自動化は`confidence > 0.85`のゲート、人間は残りだ。実測の参照値はphishingで精度0.87のときrecall 0.62だ。列を半分にする用であって、レビューアを消す用じゃない。

**nanoはエージェントのトレースが苦手だ。**質問によって0.34から0.59だ。miniで`needs_review`は0.82まで戻るが、`risk / urgency / action`は難しいままだ。観測テキストが語彙シグナルとして貧しいだけだ。

**テキストのDoomは頭打ちだ。**MiniLMもModernBERT-baseも0.57あたりだ。ピクセルなしのテキストのままだとMAP02で詰まる。本物のプレイヤーへのまっとうな道はvisionとRL (tiny-doom-defender、ピクセルからの1.1M params)であって、もっといいテキスト分類器じゃない。

**ベンチマークはバッチでドリフトする。**typed-decisionsはロット生成で、時間splitは実質バッチsplitだ。`drift_tool.py`はcustomer_serviceで0.82、agent_traceで0.67を出す(0.5が区別不能)。実測の帰結として、公開重みは公式splitの0.61に対して混合だと0.733になる。公式数字は保守的ってことだ。Plattやtemperature+biasのキャリブレーションはバッチ間で転移しない。だから最近バッチで取ったtemperature scalingだけ出す。社内ルールはこうだ。まず`drift_tool.py`、0.6超えで警告、0.8超えで停止だ。他の誰も出してないが、全員出すべきだ。

## 最終結果、数字で見る

片方にノートのi5、片方に従量課金のAPIだ。各モードの実際はこうなる。

- nano: 1ms未満、約18k req/s、20から650KB、依存0
- mini: 約20ms、約71 req/s、22MB int8、onnxruntimeは任意
- generalist: 20から36ms、22.7M、知る限り最小のオープンな汎用器だ

複数ドメイン積みだと、全部載せの約2GBじゃなくてドメインごとに約0.5GBの遅延ロードだ。決定的で、同じ入力100個は同じ出力を返す。質問ごとのしきい値、`confidence`のゲート、何も刺さらないときの`unknown`だ。

Bareironだとプレイヤー1人ごとに200msのchunkがかかって、3人以上で詰まった。ここだとドメイン3つ以上が軽く回る。エキスパートが tiny で必要分だけ載るからで、全部一気載せじゃない。「足りる小さいやつ」の思想は同じで、相手のハードが違うだけだ。

## 思想

p2r3の言葉だ。*「1ドルくらいのちっちゃいチップでMinecraftみたいなのが動くって発想が好きなんだ。」*

ここも同じノリだ。20KBのJSONと100行ちょいのTSが、ラベル1つのためにGPU呼び出しを置き換えるって発想が好きなんだ。もちろん全部は置き換えない、ふざけるなって話だ。置き換えるのはあの面倒なやつだ。ミリ秒で、ローカルで、祈る代わりにしきい値で扱える信頼度つきのラベルが欲しいやつだ。

トレードオフを黒白はっきり書く。
- エンコーダから単語カウントへ: 7ポイント減、レイテンシ1000分の1、インフラゼロ
- 単体のデカいモデルからnpmプラグインへ: ゲートは粗い、運用は無限に楽
- 生成から型付き決定へ: 壊れるパースと捏造選択肢は終わり
- 素の信頼度からpre-triageへ: まず棄権、0.85超えで自動化、残りは人間

**覚えることは3つだけだ。**

1. **7ポイント減、1000倍速い** : 0.61/0.69対0.75-0.80だが、従量APIやCPU 25秒に対してCPUで1ms未満/20msのオフラインだ。コストなしのスコアに意味はない。
2. **単純ルーターと分離エキスパート** : `hits / sqrt(keywords)`としきい値と`unknown`だ。各プラグインは単独で学習して版管理して出す。mailだとTF-IDFがMiniLMに張りつく。ここにGPUは要らない。
3. **オフライン優先と正直なキャリブレーション** : `npm i`、重み内蔵、GPUゼロ、ECE 0.14未満、棄権、drift toolだ。35HzのゲームループをGPUなしで回せる比較対象はこの構成だけだ。

興味が出たら、全部MITで[github.com/sabaki-js](https://github.com/sabaki-js)にある。測定とbibtexつきの学術版は[preprint v1](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf)だ。ゴリアテがDoomを本気で遊ぶのを見たかったら[azalio/doomLaya](https://github.com/azalio/doomLaya)へ xD
