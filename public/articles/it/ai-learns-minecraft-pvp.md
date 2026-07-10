---
title: L'IA impara il PvP di Minecraft -- Apprendimento per Imitazione, Reinforcement Learning e le 30 variabili che contano
description: "1.000 duelli registrati, rete neurale addestrata sui pixel, 90% di precisione nei tasti : e il bot correva dritto contro un muro. Poi sono arrivati RL, curriculum learning e 60 ore di addestramento."
date: 2026-07-09
tags:
  - minecraft
  - ai
  - reinforcement-learning
  - imitation-learning
  - python
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "TjfcqQAltfA1IGmxj/D7TNpx2u8U7k/VTSDOGUbDSy3hFFQ56yR+gVibszEf9jqsGAW8pBqxkBGaka36gs5D2g=="
---

## Introduzione

![AI Learns Minecraft PvP thumbnail](assets/ai-pvp-thumbnail.png)

C'è un video intitolato [AI Learns Minecraft PvP (Reinforcement Learning + Behavior Cloning)](https://www.youtube.com/watch?v=j5nxDKAjg6U) di Kadambi | AI Engineering, ed è uno dei resoconti più onesti sull'addestramento di un'IA per giocare ai videogiochi che abbia mai visto.

La premessa: costruire un bot che giochi a PvP in Minecraft (kit spada, armatura di diamante incantata) osservando lo schermo e producendo comandi di mouse e tastiera. Niente lettura della memoria di gioco, niente macro, niente mod : solo pixel in ingresso, azioni in uscita.

Ciò che rende interessante il video non è il risultato finale. È il percorso: il fallimento dell'apprendimento per imitazione, la svolta del feature engineering, i cicli di catastrophic forgetting e le 60+ ore di addestramento su un laptop senza GPU.

## Fase 1 : Apprendimento per Imitazione (il fallimento)

