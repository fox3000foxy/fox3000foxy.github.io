---
title: "Laupok做了一个能自动玩《超级马里奥世界》的AI----它的原理详解"
description: "深入解析 Laupok 的项目：一个基于 NEAT 算法的 AI，能够自主学习并通关《超级马里奥世界》。遗传算法、神经网络、增强拓扑的神经进化，以及约 4200 行 Lua 代码。"
date: 2026-07-11
authors:
  - fox3000foxy
tags:
  - ai
  - lua
  - emulation
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "xS4fnuMD8RX3WS+NaAApL30GbE9iH6w1TiutpmvvYiZhng/eXbkMm1KpGPRXiUkbltkUPfeyeeBTr0P8EYE1fQ=="
---

# Laupok做了一个能自动玩《超级马里奥世界》的AI----它的原理详解

Laupok 制作了一个能够完全自主游玩**《超级马里奥世界》**的人工智能。没有任何预先编写的脚本，没有录制的帧数据。AI 通过自身的随机突变和自然选择，学会了如何通关游戏的各个关卡。这个项目运行在 **BizHawk**（一个多平台模拟器）上，通过一个约 **4200 行**的 Lua 脚本实现。

这个项目令人着迷之处在于，它将生物学概念应用于计算：达尔文的**进化论**、**人工神经网络**，以及最重要的----一个叫做 **NEAT**（增强拓扑的神经进化）的特定算法。AI 在一开始对游戏一无所知。它会尝试随机操作，失败数千次，然后逐渐搞清楚如何移动、跳跃和生存。

在本文中，我们将逐一拆解----从概念到代码，逐行分析。

![Laupok 在镜头前介绍 NEAT 算法](/images/laupok-mario-ai/neat-title.jpg)

---

## 环境搭建：BizHawk、Lua 与《超级马里奥世界》

### BizHawk 模拟器

BizHawk 是一款开源模拟器，支持大量主机----NES、SNES、世嘉 Genesis、PS1、Game Boy 等。它的核心特性是可以在游戏运行的同时执行 **Lua 脚本**。这些脚本可以访问模拟器的**内存（RAM）**，也就是说它们可以实时读取----甚至修改----任何游戏数据。

具体来说，这意味着你可以：
- 读取马里奥在关卡中的位置
- 知道屏幕上有哪些精灵（敌人、道具）
- 知道马里奥周围每个图块（砖块）的状态
- 控制手柄----按下任意按钮

这正是让 AI 玩游戏所需要的一切。

### 《超级马里奥世界》的内存地址

在《超级马里奥世界》的 RAM 中，每一条数据都存储在一个特定的地址上。这就像一个社区：每个地址对应一栋"房子"，里面存放着一条信息。例如：

| 地址 | 数据 |
|---------|------|
| `0x94`-`0x95` | 马里奥的 X 坐标（16 位，小端序） |
| `0x96`-`0x97` | 马里奥的 Y 坐标 |
| `0x14C8`+`i` | 精灵 `i` 的状态（>7 = 存活） |
| `0xE4`+`i` | 精灵 `i` 的低字节 X 坐标 |
| `0x14E0`+`i` | 精灵 `i` 的高字节 X 坐标 |
| `0xD8`+`i` | 精灵 `i` 的低字节 Y 坐标 |
| `0x14D4`+`i` | 精灵 `i` 的高字节 Y 坐标 |
| `0x170B`+`i` | 扩展精灵 `i` 的类型 |
| `0x0100` | 游戏状态（12 = 关卡完成） |
| `0x13D4` | 暂停激活 |
| `0x0071` | 马里奥的死亡动画（9 = 死亡） |
| `0x1C800`+... | 关卡图块表 |

精灵的位置使用两个字节：一个"低"字节和一个"高"字节，因为位置可以超过 255 像素。计算公式始终是 `低 + 高 × 256`。

对于图块则更为复杂：基地址是 `0x1C800`，你需要根据图块在世界中的 `x` 和 `y` 坐标来计算偏移量，步长为每图块 16 像素。

