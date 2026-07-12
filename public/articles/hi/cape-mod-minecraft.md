---
itle: "Cape Mod : RSA हस्ताक्षर इंजेक्शन से Jeb_ की केप कैसे चुराएं"
description: "एक Fabric मॉड जो Minecraft के विश्वास मॉडल में एक तार्किक खामी का शोषण करता है : Mojang का एक वैध RSA हस्ताक्षर लेकिन गलत खाते पर रीप्ले किया गया। कोड स्पष्टीकरण, सुरक्षा निहितार्थ और क्रिप्टोग्राफ़िक सबक।"
date: 2026-07-11authors:
  - fox3000foxy
tags:
  - minecraft
  - fabric
  - java
  - security
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "BflWK1VjdBXYMzGGhWRqu+P32l8oYrNZ9kX569xMf52OWMlvYR/dTlhOwdX5D9bExKhkkszcFH26AvrcbHv1ZA=="
---

# Cape Mod : RSA हस्ताक्षर इंजेक्शन से Jeb_ की केप कैसे चुराएं

![alt text](assets/xbox-profile.png)
क्या होगा अगर मैं तुमसे कहूँ कि बस एक वैध RSA हस्ताक्षर -- लेकिन **गलत खाते** के लिए -- तुम्हारे दोस्तों को यकीन दिलाने के लिए काफी है कि तुम Mojang की आधिकारिक केप पहन रहे हो? आओ मिलते हैं `cape-mod` से, एक Fabric एक्सप्लॉइट जो दिखाता है कि Minecraft बिना यह जाँचे हस्ताक्षर पर भरोसा कैसे करता है कि जिस प्रोफ़ाइल से वह संबंधित है वह वास्तव में तुम्हारी है।

## संदर्भ : Minecraft स्किन और केप कैसे प्रबंधित करता है

Java Edition में, एक सवाल है जो हम अक्सर नहीं पूछते : **कौन जिम्मेदार है कि खिलाड़ी की स्किन और केप प्रदर्शित हो -- क्लाइंट या सर्वर?**

जवाब बारीक है :

| घटक | कौन भेजता है? | कौन डाउनलोड करता है? |
|---|---|---|
| **स्किन टेक्सचर** | सर्वर हस्ताक्षरित URL भेजता है | क्लाइंट `textures.minecraft.net` से डाउनलोड करता है |
| **केप टेक्सचर** | सर्वर हस्ताक्षरित URL भेजता है | क्लाइंट `textures.minecraft.net` से डाउनलोड करता है |
| **`textures` प्रॉपर्टी** | सर्वर Mojang ऑथ से `GameProfile` भेजता है | क्लाइंट RSA हस्ताक्षर सत्यापित करता है |

मुख्य बिंदु : सब कुछ `GameProfile` की `textures` नामक प्रॉपर्टी में समाहित है। इस प्रॉपर्टी में शामिल है :
- टेक्सचर URLs के साथ एक base64 JSON payload
- Mojang की निजी कुंजी से बना एक **RSA हस्ताक्षर**

## RSA हस्ताक्षर की दीवार

हर `textures` प्रॉपर्टी डिकोड करने पर ऐसी दिखती है :

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

क्लाइंट jar में एम्बेडेड **सार्वजनिक कुंजी** (`yggdrasil_session_pubkey.der`) के विरुद्ध RSA हस्ताक्षर सत्यापित करता है :

```java
// Property.java (authlib)
public boolean isSignatureValid(PublicKey publicKey) {
    Signature sig = Signature.getInstance("SHA1withRSA");
    sig.initVerify(publicKey);
    sig.update(this.value.getBytes());
    return sig.verify(Base64.decodeBase64(this.signature));
}
```

दूरस्थ खिलाड़ियों (लोकल नहीं) के लिए, क्लाइंट केवल उन स्किन को स्वीकार करता है जो **`secure` के रूप में चिह्नित** हैं -- यानी वैध हस्ताक्षर के साथ :

