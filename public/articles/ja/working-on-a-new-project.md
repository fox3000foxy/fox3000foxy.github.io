---
title: 新しいプロジェクト
description: 新しいWebサイトの開始と開発のプロセスについて。
date: 2026-03-13authors:
  - fox3000foxy
tags:
  - meta
  - webdev
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "MZsUjhD40Jko4SvR0Gd5U6+s4mJhEjIRD61Yp5UC6D+uRi5oW0/JKUkbaR86dTelopE2UAU13aXuFm8NepPKgA=="
---

# 新しいプロジェクト

今やってるプロジェクトはLLJTって名前なんだ：

![](assets/20260313_092734_image.png)

これはPWAでもあるWebサイト、つまりモバイルアプリでもあるんだ。MaterialUIを使ってて、本物のスマホアプリみたいな感じになってる。
最近Muiのインポートを整理する必要があって、11707モジュールからたったの595まで減らした。アイコンを分割インポートじゃなくて1行ごとに手動でインポートするようにしたんだ：分割インポートするとアイコンライブラリ全体を読み込んじゃうけど、個別にインポートすれば必要なものだけ読み込めるって学んだよ。

NibiはこのWebサイトに接続されてるボットだ。![](assets/20260313_093102_image.png)進級はGoogle Formsベースだよ：
![](assets/20260313_093255_image.png)
選択式テストで生徒を評価して、主要な試験に合格したらDiscordのロールや絵文字、チャンネルも与えてるんだ。

![](assets/20260313_093707_image.png)

このプロジェクトの目標は、一緒に日本語を学ぶ人を集めること。自分自身も日本語を学びたいと思ってるからね。
生徒はCrunchyrollとのパートナーシップや他のプラットフォームもアンロックできるようになってて、能力に応じて報酬がもらえる仕組みだよ。

NibiとWebサイトはそれぞれCloudflare WorkersのHono Server Interaction URLと、GitHub PagesのReactデプロイでホストされてる。
Webサイトのコードはオープンソースじゃないけど、Nibiはそうだよ。[このGitHubリポジトリ](https://github.com/let-s-Learn-Japanese-Together/nibi)で見れる。Webサイトを公開してないのは個人情報が含まれてるからだけど、どうやって作ったのか知りたかったらDiscordとかで聞いてくれれば、喜んで説明するよ！実際、GitHub Enterpriseにお金を払わなくていいように作ったGitHub Actionを使ったり、他にもたくさんのクールなツールやテクニックを使ってるんだ！

最近はホスティングにお金を払わないで済む方法を見つけるのに夢中になってて、NibiをインタラクションエンドポイントボットにしてCloudflare Workersで無料ホストできるようにしたし、WebサイトをGitHub Pagesに無料デプロイするGitHub Actionも作った。抜け道探しはコーディングの中で一番楽しい部分の一つだと思う。枠にとらわれずに考えて、創造的な解決策を見つける必要がある--そこが好きなんだ。ただコードを書くだけじゃなくて、お金をかけずにものを動かす方法を見つけること、それが本当に楽しめるチャレンジなんだよね。

GitHub Actionsを本来の用途とは違う形で使ったり、Cloudflare Workersでボットを「ホスト」するのも、新しいことを学び、新しい技術を発見する方法なんだ。クラウドホスティングみたいにね。もうホスティングにお金なんて払いたくないんだよ。

まだ作業中だけど、[Discordサーバー](https://discord.gg/frKZ9cJ4fD)に参加すれば進捗を追えるし、どう進化していくか見れるよ。興味があればプロジェクトに参加もできる！サーバーは誰にでも開かれていて、一緒に日本語を学ぶ旅に参加してくれる人を歓迎してる。招待リンクはWebサイトにあるし、欲しければ俺に直接聞いてもいいよ！
