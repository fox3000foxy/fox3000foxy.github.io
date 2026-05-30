---
title: Bareiron — a Minecraft server running on a $1 microcontroller
description: 6800 lines of C, zero malloc, Perlin noise replaced by bilinear
  interpolation, biomes as a tile map, all on a $1 ESP32 chip.
date: 2026-05-30
tags:
  - minecraft
  - reverse-engineering
  - embedded
  - c
  - esp32
authors:
  - fox3000foxy
---

## Introduction

Ever wondered if you could run a Minecraft server on a $1 microcontroller ?

I did. And the answer is yes. Literally.

There's a project called [Bareiron](https://github.com/p2r3/bareiron/), by p2r3, and it's probably one of the most fascinating things I've seen in the Minecraft open-source world in years. **6800 lines of C**, zero external dependencies, no malloc, no threading, and it runs on an **ESP32 that costs a single dollar**.

Infinite terrain generation. Biomes. Caves. Crafting. Mining. Mobs. Hunger. Chests. Everything you'd expect from a survival server.

On a chip drawing **0.5 Watts** clocked at **160 MHz**.

To put things in perspective : a vanilla Minecraft server needs gigabytes of RAM and a CPU that doesn't break a sweat. The ESP32-C3 has **520 KB of SRAM** (about 400 KB available after boot). That's roughly a **20,000x gap** in raw power.

So how is this possible ? p2r3 didn't write a Minecraft server in C — he reinvented every single component so it fits within these constraints. And honestly, the way he did it is an engineering lesson in itself.

## The brain of the project : terrain generation without memory

The biggest challenge when building an embedded Minecraft server is terrain generation.

In vanilla Minecraft, the world is generated using **Perlin noise**. It's an algorithm that produces a smooth, continuous gradient — kinda like a blurry cloud — by stacking multiple layers called octaves. The more octaves you add, the more natural the terrain looks. Then you throw in 6 biome parameters — temperature, humidity, continentalness, erosion, weirdness, depth — to shape the landscape.

The result is gorgeous. But it's expensive in compute, and it requires RAM to cache generated chunks.

Bareiron's approach is radically different. Instead of stacking noise, it uses **bilinear interpolation**.

You know when you upscale a tiny pixelated image and the edges get all blurry ? That's bilinear interpolation. A dead-simple algorithm that takes 4 points and fills the space between them with a smooth gradient.

Here's how Bareiron applies it to terrain :

```c
height = bilinear_interpolate(
  RNG(chunk_x,     chunk_z),     // top-left corner
  RNG(chunk_x + 1, chunk_z),     // top-right corner
  RNG(chunk_x,     chunk_z + 1), // bottom-left corner
  RNG(chunk_x + 1, chunk_z + 1), // bottom-right corner
  offset_x, offset_z
);
```

The 4 reference points for each chunk are its corners. Their coordinates are used as **seeds** for a random number generator. And since the RNG is deterministic, the same coordinates always produce the same result.

See the beauty of it ? The server doesn't need to store terrain anywhere. It can recompute it on the fly whenever a player moves into a new area. And it'll be exactly the same every time.

Adjacent chunks share 2 corners, so the interpolation is continuous across chunk boundaries. No cracks, no ugly seams.

You can control the look by adjusting how many RNG bits you combine. More bits = smoother terrain (like more coin flips giving a distribution closer to 50/50). Fewer bits = rougher, more chaotic terrain.

With this method, generating one chunk on the ESP32 takes about **200 milliseconds**. Perfectly playable.

### Caves : the art of not overcomplicating things

Caves in vanilla Minecraft have their own generation algorithm. Separate noise layers, underground biomes, the whole deal.

Bareiron's answer is a single line of code :

```c
cave_y = CAVE_BASE_DEPTH - (surface_height - y);
```

It takes the surface height above and **mirrors** it underground. This produces cavities that look like the big deepslate caves you're familiar with.

Not as varied as vanilla caves, sure. But it cost zero extra compute and literally one line of code.

### Ores : XOR edition

Same story for ores. No complex vein generation. An XOR of the column coordinates guarantees exactly one ore candidate per column. The ore type depends on Y level.

