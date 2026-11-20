---
title: "Cape Mod: RSA 서명 주입으로 Jeb_의 망토 훔치기"
description: "Minecraft의 신뢰 시스템에 있는 논리적 결함을 노리는 Fabric 모드. Mojang의 유효한 RSA 서명을 잘못된 계정에 재생했어요. 코드 설명과 보안 함의, 암호학적 교훈."
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
author_sig: "l1O5rQko1Lwvuzv5cyRrs7oXrnAmTKN3lcdfGqYB0If6LRRzHLlgMyeN0wHBi8yNnm2HiSlmtQC+CwLPQ2vj0Q=="
---

# Cape Mod: RSA 서명 주입으로 Jeb_의 망토 훔치기

![alt text](assets/xbox-profile.png)

유효한 RSA 서명 하나, 다만 **잘못된 계정** 앞으로 된 것으로 친구들에게 Mojang 공식 망토를 입은 것처럼 믿게 할 수 있다면 어떨까요? `cape-mod`에 오신 것을 환영해요. 서명은 믿으면서 그 서명이 속한 프로필이 정말 여러분 것인지 확인하는 것을 빠뜨리는 Minecraft를 보여주는 Fabric 익스플로잇이에요.

## 배경: Minecraft가 스킨과 망토를 다루는 방법

Java Edition에는 잘 묻지 않는 질문이 있어요. **플레이어의 스킨과 망토를 표시할 책임은 클라이언트와 서버 중 누구에게 있을까요?**

답은 미묘해요.

| 구성 요소 | 누가 보내나요? | 누가 다운로드하나요? |
|---|---|---|
| **스킨 텍스처** | 서버가 서명된 URL을 보내요 | 클라이언트가 `textures.minecraft.net`에서 다운로드해요 |
| **망토 텍스처** | 서버가 서명된 URL을 보내요 | 클라이언트가 `textures.minecraft.net`에서 다운로드해요 |
| **`textures` 속성** | 서버가 Mojang 인증의 `GameProfile`을 보내요 | 클라이언트가 RSA 서명을 검증해요 |

핵심은 모든 것이 `GameProfile`의 `textures`라는 속성에 담긴다는 거예요. 이 속성에 들어있는 것은요.

- 텍스처 URL이 담긴 base64 JSON 페이로드
- Mojang 개인 키로 만든 **RSA 서명**

## RSA 서명의 벽

각 `textures` 속성을 디코딩하면 이렇게 생겼어요.

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

클라이언트는 jar에 내장된 공개 키(`yggdrasil_session_pubkey.der`)로 RSA 서명을 검증해요.

```java
// Property.java (authlib)
public boolean isSignatureValid(PublicKey publicKey) {
    Signature sig = Signature.getInstance("SHA1withRSA");
    sig.initVerify(publicKey);
    sig.update(this.value.getBytes());
    return sig.verify(Base64.decodeBase64(this.signature));
}
```

원격 플레이어(로컬 게임 바깥)의 경우 클라이언트는 `secure`로 표시된 스킨, 즉 서명이 유효한 것만 받아들여요.

```java
// SkinManager.createLookup() -- 단순화
PlayerSkin skin = optional
    .filter(ps -> !isRemote || ps.secure())  // ← 원격 플레이어는 안전해야 해요
    .orElse(defaultSkin);
```

이 검사는 이론상 스푸핑을 막아요. 하지만 검증은 거기서 멈추고, 바로 그 지점에서 공격이 시작돼요.

## 결함: 서명 재생

클라이언트는 RSA 서명이 **유효한지** 검증해요. JSON 안에 든 `profileId`가 플레이어의 실제 UUID와 일치하는지는 체계적으로 확인하지 않아요.

다시 말하면, 기존 **Mojang 계정**(예를 들어 Mojang 직원 계정)에서 가져온 `textures` 속성을 다른 어떤 플레이어에게든 재생할 수 있어요. 서명은 여전히 유효해요. 실제로 Mojang이 만든 것이니까요. 그저 다른 계정에서 온 것뿐이에요.

### 진짜 서명을 어떻게 꺼낼까요?

Jeb_(UUID `853c80ef-3c37-49fd-aa49-938b674adae6`)은 Mojang Studios 망토를 가지고 있어요. Mojang 세션 서버에서요.

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

