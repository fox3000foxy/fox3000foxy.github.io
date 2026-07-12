---
title: "Cape Mod: how to steal Jeb_'s cape with RSA signature injection"
description: "A Fabric mod that exploits a logical flaw in Minecraft's trust system: a valid Mojang RSA signature but replayed on a wrong account. Code explanation, security implications, and cryptographic lessons."
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
author_sig: "k25rfgWYavSEgVL20yKulijIqgh69x2PizEwSxIv7rnEhAdGJF6C7GcrrlnIhhk/UylKZtGRRsDJC7cjVSoqCw=="
---

# Cape Mod: how to steal Jeb_'s cape with RSA signature injection

![alt text](assets/xbox-profile.png)
What if I told you that all it takes is a single valid RSA signature -- but for the **wrong account** -- to make your friends believe you're wearing the official Mojang cape? Welcome to `cape-mod`, a Fabric exploit that shows how Minecraft trusts a signature without verifying that the profile it belongs to is actually yours.

## The context: how Minecraft handles skins and capes

In Java Edition, there is a question we don't often ask: **who is responsible for displaying a player's skin and cape -- the client or the server?**

The answer is nuanced:

| Component | Who sends it? | Who downloads it? |
|---|---|---|
| **Skin texture** | The server sends the signed URL | The client downloads from `textures.minecraft.net` |
| **Cape texture** | The server sends the signed URL | The client downloads from `textures.minecraft.net` |
| **`textures` property** | The server sends the `GameProfile` from Mojang auth | The client verifies the RSA signature |

The key point: everything is contained in a property called `textures` of the `GameProfile`. This property contains:
- A base64 JSON payload with the texture URLs
- An **RSA signature** made with Mojang's private key

## The RSA signature wall

Each `textures` property looks like this when decoded:

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

The client verifies the RSA signature against the **public key embedded in the jar** (`yggdrasil_session_pubkey.der`):

```java
// Property.java (authlib)
public boolean isSignatureValid(PublicKey publicKey) {
    Signature sig = Signature.getInstance("SHA1withRSA");
    sig.initVerify(publicKey);
    sig.update(this.value.getBytes());
    return sig.verify(Base64.decodeBase64(this.signature));
}
```

For remote players (not local), the client only accepts skins **marked as `secure`** -- that is, with a valid signature:

```java
// SkinManager.createLookup() -- simplified
PlayerSkin skin = optional
    .filter(ps -> !isRemote || ps.secure())  // ← remote players must be secured
    .orElse(defaultSkin);
```

This check prevents spoofing in theory. But that's where things get interesting.

## The flaw: signature replay

The client checks that the RSA signature **is valid**. But it **never** checks whether the `profileId` inside the JSON matches the player's actual UUID.

