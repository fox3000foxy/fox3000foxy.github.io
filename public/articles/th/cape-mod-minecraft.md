---
title: "Cape Mod : วิธีขโมยเคปของ Jeb_ ด้วยการฉีดลายเซ็น RSA"
description: "ม็อด Fabric ที่ใช้ประโยชน์จากช่องโหว่เชิงตรรกะในระบบความเชื่อถือของ Minecraft : ลายเซ็น RSA ที่ถูกต้องของ Mojang แต่ถูกนำมาใช้ซ้ำกับบัญชีผิด คำอธิบายโค้ด, ผลกระทบด้านความปลอดภัย และบทเรียนด้านการเข้ารหัส"
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
author_sig: "RW47YO46GU1BNxlSNMzHncGC/ArSZzg1cUU2qpAYHD9wOyjxBvRTjQg4q6PkLib6MU7+9D+eHAhevfoAIvyIVQ=="
---

# Cape Mod : วิธีขโมยเคปของ Jeb_ ด้วยการฉีดลายเซ็น RSA

![alt text](assets/xbox-profile.png)
จะเกิดอะไรขึ้นถ้าบอกว่า แค่มีลายเซ็น RSA ที่ถูกต้อง -- แต่สำหรับ**บัญชีผิด** -- ก็ทำให้เพื่อนคุณเชื่อว่าคุณสวมเคปทางการของ Mojang ได้แล้ว ยินดีต้อนรับสู่ `cape-mod` เอ็กซ์พลอยต์ Fabric ที่แสดงให้เห็นว่า Minecraft เชื่อถือลายเซ็นโดยไม่ตรวจสอบว่าโปรไฟล์ที่เป็นเจ้าของลายเซ็นนั้นเป็นของคุณจริงหรือไม่

## บริบท : Minecraft จัดการสกินและเคปอย่างไร

ใน Java Edition มีคำถามที่เราไม่ค่อยได้ถามกัน : **ใครเป็นผู้รับผิดชอบในการแสดงสกินและเคปของผู้เล่น -- ไคลเอ็นต์หรือเซิร์ฟเวอร์?**

คำตอบมีรายละเอียดปลีกย่อย :

| ส่วนประกอบ | ใครส่ง? | ใครดาวน์โหลด? |
|---|---|---|
| **Texture สกิน** | เซิร์ฟเวอร์ส่ง URL ที่เซ็นชื่อแล้ว | ไคลเอ็นต์ดาวน์โหลดจาก `textures.minecraft.net` |
| **Texture เคป** | เซิร์ฟเวอร์ส่ง URL ที่เซ็นชื่อแล้ว | ไคลเอ็นต์ดาวน์โหลดจาก `textures.minecraft.net` |
| **พร็อพเพอร์ตี้ `textures`** | เซิร์ฟเวอร์ส่ง `GameProfile` จากการยืนยันตัวตนของ Mojang | ไคลเอ็นต์ตรวจสอบลายเซ็น RSA |

จุดสำคัญ : ทุกอย่างอยู่ในพร็อพเพอร์ตี้ที่ชื่อ `textures` ของ `GameProfile` พร็อพเพอร์ตี้นี้ประกอบด้วย :
- Payload JSON ในรูปแบบ base64 ที่มี URL ของ texture ต่าง ๆ
- **ลายเซ็น RSA** ที่สร้างด้วยคีย์ส่วนตัวของ Mojang

## กำแพงลายเซ็น RSA

พร็อพเพอร์ตี้ `textures` แต่ละอันเมื่อถอดรหัสจะมีลักษณะแบบนี้ :

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

ไคลเอ็นต์ตรวจสอบลายเซ็น RSA เทียบกับ**คีย์สาธารณะที่ฝังอยู่ใน jar** (`yggdrasil_session_pubkey.der`) :

```java
// Property.java (authlib)
public boolean isSignatureValid(PublicKey publicKey) {
    Signature sig = Signature.getInstance("SHA1withRSA");
    sig.initVerify(publicKey);
    sig.update(this.value.getBytes());
    return sig.verify(Base64.decodeBase64(this.signature));
}
```

สำหรับผู้เล่นระยะไกล (ไม่ใช่ในเครื่อง) ไคลเอ็นต์จะยอมรับเฉพาะสกินที่**ถูกทำเครื่องหมายว่า `secure`** -- นั่นคือมีลายเซ็นที่ถูกต้อง :

