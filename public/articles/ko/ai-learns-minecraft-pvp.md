---
title: AI가 Minecraft PvP를 배우다. 모방 학습과 강화 학습, 그리고 중요했던 30개 변수
description: "녹화한 결투 1,000회, 픽셀로 훈련한 신경망, 90퍼센트 타격 정확도. 그런데 봇은 벽을 향해 돌진했어요. 그 뒤 RL과 커리큘럼 학습, 60시간 훈련이 왔어요."
date: 2026-07-09
tags:
  - minecraft
  - ai
  - python
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "TELrsFURULZSa0H2GLyLuY4f8TwSgEns+gYToOzGo6biK9bZzyVetzTuaH/+TjSamZPDDEEamL2tSdQWKamAOA=="
---

## 소개

![AI Learns Minecraft PvP 썸네일](assets/ai-pvp-thumbnail.png)

Kadambi | AI Engineering의 [AI Learns Minecraft PvP (Reinforcement Learning + Behavior Cloning)](https://www.youtube.com/watch?v=j5nxDKAjg6U)이라는 영상이 있어요. 제가 본 게임 AI 훈련 이야기 중 가장 솔직한 것 중 하나예요.

원리는요. 화면을 보고 마우스와 키보드 명령을 보내는 Minecraft PvP(검 키트, 완전히 마법 부여된 다이아몬드 갑옷) 봇 만들기. 픽셀 입력과 행동 출력만 쓰고, 게임 메모리를 읽지 않고, 매크로 없이, 모드 없이 동작해요.

이 영상이 흥미로운 것은 최종 결과가 아니에요. 과정이에요. 모방 학습의 실패, 특징 공학으로의 전환, 파국적 망각 사이클, GPU 없는 노트북에서의 60시간 이상 훈련.

## 1단계: 모방 학습 (실패)

![모방 학습 중 봇: 벽을 보고 위아래로 점프해요](assets/ai-pvp-imitation-fail.png)

제작자는 합리적인 접근으로 시작했어요. 자기 플레이 결투 1,000회를 녹화하고, 각 마우스 클릭과 키 누름을 해당 이미지와 연결하고, 픽셀에서 행동을 예측하도록 신경망을 훈련시켰어요.

```python
# 모방 학습 파이프라인 의사코드
dataset = record_duels(1000)          # 수십만 프레임
for frame, action in dataset:
    pixels = capture_screen(frame)
    network.train(pixels → action)    # 이미지에서 키보드와 마우스 예측
```

네트워크는 타격을 **90퍼센트 정확도**로 예측하는 법을 배웠어요. 희망적이에요.

그리고 진짜 경기에서 테스트했어요. 봇은 곧장 맵 가장자리로 가서 벽을 보고 위아래로 점프했어요.

왜요?

**게으름의 함정.** PvP 전투에서는 W 키가 대부분 눌려 있어요. 네트워크는 그냥 W를 누르고 아무것도 안 하면 높은 정확도에 이를 수 있음을 깨달았어요. 다른 모든 것을 희생하고 가장 잦은 행동을 최적화했어요.

**인간 지연.** 자료의 행동은 인간 반응 시간 때문에 약 200ms 늦어져 있어요. 프레임별로 보면 행동과 눈에 보이는 결과가 여러 이미지로 떨어져 있을 때 날것 픽셀에서 원인과 결과를 배우기가 모델에게 거의 불가능해요.

**일관 없는 시연.** 제작자 자신의 플레이가 달랐어요. 같은 상황에서 가끔 키보드로 스트레이프하고 가끔 마우스로 조준했어요. 이 모순 입력이 네트워크를 어지럽혔어요.

## 2단계: 커리큘럼 강화 학습

![RL 훈련 중 수평 추적을 배우는 봇](assets/ai-pvp-rl-horizontal.png)

모방 학습을 버리고 제작자는 RL로 바꿨어요. 하지만 새로 태어난 에이전트를 완전한 PvP 결투에 던지는 것은 소용없어요. 무작위 탐색이 뭔가를 찾기에는 한 번에 너무 많은 일이 일어나요.

해결책: **커리큘럼 학습**. 각 구조를 분리하고 진짜 전투에 들어가기 전에 봇이 기초를 익히게 해요.

### 1단계: 수평 조준 (7시간)

가장 단순한 보상 함수예요. 목표를 맞히면 양의 보상, 피해를 입으면 음의 벌점.

처음에는 봇이 거의 움직이지 않아요 (중립 값으로 초기화된 신경망). 옆으로 떨려요. 봇이 어떤 행동이 보상을 주는지 보려고 여러 행동을 테스트하는 거예요.

한 시간 뒤, 수평으로 중심을 맞추는 법을 배우지만 고통스러울 정도로 느려요. 7시간 뒤, 좌우로 적을 따라갈 수 있어요. 비대칭적이긴 하지만요 (좌에서 우로 움직일 때보다 우에서 좌로 움직일 때가 나아요. 훈련 내내 남은 행동이에요).

### 2단계: 특징 공학

날것 스크린샷은 200만 픽셀을 넘었어요. 360p로 줄여도 입력 20만 개예요. 효과적 학습에는 너무 많아요.

제작자는 수천 회 결투를 분석하고 **정말 중요한 30개 변수**를 찾아냈어요. 세 그룹으로요.

**시각 (적 추적)**:

- 조준선(crosshair)에서 적까지의 거리
- 적의 경계 상자 크기
- 적의 높이
- 조준선 상태 (목표 위와 밖)
- 상대 속도

전체 이미지를 처리하는 대신 봇은 적 갑옷 색으로만 픽셀을 엄격히 걸러서 감지가 거의 바로 일어나요. 비슷한 색 배경 블록이 이 필터를 어지럽힐 수 있어요. 하지만 Minecraft에서는 텍스처를 바꾸면 돼요.

**OCR (HUD 읽기)**:
봇이 게임 코드에서 좌표를 가져올 수 없으니 화면을 실시간으로 스캔해서 뽑아내요.

- 카메라 피치
- 모멘텀
- Y 레벨

표준 OCR이 Minecraft 투명 텍스트에 애를 먹으니 핵심 자료는 바로 읽히도록 흑백으로 강제해요.

**시간 (맥락 창)**:

- 적을 맞힌 뒤 지난 시간
- 적이 나를 맞힌 뒤 지난 시간
- 봇의 앞선 행동 슬라이딩 버퍼

이렇게 하면 네트워크에 시간 맥락이 생겨요. 이것이 없으면 봇은 콤보 중간인지 전투 시작인지 전혀 몰라요.

### 3단계: 수직 조준 (7시간 더)

![RL 훈련 중 위아래 조준을 배우는 봇](assets/ai-pvp-rl-vertical.png)

마우스 수직 움직임을 더하는 것은 처음에 "완전 재앙"이었어요. 초기 성능이 깨졌어요.

샌드박스에서 한 시간 더 지나 봇은 위아래 보는 법을 알았어요. 하지만 그 과정에서 수평 따라가기를 완전히 잊었어요.

이것이 **파국적 망각**이에요. 새 자료에 최적화하면서 앞서 배운 표현을 덮어쓰는 고전적 머신러닝 문제예요. 수직 조준을 최적화하면서 신경망이 실수로 수평 진전을 덮어써서, 제작자에게 조준선을 수평으로 유지하지만 목표를 따라가지 못하는 봇이 남았어요.

수직 조종을 유지하면서 수평 따라가기를 되찾는 데 **6시간 더**가 필요했어요. 그러자 봇은 카메라 피치를 뽑는 OCR 그룹 덕분에 조준선 배치를 잘 유지했어요.

### 4단계: 키보드 조종

![W 키를 계속 켰다 껐다 하면서 움직임 확정을 배우는 봇](assets/ai-pvp-keyboard.png)

봇에게 키보드를 쓸 허락을 주자 시간 특징이 훨씬 중요해졌어요. 처음에는 W 키가 계속 켜졌다 꺼졌어요. 네트워크가 확정하는 법을 배우지 못해서 빠른 바꿈이었어요.

이 행동에 벌점을 주자 봇이 매끄럽게 하는 법을 배웠어요. 스프린트 중에 타격을 더 많이 맞히기 시작했어요 (서 있을 때의 휙 소리와 대비되는 쿵 소리). 적에 대한 사거리 이점을 봇이 악용해서 일부 콤보가 불만족스러워 보였어요.

공평하게 하려고 제작자가 적 사거리를 늘렸어요. 봇이 배운 전략 상당수가 동작하지 않게 됐어요. 하지만 시간이 지나 적응했어요.

### 5단계: 봇에게 클릭 타이밍 가르치기

최종 단계에 제작자는 모방 학습을 다시 가져왔어요. 하지만 완전한 조종 정책이 아니라 클릭 타이밍만 가르치려고요. 봇은 녹화된 결투의 클릭 패턴을 흉내 내려 했어요.

처음에는 나쁜 클릭 벌점이 두려워 뭔가를 시도하기 너무 무서워했어요. 하지만 결국 때릴 용기를 내고 타격을 맞히기 시작했어요. 물론 그 과정에서 조준하는 법을 또 잊었어요. 제작자는 만족스러운 상태로 돌아오려고 **50시간 더** 그냥 두어야 했어요.

## 부정행위 논쟁

영상은 이렇게 물으며 끝나요. 이 봇이 부정행위를 하나요?

반대 논거: 봇은 사람이 보는 것(같은 픽셀)만 처리하고, 사람과 같은 키보드와 마우스 입력(안티넉백 같은 패킷 조작 없이)을 보내고, 게임 메모리를 읽지 않아요 (엑스레이나 ESP 없이).

찬성 논거: 봇은 사람보다 빨리 처리할 수 있고, 상대가 사람과 둔다고 생각하는데 그렇지 않다면 속임이에요.

제작자 의견: 의도에 달려 있어요. 양쪽이 봇인 것을 알면 경기는 공평해요. 봇은 100연타 연속기로 적을 허공에 묶어 둬요.

## 결과

![100연타 콤보를 실행하는 봇](assets/ai-pvp-final-combo.png)

**GPU 없는 노트북**에서 훈련된 Minecraft PvP 봇이고, 맞춤형 훈련 파이프라인 위에 지어졌어요.

- 픽셀 입력을 위한 **스크린샷** (200만 픽셀 이상에서 30개 설계 특징으로)
- **커리큘럼 학습** (수평에서 수직, 키보드, 클릭으로)
- 조종 운동은 **RL** + 클릭 타이밍은 **모방 학습**
- 날것 픽셀의 **특징 공학** (3개 그룹: 시각, OCR, 시간)
- 여러 단계에 걸친 **60시간 이상 훈련**

총 훈련 시간은 수십 시간이지만 대부분 수동적이에요. 봇은 이해될 때까지 떨고, 배운 것을 잊고, 다시 배우고, 결국 100연타 연속기를 이어요.

영상은 [youtube.com/watch?v=j5nxDKAjg6U](https://www.youtube.com/watch?v=j5nxDKAjg6U)에 있어요.

---

*이 글은 영상의 내용만 다뤄요. Minecraft AI의 더 넓은 맥락(VPT, DreamerV3, 모방 학습 대 RL 지형)은 아래 섹션에서 이 프로젝트를 더 넓은 분야와 이어요.*

## VPT: 대규모 행동 복제

![OpenAI VPT 프로젝트 도식: Inverse Dynamics Model이 프레임 쌍에서 행동을 예측해요](assets/vpt-overview.svg)

영상의 "행동 복제" 접근(1단계)은 OpenAI가 **Video PreTraining (VPT)** 프로젝트에서 쓴 것과 같은 기법이에요. 다만 자원 스펙트럼의 정반대 끝이에요. VPT는 영상 7만 시간과 GPU 720개, 라벨 없는 자료에 의사 라벨을 붙이는 inverse dynamics model이 있을 때 모방 학습이 Minecraft에 통함을 증명했어요. 여기 제작자는 노트북과 결투 1,000회로는 실패함을 증명했어요. 하지만 같은 기본 이유 때문이에요. 모방 학습은 시연 품질에 갇혀요.

![OpenAI VPT 에이전트가 Minecraft에서 나무를 캐요](assets/vpt-minecraft.jpg)

VPT 파이프라인은 자료 문제를 이렇게 풀어요. 이미지 t-1과 이미지 t+1을 보고 이미지 t의 행동을 예측하는 **Inverse Dynamics Model (IDM)**을 훈련시켜요. IDM이 비인과적(미래 이미지를 봐요)이라서 과제가 행동 복제보다 쉽고 라벨 자료를 훨씬 적게 필요로 해요. 계약자 2,000시간 라벨 자료에 약 2,000달러를 쓰고, IDM으로 YouTube Minecraft 영상 7만 시간에 의사 라벨을 붙였어요.

![사전 훈련 자료량(로그 눈금)에 따른 제작과 수집 비율: 작업대, 나무 도구, 돌 도구](assets/vpt-stone-pickaxe-sequence.svg)

규모 효과는 분명해요. 사전 훈련 자료 1시간에서 10만 시간 로그 축에서 모델이 작업대와 나무 도구, 돌 도구를 만드는 비율이 단계적으로 올라가요. 계약자가 라벨한 2,000시간만으로 훈련한 모델은 작업대에서 정체돼요. IDM이 의사 라벨을 붙인 7만 시간을 더했을 때(그래프 점선) 돌 도구가 제로샷으로 나와요. RL 단계 하나 없이요.

0.5B 매개변수 파운데이션 모델 결과물은 RL만으로는 불가능한 제로샷 능력을 냈어요. 나무 캐기, 작업대 만들기, 기둥 점프. RL로 미세 조정하자 다이아몬드 도구를 만드는 첫 AI가 됐어요.

![RL 훈련 에피소드 수에 따른 보상: 무작위 초기 모델에서 출발 대 VPT 사전 훈련 모델에서 출발](assets/vpt-diamond-pickaxe-sequence.svg)

이 그래프는 사전 훈련이 하류 RL을 왜 바꾸는지 보여줘요. 무작위 초기화 네트워크에서 출발한 RL(주황)은 백만 에피소드 가까이 0 근처에 평평해요. "다이아몬드 얻기" 과제가 순진한 에이전트가 무작위 탐색으로 우연히 맞히기에는 보상이 너무 듬성해요. VPT 사전 훈련 모델에서 미세 조정한 RL(초록)은 기본 행동(캐기, 만들기, 탐험)을 이미 가지고 출발해서 다이아몬드 곡괭이로 가는 완전한 길에 해당하는 보상 25쯤까지 꾸준히 올라가요.

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/719971231?h=cbdf2617a1" title="VPT agent gameplay demo 1" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045834?h=9cb4118c65" title="VPT agent gameplay demo 2" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045849?h=00398908ed" title="VPT agent gameplay demo 3" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045863?h=060f07e290" title="VPT agent gameplay demo 4" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

*OpenAI VPT 프로젝트 공식 데모 영상. 에이전트가 실제로 움직여요.*

## OpenAI Five: 보상 만들기 문제

![사람 프로와 Dota 2를 두는 OpenAI Five](assets/openai-five-dota2.jpg)

OpenAI Five(2019년)는 순수 자가 학습 RL로 Dota 2 세계 챔피언을 이겼어요. 모방 학습 없어요. GPU 256개, CPU 코어 128,000개, 하루 게임 180년, 훈련 10개월.

하지만 보상 함수는 Dota 전문가가 손으로 설계했어요. 가능한 20,000개 중 **28개 특징**이고, 각각 가중치를 손으로 조정했어요. 순자산, 처치, 사망, 타워 체력, 라인 배정. 전부 사람이 고르고 가중했어요. 이 모델링이 없으면 에이전트는 거의 배우지 못했어요 (실험: 승리와 패배 보상만 → 세미프로 수준에서 정체).

영상의 봇도 같은 문제에 마주해요. 보상 함수는 PvP에서 무엇이 중요한지에 대한 제작자의 이해를 인코딩해요 (맞히기는 좋고, 맞기는 나쁘고, 조준선 유지하기는 좋아요). 피할 수 없어요. RL은 보상 신호가 필요하고, 이 신호 모델링은 인간 편향을 인코딩해요.

## DreamerV3: 월드 모델과 듬성 보상

![단일 설정으로 150개가 넘는 다양한 과제의 DreamerV3 벤치 점수](assets/dreamerv3-benchmarks.png)

DeepMind의 DreamerV3(2023년)는 세 번째 접근을 써요. 행동 복제나 유인이 있는 RL 대신 **월드 모델**을 배워요. 지난 행동에서 미래 상태와 보상을 예측하고 가능한 미래를 꿈꾸며 계획하는 신경망이에요. 인간 자료도 커리큘럼도 없이 처음부터 Minecraft에서 다이아몬드를 모은 첫 알고리즘이고, 2025년 Nature에 났어요.

![DreamerV3가 미래 궤적을 상상하려고 월드 모델을 배워요](assets/dreamerv3-header.png)

다이아몬드 환경은 12개 이정표(통나무에서 판자, 막대, 작업대, 나무 곡괭이, 돌, 돌 곡괭이, 철광석, 화로, 철괴, 철 곡괭이, 다이아몬드)에 듬성 보상을 정해요. 각자 한 번씩 +1. 체력의 작은 보상(체력당 앞뒤 0.01). 도달 가능 합계: 36,000단계 에피소드에서 11.1.

DreamerV3의 월드 모델은 궤적을 상상하고 내부에서 평가하게 해요. 실제 경험이 아니라 꿈꾼 롤아웃에서 액터가 배우고, 실제 단계마다 수천 개 가능한 미래를 테스트해요. 이렇게 하면 표준 RL 에이전트를 무너뜨릴 듬성 보상이 가능해져요.

환경 1억 단계로 훈련한 40개 시드 중 24개가 다이아몬드를 최소 하나 모았어요. 첫 다이아몬드는 2,900만 단계 뒤에 나왔어요 (GPU 하나로 약 9일).

## ANNA: 상징 AI가 Minecraft를 만나다

![부싯돌과 부싯돌용 ANNA 과제 트리 분해](assets/anna-task-tree.png)

영상의 PvP 봇 이전, VPT와 DreamerV3 이전에 **ANNA**가 있었어요. 완전히 다른 철학으로 지은 Minecraft 봇. 픽셀이나 보상에서 배우는 대신, **상징 상태 기계**와 **프랑스어 NLP 파서**, 손으로 쓴 **과제 의존 트리**를 써요.

2022년("vibe coding"이 말이 되기 전)에 만들었고, ANNA는 Mineflayer로 Minecraft 서버에 접속하고 프랑스어 자연어를 이해해요. "obtiens un briquet"이라고 말하면 ANNA가 동사(얻다)를 분석하고, 물건 레시피를 찾고, 하위 과제로 재귀 분해해요. 참나무 캐기에서 판자 만들기, 막대 만들기, 작업대 만들기, 나무 곡괭이 만들기, 돌 캐기, 돌 곡괭이 만들기, 철광석 캐기, 철괴 녹이기, 부싯돌 만들기.

![프랑스어 명령 인식을 위한 ANNA NLP 파서 아키텍처](assets/anna-nlp-diagram.png)

NLP 층(`utils/id_parser.js`)은 병렬 명령을 다루려고 "et"으로 명령을 나누고, 프랑스어 동사를 과제 종류에 연결하고, 5,000개 항목 사전으로 프랑스어 물건 이름을 Minecraft 식별자에 번역해요. 인식되지 않는 명령은 ANNA를 의식 있는 Minecraft 동반자로 소개하는 GPT 기반 대화 시스템으로 넘어가요.

**과제 트리**(`mc-tasks-tree/`)가 심장이에요. Minecraft 물건 그래프(제작 레시피, 채굴 수율, 몬스터 드롭, 화로 레시피)를 훑어서 단계별 계획을 만드는 재귀 알고리즘이에요. 다이아몬드 투구에는 나무와 돌, 철, 다이아몬드 수준을 아우르는 40단계 이상 분해를 만들어내요.

![ANNA의 다이아몬드 투구 과제 트리: 40단계 이상 분해](assets/anna-diamond-helmet.png)

영상의 PvP 봇이 경험에서 배우는 곳에서 ANNA는 지식에서 동작해요. 결투 1,000회도 훈련 60시간도 필요 없어요. 트리와 파서, 서버와 분배기가 필요해요. 하지만 트리가 인코딩한 것을 넘어 일반화할 수도 없어요. 아무리 상태 기계 공학을 해도 PvP를 가르치지는 못해요.

ANNA 접근은 AI의 다른 시대를 비춰요. 종단간 학습이 지배하기 전, 정교한 공학과 엮인 상징 추론이 지능적 행동을 만들 수 있다는 약속이 있던 때. 오늘날 ANNA와 PvP 봇 같은 프로젝트는 Minecraft AI의 두 극을 보여줘요. 하나는 세상을 추론하고, 다른 하나는 세상을 지각해요.

## Master Gumbo의 Mace 봇: 명령 블록만의 AI

![봇이 있는 Mace PvP 훈련장](assets/mace-bot-arena.png)

Minecraft AI의 완전히 다른 구석에서 유튜버 **Master Gumbo**는 **명령 블록만**써서 PvP 훈련 봇을 만들었어요. 순수 바닐라 Minecraft 명령과 레드스톤, 클론 플레이어 개체용 carpet mod만으로요. 결과는 틈새 바꾸기와 돌풍 돌격, 방패 구조를 플레이어와 함께 연습하는 대중용 AI 상대예요.

봇은 부서지지 않는 장비와 두 번째 손의 토템(매 틱 `/item replace`로 채워요)을 든 좀비로 시작해서 사실상 불멸이에요. 나중에 Master Gumbo는 좀비가 못 하는 인간형 구조(방패 들기, 물건 바꾸기)를 지원하는 **Carpet Mod 플레이어 복제** 봇으로 넘어가요.

![설정 센터: 봇 행동을 설정하는 버튼들](assets/mace-settings-center.png)

핵심 혁신은 **무작위가 조종하는 상태 기계**예요. 갑옷 거치대가 `/spreadplayers` 명령으로 색 콘크리트 원 위로 텔레포트돼요. 개체를 무작위로 흩뿌려요. 갑옷 거치대가 떨어진 콘크리트 블록 색이 봇의 다음 행동을 정해요.

- **빨간 콘크리트** → 뒤로 스트레이프
- **파란 콘크리트** → 돌풍 돌격으로 위로 올라가기 (공격)
- **초록 콘크리트** → 방패 들기
- **흰 콘크리트** → 쉬기 (행동 사이 지연 더하기)

![AI 결정 시스템: 색 콘크리트 위 갑옷 거치대](assets/mace-ai-system.png)

갑옷 거치대 위치는 아래 블록을 감지하고 해당 구조를 작동시키는 명령 블록이 읽어요. 각 행동을 켜고 끄려고 레드스톤 블록을 놓거나 빼요. `/spreadplayers`가 반복해서 돌기 때문에 봇이 계속 새 결정을 내려서 예측할 수 없지만 구조화된 행동을 만들어요.

Master Gumbo는 이를 "아주 단순하고 기본적인 형태의 AI"라고 불러요. 신경망처럼 상호작용에서 배우지는 않지만, 무작위와 상태 기계가 스크립트 봇보다 예측하기 어려운 현실적 PvP 행동을 만들어요. 매개변수 센터에는 AI 켜고 끄기, 난이도 조정, 이동 패턴 설정을 위한 책 인터페이스가 있어요.

봇과 훈련한 뒤 자신을 바보라고 했던 플레이어와 결투해서(영상 인트로) Master Gumbo가 이겨요. 맵은 Discord로 공유되고 Carpet Mod가 필요해요.

![결투 중인 봇, mace PvP 기술을 연습해요](assets/mace-final-duel.png)

Kadambi PvP 봇이 픽셀에서 배우고 ANNA가 과제 트리로 추론하는 곳에서, Master Gumbo 봇은 **무작위 상태 전이**로 지능에 이르러요. 신경망 없이도 설득력 있는 PvP 상대를 만들 수 있음을 증명하는 순수 명령 블록 접근이에요.

## Altoclef: Baritone와 대규모 과제 트리

ANNA가 무엇을 할지 알려고 *읽는* 상징 봇이고, Mace 봇이 결정을 무작위화한다면, **Altoclef**는 게임 전체를 계획해서 통과하는 완전한 자율 에이전트예요. gaucho-matero가 Fabric 모드로 만들고 **Baritone** 길찾기로 움직여요. 어떤 Minecraft 목표든 과제 트리로 쪼개고 사람 개입 없이 실행해요.

인터페이스는 속임수처럼 단순해요. 채팅에 `@gamer`라고 치면 Altoclef가 서바이벌 월드에서 "게임 끝내기" 과제를 시작해요. 나무를 모으고, 도구를 만들고, 철과 다이아몬드를 캐고, 네더 포털을 만들고, 블레이즈 막대와 엔더 진주를 모으고, 요새를 찾고, 엔더 드래곤을 죽여요. 전부 자율로, 네이티브 Minecraft 클라이언트로, 어떤 바닐라 서버에서든요.

내부적으로는 **재귀 과제 트리 시스템**으로 이뤄져요. 상위 목표(예를 들어 "다이아몬드 곡괭이 만들기")가 선행 과제로 분해돼요. 다이아몬드 캐기에서 녹이기, 막대 만들기, 합치기. 트리가 Minecraft 레시피 전체 그래프를 훑고, 생산 사슬과 몬스터 드롭, 전리품 표와 상자 접근을 다뤄요. ANNA의 손으로 쓴 트리와 달리 Altoclef 과제는 임의 논리를 구현할 수 있는 **프로그래밍 가능한 Java 클래스**예요. 전투 전략, 피글린 물물교환, 탐험 패턴.

핵심 아키텍처 생각은 **무엇**(과제 트리)과 **어떻게**(Baritone 길찾기)의 분리예요. Baritone가 저수준 이동을 맡아요. 길찾기, 장애물 회피, 블록 깨기, 인벤토리 관리. 과제 시스템이 상위 계획을 조율해요. 이 모듈성 덕분에 어떤 컴포넌트도 AI일 필요가 없어요. 둘 다 결정적 알고리즘이지만, 합치면 학습 접근과 겨루는 복잡하고 목표 지향적인 행동이 나와요.

Altoclef는 **순수 상징 Minecraft AI**의 한계를 보여줘요. 훈련도 GPU도 인간 자료도 없이 처음부터 게임을 끝낼 수 있지만, 프로그래머가 예상하지 못한 과제에는 적응할 수 없고, 경험에서 배울 수 없어요. 다이아몬드 곡괭이를 만드는 법을 아는 것은 혼자 발견해서가 아니라 Java 클래스가 정확히 말해주기 때문이에요.

## 이들을 잇는 것

| 접근 | 주요 방법 | 자료 | 계산 | 결과 | |
|--------------------------|---------------------|---------|--------|-----------|-|
| 영상의 PvP 봇 | RL + 모방 학습 | 결투 1,000회 | 노트북 1대, 60시간 | 100연타 콤보 | |
| OpenAI Five | 자가 학습 RL | 하루 게임 180년 | GPU 256개, 10개월 | Dota 2 세계 챔피언 | |
| VPT | 준지도 IL | YouTube 7만 시간 + IDM | GPU 720개, 9일 | 다이아몬드 도구 | |
| DreamerV3 | 월드 모델 RL | 꿈꾼 궤적 | GPU 1개, 9일 | 처음부터 다이아몬드 | |
| **ANNA** | **상징 NLP + 과제 트리** | **쓴 레시피** | **노트북 1대, 바로** | **제작 가능한 모든 물건** | |
| **Altoclef** | **Baritone + 과제 트리 FS** | **Java 과제 클래스** | **Fabric 모드, GPU 없음** | **게임 전체 끝내기** | |
| **Mace 봇** | **명령 블록 상태 기계** | **무작위 결정** | **바닐라 MC, GPU 없음** | **Mace PvP 훈련** | |

영상의 봇은 자원이 가장 제약되지만 과정에 가장 솔직해요. 먼저 실패하고 반복해요. 배운 것을 잊었다가 다시 배워요. 100연타 콤보로 끝나지만, 만든 것이 부정행위인지 묻는 것으로도 끝나요.

---

**영상**: Kadambi | AI Engineering의 [AI Learns Minecraft PvP](https://www.youtube.com/watch?v=j5nxDKAjg6U)

**VPT**: [논문](https://cdn.openai.com/vpt/Paper.pdf) · [블로그](https://openai.com/index/vpt/) · [GitHub](https://github.com/openai/Video-Pre-Training)

**OpenAI Five**: [논문](https://arxiv.org/abs/1912.06680) · [블로그](https://openai.com/index/dota-2/)

**DreamerV3**: [논문](https://arxiv.org/abs/2301.04104) · [GitHub](https://github.com/danijar/dreamerv3)

**ANNA**: [GitHub](https://github.com/fox3000foxy/ANNA) · (Node.js, Mineflayer, 프랑스어 NLP, 과제 트리)

**Altoclef**: [GitHub](https://github.com/gaucho-matrero/altoclef) · [활성 포크](https://github.com/drmcbride12/altoclef) · (Fabric, Baritone, 과제 트리, 게임 끝내기)

**Mace 봇**: Master Gumbo의 [영상](https://www.youtube.com/watch?v=Fmp2Il70IF8) · (명령 블록, Carpet Mod, 상태 기계)
