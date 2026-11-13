---
title: "L'IA impara il PvP di Minecraft: Imitation Learning, Reinforcement Learning, e le 30 variabili che contavano"
description: "1 000 duelli registrati, rete neurale allenata sui pixel, 90% di precisione dei colpi: e il bot andava dritto contro un muro. Poi sono arrivati RL, apprendimento curriculare e 60 ore di allenamento."
date: 2026-07-09
tags:
  - minecraft
  - ai
  - python
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "qlD3JOQwBbuKNvrncer/vQ+6hEUL8AOlSH6PQ3ft6MGsF3zgoeAfJ217Q/ZrohWd5NZK4DXn6tDRnNVK9RDbUQ=="
---

## Introduzione

![AI Learns Minecraft PvP thumbnail](assets/ai-pvp-thumbnail.png)

C'è un video intitolato [AI Learns Minecraft PvP (Reinforcement Learning + Behavior Cloning)](https://www.youtube.com/watch?v=j5nxDKAjg6U) di Kadambi | AI Engineering, ed è uno dei racconti più onesti di allenamento di un'IA da videogioco che abbia visto.

Il principio: costruire un bot che gioca al PvP di Minecraft (kit spada, armatura di diamante completamente incantata) guardando lo schermo e inviando comandi di mouse e tastiera. Funziona solo con pixel in ingresso e azioni in uscita, senza leggere la memoria del gioco, senza macro e senza mod.

Ciò che rende interessante il video non è il risultato finale. È il percorso: il fallimento dell'imitation learning, il passaggio al feature engineering, i cicli di oblio catastrofico, e le oltre 60 ore di allenamento su un laptop senza GPU.

## Fase 1: Imitation Learning (il fallimento)

![The bot during imitation learning: facing a wall, jumping up and down](assets/ai-pvp-imitation-fail.png)

Il creatore ha iniziato con un approccio sensato: registrare 1 000 duelli del proprio gameplay, associare ogni clic del mouse e pressione di tasto all'immagine corrispondente, e allenare una rete neurale a prevedere le azioni dai pixel.

```python
# Pseudocodice per la pipeline di imitation learning
dataset = record_duels(1000)          # centinaia di migliaia di frame
for frame, action in dataset:
    pixels = capture_screen(frame)
    network.train(pixels → action)    # prevede tastiera/mouse dall'immagine
```

La rete ha imparato a prevedere i colpi con il **90% di precisione**. Promettente.

Poi l'hanno testato in un vero match. Il bot si è diretto dritto verso il bordo della mappa, ha guardato un muro, e ha saltato su e giù.

Perché?

**La trappola della pigrizia.** In un combattimento PvP, il tasto W è premuto quasi sempre. La rete ha capito che poteva raggiungere un'alta precisione tenendo semplicemente premuto W e non facendo altro. Ha ottimizzato l'azione più frequente a scapito di tutte le altre.

**La latenza umana.** Le azioni nel dataset sono ritardate di circa 200 ms di tempo di reazione umano. Frame per frame, causa ed effetto sono quasi impossibili da imparare per un modello dai pixel grezzi quando l'azione e la sua conseguenza visibile sono separate da varie immagini.

**Dimostrazioni incoerenti.** Il gameplay stesso del creatore variava: a volte faceva strafe con la tastiera, a volte mirava col mouse in situazioni identiche. Questi input contraddittori hanno confuso la rete.

## Fase 2: Reinforcement Learning con curriculum

![The bot learning to track horizontally during RL training](assets/ai-pvp-rl-horizontal.png)

Abbandonato l'imitation learning, il creatore è passato al RL. Ma buttare un agente fresco in un duello PvP completo è inutile: succedono troppe cose insieme perché un'esplorazione casuale trovi qualcosa.

La soluzione: **apprendimento curriculare**. Isolare ogni meccanica e lasciare che il bot padroneggi le basi prima di entrare in un vero combattimento.

### Passo 1: Mira orizzontale (7 ore)

