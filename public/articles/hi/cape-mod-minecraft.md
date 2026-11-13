---
title: "Cape Mod : RSA हस्ताक्षर इंजेक्शन से Jeb_ की केप चुराना"
description: "एक Fabric mod जो Minecraft के विश्वास तंत्र में तार्किक खामी का शोषण करता है : Mojang का वैध RSA हस्ताक्षर लेकिन गलत खाते पर फिर से चलाया गया। कोड की व्याख्या, सुरक्षा निहितार्थ और क्रिप्टोग्राफिक सबक।"
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
author_sig: "y3nmDWpMDpg5Q6W/AilV3HxtG2cdEuxhEgwZjj/l+2pjWGEUUS/NfBidtqcHGlAcZAgC5g2Q1qp2tizuBG+Nbw=="
---

# Cape Mod : RSA हस्ताक्षर इंजेक्शन से Jeb_ की केप चुराना

![alt text](assets/xbox-profile.png)

और अगर मैं तुम्हें कहूँ कि वैध RSA हस्ताक्षर ही काफी था, लेकिन **गलत खाते** के लिए, ताकि तुम्हारे दोस्त मानें कि तुम आधिकारिक Mojang केप पहनते हो ? `cape-mod` में स्वागत है, एक Fabric exploit जो दिखाता है कि Minecraft हस्ताक्षर पर भरोसा करते हुए यह जाँचना भूल जाता है कि जिस प्रोफाइल का वह है वह सच में तुम्हारा है।

## संदर्भ : Minecraft स्किन और केप कैसे प्रबंधित करता है

Java Edition में, एक सवाल शायद ही पूछा जाता है : **खिलाड़ी की स्किन और केप दिखाने की जिम्मेदारी किसकी है, क्लाइंट की या सर्वर की ?**

उत्तर सूक्ष्म है :

| घटक | कौन भेजता है ? | कौन डाउनलोड करता है ? |
|---|---|---|
| **स्किन टेक्सचर** | सर्वर हस्ताक्षरित URL भेजता है | क्लाइंट `textures.minecraft.net` से डाउनलोड करता है |
| **केप टेक्सचर** | सर्वर हस्ताक्षरित URL भेजता है | क्लाइंट `textures.minecraft.net` से डाउनलोड करता है |
| **`textures` गुण** | सर्वर Mojang प्रमाणीकरण से `GameProfile` भेजता है | क्लाइंट RSA हस्ताक्षर जाँचता है |

मुख्य बिंदु : सब कुछ `GameProfile` के `textures` नामक गुण में समाहित है। इस गुण में है :
- टेक्सचर URL के साथ base64 में JSON पेलोड
- Mojang की निजी कुंजी से बना **RSA हस्ताक्षर**

## RSA हस्ताक्षर की दीवार

हर `textures` गुण ऐसा दिखता है जब उसे डिकोड किया जाता है :

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

क्लाइंट jar में रखी **सार्वजनिक कुंजी** (`yggdrasil_session_pubkey.der`) के खिलाफ RSA हस्ताक्षर जाँचता है :

```java
// Property.java (authlib)
public boolean isSignatureValid(PublicKey publicKey) {
    Signature sig = Signature.getInstance("SHA1withRSA");
    sig.initVerify(publicKey);
    sig.update(this.value.getBytes());
    return sig.verify(Base64.decodeBase64(this.signature));
}
```

दूरस्थ खिलाड़ियों के लिए (स्थानीय खेल के बाहर), क्लाइंट सिर्फ **`secure` के रूप में चिह्नित** स्किन स्वीकार करता है, यानी वैध हस्ताक्षर वाली :

```java
// SkinManager.createLookup() , सरलीकृत
PlayerSkin skin = optional
    .filter(ps -> !isRemote || ps.secure())  // ← दूरस्थ खिलाड़ी सुरक्षित होने चाहिए
    .orElse(defaultSkin);
```

यह जाँच सिद्धांत में spoofing रोकती है। लेकिन सत्यापन वहीं रुकता है, और हमला ठीक वहीं शुरू होता है।

## खामी : हस्ताक्षर replay

क्लाइंट जाँचता है कि RSA हस्ताक्षर **वैध है**। वह व्यवस्थित रूप से यह जाँचना भूल जाता है कि JSON में समाहित `profileId` खिलाड़ी के असली UUID से मेल खाता है।

दूसरे शब्दों में : **मौजूदा Mojang खाते** (उदाहरण के लिए किसी Mojang कर्मचारी का) से ली गई `textures` गुण किसी भी अन्य खिलाड़ी पर replay की जा सकती है। हस्ताक्षर वैध रहता है, यह सच में Mojang द्वारा बनाया गया था, यह बस दूसरे खाते से आया है।

### असली हस्ताक्षर कैसे निकालें ?

Jeb_ (UUID `853c80ef-3c37-49fd-aa49-938b674adae6`) के पास Mojang Studios केप है। Mojang सत्र सर्वर से :

```bash
curl -s "https://sessionserver.mojang.com/session/minecraft/profile/853c80ef-3c37-49fd-aa49-938b674adae6?unsigned=false"
```

