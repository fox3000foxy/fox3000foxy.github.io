---
title: AI Learns Minecraft PvP -- Deep Reinforcement Learning + Behavior Cloning
description: A pure Python bot that learns Minecraft PvP by watching the screen -- 16 actions, PPO on a CNN, custom hit detection, 100k steps of training. Full source code analysis.
date: 2026-07-09
tags:
  - minecraft
  - ai
  - reinforcement-learning
  - python
  - pytorch
authors:
  - fox3000foxy
---

## Introduction

There's a project called [Minecraft-PVP-bot](https://github.com/GiaoShou66/Minecraft-PVP-bot) by GiaoShou66, and it's one of the most practical examples of deep reinforcement learning applied to a real game I've seen in a while.

The premise is simple : train an AI to fight in Minecraft PvP using nothing but screen captures and keyboard/mouse simulation. No mods, no server plugins, no internal game state. The bot sees what a human sees and decides what keys to press.

The YouTube video [AI Learns Minecraft PvP](https://www.youtube.com/watch?v=j5nxDKAjg6U) walks through the process end to end. Here's the actual code.

## Architecture : screen → pixels → actions

```
Screen Capture → CNN → PPO Agent → Actions → Game Control
     ↓                                            ↓
     └────────────── Reward Signal ←─────────────┘
```

The bot captures the Minecraft window at 84×84 RGB resolution, feeds it through a convolutional neural network, and outputs one of 16 actions (move, look, attack, or combinations). The PPO algorithm learns to maximize a reward signal derived from in-game outcomes.

No internal game state is accessed. The bot has no idea about health, position, enemy location, or anything else a normal Minecraft client knows. It learns purely from pixel changes.

## The CNN feature extractor

```python
class MinecraftCNN(BaseFeaturesExtractor):
    def __init__(self, observation_space, features_dim=512):
        super().__init__(observation_space, features_dim)
        n_input_channels = observation_space.shape[0]

        self.cnn = nn.Sequential(
            nn.Conv2d(n_input_channels, 32, kernel_size=8, stride=4, padding=0),
            nn.ReLU(),
            nn.Conv2d(32, 64, kernel_size=4, stride=2, padding=0),
            nn.ReLU(),
            nn.Conv2d(64, 64, kernel_size=3, stride=1, padding=0),
            nn.ReLU(),
            nn.Flatten(),
        )

        with torch.no_grad():
            n_flatten = self.cnn(
                torch.as_tensor(observation_space.sample()[None]).float()
            ).shape[1]

        self.linear = nn.Sequential(
            nn.Linear(n_flatten, features_dim),
            nn.ReLU()
        )

    def forward(self, observations):
        return self.linear(self.cnn(observations))
```

3 convolutional layers followed by a linear projection to 512 features. The first layer uses a large 8×8 kernel with stride 4 to aggressively downsample, the next two refine at 4×4/2 and 3×3/1. Standard Nature CNN architecture adapted for Minecraft's visual domain.

The flattened size is computed dynamically via a forward pass with a dummy sample. This avoids hardcoding dimensions that depend on input resolution.

## 16 actions : the action space

The bot chooses from 16 discrete actions. Movement, camera control, attack, and their combinations :

| ID | Action | Description |
|----|--------|-------------|
| 0 | No-op | Do nothing |
| 1 | Forward | Press W |
| 2 | Backward | Press S |
| 3 | Strafe Left | Press A |
| 4 | Strafe Right | Press D |
| 5 | Attack | Left click |
| 6 | Jump | Space |
| 7 | Sprint | Sprint + forward |
| 8 | Crouch | Shift |
| 9 | Look Left | Mouse -40px X |
| 10 | Look Right | Mouse +40px X |
| 11 | Look Up | Mouse -30px Y |
| 12 | Look Down | Mouse +30px Y |
| 13 | Fwd + Attack | W + click |
| 14 | Strafe L + Attack | A + click |
| 15 | Strafe R + Attack | D + click |

Combined actions (13-15) are critical. A bot that can't strafe while attacking will stand still and trade hits. The combinations let the policy learn movement-aim coordination in a single step.

```python
def execute_action(self, action):
    for key in ['w', 'a', 's', 'd', 'space', 'shift', 'ctrl']:
        try:
            pydirectinput.keyUp(key)
        except:
            pass

    is_attack_action = False

    if action == 0:   pass
    elif action == 1:  self.press_key('w')
    elif action == 5:  self.click(); is_attack_action = True
    elif action == 13:
        pydirectinput.keyDown('w')
        self.click()
        time.sleep(0.05)
        pydirectinput.keyUp('w')
        is_attack_action = True
    # ... etc
```

Every action resets all movement keys first. This is important -- without key release, the bot could get stuck holding W forever after one forward command.

`pydirectinput` is the library that simulates actual keyboard and mouse input. It's a fork of `pyautogui` designed specifically for game input where low-level simulation is required.

## The MinecraftPvPEnv Gym environment

The core of the project is a custom Gymnasium environment that wraps Minecraft. It implements the standard `reset/step/render` interface expected by Stable-Baselines3.

```python
class MinecraftPvPEnv(gym.Env):
    def __init__(self, capture_region=None):
        self.action_space = spaces.Discrete(16)
        self.observation_space = spaces.Box(
            low=0, high=255, shape=(3, 84, 84), dtype=np.uint8
        )
        self.episode_steps = 0
        self.max_steps = 1000
        self.sct = mss()
        self.controller = MinecraftController()
        self.last_health_estimate = 1.0
```

`mss` (MSS) is the screen capture library. It's significantly faster than PIL's `ImageGrab` because it uses the X11/Screen Capture API directly rather than going through higher-level abstractions.

### Screen capture and preprocessing

```python
def _capture_screen(self):
    screenshot = self.sct.grab(self.capture_region)
    img = np.array(screenshot)
    img = cv2.cvtColor(img, cv2.COLOR_BGRA2RGB)
    return img

def _process_observation(self, screen):
    obs = cv2.resize(screen, (84, 84), interpolation=cv2.INTER_AREA)
    obs = np.transpose(obs, (2, 0, 1))
    return obs.astype(np.uint8)
```

The raw capture is converted from BGRA (MSS's native format) to RGB, then resized to 84×84 using area interpolation (best for downscaling). The channel dimension is moved to the front because PyTorch expects `(C, H, W)` format.

Area interpolation when downscaling : each output pixel is the average of all source pixels that map to it. This preserves the overall visual information better than nearest-neighbor (which creates aliasing) or linear (which blurs).

## Reward engineering : the hardest part

The reward function is the secret sauce. Without a good reward signal, the bot will never learn.

```python
def _calculate_reward(self, screen, action_was_attack):
    reward = 0.0

    current_health = self._estimate_health_from_screen(screen)
    health_change = current_health - self.last_health_estimate

    if health_change > 0:
        reward += 20
    elif health_change < 0:
        reward -= abs(health_change) * 50
        self.damage_taken += abs(health_change)

    if current_health < 0.1:
        reward -= 100

    if action_was_attack and self.attack_cooldown == 0:
        hit_detected = self._detect_entity_hit(screen, self.last_screen)
        if hit_detected:
            reward += 50
            self.total_hits += 1
            self.consecutive_misses = 0
        else:
            reward -= 10
            self.total_misses += 1
            self.consecutive_misses += 1
            if self.consecutive_misses >= 3:
                reward -= 15

    if self.attack_cooldown > 0:
        self.attack_cooldown -= 1

    return reward
```

The reward structure breaks down into 3 components :

**Health tracking (visual estimation)** : The bot estimates its health from the red bar at the bottom of the screen by analyzing the red channel intensity. Health gain (healing) gives +20. Health loss gives -50 per unit. Death gives -100.

This is purely visual -- the bot has no API access to its health value. It infers it from pixels the same way a human would.

**Hit detection** : The most clever part. When the bot attacks, it compares the current screen to the previous one looking for :

1. A red flash in the center region (entity damage animation)
2. An overall brightness increase (hit marker)
3. High motion between frames (entity knockback)

```python
def _detect_entity_hit(self, current_screen, previous_screen):
    red_diff = np.mean(center_region_curr[:, :, 0]) - np.mean(center_region_prev[:, :, 0])
    if red_diff > 15:
        return True

    brightness_diff = np.mean(current_screen) - np.mean(previous_screen)
    if brightness_diff > 10:
        return True

    diff = cv2.absdiff(current_screen, previous_screen)
    motion = np.sum(diff) / diff.size
    if motion > 20:
        return True
    return False
```

3 independent heuristics, any one of which triggers a hit detection. The thresholds (15, 10, 20) were tuned empirically to balance false positives against missed detections.

A successful hit gives +50 reward. A miss gives -10, and 3 consecutive misses add another -15. This creates strong pressure to learn when to attack.

**Aim encouragement** : A smaller reward (+2 per confidence unit) for having the crosshair over entities, detected by analyzing color variance in the center 20×20 region. Entities have more varied colors than sky or ground.

## The PPO configuration

The bot uses Proximal Policy Optimization from Stable-Baselines3 :

```python
model = PPO(
    "CnnPolicy",
    env,
    policy_kwargs=dict(
        features_extractor_class=MinecraftCNN,
        features_extractor_kwargs=dict(features_dim=512),
    ),
    learning_rate=3e-4,
    n_steps=2048,
    batch_size=64,
    n_epochs=10,
    gamma=0.99,
    gae_lambda=0.95,
    clip_range=0.2,
    tensorboard_log="./pvp_bot_tensorboard/",
    device='cuda' if torch.cuda.is_available() else 'cpu'
)
```

Standard PPO hyperparameters. `n_steps=2048` means the policy updates after every 2048 environment steps (about 2 episodes at 1000 steps each). The CNN policy architecture is a standard Stable-Baselines3 pattern -- the feature extractor converts pixels to a feature vector, then separate actor and critic heads produce action probabilities and value estimates.

On a GPU, training at 100k steps takes roughly 2-4 hours depending on Minecraft's rendering load. On CPU, 8-12 hours.

## The training callback

```python
class PvPTrainingCallback(BaseCallback):
    def _on_step(self) -> bool:
        if self.locals.get('dones')[0]:
            ep_reward = self.locals.get('rewards', [0])[0]
            info = self.locals['infos'][0]
            accuracy = info.get('hit_accuracy', 0)

            if ep_reward > self.best_reward:
                self.best_reward = ep_reward
            if accuracy > self.best_accuracy:
                self.best_accuracy = accuracy

            print(f"Episode done | Reward: {ep_reward:.2f} | "
                  f"Hits: {info.get('hits', 0)} | "
                  f"Misses: {info.get('misses', 0)} | "
                  f"Accuracy: {accuracy:.1f}%")
        return True
```

The callback reports hit accuracy at the end of each episode -- this is the key metric that tells you whether the bot is actually learning to fight versus flailing randomly.

## The training timeline

The creator describes the expected progression :

| Steps | Behavior |
|-------|----------|
| 0-10k | Random exploration, learning basic controls |
| 10k-50k | Purposeful movement, occasional attacks |
| 50k-100k | Consistent combat, basic strategy |
| 100k+ | Advanced tactics, good decision-making |

At 0-10k steps, the bot is essentially a baby learning what its own limbs do. It discovers that W moves forward, that clicking does something, that looking around changes the view. The policy entropy is high -- actions are nearly random.

At 10k-50k, the reward signal starts shaping behavior. The bot learns to face the enemy and attack. It may start strafing because strafe+attack actions get higher rewards than attacking into empty air.

At 50k-100k, combat patterns emerge. The bot consistently tracks the enemy with mouse movements, attacks when facing them, and may learn to retreat when health is low. This is when it becomes recognizably "a PvP fighter" rather than a random mover.

## Hit detection : the technical challenge

The hardest engineering problem in this project is detecting whether an attack landed, without any game API access.

The creator's approach uses 3 visual heuristics :

```python
# Method 1: Red flash in center region (damage indicator on entity)
red_diff = np.mean(center_region_curr[:,:,0]) - np.mean(center_region_prev[:,:,0])
if red_diff > 15: return True

# Method 2: Overall screen brightness increase (hit marker flash)
brightness_diff = np.mean(current_screen) - np.mean(previous_screen)
if brightness_diff > 10: return True

# Method 3: High inter-frame motion (entity knockback)
diff = cv2.absdiff(current_screen, previous_screen)
motion = np.sum(diff) / diff.size
if motion > 20: return True
```

Each method has failure modes :

- Red flash detection fails if the entity is already red or if the background is warm-toned
- Brightness flash fails if the scene is already bright (desert, nether)
- Motion detection fails if the bot is moving the camera while attacking (most of the time)

Using all 3 together provides reasonable coverage. The thresholds are balanced so that false positives (rewarding a miss) and false negatives (punishing a hit) are both low enough for learning to converge.

## Health estimation from pixels

```python
def _estimate_health_from_screen(self, screen):
    bottom_region = screen[-50:, :200]
    red_channel = bottom_region[:, :, 0]
    red_pixels = np.sum(red_channel > 150)
    health_estimate = min(1.0, red_pixels / 5000)
    return health_estimate
```

Minecraft's health bar is at the bottom of the screen. The bot looks at the bottom 50 rows, leftmost 200 columns -- the region where hearts appear. Red pixels (channel value > 150) are counted and normalized to a 0-1 range.

This is crude but functional. In fullscreen mode with a dark background, the heart bar is one of the few consistently red elements on screen. False positives come from lava, redstone, and netherrack -- but in a PvP arena (typically a flat grassy or stone platform), the health bar is usually the dominant red element in the bottom-left corner.

## The main training script

```python
def train_pvp_bot(capture_region=None, total_timesteps=100_000):
    print("⚠️  BEFORE YOU START:")
    print("1. Open Minecraft and join a world/server")
    print("2. Enable PvP and spawn mobs/enemies")
    print("3. Position Minecraft window correctly")
    print("4. DON'T touch keyboard/mouse during training!\n")

    input("Press Enter when ready...")

    env = MinecraftPvPEnv(capture_region=capture_region)

    model = PPO("CnnPolicy", env, policy_kwargs=policy_kwargs, ...)

    try:
        model.learn(total_timesteps=total_timesteps, callback=callback)
    except KeyboardInterrupt:
        print("\n⚠️  Training interrupted")

    model.save("minecraft_pvp_bot_hit_detection")
    env.close()
```

The training loop requires the user to position Minecraft's window at a known location and then not touch the computer for hours. The capture region must be calibrated first using `find_minecraft.py` which provides an interactive tool to align the capture box.

## What the YouTube video shows

The video [AI Learns Minecraft PvP](https://www.youtube.com/watch?v=j5nxDKAjg6U) demonstrates the bot at various stages of training. Early episodes show the character spinning in circles, unable to coordinate movement and looking. By 50k steps, it faces the enemy and attacks. By 100k+, it strafes, tracks, and combos.

The progression is visible episode by episode. The learning curve plateaus around 100k steps -- diminishing returns after that point without significant hyperparameter tuning or reward function changes.

The creator notes that the bot's strength is consistency, not creativity. It will execute the same patterns every time, making it predictable to a skilled human player. But against an average player, the bot's reaction time (limited by the 50ms sleep between steps plus CNN inference) is competitive.

## Evaluation mode

```python
def evaluate_bot(model_path, capture_region, num_episodes=5):
    env = MinecraftPvPEnv(capture_region=capture_region)
    model = PPO.load(model_path)

    for episode in range(num_episodes):
        obs, info = env.reset()
        done = False
        while not done:
            action, _states = model.predict(obs, deterministic=True)
            obs, reward, terminated, truncated, info = env.step(action)
            done = terminated or truncated
        print(f"Episode {episode + 1} - Reward: {episode_reward:.2f}")
```

In evaluation mode, the policy is run deterministically (no action sampling noise). This gives the best performance but removes the exploration that was essential during training.

## VPT : the foundation these approaches build on

The PvP bot uses behavior cloning as part of its title, and that technique traces directly to OpenAI's **Video PreTraining (VPT)** project -- the most impactful piece of Minecraft AI research in recent years.

### The VPT pipeline

VPT solves a fundamental problem : there are 270k+ hours of Minecraft videos on YouTube, but none of them have action labels (keyboard presses, mouse movements). Training a behavioral cloning model requires knowing what actions the player took at each frame.

The VPT pipeline works in 3 stages :

1. **Collect a tiny labeled dataset** : Pay contractors to play Minecraft while recording both video and actions. About 2,000 hours of labeled data, costing roughly $2,000 USD.

2. **Train an Inverse Dynamics Model (IDM)** : A neural network that looks at frame `t-1` and frame `t+1` and predicts the action at frame `t`. Because the IDM is non-causal (it can see future frames), the task is much easier than behavioral cloning, and requires far less data.

3. **Pseudo-label 70k hours of YouTube videos** : Run the IDM over 70k hours of filtered Minecraft gameplay footage, generating pseudo-action labels for every frame. Then train a behavioral cloning policy on the entire dataset at scale.

```python
# Simplified IDM : given past and future frames, predict the middle action
class InverseDynamicsModel(nn.Module):
    def __init__(self, encoder, action_dim):
        super().__init__()
        self.encoder = encoder               # shared vision backbone
        self.action_head = nn.Sequential(
            nn.Linear(512 * 2, 256),
            nn.ReLU(),
            nn.Linear(256, action_dim)       # 128 button + 144 camera = 272 total
        )

    def forward(self, frame_t_minus_1, frame_t_plus_1):
        feat_past = self.encoder(frame_t_minus_1)
        feat_future = self.encoder(frame_t_plus_1)
        concat = torch.cat([feat_past, feat_future], dim=-1)
        return self.action_head(concat)
```

The IDM concatenates features from two frames and predicts the action in between. It never needs to see the middle frame -- the action can be inferred from the state change.

### What VPT achieved

The VPT foundation model (0.5B parameters, trained on 720 V100 GPUs for 9 days) exhibited zero-shot capabilities that were previously impossible with RL alone :

- Chopping down trees to collect logs
- Crafting planks and crafting tables (a 50-second / 1000-action sequence)
- Swimming, hunting animals, eating food
- Pillar jumping (placing blocks beneath yourself while jumping)

Fine-tuned with RL, the model achieved the first-ever computer agent to **craft diamond tools** in Minecraft -- a task requiring 20+ minutes (24,000+ actions) from a proficient human. An RL policy trained from scratch (no VPT pretraining) barely achieves any reward, never even learning to collect logs.

### VPT 2.0 and beyond

Since the original 2022 paper, VPT-based approaches have evolved. **STEVE-1** (2023) instruction-tuned VPT using MineCLIP's latent space, enabling text-guided behavior -- tell the model "chop a tree" and it does it. **TS-BC** (Targeted Search-Based Behavioral Cloning) searches the VPT dataset for similar situations and copies actions directly, bypassing neural policy learning entirely.

The PvP bot sits at the smaller end of this spectrum : a bespoke single-task policy trained from scratch with PPO, using a hand-designed reward function and visual heuristics. VPT is the industrial-scale version -- a foundation model pretrained on internet video, adaptable to any task through fine-tuning.

### Why VPT matters for this bot

The PvP bot's "behavior cloning" reference in its title isn't accidental. The VPT paper demonstrated that behavioral cloning at scale works for Minecraft specifically because :

- The action space (mouse + keyboard at 20Hz) is learnable by modern architectures
- The IDM can bootstrap labels from unlabeled video with high accuracy (>90% on held-out data)
- The resulting policy generalizes far beyond its training distribution

A VPT-pretrained policy fine-tuned for PvP would likely outpace the scratch-trained PPO bot -- but it would require the VPT model weights (several GB), the MineRL environment, and a more complex training pipeline. The PvP bot's advantage is simplicity : pure Python, zero external dependencies beyond PyTorch and game automation libraries, running on consumer hardware.

## OpenAI Five : when pure RL hits the reward-shaping wall

OpenAI Five sits at the opposite end of the spectrum from the PvP bot. Trained to play Dota 2 at world-champion level, it used pure self-play reinforcement learning -- no imitation learning, no human data, no behavior cloning. 256 GPUs, 128,000 CPU cores, 180 years of gameplay per day, 10 months of training.

The result was historic. On April 13th 2019, OpenAI Five defeated the Dota 2 world champions Team OG, the first AI to beat the best at an esports game.

But look at what it took.

**Reward shaping.** OpenAI Five's reward function was handcrafted by Dota experts. Out of 20,000 features exposed by the game API, only 28 were selected. Each had a hand-tuned weight. Net worth, kills, deaths, assists, last hits, building health, lane assignments -- all hand-picked and hand-weighted by humans who understood the game deeply.

```
P(win) ← maximize
    net_worth_diff × w1
    + kill_diff × w2
    + tower_health_diff × w3
    + ... (28 terms, each hand-tuned)
```

This is the dirty secret of "pure RL" in complex environments : the reward function encodes enormous human knowledge. Without this shaping, the agent barely learns. OpenAI ran an experiment where they rewarded only win/loss -- the bot trained an order of magnitude slower and plateaued at semi-pro level instead of superhuman.

**Reward hacking.** When the reward function is shaped, the agent will exploit it. OpenAI Five learned to farm last hits at the expense of map control, to chase kills instead of objectives, to play in ways that maximized the proxy reward but not the win rate. This had to be countered by symmetrizing rewards (subtracting the opponent team's average) and adding explicit penalties.

**Why imitation learning sidesteps this.** Behavioral cloning doesn't need a reward function. It copies actions from human demonstrations. The "reward" is implicit : the human already knew what to do. The model just needs to reproduce the behavior.

```
┌─────────────────────────────┐
│   Pure RL (OpenAI Five)     │
│                             │
│  Reward function:           │
│  28 hand-picked features    │
│  28 hand-tuned weights      │
│  Symmetrization tricks      │
│  Lane-assignment penalties  │
│                             │
│  180 years/day of training  │
└─────────────────────────────┘
        │ vs
┌─────────────────────────────┐
│   Imitation Learning (VPT)  │
│                             │
│  No reward function needed  │
│  Copy human actions         │
│  Human bias = feature       │
│                             │
│  Limited by demo quality    │
└─────────────────────────────┘
```

The human bias that imitation learning inherits -- all the quirks, strategies, and heuristics of the demonstrators -- is exactly what makes it work. The model doesn't need to discover movement from scratch, doesn't need to figure out that clicking damages enemies, doesn't need to learn that health bars matter. It already saw a human do all of that.

The tradeoff : imitation learning is bounded by the quality of its demonstrations. It can't exceed the humans it copies unless further fine-tuned with RL (which VPT does). Pure RL can surpass humans, but only with a reward function that encodes enough expert knowledge to avoid the dead ends of random exploration.

## DreamerV3 : world models and the diamond milestone

DeepMind's DreamerV3 takes a third approach. Instead of behavior cloning or shaped reward RL, it learns a **world model** -- a neural network that predicts future states and rewards from past actions -- and plans by dreaming about possible futures.

```
     ┌──────────────┐
     │  World Model  │ ← learns from past experience
     │  (RSSM)      │
     └──────┬───────┘
            │ predicts
     ┌──────▼───────┐
     │  Actor       │ ← chooses actions by dreaming
     │  + Critic    │    imagined future trajectories
     └──────────────┘
```

The architecture is three networks trained concurrently :

1. **World model** (Recurrent State-Space Model) : encodes pixels into compact latent states, predicts future representations and rewards
2. **Critic** : estimates the value of imagined trajectories
3. **Actor** : learns to maximize imagined rewards through dreaming

DreamerV3's key result : it was the **first algorithm to collect diamonds in Minecraft from scratch without human data or curricula**, published in Nature in 2025.

### The 12 milestone reward

The diamond environment defines a sparse reward over 12 milestones :

| # | Milestone | Reward |
|---|-----------|--------|
| 1 | Collect log | +1 |
| 2 | Craft planks | +1 |
| 3 | Craft stick | +1 |
| 4 | Craft crafting table | +1 |
| 5 | Craft wooden pickaxe | +1 |
| 6 | Mine cobblestone | +1 |
| 7 | Craft stone pickaxe | +1 |
| 8 | Mine iron ore | +1 |
| 9 | Craft furnace | +1 |
| 10 | Smelt iron ingot | +1 |
| 11 | Craft iron pickaxe | +1 |
| 12 | Collect diamond | +1 |

```python
# The milestone reward function in DreamerV3's diamond env
self.items = [
    "log", "planks", "stick", "crafting_table", "wooden_pickaxe",
    "cobblestone", "stone_pickaxe", "iron_ore", "furnace",
    "iron_ingot", "iron_pickaxe", "diamond",
]
self.rewards = [CollectReward(item, once=1) for item in self.items] + [
    HealthReward(scale=0.01)
]

def step(self, action):
    obs, _, done, info = self.env.step(action)
    reward = sum([fn(obs, self.env.inventory) for fn in self.rewards)]
    return obs, reward, done, info
```

`CollectReward(once=1)` gives +1 exactly once per item per episode -- the first time the agent acquires it. `HealthReward` adds ±0.01 per health point lost or recovered. Total achievable : 11.1 (12 milestones × 1 + max 1.1 health recovery).

Every other timestep : reward is 0. This is **extremely sparse**. In a typical 36,000-step episode (30 minutes of gameplay), the reward signal fires fewer than 20 times. The agent must chain 12 milestones in the correct order with nothing but zeros between them.

### How DreamerV3 solves sparse rewards

DreamerV3's world model lets it imagine trajectories and evaluate them internally. The actor learns from dreamed rollouts rather than real experience, which means it can test thousands of possible futures for every real step taken. This is what makes sparse rewards feasible : the agent can mentally explore the consequences of actions without actually taking them.

The paper reports that across 40 seeds trained for 100 million environment steps, **24 out of 40 seeds collected at least one diamond**. The first diamond appeared after 29 million steps (roughly 9 days of training). The most successful agent collected diamonds in 6 out of its episodes.

For comparison, VPT needed 720 GPUs and 70k hours of labeled video to achieve similar capabilities. DreamerV3 needed one GPU per seed, no human data, and a general algorithm with fixed hyperparameters across all its 150+ benchmark tasks.

The PvP bot, OpenAI Five, VPT, and DreamerV3 each represent a different philosophy for training game-playing agents :

| Approach | Data source | Reward | Human bias | Compute |
|----------|-------------|--------|------------|---------|
| PvP Bot | RL from scratch | Shaped (visual heuristics) | Reward design only | 1 GPU, hours |
| OpenAI Five | RL self-play | Shaped (28 features) | Reward design only | 256 GPUs, 10 months |
| VPT | Imitation + RL | Human demo labels | Full behavioral bias | 720 GPUs, 9 days |
| DreamerV3 | World model RL | Sparse milestones | Reward design only | 1 GPU, 9 days |

## The result

A Minecraft PvP bot in ~400 lines of Python, built on 3 key libraries :

- **`stable-baselines3`** : PPO implementation with CNN policy
- **`mss`** : Fast screen capture at 84×84
- **`pydirectinput`** : Keyboard/mouse simulation

The bot learns to fight using only pixel input. No game state, no API, no mods. It watches the screen, presses keys, and gets better through trial and error.

The [repo](https://github.com/GiaoShou66/Minecraft-PVP-bot) is MIT. 5 commits, 4 Python files, no dependencies you can't `pip install`.

---

**VPT** : [Paper](https://cdn.openai.com/vpt/Paper.pdf) · [Blog](https://openai.com/index/vpt/) · [GitHub](https://github.com/openai/Video-Pre-Training) · 70k hours of video, 0.5B parameters, first AI to craft diamond tools.

**STEVE-1** : [Paper](https://arxiv.org/abs/2306.00987) · [GitHub](https://github.com/Shalev-Lifshitz/STEVE-1) · Instruction-tuned VPT with text-guided behavior.

**OpenAI Five** : [Paper](https://arxiv.org/abs/1912.06680) · [Blog](https://openai.com/index/dota-2/) · Pure self-play RL, world champion at Dota 2, 28 hand-crafted reward features.

**DreamerV3** : [Paper](https://arxiv.org/abs/2301.04104) · [GitHub](https://github.com/danijar/dreamerv3) · World model RL, first to collect diamonds from scratch, published in Nature.

**PvP Bot** : [GitHub](https://github.com/GiaoShou66/Minecraft-PVP-bot) · 400 lines, PPO + CNN, 16 actions, MIT license.
