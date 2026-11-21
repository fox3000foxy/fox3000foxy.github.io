---
title: "Wie Maschinen sprechen: Eine Rundreise von TCP bis mTLS"
description: "Warum TCP, UDP, TLS, mTLS und HTTP und WebSocket keine konkurrierenden Alternativen sind, sondern gestapelte Schichten; ein hierarchischer Rundgang der Maschinenkommunikation, vom Bruttotransport bis zur gegenseitigen Authentifizierung."
date: 2026-07-16
tags: ["tcp", "udp", "tls", "mtls", "websocket", "http", "grpc", "réseau", "architecture-distribuée", "protocoles"]
authors: ["docteur-turboss"]
lang: "de"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "hweb+FT5OzVqD9nbvJi1d7N8re8JLSaWOnCoypGODxpYXquvr79loGDVH2H9peb4uhyVgQKJKI+vHxYTLrcq5g=="
---
# 

TCP, UDP, TLS, mTLS und WebSocket, HTTP, HTTPS, g RPC, QUIC; die meisten der Ressourcen, die darüber sprechen, stellen sie als eine flache Liste austauschbarer Optionen dar, "die je nach Anwendungsfall ausgewählt werden müssen." In Wirklichkeit sind sie nicht auf der gleichen Ebene: Einige sind Transportprotokolle, andere sind Sicherheitsschichten, die sich um den Transport drehen, andere wiederum Anwendungsprotokolle, die auf den ersten beiden basieren.

Dieser Artikel baut diese Schichthierarchie von der Bruttotransport bis zur gegenseitigen Authentifizierung auf, mit dem, was er garantiert, was nicht garantiert, und wann er damit zufrieden ist.

# Ebene 1: Verkehr (TCP gegen UDP)

Alles beginnt hier. TCP und UDP sind die beiden wichtigsten Protokolle der **Transport (Layer 4)** des OSI-Modells. deine Rolle ist identisch: einen Datenfluss zwischen zwei Anwendungen auf verschiedenen Maschinen zu transportieren. Dennoch ist ihre Art, dies zu erreichen, völlig anders.

Es ist wichtig zu verstehen, dass IP (Internet Protocol) an der Netzschicht (Layer 3) nur Pakete von einem Host zum anderen befördert. Es garantiert weder ihre Ankunft noch ihre Bestellung noch ihre Einzigartigkeit. Router treffen einfach unabhängige Routing-Entscheidungen für jedes Paket.

Genau diese fehlenden Garantien werden von TCP ausgeglichen, während UDP bewusst beschließt, nichts hinzuzufügen, um extrem gering zu bleiben.

## TCP: Zuverlässigkeit vor allem

TCP (Transmission Control Protocol) ist ein Protokoll **Login** (_connection-oriented_). Bevor du ein Datenbyte austauschen, müssen beide Maschinen eine logische Verbindung herstellen.

Diese Verbindung wird durch den berühmten **Three-Way Handshake** erstellt:
```

Client                           Serveur
SYN ---------------------------->
        <--------------------- SYN + ACK
ACK ----------------------------> 
Connexion établie
```
Jeder Schritt hat ein bestimmtes Ziel:

*   SYN: Der Kunde gibt bekannt, dass er eine Verbindung öffnen möchte und eine erste Sequenznummer (ISN) zur Verfügung stellt.
*   SYN-ACK: Der Server akzeptiert die Verbindung, bestätigt den Empfang des SYN und gibt seinerseits seine eigene Sequenznummer an.
*   ACK: Der Client bestätigt den Empfang der Serverinformationen.

Von diesem Zeitpunkt an kennen beide Maschinen den Status der Verbindung und können mit dem Datenaustausch beginnen.

### **Sequenznummern**

TCP sieht die Daten nicht als Paketfolge, sondern als **Byte-Kontinuum** (_byte stream_).

Jedes gesendete Byte hat eine Sequenznummer.

Beispiel:
```
Message :

Bonjour

B = octet 0
o = octet 1
n = octet 2
...
```
Wenn ein Segment mit 1000-1499 Bytes während des Transports verloren geht, kann der Empfänger genau erkennen, was fehlt.

Der Sender überträgt nur diesen Teil weiter.

