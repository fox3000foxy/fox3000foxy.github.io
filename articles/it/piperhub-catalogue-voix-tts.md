---
title: "PiperHub : 536 voci TTS open source, 7 emozioni in un modello, zero GPU, zero fattura"
description: "VITS, espeak, ONNX, LJSpeech : come Piper fa parlare un Raspberry Pi. Fortune multi in 7 emozioni, Kokoro 82M, PocketTTS, sanoTTS, ElevenLabs -- e pipertts nativo 10x più veloce del wrapper Python."
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
author_sig: "Fr5LEc478ItHBMBGax6SpNpv3B43c3Pwpji0U5xuHLkayny5D706jOhKLvxxzakOQBgqiiayDYNd9OtQ2TcpAQ=="
---

## Introduction

Far parlare un bot Discord costa caro. Non il testo : un LLM locale genera frasi per pochi centesimi di GPU. La voce, invece, si paga a ogni frase. Le API di sintesi fatturano a carattere, e quando il bot parla tutta la notte, la fattura segue.

È il problema che ho avuto con Luna Protocol. Il mio bot Discord genera i suoi messaggi con un LLM locale, poi li fa leggere ad alta voce da una voce Piper, li converte in OGG e li invia come messaggi vocali. Il tutto sul mio server, a 0 euro per frase, anche alle 3 di notte quando Luna decide di raccontare la sua vita da sola.