```java
// SkinManager.createLookup() -- แบบย่อ
PlayerSkin skin = optional
    .filter(ps -> !isRemote || ps.secure())  // ← ผู้เล่นระยะไกลต้องมีความปลอดภัย
    .orElse(defaultSkin);
```

การตรวจสอบนี้ป้องกันการปลอมแปลงในทางทฤษฎี แต่นี่คือจุดที่เริ่มน่าสนใจ

## ช่องโหว่ : การนำลายเซ็นมาใช้ซ้ำ (signature replay)

ไคลเอ็นต์ตรวจสอบว่าลายเซ็น RSA **ถูกต้อง** แต่มัน**ไม่เคย**ตรวจสอบว่า `profileId` ที่อยู่ใน JSON ตรงกับ UUID จริงของผู้เล่น

กล่าวอีกนัยหนึ่ง : พร็อพเพอร์ตี้ `textures` ที่นำมาจาก**บัญชี Mojang ที่มีอยู่จริง** (เช่นของพนักงาน Mojang) สามารถนำมาเล่นซ้ำกับผู้เล่นคนอื่นได้ ลายเซ็นยังคงถูกต้อง -- มันถูกสร้างขึ้นโดย Mojang จริง ๆ -- แค่มาจากอีกบัญชีหนึ่ง

### จะแยกลายเซ็นจริงออกมาได้อย่างไร?

Jeb_ (UUID `853c80ef-3c37-49fd-aa49-938b674adae6`) มีเคป Mojang Studios จากเซิร์ฟเวอร์เซสชันของ Mojang :

```bash
curl -s "https://sessionserver.mojang.com/session/minecraft/profile/853c80ef-3c37-49fd-aa49-938b674adae6?unsigned=false"
```

ผลลัพธ์ :

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

`signature` ของฟิลด์ `value` นี้ถูกสร้างขึ้นโดย Mojang เป็นลายเซ็น RSA-2048 SHA-1 ที่**ถูกต้องอย่างสมบูรณ์** แม้คุณจะนำไปเล่นซ้ำกับ UUID อื่น -- เพราะลายเซ็นของ Jeb_ ก็ยังคงเป็นลายเซ็นของ Jeb_ และไคลเอ็นต์ไม่เคยตรวจสอบว่ามัน**ควรจะเป็น**ของคุณ

## โค้ด : ม็อดทำงานอย่างไร

ม็อด `cape-mod` มีขนาดเล็กมาก -- แค่ 65 บรรทัดของ Java นี่คือหัวใจสำคัญ :

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

        // แทนที่พร็อพเพอร์ตี้ textures ด้วยของ Jeb_
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

**ขั้นตอน** :
1. **Mixin** บน `Player.getGameProfile()` -- จุดที่โปรไฟล์ของผู้เล่นถูกส่งกลับ
2. ตรวจสอบว่าเป็นเซิร์ฟเวอร์ภายในเครื่อง (Integrated Server)
3. ตรวจสอบว่าเป็นโฮสต์ (โลก LAN)
4. **แทนที่** พร็อพเพอร์ตี้ `textures` ด้วยของ Jeb_ (แบบ hardcode)
5. ส่งคืน `GameProfile` ใหม่ที่มี texture ที่ถูกฉีดเข้าไป

`GameProfile` จึงถูก**ปลอมแปลง**ขึ้นมา : เป็นโปรไฟล์ที่สร้างขึ้นโดยไม่ได้ตรงกับผู้เล่นจริง พร็อพเพอร์ตี้ `textures` ถูก**นำมาเล่นซ้ำ**จาก Jeb_ -- ลายเซ็น RSA เป็นของแท้ แต่ถูกใช้กับโปรไฟล์ผิด แพ็กเก็ตเครือข่ายนั้นถูกต้องตามกฎหมาย : เซิร์ฟเวอร์ส่ง `ClientboundPlayerInfoUpdatePacket` ตามปกติกับโปรไฟล์ที่ถูกแก้ไขนี้ สิ่งที่ถูกปลอมคือโปรไฟล์ ไม่ใช่แพ็กเก็ต

เมื่อเพื่อนของโฮสต์เข้าร่วมผ่าน LAN พวกเขาจะได้รับ `ClientboundPlayerInfoUpdatePacket` พร้อมกับโปรไฟล์ที่ถูกแก้ไข ไคลเอ็นต์ :
1. ถอดรหัส payload base64
2. ตรวจสอบลายเซ็น RSA → ✅ ถูกต้อง (เป็นของ Jeb_ จริง ๆ)
3. ทำเครื่องหมายสกินว่า `secure=true` (เพราะลายเซ็นถูกต้อง)
4. ผ่านตัวกรอง `!isRemote || ps.secure()` → ✅ ผ่าน
5. **ดาวน์โหลดและแสดงเคปของ Jeb_**

