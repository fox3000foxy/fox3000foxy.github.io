---
title: "مود الكيب: كيف تسرق كيب Jeb_ بحقن توقيع RSA"
description: "مود Fabric يستغل ثغرة منطقية في نظام الثقة في ماينكرافت: توقيع RSA صحيح من Mojang لكنه معاد استخدامه على حساب خاطئ. شرح الكود، تداعيات أمنية ودروس تشفيرية."
date: 2026-07-11
tags:
  - minecraft
  - fabric
  - java
  - rsa
  - signature
  - reverse-engineering
  - security
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "7LJQ3Iib9Sc5qkzxYuWVYq1yTW7uMu23nrBRXoxIt5HCRldiL+5snDnqIH8lbBmHntuynj4zOPTSWephpjKLdQ=="
---

# مود الكيب: كيف تسرق كيب Jeb_ بحقن توقيع RSA

ماذا لو أخبرتك أن توقيع RSA صحيحًا واحدًا -- لكن **للحساب الخطأ** -- يكفي لجعل أصدقائك يعتقدون أنك ترتدي الكيب الرسمي من Mojang؟ مرحبًا بك في `cape-mod`، exploit من نوع Fabric يوضح كيف تثق ماينكرافت بالتوقيع دون التحقق من أن الملف الشخصي الذي ينتمي إليه هو ملفك بالفعل.

## السياق: كيف تدير ماينكرافت skins والكيب

في Java Edition، هناك سؤال لا نطرحه كثيرًا: **من المسؤول عن عرض skin وكيب اللاعب -- العميل أم الخادم؟**

الإجابة دقيقة:

| المكون | من يرسله؟ | من ينزّله؟ |
|---|---|---|
| **نسيج skin** | الخادم يرسل الرابط الموقّع | العميل ينزّل من `textures.minecraft.net` |
| **نسيج كيب** | الخادم يرسل الرابط الموقّع | العميل ينزّل من `textures.minecraft.net` |
| **خاصية `textures`** | الخادم يرسل `GameProfile` من مصادقة Mojang | العميل يتحقق من توقيع RSA |

النقطة الأساسية: كل شيء محتوى في خاصية تُسمى `textures` ضمن `GameProfile`. تحتوي هذه الخاصية على:
- Payload JSON مع روابط textures بصيغة base64
- **توقيع RSA** مصنوع بالمفتاح الخاص لـ Mojang

## جدار توقيع RSA

كل خاصية `textures` تبدو هكذا عند فك تشفيرها:

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

يتحقق العميل من توقيع RSA مقابل **المفتاح العام المضمن في ملف الجرة** (`yggdrasil_session_pubkey.der`):

```java
// Property.java (authlib)
public boolean isSignatureValid(PublicKey publicKey) {
    Signature sig = Signature.getInstance("SHA1withRSA");
    sig.initVerify(publicKey);
    sig.update(this.value.getBytes());
    return sig.verify(Base64.decodeBase64(this.signature));
}
```

بالنسبة للاعبين عن بُعد (ليسوا محليين)، لا يقبل العميل سوى skins **الموسومة كـ `secure`** -- أي ذات توقيع صحيح:

```java
// SkinManager.createLookup() -- مبسط
PlayerSkin skin = optional
    .filter(ps -> !isRemote || ps.secure())  // ← اللاعبون عن بُعد يجب أن يكونوا secure
    .orElse(defaultSkin);
```

هذا الفحص يمنع spoofing نظريًا. لكن هنا تصبح الأمور مثيرة للاهتمام.

## الثغرة: إعادة استخدام التوقيع

العميل يتحقق من أن توقيع RSA **صحيح**. لكنه **لا يتحقق أبدًا** من أن `profileId` الموجود في JSON يطابق UUID الحقيقي للاعب.

بعبارة أخرى: خاصية `textures` مأخوذة من **حساب Mojang موجود** (مثل حساب موظف في Mojang) يمكن إعادة استخدامها على أي لاعب آخر. يبقى التوقيع صحيحًا -- فقد تم إنشاؤه بشكل أصيل بواسطة Mojang -- لكنه فقط من حساب آخر.

### كيف تستخرج توقيعًا حقيقيًا؟

Jeb_ (UUID `853c80ef-3c37-49fd-aa49-938b674adae6`) لديه كيب Mojang Studios. من خادم جلسات Mojang:

