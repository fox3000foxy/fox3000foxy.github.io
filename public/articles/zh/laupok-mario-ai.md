---
title: Laupok 做了个自己玩超级马里奥世界的 AI，它是怎么跑的
description: 一个自己玩超级马里奥世界的 AI。从零起步：失业预录帧。AI 靠随机变异和自然选择学会通关。项目跑在 BizHawk 上，一个约 4200 行的 Lua 脚本。
date: 2026-07-11
tags:
  - ai
  - lua
  - emulation
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "3xH+1dqfgltMqDZjY9MSVrSrFJa6zWOLj/rI+C3mZ3y3MVOA8lrzRcVcjlhUz3cZznoouMk7l6Wjfr4jk4PhNg=="
---

# Laupok 做了个自己玩超级马里奥世界的 AI，它是怎么跑的

Laupok 做了个**自己玩超级马里奥世界**的人工智能。全自动。从零起步：没有预设脚本，没有录像帧。AI 靠随机变异和自然选择学会通关。项目跑在 **BizHawk** 上，多平台模拟器，经约 **4200 行** Lua 脚本。

迷人的是它用的概念全是生物学往计算机搬：**达尔文进化论**、**人工神经网络**，还有个叫 **NEAT**（NeuroEvolution of Augmenting Topologies）的算法。AI 开局对游戏一无所知。随机试动作，死几千次，慢慢学会前进、跳、活命。

这篇全拆，概念一个个来，代码一行行来。

![Laupok 在镜头前介绍 NEAT 算法](/images/laupok-mario-ai/neat-title.jpg)

---

## 环境：BizHawk、Lua、超级马里奥世界

### BizHawk 模拟器

BizHawk 是开源模拟器，机种一堆，NES、SNES、Genesis、PS1、Game Boy 等等。特点是能并行跑 **Lua 脚本**。脚本读写模拟**内存**（RAM），实时读改游戏任何数据。

具体说能：
- 读马里奥在关卡的位置
- 知道屏幕上哪些 sprite（敌人、道具）
- 知道马里奥周围每块 tile 状态
- 按手柄，任意键

做 AI 正好全要。

### 超级马里奥世界内存地址

SMW 的 RAM 里每个数据固定地址。像街区：每地址是装信息的"房子"。比如：

| 地址 | 数据 |
|--------|--------|
| `0x94`-`0x95` | 马里奥 X 位置（16 位，小端） |
| `0x96`-`0x97` | 马里奥 Y 位置 |
| `0x14C8`+`i` | sprite `i` 状态（>7 活着） |
| `0xE4`+`i` | sprite `i` X 低字节 |
| `0x14E0`+`i` | sprite `i` X 高字节 |
| `0xD8`+`i` | sprite `i` Y 低字节 |
| `0x14D4`+`i` | sprite `i` Y 高字节 |
| `0x170B`+`i` | extended sprite `i` 类型 |
| `0x0100` | 游戏状态（12 = 过关） |
| `0x13D4` | 暂停 |
| `0x0071` | 马里奥死亡动画（9 = 死了） |
| `0x1C800`+... | 关卡 tile 表 |

sprite 位置两字节：低字节加高字节，位置超 255 像素就这么办。公式永远低 + 高 × 256。

tile 复杂：基址 `0x1C800`，按 tile 在世界 `x` `y` 坐标算偏移，tile 16 像素步进。

![带调试 overlay 的超级马里奥世界，显示 sprite 内存地址和马里奥位置](/images/laupok-mario-ai/memory-debug.jpg)

---

## 前置：遗传算法和神经网络

先讲两个基本概念。不懂后面全白看。

### 遗传算法

遗传算法就是**进化论**模拟。核心：建**种群**，个体**基因**各不相同。放环境里活。活得好的生，活不好的死。

Laupok 用**卡比**打比方：
- 卡比种群出生在带刺和番茄的场上
- 刺扣血，番茄回血
- 每只卡比有基因：大小、速度、血量、行为（跑、找番茄、乱冲）

