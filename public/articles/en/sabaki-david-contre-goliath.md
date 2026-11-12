---
title: "Sabaki vs System One: David vs Goliath, the smallest decision model in the world"
description: "20KB vs 421M parameters. Sabaki drops 7 points on typed-decisions but goes from 25s CPU to under 1ms offline. Anatomy of an organizational MoE."
date: 2026-11-12
tags:
  - ai
  - system-one
  - typescript
  - cpu
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "vnLq6AlpWbI/I8FcAZBwS1Q4NoRpgJfcOWcDWD+X7o8UEcVF6Ob0m9iUbIOZZW90eWU2PAd5yG2C0qhvqkKTPQ=="
---

## Introduction

If you hang out on Hacker News or Twitter since September, you definitely saw Jev fly by.

On September 15, 2026, TypeSafe ships Jev, their first "System One". The pitch fits in one sentence: stop asking an LLM to generate JSON to pick a label. Hand it a `state` plus typed questions, it hands you back typed decisions with probabilities. One pass, zero tokens to sample, nothing to parse after.

It blew up. Record first-day adoption on Vercel AI Gateway, five Elixir customers in a few days, everybody benchmarking Jev against their own thing. And honestly the hype makes sense. For years we tinkered with `answer ONLY with {"choice": ...}` prompts while praying the model would not invent an option, break the JSON, or hallucinate a field. Jev named that need and shipped it as a clean API: `POST /v1/systemone`, `choice / score / noul` questions, answers with `probabilities` + `confidence`.

I loved the idea. The eco model, less -- and to be clear, I never paid for Jev.

Because behind it, Jev stays a closed API. Unknown weights, no self-host, every decision = a network round-trip + a meter running. And the open alternatives that followed land around 400M parameters with a mandatory GPU.

