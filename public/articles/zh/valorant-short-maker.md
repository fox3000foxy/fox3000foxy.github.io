---
title: "valorant-short-maker：自动生成我 Valorant Shorts 的流水线"
description: "Groq/Llama 写剧本，Piper 配音，FFmpeg 搞定其余一切。一个 cron job 如何每天从零到一在 @valorant_agents 上生产并发布一条视频。"
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "tmwOEgigCWT1us24WW0KE27oHw11kiwRO0QqsiLNRG+DbllrhZoLImKN1501ckM9UTCukiYI/OxkGsVRbhhXAg=="
---

# valorant-short-maker：自动生成我 Valorant Shorts 的流水线

几个月来，一个 YouTube 频道一直在我不插手的情况下自己运转：[@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)。Valorant 特工们在两局之间互怼，有配音，有卡拉OK字幕，以 Shorts 形式发布。一切都是 [`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker) 生成的----一个 TypeScript/Bun 流水线，通过 cron 定时运行，无需任何人点击任何东西就能发布。

下面一步步拆解它是怎么运作的。

## 效果展示

从"Duelist Debate"（Phoenix、Yoru 和 Jett）生成的视频中截取的三帧：

![Shorts 开场，特工圆形图标和场景标题](/images/valorant-short-maker/vsm-01-intro.png)

![一句台词进行中，卡拉OK字幕亮起](/images/valorant-short-maker/vsm-02-dialogue.png)

![另一句台词，字幕颜色随说话的特工变化](/images/valorant-short-maker/vsm-03-dialogue.png)

这个 Short 的成品：[Duelist Debate -- youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU)。频道上每个 Short 大约 1.2 到 1.5k 播放量。不算大，但这是一个从一开始就完全自主运转的频道，真正重要的数字是零----cron job 启动后就再也没花过一分钟在上面。

## 流水线，按顺序

### 1. 写剧本----Groq + Llama 3.3

每次运行会从 26 个可选特工中随机选 3 到 4 个，然后向 Llama 3.3 70B（通过 Groq）发送一个系统提示词，提示词中包含每位入选特工的个性简述以及他们与场景中其他特工的关系（这些人设存在于 `src/lore/` 目录下，每个特工一个文件）。提示词强制约束：每句台词短小有力，角色间公平轮换，幽默优先，最重要的是----停顿。

以"Duelist Debate"为例----Phoenix、Yoru 和 Jett 争论谁该玩决斗者，生成于 2026 年 7 月 6 日：

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

停顿是让节奏自然的细节：台词中间插入的 `[0.3]` 会在音频中产生 0.3 秒的静音，而不会打断屏幕上特工的圆形图标；而独立的 `pause: 1.0` 行则会在两个说话者之间产生真正的静音，图标隐藏。没有这些，TTS 连珠炮似的朗读会听上去像机器人。

### 2. 配音----Piper，每个特工一个模型

每个特工都有自己专门训练的 Piper 模型（`.onnx`），存储在 `voices/<agent>/` 下。生成的文本通过对应模型，输出 WAV 音频。这就是我一般用来训练自定义语音的技术（见 Piper/Kaggle 流水线文章）----这里直接应用在生产环境，实时生成，每次生成视频都会用到。

### 3. 卡拉OK字幕----动态生成 ASS，从图标提取颜色

字幕不是简单的 `.srt`。它是一个逐词生成的 `.ass`（Advanced SubStation Alpha）文件，带有卡拉OK效果：每个词在朗读时以某种颜色高亮，其余文本保持中性色。高亮颜色不是固定的----它是从说话特工的图标中动态提取的（Python 脚本用 PIL 读取图标的 PNG，采样非透明像素，返回主色调）。结果：Killjoy 的字幕亮起紫色，Jett 的字幕亮起青蓝色，没有任何颜色被硬编码。

### 4. 音频响应式圆圈----每帧一个 FFmpeg 表达式

这是流水线中最棘手的部分，可能也是我最引以为豪的部分。说话特工的圆形图标不是静止的：它会随着自己声音的节奏微微缩放。

计算过程是读取台词的原始 WAV，逐帧（60 fps）计算 RMS 包络（均方根，信号能量的度量），按最大值归一化，然后在 3 帧窗口上平滑以避免抖动。每个包络值随后被转换为一个缩放因子，受 `MAX_ZOOM_VARIATION` 约束（0.2，即基准大小的 ±20%）。

计算结果不是通过操作像素的代码来应用的----它被翻译成一个巨大的 FFmpeg 条件表达式（`lt(n,K)*val + between(n,K,K')*val + ...`，每组帧一个分支），直接驱动视频滤镜的 `scale` 参数。FFmpeg 在渲染的每一帧上计算这个表达式。对于 60 fps 下几秒钟的台词，一个表达式里很快就有了数百个分支----因此有了 `STEP` 参数来将帧分组以限制深度。

### 5. 逐段渲染，开场加鱼眼效果

每句台词单独渲染：视频背景（从 `bg-video/` 中随机选一段游戏画面剪辑，裁剪到合适时长），上面叠加带有音频响应式缩放的特工圆圈，通过 FFmpeg 的 `ass` 滤镜烧录字幕，TTS 音频与背景游戏声音混合。

第一个片段有特殊处理：鱼眼畸变在前 20% 的帧中逐渐消退（每帧计算的 `lenscorrection` 滤镜，外加 `tmix=frames=3` 混合相邻帧来模拟运动模糊），与"嗖"声效果同步。这就是让镜头"进入"场景的开场过渡。

### 6. 拼接和最终混音

所有片段首尾拼接，背景音乐（Sneaky Snitch，Kevin MacLeod，Creative Commons 许可）通过**音频闪避**混入----侧链压缩在特工说话时自动降低音乐音量，在静音时回升。整个流程从头到尾都是 60 fps，步骤间没有帧率转换。

### 7. 自动发布

`run-cron.sh` 脚本由标准 cron 任务启动，激活 Python 环境，加载 `.env`，运行 `bun src/workflow.ts --upload`。`--upload` 标志还触发元数据生成（标题、描述、标签），并调用 `uploaders/upload.py`，通过两个独立的脚本（`uploaders/youtube/upload.py` 和 `uploaders/instagram/`）将视频发布到 YouTube 和 Instagram。整条链路，从 LLM 提示词到视频上线，完全无需人工干预。

## 为什么用 TypeScript/Bun 而不是全 Python

这个选择不是意识形态----而是因为 Bun 能通过 `Bun.spawn` 直接快速地驱动 FFmpeg 作为子进程，为流水线的数据结构（`Phrase`、`SegmentInfo`）提供强类型，并且启动速度比 Node 快得多，对于每隔几小时通过 cron 运行的脚本来说很重要。项目中仅有的两处 Python 代码恰恰是 Python 最擅长的地方：PIL 用于颜色提取，以及上传 API（YouTube 用 `google-api-python-client`，IG 用 Instagram Graph API 栈）。

## 这说明了什么

这个项目是一个很好的例子，展示了如今只用完全免费或开源的组件能搭建出什么：通过 Groq API 接入快速免费的 LLM，无需专用 GPU 的本地 TTS 引擎，FFmpeg 搞定所有视频渲染----而粘合剂只是几百行 TypeScript。这些组件单独来看都不是新东西。让流水线成立的是编排：生成一个包含真实角色关系的一致剧本，将其转化为带有自然停顿的表现力音频，逐帧将视觉渲染同步到该音频的能量上，并自动化整条链路直到发布。

---

**资源**

- **仓库**：[github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **频道**：[@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**3 个关键点**

1. 剧本由 LLM（Groq/Llama 3.3）基于每个特工的人设和关系生成，不是简单的预写笑话语录。
2. 特工圆圈的缩放由从 WAV RMS 包络逐帧计算的 FFmpeg 表达式驱动----不是传统的关键帧动画。
3. 整条链路，从提示词到 YouTube/Instagram 发布，通过一个 cron job 运行，零人工干预。
