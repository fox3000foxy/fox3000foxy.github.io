---
title: AI Learns Minecraft PvP -- Imitation Learning, Reinforcement Learning, and the 30 variables that mattered
description: "1,000 duels recorded, neural network trained on pixels, 90% keystroke accuracy : and the bot beelined into a wall. Then came RL, curriculum learning, and 60 hours of training."
date: 2026-07-09
tags:
  - minecraft
  - ai
  - reinforcement-learning
  - imitation-learning
  - python
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "MEQCIFBtyCo/WW5zftLbYu2SKPakQVLuk1frAQGwuIu0dKipAiBAG8aDaFVZu/F1pqOZiJWGhOCnE1Qg/xMzgpId9uSxlw=="
---

## Introduction

![AI Learns Minecraft PvP thumbnail](assets/ai-pvp-thumbnail.png)

There's a video called [AI Learns Minecraft PvP (Reinforcement Learning + Behavior Cloning)](https://www.youtube.com/watch?v=j5nxDKAjg6U) by Kadambi | AI Engineering, and it's one of the most honest accounts of training a game-playing AI I've seen.

The premise: build a bot that plays Minecraft PvP (sword kit, fully enchanted diamond armor) by watching the screen and outputting mouse and keyboard commands. No reading game memory, no macros, no mods : just pixels in, actions out.

What makes the video interesting isn't the final result. It's the journey: the imitation learning failure, the feature engineering pivot, the catastrophic forgetting cycles, and the 60+ hours of training on a laptop with no GPU.

## Phase 1 : Imitation Learning (the failure)

![The bot during imitation learning: facing a wall, jumping up and down](assets/ai-pvp-imitation-fail.png)

The creator started with a sensible approach: record 1,000 duels of their own gameplay, map every mouse click and key press to the corresponding frame, and train a neural network to predict actions from pixels.

```python
# Pseudocode for the imitation learning pipeline
dataset = record_duels(1000)          # hundreds of thousands of frames
for frame, action in dataset:
    pixels = capture_screen(frame)
    network.train(pixels → action)    # predict keyboard/mouse from image
```

The network learned to predict keystrokes with **90% accuracy**. Promising.

Then they tested it in an actual match. The bot beelined straight to the edge of the map, faced a wall, and jumped up and down.

Why?

**The laziness trap.** In a PvP fight, the W key is pressed most of the time. The network realized it could achieve high accuracy by simply holding W down and doing nothing else. It optimized for the most common action at the expense of all others.

**Human latency.** Actions in the dataset are delayed by ~200ms of human reaction time. Frame-by-frame, cause and effect is nearly impossible for a model to learn from raw pixels when the action and its visible consequence are separated by multiple frames.

**Inconsistent demonstrations.** The creator's own gameplay varied : sometimes strafing with keyboard, sometimes aiming with mouse in identical situations. This conflicting input confused the network.

## Phase 2 : Reinforcement Learning with Curriculum

![The bot learning to track horizontally during RL training](assets/ai-pvp-rl-horizontal.png)

Ditching imitation learning, the creator switched to RL. But dropping a fresh agent into a full PvP duel is useless : there's too much happening at once for random exploration to find anything.

The solution: **curriculum learning**. Isolate each mechanic and let the bot master the basics before entering a real fight.

### Step 1 : Horizontal aim (7 hours)

The simplest reward function: positive reward for landing a hit, negative penalty for taking damage.

Initially, the bot barely moves (neural network initialized to output neutral values). It shakes from side to side : that's the bot testing different actions to see which ones give rewards.

After an hour, it learns to center itself horizontally, but painfully slowly. After 7 hours, it can track the enemy left and right, though asymmetrically (better at moving right-to-left than left-to-right, a behavior that persisted through training).

### Step 2 : Feature Engineering

The raw screen capture was over 2 million pixels. Even downscaled to 360p, that's 200,000 inputs : way too many for efficient learning.

The creator analyzed thousands of duels and identified **30 variables that actually matter**, split into three groups:

**Vision (enemy tracking)** :
- Enemy's distance from crosshair
- Enemy bounding box size
- Enemy height
- Crosshair state (on/off target)
- Relative velocity

