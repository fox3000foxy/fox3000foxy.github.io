---
title: Arbeiten an einem neuen Projekt
description: Ein Blick auf den Prozess des Startens und Entwickelns einer neuen Website.
date: 2026-03-13
authors:
  - fox3000foxy
tags:
  - meta
  - webdev
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "nMMDL7TalLfm50hzhIWzjNOnoZVCX3XEOUNV/ods8ShojYln1VbEuSyyubERBeuz/vIXnQMFO5t+DN+EY/1Buw=="
---

# Das Projekt

Das Projekt, an dem ich arbeite, heißt LLJT:

![](assets/20260313_092734_image.png)

Das ist eine Website, die gleichzeitig eine PWA ist, also auch eine Mobile App. Sie verwendet MaterialUI, um sich wie eine echte Smartphone-App anzufühlen.
Ich musste kürzlich die Mui-Imports verwalten und bin von 11707 Modulen auf nur 595 runtergekommen, indem ich jedes Icon einzeln pro Zeile importiert habe, statt destrukturierte Imports zu verwenden: Ich habe gelernt, dass man bei destrukturierten Imports tatsächlich die gesamte Icons-Bibliothek lädt, während man bei Einzelimporten nur die wirklich benötigten lädt...

Nibi ist der Bot, der mit dieser Website verbunden ist.![](assets/20260313_093102_image.png)Die Graduierung basiert auf Google Forms:
![](assets/20260313_093255_image.png)
Wir verwenden Multiple-Choice-Tests, um unsere Schüler zu bewerten, und vergeben auch Discord-Rollen, Emojis und Channels an unsere Schüler, wenn sie eine größere Prüfung bestehen.

![](assets/20260313_093707_image.png)

Das Ziel dieses Projekts ist es, Menschen dazu zu bringen, gemeinsam mit uns Japanisch zu lernen, da ich das auch selbst machen möchte.
Schüler werden außerdem Partnerschaften mit Crunchyroll und anderen Plattformen freischalten können, um sie für ihre Fähigkeiten zu belohnen.

Nibi und die Website werden jeweils von Cloudflare Workers Hono Server Interaction URL und GitHub Pages mit React-Deployment gehostet.
Der Code der Website ist nicht Open Source, aber Nibi schon – du findest es in [diesem GitHub-Repository](https://github.com/let-s-Learn-Japanese-Together/nibi). Die Website ist nicht Open Source, weil sie private Informationen enthält, aber wenn du wissen willst, wie ich sie gebaut habe, kannst du mich auf Discord oder so fragen, und ich teile gerne den Prozess mit dir! Sie verwendet tatsächlich eine GitHub Action, die ich gebaut habe, damit ich nicht für GitHub Enterprise zahlen muss, und dazu viele andere coole Tools und Techniken, die ich dir gerne zeige, wenn du interessiert bist!

In letzter Zeit habe ich es wirklich geliebt, Workarounds für meine Projekte zu finden, um sie nicht hosten zu müssen – und um nicht fürs Hosten zu bezahlen. Deshalb habe ich Nibi als Interaction Endpoint Bot gebaut, der kostenlos auf Cloudflare Workers gehostet werden kann, und ich habe auch eine GitHub Action gebaut, um die Website kostenlos auf GitHub Pages zu deployen. Ich finde, Workarounds zu finden ist einer der spaßigsten Teile am Programmieren, und ich mache das unglaublich gerne! Man muss wirklich um die Ecke denken und kreative Lösungen für Probleme finden – genau das liebe ich daran. Es geht nicht nur darum, Code zu schreiben, sondern Wege zu finden, Dinge zum Laufen zu bringen, ohne Geld auszugeben, und das ist eine Herausforderung, die ich wirklich genieße!

GitHub Actions auf eine Art zu nutzen, die nicht speziell dafür gedacht ist, und Cloudflare Workers zu verwenden, um einen Bot zu 'hosten', ist auch eine Möglichkeit, neue Dinge zu lernen und neue Technologien zu entdecken, wie Cloud Hosting, was ich ebenfalls sehr mag. Ich will einfach nicht mehr fürs Hosten bezahlen.

Ich arbeite noch daran, aber du kannst dem [Discord-Server](https://discord.gg/frKZ9cJ4fD) beitreten, wenn du den Fortschritt verfolgen und sehen willst, wie es sich entwickelt, und vielleicht sogar am Projekt teilnehmen möchtest, falls du interessiert bist! Der Server steht allen offen, und wir würden uns freuen, mehr Leute dabei zu haben, gemeinsam Japanisch zu lernen! Den Einladungslink findest du auf der Website, oder du kannst mich danach fragen!
