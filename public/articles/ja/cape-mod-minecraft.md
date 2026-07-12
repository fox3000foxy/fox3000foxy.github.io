---
title: "Cape Mod：RSA署名注入でJeb_のケープを奪う方法"
description: "Minecraftの信頼システムにおける論理的欠陥を悪用するFabric Mod：Mojangの正当なRSA署名を別のアカウントで使い回す。コードの解説、セキュリティへの影響、暗号の教訓。"
date: 2026-07-11
tags:
  - minecraft
  - fabric
  - java
  - rsa
  - signature
  - reverse-engineering
  - security
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "9baRaTYEPIIjO5/xJ6pRuuI0oVlqtq9rGNbkaPpvSgs3V1JOWnVb1tWtI2tECNxABIm9oT6Cg/g2yVThB9EFdA=="
---

# Cape Mod：RSA署名注入でJeb_のケープを奪う方法

もし、有効なRSA署名が1つあれば――ただし**誤ったアカウントのもの**でも――友達にあなたがMojangの公式ケープを着けていると思い込ませられるとしたら？ `cape-mod`へようこそ。これは、Minecraftが署名を信頼する一方で、その署名が本当に自分のプロフィールに属するものかを検証しないことを利用したFabricのエクスプロイトです。

## 背景：Minecraftはスキンとケープをどう扱うか

Java Editionでは、あまり疑問に思われないことがあります：**プレイヤーのスキンとケープを表示する責任はクライアントとサーバーのどちらにあるのか？**

答えは微妙です：

| コンポーネント | 誰が送信するか？ | 誰がダウンロードするか？ |
|---|---|---|
| **スキンテクスチャ** | サーバーが署名付きURLを送信 | クライアントが `textures.minecraft.net` からダウンロード |
| **ケープテクスチャ** | サーバーが署名付きURLを送信 | クライアントが `textures.minecraft.net` からダウンロード |
| **`textures` プロパティ** | サーバーがMojang認証からの `GameProfile` を送信 | クライアントがRSA署名を検証 |

重要なポイント：すべては `GameProfile` の `textures` と呼ばれるプロパティに含まれています。このプロパティには以下が含まれます：
- テクスチャのURLを含むbase64エンコードされたJSONペイロード
- Mojangの秘密鍵で作成された**RSA署名**

## RSA署名の壁

デコードすると、各 `textures` プロパティは次のようになります：

```json
{
  "timestamp": 1783666316269,
  "profileId": "d90b68bc81724329a047f1186dcd4336",
  "profileName": "akronman1",
  "signatureRequired": true,
  "textures": {
    "SKIN": {
      "url": "http://textures.minecraft.net/texture/3e6defcb7de5a0e05c75525c6cd46e4b9b416b92e0cf4baa1e0a9e212a887f3f7"
    },
    "CAPE": {
      "url": "http://textures.minecraft.net/texture/70efffaf86fe5bc089608d3cb297d3e276b9eb7a8f9f2fe6659c23a2d8b18edf"
    }
  }
}
```

クライアントはjarに埋め込まれた**公開鍵**（`yggdrasil_session_pubkey.der`）に対してRSA署名を検証します：

```java
// Property.java (authlib)
public boolean isSignatureValid(PublicKey publicKey) {
    Signature sig = Signature.getInstance("SHA1withRSA");
    sig.initVerify(publicKey);
    sig.update(this.value.getBytes());
    return sig.verify(Base64.decodeBase64(this.signature));
}
```

リモートプレイヤー（ローカル以外）の場合、クライアントは**`secure`とマークされた**スキン――つまり有効な署名のあるもの――だけを受け入れます：

```java
// SkinManager.createLookup() -- 簡略化
PlayerSkin skin = optional
    .filter(ps -> !isRemote || ps.secure())  // ← リモートプレイヤーはセキュアである必要がある
    .orElse(defaultSkin);
```

このチェックは理論上スプーフィングを防ぎます。しかし、ここからが面白くなるところです。

## 脆弱性：署名のリプレイ

クライアントはRSA署名が**有効かどうか**を検証します。しかし、JSONに含まれる `profileId` が実際のプレイヤーのUUIDと一致するかどうかは**決して**検証しません。

言い換えれば：**既存のMojangアカウント**（例えばMojang社員のもの）から取得した `textures` プロパティを、他のどのプレイヤーにでもリプレイできます。署名は有効なままです――Mojangによって正しく作られたものです――ただ別のアカウントからのものにすぎません。

### 実際の署名を抽出する方法

Jeb_（UUID `853c80ef-3c37-49fd-aa49-938b674adae6`）はMojang Studiosのケープを持っています。Mojangのセッションサーバーから：

