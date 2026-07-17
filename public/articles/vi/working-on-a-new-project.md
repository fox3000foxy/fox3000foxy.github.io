---
title: Làm việc trên một Dự án Mới
description: Tổng quan về quy trình khởi động và phát triển một trang web mới.
date: 2026-03-13
authors:
  - fox3000foxy
tags:
  - meta
  - webdev
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "ICEZeukm4BDCst7cACQAXX1g8ASu02foxLuf5NFRY2oFBSDZ4fz7/jv3CWbttg5IsiMaTARWJ1COpuftmz4cFQ=="
---

# Dự án

Dự án tôi đang làm tên là LLJT:

![](assets/20260313_092734_image.png)

Đây là một trang web đồng thời cũng là một PWA, tức cũng là một ứng dụng di động. Nó sử dụng MaterialUI để tạo cảm giác như một ứng dụng điện thoại thực thụ.
Gần đây tôi đã phải xử lý vấn đề import Mui, và tôi đã giảm từ 11707 modules xuống chỉ còn 595, bằng cách import từng icon thủ công từng dòng một, thay vì dùng import destructured: tôi đã học được rằng khi bạn dùng import destructured, bạn thực ra đang tải toàn bộ thư viện icon, trong khi nếu import từng cái riêng lẻ, bạn chỉ import những cái mình cần.

Nibi là bot kết nối với trang web này.![](assets/20260313_093102_image.png)Thang điểm dựa trên Google Forms:
![](assets/20260313_093255_image.png)
Chúng tôi sử dụng bài trắc nghiệm để đánh giá học viên, và cũng trao vai trò Discord, cũng như emoji và kênh trò chuyện, cho học viên nếu họ vượt qua một kỳ thi quan trọng.

![](assets/20260313_093707_image.png)

Mục tiêu của dự án này là giúp mọi người học tiếng Nhật cùng với chúng tôi, vì đó cũng là điều tôi muốn tự mình thực hiện.
Các học viên cũng sẽ mở khóa được các hợp tác với Crunchyroll và các nền tảng khác, để thưởng cho kỹ năng của họ.

Nibi và trang web lần lượt được lưu trữ bởi Cloudflare Workers (Interaction URL với Hono Server) và GitHub Pages với React.
Mã nguồn của trang web không phải mã nguồn mở, nhưng Nibi thì có, và bạn có thể tìm thấy nó trên [kho GitHub này](https://github.com/let-s-Learn-Japanese-Together/nibi). Trang web không phải mã nguồn mở vì nó chứa thông tin riêng tư, nhưng nếu bạn muốn biết cách tôi xây dựng nó, bạn có thể hỏi tôi qua Discord hoặc cách khác, và tôi sẽ sẵn lòng chia sẻ quy trình! Nó thực sự sử dụng một GitHub Action mà tôi đã tạo để không phải trả tiền cho GitHub Enterprise, và nó cũng sử dụng nhiều công cụ và kỹ thuật thú vị khác mà tôi có thể chia sẻ nếu bạn quan tâm!

Mấy ngày gần đây, tôi thực sự rất thích tìm các giải pháp vòng vo để tránh phải lưu trữ dự án và trả tiền hosting. Đó là lý do tôi biến Nibi thành bot Interaction Endpoint, để nó có thể được lưu trữ miễn phí trên Cloudflare Workers, và tôi cũng tạo một GitHub Action để triển khai trang web miễn phí lên GitHub Pages, để không phải trả tiền hosting. Tôi thấy rằng tìm giải pháp vòng vo là một trong những phần thú vị nhất của việc code, và đó là điều tôi vô cùng trân trọng! Bạn phải suy nghĩ sáng tạo và tìm ra những giải pháp độc đáo cho vấn đề, và đó là điều tôi yêu thích. Nó không chỉ là việc viết code, mà là tìm cách để mọi thứ hoạt động mà không tốn tiền, và đó là một thử thách tôi thực sự đánh giá cao!

Sử dụng GitHub Actions theo cách không được thiết kế riêng, và dùng Cloudflare Workers để "lưu trữ" bot, cũng là một cách để học hỏi những điều mới và khám phá công nghệ mới, như cloud hosting, điều mà tôi cũng rất quý. Tôi thực sự không muốn trả tiền cho hosting nữa.

Tôi vẫn đang làm việc trên nó nhưng bạn có thể tham gia [server Discord](https://discord.gg/frKZ9cJ4fD) nếu bạn muốn theo dõi tiến độ và xem mọi thứ phát triển, và thậm chí có thể tham gia dự án nếu bạn quan tâm! Server mở cửa cho tất cả mọi người, và chúng tôi rất muốn có thêm nhiều người đồng hành trong hành trình học tiếng Nhật cùng nhau này! Bạn có thể tìm thấy link mời trên trang web, hoặc bạn có thể hỏi tôi nếu muốn!
