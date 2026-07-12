---
title: "Luna Protocol: 인간을 모방하는 자율 Discord 봇을 만들었다"
description: "Luna Protocol은 로컬 LLM을 갖춘 완전 자율 Discord 봇으로, 수면, 오타, 망설임, 망각, 주제별 피로 및 자발적 메시지를 통한 자연스러운 대화가 가능합니다."
date: 2026-07-11
tags:
  - discord-bot
  - llm
  - typescript
  - 이벤트-주도-아키텍처
  - 인공지능
  - 오픈소스
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "GZLwdrcxtrdWHEuozui5y4jE0/f/kHV+KkKeXB3Hg90B4zWld3R0zLsAj4rY0IQuOBFaExMWvKNzMiU3XhqTNw=="
---

# Luna Protocol: 인간을 모방하는 자율 Discord 봇을 만들었다
Discord 봇이 **잠을 자고**, **오타를 내고**, **망설이고**, **답변을 잊고**, 때로는 스스로 메시지를 보낸다면? 그것이 바로 **Luna Protocol**이 하는 일: 로컬 LLM (llama.cpp)을 실행하고 불완전한 인간처럼 대화하는 완전히 자율적인 Discord 봇입니다.
엄격한 프롬프트도 로봇 같은 답변도 없습니다. Luna에는 **우선순위 트리거 시스템**, **가변 지연**, **수면 스케줄**, **자발적 메시지**, 심지어 음성 메시지를 보내기 위한 **TTS 파이프라인**이 있습니다. 모든 것이 간단한 `config.yml` 파일로 핫 리로드 가능합니다.
이 기사에서는 전체 아키텍처를 분석합니다: 범용 이벤트 버스부터 TTS 파이프라인까지, 트리거 시스템, 인간 구성 요소, 파인튜닝 데이터셋을 포함하여.
![아키텍처 개요 -- 전역 구성 요소와 데이터 흐름](/images/luna-protocol/01-architecture-overview.svg)

---

## 아키텍처: 타입화된 이벤트 버스

Luna의 핵심은 **TypedBus** -- 강한 타입이 지정된 제네릭 이벤트 버스(TypeScript)입니다. 모든 것의 기본이 되는 블록입니다.

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

여기서 두 개의 메인 버스가 파생됩니다:

- **`llmBus`** -- LLM 토큰, 오류, 충돌, 리셋 관리
- **`stateBus`** -- 자동 영속성과 함께 상태 변경 관리

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

이 접근 방식의 장점: 각 모듈은 나머지와 **분리**됩니다. LLM은 버스에 토큰을 발행하고, 봇이 소비하며, 상태가 자동으로 업데이트됩니다. 순환 의존성이 없습니다.

---