In other words: a `textures` property taken from an **existing Mojang account** (for example, a Mojang employee's) can be replayed onto any other player. The signature remains valid -- it was genuinely made by Mojang -- it just came from a different account.

### How to extract a genuine signature?

Jeb_ (UUID `853c80ef-3c37-49fd-aa49-938b674adae6`) has the Mojang Studios cape. From the Mojang session server:

```bash
curl -s "https://sessionserver.mojang.com/session/minecraft/profile/853c80ef-3c37-49fd-aa49-938b674adae6?unsigned=false"
```

Response:

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

The `signature` of this `value` field was produced by Mojang. It's RSA-2048 SHA-1. It is **absolutely** valid, even if you replay it on another UUID -- because Jeb_'s signature remains Jeb_'s signature, and the client never checks that it's **supposed** to be yours.

## The code: how the mod works

The `cape-mod` mod is tiny -- 65 lines of Java. Here is the core:

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

        // Replace the textures property with Jeb_'s
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

**Steps**:
1. **Mixin** on `Player.getGameProfile()` -- the point where the player's profile is returned
2. Check that this is a local server (Integrated Server)
3. Check that this is the host (LAN world)
4. **Replace** the `textures` property with Jeb_'s (hardcoded)
5. Return a new `GameProfile` with the injected textures

The `GameProfile` is therefore **forged**: it is an artificially constructed profile that does not correspond to the real player. The `textures` properties are **replayed** from Jeb_ -- the RSA signature is authentic but applied to the wrong profile. The network packet, however, is legitimate: the server normally sends the `ClientboundPlayerInfoUpdatePacket` with this modified profile. It is the profile that is forged, not the packet.

When the host's friends join via LAN, they receive the `ClientboundPlayerInfoUpdatePacket` with the modified profile. The client:
1. Decodes the base64 payload
2. Verifies the RSA signature -- ✅ valid (it's genuinely Jeb_'s)
3. Marks the skin as `secure=true` (because the signature is valid)
4. Passes the `!isRemote || ps.secure()` filter -- ✅ passes
5. **Downloads and displays Jeb_'s cape**

## In-game result: the cape on your skin

Here's what it looks like in-game. First, a front view with Jeb_'s cape displayed on the host:

![Cape Mod -- Jeb_ cape displayed on the host](/images/cape-mod/cape-01-jeb-cape.png)

You can clearly see the red/white pattern of the official Mojang Studios cape. No difference from a real Jeb_ who has his own cape -- the client downloads exactly the same texture from `textures.minecraft.net`.

And in immersive view, in an actual game:

![Cape Mod -- in-game view with cape visible](/images/cape-mod/cape-02-lava-cape.png)

The cape floats behind the player, waving with movement. Perfectly indistinguishable from an authentic skin with an official cape.

Another angle, in a world with lava and terrain:

![Cape Mod -- cape in a natural environment](/images/cape-mod/cape-03-local-game.png)

And one last close-up view of actual gameplay, showing the cape in action:

![Cape Mod -- cape in classic Minecraft gameplay](/images/cape-mod/cape-04-real-gameplay.png)

For someone joining a LAN without knowing the host has a mod, there is absolutely no way to distinguish this from a real Mojang cape. That's precisely the point: **the signature is valid**, the client has no reason to doubt.

## Why this is a flaw (and why it isn't)

It's ironic: the exploit works **precisely because the signature is valid**. There is no cryptographic bypass here -- it's worse, it's a **logical flaw** in the trust model.

| Check | Result |
|---|---|
| **RSA signature validity** | ✅ Valid (signed by Mojang for Jeb_) |
| **Does the `profileId` in the payload match the host's UUID?** | ❌ No (Jeb_'s UUID != host's UUID) |
| **Does the client verify the match?** | ❌ **No. Only the RSA signature is verified.** |

Minecraft trusts **the signature**, not the identity of who carries it. As long as the signature comes from Mojang, the client accepts it. It's like showing a fake passport signed by the government -- the seal is legitimate, even though the passport doesn't belong to you.

## Security implications

### Limited scope to LAN

The mod only works on an integrated server (LAN). The attacker must:
- Have a Fabric mod installed
- Be the host of a LAN world
- Friends connect without a mod (vanilla)

### But the possibilities go further

In theory, with the same technique, one could:
- **Reinject other signed data**: heads, illegal enchantments, malicious chat components
- **Combine with a LAN tunnel** (NGROK, playit.gg, Radmin VPN) to affect players over the internet
- **Extend to other profile properties** that rely on signatures

### Why Mojang probably won't patch this

There is no "vulnerability" in the strict sense -- the signature is valid. Patching this would require Mojang to change the entire authentication model, which is complex. For now, it's an edge case: LAN players are assumed to trust each other.

## The philosophical trap

Cape Mod is an excellent **proof of concept** of a broader truth: **you must never trust a signature without verifying who signed it and for what subject**.

It's a lesson in basic cryptography. RSA signs a **message**, not an **identity**. If I give you a valid RSA signature from Mojang, you know that Mojang has signed *something*. You don't know for whom, and you can't assume it just by looking at the message.

This is exactly what happened with SSL/TLS certificates in the 2000s when CAs would sign anything -- the signature was valid, but it applied to the wrong domain.

## Conclusion

Cape Mod is not a hack in the classic sense -- it is an elegant exploitation of a missing validation check in Minecraft. It shows that:

1. **A valid signature does not guarantee the identity of the person carrying it**
2. **On LAN, trust is weaker** than we believe
3. **Minecraft's `textures` properties are essentially injected content** -- they must be checked to match the player who carries them

If you join a LAN world on an "unknown" server (or rather, one whose host has a suspicious mod), you already have a security problem well before the cape. But it's symptomatic: Minecraft assumes everyone on a LAN trusts each other. That's true... until it isn't.

---

**Resources**

- **GitHub**: [fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **Minecraft auth**: [Yggdrasil protocol](https://wiki.vg/Authentication) (wiki.vg)
- **RSA cryptography**: [RFC 3447](https://tools.ietf.org/html/rfc3447) (PKCS #1)

**3 key points**

1. RSA signatures validate a message, not an identity -- a detail that has cost many systems dearly.
2. Minecraft does not check that the player's profile matches the signature it receives -- a logical flaw, not a cryptographic one.
3. On LAN or through a tunnel, anything goes for a mod that controls the integrated server.
