---
title: "valorant-short-maker: el pipeline que genera mis shorts de Valorant solo"
description: "Groq/Llama para el guion, Piper para las voces, FFmpeg para todo lo demás. Cómo un cron job produce y publica un vídeo al día en @valorant_agents, de la A a la Z."
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "IzLtIWBLqnNuvHgOioFqcwwetmtyNrxdXwwyvrBZ3C7Sp7FT8SJdE6H5BCQuHaJ9zfVL+EwltiNymuAoxQgP7w=="
---

# valorant-short-maker: el pipeline que genera mis shorts de Valorant solo

Desde hace unos meses, un canal de YouTube funciona sin que yo lo toque: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop). Agentes de Valorant que se pican entre dos rondas, doblados, subtitulados en karaoke, publicados como Shorts. Todo lo genera [`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker), un pipeline TypeScript/Bun que corre en cron y publica sin que nadie tenga que hacer clic en nada.

Así funciona, paso a paso.

## Cómo queda

Tres fotogramas extraídos del vídeo generado para "Duelist Debate" (Phoenix, Yoru y Jett):

![Intro de un short, círculo de agente con el título de la escena](/images/valorant-short-maker/vsm-01-intro.png)

![Una réplica en curso, subtítulo karaoke que se ilumina](/images/valorant-short-maker/vsm-02-dialogue.png)

![Otra réplica, el color del subtítulo cambia según el agente](/images/valorant-short-maker/vsm-03-dialogue.png)

El resultado en directo en este Short: [Duelist Debate -- youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU). En el canal, los Shorts rondan las 1,2 a 1,5k vistas. Nada enorme, pero es un canal que funciona solo desde el principio, así que el número que de verdad cuenta es cero: cero minutos dedicados una vez lanzado el cron.

## El pipeline, en orden

### 1. Escribir el guion: Groq + Llama 3.3

Cada ejecución elige 3 o 4 agentes al azar entre los 26 disponibles, y envía a Llama 3.3 70B (vía Groq) un prompt de sistema que contiene, para cada agente elegido, un resumen compacto de su personalidad y de sus relaciones con los demás agentes presentes en la escena (esas personas viven en `src/lore/`, un archivo por agente). El prompt impone reglas precisas: una frase corta y contundente por réplica, rotación equitativa entre los personajes, humor en prioridad, y sobre todo pausas.

Ejemplo concreto con "Duelist Debate": Phoenix, Yoru y Jett discuten sobre quién jugará de duelist, generado el 6 de julio de 2026:

```
phoenix: I'm telling you, I've got the skills to play duelist this match.
yoru: Skills, you call burning things skills, Phoenix.
jett: I'm the fastest one here, I should play duelist.
phoenix: Fastest, but can you handle the heat, Jett [0.3] I doubt it.
yoru: Heat, ha, you think your flames are hotter than my rifts.
jett: This isn't about heat or flames, it's about speed and agility.
phoenix: Oh, I see, so now you're an expert on duelists, Yoru [0.3] that's rich.
yoru: At least I don't rely on cheap fire tricks.
jett: Cheap fire tricks, that's what you call Phoenix's abilities.
phoenix: Hey, my fire tricks have gotten us out of tight spots before [0.3] can't say the same for your rifts, Yoru.
yoru: Tight spots, you mean like the time I rifted us out of that trap.
jett: Enough, this is getting nowhere, let's just decide already.
phoenix: Fine, but I'm still saying I'm the best duelist here.
yoru: Please, you think you can take on the enemy team alone [0.3] I doubt it.
jett: I can take them on, no problem, I'm the fastest.
phoenix: Fastest, yeah, but can you outmaneuver them [0.3] that's the question.
yoru: Outmaneuver, ha, you think you can outmaneuver anyone, Phoenix.
jett: This is stupid, we're not going to agree on this.
phoenix: Fine, let's just play and see who comes out on top [0.3] I'm game if you are.
yoru: Bring it on, I'll show you what a real duelist looks like.
jett: I'm not backing down, I'm playing duelist.
phoenix: Oh, this should be good [0.3] let's see how you two do.
yoru: We'll see who comes out on top, won't we, Jett.
jett: Yeah, let's end this debate once and for all.
pause: 0.3
phoenix: Alright, let's get started then [0.3] may the best duelist win.
yoru: I'll make sure to burn you, Phoenix, not with fire, but with my rifts.
jett: I'll take you both down, no problem.
```

Las pausas son el detalle que hace el ritmo natural: `[0.3]` insertado en medio de una réplica crea un silencio de 0.3s en el archivo de audio sin cortar el círculo del agente en pantalla, mientras que una línea `pause: 1.0` entera crea un verdadero silencio entre dos interlocutores, círculo oculto. Sin eso, un TTS que encadena réplicas sin respirar suena robótico.

### 2. Darle una voz: Piper, un modelo por agente

Cada agente tiene su propio modelo Piper (`.onnx`) entrenado específicamente, guardado en `voices/<agent>/`. El texto generado pasa por el modelo correspondiente, que saca un WAV. Es la misma tecnología que uso para el entrenamiento de voces personalizadas en general (ver el artículo sobre el pipeline Piper/Kaggle): aquí aplicada directamente en producción, al vuelo, en cada generación de vídeo.

### 3. Subtítulos karaoke: ASS generado, color extraído del icono

El subtitulado no es un simple `.srt`. Es un archivo `.ass` (Advanced SubStation Alpha) generado palabra por palabra, con efecto karaoke: cada palabra se ilumina en un color a medida que se pronuncia, mientras el resto del texto queda en un color neutro. El color de acento no es fijo: se extrae dinámicamente del icono del agente que habla (un script Python pasa PIL sobre el PNG del icono, muestrea los píxeles no transparentes, y devuelve los colores dominantes). Resultado: el subtítulo de Killjoy se ilumina en violeta, el de Jett en azul verdoso, sin que ningún color se haya codificado a mano en ningún sitio.

### 4. El círculo audiorreactivo: una expresión FFmpeg por fotograma

Es la parte más retorcida del pipeline, y probablemente de la que estoy más orgulloso. El icono redondo del agente que habla no se queda estático: hace zoom in y zoom out ligeramente al ritmo de su propia voz.

El cálculo se hace leyendo el WAV en bruto de la réplica, calculando la envolvente RMS (root mean square, una medida de la energía de la señal) fotograma a fotograma a 60 fps, normalizando por el máximo, y luego suavizando sobre una ventana de 3 fotogramas para evitar tirones. Cada valor de envolvente se convierte después en un factor de escala acotado por `MAX_ZOOM_VARIATION` (0.2, o sea ±20% alrededor del tamaño base).

El resultado de ese cálculo no se aplica con código que manipule píxeles: se traduce en una inmensa expresión condicional de FFmpeg (`lt(n,K)*val + between(n,K,K')*val + ...`, una rama por grupo de fotogramas) que pilota directamente el parámetro `scale` del filtro de vídeo. FFmpeg evalúa esa expresión en cada fotograma del render. Para una réplica de unos segundos a 60 fps, eso suma rápido cientos de ramas en una sola expresión: de ahí el parámetro `STEP` que agrupa los fotogramas para limitar la profundidad.

### 5. Render por segmento, y luego fisheye en la intro

Cada réplica se renderiza por separado: vídeo de fondo (extracto aleatorio de uno de los clips de gameplay en `bg-video/`, cortado a la duración justa), círculo del agente encima con el zoom audiorreactivo, subtítulos incrustados con el filtro `ass` de FFmpeg, audio TTS mezclado con el sonido del gameplay de fondo.

El primer segmento recibe un tratamiento especial: una distorsión fisheye que se reabsorbe progresivamente sobre el primer 20% de los fotogramas (filtro `lenscorrection` evaluado fotograma a fotograma, más un `tmix=frames=3` que mezcla los fotogramas adyacentes para simular motion blur), sincronizada con un ruido de "whoosh". Es la transición de intro que da la impresión de que la cámara "entra" en la escena.

### 6. Concatenación y mezcla final

Todos los segmentos se concatenan uno tras otro, la música de fondo (Sneaky Snitch, Kevin MacLeod, licencia Creative Commons) se mezcla por encima con **ducking de audio**: una compresión sidechain que baja automáticamente el volumen de la música mientras habla un agente, y que sube durante los silencios. Todo corre en 60 fps de principio a fin, sin conversión de framerate entre etapas.

### 7. Publicación automática

El script `run-cron.sh`, lanzado por un cron clásico, activa el entorno Python, carga el `.env`, y lanza `bun src/workflow.ts --upload`. El flag `--upload` dispara además la generación de metadatos (título, descripción, tags) y llama a `uploaders/upload.py`, que publica el vídeo en YouTube e Instagram mediante dos scripts separados (`uploaders/youtube/upload.py` y `uploaders/instagram/`). Toda la cadena, del prompt LLM al vídeo en línea, corre sin intervención humana.

## Por qué TypeScript/Bun en vez de algo todo Python

La elección no es ideológica: Bun da acceso directo y rápido a `Bun.spawn` para pilotar FFmpeg en subprocesos, un tipado fuerte sobre las estructuras de datos del pipeline (`Phrase`, `SegmentInfo`), y un runtime mucho más rápido al arrancar que Node para un script que corre en cron cada X horas. Los dos únicos trozos de Python del proyecto están donde Python está realmente mejor equipado: PIL para la extracción de colores, y las APIs de subida (`google-api-python-client` para YouTube, la stack de Instagram Graph API para IG).

## Lo que ilustra

Este proyecto es un buen ejemplo de lo que se puede construir hoy con piezas totalmente gratuitas u open source: un LLM rápido y gratuito vía la API de Groq, un motor TTS local que corre sin GPU dedicada, FFmpeg para todo el render de vídeo, y el pegamento no son más que unos cientos de líneas de TypeScript. Ninguna de esas piezas es nueva por separado. Lo que hace el pipeline es el ensamblaje: generar un guion coherente con verdaderas relaciones entre personajes, transformarlo en audio expresivo con pausas naturales, sincronizar un render visual con la energía de ese audio fotograma a fotograma, y automatizar toda la cadena hasta la publicación.

---

**Recursos**

- **Repo**: [github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **Canal**: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**3 puntos clave**

1. El guion lo genera un LLM (Groq/Llama 3.3) con personas y relaciones por agente, no una simple lista de chistes preescritos.
2. El zoom del círculo del agente lo pilota una expresión FFmpeg calculada fotograma a fotograma a partir de la envolvente RMS del WAV: nada de animación clásica por keyframes.
3. Toda la cadena, del prompt al post de YouTube/Instagram, corre con un solo cron job sin intervención humana.
