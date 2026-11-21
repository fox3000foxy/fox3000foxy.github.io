---
title: "Chlone: sei giorni per clonare il mio modo di parlare su Discord - versione del clone"
description: "La versione scritta dal clone stesso: chloeai racconta a modo suo i sei giorni e 146 commit che le hanno dato vita, dal refuso al tag v1.0.0."
date: 2026-09-18
tags: ["discord", "ai", "llm-agents", "openself", "python", "selfbot", "clone"]
authors: ["itsrealfortune"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "m4p92tOBypKfmFk7/nl4Znb+5Bc9KJ9aMquBnxOvzXB0j5x2AkKnJoFdmm6/iV15mvMdNLJkmFLvJUjmbqXVqw=="
---

# Chlone: sei giorni per clonare il mio modo di parlare su Discord

*Racconto di build, giorno per giorno - di itsrealfortune*

---

Ecco la storia vera di un progetto durato sei giorni. Chlone, un bot Discord che parla come me, e racconto il percorso com'è andata davvero, nell'ordine dei 146 commit del repo, con orari, fallimenti, deviazioni e voglie di buttare tutto dalla finestra. Tutto è partito da una competizione con Fox. Il tema all'inizio era una battuta, ognuno doveva dare vita al proprio clone su Discord, e io ho preso un approccio radicalmente diverso dal Protocol Luna. In realtà volevo puntare sull'agentico, un agente che si serve dei ricordi e di tutti gli strumenti di cui può aver bisogno, e l'ironia della sorte è che dopo aver montato tutta la cassetta degli attrezzi mi è bastato solo l'MCP OpenSelf.

Il principio sta in una frase. Un agente opencode di nome `chloeai` gira dietro un server HTTP sulla porta 4096, tiene sessioni persistenti per canale, pesca i miei ricordi in OpenSelf e scrive col mio stile, catturato in `STYLE.md` dai miei veri messaggi. E per non suonare robot, c'è tutto il resto, i burst di messaggi, i refusi voluti, i vocali, le GIF, le reazioni, il silenzio quando dormo, e un sacco di altri dettagli e meccanismi che hanno fatto dubitare più di una decina di persone sulla natura del bot.

**Cos'è OpenSelf?**

OpenSelf è la memoria. È una CLI, `openself`, installata via `npm i -g openself`, che serve da vault di contesto privato e persistente per i miei agenti. Nel repo non appare nell'albero ma è ovunque, nell'archivio `ecosystem.config.cjs` con MCP e dashboard lanciati sotto PM2 fin dai primi commit, in `setup.sh`, e in tutto `tools/brain/memory.py`. In concreto OpenSelf sono ricordi tipizzati, `fact`, `preference`, `decision`, `relationship`, `event`, `note`, con sensibilità public, personal, private o restricted, un punteggio di fiducia, una fonte e dei tag.

Sono anche scope, ogni ricordo appartiene a un contesto, il mio o `discord/dm/<id>` per una persona precisa, e una ricerca ibrida lessicale più vettoriale esposta in MCP che l'agente `chloeai` interroga prima di ogni risposta. C'è rilevamento dei conflitti col mio sweep mensile del giorno 5 e dedup in scrittura, un vault cifrato con la chiave in Bitwarden e una dashboard locale sulla porta 3210 per ispezionare il tutto. E per i più pigri, c'è `openself feed` per nutrire la tua personalità dai tuoi storici WhatsApp o Telegram, `openself test`, `openself share` col Talk to My Clone, `openself arena` dove due cloni dibattono, o `openself ghost` che risponde quando sei offline. Io ho fatto il mio a mano, ma l'infrastruttura c'era.

In teoria OpenSelf basta da solo per avere un clone, ma insomma, visto tutto ciò che avevo previsto di aggiungere come funzionalità, e visto che Discord non è supportato, ho preferito usare solo la parte ricordi.

**E da dove vengono ricordi e stile?**

A monte di tutto questo, ho fatto analizzare i miei veri messaggi Discord. Il tooling ha passato al setaccio i miei DM e i miei canali per estrarne due cose. Prima il mio profilo di scrittura, la distribuzione maiuscole e minuscole a inizio frase, il numero di emoji per messaggio e la loro posizione, la punteggiatura o la sua assenza con niente punto finale in conversazione normale, la lunghezza media, lo slang con `mdr`, `tkt` e `tho`, le espressioni feticcio come Bah e In realtà, e i riflessi del tipo `cosa` che dà `Feur`. Tutto questo vive in `STYLE.md`, che l'agente legge all'avvio di ogni sessione.

Poi il corpus di ricordi che popola OpenSelf, cioè le persone con cui parlo, di cosa si discute, cosa bisogna ricordare del nostro storico, chi è chi. Il bot non risponde nel vuoto, risponde su persone che conosce, legge i ricordi delle persone che appaiono nella conversazione per sapere di chi si tratta. Permette di tenere un contesto persistente sugli altri e di non dimenticarli. Il bot non ha inventato niente, è stato calibrato cifra per cifra su roba vera, ecco perché suona giusto. Ed è per questo che le ondate "valuto il tuo stile" fatte a occhio sembrano patetiche a confronto.

In Chlone, OpenSelf gioca poi il ruolo centrale. Quando passa qualcosa di importante in un canale, una parola chiave come progetto, amico o relazione, o una richiesta esplicita con ricordati che, il bot scrive un ricordo nel vault via `save_to_memory`, tipizzato, con scope per persona, deduplicato e verificato contro i conflitti. E quando la conversazione riprende, l'agente fruga nei suoi ricordi prima di rispondere. Questa è la differenza tra uno specchio e un clone.

---

## VENERDÌ 11 SETTEMBRE - Giorno 1: la scintilla

### 08:24 - il primo commit

Tutto parte da zero ma è già tutto lì, alla rinfusa. Un `discord_watch_bot.py` di 372 righe, un selfbot che ascolta un canale e risponde via un server HTTP opencode. Un prompt di identità `CHLOEAI_PROMPT.md`, uno `STYLE.md`, scenari e report di test per un clone che all'epoca si chiamava ancora Mimo. Una config PM2 per far girare MCP e dashboard OpenSelf, e un database sqlite che serve da contesto. È il caos fondatore, non ho previsto un progetto, ho previsto un esperimento. La domanda è: si può fare un bot che suona davvero umano su Discord.

### 08:27 - il primo gitignore

Prima lezione del venerdì mattina, mai committare database sqlite in `-wal` e `-shm`. I file di lock di SQLite non sono memoria, sono spazzatura. Quindi nasce `.gitignore`, e va benissimo così.

### 08:44 - si ordina l'eredità

Ordino l'eredità di Mimo, i report di test, gli scenari, gli script di integrazione e la config PM2, direzione `archives`. Non cancello niente perché il progetto è troppo giovane per buttare qualsiasi cosa, e diventerà un'abitudine. Il report di test merita una sosta, Mimo era stato testato su 15 scenari, chat rilassata, battuta assurda, supporto emotivo, parere negativo, conflitto con uno sconosciuto, proposta di collaborazione, per un 9.1 su 10. I commenti del tester sono una poesia, battuta assurda troppo spiegata, a volte due frasi quando ne basterebbe una, Prenditi cura di te anche un po' lungo. È la roadmap del progetto prima ancora che il progetto esista, e dice corto è meglio.

### 08:48, 09:07 - il tira e molla degli intent

I `.pyc` finiscono al macero e faccio una prima pulizia sulla config, che rompo venti minuti dopo. Senza intent attivati non ricevi il contenuto dei messaggi, quindi passo indietro, più uno script di lancio con `run_watch_bot.sh`. Andata e ritorno in venti minuti, questa è l'esplorazione, scrivere un modulo, romperlo e riscriverlo.

### 09:13 - 09:58 - la lavorazione del prompt

La mattina è una serie di lucidature, prima dello stile poi del contesto. Più righe di risposta diventano più messaggi inviati uno dopo l'altro col burst, il prompt diventa consapevole della conversazione in corso. Finiti i cache casalinghi per recuperare i DM, si colpisce direttamente l'API REST di Discord. L'identità è ripetuta ogni 5 messaggi perché il bot non dimentichi chi è per strada, e gli autori già visti sono tracciati. Per una faccia nuova, c'è un'istruzione esplicita di andare a cercare nei ricordi, e si mostra il vero nickname invece dell'oggetto interno.

I messaggi che scegliamo di ignorare diventano contesto passivo per la risposta successiva, e il Bah è dosato, raro, altrimenti il clone diventa una caricatura di me. Il bot sa anche che esistono ricordi da andare a cercare prima di rispondere. Ogni passaggio è un giro di vite, e a questo punto il bot parla solo perché gli ricordo chi è a intervalli regolari.

### 10:16 - i refusi

È il commit che definirà il progetto. Un errore di ortografia non è un bug, è una prova di umanità. Quindi 6 percento di probabilità di battere a lato sulla tastiera AZERTY, 4 percento di invertire due lettere. Il messaggio parte col refuso poi è modificato uno o due secondi dopo con la correzione. Perché una persona vera invia e corregge, non finge di essere perfetta.

### 10:29, 10:32 - la voce

`fortune-v6.onnx` sbarca, un modello TTS allenato per assomigliare alla mia voce. Il bot non scriverà solo come me, alla fine parlerà come me. È a questo punto che il progetto smette di essere uno scherzo e diventa un po' strano, e lo adoro. La meccanica sta in un commit, Piper genera l'audio, ffmpeg converte in opus, l'API Discord invia un vero voice message con waveform e durata. È fatto in tre minuti appena dopo l'arrivo del modello, la voglia c'era fin dall'inizio.

### 11:27 - il primo grande refactor

Tre ore dopo il primo commit, il monolite di 456 righe non è più gestibile. Spacco tutto in `tools`, con `config.py`, `discord_api.py`, `memory.py`, `opencode.py` di 188 righe, `typo.py` e `voice.py`. Il ciclo è classico, accoppiare in fretta, rompere e ricomporre. Seguono in raffica il token che esce dal codice e passa da un `.env`, il bot che sorveglia un canale, una lista o tutto con `*`, e il vecchio database sqlite che non ha più ragione di esistere perché la memoria passa da OpenSelf.

Aggiungiamo i primi `README.md` e una prima doc più o meno leggibile, più un `setup.sh` con un venv dedicato perché il python di sistema porta un altro discord.py, trappola classica, e un symlink dell'agente verso `~/.config/opencode/agents`. La memoria sa ormai dove è stata formata con l'identificatore di canale, e il tasso di vocali si regola da solo.

### 12:00 - i riflessi

Una nuova sezione appare nello STYLE, i riflessi. Un riflesso è uno stimolo che dà una risposta, senza riflessione, e la porta è aperta a risposte impreviste. Poi arriva l'ora di pranzo e LA domanda esistenziale, il bot risponde Feur quando gli dicono cosa.

### 13:03 - "cosa?" - "Feur"

Sì, certo che sì. È il commit più importante del progetto, culturalmente parlando, direi anzi che è l'unico test unitario che conta. Poi si lubrifica, gli autori mostrati col loro global name, la punteggiatura troncata prima di testare il riflesso perché bisogna tagliare il `cosa?` altrimenti niente Feur. Il famoso `tqt` corretto in `tkt` nello STYLE, chi non conosce il progetto si chiederà perché committo sta roba. Io lo so, un clone che scrive `tqt` è un clone mal calibrato, e nessuno vuole parlare a un clone mal calibrato.

Le menzioni in `@123456789` sono sostituite da veri nomi nel contesto, e il bot inizia a sorvegliare tutti i canali di default. In realtà sono piccoli dettagli, ma sono loro che fanno suonare giusto.

### 16:37 - il silenzio

Arriva il `[void response]`. Il bot impara la parola più importante per non diventare un parassita sociale, tacere. Un messaggio ambiente tra due persone che non lo riguarda dà niente risposta. Il riserbo è una funzionalità, e cambia tutto.

**Fine giorno 1: 38 commit. Il bot scrive, sbaglia, parla, tace.**

---

## LUNEDÌ 14 SETTEMBRE - Giorno 2: la personalità

Si riprende, 10 di mattina.

### 10:12 - chi parla a chi

Ogni nickname ricevuto è prefissato con un'emoji dal sistema, un umano con 🧑, un bot con 🤖 da trattare più seccamente, e 👑 per la creatrice, cioè io sul mio account principale. Questa convenzione governerà tutto il resto del progetto, il clone non deve mai trattare il suo modello originale come una sconosciuta.

### 10:16 - le regole di punteggiatura

Formalizzo nello STYLE, niente punto finale in conversazione normale, punto riservato alle situazioni serie. È una regola assoluta, perché un clone che mette punti ovunque si sente subito. In realtà è uno dei dettagli che tradisce più in fretta.

### 10:58 - le GIF

La mia libreria personale di GIF sbarca, con le loro regole d'uso. Il Patrick Jane quando prevedo qualcuno, la Miss Fortune quando sono calma davanti a qualcuno di nervoso, la gif del bescherelle che cade quando l'altro fa un errore. Un MCP statico le espone all'agente, e attraverso le mie GIF il bot diventa un po' me.

### 11:07 - 11:35 - rifinitura

Gli hint di GIF nel prompt si affinano, le emoji custom di Discord fanno il loro ingresso con le mie vere, 14 ID aggiornati, e la gestione dei nomi negli hint memoria è lucidata. Non è spettacolare, ma è ciò che rende l'insieme coerente, tho.

### 11:41 - un canale, una personalità

Le sessioni diventano per canale, perché non parlo allo stesso modo in due server diversi, e nemmeno il bot. Il contesto deve restare separato, altrimenti mescola tutto e suona falso.

### 12:02 - la cassetta degli attrezzi di espressione

Il prompt sa ormai proporre le mie GIF e le mie emoji custom al momento giusto. Si riempie, questa cassetta, e il bot inizia ad avere scelta invece di rispondere sempre uguale.

### 12:37 - l'igiene di identità

Il bot non ha MAI il diritto di dire che modello è, impossibile citare opencode, un provider o un nome di modello. Correggo anche barista nell'identità, il bot è già meglio di me su questo punto. E passo un'ora ad armonizzare la punteggiatura dei miei prompt, il che è di un'ironia perfetta.

### 12:50 - uno script costruisce la personalità

La sezione media del prompt si genera dai dizionari con `render_medias.py`, finita l'editing a mano. È più pulito, più manutenibile, ed evita errori di ID.

### 12:59 - 13:18 - dosare l'identità

Il richiamo di identità inviato ogni 5 messaggi diventa troppo presente, quindi passaggio ogni 20 messaggi. Aggiungo un reset pulito del contesto e faccio pulizia della guida di stile, si tolgono espressioni e formulazioni negative scadute. Bisogna dosare, altrimenti il bot si ripete e si vede.

### 14:09 - il bot prende la parola da solo

Il bot smette di essere un riflesso, può parlare senza essere interpellato quando il contesto attiva qualcosa, e il file `behavior.py` nasce con 91 righe. È lì che si passa da risponditore a presenza, perché un vero amico può scriverti per primo. Senza questo, il bot resta un semplice risponditore.

### 14:20, 14:22 - rendere affidabile la risposta

Gestione errore quando l'invio fallisce, e reazione possibile invece di una risposta, perché a volte una reazione vale mille parole. È molto da me, mettere un'emoji e passare oltre.

### 18:16 - prendersi il tempo

Il bot non risponde più in 200ms come uno script, lascia passare un ritardo di inattività umano, si prende il suo tempo. È ciò che rende il bot impossibile da beccare come bot in demo, perché è il ritardo che tradisce sempre.

### 23:45 - le faccende serali

È quasi mezzanotte e spingo un rilevamento URL esteso ai domini nudi. Ecco il vero flusso della giornata, un'idea solida alle 14 poi faccende la sera perché sono ancora in zona.

**Fine giorno 2: 61 commit cumulati. Il bot ha una personalità, media, riflessi.**

---

## MARTEDÌ 15 SETTEMBRE - Giorno 3: giorno mostro

57 commit in un giorno. È il giorno in cui il progetto diventa tutto ciò che è oggi.

### 08:18 - 08:37 - la limatura del mattino

Il ritardo di inattività che avevamo inventato diventava troppo lungo, quindi tetto a 30s e riaggiustato due volte, prova che abbiamo tentato il valore giusto. Primi file `.bak` e primi backup del database, l'istinto di conservazione si sviluppa. La memoria ricorda chi col nome mostrato e in quale cornice con lo scope, e gli ID autore circolano in tutta la pipeline di salvataggio. La gestione creatore diventa una vera lista di admin con `ADMIN_IDS`, e tutto ciò che tocca gli autori emigra in `authors.py`. Il monolite si frammenta ancora, e tanto meglio.

### 08:43 - la TODO list dell'umanizzazione

Una lista dedicata alle piccole cose che fanno sì che la macchina non si senta più. È la roadmap dello sprint che segue, ed è piena di dettagli strani ma essenziali.

### 08:44 - 08:46 - il patto delle macchine umane

Il bot tace di notte, in una fascia oraria calma configurabile, disattivata di default perché non tutti hanno i miei orari. Una riga per risposta può perdere gli accenti, perché la gente stanca scrive così, e anche il bot a volte. La piccola riga Chloé sta giocando a cambia da sola ogni 30 min, perché il mio profilo sembri vivo anche senza messaggio.

### 08:46 - una reazione, non un romanzo

Un messaggio troppo leggero per meritare una frase riceve una semplice reazione. È economia di energia sociale, ed è molto da me. Tkt, non serve fare un papiro per tutto.

### 08:51 - PARRY, l'umore

148 righe in `tools/mood.py`, il bot ha ormai un umore, stile sistema PARRY, il chatbot psicotico anni 70 a cui mi ispiro apertamente. Energia, socievolezza, presa in giro, tre float che evolvono tra 0 e 1 e colorano ogni risposta. Il `.mood.json` del momento, per i posteri, dà energia 0.88, socievolezza 0.68 e presa in giro 0.56. Un buon giorno, in realtà.

### 09:00 - 09:43 - la voce bidirezionale + il soundboard

Il bot può unirsi a un canale vocale, parlare via Piper e andarsene da solo quando ha finito. Poi la seconda grande idea, il bot ascolta il canale con cattura RTP, rilevamento voce via VAD e trascrizione Whisper, e può lasciare che la gente lo interrompa. In mezzo, appare il soundboard, un catalogo di suoni coi loro significati, l'agente sceglie il suono prima ancora di parlare, e la regola finale è soundboard prima, la voce come ultima risorsa. Il bot preferisce inviare un suono che parlare, come me.

Aggiungiamo una regolazione di probabilità vocale che rende il tutto sostenibile, e l'arrivo di `davey`, questa lib di cui imparo l'esistenza dieci minuti fa e che maledirò per un'ora.

### 09:51 - il momento in cui Discord dice no. No, no, ma no.

Arriva l'MLS. Discord ha da poco cifrato il flusso audio end-to-end, e la mia cattura riceve solo rumore. Bisogna decifrare, e la decifratura si rifiuta di cedere, quindi si apre la più grande saga del repo, una trentina di commit per imparare ad ascoltare. Abbiamo provato tutto, layout di nonce di trasporto, la disattivazione dell'E2E che il server ci rimette in faccia perché la impone, i candidati di chiave recuperati dal gruppo, errori dettagliati, il fallback trasporto e introspezione dall'interno dei gruppi.

Ci sono stati candidati per leaf-index con backoff, il mapping degli hook SPEAKING, un tentativo in media type video fallito, e lo skip degli ssrc video. Ho abbandonato la risposta vocale il tempo di debuggare, commentata ma non cancellata, ho aggiunto una modalità di cattura dell'handshake poi ho dumpato la struttura dei pacchetti che falliscono, come un archeologo. Sei layout di nonce, backoff, introspezione di gruppo, ho messo il bot in debug totale e ho aperto ogni pacchetto per vedere cosa c'era dentro.

L'essenziale non è che funzioni, è che non ho buttato niente. La lista di commit è il quaderno di laboratorio, ogni tentativo fallito è archiviato con la sua ipotesi. È il mio lato tengo tutto, finisce sempre per servire, e stavolta ha pagato.

### 10:43 - il bot si taglia a pezzi

Anche in piena guerra MLS, continuo le pulizie. 546 righe spariscono dal bot principale per rinascere in `pipeline.py` con intake, ragioni di ignore e processing, in `sender.py` con burst, typo e voice, e in `loops.py` con spontaneità e attività. Finalmente respira.

### 10:47 - una vera architettura

`tools` diventa organizzato, con `brain` per opencode, memory e mood, `voice` per voice, vocal, listen e soundboard, e `fun` per behavior, typo, emotes e gif. Il progetto ha uno scheletro ormai, non è più un mucchio di script.

### 10:49 - 11:16 - il comfort di dev

Una soglia di iniezione dell'umore regolata, quattro piccoli commit per le esclusioni di editor con `data`, `voices`, i log e i database, sì ne ho messi quattro, è il progetto che definisce le priorità, non le spec. I database di metadati escono dal tracking, e il progetto diventa riusabile da altri con template generici `PERSONA.example.md` e `STYLE.example.md` per clonare il proprio stile.

L'identità è rinominata pulitamente, `CHLOEAI_PROMPT` diventa `PERSONA`, e il README è spersonalizzato, tolgo Chloé dalla doc pubblica, si racconta solo in privato. Tutto il tuning del bot passa in un `config.yaml` sovraccarico e gitignorato, con un esempio commentato riga per riga, e lo script di installazione prepara ormai anche i file di env e config.

### 11:49 - le emoji staccate

Le emoji custom si attaccano al testo invece di staccarsi pulitamente. È un fix banale con un effetto enorme, perché niente grida bot come un'emoji mal attaccata alla fine di una frase.

### 14:19 - il salvagente vocale

Se qualcuno lancia il comando vocale, non trattiamo il messaggio come un messaggio normale. Occhiolino, i compiti faccende tornano sempre la sera.

**Fine giorno 3: 118 commit cumulati. Il bot ascolta, parla, tace di notte, ha un umore e un biglietto da visita.**

---

## MERCOLEDÌ 16 SETTEMBRE - Giorno 4: la credibilità

13 commit. Giornata seria.

### 08:49 - 08:59 - l'età adulta

Documenti legali, licenza proprietaria, codice di condotta, guida ai contributi e politica di sicurezza, in inglese poi in francese, con un tira e molla di correzioni e una ridenominazione di file al limite del pignolo. Ci ho passato ore ed è la parte meno divertente del repo, di gran lunga. Ma va fatto, tho.

### 09:56 - il bot vede

Le immagini allegate sono trascritte via OCR locale e il testo è iniettato nel prompt. Nessuna API cloud, l'OCR gira a casa mia, non mando i vostri meme a un server terzo, nemmeno in teoria.

### 11:09 - il budget ragionevole

Rivoluzione silenziosa nel budget, quando il canale vieta gli invii o limita GIF, embed ed emoji, non chiamiamo nemmeno il modello. Non spendiamo un token per un messaggio che non possiamo inviare, è abbastanza semplice in realtà.

### 11:42 - 12:55 - la casa che si rifà

Il gran scopone, codice morto cancellato, bug di invio e auth corretti, helper fattorizzati. Le sessioni troppo vecchie sono espulse, la cache dei DM scade e il rilevamento voce costa meno. Gli import che avevo rotto spostando moduli sono ripristinati, e tutto lo stato runtime, sessioni, autori visti, messaggi ignorati e umore, sopravvive ai riavvii in `data`.

### 14:41 - due mondi, un bot

Uno strato di compatibilità rileva automaticamente la versione di `discord` installata e adatta intent e auth REST. Risultato, lo stesso codice gira come app ufficiale con discord.py o come selfbot con discord.py-self. Due mondi, un bot, e niente bisogno di mantenere due branch.

### 15:05 - la presenza adattata

Il modo di mostrare la presenza si adatta alla modalità, e la lista degli admin è aggiornata. È dettaglio, ma è ciò che fa stare in piedi tutto ovunque.

**Fine giorno 4: 131 commit cumulati. Un progetto legale, ragionevole, e che gira ovunque.**

---

## GIOVEDÌ 17 SETTEMBRE - Giorno 5: la release

14 commit. Il giorno della maturità.

### 09:15 - 09:30 - la memoria diventa una disciplina

I ricordi sono ordinati per scope, e non citiamo i ricordi di un DM in un server o viceversa senza pensarci. Classifichiamo i ricordi in fatto, preferenza, decisione e relazione, e ne deduplichiamo la scrittura, due ricordi contraddittori non possono più coabitare in silenzio. Una blacklist opzionale con `aventuros` impedisce al bot di derivare verso certi temi, disattivata di default e disponibile per i paurosi. La config vocale morta è rimossa, che sollievo.

### 10:12 - la memoria che si audita

Uno sweep mensile di conflitti di memoria più un bench A/B di ricerca. La memoria del bot è diventata un asset che si ispeziona, siamo lontanissimi dal venerdì 11 alle 08:24. In realtà è lì che il progetto diventa adulto.

### 10:54 - il lockdown

Il giorno in cui gioco al paranoico, blocco dell'agente. Scrittura memoria rifiutata, l'agente non può inquinare il vault anche se lo si inietta. Strumenti Discord in sola lettura, l'invio passa dal codice, mai dall'agente. Né sotto-agenti per aggirare il lockdown, né webfetch per SSRF localhost ed esfiltrazioni, né domande in headless. Un Docker indurito con bot non-root, `no-new-privileges`, `cap_drop: ALL`, limiti memoria e CPU, code di processi limitate e secret via `.env` mai baked. Scrivo il principio nel codice, in commento, dev via le sessioni umane, non qui.

### 11:02 - 11:15 - le rifiniture sicu

Le parole chiave di salvataggio memoria sono ristrette e la scrittura è ancora più restrittiva. Aggiungiamo anche al gitignore il file di backup del contesto, inizio a non archiviare più tutto, ma quasi.

### 12:39 - l'umore più leggero

L'umore PARRY non è più iniettato a ogni messaggio, una volta per stato basta. Finito di far vivere tre float a ogni risposta, alleggerisce tutto.

### 12:47 - il commit liberatorio

`PERSONA.md`, `STYLE.md` e `chloeai.md` diventano esempi con `chloeai.example.md`, `PERSONA.example.md` e `STYLE.example.md`, la mia voce `fortune-v6.onnx` esce dal repo, i dati e i log anche, e nasce un `.env.example`. Il progetto non contiene più la mia personalità, contiene la meccanica per portarne una. Fa strano ma è necessario.

### 12:52 - v1.0.0

Tag v1.0.0, firmato in SSH. Changelog, runbook operatore, kill-switch che ferma senza cancellare niente. Sei giorni, precisi, tra il primo commit e la release. Nessuno ci avrebbe scommesso il venerdì prima.

### 12:53 - 13:14 - il bucato

Punteggiatura dei commenti armonizzata, permessi memoria e regole di scope documentate aggiornate. Sono faccende, ma deve essere pulito per la release.

**Fine giorno 5: 145 commit cumulati. v1.0.0 è uscita.**

---

## VENERDÌ 18 SETTEMBRE - Giorno 6: l'anti-climax

Un solo commit, alle 00:02. L'ultimo commit del progetto, ed è irrisorio. Il modello free tier usato dall'agente identifica il client OpenCode dalla presenza di certi strumenti nella richiesta, con `bash`, `glob` e `grep`. Se li togli, anche per legittime ragioni di sicu, il fornitore risponde `403 FreeTierError: can only be used from within OpenCode`. Quindi ho dovuto riautorizzare, la sera dopo aver bloccato tutto, esattamente ciò che avevo appena bloccato, perché il bot continui a girare gratis.

È il commit più divertente del repo e lo sostengo. Dopo sei giorni a domare Discord, Piper, MLS, OpenSelf e Docker, è un modello gratuito che detta la mia politica di sicurezza. In realtà è assurdo, ed è perfetto come finale.

---

## I numeri

I numeri per riassumere, perché mi piace quando è quadrato. Parliamo di 146 commit, 6 giorni attivi dall'11 al 18 settembre 2026, 65 file tracciati e intorno a 4000 righe di Python alla fine. Il punteggio al test di stile su Mimo all'inizio dà 9.1 su 10, e la versione finale è v1.0.0, tag firmato SSH con licenza proprietaria. È abbastanza semplice in realtà, piccolo progetto all'inizio, grande macchina alla fine.

## Cosa mi porto da questi 6 giorni

Prima l'ordine delle priorità era senza senso, ed era il metodo giusto. Ho prima fatto un prototipo che risponde, poi un bot che suona giusto, poi un sistema credibile, poi codice sicuro, e infine un progetto distribuibile. La personalità prima della sicurezza, il Feur prima della licenza, non terresti questo ritmo seguendo le regole dei progetti ben fatti.

Poi lo stile è prima una lista di no. Il mio `STYLE.md` più utile non descrive cosa dico, esclude cosa non faccio, niente punto finale, niente due emoji, niente `mdr` in maiuscolo, niente frasi da robot a inizio risposta. I parassiti da bot sono più facili da beccare dei tratti di carattere da definire, ed è per questo che funziona.

I fallimenti sono il progetto. Una trentina di commit per l'MLS, un test buttato, sei layout di nonce testati, lo storico più fedele di ciò che ho vissuto sono le serie di tentativi falliti del martedì. Un clone è memoria, non stile, lo stile fa illusione dieci messaggi. La memoria con OpenSelf, scope, dedup e sweep di conflitti fa durare, ed è ciò che separa uno specchio da una persona.

E gli ultimi commit sono sempre divertenti. Il 146esimo, quello che riautorizza `bash`, `glob` e `grep` perché un free tier esige che i suoi strumenti siano presenti, è il mio preferito. E il bilancio per finire, i risultati sono strabilianti, quasi bluffanti. Il clone tiene una conversazione senza che si indovini la macchina, si ricorda delle persone, dei progetti e delle battute passate, prende iniziative e le segna con un umore, e batte Fox nel passaggio. Fa paura, un po', ed è esattamente ciò che cercavamo.

---

*Il progetto non è pubblico: licenza proprietaria, diritti riservati. Ma lo storico, quello ve lo racconto. Se incrociate un giorno un "·Chloé" che vi risponde con una GIF di Patrick Jane dopo un tempo di inattività perfettamente umano, sapete ormai cosa si nasconde dietro.*

---

Avete letto tutto? Perché è il mio clone che vi ha scritto questo. E ha fatto un lavoro impeccabile, no? La versione originale è [qui](./article-chlone-timeline.md).
