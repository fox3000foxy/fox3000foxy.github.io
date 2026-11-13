---
title: "Minecraft Bedrockで好きなケープを付ける方法"
description: "サードパーティランチャーと古いバージョンのゲームと、ノーと言えなかったケープ選択画面。完全チュートリアルと、なぜ動くのかの推定解説付き。"
date: 2026-07-14
tags:
  - minecraft
  - bedrock
  - tutorial
  - reverse-engineering
authors:
  - 9stown
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "PV//Hv1X4G7FD//uS9Mi+RxxQvawH8DJfNcjueOQ6+Pk+uHm9mOyK9OG5aMDkmtw4kJAZlL267sfTwooA/fu2Q=="
---

# Minecraft Bedrockで好きなケープを付ける方法

Java版には、本来持てないはずのケープを手に入れるひねくれた方法がいくらでもある（`cape-mod`の記事参照）。Bedrockではゲームが違い、認証も違う。それでも方法はある。サードパーティランチャーと、当然と思われてる検証を無視できるくらい古いゲームバージョンがあればいい。

やり方を示してから、裏側でたぶん何が起きてるか見ていく。

## 用意するもの

- Bedrock版Minecraftを所有するMicrosoftアカウント（自分のもので十分）
- 公式Minecraftランチャーのインストール済み
- [BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher)。あらゆる歴史的Bedrock版をインストールして起動できるオープンソースのサードパーティランチャー
- .NET 8.0 Desktop Runtime
- Windowsで開発者モード有効化

## ステップ1：公式ランチャーでBedrockを最低1回インストールする

他に何するより先に、公式Minecraftランチャーを開いて**Minecraft: Bedrock Edition**タブに行って**インストール**を押す。BedrockLauncherに触る前に、Bedrockが公式ルートで最低1回インストールされて起動されたことが必要だ。

![公式ランチャーからBedrock Editionをインストール](/images/bedrock-cape/bedrock-cape-01-install-bedrock.png)

## ステップ2：BedrockLauncherをダウンロードする

プロジェクトのGitHubリリースページへ行く。**Assets**に載ってる最新版のzipを取る。

![BedrockLauncherのGitHubリリースページ](/images/bedrock-cape/bedrock-cape-02-github-release.png)

## ステップ3：アーカイブを展開する

zipをダウンロードしたら、`Downloads`フォルダ（どこでもいいけど後で見つけられるところ）に展開する。

![BedrockLauncherアーカイブの展開](/images/bedrock-cape/bedrock-cape-03-extract-zip.png)

## ステップ4：実行ファイルを実行する

展開したフォルダに入って`BedrockLauncher.exe`を起動する。

![BedrockLauncher.exeの起動](/images/bedrock-cape/bedrock-cape-04-run-exe.png)

## ステップ5：.NET Desktop Runtimeを入れて開発者モードを有効化する

初回起動でWindowsがほぼ確実に**.NET 8.0 Desktop Runtime**を要求してくる。インストールすること。あと`設定 > システム > 開発者向け`で**開発者モード**も有効化する。BedrockLauncherはゲームをlooseパッケージ（Storeの正式署名パッケージじゃない生ファイル群）としてインストールするので、このモードなしではWindowsがそういうインストールを拒否するからだ。

![.NETランタイムのインストールと開発者モード有効化](/images/bedrock-cape/bedrock-cape-05-dotnet-devmode.png)

## ステップ6：新しいインストールを作る

BedrockLauncherを再起動してMicrosoftアカウントでサインインし、**Installations**タブに行って**New installation**を押す。

![BedrockLauncherで新規インストール作成](/images/bedrock-cape/bedrock-cape-06-new-installation.png)

## ステップ7：古いバージョンを選ぶ

インストールに名前を付けて、バージョン一覧から**古い**バージョンを選ぶ。だいたい`1.16.x`以前だ。**Create**を押す。

![古いバージョンの選択、ここでは1.16.0.2](/images/bedrock-cape/bedrock-cape-07-pick-old-version.png)

## ステップ8：インストールを開始する

**Play**を押す。ファイル展開にマシンによっては10分くらいかかることがある。ランチャーが固まったように見える（「応答なし」）のは正常だ。回したままにしておく。

![展開中、ランチャーは応答なしに見える](/images/bedrock-cape/bedrock-cape-08-launch-extracting.png)

## ステップ9：ケープを選ぶ

ゲームが起動したらアカウントでサインインして、新しいキャラクターを作ってスキン編集画面の**ケープ**タブに行く。そこにはMinecraftに存在するケープの完全一覧が出てくる。持ったことのないものも含めてだ（プロモイベントケープ、過去フェス、Mob投票など）。好きなのを選ぶ。

この段階ではスキンの見た目の**他部分は触らない**こと。ケープだけにしておく。

![キャラクター編集画面でのケープ選択](/images/bedrock-cape/bedrock-cape-09-choose-cape.png)

