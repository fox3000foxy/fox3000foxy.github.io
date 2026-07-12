---
title: Trabalhando em um Novo Projeto
description: Uma visão geral do processo de iniciar e desenvolver um novo site web.
date: 2026-03-13
authors:
  - fox3000foxy
tags:
  - meta
  - webdev
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "f0DopPi+JWun1sjGG0QnNxNBjUEZ+v0ONROXS2OLySYV4anUcjSwg7Pb408zsATzFDvGeNcol35/uWD+ggNunw=="
---

# O Projeto

O projeto em que estou trabalhando se chama LLJT:

![](assets/20260313_092734_image.png)

É um site que também é uma PWA, portanto também um aplicativo móvel. Ele usa MaterialUI para dar a impressão de ser um aplicativo de telefone real.
Recentemente precisei gerenciar os imports do Mui, e passei de 11707 módulos para apenas 595 no final, importando manualmente cada ícone linha por linha, em vez de usar a importação desestruturada: aprendi que quando se faz uma importação desestruturada, na verdade carrega-se toda a biblioteca de ícones, enquanto importando-os individualmente, importa-se apenas aqueles de que precisa.

Nibi é o bot que está conectado a este site.![](assets/20260313_093102_image.png)A classificação é baseada no Google Forms:
![](assets/20260313_093255_image.png)
Usamos questionários de múltipla escolha para avaliar nossos alunos, e também damos cargos no Discord, bem como emojis e canais, aos nossos alunos, se eles passarem em um exame importante.

![](assets/20260313_093707_image.png)

O objetivo deste projeto é ajudar as pessoas a aprender japonês junto conosco, pois é algo que eu também quero fazer.
Os alunos também desbloquearão parcerias com a Crunchyroll e outras plataformas, para recompensá-los por suas habilidades.

Nibi e o site são hospedados respectivamente pelo Cloudflare Workers (Interaction URL com Hono Server) e GitHub Pages com React.
O código do site não é open source, mas o Nibi é, e você pode encontrá-lo neste [repositório do GitHub](https://github.com/let-s-Learn-Japanese-Together/nibi). O site não é open source pois contém informações privadas, mas se você quiser saber como o construí, pode me perguntar no Discord ou em outro lugar, e ficarei feliz em compartilhar o processo! Ele usa na verdade uma GitHub Action que criei para não precisar pagar pelo GitHub Enterprise, e também usa muitas outras ferramentas e técnicas legais que posso compartilhar se você tiver interesse!

Desde alguns dias, estou realmente adorando encontrar soluções alternativas para evitar hospedar meus projetos e ter que pagar por sua hospedagem. Foi por isso que fiz do Nibi um bot Interaction Endpoint, para que pudesse ser hospedado gratuitamente no Cloudflare Workers, e também criei uma GitHub Action para implantar o site gratuitamente no GitHub Pages, para não ter que pagar por sua hospedagem. Acho que encontrar soluções alternativas é uma das partes mais divertidas da programação, e é algo que aprecio enormemente! É preciso realmente pensar fora da caixa e encontrar soluções criativas para os problemas, e é isso que eu amo. Não se trata apenas de escrever código, trata-se de encontrar maneiras de fazer as coisas funcionarem sem gastar dinheiro, e é um desafio que realmente aprecio!

Usar GitHub Actions de uma maneira que não é especialmente prevista, e usar Cloudflare Workers para "hospedar" um bot, também é uma forma de aprender coisas novas e descobrir novas tecnologias, como hospedagem em nuvem, o que também aprecio. Eu realmente não quero mais pagar por hospedagem.

Ainda estou trabalhando nisso, mas você pode entrar no [servidor do Discord](https://discord.gg/frKZ9cJ4fD) se quiser acompanhar o progresso e ver como está evoluindo, e talvez até mesmo se juntar ao projeto se tiver interesse! O servidor é aberto a todos, e gostaríamos de ter mais pessoas para nos acompanhar nesta jornada para aprender japonês juntos! Você encontrará o link de convite no site, ou pode me pedir se quiser!
