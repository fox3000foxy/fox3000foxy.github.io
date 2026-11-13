---
title: "Wie Maschinen miteinander reden: von TCP bis mTLS im Überblick"
description: "Warum TCP, UDP, TLS, mTLS, HTTP und WebSocket keine konkurrierenden Alternativen sind, sondern gestapelte Schichten; ein hierarchischer Überblick über Maschine-zu-Maschine-Kommunikation, vom rohen Transport bis zur gegenseitigen Authentifizierung."
date: 2026-07-16
tags: ["tcp", "udp", "tls", "mtls", "websocket", "http", "grpc", "netzwerk", "verteilte-architektur", "protokolle"]
authors: ["docteur-turboss"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "KFVbk98fe9QvxvujiHFEUVH4TAekdPNjqzxkeDW0Hp27WCSy3GlBkrKcVwNdnZRp1g8KoxggcYxfMzuNiFQVAg=="
---

# Das Problem: zu viele Siglen, zu wenig Hierarchie

TCP, UDP, TLS, mTLS, WebSocket, HTTP, HTTPS, gRPC, QUIC; die meisten Ressourcen, die darüber reden, präsentieren sie als flache Liste austauschbarer Optionen, "je nach Use Case zu wählen". In Wirklichkeit liegen sie nicht auf derselben Ebene: Manche sind Transportprotokolle, andere Sicherheitsschichten, die sich um den Transport wickeln, wieder andere Anwendungsprotokolle, die auf den ersten beiden aufbauen. Die Hierarchie zu verstehen heißt zu verstehen, warum man nie zwischen TCP und TLS "wählt": Man wählt TCP, _dann_ entscheidet man, ob man TLS darüberlegt.

Dieser Artikel baut diese Hierarchie Schicht für Schicht wieder auf, vom rohen Transport bis zur gegenseitigen Authentifizierung, mit für jede Ebene: was sie garantiert, was sie nicht garantiert und wann man sich damit begnügen kann.

# Ebene 1: der Transport (TCP gegen UDP)

Alles beginnt hier. TCP und UDP sind die zwei Hauptprotokolle der **Transport**-Schicht (Layer 4) des OSI-Modells. Ihre Rolle ist identisch: Einen Datenstrom zwischen zwei Anwendungen transportieren, die auf verschiedenen Maschinen laufen. Doch ihre Art, das zu erreichen, ist radikal unterschiedlich.

Wichtig zu verstehen ist, dass IP (Internet Protocol), auf der Netzwerkschicht (Layer 3) angesiedelt, nur Pakete von einem Host zum anderen routet. Es garantiert weder ihre Ankunft noch ihre Reihenfolge, noch nicht einmal ihre Eindeutigkeit. Router treffen einfach unabhängige Routingentscheidungen für jedes Paket.

Genau dieses Fehlen von Garantien kompensiert TCP, während UDP bewusst beschließt, nichts hinzuzufügen, um extrem leicht zu bleiben.

## TCP: Zuverlässigkeit zuerst

TCP (Transmission Control Protocol) ist ein **verbindungsorientiertes** (_connection-oriented_) Protokoll. Bevor auch nur ein Byte Daten ausgetauscht wird, müssen die zwei Maschinen eine logische Verbindung aufbauen.

Diese Verbindung wird dank des berühmten **Three-Way Handshake** erstellt:

```

Client                           Serveur
SYN ---------------------------->
        <--------------------- SYN + ACK
ACK ---------------------------->
Connexion établie
```

Jeder Schritt hat ein präzises Ziel:

*   SYN: Der Client kündigt an, dass er eine Verbindung öffnen will, und liefert eine erste Sequenznummer (Initial Sequence Number - ISN).

*   SYN-ACK: Der Server akzeptiert die Verbindung, bestätigt den Empfang des SYN und liefert seinerseits seine eigene Sequenznummer.

*   ACK: Der Client bestätigt den Empfang der Serverinformationen.


Ab diesem Moment kennen beide Maschinen den Verbindungszustand und können anfangen, Daten auszutauschen.

### **Die Sequenznummern**

TCP sieht die Daten nicht als Abfolge von Paketen, sondern als **kontinuierlichen Bytestrom** (_byte stream_).

Jedes gesendete Byte besitzt eine Sequenznummer.

Beispiel:

```
Message :

Bonjour

B = octet 0
o = octet 1
n = octet 2
...
```

Wenn ein Segment mit den Bytes 1000 bis 1499 während des Transports verloren geht, kann der Empfänger exakt erkennen, was fehlt.

Der Sender überträgt nur diesen Teil erneut.

Diese Granularität ist einer der Gründe für TCPs Robustheit.

### **Die Empfangsbestätigungen (ACK)**

Nach Datenempfang schickt der Empfänger ein **ACK (Acknowledgment)**.

Entgegen dem, was man sich oft vorstellt, bedeutet ein ACK nicht:

> "Ich habe dieses Paket empfangen"

Es bedeutet eher:

> "Ich habe alle Bytes bis zur Nummer X empfangen."

Zum Beispiel:

```
Client envoie :

0 → 999

Serveur répond :

ACK = 1000
```

Das bedeutet:

> "Alles vor Byte 1000 ist gut angekommen."

Dieser Mechanismus erlaubt es, mehrere Segmente auf einmal zu bestätigen (_cumulative acknowledgments_) und so die Zahl der Kontrollpakete zu reduzieren.

### **Die Retransmissionen**

Wenn ein ACK nie ankommt, nimmt TCP an, dass das Segment verloren ist.

Es überträgt es automatisch erneut.

Die Retransmissionsverzögerung (**Retransmission Timeout, RTO**) ist nicht fest.

TCP misst permanent die Round-Trip-Zeit (**RTT**) dank der empfangenen ACKs und berechnet den RTO dynamisch, um unnötige Retransmissionen zu vermeiden.

Moderne Implementierungen nutzen auch Mechanismen wie **Fast Retransmit**: Wenn ein Sender mehrere duplizierte ACKs empfängt (generell drei), folgert er, dass ein Zwischensegment verloren ging, und schickt es sofort erneut, ohne auf den Ablauf des Timers zu warten.

### **Reorganisation der Pakete**

Das Internet garantiert absolut nicht, dass zwei Pakete demselben Pfad folgen.

Beispiel:

```
Paquet 1
Paris
  ↓
Londres
  ↓
New York

Paquet 2
Paris
  ↓
Francfort
  ↓
Chicago
  ↓
New York
```

Das zweite Paket kann vor dem ersten ankommen.

TCP speichert dann temporär die **außer der Reihe** empfangenen Segmente in einem Puffer (_reassembly buffer_) und baut sie wieder zusammen, bevor es sie an die Anwendung liefert.

Für die Anwendung scheint alles perfekt der Reihe nach anzukommen.

### Flusskontrolle

Eine Verbindung hängt nicht nur vom Netz ab.

Der Empfänger besitzt ebenfalls begrenzte Speicherkapazität.

Wenn er schneller empfängt, als er die Daten verarbeiten kann, sättigen sich seine Buffer irgendwann.

TCP löst dieses Problem dank eines **gleitenden Fensters (Sliding Window)**.

Der Empfänger gibt in jedem ACK an:

```
Window = 32768 octets
```

Das bedeutet:

> "Du kannst mir bis zu 32 Ko zusätzlich schicken."

Wenn dieses Fenster auf null fällt:

```
Window = 0
```

setzt der Sender die Übertragungen temporär aus, bis der Empfänger ein neues verfügbares Fenster ankündigt.

Dieser Mechanismus bildet die **Flusskontrolle (Flow Control)** und verhindert, dass ein schneller Host einen langsameren Host flutet.

### Überlastungskontrolle

Selbst wenn der Empfänger die Daten absorbieren kann, kann das Netz selbst gesättigt werden.

Router verfügen über begrenzte Warteschlangen (_queues_).

Wenn sie überlaufen, werden die Pakete verworfen.

TCP interpretiert Verluste als Überlastungszeichen und passt seinen Durchsatz automatisch dank eines **Überlastungsfensters (Congestion Window, cwnd)** an.

Moderne Algorithmen (wie **Reno**, **CUBIC** oder **BBR**, je nach Betriebssystem) justieren dieses Fenster, um ein Gleichgewicht zwischen maximalem Durchsatz und Netzstabilität zu finden.

Die ersten TCP-Versionen nutzten hauptsächlich zwei Mechanismen:

*   **Slow Start**: Exponentielle Durchsatzsteigerung bis zur Erkennung einer Überlastung.

*   **Congestion Avoidance**: Danach vorsichtigere, generell lineare Steigerung.


Diese permanente Anpassung ist einer der Gründe, warum TCP trotz schwankender Netzqualität leistungsfähig bleibt.

### Verbindungsabbau

Im Gegensatz zu UDP besitzt eine TCP-Verbindung auch einen sauberen Abbau.

Jedes Ende schließt unabhängig seinen Strom dank des **FIN**-Flags.

Ein kompletter Abbau erfordert generell vier Austausche:

```
FIN
ACK
FIN
ACK
```

Diese Prozedur garantiert, dass alle transitierenden Daten gut geliefert wurden, bevor die Verbindung zerstört wird.

## UDP: maximale Einfachheit

UDP (User Datagram Protocol) verfolgt die inverse Philosophie.

Es ist **verbindungslos (connectionless)**.

Es gibt:

*   keinen Handshake;

*   keine Sequenznummer;

*   keine Empfangsbestätigung;

*   keine Retransmission;

*   keine Flusskontrolle;

*   keine Überlastungskontrolle.


Jede Nachricht wird einfach in ein unabhängiges **Datagramm** verpackt, ans Netz übergeben und dann vom Sender vergessen.

```
Application → Datagramme UDP → IP → Internet
```

Das Protokoll bewahrt keinen Zustand zwischen zwei Sendungen.

Jedes Datagramm ist völlig unabhängig von den vorherigen.

### Die Datenintegrität

Obwohl UDP weder Lieferung noch Reihenfolge garantiert, schützt es trotzdem die Datenintegrität dank einer **Checksumme**.

Beim Empfang wird die Checksumme neu berechnet.

*   Wenn die Werte übereinstimmen, wird das Datagramm akzeptiert.

*   Sonst wird es sofort verworfen.


UDP erkennt also korrupte Daten, versucht aber nie, sie wiederherzustellen.

### Warum ist UDP so schnell?

Der UDP-Header enthält nur **8 Bytes**, gegen mindestens **20 Bytes** für TCP (ohne Optionen wie Timestamps, SACK oder Window Scaling zu zählen).

Da keine Verbindung gehalten wird, muss das Betriebssystem den Zustand jedes Austauschs nicht verfolgen, was auch Speicherverbrauch und Verarbeitungskosten reduziert.

Die Anwendung empfängt die Daten quasi sobald sie ankommen, ohne auf eventuelle Retransmissionen zu warten.

## Wenn Datenverlust vorzuziehen ist

Die Grundidee ist simpel:

> Eine alte Information kann weniger Wert haben als eine verlorene Information.

Nehmen wir ein VoIP-Gespräch.

Jedes Paket transportiert etwa **20 ms** Stimme.

Wenn ein Paket verloren geht, würde seine Retransmission oft länger dauern als diese 20 ms.

Wenn es endlich ankäme, wäre das Gespräch schon weiter.

Die meisten Anwendungen ziehen dann vor, den Verlust zu maskieren (Interpolation, Stille, Fehlerkorrektur), statt auf die Retransmission zu warten.

Dieselbe Überlegung gilt für:

*   Echtzeit-Multiplayerspiele;

*   Videostreaming;

*   Telemetrieströme;

*   IoT-Sensoren;

*   GPS-Positionsdaten.


Ein aktueller Wert ist fast immer nützlicher als ein alter perfekt zuverlässiger Wert.

# Ebene 2: die Verschlüsselung, TLS

TLS (Transport Layer Security, Nachfolger von SSL) ersetzt TCP nicht, es kommt obendrauf. Konkret baut TLS eine normale TCP-Verbindung auf und verhandelt dann darin eine verschlüsselte Session: Zertifikatsaustausch, Einigung auf einen Verschlüsselungsalgorithmus, Ableitung von Session-Schlüsseln. Alles, was danach transitiert, ist verschlüsselt und authentifiziert.

Drei unterschiedliche, oft verwechselte Garantien:

*   **Vertraulichkeit**: Niemand außer den zwei Parteien kann den Inhalt lesen.

*   **Integrität**: Jede Veränderung der Daten im Transit wird erkannt.

*   **Authentifizierung**: Aber im klassischen TLS einseitig: Der Client prüft, dass der Server wirklich der ist, für den er sich ausgibt (via sein Zertifikat, signiert von einer vertrauenswürdigen Autorität), aber der Server prüft nichts über die Clientidentität. Das ist exakt das HTTPS-Modell, wenn du eine Seite besuchst: Der Browser authentifiziert die Seite, die Seite authentifiziert dich nicht (die Nutzerauthentifizierung läuft über einen separaten Mechanismus, Session-Cookie, Token).


TLS 1.3 (die aktuell empfohlene Version) hat den Handshake im Normalfall auf einen einzigen Round-Trip reduziert, gegen zwei bei TLS 1.2, was die Verbindungslatenz spürbar senkt.

## Ebene 2bis: mTLS, die Authentifizierung wird gegenseitig

mTLS (mutual TLS) ist TLS mit einer zusätzlichen Bedingung: Der Server verlangt _auch_ ein Zertifikat vom Client und prüft es. Beide Parteien beweisen ihre Identität via ein von einer gemeinsamen vertrauenswürdigen Autorität signiertes Zertifikat.

Das ist der natürliche Mechanismus für Service-zu-Service-Kommunikation in einer verteilten Architektur: Wo klassisches HTTPS reicht, damit ein Browser mit einem öffentlichen Server redet, beantwortet mTLS eine andere Frage; _woher weiß ein interner Service, dass er wirklich mit einem anderen autorisierten internen Service redet und nicht mit einem Angreifer, der im Netz gelandet wäre ?_

```
Client                                          Serveur
  │──── ClientHello ─────────────────────────────▶│
  │◀─── ServerHello + certificat serveur ──────────│
  │──── vérifie le certificat serveur ─────────────│
  │──── envoie SON PROPRE certificat client ──────▶│
  │◀─── vérifie le certificat client ───────────────│
  │──── clés de session dérivées, canal chiffré ──▶│
```

Die Kehrseite von mTLS ist operativ: Man braucht eine interne Zertifizierungsautorität (CA), einen Verteilmechanismus der Zertifikate an jeden Service und eine Rotations-/Revokationsstrategie. In einer Single-Machine-Umgebung mit wenigen Services ist das manchmal mehr Komplexität als Nutzen, mTLS wird notwendig ab dem Moment, wo der Inter-Service-Traffic ein Netz durchquert, das man nicht vollständig kontrolliert (mehrere Hosts, Multi-Tenant-Cloud), oder sobald man eine Policy vom Typ _Zero Trust_ will, wo kein Service implizit vertrauenswürdig ist, bloß weil er "drinnen" im Netz ist.

# Ebene 3: die Anwendungsprotokolle über TCP+TLS

Sobald Transport und Verschlüsselung stehen, bleibt zu definieren, _wie man die Austausche strukturiert_. Das ist die Rolle der Anwendungsprotokolle.

## HTTP / HTTPS

HTTP ist ein Request-Response-Protokoll: Der Client öffnet eine Verbindung (oder nutzt eine wieder, mit Keep-Alive), schickt eine Anfrage, wartet auf eine Antwort, die Verbindung kann sich danach schließen oder wiederverwendet werden. HTTPS ist schlicht HTTP über TLS, das S ändert nichts an der Protokollsemantik, nur daran, dass der Transport verschlüsselt ist.

Das Request-Response-Modell hat eine strukturelle Grenze: Der Server kann nie zuerst reden. Er kann nur auf das antworten, was der Client fragt. Für häufiges Polling ("gibt es was Neues ?" jede Sekunde) geht das, verschwendet aber Ressourcen, jede Anfrage erzeugt Protokolloverhead, um meistens nichts Neues anzukündigen.

## WebSocket (WS / WSS)

WebSocket beantwortet genau diese Grenze. Die Verbindung startet wie eine klassische HTTP-Anfrage (mit einem `Upgrade: websocket`-Header), aber sobald der Handshake akzeptiert ist, ist die darunterliegende TCP-Verbindung kein HTTP-Request-Response-Kanal mehr, sie wird ein bidirektionaler Full-Duplex-Kanal, wo Client und Server jederzeit Nachrichten schicken können, ohne bei jedem Austausch einen Request-Response-Zyklus neu ausstoßen zu müssen.

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

WSS ist schlicht WebSocket über TLS, exakt wie HTTPS HTTP über TLS ist. Es ist das Protokoll der Wahl für alles, was Server-Push in Echtzeit braucht, Chat, Notifications, Trading-Ströme, Spiel-Events, ohne selbst ein Binärprotokoll über nacktem TCP verwalten zu wollen.

## gRPC

Weniger bekannt außerhalb der Microservices-Welt, aber zentral in Service-zu-Service-Kommunikation: gRPC baut auf HTTP/2 (also TCP + optionales TLS), serialisiert Nachrichten in Protocol Buffers (binär, typisiert, kompakt, im Gegensatz zum Text-JSON der meisten REST-APIs) und erlaubt nativ bidirektionales Streaming dank HTTP/2-Multiplexing (mehrere logische Ströme auf einer einzigen TCP-Verbindung, ohne das Head-of-Line-Blocking, das mehrere sequenzielle HTTP/1.1-Anfragen hätten).

## QUIC / HTTP3

QUIC ändert die Spielregeln, indem es von UDP statt TCP auf Transportebene neu startet und darüber die Zuverlässigkeitsgarantien reimplementiert, die TCP nativ bot, aber Strom für Strom statt global, was das Head-of-Line-Blocking auf Transportebene eliminiert (ein verlorenes Paket auf einem Strom blockiert nicht mehr die anderen Ströme derselben Verbindung). TLS 1.3 ist direkt in QUIC integriert statt obendrauf gelegt, was die Handshakelatenz weiter senkt. HTTP/3 ist HTTP über QUIC.

# Überblick: wo jedes Protokoll liegt

Schicht Protokolle Rolle Transport TCP, UDP Bytes reisen lassen, zuverlässig oder nicht Transport (neue Generation) QUIC UDP + Zuverlässigkeit pro Strom + integriertes TLS Sicherheit TLS, mTLS Verschlüsselung, Integrität, Authentifizierung (uni oder gegenseitig) Anwendung HTTP/HTTPS, WS/WSS, gRPC Austausche strukturieren (Request-Response, bidirektional, typisiertes RPC)

Ein konkretes Beispiel, um die Ideen zu fixieren: Eine Microservices-Architektur mit Webdashboard und internen Services könnte vernünftigerweise HTTPS (Dashboard ↔ öffentliche API, einseitige Authentifizierung browser-seitig ausreichend), mTLS (Service ↔ Service intern, gegenseitige Authentifizierung nötig) und WSS (Echtzeit-Notifications ans Dashboard gepusht) kombinieren, drei unterschiedliche Anwendungsprotokolle, alle auf demselben TCP + TLS-Sockel gebaut.

## Wie man in der Praxis wählt

Drei Fragen reichen generell, um zu entscheiden:

1.  **Brauche ich Zuverlässigkeit und Reihenfolge, oder geht Datenfrische vor garantierter Lieferung ?** → TCP wenn ja, UDP wenn nein (oder QUIC, um beides zugleich über einen anderen Kompromiss zu haben).

2.  **Muss der Server Nachrichten initiieren können, oder stellt der Client immer die erste Anfrage ?** → WebSocket/gRPC-Streaming, wenn der Server pushen muss, sonst klassisches HTTP.

3.  **Müssen beide Parteien gegenseitig ihre Identität beweisen, oder muss nur eine der beiden verifiziert werden ?** → mTLS für Service-zu-Service in Zero-Trust-Umgebung, simples TLS für klassischen öffentlichen Client.


Die operative Komplexität steigt mit jeder hinzugefügten Schicht, nacktes TCP hat keine zu verwaltende Infrastruktur, TLS verlangt Zertifikate, mTLS verlangt eine CA und eine Rotationsstrategie, gRPC verlangt eine geteilte Protobuf-Schemadefinition. Der gute Reflex ist, nur in Komplexität aufzusteigen, wenn die darunterliegende Schicht eine konkrete Grenze zeigt, nicht in Antizipation.
