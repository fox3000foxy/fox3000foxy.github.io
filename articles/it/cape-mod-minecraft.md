---
title: "Cape Mod: come rubare il mantello di Jeb_ con un'iniezione di firma RSA"
description: "Un mod Fabric che sfrutta una falla logica nel sistema di fiducia di Minecraft: una firma RSA valida di Mojang ma riutilizzata su un account sbagliato. Spiegazione del codice, implicazioni di sicurezza e lezioni crittografiche."
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
author_sig: "QbOOMNc4TBuX05OFPY6iIf7Pp9ZdkTj/RB9I+yQ50+D8bYUWYQa44FSO4KGD/N2j1LffLUdmzl/c0G1ZeRhE0w=="
---

# Cape Mod: come rubare il mantello di Jeb_ con un'iniezione di firma RSA

![alt text](assets/xbox-profile.png)
E se ti dicessi che basta una firma RSA valida -- ma per l'**account sbagliato** -- per far credere ai tuoi amici che indossi il mantello ufficiale di Mojang? Benvenuto in `cape-mod`, un exploit Fabric che mostra come Minecraft si fidi di una firma senza verificare che il profilo a cui appartiene sia effettivamente il tuo.

## Il contesto: come Minecraft gestisce skin e mantelli

Nella Java Edition, c'è una domanda che non ci si pone spesso: **chi è responsabile di mostrare la skin e il mantello di un giocatore -- il client o il server?**

La risposta è sfumata:

| Componente | Chi lo invia? | Chi lo scarica? |
|---|---|---|
| **Texture della skin** | Il server invia l'URL firmato | Il client scarica da `textures.minecraft.net` |
| **Texture del mantello** | Il server invia l'URL firmato | Il client scarica da `textures.minecraft.net` |
| **Proprietà `textures`** | Il server invia il `GameProfile` dall'auth Mojang | Il client verifica la firma RSA |

Il punto chiave: tutto è contenuto in una proprietà chiamata `textures` del `GameProfile`. Questa proprietà contiene:
- Un payload JSON in base64 con gli URL delle texture
- Una **firma RSA** fatta con la chiave privata di Mojang

## Il muro della firma RSA

Ogni proprietà `textures` assomiglia a questa una volta decodificata:

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

Il client verifica la firma RSA contro la **chiave pubblica incorporata nel jar** (`yggdrasil_session_pubkey.der`):

```java
// Property.java (authlib)
public boolean isSignatureValid(PublicKey publicKey) {
    Signature sig = Signature.getInstance("SHA1withRSA");
    sig.initVerify(publicKey);
    sig.update(this.value.getBytes());
    return sig.verify(Base64.decodeBase64(this.signature));
}
```

Per i giocatori remoti (non in locale), il client accetta solo le skin **marcate come `secure`** -- cioè con una firma valida:

```java
// SkinManager.createLookup() -- semplificato
PlayerSkin skin = optional
    .filter(ps -> !isRemote || ps.secure())  // ← i giocatori remoti devono essere sicuri
    .orElse(defaultSkin);
```

Questo controllo impedisce lo spoofing in teoria. Ma è qui che le cose si fanno interessanti.

## La falla: signature replay

Il client verifica che la firma RSA **sia valida**. Ma non verifica **mai** che il `profileId` contenuto nel JSON corrisponda all'UUID reale del giocatore.

In altre parole: una proprietà `textures` presa da un **account Mojang esistente** (per esempio quello di un dipendente Mojang) può essere riutilizzata su qualsiasi altro giocatore. La firma rimane valida -- è stata genuinamente creata da Mojang -- proviene solo da un altro account.

### Come estrarre una firma vera?

Jeb_ (UUID `853c80ef-3c37-49fd-aa49-938b674adae6`) ha il mantello Mojang Studios. Dal server di sessione Mojang:

```bash
curl -s "https://sessionserver.mojang.com/session/minecraft/profile/853c80ef-3c37-49fd-aa49-938b674adae6?unsigned=false"
```

Risposta:

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

La `signature` di questo campo `value` è stata prodotta da Mojang. È RSA-2048 SHA-1. È **assolutamente** valida, anche se la riutilizzi su un altro UUID -- perché la firma di Jeb_ rimane una firma di Jeb_, e il client non verifica mai che sia **supposta** essere la tua.

## Il codice: come funziona il mod

Il mod `cape-mod` è minuscolo -- 65 righe di Java. Ecco il cuore:

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

        // Sostituisce la proprietà textures con quella di Jeb_
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

**Fasi**:
1. **Mixin** su `Player.getGameProfile()` -- il punto in cui il profilo del giocatore viene restituito
2. Verifica che sia un server locale (Integrated Server)
3. Verifica che sia l'host (mondo LAN)
4. **Sostituisce** la proprietà `textures` con quella di Jeb_ (hardcodata)
5. Restituisce un nuovo `GameProfile` con le texture iniettate

Il `GameProfile` è quindi **forgiato**: è un profilo costruito artificialmente, che non corrisponde al vero giocatore. Le proprietà `textures` sono **riutilizzate** da Jeb_ -- la firma RSA è autentica ma applicata al profilo sbagliato. Il pacchetto di rete, invece, è legittimo: il server invia normalmente il `ClientboundPlayerInfoUpdatePacket` con questo profilo modificato. È il profilo che è forgiato, non il pacchetto.