Instead of processing the whole image, the bot filters pixels strictly by the enemy's armor color, making detection near-instant. Similarly colored background blocks can throw this off : but in Minecraft, you can just change textures.

**OCR (HUD reading)** :
Since the bot can't pull coordinates from the game's code, it scans the screen in real time to extract:
- Camera pitch
- Momentum
- Y level

Standard OCR struggles with Minecraft's transparent text, so critical data is forced to black and white for instant reading.

**Time (context window)** :
- Time since you hit the enemy
- Time since they hit you
- Rolling buffer of the bot's own previous actions

This gives the network temporal context : without it, the bot has no idea whether it's in the middle of a combo or just starting a fight.

### Step 3 : Vertical aim (another 7 hours)

![The bot learning to aim up and down during RL training](assets/ai-pvp-rl-vertical.png)

Adding vertical mouse movement was "a total disaster" at first. The initial performance was broken.

After another hour in the sandbox, the bot figured out how to look up and down. But in the process, it completely forgot how to track horizontally.

This is **catastrophic forgetting** : a classic machine learning problem where optimizing for new data overwrites previously learned representations. By optimizing for vertical aiming, the neural network accidentally overwrote its horizontal progress, leaving the creator with a bot that could hold its crosshair level but couldn't follow a target.

It took **6 additional hours** to regain horizontal tracking while keeping vertical control. The bot then maintained good crosshair placement thanks to the OCR group extracting camera pitch.

### Step 4 : Keyboard control

![The bot toggling the W key constantly, learning to commit to movement](assets/ai-pvp-keyboard.png)

Giving the bot permission to use the keyboard made the time-based features even more critical. At first, the W key was constantly toggled on and off : rapid switching because the network hadn't learned to commit.

This behavior was penalized, so the bot learned to smooth it out. It started landing more sprint hits (the thud sound vs the whoosh of a standing swing). Some combos looked unsatisfying because the bot exploited its reach advantage over the enemy.

To make things fair, the creator bumped up the enemy's reach. Many of the bot's learned strategies stopped working. But given more time, it adapted.

### Step 5 : Teaching the bot when to click

For the final phase, the creator brought back imitation learning : but only to teach the click timing, not the full control policy. The bot tried to mimic the click patterns from the recorded duels.

Initially it was too afraid to try anything, fearing the penalty for wrong clicks. But eventually it worked up the courage to swing and land hits. Of course, it forgot how to aim again in the process : the creator had to leave it alone for **50 more hours** to get back to a satisfactory state.

## The cheating debate

The video ends by asking: is this bot cheating?

The argument against: the bot only processes what a human sees (same pixels), sends the same keyboard/mouse inputs as a human (no packet manipulation like anti-knockback), and doesn't read game memory (no X-ray or ESP).

The argument for: a bot can process faster than a human, and if the opponent thinks they're playing a human but they're not, that's deception.

The creator's take: it depends on intent. If both parties know it's a bot, it's a fair match. The bot goes on to combo the enemy into the void with a 100-hit streak.

## The result

![The bot executing a 100-hit combo](assets/ai-pvp-final-combo.png)

A Minecraft PvP bot trained on a **laptop with no GPU**, built on a custom training pipeline with:

- **Screen capture** for pixel input (2M+ pixels → 30 engineered features)
- **Curriculum learning** (horizontal → vertical → keyboard → clicking)
- **RL for motor control** + **imitation learning for click timing**
- **Feature engineering** over raw pixels (3 groups: vision, OCR, time)
- **60+ hours of training** across multiple phases

Total training time is in the tens of hours, but most of it is passive. The bot shakes its way to understanding, forgets what it learned, re-learns it, and eventually strings together a 100-hit combo.

