---
title: "Luna Protocol: 5만 개의 Discord 샘플로 1.5B 모델을 파인튜닝하고 Few-Shot 프라이밍을 비밀 무기로 만든 이유"
description: "더 적은 데이터로 학습된 작은 모델이 더 큰 모델을 능가할 수 있습니다——프라이밍 방법을 알면 말이죠. Luna Protocol이 3B Hermes에서 1.5B Qwen 파인튜닝으로 전환한 이유와 Few-Shot 프라이밍이 진정한 게임 체인저가 된 이유를 소개합니다."
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
author_sig: "+4X4nuvn2rtneilQYfIRpo/BbvXN/waCyCreMYob+FsyrajOmPxpC+D+bkH83LNRAUph/Uhnanw9AERBq9sHUw=="
---

# Luna Protocol: 5만 개의 Discord 샘플로 1.5B 모델을 파인튜닝하고 Few-Shot 프라이밍을 비밀 무기로 만든 이유

[첫 번째 글](/articles/ko/luna-protocol-discord-bot)에서 저는 인간을 시뮬레이션하는 Discord 봇을 만들었습니다——수면, 오타, 망설임, 건망증, 자발적인 메시지까지. 행동 시스템은 탄탄했습니다. 그 뒤에 있는 LLM은 3B 파라미터의 Hermes 모델로, Q8_0으로 양자화되어 3GB의 VRAM을 소모했습니다.

작동했습니다. 하지만 과했죠.

Discord 봇이 "nm just chillin, u"라고 말하는 데 3B 파라미터 모델은 필요하지 않습니다. 필요한 것은 **스타일 일관성**——특정 대화 톤을 메시지마다 유지하고, 기업용 어시스턴트 모드로 빠지지 않는 능력입니다. 그리고 적은 데이터로 학습된 작은 모델이 몇 가지 예시로 프라이밍되면, 큰 모델이 시스템 프롬프트로 무식하게 밀어붙이는 것보다 더 잘한다는 사실이 밝혀졌습니다.

이 글은 Luna Protocol의 공식 모델에 관한 것입니다: 왜 존재하는지, 왜 3B 대신 1.5B인지, 왜 730만 개 대신 5만 개의 학습 샘플인지, 그리고 왜 Few-Shot 프라이밍이 있으면 좋은 기능에서 접근 방식의 핵심으로 자리잡았는지 설명합니다.

---

## 3B 모델의 문제

원래 설정은 `Discord-Micae-Hermes-3-3B.Q8_0.gguf`——Discord 데이터로 파인튜닝된 3B 파라미터 모델을 사용했습니다. 좋은 응답을 생성했지만, 다음과 같은 문제가 있었습니다:

| 지표 | Hermes-3-3B Q8_0 | 목표 |
|--------|-------------------|--------|
| VRAM 사용량 | ~3 GB | < 1 GB |
| 토큰 생성 속도 | ~30 tok/s | ~60+ tok/s |
| 모델 파일 크기 | ~3.2 GB | < 1 GB |
| 콜드 스타트 시간 | ~8s | ~3s |

24시간 내내 운영되는 봇에게 3GB의 VRAM은 큰 부담입니다. 게다가 생성 속도는——가끔 보내는 메시지에는 괜찮지만——폭발적인 응답이나 여러 채널이 활성화되었을 때는 느리게 느껴졌습니다.

질문은 이것이었습니다: 절반의 파라미터로 동일한 Discord-Dialogues 스타일을 얻을 수 있을까?

---

## 파인튜닝 결정: 왜 730만 개가 아닌 5만 개인가

[Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) 데이터셋은 **730만 개의 대화**와 **1700만 개의 턴**을 포함하고 있습니다. 방대한 실제 Discord 대화 코퍼스입니다. 당연한 접근 방식은 전체 데이터셋으로 학습하는 것이었습니다.

저는 반대로 했습니다. **5만 개의 샘플**로 학습했습니다——사용 가능한 데이터의 1% 미만입니다.

이유는 다음과 같습니다: **학습 세트의 크기는 모델이 학습 분포에 과적합되는 정도에 직접적인 영향을 미칩니다**.

730만 개의 예시로 학습된 모델은 대화의 매우 특정한 통계적 분포를 학습합니다. 그 분포를 재현하는 데 탁월해지지만, 동시에 **경직**됩니다——추론 시 새로운 패턴에 적응할 유연성이 줄어듭니다.

