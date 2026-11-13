---
title: "I bot di TF2 non sono casuali: ho riscoperto ogni parametro di difficoltà"
description: "Visione, mira, angoli di backstab, logica di headshot, ogni bug noto: Valve non ha mai documentato niente. Così abbiamo scavato nel codice e trasformato tutto in una scheda tecnica completa."
date: 2026-07-12
authors:
  - fox3000foxy
tags:
  - tf2
  - jeu-ia
  - ingenierie-inversee
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "xlkyRcyy+zick/rfOQPUAlY4N736haUUBLnH/E3gkiRuZFi/xRXDltQ+JW65hoVxBhVmbb+J4bZgq4JNMG8Xrg=="
---

## Introduzione

![Soldat bot TF2 visant avec un lance-roquettes](assets/tf2-bot-ai-soldier-aim.png)

Ogni giocatore di TF2 l'ha detto almeno una volta: "questo bot bara." O l'inverso: "perché questo bot Facile resta piantato a mangiare razzi." Nessuno sa davvero cosa "Facile", "Normale", "Difficile" ed "Esperto" significhino sotto il cofano: Valve ha spedito quattro etichette di difficoltà e esattamente zero documentazione.

Così un gruppo di noi (io, awimii, Mush The Possum, con una grossa parte del lavoro di base fatto da sigsegv, che ha davvero scavato nel codice decompilato del gioco) ha riunito un documento di ricerca completo sul comportamento dei TFBot. Ogni meccanica, ogni bug noto, ogni probabilità hardcodata. Questo articolo è il resoconto integrale, non la versione condensata. Prendete un Bonk, sarà lunga.

---

## Capitolo I: le basi

### Bot contro Bot Marionetta

TF2 ha due cose completamente diverse che la gente chiama "bot":

- **Bot IA (TFBot)**: vera IA, costruita sullo stesso framework PlayerBot/Infected che Valve ha usato per la serie *Left 4 Dead*. Scelgono una classe casuale, giocano l'obiettivo, funzionano senza `sv_cheats` e attivano gli achievement come un vero giocatore.
- **Bot Marionetta**: zero IA, incapaci di muoversi o agire da soli. Esistono solo per essere controllati manualmente: un giocatore può forzarli a seguire, mirare e sparare. Usati principalmente per test o per fare screenshot e video cinematici. Farli apparire richiede `sv_cheats 1`, il che disattiva anche gli achievement per la sessione.

Questo articolo riguarda interamente il primo tipo.

### Cosa possiamo (più o meno) dire ai bot IA di fare

I TFBot non sono direttamente controllabili, ma possiamo spingerli a fare certe cose:

- Punta qualsiasi bot (alleato o nemico) col tuo crosshair e ti schernirà se usi i giusti comandi vocali.
- Un bot Medic alleato ti cura se usi il comando vocale "Medic!"
- Se un bot Medic ti cura e ha una UberCharge pronta, dire "Go go go!" o "Attiva la carica!" lo fa scattare la carica subito.
- Un bot Medic con una carica pronta l'attiva automaticamente appena lui stesso o il suo bersaglio di cura subisce danni seri, senza comando vocale necessario.
- I bot eseguono spontaneamente scherni in duo (High Five) o scherni di gruppo (Conga) con compagni vicini.

### Far funzionare i bot su mappe non supportate

I bot dipendono da una mesh di navigazione per sapere dove hanno diritto di camminare, e quasi tutte le mappe community non ne forniscono una. Per forzare:

1. `sv_cheats 1`
2. `nav_generate`: costruisce la navmesh iniziale, progressione mostrata in console
3. Aspetta che il gioco finisca di generare i percorsi
4. Opzionalmente, correggi manualmente i cattivi dati di navigazione con `nav_edit 1`
5. Ricarica o riavvia il server (saltare questo passo disattiva gli achievement)
6. `tf_bot_add <numero>` per far apparire i bot

**Avviso:** modificare la navmesh mentre ci sono bot attivi sul server può piantare il gioco. Una volta che la mesh esiste, non devi rigenerarla per le sessioni future: aggiungi semplicemente i bot con `tf_bot_add`.

