---
title: "Como conseguir qualquer capa no Minecraft Bedrock"
description: "Um launcher de terceiros, uma versão antiga do jogo, e um seletor de capas que nunca aprendeu a dizer não. Tutorial completo mais a provável explicação do porquê funciona."
date: 2026-07-14
tags:
  - minecraft
  - bedrock
  - tutorial
  - reverse-engineering
authors:
  - 9stown
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "HZboFy+3P2FUf7UEvF9rWqaeXPUurXG4AkW1ccPNUQZmjH9zp5O5Hc0P8dY7BNZEjb5hewwsgSfErNaBO9s7AQ=="
---

# Como conseguir qualquer capa no Minecraft Bedrock

No Java, existem vários jeitos estranhos de acabar com uma capa que você não deveria ter (ver o artigo sobre `cape-mod`). No Bedrock, o jogo é diferente, a autenticação é diferente, mas mesmo assim existe um jeito, basta um launcher de terceiros e uma versão do jogo velha o bastante para ignorar a validação que achamos garantida.

Veja como fazer, e depois olhamos o que provavelmente acontece por baixo do capô.

## O que você precisa

- Uma conta Microsoft que já tenha o Minecraft Bedrock (a sua serve muito bem)
- O launcher oficial do Minecraft instalado
- [BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher), um launcher de terceiros open source que permite instalar e rodar qualquer versão histórica do Bedrock
- .NET 8.0 Desktop Runtime
- O modo desenvolvedor ativado no Windows

## Etapa 1 -- Instalar o Bedrock pelo menos uma vez com o launcher oficial

Antes de qualquer outra coisa, abra o launcher oficial do Minecraft, vá para a aba **Minecraft: Bedrock Edition**, e clique em **Install**. É preciso que o Bedrock tenha sido instalado e rodado pelo menos uma vez pela via oficial antes de mexer no BedrockLauncher.

![Instalar o Bedrock Edition pelo launcher oficial](/images/bedrock-cape/bedrock-cape-01-install-bedrock.png)

## Etapa 2 -- Baixar o BedrockLauncher

Vá para a página de releases do projeto no GitHub. Pegue o zip da última versão listada em **Assets**.

![Página de releases do BedrockLauncher no GitHub](/images/bedrock-cape/bedrock-cape-02-github-release.png)

## Etapa 3 -- Extrair o arquivo

Assim que o zip baixar, extraia para a sua pasta `Downloads` (ou qualquer lugar, desde que você ache a pasta depois).

![Extração do arquivo BedrockLauncher](/images/bedrock-cape/bedrock-cape-03-extract-zip.png)

## Etapa 4 -- Rodar o executável

Vá para a pasta extraída e rode o `BedrockLauncher.exe`.

![Rodando o BedrockLauncher.exe](/images/bedrock-cape/bedrock-cape-04-run-exe.png)

## Etapa 5 -- Instalar o .NET Desktop Runtime e ativar o modo desenvolvedor

Na primeira execução, o Windows muito provavelmente vai pedir o **.NET 8.0 Desktop Runtime**, instale. Também é preciso ativar o **modo desenvolvedor** em `Configurações > Sistema > Para desenvolvedores`, porque o BedrockLauncher instala o jogo como um pacote solto (arquivos brutos, não um pacote real assinado da Store), e o Windows recusa esse tipo de instalação sem esse modo.

![Instalação do runtime .NET e ativação do modo desenvolvedor](/images/bedrock-cape/bedrock-cape-05-dotnet-devmode.png)

## Etapa 6 -- Criar uma nova instalação

Reabra o BedrockLauncher, entre com sua conta Microsoft, vá para a aba **Installations**, e clique em **New installation**.

![Criação de uma nova instalação no BedrockLauncher](/images/bedrock-cape/bedrock-cape-06-new-installation.png)

## Etapa 7 -- Escolher uma versão antiga

Dê um nome à instalação, e na lista de versões escolha uma versão **antiga**, tipicamente uma versão `1.16.x` ou mais antiga. Clique em **Create**.

![Seleção de uma versão antiga, aqui 1.16.0.2](/images/bedrock-cape/bedrock-cape-07-pick-old-version.png)

## Etapa 8 -- Rodar a instalação

Clique em **Play**. A extração dos arquivos pode levar até dez minutos dependendo da máquina, o launcher vai parecer travado ("Not Responding"), é normal, deixe rodando.

![Extração em andamento, o launcher parece não responder](/images/bedrock-cape/bedrock-cape-08-launch-extracting.png)

## Etapa 9 -- Escolher a capa

Com o jogo aberto, entre com sua conta, crie um novo personagem e vá para o editor de skin, aba **Capes**. Lá você vai encontrar a lista completa de todas as capas que existem no Minecraft, incluindo as que você nunca teve (capas de eventos promo, de festivais passados, de Mob Vote, etc). Escolha a que quiser.

**Não mexa no resto da aparência da skin nesta etapa**, deixe só a capa.

