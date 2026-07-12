---
itle: "Laupok built an AI that plays Super Mario World by itself -- how it works"
date: 2026-07-11authors:
  - fox3000foxy
tags:
  - ai
  - lua
  - emulation
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "KzpLZDBVsB9jDicAIir/rer6GZqgNutdQfr2+5jOH7aYmdIyYSvbKqPEVpF+/h0lBNUgOV0ropXGehnIWshD/Q=="
---

# Laupok built an AI that plays Super Mario World by itself -- how it works

Laupok built an artificial intelligence that plays **Super Mario World** completely autonomously. No pre-scripted inputs, no recorded frames. The AI learns on its own, through random mutations and natural selection, to finish the game's levels. The project runs on **BizHawk**, a multi-platform emulator, via a Lua script of about **4200 lines**.

What makes this project fascinating is that it relies on biological concepts applied to computing: Darwin's **theory of evolution**, **artificial neural networks**, and most importantly a specific algorithm called **NEAT** (NeuroEvolution of Augmenting Topologies). The AI knows nothing about the game at first. It tries random things, fails thousands of times, and gradually figures out how to move, jump, and survive.

In this article, we'll break it all down -- concept by concept, line of code by line of code.

![Laupok introduces the NEAT algorithm on camera](/images/laupok-mario-ai/neat-title.jpg)

---

## The setup: BizHawk, Lua, and Super Mario World

### The BizHawk emulator

BizHawk is an open-source emulator that supports a ton of consoles -- NES, SNES, Genesis, PS1, Game Boy, and many more. Its key feature is that it can run **Lua scripts** alongside the game. These scripts have access to the emulation's **RAM** (random access memory), meaning they can read -- and modify -- any game data in real time.

Concretely, this means you can:
- Read Mario's position in the level
- Know which sprites (enemies, items) are on screen
- Know the state of every tile (block) around Mario
- Control the controller -- press any button

This is exactly what you need to make an AI play.

### Super Mario World's memory addresses

In Super Mario World's RAM, every piece of data is stored at a specific address. It's like a neighborhood: each address corresponds to a "house" containing one piece of information. For example:

| Address | Data |
|---------|------|
| `0x94`-`0x95` | Mario's X position (16-bit, little-endian) |
| `0x96`-`0x97` | Mario's Y position |
| `0x14C8`+`i` | Sprite `i` state (>7 = alive) |
| `0xE4`+`i` | Sprite `i` low X position |
| `0x14E0`+`i` | Sprite `i` high X position |
| `0xD8`+`i` | Sprite `i` low Y position |
| `0x14D4`+`i` | Sprite `i` high Y position |
| `0x170B`+`i` | Extended sprite `i` type |
| `0x0100` | Game state (12 = level finished) |
| `0x13D4` | Pause active |
| `0x0071` | Mario's death animation (9 = dead) |
| `0x1C800`+... | Level tile table |

Sprite positions use two bytes: a "low" byte and a "high" byte, because the position can exceed 255 pixels. The formula is always `low + high × 256`.

For tiles it's more complex: the base address is `0x1C800`, and you calculate the offset based on the tile's `x` and `y` coordinates in the world, with a step of 16 pixels per tile.