Le mesh auto-generate funzionano meglio sulle mappe Punto di Controllo, King of the Hill, Payload e CTF. Sulle mappe Mannpower, i bot adottano di default un comportamento tipo CTF ma usano a malapena rampini o powerup. Se una mappa non ha un obiettivo che l'IA del bot riconosce ma ha un'entità di stanza di spawn, definire `tf_bot_offense_must_push_time 0` permette ai bot di combattere comunque.

*(Fonte per questa sezione: la pagina Bot del wiki ufficiale TF2.)*

### Stato attuale, mappa per mappa

Grazie all'aggiornamento Hatless, ogni classe funziona correttamente ora, compreso lo Spy storicamente buggato. I bot si comportano correttamente sulla maggior parte delle mappe KOTH ufficiali, certe mappe Payload, Dustbowl/Gorge Attack-Defense e le mappe CTF/Mann Manor. Su queste ultime due, non puoi farli apparire direttamente con `tf_bot_add`. Sulle mappe non supportate (via il processo nav_generate qui sopra), funzionano, ma sono nettamente meno bravi a imitare un vero giocatore.

Le mappe PLR sono una causa persa: i bot non possono superare le barriere su Hightower e si incastrano negli angoli, e su tutte le altre mappe PLR fanno solo... una festa danzante invece di giocare. Forse sarà corretto un giorno, forse resterà così.

### Comportamento generale dei bot

Un calderone di cose che ogni bot fa indipendentemente dal suo livello:

- I bot usano solo loadout di base (un plugin può forzarli ad armi non standard, ma i bot vanilla non scelgono mai le loro).
- I bot Facili usano a malapena la loro arma secondaria. Le difficoltà superiori passano all'arma secondaria appena il caricatore principale è vuoto, o per compensare la distanza.
- I bot ignorano le tecniche di movimento avanzate: niente rocket jump, niente rilocazione di edifici.
- Dopo una kill, un bot può schernire, anche sotto il fuoco, a meno che porti l'intelligence nemica, e questa regola si applica anche in MvM.
- I bot Spy travestiti (giocatore o IA) sono correttamente ignorati dagli altri bot: finché non toccano un nemico, sabotano qualcosa, sparano o diventano invisibili vicino a uno. Una volta "scoperti", quel bot/giocatore specifico è memorizzato come Spy finché non cambia travestimento restando invisibile, muore o finge la morte col Dead Ringer.
- I bot Pyro usano la Compression Blast liberamente dal livello Normale.
- I bot Medic priorizzano le cure su tutti tranne gli Sniper (e, in misura minore, gli Engineer), anche se spami "Medic!" come tale.
- I bot Medic gravitano verso Heavy, Soldier, Demoman e Pyro: specificamente quando un *umano* gioca queste classi. Questa attenzione segue la presenza di un umano in questi ruoli.
- I bot restano in posizione durante il tempo di preparazione sulle mappe Attack/Defense e Payload, tranne Engineer, Sniper e Spy, che si muovono liberamente (i bot Demoman sono anche autorizzati a pre-piazzare sticky bomb).
- I bot Engineer non migliorano né disattivano mai le costruzioni di un altro Engineer alleato, a meno che questa costruzione si trovi sul percorso del loro bersaglio. A volte semplicemente non riparano la loro torretta, anche quando sembra ovvio.
- I bot Spy beccati passano al loro revolver e indietreggiano invece di forzare un colpo di coltello.
- I bot Demoman che hanno localizzato una sentry (generalmente morendoci sopra una volta) possono lanciare perfettamente sticky bomb sopra da fuori la sua portata, in arco attraverso muri e soffitti quando la geometria lo permette.
- I bot Sniper che non trovano un bersaglio dopo aver mirato usano una delle linee vocali "Negative."
- I Medic alleati curano uno Spy travestito senza esitazione.

### Problemi / bug noti

Il documento elenca un buon numero di stranezze di lunga data:

