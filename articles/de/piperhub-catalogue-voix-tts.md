---
title: "PiperHub: 536 Open-Source-TTS-Stimmen, 7 Emotionen in einem Modell, null GPU, null Rechnung"
description: "VITS, espeak, ONNX, LJSpeech: wie Piper einen Raspberry Pi zum Sprechen bringt. Fortune multi in 7 Emotionen, Kokoro 82M, PocketTTS, sanoTTS, ElevenLabs, und natives pipertts 10x schneller als der Python-Wrapper."
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
author_sig: "qbTeeTHoFt0eoIukf2orgSZr2wWvi9JL8WaZU9pcLzfK2DJcAbwT8ATRZQYdH3tDnBQRtWHzSFr+5r7X2iSCyA=="
---

## Introduction

Einen Discord-Bot zum Sprechen zu bringen kostet Geld. Nicht der Text: Ein lokales LLM erzeugt Sätze für ein paar Cent GPU. Die Stimme dagegen zahlst du bei jedem Satz. Synthese-APIs rechnen pro Zeichen ab, und wenn der Bot die ganze Nacht redet, folgt die Rechnung.

Genau das Problem hatte ich mit Luna Protocol. Mein Discord-Bot erzeugt seine Nachrichten mit einem lokalen LLM, lässt sie dann von einer Piper-Stimme vorlesen, konvertiert nach OGG und schickt sie als Sprachnachrichten. Alles auf meinem eigenen Server, für 0 Euro pro Satz, selbst um 3 Uhr morgens, wenn Luna beschließt, ganz allein ihr Leben zu erzählen.

