---
title: "Laupok Built an AI That Plays Super Mario World by Itself -- How It Works"
date: 2026-07-11
tags:
  - ai
  - lua
  - emulation
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "MQCulBmGDNpV0Ec1ACpuJXi0eyxkvNRM56kmI6hpP1uVYgHsgr6PGFEkSTN0u++Ok8pNdHEqnezSinfJfgWTjA=="
---

# Laupok built an AI that plays Super Mario World by itself -- how it works

Laupok built an artificial intelligence that plays **Super Mario World** fully autonomously. It starts from zero: no pre-written scripts, no recorded frames. The AI learns alone, through random mutations and natural selection, to finish the game's levels. The project runs on **BizHawk**, a multiplatform emulator, via a Lua script of about **4200 lines**.

What makes this project fascinating is that it rests on biological concepts applied to computing: **Darwin's theory of evolution**, **artificial neural networks**, and above all a specific algorithm called **NEAT** (NeuroEvolution of Augmenting Topologies). The AI knows nothing about the game at first. It tries actions at random, fails thousands of times, and little by little figures out how to move forward, jump, and survive.

In this article, we'll break all of that down -- concept by concept, line of code by line of code.

![Laupok introducing the NEAT algorithm on camera](/images/laupok-mario-ai/neat-title.jpg)

---

## The setup: BizHawk, Lua, and Super Mario World

### The BizHawk emulator

BizHawk is an open-source emulator supporting a ton of consoles -- NES, SNES, Genesis, PS1, Game Boy, and more. Its special feature is running **Lua scripts** alongside the game. Those scripts have access to the emulation's **RAM**, meaning they can read -- and modify -- any game data in real time.

Concretely, that means you can:
- Read Mario's position in the level
- Know which sprites (enemies, items) are on screen
- Know each tile's state around Mario
- Control the gamepad -- press any button

That's exactly what you need to make an AI play.

### Super Mario World memory addresses

In Super Mario World RAM, each datum sits at a specific address. It's a bit like a neighborhood: each address is a "house" holding information. For example:

| Address | Data |
|---------|--------|
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
| `0x0071` | Mario death animation (9 = dead) |
| `0x1C800`+... | Level tile table |

Sprite position uses two bytes: a "low" byte and a "high" byte, because position can exceed 255 pixels. The formula is always low + high × 256.

For tiles, it's more complex: base address is `0x1C800`, and you compute the offset from the tile's `x` and `y` coords in the world, with a 16-pixel-per-tile step.

