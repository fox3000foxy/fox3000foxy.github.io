---
title: 机器之间怎么聊天：从 TCP 到 mTLS 一览
description: 为什么 TCP、UDP、TLS、mTLS、HTTP 和 WebSocket 不是互相替代的选项而是叠起来的层：从裸传输到双向认证的机器通信分层 tour。
date: 2026-07-16
tags: ["tcp", "udp", "tls", "mtls", "websocket", "http", "grpc", "réseau", "architecture-distribuée", "protocoles"]
authors: ["docteur-turboss"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "bpEPh76WUzFkVatF8LODeGBujlW/3R1G0AJZMkA1BEbR+ZMCcpMHHVPOriJuR0tkivTB8eUbZ/JYVbF4egea2Q=="
---

# 问题：缩写太多，层级太少

TCP、UDP、TLS、mTLS、WebSocket、HTTP、HTTPS、gRPC、QUIC，大多数讲它们的资料都摆成一张扁平的备选项清单，"按场景选"。实际上它们根本不在同一层：有的是传输协议，有的是包在传输外面的安全层，还有的是架在前两者之上的应用协议。看懂层级，就懂为什么你永远不在 TCP 和 TLS 之间"二选一"：你先选 TCP，*再*决定要不要在上面加 TLS。

这篇按层重建这个体系，从裸传输一直到双向认证，每层讲：它保证什么，不保证什么，什么时候停在这层就够。

# 第 1 层：传输（TCP 对 UDP）

一切从这里开始。TCP 和 UDP 是 OSI 模型**传输层（Layer 4）**的两个主要协议。角色一样：在不同机器上跑的两个应用之间搬运数据流。实现方式完全相反。

要先明白 IP（Internet Protocol，网络层 Layer 3）只把包从一台主机送到另一台。不保证到，不保证顺序，不保证不重复。路由器给每个包独立做路由决策。

TCP 补的正是这些缺失的保证，UDP 则故意什么都不加，保持极致轻量。

## TCP：可靠优先

TCP（Transmission Control Protocol）是**面向连接**（_connection-oriented_）协议。交换一字节数据之前，两台机器先建立逻辑连接。

连接靠著名的**三次握手**建起来：

```

Client                           Serveur
SYN ---------------------------->
        <--------------------- SYN + ACK
ACK ---------------------------->
Connexion établie
```

每一步目的明确：

*   SYN：客户端宣布要建连接，给出第一个序列号（Initial Sequence Number，ISN）。
*   SYN-ACK：服务器接受连接，确认收到 SYN，并给出自己的序列号。
*   ACK：客户端确认收到服务器的信息。

从这一刻起，两边都知道连接状态，可以开始传数据了。

### **序列号**

TCP 不把数据看成一串包，而看成**连续字节流**（_byte stream_）。

每个发出的字节都有序列号。

例子：

```
消息：

Bonjour

B = 字节 0
o = 字节 1
n = 字节 2
...
```

如果带字节 1000 到 1499 的段在传输中丢了，接收方能精确知道缺哪块。

发送方只重传这一块。

这种粒度是 TCP 健壮的原因之一。

### **确认（ACK）**

收到数据后，接收方发 **ACK（Acknowledgment）**。

和直觉相反，ACK 不是说：

> "这个包我收到了"

而是说：

> "序列号 X 之前的所有字节我都收到了。"

比如：

```
客户端发：

0 → 999

服务器回：

ACK = 1000
```

意思是：

> "字节 1000 之前的东西都到了。"

这个机制一次确认多个段（_cumulative acknowledgments_），减少控制包数量。

### **重传**

ACK 一直不来，TCP 就当段丢了。

自动重传。

重传超时（**Retransmission Timeout，RTO**）不是固定的。

TCP 靠收到的 ACK 持续测往返时间（**RTT**），动态算 RTO，避免无谓重传。

现代实现还有 **Fast Retransmit**：发送方收到多个重复 ACK（一般三个），就推断中间有个段丢了，不等定时器到期立刻重发。

### **包重排**

Internet 绝不保证两个包走同一条路。

例子：

```
包 1
Paris
  ↓
Londres
  ↓
New York

包 2
Paris
  ↓
Francfort
  ↓
Chicago
  ↓
New York
```

第二个包可能比第一个先到。

TCP 把乱序到的段暂存在**重组缓冲**（_reassembly buffer_）里，再按序交给应用。

应用看到的永远是完美有序的。

### 流量控制

连接不只取决于网络。

接收方内存也有限。

收得比处理得快，缓冲就爆。

TCP 用**滑动窗口（Sliding Window）**解决。

接收方在每个 ACK 里声明：

```
Window = 32768 字节
```

意思是：

> "你最多再发 32 Ko。"

窗口掉到零：

```
Window = 0
```

发送方暂停，等接收方宣布新窗口再动。

这就是**流量控制（Flow Control）**，防止快主机淹没慢主机。

### 拥塞控制

接收方吃得下，网络本身也可能堵。

路由器队列（_queues_）有限。

满了就丢包。

TCP 把丢包读成拥塞信号，用**拥塞窗口（Congestion Window，cwnd）**自动调速。

现代算法（**Reno**、**CUBIC**、**BBR**，看操作系统）调这个窗口，在最高吞吐和网络稳定之间找平衡。

早期 TCP 主要两招：

*   **Slow Start**：指数涨速，直到发现拥塞。
*   **Congestion Avoidance**：之后收敛，一般线性涨。

这种永远在线的自适应，是 TCP 在各种网络质量下都稳的原因之一。

### 连接关闭

和 UDP 不同，TCP 连接有关闭仪式。

两端各用 **FIN** 标志独立关闭自己的流。

完整关闭一般要四次交换：

```
FIN
ACK
FIN
ACK
```

保证在传的数据都交付了，连接才销毁。

## UDP：极简到底

UDP（User Datagram Protocol）走相反哲学。

**无连接（connectionless）**。

没有：

*   握手，
*   序列号，
*   确认，
*   重传，
*   流量控制，
*   拥塞控制。

每个消息包进独立的**数据报**，发出去就忘。

```
应用 → UDP 数据报 → IP → Internet
```

协议在两次发送之间不存任何状态。

每个数据报和之前发的完全独立。

### 数据完整性

UDP 不保证送达和顺序，但用 **checksum** 保完整性。

收到重算 checksum。

*   对上就收，
*   对不上直接扔。

UDP 能发现数据坏了，但永远不尝试恢复。

### 为什么 UDP 这么快？

UDP 头只有 **8 字节**，TCP 最少 **20 字节**（还不算时间戳、SACK、Window Scaling 这些选项）。

不用维持连接，操作系统不用跟踪每条交换的状态，内存占用和处理成本都下来。

应用几乎数据一到就拿到，不等可能的重传。

## 丢点数据反而更好

核心思想很简单：

> 过期信息的价值不如丢掉它。

拿 VoIP 通话说。

每包大约 **20 ms** 语音。

丢一包，重传回来往往超过这 20 ms。

等它到，对话早往前走了。

大多数应用宁可掩盖丢失（插值、静音、纠错）也不等重传。

同理：

*   实时多人游戏，
*   视频流，
*   遥测流，
*   IoT 传感器，
*   GPS 位置数据。

新鲜的值几乎永远比完美可靠的老值有用。

# 第 2 层：加密，TLS

TLS（Transport Layer Security，SSL 的后继）不替代 TCP，加在上面。具体说，先建普通 TCP 连接，再在里面协商加密会话：交换证书，商定加密算法，派生会话密钥。之后走的一切都加密加防篡改。

三个经常被混在一起的保证，分开说：

*   **机密性**：除双方外没人能读内容。
*   **完整性**：传输中任何篡改都会被发现。
*   **认证**：但经典 TLS 是单向的：客户端验证服务器确实是它声称的那台（证书由可信机构签），服务器不验证客户端是谁。这正是你逛网站时的 HTTPS 模型：浏览器认证网站，网站不认证你（用户认证走别的机制，cookie session、token）。

TLS 1.3（当前推荐版本）把握手压到常见情况一轮往返，TLS 1.2 要两轮，连接延迟明显下来。

## 第 2 层之二：mTLS，认证变双向

mTLS（mutual TLS）是 TLS 加一条：服务器*也*要客户端证书，并验证。双方都拿可信机构签的证书证明身份。

这是分布式架构里服务之间通信的天然机制：经典 HTTPS 够浏览器连公网服务，但 mTLS 回答另一个问题，*内部服务怎么知道对面真是被授权的内部服务，而不是混进网络的攻击者？*

```
Client                                          Serveur
  │──── ClientHello ─────────────────────────────▶│
  │◀─── ServerHello + 服务器证书 ──────────│
  │──── 验证服务器证书 ─────────────│
  │──── 发送自己的客户端证书 ──────▶│
  │◀─── 验证客户端证书 ───────────────│
  │──── 派生会话密钥，加密通道 ──▶│
```

mTLS 的代价在运维：要内部 CA，给每个服务发证书，管轮换吊销。单机几个服务时，这复杂度可能超过收益，mTLS 从流量开始走你不完全掌控的网络（多主机、多租户云），或者要 zero trust 策略（"在"内网里也不默认信谁）时才必要。

# 第 3 层：TCP+TLS 之上的应用协议

传输和加密就位，还剩怎么*组织交换*。这是应用协议的活。

## HTTP / HTTPS

HTTP 是请求响应协议：客户端建连接（或复用 keep-alive），发请求，等响应，连接可关可复用。HTTPS 就是跑在 TLS 上的 HTTP，S 只改传输加密，不改协议语义。

请求响应模型有个结构性局限：服务器永远不能先说话。只能答客户端问的。频繁轮询"有新的吗"能跑，但浪费资源，每个请求都带协议开销，大多数时候还没有新东西可宣布。

## WebSocket（WS / WSS）

WebSocket 正好补这个缺口。连接以普通 HTTP 请求起步（带 `Upgrade: websocket` 头），握手一接受，底下 TCP 连接不再是请求响应通道，变成全双工双向通道，客户端服务器随时发消息，不用每交换一次重走请求响应周期。

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

WSS 就是跑在 TLS 上的 WebSocket，和 HTTPS 之于 HTTP 一样。凡要服务器实时推，聊天、通知、交易流、游戏事件，又不想在裸 TCP 上手写二进制协议，选它。

## gRPC

微服务服务间通信圈外不太出名、圈内核心：gRPC 跑在 HTTP/2 上（所以 TCP + 可选 TLS），消息用 Protocol Buffers 序列化（二进制、带类型、紧凑，不像大多数 REST API 的 JSON 文本），靠 HTTP/2 多路复用原生支持双向流（一条 TCP 连接上多个逻辑流，不像串行 HTTP/1.1 请求那样队头阻塞）。

## QUIC / HTTP3

QUIC 在传输层换打法：从 UDP 起步，把 TCP 原生的可靠保证在上面按流重做一遍，但按流而不是全局，消掉传输层队头阻塞（一条流丢包不再卡住同连接别的流）。TLS 1.3 直接内嵌进 QUIC，不再外挂，握手延迟再降。HTTP/3 就是跑在 QUIC 上的 HTTP。

# 总览：各协议坐哪层

层 协议 作用 传输 TCP、UDP 搬字节，可靠或不可靠 传输（新一代） QUIC UDP + 按流可靠 + 内嵌 TLS 安全 TLS、mTLS 加密、完整性、认证（单向或双向） 应用 HTTP/HTTPS、WS/WSS、gRPC 组织交换（请求响应、双向、类型化 RPC）

举个具体例子定住：微服务加管理后台的架构可以合理地混用 HTTPS（后台连公开 API，浏览器侧单向认证够了）、mTLS（服务连服务内部，互相认证必要）、WSS（实时通知推给后台），三种不同的应用协议，底下同一套 TCP + TLS。

## 实战怎么选

一般三个问题就够：

1.  **我要可靠有序，还是新鲜比送达重要？** → 要可靠选 TCP，要新鲜选 UDP（或 QUIC，两边都要的折中）。
2.  **服务器要不要主动发消息，还是永远客户端先问？** → 要服务器推选 WebSocket/gRPC 流，否则经典 HTTP。
3.  **双方要不要互相证明身份，还是只验一边？** → 服务间 zero trust 环境选 mTLS，公开客户端经典场景 TLS 单向够了。

每加一层运维复杂度涨一截，裸 TCP 零基础设施，TLS 要证书，mTLS 要 CA 加轮换策略，gRPC 要共享 Protobuf schema 定义。好习惯是底层出现具体瓶颈再往上加，别提前加。