![《超级马里奥世界》带有调试覆层，显示精灵内存地址和马里奥的位置](/images/laupok-mario-ai/memory-debug.jpg)

---

## 基础知识：遗传算法与神经网络

在深入代码之前，你需要理解两个基本概念。没有它们，其他一切都无法理解。

### 遗传算法

遗传算法是对**进化论**的模拟。核心思想是：你创建一个**种群**，由多个个体组成，每个个体具有略微不同的特征（"基因"）。你让它们在一个环境中"生活"。表现最好的个体存活下来并繁殖。表现差的则被淘汰。

Laupok 用**卡比**类比来说明：
- 一群卡比出现在有尖刺和番茄的地形上
- 尖刺会扣除生命值，番茄会恢复生命值
- 每个卡比都有基因：体型、速度、生命值、行为（逃跑、寻找番茄、盲目奔跑）

![DNA 双螺旋结构，标注了"宝宝"、"体型"、"速度"、"颜色"----构成个体的基因](/images/laupok-mario-ai/dna-genes.jpg)

- 15 秒后，检查谁存活的时间最长
- 最好的卡比与其他个体交配：后代继承一半最佳基因和一半"最差"基因
- 后代会发生随机**突变**（大一点、快一点……）
- 旧的卡比被新的取代
- 重新开始

经过 180 代（约 15 小时），卡比的存活时间从 15 秒提升到了 **15 分钟**。它们变得体型更小（碰撞体积更小）、速度更快，并且会持续逃避危险。

![卡比模拟第 0 代：彩色圆点随机散布在黑色背景上，大小相似](/images/laupok-mario-ai/kirby-gen0.jpg)

![卡比模拟第 1866 代：卡比变得更小、更快，并系统性地逃离危险](/images/laupok-mario-ai/kirby-gen1866.jpg)

![卡比模拟统计数据：适应度、生命值、每个个体按表现排名的行为](/images/laupok-mario-ai/kirby-stats.jpg)

关键在于：**你不需要定义解决方案**。算法会**自己找到**。这正是它在你不知道最优参数组合是什么的问题上如此强大的原因。

### 人工神经网络

神经网络是人脑的简化数学模型。它由以下部分组成：
- **输入神经元**：网络"看到"的内容
- **输出神经元**：网络"决定"的内容
- **连接（权重）**：每条连接有一个**权重**，用于放大或抑制信号

原理很简单：每个输入神经元发送它的值。这个值乘以连接权重，然后与其他信号相加。如果结果超过某个阈值（**激活函数**），输出神经元就会激活。

在 Laupok 关于马里奥和鼠标光标的类比中：
- 输入神经元 = 马里奥与光标之间的距离
- 连接权重 = 马里奥的敏感度
- 输出神经元 = 马里奥是否尖叫

光标越近，输入值越高。如果权重很强，输出信号就强，马里奥就会尖叫。改变权重就改变了马里奥的敏感度。

!["马里奥害怕了"演示：马里奥面对一个幽灵，突触条显示输入和输出之间的连接权重](/images/laupok-mario-ai/mario-fear-demo.jpg)

在实际 AI 的神经网络中，逻辑是一样的，但规模大得多：
- **99 个输入神经元**（11×9 个图块，马里奥的视野）
- **8 个输出神经元**（A、B、X、Y、上、下、左、右）
- 中间的**隐藏神经元**
- 数百条具有不同权重的连接

---

## NEAT：改变一切的算法

### 基础遗传算法的问题

如果你简单地将遗传算法与神经网络结合，会面临一个问题：你创建了 100 个完全不同的神经网络，但你无法比较它们。每个网络都有自己的神经元、连接和权重。你怎么知道两个网络是"相似"还是"不同"？

这就是 **NEAT** 的用武之地----增强拓扑的神经进化。由 **Kenneth Stanley** 和 **Risto Miikkulainen** 在 2002 年提出，它恰恰解决了这个问题。

### 物种

NEAT 的第一个关键机制是**物种**。当一个神经网络与另一个差异太大时，它会被归类到不同的物种中。相似度通过三个参数计算：

