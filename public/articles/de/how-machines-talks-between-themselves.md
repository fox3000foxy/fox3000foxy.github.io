---
title: "Wie Maschinen miteinander sprechen: ein Überblick von TCP bis mTLS"
description: "Warum TCP, UDP, TLS, mTLS, HTTP und WebSocket keine konkurrierenden Alternativen sind, sondern gestapelte Schichten; ein hierarchischer Überblick über die Maschine-zu-Maschine-Kommunikation, vom reinen Transport bis zur gegenseitigen Authentifizierung."
date: 2026-07-16
tags: ["tcp", "udp", "tls", "mtls", "websocket", "http", "grpc", "netzwerk", "verteilte-architektur", "protokolle"]
authors: ["docteur-turboss"]
lang: "de"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "LlGKzzY+W25yjWBA2DBt1bjzvrfi1zWAgcx0YhGYfg3zaJZ3NM91WNhjwzQuFfGsnUaKCrm6JdT2RW8hONvMVQ=="
---
# Das Problem: zu viele Akronyme, zu wenig Hierarchie

TCP, UDP, TLS, mTLS, WebSocket, HTTP, HTTPS, gRPC, QUIC; die meisten Ressourcen, die darüber sprechen, stellen sie als eine flache Liste austauschbarer Optionen dar, "je nach Anwendungsfall zu wählen". In Wirklichkeit sind sie nicht auf derselben Ebene: einige sind Transportprotokolle, andere sind Sicherheitsschichten, die sich um den Transport legen, wieder andere sind Anwendungsprotokolle, die auf den ersten beiden aufbauen. Die Hierarchie zu verstehen bedeutet zu verstehen, warum man nie "zwischen" TCP und TLS "wählt": man wählt TCP, _dann_ entscheidet man, ob man TLS darüber legt.

Dieser Artikel baut diese Hierarchie Schicht für Schicht auf, vom reinen Transport bis zur gegenseitigen Authentifizierung, mit für jede Ebene: was sie garantiert, was sie nicht garantiert, und wann sie ausreicht.

# Ebene 1: der Transport (TCP gegen UDP)

Alles beginnt hier. TCP und UDP sind die beiden wichtigsten Protokolle der **Transportschicht (Layer 4)** des OSI-Modells. Ihre Rolle ist identisch: einen Datenstrom zwischen zwei Anwendungen zu transportieren, die auf verschiedenen Maschinen ausgeführt werden. Dennoch unterscheidet sich ihre Herangehensweise grundlegend.

Es ist wichtig zu verstehen, dass IP (Internet Protocol), das sich auf der Vermittlungsschicht (Layer 3) befindet, nur Pakete von einem Host zu einem anderen weiterleitet. Es garantiert weder ihre Ankunft, noch ihre Reihenfolge, noch ihre Eindeutigkeit. Router treffen einfach unabhängige Routing-Entscheidungen für jedes Paket.

Genau diese fehlenden Garantien gleicht TCP aus, während UDP bewusst darauf verzichtet, etwas hinzuzufügen, um extrem leichtgewichtig zu bleiben.

## TCP: Zuverlässigkeit an erster Stelle

TCP (Transmission Control Protocol) ist ein **verbindungsorientiertes** Protokoll (_connection-oriented_). Bevor auch nur ein einziges Byte Daten ausgetauscht wird, müssen beide Maschinen eine logische Verbindung herstellen.

Diese Verbindung wird durch den berühmten **Three-Way Handshake** aufgebaut:

```

Client                           Server
SYN ---------------------------->
        <--------------------- SYN + ACK
ACK ---------------------------->
Verbindung hergestellt
```

Jeder Schritt hat ein bestimmtes Ziel:

*   SYN: Der Client kündigt an, dass er eine Verbindung öffnen möchte, und liefert eine erste Sequenznummer (Initial Sequence Number - ISN).

*   SYN-ACK: Der Server akzeptiert die Verbindung, bestätigt den Empfang des SYN und liefert seinerseits seine eigene Sequenznummer.

*   ACK: Der Client bestätigt den Empfang der Informationen des Servers.

Ab diesem Moment kennen beide Maschinen den Zustand der Verbindung und können mit dem Datenaustausch beginnen.

### **Die Sequenznummern**

TCP betrachtet Daten nicht als eine Folge von Paketen, sondern als einen **kontinuierlichen Bytestrom** (_byte stream_).

Jedes gesendete Byte hat eine Sequenznummer.

