---
title: "valorant-short-maker：Valorantショートを1人で作るパイプライン"
description: "台本はGroqやLlama、声はPiper、残り全部FFmpeg。cronジョブが@valorant_agentsに1日1本動画を作って公開する。AからZまで。"
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "Zu4oPqj9Do/BxNzwmG/kBH/Kbr6r/rY2dfMrgl5I2MZDRFHcj/eoG+rT4q3c+ix2OPhn60wADM/nzWYk0tRQpw=="
---

# valorant-short-maker：Valorantショートを1人で作るパイプライン

数か月前からYouTubeチャンネルが触らずに回ってる。[@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)だ。ラウンド合間に言い合うValorantエージェント、吹き替え付き、カラオケ字幕付き、Shorts公開だ。全部[`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker)が作ってる。cronで回るTypeScriptやBunのパイプラインで、誰も何も押さずに公開する。

仕組みを段階ごとに見せる。

## できるもの

"Duelist Debate"（Phoenix、Yoru、Jett）用に作った動画から抜いた3フレームだ。

![ショートのイントロ、場面タイトル付きエージェント円](/images/valorant-short-maker/vsm-01-intro.png)

![台詞の途中、光るカラオケ字幕](/images/valorant-short-maker/vsm-02-dialogue.png)

![別台詞、エージェントで変わる字幕色](/images/valorant-short-maker/vsm-03-dialogue.png)

live の結果はこのShortだ。[Duelist Debate -- youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU)。チャンネルではShortsが1.2から1.5k再生くらいだ。大したことないけど、最初から1人で回るチャンネルだ。本当に大事な数はゼロだ。一度cron回したら使う時間ゼロ分ってことだ。

## パイプライン、順番に

### 1. 台本を書く。GroqとLlama 3.3

各runは26人から3、4エージェントをランダムに引く。Groq経由のLlama 3.3 70Bにシステムプロンプトを送る。選んだ各エージェントの短い人格要約と場面内他エージェントとの関係付きだ（このpersonaは`src/lore/`にいる。エージェントごとに1ファイル）。プロンプトは正確な規則を課す。台詞ごとに短く刺さる1文、人物間の公平な交代、ユーモア優先、何より pause だ。

"Duelist Debate"の具体例。Phoenix、Yoru、Jettが誰がduelistやるか争う。2026年7月6日生成だ。

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

pause がリズムを自然にする詳細だ。台詞真ん中の`[0.3]`は画面のエージェント円を切らず音声ファイルに0.3秒無音を作る。対して単独行の`pause: 1.0`は2話者間に本物無音を作る。円隠しだ。これなしでは、呼吸せず台詞つなげるTTSはロボットっぽく聞こえる。

### 2. 声を付ける。Piper、エージェントごとに1モデル

各エージェントは独自Piperモデル（`.onnx`）を持つ。専用訓練したものだ。`voices/<agent>/`に保存する。作ったテキストは対応モデルを通ってWAVを出す。普段のカスタム声訓練に使うのと同じ技術だ（PiperやKaggleパイプライン記事参照）。ここでは本番に直接、その場で、各動画生成に当ててる。

### 3. カラオケ字幕。作るASS、アイコンから取る色

字幕は単純`.srt`じゃない。語ごとに作った`.ass`ファイル（Advanced SubStation Alpha）で、カラオケ効果付きだ。各語が言われるにつれて色で光って、残りテキストは中立色のまま残る。強調色は固定じゃない。話すエージェントのアイコンから動的抽出する（PythonスクリプトがPILでアイコンPNGを回して、透明外ピクセルを抽出して、支配色を返す）。結果：Killjoy字幕は紫に光って、Jettは青緑に光る。どこにも色はハードコードされてない。

### 4. 音反応円。1フレーム1式のFFmpeg

パイプラインでいちばんひねくれた部分で、たぶんいちばん誇らしい。話すエージェントの丸アイコンは静止しない。自分の声のリズムで少しズームインやアウトする。

計算は台詞の素WAVを読んで、60fpsで1フレームごとにRMS envelope（root mean square、信号 energy の尺度）を計算して、最大で正規化して、ぎくしゃく避けに3フレーム窓で滑らかにする。各 envelope 値を`MAX_ZOOM_VARIATION`（0.2、基準サイズ周りプラスマイナス20パーセント）で区切った倍率に変換する。

この計算結果はピクセルいじるコード経由で当てない。巨大なFFmpeg条件式（`lt(n,K)*val + between(n,K,K')*val + ...`、フレーム群ごとに1分岐）に翻訳して、動画フィルタの`scale`パラメータを直接操る。FFmpegはレンダー各フレームでこの式を評価する。60fpsで数秒の台詞なら1式にすぐ数百分岐だ。だから`STEP`パラメータでフレームをまとめて深さを抑える。

### 5. 区切りごとレンダー、イントロに fisheye

各台詞は個別レンダーする。背景動画（`bg-video/`内ゲームプレイ切り抜きからランダム抜粋、正しい長さに切り）、上に音反応ズーム付きエージェント円、FFmpeg `ass`フィルタ経由で焼く字幕、背景ゲームプレイ音と混ぜるTTS音声だ。

最初区切りは特別処理を受ける。頭20パーセントフレームで少しずつ解けるfisheye歪みだ（1フレームごとに評価する`lenscorrection`フィルタと、動きぼかし再現に隣フレーム混ぜる`tmix=frames=3`）。"whoosh"ノイズと同期する。カメラが場面に「入る」感じを出すイントロ遷移だ。

### 6. 連結と最終混合

全区切りを端から端へつなげて、背景音楽（Sneaky Snitch、Kevin MacLeod、Creative Commonsライセンス）を**ダッキング付き**で上に混ぜる。エージェントが話す間音楽音量を自動下げて、無音で上げる sidechain 圧縮だ。全体60fpsで端から端まで、段階間でフレームレート変換なしだ。

### 7. 自動公開

`run-cron.sh`スクリプトは古典cronで起動して、Python環境を入れて、`.env`を読んで、`bun src/workflow.ts --upload`を走らせる。`--upload`フラグはメタデータ生成（タイトル、説明、タグ）を起こして`uploaders/upload.py`を呼ぶ。2つの別スクリプト経由でYouTubeとInstagramに動画公開する（`uploaders/youtube/upload.py`と`uploaders/instagram/`）。LLMプロンプトからオンライン動画まで全連鎖が人手なしで回る。

## なぜ全部PythonじゃなくTypeScriptやBunか

選択は思想じゃない。Bunが`Bun.spawn`でFFmpegを子プロセス操る直接高速アクセスをくれて、パイプライン構造（`Phrase`、`SegmentInfo`）に強い型付けをくれて、X時間ごとにcron回るスクリプト用にNodeより起動が断然速いランタイムだからだ。プロジェクト内Python2つはPythonが本当に最適道具なところにある。色抽出用PILと、アップロードAPI（YouTube用`google-api-python-client`、IG用Instagram Graph API一式）だ。

## 示すこと

このプロジェクトは今日無料かオープンソースの部品だけで何作れるかの良い例だ。Groq API経由の速く無料なLLM、専用GPUなしで回るローカルTTSエンジン、全部の動画レンダー用FFmpeg。つなぎはTypeScript数百行だけだ。部品はどれも個別には新しくない。パイプラインを作るのは配置だ。人物間の本物関係付き一貫台本を作って、自然 pause 付き表現豊かな音声に変えて、この音声 energy に1フレームごとに視覚レンダーを同期させて、公開まで全連鎖を自動化する。

---

**リソース**

- **リポジトリ**：[github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **チャンネル**：[@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**要点3つ**

1. 台本はエージェントごとのpersonaと関係付きLLM（GroqやLlama 3.3）で作る。単なる書き置き冗談一覧じゃない。
2. エージェント円ズームはWAVのRMS envelope から1フレームごとに計算したFFmpeg式で操る。古典 keyframes アニメじゃない。
3. プロンプトからYouTubeやInstagram投稿まで全連鎖が単一cronジョブで人手なしに回る。
