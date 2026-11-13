---
title: "Cape Mod: come rubare il mantello di Jeb_ con un'iniezione di firma RSA"
description: "Un mod Fabric che sfrutta una falla logica nel sistema di fiducia di Minecraft: una firma RSA valida di Mojang ma rigiocata sull'account sbagliato. Spiegazione del codice, implicazioni di sicurezza e lezioni crittografiche."
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
author_sig: "bdVs39OcZmYB6MhE1fprxJFMPXExGKIayTgBcWkKmRYIZ3VrUWe4NTUx0DQtV6SrupG4z9WasQrSacZ6VChgXw=="
---

# Cape Mod: come rubare il mantello di Jeb_ con un'iniezione di firma RSA

![alt text](assets/xbox-profile.png)

E se ti dicessi che bastava una firma RSA valida: ma per l'**account sbagliato**: per far credere ai tuoi amici che porti il mantello ufficiale di Mojang? Benvenuto in `cape-mod`, un exploit Fabric che mostra come Minecraft si fida di una firma omettendo di verificare che il profilo a cui appartiene sia davvero il tuo.

## Il contesto: come Minecraft gestisce skin e mantelli

In Java Edition, c'è una domanda raramente posta: **chi è responsabile di mostrare la skin e il mantello di un giocatore: il client o il server?**

La risposta è sfumata:

| Componente | Chi lo invia? | Chi lo scarica? |
|---|---|---|
| **Texture di skin** | Il server invia l'URL firmata | Il client scarica da `textures.minecraft.net` |
| **Texture di mantello** | Il server invia l'URL firmata | Il client scarica da `textures.minecraft.net` |
| **Proprietà `textures`** | Il server invia il `GameProfile` dall'auth Mojang | Il client verifica la firma RSA |

Il punto chiave: tutto è contenuto in una proprietà chiamata `textures` del `GameProfile`. Questa proprietà contiene:
- Un payload JSON in base64 con gli URL delle texture
- Una **firma RSA** fatta con la chiave privata di Mojang

## Il muro della firma RSA

Ogni proprietà `textures` assomiglia a questo quando la decodifichi:

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

Il client verifica la firma RSA contro la **chiave pubblica integrata nel jar** (`yggdrasil_session_pubkey.der`):

```java
// Property.java (authlib)
// verifica la firma RSA del valore contro la chiave pubblica
public boolean isSignatureValid(PublicKey publicKey) {
    Signature sig = Signature.getInstance("SHA1withRSA");
    sig.initVerify(publicKey);
    sig.update(this.value.getBytes());
    return sig.verify(Base64.decodeBase64(this.signature));
}
```

Per i giocatori remoti (fuori dal gioco locale), il client accetta solo skin **segnate come `secure`**: cioè con una firma valida:

```java
// SkinManager.createLookup() -- semplificato
// i giocatori remoti devono essere sicuri
PlayerSkin skin = optional
    .filter(ps -> !isRemote || ps.secure())  // ← i giocatori remoti devono essere sicuri
    .orElse(defaultSkin);
```

Questo check blocca lo spoofing in teoria. Ma la validazione si ferma lì, ed è proprio lì che inizia l'attacco.

## La falla: signature replay

Il client verifica che la firma RSA **sia valida**. Omette sistematicamente di verificare che il `profileId` contenuto nel JSON corrisponda all'UUID reale del giocatore.

In altre parole: una proprietà `textures` presa da un **account Mojang esistente** (per esempio quello di un impiegato Mojang) può essere rigiocata su qualsiasi altro giocatore. La firma resta valida: è stata davvero prodotta da Mojang: viene solo da un altro account.

### Come estrarre una vera firma?

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

La `signature` di questo campo `value` è stata prodotta da Mojang. È RSA-2048 SHA-1. È **assolutamente** valida, anche se la rigiochi su un altro UUID: perché la firma di Jeb_ resta una firma di Jeb_, e il client omette di controllare a chi era destinata.

## Il codice: come funziona il mod

Il mod `cape-mod` è minuscolo: 65 righe di Java. Ecco il cuore:

