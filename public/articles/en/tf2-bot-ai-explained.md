---
title: "TF2 Bots Aren't Random: I Reverse-Engineered Every Difficulty Setting"
description: "Vision, aim tracking, spy backstab angles, sniper headshot logic, every known bug -- Valve never documented any of it. So we dug through the code and turned it into a full spec sheet."
date: 2026-07-12
authors:
  - fox3000foxy
tags:
  - tf2
  - game-ai
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: ""
---

## Introduction

![TF2 Soldier bot aiming a rocket launcher](assets/tf2-bot-ai-soldier-aim.png)

Every TF2 player has said it at least once: "this bot is cheating." Or the opposite: "why is this Easy bot just standing there eating rockets." Nobody really knows what "Easy," "Normal," "Hard," and "Expert" actually *mean* under the hood -- Valve shipped four difficulty labels and exactly zero documentation.

So a bunch of us (me, awimii, Mush The Possum, with a huge chunk of the groundwork done by sigsegv, who actually went digging through the decompiled game code) put together a full research document on TFBot behavior. Every mechanic, every known bug, every hardcoded probability. This article is the full writeup, not the condensed one. Grab a Bonk, this is a long one.

---

## Chapter I: The Basics

### Bot vs Puppet Bot

TF2 has two completely different things people call "bots":

- **AI bots (TFBots)**: real AI, built on the same PlayerBot/Infected framework Valve used for the *Left 4 Dead* series. They pick a random class, they play the objective, they work without `sv_cheats`, and they trigger achievements like a real player would.
- **Puppet bots**: zero AI, can't move or act on their own. They exist purely to be manually controlled -- a player can force them to follow, aim, and fire, mostly used for testing or for making cinematic screenshots/videos. Spawning them requires `sv_cheats 1`, which also disables achievements for the session.

This article is entirely about the first kind.

### What AI bots can (kind of) be told to do

TFBots aren't directly controllable, but there's a short list of things you can nudge them into doing:

- Aim your crosshair at any bot (friendly or enemy) and it'll taunt at you if you use the right voice binds.
- A friendly Medic bot heals you if you use the "Medic!" voice command.
- If a Medic bot is healing you and has an ÜberCharge ready, saying "Go go go!" or "Activate charging!" makes it pop the charge immediately.
- A Medic bot with charge ready will auto-pop it the moment it or its heal target takes serious damage, no voice command needed.
- Bots will spontaneously perform partner taunts (High Five) or group taunts (Conga) with nearby teammates.

### Getting bots to work on unsupported maps

Bots rely on a navigation mesh to know where they're allowed to walk, and most community maps don't ship with one. To force it:

1. `sv_cheats 1`
2. `nav_generate` -- builds the initial navmesh, progress shown in console
3. Wait for the game to finish generating paths
4. Optionally fix bad nav data manually with `nav_edit 1`
5. Reload or restart the server (skipping this disables achievements)
6. `tf_bot_add <number>` to actually spawn bots

**Warning:** changing the navmesh while bots are active on the server can crash the game. Once the mesh exists you don't need to regenerate it for future sessions -- just re-add bots with `tf_bot_add`.

Auto-generated meshes work best on Control Point, King of the Hill, Payload, and CTF maps. On Mannpower maps bots default to CTF-style play but barely use grapple hooks or powerups. If a map has no objective the bot AI recognizes but does have a spawn room entity, setting `tf_bot_offense_must_push_time 0` lets bots fight anyway.