![Super Mario World with a debug overlay showing sprite memory addresses and Mario's position](/images/laupok-mario-ai/memory-debug.jpg)

---

## The basics: genetic algorithms and neural networks

Before diving into the code, you need to understand two fundamental concepts. Without them, nothing else makes sense.

### Genetic algorithms

A genetic algorithm is a simulation of the **theory of evolution**. The core idea: you create a **population** of individuals, each with slightly different characteristics ("genes"). You let them "live" in an environment. Those who do best survive and reproduce. Those who do poorly die out.

Laupok illustrates this with a **Kirby** analogy:
- A population of Kirbys appears on a terrain with spikes and tomatoes
- Spikes remove hit points, tomatoes restore them
- Each Kirby has genes: size, speed, HP, behavior (flee, seek tomatoes, run blindly)

![DNA double helix with labels "the baby", "size", "speed", "color" -- the genes that make up an individual](/images/laupok-mario-ai/dna-genes.jpg)

- After 15 seconds, you check who survived the longest
- The best Kirby breeds with the others: babies inherit half the best's genes and half the "worst's"
- Babies undergo random **mutations** (a bit bigger, a bit faster...)
- Old Kirbys are replaced by the new ones
- You restart

After 180 generations (~15 hours), Kirbys go from 15 seconds of survival to **15 minutes**. They became tiny (smaller hitbox), fast, and constantly flee danger.

![Kirby simulation generation 0: colorful circles randomly scattered on a black background, all similar in size](/images/laupok-mario-ai/kirby-gen0.jpg)

![Kirby simulation generation 1866: Kirbys are smaller, faster, and systematically flee from danger](/images/laupok-mario-ai/kirby-gen1866.jpg)

![Kirby simulation statistics: fitness, HP, behavior of each individual ranked by performance](/images/laupok-mario-ai/kirby-stats.jpg)

The crucial point: **you don't define the solution**. The algorithm **finds it on its own**. And that's exactly what makes it powerful for problems where you don't know what the optimal parameter combination would be.

### Artificial neural networks

A neural network is a simplified mathematical model of the human brain. It consists of:
- **Input neurons**: what the network "sees"
- **Output neurons**: what the network "decides"
- **Connections (weights)**: each connection has a **weight** that amplifies or dampens the signal

The principle is simple: each input neuron sends its value. It's multiplied by the connection weight, then added to other signals. If the result exceeds a certain threshold (the **activation function**), the output neuron fires.

In Laupok's analogy with Mario and the mouse cursor:
- Input neuron = distance between Mario and the cursor
- Connection weight = Mario's sensitivity
- Output neuron = Mario screams or not

The closer the cursor, the higher the input value. If the weight is strong, the output signal is strong, and Mario would scream. By changing the weight, you change Mario's sensitivity.

![The "Mario is scared" demo: Mario faces a Boo with a synapse bar showing the connection weight between input and output](/images/laupok-mario-ai/mario-fear-demo.jpg)

In the actual AI's neural network, it's the same logic, but on a massive scale:
- **99 input neurons** (11×9 tiles of Mario's view)
- **8 output neurons** (A, B, X, Y, Up, Down, Left, Right)
- **Hidden neurons** between them
- Hundreds of connections with varying weights

---

## NEAT: the algorithm that changes everything

### The problem with basic genetic algorithms

If you naively combine a genetic algorithm with a neural network, you have a problem: you create 100 completely different neural networks, and you can't compare them. Each has its own neurons, connections, and weights. How do you know if two networks are "similar" or "different"?

This is where **NEAT** comes in -- NeuroEvolution of Augmenting Topologies. Invented by **Kenneth Stanley** and **Risto Miikkulainen** in 2002, it solves exactly this problem.

### Species

NEAT's first key mechanism is **species**. When a neural network becomes too different from another, it's classified into a different species. Similarity is calculated via three parameters:

1. **Excess** (`EXCES_COEF = 0.50`): the number of connections that have nothing in common between two networks (different innovations)
2. **Disjoint**: same, but for connections in the middle
3. **Weight difference** (`POIDSDIFF_COEF = 0.92`): the average weight difference between connections sharing the same innovation

The score formula:

```
score = (EXCES_COEF × disjoint) / max(nbConnexions1 + nbConnexions2, 1)
      + POIDSDIFF_COEF × diffPoids
```

If this score is below `DIFF_LIMITE` (1.0), the two networks are in the same species. Otherwise, a new species is created.

### Innovations

This is NEAT's genius. Every time a connection is created, it receives a unique, global **innovation** number. This number follows the neural network even when it reproduces.

Concretely, when a baby is created via crossover, it inherits the innovations of its parents. If two networks share the same innovation, it means they have a connection from the same ancestor. This is what allows comparing networks of different sizes.

### Crossover

When two neural networks reproduce, **crossover** works like this:

![Laupok explains the crossover concept with the text "CROSSOVER" overlaid](/images/laupok-mario-ai/crossover-label.jpg)

1. The better-performing network becomes the "dominant parent"
2. The baby inherits all connections from the dominant
3. For each connection sharing the same innovation, the other parent can replace it (50% chance)
4. Only active connections from the non-dominant parent can replace

This guarantees the baby is always at least as good as the best parent.

### Mutations

After crossover, the baby undergoes mutations with configurable probabilities:

![Laupok explains mutations with the text "(small modif = mutation)" overlaid](/images/laupok-mario-ai/mutation-label.jpg)

| Mutation | Probability | Effect |
|----------|------------|--------|
| Reset connection weight | 25% | Weight is completely randomized |
| Weight mutation | 95% | Weight varies by ±0.80 |
| Add connection | 85% | New connection between two unlinked neurons |
| Add neuron | 39% | A hidden neuron is inserted between two connected neurons |

The neuron addition rate is important: it's what allows the network to **grow**. At first, there are only inputs and outputs. Gradually, hidden neurons appear, making the network more and more complex.

---

## The code: full walkthrough

### Constants

The script starts with a block of constants that define all the settings:

```lua
-- Mario's view around him
TAILLE_TILE = 16
TAILLE_VUE_W = TAILLE_TILE * 11  -- 176 pixels wide
TAILLE_VUE_H = TAILLE_TILE * 9   -- 144 pixels tall
NB_TILE_W = TAILLE_VUE_W / TAILLE_TILE  -- 11 tiles
NB_TILE_H = TAILLE_VUE_H / TAILLE_TILE  -- 9 tiles

-- Neural network
NB_INPUT = NB_TILE_W * NB_TILE_H  -- 99 inputs (visible tiles)
NB_OUTPUT = 8  -- A, B, X, Y, Up, Down, Left, Right
NB_INDIVIDU_POPULATION = 100  -- individuals per population
NB_NEURONE_MAX = 100000  -- max hidden neurons

-- Fitness
FITNESS_LEVEL_FINI = 1000000  -- value when level is finished
NB_FRAME_RESET_BASE = 33  -- frames without progress before reset
NB_FRAME_RESET_PROGRES = 300  -- frames if progress detected

-- Species
EXCES_COEF = 0.50
POIDSDIFF_COEF = 0.92
DIFF_LIMITE = 1.00

-- Mutations
CHANCE_MUTATION_RESET_CONNEXION = 0.25
POIDS_CONNEXION_MUTATION_AJOUT = 0.80
CHANCE_MUTATION_POIDS = 0.95
CHANCE_MUTATION_CONNEXION = 0.85
CHANCE_MUTATION_NEURONE = 0.39
```

`NB_INPUT` is 99 because Mario's view is 11×9 tiles. Each tile is an input neuron. Empty tile = 0. Block = 1. Enemy = -1.

The 8 outputs correspond to SNES controller buttons: A, B, X, Y, Up, Down, Left, Right. Start, Select, L and R are excluded so they don't "distract" Mario.

### Data structures

The script defines three main structures:

```lua
function newNeurone()
    local neurone = {}
    neurone.valeur = 0    -- current neuron value
    neurone.id = 0        -- unique identifier
    neurone.type = ""     -- "input", "output", or "hidden"
    return neurone
end

function newConnexion()
    local connexion = {}
    connexion.entree = 0     -- source neuron ID
    connexion.sortie = 0     -- destination neuron ID
    connexion.actif = true   -- can be disabled if a hidden neuron is inserted
    connexion.poids = 0      -- connection weight
    connexion.innovation = 0 -- unique innovation number
    connexion.allume = false -- for display: true if signal passes
    return connexion
end

function newReseau()
    local reseau = {
        nbNeurone = 0,        -- number of hidden neurons
        fitness = 1,          -- performance (distance traveled)
        idEspeceParent = 0,   -- which species it belongs to
        lesNeurones = {},     -- neuron array
        lesConnexions = {}    -- connection array
    }
    -- Initialize with inputs
    for j = 1, NB_INPUT, 1 do
        ajouterNeurone(reseau, j, "input", 1)
    end
    -- Then outputs
    for j = NB_INPUT + 1, NB_INPUT + NB_OUTPUT, 1 do
        ajouterNeurone(reseau, j, "output", 0)
    end
    return reseau
end
```

At first, each network has only inputs and outputs. No hidden neurons, no connections. The algorithm decides if any are needed.

### Mutations in detail

#### Weight mutation

```lua
function mutationPoidsConnexions(unReseau)
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            if math.random() < CHANCE_MUTATION_RESET_CONNEXION then
                -- 25%: total weight reset
                unReseau.lesConnexions[i].poids = genererPoids()
            else
                -- 75%: variation of ±0.80
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

The initial weight is always 1 or -1 (`genererPoids()`). The ±0.80 variation can swing it between negative and positive values, radically changing the network's behavior.

#### Adding a connection

```lua
function mutationAjouterConnexion(unReseau)
    local liste = {}
    -- Shuffle the neuron list
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
                -- Valid connection: input→output, hidden→hidden, hidden→output
                if (n1.type == "input" and n2.type == "output") or
                   (n1.type == "hidden" and n2.type == "hidden") or
                   (n1.type == "hidden" and n2.type == "output") then
                    -- Check no connection already exists
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

You can't connect an output to an input (that would create a cycle), and you can't connect two neurons that are already linked. Shuffling guarantees different possibilities are explored each time.

#### Adding a neuron

This is the most interesting mutation:

```lua
function mutationAjouterNeurone(unReseau)
    if #unReseau.lesConnexions == 0 then return nil end
    if unReseau.nbNeurone == NB_NEURONE_MAX then return nil end

    -- Shuffle connections
    local listeRandom = {}
    for i = 1, #unReseau.lesConnexions, 1 do
        local pos = math.random(1, #listeRandom+1)
        table.insert(listeRandom, pos, i)
    end

    for i = 1, #listeRandom, 1 do
        if unReseau.lesConnexions[listeRandom[i]].actif then
            -- Disable the existing connection
            unReseau.lesConnexions[listeRandom[i]].actif = false
            unReseau.nbNeurone = unReseau.nbNeurone + 1
            local indice = unReseau.nbNeurone + NB_INPUT + NB_OUTPUT

            -- Create the hidden neuron
            ajouterNeurone(unReseau, indice, "hidden", 1)

            -- Connect input to hidden neuron
            ajouterConnexion(unReseau,
                unReseau.lesConnexions[listeRandom[i]].entree,
                indice, genererPoids())

            -- Connect hidden neuron to output
            ajouterConnexion(unReseau,
                indice,
                unReseau.lesConnexions[listeRandom[i]].sortie,
                genererPoids())
            break
        end
    end
end
```

The mechanism: you take an existing connection, **disable it**, and insert a hidden neuron in the middle. The original connection is replaced by two new ones: input→hidden and hidden→output. It's like cutting a wire to splice in a switch.

This is what makes NEAT "augmenting topologies": the network **grows** over time. It starts simple and becomes complex only when necessary.

### The feedForward

This is the function that propagates signals through the network:

```lua
function feedForward(unReseau)
    -- Reset output neurons
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur = 0
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].allume = false
        end
    end

    -- Propagation
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

Each active connection sends `input_value × weight` to the output neuron. The value is **accumulated** (added). The `allume` flag is just for visual network display.

### Reading the game's memory

The `getLesInputs()` function translates Super Mario World's world into data the network can understand:

```lua
function getLesInputs()
    local lesInputs = {}
    -- Initialize to 0 (gray = nothing)
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            lesInputs[getIndiceLesInputs(i, j)] = 0
        end
    end

    -- Sprites (enemies) = -1 (black)
    local lesSprites = getLesSprites()
    for i = 1, #lesSprites, 1 do
        local input = convertirPositionPourInput(getLesSprites()[i])
        if input.x > 0 and input.x < (TAILLE_VUE_W / TAILLE_TILE) + 1 then
            lesInputs[getIndiceLesInputs(input.x, input.y)] = -1
        end
    end

    -- Tiles (blocks) = tile value (white if > 0)
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

The input grid is a view centered on Mario: 11 tiles wide, 9 tall. Each tile's value:
- **0** (gray): nothing
- **1** (white): solid block
- **-1** (black): enemy

Enemies are read from two lists in RAM: normal sprites (`0x14C8`-`0x14F8`) and extended sprites (`0x170B`-`0x173B`). For each living sprite (state > 7), its tile position relative to Mario is calculated and -1 is placed in the corresponding cell.

### Fitness: how the AI knows it's progressing

```lua
function majReseau(unReseau, marioBase)
    local mario = getPositionMario()

    if not niveauFini and memory.readbyte(0x0100) == 12 then
        -- Level finished!
        unReseau.fitness = FITNESS_LEVEL_FINI
        niveauFini = true
    elseif marioBase.x < mario.x then
        -- Mario moved right
        unReseau.fitness = unReseau.fitness + (mario.x - marioBase.x)
        marioBase.x = mario.x
    end

    -- Update inputs
    local lesInputs = getLesInputs()
    for i = 1, NB_INPUT, 1 do
        unReseau.lesNeurones[i].valeur = lesInputs[i]
    end
end
```

Fitness is simple: it's the **distance traveled to the right**. If Mario moves 10 pixels, fitness increases by 10. If Mario moves left, nothing happens (no penalty). If the level is finished (address `0x0100` == 12), fitness becomes 1,000,000.

It's intentionally simple. No bonus for killing enemies, no penalty for dying. Just: move right.

### Smart reset

If Mario doesn't move for 33 frames, the level resets and we move to the next individual. But if Mario made progress (current fitness differs from the start), we wait 300 frames -- giving the network a chance to "understand" what it did right.

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

The condition `memory.readbyte(0x0071) ~= 9` checks that Mario isn't in his death animation. No point resetting if Mario is already dead.

### The main loop

The loop runs at 30 fps (Super Mario World's normal speed):

```lua
while true do
    local fitnessAvant = laPopulation[idPopulation].fitness

    -- Display (network, info)
    if forms.ischecked(estAccelere) then
        emu.limitframerate(false)  -- speed up
    else
        emu.limitframerate(true)   -- 30 fps
    end

    -- The 3 vital functions
    majReseau(laPopulation[idPopulation], marioBase)
    feedForward(laPopulation[idPopulation])
    appliquerLesBoutons(laPopulation[idPopulation])

    emu.frameadvance()
    nbFrame = nbFrame + 1

    -- Reset if no progress
    -- ...
    -- New generation if all individuals tested
    -- ...
end
```

The three vital functions are `majReseau`, `feedForward`, and `appliquerLesBoutons`. Disable any one of them and Mario stops moving.

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

The baby inherits from the better parent. For each connection sharing the same innovation, the other parent has a 50% chance of replacing it -- but **only if the connection is active**. This is an important fix: without it, useless hidden neurons could be created.

### Species selection

```lua
function nouvelleGeneration(laPopulation, lesEspeces)
    local laNouvellePopulation = newPopulation()
    local nbIndividuACreer = NB_INDIVIDU_POPULATION

    -- Calculate average fitness per species
    for i = 1, #lesEspeces, 1 do
        lesEspeces[i].fitnessMoyenne = 0
        for j = 1, #lesEspeces[i].lesReseaux, 1 do
            lesEspeces[i].fitnessMoyenne =
                lesEspeces[i].fitnessMoyenne + lesEspeces[i].lesReseaux[j].fitness
        end
        lesEspeces[i].fitnessMoyenne =
            lesEspeces[i].fitnessMoyenne / #lesEspeces[i].lesReseaux
    end

    -- Each species creates a number of children proportional to its average fitness
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

The idea: a species with an average fitness of 10,000 gets to create many more children than a species with an average fitness of 1. This is **natural selection** in action.

`choisirParent` uses roulette selection: the higher an individual's fitness, the more likely it is to be selected as a parent.

### Saving and loading

Populations are saved to `.pop` files:

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

The save also includes the best individual from all previous populations. If the old population's best is better than the new one's, we revert to the old one as the base. This is a form of **elitism**: the best is never lost.

### Network visualization

Laupok added a neural network visualizer overlaid on the game:

```lua
function dessinerUnReseau(unReseau)
    -- Inputs: 11×9 grid around Mario
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            local xT = ENCRAGE_X_INPUT + (i - 1) * TAILLE_INPUT
            local yT = ENCRAGE_Y_INPUT + (j - 1) * TAILLE_INPUT
            local couleurFond = "gray"
            if unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur < 0 then
                couleurFond = "black"   -- enemy
            elseif unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur > 0 then
                couleurFond = "white"   -- block
            end
            gui.drawRectangle(xT, yT, TAILLE_INPUT, TAILLE_INPUT, "black", couleurFond)
        end
    end

    -- Outputs: 8 buttons
    for i = 1, NB_OUTPUT, 1 do
        local xT = ENCRAGE_X_OUTPUT
        local yT = ENCRAGE_Y_OUTPUT + ESPACE_Y_OUTPUT * (i - 1)
        if sigmoid(unReseau.lesNeurones[i + NB_INPUT].valeur) then
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "white")
        else
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "black")
        end
    end

    -- Connections
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

It's incredibly useful for understanding what the network does. Active connections are white, inactive ones are semi-transparent. Inputs are a grid of white/black/gray cells. Outputs show which buttons are pressed.

---

## Results

### What the AI learned

Over hours (and days) of execution, the AI discovered on its own:

1. **Move right**: the most basic behavior, but one that requires holding the Right button
2. **Jump over enemies**: by connecting an "enemy detected" input to the A or B button
3. **Avoid obstacles**: some networks learned to temporarily retreat to advance further
4. **Finish levels**: the best individual was able to complete the first level of Super Mario World

![Mario controlled by the AI facing a Boo in a Super Mario World level -- the neural network decides actions in real time](/images/laupok-mario-ai/mario-ai-playing.jpg)

### Limitations

The project has its limits:

- **Single level**: the AI is trained on one specific level. It doesn't automatically generalize to other levels
- **Training time**: it takes tens of hours to achieve satisfying results
- **No understanding**: the AI doesn't "understand" what it's doing. It optimizes a fitness function (distance traveled) through random mutations
- **T-bagging**: Laupok notes Mario tends to jump in place when seeing an enemy, simply because it increases fitness (he advances a little while jumping)

---

## How to reproduce the experiment

Laupok shared everything. Here are the steps:

1. **Download BizHawk** from [tasvideos.org](https://tasvideos.org/BizHawk) (Download section)
2. **Get a USA ROM of Super Mario World** (private copy from your own cartridge)
3. **Download the Lua script** from [Pastebin](https://pastebin.com/Jcvdqhqm) -- rename to `mario.lua`
4. **Place the script in the same folder as the ROM**
5. **Launch BizHawk**, open the ROM
6. **In the Lua console**: `dofile("mario.lua")` or via Script > Open Script menu
7. **Save a state** at the start of the level (Savestate > Save State menu) and name it `debut.state`
8. **Relaunch the script** -- it works

The script includes a form with options:
- **Accelerate**: disables the 30 fps limit to go faster
- **Show network**: displays the neural network overlaid on the game
- **Show info**: displays a banner with generation, fitness, and species count
- **Pause**: pauses execution
- **Save/Load**: persists the current population to a `.pop` file

---

## Sources and references

| Resource | Link |
|----------|------|
| Laupok's main video | [I built an AI that plays Mario by itself](https://www.youtube.com/watch?v=F63GNXGHVwM) |
| Code review + setup video | [How to set up the AI + source code review](https://www.youtube.com/watch?v=u5xCl1bSe6o) |
| Full source code | [Pastebin Jcvdqhqm](https://pastebin.com/Jcvdqhqm) |
| Original NEAT paper | Stanley & Miikkulainen, "Evolving Neural Networks through Augmenting Topologies", 2002 |
| N8Programs tutorial | [NEAT implementation walkthrough](https://n8programs.github.io/) (JavaScript, but concepts are identical) |
| 16blings (Laupok's inspiration) | [AI plays Super Mario World](https://www.youtube.com/watch?v=qv6IFaOz3bA) |
| BizHawk | [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) |
| Super Mario World memory | [SMW Central - RAM Map](https://www.smwcentral.net/?p=section&a=details&id=21702) |

---

## Conclusion

What Laupok did was take an academic algorithm (NEAT, 2002), rewrite it in Lua for an emulator (BizHawk), and apply it to Super Mario World. The result: an AI that learns from scratch to play the game, with no prior knowledge, through random mutations and natural selection alone.

It's a beautiful example of the power of genetic algorithms. No deep learning, no GPU, no millions of training data points. Just natural selection, some Lua, and a lot of patience.

The code is commented, shared, and Laupok made two explanatory videos -- one for the big concepts, one for the code. If the topic interests you, dive in. It's more accessible than it seems.
