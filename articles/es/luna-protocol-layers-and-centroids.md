---
title: "Luna Protocol: mutualización de cerebros, clasificación emocional, y ruteo interesante/fútil"
description: "Luna Protocol pasó de un monolito a una arquitectura en cuatro capas: adaptadores, brain, clasificador emocional, e inference. En el programa: centroids de embeddings, ruteo interesante/fútil, y ajuste de los parámetros del LLM por valencia y arousal."
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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "kLrob6B2cTMO1Glv3voqtqcWBnPspSt7ohBknKOZ3cbWPzi1hk8cXZl2iZ75V88uvIXBeyvYTiKcK2YJ4UNwkw=="
---

# Luna Protocol: mutualización de cerebros, clasificación emocional, y ruteo interesante/fútil

En los [dos](/articles/es/luna-protocol-discord-bot) [artículos](/articles/es/luna-protocol-official-models) anteriores, presenté Luna Protocol como un bot Discord único con un sistema conductual complejo y un modelo fine-tuneado. Pero la arquitectura evolucionó mucho desde entonces. Lo que era un monolito: un solo proceso Node.js que gestionaba a la vez el bot Discord, el comportamiento, y las llamadas LLM, se transformó en **cuatro capas independientes**, cada una con su propia responsabilidad, su propio lenguaje, y su propio ciclo de vida.

Esa separación aportó beneficios inesperados: la mutualización de los "cerebros" entre varias plataformas, un sistema de clasificación emocional que ajusta dinámicamente los parámetros del LLM, y un ruteo inteligente de los mensajes entre dos modelos según la importancia percibida de la conversación.

La evolución no se hizo de golpe: siguió un camino orgánico. Primero separé la carpeta `server/` del repo del bot, creando así **Krystal** por un lado y dejando **Jade** como adaptador Discord. Luego creé **Pixieglow** (adaptador Matrix) retomando el `llm-core` y el bus de eventos de Jade. Después vino **Sapphire** para introducir una clasificación GENERIC/SEMANTIC con DistilBERT. Los resultados no eran concluyentes, así que pasé por centroids de embeddings, más maleables para el enriquecimiento de ejemplos y más precisos; la clasificación se volvió FUTILE/INTERESSANT. Finalmente añadí centroids de **valencia** y **arousal** para regular la temperatura y el repeat penalty del LLM. Para terminar, quité todo el código redundante entre Jade y Pixieglow creando **Emerald**, el cerebro mutualizado, transformando Jade y Pixieglow en simples clientes socket-driven.

