---
title: "Luna Protocol: 두뇌 공유, 감정 분류, 흥미와 하찮음 라우팅"
description: "Luna Protocol은 모놀리스에서 네 층 아키텍처로 바뀌었어요. 어댑터와 브레인, 감정 분류기, 추론. 임베딩 중심점과 흥미와 하찮음 라우팅, 가수와 각성에 따른 LLM 매개변수 조정 이야기에요."
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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "sGjIcSSVkw/kalzr1ZG9jfeJmYrzRzc0rtLNIwmKYxQ0SRIWJdf79w7avEa0mzyDNDSyPbuPhKhUJC5c0+FFjQ=="
---

# Luna Protocol: 두뇌 공유, 감정 분류, 흥미와 하찮음 라우팅

[앞의 두 글](/articles/fr/luna-protocol-discord-bot)과 [글](/articles/fr/luna-protocol-official-models)에서는 Luna Protocol을 복잡한 행동 시스템과 미세 조정 모델이 있는 단일 Discord 봇으로 소개했어요. 하지만 아키텍처는 그 이후 많이 바뀌었어요. 모놀리스였던 것이, Discord 봇과 행동, LLM 호출을 함께 다루는 단일 Node.js 프로세스가 **네 개의 독립 층**으로 바뀌었어요. 각자 책임과 언어, 생애주기가 따로 있어요.

이 분리는 예상 밖 이득을 가져왔어요. 여러 플랫폼 사이의 "두뇌" 공유, LLM 매개변수를 동적으로 조정하는 감정 분류 시스템, 대화의 지각된 중요도에 따라 두 모델 사이 메시지를 가르는 지능적 라우팅.

진화는 한 번에 일어나지 않았어요. 유기적 길을 따랐어요. 먼저 봇 저장소에서 `server/` 폴더를 떼어서 한쪽에 **Krystal**을 만들고 **Jade**를 Discord 어댑터로 남겼어요. 다음에 Jade의 `llm-core`와 이벤트 버스를 가져와 **Pixieglow**(Matrix 어댑터)를 만들었어요. 이어서 DistilBERT로 GENERIC과 SEMANTIC 분류를 넣으려고 **Sapphire**가 왔어요. 결과가 conclusive하지 않아서 임베딩 중심점으로 넘어갔어요. 예시 보강에 더 다루기 쉽고 더 정확해서요. 분류는 FUTILE과 INTERESSANT가 됐어요. 마지막으로 LLM 온도와 반복 벌점을 조절하려고 **가수**와 **각성** 중심점을 더했어요. 끝으로 Jade와 Pixieglow 사이 중복 코드를 전부 걷어내고 공유 브레인 **Emerald**를 만들어서, Jade와 Pixieglow를 단순한 소켓 조종 클라이언트로 바꿨어요.