![Message Processing -- flux complet de traitement d'un message](/images/luna-protocol/02-message-processing.svg)

## 트리거 시스템: Luna가 언제 응답하는지 누가 결정하는가

Chaque message entrant est évalué par `evaluateMessage()` qui retourne un `TriggerResult` avec une raison de déclenchement. L'ordre de priorité est critique :

| # | Raison | Conditions | Bypass ignore | Bypass pause |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | Oui (0%) | Oui |
| 2 | `dm` | MP avec `replyInDM = true` | Oui (0%) | Non |
| 3 | `name` | "Luna"/"Pixie"/alias (mot entier) | Non (8%) | Non |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (mot entier) | Non (8%) | Non |
| 5 | `follow-up` | Bot était dernier locuteur + < 15s + < 3 / 60s | -- | -- |
| 6 | `random` | 1.5% de chance sur les messages non correspondants | Non (8%) | Non |

Le matching est **mot entier** (`\b`) : "ai" ne correspond pas à "mais", "vrai", "lait".

![Trigger evaluation -- décision d'entrée pour chaque message](/images/luna-protocol/03-trigger-evaluation.svg)

### 팔로업 메커니즘

Quand Luna répond à un message, elle s'enregistre comme `lastSpeaker`. Tout message suivant dans les 15 secondes déclenche une réponse **immédiate** -- pas de timer, pas de vérification de keyword. Budget : 3 follow-ups par fenêtre de 60 secondes.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### 쿨다운

동일한 채널에서 두 응답 사이의 8초. 멘션과 팔로업으로 우회.

---

## 인간적 행동: 가변 집중도

C'est ici que Luna devient intéressante. Chaque type de déclenchement a ses propres **seuils de concentration** : un délai min/max, une chance d'ignorer, et une chance de réagir.

| Trigger | Délai min | Délai max | Ignore | Réaction |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

지연 계산은 다음도 고려합니다:
- **메시지 길이**: 메시지가 길수록 Luna가 "읽는" 데 시간이 더 걸립니다
- **비활성화**: Luna가 10분 동안 활동하지 않으면 지연이 2배로 증가합니다("깨어남" 시뮬레이션)
- **수면**: `slow` 모드에서는 지연이 3~5배로 증가합니다

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
  delay *= 0.5 + Math.random() * 1.5; // jitter agressif
  return delay;
}
```

---

## 수면 스케줄

Luna는 잘 수 있습니다. `config.yml`로 구성 가능:

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

| Mode | Effet |
|------|-------|
| `sleep` | Seules les mentions et MP passent |
| `slow` | Délai ×3-5, réactions quasi nulles |
| `short` | Chance d'ignore +30%, réactions quasi nulles |

수면 시간 동안 Discord 상태가 `invisible`로 변경됩니다.

---

## 오타

Luna는 오타를 낼 수 있습니다 -- 2-4초 후에 수정합니다. 키보드 레이아웃은 구성 가능(AZERTY 또는 QWERTY).

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... 인접한 모든 키
};
```

Exemple AZERTY : `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`.

세 가지 수정 스타일:

| Style | Comportement |
|-------|-------------|
| `edit` | Édite le message |
| `message` | Nouveau message : `word*` |
| `mixed` | 50/50 aléatoire (défaut) |

---

## 망설임과 망각

**Hésitations** : 15% de chance de commencer par un mot de remplissage (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**Oublis** : même après avoir matché un trigger, Luna peut "oublier" de répondre avec une probabilité de 3%. Pas de message, pas de réaction -- comme si elle n'avait rien vu.

**Fatigue thématique** : si un mot revient trop souvent dans les 10 derniers messages (seuil : 3 occurrences), les délais sont multipliés et la chance d'ignore augmente de 15%.

---

## LLM 파이프라인: 두 가지 모드

### `direct` 모드 (기본값)

봇은 HTTP로 로컬 `llama-server`에 직접 요청을 보냅니다. 모델은 프롬프트 캐시와 4개의 동시 슬롯으로 공유됩니다. 2개의 PM2 프로세스: LLM 서버와 봇 클라이언트.

### `online` 모드

봇은 OpenAI 호환 API(OpenAI, OpenRouter, Groq, Together...)를 호출합니다. 로컬 LLM이 필요하지 않습니다.

### 실시간 스트리밍

Le LLM stream sa réponse ligne par ligne (`\n`). Chaque ligne est découpée en mots, émis un par un sur `llmBus.emit("token", word)`. À chaque `\n`, un événement `flush` est émis -- le bot envoie immédiatement le message accumulé. Pas de délai simulé : le rythme est celui du LLM.

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

큐(`requestQueue`)는 요청을 하나씩 처리하며, 100개 요소를 초과하면 자동 정리됩니다.

---

## 자발적 메시지

Toutes les 5 minutes, 12% de chance que Luna poste un message de son propre chef. 서버는 **선형 가중치** 시스템으로 선택됩니다: 가장 활발한 서버가 마지막 서버보다 N× 많은 확률을 가집니다.

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

지난 5개 메시지의 컨텍스트가 읽히고, Luna가 "자연스럽게" 대화에 참여합니다.

---

## TTS 파이프라인: 음성 메시지

Avec 8% de chance, Luna envoie un message vocal au lieu de texte. La pipeline complète :

1. **Piper TTS** synthétise le texte en WAV
2. **ffmpeg** convertit en OGG
3. Le waveform est calculé pour l'aperçu Discord
4. Le fichier est uploadé via l'API Discord CDN
5. Le message vocal est envoyé

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

![TTS Pipeline -- du texte synthétisé au message vocal Discord](/images/luna-protocol/10-tts-pipeline.svg)

---

## 스팸 방지와 지속성

### 안티스팸

`channelId:userId`별 큐. 사용자당 채널당 큐에 하나의 메시지만. 현재 응답이 완료되면 즉시 처리됩니다.

### 세션 제한

8번의 교환 후, Luna는 30초의 휴식을 취합니다. 카운터는 3분의 비활성화 후 재설정됩니다.

### 자동 지속성

Chaque mutation d'état émet sur `stateBus` → sauvegarde automatique (debounce 500ms). Plus besoin d'appels `saveAllState()` manuels. L'état persisté inclut : pendingMessages, paused, cooldowns, timestamps, lastSpeaker, compteurs de follow-up.

---

## 핫 리로드 설정

`config.yml` 파일 하나. 대부분의 값은 **핫 리로드 가능** -- 재시작 없이 변경 사항이 적용됩니다.

| Catégorie | Hot-reload |
|-----------|-----------|
| Triggers, keywords, noms | ✅ |
| Concentration, délais | ✅ |
| Typos, burst, fatigue | ✅ |
| Sleep schedules | ✅ |
| TTS, voice messages | ✅ |
| Discord token, LLM mode | ❌ (redémarrage requis) |

```typescript
// config.ts -- 게터가 실시간 값을 반환합니다
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## 데이터셋: Discord-Dialogues

Le modèle est fine-tuné sur [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) : **7.3M échanges**, **17M tours**, **140M mots**. Des vraies conversations Discord printemps-été 2025, filtrées (PII, ToS, bots, commandes). Apache 2.0.

| Métrique | Valeur |
|----------|--------|
| Échantillons | 7 303 464 |
| Tours totaux | 16 881 010 |
| Mots totaux | 139 922 950 |
| Tokens moyens | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

사용된 양자화 모델은 GGUF입니다(예: `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Distribution du dataset Discord-Dialogues](/images/luna-protocol/dataset-distribution.svg)

---

![Complete Lifecycle -- comportement complet du bot du message à la réponse, incluant les timers et cas limites](/images/luna-protocol/22-complete-lifecycle.svg)

## 아키텍처 다이어그램

`state-machines/` 폴더에는 소스 코드 전체를 다루는 **24개의 Mermaid 다이어그램**이 포함되어 있습니다. 각 다이어그램에는 인간 언어로 된 상세한 설명이 있습니다.

가장 중요한 것들:

| # | Diagramme | Type |
|---|-----------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (complet) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 backends) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