- I bot possono provare a camminare o sparare attraverso certi prop statici.
- Ogni volta che un giocatore/bot si smaschera, si traveste o si rivela, i bot vicini lo "vedono" e si girano per reagire: anche se l'evento è avvenuto fuori dal loro reale campo visivo. Non è basato sul suono; è una scappatoia del test di visione.
- Raramente, i bot possono restare fisicamente incastrati insieme usando un teletrasporto di Engineer.
- I comandi vocali dei bot (es. "Spy!", "Avanti!") non si mostrano in testo nella chat come quelli dei giocatori.
- Un bot Medic che cura attivamente qualcuno non schiverà i colpi in arrivo né prenderà kit di cura, anche a PV critici.
- I bot possono continuare a muoversi durante uno scherno in duo, il che rompe l'effetto previsto del Festive Critical Strike.
- I bot Medic da poco feriti rifiutano spesso di usare la Syringe Gun a distanza, preferendo il corpo a corpo (o, in casi molto rari, provando a toccarti col raggio del Medi Gun stesso).
- I bot Medic non compensano la gravità per i colpi della Syringe Gun: probabilmente perché l'arma non è correttamente segnata come non-hitscan nel codice IA.
- I bot Spy possono vedere e seguire uno Spy invisibile (giocatore o IA) se questo Spy è già stato scoperto una volta, indipendentemente dal livello di abilità del bot che lo segue.
- Anche se un giocatore-Spy si traveste da classe della sua squadra, urtare un nemico lo smaschera comunque (i bot non fanno mai questo a se stessi, dato che i bot non si travestono mai da loro squadra).
- I bot rispettano il bilanciamento automatico delle squadre: se provi ad ammassare bot da un lato, devi prima usare `mp_teams_unbalance_limit 0`.
- I bot Engineer possono ignorare completamente le proprie costruzioni finché non sono distrutte.
- I bot Heavy provano a volte a sparare col Minigun mentre sono a corto di munizioni, soprattutto sotto il livello Difficile.
- I bot Medic della squadra perdente si suicidano occasionalmente durante la fase di Umiliazione quando nessun nemico è vicino: qualcosa che un giocatore umano non può riprodurre nemmeno provandoci.
- Regolare la tua anteprima di squadra su BLU nella schermata di caricamento fa sì che i bot RED ti sembrino visivamente resi in BLU.
- I bot con un'arma corpo a corpo fuori rifiutano a volte di cambiare arma anche dopo aver raccolto munizioni.
- Dopo Jungle Inferno, i bot apparsi con parametri espliciti (es. `tf_bot_add 5 pyro blu normale`) possono morire istantaneamente nella loro stanza di spawn. Correzione: `tf_bot_reevaluate_class_in_spawnroom 0` (richiede `sv_cheats 1`).

### Nomi delle IA

I nomi dei bot sono presi da un grande serbatoio di riferimenti a TF2, ad altri giochi Valve e alla cultura di programmazione, in gran parte perché la community non smetteva di chiederne di specifici sui forum Steam. Un campione della lista: *AimBot, Aperture Science Prototype XR7, Black Mesa, Companion Cube, C++, Divide by Zero, GLaDOS, H@XX0RZ, Saxton Hale, The G-Man, trigger_hurt, 0xDEADBEEF*, e decine di altri dello stesso genere.

C'è anche un lotto di nomi trovati in un build sorgente trapelato mai spedito in produzione, per ragioni poco chiare: principalmente riferimenti a *Last Dragon* e *The Fifth Element* come *John Spartan, Leeloo Dallas Multipass, Sho'nuff, Bruce Leroy, Big Gulp Huh?* e *I'm your huckleberry*.

Puoi sostituire tutto questo da solo: `tf_bot_add heavyweapons blue "Blu Hoovy"` fa apparire un Heavy BLU chiamato "Blu Hoovy."

---

## Capitolo II: i Bot Originali / TFBot: immersione nei livelli di abilità

