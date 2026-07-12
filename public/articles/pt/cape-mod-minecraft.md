---
title: "Cape Mod: como roubar a capa do Jeb_ com injeção de assinatura RSA"
description: "Um mod Fabric que explora uma falha lógica no sistema de confiança do Minecraft: uma assinatura RSA válida da Mojang mas repetida em uma conta errada. Explicação do código, implicações de segurança e lições criptográficas."
date: 2026-07-11authors:
  - fox3000foxy
tags:
  - minecraft
  - fabric
  - java
  - security
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "CkOwXEVhplGrxxxDf1eOgVSQH6JU/d2mN3C3mJlKLgjPAI5zTf07dc9kMLmLtvpI8RR0eNt7guq6moD5UEXYOQ=="
---

# Cape Mod: como roubar a capa do Jeb_ com injeção de assinatura RSA

![alt text](assets/xbox-profile.png)
E se eu te dissesse que basta uma assinatura RSA válida -- mas para a **conta errada** -- para fazer seus amigos acreditarem que você está usando a capa oficial da Mojang? Bem-vindo ao `cape-mod`, um exploit Fabric que mostra como o Minecraft confia em uma assinatura sem verificar se o perfil ao qual ela pertence é realmente o seu.

## O contexto: como o Minecraft gerencia skins e capas

No Java Edition, há uma pergunta que não fazemos com frequência: **quem é responsável por exibir a skin e a capa de um jogador -- o cliente ou o servidor?**

A resposta é sutil:

| Componente | Quem envia? | Quem baixa? |
|---|---|---|
| **Textura da skin** | O servidor envia a URL assinada | O cliente baixa de `textures.minecraft.net` |
| **Textura da capa** | O servidor envia a URL assinada | O cliente baixa de `textures.minecraft.net` |
| **Propriedade `textures`** | O servidor envia o `GameProfile` da autenticação Mojang | O cliente verifica a assinatura RSA |

O ponto chave: tudo está contido em uma propriedade chamada `textures` do `GameProfile`. Essa propriedade contém:
- Um payload JSON em base64 com as URLs das texturas
- Uma **assinatura RSA** feita com a chave privada da Mojang

## O muro da assinatura RSA

Cada propriedade `textures` se parece com isso quando decodificada:

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

O cliente verifica a assinatura RSA contra a **chave pública embutida no jar** (`yggdrasil_session_pubkey.der`):

```java
// Property.java (authlib)
public boolean isSignatureValid(PublicKey publicKey) {
    Signature sig = Signature.getInstance("SHA1withRSA");
    sig.initVerify(publicKey);
    sig.update(this.value.getBytes());
    return sig.verify(Base64.decodeBase64(this.signature));
}
```

Para jogadores remotos (não locais), o cliente só aceita skins **marcadas como `secure`** -- isto é, com uma assinatura válida:

```java
// SkinManager.createLookup() -- simplificado
PlayerSkin skin = optional
    .filter(ps -> !isRemote || ps.secure())  // ← jogadores remotos precisam ser seguros
    .orElse(defaultSkin);
```

Essa verificação impede spoofing em teoria. Mas é aqui que as coisas ficam interessantes.

## A falha: repetição de assinatura (signature replay)

O cliente verifica se a assinatura RSA **é válida**. Mas ele **nunca** verifica se o `profileId` contido no JSON corresponde ao UUID real do jogador.

Em outras palavras: uma propriedade `textures` extraída de uma **conta Mojang existente** (por exemplo, a de um funcionário da Mojang) pode ser repetida em qualquer outro jogador. A assinatura continua válida -- ela foi genuinamente feita pela Mojang -- só veio de outra conta.

### Como extrair uma assinatura verdadeira?

Jeb_ (UUID `853c80ef-3c37-49fd-aa49-938b674adae6`) tem a capa Mojang Studios. Do servidor de sessão da Mojang:

```bash
curl -s "https://sessionserver.mojang.com/session/minecraft/profile/853c80ef-3c37-49fd-aa49-938b674adae6?unsigned=false"
```

Resposta:

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

A `signature` desse campo `value` foi produzida pela Mojang. É RSA-2048 SHA-1. Ela é **absolutamente** válida, mesmo se você a repetir em outro UUID -- porque a assinatura do Jeb_ continua sendo uma assinatura do Jeb_, e o cliente nunca verifica se ela é **supostamente** sua.

## O código: como o mod funciona

O mod `cape-mod` é minúsculo -- 65 linhas de Java. Aqui está o coração:

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

**Etapas**:
1. **Mixin** em `Player.getGameProfile()` -- o ponto onde o perfil do jogador é retornado
2. Verifica se é um servidor local (Integrated Server)
3. Verifica se é o host (mundo LAN)
4. **Substitui** a propriedade `textures` pela do Jeb_ (hardcoded)
5. Retorna um novo `GameProfile` com as texturas injetadas

O `GameProfile` é portanto **forjado**: é um perfil construído artificialmente, que não corresponde ao jogador real. As propriedades `textures` são **repetidas** do Jeb_ -- a assinatura RSA é autêntica, mas aplicada ao perfil errado. O pacote de rede, por sua vez, é legítimo: o servidor envia normalmente o `ClientboundPlayerInfoUpdatePacket` com esse perfil modificado. É o perfil que é forjado, não o pacote.

Quando os amigos do host entram via LAN, eles recebem o `ClientboundPlayerInfoUpdatePacket` com o perfil modificado. O cliente:
1. Decodifica o payload base64
2. Verifica a assinatura RSA → ✅ válida (é genuinamente a do Jeb_)
3. Marca a skin como `secure=true` (pois a assinatura é válida)
4. Passa pelo filtro `!isRemote || ps.secure()` → ✅ passa
5. **Baixa e exibe a capa do Jeb_**

