---
title: IA Aprende PvP no Minecraft -- Aprendizagem por Imitação, Reinforcement Learning e as 30 variáveis que importam
description: "1.000 duelos gravados, rede neural treinada em pixels, 90% de precisão nas teclas : e o bot foi direto para uma parede. Depois vieram RL, curriculum learning e 60 horas de treinamento."
date: 2026-07-09
tags:
  - minecraft
  - ai
  - reinforcement-learning
  - imitation-learning
  - python
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "hE8mrb07ul/xWQXuwvATeIfvZIfmQECeWgR8FiqNjLHhzNVe0o3BlCG9ItNB99MbGxTz508hJ35wXaTmm2/gcw=="
---

## Introdução

![AI Learns Minecraft PvP thumbnail](assets/ai-pvp-thumbnail.png)

Há um vídeo chamado [AI Learns Minecraft PvP (Reinforcement Learning + Behavior Cloning)](https://www.youtube.com/watch?v=j5nxDKAjg6U) por Kadambi | AI Engineering, e é um dos relatos mais honestos sobre treinar uma IA para jogar videogame que eu já vi.

A premissa: construir um bot que jogue PvP no Minecraft (kit espada, armadura de diamante encantada) assistindo à tela e emitindo comandos de mouse e teclado. Sem ler memória do jogo, sem macros, sem mods : apenas pixels na entrada, ações na saída.

O que torna o vídeo interessante não é o resultado final. É a jornada: o fracasso da aprendizagem por imitação, a mudança para feature engineering, os ciclos de catastrophic forgetting e as 60+ horas de treinamento em um laptop sem GPU.

## Fase 1 : Aprendizagem por Imitação (o fracasso)

![O bot durante a aprendizagem por imitação: de frente para uma parede, pulando para cima e para baixo](assets/ai-pvp-imitation-fail.png)

O criador começou com uma abordagem sensata: gravar 1.000 duelos do seu próprio gameplay, mapear cada clique do mouse e pressionamento de tecla ao quadro correspondente, e treinar uma rede neural para prever ações a partir dos pixels.

```python
# Pseudocódigo para a pipeline de aprendizagem por imitação
dataset = record_duels(1000)          # centenas de milhares de quadros
for frame, action in dataset:
    pixels = capture_screen(frame)
    network.train(pixels → action)    # prevê teclado/mouse a partir da imagem
```

A rede aprendeu a prever as teclas com **90% de precisão**. Promissor.

Então eles testaram em uma partida real. O bot foi direto para a borda do mapa, encarou uma parede e começou a pular para cima e para baixo.

Por quê?

**A armadilha da preguiça.** Em uma luta PvP, a tecla W é pressionada na maior parte do tempo. A rede percebeu que poderia obter alta precisão simplesmente segurando W e não fazendo mais nada. Ela otimizou para a ação mais comum às custas de todas as outras.

**Latência humana.** As ações no conjunto de dados são atrasadas por ~200ms de tempo de reação humana. Quadro a quadro, causa e efeito é quase impossível para um modelo aprender a partir de pixels crus quando a ação e sua consequência visível estão separadas por múltiplos quadros.

**Demonstrações inconsistentes.** O próprio gameplay do criador variava: às vezes strafando com o teclado, às vezes mirando com o mouse em situações idênticas. Essa entrada conflitante confundiu a rede.

## Fase 2 : Reinforcement Learning com Curriculum

![O bot aprendendo a rastrear horizontalmente durante o treinamento RL](assets/ai-pvp-rl-horizontal.png)

Abandonando a aprendizagem por imitação, o criador mudou para RL. Mas colocar um agente novo em um duelo PvP completo é inútil: há coisas demais acontecendo ao mesmo tempo para que a exploração aleatória encontre algo.

A solução: o **curriculum learning**. Isolar cada mecânica e deixar o bot dominar o básico antes de entrar em uma luta real.

### Passo 1 : Mira horizontal (7 horas)

A função de recompensa mais simples: recompensa positiva por acertar um golpe, penalidade negativa por sofrer dano.

Inicialmente, o bot mal se move (rede neural inicializada com valores neutros). Ele balança de um lado para o outro: é o bot testando diferentes ações para ver quais dão recompensas.

Após uma hora, ele aprende a se centralizar horizontalmente, mas dolorosamente devagar. Após 7 horas, ele consegue seguir o inimigo para a esquerda e direita, embora de forma assimétrica (melhor ao mover-se da direita para a esquerda do que da esquerda para a direita, um comportamento que persistiu durante todo o treinamento).

### Passo 2 : Feature Engineering

A captura de tela bruta tinha mais de 2 milhões de pixels. Mesmo reduzida para 360p, são 200.000 entradas: um número excessivo para aprendizado eficiente.

O criador analisou milhares de duelos e identificou **30 variáveis que realmente importam**, divididas em três grupos:

**Visão (rastreamento do inimigo)** :
- Distância do inimigo do centro da mira
- Tamanho da caixa delimitadora do inimigo
- Altura do inimigo
- Estado da mira (no alvo/fora do alvo)
- Velocidade relativa

Em vez de processar a imagem inteira, o bot filtra pixels estritamente pela cor da armadura do inimigo, tornando a detecção quase instantânea. Blocos de fundo com cor semelhante podem atrapalhar: mas no Minecraft, você pode simplesmente mudar as texturas.

**OCR (leitura do HUD)** :
Como o bot não pode extrair coordenadas do código do jogo, ele escaneia a tela em tempo real para extrair:
- Inclinação da câmera (pitch)
- Momentum
- Nível Y

O OCR padrão tem dificuldades com o texto transparente do Minecraft, então os dados críticos são forçados a preto e branco para leitura instantânea.

**Tempo (janela de contexto)** :
- Tempo desde que você acertou o inimigo
- Tempo desde que ele te acertou
- Buffer de ações anteriores do próprio bot

Isso dá à rede um contexto temporal: sem ele, o bot não tem ideia se está no meio de um combo ou apenas começando uma luta.

### Passo 3 : Mira vertical (mais 7 horas)

![O bot aprendendo a mirar para cima e para baixo durante o treinamento RL](assets/ai-pvp-rl-vertical.png)

Adicionar movimento vertical do mouse foi "um desastre total" no início. O desempenho inicial estava quebrado.

Depois de mais uma hora na sandbox, o bot descobriu como olhar para cima e para baixo. Mas no processo, ele esqueceu completamente como rastrear horizontalmente.

Isto é o **catastrophic forgetting**: um problema clássico de machine learning onde otimizar para novos dados sobrescreve representações previamente aprendidas. Ao otimizar para a mira vertical, a rede neural acidentalmente sobrescreveu seu progresso horizontal, deixando o criador com um bot que conseguia manter a mira nivelada mas não conseguia seguir um alvo.

Foram necessárias **6 horas adicionais** para recuperar o rastreamento horizontal mantendo o controle vertical. O bot então manteve um bom posicionamento da mira graças ao grupo OCR que extraía a inclinação da câmera.

### Passo 4 : Controle do teclado

![O bot alternando a tecla W constantemente, aprendendo a se comprometer com o movimento](assets/ai-pvp-keyboard.png)

Dar ao bot permissão para usar o teclado tornou as características temporais ainda mais críticas. No início, a tecla W era ligada e desligada constantemente: alternância rápida porque a rede não tinha aprendido a se comprometer.

Este comportamento foi penalizado, então o bot aprendeu a suavizá-lo. Ele começou a acertar mais sprint hits (o som surdo vs o whoosh de um golpe parado). Alguns combos pareciam insatisfatórios porque o bot explorava sua vantagem de alcance sobre o inimigo.

Para tornar as coisas justas, o criador aumentou o alcance do inimigo. Muitas das estratégias aprendidas pelo bot pararam de funcionar. Mas com mais tempo, ele se adaptou.

### Passo 5 : Ensinando o bot quando clicar

Para a fase final, o criador trouxe de volta a aprendizagem por imitação: mas apenas para ensinar o tempo do clique, não a política de controle completa. O bot tentava imitar os padrões de clique dos duelos gravados.

Inicialmente ele estava com muito medo de tentar qualquer coisa, temendo a penalidade por cliques errados. Mas eventualmente criou coragem para golpear e acertar. Claro, ele esqueceu como mirar novamente no processo: o criador teve que deixá-lo sozinho por **mais 50 horas** para voltar a um estado satisfatório.

## O debate sobre trapaça

O vídeo termina perguntando: este bot está trapaceando?

O argumento contra: o bot processa apenas o que um humano vê (mesmos pixels), envia as mesmas entradas de teclado e mouse que um humano (sem manipulação de pacotes como anti-knockback) e não lê a memória do jogo (sem raio-X ou ESP).

O argumento a favor: um bot pode processar mais rápido que um humano, e se o oponente pensa que está jogando contra um humano mas não está, isso é enganação.

A opinião do criador: depende da intenção. Se ambas as partes sabem que é um bot, é uma partida justa. O bot prossegue acertando o inimigo no vazio com uma sequência de 100 golpes.

## O resultado

![O bot executando um combo de 100 golpes](assets/ai-pvp-final-combo.png)

Um bot PvP de Minecraft treinado em um **laptop sem GPU**, construído em uma pipeline de treinamento personalizada com:

- **Captura de tela** para entrada de pixels (2M+ pixels → 30 features engenheiradas)
- **Curriculum learning** (horizontal → vertical → teclado → clique)
- **RL para controle motor** + **aprendizagem por imitação para tempo de clique**
- **Feature engineering** sobre pixels crus (3 grupos: visão, OCR, tempo)
- **60+ horas de treinamento** em múltiplas fases

O tempo total de treinamento é de dezenas de horas, mas a maior parte é passiva. O bot cambaleia em direção à compreensão, esquece o que aprendeu, reaprende e eventualmente encadeia um combo de 100 golpes.

O vídeo está em [youtube.com/watch?v=j5nxDKAjg6U](https://www.youtube.com/watch?v=j5nxDKAjg6U).

---

*Este artigo cobre apenas o conteúdo do vídeo. Para um contexto mais amplo sobre IA no Minecraft: VPT, DreamerV3 e o panorama da aprendizagem por imitação vs RL: as seções abaixo conectam este projeto ao campo mais amplo.*

## VPT : Behavior Cloning em escala

![Diagrama do projeto VPT da OpenAI: o modelo de dinâmica inversa prevê ações a partir de pares de quadros](assets/vpt-overview.svg)

A abordagem de "behavior cloning" do vídeo (Fase 1) é a mesma técnica que a OpenAI usou no projeto **Video PreTraining (VPT)**, mas em extremos opostos do espectro de recursos. O VPT provou que a aprendizagem por imitação funciona para Minecraft quando você tem 70.000 horas de vídeo, 720 GPUs e um modelo de dinâmica inversa para pseudo-rotular dados não rotulados. O criador aqui provou que falha com um laptop e 1.000 duelos: mas pela mesma razão fundamental: a aprendizagem por imitação é limitada pela qualidade de suas demonstrações.

![O agente VPT da OpenAI minerando uma árvore no Minecraft](assets/vpt-minecraft.jpg)

A pipeline do VPT resolve o problema de dados treinando um **Modelo de Dinâmica Inversa (IDM)** que olha o quadro t-1 e o quadro t+1 para prever a ação no quadro t. Como o IDM é não-causal (vê quadros futuros), a tarefa é mais fácil que o behavior cloning e requer muito menos dados rotulados. Eles pagaram contratados ~$2.000 por 2.000 horas de dados rotulados, depois usaram o IDM para pseudo-rotular 70.000 horas de vídeos do Minecraft no YouTube.

O modelo foundation resultante de 0,5B parâmetros alcançou capacidades zero-shot que eram impossíveis apenas com RL: cortar árvores, criar mesas de trabalho, pillar jumping: e ajustado com RL, tornou-se a primeira IA a criar ferramentas de diamante.

## OpenAI Five : O problema do reward shaping

![OpenAI Five jogando Dota 2 contra profissionais humanos](assets/openai-five-dota2.jpg)

O OpenAI Five (2019) derrotou os campeões mundiais de Dota 2 usando puro self-play RL: sem aprendizagem por imitação. 256 GPUs, 128.000 núcleos de CPU, 180 anos de gameplay por dia, 10 meses de treinamento.

Mas a função de recompensa foi feita à mão por especialistas em Dota: **28 das 20.000 features disponíveis**, cada uma com pesos ajustados manualmente. Patrimônio líquido, abates, mortes, saúde das torres, atribuições de rota: todos selecionados e ponderados por humanos. Sem essa modelagem, o agente mal aprendia (experimento: recompensa apenas vitória/derrota → platô no nível semi-profissional).

O bot do vídeo enfrenta o mesmo problema: sua função de recompensa codifica o entendimento do criador sobre o que importa no PvP (acertar golpes é bom, sofrer dano é ruim, manter a mira é bom). Isso é inevitável: RL precisa de um sinal de recompensa, e modelar esse sinal codifica viés humano.

## DreamerV3 : Modelos mundiais e recompensas esparsas

![Pontuações benchmark do DreamerV3 em mais de 150 tarefas diversas com uma única configuração](assets/dreamerv3-benchmarks.png)

O DreamerV3 da DeepMind (2023) adota uma terceira abordagem. Em vez de behavior cloning ou RL com modelagem, ele aprende um **modelo mundial**: uma rede neural que prevê estados futuros e recompensas a partir de ações passadas: e planeja sonhando com futuros possíveis. Foi o primeiro algoritmo a coletar diamantes no Minecraft do zero sem dados humanos ou currículos, publicado na Nature em 2025.

![DreamerV3 aprende um modelo mundial para imaginar trajetórias futuras](assets/dreamerv3-header.png)

O ambiente do diamante define uma recompensa esparsa sobre 12 marcos (tronco → tábuas → graveto → mesa de trabalho → picareta de madeira → pedregulho → picareta de pedra → minério de ferro → fornalha → lingote de ferro → picareta de ferro → diamante), cada um dando +1 exatamente uma vez. Além de uma pequena recompensa de saúde (±0,01 por hp). Total alcançável: 11,1 em um episódio de 36.000 passos.

O modelo mundial do DreamerV3 permite que ele imagine trajetórias e as avalie internamente: o ator aprende a partir de rollouts sonhados em vez de experiência real, testando milhares de futuros possíveis para cada passo real. Isso torna recompensas esparsas viáveis onde matariam um agente RL padrão.

Em 40 sementes treinadas por 100M passos ambientais, 24 de 40 coletaram pelo menos um diamante. O primeiro diamante apareceu após 29M passos (~9 dias em uma GPU).

## ANNA : IA simbólica encontra Minecraft

![A decomposição em árvore de tarefas da ANNA para uma pederneira](assets/anna-task-tree.png)

Antes do bot PvP do vídeo, antes do VPT e DreamerV3, havia **ANNA**: um bot Minecraft construído com uma filosofia completamente diferente. Em vez de aprender a partir de pixels ou recompensas, a ANNA usa uma **máquina de estados simbólica** com um **parser NLP francês** e uma **árvore de dependência de tarefas** escrita à mão.

Criada em 2022 (antes de "vibe coding" ser um termo), a ANNA se conecta a um servidor Minecraft via Mineflayer e entende comandos em linguagem natural em francês. Diga *"obtiens un briquet"* (pegue uma pederneira), e o parser da ANNA identifica o verbo (*obtien* → obter), consulta a receita do item e a decompõe recursivamente em subtarefas: minere troncos de carvalho → crie tábuas → crie gravetos → crie uma mesa de trabalho → crie uma picareta de madeira → minere pedra → crie uma picareta de pedra → minere minério de ferro → funda lingotes de ferro → crie a pederneira.

![Arquitetura do parser NLP da ANNA para reconhecimento de comandos em francês](assets/anna-nlp-diagram.png)

A camada NLP (`utils/id_parser.js`) divide comandos em *"et"* (e) para lidar com ordens paralelas, mapeia verbos franceses para tipos de tarefa (*craft*, *mine*, *tue*, *suis moi*) e traduz nomes de itens franceses para IDs do Minecraft através de um dicionário de 5.000 entradas. Comandos não reconhecidos caem em um sistema de conversação baseado em GPT que apresenta a ANNA como um companheiro senciente do Minecraft.

A **árvore de tarefas** (`mc-tasks-tree/`) é o núcleo: um algoritmo recursivo que percorre o grafo de itens do Minecraft (receitas de crafting, rendimentos de mineração, drops de mobs, receitas de fornalha) para produzir um plano passo a passo. Para um capacete de diamante, gera uma decomposição de 40+ passos abrangendo os níveis madeira, pedra, ferro e diamante.

![Árvore de tarefas do capacete de diamante da ANNA: uma decomposição de 40+ passos](assets/anna-diamond-helmet.png)

Enquanto o bot PvP do vídeo aprende com a experiência, a ANNA funciona a partir do conhecimento. Ela não precisa de 1.000 duelos ou 60 horas de treinamento: precisa da árvore, do parser e do servidor. Mas também não consegue generalizar além do que sua árvore codifica. Nenhuma quantidade de engenharia de máquina de estados ensinaria PvP a ela.

A abordagem da ANNA reflete uma era diferente da IA: antes do aprendizado end-to-end dominar, quando a promessa era que o raciocínio simbólico combinado com engenharia cuidadosa poderia produzir comportamento inteligente. Hoje, projetos como ANNA e o bot PvP representam dois polos da IA no Minecraft: um raciocina sobre o mundo, o outro o percebe.

## Mace Bot do Master Gumbo : IA com apenas command blocks

![A arena de treinamento Mace PvP com o bot](assets/mace-bot-arena.png)

Em um canto completamente diferente da IA no Minecraft, o YouTuber **Master Gumbo** construiu um bot de treinamento PvP usando **apenas command blocks**: sem mods, sem plugins, sem código externo. Apenas comandos vanilla do Minecraft, redstone e um carpet mod para entidades réplica do jogador. O resultado é um oponente IA de mace PvP que pratica breach swapping, wind charging e mecânicas de escudo com o jogador.

O bot começa como um zumbi com equipamento inquebrável e um totem na mão secundária (reabastecido a cada tick via `/item replace`), tornando-o efetivamente imortal. Depois, Master Gumbo muda para os bots **Carpet Mod's player replica**, que suportam mecânicas humanas (levantar escudo, trocar itens) que zumbis não conseguem fazer.

![O centro de configurações: botões para configurar o comportamento do bot](assets/mace-settings-center.png)

A inovação principal é uma **máquina de estados impulsionada por aleatoriedade**. Um armor stand é teletransportado acima de um círculo de blocos de concreto coloridos usando o comando `/spreadplayers`, que dispersa entidades aleatoriamente. Onde o armor stand cai determina a próxima ação do bot:

- **Concreto vermelho** → strafe para trás
- **Concreto azul** → wind charge para cima (ataque)
- **Concreto verde** → levantar escudo
- **Concreto branco** → pausa (adiciona atraso entre ações)

![O sistema de decisão da IA: um armor stand sobre concreto colorido](assets/mace-ai-system.png)

A posição do armor stand é lida por command blocks que detectam o bloco abaixo dele e ativam o mecanismo correspondente. Um bloco de redstone é colocado ou removido para ativar/desativar cada comportamento. Como `/spreadplayers` é executado em repetição, o bot continuamente toma novas decisões, criando um comportamento imprevisível mas estruturado.

Master Gumbo chama isso de "uma forma muito simples e básica de IA": não aprende com interações como redes neurais, mas a aleatoriedade combinada com a máquina de estados produz um comportamento PvP realista que é mais difícil de prever do que um bot scriptado. O centro de configurações inclui uma interface de livro para ligar/desligar a IA, ajustar dificuldade e configurar padrões de movimento.

Após treinar com o bot e depois duelar contra o jogador que o chamou de ruim (na introdução do vídeo), Master Gumbo vence. O mapa é compartilhado via Discord, com Carpet Mod requisitado.

![O bot em um duelo, praticando técnicas de mace PvP](assets/mace-final-duel.png)

Enquanto o bot PvP (Kadambi) aprende a partir de pixels e a ANNA raciocina através de uma árvore de tarefas, o bot do Master Gumbo alcança inteligência através de **transições de estado randomizadas**: uma abordagem pura de command blocks que prova que você não precisa de redes neurais para construir um oponente PvP convincente.

## Altoclef : Baritone + task tree em grande escala

Se a ANNA é um bot simbólico que *lê* para saber o que fazer, e o Mace Bot randomiza decisões, **Altoclef** é um agente totalmente autônomo que *planeja* seu caminho através do jogo inteiro. Construído por gaucho-matero como um mod Fabric e alimentado pelo pathfinding **Baritone**, Altoclef decompõe qualquer objetivo do Minecraft em uma task tree e o executa sem intervenção humana.

A interface é enganosamente simples : digite `@gamer` no chat, e Altoclef começa a tarefa "zerar o jogo" a partir de um mundo survival. Ele coleta madeira, crafta ferramentas, minera ferro e diamante, constrói um portal do Nether, coleta blaze rods e ender pearls, encontra a stronghold e mata o Ender Dragon. Tudo autonomamente, através do cliente nativo do Minecraft, em qualquer servidor vanilla.

Por baixo dos panos, isso é alcançado através de um **sistema recursivo de task tree** onde cada objetivo de alto nível (por exemplo, "craft uma picareta de diamante") é decomposto em tarefas pré-requisito : minerar diamantes → fundi-los → craftar gravetos → combinar. A árvore percorre o grafo completo de receitas do Minecraft, lidando com production chains, mob drops, loot tables e acesso a contêineres. Diferente da árvore escrita à mão da ANNA, as tarefas do Altoclef são **classes Java programáveis** que podem implementar lógica arbitrária : estratégias de combate, troca com piglins, padrões de exploração.

Altoclef representa o limite da **IA Minecraft simbólica pura** : ele pode zerar o jogo do zero sem treinamento, sem GPU e sem dados humanos, mas não consegue se adaptar a tarefas que seus programadores não anteciparam, e não pode aprender com a experiência. Ele sabe craftar uma picareta de diamante porque uma classe Java diz exatamente como, não porque ele descobriu sozinho.

## O que os une

| Abordagem | Método principal | Dados | Computação | Resultado |
|----------|------------|------|---------|--------|
| Bot PvP do vídeo | RL + aprendizagem por imitação | 1.000 duelos | 1 laptop, 60h | Combo de 100 golpes |
| OpenAI Five | Self-play RL | 180 anos de gameplay/dia | 256 GPUs, 10 meses | Campeão mundial Dota 2 |
| VPT | IL semissupervisionada | 70K horas YouTube + IDM | 720 GPUs, 9 dias | Ferramentas de diamante |
| DreamerV3 | World model RL | Trajetórias sonhadas | 1 GPU, 9 dias | Diamante do zero |
| **ANNA** | **NLP simbólico + árvore tarefas** | **Receitas escritas à mão** | **1 laptop, instantâneo** | **Qualquer item fabricável** |
| **Altoclef** | **Baritone + task tree** | **Classes Java de tarefas** | **Fabric mod, sem GPU** | **Zera o jogo inteiro** |
| **Mace Bot** | **Máquina estados c/ command block** | **Decisões randomizadas** | **MC vanilla, sem GPU** | **Treinamento Mace PvP** |

O bot do vídeo é o mais limitado em recursos, mas o mais honesto sobre o processo. Ele falha primeiro, depois itera. Esquece o que aprendeu, depois reaprende. Termina com um combo de 100 golpes: mas também com uma pergunta sobre se o que construiu é trapaça.

---

**Vídeo** : [AI Learns Minecraft PvP](https://www.youtube.com/watch?v=j5nxDKAjg6U) por Kadambi | AI Engineering

**VPT** : [Paper](https://cdn.openai.com/vpt/Paper.pdf) · [Blog](https://openai.com/index/vpt/) · [GitHub](https://github.com/openai/Video-Pre-Training)

**OpenAI Five** : [Paper](https://arxiv.org/abs/1912.06680) · [Blog](https://openai.com/index/dota-2/)

**DreamerV3** : [Paper](https://arxiv.org/abs/2301.04104) · [GitHub](https://github.com/danijar/dreamerv3)

**ANNA** : [GitHub](https://github.com/fox3000foxy/ANNA) · (Node.js, Mineflayer, French NLP, task tree)

**Altoclef** : [GitHub](https://github.com/gaucho-matrero/altoclef) · [Active fork](https://github.com/drmcbride12/altoclef) · (Fabric, Baritone, task tree, beats game)

**Mace Bot** : [Video](https://www.youtube.com/watch?v=Fmp2Il70IF8) por Master Gumbo · (Command blocks, Carpet Mod, state machine)
