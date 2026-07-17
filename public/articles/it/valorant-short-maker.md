---
title: "valorant-short-maker: la pipeline che genera i miei short di Valorant da sola"
description: "Groq/Llama per la sceneggiatura, Piper per le voci, FFmpeg per tutto il resto. Come un cron job produce e pubblica un video al giorno su @valorant_agents, dalla A alla Z."
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "Qo2GaCNYbAeJlg093lGezQS83eVH8SRUP1luMeuNG/lKaO+Hierd9+sVWx/yTdxJBDQyt+gwqZSqhF4tV54mGg=="
---

# valorant-short-maker: la pipeline che genera i miei short di Valorant da sola

Da qualche mese, un canale YouTube va avanti senza che io lo tocchi: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop). Agenti di Valorant che si prendono in giro tra un round e l'altro, doppiati, con sottotitoli karaoke, pubblicati come Short. Tutto è generato da [`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker), una pipeline TypeScript/Bun che gira in cron e pubblica senza che nessuno debba cliccare niente.

Ecco come funziona, passo dopo passo.

## Cosa produce

Tre frame presi dal video generato per "Duelist Debate" (Phoenix, Yoru e Jett):

![Intro di uno short, cerchio dell'agente col titolo della scena](/images/valorant-short-maker/vsm-01-intro.png)

![Una battuta in corso, sottotitolo karaoke che si illumina](/images/valorant-short-maker/vsm-02-dialogue.png)

![Un'altra battuta, il colore del sottotitolo cambia in base all'agente che parla](/images/valorant-short-maker/vsm-03-dialogue.png)

Il risultato live su questo Short: [Duelist Debate -- youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU). Sul canale, gli Short si aggirano sulle 1,2-1,5k visualizzazioni. Niente di che, ma è un canale che gira da solo dall'inizio, quindi il numero che conta davvero è zero -- zero minuti spesi da quando il cron è partito.

## La pipeline, in ordine

### 1. Scrivere la sceneggiatura -- Groq + Llama 3.3

Ogni esecuzione pesca 3 o 4 agenti a caso tra i 26 disponibili e invia a Llama 3.3 70B (via Groq) un prompt di sistema che contiene, per ogni agente scelto, un riassunto compatto della sua personalità e delle sue relazioni con gli altri agenti presenti nella scena (queste persona stanno in `src/lore/`, un file per agente). Il prompt impone regole precise: una frase corta e incisiva per battuta, rotazione equa tra i personaggi, umorismo prima di tutto, e soprattutto pause.

Esempio concreto con "Duelist Debate" -- Phoenix, Yoru e Jett litigano su chi farà il duelist, generato il 6 luglio 2026:

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

Le pause sono il dettaglio che rende naturale il ritmo: un `[0.3]` infilato a metà battuta crea 0,3 secondi di silenzio nell'audio senza tagliare il cerchio dell'agente sullo schermo, mentre una riga `pause: 1.0` a sé stante crea un vero silenzio tra due interlocutori, cerchio nascosto. Senza, un TTS che spara battute senza respirare suona robotico.

### 2. Dare una voce -- Piper, un modello per agente

Ogni agente ha il suo modello Piper (`.onnx`) addestrato specificamente, salvato in `voices/<agent>/`. Il testo generato passa nel modello corrispondente, che sforna un WAV. È la stessa tecnologia che uso per il training di voci custom in generale (vedi l'articolo sulla pipeline Piper/Kaggle) -- qui applicata direttamente in produzione, al volo, a ogni generazione di video.

### 3. Sottotitoli karaoke -- ASS generato, colore estratto dall'icona

I sottotitoli non sono un semplice `.srt`. È un file `.ass` (Advanced SubStation Alpha) generato parola per parola, con effetto karaoke: ogni parola si illumina di un colore man mano che viene pronunciata, mentre il resto del testo resta in un colore neutro. Il colore d'accento non è fisso -- viene estratto dinamicamente dall'icona dell'agente che parla (uno script Python fa girare PIL sul PNG dell'icona, campiona i pixel non trasparenti e restituisce i colori dominanti). Risultato: il sottotitolo di Killjoy si illumina in viola, quello di Jett in verde acqua, senza che nessun colore sia mai stato hardcodato da nessuna parte.

### 4. Il cerchio audio-reattivo -- un'espressione FFmpeg per frame

Questa è la parte più incasinata della pipeline, e probabilmente quella di cui vado più fiero. L'icona tonda dell'agente che parla non sta ferma: zooma leggermente al ritmo della sua stessa voce.

Il calcolo legge il WAV grezzo della battuta, calcola l'inviluppo RMS (root mean square, una misura dell'energia del segnale) frame per frame a 60 fps, normalizza per il massimo e liscia su una finestra di 3 frame per evitare scatti. Ogni valore dell'inviluppo viene poi convertito in un fattore di scala limitato da `MAX_ZOOM_VARIATION` (0,2, quindi ±20% attorno alla dimensione base).

