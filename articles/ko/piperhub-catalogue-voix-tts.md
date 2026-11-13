---
title: "PiperHub:오픈소스 TTS 음성 536종,7가지 감정 1개 모델,GPU 없이,요금 없이"
description: "VITS、espeak、ONNX、LJSpeech:Piper가 Raspberry Pi를 어떻게 말하게 하는지.7가지 감정의 Fortune multi、Kokoro 82M、PocketTTS、sanoTTS、ElevenLabs,그리고 공식 Python 래퍼보다 10배 빠른 네이티브 pipertts."
date: 2026-11-12
tags:
  - tts
  - piper
  - open-source
  - typescript
  - ai
  - catalogue
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "tpiS8MQt77hmAVquMG6QJKs46xQifch4IXz2spbxrqqm7zT3mCoNtp8wbK/1DhTFTbk8jK6bLLypabqsdsbj3w=="
---

## Introduction

Discord 봇을 말하게 하는 건 돈이 들어요. 비싼 건 텍스트가 아니에요. 로컬 LLM이면 GPU 몇 푼으로 문장을 만들 수 있어요. 비싼 건 목소리예요. 합성 API는 글자 수대로 과금하고, 봇이 밤새 떠들면 청구서도 따라 올라가요.

이게 제가 Luna Protocol에서 겪은 문제예요. 제 Discord 봇은 로컬 LLM으로 메시지를 만들고, Piper 음성으로 읽게 하고, OGG로 바꿔서 음성 메시지로 보내요. 전부 제 서버에서 돌고, 한 문장당 0유로예요. 새벽 3시에 Luna가 혼자 인생 이야기를 시작해도 똑같아요.

