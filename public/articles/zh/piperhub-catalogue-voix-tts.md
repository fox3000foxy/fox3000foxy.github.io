---
title: "PiperHub:536 个开源 TTS 声音,7 种情感一个模型,零 GPU,零账单"
description: "VITS、espeak、ONNX、LJSpeech:Piper 如何让树莓派开口说话。7 种情感的 Fortune multi、Kokoro 82M、PocketTTS、sanoTTS、ElevenLabs,以及比官方 Python wrapper 快 10 倍的原生 pipertts。"
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
author_sig: "CzHGrMhhv9aPhgJWzzwQX4kFkyFAz9bzsuuormVkxLvImYjkuEb7KGjjm0bhoQimYKuRgdB6P0SfbEqS9amAAw=="
---

## Introduction

让 Discord 机器人开口说话,成本很高。贵的不是文本:本地 LLM 花几分钱 GPU 就能生成句子。贵的是声音。合成 API 按字符收费,机器人讲一整夜,账单就跟着涨。

这就是我在 Luna Protocol 遇到的问题。我的 Discord 机器人用本地 LLM 生成消息,再用 Piper 的声音朗读,转成 OGG,当作语音消息发出去。全都在我自己的服务器上跑,每句话 0 欧元,就算凌晨 3 点 Luna 决定自己讲人生故事也一样。

