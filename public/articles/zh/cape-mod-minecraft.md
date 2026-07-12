---
title: "Cape Mod：如何通过 RSA 签名注入窃取 Jeb_ 的披风"
description: "一个 Fabric Mod，利用 Minecraft 信任系统中的逻辑漏洞：将 Mojang 的有效 RSA 签名重放到错误的账户上。代码解析、安全影响及加密学教训。"
date: 2026-07-11authors:
  - fox3000foxy
tags:
  - minecraft
  - fabric
  - java
  - security
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "63/3tw1EzHfh/OACsVOFbu7CRcCK/Y6Ehb5nfUZZHy5LN0rmlcpGsNIxJCVxKitcajHRyqb3Alirky8XyWwtQQ=="
---

# Cape Mod：如何通过 RSA 签名注入窃取 Jeb_ 的披风

![alt text](assets/xbox-profile.png)
如果我告诉你，只需要一个有效的 RSA 签名——但属于**错误的账户**——就能让你的朋友相信你穿着 Mojang 的官方披风？欢迎来到 `cape-mod`，一个 Fabric 漏洞利用模组，展示 Minecraft 如何信任签名而不验证该签名所属的配置文件是否确实是你的。

## 背景：Minecraft 如何处理皮肤和披风

在 Java Edition 中，有一个我们通常不会问的问题：**谁负责显示玩家的皮肤和披风——客户端还是服务器？**

答案是微妙的：

| 组件 | 谁发送？ | 谁下载？ |
|---|---|---|
| **皮肤纹理** | 服务器发送签名 URL | 客户端从 `textures.minecraft.net` 下载 |
| **披风纹理** | 服务器发送签名 URL | 客户端从 `textures.minecraft.net` 下载 |
| **`textures` 属性** | 服务器从 Mojang 认证服务发送 `GameProfile` | 客户端验证 RSA 签名 |

关键点：一切都在 `GameProfile` 的一个名为 `textures` 的属性中。该属性包含：
- 一个 base64 编码的 JSON payload，包含纹理 URL
- 一个使用 Mojang 私钥生成的 **RSA 签名**

## RSA 签名之墙

每个 `textures` 属性解码后看起来像这样：

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

客户端根据 **JAR 中内置的公钥**（`yggdrasil_session_pubkey.der`）验证 RSA 签名：

```java
// Property.java (authlib)
public boolean isSignatureValid(PublicKey publicKey) {
    Signature sig = Signature.getInstance("SHA1withRSA");
    sig.initVerify(publicKey);
    sig.update(this.value.getBytes());
    return sig.verify(Base64.decodeBase64(this.signature));
}
```

对于远程玩家（非本地），客户端只接受**标记为 `secure`** 的皮肤——即有有效签名的皮肤：

```java
// SkinManager.createLookup() -- 简化
PlayerSkin skin = optional
    .filter(ps -> !isRemote || ps.secure())  // ← 远程玩家必须安全
    .orElse(defaultSkin);
```

这个检查在理论上防止了欺骗。但接下来的事情就变得有趣了。

## 漏洞：签名重放

客户端验证 RSA 签名**是否有效**。但客户端**从不**检查 JSON 中的 `profileId` 是否与玩家的实际 UUID 匹配。

换句话说：从一个**现有的 Mojang 账户**（例如 Mojang 员工的账户）获取的 `textures` 属性可以重放到任意其他玩家身上。签名仍然有效——它确实是 Mojang 签署的——只是它来自另一个账户。

### 如何提取真实签名？

Jeb_（UUID `853c80ef-3c37-49fd-aa49-938b674adae6`）拥有 Mojang Studios 披风。从 Mojang 会话服务器获取：

```bash
curl -s "https://sessionserver.mojang.com/session/minecraft/profile/853c80ef-3c37-49fd-aa49-938b674adae6?unsigned=false"
```

响应：

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

这个 `value` 字段的 `signature` 是由 Mojang 生成的。它是 RSA-2048 SHA-1 签名。即使你将其重放到另一个 UUID 上，它也**绝对**有效——因为 Jeb_ 的签名始终是 Jeb_ 的签名，而客户端从不验证它**本应是**你的签名。

## 代码：模组如何工作

`cape-mod` 模组很小——只有 65 行 Java 代码。核心如下：

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

        // 将 textures 属性替换为 Jeb_ 的
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

**步骤**：
1. **Mixin** `Player.getGameProfile()`——返回玩家配置文件的方法
2. 检查是否为本地服务器（Integrated Server）
3. 检查是否为主机（LAN 世界）
4. **替换** `textures` 属性为 Jeb_ 的（硬编码）
5. 返回一个新的 `GameProfile`，其中包含注入的纹理

`GameProfile` 因此是**伪造的**：这是一个人工构建的配置文件，与实际玩家不符。`textures` 属性是从 Jeb_ **重放**的——RSA 签名是真实的，但应用到了错误的配置文件上。网络数据包本身是合法的：服务器正常发送 `ClientboundPlayerInfoUpdatePacket`，其中包含这个被修改过的配置文件。被伪造的是配置文件，而不是数据包。

