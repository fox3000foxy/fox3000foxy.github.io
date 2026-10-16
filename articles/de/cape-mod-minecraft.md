---
title: "Cape Mod: Wie man Jeb_s Cape mit einer RSA-Signatur-Injektion stiehlt"
description: "Ein Fabric-Mod, der eine logische Schwachstelle im Vertrauenssystem von Minecraft ausnutzt: eine gültige RSA-Signatur von Mojang, die jedoch auf das falsche Konto replayiert wird. Code-Erklärung, Sicherheitsimplikationen und kryptografische Lektionen."
date: 2026-07-11
authors:
  - fox3000foxy
tags:
  - minecraft
  - fabric
  - java
  - security
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "8bRZ3y0gNZqx0Bzn1sGB0ZN1JCfkKs8+N5Tv6nFb6TkYbt3StvoGIcAzLiPbqd2fWAUPYFQBz1Zj7wxCz5XEjg=="
---

# Cape Mod: Wie man Jeb_s Cape mit einer RSA-Signatur-Injektion stiehlt

![alt text](assets/xbox-profile.png)
Was wäre, wenn ich dir sagte, dass eine gültige RSA-Signatur -- aber für den **falschen Account** -- völlig ausreicht, um deine Freunde glauben zu lassen, du trägst den offiziellen Mojang-Umhang? Willkommen bei `cape-mod`, einem Fabric-Exploit, der zeigt, wie Minecraft einer Signatur vertraut, ohne zu überprüfen, ob das Profil, zu dem sie gehört, tatsächlich deines ist.

## Der Kontext: Wie Minecraft Skins und Capes verwaltet

In der Java Edition stellt sich eine Frage, die man sich nicht oft stellt: **Wer ist dafür verantwortlich, den Skin und den Cape eines Spielers anzuzeigen -- der Client oder der Server?**

Die Antwort ist nuanciert:

| Komponente | Wer sendet sie? | Wer lädt sie herunter? |
|---|---|---|
| **Skin-Textur** | Der Server sendet die signierte URL | Der Client lädt von `textures.minecraft.net` |
| **Cape-Textur** | Der Server sendet die signierte URL | Der Client lädt von `textures.minecraft.net` |
| **Eigenschaft `textures`** | Der Server sendet das `GameProfile` von der Mojang-Auth | Der Client prüft die RSA-Signatur |

Der entscheidende Punkt: Alles ist in einer Eigenschaft namens `textures` des `GameProfile` enthalten. Diese Eigenschaft enthält:
- Ein Base64-JSON-Payload mit den URLs der Texturen
- Eine **RSA-Signatur**, erstellt mit dem privaten Schlüssel von Mojang

## Die RSA-Signatur-Mauer

Jede `textures`-Eigenschaft sieht nach dem Dekodieren so aus:

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

Für entfernte Spieler (nicht lokal) akzeptiert der Client nur Skins, die als `secure` markiert sind -- also mit einer gültigen Signatur:

```java
// SkinManager.createLookup() -- vereinfacht
PlayerSkin skin = optional
    .filter(ps -> !isRemote || ps.secure())  // ← entfernte Spieler müssen sicher sein
    .orElse(defaultSkin);
```

Diese Prüfung verhindert theoretisch Spoofing. Aber hier wird es interessant.

## Die Schwachstelle: Signatur-Replay

Der Client prüft, ob die RSA-Signatur **gültig** ist. Aber er prüft **nie**, ob die im JSON enthaltene `profileId` mit der tatsächlichen UUID des Spielers übereinstimmt.

Mit anderen Worten: Eine `textures`-Eigenschaft, die von einem **bestehenden Mojang-Account** (z. B. dem eines Mojang-Mitarbeiters) stammt, kann auf jeden anderen Spieler replayiert werden. Die Signatur bleibt gültig -- sie wurde echt von Mojang erstellt -- sie stammt nur von einem anderen Account.

### Wie extrahiert man eine echte Signatur?

Jeb_ (UUID `853c80ef-3c37-49fd-aa49-938b674adae6`) hat den Mojang-Studios-Umhang. Vom Mojang-Session-Server:

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