![DNA 双螺旋，标“宝宝”、大小、速度、颜色，组成个体的基因](/images/laupok-mario-ai/dna-genes.jpg)

- 15 秒后看谁活最久
- 最好的卡比和其他的生：宝宝一半基因来自最好的，一半来自"最烂"
- 宝宝**随机变异**（大一点、快一点……）
- 老卡比换掉新的
- 重来

180 代（约 15 小时）后，卡比从活 15 秒到活 **15 分钟**。变小了（受击面积小）、快了、永远躲危险。

![卡比模拟第 0 代：黑底彩色圆随机散，大小差不多](/images/laupok-mario-ai/kirby-gen0.jpg)

![卡比模拟第 1866 代：卡比更小更快，系统躲危险](/images/laupok-mario-ai/kirby-gen1866.jpg)

![卡比模拟统计：fitness、血量、每只行为按成绩排](/images/laupok-mario-ai/kirby-stats.jpg)

关键：**不定义解**。算法自己**找**出来。这就是它在不知道最优参数组合长什么样的问题上强的原因。

### 人工神经网络

神经网络是简化版人脑数学模型。组成：
- **输入神经元**：网络"看"到的
- **输出神经元**：网络"决定"的
- **连接**（权重）：每条连接有个**权重**放大或衰减信号

原理简单：每个输入发值。乘连接权重，加别的信号。如果结果过阈（**激活函数**），输出神经元激活。

Laupok 拿马里奥和鼠标指针打比方：
- 输入神经元 = 马里奥和指针距离
- 连接权重 = 马里奥敏感度
- 输出神经元 = 马里奥叫不叫

指针越近输入值越大。权重强输出信号强，马里奥叫。改权重改马里奥敏感度。

!["马里奥害怕"演示：马里奥面對 Boo，突触条显示输入输出连接权重](/images/laupok-mario-ai/mario-fear-demo.jpg)

真 AI 神经网络同理，规模大：
- **99 输入神经元**（马里奥视野 11x9 tile）
- **8 输出神经元**（A、B、X、Y、上、下、左、右）
- 中间**隐藏神经元**
- 几百条权重各异的连接

---

## NEAT：改命的算法

### 朴素遗传加神经网络的问题

遗传算法加神经网络直接拼，有麻烦：造 100 个完全不同的神经网络，没法比。神经元、连接、权重各不同。两网络"近"还是"远"？

**NEAT** 上场，NeuroEvolution of Augmenting Topologies。**Kenneth Stanley** 和 **Risto Miikkulainen** 2002 年发明，专解这个问题。

### 物种

NEAT 第一关键机制**物种**。神经网络和另一个差太多，分不同物种。相似度三参数：

1. **Excess**（`EXCES_COEF = 0.50`）：两网络风马牛不相及的连接数（不同 innovation）
2. **Disjoint**：同上，但是中间位置的连接
3. **权重差**（`POIDSDIFF_COEF = 0.92`）：共享 innovation 连接的平均权重差

分数公式：

```
分数 = (EXCES_COEF × disjoint) / max(连接数1 + 连接数2, 1)
       + POIDSDIFF_COEF × 权重差
```

分数小于 `DIFF_LIMITE`（1.0），两网络同物种。否则开新物种。

### innovation

NEAT 的天才。每条连接出生拿全局唯一 **innovation** 号。号码跟网络走，繁殖也带着。

实际宝宝交叉继承亲本 innovation。两网络共享 innovation，说明这条连接同祖。大小不同的网络也能比了。

### 交叉

两神经网络繁殖，**交叉**这么跑：

![Laupok 讲 crossover，叠字"CROSSOVER"](/images/laupok-mario-ai/crossover-label.jpg)

1. 成绩好的当"显性亲本"
2. 宝宝全盘继承显性的连接
3. 每条共享 innovation 的连接，非显性亲本 50% 概率替换
4. 只有非显性亲本*活跃*连接能替换

保证宝宝至少不比最好的亲本差。

### 变异

交叉后宝宝按可配概率变异：

