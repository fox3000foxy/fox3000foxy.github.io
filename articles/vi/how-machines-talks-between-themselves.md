---
title: "Máy móc nói chuyện với nhau thế nào : tour từ TCP tới mTLS"
description: "Vì sao TCP, UDP, TLS, mTLS, HTTP và WebSocket không phải lựa chọn cạnh tranh mà là các lớp chồng nhau; tour phân cấp về giao tiếp máy với máy, từ vận chuyển thô tới xác thực lẫn nhau."
date: 2026-07-16
tags: ["tcp", "udp", "tls", "mtls", "websocket", "http", "grpc", "réseau", "architecture-distribuée", "protocoles"]
authors: ["docteur-turboss"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "SZhn1h7EZ9/8qdz9y9k5jW8iu99f4goHgpSzPafhXPTzDFDJq3QzptIixpjfQtO/EOEqwFqR8YRwC1PS/YC1Gw=="
---
# Vấn đề : quá nhiều chữ viết tắt, quá ít phân cấp

TCP, UDP, TLS, mTLS, WebSocket, HTTP, HTTPS, gRPC, QUIC; hầu hết tài liệu nói về chúng trình bày chúng như danh sách phẳng các lựa chọn thay thế nhau, "chọn tùy ca dùng". Thực tế chúng không cùng mặt phẳng : vài cái là giao thức vận chuyển, vài cái là lớp bảo mật quấn quanh vận chuyển, vài cái nữa là giao thức ứng dụng dựa trên hai thứ đầu. Hiểu phân cấp là hiểu vì sao ta không bao giờ "chọn" giữa TCP và TLS: ta chọn TCP, _rồi_ quyết có đặt TLS lên trên hay không.

Bài này dựng lại phân cấp đó lớp theo lớp, từ vận chuyển thô tới xác thực lẫn nhau, với mỗi tầng : nó đảm bảo gì, nó không đảm bảo gì, và khi nào cứ dùng nó là đủ.

# Tầng 1 : vận chuyển (TCP đấu UDP)

Mọi thứ bắt đầu ở đây. TCP và UDP là hai giao thức chính của tầng **Vận chuyển (Layer 4)** trong mô hình OSI. Vai trò của chúng giống hệt : chở luồng dữ liệu giữa hai ứng dụng chạy trên các máy khác nhau. Thế nhưng cách chúng làm khác nhau triệt để.

Điều quan trọng cần hiểu là IP (Internet Protocol), nằm ở tầng mạng (Layer 3), chỉ định tuyến các gói từ máy này sang máy khác. Nó không đảm bảo chúng tới nơi, cũng không đảm bảo thứ tự, thậm chí không đảm bảo duy nhất. Các router chỉ ra quyết định định tuyến độc lập cho mỗi gói.

Chính sự thiếu đảm bảo này là thứ TCP tới bù đắp, trong khi UDP cố ý không thêm gì để giữ cực nhẹ.

## TCP : tin cậy trước hết

TCP (Transmission Control Protocol) là giao thức **hướng kết nối** (_connection-oriented_). Trước khi trao đổi một byte dữ liệu, hai máy phải thiết lập kết nối logic.

Kết nối này tạo ra nhờ **Three-Way Handshake** nổi tiếng :

```

Client                           Serveur
SYN ---------------------------->
        <--------------------- SYN + ACK
ACK ---------------------------->
Connexion établie
```

Mỗi bước có mục tiêu chính xác :

*   SYN : client thông báo muốn mở kết nối và đưa số thứ tự đầu tiên (Initial Sequence Number - ISN).

*   SYN-ACK : máy chủ chấp nhận kết nối, xác nhận đã nhận SYN và đưa số thứ tự của chính nó.

*   ACK : client xác nhận đã nhận thông tin của máy chủ.


Từ lúc đó, hai máy biết trạng thái kết nối và có thể bắt đầu trao đổi dữ liệu.

### **Số thứ tự**

TCP không nhìn dữ liệu như chuỗi gói nối tiếp, mà như **luồng byte liên tục** (_byte stream_).

Mỗi byte gửi đi có một số thứ tự.

Ví dụ :

```
Message :

Bonjour

B = octet 0
o = octet 1
n = octet 2
...
```

Nếu đoạn chứa các byte 1000 tới 1499 mất lúc vận chuyển, bên nhận có thể phát hiện chính xác thiếu gì.

Bên gửi chỉ truyền lại phần đó.

Độ hạt này là một trong những lý do TCP vững.

### **Xác nhận đã nhận (ACK)**

Sau khi nhận dữ liệu, bên nhận gửi **ACK (Acknowledgment)**.

Trái với điều ta thường tưởng, ACK không có nghĩa :

> "Tôi đã nhận gói này"

Nó có nghĩa :

> "Tôi đã nhận mọi byte tới số X."

Ví dụ :

```
Client envoie :

0 → 999

Serveur répond :

ACK = 1000
```

Nghĩa là :

> "Mọi thứ trước byte 1000 đã tới nơi ổn."

Cơ chế này cho phép xác nhận nhiều đoạn cùng lúc (_cumulative acknowledgments_), giảm số gói điều khiển.

### **Truyền lại**

Nếu ACK không bao giờ tới, TCP cho rằng đoạn mất.

Nó tự truyền lại.

Trễ truyền lại (**Retransmission Timeout – RTO**) không cố định.

TCP liên tục đo thời gian khứ hồi (**RTT**) nhờ các ACK nhận được và tính động RTO để tránh truyền lại vô ích.

Các triển khai hiện đại còn dùng cơ chế như **Fast Retransmit** : khi bên gửi nhận nhiều ACK trùng (thường ba), nó suy ra đoạn trung gian mất và gửi lại ngay, không chờ hết timer.

### **Sắp xếp lại gói**

Internet hoàn toàn không đảm bảo hai gói đi cùng đường.

Ví dụ :

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

Gói thứ hai có thể tới trước gói đầu.

TCP khi đó tạm lưu các đoạn nhận **lộn xộn** trong bộ đệm (_reassembly buffer_), rồi ráp lại trước khi giao cho ứng dụng.

Với ứng dụng, mọi thứ dường như tới hoàn hảo đúng thứ tự.

### Kiểm soát luồng

Kết nối không chỉ phụ thuộc mạng.

Bên nhận cũng có dung lượng bộ nhớ giới hạn.

Nếu nó nhận nhanh hơn khả năng xử lý dữ liệu, bộ đệm của nó cuối cùng bão hòa.

TCP giải bài toán này bằng **cửa sổ trượt (Sliding Window)**.

Bên nhận chỉ trong mỗi ACK :

```
Window = 32768 octets
```

Nghĩa là :

> "Bạn có thể gửi tôi thêm tới 32 Ko."

Nếu cửa sổ này rớt về không :

```
Window = 0
```

Bên gửi tạm dừng truyền tới khi bên nhận thông báo cửa sổ mới có sẵn.

Cơ chế này tạo thành **kiểm soát luồng (Flow Control)** và ngăn máy nhanh làm ngập máy chậm hơn.

### Kiểm soát tắc nghẽn

Ngay cả khi bên nhận đủ khả năng hấp thụ dữ liệu, bản thân mạng có thể bão hòa.

Các router có hàng đợi (_queues_) giới hạn.

Khi chúng tràn, các gói bị loại.

TCP diễn giải mất mát như dấu hiệu tắc nghẽn và tự thích ứng tốc độ bằng **cửa sổ tắc nghẽn (Congestion Window – cwnd)**.

Các thuật toán hiện đại (như **Reno**, **CUBIC** hay **BBR**, tùy hệ điều hành) chỉnh cửa sổ này để tìm cân bằng giữa tốc độ tối đa và ổn định mạng.

Các phiên bản TCP đầu chủ yếu dùng hai cơ chế :

*   **Slow Start** : tăng tốc độ theo hàm mũ tới khi phát hiện tắc nghẽn.

*   **Congestion Avoidance** : sau đó tăng thận trọng hơn, thường tuyến tính.


Thích ứng thường trực này là một trong những lý do TCP vẫn hiệu quả dù chất lượng mạng biến động.

### Đóng kết nối

Không như UDP, kết nối TCP còn có đóng sạch.

Mỗi đầu đóng độc lập luồng của mình bằng cờ **FIN**.

Đóng đầy đủ thường cần bốn lần trao đổi :

```
FIN
ACK
FIN
ACK
```

Thủ tục này đảm bảo mọi dữ liệu đang đi đã được giao trước khi hủy kết nối.

## UDP : đơn giản tối đa

UDP (User Datagram Protocol) theo triết lý ngược.

Nó **phi kết nối (connectionless)**.

Nó không có :

*   handshake nào ;

*   số thứ tự nào ;

*   xác nhận đã nhận nào ;

*   truyền lại nào ;

*   kiểm soát luồng nào ;

*   kiểm soát tắc nghẽn nào.


Mỗi thông điệp đơn giản được bọc trong **datagram** độc lập, truyền cho mạng, rồi bị bên gửi quên.

```
Application → Datagramme UDP → IP → Internet
```

Giao thức không giữ trạng thái nào giữa hai lần gửi.

Mỗi datagram hoàn toàn độc lập với các cái trước.

### Toàn vẹn dữ liệu

Dù UDP không đảm bảo giao hay thứ tự, nó vẫn bảo vệ toàn vẹn dữ liệu bằng **checksum**.

Lúc nhận, checksum được tính lại.

*   Nếu các giá trị khớp, datagram được chấp nhận.

*   Ngược lại, nó bị loại ngay.


UDP vì vậy phát hiện dữ liệu hỏng, nhưng không bao giờ cố phục hồi chúng.

### Vì sao UDP nhanh vậy?

Header UDP chỉ chứa **8 byte**, so với tối thiểu **20 byte** cho TCP (chưa kể tùy chọn như timestamp, SACK hay Window Scaling).

Vì không duy trì kết nối nào, hệ điều hành không phải theo dõi trạng thái mỗi lần trao đổi, giảm tiêu thụ bộ nhớ và chi phí xử lý.

Ứng dụng nhận dữ liệu gần như ngay khi tới, không chờ truyền lại khả dĩ.

## Khi mất dữ liệu lại tốt hơn

Ý nền đơn giản :

> Thông tin cũ có thể ít giá trị hơn thông tin mất.

Lấy cuộc gọi VoIP.

Mỗi gói chở khoảng **20 ms** giọng.

Nếu một gói mất, truyền lại nó thường tốn thời gian hơn 20 ms đó.

Khi nó cuối cùng tới, cuộc trò chuyện đã tiến tiếp.

Hầu hết ứng dụng khi đó thích che mất mát (nội suy, im lặng, sửa lỗi) hơn chờ truyền lại.

Lập luận tương tự áp dụng cho :

*   game nhiều người thời gian thực ;

*   streaming video ;

*   luồng đo xa ;

*   cảm biến IoT ;

*   dữ liệu vị trí GPS.


Giá trị mới gần như luôn hữu ích hơn giá trị cũ tin cậy hoàn hảo.

# Tầng 2 : mã hóa, TLS

TLS (Transport Layer Security, hậu duệ SSL) không thay TCP, nó thêm lên trên. Cụ thể, TLS thiết lập kết nối TCP bình thường, rồi thương lượng phiên mã hóa bên trong : trao đổi chứng chỉ, thống nhất thuật toán mã hóa, dẫn xuất khóa phiên. Mọi thứ đi qua sau đó được mã hóa và xác thực.

Ba đảm bảo riêng, thường bị lẫn :

*   **Bảo mật** : không ai ngoài hai bên đọc được nội dung.

*   **Toàn vẹn** : mọi sửa đổi dữ liệu lúc đi bị phát hiện.

*   **Xác thực** : nhưng trong TLS cổ điển, một chiều : client kiểm tra máy chủ đúng là thứ nó xưng (qua chứng chỉ của nó, do cơ quan tin cậy ký), nhưng máy chủ không kiểm tra gì về danh tính client. Đó đúng là mô hình HTTPS khi bạn thăm trang : trình duyệt xác thực trang, trang không xác thực bạn (xác thực người dùng đi qua cơ chế riêng, cookie phiên, token).


TLS 1.3 (phiên bản hiện khuyên dùng) đã rút handshake còn một lần khứ hồi trong ca thường, so với hai lần ở TLS 1.2, giảm đáng kể trễ kết nối.

## Tầng 2bis : mTLS -- xác thực thành lẫn nhau

mTLS (mutual TLS) là TLS với ràng buộc thêm : máy chủ _cũng_ đòi chứng chỉ từ client, và kiểm tra nó. Cả hai bên chứng minh danh tính qua chứng chỉ do cơ quan tin cậy chung ký.

Đó là cơ chế tự nhiên cho giao tiếp service-tới-service trong kiến trúc phân tán : nơi HTTPS cổ điển đủ để trình duyệt nói với máy chủ công cộng, mTLS trả lời câu hỏi khác; _làm sao một service nội bộ biết nó đang nói với một service nội bộ được phép khác, chứ không phải kẻ tấn công vừa đáp xuống mạng?_

```
Client                                          Serveur
  │──── ClientHello ─────────────────────────────▶│
  │◀─── ServerHello + certificat serveur ──────────│
  │──── vérifie le certificat serveur ─────────────│
  │──── envoie SON PROPRE certificat client ──────▶│
  │◀─── vérifie le certificat client ───────────────│
  │──── clés de session dérivées, canal chiffré ──▶│
```

Cái giá của mTLS mang tính vận hành : cần cơ quan chứng nhận (CA) nội bộ, cơ chế phân phối chứng chỉ cho mỗi service, và chiến lược xoay vòng/thu hồi. Trong môi trường đơn máy với ít service, đôi khi phức tạp hơn lợi ích -- mTLS thành cần thiết từ lúc lưu lượng liên service đi qua mạng ta không kiểm soát hoàn toàn (nhiều máy, cloud multi-tenant), hay hễ ta muốn chính sách kiểu _zero trust_, nơi không service nào ngầm đáng tin chỉ vì nó "ở trong" mạng.

# Tầng 3 : giao thức ứng dụng trên TCP+TLS

Khi vận chuyển và mã hóa đã đặt, còn phải định nghĩa _cách cấu trúc trao đổi_. Đó là vai trò của giao thức ứng dụng.

## HTTP / HTTPS

HTTP là giao thức yêu cầu-phản hồi : client mở kết nối (hay tái dùng, với keep-alive), gửi yêu cầu, chờ phản hồi, kết nối sau đó có thể đóng hay tái dùng. HTTPS, đơn giản là HTTP trên TLS -- chữ S không đổi gì ngữ nghĩa giao thức, chỉ đổi việc vận chuyển được mã hóa.

Mô hình yêu cầu-phản hồi có giới hạn cấu trúc : máy chủ không bao giờ được nói trước. Nó chỉ trả lời điều client hỏi. Với polling dày (kiểm tra "có gì mới?" mỗi giây), việc đó chạy nhưng phí tài nguyên -- mỗi yêu cầu tạo lại chi phí giao thức trong khi phần lớn thời gian chẳng có gì mới để thông báo.

## WebSocket (WS / WSS)

WebSocket trả lời đúng giới hạn này. Kết nối khởi đầu như yêu cầu HTTP cổ điển (với header `Upgrade: websocket`), nhưng một khi bắt tay được chấp nhận, kết nối TCP bên dưới không còn là kênh yêu cầu-phản hồi HTTP -- nó thành kênh hai chiều full-duplex nơi client và máy chủ có thể gửi thông điệp bất cứ lúc nào, không phải phát lại chu kỳ yêu cầu-phản hồi mỗi lần trao đổi.

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

WSS đơn giản là WebSocket trên TLS, đúng như HTTPS là HTTP trên TLS. Đó là giao thức chọn cho mọi thứ đòi push máy chủ thời gian thực -- chat, thông báo, luồng trading, sự kiện game -- mà không muốn tự quản giao thức nhị phân trên TCP trần.

## gRPC

Ít biết ngoài thế giới microservices nhưng trung tâm trong giao tiếp service-tới-service : gRPC dựa trên HTTP/2 (nên TCP + TLS tùy chọn), tuần tự hóa thông điệp bằng Protocol Buffers (nhị phân, có kiểu, gọn - ngược với JSON văn bản của hầu hết API REST), và cho phép gốc streaming hai chiều nhờ ghép kênh của HTTP/2 (nhiều luồng logic trên một kết nối TCP, không head-of-line blocking như nhiều yêu cầu HTTP/1.1 nối tiếp).

## QUIC / HTTP3

QUIC đổi cuộc chơi bằng cách khởi đầu từ UDP thay vì TCP ở tầng vận chuyển, đồng thời tái triển khai lên trên các đảm bảo tin cậy mà TCP vốn cho gốc - nhưng theo từng luồng thay vì toàn cục, loại bỏ head-of-line blocking ở tầng vận chuyển (gói mất trên một luồng không còn chặn các luồng khác của cùng kết nối). TLS 1.3 tích hợp thẳng vào QUIC thay vì thêm lên trên, giảm tiếp trễ bắt tay. HTTP/3 là HTTP trên QUIC.

# Tổng quan : mỗi giao thức nằm đâu

Tầng Giao thức Vai trò Vận chuyển TCP, UDP Cho byte đi, tin cậy hay không Vận chuyển (thế hệ mới) QUIC UDP + tin cậy theo luồng + TLS tích hợp Bảo mật TLS, mTLS Mã hóa, toàn vẹn, xác thực (đơn hay lẫn nhau) Ứng dụng HTTP/HTTPS, WS/WSS, gRPC Cấu trúc trao đổi (yêu cầu-phản hồi, hai chiều, RPC có kiểu)

Ví dụ cụ thể để cố định ý : kiến trúc microservices với dashboard web và service nội bộ có thể hợp lý kết hợp HTTPS (dashboard ↔ API công cộng, xác thực một chiều đủ phía trình duyệt), mTLS (service ↔ service nội bộ, xác thực lẫn nhau cần thiết), và WSS (thông báo thời gian thực đẩy về dashboard) -- ba giao thức ứng dụng khác nhau, đều dựng trên cùng nền TCP + TLS.

## Cách chọn, trong thực hành

Ba câu hỏi thường đủ để chốt :

1.  **Tôi có cần tin cậy và thứ tự, hay độ tươi của dữ liệu quan trọng hơn giao đảm bảo?** → TCP nếu có, UDP nếu không (hay QUIC để có cả hai qua thỏa hiệp khác).

2.  **Máy chủ có phải chủ động gửi thông điệp, hay client luôn hỏi trước?** → WebSocket/gRPC streaming nếu máy chủ phải đẩy, HTTP cổ điển nếu không.

3.  **Cả hai bên có phải chứng minh danh tính lẫn nhau, hay chỉ một bên cần kiểm tra?** → mTLS cho service-tới-service trong môi trường zero-trust, TLS đơn cho client công cộng cổ điển.


Độ phức tạp vận hành tăng mỗi lớp thêm, TCP trần không có hạ tầng nào cần quản, TLS đòi chứng chỉ, mTLS đòi CA và chiến lược xoay vòng, gRPC đòi định nghĩa schema Protobuf chia sẻ. Phản xạ đúng là chỉ leo phức tạp khi tầng dưới cho thấy giới hạn cụ thể, không phải phòng trước.
