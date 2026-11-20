---
title: "Luna Protocol: 사람을 흉내 내는 자율 Discord 봇을 만들었어요"
description: "Luna Protocol은 로컬 LLM이 들어간 완전 자율 Discord 봇이에요. 수면과 오타, 망설임과 깜빡함, 주제 피로와 자발 메시지로 자연스럽게 대화해요."
date: 2026-07-11
tags:
  - discord
  - llm
  - typescript
  - event-driven-architecture
  - ai
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "AlF/cPAJQvnUvsxf+cRhsGqmXoo8Yl7QttsGrcMT3sw17Lehf8tzEKAg9vThVulmg9rXM+FzxTC09QiFBiJEsw=="
---

# Luna Protocol: 사람을 흉내 내는 자율 Discord 봇을 만들었어요

Discord 봇이 **잘 수** 있고, **오타**를 내고, **망설이고**, 답장을 **잊어버리고**, 가끔 먼저 메시지를 보낸다면 어떨까요? 바로 그 일을 하는 것이 **Luna Protocol**이에요. 로컬 LLM(llama.cpp)을 돌리는 완전 자율 Discord 봇으로, 불완전한 사람처럼 대화해요.

Luna는 맥락 트리거와 당당한 불완전 답장으로 동작해요. **우선순위 트리거 시스템**과 **가변 지연**, **수면 시간**, **자발 메시지**, 심지어 음성 메시지를 보내는 **TTS 파이프라인**까지 있어요. 전부 핫리로드 가능한 단순 `config.yml` 파일로 설정해요.

이 글에서는 전체 아키텍처를 뜯어봐요. 범용 이벤트 버스에서 TTS 파이프라인까지, 트리거 시스템과 인간 컴포넌트, 미세 조정 데이터셋을 거쳐요.

![아키텍처 개요: 전체 컴포넌트와 자료 흐름](/images/luna-protocol/01-architecture-overview.svg)

---

## 아키텍처: 타입화된 이벤트 버스

Luna의 심장은 **TypedBus**예요. TypeScript로 강하게 타입화된 범용 이벤트 버스. 모든 것이 기대는 기본 벽돌이에요. 처음부터 순환 의존성을 피하려고 이렇게 만들었어요.

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

여기에서 주 버스 둘이 나와요.

- **`llmBus`**: LLM 토큰과 오류, 충돌, 리셋을 다뤄요
- **`stateBus`**: 자동 영속과 함께 상태 변경을 다뤄요

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

이 접근의 이점: 각 모듈이 나머지에서 **분리**돼 있어요. LLM은 버스에 토큰을 내보내고, 봇은 소비하고, 상태는 자동으로 고쳐져요. 순환 의존성 없어요.

---

![메시지 처리: 메시지 하나의 완전한 처리 흐름](/images/luna-protocol/02-message-processing.svg)

## 트리거 시스템: Luna가 언제 답할지 누가 정하나요?

들어오는 각 메시지는 `TriggerResult`를 돌려주는 `evaluateMessage()`로 평가받고, 트리거 이유가 들어 있어요. 우선순위 순서가 중요해요.

| # | 이유 | 조건 | 무시 우회 | 일시정지 우회 |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | 예 (0%) | 예 |
| 2 | `dm` | `replyInDM = true`인 DM | 예 (0%) | 아니요 |
| 3 | `name` | "Luna"와 "Pixie", 별칭 (단어 전체) | 아니요 (8%) | 아니요 |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (단어 전체) | 아니요 (8%) | 아니요 |
| 5 | `follow-up` | 봇이 마지막 화자 + 15초 미만 + 60초에 3회 미만 | -- | -- |
| 6 | `random` | 맞지 않는 메시지에 1.5퍼센트 확률 | 아니요 (8%) | 아니요 |

매칭은 **단어 전체**(`\b`)예요. "ai"가 "mais", "vrai", "lait"에 맞지 않아요.

