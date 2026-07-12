---
title: "Luna Protocol: criei um bot Discord autônomo que simula um ser humano"
description: "Luna Protocol é um bot Discord totalmente autônomo com LLM local, capaz de conversação natural com sono, erros de digitação, hesitações, esquecimentos, fadiga temática e mensagens espontâneas."
date: 2026-07-11
tags:
  - discord-bot
  - llm
  - typescript
  - arquitetura-event-driven
  - inteligencia-artificial
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "4w0FXwWb04dcIJgBAhxP/uHWSO8GfYrMFNjfiDcR6ol63qZxw3kYn6BG8xRjs2BvxtcwIWzuaIAt/da/9rbD0w=="
---

# Luna Protocol: Criei um bot Discord autônomo que simula um ser humano
E se um bot Discord pudesse **dormir**, cometer **erros de digitação**, **hesitar**, **esquecer** de responder, e às vezes enviar uma mensagem por conta própria? É exatamente o que o **Luna Protocol** faz: um bot Discord totalmente autônomo que executa um LLM local (llama.cpp) e conversa como um ser humano imperfeito.
Sem prompts rígidos, sem respostas robóticas. Luna tem um **sistema de gatilho prioritário**, **atrasos variáveis**, **horários de sono**, **mensagens espontâneas**, e até um **pipeline TTS** para enviar mensagens de voz. Tudo configurável através de um simples arquivo `config.yml` hot-reloadable.
Neste artigo, desmontamos a arquitetura completa: do barramento de eventos genérico ao pipeline TTS, passando pelo sistema de gatilho, componentes humanos e dataset de fine-tuning.
![Visão Geral da Arquitetura -- componentes globais e fluxo de dados](/images/luna-protocol/01-architecture-overview.svg)

---

## Arquitetura: um barramento de eventos tipado

O coração da Luna é um **TypedBus** -- um bus de eventos genérico fortemente tipado em TypeScript. É o bloco fundamental sobre o qual tudo se baseia.

```typescript
type EventMap = Record<string, unknown[]>;

export class TipodBus<Events extends EventMap> {
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

Dois buses principais derivam disso:

- **`llmBus`** -- gerencia tokens LLM, erros, crashes, reset
- **`stateBus`** -- gerencia mudanças de estado com persistência automática

```
┌─────────────────────────────────────────────────────┐
│                   core/bus.ts                        │
│  TipodBus<K, V> -- on / off / once / emit            │
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

A vantagem desta abordagem: cada módulo está **desconectado** do resto. O LLM emite tokens no bus, o bot os consome, o estado é atualizado automaticamente. Sem dependências circulares.

---

![Message Processing -- Fluxo completo de processamento de mensagens](/images/luna-protocol/02-message-processing.svg)

## Sistema de gatilho: quem decide quando a Luna responde?

Cada mensagem recebida é avaliada por `evaluateMessage()` que retorna um `TriggerResult` com um motivo de ativação. A ordem de prioridade é crítica:

| # | Motivo | Condições | Bypass ignore | Bypass pause |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | Sim (0%) | Sim |
| 2 | `dm` | DM com `replyInDM = true` | Sim (0%) | Não |
| 3 | `name` | "Luna"/"Pixie"/alias (palavra inteira) | Não (8%) | Não |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (palavra inteira) | Não (8%) | Não |
| 5 | `follow-up` | Bot era o último locutor + < 15s + < 3 / 60s | -- | -- |
| 6 | `random` | 1.5% de chance nas mensagens não correspondentes | Não (8%) | Não |

O matching é de **palavra inteira** (`\b`) : "ai" não corresponde a "mais", "vrai", "lait".

![Trigger evaluation -- Decisão de entrada para cada mensagem](/images/luna-protocol/03-trigger-evaluation.svg)

### Mecanismo de follow-up

Quando a Luna responde a uma mensagem, ela se registra como `lastSpeaker`. Qualquer mensagem seguinte em 15 segundos ativa uma resposta **imediata** -- sem temporizador, sem verificação de palavra-chave. Orçamento: 3 follow-ups por janela de 60 segundos.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### Cooldown

8 segundos entre duas respostas no mesmo canal. Contornado por menções e follow-ups.

---

## Comportamentos humanos: concentração variável

É aqui que a Luna se torna interessante. Cada tipo de gatilho tem seus próprios **limites de concentração**: um atraso min/max, uma chance de ignorar, e uma chance de reagir.

| Trigger | Atraso mín | Atraso máx | Ignorar | 반응 |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