1. **多余基因**（`EXCES_COEF = 0.50`）：两个网络之间没有共同点的连接数量（不同的创新）
2. **不相交基因**：同上，但针对中间部分的连接
3. **权重差异**（`POIDSDIFF_COEF = 0.92`）：共享相同创新的连接之间的平均权重差异

评分公式：

```
score = (EXCES_COEF × disjoint) / max(nbConnexions1 + nbConnexions2, 1)
      + POIDSDIFF_COEF × diffPoids
```

如果这个分数低于 `DIFF_LIMITE`（1.0），两个网络就属于同一物种。否则，创建一个新物种。

### 创新编号

这是 NEAT 的精妙之处。每次创建一条连接时，它会获得一个唯一的全局**创新**编号。即使在网络繁殖后，这个编号也会跟随神经网络。

具体来说，当通过交叉产生一个后代时，它会继承父母的创新编号。如果两个网络共享相同的创新编号，说明它们拥有来自同一祖先的连接。这使得比较不同规模的网络成为可能。

### 交叉

当两个神经网络繁殖时，**交叉**的工作方式如下：

![Laupok 解释交叉概念，叠加文字"CROSSOVER"](/images/laupok-mario-ai/crossover-label.jpg)

1. 表现更好的网络成为"优势亲本"
2. 后代继承优势亲本的所有连接
3. 对于每条共享相同创新的连接，另一个亲本有 50% 的概率替换它
4. 只有来自非优势亲本的活跃连接才能替换

这保证了后代至少不比最好的亲本差。

### 突变

交叉之后，后代会经历具有可配置概率的突变：

![Laupok 解释突变，叠加文字"(small modif = mutation)"](/images/laupok-mario-ai/mutation-label.jpg)

| 突变类型 | 概率 | 效果 |
|----------|------|------|
| 重置连接权重 | 25% | 权重完全随机化 |
| 权重突变 | 95% | 权重变化 ±0.80 |
| 添加连接 | 85% | 在两个未连接的神经元之间创建新连接 |
| 添加神经元 | 39% | 在两个已连接的神经元之间插入一个隐藏神经元 |

添加神经元的概率很重要：正是它使网络能够**成长**。一开始只有输入和输出。逐渐地，隐藏神经元出现，使网络变得越来越复杂。

---

## 代码：完整解析

### 常量

脚本以一组定义所有设置的常量开始：

```lua
-- Mario's view around him
TAILLE_TILE = 16
TAILLE_VUE_W = TAILLE_TILE * 11  -- 176 pixels wide
TAILLE_VUE_H = TAILLE_TILE * 9   -- 144 pixels tall
NB_TILE_W = TAILLE_VUE_W / TAILLE_TILE  -- 11 tiles
NB_TILE_H = TAILLE_VUE_H / TAILLE_TILE  -- 9 tiles

-- Neural network
NB_INPUT = NB_TILE_W * NB_TILE_H  -- 99 inputs (visible tiles)
NB_OUTPUT = 8  -- A, B, X, Y, Up, Down, Left, Right
NB_INDIVIDU_POPULATION = 100  -- individuals per population
NB_NEURONE_MAX = 100000  -- max hidden neurons

-- Fitness
FITNESS_LEVEL_FINI = 1000000  -- value when level is finished
NB_FRAME_RESET_BASE = 33  -- frames without progress before reset
NB_FRAME_RESET_PROGRES = 300  -- frames if progress detected

-- Species
EXCES_COEF = 0.50
POIDSDIFF_COEF = 0.92
DIFF_LIMITE = 1.00

-- Mutations
CHANCE_MUTATION_RESET_CONNEXION = 0.25
POIDS_CONNEXION_MUTATION_AJOUT = 0.80
CHANCE_MUTATION_POIDS = 0.95
CHANCE_MUTATION_CONNEXION = 0.85
CHANCE_MUTATION_NEURONE = 0.39
```

`NB_INPUT` 为 99，因为马里奥的视野是 11×9 个图块。每个图块就是一个输入神经元。空图块 = 0。砖块 = 1。敌人 = -1。