![트리거 평가: 각 메시지의 진입 결정](/images/luna-protocol/03-trigger-evaluation.svg)

### 후속 구조

Luna가 메시지에 답하면 `lastSpeaker`로 등록돼요. 이어지는 15초 안의 모든 메시지는 타이머와 키워드 검사를 지름길로 통과해서 바로 답장을 일으켜요. 예산: 60초 창에 후속 3회.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### 쿨다운

같은 채널에서 두 답장 사이 8초. 멘션과 후속이 우회해요.

---

## 인간 행동: 오락가락 집중

여기에서 Luna가 흥미로워져요. 각 트리거 종류는 자신만의 **집중 임계값**을 가지고 있어요. 최소와 최대 지연, 무시 확률, 반응 확률.

| 트리거 | 최소 지연 | 최대 지연 | 무시 | 반응 |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

지연 계산에는 다음도 들어가요.

- **메시지 길이**: 메시지가 길수록 Luna가 "읽는" 데 오래 걸려요
- **비활성**: Luna가 10분 동안 활동하지 않았으면 지연이 2배예요 ("잠깨기" 흉내)
- **수면**: `slow` 모드에서는 지연이 3~5배예요

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
  delay *= 0.5 + Math.random() * 1.5; // 공격적 지터
  return delay;
}
```

---

## 수면 시간

Luna는 잘 수 있어요. `config.yml`로 설정해요.

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

| 모드 | 효과 |
|------|-------|
| `sleep` | 멘션과 DM만 통과해요 |
| `slow` | 지연 3~5배, 반응 거의 없어요 |
| `short` | 무시 확률 +30퍼센트, 반응 거의 없어요 |

수면 시간에는 Discord 상태가 `invisible`로 바뀌어요.

---

## 오타

Luna는 오타를 낼 수 있고, 2~4초 뒤에 고쳐요. 키보드 레이아웃 설정 가능 (AZERTY 또는 QWERTY). 너무 깨끗하게 쓰는 봇은 바로 티가 나니 설정 가능하게 뒀어요.

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... 모든 인접 키
};
```

AZERTY 예시: `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`.

고치기 방식 셋:

| 방식 | 동작 |
|-------|-------------|
| `edit` | 메시지를 수정해요 |
| `message` | 새 메시지: `word*` |
| `mixed` | 50대 50 무작위 (기본값) |

---

## 망설임과 깜빡함

**망설임**: 채우기 말(`uh...`, `um...`, `well...`, `hmm...`, `so...`)로 시작할 확률 15퍼센트.

**깜빡함**: 트리거에 맞아도 Luna가 확률 3퍼센트로 답장을 "잊어버릴" 수 있어요. 그러면 아무것도 못 본 것처럼 완전히 조용히 있어요. 사람이 실수로 메시지를 넘기는 것을 본 적이 있으니 이 행동이 좋아요.

**주제 피로**: 단어가 최근 10개 메시지에서 너무 자주 돌아오면 (임계값: 3회) 지연이 곱해지고 무시 확률이 15퍼센트 올라가요.

---

## 실전 리얼리즘: 소름 끼칠 때

종이 위에서는 이 시스템들(지연, 오타, 망설임, 깜빡함)이 모두 장난처럼 보여요. 실제로는 이어붙이면 결과가 기가 막혀요. Luna와 대화하는 사람들은 아무것도 눈치채지 못해요. 누군가 Luna에게 직접 봇인지 묻고, 대화가 완전히 다른 주제로 흘러가는 실제 교환이 여기 있어요. 소름 끼치는 자연스러움이에요. 실제로 이렇게 믿을 만할 줄은 예상하지 못했어요.

![Luna와의 Discord 대화: 첫 교환](/images/luna-protocol/realism/realism-01.png)

톤과 망설임, 답장 리듬. 봇이라는 티가 없어요. Luna는 캐릭터를 절대 깨지 않고 나이에 대한 질문을 피해 가요.