```java
// SkinManager.createLookup() -- सरलीकृत
PlayerSkin skin = optional
    .filter(ps -> !isRemote || ps.secure())  // ← दूरस्थ खिलाड़ियों को सुरक्षित होना चाहिए
    .orElse(defaultSkin);
```

यह जाँच सैद्धांतिक रूप से स्पूफिंग को रोकती है। लेकिन यहीं चीज़ें दिलचस्प हो जाती हैं।

## खामी : हस्ताक्षर रीप्ले

क्लाइंट जाँचता है कि RSA हस्ताक्षर **वैध** है। लेकिन वह **कभी नहीं** जाँचता कि JSON में मौजूद `profileId` खिलाड़ी के वास्तविक UUID से मेल खाता है या नहीं।

दूसरे शब्दों में : किसी **मौजूदा Mojang खाते** (जैसे किसी Mojang कर्मचारी के खाते) से ली गई `textures` प्रॉपर्टी किसी भी अन्य खिलाड़ी पर रीप्ले की जा सकती है। हस्ताक्षर वैध रहता है -- यह वास्तव में Mojang द्वारा बनाया गया था -- यह बस किसी दूसरे खाते से आया है।

### असली हस्ताक्षर कैसे निकालें?

Jeb_ (UUID `853c80ef-3c37-49fd-aa49-938b674adae6`) के पास Mojang Studios केप है। Mojang सत्र सर्वर से :

```bash
curl -s "https://sessionserver.mojang.com/session/minecraft/profile/853c80ef-3c37-49fd-aa49-938b674adae6?unsigned=false"
```

जवाब :

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

इस `value` फ़ील्ड का `signature` Mojang द्वारा बनाया गया है। यह RSA-2048 SHA-1 है। यह **पूरी तरह** वैध है, भले ही तुम इसे किसी दूसरे UUID पर रीप्ले करो -- क्योंकि Jeb_ का हस्ताक्षर Jeb_ का ही हस्ताक्षर रहता है, और क्लाइंट कभी जाँच नहीं करता कि यह **तुम्हारा** होना चाहिए।

## कोड : मॉड कैसे काम करता है

`cape-mod` मॉड बहुत छोटा है -- Java की 65 पंक्तियाँ। यहाँ मुख्य भाग है :

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

        // Jeb_ की textures प्रॉपर्टी से बदलें
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
1. `Player.getGameProfile()` पर **Mixin** -- वह बिंदु जहाँ खिलाड़ी का प्रोफ़ाइल लौटाया जाता है
2. जाँचता है कि यह एक स्थानीय सर्वर (Integrated Server) है
3. जाँचता है कि यह होस्ट (LAN वर्ल्ड) है
4. `textures` प्रॉपर्टी को Jeb_ की (हार्डकोडेड) से **बदलता** है
5. इंजेक्टेड टेक्सचर के साथ एक नया `GameProfile` लौटाता है

`GameProfile` इस प्रकार **जाली** है : यह एक कृत्रिम रूप से बनाया गया प्रोफ़ाइल है, जो असली खिलाड़ी से मेल नहीं खाता। `textures` प्रॉपर्टी Jeb_ से **रीप्ले** की गई है -- RSA हस्ताक्षर प्रामाणिक है लेकिन गलत प्रोफ़ाइल पर लागू किया गया है। नेटवर्क पैकेट, हालांकि, वैध है : सर्वर सामान्य रूप से इस संशोधित प्रोफ़ाइल के साथ `ClientboundPlayerInfoUpdatePacket` भेजता है। जाली प्रोफ़ाइल है, पैकेट नहीं।

जब होस्ट के दोस्त LAN के माध्यम से जुड़ते हैं, तो उन्हें संशोधित प्रोफ़ाइल के साथ `ClientboundPlayerInfoUpdatePacket` प्राप्त होता है। क्लाइंट :
1. base64 payload डिकोड करता है
2. RSA हस्ताक्षर सत्यापित करता है → ✅ वैध (यह वास्तव में Jeb_ का है)
3. स्किन को `secure=true` चिह्नित करता है (क्योंकि हस्ताक्षर वैध है)
4. फ़िल्टर `!isRemote || ps.secure()` पास करता है → ✅ पास
5. **Jeb_ की केप डाउनलोड और प्रदर्शित करता है**