Quando gli amici dell'host si connettono via LAN, ricevono il `ClientboundPlayerInfoUpdatePacket` con il profilo modificato. Il client:
1. Decodifica il payload base64
2. Verifica la firma RSA → ✅ valida (è genuinamente quella di Jeb_)
3. Marca la skin come `secure=true` (perché la firma è valida)
4. Supera il filtro `!isRemote || ps.secure()` → ✅ passa
5. **Scarica e mostra il mantello di Jeb_**

## Risultato in gioco: il mantello sulla tua skin

Ecco come appare in-game. Prima, vista frontale con il mantello di Jeb_ mostrato sull'host:

![Cape Mod -- mantello di Jeb_ mostrato sull'host](/images/cape-mod/cape-01-jeb-cape.png)

Si vede chiaramente il motivo rosso/bianco del mantello ufficiale Mojang Studios. Nessuna differenza con un vero Jeb_ che avrebbe il suo mantello -- il client scarica esattamente la stessa texture da `textures.minecraft.net`.

E in visuale immersiva, in una vera partita:

![Cape Mod -- vista in gioco con mantello visibile](/images/cape-mod/cape-02-lava-cape.png)

Il mantello fluttua dietro il giocatore, ondeggia con il movimento. Perfettamente indistinguibile da una skin autentica con mantello ufficiale.

Un'altra angolazione, in un mondo con lava e terreno:

![Cape Mod -- mantello in ambiente naturale](/images/cape-mod/cape-03-local-game.png)

E un'ultima vista ravvicinata del gameplay reale, dove si vede il mantello in azione:

![Cape Mod -- mantello in gameplay classico Minecraft](/images/cape-mod/cape-04-real-gameplay.png)

Per qualcuno che si unisse a un LAN senza sapere che l'host ha un mod, non c'è assolutamente modo di distinguere questo da un vero mantello Mojang. È proprio questo il punto: **la firma è valida**, il client non ha alcun motivo di dubitare.

## Perché è una falla (e perché non lo è)

È ironico: l'exploit funziona **proprio perché la firma è valida**. Non c'è un bypass crittografico qui -- è peggio, è una **falla logica** nel modello di fiducia.

| Controllo | Risultato |
|---|---|
| **Validità della firma RSA** | ✅ Valida (firmata da Mojang per Jeb_) |
| **Il `profileId` nel payload corrisponde all'UUID dell'host?** | ❌ No (UUID di Jeb_ ≠ UUID dell'host) |
| **Il client verifica la corrispondenza?** | ❌ **No. Solo la firma RSA viene verificata.** |

Minecraft si fida **della firma**, non dell'identità di chi la porta. Finché la firma proviene da Mojang, il client l'accetta. È come mostrare un passaporto falso firmato dal governo -- il sigillo è legittimo, anche se il passaporto non ti appartiene.

## Le implicazioni di sicurezza

### Portata limitata al LAN

Il mod funziona solo su un server integrato (LAN). L'attaccante deve:
- Avere un mod Fabric installato
- Essere l'host di un mondo LAN
- I suoi amici si connettono senza mod (vanilla)

### Ma le possibilità si ampliano

In teoria, con la stessa tecnica, si potrebbe:
- **Reiniettare altri dati firmati**: teste, incantesimi illegali, componenti di chat maliziose
- **Combinare con un tunnel LAN** (NGROK, playit.gg, Radmin VPN) per colpire giocatori su internet
- **Estendere ad altre proprietà** del profilo che dipendono da firme

### Perché Mojang probabilmente non correggerà

Non c'è una "vulnerabilità" in senso stretto -- la firma è valida. Correggere questo richiederebbe a Mojang di modificare il modello di autenticazione completo, il che è complesso. Per ora, è un case limite: i giocatori LAN sono supposti fidarsi l'uno dell'altro.

## Il tranello filosofico

Cape Mod è un eccellente **proof of concept** di una verità più ampia: **non devi mai fidarti di una firma senza verificare chi l'ha firmata e a quale scopo**.

È una lezione di crittografia di base. RSA firma un **messaggio**, non un'**identità**. Se ti do una firma RSA valida di Mojang, sai che Mojang ha firmato *qualcosa*. Non sai per chi, e non puoi presumerlo solo guardando il messaggio.

È esattamente ciò che è successo con i certificati SSL/TLS negli anni 2000 quando le CA accettavano qualsiasi cosa -- la firma era valida, ma si applicava al dominio sbagliato.

## Conclusione

Cape Mod non è un hack in senso classico -- è uno sfruttamento elegante di una mancanza di validazione logica in Minecraft. Mostra che:

1. **Una firma valida non garantisce l'identità di chi la porta**
2. **In LAN, la fiducia è più debole** di quanto si creda
3. **Le proprietà `textures` di Minecraft sono essenzialmente contenuto iniettato** -- bisogna verificare che corrispondano al giocatore che le porta

Se ti unisci a un mondo LAN su un server "sconosciuto" (o meglio, il cui host ha un mod sospetto), hai già un problema di sicurezza ben prima del mantello. Ma è sintomatico: Minecraft presume che tutti su un LAN si fidino l'uno dell'altro. È vero... finché non smette di esserlo.

---

**Risorse**

- **GitHub**: [fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **Auth Minecraft**: [Protocollo Yggdrasil](https://wiki.vg/Authentication) (wiki.vg)
- **Crittografia RSA**: [RFC 3447](https://tools.ietf.org/html/rfc3447) (PKCS #1)

**3 punti chiave**

1. Le firme RSA validano un messaggio, non un'identità -- un dettaglio costato caro a molti sistemi.
2. Minecraft non verifica che il profilo del giocatore corrisponda alla firma che riceve -- una falla logica, non crittografica.
3. In LAN o in tunnel, tutto è possibile per un mod che controlla il server integrato.