*(Source for this section: the official TF2 Wiki's Bots page.)*

### Current status, map by map

Thanks to the Hatless update, every class works correctly now, including the historically-buggy Spy. Bots behave properly on most official KOTH maps, some Payload maps, Dustbowl/Gorge Attack-Defense, and CTF/Mann Manor maps -- though on the latter two you can't spawn them with `tf_bot_add` directly. On unsupported maps (via the nav_generate process above) they work, just noticeably worse at imitating a real player.

PLR maps are a lost cause: bots can't clear the barriers on Hightower and get stuck in corners, and on every other PLR map they just... have a dance party instead of playing. This might get fixed eventually. Might not.

### General bot behavior

A grab-bag of things every bot does regardless of skill:

- Bots only ever use stock loadouts (a plugin can force non-stock weapons on them, but vanilla bots never pick their own).
- Easy bots barely touch their secondary weapon. Higher difficulties swap to secondary the moment their primary runs dry, or to compensate for range.
- Bots can't do movement tech -- no rocket jumps, no building relocation.
- After a kill, a bot might taunt, even under fire -- except while carrying the enemy intelligence, and this rule also applies in MvM.
- Disguised Spy bots (player or AI) are correctly ignored by other bots -- until they touch an enemy, sap something, shoot, or cloak near one. Once "made," that specific bot/player is remembered as a Spy until it changes disguise while staying invisible, dies, or fakes death with the Dead Ringer.
- Pyro bots use Compression Blast liberally on anything above Easy.
- Medic bots prioritize healing everyone over Snipers (and, to a lesser extent, Engineers), even if you spam "Medic!" as one.
- Medic bots gravitate toward Heavies, Soldiers, Demomen, and Pyros -- specifically if a *human* is playing those classes. No human in those roles, no particular Medic attention.
- Bots hold position during setup time on Attack/Defense and Payload maps -- except Engineers, Snipers, and Spies, who move freely (Demoman bots are also allowed to pre-place stickies).
- Engineer bots never upgrade or de-sap another friendly Engineer's buildings, unless that building happens to sit in their target's path. They also sometimes just... don't repair their own turret, even when it's safe to.
- Spotted Spy bots switch to their revolver and back away instead of forcing a stab.
- Demoman bots that have located a sentry (usually by dying to it once) can perfectly lob stickies onto it from outside its range, arcing around walls and ceilings when the geometry allows.
- Sniper bots that can't find a target after scoping in use one of the "Negative" voice lines.
- Friendly Medics will heal a disguised Spy without hesitation.

### Known issues / bugs

The document lists a solid pile of long-standing quirks:

- Bots can attempt to walk or shoot through certain stationary props.
- Any time a player/bot unmasks, disguises, or reveals, nearby bots "see" it and turn to react -- even if the event happened outside their actual field of view. It's not sound-based; it's a vision-check bypass.
- Rarely, bots can get physically stuck together while using an Engineer teleporter.
- Bot voice commands (e.g. "Spy!", "Forward!") don't display as chat text like player ones do.
- A Medic bot actively healing someone won't dodge incoming fire or grab health kits, even at critically low HP.
- Bots can keep moving while performing a partner taunt, which breaks the Festive Critical Strike's intended effect.
- Recently-damaged Medic bots often refuse to use the Syringe Gun at range, preferring melee (or, in very rare cases, trying to hit you with the Medi Gun beam itself).
- Medic bots don't compensate for gravity drop on Syringe Gun shots -- likely because the weapon isn't correctly flagged as non-hitscan in the AI code.
- Spy bots can see and track a cloaked Spy (player or AI) if that Spy has already blown its cover once, regardless of the tracking bot's skill level.
- Even if a player-Spy disguises as their own team's class, bumping into an enemy still outs them (bots never do this to themselves, since bots never disguise as their own team).
- Bots respect team auto-balance -- if you're trying to stack bots on one team, you need `mp_teams_unbalance_limit 0` first.
- Engineer bots can flat-out ignore their own buildings until they're destroyed.
- Heavy bots sometimes try to fire the Minigun while critically low on ammo, mostly below Hard difficulty.
- Losing-team Medic bots occasionally suicide during the Humiliation phase when no enemies are nearby -- something a human player can't replicate even by trying.
- Setting your loading-screen team preview to BLU makes RED bots visually render as BLU for you.
- Bots with melee out sometimes refuse to switch weapons even after picking up ammo.
- Post-Jungle Inferno, bots spawned with explicit params (e.g. `tf_bot_add 5 pyro blue normal`) can die instantly in their own spawn room. Fix: `tf_bot_reevaluate_class_in_spawnroom 0` (needs `sv_cheats 1`).

### AI names

Bot names are pulled from a big pool of references to TF2, other Valve games, and programming culture, largely because the community kept requesting specific ones on the Steam forums. A sample of the list: *AimBot, Aperture Science Prototype XR7, Black Mesa, Companion Cube, C++, Divide by Zero, GLaDOS, H@XX0RZ, Saxton Hale, The G-Man, trigger_hurt, 0xDEADBEEF*, and dozens more in that vein.

There's also a batch of names found in a leaked source build that never shipped in production, for unclear reasons -- mostly *Last Dragon* and *The Fifth Element* references like *John Spartan, Leeloo Dallas Multipass, Sho'nuff, Bruce Leroy, Big Gulp Huh?*, and *I'm your huckleberry*.

You can override any of this yourself: `tf_bot_add heavyweapons blue "Blu Hoovy"` spawns a named BLU Heavy called "Blu Hoovy."

---

## Chapter II: The Original Bots / TFBots -- Skill Level Deep Dive

Sigsegv's original framing still holds: it's obvious Expert bots outplay Easy bots, but Valve never explained *how much* or *why*. So the only way to know is to read the code. Here's every mechanic that scales with skill.

### Setting difficulty

Outside MvM, difficulty is controlled by one cvar:

| `tf_bot_difficulty` | Skill level |
| --- | --- |
| 0 | Easy |
| 1 | Normal (default) |
| 2 | Hard |
| 3 | Expert |

`tf_bot_add` also accepts a difficulty argument directly (`easy`/`normal`/`hard`/`expert`).

### MvM popfiles

In Mann vs. Machine, each `TFBot` spawner block in the popfile has an optional `Skill` key. No key means Easy. In Valve's own missions: Giants are almost always Expert, Engineers and Spies are almost always Expert, and Snipers are usually Hard (occasionally Expert). If you're using `EventChangeAttributes` (added in the Two Cities update) to dynamically alter bots mid-wave based on map events, bot skill is one of the properties you're allowed to change on the fly.

### MvM Endless Mode

Endless mode never officially shipped, but in it, bots spend their money on upgrades just like players do -- including a bot-exclusive upgrade that bumps their AI skill level mid-game.

### The `bot_generator` entity

An obscure, largely undocumented entity believed to have been used in training mode and possibly in early MvM development. It exposes a `SetDifficulty` input to control skill level. Beyond that, the trail goes cold -- Valve never documented it and nobody's fully mapped its behavior.

### Eye glow color

MvM robots have an eye-glow particle that changes color with skill level -- a visual tell nobody outside the community has ever explained:

| Skill | Eye color | RGB |
| --- | --- | --- |
| Easy/Normal | Blue | `#24b4ff` |
| Hard/Expert | Yellow | `#fff000` |

![TF2 Heavy bot in idle stance](assets/tf2-bot-ai-heavy-idle.png)

### Vision: recognition time

A bot doesn't react the instant something enters its field of view -- there's a hardcoded delay before the rest of the AI is even allowed to acknowledge the threat:

| Skill | Minimum recognition time |
| --- | --- |
| Easy | 1.00 s |
| Normal | 0.50 s |
| Hard | 0.30 s |
| Expert | 0.20 s |

That's most of the "Easy bots feel dumb" effect in a single number -- an Easy bot doesn't aim worse once it notices you, it just takes five times longer to notice you exist.

### Aim: follow rate

Bots don't track you continuously. They sample your position and velocity at a fixed interval and predict a straight line from there:

| Skill | Recalculation interval | Equivalent rate |
| --- | --- | --- |
| Easy | 1.00 s | 1x/sec |
| Normal | 0.25 s | 4x/sec |
| Hard | 0.10 s | 10x/sec |
| Expert | 0.05 s | 20x/sec |

**Exception:** Spy bots are hardcoded to the Normal tracking rate no matter their actual skill level -- an Expert Spy still aims like a Normal bot. There's also a public demonstration video comparing tracking rates side by side if you want to see the 1x vs 20x gap in motion.

### Aiming: weapon-specific skill

Bots don't just point at your center of mass -- they have per-weapon logic, some of it genuinely buggy:

**Grenade Launcher & Sticky Launcher.** All skill levels compensate for vertical arc, using a fixed value from the `tf_bot_ballistic_elevation_rate` cvar. Because that compensation only fires for the base weapon ID, faster projectile variants (Loch-n-Load, anything with a projectile-speed modifier) don't get correctly adjusted arcs. And since it's keyed by weapon ID specifically, the Loose Cannon -- a different ID entirely -- gets no arc compensation at all.

**Huntsman.** Easy bots don't compensate for arrow drop and never go for headshots. Normal-skill bots compensate for the arc, but only aim for the head within 150 HU. Hard/Expert bots always go for the head.

**Rocket Launchers.** Past 150 HU, non-Easy bots aim at your feet instead of center-mass, maximizing splash damage and knockback odds. Inside 150 HU they switch to headshots. Easy bots always aim center-mass regardless of range. This too is weapon-ID-locked: the Direct Hit and Cow Mangler don't inherit the behavior. Makes sense for the Direct Hit (no AoE to exploit); makes zero sense for the Cow Mangler -- this part of the AI predates the weapon's existence and was simply never revisited.

**Sniper Rifles.** Easy aims at the body. Normal aims roughly 33% of the way from body to head. Hard/Expert aim straight at the head. Matters less in MvM, where bot headshots don't get the damage bonus anyway.

### Hearing: sensitivity to covert shots

Every gunshot alerts nearby bots to the shooter's position, even through walls, up to 3000 HU with a 100% notice chance (`tf_bot_notice_gunfire_range`). But a subset of weapons are flagged "stealth" -- audible only within 500 HU (`tf_bot_notice_quiet_gunfire_range`), and even then with a skill-dependent chance:

| Skill | Chance to notice a stealth shot |
| --- | --- |
| Easy | 10% |
| Normal | 30% |
| Hard | 60% |
| Expert | 90% |

That probability is halved if a *loud* shot was heard in the last 3 seconds -- loud sounds mask quiet ones.

The stealth weapon-ID list hasn't been updated since December 2010. Anything added after that date using a brand-new weapon ID is treated as loud by default, no matter how quiet it logically should be, unless it happened to reuse an older ID. Concretely:

| Weapon ID | Covers |
| --- | --- |
| `TF_WEAPON_KNIFE` | All Spy knives |
| `TF_WEAPON_FISTS` | Heavy-specific punches (his multi-class punch is actually `TF_WEAPON_FIREAXE`) |
| `TF_WEAPON_PDA` | Believed unused directly |
| `TF_WEAPON_PDA_ENGINEER_BUILD` | Engineer's Construction PDA |
| `TF_WEAPON_PDA_ENGINEER_DESTROY` | Engineer's Destruction PDA |
| `TF_WEAPON_PDA_SPY` | Spy's disguise kit |
| `TF_WEAPON_BUILDER` | Spy's Engineer/Sapper toolkit |
| `TF_WEAPON_MEDIGUN` | All Medi Guns |
| `TF_WEAPON_DISPENSER` | Likely unused (Dispensers are objects, not weapons) |
| `TF_WEAPON_INVIS` | All Spy cloak watches |
| `TF_WEAPON_FLAREGUN` | All Pyro flare guns *except* the Manmelter |
| `TF_WEAPON_LUNCHBOX` | Sandwich, Dalokohs Bar, Buffalo Steak Sandvich, Bonk!, Crit-a-Cola |
| `TF_WEAPON_JAR` | Jarate (not Mad Milk -- separate, non-stealth ID) |
| `TF_WEAPON_COMPOUND_BOW` | Huntsman |
| `TF_WEAPON_SWORD` | Eyelander, Skullcutter, Claidheamh Mòr, Persian Persuader, Half-Zatoichi |
| `TF_WEAPON_CROSSBOW` | Crusader's Crossbow |

The classic example of the list rotting: the Manmelter got its own ID (`TF_WEAPON_RAYGUN_REVENGE`), added after the stealth list was frozen -- so it's treated as loud, despite being a flare gun in every practical sense. The Scorch Shot, released even later, reuses the base `TF_WEAPON_FLAREGUN` ID and is therefore still considered stealth. Nonsensical, but that's the code.

### Strategy: threat prioritization

When multiple enemies are visible at once, bots weigh distance, whether they're being shot at, and -- above Easy -- whether the primary threat is being healed:

| Skill | Targets the healer instead? |
| --- | --- |
| Easy | No |
| Normal | 50% chance |
| Hard | Yes |
| Expert | Yes |

Enemies past 500 HU are normally deprioritized as non-immediate. Exceptions: Hard/Expert bots always treat distant Medics and Engineers as immediate threats, and any enemy Sniper aiming roughly your way is always treated as immediate regardless of distance and skill.

| Skill | Distant Medics/Engineers/aiming Snipers = immediate threat? |
| --- | --- |
| Easy/Normal | No |
| Hard/Expert | Yes |

That Sniper check has a genuinely fun history. Sigsegv's original writeup assumed the game required the dot product between the sniper's aim vector and the bot's relative position to be *exactly zero* -- a comparison so precise it would almost never trigger in floating point math, making the whole feature effectively dead code. A correction issued later (credit to a cleaner Hex-Rays decompile) showed the actual check is `dot product > 0`: any Sniper facing anywhere from directly-at-you to perpendicular-to-you counts as an immediate threat; anything from perpendicular to facing-away doesn't. The original misread came from a bad decompilation of an SSE float comparison -- reverse-engineering a AAA binary isn't an exact science.

### Movement: dodge

Easy bots never dodge, full stop. Normal-and-up bots dodge left/right (33% left, 33% right, 33% do nothing, weighted against detected gaps) when they're holding a combat weapon, have seen an enemy in the last 3 seconds, and that enemy has line of sight on them.

They will *not* dodge if any of these apply: `DisableDodge` attribute set, current behavior says to hurry, currently invulnerable (any über), mid-taunt/provocation, playing Engineer, invisible or disguised as Spy, scoped in as Sniper or revved as Heavy, or mid-Huntsman-draw.

### Movement: avoid shoving enemies

Above Normal, bots specifically try not to bump into enemies while moving:

| Skill | Avoids bumping enemies? |
| --- | --- |
| Easy | No |
| Normal | No |
| Hard | Yes |
| Expert | Yes |

In practice this only really matters for Spy bots -- avoiding an awkward collision with an enemy player is exactly the kind of thing that blows a disguise.

### Pyro: airblast mastery

Airblast serves two purposes: reflecting projectiles (PvP and MvM) and shoving nearby enemies off ledges (PvP only). Whether the bot actually pulls the trigger on a valid opportunity is a skill-based coin flip:

| Skill | Airblast trigger chance |
| --- | --- |
| Easy | 0% |
| Normal | 50% |
| Hard | 90% |
| Expert | 100% |

Easy Pyro bots literally cannot airblast -- the roll is hardcoded to never succeed, not just "rarely."

### Spy: disguise effectiveness

Two separate axes scale with skill. Disguise *choice*:

| Skill | Disguise method |
| --- | --- |
| Easy/Normal | Random class, ignoring what the enemy team is actually playing |
| Hard/Expert | Picks a real enemy player and copies their exact class |

Disguise *acting*:

| Skill | Behavior while disguised/cloaked |
| --- | --- |
| Easy/Normal | Stares at enemy players when it sees them (suspicious) |
| Hard/Expert | Deliberately avoids eye contact (more convincing) |

### Spy: backstab aggression

At long range (up to 300 HU, `tf_bot_spy_knife_range`), a Spy bot only commits to a backstab if it can see the victim and the victim's back is at least partially turned. Skill determines how far off-center that back angle is allowed to be:

| Skill | Angle tolerance |
| --- | --- |
| Easy | Goes for it even facing you directly |
| Normal | ±45° from your back |
| Hard | ±78° from your back |
| Expert | ±90° from your back (full rear 180° arc) |

Easy Spy bots are functionally suicidal -- they'll attempt a stab on someone staring right at them. **Exception:** in Mann vs. Machine, every Spy bot is forced to the Normal angle constraint regardless of actual skill.

### Tactics: weapon selection

Only kicks in above Easy, and mostly irrelevant in MvM since bots there usually have hard weapon restrictions:

- **Scout**: switches to secondary when the primary's magazine is empty.
- **Soldier**: switches to secondary on empty mag *and* target closer than 500 HU.
- **Sniper**: switches to secondary for targets closer than 750 HU.
- **Pyro**: switches to secondary for targets farther than 750 HU, unless that target is a Soldier or Demoman.

### Tactics: cover reload

Not used in MvM. If the bot's current behavior isn't telling it to fall back, its main magazine is empty, and it isn't ubered, higher-skill bots will temporarily retreat to cover to reload instead of clicking an empty gun at you:

| Skill | Retreats to reload? |
| --- | --- |
| Easy | No |
| Normal | No |
| Hard | Yes |
| Expert | Yes |

### CP mode: defender wandering

Not used in MvM. Defending a control point, higher-skill bots are more likely to leave the point to hunt kills ("search and destroy"), but only with a decent chunk of time left on `tf_bot_defense_must_defend_time`:

| Skill | Chance to wander |
| --- | --- |
| Easy | 10% |
| Normal | 50% |
| Hard | 75% |
| Expert | 90% |

### CP mode: capture blocking

Not used in MvM. Defending bots contesting an enemy capture attempt:

| Skill | Will attempt to block the capture? |
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
| Aim: follow-up rate | 1x/s | 4x/s | 10x/s | 20x/s | Spies always use Normal |
| Grenade/sticky arc compensation | Yes | Yes | Yes | Yes | Loose Cannon exempt |
| Huntsman vertical compensation | No | Yes | Yes | Yes | |
| Huntsman headshots | No | <150 HU | Yes | Yes | |
| Rocket Launcher foot-shots | No | Yes | Yes | Yes | Direct Hit & Cow Mangler exempt |
| Sniper Rifle aim point | Body | ~33% to head | Head | Head | |
| Chance to notice stealth shots | 10% | 30% | 60% | 90% | Halved if masked by loud shots |
| Targets the healer | No | 50% | Yes | Yes | |
| Distant Medic/Engineer/Sniper = threat | No | No | Yes | Yes | |
| Dodge | No | Yes | Yes | Yes | Long exception list |
| Avoids bumping enemies | No | No | Yes | Yes | Mostly matters for Spy |
| Airblast trigger chance | 0% | 50% | 90% | 100% | |
| Spy disguise class choice | Random | Random | Matches real enemy | Matches real enemy | |
| Spy eye contact while disguised | Stares (obvious) | Stares | Avoids (convincing) | Avoids | |
| Spy backstab angle | ~0° | ±45° | ±78° | ±90° | MvM forces Normal |
| Weapon selection logic | No | Yes | Yes | Yes | Less relevant in MvM |
| Cover reload | No | No | Yes | Yes | Not in MvM |
| CP defender wandering | 10% | 50% | 75% | 90% | Not in MvM |
| CP capture blocking | No | 50% | Yes | Yes | Not in MvM |

</div>

---

## Conclusion

![TF2 Heavy bot aiming a minigun](assets/tf2-bot-ai-heavy-aim.png)

None of this is guesswork gone wrong on Valve's part -- it's a deliberate, fully deterministic scoring and probability system, just never written down anywhere official. A few things worth remembering:

1. **"Skill" is a bundle of independent dials**, not one global multiplier. Reaction time, aim rate, and every tactical behavior scale separately, and a few (Spy tracking rate, MvM backstab angle) get hardcoded overrides regardless of skill.
2. **Some of this is genuinely buggy, not just old.** The stealth weapon list frozen since 2010, the Cow Mangler missing foot-aim logic for no good reason, the Sniper dot-product check that took years to get correctly decompiled -- Valve's AI code has scar tissue like any other 17-year-old codebase.
3. **You can use all of this.** Know that a Sniper bot won't headshot you on Normal, that an Easy Pyro literally cannot airblast your rocket back, that an Easy Spy will try to stab you face-to-face. It's not luck. It's a spec sheet.

Huge thanks to sigsegv for the original code-diving that made most of this possible, to the TF2 Wiki for the baseline documentation on bot commands and map support, and to everyone in the community still poking at a 17-year-old bot AI to figure out exactly why it does what it does.