이 다이어그램은 수신 메시지부터 응답까지의 전체 흐름을 이해하기 위한 금광입니다. 타이머와 엣지 케이스를 포함합니다.

---

## 트리거 상세 코드

트리거는 `state/trigger.ts`의 `evaluateMessage()`에 의해 평가됩니다. 전체 로직:

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

  // ... 이름, 키워드, 팔로업, 랜덤 매칭
}
```

정규식 캐시(`hasWordCache`)는 각 메시지에서 패턴 재컴파일을 방지합니다.

---

## 리액션

Luna는 이모지로 메시지에 반응합니다. 서버 사용자 정의 이모지를 사용할 확률 30%, 유니코드 이모지 70%. 리액션은 집중 지연 후에 트리거되며 즉시는 아닙니다.

Luna 메시지에 대한 리액션 명령:
- ❌ → Stop
- ▶️ → Start
- 🗑️ → Clear

---

## 응답 스타일

응답 스타일은 Luna의 최근 채널 활동에 따라 가중치가 부여됩니다:

| Contexte | messageReference | mentionRepliedUser | Poids |
|----------|-----------------|-------------------|-------|
| Froid | true | false | 70% |
| Froid | true | true | 20% |
| Froid | false | false | 10% |
| Actif | true | false | 50% |
| Actif | true | true | 15% |
| Actif | false | false | 30% |
| Actif | false | true | 5% |

DM에서는 `messageReference`가 항상 `false`입니다.

---

## 버스트 메시지

Avec 15% de chance, une réponse est découpée en 2-3 fragments envoyés au rythme humain (1.5-4 secondes entre chaque fragment). Simule quelqu'un qui tape en plusieurs fois.

![Timing Gantt -- temps d'attente réels pour les délais, réactions, streaming LLM et corrections](/images/luna-protocol/21-timing-gantt.svg)

---

## 동적 상태

Luna의 Discord 상태는 15분마다 구성된 여러 프리셋을 전환합니다. 지원되는 유형: Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). 수면 중 상태가 `invisible`로 변경됩니다.

```yaml
dynamic_status_presets:
  - status: online
    text: "픽셀로"
    type: 0       # Playing
  - status: idle
    text: "백색 소음"
    type: 2       # Listening
```

무작위 지터(×0.5-1.0)는 예측 가능한 회전을 방지합니다. 반복을 피하기 위해 10%의 시도가 건너뜁니다.

## 타이핑 표시기

LLM을 호출하기 전에 Luna는 `startTyping()`을 호출합니다. `setInterval`이 생성 중 8초마다 인디케이터를 새로고침합니다. `finally`에서 정리됩니다(`clearInterval`).

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

## 크래시 후 복구

Si le LLM crash (processus `llama-server` qui meurt), Luna détecte l'événement via `llmBus.emit("crash", code)` et tente de redémarrer avec un backoff exponentiel. Évite les boucles de redémarrage infini.

## LLM 매개변수

매개변수가 `src/config.ts`에 하드코딩되어 있습니다:

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

Le template ChatML (`<|im_start|>/<|im_end|>`) est utilisé. Le nombre de threads est auto-détecté via `os.cpus().length`.

---

## 설정

```bash
npm install
cp config.example.yml config.yml
# éditer config.yml
npm run dev                    # dev (hot reload)
npm run build && npm start     # production
```

| Script | Description |
|--------|-------------|
| `build` | Bundle CLI autonome |
| `start` | Lance le bot |
| `lint` / `format` / `check` | Biome |
| `test` | Tests (Bun) |
| `download-model` | GGUF depuis HuggingFace |
| `diagrams` | Exporte les diagrammes Mermaid en SVG/PNG |

### PM2 배포

```bash
./start.sh   # lance llm-server + llm-client sous PM2
```

---

## 결론

Luna Protocol n'est pas juste un bot Discord avec un LLM. C'est un **système comportemental complet** qui simule les imperfections humaines : les oublis, les fautes de frappe, le sommeil, les hésitations, la fatigue. Le tout architecturé autour d'un bus d'événements typé, avec 24 diagrammes Mermaid documentant chaque flux.

Le code est open source, le dataset est public, et la configuration est hot-reloadable. Si le sujet vous intéresse, plongez dans le code -- c'est plus accessible qu'il n'y paraît.

| Ressource | Lien |
|-----------|------|
| Dépôt GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