```bash
curl -s "https://sessionserver.mojang.com/session/minecraft/profile/853c80ef-3c37-49fd-aa49-938b674adae6?unsigned=false"
```

الرد:

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

التوقيع `signature` لحقل `value` هذا تم إنتاجه بواسطة Mojang. إنه RSA-2048 SHA-1. إنه **صحيح تمامًا**، حتى لو أعدت استخدامه على UUID آخر -- لأن توقيع Jeb_ يبقى توقيع Jeb_، والعميل لا يتحقق أبدًا من أنه **مفترض** أن يكون لك.

## الكود: كيف يعمل المود

مود `cape-mod` صغير جدًا -- 65 سطرًا من Java. إليك الجوهر:

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

        // يستبدل خاصية textures بخاصية Jeb_
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

**الخطوات**:
1. **Mixin** على `Player.getGameProfile()` -- النقطة التي يُرجع فيها ملف اللاعب
2. يتحقق من أنه خادم محلي (Integrated Server)
3. يتحقق من أنه host (عالم LAN)
4. **يستبدل** خاصية `textures` بخاصية Jeb_ (مضمنة في الكود)
5. يُرجع `GameProfile` جديدًا مع textures المحقونة

الـ `GameProfile` إذًا **مُزيّف**: إنه ملف شخصي مبني اصطناعيًا، لا يطابق اللاعب الحقيقي. خصائص `textures` **مُعاد استخدامها** من Jeb_ -- توقيع RSA أصلي لكنه مطبّق على الملف الخطأ. حزمة الشبكة نفسها شرعية: الخادم يرسل `ClientboundPlayerInfoUpdatePacket` بشكل طبيعي مع هذا الملف المعدّل. الملف هو المُزيّف، وليس الحزمة.

عندما ينضم أصدقاء host عبر LAN، يستقبلون `ClientboundPlayerInfoUpdatePacket` مع الملف المعدّل. العميل:
1. يفك تشفير payload base64
2. يتحقق من توقيع RSA → ✅ صحيح (إنه توقيع Jeb_ الأصلي)
3. يوسم skin كـ `secure=true` (لأن التوقيع صحيح)
4. يجتاز المرشح `!isRemote || ps.secure()` → ✅ يجتاز
5. **ينزّل ويعرض كيب Jeb_**

## النتيجة في اللعبة: الكيب على skinك

إليك ما يبدو عليه in-game. أولاً، منظر أمامي مع كيب Jeb_ معروض على host:

![Cape Mod -- كيب Jeb_ معروض على host](/images/cape-mod/cape-01-jeb-cape.png)

نرى بوضوح نمط الأحمر/الأبيض للكيب الرسمي لـ Mojang Studios. لا فرق عن Jeb_ الحقيقي الذي يملك كيبه الخاص -- العميل ينزّل نفس النسيج بالضبط من `textures.minecraft.net`.

وفي منظر غامر، داخل لعبة حقيقية:

![Cape Mod -- منظر في اللعبة مع كيب مرئي](/images/cape-mod/cape-02-lava-cape.png)

الكيب يطفو خلف اللاعب، يتموج مع الحركة. لا يمكن تمييزه تمامًا عن skin أصلي بكيب رسمي.

زاوية أخرى، في عالم مع حمم وتضاريس:

![Cape Mod -- كيب في بيئة طبيعية](/images/cape-mod/cape-03-local-game.png)

وآخر منظر مقرّب من gameplay الفعلي، حيث نرى الكيب أثناء الحركة:

![Cape Mod -- كيب في لعبة ماينكرافت كلاسيكية](/images/cape-mod/cape-04-real-gameplay.png)

لشخص ينضم إلى LAN دون علمه أن host لديه مود، لا توجد absolutely أي طريقة لتمييز هذا عن كيب Mojang حقيقي. هذه هي النقطة بالضبط: **التوقيع صحيح**، العميل ليس لديه أي سبب للشك.

## لماذا هذه ثغرة (ولماذا ليست كذلك)

المفارقة: الـ exploit يعمل **بالضبط لأن التوقيع صحيح**. لا يوجد bypass تشفيري هنا -- بل أسوأ، إنها **ثغرة منطقية** في نموذج الثقة.

