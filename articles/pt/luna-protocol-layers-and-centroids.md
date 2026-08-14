---
title: "Luna Protocol: cérebros compartilhados, classificação emocional e roteamento interessante/fútil"
description: "O Luna Protocol passou de um monólito para uma arquitetura de quatro camadas: adaptadores, brain, classificador emocional e inferência. No cardápio: centroides de embeddings, roteamento interessante/fútil, e ajuste dos parâmetros do LLM por valência e ativação (arousal)."
date: 2026-07-27
tags:
  - discord
  - matrix
  - llm
  - architecture
  - embeddings
  - centroids
  - emotion-ai
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "1rmKtWR2x9JnhTdfH5edAa2IDCGzLgQ2diZggQOikwI/sIhuh7XbOStFk9e8HOa9p8wNaVrq0fi2QSFSNLSpfw=="
---

# Luna Protocol: cérebros compartilhados, classificação emocional e roteamento interessante/fútil

Nos [dois](/articles/pt/luna-protocol-discord-bot) [artigos](/articles/pt/luna-protocol-official-models) anteriores, apresentei o Luna Protocol como um único bot do Discord com um sistema comportamental complexo e um modelo fine-tuned. Mas a arquitetura evoluiu bastante desde então. O que era um monólito -- um único processo Node.js que gerenciava o bot do Discord, o comportamento e as chamadas ao LLM -- se transformou em **quatro camadas independentes**, cada uma com sua própria responsabilidade, sua própria linguagem e seu próprio ciclo de vida.

Essa separação trouxe benefícios inesperados: o compartilhamento de "cérebros" entre várias plataformas, um sistema de classificação emocional que ajusta dinamicamente os parâmetros do LLM, e um roteamento inteligente de mensagens entre dois modelos conforme a importância percebida da conversa.

A evolução não aconteceu de uma vez -- seguiu um caminho orgânico. Primeiro, separei a pasta `server/` do repositório do bot, criando assim o **Krystal** de um lado e deixando o **Jade** como adaptador do Discord. Depois criei o **Pixieglow** (adaptador do Matrix) reaproveitando o `llm-core` e o barramento de eventos do Jade. Em seguida veio o **Sapphire**, que introduziu uma classificação GENERIC/SEMANTIC com DistilBERT -- mas os resultados não eram convincentes, então mudei para centroides de embeddings, mais maleáveis para enriquecer exemplos e mais precisos; a classificação passou a ser FÚTIL/INTERESSANTE. Por fim, adicionei centroides de **valência** e **ativação** (arousal) para regular a temperatura e o repeat penalty do LLM. Para terminar, removi todo o código redundante entre Jade e Pixieglow criando o **Emerald**, o cérebro compartilhado, transformando Jade e Pixieglow em simples clientes orientados por socket.