![Laupok 讲变异，叠字"(petite modif = mutation)"](/images/laupok-mario-ai/mutation-label.jpg)

| 变异 | 概率 | 效果 |
|----------|------------|--------|
| 连接权重重置 | 25% | 权重全随机 |
| 权重变异 | 95% | 权重 ±0.80 浮动 |
| 加连接 | 85% | 没连的两神经元连上 |
| 加神经元 | 39% | 两连着的神经元中间插隐藏神经元 |

加神经元概率重要：网络**长大**。开局只有输入输出。隐藏神经元慢慢冒出来，网络越来越复杂。

---

## 代码：完整走读

### 常量

脚本开头一串常量定全部参数：

```lua
-- 马里奥周围视野
TAILLE_TILE = 16
TAILLE_VUE_W = TAILLE_TILE * 11  -- 宽 176 像素
TAILLE_VUE_H = TAILLE_TILE * 9   -- 高 144 像素
NB_TILE_W = TAILLE_VUE_W / TAILLE_TILE  -- 11 tile
NB_TILE_H = TAILLE_VUE_H / TAILLE_TILE  -- 9 tile

-- 神经网络
NB_INPUT = NB_TILE_W * NB_TILE_H  -- 99 输入（看得到的 tile）
NB_OUTPUT = 8  -- A、B、X、Y、上、下、左、右
NB_INDIVIDU_POPULATION = 100  -- 每代个体
NB_NEURONE_MAX = 100000  -- 隐藏神经元上限

-- Fitness
FITNESS_LEVEL_FINI = 1000000  -- 过关分值
NB_FRAME_RESET_BASE = 33  -- 没进展多少帧重置
NB_FRAME_RESET_PROGRES = 300  -- 有进展给多少帧

-- 物种
EXCES_COEF = 0.50
POIDSDIFF_COEF = 0.92
DIFF_LIMITE = 1.00

-- 变异
CHANCE_MUTATION_RESET_CONNEXION = 0.25
POIDS_CONNEXION_MUTATION_AJOUT = 0.80
CHANCE_MUTATION_POIDS = 0.95
CHANCE_MUTATION_CONNEXION = 0.85
CHANCE_MUTATION_NEURONE = 0.39
```

`NB_INPUT` 99 因为马里奥视野 11x9 tile。每 tile 一输入。tile 空 0。块 1。敌人 -1。

8 输出对应 SNES 手柄键：A、B、X、Y、上、下、左、右。Start、Select、L、R 不用，决策越少越好。

### 数据结构

脚本定三个主结构：

```lua
function newNeurone()
    local neurone = {}
    neurone.valeur = 0    -- 神经元当前值
    neurone.id = 0        -- 唯一标识
    neurone.type = ""     -- "input"、"output" 或 "hidden"
    return neurone
end

function newConnexion()
    local connexion = {}
    connexion.entree = 0     -- 源神经元 ID
    connexion.sortie = 0     -- 目标神经元 ID
    connexion.actif = true   -- 插隐藏神经元可关掉
    connexion.poids = 0      -- 连接权重
    connexion.innovation = 0 -- 唯一 innovation 号
    connexion.allume = false -- 显示用：有信号过就亮
    return connexion
end

function newReseau()
    local reseau = {
        nbNeurone = 0,        -- 隐藏神经元数
        fitness = 1,          -- 成绩（走多远）
        idEspeceParent = 0,   -- 属于哪个物种
        lesNeurones = {},     -- 神经元表
        lesConnexions = {}    -- 连接表
    }
    -- 先初始化输入
    for j = 1, NB_INPUT, 1 do
        ajouterNeurone(reseau, j, "input", 1)
    end
    -- 再输出
    for j = NB_INPUT + 1, NB_INPUT + NB_OUTPUT, 1 do
        ajouterNeurone(reseau, j, "output", 0)
    end
    return reseau
end
```

开局每个网络只有输入输出：无隐藏神经元，无连接。要不要长算法定。

### 变异细看

#### 权重变异

