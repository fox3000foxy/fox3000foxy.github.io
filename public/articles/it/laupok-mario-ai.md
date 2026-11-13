---
title: "Laupok ha creato un'IA che gioca a Super Mario World da sola: come funziona"

date: 2026-07-11
tags:
  - ai
  - lua
  - emulation
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "xDA6gmM0vyT1/6IiYYTqia+hOJqCOxYH1TKt0JrL5WcR9wkR7dcUwLm2BThLHIZPck2MMa2iiW4I732HXD3BFA=="
---

# Laupok ha creato un'IA che gioca a Super Mario World da sola: come funziona

Laupok ha creato un'intelligenza artificiale che gioca a **Super Mario World** in modo totalmente autonomo. Parte da zero: nessuno script predefinito, nessun frame registrato. L'IA impara da sola, a colpi di mutazioni casuali e selezione naturale, a finire i livelli del gioco. Il progetto gira su **BizHawk**, un emulatore multipiattaforma, via uno script Lua di circa **4200 righe**.

Ciò che rende questo progetto affascinante, è che poggia su concetti biologici applicati all'informatica: la **teoria dell'evoluzione di Darwin**, le **reti neurali artificiali**, e soprattutto un algoritmo specifico chiamato **NEAT** (NeuroEvolution of Augmenting Topologies). L'IA non sa niente del gioco all'inizio. Prova azioni a caso, fallisce migliaia di volte, e piano piano capisce come avanzare, saltare, e sopravvivere.

In questo articolo, smontiamo tutto questo: concetto per concetto, riga di codice per riga di codice.

