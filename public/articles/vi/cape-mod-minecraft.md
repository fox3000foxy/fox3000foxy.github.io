---
title: "Cape Mod: cách đánh cắp cape của Jeb_ bằng cách chèn chữ ký RSA"
description: "Một mod Fabric khai thác lỗ hổng logic trong hệ thống tin cậy của Minecraft: chữ ký RSA hợp lệ từ Mojang nhưng được phát lại trên tài khoản sai. Giải thích code, tác động bảo mật và bài học về mật mã."
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
author_sig: "aH78YEOvBTfXMOt6XQbeUq5MQs5KrGDLIQvTmbNxrNp6NU8gkUCU4PY3ZdTQKxzCVdkOQfNiAwQ/n+CB2nmzyA=="
---

# Cape Mod: cách đánh cắp cape của Jeb_ bằng cách chèn chữ ký RSA

![alt text](assets/xbox-profile.png)
Nếu tôi nói với bạn rằng chỉ cần một chữ ký RSA hợp lệ -- nhưng dành cho **tài khoản sai** -- để khiến bạn bè tin rằng bạn đang đeo cape chính thức của Mojang? Chào mừng đến với `cape-mod`, một exploit Fabric cho thấy cách Minecraft tin tưởng một chữ ký mà không kiểm tra xem hồ sơ sở hữu nó có thực sự là của bạn hay không.

## Bối cảnh: Minecraft quản lý skin và cape như thế nào

Trong Java Edition, có một câu hỏi hiếm khi được đặt ra: **ai chịu trách nhiệm hiển thị skin và cape của người chơi -- client hay server?**

Câu trả lời có sắc thái:

| Thành phần | Ai gửi? | Ai tải về? |
|---|---|---|
| **Texture skin** | Server gửi URL đã ký | Client tải từ `textures.minecraft.net` |
| **Texture cape** | Server gửi URL đã ký | Client tải từ `textures.minecraft.net` |
| **Thuộc tính `textures`** | Server gửi `GameProfile` từ auth Mojang | Client xác minh chữ ký RSA |

Điểm mấu chốt: mọi thứ nằm trong một thuộc tính gọi là `textures` của `GameProfile`. Thuộc tính này chứa:
- Payload JSON mã hóa base64 chứa URL của các texture
- Một **chữ ký RSA** được tạo bằng khóa riêng của Mojang

## Bức tường chữ ký RSA

Mỗi thuộc tính `textures` trông như thế này khi giải mã:

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

Client xác minh chữ ký RSA dựa trên **khóa công khai được nhúng trong jar** (`yggdrasil_session_pubkey.der`):

```java
// Property.java (authlib)
public boolean isSignatureValid(PublicKey publicKey) {
    Signature sig = Signature.getInstance("SHA1withRSA");
    sig.initVerify(publicKey);
    sig.update(this.value.getBytes());
    return sig.verify(Base64.decodeBase64(this.signature));
}
```

Đối với người chơi từ xa (không phải local), client chỉ chấp nhận skin **được đánh dấu là `secure`** -- tức là có chữ ký hợp lệ:

```java
// SkinManager.createLookup() -- simplified
PlayerSkin skin = optional
    .filter(ps -> !isRemote || ps.secure())  // ← người chơi từ xa phải được bảo mật
    .orElse(defaultSkin);
```

Về lý thuyết, kiểm tra này ngăn chặn spoofing. Nhưng đây là lúc mọi thứ trở nên thú vị.

## Lỗ hổng: phát lại chữ ký (signature replay)

Client xác minh rằng chữ ký RSA **hợp lệ**. Nhưng nó **không bao giờ** kiểm tra xem `profileId` trong JSON có khớp với UUID thực của người chơi hay không.

Nói cách khác: một thuộc tính `textures` lấy từ **tài khoản Mojang hiện có** (ví dụ của một nhân viên Mojang) có thể được phát lại cho bất kỳ người chơi nào khác. Chữ ký vẫn hợp lệ -- nó thực sự do Mojang tạo ra -- chỉ là nó đến từ một tài khoản khác.

### Làm thế nào để trích xuất chữ ký thật?

Jeb_ (UUID `853c80ef-3c37-49fd-aa49-938b674adae6`) có cape Mojang Studios. Từ máy chủ session của Mojang:

```bash
curl -s "https://sessionserver.mojang.com/session/minecraft/profile/853c80ef-3c37-49fd-aa49-938b674adae6?unsigned=false"
```

Phản hồi:

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

Chữ ký `signature` của trường `value` này được tạo bởi Mojang. Đó là RSA-2048 SHA-1. Nó **hoàn toàn** hợp lệ, ngay cả khi bạn phát lại nó trên một UUID khác -- bởi vì chữ ký của Jeb_ vẫn là chữ ký của Jeb_, và client không bao giờ kiểm tra xem nó có **đáng lẽ** phải là của bạn hay không.

## Code: cách mod hoạt động

Mod `cape-mod` rất nhỏ -- 65 dòng Java. Đây là phần lõi:

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

        // Thay thế thuộc tính textures bằng của Jeb_
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

**Các bước**:
1. **Mixin** trên `Player.getGameProfile()` -- điểm mà hồ sơ người chơi được trả về
2. Kiểm tra đó là server local (Integrated Server)
3. Kiểm tra đó là host (LAN world)
4. **Thay thế** thuộc tính `textures` bằng của Jeb_ (được hardcode)
5. Trả về `GameProfile` mới với texture đã được chèn

`GameProfile` vì thế bị **làm giả**: đó là một hồ sơ được xây dựng nhân tạo, không khớp với người chơi thực. Các thuộc tính `textures` được **phát lại** từ Jeb_ -- chữ ký RSA là xác thực nhưng được áp dụng cho hồ sơ sai. Gói tin mạng thì hợp lệ: server gửi `ClientboundPlayerInfoUpdatePacket` bình thường với hồ sơ đã sửa đổi này. Hồ sơ bị làm giả, không phải gói tin.

Khi bạn bè của host tham gia qua LAN, họ nhận được `ClientboundPlayerInfoUpdatePacket` với hồ sơ đã sửa đổi. Client:
1. Giải mã payload base64
2. Xác minh chữ ký RSA → ✅ hợp lệ (thực sự là của Jeb_)
3. Đánh dấu skin là `secure=true` (vì chữ ký hợp lệ)
4. Vượt qua bộ lọc `!isRemote || ps.secure()` → ✅ vượt qua
5. **Tải về và hiển thị cape của Jeb_**

## Kết quả trong game: cape trên skin của bạn

Đây là kết quả in-game. Đầu tiên, nhìn từ phía trước với cape của Jeb_ hiển thị trên host:

![Cape Mod -- Cape Jeb_ hiển thị trên host](/images/cape-mod/cape-01-jeb-cape.png)

Có thể thấy rõ họa tiết đỏ/trắng của cape Mojang Studios chính thức. Không có khác biệt nào so với Jeb_ thật đang đeo cape của chính mình -- client tải chính xác cùng một texture từ `textures.minecraft.net`.

Và trong góc nhìn nhập vai, trong một phiên chơi thực tế:

![Cape Mod -- góc nhìn trong game với cape hiển thị](/images/cape-mod/cape-02-lava-cape.png)

Cape bay phía sau người chơi, đung đưa theo chuyển động. Hoàn toàn không thể phân biệt với một skin xác thực có cape chính thức.

Góc khác, trong một thế giới với dung nham và địa hình:

![Cape Mod -- cape trong môi trường tự nhiên](/images/cape-mod/cape-03-local-game.png)

Và một góc nhìn cận cảnh khác từ gameplay thực tế, cho thấy cape đang hoạt động:

![Cape Mod -- cape trong gameplay Minecraft cổ điển](/images/cape-mod/cape-04-real-gameplay.png)

Đối với người tham gia LAN mà không biết host có mod, hoàn toàn không có cách nào phân biệt điều này với cape Mojang thật. Đó chính xác là vấn đề: **chữ ký hợp lệ**, client không có lý do gì để nghi ngờ.

## Tại sao đây là lỗ hổng (và tại sao nó không phải)

Trớ trêu thay: exploit hoạt động **chính xác bởi vì chữ ký hợp lệ**. Không có sự phá vỡ mật mã nào ở đây -- tệ hơn, đó là một **lỗ hổng logic** trong mô hình tin cậy.