나란히 프로젝트 진전을 그리는 웹사이트도 유지했어요. [protocol-luna.github.io](https://protocol-luna.github.io/).

이 글에서는 왜 이 층들을 나눴는지, 각 서비스가 정확히 무엇을 하는지, **중심점**(임베딩 평균 벡터)과 **원망 변수**(70년대 PARRY 챗봇에서 영감을 받음) 같은 개념이 단순 Discord 봇을 놀랍게 일관된 멀티플랫폼 시스템으로 어떻게 바꿨는지 이야기해요.

---

## 모놀리스의 문제

처음에 Luna Protocol은 단일 Node.js 프로세스에 들어 있었어요. 코드가 이렇게 다뤘어요.

- Discord 연결 (Eris 라이브러리 경유)
- 트리거 평가 (멘션, 키워드, 후속...)
- 인간 행동 흉내 (오타, 망설임, 수면...)
- 로컬 LLM 서버(llama.cpp)에 HTTP 호출
- 세션과 안티스팸 관리
- TTS 파이프라인

전부 같은 프로세스에 있었고, 타입화된 이벤트 버스(`TypedBus`)로 소통했어요. 동작했지만 한계가 있었어요.

- 행동 코드 전체를 복제하지 않고 **Matrix 클라이언트를 추가할 수 없어요**
- **LLM과 봇이 같은 저장소**에 있었어요. `server/` 폴더가 이미 있었지만 하나를 건드리지 않고 하나를 발전시킬 수 없어요
- **무차별 처리**: "lol"이든 실존적 질문이든 각 메시지를 같은 방식으로 처리했어요
- **감정적 기억상실**: 봇이 아무것도 "느끼지" 않았어요

층으로 나누기가 이 문제들을 모두 풀었어요.

---

## 네 층

현재 Luna Protocol 아키텍처는 네 수준 깔때기로 짜여 있어요.

```
Matrix / Discord
      |
      v
  [어댑터]      Pixieglow (Matrix) / Jade (Discord)
      |
      v
  [브레인]            Emerald (WebSocket, 포트 3126)
      |
      v
  [분류기]      Sapphire (HTTP, 포트 3123)
      |
      v
  [추론]        Krystal (llama.cpp, 포트 3124 / 3125)
```

각 층은 독립적으로 다시 시작하고, 고치고, 바꿀 수 있어요.

---

### 1층: 어댑터 (Pixieglow와 Jade)

가장 단순한 층이에요. 유일한 일은 메시징 플랫폼 이벤트를 Emerald행 표준 프로토콜로 번역하는 거예요.

- **Jade**는 Discord 어댑터예요. Eris 라이브러리로 Discord에 접속하고 WebSocket으로 메시지를 Emerald에 전달해요. TTS 파이프라인도 다뤄요 (Piper 음성 합성과 OGG 변환, Discord 업로드).
- **Pixieglow**는 Matrix 어댑터예요. Matrix Client-Server HTTP API를 직접 써요 (SDK 없어요). 롱폴 sync로요. TTS는 없어요.

두 어댑터는 `emerald-client.ts`에 정한 같은 WebSocket 프로토콜을 공유해요.

```typescript
type ClientId = "jade" | "pixieglow";

// 이벤트 (어댑터에서 Emerald로)
type InEvent = MessageEvent | ReadyEvent | BotMessageEvent | PresenceEvent;

// 명령 (Emerald에서 어댑터로)
type OutCommand = RespondCommand | TypingCommand | SetPresenceCommand
                | SpontaneousCommand | ForgotCommand;
```

같은 인터페이스의 어댑터 둘이 존재한다는 것이 공유를 증명해요. 같은 "두뇌"(Emerald)가 Discord 봇과 Matrix 봇을 가리지 않고 섬기고, 행동이 똑같아요. 프로토콜은 선언적이에요. Emerald는 어댑터에게 메시지를 *어떻게* 보내라고 말하지 않고 *무엇을* 보내라고 말해요 (지연이 있는 텍스트, 버스트 계획, 반응 등). 각 어댑터는 플랫폼 따라 구체 실행을 구현해요.

이 아키텍처의 힘이 바로 이거예요. Telegram이나 Signal 지원을 더하려면 WebSocket 프로토콜을 구현하는 어댑터를 쓰면 돼요.

---

### 2층: 브레인 (Emerald)

Emerald는 중앙 결정 서비스예요. WebSocket으로 포트 3126을 듣고 이렇게 다뤄요.

- **트리거 평가**: 멘션, DM, 이름, 키워드, 후속, 무작위
- **행동 흉내**: 집중 지연, 오타, 망설임, 깜빡함, 버스트, 주제 피로
- **수면 주기**: sleep과 slow, short 모드
- **세션 관리**: 쿨다운, 세션 한도, 안티스팸
- **Sapphire행 라우팅**: 메시지 보내기, 스트리밍 답장 받기

Emerald는 공유를 가능하게 한 중앙 서비스고, 분리 이득을 가장 많이 본 곳이에요. 전에는 각 행동(오타, 버스트, 망설임)이 Discord 코드와 얽혀 있었어요. 이제는 `behavior/` 전용 모듈에 있어요.

```
emerald/src/behavior/
  burst.ts         -- 버스트 메시지 계획
  mannerisms.ts    -- 지연, 망설임, 반응, 깜빡함
  sleep.ts         -- 수면 시간 평가
  typo.ts          -- 오타 흉내 (AZERTY와 QWERTY)
```

브레인은 어떤 플랫폼에서 도는지 몰라요. `clientId`("jade" 또는 "pixieglow")가 있는 `MessageEvent`를 받고, 결정을 내리고, 명령을 돌려줘요. 나머지는 어댑터가 맡아요.

---

### 3층: 감정 분류기 (Sapphire)

Sapphire는 기술적으로 가장 흥미로운 서비스예요. FastAPI로 쓴 Python **LLM 미들웨어**로, 네 가지 핵심 역할을 해요.

1. 임베딩 중심점 경유 **이진 분류기 FUTILE과 INTERESSANT**
2. 중심점 경유 **감정 점수 (가수와 각성)**
3. Krystal행 **백엔드 라우터** (작은 모델 대 큰 모델)
4. **퓨샷 주입기**와 세션 관리자

#### 중심점: 분류의 심장

**중심점**은 단순한 개념이에요. 임베딩 벡터 집합의 평균이에요. 구체적으로 수백 개 예시 메시지를 모아서 임베딩 모델(`BAAI/bge-small-en-v1.5`, 384차원)에 통과시키고, 얻은 벡터들을 평균 냈어요.

**두 개 분류 중심점**이 있어요.

- `futile_centroid`: k-means (k=10, seed=42) 경유 하찮은 메시지 ~683개 ("lol", "ok", "hello")
- `interessant_centroid`: k-means (k=10, seed=42) 경유 묵직한 메시지 ~678개 (기술, 개인, 철학)

메시지가 오면요.

```python
def classify(text, embedder, futile_centroids, interessant_centroids):
    emb = embedder.query_embed(text)                     # 384차원 벡터
    sim_f = max(cos(emb, c) for c in futile_centroids)     # 10개 중 최대
    sim_i = max(cos(emb, c) for c in interessant_centroids) # 10개 중 최대
    diff = sim_i - sim_f
    label = "INTERESSANT" if diff > 0 else "FUTILE"
    return label, abs(diff), sim_f, sim_i
```

클래스별 점수는 10개 중심점 중 **최대 코사인 유사도**예요. 각 범주의 하위 종류를 잡아요. 인사와 작별이 임베딩 공간에서 멀어도 둘 다 하찮은 중심점 10개 중 하나 근처에 떨어져요. 시작할 때 k-means만 하고 실행할 때는 내적만 해요. 훈련도 GPU도 없어요.

#### 왜 두 모델인가요?

이 분류 결과가 어떤 LLM 백엔드를 부를지 정해요.

| 라벨 | Krystal 백엔드 | 모델 | 포트 |
|-------|----------------|--------|------|
| `FUTILE` | `generic` | Luna-Protocol-1.5B (941 Mo, Q4_K_M) | 3124 |
| `INTERESSANT` | `semantic` | Hermes-3-3B 또는 8B (설정 따라) | 3125 |

직관은 단순해요. "lol"이나 "nm just chillin u"에 80억 매개변수 모델을 부를 자격이 없어요. Discord 20만 샘플로 미세 조정된 작은 Luna 1.5B 모델이면 가벼운 교환에 충분해요. 반대로 삶에 대한 질문이나 고백, 기술 토론은 더 풍부한 답장을 만들 수 있는 큰 모델로 라우팅돼요.

이 경제적 라우팅이 LLM 서버 부하를 크게 줄여요. 메시지의 약 70퍼센트가 FUTILE로 분류되어 작은 모델이 처리하고, 큰 모델은 정말 값어치 하는 대화에 풀려요.

#### 감정 축: 가수와 각성

하지만 전부가 아니에요. Sapphire는 메시지 감정을 평가하려고 독립 축에 **같은 중심점 구조**를 써요.

**네 개 감정 중심점**이 있어요.

| 극 | 예시 |
|------|----------|
| `positive` | "hell yeah", "love that", "this is great" |
| `negative` | "shut up", "i hate this", "this sucks" |
| `high_arousal` | "WHAT THE HELL", "omg omg omg", "AAAAA" |
| `low_arousal` | "just chilling", "meh", "i guess" |

점수는 각 축의 유사도 차이로 계산돼요.

```python
valence = sim(emb, positive) - sim(emb, negative)     # [-1, +1]
arousal = sim(emb, high_arousal) - sim(emb, low_arousal)  # [-1, +1]
```

**가수**는 메시지가 긍정적인지 부정적인지 재요. **각성**은 감정 강도를 재요. 함께 정동 원형 모델(Russell, 1980년)을 이루고, 1972년 챗봇 **PARRY**에 영감을 준 것과 같은 심리 모델이에요.

#### 원망 변수: 감정이 LLM을 조종하는 방법

PARRY 영감이 만져지는 지점이 바로 여기예요. PARRY(1972년 Kenneth Colby가 만듦)는 편집증 환자를 흉내 내려고 설계된 챗봇이었어요. 내부 변수(두려움, 분노, 불신)가 답장을 바꿨어요. 예를 들어 "무서운" PARRY는 더 공격적으로 답했어요.

Sapphire는 같은 일을 하지만 연속 변수와 더 우아한 방법으로 해요. 대화의 감정 상태에 따라 LLM 샘플링 매개변수가 실시간으로 조정돼요.

##### 온도가 각성을 따라가요

```python
temperature = clamp(0.7 + arousal * 0.3, 0.4, 1.0)
```

| 각성 | 온도 | 효과 |
|---------|-------------|-------|
| -1.0 (차분) | 0.40 | 낮은 창의성, 예측 가능한 답장 |
| 0.0 (중립) | 0.70 | 기본 창의성 |
| +1.0 (흥분) | 1.00 | 최대 무작위, 놀라운 답장 |

누군가 흥분하거나 화나면 (높은 각성) 온도가 올라가요. 모델이 더 다양하고 창의적이며 가끔 더 혼란스러운 답장을 만들어내요. "달아오르는" 사람처럼요. 대화가 차분하면 온도가 내려가고 답장이 더 가라앉아요.

##### 반복 벌점이 가수를 따라가요

```python
repeat_penalty = clamp(1.15 - valence * 0.1, 1.0, 1.3)
```

| 가수 | 반복 벌점 | 효과 |
|---------|---------------|-------|
| -1.0 (부정적) | 1.25 | 강한 벌점, 반복을 피해요 |
| 0.0 (중립) | 1.15 | 기본값 |
| +1.0 (긍정적) | 1.05 | 약한 벌점, 반복을 허용해요 |

대화가 부정적일수록 모델이 반복을 피하려고 더 밀려요. 긴장된 다툼에서 말을 찾는 사람처럼요. 대화가 긍정적일수록 모델이 중복 긍정을 더 허용해요. 편안한 대화처럼요.

##### 누적 감정 상태

이 점수들은 바로 오는 메시지만 보지 않아요. `EmotionState`가 세션별 가수와 각성의 **지수 이동 평균**을 유지해요.

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

0.85 감쇠는 메시지마다 이전 상태 85퍼센트를 유지하고 새 신호 15퍼센트를 섞는다는 뜻이에요. 급격한 변동을 매끄럽게 하는 **감정 기억**이 생겨요. 부정 메시지 하나가 봇을 "슬프게" 만들지 않지만, 부정 메시지 연속이 서서히 기분을 흘러가게 해요.

실제로요. 누군가 아주 흥분해서 대화를 시작하면 (`arousal=+0.8`) 이어지는 메시지가 더 차분해도 몇 번 교환 동안 온도가 높게 남아요. 다툼 뒤에도 "열"이 남아 있는 사람처럼 감정이 내려가는 데 시간이 걸려요.

---

### 4층: 추론 (Krystal)

Krystal은 가장 낮은 층이에요. OpenAI 호환 API(`/v1/chat/completions`)를 노출하는 `llama.cpp` 래퍼. PM2 인스턴스 둘로 돌아요.

- `krystal-small`: 미세 조정 Luna 1.5B 모델, 포트 3124, CPU 친화도 0
- `krystal-large`: Hermes 3B 모델, 포트 3125, CPU 친화도 0,1

두 인스턴스는 미리 컴파일된 `llama-server` 프로세스로, CPU 고정을 위해 `taskset`으로 실행돼요.

Luna 모델 미세 조정도 두 번째 글 이후 바뀌었어요. 이제 **200,000개 샘플**로 훈련해요 (전에는 50,000개). QLoRA로 Qwen2.5-1.5B-Instruct에서, 여전히요. 200k 샘플은 Discord-Dialogues 데이터셋의 부분집합이고, 가장 자연스럽고 다양한 대화만 남기도록 필터링했어요. 목표: 퓨샷 프라이밍을 효과적으로 만드는 유연함을 잃지 않고 모델의 문체 폭을 넓히기.

---

## 전체 그림: 이동 중인 메시지 하나

Discord에 "je suis vraiment triste aujourd'hui"라고 누군가 보내면 실제로 일어나는 일이에요.

1. **Jade**가 Discord Gateway API로 메시지를 받아요. `MessageEvent`로 바꿔 WebSocket으로 Emerald에 보내요.
2. **Emerald**가 트리거를 평가해요 (멘션? 이름? 키워드?). 직접 멘션이에요. 집중 지연을 계산하고, 쿨다운과 세션, 주제 피로를 확인해요. 답하기로 하고 HTTP로 메시지를 Sapphire에 보내요.
3. **Sapphire**가 `bge-small-en-v1.5`로 메시지를 임베딩해요.
   - 분류: 메시지가 `futile` 중심점보다 `interessant` 중심점에 가까워요 (diff = +0.31) → **INTERESSANT**
   - 감정: 부정적 가수 (-0.42), 중간 각성 (0.35)
   - 라우팅: `KRYSTAL_SEMANTIC_URL` 방향 (포트 3125, 큰 모델)
   - 샘플링 매개변수: 온도 = 0.80 (올라간 각성), repeat_penalty = 1.19 (부정적 가수)
   - 세션 감정 상태가 이 값들로 고쳐져요
4. **Krystal** (large 인스턴스)이 감정 조정된 매개변수로 답장을 만들고 Sapphire에 돌려줘요.
5. **Sapphire**가 메타데이터(라벨, 가수, 각성, 디버그 통계)와 함께 Emerald로 답장을 스트리밍해요.
6. **Emerald**가 망설임("oh...") 추가를 정하고, 버스트(조각 2개)를 계획하고, 반응을 골라요. `RespondCommand`를 Jade에 보내요.
7. **Jade**가 실행해요. 초기 지연을 기다리고, 망설임이 있는 첫 조각을 보내고, 1.5초 기다리고, 두 번째 조각을 보내요. 만드는 내내 입력 중 표시기를 보여줘요.

사용자에게 전부 3초 미만에요.

---

## 중심점: 신경 분류기보다 나은 이유

전통 분류기(전에 쓰던 DistilBERT 같은) 대신 임베딩 중심점을 고른 것은 설명할 만해요.

신경 분류기는 클래스 사이 결정 경계를 배워요. 보통 입력을 확률로 투영하는 비선형 변환이에요. 정확하지만요.

- 라벨된 훈련 자료가 필요해요
- 분포 변화(data drift)에 민감해요
- 해석하기 어려워요
- 새 클래스를 더하려면 다시 훈련해야 해요

반면 중심점은 예시 임베딩들의 **평균 벡터**예요. 분류는 이 평균 벡터와의 코사인 유사도로 해요. 이점:

- **훈련 필요 없어요**: 손으로 고른 예시 임베딩 평균을 계산할 뿐이에요
- **해석 쉬워요**: 중심점에 가장 가까운 예시들을 봐서 "중심점이 배운 것"을 이해할 수 있어요
- **클래스 추가**: 다시 훈련 없이 새 중심점을 더하면 돼요
- **강건해요**: 중심점은 평균이라 이상치가 영향이 적어요

중심점의 진짜 힘은 분류 문제를 **공간 거리 측정** 문제로 바꾼다는 거예요. 범주를 384차원 공간의 영역으로 시각화할 수 있어요 (PCA와 t-SNE 차원 축소 뒤 2D와 3D로).

### 중심점 3D 시각화

실제로 분류 중심점이 임베딩 공간에서 이렇게 보여요. 각 점이 PCA로 3D 투영된 예시 메시지예요 (시각화를 위해 원래 384차원을 3으로 줄였어요). 파란 점은 하찮은 메시지, 노란 점은 흥미로운 메시지. **다이아몬드 마커 20개**는 k-means 중심점 (클래스별 10개, seed=42). 점에 마우스를 올리면 예시 원문이 보여요.

<iframe src="assets/centroids-plot.html" style="width:100%;height:550px;border:none;border-radius:8px;" loading="lazy" title="중심점 분류 - 인터랙티브 3D 보기"></iframe>

빨간색 테스트 예시 둘: "lol"(하찮게 분류)과 "i feel sad today"(흥미롭게 분류). 384차원을 3으로 줄인 뒤에도 (설명 분산 14.7퍼센트) 두 클러스터가 분명히 분리돼요. 위 주석에 정확한 개수와 모호 구역이 나와요.

입력 메시지의 중심점이 내용에 따라 이 공간을 돌아다녀요. FUTILE과 INTERESSANT 분류는 코사인 유사도로 어떤 중심점이 가장 가까운지 재는 것일 뿐이에요. 각 메시지를 여러 차원 공간의 점으로 나타낼 수 있고, 각 차원이 의미 속성에 해당해요.

---

## 실제로 바뀌는 것

사용자는 층도 중심점도 온도 조정도 보지 못해요. 하지만 효과를 느껴요.

- 단순 메시지에 **더 빠른 답장** (작은 모델이 2배 빠르고 트래픽 70퍼센트를 다뤄요)
- **적응 톤**: 화나 있으면 봇이 분노를 "느끼고" 문체를 맞춰요
- **플랫폼 간 일관성**: Matrix 봇과 Discord 봇이 같은 두뇌와 같은 감정 상태를 공유해요
- **지켜지는 진짜 톤**: 미세 조정 + 퓨샷 + 지능 라우팅이 corporate 답장을 막아요

작은 모델 훈련을 200k 샘플로 늘린 것이 이 효과를 더 키웠어요. 퓨샷 프라이밍이 주는 다루기 쉬움을 잃지 않고 모델이 Discord 대화 다양성을 더 잘 잡아요.

---

## 전체 인프라

현재 도는 서비스는 이렇습니다.

| 서비스 | 기술 | 포트 | 역할 |
|---------|------------|---------|------|
| Pixieglow | TypeScript (Bun) | -- | Matrix 어댑터 |
| Jade | TypeScript (esbuild) | -- | Discord 어댑터 |
| Emerald | TypeScript (Bun) | 3126 (WebSocket) | 브레인과 결정 |
| Sapphire | Python (FastAPI) | 3123 (HTTP) | 분류기와 감정 |
| Krystal small | llama.cpp (PM2) | 3124 | 작은 모델 (1.5B, 하찮음) |
| Krystal large | llama.cpp (PM2) | 3125 | 큰 모델 (3B+, 흥미로움) |

서비스 사이 의존은 단방향이에요. 어댑터는 Emerald에 기대고, Emerald는 Sapphire에 기대고, Sapphire는 Krystal에 기대요. 그래프는 비순환으로 남아요. 각 서비스는 독립적으로 다시 시작할 수 있어요.

---

## 결론

Luna Protocol을 네 층으로 나누기는 아키텍처 연습이 아니었어요. 구체적 한계에 대한 답이었어요. Matrix 지원 불가, 감정 의식 부재, 메시지 지능 우선순위 부재.

오늘날 시스템은 더 강건해요 (LLM 충돌이 봇을 죽이지 않아요). 더 확장돼요 (Telegram이나 WhatsApp 어댑터도 같은 WebSocket 프로토콜을 따를 거예요). 더 "살아 있어요". 봇이 지각된 대화 감정 상태에 행동과 톤, 심지어 LLM 매개변수를 맞춰요.

임베딩 중심점이 이 모든 것을 과도한 복잡함 없이 가능하게 하는 핵심이에요. 훈련된 신경망도 없고, 라벨 자료 파이프라인도 없고, 벡터 평균과 코사인 유사도뿐이에요. 단순하고, 믿을 수 없을 정도로 효과적이고, 심하게 과소평가된 기법이에요.

| 자료 | 링크 |
|----------|------|
| 프로젝트 웹사이트 | [protocol-luna.github.io](https://protocol-luna.github.io/) |
| Pixieglow | [protocol-luna/pixieglow](https://github.com/protocol-luna/pixieglow) |
| Emerald | [protocol-luna/emerald](https://github.com/protocol-luna/emerald) |
| Sapphire | [protocol-luna/sapphire](https://github.com/protocol-luna/sapphire) |
| Krystal | [protocol-luna/krystal](https://github.com/protocol-luna/krystal) |
| 글 1: Discord 봇 | [Luna Protocol: 자율 Discord 봇을 만들었어요](/articles/fr/luna-protocol-discord-bot) |
| 글 2: 미세 조정 | [Luna Protocol: 1.5B 모델을 미세 조정했어요](/articles/fr/luna-protocol-official-models) |
