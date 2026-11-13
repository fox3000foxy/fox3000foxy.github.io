---
title: "AI Learns Minecraft PvP -- Imitation Learning, Reinforcement Learning, and the 30 Variables That Mattered"
description: "1,000 recorded duels, a neural net trained on pixels, 90% hit accuracy: and the bot ran straight into a wall. Then came RL, curriculum learning, and 60 hours of training."
date: 2026-07-09
tags:
  - minecraft
  - ai
  - python
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "ilutM3eKwfSNLIOjCqCoVYX5uCxT+NjrEcvwtnH8WQ7btwkCaLI9sZgq0AOR9F33er+ns+o7DYrHN/T5KeSkLg=="
---

## Introduction

![AI Learns Minecraft PvP thumbnail](assets/ai-pvp-thumbnail.png)

There's a video titled [AI Learns Minecraft PvP (Reinforcement Learning + Behavior Cloning)](https://www.youtube.com/watch?v=j5nxDKAjg6U) by Kadambi | AI Engineering, and it's one of the most honest game-AI training stories I've seen.

The principle: build a bot playing Minecraft PvP (sword kit, fully enchanted diamond armor) by watching the screen and sending mouse and keyboard commands. It works with pixels in and actions out only, no reading game memory, no macros, no mods.

What makes the video interesting isn't the final result. It's the journey: the imitation learning failure, the pivot to feature engineering, catastrophic forgetting cycles, and 60+ hours of training on a laptop with no GPU.

## Phase 1: Imitation Learning (the failure)

![The bot during imitation learning: facing a wall, jumping up and down](assets/ai-pvp-imitation-fail.png)

The creator started with a sensible approach: record 1,000 duels of his own gameplay, pair each mouse click and keypress with the matching frame, and train a neural net to predict actions from pixels.

```python
# Pseudocode for the imitation learning pipeline
dataset = record_duels(1000)          # hundreds of thousands of frames
for frame, action in dataset:
    pixels = capture_screen(frame)
    network.train(pixels → action)    # predict keyboard/mouse from image
```

The net learned to predict hits with **90% accuracy**. Promising.

Then they tested it in a real match. The bot walked straight to the map's edge, faced a wall, and jumped up and down.

Why?

**The laziness trap.** In a PvP fight, the W key is pressed most of the time. The net realized it could hit high accuracy by just holding W and doing nothing else. It optimized the most frequent action at the expense of all others.

**Human latency.** Actions in the dataset lag ~200ms of human reaction time. Frame by frame, cause and effect are nearly impossible for a model to learn from raw pixels when action and its visible consequence sit several frames apart.

**Inconsistent demos.** The creator's own gameplay varied: sometimes strafing with the keyboard, sometimes aiming with the mouse in identical situations. Those conflicting inputs confused the net.

## Phase 2: Reinforcement Learning with curriculum

![The bot learning horizontal tracking during RL training](assets/ai-pvp-rl-horizontal.png)

Dropping imitation learning, the creator switched to RL. But throwing a fresh agent into a full PvP duel is useless: too much happens at once for random exploration to find anything.

The solution: **curriculum learning**. Isolate each mechanic and let the bot master basics before entering a real fight.

### Step 1: Horizontal aim (7 hours)

The simplest reward function: positive reward for landing a hit, negative penalty for taking damage.

Initially, the bot barely moves (neural net initialized with neutral values). It jitters sideways: that's the bot testing different actions to see which give rewards.

After an hour, it learns to center horizontally, but painfully slowly. After 7 hours, it can track the enemy left and right, though asymmetrically (better moving right-to-left than left-to-right, a behavior persisting through all training).

### Step 2: Feature Engineering

The raw screenshot exceeded 2 million pixels. Even downscaled to 360p, that's 200,000 inputs: way too many for efficient learning.

The creator analyzed thousands of duels and identified **30 variables that really matter**, in three groups:

**Vision (enemy tracking)**:
- Enemy distance from crosshair
- Enemy bounding box size
- Enemy height
- Crosshair state (on/off target)
- Relative velocity

Instead of processing the whole image, the bot filters pixels strictly by enemy armor color, making detection near-instant. Similarly colored background blocks can disturb that filtering: but in Minecraft, you can just change textures.

**OCR (HUD reading)**:
Since the bot can't pull coords from game code, it scans the screen live to extract:
- Camera pitch
- Momentum
- Y level