La funzione di ricompensa più semplice: ricompensa positiva per colpire un bersaglio, penalità negativa per subire danni.

All'inizio, il bot si muove appena (rete neurale inizializzata con valori neutri). Trema lateralmente: è il bot che prova azioni diverse per vedere quali danno ricompense.

Dopo un'ora, impara a centrarsi orizzontalmente, ma faticosamente lento. Dopo 7 ore, può seguire il nemico a sinistra e a destra, anche se in modo asimmetrico (migliore a spostarsi da destra a sinistra che da sinistra a destra, un comportamento persistito per tutto l'allenamento).

### Passo 2: Feature Engineering

Lo screenshot grezzo superava i 2 milioni di pixel. Anche ridotto a 360p, sono 200 000 input: troppi per un apprendimento efficace.

Il creatore ha analizzato migliaia di duelli e identificato **30 variabili che contano davvero**, divise in tre gruppi:

**Visione (tracciamento nemico)**:
- Distanza del nemico dal mirino (crosshair)
- Dimensione della bounding box del nemico
- Altezza del nemico
- Stato del mirino (su bersaglio / fuori bersaglio)
- Velocità relativa

Invece di elaborare tutta l'immagine, il bot filtra i pixel solo per il colore dell'armatura nemica, rendendo il rilevamento quasi istantaneo. Blocchi di sfondo di colore simile possono disturbare questo filtro: ma in Minecraft puoi semplicemente cambiare le texture.

**OCR (lettura HUD)**:
Dato che il bot non può recuperare le coordinate dal codice del gioco, scansiona lo schermo in tempo reale per estrarre:
- Pitch della camera
- Momentum
- Livello Y

L'OCR standard fatica con il testo trasparente di Minecraft, quindi i dati critici sono forzati in bianco e nero per una lettura istantanea.

**Tempo (finestra di contesto)**:
- Tempo passato da quando hai toccato il nemico
- Tempo passato da quando lui ha toccato te
- Buffer scorrevole delle azioni precedenti del bot

Questo dà alla rete un contesto temporale: senza, il bot non ha idea se è nel mezzo di una combo o se sta appena iniziando un combattimento.

### Passo 3: Mira verticale (altre 7 ore)

![The bot learning to aim up and down during RL training](assets/ai-pvp-rl-vertical.png)

Aggiungere il movimento verticale del mouse è stato "un disastro totale" all'inizio. La performance iniziale era distrutta.

Dopo un'altra ora nel recinto, il bot ha capito come guardare in alto e in basso. Ma nel processo, ha completamente dimenticato come seguire orizzontalmente.

È l'**oblio catastrofico**: un classico problema di machine learning dove ottimizzare per nuovi dati schiaccia le rappresentazioni apprese prima. Ottimizzando la mira verticale, la rete neurale ha accidentalmente cancellato i suoi progressi orizzontali, lasciando il creatore con un bot che poteva tenere il mirino a livello ma non poteva seguire un bersaglio.

Ci sono volute **altre 6 ore** per ritrovare il tracciamento orizzontale mantenendo il controllo verticale. Il bot ha poi mantenuto un buon piazzamento del mirino grazie al gruppo OCR che estraeva il pitch della camera.

### Passo 4: Controllo tastiera

![The bot toggling the W key constantly, learning to commit to movement](assets/ai-pvp-keyboard.png)

Dare al bot il permesso di usare la tastiera ha reso le caratteristiche temporali ancora più critiche. All'inizio, il tasto W era continuamente acceso e spento: un cambio rapido perché la rete non aveva imparato a impegnarsi.

Questo comportamento è stato penalizzato, quindi il bot ha imparato a renderlo fluido. Ha iniziato ad atterrare più colpi in sprint (il tonfo contro il fruscio di un colpo da fermo). Alcune combo sembravano insoddisfacenti perché il bot sfruttava il suo vantaggio di portata sul nemico.

Per rendere le cose eque, il creatore ha aumentato la portata del nemico. Molte strategie apprese dal bot hanno smesso di funzionare. Ma col tempo, si è adattato.