Restare a 0 euro vuol dire trovare voci gratuite e ospitarle da te. Ed è qui che si è complicato tutto : modelli sparsi su decine di repository Hugging Face, licenze poco chiare, nessun modo di sapere da dove viene una certa voce né se funziona ancora. Così ho costruito [PiperHub](https://piperhub.org/), un catalogo open source di voci per Piper TTS.

I numeri di oggi : **536 modelli** mostrati, **71 lingue** rappresentate, **3755 speaker** elencati. Ogni modello è collegato al suo dataset di origine quando lo si conosce -- la provenienza fa parte del suono, come dice la homepage.

Resta una domanda che mi fanno spesso : come se la cava Piper contro Kokoro, PocketTTS, sanoTTS ed ElevenLabs ? E perché il modulo `pipertts` di Fortune è 10x più veloce del wrapper Python ufficiale ? Questo articolo apre i motori, con il codice a supporto.

## PiperHub, le catalogue

Prima di aprire i motori, vediamo il problema che PiperHub risolve.

### D'où viennent les voix

Il codice sta su [github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank). Astro, sito statico, zero server : l'inglese alla radice, 15 altre lingue sotto `/<code>/` (fr, de, es, it, pt, ru, tr, ja, ko, zh, id, hi, ar, vi, th). Stesso schema del mio blog, in pratica.

La fonte di verità, nessuno la modifica a mano. È una pipeline :

```bash
npm install
npm run data    # rigenera src/data/*.json (python3 scripts/generate_data.py)
npx astro dev   # dev locale
npm run build   # build statica in dist/
```

In concreto : un repo crawler mantiene `models_mapping.csv` e `datasets_mapping.csv`, le voci mirror vivono su Hugging Face, i sample sono file audio. `npm run data` tira tutto e risputa fuori `src/data/*.json`. Il sito si limita a leggere JSON statico.

Nei dati grezzi del momento (555 voci, il sito ne mostra 536 -- il crawl è sempre un po' avanti rispetto alla visualizzazione) :

| Qualité | Modèles |
|---|---|
| medium | 437 |
| high | 67 |
| low | 50 |

| Sample rate | Modèles |
|---|---|
| 22050 Hz | 486 |
| 16000 Hz | 47 |

486 voci a 22050 Hz, lo standard Piper. 47 a 16000 Hz, le vocine veloci per l'embarcato. Il phonemizer è `espeak` in 509 casi -- ci torniamo, è il cuore del sistema.

### La provenance, ou pourquoi chaque modèle a un dataset

La cosa che rende PiperHub utile invece di essere solo una lista è il legame modello <-> dataset. Esempio preso dalla home : la voce **Astra - Valorant Piper TTS** è collegata al dataset **Astra - LJSpeech Dataset**. Apri le due pagine, verifichi i repo e le licenze da entrambi i lati.

130 dataset referenziati. E il catalogo è onesto sullo stato delle truppe : 25 modelli sono flaggati `usable: false` (file rotti, o formato `piperPlus` che richiede un runtime fork). Il modulo `pipertts` rifiuta queste voci con un errore esplicito invece di crashare in modo strano più tardi. 48 modelli sono multi-speaker -- compresi i due che ci interesseranno.

Lato guide, il sito fa il suo lavoro in tre passi : **Build a dataset**, **Train a voice**, **Use a voice**, più una pagina Piper Plus. Dataset in formato LJSpeech in ingresso, ONNX in uscita. Facile a dirsi, lungo a farsi -- da qui la sezione successiva.

## Piper sous le capot : VITS, espeak, ONNX

### Une phrase, trois étapes

Quando chiedi a Piper di dire "buongiorno", succede questo :

```
"bonjour"
  -> [phonémisation espeak-ng] -> b O~ Z u R
  -> [encodeur VITS + flow + décodeur] -> waveform 22050 Hz
```

Zero vocoder separato. Questo è VITS : un modello end-to-end che va dal testo (fonemizzato) alla waveform direttamente. Laddove le vecchie pipeline facevano testo -> spettrogramma (Tacotron) poi spettrogramma -> audio (HiFi-GAN, due modelli, due training), VITS impara tutto in una volta con un VAE condizionale, flow normalizzanti e un discriminatore stile GAN sul decoder. Un solo training, un solo modello, un solo export ONNX.

Il decoder sputa fuori 22050 Hz direttamente. A questo sample rate, un secondo di parlato = 22050 numeri. Il modello è piccolo (qualche decina di MB in qualità medium) e l'inferenza è pura CPU : moltiplicazioni di matrici su un grafo ONNX ottimizzato. Da qui il Raspberry Pi come target ufficiale -- Piper è nato in Rhasspy, un assistente vocale open source fatto per girare su Pi.

### espeak-ng, le phonémiseur qui fait tout le sale boulot

Prima di VITS, bisogna trasformare il testo in fonemi. 509 modelli su 555 usano `espeak` :

```bash
echo "bonjour" | espeak-ng --ipa -v fr
# bO~'ZuR
```

espeak-ng conosce la pronuncia di decine di lingue. Il modello VITS non impara mai l'ortografia francese con i suoi `eau` che si pronunciano `o` -- impara dai fonemi verso il suono. Questo semplifica enormemente il training e spiega perché Piper copre 71 lingue : per una nuova lingua, colleghi la voce espeak corrispondente e alleni.

Quelle che fanno a meno di espeak hanno il loro fonemizzatore, ed è qui che diventa esotico : `hebrew` (Nakdimon ONNX + 494 righe di regole IPA), `pinyin` (BERT g2pW completo con disambiguazione dei polifoni -- lo stesso carattere cinese si pronuncia diversamente a seconda della parola), `thai` (vero TLTK non modificato), `japanese` (segmentazione lindera + UniDic). Il modulo `pipertts` li include tutti e sette, verificati identici al riferimento Python. Ci torniamo.

### Le dataset : du LJSpeech, toujours du LJSpeech

Il formato standard di training è LJSpeech : una cartella `wavs/` piena di clip, più un `metadata.csv` :

```
LJ001-0001|Printing, in the only sense with which we are at present concerned...|printing in the only sense...
LJ001-0002|in being comparatively modern...|in being comparatively modern...
```

`fileid|transcription|normalized`, una clip = una frase, qualche secondo. Il dataset originale sono 13.000 frasi di inglese lette da un'unica speaker, pubblico dominio. Per allenare una voce italiana, registri la stessa struttura in italiano : testo + audio allineati, poche ore bastano per un medium decente, di più per un high.

Le tre qualità del catalogo corrispondono grosso modo alla dimensione del modello + la durata del training. Low : piccolo, veloce, robotico. Medium : il punto ideale, con 437 modelli. High : più grosso, più lento, più naturale -- 67 modelli, compresi i Fortune.

### Les trois boutons magiques

Ogni voce Piper espone tre parametri di inferenza, con default quasi universali :

```json
"inference": { "noise_scale": 0.667, "length_scale": 1, "noise_w": 0.8 }
```

- `noise_scale` (0.667) : variabilità della voce. Più alto = più espressivo, più basso = più stabile. L'output è stocastico : due sintesi della stessa frase danno due audio leggermente diversi.
- `noise_w` (0.8) : variabilità del timing, il ritmo.
- `length_scale` (1.0) : velocità. Sopra 1 rallenta, sotto accelera. Il modo più semplice per far parlare Luna più in fretta quando si arrabbia.

Ricordati `noise_scale`, servirà per le emozioni.

## Fortune multi : 7 émotions, 1 seul ONNX

Ok, passiamo alla star locale.

Il catalogo elenca tre modelli Fortune allenati da ItsRealFortune (ciao) :

| Modèle | Repo | Voix |
|---|---|---|
| ItsRealFortune - French (FR) High | `fox3000foxy/piper-fortune-v6` | 1 (voice-0) |
| ItsRealFortune - French (FR) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-fr-multi` | **7** |
| ItsRealFortune - English (EN) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-en-multi` | **7** |

Il multi FR è questo :

```
normal, joyeuse, storytelling, colere, triste, surprise, interrogative
```

Sette declinazioni emotive in **un solo file ONNX**. Il multi EN uguale, con un refuso storico nei nomi : `suprised` invece di `surprised`. Sta nei pesi, lo teniamo, fa parte del folclore.

### Comment ça marche, un speakerId ?

VITS multi-speaker è lo stesso modello con un input in più : un embedding di speaker. Al training, ogni clip è taggata con il suo stile, il modello impara una tabella di embedding (una per stile) insieme al resto. All'inferenza, scegli la riga della tabella :

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
    speakerId: i,           // 0 = normale ... 5 = sorpresa
    outputFile: `./fortune-${styles[i]}.wav`,
  });
}
```

Stessa frase, sette letture. `speakerId: 5` (sorpresa) con un `noise_scale` un po' spinto, e hai un'esclamazione credibile. `speakerId: 4` (triste), `length_scale: 1.1` per rallentare, e hai un annuncio funebre. È così che Luna modula la sua voce : il cervello sceglie l'emozione (valenza/arousal, cfr. il mio articolo sui centroidi), il TTS sceglie lo speakerId.

Il dataset dietro si chiama sobriamente **Fortune French - Dataset**, con una licenza chiamata "Fortune's Café". Sì, la licenza si chiama come un bar. No, resta così.

### Pourquoi c'est malin économiquement

Sette emozioni = un solo download, un solo caricamento in RAM, una sola sessione ONNX. L'alternativa (sette modelli separati) moltiplicherebbe lo storage e costringerebbe a ricaricare il grafo a ogni cambio di emozione -- ingiocabile per un bot che cambia tono in piena frase. Qui `speakerId` è solo un indice in un tensore. Costo marginale : zero.

## Les concurrents : Kokoro, PocketTTS, sanoTTS

Piper condivide la CPU con tre sfidanti seri, tre filosofie diverse.

### Kokoro 82M, le roi qualité/prix

[Kokoro](https://huggingface.co/hexgrad/Kokoro-82M), di hexgrad. 82 milioni di parametri, architettura StyleTTS 2 modificata con decoder ISTFTNet, **senza fase di diffusione**. È l'assenza di diffusione che fa tutto : nessun loop iterativo di denoising, quindi inferenza ultra rapida.

| | Kokoro-82M |
|---|---|
| Params | 82M |
| Poids | ~300 Mo (164 Mo en FP16) |
| Licence | Apache 2.0 (commercial OK) |
| Langues | 8, 54 voix preset + blending |
| CPU | quasi temps réel |
| GPU | 36 à 96x temps réel |
| Tests aveugles | au niveau de Google et Amazon |

Allenato su meno di 100h di audio per circa 1000 dollari, e gli ascoltatori ciechi lo classificano al livello delle voci premium di Google e Amazon. È per questo che è esploso : qualità premium, gratis, locale, permissivo.

Contro Piper : Kokoro vince sulla naturalezza pura (StyleTTS 2 > VITS di piccola taglia) e sulla licenza (Apache 2.0 contro motore in GPL-3.0 per Piper). Piper vince sulla copertura (71 lingue contro 8, 3755 speaker contro 54 voci) e sull'ecosistema di voci della community. Per narrazione in inglese, Kokoro è difficile da battere. Per italiano con 7 emozioni, turco o swahili, Piper è spesso l'unico in gara.

### PocketTTS (Kyutai), le clonage sur CPU

[Kyutai](https://kyutai.org/tts/) gioca un'altra partita : piccolo modello **con clonazione vocale**, che gira su CPU.

| Modèle | Params | WER | UTMOS | SIM | Vitesse CPU (1 thread) |
|---|---|---|---|---|---|
| Pocket TTS | ~100M | 0.92% | 4.364 | 0.923 | 2.8x temps réel |
| Pocket TTS small | 1.9M / 6.9M / 18.2M | - | - | - | CPU, clonage inclus |

WER sotto l'1% (pronuncia giusto), UTMOS 4.36 (qualità percepita eccellente), SIM 0.923 (il clone assomiglia davvero al target). E le versioni small scendono a **1.9M parametri** con clonazione. 1.9M. Il mio router Sabaki fa quasi questa dimensione in JSON.

Contro Piper : PocketTTS vince sulla clonazione (Piper legge con voci fisse) e sulla compattezza del flagship. Piper vince sulle lingue (lo small per ora è solo inglese) e sulla maturità dell'ecosistema (536 voci pronte contro "allena la tua").

### sanoTTS, le modèle qui tient sur une puce à 3 dollars

[sanoTTS](https://github.com/ampixa/sanoTTS) (`sano` = "piccolo" in nepalese), è il Bareiron del TTS : uno stack neurale completo che va dai fonemi al PCM 22.05 kHz **su microcontrollore**.

| Système | Params | SCOREQ | UTMOS | DNS-SIG |
|---|---|---|---|---|
| sanoTTS (heart-nano) | 0.29M | 2.29 | 2.45 | 3.35 |
| TinyTTS | 1.62M | 3.94 | 3.65 | 3.62 |

0.29M parametri. 2 MB la voce. `pip install sanotts`, `sanotts say "Hello" --voice amy`, e parla. Anche nel browser.

Ma guarda i punteggi : SCOREQ 2.29 contro 3.94 per TinyTTS, UTMOS 2.45. Parla, sì. Non canta. È il tradeoff ultimo : a 0.29M stai ovunque ma la qualità segue la taglia. Piper medium sono 100x più pesi per una voce di un'altra lega.

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

La scelta dipende dal tuo vincolo, non c'è un vincitore assoluto : qualità EN pura -> Kokoro. Clonazione CPU -> PocketTTS. Microcontrollore -> sanoTTS. Copertura di lingue + voci italiane emozionali + zero infra -> Piper.

## ElevenLabs, le Goliath facturé

E poi c'è ElevenLabs. 70+ lingue, Eleven v3 espressivo con audio tag e dialoghi drammatici, qualità top nei blind test. Il Jev del TTS, in un certo senso : tutti l'hanno visto passare, tutti ci hanno fatto benchmark contro.

Il pricing 2026, in cifre tonde :

| Modèle API | Prix / 1000 caractères |
|---|---|
| Flash / Turbo, v3 Conversational | $0.05 |
| Multilingual v2, Eleven v3 | $0.10 |

1000 caratteri fanno circa 1 minuto di audio. Quindi da $0.05 a $0.10 al minuto. Il piano Pro a $99 include circa 990k caratteri, l'overage picchia alla stessa tariffa. Per un canale YouTube che pubblica un video al giorno con voiceover (il mio `valorant-short-maker` fa esattamente questo, ma con Piper gratis), conta da $1.50 a $3 al mese per ogni minuto quotidiano di voiceover. Dieci minuti al giorno : da $15 a $30/mese. Si paga, ma si conta.

Quando ne vale la pena : quando la voce **è** il prodotto (doppiaggio, audiolibro, pub), quando ti servono 70 lingue per domani mattina, quando la clonazione deve essere perfetta al primo colpo. Invece non ne vale mai la pena per : bot Discord che parla tutta la notte, notifiche interne, dev, volumi che esplodono. Luna che racconta la sua vita alle 3 di notte con ElevenLabs, è la mia bolletta che piange.

Il calcolo è semplice : Piper = 0 euro marginali, qualità "buona". ElevenLabs = contatore che gira, qualità "eccellente". In mezzo c'è un mondo dove "buona e gratis" vince -- è tutta la scommessa di PiperHub.

## pipertts : pourquoi le natif met 10x au wrapper Python

Il repo [itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts), 75 commit : un port nativo di Piper in TypeScript. Titolo del README : "In-process Piper TTS for Node.js. No Python required."

### Le coût du spawn

Il wrapper storico (`PiperTTS`) è `python3 -m piper` spawnato in un sottoprocesso **a ogni sintesi** :

```
synthèse = spawn(python) + chargement du modèle + inférence + kill
```

Ogni frase paga l'avvio dell'interprete + il caricamento dei pesi. Misurato su `en_US-lessac-medium` : **~2.2s per riga**.

Il nativo (`PiperNativeTTS`) tiene la sessione ONNX **calda in memoria** :

```
load une fois -> session persistante -> inférence par phrase
```

Misurato uguale : **~0.22s per riga**. Il 10x viene da qui : uccidi spawn e reload, l'inferenza miracolosa non c'entra niente. L'inferenza ONNX in sé è la stessa da entrambi i lati.

In bonus, il primo load mette in cache il grafo ottimizzato accanto al `.onnx` (`<model>.ortopt-<platform>-<arch>-v<ort>.onnx`), il che rende i caricamenti successivi circa il 35% più veloci. La chiave della cache combina platform, arch e versione di ORT, e si aggiorna se il modello cambia. Disattivabile con `cacheOptimizedModel: false`.

### Le pont espeak : 0.4ms contre 15ms

Stessa logica per la fonemizzazione. Il wrapper chiama il binario `espeak-ng` in CLI per frase : circa 15ms di spawn ogni volta. Il nativo include un bridge N-API (`src/native/espeak-bridge/`, port di `espeakbridge.c`), con prebuild per Linux x64/arm64 : **~0.4ms per chiamata**, fonemi byte-identici. Senza l'addon, fallback automatico sulla CLI. `PIPER_ESPEAK_BRIDGE=0` per forzare la CLI.

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

E l'arabo è diacritizzato automaticamente (tashkeel, disattivabile). 509 voci espeak del catalogo passano dal bridge veloce, le esotiche dal loro motore dedicato. 71 test nella suite, vincolo documentato dove si inceppa (l'accento giapponese, UniDic non dà nessun dato -- dichiarato, niente nascosto).

### Les formats et le streaming

`wav` di default, `raw` PCM, `mp3`, `ogg`, `opus` : ffmpeg quando c'è, altrimenti fallback puro JS (lamejs per mp3, opusscript + muxer Ogg per opus, correlazione 0.993 con la sorgente). E soprattutto `synthesizeChunks()` : un generatore async che yielda per frase, con `sentenceSilence` tra le frasi. Per Luna vuol dire iniziare a riprodurre l'audio mentre la fine si sintetizza -- streaming di TTS senza server dedicato.

Uso completo, con il catalogo PiperHub integrato (`hub:` + fallback mirror automatico se il repo autore non serve più i file) :

```ts
const tts = await PiperNativeTTS.load({
  model: "hub:glados-french-medium-voice",
  modelsDir: "./models",
});