Beispiel:

```
Nachricht:

Hallo

H = Byte 0
a = Byte 1
l = Byte 2
...
```

Wenn ein Segment mit den Bytes 1000 bis 1499 während des Transports verloren geht, kann der Empfänger genau erkennen, was fehlt.

Der Sender überträgt nur diesen Teil erneut.

Diese Granularität ist einer der Gründe für die Robustheit von TCP.

### **Die Bestätigungen (ACK)**

Nach dem Empfang der Daten sendet der Empfänger eine **ACK (Acknowledgment)**.

Entgegen der häufigen Annahme bedeutet ein ACK nicht:

> "Ich habe dieses Paket empfangen"

Es bedeutet vielmehr:

> "Ich habe alle Bytes bis zur Nummer X empfangen."

Zum Beispiel:

```
Client sendet:

0 → 999

Server antwortet:

ACK = 1000
```

Das bedeutet:

> "Alles vor Byte 1000 ist gut angekommen."

Dieser Mechanismus ermöglicht die Bestätigung mehrerer Segmente auf einmal (_kumulative Bestätigungen_), wodurch die Anzahl der Kontrollpakete reduziert wird.

### **Die Neuübertragungen**

Wenn nie ein ACK ankommt, nimmt TCP an, dass das Segment verloren ist.

Es überträgt es automatisch erneut.

Die Neuübertragungszeit (**Retransmission Timeout – RTO**) ist nicht fest.

TCP misst kontinuierlich die Umlaufzeit (**RTT**) anhand der empfangenen ACKs und berechnet dynamisch den RTO, um unnötige Neuübertragungen zu vermeiden.

Moderne Implementierungen verwenden auch Mechanismen wie **Fast Retransmit**: wenn ein Sender mehrere doppelte ACKs (in der Regel drei) empfängt, schließt er daraus, dass ein dazwischenliegendes Segment verloren gegangen ist, und sendet es sofort erneut, ohne auf den Ablauf des Timers zu warten.

### **Neuordnung der Pakete**

Das Internet garantiert keineswegs, dass zwei Pakete denselben Weg nehmen.

Beispiel:

```
Paket 1
Paris
 ↓
London
 ↓
New York

Paket 2
Paris
 ↓
Frankfurt
 ↓
Chicago
 ↓
New York
```

Das zweite Paket kann vor dem ersten ankommen.

TCP speichert dann die **ungeordnet** empfangenen Segmente temporär in einem Puffer (_Reassembly Buffer_) und setzt sie wieder zusammen, bevor es sie an die Anwendung ausliefert.

Für die Anwendung scheint alles perfekt in der richtigen Reihenfolge anzukommen.

### Flusskontrolle

Eine Verbindung hängt nicht nur vom Netzwerk ab.

Der Empfänger hat ebenfalls eine begrenzte Speicherkapazität.

Wenn er schneller empfängt, als er die Daten verarbeiten kann, laufen seine Puffer irgendwann über.

TCP löst dieses Problem mit einem **Schiebefenster (Sliding Window)**.

Der Empfänger gibt in jedem ACK an:

```
Window = 32768 Bytes
```

Das bedeutet:

> "Du kannst mir bis zu 32 KB mehr schicken."

Wenn dieses Fenster auf Null fällt:

```
Window = 0
```

Der Sender setzt die Übertragungen vorübergehend aus, bis der Empfänger ein neues verfügbares Fenster ankündigt.

Dieser Mechanismus ist die **Flusskontrolle (Flow Control)** und verhindert, dass ein schneller Host einen langsameren Host überflutet.

### Überlastungskontrolle

Selbst wenn der Empfänger in der Lage ist, die Daten aufzunehmen, kann das Netzwerk selbst gesättigt sein.

Router verfügen über begrenzte Warteschlangen (_Queues_).

Wenn diese überlaufen, werden Pakete verworfen.

TCP interpretiert Verluste als Zeichen von Überlastung und passt seine Rate automatisch mithilfe eines **Überlastungsfensters (Congestion Window – cwnd)** an.

Moderne Algorithmen (wie **Reno**, **CUBIC** oder **BBR**, je nach Betriebssystem) passen dieses Fenster an, um ein Gleichgewicht zwischen maximalem Durchsatz und Netzwerkstabilität zu finden.

Die ersten Versionen von TCP verwendeten hauptsächlich zwei Mechanismen:

*   **Slow Start**: exponentielle Steigerung des Durchsatzes, bis eine Überlastung erkannt wird.

*   **Congestion Avoidance**: danach vorsichtigeres Wachstum, in der Regel linear.

Diese permanente Anpassung ist einer der Gründe, warum TCP trotz schwankender Netzwerkqualität leistungsfähig bleibt.

### Verbindungsabbau

Im Gegensatz zu UDP hat eine TCP-Verbindung auch einen ordnungsgemäßen Abbau.

Jedes Ende schließt seinen Datenstrom unabhängig mit dem **FIN**-Flag.

Ein vollständiger Verbindungsabbau erfordert in der Regel vier Austausche:

```
FIN
ACK
FIN
ACK
```

Diese Prozedur stellt sicher, dass alle in Transit befindlichen Daten erfolgreich zugestellt wurden, bevor die Verbindung abgebaut wird.

## UDP: maximale Einfachheit

UDP (User Datagram Protocol) verfolgt die umgekehrte Philosophie.

Es ist **verbindungslos (connectionless)**.

Es existiert:

*   kein Handshake;

*   keine Sequenznummer;

*   keine Bestätigung;

*   keine Neuübertragung;

*   keine Flusskontrolle;

*   keine Überlastungskontrolle.

Jede Nachricht wird einfach in ein unabhängiges **Datagramm** gekapselt, an das Netzwerk gesendet und dann vom Sender vergessen.

```
Anwendung → UDP-Datagramm → IP → Internet
```

Das Protokoll bewahrt keinen Zustand zwischen zwei Sendungen.

Jedes Datagramm ist völlig unabhängig von den vorherigen.

### Die Datenintegrität

Obwohl UDP weder die Zustellung noch die Reihenfolge garantiert, schützt es dennoch die Datenintegrität durch eine **Prüfsumme (Checksum)**.

Beim Empfang wird die Prüfsumme neu berechnet.

*   Wenn die Werte übereinstimmen, wird das Datagramm akzeptiert.

*   Andernfalls wird es sofort verworfen.

UDP erkennt also beschädigte Daten, versucht aber nie, sie wiederherzustellen.

### Warum ist UDP so schnell?

Der UDP-Header enthält nur **8 Bytes**, gegenüber mindestens **20 Bytes** bei TCP (ohne Optionen wie Timestamps, SACK oder Window Scaling).

Da keine Verbindung aufrechterhalten wird, muss das Betriebssystem den Status jedes Austauschs nicht verfolgen, was auch den Speicherverbrauch und die Verarbeitungskosten reduziert.

Die Anwendung erhält die Daten praktisch sofort nach ihrem Eintreffen, ohne auf eventuelle Neuübertragungen warten zu müssen.

## Wann ein Datenverlust besser ist

Der grundlegende Gedanke ist einfach:

> Eine alte Information kann weniger wert sein als eine verlorene Information.

Nehmen wir ein VoIP-Gespräch.

Jedes Paket transportiert etwa **20 ms** Sprache.

Wenn ein Paket verloren geht, würde die Neuübertragung oft länger dauern als diese 20 ms.

Wenn es endlich ankäme, wäre das Gespräch bereits fortgeschritten.

Die meisten Anwendungen ziehen es daher vor, den Verlust zu überdecken (Interpolation, Stille, Fehlerkorrektur), anstatt auf die Neuübertragung zu warten.

Die gleiche Überlegung gilt für:

*   Echtzeit-Mehrspieler-Spiele;

*   Videostreaming;

*   Telemetriedaten;

*   IoT-Sensoren;

*   GPS-Positionsdaten.

Ein aktueller Wert ist fast immer nützlicher als ein alter, perfekt zuverlässiger Wert.

# Ebene 2: die Verschlüsselung, TLS

TLS (Transport Layer Security, Nachfolger von SSL) ersetzt nicht TCP, sondern wird darüber gelegt. Konkret baut TLS eine normale TCP-Verbindung auf und handelt dann eine verschlüsselte Sitzung darin aus: Austausch von Zertifikaten, Einigung auf einen Verschlüsselungsalgorithmus, Ableitung von Sitzungsschlüsseln. Alles, was danach übertragen wird, ist verschlüsselt und authentifiziert.

Drei verschiedene Garantien, die oft verwechselt werden:

*   **Vertraulichkeit**: niemand außer den beiden Parteien kann den Inhalt lesen.

*   **Integrität**: jede Veränderung der Daten während des Transports wird erkannt.

