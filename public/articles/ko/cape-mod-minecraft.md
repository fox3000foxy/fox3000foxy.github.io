---
title: "Cape Mod: RSA 서명 주입으로 Jeb_의 망토를 훔치는 방법"
description: "Fabric 모드로, Mojang의 유효한 RSA 서명을 다른 계정에 재사용하는 Minecraft 신뢰 시스템의 논리적 허점을 파헤친다. 코드 설명, 보안 영향, 암호학적 교훈."
date: 2026-07-11
authors:
  - fox3000foxy
tags:
  - minecraft
  - fabric
  - java
  - security
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "4jHRALt/pHGG6Aw72e4xN1CUQlK96Dl+aE1xJ2s4m06+uOo5JV+Jibk1xRuS8YTYJIN5d9/4jiKImw7CquYBFQ=="
---

# Cape Mod: RSA 서명 주입으로 Jeb_의 망토를 훔치는 방법

![alt text](assets/xbox-profile.png)
유효한 RSA 서명 하나면 -- 비록 **잘못된 계정**의 것이라도 -- 친구들에게 내가 공식 Mojang 망토를 착용하고 있는 것처럼 속일 수 있다면? `cape-mod`에 오신 것을 환영합니다. 이 Fabric 익스플로잇은 Minecraft가 서명 자체는 신뢰하면서 정작 그 서명이 속한 프로필이 실제로 자신의 것인지는 확인하지 않는 방식을 보여줍니다.

## 배경: Minecraft가 스킨과 망토를 처리하는 방식

Java Edition에서 우리가 자주 묻지 않는 질문이 하나 있습니다: **플레이어의 스킨과 망토를 렌더링할 책임은 누구에게 있는가 -- 클라이언트인가 서버인가?**

정답은 미묘합니다:

| 구성요소 | 누가 보내는가? | 누가 다운로드하는가? |
|---|---|---|
| **스킨 텍스처** | 서버가 서명된 URL을 전송 | 클라이언트가 `textures.minecraft.net`에서 다운로드 |
| **망토 텍스처** | 서버가 서명된 URL을 전송 | 클라이언트가 `textures.minecraft.net`에서 다운로드 |
| **`textures` 속성** | 서버가 Mojang 인증의 `GameProfile`을 전송 | 클라이언트가 RSA 서명을 검증 |

핵심은 모든 것이 `GameProfile`의 `textures`라는 속성 안에 담겨 있다는 점입니다. 이 속성은 다음을 포함합니다:
- 텍스처 URL이 담긴 base64 JSON 페이로드
- **Mojang의 개인키로 생성된 RSA 서명**

## RSA 서명의 벽

디코딩하면 각 `textures` 속성은 다음과 같은 형태입니다:

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

클라이언트는 **jar에 내장된 공개키**(`yggdrasil_session_pubkey.der`)로 RSA 서명을 검증합니다:

```java
// Property.java (authlib)
public boolean isSignatureValid(PublicKey publicKey) {
    Signature sig = Signature.getInstance("SHA1withRSA");
    sig.initVerify(publicKey);
    sig.update(this.value.getBytes());
    return sig.verify(Base64.decodeBase64(this.signature));
}
```

원격 플레이어(로컬이 아닌 경우)의 경우 클라이언트는 **`secure`로 표시된** 스킨만 허용합니다. 즉, 유효한 서명이 있어야 합니다:

```java
// SkinManager.createLookup() -- 간략화
PlayerSkin skin = optional
    .filter(ps -> !isRemote || ps.secure())  // ← 원격 플레이어는 보안 스킨이어야 함
    .orElse(defaultSkin);
```

이 검증은 이론상 스푸핑을 막아줍니다. 하지만 여기서부터 흥미진진해집니다.

## 취약점: 서명 재사용 (Signature Replay)

클라이언트는 RSA 서명이 **유효한지**만 확인합니다. 하지만 JSON 안에 있는 `profileId`가 실제 플레이어의 UUID와 일치하는지는 **절대** 확인하지 않습니다.

다시 말해, **기존 Mojang 계정**(예: Mojang 직원의 계정)에서 가져온 `textures` 속성을 아무 다른 플레이어에 재사용해도 됩니다. 서명은 여전히 유효합니다 -- Mojang이 진짜로 서명했으니까요 -- 단지 다른 계정의 것일 뿐입니다.

### 진짜 서명을 추출하는 방법?