Die `signature` dieses `value`-Feldes wurde von Mojang erstellt. Es ist RSA-2048 SHA-1. Sie ist **absolut** gültig, selbst wenn du sie auf eine andere UUID replays -- denn Jeb_s Signatur bleibt Jeb_s Signatur, und der Client prüft nie, ob sie **angeblich** deine sein soll.

## Der Code: Wie der Mod funktioniert

Der `cape-mod` ist winzig -- 65 Zeilen Java. Hier ist der Kern:

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

        // Ersetzt die textures-Eigenschaft durch die von Jeb_
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
1. **Mixin** auf `Player.getGameProfile()` -- der Punkt, an dem das Spielerprofil zurückgegeben wird
2. Prüft, ob es sich um einen lokalen Server handelt (Integrated Server)
3. Prüft, ob es der Host ist (LAN-Welt)
4. **Ersetzt** die `textures`-Eigenschaft durch die von Jeb_ (hartkodiert)
5. Gibt ein neues `GameProfile` mit den injizierten Texturen zurück

Das `GameProfile` ist also **gekünstelt**: Es ist ein künstlich erstelltes Profil, das nicht dem echten Spieler entspricht. Die `textures`-Eigenschaften sind von Jeb_ **replayed** -- die RSA-Signatur ist authentisch, wird aber auf das falsche Profil angewendet. Das Netzwerkpaket selbst ist legitim: Der Server sendet normalerweise das `ClientboundPlayerInfoUpdatePacket` mit diesem modifizierten Profil. Es ist das Profil, das gekünstelt ist, nicht das Paket.

Wenn die Freunde des Hosts über LAN beitreten, erhalten sie das `ClientboundPlayerInfoUpdatePacket` mit dem modifizierten Profil. Der Client:
1. Dekodiert das Base64-Payload
2. Prüft die RSA-Signatur → ✅ gültig (es ist echt die von Jeb_)
3. Markiert den Skin als `secure=true` (da die Signatur gültig ist)
4. Passiert den Filter `!isRemote || ps.secure()` → ✅ bestanden
5. **Lädt Jeb_s Cape herunter und zeigt ihn an**

## Ergebnis im Spiel: Der Cape auf deinem Skin

So sieht es in-Game aus. Zuerst die Frontansicht mit Jeb_s Cape auf dem Host:

![Cape Mod -- Jeb_s Cape angezeigt auf dem Host](/images/cape-mod/cape-01-jeb-cape.png)

Man erkennt deutlich das rot/weiße Muster des offiziellen Mojang-Studios-Umhangs. Kein Unterschied zu einem echten Jeb_, der seinen eigenen Umhang hätte -- der Client lädt exakt dieselbe Textur von `textures.minecraft.net`.

Und in immersiver Ansicht, in einer echten Spielsitzung:

![Cape Mod -- In-Game-Ansicht mit sichtbarem Cape](/images/cape-mod/cape-02-lava-cape.png)

Der Cape weht hinter dem Spieler her, bewegt sich mit der Bewegung. Perfekt nicht unterscheidbar von einem authentischen Skin mit offiziellem Cape.

Ein anderer Winkel, in einer Welt mit Lava und Gelände:

![Cape Mod -- Cape in einer natürlichen Umgebung](/images/cape-mod/cape-03-local-game.png)

Und eine letzte Nahaufnahme des tatsächlichen Gameplays, die den Cape in Aktion zeigt:

![Cape Mod -- Cape im klassischen Minecraft-Gameplay](/images/cape-mod/cape-04-real-gameplay.png)

Für jemanden, der einem LAN beitritt, ohne zu wissen, dass der Host einen Mod hat, gibt es absolut keine Möglichkeit, dies von einem echten Mojang-Cape zu unterscheiden. Das ist genau der Punkt: **Die Signatur ist gültig**, der Client hat keinen Grund zu zweifeln.

## Warum das eine Schwachstelle ist (und warum nicht)

Ironisch: Der Exploit funktioniert **gerade weil die Signatur gültig ist**. Es gibt hier keinen kryptografischen Bypass -- es ist schlimmer, es ist eine **logische Schwachstelle** im Vertrauensmodell.

| Prüfung | Ergebnis |
|---|---|
| **Gültigkeit der RSA-Signatur** | ✅ Gültig (von Mojang für Jeb_ signiert) |
| **Entspricht die `profileId` im Payload der UUID des Hosts?** | ❌ Nein (Jeb_s UUID ≠ UUID des Hosts) |
| **Prüft der Client die Übereinstimmung?** | ❌ **Nein. Nur die RSA-Signatur wird geprüft.** |

