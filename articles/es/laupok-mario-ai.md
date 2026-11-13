---
title: "Laupok creó una IA que juega sola a Super Mario World: cómo funciona"

date: 2026-07-11
tags:
  - ai
  - lua
  - emulation
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "XF936Fm7ZJeoboeeOBG4gBR+ss9BHpXXrrdhtJrS2AlyJy3bxZJmT4DhnrVovlFPy4CVM1SL9BzGYRQZnCAjKQ=="
---

# Laupok creó una IA que juega sola a Super Mario World: cómo funciona

Laupok creó una inteligencia artificial que juega a **Super Mario World** de forma totalmente autónoma. Parte de cero: ningún script predefinido, ningún frame grabado. La IA aprende sola, a base de mutaciones aleatorias y selección natural, a terminar los niveles del juego. El proyecto corre sobre **BizHawk**, un emulador multiplataforma, vía un script Lua de unas **4200 líneas**.

Lo que hace fascinante ese proyecto es que se apoya en conceptos biológicos aplicados a la informática: la **teoría de la evolución de Darwin**, las **redes de neuronas artificiales**, y sobre todo un algoritmo específico llamado **NEAT** (NeuroEvolution of Augmenting Topologies). La IA no sabe nada del juego al principio. Prueba acciones al azar, falla miles de veces, y poco a poco entiende cómo avanzar, saltar, y sobrevivir.

En este artículo, vamos a diseccionar todo eso: concepto por concepto, línea de código por línea de código.

![Laupok introduce el algoritmo NEAT ante la cámara](/images/laupok-mario-ai/neat-title.jpg)

---

## El setup: BizHawk, Lua, y Super Mario World

### El emulador BizHawk

BizHawk es un emulador open source que soporta un montón de consolas: NES, SNES, Genesis, PS1, Game Boy, y muchas más. Su particularidad es que permite lanzar **scripts Lua** en paralelo al juego. Esos scripts tienen acceso a la **memoria viva** (RAM) de la emulación, lo que significa que pueden leer, y modificar, cualquier dato del juego en tiempo real.

En concreto, eso significa que podemos:
- Leer la posición de Mario en el nivel
- Saber qué sprites (enemigos, items) hay en pantalla
- Conocer el estado de cada tile (bloque) alrededor de Mario
- Controlar el mando: pulsar cualquier botón

Es justo lo que hace falta para que juegue una IA.

### Las direcciones de memoria de Super Mario World

En la RAM de Super Mario World, cada dato se guarda en una dirección específica. Es un poco como un barrio: cada dirección corresponde a una "casa" que contiene una información. Por ejemplo:

| Dirección | Dato |
|---------|--------|
| `0x94`-`0x95` | Posición X de Mario (16 bits, little-endian) |
| `0x96`-`0x97` | Posición Y de Mario |
| `0x14C8`+`i` | Estado del sprite `i` (>7 = vivo) |
| `0xE4`+`i` | Posición X baja del sprite `i` |
| `0x14E0`+`i` | Posición X alta del sprite `i` |
| `0xD8`+`i` | Posición Y baja del sprite `i` |
| `0x14D4`+`i` | Posición Y alta del sprite `i` |
| `0x170B`+`i` | Tipo del extended sprite `i` |
| `0x0100` | Estado del juego (12 = nivel terminado) |
| `0x13D4` | Pausa activa |
| `0x0071` | Animación de muerte de Mario (9 = muerto) |
| `0x1C800`+... | Tabla de los tiles del nivel |

La posición de los sprites usa dos bytes: un byte "bajo" y un byte "alto", porque la posición puede superar 255 píxeles. La fórmula siempre es `bajo + alto × 256`.

Para los tiles, es más complejo: la dirección base es `0x1C800`, y se calcula el offset según las coordenadas `x` e `y` del tile en el mundo, con un paso de 16 píxeles por tile.

