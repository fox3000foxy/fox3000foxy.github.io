---
title: "Laupok construyó una IA que juega Super Mario World sola -- cómo funciona"
description: "Un análisis profundo del proyecto de Laupok: una IA basada en NEAT que aprende a jugar Super Mario World de forma autónoma. Algoritmos genéticos, redes neuronales, neuroevolución de topologías crecientes y 4200 líneas de Lua."
date: 2026-07-11
tags:
  - inteligencia-artificial
  - lua
  - algoritmo-genetico
  - red-neuronal
  - neat
  - emulacion
  - ingenieria-inversa
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "70yCMxlZp65lOoVuNZ+QA7zw2jZRTMGk8BCPrchzD2lXTvXLviQaRpoQGfYpkvfak0QamVAKXfa1BhNXWD9xNw=="
---

# Laupok construyó una IA que juega Super Mario World sola -- cómo funciona

Laupok construyó una inteligencia artificial que juega **Super Mario World** completamente de forma autónoma. Sin entradas predefinidas, sin fotogramas grabados. La IA aprende por sí sola, a través de mutaciones aleatorias y selección natural, para superar los niveles del juego. El proyecto funciona en **BizHawk**, un emulador multiplataforma, mediante un script Lua de aproximadamente **4200 líneas**.

Lo que hace fascinante este proyecto es que se basa en conceptos biológicos aplicados a la informática: la **teoría de la evolución** de Darwin, las **redes neuronales artificiales** y, lo más importante, un algoritmo específico llamado **NEAT** (NeuroEvolution of Augmenting Topologies). La IA no sabe nada del juego al principio. Intenta cosas aleatorias, falla miles de veces y gradualmente descubre cómo moverse, saltar y sobrevivir.

En este artículo, lo explicaremos todo -- concepto por concepto, línea de código por línea de código.

![Laupok presenta el algoritmo NEAT en cámara](/images/laupok-mario-ai/neat-title.jpg)

---

## La configuración: BizHawk, Lua y Super Mario World

### El emulador BizHawk

BizHawk es un emulador de código abierto que admite muchas consolas -- NES, SNES, Genesis, PS1, Game Boy y muchas más. Su característica clave es que puede ejecutar **scripts Lua** junto con el juego. Estos scripts tienen acceso a la **RAM** (memoria de acceso aleatorio) de la emulación, lo que significa que pueden leer -- y modificar -- cualquier dato del juego en tiempo real.

Concretamente, esto significa que puedes:
- Leer la posición de Mario en el nivel
- Saber qué sprites (enemigos, objetos) hay en pantalla
- Conocer el estado de cada bloque alrededor de Mario
- Controlar el mando -- presionar cualquier botón

Esto es exactamente lo que necesitas para que una IA juegue.

### Direcciones de memoria de Super Mario World

En la RAM de Super Mario World, cada dato se almacena en una dirección específica. Es como un vecindario: cada dirección corresponde a una "casa" que contiene una pieza de información. Por ejemplo:

| Dirección | Dato |
|-----------|------|
| `0x94`-`0x95` | Posición X de Mario (16 bits, little-endian) |
| `0x96`-`0x97` | Posición Y de Mario |
| `0x14C8`+`i` | Estado del sprite `i` (>7 = vivo) |
| `0xE4`+`i` | Posición X baja del sprite `i` |
| `0x14E0`+`i` | Posición X alta del sprite `i` |
| `0xD8`+`i` | Posición Y baja del sprite `i` |
| `0x14D4`+`i` | Posición Y alta del sprite `i` |
| `0x170B`+`i` | Tipo del sprite extendido `i` |
| `0x0100` | Estado del juego (12 = nivel terminado) |
| `0x13D4` | Pausa activa |
| `0x0071` | Animación de muerte de Mario (9 = muerto) |
| `0x1C800`+... | Tabla de tiles del nivel |

Las posiciones de los sprites usan dos bytes: un byte "bajo" y un byte "alto", porque la posición puede superar los 255 píxeles. La fórmula siempre es `bajo + alto × 256`.

Para los tiles es más complejo: la dirección base es `0x1C800`, y calculas el desplazamiento basado en las coordenadas `x` e `y` del tile en el mundo, con un paso de 16 píxeles por tile.

![Super Mario World con una superposición de depuración que muestra las direcciones de memoria de los sprites y la posición de Mario](/images/laupok-mario-ai/memory-debug.jpg)

---

## Los fundamentos: algoritmos genéticos y redes neuronales

