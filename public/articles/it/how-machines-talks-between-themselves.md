---
title: "Come le macchine comunicano tra loro: una panoramica da TCP a mTLS"
description: "Perché TCP, UDP, TLS, mTLS, HTTP e WebSocket non sono alternative concorrenti ma livelli sovrapposti; una panoramica gerarchica della comunicazione macchina a macchina, dal trasporto grezzo all'autenticazione reciproca."
date: 2026-07-16
tags: ["tcp", "udp", "tls", "mtls", "websocket", "http", "grpc", "rete", "architettura-distribuita", "protocolli"]
authors: ["docteur-turboss"]
lang: "it"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "Z5qrcxwneywelRFgOe1WXM4s1ZPsyd8yqZcK43Yk/J9AGx6pBchiJ90LPac1pYm1o6X3rcDMpDV7g3fPhpB5Tw=="
---
# Il problema: troppi acronimi, poca gerarchia

TCP, UDP, TLS, mTLS, WebSocket, HTTP, HTTPS, gRPC, QUIC; la maggior parte delle risorse che ne parlano li presentano come una lista piatta di opzioni intercambiabili, "da scegliere in base al caso d'uso". In realtà non sono sullo stesso piano: alcuni sono protocolli di trasporto, altri sono livelli di sicurezza che si avvolgono attorno al trasporto, altri ancora sono protocolli applicativi che si basano sui primi due. Comprendere la gerarchia significa capire perché non si "sceglie" mai tra TCP e TLS: si sceglie TCP, _poi_ si decide se mettere TLS sopra.

Questo articolo ricostruisce questa gerarchia strato per strato, dal trasporto grezzo all'autenticazione reciproca, con per ogni livello: cosa garantisce, cosa non garantisce, e quando accontentarsene.

# Livello 1: il trasporto (TCP contro UDP)

Tutto inizia qui. TCP e UDP sono i due principali protocolli del livello **Trasporto (Layer 4)** del modello OSI. Il loro ruolo è identico: trasportare un flusso di dati tra due applicazioni eseguite su macchine diverse. Tuttavia, il loro modo di raggiungerlo è radicalmente diverso.

È importante capire che IP (Internet Protocol), situato al livello di rete (Layer 3), si limita a instradare pacchetti da un host all'altro. Non garantisce né la loro consegna, né il loro ordine, né la loro unicità. I router prendono semplicemente decisioni di instradamento indipendenti per ogni pacchetto.

È proprio questa assenza di garanzie che TCP viene a compensare, mentre UDP sceglie deliberatamente di non aggiungere nulla per rimanere estremamente leggero.

## TCP: l'affidabilità prima di tutto

TCP (Transmission Control Protocol) è un protocollo **orientato alla connessione** (_connection-oriented_). Prima di scambiare il minimo byte di dati, le due macchine devono stabilire una connessione logica.

Questa connessione viene creata grazie al famoso **Three-Way Handshake**:

```

Client                           Server
SYN ---------------------------->
        <--------------------- SYN + ACK
ACK ----------------------------> 
Connessione stabilita
```

Ogni passo ha un obiettivo preciso:

*   SYN: il client annuncia di voler aprire una connessione e fornisce un primo numero di sequenza (Initial Sequence Number - ISN).
    
*   SYN-ACK: il server accetta la connessione, accusa ricevuta del SYN e fornisce a sua volta il proprio numero di sequenza.
    
*   ACK: il client conferma la ricezione delle informazioni del server.
    

Da questo momento, le due macchine conoscono lo stato della connessione e possono iniziare a scambiare dati.

### **I numeri di sequenza**

TCP non vede i dati come una successione di pacchetti, ma come un **flusso continuo di byte** (_byte stream_).

Ogni byte inviato possiede un numero di sequenza.

Esempio:

```
Messaggio:

Bonjour

B = byte 0
o = byte 1
n = byte 2
...
```

Se un segmento contenente i byte da 1000 a 1499 viene perso durante il trasporto, il ricevente può rilevare esattamente cosa manca.

Il mittente ritrasmette solo quella porzione.

Questa granularità è una delle ragioni della robustezza di TCP.

### **Gli acknowledgement (ACK)**

Dopo la ricezione dei dati, il destinatario invia un **ACK (Acknowledgment)**.

Contrariamente a quanto si immagina spesso, un ACK non significa:

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

Ciò significa:

> "Tutto ciò che precede il byte 1000 è arrivato correttamente."

Questo meccanismo permette di accusare ricevuta di più segmenti contemporaneamente (_cumulative acknowledgments_), riducendo così il numero di pacchetti di controllo.