![Super Mario World con overlay de depuración mostrando las direcciones de memoria de los sprites y la posición de Mario](/images/laupok-mario-ai/memory-debug.jpg)

---

## Las bases: algoritmos genéticos y redes de neuronas

Antes de zambullirnos en el código, hay que entender dos conceptos fundamentales. Sin ellos, el resto no tiene sentido.

### Los algoritmos genéticos

Un algoritmo genético es una simulación de la **teoría de la evolución**. La idea central: se crea una **población** de individuos, cada uno con características (unos "genes") ligeramente distintas. Se los hace "vivir" en un entorno. Los que mejor se adaptan sobreviven y se reproducen. Los que peor se adaptan desaparecen.

Laupok lo ilustra con una analogía de **Kirby**:
- Una población de Kirby aparece en un terreno con pinchos y tomates
- Los pinchos quitan puntos de vida, los tomates los devuelven
- Cada Kirby tiene genes: tamaño, velocidad, puntos de vida, comportamiento (huir, buscar tomates, correr a cualquier sitio)

![Doble hélice de ADN con las etiquetas "el bebé", "tamaño", "velocidad", "color": los genes que componen un individuo](/images/laupok-mario-ai/dna-genes.jpg)

- Tras 15 segundos, miramos quién sobrevivió más tiempo
- El mejor Kirby se reproduce con los demás: los bebés heredan la mitad de los genes del mejor y la mitad del "peor"
- Los bebés sufren **mutaciones** aleatorias (un poco más grande, un poco más rápido...)
- Los viejos Kirby se reemplazan por los nuevos
- Se relanza

Tras 180 generaciones (~15 horas), los Kirby pasan de 15 segundos de supervivencia a **15 minutos**. Se volvieron pequeños (zona de colisión reducida), rápidos, y huyen del peligro permanentemente.

![Simulación Kirby generación 0: círculos coloreados dispersos aleatoriamente sobre un fondo negro, todos de tamaño similar](/images/laupok-mario-ai/kirby-gen0.jpg)

![Simulación Kirby generación 1866: los Kirby son más pequeños, más rápidos, y huyen sistemáticamente de los peligros](/images/laupok-mario-ai/kirby-gen1866.jpg)

![Estadísticas de la simulación Kirby: fitness, número de puntos de vida, comportamiento de cada individuo clasificados por rendimiento](/images/laupok-mario-ai/kirby-stats.jpg)

El punto crucial: **no definimos la solución**. El algoritmo la **encuentra solo**. Y eso es justo lo que lo hace potente para problemas donde no sabemos qué combinación de parámetros sería óptima.

### Las redes de neuronas artificiales

Una red de neuronas es un modelo matemático simplificado del cerebro humano. Se compone de:
- **Neuronas de entrada** (inputs): lo que la red "ve"
- **Neuronas de salida** (outputs): lo que la red "decide"
- **Conexiones** (pesos): cada conexión tiene un **peso** que amplifica o atenúa la señal

El principio es simple: cada neurona de entrada envía su valor. Se multiplica por el peso de la conexión, y luego se suma a las demás señales. Si el resultado supera cierto umbral (la **función de activación**), la neurona de salida se activa.

En la analogía de Laupok con Mario y el trozo de queso:
- La neurona de entrada = la distancia entre Mario y el trozo
- El peso de la conexión = la sensibilidad de Mario
- La neurona de salida = Mario grita o no

Cuanto más cerca el trozo, más alto el valor de entrada. Si el peso es fuerte, la señal enviada en salida es fuerte, y Mario gritaría. Modificando el peso, se modifica la sensibilidad de Mario.

![Demo "Mario tiene miedo": Mario frente a un Boo con una barra de sinapsis mostrando el peso de la conexión entre la entrada y la salida](/images/laupok-mario-ai/mario-fear-demo.jpg)

En la verdadera red de neuronas de la IA, es la misma lógica, pero a escala masiva:
- **99 neuronas de entrada** (11×9 tiles de la vista de Mario)
- **8 neuronas de salida** (A, B, X, Y, Arriba, Abajo, Izquierda, Derecha)
- **Neuronas ocultas** (hidden) entre medias
- Cientos de conexiones con pesos variados