Antes de profundizar en el código, necesitas entender dos conceptos fundamentales. Sin ellos, nada más tiene sentido.

### Algoritmos genéticos

Un algoritmo genético es una simulación de la **teoría de la evolución**. La idea principal: creas una **población** de individuos, cada uno con características ligeramente diferentes ("genes"). Los dejas "vivir" en un entorno. Los que mejor lo hacen sobreviven y se reproducen. Los que lo hacen mal mueren.

Laupok ilustra esto con una analogía de **Kirby**:
- Una población de Kirbys aparece en un terreno con pinchos y tomates
- Los pinchos quitan puntos de vida, los tomates los restauran
- Cada Kirby tiene genes: tamaño, velocidad, puntos de vida, comportamiento (huir, buscar tomates, correr a ciegas)

![ADN de doble hélice con etiquetas "the baby", "size", "speed", "color" -- los genes que componen un individuo](/images/laupok-mario-ai/dna-genes.jpg)

- Después de 15 segundos, verificas quién sobrevivió más tiempo
- El mejor Kirby se cruza con los demás: los bebés heredan la mitad de los genes del mejor y la mitad de los del "peor"
- Los bebés sufren **mutaciones** aleatorias (un poco más grandes, un poco más rápidos...)
- Los Kirbys viejos son reemplazados por los nuevos
- Reinicias

Después de 180 generaciones (~15 horas), los Kirbys pasan de 15 segundos de supervivencia a **15 minutos**. Se volvieron pequeños (hitbox más pequeño), rápidos y huyen constantemente del peligro.

![Simulación de Kirby generación 0: círculos de colores dispersos aleatoriamente en un fondo negro, todos de tamaño similar](/images/laupok-mario-ai/kirby-gen0.jpg)

![Simulación de Kirby generación 1866: los Kirbys son más pequeños, más rápidos y huyen sistemáticamente del peligro](/images/laupok-mario-ai/kirby-gen1866.jpg)

![Estadísticas de la simulación de Kirby: fitness, puntos de vida, comportamiento de cada individuo clasificado por rendimiento](/images/laupok-mario-ai/kirby-stats.jpg)

El punto crucial: **no defines la solución**. El algoritmo **la encuentra por sí solo**. Y eso es exactamente lo que lo hace poderoso para problemas donde no sabes cuál sería la combinación óptima de parámetros.

### Redes neuronales artificiales

Una red neuronal es un modelo matemático simplificado del cerebro humano. Consiste en:
- **Neuronas de entrada**: lo que la red "ve"
- **Neuronas de salida**: lo que la red "decide"
- **Conexiones (pesos)**: cada conexión tiene un **peso** que amplifica o atenúa la señal

El principio es simple: cada neurona de entrada envía su valor. Se multiplica por el peso de la conexión, luego se suma a otras señales. Si el resultado supera cierto umbral (la **función de activación**), la neurona de salida se activa.

En la analogía de Laupok con Mario y el cursor del ratón:
- Neurona de entrada = distancia entre Mario y el cursor
- Peso de la conexión = sensibilidad de Mario
- Neurona de salida = Mario grita o no

Cuanto más cerca está el cursor, mayor es el valor de entrada. Si el peso es fuerte, la señal de salida es fuerte, y Mario gritaría. Al cambiar el peso, cambias la sensibilidad de Mario.

![La demo de "Mario está asustado": Mario enfrenta a un Boo con una barra de sinapsis que muestra el peso de la conexión entre entrada y salida](/images/laupok-mario-ai/mario-fear-demo.jpg)

En la red neuronal real de la IA, es la misma lógica, pero a escala masiva:
- **99 neuronas de entrada** (11×9 tiles de la vista de Mario)
- **8 neuronas de salida** (A, B, X, Y, Arriba, Abajo, Izquierda, Derecha)
- **Neuronas ocultas** entre ellas
- Cientos de conexiones con pesos variables

---

## NEAT: el algoritmo que lo cambia todo

### El problema con los algoritmos genéticos básicos

Si combinas ingenuamente un algoritmo genético con una red neuronal, tienes un problema: creas 100 redes neuronales completamente diferentes y no puedes compararlas. Cada una tiene sus propias neuronas, conexiones y pesos. ¿Cómo sabes si dos redes son "similares" o "diferentes"?

Aquí es donde entra **NEAT** -- NeuroEvolution of Augmenting Topologies. Inventado por **Kenneth Stanley** y **Risto Miikkulainen** en 2002, resuelve exactamente este problema.