Diese Granarität ist einer der Gründe für die Robustheit von TCP.

### **Empfangsbestätigungen (ACK)**

Nach Erhalt der Daten sendet der Empfänger ein **ACK (Acknowledgement)**.

Im Gegensatz zu dem, was man sich oft vorstellen kann, bedeutet ein ACK nicht:

> "Ich habe dieses Paket bekommen."

Es bedeutet eher:

> "Ich habe alle Bytes bis zur X-Nummer bekommen."

Zum Beispiel:
```
Client envoie :

0 → 999

Serveur répond :

ACK = 1000
```
Das bedeutet:

> "Alles, was vor 1000 Byte ist, ist gut passiert."

Mit diesem Mechanismus können mehrere Segmente gleichzeitig (_akkumulierte acknowledges_) empfangen werden, wodurch die Anzahl der Kontrollpakete verringert wird.

### **Übertragungen**

Wenn ein ACK nie kommt, nimmt TCP an, dass das Segment verloren ist.

Er sendet es automatisch weiter.

Die Übertragungsfrist (**Remission Timeout ✓ RTO**) ist nicht festgelegt.

TCP misst die Hin- und Rückfahrtszeit (**RTT**) mit den empfangenen ACK und berechnet dynamisch das RTO, um unnötige Weiterverbreitungen zu vermeiden.

Moderne Implementierungen verwenden auch Mechanismen wie **Fast Retransmit**: Wenn ein Sender mehrere duplizierte ACKs (in der Regel drei) erhält, zieht er den Schluss, dass ein Zwischensegment verloren gegangen ist und sofort zurücksendet, ohne auf das Auslaufen des Timers zu warten.

### **Pakete neu organisieren**

Das Internet garantiert nicht, dass zwei Pakete auf dem gleichen Weg sind.

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

TCP speichert dann vorübergehend die aufgenommenen **Ordner** Segmente in einem Puffer (_reassembuffer_) und speicherte sie dann, bevor sie an die Anwendung geliefert werden.

Für die Anwendung scheint alles perfekt in Ordnung zu kommen.

### Flusssteuerung

Eine Verbindung hängt nicht nur vom Netzwerk ab.

Der Empfänger hat auch eine begrenzte Speicherkapazität.

Wenn er schneller empfängt als er die Daten verarbeiten kann, werden seine Buffer am Ende gesättigt.

TCP löst dieses Problem mit einem **Rutschfenster (Sliding Window)**.

Der Empfänger gibt in jedem ACK an:
```
Window = 32768 octets
```
Das bedeutet:

> "Du kannst mir bis zu 32 KB extra schicken."

Wenn das Fenster auf Null fällt:
```
Window = 0
```
Der Sender setzt die Übertragung vorübergehend aus, bis der Empfänger ein neues Fenster ankündigt.

Dieser Mechanismus ist die **Flow Control** und verhindert, dass ein schneller Host einen langsameren Host überflutet.

### Stauüberwachung

Auch wenn der Empfänger in der Lage ist, die Daten zu absorbieren, kann das Netzwerk selbst gesättigt werden.

Router haben begrenzte Warteschlangen (_Ques_).

Wenn sie überlaufen, werden die Pakete gelöscht.

TCP interpretiert Verluste als Stauzeichen und passt ihre Durchflussrate automatisch mit einem **Fenster für Staus (Window ✓ cwnd)** an.

Moderne Algorithmen (wie **Reno**, **CUBIC** oder **BBR**, je nach Betriebssystem) passen dieses Fenster an, um ein Gleichgewicht zwischen maximalem Durchfluss und Netzstabilität zu finden.

Die ersten Versionen von TCP verwendeten hauptsächlich zwei Mechanismen:

*   **Slow Start**: Exponentieller Durchflussanstieg bis zum Nachweis einer Überlastung.
*   **Kongegation "Voyance **": dann vorsichtigeres Wachstum, im Allgemeinen linear.

Diese ständige Anpassung ist einer der Gründe, warum TCP trotz der Qualitätsunterschiede im Netz weiterhin leistungsfähig ist.

### Verbindung schließen

Im Gegensatz zu UDP hat eine TCP-Verbindung auch einen sauberen Schließvorgang.