*   **Authentifizierung**: aber beim klassischen TLS nur in eine Richtung: der Client überprüft, ob der Server wirklich der ist, der er vorgibt zu sein (über sein Zertifikat, signiert von einer vertrauenswürdigen Autorität), aber der Server überprüft nichts bezüglich der Identität des Clients. Das ist genau das Modell von HTTPS, wenn Sie eine Website besuchen: der Browser authentifiziert die Website, die Website authentifiziert Sie nicht (die Benutzerauthentifizierung erfolgt über einen separaten Mechanismus, Sitzungs-Cookie, Token).

TLS 1.3 (die aktuell empfohlene Version) hat den Handshake im Normalfall auf einen einzigen Hin- und Rückweg reduziert, gegenüber zwei bei TLS 1.2, was die Verbindungslatenz spürbar verringert.

## Ebene 2b: mTLS — die Authentifizierung wird gegenseitig

mTLS (mutual TLS) ist TLS mit einer zusätzlichen Anforderung: der Server verlangt _ebenfalls_ ein Zertifikat vom Client und überprüft es. Beide Parteien beweisen ihre Identität durch ein von einer gemeinsamen vertrauenswürdigen Autorität signiertes Zertifikat.

Dies ist der natürliche Mechanismus für die Service-zu-Service-Kommunikation in einer verteilten Architektur: während klassisches HTTPS ausreicht, damit ein Browser mit einem öffentlichen Server spricht, beantwortet mTLS eine andere Frage: _Woher weiß ein interner Dienst, dass er wirklich mit einem anderen autorisierten internen Dienst spricht und nicht mit einem Angreifer, der ins Netzwerk gelangt ist?_

```
Client                                          Server
  │──── ClientHello ─────────────────────────────▶│
  │◀─── ServerHello + Serverzertifikat ────────────│
  │──── überprüft das Serverzertifikat ────────────│
  │──── sendet SEIN EIGENES Clientzertifikat ─────▶│
  │◀─── überprüft das Clientzertifikat ────────────│
  │──── abgeleitete Sitzungsschlüssel, verschlüsselter Kanal ──▶│
```

Die Kehrseite von mTLS ist operativer Natur: man benötigt eine interne Zertifizierungsstelle (CA), einen Mechanismus zur Verteilung der Zertifikate an jeden Dienst und eine Rotations-/Widerrufsstrategie. In einer Ein-Maschinen-Umgebung mit wenigen Diensten ist dies manchmal mehr Komplexität als Nutzen — mTLS wird notwendig, sobald der Inter-Service-Verkehr ein Netzwerk durchquert, das man nicht vollständig kontrolliert (mehrere Hosts, Multi-Tenant-Cloud), oder sobald man eine _Zero-Trust_-Richtlinie möchte, bei der kein Dienst implizit vertrauenswürdig ist, nur weil er "innerhalb" des Netzwerks ist.

# Ebene 3: die Anwendungsprotokolle über TCP+TLS

Sobald Transport und Verschlüsselung vorhanden sind, bleibt zu definieren, _wie die Austausche strukturiert werden_. Das ist die Aufgabe der Anwendungsprotokolle.

## HTTP / HTTPS

HTTP ist ein Anfrage-Antwort-Protokoll: der Client öffnet eine Verbindung (oder verwendet eine bestehende mit Keep-Alive), sendet eine Anfrage, wartet auf eine Antwort, die Verbindung kann dann geschlossen oder wiederverwendet werden. HTTPS ist einfach HTTP über TLS — das S ändert nichts an der Semantik des Protokolls, nur an der Tatsache, dass der Transport verschlüsselt ist.

Das Anfrage-Antwort-Modell hat eine strukturelle Grenze: der Server kann niemals von sich aus sprechen. Er kann nur auf das antworten, was der Client anfragt. Für häufiges Polling ("gibt es etwas Neues?" jede Sekunde) funktioniert das, verschwendet aber Ressourcen — jede Anfrage erzeugt erneut protokollbedingten Overhead, meistens um nichts Neues mitzuteilen.

## WebSocket (WS / WSS)

WebSocket adressiert genau diese Grenze. Die Verbindung startet als normale HTTP-Anfrage (mit einem `Upgrade: websocket`-Header), aber sobald der Handshake akzeptiert ist, ist der darunterliegende TCP-Kanal kein HTTP-Anfrage-Antwort-Kanal mehr — er wird zu einem bidirektionalen Vollduplex-Kanal, über den Client und Server jederzeit Nachrichten senden können, ohne bei jedem Austausch einen neuen Anfrage-Antwort-Zyklus durchlaufen zu müssen.

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

