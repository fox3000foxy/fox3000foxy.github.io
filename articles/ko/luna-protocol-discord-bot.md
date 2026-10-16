---
title: "Luna Protocol: 완전 자율적으로 인간을 시뮬레이션하는 Discord 봇을 만들었습니다"
description: "Luna Protocol은 로컬 LLM을 탑재한 완전 자율 Discord 봇으로, 수면, 오타, 망설임, 건망증, 주제 피로, 자발적 메시지 등이 포함된 자연스러운 대화가 가능합니다."
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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "uDgwlg9NVzeBmVTuSMTxeC55EVkhHAfU735VBb7vx98fFzTkgZ72zbww3tnLlxJVBZL21XRklg4Z8GC4P1V2aA=="
---

# Luna Protocol: 완전 자율적으로 인간을 시뮬레이션하는 Discord 봇을 만들었습니다

Discord 봇이 **잠을** 자고, **오타**를 내고, **망설이고**, 답변을 **까먹고**, 때로는 스스로 메시지를 보낼 수 있다면? 이것이 바로 **Luna Protocol**이 하는 일입니다: 로컬 LLM(llama.cpp)을 구동하며 불완전한 인간처럼 대화하는 완전 자율 Discord 봇입니다.

딱딱한 프롬프트도, 로봇 같은 응답도 없습니다. Luna는 **우선순위 트리거 시스템**, **가변 지연 시간**, **수면 스케줄**, **자발적 메시지**, 그리고 음성 메시지를 보내는 **TTS 파이프라인**까지 갖추고 있습니다. 모든 것은 간단한 `config.yml` 파일로 핫 리로드 가능하게 설정됩니다.

이 글에서는 제네릭 이벤트 버스부터 TTS 파이프라인, 트리거 시스템, 인간적 구성 요소, 파인튜닝 데이터셋까지 전체 아키텍처를 분석합니다.

![전체 아키텍처 -- 글로벌 컴포넌트 및 데이터 흐름](/images/luna-protocol/01-architecture-overview.svg)

---

## 아키텍처: 타입드 이벤트 버스

Luna의 핵심은 **TypedBus**입니다 -- TypeScript로 작성된 강력한 타입의 제네릭 이벤트 버스입니다. 모든 것이 이 위에 구축된 기본 빌딩 블록입니다.

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

여기서 파생된 두 개의 주요 버스:

- **`llmBus`** -- LLM 토큰, 오류, 크래시, 리셋 처리
- **`stateBus`** -- 자동 저장이 포함된 상태 변경 처리

