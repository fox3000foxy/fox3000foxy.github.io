---
title: "Cape Mod: как украсть плащ Jeb_ с помощью инъекции подписи RSA"
description: "Мод Fabric, эксплуатирующий логическую уязвимость в системе доверия Minecraft: действительная подпись RSA от Mojang, но воспроизведённая на чужой учётной записи. Объяснение кода, последствия для безопасности и криптографические уроки."
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
author_sig: "Y0ldkb4qByUQjvSTENSuKbKKVZB5n6VZhjg5C/m5qpsdc07lrb7BsfhgaIce9zjg+As2kPsOn+f+CY9DlMUuug=="
---

# Cape Mod: как украсть плащ Jeb_ с помощью инъекции подписи RSA

![alt text](assets/xbox-profile.png)
Что если я скажу тебе, что достаточно одной действительной подписи RSA — но для **неправильной учётной записи** — чтобы убедить друзей, что ты носишь официальный плащ Mojang? Добро пожаловать в `cape-mod`, эксплойт для Fabric, показывающий, как Minecraft доверяет подписи, не проверяя, принадлежит ли профиль, для которого она создана, действительно тебе.

## Контекст: как Minecraft управляет скинами и плащами

В Java Edition есть вопрос, который редко задают: **кто отвечает за отображение скина и плаща игрока — клиент или сервер?**

Ответ неоднозначен:

| Компонент | Кто отправляет? | Кто загружает? |
|---|---|---|
| **Текстура скина** | Сервер отправляет подписанный URL | Клиент загружает с `textures.minecraft.net` |
| **Текстура плаща** | Сервер отправляет подписанный URL | Клиент загружает с `textures.minecraft.net` |
| **Свойство `textures`** | Сервер отправляет `GameProfile` от аутентификации Mojang | Клиент проверяет подпись RSA |

Ключевой момент: всё содержится в свойстве `textures` объекта `GameProfile`. Это свойство содержит:
- Полезную нагрузку JSON в base64 с URL текстур
- **Подпись RSA**, созданную закрытым ключом Mojang

## Стена подписи RSA

Каждое свойство `textures` при декодировании выглядит так:

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

Клиент проверяет подпись RSA с помощью **открытого ключа, встроенного в jar** (`yggdrasil_session_pubkey.der`):

```java
// Property.java (authlib)
public boolean isSignatureValid(PublicKey publicKey) {
    Signature sig = Signature.getInstance("SHA1withRSA");
    sig.initVerify(publicKey);
    sig.update(this.value.getBytes());
    return sig.verify(Base64.decodeBase64(this.signature));
}
```

Для удалённых игроков (не локальных) клиент принимает только скины, **помеченные как `secure`** — то есть с действительной подписью:

```java
// SkinManager.createLookup() — упрощённо
PlayerSkin skin = optional
    .filter(ps -> !isRemote || ps.secure())  // ← удалённые игроки должны быть безопасными
    .orElse(defaultSkin);
```

Эта проверка теоретически предотвращает спуфинг. Но тут начинается самое интересное.

## Уязвимость: повторное использование подписи

Клиент проверяет, что подпись RSA **действительна**. Но он **никогда** не проверяет, что `profileId` в JSON соответствует реальному UUID игрока.

Иными словами: свойство `textures`, взятое от **существующей учётной записи Mojang** (например, сотрудника Mojang), можно воспроизвести на любом другом игроке. Подпись остаётся действительной — она была создана Mojang легитимно — просто она взята от другого аккаунта.

### Как извлечь настоящую подпись?

У Jeb_ (UUID `853c80ef-3c37-49fd-aa49-938b674adae6`) есть плащ Mojang Studios. С сервера сессий Mojang:

```bash
curl -s "https://sessionserver.mojang.com/session/minecraft/profile/853c80ef-3c37-49fd-aa49-938b674adae6?unsigned=false"
```

Ответ:

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

`signature` этого поля `value` была создана Mojang. Это RSA-2048 SHA-1. Она **абсолютно** действительна, даже если воспроизвести её на другом UUID — потому что подпись Jeb_ остаётся подписью Jeb_, и клиент никогда не проверяет, что она **должна** быть твоей.

## Код: как работает мод

Мод `cape-mod` крошечный — 65 строк Java. Вот его ядро:

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

        // Заменяет свойство textures на свойство Jeb_
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

**Шаги**:
1. **Mixin** на `Player.getGameProfile()` — точка, где возвращается профиль игрока
2. Проверяет, что это локальный сервер (Integrated Server)
3. Проверяет, что это хост (мир по LAN)
4. **Заменяет** свойство `textures` на свойство Jeb_ (зашитое в коде)
5. Возвращает новый `GameProfile` с внедрёнными текстурами

`GameProfile` таким образом **подделан**: это искусственно сконструированный профиль, не соответствующий реальному игроку. Свойства `textures` **воспроизведены** от Jeb_ — подпись RSA подлинная, но применена к неправильному профилю. Сетевой пакет при этом легитимен: сервер обычно отправляет `ClientboundPlayerInfoUpdatePacket` с этим изменённым профилем. Подделан профиль, а не пакет.

