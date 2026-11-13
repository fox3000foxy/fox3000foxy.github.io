---
title: "Cape Mod : كيف تسرق cape الخاص بـJeb_ بحقن توقيع RSA"
description: "مود Fabric يستغل ثغرة منطقية في نظام ثقة Minecraft : توقيع RSA صالح من Mojang لكن مُعاد تشغيله على حساب خطأ. شرح الكود والآثار الأمنية والدروس التشفيرية."
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
author_sig: "Jb2NK2RA32MtkZX7y6Ah1bpCwa2LmodbpBdx2jirhm0wpagmrNvnjaQgnRoM1TTuicWnr6VEE0WDdaD7CUP0DA=="
---

# Cape Mod : كيف تسرق cape الخاص بـJeb_ بحقن توقيع RSA

![alt text](assets/xbox-profile.png)

وماذا لو قلت لك أنه يكفي توقيع RSA صالح، لكن للحساب **الخطأ**، لتوهم أصدقاءك أنك تحمل cape الرسمية لـMojang ؟ مرحبا بك في `cape-mod`، استغلال Fabric يوضح كيف تثق Minecraft بتوقيع بينما تغفل التحقق من أن الملف الذي ينتمي له هو فعلا ملفك.

## السياق : كيف تدير Minecraft الـskins والـcapes

في Java Edition، هناك سؤال نادر الطرح : **من المسؤول عن عرض skin وcape لاعب، العميل أم الخادم ؟**

الجواب دقيق :

| المكوّن | من يرسله ؟ | من ينزّله ؟ |
|---|---|---|
| **قوام skin** | الخادم يرسل الرابط الموقَّع | العميل ينزّل من `textures.minecraft.net` |
| **قوام cape** | الخادم يرسل الرابط الموقَّع | العميل ينزّل من `textures.minecraft.net` |
| **خاصية `textures`** | الخادم يرسل `GameProfile` من مصادقة Mojang | العميل يتحقق من توقيع RSA |

النقطة الأساسية : كل شيء محتوى في خاصية تسمى `textures` من `GameProfile`. تحوي هذه الخاصية :
- حمولة JSON بترميز base64 مع روابط القوام
- **توقيع RSA** مصنوع بمفتاح Mojang الخاص

## جدار توقيع RSA

تبدو كل خاصية `textures` هكذا عند فك ترميزها :

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

يتحقق العميل من توقيع RSA مقابل **المفتاح العام المضمَّن في jar** (`yggdrasil_session_pubkey.der`) :

```java
// Property.java (authlib)
public boolean isSignatureValid(PublicKey publicKey) {
    Signature sig = Signature.getInstance("SHA1withRSA");
    sig.initVerify(publicKey);
    sig.update(this.value.getBytes());
    return sig.verify(Base64.decodeBase64(this.signature));
}
```

بالنسبة للاعبين البعيدين (خارج اللعب المحلي)، يقبل العميل فقط skins **الموسومة `secure`**، أي ذات توقيع صالح :

```java
// SkinManager.createLookup()، مبسطة
PlayerSkin skin = optional
    .filter(ps -> !isRemote || ps.secure())  // ← اللاعبون البعيدون يجب أن يكونوا آمنين
    .orElse(defaultSkin);
```

يحجب هذا الفحص التزوير نظريا. لكن التحقق يتوقف هنا، وهنا بالضبط يبدأ الهجوم.

## الثغرة : إعادة تشغيل توقيع

يتحقق العميل أن توقيع RSA **صالح**. ويغفل منهجيا التحقق من أن `profileId` المحتوى في JSON يطابق UUID الحقيقي للاعب.

بعبارة أخرى : خاصية `textures` مأخوذة من **حساب Mojang موجود** (مثلا حساب موظف Mojang) يمكن إعادة تشغيلها على أي لاعب آخر. يبقى التوقيع صالحا، فقد أنتجته Mojang فعلا، لكنه قادم من حساب آخر.

### كيف تُستخرَج توقيع حقيقي ؟

يملك Jeb_ (UUID `853c80ef-3c37-49fd-aa49-938b674adae6`) cape الخاصة بـMojang Studios. من خادم جلسات Mojang :