### Passo 5: Insegnare al bot quando cliccare

Per la fase finale, il creatore ha riportato l'imitation learning: ma solo per insegnare il timing dei clic, non la politica di controllo completa. Il bot ha provato a imitare i pattern di clic dei duelli registrati.

All'inizio, aveva troppa paura di provare qualsiasi cosa, temendo la penalità per i clic sbagliati. Ma alla fine ha trovato il coraggio di colpire e atterrare colpi. Certo, ha dimenticato di nuovo come mirare nel processo: il creatore ha dovuto lasciarlo da solo per **altre 50 ore** per tornare a uno stato soddisfacente.

## Il dibattito sul cheating

Il video finisce chiedendo: questo bot bara?

L'argomento contro: il bot elabora solo ciò che un umano vede (gli stessi pixel), invia gli stessi input tastiera/mouse di un umano (senza manipolazione di pacchetti come l'anti-knockback), e non legge la memoria del gioco (niente X-ray né ESP).

L'argomento a favore: un bot può elaborare più in fretta di un umano, e se l'avversario pensa di giocare contro un umano ma non è così, è inganno.

Il parere del creatore: dipende dall'intenzione. Se entrambe le parti sanno che è un bot, il match è equo. Il bot incatena il nemico nel vuoto con una serie di 100 colpi.

## Il risultato

![The bot executing a 100-hit combo](assets/ai-pvp-final-combo.png)

Un bot PvP Minecraft allenato su un **laptop senza GPU**, costruito su una pipeline di allenamento personalizzata con:

- **Screenshot** per l'input pixel (2M+ pixel ridotti a 30 feature progettate)
- **Apprendimento curriculare** (orizzontale, poi verticale, poi tastiera, poi clic)
- **RL per il controllo motorio** + **imitation learning per il timing dei clic**
- **Feature engineering** sui pixel grezzi (3 gruppi: visione, OCR, tempo)
- **Oltre 60 ore di allenamento** su più fasi

Il tempo totale di allenamento è di decine di ore, ma quasi tutte passive. Il bot trema fino alla comprensione, dimentica ciò che ha imparato, re-impara, e finisce per incatenare una serie di 100 colpi.

