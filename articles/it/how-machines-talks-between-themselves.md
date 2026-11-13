---
title: "Come si parlano le macchine: panoramica da TCP a mTLS"
description: "Perché TCP, UDP, TLS, mTLS, HTTP e WebSocket non sono alternative concorrenti ma strati impilati; una panoramica gerarchica della comunicazione macchina-macchina, dal trasporto grezzo all'autenticazione mutua."
date: 2026-07-16
tags: ["tcp", "udp", "tls", "mtls", "websocket", "http", "grpc", "réseau", "architecture-distribuée", "protocoles"]
authors: ["docteur-turboss"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "VHqbNTjITsbEvX4o84qNpk+y7XdzrgIEJPIkEQMbtrnkM1SyaQPca11w9e3v7seLyblOWRcwuVtvj07SrEK42w=="
---

# Il problema: troppe sigle, poca gerarchia

TCP, UDP, TLS, mTLS, WebSocket, HTTP, HTTPS, gRPC, QUIC; quasi tutte le risorse che ne parlano le presentano come una lista piatta di opzioni intercambiabili, "da scegliere secondo il caso d'uso". In realtà non sono sullo stesso piano: alcuni sono protocolli di trasporto, altri strati di sicurezza che si avvolgono intorno al trasporto, altri ancora protocolli applicativi che si appoggiano sui primi due. Capire la gerarchia, è capire perché non "scegli" mai tra TCP e TLS: scegli TCP, _poi_ decidi se mettere TLS sopra.

Questo articolo ricostruisce questa gerarchia strato per strato, dal trasporto grezzo fino all'autenticazione mutua, con per ogni livello: cosa garantisce, cosa non garantisce, e quando accontentarsene.

# Livello 1: il trasporto (TCP contro UDP)

Tutto inizia qui. TCP e UDP sono i due principali protocolli dello strato **Trasporto (Layer 4)** del modello OSI. Il loro ruolo è identico: trasportare un flusso di dati tra due applicazioni eseguite su macchine diverse. Eppure, il loro modo di riuscirci è radicalmente diverso.

È importante capire che IP (Internet Protocol), situato allo strato rete (Layer 3), fa solo instradare pacchetti da un host a un altro. Non garantisce né il loro arrivo, né il loro ordine, né la loro unicità. I router prendono semplicemente decisioni di routing indipendenti per ogni pacchetto.

È proprio questa assenza di garanzie che TCP viene a compensare, mentre UDP sceglie deliberatamente di non aggiungere niente per restare estremamente leggero.

## TCP: l'affidabilità prima di tutto

TCP (Transmission Control Protocol) è un protocollo **orientato alla connessione** (_connection-oriented_). Prima di scambiare il minimo byte di dati, le due macchine devono stabilire una connessione logica.

Questa connessione è creata grazie al famoso **Three-Way Handshake**:

```

Client                           Server
SYN ---------------------------->
        <--------------------- SYN + ACK
ACK ---------------------------->
Connessione stabilita
```

Ogni passo ha un obiettivo preciso:

*   SYN: il client annuncia che vuole aprire una connessione e fornisce un primo numero di sequenza (Initial Sequence Number - ISN).

*   SYN-ACK: il server accetta la connessione, accusa ricevuta del SYN e fornisce a sua volta il suo numero di sequenza.

*   ACK: il client conferma la ricevuta delle informazioni del server.


Da questo momento, le due macchine conoscono lo stato della connessione e possono iniziare a scambiare dati.

### **I numeri di sequenza**

TCP non vede i dati come una successione di pacchetti, ma come un **flusso continuo di byte** (_byte stream_).

Ogni byte inviato ha un numero di sequenza.

Esempio:

```
Messaggio:

Buongiorno

B = byte 0
u = byte 1
o = byte 2
...
```

Se un segmento contenente i byte da 1000 a 1499 è perso durante il trasporto, il ricevente può rilevare esattamente cosa manca.

Il mittente ritrasmette solo quella porzione.

Questa granularità è una delle ragioni della robustezza di TCP.

### **Le ricevute (ACK)**

Dopo la ricevuta dei dati, il destinatario invia un **ACK (Acknowledgment)**.

Contrariamente a ciò che spesso si immagina, un ACK non significa:

> "Ho ricevuto questo pacchetto"

Significa piuttosto:

> "Ho ricevuto tutti i byte fino al numero X."

Per esempio:

```
Client invia:

0 → 999

Server risponde:

ACK = 1000
```

Questo significa:

> "Tutto ciò che precede il byte 1000 è arrivato bene."

Questo meccanismo permette di accusare ricevuta di più segmenti insieme (_cumulative acknowledgments_), riducendo così il numero di pacchetti di controllo.

### **Le ritrasmissioni**

Se un ACK non arriva mai, TCP suppone che il segmento sia perso.

Lo ritrasmette automaticamente.

Il ritardo di ritrasmissione (**Retransmission Timeout – RTO**) non è fisso.

TCP misura in permanenza il tempo di andata-ritorno (**RTT**) grazie agli ACK ricevuti e calcola dinamicamente l'RTO per evitare ritrasmissioni inutili.

Le implementazioni moderne usano anche meccanismi come **Fast Retransmit**: quando un mittente riceve più ACK duplicati (generalmente tre), deduce che un segmento intermedio è stato perso e lo rinvia subito, senza aspettare la scadenza del timer.

### **Riordino dei pacchetti**

Internet non garantisce assolutamente che due pacchetti seguano lo stesso percorso.

Esempio:

```
Pacchetto 1
Parigi
  ↓
Londra
  ↓
New York

Pacchetto 2
Parigi
  ↓
Francoforte
  ↓
Chicago
  ↓
New York
```

Il secondo pacchetto può arrivare prima del primo.

TCP salva allora temporaneamente i segmenti ricevuti **fuori ordine** in un buffer (_reassembly buffer_), poi li riassembla prima di consegnarli all'applicazione.

Per l'applicazione, tutto sembra arrivare perfettamente in ordine.

### Controllo di flusso

Una connessione non dipende solo dalla rete.

Il ricevente ha anche una capacità di memoria limitata.

Se riceve più in fretta di quanto riesca a elaborare i dati, i suoi buffer finiscono per saturarsi.

TCP risolve questo problema grazie a una **finestra scorrevole (Sliding Window)**.

Il ricevente indica in ogni ACK:

```
Window = 32768 byte
```

Questo significa:

> "Puoi inviarmi fino a 32 KB in più."

Se questa finestra cade a zero:

```
Window = 0
```

Il mittente sospende temporaneamente le trasmissioni finché il ricevente annuncia una nuova finestra disponibile.

Questo meccanismo costituisce il **controllo di flusso (Flow Control)** e impedisce che un host rapido inondi un host più lento.

### Controllo di congestione

Anche se il ricevente è capace di assorbire i dati, la rete stessa può saturarsi.

I router hanno code (_queues_) limitate.

Quando traboccano, i pacchetti sono scartati.

TCP interpreta le perdite come un segno di congestione e adatta automaticamente la sua portata grazie a una **finestra di congestione (Congestion Window – cwnd)**.

Gli algoritmi moderni (come **Reno**, **CUBIC** o **BBR**, secondo i sistemi operativi) aggiustano questa finestra per trovare un equilibrio tra portata massima e stabilità della rete.

Le prime versioni di TCP usavano principalmente due meccanismi:

*   **Slow Start**: aumento esponenziale della portata fino a rilevare una congestione.

*   **Congestion Avoidance**: crescita poi più prudente, generalmente lineare.


Questa adattamento permanente è una delle ragioni per cui TCP resta performante nonostante le variazioni di qualità della rete.

### Chiusura di connessione

A differenza di UDP, una connessione TCP ha anche una chiusura pulita.

Ogni estremità chiude indipendentemente il suo flusso grazie al flag **FIN**.

Una chiusura completa richiede generalmente quattro scambi:

```
FIN
ACK
FIN
ACK
```

Questa procedura garantisce che tutti i dati in transito siano stati ben consegnati prima della distruzione della connessione.

## UDP: la semplicità massima

UDP (User Datagram Protocol) adotta la filosofia inversa.

È **senza connessione (connectionless)**.

Non esiste:

*   alcun handshake;

*   alcun numero di sequenza;

*   alcuna ricevuta;

*   alcuna ritrasmissione;

*   alcun controllo di flusso;

*   alcun controllo di congestione.


Ogni messaggio è semplicemente incapsulato in un **datagramma** indipendente, trasmesso alla rete, poi dimenticato dal mittente.

```
Applicazione → Datagramma UDP → IP → Internet
```

Il protocollo non conserva alcuno stato tra due invii.

Ogni datagramma è totalmente indipendente dai precedenti.

### L'integrità dei dati

Anche se UDP non garantisce né consegna né ordine, protegge comunque l'integrità dei dati grazie a un **checksum**.

Alla ricevuta, il checksum è ricalcolato.

*   Se i valori corrispondono, il datagramma è accettato.

*   Altrimenti, è subito scartato.


UDP rileva quindi i dati corrotti, ma non prova mai a recuperarli.

### Perché UDP è così rapido?

L'header UDP contiene solo **8 byte**, contro un minimo di **20 byte** per TCP (senza contare le opzioni come timestamp, SACK o Window Scaling).

Dato che nessuna connessione è mantenuta, il sistema operativo non deve seguire lo stato di ogni scambio, il che riduce anche consumo di memoria e costo di elaborazione.

L'applicazione riceve i dati quasi appena arrivano, senza aspettare eventuali ritrasmissioni.

## Quando perdere un dato è preferibile

L'idea fondamentale è semplice:

> Un'informazione vecchia può avere meno valore di un'informazione persa.

Prendiamo una conversazione VoIP.

Ogni pacchetto trasporta circa **20 ms** di voce.

Se un pacchetto è perso, ritrasmetterlo prenderebbe spesso più tempo di questi 20 ms.

Quando arriverebbe infine, la conversazione sarebbe già andata avanti.

Quasi tutte le applicazioni preferiscono allora mascherare la perdita (interpolazione, silenzio, correzione di errore) invece di aspettare la ritrasmissione.

Lo stesso ragionamento si applica:

*   ai giochi multiplayer in tempo reale;

*   allo streaming video;

*   ai flussi di telemetria;

*   ai sensori IoT;

*   ai dati di posizione GPS.


Un valore recente è quasi sempre più utile di un valore vecchio perfettamente affidabile.

# Livello 2: la cifratura, TLS

TLS (Transport Layer Security, successore di SSL) non sostituisce TCP, si aggiunge sopra. In concreto, TLS stabilisce una normale connessione TCP, poi negozia una sessione cifrata dentro: scambio di certificati, accordo su un algoritmo di cifratura, derivazione di chiavi di sessione. Tutto ciò che transita poi è cifrato e autenticato.

Tre garanzie distinte, spesso confuse:

*   **Riservatezza**: nessun altro oltre le due parti può leggere il contenuto.

*   **Integrità**: ogni alterazione dei dati in transito è rilevata.

*   **Autenticazione**: ma nel TLS classico, a senso unico: il client verifica che il server sia bene ciò che pretende di essere (via il suo certificato, firmato da un'autorità di fiducia), ma il server non verifica niente sull'identità del client. È esattamente il modello di HTTPS quando visiti un sito: il browser autentica il sito, il sito non ti autentica (l'autenticazione utente passa da un meccanismo separato, cookie di sessione, token).


TLS 1.3 (la versione attuale raccomandata) ha ridotto l'handshake a un solo andata-ritorno nel caso comune, contro due per TLS 1.2, il che riduce sensibilmente la latenza di connessione.

## Livello 2bis: mTLS: l'autenticazione diventa mutua

mTLS (mutual TLS) è TLS con un vincolo in più: il server esige _anche_ un certificato dal client, e lo verifica. Entrambe le parti provano la loro identità via un certificato firmato da un'autorità di fiducia comune.

È il meccanismo naturale per la comunicazione servizio-servizio in un'architettura distribuita: là dove HTTPS classico basta perché un browser parli a un server pubblico, mTLS risponde a una domanda diversa; _come fa un servizio interno a sapere che parla bene a un altro servizio interno autorizzato, e non a un attaccante atterrato sulla rete?_

```
Client                                          Server
  │──── ClientHello ─────────────────────────────▶│
  │◀─── ServerHello + certificato server ──────────│
  │──── verifica il certificato server ─────────────│
  │──── invia il SUO certificato client ──────────▶│
  │◀─── verifica il certificato client ───────────────│
  │──── chiavi di sessione derivate, canale cifrato ──▶│
```

La contropartita di mTLS è operativa: serve un'autorità di certificazione (CA) interna, un meccanismo di distribuzione dei certificati a ogni servizio, e una strategia di rotazione/revoca. In un ambiente mono-macchina con pochi servizi, è a volte più complessità che beneficio: mTLS diventa necessario dal momento in cui il traffico inter-servizi attraversa una rete che non controlliamo interamente (più host, cloud multi-tenant), o appena vogliamo una politica tipo _zero trust_, dove nessun servizio è implicitamente degno di fiducia solo perché è "dentro" la rete.

# Livello 3: i protocolli applicativi sopra TCP+TLS

Una volta messi trasporto e cifratura, resta da definire _come strutturare gli scambi_. È il ruolo dei protocolli applicativi.

## HTTP / HTTPS

HTTP è un protocollo richiesta-risposta: il client apre una connessione (o ne riusa una, col keep-alive), invia una richiesta, aspetta una risposta, la connessione può poi richiudersi o essere riusata. HTTPS, è semplicemente HTTP su TLS: la S non cambia niente alla semantica del protocollo, solo al fatto che il trasporto è cifrato.

Il modello richiesta-risposta ha un limite strutturale: il server non può mai parlare per primo. Può solo rispondere a ciò che il client chiede. Per polling frequente (verificare "c'è qualcosa di nuovo?" ogni secondo), funziona ma spreca risorse: ogni richiesta ricrea overhead protocollare per, quasi sempre, non avere niente di nuovo da annunciare.

## WebSocket (WS / WSS)

WebSocket risponde esattamente a questo limite. La connessione inizia come una normale richiesta HTTP (con un header `Upgrade: websocket`), ma una volta accettato l'handshake, la connessione TCP sottostante non è più un canale richiesta-risposta HTTP: diventa un canale bidirezionale full-duplex dove client e server possono inviare messaggi in qualsiasi momento, senza dover riemettere un ciclo richiesta-risposta a ogni scambio.

```
GET /chat HTTP/1.1
Host: example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13

HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

WSS è semplicemente WebSocket su TLS, esattamente come HTTPS è HTTP su TLS. È il protocollo di scelta per tutto ciò che richiede push server in tempo reale: chat, notifiche, flussi di trading, eventi di gioco: senza voler gestire da sé un protocollo binario sopra TCP nudo.

## gRPC

Meno noto fuori dal mondo microservizi ma centrale in comunicazione servizio-servizio: gRPC si appoggia su HTTP/2 (quindi TCP + TLS opzionale), serializza i messaggi in Protocol Buffers (binario, tipizzato, compatto: al contrario del JSON testo di quasi tutte le API REST), e permette nativamente lo streaming bidirezionale grazie al multiplexing di HTTP/2 (più flussi logici su una sola connessione TCP, senza l'head-of-line blocking che avrebbero più richieste HTTP/1.1 sequenziali).

## QUIC / HTTP3

QUIC cambia le carte ripartendo da UDP invece di TCP a livello trasporto, reimplementando sopra le garanzie di affidabilità che TCP offriva nativamente: ma flusso per flusso invece che globalmente, il che elimina l'head-of-line blocking a livello trasporto (un pacchetto perso su un flusso non blocca più gli altri flussi della stessa connessione). TLS 1.3 è integrato direttamente in QUIC invece che aggiunto sopra, il che riduce ancora la latenza di handshake. HTTP/3 è HTTP sopra QUIC.

# Panoramica: dove sta ogni protocollo

Strato Protocolli Ruolo Trasporto TCP, UDP Far viaggiare byte, affidabile o no Trasporto (nuova generazione) QUIC UDP + affidabilità per flusso + TLS integrato Sicurezza TLS, mTLS Cifratura, integrità, autenticazione (uni o mutua) Applicazione HTTP/HTTPS, WS/WSS, gRPC Strutturare gli scambi (richiesta-risposta, bidirezionale, RPC tipizzato)

Un esempio concreto per fissare le idee: un'architettura microservizi con una dashboard web e servizi interni potrebbe ragionevolmente combinare HTTPS (dashboard ↔ API pubblica, autenticazione unidirezionale sufficiente lato browser), mTLS (servizio ↔ servizio in interno, autenticazione mutua necessaria), e WSS (notifiche tempo reale spinte verso la dashboard): tre protocolli applicativi diversi, tutti costruiti sullo stesso basamento TCP + TLS.

## Come scegliere, in pratica

Tre domande bastano generalmente a decidere:

1.  **Ho bisogno di affidabilità e ordine, o la freschezza del dato primeggia sulla sua consegna garantita?** → TCP se sì, UDP se no (o QUIC per avere entrambi con un compromesso diverso).

2.  **Il server deve poter iniziare messaggi, o il client fa sempre la prima richiesta?** → WebSocket/gRPC streaming se il server deve spingere, HTTP classico altrimenti.

3.  **Entrambe le parti devono provarsi a vicenda la loro identità, o solo una delle due deve essere verificata?** → mTLS per servizio-servizio in ambiente zero-trust, TLS semplice per client pubblico classico.


La complessità operativa aumenta a ogni strato aggiunto, TCP nudo non ha alcuna infrastruttura da gestire, TLS chiede certificati, mTLS chiede una CA e una strategia di rotazione, gRPC chiede una definizione di schema Protobuf condivisa. Il buon riflesso è salire in complessità solo quando lo strato sotto mostra un limite concreto, non per anticipazione.