O cálculo do atraso também leva em consideração:
- **O comprimento da mensagem** : quanto mais longa a mensagem, mais tempo Luna leva para "ler"
- **A inatividade** : se Luna não estiver ativa há 10 minutos, o atraso é multiplicado por 2 (simulação do "acordar")
- **O sono** : no modo `slow`, o atraso é multiplicado por 3 a 5

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

## Horários de sono

A Luna pode dormir. Configurável via `config.yml`:

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
|------|-------|
| `sleep` | Apenas menções e DMs passam |
| `slow` | Atraso ×3-5, reações quase nulas |
| `short` | Chance de ignorar +30%, reações quase nulas |

Durante as horas de sono, o status do Discord muda para `invisible`.

---

## Erros de digitação

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
|-------|-------------|
| `edit` | Edita a mensagem |
| `message` | Nova mensagem: `word*` |
| `mixed` | 50/50 aleatório (padrão) |

---

## Hesitações e esquecimentos

**Hesitações**: 15% de chance de começar com uma palavra de preenchimento (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**Esquecimentos**: mesmo após combinar um gatilho, a Luna pode "esquecer" de responder com uma probabilidade de 3%. Sem mensagem, sem reação -- como se não tivesse visto nada.

**Fadiga temática**: se uma palavra retorna com muita frequência nas últimas 10 mensagens (limiar: 3 ocorrências), os atrasos são multiplicados e a chance de ignorar aumenta em 15%.

---

## Pipeline LLM: dois modos

### Modo `direct` (padrão)

O bot envia diretamente as requisições a um `llama-server` local via HTTP. O modelo é compartilhado, com prompt cache e 4 slots concorrentes. Dois processos PM2: o servidor LLM e o cliente bot.

### Modo `online`

O bot chama qualquer API compatível com OpenAI (OpenAI, OpenRouter, Groq, Together...). Nenhum LLM local necessário.

### Streaming em tempo real

O LLM transmite sua resposta linha por linha (`\n`). Cada linha é dividida em palavras, emitidas uma por uma em `llmBus.emit("token", word)`. A cada `\n`, um evento `flush` é emitido -- o bot envia imediatamente a mensagem acumulada. Sem atraso simulado: o ritmo é do LLM.

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

A fila (`requestQueue`) processa requisições uma por uma, com limpeza automática quando a fila excede 100 elementos.

---

## Mensagens espontâneas

A cada 5 minutos, 12% de chance de que a Luna publique uma mensagem por iniciativa própria. O servidor é selecionado por um sistema de **peso linear**: o servidor mais ativo tem N× mais chances que o último.

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

O contexto das últimas 5 mensagens é lido, e a Luna se junta à conversa "naturalmente".

---

## Pipeline TTS: mensagens de voz

Com 8% de chance, a Luna envia uma mensagem de voz em vez de texto. O pipeline completo:

1. **Piper TTS** sintetiza o texto em WAV
2. **ffmpeg** converte para OGG
3. A forma de onda é calculada para a pré-visualização do Discord
4. O arquivo é enviado via a API do Discord CDN
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

![TTS Pipeline -- Do texto sintetizado para a mensagem de voz do Discord](/images/luna-protocol/10-tts-pipeline.svg)

---

## Anti-spam e persistência

### Anti-spam

Fila por `channelId:userId`. Uma única mensagem na fila por usuário por canal. Processado assim que a resposta atual termina.

### Limites de session

Após 8 trocas, a Luna faz uma pausa de 30 segundos. O contador é redefinido após 3 minutos de inatividade.

### Persistência automática

Cada mutação de estado é emitida em `stateBus` → salvamento automático (debounce 500ms). Não há necessidade de chamadas manuais a `saveAllState()`. O estado persistente inclui: pendingMessages, paused, cooldowns, timestamps, lastSpeaker, contadores de follow-up.

---

## Configuração hot-reload

Um único arquivo `config.yml`. A maioria dos valores é **hot-reloadable** -- as alterações são aplicadas sem reinicialização.

| Categoria | Hot-reload |
|-----------|-----------|
| Triggers, keywords, noms | ✅ |
| Concentração, atrasos | ✅ |
| Typos, burst, fatigue | ✅ |
| Sleep schedules | ✅ |
| TTS, voice messages | ✅ |
| Discord token, LLM mode | ❌ (reinicialização necessária) |

```typescript
// config.ts -- os getters retornam valores ao vivo
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## Dataset: Discord-Dialogues

O modelo é fine-tuned em [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) : **7.3M trocas**, **17M turnos**, **140M palavras**. Conversas reais do Discord primavera-verão 2025, filtradas (PII, ToS, bots, comandos). Apache 2.0.

| Métrica | Valor |
|----------|--------|
| Amostras | 7 303 464 |
| Turnos totais | 16 881 010 |
| Palavras totais | 139 922 950 |
| Tokens médios | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

O modelo quantizado utilizado é um GGUF (por exemplo `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Distribuição do conjunto de dados Discord-Dialogues](/images/luna-protocol/dataset-distribution.svg)