![Laupok introduit l'algorithme NEAT devant la caméra](/images/laupok-mario-ai/neat-title.jpg)

---

## Il setup: BizHawk, Lua, e Super Mario World

### L'emulatore BizHawk

BizHawk è un emulatore open source che supporta una tonnellata di console: NES, SNES, Genesis, PS1, Game Boy, e molte altre. La sua particolarità, è che permette di lanciare **script Lua** in parallelo al gioco. Questi script hanno accesso alla **memoria viva** (RAM) dell'emulazione, il che significa che possono leggere, e modificare, qualsiasi dato del gioco in tempo reale.

In concreto, vuol dire che possiamo:
- Leggere la posizione di Mario nel livello
- Sapere quali sprite (nemici, item) sono a schermo
- Conoscere lo stato di ogni tile (blocco) intorno a Mario
- Controllare il pad: premere qualsiasi pulsante

È esattamente ciò di cui abbiamo bisogno per far giocare un'IA.

### Gli indirizzi memoria di Super Mario World

Nella RAM di Super Mario World, ogni dato è salvato a un indirizzo specifico. È un po' come un quartiere: ogni indirizzo corrisponde a una "casa" che contiene un'informazione. Per esempio:

| Indirizzo | Dato |
|---------|--------|
| `0x94`-`0x95` | Posizione X di Mario (16 bit, little-endian) |
| `0x96`-`0x97` | Posizione Y di Mario |
| `0x14C8`+`i` | Stato dello sprite `i` (>7 = vivo) |
| `0xE4`+`i` | Posizione X bassa dello sprite `i` |
| `0x14E0`+`i` | Posizione X alta dello sprite `i` |
| `0xD8`+`i` | Posizione Y bassa dello sprite `i` |
| `0x14D4`+`i` | Posizione Y alta dello sprite `i` |
| `0x170B`+`i` | Tipo dell'extended sprite `i` |
| `0x0100` | Stato del gioco (12 = livello finito) |
| `0x13D4` | Pausa attiva |
| `0x0071` | Animazione di morte di Mario (9 = morte) |
| `0x1C800`+... | Tabella delle tile del livello |

La posizione degli sprite usa due byte: un byte "basso" e un byte "alto", perché la posizione può superare 255 pixel. La formula è sempre `basso + alto × 256`.

Per le tile, è più complesso: l'indirizzo di base è `0x1C800`, e si calcola l'offset in base alle coordinate `x` e `y` della tile nel mondo, con un passo di 16 pixel per tile.

![Super Mario World avec overlay de débogage montrant les adresses mémoire des sprites et la position de Mario](/images/laupok-mario-ai/memory-debug.jpg)

---

## Le basi: algoritmi genetici e reti neurali

Prima di tuffarci nel codice, bisogna capire due concetti fondamentali. Senza, il resto non ha senso.

### Gli algoritmi genetici

Un algoritmo genetico, è una simulazione della **teoria dell'evoluzione**. L'idea centrale: creiamo una **popolazione** di individui, ognuno con caratteristiche (i "geni") leggermente diverse. Li facciamo "vivere" in un ambiente. Quelli che se la cavano meglio sopravvivono e si riproducono. Quelli che se la cavano male spariscono.

Laupok lo illustra con un'analogia di **Kirby**:
- Una popolazione di Kirby appare su un terreno con spuntoni e pomodori
- Gli spuntoni tolgono punti vita, i pomodori ne ridanno
- Ogni Kirby ha geni: taglia, velocità, punti vita, comportamento (fuggire, cercare pomodori, andare a caso)
- Dopo 15 secondi, guardiamo chi è sopravvissuto più a lungo
- Il miglior Kirby si riproduce con gli altri: i bebè ereditano metà dei geni del migliore e metà del "peggiore"
- I bebè subiscono **mutazioni** casuali (un po' più grande, un po' più rapido...)
- I vecchi Kirby sono sostituiti dai nuovi
- Si rilancia

![Double hélice d'ADN avec les étiquettes "le bébé", "taille", "vitesse", "couleur" -- les gènes qui composent un individu](/images/laupok-mario-ai/dna-genes.jpg)

Dopo 180 generazioni (circa 15 ore), i Kirby passano da 15 secondi di sopravvivenza a **15 minuti**. Sono diventati piccoli (zona di collisione ridotta), rapidi, e fuggono il pericolo in permanenza.

![Simulation Kirby génération 0 : des cercles colorés dispersés aléatoirement sur un fond noir, tous de taille similaire](/images/laupok-mario-ai/kirby-gen0.jpg)

![Simulation Kirby génération 1866 : les Kirby sont plus petits, plus rapides, et fuient systématiquement les dangers](/images/laupok-mario-ai/kirby-gen1866.jpg)

![Statistiques de la simulation Kirby : fitness, nombre de points de vie, comportement de chaque individu classés par performance](/images/laupok-mario-ai/kirby-stats.jpg)

Il punto cruciale: **non definiamo la soluzione**. L'algoritmo la **trova da solo**. Ed è esattamente ciò che lo rende potente per problemi dove non sappiamo quale combinazione di parametri sarebbe ottimale.

### Le reti neurali artificiali

Una rete neurale, è un modello matematico semplificato del cervello umano. Si compone di:
- **Neuroni di ingresso** (input): ciò che la rete "vede"
- **Neuroni di uscita** (output): ciò che la rete "decide"
- **Connessioni** (pesi): ogni connessione ha un **peso** che amplifica o attenua il segnale

Il principio è semplice: ogni neurone di ingresso invia il suo valore. È moltiplicato per il peso della connessione, poi sommato agli altri segnali. Se il risultato supera una certa soglia (la **funzione di attivazione**), il neurone di uscita si attiva.

Nell'analogia di Laupok con Mario e il pezzo di topo:
- Il neurone di ingresso = la distanza tra Mario e il pezzo
- Il peso della connessione = la sensibilità di Mario
- Il neurone di uscita = Mario urla o no

Più il pezzo è vicino, più il valore di ingresso è alto. Se il peso è forte, il segnale inviato in uscita è forte, e Mario urlerebbe. Modificando il peso, modifichi la sensibilità di Mario.

![Démo "Mario a peur" : Mario face à un Boo avec une barre de synapse affichant le poids de la connexion entre l'entrée et la sortie](/images/laupok-mario-ai/mario-fear-demo.jpg)

Nella vera rete neurale dell'IA, è la stessa logica, ma su scala massiccia:
- **99 neuroni di ingresso** (11×9 tile della vista di Mario)
- **8 neuroni di uscita** (A, B, X, Y, Su, Giù, Sinistra, Destra)
- **Neuroni nascosti** (hidden) tra i due
- Centinaia di connessioni con pesi vari

---

## NEAT: l'algoritmo che cambia tutto

### Il problema degli algoritmi genetici classici

Se combiniamo un algoritmo genetico con una rete neurale in modo ingenuo, abbiamo un problema: creiamo 100 reti neurali completamente diverse, e non sappiamo confrontarle. Ognuna ha i suoi neuroni, le sue connessioni, i suoi pesi. Come sapere se due reti sono "vicine" o "lontane"?

È lì che interviene **NEAT**: NeuroEvolution of Augmenting Topologies. Inventato da **Kenneth Stanley** e **Risto Miikkulainen** nel 2002, è un algoritmo che risolve esattamente questo problema.

### Le specie

Il primo meccanismo chiave di NEAT, sono le **specie**. Quando una rete neurale diventa troppo diversa da un'altra, è classificata in una specie diversa. La similarità è calcolata via tre parametri:

1. **Excess** (`EXCES_COEF = 0.50`): il numero di connessioni che non hanno alcun rapporto tra due reti (innovazioni diverse)
2. **Disjoint**: uguale, ma per le connessioni che stanno nel mezzo
3. **Differenza di peso** (`POIDSDIFF_COEF = 0.92`): la differenza media di peso tra le connessioni che condividono la stessa innovazione

La formula di punteggio:

```
score = (EXCES_COEF × disjoint) / max(nbConnessioni1 + nbConnessioni2, 1)
      + POIDSDIFF_COEF × diffPesi
```

Se questo punteggio è sotto `DIFF_LIMITE` (1.0), le due reti sono nella stessa specie. Altrimenti, si crea una nuova specie.

### Le innovazioni

È il genio di NEAT. Ogni volta che una connessione è creata, riceve un numero di **innovazione** unico e globale. Questo numero segue la rete neurale anche quando si riproduce.

In concreto, quando un bebè è creato per crossover, eredita le innovazioni dei suoi genitori. Se due reti condividono la stessa innovazione, vuol dire che hanno una connessione che viene dallo stesso antenato. È ciò che permette di confrontare reti di taglie diverse.

### Il crossover

Quando due reti neurali si riproducono, il **crossover** funziona così:

![Laupok explique le concept de crossover avec le texte "CROSSOVER" en overlay](/images/laupok-mario-ai/crossover-label.jpg)

1. La rete più performante diventa il "genitore dominante"
2. Il bebè eredita tutte le connessioni del dominante
3. Per ogni connessione che condivide la stessa innovazione, l'altro genitore può sostituirla (50% di probabilità)
4. Solo le connessioni attive del genitore non dominante possono sostituire

Garantisce che il bebè sia sempre almeno bravo quanto il miglior genitore.

### Le mutazioni

Dopo il crossover, il bebè subisce mutazioni con probabilità configurabili:

![Laupok explique les mutations avec le texte "(petite modif = mutation)" en overlay](/images/laupok-mario-ai/mutation-label.jpg)

| Mutazione | Probabilità | Effetto |
|----------|------------|-------|
| Reset peso connessione | 25% | Il peso è totalmente randomizzato |
| Mutazione peso | 95% | Il peso varia di ±0.80 |
| Aggiunta connessione | 85% | Nuova connessione tra due neuroni non ancora collegati |
| Aggiunta neurone | 39% | Un neurone nascosto è inserito tra due neuroni connessi |

Il tasso di aggiunta neurone è importante: è ciò che permette alla rete di **crescere**. All'inizio, ci sono solo ingressi e uscite. Progressivamente, neuroni nascosti appaiono, rendendo la rete sempre più complessa.

---

## Il codice: walkthrough completo

### Le costanti

Lo script inizia con un blocco di costanti che definiscono tutto il setup:

```lua
-- Vista di Mario intorno a lui (11x9 tile)
TAILLE_TILE = 16
TAILLE_VUE_W = TAILLE_TILE * 11  -- 176 pixel in larghezza
TAILLE_VUE_H = TAILLE_TILE * 9   -- 144 pixel in altezza
NB_TILE_W = TAILLE_VUE_W / TAILLE_TILE  -- 11 tile
NB_TILE_H = TAILLE_VUE_H / TAILLE_TILE  -- 9 tile

-- Rete neurale
NB_INPUT = NB_TILE_W * NB_TILE_H  -- 99 input (tile visibili)
NB_OUTPUT = 8  -- A, B, X, Y, Su, Giù, Sinistra, Destra
NB_INDIVIDU_POPULATION = 100  -- individui per popolazione
NB_NEURONE_MAX = 100000  -- limite di neuroni nascosti

-- Fitness
FITNESS_LEVEL_FINI = 1000000  -- valore quando il livello è finito
NB_FRAME_RESET_BASE = 33  -- frame senza progresso prima del reset
NB_FRAME_RESET_PROGRES = 300  -- frame se progresso rilevato

-- Specie
EXCES_COEF = 0.50
POIDSDIFF_COEF = 0.92
DIFF_LIMITE = 1.00

-- Mutazioni
CHANCE_MUTATION_RESET_CONNEXION = 0.25
POIDS_CONNEXION_MUTATION_AJOUT = 0.80
CHANCE_MUTATION_POIDS = 0.95
CHANCE_MUTATION_CONNEXION = 0.85
CHANCE_MUTATION_NEURONE = 0.39
```

Il `NB_INPUT` è 99 perché la vista di Mario fa 11×9 tile. Ogni tile è un neurone di ingresso. Se la tile è vuota, vale 0. Se è un blocco, vale 1. Se è un nemico, vale -1.

Le 8 uscite corrispondono ai pulsanti del pad SNES: A, B, X, Y, Su, Giù, Sinistra, Destra. Escludiamo Start, Select, L e R per limitare le sue decisioni all'essenziale.

### Le strutture dati

Lo script definisce tre strutture principali:

```lua
-- crea un neurone vuoto
function newNeurone()
    local neurone = {}
    neurone.valeur = 0    -- valore attuale del neurone
    neurone.id = 0        -- identificatore unico
    neurone.type = ""     -- "input", "output", o "hidden"
    return neurone
end

-- crea una connessione vuota
function newConnexion()
    local connexion = {}
    connexion.entree = 0     -- ID del neurone sorgente
    connexion.sortie = 0     -- ID del neurone destinazione
    connexion.actif = true   -- può essere disattivata se un neurone nascosto è inserito
    connexion.poids = 0      -- peso della connessione
    connexion.innovation = 0 -- numero di innovazione unico
    connexion.allume = false -- per la visualizzazione: true se il segnale passa
    return connexion
end

-- crea una rete con input e output, senza connessioni
function newReseau()
    local reseau = {
        nbNeurone = 0,        -- numero di neuroni nascosti
        fitness = 1,          -- performance (distanza percorsa)
        idEspeceParent = 0,   -- a quale specie appartiene
        lesNeurones = {},     -- tabella di neuroni
        lesConnexions = {}    -- tabella di connessioni
    }
    -- Inizializzazione con gli input
    for j = 1, NB_INPUT, 1 do
        ajouterNeurone(reseau, j, "input", 1)
    end
    -- Poi gli output
    for j = NB_INPUT + 1, NB_INPUT + NB_OUTPUT, 1 do
        ajouterNeurone(reseau, j, "output", 0)
    end
    return reseau
end
```

All'inizio, ogni rete contiene solo input e output: nessun neurone nascosto, nessuna connessione. È l'algoritmo che deciderà se ne servono.

### Le mutazioni in dettaglio

#### Mutazione dei pesi

```lua
-- muta i pesi: reset totale o variazione ±0.80
function mutationPoidsConnexions(unReseau)
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            if math.random() < CHANCE_MUTATION_RESET_CONNEXION then
                -- 25%: reset totale del peso
                unReseau.lesConnexions[i].poids = genererPoids()
            else
                -- 75%: variazione di ±0.80
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

Il peso iniziale è sempre 1 o -1 (`genererPoids()`). La variazione di ±0.80 può farlo oscillare tra valori negativi e positivi, il che cambia radicalmente il comportamento della rete.

#### Aggiunta di connessione

```lua
-- aggiunge una connessione tra due neuroni non ancora collegati
function mutationAjouterConnexion(unReseau)
    local liste = {}
    -- Randomizzazione della lista dei neuroni
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
                -- Connessione valida: input→output, hidden→hidden, hidden→output
                if (n1.type == "input" and n2.type == "output") or
                   (n1.type == "hidden" and n2.type == "hidden") or
                   (n1.type == "hidden" and n2.type == "output") then
                    -- Verifica che non ci sia già una connessione
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

Non possiamo connettere un output a un input (creerebbe un ciclo), e non possiamo connettere due neuroni già collegati. La randomizzazione garantisce di esplorare possibilità diverse ogni volta.

#### Aggiunta di neurone

È la mutazione più interessante:

```lua
-- inserisce un neurone nascosto nel mezzo di una connessione
function mutationAjouterNeurone(unReseau)
    if #unReseau.lesConnexions == 0 then return nil end
    if unReseau.nbNeurone == NB_NEURONE_MAX then return nil end

    -- Randomizzazione delle connessioni
    local listeRandom = {}
    for i = 1, #unReseau.lesConnexions, 1 do
        local pos = math.random(1, #listeRandom+1)
        table.insert(listeRandom, pos, i)
    end

    for i = 1, #listeRandom, 1 do
        if unReseau.lesConnexions[listeRandom[i]].actif then
            -- Disattiva la connessione esistente
            unReseau.lesConnexions[listeRandom[i]].actif = false
            unReseau.nbNeurone = unReseau.nbNeurone + 1
            local indice = unReseau.nbNeurone + NB_INPUT + NB_OUTPUT

            -- Crea il neurone nascosto
            ajouterNeurone(unReseau, indice, "hidden", 1)

            -- Connette l'ingresso al neurone nascosto
            ajouterConnexion(unReseau,
                unReseau.lesConnexions[listeRandom[i]].entree,
                indice, genererPoids())

            -- Connette il neurone nascosto all'uscita
            ajouterConnexion(unReseau,
                indice,
                unReseau.lesConnexions[listeRandom[i]].sortie,
                genererPoids())
            break
        end
    end
end
```

Il meccanismo: prendiamo una connessione esistente, la **disattiviamo**, e inseriamo un neurone nascosto in mezzo. La connessione di origine è sostituita da due nuove connessioni: ingresso→nascosto e nascosto→uscita. È come se "tagliassimo" un filo per intercalare un interruttore.

È ciò che rende NEAT "augmenting topologies": la rete **cresce** col tempo. Inizia semplice e diventa complessa solo se necessario.

### Il feedForward

È la funzione che propaga i segnali attraverso la rete:

```lua
-- propaga i segnali ingresso→uscita sommandoli
function feedForward(unReseau)
    -- Reset dei neuroni di uscita
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur = 0
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].allume = false
        end
    end

    -- Propagazione
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

Ogni connessione attiva invia `valore_ingresso × peso` verso il neurone di uscita. Il valore è **cumulato** (sommato). Il flag `allume` è solo per la visualizzazione grafica della rete.

### La lettura della memoria del gioco

La funzione `getLesInputs()` è quella che traduce il mondo di Super Mario World in dati comprensibili dalla rete:

```lua
-- costruisce la griglia 11x9: 0 vuoto, 1 blocco, -1 nemico
function getLesInputs()
    local lesInputs = {}
    -- Inizializzazione a 0 (grigio = niente)
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            lesInputs[getIndiceLesInputs(i, j)] = 0
        end
    end

    -- Gli sprite (nemici) = -1 (nero)
    local lesSprites = getLesSprites()
    for i = 1, #lesSprites, 1 do
        local input = convertirPositionPourInput(getLesSprites()[i])
        if input.x > 0 and input.x < (TAILLE_VUE_W / TAILLE_TILE) + 1 then
            lesInputs[getIndiceLesInputs(input.x, input.y)] = -1
        end
    end

    -- Le tile (blocchi) = valore della tile (bianco se > 0)
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

La griglia di input è una vista centrata su Mario: 11 tile in larghezza, 9 in altezza. Ogni tile vale:
- **0** (grigio): niente
- **1** (bianco): blocco solido
- **-1** (nero): nemico

I nemici sono letti da due liste nella RAM: gli sprite normali (`0x14C8`-`0x14F8`) e gli extended sprite (`0x170B`-`0x173B`). Per ogni sprite vivo (stato > 7), calcoliamo la sua posizione in tile rispetto a Mario e mettiamo -1 nella casella corrispondente.

### Il fitness: come l'IA sa se progredisce

```lua
-- aggiorna fitness con la distanza percorsa verso destra
function majReseau(unReseau, marioBase)
    local mario = getPositionMario()

    if not niveauFini and memory.readbyte(0x0100) == 12 then
        -- Livello finito!
        unReseau.fitness = FITNESS_LEVEL_FINI
        niveauFini = true
    elseif marioBase.x < mario.x then
        -- Mario avanza verso destra
        unReseau.fitness = unReseau.fitness + (mario.x - marioBase.x)
        marioBase.x = mario.x
    end

    -- Aggiornamento degli input
    local lesInputs = getLesInputs()
    for i = 1, NB_INPUT, 1 do
        unReseau.lesNeurones[i].valeur = lesInputs[i]
    end
end
```

La fitness è semplice: è la **distanza percorsa verso destra**. Se Mario avanza di 10 pixel, la fitness aumenta di 10. Se Mario indietreggia, non succede niente (nessuna penalità). Se il livello è finito (indirizzo `0x0100` == 12), la fitness diventa 1 000 000.

È volutamente semplice. Solo la progressione verso destra conta: uccidere nemici non rende niente, morire non costa niente.

### Il reset intelligente

Se Mario non si muove per 33 frame, resettiamo il livello e passiamo all'individuo successivo. Ma se Mario ha fatto progressi (la sua fitness attuale è diversa da quella all'inizio), aspettiamo 300 frame: dà una chance alla rete di "capire" cosa ha fatto di bene.

```lua
-- reset se Mario è fermo: 33 frame, 300 se ci sono progressi
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

La condizione `memory.readbyte(0x0071) ~= 9` verifica che Mario non sia in animazione di morte. Il reset diventa inutile quando Mario è già in animazione di morte.

### Il ciclo principale

Il ciclo gira a 30 fps (la velocità normale di Super Mario World):

```lua
-- ciclo principale: aggiorna, propaga, premi pulsanti
while true do
    local fitnessAvant = laPopulation[idPopulation].fitness

    -- Visualizzazione (rete, info)
    if forms.ischecked(estAccelere) then
        emu.limitframerate(false)  -- accelerare
    else
        emu.limitframerate(true)   -- 30 fps
    end

    -- Le 3 funzioni vitali
    majReseau(laPopulation[idPopulation], marioBase)
    feedForward(laPopulation[idPopulation])
    appliquerLesBoutons(laPopulation[idPopulation])

    emu.frameadvance()
    nbFrame = nbFrame + 1

    -- Reset se niente progresso
    -- ...
    -- Nuova generazione se tutti gli individui testati
    -- ...
end
```

Le tre funzioni vitali sono `majReseau`, `feedForward`, e `appliquerLesBoutons`. Se ne disattiviamo una sola, Mario non si muove più.

### Il crossover

```lua
-- il bebè eredita dal migliore, l'altro può sostituire al 50%
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

Il bebè eredita dal miglior genitore. Per ogni connessione che condivide la stessa innovazione, l'altro genitore ha il 50% di probabilità di sostituirla: ma **solo se la connessione è attiva**. È una correzione importante: senza, neuroni nascosti inutili potevano essere creati.

### La selezione per specie

```lua
-- ogni specie crea figli in proporzione alla sua fitness media
function nouvelleGeneration(laPopulation, lesEspeces)
    local laNouvellePopulation = newPopulation()
    local nbIndividuACreer = NB_INDIVIDU_POPULATION

    -- Calcolo fitness media per specie
    for i = 1, #lesEspeces, 1 do
        lesEspeces[i].fitnessMoyenne = 0
        for j = 1, #lesEspeces[i].lesReseaux, 1 do
            lesEspeces[i].fitnessMoyenne =
                lesEspeces[i].fitnessMoyenne + lesEspeces[i].lesReseaux[j].fitness
        end
        lesEspeces[i].fitnessMoyenne =
            lesEspeces[i].fitnessMoyenne / #lesEspeces[i].lesReseaux
    end

    -- Ogni specie crea un numero di figli proporzionale alla sua fitness media
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

L'idea: una specie con una fitness media di 10 000 ha il diritto di creare molti più figli di una specie con una fitness media di 1. È la **selezione naturale** in azione.

Il `choisirParent` usa una selezione a roulette: più un individuo ha fitness, più ha probabilità di essere selezionato come genitore.

### Il salvataggio e il caricamento

Le popolazioni sono salvate in file `.pop`:

```lua
-- salva neuroni e connessioni in un file .pop
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

Il salvataggio include anche il miglior individuo di tutte le popolazioni precedenti. Se il migliore della vecchia popolazione è migliore del migliore della nuova, riprendiamo il vecchio come base. È una forma di **elitismo**: non perdiamo mai il migliore.

### Il disegno della rete

Laupok ha aggiunto un visualizzatore della rete neurale in overlay sul gioco:

```lua
-- disegna input, output e connessioni in overlay
function dessinerUnReseau(unReseau)
    -- Input: griglia 11×9 intorno a Mario
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            local xT = ENCRAGE_X_INPUT + (i - 1) * TAILLE_INPUT
            local yT = ENCRAGE_Y_INPUT + (j - 1) * TAILLE_INPUT
            local couleurFond = "gray"
            if unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur < 0 then
                couleurFond = "black"   -- nemico
            elseif unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur > 0 then
                couleurFond = "white"   -- blocco
            end
            gui.drawRectangle(xT, yT, TAILLE_INPUT, TAILLE_INPUT, "black", couleurFond)
        end
    end

    -- Output: 8 pulsanti
    for i = 1, NB_OUTPUT, 1 do
        local xT = ENCRAGE_X_OUTPUT
        local yT = ENCRAGE_Y_OUTPUT + ESPACE_Y_OUTPUT * (i - 1)
        if sigmoid(unReseau.lesNeurones[i + NB_INPUT].valeur) then
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "white")
        else
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "black")
        end
    end

    -- Connessioni
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

È super utile per capire cosa fa la rete. Le connessioni attive sono bianche, le inattive sono semi-trasparenti. Gli input sono una griglia di caselle bianche/nere/grigie. Gli output mostrano quali pulsanti sono premuti.

---

## I risultati

### Cosa l'IA ha imparato

Col passare di ore (e giorni) di esecuzione, l'IA ha scoperto da sola:

1. **Avanzare verso destra**: il comportamento più basico, ma che richiede di tenere premuto il pulsante Destra
2. **Saltare sopra i nemici**: connettendo un input "nemico rilevato" al pulsante A o B
3. **Evitare gli ostacoli**: certe reti hanno imparato a indietreggiare temporaneamente per avanzare meglio
4. **Finire livelli**: il miglior individuo ha potuto finire il primo livello di Super Mario World

![Mario contrôlé par l'IA face à un Boo dans un niveau de Super Mario World -- le réseau de neurones décide des actions en temps réel](/images/laupok-mario-ai/mario-ai-playing.jpg)

### I limiti

Il progetto ha i suoi limiti:

- **Un solo livello**: l'IA è allenata su un solo livello specifico. Non generalizza automaticamente ad altri livelli
- **Tempo di allenamento**: servono decine di ore per raggiungere risultati soddisfacenti
- **Niente comprensione**: l'IA non "capisce" cosa fa. Ottimizza una funzione di fitness (distanza percorsa) via mutazioni casuali
- **T-bagging**: Laupok nota che Mario tende a saltare sul posto quando vede un nemico, semplicemente perché aumenta la fitness (avanza un po' saltando)

---

## Come riprodurre l'esperimento

Laupok ha condiviso tutto. Ecco i passi:

1. **Scarica BizHawk** su [tasvideos.org](https://tasvideos.org/BizHawk) (sezione Download)
2. **Ottieni una ROM USA di Super Mario World** (copia privata della tua cartuccia)
3. **Scarica lo script Lua** da [Pastebin](https://pastebin.com/Jcvdqhqm): rinomina in `mario.lua`
4. **Metti lo script nella stessa cartella della ROM**
5. **Lancia BizHawk**, apri la ROM
6. **Nella console Lua**: `dofile("mario.lua")` o via il menu Script > Open Script
7. **Salva uno state** all'inizio del livello (menu Savestate > Save State) e chiamalo `debut.state`
8. **Rilancia lo script**: funziona

Lo script include un form con opzioni:
- **Accelerare**: disattiva il limite di 30 fps per andare più in fretta
- **Mostra rete**: mostra la rete neurale in overlay
- **Mostra info**: mostra un banner con generazione, fitness, numero di specie
- **Pausa**: mette in pausa l'esecuzione
- **Salva/Carica**: persiste la popolazione attuale in un file `.pop`

---

## Fonti e riferimenti

| Risorsa | Link |
|-----------|------|
| Video principale di Laupok | [ho creato un'IA che gioca a mario da sola](https://www.youtube.com/watch?v=F63GNXGHVwM) |
| Video code review + setup | [come setuppare l'ia + code source review](https://www.youtube.com/watch?v=u5xCl1bSe6o) |
| Codice sorgente completo | [Pastebin Jcvdqhqm](https://pastebin.com/Jcvdqhqm) |
| Articolo originale di NEAT | Stanley e Miikkulainen, "Evolving Neural Networks through Augmenting Topologies", 2002 |
| Tutorial di N8Programs | [NEAT implementation walkthrough](https://n8programs.github.io/) (JavaScript, ma i concetti sono identici) |
| 16blings (ispirazione di Laupok) | [AI plays Super Mario World](https://www.youtube.com/watch?v=qv6IFaOz3bA) |
| BizHawk | [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) |
| Memoria di Super Mario World | [SMW Central - RAM Map](https://www.smwcentral.net/?p=section&a=details&id=21702) |

---

## Conclusione

Ciò che Laupok ha fatto, è prendere un algoritmo accademico (NEAT, 2002), riscriverlo in Lua per un emulatore (BizHawk), e applicarlo a Super Mario World. Il risultato: un'IA che impara da zero a giocare al gioco, senza alcuna conoscenza previa, solo con mutazioni casuali e selezione naturale.

È un esempio magnifico della potenza degli algoritmi genetici. La ricetta sta in tre ingredienti: la selezione naturale, un po' di Lua, e tanta pazienza. Niente deep learning, niente GPU, niente dati di allenamento enormi.

Il codice è commentato, condiviso, e Laupok ha fatto due video esplicativi: uno per i grandi concetti, uno per il codice. Se il tema ti interessa, tuffati dentro. È più accessibile di quanto sembri.

