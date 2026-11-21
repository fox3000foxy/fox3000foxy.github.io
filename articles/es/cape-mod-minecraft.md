---
title: "Cape Mod: cómo robar la capa de Jeb_ con una inyección de firma RSA"
description: "Un mod Fabric que explota un fallo lógico en el sistema de confianza de Minecraft: una firma RSA válida de Mojang pero repetida en una cuenta equivocada. Explicación del código, implicaciones de seguridad y lecciones criptográficas."
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
author_sig: "I+EqPy2BmG0FD4ZWkcA7SPOo5i2665xyfMKTT6VkjGYph6YXjL8vEcUtWszYBD02upmXGwyjk4tjD9yghwq+mQ=="
---

# Cape Mod: cómo robar la capa de Jeb_ con una inyección de firma RSA

![alt text](assets/xbox-profile.png)

¿Y si te dijera que bastaba una firma RSA válida, pero para la **cuenta equivocada**, para hacer creer a tus amigos que llevas la capa oficial de Mojang? Bienvenido a `cape-mod`, un exploit Fabric que muestra cómo Minecraft confía en una firma mientras omite comprobar que el perfil al que pertenece es efectivamente el tuyo.

## El contexto: cómo gestiona Minecraft skins y capas

En Java Edition hay una pregunta rara vez planteada: **¿quién es responsable de mostrar el skin y la capa de un jugador: el cliente o el servidor?**

La respuesta tiene matices:

| Componente | ¿Quién lo envía? | ¿Quién lo descarga? |
|---|---|---|
| **Textura de skin** | El servidor envía la URL firmada | El cliente descarga desde `textures.minecraft.net` |
| **Textura de capa** | El servidor envía la URL firmada | El cliente descarga desde `textures.minecraft.net` |
| **Propiedad `textures`** | El servidor envía el `GameProfile` desde la auth de Mojang | El cliente verifica la firma RSA |

El punto clave: todo está contenido en una propiedad llamada `textures` del `GameProfile`. Esa propiedad contiene:
- Un payload JSON en base64 con las URLs de las texturas
- Una **firma RSA** hecha con la clave privada de Mojang

## El muro de la firma RSA

Cada propiedad `textures` se ve así cuando la decodificas:

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

El cliente verifica la firma RSA contra la **clave pública incluida en el jar** (`yggdrasil_session_pubkey.der`):

```java
// Property.java (authlib)
public boolean isSignatureValid(PublicKey publicKey) {
    Signature sig = Signature.getInstance("SHA1withRSA");
    sig.initVerify(publicKey);
    sig.update(this.value.getBytes());
    return sig.verify(Base64.decodeBase64(this.signature));
}
```

Para los jugadores remotos (fuera del juego local), el cliente solo acepta los skins **marcados como `secure`**: es decir con una firma válida:

```java
// SkinManager.createLookup() -- simplificado
PlayerSkin skin = optional
    .filter(ps -> !isRemote || ps.secure())  // ← los jugadores remotos tienen que ser seguros
    .orElse(defaultSkin);
```

Ese check bloquea el spoofing en teoría. Pero la validación se detiene ahí, y es justo ahí donde empieza el ataque.

## El fallo: signature replay

El cliente verifica que la firma RSA **sea válida**. Omite sistemáticamente comprobar que el `profileId` contenido en el JSON corresponda al UUID real del jugador.

Dicho de otro modo: una propiedad `textures` tomada de una **cuenta Mojang existente** (por ejemplo la de un empleado de Mojang) puede repetirse en cualquier otro jugador. La firma sigue siendo válida: la produjo realmente Mojang, solo que viene de otra cuenta.

### Cómo extraer una firma real

Jeb_ (UUID `853c80ef-3c37-49fd-aa49-938b674adae6`) tiene la capa Mojang Studios. Desde el servidor de sesiones de Mojang:

```bash
curl -s "https://sessionserver.mojang.com/session/minecraft/profile/853c80ef-3c37-49fd-aa49-938b674adae6?unsigned=false"
```

Respuesta:

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

La `signature` de ese campo `value` la produjo Mojang. Es RSA-2048 SHA-1. Es **absolutamente** válida, aunque la repitas en otro UUID: porque la firma de Jeb_ sigue siendo una firma de Jeb_, y el cliente omite controlar a quién estaba destinada.

## El código: cómo funciona el mod

El mod `cape-mod` es minúsculo: 65 líneas de Java. Aquí el corazón:

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

        // Reemplaza la propiedad textures por la de Jeb_
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

**Pasos**:
1. **Mixin** sobre `Player.getGameProfile()`: el punto donde se devuelve el perfil del jugador
2. Comprueba que es un servidor local (Integrated Server)
3. Comprueba que es el host (mundo LAN)
4. **Reemplaza** la propiedad `textures` por la de Jeb_ (hardcodeada)
5. Devuelve un nuevo `GameProfile` con las texturas inyectadas

El `GameProfile` queda por tanto **forjado**: es un perfil construido artificialmente, que no corresponde al verdadero jugador. Las propiedades `textures` están **repetidas** desde Jeb_: la firma RSA es auténtica pero aplicada al perfil equivocado. El paquete de red, en cambio, es legítimo: el servidor envía normalmente el `ClientboundPlayerInfoUpdatePacket` con ese perfil modificado. Es el perfil el que está forjado; el paquete sigue siendo legítimo.

