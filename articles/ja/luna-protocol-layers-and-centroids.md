---
title: "Luna Protocol：頭の共有、感情分類、おもしろ・くだらないルーティング"
description: "Luna Protocolはモノリスから4層アーキテクチャへ変わった。アダプター、brain、感情分類器、inferenceだ。内容は埋め込みcentroid、おもしろ・くだらないルーティング、価位と覚醒度によるLLMパラメータ調整。"
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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "eCisA3oKdLFNIyfvVr7W7Ch6TLVmUTQ62xpjNrktEsF9VGUvuUUgddX2RSINx8V7TkrgJxkz2u8/56oAHPoJcw=="
---

# Luna Protocol：頭の共有、感情分類、おもしろ・くだらないルーティング

前の[2本](/articles/fr/luna-protocol-discord-bot)の[記事](/articles/fr/luna-protocol-official-models)では、Luna Protocolを複雑な挙動システムと微調整モデルを持つ単体のDiscordボットとして紹介した。でもアーキテクチャはその後かなり変わった。モノリスだったもの、つまりDiscordボットも挙動もLLM呼び出しも扱う単一Node.jsプロセスが、**4つの独立層**に変わった。各々独自の責務、独自の言語、独自のライフサイクルを持つ。

この分離は思いがけない利益を運んだ。複数プラットフォーム間の「頭」の共有、LLMパラメータを動的調整する感情分類システム、会話の知覚重要度で2モデル間を振り分ける賢いルーティングだ。

進化は一気に起きたんじゃない。有機的な道をたどった。まずボットリポジトリから`server/`フォルダを分けて、**Krystal**を作って**Jade**をDiscordアダプターとして残した。次にJadeの`llm-core`とイベントバスを引き継いで**Pixieglow**（Matrixアダプター）を作った。次にDistilBERTでGENERIC/SEMANTIC分類を入れる**Sapphire**が来た。結果は決定的じゃなくて、埋め込みcentroid経由になった。例追加に柔らかくて正確だからだ。分類はFUTILE/INTERESSANTになった。最後にLLMの温度とrepeat penaltyを調整する**価位**と**覚醒度**のcentroidを足した。締めにJadeとPixieglowの重複コード全部を剥がして**Emerald**、共有の頭を作って、JadeとPixieglowを単純なsocket-drivenクライアントに変えた。

