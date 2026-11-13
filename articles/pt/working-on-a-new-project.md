---
title: Trabalhando em um Novo Projeto
description: Uma visão geral do processo de iniciar e desenvolver um novo site.
date: 2026-03-13
tags:
  - meta
  - webdev
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "u3ErE2VuBNvMs+Dl+uCZyDCROrmesyva1dxKhW7J1W/hqXcCVBZMAnHQ6FwtK7Dr84FBouzLYJUyz2PtolbV3Q=="
---

# O Projeto

O projeto em que estou trabalhando se chama LLJT :

![](assets/20260313_092734_image.png)

É um site que também é um PWA, então pode ser usado como um aplicativo de celular. Ele usa MaterialUI para se comportar como um verdadeiro aplicativo de telefone.
Passei um tempo nos imports do Mui : reduzi de 11707 módulos para 595 no final, importando cada ícone linha por linha em vez do import desestruturado. Aprendi na época que o import desestruturado carrega toda a biblioteca de ícones, enquanto os imports individuais carregam só os que são usados.

Nibi é o bot conectado a este site.![](assets/20260313_093102_image.png)A avaliação é baseada no Google Forms :
![](assets/20260313_093255_image.png)
Usamos questionários de múltipla escolha para avaliar nossos estudantes, e também atribuímos cargos no Discord, além de emojis e canais, aos nossos estudantes quando passam em uma prova importante.

![](assets/20260313_093707_image.png)

O objetivo deste projeto é ajudar as pessoas a aprender japonês juntas conosco, porque é algo que eu mesmo também quero fazer.
Os estudantes também vão desbloquear parcerias com a Crunchyroll e outras plataformas, para recompensar o progresso deles.

Nibi e o site são hospedados respectivamente por Cloudflare Workers (URL de interação com Hono Server) e GitHub Pages com React.
O código do site não é open source, mas o Nibi é, e você pode encontrá-lo neste [repositório do GitHub](https://github.com/let-s-Learn-Japanese-Together/nibi). O site continua privado porque contém informações privadas, mas se você quiser saber como eu o construí, me pergunte no Discord e explicarei o processo com prazer ! Ele usa uma GitHub Action que criei para evitar pagar o GitHub Enterprise, além de várias outras ferramentas e técnicas que posso descrever se te interessar !

Há alguns dias, tenho me divertido muito encontrando soluções alternativas para hospedar meus projetos sem pagar hospedagem. É por isso que fiz do Nibi um bot de endpoint de interação, para hospedá-lo de graça no Cloudflare Workers, e que criei uma GitHub Action para implantar o site de graça no GitHub Pages. Buscar essas soluções continua sendo para mim uma das partes mais estimulantes do código : é preciso pensar diferente e construir soluções criativas, e é exatamente esse desafio sem orçamento que me motiva !

Usar GitHub Actions fora do uso previsto, e usar Cloudflare Workers para "hospedar" um bot, também é uma forma de aprender coisas novas e descobrir novas tecnologias, como hospedagem em nuvem. Não quero mais pagar por hospedagem.

Ainda estou trabalhando nisso, mas você pode entrar no [servidor do Discord](https://discord.gg/frKZ9cJ4fD) se quiser acompanhar o progresso e ver como evolui, e talvez até entrar no projeto se te interessar ! O servidor é aberto a todos, e gostaríamos de ter mais gente para aprender japonês juntos ! Você vai encontrar o link de convite no site, ou pode me pedir diretamente !
