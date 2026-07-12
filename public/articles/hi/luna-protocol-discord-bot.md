---
title: "Luna Protocol: मैंने एक स्वायत्त Discord बॉट बनाया जो इंसान की नकल करता है"
description: "Luna Protocol एक पूर्णतः स्वायत्त Discord बॉट है जिसमें स्थानीय LLM है, जो नींद, टाइपिंग गलतियाँ, हिचकिचाहट, भूलने, विषय-थकान और स्पॉन्टेनियस संदेशों के साथ प्राकृतिक बातचीत कर सकता है।"
date: 2026-07-11
tags:
  - discord-bot
  - llm
  - typescript
  - घटना-संचालित-वास्तुकला
  - कृत्रिम-बुद्धिमत्ता
  - ओपन-सोर्स
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "tI9aauTZQdlYWPKRigJdfc+fHoh35Kt737zY8XIaESZ5FDXVI5NfYsv6lQOBx89zVpaCqfJQ4HAXaBD+mw+xMw=="
---

# Luna Protocol: मैंने एक स्वायत्त Discord बॉट बनाया जो इंसान की नकल करता है
अगर एक Discord बॉट **सो सकता**, **टाइपिंग गलतियाँ कर सकता**, **हिचकिचा सकता**, **जवाब देना भूल सकता**, और कभी-कभी अपनी ओर से आपको संदेश भेज सकता तो? यही **Luna Protocol** करता है: एक पूरी तरह से स्वायत्त Discord बॉट जो एक स्थानीय LLM (llama.cpp) चलाता है और एक अपूर्ण इंसान की तरह बातचीत करता है।
कठोर प्रॉम्प्ट नहीं, रोबोटिक उत्तर नहीं। Luna के पास एक **प्राथमिकता ट्रिगर सिस्टम**, **परिवर्तनशील विलंब**, **नींद का समय**, **स्वचालित संदेश**, और यहाँ तक कि वॉयस संदेश भेजने के लिए एक **TTS पाइपलाइन** भी है। सब कुछ एक साधारण `config.yml` फ़ाइल के माध्यम से हॉट-रीलोडेबल कॉन्फ़िगर किया जा सकता है।
इस लेख में, हम पूरी वास्तुकला को तोड़ते हैं: जेनेरिक इवेंट बस से लेकर TTS पाइपलाइन तक, ट्रिगर सिस्टम, मानव घटकों और फाइन-ट्यूनिंग डेटासेट को शामिल करते हुए।
![वास्तुकला अवलोकन -- वैश्विक घटक और डेटा प्रवाह](/images/luna-protocol/01-architecture-overview.svg)

---

## वास्तुकला: एक टाइप किया गया इवेंट बस

Luna의 핵심은 **유형dBus** -- 강한 타입이 지정된 제네릭 이벤트 버스(유형Script)입니다. 모든 것의 기본이 되는 블록입니다.

```typescript
type EventMap = Record<string, unknown[]>;

export class 유형dBus<Events extends EventMap> {
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
│  유형dBus<K, V> -- on / off / once / emit            │
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

![Message Processing -- 메시지 처리의 완전한 흐름](/images/luna-protocol/02-message-processing.svg)

## 트리거 시스템: Luna가 언제 응답하는지 누가 결정하는가

각 수신 메시지는 `evaluateMessage()`에 의해 평가되며, 트리거 이유와 함께 `TriggerResult`를 반환합니다. 우선순위 순서가 중요합니다:

| # | 이유 | 조건 | Bypass ignore | Bypass pause |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | 예 (0%) | 예 |
| 2 | `dm` | MP avec `replyInDM = true` | 예 (0%) | 아니오 |
| 3 | `name` | "Luna"/"Pixie"/alias (단어 전체) | 아니오 (8%) | 아니오 |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (단어 전체) | 아니오 (8%) | 아니오 |
| 5 | `follow-up` | Bot était dernier locuteur + < 15s + < 3 / 60s | -- | -- |
| 6 | `random` | 1.5% de chance sur les messages non correspondants | 아니오 (8%) | 아니오 |

매칭은 **단어 전체** (`\b`) : "ai" ne correspond pas à "mais", "vrai", "lait".

![Trigger evaluation -- 각 메시지의 진입 결정](/images/luna-protocol/03-trigger-evaluation.svg)

### 팔로업 메커니즘

Luna가 메시지에 응답하면 `lastSpeaker`로 등록됩니다. 15초 이내의 후속 메시지는 **즉각적인** 응답을 트리거합니다 -- 타이머 없음, 키워드 확인 없음. 예산: 60초 윈도우당 3개의 팔로업.

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

여기서 Luna는 흥미로워집니다. 각 트리거 유형에는 고유한 **집중 임계값**이 있습니다: 최소/최대 지연, 무시할 확률, 반응할 확률.

| Trigger | 최소 지연 | 최대 지연 | 무시 | 반응 |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

지연 계산은 다음도 고려합니다:
- **La longueur du message** : plus le message est long, plus Luna met de temps à "lire"
- **L'inactivité** : si Luna n'a pas été active depuis 10 minutes, le délai est multiplié par 2 (simulation du "réveil")
- **Le sommeil** : en mode `slow`, le délai est multiplié par 3 à 5

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
  delay *= 0.5 + Math.random() * 1.5; // 공격적인 지터
  return delay;
}
```