```bash
curl -s "https://sessionserver.mojang.com/session/minecraft/profile/853c80ef-3c37-49fd-aa49-938b674adae6?unsigned=false"
```

الرد :

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

أنتجت Mojang `signature` حقل `value` هذا. إنه RSA-2048 SHA-1. إنه **صالح تماما**، حتى لو أعدت تشغيله على UUID آخر، لأن توقيع Jeb_ يبقى توقيع Jeb_، ويغفل العميل التحقق لمن كان مقصودا.

## الكود : كيف يعمل المود

مود `cape-mod` ضئيل، 65 سطرا من Java. إليكم القلب :

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

        // يستبدل خاصية textures بتلك الخاصة بـJeb_
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

**الخطوات** :
1. **Mixin** على `Player.getGameProfile()`، النقطة التي يُعاد فيها ملف اللاعب
2. يتحقق أنه خادم محلي (Integrated Server)
3. يتحقق أنه المضيف (عالم LAN)
4. **يستبدل** خاصية `textures` بتلك الخاصة بـJeb_ (مُرمَّزة صلبا)
5. يعيد `GameProfile` جديدا مع القوام المحقونة

إذن `GameProfile` **مزوَّر** : ملف مبني اصطناعيا، لا يطابق اللاعب الحقيقي. خاصيتا `textures` **مُعاد تشغيلهما** من Jeb_، فتوقيع RSA أصيل لكن مطبق على الملف الخطأ. أما حزمة الشبكة فشرعية : يرسل الخادم عاديا `ClientboundPlayerInfoUpdatePacket` مع هذا الملف المعدل. الملف هو المزوَّر ؛ والحزمة تبقى شرعية.

عندما ينضم أصدقاء المضيف عبر LAN، يستلمون `ClientboundPlayerInfoUpdatePacket` مع الملف المعدل. العميل :
1. يفك ترميز حمولة base64
2. يتحقق من توقيع RSA ← ✅ صالح (إنه فعلا توقيع Jeb_)
3. يسم الـskin كـ`secure=true` (لأن التوقيع صالح)
4. يجتاز المرشح `!isRemote || ps.secure()` ← ✅ يجتاز
5. **ينزّل ويعرض cape الخاص بـJeb_**

## النتيجة في اللعبة : cape على skin خاصتك

إليكم ما يعطيه في اللعبة. أولا، منظر أمامي مع cape الخاص بـJeb_ معروضة على المضيف :

![Cape Mod -- Jeb_ cape affichée sur le host](/images/cape-mod/cape-01-jeb-cape.png)

نرى بوضوح نقش cape الرسمية الحمراء/البيضاء الخاصة بـMojang Studios. يبقى العرض مطابقا لعرض Jeb_ حقيقي يحمل cape خاصته، فالعميل ينزّل نفس القوام بالضبط من `textures.minecraft.net`.

ومنظر غامر، في مباراة حقيقية :

![Cape Mod -- vue en jeu avec cape visible](/images/cape-mod/cape-02-lava-cape.png)

تطفو cape خلف اللاعب، وتتموج مع الحركة. غير قابلة للتمييز تماما عن skin أصيل مع cape رسمية.

زاوية أخرى، في عالم مع حمم وتضاريس :

![Cape Mod -- cape dans un environnement naturel](/images/cape-mod/cape-03-local-game.png)

ونظرة أخيرة مقربة للعب الحقيقي، حيث نرى cape أثناء العمل :

![Cape Mod -- cape en gameplay classique Minecraft](/images/cape-mod/cape-04-real-gameplay.png)

لشخص ينضم إلى LAN جاهلا أن المضيف يستخدم مودا، تبقى cape مطابقة بصريا لـcape حقيقية من Mojang. وهذه هي النقطة بالضبط : **التوقيع صالح**، فيعاملها العميل كشرعية.

## لماذا هي ثغرة (ولماذا ليست واحدة)

من المفارقة : يعمل الاستغلال **لأن التوقيع صالح بالضبط**. إنه شيء آخر غير تجاوز تشفيري، بل أسوأ : **ثغرة منطقية** في نموذج الثقة.