उत्तर :

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

इस `value` फ़ील्ड का `signature` Mojang द्वारा बनाया गया था। यह RSA-2048 SHA-1 है। यह **बिल्कुल** वैध है, भले ही तुम इसे दूसरे UUID पर replay करो, क्योंकि Jeb_ का हस्ताक्षर Jeb_ का हस्ताक्षर रहता है, और क्लाइंट यह नियंत्रित करना भूल जाता है कि यह किसके लिए था।

## कोड : mod कैसे काम करता है

`cape-mod` mod छोटा है, 65 पंक्तियों का Java। यहाँ हृदय है :

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

        // textures गुण को Jeb_ वाले से बदलता है
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

**चरण** :
1. `Player.getGameProfile()` पर **Mixin**, वह बिंदु जहाँ खिलाड़ी का प्रोफाइल लौटाया जाता है
2. जाँचता है कि यह स्थानीय सर्वर है (Integrated Server)
3. जाँचता है कि यह host है (LAN world)
4. `textures` गुण को Jeb_ वाले से **बदलता** है (hardcoded)
5. इंजेक्ट किए टेक्सचर के साथ नया `GameProfile` लौटाता है

इसलिए `GameProfile` **जाली** है : यह कृत्रिम रूप से बनाया गया प्रोफाइल है, जो असली खिलाड़ी से मेल नहीं खाता। `textures` गुण Jeb_ से **replay** किए गए हैं, RSA हस्ताक्षर प्रामाणिक है लेकिन गलत प्रोफाइल पर लगाया गया। नेटवर्क पैकेट, अपनी ओर से, वैध है : सर्वर सामान्य रूप से संशोधित प्रोफाइल के साथ `ClientboundPlayerInfoUpdatePacket` भेजता है। प्रोफाइल जाली है ; पैकेट वैध रहता है।

जब host के दोस्त LAN से जुड़ते हैं, तो उन्हें संशोधित प्रोफाइल के साथ `ClientboundPlayerInfoUpdatePacket` मिलता है। क्लाइंट :
1. base64 पेलोड डिकोड करता है
2. RSA हस्ताक्षर जाँचता है → ✅ वैध (यह सच में Jeb_ वाला है)
3. स्किन को `secure=true` चिह्नित करता है (क्योंकि हस्ताक्षर वैध है)
4. `!isRemote || ps.secure()` फ़िल्टर पास करता है → ✅ पास
5. **Jeb_ की केप डाउनलोड और प्रदर्शित करता है**

## खेल में परिणाम : तुम्हारी स्किन पर केप

यह in-game ऐसा दिखता है। पहले, host पर प्रदर्शित Jeb_ केप के साथ सामने का दृश्य :

![Cape Mod -- host पर प्रदर्शित Jeb_ केप](/images/cape-mod/cape-01-jeb-cape.png)

आधिकारिक Mojang Studios केप का लाल/सफेद पैटर्न स्पष्ट दिखता है। रेंडर बिल्कुल वैसा रहता है जैसे अपनी केप पहने असली Jeb_ का, क्लाइंट `textures.minecraft.net` से बिल्कुल वही टेक्सचर डाउनलोड करता है।

और immersive दृश्य में, असली खेल में :

![Cape Mod -- केप दिखती हुई खेल दृश्य](/images/cape-mod/cape-02-lava-cape.png)

केप खिलाड़ी के पीछे तैरती है, गति के साथ लहराती है। प्रामाणिक आधिकारिक केप वाली स्किन से पूरी तरह अप्रभेद्य।

दूसरा कोण, लावा और भूभाग वाली दुनिया में :

![Cape Mod -- प्राकृतिक वातावरण में केप](/images/cape-mod/cape-03-local-game.png)

और असली गेमप्ले का आखिरी close दृश्य, जहाँ केप क्रिया में दिखती है :

![Cape Mod -- क्लासिक Minecraft गेमप्ले में केप](/images/cape-mod/cape-04-real-gameplay.png)

किसी के लिए जो LAN से जुड़े host mod इस्तेमाल करता है यह जाने बिना, केप दृष्टिगत रूप से असली Mojang केप जैसी रहती है। यही ठीक बिंदु है : **हस्ताक्षर वैध है**, इसलिए क्लाइंट इसे वैध मानता है।

## यह खामी क्यों है (और क्यों नहीं है)

यह विडंबना है : exploit **ठीक इसलिए काम करता है क्योंकि हस्ताक्षर वैध है**। यह क्रिप्टोग्राफिक bypass से कुछ और है, यह बदतर है : विश्वास मॉडल में **तार्किक खामी**।

| जाँच | परिणाम |
|---|---|
| **RSA हस्ताक्षर वैधता** | ✅ वैध (Jeb_ के लिए Mojang द्वारा हस्ताक्षरित) |
| **पेलोड में `profileId` host के UUID से मेल खाता है ?** | ❌ नहीं (Jeb_ का UUID ≠ host का UUID) |
| **क्या क्लाइंट मेल जाँचता है ?** | ❌ **नहीं। सिर्फ RSA हस्ताक्षर जाँचा जाता है।** |