Il risultato di questo calcolo non viene applicato tramite codice che manipola pixel -- viene tradotto in un'enorme espressione condizionale FFmpeg (`lt(n,K)*val + between(n,K,K')*val + ...`, un ramo per gruppo di frame) che pilota direttamente il parametro `scale` del filtro video. FFmpeg valuta questa espressione a ogni frame del render. Per una battuta di qualche secondo a 60 fps, si arriva in fretta a centinaia di rami in una singola espressione -- da qui il parametro `STEP` che raggruppa i frame per limitare la profondità.

### 5. Rendering per segmento, poi fisheye sull'intro

Ogni battuta viene renderizzata individualmente: sfondo video (una clip di gameplay casuale da `bg-video/`, tagliata alla durata giusta), il cerchio dell'agente sopra con lo zoom audio-reattivo, sottotitoli impressi col filtro `ass` di FFmpeg, audio TTS mixato col suono del gameplay di sottofondo.

Il primissimo segmento riceve un trattamento speciale: una distorsione fisheye che si dissolve gradualmente sul primo 20% dei frame (filtro `lenscorrection` valutato frame per frame, più un `tmix=frames=3` che fonde i frame adiacenti per simulare il motion blur), sincronizzata con un suono "whoosh". È la transizione d'intro che dà l'impressione che la telecamera "entri" nella scena.

### 6. Concatenazione e mix finale

Tutti i segmenti vengono concatenati uno dopo l'altro, la musica di sottofondo (Sneaky Snitch, Kevin MacLeod, licenza Creative Commons) viene mixata sopra con **audio ducking** -- una compressione sidechain che abbassa automaticamente il volume della musica mentre un agente parla, e lo rialza durante i silenzi. Tutto gira a 60 fps dall'inizio alla fine, nessuna conversione di framerate tra i passaggi.

### 7. Pubblicazione automatica

Lo script `run-cron.sh`, lanciato da un cron normale, attiva l'ambiente Python, carica il `.env` ed esegue `bun src/workflow.ts --upload`. Il flag `--upload` attiva anche la generazione dei metadati (titolo, descrizione, tag) e chiama `uploaders/upload.py`, che pubblica il video su YouTube e Instagram tramite due script separati (`uploaders/youtube/upload.py` e `uploaders/instagram/`). L'intera catena, dal prompt LLM al video online, gira senza intervento umano.

## Perché TypeScript/Bun anziché tutto Python

La scelta non è ideologica -- è che Bun dà accesso diretto e rapido a `Bun.spawn` per pilotare FFmpeg come sottoprocesso, un typing forte sulle strutture dati della pipeline (`Phrase`, `SegmentInfo`), e un runtime decisamente più veloce all'avvio di Node per uno script che gira in cron ogni tot ore. Gli unici due pezzetti di Python nel progetto sono dove Python è davvero lo strumento migliore: PIL per l'estrazione dei colori, e le API di upload (`google-api-python-client` per YouTube, lo stack Instagram Graph API per IG).

## Cosa illustra

Questo progetto è un buon esempio di cosa si può costruire oggi con mattoni completamente gratuiti o open source: un LLM veloce e gratuito via API Groq, un motore TTS locale che gira senza GPU dedicata, FFmpeg per tutto il rendering video -- e il collante sono solo qualche centinaio di righe di TypeScript. Nessuno di questi mattoni è nuovo di per sé. Quello che fa la pipeline è l'assemblaggio: generare una sceneggiatura coerente con vere relazioni tra personaggi, trasformarla in audio espressivo con pause naturali, sincronizzare un rendering visivo sull'energia di quell'audio frame per frame, e automatizzare tutta la catena fino alla pubblicazione.

---

**Risorse**

- **Repo**: [github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **Canale**: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**3 punti chiave**

1. La sceneggiatura è generata da un LLM (Groq/Llama 3.3) con persona e relazioni per agente, non una semplice lista di battute pre-scritte.
2. Lo zoom del cerchio dell'agente è pilotato da un'espressione FFmpeg calcolata frame per frame dall'inviluppo RMS del WAV -- niente animazione a keyframe classica.
3. L'intera catena, dal prompt al post YouTube/Instagram, gira con un singolo cron job senza alcun intervento umano.
