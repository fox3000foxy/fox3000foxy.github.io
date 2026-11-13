---
title: "PiperHub: 536 open source TTS voices, 7 emotions in one model, zero GPU, zero bill"
description: "VITS, espeak, ONNX, LJSpeech: how Piper makes a Raspberry Pi talk. Multi-emotion Fortune in 7 emotions, Kokoro 82M, PocketTTS, sanoTTS, ElevenLabs, plus native pipertts 10x faster than the Python wrapper."
date: 2026-11-12
tags:
  - tts
  - piper
  - open-source
  - typescript
  - ai
  - catalogue
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "RCB3y6TxBtqdG9/EIaNkM8BMNWVxnLFs7tpMVtBpu6cBnldrDV+aSw+qvJHMDklOX/e9mv5anDGqrKwzcifh2A=="
---

## Introduction

Making a Discord bot talk is expensive. Not the text: a local LLM generates sentences for a few cents of GPU. The voice is billed on every sentence. Synthesis APIs charge per character, and when the bot talks all night, the bill follows.

That is the problem I had with Luna Protocol. My Discord bot generates its messages with a local LLM, then has them read aloud by a Piper voice, converts to OGG, and sends them as voice messages. All on my own server, for 0 euros per sentence, even at 3am when Luna decides to tell her life story on her own.