So I built the other extreme: [Sabaki](https://sabaki.fox3000foxy.com/). A keyword router + a logistic regression in pure TypeScript that speaks the same contract as Jev (same `choice / score / noul` shapes, same `/v1/systemone` endpoint), but runs in **under 1ms** with **20 kilobytes** of JSON. Zero dependencies in nano mode, offline, $0.

To put it in perspective: Laya is 843 MB of safetensors to load. OpenDecider-nano is 2 GB of RAM. Sabaki nano invoices is 20 KB. The weight ratio sits around **40,000**.

If you want the square, numbers version, there is the October 2026 v1 preprint on the site: *Sabaki: An Organizational Mixture-of-Experts for Typed Decisions on CPU* ([PDF](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf)). Design, measurements, tradeoffs, it is all there. This post is the readable version, with the open code next to it.

I did not write it in my corner in paper-benchmark mode. I contribute to [azalio/doomLaya](https://github.com/azalio/doomLaya) (my fork: [fox3000foxy/doomLaya](https://github.com/fox3000foxy/doomLaya)), a harness where Laya and Jev really play FreeDoom with model-owned decisions, per-tick telemetry and videos. I saw Goliath play for real, and as soon as the network coughs, he coughs too.

We will open the engines one by one. As usual, with the real code.

## The ring everyone agrees to fight in

There is one dataset Jev, Laya and OpenDecider all cite: [LocalLLaMA/typed-decisions](https://huggingface.co/datasets/LocalLLaMA/typed-decisions). 4 synthetic workflows (support, invoices, security, agent traces), 5 questions per case, 1200 train cases, 400 test, 2000 decisions.

| Model | Params | Test score | Latency | Where it runs |
|---|---|---|---|---|
| OpenDecider-nano | ~400M | 0.796 | 17ms GPU | GPU, 2 GB RAM |
| Laya typed-decisions | 421M | 0.766 | ~25s/state CPU, ~830ms/case MLX | GPU |
| Jev 1.13 | closed | ~0.73-0.75 | ~710ms API | API only |
| **Sabaki mini** | 22M int8 | **0.69** | **~20ms CPU** | CPU, 22 MB |
| **Sabaki nano** | ~0 | **0.61** | **<1ms** | everywhere |
| Laya base zero-shot | 421M | 0.362 | same | GPU |

Chance is 0.318, majority is 0.461. So base Laya at 0.362 with no fine-tune is "I answer at random while staying polite" level. Keep that in mind, it will matter.

7 points separate Sabaki from the best. 1000x of latency separate them the other way when you have no GPU. That is the whole post in two sentences, the rest is here so you get why.

Still, be careful: behind the same `choice / score / noul` plug, the kitchens have nothing in common. Jev = closed API. Laya = fine-tuned ModernBERT-large. OpenDecider = distilled Ettin-encoder. Sabaki = word counting + int8 MiniLM. Same contract, incomparable budgets.

## Jev, the hit everyone saw coming

Give TypeSafe what belongs to TypeSafe: the System One contract is a genuinely good idea.

Before, to triage a ticket, you did this: you asked an LLM "pick between billing, technical and spam, answer in JSON", you parsed the answer, you handled the cases where it answers "I would say billing! :)" or invents a 4th category. Every question cost tokens, every answer could break your pipeline.

Jev changes the deal: you send the text + questions with their criteria, it scores each question in parallel and hands you a typed value with its distribution.

```bash
curl https://api.typesafe.ai/v1/systemone \
 -H "Authorization: Bearer $KEY" \
 -H 'content-type: application/json' \
 -d '{"state":"charge double ce mois-ci","questions":{"dept":{"type":"choice","instructions":"Route ce message.","criteria":{"billing":"paiements","technical":"bugs"}}}}}'
```

Answer: `{ choice, probabilities, confidence }`. No free text. Your code can branch on it directly.

That is why it went viral: Python + JS SDK, Claude Code plugin, LangChain integration, everybody could plug their agents into it in an afternoon. The TypeSafe docs even push the healthy pattern: Jev for fast little judgments, deterministic code around it to compose the real decision, slow LLM or human as soon as confidence runs low.

The problem is everything else. Closed weights, offline impossible, per-call pricing. For an agent making 100 decisions per run, the tax stings. For Doom at 35 ticks/s, it is dead: in doomLaya, Jev clears MAP01 seed 48 in 68.97s with an HTTP p50 of 357ms. The run reports $0.0046 in API cost -- not my bill, the benchmark's. It works, the run is clean, no death. But 357ms at 35 ticks/s means 12 ticks where the game keeps going while you wait on the network.

Sabaki stole exactly that contract -- same questions, same answers, same `/v1/systemone` endpoint served by `serve()` -- while dropping everything that needs a datacenter.

## Laya, the big open one that proved you could do it without an API

[Laya](https://github.com/NandhaKishorM/laya) by Convai Innovations, Apache-2.0. Under the hood: ModernBERT-large, 421M, with 1 `[MASK]` token per option. The hidden state of each marker goes through a small MLP, softmax over the question options. One pass per question, like Jev.

```python
pipe = pipeline("text-classification", model="convaiinnovations/laya-typed-decisions")
```

The 0.766 deserves a pause. It is the checkpoint **fine-tuned on the benchmark train set**: 1200 cases, RLCD with gaussian noise on the logits, log + spherical reward. The same model without that fit drops to 0.362. In other words, it guesses. So the Laya score means "big encoder + training on the domain", not "magic big encoder".

On CPU, it is a brick. The measured ONNX port runs around 25s per state. In MLX FP16, count 830ms per case on average with a p99 at 5.3s. And you have to load 843 MB before you answer anything.

In doomLaya, stock Laya fails MAP01 in 180s. The adapted v3 ([azalio/laya-doom-v3](https://huggingface.co/azalio/laya-doom-v3)), retrained on Doom, clears it in 61.43s with a 108ms p50 on MPS, grabbing the shotgun on the way. So yes, it plays -- after dedicated training, on an Apple GPU, with a scripted executor doing the real work (A*, doors with a 15-tick latch, auto-aim).

My summary: with no training on your task, Laya is a 421M clipboard for you. With it, it is very strong, but you need the GPU and the data to go with it.

## OpenDecider, the one that won the leaderboard

[OpenDecider](https://github.com/manjunathshiva/opendecider) is Manjunath deciding to come after everybody on their own benchmark. Result: **0.796** with a fully fine-tuned Ettin-encoder-400m + MLP head, KL loss on soft targets distilled from Qwen3-235B + DeepSeek.

```bash
pip install opendecider
# 17ms/question on L40S, 18ms on M4 Max, ~9ms batched
```

At 50% coverage, selective accuracy climbs to 0.943 vs 0.882 for Jev. On paper, the best of both worlds: open, calibrated, fast.

In practice: 2 GB of RAM to load nano, GPU required to hold the 17ms, phishing at 0.63 vs 0.90 for Jev (OOD wipes it out), and like Laya, trained on the benchmark train set. The test was never seen, but the domain was.

It wins the arm-wrestling match, but it is still 400M with a GPU behind it. You do not stuff it into a Cloudflare Worker or a game loop on a laptop.

## The 150Ms, and the gap below

openJev-verdict-2.0 (151M), julia-1 (144M multilingual), Open Jev (150M), Largha-150M (144M en+zh), Vela (0.3B-9B). All ModernBERT or mmBERT-small, all able to run on CPU, all fun to train (Open Jev claims 30min on a Colab T4). Self-reported numbers, different protocols, so take them with a grain of salt, but the family exists.

The Sabaki generalist is **22.7M**. About 6.5x smaller than the smallest of that bunch. Nobody else goes under 100M to answer runtime-defined questions.

That is the "smallest in the world" bit: not the best score, the smallest envelope that reads your `instructions` + `criteria` and decides when no specialist knows the answer.

## Sabaki, the dumb router and its disposable experts

OK, enough about the big guys. Let us get to David, because that is where it gets fun.

Sabaki does not try to be a big smart model that understands the world. It is an organizational MoE: 1 sparse router at system level, independent experts, one active per input. Each plugin is a separate npm package, with its manifest, its weights, its version. You only install what you route to.

The [sabaki-js](https://github.com/sabaki-js) org: 13 repos, the `sabaki` core (129 commits), 6 `@sabaki-js/*` plugins, the weights, the Cloudflare worker, the template to write your own.

The core `package.json` already tells the story:

```json
"dependencies": { "@typesafe-ai/sdk": "^0.7.0" },
"optionalDependencies": { "onnxruntime-node": "^1.22.0" }
```

In nano mode, zero runtime dependencies. Just compiled TypeScript, nothing to install, nothing that can break between two ONNX versions.

### The router, or how to decide in a few lines

The router lives in `src/index.ts`, and tokenization looks like this (`src/index.ts:129`):

```ts
function tokens(s: string): string[] {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/).filter((w) => w.length > 3);
}
```

Lowercase, accents stripped, 4-letter minimum words. That filter kills all the noise ("the", "and", "ok"). On support tickets, it changes everything because your matching runs on words that actually mean something.

Scoring itself sits in `route()` (`src/index.ts:251`), and that is where it all plays out:

```ts
const hits = kws.filter((k) =>
  words.some((w) => w.includes(k) || k.includes(w))).length;
const score = hits / Math.sqrt(kws.length);
```

Loose matching both ways: `billing` catches `billed`, `invoice` catches `invoicing`. Dividing by the square root avoids punishing big keyword lists, otherwise the mail plugin with its 600 words would crush everybody as soon as a mail contains "hello".

Each plugin has its threshold, default 0.15 stored in `src/index.ts:139`, mail at 0.03 because subjects are short. Below:

```ts
return { domain: "unknown", decision: null, confidence: 0, plugin: null };
```

Unknown domain = `unknown`, never an invented guess to please you. That is dumb on purpose, and that is exactly what makes the `automate > 0.8` thresholding usable later: when Sabaki answers, it means a specialist really matched.

There is a bonus language axis via `langid`: a plugin declaring `languages` only competes for those languages. Handy to split latin vs CJK phishing. Text too short = no filter, everybody competes.

Total cost: a few microseconds per decision. No matrix to multiply, no network to call, just string comparisons and one division.

### Nano, my favorite file in the repo

`src/logreg.ts:28`, tokenization:

```ts
function tokens(s: string): string[] {
  const words = s.toLowerCase().split(/[^a-z0-9]+/)
    .filter((w) => /^[a-z]{3,}$/.test(w));
  const out = [...words];
  for (let i = 0; i < words.length - 1; i++)
    out.push(`${words[i]} ${words[i + 1]}`);
  return out;
}
```

Unigrams + bigrams. `charged twice` gives `charged`, `twice`, and the `charged twice` pair. That is all you need to catch "double billing" without pulling out a 400M transformer.

`src/logreg.ts:46`, vectorization, where TF-IDF does its job:

```ts
const tf = 1 + Math.log(c);  // sublinear TF
const val = tf * w.idf[i]!;  // sklearn-style smooth IDF
```

The 10th occurrence of a word counts less than the first, rare words weigh more than "please". Exactly the sklearn recipe, exact parity checked on 20 questions.

And the comment that made me smile while rereading:

```ts
// Only touch present (sparse) terms instead of scanning 3000 dims.
for (const [t, c] of counts) {
```

Instead of scanning 3000 dimensions per ticket, you only touch the twenty-ish words present. That is why it answers in under 1ms. The kind of invisible detail that changes everything in prod, because complexity follows ticket size, not vocabulary size.

`src/logreg.ts:86`, inference, in three lines:

```ts
// binary: 1 coef row + sigmoid
const pPos = 1 / (1 + Math.exp(-s));
// multiclass: dot product + softmax, argmax
```

One dot product, one sigmoid or softmax depending on class count. One pass and you are done. Zero tokens generated, so zero broken JSON to patch up behind you with retries and parsing heuristics.

`train.py` recipe: 300 train / 100 test per workflow, deterministic split (1 item in 5 in test to avoid temporal bias), 3000-6000 vocab, coefs rounded to 1e-4 with zero measured loss. JSON export `{ vocab, idf, questions }`.

Weights: 20 KB for invoices (`duplicate` 0.89) to 650 KB for mail (`bucket` 0.889). The kind of size that fits in a frontend bundle.

The detail that floored me: on mail, MiniLM ties TF-IDF within +/-0.02. So nano ships as is. Paying for a GPU to triage mail, no thanks. Agent_trace sticks instead (`needs_review` 0.59 in nano): observability text is thin, no word really carries the decision.

The factory turning weights into a plugin, in `src/plugin.ts:52`:

```ts
export function nanoClassifier(manifest, weights, opts = {}) {
  return definePlugin({ manifest,
    classify: (input) => {
      const r = predict(`${from}${input.state}`, weights, q);
      return { decision: r.decision, confidence: r.confidence, domain: manifest.domain };
    }});
}
```

`decide()` stays sync nano, `decideAsync()` unlocks ONNX for mini. Two paths, one simple rule: if you need async it means you want mini, otherwise nano is enough. Easy to remember when you code, easy to debug when it breaks.

To show you this is not just theory, here is what real usage looks like:

```ts
import { Sabaki } from "sabaki";
import customerService from "@sabaki-js/customer-service";

const sabaki = new Sabaki().register(customerService);
sabaki.decide({ state: "charged twice, refund please" });
// { decision: "billing", confidence: 0.31, domain: "customer_service" }
```

### Mini, 22 MB that change everything on hard cases

Nano has limits, you saw it on agent_trace right above. MiniLM-L6 picks up the torch: one shared encoder for the whole domain, plus one linear head per question. End-to-end fine-tune over 8-12 epochs, lr 2e-5, on CUDA GPU for training (inference stays CPU, that is what counts).

The numbers that settled it, measured on the same splits:
- frozen encoder + MLP: 0.65
- full fine-tune: 0.68
- 400M distillation to frozen embeddings: tried, tossed, worse than gold labels

ONNX export via dynamo, exact parity checked, then int8 dynamic quant: 90 MB -> 22 MB, **-0.004 accuracy** on customer_service. ECE unchanged or better. Every export gets re-measured, otherwise the optimization means nothing.

Since 1.0.2, weights ship inside the package (`models/<workflow>-int8/` + exported `modelDir`). `npm i` is enough, airplane mode OK. Updating = publishing a patch, signed via trusted publishing.

Concrete: `needs_review` goes from 0.59 to **0.82**. `disposition` 0.73 -> 0.76. ECE < 0.14 everywhere, with healthy OOD doubt (0.2-0.5 on dragons, recipes and empty strings). That doubt is what allows aggressive thresholding in prod.

### Generalist, the catch-all that makes Sabaki truly System One

Jev and the others answer everything: any question, any options, defined at runtime. That is the System One contract that made Jev viral -- you drop your `instructions` + `criteria` with your options, it decides.

Sabaki specialists cannot do that. They know their questions (`category`, `duplicate`, `bucket`) and nothing else. With no safety net, Sabaki would return `unknown` as soon as you go off script, where Jev always answers something.

The generalist is that net. A cross-encoder reading question + option + state and outputting a score, one pass per option, softmax, argmax. 22.7M int8 MiniLM -- 6.5x smaller than the 144-151M crowd. But its job is not score, it is compatibility: with it plugged in as fallback, `POST /v1/systemone` accepts any state and any questions, like Jev. The `model` field says who really answered (`@sabaki-js/mail@1.1.2+mini`, `sabaki-generalist-v1`...), so on the caller side you change nothing.

And most of all, it is a fallback, not a boss. Golden rule in `decideAsync()`: if a specialist wins routing, it answers. The generalist only speaks on `unknown`. Never the reverse. That keeps an average generalist from stomping a good specialist on its own turf.

The loader lives in `src/generalist.ts`, with a per-folder cache so you do not reload the ONNX session on every call:

```ts
export function loadGeneralist(modelDir: string) {
  // cache per folder, ONNX session reused
  // tokenizer.json -> Unigram or wordpiece, auto-detected
  const sess = await ort.InferenceSession.create(
    path.join(modelDir, "generalist.onnx"),
    { intraOpNumThreads: 2 },
  );
}
```

You point `SABAKI_GENERALIST_DIR` at a folder with `generalist.onnx` + `tokenizer/`, the model is swappable. The id comes from `config.json`, otherwise `"sabaki-generalist"`. The `Map` cache avoids reloading the session on every call.

The input format is classic cross-encoder: question, option and state concatenated with separators, one line per option to score:

```ts
const texts = options.map(
  (o) => `${input.question ?? "decision"} [SEP] ${o} [SEP] ${input.state}`,
);
```

Question + option + state, separated by `[SEP]`, one line per option. Options capped at 8 (`slice(0, 8)`), default `["yes", "no"]` if you give nothing. Beyond that, split on the caller side -- 8 is already wide for a typed decision.

Then comes the smart batch, the kind of optimization that looks modest but divides latency by the option count. Instead of one `session.run` per option, everything goes in a single forward:

```ts
// A single batched forward for all options
// (padded to max length) instead of one run per option.
const L = Math.max(...encs.map((e) => e.ids.length));
// ids + attention_mask in [options.length, L], padding with padId
const out = await sess.run({ input_ids, attention_mask });
const scores = Array.from(out["score"].data).map(Number);
```

Each text gets encoded (BERT-style wordpiece or SentencePiece unigram depending on `tokenizer.json`), padded to the batch max length, stacked into an `[nb_options, L]` tensor. One `sess.run`, you get one score per option. On CPU that changes everything: 20-36ms instead of 8x that time.

Then softmax + argmax, with full probabilities for each option, exactly in the format Jev made popular:

```ts
const pr = softmax(scores);
// bi = index of the max
const confidence = Math.round(pr[bi] * 1000) / 1000;
const probs = Object.fromEntries(
  options.map((o, i) => [o, Math.round(pr[i] * 1000) / 1000]),
);
```

And the detail that makes it usable in prod instead of a demo, `abstainAt`:

```ts
if (input.abstainAt !== undefined && confidence < input.abstainAt) {
  return { decision: null, confidence, domain: "generalist", probabilities: probs };
}
```

Opt-in, no abstention by default. You pass `abstainAt: 0.6-0.7` and everything soft comes back `null` instead of a guess. Since softmax spits out 1.00 even when it is wrong out-of-distribution, you need it. The GUIDE recommends it for any autonomous use: below threshold, you ask for clarification instead of self-resolving.

To finish, here is the same setup with the generalist fallback: when no specialist matches, it takes over instead of returning `unknown`.

```ts
import { Sabaki, definePlugin, loadGeneralist } from "sabaki";
import mail from "@sabaki-js/mail";

const backend = loadGeneralist(process.env.SABAKI_GENERALIST_DIR!);
const generalist = definePlugin({
  manifest: { name: "@sabaki-js/generalist", domain: "generalist",
    version: "0.1.0", questions: ["decision"], keywords: [] },
  classify: (input) => backend.decide(input),
});

const sabaki = new Sabaki().register(mail).setFallback(generalist);

await sabaki.decideAsync({
  state: "le client dit que l'app a supprimé ses données",
  question: "c'est urgent ?",
  options: ["yes", "no"],
  abstainAt: 0.65,
});
// mail specialist if routing matches, otherwise generalist as Jev-style catch-all
```

Generalist generations, all measured the same on PhishNChips (2000 mails) and on the typed-decisions test to compare like with like:
- v4: 0.29 test, R=0.026 phishing. Toss it, it answered beside the point.
- A (22M 80k): 0.546, R=0.406. Starting to look like something.
- mini v1 served: **0.536, R=0.616**. The one running on the site. Decent phishing recall, average test.
- B (144M scratch): 0.568, R=0.062. Bigger, barely better on test, useless on phishing.

The 144M from scratch that does not transfer better really cooled me on the "throw more params to generalize" idea. At equal task, big costs more without guessing better. Even as a catch-all, small does the job. And it stays EN-only (`all-MiniLM-L6-v2`), EN routing, FR out-of-distribution. For FR, go through a specialist trained on it, not the generalist.

## Doom, the only test that really matters to me

doomLaya is Laya and Jev really playing FreeDoom. The model picks `command / target / weapon`, the executor traces the A* path, opens doors, aims, clicks. Per-tick telemetry, videos, run SHAs. I contribute to it, so I am not talking about a leaderboard read from far away.

v0.1.0, MAP01 seed 48, skill 3, 35 ticks/s, same executor:

| Model | Result | p50 HTTP | API cost |
|---|---|---|---|
| Laya stock | fail 180s | 106ms | $0 |
| Laya v3 adapted | exit 61.43s | 108ms | $0 |
| Jev 1.13 | exit 68.97s | 357ms | $0.0046 |

Two clean exits, no death, with Laya grabbing the shotgun on the way because the executor handles pickup by itself. Honesty first: Laya v3 was trained on Doom, Jev was not. One seed, one map, it proves nothing general. The project README says it in black and white, and to its credit it does not oversell the result.

Sabaki side ([plugin-doom](https://github.com/sabaki-js/plugin-doom)): Python ViZDoom calling a JS server every tick. Nano ~18k req/s, mini ~71 req/s on one i5 thread. The 35Hz tick clears easily, even on an average laptop.

With an exit compass, mini clears MAP01 in 2-4 runs out of 6, nano 0/6. Makes sense: text loses space, doomLaya states cap around 0.57 whether MiniLM or ModernBERT-base. When spatial info is missing, no text classifier reinvents it.

Neighbors reran the match with equal data: [doomgemma](https://github.com/dexmac221/doomgemma) sticks a 27min LoRA on an RTX 4070 and brings Gemma 4 E2B to Laya v3 level in game (6/6 vs 6/6) and above on isolated decisions. At equal size, a decoder runs as fast as Laya (270M: 22ms vs 23ms). At equal result, Laya stays ~3x faster because it gets there with a smaller model.

My take: training on the task matters more than architecture. A small trained specialist beats a big generalist discovering it. Exactly the Sabaki bet. The follow-up paper, *System Switch* ([arXiv:2610.09683](https://arxiv.org/abs/2610.09683)), pushes the logic all the way: fast small model playing, big reasoning model taking back over when a gate opens. Sabaki pre-triage (`automate > 0.85 else escalate`) applied to the game.

## What got sacrificed

Every missing feature funds another one, that is the rule when you target CPU. The honest list, like for Bareiron where every line of C was a tradeoff:

**Sabaki tells no stories.** It picks between options you give it, with a probability. For an explanation, a summary, free text, grab an LLM.

**French stays out-of-distribution for the generalist.** EN routing (`all-MiniLM-L6-v2`), 1/4 FR vs 3/4 EN probe on similar cases. The mail plugin comes from a mostly FR shop but anonymized: 0 PII, -0.024 accuracy for a vocab with no personal terms. Anonymization costs, but it was non-negotiable.

**Softmax acts too sure outside its zone.** Some 1.00 misses observed, yes. Hence the pre-triage recommended in the GUIDE: `abstainAt: 0.6-0.7` to return `null` under threshold, then `confidence > 0.85` gate to automate, human otherwise. Measured reference: 0.62 phishing recall at 0.87 precision. Enough to cut the queue in half, not enough to fire reviewers.

**Nano struggles on agent traces.** 0.34 to 0.59 depending on the question. Mini lifts `needs_review` to 0.82, but `risk / urgency / action` stay hard. Observability text is just poor in lexical signals.

**Text Doom caps out.** Around 0.57, MiniLM like ModernBERT-base. As long as you stay on text with no pixels, MAP02 blocks you. The credible path to a real player is vision + RL (tiny-doom-defender, 1.1M params from pixels), not a better text classifier.

**The benchmark drifts by batches.** typed-decisions is generated in batches, the temporal split is really a batch split. `drift_tool.py` outputs 0.82 on customer_service, 0.67 on agent_trace (0.5 = indistinguishable). Measured consequence: published weights score 0.733 mixed vs 0.61 on the official split. So the official number is conservative. Platt / temperature+bias calibration does not transfer across batches, so we only ship temperature scaling calibrated on recent batches. House rule: `drift_tool.py` first, warn above 0.6, block above 0.8. Nobody else publishes that, everybody should.

## The final result, numbers in hand

On one side a laptop i5, on the other an API billing per call. Here is what each mode gives you in practice:

- nano: <1ms, ~18k req/s, 20-650 KB, 0 dep
- mini: ~20ms, ~71 req/s, 22 MB int8, optional onnxruntime
- generalist: 20-36ms, 22.7M, the smallest open generalist I know

Several loaded domains: ~0.5 GB RAM in lazy-load per domain instead of ~2 GB for everything. Deterministic: 100/100 identical inputs give the same output. Per-question thresholds, gate on `confidence`, `unknown` when nothing matches.

On Bareiron, running 3+ players lagged because each player cost a 200ms chunk. Here running 3+ domains passes without flinching, because each expert is tiny and loaded on demand instead of loading everything at once. Same "small is enough" philosophy, applied to different hardware.

## The philosophy

p2r3 said: *"I just love the idea that this tiny 1-buck chip can run something as advanced as Minecraft."*

Same trip here: I love the idea that 20 KB of JSON and a hundred lines of TS replace a GPU call to pick a label. It obviously does not replace everything, do not kid yourself. It replaces the annoying case where you want a label in milliseconds, locally, with a confidence you can reasonably threshold instead of crossing your fingers.

Tradeoffs, written in black and white:
- encoder -> word counting: 7 points down, latency divided by 1000, zero infra
- single big model -> npm plugins: coarser gate, infinitely simpler ops
- generation -> typed decision: done with breaking parsing and invented options
- raw confidence -> pre-triage: abstain first, automation above 0.85, human for the rest

**The 3 things to remember:**

1. **7 points down, 1000x faster** -- 0.61/0.69 vs 0.75-0.80, but <1ms/20ms CPU offline vs 25s CPU or paid API. A score with no cost means nothing.
2. **Simple router + separate experts** -- `hits / sqrt(keywords)`, threshold, `unknown`. Each plugin trains, versions and ships alone. On mail, TF-IDF ties MiniLM: the GPU is useless here.
3. **Offline-first with honest calibration** -- `npm i`, bundled weights, 0 GPU, ECE < 0.14, abstain, drift tool. The only stack in the comparison holding a 35Hz game loop with no GPU.

If the project interests you, everything is MIT on [github.com/sabaki-js](https://github.com/sabaki-js). The academic version with measurements and bibtex is the [v1 preprint](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf). And if you want to see Goliath really play Doom, head to [azalio/doomLaya](https://github.com/azalio/doomLaya) xD