En paralelo, mantuve al día un sitio web que recorre el avance del proyecto: [protocol-luna.github.io](https://protocol-luna.github.io/).

Este artículo cuenta cómo y por qué troceé esas capas, qué hace exactamente cada servicio, y cómo conceptos como los **centroids** (vectores medios de embeddings) y las **variables de resentimiento** (inspiradas en el chatbot PARRY de los 70) transformaron un simple bot Discord en un sistema multiplataforma sorprendentemente coherente.

---

## El problema con el monolito

Al principio, Luna Protocol cabía en un solo proceso Node.js. El código gestionaba:

- La conexión a Discord (vía la librería Eris)
- La evaluación de los disparadores (menciones, palabras clave, follow-up...)
- La simulación de comportamientos humanos (erratas, vacilaciones, sueño...)
- Las llamadas HTTP al servidor LLM local (llama.cpp)
- La gestión de las sesiones y del antispam
- El pipeline TTS

Todo estaba en el mismo proceso, comunicando vía buses de eventos tipados (`TypedBus`). Funcionaba, pero con límites:

- **Imposible añadir un cliente Matrix** sin duplicar todo el código de comportamiento
- **El LLM y el bot estaban en el mismo repo**: la carpeta `server/` ya existía, pero imposible hacer evolucionar uno sin tocar el otro
- **Procesamiento indiferenciado**: cada mensaje se trataba igual, fuera un "lol" o una pregunta existencial
- **Amnesia emocional**: el bot no "sentía" nada

El troceado en capas resolvió todos esos problemas.

---

## Las cuatro capas

La arquitectura actual de Luna Protocol está organizada como un embudo de cuatro niveles:

```
Matrix / Discord
      |
      v
  [ADAPTATEURS]      Pixieglow (Matrix) / Jade (Discord)
      |
      v
  [BRAIN]            Emerald (WebSocket, port 3126)
      |
      v
  [CLASSIFIEUR]      Sapphire (HTTP, port 3123)
      |
      v
  [INFERENCE]        Krystal (llama.cpp, ports 3124 / 3125)
```

Cada capa puede reiniciarse, actualizarse, o reemplazarse independientemente.

---

### Capa 1: los adaptadores (Pixieglow y Jade)

Son las capas más simples. Su único trabajo es traducir los eventos de una plataforma de mensajería en un protocolo estandarizado hacia Emerald:

- **Jade** es el adaptador Discord. Usa la librería Eris para conectarse a Discord y reenviar los mensajes hacia Emerald vía WebSocket. También gestiona el pipeline TTS (síntesis vocal vía Piper, conversión a OGG, subida a Discord).
- **Pixieglow** es el adaptador Matrix. Usa la API HTTP Client-Server de Matrix directamente (sin SDK), con un long-poll sync. No tiene TTS.

Ambos adaptadores comparten el mismo protocolo WebSocket definido en `emerald-client.ts`:

```typescript
type ClientId = "jade" | "pixieglow";

// Eventos (adaptador -> Emerald)
type InEvent = MessageEvent | ReadyEvent | BotMessageEvent | PresenceEvent;

// Comandos (Emerald -> adaptador)
type OutCommand = RespondCommand | TypingCommand | SetPresenceCommand
                | SpontaneousCommand | ForgotCommand;
```

La existencia de dos adaptadores con la misma interfaz prueba la mutualización: **el mismo "cerebro" (Emerald) sirve indistintamente un bot Discord y un bot Matrix**, con comportamientos idénticos. El protocolo es declarativo: Emerald no dice al adaptador *cómo* enviar un mensaje, dice *qué* enviar (el texto con un retardo, eventualmente un plan de burst, una reacción, etc.). Cada adaptador implementa la ejecución concreta según su plataforma.

Esa es la fuerza de esta arquitectura: para añadir soporte de Telegram, Signal, u otro, basta escribir un adaptador que implemente el protocolo WebSocket.

---

### Capa 2: el cerebro (Emerald)

Emerald es el servicio central de decisión. Escucha en el puerto 3126 en WebSocket y gestiona:

- **La evaluación de los disparadores**: mención, DM, nombre, palabra clave, follow-up, aleatorio
- **La simulación conductual**: retardos de concentración, erratas, vacilaciones, olvidos, burst, fatiga temática
- **Los ciclos de sueño**: modos sleep / slow / short
- **La gestión de las sesiones**: cooldown, límites de sesión, antispam
- **El ruteo hacia Sapphire**: envío de los mensajes, recepción de las respuestas streameadas

Emerald es el servicio central que permitió la mutualización, y es el que más se benefició de la separación. Antes, cada comportamiento (typo, burst, hesitation) estaba entrelazado con el código Discord. Ahora, están en módulos dedicados en `behavior/`:

```
emerald/src/behavior/
  burst.ts         -- Planificación de los mensajes en ráfagas
  mannerisms.ts    -- Retardos, vacilaciones, reacciones, olvidos
  sleep.ts         -- Evaluación de los horarios de sueño
  typo.ts          -- Simulación de erratas (AZERTY/QWERTY)
```

El cerebro no sabe en qué plataforma corre. Recibe un `MessageEvent` con un `clientId` ("jade" o "pixieglow"), toma una decisión, y devuelve un comando. El adaptador se encarga del resto.

---

### Capa 3: el clasificador emocional (Sapphire)

Sapphire es el servicio más interesante en el plano técnico. Es un **middleware LLM** escrito en Python con FastAPI, que juega cuatro roles críticos:

1. **Clasificador binario FUTILE / INTERESSANT** vía centroids de embeddings
2. **Puntuador emocional** (valencia / arousal) vía centroids
3. **Ruteador de backends** hacia Krystal (modelo pequeño vs modelo grande)
4. **Inyector few-shot** y gestor de sesiones

#### Los centroids: el corazón de la clasificación

Un **centroid** es un concepto simple: es la media de un conjunto de vectores de embeddings. En concreto, reuní cientos de ejemplos de mensajes, los pasé por un modelo de embedding (`BAAI/bge-small-en-v1.5`, 384 dimensiones), y promedié los vectores obtenidos.

Hay **dos centroids de clasificación**:

- `futile_centroid`: ~683 mensajes triviales ("lol", "ok", "hello") vía k-means (k=10, seed=42)
- `interessant_centroid`: ~678 mensajes sustanciales (técnicos, personales, filosóficos) vía k-means (k=10, seed=42)

Cuando llega un mensaje:

```python
def classify(text, embedder, futile_centroids, interessant_centroids):
    emb = embedder.query_embed(text)                     # vector 384-D
    sim_f = max(cos(emb, c) for c in futile_centroids)     # max sobre 10
    sim_i = max(cos(emb, c) for c in interessant_centroids) # max sobre 10
    diff = sim_i - sim_f
    label = "INTERESSANT" if diff > 0 else "FUTILE"
    return label, abs(diff), sim_f, sim_i
```

La puntuación por clase es la **similitud coseno máxima** entre sus 10 centroids. Eso captura los subtipos en cada categoría: un saludo y una despedida caen ambos cerca de uno de los 10 centroids fútiles aunque estén lejos en el espacio de embedding. Solo k-means al arrancar y productos escalares en ejecución: sin entrenamiento, sin GPU.

#### ¿Por qué dos modelos?

El resultado de esa clasificación decide qué backend LLM se invoca:

| Label | Backend Krystal | Modelo | Puerto |
|-------|----------------|--------|------|
| `FUTILE` | `generic` | Luna-Protocol-1.5B (941 MB, Q4_K_M) | 3124 |
| `INTERESSANT` | `semantic` | Hermes-3-3B u 8B (según config) | 3125 |

La intuición es simple: un "lol" o un "nm just chillin u" no merece invocar un modelo de 8 mil millones de parámetros. El modelo pequeño fine-tuneado Luna 1.5B, entrenado sobre 200 000 muestras Discord, basta de sobra para los intercambios ligeros. En cambio, una pregunta sobre la vida, una confidencia, o un debate técnico se rutea hacia el modelo grande que puede producir una respuesta más rica.

Ese ruteo económico reduce considerablemente la carga sobre el servidor LLM: alrededor del 70% de los mensajes se clasifican FUTILE y los procesa el modelo pequeño, liberando el modelo grande para las conversaciones que de verdad valen la pena.

#### El eje emocional: valencia y arousal

Pero eso no es todo. Sapphire usa el **mismo mecanismo de centroids** sobre un eje independiente para evaluar la emoción del mensaje:

Hay **cuatro centroids emocionales**:

| Polo | Ejemplos |
|------|----------|
| `positive` | "hell yeah", "love that", "this is great" |
| `negative` | "shut up", "i hate this", "this sucks" |
| `high_arousal` | "WHAT THE HELL", "omg omg omg", "AAAAA" |
| `low_arousal` | "just chilling", "meh", "i guess" |

La puntuación se calcula como una diferencia de similitud en cada eje:

```python
valence = sim(emb, positive) - sim(emb, negative)     # [-1, +1]
arousal = sim(emb, high_arousal) - sim(emb, low_arousal)  # [-1, +1]
```

**Valencia** mide si el mensaje es positivo o negativo. **Arousal** mide su intensidad emocional. Juntos forman el modelo circumplex del afecto (Russell, 1980), el mismo modelo psicológico que inspiró el chatbot **PARRY** en 1972.

#### Las variables de resentimiento: cómo las emociones controlan el LLM

Ahí la inspiración de PARRY se vuelve tangible. PARRY (creado por Kenneth Colby en 1972) era un chatbot diseñado para simular un paciente paranoico. Tenía variables internas (miedo, ira, desconfianza) que modificaban sus respuestas. Por ejemplo, un PARRY "asustado" respondía de forma más agresiva.

Sapphire hace lo mismo, pero con variables continuas y un método más elegante: los parámetros de muestreo del LLM se ajustan en tiempo real según el estado emocional de la conversación.

##### La temperatura sigue el arousal

```python
temperature = clamp(0.7 + arousal * 0.3, 0.4, 1.0)
```

| Arousal | Temperatura | Efecto |
|---------|-------------|-------|
| -1.0 (tranquilo) | 0.40 | Baja creatividad, respuestas previsibles |
| 0.0 (neutro) | 0.70 | Creatividad por defecto |
| +1.0 (excitado) | 1.00 | Máximo de aleatoriedad, respuestas sorprendentes |

Cuando alguien está excitado o cabreado (arousal alto), la temperatura sube. El modelo produce respuestas más variadas, más creativas, a veces más caóticas, como un humano que "se embala". Cuando la conversación está tranquila, la temperatura baja, las respuestas son más pausadas.

##### El repeat penalty sigue la valencia

```python
repeat_penalty = clamp(1.15 - valence * 0.1, 1.0, 1.3)
```

| Valencia | Repeat Penalty | Efecto |
|---------|---------------|-------|
| -1.0 (negativo) | 1.25 | Fuerte penalización, evita las repeticiones |
| 0.0 (neutro) | 1.15 | Valor por defecto |
| +1.0 (positivo) | 1.05 | Débil penalización, permite las repeticiones |

Cuanto más negativa la conversación, más se empuja al modelo a evitar repetirse, como alguien que busca sus palabras en una discusión tensa. Cuanto más positiva la conversación, más el modelo puede permitirse afirmaciones redundantes, como una conversación relajada.

##### El estado emocional acumulativo

Esas puntuaciones no solo versan sobre el mensaje inmediato. Un `EmotionState` mantiene una **media exponencial móvil** de valencia y arousal por sesión:

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

El `decay` a 0.85 significa que el 85% del estado previo se conserva en cada mensaje, y el 15% de la nueva señal se integra. Eso da una **memoria emocional** que suaviza las variaciones brutales: un solo mensaje negativo no pone al bot "triste", pero una serie de mensajes negativos hace derivar progresivamente su humor.

En la práctica: si alguien empieza una conversación de forma muy excitada (`arousal=+0.8`), la temperatura queda alta durante varios intercambios, aunque los mensajes siguientes sean más tranquilos. La emoción tarda en bajar, como un humano que sigue "caliente" tras una discusión.

---

### Capa 4: la inferencia (Krystal)

Krystal es la capa más baja: un wrapper alrededor de `llama.cpp` que expone una API compatible OpenAI (`/v1/chat/completions`). Corre en dos instancias PM2:

- `krystal-small`: el modelo Luna 1.5B fine-tuneado, en el puerto 3124, con afinidad CPU 0
- `krystal-large`: un modelo Hermes 3B, en el puerto 3125, con afinidad CPU 0,1

Ambas instancias son procesos `llama-server` precompilados, lanzados con `taskset` para el pinning CPU.

El fine-tune del modelo Luna también evolucionó desde el segundo artículo: ahora está entrenado sobre **200 000 muestras** (contra 50 000 antes), siempre desde Qwen2.5-1.5B-Instruct vía QLoRA. Las 200k muestras son un subconjunto del dataset Discord-Dialogues, filtradas para guardar solo las conversaciones más naturales y diversas. El objetivo: ampliar el registro estilístico del modelo sin perder la flexibilidad que hace el few-shot priming tan eficaz.

---

## El esquema completo: un mensaje en tránsito

Esto es lo que pasa en concreto cuando alguien envía "je suis vraiment triste aujourd'hui" en Discord:

1. **Jade** recibe el mensaje vía la API Gateway Discord. Lo transforma en `MessageEvent` y lo envía a Emerald vía WebSocket.
2. **Emerald** evalúa el disparador (¿mención? ¿nombre? ¿palabra clave?). Es una mención directa. Calcula un retardo de concentración, comprueba el cooldown, la sesión, la fatiga temática. Decide responder y envía el mensaje a Sapphire vía HTTP.
3. **Sapphire** hace embed del mensaje con `bge-small-en-v1.5`.
   - Clasificación: el mensaje está más cerca del centroid `interessant` que del centroid `futile` (diff = +0.31) -> **INTERESSANT**
   - Emoción: valencia negativa (-0.42), arousal moderado (0.35)
   - Ruteo: dirección `KRYSTAL_SEMANTIC_URL` (puerto 3125, modelo grande)
   - Parámetros muestreo: temperatura = 0.80 (arousal aumentado), repeat_penalty = 1.19 (valencia negativa)
   - El estado emocional de la sesión se actualiza con esos valores
4. **Krystal** (instancia large) genera la respuesta con los parámetros ajustados emocionalmente y la devuelve a Sapphire.
5. **Sapphire** streamea la respuesta hacia Emerald con los metadatos (label, valencia, arousal, estadísticas de debug).
6. **Emerald** decide añadir una vacilación ("oh..."), planifica un burst (2 fragmentos), y elige una reacción. Envía una `RespondCommand` a Jade.
7. **Jade** ejecuta: espera el retardo inicial, envía el primer fragmento con la vacilación, espera 1.5s, envía el segundo fragmento. Muestra el indicador de escritura durante toda la generación.

Todo eso en menos de 3 segundos para el usuario.

---

## Los centroids: por qué es mejor que un clasificador neuronal

La elección de los centroids de embeddings en vez de un clasificador tradicional (como el DistilBERT que usaba antes) merece una explicación.

Un clasificador neuronal aprende una frontera de decisión entre las clases, típicamente una transformación no lineal que proyecta las entradas hacia probabilidades. Es preciso, pero:

- Necesita datos de entrenamiento etiquetados
- Es sensible al cambio de distribución (data drift)
- Es difícil de interpretar
- Hay que reentrenarlo para añadir una nueva clase

Un centroid, en cambio, es un **vector medio** de embeddings de ejemplos. La clasificación se hace por similitud coseno a ese vector medio. Ventajas:

- **Ningún entrenamiento requerido**: solo calculamos la media de embeddings de ejemplos elegidos a mano
- **Fácil de interpretar**: podemos mirar qué ejemplos están más cerca del centroid para entender "lo que el centroid aprendió"
- **Añadir una clase**: solo añadimos un nuevo centroid, sin reentrenamiento
- **Robusto**: el centroid es una media, así que los outliers tienen poco impacto

El verdadero poder de los centroids es que transforman un problema de clasificación en un problema de **medida de distancia espacial**. Podemos visualizar las categorías como regiones en un espacio de 384 dimensiones (o en 2D/3D tras reducción dimensional PCA/t-SNE).

### Visualización 3D de los centroids

En la práctica, así se ven los centroids de clasificación en el espacio de embedding. Cada punto es un mensaje de ejemplo, proyectado en 3D por PCA (las 384 dimensiones originales se reducen a 3 para la visualización). Los puntos azules son los mensajes fútiles, los puntos amarillos los mensajes interesantes. Los **20 marcadores en diamante** son los centroids k-means (10 por clase, seed=42). Pasa el ratón sobre un punto para ver el texto original del ejemplo.

<iframe src="assets/centroids-plot.html" style="width:100%;height:550px;border:none;border-radius:8px;" loading="lazy" title="Classification par centroïdes - vue 3D interactive"></iframe>

Dos ejemplos de test se muestran en rojo: "lol" (clasificado fútil) e "i feel sad today" (clasificado interesante). Incluso tras reducción de 384 a 3 dimensiones (14,7% de varianza explicada), ambos clusters quedan claramente separados. La anotación arriba muestra los conteos exactos y la zona ambigua.

El centroid del mensaje de entrada se pasea en ese espacio según su contenido. La clasificación FUTILE/INTERESSANT consiste simplemente en medir qué centroid está más cerca por similitud coseno. Así podemos representar cada mensaje como un punto en un espacio de múltiples dimensiones, cada dimensión correspondiendo a una propiedad semántica.

---

## Lo que cambia en la práctica

Los usuarios no ven las capas, los centroids, ni los ajustes de temperatura. Pero sienten los efectos:

- **Respuestas más rápidas** para los mensajes simples (el modelo pequeño es 2x más rápido y gestiona el 70% del tráfico)
- **Tono adaptativo**: si estás cabreado, el bot "siente" el cabreo y adapta su estilo
- **Coherencia cross-plataforma**: un bot Matrix y un bot Discord comparten el mismo cerebro y el mismo estado emocional
- **Tono auténtico preservado**: el fine-tune + few-shot + ruteo inteligente evita las respuestas corporate

El paso a 200k muestras de entrenamiento para el modelo pequeño reforzó aún esos efectos: el modelo captura mejor la diversidad de las conversaciones Discord sin perder la maleabilidad que permite el few-shot priming.

---

## La infraestructura completa

Aquí los servicios que corren actualmente:

| Servicio | Tecnología | Puerto(s) | Rol |
|---------|------------|---------|------|
| Pixieglow | TypeScript (Bun) | -- | Adaptador Matrix |
| Jade | TypeScript (esbuild) | -- | Adaptador Discord |
| Emerald | TypeScript (Bun) | 3126 (WebSocket) | Cerebro / decisiones |
| Sapphire | Python (FastAPI) | 3123 (HTTP) | Clasificador + emoción |
| Krystal small | llama.cpp (PM2) | 3124 | Modelo pequeño (1.5B, futile) |
| Krystal large | llama.cpp (PM2) | 3125 | Modelo grande (3B+, interessant) |

Las dependencias entre servicios son unidireccionales: el adaptador depende de Emerald, Emerald depende de Sapphire, Sapphire depende de Krystal. El grafo sigue acíclico. Cada servicio puede reiniciarse independientemente.

---

## Conclusión

Dividir Luna Protocol en cuatro capas no fue solo un ejercicio de arquitectura. Era una respuesta a limitaciones concretas: imposibilidad de soportar Matrix, falta de conciencia emocional, ausencia de priorización inteligente de los mensajes.

Hoy, el sistema es más robusto (un crash del LLM no mata el bot), más extensible (un adaptador Telegram o WhatsApp seguiría el mismo protocolo WebSocket), y más "vivo": el bot adapta su comportamiento, su tono, e incluso los parámetros del LLM al estado emocional percibido de la conversación.

Los centroids de embeddings son el elemento clave que hace todo eso posible sin complejidad desmedida: sin red neuronal entrenada, sin pipeline de datos etiquetados, solo medias de vectores y similitudes coseno. Es una técnica simple, increíblemente eficaz, y terriblemente subestimada.

| Recurso | Enlace |
|----------|------|
| Sitio web del proyecto | [protocol-luna.github.io](https://protocol-luna.github.io/) |
| Pixieglow | [protocol-luna/pixieglow](https://github.com/protocol-luna/pixieglow) |
| Emerald | [protocol-luna/emerald](https://github.com/protocol-luna/emerald) |
| Sapphire | [protocol-luna/sapphire](https://github.com/protocol-luna/sapphire) |
| Krystal | [protocol-luna/krystal](https://github.com/protocol-luna/krystal) |
| Artículo 1: el bot Discord | [Luna Protocol: creé un bot Discord autónomo](/articles/es/luna-protocol-discord-bot) |
| Artículo 2: el fine-tuning | [Luna Protocol: por qué fine-tuneé un modelo de 1,5B](/articles/es/luna-protocol-official-models) |