---

## NEAT: el algoritmo que lo cambia todo

### El problema de los algoritmos genéticos clásicos

Si combinamos un algoritmo genético con una red de neuronas de forma ingenua, tenemos un problema: creamos 100 redes de neuronas por completo distintas, y no sabemos compararlas. Cada una tiene sus propias neuronas, sus propias conexiones, sus propios pesos. ¿Cómo saber si dos redes están "cerca" o "lejos"?

Ahí interviene **NEAT**: NeuroEvolution of Augmenting Topologies. Inventado por **Kenneth Stanley** y **Risto Miikkulainen** en 2002, es un algoritmo que resuelve justo ese problema.

### Las especies

El primer mecanismo clave de NEAT son las **especies**. Cuando una red de neuronas se vuelve demasiado distinta de otra, se clasifica en una especie distinta. La similitud se calcula vía tres parámetros:

1. **Excess** (`EXCES_COEF = 0.50`): el número de conexiones que no tienen relación entre dos redes (innovaciones distintas)
2. **Disjoint**: igual, pero para las conexiones que se sitúan en medio
3. **Weight difference** (`POIDSDIFF_COEF = 0.92`): la diferencia de peso media entre las conexiones que comparten la misma innovación

La fórmula de puntuación:

```
score = (EXCES_COEF × disjoint) / max(nbConnexions1 + nbConnexions2, 1)
      + POIDSDIFF_COEF × diffPoids
```

Si esa puntuación es inferior a `DIFF_LIMITE` (1.0), ambas redes están en la misma especie. Si no, se crea una especie nueva.

### Las innovaciones

Esa es la genialidad de NEAT. Cada vez que se crea una conexión, recibe un número de **innovación** único y global. Ese número sigue a la red de neuronas incluso cuando se reproduce.

En concreto, cuando un bebé se crea por crossover, hereda las innovaciones de sus padres. Si dos redes comparten la misma innovación, significa que tienen una conexión que viene del mismo ancestro. Eso permite comparar redes de tamaños distintos.

### El crossover

Cuando dos redes de neuronas se reproducen, el **crossover** funciona así:

![Laupok explica el concepto de crossover con el texto "CROSSOVER" en overlay](/images/laupok-mario-ai/crossover-label.jpg)

1. La red más rendidora se vuelve el "padre dominante"
2. El bebé hereda todas las conexiones del dominante
3. Para cada conexión que comparte la misma innovación, el otro padre puede reemplazarla (50% de probabilidad)
4. Solo las conexiones activas del padre no dominante pueden reemplazar

Eso garantiza que el bebé siempre sea al menos tan bueno como el mejor padre.

### Las mutaciones

Tras el crossover, el bebé sufre mutaciones con probabilidades configurables:

![Laupok explica las mutaciones con el texto "(pequeña modif = mutación)" en overlay](/images/laupok-mario-ai/mutation-label.jpg)

| Mutación | Probabilidad | Efecto |
|----------|------------|-------|
| Reset peso conexión | 25% | El peso se aleatoriza totalmente |
| Mutación peso | 95% | El peso varía ±0.80 |
| Añadir conexión | 85% | Nueva conexión entre dos neuronas aún no ligadas |
| Añadir neurona | 39% | Una neurona oculta se inserta entre dos neuronas conectadas |

La tasa de añadir neurona es importante: es lo que permite a la red **crecer**. Al principio, solo hay entradas y salidas. Progresivamente, aparecen neuronas ocultas, haciendo la red cada vez más compleja.

---

## El código: repaso completo

### Las constantes

El script empieza con un bloque de constantes que definen todo el parametrizado:

```lua
-- Vista de Mario a su alrededor
TAILLE_TILE = 16
TAILLE_VUE_W = TAILLE_TILE * 11  -- 176 píxeles en anchura
TAILLE_VUE_H = TAILLE_TILE * 9   -- 144 píxeles en altura
NB_TILE_W = TAILLE_VUE_W / TAILLE_TILE  -- 11 tiles
NB_TILE_H = TAILLE_VUE_H / TAILLE_TILE  -- 9 tiles

-- Red de neuronas
NB_INPUT = NB_TILE_W * NB_TILE_H  -- 99 inputs (tiles visibles)
NB_OUTPUT = 8  -- A, B, X, Y, Haut, Bas, Gauche, Droite
NB_INDIVIDU_POPULATION = 100  -- individuos por población
NB_NEURONE_MAX = 100000  -- límite de neuronas ocultas

-- Fitness
FITNESS_LEVEL_FINI = 1000000  -- valor cuando el nivel se termina
NB_FRAME_RESET_BASE = 33  -- frames sin progreso antes de reset
NB_FRAME_RESET_PROGRES = 300  -- frames si hay progreso detectado

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

El `NB_INPUT` es 99 porque la vista de Mario es 11×9 tiles. Cada tile es una neurona de entrada. Si el tile está vacío, vale 0. Si es un bloque, vale 1. Si es un enemigo, vale -1.

Las 8 salidas corresponden a los botones del mando SNES: A, B, X, Y, Arriba, Abajo, Izquierda, Derecha. Excluimos Start, Select, L y R para limitar sus decisiones a lo esencial.

### Las estructuras de datos

El script define tres estructuras principales:

```lua
function newNeurone()
    local neurone = {}
    neurone.valeur = 0    -- valor actual de la neurona
    neurone.id = 0        -- identificador único
    neurone.type = ""     -- "input", "output", o "hidden"
    return neurone
end

function newConnexion()
    local connexion = {}
    connexion.entree = 0     -- ID de la neurona fuente
    connexion.sortie = 0     -- ID de la neurona destino
    connexion.actif = true   -- puede desactivarse si se inserta una neurona oculta
    connexion.poids = 0      -- peso de la conexión
    connexion.innovation = 0 -- número de innovación único
    connexion.allume = false -- para la visualización: true si la señal pasa
    return connexion
end

function newReseau()
    local reseau = {
        nbNeurone = 0,        -- número de neuronas ocultas
        fitness = 1,          -- rendimiento (distancia recorrida)
        idEspeceParent = 0,   -- a qué especie pertenece
        lesNeurones = {},     -- tabla de neuronas
        lesConnexions = {}    -- tabla de conexiones
    }
    -- Inicialización con los inputs
    for j = 1, NB_INPUT, 1 do
        ajouterNeurone(reseau, j, "input", 1)
    end
    -- Luego los outputs
    for j = NB_INPUT + 1, NB_INPUT + NB_OUTPUT, 1 do
        ajouterNeurone(reseau, j, "output", 0)
    end
    return reseau
end
```

Al principio, cada red solo contiene inputs y outputs: ninguna neurona oculta, ninguna conexión. Es el algoritmo el que decidirá si hacen falta.

### Las mutaciones en detalle

#### Mutación de los pesos

```lua
function mutationPoidsConnexions(unReseau)
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            if math.random() < CHANCE_MUTATION_RESET_CONNEXION then
                -- 25% : reset total del peso
                unReseau.lesConnexions[i].poids = genererPoids()
            else
                -- 75% : variación de ±0.80
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

El peso inicial siempre es 1 o -1 (`genererPoids()`). La variación de ±0.80 puede hacerlo oscilar entre valores negativos y positivos, lo que cambia radicalmente el comportamiento de la red.

#### Añadir conexión

