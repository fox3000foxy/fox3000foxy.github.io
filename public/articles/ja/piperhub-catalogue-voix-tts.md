---
title: "PiperHub:オープンソースTTS音声536種、1モデルで7感情、GPU不要、料金ゼロ"
description: "VITS、espeak、ONNX、LJSpeech: PiperがRaspberry Piをどう喋らせるか。7感情のFortune multi、Kokoro 82M、PocketTTS、sanoTTS、ElevenLabs、そして公式Pythonラッパーより10倍速いネイティブpipertts。"
date: 2026-11-12
tags:
  - tts
  - piper
  - open-source
  - typescript
  - ai
  - catalogue
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "uffI7xdqvEv2HGv5tn6O+Lo5aZygO1g0x+LBpwbyMc5t6lmQodOAQCdCvBwq7DcuUJCj+ftxjBeBUUDIcYrsTA=="
---

## Introduction

Discordボットを喋らせるのは金がかかる。テキストは安い。ローカルLLMならGPU代は数セントで文を作れる。でも声は一文ごとに課金される。合成APIは文字数課金だし、ボットが一晩中喋れば請求もそれに付いてくる。

これは私がLuna Protocolで直面した問題だ。私のDiscordボットはローカルLLMでメッセージを作り、Piperの声で読み上げ、OGGに変換してボイスメッセージとして送る。全部自分のサーバー上で、1文あたり0ユーロで動く。Lunaが午前3時に一人で自分の人生を語り出しても同じだ。

