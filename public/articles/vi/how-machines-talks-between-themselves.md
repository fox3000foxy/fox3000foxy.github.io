---
title: "Cách các máy tính nói chuyện với nhau: tổng quan từ TCP đến mTLS"
description: "Tại sao TCP, UDP, TLS, mTLS, HTTP và WebSocket không phải là những lựa chọn thay thế cạnh tranh mà là các tầng xếp chồng; một tổng quan phân cấp về giao tiếp máy tính, từ vận chuyển thô đến xác thực lẫn nhau."
date: 2026-07-16
tags: ["tcp", "udp", "tls", "mtls", "websocket", "http", "grpc", "mạng", "kiến-trúc-phân-tán", "giao-thức"]
authors: ["docteur-turboss"]
lang: "vi"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "6GBd/4VTCSvO2GsTnx5zJO2OI4q2Hd5r0TW6BXcjPgiZYx53NsCwNe7uGjapzOGbdOsWe6TsgxSRKQZwX+QndA=="
---
# Vấn đề: quá nhiều từ viết tắt, không đủ thứ bậc

TCP, UDP, TLS, mTLS, WebSocket, HTTP, HTTPS, gRPC, QUIC; hầu hết các tài liệu nói về chúng đều trình bày như một danh sách phẳng các lựa chọn có thể thay thế, "tùy trường hợp sử dụng mà chọn". Thực tế, chúng không cùng một cấp độ: một số là giao thức vận chuyển, số khác là tầng bảo mật bọc quanh vận chuyển, lại có những giao thức ứng dụng dựa trên hai tầng đầu. Hiểu được thứ bậc là hiểu tại sao ta không bao giờ "chọn" giữa TCP và TLS: ta chọn TCP, _rồi_ quyết định có đặt TLS lên trên hay không.

Bài viết này xây dựng lại thứ bậc đó từng tầng một, từ vận chuyển thô đến xác thực lẫn nhau, với mỗi cấp độ: nó đảm bảo điều gì, nó không đảm bảo điều gì, và khi nào thì dùng nó là đủ.

# Cấp độ 1: vận chuyển (TCP so với UDP)

Mọi thứ bắt đầu từ đây. TCP và UDP là hai giao thức chính của tầng **Vận chuyển (Layer 4)** trong mô hình OSI. Vai trò của chúng giống hệt nhau: vận chuyển một luồng dữ liệu giữa hai ứng dụng chạy trên các máy khác nhau. Tuy nhiên, cách thức thực hiện của chúng hoàn toàn khác biệt.

Điều quan trọng cần hiểu là IP (Internet Protocol), nằm ở tầng mạng (Layer 3), chỉ làm nhiệm vụ chuyển tiếp các gói tin từ một máy chủ này sang máy chủ khác. Nó không đảm bảo việc gói tin đến nơi, không đảm bảo thứ tự, thậm chí không đảm bảo tính duy nhất. Các bộ định tuyến chỉ đơn giản đưa ra các quyết định định tuyến độc lập cho mỗi gói tin.

Chính sự thiếu vắng các đảm bảo này là điều TCP đến để bù đắp, trong khi UDP cố tình không thêm gì cả để giữ cho nó cực kỳ nhẹ.

## TCP: độ tin cậy lên hàng đầu

TCP (Transmission Control Protocol) là một giao thức **hướng kết nối** (_connection-oriented_). Trước khi trao đổi bất kỳ byte dữ liệu nào, hai máy phải thiết lập một kết nối logic.

Kết nối này được tạo ra nhờ **Bắt tay ba bước (Three-Way Handshake)** nổi tiếng:

```

Client                           Server
SYN ---------------------------->
        <--------------------- SYN + ACK
ACK ----------------------------> 
Kết nối được thiết lập
```

Mỗi bước có một mục tiêu cụ thể:

*   SYN: client thông báo muốn mở một kết nối và cung cấp số thứ tự đầu tiên (Initial Sequence Number - ISN).
    
*   SYN-ACK: server chấp nhận kết nối, xác nhận đã nhận SYN và cung cấp số thứ tự của riêng mình.
    
*   ACK: client xác nhận đã nhận thông tin từ server.
    

Kể từ thời điểm này, cả hai máy đều biết trạng thái của kết nối và có thể bắt đầu trao đổi dữ liệu.

### **Các số thứ tự**

TCP không xem dữ liệu như một chuỗi các gói tin, mà như một **luồng byte liên tục** (_byte stream_).

Mỗi byte được gửi đều có một số thứ tự.