```lua
function mutationAjouterConnexion(unReseau)
    local liste = {}
    -- Aleatorización de la lista de neuronas
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
                -- Conexión válida : input→output, hidden→hidden, hidden→output
                if (n1.type == "input" and n2.type == "output") or
                   (n1.type == "hidden" and n2.type == "hidden") or
                   (n1.type == "hidden" and n2.type == "output") then
                    -- Comprobar que no haya ya una conexión
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

No se puede conectar un output a un input (crearía un ciclo), y no se pueden conectar dos neuronas ya ligadas. La aleatorización garantiza que exploramos distintas posibilidades cada vez.

#### Añadir neurona

Es la mutación más interesante:

```lua
function mutationAjouterNeurone(unReseau)
    if #unReseau.lesConnexions == 0 then return nil end
    if unReseau.nbNeurone == NB_NEURONE_MAX then return nil end

    -- Aleatorización de las conexiones
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

            -- Conectar la entrada a la neurona oculta
            ajouterConnexion(unReseau,
                unReseau.lesConnexions[listeRandom[i]].entree,
                indice, genererPoids())

            -- Conectar la neurona oculta a la salida
            ajouterConnexion(unReseau,
                indice,
                unReseau.lesConnexions[listeRandom[i]].sortie,
                genererPoids())
            break
        end
    end
end
```

El mecanismo: cogemos una conexión existente, la **desactivamos**, e insertamos una neurona oculta en medio. La conexión de origen se reemplaza por dos nuevas conexiones: entrada→oculta y oculta→salida. Es como si "cortáramos" un cable para intercalar un interruptor.

Eso hace NEAT "augmenting topologies": la red **crece** con el tiempo. Empieza simple y solo se vuelve compleja si hace falta.

### El feedForward

Es la función que propaga las señales a través de la red:

```lua
function feedForward(unReseau)
    -- Reset de las neuronas de salida
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

Cada conexión activa envía `valor_entrada × peso` hacia la neurona de salida. El valor se **acumula** (suma). La bandera `allume` es solo para la visualización del red.

### La lectura de la memoria del juego

La función `getLesInputs()` es la que traduce el mundo de Super Mario World en datos comprensibles para la red:

```lua
function getLesInputs()
    local lesInputs = {}
    -- Inicialización a 0 (gris = nada)
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            lesInputs[getIndiceLesInputs(i, j)] = 0
        end
    end

    -- Los sprites (enemigos) = -1 (negro)
    local lesSprites = getLesSprites()
    for i = 1, #lesSprites, 1 do
        local input = convertirPositionPourInput(getLesSprites()[i])
        if input.x > 0 and input.x < (TAILLE_VUE_W / TAILLE_TILE) + 1 then
            lesInputs[getIndiceLesInputs(input.x, input.y)] = -1
        end
    end

    -- Los tiles (bloques) = valor del tile (blanco si > 0)
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

La parrilla de inputs es una vista centrada en Mario: 11 tiles en anchura, 9 en altura. Cada tile vale:
- **0** (gris): nada
- **1** (blanco): bloque sólido
- **-1** (negro): enemigo

Los enemigos se leen desde dos listas en la RAM: los sprites normales (`0x14C8`-`0x14F8`) y los extended sprites (`0x170B`-`0x173B`). Para cada sprite vivo (estado > 7), calculamos su posición en tiles respecto a Mario y ponemos -1 en la casilla correspondiente.

### El fitness: cómo la IA sabe si progresa

```lua
function majReseau(unReseau, marioBase)
    local mario = getPositionMario()

    if not niveauFini and memory.readbyte(0x0100) == 12 then
        -- ¡Nivel terminado!
        unReseau.fitness = FITNESS_LEVEL_FINI
        niveauFini = true
    elseif marioBase.x < mario.x then
        -- Mario avanza hacia la derecha
        unReseau.fitness = unReseau.fitness + (mario.x - marioBase.x)
        marioBase.x = mario.x
    end

    -- Actualización de los inputs
    local lesInputs = getLesInputs()
    for i = 1, NB_INPUT, 1 do
        unReseau.lesNeurones[i].valeur = lesInputs[i]
    end