![Seleção de uma capa no editor de personagem](/images/bedrock-cape/bedrock-cape-09-choose-cape.png)

## Etapa 10 -- Reinstalar a versão oficial

Volte ao launcher oficial, aba **Installation**, e clique em **Uninstall** na instalação principal do Bedrock, depois reinstale (ou faça **Check for Updates**). Reabra o Minecraft Bedrock pelo launcher oficial desta vez.

![Desinstalação e reinstalação pelo launcher oficial](/images/bedrock-cape/bedrock-cape-10-reinstall-official.png)

E pronto, sua capa está lá, na versão oficial, no seu perfil de verdade.

## O que provavelmente acontece

Não mexi no código-fonte fechado do Bedrock (ao contrário do Java, que dá para descompilar), então o que segue é uma explicação **provável**, não uma certeza absoluta. Mas o comportamento observado combina bem com a hipótese seguinte.

### O seletor de capas nunca foi um controle de acesso

No Bedrock, a tela de seleção de capas mostra provavelmente **a lista completa das capas que existem no jogo**, não só as que sua conta tem. Nos clientes recentes, um filtro de aplicativo (no cliente ou via uma chamada de rede para um serviço de entitlements Xbox/Microsoft) deixa cinzentas ou esconde as capas que você não tem.

O ponto principal é que esse filtro provavelmente foi adicionado **depois**, em uma versão do jogo recente o bastante. Uma versão como 1.16.x é anterior a esse filtro, ou usa um mecanismo de verificação diferente (ou até ausente) : tudo que está na lista fica selecionável, com entitlement ou não.

### Onde exatamente a capa fica guardada ?

É a parte que explica por que sobrevive à reinstalação. A escolha de skin/capa no Bedrock não é só um arquivo local descartável, ela provavelmente é sincronizada no perfil Xbox Live associado à sua conta Microsoft (o mesmo sistema que gerencia sua skin nas outras plataformas Bedrock, celular, console, etc.). Quando você seleciona uma capa no cliente antigo, ele muito provavelmente envia essa seleção ao serviço de perfil, exatamente como um cliente atualizado faria com uma capa legítima, porque do ponto de vista do cliente não há diferença entre uma capa "sua" e uma capa "escolhida". O serviço de perfil confia no cliente neste ponto : registra a seleção sem revalidar se o entitlement realmente existe por trás, pelo menos não na hora da escrita.

Resultado : quando você reabre o jogo oficial atualizado, ele busca sua skin/capa atual no serviço de perfil, e o serviço devolve fielmente o que foi registrado, capa não legítima incluída. A checagem de entitlement, se existir, provavelmente acontece só na hora da **seleção** na UI (daí o filtro nos clientes recentes), e deixa passar a **exibição** do que já está registrado no perfil.

### O paralelo com o Java

É a mesma família de falha lógica do `cape-mod` no Java : um serviço confia em um dado sem reverificar sua origem em cada etapa. No Java, é uma assinatura RSA válida mas repetida no perfil errado. No Bedrock, é provavelmente uma seleção de capa aceita por um cliente antigo que nunca teve o filtro certo, depois propagada sem nova verificação para o estado persistente da conta. Nos dois casos, o problema não é o ponto de entrada (o mod Java, o cliente Bedrock antigo), é que a camada que deveria revalidar o entitlement mais adiante não faz isso, ou faz só uma vez, no lugar errado.

## Por que ainda funciona

Duas explicações possíveis, não incompatíveis entre si :

1. **A Mojang provavelmente não considera isso prioritário.** Precisa de um launcher de terceiros, uma manipulação em várias etapas, e o resultado é puramente cosmético, nenhuma vantagem de gameplay, nenhum dado de outra pessoa comprometido.
2. **Corrigir isso direito exigiria revalidar os entitlements a cada leitura do perfil**, não só na seleção, o que significa uma chamada de rede extra a cada exibição de skin, para um problema que diz respeito só à estética.

## Conclusão

Este tutorial cabe em dez capturas de tela, mas ilustra um princípio que aparece em todo lugar em segurança de software : assim que um sistema histórico (uma versão antiga de cliente, uma API legada, um serviço nunca atualizado) ainda pode escrever em um estado compartilhado, o controle de acesso do presente só protege o que passa pelo presente. Tudo que ainda consegue falar com a API antiga contorna o filtro mais recente, o filtro funciona nas versões recentes, mas nunca foi aplicado à versão que veio antes.

---

**Recursos**

- **BedrockLauncher** : [github.com/bedrockLauncher/BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher)
- **Artigo relacionado** : Cape Mod, o equivalente Java por injeção de assinatura RSA

**3 pontos principais**

1. O seletor de capas de uma versão antiga do Bedrock provavelmente mostra a lista completa das capas do jogo, sem filtro de entitlement.
2. A seleção é depois sincronizada no seu perfil Xbox Live como qualquer capa legítima, o serviço de perfil confia no cliente.
3. A checagem de entitlement, se existir, acontece na seleção na UI recente, não na leitura do que já está registrado na conta.