### Especies

El primer mecanismo clave de NEAT son las **especies**. Cuando una red neuronal se vuelve demasiado diferente de otra, se clasifica en una especie diferente. La similitud se calcula mediante tres parámetros:

1. **Exceso** (`EXCES_COEF = 0.50`): el número de conexiones que no tienen nada en común entre dos redes (innovaciones diferentes)
2. **Disjuntas**: lo mismo, pero para conexiones en el medio
3. **Diferencia de pesos** (`POIDSDIFF_COEF = 0.92`): la diferencia promedio de pesos entre conexiones que comparten la misma innovación

La fórmula de puntuación:

```
puntuación = (EXCES_COEF × disjuntas) / max(nbConexiones1 + nbConexiones2, 1)
           + POIDSDIFF_COEF × diferenciaPesos
```

Si esta puntuación está por debajo de `DIFF_LIMITE` (1.0), las dos redes están en la misma especie. De lo contrario, se crea una nueva especie.

### Innovaciones

Esto es el genio de NEAT. Cada vez que se crea una conexión, recibe un número de **innovación** único y global. Este número sigue a la red neuronal incluso cuando se reproduce.

Concretamente, cuando se crea un bebé mediante crossover, hereda las innovaciones de sus padres. Si dos redes comparten la misma innovación, significa que tienen una conexión del mismo ancestro. Esto es lo que permite comparar redes de diferentes tamaños.

### Crossover

Cuando dos redes neuronales se reproducen, el **crossover** funciona así:

![Laupok explica el concepto de crossover con el texto "CROSSOVER" superpuesto](/images/laupok-mario-ai/crossover-label.jpg)

1. La red con mejor rendimiento se convierte en el "padre dominante"
2. El bebé hereda todas las conexiones del dominante
3. Para cada conexión que comparte la misma innovación, el otro padre puede reemplazarla (50% de probabilidad)
4. Solo las conexiones activas del padre no dominante pueden reemplazar

Esto garantiza que el bebé siempre sea al menos tan bueno como el mejor padre.

### Mutaciones

Después del crossover, el bebé sufre mutaciones con probabilidades configurables:

![Laupok explica las mutaciones con el texto "(small modif = mutation)" superpuesto](/images/laupok-mario-ai/mutation-label.jpg)

| Mutación | Probabilidad | Efecto |
|----------|-------------|--------|
| Reiniciar peso de conexión | 25% | El peso se aleatoriza completamente |
| Mutación de peso | 95% | El peso varía ±0.80 |
| Agregar conexión | 85% | Nueva conexión entre dos neuronas no enlazadas |
| Agregar neurona | 39% | Se inserta una neurona oculta entre dos neuronas conectadas |

La tasa de adición de neuronas es importante: es lo que permite que la red **crezca**. Al principio, solo hay entradas y salidas. Gradualmente, aparecen neuronas ocultas, haciendo la red cada vez más compleja.

---

## El código: recorrido completo

### Constantes

El script comienza con un bloque de constantes que definen todas las configuraciones:

```lua
-- Vista de Mario a su alrededor
TAILLE_TILE = 16
TAILLE_VUE_W = TAILLE_TILE * 11  -- 176 píxeles de ancho
TAILLE_VUE_H = TAILLE_TILE * 9   -- 144 píxeles de alto
NB_TILE_W = TAILLE_VUE_W / TAILLE_TILE  -- 11 tiles
NB_TILE_H = TAILLE_VUE_H / TAILLE_TILE  -- 9 tiles

-- Red neuronal
NB_INPUT = NB_TILE_W * NB_TILE_H  -- 99 entradas (tiles visibles)
NB_OUTPUT = 8  -- A, B, X, Y, Arriba, Abajo, Izquierda, Derecha
NB_INDIVIDU_POPULATION = 100  -- individuos por población
NB_NEURONE_MAX = 100000  -- máximo de neuronas ocultas

-- Fitness
FITNESS_LEVEL_FINI = 1000000  -- valor cuando se termina el nivel
NB_FRAME_RESET_BASE = 33  -- fotogramas sin progreso antes de reiniciar
NB_FRAME_RESET_PROGRES = 300  -- fotogramas si se detecta progreso

-- Especies
EXCES_COEF = 0.50
POIDSDIFF_COEF = 0.92
DIFF_LIMITE = 1.00

-- Mutaciones
CHANCE_MUTATION_RESET_CONNEXION = 0.25
POIDS_CONNEXION_MUTATION_AJOUT = 0.80
CHANCE_MUTATION_POIDS = 0.95
CHANCE_MUTATION_CONNEXION = 0.85
CHANCE_MUTATION_NEURONE = 0.39
```

