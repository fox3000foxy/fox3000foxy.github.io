---
title: Trabajando en un Nuevo Proyecto
description: Una mirada al proceso de iniciar y desarrollar un nuevo sitio web.
date: 2026-03-13
tags:
  - meta
  - webdev
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "7/DtguCfNXYtM3o//YyoLNRs7z50TZpllESq3MUV+kYq7kGeiDenh++AhUORcSNhJZuanc/fMnZNSqZinUqoPA=="
---

# El Proyecto

El proyecto en el que estoy trabajando se llama LLJT:

![](assets/20260313_092734_image.png)

Este es un sitio web que también es una PWA, así que también funciona como aplicación móvil. Usa MaterialUI para sentirse como una aplicación de teléfono real.
Recientemente necesité gestionar las importaciones de Mui, y pasé de 11707 módulos a solo 595 al final, importando manualmente cada icono por línea, en lugar de usar importación desestructurada: aprendí que cuando haces desestructuración, en realidad cargas toda la librería de iconos, y al importarlos individualmente, importas solo los que necesitas...

Nibi es el bot que está conectado a este sitio web.![](assets/20260313_093102_image.png)La graduación se basa en Google Forms:
![](assets/20260313_093255_image.png)
Usamos exámenes de opción múltiple para evaluar a nuestros estudiantes, y también otorgamos roles de Discord, y por lo tanto emojis y canales, a nuestros estudiantes si aprueban un examen importante.

![](assets/20260313_093707_image.png)

El objetivo de este proyecto es que la gente aprenda japonés junto con nosotros, ya que es algo que también quiero hacer yo mismo.
Los estudiantes también desbloquearán asociaciones con Crunchyroll y otras plataformas, para recompensarlos por sus habilidades.

Nibi y el sitio web están alojados respectivamente por Cloudflare Workers Hono Server Interaction URL y GitHub Pages con React Deployment.
El código del sitio web no es de código abierto, pero Nibi sí lo es, y puedes encontrarlo en [este repositorio de GitHub](https://github.com/let-s-Learn-Japanese-Together/nibi). El sitio web no es de código abierto porque contiene información privada, pero si quieres saber cómo lo construí, puedes preguntarme en Discord o algo así, y estaré encantado de compartir el proceso contigo! En realidad usa una GitHub Action que hice para no tener que pagar por GitHub Enterprise, y también usa muchas otras herramientas y técnicas interesantes que puedo compartir contigo si te interesa!

Desde hace unos días, realmente me encantó encontrar soluciones alternativas para mis proyectos para evitar alojarlos, y para evitar pagar por alojarlos, por eso hice de Nibi un Bot de Interaction Endpoint, para que pueda alojarse gratis en Cloudflare Workers, y también hice una GitHub Action para desplegar el sitio web gratis en GitHub Pages, para no tener que pagar por alojarlo. Encuentro que encontrar soluciones alternativas es una de las partes más divertidas de programar, y es algo que realmente disfruto! Tienes que pensar fuera de la caja y encontrar soluciones creativas a los problemas, y eso es lo que me encanta. No se trata solo de escribir código, se trata de encontrar formas de hacer que las cosas funcionen sin gastar dinero, y ese es un desafío que realmente disfruto!

Usar GitHub Actions de una manera que no fue especialmente diseñada para eso, y usar Cloudflare Workers para «alojar» un bot también es una forma de aprender cosas nuevas y descubrir nuevas tecnologías, como el Cloud Hosting, que es algo que también disfruto mucho. Realmente no quiero pagar por alojar más.

Todavía estoy trabajando en ello, pero puedes unirte al [servidor de Discord](https://discord.gg/frKZ9cJ4fD) si quieres seguir el progreso y ver cómo evoluciona, y tal vez incluso unirte al proyecto si te interesa! El servidor está abierto a todos, y nos encantaría tener más personas que se unan a nosotros en este viaje para aprender japonés juntos! Puedes encontrar el enlace de invitación en el sitio web, o puedes pedírmelo si quieres!
