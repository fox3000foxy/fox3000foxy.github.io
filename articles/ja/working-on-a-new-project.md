---
title: 新プロジェクトに取り組む
description: 新ウェブサイトの立ち上げと開発過程の概要。
date: 2026-03-13
tags:
  - meta
  - webdev
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "mCztqRqtg4uCg1HCsvGWk4q1StTtAtKnvYgkWGDNv5Lxnwv1MIZsyD/3uRgZsgoGtL+hNx05wlVe6udYstve1g=="
---

# プロジェクト

取り組んでるプロジェクトはLLJTって言う。

![](assets/20260313_092734_image.png)

ウェブサイトでPWAでもある。だからモバイルアプリとして使える。本物の電話アプリみたいに振る舞うためMaterialUIを使ってる。
Muiのimportには時間かけた。11707モジュールから最後595まで落とした。各アイコンを分解 import じゃなく1行ずつ import してね。そのとき分解 import はアイコンライブラリ全体を読み込むのに、個別 import は使うものだけ読むって学んだ。

Nibiはこのサイトに繋がるボットだ。![](assets/20260313_093102_image.png)採点はGoogle Forms頼みだ。
![](assets/20260313_093255_image.png)
学生評価に選択問題を使って、大事な試験に受かった学生にDiscord役職や絵文字やチャンネルも付ける。

![](assets/20260313_093707_image.png)

このプロジェクトの目標は、私自身もやりたいことだから、私達と一緒に日本語を学ぶ人を助けることだ。
学生は進行のご褒美にCrunchyrollや他プラットフォームとの提携も解除する。

NibiとサイトはそれぞれCloudflare Workers（Hono Server付きInteraction URL）とReact付きGitHub Pagesでホストしてる。
サイトコードはオープンソースじゃないけど、Nibiはそうだ。[このGitHubリポジトリ](https://github.com/let-s-Learn-Japanese-Together/nibi)にある。サイトは個人情報入りだから非公開のままだ。でもどう作ったか知りたければDiscordで聞いて。過程を喜んで説明するよ！GitHub Enterprise払い避けに作ったGitHub Actionや、興味あれば説明できる他道具や技術も使ってる！

数日前から、ホスティング払わずプロジェクトをホストする回避策探しを大いに楽しんでる。だからNibiをInteraction EndpointボットにしてCloudflare Workersで無料ホストして、GitHub Pagesに無料デプロイするGitHub Actionを作った。この回避策探しは今も私のコードでいちばん刺激的な部分だ。違う考え方をして創造的な解を作らなきゃいけない。まさに予算なしのこの挑戦が私を動かす！

本来用途外でGitHub Actionsを使うこと、ボット「ホスティング」にCloudflare Workersを使うことも、新しいこと学んでクラウドホスティングみたいな新技術を発見する方法だ。ホスティングにお金払いたくない。

まだ取り組み中だけど、進捗追ってどう変わるか見たければ[Discordサーバー](https://discord.gg/frKZ9cJ4fD)に参加できる。興味あればプロジェクト参加もできるかも！サーバーは誰でも開いてて、一緒に日本語学ぶ人がもっとほしい！招待リンクはサイトにある。直接聞いてもいいよ！
