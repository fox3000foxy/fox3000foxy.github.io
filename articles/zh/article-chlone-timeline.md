---
title: Chlone：六天克隆我在 Discord 的说话方式
description: 构建记录，逐天写：opencode 智能体 chloeai 接 OpenSelf 记忆，六天 146 提交学会在 Discord 像我说话。
date: 2026-09-18
tags: ["discord", "ai", "llm-agents", "openself", "python", "selfbot", "clone"]
authors: ["itsrealfortune"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "rXtHUCdi0NImcnU2np0iCPFZP7DKBjNI1qBCcjurydViNsD6F0LcK2IZeU6E2A+6UDw/OYxkujGYNfpeZjlbBg=="
---

# Chlone：六天克隆我在 Discord 的说话方式

*构建记录，逐天写，作者 itsrealfortune*

---

下面是个真事，一个六天的项目：**Chlone**，一个说话像我的 Discord 机器人。我按仓库 146 个提交的顺序讲 journey，有几点、翻车、绕路、想砸电脑，但不灌你提交信息。

起因是和 **Fox 的比赛**。题目是个玩笑：每人给自己在 Discord 复活个克隆。我走的路子和 **Luna Protocol** 完全不同：我想押 agentique，智能体靠记忆加 AI 能用的全套工具。讽刺的是搭完整工具箱最后只用了 OpenSelf MCP。

一句话原理：[opencode](https://opencode.ai) 智能体 `chloeai` 跑在 HTTP 服务器后面（4096 端口），按频道保持持久 session，从 OpenSelf 掏我的记忆，用 `STYLE.md`（从我真消息抓的）风格写。为了不像机器人：burst 连发、光明正大的 typo、语音、GIF、reaction、我睡觉它闭嘴，一堆细节和机制让十几个人怀疑过机器人的本质。

**OpenSelf 是什么？**

OpenSelf 就是记忆。CLI（`openself`，`npm i -g openself` 装）给我 AI 智能体用的私有持久上下文 vault。仓库树里看不见它，但它无处不在：`ecosystem.config.cjs` 存档（OpenSelf MCP 和 dashboard 走 PM2 最早提交就跑）、`setup.sh`（`npm i -g openself`）、`tools/brain/memory.py` 全篇。

具体说，OpenSelf 是：

- **带类型的记忆**（`fact`、`preference`、`decision`、`relationship`、`event`、`note`），敏感度分 public / personal / private / restricted，置信分，来源，标签；
- **scope**：每条记忆属于一个上下文，我的，或 `discord/dm/<id>` 某个人；
- **混合检索**（lexical 加向量）走 MCP（`openself_openself_search_memory`、`openself_openself_get_context`），智能体 `chloeai` 每次回之前查；
- **冲突检测**（第 5 天的月度 sweep）加写时去重；
- **加密 vault**（钥匙在 Bitwarden）加**本地 dashboard**（3210 端口）看全部；
- 懒人专供：`openself feed` 从 WhatsApp/Telegram 历史喂人格，`openself test`，`openself share`（"Talk to My Clone"网页），`openself arena`（两克隆辩论），`openself ghost`（我 offline 它代回）。我的手搓的，但 infra 早摆好了。

理论上光 OpenSelf 就够有个克隆，但我要加的功能太多，Discord 又不支持，我只用了记忆部分。

**记忆和风格哪来的？**

这之前我把自己真 Discord 消息分析了一遍。工具把我 DM 和频道翻了个遍，抽两样东西：

1. **我的写作画像**，句首大小写分布、每条几个 emoji 放哪、标点（或故意没标点：正常聊天句子没句末句号）、平均长度、黑话（`mdr`、`tkt`、`tho`）、口头禅（"Bah"、"En vrai"）、`quoi` → `Feur` 这类反射。全在 `STYLE.md`，智能体每 session 启动读。
2. **喂 OpenSelf 的记忆语料**：我跟谁说话，聊什么，哪段历史要记住，谁是谁。机器人不在真空回话：回的是它"认识"的人。对话里出现的人它读记忆知道是谁。持久上下文不丢人，不忘人。

机器人没编：逐个数字拿真的校的。所以像，那些手感"记你风格"的跟这比就是笑话。

Chlone 里 OpenSelf 接着唱主角：频道过重要东西（关键词"项目"、"朋友"、"关系"，或明确说"记住……"），机器人往 vault 敲条记忆走 `save_to_memory`，带类型、按人 scope、去重、对冲突。聊回来智能体先翻记忆再回。这就是镜子和克隆的区别。

---

---

## 9 月 11 日星期五，第 1 天：火花

### 08:24，第一个提交

从零起步但东西全在，乱着。一个 372 行 `discord_watch_bot.py`，selfbot 听频道走 opencode HTTP 服务回。身份提示词 `CHLOEAI_PROMPT.md`。`STYLE.md`。那时还叫 **Mimo** 的克隆的场景和测试报告。PM2 配跑 OpenSelf MCP 和 dashboard。sqlite 库当上下文。

开局混乱。我没计划项目：我计划实验。在 Discord 做个真像人的机器人行吗？

### 08:27，第一个 gitignore

周五早上第一课：sqlite `-wal` / `-shm` 绝不提交。SQLite 锁文件不是记忆，是垃圾。`.gitignore` 出生。

### 08:44，收拾遗产

收 Mimo 遗产：测试报告、场景、集成脚本、PM2 配置。进 `archives/`。年轻项目什么都不扔。这成习惯。

测试报告值得停一下：Mimo 测过 **15 场景**（闲聊、烂梗、情绪支持、负面评价、陌生人冲突、合作提议……）**9.1/10**。测试评语是诗：*"烂梗解释太多"*、*"两句并一句够了"*、*""Prends soin de toi aussi"有点长"*。这就是项目出生前的路线图：**短 = 好**。

### 08:48、09:07，intent 来回横跳

`.pyc` 进垃圾，第一遍配置清理……二十分钟后亲手打碎：intent 不开收不到消息内容。回滚，加启动脚本（`run_watch_bot.sh`）。二十分钟一来回：这就是探索。写第一版，打碎，重写。

### 09:13 → 09:58，提示词加工

上午一连串打磨，先风格后上下文：

- 多行回复变多条连发（burst），提示词感知进行中的对话；
- 拿 DM 的土缓存扔了：直接调 Discord REST API；
- 身份每 5 条重提醒，防机器人走着走着忘我是谁；
- 见过的作者跟踪：新面孔明确指令去记忆里找；
- 显示真昵称不显示内部对象；
- 选无视的消息变下条回复的被动上下文；
- "Bah" 定量：少，多了我就成自己 caricature；
- 机器人知道回之前有记忆可查。

每遍拧一扣。这阶段机器人"说话"全靠我隔几条提醒它是谁。

### 10:16，打错字

定义项目的提交。typo 不是 bug：是**人味证明**。AZERTY 键盘 6% 概率敲错，4% 概率两字母颠倒。消息带错发出，**1-2 秒后编辑**改对。真人先发再改。

### 10:29、10:32，voice

`fortune-v6.onnx`：TTS 模型，训得像*我*的 voice。机器人不只写得像我，以后*说话*也像我。项目这刻从玩笑变有点瘆人。我喜欢。

机制一个提交：Piper 生成音频，ffmpeg 转 opus，Discord API 发真"voice message"带波形时长。模型到三分后做完。想做这事从第一天起。

### 11:27，第一次大重构

首提交三小时后，456 行单体管不动。全拆进 `tools/`：`config.py`、`discord_api.py`、`memory.py`、`opencode.py`（188 行）、`typo.py`、`voice.py`。经典循环：快耦合，碎掉，重组。

接着一连串：

- token 出代码进 `.env`；
- 机器人盯一个频道、列表、或全部（`*`）；
- sqlite 老库没用了：记忆走 OpenSelf；
- 最早的 `README.md`，勉强能看的文档；
- `setup.sh`：独立 venv（系统 python 装着另一个 discord.py，经典坑），agent 软链到 `~/.config/opencode/agents/`，装好能跑；
- 记忆知道*哪*训的（channel 标识），语音概率自适应。

### 12:00，反射

STYLE 新 section：反射。反射是刺激 → 反应，不过脑。 absurd 回复的门开了。

到饭点和终极问题：有人说 `quoi` 机器人回 `Feur` 吗？

### 13:03，"quoi ?" → "Feur"

回。当然回。这是项目文化上最重要的提交。我说唯一的真单元测试也行。

接着润滑：

- 作者显示 *global name*；
- 测反射前截断标点（不切 `quoi ?`，`Feur` 出不来）；
- 著名 `tqt` 改 `tkt` 进 STYLE，不懂项目的人看我提交这个要问为什么。我知道：写 `tqt` 的克隆就是没校准的克隆，没人想跟没校准的克隆说话；
- mention `@123456789` 换上下文真名；
- 机器人默认盯全频道。

### 16:37，沉默

`[void response]`。机器人学会最重要的词：**闭嘴**。两个人不关它事 ambient 聊天要沉默。克制是功能。

**第 1 天完：38 提交。机器人会写、会错、会说、会闭嘴。**

---

---

## 9 月 14 日星期一，第 2 天：人格

接着来，上午 10 点。

### 10:12，谁跟谁说话

系统给每个收到的昵称前挂 emoji：🧑 人，🤖 机器人（更冷处理），👑 **creator 就是我**大号。这约定统治之后整个项目：克隆永远不能把自己"原型"当陌生人。

### 10:16，标点规则

STYLE 写死：正常聊天句子没句末句号，句号留严肃时候。铁律。句句句号的克隆一眼假。

### 10:58，GIF

我个人 GIF 库加使用规则：预判人用 Patrick Jane，平静对暴躁用 Miss Fortune，对方打错字掉 bescherelle gif。静态 MCP 暴露给智能体。机器人经我 GIF 有点像我。

### 11:07 → 11:35，微调

提示词 GIF hint 打磨，Discord 自定义 emoji 进场（我真的，14 个 ID 最新），记忆 hint 人名处理 polish。

### 11:41，一频道一人格

session 变**按频道**：我两服务器说话不一样，机器人也不该一样。

### 12:02，表达工具箱

提示词会按时推我 GIF *和*自定义 emoji。箱子满起来。

### 12:37，身份卫生

- 机器人永远不许说自己什么模型，opencode、provider、模型名一个不许提；
- 身份"barista"纠正（机器人这点已经比我强）；
- 我花一小时统一自己提示词标点，讽刺拉满。

### 12:50，脚本搭人格

提示词媒体 section 从字典生成（`render_medias.py`），手工编辑结束。

### 12:59 → 13:18，身份用量

每 5 条提醒一次身份太多：改 20 条。加干净的上下文重置。style 指南 purge：过期表达清掉。

### 14:09，机器人先开口

机器人不当反射：**没被 cue** 上下文触发也能说话（`behavior.py` 出生，91 行）。从"应答"切到"在场"：真朋友会先找你。

### 14:20、14:22，回复保底

发送失败错误处理，没话回 reaction 代替，有时 reaction 顶千言。

### 18:16，等一等

机器人 200ms 回得像脚本。它等人味 inactivité 延迟，"等一等"。demo 里验不出机器人的原因：延迟永远是最先出卖别人的。

### 23:45，晚上添砖

快半夜推裸域 URL 检测。一天真实节奏：下午 2 点漂亮活，晚上 popote 还在 zone 里。

**第 2 天完：累计 61 提交。机器人有人格、媒体、反射。**

---

---

## 9 月 15 日星期二，第 3 天：怪物日

一天 57 提交。项目今天长成……现在的一切。

### 08:18 → 08:37，早上刨

- 在的延迟太长：cap 30 秒（调两次值，试出来的）；
- 最早 `.bak` 和库备份：保存欲觉醒；
- 记忆记住*谁*（显示名）*哪形成*（scope）；
- 作者 ID 全保存管道；
- "creator"管理变真 admin 列表（`ADMIN_IDS`），作者相关全迁 `authors.py`。单体继续碎。

### 08:43，人味 TODO

专列让人感觉不到机器的小事。之后 sprint 路线图。

### 08:44 → 08:46，机器的夜 pacte

- 机器人夜里闭嘴，可配安静时段（默认关，不是谁都跟我作息）；
- 一行回复可能掉 accent。累的人就这么写。机器人有时也一样；
- "Chloé 在玩……"小字每 30 分钟自己换，profile 没消息也像活的。

### 08:46，一个 reaction 不写小作文

太轻不值得一句话？reaction 够。社交节能，很我。

### 08:51，PARRY，心情

148 行 `tools/mood.py`。机器人有**心情**了，学 PARRY 系统（70 年代精神病聊天机器人，我公开学它）：能量、社交、调皮，三个 0 到 1 浮点染每条回复。当时 `.mood.json` 传世：能量 0.88，社交 0.68，调皮 0.56。今天心情好。

### 09:00 → 09:43，双向 voice 加 soundboard

- 机器人进**语音**频道，Piper 说话，说完自己走；
- 第二个大想法：机器人**听**频道（RTP 抓包，VAD 语音检测，Whisper 转写），还能让人打断；
- 中间 soundboard 出生：声音目录带含义，智能体**先选**声再决定说不说，最终规则"soundboard 优先 voice 兜底"，机器人宁可发声不说话。像我；
- 语音概率可调这才 viable；
- `davey` 到来，十分钟前听说一小时后开骂的库。

### 09:51，Discord 说不。不。不行。

**MLS**。Discord 最近把音频流端到端加密，我抓的全噪声。得解密，解不开。仓库最大 saga 开幕，三十个提交学听。

全试了：transport nonce layout，关 E2E（服务器拍回来强制开），从 group 抠 key 候选，详细报错，transport fallback，group 内部 introspection，leaf-index 候选加 backoff，SPEAKING hook mapping，video media 类型试（失败），ssrc 视频 skip……

调试时语音回复暂停（注释不删），加 handshake 抓包模式，dump 坏包结构当考古。六套 nonce layout。backoff。group introspection。机器人全 debug，一个包一个包拆开看里面。

重点不是成了，是**我什么都没扔**。提交列表就是实验记录：每次失败带假设存档。我"全存早晚 debug 用上"这次立功。

### 10:43，机器人切块

MLS 打仗也收拾。主机器人 546 行消失，重生成 `pipeline.py`（intake、无视理由、processing）、`sender.py`（burst、typo、voice）、`loops.py`（spontané、活跃）。

### 10:47，真架构

`tools/` 成体系：`brain/`（opencode、memory、mood）、`voice/`（voice、vocal、listen、soundboard）、`fun/`（behavior、typo、emotes、gif）。项目有骨架了。

### 10:49 → 11:16，开发舒服

- 心情注入阈值调；
- 四个编辑器排除小提交（`data/`、`voices/`、日志、库），对我放四个，项目定优先级不看 spec；
- 元数据库出跟踪；
- 项目变**别人可复用**：通用模板 `PERSONA.example.md`、`STYLE.example.md` 克隆*自己*风格；
- 身份重命名干净（`CHLOEAI_PROMPT` 变 `PERSONA`），README 去人格化，我把"Chloé"从公开文档拿掉，她只私下讲；
- 机器人 tuning 全进 gitignore 的 `config.yaml` 重载，注释版 example 逐行；
- 安装脚本备好 env 和 config 文件。

### 11:49，emoji 分家

自定义 emoji 粘正文不漂亮分开。小修大效果：emoji 粘句尾没有不喊"机器人"。

### 14:19，语音 guard

有人发语音命令，不当普通消息处理。眨眼：popote 活永远晚上回来。

**第 3 天完：累计 118 提交。机器人会听说夜里闭嘴有心情有名片。**

---

---

## 9 月 16 日星期三，第 4 天：可信

13 提交。"严肃"日。

### 08:49 → 08:59，成年

法律文件：**专有**许可、行为准则、贡献指南、安全政策，英法双语，来回改文件名改到强迫症。我熬几小时，仓库最不好玩的部分，远超其他。

### 09:56，机器人长眼

附件图片本地 OCR 转字进提示词。OCR 跑我自己机器。我不把你 meme 发第三方服务器，理论上也不。

### 11:09，合理预算

预算无声革命：频道禁发或卡 GIF、embed、emoji，**直接不调模型**。发不出去的消息一 token 不花。

### 11:42 → 12:55，大扫除

- 大扫除：死代码删，发送认证 bug 修，helper 抽；
- 太老 session 踢，DM 缓存过期，语音检测降本；
- 搬模块搞坏的 import 修回来，全部 runtime 状态（session、见过作者、无视消息、心情）重启后 `data/` 还在。

### 14:41，两世界一机器人

兼容层自动识别装的 `discord` 版本调 intent 和 REST 认证。结果：同样代码官方 **app**（discord.py）和 **selfbot**（discord.py-self）都跑。两世界一机器人。

### 15:05，在线状态适配

在线显示按模式走，admin 列表更新。

**第 4 天完：累计 131 提交。合法、合理、哪都跑的项目。**

---

---

## 9 月 17 日星期四，第 5 天：release

14 提交。成熟日。

### 09:15 → 09:30，记忆成学科

- 记忆按 scope 排，DM 记忆不往服务器乱引（反之亦然）；
- 记忆分类（事实、偏好、决定、关系……）写去重：两条矛盾记忆不能悄悄共存；
- 可选 blacklist（`aventuros`）挡某些话题。默认关，给怕的人；
- 死语音配置删。

### 10:12，记忆可审计

**月度记忆冲突 sweep**加检索 A/B bench。机器人记忆成要 inspect 的资产。离 9 月 11 日 08:24 很远很远了。

### 10:54，lockdown

玩 parano 日。智能体上锁：

- 写记忆**拒绝**（智能体注了也污染不了 vault）；
- Discord 工具**只读**（发送走代码，不走智能体）；
- **无子智能体**（绕锁）、无 webfetch（localhost SSRF、外带）、无 headless 提问；
- 加固 Docker：非 root 跑，`no-new-privileges`，`cap_drop: ALL`，内存/CPU 上限，进程文件数封顶，secret 走 `.env` 永不 bake。

原则写代码注释：*"dev 走人类 session，不走这"*。

### 11:02 → 11:15，安全收尾

记忆保存关键词收紧，写更严。gitignore 加上下文备份文件，我开始不全存档，但差不多。

### 12:39，心情减负

PARRY 心情不每条注：一次一状态。三浮点每条活着不跑了。

### 12:47，解脱提交

`PERSONA.md`、`STYLE.md`、`chloeai.md` 变** example**（`chloeai.example.md`、`PERSONA.example.md`、`STYLE.example.md`），我 voice `fortune-v6.onnx` 出仓库，数据日志出，`.env.example` 出生。项目不再装*我*人格：装载人格的**机制**。

### 12:52，v1.0.0

**Tag v1.0.0 SSH 签。** Changelog，运维 runbook，kill-switch（停不停删数据）。首提交到 release 整六天。

### 12:53 → 13:14，洗衣服

注释标点统一，记忆权限 scope 规则文档最新。

**第 5 天完：累计 145 提交。v1.0.0 出了。**

---

---

## 9 月 18 日星期五，第 6 天：anti-climax

一个提交，00:02。

项目最后提交，贱贱的。免费 tier 模型认 OpenCode 客户端靠请求里**有**特定工具（`bash`、`glob`、`grep`）。拿掉就算安全正当，provider 回 `403 FreeTierError: can only be used from within OpenCode`。我只好前夜锁的全白锁，刚好被我禁的重新放行，机器人才能免费继续跑。

仓库最好笑的提交我认：6 天驯完 Discord、Piper、MLS、OpenSelf、Docker，最后是**免费 AI 模型**定我安全策略。

---

---

## 数字


|                                               |                                                |
| --------------------------------------------- | ---------------------------------------------- |
| 提交                                       | **146**                                        |
| 活跃天                                  | **6**（9 月 11 日 → 18 日）                |
| 跟踪文件                             | 65                                             |
| 最终 Python 行数                         | 约 4000                                         |
| 风格测试分（Mimo 初期） | **9.1/10**                                     |
| 最终版                                | v1.0.0（SSH 签 tag，专有许可） |

## 六天我记住的

1. **优先级全乱，但方法对。** 先做会*回*的机器人，再做*像*的机器人，再做*可信*的机器人，再做*安全*的机器人，最后做*能发*的机器人。人格先安全后，`Feur` 先许可后。不按"好项目"规矩根本跑不出这速度。
2. **风格先是否定清单。** 我最有用的 `STYLE.md` 不讲我说什么，排除我不做什么：句子不加句号，emoji 只一个，`mdr` 小写，开头不 "Je vérifie juste un détail" 这类铺垫。机器人寄生虫比性格好认。
3. **失败就是项目。** MLS 三十提交，扔一个测试，六套 nonce layout 试过。我经历最忠实的记录就是周二一串失败。
4. **克隆是记忆不是风格。** 风格撑十条消息。记忆（OpenSelf、scope、去重、冲突 sweep）撑长久。镜子和人的区别在这。
5. **最后提交永远好笑。** 第 146 个，因为免费 tier 要自带工具重新放行 `bash`、`glob`、`grep`，我最爱。

收尾：**成绩好得离谱甚至吓人。** 克隆聊天看不出机器，记得人记得项目记得梗，主动带心情，还顺手赢 Fox。瘆人，但正是我们要的。

---

*项目不公开：专有许可，版权所有。但历史讲给你听。哪天你在某处遇到回 Patrick Jane GIF、inactivité 时间人类得恰到好处的"·Chloé"……你就知道背后是什么了。*

---

我的克隆写了自己的版本，在这里读 [./article-chlone-timeline-chloeai.md](./article-chlone-timeline-chloeai.md)。
