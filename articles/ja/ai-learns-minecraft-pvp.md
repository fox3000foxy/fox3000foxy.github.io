---
title: "AIがMinecraftのPvPを学ぶ：模倣学習、強化学習、そして重要だった30の変数"
description: "記録した決闘1,000戦、ピクセルで訓練したニューラルネット、90%の打撃予測精度。それでもボットは壁にまっすぐ突っ込んだ。その後RL、カリキュラム学習、60時間の訓練がやってきた。"
date: 2026-07-09
tags:
  - minecraft
  - ai
  - python
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "gRws/m0eS3Qf/cGFYthmKXayi0KM0seRWiSPVWlSivLSHmHn/oeFJ2Xb3xEZCPTtHDRfFldr9Xvao2KfBPgaaw=="
---

## はじめに

![AI Learns Minecraft PvP thumbnail](assets/ai-pvp-thumbnail.png)

Kadambi | AI Engineeringによる[AI Learns Minecraft PvP (Reinforcement Learning + Behavior Cloning)](https://www.youtube.com/watch?v=j5nxDKAjg6U)という動画がある。私が見たゲームAI訓練の記録の中で最も正直なものの1つだ。

内容は、MinecraftのPvP（剣キット、フルエンチャントのダイヤ装備）をプレイするボットを作ることだ。画面を見てマウスとキーボードにコマンドを送る。入力はピクセルのみ、出力はアクションのみで、ゲームのメモリ読み取りもマクロもmodも使わない。

この動画が面白いのは最終結果ではない。その道のりだ。模倣学習の失敗、特徴量エンジニアリングへの転換、壊滅的忘却のサイクル、そしてGPUなしノートPCでの60時間超の訓練。

## フェーズ1：模倣学習（失敗）

![The bot during imitation learning: facing a wall, jumping up and down](assets/ai-pvp-imitation-fail.png)

作者は筋の通った方法から始めた。自分のプレイで決闘を1,000戦記録し、各マウスクリックとキー押下を対応する画像に紐付け、ピクセルからアクションを予測するニューラルネットを訓練する。

```python
# 模倣学習パイプラインの疑似コード
dataset = record_duels(1000)          # 数十万フレーム
for frame, action in dataset:
    pixels = capture_screen(frame)
    network.train(pixels → action)    # 画像からキーボードやマウスを予測
```

ネットワークは打撃を**90%の精度**で予測できるようになった。有望だ。

そして本物の試合で試した。ボットはマップの端へまっすぐ進み、壁に向き合って、その場でジャンプを繰り返した。

なぜか。

**怠け者の罠。** PvP戦闘ではWキーがほとんどの時間押されている。ネットワークは、ただWを押しっぱなしにして他に何もしなければ高い精度が出せることに気づいた。他の全アクションを犠牲にして、最頻出アクションに最適化してしまった。

**人間の遅延。** データセット内のアクションは約200msの人間の反応時間分遅れている。1フレームごとに見ると、アクションと目に見える結果が数フレーム離れている場合、生ピクセルから因果関係を学ぶのはモデルにとってほぼ不可能だ。

**一貫性のないデモ。** 作者自身のプレイにばらつきがあった。同じ状況でも、ときどきキーボードでストレイフし、ときどきマウスで狙う。こうした矛盾する入力がネットワークを混乱させた。

## フェーズ2：カリキュラム付き強化学習

![The bot learning to track horizontally during RL training](assets/ai-pvp-rl-horizontal.png)

模倣学習を捨てて、作者はRLに切り替えた。でも真っさらなエージェントをいきなり完全なPvP決闘に放り込んでも無駄だ。同時に起きることが多すぎて、ランダムな探索では何も見つけられない。

解決策は**カリキュラム学習**だ。各メカニクスを切り離し、本物の戦闘に入る前に基礎を1つずつ習得させる。

### ステップ1：水平方向の照準（7時間）

最も単純な報酬関数だ。標的に当てたら正の報酬、ダメージを受けたら負のペナルティ。

最初、ボットはほとんど動かない（初期値が中立なニューラルネット）。横に震える。これはボットが、どのアクションが報酬を生むかいろんな動きを試している状態だ。

1時間後、水平方向に中央へ寄せることを学ぶが、まだぎこちない。7時間後、敵を左右に追えるようになった。ただし非対称で（右から左への移動より左から右の方が得意。この癖は訓練全体を通して残った）。

### ステップ2：特徴量エンジニアリング

生スクリーンショットは200万ピクセル超だった。360pに縮小しても入力が20万ある。多すぎて効率的に学べない。

作者は何千もの決闘を分析し、本当に重要な**30の変数**を特定した。3グループに分かれる。

**視覚（敵追跡）**：
- 照準（クロスヘア）から敵までの距離
- 敵のバウンディングボックスのサイズ
- 敵の高さ
- 照準の状態（標的の上か外か）
- 相対速度

画像全体を処理する代わり、ボットは敵の防具の色だけでピクセルをフィルタするので検出はほぼ一瞬だ。似た色の背景ブロックがこのフィルタを乱すこともある。でもMinecraftならテクスチャを変えればいいだけだ。

**OCR（HUD読み取り）**：
ゲームのコードから座標を取れないので、画面をリアルタイムでスキャンして抽出する。
- カメラのピッチ
- 運動量
- Yレベル

標準のOCRはMinecraftの半透明テキストに苦労するので、重要なデータは白黒に強制して即読めるようにしている。

**時間（コンテキストウィンドウ）**：
- 敵に当ててからの経過時間
- 敵に当てられてからの経過時間
- ボットの直前アクションのスライディングバッファ

これでネットワークに時間的コンテキストができる。これがないと、コンボの途中なのか戦闘開始直後なのかボットにはまったく分からない。

### ステップ3：垂直方向の照準（さらに7時間）

![The bot learning to aim up and down during RL training](assets/ai-pvp-rl-vertical.png)

マウスの上下移動を加えたら最初は「完全な大惨事」だった。初期性能はめちゃくちゃだ。

サンドボックスでさらに1時間後、ボットは上下を見る方法を理解した。でもその過程で水平方向の追跡をすっかり忘れていた。

これは**壊滅的忘却**だ。新しいデータへの最適化が以前学習した表現を上書きしてしまう、機械学習の古典的な問題である。垂直照準の最適化で、ニューラルネットは水平方向の進歩をうっかり消してしまった。結果、照準は水平に保てるが標的を追えないボットが残った。

水平追跡を取り戻しつつ垂直制御を維持するのに**さらに6時間**かかった。その後はOCRグループがカメラのピッチを抽出してくれるおかげで、良い照準位置を維持できた。

### ステップ4：キーボード操作

![The bot toggling the W key constantly, learning to commit to movement](assets/ai-pvp-keyboard.png)

ボットにキーボード使用を許可したら、時間的特徴量がさらに重要になった。最初、Wキーは常に入り切りを繰り返していた。ネットワークが動きへのコミットを学んでいないための速い切り替えだ。

この挙動にペナルティを与えたので、ボットは滑らかにすることを学んだ。スプリント中の打撃が増え始めた（立ったままの打撃のヒュッという音に対するドスッという音）。射程の優位を悪用しているように見えるコンボもあり、満足感に欠けた。

公平にするため、作者は敵の射程を伸ばした。ボットが学んだ戦略の多くが通用しなくなった。でも時間をかけて適応した。

### ステップ5：クリックのタイミングを教える

最終フェーズでは作者は模倣学習を持ち戻した。ただし完全な制御ポリシーではなく、クリックのタイミングだけを教えるためだ。ボットは記録済み決闘のクリックパターンを真似しようとした。

最初は、下手なクリックへのペナルティを恐れて何も試そうとしなかった。でも最終的に打つ勇気を見つけて命中させ始めた。もちろんその過程でまた照準を忘れた。作者は満足できる状態に戻るまで**さらに50時間**放置しなければならなかった。

## チート論争

動画はこう問いかけて終わる。このボットはチートなのか。

反対派の主張：ボットが処理するのは人間が見ているものだけ（同じピクセル）、送るのは人間と同じキーボードやマウス入力（アンチノックバックのようなパケット操作なし）、ゲームのメモリを読まない（X線もESPもなし）。

賛成派の主張：ボットは人間より速く処理できるし、相手が人間と対戦していると思っているのに実際は違うなら、それは欺瞞だ。

作者の見解：意図による。両者がボットだと知っていれば試合は公平だ。ボットは敵を虚空に100連撃でつなぐ。

## 結果

![The bot executing a 100-hit combo](assets/ai-pvp-final-combo.png)

**GPUなしノートPC**で訓練したMinecraft PvPボット。自作の訓練パイプラインによる。

- ピクセル入力用の**スクリーンキャプチャ**（200万超ピクセルから設計した30特徴量へ）
- **カリキュラム学習**（水平から垂直からキーボードからクリックへ）
- 運動制御用**RL**とクリックタイミング用**模倣学習**
- 生ピクセルへの**特徴量エンジニアリング**（視覚、OCR、時間の3グループ）
- 複数フェーズで**60時間超の訓練**

総訓練時間は数十時間だが、大半は放置だ。ボットは震えながら理解し、学んだことを忘れ、学び直し、最後に100連撃を決める。

動画はこちら。[youtube.com/watch?v=j5nxDKAjg6U](https://www.youtube.com/watch?v=j5nxDKAjg6U)。

---

*この記事は動画の内容のみを扱う。Minecraft AIのより広い文脈として、VPT、DreamerV3、模倣学習とRLの全体像については、以下のセクションでこのプロジェクトを分野全体につなげている。*

## VPT：大規模な行動クローニング

![OpenAI's VPT project diagram : the Inverse Dynamics Model predicts actions from pairs of frames](assets/vpt-overview.svg)

動画の「行動クローニング」手法（フェーズ1）は、OpenAIの**Video PreTraining（VPT）**プロジェクトが使ったのと同じ技術だが、リソースの spectrum の両極端にある。VPTは、7万時間の動画、720 GPU、ラベルなしデータを疑似ラベル付けする逆動力学モデルがあれば模倣学習がMinecraftで機能することを証明した。ここの作者はノートPCと決闘1,000戦では失敗することを証明した。でも根本理由は同じだ。模倣学習はデモの質に縛られる。

![OpenAI's VPT agent mining a tree in Minecraft](assets/vpt-minecraft.jpg)

VPTパイプラインはデータ問題を**逆動力学モデル（IDM）**の訓練で解決する。画像t-1と画像t+1を見て画像tでのアクションを予測する。IDMは非因果的（未来の画像を見る）なので、行動クローニングよりタスクが簡単で、必要なラベル付きデータがずっと少ない。契約者に約2,000ドル払って2,000時間のラベル付きデータを集め、IDMでYouTubeのMinecraft動画7万時間を疑似ラベル付けした。

![事前訓練データ量に対するクラフトや収集率（対数軸）：作業台、木の道具、石の道具](assets/vpt-stone-pickaxe-sequence.svg)

スケール効果は明確だ。事前訓練データを対数軸で1時間から10万時間まで増やすと、作業台、木の道具、石の道具を作る率が段階的に上がる。契約者がラベル付けした2,000時間だけで訓練したモデルは作業台止まりだ。IDMで疑似ラベル付けした7万時間を追加してこそ（グラフの点線）、石の道具がRLなしのゼロショットで出現する。

結果の0.5Bパラメータ基盤モデルは、RL単独では不可能なゼロショット能力に到達した。木を切り、作業台を作り、柱ジャンプする。そしてRLでファインチューンすると、ダイヤの道具を作る初のAIになった。

![RL訓練エピソード数に対する報酬：ランダム初期化モデルからとVPT事前訓練モデルから](assets/vpt-diamond-pickaxe-sequence.svg)

このグラフは、事前訓練が下流RLを根本から変える理由を示している。ランダム初期化ネットワークからのRL（オレンジ）は100万近いエピソードを通して0付近で横ばいだ。「ダイヤを取る」タスクは報酬が疎すぎて、素朴なエージェントがランダム探索でたどり着けない。VPT事前訓練モデルからのRLファインチューン（緑）は基礎行動（掘る、作る、探索する）をすでに持ち、ダイヤのつるはしへの完全な道筋に相当する報酬約25まで着実に上がる。

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/719971231?h=cbdf2617a1" title="VPT agent gameplay demo 1" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045834?h=9cb4118c65" title="VPT agent gameplay demo 2" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045849?h=00398908ed" title="VPT agent gameplay demo 3" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045863?h=060f07e290" title="VPT agent gameplay demo 4" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

*OpenAIのVPTプロジェクト公式デモ動画。エージェントの動きが見られる。*

## OpenAI Five：報酬設計の問題

![OpenAI Five playing Dota 2 against human professionals](assets/openai-five-dota2.jpg)

OpenAI Five（2019年）は自己対戦の純粋RLでDota 2の世界王者を破った。模倣学習なしだ。256 GPU、128,000 CPUコア、1日あたり180年分のプレイ、10か月の訓練。

でも報酬関数はDotaの専門家が手で設計した。**2万のうち28特徴量**で、それぞれ重みを手動調整した。正味価値、キル、デス、タワーのHP、レーン割り当て。すべて人間が選んで重み付けした。このモデリングなしではエージェントはほとんど学ばなかった（実験では勝敗のみの報酬だとセミプロ水準で頭打ち）。

動画のボットも同じ問題に直面している。その報酬関数は、何がPvPで重要かという作者の理解をエンコードしている（当てれば良い、当てられれば悪い、照準維持は良い）。これは避けられない。RLには報酬信号が必要で、その信号の設計には人間のバイアスが入り込む。

## DreamerV3：ワールドモデルと疎な報酬

![DreamerV3 benchmark scores across over 150 diverse tasks with a single configuration](assets/dreamerv3-benchmarks.png)

DeepMindのDreamerV3（2023年）は第三の道を取る。行動クローニングでも誘因付きRLでもなく、**ワールドモデル**を学ぶ。過去のアクションから未来の状態と報酬を予測するニューラルネットで、可能な未来を夢想して計画する。人間データもカリキュラムもなしにゼロからMinecraftでダイヤを集めた初のアルゴリズムで、2025年にNatureに掲載された。

![DreamerV3 learns a world model to imagine future trajectories](assets/dreamerv3-header.png)

ダイヤ環境は12のマイルストーンに疎な報酬を定義する（原木から板材から棒から作業台から木のつるはしから石から石のつるはしから鉄鉱石からかまどから鉄インゴットから鉄のつるはしからダイヤへ）。各1回だけ+1だ。あとは小さな体力報酬（HPあたりプラス・マイナス0.01）。到達可能な合計は36,000ステップのエピソードで11.1だ。

DreamerV3のワールドモデルは軌跡を想像して内部で評価できる。アクターは実経験ではなく夢想ロールアウトから学び、1つの実ステップごとに何千もの可能な未来を試す。これで、標準RLエージェントなら破綻する疎報酬が扱えるようになる。

100M環境ステップで訓練した40シードのうち、24が少なくとも1つのダイヤを集めた。最初のダイヤは29Mステップ後（1 GPUで約9日）に現れた。

## ANNA：記号AIとMinecraftの出会い

![ANNA's task tree decomposition for a flint-and-steel](assets/anna-task-tree.png)

動画のPvPボットより前、VPTやDreamerV3より前に、**ANNA**がいた。まったく違う哲学で作られたMinecraftボットだ。ピクセルや報酬から学ぶ代わり、**記号的状态機械**に**フランス語NLPパーサー**と手書きの**タスク依存ツリー**を組み合わせている。

2022年製（「vibe coding」がまだ言葉になる前）のANNAは、Mineflayer経由でMinecraftサーバーに接続し、フランス語の自然言語コマンドを理解する。「火打石と打ち金を取って」と言うと、ANNAは動詞を解析し（取ってから取るへ）、アイテムのレシピを探して、再帰的にサブタスクへ分解する。オークを掘るから板材を作るから棒を作るから作業台を作るから木のつるはしを作るから石を掘るから石のつるはしを作るから鉄鉱石を掘るから鉄インゴットを溶かすから火打石と打ち金を作る、まで。

![ANNA's NLP parser architecture for French command recognition](assets/anna-nlp-diagram.png)

NLP層（`utils/id_parser.js`）はコマンドを「そして」で分割して並列命令を処理し、フランス語動詞をタスク種別に対応付け、フランス語のアイテム名を5,000エントリの辞書経由でMinecraft IDに翻訳する。認識できないコマンドは、ANNAを自覚あるMinecraftコンパニオンとして提示するGPTベースの会話システムに回す。

**タスクツリー**（`mc-tasks-tree/`）が心臓部だ。Minecraftのアイテムグラフ（クラフトレシピ、採掘収量、モンスタードロップ、かまどレシピ）をたどって段階的プランを作る再帰アルゴリズムである。ダイヤのヘルメットなら木、石、鉄、ダイヤの各段階をカバーする40ステップ超の分解を生成する。

![ANNA's diamond helmet task tree : a 40+ step breakdown](assets/anna-diamond-helmet.png)

動画のPvPボットが経験から学ぶのに対し、ANNAは知識から動く。決闘1,000戦も60時間の訓練もいらない。ツリーとパーサーとサーバーやディストリビューターがあればいい。でもツリーがエンコードした範囲を超えて一般化はできない。どれだけ状態機械を工夫してもPvPは学べない。

ANNAの手法はAIの別の時代を映している。エンドツーエンド学習が主流になる前、丁寧なエンジニアリングと組み合わせた記号推論が知的行動を生めるという約束があった時代だ。今ではANNAとPvPボットのようなプロジェクトはMinecraft AIの両極を表す。一方は世界について推論し、もう一方は世界を知覚する。

## Master Gumboのメイスボット：コマンドブロックだけのAI

![The Mace PvP training arena with the bot](assets/mace-bot-arena.png)

Minecraft AIのまったく別の片隅では、YouTuberの**Master Gumbo**が**コマンドブロックだけ**でPvP訓練ボットを作った。バニラのMinecraftコマンドとレッドストーン、そして人型クローンエンティティ用のcarpet modだけだ。結果は一般向けの対戦相手AIで、ブリーチ切り替え、ウィンドチャージ、盾メカニクスをプレイヤーと一緒に練習する。

ボットは壊れない装備とオフハンドのトーテム（`/item replace`で毎tick補充）を持つゾンビとして始まり、事実上不死身だ。後にMaster Gumboは**Carpet Modのプレイヤーレプリカ**に切り替えた。ゾンビにはできない人型メカニクス（盾上げ、アイテム切り替え）に対応するためだ。

![The settings center : buttons to configure bot behavior](assets/mace-settings-center.png)

中心的な革新は**ランダム駆動の状態機械**だ。防具立てが色付きコンクリートの円の上に`/spreadplayers`コマンドでテレポートする。このコマンドはエンティティをランダムに散らす。防具立てが着地したコンクリートの色がボットの次の行動を決める。

- **赤コンクリート**は後ろにストレイフ
- **青コンクリート**はウィンドチャージで上昇（攻撃）
- **緑コンクリート**は盾を上げる
- **白コンクリート**は停止（行動間に遅延を加える）

![The AI decision system : an armor stand on colored concrete](assets/mace-ai-system.png)

防具立ての位置は、下のブロックを検出するコマンドブロックが読み取り、対応する仕掛けを作動させる。レッドストーンブロックを置くか取り除くかで各挙動を有効化・無効化する。`/spreadplayers`が繰り返し回るので、ボットは継続的に新しい決定を下し、予測不能だが構造化された挙動を生む。

Master Gumboはこれを「とても単純で基本的な形のAI」と呼ぶ。ニューラルネットのような相互作用からの学習はないが、ランダムと状態機械の組み合わせが、スクリプトボットより予測困難な現実的なPvP挙動を生む。設定センターにはAIの有効化・無効化、難易度調整、移動パターン設定のための本インターフェースが含まれる。

ボットで訓練した後、自分を下手呼ばわりしたプレイヤーと決闘して（動画イントロ）、Master Gumboが勝つ。マップはDiscord経由で共有され、Carpet Modが必要だ。

![The bot in a duel, practicing mace PvP techniques](assets/mace-final-duel.png)

KadambiのPvPボットがピクセルから学び、ANNAがタスクツリーで推論するのに対し、Master Gumboのボットは**ランダムな状態遷移**で知能に到達する。ニューラルネットなしで説得力あるPvP対戦相手を作れることを証明する、純コマンドブロックの手法だ。

## Altoclef：Baritoneと大規模タスクツリー

ANNAが何をすべきか*読んで*知る記号ボットで、メイスボットが決定をランダム化するなら、**Altoclef**はゲーム全体を計画的に進める完全自律エージェントだ。gaucho-matero作のFabric modで、**Baritone**パスファインディングを動力とする。どんなMinecraft目標もタスクツリーに分解して人間の介入なしに実行する。

インターフェースは騙されるほど単純だ。チャットで`@gamer`と打てば、Altoclefはサバイバルワールドから「ゲームをクリアする」タスクを始める。木を集め、道具を作り、鉄とダイヤを掘り、ネザーポータルを作り、ブレイズロッドとエンダーパールを集め、要塞を見つけてエンダードラゴンを倒す。全部自律で、ネイティブのMinecraftクライアント経由で、どんなバニラサーバーでもだ。

内部では**再帰的タスクツリーシステム**で実現している。高水準目標（たとえば「ダイヤのつるはしを作る」）は前提タスクへ分解される。ダイヤを掘るから溶かすから棒を作るから組み合わせる、まで。ツリーはMinecraftの全レシピグラフをたどり、生産チェーン、モンスタードロップ、ルートテーブル、コンテナアクセスを処理する。ANNAの手書きツリーと違い、Altoclefのタスクは任意のロジックを実装できる**プログラマブルなJavaクラス**だ。戦闘戦略、ピグリン交易、探索パターンなどである。

鍵となる設計思想は、**何を**（タスクツリー）と**どう**（Baritoneパスファインディング）の分離だ。Baritoneが低水準の移動を担う。パスファインディング、障害物回避、ブロック破壊、インベントリ管理で、タスクシステムが高水準プランを指揮する。このモジュール性のおかげで、どちらの部品もAIである必要がない。どちらも決定論的アルゴリズムだが、組み合わせると学習手法に匹敵する複雑で目的志向の挙動が生まれる。

Altoclefは**純粋記号Minecraft AI**の到達点だ。訓練なし、GPUなし、人間データなしでゼロからゲームをクリアできる。でもプログラマーが想定しなかったタスクには適応できず、経験から学べない。ダイヤのつるはしを作れるのは、自分で発見したからではなく、Javaクラスが正確な方法を教えているからだ。

## つなげるもの

| 手法 | 主な方法 | データ | 計算資源 | 結果 | |
|--------------------------|---------------------|---------|--------|-----------|-|
| 動画のPvPボット | RL + 模倣学習 | 決闘1,000戦 | ノートPC1台、60時間 | 100連撃 | |
| OpenAI Five | 自己対戦RL | 1日180年分のプレイ | 256 GPU、10か月 | Dota 2世界王者 | |
| VPT | 半教師ありIL | YouTube 7万時間 + IDM | 720 GPU、9日 | ダイヤ道具 | |
| DreamerV3 | ワールドモデルRL | 夢想軌跡 | 1 GPU、9日 | ゼロからダイヤ | |
| **ANNA** | **記号NLP + タスクツリー** | **手書きレシピ** | **ノートPC1台、即時** | **全クラフト可能品** | |
| **Altoclef** | **Baritone + タスクツリーFS** | **Javaタスククラス** | **Fabric mod、GPUなし** | **ゲーム全体クリア** | |
| **メイスボット** | **コマンドブロック状態機械** | **ランダム決定** | **バニラMC、GPUなし** | **メイスPvP訓練** | |

動画のボットは最もリソースが制約されているが、プロセスに最も正直だ。まず失敗し、反復する。学んだことを忘れ、学び直す。100連撃で終わる。でも作ったものがチートなのかという問いも残す。

---

**動画**：Kadambi | AI Engineeringによる[AI Learns Minecraft PvP](https://www.youtube.com/watch?v=j5nxDKAjg6U)

**VPT**：[論文](https://cdn.openai.com/vpt/Paper.pdf)・[ブログ](https://openai.com/index/vpt/)・[GitHub](https://github.com/openai/Video-Pre-Training)

**OpenAI Five**：[論文](https://arxiv.org/abs/1912.06680)・[ブログ](https://openai.com/index/dota-2/)

**DreamerV3**：[論文](https://arxiv.org/abs/2301.04104)・[GitHub](https://github.com/danijar/dreamerv3)

**ANNA**：[GitHub](https://github.com/fox3000foxy/ANNA)・（Node.js、Mineflayer、フランス語NLP、タスクツリー）

**Altoclef**：[GitHub](https://github.com/gaucho-matrero/altoclef)・[アクティブなフォーク](https://github.com/drmcbride12/altoclef)・（Fabric、Baritone、タスクツリー、ゲームクリア）

**メイスボット**：Master Gumboによる[動画](https://www.youtube.com/watch?v=Fmp2Il70IF8)・（コマンドブロック、Carpet Mod、状態機械）
