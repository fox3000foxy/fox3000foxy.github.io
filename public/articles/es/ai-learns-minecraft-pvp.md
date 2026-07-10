---
title: Una IA aprende PvP de Minecraft -- Imitation Learning, Reinforcement Learning y las 30 variables que importaban
description: "1.000 duelos grabados, red neuronal entrenada en píxeles, 90% de precisión en teclas : y el bot fue directo a una pared. Luego llegaron RL, aprendizaje curricular y 60 horas de entrenamiento."
date: 2026-07-09
tags:
  - minecraft
  - ai
  - reinforcement-learning
  - imitation-learning
  - python
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "MEUCIQCvwbRnfoduhCTxMY34zMphp1ik/kAiGCMoK+w8+Ndu6wIgNVJ1ufkpSM3TlpiByPOtwzA9EVSHLUpbDXEBENBoUZs="
---

## Introducción

![AI Learns Minecraft PvP thumbnail](assets/ai-pvp-thumbnail.png)

Hay un vídeo llamado [AI Learns Minecraft PvP (Reinforcement Learning + Behavior Cloning)](https://www.youtube.com/watch?v=j5nxDKAjg6U) de Kadambi | AI Engineering, y es uno de los relatos más honestos sobre entrenar una IA para jugar videojuegos que he visto.

La premisa: construir un bot que juegue PvP de Minecraft (kit de espada, armadura de diamante completamente encantada) mirando la pantalla y enviando comandos de ratón y teclado. Sin leer la memoria del juego, sin macros, sin mods : solo píxeles de entrada, acciones de salida.

Lo que hace interesante al video no es el resultado final. Es el viaje: el fracaso del imitation learning, el giro hacia el feature engineering, los ciclos de olvido catastrófico y las 60+ horas de entrenamiento en un portátil sin GPU.

## Fase 1 : Imitation Learning (el fracaso)

![The bot during imitation learning: facing a wall, jumping up and down](assets/ai-pvp-imitation-fail.png)

El creador comenzó con un enfoque sensato: grabar 1.000 duelos de su propio juego, mapear cada clic de ratón y pulsación de tecla al fotograma correspondiente, y entrenar una red neuronal para predecir acciones a partir de los píxeles.

```python
# Pseudocode for the imitation learning pipeline
dataset = record_duels(1000)          # hundreds of thousands of frames
for frame, action in dataset:
    pixels = capture_screen(frame)
    network.train(pixels → action)    # predict keyboard/mouse from image
```

La red aprendió a predecir las pulsaciones con un **90% de precisión**. Prometedor.

Luego lo probaron en una partida real. El bot fue directo al borde del mapa, se encaró a una pared y saltó arriba y abajo.

¿Por qué?

**La trampa de la pereza.** En un combate PvP, la tecla W está pulsada la mayor parte del tiempo. La red se dio cuenta de que podía alcanzar alta precisión simplemente manteniendo W pulsado y no haciendo nada más. Optimizó la acción más común a expensas de todas las demás.

**La latencia humana.** Las acciones en el conjunto de datos están retrasadas unos ~200ms de tiempo de reacción humano. Fotograma a fotograma, la causa y el efecto son casi imposibles de aprender para un modelo a partir de píxeles crudos cuando la acción y su consecuencia visible están separadas por múltiples fotogramas.

**Demostraciones inconsistentes.** El propio juego del creador variaba : a veces strafeando con el teclado, a veces apuntando con el ratón en situaciones idénticas. Estas entradas contradictorias confundían a la red.

## Fase 2 : Reinforcement Learning con plan de estudios

![The bot learning to track horizontally during RL training](assets/ai-pvp-rl-horizontal.png)

Abandonando el imitation learning, el creador cambió a RL. Pero soltar un agente nuevo en un duelo PvP completo es inútil : hay demasiadas cosas ocurriendo a la vez para que la exploración aleatoria encuentre algo.

La solución: el **aprendizaje curricular. Aislar cada mecánica y dejar que el bot domine lo básico antes de entrar en una lucha real.

### Paso 1 : Puntería horizontal (7 horas)

La función de recompensa más simple: recompensa positive por acertar un golpe, penalización negativa por recibir daño.

Inicialmente, el bot apenas se mueve (red neuronal inicializada con valores neutros). Tiembla de lado a lado : es el bot probando diferentes acciones para ver cuáles dan recompensas.

Después de una hora, aprende a centrarse horizontalmente, pero penosamente lento. Tras 7 horas, puede seguir al enemigo a izquierda y derecha, aunque de forma asimétrica (mejor moviéndose de derecha a izquierda que de izquierda a derecha, un comportamiento que persistió durante todo el entrenamiento).

### Paso 2 : Feature Engineering

La captura de pantalla original tenía más de 2 millones de píxeles. Incluso reducida a 360p, son 200.000 entradas : demasiadas para un aprendizaje eficiente.

El creador analizó miles de duelos e identificó **30 variables que realmente importan**, divididas en tres grupos:

**Visión (seguimiento del enemigo)** :
- Distancia del enemigo desde la cruceta
- Tamaño de la caja delimitadora del enemigo
- Altura del enemigo
- Estado de la cruceta (sobre/fuera del objetivo)
- Velocidad relativa

En lugar de procesar la imagen completa, el bot filtra píxeles estrictamente por el color de la armadura del enemigo, haciendo la detección casi instantánea. Bloques de fondo de color similar pueden alterar esto : pero en Minecraft, puedes simplemente cambiar las texturas.

**OCR (lectura del HUD)** :
Como el bot no puede extraer coordenadas del código del juego, escanea la pantalla en tiempo real para extraer:
- Inclinación de la cámara
- Momento
- Nivel Y

El OCR estándar lucha con el texto transparente de Minecraft, así que los datos críticos se fuerzan a blanco y negro para una lectura instantánea.

**Tiempo (ventana de contexto)** :
- Tiempo desde que golpeaste al enemigo
- Tiempo desde que te golpearon
- Buffer deslizante de las acciones previas del bot

Esto da a la red un contexto temporal: sin él, el bot no tiene idea de si está en medio de un combo o empezando una pelea.

### Paso 3 : Puntería vertical (otras 7 horas)

![The bot learning to aim up and down during RL training](assets/ai-pvp-rl-vertical.png)

Añadir movimiento vertical del ratón fue « un desastre total » al principio. El rendimiento inicial estaba roto.

Después de otra hora en el arenero, el bot descubrió cómo mirar arriba y abajo. Pero en el proceso, olvidó por completo cómo seguir horizontalmente.

Esto es el **olvido catastrófico** : un problema clásico de aprendizaje automático en el que optimizar para nuevos datos sobrescribe representaciones previamente aprendidas. Al optimizar para la puntería vertical, la red neuronal sobrescribió accidentalmente su progreso horizontal, dejando al creador con un bot que podía mantener su crucifal nivelada pero no podía seguir un objetivo.

Llevó **6 horas adicionales** recuperar el seguimiento horizontal mientras se mantenía el control vertical. El bot entonces mantuvo una buena colocación del crucifal gracias al grupo OCR extrayendo la inclinación de la cámara.

### Paso 4 : Control del teclado

![The bot toggling the W key constantly, learning to commit to movement](assets/ai-pvp-keyboard.png)

Dar al bot permiso para usar el teclado hizo que las funciones basadas en el tiempo fueran aún más críticas. Al principio, la tecla W se activaba y desactivaba constantemente : cambios rápidos porque la red no había aprendido a comprometerse.

Este comportamiento fue penalizado, así que el bot aprendió a suavizarlo. Empezó a acertar más golpes en sprint (el sonido sordo contra el susurro de un golpe de pie). Algunos combos se veían insatisfactorios porque el bot explotaba su ventaja de alcance sobre el enemigo.

Para nivelar el campo, el creador aumentó el alcance del enemigo. Muchas estrategias aprendidas del bot dejaron de funcionar. Pero dado más tiempo, se adaptó.

### Paso 5 : Enseñar al bot cuándo hacer clic

Para la fase final, el creador recuperó el imitation learning : pero solo para enseñar el tiempo de clic, no la política completa de control. El bot intentaba imitar los patrones de clic de los duelos grabados.

Inicialmente tenía demasiado miedo para intentar nada, temiendo la penalización por clics incorrectos. Pero eventualmente reunió el valor para golpear y acertar impactos. Por supuesto, olvidó cómo apuntar otra vez en el proceso : el creador tuvo que dejarlo solo durante **50 horas más** para volver a un estado satisfactorio.

## El debate sobre las trampas

El video termina preguntando: ¿este bot hace trampa?

El argumento en contra: el bot solo procesa lo que un humano ve (los mismos píxeles), envía las mismas entradas de teclado/ratón que un humano (sin manipulación de paquetes como anti-knockback), y no lee la memoria del juego (sin rayos X ni ESP).

El argumento a favor: un bot puede procesar más rápido que un humano, y si el oponente cree que juega contra un humano pero no lo es, eso es engaño.

La opinión del creador: depende de la intención. Si ambas partes saben que es un bot, es una partida justa. El bot procede a encadenar al enemigo al vacío con una racha de 100 golpes.

## El resultado

![The bot executing a 100-hit combo](assets/ai-pvp-final-combo.png)

Un bot PvP de Minecraft entrenado en un **portátil sin GPU**, construido sobre un pipeline de entrenamiento personalizado con:

- **Captura de pantalla** para entrada de píxeles (2M+ píxeles → 30 características diseñadas)
- **Aprendizaje curricular** (horizontal → vertical → teclado → clic)
- **RL para control motor** + **imitation learning para tiempo de clic**
- **Feature engineering** sobre píxeles en bruto (3 grupos: visión, OCR, tiempo)
- **60+ horas de entrenamiento** en múltiples fases

El tiempo total de entrenamiento es de decenas de horas, pero la mayor parte es pasivo. El bot se sacude hasta la comprensión, olvida lo que aprendió, lo reaprende, y finalmente encadena una racha de 100 golpes.

El video está en [youtube.com/watch?v=j5nxDKAjg6U](https://www.youtube.com/watch?v=j5nxDKAjg6U).

---

*Este artículo cubre solo el contenido del video. Para un contexto más amplio sobre la IA en Minecraft : VPT, DreamerV3, y el panorama del imitation learning vs RL : las secciones a continuación conectan este proyecto con el campo más amplio.*

## VPT : Behavior cloning a escala

![OpenAI's VPT project diagram : the Inverse Dynamics Model predicts actions from pairs of frames](assets/vpt-overview.svg)

El enfoque de «behavior cloning» del video (Fase 1) es la misma técnica que OpenAI usó en su proyecto **Video PreTraining (VPT)**, pero en extremos opuestos del espectro de recursos. VPT demostró que el imitation learning funciona para Minecraft cuando tienes 70.000 horas de video, 720 GPUs y un inverse dynamics model para pseudo-etiquetar datos no etiquetados. El creador aquí demostró que falla con un portátil y 1.000 duelos : pero por la misma razón fundamental: el imitation learning está limitado por la calidad de sus demostraciones.

![OpenAI's VPT agent mining a tree in Minecraft](assets/vpt-minecraft.jpg)

El pipeline VPT resuelve el problema de datos entrenando un **Inverse Dynamics Model (IDM)** que mira el fotograma t-1 y el fotograma t+1 para predecir la acción en el fotograma t. Como el IDM es no causal (ve fotogramas futuros), la tarea es más fácil que el behavior cloning y requiere muchos menos datos etiquetados. Pagaron a contratistas ~2.000 $ por 2.000 horas de datos etiquetados, luego usaron el IDM para pseudo-etiquetar 70.000 horas de videos de Minecraft en YouTube.

El modelo fundamental de 0,5B parámetros resultante logró capacidades zero-shot imposibles solo con RL: cortar árboles, fabricar mesas, saltos : y refinado con RL, se convirtió en la primera IA en fabricar herramientas de diamante.

## OpenAI Five : El problema del moldeado de recompensas

![OpenAI Five playing Dota 2 against human professionals](assets/openai-five-dota2.jpg)

OpenAI Five (2019) derrotó a los campeones del mundo de Dota 2 usando RL puro de autoaprendizaje, sin imitation learning. 256 GPUs, 128.000 núcleos de CPU, 180 años de juego por día, 10 meses de entrenamiento.

Pero la función de recompensa fue hecha a mano por expertos en Dota: **28 de las 20.000 características disponibles**, cada una con pesos afinados manualmente. Valor neto, muertes, salud de torres, asignaciones de carriles: todas seleccionadas y ponderadas por humanos. Sin este moldeado, el agente apenas aprendía (experimento: recompensa solo victoria/derrota → estancamiento en nivel semiprofesional).

El bot del video se enfrenta al mismo problema: su función de recompensa codifica la comprensión del creador de lo que importa en PvP (golpear es bueno, recibir daño es malo, mantener la cruceta es bueno). Esto es inevitable: RL necesita una señal de recompensa, y moldear esa señal codifica el sesgo humano.

## DreamerV3 : Modelos del mundo y recompensas dispersas

![DreamerV3 benchmark scores across over 150 diverse tasks with a single configuration](assets/dreamerv3-benchmarks.png)

DreamerV3 de DeepMind (2023) toma un tercer enfoque. En lugar de behavior cloning o RL moldeado, aprende un **modelo del mundo**: una red neuronal que predice estados futuros y recompensas a partir de acciones pasadas, y planifica soñando con futuros posibles. Fue el primer algoritmo en recolectar diamantes en Minecraft desde cero sin datos humanos ni currículos, publicado en Nature en 2025.

![DreamerV3 learns a world model to imagine future trajectories](assets/dreamerv3-header.png)

El entorno del diamante define una recompensa dispersa sobre 12 hitos (tronco → tablones → palo → mesa de trabajo → pico de madera → piedra → pico de piedra → mineral de hierro → horno → lingote de hierro → pico de hierro → diamante), cada uno dando +1 exactamente una vez. Más una pequeña recompensa de salud (±0.01 por hp). Total alcanzable: 11.1 en un episodio de 36.000 pasos.

El modelo del mundo de DreamerV3 le permite imaginar trayectorias y evaluarlas internamente: el actor aprende de recorridas soñadas en lugar de experiencia real, probando miles de futuros posibles por cada paso real. Esto hace factibles las recompensas dispersas donde matarían a un agente RL estándar.

En 40 semillas entrenadas durante 100M pasos de entorno, 24 de 40 recolectaron al menos un diamante. El primer diamante apareció tras 29M pasos (~9 días en una GPU).

## ANNA : IA simbólica se encuentra con Minecraft

![ANNA's task tree decomposition for a flint-and-steel](assets/anna-task-tree.png)

Antes del bot PvP del video, antes de VPT y DreamerV3, estaba **ANNA**: un bot de Minecraft construido con una filosofía completamente diferente. En lugar de aprender de píxeles o recompensas, ANNA usa una **máquina de estados simbólica** con un **analizador NLP en francés** y un **árbol de dependencias de tareas** escrito a mano.

Creado en 2022 (antes de que «vibe coding» fuera un término), ANNA se conecta a un servidor de Minecraft a través de Mineflayer y entiende comandos en lenguaje natural en francés. Di *«obtiens un briquet»* (consigue un mechero), y el analizador de ANNA identifica el verbo (*obtien* → obtener), busca la receta del objeto y lo descompone recursivamente en subtareas: talar roble → fabricar tablones → fabricar palos → fabricar mesa de trabajo → fabricar pico de madera → minar piedra → fabricar pico de piedra → minar mineral de hierro → fundir lingotes de hierro → fabricar el mechero.

![ANNA's NLP parser architecture for French command recognition](assets/anna-nlp-diagram.png)

La capa NLP (`utils/id_parser.js`) divide comandos en multiplicidad. Divide los comandos por «et» (y) para manejar órdenes paralelas, asigna verbos franceses a tipos de tarea y traduce nombres de objetos franceses a IDs de Minecraft mediante un diccionario de 5.000 entradas. Los comandos no reconocidos caen a un sistema de conversación basado en GPT que presenta a ANNA como un acompañante consciente de Minecraft.

El **árbol de tareas** (`mc-tasks-tree/`) es el núcleo: un algoritmo recursivo que recorre el grafo de objetos de Minecraft (recetas de fabricación, rendimientos de minería, botines de mobs, recetas de al horno) para producir un plan paso a paso. Para un casco de diamante, genera un desglose de más de 40 pasos que abarcan los niveles de madera, piedra, hierro y diamante.

![ANNA's diamond helmet task tree : a 40+ step breakdown](assets/anna-diamond-helmet.png)

Donde el bot PvP del video aprende de la experiencia, ANNA funciona a partir del conocimiento. No necesita 1.000 duelos ni 60 horas de entrenamiento: necesita el árbol, el analizador y el servidor. Pero tampoco puede generalizar más allá de lo que codifica su árbol. Ninguna cantidad de ingeniería de máquina de estados le enseñaría a hacer PvP.

El enfoque de ANNA refleja una era diferente de la IA: antes de que el aprendizaje extremo a extremo dominara, cuando la promesa era que el razonamiento simbólico combinado con una cuidadosa ingeniería podía producir comportamiento inteligente. Hoy, proyectos como ANNA y el bot PvP representan dos polos de la IA en Minecraft: uno razona sobre el mundo, el otro lo percibe.

## Master Gumbo's Mace Bot : IA solo con bloques de comandos

![The Mace PvP training arena with the bot](assets/mace-bot-arena.png)

En un rincón completamente diferente de la IA en Minecraft, el YouTuber **Master Gumbo** construyó un bot de entrenamiento PvP usando **solo bloques de comandos**: sin mods, sin plugins, sin código externo. Solo comandos vanilla de Minecraft, redstone y un carpet mod para e replicar entidades de jugador. El resultado es un oponente de maza PvP que practica cambios de brecha, cargas de viento y mecánicas de escudo con el jugador.

El bot comienza como un zombie con equipo irrompible y un tótem en su mano secundaria (reabastecido cada tick mediante `/item replace`), volviéndolo efectivamente inmortal. Luego, Master Gumbo cambia a los bots **Carpet Mod's player replica**, que soportan mecánicas humanoides (levantar escudo, cambiar objetos) que los zombies no pueden hacer.

![The settings center : buttons to configure bot behavior](assets/mace-settings-center.png)

La innovación central es una **máquina de estados impulsada por aleatoriedad**. Un soporte de armadura es teletransportado sobre un círculo de bloques de concreto de colores mediante el comando `/spreadplayers`, que despersa entidades salatorias. El color del bloque de concreto donde aterriza el soporte de armadura determina la siguiente acción del: del bot:

- **Concreto rojo** → strafe hacia atrás
- **Concreto azul** → carga de viento arriba (ataque)
- **Concreto verde** → levantar escudo
- **Concreto blanco** → pausa (añade demora entre acciones)

![The AI decision system : an armor stand on colored concrete](assets/mace-ai-system.png)

La posición del soporte de armadura es leída por bloques de comandos que detectan el bloque debajo y activan el mecanismo correspondiente. Un bloque de redstone se coloca o se retira para activar/desactivar cada comportamiento. Como `/spreadplayers` corre en repetición, el bot toma continuamente nuevas decisiones, creando un comportamento impredecible pero estructurado.

Master Gumbo llama a esto «una forma muy simple y básica de IA»: no aprende de las interacciones como las redes neuronales, pero la aleatoriedad combinada con la máquina de estados produce un comportamiento PvP realista que es más difícil de predecir que un bot guionizaLa interfaz central de configuración incluye una libro para activar/desactivar la IA, ajustar la dificultad y configurar patrones de movimiento.

Después de entrenar con el bot y luego duelar al jugador que lo llamó malo (en la introducción de su video), Master Gumbo gana. El mapa se comparte a través de Discord, Carpet Mod requerido.

![The bot in a duel, practicing mace PvP techniques](assets/mace-final-duel.png)

Donde el bot PvP (Kadambi) aprende de píxeles y ANNA razona a través de un árbol de tareas, el bot de Master Gumbo logra inteligencia mediante **transiciones de estado aleatorias**: un enfoque puro de bloques de comandos que demuestra que no necesitas redes neuronales para construir un oponente PvP convincente.

## Altoclef : Baritone + árbol de tareas a gran escala

Si ANNA es un bot simbólico que *lee* para saber qué hacer, y el Mace Bot aleatoriza las decisiones, **Altoclef** es un agente autónomo completo que *planifica* su camino a través del juego entero. Construido por gaucho-matero como un mod Fabric e impulsado por el pathfinding **Baritone**, Altoclef descompone cualquier objetivo de Minecraft en un árbol de tareas y lo ejecuta sin intervención humana.

La interfaz es engañosamente simple: escribe `@gamer` en el chat, y Altoclef comienza la tarea de «terminar el juego» desde un mundo survival. Recolecta madera, fabrica herramientas, mina hierro y diamante, construye un portal del Nether, recolecta varas de Blaze y perlas de Ender, encuentra la fortaleza y mata al Ender Dragon. Todo autónomamente, a través del cliente nativo de Minecraft, en cualquier servidor vanilla.

Bajo el capó, esto se logra mediante un **sistema de árbol de tareas recursivo** donde cada objetivo de alto nivel (por ejemplo, «fabrica un pico de diamante») se descompone en tareas prerrequisito: minar diamante → fundirlo → fabricar palos → combinarlos. El árbol recorre el grafo completo de recetas de Minecraft, manejando cadenas de producción, drops de mobs, tablas de botín y acceso a contenedores. A diferencia del árbol escrito a mano de ANNA, las tareas de Altoclef son **clases Java programables** que pueden implementar lógica arbitraria: estrategias de combate, trueque con piglins, patrones de exploración.

La idea arquitectónica clave es la separación del **qué** (el árbol de tareas) del **cómo** (el pathfinding de Baritone). Baritone maneja el movimiento de bajo nivel: pathfinding, evitación de obstáculos, rotura de bloques, gestión de inventario — mientras que el sistema de tareas orquesta el plan de alto nivel. Esta modularidad significa que ningún componente necesita ser una IA: ambos son algoritmos deterministas, pero su combinación produce un comportamiento complejo y orientado a objetivos que rivaliza con los enfoques de aprendizaje.

Altoclef representa el límite de **la IA simbólica pura en Minecraft**: puede terminar el juego desde cero sin entrenamiento, sin GPU y sin datos humanos, pero no puede adaptarse a tareas que sus programadores no anticiparon, y no puede aprender de la experiencia. Sabe fabricar un pico de diamante porque una clase Java le dice exactamente cómo, no porque lo haya descubierto por sí mismo.

## Lo que los une todos

| Enfoque | Método central | Datos | Computación | Resultado |
|----------|----------------|------|-------------|--------|
| Bot PvP del video | RL + imitation learning | 1.000 duelos | 1 portátil, 60h | Combo de 100 golpes |
| OpenAI Five | Autoaprendizaje RL | 180 años de juego/día | 256 GPUs, 10 mese | Campeón mundial Dota 2 |
| VPT | IL semisupervisado | 70K h YouTube + IDM | 720 GPUs, 9 días | Herramientas de diamante |
| DreamerV3 | Modelo mundo RL | Trayectorias de sueños | 1 GPU, 9 días | Diamante desde cero |
| **ANNA** | **NLP simbólico + árbol de tareas** | **Recetas escritas a mano** | **1 portátil, instantly** | **Cualquier objeto fabricable** |
| **Altoclef** | **Baritone + task tree FS** | **Java task classes** | **Fabric mod, no GPU** | **Termina el juego entero** |
| **Mace Bot** | **Máquina de estados bloques comando** | **Decisiones aleatorias** | **Vanilla MC, sin GPU** | **Entrenamiento PvP de maza** |

El bot del video es el más limitado en recursos pero el más honesto sobre el proceso. Primero fracasa, luego iterra. Olvida lo que aprendió, luego lo reaprende. Termina con un combo de 100 golpes. pero también con una pregunta sobre si lo que construyé es trampa.

---

**Video** : [AI Learns Minecraft PvP](https://www.youtube.com/watch?v=j5nxDKAjg6U) de Kadambi | AI Engineering

**VPT** : [Artículo](https://cdn.openai.com/vpt/Paper.pdf) · [Blog](https://openai.com/index/vpt/) · [GitHub](https://github.com/openai/Video-Pre-Training)

**OpenAI Five** : [Artículo](https://arxiv.org/abs/1912.06680) · [Blog](https://openai.com/index/dota-2/)

**DreamerV3** : [Artículo](https://arxiv.org/abs/2301.04104) · [GitHub](https://github.com/danijar/dreamerv3)

**ANNA** : [GitHub](https://github.com/fox3000foxy/ANNA) · (Node.js, Mineflayer, NLP francés, árbol de tareas)

**Altoclef** : [GitHub](https://github.com/gaucho-matrero/altoclef) · [Fork activo](https://github.com/drmcbride12/altoclef) · (Fabric, Baritone, task tree, beats game)

**Mace Bot** : [Video](https://www.youtube.com/watch?v=Fmp2Il70IF8) de Master Gumbo · (Command blocks, Carpet Mod, máquina de estados)