```
┌─────────────────────────────────────────────────────┐
│                   core/bus.ts                        │
│  TypedBus<K, V> -- on / off / once / emit            │
├──────────────────┬──────────────────────────────────┤
│   core/llm-bus   │       state/state-bus             │
│  token / done /  │     state:changed                 │
│  error / crash /  │     → persistence auto            │
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

이 접근 방식의 장점: 각 모듈은 나머지와 **분리**되어 있습니다. LLM이 버스에 토큰을 방출하면, 봇이 이를 소비하고, 상태가 자동으로 업데이트됩니다. 순환 의존성이 없습니다.

---

![메시지 처리 -- 메시지의 전체 처리 흐름](/images/luna-protocol/02-message-processing.svg)

## 트리거 시스템: 누가 Luna가 응답할지 결정하나요?

들어오는 모든 메시지는 `evaluateMessage()`에 의해 평가되어 트리거 이유가 포함된 `TriggerResult`를 반환합니다. 우선순위 순서가 중요합니다:

| # | 이유 | 조건 | 무시 우회 | 일시정지 우회 |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | 예 (0%) | 예 |
| 2 | `dm` | DM (`replyInDM = true`) | 예 (0%) | 아니오 |
| 3 | `name` | "Luna"/"Pixie"/별칭 (단어 전체) | 아니오 (8%) | 아니오 |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (단어 전체) | 아니오 (8%) | 아니오 |
| 5 | `follow-up` | 봇이 마지막 발화자 + < 15초 + < 3 / 60초 | -- | -- |
| 6 | `random` | 일치하지 않는 메시지에 1.5% 확률 | 아니오 (8%) | 아니오 |

매칭은 **단어 전체** (`\b`)입니다: "ai"는 "mais", "vrai", "lait"와 일치하지 않습니다.

![트리거 평가 -- 각 메시지의 입력 결정](/images/luna-protocol/03-trigger-evaluation.svg)

### 후속 메시지 메커니즘

Luna가 메시지에 응답하면 `lastSpeaker`로 등록됩니다. 15초 이내의 다음 메시지는 **즉시** 응답을 트리거합니다 -- 타이머나 키워드 확인이 없습니다. 예산: 60초 창에 3개의 후속 메시지.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### 쿨다운

같은 채널에서 두 응답 사이 8초. 멘션과 후속 메시지는 우회합니다.

---

## 인간적 행동: 가변 집중도

여기서 Luna가 흥미로워집니다. 각 트리거 유형에는 고유한 **집중도 임계값**이 있습니다: 최소/최대 지연, 무시 확률, 반응 확률.

| 트리거 | 최소 지연 | 최대 지연 | 무시 | 반응 |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

지연 계산에는 다음도 고려됩니다:
- **메시지 길이**: 메시지가 길수록 Luna가 "읽는" 데 시간이 더 걸림
- **비활성 시간**: Luna가 10분 이상 활동하지 않은 경우 지연이 2배 (각성 시뮬레이션)
- **수면**: `slow` 모드에서는 지연이 3~5배 증가

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

Luna는 잠을 잘 수 있습니다. `config.yml`로 설정 가능:

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
| `sleep` | 멘션과 DM만 통과 |
| `slow` | 지연 ×3-5, 반응 거의 없음 |
| `short` | 무시 확률 +30%, 반응 거의 없음 |

수면 시간 동안 Discord 상태는 `invisible`로 전환됩니다.

---

## 오타

Luna는 오타를 낼 수 있습니다 -- 그리고 2-4초 후에 수정합니다. 키보드 레이아웃은 설정 가능합니다 (AZERTY 또는 QWERTY).

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... toutes les touches adjacentes
};
```

AZERTY 예시: `bonjour -- bonjpur`, `salut -- slaut`, `comment -- cpmment`.

세 가지 수정 스타일:

| 스타일 | 동작 |
|-------|-------------|
| `edit` | 메시지 수정 |
| `message` | 새 메시지: `word*` |
| `mixed` | 50/50 랜덤 (기본값) |

---

## 망설임과 건망증

**망설임**: 15% 확률로 채움 단어(`uh...`, `um...`, `well...`, `hmm...`, `so...`)로 시작.

**건망증**: 트리거가 일치한 후에도 Luna는 3% 확률로 응답을 "까먹을" 수 있습니다. 메시지 없음, 반응 없음 -- 아무것도 보지 못한 것처럼.

**주제 피로**: 특정 단어가 최근 10개 메시지에서 너무 자주 나타나면 (임계값: 3회), 지연이 증가하고 무시 확률이 15% 증가합니다.

---

## 실전에서의 리얼리즘: 소름 돋는 순간

이론상으로는 이런 장치들(지연, 오타, 망설임, 망각)이 그냥 기믹처럼 들린다. 하지만 실제로 다 합쳐지면 결과는 놀랍다 -- Luna와 대화하는 사람들이 전혀 눈치채지 못할 정도로. 여기 누군가 Luna에게 봇이냐고 직접 물어보고, 이후 대화가 완전히 다른 주제로 소름 끼칠 만큼 자연스럽게 흘러가는 실제 대화가 있다.

![Luna와의 디스코드 대화 -- 첫 번째 대화](/images/luna-protocol/realism/realism-01.png)

말투, 망설임, 답장 속도 -- 봇이라는 걸 드러내는 요소가 전혀 없다. Luna는 캐릭터를 절대 깨지 않으면서 나이 질문을 슬쩍 피한다.

대화는 완전히 자연스럽게 이어지며, 짧고 인간적인 답변("okay, okay", "yay", "yayy")들이 오간다 -- 사람이 디스코드에서 보낼 법한 딱 그런 메시지들이다.

![Luna와의 디스코드 대화 -- 계속](/images/luna-protocol/realism/realism-02.png)