当主机的朋友通过 LAN 加入时，他们会收到包含修改后配置文件的 `ClientboundPlayerInfoUpdatePacket`。客户端：
1. 解码 base64 payload
2. 验证 RSA 签名 → ✅ 有效（确实是 Jeb_ 的）
3. 将皮肤标记为 `secure=true`（因为签名有效）
4. 通过 `!isRemote || ps.secure()` 过滤器 → ✅ 通过
5. **下载并显示 Jeb_ 的披风**

## 游戏中的效果：你的皮肤上的披风

以下是在游戏中的效果。首先，正面视图，主机显示 Jeb_ 的披风：

![Cape Mod -- Jeb_ 的披风显示在主机上](/images/cape-mod/cape-01-jeb-cape.png)

可以清晰地看到官方 Mojang Studios 披风的红白图案。与真正的 Jeb_ 拥有自己的披风没有任何区别——客户端从 `textures.minecraft.net` 下载完全相同的纹理。

沉浸式视角，在真实游戏中：

![Cape Mod -- 游戏中披风可见](/images/cape-mod/cape-02-lava-cape.png)

披风在玩家身后飘动，随动作摆动。与带有官方披风的真实皮肤完全无法区分。

另一个角度，在有岩浆和地形的世界中：

![Cape Mod -- 自然环境中的披风](/images/cape-mod/cape-03-local-game.png)

最后一张游戏玩法的近距离视图，展示披风在动作中的效果：

![Cape Mod -- 经典 Minecraft 游戏中的披风](/images/cape-mod/cape-04-real-gameplay.png)

对于一个不知道主机安装了模组的人来说，完全无法区分这与真正的 Mojang 披风。这正是关键所在：**签名是有效的**，客户端没有理由怀疑。

## 为什么这是一个漏洞（以及为什么又不是）

具有讽刺意味的是：这个漏洞之所以有效，**恰恰是因为签名是有效的**。这里没有加密绕过——更糟糕的是，这是一个信任模型中的**逻辑漏洞**。

| 检查项 | 结果 |
|---|---|
| **RSA 签名有效性** | ✅ 有效（由 Mojang 为 Jeb_ 签署） |
| **payload 中的 `profileId` 是否匹配主机 UUID？** | ❌ 不匹配（Jeb_ 的 UUID ≠ 主机的 UUID） |
| **客户端是否检查匹配？** | ❌ **不检查。只验证 RSA 签名。** |

Minecraft 信任**签名**，而不是携带签名者的身份。只要签名来自 Mojang，客户端就接受。这就像出示一份由政府签署的假护照——印章是合法的，即使护照不属于你。

## 安全影响

### 范围限于 LAN

该模组仅能在集成服务器（LAN）上工作。攻击者必须：
- 安装 Fabric 模组
- 成为 LAN 世界的主机
- 朋友使用原版客户端加入（无需模组）

### 但可能性不止于此

理论上，使用同样的技术，还可以：
- **重放其他已签名数据**：头颅、非法附魔、恶意聊天组件
- **结合 LAN 隧道**（NGROK、playit.gg、Radmin VPN）来影响互联网上的玩家
- **扩展到配置文件的其他依赖签名的属性**

### 为什么 Mojang 可能不会修复

严格来说，这不算"漏洞"——签名是有效的。要修复这个问题，Mojang 需要修改完整的认证模型，这非常复杂。目前，这只是一个边缘情况：LAN 玩家本应彼此信任。

## 哲学陷阱

Cape Mod 是一个绝佳的**概念验证**，揭示了一个更广泛的真理：**永远不要在不验证签名者和签名对象的情况下信任签名**。

这是基础密码学的一课。RSA 签署的是**消息**，而不是**身份**。如果我给你一个 Mojang 的有效 RSA 签名，你知道 Mojang 签署了*某个东西*。但你不知道是为谁签署的，也不能仅仅通过查看消息来假设。

这与 2000 年代 SSL/TLS 证书的情况完全一样——当时 CA 接受任何请求——签名有效，但它应用到了错误的域名上。

## 结论

Cape Mod 不是传统意义上的黑客攻击——它是对 Minecraft 中缺乏逻辑验证的优雅利用。它表明：

1. **有效的签名并不保证携带者的身份**
2. **在 LAN 环境中，信任比想象中更脆弱**
3. **Minecraft 的 `textures` 属性本质上是注入的内容**——需要验证它们是否与携带它们的玩家匹配

如果你加入一个"陌生"LAN 世界（或者说，主机安装了可疑模组的世界），你在披风问题之前就已经有了安全问题。但这具有警示意义：Minecraft 假设 LAN 上的所有人都互相信任。这通常是成立的……直到不再成立。

---

**资源**

- **GitHub**: [fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **Minecraft 认证**: [Yggdrasil 协议](https://wiki.vg/Authentication) (wiki.vg)
- **RSA 加密**: [RFC 3447](https://tools.ietf.org/html/rfc3447) (PKCS #1)

**3 个关键点**

1. RSA 签名验证的是消息，而不是身份——这个细节曾让许多系统付出代价。
2. Minecraft 不验证玩家配置文件是否与收到的签名匹配——这是一个逻辑漏洞，而非加密漏洞。
3. 在 LAN 或隧道中，对于控制集成服务器的模组来说，一切皆可为之。
