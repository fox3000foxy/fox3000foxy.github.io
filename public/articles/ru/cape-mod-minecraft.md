---
title: "Cape Mod : как украсть плащ Jeb_ инъекцией подписи RSA"
description: "Мод Fabric, эксплуатирующий логическую уязвимость в системе доверия Minecraft : валидная подпись RSA от Mojang, но переигранная на чужом аккаунте. Объяснение кода, последствия для безопасности и криптографические уроки."
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
author_sig: "4aZnv+e5pAGz4KM0ct6vLAmq51lMP8te58nU073pOOkHaZqJtXff2eNOhXpwhTOw4/QqHrovfE5vB1yzZYSLRg=="
---

# Cape Mod : как украсть плащ Jeb_ инъекцией подписи RSA

![alt text](assets/xbox-profile.png)

А если я скажу, что достаточно валидной подписи RSA -- но для **чужого аккаунта** -- чтобы друзья поверили, что ты носишь официальный плащ Mojang? Добро пожаловать в `cape-mod`, эксплойт Fabric, показывающий, как Minecraft доверяет подписи, забывая проверить, что профиль, к которому она относится, действительно твой.

## Контекст : как Minecraft управляет скинами и плащами

В Java Edition есть редко задаваемый вопрос : **кто отвечает за отображение скина и плаща игрока -- клиент или сервер?**

Ответ нюансированный :

| Composant | Qui l'envoie ? | Qui le télécharge ? |
|---|---|---|
| **Texture de skin** | Le serveur envoie l'URL signée | Le client télécharge depuis `textures.minecraft.net` |
| **Texture de cape** | Le serveur envoie l'URL signée | Le client télécharge depuis `textures.minecraft.net` |
| **Propriété `textures`** | Le serveur envoie le `GameProfile` depuis l'auth Mojang | Le client vérifie la signature RSA |

Ключевой момент : всё содержится в свойстве `textures` объекта `GameProfile`. Это свойство содержит :
- JSON-пейлоад в base64 с URL текстур
- **подпись RSA**, сделанную приватным ключом Mojang

## Стена подписи RSA

Каждое свойство `textures` выглядит так, когда его декодируешь :

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

Клиент проверяет подпись RSA по **публичному ключу, вшитому в jar** (`yggdrasil_session_pubkey.der`) :

```java
// Property.java (authlib)
public boolean isSignatureValid(PublicKey publicKey) {
    Signature sig = Signature.getInstance("SHA1withRSA");
    sig.initVerify(publicKey);
    sig.update(this.value.getBytes());
    return sig.verify(Base64.decodeBase64(this.signature));
}
```

Для удалённых игроков (вне локальной игры) клиент принимает только скины, **помеченные как `secure`** -- то есть с валидной подписью :

```java
// SkinManager.createLookup() -- simplifié
PlayerSkin skin = optional
    .filter(ps -> !isRemote || ps.secure())  // ← les joueurs distants doivent être sécurisés
    .orElse(defaultSkin);
```

Эта проверка в теории блокирует спуфинг. Но валидация на этом останавливается, и именно здесь начинается атака.

## Уязвимость : переигрывание подписи

Клиент проверяет, что подпись RSA **валидна**. Он систематически забывает проверить, что `profileId` внутри JSON соответствует реальному UUID игрока.

Иначе говоря : свойство `textures`, взятое с **существующего аккаунта Mojang** (например, аккаунта сотрудника Mojang), может быть переиграно на любом другом игроке. Подпись остаётся валидной -- она реально произведена Mojang -- просто пришла с другого аккаунта.

### Как извлечь настоящую подпись?

У Jeb_ (UUID `853c80ef-3c37-49fd-aa49-938b674adae6`) есть плащ Mojang Studios. С сессионного сервера Mojang :

```bash
curl -s "https://sessionserver.mojang.com/session/minecraft/profile/853c80ef-3c37-49fd-aa49-938b674adae6?unsigned=false"
```

Ответ :

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

`signature` этого поля `value` произведена Mojang. Это RSA-2048 SHA-1. Она **абсолютно** валидна, даже если переиграть её на другом UUID -- потому что подпись Jeb_ остаётся подписью Jeb_, а клиент забывает проверить, кому она предназначалась.

## Код : как работает мод

Мод `cape-mod` крошечный -- 65 строк Java. Вот сердце :

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

        // Remplace la propriété textures par celle de Jeb_
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

**Шаги** :
1. **Mixin** на `Player.getGameProfile()` -- точка, где возвращается профиль игрока
2. Проверяет, что это локальный сервер (Integrated Server)
3. Проверяет, что это хост (LAN-мир)
4. **Заменяет** свойство `textures` на то, что у Jeb_ (захардкожено)
5. Возвращает новый `GameProfile` с внедрёнными текстурами

`GameProfile` таким образом **подделан** : это искусственно построенный профиль, не соответствующий настоящему игроку. Свойства `textures` **переиграны** с Jeb_ -- подпись RSA подлинная, но применена к чужому профилю. Сетевой пакет при этом легитимен : сервер штатно отправляет `ClientboundPlayerInfoUpdatePacket` с этим изменённым профилем. Подделан профиль ; пакет остаётся легитимным.