8 个输出对应 SNES 手柄按钮：A、B、X、Y、上、下、左、右。排除了 Start、Select、L 和 R，以免"分散"马里奥的注意力。

### 数据结构

脚本定义了三个主要结构：

```lua
function newNeurone()
    local neurone = {}
    neurone.valeur = 0    -- current neuron value
    neurone.id = 0        -- unique identifier
    neurone.type = ""     -- "input", "output", or "hidden"
    return neurone
end

function newConnexion()
    local connexion = {}
    connexion.entree = 0     -- source neuron ID
    connexion.sortie = 0     -- destination neuron ID
    connexion.actif = true   -- can be disabled if a hidden neuron is inserted
    connexion.poids = 0      -- connection weight
    connexion.innovation = 0 -- unique innovation number
    connexion.allume = false -- for display: true if signal passes
    return connexion
end

function newReseau()
    local reseau = {
        nbNeurone = 0,        -- number of hidden neurons
        fitness = 1,          -- performance (distance traveled)
        idEspeceParent = 0,   -- which species it belongs to
        lesNeurones = {},     -- neuron array
        lesConnexions = {}    -- connection array
    }
    -- Initialize with inputs
    for j = 1, NB_INPUT, 1 do
        ajouterNeurone(reseau, j, "input", 1)
    end
    -- Then outputs
    for j = NB_INPUT + 1, NB_INPUT + NB_OUTPUT, 1 do
        ajouterNeurone(reseau, j, "output", 0)
    end
    return reseau
end
```

一开始，每个网络只有输入和输出。没有隐藏神经元，没有连接。算法会自行判断是否需要。

### 突变详解

#### 权重突变

```lua
function mutationPoidsConnexions(unReseau)
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            if math.random() < CHANCE_MUTATION_RESET_CONNEXION then
                -- 25%: total weight reset
                unReseau.lesConnexions[i].poids = genererPoids()
            else
                -- 75%: variation of ±0.80
                if math.random() >= 0.5 then
                    unReseau.lesConnexions[i].poids =
                        unReseau.lesConnexions[i].poids - POIDS_CONNEXION_MUTATION_AJOUT
                else
                    unReseau.lesConnexions[i].poids =
                        unReseau.lesConnexions[i].poids + POIDS_CONNEXION_MUTATION_AJOUT
                end
            end
        end
    end
end
```

初始权重始终是 1 或 -1（`genererPoids()`）。±0.80 的变化可以使权重在正负值之间大幅摆动，从而从根本上改变网络的行为。

#### 添加连接

```lua
function mutationAjouterConnexion(unReseau)
    local liste = {}
    -- Shuffle the neuron list
    for i, v in ipairs(unReseau.lesNeurones) do
        local pos = math.random(1, #liste+1)
        table.insert(liste, pos, v)
    end

    local traitement = false
    for i = 1, #liste, 1 do
        for j = 1, #liste, 1 do
            if i ~= j then
                local n1 = liste[i]
                local n2 = liste[j]
                -- Valid connection: input→output, hidden→hidden, hidden→output
                if (n1.type == "input" and n2.type == "output") or
                   (n1.type == "hidden" and n2.type == "hidden") or
                   (n1.type == "hidden" and n2.type == "output") then
                    -- Check no connection already exists
                    local dejaConnexion = false
                    for k = 1, #unReseau.lesConnexions, 1 do
                        if unReseau.lesConnexions[k].entree == n1.id
                            and unReseau.lesConnexions[k].sortie == n2.id then
                            dejaConnexion = true
                            break
                        end
                    end
                    if dejaConnexion == false then
                        traitement = true
                        ajouterConnexion(unReseau, n1.id, n2.id)
                    end
                end
            end
            if traitement then break end
        end
        if traitement then break end
    end
end
```

不能将输出连接到输入（那样会形成循环），也不能连接两个已经相连的神经元。打乱顺序保证了每次都会探索不同的可能性。

#### 添加神经元

这是最有趣的突变：