Jedes Ende schließt seinen Fluss unabhängig mit der Flagge **FIN**.

Eine vollständige Schließung erfordert in der Regel vier Austausche:
```
FIN
ACK
FIN
ACK
```
Dieses Verfahren gewährleistet, dass alle Daten im Transit vor der Zerstörung der Verbindung geliefert wurden.

## UDP: Maximale Einfachheit

UDP (User Datagram Protocol) nimmt die umgekehrte Philosophie an.

Es ist ** ohne Verbindung (connectionless)**.

Es gibt keine:

*   keine Handshake;
*   keine Sequenznummer ,
*   keine Empfangsbestätigung;
*   keine Weiterverbreitung;
*   keine Stromkontrolle;
*   keine Staukontrolle.

Jede Nachricht wird einfach in einem unabhängigen **datagramm** eingekapselt, an das Netzwerk weitergeleitet und dann vom Sender vergessen.
```
Application → Datagramme UDP → IP → Internet
```
Das Protokoll behält keinen Zustand zwischen zwei Sendungen.

Jedes Datenblatt ist völlig unabhängig von den vorherigen Daten.

### Integrität der Daten

Obwohl UDP weder die Lieferung noch die Bestellung garantiert, schützt es dennoch die Integrität der Daten durch ein **checksum**.

Am Empfang wird das Checksum neu berechnet.

*   Wenn die Werte übereinstimmen, wird das Datagramm akzeptiert.
*   Andernfalls wird er sofort abgelehnt.

UDP erkennt also beschädigte Daten, versucht sie aber nie wieder zu holen.

### Warum ist UDP so schnell?

Der UDP-Header enthält nur **8 Bytes**, gegenüber einem Minimum von **20 Byte** für TCP (ohne Optionen wie Timestamps, SACK oder Window Scaling).

Da keine Verbindung aufrechterhalten wird, muss das Betriebssystem nicht den Status jedes Austauschs verfolgen, was auch den Speicherverbrauch und die Verarbeitungskosten senkt.

Die Anwendung erhält die Daten fast bei ihrer Ankunft, ohne auf eine mögliche Weiterverbreitung zu warten.

## Wenn eine Angabe zu verlieren ist besser

Die Grundidee ist einfach:

> Eine alte Information kann weniger Wert haben als eine verlorene Information.

Lass uns ein VoIP-Gespräch führen.

Jedes Paket transportiert ungefähr **20 ms** Stimmen.

Wenn ein Paket verloren geht, würde es oft länger dauern, als diese 20 ms.

Wenn er endlich ankommt, hätte das Gespräch bereits begonnen.

Die meisten Anwendungen ziehen es dann vor, den Verlust (Interferenz, Stille, Fehlerkorrektur) zu verbergen, anstatt auf die Übertragung zu warten.

Die gleiche Argumentation gilt für:

*   Echtzeit-Multiplayer-Spiele;
*   Videostreaming;
*   Telemetrieströme;
*   IoT-Sensoren;
*   GPS-Positionsdaten.

Ein neuer Wert ist fast immer nützlicher als ein alter Wert, der absolut zuverlässig ist.

# Ebene 2: Verschlüsselung, TLS

TLS (Transport Layer Security, Nachfolger von SSL) ersetzt TCP nicht, es wird darüber hinaus hinzugefügt. Konkret stellt TLs eine normale TCP-Verbindung her und verhandelt dann eine verschlüsselte Sitzung innerhalb: Austausch von Zertifikaten, Vereinbarung über einen Verschlüsselungsalgorithmus, Ableitung von Session-Schlüsseln. Alles, was dann durchläuft, wird verschlüsselt und authentifiziert.

Drei verschiedene Garantien, häufig zusammen:

*   **Geheimschutz**: Niemand außer den beiden Parteien kann den Inhalt lesen.
*   **Integrität**: Jede Änderung der Transitdaten wird festgestellt.
*   **Authentifizierung**: aber im klassischen TLS, in Einbahnstraße: Der Client überprüft, ob der Server der Server ist, den er zu sein behauptet (über sein Zertifikat, das von einer vertrauenswürdigen Behörde unterzeichnet wurde), aber der Server überprüft nichts über die Identität des Clientes. Es ist genau das HTTPS-Modell, wenn du eine Website besuchen: Der Browser authentisiert die Website, die Website authentifiziert du nicht (die Benutzerauthentifizierung erfolgt über einen separaten Mechanismus, Sitzung Cookie, Token).