```c
candidate = (chunk_x ^ col_x ^ col_z) % 100;
if (candidate < 5 && y < 16) -> diamond
if (candidate < 15 && y < 32) -> gold
// etc.
```

That's it. A single math operation. Zero storage.

### The biome tile map

Biomes are the kind of feature that could cost you dearly. A noise layer on top of your terrain noise, parameters everywhere, and suddenly you've doubled your compute.

Bareiron takes a more rustic but brutally efficient approach : a **tile map**. Each biome is a circular island arranged in a grid. Each island's type comes from a small repeating pattern calculated from the world seed.

Yes, it's gridded. Yes, it's predictable. But it costs nothing, and the result is convincing enough.

Each biome tweaks the height generation parameters :
- **Plains and forests** : 4 height factors, mostly flat with occasional features
- **Desert** : max 6 blocks of variation, never below sea level
- **Snowy plains** : only 2 factors, but up to 14 blocks of variation — hillier

Surface elements like trees, cacti, or bushes use the same random numbers generated from chunk corners. Zero extra overhead.

## Crafting : when the ugly solution is the best one

In an ideal world, crafting is implemented with 3x3 matrices for each recipe and a kernel-fitting algorithm to match patterns. Clean, maintainable, extensible.

Also memory-hungry.

p2r3 went with a much more... pragmatic approach. His crafting function starts by counting filled slots, noting the first item, and checking whether all other items are identical.

With just that, you can already match simple recipes in a handful of operations :

```c
if (count == 8 && first == cobblestone && all_identical && center_empty)
    return furnace;
```

4 conditions and you've matched the furnace recipe. Change one condition and you've got the chest recipe.

For more complex shapes like tools, the code uses the first item's index to determine the relative positions of the others. Shears for example : 2 iron items positioned diagonally from each other.

Recipes that share a shape (all pickaxes, all swords) use the same matching function — the output just changes based on the material.

The code is less readable than a clean recipe table. But it takes zero memory and executes in a laughably small number of instructions. On an ESP32, that's what counts.

## The furnace that cheats

The furnace in vanilla Minecraft is a whole mechanic. A running timer, input items, a result cooking, fuel to manage. It takes memory to track the state of every active furnace.

Bareiron says : nope. The furnace works like a crafting table. Put ingredients in, get the result out. **Instant.**

It's not realistic. But it's efficient, takes zero memory, and avoids having to manage timers and persistent states for every block.

## Chests : the nastiest memory hack I've ever seen

When p2r3 started getting testers on his project, people asked for chests. Without chests, there's no way to share items between players. Result : people were starving while others had stacks of food.

But adding chests means storing 27 inventory slots per chest. And on an ESP32, you can't just `malloc` whenever you feel like it. You need to know ahead of time exactly how much memory you'll use.

The solution he came up with is so twisted it's beautiful.

The array that stores block changes uses tiny 6-byte entries :
- 2 bytes for X
- 1 byte for Y
- 2 bytes for Z
- 1 byte for the block ID

And the way Bareiron stores an item is : 16 bits for the item ID, 8 bits for the stack size.

By pure coincidence, each 6-byte entry can store **exactly 2 items**.

So each chest takes 15 entries in the block array — 1 for the chest block itself, 14 for the 27 inventory slots (2 items per entry, 3 bytes per slot, with 1 byte of waste).

When a player opens a chest, the server **memcpy**s the slot memory region directly into the player's crafting buffer. That buffer is normally used for crafting, but you can't craft with a chest open, so it gets recycled. A special flag is set to block any crafting attempts.

The source code comment :

```c
// Terrible memory hack!!1!
```

I couldn't have said it better myself.

## Hunger that tracks itself for free

There's one thing I absolutely love about this project : the way hunger is implemented.

Modern Minecraft hunger mechanics are complex. Health, hunger, saturation, timers ticking, calculations based on what the player is doing.

p2r3 noticed something obvious. When a player moves, their client sends movement packets at roughly 20 per second. When they don't move, they send one.

The server has to process these packets anyway. It's work it's already doing, regardless of anything else.