## ผลลัพธ์ในเกม : เคปบนสกินของคุณ

นี่คือสิ่งที่เห็นในเกม เริ่มจากมุมมองด้านหน้าพร้อมเคปของ Jeb_ ที่แสดงบนโฮสต์ :

![Cape Mod -- เคป Jeb_ แสดงบนโฮสต์](/images/cape-mod/cape-01-jeb-cape.png)

เราจะเห็นลวดลายสีแดง/ขาวของเคปทางการ Mojang Studios อย่างชัดเจน ไม่มีความแตกต่างจาก Jeb_ ตัวจริงที่สวมเคปของตัวเอง -- ไคลเอ็นต์ดาวน์โหลด texture เดียวกันจาก `textures.minecraft.net`

และในมุมมองแบบดื่มด่ำ ในเกมจริง :

![Cape Mod -- มุมมองในเกมพร้อมเคปที่มองเห็น](/images/cape-mod/cape-02-lava-cape.png)

เคปปลิวไปด้านหลังผู้เล่น ขยับตามการเคลื่อนไหว แยกไม่ออกจากสกินจริงที่มีเคปทางการ

อีกมุม ในโลกที่มีลาวาและภูมิประเทศ :

![Cape Mod -- เคปในสภาพแวดล้อมธรรมชาติ](/images/cape-mod/cape-03-local-game.png)

และมุมใกล้ชิดสุดท้ายของการเล่นจริง ที่เห็นเคปในขณะเล่น :

![Cape Mod -- เคปในการเล่น Minecraft ทั่วไป](/images/cape-mod/cape-04-real-gameplay.png)

สำหรับคนที่เข้าร่วม LAN โดยไม่รู้ว่าโฮสต์ใช้ม็อดอยู่ ไม่มีทางแยกแยะได้เลยว่านี่คือเคป Mojang ปลอม นี่คือประเด็น : **ลายเซ็นถูกต้อง** ไคลเอ็นต์ไม่มีเหตุผลที่จะสงสัย

## ทำไมนี่ถึงเป็นช่องโหว่ (และทำไมถึงไม่ใช่)

เป็นเรื่องน่าขัน : เอ็กซ์พลอยต์ทำงานได้**เพราะลายเซ็นถูกต้อง** ไม่มีการบายพาสการเข้ารหัสลับใด ๆ ที่นี่ -- ที่แย่กว่านั้นคือมันเป็น**ช่องโหว่เชิงตรรกะ** ในโมเดลความเชื่อถือ

| การตรวจสอบ | ผลลัพธ์ |
|---|---|
| **ความถูกต้องของลายเซ็น RSA** | ✅ ถูกต้อง (เซ็นโดย Mojang สำหรับ Jeb_) |
| **`profileId` ใน payload ตรงกับ UUID ของโฮสต์หรือไม่?** | ❌ ไม่ (UUID ของ Jeb_ ≠ UUID ของโฮสต์) |
| **ไคลเอ็นต์ตรวจสอบความสอดคล้องนี้หรือไม่?** | ❌ **ไม่ เฉพาะลายเซ็น RSA เท่านั้นที่ถูกตรวจสอบ** |

Minecraft เชื่อถือ**ลายเซ็น** ไม่ใช่**ตัวตน**ของผู้ที่ถือลายเซ็นนั้น ตราบใดที่ลายเซ็นมาจาก Mojang ไคลเอ็นต์ก็ยอมรับ มันเหมือนกับการแสดงพาสปอร์ตปลอมที่เซ็นโดยรัฐบาล -- ตราประทับถูกต้อง แม้พาสปอร์ตจะไม่ใช่ของคุณ

## ผลกระทบด้านความปลอดภัย

### ขอบเขตจำกัดที่ LAN

ม็อดทำงานได้เฉพาะบนเซิร์ฟเวอร์แบบบูรณาการ (LAN) ผู้โจมตีต้อง :
- มีม็อด Fabric ติดตั้งอยู่
- เป็นโฮสต์ของโลก LAN
- เพื่อน ๆ เชื่อมต่อโดยไม่มีม็อด (vanilla)

### แต่ความเป็นไปได้ขยายวงกว้างขึ้น

