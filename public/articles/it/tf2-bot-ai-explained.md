---
title: "I Bot di TF2 Non Sono Casuali: Ho Reverse-Engineered Ogni Impostazione di Difficoltà"
description: "Visione, tracciamento della mira, angoli delle pugnalate alle spalle della Spia, logica dei colpi in testa del Cecchino, ogni bug conosciuto -- Valve non ha mai documentato nulla. Quindi abbiamo frugato nel codice e l'abbiamo trasformato in un foglio tecnico completo."
date: 2026-07-12
authors:
  - fox3000foxy
tags:
  - tf2
  - game-ai
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "nFO9WIblnbIq0CIV4wJbO59P1MFMb7iOJ4Wftbhf0JGtRBua9berfeXnW3f0sx/GExdVBMi98StapRCkiD+peg=="
---

## Introduzione

![Soldato bot di TF2 che mira con un lanciarazzi](assets/tf2-bot-ai-soldier-aim.png)

Ogni giocatore di TF2 lo ha detto almeno una volta: "questo bot sta barando." O l'opposto: "perché questo bot Facile se ne sta lì fermo a mangiarsi razzi." Nessuno sa veramente cosa "Facile," "Normale," "Difficile," ed "Esperto" significhino effettivamente sotto il cofano -- Valve ha pubblicato quattro etichette di difficoltà e zero documentazione.

