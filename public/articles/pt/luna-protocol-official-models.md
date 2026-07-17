---
title: "Luna Protocol: por que eu fine-tunei um modelo de 1,5B em 50k amostras do Discord e tornei o few-shot priming a arma secreta"
description: "Um modelo menor treinado com menos dados pode superar um maior -- se você souber como prepará-lo. Veja por que o Luna Protocol trocou um Hermes 3B por um fine-tune Qwen 1,5B, e por que o few-shot priming se tornou o verdadeiro diferencial."
date: 2026-07-17
authors:
  - fox3000foxy
tags:
  - discord
  - llm
  - fine-tuning
  - few-shot-learning
  - qwen
  - unsloth
  - open-source
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "CB266ludihK871mUfTEYZKS1YVs3hcOoykMwHEeIRHjZ/MCLhfnBHyAHMz+4DldQWLPGAgZmRmu6Rz4KN7IEEw=="
---

# Luna Protocol: por que eu fine-tunei um modelo de 1,5B em 50k amostras do Discord e tornei o few-shot priming a arma secreta

No [primeiro artigo](/articles/en/luna-protocol-discord-bot), eu construí um bot do Discord que simula um ser humano -- sono, erros de digitação, hesitações, esquecimentos, mensagens espontâneas. O sistema comportamental era sólido. O LLM por trás dele era um modelo Hermes 3B, quantizado em Q8_0, consumindo 3 GB de VRAM.

Funcionava. Mas era exagero.

Um bot do Discord não precisa de um modelo de 3B de parâmetros para dizer "nm just chillin, u". O que ele precisa é de **consistência de estilo** -- a capacidade de manter um tom conversacional específico, mensagem após mensagem, sem derivar para o modo assistente corporativo. E acontece que um modelo menor, treinado com menos dados e preparado com alguns exemplos, faz isso melhor do que um modelo maior tentando forçar o caminho com um prompt de sistema.

Este artigo é sobre os modelos oficiais do Luna Protocol: por que eles existem, por que são 1,5B em vez de 3B, por que 50k amostras de treinamento em vez de 7,3M, e por que o few-shot priming passou de algo "bom ter" para o núcleo de toda a abordagem.

---

## O problema com o modelo 3B

A configuração original usava `Discord-Micae-Hermes-3-3B.Q8_0.gguf` -- um modelo de 3B parâmetros fine-tunado em dados do Discord. Ele produzia boas respostas, mas:

| Métrica | Hermes-3-3B Q8_0 | Alvo |
|--------|-------------------|--------|
| Uso de VRAM | ~3 GB | < 1 GB |
| Geração de tokens | ~30 tok/s | ~60+ tok/s |
| Tamanho do arquivo do modelo | ~3,2 GB | < 1 GB |
| Tempo de inicialização a frio | ~8s | ~3s |

Para um bot rodando 24/7 em um servidor modesto, 3 GB de VRAM é muito. E a velocidade de geração -- embora aceitável para mensagens ocasionais -- parecia lenta durante respostas em rajada ou quando vários canais estavam ativos.

A pergunta era: podemos obter o mesmo estilo Discord-Dialogues com metade dos parâmetros?

---

## A decisão do fine-tuning: por que 50k, não 7,3M

O conjunto de dados [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) contém **7,3M de trocas** e **17M de turnos**. É um corpus massivo de conversas reais do Discord. A abordagem óbvia seria treinar no conjunto completo.

Eu fiz o oposto. Treinei em **50.000 amostras** -- menos de 1% dos dados disponíveis.

Eis o porquê: **o tamanho do conjunto de treinamento afeta diretamente o quanto o modelo se superajusta à sua distribuição de treinamento**.

Um modelo treinado em 7,3M de exemplos aprende uma distribuição estatística muito específica de conversas. Ele se torna excelente em reproduzir essa distribuição, mas também se torna **rígido** -- tem menos flexibilidade para se adaptar a novos padrões fornecidos no momento da inferência.

Um modelo treinado em 50k exemplos aprende o tom geral e o registro das conversas do Discord (informal, curto, abreviações, minúsculas), mas retém flexibilidade suficiente para ser **guiado por exemplos em contexto**. Os exemplos few-shot não lutam contra uma distribuição massiva aprendida -- eles complementam uma distribuição mais leve.