Ví dụ:

```
Tin nhắn:

Bonjour

B = byte 0
o = byte 1
n = byte 2
...
```

Nếu một segment chứa các byte 1000 đến 1499 bị mất trong quá trình vận chuyển, bên nhận có thể phát hiện chính xác phần nào bị thiếu.

Bên gửi chỉ truyền lại phần đó.

Mức độ chi tiết này là một trong những lý do tạo nên sự mạnh mẽ của TCP.

### **Các xác nhận (ACK)**

Sau khi nhận được dữ liệu, bên nhận gửi một **ACK (Acknowledgment)**.

Trái với suy nghĩ thông thường, một ACK không có nghĩa là:

> "Tôi đã nhận được gói tin này"

Nó có nghĩa là:

> "Tôi đã nhận được tất cả các byte cho đến số X."

Ví dụ:

```
Client gửi:

0 → 999

Server trả lời:

ACK = 1000
```

Điều này có nghĩa là:

> "Mọi thứ trước byte 1000 đã đến nơi an toàn."

Cơ chế này cho phép xác nhận nhiều segment cùng một lúc (_cumulative acknowledgments_), giảm số lượng gói tin điều khiển.

### **Các lần truyền lại**

Nếu một ACK không bao giờ đến, TCP cho rằng segment đã bị mất.

Nó tự động truyền lại.

Thời gian chờ truyền lại (**Retransmission Timeout – RTO**) không cố định.

TCP liên tục đo thời gian khứ hồi (**RTT**) nhờ các ACK đã nhận và tính toán động RTO để tránh các lần truyền lại không cần thiết.

Các triển khai hiện đại cũng sử dụng các cơ chế như **Fast Retransmit**: khi bên gửi nhận được nhiều ACK trùng lặp (thường là ba), nó suy ra rằng một segment ở giữa đã bị mất và gửi lại ngay lập tức, không cần chờ hết thời gian.

### **Sắp xếp lại các gói tin**

Internet hoàn toàn không đảm bảo rằng hai gói tin sẽ đi cùng một đường.

Ví dụ:

```
Gói tin 1
Paris
 ↓
London
 ↓
New York

Gói tin 2
Paris
 ↓
Frankfurt
 ↓
Chicago
 ↓
New York
```

Gói tin thứ hai có thể đến trước gói tin thứ nhất.

TCP tạm thời lưu trữ các segment nhận được **không đúng thứ tự** trong một bộ đệm (_reassembly buffer_), sau đó sắp xếp lại trước khi chuyển cho ứng dụng.

Đối với ứng dụng, mọi thứ dường như đến một cách hoàn hảo theo đúng thứ tự.

### Kiểm soát luồng

Một kết nối không chỉ phụ thuộc vào mạng.

Bên nhận cũng có dung lượng bộ nhớ hạn chế.

Nếu nó nhận nhanh hơn khả năng xử lý dữ liệu, các bộ đệm của nó sẽ bị tràn.

TCP giải quyết vấn đề này nhờ một **cửa sổ trượt (Sliding Window)**.

Bên nhận chỉ ra trong mỗi ACK:

```
Window = 32768 bytes
```

Điều này có nghĩa là:

> "Bạn có thể gửi cho tôi thêm tới 32 KB."

Nếu cửa sổ này giảm xuống 0:

```
Window = 0
```

Bên gửi tạm thời dừng truyền cho đến khi bên nhận thông báo có cửa sổ mới.

Cơ chế này tạo nên **kiểm soát luồng (Flow Control)** và ngăn không cho một máy chủ nhanh làm ngập một máy chủ chậm hơn.

### Kiểm soát tắc nghẽn

Ngay cả khi bên nhận có khả năng hấp thụ dữ liệu, bản thân mạng cũng có thể bị bão hòa.

Các bộ định tuyến có hàng đợi (_queues_) hạn chế.

Khi chúng tràn, các gói tin bị loại bỏ.

TCP coi các mất mát là dấu hiệu của tắc nghẽn và tự động điều chỉnh tốc độ nhờ một **cửa sổ tắc nghẽn (Congestion Window – cwnd)**.

Các thuật toán hiện đại (như **Reno**, **CUBIC** hoặc **BBR**, tùy theo hệ điều hành) điều chỉnh cửa sổ này để tìm sự cân bằng giữa tốc độ tối đa và sự ổn định của mạng.

Các phiên bản đầu của TCP chủ yếu sử dụng hai cơ chế:

