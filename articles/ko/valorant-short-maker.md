---
title: "valorant-short-maker: 제 Valorant 쇼츠를 혼자 만들어내는 파이프라인"
description: "대본은 Groq와 Llama, 목소리는 Piper, 나머지는 전부 FFmpeg. 크론 작업이 @valorant_agents에 하루 한 편씩 영상을 만들고 게시하는 방법을 A부터 Z까지."
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "5762lqoZSUNVHmDprCv91sxGCKpiL7Qt9H6SS/NlbGXFlscyFEhPEniJBA/HmboFb9eGPQr2zZ7vtLLlHHrXYQ=="
---

# valorant-short-maker: 제 Valorant 쇼츠를 혼자 만들어내는 파이프라인

몇 달째 손대지 않아도 돌아가는 YouTube 채널이 있어요. [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop). 라운드 사이에 서로 놀리는 Valorant 요원들, 더빙되고 가라오케 자막이 입혀져 쇼츠로 올라가요. 전부 TypeScript와 Bun으로 짠 파이프라인 [`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker)가 크론으로 돌면서, 누구도 클릭하지 않아도 게시해요.

어떻게 동작하는지 단계별로 보여 드릴게요.

## 결과물

"Duelist Debate"(Phoenix, Yoru, Jett) 영상을 위해 만든 세 프레임이에요.

![쇼츠 인트로, 장면 제목이 있는 요원 원](/images/valorant-short-maker/vsm-01-intro.png)

![대사 진행 중, 켜지는 가라오케 자막](/images/valorant-short-maker/vsm-02-dialogue.png)

![또 다른 대사, 요원에 따라 자막 색이 바뀌어요](/images/valorant-short-maker/vsm-03-dialogue.png)

라이브 결과는 이 쇼츠예요. [Duelist Debate -- youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU). 채널의 쇼츠는 1,2천에서 1,5천 조회수쯤 나와요. 대단한 건 아니지만, 처음부터 혼자 돌아가는 채널이니 진짜 중요한 숫자는 0이에요. 크론을 걸고 나서 들인 시간 0분이요.

## 순서대로 보는 파이프라인

### 1. 대본 쓰기: Groq + Llama 3.3

매 실행마다 26명 중 3~4명의 요원을 무작위로 뽑고, Llama 3.3 70B(Groq 경유)에 시스템 프롬프트를 보내요. 선택된 각 요원마다 성격과 장면에 함께 있는 다른 요원들과의 관계를 간결하게 요약한 내용이 들어가요 (이 페르소나는 `src/lore/`에 요원별 파일로 살아요). 프롬프트는 정확한 규칙을 강제해요. 대사마다 짧고 강렬한 한 문장, 캐릭터 사이 공평한 순환, 유머 우선, 그리고 무엇보다 쉼표.

2026년 7월 6일에 만든 "Duelist Debate"의 실제 예시예요. Phoenix, Yoru, Jett가 누가 듀얼리스트를 할지 다퉈요.

```
phoenix: I'm telling you, I've got the skills to play duelist this match.
yoru: Skills, you call burning things skills, Phoenix.
jett: I'm the fastest one here, I should play duelist.
phoenix: Fastest, but can you handle the heat, Jett [0.3] I doubt it.
yoru: Heat, ha, you think your flames are hotter than my rifts.
jett: This isn't about heat or flames, it's about speed and agility.
phoenix: Oh, I see, so now you're an expert on duelists, Yoru [0.3] that's rich.
yoru: At least I don't rely on cheap fire tricks.
jett: Cheap fire tricks, that's what you call Phoenix's abilities.
phoenix: Hey, my fire tricks have gotten us out of tight spots before [0.3] can't say the same for your rifts, Yoru.
yoru: Tight spots, you mean like the time I rifted us out of that trap.
jett: Enough, this is getting nowhere, let's just decide already.
phoenix: Fine, but I'm still saying I'm the best duelist here.
yoru: Please, you think you can take on the enemy team alone [0.3] I doubt it.
jett: I can take them on, no problem, I'm the fastest.
phoenix: Fastest, yeah, but can you outmaneuver them [0.3] that's the question.
yoru: Outmaneuver, ha, you think you can outmaneuver anyone, Phoenix.
jett: This is stupid, we're not going to agree on this.
phoenix: Fine, let's just play and see who comes out on top [0.3] I'm game if you are.
yoru: Bring it on, I'll show you what a real duelist looks like.
jett: I'm not backing down, I'm playing duelist.
phoenix: Oh, this should be good [0.3] let's see how you two do.
yoru: We'll see who comes out on top, won't we, Jett.
jett: Yeah, let's end this debate once and for all.
pause: 0.3
phoenix: Alright, let's get started then [0.3] may the best duelist win.
yoru: I'll make sure to burn you, Phoenix, not with fire, but with my rifts.
jett: I'll take you both down, no problem.
```

쉼표는 리듬을 자연스럽게 만드는 세부 사항이에요. 대사 중간에 넣은 `[0.3]`은 화면의 요원 원을 자르지 않고 오디오 파일에 0.3초 무음을 만들고, 통째로 한 줄인 `pause: 1.0`은 화자 사이에 원을 숨긴 진짜 무음을 만들어요. 이게 없으면 숨 쉬지 않고 대사를 잇는 TTS는 로봇처럼 들려요.

### 2. 목소리 입히기: Piper, 요원별 모델 하나씩

각 요원은 전문적으로 훈련된 자신만의 Piper 모델(`.onnx`)을 가지고 있고 `voices/<agent>/`에 저장돼 있어요. 만들어진 텍스트가 해당 모델을 거쳐 WAV가 나와요. 일반적으로 커스텀 음성 훈련에 쓰는 것과 같은 기술이에요 (Piper와 Kaggle 파이프라인 글 참고). 여기서는 매 영상 만들 때마다 즉석에서 바로 프로덕션에 적용해요.

### 3. 가라오케 자막: 만들어낸 ASS, 아이콘에서 뽑은 색

자막은 단순한 `.srt`가 아니에요. 단어별로 만들어진 `.ass`(Advanced SubStation Alpha) 파일이고 가라오케 효과가 있어요. 발음되는 대로 각 단어가 강조 색으로 켜지고, 나머지 텍스트는 중립 색으로 남아요. 강조 색은 고정되어 있지 않아요. 말하는 요원의 아이콘에서 동적으로 뽑아요 (Python 스크립트가 아이콘 PNG에 PIL을 돌려서 투명하지 않은 픽셀을 샘플링하고 지배적인 색들을 돌려줘요). 결과: Killjoy 자막은 보라색으로 켜지고, Jett 자막은 청록색으로 켜져요. 어디에도 색이 하드코딩되어 있지 않아요.

### 4. 오디오 반응 원: 프레임마다 FFmpeg 표현식 하나

파이프라인에서 가장 꼬인 부분이고, 아마 가장 자랑스러운 부분이에요. 말하는 요원의 둥근 아이콘이 가만히 있지 않아요. 자기 목소리 리듬에 맞춰 살짝 줌인 줌아웃해요.

계산은 대사의 날것 WAV를 읽고, 60fps로 프레임마다 RMS(root mean square, 신호 에너지 측정) 엔벨로프를 구하고, 최댓값으로 정규화한 뒤, 끊김을 피하려고 3프레임 창으로 스무딩해요. 각 엔벨로프 값을 `MAX_ZOOM_VARIATION`(0.2, 기본 크기 기준 앞뒤 20퍼센트)으로 묶인 스케일 계수로 바꿔요.

이 계산 결과는 픽셀을 만지는 코드로 적용되지 않아요. 거대한 FFmpeg 조건 표현식(`lt(n,K)*val + between(n,K,K')*val + ...`, 프레임 묶음별 분기 하나)으로 번역돼서 비디오 필터의 `scale` 매개변수를 직접 조종해요. FFmpeg가 렌더링의 매 프레임마다 이 표현식을 평가해요. 60fps에서 몇 초짜리 대사면 하나의 표현식에 금방 수백 개 분기가 생겨요. 그래서 깊이를 제한하려고 프레임을 묶는 `STEP` 매개변수가 있어요.

### 5. 구간별 렌더링, 인트로는 피시아이

각 대사는 따로 렌더링돼요. 배경 영상(`bg-video/`의 게임플레이 클립 중 무작위 발췌를 적절한 길이로 자름), 위에 오디오 반응 원, FFmpeg `ass` 필터로 입힌 자막, 배경 게임플레이 소리와 믹스된 TTS 오디오.

맨 처음 구간은 특별 처리를 받아요. 처음 20퍼센트 프레임에 걸쳐 서서히 풀리는 피시아이 왜곡(프레임마다 평가되는 `lenscorrection` 필터에 모션 블러 흉내용으로 인접 프레임을 섞는 `tmix=frames=3` 추가)이 "whoosh" 소리와 동기화돼요. 카메라가 장면 속으로 "들어가는" 느낌을 주는 인트로 전환이에요.

### 6. 이어붙이기와 최종 믹싱

모든 구간을 끝에서 끝으로 이어붙이고, 배경 음악(Sneaky Snitch, Kevin MacLeod, Creative Commons 라이선스)을 **오디오 더킹**으로 위에 믹스해요. 요원이 말하는 동안 음악 볼륨을 자동으로 낮췄다가 무음 구간에 다시 올리는 사이드체인 압축이에요. 전체가 처음부터 끝까지 60fps로 돌고, 단계 사이에 프레임레이트 변환은 없어요.

### 7. 자동 게시

고전 크론이 실행하는 `run-cron.sh` 스크립트가 Python 환경을 켜고 `.env`를 불러온 뒤 `bun src/workflow.ts --upload`를 실행해요. `--upload` 플래그는 메타데이터(제목, 설명, 태그) 만들기에 더해 `uploaders/upload.py`를 호출해요. 두 개의 분리 스크립트(`uploaders/youtube/upload.py`와 `uploaders/instagram/`)로 YouTube와 Instagram에 영상을 올려요. LLM 프롬프트부터 온라인 영상까지 전체 체인이 사람 개입 없이 돌아가요.

## 왜 완전 Python이 아니라 TypeScript와 Bun인지

선택이 이념적이지는 않아요. Bun이 서브프로세스로 FFmpeg를 조종하는 `Bun.spawn`에 직접 빠르고 닿기 좋고, 파이프라인 자료구조(`Phrase`, `SegmentInfo`)에 강한 타이핑을 주고, 몇 시간마다 크론으로 도는 스크립트에 Node보다 시작이 훨씬 빠른 런타임이라서예요. 프로젝트에서 Python 조각 둘은 Python이 실제로 가장 잘 갖춰진 곳에만 있어요. 색 뽑기용 PIL과 업로드 API(YouTube용 `google-api-python-client`, IG용 Instagram Graph API 스택)요.

## 보여주는 것

이 프로젝트는 오늘날 완전히 무료이거나 오픈 소스인 벽돌들로 무엇을 만들 수 있는지 보여주는 좋은 예예요. Groq API로 빠르고 무료인 LLM, 전용 GPU 없이 도는 로컬 TTS 엔진, 모든 비디오 렌더링용 FFmpeg. 그리고 이어주는 것은 TypeScript 몇백 줄뿐이에요. 벽돌 하나하나는 새것이 아니에요. 파이프라인을 만드는 것은 배치예요. 캐릭터 사이 진짜 관계가 담긴 일관된 대본을 만들고, 자연스러운 쉼표가 있는 표현력 있는 오디오로 바꾸고, 그 오디오의 에너지에 프레임마다 시각 렌더링을 동기화하고, 게시까지 전체 체인을 자동화하는 것.

---

**자료**

- **저장소**: [github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **채널**: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**핵심 3가지**

1. 대본은 미리 쓴 농담 목록이 아니라 요원별 페르소나와 관계가 담긴 LLM(Groq와 Llama 3.3)이 만들어요.
2. 요원 원의 줌은 고전 키프레임 애니메이션이 아니라 WAV의 RMS 엔벨로프에서 프레임마다 계산된 FFmpeg 표현식이 조종해요.
3. 프롬프트부터 YouTube와 Instagram 게시물까지 전체 체인이 사람 개입 없이 크론 작업 하나로 돌아가요.
