---
title: "valorant-short-maker: la pipeline che genera i miei short Valorant da sola"
description: "Groq/Llama per lo script, Piper per le voci, FFmpeg per tutto il resto. Come un cron job produce e pubblica un video al giorno su @valorant_agents, dalla A alla Z."
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "Bx8sun1TZrHHPr4KuIz+aHXHhVQeM1E/nSIC68S2mL4SwwBsu+j7Ekf8vRqKGyzFI4mrhx3My3a7PU8Wr1fWuw=="
---

# valorant-short-maker: la pipeline che genera i miei short Valorant da sola

Da qualche mese, un canale YouTube gira senza che lo tocchi: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop). Agenti Valorant che si prendono in giro tra un round e l'altro, doppiati, sottotitolati in karaoke, pubblicati come Shorts. Tutto è generato da [`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker), una pipeline TypeScript/Bun che gira in cron e pubblica senza che nessuno debba cliccare su niente.

Ecco come funziona, passo passo.

## Cosa dà

Tre frame estratti dal video generato per "Duelist Debate" (Phoenix, Yoru e Jett):

![Intro d'un short, cercle d'agent avec le titre de la scène](/images/valorant-short-maker/vsm-01-intro.png)

![Une réplique en cours, sous-titre karaoké qui s'illumine](/images/valorant-short-maker/vsm-02-dialogue.png)

![Une autre réplique, la couleur du sous-titre change selon l'agent](/images/valorant-short-maker/vsm-03-dialogue.png)

Il risultato in live su questo Short: [Duelist Debate: youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU). Sul canale, gli Short girano intorno a 1,2 - 1,5k viste. Niente di enorme, ma è un canale che gira da solo dall'inizio, quindi il numero che conta davvero è zero: zero minuti passati sopra una volta lanciato il cron.

## La pipeline, in ordine

### 1. Scrivere lo script: Groq + Llama 3.3

Ogni run pesca 3 o 4 agenti a caso tra i 26 disponibili, e invia a Llama 3.3 70B (via Groq) un prompt di sistema che contiene, per ogni agente scelto, un riassunto compatto della sua personalità e delle sue relazioni con gli altri agenti presenti nella scena (queste persona vivono in `src/lore/`, un file per agente). Il prompt impone regole precise: una frase corta e incisiva per battuta, rotazione equa tra i personaggi, umorismo in priorità, e soprattutto pause.

Esempio concreto con "Duelist Debate": Phoenix, Yoru e Jett litigano per sapere chi giocherà duelist, generato il 6 luglio 2026:

```
phoenix: I'm telling you, I've got the skills to play duelist this match.
yoru: Skills, you call burning things skills, Phoenix.
jett: I'm the fastest one here, I should play duelist.
phoenix: Fastest, but can you handle the heat, Jett [0.3] I doubt it.
yoru: Heat, ha, you think your flames are hotter than my rifts.
jett: This isn't about heat or flames, it's about speed and agility.
phoenix: Oh, I see, so now you're an expert on duelists, Yoru [0.3] that's rich.
yoru: At least I don't rely on cheap fire tricks.
jett: Cheap fire tricks, that's what you call Phoenix's abilities.
phoenix: Hey, my fire tricks have gotten us out of tight spots before [0.3] can't say the same for your rifts, Yoru.
yoru: Tight spots, you mean like the time I rifted us out of that trap.
jett: Enough, this is getting nowhere, let's just decide already.
phoenix: Fine, but I'm still saying I'm the best duelist here.
yoru: Please, you think you can take on the enemy team alone [0.3] I doubt it.
jett: I can take them on, no problem, I'm the fastest.
phoenix: Fastest, yeah, but can you outmaneuver them [0.3] that's the question.
yoru: Outmaneuver, ha, you think you can outmaneuver anyone, Phoenix.
jett: This is stupid, we're not going to agree on this.
phoenix: Fine, let's just play and see who comes out on top [0.3] I'm game if you are.
yoru: Bring it on, I'll show you what a real duelist looks like.
jett: I'm not backing down, I'm playing duelist.
phoenix: Oh, this should be good [0.3] let's see how you two do.
yoru: We'll see who comes out on top, won't we, Jett.
jett: Yeah, let's end this debate once and for all.
pause: 0.3
phoenix: Alright, let's get started then [0.3] may the best duelist win.
yoru: I'll make sure to burn you, Phoenix, not with fire, but with my rifts.
jett: I'll take you both down, no problem.
```

Le pause sono il dettaglio che rende il ritmo naturale: `[0.3]` inserito nel mezzo di una battuta crea un silenzio di 0.3s nel file audio senza tagliare il cerchio dell'agente a schermo, mentre una riga `pause: 1.0` a sé stante crea un vero silenzio tra due parlanti, cerchio nascosto. Senza questo, un TTS che concatena battute senza respirare suona robotico.

### 2. Dare una voce: Piper, un modello per agente

Ogni agente ha il suo modello Piper (`.onnx`) allenato apposta, salvato in `voices/<agent>/`. Il testo generato passa nel modello corrispondente, il che tira fuori un WAV. È la stessa tech che uso per il training di voci custom in generale (vedi l'articolo sulla pipeline Piper/Kaggle): qui applicata direttamente in prod, al volo, a ogni generazione di video.

### 3. Sottotitoli karaoke: ASS generato, colore estratto dall'icona

Il sottotitolo non è un semplice `.srt`. È un file `.ass` (Advanced SubStation Alpha) generato parola per parola, con effetto karaoke: ogni parola si illumina in un colore via via che è pronunciata, mentre il resto del testo resta in un colore neutro. Il colore di accento non è fisso: è estratto dinamicamente dall'icona dell'agente che parla (uno script Python fa girare PIL sul PNG dell'icona, campiona i pixel non trasparenti, e restituisce i colori dominanti). Risultato: il sottotitolo di Killjoy si illumina in viola, quello di Jett in blu-verde, senza che alcun colore sia stato hardcodato da nessuna parte.

### 4. Il cerchio audio-reattivo: un'espressione FFmpeg per frame

È la parte più storta della pipeline, e probabilmente quella di cui sono più fiero. L'icona rotonda dell'agente che parla non resta statica: zooma e dezooma leggermente a ritmo della sua voce.

Il calcolo avviene leggendo il WAV grezzo della battuta, calcolando l'inviluppo RMS (root mean square, una misura dell'energia del segnale) frame per frame a 60 fps, normalizzando per il massimo, poi smussando su una finestra di 3 frame per evitare scatti. Ogni valore di inviluppo è poi convertito in un fattore di scala limitato da `MAX_ZOOM_VARIATION` (0.2, quindi ±20% intorno alla taglia di base).

Il risultato di questo calcolo non è applicato via codice che manipola pixel: è tradotto in un'immensa espressione condizionale FFmpeg (`lt(n,K)*val + between(n,K,K')*val + ...`, un ramo per gruppo di frame) che pilota direttamente il parametro `scale` del filtro video. FFmpeg valuta questa espressione a ogni frame del rendering. Per una battuta di qualche secondo a 60 fps, fa in fretta centinaia di rami in una sola espressione: da cui il parametro `STEP` che raggruppa i frame per limitare la profondità.

### 5. Rendering per segmento, poi fisheye sull'intro

Ogni battuta è resa individualmente: sfondo video (estratto casuale di uno dei clip di gameplay in `bg-video/`, tagliato alla giusta durata), cerchio dell'agente sopra col zoom audio-reattivo, sottotitoli incollati via il filtro `ass` di FFmpeg, audio TTS mixato col suono del gameplay in sottofondo.

Il primissimo segmento riceve un trattamento speciale: una distorsione fisheye che si riassorbe progressivamente sul primo 20% dei frame (filtro `lenscorrection` valutato frame per frame, più un `tmix=frames=3` che miscela i frame adiacenti per simulare motion blur), sincronizzata con un rumore di "whoosh". È la transizione di intro che dà l'impressione che la camera "entri" nella scena.

### 6. Concatenazione e mix finale

Tutti i segmenti sono concatenati capo a coda, la musica di sottofondo (Sneaky Snitch, Kevin MacLeod, licenza Creative Commons) è mixata sopra con **ducking audio**: una compressione sidechain che abbassa automaticamente il volume della musica mentre un agente parla, e rialza durante i silenzi. Il tutto gira in 60 fps da cima a fondo, nessuna conversione di framerate tra i passi.

### 7. Pubblicazione automatica

Lo script `run-cron.sh`, lanciato da un cron classico, attiva l'ambiente Python, carica il `.env`, e lancia `bun src/workflow.ts --upload`. Il flag `--upload` innesca in più la generazione di metadati (titolo, descrizione, tag) e chiama `uploaders/upload.py`, che pubblica il video su YouTube e Instagram via due script separati (`uploaders/youtube/upload.py` e `uploaders/instagram/`). Tutta la catena, dal prompt LLM al video online, gira senza intervento umano.

## Perché TypeScript/Bun invece di una cosa tutta Python

La scelta non è ideologica: è che Bun dà un accesso diretto e rapido a `Bun.spawn` per pilotare FFmpeg in sottoprocessi, una tipizzazione forte sulle strutture dati della pipeline (`Phrase`, `SegmentInfo`), e un runtime ampiamente più rapido all'avvio di Node per uno script che gira in cron ogni X ore. Gli unici due pezzi di Python nel progetto stanno dove Python è davvero meglio attrezzata: PIL per l'estrazione di colori, e le API di upload (`google-api-python-client` per YouTube, lo stack Instagram Graph API per IG).

## Cosa illustra

Questo progetto è un buon esempio di ciò che possiamo costruire oggi con mattoni interamente gratis o open source: un LLM rapido e gratis via l'API Groq, un motore TTS locale che gira senza GPU dedicata, FFmpeg per tutto il rendering video: e il legante, sono solo qualche centinaio di righe di TypeScript. Nessuno di questi mattoni è nuovo individualmente. Ciò che fa la pipeline, è l'assemblaggio: generare uno script coerente con vere relazioni tra personaggi, trasformarlo in audio espressivo con pause naturali, sincronizzare un rendering visivo sull'energia di quest'audio frame per frame, e automatizzare tutta la catena fino alla pubblicazione.

---

**Risorse**

- **Repo**: [github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **Canale**: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**3 punti chiave**

1. Lo script è generato da un LLM (Groq/Llama 3.3) con persona e relazioni per agente, non una semplice lista di battute pre-scritte.
2. Lo zoom del cerchio di agente è pilotato da un'espressione FFmpeg calcolata frame per frame dall'inviluppo RMS del WAV: niente animazione per keyframe classica.
3. Tutta la catena, dal prompt al post YouTube/Instagram, gira via un solo cron job senza intervento umano.