TLS 1.3 (die aktuelle empfohlene Version) hat den Handshake im aktuellen Fall auf einen einzigen Hin- und Rückflug reduziert, im Vergleich zu zwei für TLs 1.2, wodurch sich die Verbindungslatenz deutlich verringert.

## Ebene 2a: mTLS – Authentifizierung wird gegenseitig

mTLS (mutual TLS) ist TLs mit zusätzlicher Belastung: Der Server verlangt auch ein Client-Zertifikat und überprüft es. Beide Parteien beweisen ihre Identität durch ein Zertifikat, das von einer gemeinsamen Vertrauensperson unterzeichnet wird.

Dies ist der natürliche Mechanismus für die Service-to-Service-Kommunikation in einer verteilten Architektur: Wo HTTPS-Standard genug ist, um einen Browser mit einem öffentlichen Server zu sprechen, antwortet mTLS auf eine andere Frage; _wie weiß ein interner Dienst, dass er gut zu einem anderen autorisierten internen Dienst spricht und nicht zu einem Angreifer, der im Netzwerk gelandet ist?_
```
Client                                          Serveur
  │──── ClientHello ─────────────────────────────▶│
  │◀─── ServerHello + certificat serveur ──────────│
  │──── vérifie le certificat serveur ─────────────│
  │──── envoie SON PROPRE certificat client ──────▶│
  │◀─── vérifie le certificat client ───────────────│
  │──── clés de session dérivées, canal chiffré ──▶│
```
Die mTLS-Kräfte sind einsatzfähig: Es braucht eine interne Zertifizierungsbehörde (CA), einen Mechanismus für die Verteilung der Zertifikate an jeden Dienst und eine Rotations-/Abfragestrategie. In einer ein-Maschinen-Umgebung mit wenigen Diensten ist es manchmal komplexer als Profit – mTLs wird notwendig, wenn der dienstübergreifende Verkehr über ein Netzwerk läuft, das nicht vollständig kontrolliert wird (mehrere Hosts, mehrere Clouds), oder wenn man eine _zero Trust-Politik will, bei der kein Dienst implizit vertrauenswürdig ist, einfach weil er "innerhalb" des Netzes ist.

# Stufe 3: Anwendungsprotokolle über TCP+TLS

Sobald Transport und Verschlüsselung in Kraft sind, muss noch festgelegt werden, wie der Handel strukturiert werden soll. Dies ist die Rolle der Anwendungsprotokolle.

## HTTP / HTTPS

HTTP ist ein Anfrage-Antwort-Protokoll: Der Client öffnet eine Verbindung (oder verwendet eine Verbindung mit dem keep-alive), sendet eine Anfrage, wartet auf eine Antwort, kann dann die Verbindung schließen oder wiederverwendet werden. HTTPS ist einfach HTPT auf TLS – S ändert nichts an der Semantik des Protokolls, nur weil der Transport verschlüsselt ist.

Das Abfrage-Antwort-Modell hat eine strukturelle Grenze: Der Server kann nie zuerst sprechen. Er kann nur auf das reagieren, was der Kunde verlangt. Für häufiges Polling (bestätigen du "gibt es etwas Neues?" jede Sekunde) funktioniert es aber vergeudet Ressourcen – jede Abfrage, die aus dem Protokoll-Overhead zurückgewonnen wird, um meist nichts Neues zu verkünden.

## WebSocket (WS / WSS)

WebSocket reagiert genau auf diese Grenze. Die Verbindung startet als klassische HTTP-Anfrage (mit einem Header`Upgrade: websocket`), aber sobald der Handgriff akzeptiert ist, ist die zugrunde liegende TCP-Verbindung kein HTTP-Anfrage-Antwort-Kanal mehr – sie wird ein zweidirektionaler Full-Duplex-Kanal, in dem Client und Server jederzeit Nachrichten senden können, ohne einen Abfrage-Antwortzyklus für jeden Austausch neu senden zu müssen.
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
WSS ist einfach WebSocket auf TLS, genau wie HTTPS HTTP auf TALS ist. Es ist das Protokoll der Wahl für alles, was Echtzeit-Server-Push benötigt – Chat, Benachrichtigungen, Trading-Feeds, Spiel-Events – ohne ein Binär-Protokoll über nackte TCP selbst verwalten zu wollen.