```java
// inietta le texture firmate di Jeb_ nel profilo dell'host
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

**Passi**:
1. **Mixin** su `Player.getGameProfile()`: il punto dove il profilo del giocatore è restituito
2. Verifica che sia un server locale (Integrated Server)
3. Verifica che sia l'host (mondo LAN)
4. **Sostituisce** la proprietà `textures` con quella di Jeb_ (hardcodata)
5. Restituisce un nuovo `GameProfile` con le texture iniettate

Il `GameProfile` è quindi **forgiato**: è un profilo costruito artificialmente, che non corrisponde al vero giocatore. Le proprietà `textures` sono **rigiocate** da Jeb_: la firma RSA è autentica ma applicata al profilo sbagliato. Il pacchetto rete, lui, è legittimo: il server invia normalmente il `ClientboundPlayerInfoUpdatePacket` con questo profilo modificato. È il profilo che è forgiato; il pacchetto resta legittimo.

Quando gli amici dell'host si uniscono via LAN, ricevono il `ClientboundPlayerInfoUpdatePacket` col profilo modificato. Il client:
1. Decodifica il payload base64
2. Verifica la firma RSA: valida (è davvero quella di Jeb_)
3. Segna la skin come `secure=true` (perché la firma è valida)
4. Passa il filtro `!isRemote || ps.secure()`: passa
5. **Scarica e mostra il mantello di Jeb_**

## Risultato in gioco: il mantello sulla tua skin

Ecco cosa dà in-game. Prima, vista frontale col mantello di Jeb_ mostrato sull'host:

![Cape Mod -- Jeb_ cape affichée sur le host](/images/cape-mod/cape-01-jeb-cape.png)

Si vede chiaramente il motivo rosso/bianco del mantello ufficiale Mojang Studios. Il rendering resta identico a quello di un vero Jeb_ che porta il suo mantello: il client scarica esattamente la stessa texture da `textures.minecraft.net`.

E in vista immersiva, in una vera partita:

![Cape Mod -- vue en jeu avec cape visible](/images/cape-mod/cape-02-lava-cape.png)

Il mantello fluttua dietro il giocatore, ondeggia col movimento. Perfettamente indistinguibile da una skin autentica con mantello ufficiale.

Altro angolo, in un mondo con lava e terreno:

![Cape Mod -- cape dans un environnement naturel](/images/cape-mod/cape-03-local-game.png)

E un'ultima vista ravvicinata del gameplay reale, dove si vede il mantello in azione:

![Cape Mod -- cape en gameplay classique Minecraft](/images/cape-mod/cape-04-real-gameplay.png)

Per qualcuno che raggiungesse una LAN ignorando che l'host usa un mod, il mantello resta visivamente identico a un vero mantello Mojang. È proprio il punto: **la firma è valida**, il client la tratta quindi come legittima.

## Perché è una falla (e perché non lo è)

È ironico: l'exploit funziona **proprio perché la firma è valida**. Si tratta d'altro che un bypass crittografico: è peggio: una **falla logica** nel modello di fiducia.

| Check | Risultato |
|---|---|
| **Validità della firma RSA** | Valida (firmata da Mojang per Jeb_) |
| **Il `profileId` nel payload corrisponde all'UUID dell'host?** | No (UUID di Jeb_ diverso da UUID dell'host) |
| **Il client verifica la corrispondenza?** | **No. Solo la firma RSA è verificata.** |

Minecraft si fida **della firma** invece che dell'identità di chi la porta. Finché la firma viene da Mojang, il client l'accetta. È come mostrare un passaporto falso firmato dal governo: il sigillo è legittimo, anche se il passaporto non ti appartiene.

## Le implicazioni di sicurezza

### Portata limitata alla LAN

Il mod funziona solo su un server integrato (LAN). L'attaccante deve:
- Avere un mod Fabric installato
- Essere l'host di un mondo LAN
- I suoi amici si connettono senza mod (vanilla)

### Ma le possibilità si allargano

In teoria, con la stessa tecnica, si potrebbe:
- **Re-iniettare altri dati firmati**: teste, incantesimi illegali, componenti di chat malevoli
- **Combinare con un tunnel LAN** (NGROK, playit.gg, Radmin VPN) per colpire giocatori su internet
- **Estendere ad altre proprietà** del profilo che dipendono da firme

### Perché Mojang probabilmente non patcherà

Si tratta d'altro che una "vulnerabilità" in senso stretto: la firma è valida. Patcharla richiederebbe a Mojang di modificare il modello di autenticazione completo, il che è complesso. Per ora, è un caso limite: i giocatori LAN sono supposti fidarsi.

## La trappola filosofica

Cape Mod è un ottimo **proof of concept** di una verità più ampia: **devi sempre verificare chi ha firmato un dato e per quale soggetto prima di fidarti**.

È una lezione di crittografia di base. RSA firma un **messaggio**; l'**identità** del destinatario resta fuori dalla firma. Se ti do una firma RSA valida di Mojang, sai solo che Mojang ha firmato *qualcosa*, senza indicazione affidabile sul destinatario dal solo messaggio.

È esattamente ciò che è successo coi certificati SSL/TLS negli anni 2000 quando le CA firmavano certificati senza verificare correttamente il dominio: la firma era valida, ma si applicava al dominio sbagliato.

## Conclusione

Cape Mod è d'altro che un hack in senso classico: è uno sfruttamento elegante di una mancanza di validazione logica in Minecraft. Mostra che:

1. **Una firma valida non garantisce l'identità di chi la porta**
2. **In LAN, la fiducia è più debole** di quanto si creda
3. **Le proprietà `textures` di Minecraft sono essenzialmente contenuto iniettato**: bisogna verificare che corrispondano al giocatore che le porta

Se ti unisci a un mondo LAN su un server "sconosciuto" (o meglio, il cui host ha un mod sospetto), hai già un problema di sicurezza ben prima del mantello. Ma è rivelatore: Minecraft suppone che tutti su una LAN si fidino. È vero... fino al primo host che abusa di questa fiducia.

---

**Risorse**

- **GitHub**: [fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **Minecraft auth**: [Yggdrasil protocol](https://wiki.vg/Authentication) (wiki.vg)
- **RSA crittografia**: [RFC 3447](https://tools.ietf.org/html/rfc3447) (PKCS #1)

**3 punti chiave**

1. Le firme RSA validano un messaggio invece di un'identità: un dettaglio costato caro a molti sistemi.
2. Minecraft omette di verificare che il profilo del giocatore corrisponda alla firma che riceve: una falla logica nella validazione, con crittografia intatta.
3. In LAN o in tunnel, è tutto open bar per un mod che controlla il server integrato.