const r = await tts.synthesize("Bonjour, je suis GLaDOS.", {
  outputFormat: "ogg",   // diretto per Discord
  lengthScale: 0.95,     // un filo più veloce
});
```

Voci community (GLaDOS e personaggi dei giochi) assenti dal manifest ufficiale -- ecco esattamente perché esiste PiperHub, e `pipertts` lo sa bene : `hub:<slug>`, URL di pagina piperhub, o slug nudo, tutto funziona. Le voci flaggate `usable: false` sono rifiutate con un errore chiaro.

## Ce qui a été sacrifié

Ogni feature assente ne finanzia un'altra. La lista onesta :

**Piper suona robotico accanto a ElevenLabs.** VITS medium su 22050 Hz è pulito ma piatto rispetto a un grosso modello espressivo. Il multi-emozione compensa in parte (7 stili > 1 stile piatto), ma un audiolibro ElevenLabs v3 resta sopra. È il prezzo delle decine di MB.

**espeak sbaglia.** Nomi propri, anglicismi, abbreviazioni : la fonemizzazione a regole ha i suoi punti ciechi. "Spoiler" in italiano, espeak lo legge come può. I grossi modelli con G2P neurale sbagliano meno. In prod ti serve un dizionario di eccezioni per i termini di settore.

**Zero clonazione nativa.** Piper legge con voci fisse. Se vuoi LA TUA voce, vai su PocketTTS o ElevenLabs. Il multi-speaker dà variazioni, mai il tuo timbro.

**Il giapponese resta senza accento lessicale.** UniDic non dà nessun dato di accento, quindi la segmentazione è esatta ma la melodia è approssimativa. Documentato nel README, niente sotto il tappeto.

**Il thai arranca alla prima chiamata.** TLTK gira sotto Pyodide/WASM non modificato : la prima chiamata prende secondi (caricamento), le successive sono veloci. 7/7 identici al riferimento, ma prevedi un warm-up.

**I dati hanno fame.** Una voce high decente richiede ore di audio pulito allineato. Il dataset Fortune sono ore di registrazione + pulizia. Zero magia : garbage in, robot out.

**Il catalogo ha voci morte.** 25 modelli flaggati `usable: false`. È dichiarato e filtrato, ma ricorda che il crowdsourcing di voci è anche crowdsourcing di abbandono.

## Le résultat final

Da un lato un contatore ElevenLabs, dall'altro un Raspberry Pi :

- PiperHub : 536 modelli mostrati, 71 lingue, 3755 speaker, 130 dataset collegati, guide dataset -> training -> usage
- Piper : VITS end-to-end, espeak, ONNX CPU, LJSpeech, low/medium/high, 22050 Hz standard
- Fortune multi : 7 emozioni FR + 7 EN, 1 ONNX ciascuno, `speakerId` per switchare, licenza "Fortune's Café"
- Kokoro 82M : qualità premium EN, Apache 2.0, 54 voci, quasi tempo reale CPU
- PocketTTS : clonazione CPU, ~100M poi 2-18M, WER 0.92%
- sanoTTS : 0.29M, 2 MB, microcontrollore, qualità che segue la taglia
- ElevenLabs : $0.05-0.10/1000 caratteri, 70+ lingue, top qualità, contatore che gira
- pipertts nativo : ~0.22s/riga contro ~2.2s wrapper, bridge espeak 0.4ms, 7 phoneme_type, wav/raw/mp3/ogg/opus, streaming per frase

Luna parla con questo ogni giorno. 0 euro di TTS, emozioni pilotate dal cervello, OGG diretto per Discord. Contro ElevenLabs si sente, ovvio. Ma alle 3 di notte quando decide di raccontare la sua vita, la mia fattura dorme tranquilla.

## La philo

p2r3 diceva : *"J'aime juste l'idée que cette toute petite puce à 1 balles puisse faire tourner quelque chose d'aussi avancé que Minecraft."*

Stesso trip qui, applicato alla voce : mi piace l'idea che poche decine di MB di ONNX facciano parlare un Raspberry Pi in 71 lingue, senza cloud, senza account, senza contatore. Ovvio che non sostituisce nessuno studio di doppiaggio. Sostituisce il caso noioso dove vuoi una voce decente, locale, gratis, che parla la notte senza fatturarti.

I tradeoff, scritti nero su bianco :
- qualità premium -> VITS piccolo : un po' robotico, ma locale e gratis
- un modello per emozione -> speakerId : 7 voci al prezzo di una in RAM
- spawn Python -> sessione persistente : 10x più veloce, zero Python da installare
- catalogo selvaggio -> provenienza collegata : ogni voce sa da dove viene e se funziona ancora
- API fatturata -> 0 euro marginali : meno bello di ElevenLabs, ma la fattura dorme tranquilla

**Le 3 cose da ricordare :**

1. **Piper = il TTS della CPU** -- VITS + espeak + ONNX, 71 lingue, voci da decine di MB che girano su Pi. Meno bello di ElevenLabs, infinitamente meno caro.
2. **Fortune multi = 7 emozioni al prezzo di una** -- un solo ONNX, `speakerId` per switchare, FR + EN. L'embedding di speaker invece di 7 modelli.
3. **Il nativo uccide lo spawn** -- `pipertts` tiene la sessione ONNX calda : 0.22s/riga contro 2.2s, bridge espeak 0.4ms contro 15ms CLI. Stessa inferenza, 10x meno attesa.

Se il progetto ti interessa, il catalogo è [piperhub.org](https://piperhub.org/), il codice del sito [github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank), il modulo nativo [github.com/itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts). E se vuoi sentire Luna raccontare la sua vita alle 3 del mattino, è su Discord xD