![Luna와의 Discord 대화: 교환 이어서](/images/luna-protocol/realism/realism-02.png)

대화가 완전히 유창하게 이어져요. 짧고 자연스러운 답장("okay, okay", "yay", "yayy"). Discord에서 사람이 보낼 법한 메시지 그대로예요.

![Luna와의 Discord 대화: 주제 흘러가기](/images/luna-protocol/realism/realism-03.png)

![Luna와의 Discord 대화: 흘러가기 이어서](/images/luna-protocol/realism/realism-04.png)

![Luna와의 Discord 대화: 교환 끝](/images/luna-protocol/realism/realism-05.png)

무서운 것은 Luna가 "답장한다"는 것이 아니에요. **대화를 이어간다**는 거예요. 겉보기 의견과 추임새, 메시지에서 메시지로 일관된 생각 줄기를 가지고요. 위에 설명한 트리거 시스템과 집중 지연, 망설임이 없으면 이 착각은 몇 개 메시지 만에 무너져요.

**작은 반전**: 위 스크린샷에서 **대화하는 두 계정은 둘 다 Luna 인스턴스**예요. `PixieGlow`와 `Sujet d'SBlow`는 봇을 테스트하는 사람이 아니에요. 서로 말하는 두 봇이고, 각자(행동적 의미에서) "평범한" 누군가와 이야기한다고 믿어요. 위 교환을 읽으면서 둘 중 하나가 사람이라고 생각했다면 축하해요. 진짜 Discord 서버에서 누구나처럼 정확히 함정에 빠진 거예요.

이것은 **데드 인터넷 이론**의 실전 버전이에요. 이 이론(원래는 음모론 쪽)은 온라인 콘텐츠와 상호작용의 점점 큰 몫이 사람이 아니라 봇이 만들 것이고, "진짜" 인간 인터넷이 소수가 될 지경이라고 해요. 오래 과장으로 여겨졌지만, Luna Protocol 같은 시스템이 믿을 만한 인간 존재감을 대규모로 흉내 내는 데 큰 수단도 거대 모델도 필요 없음을 보여주면서 점점 덜 터무니없어져요. 절대 들키지 않고 긴 대화를 이어갈 수 있는 같은 봇의 인스턴스 둘. 봇끼리 말하는 봇이 대다수인 웹이 어떤 모습일지 꽤 구체적으로 보여줘요.

---

## LLM 파이프라인: 두 가지 모드

### `direct` 모드 (기본값)

봇이 로컬 `llama-server`에 바로 HTTP로 요청을 보내요. 모델은 공유되고, 프롬프트 캐시와 동시 슬롯 4개. PM2 프로세스 둘: LLM 서버와 봇 클라이언트.

### `online` 모드

봇이 OpenAI 호환 API(OpenAI, OpenRouter, Groq, Together...)를 불러요. API 키 하나면 되고, LLM은 제공자 쪽에서 돌아요.

### 실시간 스트리밍

LLM이 답장을 줄 단위(`\n`)로 스트리밍해요. 각 줄은 단어로 나뉘고 `llmBus.emit("token", word)`로 하나씩 내보내져요. `\n`마다 `flush` 이벤트가 나가요. 봇이 쌓인 메시지를 바로 보내요. 리듬이 바로 LLM 리듬을 따라가요.

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

요청 큐(`requestQueue`)가 요청을 하나씩 처리하고, 큐가 100개를 넘으면 자동 정리해요.

---

## 자발 메시지

5분마다 Luna가 먼저 메시지를 올릴 확률 12퍼센트. 서버는 **선형 가중** 시스템으로 골라요. 가장 활발한 서버가 꼴찌보다 N배 더 뽑혀요.

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

최근 5개 메시지 맥락을 읽고, Luna가 "자연스럽게" 대화에 끼어요.

---

## TTS 파이프라인: 음성 메시지

확률 8퍼센트로 Luna가 텍스트 대신 음성 메시지를 보내요. 전체 파이프라인:

