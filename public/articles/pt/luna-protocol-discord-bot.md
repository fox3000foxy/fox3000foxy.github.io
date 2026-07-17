---
title: "Luna Protocol: criei um bot Discord autónomo que simula um ser humano"
description: "Luna Protocol é um bot Discord totalmente autónomo com um LLM local, capaz de conversação natural com sono, erros de digitação, hesitações, esquecimentos, fadiga temática e mensagens espontâneas."
date: 2026-07-11
authors:
  - fox3000foxy
tags:
  - discord
  - llm
  - typescript
  - event-driven-architecture
  - ai
  - open-source
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "qTcsG04Xl/VI8QhhFDyFvFfikcg/cOftOI7onxHJKC1+Pzf4SA1sSncLwqknfv3B2HuIu/0m5X7Wc6G4FNw9oQ=="
---

# Luna Protocol: criei um bot Discord autónomo que simula um ser humano

E se um bot Discord pudesse **dormir**, fazer **erros de digitação**, **hesitar**, **esquecer-se** de responder, e às vezes enviar-lhe uma mensagem por iniciativa própria? É exatamente isso que o **Luna Protocol** faz: um bot Discord totalmente autónomo que executa um LLM local (llama.cpp) e conversa como um ser humano imperfeito.

Sem prompts rígidos, sem respostas robóticas. A Luna tem um **sistema de acionamento prioritário**, **atrasos variáveis**, **horários de sono**, **mensagens espontâneas**, e até uma **pipeline TTS** para enviar mensagens de voz. Tudo configurado através de um simples ficheiro `config.yml` com hot-reload.

Neste artigo, dissecamos a arquitetura completa: desde o barramento de eventos genérico até à pipeline TTS, passando pelo sistema de acionamento, os componentes humanos e o dataset de fine-tuning.

![Visão Geral da Arquitetura -- componentes globais e fluxo de dados](/images/luna-protocol/01-architecture-overview.svg)

---

## A arquitetura: um barramento de eventos tipado

O coração da Luna é um **TypedBus** -- um barramento de eventos genérico fortemente tipado em TypeScript. É o bloco fundamental sobre o qual tudo se baseia.

```typescript
type EventMap = Record<string, unknown[]>;

export class TypedBus<Events extends EventMap> {
  private listeners = new Map<keyof Events, Set<(...args: unknown[]) => void>>();

  on<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as (...args: unknown[]) => void);
  }

  emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    this.listeners.get(event)?.forEach((fn) => { fn(...args); });
  }
}
```

Dois barramentos principais derivam daqui:

- **`llmBus`** -- gere os tokens LLM, erros, crashes, reset
- **`stateBus`** -- gere as mudanças de estado com persistência automática

```
┌─────────────────────────────────────────────────────┐
│                   core/bus.ts                        │
│  TypedBus<K, V> -- on / off / once / emit            │
├──────────────────┬──────────────────────────────────┤
│   core/llm-bus   │       state/state-bus             │
│  token / done /  │     state:changed                 │
│  error / crash / │     → persistence auto            │
│  flush / ready / │                                   │
│  reset           │                                   │
└────────┬─────────┴────────┬─────────────────────────┘
         │                  │
┌──────────────────┐  ┌────▼──────────────────────┐
│ core/llm-core.ts │  │ bot.ts (Eris)             │
│ mode direct      │  │ bot/pending.ts             │
│   llama-server   │  │ bot/reactions.ts           │
│ mode online      │  │ state/trigger.ts           │
│   OpenAI API     │  │ state/state.ts             │
│                  │  │ behavior/*                 │
│                  │  │ tts/*                      │
│                  │  │ spontaneous.ts             │
└──────────────────┘  └────────────────────────────┘
```

A vantagem desta abordagem: cada módulo está **desacoplado** do resto. O LLM emite tokens no barramento, o bot consome-os, o estado atualiza-se automaticamente. Sem dependências circulares.

---

![Processamento de Mensagens -- fluxo completo de processamento de uma mensagem](/images/luna-protocol/02-message-processing.svg)

## O sistema de acionamento: quem decide quando a Luna responde?

Cada mensagem recebida é avaliada por `evaluateMessage()` que devolve um `TriggerResult` com uma razão de acionamento. A ordem de prioridade é crítica:

