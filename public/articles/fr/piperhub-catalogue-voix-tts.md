---
title: "PiperHub : 536 voix TTS open source, 7 émotions en un modèle, zéro GPU, zéro facture"
description: "VITS, espeak, ONNX, LJSpeech : comment Piper fait parler un Raspberry Pi. Fortune multi en 7 émotions, Kokoro 82M, PocketTTS, sanoTTS, ElevenLabs -- et pipertts natif 10x plus rapide que le wrapper Python."
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
author_sig: "ctILoPFbIXsP3tuIhNS6cObWNrIaWvw/nCTwic8sAO1cbUUV6UTQCpY8PD9oZ3rTD5cMCmfWTroc+RwMqWXwbw=="
---

## Introduction

Faire parler un bot Discord, ça coûte cher. Pas le texte : un LLM local génère des phrases pour quelques centimes de GPU. La voix, elle, se paie à chaque phrase. Les API de synthèse facturent au caractère, et quand le bot parle toute la nuit, la facture suit.

C'est le problème que j'ai eu avec Luna Protocol. Mon bot Discord génère ses messages avec un LLM local, puis les fait lire à voix haute par une voix Piper, convertit en OGG, et les envoie comme messages vocaux. Le tout sur mon propre serveur, pour 0 euro par phrase, même à 3h du matin quand Luna décide de raconter sa vie toute seule.