```lua
function mutationAjouterNeurone(unReseau)
    if #unReseau.lesConnexions == 0 then return nil end
    if unReseau.nbNeurone == NB_NEURONE_MAX then return nil end

    -- Shuffle connections
    local listeRandom = {}
    for i = 1, #unReseau.lesConnexions, 1 do
        local pos = math.random(1, #listeRandom+1)
        table.insert(listeRandom, pos, i)
    end

    for i = 1, #listeRandom, 1 do
        if unReseau.lesConnexions[listeRandom[i]].actif then
            -- Disable the existing connection
            unReseau.lesConnexions[listeRandom[i]].actif = false
            unReseau.nbNeurone = unReseau.nbNeurone + 1
            local indice = unReseau.nbNeurone + NB_INPUT + NB_OUTPUT

            -- Create the hidden neuron
            ajouterNeurone(unReseau, indice, "hidden", 1)

            -- Connect input to hidden neuron
            ajouterConnexion(unReseau,
                unReseau.lesConnexions[listeRandom[i]].entree,
                indice, genererPoids())

            -- Connect hidden neuron to output
            ajouterConnexion(unReseau,
                indice,
                unReseau.lesConnexions[listeRandom[i]].sortie,
                genererPoids())
            break
        end
    end
end
```

机制是：你取一条现有的连接，**禁用它**，然后在中间插入一个隐藏神经元。原始连接被两条新连接取代：输入→隐藏 和 隐藏→输出。这就像剪断一根电线，在中间接入一个开关。

这正是 NEAT "增强拓扑"的含义：网络会随时间**成长**。它从简单开始，只有在必要时才会变得复杂。

### 前向传播（feedForward）

这是将信号通过网络传播的函数：

```lua
function feedForward(unReseau)
    -- Reset output neurons
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur = 0
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].allume = false
        end
    end

    -- Propagation
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            local avantTraitement = unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur =
                unReseau.lesNeurones[unReseau.lesConnexions[i].entree].valeur *
                unReseau.lesConnexions[i].poids +
                unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur

            if avantTraitement ~= unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur then
                unReseau.lesConnexions[i].allume = true
            else
                unReseau.lesConnexions[i].allume = false
            end
        end
    end
end
```

每条活跃的连接将 `输入值 × 权重` 发送到输出神经元。值是**累加**的（相加）。`allume` 标志仅用于可视化网络显示。

### 读取游戏内存

`getLesInputs()` 函数将《超级马里奥世界》的世界转换为网络可以理解的数据：

```lua
function getLesInputs()
    local lesInputs = {}
    -- Initialize to 0 (gray = nothing)
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            lesInputs[getIndiceLesInputs(i, j)] = 0
        end
    end

    -- Sprites (enemies) = -1 (black)
    local lesSprites = getLesSprites()
    for i = 1, #lesSprites, 1 do
        local input = convertirPositionPourInput(getLesSprites()[i])
        if input.x > 0 and input.x < (TAILLE_VUE_W / TAILLE_TILE) + 1 then
            lesInputs[getIndiceLesInputs(input.x, input.y)] = -1
        end
    end

    -- Tiles (blocks) = tile value (white if > 0)
    local lesTiles = getLesTiles()
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            local indice = getIndiceLesInputs(i, j)
            if lesTiles[indice] ~= 0 then
                lesInputs[indice] = lesTiles[indice]
            end
        end
    end

    return lesInputs
end
```

输入网格是一个以马里奥为中心的视野：11 个图块宽，9 个图块高。每个图块的值为：
- **0**（灰色）：空无一物
- **1**（白色）：实心砖块
- **-1**（黑色）：敌人

敌人从 RAM 中的两个列表读取：普通精灵（`0x14C8`-`0x14F8`）和扩展精灵（`0x170B`-`0x173B`）。对于每个存活的精灵（状态 > 7），会计算其相对于马里奥的图块位置，并在对应的单元格中放置 -1。

### 适应度：AI 如何知道自己在进步