이 `value` 필드의 `signature`는 Mojang이 만든 거예요. RSA-2048 SHA-1이에요. 다른 UUID에 재생해도 **절대적으로** 유효해요. Jeb_의 서명은 여전히 Jeb_의 서명이고, 클라이언트는 그것이 누구를 위한 것이었는지 확인하지 않으니까요.

## 코드: 모드가 동작하는 방법

`cape-mod` 모드는 아주 작아요. Java 65줄이에요. 핵심은 이렇습니다.

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

        // textures 속성을 Jeb_의 것으로 바꿔요
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

1. `Player.getGameProfile()`에 **Mixin**. 플레이어 프로필이 반환되는 지점이에요
2. 로컬 서버(Integrated Server)인지 확인
3. 호스트(LAN 월드)인지 확인
4. `textures` 속성을 하드코딩된 Jeb_의 것으로 **교체**
5. 주입된 텍스처가 담긴 새 `GameProfile` 반환

그래서 `GameProfile`은 **위조**된 거예요. 진짜 플레이어와 일치하지 않는 인위적으로 만든 프로필이에요. `textures` 속성은 Jeb_에게서 **재생**된 거예요. RSA 서명은 진짜지만 잘못된 프로필에 적용됐어요. 네트워크 패킷 자체는 정당해요. 서버는 수정된 프로필이 담긴 `ClientboundPlayerInfoUpdatePacket`을 정상적으로 보내요. 위조된 것은 프로필이고, 패킷은 정당하게 남아 있어요.

호스트의 친구들이 LAN으로 들어오면 수정된 프로필이 담긴 `ClientboundPlayerInfoUpdatePacket`을 받아요. 클라이언트는요.

1. base64 페이로드를 디코딩
2. RSA 서명 검증 → ✅ 유효 (실제로 Jeb_의 것이에요)
3. 서명이 유효하니 스킨을 `secure=true`로 표시
4. `!isRemote || ps.secure()` 필터 통과 → ✅ 통과
5. **Jeb_의 망토를 다운로드하고 표시**

## 게임 속 결과: 스킨 위의 망토

게임에서 보이는 모습은 이렇습니다. 먼저 호스트에 표시된 Jeb_ 망토를 정면에서 본 모습이에요.

![Cape Mod -- 호스트에 표시된 Jeb_ 망토](/images/cape-mod/cape-01-jeb-cape.png)

공식 Mojang Studios 망토의 빨강과 흰색 무늬가 선명히 보여요. 렌더링은 자신의 망토를 입은 진짜 Jeb_와 똑같아요. 클라이언트는 `textures.minecraft.net`에서 정확히 같은 텍스처를 다운로드하거든요.

그리고 실제 플레이 장면의 몰입 시점이에요.

![Cape Mod -- 망토가 보이는 게임 속 화면](/images/cape-mod/cape-02-lava-cape.png)

망토가 플레이어 뒤에서 펄럭이고 움직임에 따라 흔들려요. 공식 망토가 있는 진짜 스킨과 완벽히 구분할 수 없어요.

다른 각도, 용암과 지형이 있는 월드에서요.

![Cape Mod -- 자연 환경 속 망토](/images/cape-mod/cape-03-local-game.png)

그리고 실제 고전 Minecraft 게임플레이를 가까이서 본 마지막 장면, 망토가 실제로 보이는 모습이에요.

![Cape Mod -- 고전 Minecraft 게임플레이 속 망토](/images/cape-mod/cape-04-real-gameplay.png)

호스트가 모드를 쓴다는 것을 모르고 LAN에 들어온 사람에게는, 망토가 진짜 Mojang 망토와 시각적으로 똑같아요. 바로 그 점이 핵심이에요. **서명이 유효해서** 클라이언트가 정품으로 처리해요.

## 왜 결함인지 (그리고 왜 결함이 아닌지)

아이러니하게도 이 익스플로잇은 **서명이 유효하기 바로 그 이유로** 동작해요. 암호 우회와는 다른 이야기예요. 더 나빠요. 신뢰 모델의 **논리적 결함**이에요.