## Resultado no jogo: a capa na sua skin

Aqui está o resultado in-game. Primeiro, vista frontal com a capa do Jeb_ exibida no host:

![Cape Mod -- capa do Jeb_ exibida no host](/images/cape-mod/cape-01-jeb-cape.png)

Vê-se claramente o padrão vermelho/branco da capa oficial Mojang Studios. Nenhuma diferença de um Jeb_ real que teria sua própria capa -- o cliente baixa exatamente a mesma textura de `textures.minecraft.net`.

E em vista imersiva, em uma partida real:

![Cape Mod -- vista em jogo com capa visível](/images/cape-mod/cape-02-lava-cape.png)

A capa flutua atrás do jogador, ondula com o movimento. Perfeitamente indistinguível de uma skin autêntica com capa oficial.

Outro ângulo, em um mundo com lava e terreno:

![Cape Mod -- capa em ambiente natural](/images/cape-mod/cape-03-local-game.png)

E uma última vista aproximada do gameplay real, onde se vê a capa em ação:

![Cape Mod -- capa em gameplay clássico Minecraft](/images/cape-mod/cape-04-real-gameplay.png)

Para alguém que entrasse em um LAN sem saber que o host tem um mod, não há absolutamente nenhuma maneira de distinguir isso de uma capa Mojang verdadeira. É precisamente esse o ponto: **a assinatura é válida**, o cliente não tem motivo para duvidar.

## Por que isso é uma falha (e por que não é)

É irônico: o exploit funciona **precisamente porque a assinatura é válida**. Não há bypass criptográfico aqui -- é pior, é uma **falha lógica** no modelo de confiança.

| Verificação | Resultado |
|---|---|
| **Validade da assinatura RSA** | ✅ Válida (assinada pela Mojang para o Jeb_) |
| **O `profileId` no payload corresponde ao UUID do host?** | ❌ Não (UUID do Jeb_ ≠ UUID do host) |
| **O cliente verifica a correspondência?** | ❌ **Não. Apenas a assinatura RSA é verificada.** |

O Minecraft confia **na assinatura**, não na identidade de quem a carrega. Contanto que a assinatura venha da Mojang, o cliente a aceita. É como mostrar um passaporte falso assinado pelo governo -- o selo é legítimo, mesmo que o passaporte não lhe pertença.

## As implicações de segurança

### Escopo limitado ao LAN

O mod só funciona em um servidor integrado (LAN). O atacante precisa:
- Ter um mod Fabric instalado
- Ser o host de um mundo LAN
- Seus amigos conectam sem mod (vanilla)

### Mas as possibilidades se ampliam

Em teoria, com a mesma técnica, poderíamos:
- **Reinjetar outros dados assinados**: cabeças, encantamentos ilegais, componentes de chat maliciosos
- **Combinar com um túnel LAN** (NGROK, playit.gg, Radmin VPN) para afetar jogadores na internet
- **Estender para outras propriedades** do perfil que dependem de assinaturas

### Por que a Mojang provavelmente não vai corrigir

Não há "vulnerabilidade" no sentido estrito -- a assinatura é válida. Corrigir isso exigiria que a Mojang modificasse o modelo de autenticação completo, o que é complexo. Por enquanto, é um caso extremo: presume-se que jogadores LAN confiam uns nos outros.

## A armadilha filosófica

O Cape Mod é um excelente **prova de conceito** de uma verdade mais ampla: **você nunca deve confiar em uma assinatura sem verificar quem a assinou e para que propósito**.

É uma lição de criptografia básica. RSA assina uma **mensagem**, não uma **identidade**. Se eu te der uma assinatura RSA válida da Mojang, você sabe que a Mojang assinou *alguma coisa*. Você não sabe para quem, e não pode presumir isso apenas olhando a mensagem.

É exatamente o que aconteceu com certificados SSL/TLS nos anos 2000, quando as CAs aceitavam qualquer coisa -- a assinatura era válida, mas se aplicava ao domínio errado.

## Conclusão

O Cape Mod não é um hack no sentido clássico -- é uma exploração elegante de uma falta de validação lógica no Minecraft. Ele mostra que:

1. **Uma assinatura válida não garante a identidade de quem a carrega**
2. **Em LAN, a confiança é mais frágil** do que se pensa
3. **As propriedades `textures` do Minecraft são essencialmente conteúdo injetado** -- é preciso verificar se correspondem ao jogador que as carrega

Se você entra em um mundo LAN em um servidor "desconhecido" (ou melhor, cujo host tem um mod suspeito), você já tem um problema de segurança muito antes da capa. Mas é sintomático: o Minecraft presume que todos em um LAN confiam uns nos outros. É verdade... até que não seja mais.

---

**Recursos**

- **GitHub**: [fox3000foxy/cape-mod](https://github.com/fox3000foxy/cape-mod)
- **Autenticação Minecraft**: [Protocolo Yggdrasil](https://wiki.vg/Authentication) (wiki.vg)
- **Criptografia RSA**: [RFC 3447](https://tools.ietf.org/html/rfc3447) (PKCS #1)

**3 pontos-chave**

1. Assinaturas RSA validam uma mensagem, não uma identidade -- um detalhe que custou caro a muitos sistemas.
2. O Minecraft não verifica se o perfil do jogador corresponde à assinatura que recebe -- uma falha lógica, não criptográfica.
3. Em LAN ou túnel, tudo é permitido para um mod que controla o servidor integrado.
