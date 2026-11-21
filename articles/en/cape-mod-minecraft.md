---
title: "Cape Mod: How to Steal Jeb_'s Cape With an RSA Signature Injection"
description: "A Fabric mod exploiting a logic flaw in Minecraft's trust system: an RSA signature valid from Mojang but replayed onto the wrong account. Code walkthrough, security implications, and cryptographic lessons."
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
author_sig: "4djF022LJAin5qglDbomm4a+pXgQSI60nOggrvm8303w3Gf4v8+j859aVZS7GAN2L5ZkehhKtH7jEUabY2r1PA=="
---

# Cape Mod: how to steal Jeb_'s cape with an RSA signature injection

![alt text](assets/xbox-profile.png)

What if I told you a valid RSA signature -- but for the **wrong account** -- is enough to make your friends believe you're wearing Mojang's official cape? Welcome to `cape-mod`, a Fabric exploit showing how Minecraft trusts a signature while skipping the check that the profile it belongs to is actually yours.

## Context: how Minecraft handles skins and capes

In Java Edition, there's a rarely asked question: **who is responsible for displaying a player's skin and cape -- the client or the server?**

The nuanced answer:

| Component | Who sends it? | Who downloads it? |
|---|---|---|
| **Skin texture** | The server sends the signed URL | The client downloads from `textures.minecraft.net` |
| **Cape texture** | The server sends the signed URL | The client downloads from `textures.minecraft.net` |
| **`textures` property** | The server sends the `GameProfile` from Mojang auth | The client verifies the RSA signature |

The key point: everything sits in a property called `textures` on the `GameProfile`. That property holds:
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

The client verifies the RSA signature against the **public key baked into the jar** (`yggdrasil_session_pubkey.der`):

```java
// Property.java (authlib)
public boolean isSignatureValid(PublicKey publicKey) {
    Signature sig = Signature.getInstance("SHA1withRSA");
    sig.initVerify(publicKey);
    sig.update(this.value.getBytes());
    return sig.verify(Base64.decodeBase64(this.signature));
}
```

For remote players (outside local play), the client only accepts skins marked **`secure`** -- i.e. with a valid signature:

```java
// SkinManager.createLookup() -- simplified
PlayerSkin optional = ...
    .filter(ps -> !isRemote || ps.secure())  // ← remote players must be secure
    .orElse(defaultSkin);
```

That check blocks spoofing in theory. But validation stops there, and that's exactly where the attack starts.

## The flaw: signature replay

The client checks that the RSA signature **is valid**. It systematically skips checking that the `profileId` inside the JSON matches the player's actual UUID.