Jeb_(UUID `853c80ef-3c37-49fd-aa49-938b674adae6`)은 Mojang Studios 망토를 보유하고 있습니다. Mojang 세션 서버에서 가져옵니다:

```bash
curl -s "https://sessionserver.mojang.com/session/minecraft/profile/853c80ef-3c37-49fd-aa49-938b674adae6?unsigned=false"
```

응답:

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

이 `value` 필드의 `signature`는 Mojang이 생성한 것입니다. RSA-2048 SHA-1입니다. 다른 UUID에 재사용해도 **절대적으로** 유효합니다. Jeb_의 서명은 여전히 Jeb_의 서명이고, 클라이언트는 이 서명이 **원래** 당신 것인지 전혀 확인하지 않기 때문입니다.

## 코드: 모드의 작동 방식

`cape-mod` 모드는 아주 작습니다 -- Java 65줄. 핵심은 이렇습니다:

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

        // Jeb_의 textures 속성으로 교체
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

**단계**:
1. `Player.getGameProfile()`에 **Mixin** -- 플레이어 프로필이 반환되는 지점
2. 로컬 서버(Integrated Server)인지 확인
3. LAN 세계의 host인지 확인
4. `textures` 속성을 **Jeb_의 것으로 교체**(하드코딩됨)
5. 주입된 텍스처가 포함된 새 `GameProfile` 반환

이렇게 `GameProfile`은 **위조**됩니다: 실제 플레이어와 일치하지 않는 인공적으로 구성된 프로필입니다. `textures` 속성은 Jeb_에서 **재사용**된 것입니다 -- RSA 서명은 진짜지만 잘못된 프로필에 적용되어 있습니다. 네트워크 패킷 자체는 정상입니다: 서버는 수정된 이 프로필로 `ClientboundPlayerInfoUpdatePacket`을 정상적으로 전송합니다. 위조된 것은 패킷이 아니라 프로필입니다.

host의 친구들이 LAN으로 접속하면 수정된 프로필이 담긴 `ClientboundPlayerInfoUpdatePacket`을 받습니다. 클라이언트는:
1. base64 페이로드를 디코딩
2. RSA 서명 검증 → ✅ 유효 (진짜 Jeb_의 서명)
3. `secure=true`로 스킨 표시 (서명이 유효하므로)
4. `!isRemote || ps.secure()` 필터 통과 → ✅ 통과
5. **Jeb_의 망토를 다운로드하여 표시**

## 게임 내 결과: 내 스킨 위에 망토가

다음은 게임 내 모습입니다. 먼저, host에게 Jeb_의 망토가 표시된 정면 모습:

![Cape Mod -- host에게 표시된 Jeb_ 망토](/images/cape-mod/cape-01-jeb-cape.png)

공식 Mojang Studios 망토의 빨간색/흰색 패턴이 선명하게 보입니다. 진짜 Jeb_가 자신의 망토를 보여주는 것과 전혀 다를 바 없습니다 -- 클라이언트는 `textures.minecraft.net`에서 정확히 동일한 텍스처를 다운로드하기 때문입니다.

실제 게임 플레이에서의 몰입형 모습:

![Cape Mod -- 게임 내 망토가 보이는 모습](/images/cape-mod/cape-02-lava-cape.png)

망토가 플레이어 뒤에서 펄럭이며 움직임에 따라 출렁입니다. 공식 망토가 있는 진짜 스킨과 완전히 구분할 수 없습니다.

용암과 지형이 있는 세계에서 다른 각도:

![Cape Mod -- 자연 환경 속의 망토](/images/cape-mod/cape-03-local-game.png)

그리고 실제 게임플레이의 마지막 근접 샷, 망토가 살아 움직이는 모습:

![Cape Mod -- 일반 Minecraft 게임플레이 속 망토](/images/cape-mod/cape-04-real-gameplay.png)

host에 모드가 있는지 모르고 LAN에 접속하는 사람에게는 이것이 진짜 Mojang 망토와 전혀 구별할 방법이 없습니다. 이것이 바로 핵심입니다: **서명이 유효하므로**, 클라이언트는 의심할 이유가 전혀 없습니다.

## 왜 이것이 취약점인가 (그리고 왜 아닐 수도 있는가)

아이러니하게도 이 익스플로잇은 **서명이 유효하기 때문에** 정확히 작동합니다. 여기에는 암호학적 우회가 없습니다 -- 더 심각하게, 이는 신뢰 모델의 **논리적 결함**입니다.