| # | Razão | Condições | Bypass ignorar | Bypass pausa |
|---|-------|-----------|----------------|--------------|
| 1 | `mention` | @bot | Sim (0%) | Sim |
| 2 | `dm` | MP com `replyInDM = true` | Sim (0%) | Não |
| 3 | `name` | "Luna"/"Pixie"/alias (palavra inteira) | Não (8%) | Não |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (palavra inteira) | Não (8%) | Não |
| 5 | `follow-up` | Bot era o último interlocutor + < 15s + < 3 / 60s | -- | -- |
| 6 | `random` | 1.5% de chance em mensagens não correspondentes | Não (8%) | Não |

A correspondência é de **palavra inteira** (`\b`): "ai" não corresponde a "mais", "vrai", "lait".

![Avaliação de Acionamento -- decisão de entrada para cada mensagem](/images/luna-protocol/03-trigger-evaluation.svg)

### O mecanismo de follow-up

Quando a Luna responde a uma mensagem, regista-se como `lastSpeaker`. Qualquer mensagem seguinte dentro de 15 segundos desencadeia uma resposta **imediata** -- sem timer, sem verificação de keyword. Orçamento: 3 follow-ups por janela de 60 segundos.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### O cooldown

8 segundos entre duas respostas no mesmo canal. Contornado por menções e follow-ups.

---

## Os comportamentos humanos: a concentração variável

É aqui que a Luna se torna interessante. Cada tipo de acionamento tem os seus próprios **limiares de concentração**: um atraso mínimo/máximo, uma probabilidade de ignorar e uma probabilidade de reagir.

| Trigger | Atraso min | Atraso max | Ignorar | Reação |
|---------|-----------|-----------|---------|--------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

O cálculo do atraso também considera:
- **O comprimento da mensagem**: quanto mais longa a mensagem, mais tempo a Luna demora a "ler"
- **A inatividade**: se a Luna não esteve ativa durante 10 minutos, o atraso é multiplicado por 2 (simulação de "acordar")
- **O sono**: em modo `slow`, o atraso é multiplicado por 3 a 5

```typescript
export function computeDelay(
  reason: string | null = null,
  sleepBehavior?: string | null,
  msgLength?: number,
  inactivityMs?: number
): number {
  const t = getThresholds(reason);
  let delay = t.delay_min + Math.random() * (t.delay_max - t.delay_min);
  if (msgLength) {
    const readingFactor = Math.min(msgLength / 500, 3);
    delay *= 1 + readingFactor * (0.3 + Math.random() * 0.7);
  }
  if (sleepBehavior === "slow") {
    delay *= 3 + Math.random() * 2;
  }
  delay *= 0.5 + Math.random() * 1.5; // jitter agressivo
  return delay;
}
```

---

## Os horários de sono

A Luna pode dormir. Configurável através de `config.yml`:

```yaml
timezone: "Europe/Paris"
time_schedules:
  - start: "00:00"
    end: "07:00"
    behavior: sleep
  - start: "23:00"
    end: "00:00"
    behavior: slow
  - start: "07:00"
    end: "08:00"
    behavior: short
```

| Modo | Efeito |
|------|--------|
| `sleep` | Só menções e MP passam |
| `slow` | Atraso ×3-5, reações quase nulas |
| `short` | Chance de ignorar +30%, reações quase nulas |

Durante as horas de sono, o status do Discord passa para `invisible`.

---

## Os erros de digitação

