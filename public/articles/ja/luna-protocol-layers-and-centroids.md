---
title: "Luna Protocol：脳の共有、感情分類、そして「面白い/どうでもいい」ルーティング"
description: "Luna Protocolはモノリスから4層アーキテクチャへと進化した：アダプター、brain、感情分類器、そして推論。埋め込みのセントロイド、面白い/どうでもいいルーティング、valenceとarousalによるLLMパラメータ調整を紹介する。"
date: 2026-07-27
tags:
  - discord
  - matrix
  - llm
  - architecture
  - embeddings
  - centroids
  - emotion-ai
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: ""
---

# Luna Protocol：脳の共有、感情分類、そして「面白い/どうでもいい」ルーティング

[前](/articles/ja/luna-protocol-discord-bot)[2本](/articles/ja/luna-protocol-official-models)の記事では、Luna Protocolを複雑な行動システムとファインチューニング済みモデルを備えた単一のDiscordボットとして紹介した。しかしそれ以来、アーキテクチャは大きく進化した。かつてはモノリス -- Discordボット、行動、LLM呼び出しをすべて処理する単一のNode.jsプロセス -- だったものが、**4つの独立したレイヤー**へと変わった。それぞれが独自の責務、独自の言語、独自のライフサイクルを持つ。

この分離は予期しない利点をもたらした。複数プラットフォーム間での「脳」の共有、LLMのパラメータを動的に調整する感情分類システム、そして会話の重要度に応じて2つのモデル間でメッセージをインテリジェントにルーティングする仕組みだ。

この進化は一気に起きたわけではなく、有機的な道筋をたどった。まず`server/`フォルダをボットのリポジトリから切り離し、**Krystal**を片方に、**Jade**をDiscordアダプターとして残した。次に、Jadeの`llm-core`とイベントバスを再利用して**Pixieglow**（Matrixアダプター）を作った。続いて**Sapphire**が登場し、DistilBERTによるGENERIC/SEMANTIC分類を導入したが、結果は納得のいくものではなかったため、例の充実により柔軟で精度も高い埋め込みセントロイドに切り替えた。分類は「どうでもいい/面白い」になった。最終的に、LLMのtemperatureとrepeat penaltyを調整するために**valence**（快・不快）と**arousal**（覚醒度）のセントロイドを追加した。最後に、JadeとPixieglowの間の冗長なコードをすべて取り除き、共有脳である**Emerald**を作成し、JadeとPixieglowをシンプルなソケット駆動のクライアントに変えた。

