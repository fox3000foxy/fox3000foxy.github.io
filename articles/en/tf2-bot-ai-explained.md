---
title: "TF2 Bots Aren't Random: I Rediscovered Every Difficulty Parameter"
description: "Vision, aim, backstab angles, headshot logic, every known bug -- Valve never documented any of it. So we dug through the code and turned it into a full spec sheet."
date: 2026-07-12
authors:
  - fox3000foxy
tags:
  - tf2
  - game-ai
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "1gJjd+lXgQh3NAEUqsCKXUmYzE8SALdm90aTqXMEK6UGRekRNNIp4CyGBgbte3zKlGWJNqgwbGir16yLrrAKtQ=="
---

## Introduction

![TF2 Soldier bot aiming with a rocket launcher](assets/tf2-bot-ai-soldier-aim.png)

Every TF2 player has said it at least once: "that bot is cheating." Or the opposite: "why is that Easy bot just standing there eating rockets." Nobody really knows what "Easy," "Normal," "Hard," and "Expert" mean under the hood: Valve shipped four difficulty labels and exactly zero documentation.

So a bunch of us (me, awimii, Mush The Possum, with a huge chunk of the base work done by sigsegv, who really dug through the game's decompiled code) put together a full research document on TFBot behavior. Every mechanic, every known bug, every hardcoded probability. This article is the full report, not the condensed version. Grab a Bonk, it's going to be long.

---

## Chapter I: The Basics

### Bot vs Puppet Bot

TF2 has two completely different things people call "bots":

- **AI Bots (TFBots)**: real AI, built on the same PlayerBot/Infected framework Valve used for the *Left 4 Dead* series. They pick a random class, play the objective, work without `sv_cheats`, and trigger achievements like a real player.
- **Puppet Bots**: zero AI, unable to move or act on their own. They exist only to be manually controlled -- a player can force them to follow, aim, and shoot. Mainly used for testing or for cinematic screenshots and videos. Spawning them requires `sv_cheats 1`, which also disables achievements for the session.

This article is entirely about the first kind.

### What you can (more or less) tell AI bots to do

TFBots aren't directly controllable, but you can nudge them into doing certain things:

- Aim at any bot (ally or enemy) with your crosshair and it will taunt you if you use the right voice commands.
- An allied Medic bot heals you if you use the "Medic!" voice command.
- If a Medic bot healing you has an UberCharge ready, saying "Go go go!" or "Activate charge!" makes it pop the charge immediately.
- A Medic bot with a ready charge auto-pops it as soon as either it or its heal target takes serious damage, no voice command needed.
- Bots spontaneously perform duo taunts (High Five) or group taunts (Conga) with nearby teammates.

### Making bots work on unsupported maps

Bots depend on a navigation mesh to know where they're allowed to walk, and most community maps don't ship one. To force it:

1. `sv_cheats 1`
2. `nav_generate` -- builds the initial navmesh, progress shown in console
3. Wait for the game to finish generating paths
4. Optionally, manually fix bad nav data with `nav_edit 1`
5. Reload or restart the server (skipping this step disables achievements)
6. `tf_bot_add <number>` to spawn the bots

**Warning:** editing the navmesh while bots are active on the server can crash the game. Once the mesh exists, you don't need to regenerate it for future sessions: just add bots with `tf_bot_add`.

Auto-generated meshes work best on Control Point, King of the Hill, Payload, and CTF maps. On Mannpower maps, bots default to CTF-like behavior but barely use grapples or powerups. If a map has no objective the bot AI recognizes but has a spawn room entity, setting `tf_bot_offense_must_push_time 0` lets the bots fight anyway.

*(Source for this section: the official TF2 wiki Bots page.)*

### Current status, map by map

Thanks to the Hatless update, every class works correctly now, including the historically bugged Spy. Bots behave correctly on most official KOTH maps, some Payload maps, Dustbowl/Gorge Attack-Defense, and CTF/Mann Manor maps. On those last two, you can't spawn them directly with `tf_bot_add`. On unsupported maps (via the nav_generate process above), they work, but are noticeably worse at imitating a real player.

PLR maps are a lost cause: bots can't cross the barriers on Hightower and get stuck in corners, and on all other PLR maps they just... have a dance party instead of playing. Maybe it'll get fixed someday, maybe it'll stay that way.

### General bot behavior

A grab bag of things every bot does regardless of level:

- Bots only use stock loadouts (a plugin can force non-stock weapons on them, but vanilla bots never pick their own).
- Easy bots barely use their secondary. Higher difficulties switch to secondary as soon as the primary mag is empty, or to compensate for distance.
- Bots ignore advanced movement techniques: no rocket jumps, no building relocations.
- After a kill, a bot may taunt, even under fire, unless it's carrying the enemy intel, and that rule applies in MvM too.
- Disguised Spy bots (player or AI) are correctly ignored by other bots: until they touch an enemy, sap something, shoot, or go invisible near one. Once "found out," that specific bot/player is remembered as a Spy until it changes disguise while cloaked, dies, or feigns death with the Dead Ringer.
- Pyro bots use Compression Blast liberally from Normal up.
- Medic bots prioritize healing everyone except Snipers (and, to a lesser extent, Engineers), even if you spam "Medic!" as one.
- Medic bots gravitate toward Heavies, Soldiers, Demomen, and Pyros: specifically when a *human* plays those classes. That attention follows a human's presence in those roles.
- Bots hold position during setup on Attack/Defense and Payload maps, except Engineers, Snipers, and Spies, who move freely (Demomen bots are also allowed to pre-place stickies).
- Engineer bots never upgrade or disable another allied Engineer's buildings, unless that building sits in their target's path. They sometimes just don't repair their own sentry, even when it seems obvious.
- Spotted Spy bots switch to their revolver and back off instead of forcing a knife stab.
- Demomen bots that located a sentry (usually by dying to it once) can perfectly arc stickies onto it from outside its range, through walls and ceilings when geometry allows.
- Sniper bots that find no target after aiming use one of the "Negatives." voice lines.
- Allied Medics heal a disguised Spy without hesitation.

### Known issues / bugs

The document lists a good number of long-standing quirks:

- Bots may try to walk or shoot through certain static props.
- Every time a player/bot undisguises, disguises, or reveals, nearby bots "see" it and turn to react: even if the event happened outside their actual field of view. It's not sound-based; it's a vision-test bypass.
- Rarely, bots can get physically stuck together using an Engineer teleporter.
- Bot voice commands (e.g. "Spy!", "Go!") don't show as text in chat like players' do.
- A Medic bot actively healing someone won't dodge incoming fire or grab health kits, even at critical HP.
- Bots may keep moving during a duo taunt, breaking the intended Festive Critical Strike effect.
- Recently damaged Medic bots often refuse to use the Syringe Gun at range, preferring melee (or, in very rare cases, trying to poke you with the Medi Gun beam itself).
- Medic bots don't compensate for gravity on Syringe Gun shots: probably because the weapon isn't correctly flagged as non-hitscan in the AI code.
- Spy bots can see and follow an invisible Spy (player or AI) if that Spy was already found out once, regardless of the following bot's skill level.
- Even if a player-Spy disguises as a class on his own team, bumping an enemy still undisguises him (bots never do that to themselves, since bots never disguise as their own team).
- Bots respect team autobalance: if you try cramming bots on one side, use `mp_teams_unbalance_limit 0` first.
- Engineer bots can outright ignore their own buildings until they get destroyed.
- Heavy bots sometimes try firing the Minigun while out of ammo, especially below Hard.
- Losing-team Medic bots occasionally suicide during Humiliation when no enemy is near -- something a human player can't reproduce even by trying.
- Setting your team preview to BLU in the loading screen makes RED bots visually render as BLU to you.
- Bots with a melee weapon out sometimes refuse to switch weapons even after picking up ammo.
- After Jungle Inferno, bots spawned with explicit params (e.g. `tf_bot_add 5 pyro blue normal`) can instantly die in their own spawn room. Fix: `tf_bot_reevaluate_class_in_spawnroom 0` (requires `sv_cheats 1`).

### AI names

Bot names come from a big pool of TF2 references, other Valve games, and programming culture references, largely because the community kept requesting specific ones on the Steam forums. A sample from the list: *AimBot, Aperture Science Prototype XR7, Black Mesa, Companion Cube, C++, Divide by Zero, GLaDOS, H@XX0RZ, Saxton Hale, The G-Man, trigger_hurt, 0xDEADBEEF*, and dozens more in the same vein.

There's also a batch of names found in a leaked source build that never shipped to production, for unclear reasons: mostly *Last Dragon* and *The Fifth Element* references like *John Spartan, Leeloo Dallas Multipass, Sho'nuff, Bruce Leroy, Big Gulp Huh?* and *I'm your huckleberry*.

You can override all of that yourself: `tf_bot_add heavyweapons blue "Blu Hoovy"` spawns a BLU Heavy named "Blu Hoovy."

---

## Chapter II: The Original Bots / TFBots -- Diving Into Skill Levels

Sigsegv's original framework still holds: it's obvious Expert bots outperform Easy bots, but Valve never explained *how much* or *why*. So the only way to know is reading the code. Here's every mechanic that scales with skill.

### Setting difficulty

Outside MvM, difficulty is controlled by a cvar:

| `tf_bot_difficulty` | Difficulty level |
| --- | --- |
| 0 | Easy |
| 1 | Normal (default) |
| 2 | Hard |
| 3 | Expert |

`tf_bot_add` also accepts a difficulty argument directly (`easy`/`normal`/`hard`/`expert`).

### MvM popfiles

In Mann vs. Machine, each `TFBot` spawn block in the popfile has an optional `Skill` key. A missing key means Easy. In Valve missions: Giants are almost always Expert, Engineers and Spies are almost always Expert, and Snipers are usually Hard (occasionally Expert). If you use `EventChangeAttributes` (added in the Two Cities update) to dynamically alter bots mid-wave on map events, bot skill is one of the properties you can change on the fly.

### Endless MvM mode

Endless mode was never officially shipped, but in it, bots spend their money on upgrades like players, including one bot-exclusive upgrade raising their in-game AI skill level.

### The `bot_generator` entity

An obscure, largely undocumented entity, presumed used in training mode and possibly early MvM development. It exposes a `SetDifficulty` input to control skill level. Beyond that, the trail goes cold: Valve never documented it and nobody fully mapped its behavior.

### Eye glow color

MvM robots have an eye-glow particle changing color with skill level, a visual indicator nobody outside the community ever explained:

| Skill | Eye color | RGB |
| --- | --- | --- |
| Easy/Normal | Blue | `#24b4ff` |
| Hard/Expert | Yellow | `#fff000` |

![TF2 Heavy bot in idle position](assets/tf2-bot-ai-heavy-idle.png)

### Vision: recognition time

A bot doesn't react instantly when something enters its field of view: there's a hardcoded delay before the rest of the AI is even allowed to acknowledge the threat:

| Skill | Minimum recognition time |
| --- | --- |
| Easy | 1.00 s |
| Normal | 0.50 s |
| Hard | 0.30 s |
| Expert | 0.20 s |

That's the bulk of the "Easy bots look dumb" effect in a single number: an Easy bot doesn't aim worse once it's noticed you, it just takes five times longer to notice you exist.

### Aim: tracking rate

Bots don't track you continuously. They sample your position and velocity at a fixed interval and predict a straight line from there:

| Skill | Recalc interval | Equivalent rate |
| --- | --- | --- |
| Easy | 1.00 s | 1x/s |
| Normal | 0.25 s | 4x/s |
| Hard | 0.10 s | 10x/s |
| Expert | 0.05 s | 20x/s |

**Exception:** Spy bots are hardcoded to the Normal tracking rate whatever their actual skill level: an Expert Spy still aims like a Normal bot. There's also a public demo video comparing tracking rates side by side if you want to see the 1x vs 20x gap in motion.

### Aim: weapon-specific skill

Bots don't just aim at your center of mass: they have per-weapon logic, sometimes really buggy:

**Grenade Launcher & Stickybomb Launcher.** All skill levels compensate vertical arc, using a fixed `tf_bot_ballistic_elevation_rate` cvar value. Because that compensation only kicks in for the base weapon ID, faster projectile variants (Loch-n-Load, anything with a projectile speed modifier) don't get properly adjusted arcs. And since it's keyed by weapon ID specifically, the Loose Cannon (a different ID) gets no arc compensation.

**Huntsman.** Easy bots don't compensate arrow drop and never go for headshots. Normal-level bots compensate arc, but only aim for the head under 150 HU. Hard/Expert bots always aim for the head.

**Rocket Launcher.** Beyond 150 HU, non-Easy bots aim at your feet instead of center of mass, maximizing splash and knockback odds. Under 150 HU, they switch to headshots. Easy bots always aim center of mass whatever the distance. It's also locked by weapon ID: the Direct Hit and Cow Mangler don't inherit that behavior. Makes sense for the Direct Hit (no splash to exploit); zero sense for the Cow Mangler: that part of the AI predates the weapon's existence and simply never got revisited.

**Sniper Rifles.** Easy aims at the body. Normal aims about 33% up from body toward head. Hard/Expert aim straight at the head. Less important in MvM, where bot headshots don't get the damage bonus anyway.

### Hearing: quiet gunfire sensitivity

Every gunshot alerts nearby bots to the shooter's position, even through walls, out to 3000 HU with 100% notice chance (`tf_bot_notice_gunfire_range`). But a subset of weapons are flagged "quiet": audible only within 500 HU (`tf_bot_notice_quiet_gunfire_range`), and even then with a skill-dependent chance:

| Skill | Chance of noticing quiet gunfire |
| --- | --- |
| Easy | 10% |
| Normal | 30% |
| Hard | 60% |
| Expert | 90% |

That probability halves if a *loud* shot was heard in the last 3 seconds: loud sounds mask quiet ones.

The quiet-weapon ID list hasn't been updated since December 2010. Any later addition using a new weapon ID is treated as loud by default, no matter how logically quiet it should be, unless it reuses an older ID. Concretely:

| Weapon ID | Covers |
| --- | --- |
| `TF_WEAPON_KNIFE` | All Spy knives |
| `TF_WEAPON_FISTS` | Heavy-specific punches (his multi-class punch is actually `TF_WEAPON_FIREAXE`) |
| `TF_WEAPON_PDA` | Presumably unused directly |
| `TF_WEAPON_PDA_ENGINEER_BUILD` | Engineer build PDA |
| `TF_WEAPON_PDA_ENGINEER_DESTROY` | Engineer destroy PDA |
| `TF_WEAPON_PDA_SPY` | Spy disguise kit |
| `TF_WEAPON_BUILDER` | Spy/Engineer/Sapper toolkits |
| `TF_WEAPON_MEDIGUN` | All Medi Guns |
| `TF_WEAPON_DISPENSER` | Probably unused (Dispensers are objects, not weapons) |
| `TF_WEAPON_INVIS` | All Spy invis watches |
| `TF_WEAPON_FLAREGUN` | All Pyro flare guns *except* the Manmelter |
| `TF_WEAPON_LUNCHBOX` | Sandwich, Dalokohs Bar, Buffalo Steak Sandvich, Bonk!, Crit-a-Cola |
| `TF_WEAPON_JAR` | Jarate (not Mad Milk -- separate ID, non-quiet) |
| `TF_WEAPON_COMPOUND_BOW` | Huntsman |
| `TF_WEAPON_SWORD` | Eyelander, Skullcutter, Claidheamh Mor, Persian Persuader, Half-Zatoichi |
| `TF_WEAPON_CROSSBOW` | Crusader's Crossbow |

The classic example of the rotting list: the Manmelter got its own ID (`TF_WEAPON_RAYGUN_REVENGE`), added after the quiet-weapons list froze, so it's treated as loud, despite being a flare gun in every practical sense. The Scorch Shot, released even later, reuses the base `TF_WEAPON_FLAREGUN` ID and so still counts as quiet. Insane, but that's the code.

### Strategy: threat prioritization

When several enemies are visible at once, bots weight distance, whether they're being shot at, and, above Easy, whether the main threat is being healed:

| Skill | Aim at the healer instead? |
| --- | --- |
| Easy | No |
| Normal | 50% chance |
| Hard | Yes |
| Expert | Yes |

Enemies beyond 500 HU are normally deprioritized as non-immediate. Exceptions: Hard/Expert bots always treat distant Medics and Engineers as immediate threats, and any enemy Sniper roughly aiming your way is always treated as immediate whatever the distance and skill.

| Skill | Distant Medics/Engineers/aiming Sniper = immediate threat? |
| --- | --- |
| Easy/Normal | No |
| Hard/Expert | Yes |

That Sniper check has a story I still love telling. Sigsegv's original writeup assumed the game required the dot product between the sniper's aim vector and the bot's relative position to be *exactly zero*: a comparison so precise it would almost never trigger in float math, making the whole feature effectively dead code. A later-published fix (credit to a cleaner Hex-Rays decompile) showed the actual check is `dot product > 0`: any Sniper facing from straight at you to perpendicular counts as an immediate threat; anything from perpendicular to facing away doesn't. The original misread came from a bad decompile of an SSE float comparison. Reverse-engineering a AAA binary stays an approximate exercise.

### Movement: dodging

Easy bots never dodge, period. Normal+ bots dodge left/right (33% left, 33% right, 33% do nothing, weighted against detected holes) when holding a combat weapon, having seen an enemy in the last 3 seconds, and that enemy having line of sight on them.

They will *not* dodge if any of these apply: `DisableDodge` attribute set, current behavior says hurry, currently invulnerable (any uber), mid-taunt/provocation, playing Engineer, cloaked or disguised as Spy, scoped as Sniper or spun up as Heavy, or charging the Huntsman.

### Movement: avoiding bumping enemies

Above Normal, bots specifically try not to walk into enemies while moving:

| Skill | Avoids bumping enemies? |
| --- | --- |
| Easy | No |
| Normal | No |
| Hard | Yes |
| Expert | Yes |

In practice, that matters only for Spy bots: avoiding an awkward collision with an enemy player is exactly the kind of thing that blows a disguise.

### Pyro: airblast mastery

Airblast does two things: reflecting projectiles (PvP and MvM) and pushing enemies near ledges (PvP only). Whether the bot pulls the trigger on a valid opportunity is a skill-based coin flip:

| Skill | Airblast trigger chance |
| --- | --- |
| Easy | 0% |
| Normal | 50% |
| Hard | 90% |
| Expert | 100% |

Easy Pyro bots literally cannot airblast: the roll is hardcoded to never succeed, not just "rarely."

### Spy: disguise effectiveness

Two separate axes scale with skill. Disguise *choice*:

| Skill | Disguise method |
| --- | --- |
| Easy/Normal | Random class, ignoring what the enemy team actually runs |
| Hard/Expert | Picks a real enemy player and copies their exact class |

*Behavior* in disguise:

| Skill | Disguised/invisible behavior |
| --- | --- |
| Easy/Normal | Stares at enemy players when it sees them (suspicious) |
| Hard/Expert | Deliberately avoids eye contact (more convincing) |

### Spy: backstab aggression

At long range (up to 300 HU, `tf_bot_spy_knife_range`), a Spy bot only commits to a backstab if it can see the victim and the victim's back is at least partly turned. Skill determines how off-center that back angle can be:

| Skill | Angle tolerance |
| --- | --- |
| Easy | Attempts even if you're facing it directly |
| Normal | ±45° from your back |
| Hard | ±78° from your back |
| Expert | ±90° from your back (full 180° rear arc) |

Easy Spy bots are functionally suicidal: they'll try knifing someone staring them straight in the eyes. **Exception:** in Mann vs. Machine, every Spy bot is forced to the Normal angle constraint whatever its actual skill level.

### Tactics: weapon selection

That logic only concerns levels above Easy, with reduced interest in MvM since bots there usually have strict weapon restrictions:

- **Scout**: switches to secondary when primary mag is empty.
- **Soldier**: switches to secondary when mag is empty *and* the target is under 500 HU.
- **Sniper**: switches to secondary for targets under 750 HU.
- **Pyro**: switches to secondary for targets over 750 HU, unless that target is a Soldier or Demoman.

### Tactics: reloading under cover

Logic absent from MvM. If the bot's current behavior doesn't tell it to retreat, its primary mag is empty, and it stays vulnerable without uber, higher-level bots temporarily pull back to cover to reload instead of clicking an empty gun in your face:

| Skill | Pulls back to reload? |
| --- | --- |
| Easy | No |
| Normal | No |
| Hard | Yes |
| Expert | Yes |

### CP mode: defender roaming

Logic absent from MvM. When defending a control point, higher-level bots are likelier to leave the point to hunt kills ("search and destroy"), but only with decent time left on `tf_bot_defense_must_defend_time`:

| Skill | Roam chance |
| --- | --- |
| Easy | 10% |
| Normal | 50% |
| Hard | 75% |
| Expert | 90% |

### CP mode: capture blocking

Logic absent from MvM. Defender bots contesting an enemy capture attempt:

| Skill | Will try blocking the capture? |
| --- | --- |
| Easy | No |
| Normal | 50% chance |
| Hard | Yes |
| Expert | Yes |

---

## The full summary table

<div style="overflow-x:auto">

| Aspect | Easy | Normal | Hard | Expert | Notes |
| --- | --- | --- | --- | --- | --- |
| Vision: recognition time | 1.00s | 0.50s | 0.30s | 0.20s | |
| Aim: tracking rate | 1x/s | 4x/s | 10x/s | 20x/s | Spies always use Normal |
| Grenade/sticky arc compensation | Yes | Yes | Yes | Yes | Loose Cannon exempt |
| Huntsman vertical compensation | No | Yes | Yes | Yes | |
| Huntsman headshots | No | <150 HU | Yes | Yes | |
| Rocket Launcher foot shots | No | Yes | Yes | Yes | Direct Hit & Cow Mangler exempt |
| Sniper Rifle aim point | Body | ~33% toward head | Head | Head | |
| Noticing quiet gunfire chance | 10% | 30% | 60% | 90% | Halved if masked by loud fire |
| Aim at healer | No | 50% | Yes | Yes | |
| Distant Medic/Engineer/aiming Sniper = immediate | No | No | Yes | Yes | |
| Dodge | No | Yes | Yes | Yes | Long exception list |
| Avoid bumping enemies | No | No | Yes | Yes | Mostly matters for Spy |
| Airblast trigger chance | 0% | 50% | 90% | 100% | |
| Spy disguise class choice | Random | Random | Matches a real enemy | Matches a real enemy | |
| Spy eye contact in disguise | Stares (obvious) | Stares | Avoids (convincing) | Avoids | |
| Spy backstab angle | ~0° | ±45° | ±78° | ±90° | MvM forces Normal |
| Weapon selection logic | No | Yes | Yes | Yes | Less relevant in MvM |
| Reload under cover | No | No | Yes | Yes | Not in MvM |
| CP defender roaming | 10% | 50% | 75% | 90% | Not in MvM |
| CP capture blocking | No | 50% | Yes | Yes | Not in MvM |

</div>

---

## Conclusion

![TF2 Heavy bot aiming with a minigun](assets/tf2-bot-ai-heavy-aim.png)

All of that reflects a deliberate Valve system: fully deterministic scores and probabilities, just never officially documented. Here are the points I take away after that dive:

1. **"Skill" is a set of independent sliders**, not a global multiplier. Reaction time, aim cadence, and each tactical behavior scale separately, and some (Spy tracking rate, MvM backstab angle) have hardcoded overrides whatever the level.
2. **Some of it is genuinely buggy, not just old.** The quiet-weapons list frozen since 2010, the Cow Mangler with no foot-shot logic for no good reason, the Sniper dot-product check that took years to decompile correctly: Valve's bot AI code has scars like any 17-year-old codebase.
3. **You can use all of that.** Know that a Sniper bot won't headshot you on Normal, that an Easy Pyro literally can't reflect your rocket, that an Easy Spy will try knifing you face to face. That's not luck. It's a spec sheet.

Huge thanks to sigsegv for the original code dive that made most of this possible, to the TF2 wiki for the base bot-command and map-support docs, and to everyone in the community still tinkering with a 17-year-old bot AI to figure out exactly why it does what it does.