Minecraft उसे पहनने वाले की पहचान के बजाय **हस्ताक्षर** पर भरोसा करता है। जब तक हस्ताक्षर Mojang से आता है, क्लाइंट स्वीकार करता है। यह सरकार द्वारा हस्ताक्षरित नकली पासपोर्ट दिखाने जैसा है, मुहर वैध है, भले ही पासपोर्ट तुम्हारा न हो।

## सुरक्षा निहितार्थ

### LAN तक सीमित दायरा

mod सिर्फ एकीकृत सर्वर (LAN) पर काम करता है। हमलावर को चाहिए :
- स्थापित Fabric mod
- LAN दुनिया का host होना
- उसके दोस्त बिना mod (vanilla) जुड़ते हैं

### लेकिन संभावनाएँ बढ़ती हैं

सिद्धांत में, उसी तकनीक से, किया जा सकता है :
- **अन्य हस्ताक्षरित डेटा फिर से डालना** : heads, अवैध enchantment, दुर्भावनापूर्ण चैट घटक
- LAN सुरंग (NGROK, playit.gg, Radmin VPN) के साथ **जोड़ना** ताकि इंटरनेट पर खिलाड़ी प्रभावित हों
- प्रोफाइल के **अन्य गुणों तक बढ़ाना** जो हस्ताक्षरों पर निर्भर हैं

### Mojang शायद पैच क्यों नहीं करेगा

यह कड़े अर्थ में "भेद्यता" से कुछ और है, हस्ताक्षर वैध है। इसे पैच करने के लिए Mojang को पूरा प्रमाणीकरण मॉडल बदलना होगा, जो जटिल है। फिलहाल, यह सीमांत मामला है : LAN खिलाड़ियों को एक दूसरे पर भरोसा करना माना जाता है।

## दार्शनिक जाल

Cape Mod व्यापक सत्य का उत्कृष्ट **proof of concept** है : **तुम्हें हमेशा जाँचना चाहिए कि डेटा किसने हस्ताक्षरित किया और किस विषय के लिए, उस पर भरोसा करने से पहले**।

यह बुनियादी क्रिप्टोग्राफी सबक है। RSA **संदेश** हस्ताक्षर करता है ; प्राप्तकर्ता की **पहचान** हस्ताक्षर के बाहर रहती है। अगर मैं तुम्हें Mojang का वैध RSA हस्ताक्षर दूँ, तो तुम सिर्फ जानते हो कि Mojang ने *कुछ* हस्ताक्षरित किया, सिर्फ संदेश से प्राप्तकर्ता का कोई विश्वसनीय संकेत नहीं।

2000 के दशक में SSL/TLS प्रमाणपत्रों के साथ ठीक यही हुआ था जब CA डोमेन सही से जाँचे बिना प्रमाणपत्र हस्ताक्षर करते थे, हस्ताक्षर वैध था, लेकिन वह गलत डोमेन पर लागू होता था।

## निष्कर्ष

Cape Mod क्लासिक अर्थ में hack से कुछ और है, यह Minecraft में तार्किक सत्यापन कमी का सुरुचिपूर्ण शोषण है। यह दिखाता है कि :

1. **वैध हस्ताक्षर उसे पहनने वाले की पहचान गारंटी नहीं करता**
2. **LAN में, विश्वास** सोचे से कमजोर है
3. **Minecraft के `textures` गुण अनिवार्य रूप से इंजेक्ट की गई सामग्री हैं**, जाँचना चाहिए कि वे उन्हें पहनने वाले खिलाड़ी से मेल खाते हैं

अगर तुम "अज्ञात" दुनिया (या बल्कि, जिसका host संदिग्ध mod रखता है) में LAN दुनिया से जुड़ते हो, तो केप से बहुत पहले तुम्हें सुरक्षा समस्या है। लेकिन यह खुलासा करता है : Minecraft मानता है कि LAN पर सब एक दूसरे पर भरोसा करते हैं। यह सच है... पहले host तक जो इस विश्वास का दुरुपयोग करता है।

---

**संसाधन**

- **GitHub**: [fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **Minecraft auth**: [Yggdrasil protocol](https://wiki.vg/Authentication) (wiki.vg)
- **RSA क्रिप्टोग्राफी**: [RFC 3447](https://tools.ietf.org/html/rfc3447) (PKCS #1)

**3 मुख्य बिंदु**

1. RSA हस्ताक्षर पहचान के बजाय संदेश मान्य करते हैं, एक विवरण जो कई तंत्रों को महँगा पड़ा।
2. Minecraft यह जाँचना भूल जाता है कि खिलाड़ी का प्रोफाइल उसे मिले हस्ताक्षर से मेल खाता है, सत्यापन में तार्किक खामी, क्रिप्टोग्राफी अक्षुण्ण।
3. LAN या सुरंग में, mod के लिए सब खुला है जो एकीकृत सर्वर नियंत्रित करता है।