In other words: a `textures` property taken from an **existing Mojang account** (say a Mojang employee's) can be replayed onto any other player. The signature stays valid -- it was genuinely produced by Mojang -- it just comes from a different account.

### How to extract a real signature?

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

That field's `signature` was produced by Mojang. It's RSA-2048 SHA-1. It's **absolutely** valid, even if you replay it onto another UUID -- because Jeb_'s signature stays Jeb_'s signature, and the client skips checking who it was meant for.

## The code: how the mod works

The `cape-mod` mod is tiny -- 65 lines of Java. Here's the core:

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
2. Check it's a local server (Integrated Server)
3. Check it's the host (LAN world)
4. **Replace** the `textures` property with Jeb_'s (hardcoded)
5. Return a new `GameProfile` with the injected textures

The `GameProfile` is therefore **forged**: it's an artificially built profile that doesn't match the real player. The `textures` properties are **replayed** from Jeb_ -- the RSA signature is authentic but applied to the wrong profile. The network packet, on the other hand, is legitimate: the server normally sends the `ClientboundPlayerInfoUpdatePacket` with that modified profile. It's the profile that's forged; the packet stays legitimate.

When the host's friends join over LAN, they receive the `ClientboundPlayerInfoUpdatePacket` with the modified profile. The client:
1. Decodes the base64 payload
2. Verifies the RSA signature → ✅ valid (it's really Jeb_'s)
3. Marks the skin as `secure=true` (since the signature is valid)
4. Passes the `!isRemote || ps.secure()` filter → ✅ passes
5. **Downloads and displays Jeb_'s cape**

## In-game result: the cape on your skin

Here's what it looks like in game. First, front view with Jeb_'s cape displayed on the host:

![Cape Mod -- Jeb_ cape shown on the host](/images/cape-mod/cape-01-jeb-cape.png)

You can clearly see the red/white pattern of the official Mojang Studios cape. The render is identical to a real Jeb_ wearing his own cape -- the client downloads exactly the same texture from `textures.minecraft.net`.

And in immersive view, in a real game:

![Cape Mod -- in-game view with visible cape](/images/cape-mod/cape-02-lava-cape.png)

The cape floats behind the player, waves with movement. Perfectly indistinguishable from an authentic skin with an official cape.

Another angle, in a world with lava and terrain:

![Cape Mod -- cape in a natural environment](/images/cape-mod/cape-03-local-game.png)

And a final close-up of real gameplay, where you see the cape in action:

![Cape Mod -- cape in classic Minecraft gameplay](/images/cape-mod/cape-04-real-gameplay.png)

For someone joining a LAN without knowing the host uses a mod, the cape looks visually identical to a real Mojang cape. That's precisely the point: **the signature is valid**, so the client treats it as legitimate.

## Why it's a flaw (and why it isn't one)

It's ironic: the exploit works **precisely because the signature is valid**. This isn't a crypto bypass -- it's worse: a **logic flaw** in the trust model.

| Check | Result |
|---|---|
| **RSA signature validity** | ✅ Valid (signed by Mojang for Jeb_) |
| **Does the `profileId` in the payload match the host's UUID?** | ❌ No (Jeb_'s UUID ≠ host's UUID) |
| **Does the client check the match?** | ❌ **No. Only the RSA signature is verified.** |

Minecraft trusts **the signature** rather than the identity of whoever carries it. As long as the signature comes from Mojang, the client accepts it. It's like showing a fake passport signed by the government -- the seal is legitimate, even though the passport doesn't belong to you.

## Security implications

### Scope limited to LAN

The mod only works on an integrated server (LAN). The attacker must:
- Have a Fabric mod installed
- Be the host of a LAN world
- Their friends connect without mods (vanilla)

### But the possibilities widen

In theory, with the same technique, you could:
- **Reinject other signed data**: heads, illegal enchantments, malicious chat components
- **Combine with a LAN tunnel** (NGROK, playit.gg, Radmin VPN) to affect players over the internet
- **Extend to other profile properties** that rely on signatures

### Why Mojang probably won't patch

This isn't a "vulnerability" in the strict sense -- the signature is valid. Patching it would require Mojang to change the whole authentication model, which is complex. For now, it's an edge case: LAN players are assumed to trust each other.

## The philosophical trap

Cape Mod is an excellent **proof of concept** of a broader truth: **you must always check who signed data and for which subject before trusting it**.

It's a basic crypto lesson. RSA signs a **message**; the recipient's **identity** stays outside the signature. If I hand you a valid Mojang RSA signature, all you know is that Mojang signed *something*, with no reliable indication of the recipient from the message alone.

That's exactly what happened with SSL/TLS certificates in the 2000s when CAs signed certificates without properly verifying the domain -- the signature was valid, but it applied to the wrong domain.

## Conclusion

Cape Mod is something other than a hack in the classic sense -- it's an elegant exploitation of a missing logic check in Minecraft. It shows that:

1. **A valid signature doesn't guarantee the identity of whoever carries it**
2. **On LAN, trust is weaker** than you'd think
3. **Minecraft's `textures` properties are essentially injected content** -- you must check they match the player carrying them

If you join a LAN world on an "unknown" server (or rather, one whose host runs a suspicious mod), you already have a security problem way before the cape. But it's revealing: Minecraft assumes everyone on a LAN trusts each other. That's true... until the first host abuses that trust.

---

**Resources**

- **GitHub**: [fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **Minecraft auth**: [Yggdrasil protocol](https://wiki.vg/Authentication) (wiki.vg)
- **RSA cryptography**: [RFC 3447](https://tools.ietf.org/html/rfc3447) (PKCS #1)

**3 key points**

1. Valid RSA signatures validate a message, not an identity -- a detail that has cost many systems dearly.
2. Minecraft skips checking that the player's profile matches the signature it receives -- a logic flaw in validation, with intact cryptography.
3. On LAN or tunneled, it's all open bar for a mod controlling the integrated server.