```bash
curl -s "https://sessionserver.mojang.com/session/minecraft/profile/853c80ef-3c37-49fd-aa49-938b674adae6?unsigned=false"
```

レスポンス：

```json
{
  "id": "853c80ef-3c37-49fd-aa49-938b674adae6",
  "name": "jeb_",
  "properties": [
    {
      "name": "textures",
      "value": "ewogICJ0aW1lc3RhbXAiIDogMTc4MzYxOTcyNjAxMSwKICAicHJvZmlsZUlkIiA6ICI4NTNjODBl...",
      "signature": "RgIPF4d/iTDWJV..."
    }
  ]
}
```

この `value` フィールドの `signature` はMojangによって生成されました。RSA-2048 SHA-1です。別のUUIDでリプレイしても、それは**完全に**有効です――なぜならJeb_の署名はJeb_の署名であり続け、クライアントはそれが**あなたのものであるべきか**を決して検証しないからです。

## コード：Modの仕組み

`cape-mod` は非常に小さい――65行のJavaです。核心部分はこちら：

```java
@Mixin(Player.class)
public class ServerPlayerMixin {
    private static final String TEXTURES_VALUE =
        "ewogICJ0aW1lc3RhbXAiIDogMTc4MzY2NjMxNjI2OSwKICAicHJvZmlsZUlkIiA6ICJkOTBi...";
    
    private static final String TEXTURES_SIGNATURE =
        "oxoAfZRLVNSfXYFMNbDKZ9XxrTHmz/k2yxzOxksXY3f6aDhY3gCyFCCtDreEWI7fpG9...";

    @Inject(method = "getGameProfile()Lcom/mojang/authlib/GameProfile;", 
            at = @At("RETURN"), cancellable = true)
    private void injectCape(CallbackInfoReturnable<GameProfile> cir) {
        Player self = (Player) (Object) this;
        if (!(self instanceof ServerPlayer serverPlayer)) return;
        MinecraftServer server = ((ServerPlayerAccessor) serverPlayer).getServer();
        if (!(server instanceof IntegratedServer)) return;

        GameProfile host = server.getSingleplayerProfile();
        GameProfile original = cir.getReturnValue();
        if (host == null || !host.name().equals(original.name())) return;

        // texturesプロパティをJeb_のものに置き換える
        ImmutableMultimap.Builder<String, Property> b = ImmutableMultimap.builder();
        for (Property p : original.properties().values()) {
            if (!p.name().equals("textures")) {
                b.put(p.name(), p);
            }
        }
        b.put("textures", new Property("textures", TEXTURES_VALUE, TEXTURES_SIGNATURE));
        cir.setReturnValue(new GameProfile(original.id(), original.name(), 
                                           new PropertyMap(b.build())));
    }
}
```

**手順**：
1. `Player.getGameProfile()` に**Mixin**――プレイヤーのプロフィールが返されるポイント
2. ローカルサーバー（Integrated Server）であることを確認
3. host（LANワールド）であることを確認
4. `textures` プロパティをJeb_のものに**置換**（ハードコード）
5. 注入されたテクスチャで新しい `GameProfile` を返す

`GameProfile` は**偽造**されています：人為的に構築されたプロフィールで、実際のプレイヤーとは一致しません。`textures` プロパティはJeb_から**リプレイ**されています――RSA署名は本物ですが、誤ったプロフィールに適用されています。ネットワークパケット自体は正当です：サーバーは通常通り、この変更されたプロフィールを含む `ClientboundPlayerInfoUpdatePacket` を送信します。偽造されているのはパケットではなくプロフィールです。

hostの友達がLAN経由で接続すると、変更されたプロフィールを含む `ClientboundPlayerInfoUpdatePacket` を受信します。クライアントは：
1. base64ペイロードをデコード
2. RSA署名を検証 → ✅ 有効（Jeb_のもので正真正銘）
3. 署名が有効なためスキンを `secure=true` とマーク
4. `!isRemote || ps.secure()` フィルターを通過 → ✅ 通過
5. **Jeb_のケープをダウンロードして表示**

## ゲーム内の結果：あなたのスキンにケープが

ゲーム内での見え方はこちらです。まず、正面から見たhostに表示されたJeb_のケープ：

![Cape Mod -- Jeb_ cape affichée sur le host](/images/cape-mod/cape-01-jeb-cape.png)

公式Mojang Studiosケープの赤と白の模様がはっきりと見えます。自分のケープを持っている本物のJeb_と何ら変わりません――クライアントは `textures.minecraft.net` からまったく同じテクスチャをダウンロードします。

実際のゲームプレイでの没入感のあるビュー：

![Cape Mod -- vue en jeu avec cape visible](/images/cape-mod/cape-02-lava-cape.png)

