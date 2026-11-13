---
title: "La IA aprende PvP en Minecraft: Imitation Learning, Reinforcement Learning, y las 30 variables que importaban"
description: "1 000 duelos grabados, red neuronal entrenada sobre píxeles, 90% de precisión de golpes: y el bot corría directo contra un muro. Luego vinieron el RL, el aprendizaje curricular y 60 horas de entrenamiento."
date: 2026-07-09
tags:
  - minecraft
  - ai
  - python
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "shmLwrrSTpB0j1eHp7mIml7+AbFiw+RKS8g6ADAJ8SDN3Pn4GZB7P53BO2ATZt4abFZKiPHcYUkhhc9ofVoHoQ=="
---

## Introducción

![AI Learns Minecraft PvP thumbnail](assets/ai-pvp-thumbnail.png)

Hay un vídeo titulado [AI Learns Minecraft PvP (Reinforcement Learning + Behavior Cloning)](https://www.youtube.com/watch?v=j5nxDKAjg6U) por Kadambi | AI Engineering, y es uno de los relatos más honestos de entrenamiento de una IA de videojuegos que he visto.

El principio: construir un bot que juegue al PvP de Minecraft (kit espada, armadura de diamante totalmente encantada) mirando la pantalla y enviando comandos de ratón y teclado. Funciona solo con píxeles de entrada y acciones de salida, sin leer la memoria del juego, sin macros y sin mods.

Lo que hace interesante el vídeo no es el resultado final. Es el recorrido: el fracaso del imitation learning, el giro hacia el feature engineering, los ciclos de olvido catastrófico, y las 60+ horas de entrenamiento en un portátil sin GPU.

## Fase 1: Imitation Learning (el fracaso)

![The bot during imitation learning: facing a wall, jumping up and down](assets/ai-pvp-imitation-fail.png)

El creador empezó con un enfoque sensato: grabar 1 000 duelos de su propio gameplay, asociar cada clic de ratón y pulsación de tecla a la imagen correspondiente, y entrenar una red neuronal para predecir las acciones a partir de los píxeles.

```python
# Pseudocode for the imitation learning pipeline
dataset = record_duels(1000)          # hundreds of thousands of frames
for frame, action in dataset:
    pixels = capture_screen(frame)
    network.train(pixels → action)    # predict keyboard/mouse from image
```

La red aprendió a predecir los golpes con **90% de precisión**. Prometedor.

Luego lo probaron en un combate real. El bot caminó directo hacia el borde del mapa, se puso frente a un muro, y saltó arriba y abajo.

¿Por qué?

**La trampa de la vagancia.** En un combate PvP, la tecla W está pulsada la mayor parte del tiempo. La red se dio cuenta de que podía alcanzar una alta precisión manteniendo simplemente W pulsada y sin hacer nada más. Optimizó la acción más frecuente en detrimento de todas las demás.

**La latencia humana.** Las acciones en el dataset están retrasadas unos 200 ms de tiempo de reacción humano. Fotograma a fotograma, la causa y el efecto son casi imposibles de aprender para un modelo a partir de píxeles brutos cuando la acción y su consecuencia visible están separadas por varias imágenes.

**Demostraciones incoherentes.** El propio gameplay del creador variaba: a veces hacía strafe con el teclado, a veces apuntaba con el ratón en situaciones idénticas. Esas entradas contradictorias perturbaron la red.

## Fase 2: Reinforcement Learning con currículo

![The bot learning to track horizontally during RL training](assets/ai-pvp-rl-horizontal.png)

Abandonando el imitation learning, el creador pasó al RL. Pero sumergir un agente fresco en un duelo PvP completo es inútil: pasan demasiadas cosas a la vez para que una exploración aleatoria encuentre algo.

La solución: el **aprendizaje curricular**. Aislar cada mecánica y dejar que el bot domine lo básico antes de entrar en un combate real.

### Paso 1: Apuntado horizontal (7 horas)

La función de recompensa más simple: recompensa positiva por tocar un objetivo, penalización negativa por sufrir daño.

Al principio, el bot apenas se mueve (red neuronal inicializada con valores neutros). Tiembla lateralmente: es el bot probando distintas acciones para ver cuáles dan recompensas.

Tras una hora, aprende a centrarse horizontalmente, pero penosamente despacio. Tras 7 horas, puede seguir al enemigo a izquierda y derecha, aunque asimétricamente (mejor moviéndose de derecha a izquierda que de izquierda a derecha, un comportamiento que persistió durante todo el entrenamiento).

### Paso 2: Feature Engineering

La captura de pantalla en bruto superaba los 2 millones de píxeles. Incluso reducida a 360p, eso son 200 000 entradas: demasiado para un aprendizaje eficaz.

El creador analizó miles de duelos e identificó **30 variables que de verdad cuentan**, repartidas en tres grupos:

**Visión (seguimiento del enemigo)**:
- Distancia del enemigo respecto a la mira (crosshair)
- Tamaño de la caja envolvente del enemigo
- Altura del enemigo
- Estado de la mira (sobre objetivo / fuera de objetivo)
- Velocidad relativa

En vez de procesar toda la imagen, el bot filtra los píxeles estrictamente por el color de la armadura enemiga, haciendo la detección casi instantánea. Bloques de fondo de color similar pueden perturbar ese filtrado: pero en Minecraft, simplemente puedes cambiar las texturas.

**OCR (lectura del HUD)**:
Como el bot no puede recuperar las coordenadas desde el código del juego, escanea la pantalla en tiempo real para extraer:
- Pitch de la cámara
- Momentum
- Nivel Y

El OCR estándar sufre con el texto transparente de Minecraft, así que los datos críticos se fuerzan a blanco y negro para una lectura instantánea.

**Tiempo (ventana de contexto)**:
- Tiempo transcurrido desde que tocaste al enemigo
- Tiempo transcurrido desde que te tocó
- Búfer deslizante de las acciones previas del bot

Eso da a la red un contexto temporal: sin él, el bot no tiene ni idea de si está en medio de un combo o si acaba de empezar un combate.

### Paso 3: Apuntado vertical (otras 7 horas)

![The bot learning to aim up and down during RL training](assets/ai-pvp-rl-vertical.png)

Añadir el movimiento vertical del ratón fue "un desastre total" al principio. El rendimiento inicial quedó roto.

Tras otra hora más en el cajón de arena, el bot entendió cómo mirar arriba y abajo. Pero en el proceso, olvidó por completo cómo seguir horizontalmente.

Es el **olvido catastrófico**: un problema clásico de machine learning donde optimizar para datos nuevos machaca las representaciones aprendidas antes. Al optimizar el apuntado vertical, la red neuronal machacó sin querer sus progresos horizontales, dejando al creador con un bot que podía mantener la mira a nivel pero no podía seguir un objetivo.

Hicieron falta **6 horas adicionales** para recuperar el seguimiento horizontal conservando el control vertical. El bot mantuvo entonces una buena colocación de la mira gracias al grupo OCR que extraía el pitch de la cámara.

### Paso 4: Control del teclado

![The bot toggling the W key constantly, learning to commit to movement](assets/ai-pvp-keyboard.png)

Dar al bot permiso para usar el teclado hizo las características temporales aún más críticas. Al principio, la tecla W se activaba y desactivaba sin parar: un cambio rápido porque la red no había aprendido a comprometerse.

Ese comportamiento se penalizó, así que el bot aprendió a suavizarlo. Empezó a acertar más golpes en sprint (el sonido sordo contra el swish de un golpe parado). Algunos combos parecían insatisfactorios porque el bot explotaba su ventaja de alcance sobre el enemigo.

Para igualar las cosas, el creador aumentó el alcance del enemigo. Muchas de las estrategias aprendidas por el bot dejaron de funcionar. Pero con el tiempo, se adaptó.

### Paso 5: Enseñar al bot cuándo hacer clic

Para la fase final, el creador trajo de vuelta el imitation learning: pero solo para enseñar el timing de los clics, no la política de control completa. El bot intentó imitar los patrones de clic de los duelos grabados.

Al principio, tenía demasiado miedo de intentar nada, temiendo la penalización por los clics malos. Pero al final encontró el valor para golpear y acertar golpes. Claro, olvidó cómo apuntar una vez más en el proceso: el creador tuvo que dejarlo tranquilo durante **50 horas adicionales** para volver a un estado satisfactorio.

## El debate sobre las trampas

El vídeo termina preguntando: ¿este bot hace trampas?

El argumento en contra: el bot solo procesa lo que ve un humano (los mismos píxeles), envía las mismas entradas de teclado/ratón que un humano (sin manipulación de paquetes como el anti-knockback), y no lee la memoria del juego (sin X-ray ni ESP).

El argumento a favor: un bot puede procesar más rápido que un humano, y si el adversario cree que juega contra un humano pero no es así, es engaño.

La opinión del creador: depende de la intención. Si ambas partes saben que es un bot, el combate es justo. El bot encadena al enemigo en el vacío con una serie de 100 golpes.

## El resultado

![The bot executing a 100-hit combo](assets/ai-pvp-final-combo.png)

Un bot PvP de Minecraft entrenado en un **portátil sin GPU**, construido sobre un pipeline de entrenamiento personalizado con:

- **Captura de pantalla** para la entrada de píxeles (2M+ píxeles → 30 características diseñadas)
- **Aprendizaje curricular** (horizontal → vertical → teclado → clics)
- **RL para el control motor** + **imitation learning para el timing de los clics**
- **Feature engineering** sobre los píxeles brutos (3 grupos: visión, OCR, tiempo)
- **60+ horas de entrenamiento** en varias fases

El tiempo total de entrenamiento es de decenas de horas, pero la mayoría son pasivas. El bot tiembla hasta la comprensión, olvida lo aprendido, reaprende, y termina encadenando una serie de 100 golpes.

El vídeo está en [youtube.com/watch?v=j5nxDKAjg6U](https://www.youtube.com/watch?v=j5nxDKAjg6U).

---

*Este artículo cubre solo el contenido del vídeo. Para un contexto más amplio sobre la IA en Minecraft: VPT, DreamerV3, y el panorama del imitation learning vs RL: las secciones de abajo conectan este proyecto con el campo más vasto.*

## VPT: Behavior cloning a gran escala

![OpenAI's VPT project diagram : the Inverse Dynamics Model predicts actions from pairs of frames](assets/vpt-overview.svg)

El enfoque "behavior cloning" del vídeo (Fase 1) es la misma técnica que OpenAI usó en su proyecto **Video PreTraining (VPT)**, pero en extremos opuestos del espectro de recursos. VPT probó que el imitation learning funciona para Minecraft cuando tienes 70 000 horas de vídeo, 720 GPUs, y un inverse dynamics model para pseudoetiquetar datos no etiquetados. El creador aquí probó que falla con un portátil y 1 000 duelos: pero por la misma razón fundamental: el imitation learning está limitado por la calidad de sus demostraciones.

![OpenAI's VPT agent mining a tree in Minecraft](assets/vpt-minecraft.jpg)

El pipeline VPT resuelve el problema de los datos entrenando un **Inverse Dynamics Model (IDM)** que mira la imagen t-1 y la imagen t+1 para predecir la acción en la imagen t. Como el IDM no es causal (ve las imágenes futuras), la tarea es más fácil que el behavior cloning y necesita muchos menos datos etiquetados. Pagaron a contratistas unos 2 000 $ por 2 000 horas de datos etiquetados, y luego usaron el IDM para pseudoetiquetar 70 000 horas de vídeos YouTube de Minecraft.

![Tasa de crafteo/recolección según el volumen de datos de preentrenamiento (escala log): mesas de crafteo, herramientas de madera, herramientas de piedra](assets/vpt-stone-pickaxe-sequence.svg)

El efecto de escala es claro: sobre un eje log de 1 hora a 100 000 horas de datos de preentrenamiento, la tasa a la que el modelo fabrica una mesa de crafteo, herramientas de madera, y luego herramientas de piedra sube por peldaños. El modelo entrenado solo sobre las 2 000 horas etiquetadas por contratistas se estanca en las mesas de crafteo; es al añadir las 70 000 horas pseudoetiquetadas por el IDM (línea de puntos en el gráfico) cuando las herramientas de piedra emergen en zero-shot, sin un solo paso de RL.

El modelo fundacional de 0,5B parámetros resultante alcanzó capacidades zero-shot imposibles solo con RL: cortar árboles, fabricar mesas, salto en columna: y afinado con RL, se convirtió en la primera IA en fabricar herramientas de diamante.

![Recompensa según el número de episodios de entrenamiento RL: partir de un modelo inicializado aleatoriamente vs partir del modelo VPT preentrenado](assets/vpt-diamond-pickaxe-sequence.svg)

Este gráfico muestra por qué el preentrenamiento lo cambia todo para el RL posterior. El RL partido de una red inicializada aleatoriamente (naranja) queda plano cerca de 0 durante casi un millón de episodios: la tarea "conseguir un diamante" tiene una recompensa demasiado dispersa para que un agente ingenuo la encuentre por exploración aleatoria. El RL afinado a partir del modelo VPT preentrenado (verde) parte ya con el comportamiento base (minar, fabricar, explorar) y sube regularmente hasta una recompensa de unos 25, que corresponde al camino completo hacia un pico de diamante.

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/719971231?h=cbdf2617a1" title="VPT agent gameplay demo 1" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045834?h=9cb4118c65" title="VPT agent gameplay demo 2" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045849?h=00398908ed" title="VPT agent gameplay demo 3" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045863?h=060f07e290" title="VPT agent gameplay demo 4" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

*Demos de vídeo oficiales del proyecto VPT de OpenAI, mostrando al agente en acción.*

## OpenAI Five: El problema del reward shaping

![OpenAI Five playing Dota 2 against human professionals](assets/openai-five-dota2.jpg)

OpenAI Five (2019) venció a los campeones del mundo de Dota 2 usando RL puro en autoaprendizaje: sin imitation learning. 256 GPUs, 128 000 núcleos CPU, 180 años de juego al día, 10 meses de entrenamiento.

Pero la función de recompensa la diseñaron a mano expertos en Dota: **28 características de las 20 000 disponibles**, cada una con pesos ajustados manualmente. Valor neto, eliminaciones, muertes, salud de las torres, asignaciones de líneas: todo lo seleccionaron y ponderaron humanos. Sin ese modelado, el agente apenas aprendía (experimento: recompensa solo victoria/derrota → estancamiento en nivel semipro).

El bot del vídeo enfrenta el mismo problema: su función de recompensa codifica la comprensión del creador de lo que cuenta en PvP (tocar es bueno, ser tocado es malo, mantener la mira es bueno). Es inevitable: el RL necesita una señal de recompensa, y el modelado de esa señal codifica un sesgo humano.

## DreamerV3: World models y recompensas dispersas

![DreamerV3 benchmark scores across over 150 diverse tasks with a single configuration](assets/dreamerv3-benchmarks.png)

El DreamerV3 de DeepMind (2023) adopta un tercer enfoque. En vez del behavior cloning o del RL con incentivos, aprende un **world model**: una red neuronal que predice los estados futuros y las recompensas a partir de las acciones pasadas: y planifica soñando futuros posibles. Es el primer algoritmo en recolectar diamantes en Minecraft desde cero sin datos humanos ni currículos, publicado en Nature en 2025.

![DreamerV3 learns a world model to imagine future trajectories](assets/dreamerv3-header.png)

El entorno diamante define una recompensa dispersa sobre 12 hitos (tronco → tablas → palo → mesa de crafteo → pico de madera → piedra → pico de piedra → mineral de hierro → horno → lingote de hierro → pico de hierro → diamante), cada uno dando +1 una sola vez. Más una pequeña recompensa de salud (±0,01 por pv). Total alcanzable: 11,1 en un episodio de 36 000 pasos.

El world model de DreamerV3 le permite imaginar trayectorias y evaluarlas internamente: el actor aprende de rollouts soñados en vez de la experiencia real, probando miles de futuros posibles por cada paso real. Eso hace posibles las recompensas dispersas donde destruirían un agente RL estándar.

Sobre 40 semillas entrenadas durante 100M de pasos ambientales, 24 de las 40 recolectaron al menos un diamante. El primer diamante apareció tras 29M de pasos (~9 días en una GPU).

## ANNA: La IA simbólica se encuentra con Minecraft

![ANNA's task tree decomposition for a flint-and-steel](assets/anna-task-tree.png)

Antes del bot PvP del vídeo, antes de VPT y DreamerV3, estaba **ANNA**: un bot Minecraft construido con una filosofía por completo distinta. En vez de aprender a partir de píxeles o recompensas, ANNA usa una **máquina de estados simbólica** con un **analizador NLP francés** y un **árbol de dependencias de tareas** escrito a mano.

Creado en 2022 (antes de que "vibe coding" fuera un término), ANNA se conecta a un servidor Minecraft vía Mineflayer y entiende comandos en lenguaje natural en francés. Di *"consigue un mechero"*, y ANNA analiza el verbo (consigue → conseguir), busca la receta del objeto, y lo descompone recursivamente en subtareas: minar roble → fabricar tablas → fabricar palos → fabricar una mesa de crafteo → fabricar un pico de madera → minar piedra → fabricar un pico de piedra → minar mineral de hierro → fundir lingotes de hierro → fabricar el mechero.

![ANNA's NLP parser architecture for French command recognition](assets/anna-nlp-diagram.png)

La capa NLP (`utils/id_parser.js`) separa los comandos sobre "y" para gestionar órdenes paralelas, asocia los verbos franceses a los tipos de tareas, y traduce los nombres de objetos franceses a identificadores Minecraft vía un diccionario de 5 000 entradas. Los comandos no reconocidos pasan a un sistema de conversación basado en GPT que presenta a ANNA como un compañero Minecraft consciente.

El **árbol de tareas** (`mc-tasks-tree/`) es el corazón: un algoritmo recursivo que recorre el grafo de objetos Minecraft (recetas de crafteo, rendimientos mineros, drops de monstruos, recetas de horno) para producir un plan paso a paso. Para un casco de diamante, genera una descomposición en 40+ pasos cubriendo los niveles madera, piedra, hierro y diamante.

![ANNA's diamond helmet task tree : a 40+ step breakdown](assets/anna-diamond-helmet.png)

Donde el bot PvP del vídeo aprende de la experiencia, ANNA funciona a partir del conocimiento. No necesita 1 000 duelos ni 60 horas de entrenamiento: necesita el árbol, el analizador y el servidor/distribuidor. Pero tampoco puede generalizar más allá de lo que su árbol codifica. Ninguna cantidad de ingeniería de máquinas de estados le enseñaría a hacer PvP.

El enfoque de ANNA refleja una época distinta de la IA: antes de que el aprendizaje de extremo a extremo dominara, cuando la promesa era que el razonamiento simbólico asociado a una ingeniería cuidadosa podía producir un comportamiento inteligente. Hoy, proyectos como ANNA y el bot PvP representan dos polos de la IA en Minecraft: uno razona sobre el mundo, el otro lo percibe.

## Master Gumbo's Mace Bot: IA con solo command blocks

![The Mace PvP training arena with the bot](assets/mace-bot-arena.png)

En una esquina por completo distinta de la IA en Minecraft, el youtuber **Master Gumbo** construyó un bot de entrenamiento PvP usando **solo command blocks**, únicamente con comandos vanilla de Minecraft, redstone, y un carpet mod para entidades clon de jugador. El resultado es un adversario IA para la maza que practica los cambios de brecha, las cargas de viento y los mecanismos de escudo con el jugador.

El bot empieza como un zombi con equipo irrompible y un tótem en su segunda mano (rellenado en cada tick vía `/item replace`), haciéndolo efectivamente inmortal. Más tarde, Master Gumbo pasa a los bots **Carpet Mod's player replica**, que soportan mecánicas humanoides (levantar escudo, cambiar objeto) que los zombis no pueden hacer.

![The settings center : buttons to configure bot behavior](assets/mace-settings-center.png)

La innovación central es una **máquina de estados pilotada por lo aleatorio**. Un soporte de armadura se teletransporta sobre un círculo de bloques de hormigón coloreado vía el comando `/spreadplayers`, que dispersa las entidades aleatoriamente. El color del bloque de hormigón sobre el que aterriza el soporte determina la próxima acción del bot:

- **Hormigón rojo** → strafe hacia atrás
- **Hormigón azul** → se eleva hacia arriba (ataque) con la carga de viento
- **Hormigón verde** → levantar el escudo
- **Hormigón blanco** → pausa (añade retardo entre acciones)

![The AI decision system : an armor stand on colored concrete](assets/mace-ai-system.png)

La posición del soporte la leen command blocks que detectan el bloque debajo y activan el mecanismo correspondiente. Un bloque de redstone se coloca o retira para activar/desactivar cada comportamiento. Como `/spreadplayers` corre en repetición, el bot toma continuamente nuevas decisiones, creando un comportamiento impredecible pero estructurado.

Master Gumbo llama a eso "una forma muy simple y básica de IA": no aprende de las interacciones como las redes neuronales, pero lo aleatorio + máquina de estados produce un comportamiento PvP realista que es más difícil de predecir que un bot scripteado. El centro de ajustes incluye una interfaz libro para activar/desactivar la IA, ajustar la dificultad y configurar los patrones de desplazamiento.

Tras su entrenamiento con el bot y luego en duelo contra el jugador que lo había tratado de malo (en la intro de su vídeo), Master Gumbo gana. El mapa se comparte vía Discord, Carpet Mod requerido.

![The bot in a duel, practicing mace PvP techniques](assets/mace-final-duel.png)

Donde el bot PvP (Kadambi) aprende a partir de píxeles y ANNA razona a través de un árbol de tareas, el bot de Master Gumbo alcanza la inteligencia mediante **transiciones de estados aleatorias**: un enfoque puro command block que prueba que no hacen falta redes neuronales para construir un adversario PvP convincente.

## Altoclef: Baritone + árbol de tareas a gran escala

Si ANNA es un bot simbólico que *lee* para saber qué hacer, y el Mace Bot aleatoriza las decisiones, **Altoclef** es un agente autónomo completo que *planifica* su camino a través del juego entero. Construido por gaucho-matero como un mod Fabric e impulsado por el pathfinding **Baritone**, Altoclef descompone cualquier objetivo Minecraft en un árbol de tareas y lo ejecuta sin intervención humana.

La interfaz es engañosamente simple: escribe `@gamer` en el chat, y Altoclef empieza la tarea "terminar el juego" desde un mundo survival. Recolecta madera, craftea herramientas, mina hierro y diamante, construye un portal del Nether, recolecta varas Blaze y perlas del Ender, encuentra la fortaleza, y mata al Ender Dragon. Todo en autonomía, vía el cliente Minecraft nativo, en cualquier servidor vanilla.

Bajo el capó, esto se logra gracias a un **sistema de árbol de tareas recursivo** donde cada objetivo de alto nivel (por ejemplo, "craftea un pico de diamante") se descompone en tareas prerrequisito: minar diamante → fundirlo → craftear palos → combinarlos. El árbol recorre el grafo completo de las recetas Minecraft, gestionando las cadenas de producción, los drops de monstruos, las tablas de botín y el acceso a los contenedores. Al contrario que el árbol escrito a mano de ANNA, las tareas de Altoclef son **clases Java programables** que pueden implementar una lógica arbitraria: estrategias de combate, trueque con piglins, patrones de exploración.

La idea arquitectónica clave es la separación del **qué** (el árbol de tareas) del **cómo** (el pathfinding Baritone). Baritone gestiona los desplazamientos de bajo nivel: pathfinding, evitación de obstáculos, rotura de bloques, gestión de inventario, mientras el sistema de tareas orquesta el plan de alto nivel. Esa modularidad significa que ningún componente necesita ser una IA: ambos son algoritmos deterministas, pero su combinación produce un comportamiento complejo y orientado a objetivo que rivaliza con los enfoques por aprendizaje.

Altoclef representa el límite de **la IA Minecraft simbólica pura**: puede terminar el juego desde cero sin entrenamiento, sin GPU, y sin datos humanos, pero no puede adaptarse a tareas que sus programadores no anticiparon, y no puede aprender de la experiencia. Sabe craftear un pico de diamante porque una clase Java le dice exactamente cómo, no porque lo descubriera solo.

## Lo que los conecta

| Enfoque | Método principal | Datos | Cómputo | Resultado | |
|--------------------------|---------------------|---------|--------|-----------|-|
| Bot PvP del vídeo | RL + imitation learning | 1 000 duelos | 1 portátil, 60h | Combo de 100 golpes | |
| OpenAI Five | RL en autoaprendizaje | 180 años de juego/día | 256 GPUs, 10meses | Campeón del mundo Dota 2 | |
| VPT | IL semisupervisado | 70K h YouTube + IDM | 720 GPUs, 9 días | Herramientas de diamante | |
| DreamerV3 | RL world model | Trayectos soñados | 1 GPU, 9 días | Diamante desde cero | |
| **ANNA** | **NLP simbólico + árbol de tareas** | **Recetas escritas** | **1 portátil, instante** | **Todo objeto crafteable** | |
| **Altoclef** | **Baritone + task tree FS** | **Clases Java** | **Mod Fabric, sin GPU** | **Se pasa el juego entero** | |
| **Mace Bot** | **Máquina de estados Command block** | **Decisiones aleatorias** | **MC Vanilla, sin GPU** | **Entrenamiento PvP maza** | |

El bot del vídeo es el más limitado en recursos pero el más honesto sobre el proceso. Falla primero, luego itera. Olvida lo aprendido, luego lo aprende de nuevo. Termina con un combo de 100 golpes: pero también con una pregunta sobre si lo que construyó hace trampas.

---

**Vídeo**: [AI Learns Minecraft PvP](https://www.youtube.com/watch?v=j5nxDKAjg6U) por Kadambi | AI Engineering

**VPT**: [Artículo](https://cdn.openai.com/vpt/Paper.pdf) · [Blog](https://openai.com/index/vpt/) · [GitHub](https://github.com/openai/Video-Pre-Training)

**OpenAI Five**: [Artículo](https://arxiv.org/abs/1912.06680) · [Blog](https://openai.com/index/dota-2/)

**DreamerV3**: [Artículo](https://arxiv.org/abs/2301.04104) · [GitHub](https://github.com/danijar/dreamerv3)

**ANNA**: [GitHub](https://github.com/fox3000foxy/ANNA) · (Node.js, Mineflayer, NLP francés, árbol de tareas)

**Altoclef**: [GitHub](https://github.com/gaucho-matrero/altoclef) · [Fork activo](https://github.com/drmcbride12/altoclef) · (Fabric, Baritone, task tree, beats game)

**Mace Bot**: [Vídeo](https://www.youtube.com/watch?v=Fmp2Il70IF8) por Master Gumbo · (Command blocks, Carpet Mod, máquina de estados)