| 검증 항목 | 결과 |
|---|---|
| **RSA 서명의 유효성** | ✅ 유효 (Mojang이 Jeb_을 위해 서명함) |
| **페이로드의 `profileId`가 host의 UUID와 일치하는가?** | ❌ 아님 (Jeb_의 UUID ≠ host의 UUID) |
| **클라이언트가 일치 여부를 확인하는가?** | ❌ **아니요. 오직 RSA 서명만 검증됩니다.** |

Minecraft는 **서명 자체**를 신뢰하지, 그것을 가진 사람의 **신원**을 신뢰하지 않습니다. 서명이 Mojang에서 왔다면 클라이언트는 그것을 수용합니다. 마치 정부가 서명한 가짜 여권을 보여주는 것과 같습니다 -- 도장은 진짜지만, 여권은 당신 것이 아닙니다.

## 보안 영향

### LAN으로 제한된 범위

이 모드는 통합 서버(LAN)에서만 작동합니다. 공격자는 다음 조건을 충족해야 합니다:
- Fabric 모드 설치
- LAN 세계의 host
- 친구들은 모드 없이(바닐라로) 접속

### 그러나 확장 가능성

이론적으로, 같은 기술으로 다음도 가능합니다:
- **서명된 다른 데이터를 재주입**: 헤드, 불법 마법 부여, 악성 채팅 컴포넌트
- **LAN 터널과 결합**(NGROK, playit.gg, Radmin VPN)하여 인터넷 상의 플레이어에게 영향
- 서명에 의존하는 프로필의 **다른 속성으로 확장**

### Mojang이 아마 패치하지 않을 이유

엄밀한 의미의 "취약점"은 아닙니다 -- 서명은 유효하니까요. 이를 패치하려면 Mojang이 인증 모델 전체를 수정해야 하며, 이는 복잡한 작업입니다. 현재로서는 에지 케이스입니다: LAN 플레이어는 서로를 신뢰한다고 가정합니다.

## 철학적 함정

Cape Mod는 더 큰 진실에 대한 훌륭한 **개념 증명**입니다: **서명을 확인할 때 누가 서명했는지와 어떤 대상에 대해 서명했는지도 반드시 검증해야 합니다**.

이것은 기초 암호학의 교훈입니다. RSA는 **메시지**에 서명하는 것이지, **신원**에 서명하는 것이 아닙니다. 내가 당신에게 Mojang의 유효한 RSA 서명을 준다면, 당신은 Mojang이 *무언가*에 서명했다는 것을 압니다. 당신은 그것이 누구를 위한 것인지 알지 못하며, 메시지만 보고 추정할 수도 없습니다.

2000년대에 CA들이 아무거나 승인하던 SSL/TLS 인증서에서 정확히 같은 일이 일어났습니다 -- 서명은 유효했지만, 잘못된 도메인에 적용되어 있었습니다.

## 결론

Cape Mod는 고전적인 의미의 해킹이 아닙니다 -- 이는 Minecraft의 논리적 검증 부재를 우아하게 활용한 것입니다. 이것이 보여주는 것은:

1. **유효한 서명이 서명을 가진 사람의 신원을 보장하지 않는다**
2. **LAN에서는 우리가 생각하는 것보다 신뢰가 더 약하다**
3. **Minecraft의 `textures` 속성은 본질적으로 주입된 콘텐츠다** -- 이것이 그것을 가진 플레이어와 일치하는지 확인해야 한다

"알 수 없는"(또는 host가 수상한 모드를 가진) LAN 세계에 접속한다면, 망토 문제를 떠나 이미 보안 문제가 있는 것입니다. 하지만 이는 증상에 불과합니다: Minecraft는 LAN 상의 모든 사람이 서로를 신뢰한다고 가정합니다. 그것은 사실입니다... 더 이상 아니게 될 때까지는.

---

**자료**

- **GitHub**: [fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **Minecraft 인증**: [Yggdrasil 프로토콜](https://wiki.vg/Authentication) (wiki.vg)
- **RSA 암호학**: [RFC 3447](https://tools.ietf.org/html/rfc3447) (PKCS #1)

**3가지 핵심 포인트**

1. RSA 서명은 메시지를 검증할 뿐 신원을 검증하지 않는다 -- 수많은 시스템에 큰 대가를 치르게 한 세부사항.
2. Minecraft는 받은 서명이 플레이어의 프로필과 일치하는지 확인하지 않는다 -- 암호학적 결함이 아닌 논리적 결함.
3. LAN이나 터널 환경에서는 통합 서버를 제어하는 모드에게 모든 것이 열려 있다.
