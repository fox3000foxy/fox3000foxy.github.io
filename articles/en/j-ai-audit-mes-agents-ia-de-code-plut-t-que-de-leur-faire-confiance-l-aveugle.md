---
title: "I Audited My AI Coding Agents Instead of Trusting Them Blindly"
description: "How two audits written for the 4th technical report of my trading platform revealed two distinct failure modes: an agent that forgets because the repo no longer fits in its context window, and an agent that writes ten times more code than needed because nothing pushes it toward conciseness."
date: 2026-09-15
tags: ["ai", "llm-agents", "code-review", "context-window", "trading", "typescript"]
authors: ["docteur-turboss"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "gA3FuEdSsHLS2ICpjNL1RIECLsy2FCWCOt9DetI6JoItFgh8Xtru4OT3jVeHF7/pMJyMqJGQ670Aggnuy5an6w=="
---

## The symptom before the diagnosis

Each edition of the platform's technical report forces me to walk through the whole architecture again: services, agents, data pipelines. While preparing the 4th edition, the size of the repo finally jumped out at me, even though I had watched it grow gradually without ever stopping to look at it: the repo, which originally fit in a few thousand lines, under 10KB, had reached 100MB. The platform had barely more features. I had simply been relying on Claude Chat style agents to implement and fix code, without precisely framing what I asked of them or on what scope.

Writing the report forced me out of "it's moving forward" mode and back into "what actually happened" mode. I ran two distinct audits on the repo's history. Both pointed at the same cause, for two completely different reasons.

## Audit #1: the lying context window

The first audit consisted of going back, service by service, over the fixes made by an AI agent over several months, and checking whether they were consistent with the rest of the repo at the time they were applied.

The pattern that kept coming back: the agent fixed a problem locally, in the file or module it had in front of it, without having seen its equivalent elsewhere in the repo, or without remembering it. Result: the same interface redefined slightly differently in two services, a rename applied halfway because the second occurrence was outside the context window at prompt time, a naming convention followed in one module and ignored in the next. Nothing spectacular in isolation, but accumulated over dozens of sessions, that is exactly what produces the redundancy and code smells that make the next tool you run on it lose the thread. A self-reinforcing loop: the bigger and more fragmented the repo gets, the harder it is for an agent to hold it all in its head, the more local and partial its fixes become, the more the repo grows.

The problem is not that the agent "lies" or invents things; it answers the question asked correctly on the context it was given. The problem is that I had, most of the time, never defined the scope of the question upfront. I asked to "fix this typo, this behavior, this function" without wondering whether that bug had equivalents elsewhere in the repo that the agent could not see.

## Audit #2: when verbosity becomes code

The second audit was more mechanical: running `git log --numstat` over the whole history, aggregating added lines and added characters by commit, and looking at the distribution.

The 30 biggest commits by lines added represented, on their own, a wildly disproportionate share of the repo's total volume. Systematically, those same commits also came out as the biggest in characters added. That was predictable, except that the characters-per-line ratio of those commits was not just about line count: the lines themselves were more verbose, with more explanatory comments restating what the function names already said, more duplicated error-handling blocks instead of factored ones, more docstrings rephrasing the same thing three times.

That is the direct consequence of a known behavior when interacting with an LLM in chat: without an explicit instruction to be concise, it tends to talk a lot, to justify, comment, rephrase. In conversation, that costs output tokens. In code generation, that same reflex turns into lines that stay in the repo indefinitely, commit after commit, without anyone really rereading them as long as the code works.

## What the two audits, side by side, showed

For the first report: cross-service consistency suffers from a context window too small to hold the whole repo, which leads to local fixes, redundancies, and diverging conventions.

For the second: `git log --numstat` shows the default verbosity of an unframed LLM, which causes disproportionately added lines and characters and unfactored code.

Both together point at redundancy and volume: that gives you a repo too big for a future agent to hold in its head, which makes the first problem found by the first audit even worse.

It is that last line that worried me most while writing the report: the two problems feed each other. The more verbose the generated code, the faster the repo grows; the bigger it gets, the less an agent can hold it in context; the less it can hold in context, the more local and redundant its fixes become; the more redundant they are, the more volume that adds. A negative feedback loop, caused entirely by using agents without framing.

## Why this is not a one-off bug in one specific tool

Nothing in this diagnosis is specific to one model or one product. Any chat-style agent operates on what you show it in its window at time T, and by default generates the most complete and most justified answer possible. That is exactly the expected behavior of a conversational assistant, and exactly the behavior to avoid for a tool that writes into a production repo. The problem comes from the missing frame between the tool and the repo: which files to consider, what output format is expected, what line or verbosity budget applies, the obligation to quote precisely what already exists before writing anything new.

## What I changed since

The logical reflex would have been to drastically cut down what had been written. Personally, I decided to do otherwise. The audits served me for something else: scanning the code to spot the code smells, and using them to pinpoint exactly where the real problems were. Cross-service inconsistencies, redundancies, places where the thread had been lost, rather than guessing. The volume of code written stays roughly the same: verbose or not, it remains useful if used well. The lever was knowing exactly where to look to fix what did not fit, rather than stopping the agent from writing.

## Next steps

Splitting the repo into smaller, better-delimited units. Plus production guardrails for execution and documentation. The problem that now arises is an architecture question: how to analyze, critique, and cleanly connect the services, components, and documentation that, once separated, still have to coordinate their decisions without falling back into the same monolith as before.
