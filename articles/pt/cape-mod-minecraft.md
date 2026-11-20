---
title: "Cape Mod : como roubar a capa do Jeb_ com uma injeção de assinatura RSA"
description: "Um mod Fabric que explora uma falha lógica no sistema de confiança do Minecraft : uma assinatura RSA válida da Mojang mas repetida na conta errada. Explicação do código, implicações de segurança e lições criptográficas."
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
author_sig: "6R+l2qCSikUBkJ4ISywcZUOiQGryOOL7LlrXS7Ca6rB9BZCAj/m52cseqQ9BpZPUdjsEdQ3U8RJGIONmYjD2kw=="
---

# Cape Mod : como roubar a capa do Jeb_ com uma injeção de assinatura RSA

![alt text](assets/xbox-profile.png)

E se eu te dissesse que bastava uma assinatura RSA válida, mas da conta **errada**, para fazer seus amigos acreditarem que você veste a capa oficial da Mojang ? Bem-vindo ao `cape-mod`, um exploit Fabric que mostra como o Minecraft confia em uma assinatura sem verificar que o perfil a que ela pertence é realmente o seu.

## O contexto : como o Minecraft gerencia skins e capas

Na Java Edition, há uma pergunta raramente feita : **quem é responsável por exibir a skin e a capa de um jogador, o cliente ou o servidor ?**

A resposta tem nuances :

| Componente | Quem envia ? | Quem baixa ? |
|---|---|---|
| **Textura da skin** | O servidor envia a URL assinada | O cliente baixa de `textures.minecraft.net` |
| **Textura da capa** | O servidor envia a URL assinada | O cliente baixa de `textures.minecraft.net` |
| **Propriedade `textures`** | O servidor envia o `GameProfile` da auth Mojang | O cliente verifica a assinatura RSA |

O ponto principal : tudo está contido em uma propriedade chamada `textures` do `GameProfile`. Essa propriedade contém :
- Um payload JSON em base64 com as URLs das texturas
- Uma **assinatura RSA** feita com a chave privada da Mojang

## A muralha da assinatura RSA

Cada propriedade `textures` é assim quando decodificada :

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

O cliente verifica a assinatura RSA contra a **chave pública embutida no jar** (`yggdrasil_session_pubkey.der`) :

```java
// Property.java (authlib) : verifica a assinatura RSA contra a chave pública
public boolean isSignatureValid(PublicKey publicKey) {
    Signature sig = Signature.getInstance("SHA1withRSA");
    sig.initVerify(publicKey);
    sig.update(this.value.getBytes());
    return sig.verify(Base64.decodeBase64(this.signature));
}
```

Para jogadores remotos (fora do jogo local), o cliente aceita só skins **marcadas como `secure`**, ou seja, com assinatura válida :

```java
// SkinManager.createLookup() : jogadores remotos precisam ser seguros
PlayerSkin skin = optional
    .filter(ps -> !isRemote || ps.secure())  // ← jogadores remotos precisam ser seguros
    .orElse(defaultSkin);
```

Esse check bloqueia spoofing em teoria. Mas a validação para aí, e é exatamente aí que o ataque começa.

## A falha : replay de assinatura

O cliente verifica que a assinatura RSA **é válida**. Ele sistematicamente deixa de verificar que o `profileId` contido no JSON corresponde ao UUID real do jogador.

Em outras palavras : uma propriedade `textures` tirada de uma **conta Mojang existente** (por exemplo a de um funcionário da Mojang) pode ser repetida em qualquer outro jogador. A assinatura continua válida, ela foi realmente produzida pela Mojang, só que veio de outra conta.

### Como extrair uma assinatura de verdade ?

Jeb_ (UUID `853c80ef-3c37-49fd-aa49-938b674adae6`) tem a capa Mojang Studios. A partir do servidor de sessão da Mojang :

```bash
# Baixa o perfil de sessão do Jeb_ com as propriedades assinadas
curl -s "https://sessionserver.mojang.com/session/minecraft/profile/853c80ef-3c37-49fd-aa49-938b674adae6?unsigned=false"
```

Resposta :

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

A `signature` desse campo `value` foi produzida pela Mojang. É RSA-2048 SHA-1. Ela é **absolutamente** válida, mesmo que você a repita em outro UUID, porque a assinatura do Jeb_ continua sendo uma assinatura do Jeb_, e o cliente deixa de controlar a quem ela era destinada.

## O código : como o mod funciona

O mod `cape-mod` é minúsculo, 65 linhas de Java. Eis o coração :

