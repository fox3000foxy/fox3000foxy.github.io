---
title: "Construí uma IA que joga Super Mario World sozinha -- como funciona"
description: "Uma análise aprofundada do projeto de Laupok: uma IA baseada em NEAT que aprende a jogar Super Mario World de forma autônoma. Algoritmos genéticos, redes neurais, neuroevolução de topologias crescentes e 4200 linhas de Lua."
date: 2026-07-11
tags:
  - inteligencia-artificial
  - lua
  - algoritmo-genetico
  - rede-neural
  - neat
  - emulacao
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "NXqIdzz6cv0Rh4qU8DEkiKjP0FV7akcxMpsPd6g361BRU4icoMk3As3IHHltZUbrQUzGuq81dkwJpoCDZWQbZA=="
---

# Construí uma IA que joga Super Mario World sozinha -- como funciona

Laupok construiu uma inteligência artificial que joga **Super Mario World** de forma completamente autônoma. Sem entradas pré-programadas, sem quadros gravados. A IA aprende sozinha, através de mutações aleatórias e seleção natural, para completar os fases do jogo. O projeto roda no **BizHawk**, um emulador multiplataforma, através de um script Lua de aproximadamente **4200 linhas**.

O que torna este projeto fascinante é que ele se baseia em conceitos biológicos aplicados à computação: a **teoria da evolução** de Darwin, **redes neurais artificiais** e, o mais importante, um algoritmo específico chamado **NEAT** (NeuroEvolution of Augmenting Topologies). A IA não sabe nada sobre o jogo no início. Ela tenta coisas aleatórias, falha milhares de vezes e gradualmente descobre como se movimentar, pular e sobreviver.

Neste artigo, vamos analisar tudo -- conceito por conceito, linha de código por linha de código.

![Laupok apresenta o algoritmo NEAT na câmera](/images/laupok-mario-ai/neat-title.jpg)

---

## A configuração: BizHawk, Lua e Super Mario World

### O emulador BizHawk

BizHawk é um emulador de código aberto que suporta muitos consoles -- NES, SNES, Genesis, PS1, Game Boy e muitos outros. Sua característica principal é que ele pode executar **scripts Lua** junto com o jogo. Esses scripts têm acesso à **RAM** (memória de acesso aleatório) da emulação, o que significa que podem ler -- e modificar -- quaisquer dados do jogo em tempo real.

Concretamente, isso significa que você pode:
- Ler a posição de Mario no fase
- Saber quais sprites (inimigos, itens) estão na tela
- Saber o estado de cada tile (bloco) ao redor de Mario
- Controlar o controle -- pressionar qualquer botão

Isso é exatamente o que você precisa para fazer uma IA jogar.

### Endereços de memória de Super Mario World

Na RAM de Super Mario World, cada pedaço de dado é armazenado em um endereço específico. É como um bairro: cada endereço corresponde a uma "casa" que contém uma informação. Por exemplo:

| Endereço | Dado |
|----------|------|
| `0x94`-`0x95` | Posição X de Mario (16 bits, little-endian) |
| `0x96`-`0x97` | Posição Y de Mario |
| `0x14C8`+`i` | Estado do sprite `i` (>7 = vivo) |
| `0xE4`+`i` | Byte baixo da posição X do sprite `i` |
| `0x14E0`+`i` | Byte alto da posição X do sprite `i` |
| `0xD8`+`i` | Byte baixo da posição Y do sprite `i` |
| `0x14D4`+`i` | Byte alto da posição Y do sprite `i` |
| `0x170B`+`i` | Tipo do sprite estendido `i` |
| `0x0100` | Estado do jogo (12 = fase concluída) |
| `0x13D4` | Pausa ativa |
| `0x0071` | Animação da morte de Mario (9 = morto) |
| `0x1C800`+... | Tabela de tiles do fase |

As posições dos sprites usam dois bytes: um byte "baixo" e um byte "alto", porque a posição pode exceder 255 pixels. A fórmula é sempre `baixo + alto × 256`.

Para tiles é mais complexo: o endereço base é `0x1C800` e você calcula o offset baseado nas coordenadas `x` e `y` do tile no mundo, com um passo de 16 pixels por tile.