*   **Slow Start**: tăng tốc độ theo cấp số nhân cho đến khi phát hiện tắc nghẽn.
    
*   **Congestion Avoidance**: sau đó tăng trưởng thận trọng hơn, thường là tuyến tính.
    

Sự thích ứng liên tục này là một trong những lý do TCP vẫn hoạt động tốt mặc dù chất lượng mạng có biến động.

### Đóng kết nối

Không giống như UDP, một kết nối TCP cũng có một quy trình đóng riêng.

Mỗi đầu mút đóng luồng của mình một cách độc lập nhờ cờ **FIN**.

Một lần đóng hoàn chỉnh thường cần bốn lần trao đổi:

```
FIN
ACK
FIN
ACK
```

Thủ tục này đảm bảo rằng tất cả dữ liệu đang trên đường đều được giao trước khi kết nối bị hủy.

## UDP: sự đơn giản tối đa

UDP (User Datagram Protocol) áp dụng triết lý ngược lại.

Nó **không kết nối (connectionless)**.

Không có:

*   handshake nào;
    
*   số thứ tự nào;
    
*   xác nhận nào;
    
*   truyền lại nào;
    
*   kiểm soát luồng nào;
    
*   kiểm soát tắc nghẽn nào.
    

Mỗi thông điệp chỉ đơn giản được đóng gói vào một **datagram** độc lập, gửi lên mạng, rồi bên gửi bỏ đi.

```
Application → UDP Datagram → IP → Internet
```

Giao thức không lưu giữ bất kỳ trạng thái nào giữa hai lần gửi.

Mỗi datagram hoàn toàn độc lập với các datagram trước đó.

### Tính toàn vẹn dữ liệu

Mặc dù UDP không đảm bảo việc giao hàng hay thứ tự, nó vẫn bảo vệ tính toàn vẹn của dữ liệu nhờ một **checksum**.

Khi nhận, checksum được tính toán lại.

*   Nếu các giá trị khớp nhau, datagram được chấp nhận.
    
*   Nếu không, nó bị từ chối ngay lập tức.
    

UDP do đó phát hiện dữ liệu bị hỏng, nhưng không bao giờ cố gắng khôi phục chúng.

### Tại sao UDP lại nhanh như vậy?

Tiêu đề UDP chỉ chứa **8 byte**, so với tối thiểu **20 byte** cho TCP (chưa kể các tùy chọn như timestamps, SACK hay Window Scaling).

Không có kết nối nào được duy trì, hệ điều hành không phải theo dõi trạng thái của mỗi lần trao đổi, điều này cũng làm giảm mức tiêu thụ bộ nhớ và chi phí xử lý.

Ứng dụng nhận được dữ liệu gần như ngay khi chúng đến, không cần chờ các lần truyền lại có thể xảy ra.

## Khi nào mất dữ liệu lại tốt hơn

Ý tưởng cơ bản rất đơn giản:

> Một thông tin cũ có thể có giá trị thấp hơn một thông tin bị mất.

Hãy xem xét một cuộc trò chuyện VoIP.

Mỗi gói tin chứa khoảng **20 ms** giọng nói.

Nếu một gói tin bị mất, việc truyền lại nó thường mất nhiều thời gian hơn 20 ms đó.

Khi nó cuối cùng đến nơi, cuộc trò chuyện đã tiếp diễn.

Hầu hết các ứng dụng thích che giấu sự mất mát (nội suy, im lặng, sửa lỗi) hơn là chờ truyền lại.

Lập luận tương tự cũng áp dụng cho:

*   các trò chơi đa người thời gian thực;
    
*   phát trực tiếp video;
    
*   các luồng dữ liệu từ xa;
    
*   các cảm biến IoT;
    
*   dữ liệu vị trí GPS.
    

Một giá trị gần đây hầu như luôn hữu ích hơn một giá trị cũ hoàn toàn đáng tin cậy.

# Cấp độ 2: mã hóa, TLS

TLS (Transport Layer Security, kế thừa của SSL) không thay thế TCP, nó được thêm vào bên trên. Cụ thể, TLS thiết lập một kết nối TCP bình thường, sau đó thương lượng một phiên mã hóa bên trong: trao đổi chứng chỉ, thỏa thuận về thuật toán mã hóa, dẫn xuất khóa phiên. Mọi thứ truyền đi sau đó đều được mã hóa và xác thực.

Ba đảm bảo riêng biệt, thường bị nhầm lẫn:

*   **Bảo mật (Confidentiality)**: không ai ngoài hai bên có thể đọc được nội dung.
    
