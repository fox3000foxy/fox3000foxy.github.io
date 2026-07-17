---
title: "valorant-short-maker: 발로란트 쇼츠를 혼자서 만들어내는 파이프라인"
description: "Groq/Llama로 스크립트, Piper로 목소리, FFmpeg로 나머지 전부. 크론 잡이 @valorant_agents에 하루 한 편의 영상을 처음부터 끝까지 만들어 올리는 방법."
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "68XbEzZi0CGShalDldxJU1eJHRvJtBqoHZqaIkUdGDO9Ihlyu4IhLMmzmy1D487Y4ABCg4hG7mXrqHEfjmpVmA=="
---

# valorant-short-maker: 발로란트 쇼츠를 혼자서 만들어내는 파이프라인

몇 달째, 내가 손대지 않아도 혼자 돌아가는 유튜브 채널이 있다: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop). 발로란트 에이전트들이 라운드 사이에 서로 디스하고, 더빙되고, 노래방 자막이 달려 쇼츠로 올라간다. 전부 [`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker)가 만들어낸다. TypeScript/Bun 파이프라인이 크론으로 돌면서 아무도 클릭할 필요 없이 게시까지 다 해준다.

어떻게 돌아가는지 단계별로 설명할게.

## 결과물

"Duelist Debate" (Phoenix, Yoru, Jett) 영상에서 추출한 세 프레임:

![쇼츠 인트로, 에이전트 원형과 장면 제목](/images/valorant-short-maker/vsm-01-intro.png)

![대사 진행 중, 노래방 자막이 반짝임](/images/valorant-short-maker/vsm-02-dialogue.png)

![다른 대사, 말하는 에이전트에 따라 자막 색상 변경](/images/valorant-short-maker/vsm-03-dialogue.png)

이 쇼츠 실물: [Duelist Debate -- youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU). 채널 영상들은 1.2~1.5k 뷰 정도 나온다. 대단한 숫자는 아니지만, 처음부터 완전 자동으로 돌아가는 채널이라는 게 포인트. 진짜 중요한 숫자는 0이다 -- 크론 한 번 돌려놓은 이후로 투자한 시간 0분.

## 파이프라인 순서대로

### 1. 스크립트 쓰기 -- Groq + Llama 3.3

매 실행마다 26명의 에이전트 중 3~4명을 랜덤으로 뽑고, Llama 3.3 70B (Groq 경유)에 시스템 프롬프트를 보낸다. 프롬프트에는 각 에이전트의 성격 요약과 장면 속 다른 에이전트들과의 관계가 담겨 있다 (이 페르소나들은 `src/lore/`에 에이전트별 파일로 존재한다). 프롬프트는 엄격한 규칙을 강제한다: 대사 한 줄은 짧고 강렬하게, 캐릭터 간 공평한 순번, 유머 우선, 그리고 무엇보다도 -- 쉼.

실제 예시로 "Duelist Debate" -- Phoenix, Yoru, Jett가 누가 듀얼리스트 할지 싸우는 장면, 2026년 7월 6일 생성:

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

쉼이야말로 자연스러운 리듬을 만드는 디테일이다. 대사 중간에 들어간 `[0.3]`은 화면의 에이전트 원형을 끊지 않으면서 오디오에 0.3초의 묵음을 만들고, 별도 줄의 `pause: 1.0`은 두 화자 사이에 진짜 묵음을 만들고 원형을 숨긴다. 이게 없으면 TTS가 숨 한 번 안 쉬고 대사를 쏟아내서 로봇처럼 들린다.

### 2. 목소리 입히기 -- Piper, 에이전트별 모델

각 에이전트마다 전용으로 훈련된 Piper 모델 (`.onnx`)이 `voices/<agent>/`에 저장되어 있다. 생성된 텍스트가 해당 모델을 통과하면 WAV가 나온다. 내가 커스텀 보이스 트레이닝에 쓰는 것과 같은 기술이다 (Piper/Kaggle 파이프라인 글 참고) -- 여기서는 바로 프로덕션에서, 그때그때, 매번 영상 생성 시 적용된다.

### 3. 노래방 자막 -- ASS 생성, 아이콘에서 색상 추출

자막은 그냥 `.srt`가 아니다. `.ass` (Advanced SubStation Alpha) 파일이 단어 단위로 생성되며 노래방 효과가 들어간다: 발음되는 단어마다 색상이 점등되고, 나머지 텍스트는 중립 색상으로 유지된다. 강조 색상은 고정이 아니라 -- 말하는 에이전트의 아이콘에서 동적으로 추출된다 (Python 스크립트가 PIL로 아이콘 PNG를 읽고, 투명하지 않은 픽셀을 샘플링해서 주요 색상을 반환한다). 결과: Killjoy 자막은 보라색으로, Jett은 청록색으로 빛난다. 어디에도 하드코딩된 색상은 없다.

### 4. 오디오 반응형 원형 -- 프레임당 FFmpeg 수식

파이프라인에서 가장 골치 아픈 부분이고, 아마 가장 자랑스러운 부분이기도 하다. 말하는 에이전트의 둥근 아이콘이 가만히 있지 않는다: 자기 목소리 리듬에 맞춰 살짝 확대/축소된다.

계산은 대사의 RAW WAV를 읽고, RMS 엔벨로프(root mean square, 신호 에너지 측정치)를 60fps로 프레임별 계산, 최대값으로 정규화, 그리고 끊김 방지를 위해 3프레임 윈도우로 스무딩한다. 각 엔벨로프 값은 `MAX_ZOOM_VARIATION` (0.2, 즉 기본 크기의 ±20%)로 제한된 스케일 팩터로 변환된다.

이 계산 결과는 픽셀을 직접 건드리는 코드가 아니라 -- 거대한 FFmpeg 조건식으로 번역되어 (`lt(n,K)*val + between(n,K,K')*val + ...`, 프레임 그룹당 한 분기) 비디오 필터의 `scale` 파라미터를 직접 제어한다. FFmpeg가 렌더링의 매 프레임마다 이 수식을 평가한다. 60fps로 몇 초짜리 대사면 금방 하나의 수식 안에 수백 개 분기가 생긴다 -- 그래서 프레임을 그룹화해 깊이를 제한하는 `STEP` 파라미터가 필요하다.

### 5. 세그먼트별 렌더링, 인트로에 fisheye

각 대사가 개별 렌더링된다: 비디오 배경 (`bg-video/`의 게임플레이 클립 중 랜덤으로, 알맞은 길이로 잘라서), 오디오 반응형 줌이 적용된 에이전트 원형을 위에 올리고, FFmpeg의 `ass` 필터로 자막을 입히고, TTS 오디오를 배경 게임플레이 사운드와 믹스한다.

맨 첫 번째 세그먼트는 특별 처리를 받는다: 처음 20% 프레임에 걸쳐 점점 사라지는 fisheye 왜곡 (프레임별 `lenscorrection` 필터 + 모션 블러를 흉내 내기 위해 인접 프레임을 블렌딩하는 `tmix=frames=3`), "whoosh" 효과음과 동기화. 이게 카메라가 장면 안으로 "진입"하는 듯한 인트로 전환이다.

### 6. 연결 및 최종 믹싱

모든 세그먼트가 끝에서 끝으로 연결되고, 배경 음악 (Sneaky Snitch, Kevin MacLeod, Creative Commons 라이선스)이 **오디오 더킹**과 함께 믹스된다 -- 사이드체인 컴프레션이 에이전트가 말하는 동안 음악 볼륨을 자동으로 낮추고, 묵음일 때 다시 올린다. 모든 게 처음부터 끝까지 60fps로 돌아가며, 단계 간 프레임레이트 변환은 없다.

### 7. 자동 게시

표준 크론으로 실행되는 `run-cron.sh` 스크립트가 Python 환경을 활성화하고, `.env`를 로드하고, `bun src/workflow.ts --upload`를 실행한다. `--upload` 플래그는 메타데이터 생성(제목, 설명, 태그)도 트리거하고 `uploaders/upload.py`를 호출해 YouTube와 Instagram에 각각 별도 스크립트(`uploaders/youtube/upload.py`와 `uploaders/instagram/`)로 영상을 게시한다. LLM 프롬프트부터 영상이 온라인에 올라가기까지 전 과정이 인간 개입 없이 돌아간다.

## 왜 Python 올인 대신 TypeScript/Bun인가

이념적인 선택이 아니다 -- Bun이 `Bun.spawn`으로 FFmpeg를 서브프로세스로 빠르고 직접 제어할 수 있고, 파이프라인 데이터 구조(`Phrase`, `SegmentInfo`)에 강력한 타입을 제공하며, 몇 시간마다 크론으로 도는 스크립트치고 시작 속도가 Node보다 훨씬 빠르기 때문이다. 프로젝트에 Python이 두 군데만 있는 건, Python이 진짜 최적의 도구인 곳이기 때문이다: PIL로 색상 추출, 그리고 업로드 API (`google-api-python-client`로 YouTube, Instagram Graph API 스택으로 IG).

## 이게 보여주는 것

이 프로젝트는 오늘날 완전 무료 혹은 오픈소스 블록만으로 뭘 만들 수 있는지 보여주는 좋은 예다: Groq API로 빠르고 공짜 LLM, 전용 GPU 없이 도는 로컬 TTS 엔진, 모든 비디오 렌더링에 FFmpeg -- 그리고 이걸 잇는 건 고작 몇백 줄 TypeScript. 개별 블록은 새로울 게 없다. 파이프라인을 만드는 건 조합이다: 진짜 캐릭터 관계가 담긴 일관된 스크립트 생성, 자연스러운 쉼이 있는 표현력 있는 오디오로 변환, 그 오디오의 에너지에 프레임 단위로 시각적 렌더링을 동기화, 그리고 게시까지 모든 체인 자동화.

---

**리소스**

- **Repo**: [github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **채널**: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**핵심 3가지**

1. 스크립트는 LLM (Groq/Llama 3.3)이 에이전트별 페르소나와 관계를 바탕으로 생성한다. 미리 써둔 농담 리스트가 아니다.
2. 에이전트 원형 줌은 WAV의 RMS 엔벨로프에서 프레임별로 계산된 FFmpeg 수식으로 제어된다 -- 일반적인 키프레임 애니메이션이 아니다.
3. 프롬프트부터 YouTube/Instagram 게시까지 전 체인이 단일 크론 잡 하나로 인간 개입 없이 돌아간다.
