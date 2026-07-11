---
title: "J'ai créé une IA qui joue à Super Mario World toute seule -- comment ça marche"
description: >
  Décryptage complet du projet de Laupok : une intelligence artificielle basée sur
  l'algorithme NEAT qui apprend à jouer à Super Mario World en autonomie.
  Algorithmes génétiques, réseaux de neurones, évolution de topologie,
  et pas moins de 4200 lignes de Lua.
date: 2026-07-11
tags:
  - artificial-intelligence
  - lua
  - genetic-algorithm
  - neural-network
  - neat
  - emulation
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "MEAEsk0xUqsbwxASYQlWGJmdZmI2Ex/L9XiR6iyuNWjflmByatiiVgC2Xe9bWk006uwH+yUABbY7F2KwZScKIw=="
---

# J'ai créé une IA qui joue à Super Mario World toute seule -- comment ça marche

Laupok a créé une intelligence artificielle qui joue à **Super Mario World** de manière totalement autonome. Pas de script prédéfini, pas de frames à enregistrer. L'IA apprend seule, à coups de mutations aléatoires et de sélection naturelle, à finir les niveaux du jeu. Le projet tourne sur **BizHawk**, un émulateur multiplateforme, via un script Lua d'environ **4200 lignes**.

Ce qui rend ce projet fascinant, c'est qu'il repose sur des concepts biologiques appliqués à l'informatique : la **théorie de l'évolution de Darwin**, les **réseaux de neurones artificiels**, et surtout un algorithme spécifique appelé **NEAT** (NeuroEvolution of Augmenting Topologies). L'IA ne connaît rien au jeu au départ. Elle teste des trucs au hasard, échoue des milliers de fois, et petit à petit, elle comprend comment avancer, sauter, et survivre.

Dans cet article, on va décortiquer tout ça -- concept par concept, ligne de code par ligne de code.

