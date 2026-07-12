# Cape Mod : comment voler la cape de Jeb_ avec une injection de signature RSA

Et si je te disais qu'il suffisait d'une signature RSA valide -- mais pour le **mauvais compte** -- pour faire croire à tes amis que tu portes la cape officielle de Mojang ? Bienvenue dans `cape-mod`, un exploit Fabric qui montre comment Minecraft fait confiance à une signature sans vérifier que le profil auquel elle appartient est effectivement le tien.

## Le contexte : comment Minecraft gère les skins et les capes

Dans Java Edition, il y a une question qu'on ne se pose pas souvent : **qui est responsable d'afficher le skin et la cape d'un joueur -- le client ou le serveur ?**

La réponse est nuancée :

| Composant | Qui l'envoie ? | Qui le télécharge ? |
|---|---|---|
| **Texture de skin** | Le serveur envoie l'URL signée | Le client télécharge depuis `textures.minecraft.net` |
| **Texture de cape** | Le serveur envoie l'URL signée | Le client télécharge depuis `textures.minecraft.net` |
| **Propriété `textures`** | Le serveur envoie le `GameProfile` depuis l'auth Mojang | Le client vérifie la signature RSA |

Le point clé : tout est contenu dans une propriété appelée `textures` du `GameProfile`. Cette propriété contient :
- Un payload JSON en base64 avec les URLs des textures
- Une **signature RSA** faite avec la clé privée de Mojang

## Le mur de la signature RSA

Chaque propriété `textures` ressemble à ça quand on la décode :

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

Le client vérifie la signature RSA contre la **clé publique embarquée dans le jar** (`yggdrasil_session_pubkey.der`) :

```java
// Property.java (authlib)
public boolean isSignatureValid(PublicKey publicKey) {
    Signature sig = Signature.getInstance("SHA1withRSA");
    sig.initVerify(publicKey);
    sig.update(this.value.getBytes());
    return sig.verify(Base64.decodeBase64(this.signature));
}
```

Pour les joueurs distants (pas en local), le client n'accepte que les skins **marqués comme `secure`** -- c'est-à-dire avec une signature valide :

```java
// SkinManager.createLookup() -- simplifié
PlayerSkin skin = optional
    .filter(ps -> !isRemote || ps.secure())  // ← les joueurs distants doivent être sécurisés
    .orElse(defaultSkin);
```

Ce check empêche les spoofing en théorie. Mais c'est là que les choses deviennent intéressantes.

## La faille : signature replay

Le client vérifie que la signature RSA **est valide**. Mais il ne vérifie **jamais** que le `profileId` contenu dans le JSON correspond à l'UUID réel du joueur.

Autrement dit : une propriété `textures` prise d'un **compte Mojang existant** (par exemple celui d'un employé Mojang) peut être replay sur n'importe quel autre joueur. La signature reste valide -- elle a été genuinement faite par Mojang -- elle vient juste d'un autre compte.

### Comment extraire une vraie signature ?

Jeb_ (UUID `853c80ef-3c37-49fd-aa49-938b674adae6`) a la cape Mojang Studios. Depuis le serveur de session Mojang :

```bash
curl -s "https://sessionserver.mojang.com/session/minecraft/profile/853c80ef-3c37-49fd-aa49-938b674adae6?unsigned=false"
```

Réponse :

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

La `signature` de ce champ `value` a été produite par Mojang. C'est RSA-2048 SHA-1. Elle est **absolument** valide, même si tu la replays sur un autre UUID -- parce que la signature de Jeb_ reste une signature de Jeb_, et le client ne vérifie jamais que c'est **censée** être la tienne.

## Le code : comment le mod fonctionne

Le mod `cape-mod` est minuscule -- 65 lignes de Java. Voici le cœur :

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

**Étapes** :
1. **Mixin** sur `Player.getGameProfile()` -- le point où le profil du joueur est retourné
2. Vérifie que c'est un serveur local (Integrated Server)
3. Vérifie que c'est le host (LAN world)
4. **Remplace** la propriété `textures` par celle de Jeb_ (hardcodée)
5. Retourne un nouveau `GameProfile` avec les textures injectées

