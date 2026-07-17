---
title: AI学习Minecraft PvP----模仿学习、强化学习，以及30个关键变量
description: 录制了1000场决斗，在像素之上训练神经网络，达到90%的按键准确率----但机器人却径直撞墙。随后是强化学习、课程学习和60小时训练。
date: 2026-07-09
authors:
  - fox3000foxy
tags:
  - minecraft
  - ai
  - python
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "Ds6tVklI9+qwZzohFQGyPpnaPPyI3LcLXQJ0NSpzD3GgDDEquzdCk0N3IwnRArZ0ej4PDND9AEpYeT8kv01CNw=="
---

## 介绍

![AI学习Minecraft PvP缩略图](assets/ai-pvp-thumbnail.png)

Kadambi | AI Engineering制作了一部名为[AI Learns Minecraft PvP (Reinforcement Learning + Behavior Cloning)](https://www.youtube.com/watch?v=j5nxDKAjg6U)的视频，这是我见过的最诚实的游戏AI训练记录之一。

前提：打造一个机器人，通过观看屏幕并输出鼠标和键盘指令来玩Minecraft PvP（剑套、全套附魔钻石甲）。不读取游戏内存，不使用宏，不装模组：像素输入，动作输出。

这部视频有趣之处不在于最终结果，而在于过程：模仿学习的失败、特征工程的转向、灾难性遗忘的循环，以及在无GPU笔记本上60多个小时的训练。

## 阶段1：模仿学习（失败）

![模仿学习期间的机器人：面对墙壁，上下跳跃](assets/ai-pvp-imitation-fail.png)

制作者从一个合理的方案开始：录制自己1000场游戏，将每次鼠标点击和按键映射到对应的帧上，训练一个神经网络从像素预测动作。

```python
# 模仿学习流程的伪代码
dataset = record_duels(1000)          # 数十万帧
for frame, action in dataset:
    pixels = capture_screen(frame)
    network.train(pixels → action)    # 从图像预测键盘/鼠标
```

网络学会了以**90%的准确率**预测按键。前景光明。

然后在实际比赛中测试。机器人径直走向地图边缘，面对墙壁，并上下跳跃。

为什么？

**懒惰陷阱。** 在PvP战斗中，W键大部分时间处于按下状态。网络意识到只需按住W键就能达到高准确率。它优化了最常见的动作，牺牲了所有其他动作。

**人类延迟。** 数据中的动作存在约200ms的人类反应时间延迟。逐帧来看，动作与其可见后果相隔多个帧，模型几乎不可能从原始像素中学到因果关系。

**演示不一致。** 创作者自己的游戏方式多变：有时用键盘侧移，有时在相同情况下用鼠标瞄准。这种冲突的输入让网络感到困惑。

## 阶段2：融入课程的强化学学习

![在RL训练期间学习水平追踪的机器人](assets/ai-pvp-rl-horizontal.png)

放弃模仿学习后，创作者转向了RL。但将新生的智能体直接扔进一场完整的PvP对决毫无意义：同时发生的事情太多，随机探索什么也找不到。

解决方案：**课程学习**。隔离每个机制，让机器人先掌握基础，再进入实际战斗。

### 步骤1：水平瞄准（7小时）

最简单的奖励函数：命中给予正奖励，受伤扣除惩罚。

起初，机器人几乎不动（神经网络初始化为输出中值）。它左右抖动：这是在测试哪些动作能带来奖励。

一小时后，它学会了水平居中，但速度极其缓慢。7小时后，它能左右追踪敌人，但仍不对称（从右向左移动比从左向右更好，这种行为贯穿了整个训练过程）。

### 步骤2：特征工程

原始屏幕捕获超过200万像素。即使缩小到360p，也有20万个输入：对于高效学习来说太多了。

创作者分析了数千场对决，找出了**真正重要的30个变量**，分为三组：

**视觉（敌人追踪）**：
- 敌人到准星的距离
- 敌人边界框大小
- 敌人高度
- 准星状态（是否瞄准目标）
- 相对速度

不再处理整个图像，机器人严格按敌人盔甲颜色过滤像素，实现近乎即时的检测。类似颜色的背景块可能干扰此过程：但在Minecraft中，只需更换纹理即可。

**OCR（HUD读取）**：
由于机器人无法从游戏代码中获取坐标，它会实时扫描屏幕以提取：
- 摄像机俯仰角
- 动量
- Y高度

标准OCR难以处理Minecraft的透明文本，因此关键数据被强制转为黑白以便即时读取。

**时间（上下文窗口）**：
- 上次击中敌人的时间
- 敌人上次击中你的时间
- 机器人自身先前动作的滚动缓冲区

这为网络提供了时间上下文：否则，机器人不知道自己是在连击过程中还是刚刚开始战斗。

### 步骤3：垂直瞄准（再加7小时）

![RL训练期间机器人在上下瞄准时的学习](assets/ai-pvp-rl-vertical.png)

最初添加垂直鼠标移动是"一场彻底的灾难"。初期表现完全崩溃。

在沙盒中又待了一小时后，机器人学会了如何上下看。但在此过程中，它完全忘记了如何水平追踪。

这就是**灾难性遗忘**：一个经典的机器学习问题，优化新数据会覆盖先前学到的表征。通过优化垂直瞄准，神经网络意外覆盖了水平方面的进展，导致只剩一个准星能保持水平但不能跟随目标的机器人。

恢复水平追踪同时保持垂直控制用了**额外6小时**。之后，借助OCR组提取摄像机俯仰角，机器人维持了良好的准星放置。

### 步骤4：键盘控制

![机器人不断切换W键，学习投入移动](assets/ai-pvp-keyboard.png)

允许机器人使用键盘后，基于时间的特征变得至关重要。最初，W键不断开关：网络尚未学会投入，导致频繁切换。

这种行为受到惩罚，于是机器人学会了使其平滑处理。它开始打出更多冲刺命中（砰砰声对比站立挥砍的嗖嗖声）。有些连击看起来不令人满意，因为机器人利用了其对敌人的距离优势。

为了公平起见，创作者增加了敌人的攻击范围。机器人的许多习得策略失效了。但有了更多时间，它适应了。

### 步骤5：教机器人何时点击

最后阶段，创作者重新引入了模仿学习：但只教点击时机，而非完整的控制策略。机器人试图模仿录制对决中的点击模式。

起初它害怕尝试任何动作，担心错误点击会受到惩罚。但最终它鼓起勇气挥剑并命中敌人。当然，在此过程中它又忘记了如何瞄准：创作者不得不让它独自训练**50小时**才恢复到满意的状态。

## 作弊之争

视频最后问了一个问题：这个机器人算作弊吗？反对理由：机器人只处理人类所见（相同像素），发送与人类相同的键盘/鼠标输入（没有反击退等数据包操纵），也不读取游戏内存（没有X光或ESP）。

赞成理由：机器人处理速度比人类快，如果对手以为自己在和人类打但实际上不是，那就是欺骗。

创作者的观点：这取决于意图。如果双方都知道对手是机器人，这就是公平的比赛。机器人最终以100连击将敌人打入虚空。

## 结论

![机器人在执行100连击](assets/ai-pvp-final-combo.png)

一个在**无GPU的笔记本**上训练的Minecraft PvP机器人，基于以下定制的训练流程构建：

- **画面捕捉**作为像素输入（200万+像素 → 30个精心设计的特征）
- **课程学习**（水平 → 垂直 → 键盘 → 点击）
- **RL用于运动控制** + **模仿学习用于点击时机**
- **基于原始像素的特征工程**（3组：视觉、OCR、HUD）
- **多个阶段共60多小时的训练**

总训练时间为数十小时，但大部分是被动的。机器人摇晃着逐渐理解，忘记所学，重新学习，最终串起百连击。

视频地址：[youtube.com/watch?v=j5nxDKAjg6U](https://www.youtube.com/watch?v=j5nxDKAjg6U)

---

*本文仅涵盖视频内容。如欲了解Minecraft AI的更广阔背景：VPT、DreamerV3，以及模仿学习与RL的格局，请参见以下小节，它们将本项目放在更广阔的领域中展开讨论。*

## VPT：大规模行为克隆

![OpenAI的VPT项目图示：逆向动力学模型从帧对预测动作](assets/vpt-overview.svg)

视频中的"行为克隆"方法（阶段1）与OpenAI在其VPT项目中使用的技术完全相同，但处于资源光谱的两端。VPT证明，当你拥有7万小时视频、720块GPU和用于伪标记未标注数据的逆向动力学模型时，模仿学习对Minecraft是有效的。而这位创作者的实验证明，用一台笔记本电脑和1000场对决，它会失败。但基本原因相同：模仿学习受限于其演示的质量。

![OpenAI的VPT智能体在Minecraft中砍树](assets/vpt-minecraft.jpg)

VPT流程通过训练一个**逆向动力学模型（IDM）**来解决数据问题，该模型观察帧t-1和帧t+1来预测帧t的动作。由于IDM是非因果的（它能看到未来帧），该任务比行为克隆更容易，所需标注数据也更少。他们向承包商支付了约2,000美元，用于2000小时标注数据，然后使用IDM为7万小时YouTube Minecraft视频进行伪标注。

![预训练数据量对合成/采集率的影响（对数刻度）：工作台、木工具、石工具](assets/vpt-stone-pickaxe-sequence.svg)

缩放效应非常明显：在对数坐标轴上，从1小时到10万小时预训练数据，模型制作工作台、木工具和石工具的成功率逐级提升。仅使用承包商标注的2000小时数据训练的模型止步于工作台；只有在添加了IDM伪标注的7万小时数据（图表中的虚线）后，石工具才零样本涌现，无需任何RL步骤。

由此产生的5亿参数基础模型实现了仅靠强化学习无法做到的零样本能力：砍树、合成工作台、搭柱跳----并通过强化学习微调，成为第一个合成钻石工具的人工智能。

![RL训练奖励随回合数的变化：随机初始化模型 vs 预训练VPT模型](assets/vpt-diamond-pickaxe-sequence.svg)

该图展示了预训练如何改变下游RL的一切。从随机初始化网络开始的RL（橙色）在近百万回合内保持接近零的平直状态：「获取钻石」任务的奖励过于稀疏，初学者不可能通过随机探索碰巧得到。而从预训练VPT模型微调的RL（绿色）已经具备了基础行为（挖矿、合成、探索），并稳定上升至约25的奖励，对应了通往钻石镐的完整路径。

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

*OpenAI VPT项目的官方演示视频，展示智能体在游戏中的实际表现。*

## OpenAI Five：奖励塑造问题

![OpenAI Five与人类职业选手对战Dota 2](assets/openai-five-dota2.jpg)

OpenAI Five（2019年）使用纯自我对战的强化学习击败了Dota 2世界冠军：没有模仿学习。256张GPU、128,000个CPU核心、每天180年的游戏经验、10个月的训练。

但奖励函数是由Dota专家手工制作的：从**20,000个可用特征中选出了28个**，每个都配有手动调整的权重。净资产、击杀数、死亡数、防御塔生命值、分路安排----全部由人类选择和加权。没有这种精心设计，智能体能几乎学不到什么（实验：仅以输赢作为奖励→在半职业水平停滞）。

视频中的机器人面临同样的问题：其奖励函数编码了创作者对PvP关键因素的理解（击中敌人好，受伤不好，保持准星正确），这是不可避免的：强化学习需要一个奖励信号，而设计这一信号就融入了人类的偏见。

## DreamerV3：世界模型与稀疏奖励

![DreamerV3在超过150个不同任务下的基准分数，单一配置](assets/dreamerv3-benchmarks.png)

DeepMind的DreamerV3（2023年）采取了第三种方法。它不采用行为克隆或精心设计的强化学习，而是学习一个**世界模型**----从过往动作预测未来状态和奖励的神经网络----并通过"梦想"可能的未来来规划。它是首个无需人类数据或课程就在Minecraft中从头收集钻石的算法，2025年发表于《自然》杂志。

![DreamerV3学习世界模型以想象未来轨迹](assets/dreamerv3-header.png)

钻石环境定义了跨越12个里程碑（原木→木板→木棍→工作台→木镐→圆石→石镐→铁矿石→熔炉→铁锭→铁镐→钻石）的稀疏奖励，每个里程碑恰好给予+1一次。外加一个小型生命值奖励（每生命值±0.01）。最高可达总分：36,000步一个episode中11.1分。

DreamerV3的世界模型使其能够想象轨迹并在内部进行评估：智能体从梦想的展开中学习，而不是从真实体验中学习，每一步都在想象中测试数千种可能的未来。这使得稀疏奖励可行，而这对标准强化学习智能体来说是不可行的。

## ANNA：符号AI与Minecraft相遇

![ANNA的打火石的的任务树分解](assets/anna-task-tree.png)

在视频中的PvP机器人之前，在VPT和DreamerV3之前，就有了**ANNA**：一个哲学完全不同的Minecraft智能体。不是从像素或奖励中学习，ANNA使用一个具有**法语NLP解析器**和手工编写的**任务依赖树**的**符号状态机**。

创建于2022年，ANNA通过Mineflayer连接到Minecraft服务器并理解法语自然语言命令。说"obtiens un briquet"（获取火石与钢），ANNA的解析器识别动词（*obtien* → 获取），查找物品合成配方，然后递归分解为子任务：挖掘橡树木原木→合成木板→合成木棍→合成工作台→合成木镐→挖掘石头→合成石镐→挖掘铁矿石→冶炼铁锭→合打火石与钢。

![ANNA用于识别法语命令的NLP解析器架构](assets/anna-nlp-diagram.png)

NLP层（`utils/id_parser.js`）将命令按"et"（和）拆分以处理并行指令，将法语动词映射为任务类型（*craft*、*mine*、*tue*、*suis moi*），并通过一个5000条目的字典将法语物品名称转换为Minecraft ID。无法识别的命令则交由基于GPT的对话系统处理，该系统将ANNA塑造成一个有意识的Minecraft伙伴。

**任务树**（`mc-tasks-tree/`）是核心：一个递归算法，遍历Minecraft物品图（合成配方、挖掘产出、生物掉落、熔炉配方）以生成逐步计划。对于一个钻石头盔，它会生成跨越木材、石头、铁和钻石层级的40多步分解。

![ANNA的钻石头盔任务树：40+步分解](https://raw.githubusercontent.com/fox3000foxy/ANNA/main/docs/diamond-helmet-tree.png)

如果说视频中的PvP机器人从经验中学习，那么ANNA就是从知识中运作。它不需要1000场对决或60小时的训练：它只需要任务树、解析器和服务器。但它也无法超越其编码的任务树进行泛化。无论状态机工程多么精巧，都不可能教会它PvP。

ANNA的方法让人想起了AI的一个不同时代：在端到端学习占据主导地位之前，当符号推理加精心工程被认为可以产生智能行为的时候。今天，像ANNA和PvP机器人这样的项目代表了Minecraft AI的两个极点：一个在推理世界，另一个在感知世界。

## 大师Gumbo的钉头锤机器人：只用命令方块的AI

![钉头锤PvP训练竞技场与机器人](assets/mace-bot-arena.png)

在Minecraft AI完全不同的另一个领域，YouTuber **Master Gumbo** 仅使用**命令方块**构建了一个PvP训练机器人：没有模组，没有插件何外部代码，只有原版Minecraft命令、红石，以及用于玩家复制实体的Carpet Mod。最终成果是一个AI钉头锤PvP对手，可以练习绕后偷袭、风力冲击和盾牌机制。

机器人最初是一个拥有不可破坏装备和副手图腾（每tick通过`/item replace`补充）的僵尸，使其实际上永生不死。之后，Master Gumbo切换到**Carpet Mod的玩家复制**机器人，它们支持僵尸无法做到的人类化机制（举盾、切换物品）。

![设置中心：用于配置机器人行为的按钮](https://i.ytimg.com/vi/Fmp2Il70IF8/maxresdefault.jpg)

核心创新是一个**由随机性驱动的状态机**。一个盔甲架通过`/spreadplayers`命令被传送到一个由彩色混凝土块构成的圆环上方，该命令可将实体随机散布。盔甲架落地的位置决定了机器人的下一步行动：

- **红色混凝土** → 后撤步
- **蓝色混凝土** → 向上冲击（攻击）
- **绿色混凝土** → 举盾
- **白色混凝土** → 暂停（在动作之间增加延迟）

![AI决策系统：彩色混凝土上方的盔甲架](https://i.ytimg.com/vi/Fmp2Il70IF8/maxresdefault.jpg)

盔甲架的位置由检测其下方方块并激活相应机制的命令方块读取。通过放置或移除红石块来启用/禁用每个行为。由于`/spreadplayers`重复运行，机器人不断做出新的决定，产生不可预测但有结构性的行为。

Master Gumbo称其为"一种非常简单和基础的AI形式"：它不像神经网络那样从交互中学习，但随机性加状态机能产生比脚本机器人更难预测的逼真PvP行为。设置中心包含一个书本式界面，可切换AI开/关、调整难度和配置移动模式。

在与机器人训练后，Master Gumbo接着与视频开头说他菜的那个玩家进行决斗，赢了。地图通过Discord分享，需安装Carpet Mod。

![机器人处于决斗中，练习钉锤PvP技术](assets/mace-final-duel.png)

PvP机器人（Kadambi）从像素中学习，ANNA通过任务树推理，而Master Gumbo的机器人则通过**随机化的状态转换**实现智能：一种纯命令方块的方法，证明了你不需要神经网络就能构建一个令人信服的PvP对手。

## Altoclef：自主通关Minecraft的Fabric机器人

![Altoclef的BeatMinecraft任务树分解](assets/altoclef-task-tree.png)

如果说上述项目各自专注于Minecraft的一个侧面，那么**Altoclef**则采取了一种截然不同的雄心：**完全自主通关Minecraft**。2021年5月24日，Altoclef成为首个从零开始、无需人类干预就击败末影龙、通关Minecraft的机器人。

Altoclef是一个**Fabric客户端mod**，使用**Java**编写，核心路径规划基于**Baritone**。与视频中PvP机器人从像素学习不同，Altoclef不处理屏幕图像，也不使用GPU或神经网络。它通过与原版Minecraft Java类的深度集成来直接读取游戏状态：坐标、方块ID、物品栏内容、实体列表----所有这些都通过Fabric API和Mixin注入来获取。输入不是像素，而是结构化的游戏数据。

**任务树系统**是Altoclef的核心。用户通过聊天命令（如`@gamer`开始通关、`@get diamond_sword`获取钻石剑）给出高级目标，Altoclef将其递归拆解为子任务：

- 目标：通关游戏 → 前往末地 → 激活末地传送门 → 获取末影珍珠 → 击杀烈焰人 → 前往下界要塞 → 获取烈焰棒 → …

每棵任务树都是一个有向无环图（DAG），其中的节点代表具体子任务（`MineTask`、`CraftTask`、`SmeltTask`、`FightTask`、`TravelTask`等），边代表依赖关系。一个Java类层次结构定义了任务的生命周期：`onStart()`、`onTick()`、`onStop()`、`isFinished()`。Baritone负责底层路径规划（移动、挖掘、交互），而Altoclef的任务调度器则决定下一步该运行哪个子任务。

截至2025–2026年，社区fork（如drmcbride12和MiranCZ的版本）已将Altoclef更新至Minecraft 26.1.2，并继续优化`BeatMinecraftTask`，修复了路径扫描器、投掷物追踪、合成路径等数十个问题。

| 技术 | 说明 |
|------|------|
| 核心技术 | **任务树（DAG）+ Baritone路径规划** |
| AI范式 | **符号式AI**：无学习、无神经网络、无GPU |
| 数据来源 | **游戏API**（坐标、方块、物品、实体） |
| 架构 | **Fabric Mod**（Java类 + Mixin注入） |
| 定位 | **纯客户端**，无需服务端安装 |
| 关键成就 | **首个自主通关Minecraft的机器人** |

如果说PvP机器人是通过感知和运动学习来玩，ANNA是通过符号推理来理解，那么Altoclef则是通过工程化来执行：它不学习，它**完成任务**。它的成功不是来自训练，而是来自递归分解、健壮的Baritone路径规划以及精心编排的Java任务类。

## 这些项目的共同点

| 方法 | 核心技术 |数据 | 计算资源 | 结果 |
|----------|----------|------|---------|--------|
| 视频中的PvP机器人 | RL + 模仿学习 | 1000场对决 | 1台笔记本、60h | 百连击 |
| OpenAI Five | 自我对战RL | 每天180年游戏经验 | 256张GPU、10个月 | Dota 2世界冠军 |
| VPT | 半监督模仿学习 | 7万小时YouTube + IDM | 720张GPU、9天 | 钻石工具 |
| DreamerV3 | 世界模型RL | 梦想轨迹 | 1张GPU、9天 | 从零获得钻石 |
| **ANNA** | **符号NLP + 任务树** | **手工编写合成配方** | **1台笔记本、即时** | **任何可合成物品** |
| **Altoclef** | **任务树（DAG）+ Baritone** | **游戏API读取** | **1台笔记本、即时** | **自主通关MC** |
| **钉锤机器人** | **命令方块状态机** | **随机化决策** | **原版MC、无GPU** | **钉锤PvP练习** |

视频中的机器人在资源上受限最大，但对过程的描述最为诚实。它先经历失败，然后迭代。它忘记所学，再重新学习。它以百连击收场：但也留下了关于自己所造之物是否为作弊的疑问。

---

**视频** : [AI Learns Minecraft PvP](https://www.youtube.com/watch?v=j5nxDKAjg6U) by Kadambi | AI Engineering

**VPT** : [论文](https://cdn.openai.com/vpt/Paper.pdf) · [博客](https://openai.com/index/vpt/) · [GitHub](https://github.com/openai/Video-Pre-Training)

**OpenAI Five** : [论文](https://arxiv.org/abs/1912.06680) · [博客](https://openai.com/index/dota-2/)

**DreamerV3** : [论文](https://arxiv.org/abs/2301.04104) · [GitHub](https://github.com/danijar/dreamerv3)

**ANNA** : [GitHub](https://github.com/fox3000foxy/ANNA) · (Node.js, Mineflayer, 法语NLP, 任务树)

**Altoclef** : [GitHub](https://github.com/gaucho-matrero/altoclef) · [drmcbride12 fork](https://github.com/drmcbride12/altoclef) · (Fabric, Baritone, 任务树DAG, 自主通关)

**钉锤机器人** : [视频](https://www.youtube.com/watch?v=Fmp2Il70IF8) by Master Gumbo · (命令方块, Carpet Mod, 状态机)