---

![Complete Lifecycle -- Comportamento completo do bot da mensagem à resposta, incluindo temporizadores e casos extremos](/images/luna-protocol/22-complete-lifecycle.svg)

## Diagramas de arquitetura

O diretório `state-machines/` contém **24 diagramas Mermaid** cobrindo todo o código-fonte. Cada diagrama tem uma explicação detalhada em linguagem humana.

Entre os mais importantes :

| # | Diagrama | Tipo |
|---|-----------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (complet) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 backends) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

Estes diagramas são uma mina de ouro para compreender o fluxo completo: da mensagem recebida à resposta, passando pelos temporizadores e casos extremos.

---

## Código do gatilho em detalhes

O gatilho é avaliado por `evaluateMessage()` em `state/trigger.ts`. Aqui está a lógica completa:

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

  // ... matching par nom, keyword, follow-up, random
}
```

O cache de regex (`hasWordCache`) evita a recompilação dos padrões a cada mensagem.

---

## Reações

A Luna reage a mensagens com emojis. 30% de chance de usar um emoji personalizado do servidor, 70% um emoji unicode. A reação é ativada após o atraso de concentração, não imediatamente.

Comandos por reação nas mensagens da Luna:
- ❌ → Stop
- ▶️ → Start
- 🗑️ → Clear

---

## Estilo de resposta

O estilo de resposta é ponderado com base na atividade recente da Luna no canal:

| Contexto | messageReference | mentionRepliedUser | Peso |
|----------|-----------------|-------------------|-------|
| Frio | true | false | 70% |
| Frio | true | true | 20% |
| Frio | false | false | 10% |
| 활성 | true | false | 50% |
| 활성 | true | true | 15% |
| 활성 | false | false | 30% |
| 활성 | false | true | 5% |

Nas DM, `messageReference` é sempre `false`.

---

## Mensagens em rajada

Com 15% de chance, uma resposta é dividida em 2-3 fragmentos enviados no ritmo humano (1.5-4 segundos entre cada fragmento). Simula alguém digitando várias vezes.

![Timing Gantt -- Tempos de espera reais para atrasos, reações, streaming LLM e correções](/images/luna-protocol/21-timing-gantt.svg)

---

## Estado dinâmico

O status da Luna no Discord alterna entre vários predefinidos configurados, girando a cada 15 minutos. Tipos suportados: Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). Durante o sono, o status muda para `invisible`.

```yaml
dynamic_status_presets:
  - status: online
    text: "avec les pixels"
    type: 0       # Playing
  - status: idle
    text: "du bruit blanc"
    type: 2       # Listening
```

Um jitter aleatório (×0.5-1.0) evita rotações previsíveis. 10% das tentativas são puladas para evitar repetição.

## Indicador de digitação

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

## Recuperação após crash

Se o LLM crashar (o processo `llama-server` morrer), a Luna detecta o evento via `llmBus.emit("crash", code)` e tenta reiniciar com backoff exponencial. Evita loops de reinício infinitos.

## Parâmetros LLM

Os parâmetros são hardcoded em `src/config.ts`:

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

O template ChatML (`<|im_start|>/<|im_end|>`) est utilisé. O número de threads é auto-detectado via `os.cpus().length`.

---

## Configuração

```bash
npm install
cp config.example.yml config.yml
# edita config.yml
npm run dev                    # dev (hot reload)
npm run build && npm start     # production
```

| Script | Description |
|--------|-------------|
| `build` | Bundle CLI autônomo |
| `start` | Inicia o bot |
| `lint` / `format` / `check` | Biome |
| `test` | Tests (Bun) |
| `download-model` | GGUF from HuggingFace |
| `diagrams` | Exporta diagramas Mermaid em SVG/PNG |

### Déploiement PM2

```bash
./start.sh   # inicia llm-server + llm-client sob PM2
```

---

## Conclusão

Luna Protocol não é apenas um bot Discord com um LLM. É um **sistema comportamental completo** que simula as imperfeições humanas: os esquecimentos, os erros de digitação, o sono, as hesitações, a fadiga. Tudo arquitetado em torno de um bus de eventos tipado, com 24 diagramas Mermaid documentando cada fluxo.

O código é open source, o conjunto de dados é público, e a configuração é hot-reloadable. Se o assento lhes interessa, mergulhem no código -- é mais acessível do que parece.

| Recursos | Link |
|-----------|------|
| Repositório GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