Quand les amis du host rejoignent via LAN, ils reçoivent le `ClientboundPlayerInfoUpdatePacket` avec le profil modifié. Le client :
1. Décode le payload base64
2. Vérifie la signature RSA → ✅ valide (c'est genuinement celle de Jeb_)
3. Marque le skin comme `secure=true` (car la signature est valide)
4. Passe le filtre `!isRemote || ps.secure()` → ✅ passe
5. **Télécharge et affiche la cape de Jeb_**

## Résultat en jeu : la cape sur ton skin

Voici ce que ça donne in-game. D'abord, vue de face avec la cape de Jeb_ affichée sur le host :

![Cape Mod -- Jeb_ cape affichée sur le host](/images/cape-mod/cape-01-jeb-cape.png)

On voit clairement le motif rouge/blanc de la cape officielle Mojang Studios. Aucune différence avec un vrai Jeb_ qui aurait sa propre cape -- le client télécharge exactement la même texture depuis `textures.minecraft.net`.

Et en vue immersive, dans une vraie partie :

![Cape Mod -- vue en jeu avec cape visible](/images/cape-mod/cape-02-lava-cape.png)

La cape flotte derrière le joueur, ondule avec le mouvement. Parfaitement indistinguible d'un skin authentique avec cape officielle.

Autre angle, dans un monde avec lave et terrain :

![Cape Mod -- cape dans un environnement naturel](/images/cape-mod/cape-03-local-game.png)

Et une dernier vue rapprochée du gameplay réel, où on voit la cape en action :

![Cape Mod -- cape en gameplay classique Minecraft](/images/cape-mod/cape-04-real-gameplay.png)

Pour quelqu'un qui rejoindrait un LAN sans savoir que le host a un mod, il n'y a absolument aucun moyen de distinguer ça d'une vraie cape Mojang. C'est précisément le point : **la signature est valide**, le client n'a aucune raison de douter.

## Pourquoi c'est une faille (et pourquoi ce n'en est pas une)

C'est ironique : l'exploit fonctionne **précisément parce que la signature est valide**. Il n'y a pas de bypass cryptographique ici -- c'est pire, c'est une **faille logique** dans le modèle de confiance.

| Check | Résultat |
|---|---|
| **Validité de la signature RSA** | ✅ Valide (signée par Mojang pour Jeb_) |
| **Le `profileId` dans le payload correspond-il à l'UUID du host ?** | ❌ Non (Jeb_'s UUID ≠ UUID du host) |
| **Le client vérifie-t-il la correspondance ?** | ❌ **Non. Seule la signature RSA est vérifiée.** |

Minecraft fait confiance **à la signature**, pas à l'identité de celui qui la porte. Tant que la signature vient de Mojang, le client l'accepte. C'est comme montrer un faux passeport signé par le gouvernement -- le sceau est légitime, même si le passeport ne te appartient pas.

## Les implications de sécurité

### Portée limitée au LAN

Le mod ne fonctionne que sur un serveur intégré (LAN). L'attaquant doit :
- Avoir un mod Fabric installé
- Être le host d'un monde LAN
- Ses amis se connectent sans mod (vanilla)

### Mais les possibilités s'élargissent

En théorie, avec la même technique, on pourrait :
- **Réinjecter d'autres données signées** : heads, enchantements illégaux, composants de chat malveillants
- **Combiner avec un tunnel LAN** (NGROK, playit.gg, Radmin VPN) pour affecter des joueurs sur internet
- **Étendre à d'autres propriétés** du profil qui dépendent de signatures

### Pourquoi Mojang ne va probablement pas patcher

Il n'y a pas de "vulnérabilité" au sens strict -- la signature est valide. Patcher ça demanderait à Mojang de modifier le modèle d'authentification complet, ce qui est complexe. Pour l'instant, c'est un edge case : les joueurs LAN sont supposés se faire confiance.

## Le piège philosophique

Cape Mod est un excellent **proof of concept** d'une vérité plus large : **tu ne dois jamais faire confiance à une signature sans vérifier qui l'a signée et à quel sujet**.

C'est une leçon en cryptographie de base. RSA signe un **message**, pas une **identité**. Si je te donne une signature RSA valide de Mojang, tu sais que Mojang a signé *quelque chose*. Tu ne sais pas pour qui, et tu ne peux pas le supposer juste en regardant le message.

C'est exactement ce qui s'est passé avec les certificats SSL/TLS dans les années 2000 quand les CAs acceptaient n'importe quoi -- la signature était valide, mais elle s'appliquait au mauvais domaine.

## Conclusion

Cape Mod n'est pas un hack au sens classique -- c'est une exploitation élégante d'un manque de validation logique dans Minecraft. Il montre que :

1. **Une signature valide ne garantit pas l'identité de celui qui la porte**
2. **En LAN, la confiance est plus faible** qu'on ne le croit
3. **Les propriétés `textures` de Minecraft sont essentiellement du contenu injecté** -- il faut vérifier qu'elles correspondent au joueur qui les porte

Si tu rejoins un monde LAN sur un serveur "inconnu" (ou plutôt, dont le host a un mod suspect), tu as déjà un problème de sécurité bien avant la cape. Mais c'est symptomal : Minecraft suppose que tout le monde sur un LAN se fait confiance. C'est vrai... jusqu'à ce qu'ça ne le soit plus.

---

**Ressources**

- **GitHub**: [fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **Minecraft auth**: [Yggdrasil protocol](https://wiki.vg/Authentication) (wiki.vg)
- **RSA cryptographie**: [RFC 3447](https://tools.ietf.org/html/rfc3447) (PKCS #1)

**3 points clés**

1. Les signatures RSA valident un message, pas une identité -- un détail qui a coûté cher à de nombreux systèmes.
2. Minecraft ne vérifie pas que le profil du joueur correspond à la signature qu'il reçoit -- une faille logique, pas cryptographique.
3. En LAN ou en tunnel, tout est open bar pour un mod qui contrôle le serveur intégré.