```lua
function mutationPoidsConnexions(unReseau)
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            if math.random() < CHANCE_MUTATION_RESET_CONNEXION then
                -- 25%：权重全重置
                unReseau.lesConnexions[i].poids = genererPoids()
            else
                -- 75%：±0.80 浮动
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

初始权重永远 1 或 -1（`genererPoids()`）。±0.80 浮动能在正负间荡，网络行为大变。

#### 加连接

```lua
function mutationAjouterConnexion(unReseau)
    local liste = {}
    -- 神经元表打乱
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
                -- 合法连接：输入→输出、隐藏→隐藏、隐藏→输出
                if (n1.type == "input" and n2.type == "output") or
                   (n1.type == "hidden" and n2.type == "hidden") or
                   (n1.type == "hidden" and n2.type == "output") then
                    -- 查是不是已经连了
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

输出连输入不行（成环），连过的 pair 不重连。打乱保证每次探索不同可能。

#### 加神经元

最有意思的变异：

```lua
function mutationAjouterNeurone(unReseau)
    if #unReseau.lesConnexions == 0 then return nil end
    if unReseau.nbNeurone == NB_NEURONE_MAX then return nil end

    -- 连接打乱
    local listeRandom = {}
    for i = 1, #unReseau.lesConnexions, 1 do
        local pos = math.random(1, #listeRandom+1)
        table.insert(listeRandom, pos, i)
    end

    for i = 1, #listeRandom, 1 do
        if unReseau.lesConnexions[listeRandom[i]].actif then
            -- 关掉已有连接
            unReseau.lesConnexions[listeRandom[i]].actif = false
            unReseau.nbNeurone = unReseau.nbNeurone + 1
            local indice = unReseau.nbNeurone + NB_INPUT + NB_OUTPUT

            -- 建隐藏神经元
            ajouterNeurone(unReseau, indice, "hidden", 1)

            -- 输入连隐藏
            ajouterConnexion(unReseau,
                unReseau.lesConnexions[listeRandom[i]].entree,
                indice, genererPoids())

            -- 隐藏连输出
            ajouterConnexion(unReseau,
                indice,
                unReseau.lesConnexions[listeRandom[i]].sortie,
                genererPoids())
            break
        end
    end
end
```

机制：挑条已有连接**关掉**，中间插隐藏神经元。原来一条变两条：输入→隐藏和隐藏→输出。像把电线剪断中间串开关。

这就是 NEAT "augmenting topologies"：网络随时间**长大**。简单开局，只在必要时变复杂。

### feedForward

信号前向传播函数：

```lua
function feedForward(unReseau)
    -- 输出神经元清零
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur = 0
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].allume = false
        end
    end

    -- 传播
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

每条活跃连接送 `输入值 × 权重` 到输出神经元。值**累加**。`allume` 旗只管网络可视化：有信号过就亮。

### 读游戏内存

`getLesInputs()` 把超级马里奥世界翻译成网络懂的数据：

```lua
function getLesInputs()
    local lesInputs = {}
    -- 初始化 0（灰 = 空）
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            lesInputs[getIndiceLesInputs(i, j)] = 0
        end
    end

    -- sprite（敌人）= -1（黑）
    local lesSprites = getLesSprites()
    for i = 1, #lesSprites, 1 do
        local input = convertirPositionPourInput(getLesSprites()[i])
        if input.x > 0 and input.x < (TAILLE_VUE_W / TAILLE_TILE) + 1 then
            lesInputs[getIndiceLesInputs(input.x, input.y)] = -1
        end
    end

    -- tile（块）= tile 值（> 0 白）
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

输入格是以马里奥为中心的视野：宽 11 tile，高 9 tile。每格值：
- **0**（灰）：空
- **1**（白）：实心块
- **-1**（黑）：敌人

敌人从 RAM 两表读：普通 sprite（`0x14C8`-`0x14F8`）和 extended sprite（`0x170B`-`0x173B`）。每活 sprite（状态 > 7）算相对马里奥的 tile 位置，对应格写 -1。

### fitness：AI 怎么知道有没有进步