---

## नींद का समय

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

| 모드 | 효과 |
|------|-------|
| `sleep` | 仅提及和私信通过 |
| `slow` | 延迟 ×3-5，反应几乎为零 |
| `short` | 忽略概率 +30%，反应几乎为零 |

수면 시간 동안 Discord 상태가 `invisible`로 변경됩니다.

---

## टाइपिंग गलतियाँ

Luna는 오타를 낼 수 있습니다 -- 2-4초 후에 수정합니다. 키보드 레이아웃은 구성 가능(AZERTY 또는 QWERTY).

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... 인접한 모든 키
};
```

AZERTY 예: `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`.

세 가지 수정 스타일:

| 스타일 | 동작 |
|-------|-------------|
| `edit` | 메시지 편집 |
| `message` | 새 메시지: `word*` |
| `mixed` | 50/50 무작위(기본값) |

---

## हिचकिचाहट और भूलने

**망설임** : 채우기 단어로 시작할 확률 15% (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**망각** : 트리거 매치 후에도 Luna는 3% 확률로 응답을 "잊을" 수 있습니다. 메시지 없음, 리액션 없음 -- 아무것도 보지 못한 것처럼.

**주제별 피로** : 최근 10개 메시지에서 단어가 너무 자주 나타나면(임계값: 3회), 지연이 곱해지고 무시할 확률이 15% 증가합니다.

---

## LLM पाइपलाइन: दो मोड

### 모드 `direct` (défaut)

Bot सीधे स्थानीय `llama-server` को HTTP पर अनुरोध भेजता है। मॉडल साझा है, प्रॉम्प्ट कैश और 4 समवर्ती स्लॉट्स के साथ। दो PM2 प्रक्रियाएँ: LLM सर्वर और बॉट क्लाइंट।

### 모드 `online`

Le bot appelle n'importe quelle API compatible OpenAI (OpenAI, OpenRouter, Groq, Together...). Pas de LLM local nécessaire.

### 실시간 스트리밍

LLM은 응답을 한 줄씩 스트리밍합니다 (`\n`). 각 줄은 단어로 분할되고, `llmBus.emit("token", word)`. 각 `\n`마다 `flush` 이벤트가 발행됩니다 -- 봇은 축적된 메시지를 즉시 전송합니다. 지연 시뮬레이션 없음: 리듬은 LLM의 것입니다.

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

## स्वतः संदेश

5분마다, Luna가 자체적으로 메시지를 게시할 확률은 12%입니다. 서버는 **선형 가중치** 시스템으로 선택됩니다: 가장 활발한 서버가 마지막 서버보다 N× 많은 확률을 가집니다.

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

## TTS पाइपलाइन: वॉइस संदेश

8% 확률로 Luna는 텍스트 대신 음성 메시지를 보냅니다. 완전한 파이프라인:

1. **Piper TTS** 将文本合成为 WAV
2. **ffmpeg** 转换为 OGG
3. 计算波形用于 Discord 预览
4. 通过 Discord CDN API 上传文件
5. 发送语音消息

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

![TTS Pipeline -- 합성된 텍스트에서 Discord 음성 메시지까지](/images/luna-protocol/10-tts-pipeline.svg)

---

## स्पैम विरोधी और स्थायित्व

### Anti-spam

`channelId:userId`별 큐. 사용자당 채널당 큐에 하나의 메시지만. 현재 응답이 완료되면 즉시 처리됩니다.

### Limites de session

8번의 교환 후, Luna는 30초의 휴식을 취합니다. 카운터는 3분의 비활성화 후 재설정됩니다.

### Persistence automatique

각 상태 변경은 `stateBus`에 발행됩니다 → 자동 저장(debounce 500ms). 수동 `saveAllState()` 호출이 더 이상 필요하지 않습니다. 영속화되는 상태: pendingMessages, paused, cooldowns, timestamps, lastSpeaker, 팔로업 카운터.

---

## हॉट-रीलोड कॉन्फ़िगरेशन

`config.yml` 파일 하나. 대부분의 값은 **핫 리로드 가능** -- 재시작 없이 변경 사항이 적용됩니다.

| 카테고리 | Hot-reload |
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

## डेटासेट: Discord-Dialogues

모델은 다음에서 파인튜닝되었습니다: [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) : **7.3M échanges**, **17M tours**, **140M mots**. 2025년 봄-여름의 실제 Discord 대화, 필터링됨(PII, ToS, 봇, 명령). Apache 2.0.

| 메트릭 | 값 |
|----------|--------|
| 샘플 수 | 7 303 464 |
| 총 턴 수 | 16 881 010 |
| 총 단어 수 | 139 922 950 |
| 평균 토큰 | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

사용된 양자화 모델은 GGUF입니다(예: `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Discord-Dialogues 데이터셋 분포](/images/luna-protocol/dataset-distribution.svg)