Em paralelo, mantive atualizado um site que documenta o progresso do projeto: [protocol-luna.github.io](https://protocol-luna.github.io/).

Este artigo conta como e por que dividi essas camadas, o que cada serviço faz exatamente, e como conceitos como **centroides** (vetores médios de embeddings) e **variáveis de ressentimento** (inspiradas no chatbot PARRY dos anos 70) transformaram um simples bot do Discord em um sistema multiplataforma surpreendentemente coerente.

---

## O problema com o monólito

No início, o Luna Protocol cabia em um único processo Node.js. O código cuidava de:

- A conexão com o Discord (via biblioteca Eris)
- A avaliação de gatilhos (menções, palavras-chave, follow-ups...)
- A simulação de comportamentos humanos (erros de digitação, hesitações, sono...)
- As chamadas HTTP ao servidor LLM local (llama.cpp)
- O gerenciamento de sessões e o anti-spam
- O pipeline de TTS

Tudo estava no mesmo processo, comunicando-se via barramentos de eventos tipados (`TypedBus`). Funcionava, mas com limitações:

- **Impossível adicionar um cliente Matrix** sem duplicar todo o código de comportamento
- **O LLM e o bot estavam no mesmo repositório**: a pasta `server/` já existia, mas era impossível evoluir um sem mexer no outro
- **Sem classificação inteligente**: cada mensagem era tratada da mesma forma, seja um "lol" ou uma pergunta existencial
- **Sem estado emocional persistente**: o bot não "sentia" nada

A divisão em camadas resolveu todos esses problemas.

---

## As quatro camadas

A arquitetura atual do Luna Protocol está organizada como um funil de quatro níveis:

```
Matrix / Discord
      |
      v
  [ADAPTADORES]   Pixieglow (Matrix) / Jade (Discord)
      |
      v
  [BRAIN]         Emerald (WebSocket, porta 3126)
      |
      v
  [CLASSIFICADOR] Sapphire (HTTP, porta 3123)
      |
      v
  [INFERÊNCIA]    Krystal (llama.cpp, portas 3124 / 3125)
```

Cada camada pode ser reiniciada, atualizada ou substituída de forma independente.

---

### Camada 1: os adaptadores (Pixieglow e Jade)

Essas são as camadas mais simples. Seu único trabalho é traduzir eventos de uma plataforma de mensagens para um protocolo padronizado em direção ao Emerald:

- **Jade** é o adaptador do Discord. Usa a biblioteca Eris para se conectar ao Discord e encaminha mensagens ao Emerald via WebSocket. Também gerencia o pipeline de TTS (síntese de voz via Piper, conversão para OGG, upload para o Discord).
- **Pixieglow** é o adaptador do Matrix. Usa diretamente a API HTTP Client-Server do Matrix (sem SDK), com um long-poll sync. Não tem TTS.

Os dois adaptadores compartilham o mesmo protocolo WebSocket definido em `emerald-client.ts`:

```typescript
type ClientId = "jade" | "pixieglow";

// Eventos (adaptador -> Emerald)
type InEvent = MessageEvent | ReadyEvent | BotMessageEvent | PresenceEvent;

// Comandos (Emerald -> adaptador)
type OutCommand = RespondCommand | TypingCommand | SetPresenceCommand
                | SpontaneousCommand | ForgotCommand;
```

A existência de dois adaptadores com a mesma interface prova que o compartilhamento funciona: **o mesmo "cérebro" (Emerald) atende indiferentemente um bot do Discord e um bot do Matrix**, com comportamentos idênticos. O protocolo é declarativo: o Emerald não diz ao adaptador *como* enviar uma mensagem, ele diz *o quê* enviar (o texto com um atraso, possivelmente um plano de burst, uma reação, etc.). Cada adaptador implementa a execução concreta de acordo com sua plataforma.

É essa a força dessa arquitetura: para adicionar suporte ao Telegram, Signal, ou qualquer outra plataforma, basta escrever um adaptador que implemente o protocolo WebSocket.

---

### Camada 2: o cérebro (Emerald)

O Emerald é o serviço central de decisão. Ele escuta na porta 3126 via WebSocket e gerencia:

- **A avaliação de gatilhos**: menção, DM, nome, palavra-chave, follow-up, aleatório
- **A simulação comportamental**: atrasos de concentração, erros de digitação, hesitações, esquecimentos, burst, fadiga temática
- **Os ciclos de sono**: modos sleep / slow / short
- **O gerenciamento de sessões**: cooldown, limites de sessão, anti-spam
- **O roteamento para o Sapphire**: envio de mensagens, recepção de respostas em streaming

O Emerald é o serviço central que possibilitou o compartilhamento, e é o que mais se beneficiou da separação. Antes, cada comportamento (erro de digitação, burst, hesitação) estava emaranhado com o código do Discord. Agora eles estão em módulos dedicados dentro de `behavior/`:

```
emerald/src/behavior/
  burst.ts         -- Planejamento de mensagens em burst
  mannerisms.ts    -- Atrasos, hesitações, reações, esquecimentos
  sleep.ts         -- Avaliação dos horários de sono
  typo.ts          -- Simulação de erros de digitação (AZERTY/QWERTY)
```

O cérebro não sabe em qual plataforma está rodando. Ele recebe um `MessageEvent` com um `clientId` ("jade" ou "pixieglow"), toma uma decisão e retorna um comando. O adaptador cuida do resto.

---

### Camada 3: o classificador emocional (Sapphire)

O Sapphire é o serviço tecnicamente mais interessante. É um **middleware de LLM** escrito em Python com FastAPI, que desempenha quatro papéis críticos:

1. **Classificador binário FÚTIL / INTERESSANTE** via centroides de embeddings
2. **Avaliador emocional** (valência / ativação) via centroides
3. **Roteador de backends** para o Krystal (modelo pequeno vs modelo grande)
4. **Injetor few-shot** e gerenciador de sessões

#### Os centroides: o coração da classificação

Um **centroide** é um conceito simples: é a média de um conjunto de vetores de embeddings. Na prática, reuni centenas de mensagens de exemplo, passei-as por um modelo de embedding (`BAAI/bge-small-en-v1.5`, 384 dimensões), e tirei a média dos vetores obtidos.

Existem **dois centroides de classificação**:

- `futile_centroid`: a média dos embeddings de ~683 mensagens triviais via k-means (k=10, seed=42) ("lol", "ok", "hello", "nm just chillin u")
- `interessante_centroid`: a média dos embeddings de ~678 mensagens substanciais (perguntas técnicas, confidências, filosofia)

Quando uma mensagem chega:

```python
def classify(text, embedder, futile_centroids, interessante_centroids):
    emb = embedder.query_embed(text)                        # 384-D vector
    sim_f = max(cos(emb, c) for c in futile_centroids)     # max over 10
    sim_i = max(cos(emb, c) for c in interessante_centroids)     # max over 10
    diff = sim_i - sim_f
    label = "INTERESSANT" if diff > 0 else "FUTILE"
    return label, abs(diff), sim_f, sim_i
```

A similaridade de cosseno entre a mensagem e cada centroide determina a categoria. A diferença absoluta dá a confiança. É simples, rápido (sem forward pass do LLM), e surpreendentemente eficaz.

#### Por que dois modelos?

O resultado dessa classificação decide qual backend de LLM é invocado:

| Rótulo | Backend Krystal | Modelo | Porta |
|--------|------------------|--------|-------|
| `FUTIL` | `generic` | Luna-Protocol-1.5B (941 MB, Q4_K_M) | 3124 |
| `INTERESSANTE` | `semantic` | Hermes-3-3B ou 8B (conforme configuração) | 3125 |

A intuição é simples: um "lol" ou um "nm just chillin u" não merece invocar um modelo de 8 bilhões de parâmetros. O modelo pequeno Luna 1.5B fine-tuned, treinado com 200.000 amostras do Discord, é mais que suficiente para trocas leves. Já uma pergunta sobre a vida, uma confidência, ou um debate técnico é roteado para o modelo grande, que pode produzir uma resposta mais rica.

Esse roteamento econômico reduz consideravelmente a carga no servidor LLM: cerca de 70% das mensagens são classificadas como FÚTIL e tratadas pelo modelo pequeno, liberando o modelo grande para as conversas que realmente valem a pena.

#### O eixo emocional: valência e ativação (arousal)

Mas isso não é tudo. O Sapphire usa o **mesmo mecanismo de centroides** em um eixo independente para avaliar a emoção da mensagem:

Existem **quatro centroides emocionais**:

| Polo | Exemplos |
|------|----------|
| `positivo` | "hell yeah", "love that", "this is great" |
| `negativo` | "shut up", "i hate this", "this sucks" |
| `ativação alta` | "WHAT THE HELL", "omg omg omg", "AAAAA" |
| `ativação baixa` | "just chilling", "meh", "i guess" |

O score é calculado como uma diferença de similaridades em cada eixo:

```python
valence = sim(emb, positive) - sim(emb, negative)     # [-1, +1]
arousal = sim(emb, high_arousal) - sim(emb, low_arousal)  # [-1, +1]
```

A **valência** mede se a mensagem é positiva ou negativa. A **ativação (arousal)** mede sua intensidade emocional. Juntas, formam o modelo circumplexo do afeto (Russell, 1980) -- o mesmo modelo psicológico que inspirou o chatbot **PARRY** em 1972.

#### As variáveis de ressentimento: como as emoções controlam o LLM

É aqui que a inspiração do PARRY se torna tangível. O PARRY (criado por Kenneth Colby em 1972) era um chatbot projetado para simular um paciente paranoico. Ele possuía variáveis internas -- medo, raiva, desconfiança -- que alteravam suas respostas. Por exemplo, um PARRY "assustado" respondia de forma mais agressiva.

O Sapphire faz a mesma coisa, mas com variáveis contínuas e um método mais elegante: os parâmetros de amostragem do LLM são ajustados em tempo real conforme o estado emocional da conversa.

##### A temperatura segue a ativação

```python
temperature = clamp(0.7 + arousal * 0.3, 0.4, 1.0)
```

| Ativação | Temperatura | Efeito |
|----------|-------------|--------|
| -1.0 (calmo) | 0.40 | Baixa criatividade, respostas previsíveis |
| 0.0 (neutro) | 0.70 | Criatividade padrão |
| +1.0 (excitado) | 1.00 | Máxima aleatoriedade, respostas surpreendentes |

Quando alguém está excitado ou irritado (ativação alta), a temperatura sobe. O modelo produz respostas mais variadas, mais criativas, às vezes mais caóticas -- como um humano que "se empolga". Quando a conversa está calma, a temperatura cai, e as respostas ficam mais ponderadas.

##### O repeat penalty segue a valência

```python
repeat_penalty = clamp(1.15 - valence * 0.1, 1.0, 1.3)
```

| Valência | Repeat Penalty | Efeito |
|----------|-----------------|--------|
| -1.0 (negativa) | 1.25 | Penalidade forte, evita repetições |
| 0.0 (neutra) | 1.15 | Valor padrão |
| +1.0 (positiva) | 1.05 | Penalidade baixa, permite repetições |

Quanto mais negativa a conversa, mais o modelo é empurrado a evitar se repetir -- como alguém que procura as palavras em uma discussão tensa. Quanto mais positiva a conversa, mais o modelo pode se permitir afirmações redundantes, como em uma conversa relaxada.

##### O estado emocional cumulativo

Esses scores não dizem respeito apenas à mensagem imediata. Um `EmotionState` mantém uma **média móvel exponencial** de valência e ativação por sessão:

```python
class EmotionState:
    def __init__(self, decay=0.85, deadzone=0.06):
        self.decay = decay
        self.deadzone = deadzone

    def update(self, key, valence_delta, arousal_delta):
        if abs(valence_delta) < self.deadzone:
            valence_delta = 0.0
        if abs(arousal_delta) < self.deadzone:
            arousal_delta = 0.0
        s = self._state.setdefault(key, {"valence": 0.0, "arousal": 0.0})
        s["valence"] = s["valence"] * self.decay + valence_delta * (1 - self.decay)
        s["arousal"] = s["arousal"] * self.decay + arousal_delta * (1 - self.decay)
        return s
```

O `decay` de 0.85 significa que 85% do estado anterior é conservado a cada mensagem, e 15% do novo sinal é integrado. Isso cria uma **memória emocional** que suaviza variações bruscas: uma única mensagem negativa não deixa o bot "triste", mas uma série de mensagens negativas faz seu humor derivar progressivamente.

Na prática: se alguém começa uma conversa de forma muito excitada (`arousal=+0.8`), a temperatura permanece alta por várias trocas, mesmo que as mensagens seguintes sejam mais calmas. A emoção demora a baixar -- como um humano que permanece "aquecido" após uma discussão.

---

### Camada 4: a inferência (Krystal)

O Krystal é a camada mais baixa: um wrapper em torno do `llama.cpp` que expõe uma API compatível com a da OpenAI (`/v1/chat/completions`). Roda em duas instâncias PM2:

- `krystal-small`: o modelo Luna 1.5B fine-tuned, na porta 3124, com afinidade de CPU 0
- `krystal-large`: um modelo Hermes 3B, na porta 3125, com afinidade de CPU 0,1

Ambas as instâncias são processos `llama-server` pré-compilados, iniciados com `taskset` para o pinning de CPU.

O fine-tune do modelo Luna também evoluiu desde o segundo artigo: agora é treinado em **200.000 amostras** (contra 50.000 anteriormente), ainda partindo do Qwen2.5-1.5B-Instruct via QLoRA. As 200 mil amostras são um subconjunto do dataset Discord-Dialogues, filtradas para manter apenas as conversas mais naturais e diversas. O objetivo: ampliar o repertório estilístico do modelo sem perder a flexibilidade que torna o few-shot priming tão eficaz.

---

## O esquema completo: uma mensagem em trânsito

Eis o que acontece concretamente quando alguém envia "estou muito triste hoje" no Discord:

1. **Jade** recebe a mensagem via a API Gateway do Discord. Transforma-a em um `MessageEvent` e a envia ao Emerald via WebSocket.
2. **Emerald** avalia o gatilho (menção? nome? palavra-chave?). É uma menção direta. Calcula um atraso de concentração, verifica o cooldown, a sessão, a fadiga temática. Decide responder e envia a mensagem ao Sapphire via HTTP.
3. **Sapphire** gera o embedding da mensagem com `bge-small-en-v1.5`.
   - Classificação: a mensagem está mais próxima do centroide `interessante` do que do centroide `futil` (diff = +0.31) -> **INTERESSANTE**
   - Emoção: valência negativa (-0.42), ativação moderada (0.35)
   - Roteamento: direção `KRYSTAL_SEMANTIC_URL` (porta 3125, modelo grande)
   - Parâmetros de amostragem: temperatura = 0.80 (ativação aumentada), repeat_penalty = 1.19 (valência negativa)
   - O estado emocional da sessão é atualizado com esses valores
4. **Krystal** (instância large) gera a resposta com os parâmetros ajustados emocionalmente e a devolve ao Sapphire.
5. **Sapphire** transmite a resposta em streaming ao Emerald com os metadados (rótulo, valência, ativação, estatísticas de debug).
6. **Emerald** decide adicionar uma hesitação ("oh..."), planeja um burst (2 fragmentos), e escolhe uma reação. Envia um `RespondCommand` ao Jade.
7. **Jade** executa: espera o atraso inicial, envia o primeiro fragmento com a hesitação, espera 1.5s, envia o segundo fragmento. Mostra o indicador de digitação durante toda a geração.

Tudo isso em menos de 3 segundos para o usuário.

---

## Os centroides: por que são melhores que um classificador neural

A escolha dos centroides de embeddings em vez de um classificador tradicional (como o DistilBERT que eu usava antes) merece uma explicação.

Um classificador neural aprende uma fronteira de decisão entre as classes -- tipicamente uma transformação não linear que projeta as entradas em probabilidades. É preciso, mas:

- Requer dados de treinamento rotulados
- É sensível à mudança de distribuição (data drift)
- É difícil de interpretar
- Precisa ser retreinado para adicionar uma nova classe

Um centroide, por outro lado, é um **vetor médio** de embeddings de exemplos. A classificação é feita por similaridade de cosseno com esse vetor médio. Vantagens:

- **Sem treinamento**: basta calcular a média dos embeddings de exemplos escolhidos manualmente
- **Fácil de interpretar**: dá para ver quais exemplos estão mais próximos do centroide para entender "o que o centroide aprendeu"
- **Adição de uma classe**: basta adicionar um novo centroide -- sem retreinamento
- **Robusto**: o centroide é uma média, então os outliers têm pouco impacto

O verdadeiro poder dos centroides é que eles transformam um problema de classificação em um problema de **medição de distância espacial**. Dá para visualizar as categorias como regiões em um espaço de 384 dimensões (ou em 2D/3D após uma redução dimensional PCA/t-SNE).

### Visualização 3D dos centroides

Na prática, é assim que os centroides de classificação se parecem no espaço de embeddings. Cada ponto é uma mensagem de exemplo, projetada em 3D via PCA (as 384 dimensões originais são reduzidas a 3 para a visualização). Os pontos azuis são mensagens fúteis, os pontos amarelos são mensagens interessantes. Os **20 marcadores de diamante** são os centroides k-means (10 por classe) são os centroides calculados -- a média de cada grupo. Passe o mouse sobre um ponto para ver o texto original do exemplo.

<iframe src="assets/centroids-plot.html" style="width:100%;height:550px;border:none;border-radius:8px;" loading="lazy" title="Classificação por centroides - visualização 3D interativa"></iframe>

Dois exemplos são exibidos em vermelho: "lol" (classificado como fútil) e "i feel sad today" (classificado como interessante). "lol" cai na nuvem azul dos fúteis, enquanto "i feel sad today" fica do lado dos pontos amarelos. A separação é visível mesmo após uma redução a 3 dimensões (apenas 14,7% da variância total explicada). Em 384 dimensões, a fronteira é bem mais nítida.

O centroide da mensagem de entrada se desloca nesse espaço conforme seu conteúdo. A classificação FÚTIL/INTERESSANTE consiste simplesmente em medir qual centroide está mais próximo por similaridade de cosseno. Assim, é possível representar cada mensagem como um ponto em um espaço multidimensional, com cada dimensão correspondendo a uma propriedade semântica.

---

## O que isso muda na prática

Os usuários não veem as camadas, os centroides, ou os ajustes de temperatura. Mas sentem os efeitos:

- **Respostas mais rápidas** para mensagens simples (o modelo pequeno é 2x mais rápido e cuida de 70% do tráfego)
- **Tom adaptativo**: se você está irritado, o bot "sente" a irritação e adapta seu estilo
- **Consistência entre plataformas**: um bot do Matrix e um bot do Discord compartilham o mesmo cérebro e o mesmo estado emocional
- **Sem "modo assistente"**: o fine-tune + few-shot + roteamento inteligente evita respostas corporativas

A passagem para 200 mil amostras de treinamento no modelo pequeno reforçou ainda mais esses efeitos: o modelo captura melhor a diversidade das conversas do Discord sem perder a maleabilidade proporcionada pelo few-shot priming.

---

## A infraestrutura completa

Estes são os serviços atualmente em execução:

| Serviço | Tecnologia | Porta(s) | Papel |
|---------|------------|----------|-------|
| Pixieglow | TypeScript (Bun) | -- | Adaptador do Matrix |
| Jade | TypeScript (esbuild) | -- | Adaptador do Discord |
| Emerald | TypeScript (Bun) | 3126 (WebSocket) | Cérebro / decisões |
| Sapphire | Python (FastAPI) | 3123 (HTTP) | Classificador + emoção |
| Krystal small | llama.cpp (PM2) | 3124 | Modelo pequeno (1.5B, fútil) |
| Krystal large | llama.cpp (PM2) | 3125 | Modelo grande (3B+, interessante) |

As dependências entre os serviços são unidirecionais: o adaptador depende do Emerald, o Emerald depende do Sapphire, o Sapphire depende do Krystal. Sem ciclos. Cada serviço pode ser reiniciado de forma independente.

---

## Conclusão

Dividir o Luna Protocol em quatro camadas não foi apenas um exercício de arquitetura. Foi uma resposta a limitações concretas: a impossibilidade de suportar o Matrix, a falta de consciência emocional, a ausência de priorização inteligente de mensagens.

Hoje, o sistema é mais robusto (uma queda do LLM não mata o bot), mais extensível (um adaptador do Telegram ou WhatsApp seguiria o mesmo protocolo WebSocket), e mais "vivo": o bot adapta seu comportamento, seu tom, e até os parâmetros do LLM ao estado emocional percebido da conversa.

Os centroides de embeddings são a peça-chave que torna tudo isso possível sem complexidade excessiva: nenhuma rede neural treinada, nenhum pipeline de dados rotulados, apenas médias de vetores e similaridades de cosseno. É uma técnica simples, incrivelmente eficaz, e terrivelmente subestimada.

| Recurso | Link |
|---------|------|
| Site do projeto | [protocol-luna.github.io](https://protocol-luna.github.io/) |
| Pixieglow | [protocol-luna/pixieglow](https://github.com/protocol-luna/pixieglow) |
| Emerald | [protocol-luna/emerald](https://github.com/protocol-luna/emerald) |
| Sapphire | [protocol-luna/sapphire](https://github.com/protocol-luna/sapphire) |
| Krystal | [protocol-luna/krystal](https://github.com/protocol-luna/krystal) |
| Artigo 1: o bot do Discord | [Luna Protocol: criei um bot do Discord autônomo](/articles/pt/luna-protocol-discord-bot) |
| Artigo 2: o fine-tuning | [Luna Protocol: por que fiz o fine-tuning de um modelo de 1,5B](/articles/pt/luna-protocol-official-models) |