![Super Mario World with debug overlay showing sprite memory addresses and Mario's position](/images/laupok-mario-ai/memory-debug.jpg)

---

## The basics: genetic algorithms and neural networks

Before diving into code, you need two fundamental concepts. Without them, nothing else makes sense.

### Genetic algorithms

A genetic algorithm is a simulation of **evolution theory**. The core idea: you create a **population** of individuals, each with slightly different traits ("genes"). You let them "live" in an environment. Those doing best survive and reproduce. Those doing badly disappear.

Laupok illustrates it with a **Kirby** analogy:
- A Kirby population appears on terrain with spikes and tomatoes
- Spikes remove hit points, tomatoes restore them
- Each Kirby has genes: size, speed, hit points, behavior (flee, seek tomatoes, rush anywhere)

![Double helix DNA with labels "the baby", "size", "speed", "color" -- the genes making an individual](/images/laupok-mario-ai/dna-genes.jpg)

- After 15 seconds, you look at who survived longest
- The best Kirby reproduces with the others: babies inherit half the best one's genes and half the "worst" one's
- Babies undergo random **mutations** (a bit bigger, a bit faster...)
- Old Kirbies get replaced by the new ones
- Relaunch

After 180 generations (~15 hours), the Kirbies went from 15 seconds of survival to **15 minutes**. They became small (reduced hitbox), fast, and permanently flee danger.

![Kirby simulation generation 0: colored circles scattered randomly on a black background, all similar size](/images/laupok-mario-ai/kirby-gen0.jpg)

![Kirby simulation generation 1866: Kirbies are smaller, faster, and systematically flee dangers](/images/laupok-mario-ai/kirby-gen1866.jpg)

![Kirby simulation stats: fitness, hit point count, each individual's behavior ranked by performance](/images/laupok-mario-ai/kirby-stats.jpg)

The crucial point: **you don't define the solution**. The algorithm **finds it alone**. And that's exactly what makes it powerful for problems where you don't know which parameter combination would be optimal.

### Artificial neural networks

A neural network is a simplified mathematical model of the human brain. It consists of:
- **Input neurons** (inputs): what the network "sees"
- **Output neurons** (outputs): what the network "decides"
- **Connections** (weights): each connection has a **weight** amplifying or attenuating the signal

The principle is simple: each input neuron sends its value. It gets multiplied by the connection weight, then added to other signals. If the result exceeds a threshold (the **activation function**), the output neuron fires.

In Laupok's analogy with Mario and the mouse bit:
- The input neuron = distance between Mario and the bit
- The connection weight = Mario's sensitivity
- The output neuron = Mario screams or not

The closer the bit, the higher the input value. If the weight is strong, the output signal is strong, and Mario would scream. Changing the weight changes Mario's sensitivity.

!["Mario is scared" demo: Mario facing a Boo with a synapse bar showing the input-output connection weight](/images/laupok-mario-ai/mario-fear-demo.jpg)

In the AI's real neural network, it's the same logic, but at massive scale:
- **99 input neurons** (11×9 tiles of Mario's view)
- **8 output neurons** (A, B, X, Y, Up, Down, Left, Right)
- **Hidden neurons** in between
- Hundreds of connections with varied weights

---

## NEAT: the algorithm that changes everything

### The problem with classic genetic algorithms

If you naively combine a genetic algorithm with a neural network, you have a problem: you create 100 totally different neural networks, and you can't compare them. Each has its own neurons, connections, weights. How do you know whether two networks are "close" or "far"?

That's where **NEAT** comes in -- NeuroEvolution of Augmenting Topologies. Invented by **Kenneth Stanley** and **Risto Miikkulainen** in 2002, it's an algorithm solving exactly that problem.

### Species

NEAT's first key mechanism is **species**. When a neural network becomes too different from another, it's classified into a different species. Similarity computes via three parameters:

1. **Excess** (`EXCES_COEF = 0.50`): the number of connections with no relation between two networks (different innovations)
2. **Disjoint**: same, but for connections sitting in the middle
3. **Weight difference** (`POIDSDIFF_COEF = 0.92`): the average weight difference between connections sharing the same innovation

The score formula:

```
score = (EXCES_COEF × disjoint) / max(nbConnections1 + nbConnections2, 1)
      + POIDSDIFF_COEF × weightDiff
```

If that score is below `DIFF_LIMITE` (1.0), both networks are in the same species. Otherwise, a new species is created.

### Innovations

That's NEAT's genius. Every time a connection is created, it gets a unique global **innovation** number. That number follows the neural network even as it reproduces.

Concretely, when a baby is created by crossover, it inherits its parents' innovations. If two networks share the same innovation, it means they have a connection from the same ancestor. That's what lets you compare different-sized networks.

### Crossover

When two neural networks reproduce, **crossover** works like this:

![Laupok explaining crossover with "CROSSOVER" overlay text](/images/laupok-mario-ai/crossover-label.jpg)

1. The fittest network becomes the "dominant parent"
2. The baby inherits all of the dominant's connections
3. For each connection sharing the same innovation, the other parent can replace it (50% chance)
4. Only the non-dominant parent's active connections can replace

That guarantees the baby is always at least as good as the best parent.

### Mutations

After crossover, the baby undergoes mutations with configurable probabilities:

![Laupok explaining mutations with "(small change = mutation)" overlay text](/images/laupok-mario-ai/mutation-label.jpg)

| Mutation | Probability | Effect |
|----------|------------|-------|
| Connection weight reset | 25% | Weight fully randomized |
| Weight mutation | 95% | Weight varies by ±0.80 |
| Add connection | 85% | New connection between two not-yet-linked neurons |
| Add neuron | 39% | A hidden neuron inserted between two connected neurons |

The neuron-add rate matters: it's what lets the network **grow**. At first, there are only inputs and outputs. Gradually, hidden neurons appear, making the network more and more complex.

---

## The code: full walkthrough

### Constants

The script starts with a constants block defining all tuning:

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
NB_NEURONE_MAX = 100000  -- hidden neuron cap

-- Fitness
FITNESS_LEVEL_FINI = 1000000  -- value when level is done
NB_FRAME_RESET_BASE = 33  -- frames with no progress before reset
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

`NB_INPUT` is 99 because Mario's view is 11×9 tiles. Each tile is one input neuron. If the tile is empty, it's 0. If it's a block, it's 1. If it's an enemy, it's -1.

The 8 outputs map to SNES pad buttons: A, B, X, Y, Up, Down, Left, Right. Start, Select, L, and R are excluded to limit its decisions to the essentials.

### Data structures

The script defines three main structures:

```lua
function newNeurone()
    local neurone = {}
    neurone.valeur = 0    -- current neuron value
    neurone.id = 0        -- unique id
    neurone.type = ""     -- "input", "output", or "hidden"
    return neurone
end

function newConnexion()
    local connexion = {}
    connexion.entree = 0     -- source neuron id
    connexion.sortie = 0     -- destination neuron id
    connexion.actif = true   -- can be disabled if a hidden neuron is inserted
    connexion.poids = 0      -- connection weight
    connexion.innovation = 0 -- unique innovation number
    connexion.allume = false -- for display: true if signal passes
    return connexion
end

function newReseau()
    local reseau = {
        nbNeurone = 0,        -- hidden neuron count
        fitness = 1,          -- performance (distance traveled)
        idEspeceParent = 0,   -- which species it belongs to
        lesNeurones = {},     -- neuron array
        lesConnexions = {}    -- connection array
    }
    -- Init with inputs
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

At first, each network holds only inputs and outputs: no hidden neurons, no connections. The algorithm decides whether it needs any.

### Mutations in detail

#### Weight mutation

```lua
function mutationPoidsConnexions(unReseau)
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            if math.random() < CHANCE_MUTATION_RESET_CONNEXION then
                -- 25%: full weight reset
                unReseau.lesConnexions[i].poids = genererPoids()
            else
                -- 75%: ±0.80 variation
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

The initial weight is always 1 or -1 (`genererPoids()`). The ±0.80 variation can swing it between negative and positive values, radically changing network behavior.

#### Adding a connection

```lua
function mutationAjouterConnexion(unReseau)
    local liste = {}
    -- Randomize the neuron list
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

You can't connect an output to an input (that would create a cycle), and you can't connect two already-linked neurons. Randomization guarantees exploring different possibilities each time.

#### Adding a neuron

The most interesting mutation:

```lua
function mutationAjouterNeurone(unReseau)
    if #unReseau.lesConnexions == 0 then return nil end
    if unReseau.nbNeurone == NB_NEURONE_MAX then return nil end

    -- Randomize connections
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

The mechanism: you take an existing connection, **disable** it, and insert a hidden neuron in the middle. The original connection gets replaced by two new ones: input→hidden and hidden→output. Like "cutting" a wire to splice in a switch.

That's what makes NEAT "augmenting topologies": the network **grows** over time. It starts simple and only gets complex if needed.

### FeedForward

The function propagating signals through the network:

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

Each active connection sends `input_value × weight` to the output neuron. The value **accumulates** (adds up). The `allume` flag is just for the network's visual display.

### Reading the game memory

The `getLesInputs()` function translates Super Mario World's world into data the network understands:

```lua
function getLesInputs()
    local lesInputs = {}
    -- Init to 0 (gray = nothing)
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

The input grid is a Mario-centered view: 11 tiles wide, 9 tall. Each tile is:
- **0** (gray): nothing
- **1** (white): solid block
- **-1** (black): enemy

Enemies are read from two RAM lists: normal sprites (`0x14C8`-`0x14F8`) and extended sprites (`0x170B`-`0x173B`). For each living sprite (state > 7), compute its tile position relative to Mario and set -1 in the matching cell.

### Fitness: how the AI knows it's improving

```lua
function majReseau(unReseau, marioBase)
    local mario = getPositionMario()

    if not niveauFini and memory.readbyte(0x0100) == 12 then
        -- Level done!
        unReseau.fitness = FITNESS_LEVEL_FINI
        niveauFini = true
    elseif marioBase.x < mario.x then
        -- Mario moving right
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

Fitness is simple: it's the **distance traveled rightward**. If Mario advances 10 pixels, fitness rises by 10. If Mario goes back, nothing happens (no penalty). If the level is done (address `0x0100` == 12), fitness becomes 1,000,000.

It's intentionally simple. Only rightward progress counts: killing enemies earns nothing, dying costs nothing.

### The smart reset

If Mario doesn't move for 33 frames, reset the level and move to the next individual. But if Mario made progress (its current fitness differs from the start), wait 300 frames -- giving the network a chance to "get" what it did right.

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

The `memory.readbyte(0x0071) ~= 9` check verifies Mario isn't in death animation. Resetting becomes pointless when Mario is already in death animation.

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
    -- New generation once all individuals tested
    -- ...
end
```

The three vital functions are `majReseau`, `feedForward`, and `appliquerLesBoutons`. Disable just one and Mario stops moving.

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

The baby inherits from the fitter parent. For each connection sharing the same innovation, the other parent has a 50% chance to replace it -- **but only if the connection is active**. That's an important fix: without it, useless hidden neurons could get created.

### Species selection

```lua
function nouvelleGeneration(laPopulation, lesEspeces)
    local laNouvellePopulation = newPopulation()
    local nbIndividuACreer = NB_INDIVIDU_POPULATION

    -- Average fitness per species
    for i = 1, #lesEspeces, 1 do
        lesEspeces[i].fitnessMoyenne = 0
        for j = 1, #lesEspeces[i].lesReseaux, 1 do
            lesEspeces[i].fitnessMoyenne =
                lesEspeces[i].fitnessMoyenne + lesEspeces[i].lesReseaux[j].fitness
        end
        lesEspeces[i].fitnessMoyenne =
            lesEspeces[i].fitnessMoyenne / #lesEspeces[i].lesReseaux
    end

    -- Each species creates children proportional to its average fitness
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

The idea: a species with average fitness 10,000 gets to create way more children than one with average fitness 1. That's **natural selection** in action.

`choisirParent` uses roulette selection: the fitter an individual, the likelier it gets picked as a parent.

### Saving and loading

Populations save to `.pop` files:

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

Saving also includes the best individual of all previous populations. If the old population's best beats the new one's best, we take the old one back as base. It's a form of **elitism**: you never lose the best.

### Drawing the network

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

Super useful for understanding what the network does. Active connections are white, inactive ones semi-transparent. Inputs are a white/black/gray cell grid. Outputs show which buttons are pressed.

---

## Results

### What the AI learned

Over hours (and days) of running, the AI discovered on its own:

1. **Moving right**: the most basic behavior, but one requiring holding Right down
2. **Jumping over enemies**: by connecting an "enemy detected" input to the A or B button
3. **Avoiding obstacles**: some networks learned to briefly back up to better move forward
4. **Finishing levels**: the best individual managed to finish Super Mario World's first level

![Mario controlled by the AI facing a Boo in a Super Mario World level -- the neural network decides actions in real time](/images/laupok-mario-ai/mario-ai-playing.jpg)

### Limitations

The project has limits:

- **One level**: the AI trains on one specific level. It doesn't automatically generalize to other levels
- **Training time**: it takes dozens of hours to reach satisfying results
- **No understanding**: the AI doesn't "understand" what it does. It optimizes a fitness function (distance traveled) via random mutations
- **T-bagging**: Laupok notes Mario tends to jump in place when it sees an enemy, simply because that raises fitness (it advances a bit while jumping)

---

## How to reproduce the experiment

Laupok shared everything. Here are the steps:

1. **Download BizHawk** at [tasvideos.org](https://tasvideos.org/BizHawk) (Download section)
2. **Get a USA Super Mario World ROM** (private copy of your own cartridge)
3. **Download the Lua script** from [Pastebin](https://pastebin.com/Jcvdqhqm) -- rename to `mario.lua`
4. **Place the script in the same folder as the ROM**
5. **Launch BizHawk**, open the ROM
6. **In the Lua console**: `dofile("mario.lua")` or via the Script > Open Script menu
7. **Save a state** at the level start (Savestate > Save State menu) and name it `debut.state`
8. **Relaunch the script** -- it works

The script includes a form with options:
- **Speed up**: disables the 30 fps cap to go faster
- **Show network**: displays the neural network overlay
- **Show info**: shows a banner with generation, fitness, species count
- **Pause**: pauses execution
- **Save/Load**: persists the current population to a `.pop` file

---

## Sources and references

| Resource | Link |
|-----------|------|
| Laupok's main video | [j'ai créé une IA qui joue à mario toute seule](https://www.youtube.com/watch?v=F63GNXGHVwM) |
| Code review + setup video | [comment setup l'ia + code source review](https://www.youtube.com/watch?v=u5xCl1bSe6o) |
| Full source code | [Pastebin Jcvdqhqm](https://pastebin.com/Jcvdqhqm) |
| Original NEAT paper | Stanley & Miikkulainen, "Evolving Neural Networks through Augmenting Topologies", 2002 |
| N8Programs tutorial | [NEAT implementation walkthrough](https://n8programs.github.io/) (JavaScript, but concepts are identical) |
| 16blings (Laupok's inspiration) | [AI plays Super Mario World](https://www.youtube.com/watch?v=qv6IFaOz3bA) |
| BizHawk | [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) |
| Super Mario World memory map | [SMW Central - RAM Map](https://www.smwcentral.net/?p=section&a=details&id=21702) |

---

## Conclusion

What Laupok did is take an academic algorithm (NEAT, 2002), rewrite it in Lua for an emulator (BizHawk), and apply it to Super Mario World. The result: an AI learning from scratch to play the game, with zero prior knowledge, purely through random mutations and natural selection.

It's a beautiful example of genetic algorithm power. The recipe has three ingredients: natural selection, a bit of Lua, and lots of patience. No deep learning, no GPU, no massive training dataset.

The code is commented, shared, and Laupok made two explainer videos -- one for the big concepts, one for the code. If the topic interests you, dive in. It's more approachable than it looks.