La cornice originale di Sigsegv tiene ancora: è ovvio che i bot Esperti superano i bot Facili, ma Valve non ha mai spiegato *quanto* né *perché*. Quindi l'unico modo di sapere è leggere il codice. Ecco ogni meccanica che evolve con l'abilità.

### Regolare la difficoltà

Fuori dal MvM, la difficoltà è controllata da una cvar:

| `tf_bot_difficulty` | Livello di difficoltà |
| --- | --- |
| 0 | Facile |
| 1 | Normale (default) |
| 2 | Difficile |
| 3 | Esperto |

`tf_bot_add` accetta anche un argomento di difficoltà direttamente (`easy`/`normal`/`hard`/`expert`).

### Popfile MvM

In Mann vs. Machine, ogni blocco di spawn `TFBot` nel popfile ha una chiave `Skill` opzionale. L'assenza di chiave corrisponde al livello Facile. Nelle missioni di Valve: i Giganti sono quasi sempre Esperti, gli Engineer e gli Spy sono quasi sempre Esperti, e gli Sniper sono generalmente Difficili (occasionalmente Esperti). Se usi `EventChangeAttributes` (aggiunto nell'aggiornamento Two Cities) per modificare dinamicamente i bot in corso di ondata in base a eventi di mappa, l'abilità del bot è una delle proprietà che puoi cambiare al volo.

### Modalità Endless MvM

La modalità Endless non è mai stata ufficialmente spedita, ma dentro, i bot spendono i loro soldi in miglioramenti come i giocatori, compresa un miglioramento esclusivo ai bot che aumenta il loro livello di abilità IA in corso di gioco.

### L'entità `bot_generator`

Un'entità oscura, largamente non documentata, presunta usata nella modalità allenamento e forse nello sviluppo precoce del MvM. Espone un input `SetDifficulty` per controllare il livello di abilità. Oltre, la pista si raffredda: Valve non l'ha mai documentata e nessuno ha interamente mappato il suo comportamento.

### Colore del bagliore oculare

I robot MvM hanno una particella di bagliore oculare che cambia colore col livello di abilità, un indicatore visivo che nessuno fuori dalla community ha mai spiegato:

| Abilità | Colore degli occhi | RGB |
| --- | --- | --- |
| Facile/Normale | Blu | `#24b4ff` |
| Difficile/Esperto | Giallo | `#fff000` |

