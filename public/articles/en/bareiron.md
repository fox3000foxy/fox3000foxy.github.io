---
title: Bareiron -- a Minecraft server running on a $1 microcontroller
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

There's a $1 chip running a Minecraft server.

Infinite world generation, biomes, caves, crafting, mining, mobs, hunger, chests. On a microcontroller running at **160 MHz** drawing **0.5 Watt**.

It's [Bareiron](https://github.com/p2r3/bareiron/), by p2r3.

Not gonna lie: this is one of the wtf-est projects I've seen. Not because "lol server in C". But because **every line** is a conscious tradeoff to fit the impossible into 520 KB of SRAM.

## The problem

Vanilla Notchian server: gigabytes of RAM, Perlin noise everywhere, 6 biome parameters, zlib, millions of cached chunks.

ESP32-C3: **520 KB SRAM**, **160 MHz**, **0.5 Watt**.

~20,000x gap.

p2r3 didn't optimize. He **redesigned everything**.

## Terrain generation

Perlin noise is expensive. Stacking octaves costs serious CPU.

He uses **bilinear interpolation** with an RNG seeded by coordinates.

```c
height = bilinear_interpolate(
  RNG(chunk_x,     chunk_z),
  RNG(chunk_x + 1, chunk_z),
  RNG(chunk_x,     chunk_z + 1),
  RNG(chunk_x + 1, chunk_z + 1),
  offset_x, offset_z
);
```

Adjacent chunks share 2 corners. Continuous interpolation. No cracks.

Tweak the bit count to control terrain roughness.

**Zero chunk storage.**

### Caves: mirror the surface

```c
cave_y = CAVE_BASE_DEPTH - (surface_height - y);
```

Mirrors the surface underground. Looks like deepslate cavities. Simple, cheap.

### Ores: one XOR

No veins. An XOR of coordinates. One candidate per column. Done.

```c
candidate = (chunk_x ^ col_x ^ col_z) % 100;
if (candidate < 5 && y < 16) -> diamond
```

### Biomes: island tile map

A tile map. Each biome is a circular island. Type comes from a seed-derived repeating pattern.

Gridded? Yes. Predictable? Yes. **Free? Yes.**

Each biome tweaks generation params:
- **Plains**: 4 factors, flat
- **Desert**: max 6 blocks variation
- **Snowy plains**: 2 factors, 14 blocks variation

Trees, cacti, bushes: seeded by the same corner RNG values. Zero overhead.

## Crafting: ugly code, zero memory

The clean approach: 3x3 matrices + kernel-fitting. Beautiful. Maintainable. **Memory-hungry.**

Bareiron counts slots, notes the first item, checks if the rest match. 4 ops to match a furnace:

```c
if (count == 8 && first == cobblestone && all_identical && center_empty)
    return furnace;
```

For shapes: first item index + relative position.

Code's ugly. Zero memory. Fast.

## The furnace

Vanilla: timer, storage, fuel.

Bareiron: put ingredients in, take result out. Instant.

Less realistic. Way more efficient.

## Chests: the nastiest hack you'll see

Testers wanted chests. Storing 27 slots was the problem.

The block change array uses 6-byte entries:
- 2 bytes X
- 1 byte Y
- 2 bytes Z
- 1 byte block ID

Items are: 16 bit ID + 8 bit stack size.

**By pure coincidence**, each block entry fits exactly 2 items.

Each chest takes 15 entries. When you open one, the server **memcpy**'s the region into the player's craft buffer (recycled -- you can't craft with a chest open). A `0x80` flag blocks crafting.

The code comment:

```c
// Terrible memory hack!!1!
```

xD

## Free hunger tracking

When you move, your client sends packets at 20/sec. When you don't: 1.

The server processes them anyway. Free counter.

```c
// Packet received → counter--
// Counter hits 0 → hunger drops
// Eating → counter++
```

Zero timer, zero storage, zero extra compute.

## Mobs in 8 bytes

- 1 byte type
- 2 bytes X
- 1 byte Y
- 2 bytes Z
- 1 byte data

Passives: walk in one of 8 random directions.
Hostiles: walk toward nearest player.
No pathfinding, no obstacle avoidance.

Zombie at 2 blocks: 3 hearts/sec (compensates for dumb AI).
Spawn: at chunk boundaries.

Nothing else.

## What got cut

- **No compression**: zlib is too expensive. Generating chunks is fast, sending them is the bottleneck.
- **No random ticks**: trees grow with bone meal or not at all.
- **No item entities**: mined blocks go straight to inventory.
- **No inventory validation**: client says 64 diamonds → 64 diamonds. Trust the client.
- **No server-side lighting**: torches sent after other blocks, client calculates.
- **No gradual fluid flow**: instant final state.

**3 friends on a $1 ESP32? Playable.** It lags a bit, but it works.

## The philosophy

Perlin → bilinear interpolation: uglier, 200x faster.
Matrices → hardcoded patterns: disgusting, zero memory.
zlib → nothing: bad connection = dead, but playable.
Validation → trust: zero security, zero overhead.

**3 things to remember:**

1. **Bilinear interpolation + RNG** -- 4 seeded points, infinite terrain, zero storage.
2. **Everything costs something** -- The features that got cut make room for the ones that remain in 520 KB.
3. **Nasty hacks are the smartest** -- Chests in the block array, hunger via movement packets, instant furnace.

The [repo](https://github.com/p2r3/bareiron/) is GPLv3. Go check it out. It's some dirty C and I love it xD