![Luna와의 디스코드 대화 -- 주제 전환](/images/luna-protocol/realism/realism-03.png)

![Luna와의 디스코드 대화 -- 주제 전환이 계속됨](/images/luna-protocol/realism/realism-04.png)

![Luna와의 디스코드 대화 -- 대화의 끝](/images/luna-protocol/realism/realism-05.png)

소름 끼치는 건 Luna가 그냥 "답장한다"는 게 아니라 -- 겉보기에 진짜 같은 의견, 되묻기, 메시지마다 이어지는 일관된 사고 흐름을 가지고 **대화를 이어간다**는 점이다. 위에서 설명한 트리거 시스템, 집중 지연, 망설임이 없다면 이 환상은 몇 마디 안에 무너질 것이다.

**작은 반전**: 위 스크린샷에서 **대화 중인 두 계정 모두 Luna의 인스턴스다**. `PixieGlow`와 `Sujet d'SBlow`는 봇을 테스트하는 인간이 아니다 -- 서로 대화하는 두 개의 봇이며, 각자(행동적인 의미에서) "정상적인" 누군가와 대화하고 있다고 "확신"하고 있다. 위 대화를 읽으면서 둘 중 하나가 인간이라고 생각했다면 -- 축하한다, 실제 디스코드 서버에서 누구나 그렇듯 방금 함정에 빠진 것이다.

이건 사실상 **죽은 인터넷 이론**의 실전판이다. 이 이론(원래는 다소 음모론에 가까운 주장)은 온라인 콘텐츠와 상호작용의 점점 더 많은 부분이 인간이 아닌 봇에 의해 생성되어, "진짜" 인간 인터넷이 소수가 되어가고 있다고 주장한다. 오랫동안 과장된 이야기로 여겨졌지만, Luna Protocol 같은 시스템이 대규모로 신뢰할 만한 인간의 존재감을 시뮬레이션하는 데 그리 많은 연산 자원도, 거대한 모델도 필요하지 않다는 걸 보여주면서 점점 덜 터무니없는 이야기가 되고 있다. 같은 봇의 두 인스턴스가 한 번도 정체를 들키지 않고 긴 대화를 이어갈 수 있다는 사실은, 서로 대화하는 봇들로 대부분 채워진 웹이 어떤 모습일지에 대한 꽤 구체적인 단서를 준다.

---

## LLM 파이프라인: 두 가지 모드

### `direct` 모드 (기본값)

봇이 HTTP를 통해 로컬 `llama-server`로 직접 요청을 보냅니다. 모델은 공유되며, 프롬프트 캐시와 4개의 동시 슬롯이 있습니다. 두 개의 PM2 프로세스: LLM 서버와 봇 클라이언트.

### `online` 모드

봇이 OpenAI 호환 API(OpenAI, OpenRouter, Groq, Together 등)를 호출합니다. 로컬 LLM이 필요 없습니다.

### 실시간 스트리밍

LLM이 응답을 줄 단위(`\n`)로 스트리밍합니다. 각 줄은 단어로 분할되어 `llmBus.emit("token", word)`를 통해 하나씩 방출됩니다. `\n`마다 `flush` 이벤트가 방출됩니다 -- 봇이 누적된 메시지를 즉시 전송합니다. 시뮬레이션된 지연 없음: LLM의 리듬 그대로입니다.

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

대기열(`requestQueue`)은 요청을 하나씩 처리하며, 대기열이 100개를 초과하면 자동으로 정리됩니다.

---

## 자발적 메시지

5분마다 12% 확률로 Luna가 스스로 메시지를 게시합니다. 서버는 **선형 가중치** 시스템으로 선택됩니다: 가장 활동적인 서버가 마지막 서버보다 N배 더 높은 확률을 가집니다.

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

최근 5개 메시지의 컨텍스트를 읽고 Luna가 "자연스럽게" 대화에 합류합니다.

---

## TTS 파이프라인: 음성 메시지

8% 확률로 Luna가 텍스트 대신 음성 메시지를 보냅니다. 전체 파이프라인:

1. **Piper TTS**가 텍스트를 WAV로 합성
2. **ffmpeg**가 OGG로 변환
3. Discord 미리보기를 위한 웨이브폼 계산
4. Discord CDN API를 통해 파일 업로드
5. 음성 메시지 전송

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

