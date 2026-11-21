---
title: Arbeit an einem neuen Projekt
description: Ein Überblick über den Start- und Entwicklungsprozess einer neuen Website.
date: 2026-03-13
tags:
  - meta
  - webdev
authors:
  - fox3000foxy
lang: "de"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "kX0/mviyH0iKKsU9FBuR47uVyKX3HdfD0S0V4YJTUC7sHngLaDHMhcAqWmFe46VlFmLgUgQkmFe6nMO0APRZpQ=="
---
# 

Das Projekt, an dem ich arbeite, heißt LLJT:

![](assets/20260313_092734_image.png)

Es ist eine Website, die auch eine PWA ist, also als mobile Anwendung verwendbar. Es verwendet MaterialUI, um sich wie eine echte Telefon-Anwendung zu verhalten. Ich verbrachte eine Weile auf den Importen Mui: Ich habe von 11707 Modulen auf 595 am Ende, indem ich jedes Symbol pro Linie statt des destrukturierten Imports importiert. Ich habe zu diesem Zeitpunkt gelernt, dass der Import destrukturiert lädt die ganze Bibliothek von Symbolen, während die einzelnen Importen nur die verwendeten laden.

Nibi ist der Bot, der mit dieser Website verbunden ist.![](assets/20260313_093102_image.png)Die Bewertung basiert auf Google Forms:![](assets/20260313_093255_image.png)Wir nutzen QCMs, um unsere Studenten zu bewerten, und wir geben auch Discord-Rolle, Emojis und Messen, um die Schüler, wenn sie eine wichtige Prüfung erfolgreich.

![](assets/20260313_093707_image.png)

Das Ziel dieses Projekts ist es, den Menschen zu helfen, Japanisch gemeinsam mit uns zu lernen, denn das ist etwas, was ich auch tun möchte. Studenten werden auch Partnerschaften mit Crunchyroll und anderen Plattformen freisetzen, um ihre Fortschritte zu belohnen.

Nibi und die Website werden jeweils von Cloudflare Workers (Interaction URL mit Hono Server) und GitHub Pages mit React gehostet. Der Code der Website ist nicht Open Source, sondern Nibi, und du kannst es findest du auf [ce dépôt GitHub](https://github.com/let-s-Learn-Japanese-Together/nibi). Die Website bleibt privat, weil sie private Informationen enthält, aber wenn du weißt wollen, wie ich sie gebaut habe, fragst du mich über Discord und ich werde dir den Prozess gerne erklären! Er verwendet eine GitHub Action, die ich erstellt habe, um GitHub Enterprise sowie mehrere andere Tools und Techniken zu vermeiden, die du beschreiben können, wenn du Interesse daran haben!

Seit einigen Tagen habe ich viel Spaß daran, um Umgehungslösungen zu finden, um meine Projekte ohne Unterkunftszahlungen zu beherbergen. Deshalb habe ich Nibi zu einem Roboter für Interaktion Endpoint gemacht, um es kostenlos bei Cloudflare Workers zu unterbringen und eine GitHub Action für die kostenlose Implementierung der Website auf GitHub Pages zu erstellen. Diese Umgehungen zu suchen, ist für mich eine der anregendsten Teile des Codes: man muss anders überlegen und kreative Lösungen aufbauen, und genau diese Herausforderung ohne Budget motiviert mich!

Mit GitHub Aktionen außerhalb seiner vorgesehenen Nutzung und Cloudflare Workers für die "Hosting" eines Bots ist es auch eine Möglichkeit, neue Dinge zu lernen und neue Technologien wie Cloud-Hosting zu entdecken. Ich will nicht mehr für Unterkünfte bezahlen.

Ich arbeite noch daran, aber du kannst sich dem [serveur Discord](https://discord.gg/frKZ9cJ4fD)Wenn du die Fortschritte verfolgen und sehen wollen, wie sich das entwickelt, und vielleicht sogar dem Projekt beitreten wollen, wenn du daran interessiert sind! Der Server ist für alle offen, und wir möchten mehr Leute haben, um Japanisch zusammen zu lernen! du findest den Einladungslink auf der Website, oder du kannst mich direkt fragen!