```java
// Mixin que substitui a propriedade textures do host pela do Jeb_
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

        // Substitui a propriedade textures pela do Jeb_
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

**Etapas** :
1. **Mixin** em `Player.getGameProfile()`, o ponto em que o perfil do jogador é retornado
2. Verifica que é um servidor local (Integrated Server)
3. Verifica que é o host (mundo LAN)
4. **Substitui** a propriedade `textures` pela do Jeb_ (fixa no código)
5. Retorna um novo `GameProfile` com as texturas injetadas

O `GameProfile` é portanto **forjado** : é um perfil construído artificialmente, que não corresponde ao jogador real. As propriedades `textures` são **repetidas** a partir do Jeb_, a assinatura RSA é autêntica mas aplicada ao perfil errado. O pacote de rede, por sua vez, é legítimo : o servidor envia normalmente o `ClientboundPlayerInfoUpdatePacket` com esse perfil modificado. É o perfil que é forjado ; o pacote continua legítimo.

Quando os amigos do host entram via LAN, recebem o `ClientboundPlayerInfoUpdatePacket` com o perfil modificado. O cliente :
1. Decodifica o payload base64
2. Verifica a assinatura RSA → ✅ válida (é realmente a do Jeb_)
3. Marca a skin como `secure=true` (porque a assinatura é válida)
4. Passa no filtro `!isRemote || ps.secure()` → ✅ passa
5. **Baixa e exibe a capa do Jeb_**

## Resultado no jogo : a capa na sua skin

Eis o que dá in-game. Primeiro, vista de frente com a capa do Jeb_ exibida no host :

![Cape Mod -- capa do Jeb_ exibida no host](/images/cape-mod/cape-01-jeb-cape.png)

Dá para ver claramente o padrão vermelho/branco da capa oficial Mojang Studios. A renderização fica idêntica à de um Jeb_ de verdade vestindo a própria capa, o cliente baixa exatamente a mesma textura de `textures.minecraft.net`.

E em vista imersiva, em uma partida de verdade :

![Cape Mod -- vista no jogo com capa visível](/images/cape-mod/cape-02-lava-cape.png)

A capa flutua atrás do jogador, ondula com o movimento. Perfeitamente indistinguível de uma skin autêntica com capa oficial.

Outro ângulo, em um mundo com lava e terreno :

![Cape Mod -- capa em um ambiente natural](/images/cape-mod/cape-03-local-game.png)

E uma última vista de perto do gameplay real, onde dá para ver a capa em ação :

![Cape Mod -- capa em gameplay clássico de Minecraft](/images/cape-mod/cape-04-real-gameplay.png)

Para alguém que entrasse em uma LAN sem saber que o host usa um mod, a capa continua visualmente idêntica a uma capa Mojang de verdade. É exatamente o ponto : **a assinatura é válida**, então o cliente a trata como legítima.

## Por que é uma falha (e por que não é)

É irônico : o exploit funciona **justamente porque a assinatura é válida**. Não se trata de um bypass criptográfico, é pior : uma **falha lógica** no modelo de confiança.

| Check | Resultado |
|---|---|
| **Validade da assinatura RSA** | ✅ Válida (assinada pela Mojang para o Jeb_) |
| **O `profileId` no payload corresponde ao UUID do host ?** | ❌ Não (UUID do Jeb_ ≠ UUID do host) |
| **O cliente verifica a correspondência ?** | ❌ **Não. Só a assinatura RSA é verificada.** |

O Minecraft confia **na assinatura** em vez da identidade de quem a carrega. Enquanto a assinatura vier da Mojang, o cliente aceita. É como mostrar um passaporte falso assinado pelo governo, o selo é legítimo, mesmo que o passaporte não seja seu.

## As implicações de segurança

### Alcance limitado à LAN

O mod funciona só em um servidor integrado (LAN). O atacante precisa :
- Ter um mod Fabric instalado
- Ser o host de um mundo LAN
- Os amigos dele se conectam sem mod (vanilla)

### Mas as possibilidades se ampliam

Em teoria, com a mesma técnica, daria para :
- **Reinjetar outros dados assinados** : heads, encantamentos ilegais, componentes de chat maliciosos
- **Combinar com um túnel LAN** (NGROK, playit.gg, Radmin VPN) para afetar jogadores na internet
- **Estender a outras propriedades** do perfil que dependem de assinaturas

### Por que a Mojang provavelmente não vai corrigir

Não se trata de uma "vulnerabilidade" no sentido estrito, a assinatura é válida. Corrigir isso exigiria a Mojang mudar o modelo de autenticação completo, o que é complexo. Por enquanto, é um caso limite : jogadores em LAN supostamente confiam uns nos outros.

## A armadilha filosófica

Cape Mod é um excelente **proof of concept** de uma verdade mais ampla : **você deve sempre verificar quem assinou um dado e para qual sujeito antes de confiar nele**.

É uma lição de criptografia básica. RSA assina uma **mensagem** ; a **identidade** do destinatário fica fora da assinatura. Se eu te dou uma assinatura RSA válida da Mojang, você só sabe que a Mojang assinou *alguma coisa*, sem indicação confiável sobre o destinatário a partir só da mensagem.

Foi exatamente o que aconteceu com os certificados SSL/TLS nos anos 2000, quando as CAs assinavam certificados sem verificar direito o domínio, a assinatura era válida, mas se aplicava ao domínio errado.

## Conclusão

Cape Mod não é um hack no sentido clássico, é uma exploração elegante de uma falta de validação lógica no Minecraft. Mostra que :

1. **Uma assinatura válida não garante a identidade de quem a carrega**
2. **Em LAN, a confiança é mais fraca** do que se imagina
3. **As propriedades `textures` do Minecraft são essencialmente conteúdo injetado**, é preciso verificar que correspondem ao jogador que as carrega

Se você entra em um mundo LAN em um servidor "desconhecido" (ou melhor, cujo host tem um mod suspeito), você já tem um problema de segurança bem antes da capa. Mas é revelador : o Minecraft supõe que todo mundo em uma LAN confia uns nos outros. É verdade... até o primeiro host que abusa dessa confiança.

---

**Recursos**

- **GitHub**: [fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **Minecraft auth**: [Yggdrasil protocol](https://wiki.vg/Authentication) (wiki.vg)
- **Criptografia RSA**: [RFC 3447](https://tools.ietf.org/html/rfc3447) (PKCS #1)

**3 pontos principais**

1. Assinaturas RSA validam uma mensagem em vez de uma identidade, um detalhe que custou caro a muitos sistemas.
2. O Minecraft deixa de verificar que o perfil do jogador corresponde à assinatura que recebe, uma falha lógica na validação, com a criptografia intacta.
3. Em LAN ou em túnel, é festa aberta para um mod que controla o servidor integrado.