並行して、プロジェクトの進捗を追うウェブサイトを更新し続けている：[protocol-luna.github.io](https://protocol-luna.github.io/)。

この記事では、なぜ・どのようにこれらのレイヤーを分割したのか、各サービスが具体的に何をしているのか、そして**セントロイド**（埋め込みの平均ベクトル）や**レゼントメント変数**（1970年代のチャットボットPARRYに着想を得たもの）といった概念が、シンプルなDiscordボットを驚くほど一貫性のあるマルチプラットフォームシステムへと変えた経緯を語る。

---

## モノリスの問題点

当初、Luna Protocolは単一のNode.jsプロセスに収まっていた。コードが処理していたのは以下だ。

- Discord接続（Erisライブラリ経由）
- トリガーの評価（メンション、キーワード、フォローアップなど）
- 人間らしい振る舞いのシミュレーション（誤字、ためらい、睡眠など）
- ローカルLLMサーバー（llama.cpp）へのHTTP呼び出し
- セッション管理とアンチスパム
- TTSパイプライン

すべてが同じプロセス内にあり、型付きイベントバス（`TypedBus`）を介して通信していた。動作はしていたが、限界があった。

- **Matrixクライアントの追加が不可能** -- 行動コードをすべて複製しない限り無理だった
- **LLMとボットが同じリポジトリにあった** -- `server/`フォルダはすでに存在していたが、片方を触らずにもう片方を進化させることは不可能だった
- **インテリジェントな分類がない** -- 「lol」であろうと実存的な質問であろうと、すべてのメッセージが同じように扱われていた
- **持続的な感情状態がない** -- ボットは何も「感じて」いなかった

レイヤーへの分割が、これらすべての問題を解決した。

---

## 4つのレイヤー

現在のLuna Protocolのアーキテクチャは、4段階の漏斗として構成されている。

```
Matrix / Discord
      |
      v
  [ADAPTERS]      Pixieglow (Matrix) / Jade (Discord)
      |
      v
  [BRAIN]         Emerald (WebSocket, ポート 3126)
      |
      v
  [CLASSIFIER]    Sapphire (HTTP, ポート 3123)
      |
      v
  [INFERENCE]     Krystal (llama.cpp, ポート 3124 / 3125)
```

各レイヤーは独立して再起動、更新、置き換えができる。

---

### レイヤー1：アダプター（PixieglowとJade）

最もシンプルなレイヤーだ。彼らの唯一の仕事は、メッセージングプラットフォームのイベントをEmeraldへの標準化されたプロトコルに変換することである。

- **Jade**はDiscordアダプターだ。Erisライブラリを使ってDiscordに接続し、WebSocket経由でメッセージをEmeraldに転送する。TTSパイプライン（Piperによる音声合成、OGG変換、Discordへのアップロード）も処理する。
- **Pixieglow**はMatrixアダプターだ。SDKを使わずMatrixのClient-Server HTTP APIを直接利用し、long-pollによる同期を行う。TTSは持たない。

両アダプターは、`emerald-client.ts`で定義された同じWebSocketプロトコルを共有している。

```typescript
type ClientId = "jade" | "pixieglow";

// イベント (アダプター -> Emerald)
type InEvent = MessageEvent | ReadyEvent | BotMessageEvent | PresenceEvent;

// コマンド (Emerald -> アダプター)
type OutCommand = RespondCommand | TypingCommand | SetPresenceCommand
                | SpontaneousCommand | ForgotCommand;
```

同じインターフェースを持つ2つのアダプターが存在することは、脳の共有が機能していることの証だ。**同じ「脳」（Emerald）がDiscordボットとMatrixボットの両方を同じように動かし**、動作は同一である。プロトコルは宣言的だ。Emeraldはアダプターに*どうやって*メッセージを送るかを指示するのではなく、*何を*送るべきかを伝える（遅延付きのテキスト、場合によってはバーストの計画、リアクションなど）。各アダプターは、自分のプラットフォームに応じた具体的な実行を担う。

これがこのアーキテクチャの強みだ。Telegram、Signal、あるいは他の何かへの対応を追加するには、WebSocketプロトコルを実装したアダプターを書くだけでよい。

---

### レイヤー2：脳（Emerald）

Emeraldは中枢の意思決定サービスだ。ポート3126でWebSocketを待ち受け、以下を管理する。

- **トリガーの評価**：メンション、DM、名前、キーワード、フォローアップ、ランダム
- **行動シミュレーション**：集中の遅延、誤字、ためらい、忘却、バースト、話題疲れ
- **睡眠サイクル**：sleep / slow / short モード
- **セッション管理**：クールダウン、セッション上限、アンチスパム
- **Sapphireへのルーティング**：メッセージの送信、ストリーミングされた応答の受信

Emeraldは脳の共有を可能にした中枢サービスであり、分離から最も恩恵を受けたものでもある。以前は、各行動（誤字、バースト、ためらい）はDiscordのコードと絡み合っていた。今では`behavior/`以下の専用モジュールに収まっている。

```
emerald/src/behavior/
  burst.ts         -- バーストメッセージの計画
  mannerisms.ts    -- 遅延、ためらい、リアクション、忘却
  sleep.ts         -- 睡眠スケジュールの評価
  typo.ts          -- 誤字のシミュレーション (AZERTY/QWERTY)
```

脳は自分がどのプラットフォーム上で動いているか知らない。`clientId`（"jade"または"pixieglow"）を含む`MessageEvent`を受け取り、決定を下し、コマンドを返す。残りはアダプターが処理する。

---

### レイヤー3：感情分類器（Sapphire）

Sapphireは技術的に最も興味深いサービスだ。Python + FastAPIで書かれた**LLMミドルウェア**であり、4つの重要な役割を担う。

1. 埋め込みセントロイドによる**「どうでもいい/面白い」の2値分類器**
2. セントロイドによる**感情スコアラー**（valence / arousal）
3. Krystalへの**バックエンドルーター**（小型モデル vs 大型モデル）
4. **Few-shotインジェクター**とセッションマネージャー

#### セントロイド：分類の核心

**セントロイド**はシンプルな概念だ。埋め込みベクトルの集合の平均である。具体的には、数百のメッセージ例を集め、それらを埋め込みモデル（`BAAI/bge-small-en-v1.5`、384次元）に通し、得られたベクトルを平均した。

**2つの分類セントロイド**がある。

- `futile_centroid`：約500件のありふれたメッセージ（"lol"、"ok"、"hello"、"nm just chillin u"）の埋め込み平均
- `interesting_centroid`：約550件の中身のあるメッセージ（技術的な質問、打ち明け話、哲学）の埋め込み平均

メッセージが届くと：

```python
def classify(text, embedder, futile_centroid, interesting_centroid):
    emb = embedder.query_embed(text)          # メッセージの384次元ベクトル
    sim_f = cosine_similarity(emb, futile_centroid)
    sim_i = cosine_similarity(emb, interesting_centroid)
    diff = sim_i - sim_f
    label = "INTERESTING" if diff > 0 else "FUTILE"
    return label, abs(diff), sim_f, sim_i
```

メッセージと各セントロイドとのコサイン類似度がカテゴリを決定する。絶対差が確信度を示す。LLMのforward passが不要でシンプル、高速、そして驚くほど効果的だ。

#### なぜ2つのモデルなのか

この分類結果によって、どのLLMバックエンドを呼び出すかが決まる。

| ラベル | Krystalバックエンド | モデル | ポート |
|--------|----------------------|--------|--------|
| `FUTILE` | `generic` | Luna-Protocol-1.5B (941MB, Q4_K_M) | 3124 |
| `INTERESTING` | `semantic` | Hermes-3-3Bまたは8B（設定による） | 3125 |

直感はシンプルだ。「lol」や「nm just chillin u」に80億パラメータのモデルを呼び出す価値はない。20万件のDiscordサンプルで訓練された小型のファインチューニング済みLuna 1.5Bモデルで、軽いやり取りには十分すぎるほどだ。一方、人生についての質問、打ち明け話、技術的な議論は、より豊かな応答を生成できる大型モデルにルーティングされる。

この経済的なルーティングにより、LLMサーバーの負荷は大幅に削減される。メッセージの約70%が「どうでもいい」に分類され小型モデルで処理されるため、大型モデルは本当に価値のある会話のために解放される。

#### 感情の軸：valenceとarousal

だがそれだけではない。Sapphireは**同じセントロイドの仕組み**を独立した軸で使い、メッセージの感情を評価する。

**4つの感情セントロイド**がある。

| 極 | 例 |
|----|-----|
| `positive` | "hell yeah"、"love that"、"this is great" |
| `negative` | "shut up"、"i hate this"、"this sucks" |
| `high_arousal` | "WHAT THE HELL"、"omg omg omg"、"AAAAA" |
| `low_arousal` | "just chilling"、"meh"、"i guess" |

スコアは各軸での類似度の差として計算される。

```python
valence = sim(emb, positive) - sim(emb, negative)     # [-1, +1]
arousal = sim(emb, high_arousal) - sim(emb, low_arousal)  # [-1, +1]
```

**Valence**はメッセージがポジティブかネガティブかを測る。**Arousal**はその感情的な強度を測る。両者を合わせると、情動の円環モデル（Russell, 1980）を形成する -- 1972年のチャットボット**PARRY**にインスピレーションを与えたのと同じ心理学モデルだ。

#### レゼントメント変数：感情がLLMをどう制御するか

ここでPARRYからのインスピレーションが具体的な形になる。PARRY（1972年にKenneth Colbyが作成）は、妄想性の患者をシミュレートするために設計されたチャットボットだった。恐怖、怒り、不信といった内部変数を持ち、それらが応答を変化させていた。例えば「怯えた」PARRYはより攻撃的に応答した。

Sapphireも同じことを行うが、連続的な変数とよりエレガントな手法を使う。会話の感情状態に応じて、LLMのサンプリングパラメータがリアルタイムで調整されるのだ。

##### TemperatureはArousalに従う

```python
temperature = clamp(0.7 + arousal * 0.3, 0.4, 1.0)
```

| Arousal | Temperature | 効果 |
|---------|-------------|------|
| -1.0（穏やか） | 0.40 | 低い創造性、予測可能な応答 |
| 0.0（中立） | 0.70 | デフォルトの創造性 |
| +1.0（興奮） | 1.00 | 最大のランダム性、驚くような応答 |

誰かが興奮している、あるいは苛立っている（arousalが高い）とき、temperatureは上がる。モデルはより多様で創造的、時にはより混沌とした応答を生成する -- 「我を忘れる」人間のように。会話が穏やかなときはtemperatureが下がり、応答はより落ち着いたものになる。

##### Repeat PenaltyはValenceに従う

```python
repeat_penalty = clamp(1.15 - valence * 0.1, 1.0, 1.3)
```

| Valence | Repeat Penalty | 効果 |
|---------|-----------------|------|
| -1.0（ネガティブ） | 1.25 | 強いペナルティ、繰り返しを避ける |
| 0.0（中立） | 1.15 | デフォルト値 |
| +1.0（ポジティブ） | 1.05 | 弱いペナルティ、繰り返しを許容する |

会話がネガティブであるほど、モデルは繰り返しを避けるよう強く促される -- 緊張した口論の中で言葉を探す人のように。会話がポジティブであるほど、モデルは冗長な発言を許容できる -- リラックスした会話のように。

##### 累積的な感情状態

これらのスコアは直近のメッセージだけに関わるものではない。`EmotionState`はセッションごとにvalenceとarousalの**指数移動平均**を保持する。

```python
class EmotionState:
    def __init__(self, decay=0.85, deadzone=0.06):
        self.decay = decay
        self.deadzone = deadzone

    def update(self, key, valence_delta, arousal_delta):
        if abs(valence_delta) < self.deadzone:
            valence_delta = 0.0
        if abs(arousal_delta) < self.deadzone:
            arousal_delta = 0.0
        s = self._state.setdefault(key, {"valence": 0.0, "arousal": 0.0})
        s["valence"] = s["valence"] * self.decay + valence_delta * (1 - self.decay)
        s["arousal"] = s["arousal"] * self.decay + arousal_delta * (1 - self.decay)
        return s
```

`decay`が0.85であるということは、各メッセージで以前の状態の85%が保持され、新しいシグナルの15%が統合されることを意味する。これにより、急激な変動を滑らかにする**感情的な記憶**が生まれる。1件のネガティブなメッセージだけではボットは「悲しく」ならないが、一連のネガティブなメッセージは徐々にその機嫌を変化させていく。

実際には、誰かがとても興奮した状態で会話を始めると（`arousal=+0.8`）、その後のメッセージがより落ち着いていても、temperatureは数回のやり取りにわたって高いままだ。感情が落ち着くには時間がかかる -- 口論の後もしばらく「熱くなったまま」でいる人間のように。

---

### レイヤー4：推論（Krystal）

Krystalは最下層のレイヤーだ。OpenAI互換のAPI（`/v1/chat/completions`）を公開する`llama.cpp`のラッパーである。2つのPM2インスタンスとして動作する。

- `krystal-small`：ファインチューニング済みのLuna 1.5Bモデル、ポート3124、CPUアフィニティ0
- `krystal-large`：Hermes 3Bモデル、ポート3125、CPUアフィニティ0,1

両インスタンスとも事前コンパイルされた`llama-server`プロセスで、CPUピンニングのために`taskset`で起動されている。

Lunaモデルのファインチューニングも第2記事以降進化している。今では以前の5万件に対し**20万件のサンプル**で訓練され、依然としてQwen2.5-1.5B-InstructをベースにQLoRAで行っている。この20万件は、Discord-Dialoguesデータセットのサブセットで、最も自然で多様な会話だけを残すようフィルタリングされている。目標は、few-shot primingをこれほど効果的にしている柔軟性を失うことなく、モデルのスタイルの幅を広げることだ。

---

## 全体の流れ：メッセージの通過

Discordで誰かが「今日は本当に悲しい」と送ったとき、具体的に何が起きるかを見てみよう。

1. **Jade**がDiscord Gateway API経由でメッセージを受信する。それを`MessageEvent`に変換し、WebSocket経由でEmeraldに送信する。
2. **Emerald**がトリガーを評価する（メンションか？名前か？キーワードか？）。これは直接のメンションだ。集中の遅延を計算し、クールダウン、セッション、話題疲れを確認する。応答することを決定し、HTTP経由でメッセージをSapphireに送る。
3. **Sapphire**が`bge-small-en-v1.5`でメッセージを埋め込む。
   - 分類：メッセージは`futile`セントロイドより`interesting`セントロイドに近い（diff = +0.31）-> **INTERESTING**
   - 感情：ネガティブなvalence（-0.42）、中程度のarousal（0.35）
   - ルーティング：`KRYSTAL_SEMANTIC_URL`（ポート3125、大型モデル）方向
   - サンプリングパラメータ：temperature = 0.80（arousalにより増加）、repeat_penalty = 1.19（ネガティブなvalence）
   - セッションの感情状態がこれらの値で更新される
4. **Krystal**（大型インスタンス）が感情的に調整されたパラメータで応答を生成し、Sapphireに返す。
5. **Sapphire**がメタデータ（ラベル、valence、arousal、デバッグ統計）とともに応答をEmeraldにストリーミングする。
6. **Emerald**がためらい（「あ...」）を加えることを決め、バースト（2つの断片）を計画し、リアクションを選ぶ。`RespondCommand`をJadeに送る。
7. **Jade**が実行する：初期の遅延を待ち、ためらいを含む最初の断片を送り、1.5秒待ち、2つ目の断片を送る。生成中はずっと入力中インジケーターを表示する。

これらすべてがユーザーにとって3秒未満で完了する。

---

## セントロイド：なぜニューラル分類器より優れているのか

従来の分類器（以前使っていたDistilBERTなど）に対して埋め込みセントロイドを選んだ理由は説明に値する。

ニューラル分類器はクラス間の決定境界を学習する -- 典型的には、入力を確率へ写像する非線形変換だ。精度は高いが、以下の欠点がある。

- ラベル付きの訓練データが必要
- 分布の変化（データドリフト）に敏感
- 解釈が難しい
- 新しいクラスを追加するには再訓練が必要

一方セントロイドは、例の埋め込みの**平均ベクトル**である。分類はこの平均ベクトルとのコサイン類似度によって行われる。利点は以下の通り。

- **訓練不要**：手で選んだ例の埋め込みの平均を計算するだけでよい
- **解釈しやすい**：どの例がセントロイドに最も近いかを見ることで、「セントロイドが何を学んだか」を理解できる
- **クラスの追加**：新しいセントロイドを追加するだけで、再訓練は不要
- **頑健**：セントロイドは平均なので、外れ値の影響が小さい

セントロイドの真の力は、分類問題を**空間的な距離測定**の問題に変えることにある。カテゴリを384次元空間内の領域として（あるいはPCA/t-SNEによる次元削減後に2D/3Dで）可視化できる。

### セントロイドの3D可視化

実際には、埋め込み空間における分類セントロイドはこのように見える。各点は例のメッセージであり、PCAによって3Dに投影されている（可視化のため、元の384次元は3次元に削減されている）。青い点は「どうでもいい」メッセージ、黄色い点は「面白い」メッセージだ。2つの大きなダイヤモンドが計算されたセントロイド -- 各グループの平均である。点にマウスを乗せると、その例の元のテキストが表示される。

<iframe src="assets/centroids-plot.html" style="width:100%;height:550px;border:none;border-radius:8px;" loading="lazy" title="セントロイドによる分類 - インタラクティブ3Dビュー"></iframe>

赤で示された2つの例がある：「lol」（どうでもいいに分類）と「i feel sad today」（面白いに分類）だ。「lol」は「どうでもいい」の青い雲の中に落ち、「i feel sad today」は黄色い点の側に位置する。3次元に削減した後でも分離は視認できる（全分散のうちわずか15.6%しか説明されていないにもかかわらずだ）。384次元では、境界ははるかに明確になる。

入力メッセージのセントロイドは、その内容に応じてこの空間内を動き回る。「どうでもいい/面白い」の分類は、単にどちらのセントロイドがコサイン類似度で近いかを測るだけだ。こうして各メッセージを多次元空間内の点として表現でき、各次元が意味的な性質に対応する。

---

## 実際に何が変わるのか

ユーザーはレイヤーもセントロイドもtemperatureの調整も目にすることはない。しかしその効果は感じ取れる。

- **シンプルなメッセージへの高速な応答**（小型モデルは2倍速く、トラフィックの70%を処理する）
- **適応的なトーン**：苛立っているとき、ボットはその苛立ちを「感じ取り」、スタイルを調整する
- **プラットフォーム横断の一貫性**：MatrixボットとDiscordボットは同じ脳、同じ感情状態を共有する
- **「アシスタントモード」の排除**：ファインチューニング + few-shot + インテリジェントなルーティングにより、企業的な応答を回避する

小型モデルの訓練サンプルを20万件に増やしたことで、これらの効果はさらに強化された。モデルはfew-shot primingがもたらす柔軟性を失うことなく、Discordの会話の多様性をより良く捉えられるようになった。

---

## 完全なインフラ構成

現在稼働しているサービスは以下の通りだ。

| サービス | 技術 | ポート | 役割 |
|----------|------|--------|------|
| Pixieglow | TypeScript (Bun) | -- | Matrixアダプター |
| Jade | TypeScript (esbuild) | -- | Discordアダプター |
| Emerald | TypeScript (Bun) | 3126 (WebSocket) | 脳 / 意思決定 |
| Sapphire | Python (FastAPI) | 3123 (HTTP) | 分類器 + 感情 |
| Krystal small | llama.cpp (PM2) | 3124 | 小型モデル (1.5B, どうでもいい) |
| Krystal large | llama.cpp (PM2) | 3125 | 大型モデル (3B+, 面白い) |

サービス間の依存関係は一方向だ。アダプターはEmeraldに依存し、EmeraldはSapphireに依存し、SapphireはKrystalに依存する。循環はない。各サービスは独立して再起動できる。

---

## まとめ

Luna Protocolを4つのレイヤーに分割したのは、単なるアーキテクチャの演習ではなかった。それは具体的な制約への回答だった -- Matrixをサポートできないこと、感情的な認識の欠如、メッセージのインテリジェントな優先順位付けの不在だ。

今日、システムはより堅牢になり（LLMのクラッシュがボットを道連れにすることはない）、より拡張しやすくなり（TelegramやWhatsAppのアダプターも同じWebSocketプロトコルに従うだろう）、そしてより「生きている」ものになった。ボットは会話の感情状態の認識に応じて、行動、トーン、さらにはLLMのパラメータまで調整する。

埋め込みセントロイドは、過剰な複雑さなしにこれらすべてを可能にする鍵となる要素だ -- 訓練済みニューラルネットワークもなく、ラベル付きデータのパイプラインもなく、あるのはベクトルの平均とコサイン類似度だけ。シンプルでありながら驚くほど効果的で、ひどく過小評価されている技術だ。

| リソース | リンク |
|----------|--------|
| プロジェクトのウェブサイト | [protocol-luna.github.io](https://protocol-luna.github.io/) |
| Pixieglow | [protocol-luna/pixieglow](https://github.com/protocol-luna/pixieglow) |
| Emerald | [protocol-luna/emerald](https://github.com/protocol-luna/emerald) |
| Sapphire | [protocol-luna/sapphire](https://github.com/protocol-luna/sapphire) |
| Krystal | [protocol-luna/krystal](https://github.com/protocol-luna/krystal) |
| 記事1：Discordボット | [Luna Protocol：自律型Discordボットを作った](/articles/ja/luna-protocol-discord-bot) |
| 記事2：ファインチューニング | [Luna Protocol：なぜ1.5Bモデルをファインチューニングしたのか](/articles/ja/luna-protocol-official-models) |