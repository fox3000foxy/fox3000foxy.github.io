---
title: "Cape Mod : cách đánh cắp cape của Jeb_ bằng tiêm chữ ký RSA"
description: "Một mod Fabric khai thác lỗ hổng logic trong hệ thống tin cậy của Minecraft : chữ ký RSA hợp lệ của Mojang nhưng replay sang tài khoản sai. Giải thích mã, hàm ý bảo mật và bài học mật mã."
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
author_sig: "zOyN9LWpTG2r/tfhVLIz00RZmaZNIf1q2ZYtNAy0ItX0SG+Bn+hZBbdPjP0R/BJinqCUiOSlLGAONa993CgoEQ=="
---

# Cape Mod : cách đánh cắp cape của Jeb_ bằng tiêm chữ ký RSA

![alt text](assets/xbox-profile.png)

Và nếu tôi nói với bạn rằng chỉ cần một chữ ký RSA hợp lệ -- nhưng cho **tài khoản sai** -- là đủ khiến bạn bè tin rằng bạn đang khoác cape chính thức của Mojang? Chào mừng tới `cape-mod`, một exploit Fabric cho thấy Minecraft tin vào chữ ký thế nào trong khi quên kiểm tra rằng hồ sơ nó thuộc về có thực sự là của bạn hay không.

## Bối cảnh : Minecraft quản lý skin và cape thế nào

Trong Java Edition, có một câu hỏi hiếm khi được đặt ra : **ai chịu trách nhiệm hiển thị skin và cape của người chơi -- client hay server?**

Câu trả lời có sắc thái :

| Thành phần | Ai gửi? | Ai tải? |
|---|---|---|
| **Texture skin** | Server gửi URL đã ký | Client tải từ `textures.minecraft.net` |
| **Texture cape** | Server gửi URL đã ký | Client tải từ `textures.minecraft.net` |
| **Thuộc tính `textures`** | Server gửi `GameProfile` từ auth Mojang | Client kiểm tra chữ ký RSA |

Điểm mấu chốt : mọi thứ nằm trong một thuộc tính gọi là `textures` của `GameProfile`. Thuộc tính này chứa :
- Một payload JSON base64 với các URL texture
- Một **chữ ký RSA** làm bằng khóa riêng của Mojang

## Bức tường chữ ký RSA

Mỗi thuộc tính `textures` trông như sau khi giải mã :

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

Client kiểm tra chữ ký RSA với **khóa công khai nhúng trong jar** (`yggdrasil_session_pubkey.der`) :

```java
// Property.java (authlib)
public boolean isSignatureValid(PublicKey publicKey) {
    Signature sig = Signature.getInstance("SHA1withRSA");
    sig.initVerify(publicKey);
    sig.update(this.value.getBytes());
    return sig.verify(Base64.decodeBase64(this.signature));
}
```

Với người chơi từ xa (ngoài game cục bộ), client chỉ chấp nhận skin **đánh dấu `secure`** -- tức có chữ ký hợp lệ :

```java
// SkinManager.createLookup() -- rút gọn
PlayerSkin skin = optional
    .filter(ps -> !isRemote || ps.secure())  // ← người chơi từ xa phải được bảo mật
    .orElse(defaultSkin);
```

Bước kiểm tra này chặn spoofing về lý thuyết. Nhưng việc xác thực dừng ở đó, và chính xác ở đó cuộc tấn công bắt đầu.

## Lỗ hổng : replay chữ ký

Client kiểm tra rằng chữ ký RSA **hợp lệ**. Nó luôn quên kiểm tra rằng `profileId` chứa trong JSON khớp với UUID thật của người chơi.

Nói cách khác : một thuộc tính `textures` lấy từ một **tài khoản Mojang hiện có** (ví dụ của một nhân viên Mojang) có thể replay lên bất kỳ người chơi nào khác. Chữ ký vẫn hợp lệ -- nó thực sự do Mojang tạo ra -- chỉ là nó tới từ tài khoản khác.

### Cách trích một chữ ký thật?

Jeb_ (UUID `853c80ef-3c37-49fd-aa49-938b674adae6`) có cape Mojang Studios. Từ máy chủ phiên Mojang :