![Super Mario World com uma sobreposição de depuração mostrando endereços de memória dos sprites e a posição de Mario](/images/laupok-mario-ai/memory-debug.jpg)

---

## O básico: algoritmos genéticos e redes neurais

Antes de mergulhar no código, você precisa entender dois conceitos fundamentais. Sem eles, nada mais faz sentido.

### Algoritmos genéticos

Um algoritmo genético é uma simulação da **teoria da evolução**. A ideia central: você cria uma **população** de indivíduos, cada um com características ligeiramente diferentes ("genes"). Você os deixa "viver" em um ambiente. Os que se saem melhor sobrevivem e se reproduzem. Os que se saem mal desaparecem.

Laupok ilustra isso com uma analogia de **Kirby**:
- Uma população de Kirbys aparece em um terreno com espinhos e tomates
- Os espinhos removem pontos de vida, os tomates restauram
- Cada Kirby tem genes: tamanho, velocidade, HP, comportamento (fugir, procurar tomates, correr cegamente)

![Dupla hélice de DNA com rótulos "the baby", "size", "speed", "color" -- os genes que compõem um indivíduo](/images/laupok-mario-ai/dna-genes.jpg)

- Após 15 segundos, você verifica quem sobreviveu mais tempo
- O melhor Kirby se reproduz com os outros: os filhos herdam metade dos genes do melhor e metade dos do "pior"
- Os filhos sofrem **mutações** aleatórias (um pouco maiores, um pouco mais rápidos...)
- Os Kirbys antigos são substituídos pelos novos
- Você reinicia

Após 180 gerações (~15 horas), os Kirbys passam de 15 segundos de sobrevivência a **15 minutos**. Eles ficaram pequenos (hitbox menor), rápidos e fogem constantemente do perigo.

![Simulação de Kirby geração 0: círculos coloridos aleatoriamente espalhados em um fundo preto, todos com tamanho semelhante](/images/laupok-mario-ai/kirby-gen0.jpg)

![Simulação de Kirby geração 1866: Kirbys são menores, mais rápidos e fogem sistematicamente do perigo](/images/laupok-mario-ai/kirby-gen1866.jpg)

![Estatísticas da simulação de Kirby: fitness, HP, comportamento de cada indivíduo classificado por desempenho](/images/laupok-mario-ai/kirby-stats.jpg)

O ponto crucial: **você não define a solução**. O algoritmo **encontra por conta própria**. E é exatamente isso que o torna poderoso para problemas onde você não sabe qual seria a combinação ótima de parâmetros.

### Redes neurais artificiais

Uma rede neural é um modelo matemático simplificado do cérebro humano. Ela consiste em:
- **Neurônios de entrada**: o que a rede "vê"
- **Neurônios de saída**: o que a rede "decide"
- **Conexões (pesos)**: cada conexão tem um **peso** que amplifica ou atenua o sinal

O princípio é simples: cada neurônio de entrada envia seu valor. Ele é multiplicado pelo peso da conexão, depois somado a outros sinais. Se o resultado excede um certo limiar (a **função de ativação**), o neurônio de saída dispara.

Na analogia de Laupok com Mario e o cursor do mouse:
- Neurônio de entrada = distância entre Mario e o cursor
- Peso da conexão = sensibilidade de Mario
- Neurônio de saída = Mario grita ou não

Quanto mais perto o cursor, maior o valor de entrada. Se o peso for forte, o sinal de saída é forte, e Mario gritaria. Ao mudar o peso, você muda a sensibilidade de Mario.

![A demonstração "Mario está assustado": Mario enfrenta um Boo com uma barra de sinapse mostrando o peso da conexão entre entrada e saída](/images/laupok-mario-ai/mario-fear-demo.jpg)

Na rede neural da IA real, é a mesma lógica, mas em escala massiva:
- **99 neurônios de entrada** (11×9 tiles da visão de Mario)
- **8 neurônios de saída** (A, B, X, Y, Cima, Baixo, Esquerda, Direita)
- **Neurônios ocultos** entre eles
- Centenas de conexões com pesos variados

---

## NEAT: o algoritmo que muda tudo

### O problema com algoritmos genéticos básicos