1. **Piper TTS**가 텍스트를 WAV로 합성해요
2. **ffmpeg**가 OGG로 바꿔요
3. Discord 미리보기용 파형을 계산해요
4. Discord CDN API로 파일을 올려요
5. 음성 메시지를 보내요

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

![TTS 파이프라인: 합성 텍스트에서 Discord 음성 메시지까지](/images/luna-protocol/10-tts-pipeline.svg)

---

## 안티스팸과 영속

### 안티스팸

`channelId:userId`별 대기열. 채널별 사용자별 대기 메시지 하나. 진행 중인 답장이 끝나면 바로 처리해요.

### 세션 한도

교환 8회 뒤 Luna가 30초 쉬어요. 3분 비활성 뒤 카운터가 리셋돼요.

### 자동 영속

상태 변이마다 `stateBus`에 내보내면 자동 저장(디바운스 500ms). 손으로 `saveAllState()`를 부를 필요 없어요. 영속 상태에는 pendingMessages, paused, cooldowns, timestamps, lastSpeaker, 후속 카운터가 들어 있어요.

---

## 핫리로드 설정

`config.yml` 파일 하나. 대부분 값이 **핫리로드 가능**해요. 다시 시작 없이 바로 반영돼요. 진행 중인 대화를 끊지 않고 지연을 라이브로 조정하고 싶었어요.

| 범주 | 핫리로드 |
|-----------|-----------|
| 트리거, 키워드, 이름 | ✅ |
| 집중, 지연 | ✅ |
| 오타, 버스트, 피로 | ✅ |
| 수면 일정 | ✅ |
| TTS, 음성 메시지 | ✅ |
| Discord 토큰, LLM 모드 | ❌ (다시 시작 필요) |

```typescript
// config.ts -- getter가 라이브 값을 돌려줘요
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## 데이터셋: Discord-Dialogues

모델은 [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues)에 미세 조정돼요. **교환 730만 건**, **턴 1,700만**, **단어 1억 4,000만**. 2025년 봄과 여름의 진짜 Discord 대화, 필터링됨(PII, ToS, 봇, 명령어). Apache 2.0.

| 지표 | 값 |
|----------|--------|
| 샘플 | 7 303 464 |
| 총 턴 | 16 881 010 |
| 총 단어 | 139 922 950 |
| 평균 토큰 | 32.8 |
| 토크나이저 | Hermes-3-Llama-3.1-8B |

쓰는 양자화 모델은 GGUF(예를 들어 `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Discord-Dialogues 데이터셋 분포](/images/luna-protocol/dataset-distribution.svg)

---

![전체 생애주기: 타이머와 경계 경우를 포함한 봇의 메시지에서 답장까지 완전한 행동](/images/luna-protocol/22-complete-lifecycle.svg)

## 아키텍처 도식

`state-machines/` 폴더에 소스 코드 전체를 아우르는 **머메이드 도식 24개**가 있어요. 각 도식에 사람 말로 자세한 설명이 있어요.

가장 중요한 것들:

| # | 도식 | 종류 |
|---|-----------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (complet) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 backends) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

이 도식들은 완전한 흐름을 이해하는 금광이에요. 들어오는 메시지에서 답장까지, 타이머와 경계 경우를 거쳐요.

---

## 자세한 트리거 코드

