---
title: "ケープMod：Jeb_のケープをRSA署名インジェクションで盗む方法"
description: "Mojangの信頼システムの論理欠陥を突くFabric mod。有効なRSA署名なのに間違ったアカウントにリプレイされる。コード解説、セキュリティへの示唆、暗号の教訓。"
date: 2026-07-11
tags:
  - minecraft
  - fabric
  - java
  - security
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "aWbGxoBChKbar5BrTbZjmOpmDPfPHnnt13gv9fK8nicCVVit3ULzU/wMMDyc73X4M+mvwt9+gCihNhKt/mbZgw=="
---

# ケープMod：Jeb_のケープをRSA署名インジェクションで盗む方法

![alt text](assets/xbox-profile.png)

有効なRSA署名1つで、でも**間違ったアカウント**のもので、友達にMojang公式ケープを着てると思わせられると言ったらどうする。`cape-mod`へようこそ。署名は信頼するのに、そのプロフィールが本当に自分のものか検証し忘れるMinecraftの仕組みを突くエクスプロイトだ。

## 背景：Minecraftがスキンとケープをどう扱うか

Java版にはめったに問われない疑問がある。プレイヤーのスキンとケープを表示する責任は**クライアントとサーバーのどっち**にあるのか。

答えは微妙だ。

| 部品 | 誰が送る？ | 誰が落とす？ |
|---|---|---|
| **スキンテクスチャ** | サーバーが署名付きURLを送る | クライアントが`textures.minecraft.net`から落とす |
| **ケープテクスチャ** | サーバーが署名付きURLを送る | クライアントが`textures.minecraft.net`から落とす |
| **`textures`プロパティ** | サーバーがMojang認証の`GameProfile`を送る | クライアントがRSA署名を検証する |

ポイントは全部`GameProfile`の`textures`ってプロパティに入ってることだ。このプロパティはこうだ。
- テクスチャURL入りJSONペイロードのbase64
- Mojang秘密鍵による**RSA署名**

## RSA署名の壁

各`textures`プロパティをデコードするとこう見える。

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

クライアントはRSA署名をjar内蔵の**公開鍵**（`yggdrasil_session_pubkey.der`）で検証する。

```java
// Property.java (authlib)
public boolean isSignatureValid(PublicKey publicKey) {
    Signature sig = Signature.getInstance("SHA1withRSA");
    sig.initVerify(publicKey);
    sig.update(this.value.getBytes());
    return sig.verify(Base64.decodeBase64(this.signature));
}
```

リモートプレイヤー（ローカルゲーム外）には**`secure`印**のスキンだけ受け入れる。つまり有効な署名付きだ。

```java
// SkinManager.createLookup()（簡略化）
PlayerSkin skin = optional
    .filter(ps -> !isRemote || ps.secure())  // リモートプレイヤーは安全であること
    .orElse(defaultSkin);
```

理論上このチェックがなりすましを止める。でも検証はそこで終わりだ。攻撃が始まるのはまさにそこからだ。

## 欠陥：署名リプレイ

クライアントはRSA署名が**有効**か検証する。JSON内の`profileId`がプレイヤーの本当UUIDと一致するかを体系的に見落とす。

つまり、**既存Mojangアカウント**（Mojang社員とか）から取った`textures`プロパティを他の任意プレイヤーにリプレイできる。署名は有効なままだ。本当にMojangが作ったものだから。ただ別のアカウントのものってだけだ。

### 本物の署名をどう抜き出すか

Jeb_（UUID `853c80ef-3c37-49fd-aa49-938b674adae6`）はMojang Studiosケープを持ってる。Mojangセッションサーバーからこう取る。

```bash
curl -s "https://sessionserver.mojang.com/session/minecraft/profile/853c80ef-3c37-49fd-aa49-938b674adae6?unsigned=false"
```

返事：

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

この`value`フィールドの`signature`はMojang製だ。RSA-2048のSHA-1だ。他UUIDにリプレイしても**絶対に**有効だ。Jeb_の署名はJeb_の署名のままで、クライアントは誰宛か管理し忘れるからね。

## コード：modの仕組み

`cape-mod`はちっぽけだ。Java 65行だ。心臓部はこうだ。

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
1. `Player.getGameProfile()`への**Mixin**。プレイヤープロフィールが返される地点だ
2. ローカルサーバー（統合サーバー）か確認する
3. ホストか（LANワールド）確認する
4. `textures`プロパティをJeb_のものに**置き換える**（ハードコード）
5. 注入済みテクスチャの新しい`GameProfile`を返す

`GameProfile`は**偽造**される。つまり本物のプレイヤーに対応しない人工プロフィールだ。`textures`プロパティはJeb_から**リプレイ**される。RSA署名は本物だけど間違ったプロフィールに適用されてる。ネットワークパケット自体は正規だ。サーバーは普通にこの変更済みプロフィール付き`ClientboundPlayerInfoUpdatePacket`を送る。偽造されてるのはプロフィールで、パケットは正規のままってことだ。

ホストの友達がLAN経由で参加すると、変更済みプロフィール付き`ClientboundPlayerInfoUpdatePacket`を受け取る。クライアントはこうする。
1. base64ペイロードをデコードする
2. RSA署名を検証する → 有効（本当にJeb_のものだ）
3. スキンを`secure=true`に印付けする（署名が有効だから）
4. フィルタ`!isRemote || ps.secure()`を通る → 通る
5. Jeb_のケープを**ダウンロードして表示する**

