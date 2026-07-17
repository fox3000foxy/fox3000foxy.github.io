---
title: "Como obter qualquer capa no Minecraft Bedrock"
description: "Um launcher de terceiros, uma versao antiga do jogo e um seletor de capas que nunca aprendeu a dizer nao. Tutorial completo mais a explicacao provavel de porque funciona."
date: 2026-07-14
tags:
  - minecraft
  - bedrock
  - tutorial
  - reverse-engineering
authors:
  - 9stown
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "M0AhC/MTC83qPWhFR1O2DP9MbBOsX99us4rHnIm9GSKVjNOXnXfaB5xVcIUmsibU7OTaLrXZm49XE1MfwKLmDg=="
---

# Como obter qualquer capa no Minecraft Bedrock

No Java ha imensas maneiras manhosas de acabar com uma capa que nao devias ter (ve o artigo do `cape-mod`). No Bedrock o jogo e diferente, a autenticacao e diferente, mas ainda assim ha um metodo -- sem mods, sem mexer num unico pacote de rede. Apenas um launcher de terceiros e uma versao do jogo suficientemente antiga para nao ter a validacao que esperamos.

Aqui fica como fazer e depois olhamos para o que provavelmente acontece sob o capo.

## O que precisas

- Uma conta Microsoft que ja tenha o Minecraft Bedrock (a tua serve perfeitamente)
- O launcher oficial do Minecraft instalado
- [BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher), um launcher de terceiros open source que permite instalar e executar qualquer versao historica do Bedrock
- .NET 8.0 Desktop Runtime
- Modo de programador ativado no Windows

## Passo 1 -- Instalar o Bedrock pelo menos uma vez com o launcher oficial

Antes de fazer seja o que for, abre o launcher oficial do Minecraft, vai ao separador **Minecraft: Bedrock Edition** e clica em **Instalar**. O Bedrock tem de ter sido instalado e executado pelo menos uma vez pelo canal oficial antes de mexeres no BedrockLauncher.

![Instalar o Bedrock Edition a partir do launcher oficial](/images/bedrock-cape/bedrock-cape-01-install-bedrock.png)

## Passo 2 -- Descarregar o BedrockLauncher

Vai a pagina de releases do GitHub do projeto. Descarrega o zip da versao mais recente listada nos **Assets**.

![Pagina de releases do GitHub do BedrockLauncher](/images/bedrock-cape/bedrock-cape-02-github-release.png)

## Passo 3 -- Extrair o arquivo

Depois de descarregar o zip, extrai-o para a tua pasta `Downloads` (ou para qualquer lado, desde que encontres a pasta depois).

![Extracao do arquivo do BedrockLauncher](/images/bedrock-cape/bedrock-cape-03-extract-zip.png)

## Passo 4 -- Executar o executavel

Entra na pasta extraida e executa o `BedrockLauncher.exe`.

![Execucao do BedrockLauncher.exe](/images/bedrock-cape/bedrock-cape-04-run-exe.png)

## Passo 5 -- Instalar o .NET Desktop Runtime e ativar o modo de programador

Na primeira execucao, o Windows vai muito provavelmente pedir o **.NET 8.0 Desktop Runtime** -- instala-o. Tambem precisas de ativar o **modo de programador** em `Definicoes > Sistema > Para programadores`, porque o BedrockLauncher instala o jogo como um pacote loose (ficheiros em bruto, nao um verdadeiro pacote assinado da Store), e o Windows recusa este tipo de instalacao sem esse modo.

![Instalacao do runtime .NET e ativacao do modo de programador](/images/bedrock-cape/bedrock-cape-05-dotnet-devmode.png)

## Passo 6 -- Criar uma nova instalacao

Volta a abrir o BedrockLauncher, inicia sessao com a tua conta Microsoft, vai ao separador **Installations** e clica em **New installation**.

![Criacao de uma nova instalacao no BedrockLauncher](/images/bedrock-cape/bedrock-cape-06-new-installation.png)

## Passo 7 -- Escolher uma versao antiga

Da um nome a instalacao e depois na lista de versoes escolhe uma versao **antiga** -- tipicamente `1.16.x` ou anterior. Clica em **Create**.

![Selecao de uma versao antiga, aqui 1.16.0.2](/images/bedrock-cape/bedrock-cape-07-pick-old-version.png)

## Passo 8 -- Iniciar a instalacao

Clica em **Play**. A extracao dos ficheiros pode demorar ate dez minutos dependendo da maquina -- o launcher vai parecer congelado ("Nao Responde"), e normal, deixa-o correr.

![Extracao em curso, o launcher parece nao responder](/images/bedrock-cape/bedrock-cape-08-launch-extracting.png)

## Passo 9 -- Escolher a capa

Quando o jogo arrancar, inicia sessao com a tua conta, cria uma nova personagem e vai ao editor de skin, separador **Capes**. Ai vais encontrar a lista completa de todas as capas que existem no jogo -- incluindo as que nunca tiveste (capas de eventos promocionais, festivais passados, Mob Vote, etc). Escolhe a que quiseres.

**Nao mexas no resto da aparencia da skin nesta fase**, deixa so a capa.

![Selecao de uma capa no editor de personagem](/images/bedrock-cape/bedrock-cape-09-choose-cape.png)