Когда друзья хоста заходят через LAN, они получают `ClientboundPlayerInfoUpdatePacket` с изменённым профилем. Клиент :
1. Декодирует base64-пейлоад
2. Проверяет подпись RSA → ✅ валидна (это реально подпись Jeb_)
3. Помечает скин как `secure=true` (раз подпись валидна)
4. Проходит фильтр `!isRemote || ps.secure()` → ✅ проходит
5. **Скачивает и показывает плащ Jeb_**

## Результат в игре : плащ на твоём скине

Вот как это выглядит в игре. Сначала вид спереди с плащом Jeb_, показанным на хосте :

![Cape Mod -- Jeb_ cape affichée sur le host](/images/cape-mod/cape-01-jeb-cape.png)

Чётко виден красно-белый узор официального плаща Mojang Studios. Рендер остаётся идентичным настоящему Jeb_ в собственном плаще -- клиент скачивает ровно ту же текстуру с `textures.minecraft.net`.

А в иммерсивном виде, в настоящей партии :

![Cape Mod -- vue en jeu avec cape visible](/images/cape-mod/cape-02-lava-cape.png)

Плащ развевается за игроком, колышется с движением. Совершенно неотличимо от подлинного скина с официальным плащом.

Другой ракурс, в мире с лавой и рельефом :

![Cape Mod -- cape dans un environnement naturel](/images/cape-mod/cape-03-local-game.png)

И последний крупный план реального геймплея, где виден плащ в действии :

![Cape Mod -- cape en gameplay classique Minecraft](/images/cape-mod/cape-04-real-gameplay.png)

Для того, кто зайдёт в LAN, не зная, что хост использует мод, плащ визуально идентичен настоящему плащу Mojang. В этом и суть : **подпись валидна**, так что клиент относится к ней как к легитимной.

## Почему это уязвимость (и почему нет)

Ирония : эксплойт работает **именно потому, что подпись валидна**. Речь не о криптографическом обходе -- хуже : о **логической уязвимости** в модели доверия.

| Check | Résultat |
|---|---|
| **Validité de la signature RSA** | ✅ Valide (signée par Mojang pour Jeb_) |
| **Le `profileId` dans le payload correspond-il à l'UUID du host ?** | ❌ Non (Jeb_'s UUID ≠ UUID du host) |
| **Le client vérifie-t-il la correspondance ?** | ❌ **Non. Seule la signature RSA est vérifiée.** |

Minecraft доверяет **подписи**, а не идентичности того, кто её несёт. Пока подпись от Mojang, клиент её принимает. Это как показать чужой паспорт с государственной печатью -- печать легитимна, даже если паспорт не твой.

## Последствия для безопасности

### Охват ограничен LAN

Мод работает только на встроенном сервере (LAN). Атакующий должен :
- Иметь установленный мод Fabric
- Быть хостом LAN-мира
- Его друзья подключаются без мода (ванильно)

### Но возможности расширяются

В теории той же техникой можно :
- **Реинжектить другие подписанные данные** : головы, нелегальные чары, вредоносные компоненты чата
- **Комбинировать с LAN-туннелем** (NGROK, playit.gg, Radmin VPN), чтобы затрагивать игроков в интернете
- **Расширить на другие свойства** профиля, зависящие от подписей

### Почему Mojang, вероятно, не запатчит

Речь не об "уязвимости" в строгом смысле -- подпись валидна. Патч потребовал бы от Mojang менять всю модель аутентификации, а это сложно. Пока это пограничный случай : игрокам в LAN положено доверять друг другу.

## Философская ловушка

Cape Mod отличный **proof of concept** более широкой истины : **всегда проверяй, кто подписал данные и для какого субъекта, прежде чем им доверять**.

Это урок базовой криптографии. RSA подписывает **сообщение** ; **идентичность** получателя остаётся вне подписи. Если я даю тебе валидную подпись RSA от Mojang, ты знаешь лишь, что Mojang подписал *что-то*, без надёжного указания на получателя из одного сообщения.

Именно это случилось с SSL/TLS-сертификатами в 2000-х, когда CA подписывали сертификаты, толком не проверив домен -- подпись была валидна, но относилась к чужому домену.

## Заключение

Cape Mod это не хак в классическом смысле -- это элегантная эксплуатация недостатка логической валидации в Minecraft. Он показывает, что :

1. **Валидная подпись не гарантирует идентичность того, кто её несёт**
2. **В LAN доверие слабее**, чем кажется
3. **Свойства `textures` в Minecraft по сути инжектируемый контент** -- надо проверять, что они соответствуют игроку, который их несёт

Если ты заходишь в LAN-мир на "незнакомом" сервере (точнее, чей хост с подозрительным модом), у тебя уже проблема безопасности задолго до плаща. Но это показательно : Minecraft предполагает, что все в LAN доверяют друг другу. Это правда... до первого хоста, злоупотребившего этим доверием.

---

**Ресурсы**

- **GitHub**: [fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **Minecraft auth**: [Yggdrasil protocol](https://wiki.vg/Authentication) (wiki.vg)
- **RSA cryptographie**: [RFC 3447](https://tools.ietf.org/html/rfc3447) (PKCS #1)

**3 ключевых пункта**

1. Подписи RSA валидируют сообщение, а не идентичность -- деталь, дорого стоившая многим системам.
2. Minecraft забывает проверять, что профиль игрока соответствует полученной подписи -- логическая уязвимость в валидации при целой криптографии.
3. В LAN или туннеле для мода, контролирующего встроенный сервер, всё открытая столовка.