A Luna pode cometer erros de digitação -- e corrigi-los após 2-4 segundos. O layout do teclado é configurável (AZERTY ou QWERTY).

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... todas as teclas adjacentes
};
```

Exemplo AZERTY: `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`.

Três estilos de correção:

| Estilo | Comportamento |
|--------|--------------|
| `edit` | Edita a mensagem |
| `message` | Nova mensagem: `word*` |
| `mixed` | 50/50 aleatório (padrão) |

---

## As hesitações e os esquecimentos

**Hesitações**: 15% de chance de começar com uma palavra de preenchimento (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**Esquecimentos**: mesmo depois de corresponder a um trigger, a Luna pode "esquecer-se" de responder com uma probabilidade de 3%. Sem mensagem, sem reação -- como se não tivesse visto nada.

**Fadiga temática**: se uma palavra aparece demasiado vezes nas últimas 10 mensagens (limiar: 3 ocorrências), os atrasos são multiplicados e a chance de ignorar aumenta em 15%.

---

## O realismo na prática: quando fica assustador

No papel, todos esses sistemas (atrasos, erros de digitação, hesitações, esquecimentos) parecem só um truque. Na prática, juntando tudo, o resultado é impressionante -- a ponto de quem conversa com a Luna não desconfiar de nada. Aqui está uma troca real em que alguém pergunta diretamente à Luna se ela é um bot, e a conversa depois desvia para um assunto totalmente diferente, com uma naturalidade de arrepiar.

![Conversa no Discord com a Luna -- primeira troca](/images/luna-protocol/realism/realism-01.png)

O tom, as hesitações, o ritmo das respostas -- nada denuncia um bot. A Luna desvia da pergunta sobre a idade sem nunca sair do personagem.

A conversa continua fluindo naturalmente, com respostas curtas e humanas ("okay, okay", "yay", "yayy") -- exatamente o tipo de mensagem que uma pessoa mandaria no Discord.

![Conversa no Discord com a Luna -- continuação](/images/luna-protocol/realism/realism-02.png)

![Conversa no Discord com a Luna -- mudança de assunto](/images/luna-protocol/realism/realism-03.png)

![Conversa no Discord com a Luna -- a mudança de assunto continua](/images/luna-protocol/realism/realism-04.png)

![Conversa no Discord com a Luna -- fim da troca](/images/luna-protocol/realism/realism-05.png)

O que é assustador não é só a Luna "responder" -- é ela **manter uma conversa**, com opiniões aparentes, réplicas e uma linha de pensamento coerente de uma mensagem para outra. Sem o sistema de gatilhos, os atrasos de concentração e as hesitações descritos acima, essa ilusão desmoronaria em poucas mensagens.

**Pequena reviravolta**: nas capturas de tela acima, **as duas contas que estão conversando são instâncias da Luna**. `PixieGlow` e `Sujet d'SBlow` não são um humano testando um bot -- são dois bots conversando entre si, cada um "convencido" (no sentido comportamental) de estar falando com alguém "normal". Se ao ler a troca acima você presumiu que um dos dois era humano, parabéns -- você acabou de cair na armadilha exatamente como qualquer um cairia num servidor real do Discord.

É basicamente uma versão prática da **dead internet theory**: essa teoria (originalmente bem conspiratória) afirma que uma parcela crescente do conteúdo e das interações online é gerada por bots em vez de humanos, a ponto de a internet "real" e humana ter se tornado minoritária. Por muito tempo vista como exagero, ela vai ficando cada vez menos absurda à medida que sistemas como o Luna Protocol mostram que não é preciso muito poder computacional nem um modelo enorme para simular uma presença humana crível em larga escala. Duas instâncias do mesmo bot capazes de manter uma conversa longa sem nunca se entregarem dão uma ideia bem concreta de como seria uma web povoada majoritariamente por bots conversando entre si.

---

## A pipeline LLM: dois modos

### Modo `direct` (padrão)

O bot envia diretamente os pedidos para um `llama-server` local em HTTP. O modelo é partilhado, com prompt cache e 4 slots concorrentes. Dois processos PM2: o servidor LLM e o cliente bot.

### Modo `online`

O bot chama qualquer API compatível com OpenAI (OpenAI, OpenRouter, Groq, Together...). Não é necessário LLM local.

### O streaming em tempo real

O LLM faz stream da sua resposta linha a linha (`\n`). Cada linha é dividida em palavras, emitidas uma a uma em `llmBus.emit("token", word)`. A cada `\n`, um evento `flush` é emitido -- o bot envia imediatamente a mensagem acumulada. Sem atraso simulado: o ritmo é o do LLM.

```typescript
function emitWordTokens(chunk: string): void {
  const words = chunk.match(/\S+/g) ?? [];
  wordEmitQueue.push(() => {
    let i = 0;
    const emitNext = () => {
      llmBus.emit("token", words[i]);
      i++;
      if (i < words.length) {
        const delay = MIN_WORD_DELAY + Math.random() * (MAX_WORD_DELAY - MIN_WORD_DELAY);
        setTimeout(emitNext, delay);
      } else {
        llmBus.emit("flush");
      }
    };
    emitNext();
  });
}
```

A fila de espera (`requestQueue`) processa os pedidos um a um, com limpeza automática quando a fila excede 100 elementos.

---

## As mensagens espontâneas

A cada 5 minutos, 12% de chance de a Luna publicar uma mensagem por iniciativa própria. O servidor é selecionado por um sistema de **peso linear**: o servidor mais ativo tem N× mais hipóteses que o último.

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

O contexto das últimas 5 mensagens é lido, e a Luna junta-se à conversa "naturalmente".

---

## A pipeline TTS: mensagens de voz

