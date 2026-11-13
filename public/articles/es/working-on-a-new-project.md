---
title: Trabajando en un proyecto nuevo
description: Un vistazo al proceso de arranque y desarrollo de un nuevo sitio web.
date: 2026-03-13
tags:
  - meta
  - webdev
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "04JDcOMmemZE8A5tIj59NUsDgEMseJ/5bB/cGvNw2qVZVU81RhdZ2VA2xo6oGDeXsLZhMkEGlEUtVN9AezQ3RA=="
---

# El proyecto

El proyecto en el que trabajo se llama LLJT:

![](assets/20260313_092734_image.png)

Es un sitio web que también es una PWA, así que usable como una aplicación móvil. Usa MaterialUI para comportarse como una verdadera aplicación de teléfono.
Pasé un rato con los imports de Mui: pasé de 11707 módulos a 595 al final, importando cada icono línea por línea en vez del import desestructurado. Aprendí en ese momento que el import desestructurado carga toda la librería de iconos, mientras que los imports individuales solo cargan los que se usan.

Nibi es el bot conectado a ese sitio web.![](assets/20260313_093102_image.png)La calificación se basa en Google Forms:
![](assets/20260313_093255_image.png)
Usamos cuestionarios para evaluar a nuestros estudiantes, y también les asignamos roles de Discord, además de emojis y canales, a nuestros estudiantes cuando superan un examen importante.

![](assets/20260313_093707_image.png)

El objetivo de este proyecto es ayudar a la gente a aprender japonés juntos con nosotros, porque es algo que yo mismo también quiero hacer.
Los estudiantes desbloquearán además alianzas con Crunchyroll y otras plataformas, para recompensar su progresión.

Nibi y el sitio están alojados respectivamente por Cloudflare Workers (Interaction Endpoint con Hono Server) y GitHub Pages con React.
El código del sitio no es open source, pero Nibi sí, y puedes encontrarlo en [este repo GitHub](https://github.com/let-s-Learn-Japanese-Together/nibi). El sitio sigue siendo privado porque contiene información privada, ¡pero si quieres saber cómo lo construí, pregúntame en Discord y te explicaré el proceso con gusto! Usa una GitHub Action que creé para evitar pagar GitHub Enterprise, ¡además de varias otras herramientas y técnicas que puedo describirte si te interesa!

Desde hace unos días, disfruto mucho encontrando soluciones alternativas para alojar mis proyectos sin pagar alojamiento. Por eso hice de Nibi un bot Interaction Endpoint, para alojarlo gratis en Cloudflare Workers, y creé una GitHub Action para desplegar el sitio gratis en GitHub Pages. Buscar esos rodeos sigue siendo para mí una de las partes más estimulantes del código: hay que pensar distinto y construir soluciones creativas, y es justo ese desafío sin presupuesto lo que me motiva.

Usar GitHub Actions fuera de su uso previsto, y usar Cloudflare Workers para "alojar" un bot, también es una forma de aprender cosas nuevas y descubrir nuevas tecnologías, como el alojamiento cloud. Ya no quiero pagar por alojamiento.

Sigo trabajando en ello pero puedes unirte al [servidor Discord](https://discord.gg/frKZ9cJ4fD) si quieres seguir el avance y ver cómo evoluciona, ¡y quizá hasta unirte al proyecto si te interesa! ¡El servidor está abierto a todos, y nos encantaría tener más gente para aprender japonés juntos! ¡Encontrarás el enlace de invitación en el sitio, o puedes pedírmelo directamente!