5만 개의 예시로 학습된 모델은 Discord 대화의 전반적인 톤과 레지스터(비공식적, 짧은 형식, 약어, 소문자)를 학습하지만, **맥락 내 예시로 유도**될 수 있는 충분한 유연성을 유지합니다. Few-Shot 예시는 거대한 학습 분포와 싸우지 않고, 더 가벼운 분포를 보완합니다.

이것이 핵심 통찰입니다: **제한된 학습 데이터가 Few-Shot 프라이밍을 더 효율적으로 만듭니다**.

---

## 모델: 기술적 세부사항

Luna Protocol 모델은 [Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct)의 **QLoRA 파인튜닝**입니다:

| 파라미터 | 값 |
|-----------|-------|
| 베이스 모델 | `unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit` |
| 방법 | QLoRA (4-bit) |
| LoRA 랭크 | `r=16`, `lora_alpha=16` |
| 대상 모듈 | `q/k/v/o_proj`, `gate/up/down_proj` |
| 학습 가능 파라미터 | 18,464,768 / 1,562,179,072 (1.18%) |
| 학습 데이터 | ~50,000개 예시 (Discord-Dialogues 서브셋) |
| 필터 | 샘플당 8-512 토큰 |
| 에포크 | 2-3 |
| 하드웨어 | Kaggle T4 |
| 프레임워크 | [Unsloth](https://github.com/unslothai/unsloth) |

데이터셋은 Discord-Dialogues의 전처리된 포크로, 깨끗한 `user`/`assistant` 턴만 필터링되었습니다——시스템 메시지, 메타데이터, 봇 명령어 없음. 이는 나중에 중요합니다.

### 사용 가능한 양자화

| 파일 | 양자화 | 크기 | 비고 |
|------|-------------|------|-------|
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q2_K.gguf` | Q2_K | 676 MB | 현저히 저하됨——비권장 |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf` | Q4_K_M | 986 MB | 크기/품질 균형 우수 (권장) |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q8_0.gguf` | Q8_0 | 1.65 GB | 최고의 스타일 충실도 |

권장 모델은 **Q4_K_M**——1GB 미만, 빠르며, 대화 스타일을 잘 보존합니다. Q2_K는 이렇게 작은 모델에서는 저하가 너무 심합니다. Q8_0이 최고 품질이지만 메모리를 68% 더 사용합니다.

---

## Few-Shot 프라이밍의 돌파구

여기서 모든 것이 바뀌었습니다.

HuggingFace 모델 카드에는 경고가 있습니다:

> 베어 프롬프트와 프라이밍 없이 이 모델은 Qwen의 기본 어시스턴트 톤으로 되돌아가는 경향이 있습니다. 짧은 Few-Shot 프라임이 큰 차이를 만듭니다.

이것은 버그가 아닙니다——학습 데이터가 구조화된 방식의 직접적인 결과입니다.

### 시스템 프롬프트만으로는 작동하지 않는 이유

Discord-Dialogues 학습 데이터에는 `user`/`assistant` 턴만 포함되어 있습니다. 학습 세트에는 **시스템 역할 예시가 없습니다**. 모델은 시스템 프롬프트를 스타일 지시사항으로 따르도록 학습된 적이 없습니다.

"당신의 이름은 Luna입니다, 캐주얼하게 말하세요"와 같은 시스템 프롬프트를 주면, 지시는 인식하지만 그것을 출력으로 변환할 강력한 학습 패턴이 없습니다. Qwen의 기본값인 친절하고, 구조화되고, 약간 격식 있는 방식으로 되돌아갑니다.

### Few-Shot 예시가 작동하는 이유

모델이 학습한 것과 동일한 ChatML 형식(`user`/`assistant` 턴 구조 사용)으로 대화 예시를 주입하면, 모델이 "딸깍" 하고 맞물립니다. 모델은 학습 데이터에서 패턴을 인식하고 출력을 일치시킵니다.

실제 Few-Shot 프라임은 다음과 같습니다:

```yaml
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

이 예시들은 시스템 프롬프트 뒤, 실제 대화 앞에 주입됩니다. 모델은 이를 지시사항이 아닌 대화 기록의 일부로 인식합니다. 이것이 중요한 차이점입니다——캐주얼하라고 *지시받는* 것이 아니라, 캐주얼함이 무엇인지 *보여지는* 것입니다.

### 전후 비교

Few-Shot 프라이밍 없음 (베어 시스템 프롬프트):

```
User: yo whats good
Bot: Hello! I am doing well, thank you for asking. How can I assist you today?
```

Few-Shot 프라이밍 있음 (3개 예시):

```
User: yo whats good
Bot: nm just chillin, u
```

차이는 극명합니다. 모델은 단지 다른 단어를 생성하는 것이 아니라 레지스터 전체——소문자, 약어, 캐주얼한 톤, 짧은 응답——를 채택합니다. Qwen 학습 데이터의 스타일이 아닌, 예시의 스타일에 맞춥니다.

---

## 메모리와 속도: 구체적인 수치

Hermes-3-3B에서 Luna-Protocol-1.5B로의 전환은 측정 가능한 향상을 가져옵니다:

| 지표 | Hermes-3-3B Q8_0 | Luna-Protocol Q4_K_M | 향상 |
|--------|-------------------|----------------------|-------------|
| VRAM 사용량 | ~3 GB | ~986 MB | **67% 감소** |
| 모델 파일 크기 | ~3.2 GB | ~986 MB | **69% 축소** |
| 토큰 생성 속도 | ~30 tok/s | ~60+ tok/s | **2배 빠름** |
| 콜드 스타트 | ~8s | ~3s | **62% 빠름** |
| 컨텍스트 윈도우 | 8192 | 8192 | 동일 |

### 속도 향상이 실제인 이유

작은 모델은 단순히 "덜 느린" 것이 아니라 본질적으로 추론이 더 빠릅니다. 1.5B 파라미터(3B 대신)로:

- **토큰당 행렬 곱셈 감소**: 어텐션 레이어, FFN 레이어, 출력 프로젝션 모두 파라미터 수에 따라 선형적으로 확장
- **캐시 활용 개선**: 작은 모델이 더 많은 가중치를 L2/L3 캐시에 수용
- **메모리 대역폭 부하 감소**: 토큰당 VRAM에서 읽어야 할 바이트 감소

일반적인 CPU 전용 설정(2코어, GPU 없음)에서 1.5B 모델은 3B 모델보다 약 **2배 빠른 속도**로 토큰을 생성합니다. 이는 "봇 같다"와 "사람이 타이핑하는 것 같다"의 차이입니다.

### 프롬프트 캐싱이 장점을 증폭

Luna Protocol은 프롬프트 캐싱이 활성화된 `llama-server`(`--cache-reuse 256`)를 사용합니다. 즉:

1. 세션의 첫 번째 메시지는 전체 프롬프트 처리 비용(시스템 프롬프트 + Few-Shot 예시 + 사용자 메시지)을 지불
2. 이후 메시지는 *새로운* 토큰만 처리——캐시된 프리픽스가 재사용됨
3. 5개의 Few-Shot 예시(~50-150 토큰)로 첫 요청 이후 오버헤드는 무시할 수 있음

세션의 첫 번째 메시지 이후 Few-Shot 예시는 사실상 "무료"입니다. 모델은 한계 비용 제로로 스타일 가이드를 얻습니다.

---

## 구현: 코드 작동 방식

Luna Protocol의 Few-Shot 시스템은 깔끔하고 미니멀합니다. 세 개의 파일이 모든 것을 처리합니다:

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

설정은 핫 리로드가 가능합니다. 예시를 변경하고 저장하면 봇이 즉시 새 스타일을 적용합니다——재시작 불필요.

### 2. 포맷팅과 주입 (`src/core/few-shot.ts`)

`formatFewShotExamples()` 함수는 YAML 예시를 ChatML 메시지 객체로 변환합니다:

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

`injectFewShotIntoConversation()` 함수는 시스템 프롬프트 바로 뒤에 배치합니다:

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

모든 LLM 호출 전에, 활성화된 경우 Few-Shot 예시가 주입됩니다:

```typescript
let finalMessages = messages;
if (FEW_SHOT_ENABLED && FEW_SHOT_EXAMPLES.length > 0) {
  const fewShotMessages = formatFewShotExamples(FEW_SHOT_EXAMPLES);
  finalMessages = injectFewShotIntoConversation(messages, fewShotMessages);
}
```

모델이 수신: `[system_prompt] + [few_shot_examples] + [conversation_history]`

---

## Discord-Dialogues 스타일 유지

원본 Discord-Dialogues 데이터셋은 매우 독특한 대화 시그니처를 가지고 있습니다:

- **짧은 메시지**: 턴당 평균 32.8 토큰
- **비공식 레지스터**: 약어, 소문자, 구두점 없음
- **빠른 주고받기**: 긴 독백보다는 짧은 교환
- **자연스러운 불완전함**: 오타, "lol", "fr", "ngl", "tbh"

Luna-Protocol 모델은 두 가지 메커니즘을 통해 이 스타일을 유지합니다:

### 1. 파인튜닝이 기본 분포를 이동

5만 개의 학습 샘플은 모델에게 Discord 대화의 *통계적 지문*을 가르칩니다. 응답이 일반적으로 짧고, 소문자이며, 비공식적임을 학습합니다. 이는 모델의 기본 출력을 Qwen의 친절한 어시스턴트 모드에서 이동시킵니다.

### 2. Few-Shot 프라이밍이 이를 고정

Few-Shot 예시는 파인튜닝 중 모델이 학습한 정확한 패턴을 강화합니다. 이는 **스타일 앵커** 역할을 합니다——긴 대화 중 모델이 약간 격식 있는 톤으로 흘러가더라도, 컨텍스트 내 예시가 계속해서 끌어당깁니다.

두 메커니즘의 조합은 각각을 단독으로 사용하는 것보다 더 강력합니다:
- Few-Shot 없는 파인튜닝: 모델이 *대체로* 캐주얼하지만 일관성이 없음
- 파인튜닝 없는 Few-Shot: 모델이 예시를 따르려 하지만 계속 어시스턴트 모드로 회귀
- 파인튜닝 + Few-Shot: 모델이 **일관되게** 캐릭터를 유지

---

## 철학: 더 작은 모델, 더 똑똑한 프롬프팅

LLM 배포의 통념은 "클수록 좋다"입니다. 더 많은 파라미터, 더 많은 학습 데이터, 더 많은 VRAM. Luna Protocol은 반대 접근법을 취합니다:

- **3B 대신 1.5B**: 절반의 파라미터, 절반의 메모리, 2배의 속도
- **730만 대신 5만 샘플**: 더 적은 학습 데이터, 컨텍스트 내 학습을 위한 더 높은 유연성
- **시스템 프롬프트 대신 Few-Shot 프라이밍**: 모델에게 원하는 것을 *보여주고*, 단지 *말하지* 않기

이것은 단순한 기술적 최적화가 아닙니다——설계 철학입니다. Discord 봇은 범용 어시스턴트가 될 필요가 없습니다. "nm just chillin, u"를 일관되게, 빠르게, 서버의 VRAM 예산을 모두 소모하지 않고 말하면 됩니다.

결과: 월 5달러 VPS에서 실행되고, 실시간 타이핑처럼 느껴질 정도로 빠르게 토큰을 생성하며, 파인튜닝과 Few-Shot 프라이밍의 조합(각각의 합보다 큰 효과)으로 일관된 개성을 유지하는 봇.

---

## 설정

### 모델 다운로드

```bash
npm run download-model
# Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf 다운로드
```

또는 [HuggingFace](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues)에서 수동으로 다운로드.

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
./start.sh                     # PM2 (llama-server 사용 프로덕션)
```

---

## 결론

Luna Protocol 모델은 스타일 특화 대화형 AI에서 **적을수록 더 많음**을 증명합니다. 5만 개의 엄선된 샘플로 학습된 1.5B 모델은 몇 가지 예시로 프라이밍되어, 수백만 개의 예시로 학습된 3B 모델을——극히 적은 메모리 비용과 2배의 생성 속도로——능가합니다.

Few-Shot 프라이밍은 작은 모델을 위한 단순한 "있으면 좋은" 기능이 아닙니다. 그것은 실시간 대화형 애플리케이션에서 작은 모델을 실용적으로 만드는 메커니즘입니다. 예시는 단순히 "도움"을 주는 것이 아니라——모델이 학습한 정확한 형식과 일치함으로써 모델의 행동을 근본적으로 변화시킵니다.

코드는 오픈소스, 모델은 HuggingFace에, 데이터셋은 공개되어 있습니다. 사람처럼 느껴지는 대화형 봇을 만들고 싶다면, 레시피는 이것입니다: 작은 모델, 제한된 파인튜닝, 강력한 Few-Shot 프라이밍.

| 리소스 | 링크 |
|----------|------|
| GitHub 저장소 | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| 모델 (HuggingFace) | [fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) |
| 데이터셋 | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| 첫 번째 글 | [Luna Protocol: 자율 Discord 봇을 만들었습니다](/articles/ko/luna-protocol-discord-bot) |
