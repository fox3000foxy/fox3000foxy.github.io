---
title: "How Machines Talk to Each Other: An Overview from TCP to mTLS"
description: "Why TCP, UDP, TLS, mTLS, HTTP, and WebSocket are not competing alternatives but stacked layers; a hierarchical overview of machine-to-machine communication, from raw transport to mutual authentication."
date: 2026-07-16
tags: ["tcp", "udp", "tls", "mtls", "websocket", "http", "grpc", "network", "distributed-architecture", "protocols"]
authors: ["docteur-turboss"]
lang: "en"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "da31kMsR9dMMDpOJnD9dwJ32qNjGMqN1AJZ8yCHYbP90e1ojYvJjj/0dpVuwxQRI+Is3pyhBuBlNlsAp2Tk6tA=="
---
# The problem: too many acronyms, not enough hierarchy

TCP, UDP, TLS, mTLS, WebSocket, HTTP, HTTPS, gRPC, QUIC; most resources that cover them present them as a flat list of interchangeable options, "to choose based on the use case." In reality they are not on the same level: some are transport protocols, others are security layers that wrap around transport, and still others are application protocols built on top of the first two. Understanding the hierarchy means understanding why you never "choose" between TCP and TLS: you choose TCP, _then_ you decide whether to put TLS on top.

This article rebuilds this hierarchy layer by layer, from raw transport to mutual authentication, with for each level: what it guarantees, what it does not guarantee, and when to settle for it.

# Level 1: transport (TCP vs UDP)

Everything starts here. TCP and UDP are the two main protocols of the **Transport (Layer 4)** layer of the OSI model. Their role is identical: to transport a data stream between two applications running on different machines. Yet their approach is radically different.

It is important to understand that IP (Internet Protocol), located at the network layer (Layer 3), only routes packets from one host to another. It does not guarantee their delivery, their order, or even their uniqueness. Routers simply make independent routing decisions for each packet.

It is precisely this lack of guarantees that TCP compensates for, while UDP deliberately chooses to add nothing in order to remain extremely lightweight.

## TCP: reliability above all

TCP (Transmission Control Protocol) is a **connection-oriented** protocol. Before exchanging a single byte of data, the two machines must establish a logical connection.

This connection is created through the famous **Three-Way Handshake**:

```

Client                           Server
SYN ---------------------------->
        <--------------------- SYN + ACK
ACK ----------------------------> 
Connection established
```

Each step has a precise purpose:

*   SYN: the client announces it wishes to open a connection and provides an Initial Sequence Number (ISN).
    
*   SYN-ACK: the server accepts the connection, acknowledges the SYN, and in turn provides its own sequence number.
    
*   ACK: the client confirms receipt of the server's information.
    

From this point on, both machines know the state of the connection and can begin exchanging data.

### **Sequence numbers**

TCP does not view data as a succession of packets, but as a **continuous byte stream**.

Each byte sent has a sequence number.

Example:

```
Message:

Bonjour

B = byte 0
o = byte 1
n = byte 2
...
```

If a segment containing bytes 1000 through 1499 is lost during transport, the receiver can detect exactly what is missing.

The sender retransmits only that portion.

This granularity is one of the reasons for TCP's robustness.

### **Acknowledgments (ACK)**

After receiving data, the recipient sends an **ACK (Acknowledgment)**.

Contrary to what is often imagined, an ACK does not mean:

> "I received this packet"

Rather it means:

> "I have received all bytes up to number X."

For example:

```
Client sends:

0 → 999

Server responds:

ACK = 1000
```

This means:

> "Everything before byte 1000 has arrived safely."

This mechanism allows acknowledging multiple segments at once (_cumulative acknowledgments_), reducing the number of control packets.

### **Retransmissions**

If an ACK never arrives, TCP assumes the segment is lost.

It automatically retransmits it.

The **Retransmission Timeout (RTO)** is not fixed.

TCP continuously measures the round-trip time (**RTT**) using received ACKs and dynamically calculates the RTO to avoid unnecessary retransmissions.

Modern implementations also use mechanisms like **Fast Retransmit**: when a sender receives several duplicate ACKs (typically three), it infers that an intermediate segment was lost and resends it immediately, without waiting for the timer to expire.

### **Packet reordering**

The Internet absolutely does not guarantee that two packets follow the same path.

Example:

```
Packet 1
Paris
 ↓
London
 ↓
New York

Packet 2
Paris
 ↓
Frankfurt
 ↓
Chicago
 ↓
New York
```

The second packet may arrive before the first.

TCP then temporarily stores **out-of-order** segments in a **reassembly buffer**, then reassembles them before delivering them to the application.

To the application, everything appears to arrive perfectly in order.

