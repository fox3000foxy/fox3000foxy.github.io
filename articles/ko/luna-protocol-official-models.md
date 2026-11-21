---
title: "Luna Protocol: 15억 매개변수 모델을 Discord 5만 샘플로 미세 조정했고, 퓨샷 프라이밍이 모든 것을 바꾼 이유"
description: "데이터를 적게 훈련한 작은 모델이 큰 모델을 능가할 수 있어요. 제대로 시작하는 법만 알면요. Luna Protocol이 Hermes 3B에서 미세 조정 Qwen 1.5B로 넘어간 이유, 그리고 퓨샷 프라이밍이 진짜 진전 요소가 된 이유예요."
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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "QUOJc1EUirxfhnSaYySDyZmj6c5ChBZBEYrZF/QeDOE95XBoxmVsUjLqR0kI5FQfK+ErsDyugzEtzUwF8GXqdw=="
---

# Luna Protocol: 15억 매개변수 모델을 Discord 5만 샘플로 미세 조정했고, 퓨샷 프라이밍이 모든 것을 바꾼 이유

[첫 글](/articles/en/luna-protocol-discord-bot)에서는 사람을 흉내 내는 Discord 봇을 만들었어요. 수면, 오타, 망설임, 깜빡함, 자발 메시지. 행동 시스템은 버텼어요. 그 뒤 LLM은 30억 매개변수 Hermes 모델이었고 Q8_0으로 양자화되어 VRAM 3GB를 썼어요.

동작했어요. 하지만 과했어요.

Discord 봇에게 "nm just chillin, u"라고 말하려고 30억 매개변수 모델이 필요하지 않아요. 필요한 것은 **문체 일관성**이에요. "기업 비서" 모드로 흐르지 않고 정확한 대화 톤을 메시지마다 유지하는 능력. 알고 보니 데이터 적게 훈련하고 예시 몇 개로 시작한 작은 모델이 단순 시스템 프롬프트로 밀어붙이는 큰 모델보다 잘해요.

이 글은 Luna Protocol 공식 모델 이야기예요. 왜 존재하는지, 왜 3B가 아니라 1.5B인지, 왜 730만 개가 아니라 훈련 샘플 5만 개인지, 그리고 퓨샷 프라이밍이 "멋진 보너스"에서 접근 전체 심장이 된 이유예요.

---

## 3B 모델의 문제

원래 설정은 `Discord-Micae-Hermes-3-3B.Q8_0.gguf`를 썼어요. Discord 자료로 미세 조정된 30억 매개변수 모델. 좋은 답장을 냈지만요.

| 지표 | Hermes-3-3B Q8_0 | 목표 |
|--------|-------------------|--------|
| VRAM 사용 | ~3 Go | < 1 Go |
| 토큰 만들기 | ~30 tok/s | ~60+ tok/s |
| 모델 파일 크기 | ~3,2 Go | < 1 Go |
| 콜드 시작 시간 | ~8s | ~3s |

24시간 도는 봇에 VRAM 3GB는 커요. 만들기 속도도 가끔 메시지에는 괜찮지만 버스트 답장이나 여러 활성 채널에는 느릿했어요.

질문은요. 절반 매개변수로 같은 Discord-Dialogues 문체를 얻을 수 있을까요?

---

## 미세 조정 결정: 730만이 아니라 5만인 이유

[Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) 데이터셋에는 **교환 730만 건**과 **발화 1,700만 턴**이 있어요. 진짜 Discord 대화의 거대 말뭉치예요. 뻔한 접근은 데이터셋 전체로 훈련하는 것이었어요.

반대로 했어요. **50,000개 샘플**로 훈련했어요. 가능한 자료의 1퍼센트 미만이에요.

이유는 이렇습니다. **훈련 자료 크기가 훈련 분포에 대한 모델 과적합 정도에 직접 영향을 줘요**.

730만 예시로 훈련한 모델은 대화의 아주 특정한 통계 분포를 배워요. 그 분포 재현에는 훌륭해지지만 **뻣뻣해져요**. 추론 때 주는 새 패턴에 적응할 여지가 적어져요.

