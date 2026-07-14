---
title: "valorant-short-maker: el pipeline que genera mis shorts de Valorant solito"
description: "Groq/Llama para el guion, Piper para las voces, FFmpeg para todo lo demás. Cómo un cron job produce y publica un vídeo al día en @valorant_agents, de principio a fin."
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
---

# valorant-short-maker: el pipeline que genera mis shorts de Valorant solito

Desde hace unos meses, un canal de YouTube funciona sin que yo lo toque: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop). Agentes de Valorant que se pican entre rondas, doblados, con subtítulos karaoke, publicados como Shorts. Todo lo genera [`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker), un pipeline TypeScript/Bun que corre en cron y publica sin que nadie tenga que hacer clic en nada.

Así es cómo funciona, paso a paso.

## Cómo queda

Tres frames sacados del vídeo generado para "Duelist Debate" (Phoenix, Yoru y Jett):

![Intro de un short, círculo del agente con el título de la escena](/images/valorant-short-maker/vsm-01-intro.png)

![Una réplica en curso, subtítulo karaoke iluminándose](/images/valorant-short-maker/vsm-02-dialogue.png)

![Otra réplica, el color del subtítulo cambia según el agente que habla](/images/valorant-short-maker/vsm-03-dialogue.png)

El resultado en directo en este Short: [Duelist Debate — youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU). Los Shorts del canal andan por 1,2 a 1,5k visualizaciones. Nada del otro mundo, pero es un canal que va solo desde el principio, así que el número que de verdad importa es cero — cero minutos dedicados desde que el cron se puso en marcha.

## El pipeline, por orden

### 1. Escribir el guion — Groq + Llama 3.3

Cada ejecución elige 3 o 4 agentes al azar de entre los 26 disponibles, y envía a Llama 3.3 70B (vía Groq) un prompt de sistema que contiene, para cada agente elegido, un resumen compacto de su personalidad y sus relaciones con los demás agentes de la escena (estas personas viven en `src/lore/`, un archivo por agente). El prompt impone reglas estrictas: frase corta y contundente por réplica, rotación justa entre personajes, humor ante todo, y sobre todo pausas.

Ejemplo concreto con "Duelist Debate" — Phoenix, Yoru y Jett se pelean por quién va de duelista, generado el 6 de julio de 2026:

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

Las pausas son el detalle que hace el ritmo natural: `[0.3]` metido en medio de una réplica crea un silencio de 0,3s en el audio sin cortar el círculo del agente en pantalla, mientras que una línea `pause: 1.0` completa crea un silencio real entre dos interlocutores, círculo oculto. Sin eso, un TTS que encadena réplicas sin respirar suena robótico.

### 2. Darle voz — Piper, un modelo por agente

Cada agente tiene su propio modelo Piper (`.onnx`) entrenado específicamente, guardado en `voices/<agent>/`. El texto generado pasa por el modelo correspondiente, que escupe un WAV. Es la misma tecnología que uso para el entrenamiento de voces custom en general (ver el artículo del pipeline Piper/Kaggle) — aquí aplicada directamente en producción, al vuelo, en cada generación de vídeo.

### 3. Subtítulos karaoke — ASS generado, color extraído del icono

El subtitulado no es un simple `.srt`. Es un archivo `.ass` (Advanced SubStation Alpha) generado palabra por palabra, con efecto karaoke: cada palabra se ilumina en un color a medida que se pronuncia, mientras el resto del texto se queda en un color neutro. El color de acento no es fijo — se extrae dinámicamente del icono del agente que habla (un script Python corre PIL sobre el PNG del icono, muestrea los píxeles no transparentes y devuelve los colores dominantes). Resultado: el subtítulo de Killjoy se ilumina en violeta, el de Jett en azul verdoso, sin que ningún color esté hardcodeado en ninguna parte.

### 4. El círculo audio-reactivo — una expresión FFmpeg por frame

Esta es la parte más retorcida del pipeline, y probablemente de la que más orgulloso estoy. El icono redondo del agente que habla no se queda quieto: hace un ligero zoom al ritmo de su propia voz.

El cálculo lee el WAV crudo de la réplica, calcula la envolvente RMS (root mean square, una medida de la energía de la señal) frame a frame a 60 fps, normaliza por el máximo y suaviza en una ventana de 3 frames para evitar tirones. Cada valor de envolvente se convierte luego en un factor de escala limitado por `MAX_ZOOM_VARIATION` (0,2, o sea ±20% alrededor del tamaño base).

El resultado de este cálculo no se aplica con código que manipule píxeles — se traduce en una enorme expresión condicional de FFmpeg (`lt(n,K)*val + between(n,K,K')*val + ...`, una rama por grupo de frames) que controla directamente el parámetro `scale` del filtro de vídeo. FFmpeg evalúa esta expresión en cada frame del render. Para una réplica de unos segundos a 60 fps, son cientos de ramas en una sola expresión — de ahí el parámetro `STEP` que agrupa frames para limitar la profundidad.

### 5. Render por segmento, luego fisheye en la intro

Cada réplica se renderiza individualmente: fondo de vídeo (un clip aleatorio de `bg-video/`, cortado a la duración justa), el círculo del agente encima con el zoom audio-reactivo, subtítulos incrustados con el filtro `ass` de FFmpeg, audio TTS mezclado con el sonido del gameplay de fondo.

El primer segmento recibe un tratamiento especial: una distorsión fisheye que se disipa gradualmente en el primer 20% de los frames (filtro `lenscorrection` evaluado frame a frame, más un `tmix=frames=3` que mezcla frames adyacentes para simular motion blur), sincronizado con un sonido de "whoosh". Es la transición de intro que da la sensación de que la cámara "entra" en la escena.

### 6. Concatenación y mezcla final

Todos los segmentos se concatenan uno tras otro, la música de fondo (Sneaky Snitch, Kevin MacLeod, licencia Creative Commons) se mezcla encima con **audio ducking** — una compresión sidechain que baja automáticamente el volumen de la música mientras un agente habla, y lo sube en los silencios. Todo corre a 60 fps de principio a fin, sin conversiones de framerate entre etapas.

### 7. Publicación automática

El script `run-cron.sh`, lanzado por un cron normal, activa el entorno Python, carga el `.env` y ejecuta `bun src/workflow.ts --upload`. El flag `--upload` activa además la generación de metadatos (título, descripción, tags) y llama a `uploaders/upload.py`, que publica el vídeo en YouTube e Instagram mediante dos scripts separados (`uploaders/youtube/upload.py` y `uploaders/instagram/`). Toda la cadena, desde el prompt LLM hasta el vídeo online, funciona sin intervención humana.

## Por qué TypeScript/Bun en vez de todo Python

La elección no es ideológica — es que Bun da acceso directo y rápido a `Bun.spawn` para manejar FFmpeg como subproceso, tipado fuerte en las estructuras de datos del pipeline (`Phrase`, `SegmentInfo`), y un runtime que arranca mucho más rápido que Node para un script que se ejecuta por cron cada X horas. Los únicos dos trocitos de Python en el proyecto están donde Python es realmente la mejor herramienta: PIL para extraer colores, y las APIs de subida (`google-api-python-client` para YouTube, el stack de Instagram Graph API para IG).

## Lo que ilustra

Este proyecto es un buen ejemplo de lo que se puede construir hoy con bloques completamente gratuitos u open source: un LLM rápido y gratis vía la API de Groq, un motor TTS local que corre sin GPU dedicada, FFmpeg para todo el render de vídeo — y el pegamento son solo unos cientos de líneas de TypeScript. Ninguno de estos bloques es nuevo por separado. Lo que hace el pipeline es la combinación: generar un guion coherente con relaciones reales entre personajes, transformarlo en audio expresivo con pausas naturales, sincronizar un render visual con la energía de ese audio frame a frame, y automatizar toda la cadena hasta la publicación.

---

**Recursos**

- **Repo**: [github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **Canal**: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**3 puntos clave**

1. El guion lo genera un LLM (Groq/Llama 3.3) con personas y relaciones por agente, no una simple lista de chistes preescritos.
2. El zoom del círculo del agente lo controla una expresión FFmpeg calculada frame a frame a partir de la envolvente RMS del WAV — nada de animación por keyframes clásica.
3. Toda la cadena, del prompt al post en YouTube/Instagram, corre con un solo cron job sin intervención humana.
