---
itle: "Cape Mod : RSA imza enjeksiyonuyla Jeb_'nin capesini çalmak"
description: "Minecraft'ın güven sistemindeki mantıksal bir açığı sömüren bir Fabric modu: Mojang'dan geçerli bir RSA imzası ama yanlış hesaba replay edilmiş. Kod açıklaması, güvenlik etkileri ve kriptografik dersler."
date: 2026-07-11authors:
  - fox3000foxy
tags:
  - minecraft
  - fabric
  - java
  - security
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "o3GwSNYaO4OMetXswEOKrn2d0zgh9TaEBcjhwlg3ziA0Txy53FOynvpMfOuNWxZDxKlYWxFxykKruLPGCtk1Qw=="
---

# Cape Mod : RSA imza enjeksiyonuyla Jeb_'nin capesini çalmak

![alt text](assets/xbox-profile.png)
Sana geçerli bir RSA imzasının -- ama **yanlış hesap** için -- arkadaşlarını resmi Mojang capesi taktığına inandırmaya yettiğini söylesem? `cape-mod`'a hoş geldin, Minecraft'ın bir imzaya güvendiğini ama imzanın ait olduğu profilin gerçekten senin olup olmadığını kontrol etmediğini gösteren bir Fabric exploit'i.

## Arka plan : Minecraft skin ve capeleri nasıl yönetiyor?

Java Edition'da sık sorulmayan bir soru var: **Bir oyuncunun skin ve capesini görüntülemekten kim sorumlu -- istemci mi yoksa sunucu mu?**

Cevap incelikli:

| Bileşen | Kim gönderiyor? | Kim indiriyor? |
|---|---|---|
| **Skin dokusu** | Sunucu imzalı URL'yi gönderir | İstemci `textures.minecraft.net`'ten indirir |
| **Cape dokusu** | Sunucu imzalı URL'yi gönderir | İstemci `textures.minecraft.net`'ten indirir |
| **`textures` özelliği** | Sunucu, Mojang auth'tan `GameProfile`'i gönderir | İstemci RSA imzasını doğrular |

Kilit nokta: her şey `GameProfile`'ın `textures` adlı bir özelliğinde bulunur. Bu özellik şunları içerir:
- Doku URL'lerini içeren base64 JSON payload
- Mojang'ın özel anahtarıyla yapılmış bir **RSA imzası**

## RSA imza duvarı

Her `textures` özelliği decode edildiğinde şuna benzer:

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

İstemci RSA imzasını **jar'a gömülü ortak anahtara** (`yggdrasil_session_pubkey.der`) karşı doğrular:

```java
// Property.java (authlib)
public boolean isSignatureValid(PublicKey publicKey) {
    Signature sig = Signature.getInstance("SHA1withRSA");
    sig.initVerify(publicKey);
    sig.update(this.value.getBytes());
    return sig.verify(Base64.decodeBase64(this.signature));
}
```

Uzaktaki oyuncular (yerel değil) için istemci yalnızca **`secure` olarak işaretlenmiş** skinleri kabul eder -- yani geçerli bir imzaya sahip olanları:

```java
// SkinManager.createLookup() -- basitleştirilmiş
PlayerSkin skin = optional
    .filter(ps -> !isRemote || ps.secure())  // ← uzaktaki oyuncular güvenli olmalı
    .orElse(defaultSkin);
```

Bu kontrol teoride spoofing'i engeller. Ama işte tam bu noktada işler ilginçleşiyor.

## Açık : imza replay

İstemci RSA imzasının **geçerli** olup olmadığını kontrol eder. Ama JSON içindeki `profileId`'nin oyuncunun gerçek UUID'siyle eşleşip eşleşmediğini **asla** kontrol etmez.

Başka bir deyişle: **var olan bir Mojang hesabından** (örneğin bir Mojang çalışanının hesabı) alınan bir `textures` özelliği herhangi bir başka oyuncuya replay edilebilir. İmza geçerlidir -- Mojang tarafından gerçekten üretilmiştir -- sadece başka bir hesaptan gelmektedir.

### Gerçek bir imza nasıl çıkarılır?

Jeb_'nin (UUID `853c80ef-3c37-49fd-aa49-938b674adae6`) Mojang Studios capesi var. Mojang oturum sunucusundan:

```bash
curl -s "https://sessionserver.mojang.com/session/minecraft/profile/853c80ef-3c37-49fd-aa49-938b674adae6?unsigned=false"
```

Yanıt:

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

Bu `value` alanının `signature`'ı Mojang tarafından üretilmiştir. RSA-2048 SHA-1'dir. Bunu başka bir UUID'de replay etsen bile **kesinlikle** geçerlidir -- çünkü Jeb_'nin imzası Jeb_'nin imzası olarak kalır ve istemci bunun **senin** olması gerektiğini asla kontrol etmez.

## Kod : mod nasıl çalışıyor?

`cape-mod` modu minicik -- 65 satır Java. İşte kalbi:

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

        // textures özelliğini Jeb_ninkiyle değiştir
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

**Adımlar**:
1. `Player.getGameProfile()` üzerinde **Mixin** -- oyuncu profilinin döndürüldüğü nokta
2. Bunun bir yerel sunucu (Integrated Server) olduğunu kontrol et
3. Host (LAN dünyası) olduğunu kontrol et
4. `textures` özelliğini Jeb_ninkiyle (hardcoded) **değiştir**
5. Enjekte edilmiş dokularla yeni bir `GameProfile` döndür

`GameProfile` **forged**'dir: gerçek oyuncuya uymayan yapay olarak oluşturulmuş bir profildir. `textures` özellikleri Jeb_'den **replay** edilmiştir -- RSA imzası gerçektir ama yanlış profile uygulanmıştır. Ağ paketinin kendisi meşrudur: sunucu normalde `ClientboundPlayerInfoUpdatePacket`'i bu değiştirilmiş profille gönderir. Forged olan profil, paket değil.

Host'un arkadaşları LAN üzerinden katıldığında, değiştirilmiş profille `ClientboundPlayerInfoUpdatePacket`'i alırlar. İstemci:
1. Base64 payload'u decode eder
2. RSA imzasını doğrular → ✅ geçerli (gerçekten Jeb_nin imzası)
3. Skin'i `secure=true` olarak işaretler (imza geçerli olduğu için)
4. `!isRemote || ps.secure()` filtresinden geçer → ✅ geçer
5. **Jeb_nin capesini indirir ve görüntüler**

## Oyunda sonuç : skininde cape

Oyunda böyle görünüyor. Önce hostta Jeb_nin capesinin görüntülendiği önden görünüm:

![Cape Mod -- Jeb_ capesi hostta görüntülenmiş](/images/cape-mod/cape-01-jeb-cape.png)

Resmi Mojang Studios capesinin kırmızı/beyaz deseni açıkça görülüyor. Kendi capesine sahip gerçek bir Jeb_'den hiçbir farkı yok -- istemci tamamen aynı dokuyu `textures.minecraft.net`'ten indiriyor.

Ve sürükleyici görünümde, gerçek bir oyunda:

![Cape Mod -- cape görünür şekilde oyun içi görünüm](/images/cape-mod/cape-02-lava-cape.png)

Cape oyuncunun arkasında dalgalanıyor, hareketle birlikte sallanıyor. Resmi capeli gerçek bir skin'den ayırt edilemez.

Başka bir açı, lav ve arazili bir dünyada:

![Cape Mod -- doğal ortamda cape](/images/cape-mod/cape-03-local-game.png)

Ve capenin aksiyonda görüldüğü gerçek oynanışa yakın bir çekim daha:

![Cape Mod -- klasik Minecraft oynanışında cape](/images/cape-mod/cape-04-real-gameplay.png)

Hostta bir mod olduğunu bilmeden LAN'a katılan biri için bunu gerçek bir Mojang capesinden ayırt etmenin kesinlikle hiçbir yolu yok. İşte püf nokta tam da bu: **imza geçerli**, istemcinin şüphelenmesi için hiçbir neden yok.

## Bu neden bir açık (ve neden değil)

İronik: exploit **tam da imza geçerli olduğu için** çalışıyor. Burada kriptografik bir bypass yok -- daha kötüsü, bu güven modelinde bir **mantıksal açık**.