Когда друзья хоста подключаются по LAN, они получают `ClientboundPlayerInfoUpdatePacket` с изменённым профилем. Клиент:
1. Декодирует полезную нагрузку base64
2. Проверяет подпись RSA → ✅ действительна (это действительно подпись Jeb_)
3. Помечает скин как `secure=true` (так как подпись действительна)
4. Проходит фильтр `!isRemote || ps.secure()` → ✅ пройден
5. **Загружает и отображает плащ Jeb_**

## Результат в игре: плащ на твоём скине

Вот как это выглядит в игре. Сначала вид спереди с плащом Jeb_ на хосте:

![Cape Mod — плащ Jeb_, отображаемый на хосте](/images/cape-mod/cape-01-jeb-cape.png)

Отчётливо виден красно-белый узор официального плаща Mojang Studios. Никакого отличия от настоящего Jeb_ с собственным плащом — клиент загружает ту же текстуру с `textures.minecraft.net`.

А в погружающем виде, в реальной игре:

![Cape Mod — вид в игре с видимым плащом](/images/cape-mod/cape-02-lava-cape.png)

Плащ развевается за игроком, колышется при движении. Абсолютно неотличим от подлинного скина с официальным плащом.

Ещё один ракурс, в мире с лавой и ландшафтом:

![Cape Mod — плащ в естественной среде](/images/cape-mod/cape-03-local-game.png)

И последний крупный план реального геймплея, где видно плащ в действии:

![Cape Mod — плащ в обычном геймплее Minecraft](/images/cape-mod/cape-04-real-gameplay.png)

Для того, кто подключился бы по LAN, не зная, что у хоста установлен мод, нет абсолютно никакого способа отличить это от настоящего плаща Mojang. В этом и суть: **подпись действительна**, у клиента нет причин сомневаться.

## Почему это уязвимость (и почему это не уязвимость)

Ирония в том, что эксплойт работает **именно потому, что подпись действительна**. Здесь нет криптографического обхода — это хуже, это **логическая уязвимость** в модели доверия.

| Проверка | Результат |
|---|---|
| **Действительность подписи RSA** | ✅ Действительна (подписана Mojang для Jeb_) |
| **Соответствует ли `profileId` в полезной нагрузке UUID хоста?** | ❌ Нет (UUID Jeb_ ≠ UUID хоста) |
| **Проверяет ли клиент это соответствие?** | ❌ **Нет. Проверяется только подпись RSA.** |

Minecraft доверяет **подписи**, а не личности того, кто её предъявляет. Пока подпись от Mojang, клиент её принимает. Это как показать поддельный паспорт, подписанный правительством — печать подлинная, даже если паспорт не твой.

## Последствия для безопасности

### Ограниченная область действия — LAN

Мод работает только на встроенном сервере (LAN). Атакующий должен:
- Иметь установленный мод Fabric
- Быть хостом мира по LAN
- Его друзья подключаются без мода (ванильно)

### Но возможности расширяются

Теоретически, с той же техникой можно:
- **Внедрять другие подписанные данные**: головы, нелегальные зачарования, вредоносные компоненты чата
- **Комбинировать с LAN-туннелем** (NGROK, playit.gg, Radmin VPN) для воздействия на игроков через интернет
- **Расширить на другие свойства** профиля, зависящие от подписей

### Почему Mojang, скорее всего, не будет это исправлять

Строго говоря, это не "уязвимость" — подпись действительна. Исправление потребовало бы от Mojang изменения всей модели аутентификации, что сложно. Пока это крайний случай: предполагается, что игроки по LAN доверяют друг другу.

## Философская ловушка

Cape Mod — отличный **proof of concept** более широкой истины: **никогда не доверяй подписи, не проверив, кто её создал и к чему она относится**.

Это урок элементарной криптографии. RSA подписывает **сообщение**, а не **личность**. Если я дам тебе действительную подпись RSA от Mojang, ты будешь знать, что Mojang подписала *что-то*. Ты не будешь знать для кого, и не сможешь это предполагать, просто глядя на сообщение.

Именно это произошло с SSL/TLS сертификатами в 2000-х, когда ЦС принимали что угодно — подпись была действительной, но применялась к неправильному домену.

## Заключение

Cape Mod — не взлом в классическом смысле. Это элегантная эксплуатация отсутствия логической проверки в Minecraft. Он показывает, что:

1. **Действительная подпись не гарантирует личность предъявителя**
2. **По LAN доверие слабее**, чем кажется
3. **Свойства `textures` в Minecraft — это, по сути, внедрённый контент** — необходимо проверять, что они соответствуют игроку, который их носит

Если ты подключаешься к миру по LAN на "незнакомом" сервере (или, скорее, где у хоста подозрительный мод), у тебя уже есть проблема безопасности задолго до плаща. Но это симптоматично: Minecraft предполагает, что все в LAN доверяют друг другу. Это верно... пока не перестаёт быть таковым.

---

**Ресурсы**

- **GitHub**: [fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **Minecraft auth**: [Yggdrasil protocol](https://wiki.vg/Authentication) (wiki.vg)
- **RSA cryptography**: [RFC 3447](https://tools.ietf.org/html/rfc3447) (PKCS #1)

**3 ключевых момента**

1. Подписи RSA подтверждают сообщение, а не личность — деталь, дорого обошедшаяся многим системам.
2. Minecraft не проверяет, что профиль игрока соответствует полученной подписи — логическая, а не криптографическая уязвимость.
3. По LAN или через туннель всё открыто для мода, контролирующего встроенный сервер.