5만 예시로 훈련한 모델은 Discord 대화의 전반 톤과 레지스터(비공식, 짧음, 약어, 소문자)를 배우지만, **맥락 예시로 조종**될 유연함을 충분히 유지해요. 퓨샷 예시는 이미 배운 거대 분포와 싸우지 않아요. 가벼운 분포를 보완하러 와요.

핵심 직관이에요. **제한된 훈련 자료가 퓨샷 프라이밍을 더 효과적으로 만들어요**.

---

## 모델: 기술 세부 사항

Luna Protocol 모델은 [Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct)의 **QLoRA 미세 조정**이에요.

| 매개변수 | 값 |
|-----------|-------|
| 토대 모델 | `unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit` |
| 방법 | QLoRA (4-bit) |
| LoRA 랭크 | `r=16`, `lora_alpha=16` |
| 대상 모듈 | `q/k/v/o_proj`, `gate/up/down_proj` |
| 훈련 가능 매개변수 | 18 464 768 / 1 562 179 072 (1,18 %) |
| 훈련 자료 | ~50 000개 예시 (Discord-Dialogues 부분집합) |
| 필터 | 예시당 8-512 토큰 |
| 에포크 | 2-3 |
| 하드웨어 | Kaggle T4 |
| 프레임워크 | [Unsloth](https://github.com/unslothai/unsloth) |

데이터셋은 Discord-Dialogues의 전처리된 포크예요. 깨끗한 `user`와 `assistant` 턴만 남기도록 필터링했어요. 사용자 교환과 비서 교환만 있고, 시스템 메시지도 메타데이터도 봇 명령어도 없어요. 이어지는 이야기에 중요해요.

### 가능한 양자화

| 파일 | 양자화 | 크기 | 비고 |
|------|-------------|------|-------|
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q2_K.gguf` | Q2_K | 676 Mo | 분명히 떨어져요. 비추천 |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf` | Q4_K_M | 986 Mo | 크기와 품질 좋은 절충 (추천) |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q8_0.gguf` | Q8_0 | 1,65 Go | 최고의 문체 충실도 |

추천 모델은 **Q4_K_M**이에요. 1GB 미만, 빠르고, 대화 문체를 잘 지켜요. Q2_K는 이 크기 모델에 너무 떨어져요. Q8_0은 품질이 가장 좋지만 메모리를 68퍼센트 더 써요.

---

## 퓨샷 프라이밍 돌파

모든 것을 바꾼 부분은 바로 여기예요.

HuggingFace 모델 카드에 경고가 있어요.

> 빈 프롬프트에 시작 없이 쓰면 이 모델은 Qwen 기본 "비서" 톤으로 돌아가는 경향이 있어요. 짧은 퓨샷 시작이 큰 차이를 만들어요.

훈련 자료가 어떻게 구조화됐는지의 직접 결과예요.

### 시스템 프롬프트만으로 안 되는 이유

Discord-Dialogues 훈련 자료에는 `user`와 `assistant` 턴만 있어요. 훈련 자료에 **시스템 역할 예시가 전혀 없어요**. 모델은 시스템 프롬프트를 문체 지시로 따르는 법을 배운 적이 없어요.

"너는 Luna야, 편하게 말해" 같은 시스템 프롬프트를 주면 지시는 듣지만 출력으로 바꾸는 탄탄한 학습 패턴이 없어요. 그러면 Qwen 기본 행동으로 돌아가요. 도움이 되고, 구조적이고, 살짝 격식 있어요.

### 퓨샷 예시가 되는 이유

훈련에 쓴 것과 같은 ChatML 형식으로 대화 예시를 주입하면 뭔가가 일어나요 (`user`와 `assistant` 턴 구조). 모델이 훈련에서 온 패턴을 알아보고 출력을 그에 맞춰요.

실제로 퓨샷 시작이 이렇게 생겼어요.

```yaml
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

이 예시들은 시스템 프롬프트 뒤, 진짜 대화 앞에 주입돼요. 모델은 이를 대화 기록 일부, 즉 지시가 아니라 실제 교환으로 봐요. 본질적 구분이에요. 편한 톤이 어떤 모습인지 *말해주지* 않고 *보여줘요*.

### 전과 후

퓨샷 시작 없이 (빈 시스템 프롬프트):

```
User: yo whats good
Bot: Hello! I am doing well, thank you for asking. How can I assist you today?
```

퓨샷 시작과 함께 (예시 3개):

```
User: yo whats good
Bot: nm just chillin, u
```

차이가 확연해요. 모델이 레지스터 전체를 가져가요. 소문자와 약어, 편한 톤, 짧은 답장. Qwen 훈련 자료 문체가 아니라 예시 문체를 따라 해요.

---

## 메모리와 속도: 구체 숫자

Hermes-3-3B에서 Luna-Protocol-1.5B로 넘어가면 측정 가능한 이득이 있어요.

| 지표 | Hermes-3-3B Q8_0 | Luna-Protocol Q4_K_M | 개선 |
|--------|-------------------|----------------------|-------------|
| VRAM 사용 | ~3 Go | ~986 Mo | **67 % 감소** |
| 모델 파일 크기 | ~3,2 Go | ~986 Mo | **69 % 작아요** |
| 토큰 만들기 | ~30 tok/s | ~60+ tok/s | **2배 빨라요** |
| 콜드 시작 | ~8s | ~3s | **62 % 빨라요** |
| 맥락 창 | 8192 | 8192 | 같아요 |

### 속도 이득이 진짜인 이유

작은 모델은 추론이 근본적으로 빨라요. 3B 대신 매개변수 1.5B라서요.

- 토큰당 **행렬 곱셈 감소**: 어텐션 층과 FFN 층, 출력 투영이 모두 매개변수 수에 선형으로 커져요
- **캐시 활용 향상**: 작은 모델이 L2와 L3 캐시에 가중치를 더 많이 넣어요
- **메모리 대역폭 압박 감소**: 토큰당 VRAM에서 읽는 바이트가 적어요

보통 설정, CPU만 (코어 2개, GPU 없음)에서 1.5B 모델이 3B 모델의 약 **2배 속도**로 토큰을 만들어요. "봇 티가 나요"와 "진짜 사람이 치는 것 같아요"의 차이예요.

### 프롬프트 캐시가 이점을 키워요

Luna Protocol은 프롬프트 캐시를 켠 `llama-server`를 써요 (`--cache-reuse 256`). 뜻은요.

1. 세션 첫 메시지가 프롬프트 처리 비용 전부를 내요 (시스템 프롬프트 + 퓨샷 예시 + 사용자 메시지)
2. 이어지는 메시지는 캐시된 앞부분을 재사용해서 *새* 토큰만 처리해요
3. 퓨샷 예시 5개(~50-150 토큰)면 첫 요청 뒤 부담이 무시할 만해져요

퓨샷 예시는 세션 첫 메시지 뒤에 사실상 "무료"가 돼요. 모델은 한계 비용 제로로 문체 안내를 받아요.

---

## 구현: 코드로 어떻게 동작하나요

Luna Protocol 퓨샷 시스템은 깔끔하고 미니멀해요. 파일 셋이 전부 다뤄요.

### 1. 설정 (`config.yml`)

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

설정은 핫리로드돼요. 예시를 고치고 저장하면 봇이 다시 시작 없이 바로 새 문체를 가져가요.

### 2. 형식화와 주입 (`src/core/few-shot.ts`)

`formatFewShotExamples()` 함수가 YAML 예시를 ChatML 메시지 객체로 바꿔요.

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

`injectFewShotIntoConversation()` 함수가 시스템 프롬프트 바로 뒤에 둬요.

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

### 3. 통합 (`src/core/llm-client.ts`)

LLM 호출마다 활성화되면 퓨샷 예시가 주입돼요.

```typescript
let finalMessages = messages;
if (FEW_SHOT_ENABLED && FEW_SHOT_EXAMPLES.length > 0) {
  const fewShotMessages = formatFewShotExamples(FEW_SHOT_EXAMPLES);
  finalMessages = injectFewShotIntoConversation(messages, fewShotMessages);
}
```

모델이 받아요. `[시스템_프롬프트] + [퓨샷_예시] + [대화_기록]`

---

## Discord-Dialogues 문체 유지하기

원본 Discord-Dialogues 데이터셋에는 아주 특정한 대화 서명이 있어요.

- **짧은 메시지**: 턴당 평균 32.8 토큰
- **비공식 레지스터**: 약어, 소문자, 구두점 부재
- **빠른 교환**: 긴 독백보다 짧은 교환 여러 개
- **자연스러운 불완전함**: 오타와 "lol", "fr", "ngl", "tbh"

Luna Protocol 모델은 두 구조로 이 문체를 지켜요.

### 1. 미세 조정이 토대 분포를 옮겨요

훈련 샘플 5만 개가 모델에게 Discord 대화의 **통계 발자국**을 가르쳐요. 답장이 보통 짧고 소문자이며 비공식임을 배워요. 모델 기본 출력을 Qwen의 "도움이 되는 비서" 모드에서 멀어지게 해요.

### 2. 퓨샷 프라이밍이 결과를 잠가요

퓨샷 예시는 미세 조정 때 배운 패턴을 정확히 강화해요. **문체 닻** 구실을 해요. 긴 대화 중에 모델이 살짝 격식 톤으로 흘러도 맥락 속 예시가 뒤로 끌어와요.

조합이 각 구조 따로보다 강력해요.

- 퓨샷 없는 미세 조정: 모델이 *전반적으로* 편하지만 일관 없어요
- 미세 조정 없는 퓨샷: 모델이 예시를 따르려 하지만 계속 비서 모드로 돌아가요
- 미세 조정 + 퓨샷: 모델이 **계속** 캐릭터에 머물러요

---

## 철학: 작은 모델, 영리한 프롬프팅

LLM 배포 통념은 "클수록 좋다"고 해요. 매개변수 더, 훈련 자료 더, VRAM 더. Luna Protocol은 반대 길을 가요.

- **3B 대신 1.5B**: 절반 매개변수, 절반 메모리, 2배 속도
- **730만 대신 5만 샘플**: 적은 훈련 자료, 맥락 학습의 더 큰 유연함
- **시스템 프롬프트 대신 퓨샷 프라이밍**: 원하는 것을 말만 하지 말고 모델에게 보여주기

단순 기술 최적화를 훨씬 넘는 가정한 설계 선택이에요. Discord 봇은 범용 비서가 아니라 가벼운 대화 동반자로 남아야 해요. VRAM 예산을 통째로 삼키지 않고 일관되고 빠르게 "nm just chillin, u"라고 말해야 해요.

결과: 월 5달러 VPS에서 돌고, 실시간 입력처럼 느껴질 만큼 빨리 토큰을 만들고, 각 부분 합보다 큰 미세 조정과 퓨샷 프라이밍 조합으로 일관된 개성을 유지하는 봇.

---

## 설치

### 모델 내려받기

```bash
npm run download-model
# Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf 내려받기
```

또는 [HuggingFace](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues)에서 손으로.

### 설정

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

### 실행

```bash
npm run dev                    # 개발 (핫 리로드)
npm run build && npm start     # 프로덕션
./start.sh                     # PM2 (llama-server와 함께 프로덕션)
```

---

## 결론

Luna Protocol 모델들은 문체 중심 대화형 AI에 **적을수록 좋다**를 증명해요. 정성껏 고른 5만 샘플로 훈련한 1.5B 모델이 예시 몇 개로 시작해서 수백만 예시로 훈련한 3B 모델을 능가해요. 메모리 비용 일부분에 만들기 속도 2배로요.

퓨샷 프라이밍이 작은 모델의 핵심 구조예요. 실시간 대화 앱에 쓸 수 있게 만드는 것이 바로 이거예요. 예시는 "돕는" 것을 훨씬 넘어요. 훈련된 형식을 정확히 따라 하면서 모델 행동을 근본적으로 바꿔요.

코드는 오픈 소스, 모델은 HuggingFace에, 데이터셋은 공개. 사람처럼 느껴지는 대화 봇을 만들고 싶으면 레시피는요. 작은 모델, 제한된 미세 조정, 탄탄한 퓨샷 시작.

| 자료 | 링크 |
|----------|------|
| GitHub 저장소 | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| 모델 (HuggingFace) | [fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) |
| 데이터셋 | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| 첫 글 | [Luna Protocol: 자율 Discord 봇을 만들었어요](/articles/en/luna-protocol-discord-bot) |