Staying at 0 euros means finding free voices and hosting them yourself. And that is where it got complicated: models scattered across dozens of Hugging Face repos, unclear licenses, no way to know where a given voice comes from or if it still works. So I built [PiperHub](https://piperhub.org/), an open source catalog of voices for Piper TTS.

Today's numbers: **536 models** listed, **71 languages** covered, **3755 speakers** listed. Every model is linked to its source dataset when I know it. Provenance is part of the sound, as the homepage says.

One question I get asked a lot remains: how does Piper compare against Kokoro, PocketTTS, sanoTTS and ElevenLabs? And why is the `pipertts` module from Fortune 10x faster than the official Python wrapper? This article opens up the engines, with code to back it up.

## PiperHub, the catalog

Before opening the engines, let us look at the problem PiperHub solves.

### Where the voices come from

The code is on [github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank). Astro, static site, zero server: English at the root, 15 other locales under `/<code>/` (fr, de, es, it, pt, ru, tr, ja, ko, zh, id, hi, ar, vi, th). Same pattern as my blog, actually.

Nobody edits the source of truth by hand. It is a pipeline:

```bash
npm install
npm run data    # regenerates src/data/*.json (python3 scripts/generate_data.py)
npx astro dev   # local dev
npm run build   # static build into dist/
```

Concretely: a crawler repo maintains `models_mapping.csv` and `datasets_mapping.csv`, mirrored voices live on Hugging Face, samples are audio files. `npm run data` pulls all of that and spits out `src/data/*.json`. The site only reads static JSON.

In the current raw data (555 entries, the site shows 536, the crawl is always a bit ahead of the display):

| Quality | Models |
|---|---|
| medium | 437 |
| high | 67 |
| low | 50 |

| Sample rate | Models |
|---|---|
| 22050 Hz | 486 |
| 16000 Hz | 47 |

486 voices at 22050 Hz, the Piper standard. 47 at 16000 Hz, the small fast voices for embedded. The phonemizer is `espeak` in 509 cases. I will come back to that, it is the heart of the system.

### Provenance, or why every model has a dataset

The thing that makes PiperHub useful instead of just a list is the model <-> dataset link. Example taken from the home page: the voice **Astra - Valorant Piper TTS** is linked to the dataset **Astra - LJSpeech Dataset**. You open both pages, you check the repos and licenses on each side.

130 datasets referenced. And the catalog is honest about the state of the troops: 25 models are flagged `usable: false` (broken files, or `piperPlus` format that needs a forked runtime). The `pipertts` module rejects these voices with an explicit error instead of crashing weirdly later. 48 models are multi-speaker, including the two we will care about.

For guides, the site does the job in three steps: **Build a dataset**, **Train a voice**, **Use a voice**, plus a Piper Plus page. LJSpeech-format dataset as input, ONNX as output. Simple to say, long to do, hence the next section.

## Piper under the hood: VITS, espeak, ONNX

### One sentence, three steps

When you ask Piper to say "bonjour", this happens:

```
"bonjour"
  -> [phonémisation espeak-ng] -> b O~ Z u R
  -> [encodeur VITS + flow + décodeur] -> waveform 22050 Hz
```

Zero separate vocoder. That is VITS: an end-to-end model that goes straight from (phonemized) text to waveform. Where old pipelines did text -> spectrogram (Tacotron) then spectrogram -> audio (HiFi-GAN, two models, two trainings), VITS learns everything at once with a conditional VAE, normalizing flows and a GAN-style discriminator on the decoder. One training, one model, one ONNX export.

The decoder outputs 22050 Hz directly. At that sample rate, one second of speech equals 22050 numbers. The model is small (a few dozen MB in medium quality) and inference is pure CPU: matrix multiplications on an optimized ONNX graph. Hence the Raspberry Pi as an official target. Piper was born in Rhasspy, an open source voice assistant built to run on Pi.

### espeak-ng, the phonemizer that does all the dirty work

Before VITS, you have to turn text into phonemes. 509 models out of 555 use `espeak`:

```bash
echo "bonjour" | espeak-ng --ipa -v fr
# bO~'ZuR
```

espeak-ng knows the pronunciation of dozens of languages. The VITS model never learns French spelling with its `eau` pronounced `o`. It learns phonemes to sound. That simplifies training enormously and explains why Piper covers 71 languages: for a new language, you plug in the matching espeak voice and you train.

The ones that skip espeak have their own phonemizer, and that is where it gets exotic: `hebrew` (Nakdimon ONNX + 494 lines of IPA rules), `pinyin` (full BERT g2pW with polyphone disambiguation, the same Chinese character is pronounced differently depending on the word), `thai` (real unmodified TLTK), `japanese` (lindera segmentation + UniDic). The `pipertts` module ships all seven, verified identical to the Python reference. I will come back to that.

### The dataset: LJSpeech, always LJSpeech

The standard training format is LJSpeech: a `wavs/` folder full of clips, plus a `metadata.csv`:

```
LJ001-0001|Printing, in the only sense with which we are at present concerned...|printing in the only sense...
LJ001-0002|in being comparatively modern...|in being comparatively modern...
```

`fileid|transcription|normalized`, one clip equals one sentence, a few seconds. The original dataset is 13,000 English sentences read by a single speaker, public domain. To train a French voice, you record the same structure in French: aligned text + audio, a few hours are enough for decent medium, more for high.

The three catalog qualities roughly match model size + training time. Low: small, fast, robotic. Medium: the sweet spot, with 437 models. High: bigger, slower, more natural, 67 models, including the Fortunes.

### The three magic knobs

Every Piper voice exposes three inference parameters, with almost universal defaults:

```json
"inference": { "noise_scale": 0.667, "length_scale": 1, "noise_w": 0.8 }
```

- `noise_scale` (0.667): voice variability. Higher means more expressive, lower means more stable. Output is stochastic: two syntheses of the same sentence give two slightly different audios.
- `noise_w` (0.8): timing variability, the rhythm.
- `length_scale` (1.0): speed. Above 1 it slows down, below it speeds up. The simplest way to make Luna talk faster when she gets excited.

Remember `noise_scale`, it will matter for emotions.

## Fortune multi: 7 emotions, 1 single ONNX

Alright, let us move to the local star.

The catalog lists three Fortune models trained by ItsRealFortune (hi):

| Model | Repo | Voices |
|---|---|---|
| ItsRealFortune - French (FR) High | `fox3000foxy/piper-fortune-v6` | 1 (voice-0) |
| ItsRealFortune - French (FR) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-fr-multi` | **7** |
| ItsRealFortune - English (EN) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-en-multi` | **7** |

The FR multi is this:

```
normal, joyeuse, storytelling, colere, triste, surprise, interrogative
```

Seven emotional variations in **a single ONNX file**. Same for the EN multi, with a historic typo in the names: `suprised` instead of `surprised`. It is in the weights, I keep it, it is part of the folklore.

### How does a speakerId work?

Multi-speaker VITS is the same model with one extra input: a speaker embedding. At training time, each clip is tagged with its style, the model learns an embedding table (one per style) along with the rest. At inference time, you pick the row of the table:

```ts
import { PiperNativeTTS } from "pipertts";

const tts = await PiperNativeTTS.load({
  model: "hub:itsrealfortune-french-fr-multi-high",
  modelsDir: "./models",
});

const styles = [
  "normal", "joyeuse", "storytelling",
  "colere", "triste", "surprise", "interrogative",
];

for (let i = 0; i < styles.length; i++) {
  const r = await tts.synthesize("Quelle merveilleuse nouvelle !", {
    speakerId: i,           // 0 = normal ... 5 = surprise
    outputFile: `./fortune-${styles[i]}.wav`,
  });
}
```

Same sentence, seven readings. `speakerId: 5` (surprise) with a slightly boosted `noise_scale`, and you get a believable exclamation. `speakerId: 4` (triste), `length_scale: 1.1` to slow down, and you get a funeral announcement. That is how Luna modulates her voice: the brain picks the emotion (valence/arousal, see my article on centroids), the TTS picks the speakerId.

The dataset behind it is soberly called **Fortune French - Dataset**, with a license named "Fortune's Café". Yes, the license is named like a coffee shop. No, it stays.

### Why it is smart economically

Seven emotions equal one download, one load into RAM, one ONNX session. The alternative (seven separate models) would multiply storage and force a graph reload on every emotion switch, unusable for a bot that changes tone mid-sentence. Here, `speakerId` is just an index into a tensor. Marginal cost: zero.

## The competitors: Kokoro, PocketTTS, sanoTTS

Piper shares the CPU with three serious challengers, three different philosophies.

### Kokoro 82M, the quality/price king

[Kokoro](https://huggingface.co/hexgrad/Kokoro-82M), by hexgrad. 82 million parameters, modified StyleTTS 2 architecture with ISTFTNet decoder, **with no diffusion step**. The lack of diffusion is what does it: no iterative denoising loop, so ultra fast inference.

| | Kokoro-82M |
|---|---|
| Params | 82M |
| Weights | ~300 MB (164 MB in FP16) |
| License | Apache 2.0 (commercial OK) |
| Languages | 8, 54 preset voices + blending |
| CPU | near real time |
| GPU | 36 to 96x real time |
| Blind tests | at Google and Amazon level |

Trained on under 100h of audio for about 1000 dollars, and blind listeners rank it at the level of premium Google and Amazon voices. That is why it blew up: premium quality, free, local, permissive.

Against Piper: Kokoro wins on pure naturalness (StyleTTS 2 > small VITS) and license (Apache 2.0 vs GPL-3.0 engine for Piper). Piper wins on coverage (71 languages vs 8, 3755 speakers vs 54 voices) and the community voice ecosystem. For English narration, Kokoro is hard to beat. For French with 7 emotions, Turkish or Swahili, Piper is often the only one in the race.

### PocketTTS (Kyutai), cloning on CPU

[Kyutai](https://kyutai.org/tts/) plays a different tune: a small model **with voice cloning** that runs on CPU.

| Model | Params | WER | UTMOS | SIM | CPU speed (1 thread) |
|---|---|---|---|---|---|
| Pocket TTS | ~100M | 0.92% | 4.364 | 0.923 | 2.8x real time |
| Pocket TTS small | 1.9M / 6.9M / 18.2M | - | - | - | CPU, cloning included |

Sub 1% WER (it pronounces correctly), UTMOS 4.36 (excellent perceived quality), SIM 0.923 (the clone really sounds like the target). And the small versions go down to **1.9M parameters** with cloning. 1.9M. My Sabaki router is almost that size in JSON.

Against Piper: PocketTTS wins on cloning (Piper reads with fixed voices) and flagship compactness. Piper wins on languages (the small is English-only for now) and ecosystem maturity (536 ready voices vs "train your own").

### sanoTTS, the model that fits on a 3 dollar chip

[sanoTTS](https://github.com/ampixa/sanoTTS) (`sano` means "small" in Nepali), it is the Bareiron of TTS: a full neural stack that goes from phonemes to 22.05 kHz PCM **on microcontroller**.

| System | Params | SCOREQ | UTMOS | DNS-SIG |
|---|---|---|---|---|
| sanoTTS (heart-nano) | 0.29M | 2.29 | 2.45 | 3.35 |
| TinyTTS | 1.62M | 3.94 | 3.65 | 3.62 |

0.29M parameters. 2 MB per voice. `pip install sanotts`, `sanotts say "Hello" --voice amy`, it talks. In the browser too.

But look at the scores: SCOREQ 2.29 vs 3.94 for TinyTTS, UTMOS 2.45. It talks, yes. It sings, no. It is the ultimate tradeoff: at 0.29M you fit everywhere but quality follows size. Piper medium is 100x more weights for a voice in another league.

### The summary table

| | Piper | Kokoro 82M | PocketTTS | sanoTTS |
|---|---|---|---|---|
| Typical params | ~10-60M | 82M | ~100M / 2-18M | 0.3-1.4M |
| Languages | 71 | 8 | EN (+ smalls EN) | multilingual, small |
| Voices available | 3755 speakers | 54 + blending | cloning (yours) | a few voices |
| Cloning | no | no (native) | **yes, CPU** | no |
| Engine license | GPL-3.0 | Apache 2.0 | open (Kyutai) | open |
| Trainable at home | yes (LJSpeech) | yes (heavier) | yes | yes |
| FR quality | good (multi emotion) | fair (EN-first) | EN-only | weak |

Your pick depends on your constraint, there is no absolute winner: pure EN quality -> Kokoro. CPU cloning -> PocketTTS. Microcontroller -> sanoTTS. Language coverage + emotional French voices + zero infra -> Piper.

## ElevenLabs, the billed Goliath

And then there is ElevenLabs. 70+ languages, expressive Eleven v3 with audio tags and dramatic dialogues, top quality in blind tests. The Jev of TTS, in a way: everybody has seen it go by, everybody has benchmarked against it.

2026 pricing, in round numbers:

| API model | Price / 1000 characters |
|---|---|
| Flash / Turbo, v3 Conversational | $0.05 |
| Multilingual v2, Eleven v3 | $0.10 |

1000 characters make about 1 minute of audio. So $0.05 to $0.10 per minute. The $99 Pro plan includes about 990k characters, overage hits at the same rate. For a YouTube channel shipping one voiced video per day (my `valorant-short-maker` does exactly that, but with free Piper), count $1.50 to $3 per month for each daily minute of voiceover. Ten minutes per day: $15 to $30/month. You can pay it, but you count it.

When it is worth it: when the voice **is** the product (dubbing, audiobook, ad), when you need 70 languages tomorrow morning, when cloning has to be perfect on the first try. But it is never worth it for: a Discord bot that talks all night, internal notifications, dev, exploding volumes. Luna telling her life story at 3am on ElevenLabs is my power bill crying.

The math is simple: Piper = 0 euros marginal, "good" quality. ElevenLabs = meter running, "excellent" quality. In between, there is a world where "good and free" wins. That is the whole PiperHub bet.

## pipertts: why native beats the Python wrapper by 10x

The repo [itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts), 75 commits: a native port of Piper in TypeScript. README title: "In-process Piper TTS for Node.js. No Python required."

### The cost of spawn

The historic wrapper (`PiperTTS`) is `python3 -m piper` spawned as a subprocess **on every synthesis**:

```
synthèse = spawn(python) + chargement du modèle + inférence + kill
```

Each sentence pays for interpreter startup + weight loading. Measured on `en_US-lessac-medium`: **~2.2s per line**.

Native (`PiperNativeTTS`) keeps the ONNX session **hot in memory**:

```
load une fois -> session persistante -> inférence par phrase
```

Measured the same way: **~0.22s per line**. The 10x comes from there: you kill spawn and reload, miraculous inference has nothing to do with it. The ONNX inference itself is the same on both sides.

As a bonus, the first load caches the optimized graph next to the `.onnx` (`<model>.ortopt-<platform>-<arch>-v<ort>.onnx`), which makes later loads about 35% faster. The cache key combines platform, arch and ORT version, and it refreshes if the model changes. Disable with `cacheOptimizedModel: false`.

### The espeak bridge: 0.4ms vs 15ms

Same logic for phonemization. The wrapper calls the `espeak-ng` CLI binary per sentence: about 15ms of spawn each time. Native embeds an N-API bridge (`src/native/espeak-bridge/`, port of `espeakbridge.c`), with prebuilds for Linux x64/arm64: **~0.4ms per call**, byte-identical phonemes. Without the addon, automatic fallback to CLI. `PIPER_ESPEAK_BRIDGE=0` to force CLI.

### The 7 phoneme_type, all ported

| Type | Engine | Notes |
|---|---|---|
| `espeak` | N-API bridge or CLI | byte-identical clauses |
| `text` | codepoints passthrough | trivial |
| `hebrew` | Nakdimon ONNX + IPA rules | identical outputs |
| `lithuanian` | espeak + 189k entry stress dict | identical outputs |
| `pinyin` | BERT g2pW ONNX + WordPiece | polyphone disambiguation OK |
| `thai` | real unmodified TLTK under Pyodide/WASM | 7/7 identical (1st call slow, rest fast) |
| `japanese` | lindera-wasm + UniDic + TS mora engine | exact segmentation, **no lexical accent** |

And Arabic is diacritized automatically (tashkeel, can be disabled). 509 espeak voices in the catalog go through the fast bridge, exotics through their dedicated engine. 71 tests in the suite, documented constraint where it hurts (Japanese accent, UniDic ships no data, assumed, nothing hidden).

### Formats and streaming

`wav` by default, `raw` PCM, `mp3`, `ogg`, `opus`: ffmpeg when available, else pure JS fallbacks (lamejs for mp3, opusscript + Ogg muxer for opus, 0.993 correlation with source). And above all `synthesizeChunks()`: an async generator that yields per sentence, with `sentenceSilence` between sentences. For Luna, that means starting to play audio while the end is still synthesizing. TTS streaming with no dedicated server.

Full usage, with the PiperHub catalog built in (`hub:` + automatic mirror fallback if the author repo stops serving files):

```ts
const tts = await PiperNativeTTS.load({
  model: "hub:glados-french-medium-voice",
  modelsDir: "./models",
});

const r = await tts.synthesize("Bonjour, je suis GLaDOS.", {
  outputFormat: "ogg",   // straight for Discord
  lengthScale: 0.95,     // a touch faster
});
```

Community voices (GLaDOS and game characters) missing from the official manifest. That is exactly why PiperHub exists, and `pipertts` knows it well: `hub:<slug>`, piperhub page URL, or bare slug, all work. Voices flagged `usable: false` are refused with a clear error.

## What was sacrificed

Every missing feature funds another one. The honest list:

**Piper sounds robotic next to ElevenLabs.** Medium VITS at 22050 Hz is clean but flat compared to a big expressive model. Multi-emotion partly compensates (7 styles > 1 flat style), but an ElevenLabs v3 audiobook stays above. That is the price of tens of MB.

**espeak gets it wrong.** Proper nouns, anglicisms, abbreviations: rule-based phonemization has blind spots. "Spoiler" in French, espeak reads it as best it can. Big models with neural G2P fail less. In prod, you need an exception dict for business terms.

**Zero native cloning.** Piper reads with fixed voices. If you want YOUR voice, go PocketTTS or ElevenLabs. Multi-speaker gives variations, never your timbre.

**Japanese stays with no lexical accent.** UniDic ships no accent data, so segmentation is exact but melody is approximate. Documented in the README, nothing under the rug.

**Thai lags on first call.** TLTK runs under unmodified Pyodide/WASM: the first call takes seconds (loading), later ones are fast. 7/7 identical to reference, but plan a warm-up.

**Data is hungry.** A decent high voice needs hours of clean aligned audio. The Fortune dataset is hours of recording + cleanup. Zero magic: garbage in, robot out.

**The catalog has dead voices.** 25 models flagged `usable: false`. It is assumed and filtered, but it reminds you that voice crowdsourcing is also abandonware crowdsourcing.

## The final result

On one side an ElevenLabs meter, on the other a Raspberry Pi:

- PiperHub: 536 models listed, 71 languages, 3755 speakers, 130 linked datasets, dataset -> training -> usage guides
- Piper: end-to-end VITS, espeak, CPU ONNX, LJSpeech, low/medium/high, 22050 Hz standard
- Fortune multi: 7 FR emotions + 7 EN, 1 ONNX each, `speakerId` to switch, "Fortune's Café" license
- Kokoro 82M: premium EN quality, Apache 2.0, 54 voices, near real time CPU
- PocketTTS: CPU cloning, ~100M then 2-18M, WER 0.92%
- sanoTTS: 0.29M, 2 MB, microcontroller, quality that follows size
- ElevenLabs: $0.05-0.10/1000 characters, 70+ languages, top quality, meter running
- native pipertts: ~0.22s/line vs ~2.2s wrapper, espeak bridge 0.4ms, 7 phoneme_type, wav/raw/mp3/ogg/opus, per sentence streaming

Luna talks with that every day. 0 euros of TTS, brain-driven emotions, direct OGG for Discord. Against ElevenLabs you can hear it, obviously. But at 3am when she decides to tell her life story, my bill sleeps easy.

## The philosophy

p2r3 said: *"I just love the idea that this tiny 1 dollar chip can run something as advanced as Minecraft."*

Same trip here, applied to voice: I love the idea that a few dozen MB of ONNX can make a Raspberry Pi talk in 71 languages, with no cloud, no account, no meter. It obviously replaces no dubbing studio. It replaces the annoying case where you want a decent, local, free voice that talks at night without billing you.

Tradeoffs, written in black and white:
- premium quality -> small VITS: a bit robotic, but local and free
- one model per emotion -> speakerId: 7 voices for the price of one in RAM
- Python spawn -> persistent session: 10x faster, zero Python to install
- wild catalog -> linked provenance: every voice knows where it comes from and if it still works
- billed API -> 0 euros marginal: less pretty than ElevenLabs, but the bill sleeps easy

**The 3 things to remember:**

1. **Piper = the CPU TTS** : VITS + espeak + ONNX, 71 languages, voices in tens of MB that run on Pi. Less pretty than ElevenLabs, infinitely cheaper.
2. **Fortune multi = 7 emotions for the price of one** : one ONNX, `speakerId` to switch, FR + EN. The speaker embedding instead of 7 models.
3. **Native kills spawn** : `pipertts` keeps the ONNX session hot: 0.22s/line vs 2.2s, espeak bridge 0.4ms vs 15ms CLI. Same inference, 10x less waiting.

If the project interests you, the catalog is [piperhub.org](https://piperhub.org/), the site code [github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank), the native module [github.com/itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts). And if you want to hear Luna tell her life story at 3am, it is on Discord xD