Este é o insight central: **dados de treinamento limitados tornam o few-shot priming mais eficiente**.

---

## O modelo: detalhes técnicos

O modelo Luna Protocol é um **fine-tune QLoRA** do [Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct):

| Parâmetro | Valor |
|-----------|-------|
| Modelo base | `unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit` |
| Método | QLoRA (4-bit) |
| Rank LoRA | `r=16`, `lora_alpha=16` |
| Módulos alvo | `q/k/v/o_proj`, `gate/up/down_proj` |
| Parâmetros treináveis | 18.464.768 / 1.562.179.072 (1,18%) |
| Dados de treinamento | ~50.000 exemplos (subconjunto do Discord-Dialogues) |
| Filtro | 8-512 tokens por amostra |
| Épocas | 2-3 |
| Hardware | Kaggle T4 |
| Framework | [Unsloth](https://github.com/unslothai/unsloth) |

O conjunto de dados é um fork pré-processado do Discord-Dialogues, filtrado para conter apenas turnos `user`/`assistant` limpos -- sem mensagens de sistema, sem metadados, sem comandos de bot. Isso é importante para o que vem a seguir.

### Quantizações disponíveis

| Arquivo | Quantização | Tamanho | Observações |
|------|-------------|------|-------|
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q2_K.gguf` | Q2_K | 676 MB | Visivelmente degradado -- não recomendado |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf` | Q4_K_M | 986 MB | Bom equilíbrio tamanho/qualidade (recomendado) |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q8_0.gguf` | Q8_0 | 1,65 GB | Melhor fidelidade de estilo |

O modelo recomendado é **Q4_K_M** -- abaixo de 1 GB, rápido e preserva bem o estilo conversacional. O Q2_K degrada demais em um modelo tão pequeno. O Q8_0 tem a melhor qualidade, mas usa 68% mais memória.

---

## O avanço do few-shot priming

Aqui está a parte que mudou tudo.

A ficha do modelo no HuggingFace tem um aviso:

> Com um prompt simples e sem preparação, este modelo tende a recair no tom de assistente padrão do Qwen. Uma preparação curta com few-shot faz uma grande diferença.

Isso não é um bug -- é uma consequência direta de como os dados de treinamento foram estruturados.

### Por que prompts de sistema sozinhos não funcionam

Os dados de treinamento do Discord-Dialogues contêm apenas turnos `user`/`assistant`. Não há **exemplos de papel de sistema** no conjunto de treinamento. O modelo nunca foi treinado para seguir prompts de sistema como diretrizes de estilo.

Quando você dá a ele um prompt de sistema como "Seu nome é Luna, fale casualmente", ele ouve a instrução, mas não tem um padrão forte aprendido de como traduzir isso em saída. Ele recai no padrão do Qwen: útil, estruturado, ligeiramente formal.

### Por que exemplos few-shot funcionam

Quando você injeta exemplos de conversa no mesmo formato ChatML em que o modelo foi treinado (usando a estrutura de turnos `user`/`assistant`), algo se encaixa. O modelo reconhece o padrão de seus dados de treinamento e alinha sua saída para corresponder.

Aqui está como um preparo few-shot parece na prática:

```yaml
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

Esses exemplos são injetados após o prompt de sistema e antes da conversa real. O modelo os vê como parte do histórico da conversa, não como instruções. Essa é uma distinção crítica -- não está sendo *instruído* a ser casual, está sendo *mostrado* como é o casual.

### Antes e depois

Sem preparação few-shot (apenas prompt de sistema):

```
User: yo whats good
Bot: Hello! I am doing well, thank you for asking. How can I assist you today?
```

Com preparação few-shot (3 exemplos):

```
User: yo whats good
Bot: nm just chillin, u
```

A diferença é gritante. O modelo não produz apenas palavras diferentes -- ele adota todo o registro: minúsculas, abreviações, tom casual, respostas curtas. Ele corresponde ao estilo dos exemplos, não ao estilo dos dados de treinamento do Qwen.

---

## Memória e velocidade: os números concretos

A troca do Hermes-3-3B para o Luna-Protocol-1.5B traz ganhos mensuráveis:

| Métrica | Hermes-3-3B Q8_0 | Luna-Protocol Q4_K_M | Melhoria |
|--------|-------------------|----------------------|-------------|
| Uso de VRAM | ~3 GB | ~986 MB | **67% menos** |
| Tamanho do arquivo do modelo | ~3,2 GB | ~986 MB | **69% menor** |
| Geração de tokens | ~30 tok/s | ~60+ tok/s | **2x mais rápido** |
| Inicialização a frio | ~8s | ~3s | **62% mais rápido** |
| Janela de contexto | 8192 | 8192 | Mesma |

### Por que o ganho de velocidade é real

Modelos menores não são apenas "menos lentos" -- eles são fundamentalmente mais rápidos para inferência. Com 1,5B de parâmetros em vez de 3B:

- **Menos multiplicações de matriz** por token: as camadas de atenção, camadas FFN e a projeção de saída escalam linearmente com a contagem de parâmetros
- **Melhor utilização de cache**: o modelo menor consegue colocar mais de seus pesos no cache L2/L3
- **Menor pressão na largura de banda da memória**: menos bytes para ler da VRAM por token

Em uma configuração modesta apenas com CPU (2 núcleos, sem GPU), o modelo de 1,5B gera tokens a aproximadamente **2x a velocidade** do modelo de 3B. Esta é a diferença entre "parece um bot" e "parece uma pessoa digitando".

### Cache de prompt amplifica a vantagem

O Luna Protocol usa `llama-server` com cache de prompt ativado (`--cache-reuse 256`). Isso significa que:

1. A primeira mensagem em uma sessão paga o custo completo de processamento do prompt (prompt de sistema + exemplos few-shot + mensagem do usuário)
2. Mensagens subsequentes processam apenas os tokens *novos* -- o prefixo em cache é reutilizado
3. Com 5 exemplos few-shot (~50-150 tokens), a sobrecarga é insignificante após a primeira requisição

Os exemplos few-shot são efetivamente "gratuitos" após a primeira mensagem em uma sessão. O modelo recebe orientação de estilo com custo marginal zero.

---

## A implementação: como funciona no código

O sistema few-shot no Luna Protocol é limpo e mínimo. Três arquivos cuidam de tudo:

### 1. Configuração (`config.yml`)

```yaml
few_shot_enabled: true
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
  - user: "whats up"
    assistant: "yooo not much, what about you"
  - user: "how was your day"
    assistant: "it was alright, nothing crazy happened lol"
```

A configuração é recarregável a quente. Altere os exemplos, salve, e o bot adota o novo estilo imediatamente -- sem necessidade de reinicialização.

### 2. Formatação e injeção (`src/core/few-shot.ts`)

A função `formatFewShotExamples()` converte os exemplos YAML em objetos de mensagem ChatML:

```typescript
export function formatFewShotExamples(
  examples: FewShotExample[],
  username = "user"
): Array<{ role: "user" | "assistant"; content: string }> {
  const messages = [];
  for (const example of examples) {
    messages.push({ role: "user", content: `${username}: ${example.user}` });
    messages.push({ role: "assistant", content: example.assistant });
  }
  return messages;
}
```

A função `injectFewShotIntoConversation()` os coloca logo após o prompt de sistema:

```typescript
export function injectFewShotIntoConversation(
  messages: Message[],
  fewShotMessages: Message[]
): Message[] {
  const systemMessage = messages[0];
  const userMessages = messages.slice(1);
  return [systemMessage, ...fewShotMessages, ...userMessages];
}
```

### 3. Integração (`src/core/llm-client.ts`)

Antes de cada chamada ao LLM, os exemplos few-shot são injetados se estiverem ativados:

```typescript
let finalMessages = messages;
if (FEW_SHOT_ENABLED && FEW_SHOT_EXAMPLES.length > 0) {
  const fewShotMessages = formatFewShotExamples(FEW_SHOT_EXAMPLES);
  finalMessages = injectFewShotIntoConversation(messages, fewShotMessages);
}
```

O modelo recebe: `[prompt_de_sistema] + [exemplos_few_shot] + [histórico_da_conversa]`

---

## Mantendo o estilo Discord-Dialogues

O conjunto de dados original Discord-Dialogues tem uma assinatura conversacional muito específica:

- **Mensagens curtas**: média de 32,8 tokens por turno
- **Registro informal**: abreviações, minúsculas, sem pontuação
- **Ida e volta rápido**: múltiplas trocas curtas em vez de longos monólogos
- **Imperfeições naturais**: erros de digitação, "lol", "fr", "ngl", "tbh"

O modelo Luna-Protocol preserva esse estilo através de dois mecanismos:

### 1. Fine-tuning desloca a distribuição base

Os 50k exemplos de treinamento ensinam ao modelo a **impressão digital estatística** das conversas do Discord. Ele aprende que as respostas são tipicamente curtas, em minúsculas e informais. Isso desloca a saída padrão do modelo para longe do modo assistente-útil do Qwen.

### 2. Few-shot priming consolida o resultado

Os exemplos few-shot reforçam exatamente os padrões que o modelo aprendeu durante o fine-tuning. Eles atuam como uma **âncora de estilo** -- mesmo que o modelo desvie ligeiramente para um tom formal durante uma conversa longa, os exemplos no contexto continuam puxando-o de volta.

A combinação é mais poderosa do que qualquer mecanismo isoladamente:
- Fine-tuning sem few-shot: o modelo é *geralmente* casual, mas inconsistente
- Few-shot sem fine-tuning: o modelo tenta seguir os exemplos, mas continua revertendo ao modo assistente
- Fine-tuning + few-shot: o modelo fica **consistentemente** no personagem

---

## A filosofia: modelo menor, prompting mais inteligente

A sabedoria convencional na implantação de LLMs é "maior é melhor". Mais parâmetros, mais dados de treinamento, mais VRAM. O Luna Protocol adota a abordagem oposta:

- **1,5B em vez de 3B**: metade dos parâmetros, metade da memória, dobro da velocidade
- **50k amostras em vez de 7,3M**: menos dados de treinamento, mais flexibilidade para aprendizado em contexto
- **Few-shot priming em vez de prompts de sistema**: mostre ao modelo o que você quer, não apenas diga

Isso não é apenas uma otimização técnica -- é uma filosofia de design. Um bot do Discord não precisa ser um assistente de propósito geral. Ele precisa dizer "nm just chillin, u" de forma consistente, rápida e sem consumir todo o orçamento de VRAM do seu servidor.

O resultado: um bot que roda em um VPS de $5/mês, gera tokens rápido o suficiente para parecer digitação em tempo real e mantém uma personalidade consistente através de uma combinação de fine-tuning e few-shot priming que é maior que a soma de suas partes.

---

## Configuração

### Baixar o modelo

```bash
npm run download-model
# Baixa Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf
```

Ou manualmente pelo [HuggingFace](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues).

### Configurar

```yaml
# config.yml
llama_model_path: "./models/Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf"
few_shot_enabled: true
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

### Executar

```bash
npm run dev                    # dev (recarga a quente)
npm run build && npm start     # produção
./start.sh                     # PM2 (produção com llama-server)
```

---

## Conclusão

Os modelos Luna Protocol provam que para IA conversacional focada em estilo, **menos é mais**. Um modelo de 1,5B treinado em 50k amostras cuidadosamente selecionadas, preparado com alguns exemplos, supera um modelo de 3B treinado em milhões de exemplos -- a uma fração do custo de memória e com o dobro da velocidade de geração.

Few-shot priming não é apenas algo "bom ter" para modelos pequenos. É o mecanismo que os torna viáveis para aplicações conversacionais em tempo real. Os exemplos não apenas "ajudam" -- eles mudam fundamentalmente como o modelo se comporta, ao corresponder exatamente ao formato em que foi treinado.

O código é open source, o modelo está no HuggingFace e o conjunto de dados é público. Se você quer construir um bot conversacional que pareça humano, a receita é: modelo pequeno, fine-tuning limitado, preparação few-shot sólida.

| Recurso | Link |
|----------|------|
| Repositório GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Modelo (HuggingFace) | [fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) |
| Conjunto de dados | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Primeiro artigo | [Luna Protocol: criei um bot autônomo para Discord](/articles/en/luna-protocol-discord-bot) |
