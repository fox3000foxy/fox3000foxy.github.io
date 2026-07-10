---
title: Travail sur un Nouveau Projet
description: Un aperçu du processus de démarrage et développement d'un nouveau site web.
date: 2026-03-13
tags:
  - meta
  - webdev
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "IfpsLhIsb2tswzBqdQ0Htn36txqU/tY7c8nYuXdBZyYKuf+yYK59eVAUtWb6pUVUBiNYYdWVeZx8kVsT24G2CA=="
---

# Le Projet

Le projet sur lequel je travaille s'appelle LLJT :

![](assets/20260313_092734_image.png)

C'est un site web qui est aussi une PWA, donc une application mobile également. Il utilise MaterialUI pour donner l'impression d'être une vraie application téléphone.
J'ai récemment dû gérer les imports Mui, et je suis passé de 11707 modules à seulement 595 à la fin, en important manuellement chaque icône ligne par ligne, plutôt que d'utiliser l'import déstructuré : j'ai appris que quand on fait un import déstructuré, on charge en fait toute la bibliothèque d'icônes, alors qu'en les important individuellement, on importe seulement celles dont on a besoin.

Nibi est le bot qui est connecté à ce site web.![](assets/20260313_093102_image.png)La graduation est basée sur Google Forms :
![](assets/20260313_093255_image.png)
Nous utilisons des QCM pour évaluer nos étudiants, et nous donnons aussi des rôles Discord, ainsi que des emojis et des salons, à nos étudiants, s'ils réussissent un examen important.

![](assets/20260313_093707_image.png)

Le but de ce projet est d'aider les gens à apprendre le japonais ensemble avec nous, car c'est quelque chose que je veux faire moi-même aussi.
Les étudiants débloqueront également des partenariats avec Crunchyroll et d'autres plateformes, pour les récompenser de leurs compétences.

Nibi et le site sont hébergés respectivement par Cloudflare Workers (Interaction URL avec Hono Server) et GitHub Pages avec React.
Le code du site n'est pas open source, mais Nibi l'est, et vous pouvez le trouver sur [ce dépôt GitHub](https://github.com/let-s-Learn-Japanese-Together/nibi). Le site n'est pas open source car il contient des informations privées, mais si vous voulez savoir comment je l'ai construit, vous pouvez me demander sur Discord ou autre, et je serai ravi de vous partager le processus ! Il utilise en fait une GitHub Action que j'ai créée pour ne pas avoir à payer GitHub Enterprise, et il utilise aussi beaucoup d'autres outils et techniques sympas que je peux vous partager si ça vous intéresse !

Depuis quelques jours, j'adore vraiment trouver des solutions de contournement pour éviter d'héberger mes projets et d'avoir à payer pour leur hébergement. C'est pour ça que j'ai fait de Nibi un bot Interaction Endpoint, pour qu'il puisse être hébergé gratuitement sur Cloudflare Workers, et j'ai aussi créé une GitHub Action pour déployer le site gratuitement sur GitHub Pages, pour ne pas avoir à payer pour son hébergement. Je trouve que trouver des solutions de contournement est l'une des parties les plus amusantes du code, et c'est quelque chose que j'apprécie énormément ! Il faut vraiment penser hors des sentiers battus et trouver des solutions créatives aux problèmes, et c'est ce que j'adore. Ce n'est pas seulement une question d'écrire du code, c'est une question de trouver des moyens de faire fonctionner les choses sans dépenser d'argent, et c'est un défi que j'apprécie vraiment !

Utiliser GitHub Actions d'une manière qui n'est pas spécialement prévue, et utiliser Cloudflare Workers pour "héberger" un bot, c'est aussi une façon d'apprendre de nouvelles choses et de découvrir de nouvelles technologies, comme l'hébergement cloud, ce que j'apprécie également. Je ne veux vraiment plus payer pour de l'hébergement.

Je travaille encore dessus mais vous pouvez rejoindre le [serveur Discord](https://discord.gg/frKZ9cJ4fD) si vous voulez suivre l'avancement et voir comment ça évolue, et peut-être même rejoindre le projet si ça vous intéresse ! Le serveur est ouvert à tous, et nous aimerions avoir plus de monde pour nous accompagner dans ce voyage pour apprendre le japonais ensemble ! Vous trouverez le lien d'invitation sur le site, ou vous pouvez me le demander si vous voulez !