## ゲーム内の結果：スキンにケープが付く

ゲーム内でこう見える。まずホストに表示されたJeb_ケープの正面図だ。

![Cape Mod -- ホストに表示されたJeb_ケープ](/images/cape-mod/cape-01-jeb-cape.png)

Mojang Studios公式ケープの赤白模様がはっきり見える。レンダリングは本物のJeb_が自分のケープを着てるのと同一だ。クライアントは`textures.minecraft.net`からまったく同じテクスチャを落としてるからね。

没入視点では、本物の対局でこうだ。

![Cape Mod -- ケープが見えるゲーム内ビュー](/images/cape-mod/cape-02-lava-cape.png)

ケープはプレイヤーの後ろではためいて、動きに合わせて揺れる。公式ケープ付き正規スキンと完全に区別不能だ。

別の角度、溶岩と地形のあるワールドでこうだ。

![Cape Mod -- 自然環境のケープ](/images/cape-mod/cape-03-local-game.png)

最後に古典的Minecraftゲームプレイ中のクローズアップ。ケープが動いてるのが見える。

![Cape Mod -- 古典的ゲームプレイ中のケープ](/images/cape-mod/cape-04-real-gameplay.png)

ホストがmodを使ってると知らずにLAN参加した人には、ケープは本物のMojangケープと見た目が同じだ。まさにポイントはそこだ。**署名は有効**で、クライアントは正規として扱う。

## なぜ欠陥で、なぜ欠陥じゃないのか

皮肉なのは、エクスプロイトが**まさに署名が有効だから**動くことだ。暗号突破とは別の話だ。もっと悪い。信頼モデルの**論理欠陥**だ。

| チェック | 結果 |
|---|---|
| **RSA署名の有効性** | 有効（Jeb_向けにMojang署名） |
| **ペイロード内`profileId`はホストUUIDと一致するか** | 不一致（Jeb_のUUIDはホストのUUIDじゃない） |
| **クライアントは一致を検証するか** | いいえ。**RSA署名だけ検証される。** |

Minecraftは身分を着る人じゃなく**署名**を信頼してる。Mojang由来の署名ならクライアントは受け入れる。政府発行の印鑑付き偽パスポートを見せるようなものだ。印鑑は正規だけど、パスポートは持ち主のものじゃない。

## セキュリティへの示唆

### 範囲はLANに限定

modは統合サーバー（LAN）でのみ動く。攻撃者はこうでなきゃいけない。
- Fabric modを入れてる
- LANワールドのホストだ
- 友達はmodなしバニラで参加する

### でも可能性は広がる

理論上同じ手口でこうもできる。
- 他の署名付きデータを**再注入**する。head、不正エンチャント、悪性チャット部品
- LANトンネル（NGROK、playit.gg、Radmin VPN）と**組み合わせ**てネット上のプレイヤーに影響させる
- 署名に依存するプロフィールの他プロパティに**拡張**する

### Mojangがたぶん直さない理由

厳密な意味の「脆弱性」とは別の話だ。署名は有効だからね。直すにはMojangが認証モデル全体を変えなきゃいけなくて複雑だ。今のところ際どいケースだ。LANプレイヤーは互いを信頼する前提だからね。

## 哲学的な罠

Cape Modは優れた**概念実証**だ。もっと広い真実を示す。**署名したデータと誰宛かを常に検証してから信頼しなきゃいけない**ってことだ。

基礎暗号の教訓だ。RSAは**メッセージ**に署名する。**受取人**の身分は署名の外にある。Mojangの有効RSA署名を渡されても分かるのは、Mojangが*何か*に署名したことだけで、メッセージだけから受取人を確実には示さない。

2000年代にCAがドメインをちゃんと検証せず証明書に署名したSSLやTLS証明書で起きたのとまったく同じだ。署名は有効だったけど、間違ったドメインに適用されてた。

## 結論

Cape Modは古典的な意味のハックとは別のものだ。Minecraftの論理検証欠落を突く優雅なエクスプロイトだ。示すのはこうだ。

1. **有効な署名は着る人の身分を保証しない**
2. **LANでは信頼は**思うより弱い
3. Minecraftの`textures`プロパティは実質**注入コンテンツ**だ。着るプレイヤーに対応するか検証しなきゃいけない

「知らない」LANワールド（というかホストが怪しいmod入り）に参加するなら、ケープ以前にもっと深刻なセキュリティ問題がある。でも示唆的だ。MinecraftはLAN全員が互いを信頼する前提だ。それは正しい。信頼を悪用する最初のホストまではね。

---

**リソース**

- **GitHub**：[fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **Minecraft認証**：[Yggdrasilプロトコル](https://wiki.vg/Authentication)（wiki.vg）
- **RSA暗号**：[RFC 3447](https://tools.ietf.org/html/rfc3447)（PKCS #1）

**要点3つ**

1. RSA署名は身分じゃなくメッセージを検証する。多くのシステムに痛い目を見させた詳細だ。
2. Minecraftはプレイヤープロフィールが受け取る署名に対応するか検証し忘れる。暗号は無傷なのに検証の論理欠陥だ。
3. LANやトンネルでは、統合サーバーを握るmodに全部お任せだ。