*   **Toàn vẹn (Integrity)**: mọi sự thay đổi dữ liệu trong quá trình truyền đều bị phát hiện.
    
*   **Xác thực (Authentication)**: nhưng trong TLS cổ điển, chỉ một chiều: client xác minh rằng server đúng là người nó tuyên bố (thông qua chứng chỉ, được ký bởi một tổ chức đáng tin cậy), nhưng server không xác minh gì về danh tính của client. Đây chính xác là mô hình của HTTPS khi bạn truy cập một trang web: trình duyệt xác thực trang web, trang web không xác thực bạn (việc xác thực người dùng thông qua một cơ chế riêng, cookie phiên, token).
    

TLS 1.3 (phiên bản hiện tại được khuyến nghị) đã giảm handshake xuống chỉ còn một vòng khứ hồi trong trường hợp thông thường, so với hai vòng của TLS 1.2, giúp giảm đáng kể độ trễ kết nối.

## Cấp độ 2bis: mTLS -- xác thực trở nên lẫn nhau

mTLS (mutual TLS) là TLS với một ràng buộc bổ sung: server cũng _yêu cầu_ một chứng chỉ từ client và xác minh nó. Cả hai bên đều chứng minh danh tính của mình thông qua một chứng chỉ được ký bởi một tổ chức chứng thực chung đáng tin cậy.

Đây là cơ chế tự nhiên cho giao tiếp service-à-service trong một kiến trúc phân tán: nơi HTTPS cổ điển đủ để trình duyệt nói chuyện với một server công cộng, mTLS trả lời một câu hỏi khác; _làm thế nào một dịch vụ nội bộ biết rằng nó đang nói chuyện với một dịch vụ nội bộ được ủy quyền khác, chứ không phải với một kẻ tấn công đã xâm nhập vào mạng?_

```
Client                                        Server
  │──── ClientHello ─────────────────────────────▶│
  │◀─── ServerHello + chứng chỉ server ────────────│
  │──── xác minh chứng chỉ server ─────────────────│
  │──── gửi CHỨNG CHỈ CỦA CHÍNH NÓ ───────────────▶│
  │◀─── xác minh chứng chỉ client ──────────────────│
  │──── khóa phiên được dẫn xuất, kênh mã hóa ────▶│
```

Mặt trái của mTLS là về mặt vận hành: cần một cơ quan cấp chứng chỉ (CA) nội bộ, một cơ chế phân phối chứng chỉ cho mỗi dịch vụ, và một chiến lược luân chuyển/thu hồi. Trong một môi trường một máy với ít dịch vụ, đôi khi nó phức tạp hơn là lợi ích -- mTLS trở nên cần thiết từ thời điểm lưu lượng giữa các dịch vụ đi qua một mạng mà ta không kiểm soát hoàn toàn (nhiều máy chủ, cloud đa đối tác), hoặc ngay khi ta muốn một chính sách kiểu _zero trust_, nơi không có dịch vụ nào được mặc nhiên tin tưởng chỉ vì nó nằm "bên trong" mạng.

# Cấp độ 3: các giao thức ứng dụng trên TCP+TLS

Khi đã có vận chuyển và mã hóa, còn phải xác định _cấu trúc các trao đổi như thế nào_. Đây là vai trò của các giao thức ứng dụng.

## HTTP / HTTPS

HTTP là một giao thức yêu cầu-phản hồi: client mở một kết nối (hoặc tái sử dụng một kết nối, với keep-alive), gửi một yêu cầu, chờ phản hồi, kết nối sau đó có thể đóng lại hoặc được tái sử dụng. HTTPS, đơn giản là HTTP trên TLS -- chữ S không thay đổi gì về ngữ nghĩa của giao thức, chỉ thay đổi việc vận chuyển được mã hóa.

Mô hình yêu cầu-phản hồi có một giới hạn cấu trúc: server không bao giờ có thể nói trước. Nó chỉ có thể trả lời những gì client yêu cầu. Đối với việc polling thường xuyên (kiểm tra "có gì mới không?" mỗi giây), nó hoạt động nhưng lãng phí tài nguyên -- mỗi yêu cầu tạo ra chi phí giao thức, và phần lớn thời gian, chẳng có gì mới để thông báo.

## WebSocket (WS / WSS)