### **Le ritrasmissioni**

Se un ACK non arriva mai, TCP presume che il segmento sia perso.

Lo ritrasmette automaticamente.

Il tempo di ritrasmissione (**Retransmission Timeout – RTO**) non è fisso.

TCP misura continuamente il tempo di andata e ritorno (**RTT**) grazie agli ACK ricevuti e calcola dinamicamente l'RTO per evitare ritrasmissioni inutili.

Le implementazioni moderne utilizzano anche meccanismi come **Fast Retransmit**: quando un mittente riceve più ACK duplicati (di solito tre), deduce che un segmento intermedio è stato perso e lo rinvia immediatamente, senza attendere la scadenza del timer.

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

TCP memorizza temporaneamente i segmenti ricevuti **fuori ordine** in un buffer (_reassembly buffer_), poi li riassembla prima di consegnarli all'applicazione.

Per l'applicazione, tutto sembra arrivare perfettamente in ordine.

### Controllo di flusso

Una connessione non dipende solo dalla rete.

Anche il ricevente possiede una capacità di memoria limitata.

Se riceve più velocemente di quanto possa elaborare i dati, i suoi buffer finiscono per saturarsi.

TCP risolve questo problema grazie a una **finestra scorrevole (Sliding Window)**.

Il ricevente indica in ogni ACK:

```
Window = 32768 byte
```

Ciò significa:

> "Puoi inviarmi fino a 32 KB aggiuntivi."

Se questa finestra scende a zero:

```
Window = 0
```

Il mittente sospende temporaneamente le trasmissioni finché il ricevente non annuncia una nuova finestra disponibile.

Questo meccanismo costituisce il **controllo di flusso (Flow Control)** e impedisce che un host veloce inondi un host più lento.

### Controllo della congestione

Anche se il ricevente è in grado di assorbire i dati, la rete stessa può diventare satura.

I router dispongono di code (_queues_) limitate.

Quando traboccano, i pacchetti vengono eliminati.

TCP interpreta le perdite come un segno di congestione e adatta automaticamente la sua velocità grazie a una **finestra di congestione (Congestion Window – cwnd)**.

Gli algoritmi moderni (come **Reno**, **CUBIC** o **BBR**, a seconda dei sistemi operativi) regolano questa finestra per trovare un equilibrio tra velocità massima e stabilità della rete.

Le prime versioni di TCP utilizzavano principalmente due meccanismi:

*   **Slow Start**: aumento esponenziale della velocità fino al rilevamento di una congestione.
    
*   **Congestion Avoidance**: crescita successivamente più prudente, generalmente lineare.
    

Questo adattamento permanente è una delle ragioni per cui TCP rimane performante nonostante le variazioni di qualità della rete.

### Chiusura della connessione

A differenza di UDP, una connessione TCP ha anche una chiusura pulita.

Ogni estremità chiude indipendentemente il proprio flusso grazie al flag **FIN**.

Una chiusura completa richiede generalmente quattro scambi:

```
FIN
ACK
FIN
ACK
```

Questa procedura garantisce che tutti i dati in transito siano stati correttamente consegnati prima della distruzione della connessione.

## UDP: la massima semplicità

UDP (User Datagram Protocol) adotta la filosofia opposta.

È **senza connessione (connectionless)**.

Non esiste:

*   alcun handshake;
    
*   alcun numero di sequenza;
    
*   alcun acknowledgement;
    
*   alcuna ritrasmissione;
    
*   alcun controllo di flusso;
    
*   alcun controllo della congestione.
    

Ogni messaggio è semplicemente incapsulato in un **datagramma** indipendente, trasmesso alla rete, e poi dimenticato dal mittente.

```
Applicazione → Datagramma UDP → IP → Internet
```

Il protocollo non mantiene alcuno stato tra due invii.

Ogni datagramma è totalmente indipendente dai precedenti.

### L'integrità dei dati

Sebbene UDP non garantisca né la consegna né l'ordine, protegge comunque l'integrità dei dati grazie a un **checksum**.

Alla ricezione, il checksum viene ricalcolato.

*   Se i valori corrispondono, il datagramma viene accettato.
    
*   Altrimenti, viene immediatamente respinto.
    

UDP rileva quindi i dati corrotti, ma non tenta mai di recuperarli.

### Perché UDP è così veloce?

L'intestazione UDP contiene solo **8 byte**, contro un minimo di **20 byte** per TCP (senza contare le opzioni come timestamp, SACK o Window Scaling).