`NB_INPUT` es 99 porque la vista de Mario es de 11×9 tiles. Cada tile es una neurona de entrada. Tile vacío = 0. Bloque = 1. Enemigo = -1.

Las 8 salidas corresponden a los botones del mando SNES: A, B, X, Y, Arriba, Abajo, Izquierda, Derecha. Start, Select, L y R están excluidos para que no "distragan" a Mario.

### Estructuras de datos

El script define tres estructuras principales:

```lua
function newNeurone()
    local neurone = {}
    neurone.valeur = 0    -- valor actual de la neurona
    neurone.id = 0        -- identificador único
    neurone.type = ""     -- "input", "output" o "hidden"
    return neurone
end

function newConnexion()
    local connexion = {}
    connexion.entree = 0     -- ID de la neurona fuente
    connexion.sortie = 0     -- ID de la neurona destino
    connexion.actif = true   -- se puede desactivar si se inserta una neurona oculta
    connexion.poids = 0      -- peso de la conexión
    connexion.innovation = 0 -- número de innovación único
    connexion.allume = false -- para visualización: true si pasa la señal
    return connexion
end

function newReseau()
    local reseau = {
        nbNeurone = 0,        -- número de neuronas ocultas
        fitness = 1,          -- rendimiento (distancia recorrida)
        idEspeceParent = 0,   -- a qué especie pertenece
        lesNeurones = {},     -- arreglo de neuronas
        lesConnexions = {}    -- arreglo de conexiones
    }
    -- Inicializar con entradas
    for j = 1, NB_INPUT, 1 do
        ajouterNeurone(reseau, j, "input", 1)
    end
    -- Luego salidas
    for j = NB_INPUT + 1, NB_INPUT + NB_OUTPUT, 1 do
        ajouterNeurone(reseau, j, "output", 0)
    end
    return reseau
end
```

Al principio, cada red solo tiene entradas y salidas. Sin neuronas ocultas, sin conexiones. El algoritmo decide si alguna es necesaria.

### Mutaciones en detalle

#### Mutación de peso

```lua
function mutationPoidsConnexions(unReseau)
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            if math.random() < CHANCE_MUTATION_RESET_CONNEXION then
                -- 25%: reinicio total del peso
                unReseau.lesConnexions[i].poids = genererPoids()
            else
                -- 75%: variación de ±0.80
                if math.random() >= 0.5 then
                    unReseau.lesConnexions[i].poids =
                        unReseau.lesConnexions[i].poids - POIDS_CONNEXION_MUTATION_AJOUT
                else
                    unReseau.lesConnexions[i].poids =
                        unReseau.lesConnexions[i].poids + POIDS_CONNEXION_MUTATION_AJOUT
                end
            end
        end
    end
end
```

El peso inicial siempre es 1 o -1 (`genererPoids()`). La variación de ±0.80 puede cambiarlo entre valores negativos y positivos, modificando radicalmente el comportamiento de la red.

#### Agregar una conexión

```lua
function mutationAjouterConnexion(unReseau)
    local liste = {}
    -- Mezclar la lista de neuronas
    for i, v in ipairs(unReseau.lesNeurones) do
        local pos = math.random(1, #liste+1)
        table.insert(liste, pos, v)
    end

    local traitement = false
    for i = 1, #liste, 1 do
        for j = 1, #liste, 1 do
            if i ~= j then
                local n1 = liste[i]
                local n2 = liste[j]
                -- Conexión válida: entrada→salida, oculta→oculta, oculta→salida
                if (n1.type == "input" and n2.type == "output") or
                   (n1.type == "hidden" and n2.type == "hidden") or
                   (n1.type == "hidden" and n2.type == "output") then
                    -- Verificar que no exista ya una conexión
                    local dejaConnexion = false
                    for k = 1, #unReseau.lesConnexions, 1 do
                        if unReseau.lesConnexions[k].entree == n1.id
                            and unReseau.lesConnexions[k].sortie == n2.id then
                            dejaConnexion = true
                            break
                        end
                    end
                    if dejaConnexion == false then
                        traitement = true
                        ajouterConnexion(unReseau, n1.id, n2.id)
                    end
                end
            end
            if traitement then break end
        end
        if traitement then break end
    end
end
```