WebSocket giải quyết chính xác giới hạn này. Kết nối bắt đầu như một yêu cầu HTTP thông thường (với header `Upgrade: websocket`), nhưng một khi bắt tay được chấp nhận, kết nối TCP bên dưới không còn là một kênh yêu cầu-phản hồi HTTP nữa -- nó trở thành một kênh hai chiều full-duplex nơi client và server có thể gửi thông điệp bất cứ lúc nào, mà không cần phải phát lại một chu trình yêu cầu-phản hồi cho mỗi lần trao đổi.

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

WSS đơn giản là WebSocket trên TLS, giống hệt như HTTPS là HTTP trên TLS. Đây là giao thức được lựa chọn cho mọi thứ cần push server thời gian thực -- chat, thông báo, luồng giao dịch, sự kiện trò chơi -- mà không muốn tự quản lý một giao thức nhị phân trên TCP trần.

## gRPC

Ít được biết đến ngoài thế giới microservices nhưng là trung tâm trong giao tiếp service-à-service: gRPC dựa trên HTTP/2 (do đó TCP + TLS tùy chọn), tuần tự hóa các thông điệp bằng Protocol Buffers (nhị phân, có kiểu, nhỏ gọn - trái ngược với JSON dạng văn bản của hầu hết các API REST), và hỗ trợ streaming hai chiều một cách tự nhiên nhờ ghép kênh của HTTP/2 (nhiều luồng logic trên một kết nối TCP duy nhất, không có head-of-line blocking như nhiều yêu cầu HTTP/1.1 tuần tự).

## QUIC / HTTP3

QUIC thay đổi cuộc chơi bằng cách quay lại dùng UDP thay vì TCP ở tầng vận chuyển, đồng thời tái triển khai các đảm bảo độ tin cậy mà TCP vốn có - nhưng theo từng luồng thay vì toàn cục, điều này loại bỏ head-of-line blocking ở tầng vận chuyển (một gói tin bị mất trên một luồng không còn chặn các luồng khác của cùng kết nối). TLS 1.3 được tích hợp trực tiếp vào QUIC thay vì được thêm lên trên, giúp giảm thêm độ trễ handshake. HTTP/3 là HTTP trên QUIC.

# Tổng quan: mỗi giao thức nằm ở đâu

Tầng Giao thức Vai trò Vận chuyển TCP, UDP Đưa các byte đi, có tin cậy hoặc không Vận chuyển (thế hệ mới) QUIC UDP + độ tin cậy theo luồng + TLS tích hợp Bảo mật TLS, mTLS Mã hóa, toàn vẹn, xác thực (một chiều hoặc lẫn nhau) Ứng dụng HTTP/HTTPS, WS/WSS, gRPC Cấu trúc các trao đổi (yêu cầu-phản hồi, hai chiều, RPC có kiểu)

Một ví dụ cụ thể để cố định ý tưởng: một kiến trúc microservices với dashboard web và các dịch vụ nội bộ có thể kết hợp HTTPS (dashboard ↔ API công cộng, xác thực một chiều là đủ về phía trình duyệt), mTLS (dịch vụ ↔ dịch vụ nội bộ, cần xác thực lẫn nhau), và WSS (thông báo thời gian thực đẩy đến dashboard) -- ba giao thức ứng dụng khác nhau, tất cả đều được xây dựng trên cùng một nền tảng TCP + TLS.

## Cách chọn, trong thực tế

Ba câu hỏi thường đủ để phân định:

1.  **Tôi có cần độ tin cậy và thứ tự, hay tính tươi mới của dữ liệu quan trọng hơn việc giao hàng đảm bảo?** → TCP nếu có, UDP nếu không (hoặc QUIC để có cả hai thông qua một sự đánh đổi khác).
    
2.  **Server có cần có khả năng chủ động gửi tin nhắn, hay client luôn là bên yêu cầu trước?** → WebSocket/gRPC streaming nếu server cần push, HTTP cổ điển nếu không.
    
3.  **Cả hai bên có cần chứng minh danh tính lẫn nhau, hay chỉ một bên cần được xác minh?** → mTLS cho service-à-service trong môi trường zero-trust, TLS đơn giản cho client công cộng cổ điển.
    

Độ phức tạp vận hành tăng lên theo mỗi tầng được thêm vào: TCP trần không có hạ tầng nào để quản lý, TLS cần chứng chỉ, mTLS cần một CA và chiến lược luân chuyển, gRPC cần một định nghĩa lược đồ Protobuf dùng chung. Phản xạ đúng đắn là chỉ tăng độ phức tạp khi tầng bên dưới cho thấy một giới hạn cụ thể, chứ không phải do phòng trước.
