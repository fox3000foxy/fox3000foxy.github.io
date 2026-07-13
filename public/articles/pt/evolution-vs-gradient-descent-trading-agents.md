---
title: "Evoluí uma rede neural por seleção natural em vez de gradiente descendente"
description: "Como substituí o treinamento clássico por gradiente descendente por um algoritmo genético NSGA-II para evoluir agentes de trading DQN: quatro versões, de overfitting à evolução Lamarckiana de pesos."
date: 2026-07-13
tags: ["ai", "nsga-ii", "dqn", "trading", "typescript"]
authors: ["docteur-turboss"]
lang: "pt"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "3TiK0VcmAoRt6Aqp/V5Loo0N8rmlCx/iYUjnzDNoUgEt606diHlHdxD335hEeO8zEKwGa/699t45A+ILmt1Rzw=="
---

## O problema do gradiente descendente sozinho

Treinar um agente DQN para trading algorítmico com gradiente descendente clássico tem um problema simples de enunciar e um difícil de resolver: o gradiente descendente otimiza _uma_ rede em direção a _um_ mínimo local, em _uma_ janela de mercado. Nada garante que esse mínimo generalize para um regime de mercado diferente, e nada no loop de treinamento estimula a diversidade; duas execuções partindo de sementes diferentes frequentemente convergem para estratégias quase idênticas, com os mesmos pontos cegos.

A resposta que explorei: substituir (ou melhor, sobrepor) o gradiente descendente por um algoritmo genético. Em vez de treinar um agente, você evolui uma população de agentes; cada genoma codifica uma arquitetura e hiperparâmetros; e a seleção natural faz a classificação, enquanto o gradiente descendente continua ajustando cada indivíduo dentro de sua própria vida.

Este experimento passou por quatro versões em uma única sessão intensiva. Cada versão corrigiu uma falha estrutural da anterior.

## v1: a versão ingênua, e por que não foi suficiente

A primeira versão fazia o que você esperaria de um AG básico: uma população de genomas, uma função de fitness, seleção, cruzamento, mutação, próxima geração. Cada genoma codificava a topologia da rede (número de camadas, largura), os hiperparâmetros do DQN (taxa de aprendizado, decaimento do épsilon, tamanho do buffer de replay), e algumas escolhas arquiteturais (quais fontes de dados consumir, qual tamanho de embedding).

A principal falha: o fitness era calculado nos mesmos dados usados para o treinamento. Um agente podia literalmente memorizar uma janela de mercado e obter uma pontuação excelente sem ter aprendido uma estratégia generalizável. Overfitting clássico, mas amplificado pela seleção genética; o AG seleciona ativamente os indivíduos que melhor exploram essa brecha.

## v2: separando treinamento e avaliação

A correção óbvia foi separar as fases: cada genoma treina em uma janela de mercado, depois é avaliado em uma janela diferente, nunca vista durante o treinamento. Apenas o desempenho na avaliação conta para o fitness.

Essa mudança sozinha fez o fitness médio da população cair; um sinal de que grande parte do que parecia desempenho na v1 era pura memorização. Doloroso de ver, mas é exatamente o sinal que você quer: uma pontuação mais baixa mas honesta é melhor do que uma inflada e enganosa.

## v3: migrando para NSGA-II e fitness multiobjetivo

Otimizar uma única pontuação de fitness (digamos, retornos) empurra mecanicamente os agentes a assumir riscos extremos para maximizar aquele único número. A solução foi migrar para o NSGA-II (Algoritmo Genético de Ordenação Não-Dominada II), que otimiza simultaneamente vários objetivos sem reduzi-los a uma soma ponderada arbitrária: retornos, drawdown máximo, índice de Sharpe, estabilidade entre janelas.

O NSGA-II constrói uma frente de Pareto: o conjunto de genomas para os quais nenhuma melhoria em um objetivo é possível sem degradar outro. Em vez de forçar uma única compensação risco-retorno através de uma ponderação pré-escolhida, você mantém toda a fronteira de compromisso e deixa a decisão final em aberto.

```
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
  // ... construção de frentes subsequentes por remoção iterativa
  return fronts;
}
```

Segunda adição na v3: um **arquivo Pareto persistente**. Sem ele, um bom genoma encontrado na geração 12 pode desaparecer na geração 15 se a sorte do cruzamento não o reproduzir; mesmo que ele continue sendo melhor que tudo que o substituiu. O arquivo mantém, através de todas as gerações, o conjunto de todos os indivíduos não dominados já encontrados, independentemente da população atual.

