---
title: "Cape Mod: cómo robar la capa de Jeb_ con una inyección de firma RSA"
description: "Un mod Fabric que explota una falla lógica en el sistema de confianza de Minecraft: una firma RSA válida de Mojang pero reutilizada en la cuenta equivocada. Explicación del código, implicaciones de seguridad y lecciones criptográficas."
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
author_sig: "9OdEbdwnxjuq6oyrvPhz33J0SSL41Fwc1SM0GH30sPy0J7gDZLgberdTZwqdqPCNWnX8Cdc8MPq27XhCAXIAnw=="
---

# Cape Mod: cómo robar la capa de Jeb_ con una inyección de firma RSA

![alt text](assets/xbox-profile.png)
¿Y si te dijera que solo basta una firma RSA válida -- pero para la **cuenta equivocada** -- para hacer creer a tus amigos que llevas la capa oficial de Mojang? Bienvenido a `cape-mod`, un exploit Fabric que muestra cómo Minecraft confía en una firma sin verificar que el perfil al que pertenece sea efectivamente el tuyo.

## El contexto: cómo Minecraft maneja las skins y las capas

En Java Edition, hay una pregunta que no nos hacemos a menudo: **¿quién es responsable de mostrar la skin y la capa de un jugador -- el cliente o el servidor?**

La respuesta es matizada:

| Componente | ¿Quién lo envía? | ¿Quién lo descarga? |
|---|---|---|
| **Textura de skin** | El servidor envía la URL firmada | El cliente descarga desde `textures.minecraft.net` |
| **Textura de capa** | El servidor envía la URL firmada | El cliente descarga desde `textures.minecraft.net` |
| **Propiedad `textures`** | El servidor envía el `GameProfile` desde el auth de Mojang | El cliente verifica la firma RSA |

El punto clave: todo está contenido en una propiedad llamada `textures` del `GameProfile`. Esta propiedad contiene:
- Un payload JSON en base64 con las URLs de las texturas
- Una **firma RSA** hecha con la clave privada de Mojang

## El muro de la firma RSA

Cada propiedad `textures` se ve así cuando la decodificamos:

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

El cliente verifica la firma RSA contra la **clave pública embebida en el jar** (`yggdrasil_session_pubkey.der`):

```java
// Property.java (authlib)
public boolean isSignatureValid(PublicKey publicKey) {
    Signature sig = Signature.getInstance("SHA1withRSA");
    sig.initVerify(publicKey);
    sig.update(this.value.getBytes());
    return sig.verify(Base64.decodeBase64(this.signature));
}
```

Para los jugadores remotos (no locales), el cliente solo acepta las skins **marcadas como `secure`** -- es decir, con una firma válida:

```java
// SkinManager.createLookup() -- simplificado
PlayerSkin skin = optional
    .filter(ps -> !isRemote || ps.secure())  // ← los jugadores remotos deben estar asegurados
    .orElse(defaultSkin);
```

Este check previene el spoofing en teoría. Pero aquí es donde las cosas se ponen interesantes.

## La falla: reutilización de firma (signature replay)

El cliente verifica que la firma RSA **es válida**. Pero **nunca** verifica que el `profileId` contenido en el JSON corresponda al UUID real del jugador.

En otras palabras: una propiedad `textures` tomada de una **cuenta Mojang existente** (por ejemplo la de un empleado de Mojang) puede reutilizarse en cualquier otro jugador. La firma sigue siendo válida -- fue genuinamente hecha por Mojang -- solo que viene de otra cuenta.

### Cómo extraer una firma real

Jeb_ (UUID `853c80ef-3c37-49fd-aa49-938b674adae6`) tiene la capa de Mojang Studios. Desde el servidor de sesión de Mojang:

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

La `signature` de este campo `value` fue producida por Mojang. Es RSA-2048 SHA-1. Es **absolutamente** válida, incluso si la reutilizas en otro UUID -- porque la firma de Jeb_ sigue siendo una firma de Jeb_, y el cliente nunca verifica que se **supone** que sea la tuya.

## El código: cómo funciona el mod

El mod `cape-mod` es diminuto -- 65 líneas de Java. Aquí está el corazón:

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
1. **Mixin** sobre `Player.getGameProfile()` -- el punto donde se devuelve el perfil del jugador
2. Verifica que es un servidor local (Integrated Server)
3. Verifica que es el host (mundo LAN)
4. **Reemplaza** la propiedad `textures` por la de Jeb_ (hardcodeada)
5. Devuelve un nuevo `GameProfile` con las texturas inyectadas

El `GameProfile` está **forjado**: es un perfil construido artificialmente, que no corresponde al jugador real. Las propiedades `textures` están **reutilizadas** de Jeb_ -- la firma RSA es auténtica pero aplicada al perfil equivocado. El paquete de red, en cambio, es legítimo: el servidor envía normalmente el `ClientboundPlayerInfoUpdatePacket` con este perfil modificado. Es el perfil el que está forjado, no el paquete.

Cuando los amigos del host se conectan por LAN, reciben el `ClientboundPlayerInfoUpdatePacket` con el perfil modificado. El cliente:
1. Decodifica el payload base64
2. Verifica la firma RSA → ✅ válida (es genuinamente la de Jeb_)
3. Marca la skin como `secure=true` (porque la firma es válida)
4. Pasa el filtro `!isRemote || ps.secure()` → ✅ pasa
5. **Descarga y muestra la capa de Jeb_**