No puedes conectar una salida con una entrada (eso crearía un ciclo), y no puedes conectar dos neuronas que ya están enlazadas. Mezclar garantiza que se exploren diferentes posibilidades cada vez.

#### Agregar una neurona

Esta es la mutación más interesante:

```lua
function mutationAjouterNeurone(unReseau)
    if #unReseau.lesConnexions == 0 then return nil end
    if unReseau.nbNeurone == NB_NEURONE_MAX then return nil end

    -- Mezclar conexiones
    local listeRandom = {}
    for i = 1, #unReseau.lesConnexions, 1 do
        local pos = math.random(1, #listeRandom+1)
        table.insert(listeRandom, pos, i)
    end

    for i = 1, #listeRandom, 1 do
        if unReseau.lesConnexions[listeRandom[i]].actif then
            -- Desactivar la conexión existente
            unReseau.lesConnexions[listeRandom[i]].actif = false
            unReseau.nbNeurone = unReseau.nbNeurone + 1
            local indice = unReseau.nbNeurone + NB_INPUT + NB_OUTPUT

            -- Crear la neurona oculta
            ajouterNeurone(unReseau, indice, "hidden", 1)

            -- Conectar entrada a la neurona oculta
            ajouterConnexion(unReseau,
                unReseau.lesConnexions[listeRandom[i]].entree,
                indice, genererPoids())

            -- Conectar neurona oculta a la salida
            ajouterConnexion(unReseau,
                indice,
                unReseau.lesConnexions[listeRandom[i]].sortie,
                genererPoids())
            break
        end
    end
end
```

El mecanismo: tomas una conexión existente, la **desactivas** e insertas una neurona oculta en el medio. La conexión original se reemplaza por dos nuevas: entrada→oculta y oculta→salida. Es como cortar un cable para empalmar un interruptor.

Esto es lo que hace que NEAT sea "augmenting topologies": la red **crece** con el tiempo. Comienza simple y se vuelve compleja solo cuando es necesario.

### El feedForward

Esta es la función que propaga las señales a través de la red:

```lua
function feedForward(unReseau)
    -- Reiniciar neuronas de salida
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur = 0
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].allume = false
        end
    end

    -- Propagación
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            local avantTraitement = unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur =
                unReseau.lesNeurones[unReseau.lesConnexions[i].entree].valeur *
                unReseau.lesConnexions[i].poids +
                unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur

            if avantTraitement ~= unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur then
                unReseau.lesConnexions[i].allume = true
            else
                unReseau.lesConnexions[i].allume = false
            end
        end
    end
end
```

Cada conexión activa envía `valor_entrada × peso` a la neurona de salida. El valor se **acumula** (se suma). La bandera `allume` es solo para la visualización visual de la red.

### Leyendo la memoria del juego

La función `getLesInputs()` traduce el mundo de Super Mario World en datos que la red puede entender:

```lua
function getLesInputs()
    local lesInputs = {}
    -- Inicializar a 0 (gris = nada)
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            lesInputs[getIndiceLesInputs(i, j)] = 0
        end
    end

    -- Sprites (enemigos) = -1 (negro)
    local lesSprites = getLesSprites()
    for i = 1, #lesSprites, 1 do
        local input = convertirPositionPourInput(getLesSprites()[i])
        if input.x > 0 and input.x < (TAILLE_VUE_W / TAILLE_TILE) + 1 then
            lesInputs[getIndiceLesInputs(input.x, input.y)] = -1
        end
    end

    -- Tiles (bloques) = valor del tile (blanco si > 0)
    local lesTiles = getLesTiles()
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            local indice = getIndiceLesInputs(i, j)
            if lesTiles[indice] ~= 0 then
                lesInputs[indice] = lesTiles[indice]
            end
        end
    end

    return lesInputs
end
```

La cuadrícula de entrada es una vista centrada en Mario: 11 tiles de ancho, 9 de alto. El valor de cada tile:
- **0** (gris): nada
- **1** (blanco): bloque sólido
- **-1** (negro): enemigo

Los enemigos se leen de dos listas en la RAM: sprites normales (`0x14C8`-`0x14F8`) y sprites extendidos (`0x170B`-`0x173B`). Para cada sprite vivo (estado > 7), se calcula su posición en tiles relativa a Mario y se coloca -1 en la celda correspondiente.

### Fitness: cómo la IA sabe que está progresando

