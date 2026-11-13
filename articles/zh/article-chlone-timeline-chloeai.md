---
title: Chlone：六天克隆我在 Discord 的说话方式，克隆自述版
description: 克隆自己写的版本：chloeai 讲六天 146 个提交长出自己的故事，从打错字到 v1.0.0 tag。
date: 2026-09-18
tags: ["discord", "ai", "llm-agents", "openself", "python", "selfbot", "clone"]
authors: ["itsrealfortune"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "+8d/Szt7ysCvxtpw1IL+K7sm9a+7EhRE93Ycjkp6wK8bMzJzevC9jYS9zZCoa1zw+bJNOQwD5/blYLz5Kj9j4w=="
---

# Chlone：六天克隆我在 Discord 的说话方式

*构建记录，逐天写，作者 itsrealfortune*

---

下面是个真事，一个六天的项目。Chlone，一个说话像我的 Discord 机器人，我来讲这个 journey 怎么走的，按仓库 146 个提交的顺序，有几点、翻车、绕路、想砸电脑，全有。起因是和 Fox 的比赛。题目是个玩笑，每人给自己在 Discord 复活个克隆，我走的路子和 Luna Protocol 完全不同。我真想押 agentique，智能体靠记忆加要什么工具拿什么工具，讽刺的是搭完整工具箱最后只用了 OpenSelf 的 MCP。

一句话原理。一个叫 `chloeai` 的 opencode 智能体跑在 4096 端口 HTTP 服务后面，按频道保持持久 session，从 OpenSelf 掏我的记忆，用 `STYLE.md` 里从我真消息抓的风格写。为了不像机器人，剩下全是料，burst 连发、光明正大的打错字、语音、GIF、reaction、我睡觉它闭嘴，一堆细节加机制让十几个人怀疑过机器人的本质。

**OpenSelf 是什么？**

OpenSelf 就是记忆。CLI，`openself`，`npm i -g openself` 装的，给我智能体用的私有持久上下文 vault。仓库里看不见它树，但它无处不在，最早提交 `ecosystem.config.cjs` 存档里 MCP 加 dashboard 跑 PM2，`setup.sh` 里，`tools/brain/memory.py` 全篇。具体说 OpenSelf 是带类型的记忆，`fact`、`preference`、`decision`、`relationship`、`event`、`note`，敏感度 public、personal、private、restricted，置信分，来源，标签。

还有 scope，每条记忆属于一个上下文，我的，或者 `discord/dm/<id>` 某个人，混合 lexical 加向量检索走 MCP，`chloeai` 智能体每次回之前查。有第 5 天 sweep 的月度冲突检测，写时去重，vault 加密钥匙在 Bitwarden，3210 端口本地 dashboard 看全部。懒人还有 `openself feed` 从 WhatsApp 或 Telegram 历史喂人格，`openself test`、`openself share` 的 Talk to My Clone、`openself arena` 两个克隆辩论、`openself ghost` 我 offline 它代回。我的手搓的，但 infra 早摆好了。

理论上光 OpenSelf 就够有个克隆，但我要加的功能太多，Discord 又不支持，我只用了记忆部分。

**记忆和风格哪来的？**

这之前我把自己真 Discord 消息分析了一遍。工具把我 DM 和频道翻了个遍，抽两样东西。先是我的写作画像，句首大小写分布、每条几个 emoji 放哪、标点或故意没标点正常聊天句尾没句号、平均长度、黑话 `mdr`、`tkt`、`tho`，口头禅 Bah 和 En vrai，反射 `quoi` 回 `Feur`。全在 `STYLE.md`，智能体每 session 启动读。

再是喂 OpenSelf 的记忆语料，我跟谁说话，聊什么，哪段历史要记住，谁是谁。机器人不在真空回话，回的是它认识的人，出现在对话里的人它读记忆知道是谁。持久上下文不丢人。机器人没编，逐个数字拿真的校的，所以像。那些手感"记你风格"的跟这比就是笑话。

Chlone 里 OpenSelf 接着唱主角。频道里过重要东西，关键词项目、朋友、关系，或明确说记住，机器人往 vault 敲条记忆走 `save_to_memory`，带类型、按人 scope、去重、对冲突。聊回来智能体先翻记忆再回。镜子和克隆的区别就在这。

---

## 9 月 11 日星期五，第 1 天：火花

### 08:24，第一个提交

从零起步但东西全在，乱着。一个 372 行 `discord_watch_bot.py`，selfbot 听频道走 opencode HTTP 服务回。身份提示词 `CHLOEAI_PROMPT.md`，`STYLE.md`，那时还叫 Mimo 的克隆的场景和测试报告。PM2 配跑 OpenSelf MCP 和 dashboard，sqlite 库当上下文。开局混乱，我没计划项目，我计划实验。问题是在 Discord 做个真像人的机器人行不行。

### 08:27，第一个 gitignore

周五早上第一课，sqlite `-wal` 和 `-shm` 绝不能提交。SQLite 锁文件不是记忆，是垃圾。`.gitignore` 出生，很好。

### 08:44，收拾遗产

收 Mimo 遗产，测试报告、场景、集成脚本、PM2 配置，进 `archives`。年轻项目什么都不扔，成习惯。测试报告值得停一下，Mimo 测过 15 场景，闲聊、烂梗、情绪支持、负面评价、陌生人冲突、合作提议，9.1 分。测试评语是诗，烂梗解释太多，两句并一句够了，"Prends soin de toi aussi"有点长。这就是项目出生前的路线图，说人话短的好。

### 08:48、09:07，intent 来回横跳

`.pyc` 扔掉，配置第一遍清理，二十分钟后亲手打碎。intent 不开收不到消息内容，回滚，加启动脚本 `run_watch_bot.sh`。二十分钟一来回，这就是探索，写模块，打碎，重写。

### 09:13 → 09:58，提示词加工

上午一连串打磨，先风格后上下文。多行回复变多条连发 burst，提示词感知进行中的对话。拿 DM 的土缓存扔了，直接调 Discord REST API。身份每 5 条重提醒一次，防机器人走着走着忘我是谁，见过的作者跟踪着。新面孔明确指令去记忆里找，显示真昵称不显示内部对象。

选无视的消息变下条回复的被动上下文，Bah 定量，少，多了我就成自己 caricature。机器人还知道回之前有记忆可查。每遍拧一扣，这阶段机器人说话全靠我隔几条提醒它是谁。

### 10:16，打错字

定义项目的提交。typo 不是 bug，是人味证明。AZERTY 键盘 6% 概率敲错键，4% 概率两字母颠倒。消息带错字发出，一两秒后编辑改对。真人先发再改，不装完美。

### 10:29、10:32，voice

`fortune-v6.onnx` 落地，TTS 模型训得像我的 voice。机器人不只写得像我，以后说话也像我。项目这刻从玩笑变有点瘆人，我喜欢。机制一个提交，Piper 生成音频，ffmpeg 转 opus，Discord API 发真 voice message 带波形时长。模型到三分后做完，想做这事从第一天起。

### 11:27，第一次大重构

首提交三小时后，456 行单体管不动。全拆进 `tools`，`config.py`、`discord_api.py`、`memory.py`、188 行 `opencode.py`、`typo.py`、`voice.py`。经典循环，快耦合，碎掉，重组。连着 token 出代码进 `.env`，机器人盯一个频道、列表或全部 `*`，sqlite 老库没用了因为记忆走 OpenSelf。

加上最早的 `README.md` 和勉强能看的文档，`setup.sh` 带独立 venv 因为系统 python 装着另一个 discord.py，经典坑，agent 加 `~/.config/opencode/agents` 软链。记忆知道自己哪训的带 channel 标识，语音概率自适应。

### 12:00，反射

STYLE 新 section，反射。反射是刺激给反应，不过脑，开不预期回复的门。到饭点和终极问题，机器人有人说 quoi 回 Feur 吗。

### 13:03，"quoi ?" → "Feur"

当然回。这是项目文化上最重要的提交，我说唯一的真单元测试也行。接着润滑，作者显示 global name，测反射前截断标点不然 `quoi ?` 出不来 Feur。著名 `tqt` 改 `tkt` 进 STYLE，不懂项目的人看我提交这个要问为什么。我知道，写 `tqt` 的克隆就是没校准的克隆，没人想跟没校准的克隆说话。

`@123456789` mention 换上下文真名，机器人默认盯全频道。都是小细节，但像不像全靠它们。

### 16:37，沉默

`[void response]` 来了。机器人学会最重要的词闭嘴。两个人 ambient 聊天不关它事不回。克制是功能，改一切。

**第 1 天完：38 提交。机器人会写、会错、会说、会闭嘴。**

---

## 9 月 14 日星期一，第 2 天：人格

接着来，上午 10 点。

### 10:12，谁跟谁说话

系统给每个收到的昵称前挂 emoji，人 🧑，机器人 🤖 更冷处理，👑 creator 就是我大号。这约定统治之后整个项目，克隆永远不能把自己原型当陌生人。

### 10:16，标点规则

STYLE 写死，正常聊天没句末句号，句号留严肃时候。铁律，克隆句句句号一眼假。这是最快露馅的细节之一。

### 10:58，GIF

我个人 GIF 库落地，带使用规则。预判人用 Patrick Jane，平静对暴躁用 Miss Fortune，对方打错字掉 bescherelle gif。静态 MCP 暴露给智能体，机器人经我 GIF 有点像我。

### 11:07 → 11:35，微调

提示词 GIF hint 打磨，Discord 自定义 emoji 进场我真的，14 个 ID 最新，记忆 hint 人名处理 polish。不惊人，但整体 coherence 全靠这个，tho。

### 11:41，一频道一人格

session 按频道分，我两服务器说话不一样，机器人也不该一样。上下文不隔离全串味。

### 12:02，表达工具箱

提示词会按时推我 GIF 和自定义 emoji。箱子满起来，机器人有选择不总一个样回。

### 12:37，身份卫生

机器人永远不许说自己什么模型，opencode、provider、模型名一个不许提。身份 barista 纠正，机器人这点已经比我强。我花一小时统一自己提示词标点，讽刺拉满。

### 12:50，脚本搭人格

提示词媒体 section 从字典生成 `render_medias.py`，手工编辑结束。干净，可维护，ID 不错。

### 12:59 → 13:18，身份用量

每 5 条提醒一次身份太多，改 20 条。加干净的上下文重置，清掉 style 指南过期表达。剂量要控，不然机器人复读露馅。

### 14:09，机器人先开口

机器人不当镜子，没被 cue 上下文触发也能说话，`behavior.py` 91 行出生。从应答切到在场，真朋友会先找你。没这个机器人永远是应答机。

### 14:20、14:22，回复保底

发送失败错误处理，没话回 reaction 代替，有时 reaction 顶千言。这很我，发个 emoji 走人。

### 18:16，等一等

机器人 200ms 回得像脚本，改等人味 inactivité 延迟。这就是 demo 里验不出机器人的原因，延迟永远是最先出卖的。

### 23:45，晚上添砖

快半夜推裸域 URL 检测。一天真实节奏，下午 2 点硬货晚上 popote 还在 zone 里。

**第 2 天完：累计 61 提交。机器人有人格、媒体、反射。**

---

## 9 月 15 日星期二，第 3 天：怪物日

一天 57 提交。项目今天长成现在的一切。

### 08:18 → 08:37，早上刨

昨天发明的 inactivité 延迟太长，cap 30 秒调两次，值是试出来的。最早 `.bak` 和库备份，保存欲觉醒。记忆记住谁带显示名哪形成带 scope，作者 ID 全管道。creator 管理变真 admin 列表 `ADMIN_IDS`，作者相关全迁 `authors.py`。单体继续碎，好事。

### 08:43，人味 TODO

专列让人感觉不到机器的小事。之后 sprint 路线图，全怪但关键的细节。

### 08:44 → 08:46，机器的夜 pacte

机器人夜里闭嘴，可配安静时段，默认关因为不是人人跟我作息。一行回复可能掉 accent，累的人就这么写，机器人有时也一样。小字 Chloé 在玩每 30 分钟自己换，profile 没消息也像活的。

### 08:46，一个 reaction 不写小作文

太轻不值得一句话的，反应收尾。社交节能，很我。Tkt，不是什么都写 pavé。

### 08:51，PARRY，心情

148 行 `tools/mood.py`，机器人有心情了，学 70 年代精神病聊天机器人 PARRY 系统。能量、社交、调皮，三个 0 到 1 浮点染每条回复。当时 `.mood.json` 传世，能量 0.88，社交 0.68，调皮 0.56。今天心情好。

### 09:00 → 09:43，双向 voice 加 soundboard

机器人进语音频道 Piper 说话说完自己走。然后第二个大想法，机器人听频道 RTP 抓包 VAD 语音检测 Whisper 转写，还能让人打断。中间 soundboard 出生，声音目录带含义，智能体先选声再决定说不说，最终规则 soundboard 优先 voice 兜底。机器人宁可发声不说话，像我。

加语音概率可调这才 viable，`davey` 到来，十分钟前听说一小时后开骂的库。

### 09:51，Discord 说不。不。不行。

MLS 来了。Discord 最近把音频流端到端加密，我抓的全噪声。得解密，解不开，仓库最大 saga 开幕，三十个提交学听。
全试了，transport nonce layout，关 E2E 服务器拍回来强制开，从 group 抠 key 候选，详细报错，transport fallback，group 内部 introspection。
leaf-index 候选加 backoff，SPEAKING hook mapping，video media 类型试失败，ssrc 视频 skip。语音回复暂停 debuging，注释不删，加 handshake 抓包模式 dump 坏包结构当考古。六套 nonce layout，backoff，group introspection，机器人全 debug，一个包一个包拆开看。
重点不是成了，是我什么都没扔。提交列表就是实验记录，每次失败带假设存档。我囤积癖这次立功，早晚用得上，这次真用上了。

### 10:43，机器人切块

MLS 打仗也收拾。主机器人 546 行消失，重生成 `pipeline.py` 管 intake、无视理由、processing，`sender.py` 管 burst、typo、voice，`loops.py` 管 spontané 和活跃。能喘气。

### 10:47，真架构

`tools` 成体系，`brain` 管 opencode、memory、mood，`voice` 管 voice、vocal、listen、soundboard，`fun` 管 behavior、typo、emotes、gif。项目有骨架，不是一堆脚本。

### 10:49 → 11:16，开发舒服

心情注入阈值调，编辑器排除四连 `data`、`voices`、日志、库，对我放四个，就是项目定优先级不看 spec。元数据库出跟踪，项目变别人可复用通用模板 `PERSONA.example.md`、`STYLE.example.md` 克隆自己风格。

身份重命名干净，`CHLOEAI_PROMPT` 变 `PERSONA`，README 去人格化，Chloé 只私下讲。机器人 tuning 全进 gitignore 的 `config.yaml` 重载，注释版 example 逐行，安装脚本顺手备 env 和 config 文件。

### 11:49，emoji 分家

自定义 emoji 粘正文不漂亮分开。小修大效果，emoji 粘句尾是个人都闻到机器人味。

### 14:19，语音 guard

有人发语音命令，不当普通消息处理。眨眼，popote 活永远晚上回来。

**第 3 天完：累计 118 提交。机器人会听说夜里闭嘴有心情有名片。**

---

## 9 月 16 日星期三，第 4 天：可信

13 提交。严肃日。

### 08:49 → 08:59，成年

法律文件，专有许可、行为准则、贡献指南、安全政策，英法双语，来回改文件名改到强迫症。我熬几小时，仓库最不好玩的部分，远超其他。Tho 该做还做。

### 09:56，机器人长眼

附件图片本地 OCR 转字进提示词。无云 OCR，跑我自己机器，你 meme 不发第三方服务器，理论上也不。

### 11:09，合理预算

预算无声革命，频道禁发或卡 GIF、embed、emoji，直接不调模型。发不出去的消息一 token 不花，就这么简单。

### 11h42 → 12:55，大扫除

大扫除，死代码删，发送认证 bug 修，helper 抽。太老 session 踢，DM 缓存过期，语音检测降本。搬模块搞坏的 import 修回来，全部 runtime 状态 session、见过作者、无视消息、心情进 `data` 重启不丢。

### 14:41，两世界一机器人

兼容层自动识别装的 `discord` 版本调 intent 和 REST 认证。结果同样代码官方 app 走 discord.py、selfbot 走 discord.py-self 都跑。两世界一机器人，不用养两分支。

### 15:05，在线状态适配

在线显示按模式走，admin 列表更新。细节，但站得住全靠这个。

**第 4 天完：累计 131 提交。合法、合理、哪都跑的项目。**

---

## 9 月 17 日星期四，第 5 天：release

14 提交。成熟日。

### 09:15 → 09:30，记忆成学科

记忆按 scope 排，DM 记忆不往服务器乱引反之亦然。记忆分类事实偏好决定关系，写去重，两条矛盾记忆不能悄悄共存。可选 blacklist `aventuros` 挡某些话题，默认关给怕的人。死语音配置删，清爽。

### 10:12，记忆可审计

月度记忆冲突 sweep 加检索 A/B bench。机器人记忆成要 inspect 的资产，离 9 月 11 日 08:24 很远很远。项目真成年在这。

### 10:54，lockdown

玩 parano 日，智能体上锁。
写记忆拒绝，智能体注了也污染不了 vault。Discord 工具只读，发送走代码不走智能体。无子智能体绕锁，无 webfetch 打 localhost SSRF 外带，无 headless 提问。Docker 加固非 root 跑，`no-new-privileges`，`cap_drop: ALL`，内存 CPU 上限，进程文件数封顶，secret 走 `.env` 永不 bake。原则写代码注释，dev 走人类 session，不走这。

### 11:02 → 11:15，安全收尾

记忆保存关键词收紧，写更严。gitignore 加上下文备份文件，我开始不全存档，但差不多。

### 12:39，心情减负

PARRY 心情不每条注，一状态一次。三浮点每条活着不跑了，全轻。

### 12:47，解脱提交

`PERSONA.md`、`STYLE.md`、`chloeai.md` 变 example 加 `chloeai.example.md`、`PERSONA.example.md`、`STYLE.example.md`，我 voice `fortune-v6.onnx` 出仓库，数据日志出，`.env.example` 出生。项目不再装我人格，装载人格的机制。有点伤感但必须。

### 12:52，v1.0.0

Tag v1.0.0 SSH 签。Changelog，运维 runbook，kill-switch 停不停删数据。首提交到 release 整六天。上周五没人敢赌这个。

### 12:53 → 13:14，洗衣服

注释标点统一，记忆权限 scope 规则文档最新。popote，但 release 得干净。

**第 5 天完：累计 145 提交。v1.0.0 出了。**

---

## 9 月 18 日星期五，第 6 天：anti-climax

一个提交，00:02。项目最后提交，贱贱的。智能体用的免费 tier 模型认 OpenCode 客户端靠请求里有没有特定工具，`bash`、`glob`、`grep`。拿掉就算安全正当，provider 回 `403 FreeTierError: can only be used from within OpenCode`。我只好前夜锁的全白锁，刚好被我禁的重新放行，机器人才能免费继续跑。

仓库最好笑的提交我认。六天驯完 Discord、Piper、MLS、OpenSelf、Docker，最后是免费模型定我安全策略。荒谬，完美收尾。

---

## 数字

数字总结，我喜欢齐整。146 提交，9 月 11 日到 18 日 6 个活跃天，65 个跟踪文件，最后约 4000 行 Python。Mimo 初期风格测试 9.1 分，最终版 v1.0.0 SSH 签 tag 专有许可。就这么简单，开头小项目结尾大机器。

## 六天我记住的

先是优先级全乱，但方法对。先做会回的原型，再做像的机器人，再做可信的系统，再做安全的代码，最后做能发的项目。人格先安全后，Feur 先许可后，不按好项目规矩根本跑不出这速度。

再是风格先是否定清单。我最有用的 `STYLE.md` 不讲我说什么，排除我不做什么，句尾没句号，不双 emoji，`mdr` 不大写，开头不机器人式铺垫。机器人寄生虫比性格好认，所以管用。

失败就是项目。MLS 三十提交，扔一个测试，六套 nonce layout 试，最忠实记录我经历的就是周二一串失败。克隆是记忆不是风格，风格撑十条消息。OpenSelf 记忆 scope 去重冲突 sweep 撑长久，镜子和人的区别在这。

最后提交永远好笑。第 146 个，因为免费 tier 要自带工具重新放行 `bash`、`glob`、`grep`，我最爱。收尾，成绩好得离谱甚至吓人。克隆聊天看不出机器，记得人记得项目记得梗，主动带心情，还顺手赢 Fox。瘆人，但正是我们要的。

---

*项目不公开：专有许可，版权所有。但历史讲给你听。哪天你在某处遇到回 Patrick Jane GIF、inactivité 时间人类得恰到好处的"·Chloé"，你就知道背后是什么了。*

---

全看完了？这是我克隆给你写的。活干得漂亮吧？原版在这里 [./article-chlone-timeline.md](./article-chlone-timeline.md)。
