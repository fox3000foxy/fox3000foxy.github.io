---
title: Làm việc trên một Dự án Mới
description: Tổng quan về quy trình khởi động và phát triển một trang web mới.
date: 2026-03-13
tags:
  - meta
  - webdev
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "w9uW7/hWdr06bTChUtP5RB529hWKilvDkEj/zPTIb2VQTBy3MKFGIoqyGp/t+ErCMQdk719TSUWGok+Q9fZF2Q=="
---

# Dự án

Dự án tôi đang làm có tên là LLJT :

![](assets/20260313_092734_image.png)

Đây là một trang web cũng là một PWA, nên có thể dùng như một ứng dụng di động. Nó dùng MaterialUI để hoạt động như một ứng dụng điện thoại thực thụ.
Tôi đã tốn một lúc với các import Mui : tôi đã đi từ 11707 module xuống còn 595 cuối cùng, bằng cách import từng biểu tượng trên từng dòng thay vì dùng import destructuré. Tôi đã học được lúc đó rằng import destructuré tải toàn bộ thư viện biểu tượng, trong khi các import riêng lẻ chỉ tải những biểu tượng được dùng.

Nibi là bot kết nối với trang web này.![](assets/20260313_093102_image.png)Việc chấm điểm dựa trên Google Forms :
![](assets/20260313_093255_image.png)
Chúng tôi dùng trắc nghiệm để đánh giá học viên của mình, và chúng tôi cũng gán vai trò Discord, cùng emoji và kênh, cho các học viên khi họ vượt qua một kỳ thi quan trọng.

![](assets/20260313_093707_image.png)

Mục tiêu của dự án này là giúp mọi người cùng học tiếng Nhật với chúng tôi, vì đó cũng là điều tôi muốn làm.
Các học viên cũng sẽ mở khóa quan hệ đối tác với Crunchyroll và các nền tảng khác, để tưởng thưởng cho tiến trình của họ.

Nibi và trang web lần lượt được host bởi Cloudflare Workers (Interaction URL với Hono Server) và GitHub Pages với React.
Mã nguồn của trang web không phải open source, nhưng Nibi thì có, và bạn có thể tìm thấy nó trên [repo GitHub này](https://github.com/let-s-Learn-Japanese-Together/nibi). Trang web vẫn giữ riêng tư vì nó chứa thông tin riêng tư, nhưng nếu bạn muốn biết tôi đã xây dựng nó thế nào, hãy hỏi tôi trên Discord và tôi sẽ vui vẻ giải thích quy trình! Nó dùng một GitHub Action tôi đã tạo để tránh phải trả tiền GitHub Enterprise, cùng nhiều công cụ và kỹ thuật khác mà tôi có thể mô tả cho bạn nếu bạn quan tâm!

Mấy ngày qua, tôi rất thích tìm các giải pháp lách để host các dự án của mình mà không phải trả phí hosting. Đó là lý do tôi biến Nibi thành một bot Interaction Endpoint, để host nó miễn phí trên Cloudflare Workers, và đã tạo một GitHub Action để deploy trang web miễn phí trên GitHub Pages. Tìm kiếm những lối lách này vẫn là một trong những phần kích thích nhất của code đối với tôi : phải suy nghĩ khác đi và xây dựng các giải pháp sáng tạo, và chính thử thách không ngân sách này là điều thúc đẩy tôi!

Dùng GitHub Actions ngoài mục đích ban đầu của nó, và dùng Cloudflare Workers để "host" một bot, cũng là một cách học những điều mới và khám phá công nghệ mới, như cloud hosting. Tôi không muốn trả tiền hosting nữa.

Tôi vẫn đang làm dở nhưng bạn có thể tham gia [máy chủ Discord](https://discord.gg/frKZ9cJ4fD) nếu muốn theo dõi tiến độ và xem nó tiến triển thế nào, và có thể tham gia dự án nếu bạn quan tâm! Máy chủ mở cho mọi người, và chúng tôi muốn có thêm người cùng học tiếng Nhật với nhau! Bạn sẽ tìm thấy link mời trên trang web, hoặc bạn có thể hỏi trực tiếp tôi!