트리거는 `state/trigger.ts`의 `evaluateMessage()`로 평가돼요. 전체 논리는 이렇습니다.

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

  // ... 이름과 키워드, 후속, 무작위 매칭
}
```

정규식 캐시(`hasWordCache`)가 메시지마다 패턴을 다시 컴파일하지 않아요.

---

## 반응

Luna가 이모지로 메시지에 반응해요. 서버 커스텀 이모지 30퍼센트, 유니코드 이모지 70퍼센트 확률. 반응은 집중 지연 뒤에 나가고, 답장과 같은 어긋난 리듬이에요. 읽는 시간을 가진 느낌이 들어서 이 어긋남이 좋아요.

Luna 메시지 위 반응 명령:

- ❌ → 중지
- ▶️ → 시작
- 🗑️ → 지우기

---

## 답장 스타일

Luna의 채널 내 최근 활동에 따라 답장 스타일에 가중치를 둬요.

| 맥락 | messageReference | mentionRepliedUser | 가중치 |
|----------|-----------------|-------------------|-------|
| 차가움 | true | false | 70% |
| 차가움 | true | true | 20% |
| 차가움 | false | false | 10% |
| 활발 | true | false | 50% |
| 활발 | true | true | 15% |
| 활발 | false | false | 30% |
| 활발 | false | true | 5% |

DM에서는 `messageReference`가 항상 `false`예요.

---

## 버스트 메시지

확률 15퍼센트로 답장이 2~3개 조각으로 나뉘어 사람 리듬(조각 사이 1.5~4초)으로 나가요. 여러 번에 나눠 치는 사람을 흉내 내요.

![타이밍 간트: 지연과 반응, LLM 스트리밍과 고치기의 실제 대기 시간](/images/luna-protocol/21-timing-gantt.svg)

---

## 동적 상태

Luna의 Discord 상태가 설정된 여러 프리셋을 돌고, 15분마다 바뀌어요. 지원하는 종류: Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). 수면 중에는 상태가 `invisible`로 바뀌어요.

```yaml
dynamic_status_presets:
  - status: online
    text: "avec les pixels"
    type: 0       # Playing
  - status: idle
    text: "du bruit blanc"
    type: 2       # Listening
```

무작위 지터(0.5~1.0배)가 예측 가능한 순환을 막아요. 반복을 피하려고 시도 10퍼센트는 건너뛰어요.

## 입력 중 표시기

LLM을 부르기 전에 Luna가 `startTyping()`을 불러요. `setInterval`이 만드는 동안 8초마다 표시기를 새로고쳐요. `finally`에서 정리해요 (`clearInterval`).

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

## 충돌 뒤 복구

LLM이 죽으면(`llama-server` 프로세스 사망) Luna가 `llmBus.emit("crash", code)` 이벤트로 감지하고 지수 백오프로 다시 시작을 시도해요. 무한 재시작 루프를 피해요.

## LLM 매개변수

매개변수는 `src/config.ts`에 하드코딩돼요.

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

ChatML 템플릿(`<|im_start|>/<|im_end|>`)을 써요. 스레드 수는 `os.cpus().length`로 자동 감지해요.

---

## 설치

```bash
npm install
cp config.example.yml config.yml
# config.yml 편집
npm run dev                    # 개발 (핫 리로드)
npm run build && npm start     # 프로덕션
```

| 스크립트 | 설명 |
|--------|-------------|
| `build` | 독립 CLI 번들 |
| `start` | 봇 실행 |
| `lint` / `format` / `check` | Biome |
| `test` | 테스트 (Bun) |
| `download-model` | HuggingFace에서 GGUF |
| `diagrams` | 머메이드 도식을 SVG와 PNG로 내보내기 |

### PM2 배포

```bash
./start.sh   # PM2로 llm-server + llm-client 실행
```

---

## 결론

Luna Protocol은 LLM이 들어간 Discord 봇을 훨씬 넘어요. 인간의 불완전함을 흉내 내는 **완전한 행동 시스템**이에요. 깜빡함과 오타, 수면과 망설임, 피로. 타입화된 이벤트 버스 중심 아키텍처에, 각 흐름을 문서화한 머메이드 도식 24개.

코드는 오픈 소스, 데이터셋은 공개, 설정은 핫리로드 가능. 주제에 관심 있으면 코드에 뛰어들어 보세요. 보기보다 쉬워요. 행동에 대한 많은 생각을 테스트하는 토대로 썼고, 각 모듈을 따로 가져갈 수 있어요.

| 자료 | 링크 |
|-----------|------|
| GitHub 저장소 | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| 데이터셋 | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