Standard OCR struggles with Minecraft's transparent text, so critical data gets forced to black and white for instant reading.

**Time (context window)**:
- Time since you hit the enemy
- Time since it hit you
- Sliding buffer of the bot's previous actions

That gives the net temporal context: without it, the bot has no idea whether it's mid-combo or just starting a fight.

### Step 3: Vertical aim (7 more hours)

![The bot learning to aim up and down during RL training](assets/ai-pvp-rl-vertical.png)

Adding vertical mouse movement was "a total disaster" at first. Initial performance was broken.

After another hour in the sandbox, the bot figured out looking up and down. But in the process, it completely forgot how to track horizontally.

That's **catastrophic forgetting**: a classic machine learning problem where optimizing for new data wipes previously learned representations. Optimizing vertical aim, the neural net accidentally crushed its horizontal progress, leaving the creator with a bot that could hold its crosshair level but couldn't track a target.

It took **6 more hours** to recover horizontal tracking while keeping vertical control. The bot then held good crosshair placement thanks to the OCR group extracting camera pitch.

### Step 4: Keyboard control

![The bot toggling the W key constantly, learning to commit to movement](assets/ai-pvp-keyboard.png)

Giving the bot keyboard permission made temporal features even more critical. At first, the W key toggled constantly: rapid switching because the net hadn't learned to commit.

That behavior got penalized, so the bot learned to smooth it. It started landing more sprint hits (the thud versus the swish of a standing hit). Some combos felt unsatisfying because the bot exploited its range advantage over the enemy.

To make things fair, the creator raised the enemy's reach. Many of the bot's learned strategies stopped working. But over time, it adapted.

### Step 5: Teaching the bot when to click

For the final phase, the creator brought imitation learning back: but only to teach click timing, not the full control policy. The bot tried mimicking click patterns from recorded duels.

Initially, it was too scared to try anything, fearing the bad-click penalty. But it finally found the courage to hit and land blows. Of course, it forgot how to aim again in the process: the creator had to leave it alone for **50 more hours** to get back to a satisfying state.

## The cheating debate

The video ends asking: does this bot cheat?

The case against: the bot only processes what a human sees (the same pixels), sends the same keyboard/mouse inputs as a human (no packet manipulation like anti-knockback), and doesn't read game memory (no X-ray or ESP).

The case for: a bot can process faster than a human, and if the opponent thinks they're playing a human but aren't, that's deception.

The creator's take: it depends on intent. If both sides know it's a bot, the match is fair. The bot chains the enemy into the void with a 100-hit streak.

## The result

![The bot executing a 100-hit combo](assets/ai-pvp-final-combo.png)

A Minecraft PvP bot trained on a **GPU-less laptop**, built on a custom training pipeline with:

- **Screenshot** for pixel input (2M+ pixels → 30 designed features)
- **Curriculum learning** (horizontal → vertical → keyboard → clicks)
- **RL for motor control** + **imitation learning for click timing**
- **Feature engineering** on raw pixels (3 groups: vision, OCR, time)
- **60+ hours of training** across several phases

Total training time is tens of hours, but most of it is passive. The bot jitters toward understanding, forgets what it learned, relearns, and ends up chaining a 100-hit streak.