```bash
curl -s "https://sessionserver.mojang.com/session/minecraft/profile/853c80ef-3c37-49fd-aa49-938b674adae6?unsigned=false"
```

Phản hồi :

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

`signature` của trường `value` này do Mojang tạo ra. Đó là RSA-2048 SHA-1. Nó **tuyệt đối** hợp lệ, dù bạn replay nó sang UUID khác -- vì chữ ký của Jeb_ vẫn là chữ ký của Jeb_, và client quên kiểm soát nó vốn dành cho ai.

## Mã nguồn : mod hoạt động thế nào

Mod `cape-mod` tí hon -- 65 dòng Java. Đây là cốt lõi :

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

        // Thay thuộc tính textures bằng của Jeb_
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

**Các bước** :
1. **Mixin** lên `Player.getGameProfile()` -- điểm nơi hồ sơ người chơi được trả về
2. Kiểm tra đây là máy chủ cục bộ (Integrated Server)
3. Kiểm tra đây là host (LAN world)
4. **Thay** thuộc tính `textures` bằng của Jeb_ (ghi cứng)
5. Trả về một `GameProfile` mới với texture đã tiêm

`GameProfile` vì vậy **được rèn** : đó là hồ sơ dựng nhân tạo, không khớp người chơi thật. Các thuộc tính `textures` **được replay** từ Jeb_ -- chữ ký RSA xác thực nhưng áp sai hồ sơ. Gói mạng thì hợp lệ : server gửi bình thường `ClientboundPlayerInfoUpdatePacket` với hồ sơ đã sửa này. Chính hồ sơ bị rèn ; gói vẫn hợp lệ.

Khi bạn bè của host tham gia qua LAN, họ nhận `ClientboundPlayerInfoUpdatePacket` với hồ sơ đã sửa. Client :
1. Giải mã payload base64
2. Kiểm tra chữ ký RSA → ✅ hợp lệ (đúng là của Jeb_)
3. Đánh dấu skin là `secure=true` (vì chữ ký hợp lệ)
4. Vượt bộ lọc `!isRemote || ps.secure()` → ✅ qua
5. **Tải và hiển thị cape của Jeb_**

## Kết quả trong game : cape trên skin của bạn

Đây là những gì xảy ra in-game. Trước hết, nhìn chính diện với cape của Jeb_ hiển thị trên host :

![Cape Mod -- cape Jeb_ hiển thị trên host](/images/cape-mod/cape-01-jeb-cape.png)

Ta thấy rõ họa tiết đỏ/trắng của cape chính thức Mojang Studios. Render vẫn giống hệt một Jeb_ thật khoác cape của chính mình -- client tải đúng cùng texture từ `textures.minecraft.net`.

Và ở góc nhìn đắm chìm, trong một ván thật :

![Cape Mod -- nhìn trong game với cape hiện rõ](/images/cape-mod/cape-02-lava-cape.png)

Cape bay sau lưng người chơi, uốn theo chuyển động. Hoàn toàn không phân biệt được với skin xác thực có cape chính thức.

Góc khác, trong thế giới có dung nham và địa hình :

![Cape Mod -- cape trong môi trường tự nhiên](/images/cape-mod/cape-03-local-game.png)

Và một góc cận cuối từ gameplay thật, nơi ta thấy cape đang hoạt động :

![Cape Mod -- cape trong gameplay Minecraft cổ điển](/images/cape-mod/cape-04-real-gameplay.png)

Với ai tham gia LAN mà không biết host dùng mod, cape vẫn trông giống hệt cape Mojang thật. Đó chính xác là điểm mấu chốt : **chữ ký hợp lệ**, nên client xử lý nó như hợp lệ.

## Vì sao đây là lỗ hổng (và vì sao không hẳn)

Thật trớ trêu : exploit hoạt động **chính xác vì chữ ký hợp lệ**. Đây không phải bypass mật mã -- mà tệ hơn : một **lỗ hổng logic** trong mô hình tin cậy.

| Kiểm tra | Kết quả |
|---|---|
| **Tính hợp lệ của chữ ký RSA** | ✅ Hợp lệ (Mojang ký cho Jeb_) |
| **`profileId` trong payload có khớp UUID của host?** | ❌ Không (UUID của Jeb_ ≠ UUID của host) |
| **Client có kiểm tra sự khớp?** | ❌ **Không. Chỉ chữ ký RSA được kiểm tra.** |