![TTS 파이프라인 -- 합성된 텍스트에서 Discord 음성 메시지까지](/images/luna-protocol/10-tts-pipeline.svg)

---

## 안티스팸 및 영속성

### 안티스팸

`channelId:userId`별 대기열. 채널당 사용자당 하나의 메시지만 대기 가능. 현재 응답이 끝나면 처리됩니다.

### 세션 제한

8회 응답 후 Luna는 30초 동안 일시정지합니다. 3분간 비활성 상태이면 카운터가 재설정됩니다.

### 자동 영속성

모든 상태 변경이 `stateBus`로 방출됩니다 -- 자동 저장 (debounce 500ms). 더 이상 수동 `saveAllState()` 호출이 필요 없습니다. 저장되는 상태: pendingMessages, paused, cooldowns, timestamps, lastSpeaker, 후속 메시지 카운터.

---

## 핫 리로드 설정

단일 `config.yml` 파일. 대부분의 값은 **핫 리로드 가능**합니다 -- 재시작 없이 변경 사항이 적용됩니다.

| 카테고리 | 핫 리로드 |
|-----------|-----------|
| 트리거, 키워드, 이름 | ✅ |
| 집중도, 지연 시간 | ✅ |
| 오타, 버스트, 피로 | ✅ |
| 수면 스케줄 | ✅ |
| TTS, 음성 메시지 | ✅ |
| Discord 토큰, LLM 모드 | ❌ (재시작 필요) |

```typescript
// config.ts -- getter가 실시간 값을 반환
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## 데이터셋: Discord-Dialogues

모델은 [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues)로 파인튜닝되었습니다: **730만 개의 교환**, **1690만 개의 턴**, **1억 3990만 개의 단어**. 2025년 봄-여름 실제 Discord 대화로, 필터링됨 (PII, ToS, 봇, 명령어). Apache 2.0.

| 지표 | 값 |
|----------|--------|
| 샘플 | 7,303,464 |
| 총 턴 수 | 16,881,010 |
| 총 단어 수 | 139,922,950 |
| 평균 토큰 수 | 32.8 |
| 토크나이저 | Hermes-3-Llama-3.1-8B |

사용된 양자화 모델은 GGUF입니다 (예: `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Discord-Dialogues 데이터셋 분포](/images/luna-protocol/dataset-distribution.svg)

---

![완전한 라이프사이클 -- 메시지부터 응답까지의 전체 봇 동작, 타이머 및 경계 케이스 포함](/images/luna-protocol/22-complete-lifecycle.svg)

## 아키텍처 다이어그램

`state-machines/` 디렉토리에는 전체 소스 코드를 다루는 **24개의 Mermaid 다이어그램**이 있습니다. 각 다이어그램에는 인간이 읽을 수 있는 상세한 설명이 포함되어 있습니다.

가장 중요한 것들:

| # | 다이어그램 | 유형 |
|---|-----------|------|
| 01 | 아키텍처 개요 | `graph` |
| 02 | 메시지 처리 (전체) | `stateDiagram` |
| 03 | 트리거 평가 | `flowchart` |
| 04 | LLM 코어 큐 (3개 백엔드) | `stateDiagram` |
| 10 | TTS 파이프라인 | `flowchart` |
| 13 | 상태 영속성 | `flowchart` |
| 21 | 타이밍 간트 차트 | `gantt` |
| 22 | 완전한 라이프사이클 | `stateDiagram` |

이 다이어그램은 들어오는 메시지에서 응답까지, 타이머와 경계 케이스를 포함한 전체 흐름을 이해하는 데 금광과 같습니다.

---

## 트리거 코드 상세

