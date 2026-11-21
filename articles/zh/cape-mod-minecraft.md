---
title: Cape Mod：用 RSA 签名注入偷走 Jeb_ 的披风
description: 一个利用 Minecraft 信任模型逻辑漏洞的 Fabric mod：Mojang 的有效 RSA 签名，被重放到错误的账号上。代码解析、安全影响和密码学教训。
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
author_sig: "Kj/jJUESGxXK+sf9bSdsczncxKIt3ooms4Judi+inFHvm5Hyp6XTQkRl2THyT2CaAUet5Cq5WBsRuSmyovZJaA=="
---

# Cape Mod：用 RSA 签名注入偷走 Jeb_ 的披风

![alt text](assets/xbox-profile.png)

如果我说，只需要一个 RSA 签名，有效，但属于**错误的账号**，就能让你的朋友相信你穿着 Mojang 官方披风呢？欢迎来到 `cape-mod`，一个展示 Minecraft 如何信任签名、却忘了验证签名所属 profile 是不是你本人的 exploit。

## 背景：Minecraft 怎么处理皮肤和披风

Java 版里有个很少被问的问题：**到底谁负责显示玩家的皮肤和披风，是客户端还是服务器？**

答案有点绕：

| 组件 | 谁发的？ | 谁下载的？ |
|---|---|---|
| **皮肤材质** | 服务器发签名 URL | 客户端从 `textures.minecraft.net` 下载 |
| **披风材质** | 服务器发签名 URL | 客户端从 `textures.minecraft.net` 下载 |
| **`textures` 属性** | 服务器从 Mojang 认证发 `GameProfile` | 客户端验 RSA 签名 |

关键全在 `GameProfile` 的 `textures` 属性里。包含：
- base64 JSON payload，带材质 URL
- Mojang 私钥做的 **RSA 签名**

## RSA 签名这堵墙

每个 `textures` 属性解码出来长这样：

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

客户端拿 jar 里嵌的**公钥**（`yggdrasil_session_pubkey.der`）验 RSA 签名：

```java
// Property.java (authlib)
public boolean isSignatureValid(PublicKey publicKey) {
    Signature sig = Signature.getInstance("SHA1withRSA");
    sig.initVerify(publicKey);
    sig.update(this.value.getBytes());
    return sig.verify(Base64.decodeBase64(this.signature));
}
```

对远程玩家（非本地游戏），客户端只接受标为 **secure** 的皮肤，也就是签名有效的：

```java
// SkinManager.createLookup() -- 简化
PlayerSkin skin = optional
    .filter(ps -> !isRemote || ps.secure())  // ← 远程玩家必须 secure
    .orElse(defaultSkin);
```

这道检查理论上堵死了伪造。但验证到这里就停了，攻击恰恰从这里开始。

## 漏洞：签名重放

客户端验证 RSA 签名**有效**。但它从来不验证 JSON 里的 `profileId` 是不是这个玩家的真实 UUID。

换句话说：从一个**真实存在的 Mojang 账号**（比如 Mojang 员工号）扒下来的 `textures` 属性，可以重放到任何别的玩家身上。签名依然有效，它确实是 Mojang 签的，只是签的不是这个号。

### 怎么搞到真签名？

Jeb_（UUID `853c80ef-3c37-49fd-aa49-938b674adae6`）有 Mojang Studios 披风。从 Mojang session 服务器拿：

```bash
curl -s "https://sessionserver.mojang.com/session/minecraft/profile/853c80ef-3c37-49fd-aa49-938b674adae6?unsigned=false"
```

返回：

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

这个 `value` 的 `signature` 是 Mojang 亲手签的。RSA-2048 SHA-1。**绝对**有效，哪怕你把它重放到别的 UUID 上，因为 Jeb_ 的签名永远是 Jeb_ 的签名，而客户端压根不查它本来发给谁。

## 代码：mod 怎么工作的

`cape-mod` 很小，65 行 Java。核心在这里：

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

        // 把 textures 属性换成 Jeb_ 的
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
1. **Mixin** 到 `Player.getGameProfile()`，玩家 profile 返回的地方
2. 确认是本地服务器（Integrated Server）
3. 确认是房主（LAN 世界）
4. 把 `textures` 属性**换成**硬编码的 Jeb_ 那份
5. 返回新的 `GameProfile`

所以 `GameProfile` 是**伪造**的：人工拼出来的 profile，对应不上真玩家。`textures` 属性是从 Jeb_ 那**重放**来的，RSA 签名真 authentic，但贴错了 profile。网络包本身合法：服务器正常发 `ClientboundPlayerInfoUpdatePacket`，带的 profile 被改过。是 profile 伪造，包合法。