```lua
function majReseau(unReseau, marioBase)
    local mario = getPositionMario()

    if not niveauFini and memory.readbyte(0x0100) == 12 then
        -- 过关！
        unReseau.fitness = FITNESS_LEVEL_FINI
        niveauFini = true
    elseif marioBase.x < mario.x then
        -- 马里奥向右走
        unReseau.fitness = unReseau.fitness + (mario.x - marioBase.x)
        marioBase.x = mario.x
    end

    -- 更新输入
    local lesInputs = getLesInputs()
    for i = 1, NB_INPUT, 1 do
        unReseau.lesNeurones[i].valeur = lesInputs[i]
    end
end
```

fitness 简单粗暴：**向右走多远**。马里奥右移 10 像素 fitness 加 10。后退不扣分。过关（地址 `0x0100` == 12）fitness 直接 100 万。

故意简单。只有向右算数：杀怪不加分，死不扣分。

### 智能重置

马里奥 33 帧不动，重置关卡换下个个体。马里奥有进展（fitness 和开局不一样），等 300 帧，给网络"想明白"的机会。

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

`memory.readbyte(0x0071) ~= 9` 查马里奥不在死亡动画。死了重置没意义。

### 主循环

循环跑 30 fps（超级马里奥世界正常速度）：

```lua
while true do
    local fitnessAvant = laPopulation[idPopulation].fitness

    -- 显示（网络、信息）
    if forms.ischecked(estAccelere) then
        emu.limitframerate(false)  -- 加速
    else
        emu.limitframerate(true)   -- 30 fps
    end

    -- 3 个 vital 函数
    majReseau(laPopulation[idPopulation], marioBase)
    feedForward(laPopulation[idPopulation])
    appliquerLesBoutons(laPopulation[idPopulation])

    emu.frameadvance()
    nbFrame = nbFrame + 1

    -- 没进展重置
    -- ...
    -- 全测完新一代
    -- ...
end
```

`majReseau`、`feedForward`、`appliquerLesBoutons` 三个缺一，马里奥不动。

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

宝宝继承好亲本。每条共享 innovation 的连接，差亲本 50% 概率替换，**只限活跃连接**。重要修：不然没用的隐藏神经元乱生。

### 按物种选

```lua
function nouvelleGeneration(laPopulation, lesEspeces)
    local laNouvellePopulation = newPopulation()
    local nbIndividuACreer = NB_INDIVIDU_POPULATION

    -- 算每物种平均 fitness
    for i = 1, #lesEspeces, 1 do
        lesEspeces[i].fitnessMoyenne = 0
        for j = 1, #lesEspeces[i].lesReseaux, 1 do
            lesEspeces[i].fitnessMoyenne =
                lesEspeces[i].fitnessMoyenne + lesEspeces[i].lesReseaux[j].fitness
        end
        lesEspeces[i].fitnessMoyenne =
            lesEspeces[i].fitnessMoyenne / #lesEspeces[i].lesReseaux
    end

    -- 每物种按平均 fitness 比例生孩子
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

思路：平均 fitness 10000 的物种比平均 1 的多生得多孩子。这就是**自然选择**。

`choisirParent` 轮盘赌：fitness 越高当爹概率越大。

### 保存和加载

种群存 `.pop` 文件：

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

存全部种群加之前所有代最好的。如果老最好的比新一代最好的强，拿老的当底子。一种**精英主义**：最好的永不丢。

### 画网络

Laupok 给网络加了游戏内 overlay 可视化：

```lua
function dessinerUnReseau(unReseau)
    -- 输入：马里奥周围 11x9 格
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            local xT = ENCRAGE_X_INPUT + (i - 1) * TAILLE_INPUT
            local yT = ENCRAGE_Y_INPUT + (j - 1) * TAILLE_INPUT
            local couleurFond = "gray"
            if unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur < 0 then
                couleurFond = "black"   -- 敌人
            elseif unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur > 0 then
                couleurFond = "white"   -- 块
            end
            gui.drawRectangle(xT, yT, TAILLE_INPUT, TAILLE_INPUT, "black", couleurFond)
        end
    end

    -- 输出：8 个键
    for i = 1, NB_OUTPUT, 1 do
        local xT = ENCRAGE_X_OUTPUT
        local yT = ENCRAGE_Y_OUTPUT + ESPACE_Y_OUTPUT * (i - 1)
        if sigmoid(unReseau.lesNeurones[i + NB_INPUT].valeur) then
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "white")
        else
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "black")
        end
    end

    -- 连接
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