Il video è su [youtube.com/watch?v=j5nxDKAjg6U](https://www.youtube.com/watch?v=j5nxDKAjg6U).

---

*Questo articolo copre solo il contenuto del video. Per un contesto più ampio sull'IA di Minecraft: VPT, DreamerV3, e il panorama di imitation learning contro RL: le sezioni qui sotto collegano questo progetto al campo più vasto.*

## VPT: Behavior cloning su larga scala

![OpenAI's VPT project diagram : the Inverse Dynamics Model predicts actions from pairs of frames](assets/vpt-overview.svg)

L'approccio "behavior cloning" del video (Fase 1) è la stessa tecnica che OpenAI ha usato nel suo progetto **Video PreTraining (VPT)**, ma agli estremi opposti dello spettro di risorse. VPT ha provato che l'imitation learning funziona per Minecraft quando hai 70 000 ore di video, 720 GPU, e un inverse dynamics model per pseudo-etichettare dati non etichettati. Il creatore qui ha provato che fallisce con un laptop e 1 000 duelli: ma per la stessa ragione fondamentale: l'imitation learning è limitato dalla qualità delle sue dimostrazioni.

![OpenAI's VPT agent mining a tree in Minecraft](assets/vpt-minecraft.jpg)

La pipeline VPT risolve il problema dei dati allenando un **Inverse Dynamics Model (IDM)** che guarda l'immagine t-1 e l'immagine t+1 per prevedere l'azione all'immagine t. Poiché l'IDM è non causale (vede le immagini future), il compito è più facile del behavior cloning e richiede molti meno dati etichettati. Hanno pagato dei contractor circa 2 000 $ per 2 000 ore di dati etichettati, poi hanno usato l'IDM per pseudo-etichettare 70 000 ore di video YouTube di Minecraft.

![Taux de crafting/collecte en fonction du volume de données de pré-entraînement (échelle log) : tables de craft, outils en bois, outils en pierre](assets/vpt-stone-pickaxe-sequence.svg)

L'effetto scala è netto: su un asse log da 1 ora a 100 000 ore di dati di pre-allenamento, il tasso con cui il modello fabbrica un tavolo di craft, attrezzi di legno, poi attrezzi di pietra sale a gradini. Il modello allenato solo sulle 2 000 ore etichettate dai contractor si ferma ai tavoli di craft; è aggiungendo le 70 000 ore pseudo-etichettate dall'IDM (linea tratteggiata sul grafico) che gli attrezzi di pietra emergono in zero-shot, senza un solo passo di RL.

Il modello fondazionale di 0,5B parametri risultante ha raggiunto capacità zero-shot impossibili col solo RL: tagliare alberi, fabbricare tavoli, salto in colonna: e affinato con RL, è diventato la prima IA a fabbricare attrezzi di diamante.

![Récompense en fonction du nombre d'épisodes d'entraînement RL : partir d'un modèle initialisé aléatoirement vs partir du modèle VPT pré-entraîné](assets/vpt-diamond-pickaxe-sequence.svg)

Questo grafico mostra perché il pre-allenamento cambia tutto per il RL a valle. Il RL partito da una rete inizializzata a caso (arancione) resta piatto vicino a 0 per quasi un milione di episodi: il compito "ottenere un diamante" ha una ricompensa troppo sparsa perché un agente ingenuo ci inciampi per esplorazione casuale. Il RL affinato dal modello VPT pre-allenato (verde) parte già col comportamento di base (minare, fabbricare, esplorare) e sale regolarmente fino a una ricompensa di circa 25, che corrisponde al percorso completo verso un piccone di diamante.

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/719971231?h=cbdf2617a1" title="VPT agent gameplay demo 1" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045834?h=9cb4118c65" title="VPT agent gameplay demo 2" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045849?h=00398908ed" title="VPT agent gameplay demo 3" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045863?h=060f07e290" title="VPT agent gameplay demo 4" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

*Demo video ufficiali del progetto VPT di OpenAI, che mostrano l'agente in azione.*

## OpenAI Five: Il problema del reward shaping

![OpenAI Five playing Dota 2 against human professionals](assets/openai-five-dota2.jpg)

OpenAI Five (2019) ha battuto i campioni del mondo di Dota 2 usando RL puro in auto-apprendimento: niente imitation learning. 256 GPU, 128 000 core CPU, 180 anni di gioco al giorno, 10 mesi di allenamento.

Ma la funzione di ricompensa è stata progettata a mano da esperti di Dota: **28 feature sulle 20 000 disponibili**, ognuna con pesi regolati manualmente. Valore netto, uccisioni, morti, salute delle torri, assegnazioni di corsia: tutto è stato selezionato e pesato da umani. Senza questa modellazione, l'agente imparava a malapena (esperimento: ricompensa solo vittoria/sconfitta, poi plateau a livello semi-pro).

Il bot del video affronta lo stesso problema: la sua funzione di ricompensa codifica la comprensione del creatore di ciò che conta in PvP (colpire è bene, essere colpito è male, tenere il mirino è bene). È inevitabile: il RL ha bisogno di un segnale di ricompensa, e modellare quel segnale codifica un bias umano.

## DreamerV3: World model e ricompense sparse

![DreamerV3 benchmark scores across over 150 diverse tasks with a single configuration](assets/dreamerv3-benchmarks.png)

Il DreamerV3 di DeepMind (2023) adotta un terzo approccio. Invece di behavior cloning o RL con incentivi, impara un **world model**: una rete neurale che prevede stati futuri e ricompense dalle azioni passate: e pianifica sognando futuri possibili. È il primo algoritmo a raccogliere diamanti in Minecraft da zero senza dati umani né curricula, pubblicato su Nature nel 2025.

![DreamerV3 learns a world model to imagine future trajectories](assets/dreamerv3-header.png)

L'ambiente diamante definisce una ricompensa sparsa su 12 tappe (tronco, poi assi, poi bastone, poi tavolo di craft, poi piccone di legno, poi pietra, poi piccone di pietra, poi minerale di ferro, poi forno, poi lingotto di ferro, poi piccone di ferro, poi diamante), ognuna dà +1 una sola volta. Più una piccola ricompensa di salute (±0,01 per pv). Totale raggiungibile: 11,1 in un episodio di 36 000 passi.

Il world model di DreamerV3 gli permette di immaginare traiettorie e valutarle internamente: l'attore impara da rollout sognati invece che dall'esperienza reale, testando migliaia di futuri possibili per ogni passo reale. Questo rende possibili le ricompense sparse là dove distruggerebbero un agente RL standard.

Su 40 seed allenati per 100M di passi ambientali, 24 dei 40 hanno raccolto almeno un diamante. Il primo diamante è apparso dopo 29M di passi (circa 9 giorni su una GPU).

## ANNA: L'IA simbolica incontra Minecraft

![ANNA's task tree decomposition for a flint-and-steel](assets/anna-task-tree.png)

Prima del bot PvP del video, prima di VPT e DreamerV3, c'era **ANNA**: un bot Minecraft costruito con una filosofia completamente diversa. Invece di imparare da pixel o ricompense, ANNA usa una **macchina a stati simbolica** con un **parser NLP francese** e un **albero di dipendenze dei compiti** scritto a mano.

Creato nel 2022 (prima che "vibe coding" fosse un termine), ANNA si connette a un server Minecraft via Mineflayer e capisce comandi in linguaggio naturale in francese. Dì *"ottieni un acciarino"*, e ANNA analizza il verbo (ottieni, poi ottenere), cerca la ricetta dell'oggetto, e lo scompone ricorsivamente in sotto-compiti: minare quercia, poi fabbricare assi, poi fabbricare bastoni, poi fabbricare un tavolo di craft, poi fabbricare un piccone di legno, poi minare pietra, poi fabbricare un piccone di pietra, poi minare minerale di ferro, poi fondere lingotti di ferro, poi fabbricare l'acciarino.

![ANNA's NLP parser architecture for French command recognition](assets/anna-nlp-diagram.png)

Lo strato NLP (`utils/id_parser.js`) separa i comandi su "e" per gestire ordini paralleli, associa i verbi francesi ai tipi di compiti, e traduce i nomi di oggetti francesi in identificatori Minecraft via un dizionario di 5 000 voci. I comandi non riconosciuti passano a un sistema di conversazione basato su GPT che presenta ANNA come un compagno Minecraft senziente.

L'**albero dei compiti** (`mc-tasks-tree/`) è il cuore: un algoritmo ricorsivo che percorre il grafo di oggetti Minecraft (ricette di craft, rese minerarie, drop di mostri, ricette di forno) per produrre un piano passo passo. Per un elmo di diamante, genera una scomposizione in oltre 40 passi che copre i livelli legno, pietra, ferro e diamante.

![ANNA's diamond helmet task tree : a 40+ step breakdown](assets/anna-diamond-helmet.png)

Là dove il bot PvP del video impara dall'esperienza, ANNA funziona dalla conoscenza. Non ha bisogno di 1 000 duelli o 60 ore di allenamento: ha bisogno dell'albero, del parser e del server/distributore. Ma non può nemmeno generalizzare oltre ciò che il suo albero codifica. Nessuna quantità di ingegneria di macchine a stati gli insegnerebbe a fare PvP.

L'approccio di ANNA riflette un'epoca diversa dell'IA: prima che l'apprendimento end-to-end dominasse, quando la promessa era che il ragionamento simbolico unito a ingegneria attenta potesse produrre comportamento intelligente. Oggi, progetti come ANNA e il bot PvP rappresentano due poli dell'IA di Minecraft: uno ragiona sul mondo, l'altro lo percepisce.

## Master Gumbo's Mace Bot: IA con soli command block

![The Mace PvP training arena with the bot](assets/mace-bot-arena.png)

In un angolo completamente diverso dell'IA di Minecraft, lo YouTuber **Master Gumbo** ha costruito un bot di allenamento PvP usando **solo command block**, solo con comandi Minecraft vanilla, redstone, e un carpet mod per entità cloni di giocatore. Il risultato è un avversario IA per la massa che pratica cambi di breccia, cariche di vento e meccanismi di scudo col giocatore.

Il bot inizia come uno zombie con equipaggiamento infrangibile e un totem nella seconda mano (riempito a ogni tick via `/item replace`), rendendolo di fatto immortale. Poi, Master Gumbo passa ai bot **player replica del Carpet Mod**, che supportano meccaniche umanoidi (alzata di scudo, cambio oggetto) che gli zombie non possono fare.

![The settings center : buttons to configure bot behavior](assets/mace-settings-center.png)

L'innovazione centrale è una **macchina a stati guidata dal caso**. Un armor stand viene teletrasportato sopra un cerchio di blocchi di cemento colorato via il comando `/spreadplayers`, che disperde le entità a caso. Il colore del blocco di cemento su cui l'armor stand atterra determina la prossima azione del bot:

- **Cemento rosso** → strafe all'indietro
- **Cemento blu** → si alza verso l'alto (attacco) con la carica di vento
- **Cemento verde** → alza lo scudo
- **Cemento bianco** → pausa (aggiunge ritardo tra le azioni)

![The AI decision system : an armor stand on colored concrete](assets/mace-ai-system.png)

La posizione dell'armor stand è letta da command block che rilevano il blocco sotto e attivano il meccanismo corrispondente. Un blocco di redstone viene piazzato o rimosso per attivare/disattivare ogni comportamento. Poiché `/spreadplayers` gira in ripetizione, il bot prende continuamente nuove decisioni, creando un comportamento imprevedibile ma strutturato.

Master Gumbo la chiama "una forma molto semplice e basilare di IA": non impara dalle interazioni come le reti neurali, ma caso + macchina a stati produce un comportamento PvP realistico più difficile da prevedere di un bot scriptato. Il centro impostazioni include un'interfaccia libro per attivare/disattivare l'IA, regolare la difficoltà e configurare i pattern di movimento.

Dopo il suo allenamento col bot e poi in duello contro il giocatore che l'aveva trattato da scarso (nell'intro del suo video), Master Gumbo vince. La mappa è condivisa via Discord, Carpet Mod richiesto.

![The bot in a duel, practicing mace PvP techniques](assets/mace-final-duel.png)

Là dove il bot PvP (Kadambi) impara dai pixel e ANNA ragiona attraverso un albero di compiti, il bot di Master Gumbo raggiunge l'intelligenza con **transizioni di stato casuali**: un approccio puro command block che prova che non servono reti neurali per costruire un avversario PvP convincente.

## Altoclef: Baritone + albero di compiti su larga scala

Se ANNA è un bot simbolico che *legge* per sapere cosa fare, e il Mace Bot randomizza le decisioni, **Altoclef** è un agente autonomo completo che *pianifica* il suo percorso attraverso l'intero gioco. Costruito da gaucho-matero come mod Fabric e spinto dal pathfinding **Baritone**, Altoclef scompone qualsiasi obiettivo Minecraft in un albero di compiti e lo esegue senza intervento umano.

L'interfaccia è ingannevolmente semplice: scrivi `@gamer` in chat, e Altoclef inizia il compito "finire il gioco" da un mondo survival. Raccoglie legno, crafta attrezzi, mina ferro e diamante, costruisce un portale del Nether, raccoglie bastoni Blaze e perle dell'Ender, trova la stronghold, e uccide l'Ender Dragon. Tutto in autonomia, via il client Minecraft nativo, su qualsiasi server vanilla.

Sotto il cofano, questo è realizzato grazie a un **sistema di albero di compiti ricorsivo** dove ogni obiettivo di alto livello (per esempio, "crafta un piccone di diamante") è scomposto in compiti prerequisiti: minare diamante, poi fonderlo, poi craftare bastoni, poi combinarli. L'albero percorre il grafo completo delle ricette Minecraft, gestendo catene di produzione, drop di mostri, tabelle di loot e accesso ai contenitori. A differenza dell'albero scritto a mano di ANNA, i compiti di Altoclef sono **classi Java programmabili** che possono implementare logica arbitraria: strategie di combattimento, baratto coi piglin, pattern di esplorazione.

L'idea architetturale chiave è la separazione del **cosa** (l'albero di compiti) dal **come** (il pathfinding Baritone). Baritone gestisce gli spostamenti di basso livello: pathfinding, evitamento ostacoli, rottura blocchi, gestione inventario, mentre il sistema di compiti orchestra il piano di alto livello. Questa modularità significa che nessun componente deve essere un'IA: sono entrambi algoritmi deterministici, ma la loro combinazione produce un comportamento complesso e orientato a uno scopo che rivaleggia con gli approcci per apprendimento.

Altoclef rappresenta il limite dell'**IA Minecraft simbolica pura**: può finire il gioco da zero senza allenamento, senza GPU, e senza dati umani, ma non può adattarsi a compiti che i suoi programmatori non hanno previsto, e non può imparare dall'esperienza. Sa craftare un piccone di diamante perché una classe Java gli dice esattamente come, non perché l'ha scoperto da solo.

## Cosa li collega

| Approccio | Metodo principale | Dati | Calcolo | Risultato | |
|--------------------------|---------------------|---------|--------|-----------|-|
| Bot PvP del video | RL + imitation learning | 1 000 duelli | 1 laptop, 60h | Combo da 100 colpi | |
| OpenAI Five | RL in auto-apprendimento | 180 anni di gioco/giorno | 256 GPU, 10mesi | Campione del mondo Dota 2 | |
| VPT | IL semi-supervisionato | 70K h YouTube + IDM | 720 GPU, 9 giorni | Attrezzi di diamante | |
| DreamerV3 | RL world model | Tragitti sognati | 1 GPU, 9 giorni | Diamante da zero | |
| **ANNA** | **NLP simbolico + albero di compiti** | **Ricette scritte** | **1 laptop, istantaneo** | **Qualsiasi oggetto craftabile** | |
| **Altoclef** | **Baritone + task tree FS** | **Classi Java di compiti** | **Mod Fabric, no GPU** | **Finisce l'intero gioco** | |
| **Mace Bot** | **Macchina a stati Command block** | **Decisioni casuali** | **MC vanilla, senza GPU** | **Allenamento PvP mazza** | |

Il bot del video è il più vincolato in risorse ma il più onesto sul processo. Fallisce prima, poi itera. Dimentica ciò che ha imparato, poi lo impara di nuovo. Finisce con una combo da 100 colpi: ma anche con una domanda su ciò che ha costruito che bara.

---

**Video**: [AI Learns Minecraft PvP](https://www.youtube.com/watch?v=j5nxDKAjg6U) di Kadambi | AI Engineering

**VPT**: [Articolo](https://cdn.openai.com/vpt/Paper.pdf) · [Blog](https://openai.com/index/vpt/) · [GitHub](https://github.com/openai/Video-Pre-Training)

**OpenAI Five**: [Articolo](https://arxiv.org/abs/1912.06680) · [Blog](https://openai.com/index/dota-2/)

**DreamerV3**: [Articolo](https://arxiv.org/abs/2301.04104) · [GitHub](https://github.com/danijar/dreamerv3)

**ANNA**: [GitHub](https://github.com/fox3000foxy/ANNA) · (Node.js, Mineflayer, NLP francese, albero di compiti)

**Altoclef**: [GitHub](https://github.com/gaucho-matrero/altoclef) · [Fork attivo](https://github.com/drmcbride12/altoclef) · (Fabric, Baritone, task tree, finisce il gioco)

**Mace Bot**: [Video](https://www.youtube.com/watch?v=Fmp2Il70IF8) di Master Gumbo · (Command block, Carpet Mod, macchina a stati)
