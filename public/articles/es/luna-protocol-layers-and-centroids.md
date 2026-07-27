---
title: "Luna Protocol: cerebros compartidos, clasificación emocional y enrutamiento interesante/fútil"
description: "Luna Protocol pasó de ser un monolito a una arquitectura de cuatro capas: adaptadores, cerebro, clasificador emocional e inferencia. En el menú: centroides de embeddings, enrutamiento interesante/fútil, y ajuste de los parámetros del LLM según valencia y activación."
date: 2026-07-27
tags:
  - discord
  - matrix
  - llm
  - architecture
  - embeddings
  - centroids
  - emotion-ai
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "QNTMiRbNjIsWw5nsHsM+Uqm8Ozfvh0pI4sH8iejVC2M15CAYHcNfU9pq+uwAWTJQJ2Y08/0+0AmBPiSxaRTFHw=="
---

# Luna Protocol: cerebros compartidos, clasificación emocional y enrutamiento interesante/fútil

En los [dos](/articles/es/luna-protocol-discord-bot) [artículos](/articles/es/luna-protocol-official-models) anteriores presenté Luna Protocol como un único bot de Discord con un sistema de comportamiento complejo y un modelo afinado (fine-tuned). Pero la arquitectura ha evolucionado mucho desde entonces. Lo que era un monolito -- un único proceso de Node.js que gestionaba el bot de Discord, el comportamiento y las llamadas al LLM -- se ha transformado en **cuatro capas independientes**, cada una con su propia responsabilidad, su propio lenguaje y su propio ciclo de vida.

Esta separación trajo beneficios inesperados: compartir "cerebros" entre varias plataformas, un sistema de clasificación emocional que ajusta dinámicamente los parámetros del LLM, y un enrutamiento inteligente de mensajes entre dos modelos según la importancia percibida de la conversación.

La evolución no ocurrió de golpe -- siguió un camino orgánico. Primero separé la carpeta `server/` del repositorio del bot, creando así **Krystal** por un lado y dejando **Jade** como adaptador de Discord. Luego creé **Pixieglow** (adaptador de Matrix) reutilizando el `llm-core` y el bus de eventos de Jade. Después llegó **Sapphire**, que introdujo una clasificación GENERIC/SEMANTIC con DistilBERT -- pero los resultados no eran convincentes, así que pasé a centroides de embeddings, más maleables para enriquecer ejemplos y más precisos; la clasificación pasó a ser FÚTIL/INTERESANTE. Finalmente añadí centroides de **valencia** y **activación** para regular la temperatura y el repeat penalty del LLM. Para terminar, eliminé todo el código redundante entre Jade y Pixieglow creando **Emerald**, el cerebro compartido, convirtiendo a Jade y Pixieglow en simples clientes dirigidos por sockets.

