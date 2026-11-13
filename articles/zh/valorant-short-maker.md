---
title: valorant-short-maker：全自动生产 Valorant 短视频的流水线
description: Groq/Llama 写脚本，Piper 配音，FFmpeg 包办其余一切。一个 cron 任务每天在 @valorant_agents 上生产发布一条视频，从头到尾。
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "Rd0Rkyu5k8f2fZv0JDW27TDJ9/YH3XIqIRE6aE3uSGTbWpr/Q4AIpSIeIpKRStX3YrE7RswOTFxxkWtsDM7blA=="
---

# valorant-short-maker：全自动生产 Valorant 短视频的流水线

有几个月，一个 YouTube 频道在无人值守地转：[@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)。Valorant 特工两回合之间互呛，配音，卡拉 OK 字幕，发 Shorts。全由 [`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker) 生成，TypeScript/Bun 流水线跑 cron，没人点一下就发布了。

下面按步骤拆它怎么工作的。

## 长什么样

"Duelist Debate"那期（Phoenix、Yoru、Jett）生成的三帧：

![short 开场，特工圆头像加场景标题](/images/valorant-short-maker/vsm-01-intro.png)

![一句台词，卡拉 OK 字幕逐字点亮](/images/valorant-short-maker/vsm-02-dialogue.png)

![另一句台词，字幕颜色随特工变](/images/valorant-short-maker/vsm-03-dialogue.png)

成片在这条 Short：[Duelist Debate -- youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU)。频道 Shorts 大概 1.2 到 1.5k 播放。不大，但这是从 cron 启动就没人管过的频道，所以真正重要的数字是零，启动后花零分钟。

## 流水线，按顺序

### 1. 写脚本，Groq + Llama 3.3

每次运行从 26 个特工里随机抽 3 到 4 个，发给 Llama 3.3 70B（走 Groq），系统提示词里带每个出场特工的精简 persona 和相互关系（persona 在 `src/lore/`，一特工一文件）。提示词定死规则：每句短而狠、人物轮流讲、幽默优先，最重要的是停顿。

"Duelist Debate"实例，Phoenix、Yoru、Jett 争谁打决斗，2026 年 7 月 6 日生成：

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

停顿是节奏自然的关键细节：句中 `[0.3]` 在音频里造 0.3 秒静音，屏幕上特工圆圈不消失；单独一行 `pause: 1.0` 是两个说话人之间的真停顿，圆圈隐藏。没有这个，连珠炮的 TTS 听着就是机器人。

### 2. 配音，Piper，一特工一模型

每个特工有自己训的 Piper 模型（`.onnx`），存在 `voices/<agent>/`。文本丢进对应模型，出 WAV。这就是我训自定义 voice 那套流水线（见 Piper/Kaggle 那篇），这里直接上生产，每次生成视频现跑。

### 3. 卡拉 OK 字幕，生成的 ASS，颜色从图标取

字幕不是简单 `.srt`。是逐词生成的 `.ass`（Advanced SubStation Alpha）文件，卡拉 OK 特效：说到的词按颜色点亮，其余保持中性色。点亮色不是写死的，从说话特工的图标动态取（Python 脚本调 PIL 读 PNG 图标，采样非透明像素，返回主色）。结果：Killjoy 的字幕紫里点亮，Jett 的蓝绿点亮，没有一个颜色是手写死的。

### 4. 音频反应圆圈，一帧一个 FFmpeg 表达式

流水线最绕、我也最得意的部分。说话特工的圆形头像不是静止的：跟着自己 voice 的能量轻微缩放。

计算是读这句的 WAV 原始数据，按 60 fps 逐帧算 RMS 包络（root mean square，信号能量度量），按最大归一，再 3 帧窗口平滑去抖。每个包络值转成 `MAX_ZOOM_VARIATION`（0.2，基准尺寸上下 20%）框住的缩放系数。

计算结果不经过像素代码，直接翻译成巨型条件 FFmpeg 表达式（`lt(n,K)*val + between(n,K,K')*val + ...`，一组帧一个分支），直接驱动视频滤镜的 `scale` 参数。FFmpeg 渲染时每帧求这个表达式。一句几秒的台词 60 fps，轻松几百个分支，所以有 `STEP` 参数按组压深度。

### 5. 分段渲染，开场加鱼眼

每句单独渲染：背景视频（`bg-video/` 里随机抽段 gameplay，按时长切）、特工圆圈叠上加音频反应缩放、FFmpeg `ass` 滤镜烧字幕、TTS 音频和背景 gameplay 声混音。

第一段特殊处理：前 20% 帧渐消的鱼眼畸变（`lenscorrection` 滤镜逐帧求值，加 `tmix=frames=3` 混相邻帧模拟动态模糊），配"whoosh"音效同步。这是开场转场，让镜头有"扎进"场景的感觉。

### 6. 拼接与终混

全部段首尾拼起来，背景音乐（Sneaky Snitch，Kevin MacLeod，CC 许可）用**闪避**混进去，sidechain 压缩，特工一开口音乐自动压低，停顿回升。全程 60 fps，中间没有任何帧率转换。

### 7. 自动发布

`run-cron.sh` 被经典 cron 拉起，激活 Python 环境，加载 `.env`，跑 `bun src/workflow.ts --upload`。`--upload`  flag 触发元数据生成（标题、描述、标签），再调 `uploaders/upload.py`，经两个独立脚本（`uploaders/youtube/upload.py` 管 YouTube、`uploaders/instagram/` 管 IG）把视频发出去。从 LLM 提示词到视频上线，全程无人。

## 为什么 TypeScript/Bun，而不全 Python

不是意识形态，是 Bun 给 `Bun.spawn` 起 FFmpeg 子进程又快又直接，流水线数据结构（`Phrase`、`SegmentInfo`）有强类型，cron 每 X 小时跑一次的话 Node 启动还更快。项目里仅有的两块 Python 在 Python 真有优势的地方：PIL 取颜色，上传 API（YouTube 的 `google-api-python-client`、IG 的 Graph API 栈）。

## 它说明了什么

这个项目很好地说明今天用全免费或开源砖头能搭出什么：Groq 上又快又免费的 LLM，本地跑不用独显的 TTS 引擎，FFmpeg 包办全部视频渲染，粘合只用了几百行 TypeScript。没有一块砖是新的。流水线全在编排：按人物关系生成连贯剧本，带自然停顿转成有表现力的音频，按音频能量逐帧同步渲染画面，整条链自动走到发布。

---

**资源**

- **仓库**：[github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **频道**：[@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**三句话总结**

1. 脚本由 LLM（Groq/Llama 3.3）按特工 persona 和关系生成，不是预写的笑话列表。
2. 特工圆圈的缩放由 FFmpeg 表达式驱动，按 WAV 的 RMS 包络逐帧算出，不是经典关键帧动画。
3. 整条链从提示词到 YouTube/Instagram 发帖，一个 cron 任务无人值守跑完。