The video is at [youtube.com/watch?v=j5nxDKAjg6U](https://www.youtube.com/watch?v=j5nxDKAjg6U).

---

*This article covers only the video's content. For broader context on Minecraft AI : VPT, DreamerV3, and the imitation learning vs RL landscape : the sections below connect this project to the wider field.*

## VPT : Behavior cloning at scale

![OpenAI's VPT pipeline : labeled contractor data trains an Inverse Dynamics Model, which pseudo-labels 70K hours of YouTube videos for behavioral cloning at scale](assets/vpt-overview.svg)

The video's "behavior cloning" approach (Phase 1) is the same technique OpenAI used in their **Video PreTraining (VPT)** project, but at opposite ends of the resource spectrum. VPT proved that imitation learning works for Minecraft when you have 70,000 hours of video, 720 GPUs, and an inverse dynamics model to pseudo-label unlabeled data. The creator here proved it fails with one laptop and 1,000 duels : but for the same fundamental reason: imitation learning is bounded by the quality of its demonstrations.

![OpenAI's VPT agent mining a tree in Minecraft](assets/vpt-minecraft.jpg)

The VPT pipeline solves the data problem by training an **Inverse Dynamics Model (IDM)** that looks at frame t-1 and frame t+1 to predict the action at frame t. Because the IDM is non-causal (it sees future frames), the task is easier than behavioral cloning and requires far less labeled data. They paid contractors ~$2,000 for 2,000 hours of labeled data, then used the IDM to pseudo-label 70,000 hours of YouTube Minecraft videos.

The resulting 0.5B parameter foundation model achieved zero-shot capabilities that were impossible with RL alone : chopping trees, crafting tables, pillar jumping : and fine-tuned with RL, became the first AI to craft diamond tools.

## OpenAI Five : The reward shaping problem

![OpenAI Five playing Dota 2 against human professionals](assets/openai-five-dota2.jpg)

OpenAI Five (2019) defeated the Dota 2 world champions using pure self-play RL : no imitation learning. 256 GPUs, 128,000 CPU cores, 180 years of gameplay per day, 10 months of training.

But the reward function was handcrafted by Dota experts: **28 out of 20,000 available features**, each with hand-tuned weights. Net worth, kills, deaths, tower health, lane assignments : all selected and weighted by humans. Without this shaping, the agent barely learned (experiment: reward only win/loss → plateaued at semi-pro level).

The video's bot faces the same problem: its reward function encodes the creator's understanding of what matters in PvP (landing hits good, taking damage bad, maintaining crosshair good). This is unavoidable : RL needs a reward signal, and shaping that signal encodes human bias.

## DreamerV3 : World models and sparse rewards

![DreamerV3 benchmark scores across over 150 diverse tasks with a single configuration](assets/dreamerv3-benchmarks.png)

DeepMind's DreamerV3 (2023) takes a third approach. Instead of behavior cloning or shaped RL, it learns a **world model** : a neural network that predicts future states and rewards from past actions : and plans by dreaming about possible futures. It was the first algorithm to collect diamonds in Minecraft from scratch without human data or curricula, published in Nature in 2025.

![DreamerV3 learns a world model to imagine future trajectories](assets/dreamerv3-header.png)

The diamond environment defines a sparse reward over 12 milestones (log → planks → stick → crafting table → wooden pickaxe → cobblestone → stone pickaxe → iron ore → furnace → iron ingot → iron pickaxe → diamond), each giving +1 exactly once. Plus a small health reward (±0.01 per hp). Total achievable: 11.1 in a 36,000-step episode.

DreamerV3's world model lets it imagine trajectories and evaluate them internally : the actor learns from dreamed rollouts rather than real experience, testing thousands of possible futures for every real step. This makes sparse rewards feasible where they'd kill a standard RL agent.

Across 40 seeds trained for 100M environment steps, 24 of 40 collected at least one diamond. The first diamond appeared after 29M steps (~9 days on one GPU).

## ANNA : Symbolic AI meets Minecraft

![ANNA's task tree decomposition for a flint-and-steel](assets/anna-task-tree.png)

Before the video's PvP bot, before VPT and DreamerV3, there was **ANNA** : a Minecraft bot built with a different philosophy entirely. Instead of learning from pixels or rewards, ANNA uses a **symbolic state machine** with a **French NLP parser** and a hand-authored **task dependency tree**.

Created in 2022 (before "vibe coding" was a term), ANNA connects to a Minecraft server via Mineflayer and understands natural language commands in French. Say *"obtiens un briquet"* (get a flint-and-steel), and ANNA's parser identifies the verb (*obtien* → obtain), looks up the item recipe, and recursively decomposes it into subtasks : mine oak logs → craft planks → craft sticks → craft a crafting table → craft a wooden pickaxe → mine stone → craft a stone pickaxe → mine iron ore → smelt iron ingots → craft the flint-and-steel.

![ANNA's NLP parser architecture for French command recognition](assets/anna-nlp-diagram.png)

The NLP layer (`utils/id_parser.js`) splits commands on *"et"* (and) to handle parallel orders, maps French verbs to task types (*craft*, *mine*, *tue*, *suis moi*), and translates French item names to Minecraft IDs through a 5,000-entry dictionary. Unrecognized commands fall through to a GPT-based conversation system that casts ANNA as a sentient Minecraft companion.

The **task tree** (`mc-tasks-tree/`) is the core : a recursive algorithm that walks the Minecraft item graph (crafting recipes, mining yields, mob drops, furnace recipes) to produce a step-by-step plan. For a diamond helmet, it generates a 40+ step breakdown spanning wood, stone, iron, and diamond tiers.

![ANNA's diamond helmet task tree : a 40+ step breakdown](assets/anna-diamond-helmet.png)

Where the video's PvP bot learns from experience, ANNA works from knowledge. It doesn't need 1,000 duels or 60 hours of training : it needs the tree, the parser, and the server. But it also can't generalize beyond what its tree encodes. No amount of state machine engineering would teach it to PvP.

ANNA's approach mirrors a different era of AI : before end-to-end learning dominated, when the promise was that symbolic reasoning + careful engineering could produce intelligent behavior. Today, projects like ANNA and the PvP bot represent two poles of Minecraft AI : one reasons about the world, the other perceives it.

## Master Gumbo's Mace Bot : AI with command blocks only

![The Mace PvP training arena with the bot](assets/mace-bot-arena.png)

In a completely different corner of Minecraft AI, YouTuber **Master Gumbo** built a PvP training bot using **only command blocks** : no mods, no plugins, no external code. Just vanilla Minecraft commands, redstone, and a carpet mod for player replica entities. The result is an AI mace PvP opponent that practices breach swapping, wind charging, and shield mechanics with the player.

The bot starts as a zombie with unbreakable gear and a totem in its off-hand (refilled every tick via `/item replace`), making it effectively immortal. Later, Master Gumbo switches to **Carpet Mod's player replica** bots, which support human-like mechanics (shield raising, item switching) that zombies can't do.

![The settings center : buttons to configure bot behavior](assets/mace-settings-center.png)

The core innovation is a **state machine driven by randomness**. An armor stand is teleported above a circle of colored concrete blocks using the `/spreadplayers` command, which scatters entities randomly. Where the armor stand lands determines the bot's next action :

- **Red concrete** → strafe backwards
- **Blue concrete** → wind charge upward (attack)
- **Green concrete** → raise shield
- **White concrete** → pause (adds delay between actions)

![The AI decision system : an armor stand on colored concrete](assets/mace-ai-system.png)

The armor stand's position is read by command blocks that detect the block beneath it and activate the corresponding mechanism. A redstone block is placed or removed to enable/disable each behavior. Because `/spreadplayers` runs on repeat, the bot continuously makes new decisions, creating unpredictable but structured behavior.

Master Gumbo calls this "a very simple and basic form of AI" : it doesn't learn from interactions like neural networks, but the randomness + state machine produces realistic PvP behavior that's harder to predict than a scripted bot. The settings center includes a book interface to toggle AI on/off, adjust difficulty, and configure movement patterns.

After training with the bot and then dueling the player who called him bad (in the video's intro), Master Gumbo wins. The map is shared via Discord with Carpet Mod required.

![The bot in a duel, practicing mace PvP techniques](assets/mace-final-duel.png)

Where the PvP bot (Kadambi) learns from pixels and ANNA reasons through a task tree, Master Gumbo's bot achieves intelligence through **randomized state transitions** : a pure command block approach that proves you don't need neural networks to build a convincing PvP opponent.

## Altoclef : Baritone + task tree at scale

If ANNA is a symbolic bot that *reads* to know what to do, and the Mace Bot randomizes decisions, **Altoclef** is a full autonomous agent that *plans* its way through the entire game. Built by gaucho-matero as a Fabric mod and powered by **Baritone** pathfinding, Altoclef decomposes any Minecraft goal into a task tree and executes it without human input.

The interface is deceptively simple : type `@gamer` in chat, and Altoclef begins the beat-the-game task from a survival world. It gathers wood, crafts tools, mines iron and diamond, builds a Nether portal, collects blaze rods and ender pearls, finds the stronghold, and kills the Ender Dragon. All autonomously, all through the native Minecraft client, on any vanilla server.

Under the hood, this is achieved through a **recursive task tree system** where each high-level goal (e.g., "craft a diamond pickaxe") is decomposed into prerequisite tasks : mine diamonds → smelt them → craft sticks → combine. The tree walks the full Minecraft recipe graph, handling production chains, mob drops, loot tables, and container access. Unlike ANNA's hand-authored tree, Altoclef's tasks are **programmable Java classes** that can implement arbitrary logic : combat strategies, bartering with piglins, exploration patterns.

The key architectural insight is the separation of **what** (the task tree) from **how** (Baritone pathfinding). Baritone handles the low-level movement : pathfinding, obstacle avoidance, block breaking, inventory management — while the task system orchestrates the high-level plan. This modularity means neither component needs to be AI : they're both deterministic algorithms, yet their combination produces complex, goal-directed behavior that rivals learned approaches.

Altoclef represents the limit of **pure symbolic Minecraft AI** : it can beat the game from scratch with zero training, zero GPUs, and zero human data, but it cannot adapt to tasks its programmers didn't anticipate, and it cannot learn from experience. It knows how to craft a diamond pickaxe because a Java class tells it exactly how, not because it figured it out.

## What ties these together

| Approach | Core method | Data | Compute | Result |
|----------|------------|------|---------|--------|
| Video's PvP bot | RL + imitation learning | 1,000 duels | 1 laptop, 60h | 100-hit combo |
| OpenAI Five | Self-play RL | 180 yrs gameplay/day | 256 GPUs, 10mo | World champ Dota 2 |
| VPT | Semi-supervised IL | 70K hrs YouTube + IDM | 720 GPUs, 9 days | Diamond tools |
| DreamerV3 | World model RL | Dreamed trajectories | 1 GPU, 9 days | Diamond from scratch |
| **ANNA** | **Symbolic NLP + task tree** | **Hand-authored recipes** | **1 laptop, instant** | **Any craftable item** |
| **Altoclef** | **Baritone + task tree FS** | **Java task classes** | **Fabric mod, no GPU** | **Beat the entire game** |
| **Mace Bot** | **Command block state machine** | **Randomized decisions** | **Vanilla MC, no GPU** | **Mace PvP training** |

The video's bot is the most resource-constrained but the most honest about the process. It fails first, then iterates. It forgets what it learned, then re-learns. It ends with a 100-hit combo : but also with a question about whether what it built is cheating.

---

**Video** : [AI Learns Minecraft PvP](https://www.youtube.com/watch?v=j5nxDKAjg6U) by Kadambi | AI Engineering

**VPT** : [Paper](https://cdn.openai.com/vpt/Paper.pdf) · [Blog](https://openai.com/index/vpt/) · [GitHub](https://github.com/openai/Video-Pre-Training)

**OpenAI Five** : [Paper](https://arxiv.org/abs/1912.06680) · [Blog](https://openai.com/index/dota-2/)

**DreamerV3** : [Paper](https://arxiv.org/abs/2301.04104) · [GitHub](https://github.com/danijar/dreamerv3)

**ANNA** : [GitHub](https://github.com/fox3000foxy/ANNA) · (Node.js, Mineflayer, French NLP, task tree)

**Altoclef** : [GitHub](https://github.com/gaucho-matrero/altoclef) · [Active fork](https://github.com/drmcbride12/altoclef) · (Fabric, Baritone, task tree, beats game)

**Mace Bot** : [Video](https://www.youtube.com/watch?v=Fmp2Il70IF8) by Master Gumbo · (Command blocks, Carpet Mod, state machine)