Quindi un gruppo di noi (io, awimii, Mush The Possum, con un'enorme parte del lavoro preparatorio fatto da sigsegv, che si è davvero immerso nel codice decompilato del gioco) ha messo insieme un documento di ricerca completo sul comportamento dei TFBot. Ogni meccanica, ogni bug conosciuto, ogni probabilità hardcoded. Questo articolo è il resoconto completo, non quello condensato. Prenditi un Bonk, questo è lungo.

---

## Capitolo I: Le Basi

### Bot vs Puppet Bot

TF2 ha due cose completamente diverse che la gente chiama "bot":

- **Bot AI (TFBot)**: vera IA, costruita sullo stesso framework PlayerBot/Infected che Valve ha usato per la serie *Left 4 Dead*. Scelgono una classe casuale, giocano per l'obiettivo, funzionano senza `sv_cheats`, e attivano gli achievement come farebbe un vero giocatore.
- **Puppet bot (burattini)**: zero IA, non possono muoversi o agire da soli. Esistono puramente per essere controllati manualmente -- un giocatore può forzarli a seguire, mirare e sparare, usati principalmente per test o per fare screenshot/video cinematografici. Generarli richiede `sv_cheats 1`, che disabilita anche gli achievement per la sessione.

Questo articolo parla interamente del primo tipo.

### Cosa si può (più o meno) dire ai bot AI di fare

I TFBot non sono direttamente controllabili, ma c'è una breve lista di cose che puoi spingerli a fare:

- Punta il mirino verso qualsiasi bot (amico o nemico) e farà una provocazione se usi i giusti comandi vocali.
- Un bot Medico amico ti cura se usi il comando vocale "Medico!"
- Se un bot Medico ti sta curando e ha un ÜberCharge pronto, dire "Andiamo andiamo!" o "Attiva carica!" lo farà attivare immediatamente.
- Un bot Medico con la carica pronta la attiverà automaticamente nel momento in cui lui o il suo bersaglio curato subisce danni seri, senza bisogno di comandi vocali.
- I bot eseguono spontaneamente provocazioni di coppia (Batti il Cinque) o di gruppo (Conga) con i compagni di squadra nelle vicinanze.

### Far funzionare i bot su mappe non supportate

I bot si basano su un navigation mesh per sapere dove possono camminare, e la maggior parte delle mappe della community non ne include una. Per forzarlo:

1. `sv_cheats 1`
2. `nav_generate` -- costruisce il navmesh iniziale, l'avanzamento è mostrato in console
3. Aspetta che il gioco finisca di generare i percorsi
4. Opzionalmente correggi i dati di navigazione errati manualmente con `nav_edit 1`
5. Ricarica o riavvia il server (saltare questo passaggio disabilita gli achievement)
6. `tf_bot_add <numero>` per far effettivamente spawnare i bot

**Attenzione:** modificare il navmesh mentre i bot sono attivi sul server può far crashare il gioco. Una volta che la mesh esiste, non devi rigenerarla per le sessioni future -- basta riaggiungere i bot con `tf_bot_add`.

Le mesh generate automaticamente funzionano meglio sulle mappe Control Point, King of the Hill, Payload e CTF. Sulle mappe Mannpower i bot usano per impostazione predefinita lo stile CTF ma usano a malapena i rampini o i potenziamenti. Se una mappa non ha un obiettivo che l'IA dei bot riconosce ma ha un'entità spawn room, impostare `tf_bot_offense_must_push_time 0` permette comunque ai bot di combattere.

*(Fonte per questa sezione: la pagina ufficiale dei Bot della Wiki di TF2.)*

### Stato attuale, mappa per mappa

Grazie all'aggiornamento Hatless, ogni classe funziona correttamente ora, inclusa la Spia, storicamente piena di bug. I bot si comportano correttamente sulla maggior parte delle mappe KOTH ufficiali, alcune mappe Payload, Dustbowl/Gorge Attack-Defense, e mappe CTF/Mann Manor -- anche se su queste ultime due non puoi generarli direttamente con `tf_bot_add`. Sulle mappe non supportate (tramite il processo nav_generate sopra) funzionano, ma sono notevolmente peggiori nell'imitare un vero giocatore.

Le mappe PLR sono una causa persa: i bot non riescono a superare le barriere su Hightower e si bloccano negli angoli, e su ogni altra mappa PLR fanno... un party di ballo invece di giocare. Potrebbe essere sistemato un giorno. O forse no.

### Comportamento generale dei bot

Una raccolta di cose che ogni bot fa indipendentemente dall'abilità:

- I bot usano solo equipaggiamento base (un plugin può forzare armi non standard, ma i bot vanilla non scelgono mai le proprie).
- I bot Facile usano a malapena l'arma secondaria. Le difficoltà superiori passano alla secondaria appena la primaria è scarica, o per compensare la distanza.
- I bot non sanno fare tecniche di movimento -- niente rocket jump, niente spostamento di costruzioni.
- Dopo un'uccisione, un bot può fare una provocazione, anche sotto il fuoco -- tranne mentre trasporta le intelligence nemiche, e questa regola vale anche in MvM.
- I bot Spia travestiti (giocatore o AI) sono correttamente ignorati dagli altri bot -- finché non toccano un nemico, mettono un sapper, sparano, o si attivano vicino a uno. Una volta "scoperto," quel bot/giocatore specifico viene ricordato come Spia finché non cambia travestimento rimanendo invisibile, muore, o finge la morte con il Dead Ringer.
- I bot Pyro usano lo Scarica Compressiva liberamente su qualsiasi cosa sopra Facile.
- I bot Medici danno priorità alla cura di tutti tranne i Cecchini (e, in misura minore, gli Ingegneri), anche se spammi "Medico!" come uno di loro.
- I bot Medici gravitano verso Pesanti, Soldati, Demoman e Pyro -- specificamente se un *umano* sta giocando quelle classi. Nessun umano in quei ruoli, nessuna particolare attenzione del Medico.
- I bot mantengono la posizione durante il setup sulle mappe Attacco/Difesa e Payload -- tranne Ingegneri, Cecchini e Spie, che si muovono liberamente (anche i bot Demoman possono pre-piazzare stickybomb).
- I bot Ingegnere non aggiornano né rimuovono i sapper dalle costruzioni di un altro Ingegnere amico, a meno che quella costruzione non si trovi per caso nel loro percorso. A volte inoltre... semplicemente non riparano il proprio stesso turret, anche quando è sicuro farlo.
- I bot Spia scoperti passano alla rivoltella e arretrano invece di forzare una pugnalata.
- I bot Demoman che hanno localizzato una sentry (di solito morendoci una volta) possono lanciare stickybomb perfettamente sopra di essa da fuori portata, arcuando attorno a muri e soffitti quando la geometria lo permette.
- I bot Cecchino che non trovano un bersaglio dopo aver mirato usano una delle linee vocali "Negative".
- I medici amici cureranno una Spia travestita senza esitazione.

### Problemi noti / bug

Il documento elenca una solida pila di stranezze di lunga data:

- I bot possono tentare di camminare o sparare attraverso certi oggetti di scena fissi.
- Ogni volta che un giocatore/bot si smaschera, si traveste o si rivela, i bot nelle vicinanze "lo vedono" e si girano per reagire -- anche se l'evento è avvenuto fuori dal loro campo visivo effettivo. Non è basato sul suono; è un bypass del controllo visivo.
- Raramente, i bot possono rimanere fisicamente incastrati insieme mentre usano un teletrasporto dell'Ingegnere.
- I comandi vocali dei bot (es. "Spia!", "Avanti!") non vengono mostrati come testo in chat come quelli dei giocatori.
- Un bot Medico che sta curando attivamente qualcuno non schiva il fuoco in arrivo né raccoglie kit medici, anche a PV criticamente bassi.
- I bot possono continuare a muoversi mentre eseguono una provocazione di coppia, il che rompe l'effetto previsto del Festive Critical Strike.
- I bot Medici danneggiati di recente spesso si rifiutano di usare il Syringe Gun a distanza, preferendo il corpo a corpo (o, in rarissimi casi, cercando di colpirti con il raggio del Medi Gun stesso).
- I bot Medici non compensano la caduta di gravità sui colpi del Syringe Gun -- probabilmente perché l'arma non è correttamente flaggata come non-hitscan nel codice AI.
- I bot Spia possono vedere e tracciare una Spia invisibile (giocatore o AI) se quella Spia si è già fatta scoprire una volta, indipendentemente dal livello di abilità del bot che la traccia.
- Anche se un giocatore-Spia si traveste come la classe della propria squadra, sbattere contro un nemico lo smaschera comunque (i bot non lo fanno mai, poiché i bot non si travestono mai come la propria squadra).
- I bot rispettano il bilanciamento automatico delle squadre -- se stai cercando di accumulare bot su una squadra, hai bisogno prima di `mp_teams_unbalance_limit 0`.
- I bot Ingegnere possono ignorare completamente le proprie costruzioni finché non vengono distrutte.
- I bot Pesante a volte cercano di sparare con il Minigun quando hanno pochissime munizioni, soprattutto sotto difficoltà Difficile.
- I bot Medici della squadra perdente occasionalmente si suicidano durante la fase di Umiliazione quando non ci sono nemici nelle vicinanze -- qualcosa che un giocatore umano non può replicare nemmeno provandoci.
- Impostare l'anteprima della squadra nella schermata di caricamento su BLU fa sì che i bot RED vengano visualizzati come BLU per te.
- I bot con il corpo a corpo in mano a volte si rifiutano di cambiare arma anche dopo aver raccolto munizioni.
- Dopo l'aggiornamento Jungle Inferno, i bot spawnati con parametri espliciti (es. `tf_bot_add 5 pyro blue normal`) possono morire all'istante nella loro stessa stanza di spawn. Soluzione: `tf_bot_reevaluate_class_in_spawnroom 0` (richiede `sv_cheats 1`).

### Nomi AI

I nomi dei bot sono presi da un grande pool di riferimenti a TF2, altri giochi Valve e cultura della programmazione, in gran parte perché la community continuava a richiederne di specifici sui forum di Steam. Un campione della lista: *AimBot, Aperture Science Prototype XR7, Black Mesa, Companion Cube, C++, Divide by Zero, GLaDOS, H@XX0RZ, Saxton Hale, The G-Man, trigger_hurt, 0xDEADBEEF*, e dozzine di altri in questo stile.

C'è anche un gruppo di nomi trovati in una build sorgente trapelata che non è mai stata rilasciata in produzione, per ragioni poco chiare -- per lo più riferimenti a *Last Dragon* e *Il Quinto Elemento* come *John Spartan, Leeloo Dallas Multipass, Sho'nuff, Bruce Leroy, Big Gulp Huh?*, e *I'm your huckleberry*.

Puoi sovrascrivere tutto questo tu stesso: `tf_bot_add heavyweapons blue "Blu Hoovy"` fa spawnare un Pesante BLU chiamato "Blu Hoovy."

---

## Capitolo II: I Bot Originali / TFBot -- Analisi Approfondita dei Livelli di Abilità

La struttura originale di Sigsegv è ancora valida: è ovvio che i bot Esperti superano i bot Facili, ma Valve non ha mai spiegato *quanto* o *perché*. Quindi l'unico modo per saperlo è leggere il codice. Ecco ogni meccanica che scala con l'abilità.

### Impostare la difficoltà

Fuori da MvM, la difficoltà è controllata da un cvar:

| `tf_bot_difficulty` | Livello di abilità |
| --- | --- |
| 0 | Facile |
| 1 | Normale (predefinito) |
| 2 | Difficile |
| 3 | Esperto |

`tf_bot_add` accetta anche un argomento di difficoltà direttamente (`easy`/`normal`/`hard`/`expert`).

### Popfile MvM

In Mann vs. Machine, ogni blocco di spawn `TFBot` nel popfile ha una chiave `Skill` opzionale. Nessuna chiave significa Facile. Nelle missioni ufficiali di Valve: i Giganti sono quasi sempre Esperti, Ingegneri e Spie sono quasi sempre Esperti, e i Cecchini sono solitamente Difficili (occasionalmente Esperti). Se stai usando `EventChangeAttributes` (aggiunto nell'aggiornamento Two Cities) per alterare dinamicamente i bot a metà ondata in base agli eventi della mappa, l'abilità del bot è una delle proprietà che puoi cambiare al volo.

### Modalità Endless MvM

La modalità Endless non è mai stata rilasciata ufficialmente, ma in essa i bot spendono i loro soldi in potenziamenti proprio come i giocatori -- incluso un potenziamento esclusivo dei bot che aumenta il loro livello di abilità AI a metà partita.

### L'entità `bot_generator`

Un'entità oscura, in gran parte non documentata, che si ritiene sia stata usata nella modalità training e forse nel primo sviluppo di MvM. Espone un input `SetDifficulty` per controllare il livello di abilità. Oltre a questo, le tracce si perdono -- Valve non l'ha mai documentata e nessuno ne ha mappato completamente il comportamento.

### Colore del bagliore degli occhi

I robot MvM hanno una particella di bagliore agli occhi che cambia colore con il livello di abilità -- un indicatore visivo che nessuno al di fuori della community ha mai spiegato:

| Abilità | Colore occhi | RGB |
| --- | --- | --- |
| Facile/Normale | Blu | `#24b4ff` |
| Difficile/Esperto | Giallo | `#fff000` |

![Bot Pesante di TF2 in posa di idle](assets/tf2-bot-ai-heavy-idle.png)

### Visione: tempo di riconoscimento

Un bot non reagisce nell'istante in cui qualcosa entra nel suo campo visivo -- c'è un ritardo hardcoded prima che al resto dell'IA sia permesso di riconoscere la minaccia:

| Abilità | Tempo di riconoscimento minimo |
| --- | --- |
| Facile | 1.00 s |
| Normale | 0.50 s |
| Difficile | 0.30 s |
| Esperto | 0.20 s |

Questo è la maggior parte dell'effetto "i bot Facili sembrano stupidi" in un singolo numero -- un bot Facile non mira peggio una volta che ti nota, impiega solo cinque volte più tempo per notare che esisti.

### Mira: frequenza di aggiornamento

I bot non ti tracciano continuamente. Campionano la tua posizione e velocità a un intervallo fisso e predicono una linea retta da lì:

| Abilità | Intervallo di ricalcolo | Frequenza equivalente |
| --- | --- | --- |
| Facile | 1.00 s | 1x/sec |
| Normale | 0.25 s | 4x/sec |
| Difficile | 0.10 s | 10x/sec |
| Esperto | 0.05 s | 20x/sec |

**Eccezione:** i bot Spia sono hardcodeati alla frequenza di tracciamento Normale indipendentemente dal loro effettivo livello di abilità -- una Spia Esperta mira ancora come un bot Normale. C'è anche un video dimostrativo pubblico che confronta le frequenze di tracciamento affiancate se vuoi vedere il divario 1x vs 20x in azione.

### Mira: abilità specifica per arma

I bot non puntano semplicemente al tuo centro di massa -- hanno logiche per arma, alcune genuinamente piene di bug:

**Lanciagranate e Lanciasticky.** Tutti i livelli di abilità compensano l'arco verticale, usando un valore fisso dal cvar `tf_bot_ballistic_elevation_rate`. Poiché quella compensazione scatta solo per l'ID dell'arma base, le varianti di proiettile più veloci (Loch-n-Load, qualsiasi cosa con un modificatore di velocità del proiettile) non ricevono archi correttamente regolati. E poiché è legato specificamente all'ID dell'arma, il Loose Cannon -- un ID completamente diverso -- non riceve alcuna compensazione d'arco.

**Huntsman.** I bot Facili non compensano la caduta della freccia e non cercano mai colpi in testa. I bot di abilità Normale compensano l'arco, ma mirano alla testa solo entro 150 HU. I bot Difficili/Esperti mirano sempre alla testa.

**Lanciarazzi.** Oltre 150 HU, i bot non Facili mirano ai tuoi piedi invece che al centro del corpo, massimizzando i danni da splash e le probabilità di knockback. Entro 150 HU passano ai colpi in testa. I bot Facili mirano sempre al centro del corpo indipendentemente dalla distanza. Anche questo è bloccato dall'ID dell'arma: il Direct Hit e il Cow Mangler non ereditano il comportamento. Ha senso per il Direct Hit (nessun AoE da sfruttare); non ha alcun senso per il Cow Mangler -- questa parte dell'AI precede l'esistenza dell'arma e non è mai stata rivisitata.

**Fucili da Cecchino.** Facile mira al corpo. Normale mira circa al 33% dal corpo alla testa. Difficile/Esperto mirano direttamente alla testa. Importa meno in MvM, dove i colpi in testa dei bot non ricevono il bonus di danno comunque.

### Udito: sensibilità ai colpi silenziosi

Ogni sparo allerta i bot nelle vicinanze sulla posizione del tiratore, anche attraverso i muri, fino a 3000 HU con una probabilità di avvistamento del 100% (`tf_bot_notice_gunfire_range`). Ma un sottoinsieme di armi è flaggato come "furtivo" -- udibile solo entro 500 HU (`tf_bot_notice_quiet_gunfire_range`), e anche in quel caso con una probabilità dipendente dall'abilità:

| Abilità | Probabilità di notare un colpo silenzioso |
| --- | --- |
| Facile | 10% |
| Normale | 30% |
| Difficile | 60% |
| Esperto | 90% |

Quella probabilità è dimezzata se un colpo *forte* è stato sentito negli ultimi 3 secondi -- i suoni forti mascherano quelli silenziosi.

La lista degli ID delle armi furtive non è stata aggiornata dal dicembre 2010. Qualsiasi cosa aggiunta dopo quella data usando un ID arma nuovo di zecca viene trattata come forte per impostazione predefinita, non importa quanto logicamente dovrebbe essere silenziosa, a meno che non abbia riutilizzato un ID più vecchio. Nello specifico:

| ID arma | Copre |
| --- | --- |
| `TF_WEAPON_KNIFE` | Tutti i coltelli della Spia |
| `TF_WEAPON_FISTS` | Pugni specifici del Pesante (il suo pugno multiclasse è in realtà `TF_WEAPON_FIREAXE`) |
| `TF_WEAPON_PDA` | Si ritiene non usato direttamente |
| `TF_WEAPON_PDA_ENGINEER_BUILD` | PDA di costruzione dell'Ingegnere |
| `TF_WEAPON_PDA_ENGINEER_DESTROY` | PDA di distruzione dell'Ingegnere |
| `TF_WEAPON_PDA_SPY` | Kit di travestimento della Spia |
| `TF_WEAPON_BUILDER` | Toolkit Spia/Ingegnere/Sapper |
| `TF_WEAPON_MEDIGUN` | Tutti i Medi Gun |
| `TF_WEAPON_DISPENSER` | Probabilmente non usato (i Dispenser sono oggetti, non armi) |
| `TF_WEAPON_INVIS` | Tutti gli orologi da invisibilità della Spia |
| `TF_WEAPON_FLAREGUN` | Tutte le pistole lanciafiamme del Pyro *eccetto* il Manmelter |
| `TF_WEAPON_LUNCHBOX` | Sandwich, Dalokohs Bar, Buffalo Steak Sandvich, Bonk!, Crit-a-Cola |
| `TF_WEAPON_JAR` | Jarate (non Mad Milk -- ID separato, non furtivo) |
| `TF_WEAPON_COMPOUND_BOW` | Huntsman |
| `TF_WEAPON_SWORD` | Eyelander, Skullcutter, Claidheamh Mòr, Persian Persuader, Half-Zatoichi |
| `TF_WEAPON_CROSSBOW` | Crusader's Crossbow |

L'esempio classico del decadimento della lista: il Manmelter ha ricevuto il proprio ID (`TF_WEAPON_RAYGUN_REVENGE`), aggiunto dopo che la lista furtiva è stata congelata -- quindi viene trattato come rumoroso, nonostante sia una pistola lanciafiamme in ogni senso pratico. Lo Scorch Shot, rilasciato ancora dopo, riutilizza l'ID base `TF_WEAPON_FLAREGUN` ed è quindi ancora considerato furtivo. Insensato, ma è il codice.

### Strategia: priorità delle minacce

Quando più nemici sono visibili contemporaneamente, i bot valutano la distanza, se vengono presi di mira e -- sopra Facile -- se la minaccia primaria è in cura:

| Abilità | Prende di mira il curatore invece? |
| --- | --- |
| Facile | No |
| Normale | 50% di probabilità |
| Difficile | Sì |
| Esperto | Sì |

I nemici oltre 500 HU sono normalmente deprioritizzati come non immediati. Eccezioni: i bot Difficili/Esperti trattano sempre i Medici e gli Ingegneri distanti come minacce immediate, e qualsiasi Cecchino nemico che mira approssimativamente nella tua direzione è sempre trattato come immediato indipendentemente da distanza e abilità.

| Abilità | Medici/Ingegneri/Cecchini che mirano distanti = minaccia immediata? |
| --- | --- |
| Facile/Normale | No |
| Difficile/Esperto | Sì |

Quel controllo del Cecchino ha una storia genuinamente divertente. Il documento originale di Sigsegv presumeva che il gioco richiedesse che il prodotto scalare tra il vettore di mira del cecchino e la posizione relativa del bot fosse *esattamente zero* -- un confronto così preciso che non si sarebbe quasi mai attivato nell'aritmetica in virgola mobile, rendendo l'intera funzionalità effettivamente codice morto. Una correzione pubblicata in seguito (grazie a una decompilazione Hex-Rays più pulita) ha mostrato che il controllo effettivo è `prodotto scalare > 0`: qualsiasi Cecchino che guarda da direttamente verso di te a perpendicolare a te conta come minaccia immediata; qualsiasi cosa da perpendicolare a guardare altrove no. L'errata lettura originale proveniva da una cattiva decompilazione di un confronto SSE in virgola mobile -- il reverse-engineering di un binario AAA non è una scienza esatta.

### Movimento: schivata

I bot Facili non schivano mai, punto e basta. I bot Normale e superiori schivano a sinistra/destra (33% sinistra, 33% destra, 33% non fare nulla, ponderato contro i vuoti rilevati) quando hanno un'arma da combattimento in mano, hanno visto un nemico negli ultimi 3 secondi, e quel nemico ha linea di vista su di loro.

Non schiveranno se si applica una di queste: attributo `DisableDodge` impostato, il comportamento corrente dice di sbrigarsi, attualmente invulnerabile (qualsiasi über), in mezzo a una provocazione/provocazione, sta giocando Ingegnere, invisibile o travestito come Spia, mirando come Cecchino o con il minigun acceso come Pesante, o in mezzo al tiro dell'Huntsman.

### Movimento: evitare di spingere i nemici

Sopra Normale, i bot cercano specificamente di non sbattere contro i nemici mentre si muovono:

| Abilità | Evita di spingere i nemici? |
| --- | --- |
| Facile | No |
| Normale | No |
| Difficile | Sì |
| Esperto | Sì |

In pratica questo è importante soprattutto per i bot Spia -- evitare una collisione imbarazzante con un giocatore nemico è esattamente il tipo di cosa che fa saltare un travestimento.

### Pyro: padronanza dello scarica compressiva

Lo scarica compressiva serve a due scopi: riflettere i proiettili (PvP e MvM) e spingere i nemici vicini giù dalle piattaforme (solo PvP). Se il bot tiri effettivamente il grilletto su un'opportunità valida è un lancio della moneta basato sull'abilità:

| Abilità | Probabilità di attivazione scarica compressiva |
| --- | --- |
| Facile | 0% |
| Normale | 50% |
| Difficile | 90% |
| Esperto | 100% |

I bot Pyro Facili non possono letteralmente usare lo scarica compressiva -- il tiro è hardcodeato per non riuscire mai, non solo "raramente."

### Spia: efficacia del travestimento

Due assi separati scalano con l'abilità. Scelta del *travestimento*:

| Abilità | Metodo di travestimento |
| --- | --- |
| Facile/Normale | Classe casuale, ignorando cosa sta effettivamente giocando la squadra nemica |
| Difficile/Esperto | Sceglie un vero giocatore nemico e copia la sua classe esatta |

*Recitazione* del travestimento:

| Abilità | Comportamento mentre travestito/invisibile |
| --- | --- |
| Facile/Normale | Fissa i giocatori nemici quando li vede (sospetto) |
| Difficile/Esperto | Evita deliberatamente il contatto visivo (più convincente) |

### Spia: aggressività della pugnalata alle spalle

A lunga distanza (fino a 300 HU, `tf_bot_spy_knife_range`), un bot Spia si impegna in una pugnalata alle spalle solo se può vedere la vittima e la schiena della vittima è almeno parzialmente girata. L'abilità determina quanto quel angolo dalla schiena può essere decentrato:

| Abilità | Tolleranza dell'angolo |
| --- | --- |
| Facile | Ci prova anche se ti guarda direttamente |
| Normale | ±45° dalla tua schiena |
| Difficile | ±78° dalla tua schiena |
| Esperto | ±90° dalla tua schiena (arco posteriore completo di 180°) |

I bot Spia Facili sono funzionalmente suicidi -- tenteranno una pugnalata su qualcuno che li guarda dritto in faccia. **Eccezione:** in Mann vs. Machine, ogni bot Spia è forzato al vincolo di angolo Normale indipendentemente dall'abilità effettiva.

### Tattiche: selezione delle armi

Scatta solo sopra Facile, e per lo più irrilevante in MvM poiché i bot lì hanno di solito restrizioni d'arma rigide:

- **Scout**: passa alla secondaria quando il caricatore dell'arma primaria è vuoto.
- **Soldato**: passa alla secondaria a caricatore vuoto *e* bersaglio più vicino di 500 HU.
- **Cecchino**: passa alla secondaria per bersagli più vicini di 750 HU.
- **Pyro**: passa alla secondaria per bersagli più lontani di 750 HU, a meno che quel bersaglio non sia un Soldato o un Demoman.

### Tattiche: ricarica al coperto

Non usato in MvM. Se il comportamento attuale del bot non gli dice di ritirarsi, il suo caricatore principale è vuoto, e non è uberato, i bot di abilità superiore si ritirano temporaneamente al coperto per ricaricare invece di sparare a vuoto contro di te:

| Abilità | Si ritira per ricaricare? |
| --- | --- |
| Facile | No |
| Normale | No |
| Difficile | Sì |
| Esperto | Sì |

### Modalità CP: vagabondaggio del difensore

Non usato in MvM. Difendendo un punto di controllo, i bot di abilità superiore sono più propensi a lasciare il punto per cercare uccisioni ("cerca e distruggi"), ma solo con un tempo decente rimasto su `tf_bot_defense_must_defend_time`:

| Abilità | Probabilità di vagabondaggio |
| --- | --- |
| Facile | 10% |
| Normale | 50% |
| Difficile | 75% |
| Esperto | 90% |

### Modalità CP: blocco della cattura

Non usato in MvM. I bot difensori che contrastano un tentativo di cattura nemico:

| Abilità | Tenterà di bloccare la cattura? |
| --- | --- |
| Facile | No |
| Normale | 50% di probabilità |
| Difficile | Sì |
| Esperto | Sì |

---

## Tabella riassuntiva completa

<div style="overflow-x:auto">

| Aspetto | Facile | Normale | Difficile | Esperto | Note |
| --- | --- | --- | --- | --- | --- |
| Visione: tempo di riconoscimento | 1.00s | 0.50s | 0.30s | 0.20s | |
| Mira: frequenza di aggiornamento | 1x/s | 4x/s | 10x/s | 20x/s | Le Spie usano sempre Normale |
| Compensazione arco granate/sticky | Sì | Sì | Sì | Sì | Loose Cannon esente |
| Compensazione verticale Huntsman | No | Sì | Sì | Sì | |
| Colpi in testa Huntsman | No | <150 HU | Sì | Sì | |
| Tiro ai piedi Lanciarazzi | No | Sì | Sì | Sì | Direct Hit & Cow Mangler esenti |
| Punto di mira Fucile da Cecchino | Corpo | ~33% verso testa | Testa | Testa | |
| Probabilità di notare colpi silenziosi | 10% | 30% | 60% | 90% | Dimezzata se mascherata da colpi forti |
| Prende di mira il curatore | No | 50% | Sì | Sì | |
| Medico/Ingegnere/Cecchino distante = minaccia | No | No | Sì | Sì | |
| Schivata | No | Sì | Sì | Sì | Lunga lista di eccezioni |
| Evita di spingere i nemici | No | No | Sì | Sì | Rilevante soprattutto per la Spia |
| Probabilità di attivazione scarica compressiva | 0% | 50% | 90% | 100% | |
| Scelta classe travestimento Spia | Casuale | Casuale | Copia nemico reale | Copia nemico reale | |
| Contatto visivo Spia mentre travestita | Fissa (ovvio) | Fissa | Evita (convincente) | Evita | |
| Angolo pugnalata alle spalle Spia | ~0° | ±45° | ±78° | ±90° | MvM forza Normale |
| Logica selezione armi | No | Sì | Sì | Sì | Meno rilevante in MvM |
| Ricarica al coperto | No | No | Sì | Sì | Non in MvM |
| Vagabondaggio difensore CP | 10% | 50% | 75% | 90% | Non in MvM |
| Blocco cattura CP | No | 50% | Sì | Sì | Non in MvM |

</div>

---

## Conclusione

![Bot Pesante di TF2 che mira con un minigun](assets/tf2-bot-ai-heavy-aim.png)

Niente di tutto questo è il risultato di supposizioni sbagliate da parte di Valve -- è un sistema di punteggio e probabilità deliberato, completamente deterministico, semplicemente mai messo per iscritto in modo ufficiale. Qualche cosa degna di nota:

1. **"Abilità" è un insieme di manopole indipendenti**, non un moltiplicatore globale. Il tempo di reazione, la frequenza di mira e ogni comportamento tattico scalano separatamente, e alcuni (frequenza di tracciamento della Spia, angolo di pugnalata in MvM) ricevono override hardcodeati indipendentemente dall'abilità.
2. **Parte di questo è genuinamente pieno di bug, non solo vecchio.** La lista delle armi furtive congelata dal 2010, il Cow Mangler a cui manca la logica di tiro ai piedi senza una buona ragione, il controllo del prodotto scalare del Cecchino che ha richiesto anni per essere decompilato correttamente -- il codice AI di Valve ha tessuto cicatriziale come qualsiasi altra codebase di 17 anni.
3. **Puoi usare tutto questo.** Sappi che un bot Cecchino non ti colpirà in testa in Normale, che un Pyro Facile non può letteralmente rispedirti indietro il razzo con lo scarica compressiva, che una Spia Facile proverà ad accoltellarti faccia a faccia. Non è fortuna. È un foglio tecnico.

Un enorme ringraziamento a sigsegv per l'immersione originale nel codice che ha reso possibile gran parte di questo, alla Wiki di TF2 per la documentazione di base sui comandi dei bot e il supporto delle mappe, e a tutti nella community che ancora studiano un'AI bot di 17 anni per capire esattamente perché fa quello che fa.