ケープはプレイヤーの後ろでなびき、動きに合わせて揺れます。公式ケープ付きの本物のスキンと完全に見分けがつきません。

別の角度から、溶岩と地形のあるワールドで：

![Cape Mod -- cape dans un environnement naturel](/images/cape-mod/cape-03-local-game.png)

そして実際のゲームプレイの最後の接写、ケープが動作している様子：

![Cape Mod -- cape en gameplay classique Minecraft](/images/cape-mod/cape-04-real-gameplay.png)

hostがModを入れていることを知らずにLANに参加した人には、本物のMojangケープと区別する方法はまったくありません。それがまさにポイントです：**署名は有効**であり、クライアントが疑う理由は何もありません。

## なぜこれが脆弱性なのか（そしてなぜ脆弱性でないのか）

皮肉なことに：このエクスプロイトは**署名が有効であるからこそ**機能します。暗号のバイパスがあるわけではありません――もっと悪質で、これは信頼モデルにおける**論理的欠陥**です。

| チェック | 結果 |
|---|---|
| **RSA署名の有効性** | ✅ 有効（MojangがJeb_に対して署名） |
| **ペイロード内の `profileId` はhostのUUIDと一致するか？** | ❌ いいえ（Jeb_のUUID ≠ hostのUUID） |
| **クライアントはその一致を検証するか？** | ❌ **しない。RSA署名のみが検証される。** |

Minecraftは**署名**を信頼し、それを保持する者の**身元**を信頼しません。署名がMojangからのものである限り、クライアントはそれを受け入れます。これは、政府が署名した偽のパスポートを示すようなものです――印鑑は合法でも、パスポートはあなたのものではありません。

## セキュリティへの影響

### LANに限定された範囲

このModは統合サーバー（LAN）でのみ機能します。攻撃者は以下が必要です：
- Fabric Modがインストールされていること
- LANワールドのhostであること
- 友達がModなし（バニラ）で接続すること

### しかし可能性は広がる

理論上、同じ技術で以下のことが可能です：
- **他の署名付きデータの再注入**：ヘッド、不正なエンチャント、悪意のあるチャットコンポーネント
- **LANトンネルとの組み合わせ**（NGROK、playit.gg、Radmin VPN）でインターネット上のプレイヤーに影響を与える
- 署名に依存するプロフィールの**他のプロパティに拡張**

### Mojangがおそらくパッチを当てない理由

厳密な意味での「脆弱性」はありません――署名は有効です。これを修正するには、Mojangが認証モデル全体を変更する必要があり、それは複雑です。現時点ではエッジケースです：LANプレイヤーはお互いを信頼しているという前提があります。

## 哲学的な罠

Cape Modは、より広い真理の優れた**概念実証**です：**署名が誰によって、何に対して行われたかを検証せずに、署名を決して信頼してはならない**。

これは基本的な暗号の教訓です。RSAは**メッセージ**に署名し、**身元**に署名するわけではありません。もし私があなたにMojangの有効なRSA署名を渡したら、あなたはMojangが*何かに*署名したことを知ります。それが誰のためのものかはわかりませんし、メッセージを見ただけでそれを推測することはできません。

これは2000年代にCAが何でも受け入れていた時のSSL/TLS証明書で起きたこととまったく同じです――署名は有効でしたが、それが誤ったドメインに適用されていました。

## 結論

Cape Modは従来の意味でのハックではありません――Minecraftにおける論理的検証の欠如をエレガントに悪用したものです。これが示すこと：

1. **有効な署名は、それを保持する者の身元を保証しない**
2. **LANでは、信頼は思われているよりも弱い**
3. **Minecraftの `textures` プロパティは本質的に注入されたコンテンツである**――それを保持するプレイヤーと一致することを検証する必要がある

もし「未知の」（というより、hostが疑わしいModを入れている）LANワールドに参加するなら、ケープ以前にすでにセキュリティ問題があります。しかしこれは象徴的です：MinecraftはLAN上の全員がお互いを信頼していると想定しています。それは真実です...そうでなくなるまでは。

---

**リソース**

- **GitHub**: [fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **Minecraft認証**: [Yggdrasil protocol](https://wiki.vg/Authentication) (wiki.vg)
- **RSA暗号**: [RFC 3447](https://tools.ietf.org/html/rfc3447) (PKCS #1)

**3つの重要ポイント**

1. RSA署名はメッセージを検証するものであり、身元を検証するものではない――この詳細は多くのシステムに大きな代償をもたらしてきた。
2. Minecraftは受け取った署名がプレイヤーのプロフィールと一致するかを検証しない――暗号ではなく論理の脆弱性である。
3. LANでもトンネルでも、統合サーバーを制御するModにとってはすべてが自由行為である。