## खेल में परिणाम : तुम्हारी स्किन पर केप

यहाँ देखो यह इन-गेम कैसा दिखता है। पहले, होस्ट पर Jeb_ की केप दिखाने वाला सामने का दृश्य :

![Cape Mod -- Jeb_ केप होस्ट पर प्रदर्शित](/images/cape-mod/cape-01-jeb-cape.png)

आधिकारिक Mojang Studios केप का लाल/सफेद पैटर्न साफ दिखता है। एक वास्तविक Jeb_ से कोई अंतर नहीं जिसके पास अपनी केप होगी -- क्लाइंट बिल्कुल वही टेक्सचर `textures.minecraft.net` से डाउनलोड करता है।

और इमर्सिव दृश्य में, एक वास्तविक गेम में :

![Cape Mod -- केप के साथ इन-गेम दृश्य](/images/cape-mod/cape-02-lava-cape.png)

केप खिलाड़ी के पीछे लहराती है, हरकत के साथ हिलती है। आधिकारिक केप वाली प्रामाणिक स्किन से पूरी तरह अविभेद्य।

दूसरा कोण, लावा और इलाके वाली दुनिया में :

![Cape Mod -- प्राकृतिक वातावरण में केप](/images/cape-mod/cape-03-local-game.png)

और एक अंतिम नज़दीकी दृश्य वास्तविक गेमप्ले का, जहाँ केप एक्शन में दिखती है :

![Cape Mod -- क्लासिक Minecraft गेमप्ले में केप](/images/cape-mod/cape-04-real-gameplay.png)

जो कोई बिना यह जाने LAN में शामिल होता है कि होस्ट के पास मॉड है, उसके लिए इसे असली Mojang केप से अलग करने का बिल्कुल कोई तरीका नहीं है। यही सटीक बात है : **हस्ताक्षर वैध है**, क्लाइंट के पास संदेह करने का कोई कारण नहीं है।

## यह खामी क्यों है (और क्यों नहीं है)

व्यंग्यात्मक बात : एक्सप्लॉइट **ठीक इसलिए काम करता है क्योंकि हस्ताक्षर वैध है**। यहाँ कोई क्रिप्टोग्राफ़िक बाइपास नहीं है -- यह उससे भी बुरा है, यह विश्वास मॉडल में एक **तार्किक खामी** है।

| जाँच | परिणाम |
|---|---|
| **RSA हस्ताक्षर की वैधता** | ✅ वैध (Mojang द्वारा Jeb_ के लिए हस्ताक्षरित) |
| **क्या payload में `profileId` होस्ट के UUID से मेल खाता है?** | ❌ नहीं (Jeb_ का UUID ≠ होस्ट का UUID) |
| **क्या क्लाइंट मिलान की जाँच करता है?** | ❌ **नहीं। केवल RSA हस्ताक्षर सत्यापित किया जाता है।** |

Minecraft **हस्ताक्षर** पर भरोसा करता है, उसे धारण करने वाले की पहचान पर नहीं। जब तक हस्ताक्षर Mojang से आता है, क्लाइंट उसे स्वीकार करता है। यह सरकार द्वारा हस्ताक्षरित नकली पासपोर्ट दिखाने जैसा है -- मुहर वैध है, भले ही पासपोर्ट तुम्हारा न हो।

## सुरक्षा निहितार्थ

### LAN तक सीमित दायरा

मॉड केवल एकीकृत सर्वर (LAN) पर काम करता है। हमलावर को चाहिए :
- Fabric मॉड इंस्टॉल हो
- LAN वर्ल्ड का होस्ट हो
- उसके दोस्त बिना मॉड (वैनिला) जुड़ें

### लेकिन संभावनाएँ बढ़ती हैं

