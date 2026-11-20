---
title: AI 学 Minecraft PvP，模仿学习、强化学习，以及那 30 个关键变量
description: 录 1000 场决斗，神经网络看像素学，命中率 90%，结果机器人一头撞墙。之后是 RL、课程学习和 60 小时训练。
date: 2026-07-09
tags:
  - minecraft
  - ai
  - python
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "dlgFXDYTTEho6zi/Abiw3VSQc6Koweg+WkOFCNfOmqwLowtsfpja7Kjfslql19J2m+FEy44zb/zKk2WzWXzmwQ=="
---

## 引言

![AI 学 Minecraft PvP 缩略图](assets/ai-pvp-thumbnail.png)

有个视频叫 [AI Learns Minecraft PvP (Reinforcement Learning + Behavior Cloning)](https://www.youtube.com/watch?v=j5nxDKAjg6)（Kadambi | AI Engineering），是我见过最诚实的游戏 AI 训练记录之一。

目标：做个打 Minecraft PvP 的机器人（剑套，全套附魔钻石甲），看屏幕、发鼠标键盘命令。只吃像素、只吐动作，不读游戏内存，不宏，不 mod。

视频有意思的不是最终结果。是过程：模仿学习翻车，转向特征工程，灾难性遗忘循环，无 GPU 笔记本上 60+ 小时训练。

## 阶段 1：模仿学习（翻车）

![模仿学习中的机器人：面壁反复横跳](assets/ai-pvp-imitation-fail.png)

作者一开始走正路：录自己 1000 场决斗，每次鼠标点击和按键对上当时画面，训神经网络从像素预测动作。

```python
# 模仿学习流水线伪代码
dataset = record_duels(1000)          # 几十万帧
for frame, action in dataset:
    pixels = capture_screen(frame)
    network.train(pixels → action)    # 从图像预测键鼠
```

网络把攻击预测到 **90% 准确率**。有戏。

然后扔进真对局。机器人直奔地图边缘，面壁，反复横跳。

为什么？

**偷懒陷阱。** PvP 里 W 键大多时候按着。网络发现一直按 W 别的啥也不干，准确率就很高。它优化了最常见的动作，别的全扔了。

**人类延迟。** 数据集里的动作带约 200ms 人类反应延迟。逐帧看，因和看得见的果隔好几帧，模型从原始像素根本学不会因果。

**演示不一致。** 作者自己打法不稳定：同样局面有时键盘走位，有时鼠标瞄准。矛盾输入把网络搞懵了。

## 阶段 2：强化学习加课程

![RL 训练中机器人学水平追踪](assets/ai-pvp-rl-horizontal.png)

扔掉模仿学习转 RL。但把 fresh 智能体直接扔完整 PvP 是浪费：同时发生太多事，随机探索什么都撞不到。

解法：**课程学习**。每个机制隔离，基础打牢再打真架。

### 第 1 步：水平瞄准（7 小时）

最简单的奖励函数：打中加分，挨打扣分。

初始机器人几乎不动（神经网络中性初始化）。左右抖：它在试动作看哪个给奖励。

1 小时后学会左右居中，但慢得痛苦。7 小时后能左右跟敌人，虽然不对称（往右比往左好，这个毛病留到训练结束）。

### 第 2 步：特征工程

原始截图 200 万像素以上。压到 360p 还有 200000 个输入，学不动。

作者分析几千场决斗，挑出**真正重要的 30 个变量**，三组：

**视觉（敌人追踪）**：
- 敌人离准星多远
- 敌人包围盒大小
- 敌人高度
- 准星状态（在目标上 / 不在）
- 相对速度

不处理整图，按敌方护甲颜色过滤像素，检测近乎瞬时。背景同色块会干扰过滤，但在 Minecraft 里直接换材质就行。

**OCR（读 HUD）**：
因为不能从游戏代码拿坐标，实时扫屏幕提取：
- 相机俯仰
- 动量
- Y 层

标准 OCR 读 Minecraft 透明字不行，关键数据强制黑白，瞬时可读。

**时间（上下文窗口）**：
- 距上次打中敌人多久
- 距上次被打中多久
- 机器人之前动作的滑动缓冲

给网络时间上下文：没有它，它不知道自己在连击中还是刚开打。

### 第 3 步：垂直瞄准（再 7 小时）

![RL 训练中机器人学上下瞄准](assets/ai-pvp-rl-vertical.png)

加上鼠标上下，一开始"彻底灾难"。初始性能全崩。

沙盒里再泡 1 小时，学会抬头低头。但过程中把水平追踪全忘了。

这就是**灾难性遗忘**：机器学习经典病，为新数据优化把之前学的表示覆盖了。优化垂直瞄准顺手把水平权重冲了，作者得到个能压住准星但跟不住目标的机器人。

又花 **6 小时**把水平追踪找回来，垂直控制保住。OCR 组给的相机俯仰这时立功，准星保持得不错。

### 第 4 步：键盘控制

![机器人疯狂开关 W 键，学持续走位](assets/ai-pvp-keyboard.png)

给机器人键盘权限后，时间特征更关键。开头 W 键疯狂开关：网络没学会 commit，走一下停一下。

这个行为被罚，机器人学会抹平。开始跳劈命中更多（闷响对站着挥的 swish）。有些连击看着不过瘾，因为机器人在拿攻击距离欺负敌人。

为了公平，作者给敌人加了攻击距离。机器人学的很多套路废了。但慢慢适应了。

### 第 5 步：教机器人什么时候点

最后一步把模仿学习请回来：只教点鼠标的时机，不教完整控制策略。机器人模仿录像里的点击模式。

开头它吓得不敢点，怕点错被罚。但最后鼓起勇气出手命中。当然，瞄准又忘了，作者让它自己待了 **50 小时**才回到能看的状态。

## 作弊 debate

视频结尾问：这机器人算作弊吗？

说不算：机器人只处理人类看到的（同样像素），发同样键鼠（没有反击退这类发包挂），不读游戏内存（无透视无 ESP）。

说算：机器人处理比人快，对手以为在和人打其实不是，这是欺骗。

作者看法：看意图。双方都知道是机器人，对局就公平。机器人把敌人按空地连了 100 连击。

## 结果

![机器人打出 100 连击](assets/ai-pvp-final-combo.png)

**无 GPU 笔记本**训出的 Minecraft PvP 机器人，自定义训练流水线：

- **截图**做像素输入（200 万像素 → 30 个设计特征）
- **课程学习**（水平 → 垂直 → 键盘 → 点击）
- **RL 管运动控制** + **模仿学习管点击时机**
- 像素上**特征工程**（三组：视觉、OCR、时间）
- **60+ 小时训练**，分多阶段

总训练时长几十小时，大多是挂着的。机器人抖着学会，忘了学的，重学，最后连出 100 连击，还附赠"我造的是不是挂"的灵魂拷问。

视频在 [youtube.com/watch?v=j5nxDKAjg6](https://www.youtube.com/watch?v=j5nxDKAjg6)。

---

*这篇只覆盖视频内容。更大的 Minecraft AI 上下文：VPT、DreamerV3、模仿学习对 RL 的版图，下面几节把这个项目连到更大的领域。*

## VPT：大规模 behavior cloning

![OpenAI VPT 项目图：逆动力学模型从前后帧预测动作](assets/vpt-overview.svg)

视频里的"behavior cloning"（阶段 1）和 OpenAI **Video PreTraining（VPT）**是同一技术，只是资源谱两端。VPT 证明模仿学习在 Minecraft 里行得通，条件是 7 万小时视频、720 GPU、逆动力学模型给无标签数据打伪标签。这位作者证明拿笔记本加 1000 场决斗行不通，但理由根本一样：模仿学习被演示质量锁死。

![OpenAI VPT 智能体在 Minecraft 里砍树](assets/vpt-minecraft.jpg)

VPT 流水线用 **Inverse Dynamics Model（IDM）**解数据问题，看 t-1 帧和 t+1 帧预测 t 帧的动作。IDM 非因果（能看未来帧），任务比 behavior cloning 简单，要的标签数据少得多。他们花约 2000 美元请标注工标 2000 小时数据，再用 IDM 给 7 万小时 YouTube Minecraft 视频打伪标签。

![预训练数据量对合成/采集率（log 轴）：工作台、木工具、石工具](assets/vpt-stone-pickaxe-sequence.svg)

scale 效应明显：预训练数据从 1 小时到 10 万小时 log 轴走，合成工作台、木工具、石工具的比率阶梯涨。只用 2000 小时标注工数据的模型卡在工作台，加上 IDM 伪标签的 7 万小时（图里虚线），石工具零样本冒出来，RL 一步没用。

0.5B 参数基础模型零样本能力 RL 单刷做不到：砍树、做工作台、柱跳，RL 微调后成了第一个做出钻石工具的 AI。

![RL 训练奖励随 episode：随机初始化起步 vs VPT 预训练起步](assets/vpt-diamond-pickaxe-sequence.svg)

这图说明预训练为什么改变下游 RL。随机初始化网络起步的 RL（橙色）近百万 episode 奖励贴零，"拿到钻石"任务奖励太稀疏，随机探索撞不到。VPT 预训练起步微调的 RL（绿色）开局就有基础行为（挖矿、合成、探索），稳步爬到约 25 奖励，对应钻石镐全链路。

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

*OpenAI VPT 项目官方演示视频，智能体实机。*

## OpenAI Five：奖励塑形问题

![OpenAI Five 打 Dota 2 对人类职业](assets/openai-five-dota2.jpg)

OpenAI Five（2019）用纯 RL 自我对弈赢了 Dota 2 世界冠军，不用模仿学习。256 GPU、128000 CPU 核、每天 180 年对局，训 10 个月。

但奖励函数是 Dota 专家手搓的：**20000 个可用特征里挑 28 个**，权重手工调。净值、人头、死亡、防御塔血量、分路，全人挑人加权。没这个塑形，智能体几乎不学（实验：只给胜负奖励，卡在半职业水平）。

视频里机器人同病：奖励函数编码作者对 PvP 重要的理解（打中好、被打坏、准星稳好）。绕不开：RL 要奖励信号，塑奖励信号就注入人的偏见。

## DreamerV3：世界模型和稀疏奖励

![DreamerV3 150+ 多样任务 benchmark，单配置](assets/dreamerv3-benchmarks.png)

DeepMind DreamerV3（2023）走第三条路。不 behavior cloning，不加料 RL，它学 **world model**：神经网络从过去动作预测未来状态和奖励，在梦里规划未来。这是第一个从零无人类数据无课程、在 Minecraft 里拿到钻石的算法，2025 年发 Nature。

![DreamerV3 学世界模型想象未来轨迹](assets/dreamerv3-header.png)

钻石环境奖励按 12 个里程碑稀疏给（原木 → 木板 → 木棍 → 工作台 → 木镐 → 石头 → 石镐 → 铁矿 → 熔炉 → 铁锭 → 铁镐 → 钻石），每个 +1 一次。再加小额血量奖励（±0.01 每点血）。一局 36000 步最高 11.1。

DreamerV3 的世界模型让它在内部想象轨迹、评估：actor 从梦里的 rollout 学，不从真实经验学，每步真实动作配几千个想象未来。稀疏奖励这才可行，标准 RL 智能体早死了。

40 个种子训 1 亿环境步，24 个至少拿到一块钻石。第一块钻石出现在 2900 万步后（约单 GPU 9 天）。

## ANNA：符号 AI 遇上 Minecraft

![ANNA 打火石任务树分解](assets/anna-task-tree.png)

视频 PvP 机器人、VPT、DreamerV3 之前，还有 **ANNA**：Minecraft 机器人走完全不同的哲学。不从像素或奖励学，**符号状态机**加**法语 NLP 解析器**加手写**任务依赖树**。

2022 年造的（那时还没"vibe coding"这词），ANNA 经 Mineflayer 连 Minecraft 服务器，懂法语自然语言命令。说"搞个打火石"，ANNA 解析动词（搞 → 获取），查物品配方，递归拆子任务：挖橡木 → 做木板 → 做木棍 → 做工作台 → 做木镐 → 挖石头 → 做石镐 → 挖铁矿 → 烧铁锭 → 做打火石。

![ANNA 法语命令 NLP 解析器架构](assets/anna-nlp-diagram.png)

NLP 层（`utils/id_parser.js`）按"et"切分并行命令，法语动词映射任务类型，法语物品名经 5000 词典映射 Minecraft ID。解析不了的进 GPT 兜底对话，把 ANNA 介绍成有意识的 Minecraft 伙伴。

**任务树**（`mc-tasks-tree/`）是心脏：递归算法走 Minecraft 物品图（合成配方、挖掘掉落、怪物掉落、熔炉配方）产出分步计划。钻石头盔能展开 40+ 步，覆盖木、石、铁、钻石全阶段。

![ANNA 钻石头盔任务树：40+ 步展开](assets/anna-diamond-helmet.png)

视频 PvP 机器人从经验学，ANNA 从知识跑。它不需要 1000 场决斗或 60 小时训练，要树、解析器、服务器。树外它也泛化不了。多少状态机工程都教不会它打 PvP。

ANNA 映照 AI 的另一个年代：端到端学习统治之前，承诺是符号推理加细工程产出智能。今天 ANNA 和 PvP 机器人是 Minecraft AI 两极：一个推理世界，一个感知世界。

## Master Gumbo 的钉头锤机器人：纯命令方块 AI

![钉头锤 PvP 训练场和机器人](assets/mace-bot-arena.png)

Minecraft AI 另一个角落，YouTube 主 **Master Gumbo** 用**纯命令方块**做了 PvP 陪练：只用 vanilla 命令、红石、carpet mod 的玩家镜像实体。机器人陪大众练换弹连击、风弹冲刺、盾机制。

机器人开局是穿无敌装备、手持图腾（每 tick 经 `/item replace` 补满）的僵尸，事实上不死。后升级 **Carpet Mod 玩家镜像**，支持举盾、切物品这些僵尸做不了的人形机制。

![设置中心：配置机器人行为的按钮](assets/mace-settings-center.png)

核心创新是**随机驱动的状态机**。盔甲架经 `/spreadplayers` 命令随机撒到彩色混凝土圈上。落到什么颜色混凝土，触发机器人下个动作：

- **红色混凝土** → 后撤
- **蓝色混凝土** → 风弹升空（攻击）上天
- **绿色混凝土** → 举盾
- **白色混凝土** → 暂停（动作之间加延迟）

![AI 决策系统：彩色混凝土上的盔甲架](assets/mace-ai-system.png)

盔甲架位置被命令方块读，检测脚下块激活对应机制。红石块放删开关行为。`/spreadplayers` 一直跑，机器人持续做新决策，行为不可预测但有结构。

Master Gumbo 管这叫"非常简单基础的 AI 形态"：不像神经网络从交互学，但随机加状态机产出的 PvP 行为比脚本机器人难预测多了。设置中心有书本界面开关 AI、调难度、配移动模式。

拿它练完再和开场嘲讽他的玩家决斗，Master Gumbo 赢了。地图走 Discord 分享，要 Carpet Mod。

![决斗中的机器人，练钉头锤 PvP 技术](assets/mace-final-duel.png)

PvP 机器人（Kadambi）从像素学，ANNA 沿任务树推理，Master Gumbo 的机器人靠**随机状态转移**拿到智能：纯命令方块打法，证明不用神经网络也能做出像样的 PvP 对手。

## Altoclef：Baritone 加大规模任务树

ANNA 是*读*会做事的符号机器人，钉头锤机器人随机决策，**Altoclef** 是规划通关的完整自主智能体。gaucho-matero 做的 Fabric mod，路径靠 **Baritone**，任何 Minecraft 目标拆成任务树无人干预执行。

界面简单到离谱：聊天框敲 `@gamer`，Altoclef 从生存开局"通关游戏"。砍树、做工具、挖铁挖钻、建下界门、收烈焰棒和末影珍珠、找要塞、杀末影龙。全自动，走原生 Minecraft 客户端，任意 vanilla 服务器。

底层是**递归任务树系统**，高级目标（比如"做钻石镐"）拆成前置任务：挖钻 → 烧 → 做木棍 → 合。树走 Minecraft 全配方图，管生产线、怪物掉落、战利品表、容器访问。ANNA 的树手写，Altoclef 的任务是**可编程 Java 类**，能实现任意逻辑：战斗策略、猪灵交易、探索模式。

关键架构思路是 **what**（任务树）和 **how**（Baritone 寻路）分离。Baritone 管底层移动：寻路、避障、破方块、管背包，任务系统管高级计划。两边都是确定性算法都不算 AI，但合起来产出复杂目标导向行为，不输学习派。

Altoclef 是**纯符号 Minecraft AI** 的极限：零训练、零 GPU、零人类数据通关，不用程序员预见的任务就不会，会做钻石镐因为 Java 类逐行告诉它，不是因为它自己悟出来的。

## 把它们连起来

| 方法 | 主要手段 | 数据 | 算力 | 结果 | |
|--------------------------|---------------------|---------|--------|-----------|-|
| 视频 PvP 机器人 | RL + 模仿学习 | 1000 场决斗 | 1 台笔记本，60 小时 | 100 连击 | |
| OpenAI Five | RL 自我对弈 | 每天 180 年对局 | 256 GPU，10 个月 | Dota 2 世界冠军 | |
| VPT | 半监督 IL | 7 万小时 YouTube + IDM | 720 GPU，9 天 | 钻石工具 | |
| DreamerV3 | 世界模型 RL | 梦里轨迹 | 1 GPU，9 天 | 从零拿钻石 | |
| **ANNA** | **符号 NLP + 任务树** | **手写配方** | **1 台笔记本，即时** | **任意可合成物品** | |
| **Altoclef** | **Baritone + FS 任务树** | **Java 任务类** | **Fabric mod，无 GPU** | **通关整个游戏** | |
| **钉头锤机器人** | **命令方块状态机** | **随机决策** | **Vanilla MC，无 GPU** | **钉头锤 PvP 陪练** | |

视频机器人资源最紧，但过程最诚实。先翻车，再迭代。忘了学的，重学。结尾打出 100 连击，还问自己造的是不是挂。

---

**视频**：[AI Learns Minecraft PvP](https://www.youtube.com/watch?v=j5nxDKAjg6) Kadambi | AI Engineering

**VPT**：[论文](https://cdn.openai.com/vpt/Paper.pdf) · [博客](https://openai.com/index/vpt/) · [GitHub](https://github.com/openai/Video-Pre-Training)

**OpenAI Five**：[论文](https://arxiv.org/abs/1912.06680) · [博客](https://openai.com/index/dota-2/)

**DreamerV3**：[论文](https://arxiv.org/abs/2301.04104) · [GitHub](https://github.com/danijar/dreamerv3)

**ANNA**：[GitHub](https://github.com/fox3000foxy/ANNA) ·（Node.js、Mineflayer、法语 NLP、任务树）

**Altoclef**：[GitHub](https://github.com/gaucho-matrero/altoclef) · [活跃 fork](https://github.com/drmcbride12/altoclef) ·（Fabric、Baritone、任务树、能通关）

**钉头锤机器人**：[视频](https://www.youtube.com/watch?v=Fmp2Il70IF8) Master Gumbo ·（命令方块、Carpet Mod、状态机）