要保持 0 欧元,就得找到免费声音并自己托管。麻烦就在这里:模型散落在几十个 Hugging Face 仓库里,许可证模糊不清,根本没法知道某个声音从哪来,还能不能用。于是我做了 [PiperHub](https://piperhub.org/),一个 Piper TTS 声音的开源目录。

今天的数据:**536 个模型**、**71 种语言**、**3755 个 speaker**。只要知道来源,每个模型都会链接到原始 dataset。用首页的话说,出处也是声音的一部分。

还剩一个常被问到的问题:面对 Kokoro、PocketTTS、sanoTTS 和 ElevenLabs,Piper 怎么样?为什么 Fortune 的 `pipertts` 模块比官方 Python wrapper 快 10 倍?这篇文章把引擎拆开讲,附代码。

## PiperHub,目录

先看 PiperHub 解决的问题,再拆引擎。

### 声音从哪里来

代码在 [github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank)。Astro 静态站,零服务器:英文在根目录,另外 15 个语言在 `/<code>/` 下面(fr、de、es、it、pt、ru、tr、ja、ko、zh、id、hi、ar、vi、th)。其实跟我的博客一个套路。

唯一真相来源,没人手动改。是个 pipeline:

```bash
npm install
npm run data    # 重新生成 src/data/*.json (python3 scripts/generate_data.py)
npx astro dev   # 本地开发
npm run build   # 输出静态构建到 dist/
```

具体来说:一个 crawler 仓库维护 `models_mapping.csv` 和 `datasets_mapping.csv`,镜像声音放在 Hugging Face, sample 是音频文件。`npm run data` 把这些全拉下来,吐出 `src/data/*.json`。网站只读静态 JSON。

当前原始数据(555 条,网站显示 536 条,爬取永远比展示快一点):

| Qualité | Modèles |
|---|---|
| medium | 437 |
| high | 67 |
| low | 50 |

| Sample rate | Modèles |
|---|---|
| 22050 Hz | 486 |
| 16000 Hz | 47 |

486 个 22050 Hz 的声音,Piper 标准。47 个 16000 Hz,给嵌入式用的轻量快速声音。 phonemizer 有 509 个用的是 `espeak`,后面会回来讲,这是系统的心脏。

### 出处,或者说为什么每个模型都有 dataset

PiperHub 有用而不是只有列表,关键就是模型和 dataset 的链接。首页拿的例子:声音 **Astra - Valorant Piper TTS** 链接到 dataset **Astra - LJSpeech Dataset**。打开两个页面,两边的仓库和许可证都能核对。

引用了 130 个 dataset。目录对现状也很诚实:25 个模型标了 `usable: false`(文件损坏,或者是需要 fork runtime 的 `piperPlus` 格式)。`pipertts` 模块遇到这些声音会直接抛明确错误,而不是后面莫名其妙崩掉。48 个模型是多 speaker,其中两个是我们接下来要讲的。

指南方面,网站分三步:**Build a dataset**、**Train a voice**、**Use a voice**,再加一个 Piper Plus 页面。输入是 LJSpeech 格式 dataset,输出是 ONNX。说起来简单,做起来很长,所以才有下一节。

## Piper 引擎盖下:VITS、espeak、ONNX

### 一句话,三步

让 Piper 说一句“bonjour”,会发生这些:

```
"bonjour"
  -> [phonémisation espeak-ng] -> b O~ Z u R
  -> [encodeur VITS + flow + décodeur] -> waveform 22050 Hz
```

没有独立 vocoder。这就是 VITS:从文本(已音素化)直达波形的端到端模型。老 pipeline 是文本到频谱(Tacotron),再频谱到音频(HiFi-GAN,两个模型,训练两次),VITS 用条件 VAE、normalizing flow 和解码器上的 GAN 式 discriminator 一次全学会。一次训练,一个模型,一次 ONNX 导出。

解码器直接输出 22050 Hz。这个采样率下,一秒语音就是 22050 个数字。模型很小(medium 品质几十 MB),推理是纯 CPU:在优化过的 ONNX 图上做矩阵乘法。所以树莓派是官方目标。Piper 生于 Rhasspy,一个为跑在 Pi 上的开源语音助手。

### espeak-ng,干脏活的 phonemizer

在 VITS 之前,要先把文本转成音素。555 个模型里 509 个用 `espeak`:

```bash
echo "bonjour" | espeak-ng --ipa -v fr
# bO~'ZuR
```

espeak-ng 懂几十种语言的发音。VITS 模型永远学不到法语拼写里 `eau` 读 `o` 这种事,它学的是音素到声音。这让训练简单得多,也解释了 Piper 为什么覆盖 71 种语言:新语言接上对应的 espeak 声音再训练就行。

不用 espeak 的都有自己的 phonemizer,开始有点异域风情:`hebrew`(Nakdimon ONNX 加 494 行 IPA 规则)、`pinyin`(完整 BERT g2pW,带多音字消歧,同一个汉字在不同词里读音不同)、`thai`(原版未改 TLTK)、`japanese`(lindera 分词加 UniDic)。`pipertts` 模块七个全带,都验证过和 Python 参考版一致。后面再讲。

### dataset:LJSpeech,永远 LJSpeech

标准训练格式是 LJSpeech:一个装满短 clip 的 `wavs/` 文件夹,加一个 `metadata.csv`:

```
LJ001-0001|Printing, in the only sense with which we are at present concerned...|printing in the only sense...
LJ001-0002|in being comparatively modern...|in being comparatively modern...
```

`fileid|transcription|normalized`,一个 clip 一句话,几秒钟。原始 dataset 是同一个女声读的 13000 句英语,public domain。要训练法语声音,就按同样结构录法语:文本加对齐音频,medium 品质几小时就够,high 要更多。

目录里的三个品质,大致对应模型大小加训练时长。Low:小、快、机械感。Medium:甜点区,437 个模型。High:更大、更慢、更自然,67 个模型,包括 Fortune 那几个。

### 三个魔法按钮

每个 Piper 声音都有三个推理参数,默认值几乎通用:

```json
"inference": { "noise_scale": 0.667, "length_scale": 1, "noise_w": 0.8 }
```

- `noise_scale`(0.667):声音的变化幅度。越高越有表现力,越低越稳定。输出是随机的:同一句话合成两次,音频会略有不同。
- `noise_w`(0.8):时长的变化幅度,也就是节奏。
- `length_scale`(1.0):语速。大于 1 变慢,小于 1 变快。Luna 生气时让她讲快一点,最简单的办法就是这个。

记住 `noise_scale`,讲情感时会用到。

## Fortune multi:7 种情感,1 个 ONNX

好,讲本地明星。

目录里列了 ItsRealFortune(是我啦)训练的三个 Fortune 模型:

| Modèle | Repo | Voix |
|---|---|---|
| ItsRealFortune - French (FR) High | `fox3000foxy/piper-fortune-v6` | 1 (voice-0) |
| ItsRealFortune - French (FR) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-fr-multi` | **7** |
| ItsRealFortune - English (EN) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-en-multi` | **7** |

法语 multi 是这样的:

```
normal, joyeuse, storytelling, colere, triste, surprise, interrogative
```

七种情感变化装在**一个 ONNX 文件**里。英语 multi 一样,名字里有个历史 typo:`suprised` 而不是 `surprised`。它在权重里,就留着吧,算民间传说的一部分。

### speakerId 是怎么工作的

多 speaker VITS,就是同一个模型多一个输入:speaker embedding。训练时每个 clip 都打上风格标签,模型在学其余部分的同时,学会一张 embedding 表(每种风格一行)。推理时选表里的一行:

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
    speakerId: i,           // 0 = 普通版 ... 5 = 惊讶版
    outputFile: `./fortune-${styles[i]}.wav`,
  });
}
```

同一句话,七种读法。`speakerId: 5`(惊讶)配上稍高的 `noise_scale`,感叹就很可信了。`speakerId: 4`(悲伤)配 `length_scale: 1.1` 放慢,就是讣告播报。Luna 就是这样换声音的:大脑选情感(valence 和 arousal,看我那篇 centroid 文章),TTS 选 speakerId。

背后的 dataset 名字很朴素,**Fortune French - Dataset**,许可证叫“Fortune's Café”。对,许可证名字像咖啡馆。就留着吧。

### 为什么这在经济上很聪明

七种情感等于一次下载、一次 RAM 加载、一个 ONNX session。替代方案(七个独立模型)会让存储翻倍,每次换情感都要重载图,对一句话里换语气的机器人根本没法用。这里 `speakerId` 只是 tensor 里的一个索引。边际成本:零。

## 竞争者:Kokoro、PocketTTS、sanoTTS

Piper 和三个认真的挑战者共享 CPU,三种不同哲学。

### Kokoro 82M,性价比之王

[Kokoro](https://huggingface.co/hexgrad/Kokoro-82M),作者 hexgrad。8200 万参数,魔改 StyleTTS 2 架构加 ISTFTNet 解码器,**没有扩散步骤**。没有扩散就是一切:没有迭代去噪循环,所以推理超快。

| | Kokoro-82M |
|---|---|
| Params | 82M |
| Poids | ~300 Mo (164 Mo en FP16) |
| Licence | Apache 2.0 (commercial OK) |
| Langues | 8, 54 voix preset + blending |
| CPU | quasi temps réel |
| GPU | 36 à 96x temps réel |
| Tests aveugles | au niveau de Google et Amazon |

训练用了不到 100 小时音频,花了约 1000 美元,盲听被评到和 Google、Amazon 的付费声音一个级别。所以它爆了:付费品质,免费,本地,宽松许可。

对 Piper:纯自然度 Kokoro 赢(StyleTTS 2 比小 VITS 强),许可证也赢(Apache 2.0 对 Piper 引擎的 GPL-3.0)。覆盖面 Piper 赢(71 种语言对 8 种,3755 个 speaker 对 54 个声音),社区声音生态也赢。英语旁白 Kokoro 很难打。带 7 种情感的法语、土耳其语、斯瓦希里语,Piper 经常是唯一选手。

### PocketTTS(Kyutai),CPU 上克隆

[Kyutai](https://kyutai.org/tts/) 走另一条路:小模型**带声音克隆**,跑在 CPU 上。

| Modèle | Params | WER | UTMOS | SIM | Vitesse CPU (1 thread) |
|---|---|---|---|---|---|
| Pocket TTS | ~100M | 0.92% | 4.364 | 0.923 | 2.8x temps réel |
| Pocket TTS small | 1.9M / 6.9M / 18.2M | - | - | - | CPU, clonage inclus |

WER 不到 1%(发音准),UTMOS 4.36(感知质量优秀),SIM 0.923(克隆体真像目标)。small 版低到 **190 万参数**还带克隆。190 万。我的 Sabaki 路由器 JSON 都快这个大小了。

对 Piper:克隆 PocketTTS 赢(Piper 只会用固定声音读),旗舰的小体积也赢。语言 Piper 赢(small 目前只有英文),生态成熟度 Piper 赢(536 个现成声音对“自己训一个”)。

### sanoTTS,3 美元芯片上跑的模型

[sanoTTS](https://github.com/ampixa/sanoTTS)(`sano` 在尼泊尔语里是“小”),是 TTS 界的 Bareiron:从音素到 22.05 kHz PCM 的完整神经栈跑在**单片机上**。

| Système | Params | SCOREQ | UTMOS | DNS-SIG |
|---|---|---|---|---|
| sanoTTS (heart-nano) | 0.29M | 2.29 | 2.45 | 3.35 |
| TinyTTS | 1.62M | 3.94 | 3.65 | 3.62 |

29 万参数。一个声音 2 MB。`pip install sanotts`,`sanotts say "Hello" --voice amy`,就出声了。浏览器里也行。

但看分数:SCOREQ 2.29 对 TinyTTS 的 3.94,UTMOS 2.45。能说话,对。能唱歌,不行。这就是终极 tradeoff:29 万哪里都能跑,但质量跟着体积走。Piper medium 重 100 倍,声音完全另一个级别。

### 总结表

| | Piper | Kokoro 82M | PocketTTS | sanoTTS |
|---|---|---|---|---|
| Params typiques | ~10-60M | 82M | ~100M / 2-18M | 0.3-1.4M |
| Langues | 71 | 8 | EN (+ smalls EN) | multilingue, petit |
| Voix dispos | 3755 speakers | 54 + blending | clonage (la tienne) | quelques voix |
| Clonage | non | non (natif) | **oui, CPU** | non |
| Licence moteur | GPL-3.0 | Apache 2.0 | open (Kyutai) | open |
| Entraînable maison | oui (LJSpeech) | oui (plus lourd) | oui | oui |
| Qualité FR | bonne (multi émotions) | correcte (EN-first) | EN-only | faible |

选哪个看你的约束,没有绝对赢家:纯英语品质选 Kokoro。CPU 克隆选 PocketTTS。单片机选 sanoTTS。语言覆盖加法语情感声音加零基建选 Piper。

## ElevenLabs,收费的巨人

然后是 ElevenLabs。70 多种语言,表现力强的 Eleven v3 带 audio tags 和戏剧化对白,盲测品质第一。有点像 TTS 界的 Jev:谁都见过,谁都拿它当 benchmark 比过。

2026 年定价,取整:

| Modèle API | Prix / 1000 caractères |
|---|---|
| Flash / Turbo, v3 Conversational | $0.05 |
| Multilingual v2, Eleven v3 | $0.10 |

1000 字符约等于 1 分钟音频。所以一分钟 0.05 到 0.10 美元。99 美元 Pro 套餐含约 99 万字符,超量同价。每天出一条配音视频的 YouTube 频道(我的 `valorant-short-maker` 就是干这个的,但用免费 Piper),每天每分钟配音每月 1.50 到 3 美元。每天 10 分钟:每月 15 到 30 美元。付得起,但要算账。

什么时候值:声音本身就是产品时(配音、有声书、广告),明天早上就要 70 种语言时,克隆一次就要完美时。什么时候永远不值:整夜说话的 Discord 机器人、内部通知、开发、量爆炸时。让 Luna 凌晨 3 点讲人生还用 ElevenLabs,我的电费账单会哭。

账很好算:Piper 边际 0 欧元,品质“不错”。ElevenLabs 计表在转,品质“优秀”。中间有个“不错还免费”能赢的世界,这就是 PiperHub 的全部赌注。

## pipertts:为什么原生比 Python wrapper 快 10 倍

仓库 [itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts),75 个 commit:Piper 的 TypeScript 原生移植。README 标题:“In-process Piper TTS for Node.js. No Python required.”

### spawn 的成本

老 wrapper(`PiperTTS`)是**每次合成**都 spawn 一个 `python3 -m piper` 子进程:

```
synthèse = spawn(python) + chargement du modèle + inférence + kill
```

每句话都要付解释器启动加权重加载的钱。在 `en_US-lessac-medium` 上实测:**每行约 2.2 秒**。

原生(`PiperNativeTTS`)把 ONNX session 保温在内存里:

```
load une fois -> session persistante -> inférence par phrase
```

同样条件实测:**每行约 0.22 秒**。10 倍就从这里来:杀掉了 spawn 和重载,和 ONNX 推理神不神奇没关系。两边的 ONNX 推理本身是一样的。

附赠:首次 load 会在 `.onnx` 旁边缓存优化过的图(`<model>.ortopt-<platform>-<arch>-v<ort>.onnx`),之后加载快约 35%。缓存 key 组合了 platform、arch 和 ORT 版本,模型变了会刷新。`cacheOptimizedModel: false` 可关。

### espeak 桥:0.4ms 对 15ms

音素化也一样。wrapper 每句话调一次 `espeak-ng` 二进制 CLI:每次约 15ms spawn。原生内置 N-API bridge(`src/native/espeak-bridge/`,移植自 `espeakbridge.c`),带 Linux x64 和 arm64 prebuild:**每次调用约 0.4ms**,音素字节级一致。没有 addon 就自动回落 CLI。`PIPER_ESPEAK_BRIDGE=0` 强制走 CLI。

### 7 种 phoneme_type,全移植了

| Type | Moteur | Notes |
|---|---|---|
| `espeak` | bridge N-API ou CLI | clauses byte-identiques |
| `text` | passthrough codepoints | trivial |
| `hebrew` | Nakdimon ONNX + règles IPA | sorties identiques |
| `lithuanian` | espeak + dico de stress 189k entrées | sorties identiques |
| `pinyin` | BERT g2pW ONNX + WordPiece | désambiguïsation des polyphones OK |
| `thai` | vrai TLTK non modifié sous Pyodide/WASM | 7/7 identiques (1er appel lent, suite rapide) |
| `japanese` | lindera-wasm + UniDic + moteur de mores TS | segmentation exacte, **pas d'accent lexical** |

阿拉伯语自动加元音符号(tashkeel,可关)。目录里 509 个 espeak 声音走高速桥,异域的走专用引擎。测试套件 71 个测试,卡住的地方都写明了(日语重音,UniDic 没给数据,认了,没藏着)。

### 格式和流式

默认 `wav`,`raw` PCM,`mp3`,`ogg`,`opus`:有 ffmpeg 就用,没有就纯 JS fallback(mp3 用 lamejs,opus 用 opusscript 加 Ogg muxer,和源的相关性 0.993)。关键是 `synthesizeChunks()`:按句子 yield 的异步生成器,句间加 `sentenceSilence`。对 Luna 来说,尾巴还在合成,前面已经开始放了,不用专用服务器的 TTS 流式。

完整用法,带 PiperHub 目录集成(`hub:` 加作者仓库挂掉时的自动镜像 fallback):

```ts
const tts = await PiperNativeTTS.load({
  model: "hub:glados-french-medium-voice",
  modelsDir: "./models",
});