| 검사 | 결과 |
|---|---|
| **RSA 서명 유효성** | ✅ 유효 (Jeb_를 위해 Mojang이 서명) |
| **페이로드의 `profileId`가 호스트 UUID와 일치하나요?** | ❌ 아니요 (Jeb_의 UUID ≠ 호스트의 UUID) |
| **클라이언트가 일치를 검증하나요?** | ❌ **아니요. RSA 서명만 검증해요.** |

Minecraft는 서명을 든 사람의 신원보다 **서명**을 믿어요. 서명이 Mojang에서 온 한 받아들여요. 정부가 서명한 위조 여권을 보여주는 것과 같아요. 도장은 진짜지만, 여권이 여러분 것은 아니에요.

## 보안 함의

### LAN으로 제한된 범위

모드는 통합 서버(LAN)에서만 동작해요. 공격자는 다음을 갖춰야 해요.

- 설치된 Fabric 모드
- LAN 월드의 호스트 자리
- 친구들은 모드 없이(vanilla) 접속

### 하지만 가능성은 넓어져요

이론적으로 같은 기법으로 다음을 할 수 있어요.

- **서명된 다른 데이터 재주입**: 머리, 불법 인챈트, 악의적 채팅 컴포넌트
- **LAN 터널**(NGROK, playit.gg, Radmin VPN)과 결합해서 인터넷의 플레이어에게 영향
- 서명에 의존하는 프로필의 **다른 속성**으로 확장

### Mojang이 아마 패치하지 않을 이유

엄밀한 의미의 "취약점"과는 다른 이야기예요. 서명은 유효해요. 패치하려면 Mojang이 인증 모델 전체를 바꿔야 해서 복잡해요. 지금은 경계 사례예요. LAN 플레이어는 서로 신뢰한다고 가정하니까요.

## 철학적 함정

Cape Mod는 더 넓은 진실에 대한 훌륭한 **개념 증명**이에요. **데이터를 신뢰하기 전에 누가 서명했고 누구를 위해 서명했는지 항상 확인해야 해요**.

기본 암호학 교훈이에요. RSA는 **메시지**에 서명해요. 수신자의 **신원**은 서명 밖에 있어요. Mojang의 유효한 RSA 서명을 드리면, 여러분이 아는 것은 Mojang이 *무언가에* 서명했다는 것뿐이고, 메시지 하나만으로는 수신자에 대한 믿을 만한 표시가 없어요.

2000년대에 CA가 도메인을 제대로 확인하지 않고 인증서에 서명했을 때 SSL과 TLS 인증서에 정확히 일어났던 일이에요. 서명은 유효했지만 잘못된 도메인에 적용됐어요.

## 결론

Cape Mod는 고전적 의미의 핵과는 다른 것이에요. Minecraft의 논리적 검증 부재를 우아하게 파고든 거예요. 보여주는 것은요.

1. **유효한 서명이 서명을 든 사람의 신원을 보장하지 않아요**
2. **LAN에서는 신뢰가** 생각보다 약해요
3. **Minecraft의 `textures` 속성은 본질적으로 주입된 콘텐츠예요**. 그것을 든 플레이어와 일치하는지 확인해야 해요

"알 수 없는" 월드(정확히는 호스트가 수상한 모드를 가진)의 LAN 월드에 들어가면, 망토 이전에 이미 보안 문제가 있어요. 하지만 시사하는 바가 있어요. Minecraft는 LAN의 모든 사람이 서로 신뢰한다고 가정해요. 그 가정은 맞아요. 신뢰를 남용하는 첫 호스트가 나오기 전까지는요.

---

**자료**

- **GitHub**: [fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **Minecraft 인증**: [Yggdrasil protocol](https://wiki.vg/Authentication) (wiki.vg)
- **RSA 암호학**: [RFC 3447](https://tools.ietf.org/html/rfc3447) (PKCS #1)

**핵심 3가지**

1. RSA 서명은 신원보다 메시지를 검증해요. 많은 시스템에 비싼 대가를 치르게 한 세부 사항이에요.
2. Minecraft는 플레이어 프로필이 받은 서명과 일치하는지 확인하지 않아요. 암호학은 온전한 채 검증의 논리적 결함이에요.
3. LAN이나 터널에서는 통합 서버를 장악한 모드에게 모든 것이 열려 있어요.