| Kontrol | Sonuç |
|---|---|
| **RSA imzasının geçerliliği** | ✅ Geçerli (Mojang tarafından Jeb_ için imzalanmış) |
| **Payload'daki `profileId` host UUID'siyle eşleşiyor mu?** | ❌ Hayır (Jeb_'nin UUID'si ≠ host UUID'si) |
| **İstemci eşleşmeyi kontrol ediyor mu?** | ❌ **Hayır. Sadece RSA imzası kontrol ediliyor.** |

Minecraft **imzaya** güvenir, onu taşıyanın kimliğine değil. İmza Mojang'dan geldiği sürece istemci kabul eder. Bu, hükümet tarafından imzalanmış sahte bir pasaport göstermek gibi -- mühür geçerli, pasaport sana ait olmasa bile.

## Güvenlik etkileri

### LAN ile sınırlı kapsam

Mod yalnızca entegre sunucuda (LAN) çalışır. Saldırgan şunlara sahip olmalıdır:
- Kurulu bir Fabric modu
- Bir LAN dünyasının hostu olmak
- Arkadaşları modsuz bağlanır (vanilla)

### Ama olasılıklar genişliyor

Teoride, aynı teknikle şunlar yapılabilir:
- **Diğer imzalı verileri yeniden enjekte etmek**: heads, yasadışı büyüler, kötü niyetli sohbet bileşenleri
- **Bir LAN tüneliyle** (NGROK, playit.gg, Radmin VPN) birleştirerek internet üzerindeki oyuncuları etkilemek
- **Profille ilgili diğer imza bağımlı özelliklere** genişletmek

### Mojang neden muhtemelen yamamayacak

Kesin anlamda bir "güvenlik açığı" yok -- imza geçerli. Bunu düzeltmek Mojang'ın tüm kimlik doğrulama modelini değiştirmesini gerektirir ki bu karmaşıktır. Şimdilik bu bir edge case: LAN oyuncularının birbirine güvendiği varsayılır.

## Felsefi tuzak

Cape Mod, daha geniş bir gerçeğin mükemmel bir **proof of concept**'idir: **bir imzaya, onu kimin imzaladığını ve hangi konuda olduğunu kontrol etmeden asla güvenmemelisin.**

Bu temel kriptografi dersidir. RSA bir **mesajı** imzalar, bir **kimliği** değil. Sana Mojang'dan geçerli bir RSA imzası verirsem, Mojang'ın *bir şeyi* imzaladığını bilirsin. Kimin için olduğunu bilmezsin ve sadece mesaja bakarak bunu varsayamazsın.

2000'lerde CA'ların her şeyi kabul ettiği dönemde SSL/TLS sertifikalarında olan tam olarak buydu -- imza geçerliydi ama yanlış alana uygulanıyordu.

## Sonuç

Cape Mod klasik anlamda bir hack değil -- Minecraft'taki mantıksal doğrulama eksikliğinin zarif bir sömürüsüdür. Şunları gösterir:

1. **Geçerli bir imza, onu taşıyanın kimliğini garanti etmez**
2. **LAN'da güven sandığımızdan daha zayıftır**
3. **Minecraft'ın `textures` özellikleri aslında enjekte edilmiş içeriktir** -- onları taşıyan oyuncuya ait oldukları doğrulanmalıdır

"Bilinmeyen" (ya da daha doğrusu hostunda şüpheli bir mod olan) bir LAN dünyasına katılırsan, capeden çok önce bir güvenlik sorunun var demektir. Ama bu semptomatik: Minecraft bir LAN'daki herkesin birbirine güvendiğini varsayar. Bu doğru... ta ki doğru olmaktan çıkana kadar.

---

**Kaynaklar**

- **GitHub**: [fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **Minecraft auth**: [Yggdrasil protocol](https://wiki.vg/Authentication) (wiki.vg)
- **RSA cryptography**: [RFC 3447](https://tools.ietf.org/html/rfc3447) (PKCS #1)

**3 kilit nokta**

1. RSA imzaları bir mesajı doğrular, bir kimliği değil -- birçok sisteme pahalıya patlamış bir detay.
2. Minecraft, oyuncu profilinin aldığı imzayla eşleşip eşleşmediğini kontrol etmez -- kriptografik değil, mantıksal bir açık.
3. LAN'da veya tünelde, entegre sunucuyu kontrol eden bir mod için her şey açıktır.
