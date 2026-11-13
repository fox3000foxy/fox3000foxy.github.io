---
title: Arbeit an einem neuen Projekt
description: Ein Überblick über den Prozess, eine neue Website zu starten und zu entwickeln.
date: 2026-03-13
tags:
  - meta
  - webdev
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "XBw0jvFt6s6MVhrl4WM/8UeZCgC4NP4Yg+sMUvXR2HAZAxoiaUehfkV+JIqDVQTbeurKRydXuVK6gh098SIzrw=="
---

# Das Projekt

Das Projekt, an dem ich arbeite, heißt LLJT:

![](assets/20260313_092734_image.png)

Es ist eine Website, die auch eine PWA ist, also wie eine mobile App nutzbar. Sie nutzt MaterialUI, um sich wie eine echte Telefon-App zu verhalten.
Ich habe eine Weile mit den Mui-Imports verbracht: Ich bin von 11707 Modulen am Ende auf 595 runtergekommen, indem ich jedes Icon Zeile für Zeile importiert habe statt des destrukturierten Imports. Ich habe damals gelernt, dass der destrukturierte Import die ganze Icon-Bibliothek lädt, während einzelne Imports nur die verwendeten laden.

Nibi ist der Bot, der mit dieser Website verbunden ist.![](assets/20260313_093102_image.png)Die Benotung basiert auf Google Forms:
![](assets/20260313_093255_image.png)
Wir nutzen Multiple-Choice-Tests, um unsere Schüler zu bewerten, und wir vergeben auch Discord-Rollen sowie Emojis und Channels an unsere Schüler, wenn sie eine wichtige Prüfung bestehen.

![](assets/20260313_093707_image.png)

Das Ziel dieses Projekts ist es, Menschen zu helfen, gemeinsam mit uns Japanisch zu lernen, denn das ist etwas, das ich selbst auch machen will.
Die Schüler schalten außerdem Partnerschaften mit Crunchyroll und anderen Plattformen frei, um ihren Fortschritt zu belohnen.

Nibi und die Seite werden jeweils von Cloudflare Workers (Interaction URL mit Hono Server) und GitHub Pages mit React gehostet.
Der Code der Seite ist nicht Open Source, aber Nibi ist es, und du findest ihn in [diesem GitHub-Repository](https://github.com/let-s-Learn-Japanese-Together/nibi). Die Seite bleibt privat, weil sie private Informationen enthält, aber wenn du wissen willst, wie ich sie gebaut habe, frag mich auf Discord und ich erkläre dir den Prozess gerne! Sie nutzt eine GitHub Action, die ich erstellt habe, um GitHub Enterprise nicht bezahlen zu müssen, sowie mehrere andere Tools und Techniken, die ich dir beschreiben kann, wenn es dich interessiert!

Seit ein paar Tagen macht es mir viel Spaß, Workarounds zu finden, um meine Projekte zu hosten, ohne für Hosting zu zahlen. Deshalb habe ich Nibi zu einem Interaction-Endpoint-Bot gemacht, um ihn kostenlos auf Cloudflare Workers zu hosten, und ich habe eine GitHub Action erstellt, um die Seite kostenlos auf GitHub Pages zu deployen. Diese Workarounds zu suchen bleibt für mich einer der spannendsten Teile am Coden: Man muss anders denken und kreative Lösungen bauen, und genau diese Herausforderung ohne Budget motiviert mich!

GitHub Actions außerhalb ihres vorgesehenen Zwecks zu nutzen und Cloudflare Workers zu verwenden, um einen Bot zu "hosten", ist auch eine Art, neue Dinge zu lernen und neue Technologien wie Cloud-Hosting zu entdecken. Ich will nicht mehr für Hosting zahlen.

Ich arbeite noch daran, aber du kannst dem [Discord-Server](https://discord.gg/frKZ9cJ4fD) beitreten, wenn du den Fortschritt verfolgen und sehen willst, wie es sich entwickelt, und vielleicht sogar beim Projekt mitmachen, wenn es dich interessiert! Der Server ist offen für alle, und wir hätten gerne mehr Leute, um gemeinsam Japanisch zu lernen! Du findest den Einladungslink auf der Seite, oder du kannst mich direkt fragen!
