---
title: A IA aprende PvP de Minecraft -- Imitation Learning, Reinforcement Learning, e as 30 variáveis que importavam
description: "1 000 duelos gravados, rede neural treinada em pixels, 90% de precisão nos golpes : e o bot ia direto para a parede. Depois vieram o RL, o aprendizado curricular e 60 horas de treino."
date: 2026-07-09
tags:
  - minecraft
  - ai
  - python
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "7kXeOpuEQP608V2b2dWZxa0TYEDOfs5WDa5vFRnV5BZPIQ21fwCk+bhfSE4m8NYgOCLSwoLYi4PZSuUiUWDVeQ=="
---

## Introdução

![AI Learns Minecraft PvP thumbnail](assets/ai-pvp-thumbnail.png)

Há um vídeo chamado [AI Learns Minecraft PvP (Reinforcement Learning + Behavior Cloning)](https://www.youtube.com/watch?v=j5nxDKAjg6U) por Kadambi | AI Engineering, e é um dos relatos mais honestos de treino de IA de videogame que já vi.

O princípio : construir um bot que joga PvP de Minecraft (kit espada, armadura de diamante toda encantada) olhando a tela e enviando comandos de mouse e teclado. Funciona só com pixels de entrada e ações de saída, sem ler a memória do jogo, sem macros e sem mods.

O que torna o vídeo interessante não é o resultado final. É a jornada : o fracasso do imitation learning, a virada para feature engineering, os ciclos de esquecimento catastrófico, e as 60+ horas de treino em um laptop sem GPU.

## Fase 1 : Imitation Learning (o fracasso)

![The bot during imitation learning: facing a wall, jumping up and down](assets/ai-pvp-imitation-fail.png)

O criador começou com uma abordagem sensata : gravar 1 000 duelos do próprio gameplay, associar cada clique de mouse e tecla apertada à imagem correspondente, e treinar uma rede neural para prever ações a partir dos pixels.

```python
# Pseudocódigo do pipeline de imitation learning
dataset = record_duels(1000)          # hundreds of thousands of frames
for frame, action in dataset:
    pixels = capture_screen(frame)
    network.train(pixels → action)    # predict keyboard/mouse from image
```

A rede aprendeu a prever os golpes com **90% de precisão**. Promissor.

Depois testaram em uma partida de verdade. O bot foi direto para a borda do mapa, encarou uma parede, e ficou pulando para cima e para baixo.

Por quê ?

**A armadilha da preguiça.** Em um combate PvP, a tecla W fica apertada a maior parte do tempo. A rede percebeu que dava para chegar a alta precisão simplesmente mantendo W apertado e não fazendo mais nada. Otimizou a ação mais frequente em detrimento de todas as outras.

**A latência humana.** As ações no dataset atrasam cerca de 200 ms de tempo de reação humano. Frame por frame, causa e efeito são quase impossíveis de aprender para um modelo a partir de pixels brutos quando a ação e sua consequência visível estão separadas por várias imagens.

**Demonstrações incoerentes.** O próprio gameplay do criador variava : às vezes fazia strafe com o teclado, às vezes mirava com o mouse em situações idênticas. Essas entradas contraditórias confundiram a rede.

## Fase 2 : Reinforcement Learning com currículo

![The bot learning to track horizontally during RL training](assets/ai-pvp-rl-horizontal.png)

Abandonando o imitation learning, o criador migrou para RL. Mas jogar um agente novo em um duelo PvP completo é inútil : acontece coisa demais ao mesmo tempo para uma exploração aleatória achar qualquer coisa.

A solução : **aprendizado curricular**. Isolar cada mecânica e deixar o bot dominar o básico antes de entrar em combate de verdade.

### Etapa 1 : Mira horizontal (7 horas)

A função de recompensa mais simples : recompensa positiva por acertar um alvo, penalidade negativa por sofrer dano.

No início, o bot mal se mexe (rede neural inicializada com valores neutros). Treme para os lados : é o bot testando ações diferentes para ver quais dão recompensas.

Depois de uma hora, aprende a se centralizar horizontalmente, mas penosamente devagar. Depois de 7 horas, consegue seguir o inimigo para a esquerda e a direita, embora de forma assimétrica (melhor indo da direita para a esquerda do que da esquerda para a direita, um comportamento que persistiu durante todo o treino).

### Etapa 2 : Feature Engineering

A captura de tela bruta tinha mais de 2 milhões de pixels. Mesmo reduzida para 360p, dá 200 000 entradas : demais para um aprendizado eficaz.

O criador analisou milhares de duelos e identificou **30 variáveis que realmente importam**, divididas em três grupos :

**Visão (rastreio do inimigo)** :
- Distância do inimigo em relação à mira (crosshair)
- Tamanho da caixa envolvente do inimigo
- Altura do inimigo
- Estado da mira (no alvo / fora do alvo)
- Velocidade relativa

Em vez de processar a imagem inteira, o bot filtra os pixels estritamente pela cor da armadura inimiga, tornando a detecção quase instantânea. Blocos de fundo de cor parecida podem atrapalhar essa filtragem : mas no Minecraft dá para simplesmente trocar as texturas.

**OCR (leitura do HUD)** :
Como o bot não pode pegar as coordenadas do código do jogo, escaneia a tela em tempo real para extrair :
- Pitch da câmera
- Momentum
- Nível Y

O OCR padrão sofre com o texto transparente do Minecraft, então os dados críticos são forçados em preto e branco para leitura instantânea.

**Tempo (janela de contexto)** :
- Tempo desde que você atingiu o inimigo
- Tempo desde que ele te atingiu
- Buffer deslizante das ações anteriores do bot

Isso dá à rede um contexto temporal : sem ele, o bot não faz ideia se está no meio de um combo ou se está só começando uma luta.

### Etapa 3 : Mira vertical (mais 7 horas)

![The bot learning to aim up and down during RL training](assets/ai-pvp-rl-vertical.png)

Adicionar o movimento vertical do mouse foi "um desastre total" no início. A performance inicial quebrou.

Depois de mais uma hora na caixa de areia, o bot entendeu como olhar para cima e para baixo. Mas no processo, esqueceu totalmente como rastrear horizontalmente.

É o **esquecimento catastrófico** : um problema clássico de machine learning em que otimizar para dados novos apaga as representações aprendidas antes. Ao otimizar a mira vertical, a rede neural apagou sem querer seu progresso horizontal, deixando o criador com um bot que conseguia manter a mira nivelada mas não seguir um alvo.

Levou **mais 6 horas** para recuperar o rastreio horizontal mantendo o controle vertical. O bot então manteve um bom posicionamento de mira graças ao grupo OCR extraindo o pitch da câmera.

### Etapa 4 : Controle de teclado

![The bot toggling the W key constantly, learning to commit to movement](assets/ai-pvp-keyboard.png)

Dar ao bot permissão para usar o teclado tornou as características temporais ainda mais críticas. No início, a tecla W ligava e desligava sem parar : uma alternância rápida porque a rede não tinha aprendido a se comprometer.

Esse comportamento foi penalizado, então o bot aprendeu a suavizar. Começou a acertar mais golpes em sprint (o som grave contra o swish de um golpe parado). Alguns combos pareciam insatisfatórios porque o bot explorava sua vantagem de alcance sobre o inimigo.

Para equilibrar, o criador aumentou o alcance do inimigo. Muitas das estratégias aprendidas pelo bot pararam de funcionar. Mas com o tempo, ele se adaptou.

### Etapa 5 : Ensinar o bot quando clicar

Para a fase final, o criador trouxe o imitation learning de volta : mas só para ensinar o timing dos cliques, não a política de controle completa. O bot tentou imitar os padrões de clique dos duelos gravados.

No início, tinha medo demais de tentar qualquer coisa, temendo a penalidade por cliques ruins. Mas acabou criando coragem para bater e acertar golpes. Claro, esqueceu como mirar de novo no processo : o criador teve que deixá-lo quieto por **mais 50 horas** para voltar a um estado satisfatório.

## O debate sobre trapaça

O vídeo termina perguntando : esse bot trapaceia ?

O argumento contra : o bot só processa o que um humano vê (os mesmos pixels), envia as mesmas entradas de teclado/mouse que um humano (sem manipulação de pacotes como anti-knockback), e não lê a memória do jogo (sem X-ray nem ESP).

O argumento a favor : um bot pode processar mais rápido que um humano, e se o adversário pensa que joga contra um humano mas não é o caso, é enganação.

A opinião do criador : depende da intenção. Se os dois lados sabem que é um bot, a partida é justa. O bot encadeia o inimigo no vazio com uma série de 100 golpes.

## O resultado

![The bot executing a 100-hit combo](assets/ai-pvp-final-combo.png)

Um bot PvP de Minecraft treinado em um **laptop sem GPU**, construído sobre um pipeline de treino customizado com :

- **Captura de tela** para entrada em pixels (2M+ pixels → 30 características projetadas)
- **Aprendizado curricular** (horizontal → vertical → teclado → cliques)
- **RL para controle motor** + **imitation learning para timing de cliques**
- **Feature engineering** sobre pixels brutos (3 grupos : visão, OCR, tempo)
- **60+ horas de treino** em várias fases

O tempo total de treino é de dezenas de horas, mas a maioria é passiva. O bot treme até entender, esquece o que aprendeu, reaprende, e acaba encadeando uma série de 100 golpes.

O vídeo está em [youtube.com/watch?v=j5nxDKAjg6U](https://www.youtube.com/watch?v=j5nxDKAjg6U).

---

*Este artigo cobre só o conteúdo do vídeo. Para um contexto mais amplo sobre IA em Minecraft : VPT, DreamerV3, e o panorama de imitation learning vs RL : as seções abaixo ligam este projeto ao campo mais amplo.*

## VPT : Behavior cloning em grande escala

![OpenAI's VPT project diagram : the Inverse Dynamics Model predicts actions from pairs of frames](assets/vpt-overview.svg)

A abordagem de "behavior cloning" do vídeo (Fase 1) é a mesma técnica que a OpenAI usou no projeto **Video PreTraining (VPT)**, mas em extremos opostos do espectro de recursos. O VPT provou que imitation learning funciona para Minecraft quando você tem 70 000 horas de vídeo, 720 GPUs, e um inverse dynamics model para pseudo-rotular dados não rotulados. O criador aqui provou que falha com um laptop e 1 000 duelos : mas pela mesma razão fundamental : imitation learning é limitado pela qualidade das demonstrações.

![OpenAI's VPT agent mining a tree in Minecraft](assets/vpt-minecraft.jpg)

O pipeline VPT resolve o problema dos dados treinando um **Inverse Dynamics Model (IDM)** que olha a imagem t-1 e a imagem t+1 para prever a ação na imagem t. Como o IDM é não causal (vê imagens futuras), a tarefa é mais fácil que behavior cloning e precisa de bem menos dados rotulados. Pagaram a contratados cerca de 2 000 $ por 2 000 horas de dados rotulados, depois usaram o IDM para pseudo-rotular 70 000 horas de vídeos de Minecraft no YouTube.

![Taxa de crafting/coleta em função do volume de dados de pré-treino (escala log) : mesas de craft, ferramentas de madeira, ferramentas de pedra](assets/vpt-stone-pickaxe-sequence.svg)

O efeito de escala é claro : em um eixo log de 1 hora a 100 000 horas de dados de pré-treino, a taxa com que o modelo fabrica uma mesa de craft, ferramentas de madeira, depois ferramentas de pedra sobe em degraus. O modelo treinado só nas 2 000 horas rotuladas por contratados estaciona nas mesas de craft ; é ao adicionar as 70 000 horas pseudo-rotuladas pelo IDM (linha pontilhada no gráfico) que as ferramentas de pedra emergem em zero-shot, sem uma única etapa de RL.

O modelo base resultante de 0,5B parâmetros atingiu capacidades zero-shot impossíveis só com RL : cortar árvores, fabricar mesas, pulo em coluna : e com fine-tuning de RL, virou a primeira IA a fabricar ferramentas de diamante.

![Recompensa em função do número de episódios de treino RL : partindo de um modelo inicializado aleatoriamente vs partindo do modelo VPT pré-treinado](assets/vpt-diamond-pickaxe-sequence.svg)

Este gráfico mostra por que o pré-treino muda tudo para o RL posterior. O RL partindo de uma rede inicializada aleatoriamente (laranja) fica plano perto de 0 por quase um milhão de episódios : a tarefa "conseguir um diamante" tem recompensa esparsa demais para um agente ingênuo topar com ela por exploração aleatória. O RL com fine-tuning a partir do modelo VPT pré-treinado (verde) já parte com o comportamento base (minerar, fabricar, explorar) e sobe de forma constante até uma recompensa de cerca de 25, o que corresponde ao caminho completo até uma picareta de diamante.

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/719971231?h=cbdf2617a1" title="VPT agent gameplay demo 1" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045834?h=9cb4118c65" title="VPT agent gameplay demo 2" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045849?h=00398908ed" title="VPT agent gameplay demo 3" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045863?h=060f07e290" title="VPT agent gameplay demo 4" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

*Demos de vídeo oficiais do projeto VPT da OpenAI, mostrando o agente em ação.*

## OpenAI Five : O problema do reward shaping

![OpenAI Five playing Dota 2 against human professionals](assets/openai-five-dota2.jpg)

O OpenAI Five (2019) venceu os campeões mundiais de Dota 2 usando RL puro em autoaprendizado : sem imitation learning. 256 GPUs, 128 000 núcleos de CPU, 180 anos de jogo por dia, 10 meses de treino.

Mas a função de recompensa foi desenhada à mão por especialistas em Dota : **28 características das 20 000 disponíveis**, cada uma com pesos ajustados manualmente. Valor líquido, abates, mortes, vida das torres, atribuições de rotas : tudo foi selecionado e ponderado por humanos. Sem essa modelagem, o agente mal aprendia (experimento : recompensa só vitória/derrota → estacionou no nível semipro).

O bot do vídeo enfrenta o mesmo problema : sua função de recompensa codifica a compreensão do criador do que conta no PvP (acertar é bom, ser acertado é ruim, manter a mira é bom). É inevitável : RL precisa de um sinal de recompensa, e modelar esse sinal codifica um viés humano.

## DreamerV3 : World models e recompensas esparsas

![DreamerV3 benchmark scores across over 150 diverse tasks with a single configuration](assets/dreamerv3-benchmarks.png)

O DreamerV3 da DeepMind (2023) adota uma terceira abordagem. Em vez de behavior cloning ou RL com incentivos, aprende um **world model** : uma rede neural que prevê estados futuros e recompensas a partir de ações passadas : e planeja sonhando com futuros possíveis. É o primeiro algoritmo a coletar diamantes no Minecraft do zero sem dados humanos nem currículos, publicado na Nature em 2025.

![DreamerV3 learns a world model to imagine future trajectories](assets/dreamerv3-header.png)

O ambiente diamante define uma recompensa esparsa em 12 marcos (tora → tábuas → graveto → mesa de craft → picareta de madeira → pedra → picareta de pedra → minério de ferro → forno → barra de ferro → picareta de ferro → diamante), cada um dando +1 uma única vez. Mais uma pequena recompensa de vida (±0,01 por pv). Total alcançável : 11,1 em um episódio de 36 000 etapas.

O world model do DreamerV3 permite imaginar trajetórias e avaliá-las internamente : o ator aprende com rollouts sonhados em vez de experiência real, testando milhares de futuros possíveis para cada etapa real. Isso torna possíveis as recompensas esparsas onde destruiriam um agente RL padrão.

Em 40 seeds treinadas por 100M de etapas ambientais, 24 das 40 coletaram pelo menos um diamante. O primeiro diamante apareceu depois de 29M de etapas (~9 dias em uma GPU).

## ANNA : A IA simbólica encontra Minecraft

![ANNA's task tree decomposition for a flint-and-steel](assets/anna-task-tree.png)

Antes do bot PvP do vídeo, antes do VPT e do DreamerV3, havia **ANNA** : um bot de Minecraft construído com uma filosofia totalmente diferente. Em vez de aprender a partir de pixels ou recompensas, ANNA usa uma **máquina de estados simbólica** com um **analisador NLP francês** e uma **árvore de dependências de tarefas** escrita à mão.

Criada em 2022 (antes de "vibe coding" ser um termo), ANNA se conecta a um servidor Minecraft via Mineflayer e entende comandos em linguagem natural em francês. Diga *"obtiens un briquet"*, e ANNA analisa o verbo (obtien → obter), procura a receita do objeto, e decompõe recursivamente em subtarefas : minerar carvalho → fabricar tábuas → fabricar gravetos → fabricar mesa de craft → fabricar picareta de madeira → minerar pedra → fabricar picareta de pedra → minerar minério de ferro → fundir barras de ferro → fabricar o isqueiro.

![ANNA's NLP parser architecture for French command recognition](assets/anna-nlp-diagram.png)

A camada NLP (`utils/id_parser.js`) separa os comandos em "et" para lidar com ordens paralelas, associa os verbos franceses aos tipos de tarefas, e traduz os nomes de objetos franceses em identificadores Minecraft via um dicionário de 5 000 entradas. Comandos não reconhecidos passam para um sistema de conversa baseado em GPT que apresenta ANNA como um companheiro Minecraft consciente.

A **árvore de tarefas** (`mc-tasks-tree/`) é o coração : um algoritmo recursivo que percorre o grafo de objetos Minecraft (receitas de craft, rendimentos de mineração, drops de monstros, receitas de forno) para produzir um plano passo a passo. Para um capacete de diamante, gera uma decomposição de 40+ etapas cobrindo os níveis madeira, pedra, ferro e diamante.

![ANNA's diamond helmet task tree : a 40+ step breakdown](assets/anna-diamond-helmet.png)

Onde o bot PvP do vídeo aprende com a experiência, ANNA funciona a partir do conhecimento. Não precisa de 1 000 duelos ou 60 horas de treino : precisa da árvore, do analisador e do servidor/distribuidor. Mas também não consegue generalizar além do que sua árvore codifica. Nenhuma engenharia de máquina de estados ensinaria PvP a ela.

A abordagem de ANNA reflete uma época diferente da IA : antes do aprendizado de ponta a ponta dominar, quando a promessa era que raciocínio simbólico com engenharia cuidadosa podia produzir comportamento inteligente. Hoje, projetos como ANNA e o bot PvP representam dois polos da IA em Minecraft : um raciocina sobre o mundo, o outro o percebe.

## Master Gumbo's Mace Bot : IA com só command blocks

![The Mace PvP training arena with the bot](assets/mace-bot-arena.png)

Em um canto totalmente diferente da IA em Minecraft, o YouTuber **Master Gumbo** construiu um bot de treino PvP usando **só command blocks**, apenas com comandos vanilla de Minecraft, redstone, e um carpet mod para entidades clones de jogador. O resultado é um adversário de IA para a massa que pratica trocas de brecha, cargas de vento e mecanismos de escudo com o jogador.

O bot começa como um zumbi com equipamento inquebrável e um totem na segunda mão (reposto a cada tick via `/item replace`), tornando-o efetivamente imortal. Depois, Master Gumbo passa para bots **replica de jogador do Carpet Mod**, que suportam mecânicas humanoides (levantar escudo, trocar objeto) que zumbis não conseguem fazer.

![The settings center : buttons to configure bot behavior](assets/mace-settings-center.png)

A inovação central é uma **máquina de estados guiada por aleatório**. Um armor stand é teleportado para cima de um círculo de blocos de concreto colorido via o comando `/spreadplayers`, que espalha entidades aleatoriamente. A cor do bloco de concreto onde o armor stand cai determina a próxima ação do bot :

- **Concreto vermelho** → strafe para trás
- **Concreto azul** → sobe (ataque) com a carga de vento
- **Concreto verde** → levantar o escudo
- **Concreto branco** → pausa (adiciona intervalo entre ações)

![The AI decision system : an armor stand on colored concrete](assets/mace-ai-system.png)

A posição do armor stand é lida por command blocks que detectam o bloco abaixo e ativam o mecanismo correspondente. Um bloco de redstone é colocado ou removido para ativar/desativar cada comportamento. Como o `/spreadplayers` roda em repetição, o bot toma continuamente novas decisões, criando um comportamento imprevisível mas estruturado.

Master Gumbo chama isso de "uma forma bem simples e básica de IA" : não aprende com interações como redes neurais, mas aleatório + máquina de estados produz um comportamento PvP realista que é mais difícil de prever que um bot roteirizado. O centro de configurações inclui uma interface de livro para ativar/desativar a IA, ajustar a dificuldade e configurar os padrões de movimento.

Depois do treino deles com o bot e depois em duelo contra o jogador que o tinha chamado de ruim (na intro do vídeo dele), Master Gumbo ganha. O mapa é compartilhado via Discord, Carpet Mod necessário.

![The bot in a duel, practicing mace PvP techniques](assets/mace-final-duel.png)

Onde o bot PvP (Kadambi) aprende a partir de pixels e ANNA raciocina através de uma árvore de tarefas, o bot de Master Gumbo alcança inteligência por **transições de estado aleatórias** : uma abordagem puramente de command block que prova que você não precisa de redes neurais para construir um adversário PvP convincente.

## Altoclef : Baritone + árvore de tarefas em grande escala

Se ANNA é um bot simbólico que *lê* para saber o que fazer, e o Mace Bot randomiza as decisões, **Altoclef** é um agente autônomo completo que *planeja* seu caminho pelo jogo inteiro. Construído por gaucho-matero como um mod Fabric e impulsionado pelo pathfinding **Baritone**, Altoclef decompõe qualquer objetivo de Minecraft em uma árvore de tarefas e executa sem intervenção humana.

A interface é enganosamente simples : digite `@gamer` no chat, e Altoclef começa a tarefa "terminar o jogo" a partir de um mundo survival. Coleta madeira, fabrica ferramentas, minera ferro e diamante, constrói um portal do Nether, coleta varas de Blaze e pérolas do Ender, acha a stronghold, e mata o Ender Dragon. Tudo de forma autônoma, via o cliente Minecraft nativo, em qualquer servidor vanilla.

Por baixo do capô, isso é feito graças a um **sistema recursivo de árvore de tarefas** em que cada objetivo de alto nível (por exemplo, "fabricar uma picareta de diamante") é decomposto em tarefas pré-requisito : minerar diamante → fundir → fabricar gravetos → combinar. A árvore percorre o grafo completo das receitas de Minecraft, lidando com cadeias de produção, drops de monstros, tabelas de loot e acesso a contêineres. Ao contrário da árvore escrita à mão de ANNA, as tarefas de Altoclef são **classes Java programáveis** que podem implementar lógica arbitrária : estratégias de combate, troca com piglins, padrões de exploração.

A ideia arquitetural principal é a separação do **quê** (a árvore de tarefas) do **como** (o pathfinding Baritone). O Baritone cuida dos deslocamentos de baixo nível : pathfinding, desvio de obstáculos, quebra de blocos, gestão de inventário, enquanto o sistema de tarefas orquestra o plano de alto nível. Essa modularidade significa que nenhum componente precisa ser uma IA : são ambos algoritmos determinísticos, mas a combinação produz um comportamento complexo e orientado a objetivo que rivaliza com abordagens de aprendizado.

Altoclef representa o limite da **IA simbólica pura em Minecraft** : consegue terminar o jogo do zero sem treino, sem GPU, e sem dados humanos, mas não consegue se adaptar a tarefas que seus programadores não previram, nem aprender com a experiência. Sabe fabricar uma picareta de diamante porque uma classe Java diz exatamente como, não porque descobriu sozinho.

## O que os liga

| Abordagem | Método principal | Dados | Computação | Resultado | |
|--------------------------|---------------------|---------|--------|-----------|-|
| Bot PvP do vídeo | RL + imitation learning | 1 000 duelos | 1 laptop, 60h | Combo de 100 golpes | |
| OpenAI Five | RL em autoaprendizado | 180 anos de jogo/dia | 256 GPUs, 10me | Campeão mundial Dota 2 | |
| VPT | IL semissupervisionado | 70K h YouTube + IDM | 720 GPUs, 9 dias | Ferramentas de diamante | |
| DreamerV3 | RL world model | Trajetos sonhados | 1 GPU, 9 dias | Diamante do zero | |
| **ANNA** | **NLP simbólico + árvore de tarefas** | **Receitas escritas** | **1 laptop, instante** | **Todo objeto fabricável** | |
| **Altoclef** | **Baritone + task tree FS** | **Classes Java de tarefas** | **Mod Fabric, sem GPU** | **Zera o jogo inteiro** | |
| **Mace Bot** | **Máquina de estados Command block** | **Decisões aleatórias** | **MC Vanilla, sem GPU** | **Treino PvP de maça** | |

O bot do vídeo é o mais limitado em recursos mas o mais honesto sobre o processo. Falha primeiro, depois itera. Esquece o que aprendeu, depois aprende de novo. Termina com um combo de 100 golpes : mas também com uma pergunta sobre se o que construiu é trapaça.

---

**Vídeo** : [AI Learns Minecraft PvP](https://www.youtube.com/watch?v=j5nxDKAjg6U) por Kadambi | AI Engineering

**VPT** : [Artigo](https://cdn.openai.com/vpt/Paper.pdf) · [Blog](https://openai.com/index/vpt/) · [GitHub](https://github.com/openai/Video-Pre-Training)

**OpenAI Five** : [Artigo](https://arxiv.org/abs/1912.06680) · [Blog](https://openai.com/index/dota-2/)

**DreamerV3** : [Artigo](https://arxiv.org/abs/2301.04104) · [GitHub](https://github.com/danijar/dreamerv3)

**ANNA** : [GitHub](https://github.com/fox3000foxy/ANNA) · (Node.js, Mineflayer, NLP francês, árvore de tarefas)

**Altoclef** : [GitHub](https://github.com/gaucho-matrero/altoclef) · [Fork ativo](https://github.com/drmcbride12/altoclef) · (Fabric, Baritone, task tree, zera o jogo)

**Mace Bot** : [Vídeo](https://www.youtube.com/watch?v=Fmp2Il70IF8) por Master Gumbo · (Command blocks, Carpet Mod, máquina de estados)