0유로를 유지하려면 무료 음성을 찾아서 직접 호스팅해야 해요. 여기서부터 꼬였어요. 모델은 수십 개 Hugging Face 저장소에 흩어져 있고, 라이선스는 흐릿하고, 어떤 음성이 어디서 왔는지, 아직 돌아가는지 알 방법이 없어요. 그래서 [PiperHub](https://piperhub.org/)를 만들었어요. Piper TTS 음성용 오픈소스 카탈로그예요.

오늘 숫자:**모델 536개**,**언어 71종**,**스피커 3755명**이에요. 출처를 아는 모델은 전부 원본 dataset에 연결해 두었어요. 홈페이지 말대로, 출처도 소리의 일부니까요.

자주 받는 질문이 하나 남아 있어요. Kokoro, PocketTTS, sanoTTS, ElevenLabs 앞에서 Piper는 어떤지. 그리고 Fortune의 `pipertts` 모듈은 왜 공식 Python 래퍼보다 10배 빠른지. 이 글에서는 코드와 함께 엔진을 열어 보여드릴게요.

## PiperHub,카탈로그

엔진을 열기 전에, PiperHub가 푸는 문제부터 볼게요.

### 음성은 어디서 오나요

코드는 [github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank)에 있어요. Astro 정적 사이트고 서버는 없어요. 영어가 루트에 있고, 다른 15개 로케일이 `/<code>/` 아래에 있어요(fr, de, es, it, pt, ru, tr, ja, ko, zh, id, hi, ar, vi, th). 사실 제 블로그랑 같은 패턴이에요.

유일한 진실 원천은 아무도 손으로 고치지 않아요. 파이프라인이에요.

```bash
npm install
npm run data    # src/data/*.json 재생성 (python3 scripts/generate_data.py)
npx astro dev   # 로컬 개발
npm run build   # dist/에 정적 빌드
```

구체적으로는 이렇게 되어 있어요. crawler 저장소가 `models_mapping.csv`랑 `datasets_mapping.csv`를 관리하고, 미러 음성은 Hugging Face에 있고, 샘플은 오디오 파일이에요. `npm run data`가 그걸 다 가져와서 `src/data/*.json`을 뱉어내요. 사이트는 정적 JSON만 읽어요.

지금 생데이터(555개, 사이트 표시는 536개. 크롤이 표시보다 항상 조금 앞서요)에서는:

| Qualité | Modèles |
|---|---|
| medium | 437 |
| high | 67 |
| low | 50 |

| Sample rate | Modèles |
|---|---|
| 22050 Hz | 486 |
| 16000 Hz | 47 |

22050 Hz 음성이 486개, Piper 표준이에요. 16000 Hz가 47개, 임베디드용 가볍고 빠른 음성이에요. 포네마이저는 509건에서 `espeak`을 써요. 여기로 돌아올게요. 시스템의 심장이에요.

### 출처,즉 각 모델이 dataset을 갖는 이유

PiperHub를 그냥 목록이 아니라 쓸모 있게 만드는 게 모델과 dataset 연결이에요. 홈페이지에서 가져온 예로 말하면, **Astra - Valorant Piper TTS**라는 음성이 **Astra - LJSpeech Dataset**이라는 dataset에 연결되어 있어요. 두 페이지를 열어서 양쪽 저장소랑 라이선스를 확인할 수 있어요.

참조 dataset 130개예요. 그리고 카탈로그는 현황에 정직해요. 25개 모델에 `usable: false` 플래그가 붙어 있어요(깨진 파일, 아니면 fork 런타임이 필요한 `piperPlus` 형식). `pipertts` 모듈은 이런 음성을 나중에 이상하게 터뜨리는 대신 명확한 에러로 거부해요. 48개 모델이 멀티 스피커인데, 그중 둘이 앞으로 중요해져요.

가이드 쪽은 사이트가 세 단계로 일을 해요. **Build a dataset**, **Train a voice**, **Use a voice**, 거기에 Piper Plus 페이지예요. 입력은 LJSpeech 형식 dataset, 출력은 ONNX예요. 말은 쉽고 하기는 길어요. 그래서 다음 섹션이 있어요.

## Piper 속살:VITS,espeak,ONNX

### 한 문장,세 단계

Piper에게 "bonjour"라고 말시키면 이렇게 돼요.

```
"bonjour"
  -> [phonémisation espeak-ng] -> b O~ Z u R
  -> [encodeur VITS + flow + décodeur] -> waveform 22050 Hz
```

별도 보코더는 없어요. 이게 VITS예요. 텍스트(음소화된)에서 파형까지 직접 가는 엔드투엔드 모델이에요. 옛날 파이프라인은 텍스트에서 스펙트로그램(Tacotron), 스펙트로그램에서 오디오(HiFi-GAN, 모델 2개, 학습 2번)였는데, VITS는 조건부 VAE, normalizing flow, 디코더 위 GAN 방식 discriminator로 한 번에 다 배워요. 학습 1번, 모델 1개, ONNX 추출 1개예요.

디코더가 22050 Hz를 바로 뱉어요. 이 샘플레이트에서는 1초 발화가 숫자 22050개예요. 모델은 작고(medium 품질로 수십 MB), 추론은 순수 CPU예요. 최적화된 ONNX 그래프 위 행렬 곱이에요. 그래서 Raspberry Pi가 공식 타깃이에요. Piper는 Rhasspy에서 태어났고, Pi에서 돌리기 위한 오픈소스 음성 비서용으로 만들어졌어요.

### espeak-ng,더러운 일을 하는 포네마이저

VITS 전에 텍스트를 음소로 바꿔야 해요. 555개 모델 중 509개가 `espeak`을 써요.

```bash
echo "bonjour" | espeak-ng --ipa -v fr
# bO~'ZuR
```

espeak-ng는 수십 개 언어 발음을 알아요. VITS 모델은 `eau`를 `o`로 읽는 프랑스어 철자를 절대 배우지 않아요. 음소에서 소리로 가는 걸 배워요. 이게 학습을 엄청 쉽게 만들고, Piper가 71개 언어를 커버하는 이유도 설명해요. 새 언어는 해당 espeak 음성을 연결하고 학습하면 돼요.

espeak을 안 쓰는 음성은 자기 포네마이저가 있고, 여기서부터 이국적이에요. `hebrew`(Nakdimon ONNX에 IPA 규칙 494줄), `pinyin`(다의어 해소 포함 BERT g2pW 풀세트. 같은 한자도 단어에 따라 다르게 읽어요), `thai`(무수정 진짜 TLTK), `japanese`(lindera 분할과 UniDic). `pipertts` 모듈은 일곱 개를 다 품고 있고, Python 레퍼런스와 동일하다고 검증됐어요. 뒤에서 돌아올게요.

### dataset:LJSpeech,언제나 LJSpeech

표준 학습 형식은 LJSpeech예요. 클립 가득한 `wavs/` 폴더에 `metadata.csv`예요.

```
LJ001-0001|Printing, in the only sense with which we are at present concerned...|printing in the only sense...
LJ001-0002|in being comparatively modern...|in being comparatively modern...
```

`fileid|transcription|normalized`이고, 클립 하나에 한 문장, 몇 초예요. 원본 dataset은 한 여성 화자가 읽은 영어 13000문장이고 public domain이에요. 프랑스어 음성을 학습하려면 같은 구조를 프랑스어로 녹음해요. 텍스트와 정렬된 오디오, medium 품질이면 몇 시간이면 되고, high면 더 필요해요.

카탈로그의 세 품질은 대충 모델 크기와 학습 시간에 대응해요. Low는 작고, 빠르고, 로봇 같아요. Medium은 sweet spot이고 437개 모델이에요. High는 더 크고, 더 느리고, 더 자연스럽고 67개 모델, Fortune 포함이에요.

### 세 개의 마법 버튼

각 Piper 음성은 세 개 추론 파라미터를 갖고, 기본값은 거의 공통이에요.

```json
"inference": { "noise_scale": 0.667, "length_scale": 1, "noise_w": 0.8 }
```

- `noise_scale`(0.667):목소리 변화폭이에요. 높이면 표현이 풍부해지고, 낮추면 안정돼요. 출력은 확률적이에요. 같은 문장을 두 번 합성하면 오디오가 조금 달라요.
- `noise_w`(0.8):타이밍 변화폭, 리듬이에요.
- `length_scale`(1.0):속도예요. 1보다 크면 느려지고, 작으면 빨라져요. Luna가 화났을 때 빨리 말하게 하는 가장 쉬운 방법이에요.

`noise_scale`을 기억해 두세요. 감정에서 써요.

## Fortune multi:7가지 감정,1개 ONNX

자, 이제 현지 스타예요.

카탈로그에는 ItsRealFortune(저요!)이 학습한 Fortune 모델 세 개가 올라 있어요.

| Modèle | Repo | Voix |
|---|---|---|
| ItsRealFortune - French (FR) High | `fox3000foxy/piper-fortune-v6` | 1 (voice-0) |
| ItsRealFortune - French (FR) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-fr-multi` | **7** |
| ItsRealFortune - English (EN) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-en-multi` | **7** |

FR multi는 이렇게 되어 있어요.

```
normal, joyeuse, storytelling, colere, triste, surprise, interrogative
```

**하나의 ONNX 파일**에 일곱 가지 감정 variation이에요. EN multi도 같고, 이름에 역사적 오타가 있어요. `surprised`가 아니라 `suprised`예요. 가중치 안에 있으니 그대로 둬요. 전설의 일부예요.

### speakerId는 어떻게 돌아가나요

멀티 스피커 VITS는 같은 모델에 입력이 하나 더 있어요. 스피커 임베딩이에요. 학습 때 각 클립에 스타일 태그가 붙고, 모델은 나머지를 배우면서 임베딩 테이블(스타일당 한 줄)도 같이 배워요. 추론 때는 테이블 행을 골라요.

```ts
import { PiperNativeTTS } from "pipertts";

const tts = await PiperNativeTTS.load({
  model: "hub:itsrealfortune-french-fr-multi-high",
  modelsDir: "./models",
});

const styles = [
  "normal", "joyeuse", "storytelling",
  "colere", "triste", "surprise", "interrogative",
];

for (let i = 0; i < styles.length; i++) {
  const r = await tts.synthesize("Quelle merveilleuse nouvelle !", {
    speakerId: i,           // 0 = 평범 ... 5 = 놀람
    outputFile: `./fortune-${styles[i]}.wav`,
  });
}
```

같은 문장을 일곱 가지로 읽어요. `speakerId: 5`(놀람)에 `noise_scale`을 조금 올리면 믿음직한 감탄이 돼요. `speakerId: 4`(슬픔)에 `length_scale: 1.1`로 늦추면 부고 방송이 돼요. Luna가 목소리를 바꾸는 방식이 이거예요. 뇌가 감정을 고르고(valence와 arousal, centroid 글 참고), TTS가 speakerId를 골라요.

뒤 dataset 이름은 소박하게 **Fortune French - Dataset**이고, 라이선스 이름은 "Fortune's Café"예요. 네, 라이선스 이름이 카페 같아요. 그대로 둬요.

### 왜 경제적으로 영리한가요

일곱 감정이 다운로드 1번, RAM 로드 1번, ONNX 세션 1개예요. 대안(모델 일곱 개 분리)은 저장소를 몇 배로 늘리고, 감정을 바꿀 때마다 그래프를 다시 로드해야 해요. 문장 중간에 톤을 바꾸는 봇에는 불가능해요. 여기서는 `speakerId`가 텐서 속 인덱스일 뿐이에요. 한계 비용은 제로예요.

## 경쟁자:Kokoro,PocketTTS,sanoTTS

Piper는 CPU 자리를 세 진지한 도전자와 나눠요. 철학이 셋 다 달라요.

### Kokoro 82M,가성비 왕

[Kokoro](https://huggingface.co/hexgrad/Kokoro-82M), 만든 사람은 hexgrad예요. 8200만 파라미터, 수정 StyleTTS 2 아키텍처에 ISTFTNet 디코더, **확산 단계 없음**이에요. 확산이 없다는 게 전부예요. 반복 디노이징 루프가 없으니 추론이 엄청 빨라요.

| | Kokoro-82M |
|---|---|
| Params | 82M |
| Poids | ~300 Mo (164 Mo en FP16) |
| Licence | Apache 2.0 (commercial OK) |
| Langues | 8, 54 voix preset + blending |
| CPU | quasi temps réel |
| GPU | 36 à 96x temps réel |
| Tests aveugles | au niveau de Google et Amazon |

100시간 미만 오디오, 약 1000달러로 학습했고, 블라인드 청취에서 Google, Amazon 프리미엄 음성과 같은 급으로 꼽혀요. 터진 이유가 여기예요. 프리미엄 품질, 무료, 로컬, 관대한 라이선스.

Piper와 붙으면 순수 자연스러움은 Kokoro가 이겨요(StyleTTS 2가 소형 VITS보다 위예요) 라이선스도 이겨요(Piper 엔진 GPL-3.0에 Apache 2.0). 커버리지는 Piper가 이겨요(8개 언어 대 71개 언어, 54개 음성 대 3755 스피커) 커뮤니티 음성 생태계도 이겨요. 영어 내레이션이면 Kokoro가 세요. 7가지 감정 프랑스어, 터키어, 스와힐리어면 Piper가 유일한 후보인 경우가 많아요.

### PocketTTS(Kyutai),CPU에서 클로닝

[Kyutai](https://kyutai.org/tts/)는 다른 수를 둬요. 작은 **음성 클로닝 포함** 모델이고 CPU에서 돌아요.

| Modèle | Params | WER | UTMOS | SIM | Vitesse CPU (1 thread) |
|---|---|---|---|---|---|
| Pocket TTS | ~100M | 0.92% | 4.364 | 0.923 | 2.8x temps réel |
| Pocket TTS small | 1.9M / 6.9M / 18.2M | - | - | - | CPU, clonage inclus |

WER 1% 미만(발음이 정확해요), UTMOS 4.36(체감 품질이 훌륭해요), SIM 0.923(클론이 진짜 타깃을 닮아요). small 버전은 **190만 파라미터**까지 내려가는데 클로닝이 돼요. 190만이요. 제 Sabaki 라우터가 JSON으로 거의 이 크기예요.

Piper와 붙으면 클론은 PocketTTS가 이겨요(Piper는 고정 음성으로 읽어요) 주력 모델 작기도 이겨요. 언어는 Piper가 이겨요(small은 지금 영어 전용이에요) 생태계 성숙도도 이겨요(바로 쓰는 536 음성 대 "네가 학습해").

### sanoTTS,3달러 칩에 올라가는 모델

[sanoTTS](https://github.com/ampixa/sanoTTS)(`sano`는 네팔어로 "작은")는 TTS계의 Bareiron이에요. 음소에서 22.05 kHz PCM까지 완전한 신경 스택이 **마이크로컨트롤러 위**에서 돌아요.

| Système | Params | SCOREQ | UTMOS | DNS-SIG |
|---|---|---|---|---|
| sanoTTS (heart-nano) | 0.29M | 2.29 | 2.45 | 3.35 |
| TinyTTS | 1.62M | 3.94 | 3.65 | 3.62 |

29만 파라미터예요. 음성 2MB예요. `pip install sanotts`하고 `sanotts say "Hello" --voice amy` 하면 말해요. 브라우저에서도 돼요.

근데 점수를 보세요. SCOREQ는 TinyTTS 3.94에 2.29, UTMOS는 2.45예요. 말은 해요, 네. 노래는 안 돼요. 이게 궁극 tradeoff예요. 29만이면 어디든 들어가지만 품질은 크기 따라가요. Piper medium은 100배 무게로 다른 리그 음성이에요.

### 정리 표

| | Piper | Kokoro 82M | PocketTTS | sanoTTS |
|---|---|---|---|---|
| Params typiques | ~10-60M | 82M | ~100M / 2-18M | 0.3-1.4M |
| Langues | 71 | 8 | EN (+ smalls EN) | multilingue, petit |
| Voix dispos | 3755 speakers | 54 + blending | clonage (la tienne) | quelques voix |
| Clonage | non | non (natif) | **oui, CPU** | non |
| Licence moteur | GPL-3.0 | Apache 2.0 | open (Kyutai) | open |
| Entraînable maison | oui (LJSpeech) | oui (plus lourd) | oui | oui |
| Qualité FR | bonne (multi émotions) | correcte (EN-first) | EN-only | faible |

선택은 제약에 달렸고 절대 승자는 없어요. 순수 영어 품질이면 Kokoro예요. CPU 클론이면 PocketTTS예요. 마이크로컨트롤러면 sanoTTS예요. 언어 커버와 감정 프랑스어 음성과 인프라 제로면 Piper예요.

## ElevenLabs,과금되는 거인

그리고 ElevenLabs가 있어요. 70개 넘는 언어, 표현 풍부한 Eleven v3 with audio tags와 드라마틱한 대화, 블라인드 테스트 최상 품질이에요. TTS계 Jev 같은 거예요. 다들 봤고, 다들 벤치마크 상대로 삼았어요.

2026년 가격, 어림잡아 보면:

| Modèle API | Prix / 1000 caractères |
|---|---|
| Flash / Turbo, v3 Conversational | $0.05 |
| Multilingual v2, Eleven v3 | $0.10 |

1000자가 약 1분 오디오예요. 그러니까 1분에 0.05에서 0.10달러예요. 99달러 Pro 플랜은 약 99만 자 포함이고 초과분도 같은 단가예요. 매일 내레이션 영상을 올리는 YouTube 채널(제 `valorant-short-maker`가 딱 그걸 무료 Piper로 해요)이면, 매일 내레이션 1분당 월 1.50에서 3달러예요. 하루 10분이면 월 15에서 30달러예요. 낼 수는 있는데 세는 돈이에요.

낼 가치가 있을 때:목소리 자체가 상품일 때(더빙, 오디오북, 광고), 내일 아침까지 70개 언어가 필요할 때, 클론이 한 번에 완벽해야 할 때요. 반대로 절대 아닐 때:밤새 떠드는 Discord 봇, 내부 알림, 개발, 양이 터질 때예요. 새벽 3시에 인생 이야기하는 Luna를 ElevenLabs로 돌리면, 제 전기요금이 울어요.

계산은 쉬워요. Piper는 한계 비용 0유로에 품질 "좋아요". ElevenLabs는 미터기가 돌고 품질 "훌륭해요". 그 사이에 "좋고 무료"가 이기는 세상이 있어요. 그게 PiperHub 내기의 전부예요.

## pipertts:네이티브가 Python 래퍼를 10배로 이기는 이유

저장소 [itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts), 75개 커밋이에요. Piper의 TypeScript 네이티브 포팅이에요. README 제목은 "In-process Piper TTS for Node.js. No Python required."예요.

### spawn 비용

옛날 래퍼(`PiperTTS`)는 **합성마다** `python3 -m piper`를 자식 프로세스로 spawn해요.

```
synthèse = spawn(python) + chargement du modèle + inférence + kill
```

각 문장이 인터프리터 시작과 가중치 로드를 내요. `en_US-lessac-medium` 실측으로 **한 줄당 약 2.2초**예요.

네이티브(`PiperNativeTTS`)는 ONNX 세션을 메모리에 따뜻하게 둬요.

```
load une fois -> session persistante -> inférence par phrase
```

같은 조건 실측으로 **한 줄당 약 0.22초**예요. 10배는 여기서 와요. spawn이랑 리로드를 죽인 결과고, ONNX 추론이 신기해서가 아니에요. 양쪽 ONNX 추론 자체는 같아요.

덤으로 첫 로드 때 최적화된 그래프를 `.onnx` 옆에 캐시해요(`<model>.ortopt-<platform>-<arch>-v<ort>.onnx`). 다음 로드가 약 35% 빨라져요. 캐시 키는 platform, arch, ORT 버전을 조합하고, 모델이 바뀌면 새로고침돼요. `cacheOptimizedModel: false`로 끌 수 있어요.

### espeak 브리지:0.4ms 대 15ms

음소화도 같은 논리예요. 래퍼는 문장마다 `espeak-ng` 바이너리를 CLI로 불러요. 매번 약 15ms spawn이에요. 네이티브는 N-API 브리지를 내장하고(`src/native/espeak-bridge/`, `espeakbridge.c` 포팅), Linux x64와 arm64 프리빌드 포함이에요. **호출당 약 0.4ms**에 음소는 바이트 동일해요. 애드온이 없으면 CLI로 자동 폴백해요. `PIPER_ESPEAK_BRIDGE=0`으로 CLI 강제예요.

### 7종 phoneme_type,전부 포팅

| Type | Moteur | Notes |
|---|---|---|
| `espeak` | bridge N-API ou CLI | clauses byte-identiques |
| `text` | passthrough codepoints | trivial |
| `hebrew` | Nakdimon ONNX + règles IPA | sorties identiques |
| `lithuanian` | espeak + dico de stress 189k entrées | sorties identiques |
| `pinyin` | BERT g2pW ONNX + WordPiece | désambiguïsation des polyphones OK |
| `thai` | vrai TLTK non modifié sous Pyodide/WASM | 7/7 identiques (1er appel lent, suite rapide) |
| `japanese` | lindera-wasm + UniDic + moteur de mores TS | segmentation exacte, **pas d'accent lexical** |

아랍어는 자동으로 모음 부호가 찍혀요(tashkeel, 끌 수 있어요). 카탈로그 espeak 음성 509건은 빠른 브리지로 가고, 이국적인 건 전용 엔진으로 가요. 테스트 스위트에 71개 테스트, 막히는 곳은 문서화했어요(일본어 악센트, UniDic에 데이터 없음. 인정한 거고 숨긴 거 없어요).

### 형식과 스트리밍

기본 `wav`, `raw` PCM, `mp3`, `ogg`, `opus`예요. ffmpeg가 있으면 쓰고, 없으면 순수 JS 폴백(mp3용 lamejs, opus용 opusscript와 Ogg muxer, 원본과 상관계수 0.993). 그리고 무엇보다 `synthesizeChunks()`예요. 문장마다 yield하는 비동기 제너레이터고 문장 사이에 `sentenceSilence`를 넣어요. Luna에게는 끝을 합성하면서 앞을 재생하기 시작한다는 뜻이에요. 전용 서버 없는 TTS 스트리밍이에요.

PiperHub 카탈로그 통합 포함 전체 사용법(`hub:`에 작성자 저장소가 파일을 안 주면 자동 미러 폴백):

```ts
const tts = await PiperNativeTTS.load({
  model: "hub:glados-french-medium-voice",
  modelsDir: "./models",
});

const r = await tts.synthesize("Bonjour, je suis GLaDOS.", {
  outputFormat: "ogg",   // Discord에 바로
  lengthScale: 0.95,     // 조금 빠르게
});
```

커뮤니티 음성(GLaDOS랑 게임 캐릭터)은 공식 manifest에 없어요. PiperHub가 존재하는 이유 그 자체고, `pipertts`도 알아요. `hub:<slug>`, piperhub 페이지 URL, 그냥 slug, 다 돼요. `usable: false` 음성은 명확한 에러로 거부돼요.

## 희생한 것들

없는 기능마다 다른 기능을 먹여 살려요. 정직 리스트예요.

**Piper는 ElevenLabs 옆에서 로봇 같이 들려요.** 22050 Hz VITS medium은 깔끔하지만 대형 표현 모델 앞에서는 평평해요. 멀티 감정으로 일부 만회해요(평평 1종보다 7 스타일) 그래도 ElevenLabs v3 오디오북이 위예요. 수십 MB 대가예요.

**espeak은 틀려요.** 고유명사, 외래어, 약어에는 규칙 기반 음소화 사각지대가 있어요. 프랑스어 "Spoiler"는 espeak 나름대로 읽어요. 신경 G2P 대형 모델은 덜 틀려요. 실전에서는 업무 용어 예외 사전이 필요해요.

**네이티브 클론은 제로예요.** Piper는 고정 음성으로 읽어요. 자기 목소리가 탐나면 PocketTTS나 ElevenLabs로 가세요. 멀티 스피커는 variation을 주지 자기 음색을 주지 않아요.

**일본어는 어휘 악센트 없이 그대로예요.** UniDic에 악센트 데이터가 없어서 분할은 정확하지만 멜로디는 근사예요. README에 문서화했고 숨긴 거 없어요.

**태국어는 첫 호출이 무거워요.** TLTK가 무수정 Pyodide/WASM으로 돌아요. 첫 호출은 로딩에 몇 초 걸리고 이후는 빨라요. 레퍼런스와 7/7 동일하지만 웜업은 잡으세요.

**데이터가 배고파요.** 제대로 된 high 음성 하나에 시간 단위 깨끗하게 정렬된 오디오가 필요해요. Fortune dataset은 몇 시간 녹음과 정리예요. 마법은 제로예요. 쓰레기를 넣으면 로봇이 나와요.

**카탈로그에 죽은 음성이 있어요.** 25개 모델에 `usable: false` 플래그예요. 인정하고 필터링했지만, 음성 크라우드소싱이 포기 크라우드소싱이기도 하다는 걸 알려줘요.

## 최종 결과

한쪽에 ElevenLabs 미터기, 한쪽에 Raspberry Pi예요.

- PiperHub:표시 536 모델, 71 언어, 3755 스피커, 연결된 130 dataset, dataset에서 training에서 usage로 가는 가이드
- Piper:VITS 엔드투엔드, espeak, ONNX CPU, LJSpeech, low와 medium과 high, 표준 22050 Hz
- Fortune multi:FR 7감정과 EN 7감정, 각 1 ONNX, 전환은 `speakerId`, 라이선스 "Fortune's Café"
- Kokoro 82M:프리미엄 영어 품질, Apache 2.0, 54 음성, CPU 거의 실시간
- PocketTTS:CPU 클론, 약 100M에서 2-18M, WER 0.92%
- sanoTTS:0.29M, 2MB, 마이크로컨트롤러, 크기 따라가는 품질
- ElevenLabs:1000자 0.05-0.10달러, 70개 넘는 언어, 최고 품질, 도는 미터기
- 네이티브 pipertts:래퍼 약 2.2초/줄 대 약 0.22초/줄, espeak 브리지 0.4ms, 7종 phoneme_type, wav와 raw와 mp3와 ogg와 opus, 문장별 스트리밍

Luna는 매일 이걸로 말해요. TTS 0유로, 뇌 조종 감정, Discord용 직접 OGG예요. ElevenLabs랑 비교하면 들리죠, 당연히요. 근데 새벽 3시에 걔가 인생 이야기를 시작해도, 제 청구서는 쿨쿨 자요.

## 철학

p2r3가 말했어요. *"1달러짜리 그 조그만 칩이 Minecraft 같은 대단한 걸 돌릴 수 있다는 발상이 좋아."*

목소리에 적용한 같은 느낌이에요. 수십 MB ONNX로 Raspberry Pi가 71개 언어로 말하는 게 좋아요. 클라우드 없이, 계정 없이, 미터기 없이요. 더빙 스튜디오를 대신할 수는 당연히 없어요. 짜증 나는 경우를 대신해요. 괜찮고, 로컬이고, 무료인 목소리가 필요하고, 밤에 말해도 과금 안 되는 경우요.

tradeoff, 흑백으로 또박또박 적어요.
- 프리미엄 품질에서 소형 VITS로:조금 로봇 같지만 로컬이고 무료
- 감정당 1모델에서 speakerId로:RAM 위 1개 값으로 7 음성
- Python spawn에서 영속 세션으로:10배 빠르고 Python 설치 제로
- 야생 카탈로그에서 출처 연결로:각 음성은 출처와 동작 상태를 알아요
- 과금 API에서 한계 비용 0유로로:ElevenLabs만큼 예쁘진 않지만 청구서는 쿨쿨 자요

**기억할 3가지:**

1. **Piper는 CPU의 TTS예요**. VITS와 espeak와 ONNX, 71개 언어, Pi에서 도는 수십 MB 음성이에요. ElevenLabs만큼 예쁘진 않지만 한없이 싸요.
2. **Fortune multi는 1개 값으로 7감정이에요**. ONNX 1개, 전환은 `speakerId`, FR과 EN이에요. 모델 일곱 개 대신 스피커 임베딩이에요.
3. **네이티브는 spawn을 죽여요**. `pipertts`는 ONNX 세션을 따뜻하게 둬요. 1줄 2.2초 대 0.22초, espeak CLI 15ms 대 브리지 0.4ms예요. 같은 추론에 대기는 10분의 1이에요.

관심 있으면 카탈로그는 [piperhub.org](https://piperhub.org/), 사이트 코드는 [github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank), 네이티브 모듈은 [github.com/itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts)예요. 새벽 3시에 인생 이야기하는 Luna를 듣고 싶으면 Discord에서 봐요 xD