## ステップ10：公式バージョンを入れ直す

公式ランチャーに戻って**インストール**タブでメインのBedrockインストールを**アンインストール**してから入れ直す（または**更新チェック**）。今度は公式ランチャーからMinecraft Bedrockを起動し直す。

![公式ランチャーからのアンインストールと再インストール](/images/bedrock-cape/bedrock-cape-10-reinstall-official.png)

以上だ。公式バージョンの本物プロフィールにケープが付いてる。

## 裏側でたぶん起きてること

私はBedrockのクローズドソースには手を突っ込んでない（Javaと違ってデコンパイルできない）。だから以下は**推定**の説明で、絶対の確実性はない。でも観察された挙動はこの仮説にかなり合う。

### ケープ選択画面はアクセス制御じゃなかった

Bedrockではケープ選択画面はたぶん、自分のアカウントが持ってるケープだけじゃなく**ゲームに存在するケープの完全一覧**を表示してる。最近のクライアントでは、アプリ側フィルタ（クライアント側か、XboxやMicrosoftのentitlementサービスへのネットワーク呼び出し経由）で持ってないケープをグレーアウトか非表示にしてる。

ポイントは、このフィルタはたぶん**後から**足されたってことだ。十分最近のバージョンに追加されたものだ。1.16.xみたいなバージョンはこのフィルタより前か、違う（あるいは存在しない）検証機構を使ってる。一覧にあるものは全部選択可能になる。entitlementの有無に関わらずだ。

### ケープは結局どこに保存されるのか

これが再インストール後も残る理由を説明する部分だ。Bedrockのスキンやケープ選択は使い捨てのローカルファイルじゃない。Microsoftアカウントに紐付いたXbox Liveプロフィールに同期されてる可能性が高い（他のBedrockプラットフォーム、モバイルやコンソールなどでスキンを管理するのと同じ仕組み）。古いクライアントでケープを選ぶと、その選択はたぶんプロフィールサービスに送信される。正規ケープを持つ最新クライアントがやるのとまったく同じようにだ。クライアント視点では「自分のケープ」と「選んだケープ」に違いはないからね。プロフィールサービス側はこの点でクライアントを信頼してる。選択を記録して、裏に本当にentitlementがあるか再検証しない。少なくとも書き込み時にはね。

結果、最新の公式ゲームを起動し直すと、プロフィールサービスから現在のスキンやケープを取りに行く。サービスは記録されたものを忠実に返す。正規じゃないケープ込みでだ。entitlementチェックがあるとしても、たぶん選択時のUIでだけ行われて（だから最近クライアントにフィルタがある）。プロフィールにすでに記録されたものの**表示**は通してしまう。

### Java版との共通点

Java版の`cape-mod`と同じ系統の論理欠陥だ。サービスがデータを信頼して、各段階で出所を再検証しないパターンだ。Java版では有効なRSA署名だけど間違ったプロフィールにリプレイされたものだ。Bedrock版ではたぶん、正しいフィルタを持たなかった古いクライアントに受け入れられたケープ選択が、アカウントの永続状態へ再検証なしに伝播したものだ。どちらも問題は入口（Java版mod、Bedrock版古クライアント）じゃない。下流でentitlementを再検証すべき層がしないか、間違った場所で1回だけするかってことだ。

## なぜ今も動くのか

2つの説明が考えられる。互いに矛盾しない。

1. **Mojangはたぶんこれを優先事項と思ってない。** サードパーティランチャーが必要で、手順が多段階で、結果は見た目だけだ。ゲームプレイ有利も他人のデータ侵害もない。
2. **ちゃんと直すにはプロフィール読み取りのたびにentitlementを再検証する必要がある。** 選択時だけじゃなくだ。つまりスキン表示のたびに追加のネットワーク呼び出しってことで、見た目だけの問題にしては重い。

## 結論

このチュートリアルはスクショ10枚だけど、ソフトウェアセキュリティのあちこちに出る原則を例示してる。歴史的システム（古いクライアントバージョン、レガシーAPI、更新されないサービス）が共有状態にまだ書き込める限り、今のアクセス制御は今を通るものしか守らない。古いAPIにまだ話せるものは全部、新しめのフィルタを迂回する。フィルタは最近バージョンでは効いてるけど、その前のバージョンには適用されたことがなかったんだ。

---

**リソース**

- **BedrockLauncher**：[github.com/bedrockLauncher/BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher)
- **関連記事**：ケープMod、RSA署名インジェクションによるJava版の同等品

**要点3つ**

1. 古いBedrock版のケープ選択画面はたぶんゲーム内ケープの完全一覧を表示してて、entitlementフィルタがない。
2. 選択は正規ケープと同じようにXbox Liveプロフィールに同期される。プロフィールサービスはクライアントを信頼する。
3. entitlementチェックがあるとしても最近UIの選択時だけで、すでにアカウントに記録されたものの読み取り時には行われない。