```lua
function majReseau(unReseau, marioBase)
    local mario = getPositionMario()

    if not niveauFini and memory.readbyte(0x0100) == 12 then
        -- ¡Nivel terminado!
        unReseau.fitness = FITNESS_LEVEL_FINI
        niveauFini = true
    elseif marioBase.x < mario.x then
        -- Mario se movió a la derecha
        unReseau.fitness = unReseau.fitness + (mario.x - marioBase.x)
        marioBase.x = mario.x
    end

    -- Actualizar entradas
    local lesInputs = getLesInputs()
    for i = 1, NB_INPUT, 1 do
        unReseau.lesNeurones[i].valeur = lesInputs[i]
    end
end
```

El fitness es simple: es la **distancia recorrida hacia la derecha**. Si Mario se mueve 10 píxeles, el fitness aumenta en 10. Si Mario se mueve a la izquierda, no pasa nada (sin penalización). Si el nivel se termina (dirección `0x0100` == 12), el fitness se convierte en 1,000,000.

Es intencionalmente simple. Sin bonificación por matar enemigos, sin penalización por morir. Solo: muévete a la derecha.

### Reinicio inteligente

Si Mario no se mueve durante 33 fotogramas, el nivel se reinicia y pasamos al siguiente individuo. Pero si Mario hizo progreso (el fitness actual difiere del inicial), esperamos 300 fotogramas -- dando a la red la oportunidad de "entender" lo que hizo bien.

```lua
if fitnessAvant == laPopulation[idPopulation].fitness
   and memory.readbyte(0x13D4) == 0 then
    nbFrameStop = nbFrameStop + 1
    local nbFrameReset = NB_FRAME_RESET_BASE
    if fitnessInit ~= laPopulation[idPopulation].fitness
       and memory.readbyte(0x0071) ~= 9 then
        nbFrameReset = NB_FRAME_RESET_PROGRES
    end
    if nbFrameStop > nbFrameReset then
        nbFrameStop = 0
        lancerNiveau()
        idPopulation = idPopulation + 1
        -- ...
    end
end
```

La condición `memory.readbyte(0x0071) ~= 9` verifica que Mario no esté en su animación de muerte. No tiene sentido reiniciar si Mario ya está muerto.

### El bucle principal

El bucle se ejecuta a 30 fps (la velocidad normal de Super Mario World):

```lua
while true do
    local fitnessAvant = laPopulation[idPopulation].fitness

    -- Visualización (red, información)
    if forms.ischecked(estAccelere) then
        emu.limitframerate(false)  -- acelerar
    else
        emu.limitframerate(true)   -- 30 fps
    end

    -- Las 3 funciones vitales
    majReseau(laPopulation[idPopulation], marioBase)
    feedForward(laPopulation[idPopulation])
    appliquerLesBoutons(laPopulation[idPopulation])

    emu.frameadvance()
    nbFrame = nbFrame + 1

    -- Reiniciar si no hay progreso
    -- ...
    -- Nueva generación si se probaron todos los individuos
    -- ...
end
```

Las tres funciones vitales son `majReseau`, `feedForward` y `appliquerLesBoutons`. Desactiva cualquiera de ellas y Mario deja de moverse.

### Crossover

```lua
function crossover(unReseau1, unReseau2)
    local leReseau = newReseau()
    local leBon = unReseau1
    local leNul = unReseau2

    if leBon.fitness < leNul.fitness then
        leBon = unReseau2
        leNul = unReseau1
    end

    leReseau = copier(leBon)

    for i = 1, #leReseau.lesConnexions, 1 do
        for j = 1, #leNul.lesConnexions, 1 do
            if leReseau.lesConnexions[i].innovation == leNul.lesConnexions[j].innovation
               and leNul.lesConnexions[j].actif then
                if math.random() > 0.5 then
                    leReseau.lesConnexions[i] = leNul.lesConnexions[j]
                end
            end
        end
    end
    leReseau.fitness = 1
    return leReseau
end
```

El bebé hereda del mejor padre. Para cada conexión que comparte la misma innovación, el otro padre tiene un 50% de probabilidad de reemplazarla -- pero **solo si la conexión está activa**. Esta es una corrección importante: sin ella, se podrían crear neuronas ocultas inútiles.

### Selección de especies