Se você combina ingenuamente um algoritmo genético com uma rede neural, tem um problema: você cria 100 redes neurais completamente diferentes e não consegue compará-las. Cada uma tem seus próprios neurônios, conexões e pesos. Como você sabe se duas redes são "similares" ou "diferentes"?

É aqui que o **NEAT** entra -- NeuroEvolution of Augmenting Topologies. Inventado por **Kenneth Stanley** e **Risto Miikkulainen** em 2002, ele resolve exatamente esse problema.

### Espécies

O primeiro mecanismo-chave do NEAT são as **espécies**. Quando uma rede neural se torna muito diferente de outra, ela é classificada em uma espécie diferente. A similaridade é calculada através de três parâmetros:

1. **Excesso** (`EXCES_COEF = 0.50`): o número de conexões que não têm nada em comum entre duas redes (inovações diferentes)
2. **Disjunta**: idêntico, mas para conexões no meio
3. **Diferença de peso** (`POIDSDIFF_COEF = 0.92`): a diferença média de peso entre conexões que compartilham a mesma inovação

A fórmula da pontuação:

```
score = (EXCES_COEF × disjoint) / max(nbConnexions1 + nbConnexions2, 1)
      + POIDSDIFF_COEF × diffPoids
```

Se esta pontuação estiver abaixo de `DIFF_LIMITE` (1.0), as duas redes estão na mesma espécie. Caso contrário, uma nova espécie é criada.

### Inovações

Esta é a genialidade do NEAT. Toda vez que uma conexão é criada, ela recebe um número de **inovação** único e global. Este número acompanha a rede neural mesmo quando ela se reproduce.

Concretamente, quando um filho é criado através de crossover, ele herda as inovações de seus pais. Se duas redes compartilham a mesma inovação, significa que elas têm uma conexão do mesmo ancestral. É isso que permite comparar redes de tamanhos diferentes.

### Crossover

Quando duas redes neurais se reproduzem, o **crossover** funciona assim:

![Laupok explica o conceito de crossover com o texto "CROSSOVER" sobreposto](/images/laupok-mario-ai/crossover-label.jpg)

1. A rede com melhor desempenho se torna o "pai dominante"
2. O filho herda todas as conexões do dominante
3. Para cada conexão que compartilha a mesma inovação, o outro pai pode substituí-la (50% de chance)
4. Apenas conexões ativas do pai não-dominante podem substituir

Isso garante que o filho seja sempre pelo menos tão bom quanto o melhor pai.

### Mutações

Após o crossover, o filho sofre mutações com probabilidades configuráveis:

![Laupok explica mutações com o texto "(small modif = mutation)" sobreposto](/images/laupok-mario-ai/mutation-label.jpg)

| Mutação | Probabilidade | Efeito |
|---------|---------------|--------|
| Redefinir peso da conexão | 25% | O peso é completamente randomizado |
| Mutação de peso | 95% | O peso varia em ±0.80 |
| Adicionar conexão | 85% | Nova conexão entre dois neurônios não ligados |
| Adicionar neurônio | 39% | Um neurônio oculto é inserido entre dois neurônios conectados |

A taxa de adição de neurônios é importante: é ela que permite que a rede **cresça**. No início, há apenas entradas e saídas. Gradualmente, neurônios ocultos aparecem, tornando a rede cada vez mais complexa.

---

## O código: análise completa

### Constantes

O script começa com um bloco de constantes que define todas as configurações:

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

`NB_INPUT` é 99 porque a visão de Mario é de 11×9 tiles. Cada tile é um neurônio de entrada. Tile vazio = 0. Bloco = 1. Inimigo = -1.

As 8 saídas correspondem aos botões do controle do SNES: A, B, X, Y, Cima, Baixo, Esquerda, Direita. Start, Select, L e R são excluídos para que não "distrainham" Mario.

### Estruturas de dados

O script define três estruturas principais:

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

No início, cada rede tem apenas entradas e saídas. Sem neurônios ocultos, sem conexões. O algoritmo decide se algum é necessário.

### Mutações em detalhe

#### Mutação de peso

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

O peso inicial é sempre 1 ou -1 (`genererPoids()`). A variação de ±0.80 pode oscilá-lo entre valores negativos e positivos, mudando radicalmente o comportamento da rede.

