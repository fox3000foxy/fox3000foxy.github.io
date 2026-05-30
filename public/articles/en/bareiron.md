---
title: Bareiron -- a Minecraft server running on a $1 microcontroller
description: 6800 lines of C, zero malloc, Perlin noise replaced by bilinear
  interpolation, biomes as a tile map, from the project creator's own words.
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

There's a project called [Bareiron](https://github.com/p2r3/bareiron/), by p2r3, and it's probably one of the most fascinating things I've seen in the Minecraft open-source world in years. A binary that fits in **300 KB**, **6800 lines of C**, zero external dependencies, no malloc, no threading, running on an **ESP32 that costs a single dollar**.

Infinite terrain generation. Biomes. Caves. Crafting. Mining. Mobs. Hunger. Chests. Everything you'd expect from a survival server.

On a chip drawing **0.5 Watts** clocked at **160 MHz**.

To put things in perspective : a vanilla Minecraft server needs gigabytes of RAM and a CPU that doesn't break a sweat. The ESP32-C3 has **520 KB of SRAM** (about 400 KB available after boot). Processors from 20 years ago already ran at gigahertz speeds -- this one tops out at 160 MHz. That's roughly a **20,000x gap** in raw power.

So how is this possible ? p2r3 didn't write a Minecraft server in C -- he reinvented every single component so it fits within these constraints.

## The brain of the project : terrain generation without memory

The biggest challenge when building an embedded Minecraft server is terrain generation.

In vanilla Minecraft, the world is generated using **Perlin noise**. It stacks multiple layers called octaves to create natural-looking randomness, then applies 6 biome parameters -- temperature, humidity, continentalness, erosion, weirdness, depth -- to shape the landscape.

The result is gorgeous. Expensive in compute, memory-hungry for chunk caching.

Bareiron's approach is radically different. Instead of stacking noise, it uses **bilinear interpolation** -- the same algorithm image software uses when you upscale a pixelated picture and the edges go blurry.

Here's how it works :

```c
height = bilinear_interpolate(
  RNG(chunk_x,     chunk_z),     // top-left corner
  RNG(chunk_x + 1, chunk_z),     // top-right corner
  RNG(chunk_x,     chunk_z + 1), // bottom-left corner
  RNG(chunk_x + 1, chunk_z + 1), // bottom-right corner
  offset_x, offset_z
);
```

The 4 reference points for each chunk are its corners. Their coordinates feed into an RNG as **seeds**. Deterministic RNG means the same coordinates always produce the same result.

The server doesn't need to store terrain anywhere. It recomputes on the fly when a player moves into a new area, getting the exact same result.

Adjacent chunks share 2 corners, keeping interpolation continuous across boundaries. No cracks, no ugly seams.

You can control terrain look by adjusting how many RNG bits you combine. More bits = smoother terrain (like more coin flips approaching 50/50). Fewer bits = rougher terrain.

With this method, generating one chunk on the ESP32 takes about **200 milliseconds**. Perfectly playable.

### Querying blocks without regenerating the chunk

Say you're playing on this server. You see a block, you click to mine it. The server needs to know what item to give you.

Naively, you'd regenerate the whole chunk just to find the height at that specific spot. But bilinear interpolation lets you query **any point** on the plane directly. Corner coordinates come from the player's position, interpolation returns the height at any offset. A handful of math operations, no chunk generation needed.

p2r3 described the goal as "a magic function that can tell me what block sits at a given coordinate, without referring to memory or calculating expensive noise maps." That's exactly what he built.

### Caves : the mirror trick

Vanilla caves have their own separate algorithm with underground biomes and everything.

Bareiron's answer :

```c
cave_y = CAVE_BASE_DEPTH - (surface_height - y);
```

Mirrors the surface underground. Produces cavities that look like deepslate caves. One line of code, zero extra compute.

### Ores : XOR edition

No vein generation. An XOR of column coordinates guarantees one candidate per column. Type depends on Y level.

```c
candidate = (chunk_x ^ col_x ^ col_z) % 100;
if (candidate < 5 && y < 16) -> diamond
if (candidate < 15 && y < 32) -> gold
// etc.
```

Diamonds are hidden under the lowest point of each cave volume, so mining stays rewarding despite the lack of proper veins.

### Biome tile map

Layering biome noise on top of terrain noise would double the compute. Instead, Bareiron uses a **tile map** : each biome is a circular island in a grid, its type determined by a seed-derived repeating pattern.

Gridded. Predictable. **Free.**

Each biome adjusts height parameters :
- **Plains / forests** : 4 factors, mostly flat
- **Desert** : max 6 blocks variation, never below sea level
- **Snowy plains** : 2 factors, up to 14 blocks variation, hillier

Surface elements (trees, cacti, bushes) use the same chunk corner RNG values. Zero overhead.

## Block change storage : accepting limits

Since terrain generates on the fly, the server only stores player-made changes : a flat array of **6-byte entries** :

- 2 bytes for X (32,000 block horizontal limit)
- 1 byte for Y (256 block vertical limit)
- 2 bytes for Z
- 1 byte for block ID (256 block type limit)

This layout fits about **25,000 block changes** -- roughly **1.5 chunks** fully dug out. Larger data types would halve that capacity.