```lua
function nouvelleGeneration(laPopulation, lesEspeces)
    local laNouvellePopulation = newPopulation()
    local nbIndividuACreer = NB_INDIVIDU_POPULATION

    -- Calcular fitness promedio por especie
    for i = 1, #lesEspeces, 1 do
        lesEspeces[i].fitnessMoyenne = 0
        for j = 1, #lesEspeces[i].lesReseaux, 1 do
            lesEspeces[i].fitnessMoyenne =
                lesEspeces[i].fitnessMoyenne + lesEspeces[i].lesReseaux[j].fitness
        end
        lesEspeces[i].fitnessMoyenne =
            lesEspeces[i].fitnessMoyenne / #lesEspeces[i].lesReseaux
    end

    -- Cada especie crea un número de hijos proporcional a su fitness promedio
    for i = 1, #lesEspeces, 1 do
        local nbEnfant = math.ceil(
            #lesEspeces[i].lesReseaux *
            lesEspeces[i].fitnessMoyenne / fitnessMoyenneGlobal)

        for j = 1, nbEnfant, 1 do
            local unReseau = crossover(
                choisirParent(lesEspeces[i].lesReseaux),
                choisirParent(lesEspeces[i].lesReseaux))
            mutation(unReseau)
            laNouvellePopulation[indiceNouvelleEspece] = copier(unReseau)
        end
    end
end
```

La idea: una especie con un fitness promedio de 10,000 puede crear muchos más hijos que una especie con un fitness promedio de 1. Esta es la **selección natural** en acción.

`choisirParent` usa selección por ruleta: cuanto mayor es el fitness de un individuo, más probabilidades tiene de ser seleccionado como padre.

### Guardar y cargar

Las poblaciones se guardan en archivos `.pop`:

```lua
function sauvegarderUnReseau(unReseau, fichier)
    io.write(unReseau.nbNeurone .. "\n")
    io.write(#unReseau.lesConnexions .. "\n")
    io.write(unReseau.fitness .. "\n")
    for i = 1, unReseau.nbNeurone, 1 do
        local indice = NB_INPUT + NB_OUTPUT + i
        io.write(unReseau.lesNeurones[indice].id .. "\n")
    end
    for i = 1, #unReseau.lesConnexions, 1 do
        local actif = 1
        if unReseau.lesConnexions[i].actif ~= true then actif = 0 end
        io.write(actif .. "\n" ..
            unReseau.lesConnexions[i].entree .. "\n" ..
            unReseau.lesConnexions[i].sortie .. "\n" ..
            unReseau.lesConnexions[i].poids .. "\n" ..
            unReseau.lesConnexions[i].innovation .. "\n")
    end
end
```

El guardado también incluye al mejor individuo de todas las poblaciones anteriores. Si el mejor de la población anterior es mejor que el nuevo, revertimos al anterior como base. Esta es una forma de **elitismo**: el mejor nunca se pierde.

### Visualización de la red

Laupok agregó un visualizador de redes neuronales superpuesto al juego:

```lua
function dessinerUnReseau(unReseau)
    -- Entradas: cuadrícula 11×9 alrededor de Mario
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            local xT = ENCRAGE_X_INPUT + (i - 1) * TAILLE_INPUT
            local yT = ENCRAGE_Y_INPUT + (j - 1) * TAILLE_INPUT
            local couleurFond = "gray"
            if unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur < 0 then
                couleurFond = "black"   -- enemigo
            elseif unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur > 0 then
                couleurFond = "white"   -- bloque
            end
            gui.drawRectangle(xT, yT, TAILLE_INPUT, TAILLE_INPUT, "black", couleurFond)
        end
    end

    -- Salidas: 8 botones
    for i = 1, NB_OUTPUT, 1 do
        local xT = ENCRAGE_X_OUTPUT
        local yT = ENCRAGE_Y_OUTPUT + ESPACE_Y_OUTPUT * (i - 1)
        if sigmoid(unReseau.lesNeurones[i + NB_INPUT].valeur) then
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "white")
        else
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "black")
        end
    end

    -- Conexiones
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            local alpha = 25
            if unReseau.lesConnexions[i].allume then alpha = 255 end
            local couleur = forms.createcolor(255, 255, 255, alpha)
            gui.drawLine(
                lesPositions[unReseau.lesConnexions[i].entree].x,
                lesPositions[lesConnexions[i].entree].y,
                lesPositions[unReseau.lesConnexions[i].sortie].x,
                lesPositions[lesConnexions[i].sortie].y,
                couleur)
        end
    end
end
```

Es increíblemente útil para entender lo que hace la red. Las conexiones activas son blancas, las inactivas son semitransparentes. Las entradas son una cuadrícula de celdas blancas/negras/grises. Las salidas muestran qué botones se presionan.

