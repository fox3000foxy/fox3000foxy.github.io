---
title: "Cape Mod: wie man Jeb_s Cape mit einer RSA-Signaturinjektion klaut"
description: "Ein Fabric-Mod, der eine Logiklücke im Vertrauenssystem von Minecraft ausnutzt: eine gültige RSA-Signatur von Mojang, aber replayt auf ein falsches Konto. Erklärung des Codes, Sicherheitsimplikationen und kryptografische Lehren."
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
author_sig: "RsNclPqGWpaa9+WLxX/v0JkTrwR3HGt4Wqu83Nmt973bVmSZIZX5NUGhH+PtheJ1tladEx0GeVn2cu87+xNlyg=="
---

# Cape Mod: wie man Jeb_s Cape mit einer RSA-Signaturinjektion klaut

![alt text](assets/xbox-profile.png)

Was, wenn ich dir sagen würde, dass eine gültige RSA-Signatur reichte, aber für das **falsche Konto**, um deine Freunde glauben zu lassen, du trägst die offizielle Mojang-Cape? Willkommen bei `cape-mod`, einem Fabric-Exploit, der zeigt, wie Minecraft einer Signatur vertraut und dabei vergisst zu prüfen, ob das Profil, zu dem sie gehört, wirklich deines ist.

## Der Kontext: wie Minecraft Skins und Capes handhabt

In der Java Edition gibt es eine selten gestellte Frage: **Wer ist verantwortlich, den Skin und die Cape eines Spielers anzuzeigen, der Client oder der Server ?**

Die Antwort ist nuanciert:

| Komponente | Wer schickt sie? | Wer lädt sie herunter? |
|---|---|---|
| **Skin-Textur** | Der Server schickt die signierte URL | Der Client lädt von `textures.minecraft.net` herunter |
| **Cape-Textur** | Der Server schickt die signierte URL | Der Client lädt von `textures.minecraft.net` herunter |
| **`textures`-Eigenschaft** | Der Server schickt das `GameProfile` aus der Mojang-Auth | Der Client prüft die RSA-Signatur |

Der springende Punkt: Alles steckt in einer Eigenschaft namens `textures` des `GameProfile`. Diese Eigenschaft enthält:
- Einen base64-codierten JSON-Payload mit den Textur-URLs
- Eine **RSA-Signatur** mit Mojangs privatem Schlüssel gemacht

## Die Mauer der RSA-Signatur

Jede `textures`-Eigenschaft sieht so aus, wenn man sie dekodiert:

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

Der Client prüft die RSA-Signatur gegen den **im Jar eingebetteten öffentlichen Schlüssel** (`yggdrasil_session_pubkey.der`):

```java
// Property.java (authlib)
public boolean isSignatureValid(PublicKey publicKey) {
    Signature sig = Signature.getInstance("SHA1withRSA");
    sig.initVerify(publicKey);
    sig.update(this.value.getBytes());
    return sig.verify(Base64.decodeBase64(this.signature));
}
```

Für entfernte Spieler (außerhalb des lokalen Spiels) akzeptiert der Client nur Skins, die als **`secure`** markiert sind, also mit gültiger Signatur:

```java
// SkinManager.createLookup() – vereinfacht
PlayerSkin skin = optional
    .filter(ps -> !isRemote || ps.secure())  // ← entfernte Spieler müssen sicher sein
    .orElse(defaultSkin);
```

Dieser Check blockiert Spoofing in der Theorie. Aber die Validierung hört dort auf, und genau dort beginnt der Angriff.

## Die Lücke: Signature Replay

Der Client prüft, dass die RSA-Signatur **gültig ist**. Er vergisst systematisch zu prüfen, dass die im JSON enthaltene `profileId` der echten UUID des Spielers entspricht.

Anders gesagt: Eine `textures`-Eigenschaft von einem **existierenden Mojang-Konto** (zum Beispiel dem eines Mojang-Mitarbeiters) kann auf jeden anderen Spieler replayt werden. Die Signatur bleibt gültig, sie wurde wirklich von Mojang produziert, sie kommt nur von einem anderen Konto.

### Wie extrahiert man eine echte Signatur?

Jeb_ (UUID `853c80ef-3c37-49fd-aa49-938b674adae6`) hat die Mojang-Studios-Cape. Vom Mojang-Session-Server:

```bash
curl -s "https://sessionserver.mojang.com/session/minecraft/profile/853c80ef-3c37-49fd-aa49-938b674adae6?unsigned=false"
```

Antwort:

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

Die `signature` dieses `value`-Felds wurde von Mojang produziert. Es ist RSA-2048 SHA-1. Sie ist **absolut** gültig, selbst wenn du sie auf eine andere UUID replayst, weil Jeb_s Signatur Jeb_s Signatur bleibt, und der Client vergisst zu kontrollieren, für wen sie bestimmt war.

## Der Code: wie der Mod funktioniert

Der `cape-mod`-Mod ist winzig, 65 Zeilen Java. Hier das Herz:

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

        // Ersetzt die Eigenschaft Texturen durch die Eigenschaft Jeb_
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

**Schritte**:
1. **Mixin** auf `Player.getGameProfile()`, den Punkt, an dem das Spielerprofil zurückgegeben wird
2. Prüft, dass es ein lokaler Server ist (Integrated Server)
3. Prüft, dass es der Host ist (LAN-Welt)
4. **Ersetzt** die `textures`-Eigenschaft durch die von Jeb_ (hardcodiert)
5. Gibt ein neues `GameProfile` mit den injizierten Texturen zurück

Das `GameProfile` ist also **gefälscht**: Es ist ein künstlich gebautes Profil, das nicht zum echten Spieler passt. Die `textures`-Eigenschaften sind von Jeb_ **replayt**, die RSA-Signatur ist authentisch, aber auf das falsche Profil angewendet. Das Netzwerkpaket dagegen ist legitim: Der Server schickt normal das `ClientboundPlayerInfoUpdatePacket` mit diesem modifizierten Profil. Das Profil ist gefälscht; das Paket bleibt legitim.

Wenn die Freunde des Hosts via LAN beitreten, erhalten sie das `ClientboundPlayerInfoUpdatePacket` mit dem modifizierten Profil. Der Client:
1. Dekodiert den base64-Payload
2. Prüft die RSA-Signatur → ✅ gültig (es ist wirklich die von Jeb_)
3. Markiert den Skin als `secure=true` (weil die Signatur gültig ist)
4. Passiert den Filter `!isRemote || ps.secure()` → ✅ passiert
5. **Lädt Jeb_s Cape herunter und zeigt sie an**

## Ergebnis im Spiel: die Cape auf deinem Skin

So sieht es in-game aus. Zuerst Frontalansicht mit Jeb_s Cape auf dem Host angezeigt:

![Cape Mod -- Jeb_ Cape auf dem Host angezeigt](/images/cape-mod/cape-01-jeb-cape.png)

Man sieht klar das rot/weiße Muster der offiziellen Mojang-Studios-Cape. Das Rendering bleibt identisch zu dem eines echten Jeb_, der seine eigene Cape trägt, der Client lädt exakt dieselbe Textur von `textures.minecraft.net` herunter.

Und in immersiver Ansicht, in einer echten Partie:

![Cape Mod -- vue en jeu avec cape visible](/images/cape-mod/cape-02-lava-cape.png)

Die Cape flattert hinter dem Spieler, wellt sich mit der Bewegung. Perfekt ununterscheidbar von einem authentischen Skin mit offizieller Cape.

Anderer Winkel, in einer Welt mit Lava und Terrain:

![Cape Mod -- cape dans un environnement naturel](/images/cape-mod/cape-03-local-game.png)

Und eine letzte Nahansicht des echten Gameplays, wo man die Cape in Aktion sieht:

![Cape Mod -- cape en gameplay classique Minecraft](/images/cape-mod/cape-04-real-gameplay.png)

Für jemanden, der einem LAN beitreten würde, ohne zu wissen, dass der Host einen Mod nutzt, bleibt die Cape visuell identisch zu einer echten Mojang-Cape. Genau das ist der Punkt: **Die Signatur ist gültig**, der Client behandelt sie also als legitim.

## Warum das eine Lücke ist (und warum keine)

Es ist ironisch: Der Exploit funktioniert **genau weil die Signatur gültig ist**. Es geht um etwas anderes als einen kryptografischen Bypass, es ist schlimmer: Eine **Logiklücke** im Vertrauensmodell.