並行して、プロジェクト進捗をたどるウェブサイトを保った。[protocol-luna.github.io](https://protocol-luna.github.io/)だ。

この記事では層をどうなぜ切ったか、各サービスが正確に何するか、**centroid**（埋め込みの平均ベクトル）や**感情変数**（70年代チャットボットPARRY由来）みたいな概念が単なるDiscordボットを驚くほど一貫したマルチプラットフォームシステムにどう変えたか語る。

---

## モノリス問題

最初、Luna Protocolは単一Node.jsプロセスに収まってた。コードが扱ってたのはこうだ。

- Discord接続（Erisライブラリ経由）
- 起動評価（メンション、キーワード、フォローアップなど）
- 人間挙動の再現（タイプミス、ためらい、睡眠など）
- ローカルLLMサーバー（llama.cpp）へのHTTP呼び出し
- セッションとスパム対策の管理
- TTSパイプライン

全部同じプロセスで、型付きイベントバス（`TypedBus`）経由で通信してた。動いてた。でも限界があった。

- 行動コード全部を複製せず**Matrixクライアントを足せない**
- **LLMとボットが同じリポジトリ**：`server/`フォルダはすでにあったけど、片方を触らずもう片方を進化させられない
- **無差別処理**：各メッセージが同じ扱いだった。「lol」も実存の問いもね
- **感情健忘**：ボットは何も「感じ」なかった

層分割がこの問題全部を解いた。

---

## 4層

今のLuna Protocolアーキテクチャは4水準の漏斗として組まれてる。

```
Matrix / Discord
      |
      v
  [ADAPTATEURS]      Pixieglow (Matrix) / Jade (Discord)
      |
      v
  [BRAIN]            Emerald (WebSocket, port 3126)
      |
      v
  [CLASSIFIEUR]      Sapphire (HTTP, port 3123)
      |
      v
  [INFERENCE]        Krystal (llama.cpp, ports 3124 / 3125)
```

各層は独立に再起動も更新も置換もできる。

---

### 層1：アダプター（PixieglowとJade）

いちばん単純な層だ。唯一の仕事はメッセージングプラットフォームのイベントをEmerald向け標準化プロトコルに翻訳することだ。

- **Jade**はDiscordアダプターだ。ErisライブラリでDiscord接続して、WebSocket経由でメッセージをEmeraldへ転送する。TTSパイプラインも扱う（Piper経由の音声合成、OGG変換、Discordアップロード）。
- **Pixieglow**はMatrixアダプターだ。MatrixのHTTP Client-Server APIを直接使う（SDKなし）。long-poll sync付きだ。TTSはない。

両アダプターは`emerald-client.ts`定義の同じWebSocketプロトコルを共有する。

```typescript
type ClientId = "jade" | "pixieglow";

// イベント（アダプターからEmeraldへ）
type InEvent = MessageEvent | ReadyEvent | BotMessageEvent | PresenceEvent;

// コマンド（Emeraldからアダプターへ）
type OutCommand = RespondCommand | TypingCommand | SetPresenceCommand
                | SpontaneousCommand | ForgotCommand;
```

同じインターフェースの2アダプター存在が共有を証明する。**同じ「頭」（Emerald）がDiscordボットにもMatrixボットにも無差別に仕える**んだ。挙動は同一だ。プロトコルは宣言的だ。Emeraldはアダプターにメッセージ送信の*方法*を言わない。*何*を送るか言うんだ（遅延付きテキスト、バースト計画、リアクションなど）。各アダプターがプラットフォーム別に具体的実行を実装する。

このアーキテクチャの強さはここだ。TelegramやSignalなどの対応を足すには、WebSocketプロトコルを実装するアダプターを書くだけでいい。

---

### 層2：頭（Emerald）

Emeraldは中央決定サービスだ。ポート3126でWebSocketを聞いて、こう管理する。

- **起動評価**：メンション、DM、名前、キーワード、フォローアップ、ランダム
- **挙動再現**：集中遅延、タイプミス、ためらい、忘却、バースト、話題疲れ
- **睡眠周期**：sleepやslowやshortモード
- **セッション管理**：クールダウン、セッション上限、スパム対策
- **Sapphireへの振り分け**：メッセージ送信、配信応答の受信

Emeraldは共有を可能にした中央サービスで、分離の利益がいちばん大きかった。以前、各挙動（typo、burst、hesitation）はDiscordコードと絡み合ってた。今は`behavior/`内の専用モジュールにある。

```
emerald/src/behavior/
  burst.ts         -- 連投メッセージの計画
  mannerisms.ts    -- 遅延、ためらい、反応、忘却
  sleep.ts         -- 睡眠時間の評価
  typo.ts          -- タイプミス再現（AZERTYやQWERTY）
```

頭はどのプラットフォームで回ってるか知らない。`clientId`（「jade」か「pixieglow」）付き`MessageEvent`を受けて、決定して、コマンドを返す。残りはアダプターがやる。

---

### 層3：感情分類器（Sapphire）

Sapphireは技術的にいちばん面白いサービスだ。FastAPI製Pythonの**LLMミドルウェア**で、4つの重要役割を果たす。

1. 埋め込みcentroidによる**二値分類FUTILE / INTERESSANT**
2. centroidによる**感情スコア**（価位や覚醒度）
3. Krystalへの**バックエンド振り分け**（小モデル対大モデル）
4. **few-shot注入**とセッション管理

#### centroid：分類の心臓

**centroid**は単純な概念だ。埋め込みベクトル集合の平均だ。具体的には、何百ものメッセージ例を集めて、埋め込みモデル（`BAAI/bge-small-en-v1.5`、384次元）に通して、得たベクトルを平均した。

**分類centroidは2つ**ある。

- `futile_centroid`：約683の他愛ないメッセージ（「lol」「ok」「hello」）。k-means経由（k=10、seed=42）
- `interessant_centroid`：約678の実質メッセージ（技術、個人、哲学）。k-means経由（k=10、seed=42）

メッセージが来たらこうだ。

```python
def classify(text, embedder, futile_centroids, interessant_centroids):
    emb = embedder.query_embed(text)                     # 384次元ベクトル
    sim_f = max(cos(emb, c) for c in futile_centroids)     # 10個の最大
    sim_i = max(cos(emb, c) for c in interessant_centroids) # 10個の最大
    diff = sim_i - sim_f
    label = "INTERESSANT" if diff > 0 else "FUTILE"
    return label, abs(diff), sim_f, sim_i
```

クラス別スコアは10 centroid中の**最大コサイン類似度**だ。これで各カテゴリ内サブタイプを掴む。あいさつも別れも埋め込み空間で遠くてもくだらない10 centroidのどれか近くに落ちる。起動時k-meansだけで実行時は内積だけだ。訓練なし、GPUなしだ。

#### なぜ2モデルか

この分類結果で呼び出すLLMバックエンドが決まる。

| ラベル | Krystalバックエンド | モデル | ポート |
|-------|----------------|--------|------|
| `FUTILE` | `generic` | Luna-Protocol-1.5B（941MB、Q4_K_M） | 3124 |
| `INTERESSANT` | `semantic` | Hermes-3-3Bか8B（設定による） | 3125 |

直観は単純だ。「lol」とか「nm just chillin u」に80億パラメータモデルを呼ぶ価値はない。Discord 20万サンプルで微調整した小モデルLuna 1.5Bで軽いやり取りには十分だ。逆に、人生の問いや打ち明けや技術議論は豊かな応答を出せる大モデルへ振る。

この経済的振り分けはLLMサーバー負荷をかなり減らす。メッセージの約70パーセントはFUTILE分類で小モデル処理になって、本当に価値ある会話向けに大モデルが空く。

#### 感情軸：価位と覚醒度

でも全部じゃない。Sapphireは**同じcentroid仕組み**を独立軸で使ってメッセージ感情を評価する。

**感情centroidは4つ**ある。

| 極 | 例 |
|------|----------|
| `positive` | "hell yeah"、"love that"、"this is great" |
| `negative` | "shut up"、"i hate this"、"this sucks" |
| `high_arousal` | "WHAT THE HELL"、"omg omg omg"、"AAAAA" |
| `low_arousal` | "just chilling"、"meh"、"i guess" |

スコアは各軸の類似度差分で計算する。

```python
valence = sim(emb, positive) - sim(emb, negative)     # [-1, +1]
arousal = sim(emb, high_arousal) - sim(emb, low_arousal)  # [-1, +1]
```

**価位**はメッセージが肯定か否定か測る。**覚醒度**は感情強度を測る。合わせると情動のcircumplexモデルになる（Russell、1980年）。1972年のチャットボット**PARRY**に着想を与えたのと同じ心理学モデルだ。

#### 感情変数：感情がLLMをどう操るか

PARRY由来の着想が具体になるところだ。PARRY（Kenneth Colby作、1972年）はパラノイア患者を真似る設計のチャットボットだった。内部変数（恐怖、怒り、不信）が応答を変えた。たとえば「怯えた」PARRYは攻撃的に応答した。

Sapphireは同じことをする。でも連続変数でもっと優雅な方法でね。LLMの抽出パラメータは会話の感情状態に応じてリアルタイム調整される。

##### 温度は覚醒度に従う

```python
temperature = clamp(0.7 + arousal * 0.3, 0.4, 1.0)
```

| 覚醒度 | 温度 | 効果 |
|---------|-------------|-------|
| -1.0（静） | 0.40 | 低創造性、予測可能応答 |
| 0.0（中立） | 0.70 | デフォルト創造性 |
| +1.0（興奮） | 1.00 | 最大ランダム性、驚く応答 |

誰かが興奮か立腹してる（高覚醒度）と温度が上がる。モデルは多様で創造的で、ときどき混沌な応答を出す。「熱く」なる人間みたいにね。会話が静かなら温度は下がって、応答は落ち着く。

##### repeat penaltyは価位に従う

```python
repeat_penalty = clamp(1.15 - valence * 0.1, 1.0, 1.3)
```

| 価位 | Repeat Penalty | 効果 |
|---------|---------------|-------|
| -1.0（否定） | 1.25 | 強い罰、繰り返し回避 |
| 0.0（中立） | 1.15 | デフォルト値 |
| +1.0（肯定） | 1.05 | 弱い罰、繰り返し許容 |

会話が否定なほど、モデルは繰り返し避けを強く押される。緊迫口論で言葉探す人みたいにね。会話が肯定なほど、冗長な断言を許せる。くつろいだ会話みたいにね。

##### 累積感情状態

このスコアは直後メッセージだけのものじゃない。`EmotionState`はセッションごとに価位と覚醒度の**指数移動平均**を保つ。

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

`decay` 0.85は各メッセージで前状態の85パーセントを保って、新信号の15パーセントを入れるってことだ。これで**感情メモリ**ができて、荒い変動を均す。否定メッセージ1つでボットが「悲しく」はならない。でも否定メッセージ連続で気分は少しずつ流れる。

実際はこうだ。誰かがとても興奮して会話を始めたら（`arousal=+0.8`）、後続メッセージが静かでも数往復は温度が高いままだ。感情は下がるのに時間がかかる。口論後に「熱い」ままの人間みたいにね。

---

### 層4：推論（Krystal）

Krystalはいちばん下の層だ。OpenAI互換API（`/v1/chat/completions`）を出す`llama.cpp`ラッパーだ。PM2インスタンス2つで回る。

- `krystal-small`：微調整Luna 1.5Bモデル。ポート3124、CPU affinity 0
- `krystal-large`：Hermes 3Bモデル。ポート3125、CPU affinity 0,1

両インスタンスはプリコンパイル`llama-server`プロセスで、`taskset`付きでCPU固定して起動する。

Lunaモデルの微調整も2つ目の記事から進化した。今は**200,000サンプル**で訓練する（前は50,000）。QLoRA経由でQwen2.5-1.5B-Instructからだ。20万サンプルはDiscord-Dialoguesデータセットの部分集合で、いちばん自然で多様な会話だけ残すよう濾過した。狙い：few-shot primingをあれだけ効かせる柔軟さを失わず、モデルの文体レパートリーを広げることだ。

---

## 完全図：通過中の1メッセージ

Discordで「je suis vraiment triste aujourd'hui」って誰かが送ったら具体的にこうなる。

1. **Jade**がDiscord API Gateway経由でメッセージを受ける。`MessageEvent`に変えてWebSocketでEmeraldへ送る。
2. **Emerald**が起動を評価する（メンション？名前？キーワード？）。直接メンションだ。集中遅延を計算して、クールダウン、セッション、話題疲れを確認する。返事を決めてHTTPでSapphireへメッセージを送る。
3. **Sapphire**が`bge-small-en-v1.5`でメッセージを埋め込む。
   - 分類：メッセージは`futile` centroidより`interessant` centroidに近い（diff = +0.31）→ **INTERESSANT**
   - 感情：否定価位（-0.42）、中程度覚醒度（0.35）
   - 振り分け：`KRYSTAL_SEMANTIC_URL`方向だ（ポート3125、大モデル）
   - 抽出パラメータ：温度 = 0.80（覚醒度上昇）、repeat_penalty = 1.19（否定価位）
   - セッション感情状態はこの値で更新する
4. **Krystal**（大インスタンス）が感情調整パラメータで応答を生成してSapphireへ返す。
5. **Sapphire**が応答をメタデータ付き（ラベル、価位、覚醒度、デバッグ統計）でEmeraldへ配信する。
6. **Emerald**がためらい（「oh...」）追加を決めて、バースト（2断片）を計画して、リアクションを選ぶ。`RespondCommand`をJadeへ送る。
7. **Jade**が実行する。初期遅延を待って、ためらい付き第1断片を送って、1.5秒待って、第2断片を送る。生成中ずっと入力中表示を出す。

ユーザーには全部3秒未満だ。

---

## centroid：なぜ神経分類器より良いか

埋め込みcentroidを伝統分類器（前に使ってたDistilBERTみたいの）じゃなく選んだのは説明が要る。

神経分類器はクラス間の決定境界を学ぶ。だいたい入力を確率へ映す非線形変換だ。正確だけど、こうだ。

- ラベル付き訓練データが要る
- 分布変化（data drift）に弱い
- 解釈が難しい
- 新クラス追加に再訓練が要る

centroidは逆に、例埋め込みの**平均ベクトル**だ。分類はこの平均ベクトルへのコサイン類似度でやる。利点：

- **訓練不要**：手選び例の埋め込み平均を計算するだけだ
- **解釈しやすい**：centroidにいちばん近い例を見れば「centroidが何学んだか」分かる
- **クラス追加**：再訓練なしで新centroidを足すだけだ
- **頑丈**：centroidは平均だから外れ値の影響が小さい

centroidの本当の力は分類問題を**空間距離測定**問題に変えることだ。カテゴリを384次元空間の領域として可視化できる（PCAやt-SNE次元削減後の2Dや3Dで）。

### centroidの3D可視化

実際、埋め込み空間の分類centroidはこんな感じだ。各点がメッセージ例で、PCAで3D投影してる（可視化のため元384次元を3に減らす）。青点がくだらないメッセージ、黄点がおもしろメッセージだ。**20のダイヤ印**がk-means centroidだ（クラス10個ずつ、seed=42）。点にホバーで元の例文が見られる。

<iframe src="assets/centroids-plot.html" style="width:100%;height:550px;border:none;border-radius:8px;" loading="lazy" title="Classification par centroïdes - vue 3D interactive"></iframe>

テスト例2つが赤で出てる。「lol」（くだらない分類）と「i feel sad today」（おもしろ分類）だ。384から3次元に減らした後も（説明分散14.7パーセント）、2クラスタは明確に分離する。上注釈が正確な数と曖昧域を示す。

入力メッセージのcentroidは内容に応じてこの空間を歩く。FUTILE/INTERESSANT分類はコサイン類似度でどっちのcentroidが近いか測るだけだ。各メッセージを多次元空間の点として表せる。各次元が意味特性に対応する。

---

## 実際何が変わるか

ユーザーは層もcentroidも温度調整も見ない。でも効果は感じる。

- **速い応答**：単純メッセージ向けだ（小モデルは2倍速くてトラフィック70パーセントをさばく）
- **適応する調子**：立腹してたらボットは立腹を「感じ」て文体を適応する
- **プラットフォーム横断の一貫性**：MatrixボットとDiscordボットは同じ頭と同じ感情状態を共有する
- **守られる本物調子**：微調整とfew-shotと賢い振り分けで事務的な応答を避ける

小モデルの訓練サンプル20万化はこの効果をさらに強めた。few-shot primingが許す柔らかさを失わず、Discord会話の多様性をモデルがよく掴む。

---

## 完全土台

今回ってるサービスはこうだ。

| サービス | 技術 | ポート | 役割 |
|---------|------------|---------|------|
| Pixieglow | TypeScript (Bun) | -- | Matrixアダプター |
| Jade | TypeScript (esbuild) | -- | Discordアダプター |
| Emerald | TypeScript (Bun) | 3126 (WebSocket) | 頭や決定 |
| Sapphire | Python (FastAPI) | 3123 (HTTP) | 分類と感情 |
| Krystal small | llama.cpp (PM2) | 3124 | 小モデル（1.5B、くだらない） |
| Krystal large | llama.cpp (PM2) | 3125 | 大モデル（3B+、おもしろ） |

サービス間依存は一方向だ。アダプターはEmerald依存、EmeraldはSapphire依存、SapphireはKrystal依存だ。グラフは非循環のままだ。各サービスは独立再起動できる。

---

## 結論

Luna Protocolを4層に割ったのはアーキテクチャの体操だけじゃなかった。具体的な限界への答えだった。Matrix対応不可、感情意識欠落、メッセージの賢い優先付け欠如だ。

今、仕組みは頑丈だ（LLMクラッシュでボットは死なない）。拡張できる（TelegramやWhatsAppアダプターは同じWebSocketプロトコルに従う）。「生きて」る。ボットは会話の知覚感情状態に挙動も調子も果てはLLMパラメータも適応する。

埋め込みcentroidが全部可能にする鍵要素だ。過大な複雑さなしにね。訓練済み神経ネットなし、ラベル付きデータパイプラインなし。ベクトル平均とコサイン類似度だけだ。単純で、信じられないほど効いて、ひどく過小評価されてる技術だ。

| リソース | リンク |
|----------|------|
| プロジェクトサイト | [protocol-luna.github.io](https://protocol-luna.github.io/) |
| Pixieglow | [protocol-luna/pixieglow](https://github.com/protocol-luna/pixieglow) |
| Emerald | [protocol-luna/emerald](https://github.com/protocol-luna/emerald) |
| Sapphire | [protocol-luna/sapphire](https://github.com/protocol-luna/sapphire) |
| Krystal | [protocol-luna/krystal](https://github.com/protocol-luna/krystal) |
| 記事1：Discordボット | [Luna Protocol：Discord自律ボットを作った](/articles/fr/luna-protocol-discord-bot) |
| 記事2：微調整 | [Luna Protocol：なぜ1.5Bモデルを微調整したか](/articles/fr/luna-protocol-official-models) |
