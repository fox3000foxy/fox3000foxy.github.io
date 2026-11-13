---
title: "Sabaki vs System One : 다윗 대 골리앗, 세상에서 가장 작은 결정 모델"
description: "20KB 대 421M 파라미터. Sabaki는 typed-decisions에서 7점을 내주지만 CPU 25초를 오프라인 1ms 미만으로 바꿔요. 조직형 MoE 해부기."
date: 2026-11-12
tags:
  - ai
  - system-one
  - typescript
  - cpu
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "gUWZB0CSqAV0/KF3s5E84avyZETtnpQt1DC4PLy3K1WBAel71qKTju3s7Oeb+1XXnUZBCvCypkTOovkW8jdb4A=="
---

## 소개

9월부터 Hacker News나 트위터 좀 봤다면 Jev를 무조건 봤을 거예요.

2026년 9월 15일, TypeSafe가 Jev를 내놔요. 자기들의 첫 번째 "System One"이죠. 피치는 한 문장이에요. 라벨 고른다고 LLM한테 JSON 생성시키지 마세요. `state`에 타입 달린 질문들을 넘기면 확률 딸린 타입 결정으로 돌려줘요. 한 번에, 샘플링할 토큰 제로, 뒤에 파싱할 것도 없음.

터졌어요. Vercel AI Gateway에서 첫날 도입 기록, 며칠 만에 Elixir 클라이언트 다섯 개, 다들 자기 거랑 Jev 붙여서 벤치마크 돌리기. 사실 hype은 이해돼요. 몇 년 동안 `{"choice": ...}로만 답해` 같은 프롬프트 쓰면서 모델이 옵션 날조하지 않게, JSON 깨먹지 않게, 필드 환각하지 않게 빌었잖아요. Jev가 그 수요에 이름 붙여서 깔끔한 API로 ship했어요. `POST /v1/systemone`, `choice / score / noul` 질문, `probabilities` + `confidence` 딸린 응답.

아이디어는 진짜 좋았어요. 에코 모델은 덜 좋았고요. 분명히 말하면, Jev에 돈 낸 적은 없어요.

왜냐면 Jev는 결국 닫힌 API거든요. 가중치 비공개, 셀프호스트 불가, 결정 한 번이 네트워크 왕복 한 번 + 과금 한 번. 그리고 뒤따라 나온 오픈 대안들은 400M 파라미터에 GPU 필수예요.