Com 8% de chance, a Luna envia uma mensagem de voz em vez de texto. A pipeline completa:

1. **Piper TTS** sintetiza o texto em WAV
2. **ffmpeg** converte para OGG
3. A forma de onda é calculada para a pré-visualização do Discord
4. O ficheiro é enviado via API Discord CDN
5. A mensagem de voz é enviada

```typescript
export async function sendTextAsVoiceMessage(
  channelId: string, replyToMessageId: string, text: string
): Promise<void> {
  const safe = sanitizeForTTS(text);
  const { audio: wavBuf } = await synthesize(safe);
  const oggBuf = await wavToOgg(wavBuf);
  const durationSecs = await getAudioDuration(oggBuf);
  const waveform = buildWaveformBase64();
  const { uploadUrl, uploadFilename } = await requestUploadUrl(channelId, oggBuf.byteLength, durationSecs);
  await putFileToUploadUrl(uploadUrl, oggBuf);
  await postVoiceMessage(channelId, uploadFilename, durationSecs, waveform, replyToMessageId);
}
```

![Pipeline TTS -- do texto sintetizado à mensagem de voz no Discord](/images/luna-protocol/10-tts-pipeline.svg)

---

## O anti-spam e a persistência

### Anti-spam

Fila de espera por `channelId:userId`. Apenas uma mensagem na fila por utilizador por canal. Processada assim que a resposta em curso termina.

### Limites de sessão

Após 8 trocas, a Luna faz uma pausa de 30 segundos. O contador reinicia após 3 minutos de inatividade.

### Persistência automática

Cada mutação de estado emite em `stateBus` → gravação automática (debounce 500ms). Sem necessidade de chamadas `saveAllState()` manuais. O estado persistido inclui: pendingMessages, paused, cooldowns, timestamps, lastSpeaker, contadores de follow-up.

---

## A configuração hot-reload

Um único ficheiro `config.yml`. A maioria dos valores tem **hot-reload** -- as alterações são aplicadas sem reinício.

| Categoria | Hot-reload |
|-----------|-----------|
| Triggers, keywords, nomes | ✅ |
| Concentração, atrasos | ✅ |
| Typos, burst, fatigue | ✅ |
| Sleep schedules | ✅ |
| TTS, voice messages | ✅ |
| Discord token, LLM mode | ❌ (reinício necessário) |

```typescript
// config.ts -- os getters devolvem valores live
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## O dataset: Discord-Dialogues

O modelo é fine-tunado no [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues): **7.3M trocas**, **17M turnos**, **140M palavras**. Conversas reais do Discord primavera-verão 2025, filtradas (PII, ToS, bots, comandos). Apache 2.0.

| Métrica | Valor |
|---------|-------|
| Amostras | 7 303 464 |
| Turnos totais | 16 881 010 |
| Palavras totais | 139 922 950 |
| Tokens médios | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

O modelo quantificado utilizado é um GGUF (por exemplo `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Distribuição do dataset Discord-Dialogues](/images/luna-protocol/dataset-distribution.svg)

---

![Ciclo de Vida Completo -- comportamento completo do bot da mensagem à resposta, incluindo timers e casos limite](/images/luna-protocol/22-complete-lifecycle.svg)

## Os diagramas de arquitetura

A pasta `state-machines/` contém **24 diagramas Mermaid** cobrindo a totalidade do código fonte. Cada diagrama tem uma explicação detalhada em linguagem humana.

Entre os mais importantes:

| # | Diagrama | Tipo |
|---|----------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (completo) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 backends) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

Estes diagramas são uma mina de ouro para compreender o fluxo completo: da mensagem recebida à resposta, passando pelos timers e casos limite.

---

## O código de acionamento em detalhe

O trigger é avaliado por `evaluateMessage()` em `state/trigger.ts`. Eis a lógica completa:

```typescript
export function evaluateMessage(
  message: Eris.Message, botId: string, botUsername: string, isFollowUp = false
): TriggerResult {
  if (message.author.bot) return { shouldRespond: false, reason: null, botName: "" };
  if (message.content === "-stop") return { shouldRespond: true, reason: "stop", botName: "" };
  if (message.content === "-start") return { shouldRespond: true, reason: "start", botName: "" };
  if (message.content === "-clear") return { shouldRespond: true, reason: "clear", botName: "" };

  const isMentioned = message.mentions.some((u) => u.id === botId);
  if (isMentioned) return { shouldRespond: true, reason: "mention", botName };
  if (!message.guildID) return { shouldRespond: true, reason: "dm", botName };
  if (isPaused()) return { shouldRespond: false, reason: null, botName: "" };
  if (isOnCooldown(channelId)) return { shouldRespond: false, reason: null, botName };

  // ... matching por nome, keyword, follow-up, random
}
```

