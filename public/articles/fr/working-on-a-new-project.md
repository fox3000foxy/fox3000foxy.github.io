---
title: Travail sur un Nouveau Projet
description: Un aperçu du processus de démarrage et développement d'un nouveau site web.
date: 2026-03-13
tags:
  - meta
  - webdev
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "Fy6kIKJZl6E+EcU0OiGFoFfez7mW5SGcRHy5c9cT8K+YBmZ6s9fS/qDPzw33pu+BOXkXWQ2ltcaQ7fNRIWETug=="
---

# Le Projet

Le projet sur lequel je travaille s'appelle LLJT :

![](assets/20260313_092734_image.png)

C'est un site web qui est aussi une PWA, donc utilisable comme une application mobile. Il utilise MaterialUI pour se comporter comme une vraie application téléphone.
J'ai passé un moment sur les imports Mui : je suis passé de 11707 modules à 595 à la fin, en important chaque icône ligne par ligne au lieu de l'import déstructuré. J'ai appris à ce moment-là que l'import déstructuré charge toute la bibliothèque d'icônes, alors que les imports individuels ne chargent que celles utilisées.

Nibi est le bot connecté à ce site web.![](assets/20260313_093102_image.png)La notation repose sur Google Forms :
![](assets/20260313_093255_image.png)
Nous utilisons des QCM pour évaluer nos étudiants, et nous attribuons aussi des rôles Discord, ainsi que des emojis et des salons, à nos étudiants quand ils réussissent un examen important.

![](assets/20260313_093707_image.png)

Le but de ce projet est d'aider les gens à apprendre le japonais ensemble avec nous, car c'est quelque chose que je veux faire moi-même aussi.
Les étudiants débloqueront également des partenariats avec Crunchyroll et d'autres plateformes, pour récompenser leur progression.

Nibi et le site sont hébergés respectivement par Cloudflare Workers (Interaction URL avec Hono Server) et GitHub Pages avec React.
Le code du site n'est pas open source, mais Nibi l'est, et vous pouvez le trouver sur [ce dépôt GitHub](https://github.com/let-s-Learn-Japanese-Together/nibi). Le site reste privé car il contient des informations privées, mais si vous voulez savoir comment je l'ai construit, demandez-moi sur Discord et je vous expliquerai le processus avec plaisir ! Il utilise une GitHub Action que j'ai créée pour éviter de payer GitHub Enterprise, ainsi que plusieurs autres outils et techniques que je peux vous décrire si ça vous intéresse !

Depuis quelques jours, je prends beaucoup de plaisir à trouver des solutions de contournement pour héberger mes projets sans payer d'hébergement. C'est pour ça que j'ai fait de Nibi un bot Interaction Endpoint, pour l'héberger gratuitement sur Cloudflare Workers, et que j'ai créé une GitHub Action pour déployer le site gratuitement sur GitHub Pages. Chercher ces contournements reste pour moi une des parties les plus stimulantes du code : il faut réfléchir autrement et construire des solutions créatives, et c'est exactement ce défi sans budget qui me motive !

Utiliser GitHub Actions en dehors de son usage prévu, et utiliser Cloudflare Workers pour "héberger" un bot, c'est aussi une façon d'apprendre de nouvelles choses et de découvrir de nouvelles technologies, comme l'hébergement cloud. Je ne veux plus payer pour de l'hébergement.

Je travaille encore dessus mais vous pouvez rejoindre le [serveur Discord](https://discord.gg/frKZ9cJ4fD) si vous voulez suivre l'avancement et voir comment ça évolue, et peut-être même rejoindre le projet si ça vous intéresse ! Le serveur est ouvert à tous, et nous aimerions avoir plus de monde pour apprendre le japonais ensemble ! Vous trouverez le lien d'invitation sur le site, ou vous pouvez me le demander directement !