As for the 256 block limit : p2r3's words : "I don't plan on implementing Waxed Lightly Weathered Cut Copper Stairs any time soon."

## Crafting : when the ugly solution is best

The clean approach : 3x3 matrices per recipe, kernel-fitting algorithm. Maintainable, extensible, memory-hungry.

p2r3 went pragmatic. The function counts filled slots, notes the first item, checks if the rest are identical.

Some recipes match in 4 operations :

```c
if (count == 8 && first == cobblestone && all_identical && center_empty)
    return furnace;
```

Complex shapes use the first item's index to check relative positions. Similar recipes share one matching function -- output changes based on detected material.

Ugly code. Zero memory. Fast.

## The furnace that cheats

Vanilla furnaces : timer, input/output storage, fuel management.

Bareiron : put ingredients in, get result out. **Instant.**

No memory, no timers, no persistent state per block.

## Chests : the nastiest memory hack

Testers wanted chests for sharing items. Without them, people starved while others had food. But 27 inventory slots per chest means storage, and on an ESP32 you can't `malloc` on demand -- heap fragmentation will crash the program.

The block change array uses 6-byte entries. Bareiron stores items as 16 bit ID + 8 bit stack size.

By pure coincidence, each 6-byte entry fits **exactly 2 items**.

Each chest takes 15 entries : 1 for the block, 14 for 27 slots (2 items per entry, 3 bytes per slot).

When a player opens a chest, the server **memcpy**s the slot region into the player's crafting buffer -- recycled because you can't craft with a chest open. A flag blocks crafting attempts.

The source code comment :

```c
// Terrible memory hack!!1!
```

Couldn't have put it better.

## Hunger tracked for free

Modern hunger mechanics are complex. Health, hunger, saturation, timers.

p2r3 noticed : when a player moves, their client sends movement packets at ~20/sec. When they don't move : one packet.

The server processes these anyway. Free activity counter.

Movement packet received → counter drops. Counter hits zero → hunger drops. Player eats → counter rises.

Zero timers. Zero memory. Zero dedicated compute. Implemented by piggybacking on an existing system.

### Fall damage : the simplest damage type

The server tracks the last Y level where the player left the ground. When they touch ground again, it subtracts current Y from stored Y. Difference equals damage.

First damage system p2r3 implemented, because it's trivial.

## Mobs on a budget

Each mob fits in **8 bytes** :
- 1 byte type
- 2 bytes X
- 1 byte Y
- 2 bytes Z
- 1 byte data (health, sheared, panic timer)

Passives wander 8 random directions. Hostiles walk straight toward nearest player. No pathfinding, no A*, no obstacle avoidance.

Zombie at 2 blocks : 3 hearts/sec (deliberately high -- no pathfinding means easy kiting).

Armor uses the pre-combat-update formula. Full diamond absorbs almost all damage. Fair compensation for lag on a microcontroller.

Mobs spawn when crossing chunk boundaries. No random ticks, no spawn management.

## What got sacrificed

**No network compression.** zlib is too CPU-heavy for an ESP32. Generating chunks is fast, sending them is the bottleneck. Bad internet = unplayable.

**No random ticks.** Trees grow with bone meal or not at all. Mobs don't spawn randomly -- they appear at chunk boundaries.

**No item entities.** Mined blocks go straight to inventory. Visual animation exists, but the server doesn't check distance.

**No inventory validation.** Server trusts the client entirely. Client says 64 diamonds, it's 64 diamonds. Client says it just mined an entire chunk in one second, server accepts it. Don't use this with strangers.

**No server-side lighting.** Torches sent after other blocks, client calculates lighting.

**No gradual fluid flow.** Water and lava reach final state instantly. No block update queues.

## The result

Desktop Ryzen 5 3600 : ~0.5 ms per chunk.

ESP32-C3 at under $1 : ~200 ms per chunk. Playable.

More than 3 players : lag kicks in. Author compares it to 2b2t peak hours. That's a compliment.

## The philosophy

Why spend a month building an embedded Minecraft server ?

p2r3's answer : "I just really like the idea that this tiny little chip that costs one friggin' dollar and consumes half a Watt can run something as advanced as Minecraft. Science isn't about 'why', it's about 'why not.'"

Every line is a conscious tradeoff. Perlin noise replaced with bilinear interpolation : uglier terrain, 200x faster, zero memory. Crafting matrices replaced with hardcoded matching : disgusting code, zero byte overhead. zlib removed : bad connections can't play, server runs on 160 MHz. Inventory validation disabled : no security, zero compute overhead.

Every missing feature pays for another to exist within the hardware limits.

**3 things to remember :**

1. **Interpolation + RNG instead of Perlin noise** -- 4 seeded points, infinite terrain, zero storage, 200 ms generation. And you can query any block without regenerating a chunk.
2. **Every feature costs something** -- No compression, no random ticks, no validation. These aren't oversights, they're what keeps the whole thing in 520 KB of SRAM.
3. **The nastiest solutions are often the smartest** -- Chests in the block array, hunger via movement packets, instant furnace. The "clean" approach would have been too expensive.

The [repo](https://github.com/p2r3/bareiron/) is GPLv3. Go check it out. It's beautiful dirty C xD
