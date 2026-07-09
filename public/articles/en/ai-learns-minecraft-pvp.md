---
title: AI Learns Minecraft PvP -- Imitation Learning, Reinforcement Learning, and the 30 variables that mattered
description: 1,000 duels recorded, neural network trained on pixels, 90% keystroke accuracy : and the bot beelined into a wall. Then came RL, curriculum learning, and 60 hours of training.
date: 2026-07-09
tags:
  - minecraft
  - ai
  - reinforcement-learning
  - imitation-learning
  - python
authors:
  - fox3000foxy
---

## Introduction

There's a video called [AI Learns Minecraft PvP (Reinforcement Learning + Behavior Cloning)](https://www.youtube.com/watch?v=j5nxDKAjg6U) by Kadambi | AI Engineering, and it's one of the most honest accounts of training a game-playing AI I've seen.

The premise: build a bot that plays Minecraft PvP (sword kit, fully enchanted diamond armor) by watching the screen and outputting mouse and keyboard commands. No reading game memory, no macros, no mods : just pixels in, actions out.

What makes the video interesting isn't the final result. It's the journey: the imitation learning failure, the feature engineering pivot, the catastrophic forgetting cycles, and the 60+ hours of training on a laptop with no GPU.

## Phase 1 : Imitation Learning (the failure)

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

Adding vertical mouse movement was "a total disaster" at first. The initial performance was broken.

After another hour in the sandbox, the bot figured out how to look up and down. But in the process, it completely forgot how to track horizontally.

This is **catastrophic forgetting** : a classic machine learning problem where optimizing for new data overwrites previously learned representations. By optimizing for vertical aiming, the neural network accidentally overwrote its horizontal progress, leaving the creator with a bot that could hold its crosshair level but couldn't follow a target.

It took **6 additional hours** to regain horizontal tracking while keeping vertical control. The bot then maintained good crosshair placement thanks to the OCR group extracting camera pitch.

### Step 4 : Keyboard control

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

The video's "behavior cloning" approach (Phase 1) is the same technique OpenAI used in their **Video PreTraining (VPT)** project, but at opposite ends of the resource spectrum. VPT proved that imitation learning works for Minecraft when you have 70,000 hours of video, 720 GPUs, and an inverse dynamics model to pseudo-label unlabeled data. The creator here proved it fails with one laptop and 1,000 duels : but for the same fundamental reason: imitation learning is bounded by the quality of its demonstrations.

The VPT pipeline solves the data problem by training an **Inverse Dynamics Model (IDM)** that looks at frame t-1 and frame t+1 to predict the action at frame t. Because the IDM is non-causal (it sees future frames), the task is easier than behavioral cloning and requires far less labeled data. They paid contractors ~$2,000 for 2,000 hours of labeled data, then used the IDM to pseudo-label 70,000 hours of YouTube Minecraft videos.

The resulting 0.5B parameter foundation model achieved zero-shot capabilities that were impossible with RL alone : chopping trees, crafting tables, pillar jumping : and fine-tuned with RL, became the first AI to craft diamond tools.

## OpenAI Five : The reward shaping problem

OpenAI Five (2019) defeated the Dota 2 world champions using pure self-play RL : no imitation learning. 256 GPUs, 128,000 CPU cores, 180 years of gameplay per day, 10 months of training.

But the reward function was handcrafted by Dota experts: **28 out of 20,000 available features**, each with hand-tuned weights. Net worth, kills, deaths, tower health, lane assignments : all selected and weighted by humans. Without this shaping, the agent barely learned (experiment: reward only win/loss → plateaued at semi-pro level).

The video's bot faces the same problem: its reward function encodes the creator's understanding of what matters in PvP (landing hits good, taking damage bad, maintaining crosshair good). This is unavoidable : RL needs a reward signal, and shaping that signal encodes human bias.

## DreamerV3 : World models and sparse rewards

DeepMind's DreamerV3 (2023) takes a third approach. Instead of behavior cloning or shaped RL, it learns a **world model** : a neural network that predicts future states and rewards from past actions : and plans by dreaming about possible futures. It was the first algorithm to collect diamonds in Minecraft from scratch without human data or curricula, published in Nature in 2025.

The diamond environment defines a sparse reward over 12 milestones (log → planks → stick → crafting table → wooden pickaxe → cobblestone → stone pickaxe → iron ore → furnace → iron ingot → iron pickaxe → diamond), each giving +1 exactly once. Plus a small health reward (±0.01 per hp). Total achievable: 11.1 in a 36,000-step episode.

DreamerV3's world model lets it imagine trajectories and evaluate them internally : the actor learns from dreamed rollouts rather than real experience, testing thousands of possible futures for every real step. This makes sparse rewards feasible where they'd kill a standard RL agent.

Across 40 seeds trained for 100M environment steps, 24 of 40 collected at least one diamond. The first diamond appeared after 29M steps (~9 days on one GPU).

## What ties these together

| Approach | Data | Reward | Compute | Result |
|----------|------|--------|---------|--------|
| Video's PvP bot | 1,000 duels | Shaped (hits, damage) | 1 laptop, 60h | 100-hit combo |
| OpenAI Five | Self-play | 28 hand-picked features | 256 GPUs, 10mo | World champ Dota 2 |
| VPT | 70K hrs YouTube + IDM | Human demo labels | 720 GPUs, 9 days | Diamond tools |
| DreamerV3 | World model dreams | 12 sparse milestones | 1 GPU, 9 days | Diamond from scratch |

The video's bot is the most resource-constrained but the most honest about the process. It fails first, then iterates. It forgets what it learned, then re-learns. It ends with a 100-hit combo : but also with a question about whether what it built is cheating.

---

**Video** : [AI Learns Minecraft PvP](https://www.youtube.com/watch?v=j5nxDKAjg6U) by Kadambi | AI Engineering

**VPT** : [Paper](https://cdn.openai.com/vpt/Paper.pdf) · [Blog](https://openai.com/index/vpt/) · [GitHub](https://github.com/openai/Video-Pre-Training)

**OpenAI Five** : [Paper](https://arxiv.org/abs/1912.06680) · [Blog](https://openai.com/index/dota-2/)

**DreamerV3** : [Paper](https://arxiv.org/abs/2301.04104) · [GitHub](https://github.com/danijar/dreamerv3)