const r = await tts.synthesize("Bonjour, je suis GLaDOS.", {
  outputFormat: "ogg",   // 直接给 Discord 用
  lengthScale: 0.95,     // 稍微快一点
});
```

社区声音(GLaDOS 和游戏角色)不在官方 manifest 里,这正是 PiperHub 存在的原因,`pipertts` 也懂:`hub:<slug>`、piperhub 页面 URL、裸 slug,都行。标 `usable: false` 的声音会给明确错误拒绝掉。

## 牺牲掉的东西

每个缺的功能都在供养另一个功能。诚实清单:

**Piper 在 ElevenLabs 旁边听起来像机器人。** 22050 Hz 的 VITS medium,干净但比起大表现力模型还是平。多情感补了一部分(7 种风格比 1 种平板强),但 ElevenLabs v3 的有声书还是更高。这是几十 MB 的代价。

**espeak 会读错。** 专有名词、外来词、缩写:规则音素化有死角。法语里的“Spoiler”,espeak 只能按它理解的读。神经 G2P 的大模型错得少。生产环境得给业务词准备例外词典。

**原生克隆为零。** Piper 只会用固定声音读。想要你自己的声音,去 PocketTTS 或 ElevenLabs。多 speaker 给的是变化,不是你的音色。

**日语还是没有词汇重音。** UniDic 不给重音数据,所以切分准,语调近似。README 里写明了,没藏东西。

**泰语第一次调用慢。** TLTK 跑在未改 Pyodide/WASM 里:第一次加载要几秒,后面快。和参考版 7/7 一致,但要预留 warm-up。

**数据很饿。** 一个像样的 high 声音要几小时干净对齐的音频。Fortune dataset 是几小时录音加清洗。零魔法:进来垃圾,出去机器人。

**目录里有死声音。** 25 个模型标了 `usable: false`。认了,也过滤了,但这提醒我们,声音众包,也是弃坑众包。

## 最终结果

一边是 ElevenLabs 的计表,一边是树莓派:

- PiperHub:展示 536 模型,71 语言,3755 speaker,130 个关联 dataset,dataset 到 training 到 usage 的指南
- Piper:VITS 端到端,espeak,ONNX CPU,LJSpeech,low 和 medium 和 high,标准 22050 Hz
- Fortune multi:法语 7 情感加英语 7 情感,各 1 个 ONNX,切换用 `speakerId`,许可证“Fortune's Café”
- Kokoro 82M:付费级英语品质,Apache 2.0,54 个声音,CPU 接近实时
- PocketTTS:CPU 克隆,约 100M 到 2-18M,WER 0.92%
- sanoTTS:0.29M,2 MB,单片机,质量跟着体积走
- ElevenLabs:1000 字符 0.05-0.10 美元,70 多种语言,顶级品质,计表在转
- 原生 pipertts:wrapper 约 2.2 秒每行对约 0.22 秒每行,espeak 桥 0.4ms,7 种 phoneme_type,wav 和 raw 和 mp3 和 ogg 和 opus,按句流式

Luna 每天就用这个说话。TTS 0 欧元,大脑控制情感,直接给 Discord 的 OGG。和 ElevenLabs 比当然听得出来。但凌晨 3 点她决定讲人生时,我的账单睡得很安稳。

## 哲学

p2r3 说过:*“我就喜欢那种感觉,1 块钱的小芯片能跑起 Minecraft 这么高级的东西。”*

声音上也一样:我就喜欢几十 MB ONNX 让树莓派讲 71 种语言,不用云,不用账号,不用计表。当然替代不了配音棚。替代的是那种烦人的场景:想要一个凑合、本地、免费的声音,半夜说话还不收费。

tradeoff,白纸黑字:
- 付费品质换小 VITS:有点机械感,但本地免费
- 每种情感一个模型换 speakerId:一份 RAM 的价钱得 7 个声音
- Python spawn 换常驻 session:快 10 倍,零 Python 安装
- 野生目录换出处关联:每个声音都知道从哪来,还能不能用
- 收费 API 换边际 0 欧元:没 ElevenLabs 好听,但账单睡得安稳

**记住三件事:**

1. **Piper 就是 CPU 的 TTS**。VITS 加 espeak 加 ONNX,71 种语言,跑在 Pi 上的几十 MB 声音。没 ElevenLabs 好听,但便宜无数倍。
2. **Fortune multi 是一个的价钱得 7 种情感**。一个 ONNX,切换用 `speakerId`,法语加英语。用 speaker embedding 代替 7 个模型。
3. **原生杀掉了 spawn**。`pipertts` 把 ONNX session 保温:2.2 秒每行对 0.22 秒,espeak CLI 15ms 对桥 0.4ms。同样推理,少 10 倍等待。

感兴趣的话,目录在 [piperhub.org](https://piperhub.org/),网站代码在 [github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank),原生模块在 [github.com/itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts)。想听 Luna 凌晨 3 点讲人生,来 Discord 吧 xD