The video is at [youtube.com/watch?v=j5nxDKAjg6U](https://www.youtube.com/watch?v=j5nxDKAjg6U).

---

*This article covers only the video's content. For broader Minecraft AI context: VPT, DreamerV3, and the imitation learning vs RL landscape: the sections below connect this project to the wider field.*

## VPT: behavior cloning at scale

![OpenAI's VPT project diagram: the Inverse Dynamics Model predicts actions from pairs of frames](assets/vpt-overview.svg)

The video's "behavior cloning" approach (Phase 1) is the same technique OpenAI used in its **Video PreTraining (VPT)** project, but at opposite ends of the resource spectrum. VPT proved imitation learning works for Minecraft when you have 70,000 hours of video, 720 GPUs, and an inverse dynamics model to pseudo-label unlabeled data. The creator here proved it fails with a laptop and 1,000 duels: but for the same core reason: imitation learning is limited by its demonstrations' quality.

![OpenAI's VPT agent mining a tree in Minecraft](assets/vpt-minecraft.jpg)

The VPT pipeline solves the data problem by training an **Inverse Dynamics Model (IDM)** that looks at frame t-1 and frame t+1 to predict the action at frame t. Because the IDM is non-causal (it sees future frames), the task is easier than behavior cloning and needs far less labeled data. They paid contractors about $2,000 for 2,000 hours of labeled data, then used the IDM to pseudo-label 70,000 hours of Minecraft YouTube videos.

![Crafting/gathering rate vs pretraining data volume (log scale): crafting tables, wooden tools, stone tools](assets/vpt-stone-pickaxe-sequence.svg)

The scale effect is clear: on a log axis from 1 hour to 100,000 hours of pretraining data, the rate at which the model crafts a table, wooden tools, then stone tools climbs stepwise. The model trained only on the 2,000 contractor-labeled hours plateaus at crafting tables; it's by adding the 70,000 IDM pseudo-labeled hours (dashed line on the graph) that stone tools emerge zero-shot, without a single RL step.

The resulting 0.5B-parameter foundation model reached zero-shot capabilities impossible with RL alone: chopping trees, crafting tables, pillar-jumping: and fine-tuned with RL, it became the first AI to craft diamond tools.

![Reward vs RL training episodes: starting from a randomly initialized model vs starting from the VPT pretrained model](assets/vpt-diamond-pickaxe-sequence.svg)

That graph shows why pretraining changes everything for downstream RL. RL starting from a randomly initialized net (orange) stays flat near 0 for nearly a million episodes: the "get a diamond" task has too sparse a reward for a naive agent to stumble on by random exploration. RL fine-tuned from the VPT pretrained model (green) starts with base behavior (mining, crafting, exploring) and climbs steadily to a reward around 25, matching the full path to a diamond pickaxe.

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
    <iframe src="https://player.vimeo.com/video/720045863?h=060f07bd90" title="VPT agent gameplay demo 4" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

*Official demo videos from OpenAI's VPT project, showing the agent in action.*

## OpenAI Five: the reward shaping problem

![OpenAI Five playing Dota 2 against human professionals](assets/openai-five-dota2.jpg)

OpenAI Five (2019) beat the Dota 2 world champions using pure self-play RL: no imitation learning. 256 GPUs, 128,000 CPU cores, 180 years of game per day, 10 months of training.

But the reward function was hand-designed by Dota experts: **28 features out of 20,000 available**, each with manually tuned weights. Net worth, kills, deaths, tower health, lane assignments: everything was selected and weighted by humans. Without that modeling, the agent barely learned (experiment: win/loss-only reward → plateau at semi-pro level).

The video's bot faces the same problem: its reward function encodes the creator's understanding of what matters in PvP (hitting is good, getting hit is bad, holding crosshair is good). It's inevitable: RL needs a reward signal, and shaping that signal encodes human bias.

## DreamerV3: world models and sparse rewards

![DreamerV3 benchmark scores across 150+ diverse tasks with a single configuration](assets/dreamerv3-benchmarks.png)

DeepMind's DreamerV3 (2023) takes a third approach. Instead of behavior cloning or incentivized RL, it learns a **world model**: a neural net predicting future states and rewards from past actions: and plans by dreaming possible futures. It's the first algorithm to collect diamonds in Minecraft from scratch with no human data or curricula, published in Nature in 2025.

![DreamerV3 learns a world model to imagine future trajectories](assets/dreamerv3-header.png)

The diamond environment defines a sparse reward over 12 milestones (log → planks → stick → crafting table → wooden pickaxe → stone → stone pickaxe → iron ore → furnace → iron ingot → iron pickaxe → diamond), each giving +1 only once. Plus a small health reward (±0.01 per hp). Reachable total: 11.1 in a 36,000-step episode.

DreamerV3's world model lets it imagine trajectories and evaluate them internally: the actor learns from dreamed rollouts rather than real experience, testing thousands of possible futures per real step. That makes sparse rewards workable where they'd destroy a standard RL agent.

Over 40 seeds trained for 100M environment steps, 24 of 40 collected at least one diamond. The first diamond appeared after 29M steps (~9 days on one GPU).

## ANNA: symbolic AI meets Minecraft

![ANNA's task tree decomposition for a flint-and-steel](assets/anna-task-tree.png)

Before the video's PvP bot, before VPT and DreamerV3, there was **ANNA**: a Minecraft bot built on a completely different philosophy. Instead of learning from pixels or rewards, ANNA uses a **symbolic state machine** with a **French NLP parser** and a hand-written **task dependency tree**.

Created in 2022 (before "vibe coding" was a term), ANNA connects to a Minecraft server via Mineflayer and understands natural-language commands in French. Say *"obtiens un briquet"* ("get a flint-and-steel"), and ANNA parses the verb (obtiens → obtain), looks up the item's recipe, and recursively breaks it into subtasks: mine oak → craft planks → craft sticks → craft a crafting table → craft a wooden pickaxe → mine stone → craft a stone pickaxe → mine iron ore → smelt iron ingots → craft the flint-and-steel.

![ANNA's NLP parser architecture for French command recognition](assets/anna-nlp-diagram.png)

The NLP layer (`utils/id_parser.js`) splits commands on "et" ("and") to handle parallel orders, maps French verbs to task types, and translates French item names to Minecraft IDs via a 5,000-entry dictionary. Unrecognized commands fall through to a GPT-based conversation system presenting ANNA as a sentient Minecraft companion.

The **task tree** (`mc-tasks-tree/`) is the heart: a recursive algorithm walking Minecraft's item graph (crafting recipes, mining yields, mob drops, furnace recipes) to produce a step-by-step plan. For a diamond helmet, it generates a 40+ step breakdown covering wood, stone, iron, and diamond tiers.

![ANNA's diamond helmet task tree: a 40+ step breakdown](assets/anna-diamond-helmet.png)

Where the video's PvP bot learns from experience, ANNA works from knowledge. It needs no 1,000 duels or 60 hours of training: it needs the tree, the parser, and the server/distributor. But it also can't generalize beyond what its tree encodes. No amount of state-machine engineering would teach it PvP.

ANNA's approach reflects a different AI era: before end-to-end learning dominated, when the promise was that symbolic reasoning plus careful engineering could produce intelligent behavior. Today, projects like ANNA and the PvP bot represent two poles of Minecraft AI: one reasons about the world, the other perceives it.

## Master Gumbo's Mace Bot: AI with only command blocks

![The Mace PvP training arena with the bot](assets/mace-bot-arena.png)

In a completely different corner of Minecraft AI, YouTuber **Master Gumbo** built a PvP training bot using **only command blocks**, just vanilla Minecraft commands, redstone, and a carpet mod for player-clone entities. The result is an AI opponent for the masses practicing breach swaps, wind charges, and shield mechanics with the player.

The bot starts as a zombie with unbreakable gear and a totem in its offhand (refilled every tick via `/item replace`), making it effectively immortal. Later, Master Gumbo switches to **Carpet Mod's player replica bots**, which support humanoid mechanics (shield raising, item switching) zombies can't do.

![The settings center: buttons to configure bot behavior](assets/mace-settings-center.png)

The core innovation is a **randomness-driven state machine**. An armor stand gets teleported above a circle of colored concrete blocks via the `/spreadplayers` command, which scatters entities randomly. The concrete color the armor stand lands on determines the bot's next action:

- **Red concrete** → strafe backward
- **Blue concrete** → rise upward (attack) with wind charge
- **Green concrete** → raise shield
- **White concrete** → pause (adds delay between actions)

![The AI decision system: an armor stand on colored concrete](assets/mace-ai-system.png)

The armor stand's position is read by command blocks detecting the block below and firing the matching mechanism. A redstone block gets placed or removed to enable/disable each behavior. Because `/spreadplayers` runs on repeat, the bot keeps making new decisions, producing unpredictable but structured behavior.

Master Gumbo calls it "a very simple and basic form of AI": it doesn't learn from interactions like neural nets, but randomness + state machine produces realistic PvP behavior harder to predict than a scripted bot. The settings center includes a book UI to toggle AI on/off, tune difficulty, and configure movement patterns.

After training with the bot then dueling the player who'd called him trash (in his video intro), Master Gumbo wins. The map is shared via Discord, Carpet Mod required.

![The bot in a duel, practicing mace PvP techniques](assets/mace-final-duel.png)

Where the PvP bot (Kadambi) learns from pixels and ANNA reasons through a task tree, Master Gumbo's bot achieves intelligence through **random state transitions**: a pure command block approach proving you don't need neural nets to build a convincing PvP opponent.

## Altoclef: Baritone + large-scale task tree

If ANNA is a symbolic bot that *reads* to know what to do, and the Mace Bot randomizes decisions, **Altoclef** is a full autonomous agent that *plans* its way through the whole game. Built by gaucho-matero as a Fabric mod and powered by **Baritone** pathfinding, Altoclef breaks any Minecraft goal into a task tree and executes it with no human intervention.

The interface is deceptively simple: type `@gamer` in chat, and Altoclef starts the "beat the game" task from a survival world. It harvests wood, crafts tools, mines iron and diamond, builds a Nether portal, collects Blaze rods and Ender pearls, finds the stronghold, and kills the Ender Dragon. All autonomously, via the native Minecraft client, on any vanilla server.

Under the hood, this is achieved through a **recursive task tree system** where each high-level goal (e.g., "craft a diamond pickaxe") breaks into prerequisite tasks: mine diamond → smelt it → craft sticks → combine them. The tree walks the full Minecraft recipe graph, handling production chains, mob drops, loot tables, and container access. Unlike ANNA's hand-written tree, Altoclef's tasks are **programmable Java classes** that can implement arbitrary logic: combat strategies, piglin bartering, exploration patterns.

The key architectural idea is separating **what** (the task tree) from **how** (Baritone pathfinding). Baritone handles low-level movement: pathfinding, obstacle avoidance, block breaking, inventory management, while the task system orchestrates the high-level plan. That modularity means neither component needs to be an AI: both are deterministic algorithms, but their combination produces complex, goal-directed behavior rivaling learning approaches.

Altoclef represents the limit of **pure symbolic Minecraft AI**: it can beat the game from scratch with no training, no GPU, and no human data, but it can't adapt to tasks its programmers didn't anticipate, and it can't learn from experience. It knows how to craft a diamond pickaxe because a Java class tells it exactly how, not because it figured it out alone.

## What connects them

| Approach | Main method | Data | Compute | Result | |
|--------------------------|---------------------|---------|--------|-----------|-|
| Video's PvP bot | RL + imitation learning | 1,000 duels | 1 laptop, 60h | 100-hit combo | |
| OpenAI Five | Self-play RL | 180 game-years/day | 256 GPUs, 10mo | Dota 2 world champion | |
| VPT | Semi-supervised IL | 70K h YouTube + IDM | 720 GPUs, 9 days | Diamond tools | |
| DreamerV3 | World model RL | Dreamed trajectories | 1 GPU, 9 days | Diamond from scratch | |
| **ANNA** | **Symbolic NLP + task tree** | **Written recipes** | **1 laptop, instant** | **Any craftable item** | |
| **Altoclef** | **Baritone + FS task tree** | **Java task classes** | **Fabric mod, no GPU** | **Beat the entire game** | |
| **Mace Bot** | **Command block state machine** | **Random decisions** | **Vanilla MC, no GPU** | **Mace PvP training** | |

The video's bot is the most resource-constrained but the most honest about the process. It fails first, then iterates. It forgets what it learned, then relearns, and ends with a 100-hit combo: but also with a question about whether what it built cheats.

---

**Video**: [AI Learns Minecraft PvP](https://www.youtube.com/watch?v=j5nxDKAjg6U) by Kadambi | AI Engineering

**VPT**: [Paper](https://cdn.openai.com/vpt/Paper.pdf) · [Blog](https://openai.com/index/vpt/) · [GitHub](https://github.com/openai/Video-Pre-Training)

**OpenAI Five**: [Paper](https://arxiv.org/abs/1912.06680) · [Blog](https://openai.com/index/dota-2/)

**DreamerV3**: [Paper](https://arxiv.org/abs/2301.04104) · [GitHub](https://github.com/danijar/dreamerv3)

**ANNA**: [GitHub](https://github.com/fox3000foxy/ANNA) · (Node.js, Mineflayer, French NLP, task tree)

**Altoclef**: [GitHub](https://github.com/gaucho-matrero/altoclef) · [Active fork](https://github.com/drmcbride12/altoclef) · (Fabric, Baritone, task tree, beats game)

**Mace Bot**: [Video](https://www.youtube.com/watch?v=Fmp2Il70IF8) by Master Gumbo · (Command Blocks, Carpet Mod, state machine)