| الفحص | النتيجة |
|---|---|
| **صحة توقيع RSA** | ✅ صحيح (موقّع من Mojang لـ Jeb_) |
| **هل `profileId` في payload يطابق UUID الـ host؟** | ❌ لا (UUID Jeb_ ≠ UUID الـ host) |
| **هل يتحقق العميل من التطابق؟** | ❌ **لا. يتم التحقق فقط من توقيع RSA.** |

ماينكرافت تثق **بالتوقيع**، وليس بهوية حامله. طالما أن التوقيع من Mojang، يقبله العميل. الأمر أشبه بإظهار جواز سفر مزوّر موقّع من الحكومة -- الختم شرعي، حتى لو كان جواز السفر ليس لك.

## التداعيات الأمنية

### النطاق محدود بـ LAN

المود يعمل فقط على خادم مدمج (LAN). المهاجم يجب أن:
- يكون لديه مود Fabric مثبت
- يكون host لعالم LAN
- يتصل أصدقاؤه بدون مود (vanilla)

### لكن الاحتمالات تتسع

نظريًا، بنفس التقنية، يمكن:
- **إعادة حقن بيانات أخرى موقعة**: رؤوس، enchantments غير قانونية، مكونات دردشة خبيثة
- **الدمج مع نفق LAN** (NGROK، playit.gg، Radmin VPN) للتأثير على لاعبين عبر الإنترنت
- **التوسع لخصائص أخرى** من الملف الشخصي تعتمد على التوقيعات

### لماذا لن تصحح Mojang هذا على الأرجح

لا توجد "ثغرة أمنية" بالمعنى الدقيق -- التوقيع صحيح. تصحيح هذا يتطلب من Mojang تغيير نموذج المصادقة بالكامل، وهو أمر معقد. حاليًا، إنها حالة حافة: من المفترض أن يثق لاعبو LAN ببعضهم البعض.

## الفخ الفلسفي

مود الكيب هو **proof of concept** ممتاز لحقيقة أوسع: **يجب ألا تثق أبدًا بتوقيع دون التحقق من وقّعه ولماذا وقّعه**.

هذا درس في التشفير الأساسي. RSA يوقع **رسالة**، وليس **هوية**. إذا أعطيتك توقيع RSA صحيحًا من Mojang، فأنت تعلم أن Mojang وقّعت *شيئًا ما*. لا تعلم لمن، ولا يمكنك افتراض ذلك بمجرد النظر إلى الرسالة.

هذا بالضبط ما حدث مع شهادات SSL/TLS في العقد 2000 عندما كانت الـ CAs تقبل أي شيء -- التوقيع كان صحيحًا، لكنه كان مُطبّقًا على النطاق الخطأ.

## الخاتمة

مود الكيب ليس اختراقًا بالمعنى الكلاسيكي -- إنه استغلال أنيق لغياب التحقق المنطقي في ماينكرافت. يوضح أن:

1. **التوقيع الصحيح لا يضمن هوية حامله**
2. **في LAN، الثقة أضعف** مما نعتقد
3. **خصائص `textures` في ماينكرافت هي أساسًا محتوى محقون** -- يجب التحقق من أنها تطابق اللاعب الذي يحملها

إذا انضممت إلى عالم LAN على خادم "غير معروف" (أو بالأحرى، host لديه مود مشبوه)، فلديك مشكلة أمنية قبل الكيب بوقت طويل. لكن هذا عرضي: ماينكرافت تفترض أن الجميع على LAN يثقون ببعضهم البعض. هذا صحيح... إلى أن لا يعود كذلك.

---

**موارد**

- **GitHub**: [fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **مصادقة ماينكرافت**: [بروتوكول Yggdrasil](https://wiki.vg/Authentication) (wiki.vg)
- **تشفير RSA**: [RFC 3447](https://tools.ietf.org/html/rfc3447) (PKCS #1)

**3 نقاط رئيسية**

1. توقيعات RSA تتحقق من رسالة، وليس هوية -- تفصيل كلّف العديد من الأنظمة غاليًا.
2. ماينكرافت لا تتحقق من أن ملف اللاعب يطابق التوقيع الذي يستقبله -- ثغرة منطقية، لا تشفيرية.
3. في LAN أو عبر نفق، كل شيء مفتوح لمود يتحكم في الخادم المدمج.
