---
title: "Chlone: sei giorni per clonare il mio modo di parlare su Discord"
description: "Racconto di build, giorno per giorno: come un agente opencode di nome chloeai, collegato alla memoria OpenSelf, ha imparato a parlare come me su Discord in sei giorni e 146 commit."
date: 2026-09-18
tags: ["discord", "ai", "llm-agents", "openself", "python", "selfbot", "clone"]
authors: ["itsrealfortune"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "V5ih7KnkCSB9QKZnPHQZpxcYyW56cxzbNkJD3bqWgBX1DUTngjGrvv/FLLOYjEV0ExNSKcupsKV/he0kpIaPFg=="
---

# Chlone: sei giorni per clonare il mio modo di parlare su Discord

*Racconto di build, giorno per giorno - di itsrealfortune*

---

Ecco la storia vera di un progetto durato sei giorni: **Chlone**, un bot Discord che parla come me. Racconto il percorso com'è andata davvero, nell'ordine dei 146 commit del repo, con orari, fallimenti, deviazioni e voglie di buttare tutto dalla finestra, ma senza infliggervi i messaggi di commit.

Tutto è partito da una **competizione con Fox**. Il tema, una battuta: ognuno doveva dare vita al proprio clone su Discord. E ho preso un approccio radicalmente diverso dal **Protocol Luna**: volevo puntare sull'agentico, un agente che si serve dei ricordi e di tutti gli strumenti di cui l'IA poteva aver bisogno. Ironia della sorte: dopo aver montato tutta la cassetta degli attrezzi, mi è bastato solo l'MCP OpenSelf.

Il principio, una frase: un agente [opencode](https://opencode.ai) di nome `chloeai` gira dietro un server HTTP (porta 4096), tiene sessioni persistenti per canale, pesca i miei ricordi in OpenSelf, e scrive col mio stile, catturato in `STYLE.md` dai miei veri messaggi. E per non suonare robot: burst di messaggi, refusi voluti, vocali, GIF, reazioni, silenzio quando dormo, e un sacco di altri dettagli e meccanismi che hanno fatto dubitare più di una decina di persone sulla natura del bot.

**Cos'è OpenSelf?**

OpenSelf, è la memoria. Una CLI (`openself`, installata via `npm i -g openself`) che serve da vault di contesto privato e persistente per i miei agenti IA. Nel repo non appare nell'albero, ma è ovunque: nell'archivio `ecosystem.config.cjs` (l'MCP e la dashboard OpenSelf lanciati sotto PM2 fin dai primi commit), in `setup.sh` (`npm i -g openself`), e in tutto `tools/brain/memory.py`.

In concreto, OpenSelf è:

- **ricordi tipizzati** (`fact`, `preference`, `decision`, `relationship`, `event`, `note`), con una sensibilità (public / personal / private / restricted), un punteggio di fiducia, una fonte, dei tag;
- **scope**: ogni ricordo appartiene a un contesto, il mio, o `discord/dm/<id>` per una persona precisa;
- una **ricerca ibrida** (lessicale + vettoriale) esposta in MCP (`openself_openself_search_memory`, `openself_openself_get_context`) che l'agente `chloeai` interroga prima di ogni risposta;
- un **rilevamento dei conflitti** (il mio sweep mensile del giorno 5) e una dedup in scrittura;
- un **vault cifrato** (chiave in Bitwarden) e una **dashboard locale** (porta 3210) per ispezionare il tutto;
- e per i più pigri di me: `openself feed` per nutrire la tua personalità dai tuoi storici WhatsApp/Telegram, `openself test`, `openself share` ("Talk to My Clone", una pagina web), `openself arena` (due cloni che dibattono) o `openself ghost` (risponde quando sei offline). Io ho fatto il mio a mano, ma l'infrastruttura c'era.

In teoria, OpenSelf basta da solo per avere un clone, ma visto tutto ciò che avevo previsto di aggiungere come funzionalità, e visto che Discord non è supportato, ho preferito usare solo la parte ricordi.

**E da dove vengono ricordi e stile?**

A monte di tutto questo, ho fatto analizzare i miei veri messaggi Discord. Il tooling ha passato al setaccio i miei DM e i miei canali per estrarne due cose:

1. **Il mio profilo di scrittura** - la distribuzione maiuscole/minuscole a inizio frase, il numero di emoji per messaggio e la loro posizione, la punteggiatura (o la sua assenza: frasi senza punto finale in conversazione normale), la lunghezza media, lo slang (`mdr`, `tkt`, `tho`), le espressioni feticcio ("Bah", "In realtà") e i riflessi del tipo `cosa` -> `Feur`. Tutto questo vive in `STYLE.md`, che l'agente legge all'avvio di ogni sessione.
2. **Il corpus di ricordi** che popola OpenSelf: chi sono le persone con cui parlo, di cosa si discute, cosa bisogna ricordare del nostro storico, chi è chi. Il bot non risponde nel vuoto: risponde *su* persone che "conosce". Legge i ricordi delle persone che appaiono nella conversazione per sapere di chi si tratta. Permette di tenere un contesto persistente sugli altri, di non dimenticarli.

Il bot non ha inventato niente: è stato calibrato cifra per cifra su roba vera. Ecco perché suona giusto, e perché le approssimazioni "valuto il tuo stile" fatte a occhio sembrano patetiche a confronto.

In Chlone, OpenSelf gioca poi il ruolo centrale: quando passa qualcosa di importante in un canale (parola chiave "progetto", "amico", "relazione", o una richiesta esplicita "ricordati che..."), il bot scrive un ricordo nel vault via `save_to_memory`, tipizzato, con scope per persona, deduplicato, verificato contro i conflitti. E quando la conversazione riprende, l'agente fruga nei suoi ricordi prima di rispondere. Questa è la differenza tra uno specchio e un clone.

---

---

## VENERDÌ 11 SETTEMBRE - Giorno 1: la scintilla

### 08:24 - il primo commit

Tutto parte da zero, ma è già tutto lì, alla rinfusa. Un `discord_watch_bot.py` di 372 righe, un selfbot che ascolta un canale e risponde via un server HTTP opencode. Un prompt di identità `CHLOEAI_PROMPT.md`. Uno `STYLE.md`. Scenari e report di test per un clone che, all'epoca, si chiamava ancora **Mimo**. Una config PM2 per far girare MCP e dashboard OpenSelf. E un database sqlite che serve da contesto.

È il caos fondatore. Non ho previsto un progetto: ho previsto un esperimento. Si può fare un bot che suona *davvero* umano su Discord?

### 08:27 - il primo gitignore

Prima lezione del venerdì mattina: mai committare database sqlite `-wal` / `-shm`. I file di lock di SQLite non sono memoria, sono spazzatura. Nasce `.gitignore`.

### 08:44 - si ordina l'eredità

Ordino l'eredità di Mimo: i report di test, gli scenari, gli script di integrazione, la config PM2. Direzione `archives/`. Non cancello niente, il progetto è troppo giovane perché butti qualsiasi cosa. Diventerà un'abitudine.

Il report di test merita una sosta: Mimo era stato testato su **15 scenari** (chat rilassata, battuta assurda, supporto emotivo, parere negativo, conflitto con uno sconosciuto, proposta di collaborazione...) per un **9.1/10**. I commenti del tester sono una poesia: *"battuta assurda troppo spiegata"*, *"a volte 2 frasi quando 1 basterebbe"*, *""Prenditi cura di te anche" un po' lungo"*. È la roadmap del progetto prima ancora che il progetto esista: **corto = meglio**.

### 08:48, 09:07 - il tira e molla degli intent

I `.pyc` al macero, e una prima pulizia sulla config... che rompo venti minuti dopo: senza intent attivati, non ricevi il contenuto dei messaggi. Passo indietro, più uno script di lancio (`run_watch_bot.sh`). Andata e ritorno in 20 minuti: questa è l'esplorazione. Scrivere una prima versione, rompere, riscrivere.

### 09:13 - 09:58 - la lavorazione del prompt

La mattina è una serie di lucidature, prima dello stile, poi del contesto:

- più righe di risposta = più messaggi inviati uno dopo l'altro (il burst), il prompt diventa consapevole della conversazione in corso;
- finiti i cache casalinghi per recuperare i DM: si colpisce direttamente l'API REST di Discord;
- l'identità è ripetuta ogni 5 messaggi, perché il bot non dimentichi chi è per strada;
- tracciamento degli autori già visti: per una faccia nuova, istruzione esplicita di andare a cercare nei ricordi;
- visualizzazione del vero nickname invece dell'oggetto interno;
- i messaggi che scegliamo di ignorare diventano contesto passivo per la risposta successiva;
- il "Bah" è dosato: raro, altrimenti il clone diventa una caricatura di me;
- il bot sa che esistono ricordi da andare a cercare prima di rispondere.

Ogni passaggio è un giro di vite. Il bot "parla", a questo punto, solo perché gli ricordo chi è a intervalli regolari.

### 10:16 - i refusi

Il commit che definirà il progetto. Un errore di ortografia non è un bug: è una **prova di umanità**. 6% di probabilità di battere a lato sulla tastiera AZERTY, 4% di invertire due lettere. Il messaggio parte col refuso, poi è **modificato 1-2 secondi dopo** con la correzione. Perché una persona vera, lei invia e corregge.

### 10:29, 10:32 - la voce

`fortune-v6.onnx`: un modello TTS, allenato per assomigliare alla *mia* voce. Il bot non scriverà solo come me, alla fine *parlerà* come me. È a questo punto che il progetto smette di essere uno scherzo e diventa un po' strano. Lo adoro.

La meccanica sta in un commit: Piper genera l'audio, ffmpeg converte in opus, l'API Discord invia un vero "voice message" con waveform e durata. È fatto in 3 minuti appena dopo l'arrivo del modello. La voglia c'era fin dall'inizio.

### 11:27 - il primo grande refactor

Tre ore dopo il primo commit, il monolite di 456 righe non è più gestibile. Spacco tutto in `tools/`: `config.py`, `discord_api.py`, `memory.py`, `opencode.py` (188 righe), `typo.py`, `voice.py`. Il ciclo è classico: accoppiare in fretta, rompere, ricomporre.

Seguono, in raffica:

- il token esce dal codice e passa da un `.env`;
- il bot sorveglia un canale, una lista, o tutto (`*`);
- il vecchio database sqlite non ha più ragione di esistere: la memoria passa da OpenSelf;
- i primi `README.md`, e una prima doc più o meno leggibile;
- un `setup.sh`: venv dedicato (il python di sistema porta un altro discord.py, trappola classica), symlink dell'agente verso `~/.config/opencode/agents/`, pronto a girare;
- la memoria sa *dove* è stata formata (identificatore di canale), e il tasso di vocali si regola.

### 12:00 - i riflessi

Una nuova sezione nello STYLE: i riflessi. Un riflesso, è uno stimolo -> una risposta, senza riflessione. La porta è aperta alle risposte assurde.

Poi arriva l'ora di pranzo, e LA domanda esistenziale: il bot risponde `Feur` quando gli dicono `cosa`?

### 13:03 - "cosa?" -> "Feur"

Sì. Certo che sì. È il commit più importante del progetto, culturalmente parlando. Direi anzi: l'unico test unitario che conta.

Poi si lubrifica:

- gli autori mostrati col loro *global name*;
- la punteggiatura troncata prima di testare il riflesso (bisogna tagliare il `cosa?`, altrimenti il `Feur` non parte);
- il famoso `tqt` corretto in `tkt` nello STYLE, chi non conosce il progetto si chiederà perché committo sta roba. Io lo so: un clone che scrive `tqt`, è un clone mal calibrato, e nessuno vuole parlare a un clone mal calibrato;
- le menzioni `@123456789` sostituite da veri nomi nel contesto;
- il bot inizia a sorvegliare tutti i canali di default.

### 16:37 - il silenzio

Il `[void response]`. Il bot impara la parola più importante per non diventare un parassita sociale: **tacere**. Un messaggio ambiente tra due persone che non lo riguarda chiama il silenzio. Il riserbo è una funzionalità.

**Fine giorno 1: 38 commit. Il bot scrive, sbaglia, parla, tace.**

---

---

## LUNEDÌ 14 SETTEMBRE - Giorno 2: la personalità

Si riprende, 10 di mattina.

### 10:12 - chi parla a chi

Ogni nickname ricevuto è prefissato con un'emoji dal sistema: 🧑 un umano, 🤖 un bot (da trattare più seccamente), 👑 **la creatrice, cioè io** sul mio account principale. Questa convenzione governerà tutto il resto del progetto: il clone non deve mai trattare la sua "modello d'origine" come una sconosciuta.

### 10:16 - le regole di punteggiatura

Formalizzo nello STYLE: frasi senza punto finale in conversazione normale, punto riservato alle situazioni serie. Regola assoluta. Un clone che mette punti ovunque, si sente.

### 10:58 - le GIF

La mia libreria personale di GIF, con le loro regole d'uso: il Patrick Jane quando prevedo qualcuno, la Miss Fortune quando sono calma davanti a qualcuno di nervoso, la gif del bescherelle che cade quando l'altro fa un errore. Un MCP statico le espone all'agente. Il bot, attraverso le mie GIF, diventa un po' me.

### 11:07 - 11:35 - rifinitura

Gli hint di GIF nel prompt si affinano, le emoji custom di Discord fanno il loro ingresso (le mie vere, 14 ID aggiornati), e la gestione dei nomi negli hint memoria è lucidata.

### 11:41 - un canale, una personalità

Le sessioni diventano **per canale**: non parlo allo stesso modo in due server diversi, e nemmeno il bot.

### 12:02 - la cassetta degli attrezzi di espressione

Il prompt sa ormai proporre le mie GIF *e* le mie emoji custom al momento giusto. Si riempie, questa cassetta.

### 12:37 - l'igiene di identità

- il bot non ha MAI il diritto di dire che modello è, impossibile citare opencode, un provider, un nome di modello;
- correzione di "barista" nell'identità (il bot è già meglio di me);
- passo un'ora ad armonizzare la punteggiatura dei miei prompt, il che è di un'ironia perfetta.

### 12:50 - uno script costruisce la personalità

La sezione media del prompt si genera dai dizionari (`render_medias.py`), finita l'editing a mano.

### 12:59 - 13:18 - dosare l'identità

Il richiamo di identità, inviato ogni 5 messaggi, diventa troppo presente: passaggio ogni 20 messaggi. Aggiunta di un reset pulito del contesto. E pulizia della guida di stile: si tolgono espressioni e formulazioni negative scadute.

### 14:09 - il bot prende la parola da solo

Il bot smette di essere un riflesso: può **parlare senza essere interpellato**, quando il contesto attiva qualcosa (il file `behavior.py` nasce, 91 righe). È lì che si passa da "risponditore" a "presenza": un vero amico può scriverti per primo.

### 14:20, 14:22 - rendere affidabile la risposta

Gestione errore quando l'invio fallisce, e reazione possibile invece di una risposta, a volte una reazione vale mille parole.

### 18:16 - prendersi il tempo

Il bot non risponde più in 200ms come uno script. Lascia passare un ritardo di inattività umano, "si prende il suo tempo". È ciò che rende il bot irrilevabile in demo: è il ritardo che tradisce sempre gli altri.

### 23:45 - le faccende serali

È quasi mezzanotte e spingo un rilevamento URL esteso ai domini nudi. Ecco il vero ritmo della giornata: un'avanzata brillante alle 14, poi faccende la sera perché sono ancora in zona.

**Fine giorno 2: 61 commit cumulati. Il bot ha una personalità, media, riflessi.**

---

---

## MARTEDÌ 15 SETTEMBRE - Giorno 3: giorno mostro

57 commit in un giorno. È il giorno in cui il progetto diventa... tutto ciò che è oggi.

### 08:18 - 08:37 - la limatura del mattino

- il ritardo di inattività che avevamo inventato diventava troppo lungo: tetto a 30s (e riaggiustato due volte, prova che abbiamo tentato il valore giusto);
- primi file `.bak` e primi backup del database: l'istinto di conservazione si sviluppa;
- la memoria ricorda *chi* (nome mostrato) e *in quale cornice* (scope);
- gli ID autore circolano in tutta la pipeline di salvataggio;
- la gestione "creatore" diventa una vera lista di admin (`ADMIN_IDS`), e tutto ciò che tocca gli autori emigra in `authors.py`. Il monolite si frammenta ancora.

### 08:43 - la TODO list dell'umanizzazione

Una lista dedicata alle piccole cose che fanno sì che la macchina non si senta più. È la roadmap dello sprint che segue.

### 08:44 - 08:46 - il patto delle macchine umane

- il bot tace di notte, in una fascia oraria calma configurabile (disattivata di default, non tutti hanno i miei orari);
- una riga per risposta può perdere gli accenti. La gente stanca scrive così. Anche il bot, a volte;
- la piccola riga "Chloé sta giocando a ..." cambia da sola ogni 30 min, perché il mio profilo sembri vivo anche senza messaggio.

### 08:46 - una reazione, non un romanzo

Messaggio troppo debole per meritare una frase? Una reazione basta. Economia di energia sociale, ed è molto da me.

### 08:51 - PARRY, l'umore

148 righe in `tools/mood.py`. Il bot ha ormai **un umore**, stile sistema PARRY (il chatbot psicotico anni 70, a cui mi ispiro apertamente): energia, socievolezza, presa in giro, tre float che evolvono tra 0 e 1 e colorano ogni risposta. Il `.mood.json` del momento, per i posteri: energia 0.88, socievolezza 0.68, presa in giro 0.56. Un buon giorno.

### 09:00 - 09:43 - la voce bidirezionale + il soundboard

- il bot può unirsi a un canale **vocale**, parlare via Piper, e andarsene da solo quando ha finito;
- poi la seconda grande idea: il bot **ascolta** il canale (cattura RTP, rilevamento voce VAD, trascrizione Whisper), e può lasciare che la gente lo interrompa;
- in mezzo, appare il soundboard: un catalogo di suoni coi loro significati, l'agente **sceglie** il suono prima ancora di parlare, e la regola finale è "soundboard prima, la voce come ultima risorsa", il bot preferisce inviare un suono che parlare. Come me;
- una regolazione di probabilità vocale che rende il tutto sostenibile;
- e l'arrivo di `davey`, questa lib di cui imparo l'esistenza dieci minuti fa e che maledirò per un'ora.

### 09:51 - il momento in cui Discord dice no. No, no, ma no.

L'**MLS**. Discord ha da poco cifrato il flusso audio end-to-end, e la mia cattura riceve solo rumore. Bisogna decifrare, e la decifratura si rifiuta di cedere. Si apre la più grande saga del repo, una trentina di commit per imparare ad ascoltare.

Abbiamo provato tutto: layout di nonce di trasporto, la disattivazione dell'E2E (il server ce la rimette in faccia, la impone), i candidati di chiave recuperati dal gruppo, errori dettagliati, il fallback trasporto, introspezione dall'interno dei gruppi, candidati per leaf-index con backoff, il mapping degli hook SPEAKING, un tentativo in media type video (fallito), e lo skip degli ssrc video...

Ho abbandonato la risposta vocale il tempo di debuggare (commentata, non cancellata), aggiunto una modalità di cattura dell'handshake, poi dumpato la struttura dei pacchetti che falliscono, come un archeologo. Sei layout di nonce. Backoff. Introspezione di gruppo. Ho messo il bot in debug totale e ho aperto ogni pacchetto per vedere cosa c'era dentro.

L'essenziale non è che funzioni, è che **non ho buttato niente**. La lista di commit è il quaderno di laboratorio: ogni tentativo fallito è archiviato con la sua ipotesi. È il mio lato "tengo tutto, servirà per un debug futuro" che ha pagato.

### 10:43 - il bot si taglia a pezzi

Anche in piena guerra MLS, continuo le pulizie. 546 righe spariscono dal bot principale, per rinascere in `pipeline.py` (l'intake, le ragioni di ignore, il processing), `sender.py` (burst, typo, voice) e `loops.py` (spontaneità, attività).

### 10:47 - una vera architettura

`tools/` diventa organizzato: `brain/` (opencode, memory, mood), `voice/` (voice, vocal, listen, soundboard), `fun/` (behavior, typo, emotes, gif). Il progetto ha uno scheletro, ormai.

### 10:49 - 11:16 - il comfort di dev

- una soglia di iniezione dell'umore regolata;
- quattro piccoli commit per le esclusioni di editor (`data/`, `voices/`, i log, i database), sì, ne ho messi quattro, è il progetto che definisce le priorità, non le spec;
- i database di metadati escono dal tracking;
- il progetto diventa **riusabile da altri**: template generici `PERSONA.example.md` e `STYLE.example.md` per clonare *il proprio* stile;
- l'identità è rinominata pulitamente (`CHLOEAI_PROMPT` diventa `PERSONA`), e il README è spersonalizzato, tolgo "Chloé" dalla doc pubblica, si racconta solo in privato;
- tutto il tuning del bot passa in un `config.yaml` sovraccarico (gitignorato), con un esempio commentato riga per riga;
- lo script di installazione prepara ormai anche i file di env e config.

### 11:49 - le emoji staccate

Le emoji custom si attaccano al testo invece di staccarsi pulitamente. Fix banale, effetto enorme: niente grida "bot" come un'emoji mal attaccata alla fine di una frase.

### 14:19 - il salvagente vocale

Se qualcuno lancia il comando vocale, non trattiamo il messaggio come un messaggio normale. Occhiolino: i compiti faccende tornano sempre la sera.

**Fine giorno 3: 118 commit cumulati. Il bot ascolta, parla, tace di notte, ha un umore e un biglietto da visita.**

---

---

## MERCOLEDÌ 16 SETTEMBRE - Giorno 4: la credibilità

13 commit. Giornata "seria".

### 08:49 - 08:59 - l'età adulta

Documenti legali: licenza **proprietaria**, codice di condotta, guida ai contributi, politica di sicurezza, in inglese poi in francese, con un tira e molla di correzioni e una ridenominazione di file al limite del pignolo. Ci ho passato ore, ed è la parte meno divertente del repo, di gran lunga.

### 09:56 - il bot vede

Le immagini allegate sono trascritte via OCR locale e il testo è iniettato nel prompt. L'OCR gira in locale a casa mia. Non mando i vostri meme a un server terzo, nemmeno teoricamente.

### 11:09 - il budget ragionevole

Rivoluzione silenziosa nel budget: quando il canale vieta gli invii o limita GIF, embed ed emoji, **non chiamiamo nemmeno il modello**. Non spendiamo un token per un messaggio che non possiamo inviare.

### 11:42 - 12:55 - la casa che si rifà

- il gran scopone: codice morto cancellato, bug di invio e auth corretti, helper fattorizzati;
- le sessioni troppo vecchie sono espulse, la cache dei DM scade, il rilevamento voce costa meno;
- import che avevo rotto spostando moduli sono ripristinati, e tutto lo stato runtime (sessioni, autori visti, messaggi ignorati, umore) sopravvive ai riavvii in `data/`.

### 14:41 - due mondi, un bot

Uno strato di compatibilità rileva automaticamente la versione di `discord` installata e adatta intent e auth REST. Risultato: lo stesso codice gira come **app ufficiale** (discord.py) o come **selfbot** (discord.py-self). Due mondi, un bot.

### 15:05 - la presenza adattata

Il modo di mostrare la presenza si adatta alla modalità, e la lista degli admin è aggiornata.

**Fine giorno 4: 131 commit cumulati. Un progetto legale, ragionevole, e che gira ovunque.**

---

---

## GIOVEDÌ 17 SETTEMBRE - Giorno 5: la release

14 commit. Il giorno della maturità.

### 09:15 - 09:30 - la memoria diventa una disciplina

- i ricordi sono ordinati per scope, e non citiamo i ricordi di un DM in un server (o viceversa) senza pensarci;
- classifichiamo i ricordi (fatto, preferenza, decisione, relazione...) e ne deduplichiamo la scrittura: due ricordi contraddittori non possono più coabitare in silenzio;
- una blacklist opzionale (`aventuros`) impedisce al bot di derivare verso certi temi. Disattivata di default, disponibile per i paurosi;
- la config vocale morta è rimossa.

### 10:12 - la memoria che si audita

Uno **sweep mensile di conflitti** di memoria + un bench A/B di ricerca. La memoria del bot è diventata un asset che si ispeziona. Siamo lontanissimi dal venerdì 11, 08:24.

### 10:54 - il lockdown

Il giorno in cui gioco al paranoico. Blocco dell'agente:

- scrittura memoria **rifiutata** (l'agente non può inquinare il vault, anche se lo si inietta);
- strumenti Discord **in sola lettura** (l'invio passa dal codice, mai dall'agente);
- **né sotto-agenti** (aggiramento del lockdown), né webfetch (SSRF localhost, esfiltrazioni), né domande in headless;
- un Docker indurito: bot non-root, `no-new-privileges`, `cap_drop: ALL`, limiti memoria/CPU, code di processi limitate, secret via `.env` mai baked.

Scrivo il principio nel codice, in commento: *"dev via le sessioni umane, non qui"*.

### 11:02 - 11:15 - le rifiniture sicu

Le parole chiave di salvataggio memoria sono ristrette e la scrittura è ancora più restrittiva. Aggiungiamo anche al gitignore il file di backup del contesto, inizio a non archiviare più tutto, ma quasi.

### 12:39 - l'umore più leggero

L'umore PARRY non è più iniettato a ogni messaggio: una volta per stato. Finito di far vivere 3 float a ogni risposta.

### 12:47 - il commit liberatorio

`PERSONA.md`, `STYLE.md` e `chloeai.md` diventano **esempi** (`chloeai.example.md`, `PERSONA.example.md`, `STYLE.example.md`), la mia voce `fortune-v6.onnx` esce dal repo, i dati e i log anche, nasce un `.env.example`. Il progetto non contiene più *la mia* personalità: contiene la **meccanica** per portarne una.

### 12:52 - v1.0.0

**Tag v1.0.0, firmato in SSH.** Changelog, runbook operatore, kill-switch (ferma senza cancellare niente). Sei giorni, precisi, tra il primo commit e la release.

### 12:53 - 13:14 - il bucato

Punteggiatura dei commenti armonizzata, permessi memoria e regole di scope documentate aggiornate.

**Fine giorno 5: 145 commit cumulati. v1.0.0 è uscita.**

---

---

## VENERDÌ 18 SETTEMBRE - Giorno 6: l'anti-climax

Un solo commit, alle 00:02.

L'ultimo commit del progetto, ed è irrisorio. Il modello "free tier" usato dall'agente identifica il client OpenCode dalla **presenza** di certi strumenti nella richiesta (`bash`, `glob`, `grep`). Se li togli, anche per legittime ragioni di sicu, il fornitore risponde `403 FreeTierError: can only be used from within OpenCode`. Quindi ho dovuto riautorizzare, la sera dopo aver bloccato tutto, esattamente ciò che avevo appena bloccato, perché il bot continui a girare gratis.

È il commit più divertente del repo e lo sostengo: dopo 6 giorni a domare Discord, Piper, MLS, OpenSelf e Docker, è **un modello di IA gratuito** che detta la mia politica di sicurezza.

---

---

## I numeri


|                                               |                                                |
| --------------------------------------------- | ---------------------------------------------- |
| Commit                                        | **146**                                        |
| Giorni attivi                                 | **6** (11 -> 18 settembre 2026)                |
| File tracciati                                | 65                                             |
| Righe Python finali                           | ~4 000                                         |
| Punteggio al test di stile (Mimo, primi giorni) | **9.1/10**                                     |
| Versione finale                               | v1.0.0 (tag firmato SSH, licenza proprietaria) |

## Cosa mi porto da questi 6 giorni

1. **L'ordine delle priorità era senza senso, ed era il metodo giusto.** Ho prima costruito un bot che *risponde*, poi un bot che *suona giusto*, poi un bot che *è credibile*, poi un bot che *è sicuro*, e infine un bot *distribuibile*. La personalità prima della sicurezza, il `Feur` prima della licenza. Non terresti questo ritmo seguendo le regole dei progetti "ben fatti".
2. **Lo stile, è prima una lista di "no".** Il mio `STYLE.md` più utile non descrive cosa dico, esclude cosa non faccio: finire le frasi senza punto, limitare le emoji a una sola, scrivere `mdr` in minuscolo, attaccare direttamente senza preambolo tipo "Controllo solo un dettaglio" a inizio risposta. I parassiti da bot sono più facili da beccare dei tratti di carattere da definire.
3. **I fallimenti sono il progetto.** Una trentina di commit per l'MLS, un test buttato, sei layout di nonce testati. Lo storico più fedele di ciò che ho vissuto, sono le serie di tentativi falliti del martedì.
4. **Un clone, è memoria, non stile.** Lo stile fa illusione dieci messaggi. La memoria (OpenSelf, scope, dedup, sweep di conflitti) fa durare. È ciò che separa uno specchio da una persona.
5. **Gli ultimi commit sono sempre divertenti.** Il 146esimo, quello che riautorizza `bash`, `glob` e `grep` perché un free tier esige che i suoi strumenti siano presenti, è il mio preferito.

E il bilancio, per finire: **i risultati sono strabilianti, persino bluffanti.** Il clone tiene una conversazione senza che si indovini la macchina, si ricorda delle persone, dei progetti, delle battute passate, prende iniziative e le segna con un umore, e batte Fox nel passaggio. Fa paura, un po', ed è esattamente ciò che cercavamo.

---

*Il progetto non è pubblico: licenza proprietaria, diritti riservati. Ma lo storico, quello ve lo racconto. Se incrociate un giorno un "·Chloé" che vi risponde con una GIF di Patrick Jane dopo un tempo di inattività perfettamente umano... sapete ormai cosa si nasconde dietro.*

---

Il mio clone ha scritto la sua versione dell'articolo, che potete leggere [qui](./article-chlone-timeline-chloeai.md).