## Passo 10 -- Reinstalar a versao oficial

Volta ao launcher oficial, separador **Instalacao**, e clica em **Desinstalar** na instalacao Bedrock principal, depois reinstala-a (ou faz **Procurar Atualizacoes**). Inicia o Minecraft Bedrock desta vez a partir do launcher oficial.

![Desinstalacao e reinstalacao a partir do launcher oficial](/images/bedrock-cape/bedrock-cape-10-reinstall-official.png)

E esta feito -- a tua capa esta la, na versao oficial, no teu perfil verdadeiro.

## O que provavelmente esta a acontecer

Nao meti as maos no codigo fonte fechado do Bedrock (ao contrario do Java que e descompilavel), por isso o que se segue e uma explicacao **provavel**, nao uma certeza absoluta. Mas o comportamento observado encaixa bastante bem na seguinte hipotese.

### O seletor de capas nunca foi um controlo de acesso

No Bedrock, o ecra de selecao de capas mostra provavelmente **a lista completa de todas as capas que existem no jogo**, e nao apenas as que a tua conta possui. Nos clientes recentes, um filtro aplicativo (do lado do cliente ou atraves de uma chamada de rede para um servico de entitlement Xbox/Microsoft) põe a cinzento ou esconde as capas que nao possuis.

O ponto chave e que este filtro foi provavelmente adicionado **a posteriori**, numa versao do jogo suficientemente recente. Uma versao como 1.16.x e anterior a este filtro, ou usa um mecanismo de verificacao diferente (ou ausente): tudo o que esta na lista torna-se selecionavel, com ou sem entitlement.

### Onde e que a capa fica guardada exatamente?

Esta e a parte que explica porque e que sobrevive a reinstalacao. A escolha de skin/capa no Bedrock nao e apenas um ficheiro local descartavel -- e provavelmente sincronizada no perfil Xbox Live associado a tua conta Microsoft (o mesmo sistema que gere a tua skin nas outras plataformas Bedrock -- telemovel, consola, etc.). Quando selecionas uma capa no cliente antigo, este envia muito provavelmente essa selecao para o servico de perfil, exatamente da mesma forma que um cliente atualizado o faria com uma capa legitima -- porque do ponto de vista do cliente, nao ha nenhuma diferenca entre uma capa "tua" e uma capa "escolhida". O servico de perfil, por sua vez, confia no cliente neste ponto: regista a selecao sem revalidar se o entitlement realmente existe por tras, pelo menos nao no momento da escrita.

Resultado: quando voltas a iniciar o jogo oficial atualizado, este vai buscar a tua skin/capa atual ao servico de perfil -- e o servico devolve fielmente o que foi guardado, incluindo a capa nao legitima. A verificacao de entitlement, se existir, acontece provavelmente no momento da **selecao** na UI (daí o filtro nos clientes recentes), nao no momento da **exibicao** do que ja esta guardado no perfil.

### O paralelo com o Java

E a mesma familia de falha logica do `cape-mod` no Java: um servico confia em dados sem voltar a verificar a sua origem a cada passo. No Java, e uma assinatura RSA valida replayedada sobre o perfil errado. No Bedrock, e provavelmente uma selecao de capa aceite por um cliente antigo que nunca teve o filtro certo, e depois propagada sem revalidacao para o estado persistente da conta. Em ambos os casos, o problema nao e o ponto de entrada (o mod Java, o cliente antigo Bedrock) -- mas o facto de a camada que deveria revalidar o entitlement a jusante nao o fazer, ou faze-lo apenas uma vez, no sitio errado.

## Porque e que ainda funciona

Duas explicacoes possiveis, nao mutuamente exclusivas:

1. **A Mojang provavelmente nao considera isto prioritario.** E preciso um launcher de terceiros, um processo em varios passos, e o resultado e puramente cosmetico -- sem vantagem de gameplay, sem dados de terceiros comprometidos.
2. **Corrigir isto corretamente exigiria revalidar os entitlements em cada leitura do perfil**, nao apenas na selecao -- o que significa uma chamada de rede adicional em cada exibicao de skin, para um problema que so diz respeito a estetica.

## Conclusao

Este tutorial cabe em dez capturas de ecrã, mas ilustra um principio que se encontra por todo o lado na seguranca de software: assim que um sistema legacy (uma versao antiga de cliente, uma API legacy, um servico nunca atualizado) ainda consegue escrever num estado partilhado, o controlo de acesso atual so protege o que passa pelo presente. Tudo o que ainda consegue falar com a API antiga contorna o filtro mais recente -- nao porque o filtro esteja partido, mas porque nunca foi aplicado a versao que o precedeu.

---

**Recursos**

- **BedrockLauncher** : [github.com/bedrockLauncher/BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher)
- **Artigo relacionado** : Cape Mod, o equivalente em Java por injecao de assinatura RSA

**3 pontos chave**

1. O seletor de capas de uma versao antiga do Bedrock mostra provavelmente a lista completa de todas as capas do jogo, sem filtro de entitlement.
2. A selecao e depois sincronizada no teu perfil Xbox Live como qualquer capa legitima -- o servico de perfil confia no cliente.
3. A verificacao de entitlement, se existir, acontece na selecao na UI recente -- nao na leitura do que ja esta guardado na conta.