---

![Complete Lifecycle -- 메시지부터 응답까지의 완전한 봇 동작, 타이머와 엣지 케이스 포함](/images/luna-protocol/22-complete-lifecycle.svg)

## 아키텍처 다이어그램

`state-machines/` फ़ोल्डर में **24 Mermaid डायग्राम** हैं जो पूरे स्रोत कोड को कवर करते हैं। प्रत्येक डायग्राम का मानव भाषा में विस्तृत विवरण है।

Parmi les plus importants :

| # | 다이어그램 | 유형 |
|---|-----------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (complet) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 backends) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

Ces diagrammes sont une mine d'or pour comprendre le flux complet : du message entrant à la réponse, en passant par les timers et les cas limites.

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

  // ... matching par nom, keyword, follow-up, random
}
```

정규식 캐시(`hasWordCache`)는 각 메시지에서 패턴 재컴파일을 방지합니다.

---

## प्रतिक्रियाएँ

Luna는 이모지로 메시지에 반응합니다. 서버 사용자 정의 이모지를 사용할 확률 30%, 유니코드 이모지 70%. 리액션은 집중 지연 후에 트리거되며 즉시는 아닙니다.

Luna 메시지에 대한 리액션 명령:
- ❌ → Stop
- ▶️ → Start
- 🗑️ → Clear

---

## उत्तर शैली

응답 스타일은 Luna의 최근 채널 활동에 따라 가중치가 부여됩니다:

| 컨텍스트 | messageReference | mentionRepliedUser | 가중치 |
|----------|-----------------|-------------------|-------|
| 냉 | true | false | 70% |
| 냉 | true | true | 20% |
| 냉 | false | false | 10% |
| 활성 | true | false | 50% |
| 활성 | true | true | 15% |
| 활성 | false | false | 30% |
| 활성 | false | true | 5% |

DM에서는 `messageReference`가 항상 `false`입니다.

---

## 버스트 메시지

15% 확률로 응답은 인간의 리듬(각 조각 사이 1.5-4초)으로 2-3개의 조각으로 분할되어 전송됩니다. 여러 번에 걸쳐 타이핑하는 사람을 시뮬레이션합니다.

![Timing Gantt -- 지연, 반응, LLM 스트리밍, 수정의 실제 대기 시간](/images/luna-protocol/21-timing-gantt.svg)

---

## 동적 상태

Luna의 Discord 상태는 구성된 여러 프리셋을 15분마다 전환합니다. 지원되는 유형: Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). 수면 중 상태가 `invisible`로 변경됩니다.

```yaml
dynamic_status_presets:
  - status: online
    text: "avec les pixels"
    type: 0       # Playing
  - status: idle
    text: "du bruit blanc"
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

LLM이 크래시되면(`llama-server` 프로세스가 중지), Luna는 `llmBus.emit("crash", code)`를 통해 이벤트를 감지하고 지수 백오프로 재시작을 시도합니다. 무한 재시작 루프를 방지합니다.

## LLM पैरामीटर

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

ChatML 템플릿 (`<|im_start|>/<|im_end|>`) est utilisé. 스레드 수는 `os.cpus().length`.

---

## सेटअप

```bash
npm install
cp config.example.yml config.yml
# config.yml 편집
npm run dev                    # dev (hot reload)
npm run build && npm start     # production
```

| Script | Description |
|--------|-------------|
| `build` | 독립형 CLI 번들 |
| `start` | 봇 시작 |
| `lint` / `format` / `check` | Biome |
| `test` | Tests (Bun) |
| `download-model` | GGUF from HuggingFace |
| `diagrams` | Mermaid 다이어그램을 SVG/PNG로 내보내기 |

### Déploiement PM2

```bash
./start.sh   # PM2에서 llm-server + llm-client 시작
```

---

## निष्कर्ष

Luna Protocol 는 단순한 LLM이 탑재된 Discord 봇이 아닙니다. 이것은 인간의 불완전성 -- 망각, 오타, 수면, 망설임, 피로 -- 을 시뮬레이션하는 **완전한 행동 시스템**입니다. 모든 것이 타입화된 이벤트 버스를 중심으로 구축되었으며, 24개의 Mermaid 다이어그램이 각 흐름을 문서화합니다.

코드는 오픈소스이고, 데이터셋은 공개적이며, 구성은 핫 리로드 가능합니다. 이 주제에 관심이 있다면 코드를 살펴보세요 -- 생각보다 접근하기 쉽습니다.

| 리소스 | 링크 |
|-----------|------|
| GitHub 저장소 | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