ในทางเทคนิคแล้ว ด้วยเทคนิคเดียวกัน สามารถ :
- **นำข้อมูลที่เซ็นแล้วกลับมาฉีดใหม่** : หัว, เอ็นแชนต์ที่ผิดกฎหมาย, ส่วนประกอบแชทที่เป็นอันตราย
- **รวมกับอุโมงค์ LAN** (NGROK, playit.gg, Radmin VPN) เพื่อส่งผลต่อผู้เล่นบนอินเทอร์เน็ต
- **ขยายไปยังพร็อพเพอร์ตี้อื่น ๆ** ของโปรไฟล์ที่ขึ้นอยู่กับลายเซ็น

### ทำไม Mojang อาจจะไม่แพตช์

ไม่มี "ช่องโหว่" ในความหมายที่เคร่งครัด -- ลายเซ็นถูกต้อง การแพตช์สิ่งนี้จะต้องการให้ Mojang เปลี่ยนโมเดลการยืนยันตัวตนทั้งหมด ซึ่งเป็นเรื่องซับซ้อน ในตอนนี้มันเป็นกรณีขอบ : ผู้เล่น LAN ถูกสันนิษฐานว่าไว้ใจซึ่งกันและกัน

## กับดักเชิงปรัชญา

Cape Mod เป็น**การพิสูจน์แนวคิด**ที่ยอดเยี่ยมของความจริงที่กว้างกว่า : **คุณไม่ควรเชื่อถือลายเซ็นโดยไม่ตรวจสอบว่าใครเป็นคนเซ็นและเกี่ยวกับอะไร**

นี่คือบทเรียนพื้นฐานด้านการเข้ารหัส RSA เซ็น**ข้อความ** ไม่ใช่**ตัวตน** ถ้าฉันให้ลายเซ็น RSA ที่ถูกต้องของ Mojang แก่คุณ คุณก็รู้ว่า Mojang เซ็น*บางอย่าง* คุณไม่รู้ว่าสำหรับใคร และคุณไม่สามารถสันนิษฐานได้เพียงแค่มองข้อความ

นี่คือสิ่งที่เกิดขึ้นกับใบรับรอง SSL/TLS ในช่วงปี 2000 เมื่อ CA รับรองอะไรก็ได้ -- ลายเซ็นถูกต้อง แต่มันใช้กับโดเมนผิด

## บทสรุป

Cape Mod ไม่ใช่แฮ็กในความหมายคลาสสิก -- มันเป็นการใช้ประโยชน์อย่างสวยงามจากการขาดการตรวจสอบเชิงตรรกะใน Minecraft มันแสดงให้เห็นว่า :

1. **ลายเซ็นที่ถูกต้องไม่ได้รับประกันตัวตนของผู้ถือมัน**
2. **ใน LAN ความเชื่อถือนั้นอ่อนแอกว่าที่เราคิด**
3. **พร็อพเพอร์ตี้ `textures` ของ Minecraft โดยเนื้อแท้แล้วคือเนื้อหาที่ถูกฉีด** -- จำเป็นต้องตรวจสอบว่ามันตรงกับผู้เล่นที่สวมใส่หรือไม่

ถ้าคุณเข้าร่วมโลก LAN บนเซิร์ฟเวอร์ "ที่ไม่รู้จัก" (หรือโฮสต์ที่มีม็อดน่าสงสัย) คุณมีปัญหาด้านความปลอดภัยตั้งแต่ก่อนเคปอยู่แล้ว แต่มันเป็นอาการ : Minecraft สมมติว่าทุกคนบน LAN ไว้ใจซึ่งกันและกัน ซึ่งเป็นจริง... จนกว่าจะไม่เป็น

---

**แหล่งข้อมูล**

- **GitHub**: [fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **การยืนยันตัวตน Minecraft**: [โปรโตคอล Yggdrasil](https://wiki.vg/Authentication) (wiki.vg)
- **การเข้ารหัส RSA**: [RFC 3447](https://tools.ietf.org/html/rfc3447) (PKCS #1)

**3 ประเด็นสำคัญ**

1. ลายเซ็น RSA รับรองข้อความ ไม่ใช่ตัวตน -- รายละเอียดที่ทำให้หลายระบบต้องเสียหาย
2. Minecraft ไม่ตรวจสอบว่าโปรไฟล์ผู้เล่นตรงกับลายเซ็นที่ได้รับ -- ช่องโหว่เชิงตรรกะ ไม่ใช่เชิงการเข้ารหัส
3. ใน LAN หรือในอุโมงค์ ทุกอย่างเปิดกว้างสำหรับม็อดที่ควบคุมเซิร์ฟเวอร์แบบบูรณาการ