| Check | Ergebnis |
|---|---|
| **Gültigkeit der RSA-Signatur** | ✅ Gültig (von Mojang für Jeb_ signiert) |
| **Entspricht die `profileId` im Payload der UUID des Hosts ?** | ❌ Nein (Jeb_s UUID ≠ Host-UUID) |
| **Prüft der Client die Übereinstimmung ?** | ❌ **Nein. Nur die RSA-Signatur wird geprüft.** |

Minecraft vertraut **der Signatur** statt der Identität dessen, der sie trägt. Solange die Signatur von Mojang kommt, akzeptiert der Client sie. Es ist wie einen gefälschten von der Regierung signierten Pass zu zeigen, das Siegel ist legitim, auch wenn der Pass dir nicht gehört.

## Die Sicherheitsimplikationen

### Auf LAN begrenzte Reichweite

Der Mod funktioniert nur auf einem integrierten Server (LAN). Der Angreifer muss:
- Einen installierten Fabric-Mod haben
- Host einer LAN-Welt sein
- Seine Freunde verbinden sich ohne Mod (vanilla)

### Aber die Möglichkeiten erweitern sich

In der Theorie könnte man mit derselben Technik:
- **Andere signierte Daten reinjizieren**: Heads, illegale Enchantments, bösartige Chat-Komponenten
- **Mit einem LAN-Tunnel kombinieren** (NGROK, playit.gg, Radmin VPN), um Spieler im Internet zu betreffen
- **Auf andere Eigenschaften** des Profils ausweiten, die von Signaturen abhängen

### Warum Mojang wahrscheinlich nicht patchen wird

Es geht um etwas anderes als eine "Schwachstelle" im strengen Sinn, die Signatur ist gültig. Das zu patchen würde erfordern, dass Mojang das komplette Authentifizierungsmodell ändert, was komplex ist. Vorerst ist es ein Grenzfall: LAN-Spieler sollen einander vertrauen.

## Die philosophische Falle

Cape Mod ist ein exzellenter **Proof of Concept** einer breiteren Wahrheit: **Du musst immer prüfen, wer Daten signiert hat und für welches Subjekt, bevor du ihnen vertraust.**

Das ist eine Lektion in Basiskryptografie. RSA signiert eine **Nachricht**; die **Identität** des Empfängers bleibt außerhalb der Signatur. Wenn ich dir eine gültige RSA-Signatur von Mojang gebe, weißt du nur, dass Mojang *etwas* signiert hat, ohne verlässliche Angabe zum Empfänger aus der bloßen Nachricht.

Genau das passierte mit SSL/TLS-Zertifikaten in den 2000ern, als CAs Zertifikate signierten, ohne die Domain korrekt zu prüfen, die Signatur war gültig, galt aber für die falsche Domain.

## Fazit

Cape Mod ist etwas anderes als ein Hack im klassischen Sinn, es ist eine elegante Ausnutzung fehlender Logikvalidierung in Minecraft. Es zeigt, dass:

1. **Eine gültige Signatur garantiert nicht die Identität dessen, der sie trägt**
2. **In LAN ist das Vertrauen schwächer**, als man glaubt
3. **Minecrafts `textures`-Eigenschaften sind im Wesentlichen injizierter Inhalt**, man muss prüfen, dass sie zum Spieler passen, der sie trägt

Wenn du einer LAN-Welt auf einem "unbekannten" Server beitrittst (oder eher, dessen Host einen verdächtigen Mod hat), hast du schon ein Sicherheitsproblem lange vor der Cape. Aber es ist aufschlussreich: Minecraft nimmt an, dass sich alle in einem LAN vertrauen. Das stimmt... bis zum ersten Host, der dieses Vertrauen missbraucht.

---

**Ressourcen**

- **GitHub**: [fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **Minecraft auth**: [Yggdrasil protocol](https://wiki.vg/Authentication) (wiki.vg)
- **RSA Kryptografie**: [RFC 3447](https://tools.ietf.org/html/rfc3447) (PKCS #1)

**3 Kernpunkte**

1. RSA-Signaturen validieren eine Nachricht statt einer Identität, ein Detail, das viele Systeme teuer gekostet hat.
2. Minecraft vergisst zu prüfen, dass das Spielerprofil der Signatur entspricht, die es empfängt, eine Logiklücke in der Validierung bei intakter Kryptografie.
3. In LAN oder Tunnel ist alles Open Bar für einen Mod, der den integrierten Server kontrolliert.