En paralelo, he mantenido actualizado un sitio web que documenta el avance del proyecto: [protocol-luna.github.io](https://protocol-luna.github.io/).

Este artículo cuenta cómo y por qué dividí estas capas, qué hace exactamente cada servicio, y cómo conceptos como los **centroides** (vectores promedio de embeddings) y las **variables de resentimiento** (inspiradas en el chatbot PARRY de los años 70) transformaron un simple bot de Discord en un sistema multiplataforma sorprendentemente coherente.

---

## El problema con el monolito

Al principio, Luna Protocol cabía en un único proceso de Node.js. El código gestionaba:

- La conexión a Discord (mediante la biblioteca Eris)
- La evaluación de los disparadores (menciones, palabras clave, follow-ups...)
- La simulación de comportamientos humanos (errores tipográficos, dudas, sueño...)
- Las llamadas HTTP al servidor LLM local (llama.cpp)
- La gestión de sesiones y el anti-spam
- El pipeline de TTS

Todo estaba en el mismo proceso, comunicándose mediante buses de eventos tipados (`TypedBus`). Funcionaba, pero con limitaciones:

- **Imposible añadir un cliente de Matrix** sin duplicar todo el código de comportamiento
- **El LLM y el bot estaban en el mismo repositorio**: la carpeta `server/` ya existía, pero era imposible hacer evolucionar uno sin tocar el otro
- **Sin clasificación inteligente**: cada mensaje se trataba igual, ya fuera un "lol" o una pregunta existencial
- **Sin estado emocional persistente**: el bot no "sentía" nada

Dividir en capas resolvió todos estos problemas.

---

## Las cuatro capas

La arquitectura actual de Luna Protocol está organizada como un embudo de cuatro niveles:

```
Matrix / Discord
      |
      v
  [ADAPTADORES]   Pixieglow (Matrix) / Jade (Discord)
      |
      v
  [CEREBRO]       Emerald (WebSocket, puerto 3126)
      |
      v
  [CLASIFICADOR]  Sapphire (HTTP, puerto 3123)
      |
      v
  [INFERENCIA]    Krystal (llama.cpp, puertos 3124 / 3125)
```

Cada capa puede reiniciarse, actualizarse o reemplazarse de forma independiente.

---

### Capa 1: los adaptadores (Pixieglow y Jade)

Son las capas más simples. Su único trabajo es traducir los eventos de una plataforma de mensajería a un protocolo estandarizado hacia Emerald:

- **Jade** es el adaptador de Discord. Usa la biblioteca Eris para conectarse a Discord y reenvía los mensajes a Emerald vía WebSocket. También gestiona el pipeline de TTS (síntesis de voz vía Piper, conversión a OGG, subida a Discord).
- **Pixieglow** es el adaptador de Matrix. Usa directamente la API HTTP Client-Server de Matrix (sin SDK), con un long-poll sync. No tiene TTS.

Ambos adaptadores comparten el mismo protocolo WebSocket definido en `emerald-client.ts`:

```typescript
type ClientId = "jade" | "pixieglow";

// Eventos (adaptador -> Emerald)
type InEvent = MessageEvent | ReadyEvent | BotMessageEvent | PresenceEvent;

// Comandos (Emerald -> adaptador)
type OutCommand = RespondCommand | TypingCommand | SetPresenceCommand
                | SpontaneousCommand | ForgotCommand;
```

La existencia de dos adaptadores con la misma interfaz demuestra que la compartición funciona: **el mismo "cerebro" (Emerald) sirve indistintamente a un bot de Discord y a un bot de Matrix**, con comportamientos idénticos. El protocolo es declarativo: Emerald no le dice al adaptador *cómo* enviar un mensaje, le dice *qué* enviar (el texto con un retardo, posiblemente un plan de ráfaga, una reacción, etc.). Cada adaptador implementa la ejecución concreta según su plataforma.

Esa es la fuerza de esta arquitectura: para añadir soporte a Telegram, Signal, o cualquier otra plataforma, basta con escribir un adaptador que implemente el protocolo WebSocket.

---

### Capa 2: el cerebro (Emerald)

Emerald es el servicio central de decisión. Escucha en el puerto 3126 vía WebSocket y gestiona:

- **La evaluación de disparadores**: mención, DM, nombre, palabra clave, follow-up, aleatorio
- **La simulación de comportamiento**: retardos de concentración, errores tipográficos, dudas, olvidos, ráfagas, fatiga temática
- **Los ciclos de sueño**: modos sleep / slow / short
- **La gestión de sesiones**: cooldown, límites de sesión, anti-spam
- **El enrutamiento hacia Sapphire**: envío de mensajes, recepción de respuestas en streaming

Emerald es el servicio central que permitió la compartición, y el que más se benefició de la separación. Antes, cada comportamiento (error tipográfico, ráfaga, duda) estaba entrelazado con el código de Discord. Ahora están en módulos dedicados dentro de `behavior/`:

```
emerald/src/behavior/
  burst.ts         -- Planificación de mensajes en ráfaga
  mannerisms.ts    -- Retardos, dudas, reacciones, olvidos
  sleep.ts         -- Evaluación de los horarios de sueño
  typo.ts          -- Simulación de errores tipográficos (AZERTY/QWERTY)
```

El cerebro no sabe en qué plataforma está corriendo. Recibe un `MessageEvent` con un `clientId` ("jade" o "pixieglow"), toma una decisión y devuelve un comando. El adaptador se encarga del resto.

---

### Capa 3: el clasificador emocional (Sapphire)

Sapphire es el servicio técnicamente más interesante. Es un **middleware de LLM** escrito en Python con FastAPI, que cumple cuatro roles críticos:

1. **Clasificador binario FÚTIL / INTERESANTE** vía centroides de embeddings
2. **Puntuador emocional** (valencia / activación) vía centroides
3. **Enrutador de backends** hacia Krystal (modelo pequeño vs modelo grande)
4. **Inyector few-shot** y gestor de sesiones

#### Los centroides: el corazón de la clasificación

Un **centroide** es un concepto simple: es el promedio de un conjunto de vectores de embeddings. En concreto, reuní cientos de mensajes de ejemplo, los pasé por un modelo de embeddings (`BAAI/bge-small-en-v1.5`, 384 dimensiones) y promedié los vectores obtenidos.

Hay **dos centroides de clasificación**:

- `futile_centroid`: el promedio de los embeddings de ~500 mensajes triviales ("lol", "ok", "hello", "nm just chillin u")
- `interesante_centroid`: el promedio de los embeddings de ~550 mensajes sustanciales (preguntas técnicas, confidencias, filosofía)

Cuando llega un mensaje:

```python
def classify(text, embedder, futile_centroid, interesante_centroid):
    emb = embedder.query_embed(text)          # vector 384-D del mensaje
    sim_f = cosine_similarity(emb, futile_centroid)
    sim_i = cosine_similarity(emb, interesante_centroid)
    diff = sim_i - sim_f
    label = "INTERESANTE" if diff > 0 else "FUTIL"
    return label, abs(diff), sim_f, sim_i
```

La similitud coseno entre el mensaje y cada centroide determina la categoría. La diferencia absoluta da la confianza. Es simple, rápido (sin forward pass de LLM) y sorprendentemente eficaz.

#### ¿Por qué dos modelos?

El resultado de esta clasificación decide qué backend de LLM se invoca:

| Etiqueta | Backend Krystal | Modelo | Puerto |
|----------|-----------------|--------|--------|
| `FUTIL` | `generic` | Luna-Protocol-1.5B (941 MB, Q4_K_M) | 3124 |
| `INTERESANTE` | `semantic` | Hermes-3-3B u 8B (según configuración) | 3125 |

La intuición es simple: un "lol" o un "nm just chillin u" no merece invocar un modelo de 8 mil millones de parámetros. El modelo pequeño Luna 1.5B afinado, entrenado con 200.000 muestras de Discord, es más que suficiente para intercambios ligeros. En cambio, una pregunta sobre la vida, una confidencia o un debate técnico se enruta hacia el modelo grande, que puede producir una respuesta más rica.

Este enrutamiento económico reduce considerablemente la carga en el servidor LLM: alrededor del 70% de los mensajes se clasifican como FÚTIL y son gestionados por el modelo pequeño, liberando al modelo grande para las conversaciones que realmente lo merecen.

#### El eje emocional: valencia y activación

Pero eso no es todo. Sapphire usa el **mismo mecanismo de centroides** en un eje independiente para evaluar la emoción del mensaje:

Hay **cuatro centroides emocionales**:

| Polo | Ejemplos |
|------|----------|
| `positivo` | "hell yeah", "love that", "this is great" |
| `negativo` | "shut up", "i hate this", "this sucks" |
| `activación alta` | "WHAT THE HELL", "omg omg omg", "AAAAA" |
| `activación baja` | "just chilling", "meh", "i guess" |

La puntuación se calcula como una diferencia de similitudes en cada eje:

```python
valence = sim(emb, positive) - sim(emb, negative)     # [-1, +1]
arousal = sim(emb, high_arousal) - sim(emb, low_arousal)  # [-1, +1]
```

La **valencia** mide si el mensaje es positivo o negativo. La **activación** mide su intensidad emocional. Juntas forman el modelo circumplejo del afecto (Russell, 1980) -- el mismo modelo psicológico que inspiró al chatbot **PARRY** en 1972.

#### Las variables de resentimiento: cómo las emociones controlan el LLM

Aquí es donde la inspiración de PARRY se vuelve tangible. PARRY (creado por Kenneth Colby en 1972) era un chatbot diseñado para simular a un paciente paranoico. Poseía variables internas -- miedo, ira, desconfianza -- que modificaban sus respuestas. Por ejemplo, un PARRY "asustado" respondía de forma más agresiva.

Sapphire hace lo mismo, pero con variables continuas y un método más elegante: los parámetros de muestreo del LLM se ajustan en tiempo real según el estado emocional de la conversación.

##### La temperatura sigue a la activación

```python
temperature = clamp(0.7 + arousal * 0.3, 0.4, 1.0)
```

| Activación | Temperatura | Efecto |
|------------|-------------|--------|
| -1.0 (calmado) | 0.40 | Baja creatividad, respuestas predecibles |
| 0.0 (neutral) | 0.70 | Creatividad por defecto |
| +1.0 (excitado) | 1.00 | Máxima aleatoriedad, respuestas sorprendentes |

Cuando alguien está excitado o molesto (activación alta), la temperatura sube. El modelo produce respuestas más variadas, más creativas, a veces más caóticas -- como un humano que "se deja llevar". Cuando la conversación está calmada, la temperatura baja y las respuestas son más sosegadas.

##### El repeat penalty sigue a la valencia

```python
repeat_penalty = clamp(1.15 - valence * 0.1, 1.0, 1.3)
```

| Valencia | Repeat Penalty | Efecto |
|----------|-----------------|--------|
| -1.0 (negativa) | 1.25 | Penalización fuerte, evita repeticiones |
| 0.0 (neutral) | 1.15 | Valor por defecto |
| +1.0 (positiva) | 1.05 | Penalización baja, permite repeticiones |

Cuanto más negativa es la conversación, más se empuja al modelo a evitar repetirse -- como alguien que busca sus palabras en una discusión tensa. Cuanto más positiva es la conversación, más puede el modelo permitirse afirmaciones redundantes, como en una charla relajada.

##### El estado emocional acumulativo

Estas puntuaciones no se aplican solo al mensaje inmediato. Un `EmotionState` mantiene una **media móvil exponencial** de valencia y activación por sesión:

```python
class EmotionState:
    def __init__(self, decay=0.85, deadzone=0.06):
        self.decay = decay
        self.deadzone = deadzone

    def update(self, key, valence_delta, arousal_delta):
        if abs(valence_delta) < self.deadzone:
            valence_delta = 0.0
        if abs(arousal_delta) < self.deadzone:
            arousal_delta = 0.0
        s = self._state.setdefault(key, {"valence": 0.0, "arousal": 0.0})
        s["valence"] = s["valence"] * self.decay + valence_delta * (1 - self.decay)
        s["arousal"] = s["arousal"] * self.decay + arousal_delta * (1 - self.decay)
        return s
```

El `decay` de 0.85 significa que el 85% del estado anterior se conserva en cada mensaje, y el 15% de la nueva señal se integra. Esto da una **memoria emocional** que suaviza las variaciones bruscas: un único mensaje negativo no pone "triste" al bot, pero una serie de mensajes negativos hace que su humor derive progresivamente.

En la práctica: si alguien empieza una conversación muy excitado (`arousal=+0.8`), la temperatura se mantiene alta durante varios intercambios, incluso si los mensajes siguientes son más calmados. La emoción tarda en bajar -- como un humano que sigue "acalorado" tras una discusión.

---

### Capa 4: la inferencia (Krystal)

Krystal es la capa más baja: un wrapper alrededor de `llama.cpp` que expone una API compatible con OpenAI (`/v1/chat/completions`). Corre en dos instancias de PM2:

- `krystal-small`: el modelo Luna 1.5B afinado, en el puerto 3124, con afinidad de CPU 0
- `krystal-large`: un modelo Hermes 3B, en el puerto 3125, con afinidad de CPU 0,1

Ambas instancias son procesos `llama-server` precompilados, lanzados con `taskset` para el pinning de CPU.

El fine-tune del modelo Luna también ha evolucionado desde el segundo artículo: ahora está entrenado con **200.000 muestras** (frente a las 50.000 anteriores), aún partiendo de Qwen2.5-1.5B-Instruct vía QLoRA. Las 200k muestras son un subconjunto del dataset Discord-Dialogues, filtradas para conservar solo las conversaciones más naturales y diversas. El objetivo: ampliar el registro estilístico del modelo sin perder la flexibilidad que hace que el few-shot priming sea tan eficaz.

---

## El esquema completo: un mensaje en tránsito

Esto es lo que ocurre concretamente cuando alguien envía "hoy estoy realmente triste" en Discord:

1. **Jade** recibe el mensaje vía la API Gateway de Discord. Lo transforma en un `MessageEvent` y lo envía a Emerald vía WebSocket.
2. **Emerald** evalúa el disparador (¿mención? ¿nombre? ¿palabra clave?). Es una mención directa. Calcula un retardo de concentración, verifica el cooldown, la sesión, la fatiga temática. Decide responder y envía el mensaje a Sapphire vía HTTP.
3. **Sapphire** embebe el mensaje con `bge-small-en-v1.5`.
   - Clasificación: el mensaje está más cerca del centroide `interesante` que del centroide `futil` (diff = +0.31) -> **INTERESANTE**
   - Emoción: valencia negativa (-0.42), activación moderada (0.35)
   - Enrutamiento: dirección `KRYSTAL_SEMANTIC_URL` (puerto 3125, modelo grande)
   - Parámetros de muestreo: temperatura = 0.80 (activación aumentada), repeat_penalty = 1.19 (valencia negativa)
   - El estado emocional de la sesión se actualiza con estos valores
4. **Krystal** (instancia grande) genera la respuesta con los parámetros ajustados emocionalmente y la devuelve a Sapphire.
5. **Sapphire** transmite la respuesta hacia Emerald con los metadatos (etiqueta, valencia, activación, estadísticas de depuración).
6. **Emerald** decide añadir una duda ("oh..."), planifica una ráfaga (2 fragmentos), y elige una reacción. Envía un `RespondCommand` a Jade.
7. **Jade** ejecuta: espera el retardo inicial, envía el primer fragmento con la duda, espera 1.5s, envía el segundo fragmento. Muestra el indicador de escritura durante toda la generación.

Todo esto en menos de 3 segundos para el usuario.

---

## Los centroides: por qué son mejores que un clasificador neuronal

La elección de centroides de embeddings frente a un clasificador tradicional (como el DistilBERT que usaba antes) merece una explicación.

Un clasificador neuronal aprende una frontera de decisión entre las clases -- típicamente una transformación no lineal que proyecta las entradas hacia probabilidades. Es preciso, pero:

- Necesita datos de entrenamiento etiquetados
- Es sensible al cambio de distribución (data drift)
- Es difícil de interpretar
- Debe reentrenarse para añadir una nueva clase

Un centroide, en cambio, es un **vector promedio** de embeddings de ejemplos. La clasificación se hace por similitud coseno con ese vector promedio. Ventajas:

- **Sin entrenamiento**: solo se calcula el promedio de embeddings de ejemplos elegidos a mano
- **Fácil de interpretar**: se puede ver qué ejemplos están más cerca del centroide para entender "qué ha aprendido el centroide"
- **Añadir una clase**: solo se añade un nuevo centroide -- sin reentrenamiento
- **Robusto**: el centroide es un promedio, así que los valores atípicos tienen poco impacto

El verdadero poder de los centroides es que convierten un problema de clasificación en un problema de **medición de distancia espacial**. Se pueden visualizar las categorías como regiones en un espacio de 384 dimensiones (o en 2D/3D tras una reducción dimensional PCA/t-SNE).

### Visualización 3D de los centroides

En la práctica, así es como se ven los centroides de clasificación en el espacio de embeddings. Cada punto es un mensaje de ejemplo, proyectado en 3D mediante PCA (las 384 dimensiones originales se reducen a 3 para la visualización). Los puntos azules son mensajes fútiles, los puntos amarillos son mensajes interesantes. Los dos grandes diamantes son los centroides calculados -- el promedio de cada grupo. Pase el ratón sobre un punto para ver el texto original del ejemplo.

<iframe src="assets/centroids-plot.html" style="width:100%;height:550px;border:none;border-radius:8px;" loading="lazy" title="Clasificación por centroides - vista 3D interactiva"></iframe>

Dos ejemplos se muestran en rojo: "lol" (clasificado como fútil) e "i feel sad today" (clasificado como interesante). "lol" cae en la nube azul de los fútiles, mientras que "i feel sad today" se sitúa del lado de los puntos amarillos. La separación es visible incluso tras una reducción a 3 dimensiones (solo el 15,6% de la varianza total explicada). En 384 dimensiones, la frontera es mucho más nítida.

El centroide del mensaje de entrada se mueve por este espacio en función de su contenido. La clasificación FÚTIL/INTERESANTE consiste simplemente en medir qué centroide está más cerca por similitud coseno. Así se puede representar cada mensaje como un punto en un espacio multidimensional, donde cada dimensión corresponde a una propiedad semántica.

---

## Lo que esto cambia en la práctica

Los usuarios no ven las capas, los centroides ni los ajustes de temperatura. Pero sienten los efectos:

- **Respuestas más rápidas** para mensajes simples (el modelo pequeño es 2 veces más rápido y gestiona el 70% del tráfico)
- **Tono adaptativo**: si estás molesto, el bot "siente" el enfado y adapta su estilo
- **Coherencia entre plataformas**: un bot de Matrix y un bot de Discord comparten el mismo cerebro y el mismo estado emocional
- **Sin "modo asistente"**: el fine-tune + few-shot + enrutamiento inteligente evita las respuestas corporativas

El paso a 200k muestras de entrenamiento para el modelo pequeño reforzó aún más estos efectos: el modelo captura mejor la diversidad de las conversaciones de Discord sin perder la maleabilidad que permite el few-shot priming.

---

## La infraestructura completa

Estos son los servicios que están corriendo actualmente:

| Servicio | Tecnología | Puerto(s) | Rol |
|----------|------------|-----------|-----|
| Pixieglow | TypeScript (Bun) | -- | Adaptador de Matrix |
| Jade | TypeScript (esbuild) | -- | Adaptador de Discord |
| Emerald | TypeScript (Bun) | 3126 (WebSocket) | Cerebro / decisiones |
| Sapphire | Python (FastAPI) | 3123 (HTTP) | Clasificador + emoción |
| Krystal small | llama.cpp (PM2) | 3124 | Modelo pequeño (1.5B, fútil) |
| Krystal large | llama.cpp (PM2) | 3125 | Modelo grande (3B+, interesante) |

Las dependencias entre servicios son unidireccionales: el adaptador depende de Emerald, Emerald depende de Sapphire, Sapphire depende de Krystal. Sin ciclos. Cada servicio puede reiniciarse de forma independiente.

---

## Conclusión

Dividir Luna Protocol en cuatro capas no fue solo un ejercicio de arquitectura. Fue una respuesta a limitaciones concretas: la imposibilidad de soportar Matrix, la falta de conciencia emocional, la ausencia de priorización inteligente de mensajes.

Hoy, el sistema es más robusto (un fallo del LLM no mata al bot), más extensible (un adaptador de Telegram o WhatsApp seguiría el mismo protocolo WebSocket), y más "vivo": el bot adapta su comportamiento, su tono, e incluso los parámetros del LLM al estado emocional percibido de la conversación.

Los centroides de embeddings son la pieza clave que hace posible todo esto sin complejidad excesiva: sin redes neuronales entrenadas, sin pipeline de datos etiquetados, solo promedios de vectores y similitudes coseno. Es una técnica simple, increíblemente eficaz, y terriblemente subestimada.

| Recurso | Enlace |
|---------|--------|
| Sitio web del proyecto | [protocol-luna.github.io](https://protocol-luna.github.io/) |
| Pixieglow | [protocol-luna/pixieglow](https://github.com/protocol-luna/pixieglow) |
| Emerald | [protocol-luna/emerald](https://github.com/protocol-luna/emerald) |
| Sapphire | [protocol-luna/sapphire](https://github.com/protocol-luna/sapphire) |
| Krystal | [protocol-luna/krystal](https://github.com/protocol-luna/krystal) |
| Artículo 1: el bot de Discord | [Luna Protocol: creé un bot de Discord autónomo](/articles/es/luna-protocol-discord-bot) |
| Artículo 2: el fine-tuning | [Luna Protocol: por qué afiné un modelo de 1,5B](/articles/es/luna-protocol-official-models) |