Minecraft tin **vào chữ ký** thay vì danh tính người mang nó. Miễn chữ ký tới từ Mojang, client chấp nhận. Giống như trình hộ chiếu giả có con dấu chính phủ -- con dấu hợp lệ, dù hộ chiếu không phải của bạn.

## Hàm ý bảo mật

### Phạm vi giới hạn ở LAN

Mod chỉ hoạt động trên máy chủ tích hợp (LAN). Kẻ tấn công phải :
- Cài mod Fabric
- Là host của thế giới LAN
- Bạn bè kết nối không mod (vanilla)

### Nhưng khả năng mở rộng

Về lý thuyết, với cùng kỹ thuật, có thể :
- **Tiêm lại dữ liệu có chữ ký khác** : head, enchant bất hợp pháp, thành phần chat độc hại
- **Kết hợp với tunnel LAN** (NGROK, playit.gg, Radmin VPN) để ảnh hưởng người chơi trên internet
- **Mở rộng sang thuộc tính khác** của hồ sơ phụ thuộc chữ ký

### Vì sao Mojang có thể sẽ không vá

Đây không phải "lỗ hổng" theo nghĩa chặt -- chữ ký hợp lệ. Vá nó đòi Mojang sửa toàn bộ mô hình xác thực, việc này phức tạp. Hiện tại, đây là trường hợp biên : người chơi LAN được cho là tin nhau.

## Cái bẫy triết học

Cape Mod là một **proof of concept** xuất sắc cho một sự thật rộng hơn : **bạn luôn phải kiểm tra ai đã ký một dữ liệu và cho chủ thể nào trước khi tin nó**.

Đó là bài học mật mã cơ bản. RSA ký một **thông điệp** ; **danh tính** người nhận vẫn nằm ngoài chữ ký. Nếu tôi đưa bạn một chữ ký RSA hợp lệ của Mojang, bạn chỉ biết Mojang đã ký *cái gì đó*, mà không có chỉ dẫn đáng tin về người nhận chỉ từ thông điệp.

Đó chính xác là chuyện đã xảy ra với chứng chỉ SSL/TLS những năm 2000 khi các CA ký chứng chỉ mà không kiểm tra đúng tên miền -- chữ ký hợp lệ, nhưng áp sai tên miền.

## Kết luận

Cape Mod không phải hack theo nghĩa cổ điển -- đó là khai thác thanh lịch một thiếu sót xác thực logic trong Minecraft. Nó cho thấy :

1. **Chữ ký hợp lệ không đảm bảo danh tính người mang nó**
2. **Trong LAN, mức tin cậy thấp hơn** ta tưởng
3. **Các thuộc tính `textures` của Minecraft về cơ bản là nội dung được tiêm** -- phải kiểm tra chúng khớp với người chơi mang chúng

Nếu bạn tham gia thế giới LAN trên máy chủ "không quen" (hay đúng hơn, host có mod đáng ngờ), bạn đã có vấn đề bảo mật từ lâu trước cái cape. Nhưng điều này đáng suy ngẫm : Minecraft cho rằng mọi người trên LAN tin nhau. Điều đó đúng... cho tới host đầu tiên lạm dụng niềm tin đó.

---

**Tài nguyên**

- **GitHub**: [fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **Minecraft auth**: [Yggdrasil protocol](https://wiki.vg/Authentication) (wiki.vg)
- **Mật mã RSA**: [RFC 3447](https://tools.ietf.org/html/rfc3447) (PKCS #1)

**3 điểm chính**

1. Chữ ký RSA xác thực một thông điệp chứ không phải danh tính -- chi tiết đã khiến nhiều hệ thống trả giá đắt.
2. Minecraft quên kiểm tra hồ sơ người chơi có khớp chữ ký nó nhận hay không -- lỗ hổng logic trong xác thực, với mật mã còn nguyên.
3. Trong LAN hay tunnel, mọi thứ mở toang cho một mod kiểm soát máy chủ tích hợp.