| الفحص | النتيجة |
|---|---|
| **صلاحية توقيع RSA** | ✅ صالح (موقَّع من Mojang لـJeb_) |
| **هل `profileId` في الحمولة يطابق UUID المضيف ؟** | ❌ لا (UUID الخاص بـJeb_ ≠ UUID المضيف) |
| **هل يتحقق العميل من التطابق ؟** | ❌ **لا. وحده توقيع RSA يُتحقَّق.** |

تثق Minecraft **بالتوقيع** بدلا من هوية حامله. ما دام التوقيع من Mojang، يقبله العميل. كإظهار جواز مزيف موقَّع من الحكومة، فالختم شرعي، حتى لو لم يكن الجواز لك.

## الآثار الأمنية

### نطاق محدود بـLAN

يعمل المود فقط على خادم مدمج (LAN). يجب على المهاجم :
- امتلاك مود Fabric مثبت
- أن يكون مضيف عالم LAN
- أصدقاؤه يتصلون دون مود (vanilla)

### لكن الاحتمالات تتسع

نظريا، بنفس التقنية، يمكن :
- **إعادة حقن بيانات موقعة أخرى** : رؤوس وتعاويذ غير قانونية ومكونات دردشة خبيثة
- **الدمج مع نفق LAN** (NGROK وplayit.gg وRadmin VPN) للتأثير على لاعبين على الإنترنت
- **التوسع لخصائص أخرى** من الملف تعتمد على توقيعات

### لماذا لن تصحح Mojang غالبا

إنه شيء آخر غير "ثغرة" بالمعنى الدقيق، فالتوقيع صالح. يتطلب تصحيح ذلك من Mojang تعديل نموذج المصادقة الكامل، وهذا معقد. حاليا، إنها حالة حدية : يُفترَض أن يثق لاعبو LAN ببعضهم.

## الفخ الفلسفي

Cape Mod إثبات مفهوم ممتاز لحقيقة أوسع : **يجب دائما التحقق من وقّع بيانة ولأي موضوع قبل الوثوق بها**.

إنه درس في التشفير الأساسي. يوقّع RSA **رسالة** ؛ وتبقى هوية المتلقي خارج التوقيع. إذا أعطيتك توقيع RSA صالحا من Mojang، تعرف فقط أن Mojang وقّعت *شيئا ما*، دون دلالة موثوقة على المتلقي من الرسالة وحدها.

وهذا بالضبط ما حدث مع شهادات SSL/TLS في سنوات 2000 عندما كانت CAs توقّع شهادات دون التحقق صحيحا من النطاق، فكان التوقيع صالحا، لكنه ينطبق على النطاق الخطأ.

## الخلاصة

Cape Mod شيء آخر غير اختراق بالمعنى التقليدي، بل استغلال أنيق لنقص تحقق منطقي في Minecraft. يوضح أن :

1. **توقيع صالح لا يضمن هوية حامله**
2. **في LAN، الثقة أضعف** مما يُظن
3. **خصائص `textures` في Minecraft هي أساسا محتوى محقون**، يجب التحقق من مطابقتها للاعب الذي يحملها

إذا انضممت لعالم LAN على خادم "مجهول" (أو بالأحرى، مضيفه لديه مود مشبوه)، فلديك فعلا مشكلة أمنية قبل cape بكثير. لكنه كاشف : تفترض Minecraft أن الجميع في LAN يثق ببعضه. وهذا صحيح... حتى أول مضيف يسيء استخدام هذه الثقة.

---

**الموارد**

- **GitHub**: [fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **مصادقة Minecraft**: [Yggdrasil protocol](https://wiki.vg/Authentication) (wiki.vg)
- **تشفير RSA**: [RFC 3447](https://tools.ietf.org/html/rfc3447) (PKCS #1)

**3 نقاط أساسية**

1. توقيعات RSA تصادق على رسالة بدلا من هوية، تفصيل كلف الكثير للعديد من الأنظمة.
2. تغفل Minecraft التحقق من مطابقة ملف اللاعب للتوقيع الذي يستلمه، ثغرة منطقية في التحقق، مع تشفير سليم.
3. في LAN أو نفق، كل شيء مباح لمود يتحكم بالخادم المدمج.