## v4: evolução Lamarckiana e diversidade ambiental

A v3 tinha um ponto cego estrutural: o genoma descrevia a arquitetura, mas os pesos aprendidos durante o treinamento desapareciam a cada nova geração. Um filho nascido do cruzamento de dois bons pais herdava sua arquitetura, mas tinha que reaprender do zero; nenhum traço dos pesos que tornaram seus pais eficientes.

A v4 introduz a **evolução Lamarckiana**: os pesos treinados são realimentados no genoma após o treinamento e transmitidos (com mutação) para a prole. Isso é uma heresia biológica deliberada; Lamarck estava errado para organismos vivos — a herança de características adquiridas não existe na biologia — mas nada impede um AG digital de trapacear inteligentemente: aqui, transmitir conhecimento adquirido acelera radicalmente a convergência, já que cada geração reinicia a partir de uma inicialização já informada em vez de pesos aleatórios.

Outras três mudanças estruturais nesta versão:

*   **Diversidade ambiental**: cada genoma não é mais avaliado em uma única janela de mercado, mas em várias, extraídas de diferentes regimes (altista, baixista, lateral). Um agente que se destaca em uma janela e colapsa em outra não pode mais dominar a frente de Pareto.
    
*   **Regularização de complexidade em FLOPs**: o custo computacional da rede (em FLOPs) torna-se um objetivo completo no NSGA-II. Isso impede que a evolução convirja para arquiteturas massivas simplesmente porque têm mais capacidade bruta, sem um ganho de desempenho justificado.
    
*   **Interface `RLBackend` desacoplada**: o AG não conhece mais os detalhes do DQN. Ele manipula um genoma e chama `train()` / `evaluate()` através de uma interface abstrata, o que teoricamente permite trocar outro algoritmo de RL sem tocar no motor evolutivo.
    

```
interface RLBackend {
  train(genome: Genome, window: MarketWindow): Promise<TrainedWeights>;
  evaluate(genome: Genome, weights: TrainedWeights, window: MarketWindow): Promise<FitnessVector>;
}
```

Último ponto técnico: a avaliação mudou para **concorrência assíncrona limitada**; um pool de N avaliações paralelas em vez de um loop sequencial, com um limite explícito para evitar saturar os recursos de GPU/CPU disponíveis.

## O que a v4 corrige em relação à v3 na prática

Defeito da v3 | Correção da v4
--- | ---
Pesos perdidos a cada geração | Reinjeção Lamarckiana de pesos treinados
Overfitting a uma única janela de mercado | Avaliação em múltiplas janelas, regimes variados
Arquiteturas crescendo sem controle | FLOPs como objetivo explícito de Pareto
AG acoplado a detalhes do DQN | Interface abstrata `RLBackend`
Avaliação sequencial lenta | Concorrência assíncrona limitada

A v4 também corrigiu dez erros concretos de "aterramento" da API; casos onde o código do AG assumia uma interface para `TradingAgent` que não correspondia exatamente à implementação real. Esse tipo de erro é invisível até que você confronte o código com a fonte real do agente: a v4 só foi validada após uma releitura linha por linha comparada com o arquivo real.

## Por que misturar evolução e gradiente em vez de escolher um

Você pode se perguntar por que não usar apenas RL puro, ou apenas evolução como NEAT. A resposta é uma frase: o gradiente é excelente para ajuste local (ajustar pesos contínuos em direção a um ótimo próximo), a evolução é excelente para exploração global (descobrir arquiteturas e combinações de hiperparâmetros que nenhum gradiente pode alcançar, porque o espaço de busca discreto não é diferenciável). Usar um sem o outro significa privar-se de uma das duas formas de exploração.

O preço é a complexidade de engenharia; quatro versões não foram um luxo, foram o número de iterações necessárias para que o loop AG + RL parasse de sabotar a si mesmo (overfitting, perda de bons indivíduos, perda de pesos adquiridos). Mas o resultado é um sistema que explora um espaço de design muito mais amplo do que uma simples busca em grade de hiperparâmetros, mantendo ao mesmo tempo a eficiência local do gradiente descendente para cada candidato avaliado.

## Próximo passo

Esta arquitetura evolutiva de nível único (uma população plana de genomas DQN) atinge seus limites quando o número de ativos a cobrir cresce. Foi isso que motivou a mudança para uma arquitetura hierárquica de três níveis (Analistas de Ativos → Gestores de Setor → Alocador de Portfólio), com um AG operando independentemente em cada nível... mas esse é o assunto de outro artigo.