朋友通过 LAN 进来，收到带改后 profile 的 `ClientboundPlayerInfoUpdatePacket`，客户端：
1. 解 base64 payload
2. 验 RSA 签名 → ✅ 有效（本来就是 Jeb_ 的）
3. 标成 `secure=true`（签名有效嘛）
4. 过 `!isRemote || ps.secure()` 过滤 → ✅ 通过
5. **下载显示 Jeb_ 的披风**

## 游戏内效果：披风穿你身上

先看效果。正面，房主身上挂着 Jeb_ 的披风：

![Cape Mod -- 房主身上的 Jeb_ 披风](/images/cape-mod/cape-01-jeb-cape.png)

红白 Mojang Studios 官方披风纹样清清楚楚。渲染和真 Jeb_ 穿自己披风一模一样，客户端从 `textures.minecraft.net` 下的是同一个材质。

沉浸视角，真实对局里：

![Cape Mod -- 对局中的披风](/images/cape-mod/cape-02-lava-cape.png)

披风在身后飘，随移动摆动。和正版官方披风的皮肤完全 indistinguishable。

换个角度，岩浆地形：

![Cape Mod -- 自然环境中的披风](/images/cape-mod/cape-03-local-game.png)

再来张正常 gameplay 近景，披风实战：

![Cape Mod -- 经典 Minecraft 玩法中的披风](/images/cape-mod/cape-04-real-gameplay.png)

对不知情进 LAN 的人来说，这披风视觉上和真 Mojang 披风没区别。关键就在：**签名有效**，客户端就当真的处理。

## 为什么说这是漏洞（又为什么不算）

讽刺的是：exploit 能成立，**恰恰因为签名有效**。这不是密码学 bypass，比那更糟：是信任模型的**逻辑漏洞**。

| 检查项 | 结果 |
|---|---|
| **RSA 签名有效性** | ✅ 有效（Mojang 给 Jeb_ 签的） |
| **payload 里 profileId 和房主 UUID 对得上吗？** | ❌ 对不上（Jeb_ 的 UUID ≠ 房主 UUID） |
| **客户端验对应关系吗？** | ❌ **不验。只验 RSA 签名。** |

Minecraft 信任的是**签名**，不是签名**属于谁**。只要签名出自 Mojang，客户端就收。这就像拿着政府盖真章的假护照，章是真的，护照不是你的。

## 安全影响

### 范围限于 LAN

mod 只在内置服务器（LAN）上工作。攻击者要：
- 装 Fabric mod
- 当 LAN 世界房主
- 朋友用 vanilla 客户端进来

### 但思路能放大

理论上同一手法可以：
- **重放别的签名数据**：heads、非法附魔、恶意聊天组件
- **配 LAN 穿透**（NGROK、playit.gg、Radmin VPN）打到公网玩家
- **扩展到 profile 的别的签名属性**

### Mojang 大概率不会修

这严格说不算"漏洞"，签名有效。要修得动整个认证模型，成本巨大。目前算边界情况：LAN 玩家默认互相信任。

## 哲学陷阱

Cape Mod 是个极好的 **proof of concept**，讲了一个更大的道理：**信任签名数据之前，永远要验谁签的、签给谁**。

这是密码学基本课。RSA 签的是**消息**；**收件人身份**不在签名里。我给你一个 Mojang 的有效 RSA 签名，你只知道 Mojang 签过*什么东西*，光看消息看不出签给谁。

2000 年代 SSL/TLS 证书干过一模一样的事，CA 不好好验证域名就签发，签名有效，发错了域名。

## 结语

Cape Mod 不是传统意义的 hack，是对 Minecraft 缺了一块逻辑校验的优雅利用。说明了：

1. **有效签名不保证持有人身份**，这个坑坑过无数系统
2. **LAN 里信任比你以为的弱**
3. **Minecraft 的 `textures` 属性本质上是注入内容**，得验它和穿的人对不对得上

如果你进了陌生人的 LAN 世界（或者说，房主装了可疑 mod），披风之前你早就有更大的安全问题。但它很说明问题：Minecraft 默认 LAN 里人人互信。没错……直到第一个滥用信任的房主出现。

---

**资源**

- **GitHub**：[fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **Minecraft 认证**：[Yggdrasil 协议](https://wiki.vg/Authentication)（wiki.vg）
- **RSA 密码学**：[RFC 3447](https://tools.ietf.org/html/rfc3447)（PKCS #1）

**三句话总结**

1. RSA 签名保证的是消息，不是身份，这个细节坑过无数系统。
2. Minecraft 不验玩家 profile 和收到的签名对不对得上，密码学没坏，校验逻辑缺了一块。
3. LAN 或穿透下，控制内置服务器的 mod 为所欲为。
