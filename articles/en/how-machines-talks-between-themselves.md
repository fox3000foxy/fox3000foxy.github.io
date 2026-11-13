---
title: "How Machines Talk to Each Other: An Overview from TCP to mTLS"
description: "Why TCP, UDP, TLS, mTLS, HTTP, and WebSocket are not competing alternatives but stacked layers; a hierarchical overview of machine-to-machine communication, from raw transport to mutual authentication."
date: 2026-07-16
tags: ["tcp", "udp", "tls", "mtls", "websocket", "http", "grpc", "network", "distributed-architecture", "protocols"]
authors: ["docteur-turboss"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "vCRzZAS0rZOQdYwm/blAPWtUHL7CoVlQqbFt1Cv6hHqqNxMyzoI3Zoc6gMKazlJUO4DS/U5KnOwdcPF6ApBeMg=="
---

# The problem: too many acronyms, not enough hierarchy

TCP, UDP, TLS, mTLS, WebSocket, HTTP, HTTPS, gRPC, QUIC; most resources covering them present them as a flat list of interchangeable options, "pick based on the use case." In reality they are not on the same level: some are transport protocols, others are security layers wrapping around transport, and others still are application protocols built on top of the first two. Understanding the hierarchy means understanding why you never "choose" between TCP and TLS: you choose TCP, _then_ you decide whether to put TLS on top.

This article rebuilds that hierarchy layer by layer, from raw transport to mutual authentication, with for each level: what it guarantees, what it does not guarantee, and when to settle for it.

# Level 1: transport (TCP vs UDP)

Everything starts here. TCP and UDP are the two main protocols of the **Transport layer (Layer 4)** of the OSI model. Their role is identical: carrying a data stream between two applications running on different machines. Yet their way of doing it is radically different.

It matters to understand that IP (Internet Protocol), at the Network layer (Layer 3), only routes packets from one host to another. It guarantees neither their arrival, their order, nor even their uniqueness. Routers just make independent routing decisions for each packet.

It is precisely that absence of guarantees that TCP compensates for, while UDP deliberately chooses to add nothing to stay extremely light.

## TCP: reliability first

TCP (Transmission Control Protocol) is a **connection-oriented** protocol. Before exchanging a single byte of data, both machines must establish a logical connection.

That connection is created through the famous **Three-Way Handshake**:

```

Client                           Server
SYN ---------------------------->
        <--------------------- SYN + ACK
ACK ---------------------------->
Connection established
```

Each step has a precise goal:

*   SYN: the client announces it wants to open a connection and provides an initial sequence number (ISN).
*   SYN-ACK: the server accepts the connection, acknowledges the SYN, and in turn provides its own sequence number.
*   ACK: the client confirms receipt of the server's info.

From then on, both machines know the connection state and can start exchanging data.

### **Sequence numbers**

TCP does not see data as a succession of packets, but as a continuous **byte stream**.

Every sent byte has a sequence number.

Example:

```
Message:

Bonjour

B = byte 0
o = byte 1
n = byte 2
...
```

If a segment holding bytes 1000 to 1499 is lost in transit, the receiver can detect exactly what is missing.

The sender retransmits only that portion.

That granularity is one of the reasons TCP is robust.

### **Acknowledgments (ACK)**

After receiving data, the recipient sends an **ACK (Acknowledgment)**.

Contrary to what people often imagine, an ACK does not mean:

> "I received that packet"

It rather means:

> "I received all bytes up to number X."

For example:

```
Client sends:

0 → 999

Server replies:

ACK = 1000
```

That means:

> "Everything before byte 1000 arrived fine."

That mechanism acknowledges several segments at once (_cumulative acknowledgments_), reducing the number of control packets.

### **Retransmissions**

If an ACK never arrives, TCP assumes the segment is lost.

It retransmits it automatically.

The retransmission delay (**Retransmission Timeout – RTO**) is not fixed.

TCP continuously measures round-trip time (**RTT**) via received ACKs and dynamically computes the RTO to avoid useless retransmissions.

Modern implementations also use mechanisms like **Fast Retransmit**: when a sender receives several duplicate ACKs (usually three), it deduces an intermediate segment was lost and resends it immediately, without waiting for the timer to expire.

### **Packet reordering**

The Internet absolutely does not guarantee two packets take the same path.

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

TCP then temporarily stores out-of-order received segments in a buffer (_reassembly buffer_), then reassembles them before delivering to the application.

For the application, everything looks like it arrives perfectly in order.

### Flow control

A connection does not depend only on the network.

The receiver also has limited memory capacity.

If it receives faster than it can process data, its buffers end up saturating.

TCP solves that with a **sliding window**.

The receiver indicates in each ACK:

```
Window = 32768 bytes
```

That means:

> "You can send me up to 32 KB more."

If that window drops to zero:

```
Window = 0
```

The sender temporarily suspends transmissions until the receiver announces a new available window.

That mechanism is **Flow Control** and stops a fast host from flooding a slower host.

### Congestion control

Even if the receiver can absorb the data, the network itself can get saturated.

Routers have limited queues.

When they overflow, packets get dropped.

TCP interprets losses as a sign of congestion and automatically adapts its throughput with a **congestion window (cwnd)**.

Modern algorithms (like **Reno**, **CUBIC**, or **BBR**, depending on operating systems) tune that window to find a balance between max throughput and network stability.

Early TCP versions mostly used two mechanisms:

*   **Slow Start**: exponential throughput ramp until congestion is detected.
*   **Congestion Avoidance**: then more cautious growth, usually linear.

That permanent adaptation is one of the reasons TCP stays performant despite varying network quality.

### Connection teardown

Unlike UDP, a TCP connection also has a clean teardown.

Each end closes its own stream independently with the **FIN** flag.

A full teardown usually takes four exchanges:

```
FIN
ACK
FIN
ACK
```

That procedure guarantees all in-flight data was properly delivered before the connection is destroyed.

## UDP: maximum simplicity

UDP (User Datagram Protocol) adopts the opposite philosophy.

It is **connectionless**.

There is:

*   no handshake;
*   no sequence numbers;
*   no acknowledgments;
*   no retransmissions;
*   no flow control;
*   no congestion control.

Each message is simply wrapped in an independent **datagram**, sent to the network, then forgotten by the sender.

```
Application → UDP Datagram → IP → Internet
```

The protocol keeps no state between two sends.

Each datagram is totally independent of the previous ones.

### Data integrity

Although UDP guarantees neither delivery nor order, it still protects data integrity with a **checksum**.

On receipt, the checksum is recomputed.

*   If the values match, the datagram is accepted.
*   Otherwise, it is immediately rejected.

So UDP detects corrupted data, but never tries to recover it.

### Why is UDP so fast?

The UDP header is only **8 bytes**, versus a minimum of **20 bytes** for TCP (not counting options like timestamps, SACK, or Window Scaling).

With no connection maintained, the OS does not have to track each exchange's state, which also reduces memory use and processing cost.

The application gets the data almost as soon as it arrives, without waiting for potential retransmissions.

## When losing data is preferable

The core idea is simple:

> Old information can be worth less than lost information.

Take a VoIP conversation.

Each packet carries about **20 ms** of voice.

If a packet is lost, retransmitting it would often take longer than those 20 ms.

By the time it arrived, the conversation would already have moved on.

Most applications prefer masking the loss (interpolation, silence, error correction) over waiting for the retransmission.

The same reasoning applies to:

*   real-time multiplayer games;
*   video streaming;
*   telemetry streams;
*   IoT sensors;
*   GPS position data.

A recent value is almost always more useful than an old, perfectly reliable value.

# Level 2: encryption, TLS

TLS (Transport Layer Security, successor to SSL) does not replace TCP, it adds on top. Concretely, TLS establishes a normal TCP connection, then negotiates an encrypted session inside: certificate exchange, agreement on an encryption algorithm, session key derivation. Everything transiting afterward is encrypted and authenticated.

Three distinct guarantees, often confused:

*   **Confidentiality**: nobody but the two parties can read the content.
*   **Integrity**: any alteration of data in transit is detected.
*   **Authentication**: but in classic TLS, one-way: the client verifies the server really is who it claims to be (via its certificate, signed by a trusted authority), but the server verifies nothing about the client's identity. That's exactly the HTTPS model when you visit a site: the browser authenticates the site, the site does not authenticate you (user authentication goes through a separate mechanism, session cookie, token).

TLS 1.3 (the current recommended version) cut the handshake to a single round trip in the common case, versus two for TLS 1.2, which noticeably reduces connection latency.

## Level 2b: mTLS -- authentication becomes mutual

mTLS (mutual TLS) is TLS with an extra constraint: the server _also_ requires a client certificate, and verifies it. Both parties prove their identity via a certificate signed by a common trusted authority.

It is the natural mechanism for service-to-service communication in a distributed architecture: where classic HTTPS is enough for a browser talking to a public server, mTLS answers a different question; _how does an internal service know it is really talking to another authorized internal service, and not an attacker who landed on the network?_

```
Client                                          Server
  │──── ClientHello ─────────────────────────────▶│
  │◀─── ServerHello + server certificate ──────────│
  │──── verify server certificate ─────────────────│
  │──── send ITS OWN client certificate ──────────▶│
  │◀─── verify client certificate ─────────────────│
  │──── session keys derived, encrypted channel ──▶│
```

The mTLS tradeoff is operational: you need an internal certificate authority (CA), a mechanism to distribute certificates to each service, and a rotation/revocation strategy. In a single-machine environment with few services, it is sometimes more complexity than benefit -- mTLS becomes necessary once inter-service traffic crosses a network you don't fully control (multiple hosts, multi-tenant cloud), or as soon as you want a _zero trust_ style policy, where no service is implicitly trustworthy just because it is "inside" the network.

# Level 3: application protocols on top of TCP+TLS

Once transport and encryption are in place, what remains is _how to structure exchanges_. That's the role of application protocols.

## HTTP / HTTPS

HTTP is a request-response protocol: the client opens a connection (or reuses one, with keep-alive), sends a request, waits for a response, the connection can then close or be reused. HTTPS is simply HTTP over TLS -- the S changes nothing about the protocol's semantics, only that transport is encrypted.

The request-response model has a structural limit: the server can never speak first. It can only answer what the client asks. For frequent polling (checking "anything new?" every second), it works but wastes resources -- each request recreates protocol overhead for, most of the time, nothing new to announce.

## WebSocket (WS / WSS)

WebSocket answers exactly that limit. The connection starts as a classic HTTP request (with an `Upgrade: websocket` header), but once the handshake is accepted, the underlying TCP connection is no longer an HTTP request-response channel -- it becomes a full-duplex bidirectional channel where client and server can send messages at any time, without having to re-emit a request-response cycle on every exchange.

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

WSS is simply WebSocket over TLS, exactly like HTTPS is HTTP over TLS. It is the protocol of choice for anything needing real-time server push -- chat, notifications, trading feeds, game events -- without wanting to manage a binary protocol over raw TCP yourself.

## gRPC

Less known outside the microservices world but central to service-to-service communication: gRPC builds on HTTP/2 (so TCP + optional TLS), serializes messages in Protocol Buffers (binary, typed, compact -- unlike the JSON text of most REST APIs), and natively allows bidirectional streaming thanks to HTTP/2 multiplexing (several logical streams over a single TCP connection, without the head-of-line blocking that several sequential HTTP/1.1 requests would have).

## QUIC / HTTP3

QUIC changes the game by starting from UDP rather than TCP at the transport level, while reimplementing on top the reliability guarantees TCP offered natively - but stream by stream rather than globally, which eliminates transport-level head-of-line blocking (a lost packet on one stream no longer blocks the other streams of the same connection). TLS 1.3 is integrated directly into QUIC rather than added on top, which further reduces handshake latency. HTTP/3 is HTTP over QUIC.

# Overview: where each protocol sits

Layer / Protocols / Role: Transport: TCP, UDP (moving bytes, reliably or not). Next-gen transport: QUIC (UDP + per-stream reliability + integrated TLS). Security: TLS, mTLS (encryption, integrity, uni- or mutual authentication). Application: HTTP/HTTPS, WS/WSS, gRPC (structuring exchanges: request-response, bidirectional, typed RPC).

A concrete example to fix ideas: a microservices architecture with a web dashboard and internal services could reasonably combine HTTPS (dashboard ↔ public API, one-way authentication enough on the browser side), mTLS (service ↔ service internally, mutual authentication needed), and WSS (real-time notifications pushed to the dashboard) -- three different application protocols, all built on the same TCP + TLS base.

## How to pick, in practice

Three questions are usually enough to decide:

1.  **Do I need reliability and order, or does data freshness win over guaranteed delivery?** → TCP if yes, UDP if no (or QUIC to get both at once through a different tradeoff).
2.  **Must the server be able to initiate messages, or does the client always ask first?** → WebSocket/gRPC streaming if the server must push, plain HTTP otherwise.
3.  **Must both parties mutually prove their identity, or does only one need verifying?** → mTLS for service-to-service in a zero-trust environment, plain TLS for a classic public client.

Operational complexity grows with each added layer: bare TCP has no infrastructure to manage, TLS needs certificates, mTLS needs a CA and a rotation strategy, gRPC needs a shared Protobuf schema definition. The right reflex is to climb in complexity only when the layer below shows a concrete limit, not in anticipation.