Non essendo mantenuta alcuna connessione, il sistema operativo non deve tenere traccia dello stato di ogni scambio, riducendo così anche il consumo di memoria e il costo di elaborazione.

L'applicazione riceve i dati quasi immediatamente dopo il loro arrivo, senza attendere eventuali ritrasmissioni.

## Quando perdere un dato è preferibile

L'idea di fondo è semplice:

> Un'informazione vecchia può avere meno valore di un'informazione persa.

Prendiamo una conversazione VoIP.

Ogni pacchetto trasporta circa **20 ms** di voce.

Se un pacchetto viene perso, ritrasmetterlo richiederebbe spesso più tempo di questi 20 ms.

Quando finalmente arriverebbe, la conversazione sarebbe già avanzata.

La maggior parte delle applicazioni preferisce quindi mascherare la perdita (interpolazione, silenzio, correzione d'errore) piuttosto che attendere la ritrasmissione.

Lo stesso ragionamento si applica:

*   ai giochi multiplayer in tempo reale;
    
*   allo streaming video;
    
*   ai flussi di telemetria;
    
*   ai sensori IoT;
    
*   ai dati di posizione GPS.
    

Un valore recente è quasi sempre più utile di un valore vecchio perfettamente affidabile.

# Livello 2: la crittografia, TLS

TLS (Transport Layer Security, successore di SSL) non sostituisce TCP, si aggiunge sopra. Concretamente, TLS stabilisce una connessione TCP normale, poi negozia una sessione crittografata all'interno: scambio di certificati, accordo su un algoritmo di crittografia, derivazione delle chiavi di sessione. Tutto ciò che transita successivamente è crittografato e autenticato.

Tre garanzie distinte, spesso confuse:

*   **Riservatezza****: nessuno all'infuori delle due parti può leggere il contenuto.
    
*   **Integrità****: qualsiasi alterazione dei dati in transito viene rilevata.
    
*   **Autenticazione****: ma nella TLS classica, a senso unico: il client verifica che il server sia davvero chi dice di essere (tramite il suo certificato, firmato da un'autorità di fiducia), ma il server non verifica nulla sull'identità del client. Questo è esattamente il modello di HTTPS quando visitate un sito: il browser autentica il sito, il sito non autentica voi (l'autenticazione utente passa attraverso un meccanismo separato, cookie di sessione, token).
    

TLS 1.3 (la versione attuale raccomandata) ha ridotto l'handshake a un solo scambio di andata e ritorno nel caso comune, contro due per TLS 1.2, riducendo sensibilmente la latenza di connessione.

## Livello 2bis: mTLS — l'autenticazione diventa reciproca

mTLS (mutual TLS) è TLS con un vincolo aggiuntivo: il server richiede _anche_ un certificato del client, e lo verifica. Entrambe le parti provano la propria identità tramite un certificato firmato da un'autorità di fiducia comune.

È il meccanismo naturale per la comunicazione servizio-a-servizio in un'architettura distribuita: laddove HTTPS classico è sufficiente perché un browser parli con un server pubblico, mTLS risponde a una domanda diversa; _come fa un servizio interno a sapere di parlare davvero con un altro servizio interno autorizzato, e non con un attaccante che è finito sulla rete?_

```
Client                                          Server
  │──── ClientHello ─────────────────────────────▶│
  │◀─── ServerHello + certificato server ──────────│
  │──── verifica il certificato server ────────────│
  │──── invia il PROPRIO certificato client ──────▶│
  │◀─── verifica il certificato client ────────────│
  │──── chiavi di sessione derivate, canale crittografato ──▶│
```

Il contro di mTLS è operativo: serve un'autorità di certificazione (CA) interna, un meccanismo di distribuzione dei certificati a ogni servizio, e una strategia di rotazione/revoca. In un ambiente monomacchina con pochi servizi, a volte è più complessità che beneficio — mTLS diventa necessario dal momento in cui il traffico inter-servizi attraversa una rete che non si controlla interamente (più host, cloud multi-tenant), o appena si vuole una politica di tipo _zero trust_, dove nessun servizio è implicitamente affidabile solo perché è "all'interno" della rete.

# Livello 3: i protocolli applicativi sopra TCP+TLS

Una volta in atto il trasporto e la crittografia, resta da definire _come strutturare gli scambi_. Questo è il ruolo dei protocolli applicativi.

## HTTP / HTTPS

HTTP è un protocollo richiesta-risposta: il client apre una connessione (o ne riutilizza una, con il keep-alive), invia una richiesta, attende una risposta, la connessione può poi chiudersi o essere riutilizzata. HTTPS è semplicemente HTTP su TLS — la S non cambia nulla nella semantica del protocollo, solo nel fatto che il trasporto è crittografato.

Il modello richiesta-risposta ha un limite strutturale: il server non può mai parlare per primo. Può solo rispondere a ciò che il client chiede. Per polling frequente (verificare "c'è qualcosa di nuovo?" ogni secondo), funziona ma spreca risorse — ogni richiesta ricrea overhead protocollare per, la maggior parte del tempo, non avere nulla di nuovo da annunciare.

## WebSocket (WS / WSS)

WebSocket risponde esattamente a questo limite. La connessione inizia come una richiesta HTTP classica (con un header `Upgrade: websocket`), ma una volta accettata la stretta di mano, la connessione TCP sottostante non è più un canale richiesta-risposta HTTP — diventa un canale bidirezionale full-duplex dove client e server possono inviare messaggi in qualsiasi momento, senza dover riemettere un ciclo richiesta-risposta a ogni scambio.

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

WSS è semplicemente WebSocket su TLS, esattamente come HTTPS è HTTP su TLS. È il protocollo ideale per tutto ciò che richiede push server in tempo reale — chat, notifiche, flussi di trading, eventi di gioco — senza voler gestire da soli un protocollo binario sopra TCP nudo.

## gRPC

Meno conosciuto al di fuori del mondo microservizi ma centrale nella comunicazione servizio-a-servizio: gRPC si basa su HTTP/2 (quindi TCP + TLS opzionale), serializza i messaggi in Protocol Buffers (binario, tipizzato, compatto - a differenza del JSON testuale della maggior parte delle API REST), e permette nativamente lo streaming bidirezionale grazie al multiplexing di HTTP/2 (più flussi logici su una singola connessione TCP, senza il head-of-line blocking che avrebbero più richieste HTTP/1.1 sequenziali).

## QUIC / HTTP3

QUIC cambia le carte in tavola ripartendo da UDP invece che da TCP a livello di trasporto, reimplementando al contempo le garanzie di affidabilità che TCP offriva nativamente - ma flusso per flusso anziché globalmente, eliminando così l'head-of-line blocking a livello di trasporto (un pacchetto perso su un flusso non blocca più gli altri flussi della stessa connessione). TLS 1.3 è integrato direttamente in QUIC anziché aggiunto sopra, riducendo ulteriormente la latenza di handshake. HTTP/3 è HTTP su QUIC.

# Panoramica: dove si colloca ogni protocollo

Livello Protocolli Ruolo Trasporto TCP, UDP Far viaggiare byte, affidabile o meno Trasporto (nuova generazione) QUIC UDP + affidabilità per flusso + TLS integrato Sicurezza TLS, mTLS Crittografia, integrità, autenticazione (uni o reciproca) Applicazione HTTP/HTTPS, WS/WSS, gRPC Strutturare gli scambi (richiesta-risposta, bidirezionale, RPC tipizzato)

Un esempio concreto per fissare le idee: un'architettura microservizi con una dashboard web e servizi interni potrebbe ragionevolmente combinare HTTPS (dashboard ↔ API pubblica, autenticazione uni-direzionale sufficiente lato browser), mTLS (servizio ↔ servizio internamente, autenticazione reciproca necessaria), e WSS (notifiche in tempo reale spinte verso la dashboard) — tre protocolli applicativi diversi, tutti costruiti sulla stessa base TCP + TLS.

## Come scegliere, in pratica

Tre domande sono generalmente sufficienti per decidere:

1.  **Ho bisogno di affidabilità e ordine, o la freschezza del dato prevale sulla sua consegna garantita?** → TCP se sì, UDP se no (o QUIC per avere entrambi tramite un compromesso diverso).
    
2.  **Il server deve poter iniziare i messaggi, o il client fa sempre la prima richiesta?** → WebSocket/gRPC streaming se il server deve spingere, HTTP classico altrimenti.
    
3.  **Entrambe le parti devono provarsi reciprocamente l'identità, o solo una delle due ha bisogno di essere verificata?** → mTLS per servizio-a-servizio in ambiente zero-trust, TLS semplice per client pubblico classico.
    

La complessità operativa aumenta a ogni livello aggiunto: TCP nudo non ha alcuna infrastruttura da gestire, TLS richiede certificati, mTLS richiede una CA e una strategia di rotazione, gRPC richiede una definizione di schema Protobuf condivisa. Il buon riflesso è aumentare la complessità solo quando il livello sottostante mostra un limite concreto, non per anticipazione.