![Il bot durante l'apprendimento per imitazione: di fronte a un muro, che salta su e giù](assets/ai-pvp-imitation-fail.png)

Il creatore ha iniziato con un approccio sensato: registrare 1.000 duelli del proprio gameplay, mappare ogni clic del mouse e pressione di tasto al fotogramma corrispondente, e addestrare una rete neurale a predire le azioni dai pixel.

```python
# Pseudocodice per la pipeline di apprendimento per imitazione
dataset = record_duels(1000)          # centinaia di migliaia di fotogrammi
for frame, action in dataset:
    pixels = capture_screen(frame)
    network.train(pixels → action)    # predice tastiera/mouse dall'immagine
```

La rete ha imparato a predire i tasti con una **precisione del 90%**. Promettente.

Poi l'hanno testata in una partita reale. Il bot è andato dritto al bordo della mappa, si è messo davanti a un muro e ha iniziato a saltare su e giù.

Perché?

**La trappola della pigrizia.** In un combattimento PvP, il tasto W viene premuto quasi sempre. La rete ha capito di poter ottenere alta precisione semplicemente tenendo premuto W e non facendo altro. Ha ottimizzato per l'azione più comune a scapito di tutte le altre.

**Latenza umana.** Le azioni nel dataset sono ritardate di ~200ms dal tempo di reazione umano. Fotogramma per fotogramma, causa ed effetto sono quasi impossibili da apprendere per un modello dai pixel grezzi quando l'azione e la sua conseguenza visibile sono separate da più fotogrammi.

**Dimostrazioni incoerenti.** Il gameplay del creatore stesso variava: a volte strafava con la tastiera, a volte mirava con il mouse in situazioni identiche. Questo input contrastante ha confuso la rete.

## Fase 2 : Reinforcement Learning con Curriculum

![Il bot che impara a tracciare orizzontalmente durante l'addestramento RL](assets/ai-pvp-rl-horizontal.png)

Abbandonando l'apprendimento per imitazione, il creatore è passato all'RL. Ma inserire un agente nuovo in un duello PvP completo è inutile: ci sono troppe cose che accadono contemporaneamente perché l'esplorazione casuale possa trovare qualcosa.

La soluzione: il **curriculum learning**. Isolare ogni meccanica e lasciare che il bot padroneggi le basi prima di entrare in un vero combattimento.

### Passo 1 : Mira orizzontale (7 ore)

La funzione di ricompensa più semplice: ricompensa positiva per aver colpito, penalità negativa per aver subito danni.

Inizialmente, il bot si muove a malapena (rete neurale inizializzata con valori neutri). Oscilla da un lato all'altro: è il bot che testa azioni diverse per vedere quali danno ricompense.

Dopo un'ora, impara a centrarsi orizzontalmente, ma dolorosamente lentamente. Dopo 7 ore, riesce a seguire il nemico a sinistra e a destra, sebbene in modo asimmetrico (meglio a muoversi da destra a sinistra che da sinistra a destra, un comportamento che è persistito per tutto l'addestramento).

### Passo 2 : Feature Engineering

La cattura dello schermo grezza era oltre 2 milioni di pixel. Anche ridimensionata a 360p, sono 200.000 input: un numero eccessivo per un apprendimento efficiente.

Il creatore ha analizzato migliaia di duelli e identificato **30 variabili che contano davvero**, suddivise in tre gruppi:

**Visione (tracciamento nemico)** :
- Distanza del nemico dal mirino
- Dimensione del bounding box del nemico
- Altezza del nemico
- Stato del mirino (sul bersaglio/fuori bersaglio)
- Velocità relativa

Invece di elaborare l'intera immagine, il bot filtra i pixel esclusivamente in base al colore dell'armatura del nemico, rendendo il rilevamento quasi istantaneo. Blocchi di sfondo di colore simile possono interferire: ma in Minecraft puoi semplicemente cambiare le texture.

**OCR (lettura HUD)** :
Poiché il bot non può estrarre le coordinate dal codice del gioco, scansisce lo schermo in tempo reale per estrarre:
- Inclinazione della telecamera (pitch)
- Momentum
- Livello Y

L'OCR standard fa fatica con il testo trasparente di Minecraft, quindi i dati critici vengono forzati in bianco e nero per una lettura istantanea.

**Tempo (finestra di contesto)** :
- Tempo dall'ultimo colpo al nemico
- Tempo dall'ultimo colpo subito
- Buffer滚动 delle azioni precedenti del bot

Questo fornisce alla rete un contesto temporale: senza di esso, il bot non ha idea se sia nel mezzo di una combo o stia appena iniziando un combattimento.

### Passo 3 : Mira verticale (altre 7 ore)

![Il bot che impara a mirare su e giù durante l'addestramento RL](assets/ai-pvp-rl-vertical.png)

Aggiungere il movimento verticale del mouse è stato "un disastro totale" all'inizio. Le prestazioni iniziali erano compromesse.

Dopo un'altra ora nella sandbox, il bot ha capito come guardare su e giù. Ma nel processo, ha completamente dimenticato come tracciare orizzontalmente.

Questo è il **catastrophic forgetting**: un classico problema del machine learning in cui l'ottimizzazione per nuovi dati sovrascrive le rappresentazioni apprese in precedenza. Ottimizzando per la mira verticale, la rete neurale ha accidentalmente sovrascritto il suo progresso orizzontale, lasciando al creatore un bot che riusciva a tenere il mirino in livello ma non a seguire un bersaglio.

Ci sono volute **6 ore aggiuntive** per recuperare il tracciamento orizzontale mantenendo il controllo verticale. Il bot ha poi mantenuto un buon posizionamento del mirino grazie al gruppo OCR che estraeva l'inclinazione della telecamera.

### Passo 4 : Controllo tastiera

![Il bot che alterna costantemente il tasto W, imparando a impegnarsi nel movimento](assets/ai-pvp-keyboard.png)

Dare al bot il permesso di usare la tastiera ha reso le caratteristiche temporali ancora più critiche. All'inizio, il tasto W veniva attivato e disattivato continuamente: commutazione rapida perché la rete non aveva imparato a impegnarsi.

Questo comportamento è stato penalizzato, quindi il bot ha imparato a smussarlo. Ha iniziato a eseguire più sprint hit (il suono sordo vs il sibilo di un colpo da fermo). Alcune combo sembravano insoddisfacenti perché il bot sfruttava il suo vantaggio di portata rispetto al nemico.

Per rendere le cose più eque, il creatore ha aumentato la portata del nemico. Molte delle strategie apprese dal bot hanno smesso di funzionare. Ma con più tempo, si è adattato.

### Passo 5 : Insegnare al bot quando cliccare

Per la fase finale, il creatore ha riportato l'apprendimento per imitazione: ma solo per insegnare i tempi del clic, non l'intera politica di controllo. Il bot cercava di imitare i pattern di clic dai duelli registrati.

Inizialmente era troppo spaventato per provare qualunque cosa, temendo la penalità per i clic sbagliati. Ma alla fine ha trovato il coraggio di colpire e fare centro. Ovviamente, ha dimenticato come mirare di nuovo nel processo: il creatore ha dovuto lasciarlo da solo per **50 ore in più** per tornare a uno stato soddisfacente.

## Il dibattito sul cheating

Il video si conclude chiedendo: questo bot sta barando?

L'argomentazione contro: il bot elabora solo ciò che vede un umano (stessi pixel), invia gli stessi input di tastiera e mouse di un umano (nessuna manipolazione di pacchetti come l'anti-knockback) e non legge la memoria di gioco (nessun X-ray o ESP).

L'argomentazione a favore: un bot può elaborare più velocemente di un umano, e se l'avversario pensa di giocare contro un umano ma non è così, questo è inganno.

Il parere del creatore: dipende dall'intento. Se entrambe le parti sanno che è un bot, è una partita leale. Il bot prosegue colpendo il nemico nel vuoto con una serie di 100 colpi.

## Il risultato

![Il bot che esegue una combo da 100 colpi](assets/ai-pvp-final-combo.png)

Un bot PvP di Minecraft addestrato su un **laptop senza GPU**, costruito su una pipeline di addestramento personalizzata con:

- **Cattura dello schermo** per input pixel (2M+ pixel → 30 feature ingegnerizzate)
- **Curriculum learning** (orizzontale → verticale → tastiera → clic)
- **RL per il controllo motorio** + **apprendimento per imitazione per i tempi di clic**
- **Feature engineering** sui pixel grezzi (3 gruppi: visione, OCR, tempo)
- **60+ ore di addestramento** in più fasi

Il tempo totale di addestramento è nell'ordine delle decine di ore, ma la maggior parte è passiva. Il bot traballa verso la comprensione, dimentica ciò che ha imparato, re-impara, e alla fine mette insieme una combo da 100 colpi.

Il video è su [youtube.com/watch?v=j5nxDKAjg6U](https://www.youtube.com/watch?v=j5nxDKAjg6U).

---

*Questo articolo copre solo il contenuto del video. Per un contesto più ampio sull'IA di Minecraft: VPT, DreamerV3 e il panorama dell'apprendimento per imitazione vs RL: le sezioni sotto collegano questo progetto al campo più ampio.*

## VPT : Behavior Cloning su larga scala

![Diagramma del progetto VPT di OpenAI: il modello di dinamica inversa predice le azioni da coppie di fotogrammi](assets/vpt-overview.svg)

L'approccio di "behavior cloning" del video (Fase 1) è la stessa tecnica usata da OpenAI nel progetto **Video PreTraining (VPT)**, ma agli estremi opposti dello spettro di risorse. VPT ha dimostrato che l'apprendimento per imitazione funziona per Minecraft quando hai 70.000 ore di video, 720 GPU e un modello di dinamica inversa per pseudo-etichettare dati non etichettati. Il creatore qui ha dimostrato che fallisce con un laptop e 1.000 duelli: ma per la stessa ragione fondamentale: l'apprendimento per imitazione è limitato dalla qualità delle sue dimostrazioni.

![L'agente VPT di OpenAI che abbatte un albero in Minecraft](assets/vpt-minecraft.jpg)

La pipeline VPT risolve il problema dei dati addestrando un **modello di dinamica inversa (IDM)** che osserva il fotogramma t-1 e il fotogramma t+1 per predire l'azione al fotogramma t. Poiché l'IDM è non-causale (vede fotogrammi futuri), il compito è più facile del behavior cloning e richiede molti meno dati etichettati. Hanno pagato collaboratori circa ~$2.000 per 2.000 ore di dati etichettati, poi hanno usato l'IDM per pseudo-etichettare 70.000 ore di video Minecraft da YouTube.

Il modello foundation risultante da 0,5B parametri ha raggiunto capacità zero-shot che erano impossibili con il solo RL: tagliare alberi, creare tavoli da lavoro, pillar jumping: e messo a punto con RL, è diventato la prima IA a creare strumenti di diamante.

## OpenAI Five : Il problema del reward shaping

![OpenAI Five che gioca a Dota 2 contro professionisti umani](assets/openai-five-dota2.jpg)

OpenAI Five (2019) ha sconfitto i campioni del mondo di Dota 2 usando puro self-play RL: nessun apprendimento per imitazione. 256 GPU, 128.000 core CPU, 180 anni di gameplay al giorno, 10 mesi di addestramento.

Ma la funzione di ricompensa era artigianale, creata da esperti di Dota: **28 delle 20.000 feature disponibili**, ciascuna con pesi regolati a mano. Patrimonio netto, uccisioni, morti, salute delle torri, assegnazioni di corsia: tutti selezionati e pesati da umani. Senza questo shaping, l'agente imparava a malapena (esperimento: ricompensa solo vittoria/sconfitta → plateau a livello semi-professionistico).

Il bot del video affronta lo stesso problema: la sua funzione di ricompensa codifica la comprensione del creatore di ciò che conta nel PvP (colpire è bene, subire danni è male, mantenere il mirino è bene). Questo è inevitabile: l'RL ha bisogno di un segnale di ricompensa, e modellare quel segnale codifica il bias umano.

## DreamerV3 : Modelli del mondo e ricompense sparse

![Punteggi benchmark di DreamerV3 su oltre 150 compiti diversi con una singola configurazione](assets/dreamerv3-benchmarks.png)

DreamerV3 di DeepMind (2023) adotta un terzo approccio. Invece di behavior cloning o RL con shaping, impara un **modello del mondo**: una rete neurale che predice stati futuri e ricompense dalle azioni passate: e pianifica sognando futuri possibili. È stato il primo algoritmo a raccogliere diamanti in Minecraft da zero senza dati umani o curricula, pubblicato su Nature nel 2025.

![DreamerV3 apprende un modello del mondo per immaginare traiettorie future](assets/dreamerv3-header.png)

L'ambiente del diamante definisce una ricompensa sparsa su 12 traguardi (tronco → assi → bastone → tavolo da lavoro → piccone di legno → ciottolo → piccone di pietra → minerale di ferro → fornace → lingotto di ferro → piccone di ferro → diamante), ciascuno che dà +1 una sola volta. Più una piccola ricompensa per la salute (±0,01 per hp). Totale ottenibile: 11,1 in un episodio di 36.000 passi.

Il modello del mondo di DreamerV3 gli permette di immaginare traiettorie e valutarle internamente: l'attore impara da rollout sognati piuttosto che da esperienza reale, testando migliaia di futuri possibili per ogni passo reale. Questo rende le ricompense sparse fattibili dove ucciderebbero un agente RL standard.

Su 40 seed addestrati per 100M passi ambientali, 24 su 40 hanno raccolto almeno un diamante. Il primo diamante è apparso dopo 29M passi (~9 giorni su una GPU).

## ANNA : IA simbolica incontra Minecraft

![La decomposizione ad albero dei compiti di ANNA per un acciarino](assets/anna-task-tree.png)

Prima del bot PvP del video, prima di VPT e DreamerV3, c'era **ANNA**: un bot Minecraft costruito con una filosofia completamente diversa. Invece di imparare da pixel o ricompense, ANNA usa una **macchina a stati simbolica** con un **parser NLP francese** e un **albero di dipendenze dei compiti** scritto a mano.

Creato nel 2022 (prima che "vibe coding" fosse un termine), ANNA si connette a un server Minecraft tramite Mineflayer e comprende comandi in linguaggio naturale in francese. Dì *"obtiens un briquet"* (prendi un acciarino), e il parser di ANNA identifica il verbo (*obtien* → ottieni), cerca la ricetta dell'oggetto e la scompone ricorsivamente in sotto-compiti: estrai tronchi di quercia → crea assi → crea bastoni → crea un tavolo da lavoro → crea un piccone di legno → estrai pietra → crea un piccone di pietra → estrai minerale di ferro → fondi lingotti di ferro → crea l'acciarino.

![Architettura del parser NLP di ANNA per il riconoscimento di comandi in francese](assets/anna-nlp-diagram.png)

Il layer NLP (`utils/id_parser.js`) divide i comandi su *"et"* (e) per gestire ordini paralleli, mappa verbi francesi a tipi di compito (*craft*, *mine*, *tue*, *suis moi*) e traduce i nomi degli oggetti francesi in ID Minecraft attraverso un dizionario di 5.000 voci. I comandi non riconosciuti cadono in un sistema di conversazione basato su GPT che presenta ANNA come un compagno senziente di Minecraft.

L'**albero dei compiti** (`mc-tasks-tree/`) è il cuore: un algoritmo ricorsivo che percorre il grafo degli oggetti di Minecraft (ricette di crafting, rese minerarie, drop dei mob, ricette della fornace) per produrre un piano passo-passo. Per un elmo di diamante, genera una scomposizione in 40+ passi che attraversa i livelli legno, pietra, ferro e diamante.

![Albero dei compiti per l'elmo di diamante di ANNA: una scomposizione in 40+ passi](assets/anna-diamond-helmet.png)

Mentre il bot PvP del video impara dall'esperienza, ANNA funziona dalla conoscenza. Non ha bisogno di 1.000 duelli o 60 ore di addestramento: ha bisogno dell'albero, del parser e del server. Ma non può nemmeno generalizzare oltre ciò che il suo albero codifica. Nessuna quantità di ingegneria di macchine a stati gli insegnerebbe a fare PvP.

L'approccio di ANNA rispecchia un'epoca diversa dell'IA: prima che l'apprendimento end-to-end dominasse, quando la promessa era che il ragionamento simbolico combinato con un'attenta ingegneria potesse produrre comportamento intelligente. Oggi, progetti come ANNA e il bot PvP rappresentano due poli dell'IA di Minecraft: uno ragiona sul mondo, l'altro lo percepisce.

## Il Mace Bot di Master Gumbo : IA con soli command block

![L'arena di addestramento Mace PvP con il bot](assets/mace-bot-arena.png)

In un angolo completamente diverso dell'IA di Minecraft, lo YouTuber **Master Gumbo** ha costruito un bot di addestramento PvP usando **solo command block**: niente mod, niente plugin, niente codice esterno. Solo comandi vanilla di Minecraft, redstone e un carpet mod per entità replica del giocatore. Il risultato è un avversario IA per mace PvP che pratica breach swapping, wind charging e meccaniche di scudo con il giocatore.

Il bot inizia come uno zombie con equipaggiamento infrangibile e un totem nella mano secondaria (riempito ogni tick tramite `/item replace`), rendendolo effettivamente immortale. Successivamente, Master Gumbo passa ai bot **Carpet Mod's player replica**, che supportano meccaniche umane (alzare lo scudo, cambiare oggetto) che gli zombie non possono fare.

![Il centro impostazioni: pulsanti per configurare il comportamento del bot](assets/mace-settings-center.png)

L'innovazione principale è una **macchina a stati guidata dalla casualità**. Un armor stand viene teletrasportato sopra un cerchio di blocchi di cemento colorati usando il comando `/spreadplayers`, che disperde le entità casualmente. Dove atterra l'armor stand determina la prossima azione del bot:

- **Cemento rosso** → strafe all'indietro
- **Cemento blu** → wind charge verso l'alto (attacco)
- **Cemento verde** → alza lo scudo
- **Cemento bianco** → pausa (aggiunge ritardo tra le azioni)

![Il sistema decisionale dell'IA: un armor stand su cemento colorato](assets/mace-ai-system.png)

La posizione dell'armor stand viene letta da command block che rilevano il blocco sottostante e attivano il meccanismo corrispondente. Un blocco di redstone viene posizionato o rimosso per abilitare/disabilitare ogni comportamento. Poiché `/spreadplayers` viene eseguito in ripetizione, il bot prende continuamente nuove decisioni, creando un comportamento imprevedibile ma strutturato.

Master Gumbo chiama questo "una forma molto semplice e basilare di IA": non impara dalle interazioni come le reti neurali, ma la casualità combinata con la macchina a stati produce un comportamento PvP realistico che è più difficile da prevedere di un bot scriptato. Il centro impostazioni include un'interfaccia a libro per attivare/disattivare l'IA, regolare la difficoltà e configurare i pattern di movimento.

Dopo essersi addestrato con il bot e aver poi duellato contro il giocatore che lo aveva definito scarso (nell'intro del video), Master Gumbo vince. La mappa è condivisa via Discord, con Carpet Mod richiesto.

![Il bot in un duello, mentre pratica tecniche di mace PvP](assets/mace-final-duel.png)

Mentre il bot PvP (Kadambi) impara dai pixel e ANNA ragiona con un albero dei compiti, il bot di Master Gumbo raggiunge l'intelligenza attraverso **transizioni di stato randomizzate**: un approccio puro con command block che dimostra che non servono reti neurali per costruire un avversario PvP convincente.

## Altoclef : Un mineratore IA con pianificazione basata su goal

Mentre tutti i progetti precedenti si concentrano sul combattimento o sulla sopravvivenza di base, **Altoclef** di **Ga13c** risolve un problema diverso: estrarre qualsiasi risorsa in Minecraft dato un obiettivo testuale. Non è un bot PvP e non usa pixel: è un agente IA strutturato che opera attraverso **Fabric API** direttamente nel client di Minecraft, controllando il giocatore attraverso il codice Java piuttosto che attraverso il riconoscimento dello schermo.

L'architettura di Altoclef è un **task tree** con un sistema di pianificazione inverso. Date una risorsa obiettivo (ad esempio *"netherite ingot"*), l'agente percorre all'indietro il grafo delle ricette e delle azioni di Minecraft: ha bisogno di un lingotto di netherite → servono frammenti di netherite grezzi e oro → serve un piccone di diamante per la netherite → servono diamanti → serve un piccone di ferro per i diamanti. Il sistema si ferma solo quando raggiunge risorse ottenibili direttamente (legno, pietra, terra) e a quel punto esegue i compiti con **Baritone**, un pathfinding algorithm open-source che naviga nel mondo e interagisce con i blocchi.

L'agente gestisce:

- **Inferenza automatica delle ricette**: a partire da un obiettivo testuale, Altoclef costruisce l'intera catena di crafting senza alcuna codifica manuale.
- **Task progress tracking**: utilizza lo stato del mondo e dell'inventario letti direttamente dalle classi Java di Minecraft per sapere se un sotto-compito è completo o fallito.
- **Pianificazione adattiva**: se un componente della ricetta non è disponibile, l'albero dei compiti si espande automaticamente per estrarlo o craftarlo.
- **Esecuzione parallela**: compiti indipendenti (ad esempio raccogliere legno e pietra contemporaneamente) possono essere eseguiti insieme per risparmiare tempo.

A differenza di ANNA, che opera tramite Mineflayer su un server esterno e usa NLP francese per l'interpretazione dei comandi, Altoclef gira come mod Fabric nel client di Minecraft vero e proprio. Non cattura schermate, non elabora pixel, non addestra reti neurali: legge direttamente lo stato del gioco dalle classi Java e invoca Baritone per la navigazione. È il più vicino a un "vero giocatore automatico" tra tutti i progetti qui discussi.

Tuttavia, Altoclef ha dei limiti. Non impara dall'esperienza (non usa RL), non riconosce oggetti visivamente e non è progettato per il PvP. La sua forza è la pianificazione sistematica della progressione. Per survival automation e speedrunning di progressione tecnologica è eccellente, ma non ti aiuterà in un duello.

Altoclef rappresenta il polo **simbolico-procedurale** dello spettro dell'IA di Minecraft: conoscenza codificata come albero dei compiti, esecuzione affidata a un pathfinding terzo, percezione tramite API di gioco anziché visione artificiale.

## Cosa li unisce

| Approccio | Metodo principale | Dati | Calcolo | Risultato |
|----------|------------|------|---------|--------|
| Bot PvP del video | RL + apprendimento per imitazione | 1.000 duelli | 1 laptop, 60h | Combo da 100 colpi |
| OpenAI Five | Self-play RL | 180 anni di gameplay/giorno | 256 GPU, 10 mesi | Campione mondiale Dota 2 |
| VPT | IL semi-supervisionato | 70K ore YouTube + IDM | 720 GPU, 9 giorni | Strumenti di diamante |
| DreamerV3 | World model RL | Traiettorie sognate | 1 GPU, 9 giorni | Diamante da zero |
| **ANNA** | **NLP simbolico + albero compiti** | **Ricette scritte a mano** | **1 laptop, istantaneo** | **Qualsiasi oggetto creabile** |
| **Altoclef** | **Task tree con Baritone + Fabric** | **Goal testuale → catena ricette** | **Client Minecraft, nessuna GPU** | **Estrazione automatica di risorse** |
| **Mace Bot** | **Macchina a stati con command block** | **Decisioni randomizzate** | **MC vanilla, nessuna GPU** | **Addestramento Mace PvP** |

Il bot del video è il più vincolato dalle risorse ma il più onesto riguardo al processo. Prima fallisce, poi itera. Dimentica ciò che ha imparato, poi re-impara. Finisce con una combo da 100 colpi: ma anche con una domanda su se ciò che ha costruito sia barare.

---

**Video** : [AI Learns Minecraft PvP](https://www.youtube.com/watch?v=j5nxDKAjg6U) di Kadambi | AI Engineering

**VPT** : [Paper](https://cdn.openai.com/vpt/Paper.pdf) · [Blog](https://openai.com/index/vpt/) · [GitHub](https://github.com/openai/Video-Pre-Training)

**OpenAI Five** : [Paper](https://arxiv.org/abs/1912.06680) · [Blog](https://openai.com/index/dota-2/)

**DreamerV3** : [Paper](https://arxiv.org/abs/2301.04104) · [GitHub](https://github.com/danijar/dreamerv3)

**ANNA** : [GitHub](https://github.com/fox3000foxy/ANNA) · (Node.js, Mineflayer, French NLP, task tree)

**Altoclef** : [GitHub](https://github.com/ga13c/Altoclef) · (Fabric mod, Baritone, task tree, goal-oriented mining)

**Mace Bot** : [Video](https://www.youtube.com/watch?v=Fmp2Il70IF8) di Master Gumbo · (Command blocks, Carpet Mod, state machine)
