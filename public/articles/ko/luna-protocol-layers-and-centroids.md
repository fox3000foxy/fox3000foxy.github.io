---
title: "Luna Protocol: 공유 브레인, 감정 분류, 그리고 흥미로운/사소한 라우팅"
description: "Luna Protocol은 모놀리스에서 4계층 아키텍처로 진화했다: 어댑터, 브레인, 감정 분류기, 추론. 임베딩 센트로이드, 흥미로운/사소한 메시지 라우팅, valence와 arousal에 따른 LLM 파라미터 튜닝을 소개한다."
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
author_sig: "dXvMynndgUrXuRYUl8g4TQL2rQiJJ04OSEERg/MqdFWoa4kOmEK0BVYONCsfnuW1vQd4tzdVJKCftXe4A+W/GQ=="
---

# Luna Protocol: 공유 브레인, 감정 분류, 그리고 흥미로운/사소한 라우팅

[이전](/articles/ko/luna-protocol-discord-bot) [두](/articles/ko/luna-protocol-official-models) 기사에서 나는 Luna Protocol을 복잡한 행동 시스템과 파인튜닝된 모델을 갖춘 단일 Discord 봇으로 소개했다. 하지만 그 이후로 아키텍처는 크게 진화했다. 예전에는 모놀리스 -- Discord 봇, 행동, LLM 호출을 모두 처리하는 하나의 Node.js 프로세스 -- 였던 것이 이제는 **네 개의 독립된 계층**으로 나뉘었다. 각 계층은 저마다의 책임, 언어, 라이프사이클을 갖는다.

이 분리는 예상치 못한 이점을 가져왔다: 여러 플랫폼 간의 "브레인" 공유, LLM의 파라미터를 동적으로 조정하는 감정 분류 시스템, 그리고 대화의 체감 중요도에 따라 두 모델 사이에서 메시지를 스마트하게 라우팅하는 기능이다.

이 진화는 한 번에 일어난 것이 아니라 유기적인 경로를 따랐다. 나는 먼저 봇 저장소에서 `server/` 폴더를 분리해 한쪽에 **Krystal**을 만들고, **Jade**를 Discord 어댑터로 남겼다. 그다음 Jade의 `llm-core`와 이벤트 버스를 재사용해 **Pixieglow**(Matrix 어댑터)를 만들었다. 이어서 **Sapphire**가 등장해 DistilBERT를 이용한 GENERIC/SEMANTIC 분류를 도입했지만 결과가 만족스럽지 않았고, 그래서 예시를 보강하기에 더 유연하고 정확한 임베딩 센트로이드로 전환했다. 분류는 FUTILE/INTERESTING(사소함/흥미로움)이 되었다. 이후 LLM의 temperature와 repeat penalty를 조절하기 위해 **valence**(정서가)와 **arousal**(각성도) 센트로이드를 추가했다. 마지막으로 Jade와 Pixieglow 사이의 중복 코드를 모두 제거하기 위해 공유 브레인인 **Emerald**를 만들었고, Jade와 Pixieglow는 단순한 소켓 기반 클라이언트가 되었다.