Bei 0 Euro zu bleiben heißt, gratis Stimmen zu finden und selbst zu hosten. Und da wurde es kompliziert: Modelle verstreut über dutzende Hugging-Face-Repos, unklare Lizenzen, keine Möglichkeit zu wissen, woher eine Stimme kommt oder ob sie noch läuft. Also habe ich [PiperHub](https://piperhub.org/) gebaut, einen Open-Source-Katalog für Piper-TTS-Stimmen.

Die Zahlen von heute: **536 Modelle** gelistet, **71 Sprachen** vertreten, **3755 Speaker** gelistet. Jedes Modell ist mit seinem Quell-Dataset verlinkt, soweit ich es kenne. Herkunft gehört zum Klang, wie die Startseite sagt.

Eine Frage bleibt, die man mir oft stellt: Was taugt Piper gegen Kokoro, PocketTTS, sanoTTS und ElevenLabs? Und warum ist das `pipertts`-Modul von Fortune 10x schneller als der offizielle Python-Wrapper? Dieser Artikel öffnet die Motoren, mit Code als Beleg.

## PiperHub, der Katalog

Bevor wir die Motoren öffnen, schauen wir uns das Problem an, das PiperHub löst.

### Woher die Stimmen kommen

Der Code liegt auf [github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank). Astro, statische Seite, null Server: Englisch im Root, 15 weitere Locales unter `/<code>/` (fr, de, es, it, pt, ru, tr, ja, ko, zh, id, hi, ar, vi, th). Eigentlich dasselbe Muster wie mein Blog.

Niemand pflegt die Source of Truth von Hand. Es ist eine Pipeline:

```bash
npm install
npm run data    # generiert src/data/*.json neu (python3 scripts/generate_data.py)
npx astro dev   # lokales Dev
npm run build   # statischer Build nach dist/
```

Konkret: Ein Crawler-Repo pflegt `models_mapping.csv` und `datasets_mapping.csv`, gespiegelte Stimmen leben auf Hugging Face, Samples sind Audiodateien. `npm run data` zieht das alles und spuckt `src/data/*.json` aus. Die Seite liest nur statisches JSON.

In den aktuellen Rohdaten (555 Einträge, die Seite zeigt 536, der Crawl ist der Anzeige immer etwas voraus):

| Qualität | Modelle |
|---|---|
| medium | 437 |
| high | 67 |
| low | 50 |

| Sample rate | Modelle |
|---|---|
| 22050 Hz | 486 |
| 16000 Hz | 47 |

486 Stimmen in 22050 Hz, der Piper-Standard. 47 in 16000 Hz, die kleinen schnellen Stimmen für Embedded. Der Phonemizer ist in 509 Fällen `espeak`. Dazu komme ich zurück, das ist das Herz des Systems.

### Die Herkunft, oder warum jedes Modell ein Dataset hat

Was PiperHub nützlich statt nur eine Liste macht, ist die Modell <-> Dataset-Verlinkung. Beispiel von der Home: Die Stimme **Astra - Valorant Piper TTS** ist mit dem Dataset **Astra - LJSpeech Dataset** verlinkt. Du öffnest beide Seiten, prüfst Repos und Lizenzen auf jeder Seite.

130 Datasets referenziert. Und der Katalog ist ehrlich über den Zustand der Truppen: 25 Modelle sind als `usable: false` geflaggt (kaputte Dateien, oder `piperPlus`-Format, das eine Fork-Runtime braucht). Das `pipertts`-Modul lehnt diese Stimmen mit einem klaren Fehler ab, statt später komisch zu crashen. 48 Modelle sind Multi-Speaker, darunter die zwei, die uns interessieren werden.

Bei Guides macht die Seite den Job in drei Schritten: **Build a dataset**, **Train a voice**, **Use a voice**, plus eine Piper-Plus-Seite. Dataset im LJSpeech-Format als Input, ONNX als Output. Leicht gesagt, lang gemacht, daher der nächste Abschnitt.

## Piper unter der Haube: VITS, espeak, ONNX

### Ein Satz, drei Schritte

Wenn du Piper bittest, "bonjour" zu sagen, passiert das:

```
"bonjour"
  -> [phonémisation espeak-ng] -> b O~ Z u R
  -> [encodeur VITS + flow + décodeur] -> waveform 22050 Hz
```

Null separater Vocoder. Das ist VITS: Ein End-to-End-Modell, das direkt von (phonemisiertem) Text zum Waveform geht. Wo alte Pipelines Text -> Spektrogramm (Tacotron) und dann Spektrogramm -> Audio (HiFi-GAN, zwei Modelle, zwei Trainings) machten, lernt VITS alles auf einmal mit Conditional VAE, Normalizing Flows und einem GAN-artigen Diskriminator auf dem Decoder. Ein Training, ein Modell, ein ONNX-Export.

Der Decoder spuckt direkt 22050 Hz aus. Bei dieser Sample Rate ist eine Sekunde Sprache gleich 22050 Zahlen. Das Modell ist klein (ein paar dutzend MB in Medium-Qualität) und die Inferenz ist pure CPU: Matrixmultiplikationen auf einem optimierten ONNX-Graphen. Daher der Raspberry Pi als offizielles Ziel. Piper wurde in Rhasspy geboren, einem Open-Source-Sprachassistenten für den Pi.

### espeak-ng, der Phonemizer, der die ganze Drecksarbeit macht

Vor VITS musst du Text in Phoneme verwandeln. 509 von 555 Modellen nutzen `espeak`:

```bash
echo "bonjour" | espeak-ng --ipa -v fr
# bO~'ZuR
```

espeak-ng kennt die Aussprache dutzender Sprachen. Das VITS-Modell lernt nie französische Rechtschreibung mit ihrem `eau`, das wie `o` klingt. Es lernt Phoneme zu Klang. Das vereinfacht das Training enorm und erklärt, warum Piper 71 Sprachen abdeckt: Für eine neue Sprache hängst du die passende espeak-Stimme dran und trainierst.

Die, die ohne espeak auskommen, haben ihren eigenen Phonemizer, und da wird es exotisch: `hebrew` (Nakdimon ONNX + 494 Zeilen IPA-Regeln), `pinyin` (vollständiges BERT g2pW mit Polyphon-Disambiguierung, dasselbe chinesische Zeichen klingt je nach Wort anders), `thai` (echtes unverändertes TLTK), `japanese` (Lindera-Segmentierung + UniDic). Das `pipertts`-Modul bringt alle sieben mit, verifiziert identisch zur Python-Referenz. Dazu komme ich zurück.

### Das Dataset: LJSpeech, immer LJSpeech

Das Standard-Trainingsformat ist LJSpeech: Ein `wavs/`-Ordner voller Clips, plus `metadata.csv`:

```
LJ001-0001|Printing, in the only sense with which we are at present concerned...|printing in the only sense...
LJ001-0002|in being comparatively modern...|in being comparatively modern...
```

`fileid|transcription|normalized`, ein Clip ist ein Satz, ein paar Sekunden. Das Original-Dataset sind 13.000 englische Sätze, gelesen von einer einzigen Sprecherin, Public Domain. Um eine französische Stimme zu trainieren, nimmst du dieselbe Struktur auf Französisch auf: alignierter Text + Audio, ein paar Stunden reichen für ordentliches Medium, mehr für High.

Die drei Katalog-Qualitäten entsprechen grob Modellgröße + Trainingsdauer. Low: klein, schnell, roboterhaft. Medium: der Sweet Spot, mit 437 Modellen. High: größer, langsamer, natürlicher, 67 Modelle, darunter die Fortunes.

### Die drei magischen Knöpfe

Jede Piper-Stimme hat drei Inferenz-Parameter, mit fast universellen Defaults:

```json
"inference": { "noise_scale": 0.667, "length_scale": 1, "noise_w": 0.8 }
```

- `noise_scale` (0.667): Variabilität der Stimme. Höher ist expressiver, niedriger ist stabiler. Die Ausgabe ist stochastisch: Zwei Synthesen desselben Satzes geben zwei leicht unterschiedliche Audios.
- `noise_w` (0.8): Timing-Variabilität, der Rhythmus.
- `length_scale` (1.0): Geschwindigkeit. Über 1 wird langsamer, darunter schneller. Der einfachste Weg, Luna schneller sprechen zu lassen, wenn sie sich aufregt.

Merk dir `noise_scale`, es wird für die Emotionen wichtig.

## Fortune multi: 7 Emotionen, 1 einziges ONNX

Gut, kommen wir zum lokalen Star.

Der Katalog listet drei Fortune-Modelle, trainiert von ItsRealFortune (hallo):

| Modell | Repo | Stimmen |
|---|---|---|
| ItsRealFortune - French (FR) High | `fox3000foxy/piper-fortune-v6` | 1 (voice-0) |
| ItsRealFortune - French (FR) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-fr-multi` | **7** |
| ItsRealFortune - English (EN) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-en-multi` | **7** |

Das Multi FR ist das:

```
normal, joyeuse, storytelling, colere, triste, surprise, interrogative
```

Sieben emotionale Varianten in **einer einzigen ONNX-Datei**. Das Multi EN genauso, mit einem historischen Tippfehler in den Namen: `suprised` statt `surprised`. Er steckt in den Gewichten, ich behalte ihn, das gehört zur Folklore.

### Wie funktioniert eine speakerId?

Multi-Speaker-VITS ist dasselbe Modell mit einem Extra-Input: einem Speaker-Embedding. Beim Training wird jeder Clip mit seinem Stil getaggt, das Modell lernt parallel eine Embedding-Tabelle (eine pro Stil). Bei der Inferenz wählst du die Zeile der Tabelle:

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

Gleicher Satz, sieben Lesungen. `speakerId: 5` (surprise) mit etwas aufgedrehtem `noise_scale`, und du hast einen glaubwürdigen Ausruf. `speakerId: 4` (triste), `length_scale: 1.1` zum Verlangsamen, und du hast eine Traueransage. So moduliert Luna ihre Stimme: Das Gehirn wählt die Emotion (Valenz/Arousal, siehe mein Artikel über Centroids), das TTS wählt die speakerId.

Das Dataset dahinter heißt nüchtern **Fortune French - Dataset**, mit einer Lizenz namens "Fortune's Café". Ja, die Lizenz heißt wie ein Café. Nein, sie bleibt.

### Warum das ökonomisch clever ist

Sieben Emotionen sind ein Download, ein Laden in den RAM, eine ONNX-Session. Die Alternative (sieben getrennte Modelle) würde den Speicher vervielfachen und bei jedem Emotionswechsel ein Graph-Reload erzwingen, unspielbar für einen Bot, der mitten im Satz den Ton wechselt. Hier ist `speakerId` nur ein Index in einen Tensor. Grenzkosten: null.

## Die Konkurrenten: Kokoro, PocketTTS, sanoTTS

Piper teilt sich die CPU mit drei ernsthaften Herausforderern, drei verschiedenen Philosophien.

### Kokoro 82M, der Preis-Leistungs-König

[Kokoro](https://huggingface.co/hexgrad/Kokoro-82M), von hexgrad. 82 Millionen Parameter, modifizierte StyleTTS-2-Architektur mit ISTFTNet-Decoder, **ohne Diffusions-Schritt**. Das Fehlen der Diffusion macht alles aus: Keine iterative Denoising-Schleife, also ultraschnelle Inferenz.

| | Kokoro-82M |
|---|---|
| Params | 82M |
| Gewichte | ~300 MB (164 MB in FP16) |
| Lizenz | Apache 2.0 (kommerziell OK) |
| Sprachen | 8, 54 Preset-Stimmen + Blending |
| CPU | fast Echtzeit |
| GPU | 36 bis 96x Echtzeit |
| Blindtests | auf Google- und Amazon-Niveau |

Trainiert auf unter 100h Audio für etwa 1000 Dollar, und blinde Hörer ranken es auf Niveau der Premium-Stimmen von Google und Amazon. Darum ist es explodiert: Premium-Qualität, gratis, lokal, permissiv.

Gegen Piper: Kokoro gewinnt bei purer Natürlichkeit (StyleTTS 2 > kleines VITS) und Lizenz (Apache 2.0 gegen GPL-3.0-Engine bei Piper). Piper gewinnt bei Abdeckung (71 Sprachen gegen 8, 3755 Speaker gegen 54 Stimmen) und Community-Stimmen-Ökosystem. Für englische Narration ist Kokoro schwer zu schlagen. Für Französisch mit 7 Emotionen, Türkisch oder Swahili ist Piper oft der einzige im Rennen.

### PocketTTS (Kyutai), das Klonen auf CPU

[Kyutai](https://kyutai.org/tts/) spielt eine andere Partie: kleines Modell **mit Stimmen-Klonen**, das auf CPU läuft.

| Modell | Params | WER | UTMOS | SIM | CPU-Speed (1 Thread) |
|---|---|---|---|---|---|
| Pocket TTS | ~100M | 0.92% | 4.364 | 0.923 | 2.8x Echtzeit |
| Pocket TTS small | 1.9M / 6.9M / 18.2M | - | - | - | CPU, Klonen inklusive |

WER unter 1% (es spricht korrekt aus), UTMOS 4.36 (exzellente wahrgenommene Qualität), SIM 0.923 (der Klon klingt wirklich wie das Ziel). Und die Small-Versionen gehen runter bis **1.9M Parameter** mit Klonen. 1.9M. Mein Sabaki-Router ist fast so groß in JSON.

Gegen Piper: PocketTTS gewinnt beim Klonen (Piper liest mit festen Stimmen) und der Kompaktheit des Flaggschiffs. Piper gewinnt bei Sprachen (das Small ist vorerst English-only) und Ökosystem-Reife (536 fertige Stimmen gegen "trainier deine eigene").

### sanoTTS, das Modell, das auf einen 3-Dollar-Chip passt

[sanoTTS](https://github.com/ampixa/sanoTTS) (`sano` heißt "klein" auf Nepali), das ist der Bareiron des TTS: Ein kompletter neuronaler Stack, der von Phonemen zu 22.05-kHz-PCM geht, **auf Mikrocontroller**.

| System | Params | SCOREQ | UTMOS | DNS-SIG |
|---|---|---|---|---|
| sanoTTS (heart-nano) | 0.29M | 2.29 | 2.45 | 3.35 |
| TinyTTS | 1.62M | 3.94 | 3.65 | 3.62 |

0.29M Parameter. 2 MB pro Stimme. `pip install sanotts`, `sanotts say "Hello" --voice amy`, und es spricht. Im Browser auch.

Aber schau dir die Scores an: SCOREQ 2.29 gegen 3.94 für TinyTTS, UTMOS 2.45. Es spricht, ja. Es singt, nein. Das ist der ultimative Tradeoff: Mit 0.29M passt du überall rein, aber die Qualität folgt der Größe. Piper Medium hat 100x mehr Gewichte für eine Stimme in einer anderen Liga.

### Die Tabelle, die alles zusammenfasst

| | Piper | Kokoro 82M | PocketTTS | sanoTTS |
|---|---|---|---|---|
| Typische Params | ~10-60M | 82M | ~100M / 2-18M | 0.3-1.4M |
| Sprachen | 71 | 8 | EN (+ Smalls EN) | mehrsprachig, klein |
| Stimmen verf. | 3755 Speaker | 54 + Blending | Klonen (deine) | wenige Stimmen |
| Klonen | nein | nein (nativ) | **ja, CPU** | nein |
| Engine-Lizenz | GPL-3.0 | Apache 2.0 | offen (Kyutai) | offen |
| Daheim trainierbar | ja (LJSpeech) | ja (schwerer) | ja | ja |
| FR-Qualität | gut (multi Emotion) | okay (EN-first) | EN-only | schwach |

Deine Wahl hängt von deiner Einschränkung ab, es gibt keinen absoluten Gewinner: pure EN-Qualität -> Kokoro. CPU-Klonen -> PocketTTS. Mikrocontroller -> sanoTTS. Sprachabdeckung + emotionale französische Stimmen + null Infra -> Piper.

## ElevenLabs, der abrechnende Goliath

Und dann gibt es ElevenLabs. 70+ Sprachen, expressives Eleven v3 mit Audio-Tags und dramatischen Dialogen, Top-Qualität in Blindtests. Gewissermaßen der Jev des TTS: Jeder hat es vorbeiziehen sehen, jeder hat dagegen gebenchmarkt.

Das 2026er Pricing, in runden Zahlen:

| API-Modell | Preis / 1000 Zeichen |
|---|---|
| Flash / Turbo, v3 Conversational | $0.05 |
| Multilingual v2, Eleven v3 | $0.10 |

1000 Zeichen sind etwa 1 Minute Audio. Also $0.05 bis $0.10 pro Minute. Der Pro-Plan für $99 enthält ca. 990k Zeichen, Overage schlägt mit demselben Tarif zu. Für einen YouTube-Kanal, der täglich ein vertontes Video raushaut (mein `valorant-short-maker` macht genau das, aber mit gratis Piper), rechne $1.50 bis $3 pro Monat für jede tägliche Voiceover-Minute. Zehn Minuten pro Tag: $15 bis $30/Monat. Das kann man zahlen, aber man zählt es.

Wann es sich lohnt: Wenn die Stimme **das** Produkt ist (Synchron, Hörbuch, Werbung), wenn du morgen früh 70 Sprachen brauchst, wenn das Klonen beim ersten Versuch perfekt sein muss. Dagegen lohnt es sich nie für: Discord-Bot, der die ganze Nacht redet, interne Notifications, Dev, explodierende Volumen. Luna, die um 3 Uhr morgens auf ElevenLabs ihr Leben erzählt, das ist meine Stromrechnung, die weint.

Die Rechnung ist einfach: Piper ist 0 Euro marginal, Qualität "gut". ElevenLabs ist laufender Zähler, Qualität "exzellent". Dazwischen gibt es eine Welt, in der "gut und gratis" gewinnt. Das ist die ganze PiperHub-Wette.

## pipertts: warum Nativ den Python-Wrapper um 10x schlägt

Das Repo [itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts), 75 Commits: Ein nativer Piper-Port in TypeScript. README-Titel: "In-process Piper TTS for Node.js. No Python required."

### Die Kosten des Spawns

Der historische Wrapper (`PiperTTS`) ist `python3 -m piper`, gespawnt als Subprozess **bei jeder Synthese**:

```
synthèse = spawn(python) + chargement du modèle + inférence + kill
```

Jeder Satz zahlt Interpreter-Start + Gewichte-Laden. Gemessen auf `en_US-lessac-medium`: **~2.2s pro Zeile**.

Nativ (`PiperNativeTTS`) hält die ONNX-Session **warm im Speicher**:

```
load une fois -> session persistante -> inférence par phrase
```

Gleich gemessen: **~0.22s pro Zeile**. Das 10x kommt daher: Du killst Spawn und Reload, mit wundersamer Inferenz hat das nichts zu tun. Die ONNX-Inferenz selbst ist auf beiden Seiten dieselbe.

Als Bonus cacht der erste Load den optimierten Graphen neben der `.onnx` (`<model>.ortopt-<platform>-<arch>-v<ort>.onnx`), was spätere Loads ca. 35% schneller macht. Der Cache-Key kombiniert Platform, Arch und ORT-Version, und erfrischt sich, wenn das Modell sich ändert. Abschaltbar mit `cacheOptimizedModel: false`.

### Die espeak-Brücke: 0.4ms gegen 15ms

Gleiche Logik für die Phonemisierung. Der Wrapper ruft pro Satz das `espeak-ng`-Binary per CLI auf: ca. 15ms Spawn jedes Mal. Nativ bettet eine N-API-Bridge ein (`src/native/espeak-bridge/`, Port von `espeakbridge.c`), mit Prebuilds für Linux x64/arm64: **~0.4ms pro Call**, Byte-identische Phoneme. Ohne das Addon automatischer Fallback aufs CLI. `PIPER_ESPEAK_BRIDGE=0`, um das CLI zu erzwingen.

### Die 7 phoneme_type, alle portiert

| Typ | Engine | Notes |
|---|---|---|
| `espeak` | N-API-Bridge oder CLI | Byte-identische Clauses |
| `text` | Codepoint-Passthrough | trivial |
| `hebrew` | Nakdimon ONNX + IPA-Regeln | identische Outputs |
| `lithuanian` | espeak + 189k-Einträge-Stress-Dict | identische Outputs |
| `pinyin` | BERT g2pW ONNX + WordPiece | Polyphon-Disambiguierung OK |
| `thai` | echtes unverändertes TLTK unter Pyodide/WASM | 7/7 identisch (1. Call langsam, Rest schnell) |
| `japanese` | lindera-wasm + UniDic + TS-Mora-Engine | exakte Segmentierung, **kein lexikalischer Akzent** |

Und Arabisch wird automatisch diakritisiert (Tashkeel, abschaltbar). 509 espeak-Stimmen aus dem Katalog laufen über die schnelle Bridge, Exoten über ihre dedizierte Engine. 71 Tests in der Suite, dokumentierte Einschränkung, wo es klemmt (der japanische Akzent, UniDic liefert null Daten, angenommen, nichts versteckt).

### Die Formate und das Streaming

`wav` default, `raw` PCM, `mp3`, `ogg`, `opus`: ffmpeg, wenn da, sonst pure JS-Fallbacks (lamejs für mp3, opusscript + Ogg-Muxer für opus, 0.993 Korrelation mit der Quelle). Und vor allem `synthesizeChunks()`: Ein Async-Generator, der pro Satz yielded, mit `sentenceSilence` zwischen Sätzen. Für Luna heißt das, Audio abzuspielen, während das Ende noch synthetisiert. TTS-Streaming ohne dedizierten Server.

Volle Nutzung, mit eingebautem PiperHub-Katalog (`hub:` + automatischer Mirror-Fallback, falls das Autoren-Repo die Dateien nicht mehr serviert):

```ts
const tts = await PiperNativeTTS.load({
  model: "hub:glados-french-medium-voice",
  modelsDir: "./models",
});

const r = await tts.synthesize("Bonjour, je suis GLaDOS.", {
  outputFormat: "ogg",   // direkt für Discord
  lengthScale: 0.95,     // einen Tick schneller
});
```

Community-Stimmen (GLaDOS und Game-Charaktere) fehlen im offiziellen Manifest. Genau darum gibt es PiperHub, und `pipertts` weiß das gut: `hub:<slug>`, PiperHub-Seiten-URL oder nackter Slug, alles geht. Als `usable: false` geflaggte Stimmen werden mit klarem Fehler abgelehnt.

## Was geopfert wurde

Jedes fehlende Feature finanziert ein anderes. Die ehrliche Liste:

**Piper klingt roboterhaft neben ElevenLabs.** Medium-VITS auf 22050 Hz ist sauber, aber flach gegen ein großes expressives Modell. Multi-Emotion kompensiert teils (7 Stile > 1 flacher Stil), aber ein ElevenLabs-v3-Hörbuch bleibt drüber. Das ist der Preis der dutzenden MB.

**espeak irrt sich.** Eigennamen, Anglizismen, Abkürzungen: Regelbasierte Phonemisierung hat blinde Flecken. "Spoiler" auf Französisch liest espeak so gut es kann. Große Modelle mit neuronalem G2P irren sich seltener. In Prod brauchst du ein Ausnahme-Dict für Fachbegriffe.

**Null natives Klonen.** Piper liest mit festen Stimmen. Wenn du DEINE Stimme willst, ab zu PocketTTS oder ElevenLabs. Multi-Speaker gibt Varianten, nie dein Timbre.

**Japanisch bleibt ohne lexikalischen Akzent.** UniDic liefert null Akzentdaten, also ist die Segmentierung exakt, aber die Melodie approximativ. Im README dokumentiert, nichts unterm Teppich.

**Thai lahmt beim ersten Call.** TLTK läuft unter unverändertem Pyodide/WASM: Der erste Call dauert Sekunden (Laden), spätere sind schnell. 7/7 identisch zur Referenz, aber plane einen Warm-up ein.

**Die Daten haben Hunger.** Eine ordentliche High-Stimme braucht Stunden sauberes aligniertes Audio. Das Fortune-Dataset sind Stunden Aufnahme + Cleanup. Null Magie: Garbage in, Roboter out.

**Der Katalog hat tote Stimmen.** 25 Modelle als `usable: false` geflaggt. Das ist angenommen und gefiltert, aber es erinnert daran, dass Stimmen-Crowdsourcing auch Abbruch-Crowdsourcing ist.

## Das Endergebnis

Auf der einen Seite ein ElevenLabs-Zähler, auf der anderen ein Raspberry Pi:

- PiperHub: 536 Modelle gelistet, 71 Sprachen, 3755 Speaker, 130 verlinkte Datasets, Dataset -> Training -> Nutzungs-Guides
- Piper: End-to-End-VITS, espeak, CPU-ONNX, LJSpeech, low/medium/high, 22050 Hz Standard
- Fortune multi: 7 FR-Emotionen + 7 EN, je 1 ONNX, `speakerId` zum Umschalten, "Fortune's Café"-Lizenz
- Kokoro 82M: Premium-EN-Qualität, Apache 2.0, 54 Stimmen, fast Echtzeit-CPU
- PocketTTS: CPU-Klonen, ~100M dann 2-18M, WER 0.92%
- sanoTTS: 0.29M, 2 MB, Mikrocontroller, Qualität folgt der Größe
- ElevenLabs: $0.05-0.10/1000 Zeichen, 70+ Sprachen, Top-Qualität, laufender Zähler
- natives pipertts: ~0.22s/Zeile gegen ~2.2s Wrapper, espeak-Bridge 0.4ms, 7 phoneme_type, wav/raw/mp3/ogg/opus, Streaming pro Satz

Luna spricht jeden Tag damit. 0 Euro TTS, gehirngesteuerte Emotionen, direktes OGG für Discord. Gegen ElevenLabs hört man es, klar. Aber um 3 Uhr morgens, wenn sie beschließt, ihr Leben zu erzählen, schläft meine Rechnung ruhig.

## Die Philo

p2r3 sagte: *"Ich liebe einfach die Idee, dass dieser winzige 1-Dollar-Chip etwas so Fortgeschrittenes wie Minecraft laufen lassen kann."*

Derselbe Trip hier, angewandt auf Stimme: Ich liebe die Idee, dass ein paar dutzend MB ONNX einen Raspberry Pi in 71 Sprachen sprechen lassen, ohne Cloud, ohne Account, ohne Zähler. Das ersetzt offensichtlich kein Synchronstudio. Es ersetzt den nervigen Fall, wo du eine ordentliche, lokale, gratis Stimme willst, die nachts spricht, ohne dich abzurechnen.

Tradeoffs, schwarz auf weiß geschrieben:
- Premium-Qualität -> kleines VITS: etwas roboterhaft, aber lokal und gratis
- ein Modell pro Emotion -> speakerId: 7 Stimmen zum Preis einer im RAM
- Python-Spawn -> persistente Session: 10x schneller, null zu installierendes Python
- wilder Katalog -> verlinkte Herkunft: Jede Stimme weiß, woher sie kommt und ob sie noch läuft
- abgerechnete API -> 0 Euro marginal: weniger hübsch als ElevenLabs, aber die Rechnung schläft ruhig

**Die 3 Dinge zum Merken:**

1. **Piper ist das CPU-TTS** : VITS + espeak + ONNX, 71 Sprachen, Stimmen in dutzenden MB, die auf Pi laufen. Weniger hübsch als ElevenLabs, unendlich billiger.
2. **Fortune multi sind 7 Emotionen zum Preis einer** : ein einziges ONNX, `speakerId` zum Umschalten, FR + EN. Das Speaker-Embedding statt 7 Modellen.
3. **Nativ killt den Spawn** : `pipertts` hält die ONNX-Session warm: 0.22s/Zeile gegen 2.2s, espeak-Bridge 0.4ms gegen 15ms CLI. Gleiche Inferenz, 10x weniger Warten.

Wenn dich das Projekt interessiert, der Katalog ist [piperhub.org](https://piperhub.org/), der Seitencode [github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank), das native Modul [github.com/itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts). Und wenn du Luna um 3 Uhr morgens ihr Leben erzählen hören willst, das ist auf Discord xD