Rester à 0 euro, ça veut dire trouver des voix gratuites et les héberger soi-même. Et c'est là que ça s'est compliqué : des modèles éparpillés sur des dizaines de dépôts Hugging Face, des licences floues, aucun moyen de savoir d'où vient telle voix ni si elle fonctionne encore. J'ai donc construit [PiperHub](https://piperhub.org/), un catalogue open source de voix pour Piper TTS.

Les chiffres du jour : **536 modèles** affichés, **71 langues** représentées, **3755 speakers** listés. Chaque modèle est lié à son dataset d'origine quand on le connaît -- la provenance fait partie du son, comme dit la page d'accueil.

Reste une question que l'on me pose souvent : que vaut Piper face à Kokoro, PocketTTS, sanoTTS et ElevenLabs ? Et pourquoi le module `pipertts` de Fortune est-il 10x plus rapide que le wrapper Python officiel ? Cet article ouvre les moteurs, avec le code à l'appui.

## PiperHub, le catalogue

Avant d'ouvrir les moteurs, regardons le problème que PiperHub résout.

### D'où viennent les voix

Le code est sur [github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank). Astro, site statique, zéro serveur : l'anglais à la racine, 15 autres locales sous `/<code>/` (fr, de, es, it, pt, ru, tr, ja, ko, zh, id, hi, ar, vi, th). Même pattern que mon blog, en fait.

La source de vérité, personne l'édite à la main. C'est un pipeline :

```bash
npm install
npm run data    # régénère src/data/*.json (python3 scripts/generate_data.py)
npx astro dev   # dev local
npm run build   # build statique dans dist/
```

Concrètement : un repo crawler maintient `models_mapping.csv` et `datasets_mapping.csv`, les voix en miroir vivent sur Hugging Face, les samples sont des fichiers audio. `npm run data` tire tout ça et recrache `src/data/*.json`. Le site ne fait que lire du JSON statique.

Dans les données brutes du moment (555 entrées, le site en affiche 536 -- le crawl a toujours un peu d'avance sur l'affichage) :

| Qualité | Modèles |
|---|---|
| medium | 437 |
| high | 67 |
| low | 50 |

| Sample rate | Modèles |
|---|---|
| 22050 Hz | 486 |
| 16000 Hz | 47 |

486 voix en 22050 Hz, le standard Piper. 47 en 16000 Hz, les petites voix rapides pour l'embarqué. Le phonemizer, c'est `espeak` dans 509 cas -- on y revient, c'est le coeur du système.

### La provenance, ou pourquoi chaque modèle a un dataset

Le truc qui rend PiperHub utile au lieu d'être juste une liste, c'est le lien modèle <-> dataset. Exemple pris sur la home : la voix **Astra - Valorant Piper TTS** est liée au dataset **Astra - LJSpeech Dataset**. Tu ouvres les deux pages, tu vérifies les repos et les licences de chaque côté.

130 datasets référencés. Et le catalogue est honnête sur l'état des troupes : 25 modèles sont flaggés `usable: false` (fichiers cassés, ou format `piperPlus` qui demande un runtime fork). Le module `pipertts` refuse ces voix avec une erreur explicite au lieu de crasher bizarrement plus tard. 48 modèles sont multi-speakers -- dont les deux qui vont nous intéresser.

Côté guides, le site fait le taf en trois étapes : **Build a dataset**, **Train a voice**, **Use a voice**, plus une page Piper Plus. Dataset au format LJSpeech en entrée, ONNX en sortie. Simple à dire, long à faire -- d'où la section suivante.

## Piper sous le capot : VITS, espeak, ONNX

### Une phrase, trois étapes

Quand tu demandes à Piper de dire "bonjour", il se passe ça :

```
"bonjour"
  -> [phonémisation espeak-ng] -> b O~ Z u R
  -> [encodeur VITS + flow + décodeur] -> waveform 22050 Hz
```

Zéro vocoder séparé. C'est ça, VITS : un modèle end-to-end qui va du texte (phonémisé) au waveform directement. Là où les vieux pipelines faisaient texte -> spectrogramme (Tacotron) puis spectrogramme -> audio (HiFi-GAN, deux modèles, deux entraînements), VITS apprend tout d'un coup avec un VAE conditionnel, des flows normalisants et un discriminateur façon GAN sur le décodeur. Un seul entraînement, un seul modèle, un seul export ONNX.

Le décodeur crache du 22050 Hz directement. À ce sample rate, une seconde de parole = 22050 nombres. Le modèle est petit (quelques dizaines de Mo en qualité medium) et l'inférence est du pur CPU : multiplications de matrices sur un graphe ONNX optimisé. D'où le Raspberry Pi comme cible officielle -- Piper est né dans Rhasspy, un assistant vocal open source fait pour tourner sur Pi.

### espeak-ng, le phonémiseur qui fait tout le sale boulot

Avant VITS, faut transformer du texte en phonèmes. 509 modèles sur 555 utilisent `espeak` :

```bash
echo "bonjour" | espeak-ng --ipa -v fr
# bO~'ZuR
```

espeak-ng connaît la prononciation de dizaines de langues. Le modèle VITS n'apprend jamais l'orthographe française avec ses `eau` qui se prononcent `o` -- il apprend des phonèmes vers du son. Ça simplifie énormément l'entraînement et ça explique pourquoi Piper couvre 71 langues : pour une nouvelle langue, tu branches la voix espeak correspondante et tu entraînes.

Celles qui se passent d'espeak ont leur propre phonémiseur, et c'est là que ça devient exotique : `hebrew` (Nakdimon ONNX + 494 lignes de règles IPA), `pinyin` (BERT g2pW complet avec désambiguïsation des polyphones -- le même caractère chinois se prononce différemment selon le mot), `thai` (vrai TLTK non modifié), `japanese` (segmentation lindera + UniDic). Le module `pipertts` les porte tous les sept, vérifiés identiques à la référence Python. On y revient.

### Le dataset : du LJSpeech, toujours du LJSpeech

Le format d'entraînement standard, c'est LJSpeech : un dossier `wavs/` plein de clips, plus un `metadata.csv` :

```
LJ001-0001|Printing, in the only sense with which we are at present concerned...|printing in the only sense...
LJ001-0002|in being comparatively modern...|in being comparatively modern...
```

`fileid|transcription|normalized`, un clip = une phrase, quelques secondes. Le dataset originel c'est 13 000 phrases d'anglais lues par une seule locutrice, domaine public. Pour entraîner une voix française, tu enregistres la même structure en français : texte + audio alignés, quelques heures suffisent pour du medium correct, plus pour du high.

Les trois qualités du catalogue correspondent grosso modo à la taille du modèle + la durée d'entraînement. Low : petit, rapide, robotique. Medium : le sweet spot, avec 437 modèles. High : plus gros, plus lent, plus naturel -- 67 modèles, dont les Fortune.

### Les trois boutons magiques

Chaque voix Piper expose trois paramètres d'inférence, avec des défauts quasi universels :

```json
"inference": { "noise_scale": 0.667, "length_scale": 1, "noise_w": 0.8 }
```

- `noise_scale` (0.667) : variabilité de la voix. Plus haut = plus expressif, plus bas = plus stable. La sortie est stochastique : deux synthèses de la même phrase donnent deux audios légèrement différents.
- `noise_w` (0.8) : variabilité du timing, le rythme.
- `length_scale` (1.0) : vitesse. Au-dessus de 1 ça ralentit, en dessous ça accélère. Le moyen le plus simple de faire parler Luna plus vite quand elle s'énerve.

Retiens `noise_scale`, il va servir pour les émotions.

## Fortune multi : 7 émotions, 1 seul ONNX

Bon, passons à la star locale.

Le catalogue liste trois modèles Fortune entraînés par ItsRealFortune (coucou) :

| Modèle | Repo | Voix |
|---|---|---|
| ItsRealFortune - French (FR) High | `fox3000foxy/piper-fortune-v6` | 1 (voice-0) |
| ItsRealFortune - French (FR) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-fr-multi` | **7** |
| ItsRealFortune - English (EN) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-en-multi` | **7** |

Le multi FR, c'est ça :

```
normal, joyeuse, storytelling, colere, triste, surprise, interrogative
```

Sept déclinaisons émotionnelles dans **un seul fichier ONNX**. Le multi EN pareil, avec une coquille historique dans les noms : `suprised` au lieu de `surprised`. Elle est dans les poids, on la garde, ça fait partie du folklore.

### Comment ça marche, un speakerId ?

VITS multi-speaker, c'est le même modèle avec une entrée en plus : un embedding de speaker. À l'entraînement, chaque clip est taggé avec son style, le modèle apprend une table d'embeddings (une par style) en même temps que le reste. À l'inférence, tu choisis la ligne de la table :

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

Même phrase, sept lectures. `speakerId: 5` (surprise) avec un `noise_scale` un peu poussé, et t'as une exclamation crédible. `speakerId: 4` (triste), `length_scale: 1.1` pour ralentir, et t'as une annonce funèbre. C'est comme ça que Luna module sa voix : le cerveau choisit l'émotion (valence/arousal, cf. mon article sur les centroids), le TTS choisit le speakerId.

Le dataset derrière s'appelle sobrement **Fortune French - Dataset**, avec une licence nommée "Fortune's Café". Oui, la licence s'appelle comme un café. Non, elle reste.

### Pourquoi c'est malin économiquement

Sept émotions = un seul téléchargement, un seul chargement en RAM, une seule session ONNX. L'alternative (sept modèles séparés) multiplierait le stockage et forcerait à reloader le graphe à chaque changement d'émotion -- injouable pour un bot qui change de ton en pleine phrase. Là, `speakerId` c'est juste un index dans un tenseur. Coût marginal : zéro.

## Les concurrents : Kokoro, PocketTTS, sanoTTS

Piper partage le CPU avec trois challengers sérieux, trois philosophies différentes.

### Kokoro 82M, le roi qualité/prix

[Kokoro](https://huggingface.co/hexgrad/Kokoro-82M), par hexgrad. 82 millions de paramètres, architecture StyleTTS 2 modifiée avec décodeur ISTFTNet, **sans étape de diffusion**. C'est l'absence de diffusion qui fait tout : aucune boucle de débruitage itérative, donc inférence ultra rapide.

| | Kokoro-82M |
|---|---|
| Params | 82M |
| Poids | ~300 Mo (164 Mo en FP16) |
| Licence | Apache 2.0 (commercial OK) |
| Langues | 8, 54 voix preset + blending |
| CPU | quasi temps réel |
| GPU | 36 à 96x temps réel |
| Tests aveugles | au niveau de Google et Amazon |

Entraîné sur moins de 100h d'audio pour environ 1000 dollars, et les auditeurs aveugles le classent au niveau des voix premium de Google et Amazon. C'est pour ça qu'il a explosé : qualité premium, gratuit, local, permissif.

Face à Piper : Kokoro gagne sur la naturalité pure (StyleTTS 2 > VITS petite taille) et la licence (Apache 2.0 contre moteur en GPL-3.0 pour Piper). Piper gagne sur la couverture (71 langues contre 8, 3755 speakers contre 54 voix) et l'écosystème de voix communautaires. Pour de la narration anglaise, Kokoro est dur à battre. Pour du français avec 7 émotions, du turc ou du swahili, Piper est souvent le seul en lice.

### PocketTTS (Kyutai), le clonage sur CPU

[Kyutai](https://kyutai.org/tts/) joue une autre partition : petit modèle **avec clonage de voix**, qui tourne sur CPU.

| Modèle | Params | WER | UTMOS | SIM | Vitesse CPU (1 thread) |
|---|---|---|---|---|---|
| Pocket TTS | ~100M | 0.92% | 4.364 | 0.923 | 2.8x temps réel |
| Pocket TTS small | 1.9M / 6.9M / 18.2M | - | - | - | CPU, clonage inclus |

WER sous 1% (il prononce juste), UTMOS 4.36 (qualité perçue excellente), SIM 0.923 (le clone ressemble vraiment à la cible). Et les versions small descendent à **1.9M paramètres** avec clonage. 1.9M. Mon routeur Sabaki fait presque cette taille en JSON.

Face à Piper : PocketTTS gagne sur le clonage (Piper lit avec des voix fixes) et la compacité du flagship. Piper gagne sur les langues (le small est anglais-only pour l'instant) et la maturité de l'écosystème (536 voix prêtes contre "entraîne la tienne").

### sanoTTS, le modèle qui tient sur une puce à 3 dollars

[sanoTTS](https://github.com/ampixa/sanoTTS) (`sano` = "petit" en népalais), c'est le Bareiron du TTS : un stack neuronal complet qui va des phonèmes au PCM 22.05 kHz **sur microcontrôleur**.

| Système | Params | SCOREQ | UTMOS | DNS-SIG |
|---|---|---|---|---|
| sanoTTS (heart-nano) | 0.29M | 2.29 | 2.45 | 3.35 |
| TinyTTS | 1.62M | 3.94 | 3.65 | 3.62 |

0.29M paramètres. 2 Mo la voix. `pip install sanotts`, `sanotts say "Hello" --voice amy`, ça parle. En navigateur aussi.

Mais regarde les scores : SCOREQ 2.29 contre 3.94 pour TinyTTS, UTMOS 2.45. Ça parle, oui. Ça chante, non. C'est le tradeoff ultime : à 0.29M tu tiens partout mais la qualité suit la taille. Piper medium, c'est 100x plus de poids pour une voix dans une autre ligue.

### Le tableau qui résume

| | Piper | Kokoro 82M | PocketTTS | sanoTTS |
|---|---|---|---|---|
| Params typiques | ~10-60M | 82M | ~100M / 2-18M | 0.3-1.4M |
| Langues | 71 | 8 | EN (+ smalls EN) | multilingue, petit |
| Voix dispos | 3755 speakers | 54 + blending | clonage (la tienne) | quelques voix |
| Clonage | non | non (natif) | **oui, CPU** | non |
| Licence moteur | GPL-3.0 | Apache 2.0 | open (Kyutai) | open |
| Entraînable maison | oui (LJSpeech) | oui (plus lourd) | oui | oui |
| Qualité FR | bonne (multi émotions) | correcte (EN-first) | EN-only | faible |

Le choix dépend de ta contrainte, y'a pas de gagnant absolu : qualité EN pure -> Kokoro. Clonage CPU -> PocketTTS. Microcontrôleur -> sanoTTS. Couverture de langues + voix françaises émotionnelles + zéro infra -> Piper.

## ElevenLabs, le Goliath facturé

Et puis y'a ElevenLabs. 70+ langues, Eleven v3 expressif avec audio tags et dialogues dramatiques, qualité top des blind tests. Le Jev du TTS, en quelque sorte : tout le monde l'a vu passer, tout le monde a benchmarké contre.

Le pricing 2026, en chiffres ronds :

| Modèle API | Prix / 1000 caractères |
|---|---|
| Flash / Turbo, v3 Conversational | $0.05 |
| Multilingual v2, Eleven v3 | $0.10 |

1000 caractères font environ 1 minute d'audio. Donc $0.05 à $0.10 la minute. Le plan Pro à $99 inclut ~990k caractères, l'overage tape au même tarif. Pour une chaîne YouTube qui sort une vidéo par jour avec voix off (mon `valorant-short-maker` fait exactement ça, mais avec Piper gratuit), compte $1.50 à $3 par mois pour chaque minute quotidienne de voix off. Dix minutes par jour : $15 à $30/mois. Ça se paie, mais ça se compte.

Quand ça vaut le coup : quand la voix **est** le produit (doublage, audiobook, pub), quand il faut 70 langues demain matin, quand le clonage doit être parfait du premier coup. En revanche ça vaut jamais le coup pour : bot Discord qui parle toute la nuit, notifications internes, dev, volumes qui explosent. Luna qui raconte sa vie à 3h du matin en ElevenLabs, c'est ma facture EDF qui pleure.

Le calcul est simple : Piper = 0 euro marginal, qualité "bonne". ElevenLabs = compteur qui tourne, qualité "excellente". Entre les deux, y'a un monde où "bonne et gratuite" gagne -- c'est tout le pari PiperHub.

## pipertts : pourquoi le natif met 10x au wrapper Python

Le repo [itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts), 75 commits : un port natif de Piper en TypeScript. Titre du README : "In-process Piper TTS for Node.js. No Python required."

### Le coût du spawn

Le wrapper historique (`PiperTTS`), c'est `python3 -m piper` spawné en sous-processus **à chaque synthèse** :

```
synthèse = spawn(python) + chargement du modèle + inférence + kill
```

Chaque phrase paie le démarrage de l'interpréteur + le chargement des poids. Mesuré sur `en_US-lessac-medium` : **~2.2s par ligne**.

Le natif (`PiperNativeTTS`) garde la session ONNX **chaude en mémoire** :

```
load une fois -> session persistante -> inférence par phrase
```

Mesuré pareil : **~0.22s par ligne**. Le 10x vient de là : on tue le spawn et le reload, l'inférence miraculeuse n'a rien à voir là-dedans. L'inférence ONNX elle-même est la même des deux côtés.

En bonus, le premier load met en cache le graphe optimisé à côté du `.onnx` (`<model>.ortopt-<platform>-<arch>-v<ort>.onnx`), ce qui rend les chargements suivants ~35% plus rapides. La clé du cache combine platform, arch et version d'ORT, et il se rafraîchit si le modèle change. Désactivable avec `cacheOptimizedModel: false`.

### Le pont espeak : 0.4ms contre 15ms

Même logique pour la phonémisation. Le wrapper appelle le binaire `espeak-ng` en CLI par phrase : ~15ms de spawn à chaque fois. Le natif embarque un bridge N-API (`src/native/espeak-bridge/`, port du `espeakbridge.c`), avec prebuilds pour Linux x64/arm64 : **~0.4ms par appel**, phonèmes byte-identiques. Sans l'addon, repli automatique sur le CLI. `PIPER_ESPEAK_BRIDGE=0` pour forcer le CLI.

### Les 7 phoneme_type, tous portés

| Type | Moteur | Notes |
|---|---|---|
| `espeak` | bridge N-API ou CLI | clauses byte-identiques |
| `text` | passthrough codepoints | trivial |
| `hebrew` | Nakdimon ONNX + règles IPA | sorties identiques |
| `lithuanian` | espeak + dico de stress 189k entrées | sorties identiques |
| `pinyin` | BERT g2pW ONNX + WordPiece | désambiguïsation des polyphones OK |
| `thai` | vrai TLTK non modifié sous Pyodide/WASM | 7/7 identiques (1er appel lent, suite rapide) |
| `japanese` | lindera-wasm + UniDic + moteur de mores TS | segmentation exacte, **pas d'accent lexical** |

Et l'arabe est diacritisé automatiquement (tashkeel, désactivable). 509 voix espeak du catalogue passent par le bridge rapide, les exotiques par leur moteur dédié. 71 tests dans la suite, contrainte documentée là où ça coince (l'accent japonais, UniDic livre aucune donnée -- assumé, rien de caché).

### Les formats et le streaming

`wav` par défaut, `raw` PCM, `mp3`, `ogg`, `opus` : ffmpeg quand il est là, sinon fallbacks pur JS (lamejs pour mp3, opusscript + muxeur Ogg pour opus, corrélation 0.993 avec la source). Et surtout `synthesizeChunks()` : un générateur async qui yield par phrase, avec `sentenceSilence` entre les phrases. Pour Luna, ça veut dire commencer à jouer l'audio pendant que la fin se synthétise -- du streaming de TTS sans serveur dédié.

Usage complet, avec le catalogue PiperHub intégré (`hub:` + fallback miroir automatique si le repo auteur ne sert plus les fichiers) :

```ts
const tts = await PiperNativeTTS.load({
  model: "hub:glados-french-medium-voice",
  modelsDir: "./models",
});

const r = await tts.synthesize("Bonjour, je suis GLaDOS.", {
  outputFormat: "ogg",   // direct pour Discord
  lengthScale: 0.95,     // un poil plus vite
});
```

Voix communautaires (GLaDOS et persos de jeux) absentes du manifest officiel -- voilà exactement pourquoi PiperHub existe, et `pipertts` le sait bien : `hub:<slug>`, URL de page piperhub, ou slug nu, tout marche. Les voix flaggées `usable: false` sont refusées avec une erreur claire.

## Ce qui a été sacrifié

Chaque feature absente finance une autre. La liste honnête :

**Piper sonne robotique à côté d'ElevenLabs.** VITS medium sur 22050 Hz, c'est propre mais plat comparé à un gros modèle expressif. Le multi-émotions compense en partie (7 styles > 1 style plat), mais un audiobook ElevenLabs v3 reste au-dessus. C'est le prix des dizaines de Mo.

**espeak se trompe.** Noms propres, anglicismes, abréviations : la phonémisation par règles a ses angles morts. "Spoiler" en français, espeak le lit comme il peut. Les gros modèles avec G2P neuronal se plantent moins. En prod, faut un dico d'exceptions pour les termes métier.

**Zéro clonage natif.** Piper lit avec des voix fixes. Si tu veux TA voix, direction PocketTTS ou ElevenLabs. Le multi-speaker donne des variations, jamais ton timbre.

**Le japonais reste sans accent lexical.** UniDic livre aucune donnée d'accent, donc la segmentation est exacte mais la mélodie est approximative. Documenté dans le README, rien sous le tapis.

**Le thaï rame au premier appel.** TLTK tourne sous Pyodide/WASM non modifié : le premier appel prend des secondes (chargement), les suivants sont rapides. 7/7 identiques à la référence, mais prévois un warm-up.

**Les données ont faim.** Une voix high correcte demande des heures d'audio propre aligné. Le dataset Fortune, c'est des heures d'enregistrement + nettoyage. Zéro magie : garbage in, robot out.

**Le catalogue a des voix mortes.** 25 modèles flaggés `usable: false`. C'est assumé et filtré, mais ça rappelle que le crowdsourcing de voix, c'est aussi du crowdsourcing d'abandon.

## Le résultat final

D'un côté un compteur ElevenLabs, de l'autre un Raspberry Pi :

- PiperHub : 536 modèles affichés, 71 langues, 3755 speakers, 130 datasets liés, guides dataset -> training -> usage
- Piper : VITS end-to-end, espeak, ONNX CPU, LJSpeech, low/medium/high, 22050 Hz standard
- Fortune multi : 7 émotions FR + 7 EN, 1 ONNX chacun, `speakerId` pour switcher, licence "Fortune's Café"
- Kokoro 82M : qualité premium EN, Apache 2.0, 54 voix, quasi temps réel CPU
- PocketTTS : clonage CPU, ~100M puis 2-18M, WER 0.92%
- sanoTTS : 0.29M, 2 Mo, microcontrôleur, qualité qui suit la taille
- ElevenLabs : $0.05-0.10/1000 caractères, 70+ langues, top qualité, compteur qui tourne
- pipertts natif : ~0.22s/ligne contre ~2.2s wrapper, bridge espeak 0.4ms, 7 phoneme_type, wav/raw/mp3/ogg/opus, streaming par phrase

Luna parle avec ça tous les jours. 0 euro de TTS, des émotions pilotées par le cerveau, du OGG direct pour Discord. Face à ElevenLabs ça s'entend, évidemment. Mais à 3h du matin quand elle décide de raconter sa vie, ma facture dort tranquille.

## La philo

p2r3 disait : *"J'aime juste l'idée que cette toute petite puce à 1 balles puisse faire tourner quelque chose d'aussi avancé que Minecraft."*

Même délire ici, appliqué à la voix : j'aime l'idée que quelques dizaines de Mo d'ONNX fassent parler un Raspberry Pi en 71 langues, sans cloud, sans compte, sans compteur. Ça remplace évidemment aucun studio de doublage. Ça remplace le cas relou où tu veux une voix correcte, locale, gratuite, qui parle la nuit sans te facturer.

Les tradeoffs, écrits noir sur blanc :
- qualité premium -> VITS petit : un peu robotique, mais local et gratuit
- un modèle par émotion -> speakerId : 7 voix pour le prix d'une en RAM
- spawn Python -> session persistante : 10x plus rapide, zéro Python à installer
- catalogue sauvage -> provenance liée : chaque voix sait d'où elle vient et si elle marche encore
- API facturée -> 0 euro marginal : moins beau qu'ElevenLabs, mais la facture dort tranquille

**Les 3 trucs à retenir :**

1. **Piper = le TTS du CPU** -- VITS + espeak + ONNX, 71 langues, des voix en dizaines de Mo qui tournent sur Pi. Moins beau qu'ElevenLabs, infiniment moins cher.
2. **Fortune multi = 7 émotions pour le prix d'une** -- un seul ONNX, `speakerId` pour switcher, FR + EN. L'embedding de speaker au lieu de 7 modèles.
3. **Le natif tue le spawn** -- `pipertts` garde la session ONNX chaude : 0.22s/ligne contre 2.2s, bridge espeak 0.4ms contre 15ms CLI. Même inférence, 10x moins d'attente.

Si le projet t'intéresse, le catalogue c'est [piperhub.org](https://piperhub.org/), le code du site [github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank), le module natif [github.com/itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts). Et si tu veux entendre Luna raconter sa vie à 3h du mat, c'est sur Discord xD