![Laupok introduit l'algorithme NEAT devant la caméra](/images/laupok-mario-ai/neat-title.jpg)

---

## Le setup : BizHawk, Lua, et Super Mario World

### L'émulateur BizHawk

BizHawk est un émulateur open source qui supporte une tonne de consoles -- NES, SNES, Genesis, PS1, Game Boy, et bien d'autres. Sa particularité, c'est qu'il permet de lancer des **scripts Lua** en parallèle du jeu. Ces scripts ont accès à la **mémoire vive** (RAM) de l'émulation, ce qui signifie qu'ils peuvent lire -- et modifier -- n'importe quelle donnée du jeu en temps réel.

Concrètement, ça veut dire qu'on peut :
- Lire la position de Mario dans le niveau
- Savoir quels sprites (ennemis, items) sont à l'écran
- Connaître l'état de chaque tile (bloc) autour de Mario
- Contrôler la manette -- appuyer sur n'importe quel bouton

C'est exactement ce dont on a besoin pour faire jouer une IA.

### Les adresses mémoire de Super Mario World

Dans la RAM de Super Mario World, chaque donnée est stockée à une adresse spécifique. C'est un peu comme un quartier : chaque adresse correspond à une "maison" qui contient une information. Par exemple :

| Adresse | Donnée |
|---------|--------|
| `0x94`-`0x95` | Position X de Mario (16 bits, little-endian) |
| `0x96`-`0x97` | Position Y de Mario |
| `0x14C8`+`i` | État du sprite `i` (>7 = vivant) |
| `0xE4`+`i` | Position X basse du sprite `i` |
| `0x14E0`+`i` | Position X haute du sprite `i` |
| `0xD8`+`i` | Position Y basse du sprite `i` |
| `0x14D4`+`i` | Position Y haute du sprite `i` |
| `0x170B`+`i` | Type de l'extended sprite `i` |
| `0x0100` | État du jeu (12 = niveau fini) |
| `0x13D4` | Pause active |
| `0x0071` | Animation de mort de Mario (9 = mort) |
| `0x1C800`+... | Table des tiles du niveau |

La position des sprites utilise deux octets : un octet "bas" et un octet "haut", parce que la position peut dépasser 255 pixels. La formule est toujours `bas + haut × 256`.

Pour les tiles, c'est plus complexe : l'adresse de base est `0x1C800`, et on calcule l'offset en fonction des coordonnées `x` et `y` de la tile dans le monde, avec un pas de 16 pixels par tile.

![Super Mario World avec overlay de débogage montrant les adresses mémoire des sprites et la position de Mario](/images/laupok-mario-ai/memory-debug.jpg)

---

## Les bases : algorithmes génétiques et réseaux de neurones

Avant de plonger dans le code, il faut comprendre deux concepts fondamentaux. Sans eux, le reste n'a aucun sens.

### Les algorithmes génétiques

Un algorithme génétique, c'est une simulation de la **théorie de l'évolution**. L'idée centrale : on crée une **population** d'individus, chacun avec des caractéristiques (des "gènes") légèrement différentes. On les fait "vivre" dans un environnement. Ceux qui s'en sortent le mieux survivent et se reproduisent. Ceux qui s'en sortent mal disparaissent.

Laupok illustre ça avec une analogie de **Kirby** :
- Une population de Kirby apparaît sur un terrain avec des piques et des tomates
- Les piques enlèvent des points de vie, les tomates en redonnent
- Chaque Kirby a des gènes : taille, vitesse, points de vie, comportement (fuir, chercher des tomates, foncer n'importe où)

![Double hélice d'ADN avec les étiquettes "le bébé", "taille", "vitesse", "couleur" -- les gènes qui composent un individu](/images/laupok-mario-ai/dna-genes.jpg)

- Après 15 secondes, on regarde qui a survécu le plus longtemps
- Le meilleur Kirby se reproduit avec les autres : les bébés héritent de la moitié des gènes du meilleur et de la moitié du "pire"
- Les bébés subissent des **mutations** aléatoires (un peu plus grand, un peu plus rapide...)
- Les anciens Kirby sont remplacés par les nouveaux
- On relance

Après 180 générations (~15 heures), les Kirby passent de 15 secondes de survie à **15 minutes**. Ils sont devenus petits (zone de collision réduite), rapides, et fuient le danger en permanence.

![Simulation Kirby génération 0 : des cercles colorés dispersés aléatoirement sur un fond noir, tous de taille similaire](/images/laupok-mario-ai/kirby-gen0.jpg)

![Simulation Kirby génération 1866 : les Kirby sont plus petits, plus rapides, et fuient systématiquement les dangers](/images/laupok-mario-ai/kirby-gen1866.jpg)

![Statistiques de la simulation Kirby : fitness, nombre de points de vie, comportement de chaque individu classés par performance](/images/laupok-mario-ai/kirby-stats.jpg)

Le point crucial : **on ne définit pas la solution**. L'algorithme la **trouve tout seul**. Et c'est exactement ça qui le rend puissant pour des problèmes où on ne sait pas quelle combinaison de paramètres serait optimale.

### Les réseaux de neurones artificiels

Un réseau de neurones, c'est un modèle mathématique simplifié du cerveau humain. Il se compose de :
- **Neurones d'entrée** (inputs) : ce que le réseau "voit"
- **Neurones de sortie** (outputs) : ce que le réseau "décide"
- **Connexions** (poids) : chaque connexion a un **poids** qui amplifie ou atténue le signal

Le principe est simple : chaque neurone d'entrée envoie sa valeur. Elle est multipliée par le poids de la connexion, puis additionnée aux autres signaux. Si le résultat dépasse un certain seuil (la **fonction d'activation**), le neurone de sortie s'active.

Dans l'analogie de Laupok avec Mario et le bout de la souris :
- Le neurone d'entrée = la distance entre Mario et le bout
- Le poids de la connexion = la sensibilité de Mario
- Le neurone de sortie = Mario crie ou pas

Plus le bout est proche, plus la valeur d'entrée est élevée. Si le poids est fort, le signal envoyé en sortie est fort, et Mario crierait. En modifiant le poids, on modifie la sensibilité de Mario.

![Démo "Mario a peur" : Mario face à un Boo avec une barre de synapse affichant le poids de la connexion entre l'entrée et la sortie](/images/laupok-mario-ai/mario-fear-demo.jpg)

Dans le vrai réseau de neurones de l'IA, c'est la même logique, mais à une échelle massive :
- **99 neurones d'entrée** (11×9 tiles de la vue de Mario)
- **8 neurones de sortie** (A, B, X, Y, Haut, Bas, Gauche, Droite)
- Des **neurones cachés** (hidden) entre les deux
- Des centaines de connexions avec des poids variés

---

## NEAT : l'algorithme qui change tout

### Le problème des algorithmes génétiques classiques

Si on combine un algorithme génétique avec un réseau de neurones de manière naïve, on a un problème : on crée 100 réseaux de neurones complètement différents, et on ne sait pas les comparer. Chacun a ses propres neurones, ses propres connexions, ses propres poids. Comment savoir si deux réseaux sont "proches" ou "loin" ?

C'est là qu'intervient **NEAT** -- NeuroEvolution of Augmenting Topologies. Inventé par **Kenneth Stanley** et **Risto Miikkulainen** en 2002, c'est un algorithme qui résout exactement ce problème.

### Les espèces

Le premier mécanisme clé de NEAT, ce sont les **espèces**. Quand un réseau de neurones devient trop différent d'un autre, il est classé dans une espèce différente. La similarité est calculée via trois paramètres :

1. **Excess** (`EXCES_COEF = 0.50`) : le nombre de connexions qui n'ont aucun rapport entre deux réseaux (innovations différentes)
2. **Disjoint** : pareil, mais pour les connexions qui se situent au milieu
3. **Weight difference** (`POIDSDIFF_COEF = 0.92`) : la différence de poids moyenne entre les connexions partageant la même innovation

La formule de score :

```
score = (EXCES_COEF × disjoint) / max(nbConnexions1 + nbConnexions2, 1)
      + POIDSDIFF_COEF × diffPoids
```

Si ce score est inférieur à `DIFF_LIMITE` (1.0), les deux réseaux sont dans la même espèce. Sinon, on crée une nouvelle espèce.

### Les innovations

C'est le génie de NEAT. Chaque fois qu'une connexion est créée, elle reçoit un numéro d'**innovation** unique et global. Ce numéro suit le réseau de neurones même quand il se reproduit.

Concrètement, quand un bébé est créé par crossover, il hérite des innovations de ses parents. Si deux réseaux partagent la même innovation, ça veut dire qu'ils ont une connexion qui vient du même ancêtre. C'est ce qui permet de comparer des réseaux de tailles différentes.

### Le crossover

Quand deux réseaux de neurones se reproduisent, le **crossover** fonctionne ainsi :

![Laupok explique le concept de crossover avec le texte "CROSSOVER" en overlay](/images/laupok-mario-ai/crossover-label.jpg)

1. Le réseau le plus performant devient le "parent dominant"
2. Le bébé hérite de toutes les connexions du dominant
3. Pour chaque connexion partageant la même innovation, l'autre parent peut la remplacer (50% de chances)
4. Seules les connexions actives du parent non-dominant peuvent remplacer

Ça garantit que le bébé est toujours au moins aussi bon que le meilleur parent.

### Les mutations

Après le crossover, le bébé subit des mutations avec des probabilités configurables :

![Laupok explique les mutations avec le texte "(petite modif = mutation)" en overlay](/images/laupok-mario-ai/mutation-label.jpg)

| Mutation | Probabilité | Effet |
|----------|------------|-------|
| Reset poids connexion | 25% | Le poids est totalement randomisé |
| Mutation poids | 95% | Le poids varie de ±0.80 |
| Ajout connexion | 85% | Nouvelle connexion entre deux neurones pas encore liés |
| Ajout neurone | 39% | Un neurone caché est inséré entre deux neurones connectés |

Le taux d'ajout de neurone est important : c'est ce qui permet au réseau de **grandir**. Au départ, il n'y a que des entrées et des sorties. Progressivement, des neurones cachés apparaissent, rendant le réseau de plus en plus complexe.

---

## Le code : walkthrough complet

### Les constantes

Le script commence par un bloc de constantes qui définissent tout le paramétrage :

```lua
-- Vue de Mario autour de lui
TAILLE_TILE = 16
TAILLE_VUE_W = TAILLE_TILE * 11  -- 176 pixels en largeur
TAILLE_VUE_H = TAILLE_TILE * 9   -- 144 pixels en hauteur
NB_TILE_W = TAILLE_VUE_W / TAILLE_TILE  -- 11 tiles
NB_TILE_H = TAILLE_VUE_H / TAILLE_TILE  -- 9 tiles

-- Réseau de neurones
NB_INPUT = NB_TILE_W * NB_TILE_H  -- 99 inputs (tiles visibles)
NB_OUTPUT = 8  -- A, B, X, Y, Haut, Bas, Gauche, Droite
NB_INDIVIDU_POPULATION = 100  -- individus par population
NB_NEURONE_MAX = 100000  -- limite de neurones cachés

-- Fitness
FITNESS_LEVEL_FINI = 1000000  -- valeur quand le niveau est terminé
NB_FRAME_RESET_BASE = 33  -- frames sans progrès avant reset
NB_FRAME_RESET_PROGRES = 300  -- frames si progrès détecté

-- Espèces
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

Le `NB_INPUT` est de 99 parce que la vue de Mario fait 11×9 tiles. Chaque tile est un neurone d'entrée. Si la tile est vide, elle vaut 0. Si c'est un bloc, elle vaut 1. Si c'est un ennemi, elle vaut -1.

Les 8 sorties correspondent aux boutons de la manette SNES : A, B, X, Y, Haut, Bas, Gauche, Droite. On exclut Start, Select, L et R pour pas "distract" Mario.

### Les structures de données

Le script définit trois structures principales :

```lua
function newNeurone()
    local neurone = {}
    neurone.valeur = 0    -- valeur actuelle du neurone
    neurone.id = 0        -- identifiant unique
    neurone.type = ""     -- "input", "output", ou "hidden"
    return neurone
end

function newConnexion()
    local connexion = {}
    connexion.entree = 0     -- ID du neurone source
    connexion.sortie = 0     -- ID du neurone destination
    connexion.actif = true   -- peut être désactivé si un neurone caché est inséré
    connexion.poids = 0      -- poids de la connexion
    connexion.innovation = 0 -- numéro d'innovation unique
    connexion.allume = false -- pour l'affichage : true si le signal passe
    return connexion
end

function newReseau()
    local reseau = {
        nbNeurone = 0,        -- nombre de neurones cachés
        fitness = 1,          -- performance (distance parcourue)
        idEspeceParent = 0,   -- à quelle espèce il appartient
        lesNeurones = {},     -- tableau de neurones
        lesConnexions = {}    -- tableau de connexions
    }
    -- Initialisation avec les inputs
    for j = 1, NB_INPUT, 1 do
        ajouterNeurone(reseau, j, "input", 1)
    end
    -- Puis les outputs
    for j = NB_INPUT + 1, NB_INPUT + NB_OUTPUT, 1 do
        ajouterNeurone(reseau, j, "output", 0)
    end
    return reseau
end
```

Au départ, chaque réseau n'a que des inputs et des outputs. Pas de neurones cachés, pas de connexions. C'est l'algorithme qui va décider s'il en faut.

### Les mutations en détail

#### Mutation des poids

```lua
function mutationPoidsConnexions(unReseau)
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            if math.random() < CHANCE_MUTATION_RESET_CONNEXION then
                -- 25% : reset total du poids
                unReseau.lesConnexions[i].poids = genererPoids()
            else
                -- 75% : variation de ±0.80
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

Le poids initial est toujours 1 ou -1 (`genererPoids()`). La variation de ±0.80 peut le faire osciller entre des valeurs négatives et positives, ce qui change radicalement le comportement du réseau.

#### Ajout de connexion

```lua
function mutationAjouterConnexion(unReseau)
    local liste = {}
    -- Randomisation de la liste des neurones
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
                -- Connexion valide : input→output, hidden→hidden, hidden→output
                if (n1.type == "input" and n2.type == "output") or
                   (n1.type == "hidden" and n2.type == "hidden") or
                   (n1.type == "hidden" and n2.type == "output") then
                    -- Vérifier qu'il n'y a pas déjà une connexion
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

On ne peut pas connecter un output à un input (ça créerait un cycle), et on ne peut pas connecter deux neurones déjà liés. La randomisation garantit qu'on explore différentes possibilités à chaque fois.

#### Ajout de neurone

C'est la mutation la plus intéressante :

```lua
function mutationAjouterNeurone(unReseau)
    if #unReseau.lesConnexions == 0 then return nil end
    if unReseau.nbNeurone == NB_NEURONE_MAX then return nil end

    -- Randomisation des connexions
    local listeRandom = {}
    for i = 1, #unReseau.lesConnexions, 1 do
        local pos = math.random(1, #listeRandom+1)
        table.insert(listeRandom, pos, i)
    end

    for i = 1, #listeRandom, 1 do
        if unReseau.lesConnexions[listeRandom[i]].actif then
            -- Désactiver la connexion existante
            unReseau.lesConnexions[listeRandom[i]].actif = false
            unReseau.nbNeurone = unReseau.nbNeurone + 1
            local indice = unReseau.nbNeurone + NB_INPUT + NB_OUTPUT

            -- Créer le neurone caché
            ajouterNeurone(unReseau, indice, "hidden", 1)

            -- Connecter l'entrée au neurone caché
            ajouterConnexion(unReseau,
                unReseau.lesConnexions[listeRandom[i]].entree,
                indice, genererPoids())

            -- Connecter le neurone caché à la sortie
            ajouterConnexion(unReseau,
                indice,
                unReseau.lesConnexions[listeRandom[i]].sortie,
                genererPoids())
            break
        end
    end
end
```

Le mécanisme : on prend une connexion existante, on la **désactive**, et on insère un neurone caché au milieu. La connexion d'origine est remplacée par deux nouvelles connexions : entrée→caché et caché→sortie. C'est comme si on "coupait" un fil pour intercaler un interrupteur.

C'est ce qui rend NEAT "augmenting topologies" : le réseau **grandit** avec le temps. Il commence simple et devient complexe uniquement si c'est nécessaire.

### Le feedForward

C'est la fonction qui propage les signaux à travers le réseau :

```lua
function feedForward(unReseau)
    -- Reset des neurones de sortie
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

Chaque connexion active envoie `valeur_entrée × poids` vers le neurone de sortie. La valeur est **cumulée** (additionnée). Le drapeau `allume` est juste pour l'affichage visuel du réseau.

### La lecture de la mémoire du jeu

La fonction `getLesInputs()` est celle qui traduit le monde de Super Mario World en données compréhensibles par le réseau :

```lua
function getLesInputs()
    local lesInputs = {}
    -- Initialisation à 0 (gris = rien)
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            lesInputs[getIndiceLesInputs(i, j)] = 0
        end
    end

    -- Les sprites (ennemis) = -1 (noir)
    local lesSprites = getLesSprites()
    for i = 1, #lesSprites, 1 do
        local input = convertirPositionPourInput(getLesSprites()[i])
        if input.x > 0 and input.x < (TAILLE_VUE_W / TAILLE_TILE) + 1 then
            lesInputs[getIndiceLesInputs(input.x, input.y)] = -1
        end
    end

    -- Les tiles (blocs) = valeur de la tile (blanc si > 0)
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

La grille d'inputs est une vue centrée sur Mario : 11 tiles en largeur, 9 en hauteur. Chaque tile vaut :
- **0** (gris) : rien
- **1** (blanc) : bloc solide
- **-1** (noir) : ennemi

Les ennemis sont lus depuis deux listes dans la RAM : les sprites normaux (`0x14C8`-`0x14F8`) et les extended sprites (`0x170B`-`0x173B`). Pour chaque sprite vivant (état > 7), on calcule sa position en tiles par rapport à Mario et on met -1 dans la case correspondante.

### Le fitness : comment l'IA sait si elle progresse

```lua
function majReseau(unReseau, marioBase)
    local mario = getPositionMario()

    if not niveauFini and memory.readbyte(0x0100) == 12 then
        -- Niveau terminé !
        unReseau.fitness = FITNESS_LEVEL_FINI
        niveauFini = true
    elseif marioBase.x < mario.x then
        -- Mario avance vers la droite
        unReseau.fitness = unReseau.fitness + (mario.x - marioBase.x)
        marioBase.x = mario.x
    end

    -- Mise à jour des inputs
    local lesInputs = getLesInputs()
    for i = 1, NB_INPUT, 1 do
        unReseau.lesNeurones[i].valeur = lesInputs[i]
    end
end
```

La fitness est simple : c'est la **distance parcourue vers la droite**. Si Mario avance de 10 pixels, la fitness augmente de 10. Si Mario recule, rien ne se passe (pas de pénalité). Si le niveau est terminé (adresse `0x0100` == 12), la fitness devient 1 000 000.

C'est intentionnellement simple. Pas de bonus pour les ennemis tués, pas de pénalité pour la mort. Juste : avance vers la droite.

### Le reset intelligent

Si Mario ne bouge pas pendant 33 frames, on reset le niveau et on passe à l'individu suivant. Mais si Mario a fait des progrès (sa fitness actuelle est différente de celle au début), on attend 300 frames -- ça donne une chance au réseau de "comprendre" ce qu'il a fait de bien.

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

La condition `memory.readbyte(0x0071) ~= 9` vérifie que Mario n'est pas en animation de mort. Pas la peine de resetter si Mario est déjà mort.

### La boucle principale

La boucle tourne à 30 fps (la vitesse normale de Super Mario World) :

```lua
while true do
    local fitnessAvant = laPopulation[idPopulation].fitness

    -- Affichage (réseau, infos)
    if forms.ischecked(estAccelere) then
        emu.limitframerate(false)  -- accélérer
    else
        emu.limitframerate(true)   -- 30 fps
    end

    -- Les 3 fonctions vitales
    majReseau(laPopulation[idPopulation], marioBase)
    feedForward(laPopulation[idPopulation])
    appliquerLesBoutons(laPopulation[idPopulation])

    emu.frameadvance()
    nbFrame = nbFrame + 1

    -- Reset si pas de progrès
    -- ...
    -- Nouvelle génération si tous les individus testés
    -- ...
end
```

Les trois fonctions vitales sont `majReseau`, `feedForward`, et `appliquerLesBoutons`. Si on en désactive une seule, Mario ne bouge plus.

### Le crossover

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

Le bébé hérite du meilleur parent. Pour chaque connexion partageant la même innovation, l'autre parent a 50% de chances de la remplacer -- mais **seulement si la connexion est active**. C'est un correctif important : sans ça, des neurones cachés inutiles pouvaient être créés.

### La sélection par espèces

```lua
function nouvelleGeneration(laPopulation, lesEspeces)
    local laNouvellePopulation = newPopulation()
    local nbIndividuACreer = NB_INDIVIDU_POPULATION

    -- Calcul fitness moyenne par espèce
    for i = 1, #lesEspeces, 1 do
        lesEspeces[i].fitnessMoyenne = 0
        for j = 1, #lesEspeces[i].lesReseaux, 1 do
            lesEspeces[i].fitnessMoyenne =
                lesEspeces[i].fitnessMoyenne + lesEspeces[i].lesReseaux[j].fitness
        end
        lesEspeces[i].fitnessMoyenne =
            lesEspeces[i].fitnessMoyenne / #lesEspeces[i].lesReseaux
    end

    -- Chaque espèce crée un nombre d'enfants proportionnel à sa fitness moyenne
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

L'idée : une espèce avec une fitness moyenne de 10 000 a le droit de créer beaucoup plus d'enfants qu'une espèce avec une fitness moyenne de 1. C'est la **sélection naturelle** en action.

Le `choisirParent` utilise une sélection par roulette : plus un individu a de fitness, plus il a de chances d'être sélectionné comme parent.

### La sauvegarde et le chargement

Les populations sont sauvegardées dans des fichiers `.pop` :

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

La sauvegarde inclut aussi le meilleur individu de toutes les populations précédentes. Si le meilleur de l'ancienne population est meilleur que le meilleur de la nouvelle, on reprend l'ancien comme base. C'est une forme d'**élitisme** : on ne perd jamais le meilleur.

### Le dessin du réseau

Laupok a ajouté un visualiseur du réseau de neurones en surimpression du jeu :

```lua
function dessinerUnReseau(unReseau)
    -- Inputs : grille 11×9 autour de Mario
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            local xT = ENCRAGE_X_INPUT + (i - 1) * TAILLE_INPUT
            local yT = ENCRAGE_Y_INPUT + (j - 1) * TAILLE_INPUT
            local couleurFond = "gray"
            if unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur < 0 then
                couleurFond = "black"   -- ennemi
            elseif unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur > 0 then
                couleurFond = "white"   -- bloc
            end
            gui.drawRectangle(xT, yT, TAILLE_INPUT, TAILLE_INPUT, "black", couleurFond)
        end
    end

    -- Outputs : 8 boutons
    for i = 1, NB_OUTPUT, 1 do
        local xT = ENCRAGE_X_OUTPUT
        local yT = ENCRAGE_Y_OUTPUT + ESPACE_Y_OUTPUT * (i - 1)
        if sigmoid(unReseau.lesNeurones[i + NB_INPUT].valeur) then
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "white")
        else
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "black")
        end
    end

    -- Connexions
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

C'est super utile pour comprendre ce que le réseau fait. Les connexions actives sont blanches, les inactives sont semi-transparentes. Les inputs sont une grille de cases blanches/noires/grises. Les outputs montrent quels boutons sont enfoncés.

---

## Les résultats

### Ce que l'IA a appris

Au fil des heures (et des jours) d'exécution, l'IA a découvert par elle-même :

1. **Avancer vers la droite** : le comportement le plus basique, mais qui nécessite de maintenir le bouton Droite enfoncé
2. **Sauter par-dessus les ennemis** : en connectant un input "ennemi détecté" au bouton A ou B
3. **Éviter les obstacles** : certains réseaux ont appris à reculer temporairement pour mieux avancer
4. **Finir des niveaux** : le meilleur individu a pu terminer le premier niveau de Super Mario World

![Mario contrôlé par l'IA face à un Boo dans un niveau de Super Mario World -- le réseau de neurones décide des actions en temps réel](/images/laupok-mario-ai/mario-ai-playing.jpg)

### Les Limitations

Le projet a ses limites :

- **Un seul niveau** : l'IA est entraînée sur un seul niveau spécifique. Elle ne généralise pas automatiquement à d'autres niveaux
- **Temps d'entraînement** : il faut des dizaines d'heures pour atteindre des résultats satisfaisants
- **Pas de compréhension** : l'IA ne "comprend" pas ce qu'elle fait. Elle optimise une fonction de fitness (distance parcourue) via des mutations aléatoires
- **T-bagging** : Laupok note que Mario a tendance à sauter sur place quand il voit un ennemi, simplement parce que ça augmente la fitness (il avance un peu en sautant)

---

## Comment reproduire l'expérience

Laupok a tout partagé. Voici les étapes :

1. **Télécharger BizHawk** sur [tasvideos.org](https://tasvideos.org/BizHawk) (section Download)
2. **Obtenir une ROM USA de Super Mario World** (copie privée de ta propre cartouche)
3. **Télécharger le script Lua** depuis [Pastebin](https://pastebin.com/Jcvdqhqm) -- renommer en `mario.lua`
4. **Placer le script dans le même dossier que la ROM**
5. **Lancer BizHawk**, ouvrir la ROM
6. **Dans la console Lua** : `dofile("mario.lua")` ou via le menu Script > Open Script
7. **Sauvegarder un state** au début du niveau (menu Savestate > Save State) et le nommer `debut.state`
8. **Relancer le script** -- ça marche

Le script inclut un formulaire avec des options :
- **Accélérer** : désactive la limite de 30 fps pour aller plus vite
- **Afficher réseau** : montre le réseau de neurones en surimpression
- **Afficher infos** : affiche un bandeau avec la génération, la fitness, le nombre d'espèces
- **Pause** : met en pause l'exécution
- **Sauvegarder/Charger** : persiste la population actuelle dans un fichier `.pop`

---

## Sources et références

| Ressource | Lien |
|-----------|------|
| Vidéo principale de Laupok | [j'ai créé une IA qui joue à mario toute seule](https://www.youtube.com/watch?v=F63GNXGHVwM) |
| Vidéo code review + setup | [comment setup l'ia + code source review](https://www.youtube.com/watch?v=u5xCl1bSe6o) |
| Code source complet | [Pastebin Jcvdqhqm](https://pastebin.com/Jcvdqhqm) |
| Article original de NEAT | Stanley & Miikkulainen, "Evolving Neural Networks through Augmenting Topologies", 2002 |
| Tutoriel de N8Programs | [NEAT implementation walkthrough](https://n8programs.github.io/) (JavaScript, mais les concepts sont identiques) |
| 16blings (inspiration de Laupok) | [AI plays Super Mario World](https://www.youtube.com/watch?v=qv6IFaOz3bA) |
| BizHawk | [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) |
| Mémoire de Super Mario World | [SMW Central - RAM Map](https://www.smwcentral.net/?p=section&a=details&id=21702) |

---

## Conclusion

Ce que Laupok a fait, c'est prendre un algorithme académique (NEAT, 2002), le réécrire en Lua pour un émulateur (BizHawk), et l'appliquer à Super Mario World. Le résultat : une IA qui apprend de zéro à jouer au jeu, sans aucune connaissance préalable, uniquement par mutations aléatoires et sélection naturelle.

C'est un exemple magnifique de la puissance des algorithmes génétiques. Pas besoin de deep learning, pas besoin de GPU, pas besoin de millions de données d'entraînement. Juste de la sélection naturelle, un peu de Lua, et beaucoup de patience.

Le code est commenté, partagé, et Laupok a fait deux vidéos explicatives -- une pour les grands concepts, une pour le code. Si le sujet t'intéresse, plonge dedans. C'est plus accessible qu'il n'y paraît.