Minecraft vertraut **der Signatur**, nicht der Identität des Trägers. Solange die Signatur von Mojang stammt, akzeptiert sie der Client. Es ist, als würde man einen gefälschten Reisepass zeigen, der von der Regierung signiert wurde -- das Siegel ist echt, auch wenn der Pass nicht dir gehört.

## Die Sicherheitsimplikationen

### Begrenzter Umfang auf LAN

Der Mod funktioniert nur auf einem integrierten Server (LAN). Der Angreifer muss:
- Einen installierten Fabric-Mod haben
- Der Host einer LAN-Welt sein
- Seine Freunde verbinden sich ohne Mod (Vanilla)

### Aber die Möglichkeiten erweitern sich

Theoretisch könnte man mit derselben Technik:
- **Andere signierte Daten reinjizieren**: Köpfe, illegale Verzauberungen, bösartige Chat-Komponenten
- **Mit einem LAN-Tunnel kombinieren** (NGROK, playit.gg, Radmin VPN), um Spieler über das Internet zu beeinflussen
- **Auf andere Profil-Eigenschaften ausweiten**, die von Signaturen abhängen

### Warum Mojang wahrscheinlich nicht patchen wird

Es gibt keine "Verwundbarkeit" im engeren Sinne -- die Signatur ist gültig. Dies zu patchen würde von Mojang verlangen, das gesamte Authentifizierungsmodell zu ändern, was komplex ist. Derzeit ist dies ein Edge Case: LAN-Spieler sollen sich vertrauen.

## Die philosophische Falle

Cape Mod ist ein hervorragender **Proof of Concept** einer umfassenderen Wahrheit: **Du darfst niemals einer Signatur vertrauen, ohne zu prüfen, wer sie signiert hat und zu welchem Gegenstand**.

Es ist eine Lektion in grundlegender Kryptografie. RSA signiert eine **Nachricht**, keine **Identität**. Wenn ich dir eine gültige RSA-Signatur von Mojang gebe, weißt du, dass Mojang *etwas* signiert hat. Du weißt nicht für wen, und du kannst es nicht einfach durch Betrachten der Nachricht annehmen.

Genau das ist in den 2000er Jahren mit SSL/TLS-Zertifikaten passiert, als CAs alles akzeptierten -- die Signatur war gültig, aber sie bezog sich auf die falsche Domain.

## Fazit

Cape Mod ist kein Hack im klassischen Sinne -- es ist eine elegante Ausnutzung eines Mangels an logischer Validierung in Minecraft. Er zeigt, dass:

1. **Eine gültige Signatur nicht die Identität ihres Trägers garantiert**
2. **Im LAN ist das Vertrauen schwächer**, als man glaubt
3. **Minecrafts `textures`-Eigenschaften sind im Wesentlichen injizierte Inhalte** -- man muss prüfen, ob sie mit dem sie tragenden Spieler übereinstimmen

Wenn du einer LAN-Welt auf einem "unbekannten" Server beitrittst (oder besser gesagt, einem, dessen Host einen verdächtigen Mod hat), hast du bereits ein Sicherheitsproblem, lange bevor der Umhang ins Spiel kommt. Aber es ist symptomatisch: Minecraft geht davon aus, dass sich alle im LAN vertrauen. Das stimmt... bis es das nicht mehr tut.

---

**Ressourcen**

- **GitHub**: [fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **Minecraft Auth**: [Yggdrasil Protokoll](https://wiki.vg/Authentication) (wiki.vg)
- **RSA-Kryptografie**: [RFC 3447](https://tools.ietf.org/html/rfc3447) (PKCS #1)

**3 Kernpunkte**

1. RSA-Signaturen validieren eine Nachricht, nicht eine Identität -- ein Detail, das viele Systeme teuer zu stehen kam.
2. Minecraft prüft nicht, ob das Spielerprofil mit der empfangenen Signatur übereinstimmt -- eine logische, keine kryptografische Schwachstelle.
3. Im LAN oder per Tunnel ist alles offen für einen Mod, der den integrierten Server kontrolliert.