| Kiểm tra | Kết quả |
|---|---|
| **Tính hợp lệ của chữ ký RSA** | ✅ Hợp lệ (ký bởi Mojang cho Jeb_) |
| **`profileId` trong payload có khớp với UUID của host không?** | ❌ Không (UUID của Jeb_ ≠ UUID của host) |
| **Client có kiểm tra sự tương ứng này không?** | ❌ **Không. Chỉ chữ ký RSA được xác minh.** |

Minecraft tin tưởng **chữ ký**, không phải danh tính của người mang nó. Miễn là chữ ký đến từ Mojang, client chấp nhận nó. Giống như đưa ra một hộ chiếu giả được chính phủ ký -- con dấu hợp lệ, mặc dù hộ chiếu không phải của bạn.

## Tác động bảo mật

### Phạm vi giới hạn ở LAN

Mod chỉ hoạt động trên server tích hợp (LAN). Kẻ tấn công phải:
- Có mod Fabric được cài đặt
- Là host của một thế giới LAN
- Bạn bè kết nối mà không cần mod (vanilla)

### Nhưng khả năng có thể mở rộng

Về lý thuyết, với kỹ thuật tương tự, ta có thể:
- **Chèn lại dữ liệu đã ký khác**: heads, enchantments bất hợp pháp, thành phần chat độc hại
- **Kết hợp với tunnel LAN** (NGROK, playit.gg, Radmin VPN) để ảnh hưởng đến người chơi trên internet
- **Mở rộng sang các thuộc tính khác** của hồ sơ phụ thuộc vào chữ ký

### Tại sao Mojang có thể sẽ không vá

Không có "lỗ hổng" theo nghĩa chặt chẽ -- chữ ký hợp lệ. Việc vá lỗi này sẽ yêu cầu Mojang thay đổi toàn bộ mô hình xác thực, điều rất phức tạp. Hiện tại, đây là một edge case: người chơi LAN được cho là tin tưởng nhau.

## Cái bẫy triết học

Cape Mod là một **proof of concept** tuyệt vời cho một chân lý rộng hơn: **bạn không bao giờ được tin tưởng một chữ ký mà không kiểm tra ai đã ký nó và cho mục đích gì**.

Đây là một bài học về mật mã cơ bản. RSA ký một **thông điệp**, không phải một **danh tính**. Nếu tôi đưa bạn một chữ ký RSA hợp lệ từ Mojang, bạn biết Mojang đã ký *một cái gì đó*. Bạn không biết cho ai, và bạn không thể giả định điều đó chỉ bằng cách nhìn vào thông điệp.

Đây chính xác là những gì đã xảy ra với chứng chỉ SSL/TLS vào những năm 2000 khi các CA chấp nhận bất cứ thứ gì -- chữ ký hợp lệ, nhưng nó được áp dụng cho tên miền sai.

## Kết luận

Cape Mod không phải là hack theo nghĩa cổ điển -- đó là sự khai thác tinh tế của việc thiếu kiểm tra logic trong Minecraft. Nó cho thấy rằng:

1. **Một chữ ký hợp lệ không đảm bảo danh tính của người mang nó**
2. **Trong LAN, sự tin cậy yếu hơn** người ta vẫn nghĩ
3. **Các thuộc tính `textures` của Minecraft về cơ bản là nội dung được chèn** -- cần kiểm tra chúng khớp với người chơi mang chúng

Nếu bạn tham gia một thế giới LAN trên server "không rõ" (hay đúng hơn, host có mod đáng ngờ), bạn đã có vấn đề bảo mật trước cả khi nói đến cape. Nhưng điều này mang tính triệu chứng: Minecraft giả định mọi người trong LAN tin tưởng nhau. Điều đó đúng... cho đến khi nó không còn đúng nữa.

---

**Tài nguyên**

- **GitHub**: [fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **Minecraft auth**: [Yggdrasil protocol](https://wiki.vg/Authentication) (wiki.vg)
- **RSA cryptography**: [RFC 3447](https://tools.ietf.org/html/rfc3447) (PKCS #1)

**3 điểm chính**

1. Chữ ký RSA xác thực một thông điệp, không phải danh tính -- một chi tiết đã gây tổn thất cho nhiều hệ thống.
2. Minecraft không kiểm tra hồ sơ người chơi có khớp với chữ ký nhận được hay không -- một lỗ hổng logic, không phải mật mã.
3. Trong LAN hoặc tunnel, mọi thứ đều cởi mở cho một mod kiểm soát server tích hợp.
