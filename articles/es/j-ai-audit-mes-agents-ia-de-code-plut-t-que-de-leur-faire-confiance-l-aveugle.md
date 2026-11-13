---
title: "Audité mis agentes IA de código en vez de confiar en ellos a ciegas"
description: "Cómo dos auditorías hechas para redactar el 4º informe técnico de mi plataforma de trading me revelaron dos derivas distintas: un agente que olvida porque el repo ya no cabe en su ventana de contexto, y un agente que escribe diez veces más código del necesario porque nada lo empuja a la concisión."
date: 2026-09-15
tags: ["ai", "llm-agents", "code-review", "context-window", "trading", "typescript"]
authors: ["docteur-turboss"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "UiDNNHm2ULrSzljgdxOUqSyqOddN6zi5UbcRyJJINOYeyCy3RCgVgiwlEwXeShm4QGQhHTkDC+cmTcm1iL12LQ=="
---
## El síntoma antes del diagnóstico

Cada edición del informe técnico de la plataforma me obliga a recorrer la arquitectura entera: servicios, agentes, pipelines de datos. Al preparar la 4ª edición el volumen del repo me saltó a los ojos, cuando lo veía crecer progresivamente sin detenerme nunca en ello: el repo, que cabía al origen en unos miles de líneas, menos de 10ko, alcanza ahora 100MB. La plataforma apenas tenía más funciones. Simplemente me había apoyado en agentes tipo Claude Chat para implementar y corregir código, sin enmarcar con precisión lo que les pedía ni sobre qué perímetro.

Escribir el informe me obligó a salir del modo "avanza" para volver al modo "qué pasó realmente". Hice dos auditorías distintas sobre el historial del repo. Ambas apuntaban a la misma causa, por dos razones por completo distintas.

## Auditoría n°1: la ventana de contexto que miente

La primera auditoría consistía en retomar, servicio por servicio, las correcciones hechas por un agente IA durante varios meses, y comprobar si eran coherentes con el resto del repo en el momento en que se habían aplicado.

El patrón que volvía sin cesar: el agente corregía un problema localmente, en el archivo o el módulo que tenía ante los ojos, sin haber visto el equivalente en otro sitio del repo, o sin acordarse. Resultado: la misma interfaz redefinida ligeramente distinto en dos servicios, un renombrado aplicado a medias porque la segunda ocurrencia estaba fuera de la ventana de contexto en el momento del prompt, una convención de nombres respetada en un módulo e ignorada en el siguiente. Nada espectacular por separado, pero acumulado en decenas de sesiones, eso produce justo la redundancia y los code smells que hacen perder el hilo a la siguiente herramienta que lances sobre eso. Un círculo que se autoalimenta: cuanto más crece y se fragmenta el repo, más difícil es para un agente mantenerlo entero en la cabeza, más las correcciones se vuelven locales y parciales, más crece el repo.

El problema no es que el agente "mienta" o invente; responde correctamente a la pregunta planteada sobre el contexto que se le dio. El problema es que yo, la mayoría de las veces, nunca había definido el perímetro de la pregunta de antemano. Pedía "corrige esta errata, este comportamiento, esta función" sin preguntarme si ese bug tenía equivalentes en otro sitio del repo que el agente no podía ver.

## Auditoría n°2: cuando la verbosidad se vuelve código

La segunda auditoría era más mecánica: pasar un `git log --numstat` por todo el historial, agregar líneas añadidas y caracteres añadidos por commit y mirar la distribución.

Los 30 commits más grandes en líneas añadidas representaban, por sí solos, una parte desproporcionadamente grande del volumen total del repo. Sistemáticamente, los mismos commits también salían como los más grandes en caracteres añadidos. Era previsible, salvo que el ratio caracteres/líneas de esos commits no solo estaba ligado al número de líneas: las líneas mismas eran más verbosas, con más comentarios explicativos redundantes con los nombres de las funciones, más bloques de gestión de errores duplicados en vez de factorizados, más docstrings que reformulaban tres veces lo mismo.

Es la consecuencia directa de un comportamiento conocido cuando interactúas con un LLM en chat: sin consigna explícita de concisión, tiende a hablar mucho, a justificar, comentar, reformular. En conversación, eso cuesta tokens de salida. En generación de código, ese mismo reflejo se traduce en líneas que quedan en el repo indefinidamente, commit tras commit, sin que las releamos de verdad mientras el código funcione.

## Lo que ambas auditorías, juntas, mostraron

Para el primer informe: la coherencia entre servicios sufre de una ventana de contexto demasiado pequeña para abarcar todo el repo, lo que conlleva correcciones locales, redundancias y divergencias de convenciones.

Para el segundo: `git log --numstat` muestra una verbosidad por defecto de un LLM sin enmarcar, lo que causa líneas y caracteres añadidos desproporcionados y código poco factorizado.

Ambos juntos apuntan a la redundancia y al volumen: eso da un repo demasiado grande para que un futuro agente lo abarque, lo que agrava aún más el primer problema puesto de manifiesto por la primera auditoría.

Esa última línea me preocupó más al escribir el informe: ambos problemas están ligados, se alimentan mutuamente. Cuanto más verboso el código generado, más rápido crece el repo; cuanto más crece, menos un agente puede abarcarlo en contexto; cuanto menos puede abarcarlo en contexto, más locales y redundantes son sus correcciones; cuanto más redundantes, más añade volumen. Un bucle de retroalimentación negativa, enteramente causado por un uso de agentes sin enmarcar.

## Por qué no es un bug puntual de una herramienta precisa

Nada de ese diagnóstico es específico de un modelo o un producto en concreto. Un agente tipo chat, sea cual sea, opera sobre lo que se le da a ver en su ventana en el instante T, y genera por defecto la respuesta más completa y justificada posible. Es exactamente el comportamiento esperado de un asistente conversacional, y justo el que hay que evitar para una herramienta que escribe en un repo de producción. El problema viene de la ausencia de enmarcado entre la herramienta y el repo: perímetro de archivos a considerar, formato de salida esperado, presupuesto de líneas o de verbosidad, obligación de citar con precisión lo que ya existe antes de escribir algo nuevo.

## Lo que cambié desde entonces

El reflejo lógico habría sido reducir drásticamente lo que se había escrito. Personalmente, decidí hacer otra cosa. Las auditorías me sirvieron para otra cosa: escanear el código para detectar code smells, y usarlo para delimitar con precisión dónde estaban los verdaderos problemas. Las incoherencias entre servicios, las redundancias, los sitios donde se había perdido el hilo, en vez de adivinar. El volumen de código escrito sigue siendo significativamente el mismo: verboso o no, sigue siendo útil si se usa bien. La palanca era saber con precisión dónde mirar para corregir lo que no cuadraba, en vez de impedir al agente escribir.

## Próximos pasos

El troceado del repo en unidades más pequeñas y mejor delimitadas. Así como salvaguardas de producción para la ejecución y la documentación. El problema que se plantea a su vez es una cuestión de arquitectura: cómo analizar, criticar y hacer comunicar limpiamente los servicios, componentes y documentación que, una vez separados, aun así tienen que coordinar sus decisiones sin volver al mismo monolito de antes.