0ユーロを維持するには、無料の声を見つけて自分でホストするしかない。そこで面倒になった。モデルは数十のHugging Faceリポジトリに散らばり、ライセンスは曖昧で、ある声がどこから来たのか、今も動くのかを知る手段がない。だから私は[PiperHub](https://piperhub.org/)を作った。Piper TTS用音声のオープンソースカタログだ。

今日の数字:**モデル536件**、**言語71種**、**スピーカー3755人**。出自が分かるモデルはすべて元のデータセットにリンクしている。出自は音の一部だ、とトップページにも書いてある通りだ。

よく聞かれる質問が一つ残っている。Kokoro、PocketTTS、sanoTTS、ElevenLabsに対してPiperはどうなのか。そしてFortuneの`pipertts`モジュールはなぜ公式Pythonラッパーより10倍速いのか。この記事ではコードと一緒に中身を開けて見せる。

## PiperHub、カタログ

エンジンを開ける前に、PiperHubが解く問題を見てみよう。

### 声はどこから来るのか

コードは[github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank)にある。Astro製の静的サイトでサーバーはゼロ。英語がルートにあり、`/ <code>/`以下に他15ロケール(fr、de、es、it、pt、ru、tr、ja、ko、zh、id、hi、ar、vi、th)。実は私のブログと同じパターンだ。

信頼できる唯一の情報源は、誰も手で編集しない。パイプラインだ。

```bash
npm install
npm run data    # src/data/*.json を再生成 (python3 scripts/generate_data.py)
npx astro dev   # ローカル開発
npm run build   # dist/ に静的ビルド
```

実際にはこうなっている。crawlerリポジトリが`models_mapping.csv`と`datasets_mapping.csv`を管理し、ミラーされた音声はHugging Faceにあり、サンプルは音声ファイルだ。`npm run data`が全部引っ張ってきて`src/data/*.json`を吐き出す。サイトは静的JSONを読むだけだ。

現時点の生データ(555件、サイト表示は536件。クロールは表示より少し先行する)では:

| Qualité | Modèles |
|---|---|
| medium | 437 |
| high | 67 |
| low | 50 |

| Sample rate | Modèles |
|---|---|
| 22050 Hz | 486 |
| 16000 Hz | 47 |

22050 Hzの声が486件、Piperの標準だ。16000 Hzが47件、組み込み向けの軽い高速な声だ。フォネマイザーは509件で`espeak`を使っている。ここに戻ってくる。これがシステムの心臓だ。

### 出自、つまり各モデルがデータセットを持つ理由

PiperHubをただのリストではなく役立つものにしているのが、モデルとデータセットのリンクだ。トップの例で言うと、**Astra - Valorant Piper TTS**という声は**Astra - LJSpeech Dataset**というデータセットにリンクしている。両方のページを開いて、リポジトリとライセンスを両側で確認できる。

参照データセットは130件。そしてカタログは現状に正直だ。25モデルに`usable: false`のフラグが付いている(壊れたファイル、またはforkランタイムが必要な`piperPlus`形式)。`pipertts`モジュールはこういう声を後で変にクラッシュする代わりに明示的なエラーで拒否する。48モデルがマルチスピーカーで、そのうち2つがこれから重要になる。

ガイド面では、サイトは3ステップで仕事をしている。**Build a dataset**、**Train a voice**、**Use a voice**、あとPiper Plusのページだ。入力はLJSpeech形式のデータセット、出力はONNX。言うのは簡単で、やるのは長い。だから次のセクションがある。

## Piperの中身:VITS、espeak、ONNX

### 一文、三ステップ

Piperに「bonjour」と言わせると、こうなる。

```
"bonjour"
  -> [phonémisation espeak-ng] -> b O~ Z u R
  -> [encodeur VITS + flow + décodeur] -> waveform 22050 Hz
```

別のボコーダーはゼロ。これがVITSだ。テキスト(音素化済み)から波形まで直接行くエンドツーエンドモデルだ。昔のパイプラインはテキストからスペクトログラム(Tacotron)、スペクトログラムから音声(HiFi-GAN、モデル2つ、学習2回)だったが、VITSは条件付きVAE、normalizing flow、デコーダー上のGAN風discriminatorで全部一気に学ぶ。学習1回、モデル1つ、ONNXエクスポート1つだ。

デコーダーは22050 Hzを直接吐く。このサンプルレートでは、1秒の発話は22050個の数値だ。モデルは小さい(medium品質で数十MB)し、推論は純粋なCPU処理だ。最適化されたONNXグラフ上の行列積だ。だからRaspberry Piが公式ターゲットなのだ。PiperはRhasspy生まれで、Pi上で動くためのオープンソース音声アシスタント向けに作られた。

### espeak-ng、汚れ仕事をするフォネマイザー

VITSの前に、テキストを音素に変える必要がある。555モデルのうち509が`espeak`を使っている。

```bash
echo "bonjour" | espeak-ng --ipa -v fr
# bO~'ZuR
```

espeak-ngは数十言語の発音を知っている。VITSモデルは`eau`を`o`と読むフランス語の綴りを学ぶことはない。音素から音への変換を学ぶのだ。これで学習は大幅に簡単になるし、Piperが71言語をカバーする理由もここにある。新しい言語では対応するespeak音声を繋いで学習するだけだ。

espeakを使わない声は独自フォネマイザーを持ち、ここからが変わり種だ。`hebrew`(Nakdimon ONNXと494行のIPAルール)、`pinyin`(多音字の曖昧さ解消付きBERT g2pWフルセット。同じ漢字でも単語で読みが変わる)、`thai`(無改変の本物TLTK)、`japanese`(linderaによる分割とUniDic)。`pipertts`モジュールは7種全部を持ち、Pythonリファレンスと同一だと検証済みだ。後で戻る。

### データセット:LJSpeech、いつもLJSpeech

標準の学習形式はLJSpeechだ。クリップだらけの`wavs/`フォルダと`metadata.csv`だ。

```
LJ001-0001|Printing, in the only sense with which we are at present concerned...|printing in the only sense...
LJ001-0002|in being comparatively modern...|in being comparatively modern...
```

`fileid|transcription|normalized`で、1クリップは1文、数秒だ。元のデータセットは1人の女性話者による英語13000文でパブリックドメインだ。フランス語音声を学習するなら同じ構造をフランス語で録る。テキストと音声のアライメント済みペアで、まともなmedium品質なら数時間で足りるし、highならもっと要る。

カタログの3品質はだいたいモデルサイズと学習時間に対応する。Lowは小さい、速い、ロボットっぽい。Mediumはいいとこ取りで437モデル。Highは大きい、遅い、自然で67モデル、Fortune勢を含む。

### 3つの魔法のボタン

各Piper音声は3つの推論パラメーターを持ち、デフォルトはほぼ共通だ。

```json
"inference": { "noise_scale": 0.667, "length_scale": 1, "noise_w": 0.8 }
```

- `noise_scale`(0.667):声のばらつき。高くすると表現豊かに、低くすると安定する。出力は確率的だ。同じ文の2回の合成は少し違う音声になる。
- `noise_w`(0.8):タイミングのばらつき、リズムだ。
- `length_scale`(1.0):速さ。1より上は遅く、下は速くなる。Lunaが怒ったときに速く喋らせる一番簡単な方法だ。

`noise_scale`を覚えておこう。感情で使う。

## Fortune multi:7感情、1つのONNX

さて、地元のスターの話だ。

カタログにはItsRealFortune(どうも)が学習したFortuneモデル3つが載っている。

| Modèle | Repo | Voix |
|---|---|---|
| ItsRealFortune - French (FR) High | `fox3000foxy/piper-fortune-v6` | 1 (voice-0) |
| ItsRealFortune - French (FR) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-fr-multi` | **7** |
| ItsRealFortune - English (EN) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-en-multi` | **7** |

FR multiはこうだ。

```
normal, joyeuse, storytelling, colere, triste, surprise, interrogative
```

**1つのONNXファイル**に7種の感情バリエーションだ。EN multiも同じで、名前に歴史的なタイプミスがある。`surprised`ではなく`suprised`だ。重みの中にあるのでそのまま残す。伝承の一部だ。

### speakerIdの仕組み

マルチスピーカーVITSは同じモデルに入力が一つ増えたものだ。スピーカー埋め込みだ。学習時、各クリップにスタイルのタグが付き、モデルは残りと同時に埋め込みテーブル(スタイルごとに1つ)を学ぶ。推論時はテーブルの行を選ぶ。

```ts
import { PiperNativeTTS } from "pipertts";

const tts = await PiperNativeTTS.load({
  model: "hub:itsrealfortune-french-fr-multi-high",
  modelsDir: "./models",
});

const styles = [
  "normal", "joyeuse", "storytelling",
  "colere", "triste", "surprise", "interrogative",
];

for (let i = 0; i < styles.length; i++) {
  const r = await tts.synthesize("Quelle merveilleuse nouvelle !", {
    speakerId: i,           // 0 = 通常 ... 5 = 驚き
    outputFile: `./fortune-${styles[i]}.wav`,
  });
}
```

同じ文を7通りに読む。`speakerId: 5`(surprise)に`noise_scale`を少し上げれば説得力ある感嘆になる。`speakerId: 4`(triste)に`length_scale: 1.1`で遅くすれば訃報の読み上げになる。Lunaが声を変える仕組みはこれだ。脳が感情を選び(valenceとarousal、centroidの記事参照)、TTSがspeakerIdを選ぶ。

裏のデータセット名は素朴に**Fortune French - Dataset**で、ライセンス名は「Fortune's Café」だ。そう、ライセンス名がカフェっぽい。そのままだ。

### なぜ経済的に賢いのか

7感情はダウンロード1回、RAMロード1回、ONNXセッション1つだ。代替案(モデル7個分け)だとストレージは倍増し、感情を変えるたびグラフをリロードすることになる。文の途中でトーンを変えるボットには無理だ。ここでは`speakerId`はテンソルのインデックスに過ぎない。追加コストはゼロだ。

## ライバル:Kokoro、PocketTTS、sanoTTS

PiperはCPUの座を3つの真面目な挑戦者と分け合う。哲学が3つ違う。

### Kokoro 82M、コスパの王

[Kokoro](https://huggingface.co/hexgrad/Kokoro-82M)、作者はhexgradだ。8200万パラメーター、改変StyleTTS 2アーキテクチャにISTFTNetデコーダー、**拡散ステップなし**。拡散がないのが全てだ。反復ノイズ除去ループがないので推論が超高速だ。

| | Kokoro-82M |
|---|---|
| Params | 82M |
| Poids | ~300 Mo (164 Mo en FP16) |
| Licence | Apache 2.0 (commercial OK) |
| Langues | 8, 54 voix preset + blending |
| CPU | quasi temps réel |
| GPU | 36 à 96x temps réel |
| Tests aveugles | au niveau de Google et Amazon |

100時間未満の音声、約1000ドルで学習され、ブラインドテストではGoogleやAmazonのプレミアム音声と同列に置かれる。爆発した理由はここだ。プレミアム品質、無料、ローカル、寛容ライセンス。

Piperとの対決では、純粋な自然さはKokoroが勝つ(StyleTTS 2は小型VITSより上)し、ライセンスも勝つ(PiperのエンジンはGPL-3.0に対してApache 2.0)。カバレッジはPiperが勝つ(8言語に対する71言語、54声に対する3755スピーカー)し、コミュニティ音声のエコシステムも勝つ。英語ナレーションならKokoroは倒しにくい。7感情のフランス語、トルコ語、スワヒリ語なら、Piperが唯一の候補になることが多い。

### PocketTTS(Kyutai)、CPUでのクローニング

[Kyutai](https://kyutai.org/tts/)は別の手を打つ。小さな**声クローン付き**モデルでCPU上で動く。

| Modèle | Params | WER | UTMOS | SIM | Vitesse CPU (1 thread) |
|---|---|---|---|---|---|
| Pocket TTS | ~100M | 0.92% | 4.364 | 0.923 | 2.8x temps réel |
| Pocket TTS small | 1.9M / 6.9M / 18.2M | - | - | - | CPU, clonage inclus |

WERは1%未満(発音が正しい)、UTMOS 4.36(知覚品質が優秀)、SIM 0.923(クローンが本当にターゲットに似る)。small版は**190万パラメーター**まで落ちてクローン付きだ。190万だ。私のSabakiルーターはJSONでほぼこのサイズだ。

Piperとの対決では、クローンはPocketTTSが勝つ(Piperは固定声で読む)し、主力モデルの小ささも勝つ。言語はPiperが勝つ(smallは今のところ英語のみ)し、エコシステムの成熟も勝つ(「自分で学習して」に対する ready-to-use 536声)。

### sanoTTS、3ドルのチップに載るモデル

[sanoTTS](https://github.com/ampixa/sanoTTS)(`sano`はネパール語で「小さい」)はTTSのBareironだ。音素から22.05 kHz PCMまでの完全なニューラルスタックが**マイコン上**で動く。

| Système | Params | SCOREQ | UTMOS | DNS-SIG |
|---|---|---|---|---|
| sanoTTS (heart-nano) | 0.29M | 2.29 | 2.45 | 3.35 |
| TinyTTS | 1.62M | 3.94 | 3.65 | 3.62 |

パラメーター29万。音声2MBだ。`pip install sanotts`して`sanotts say "Hello" --voice amy`で喋る。ブラウザでも動く。

でもスコアを見よう。SCOREQはTinyTTSの3.94に対して2.29、UTMOSは2.45だ。喋る、うん。歌う、いいえ。これが究極のトレードオフだ。29万ならどこでも動くが品質はサイズなりだ。Piper mediumは100倍の重みで別リーグの声だ。

### まとめ表

| | Piper | Kokoro 82M | PocketTTS | sanoTTS |
|---|---|---|---|---|
| Params typiques | ~10-60M | 82M | ~100M / 2-18M | 0.3-1.4M |
| Langues | 71 | 8 | EN (+ smalls EN) | multilingue, petit |
| Voix dispos | 3755 speakers | 54 + blending | clonage (la tienne) | quelques voix |
| Clonage | non | non (natif) | **oui, CPU** | non |
| Licence moteur | GPL-3.0 | Apache 2.0 | open (Kyutai) | open |
| Entraînable maison | oui (LJSpeech) | oui (plus lourd) | oui | oui |
| Qualité FR | bonne (multi émotions) | correcte (EN-first) | EN-only | faible |

選び方は制約次第で、絶対の勝者はいない。純粋な英語品質ならKokoro。CPUクローンならPocketTTS。マイコンならsanoTTS。言語カバーと感情つきフランス語声とインフラゼロならPiperだ。

## ElevenLabs、課金される巨人

そしてElevenLabsがいる。70超言語、表現豊かなEleven v3 with audio tagsとドラマチックな対話、ブラインドテストでトップ品質だ。TTS界のJevみたいなものだ。皆見たことがあり、皆ベンチマークの相手にした。

2026年の価格はざっくりこうだ。

| Modèle API | Prix / 1000 caractères |
|---|---|
| Flash / Turbo, v3 Conversational | $0.05 |
| Multilingual v2, Eleven v3 | $0.10 |

1000文字は約1分の音声だ。つまり1分あたり0.05から0.10ドルだ。99ドルのProプランは約99万文字込みで、超過分も同単価だ。毎日ナレーション付き動画を出すYouTubeチャンネル(私の`valorant-short-maker`はまさにそれを無料のPiperでやる)なら、毎日のナレーション1分ごとに月1.50から3ドルだ。1日10分なら月15から30ドルだ。払えるが、数える金額だ。

払う価値がある場合:声自体が商品のとき(吹き替え、オーディオブック、広告)、70言語が明日朝に要るとき、クローンが一発で完璧に要るとき。逆に払う価値がない場合:一晩中喋るDiscordボット、社内通知、開発、量が爆発する場合だ。午前3時に人生を語るLunaをElevenLabsで動かしたら、私の電気代が泣く。

計算は簡単だ。Piperは限界費用0ユーロで品質は「良い」。ElevenLabsはメーターが回って品質は「最高」。その間に「良くて無料」が勝つ世界がある。それがPiperHubの賭けの全てだ。

## pipertts:ネイティブがPythonラッパーに10倍勝つ理由

リポジトリ[itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts)、75コミット。PiperのTypeScriptネイティブ移植だ。READMEのタイトルは「In-process Piper TTS for Node.js. No Python required.」だ。

### spawnのコスト

旧来ラッパー(`PiperTTS`)は**合成ごとに**`python3 -m piper`を子プロセスspawnする。

```
synthèse = spawn(python) + chargement du modèle + inférence + kill
```

各文がインタープリター起動と重みロードを払う。`en_US-lessac-medium`での実測は**1行あたり約2.2秒**だ。

ネイティブ(`PiperNativeTTS`)はONNXセッションをメモリに温かく保つ。

```
load une fois -> session persistante -> inférence par phrase
```

同じ条件の実測は**1行あたり約0.22秒**だ。10倍はここから来る。spawnとリロードを殺した結果で、推論の魔法とは関係ない。ONNX推論自体は両側で同じだ。

おまけに、初回ロードで最適化済みグラフを`.onnx`の横にキャッシュする(`<model>.ortopt-<platform>-<arch>-v<ort>.onnx`)。次回以降のロードが約35%速くなる。キャッシュキーはplatform、arch、ORTバージョンの組み合わせで、モデルが変われば更新される。`cacheOptimizedModel: false`で無効化できる。

### espeakブリッジ:0.4ms対15ms

フォネマイズも同じ理屈だ。ラッパーは文ごとに`espeak-ng`バイナリをCLI呼び出しする。毎回約15msのspawnだ。ネイティブはN-APIブリッジを内蔵し(`src/native/espeak-bridge/`、`espeakbridge.c`の移植)、Linux x64とarm64向けprebuild付きだ。**1呼び出し約0.4ms**で音素はバイト同一だ。アドオンなしならCLIに自動フォールバックする。`PIPER_ESPEAK_BRIDGE=0`でCLI強制だ。

### 7種のphoneme_typeを全部移植

| Type | Moteur | Notes |
|---|---|---|
| `espeak` | bridge N-API ou CLI | clauses byte-identiques |
| `text` | passthrough codepoints | trivial |
| `hebrew` | Nakdimon ONNX + règles IPA | sorties identiques |
| `lithuanian` | espeak + dico de stress 189k entrées | sorties identiques |
| `pinyin` | BERT g2pW ONNX + WordPiece | désambiguïsation des polyphones OK |
| `thai` | vrai TLTK non modifié sous Pyodide/WASM | 7/7 identiques (1er appel lent, suite rapide) |
| `japanese` | lindera-wasm + UniDic + moteur de mores TS | segmentation exacte, **pas d'accent lexical** |

アラビア語は自動で母音記号付けされる(tashkeel、無効化可)。カタログのespeak声509件は高速ブリッジ経由で、変わり種は専用エンジン経由だ。テストスイートに71テスト、詰まる所は文書化済み(日本語アクセント、UniDicにデータなし。想定内、隠しなし)。

### 形式とストリーミング

デフォルト`wav`、`raw` PCM、`mp3`、`ogg`、`opus`だ。ffmpegがあればそれを使い、なければ純JSフォールバック(lamejs for mp3、opusscriptとOgg muxer for opus、ソースとの相関0.993)。そして何より`synthesizeChunks()`だ。文ごとにyieldする非同期ジェネレーターで、文間に`sentenceSilence`を挟む。Lunaの場合、末尾を合成しながら先頭の再生を始められる。専用サーバーなしのTTSストリーミングだ。

PiperHubカタログ統合付きのフル使用例(`hub:`と、作者リポジトリがファイルを出さなくなった場合の自動ミラーフォールバック)。

```ts
const tts = await PiperNativeTTS.load({
  model: "hub:glados-french-medium-voice",
  modelsDir: "./models",
});

const r = await tts.synthesize("Bonjour, je suis GLaDOS.", {
  outputFormat: "ogg",   // Discord向けに直接
  lengthScale: 0.95,     // 少し速め
});
```

コミュニティ音声(GLaDOSやゲームキャラ)は公式manifestにない。PiperHubが存在する理由そのもので、`pipertts`は知っている。`hub:<slug>`、piperhubページURL、slugだけ、全部動く。`usable: false`の声は明快なエラーで拒否される。

## 犠牲にしたもの

ない機能の各々が別の機能を支えている。正直リストだ。

**PiperはElevenLabsの隣ではロボットっぽく聞こえる。** 22050 HzのVITS mediumは綺麗だが大型表現モデルに比べると平板だ。マルチ感情で一部補う(平板1種より7スタイル)が、ElevenLabs v3のオーディオブックはやはり上だ。数十MBの代償だ。

**espeakは間違える。** 固有名詞、外来語、略語にはルールベース音素化の死角がある。フランス語の「Spoiler」はespeakなりに読む。ニューラルG2Pの大型モデルは間違いが少ない。本番では業務用語の例外辞書が要る。

**ネイティブのクローンはゼロだ。** Piperは固定声で読む。自分の声が欲しければPocketTTSかElevenLabsだ。マルチスピーカーは variation をくれるが、自分の声色はくれない。

**日本語は語彙アクセントなしのままだ。** UniDicにアクセントデータがないので、分割は正確だが抑揚は近似だ。READMEに文書化済みで、隠しはなしだ。

**タイ語は初回呼び出しが重い。** TLTKは無改変Pyodide/WASMで動く。初回はロードで数秒かかり、以降は速い。リファレンスと7/7同一だが、ウォームアップを見込もう。

**データは腹ペコだ。** まともなhigh音声には時間単位の綺麗にアライメントされた音声が要る。Fortuneデータセットは何時間もの録音と掃除だ。魔法ゼロだ。ゴミを入れればロボットが出る。

**カタログには死んだ声がある。** 25モデルに`usable: false`フラグだ。想定内でフィルタ済みだが、声のクラウドソーシングは放棄のクラウドソーシングでもあると分かる。

## 最終結果

片方にElevenLabsのメーター、片方にRaspberry Piだ。

- PiperHub:表示536モデル、71言語、3755スピーカー、リンク済み130データセット、datasetからtrainingからusageへのガイド
- Piper:VITSエンドツーエンド、espeak、ONNX CPU、LJSpeech、lowとmediumとhigh、標準22050 Hz
- Fortune multi:FR 7感情とEN 7感情、各1 ONNX、切り替えは`speakerId`、ライセンス「Fortune's Café」
- Kokoro 82M:プレミアムな英語品質、Apache 2.0、54声、CPUほぼリアルタイム
- PocketTTS:CPUクローン、約100Mから2-18M、WER 0.92%
- sanoTTS:0.29M、2MB、マイコン、サイズなりの品質
- ElevenLabs:1000文字0.05-0.10ドル、70超言語、トップ品質、回るメーター
- ネイティブpipertts:ラッパー約2.2秒/行に対して約0.22秒/行、espeakブリッジ0.4ms、7 phoneme_type、wavとrawとmp3とoggとopus、文ごとのストリーミング

Lunaは毎日これで喋る。TTS代0ユーロ、脳操縦の感情、Discord向け直接OGGだ。ElevenLabsと比べれば分かる、もちろん。でも午前3時に彼女が人生を語り出しても、請求はぐっすり眠っている。

## 考え方

p2r3は言った。*「1ドルくらいのあのちっちゃいチップでMinecraftみたいなすごいものが動くって発想が好きなんだ。」*

声に当てはめた同じノリだ。数十MBのONNXでRaspberry Piが71言語で喋る。クラウドなし、アカウントなし、メーターなしが好きなんだ。吹き替えスタジオの代わりにはもちろんならない。面倒なケースの代わりになる。まともでローカルで無料な声が欲しくて、夜に喋っても請求されないケースだ。

トレードオフを白黒はっきり書く。
- プレミアム品質から小型VITSへ:少しロボットっぽいがローカルで無料
- 感情ごとに1モデルからspeakerIdへ:RAM上は1つ分の値段で7声
- Python spawnから永続セッションへ:10倍速く、Python installゼロ
- 野生カタログから出自リンクへ:各声は出自と動作状態が分かる
- 課金APIから限界費用0ユーロへ:ElevenLabsほど綺麗ではないが請求は安眠する

**覚えるべき3つ:**

1. **PiperはCPUのTTSだ**。VITSとespeakとONNX、71言語、Piで動く数十MBの声だ。ElevenLabsほど綺麗ではないが、限りなく安い。
2. **Fortune multiは1つ分の値段で7感情だ**。ONNX1つ、切り替えは`speakerId`、FRとENだ。モデル7個の代わりにスピーカー埋め込みだ。
3. **ネイティブはspawnを殺す**。`pipertts`はONNXセッションを温存する。1行2.2秒に対して0.22秒、espeak CLI 15msに対してブリッジ0.4msだ。同じ推論で待ち時間は10分の1だ。

興味があれば、カタログは[piperhub.org](https://piperhub.org/)、サイトのコードは[github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank)、ネイティブモジュールは[github.com/itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts)だ。午前3時に人生を語るLunaを聞きたければDiscordでどうぞ xD