Cuando los amigos del host se unen vía LAN, reciben el `ClientboundPlayerInfoUpdatePacket` con el perfil modificado. El cliente:
1. Decodifica el payload base64
2. Verifica la firma RSA → ✅ válida (es realmente la de Jeb_)
3. Marca el skin como `secure=true` (porque la firma es válida)
4. Pasa el filtro `!isRemote || ps.secure()` → ✅ pasa
5. **Descarga y muestra la capa de Jeb_**

## Resultado en juego: la capa sobre tu skin

Así se ve in-game. Primero, vista de frente con la capa de Jeb_ mostrada en el host:

![Cape Mod: capa de Jeb_ mostrada en el host](/images/cape-mod/cape-01-jeb-cape.png)

Se ve claramente el motivo rojo/blanco de la capa oficial Mojang Studios. El render queda idéntico al de un verdadero Jeb_ llevando su propia capa: el cliente descarga exactamente la misma textura desde `textures.minecraft.net`.

Y en vista inmersiva, en una partida real:

![Cape Mod: vista en juego con capa visible](/images/cape-mod/cape-02-lava-cape.png)

La capa flota tras el jugador, ondula con el movimiento. Perfectamente indistinguible de un skin auténtico con capa oficial.

Otro ángulo, en un mundo con lava y terreno:

![Cape Mod: capa en un entorno natural](/images/cape-mod/cape-03-local-game.png)

Y una última vista cercana del gameplay real, donde se ve la capa en acción:

![Cape Mod: capa en gameplay clásico de Minecraft](/images/cape-mod/cape-04-real-gameplay.png)

Para alguien que se uniera a una LAN ignorando que el host usa un mod, la capa sigue siendo visualmente idéntica a una verdadera capa Mojang. Ese es justo el punto: **la firma es válida**, así que el cliente la trata como legítima.

## Por qué es un fallo (y por qué no lo es)

Es irónico: el exploit funciona **justamente porque la firma es válida**. No se trata de un bypass criptográfico: es peor, un **fallo lógico** en el modelo de confianza.

| Check | Resultado |
|---|---|
| **Validez de la firma RSA** | ✅ Válida (firmada por Mojang para Jeb_) |
| **¿El `profileId` del payload corresponde al UUID del host?** | ❌ No (UUID de Jeb_ ≠ UUID del host) |
| **¿El cliente verifica la correspondencia?** | ❌ **No. Solo se verifica la firma RSA.** |

Minecraft confía **en la firma** en vez de en la identidad de quien la lleva. Mientras la firma venga de Mojang, el cliente la acepta. Es como mostrar un pasaporte falso firmado por el gobierno: el sello es legítimo, aunque el pasaporte no sea tuyo.

## Las implicaciones de seguridad

### Alcance limitado a LAN

El mod solo funciona en un servidor integrado (LAN). El atacante tiene que:
- Tener un mod Fabric instalado
- Ser el host de un mundo LAN
- Sus amigos se conectan sin mod (vanilla)

### Pero las posibilidades se amplían

En teoría, con la misma técnica, se podría:
- **Reinyectar otros datos firmados**: heads, encantamientos ilegales, componentes de chat maliciosos
- **Combinar con un túnel LAN** (NGROK, playit.gg, Radmin VPN) para afectar a jugadores en internet
- **Extender a otras propiedades** del perfil que dependan de firmas

### Por qué Mojang probablemente no lo parcheará

No se trata de una "vulnerabilidad" en sentido estricto: la firma es válida. Parchearlo exigiría a Mojang modificar el modelo de autenticación completo, lo cual es complejo. Por ahora, es un caso límite: se supone que los jugadores LAN confían entre sí.

## La trampa filosófica

Cape Mod es un excelente **proof of concept** de una verdad más amplia: **siempre tienes que verificar quién firmó un dato y para qué sujeto antes de confiar en él**.

Es una lección de criptografía básica. RSA firma un **mensaje**; la **identidad** del destinatario queda fuera de la firma. Si te doy una firma RSA válida de Mojang, solo sabes que Mojang firmó *algo*, sin indicación fiable sobre el destinatario a partir del solo mensaje.

Es exactamente lo que pasó con los certificados SSL/TLS en los años 2000 cuando las CA firmaban certificados sin verificar correctamente el dominio: la firma era válida, pero se aplicaba al dominio equivocado.

## Conclusión

Cape Mod no es un hack en sentido clásico: es una explotación elegante de una falta de validación lógica en Minecraft. Muestra que:

1. **Una firma válida no garantiza la identidad de quien la lleva**
2. **En LAN, la confianza es más débil** de lo que se cree
3. **Las propiedades `textures` de Minecraft son esencialmente contenido inyectado**: hay que verificar que correspondan al jugador que las lleva

Si te unes a un mundo LAN en un servidor "desconocido" (o más bien, cuyo host tiene un mod sospechoso), ya tienes un problema de seguridad mucho antes que la capa. Pero es revelador: Minecraft supone que todo el mundo en una LAN confía entre sí. Es verdad... hasta el primer host que abusa de esa confianza.

---

**Recursos**

- **GitHub**: [fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **Minecraft auth**: [Yggdrasil protocol](https://wiki.vg/Authentication) (wiki.vg)
- **RSA criptografía**: [RFC 3447](https://tools.ietf.org/html/rfc3447) (PKCS #1)

**3 puntos clave**

1. Las firmas RSA validan un mensaje más que una identidad: un detalle que costó caro a muchos sistemas.
2. Minecraft omite comprobar que el perfil del jugador corresponde a la firma que recibe: un fallo lógico en la validación, con una criptografía intacta.
3. En LAN o en túnel, todo es barra libre para un mod que controle el servidor integrado.