A cache de regex (`hasWordCache`) evita recompilar os padrões a cada mensagem.

---

## As reações

A Luna reage a mensagens com emojis. 30% de chance de usar um emoji personalizado do servidor, 70% um emoji unicode. A reação é desencadeada após o atraso de concentração, não imediatamente.

Os comandos por reação nas mensagens da Luna:
- ❌ → Stop
- ▶️ → Start
- 🗑️ → Clear

---

## O estilo de resposta

O estilo de resposta é ponderado de acordo com a atividade recente da Luna no canal:

| Contexto | messageReference | mentionRepliedUser | Peso |
|----------|-----------------|-------------------|------|
| Frio | true | false | 70% |
| Frio | true | true | 20% |
| Frio | false | false | 10% |
| Ativo | true | false | 50% |
| Ativo | true | true | 15% |
| Ativo | false | false | 30% |
| Ativo | false | true | 5% |

Em MP, `messageReference` é sempre `false`.

---

## As mensagens em rajada

Com 15% de chance, uma resposta é dividida em 2-3 fragmentos enviados ao ritmo humano (1.5-4 segundos entre cada fragmento). Simula alguém que escreve em várias vezes.

![Timing Gantt -- tempos de espera reais para atrasos, reações, streaming LLM e correções](/images/luna-protocol/21-timing-gantt.svg)

---

## O status dinâmico

O status do Discord da Luna alterna entre várias predefinições configuradas, rodando a cada 15 minutos. Tipos suportados: Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). Durante o sono, o status passa para `invisible`.

```yaml
dynamic_status_presets:
  - status: online
    text: "com os pixels"
    type: 0       # Playing
  - status: idle
    text: "ruído branco"
    type: 2       # Listening
```

Um jitter aleatório (×0.5-1.0) evita rotações previsíveis. 10% das tentativas são saltadas para evitar repetição.

## O indicador de escrita

Antes de chamar o LLM, a Luna chama `startTyping()`. Um `setInterval` atualiza o indicador a cada 8 segundos durante a geração. Limpo no `finally` (`clearInterval`).

```typescript
const startTyping = () => {
  client.sendChannelTyping(message.channel.id);
  typingIntervals.set(
    message.channel.id,
    setInterval(() => {
      client.sendChannelTyping(message.channel.id);
    }, 8000)
  );
};
```

## A recuperação após crash

Se o LLM crashar (processo `llama-server` que morre), a Luna deteta o evento através de `llmBus.emit("crash", code)` e tenta reiniciar com um backoff exponencial. Evita loops de reinício infinito.

## Os parâmetros LLM

Os parâmetros estão hardcodados em `src/config.ts`:

```yaml
temp: 0.75
dynatemp-range: 0.15
top-k: 40
top-p: 0.95
min-p: 0.05
repeat-penalty: 1.12
repeat-last-n: 256
presence-penalty: 0.1
batch: 4096
ubatch: 256
context: 4096
```

O template ChatML (`<|im_start|>/<|im_end|>`) é utilizado. O número de threads é auto-detetado via `os.cpus().length`.

---

## Configuração

```bash
npm install
cp config.example.yml config.yml
# editar config.yml
npm run dev                    # dev (hot reload)
npm run build && npm start     # produção
```

| Script | Descrição |
|--------|-----------|
| `build` | Bundle CLI autónomo |
| `start` | Inicia o bot |
| `lint` / `format` / `check` | Biome |
| `test` | Testes (Bun) |
| `download-model` | GGUF do HuggingFace |
| `diagrams` | Exporta os diagramas Mermaid para SVG/PNG |

### Implantação PM2

```bash
./start.sh   # inicia llm-server + llm-client sob PM2
```

---

## Conclusão

O Luna Protocol não é apenas um bot Discord com um LLM. É um **sistema comportamental completo** que simula as imperfeições humanas: esquecimentos, erros de digitação, sono, hesitações, fadiga. Tudo arquitetado em torno de um barramento de eventos tipado, com 24 diagramas Mermaid a documentar cada fluxo.

O código é open source, o dataset é público e a configuração tem hot-reload. Se o assunto lhe interessar, mergulhe no código -- é mais acessível do que parece.

| Recurso | Link |
|---------|------|
| Repositório GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