看网络在干嘛超有用。活跃连接白色，不活跃半透明。输入是白黑灰格子。输出看哪个键按着。

---

## 成果

### AI 学会了什么

跑几小时（几天）下来，AI 自己悟出：

1. **向右走**：最基础，但右键得一直按着
2. **跳过敌人**：敌人输入连 A 或 B 键
3. **绕障碍**：有些网络学会暂时后退再前进
4. **过关**：最好的个体打通超级马里奥世界第一关

![AI 操作的马里奥在超级马里奥世界里面对 Boo，神经网络实时决策](/images/laupok-mario-ai/mario-ai-playing.jpg)

### 局限

项目有墙：

- **只会一关**：单关训的，不自动泛化到别的关
- **训练时间**：像样结果要几十小时
- **不懂**：AI 不"理解"自己干嘛。按 fitness 函数（走多远）随机变异优化
- **蹭地**：Laupok 说马里奥见敌人爱原地跳，因为跳也往前蹭涨 fitness

---

## 复现实验

Laupok 全开源了。步骤：

1. **下 BizHawk** [tasvideos.org](https://tasvideos.org/BizHawk)（Download 区）
2. **搞 USA 版超级马里奥世界 ROM**（自己卡带备份）
3. **下 Lua 脚本** [Pastebin](https://pastebin.com/Jcvdqhqm)，改名 `mario.lua`
4. **脚本和 ROM 放同一文件夹**
5. **开 BizHawk**，打开 ROM
6. **Lua 控制台**：`dofile("mario.lua")` 或菜单 Script > Open Script
7. **存档**开头（菜单 Savestate > Save State）起名 `debut.state`
8. **重跑脚本**，成了

脚本带表单选项：
- **加速**：关 30 fps 上限跑更快
- **显示网络**：overlay 显示神经网络
- **显示信息**：横幅显示代数、fitness、物种数
- **暂停**：暂停执行
- **保存/加载**：当前种群存 `.pop` 文件

---

## 来源和参考

| 资源 | 链接 |
|-----------|------|
| Laupok 主视频 | [j'ai créé une IA qui joue à mario toute seule](https://www.youtube.com/watch?v=F63GNXGHVwM) |
| 代码 review 加环境视频 | [comment setup l'ia + code source review](https://www.youtube.com/watch?v=u5xCl1bSe6o) |
| 完整源码 | [Pastebin Jcvdqhqm](https://pastebin.com/Jcvdqhqm) |
| NEAT 原论文 | Stanley & Miikkulainen, "Evolving Neural Networks through Augmenting Topologies", 2002 |
| N8Programs 教程 | [NEAT implementation walkthrough](https://n8programs.github.io/)（JavaScript，但概念一样） |
| 16blings（Laupok 灵感） | [AI plays Super Mario World](https://www.youtube.com/watch?v=qv6IFaOz3bA) |
| BizHawk | [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) |
| 超级马里奥世界内存 | [SMW Central - RAM Map](https://www.smwcentral.net/?p=section&a=details&id=21702) |

---

## 结语

Laupok 做的事：拿学术算法（NEAT，2002），Lua 重写给模拟器（BizHawk），用到超级马里奥世界。结果：AI 从零学会玩游戏，零先验知识，纯随机变异加自然选择。

遗传算法威力的漂亮例子。配方三样：自然选择，一点 Lua，大把耐心。不用深度学习，不用 GPU，不用海量训练数据。

代码有注释，开源，Laupok 做了两个讲解视频，一个讲大概念，一个讲代码。感兴趣直接跳， 比看着好懂。
