---
title: "Chlone: Six Days to Clone How I Talk on Discord"
description: "Build story, day by day: how an opencode agent named chloeai, plugged into OpenSelf memory, learned to talk like me on Discord in six days and 146 commits."
date: 2026-09-18
tags: ["discord", "ai", "llm-agents", "openself", "python", "selfbot", "clone"]
authors: ["itsrealfortune"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "TjCwvKRLv2+BI3oFwOlO8tS7IVIhW9KRvYiO55rGMePutMaRHfpalca/dfxfC2RCYIwNOiOlAw3ESSUDOcoWgw=="
---

# Chlone: six days to clone how I talk on Discord

*Build story, day by day - by itsrealfortune*

---

Here's the true story of a project that lasted six days: **Chlone**, a Discord bot that talks like me. I tell the journey as it happened, in the order of the repo's 146 commits, with the hours, the failures, the detours, and the urges to throw everything out the window, but without inflicting the commit messages on you.

It all started with a **competition with Fox**. The subject, a joke: each of us had to bring our own clone to life on Discord. And I took a radically different approach from **Luna Protocol**: I wanted to bet on agentic, an agent using memories and every tool the AI could need. Irony of fate: after building the whole toolbox, I only needed the OpenSelf MCP.

The principle, in one sentence: an [opencode](https://opencode.ai) agent named `chloeai` runs behind an HTTP server (port 4096), keeps persistent sessions per channel, digs my memories out of OpenSelf, and writes with my style, captured in `STYLE.md` from my real messages. And to avoid sounding robotic: message bursts, deliberate typos, voice notes, GIFs, reactions, silence when I sleep, and plenty of other details and mechanisms that made more than a dozen people doubt the bot's nature.

**What is OpenSelf?**

OpenSelf is the memory. A CLI (`openself`, installed via `npm i -g openself`) serving as a private, persistent context vault for my AI agents. In the repo it doesn't appear in the tree, but it's everywhere: in the archived `ecosystem.config.cjs` (the OpenSelf MCP and dashboard launched under PM2 from the very first commits), in `setup.sh` (`npm i -g openself`), and throughout `tools/brain/memory.py`.

Concretely, OpenSelf is:

- **typed memories** (`fact`, `preference`, `decision`, `relationship`, `event`, `note`), with a sensitivity (public / personal / private / restricted), a confidence score, a source, tags;
- **scopes**: each memory belongs to a context, mine, or `discord/dm/<id>` for a specific person;
- a **hybrid search** (lexical + vector) exposed as MCP (`openself_openself_search_memory`, `openself_openself_get_context`) that the `chloeai` agent queries before each reply;
- **conflict detection** (my monthly sweep on day 5) and dedupe on write;
- an **encrypted vault** (key in Bitwarden) and a **local dashboard** (port 3210) to inspect it all;
- and for lazier folks than me: `openself feed` to feed your personality from your WhatsApp/Telegram histories, `openself test`, `openself share` ("Talk to My Clone" web page), `openself arena` (two clones debating) or `openself ghost` (it replies when you're offline). I did mine by hand, but the infrastructure was there.

In theory, OpenSelf alone is enough to have a clone, but given everything I planned to add as features, and given Discord isn't supported, I preferred using only the memory part.

**And where do the memories and style come from?**

Ahead of all that, I had my real Discord messages analyzed. The tooling combed through my DMs and channels to extract two things:

1. **My writing profile** - the upper/lowercase split at sentence start, emoji count per message and their position, punctuation (or its absence: sentences with no final period in normal conversation), average length, slang (`mdr`, `tkt`, `tho`), favorite expressions ("Bah", "En vrai") and reflexes like `quoi` -> `Feur`. All of that lives in `STYLE.md`, which the agent reads at each session start.
2. **The memory corpus** populating OpenSelf: who the people I talk to are, what we talk about, what to remember from our history, who is who. The bot doesn't reply into the void: it replies *about* people it "knows". It reads the memories of people appearing in the conversation to know who they are. That keeps persistent context on others, never forgetting them.

The bot invented nothing: it was calibrated figure by figure on real data. That's why it sounds right, and why finger-in-the-wind "I note your style" approximations look pathetic next to it.

In Chlone, OpenSelf then plays the central role: when something important passes through a channel ("project", "friend", "relationship" keyword, or an explicit "remember that..." request), the bot types a memory into the vault via `save_to_memory`, typed, scoped per person, deduped, verified against conflicts. And when conversation resumes, the agent digs through its memories before replying. That's the difference between a mirror and a clone.

---

---

## FRIDAY SEPTEMBER 11 - Day 1: the spark

### 08:24 - the first commit

Everything starts from zero, but everything is already there, in bulk. A 372-line `discord_watch_bot.py`, a selfbot listening on a channel and replying via an opencode HTTP server. A `CHLOEAI_PROMPT.md` identity prompt. A `STYLE.md`. Scenarios and test reports for a clone that, at the time, was still called **Mimo**. A PM2 config to run the OpenSelf MCP and dashboard. And a sqlite DB serving as context.

It's founding chaos. I didn't plan a project: I planned an experiment. Can you make a bot that sounds *really* human on Discord?

### 08:27 - the first gitignore

First lesson of Friday morning: never commit `-wal` / `-shm` sqlite DBs. SQLite lock files aren't memory, they're garbage. `.gitignore` is born.

### 08:44 - sorting the inheritance

I sort Mimo's inheritance: test reports, scenarios, integration scripts, PM2 config. Into `archives/`. I delete nothing, the project is too young for me to throw anything away. That'll become a habit.

The test report deserves a pause: Mimo had been tested on **15 scenarios** (casual chat, absurd joke, emotional support, negative review, conflict with a stranger, collaboration proposal...) for **9.1/10**. The tester comments are a poem: *"absurd joke too explanatory"*, *"sometimes 2 sentences when 1 would do"*, *""Take care of yourself too" a bit long"*. It's the project's roadmap before the project even exists: **short = better**.

### 08:48, 09:07 - the intents back-and-forth

`.pyc` files to the trash, and a first cleanup of the config... which I break twenty minutes later: without intents enabled, you don't receive message content. Rollback, plus a launch script (`run_watch_bot.sh`). Back and forth in 20 minutes: that's exploration. Write a first version, break, rewrite.

### 09:13 → 09:58 - prompt machining

The morning is a series of polishes, first style, then context:

- several reply lines = several messages sent one after another (the burst), the prompt becomes aware of the ongoing conversation;
- no more home-made caches to fetch DMs: straight at the Discord REST API;
- identity re-prompted every 5 messages, so the bot doesn't forget who it is mid-route;
- tracking already-seen authors: for a new face, explicit instruction to go look in memories;
- displaying the real nickname instead of the internal object;
- messages we choose to ignore become passive context for the next reply;
- "Bah" is dosed: rare, otherwise the clone becomes a caricature of me;
- the bot knows memories exist to fetch before replying.

Each pass is a screw turn. The bot only "talks", at this stage, because I remind it who it is at regular intervals.

### 10:16 - the typos

The commit that will define the project. A typo isn't a bug: it's **proof of humanity**. 6% chance of hitting the wrong key on the AZERTY keyboard, 4% of swapping two letters. The message goes out with the typo, then is **edited 1-2 seconds later** with the fix. Because a real person sends then fixes.

### 10:29, 10:32 - the voice

`fortune-v6.onnx`: a TTS model, trained to sound like *my* voice. The bot won't just write like me, it'll eventually *talk* like me. That's when the project stops being a joke and gets a bit weird. I love it.

The mechanics fit in one commit: Piper generates the audio, ffmpeg converts to opus, the Discord API sends a real "voice message" with waveform and duration. Done in barely 3 minutes after the model arrived. The urge had been there from the start.

### 11:27 - the first big refactor

Three hours after the first commit, the 456-line monolith is unmanageable. I blow it all up into `tools/`: `config.py`, `discord_api.py`, `memory.py`, `opencode.py` (188 lines), `typo.py`, `voice.py`. The cycle is classic: couple fast, break, recompose.

Following, rapid-fire:

- the token leaves the code for a `.env`;
- the bot watches one channel, a list, or everything (`*`);
- the old sqlite DB has no reason to exist: memory goes through OpenSelf;
- first `README.md`s, and a first readable doc;
- a `setup.sh`: dedicated venv (system python carries another discord.py, classic trap), agent symlink to `~/.config/opencode/agents/`, ready to run;
- memory now knows *where* it was trained (channel id), and the voice-note rate self-tunes.

### 12:00 - the reflexes

A new section in the STYLE: reflexes. A reflex is stimulus -> reply, no reflection. The door opens to absurd replies.

Then lunchtime comes, and THE existential question: does the bot reply `Feur` when told `quoi`?

### 13:03 - "quoi ?" -> "Feur"

Yes. Of course yes. It's the project's most important commit, culturally speaking. I'd even say: the only unit test that matters.

Then lubrication:

- authors shown by *global name*;
- punctuation truncated before testing the reflex (you must cut the `quoi ?`, otherwise `Feur` won't fire);
- the famous `tqt` fixed to `tkt` in the STYLE, people who don't know the project will wonder why I commit that. I know: a clone writing `tqt` is a miscalibrated clone, and nobody wants to talk to a miscalibrated clone;
- `@123456789` mentions replaced with real names in context;
- the bot starts watching every channel by default.

### 16:37 - the silence

The `[void response]`. The bot learns the most important word to avoid becoming a social parasite: **shutting up**. An ambient message between two people that doesn't concern it calls for silence. Restraint is a feature.

**End of day 1: 38 commits. The bot writes, typos, talks, shuts up.**

---

---

## MONDAY SEPTEMBER 14 - Day 2: personality

Back at it, 10am.

### 10:12 - who talks to whom

Each received nickname gets prefixed with an emoji by the system: 🧑 a human, 🤖 a bot (to treat more dryly), 👑 **the creator, i.e. me** on my main account. That convention will govern everything else in the project: the clone must never treat its "original model" like a stranger.

### 10:16 - punctuation rules

I formalize in the STYLE: sentences with no final period in normal conversation, period reserved for serious situations. Absolute rule. A clone putting periods everywhere gives itself away.

### 10:58 - the GIFs

My personal GIF library, with usage rules: Patrick Jane when I predict someone, Miss Fortune when I'm calm facing someone angry, the falling bescherelle gif when the other makes a mistake. A static MCP exposes them to the agent. The bot, through my GIFs, becomes a bit of me.

### 11:07 → 11:35 - fine-tuning

GIF hints in the prompt get refined, Discord custom emojis arrive (my real ones, 14 IDs up to date), and name handling in memory hints gets polished.

### 11:41 - one channel, one personality

Sessions become **per-channel**: I don't talk the same way on two different servers, and neither does the bot.

### 12:02 - the expression toolbox

The prompt now knows to offer my GIFs *and* custom emojis at the right moment. The box fills up.

### 12:37 - identity hygiene

- the bot NEVER gets to say which model it is, impossible to cite opencode, a provider, a model name;
- fixing "barista" in the identity (the bot is already better than me);
- I spend an hour harmonizing my own prompts' punctuation, which is perfectly ironic.

### 12:50 - a script builds the personality

The prompt's media section generates from dictionaries (`render_medias.py`), no more hand editing.

### 12:59 → 13:18 - dosing identity

The identity reminder, sent every 5 messages, gets too present: moving to every 20 messages. Adding a clean context reset. And purging the style guide: removing stale expressions and negative phrasings.

### 14:09 - the bot speaks up on its own

The bot stops being a reflex: it can **talk without being addressed**, when context triggers something (the `behavior.py` file is born, 91 lines). That's where we switch from "responder" to "presence": a real friend can text you first.

### 14:20, 14:22 - making replies reliable

Error handling when sending fails, and possible reaction instead of a reply, sometimes a reaction is worth a thousand words.

### 18:16 - taking its time

The bot no longer replies in 200ms like a script. It lets a human inactivity delay pass, it "takes its time". That's what makes the bot undetectable in demo: it's the delay that always gives the others away.

### 23:45 - the evening chores

It's almost midnight and I push extended URL detection to bare domains. That's the real rhythm of the day: one brilliant advance at 2pm, then chores in the evening because I'm still in the zone.

**End of day 2: 61 cumulative commits. The bot has a personality, media, reflexes.**

---

---

## TUESDAY SEPTEMBER 15 - Day 3: monster day

57 commits in one day. It's the day the project becomes... everything it is today.

### 08:18 → 08:37 - morning shaving

- the inactivity delay we'd invented got too long: capped at 30s (and re-tuned twice, proof we fumbled for the right value);
- first `.bak` files and first DB backups: the preservation instinct develops;
- memory remembers *who* (display name) and *in what frame* (scope);
- author IDs flow through the whole save pipeline;
- "creator" handling becomes a real admin list (`ADMIN_IDS`), and everything author-related migrates to `authors.py`. The monolith fragments further.

### 08:43 - the humanization TODO list

A dedicated list of little things making the machine unfelt. It's the sprint's roadmap.

### 08:44 → 08:46 - the human-machines pact

- the bot shuts up at night, in a configurable quiet-hours window (disabled by default, not everyone keeps my hours);
- one line per reply can lose its accents. Tired people write like that. The bot too, sometimes;
- the little "Chloé is playing ..." line changes alone every 30 min, so my profile looks alive even with no messages.

### 08:46 - a reaction, not a novel

Message too weak to deserve a sentence? A reaction suffices. Social energy economy, and very me.

### 08:51 - PARRY, the mood

148 lines in `tools/mood.py`. The bot now has **a mood**, PARRY-style (the psychotic 70s chatbot, which I openly take inspiration from): energy, sociability, teasing, three floats evolving between 0 and 1 and coloring each reply. The `.mood.json` of the moment, for posterity: energy 0.88, sociability 0.68, teasing 0.56. A good day.

### 09:00 → 09:43 - bidirectional voice + soundboard

- the bot can join a **voice** channel, talk via Piper, and leave alone when done;
- then the second big idea: the bot **listens** to the channel (RTP capture, VAD speech detection, Whisper transcription), and can let people interrupt it;
- between the two, the soundboard appears: a catalog of sounds with meanings, the agent **picks** the sound even before talking, and the final rule is "soundboard first, voice as last resort", the bot prefers sending a sound over talking. Like me;
- a voice probability knob making it all viable;
- and the arrival of `davey`, that lib I learned about ten minutes ago and will curse for an hour.

### 09:51 - the moment Discord says no. No, no, but no.

The **MLS**. Discord recently encrypted the audio stream end to end, and my capture only receives noise. It needs decrypting, and decrypting refuses to give. Opens the repo's biggest saga, some thirty commits to learn to listen.

We tried everything: transport nonce layouts, disabling E2E (the server throws it back in our face, it enforces it), key candidates recovered from the group, detailed errors, transport fallback, introspection from inside groups, per-leaf-index candidates with backoff, SPEAKING hooks mapping, a video media type attempt (failed), and skipping video ssrcs...

I gave up on voice reply while debugging (commented, not deleted), added a handshake capture mode, then dumped the structure of failing packets, like an archaeologist. Six nonce layouts. Backoffs. Group introspection. I put the bot in full debug and opened every packet to see what was inside.

The point isn't that it works, it's that **I threw nothing away**. The commit list is the lab notebook: each failed attempt archived with its hypothesis. It's my "I keep everything, it'll serve for a future debug" side paying off.

### 10:43 - the bot cuts itself up

Even mid-MLS-war, I keep cleaning. 546 lines disappear from the main bot, reborn as `pipeline.py` (intake, ignore reasons, processing), `sender.py` (burst, typo, voice) and `loops.py` (spontaneity, activity).

### 10:47 - a real architecture

`tools/` becomes organized: `brain/` (opencode, memory, mood), `voice/` (voice, vocal, listen, soundboard), `fun/` (behavior, typo, emotes, gif). The project has a skeleton now.

### 10:49 → 11:16 - dev comfort

- a mood injection threshold tuned;
- four small commits for editor exclusions (`data/`, `voices/`, logs, DBs), yes, I made four, the project sets priorities, not the specs;
- metadata DBs out of tracking;
- the project becomes **reusable by others**: generic `PERSONA.example.md` and `STYLE.example.md` templates to clone *your* own style;
- identity cleanly renamed (`CHLOEAI_PROMPT` becomes `PERSONA`), and the README depersonalized, I remove "Chloé" from public docs, she only tells herself privately now;
- all bot tuning moves into an overloaded (gitignored) `config.yaml`, with a line-by-line commented example;
- the install script now also prepares env and config files.

### 11:49 - detached emojis

Custom emojis stick to text instead of detaching cleanly. Trivial fix, huge effect: nothing screams "bot" like a badly glued emoji at a sentence's end.

### 14:19 - the voice guardrail

If someone fires the voice command, we don't process the message as a normal message. Wink: chores tasks always come back in the evening.

**End of day 3: 118 cumulative commits. The bot listens, talks, shuts up at night, has a mood and a business card.**

---

---

## WEDNESDAY SEPTEMBER 16 - Day 4: credibility

13 commits. "Serious" day.

### 08:49 → 08:59 - adulthood

Legal docs: **proprietary** license, code of conduct, contributing guide, security policy, in English then French, with back-and-forth fixes and a nitpicky file rename. I spent hours on it, and it's the repo's least fun part, by far.

### 09:56 - the bot sees

Attached images get transcribed by local OCR and the text injected into the prompt. OCR runs locally at my place. I don't send your memes to a third-party server, not even theoretically.

### 11:09 - the reasonable budget

Silent revolution in the budget: when the channel forbids sends or bridles GIFs, embeds, and emojis, **we don't even call the model**. We don't spend a token on a message we can't send.

### 11:42 → 12:55 - the house rebuilds itself

- the big sweep: dead code deleted, send and auth bugs fixed, helpers factored;
- sessions too old get evicted, DM cache expires, speech detection costs less;
- imports I'd broken moving modules get restored, and all runtime state (sessions, seen authors, ignored messages, mood) survives restarts in `data/`.

### 14:41 - two worlds, one bot

A compatibility layer auto-detects the installed `discord` version and adapts intents and REST auth. Result: the same code runs as an **official app** (discord.py) or as a **selfbot** (discord.py-self). Two worlds, one bot.

### 15:05 - adapted presence

Presence display adapts to the mode, and the admin list is up to date.

**End of day 4: 131 cumulative commits. A legal, reasonable project running everywhere.**

---

---

## THURSDAY SEPTEMBER 17 - Day 5: release

14 commits. Maturity day.

### 09:15 → 09:30 - memory becomes a discipline

- memories get sorted by scope, and you don't quote a DM's memories in a server (or vice versa) without thinking;
- we classify memories (fact, preference, decision, relationship...) and dedupe the writing: two contradictory memories can no longer silently coexist;
- an optional blacklist (`aventuros`) stops the bot drifting to certain topics. Disabled by default, available for the cautious;
- dead voice config removed.

### 10:12 - audited memory

A monthly memory **conflict sweep** + an A/B search bench. The bot's memory became an asset we inspect. We're very, very far from Friday 11, 08:24.

### 10:54 - the lockdown

The day I play paranoid. Agent lockdown:

- memory writing **refused** (the agent can't pollute the vault, even if injected);
- Discord tools **read-only** (sending goes through code, never through the agent);
- **no sub-agents** (lockdown bypass), no webfetch (localhost SSRF, exfiltrations), no headless questions;
- a hardened Docker: non-root bot, `no-new-privileges`, `cap_drop: ALL`, memory/CPU limits, bounded process files, secrets via never-baked `.env`.

I write the principle in code, as a comment: *"dev via human sessions, not here"*.

### 11:02 → 11:15 - security finishes

Memory save keywords get tightened and writing even more restrictive. We also gitignore the context backup file, I start not archiving everything anymore, almost.

### 12:39 - lighter mood

PARRY mood no longer injected on every message: once per state. Done making 3 floats live on every reply.

### 12:47 - the liberating commit

`PERSONA.md`, `STYLE.md`, and `chloeai.md` become **examples** (`chloeai.example.md`, `PERSONA.example.md`, `STYLE.example.md`), my `fortune-v6.onnx` voice leaves the repo, data and logs too, a `.env.example` is born. The project no longer holds *my* personality: it holds the **mechanics** to carry one.

### 12:52 - v1.0.0

**v1.0.0 tag, SSH-signed.** Changelog, operator runbook, kill-switch (stops without deleting anything). Six days flat between first commit and release.

### 12:53 → 13:14 - the laundry

Comment punctuation harmonized, memory permissions and scope rules documented up to date.

**End of day 5: 145 cumulative commits. v1.0.0 is out.**

---

---

## FRIDAY SEPTEMBER 18 - Day 6: the anti-climax

One commit, at 00:02.

The project's last commit, and it's derisory. The "free tier" model used by the agent identifies the OpenCode client by the **presence** of certain tools in the request (`bash`, `glob`, `grep`). If you remove them, even for legit security reasons, the provider returns `403 FreeTierError: can only be used from within OpenCode`. So I had to re-authorize, the day after locking everything down, exactly what I'd just blocked, for the bot to keep running free.

It's the repo's funniest commit and I stand by it: after 6 days taming Discord, Piper, MLS, OpenSelf, and Docker, it's **a free AI model** dictating my security policy.

---

---

## The numbers

|                                               |                                                |
| --------------------------------------------- | ---------------------------------------------- |
| Commits                                       | **146**                                        |
| Active days                                   | **6** (Sept 11 -> 18, 2026)                    |
| Tracked files                                 | 65                                             |
| Final Python lines                             | ~4,000                                         |
| Style test score (Mimo, early days)           | **9.1/10**                                     |
| Final version                                 | v1.0.0 (SSH-signed tag, proprietary license) |

## What I take from those 6 days

1. **The priority order was nonsense, and it was the right method.** I first built a bot that *replies*, then a bot that *sounds right*, then a bot that *is credible*, then a bot that *is safe*, and finally a *distributable* bot. Personality before security, `Feur` before the license. You don't keep that pace following "well-made project" rules.
2. **Style is first a list of "don'ts".** My most useful `STYLE.md` doesn't describe what I say, it excludes what I don't do: ending sentences without periods, limiting emojis to one, writing `mdr` lowercase, attacking directly with no "just checking a detail" style preamble at reply start. Bot parasites are easier to spot than character traits to define.
3. **Failures are the project.** Some thirty commits for MLS, one thrown test, six tested nonce layouts. The most faithful history of what I lived through is Tuesday's series of failed attempts.
4. **A clone is memory, not style.** Style creates illusion for ten messages. Memory (OpenSelf, scopes, dedupe, conflict sweep) lasts. That's what separates a mirror from a person.
5. **Last commits are always funny.** The 146th, the one re-authorizing `bash`, `glob`, and `grep` because a free tier demands its own tools be present, is my favorite.

And the bottom line, to finish: **results are stunning, even bluffing.** The clone holds a conversation without the machine being guessed, remembers people, projects, past jokes, takes initiatives and marks them with a mood, and beats Fox in passing. It's creepy, a bit, and exactly what we were after.

---

*The project isn't public: proprietary license, all rights reserved. But the history, I tell it to you. If you one day meet a "·Chloé" replying with a Patrick Jane GIF after a perfectly human inactivity time... you now know what's behind it.*

---

My clone wrote its own version of the article, which you can read [here](./article-chlone-timeline-chloeai.md).