## Resultado en el juego: la capa sobre tu skin

Esto es lo que se ve in-game. Primero, vista frontal con la capa de Jeb_ mostrada en el host:

![Cape Mod -- Capa de Jeb_ mostrada en el host](/images/cape-mod/cape-01-jeb-cape.png)

Se ve claramente el patrón rojo/blanco de la capa oficial de Mojang Studios. Sin diferencia con un verdadero Jeb_ que tuviera su propia capa -- el cliente descarga exactamente la misma textura desde `textures.minecraft.net`.

Y en vista inmersiva, dentro de una partida real:

![Cape Mod -- Vista en juego con capa visible](/images/cape-mod/cape-02-lava-cape.png)

La capa flota detrás del jugador, ondea con el movimiento. Perfectamente indistinguible de una skin auténtica con capa oficial.

Otro ángulo, en un mundo con lava y terreno:

![Cape Mod -- Capa en un entorno natural](/images/cape-mod/cape-03-local-game.png)

Y una última vista cercana del gameplay real, donde se ve la capa en acción:

![Cape Mod -- Capa en gameplay clásico de Minecraft](/images/cape-mod/cape-04-real-gameplay.png)

Para alguien que se uniera a un LAN sin saber que el host tiene un mod, no hay absolutamente ninguna forma de distinguir esto de una capa real de Mojang. Eso es precisamente el punto: **la firma es válida**, el cliente no tiene ninguna razón para dudar.

## Por qué es una falla (y por qué no lo es)

Es irónico: el exploit funciona **precisamente porque la firma es válida**. No hay un bypass criptográfico aquí -- es peor, es una **falla lógica** en el modelo de confianza.

| Check | Resultado |
|---|---|
| **Validez de la firma RSA** | ✅ Válida (firmada por Mojang para Jeb_) |
| **¿El `profileId` en el payload corresponde al UUID del host?** | ❌ No (UUID de Jeb_ ≠ UUID del host) |
| **¿El cliente verifica la correspondencia?** | ❌ **No. Solo se verifica la firma RSA.** |

Minecraft confía **en la firma**, no en la identidad de quien la porta. Mientras la firma venga de Mojang, el cliente la acepta. Es como mostrar un pasaporte falso firmado por el gobierno -- el sello es legítimo, aunque el pasaporte no te pertenezca.

## Las implicaciones de seguridad

### Alcance limitado al LAN

El mod solo funciona en un servidor integrado (LAN). El atacante debe:
- Tener un mod Fabric instalado
- Ser el host de un mundo LAN
- Sus amigos se conectan sin mod (vanilla)

### Pero las posibilidades se amplían

En teoría, con la misma técnica, se podría:
- **Reinyectar otros datos firmados**: cabezas, encantamientos ilegales, componentes de chat maliciosos
- **Combinar con un túnel LAN** (NGROK, playit.gg, Radmin VPN) para afectar jugadores por internet
- **Extender a otras propiedades** del perfil que dependen de firmas

### Por qué Mojang probablemente no lo parcheará

No hay una "vulnerabilidad" en el sentido estricto -- la firma es válida. Parchear esto requeriría que Mojang modificara el modelo de autenticación completo, lo cual es complejo. Por ahora, es un caso extremo: se supone que los jugadores LAN confían entre sí.

## La trampa filosófica

Cape Mod es una excelente **prueba de concepto** de una verdad más amplia: **nunca debes confiar en una firma sin verificar quién la firmó y sobre qué asunto**.

Es una lección de criptografía básica. RSA firma un **mensaje**, no una **identidad**. Si te doy una firma RSA válida de Mojang, sabes que Mojang firmó *algo*. No sabes para quién, y no puedes asumirlo solo mirando el mensaje.

Es exactamente lo que pasó con los certificados SSL/TLS en los años 2000 cuando las CA aceptaban cualquier cosa -- la firma era válida, pero se aplicaba al dominio equivocado.

## Conclusión

Cape Mod no es un hack en el sentido clásico -- es una explotación elegante de una falta de validación lógica en Minecraft. Muestra que:

1. **Una firma válida no garantiza la identidad de quien la porta**
2. **En LAN, la confianza es más débil** de lo que creemos
3. **Las propiedades `textures` de Minecraft son esencialmente contenido inyectado** -- hay que verificar que correspondan al jugador que las porta

Si te unes a un mundo LAN en un servidor "desconocido" (o más bien, cuyo host tiene un mod sospechoso), ya tienes un problema de seguridad mucho antes de la capa. Pero es sintomático: Minecraft asume que todos en un LAN confían entre sí. Es cierto... hasta que deja de serlo.

---

**Recursos**

- **GitHub**: [fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **Auth de Minecraft**: [Protocolo Yggdrasil](https://wiki.vg/Authentication) (wiki.vg)
- **Criptografía RSA**: [RFC 3447](https://tools.ietf.org/html/rfc3447) (PKCS #1)

**3 puntos clave**

1. Las firmas RSA validan un mensaje, no una identidad -- un detalle que le ha costado caro a muchos sistemas.
2. Minecraft no verifica que el perfil del jugador corresponda a la firma que recibe -- una falla lógica, no criptográfica.
3. En LAN o en túnel, todo está abierto de par en par para un mod que controla el servidor integrado.
