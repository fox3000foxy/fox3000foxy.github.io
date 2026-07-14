---
title: "valorant-short-maker: Valorantのショート動画を自動生成するパイプライン"
description: "Groq/Llamaでスクリプト、Piperで音声、FFmpegでそれ以外全部。cronジョブが@valorant_agentsに毎日1本の動画を企画から公開まで全自動で作り上げる仕組み。"
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "4UEXH2siqcUMGWgIL0JXzfBKKTLjakkE+ciV6LavRjw7GnIrLLBi5LThk/r+82GHFoKPHBr5BwjgZBXnkyzEgA=="
---

# valorant-short-maker: Valorantのショート動画を自動生成するパイプライン

ここ数ヶ月、俺が一切触らなくても勝手に回ってるYouTubeチャンネルがある: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)。Valorantのエージェントたちがラウンドの合間に言い合いをして、吹き替えされて、カラオケ字幕付きでショート動画として公開されてる。全部 [`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker) が生成してる。TypeScript/Bunのパイプラインがcronで回って、誰もクリックしなくても公開まで済ませてくれる。

どう動いてるか、ステップごとに解説する。

## 成果物

"Duelist Debate"（フェニックス、ヨル、ジェット）の動画から抜き出した3フレーム:

![ショートのイントロ、エージェントの丸アイコンとシーンタイトル](/images/valorant-short-maker/vsm-01-intro.png)

![セリフが進行中、カラオケ字幕が光る](/images/valorant-short-maker/vsm-02-dialogue.png)

![別のセリフ、話しているエージェントによって字幕の色が変わる](/images/valorant-short-maker/vsm-03-dialogue.png)

このショートの実物: [Duelist Debate -- youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU)。チャンネルのショートは大体1.2〜1.5kビューくらい。大した数字じゃないけど、最初から完全自動で回ってるチャンネルだから、本当に大事な数字はゼロだ -- cronを起動してから費やした時間ゼロ分。

## パイプライン、順を追って

### 1. スクリプトを書く -- Groq + Llama 3.3

毎回の実行で、26人のエージェントからランダムに3〜4人を選び、Llama 3.3 70B（Groq経由）にシステムプロンプトを送る。プロンプトには、選ばれた各エージェントの性格の簡潔な要約と、シーンに登場する他のエージェントとの関係性が含まれている（このペルソナデータは `src/lore/` にエージェントごとのファイルとして管理されてる）。プロンプトは厳格なルールを課す: 1行は短くパンチの効いた文、キャラクター間の公平なローテーション、ユーモア優先、そして何より -- 間（ポーズ）。

具体例として "Duelist Debate" -- フェニックス、ヨル、ジェットが誰がデュエリストをやるかで言い争うシーン、2026年7月6日生成:

```
phoenix: I'm telling you, I've got the skills to play duelist this match.
yoru: Skills, you call burning things skills, Phoenix.
jett: I'm the fastest one here, I should play duelist.
phoenix: Fastest, but can you handle the heat, Jett [0.3] I doubt it.
yoru: Heat, ha, you think your flames are hotter than my rifts.
jett: This isn't about heat or flames, it's about speed and agility.
phoenix: Oh, I see, so now you're an expert on duelists, Yoru [0.3] that's rich.
yoru: At least I don't rely on cheap fire tricks.
jett: Cheap fire tricks, that's what you call Phoenix's abilities.
phoenix: Hey, my fire tricks have gotten us out of tight spots before [0.3] can't say the same for your rifts, Yoru.
yoru: Tight spots, you mean like the time I rifted us out of that trap.
jett: Enough, this is getting nowhere, let's just decide already.
phoenix: Fine, but I'm still saying I'm the best duelist here.
yoru: Please, you think you can take on the enemy team alone [0.3] I doubt it.
jett: I can take them on, no problem, I'm the fastest.
phoenix: Fastest, yeah, but can you outmaneuver them [0.3] that's the question.
yoru: Outmaneuver, ha, you think you can outmaneuver anyone, Phoenix.
jett: This is stupid, we're not going to agree on this.
phoenix: Fine, let's just play and see who comes out on top [0.3] I'm game if you are.
yoru: Bring it on, I'll show you what a real duelist looks like.
jett: I'm not backing down, I'm playing duelist.
phoenix: Oh, this should be good [0.3] let's see how you two do.
yoru: We'll see who comes out on top, won't we, Jett.
jett: Yeah, let's end this debate once and for all.
pause: 0.3
phoenix: Alright, let's get started then [0.3] may the best duelist win.
yoru: I'll make sure to burn you, Phoenix, not with fire, but with my rifts.
jett: I'll take you both down, no problem.
```

間こそが自然なリズムを作る細部だ。セリフの途中に入った `[0.3]` は画面上のエージェントの丸を切らずに音声に0.3秒の無音を作り、独立行の `pause: 1.0` は二人の話者の間に本当の沈黙を作って丸を隠す。これがないと、TTSが息継ぎなしでセリフを連打してロボットみたいになる。

### 2. 声を与える -- Piper、エージェントごとに1モデル

各エージェントは専用に学習されたPiperモデル（`.onnx`）を持っていて、`voices/<agent>/` に保存されている。生成されたテキストが該当モデルを通り、WAVが出てくる。俺が普段カスタム音声のトレーニングに使ってるのと同じ技術だ（Piper/Kaggleパイプラインの記事参照） -- ここではそのまま本番で、その場で、動画生成のたびに適用される。

### 3. カラオケ字幕 -- ASS生成、アイコンから色抽出

字幕は単なる `.srt` じゃない。単語単位で生成された `.ass`（Advanced SubStation Alpha）ファイルで、カラオケ効果が入ってる: 発話される単語ごとに色が点灯し、残りのテキストは中間色のままだ。強調色は固定じゃなくて -- 話しているエージェントのアイコンから動的に抽出される（PythonスクリプトがPILでアイコンのPNGを読み込み、非透明ピクセルをサンプリングして主要色を返す）。結果: Killjoyの字幕は紫色に、Jettのは青緑に光る。どこにも色がハードコードされてない。

### 4. 音声反応サークル -- フレームごとに1つのFFmpeg式

パイプラインで一番めんどくさくて、かつ一番誇らしい部分。話してるエージェントの丸いアイコンは静止してない: 自分の声のリズムに合わせて微妙にズームイン・アウトする。

計算はセリフの生WAVを読み、RMSエンベロープ（root mean square、信号エネルギーの測定値）を60fpsでフレームごとに計算し、最大値で正規化し、3フレームウィンドウで平滑化してガタつきを防ぐ。各エンベロープ値は `MAX_ZOOM_VARIATION`（0.2、基本サイズの±20%）で制限されたスケール係数に変換される。

この計算結果はピクセルを操作するコードで適用されるんじゃない -- 巨大なFFmpeg条件式に変換され（`lt(n,K)*val + between(n,K,K')*val + ...`、フレームグループごとに1分岐）、ビデオフィルターの `scale` パラメータを直接駆動する。FFmpegがレンダリングの全フレームでこの式を評価する。60fpsで数秒のセリフなら、1つの式の中にすぐに数百の分岐ができる -- だからフレームをグループ化して深さを制限する `STEP` パラメータがある。

### 5. セグメントごとのレンダリング、イントロにfisheye

各セリフは個別にレンダリングされる: 動画背景（`bg-video/`のゲームプレイクリップからランダムに、適切な長さにカット）、その上に音声反応ズーム付きのエージェントの丸、FFmpegの `ass` フィルターで字幕を焼き込み、TTS音声を背景ゲームサウンドとミックス。

一番最初のセグメントだけ特別処理: 最初の20%フレームで徐々に消えるfisheye歪み（フレームごとの `lenscorrection` フィルター + 隣接フレームをブレンドしてモーションブラーをシミュレートする `tmix=frames=3`）、「whoosh」効果音と同期。これがカメラがシーンに「入っていく」ようなイントロのトランジションだ。

### 6. 結合と最終ミックス

全セグメントが端から端まで結合され、BGM（Sneaky Snitch, Kevin MacLeod, Creative Commonsライセンス）が **オーディオダッキング** でミックスされる -- サイドチェインコンプレッションがエージェントの発話中は自動的にBGM音量を下げ、無音中に戻す。全部が最初から最後まで60fpsで動き、ステップ間のフレームレート変換は一切ない。

### 7. 自動公開

標準的なcronで起動される `run-cron.sh` スクリプトがPython環境を有効化し、`.env` を読み込み、`bun src/workflow.ts --upload` を実行する。`--upload` フラグはさらにメタデータ（タイトル、説明、タグ）の生成をトリガーし、`uploaders/upload.py` を呼び出し、YouTubeとInstagramに別々のスクリプト（`uploaders/youtube/upload.py` と `uploaders/instagram/`）で動画を公開する。LLMプロンプトから動画がオンラインになるまで、全チェーンが人間の介入なしで回る。

## なぜ全部PythonじゃなくてTypeScript/Bunなのか

思想的な選択じゃない -- Bunなら `Bun.spawn` でFFmpegをサブプロセスとして直接かつ高速に制御でき、パイプラインのデータ構造（`Phrase`, `SegmentInfo`）に強い型付けができて、数時間おきにcronで回るスクリプトとしてはNodeより圧倒的に起動が速いからだ。プロジェクトにPythonが2箇所だけあるのは、Pythonが本当に最適な場所だからだ: PILで色抽出、そしてアップロードAPI（YouTube用の `google-api-python-client`、IG用のInstagram Graph APIスタック）。

## これが示すもの

このプロジェクトは、今日完全に無料かオープンソースのブロックだけで何が作れるかの良い例だ: Groq API経由の高速無料LLM、専用GPUなしで動くローカルTTSエンジン、全動画レンダリングにFFmpeg -- そしてつなぎ役はたった数百行のTypeScript。個々のブロックはどれも新しくない。パイプラインを成立させているのは組み合わせだ: 本物のキャラクター関係性を持った一貫性のあるスクリプトを生成し、自然な間のある表現豊かな音声に変換し、その音声のエネルギーにフレーム単位でビジュアルレンダリングを同期させ、公開までの全チェーンを自動化する。

---

**リソース**

- **リポジトリ**: [github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **チャンネル**: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**3つの重要ポイント**

1. スクリプトはLLM（Groq/Llama 3.3）がエージェントごとのペルソナと関係性に基づいて生成する。あらかじめ書かれたジョークのリストじゃない。
2. エージェントの丸のズームは、WAVのRMSエンベロープからフレームごとに計算されたFFmpeg式で駆動される -- 従来のキーフレームアニメーションじゃない。
3. プロンプトからYouTube/Instagram投稿まで全チェーンが、1つのcronジョブだけで人間の介入なしに回る。