end
```

El fitness es simple: es la **distancia recorrida hacia la derecha**. Si Mario avanza 10 píxeles, el fitness sube 10. Si Mario retrocede, no pasa nada (sin penalización). Si el nivel se termina (dirección `0x0100` == 12), el fitness se vuelve 1 000 000.

Es intencionadamente simple. Solo la progresión hacia la derecha cuenta: matar enemigos no aporta nada, morir no cuesta nada.

### El reset inteligente

Si Mario no se mueve durante 33 frames, reseteamos el nivel y pasamos al siguiente individuo. Pero si Mario progresó (su fitness actual es distinto del inicial), esperamos 300 frames: eso da una oportunidad a la red de "entender" lo que hizo bien.

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

La condición `memory.readbyte(0x0071) ~= 9` comprueba que Mario no esté en animación de muerte. El reset se vuelve inútil cuando Mario ya está en animación de muerte.

### El bucle principal

El bucle gira a 30 fps (la velocidad normal de Super Mario World):

```lua
while true do
    local fitnessAvant = laPopulation[idPopulation].fitness

    -- Visualización (red, infos)
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

    -- Reset si no hay progreso
    -- ...
    -- Nueva generación si todos los individuos probados
    -- ...
end
```

Las tres funciones vitales son `majReseau`, `feedForward`, y `appliquerLesBoutons`. Si desactivamos una sola, Mario ya no se mueve.

### El crossover

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

El bebé hereda del mejor padre. Para cada conexión que comparte la misma innovación, el otro padre tiene 50% de probabilidad de reemplazarla, pero **solo si la conexión está activa**. Es un correctivo importante: sin eso, podían crearse neuronas ocultas inútiles.

### La selección por especies

```lua
function nouvelleGeneration(laPopulation, lesEspeces)
    local laNouvellePopulation = newPopulation()
    local nbIndividuACreer = NB_INDIVIDU_POPULATION

    -- Cálculo fitness medio por especie
    for i = 1, #lesEspeces, 1 do
        lesEspeces[i].fitnessMoyenne = 0
        for j = 1, #lesEspeces[i].lesReseaux, 1 do
            lesEspeces[i].fitnessMoyenne =
                lesEspeces[i].fitnessMoyenne + lesEspeces[i].lesReseaux[j].fitness
        end
        lesEspeces[i].fitnessMoyenne =
            lesEspeces[i].fitnessMoyenne / #lesEspeces[i].lesReseaux
    end

    -- Cada especie crea un número de hijos proporcional a su fitness medio
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

La idea: una especie con un fitness medio de 10 000 tiene derecho a crear muchos más hijos que una especie con un fitness medio de 1. Es la **selección natural** en acción.

El `choisirParent` usa una selección por ruleta: cuanto más fitness un individuo, más probabilidad de ser seleccionado como padre.

### El guardado y la carga

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

El guardado incluye también el mejor individuo de todas las poblaciones previas. Si el mejor de la población vieja es mejor que el mejor de la nueva, retomamos el viejo como base. Es una forma de **elitismo**: nunca perdemos el mejor.

### El dibujo de la red

Laupok añadió un visualizador de la red de neuronas en overlay del juego:

```lua
function dessinerUnReseau(unReseau)
    -- Inputs : parrilla 11×9 alrededor de Mario
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

    -- Outputs : 8 botones
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

Es superútil para entender qué hace la red. Las conexiones activas son blancas, las inactivas semitransparentes. Los inputs son una parrilla de casillas blancas/negras/grises. Los outputs muestran qué botones están pulsados.

---

## Los resultados

### Lo que la IA aprendió

Con las horas (y los días) de ejecución, la IA descubrió por sí sola:

1. **Avanzar hacia la derecha**: el comportamiento más básico, pero que necesita mantener el botón Derecha pulsado
2. **Saltar sobre los enemigos**: conectando un input "enemigo detectado" al botón A o B
3. **Evitar los obstáculos**: algunas redes aprendieron a retroceder temporalmente para avanzar mejor
4. **Terminar niveles**: el mejor individuo pudo terminar el primer nivel de Super Mario World

![Mario controlado por la IA frente a un Boo en un nivel de Super Mario World: la red de neuronas decide las acciones en tiempo real](/images/laupok-mario-ai/mario-ai-playing.jpg)

### Las limitaciones

El proyecto tiene sus límites:

- **Un solo nivel**: la IA se entrena en un solo nivel específico. No generaliza automáticamente a otros niveles
- **Tiempo de entrenamiento**: hacen falta decenas de horas para alcanzar resultados satisfactorios
- **Sin comprensión**: la IA no "entiende" lo que hace. Optimiza una función de fitness (distancia recorrida) vía mutaciones aleatorias
- **T-bagging**: Laupok nota que Mario tiende a saltar en el sitio cuando ve un enemigo, simplemente porque eso aumenta el fitness (avanza un poco saltando)

---

## Cómo reproducir el experimento

Laupok lo compartió todo. Aquí los pasos:

1. **Descargar BizHawk** en [tasvideos.org](https://tasvideos.org/BizHawk) (sección Download)
2. **Obtener una ROM USA de Super Mario World** (copia privada de tu propio cartucho)
3. **Descargar el script Lua** desde [Pastebin](https://pastebin.com/Jcvdqhqm): renombrar a `mario.lua`
4. **Colocar el script en la misma carpeta que la ROM**
5. **Lanzar BizHawk**, abrir la ROM
6. **En la consola Lua**: `dofile("mario.lua")` o vía el menú Script > Open Script
7. **Guardar un state** al inicio del nivel (menú Savestate > Save State) y llamarlo `debut.state`
8. **Relanzar el script**: funciona

El script incluye un formulario con opciones:
- **Acelerar**: desactiva el límite de 30 fps para ir más rápido
- **Mostrar red**: muestra la red de neuronas en overlay
- **Mostrar infos**: muestra una banda con la generación, el fitness, el número de especies
- **Pausa**: pausa la ejecución
- **Guardar/Cargar**: persiste la población actual en un archivo `.pop`

---

## Fuentes y referencias

| Recurso | Enlace |
|-----------|------|
| Vídeo principal de Laupok | [j'ai créé une IA qui joue à mario toute seule](https://www.youtube.com/watch?v=F63GNXGHVwM) |
| Vídeo code review + setup | [comment setup l'ia + code source review](https://www.youtube.com/watch?v=u5xCl1bSe6o) |
| Código fuente completo | [Pastebin Jcvdqhqm](https://pastebin.com/Jcvdqhqm) |
| Artículo original de NEAT | Stanley & Miikkulainen, "Evolving Neural Networks through Augmenting Topologies", 2002 |
| Tutorial de N8Programs | [NEAT implementation walkthrough](https://n8programs.github.io/) (JavaScript, pero los conceptos son idénticos) |
| 16blings (inspiración de Laupok) | [AI plays Super Mario World](https://www.youtube.com/watch?v=qv6IFaOz3bA) |
| BizHawk | [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) |
| Memoria de Super Mario World | [SMW Central - RAM Map](https://www.smwcentral.net/?p=section&a=details&id=21702) |

---

## Conclusión

Lo que hizo Laupok es coger un algoritmo académico (NEAT, 2002), reescribirlo en Lua para un emulador (BizHawk), y aplicarlo a Super Mario World. El resultado: una IA que aprende desde cero a jugar al juego, sin ningún conocimiento previo, solo por mutaciones aleatorias y selección natural.

Es un ejemplo magnífico de la potencia de los algoritmos genéticos. La receta cabe en tres ingredientes: la selección natural, un poco de Lua, y mucha paciencia. Ningún deep learning, ningún GPU, ningún dato de entrenamiento masivo.

El código está comentado, compartido, y Laupok hizo dos vídeos explicativos: uno para los grandes conceptos, otro para el código. Si el tema te interesa, sumérgete. Es más accesible de lo que parece.