![Heavy bot TF2 in posizione d'attesa](assets/tf2-bot-ai-heavy-idle.png)

### Visione: tempo di riconoscimento

Un bot non reagisce istantaneamente quando qualcosa entra nel suo campo visivo: c'è un ritardo hardcodato prima che il resto dell'IA sia persino autorizzato a riconoscere la minaccia:

| Abilità | Tempo di riconoscimento minimo |
| --- | --- |
| Facile | 1,00 s |
| Normale | 0,50 s |
| Difficile | 0,30 s |
| Esperto | 0,20 s |

È l'essenziale dell'effetto "i bot Facili sembrano stupidi" in un solo numero: un bot Facile non mira peggio una volta che ti ha notato, mette solo cinque volte più tempo a notare la tua esistenza.

### Mira: tasso di inseguimento

I bot non ti tracciano in continuo. Campionano la tua posizione e la tua velocità a un intervallo fisso e prevedono una linea retta da lì:

| Abilità | Intervallo di ricalcolo | Tasso equivalente |
| --- | --- | --- |
| Facile | 1,00 s | 1x/s |
| Normale | 0,25 s | 4x/s |
| Difficile | 0,10 s | 10x/s |
| Esperto | 0,05 s | 20x/s |

**Eccezione:** i bot Spy sono hardcodati col tasso di inseguimento Normale qualsiasi sia il loro reale livello di abilità: uno Spy Esperto mira sempre come un bot Normale. Esiste anche un video dimostrativo pubblico che confronta i tassi di inseguimento fianco a fianco se vuoi vedere lo scarto 1x contro 20x in movimento.

### Mira: abilità specifica per arma

I bot non mirano solo al tuo centro di massa: hanno una logica per arma, a volte davvero buggata:

**Lanciagranate e Lanciabombe adesive.** Tutti i livelli di abilità compensano l'arco verticale, usando un valore fisso della cvar `tf_bot_ballistic_elevation_rate`. Poiché questa compensazione scatta solo per l'ID di arma di base, le varianti di proiettili più rapidi (Loch-n-Load, tutto ciò che ha un modificatore di velocità proiettile) non hanno arco correttamente aggiustato. E dato che è legato all'ID di arma specificamente, il Loose Cannon (un ID diverso) non riceve alcuna compensazione di arco.

**Huntsman.** I bot Facili non compensano la caduta della freccia e non cercano mai gli headshot. I bot di livello Normale compensano l'arco, ma mirano alla testa solo a meno di 150 HU. I bot Difficile/Esperto mirano sempre alla testa.

**Lanciarazzi.** Oltre 150 HU, i bot non-Facili mirano ai tuoi piedi invece del centro di massa, massimizzando le probabilità di danni ad area e spinta. Sotto 150 HU, passano agli headshot. I bot Facili mirano sempre al centro di massa qualsiasi sia la distanza. Anche questo è bloccato per ID di arma: il Direct Hit e il Cow Mangler non ereditano questo comportamento. Logico per il Direct Hit (niente area di effetto da sfruttare); zero senso per il Cow Mangler: questa parte dell'IA predata l'esistenza dell'arma e non è semplicemente mai stata rivista.

**Fucili da cecchino.** Facile mira al corpo. Normale mira circa al 33% dal corpo verso la testa. Difficile/Esperto mirano direttamente alla testa. Meno importante in MvM, dove gli headshot dei bot non ottengono comunque il bonus di danni.

### Udito: sensibilità ai colpi discreti

Ogni colpo avvisa i bot vicini della posizione del tiratore, anche attraverso i muri, fino a 3000 HU con 100% di probabilità di essere notato (`tf_bot_notice_gunfire_range`). Ma un sottoinsieme di armi è segnato "discreto": udibile solo entro 500 HU (`tf_bot_notice_quiet_gunfire_range`), e anche allora con una probabilità dipendente dall'abilità:

| Abilità | Probabilità di notare un colpo discreto |
| --- | --- |
| Facile | 10% |
| Normale | 30% |
| Difficile | 60% |
| Esperto | 90% |

Questa probabilità è dimezzata se un colpo *rumoroso* è stato sentito negli ultimi 3 secondi: i suoni forti mascherano i suoni deboli.

La lista degli ID di armi discrete non è stata aggiornata dal dicembre 2010. Qualsiasi aggiunta successiva che usa un nuovo ID di arma è trattata come rumorosa di default, non importa quanto logicamente dovrebbe essere discreta, a meno che riusi un ID più vecchio. In concreto:

| ID di arma | Copre |
| --- | --- |
| `TF_WEAPON_KNIFE` | Tutti i coltelli di Spy |
| `TF_WEAPON_FISTS` | Pugni specifici dell'Heavy (il suo pugno multi-classe è in realtà `TF_WEAPON_FIREAXE`) |
| `TF_WEAPON_PDA` | Presunto inutilizzato direttamente |
| `TF_WEAPON_PDA_ENGINEER_BUILD` | PDA di costruzione dell'Engineer |
| `TF_WEAPON_PDA_ENGINEER_DESTROY` | PDA di distruzione dell'Engineer |
| `TF_WEAPON_PDA_SPY` | Kit di travestimento dello Spy |
| `TF_WEAPON_BUILDER` | Kit di attrezzi di Spy/Engineer/Sabotatore |
| `TF_WEAPON_MEDIGUN` | Tutti i Medi Gun |
| `TF_WEAPON_DISPENSER` | Probabilmente inutilizzato (i Dispenser sono oggetti, non armi) |
| `TF_WEAPON_INVIS` | Tutti gli orologi di invisibilità di Spy |
| `TF_WEAPON_FLAREGUN` | Tutte le pistole a razzi Pyro *tranne* il Manmelter |
| `TF_WEAPON_LUNCHBOX` | Sandwich, Dalokohs Bar, Buffalo Steak Sandvich, Bonk!, Crit-a-Cola |
| `TF_WEAPON_JAR` | Jarate (non Mad Milk: ID separato, non discreto) |
| `TF_WEAPON_COMPOUND_BOW` | Huntsman |
| `TF_WEAPON_SWORD` | Eyelander, Skullcutter, Claidheamh Mor, Persian Persuader, Half-Zatoichi |
| `TF_WEAPON_CROSSBOW` | Crusader's Crossbow |

L'esempio classico della lista che marcisce: il Manmelter ha ricevuto il suo ID (`TF_WEAPON_RAYGUN_REVENGE`), aggiunto dopo che la lista delle armi discrete era stata congelata, quindi è trattato come rumoroso, nonostante sia una pistola a razzi in tutti i sensi pratici. Lo Scorch Shot, uscito ancora dopo, riusa l'ID di base `TF_WEAPON_FLAREGUN` ed è quindi sempre considerato discreto. Insensato, ma è il codice.

### Strategia: prioritizzazione delle minacce

Quando più nemici sono visibili insieme, i bot pesano la distanza, se si fanno sparare addosso e, sopra Facile, se la minaccia principale è curata:

| Abilità | Mira al curatore invece? |
| --- | --- |
| Facile | No |
| Normale | 50% di probabilità |
| Difficile | Sì |
| Esperto | Sì |

I nemici a oltre 500 HU sono normalmente deprioritizzati come non immediati. Eccezioni: i bot Difficile/Esperto trattano sempre Medic ed Engineer lontani come minacce immediate, e qualsiasi Sniper nemico che mira approssimativamente nella tua direzione è sempre trattato come immediato qualsiasi sia la distanza e l'abilità.

| Abilità | Medic/Engineer lontani/Sniper che mira = minaccia immediata? |
| --- | --- |
| Facile/Normale | No |
| Difficile/Esperto | Sì |

Questa verifica dello Sniper ha una storia sorprendente che amo sempre raccontare. Lo scritto originale di Sigsegv supponeva che il gioco esigesse che il prodotto scalare tra il vettore di mira del cecchino e la posizione relativa del bot fosse *esattamente zero*: un confronto così preciso da non scattare quasi mai in calcolo float, rendendo tutta la funzionalità di fatto codice morto. Una correzione pubblicata dopo (credito a una decompilazione Hex-Rays più pulita) ha mostrato che la verifica reale è `prodotto scalare > 0`: qualsiasi Sniper che guarda da direttamente verso di te a perpendicolare a te è considerato minaccia immediata; tutto ciò che va da perpendicolare a spalle girate non lo è. La cattiva lettura originale veniva da una cattiva decompilazione di un confronto SSE di float. Fare reverse-engineering su un binario AAA resta un esercizio approssimativo.

### Movimento: schivata

I bot Facili non schivano mai, punto finale. I bot Normale e superiori schivano a sinistra/destra (33% sinistra, 33% destra, 33% non fare niente, pesato contro i buchi rilevati) quando tengono un'arma da combattimento, hanno visto un nemico negli ultimi 3 secondi e questo nemico ha una linea di vista su di loro.

Non schiveranno *se* uno di questi casi si applica: attributo `DisableDodge` definito, comportamento attuale dice di sbrigarsi, attualmente invulnerabile (qualsiasi uber), in pieno scherno/provocazione, gioca Engineer, invisibile o travestito da Spy, in mira come Sniper o in rotazione come Heavy, o mentre tende l'Huntsman.

### Movimento: evitare di urtare i nemici

Sopra Normale, i bot provano specificamente a non entrare nei nemici spostandosi:

| Abilità | Evita di urtare i nemici? |
| --- | --- |
| Facile | No |
| Normale | No |
| Difficile | Sì |
| Esperto | Sì |

In pratica, conta solo per i bot Spy: evitare una collisione imbarazzante con un giocatore nemico è esattamente il tipo di cosa che compromette un travestimento.

### Pyro: padronanza dell'airblast

L'airblast serve a due cose: riflettere i proiettili (PvP e MvM) e spingere i nemici vicini ai bordi (solo PvP). Che il bot prema o no il grilletto davanti a un'opportunità valida è un testa o croce basato sull'abilità:

| Abilità | Probabilità di innescare l'airblast |
| --- | --- |
| Facile | 0% |
| Normale | 50% |
| Difficile | 90% |
| Esperto | 100% |

I bot Pyro Facili non possono letteralmente fare airblast: il tiro è hardcodato per non riuscire mai, non solo "raramente."

### Spy: efficacia del travestimento

Due assi distinti evolvono con l'abilità. Scelta del *travestimento*:

| Abilità | Metodo di travestimento |
| --- | --- |
| Facile/Normale | Classe casuale, ignorando ciò che la squadra nemica gioca davvero |
| Difficile/Esperto | Sceglie un vero giocatore nemico e copia la sua classe esatta |

*Comportamento* in travestimento:

| Abilità | Comportamento in travestimento/invisibilità |
| --- | --- |
| Facile/Normale | Fissa i giocatori nemici quando li vede (sospetto) |
| Difficile/Esperto | Evita deliberatamente il contatto visivo (più convincente) |

### Spy: aggressività del backstab

A lunga portata (fino a 300 HU, `tf_bot_spy_knife_range`), un bot Spy si impegna in un backstab solo se può vedere la vittima e la schiena della vittima è almeno parzialmente girata. L'abilità determina quanto questo angolo di schiena può essere decentrato:

| Abilità | Tolleranza di angolo |
| --- | --- |
| Facile | Prova anche se gli fai fronte direttamente |
| Normale | ±45° dalla tua schiena |
| Difficile | ±78° dalla tua schiena |
| Esperto | ±90° dalla tua schiena (arco posteriore completo di 180°) |

I bot Spy Facili sono funzionalmente suicidi: proveranno un colpo di coltello su qualcuno che li guarda dritto negli occhi. **Eccezione:** in Mann vs. Machine, ogni bot Spy è forzato al vincolo di angolo Normale qualsiasi sia il suo reale livello di abilità.

### Tattiche: selezione di armi

Questa logica riguarda solo i livelli sopra Facile, con interesse ridotto in MvM dato che i bot lì hanno generalmente restrizioni di armi strette:

- **Scout**: passa all'arma secondaria quando il caricatore del primario è vuoto.
- **Soldier**: passa all'arma secondaria quando il caricatore è vuoto *e* il bersaglio è a meno di 500 HU.
- **Sniper**: passa all'arma secondaria per bersagli a meno di 750 HU.
- **Pyro**: passa all'arma secondaria per bersagli a oltre 750 HU, a meno che questo bersaglio sia un Soldier o un Demoman.

### Tattiche: ricarica al coperto

Logica assente dal MvM. Se il comportamento attuale del bot non gli dice di ritirarsi, il suo caricatore principale è vuoto e resta vulnerabile senza uber, i bot di livello superiore si ritirano temporaneamente al coperto per ricaricare invece di cliccare su un'arma vuota davanti a te:

| Abilità | Si ritira per ricaricare? |
| --- | --- |
| Facile | No |
| Normale | No |
| Difficile | Sì |
| Esperto | Sì |

### Modalità CP: vagabondaggio del difensore

Logica assente dal MvM. Difendendo un punto di controllo, i bot di livello superiore sono più propensi a lasciare il punto per cacciare kill ("search and destroy"), ma solo con tempo decente restante su `tf_bot_defense_must_defend_time`:

| Abilità | Probabilità di vagare |
| --- | --- |
| Facile | 10% |
| Normale | 50% |
| Difficile | 75% |
| Esperto | 90% |

### Modalità CP: blocco di cattura

Logica assente dal MvM. I bot difensori che contestano un tentativo di cattura nemico:

| Abilità | Proverà a bloccare la cattura? |
| --- | --- |
| Facile | No |
| Normale | 50% di probabilità |
| Difficile | Sì |
| Esperto | Sì |

---

## Il quadro riepilogativo completo

<div style="overflow-x:auto">

| Aspetto | Facile | Normale | Difficile | Esperto | Note |
| --- | --- | --- | --- | --- | --- |
| Visione: tempo di riconoscimento | 1,00s | 0,50s | 0,30s | 0,20s | |
| Mira: tasso di inseguimento | 1x/s | 4x/s | 10x/s | 20x/s | Gli Spy usano sempre Normale |
| Compensazione arco granata/sticky | Sì | Sì | Sì | Sì | Loose Cannon esente |
| Compensazione verticale Huntsman | No | Sì | Sì | Sì | |
| Headshot Huntsman | No | <150 HU | Sì | Sì | |
| Tiro ai piedi Lanciarazzi | No | Sì | Sì | Sì | Direct Hit e Cow Mangler esenti |
| Punto di mira Fucile da cecchino | Corpo | circa 33% verso testa | Testa | Testa | |
| Probabilità di notare colpi discreti | 10% | 30% | 60% | 90% | Dimezzata se mascherata da colpi rumorosi |
| Mira al curatore | No | 50% | Sì | Sì | |
| Medic/Engineer/Sniper lontani = minaccia | No | No | Sì | Sì | |
| Schivata | No | Sì | Sì | Sì | Lunga lista di eccezioni |
| Evita di urtare i nemici | No | No | Sì | Sì | Soprattutto importante per Spy |
| Probabilità di innescare l'airblast | 0% | 50% | 90% | 100% | |
| Scelta classe travestimento Spy | Casuale | Casuale | Corrisponde a un vero nemico | Corrisponde a un vero nemico | |
| Contatto visivo Spy in travestimento | Fissa (evidente) | Fissa | Evita (convincente) | Evita | |
| Angolo di backstab Spy | circa 0° | ±45° | ±78° | ±90° | MvM forza Normale |
| Logica di selezione armi | No | Sì | Sì | Sì | Meno rilevante in MvM |
| Ricarica al coperto | No | No | Sì | Sì | Non in MvM |
| Vagabondaggio difensore CP | 10% | 50% | 75% | 90% | Non in MvM |
| Blocco cattura CP | No | 50% | Sì | Sì | Non in MvM |

</div>

---

## Conclusione

![Heavy bot TF2 visant avec un minigun](assets/tf2-bot-ai-heavy-aim.png)

Tutto questo riflette un sistema deliberato di Valve: punteggi e probabilità interamente deterministici, semplicemente mai documentati ufficialmente. Ecco i punti che trattengo dopo questa immersione:

1. **L'"abilità" è un insieme di cursori indipendenti**, non un moltiplicatore globale. Il tempo di reazione, la cadenza di mira e ogni comportamento tattico evolvono separatamente, e alcuni (tasso di inseguimento Spy, angolo di backstab MvM) hanno override hardcodati qualsiasi sia il livello.
2. **Una parte è davvero buggata, non solo vecchia.** La lista delle armi discrete congelata dal 2010, il Cow Mangler senza logica di tiro ai piedi senza buona ragione, la verifica del prodotto scalare dello Sniper che ha preso anni per essere decompilata correttamente: il codice IA di Valve ha cicatrici come qualsiasi codebase di 17 anni.
3. **Potete usare tutto questo.** Sappiate che un bot Sniper non vi farà headshot in Normale, che un Pyro Facile non può letteralmente riflettere il vostro razzo, che uno Spy Facile proverà a pugnalarvi faccia a faccia. Non è fortuna. È una scheda tecnica.

Un immenso grazie a sigsegv per l'immersione nel codice originale che ha reso possibile gran parte di questo, al wiki TF2 per la documentazione di base sui comandi di bot e il supporto delle mappe, e a tutti quelli nella community che continuano a trafficare un'IA di bot vecchia di 17 anni per capire esattamente perché fa ciò che fa.