```lua
function majReseau(unReseau, marioBase)
    local mario = getPositionMario()

    if not niveauFini and memory.readbyte(0x0100) == 12 then
        -- Level finished!
        unReseau.fitness = FITNESS_LEVEL_FINI
        niveauFini = true
    elseif marioBase.x < mario.x then
        -- Mario moved right
        unReseau.fitness = unReseau.fitness + (mario.x - marioBase.x)
        marioBase.x = mario.x
    end

    -- Update inputs
    local lesInputs = getLesInputs()
    for i = 1, NB_INPUT, 1 do
        unReseau.lesNeurones[i].valeur = lesInputs[i]
    end
end
```

适应度很简单：就是**向右移动的距离**。如果马里奥移动了 10 像素，适应度就增加 10。如果马里奥向左移动，什么都不会发生（没有惩罚）。如果关卡完成（地址 `0x0100` == 12），适应度变为 1,000,000。

这是故意设计得这么简单的。击杀敌人没有奖励，死亡没有惩罚。就是：向右移动。

### 智能重置

如果马里奥在 33 帧内没有移动，关卡会重置，并进入下一个个体。但如果马里奥取得了进展（当前适应度与初始值不同），则等待 300 帧----给网络一个机会来"理解"它做对了什么。

```lua
if fitnessAvant == laPopulation[idPopulation].fitness
   and memory.readbyte(0x13D4) == 0 then
    nbFrameStop = nbFrameStop + 1
    local nbFrameReset = NB_FRAME_RESET_BASE
    if fitnessInit ~= laPopulation[idPopulation].fitness
       and memory.readbyte(0x0071) ~= 9 then
        nbFrameReset = NB_FRAME_RESET_PROGRES
    end
    if nbFrameStop > nbFrameReset then
        nbFrameStop = 0
        lancerNiveau()
        idPopulation = idPopulation + 1
        -- ...
    end
end
```

条件 `memory.readbyte(0x0071) ~= 9` 检查马里奥是否不在死亡动画中。如果马里奥已经死了，重置就没有意义。

### 主循环

主循环以 30 fps 运行（《超级马里奥世界》的正常速度）：

```lua
while true do
    local fitnessAvant = laPopulation[idPopulation].fitness

    -- Display (network, info)
    if forms.ischecked(estAccelere) then
        emu.limitframerate(false)  -- speed up
    else
        emu.limitframerate(true)   -- 30 fps
    end

    -- The 3 vital functions
    majReseau(laPopulation[idPopulation], marioBase)
    feedForward(laPopulation[idPopulation])
    appliquerLesBoutons(laPopulation[idPopulation])

    emu.frameadvance()
    nbFrame = nbFrame + 1

    -- Reset if no progress
    -- ...
    -- New generation if all individuals tested
    -- ...
end
```

三个核心函数是 `majReseau`、`feedForward` 和 `appliquerLesBoutons`。禁用任何一个，马里奥就会停止移动。

### 交叉

```lua
function crossover(unReseau1, unReseau2)
    local leReseau = newReseau()
    local leBon = unReseau1
    local leNul = unReseau2

    if leBon.fitness < leNul.fitness then
        leBon = unReseau2
        leNul = unReseau1
    end

    leReseau = copier(leBon)

    for i = 1, #leReseau.lesConnexions, 1 do
        for j = 1, #leNul.lesConnexions, 1 do
            if leReseau.lesConnexions[i].innovation == leNul.lesConnexions[j].innovation
               and leNul.lesConnexions[j].actif then
                if math.random() > 0.5 then
                    leReseau.lesConnexions[i] = leNul.lesConnexions[j]
                end
            end
        end
    end
    leReseau.fitness = 1
    return leReseau
end
```

后代从更好的亲本继承。对于每条共享相同创新的连接，另一个亲本有 50% 的概率替换它----但**仅在该连接处于活跃状态时**。这是一个重要的修复：没有它，可能会创建无用的隐藏神经元。

### 物种选择

