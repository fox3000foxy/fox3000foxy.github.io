---
title: "Laupok ha creato un'IA che gioca da sola a Super Mario World -- come funziona"
description: "Un approfondimento sul progetto di Laupok: un'IA basata su NEAT che impara a giocare a Super Mario World in modo autonomo. Algoritmi genetici, reti neurali, neuroevoluzione di topologie crescenti e 4200 righe di Lua."
date: 2026-07-11
authors:
  - fox3000foxy
tags:
  - ai
  - lua
  - emulation
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "Y4kQQ80nr+utvlsih5eRT20MSQZcaMpbFTpOgKcVwZQx1M1beaOisVcaayUbAdrO29a1Kn5YacB+4TB0grA3xw=="
---

# Laupok ha creato un'IA che gioca da sola a Super Mario World -- come funziona

Laupok ha creato un'intelligenza artificiale che gioca a **Super Mario World** in modo completamente autonomo. Nessun input predefinito, nessun frame registrato. L'IA impara da sola, attraverso mutazioni casuali e selezione naturale, a completare i livelli del gioco. Il progetto funziona su **BizHawk**, un emulatore multi-piattaforma, tramite uno script Lua di circa **4200 righe**.

Ciò che rende affascinante questo progetto è che si basa su concetti biologici applicati all'informatica: la **teoria dell'evoluzione** di Darwin, le **reti neurali artificiali** e soprattutto un algoritmo specifico chiamato **NEAT** (NeuroEvolution of Augmenting Topologies). L'IA non conosce nulla del gioco all'inizio. Prova cose a caso, fallisce migliaia di volte e gradualmente capisce come muoversi, saltare e sopravvivere.

In questo articolo analizzeremo tutto -- concetto per concetto, riga di codice per riga di codice.