सैद्धांतिक रूप से, उसी तकनीक से, हम यह कर सकते हैं :
- **अन्य हस्ताक्षरित डेटा रीइंजेक्ट करना** : हेड, अवैध एन्चैंटमेंट, दुर्भावनापूर्ण चैट घटक
- **LAN टनल** (NGROK, playit.gg, Radmin VPN) के साथ जोड़कर इंटरनेट पर खिलाड़ियों को प्रभावित करना
- प्रोफ़ाइल के **अन्य गुणों** तक विस्तार करना जो हस्ताक्षर पर निर्भर करते हैं

### Mojang शायद पैच क्यों नहीं करेगा

सख्त अर्थों में कोई "भेद्यता" नहीं है -- हस्ताक्षर वैध है। इसे पैच करने के लिए Mojang को पूर्ण प्रमाणीकरण मॉडल बदलना होगा, जो जटिल है। फिलहाल, यह एक एज केस है : LAN खिलाड़ियों से एक-दूसरे पर भरोसा करने की अपेक्षा की जाती है।

## दार्शनिक जाल

Cape Mod एक व्यापक सत्य का एक उत्कृष्ट **प्रूफ ऑफ कॉन्सेप्ट** है : **तुम्हें कभी भी बिना यह जाँचे कि किसने और किस विषय पर हस्ताक्षर किया है, हस्ताक्षर पर भरोसा नहीं करना चाहिए**।

यह बुनियादी क्रिप्टोग्राफी का सबक है। RSA एक **संदेश** पर हस्ताक्षर करता है, **पहचान** पर नहीं। अगर मैं तुम्हें Mojang का एक वैध RSA हस्ताक्षर दूँ, तो तुम जानते हो कि Mojang ने *किसी चीज़* पर हस्ताक्षर किया है। तुम नहीं जानते कि किसके लिए, और तुम केवल संदेश देखकर यह नहीं मान सकते।

ठीक यही 2000 के दशक में SSL/TLS प्रमाणपत्रों के साथ हुआ था जब CAs कुछ भी स्वीकार कर लेते थे -- हस्ताक्षर वैध था, लेकिन वह गलत डोमेन पर लागू होता था।

## निष्कर्ष

Cape Mod शास्त्रीय अर्थों में हैक नहीं है -- यह Minecraft में तार्किक सत्यापन की कमी का एक सुरुचिपूर्ण शोषण है। यह दिखाता है कि :

1. **एक वैध हस्ताक्षर उसे धारण करने वाले की पहचान की गारंटी नहीं देता**
2. **LAN पर, भरोसा हमारी सोच से कमज़ोर है**
3. **Minecraft की `textures` प्रॉपर्टी अनिवार्य रूप से इंजेक्टेड सामग्री है** -- यह सुनिश्चित करना आवश्यक है कि वे उस खिलाड़ी से मेल खाती हों जो उन्हें धारण कर रहा है

अगर तुम किसी "अज्ञात" सर्वर पर LAN वर्ल्ड में शामिल होते हो (या यूँ कहें, जिसके होस्ट के पास संदिग्ध मॉड है), तो केप से बहुत पहले ही तुम्हें सुरक्षा समस्या है। लेकिन यह लक्षणात्मक है : Minecraft मानता है कि LAN पर हर कोई एक-दूसरे पर भरोसा करता है। यह सच है... जब तक सच न रहे।

---

**संसाधन**

- **GitHub**: [fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **Minecraft ऑथ**: [Yggdrasil प्रोटोकॉल](https://wiki.vg/Authentication) (wiki.vg)
- **RSA क्रिप्टोग्राफी**: [RFC 3447](https://tools.ietf.org/html/rfc3447) (PKCS #1)

**3 मुख्य बिंदु**

1. RSA हस्ताक्षर एक संदेश को मान्य करते हैं, पहचान को नहीं -- एक विवरण जिसने कई सिस्टमों को भारी नुकसान पहुँचाया है।
2. Minecraft यह नहीं जाँचता कि खिलाड़ी का प्रोफ़ाइल उसे मिले हस्ताक्षर से मेल खाता है या नहीं -- एक तार्किक खामी, क्रिप्टोग्राफ़िक नहीं।
3. LAN या टनल में, एक मॉड जो एकीकृत सर्वर को नियंत्रित करता है, उसके लिए सब कुछ खुला है।