```lua
function nouvelleGeneration(laPopulation, lesEspeces)
    local laNouvellePopulation = newPopulation()
    local nbIndividuACreer = NB_INDIVIDU_POPULATION

    -- Calculate average fitness per species
    for i = 1, #lesEspeces, 1 do
        lesEspeces[i].fitnessMoyenne = 0
        for j = 1, #lesEspeces[i].lesReseaux, 1 do
            lesEspeces[i].fitnessMoyenne =
                lesEspeces[i].fitnessMoyenne + lesEspeces[i].lesReseaux[j].fitness
        end
        lesEspeces[i].fitnessMoyenne =
            lesEspeces[i].fitnessMoyenne / #lesEspeces[i].lesReseaux
    end

    -- Each species creates a number of children proportional to its average fitness
    for i = 1, #lesEspeces, 1 do
        local nbEnfant = math.ceil(
            #lesEspeces[i].lesReseaux *
            lesEspeces[i].fitnessMoyenne / fitnessMoyenneGlobal)

        for j = 1, nbEnfant, 1 do
            local unReseau = crossover(
                choisirParent(lesEspeces[i].lesReseaux),
                choisirParent(lesEspeces[i].lesReseaux))
            mutation(unReseau)
            laNouvellePopulation[indiceNouvelleEspece] = copier(unReseau)
        end
    end
end
```

思路是：平均适应度为 10,000 的物种产生的后代数量远多于平均适应度为 1 的物种。这就是**自然选择**的实际运作。

`choisirParent` 使用轮盘赌选择：一个个体的适应度越高，被选为亲本的概率就越大。

### 保存与加载

种群保存为 `.pop` 文件：

```lua
function sauvegarderUnReseau(unReseau, fichier)
    io.write(unReseau.nbNeurone .. "\n")
    io.write(#unReseau.lesConnexions .. "\n")
    io.write(unReseau.fitness .. "\n")
    for i = 1, unReseau.nbNeurone, 1 do
        local indice = NB_INPUT + NB_OUTPUT + i
        io.write(unReseau.lesNeurones[indice].id .. "\n")
    end
    for i = 1, #unReseau.lesConnexions, 1 do
        local actif = 1
        if unReseau.lesConnexions[i].actif ~= true then actif = 0 end
        io.write(actif .. "\n" ..
            unReseau.lesConnexions[i].entree .. "\n" ..
            unReseau.lesConnexions[i].sortie .. "\n" ..
            unReseau.lesConnexions[i].poids .. "\n" ..
            unReseau.lesConnexions[i].innovation .. "\n")
    end
end
```

保存还包括了所有先前种群中的最佳个体。如果旧种群的最佳个体比新种群的好，我们会恢复到旧种群作为基准。这是一种**精英策略**：最佳个体永远不会丢失。

### 网络可视化

Laupok 添加了一个叠加在游戏上的神经网络可视化器：

```lua
function dessinerUnReseau(unReseau)
    -- Inputs: 11×9 grid around Mario
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            local xT = ENCRAGE_X_INPUT + (i - 1) * TAILLE_INPUT
            local yT = ENCRAGE_Y_INPUT + (j - 1) * TAILLE_INPUT
            local couleurFond = "gray"
            if unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur < 0 then
                couleurFond = "black"   -- enemy
            elseif unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur > 0 then
                couleurFond = "white"   -- block
            end
            gui.drawRectangle(xT, yT, TAILLE_INPUT, TAILLE_INPUT, "black", couleurFond)
        end
    end

    -- Outputs: 8 buttons
    for i = 1, NB_OUTPUT, 1 do
        local xT = ENCRAGE_X_OUTPUT
        local yT = ENCRAGE_Y_OUTPUT + ESPACE_Y_OUTPUT * (i - 1)
        if sigmoid(unReseau.lesNeurones[i + NB_INPUT].valeur) then
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "white")
        else
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "black")
        end
    end

    -- Connections
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            local alpha = 25
            if unReseau.lesConnexions[i].allume then alpha = 255 end
            local couleur = forms.createcolor(255, 255, 255, alpha)
            gui.drawLine(
                lesPositions[unReseau.lesConnexions[i].entree].x,
                lesPositions[lesConnexions[i].entree].y,
                lesPositions[unReseau.lesConnexions[i].sortie].x,
                lesPositions[lesConnexions[i].sortie].y,
                couleur)
        end
    end
end
```

它对于理解网络在做什么非常有用。活跃的连接显示为白色，非活跃的显示为半透明。输入是白色/黑色/灰色单元格的网格。输出显示哪些按钮被按下。