### Flow control

A connection does not depend solely on the network.

The receiver also has limited memory capacity.

If it receives data faster than it can process, its buffers will eventually saturate.

TCP solves this problem using a **Sliding Window**.

The receiver indicates in each ACK:

```
Window = 32768 bytes
```

This means:

> "You can send me up to 32 KB more."

If this window drops to zero:

```
Window = 0
```

The sender temporarily suspends transmissions until the receiver announces a new available window.

This mechanism is **Flow Control** and prevents a fast host from overwhelming a slower one.

### Congestion control

Even if the receiver can absorb the data, the network itself can become saturated.

Routers have limited queues.

When they overflow, packets are dropped.

TCP interprets losses as a sign of congestion and automatically adjusts its rate using a **Congestion Window (cwnd)**.

Modern algorithms (such as **Reno**, **CUBIC**, or **BBR**, depending on operating systems) adjust this window to strike a balance between maximum throughput and network stability.

Early TCP versions mainly used two mechanisms:

*   **Slow Start**: exponential increase in throughput until congestion is detected.
    
*   **Congestion Avoidance**: thereafter more cautious growth, typically linear.
    

This ongoing adaptation is one of the reasons TCP remains performant despite variations in network quality.

### Connection termination

Unlike UDP, a TCP connection also has a proper teardown.

Each end independently closes its stream using the **FIN** flag.

A full close typically requires four exchanges:

```
FIN
ACK
FIN
ACK
```

This procedure ensures that all in-transit data has been delivered before the connection is destroyed.

## UDP: maximum simplicity

UDP (User Datagram Protocol) takes the opposite philosophy.

It is **connectionless**.

There is:

*   no handshake;
    
*   no sequence numbers;
    
*   no acknowledgments;
    
*   no retransmissions;
    
*   no flow control;
    
*   no congestion control.
    

Each message is simply encapsulated in an independent **datagram**, transmitted to the network, then forgotten by the sender.

```
Application → UDP Datagram → IP → Internet
```

The protocol maintains no state between two sends.

Each datagram is completely independent of the previous ones.

### Data integrity

Although UDP does not guarantee delivery or order, it does protect data integrity with a **checksum**.

Upon reception, the checksum is recalculated.

*   If the values match, the datagram is accepted.
    
*   Otherwise, it is immediately discarded.
    

UDP therefore detects corrupted data, but never attempts to recover it.

### Why is UDP so fast?

The UDP header is only **8 bytes**, compared to a minimum of **20 bytes** for TCP (excluding options like timestamps, SACK, or Window Scaling).

Since no connection is maintained, the operating system does not have to track the state of each exchange, which also reduces memory consumption and processing cost.

The application receives data almost as soon as it arrives, without waiting for potential retransmissions.

## When losing data is preferable

The fundamental idea is simple:

> Old information can be worth less than lost information.

Take a VoIP conversation.

Each packet carries about **20 ms** of voice.

If a packet is lost, retransmitting it would often take longer than those 20 ms.

By the time it finally arrived, the conversation would have already moved on.

Most applications therefore prefer to mask the loss (interpolation, silence, error correction) rather than wait for retransmission.

The same reasoning applies to:

*   real-time multiplayer games;
    
*   video streaming;
    
*   telemetry streams;
    
*   IoT sensors;
    
*   GPS position data.
    

A recent value is almost always more useful than an old, perfectly reliable one.

# Level 2: encryption, TLS

TLS (Transport Layer Security, successor to SSL) does not replace TCP, it is added on top. Concretely, TLS establishes a normal TCP connection, then negotiates an encrypted session inside it: certificate exchange, agreement on a cipher algorithm, derivation of session keys. Everything that travels afterwards is encrypted and authenticated.

Three distinct guarantees, often confused:

*   **Confidentiality**: no one other than the two parties can read the content.
    
*   **Integrity**: any alteration of data in transit is detected.
    
*   **Authentication**: but in classic TLS, one-way only: the client verifies that the server is who it claims to be (via its certificate, signed by a trusted authority), but the server does not verify anything about the client's identity. This is exactly the model of HTTPS when you visit a website: the browser authenticates the site, the site does not authenticate you (user authentication goes through a separate mechanism, session cookie, token).
    

TLS 1.3 (the current recommended version) reduced the handshake to a single round-trip in the common case, compared to two for TLS 1.2, which significantly reduces connection latency.

## Level 2bis: mTLS -- authentication becomes mutual

mTLS (mutual TLS) is TLS with an additional constraint: the server _also_ requires a certificate from the client, and verifies it. Both parties prove their identity via a certificate signed by a common trusted authority.