WSS ist einfach WebSocket über TLS, genau wie HTTPS HTTP über TLS ist. Es ist das Protokoll der Wahl für alles, was Echtzeit-Push vom Server erfordert — Chat, Benachrichtigungen, Handelsströme, Spieleereignisse — ohne selbst ein binäres Protokoll über nacktem TCP verwalten zu müssen.

## gRPC

Weniger bekannt außerhalb der Microservices-Welt, aber zentral für die Service-zu-Service-Kommunikation: gRPC baut auf HTTP/2 auf (also TCP + optionales TLS), serialisiert Nachrichten in Protocol Buffers (binär, typisiert, kompakt — im Gegensatz zum textbasierten JSON der meisten REST-APIs) und ermöglicht nativ bidirektionales Streaming dank des Multiplexings von HTTP/2 (mehrere logische Ströme über eine einzige TCP-Verbindung, ohne das Head-of-Line-Blocking mehrerer sequentieller HTTP/1.1-Anfragen).

## QUIC / HTTP3

QUIC ändert die Spielregeln, indem es auf UDP statt auf TCP auf der Transportschicht aufsetzt, gleichzeitig aber die Zuverlässigkeitsgarantien von TCP darüber implementiert — jedoch Strom für Strom statt global, was das Head-of-Line-Blocking auf Transportebene beseitigt (ein verlorenes Paket in einem Strom blockiert nicht mehr die anderen Ströme derselben Verbindung). TLS 1.3 ist direkt in QUIC integriert, anstatt darüber gelegt zu werden, was die Handshake-Latenz weiter reduziert. HTTP/3 ist HTTP über QUIC.

# Gesamtüberblick: wo sich jedes Protokoll einordnet

Schicht Protokolle Rolle Transport TCP, UDP Beförderung von Bytes, zuverlässig oder nicht Transport (neue Generation) QUIC UDP + Zuverlässigkeit pro Strom + integriertes TLS Sicherheit TLS, mTLS Verschlüsselung, Integrität, Authentifizierung (einseitig oder gegenseitig) Anwendung HTTP/HTTPS, WS/WSS, gRPC Strukturierung des Austauschs (Anfrage-Antwort, bidirektional, typisierte RPCs)

Ein konkretes Beispiel zur Veranschaulichung: eine Microservice-Architektur mit einem Web-Dashboard und internen Diensten könnte sinnvoll HTTPS (Dashboard ↔ öffentliche API, einseitige Authentifizierung browser-seitig ausreichend), mTLS (Service ↔ Service intern, gegenseitige Authentifizierung erforderlich) und WSS (Echtzeit-Benachrichtigungen, die an das Dashboard gesendet werden) kombinieren — drei verschiedene Anwendungsprotokolle, alle auf derselben Basis TCP + TLS.

## Wie man in der Praxis wählt

Drei Fragen reichen in der Regel aus, um zu entscheiden:

1.  **Benötige ich Zuverlässigkeit und Reihenfolge, oder hat die Aktualität der Daten Vorrang vor ihrer garantierten Zustellung?** → TCP wenn ja, UDP wenn nein (oder QUIC, um beides durch einen anderen Kompromiss zu erhalten).

2.  **Muss der Server Nachrichten initiieren können, oder stellt der Client immer die erste Anfrage?** → WebSocket/gRPC-Streaming, wenn der Server pushen muss, andernfalls klassisches HTTP.

3.  **Müssen beide Parteien sich gegenseitig ihre Identität beweisen, oder muss nur eine der beiden überprüft werden?** → mTLS für Service-zu-Service in einer Zero-Trust-Umgebung, einfaches TLS für klassische öffentliche Clients.

Die operationelle Komplexität nimmt mit jeder hinzugefügten Schicht zu: nacktes TCP erfordert keine Infrastrukturverwaltung, TLS erfordert Zertifikate, mTLS erfordert eine CA und eine Rotationsstrategie, gRPC erfordert eine gemeinsam genutzte Protobuf-Schemadefinition. Die richtige Herangehensweise ist, die Komplexität nur dann zu erhöhen, wenn die darunterliegende Schicht eine konkrete Grenze aufzeigt, nicht aus Voraussicht.