## GVR China

Weniger bekannt außerhalb der Welt als Mikroservice, aber zentral in Service-to-Service-Kommunikation: gRPC basiert auf HTTP/2 (so TCP + TLS optional), verkörpert die Meldungen in Protocol Buffers (binar, typisch, kompakt - im Gegensatz zu JSON Text der meisten REST-APIs) und ermöglicht nativ bidirektionale Streaming durch Multixierung von HTtop/2 (mehrere logische Ströme auf einer einzigen TCP-Verbindung ohne die head-of-line Blocking-Anfragen, die mehrere sequentielle HTPT/1.1 Anfragen haben würden).

## QUIC / HTTP3

QUIC ändert dies, indem es von UDP anstatt von TCP auf Transportebene repartiert, während es über die Zuverlässigkeitsgarantien, die TCP nativ angeboten hat, neu implementiert - aber Fluss pro Fluss statt global, was das Head-of-line Blocking auf Transportniveau (ein Paket, das auf einem Strom verloren geht, blockiert nicht mehr die anderen Ströme der gleichen Verbindung). TLS 1.3 wird direkt in QUIc integriert anstatt über hinzugefügt, wodurch die Latenz von handshake weiter verringert wird. HTTP/3 ist HTPT über QUIK.

# Überblick: Wo jedes Protokoll liegt

Cover Protokolle Rolle Transport TCP, UDP Bytes, zuverlässig oder nicht Transport (neue Generation) QUIC UDP + Stream-Zuverlässigkeit + Integrierte TLS Sicherheit TLs, mTLS Verschlüsselung, Integrität, Authentifizierung (uni- oder auf Gegenseitigkeit) Anwendung HTTP/HTTPS, WS/WSS, g RPC Strukturierung des Handels (Anfrage-Antwort, bidirektional, Typische VR China)

Ein konkretes Beispiel für die Festlegung von Ideen: Eine Mikroservice-Architektur mit Web-Dashboard und internen Diensten könnte in angemessener Weise HTTPS (dashboar ↔ öffentliche API, ausreichende unidirektionale Authentifizierung auf Browser-Seite), mTLS (Service ↔ interne Service, gegenseitige Authentifizierung erforderlich) und WSS (Echtzeit-Benachrichtigungen auf das Dashboad) kombinieren – drei verschiedene Anwendungsprotokolle, die alle auf dem gleichen TCP + TLS Sockel gebaut wurden.

## Wie man in der Praxis wählen kann

Drei Fragen reichen im Allgemeinen aus , um zu entscheiden:

1.  **Benötige ich Zuverlässigkeit und Ordnung, oder passt die Frische der Daten zu ihrer Garantielieferung?** → TCP wenn ja, UDP wenn nicht (oder QUIC, um beides über einen anderen Kompromiss zu haben).
2.  **Sollte der Server Nachrichten initiieren können, oder stellt der Client immer die erste Anfrage?** → WebSocket/gRPC Streaming, wenn der Server schieben soll, ansonsten HTTP.
3.  **Sollten sich beide Parteien gegenseitig ihre Identität beweisen oder muss nur eine der beiden überprüft werden?** → mTLS für Service-zu-Service in der Zero-trust-Umgebung, einfaches TLS-Laufwerk für den klassischen öffentlichen Kunden.

Die Betriebskomplexität steigt bei jeder hinzugefügten Schicht, TCP nu hat keine Infrastruktur zu verwalten, TLS beantragt Zertifikate, mTLS fordert eine CA und eine Rotationsstrategie, g RPC fordert eine Definition des gemeinsamen Protobuf-Schema. Der richtige Reflex ist, nur zu erhöhen, wenn die Unterschicht eine konkrete Grenze zeigt, nicht durch Vorwegnahme.