#### Adicionando uma conexão

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

Você não pode conectar uma saída a uma entrada (isso criaria um ciclo) e não pode conectar dois neurônios que já estão ligados. Embaralhar garante que diferentes possibilidades sejam exploradas a cada vez.

#### Adicionando um neurônio

Esta é a mutação mais interessante:

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

O mecanismo: você pega uma conexão existente, **desativa-a** e insere um neurônio oculto no meio. A conexão original é substituída por duas novas: entrada→oculto e oculto→saída. É como cortar um fio para inserir um interruptor.

É isso que torna o NEAT "augmenting topologies": a rede **cresce** ao longo do tempo. Ela começa simples e se torna complexa apenas quando necessário.

### O feedForward

Esta é a função que propaga os sinais pela rede:

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

Cada conexão ativa envia `valor_da_entrada × peso` para o neurônio de saída. O valor é **acumulado** (somado). A flag `allume` é apenas para a exibição visual da rede.

### Lendo a memória do jogo

A função `getLesInputs()` traduz o mundo de Super Mario World em dados que a rede pode entender:

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

A grade de entrada é uma visão centrada em Mario: 11 tiles de largura, 9 de altura. O valor de cada tile:
- **0** (cinza): nada
- **1** (branco): bloco sólido
- **-1** (preto): inimigo

Os inimigos são lidos de duas listas na RAM: sprites normais (`0x14C8`-`0x14F8`) e sprites estendidos (`0x170B`-`0x173B`). Para cada sprite vivo (estado > 7), sua posição em tiles relativa a Mario é calculada e -1 é colocado na célula correspondente.

### Fitness: como a IA sabe que está progredindo

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

Fitness é simples: é a **distância percorrida para a direita**. Se Mario se move 10 pixels, o fitness aumenta em 10. Se Mario se move para a esquerda, nada acontece (sem penalidade). Se a fase é concluída (endereço `0x0100` == 12), o fitness se torna 1.000.000.

É intencionalmente simples. Sem bônus por matar inimigos, sem penalidade por morrer. Apenas: mova-se para a direita.

### Reset inteligente

Se Mario não se move por 33 quadros, o fase é reiniciado e passamos para o próximo indivíduo. Mas se Mario fez progresso (o fitness atual difere do início), esperamos 300 quadros -- dando à rede a chance de "entender" o que ela fez de certo.

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

A condição `memory.readbyte(0x0071) ~= 9` verifica que Mario não está em sua animação de morte. Não há sentido reiniciar se Mario já está morto.

### O loop principal

O loop roda a 30 fps (velocidade normal do Super Mario World):

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

As três funções vitais são `majReseau`, `feedForward` e `appliquerLesBoutons`. Desative qualquer uma delas e Mario para de se mover.

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

O filho herda do melhor pai. Para cada conexão que compartilha a mesma inovação, o outro pai tem 50% de chance de substituí-la -- mas **apenas se a conexão estiver ativa**. Esta é uma correção importante: sem ela, neurônios ocultos inúteis poderiam ser criados.

### Seleção por espécies

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

A ideia: uma espécie com fitness médio de 10.000 pode criar muito mais filhos do que uma espécie com fitness médio de 1. Isso é **seleção natural** em ação.

`choisirParent` usa seleção por roleta: quanto maior o fitness de um indivíduo, maior a probabilidade de ser selecionado como pai.

### Salvando e carregando

As populações são salvas em arquivos `.pop`:

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

O salvamento também inclui o melhor indivíduo de todas as populações anteriores. Se o melhor da população antiga for melhor que o novo, revertemos para o antigo como base. Esta é uma forma de **elitismo**: o melhor nunca é perdido.

### Visualização da rede

Laupok adicionou um visualizador de rede neural sobreposto ao jogo:

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

É incrivelmente útil para entender o que a rede faz. Conexões ativas são brancas, inativas são semitransparentes. As entradas são uma grade de células brancas/pretas/cinza. As saídas mostram quais botões estão sendo pressionados.

---

## Resultados

### O que a IA aprendeu

Ao longo de horas (e dias) de execução, a IA descobriu por conta própria:

1. **Mover-se para a direita**: o comportamento mais básico, mas que requer segurar o botão Direita
2. **Pular sobre inimigos**: conectando uma entrada "inimigo detectado" ao botão A ou B
3. **Evitar obstáculos**: algumas redes aprenderam a recuar temporariamente para avançar mais
4. **Completar fases**: o melhor indivíduo conseguiu completar a primeira fase do Super Mario World

![Mario controlado pela IA enfrentando um Boo em uma fase do Super Mario World -- a rede neural decide ações em tempo real](/images/laupok-mario-ai/mario-ai-playing.jpg)

### Limitações

O projeto tem suas limitações:

- **Fase única**: a IA é treinada em uma fase específica. Ela não se generaliza automaticamente para outras fases
- **Tempo de treinamento**: são necessárias dezenas de horas para obter resultados satisfatórios
- **Sem compreensão**: a IA não "entende" o que está fazendo. Ela otimiza uma função de fitness (distância percorrida) através de mutações aleatórias
- **T-bagging**: Laupok observa que Mario tende a pular no lugar ao ver um inimigo, simplesmente porque isso aumenta o fitness (ele avança um pouco enquanto pula)

---

## Como reproduzir o experimento

Laupok compartilhou tudo. Aqui estão os passos:

1. **Baixe o BizHawk** em [tasvideos.org](https://tasvideos.org/BizHawk) (seção Download)
2. **Obtenha uma ROM dos EUA de Super Mario World** (cópia privada do seu próprio cartucho)
3. **Baixe o script Lua** do [Pastebin](https://pastebin.com/Jcvdqhqm) -- renomeie para `mario.lua`
4. **Coloque o script na mesma pasta que a ROM**
5. **Inicie o BizHawk**, abra a ROM
6. **No console Lua**: `dofile("mario.lua")` ou via o menu Script > Open Script
7. **Salve um estado** no início da fase (menu Savestate > Save State) e nomeie como `debut.state`
8. **Reinicie o script** -- funciona

O script inclui um formulário com opções:
- **Acelerar**: desabilita o limite de 30 fps para ir mais rápido
- **Mostrar rede**: exibe a rede neural sobreposta ao jogo
- **Mostrar informações**: exibe um banner com geração, fitness e contagem de espécies
- **Pausa**: pausa a execução
- **Salvar/Carregar**: persiste a população atual em um arquivo `.pop`

---

## Fontes e referências

| Recurso | Link |
|---------|------|
| Vídeo principal de Laupok | [I built an AI that plays Mario by itself](https://www.youtube.com/watch?v=F63GNXGHVwM) |
| Revisão do código + vídeo de configuração | [How to set up the AI + source code review](https://www.youtube.com/watch?v=u5xCl1bSe6o) |
| Código-fonte completo | [Pastebin Jcvdqhqm](https://pastebin.com/Jcvdqhqm) |
| Artigo original do NEAT | Stanley & Miikkulainen, "Evolving Neural Networks through Augmenting Topologies", 2002 |
| Tutorial N8Programs | [NEAT implementation walkthrough](https://n8programs.github.io/) (JavaScript, mas os conceitos são idênticos) |
| 16blings (inspiração de Laupok) | [AI plays Super Mario World](https://www.youtube.com/watch?v=qv6IFaOz3bA) |
| BizHawk | [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) |
| Memória de Super Mario World | [SMW Central - RAM Map](https://www.smwcentral.net/?p=section&a=details&id=21702) |

---

## Conclusão

O que Laupok fez foi pegar um algoritmo acadêmico (NEAT, 2002), reescrevê-lo em Lua para um emulador (BizHawk) e aplicá-lo ao Super Mario World. O resultado: uma IA que aprende do zero a jogar o jogo, sem conhecimento prévio, apenas através de mutações aleatórias e seleção natural.

É um belo exemplo do poder dos algoritmos genéticos. Sem deep learning, sem GPU, sem milhões de dados de treinamento. Apenas seleção natural, um pouco de Lua e muita paciência.

O código é comentado, compartilhado, e Laupok fez dois vídeos explicativos -- um para os grandes conceitos e outro para o código. Se o tema te interessa, mergulhe. É mais acessível do que parece.