This is the natural mechanism for service-to-service communication in a distributed architecture: where classic HTTPS suffices for a browser to talk to a public server, mTLS answers a different question: _how does an internal service know it is really talking to another authorized internal service, and not to an attacker who landed on the network?_

```
Client                                          Server
  │──── ClientHello ─────────────────────────────▶│
  │◀─── ServerHello + server certificate ──────────│
  │──── verifies server certificate ──────────────│
  │──── sends ITS OWN client certificate ────────▶│
  │◀─── verifies client certificate ──────────────│
  │──── session keys derived, encrypted channel ──▶│
```

The counterpart of mTLS is operational: you need an internal certificate authority (CA), a mechanism for distributing certificates to each service, and a rotation/revocation strategy. In a single-machine environment with few services, this is sometimes more complexity than benefit -- mTLS becomes necessary when inter-service traffic crosses a network you do not fully control (multiple hosts, multi-tenant cloud), or as soon as you want a zero-trust policy, where no service is implicitly trustworthy simply because it is "inside" the network.

# Level 3: application protocols on top of TCP+TLS

Once transport and encryption are in place, the remaining question is _how to structure the exchanges_. This is the role of application protocols.

## HTTP / HTTPS

HTTP is a request-response protocol: the client opens a connection (or reuses one, with keep-alive), sends a request, waits for a response, then the connection can be closed or reused. HTTPS is simply HTTP over TLS -- the S does not change the semantics of the protocol, only the fact that the transport is encrypted.

The request-response model has a structural limitation: the server can never speak first. It can only respond to what the client asks. For frequent polling (checking "is there anything new?" every second), it works but wastes resources -- each request recreates protocol overhead for, most of the time, nothing new to announce.

## WebSocket (WS / WSS)

WebSocket addresses precisely this limitation. The connection starts as a regular HTTP request (with an `Upgrade: websocket` header), but once the handshake is accepted, the underlying TCP connection is no longer an HTTP request-response channel -- it becomes a bidirectional full-duplex channel where client and server can send messages at any time, without having to re-issue a request-response cycle for each exchange.

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

WSS is simply WebSocket over TLS, exactly as HTTPS is HTTP over TLS. It is the protocol of choice for anything that requires real-time server push -- chat, notifications, trading feeds, game events -- without wanting to manage a binary protocol over raw TCP yourself.

## gRPC

Less known outside the microservices world but central in service-to-service communication: gRPC builds on HTTP/2 (thus TCP + optional TLS), serializes messages in Protocol Buffers (binary, typed, compact -- unlike the text JSON of most REST APIs), and natively supports bidirectional streaming thanks to HTTP/2 multiplexing (multiple logical streams over a single TCP connection, without the head-of-line blocking that multiple sequential HTTP/1.1 requests would have).

## QUIC / HTTP3

QUIC changes the game by starting from UDP rather than TCP at the transport level, while reimplementing on top the reliability guarantees that TCP natively offered -- but per-stream rather than globally, which eliminates head-of-line blocking at the transport level (a lost packet on one stream no longer blocks other streams on the same connection). TLS 1.3 is integrated directly into QUIC rather than added on top, further reducing handshake latency. HTTP/3 is HTTP over QUIC.

# Overview: where each protocol sits

Layer Protocols Role Transport TCP, UDP Move bytes around, reliable or not Transport (new generation) QUIC UDP + per-stream reliability + built-in TLS Security TLS, mTLS Encryption, integrity, authentication (one-way or mutual) Application HTTP/HTTPS, WS/WSS, gRPC Structure exchanges (request-response, bidirectional, typed RPC)

A concrete example to set the ideas: a microservices architecture with a web dashboard and internal services could reasonably combine HTTPS (dashboard ↔ public API, one-way authentication sufficient on the browser side), mTLS (service ↔ service internally, mutual authentication required), and WSS (real-time notifications pushed to the dashboard) -- three different application protocols, all built on the same TCP + TLS foundation.

## How to choose, in practice

Three questions are usually enough to decide:

1.  **Do I need reliability and ordering, or does data freshness take precedence over guaranteed delivery?** → TCP if yes, UDP if no (or QUIC to have both via a different trade-off).
    
2.  **Does the server need to initiate messages, or does the client always make the first request?** → WebSocket/gRPC streaming if the server needs to push, regular HTTP otherwise.
    
3.  **Do both parties need to prove their identity mutually, or does only one need to be verified?** → mTLS for service-to-service in a zero-trust environment, plain TLS for regular public clients.
    

Operational complexity increases with each added layer: bare TCP has no infrastructure to manage, TLS requires certificates, mTLS requires a CA and a rotation strategy, gRPC requires a shared Protobuf schema definition. The right reflex is to only increase complexity when the layer below shows a concrete limitation, not preemptively.