---

## Resultados

### Lo que la IA aprendió

Durante horas (y días) de ejecución, la IA descubrió por sí sola:

1. **Moverse a la derecha**: el comportamiento más básico, pero uno que requiere mantener presionado el botón Derecha
2. **Saltar sobre enemigos**: conectando una entrada de "enemigo detectado" al botón A o B
3. **Evitar obstáculos**: algunas redes aprendieron a retroceder temporalmente para avanzar más
4. **Terminar niveles**: el mejor individuo pudo completar el primer nivel de Super Mario World

![Mario controlado por la IA enfrentando a un Boo en un nivel de Super Mario World -- la red neuronal decide acciones en tiempo real](/images/laupok-mario-ai/mario-ai-playing.jpg)

### Limitaciones

El proyecto tiene sus limitaciones:

- **Nivel único**: la IA se entrena en un nivel específico. No se generaliza automáticamente a otros niveles
- **Tiempo de entrenamiento**: se necesitan decenas de horas para lograr resultados satisfactorios
- **Sin comprensión**: la IA no "entiende" lo que está haciendo. Optimiza una función de fitness (distancia recorrida) a través de mutaciones aleatorias
- **T-bagging**: Laupok señala que Mario tiende a saltar en el lugar al ver un enemigo, simplemente porque aumenta el fitness (avanza un poco mientras salta)

---

## Cómo reproducir el experimento

Laupok compartió todo. Aquí están los pasos:

1. **Descarga BizHawk** de [tasvideos.org](https://tasvideos.org/BizHawk) (sección de descargas)
2. **Consigue una ROM USA de Super Mario World** (copia privada de tu propio cartucho)
3. **Descarga el script Lua** de [Pastebin](https://pastebin.com/Jcvdqhqm) -- renómbralo a `mario.lua`
4. **Coloca el script en la misma carpeta que la ROM**
5. **Inicia BizHawk**, abre la ROM
6. **En la consola Lua**: `dofile("mario.lua")` o a través del menú Script > Open Script
7. **Guarda un estado** al inicio del nivel (menú Savestate > Save State) y nómbralo `debut.state`
8. **Relanza el script** -- funciona

El script incluye un formulario con opciones:
- **Acelerar**: desactiva el límite de 30 fps para ir más rápido
- **Mostrar red**: muestra la red neuronal superpuesta al juego
- **Mostrar información**: muestra un banner con generación, fitness y conteo de especies
- **Pausa**: pausa la ejecución
- **Guardar/Cargar**: persiste la población actual en un archivo `.pop`

---

## Fuentes y referencias

| Recurso | Enlace |
|---------|--------|
| Video principal de Laupok | [Construí una IA que juega Mario sola](https://www.youtube.com/watch?v=F63GNXGHVwM) |
| Revisión de código + video de configuración | [Cómo configurar la IA + revisión del código fuente](https://www.youtube.com/watch?v=u5xCl1bSe6o) |
| Código fuente completo | [Pastebin Jcvdqhqm](https://pastebin.com/Jcvdqhqm) |
| Paper original de NEAT | Stanley & Miikkulainen, "Evolving Neural Networks through Augmenting Topologies", 2002 |
| Tutorial de N8Programs | [Recorrido de implementación de NEAT](https://n8programs.github.io/) (JavaScript, pero los conceptos son idénticos) |
| 16blings (inspiración de Laupok) | [IA juega Super Mario World](https://www.youtube.com/watch?v=qv6IFaOz3bA) |
| BizHawk | [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) |
| Memoria de Super Mario World | [SMW Central - RAM Map](https://www.smwcentral.net/?p=section&a=details&id=21702) |

---

## Conclusión

Lo que Laupok hizo fue tomar un algoritmo académico (NEAT, 2002), reescribirlo en Lua para un emulador (BizHawk) y aplicarlo a Super Mario World. El resultado: una IA que aprende desde cero a jugar el juego, sin conocimientos previos, solo a través de mutaciones aleatorias y selección natural.

Es un hermoso ejemplo del poder de los algoritmos genéticos. Sin aprendizaje profundo, sin GPU, sin millones de datos de entrenamiento. Solo selección natural, algo de Lua y mucha paciencia.

El código está comentado, compartido, y Laupok hizo dos videos explicativos -- uno para los grandes conceptos, otro para el código. Si el tema te interesa, sumérgete. Es más accesible de lo que parece.