이와 함께 프로젝트의 진행 상황을 추적하는 웹사이트를 계속 업데이트하고 있다: [protocol-luna.github.io](https://protocol-luna.github.io/).

이 글에서는 내가 이 계층들을 왜, 어떻게 분리했는지, 각 서비스가 정확히 무엇을 하는지, 그리고 **센트로이드**(평균 임베딩 벡터)와 **레젠트먼트 변수**(1970년대 챗봇 PARRY에서 영감을 받음) 같은 개념이 어떻게 단순한 Discord 봇을 놀랍도록 일관된 멀티플랫폼 시스템으로 바꿨는지 이야기한다.

---

## 모놀리스의 문제점

처음에는 Luna Protocol이 하나의 Node.js 프로세스 안에 다 들어갔다. 코드는 다음을 처리했다:

- Discord 연결(Eris 라이브러리 사용)
- 트리거 평가(멘션, 키워드, 후속 발화 등)
- 인간 행동 시뮬레이션(오타, 망설임, 수면 등)
- 로컬 LLM 서버(llama.cpp)로의 HTTP 호출
- 세션 관리와 스팸 방지
- TTS 파이프라인

모든 것이 같은 프로세스에서 살면서 타입이 지정된 이벤트 버스(`TypedBus`)로 통신했다. 작동은 했지만 한계가 있었다:

- **Matrix 클라이언트 추가가 불가능**: 모든 행동 코드를 중복하지 않고서는 불가능했다
- **LLM과 봇이 같은 저장소에 있었다**: `server/` 폴더가 이미 존재했지만, 한쪽을 건드리지 않고서는 다른 쪽을 발전시킬 수 없었다
- **스마트한 분류가 없었다**: "lol"이든 실존적 질문이든 모든 메시지가 똑같이 취급되었다
- **지속적인 감정 상태가 없었다**: 봇은 아무것도 "느끼지" 않았다

계층으로 분리하면서 이 모든 문제가 해결되었다.

---

## 네 개의 계층

Luna Protocol의 현재 아키텍처는 4단계 깔때기 형태로 구성되어 있다:

```
Matrix / Discord
      |
      v
  [ADAPTERS]      Pixieglow (Matrix) / Jade (Discord)
      |
      v
  [BRAIN]         Emerald (WebSocket, 포트 3126)
      |
      v
  [CLASSIFIER]    Sapphire (HTTP, 포트 3123)
      |
      v
  [INFERENCE]     Krystal (llama.cpp, 포트 3124 / 3125)
```

각 계층은 독립적으로 재시작, 업데이트, 교체할 수 있다.

---

### 계층 1: 어댑터 (Pixieglow와 Jade)

가장 단순한 계층이다. 이들의 유일한 역할은 메시징 플랫폼의 이벤트를 Emerald 쪽 표준 프로토콜로 변환하는 것이다:

- **Jade**는 Discord 어댑터다. Eris 라이브러리를 사용해 Discord에 연결하고, WebSocket을 통해 메시지를 Emerald로 전달한다. 또한 TTS 파이프라인(Piper를 통한 음성 합성, OGG 변환, Discord 업로드)도 처리한다.
- **Pixieglow**는 Matrix 어댑터다. SDK 없이 Matrix Client-Server HTTP API를 직접 사용하며, 롱폴 동기화를 이용한다. TTS 기능은 없다.

두 어댑터 모두 `emerald-client.ts`에 정의된 동일한 WebSocket 프로토콜을 공유한다:

```typescript
type ClientId = "jade" | "pixieglow";

// 이벤트 (어댑터 -> Emerald)
type InEvent = MessageEvent | ReadyEvent | BotMessageEvent | PresenceEvent;

// 명령 (Emerald -> 어댑터)
type OutCommand = RespondCommand | TypingCommand | SetPresenceCommand
                | SpontaneousCommand | ForgotCommand;
```

동일한 인터페이스를 가진 두 어댑터가 존재한다는 사실은 브레인 공유가 실제로 작동함을 증명한다: **같은 "브레인"(Emerald)이 Discord 봇과 Matrix 봇을 동일한 방식으로 서비스한다**. 프로토콜은 선언적이다. Emerald는 어댑터에게 메시지를 *어떻게* 보내라고 지시하지 않고, *무엇을* 보내야 하는지(지연 시간이 붙은 텍스트, 필요하면 버스트 계획, 리액션 등)를 알려준다. 각 어댑터는 자신의 플랫폼에 맞는 실제 실행을 구현한다.

이것이 이 아키텍처의 강점이다: Telegram, Signal, 또는 다른 무엇이든 지원을 추가하려면 WebSocket 프로토콜을 구현하는 어댑터를 하나 작성하기만 하면 된다.

브레인은 자신이 어떤 플랫폼에서 실행되고 있는지 모른다. `clientId`("jade" 또는 "pixieglow")가 포함된 `MessageEvent`를 받아 결정을 내리고 명령을 반환한다. 나머지는 어댑터가 처리한다.

---

### 계층 2: 브레인 (Emerald)

Emerald는 중앙 의사결정 서비스다. 포트 3126에서 WebSocket으로 대기하며 다음을 처리한다:

- **트리거 평가**: 멘션, DM, 이름, 키워드, 후속 발화, 무작위
- **행동 시뮬레이션**: 집중 지연, 오타, 망설임, 건망증, 버스트, 주제 피로도
- **수면 주기**: sleep / slow / short 모드
- **세션 관리**: 쿨다운, 세션 제한, 스팸 방지
- **Sapphire로의 라우팅**: 메시지 전송, 스트리밍된 응답 수신

Emerald는 브레인 공유를 가능하게 한 중앙 서비스이며, 분리로 가장 큰 혜택을 본 서비스이기도 하다. 예전에는 모든 행동(오타, 버스트, 망설임)이 Discord 코드와 뒤엉켜 있었다. 이제는 `behavior/` 아래 전용 모듈에서 관리된다:

```
emerald/src/behavior/
  burst.ts         -- 버스트 메시지 계획
  mannerisms.ts    -- 지연, 망설임, 리액션, 건망증
  sleep.ts         -- 수면 스케줄 평가
  typo.ts          -- 오타 시뮬레이션 (AZERTY/QWERTY)
```

---

### 계층 3: 감정 분류기 (Sapphire)

Sapphire는 기술적으로 가장 흥미로운 서비스다. Python과 FastAPI로 작성된 **LLM 미들웨어**로, 네 가지 핵심 역할을 수행한다:

1. 임베딩 센트로이드를 이용한 **이진 FUTILE / INTERESTING 분류기**
2. 센트로이드를 이용한 **감정 점수 산출기** (valence / arousal)
3. Krystal로의 **백엔드 라우터** (소형 모델 vs 대형 모델)
4. **Few-shot 주입기** 및 세션 관리자

#### 센트로이드: 분류의 핵심

**센트로이드**는 단순한 개념이다: 임베딩 벡터 집합의 평균이다. 구체적으로 나는 수백 개의 예시 메시지를 모아 임베딩 모델(`BAAI/bge-small-en-v1.5`, 384차원)에 통과시킨 뒤 결과 벡터들을 평균했다.

**두 개의 분류 센트로이드**가 있다:

- `futile_centroid`: 약 683개의 사소한 메시지("lol", "ok", "hello") via k-means (k=10, seed=42)
- `interesting_centroid`: 약 678개의 실질적인 메시지(기술, 개인, 철학) via k-means (k=10, seed=42)

메시지가 들어오면:

```python
def classify(text, embedder, futile_centroids, interesting_centroids):
    emb = embedder.query_embed(text)                        # 384-D vector
    sim_f = max(cos(emb, c) for c in futile_centroids)     # max over 10
    sim_i = max(cos(emb, c) for c in interesting_centroids)     # max over 10
    diff = sim_i - sim_f
    label = "INTERESSANT" if diff > 0 else "FUTILE"
    return label, abs(diff), sim_f, sim_i
```

메시지와 각 센트로이드 사이의 코사인 유사도가 카테고리를 결정한다. 절댓값 차이는 신뢰도를 나타낸다. 단순하고, 빠르며(LLM forward pass가 필요 없다), 놀랍도록 효과적이다.

#### 왜 두 개의 모델인가?

이 분류 결과는 어떤 LLM 백엔드가 호출될지를 결정한다:

| 라벨 | Krystal 백엔드 | 모델 | 포트 |
|-------|-----------------|-------|------|
| `FUTILE` | `generic` | Luna-Protocol-1.5B (941 MB, Q4_K_M) | 3124 |
| `INTERESTING` | `semantic` | Hermes-3-3B 또는 8B (설정에 따라) | 3125 |

발상은 단순하다: "lol"이나 "nm just chillin u" 같은 메시지는 80억 파라미터 모델을 불러올 가치가 없다. 20만 개의 Discord 샘플로 훈련된 소형 파인튜닝 Luna 1.5B 모델이면 가벼운 대화에는 충분하고도 남는다. 반대로 삶에 대한 질문, 고백, 기술적 논쟁은 더 풍부한 응답을 낼 수 있는 대형 모델로 라우팅된다.

이 경제적인 라우팅은 LLM 서버의 부하를 상당히 줄여준다: 약 70%의 메시지가 FUTILE로 분류되어 소형 모델이 처리하고, 그 덕분에 대형 모델은 실제로 그럴 가치가 있는 대화에 집중할 수 있다.

#### 감정 축: valence와 arousal

이게 전부가 아니다. Sapphire는 메시지의 감정을 평가하기 위해 독립적인 축에서 **동일한 센트로이드 메커니즘**을 사용한다:

**네 개의 감정 센트로이드**가 있다:

| 극 | 예시 |
|------|----------|
| `positive` | "hell yeah", "love that", "this is great" |
| `negative` | "shut up", "i hate this", "this sucks" |
| `high_arousal` | "WHAT THE HELL", "omg omg omg", "AAAAA" |
| `low_arousal` | "just chilling", "meh", "i guess" |

점수는 각 축에서 유사도 차이로 계산된다:

```python
valence = sim(emb, positive) - sim(emb, negative)     # [-1, +1]
arousal = sim(emb, high_arousal) - sim(emb, low_arousal)  # [-1, +1]
```

**Valence**는 메시지가 긍정적인지 부정적인지를 측정한다. **Arousal**은 감정적 강도를 측정한다. 이 둘이 합쳐져 정서의 원형 모델(circumplex model of affect, Russell, 1980)을 이루는데, 이는 1972년 챗봇 **PARRY**에 영감을 준 것과 같은 심리학 모델이다.

#### 레젠트먼트 변수: 감정이 LLM을 제어하는 방식

바로 여기서 PARRY의 영감이 구체화된다. PARRY(1972년 Kenneth Colby가 만듦)는 편집증 환자를 시뮬레이션하도록 설계된 챗봇이었다. 두려움, 분노, 불신 같은 내부 변수를 가지고 있었고, 이것이 응답을 바꾸었다. 예를 들어 "겁먹은" PARRY는 더 공격적으로 반응했다.

Sapphire도 같은 일을 하지만, 연속적인 변수와 더 우아한 방법으로: LLM의 샘플링 파라미터가 대화의 감정 상태에 따라 실시간으로 조정된다.

##### Temperature는 arousal을 따른다

```python
temperature = clamp(0.7 + arousal * 0.3, 0.4, 1.0)
```

| Arousal | Temperature | 효과 |
|---------|-------------|--------|
| -1.0 (차분함) | 0.40 | 낮은 창의성, 예측 가능한 응답 |
| 0.0 (중립) | 0.70 | 기본 창의성 |
| +1.0 (흥분) | 1.00 | 최대 무작위성, 놀라운 응답 |

누군가 흥분하거나 화가 나 있으면(높은 arousal) temperature가 올라간다. 모델은 더 다양하고 창의적이며 때로는 더 혼란스러운 응답을 낸다 -- 마치 "흥분해서 감정에 휩쓸리는" 인간처럼. 대화가 차분하면 temperature가 내려가고 응답은 더 절제된다.

##### Repeat penalty는 valence를 따른다

```python
repeat_penalty = clamp(1.15 - valence * 0.1, 1.0, 1.3)
```

| Valence | Repeat Penalty | 효과 |
|---------|-----------------|--------|
| -1.0 (부정적) | 1.25 | 강한 페널티, 반복 회피 |
| 0.0 (중립) | 1.15 | 기본값 |
| +1.0 (긍정적) | 1.05 | 낮은 페널티, 반복 허용 |

대화가 부정적일수록 모델은 반복을 피하도록 더 강하게 유도된다 -- 마치 긴장된 논쟁 중에 단어를 찾으려는 사람처럼. 대화가 긍정적일수록 모델은 편안한 대화처럼 중복된 표현을 더 여유 있게 허용한다.

##### 누적 감정 상태

이 점수들은 즉각적인 메시지에만 적용되지 않는다. `EmotionState`는 세션별로 valence와 arousal의 **지수 이동 평균**을 유지한다:

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

0.85의 `decay`는 매 메시지마다 이전 상태의 85%가 유지되고, 새 신호의 15%가 반영된다는 뜻이다. 이는 급격한 변화를 완화하는 **감정 기억**을 만든다: 단 하나의 부정적 메시지가 봇을 "슬프게" 만들지는 않지만, 부정적 메시지가 연속되면 기분이 점차 그쪽으로 기울어진다.

실제로: 누군가 매우 흥분한 상태로 대화를 시작하면(`arousal=+0.8`), 이후 메시지가 더 차분하더라도 여러 차례의 교환 동안 temperature는 높게 유지된다. 감정은 다시 가라앉는 데 시간이 걸린다 -- 논쟁 후에도 한동안 "흥분 상태"가 유지되는 사람처럼.

---

### 계층 4: 추론 (Krystal)

Krystal은 가장 하위 계층으로, OpenAI 호환 API(`/v1/chat/completions`)를 노출하는 `llama.cpp`의 래퍼다. 두 개의 PM2 인스턴스로 실행된다:

- `krystal-small`: 파인튜닝된 Luna 1.5B 모델, 포트 3124, CPU affinity 0
- `krystal-large`: Hermes 3B 모델, 포트 3125, CPU affinity 0,1

두 인스턴스 모두 사전 컴파일된 `llama-server` 프로세스이며, CPU 고정을 위해 `taskset`으로 실행된다.

Luna 모델의 파인튜닝도 두 번째 글 이후로 발전했다: 이제는 (이전 5만 개에서 늘어난) **20만 개의 샘플**로 훈련되며, 여전히 Qwen2.5-1.5B-Instruct에서 QLoRA를 통해 시작한다. 이 20만 개 샘플은 Discord-Dialogues 데이터셋의 일부로, 가장 자연스럽고 다양한 대화만 남도록 필터링되었다. 목표는 few-shot 프라이밍을 그토록 효과적으로 만드는 유연성을 잃지 않으면서 모델의 문체 범위를 넓히는 것이다.

---

## 전체 그림: 메시지가 지나가는 경로

Discord에서 누군가 "i'm really sad today"라고 보냈을 때 실제로 일어나는 일은 다음과 같다:

1. **Jade**가 Discord Gateway API를 통해 메시지를 받는다. 이를 `MessageEvent`로 변환해 WebSocket으로 Emerald에 전송한다.
2. **Emerald**가 트리거를 평가한다(멘션? 이름? 키워드?). 직접적인 멘션이다. 집중 지연을 계산하고, 쿨다운, 세션, 주제 피로도를 확인한다. 응답하기로 결정하고 HTTP로 메시지를 Sapphire에 보낸다.
3. **Sapphire**가 `bge-small-en-v1.5`로 메시지를 임베딩한다.
   - 분류: 메시지가 `futile` 센트로이드보다 `interesting` 센트로이드에 더 가깝다(diff = +0.31) -> **INTERESTING**
   - 감정: 부정적 valence(-0.42), 중간 정도의 arousal(0.35)
   - 라우팅: `KRYSTAL_SEMANTIC_URL` 방향(포트 3125, 대형 모델)
   - 샘플링 파라미터: temperature = 0.80(arousal이 높아짐), repeat_penalty = 1.19(부정적 valence)
   - 이 값들로 세션의 감정 상태가 업데이트된다
4. **Krystal**(대형 인스턴스)이 감정적으로 조정된 파라미터로 응답을 생성해 Sapphire로 돌려보낸다.
5. **Sapphire**가 메타데이터(라벨, valence, arousal, 디버그 통계)와 함께 응답을 Emerald로 스트리밍한다.
6. **Emerald**가 망설임("oh...")을 추가하기로 하고, 버스트(2개 조각)를 계획하고, 리액션을 선택한다. `RespondCommand`를 Jade에 보낸다.
7. **Jade**가 실행한다: 초기 지연을 기다린 뒤 망설임과 함께 첫 번째 조각을 보내고, 1.5초를 기다린 뒤 두 번째 조각을 보낸다. 생성이 진행되는 동안 계속 타이핑 표시를 보여준다.

사용자 입장에서는 이 모든 것이 3초 이내에 일어난다.

---

## 센트로이드: 왜 신경망 분류기보다 나은가

전통적인 분류기(이전에 사용했던 DistilBERT 같은)보다 임베딩 센트로이드를 선택한 이유는 설명할 가치가 있다.

신경망 분류기는 클래스 사이의 결정 경계를 학습한다 -- 일반적으로 입력을 확률로 매핑하는 비선형 변환이다. 정확하지만:

- 라벨이 붙은 훈련 데이터가 필요하다
- 분포 변화(데이터 드리프트)에 민감하다
- 해석하기 어렵다
- 새 클래스를 추가하려면 재훈련이 필요하다

반면 센트로이드는 예시 임베딩들의 **평균 벡터**다. 분류는 이 평균 벡터와의 코사인 유사도로 이루어진다. 장점:

- **훈련이 필요 없다**: 직접 고른 예시들의 임베딩 평균을 계산하기만 하면 된다
- **해석이 쉽다**: 센트로이드에 가장 가까운 예시들을 살펴보면 "센트로이드가 무엇을 학습했는지" 알 수 있다
- **클래스 추가**: 새 센트로이드를 하나 추가하기만 하면 된다 -- 재훈련이 필요 없다
- **강건함**: 센트로이드는 평균이므로 이상치의 영향이 적다

센트로이드의 진짜 힘은 분류 문제를 **공간적 거리 측정** 문제로 바꾼다는 데 있다. 384차원 공간(또는 PCA/t-SNE 차원 축소 후 2D/3D) 안의 영역으로 카테고리를 시각화할 수 있다.

### 3D 센트로이드 시각화

실제로 임베딩 공간에서 분류 센트로이드가 어떻게 보이는지는 다음과 같다. 각 점은 PCA를 통해 3D로 투영된 예시 메시지다(원래 384차원이 시각화를 위해 3차원으로 축소되었다). 파란 점은 사소한(futile) 메시지, 노란 점은 흥미로운(interesting) 메시지다. **20개의 다이아몬드 마커**는 k-means 중심점입니다 (클래스당 10개)는 계산된 센트로이드 -- 각 그룹의 평균 -- 다. 점 위에 마우스를 올리면 예시의 원문을 볼 수 있다.

<iframe src="assets/centroids-plot.html" style="width:100%;height:550px;border:none;border-radius:8px;" loading="lazy" title="센트로이드 분류 - 인터랙티브 3D 뷰"></iframe>

두 개의 예시가 빨간색으로 표시되어 있다: "lol"(futile로 분류)과 "i feel sad today"(interesting으로 분류)이다. "lol"은 사소한 메시지의 파란 구름 속에 떨어지는 반면, "i feel sad today"는 노란 점들이 있는 쪽에 위치한다. 3차원으로 축소한 후에도(전체 분산의 14.7%만 설명함) 분리가 눈에 보인다. 384차원에서는 경계가 훨씬 더 선명하다.

입력 메시지의 센트로이드는 내용에 따라 이 공간을 이동한다. FUTILE/INTERESTING 분류는 단순히 코사인 유사도로 어느 센트로이드가 더 가까운지 측정하는 것이다. 이를 통해 각 메시지를 다차원 공간의 한 점으로 표현할 수 있으며, 각 차원은 하나의 의미론적 속성에 해당한다.

---

## 실제로 무엇이 달라지는가

사용자는 계층도, 센트로이드도, temperature 조정도 보지 못한다. 하지만 그 효과는 느낀다:

- 단순한 메시지에 대한 **더 빠른 응답**(소형 모델은 2배 빠르고 트래픽의 70%를 처리한다)
- **적응형 톤**: 짜증이 나 있으면 봇이 그 짜증을 "감지"하고 스타일을 맞춘다
- **플랫폼 간 일관성**: Matrix 봇과 Discord 봇이 같은 브레인과 같은 감정 상태를 공유한다
- **"어시스턴트 모드" 없음**: 파인튜닝 + few-shot + 스마트 라우팅이 기업스러운 응답을 피하게 한다

소형 모델의 훈련 데이터를 20만 개로 늘린 것도 이 효과들을 한층 강화했다: 모델은 few-shot 프라이밍이 제공하는 유연성을 잃지 않으면서 Discord 대화의 다양성을 더 잘 포착한다.

---

## 전체 인프라

현재 실행 중인 서비스는 다음과 같다:

| 서비스 | 기술 | 포트 | 역할 |
|---------|------------|---------|------|
| Pixieglow | TypeScript (Bun) | -- | Matrix 어댑터 |
| Jade | TypeScript (esbuild) | -- | Discord 어댑터 |
| Emerald | TypeScript (Bun) | 3126 (WebSocket) | 브레인 / 의사결정 |
| Sapphire | Python (FastAPI) | 3123 (HTTP) | 분류기 + 감정 |
| Krystal small | llama.cpp (PM2) | 3124 | 소형 모델 (1.5B, futile) |
| Krystal large | llama.cpp (PM2) | 3125 | 대형 모델 (3B+, interesting) |

서비스 간 의존성은 단방향이다: 어댑터는 Emerald에 의존하고, Emerald는 Sapphire에 의존하며, Sapphire는 Krystal에 의존한다. 순환은 없다. 각 서비스는 독립적으로 재시작할 수 있다.

---

## 결론

Luna Protocol을 네 개의 계층으로 분리한 것은 단순한 아키텍처 연습이 아니었다. 이는 구체적인 한계에 대한 대응이었다: Matrix를 지원할 수 없다는 점, 감정 인식의 부재, 그리고 스마트한 메시지 우선순위 결정의 부재.

오늘날 이 시스템은 더 견고하고(LLM이 죽어도 봇 전체가 죽지 않는다), 더 확장 가능하며(Telegram이나 WhatsApp 어댑터도 같은 WebSocket 프로토콜을 따르면 된다), 더 "살아있다": 봇은 대화의 체감 감정 상태에 따라 행동, 톤, 심지어 LLM의 파라미터까지 조정한다.

임베딩 센트로이드는 과도한 복잡성 없이 이 모든 것을 가능하게 하는 핵심 요소다: 훈련된 신경망도, 라벨링된 데이터 파이프라인도 없이, 그저 벡터 평균과 코사인 유사도만 있을 뿐이다. 단순하지만 놀랍도록 효과적이며, 심하게 저평가된 기법이다.

| 리소스 | 링크 |
|----------|------|
| 프로젝트 웹사이트 | [protocol-luna.github.io](https://protocol-luna.github.io/) |
| Pixieglow | [protocol-luna/pixieglow](https://github.com/protocol-luna/pixieglow) |
| Emerald | [protocol-luna/emerald](https://github.com/protocol-luna/emerald) |
| Sapphire | [protocol-luna/sapphire](https://github.com/protocol-luna/sapphire) |
| Krystal | [protocol-luna/krystal](https://github.com/protocol-luna/krystal) |
| 기사 1: Discord 봇 | [Luna Protocol: 자율적인 Discord 봇을 만들다](/articles/ko/luna-protocol-discord-bot) |
| 기사 2: 파인튜닝 | [Luna Protocol: 왜 1.5B 모델을 파인튜닝했는가](/articles/ko/luna-protocol-official-models) |