그래서 반대쪽 극단으로 만들었어요. [Sabaki](https://sabaki.fox3000foxy.com/). 키워드 라우터 + 순수 TypeScript 로지스틱 회귀인데 Jev랑 컨트랙트가 같아요 (같은 `choice / score / noul` 셰이프, `serve()`가 서빙하는 같은 `/v1/systemone` 엔드포인트). 근데 **1ms 미만**에 돌아가고 **20킬로바이트** JSON이면 돼요. nano 모드에서는 의존성 제로, 오프라인, 0원.

감 잡으시라고요. Laya는 safetensors 843MB를 로드해야 해요. OpenDecider-nano는 RAM 2GB예요. Sabaki nano invoices는 20KB예요. 무게비가 대충 **40,000배**예요.

제대로 된 숫자 버전 보고 싶으면 사이트에 있는 2026년 10월 preprint v1이 있어요. *Sabaki: An Organizational Mixture-of-Experts for Typed Decisions on CPU* ([PDF](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf)). 설계, 측정, 트레이드오프 다 들어있어요. 이 글은 읽기 쉬운 버전이고, 코드는 옆에 열어뒀어요.

혼자 방에서 벤치마크 종이 쓰듯 만든 것도 아니에요. 저는 [azalio/doomLaya](https://github.com/azalio/doomLaya) (제 포크는 [fox3000foxy/doomLaya](https://github.com/fox3000foxy/doomLaya))에 기여해요. Laya랑 Jev가 FreeDoom을 진짜로 플레이하는 하네스예요. 모델이 직접 결정하고, 틱마다 텔레메트리 뽑고, 영상도 남아요. 골리앗이 실전에서 뛰는 걸 직접 봤고, 네트워크가 기침만 해도 같이 기침하는 것도 봤어요.

이제 엔진을 하나씩 열어볼게요. 늘 그렇듯, 진짜 코드랑 같이요.

## 모두가 싸우기로 합의한 링

Jev, Laya, OpenDecider가 다 같이 인용하는 데이터셋은 하나예요. [LocalLLaMA/typed-decisions](https://huggingface.co/datasets/LocalLLaMA/typed-decisions). 합성 워크플로 4개 (support, factures, sécu, agent traces), 케이스당 질문 5개, train 1200 케이스, test 400 케이스, 결정 2000개.

| 모델 | 파라미터 | 테스트 점수 | 레이턴시 | 실행 환경 |
|---|---|---|---|---|
| OpenDecider-nano | ~400M | 0.796 | 17ms GPU | GPU, RAM 2GB |
| Laya typed-decisions | 421M | 0.766 | ~25s/state CPU, ~830ms/케이스 MLX | GPU |
| Jev 1.13 | 비공개 | ~0.73-0.75 | ~710ms API | API 전용 |
| **Sabaki mini** | 22M int8 | **0.69** | **~20ms CPU** | CPU, 22MB |
| **Sabaki nano** | ~0 | **0.61** | **<1ms** | 어디서든 |
| Laya base 제로샷 | 421M | 0.362 | 동일 | GPU |

랜덤이 0.318, majority가 0.461이에요. 그러니까 파인튜닝 없는 Laya base 0.362는 "예의 바르게 찍기" 수준이에요. 기억해두세요, 뒤에서 써먹어요.

Sabaki랑 1등 사이에는 7점이 있어요. GPU 없을 때는 반대 방향으로 1000배 레이턴시가 있어요. 이 글 전체를 두 문장으로 줄이면 그게 다예요. 나머지는 왜 그런지 이해하려는 거예요.

하나 주의할 점. 같은 `choice / score / noul` 소켓 뒤에 주방은 완전히 달라요. Jev는 닫힌 API, Laya는 파인튜닝한 ModernBERT-large, OpenDecider는 증류한 Ettin-encoder, Sabaki는 단어 세기 + int8 MiniLM이에요. 컨트랙트는 같고, 예산은 비교가 안 돼요.

## Jev, 모두가 본 한 방

TypeSafe한테 돌릴 건 돌려줘야 해요. System One 컨트랙트, 진짜 좋은 아이디어예요.

예전에는 티켓 분류하려면 이렇게 했어요. LLM한테 "billing, technique, spam 중에 골라, JSON으로 답해"라고 시키고, 응답 파싱하고, 얘가 "제 생각엔 billing이에요! 😊"라고 답하거나 4번째 카테고리 날조하는 경우를 처리했어요. 질문 하나가 토큰 몇 개, 응답 하나가 파이프라인 터질 리스크였어요.

Jev는 거래를 바꿨어요. 텍스트 + 기준 딸린 질문들을 보내면, 각 질문을 병렬로 평가해서 타입 있는 값이랑 분포를 돌려줘요.

```bash
curl https://api.typesafe.ai/v1/systemone \
 -H "Authorization: Bearer $KEY" \
 -H 'content-type: application/json' \
 -d '{"state":"charge double ce mois-ci","questions":{"dept":{"type":"choice","instructions":"Route ce message.","criteria":{"billing":"paiements","technical":"bugs"}}}}}'
```

응답은 `{ choice, probabilities, confidence }`예요. 자유 텍스트 없음. 코드에서 바로 분기 탈 수 있어요.

바이럴 난 이유가 여기예요. Python + JS SDK, Claude Code 플러그인, LangChain 연동, 다들 오후 한나절이면 에이전트에 붙일 수 있었어요. TypeSafe 문서도 건강한 패턴을 밀어요. 빠른 작은 판단은 Jev, 진짜 결정 조합은 주변 결정적 코드, 신뢰도 낮으면 느린 LLM이나 사람.

문제는 나머지예요. 가중치 비공개, 오프라인 불가, 호출당 과금. 한 번 도는데 결정 100번 내리는 에이전트면 세금이 아파요. 35틱/s Doom이면 끝이에요. doomLaya에서 Jev는 MAP01 seed 48을 68.97초에 깨고 p50 HTTP가 357ms예요. 그 런에서 API 비용 $0.0046이 찍혀요. 제 청구서가 아니라 벤치마크 청구서예요. 돌아는 가요, 런도 깨끗하고 죽지도 않아요. 근데 35틱/s에 357ms면 게임은 계속 돌아가는데 12틱 동안 네트워크 기다리는 거예요.

Sabaki는 이 컨트랙트를 그대로 베꼈어요. 같은 질문, 같은 응답, `serve()`가 서빙하는 같은 `/v1/systemone` 엔드포인트. 데이터센터 필요한 부분은 다 떼고요.

## Laya, API 없이 된다는 걸 보여준 큰 오픈 모델

[Convai Innovations의 Laya](https://github.com/NandhaKishorM/laya), Apache-2.0이에요. 보닛 밑에는 ModernBERT-large 421M, 옵션당 `[MASK]` 토큰 1개. 각 마커의 hidden state가 작은 MLP를 거쳐서 그 질문 옵션들에 softmax. Jev처럼 질문당 한 패스예요.

```python
pipe = pipeline("text-classification", model="convaiinnovations/laya-typed-decisions")
```

0.766은 뜯어볼 가치가 있어요. 이건 벤치마크 train에 **파인튜닝한 체크포인트**예요. 1200 케이스, 로짓에 가우시안 노이즈 넣은 RLCD, log + spherical 리워드. 같은 모델도 이 핏 빼면 0.362로 떨어져요. 그냥 찍는 거나 다름없어요. 그러니까 Laya 점수는 "큰 인코더 + 도메인 학습"이지 "마법의 큰 인코더"가 아니에요.

CPU에서는 벽돌이에요. 측정한 ONNX 포트는 state당 한 25초예요. MLX FP16으로는 케이스당 평균 830ms, p99는 5.3초예요. 그리고 뭔가 답하기 전에 843MB를 먼저 로드해야 해요.

doomLaya에서는 스톡 Laya가 MAP01을 180초 안에 못 깨요. Doom 데이터로 다시 학습한 v3 ([azalio/laya-doom-v3](https://huggingface.co/azalio/laya-doom-v3))은 MPS에서 p50 108ms로 61.43초에 깨고, 가는 길에 샷건도 주워요. 그러니까 돼요, 돼는 건 맞아요. 전용 학습 하고, Apple GPU 얹고, 진짜 일은 스크립트 실행기(A*, 15틱 latch 문 열기, 자동 조준)가 다 해줄 때요.

제 요약은 이래요. 자기 태스크 학습 없으면 Laya는 421M짜리 문진이에요. 학습 있으면 엄청 세요. 근데 GPU랑 데이터가 있어야 해요.

## OpenDecider, 리더보드를 가져간 애

[OpenDecider](https://github.com/manjunathshiva/opendecider)는 Manjunath가 걔들 벤치마크 위에서 걔들을 이기기로 마음먹은 프로젝트예요. 결과는 Ettin-encoder-400m 풀 파인튜닝 + MLP 헤드, Qwen3-235B + DeepSeek에서 증류한 soft target에 KL loss로 **0.796**이에요.

```bash
pip install opendecider
# L40S에서 질문당 17ms, M4 Max에서 18ms, 배치로 약 9ms
```

coverage 50%에서는 selective accuracy가 0.943까지 올라가고 Jev는 0.882예요. 종이 위에서는 둘 다 잡은 거예요. 오픈, 캘리브레이션, 빠름.

현실에서는요. nano 로드에 RAM 2GB, 17ms 뽑으려면 GPU 필수, 피싱은 0.63 대 Jev 0.90 (OOD에서 털려요), 그리고 Laya처럼 벤치마크 train에서 학습했어요. test는 안 봤지만 도메인은 본 거죠.

힘싸움은 이겼어요. 그래도 뒤에 GPU 달린 400M이에요. Cloudflare Worker나 노트북 게임 루프에 갖다 박을 물건은 아니에요.

## 150M급, 그리고 그 아래 빈 공간

openJev-verdict-2.0 (151M), julia-1 (144M 다국어), Open Jev (150M), Largha-150M (144M en+zh), Vela (0.3B-9B). 다 ModernBERT나 mmBERT-small, 다 CPU에서 돌아가고, 학습도 만만해요 (Open Jev는 Colab T4로 30분이라 그래요). 숫자는 self-reported에 프로토콜도 제각각이라 조심해서 봐야 하지만, 이 가족은 존재해요.

제너럴리스트 Sabaki는 **22.7M**이에요. 이 라인에서 제일 작은 애보다 한 6.5배 작아요. 런타임에 정의된 질문에 답하면서 100M 밑으로 내려가는 애는 달리 없어요.

"세상에서 제일 작다"가 그 뜻이에요. 점수 1등이 아니라, `instructions` + `criteria` 읽고 스페셜리스트가 모를 때 결정을 내리는 제일 작은 봉투예요.

## Sabaki, 멍청한 라우터와 일회용 엑스퍼트들

자, 큰 애들 얘기는 됐고요. 다윗으로 가요. 여기서부터 재밌어져요.

Sabaki는 세상을 이해하는 똑똑한 큰 모델이 되려고 안 해요. 조직형 MoE예요. 시스템 레벨 sparse 라우터 1개, 독립된 엑스퍼트들, 인풋당 1개만 활성화. 각 플러그인은 npm 패키지 하나씩 따로, manifest랑 가중치랑 버전 들고 있어요. 라우팅되는 것만 설치하면 돼요.

[org sabaki-js](https://github.com/sabaki-js) 상황은요. 리포 13개, 코어 `sabaki` (129 커밋), 플러그인 6개 `@sabaki-js/*`, 가중치, Cloudflare worker, 직접 만드는 법 템플릿.

코어 `package.json`이 이미 다 말해줘요.

```json
"dependencies": { "@typesafe-ai/sdk": "^0.7.0" },
"optionalDependencies": { "onnxruntime-node": "^1.22.0" }
```

nano 모드에서는 런타임 의존성 제로예요. 컴파일된 TypeScript만, 설치할 거 없음, ONNX 버전 사이에 깨질 거 없음.

### 라우터, 몇 줄로 결정하는 법

라우터는 `src/index.ts`에 살아 있고, 토크나이저는 이렇게 생겼어요 (`src/index.ts:129`).

```ts
function tokens(s: string): string[] {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/).filter((w) => w.length > 3);
}
```

소문자, 악센트 제거, 4글자 이상 단어만. 이 필터가 노이즈("le", "de", "ok")를 다 날려요. 지원 티켓에서는 매칭이 의미 있는 단어 위주로 걸리니까 판이 바뀌어요.

스코어링 자체는 `route()` 안에 있어요 (`src/index.ts:251`). 승부는 여기서 나요.

```ts
const hits = kws.filter((k) =>
  words.some((w) => w.includes(k) || k.includes(w))).length;
const score = hits / Math.sqrt(kws.length);
```

양방향 느슨한 매칭이에요. `billing`이 `billed`를 잡고, `invoice`가 `invoicing`을 잡아요. 루트로 나누는 건 키워드 리스트 큰 애 패널티 안 주려고요. 안 그러면 키워드 600개짜리 mail 플러그인이 "hello" 들어간 메일마다 다 먹어버려요.

플러그인마다 임계값이 있고, 기본 0.15는 `src/index.ts:139`에 있어요. mail은 제목이 짧아서 0.03이에요. 그 밑이면요.

```ts
return { domain: "unknown", decision: null, confidence: 0, plugin: null };
```

모르는 도메인은 `unknown`이지, 기분 좋으라고 찍어내는 guess가 아니에요. 일부러 멍청하게 짠 거고, 나중에 `automate > 0.8` 스레시홀딩이 쓸만한 이유가 정확히 이거예요. Sabaki가 답하면 진짜 스페셜리스트가 매칭된 거예요.

보너스로 `langid` 언어 축도 있어요. `languages` 선언한 플러그인은 자기 언어에서만 경쟁해요. 라틴 피싱이랑 CJK 나누기 좋아요. 텍스트 너무 짧으면 필터 없이 다 붙어요.

총비용은 결정당 몇 마이크로초예요. 곱할 행렬도 없고, 호출할 네트워크도 없고, 문자열 비교 몇 개랑 나눗셈 하나면 끝.

### Nano, 리포에서 제일 좋아하는 파일

`src/logreg.ts:28`의 토크나이저예요.

```ts
function tokens(s: string): string[] {
  const words = s.toLowerCase().split(/[^a-z0-9]+/)
    .filter((w) => /^[a-z]{3,}$/.test(w));
  const out = [...words];
  for (let i = 0; i < words.length - 1; i++)
    out.push(`${words[i]} ${words[i + 1]}`);
  return out;
}
```

유니그램 + 바이그램이에요. `charged twice`가 `charged`, `twice`, 그리고 페어 `charged twice`로 나와요. 400M짜리 트랜스포머 없이 "이중 청구" 잡는 데 이 정도면 충분해요.

`src/logreg.ts:46`의 벡터화, TF-IDF가 일하는 자리예요.

```ts
const tf = 1 + Math.log(c);  // 서브리니어 TF
const val = tf * w.idf[i]!;  // sklearn식 스무스 IDF
```

단어 10번째 등장은 처음보다 덜 세고, 희귀 단어가 "please"보다 무거워요. sklearn 레시피 그대로예요. 20개 질문에서 완전 동등성 검증했어요.

다시 읽다가 웃은 주석이 있어요.

```ts
// 3000차원 다 훑지 않고 있는 텀(희소)만 건드림
for (const [t, c] of counts) {
```

티켓마다 3000차원을 다 훑는 대신 그 티켓에 있는 스무 개 단어만 건드려요. 1ms 미만이 나오는 이유가 여기예요. 프로덕션에서는 이런 안 보이는 디테일이 다 바꿔요. 복잡도가 어휘 크기가 아니라 티켓 크기를 따라가거든요.

`src/logreg.ts:86`의 추론, 세 줄이면 끝이에요.

```ts
// 이진: 계수 1줄 + 시그모이드
const pPos = 1 / (1 + Math.exp(-s));
// 다중클래스: 내적 + 소프트맥스, argmax
```

내적 한 번, 클래스 수에 따라 시그모이드나 소프트맥스 하나. 한 패스면 끝. 생성 토큰 제로라서 뒤에서 retry랑 파싱 휴리스틱으로 고칠 깨진 JSON도 제로예요.

`train.py` 레시피는요. 워크플로당 train 300개 / test 100개, 결정적 스플릿 (시간 편향 피하려고 5개 중 1개를 test로), 어휘 3000-6000, 계수는 1e-4로 반올림해도 측정 손실 제로. JSON `{ vocab, idf, questions }`로 익스포트.

가중치는 invoices 20KB (`duplicate` 0.89)부터 mail 650KB (`bucket` 0.889)까지예요. 프론트엔드 번들에 들어갈 크기죠.

눌러앉게 만든 디테일이 있어요. mail에서는 MiniLM이 TF-IDF랑 +-0.02로 붙어있어요. 그래서 nano 그대로 ship해요. 메일 분류하자고 GPU 돈 쓸 생각 없어요. 반대로 agent_trace는 막혀요 (nano에서 `needs_review` 0.59). 관측 텍스트가 빈약해서 결정을 먹여줄 단어가 없어요.

가중치를 플러그인으로 바꾸는 공장, `src/plugin.ts:52`에 있어요.

```ts
export function nanoClassifier(manifest, weights, opts = {}) {
  return definePlugin({ manifest,
    classify: (input) => {
      const r = predict(`${from}${input.state}`, weights, q);
      return { decision: r.decision, confidence: r.confidence, domain: manifest.domain };
    }});
}
```

`decide()`는 nano라서 동기 유지, `decideAsync()`는 mini용으로 ONNX를 풀어요. 경로 두 개, 규칙 하나. async 필요하면 mini 원한다는 뜻, 아니면 nano면 돼요. 코드 짤 때 외우기 쉽고, 깨졌을 때 디버그하기 쉬워요.

이론만 떠드는 거 아니라는 거 보여주려고 실제 사용 모습 가져왔어요.

```ts
import { Sabaki } from "sabaki";
import customerService from "@sabaki-js/customer-service";

const sabaki = new Sabaki().register(customerService);
sabaki.decide({ state: "charged twice, refund please" });
// { decision: "billing", confidence: 0.31, domain: "customer_service" }
```

### Mini, 어려운 케이스를 바꾸는 22MB

nano 한계는 위에서 agent_trace로 봤죠. MiniLM-L6이 이어받아요. 도메인 전체에서 공유하는 인코더 하나 + 질문별 선형 헤드 하나. 8-12 에폭 end-to-end 파인튜닝, lr 2e-5, 학습은 CUDA GPU에서 (추론은 CPU로 남는 게 포인트예요).

판가름 낸 숫자, 같은 스플릿에서 잰 거예요.
- 인코더 고정 + MLP : 0.65
- 풀 파인튜닝 : 0.68
- 400M에서 고정 임베딩으로 증류 : 테스트해보고 버림, gold label보다 못함

dynamo로 ONNX 익스포트, 완전 동등성 검증, 그 다음 동적 int8 양자화. 90MB에서 22MB로, customer_service에서 accuracy **-0.004**예요. ECE는 그대로거나 더 좋아요. 각 익스포트는 다시 측정해요. 안 그러면 최적화가 무슨 의미인지 모르거든요.

1.0.2부터 가중치는 패키지 안에 들어있어요 (`models/<workflow>-int8/` + `modelDir` 익스포트). `npm i`면 끝, 비행기 모드 OK. 업데이트는 trusted publishing으로 서명한 패치 발행이에요.

구체적으로요. `needs_review`가 0.59에서 **0.82**로 가요. `disposition`은 0.73에서 0.76으로. ECE는 전부 0.14 미만, OOD에서는 건강한 의심이 담긴 (dragons, 레시피, 빈 문자열에 0.2-0.5). 이 의심 덕분에 프로덕션에서 공격적인 스레시홀딩이 가능해요.

### Generalist, Sabaki를 진짜 System One으로 만드는 catch-all

Jev랑 다른 애들은 뭐든 답해요. 어떤 질문, 어떤 옵션이든 런타임에 정의하면 돼요. Jev를 바이럴 나게 한 System One 컨트랙트가 그거예요. `instructions` + `criteria`랑 옵션 주면 잘라줘요.

Sabaki 스페셜리스트는 그걸 못 해요. 자기 질문(`category`, `duplicate`, `bucket`)만 알고 그 외는 몰라요. 망이 없으면 스크립트 벗어나는 순간 Sabaki는 `unknown`을 뱉고, Jev는 뭐라도 답해요.

generalist가 그 망이에요. 질문 + 옵션 + state를 읽고 점수를 내는 크로스 인코더, 옵션당 한 패스, softmax, argmax. 22.7M MiniLM int8이라 그 라인 144-151M보다 6.5배 작아요. 근데 얘 일은 점수가 아니라 호환성이에요. fallback으로 물려두면 `POST /v1/systemone`이 Jev처럼 어떤 state, 어떤 질문이든 받아요. `model` 필드가 진짜 답한 애를 말해줘요 (`@sabaki-js/mail@1.1.2+mini`, `sabaki-generalist-v1`...). 호출 쪽에서는 바꿀 게 없어요.

그리고 중요한 건, 얘는 fallback이지 보스가 아니에요. `decideAsync()`의 철칙은요. 스페셜리스트가 라우팅을 이기면 걔가 답해요. generalist는 `unknown`일 때만 말해요. 반대는 절대 없어요. 그래야 자기 도메인에서 잘하는 스페셜리스트를 평균적인 제너럴리스트가 덮어쓰는 일이 없어요.

로더는 `src/generalist.ts`에 있고, ONNX 세션을 매번 다시 로드하지 않게 폴더별 캐시를 써요.

```ts
export function loadGeneralist(modelDir: string) {
  // 폴더별 캐시, ONNX 세션 재사용
  // tokenizer.json -> Unigram 또는 wordpiece, 자동 감지
  const sess = await ort.InferenceSession.create(
    path.join(modelDir, "generalist.onnx"),
    { intraOpNumThreads: 2 },
  );
}
```

`SABAKI_GENERALIST_DIR`을 `generalist.onnx` + `tokenizer/` 들어있는 폴더로 가리키면 돼요. 모델은 교체 가능해요. id는 `config.json`에서 오고, 없으면 `"sabaki-generalist"`예요. `Map` 캐시 덕분에 호출마다 세션을 다시 안 올려요.

입력 포맷은 클래식 크로스 인코더예요. 질문, 옵션이랑 state를 구분자로 이어붙이고, 점수 매길 옵션마다 한 줄씩요.

```ts
const texts = options.map(
  (o) => `${input.question ?? "decision"} [SEP] ${o} [SEP] ${input.state}`,
);
```

질문 + 옵션 + state를 `[SEP]`으로 나누고 옵션당 한 줄이에요. 옵션은 8개까지 잘라요 (`slice(0, 8)`). 아무것도 안 주면 기본 `["yes", "no"]`예요. 그 이상은 호출 쪽에서 쪼개야 해요. 타입 결정치고 8개면 이미 넓어요.

다음은 얌전해 보여서 그렇지 옵션 수만큼 레이턴시를 나누는 배치 트릭이에요. 옵션당 `session.run` 한 번 대신 다 묶어서 포워드 한 번으로 보내요.

```ts
// 모든 옵션 한 번에 배치 포워드 한 번
// (최대 길이에 패딩) 옵션당 한 번씩 돌리는 대신.
const L = Math.max(...encs.map((e) => e.ids.length));
// ids + attention_mask를 [options.length, L]로, padId로 패딩
const out = await sess.run({ input_ids, attention_mask });
const scores = Array.from(out["score"].data).map(Number);
```

각 텍스트를 인코딩하고 (tokenizer.json에 따라 BERT식 wordpiece나 SentencePiece unigram), 배치에서 제일 긴 길이에 맞춰 패딩하고, `[옵션 수, L]` 텐서로 쌓아요. `sess.run` 한 번에 옵션당 점수 하나씩 받아와요. CPU에서는 이게 다예요. 8배 시간 대신 20-36ms예요.

그 다음은 softmax + argmax, 옵션별 전체 확률이 담긴, Jev가 유행시킨 포맷 그대로예요.

```ts
const pr = softmax(scores);
// bi = 최대값 인덱스
const confidence = Math.round(pr[bi] * 1000) / 1000;
const probs = Object.fromEntries(
  options.map((o, i) => [o, Math.round(pr[i] * 1000) / 1000]),
);
```

프로덕션에서 쓸 수 있게 만드는 디테일은 데모로 안 끝나게 해주는 `abstainAt`이에요.

```ts
if (input.abstainAt !== undefined && confidence < input.abstainAt) {
  return { decision: null, confidence, domain: "generalist", probabilities: probs };
}
```

Opt-in이고 기본 abstention은 없어요. `abstainAt: 0.6-0.7`을 넘기면 무른 건 다 guess 대신 `null`로 돌아와요. 분포 밖에서는 틀리고도 softmax가 1.00을 뱉는 걸 봤으니 사치가 아니에요. GUIDE는 자율 운용에 다 권장해요. 임계값 밑이면 자동 해결 말고 해명을 물어보라고요.

마지막으로 generalist fallback 붙인 같은 구성이에요. 스페셜리스트 매칭이 없으면 `unknown` 대신 얘가 이어받아요.

```ts
import { Sabaki, definePlugin, loadGeneralist } from "sabaki";
import mail from "@sabaki-js/mail";

const backend = loadGeneralist(process.env.SABAKI_GENERALIST_DIR!);
const generalist = definePlugin({
  manifest: { name: "@sabaki-js/generalist", domain: "generalist",
    version: "0.1.0", questions: ["decision"], keywords: [] },
  classify: (input) => backend.decide(input),
});

const sabaki = new Sabaki().register(mail).setFallback(generalist);

await sabaki.decideAsync({
  state: "le client dit que l'app a supprimé ses données",
  question: "c'est urgent ?",
  options: ["yes", "no"],
  abstainAt: 0.65,
});
// 라우팅 맞으면 mail 스페셜리스트, 아니면 Jev식 catch-all로 generalist
```

generalist 세대들, 다 같은 잣대로 쟀어요. PhishNChips (메일 2000개)랑 비교 가능한 부분은 typed-decisions test에서요.
- v4 : test 0.29, R=0.026 피싱. 버릴 거예요, 옆으로 답했어요.
- A (22M 80k) : 0.546, R=0.406. 뭔가 모양이 나오기 시작해요.
- mini v1 서빙 중 : **0.536, R=0.616**. 사이트에서 도는 게 이거예요. 피싱 리콜 괜찮고 test는 중간.
- B (144M 스크래치) : 0.568, R=0.062. 더 크고 test는 살짝 좋고 피싱은 망.

144M을 스크래치로 키워도 전이가 안 좋다는 게 "파라미터 늘리면 일반화된다"는 생각을 접게 했어요. 같은 태스크에서 큰 애가 돈만 더 들고 더 잘 맞히지도 않아요. catch-all로도 작은 애가 일을 해요. 그리고 EN 전용으로 남아있어요 (`all-MiniLM-L6-v2`), 라우팅 EN, FR은 분포 밖. FR이면 generalist 말고 그쪽 학습한 스페셜리스트로 가야 해요.

## Doom, 저한테 진짜로 중요한 유일한 테스트

doomLaya는 Laya랑 Jev가 FreeDoom을 진짜로 플레이하는 거예요. 모델이 `command / target / weapon`을 고르고, 실행기가 A* 경로 짜고, 문 열고, 조준하고, 클릭해요. 틱마다 텔레메트리, 영상, 런 SHA. 기여하는 입장이라 멀리서 리더보드 읽고 말하는 게 아니에요.

v0.1.0, MAP01 seed 48, skill 3, 35틱/s, 같은 실행기예요.

| 모델 | 결과 | p50 HTTP | API 비용 |
|---|---|---|---|
| Laya stock | 실패 180초 | 106ms | $0 |
| Laya v3 적응형 | 클리어 61.43초 | 108ms | $0 |
| Jev 1.13 | 클리어 68.97초 | 357ms | $0.0046 |

두 번 다 깨끗하게 죽지 않고 클리어했고, Laya는 실행기가 픽업을 알아서 해서 가는 길에 샷건도 주웠어요. 정직하게 말하면요. Laya v3는 Doom으로 학습했고 Jev는 아니에요. 시드 하나, 맵 하나로는 일반화 증명이 안 돼요. 프로젝트 README도 그걸 대놓고 말하고, 결과 부풀리기를 안 하는 건 훌륭해요.

Sabaki 쪽은요 ([plugin-doom](https://github.com/sabaki-js/plugin-doom)). Python ViZDoom이 매 틱 JS 서버를 호출해요. i5 한 스레드에서 nano는 초당 약 18k 요청, mini는 약 71 요청. 35Hz 틱은 평균 노트북에서도 널널해요.

출구 나침반이 있으면 mini는 6번 중 2-4번 MAP01을 깨고 nano는 0/6이에요. 당연해요. 텍스트로 공간 정보가 날아가고, doomLaya 상태는 MiniLM이든 ModernBERT-base든 한 0.57에서 막혀요. 공간 정보가 없으면 텍스트 분류기가 그걸 발명하지는 못해요.

이웃들이 같은 데이터로 리매치를 했어요. [doomgemma](https://github.com/dexmac221/doomgemma)는 RTX 4070에서 LoRA 27분 돌리고 Gemma 4 E2B를 게임에서는 Laya v3급(6/6 대 6/6), 분리 결정에서는 위로 올려놨어요. 크기 같으면 디코더도 Laya만큼 빨라요 (270M: 22ms 대 23ms). 결과 같으면 더 작은 모델로 해내는 Laya가 한 3배 빨라요.

제 해석은요. 아키텍처보다 태스크 학습이 세요. 학습한 작은 스페셜리스트가 처음 보는 큰 제너럴리스트를 이겨요. Sabaki 베팅 그대로예요. 뒤따라온 페이퍼 *System Switch* ([arXiv:2610.09683](https://arxiv.org/abs/2610.09683))는 이 논리를 끝까지 밀어요. 빨리 뛰는 작은 모델, 게이트 열리면 큰 추론 모델이 이어받기. Sabaki pre-triage (`automate > 0.85 아니면 에스컬레이션`)를 게임에 적용한 거예요.

## 희생한 것들

CPU를 노리면 빠진 기능 하나가 다른 기능 값을 치러요. 게임 규칙이에요. Bareiron에서 C 한 줄이 트레이드오프였듯 정직한 목록이에요.

**Sabaki는 이야기를 안 해요.** 주는 옵션 중에서 확률이 담긴로 잘라줘요. 설명, 요약, 자유 텍스트는 LLM 가져가세요.

**generalist한테 프랑스어는 분포 밖이에요.** 라우팅 EN (`all-MiniLM-L6-v2`), 비슷한 케이스에 FR 1/4 대 EN 3/4 프로브. mail 플러그인은 FR 비중 높은 메일함에서 왔지만 익명화했어요. PII 제로, 개인 용어 없는 어휘라 accuracy -0.024. 익명화 비용은 내지만, 이건 협상 불가였어요.

**softmax는 자기 구역 벗어나면 너무 확신해요.** 1.00 찍고 틀리는 거 봤어요, 네. 그래서 GUIDE에서 권장하는 pre-triage가 있어요. `abstainAt: 0.6-0.7`로 임계값 밑은 `null`로 돌리고, 그 다음 `confidence > 0.85` 게이트로 자동화하고, 나머지는 사람. 측정한 기준점은 피싱 리콜 0.62에 정밀도 0.87이에요. 줄을 둘로 나누는 용도지 리뷰어 없애는 용도가 아니에요.

**nano는 에이전트 traces에서 헤매요.** 질문 따라 0.34에서 0.59예요. mini가 `needs_review`를 0.82까지 올리지만 `risk / urgency / action`은 여전히 어려워요. 관측 텍스트에 어휘 신호가 빈약해요.

**텍스트 Doom은 천장이 있어요.** MiniLM이든 ModernBERT-base든 한 0.57. 텍스트에 픽셀 없이 있으면 MAP02가 막아요. 진짜 플레이어로 가는 믿을 길은 vision + RL (픽셀에서 시작하는 1.1M짜리 tiny-doom-defender)이지 더 좋은 텍스트 분류기가 아니에요.

**벤치마크는 배치로 드리프트해요.** typed-decisions는 배치 단위로 생성돼서 시간 스플릿이 사실은 배치 스플릿이에요. `drift_tool.py`가 customer_service에서 0.82, agent_trace에서 0.67을 뱉어요 (0.5가 구분 불가). 측정한 결과는요. 공개 가중치가 공식 스플릿 0.61 대신 믹스에서 0.733이에요. 공식 숫자는 보수적인 거예요. Platt / temperature+bias 캘리브레이션은 배치 사이 전이가 안 돼서 최근 배치로 맞춘 temperature scaling만 ship해요. 사내 규칙은요. `drift_tool.py` 먼저, 0.6 넘으면 경고, 0.8 넘으면 블록. 남들은 아무도 공개 안 하지만 다 해야 해요.

## 최종 결과, 숫자 놓고 보면

한쪽은 노트북 i5, 다른 쪽은 호출당 과금 API. 각 모드가 실제로 내는 건 이거예요.

- nano : 1ms 미만, 초당 약 18k 요청, 20-650KB, 의존성 0개
- mini : 약 20ms, 초당 약 71 요청, 22MB int8, onnxruntime은 선택
- generalist : 20-36ms, 22.7M, 제가 아는 제일 작은 오픈 제너럴리스트

도메인 여러 개 올리면요. 전부 올리는 2GB 대신 도메인당 lazy-load로 약 0.5GB RAM. 결정적이에요. 같은 인풋 100개면 같은 아웃풋 100개. 질문별 임계값, `confidence` 게이트, 매칭 없으면 `unknown`.

Bareiron에서는 플레이어 하나가 200ms 청크를 먹어서 3명 넘게 돌리면 버벅였어요. 여기서는 도메인 3개 넘게 올려도 끄떡없어요. 엑스퍼트가 다 작고 필요할 때 로드되니까 한 번에 다 올리는 게 아니거든요. "작은 게 충분하다"는 같은 철학, 다른 하드웨어에 적용한 거예요.

## 철학

p2r3가 말했어요. *"1달러짜리 조그만 칩에서 Minecraft 같은 게 돌아간다는 생각 자체가 좋아요."*

같은 느낌이에요. GPU 호출을 20KB JSON이랑 TypeScript 백 줄로 대신한다는 생각이 좋아요. 물론 다 대신하지는 않아요, 장난 아니고요. 대신하는 건 로컬에서 밀리초 안에 라벨 하나, 손으로 기도하는 대신 그럭저럭 임계값 걸 수 있는 신뢰도로 받고 싶을 때 그 짜증나는 케이스예요.

트레이드오프, 까놓고 쓰면요.
- 인코더에서 단어 세기로 : 7점 내주고, 레이턴시 1000분의 1, 인프라 제로
- 큰 모델 하나에서 npm 플러그인들로 : 게이트는 투박해지고, 운영은 무한히 쉬워짐
- 생성에서 타입 결정으로 : 깨지는 파싱이랑 날조 옵션이 끝남
- 날 신뢰도에서 pre-triage로 : 먼저 abstain, 0.85 넘기면 자동화, 나머지는 사람

**기억할 3가지예요.**

1. **7점 내주고 1000배 빠름** : 0.75-0.80 대비 0.61/0.69지만, CPU 25초나 유료 API 대비 오프라인 1ms 미만/20ms. 비용 없는 점수는 아무 의미 없어요.
2. **단순 라우터 + 분리된 엑스퍼트** : `hits / sqrt(keywords)`, 임계값, `unknown`. 플러그인마다 따로 학습하고 버전 붙이고 ship해요. mail에서는 TF-IDF가 MiniLM에 붙어요. 여기서는 GPU가 필요 없어요.
3. **캘리브레이션 정직한 오프라인 우선** : `npm i`, 내장 가중치, GPU 0개, ECE 0.14 미만, abstain, drift tool. 이 비교표에서 GPU 없이 35Hz 게임 루프 버티는 스택은 이거 하나예요.

프로젝트 관심 있으면 MIT로 다 열려있어요. [github.com/sabaki-js](https://github.com/sabaki-js)요. 측정값이랑 bibtex 딸린 학술 버전은 [preprint v1](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf)이고요. 골리앗이 Doom 하는 거 직접 보고 싶으면 [azalio/doomLaya](https://github.com/azalio/doomLaya)예요 xD