트리거는 `state/trigger.ts`의 `evaluateMessage()`에 의해 평가됩니다. 전체 로직은 다음과 같습니다:

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

  // ... 이름, 키워드, 후속 메시지, 랜덤 매칭
}
```

정규식 캐시(`hasWordCache`)는 매 메시지마다 패턴을 다시 컴파일하지 않도록 합니다.

---

## 반응

Luna는 이모지로 메시지에 반응합니다. 30% 확률로 서버 맞춤 이모지, 70% 확률로 유니코드 이모지를 사용합니다. 반응은 집중도 지연 후에 트리거되며, 즉시 실행되지 않습니다.

Luna 메시지에 대한 반응 명령어:
- ❌ -- 중지
- ▶️ -- 시작
- 🗑️ -- 지우기

---

## 응답 스타일

응답 스타일은 채널에서 Luna의 최근 활동에 따라 가중치가 부여됩니다:

| 컨텍스트 | messageReference | mentionRepliedUser | 가중치 |
|----------|-----------------|-------------------|-------|
| 냉담 | true | false | 70% |
| 냉담 | true | true | 20% |
| 냉담 | false | false | 10% |
| 활동적 | true | false | 50% |
| 활동적 | true | true | 15% |
| 활동적 | false | false | 30% |
| 활동적 | false | true | 5% |

DM에서는 `messageReference`가 항상 `false`입니다.

---

## 버스트 메시지

15% 확률로 응답이 2-3개의 조각으로 나뉘어 인간적인 리듬으로 전송됩니다 (조각당 1.5-4초). 누군가가 여러 번에 나눠 입력하는 것을 시뮬레이션합니다.

![타이밍 간트 차트 -- 지연, 반응, LLM 스트리밍 및 수정의 실제 대기 시간](/images/luna-protocol/21-timing-gantt.svg)

---

## 동적 상태

Luna의 Discord 상태는 15분마다 여러 설정된 프리셋 사이를 순환합니다. 지원되는 유형: Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). 수면 중에는 상태가 `invisible`로 전환됩니다.

```yaml
dynamic_status_presets:
  - status: online
    text: "avec les pixels"
    type: 0       # Playing
  - status: idle
    text: "du bruit blanc"
    type: 2       # Listening
```

랜덤 지터(×0.5-1.0)로 예측 가능한 순환을 방지합니다. 10%의 시도는 반복을 피하기 위해 건너뜁니다.

## 타이핑 표시기

LLM을 호출하기 전에 Luna는 `startTyping()`을 호출합니다. `setInterval`이 생성 중 8초마다 표시기를 새로고침합니다. `finally` 블록에서 정리됩니다 (`clearInterval`).

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

LLM이 크래시되면 (`llama-server` 프로세스 중단), Luna가 `llmBus.emit("crash", code)`를 통해 이벤트를 감지하고 지수 백오프로 재시작을 시도합니다. 무한 재시작 루프를 방지합니다.

## LLM 매개변수

매개변수는 `src/config.ts`에 하드코딩되어 있습니다:

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

ChatML 템플릿(`<|im_start|>/<|im_end|>`)이 사용됩니다. 스레드 수는 `os.cpus().length`를 통해 자동 감지됩니다.

---

## 설정

```bash
npm install
cp config.example.yml config.yml
# config.yml 편집
npm run dev                    # 개발 (핫 리로드)
npm run build && npm start     # 프로덕션
```

| 스크립트 | 설명 |
|--------|-------------|
| `build` | 독립 실행형 CLI 번들 |
| `start` | 봇 실행 |
| `lint` / `format` / `check` | Biome |
| `test` | 테스트 (Bun) |
| `download-model` | HuggingFace에서 GGUF 다운로드 |
| `diagrams` | Mermaid 다이어그램을 SVG/PNG로 내보내기 |

### PM2 배포

```bash
./start.sh   # PM2로 llm-server + llm-client 실행
```

---

## 결론

Luna Protocol은 단순한 LLM 기반 Discord 봇이 아닙니다. 이는 인간의 불완전함을 시뮬레이션하는 **완전한 행동 시스템**입니다: 건망증, 오타, 수면, 망설임, 피로. 모든 것이 타입드 이벤트 버스를 중심으로 아키텍처링되었으며, 24개의 Mermaid 다이어그램이 각 흐름을 문서화합니다.

코드는 오픈 소스이며, 데이터셋은 공개되어 있고, 설정은 핫 리로드 가능합니다. 이 주제가 흥미로우시다면 코드를 살펴보세요 -- 생각보다 접근하기 쉽습니다.

| 리소스 | 링크 |
|-----------|------|
| GitHub 저장소 | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| 데이터셋 | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