![Laupok introduce l'algoritmo NEAT in camera](/images/laupok-mario-ai/neat-title.jpg)

---

## L'ambiente: BizHawk, Lua e Super Mario World

### L'emulatore BizHawk

BizHawk è un emulatore open-source che supporta un sacco di console -- NES, SNES, Genesis, PS1, Game Boy e molte altre. La sua caratteristica principale è che può eseguire **script Lua** insieme al gioco. Questi script hanno accesso alla **RAM** (memoria ad accesso casuale) dell'emulazione, il che significa che possono leggere -- e modificare -- qualsiasi dato di gioco in tempo reale.

Concretamente, questo significa che puoi:
- Leggere la posizione di Mario nel livello
- Sapere quali sprite (nemici, oggetti) sono sullo schermo
- Conoscere lo stato di ogni tile (blocco) intorno a Mario
- Controllare il controller -- premere qualsiasi pulsante

È esattamente ciò che serve per far giocare un'IA.

### Gli indirizzi di memoria di Super Mario World

Nella RAM di Super Mario World, ogni dato è memorizzato a un indirizzo specifico. È come un quartiere: ogni indirizzo corrisponde a una "casa" che contiene un'informazione. Per esempio:

| Indirizzo | Dato |
|-----------|------|
| `0x94`-`0x95` | Posizione X di Mario (16-bit, little-endian) |
| `0x96`-`0x97` | Posizione Y di Mario |
| `0x14C8`+`i` | Stato dello sprite `i` (>7 = vivo) |
| `0xE4`+`i` | Byte basso posizione X dello sprite `i` |
| `0x14E0`+`i` | Byte alto posizione X dello sprite `i` |
| `0xD8`+`i` | Byte basso posizione Y dello sprite `i` |
| `0x14D4`+`i` | Byte alto posizione Y dello sprite `i` |
| `0x170B`+`i` | Tipo dello sprite esteso `i` |
| `0x0100` | Stato del gioco (12 = livello completato) |
| `0x13D4` | Pausa attiva |
| `0x0071` | Animazione di morte di Mario (9 = morto) |
| `0x1C800`+... | Tabella tile del livello |

Le posizioni degli sprite usano due byte: un byte "basso" e un byte "alto", perché la posizione può superare i 255 pixel. La formula è sempre `basso + alto × 256`.

Per le tile è più complesso: l'indirizzo di base è `0x1C800`, e si calcola l'offset in base alle coordinate `x` e `y` della tile nel mondo, con un passo di 16 pixel per tile.

![Super Mario World con un overlay di debug che mostra gli indirizzi di memoria degli sprite e la posizione di Mario](/images/laupok-mario-ai/memory-debug.jpg)

---

## Le basi: algoritmi genetici e reti neurali

Prima di approfondire il codice, bisogna capire due concetti fondamentali. Senza di essi, nient'altro ha senso.

### Algoritmi genetici

Un algoritmo genetico è una simulazione della **teoria dell'evoluzione**. L'idea di base: crei una **popolazione** di individui, ognuno leggermente diverso dagli altri ("geni"). Li lasci "vivere" in un ambiente. Chi performa meglio sopravvive e si riproduce. Chi performa male muore.

Laupok illustra questo con un'analogia su **Kirby**:
- Una popolazione di Kirby appare su un terreno con spine e pomodori
- Le spine tolgono punti vita, i pomodori li ripristinano
- Ogni Kirby ha dei geni: dimensione, velocità, PV, comportamento (fuggire, cercare pomodori, correre alla cieca)

![Doppia elica di DNA con le etichette "the baby", "size", "speed", "color" -- i geni che compongono un individuo](/images/laupok-mario-ai/dna-genes.jpg)

- Dopo 15 secondi, controlli chi è sopravvissuto più a lungo
- Il miglior Kirby si riproduce con gli altri: i figli ereditano metà dei geni del migliore e metà del "peggiore"
- I figli subiscono **mutazioni** casuali (un po' più grandi, un po' più veloci...)
- I vecchi Kirby vengono sostituiti dai nuovi
- Riparti

Dopo 180 generazioni (~15 ore), i Kirby passano da 15 secondi di sopravvivenza a **15 minuti**. Sono diventati piccoli (hitbox ridotto), veloci e fuggono costantemente dal pericolo.

![Simulazione Kirby generazione 0: cerchi colorati sparsi casualmente su sfondo nero, tutti simili per dimensione](/images/laupok-mario-ai/kirby-gen0.jpg)

![Simulazione Kirby generazione 1866: i Kirby sono più piccoli, più veloci e fuggono sistematicamente dal pericolo](/images/laupok-mario-ai/kirby-gen1866.jpg)

![Statistiche simulazione Kirby: fitness, PV, comportamento di ogni individuo classificato per prestazioni](/images/laupok-mario-ai/kirby-stats.jpg)

Il punto cruciale: **non definisci tu la soluzione**. L'algoritmo **la trova da solo**. Ed è proprio questo che lo rende potente per problemi dove non sai qual sarebbe la combinazione ottimale di parametri.

### Reti neurali artificiali

Una rete neurale è un modello matematico semplificato del cervello umano. È composta da:
- **Neuroni di input**: ciò che la rete "vede"
- **Neuroni di output**: ciò che la rete "decide"
- **Connessioni (pesi)**: ogni connessione ha un **peso** che amplifica o smorza il segnale

Il principio è semplice: ogni neurone di input invia il suo valore. Viene moltiplicato per il peso della connessione, poi sommato ad altri segnali. Se il risultato supera una certa soglia (la **funzione di attivazione**), il neurone di output si attiva.

Nell'analogia di Laupok con Mario e il cursore del mouse:
- Neurone di input = distanza tra Mario e il cursore
- Peso della connessione = sensibilità di Mario
- Neurone di output = Mario urla o no

Più il cursore è vicino, più il valore di input è alto. Se il peso è forte, il segnale di output è forte e Mario urlerebbe. Cambiando il peso, cambi la sensibilità di Mario.

![La demo "Mario ha paura": Mario di fronte a un Boo con una barra sinaptica che mostra il peso della connessione tra input e output](/images/laupok-mario-ai/mario-fear-demo.jpg)

Nella rete neurale dell'IA effettiva, la logica è la stessa, ma su scala massiccia:
- **99 neuroni di input** (11×9 tile della visuale di Mario)
- **8 neuroni di output** (A, B, X, Y, Su, Giù, Sinistra, Destra)
- **Neuroni nascosti** tra di essi
- Centinaia di connessioni con pesi variabili

---

## NEAT: l'algoritmo che cambia tutto

### Il problema degli algoritmi genetici base

Se combini in modo ingenuo un algoritmo genetico con una rete neurale, hai un problema: crei 100 reti neurali completamente diverse e non puoi confrontarle. Ognuna ha i suoi neuroni, connessioni e pesi. Come fai a sapere se due reti sono "simili" o "diverse"?

È qui che entra in gioco **NEAT** -- NeuroEvolution of Augmenting Topologies. Inventato da **Kenneth Stanley** e **Risto Miikkulainen** nel 2002, risolve esattamente questo problema.

### Le specie

Il primo meccanismo chiave di NEAT sono le **specie**. Quando una rete neurale diventa troppo diversa da un'altra, viene classificata in una specie diversa. La similarità si calcola tramite tre parametri:

1. **Eccesso** (`EXCES_COEF = 0.50`): il numero di connessioni che non hanno nulla in comune tra due reti (innovazioni diverse)
2. **Disgiunto**: uguale, ma per le connessioni nel mezzo
3. **Differenza di peso** (`POIDSDIFF_COEF = 0.92`): la differenza media di peso tra le connessioni che condividono la stessa innovazione

La formula del punteggio:

```
score = (EXCES_COEF × disjoint) / max(nbConnexions1 + nbConnexions2, 1)
      + POIDSDIFF_COEF × diffPoids
```

Se questo punteggio è inferiore a `DIFF_LIMITE` (1.0), le due reti sono nella stessa specie. Altrimenti, viene creata una nuova specie.

### Le innovazioni

Questo è il genio di NEAT. Ogni volta che viene creata una connessione, riceve un numero di **innovazione** unico e globale. Questo numero segue la rete neurale anche quando si riproduce.

Concretamente, quando un figlio viene creato tramite crossover, eredita le innovazioni dei suoi genitori. Se due reti condividono la stessa innovazione, significa che hanno una connessione dallo stesso antenato. È questo che permette di confrontare reti di dimensioni diverse.

### Il crossover

Quando due reti neurali si riproducono, il **crossover** funziona così:

![Laupok spiega il concetto di crossover con il testo "CROSSOVER" sovrapposto](/images/laupok-mario-ai/crossover-label.jpg)

1. La rete che performa meglio diventa il "genitore dominante"
2. Il figlio eredita tutte le connessioni dal dominante
3. Per ogni connessione che condivide la stessa innovazione, l'altro genitore può sostituirla (50% di probabilità)
4. Solo le connessioni attive dal genitore non-dominante possono sostituire

Questo garantisce che il figlio sia sempre almeno buono quanto il genitore migliore.

### Le mutazioni

Dopo il crossover, il figlio subisce mutazioni con probabilità configurabili:

![Laupok spiega le mutazioni con il testo "(small modif = mutation)" sovrapposto](/images/laupok-mario-ai/mutation-label.jpg)

| Mutazione | Probabilità | Effetto |
|-----------|-------------|---------|
| Reset peso connessione | 25% | Il peso viene completamente randomizzato |
| Mutazione peso | 95% | Il peso varia di ±0.80 |
| Aggiungi connessione | 85% | Nuova connessione tra due neuroni non collegati |
| Aggiungi neurone | 39% | Un neurone nascosto viene inserito tra due neuroni collegati |

La tasso di aggiunta di neuroni è importante: è ciò che permette alla rete di **crescere**. All'inizio ci sono solo input e output. Gradualmente, appaiono neuroni nascosti, rendendo la rete sempre più complessa.

---

## Il codice: analisi completa

### Costanti

Lo script inizia con un blocco di costanti che definiscono tutte le impostazioni:

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

`NB_INPUT` è 99 perché la visuale di Mario è di 11×9 tile. Ogni tile è un neurone di input. Tile vuota = 0. Blocco = 1. Nemico = -1.

Gli 8 output corrispondono ai pulsanti del controller SNES: A, B, X, Y, Su, Giù, Sinistra, Destra. Start, Select, L e R sono esclusi così non "distraggono" Mario.

### Strutture dati

Lo script definisce tre strutture principali:

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

All'inizio, ogni rete ha solo input e output. Nessun neurone nascosto, nessuna connessione. L'algoritmo decide se ne servono.

### Le mutazioni nel dettaglio

#### Mutazione del peso

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

Il peso iniziale è sempre 1 o -1 (`genererPoids()`). La variazione di ±0.80 può spostarlo tra valori negativi e positivi, cambiando radicalmente il comportamento della rete.

#### Aggiungere una connessione

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

Non puoi collegare un output a un input (creerebbe un ciclo) e non puoi collegare due neuroni già collegati. La mescola garantisce che vengano esplorate possibilità diverse ogni volta.

#### Aggiungere un neurone

Questa è la mutazione più interessante:

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

Il meccanismo: prendi una connessione esistente, **la disabiliti** e inserisci un neurone nascosto in mezzo. La connessione originale viene sostituita da due nuove: input→nascosto e nascosto→output. È come tagliare un cavo per inserirvi un interruttore.

È questo che rende NEAT "augmenting topologies": la rete **cresce** nel tempo. Inizia semplice e diventa complessa solo quando necessario.

### Il feedForward

Questa è la funzione che propaga i segnali nella rete:

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

Ogni connessione attiva invia `valore_input × peso` al neurone di output. Il valore viene **accumulato** (sommati). Il flag `allume` è solo per la visualizzazione grafica della rete.

### Leggere la memoria del gioco

La funzione `getLesInputs()` traduce il mondo di Super Mario World in dati comprensibili alla rete:

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

La griglia di input è una visuale centrata su Mario: 11 tile di larghezza, 9 di altezza. Il valore di ogni tile:
- **0** (grigio): niente
- **1** (bianco): blocco solido
- **-1** (nero): nemico

I nemici vengono letti da due liste nella RAM: sprite normali (`0x14C8`-`0x14F8`) e sprite estesi (`0x170B`-`0x173B`). Per ogni sprite vivo (stato > 7), viene calcolata la sua posizione in tile rispetto a Mario e viene inserito -1 nella cella corrispondente.

### Fitness: come l'IA sa di stare progredendo

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

La fitness è semplice: è la **distanza percorsa verso destra**. Se Mario si muove di 10 pixel, la fitness aumenta di 10. Se Mario va a sinistra, non succede nulla (nessuna penalità). Se il livello è completato (indirizzo `0x0100` == 12), la fitness diventa 1.000.000.

È intenzionalmente semplice. Nessun bonus per uccidere nemici, nessuna penalità per morire. Solo: vai a destra.

### Reset intelligente

Se Mario non si muove per 33 frame, il livello si resetta e si passa al successivo individuo. Ma se Mario ha fatto progressi (la fitness attuale differisce da quella iniziale), aspettiamo 300 frame -- dando alla rete la possibilità di "capire" cosa ha fatto di giusto.

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

La condizione `memory.readbyte(0x0071) ~= 9` verifica che Mario non sia nella sua animazione di morte. Non ha senso fare il reset se Mario è già morto.

### Il ciclo principale

Il ciclo gira a 30 fps (la velocità normale di Super Mario World):

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

Le tre funzioni vitali sono `majReseau`, `feedForward` e `appliquerLesBoutons`. Disabilitane una qualsiasi e Mario smette di muoversi.

### Il crossover

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

Il figlio eredita dal genitore migliore. Per ogni connessione che condivide la stessa innovazione, l'altro genitore ha il 50% di probabilità di sostituirla -- ma **solo se la connessione è attiva**. Questo è un fix importante: senza di esso, potrebbero essere creati neuroni nascosti inutili.

### Selezione delle specie

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

L'idea: una specie con una fitness media di 10.000 può creare molti più figli di una specie con fitness media di 1. Questa è la **selezione naturale** in azione.

`choisirParent` usa la selezione a roulette: più alta è la fitness di un individuo, maggiore è la probabilità che venga selezionato come genitore.

### Salvataggio e caricamento

Le popolazioni vengono salvate in file `.pop`:

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

Il salvataggio include anche il miglior individuo di tutte le popolazioni precedenti. Se il migliore della vecchia popolazione è migliore di quello nuovo, torniamo a quello vecchio come base. Questa è una forma di **elitismo**: il migliore non va mai perso.

### Visualizzazione della rete

Laupok ha aggiunto un visualizzatore di reti neurali sovrapposto al gioco:

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

È incredibilmente utile per capire cosa fa la rete. Le connessioni attive sono bianche, quelle inattive sono semitrasparenti. Gli input sono una griglia di celle bianche/nere/grigie. Gli output mostrano quali pulsanti vengono premuti.

---

## Risultati

### Cosa ha imparato l'IA

Nelle ore (e giorni) di esecuzione, l'IA ha scoperto autonomamente:

1. **Muoversi a destra**: il comportamento più basilare, ma che richiede di tenere premuto il pulsante Destra
2. **Saltare i nemici**: collegando un input "nemico rilevato" al pulsante A o B
3. **Evitare ostacoli**: alcune reti hanno imparato a ritirarsi temporaneamente per avanzare più lontano
4. **Completare livelli**: il miglior individuo è riuscito a completare il primo livello di Super Mario World

![Mario controllato dall'IA di fronte a un Boo in un livello di Super Mario World -- la rete neurale decide le azioni in tempo reale](/images/laupok-mario-ai/mario-ai-playing.jpg)

### Limitazioni

Il progetto ha i suoi limiti:

- **Livello singolo**: l'IA è addestrata su un livello specifico. Non si generalizza automaticamente ad altri livelli
- **Tempo di addestramento**: servono decine di ore per ottenere risultati soddisfacenti
- **Nessuna comprensione**: l'IA non "capisce" cosa sta facendo. Ottimizza una funzione di fitness (distanza percorsa) attraverso mutazioni casuali
- **T-bagging**: Laupok nota che Mario tende a saltare sul posto quando vede un nemico, semplicemente perché aumenta la fitness (avanza un po' saltando)

---

## Come riprodurre l'esperimento

Laupok ha condiviso tutto. Ecco i passaggi:

1. **Scarica BizHawk** da [tasvideos.org](https://tasvideos.org/BizHawk) (sezione Download)
2. **Ottieni una ROM USA di Super Mario World** (copia privata dalla tua cartuccia)
3. **Scarica lo script Lua** da [Pastebin](https://pastebin.com/Jcvdqhqm) -- rinominalo `mario.lua`
4. **Posiziona lo script nella stessa cartella della ROM**
5. **Avvia BizHawk**, apri la ROM
6. **Nella console Lua**: `dofile("mario.lua")` oppure tramite il menu Script > Open Script
7. **Salva un Savestate** all'inizio del livello (menu Savestate > Save State) e chiamalo `debut.state`
8. **Rilancia lo script** -- funziona

Lo script include un modulo con le opzioni:
- **Accelerare**: disabilita il limite a 30 fps per andare più veloce
- **Mostra rete**: visualizza la rete neurale sovrapposta al gioco
- **Mostra info**: visualizza un banner con generazione, fitness e conteggio specie
- **Pausa**: mette in pausa l'esecuzione
- **Salva/Carica**: salva la popolazione corrente in un file `.pop`

---

## Fonti e riferimenti

| Risorsa | Link |
|---------|------|
| Video principale di Laupok | [Ho creato un'IA che gioca a Mario da sola](https://www.youtube.com/watch?v=F63GNXGHVwM) |
| Video revisione codice + setup | [Come configurare l'IA + revisione del codice sorgente](https://www.youtube.com/watch?v=u5xCl1bSe6o) |
| Codice sorgente completo | [Pastebin Jcvdqhqm](https://pastebin.com/Jcvdqhqm) |
| Articolo originale NEAT | Stanley & Miikkulainen, "Evolving Neural Networks through Augmenting Topologies", 2002 |
| Tutorial N8Programs | [Walkthrough implementazione NEAT](https://n8programs.github.io/) (JavaScript, ma i concetti sono identici) |
| 16blings (ispirazione di Laupok) | [AI gioca a Super Mario World](https://www.youtube.com/watch?v=qv6IFaOz3bA) |
| BizHawk | [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) |
| Memoria di Super Mario World | [SMW Central - RAM Map](https://www.smwcentral.net/?p=section&a=details&id=21702) |

---

## Conclusione

Ciò che ha fatto Laupok è stato prendere un algoritmo accademico (NEAT, 2002), riscriverlo in Lua per un emulatore (BizHawk) e applicarlo a Super Mario World. Il risultato: un'IA che impara da zero a giocare, senza alcuna conoscenza preventiva, solo attraverso mutazioni casuali e selezione naturale.

È un bell'esempio della potenza degli algoritmi genetici. Nessun deep learning, nessuna GPU, nessun milione di dati di addestramento. Solo selezione naturale, un po' di Lua e tanta pazienza.

Il codice è commentato, condiviso, e Laupok ha fatto due video esplicativi -- uno per i concetti generali, uno per il codice. Se l'argomento ti interessa, buttati. È più accessibile di quanto sembri.
