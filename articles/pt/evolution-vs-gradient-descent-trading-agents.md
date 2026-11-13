---
title: "Fiz uma rede neural evoluir por seleção natural em vez de descida de gradiente"
description: "Como substituí o treinamento clássico por descida de gradiente por um algoritmo genético NSGA-II para fazer agentes DQN de trading evoluírem : quatro versões, do overfitting à evolução lamarckiana dos pesos."
date: 2026-07-13
tags: ["ai", "nsga-ii", "dqn", "trading", "typescript"]
authors: ["docteur-turboss"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "sYN56GcegnjAdsqScZZ5bYaVPPc0q+Iu/XVF+1K1v6JMvztpEkn2Z4nrPJMtnNTaW2eoJxqT+8J9QWZhaoa0WQ=="
---

## O problema com a descida de gradiente sozinha

Treinar um agente DQN para trading algorítmico com a descida de gradiente clássica traz um problema simples de enunciar e difícil de resolver : o gradiente otimiza _uma_ rede rumo a _um_ mínimo local, em _uma_ janela de mercado. Nada garante que esse mínimo generalize para um regime de mercado diferente, e nada no loop de treinamento incentiva a diversidade ; dois runs partindo de sementes diferentes costumam convergir para estratégias quase idênticas, com os mesmos pontos cegos.

A resposta que explorei : substituir (ou melhor, sobrepor) a descida de gradiente com um algoritmo genético. Em vez de treinar um agente, fazemos uma população de agentes evoluir ; cada um um genoma codificando uma arquitetura e hiperparâmetros ; e deixamos a seleção natural fazer a triagem, enquanto o gradiente continua refinando cada indivíduo dentro da própria vida dele.

Esse runner passou por quatro versões em uma única sessão intensa de trabalho. Cada uma corrigiu um defeito estrutural da anterior.

## v1 : a versão ingênua, e por que não bastava

A primeira versão fazia o que se espera de um GA básico : uma população de genomas, uma função de fitness, seleção, cruzamento, mutação, próxima geração. Cada genoma codificava a topologia da rede (número de camadas, largura), os hiperparâmetros DQN (learning rate, decaimento de epsilon, tamanho do replay buffer), e algumas escolhas arquiteturais (quais fontes de dados consumir, qual tamanho de embedding).

O defeito principal : a fitness era calculada sobre os mesmos dados do treinamento. Um agente podia literalmente memorizar uma janela de mercado e obter uma pontuação excelente sem ter aprendido uma estratégia generalizável. Overfitting clássico, mas amplificado pela seleção genética ; o GA seleciona ativamente os indivíduos que melhor exploram essa brecha.

## v2 : separar treinamento e avaliação

A correção óbvia foi separar as fases : cada genoma treina em uma janela de mercado, depois é avaliado em uma janela diferente, nunca vista durante o treinamento. Só o desempenho na avaliação conta para a fitness.

Só essa mudança fez a fitness média da população cair ; sinal de que boa parte do que parecia desempenho na v1 era memorização pura. Doloroso de ver, mas é exatamente o sinal que queremos : uma pontuação mais baixa mas honesta vale mais do que uma pontuação inflada e enganosa.

## v3 : migrar para NSGA-II e uma fitness multiobjetivo

Otimizar uma única pontuação de fitness (digamos o retorno) empurra mecanicamente para agentes que assumem riscos extremos para maximizar esse único número. A solução foi migrar para NSGA-II (Non-dominated Sorting Genetic Algorithm II), que otimiza simultaneamente vários objetivos sem reduzi-los a uma soma ponderada arbitrária : retorno, drawdown máximo, índice de Sharpe, estabilidade entre janelas.

O NSGA-II constrói uma fronteira de Pareto : o conjunto dos genomas para os quais nenhuma melhoria em um objetivo é possível sem degradar outro. Em vez de forçar um único compromisso entre retorno e risco via uma ponderação escolhida de antemão, mantemos toda a fronteira de compromissos e deixamos a escolha final em aberto.

```
// Traduzido dos comentários : ordenação não dominada + construção dos fronts por remoção iterativa
function nonDominatedSort(population: Genome[]): Genome[][] {
  const fronts: Genome[][] = [[]];
  for (const p of population) {
    p.dominationCount = 0;
    p.dominatedSet = [];
    for (const q of population) {
      if (dominates(p, q)) p.dominatedSet.push(q);
      else if (dominates(q, p)) p.dominationCount++;
    }
    if (p.dominationCount === 0) {
      p.rank = 0;
      fronts[0].push(p);
    }
  }
  // ... construção dos fronts seguintes por remoção iterativa
  return fronts;
}
```

Segunda adição da v3 : um **arquivo de Pareto persistente**. Sem ele, um bom genoma encontrado na geração 12 pode desaparecer na geração 15 se o acaso do cruzamento não o reproduzir ; mesmo que continuasse melhor do que tudo que o substituiu. O arquivo conserva, ao longo de todas as gerações, o conjunto dos indivíduos não dominados já encontrados, independentemente da população atual.

## v4 : evolução lamarckiana e diversidade ambiental

A v3 tinha um ponto cego estrutural : o genoma descrevia a arquitetura, mas os pesos aprendidos durante o treinamento desapareciam a cada nova geração. Um descendente nascido do cruzamento de dois bons pais herdava a arquitetura deles, mas tinha que reaprender do zero ; nenhum traço dos pesos que tinham tornado os pais performáticos.

A v4 introduz a **evolução lamarckiana** : os pesos treinados são reinjetados no genoma após o treinamento, e transmitidos (com mutação) à descendência. É uma heresia biológica assumida ; Lamarck estava errado para organismos vivos, a hereditariedade dos caracteres adquiridos não existe em biologia ; mas nada impede um GA numérico de trapacear com inteligência : aqui, transmitir o adquirido acelera radicalmente a convergência, já que cada geração parte de um ponto de inicialização já informado em vez de pesos aleatórios.

Outras três mudanças estruturais nesta versão :

*   **Diversidade ambiental** : cada genoma não é mais avaliado em uma única janela de mercado, mas em várias, tiradas de regimes diferentes (alta, baixa, lateral). Um agente que brilha em uma janela e desaba em outra não pode mais dominar a fronteira de Pareto.

*   **Regularização por complexidade FLOPs** : o custo computacional da rede (em FLOPs) vira um objetivo por si só no NSGA-II. Isso evita que a evolução convirja para arquiteturas massivas simplesmente porque têm mais capacidade bruta, sem que isso se justifique pelo ganho de desempenho.

*   **Interface** `RLBackend` **desacoplada** : o GA não conhece mais os detalhes do DQN. Ele manipula um genoma e chama `train()` / `evaluate()` através de uma interface abstrata, o que permite em teoria conectar outro algoritmo de RL sem tocar no motor evolutivo.


```
// Traduzido dos comentários : interface abstrata para desacoplar o GA do DQN
interface RLBackend {
  train(genome: Genome, window: MarketWindow): Promise<TrainedWeights>;
  evaluate(genome: Genome, weights: TrainedWeights, window: MarketWindow): Promise<FitnessVector>;
}
```

Último ponto técnico : a avaliação passou para **concorrência assíncrona limitada** ; um pool de N avaliações em paralelo em vez de um loop sequencial, com um limite explícito para não saturar os recursos de GPU/CPU disponíveis.

## O que a v4 corrige em relação à v3 na prática

Defeito v3 Correção v4 Pesos perdidos a cada geração Reinjeção lamarckiana dos pesos treinados Overfitting a uma única janela de mercado Avaliação em múltiplas janelas, regimes variados Arquiteturas que crescem sem restrição FLOPs como objetivo Pareto explícito GA acoplado aos detalhes do DQN Interface `RLBackend` abstrata Avaliação sequencial lenta Concorrência async limitada

A v4 também corrigiu dez bugs concretos de "grounding" de API ; casos em que o código do GA assumia uma interface para `TradingAgent` que não correspondia exatamente à implementação real. Esse tipo de bug é invisível enquanto não confrontamos o código com o verdadeiro código-fonte do agente : a v4 só foi validada após releitura linha por linha diante do arquivo real.

## Por que misturar evolução e gradiente em vez de escolher um ou outro

Poderiam perguntar por que não fazer só RL puro, ou só evolução pura estilo NEAT. A resposta cabe em uma frase : o gradiente é excelente para refinar localmente (ajustar pesos contínuos rumo a um ótimo próximo), a evolução é excelente para explorar globalmente (descobrir arquiteturas e combinações de hiperparâmetros que nenhum gradiente pode alcançar, porque o espaço de busca discreto não é diferenciável). Usar um sem o outro é abrir mão de uma das duas formas de exploração.

O preço a pagar é a complexidade de engenharia ; quatro versões não foram luxo, foi o número de iterações necessárias para o loop GA + RL parar de se sabotar (overfitting, perda de bons indivíduos, perda de pesos adquiridos). Mas o resultado é um sistema que explora um espaço de design bem mais amplo do que uma simples busca em grade de hiperparâmetros, mantendo a eficiência local do gradiente para cada candidato avaliado.

## Próxima etapa

Essa arquitetura evolutiva de um único nível (uma população plana de genomas DQN) atinge seus limites quando o número de ativos a cobrir aumenta. Foi isso que motivou a passagem para uma arquitetura hierárquica de três níveis (Asset Analysts → Sector Managers → Portfolio Allocator), com um GA operando de forma independente em cada nível... mas isso é assunto para outro artigo.