So he turned it into a free activity counter.

Every movement packet received, the counter goes down. When it hits zero, the player's hunger drops. When the player eats, the counter goes back up.

Zero allocated timers. Zero memory used. Zero dedicated compute cycles. Hunger implemented by piggybacking on a system that already exists.

I find that brilliant.

## Mobs on a budget

Every mob in Bareiron is **8 bytes**. Literally :
- 1 byte for the type
- 2 bytes for X
- 1 byte for Y
- 2 bytes for Z
- 1 byte for data (health, sheared state, panic timer)

Passive mobs wander randomly in one of 8 directions. Hostiles walk straight toward the nearest player. No pathfinding, no A*, no obstacle avoidance. They just go toward you in a straight line.

When a zombie gets within 2 blocks, it hits for 3 hearts per second. That's deliberately higher than normal, because without pathfinding players can easily kite them. Armor reduces damage using the pre-combat-update formula.

Mobs spawn when you cross a chunk boundary. No random ticks, no complex spawn management system. You cross into a new chunk, a mob has a chance to appear.

## What got sacrificed

For all this to fit, some vanilla features don't exist. And it's not laziness — it's conscious choices.

**No network compression.** The Minecraft protocol uses zlib to compress large packets. But compressing data on an ESP32 is too expensive CPU-wise. Result : the server can generate chunks quickly, but the network becomes the bottleneck.

**No random ticks.** Trees don't grow on their own. Want a tree ? Use bone meal from a composter, or nothing.

**No item entities.** When you mine a block, the loot goes straight to your inventory. There's even a visual animation to make it look legit, but the server doesn't check distance. Items always reach you.

**No inventory validation.** The server trusts the client. If your client says you've got 64 diamonds in your pocket, the server says "OK". No calculation to verify, too expensive.

**No server-side lighting.** Torches are sent after every other block, forcing the client to calculate lighting on its own.

**No gradual fluid flow.** Water and lava reach their final state instantly. No block update queues to manage.

## The end result

On a desktop PC with a Ryzen 5 3600, Bareiron generates a chunk in about 0.5 milliseconds.

On an ESP32-C3 you can find for under a buck on Aliexpress, it's about 200 milliseconds per chunk. And it's playable.

With more than 3 players online, things start lagging. The author compares it to 2b2t during peak hours, and honestly, that's a compliment.

Of course, this isn't a server you want to hand to strangers. Without inventory validation, anyone can give themselves stacks of diamonds. And without network compression, a bad connection makes it unplayable.

But the fact that it works at all is already incredible.

## The philosophy

What makes Bareiron fascinating is that every single line of code is a conscious tradeoff. Nothing is there by accident.

Perlin noise was replaced with bilinear interpolation : the terrain isn't as pretty, but it's 200 times faster and takes zero memory. Crafting matrices were replaced with hardcoded matching : the code is ugly, but it doesn't consume a single extra byte. zlib compression was removed : people with bad connections can't play, but the server can run on a 160 MHz chip. Inventory validation was disabled : security doesn't exist, but there's zero computation overhead.

Every missing feature is the price paid for another feature to exist within the hardware's limits.

It's not "a Minecraft server written in C". It's "a Minecraft server that fits on a $1 microcontroller because the right sacrifices were made."

**3 things to remember :**

1. **Interpolation + RNG instead of Perlin noise** -- 4 seeded points, interpolated between them, and you get infinite terrain that takes zero memory and generates in 200 ms. That's the genius move that makes everything else possible.
2. **Every feature has a cost, nothing is free** -- No compression, no random ticks, no inventory validation. These aren't oversights, they're what allows the rest to fit in 520 KB of SRAM.
3. **The nastiest solutions are sometimes the smartest** -- Chests stored in the block array, hunger tracked by movement packets, instant-smelting furnace. The "clean" and "maintainable" solution would have been too expensive, so p2r3 did what works within the constraints.

If the project interests you, everything's on [GitHub under GPLv3](https://github.com/p2r3/bareiron/). It's some beautifully dirty C, and I haven't had this much fun reading source code in a long time xD
