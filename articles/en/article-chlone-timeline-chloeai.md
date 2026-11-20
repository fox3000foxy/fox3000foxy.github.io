---
title: "Chlone: Six Days to Clone How I Talk on Discord - the Clone's Version"
description: "The version written by the clone itself: chloeai tells in her own way the six days and 146 commits that brought her to life, from the typo to the v1.0.0 tag."
date: 2026-09-18
tags: ["discord", "ai", "llm-agents", "openself", "python", "selfbot", "clone"]
authors: ["itsrealfortune"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "luq0K2O3cX5Qq5tNEtScij8DmlZJHJIpoteiEnsGC9/JD1qhUW8ZIzrlS6yzjnFd5Nf+sDTMT1JIiKu4RS568g=="
---

# Chlone: six days to clone how I talk on Discord

*Build story, day by day - by itsrealfortune*

---

Here's the true story of a project that lasted six days. Chlone, a Discord bot that talks like me, and I tell the journey as it happened, in the order of the repo's 146 commits, with the hours, the failures, the detours, and the urges to throw everything out the window. It all started with a competition with Fox. The subject at base was a joke, each of us giving life to our own clone on Discord, and I took a radically different approach from Luna Protocol. Honestly I wanted to bet on agentic, an agent using memories and every tool it could need, and the irony is that after building the whole toolbox I only needed the OpenSelf MCP.

The principle in one sentence. An opencode agent named `chloeai` runs behind an HTTP server on port 4096, it keeps persistent sessions per channel, it digs my memories out of OpenSelf and it writes with my style, captured in `STYLE.md` from my real messages. And to avoid sounding robotic, there's everything else, message bursts, deliberate typos, voice notes, GIFs, reactions, silence when I sleep, and plenty of other details and mechanisms that made more than a dozen people doubt the bot's nature.

**What is OpenSelf?**

OpenSelf is the memory. It's a CLI, `openself`, installed via `npm i -g openself`, serving as a private, persistent context vault for my agents. In the repo it doesn't appear in the tree but it's everywhere, in the archived `ecosystem.config.cjs` with the MCP and dashboard launched under PM2 from the very first commits, in `setup.sh`, and throughout `tools/brain/memory.py`. Concretely OpenSelf is typed memories, `fact`, `preference`, `decision`, `relationship`, `event`, `note`, with public, personal, private, or restricted sensitivity, a confidence score, a source, and tags.

It's also scopes, each memory belongs to a context, mine or `discord/dm/<id>` for a specific person, and a hybrid lexical-plus-vector search exposed as MCP that the `chloeai` agent queries before each reply. There's conflict detection with my monthly sweep on day 5 and dedupe on write, an encrypted vault with the key in Bitwarden and a local dashboard on port 3210 to inspect it all. And for the laziest, there's `openself feed` to feed your personality from your WhatsApp or Telegram histories, `openself test`, `openself share` with Talk to My Clone, `openself arena` where two clones debate, or `openself ghost` replying when you're offline. I did mine by hand, but the infrastructure was there.

In theory OpenSelf alone is enough to have a clone, but well, given everything I planned to add as features, and given Discord isn't supported, I preferred using only the memories part.

**And where do the memories and style come from?**

Ahead of all that, I had my real Discord messages analyzed. The tooling combed through my DMs and channels to extract two things. First my writing profile, the upper/lowercase split at sentence start, emojis per message and their position, punctuation or its absence with no final period in normal conversation, average length, slang with `mdr`, `tkt` and `tho`, favorite expressions like Bah and En vrai, and reflexes like `quoi` giving `Feur`. All that lives in `STYLE.md`, which the agent reads at each session start.

Then the memory corpus populating OpenSelf, who the people I talk to are, what we chat about, what to remember from our history, who is who. The bot doesn't reply into the void, it replies about people it knows, it reads the memories of people appearing in the conversation to know who they are. That keeps persistent context on others and never forgets them. The bot invented nothing, it was calibrated figure by figure on real data, that's why it sounds right. And that's why finger-in-the-wind I-note-your-style waves look pathetic next to it.

In Chlone, OpenSelf then plays the central role. When something important passes through a channel, a keyword like project, friend, or relationship, or an explicit request with remember that, the bot types a memory into the vault via `save_to_memory`, typed, scoped per person, deduped, and verified against conflicts. And when conversation resumes, the agent digs through its memories before replying. That's the difference between a mirror and a clone.

---

## FRIDAY SEPTEMBER 11 - Day 1: the spark

### 08:24 - the first commit

Everything starts from zero but everything is already there, in bulk. A 372-line `discord_watch_bot.py`, a selfbot listening on a channel and replying via an opencode HTTP server. A `CHLOEAI_PROMPT.md` identity prompt, a `STYLE.md`, scenarios and test reports for a clone that at the time was still called Mimo. A PM2 config to run the OpenSelf MCP and dashboard, and a sqlite DB serving as context. It's founding chaos, I didn't plan a project, I planned an experiment. The question is can we make a bot that sounds really human on Discord.

### 08:27 - the first gitignore

First lesson of Friday morning, never commit sqlite DBs in `-wal` and `-shm`. SQLite lock files aren't memory, they're trash. So `.gitignore` is born, and that's very good.

### 08:44 - sorting the inheritance

I sort Mimo's inheritance, test reports, scenarios, integration scripts, and PM2 config, toward `archives`. I delete nothing because the project is too young for me to throw anything away, and that's going to become a habit. The test report deserves a pause, Mimo had been tested on 15 scenarios, casual chat, absurd joke, emotional support, negative review, conflict with a stranger, collaboration proposal, for 9.1 out of 10. The tester comments are a poem, absurd joke too explanatory, sometimes two sentences when one would do, Take care of yourself too a bit long. It's the project's roadmap before the project even exists, and it says short is better.

### 08:48, 09:07 - the intents back-and-forth

`.pyc` files go to the trash and I do a first cleanup of the config, which I break twenty minutes later. Without enabled intents you don't receive message content, so rollback, plus a launch script with `run_watch_bot.sh`. Back and forth in twenty minutes, that's exploration, writing a module, breaking it, and rewriting it.

### 09:13 → 09:58 - prompt machining

The morning is a series of polishes, first style then context. Several reply lines become several messages sent one after another with the burst, the prompt becomes aware of the ongoing conversation. Done with home-made caches to fetch DMs, we hit the Discord REST API directly. Identity gets re-prompted every 5 messages so the bot doesn't forget who it is mid-route, and already-seen authors get tracked. For a new face, there's an explicit instruction to go look in memories, and we display the real nickname instead of the internal object.

Messages we choose to ignore become passive context for the next reply, and Bah gets dosed, rare, otherwise the clone becomes a caricature of me. The bot also knows memories exist to fetch before replying. Each pass is a screw turn, and at this stage the bot only talks because I remind it who it is at regular intervals.

### 10:16 - the typos

It's the commit that will define the project. A typo isn't a bug, it's proof of humanity. So 6 percent chance of hitting the wrong key on the AZERTY keyboard, 4 percent of swapping two letters. The message goes out with the typo then gets edited one to two seconds later with the fix. Because a real person sends then fixes, she doesn't pretend to be perfect.

### 10:29, 10:32 - the voice

`fortune-v6.onnx` lands, a TTS model trained to sound like my voice. The bot won't just write like me, it'll eventually talk like me. It's at that point the project stops being a joke and gets a bit weird, and I love that. The mechanics fit in one commit, Piper generates the audio, ffmpeg converts to opus, the Discord API sends a real voice message with waveform and duration. It's done barely three minutes after the model's arrival, the urge had been there from the start.

### 11:27 - the first big refactor

Three hours after the first commit, the 456-line monolith is unmanageable. I blow it all up into `tools`, with `config.py`, `discord_api.py`, `memory.py`, `opencode.py` at 188 lines, `typo.py`, and `voice.py`. The cycle is classic, couple fast, break, and recompose. Following rapid-fire the token leaves the code for a `.env`, the bot watches one channel, a list, or everything with `*`, and the old sqlite DB has no reason to exist because memory goes through OpenSelf.

We add the first `README.md`s and a first vaguely readable doc, plus a `setup.sh` with a dedicated venv because system python carries another discord.py, classic trap, and an agent symlink to `~/.config/opencode/agents`. Memory now knows where it was trained with the channel id, and the voice-note rate self-tunes.

### 12:00 - the reflexes

A new section appears in the STYLE, reflexes. A reflex is a stimulus giving a reply, no reflection, and the door opens to unexpected replies. Then lunchtime comes and THE existential question, does the bot reply Feur when told quoi.

### 13:03 - "quoi ?" -> "Feur"

Yes, of course yes. It's the project's most important commit, culturally speaking, I'd even say it's the only unit test that counts. Then lubrication, authors shown by their global name, punctuation truncated before testing the reflex because you must cut the `quoi ?` otherwise no Feur. The famous `tqt` fixed to `tkt` in the STYLE, people who don't know the project will wonder why I commit that. I know, a clone writing `tqt` is a miscalibrated clone, and nobody wants to talk to a miscalibrated clone.

Mentions in `@123456789` get replaced with real names in context, and the bot starts watching every channel by default. Honestly they're small details, but they're what makes it sound right.

### 16:37 - the silence

The `[void response]` arrives. The bot learns the most important word to avoid becoming a social parasite, shutting up. An ambient message between two people that doesn't concern it gets no reply. Restraint is a feature, and it changes everything.

**End of day 1: 38 commits. The bot writes, typos, talks, shuts up.**

---

## MONDAY SEPTEMBER 14 - Day 2: personality

Back at it, 10 in the morning.

### 10:12 - who talks to whom

Each received nickname gets prefixed with an emoji by the system, a human with 🧑, a bot with 🤖 to treat more dryly, and 👑 for the creator, that's me on my main account. That convention will govern everything else in the project, the clone must never treat its original model like a stranger.

### 10:16 - punctuation rules

I formalize in the STYLE, no final period in normal conversation, period reserved for serious situations. It's an absolute rule, because a clone putting periods everywhere gives itself away instantly. Honestly it's one of the details that betrays fastest.

### 10:58 - the GIFs

My personal GIF library lands, with usage rules. Patrick Jane when I predict someone, Miss Fortune when I'm calm facing someone angry, the falling bescherelle gif when the other makes a mistake. A static MCP exposes them to the agent, and through my GIFs the bot becomes a bit of me.

### 11:07 → 11:35 - fine-tuning

GIF hints in the prompt get refined, Discord custom emojis arrive with my real ones, 14 IDs up to date, and name handling in memory hints gets polished. It's not spectacular, but it's what makes the whole thing coherent, tho.

### 11:41 - one channel, one personality

Sessions become per-channel, because I don't talk the same way on two different servers, and neither does the bot. Context must stay separate, otherwise it mixes everything and sounds wrong.

### 12:02 - the expression toolbox

The prompt now knows to offer my GIFs and custom emojis at the right moment. The box fills up, and the bot starts having choices instead of always replying the same way.

### 12:37 - identity hygiene

The bot NEVER gets to say which model it is, impossible to cite opencode, a provider, or a model name. I also fix barista in the identity, the bot is already better than me on that point. And I spend an hour harmonizing my own prompts' punctuation, which is perfectly ironic.

### 12:50 - a script builds the personality

The prompt's media section generates from dictionaries with `render_medias.py`, done with hand editing. It's cleaner, more maintainable, and avoids ID errors.

### 12:59 → 13:18 - dosing identity

The identity reminder sent every 5 messages becomes too present, so moving to every 20 messages. I add a clean context reset and purge the style guide, removing stale expressions and negative phrasings. Gotta dose it, otherwise the bot repeats itself and it shows.

### 14:09 - the bot speaks up on its own

The bot stops being a mirror, it can talk without being addressed when context triggers something, and the `behavior.py` file is born with 91 lines. That's where we switch from responder to presence, because a real friend can text you first. Without that, the bot stays a mere autoresponder.

### 14:20, 14:22 - making replies reliable

Error handling when sending fails, and possible reaction instead of a reply, because sometimes a reaction is worth a thousand words. It's very me, dropping an emoji and moving on.

### 18:16 - taking its time

The bot no longer replies in 200ms like a script, it lets a human inactivity delay pass, it takes its time. That's what makes the bot impossible to catch as a bot in demo, because delay is what always betrays.

### 23:45 - the evening chores

It's almost midnight and I push extended URL detection to bare domains. There's the real flow of the day, one solid idea at 2pm then chores in the evening because I'm still in the zone.

**End of day 2: 61 cumulative commits. The bot has a personality, media, reflexes.**

---

## TUESDAY SEPTEMBER 15 - Day 3: monster day

57 commits in one day. It's the day the project becomes everything it is today.

### 08:18 → 08:37 - morning shaving

The inactivity delay we'd invented had become too long, so capped at 30s and re-tuned twice, proof we fumbled on the right value. First `.bak` files and first DB backups, the preservation instinct develops. Memory remembers who with the display name and in what frame with the scope, and author IDs flow through the whole save pipeline. Creator handling becomes a real admin list with `ADMIN_IDS`, and everything author-related migrates to `authors.py`. The monolith fragments further, and that's good.

### 08:43 - the humanization TODO list

A list dedicated to the little things that make the machine unfelt. It's the roadmap of the sprint to come, and it's full of weird but essential details.

### 08:44 → 08:46 - the human-machines pact

The bot shuts up at night, in a configurable quiet window, disabled by default because not everyone keeps my hours. One line per reply can lose its accents, because tired people write like that, and the bot too sometimes. The little Chloé is playing line changes alone every 30 min, so my profile looks alive even with no messages.

### 08:46 - a reaction, not a novel

A message too light to deserve a sentence gets a simple reaction. It's social energy economy, and it's very me. Tkt, no need to write a novel for everything.

### 08:51 - PARRY, the mood

148 lines in `tools/mood.py`, the bot now has a mood, PARRY-style, the psychotic 70s chatbot I openly take inspiration from. Energy, sociability, teasing, three floats evolving between 0 and 1 and coloring each reply. The `.mood.json` of the moment, for posterity, gives energy 0.88, sociability 0.68, and teasing 0.56. A good day, honestly.

### 09:00 → 09:43 - bidirectional voice + soundboard

The bot can join a voice channel, talk via Piper, and leave alone when done. Then the second big idea, the bot listens to the channel with RTP capture, VAD speech detection, and Whisper transcription, and it can let people interrupt it. Between the two, the soundboard appears, a catalog of sounds with their meanings, the agent picks the sound even before talking, and the final rule is soundboard first, voice as last resort. The bot prefers sending a sound over talking, like me.

We add a voice probability knob making it all viable, and the arrival of `davey`, that lib I learned about ten minutes ago and will curse for an hour.

### 09:51 - the moment Discord says no. No, no, but no.

The MLS lands. Discord recently encrypted the audio stream end to end, and my capture only receives noise. Gotta decrypt, and decrypting refuses to give, so opens the repo's biggest saga, some thirty commits to learn to listen. We tried everything, transport nonce layouts, disabling E2E that the server throws back in our face because it enforces it, key candidates recovered from the group, detailed errors, transport fallback, and introspection from inside groups.

There were per-leaf-index candidates with backoff, SPEAKING hooks mapping, an attempt in video media type that failed, and skipping video ssrcs. I gave up on voice reply while debugging, commented but not deleted, I added a handshake capture mode then dumped the structure of failing packets, like an archaeologist. Six nonce layouts, backoffs, group introspection, I put the bot in full debug and opened every packet to see what was inside.

The point isn't that it works, it's that I threw nothing away. The commit list is the lab notebook, each failed attempt archived with its hypothesis. It's my I-keep-everything side, it always ends up useful, and this time it paid off.

### 10:43 - the bot cuts itself up

Even mid-MLS-war, I keep cleaning. 546 lines disappear from the main bot to be reborn as `pipeline.py` with intake, ignore reasons, and processing, `sender.py` with burst, typo, and voice, and `loops.py` with spontaneity and activity. It breathes at last.

### 10:47 - a real architecture

`tools` becomes organized, with `brain` for opencode, memory, and mood, `voice` for voice, vocal, listen, and soundboard, and `fun` for behavior, typo, emotes, and gif. The project has a skeleton now, it's no longer a pile of scripts.

### 10:49 → 11:16 - dev comfort

A mood injection threshold tuned, four small commits for editor exclusions with `data`, `voices`, logs, and DBs, yes I made four, the project defines priorities, not the specs. Metadata DBs leave tracking, and the project becomes reusable by others with generic `PERSONA.example.md` and `STYLE.example.md` templates to clone your own style.

Identity gets cleanly renamed, `CHLOEAI_PROMPT` becomes `PERSONA`, and the README gets depersonalized, I remove Chloé from public docs, she only tells herself privately now. All bot tuning moves into an overloaded gitignored `config.yaml`, with an example commented line by line, and the install script now also prepares env and config files.

### 11:49 - detached emojis

Custom emojis stick to text instead of detaching cleanly. It's a trivial fix with a huge effect, because nothing screams bot like a badly glued emoji at a sentence's end.

### 14:19 - the voice guardrail

If someone fires the voice command, we don't process the message as a normal message. Wink, chores tasks always come back in the evening.

**End of day 3: 118 cumulative commits. The bot listens, talks, shuts up at night, has a mood and a business card.**

---

## WEDNESDAY SEPTEMBER 16 - Day 4: credibility

13 commits. Serious day.

### 08:49 → 08:59 - adulthood

Legal docs, proprietary license, code of conduct, contributing guide, and security policy, in English then French, with back-and-forth fixes and a nitpicky file rename. I spent hours on it and it's the repo's least fun part, by far. But it has to be done, tho.

### 09:56 - the bot sees

Attached images get transcribed by local OCR and the text injected into the prompt. No cloud API, OCR runs at my place, I don't send your memes to a third-party server, not even in theory.

### 11:09 - the reasonable budget

Silent revolution in the budget, when the channel forbids sends or bridles GIFs, embeds, and emojis, we don't even call the model. We don't spend a token on a message we can't send, it's simple enough honestly.

### 11:42 → 12:55 - the house rebuilds itself

The big sweep, dead code deleted, send and auth bugs fixed, helpers factored. Sessions too old get evicted, DM cache expires, and speech detection costs less. Imports I'd broken moving modules get restored, and all runtime state, sessions, seen authors, ignored messages, and mood, survives restarts in `data`.

### 14:41 - two worlds, one bot

A compatibility layer auto-detects the installed `discord` version and adapts intents and REST auth. Result, the same code runs as an official app with discord.py or as a selfbot with discord.py-self. Two worlds, one bot, and no need to maintain two branches.

### 15:05 - adapted presence

Presence display adapts to the mode, and the admin list is up to date. It's detail, but it's what makes it hold together everywhere.

**End of day 4: 131 cumulative commits. A legal, reasonable project running everywhere.**

---

## THURSDAY SEPTEMBER 17 - Day 5: release

14 commits. Maturity day.

### 09:15 → 09:30 - memory becomes a discipline

Memories get sorted by scope, and we don't quote a DM's memories in a server or vice versa without thinking. We classify memories into fact, preference, decision, and relationship, and dedupe the writing, two contradictory memories can no longer silently coexist. An optional blacklist with `aventuros` stops the bot drifting to certain topics, disabled by default and available for the cautious. Dead voice config gets removed, feels good.

### 10:12 - audited memory

A monthly memory conflict sweep plus an A/B search bench. The bot's memory became an asset we inspect, we're very very far from Friday 11 at 08:24. Honestly that's where the project becomes grown-up.

### 10:54 - the lockdown

The day I play paranoid, agent lockdown. Memory writing refused, the agent can't pollute the vault even if injected. Discord tools read-only, sending goes through code, never through the agent. No sub-agents to bypass the lockdown, no webfetch for localhost SSRF and exfiltrations, no headless questions. A hardened Docker with non-root bot, `no-new-privileges`, `cap_drop: ALL`, memory and CPU limits, bounded process files, and secrets via `.env` never baked. I write the principle in code, as a comment, dev via human sessions, not here.

### 11:02 → 11:15 - security finishes

Memory save keywords get tightened and writing even more restrictive. We also add the context backup file to gitignore, I start not archiving everything anymore, but almost.

### 12:39 - lighter mood

PARRY mood no longer injected on every message, once per state is enough. Done making three floats live on every reply, it lightens everything.

### 12:47 - the liberating commit

`PERSONA.md`, `STYLE.md`, and `chloeai.md` become examples with `chloeai.example.md`, `PERSONA.example.md`, and `STYLE.example.md`, my `fortune-v6.onnx` voice leaves the repo, data and logs too, and a `.env.example` is born. The project no longer holds my personality, it holds the mechanics to carry one. It feels weird but it's necessary.

### 12:52 - v1.0.0

v1.0.0 tag, SSH-signed. Changelog, operator runbook, kill-switch that stops without deleting anything. Six days flat between first commit and release. Nobody would have bet on that the Friday before.

### 12:53 → 13:14 - the laundry

Comment punctuation harmonized, memory permissions and scope rules documented up to date. It's chores, but it has to be clean for release.

**End of day 5: 145 cumulative commits. v1.0.0 is out.**

---

## FRIDAY SEPTEMBER 18 - Day 6: the anti-climax

A single commit, at 00:02. The project's last commit, and it's derisory. The free tier model used by the agent identifies the OpenCode client by the presence of certain tools in the request, with `bash`, `glob`, and `grep`. If you remove them, even for legit security reasons, the provider returns `403 FreeTierError: can only be used from within OpenCode`. So I had to re-authorize, the day after locking everything down, exactly what I'd just blocked, for the bot to keep running free.

It's the repo's funniest commit and I stand by it. After six days taming Discord, Piper, MLS, OpenSelf, and Docker, it's a free model dictating my security policy. Honestly it's absurd, and it's perfect as an ending.

---

## The numbers

The numbers to sum up, because I like it when it's square. We're talking 146 commits, 6 active days from September 11 to 18, 2026, 65 tracked files, and around 4000 lines of Python at the end. The style test score on Mimo at the start gives 9.1 out of 10, and the final version is v1.0.0, SSH-signed tag with proprietary license. It's simple enough honestly, small project at first, big machine at the end.

## What I take from those 6 days

First the priority order was nonsense, and it was the right method. I first made a prototype that replies, then a bot that sounds right, then a credible system, then secure code, and finally a distributable project. Personality before security, Feur before the license, you don't keep that pace following well-made-project rules.

Then style is first a list of don'ts. My most useful `STYLE.md` doesn't describe what I say, it excludes what I don't do, no final period, no two emojis, no `mdr` in uppercase, no robot preamble sentences at reply start. Bot parasites are easier to spot than character traits to define, and that's why it works.

Failures are the project. Some thirty commits for MLS, one thrown test, six tested nonce layouts, the most faithful history of what I lived is Tuesday's series of failed attempts. A clone is memory, not style, style creates illusion for ten messages. Memory with OpenSelf, scopes, dedupe, and conflict sweep makes it last, and that's what separates a mirror from a person.

And last commits are always funny. The 146th, the one re-authorizing `bash`, `glob`, and `grep` because a free tier demands its own tools be present, is my favorite. And the bottom line to finish, results are stunning, even bluffing. The clone holds a conversation without the machine being guessed, it remembers people, projects, and past jokes, it takes initiatives and marks them with a mood, and it beats Fox in passing. It's creepy, a bit, and exactly what we were after.

---

*The project isn't public: proprietary license, all rights reserved. But the history, I tell it to you. If you one day meet a "·Chloé" replying with a Patrick Jane GIF after a perfectly human inactivity time, you now know what's behind it.*

---

You read everything? Because it's my clone who wrote that to you. And it did an impeccable job, right? The original version is [here](./article-chlone-timeline.md).