---

## 结果

### AI 学会了什么

经过数小时（甚至数天）的运行，AI 自主发现：

1. **向右移动**：最基本的行为，但需要持续按住右键
2. **跳过敌人**：通过将"检测到敌人"的输入连接到 A 或 B 按钮
3. **避开障碍物**：一些网络学会了暂时后退以便走得更远
4. **通关**：最佳个体能够完成《超级马里奥世界》的第一个关卡

![由 AI 控制的马里奥在《超级马里奥世界》关卡中面对幽灵----神经网络实时决定动作](/images/laupok-mario-ai/mario-ai-playing.jpg)

### 局限性

这个项目有其局限：

- **单关卡训练**：AI 针对一个特定关卡训练。它不能自动泛化到其他关卡
- **训练时间**：需要数十小时才能获得满意的结果
- **不理解**：AI 并不"理解"自己在做什么。它通过随机突变来优化适应度函数（移动距离）
- **原地跳跃**：Laupok 指出马里奥在看到敌人时倾向于原地跳跃，仅仅因为这会增加适应度（跳跃时会稍微前进一点）

---

## 如何复现实验

Laupok 公开了所有内容。以下是步骤：

1. 从 [tasvideos.org](https://tasvideos.org/BizHawk) 下载 **BizHawk**（下载页面）
2. 获取《超级马里奥世界》的 **美版 ROM**（从自己的卡带中备份）
3. 从 [Pastebin](https://pastebin.com/Jcvdqhqm) 下载 **Lua 脚本**----重命名为 `mario.lua`
4. 将脚本放在与 ROM **相同的文件夹**中
5. **启动 BizHawk**，打开 ROM
6. 在 **Lua 控制台**中：`dofile("mario.lua")` 或通过 Script > Open Script 菜单
7. 在关卡开始处**保存存档状态**（Savestate > Save State 菜单），命名为 `debut.state`
8. **重新启动脚本**----即可运行

脚本包含一个带选项的表单：
- **加速**：禁用 30 fps 限制以加快速度
- **显示网络**：在游戏上叠加显示神经网络
- **显示信息**：显示包含代数、适应度和物种数量的信息栏
- **暂停**：暂停执行
- **保存/加载**：将当前种群持久化为 `.pop` 文件

---

## 资源与参考

| 资源 | 链接 |
|------|------|
| Laupok 的主视频 | [I built an AI that plays Mario by itself](https://www.youtube.com/watch?v=F63GNXGHVwM) |
| 代码讲解 + 设置视频 | [How to set up the AI + source code review](https://www.youtube.com/watch?v=u5xCl1bSe6o) |
| 完整源代码 | [Pastebin Jcvdqhqm](https://pastebin.com/Jcvdqhqm) |
| 原始 NEAT 论文 | Stanley & Miikkulainen, "Evolving Neural Networks through Augmenting Topologies", 2002 |
| N8Programs 教程 | [NEAT implementation walkthrough](https://n8programs.github.io/)（JavaScript，但概念相同） |
| 16blings（Laupok 的灵感来源） | [AI plays Super Mario World](https://www.youtube.com/watch?v=qv6IFaOz3bA) |
| BizHawk | [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) |
| 《超级马里奥世界》内存 | [SMW Central - RAM Map](https://www.smwcentral.net/?p=section&a=details&id=21702) |

---

## 结语

Laupok 所做的是将一个学术算法（NEAT，2002 年）用 Lua 为模拟器（BizHawk）重写，并将其应用于《超级马里奥世界》。结果是：一个从零开始学习玩游戏的 AI，没有任何先验知识，仅通过随机突变和自然选择实现。

这是遗传算法威力的一个美丽例证。没有深度学习，没有 GPU，没有数百万的训练数据。只有自然选择、一些 Lua 代码，以及大量的耐心。

代码有注释、已公开，Laupok 还制作了两个讲解视频----一个讲核心概念，一个讲代码实现。如果这个话题吸引你，那就深入研究吧。它比看起来更容易上手。
