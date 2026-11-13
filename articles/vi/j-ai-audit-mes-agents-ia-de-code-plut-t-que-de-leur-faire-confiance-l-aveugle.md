---
title: "Tôi đã kiểm toán các tác nhân AI lập trình của mình thay vì tin chúng một cách mù quáng"
description: "Cách hai cuộc kiểm toán thực hiện để viết báo cáo kỹ thuật lần thứ 4 của nền tảng giao dịch của tôi đã cho tôi thấy hai xu hướng lệch lạc khác nhau: một tác nhân quên vì repo không còn vừa trong cửa sổ ngữ cảnh của nó, và một tác nhân viết nhiều gấp mười lần số mã cần thiết vì không có gì thúc nó ngắn gọn."
date: 2026-09-15
tags: ["ai", "llm-agents", "code-review", "context-window", "trading", "typescript"]
authors: ["docteur-turboss"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "oCz69AI/GyBQxwntfZas9VsVN2Qi1azL70uW6MUfh/vapzdcvrt+lzpDK1W/YsnHNGwiXek3aCF/zArpvClz5Q=="
---
## Triệu chứng trước chẩn đoán

Mỗi lần xuất bản báo cáo kỹ thuật của nền tảng đều bắt tôi phải duyệt lại toàn bộ kiến trúc: dịch vụ, tác nhân, pipeline dữ liệu. Khi chuẩn bị ấn bản lần thứ 4, khối lượng repo cuối cùng đã đập vào mắt tôi, trong khi tôi đã thấy nó phình ra dần mà không bao giờ dừng lại nhìn kỹ: repo này ban đầu chỉ vài nghìn dòng, chưa tới 10ko, giờ đã đạt 100Mo. Nền tảng hầu như không có thêm tính năng nào. Tôi chỉ đơn giản dựa vào các tác nhân kiểu Claude Chat để triển khai và sửa mã, mà không định rõ chính xác tôi yêu cầu chúng điều gì hay trên phạm vi nào.

Viết báo cáo buộc tôi thoát khỏi chế độ "cứ tiến lên" để chuyển sang chế độ "chuyện gì thực sự đã xảy ra". Tôi đã thực hiện hai cuộc kiểm toán riêng biệt trên lịch sử repo. Cả hai đều chỉ về cùng một nguyên nhân, vì hai lý do hoàn toàn khác nhau.

## Kiểm toán số 1: cửa sổ ngữ cảnh nói dối

Kiểm toán đầu tiên là xem lại, dịch vụ theo dịch vụ, các bản sửa mà một tác nhân AI đã làm trong nhiều tháng, và kiểm tra xem chúng có nhất quán với phần còn lại của repo tại thời điểm áp dụng hay không.

Môtíp cứ lặp lại: tác nhân sửa một vấn đề cục bộ, trong tệp hoặc mô-đun ngay trước mắt nó, mà không hề thấy chỗ tương đương ở nơi khác trong repo, hoặc không nhớ ra. Kết quả: cùng một interface được định nghĩa lại hơi khác nhau trong hai dịch vụ, một lần đổi tên chỉ áp dụng một nửa vì lần xuất hiện thứ hai nằm ngoài cửa sổ ngữ cảnh tại thời điểm prompt, một quy ước đặt tên được tôn trọng trong mô-đun này và bị bỏ qua ở mô-đun kế tiếp. Không có gì ngoạn mục khi nhìn riêng lẻ, nhưng cộng dồn qua hàng chục phiên, nó tạo ra đúng sự dư thừa và code smell khiến công cụ tiếp theo chạy lên đó mất dấu. Một vòng tròn tự nuôi: repo càng phình và phân mảnh, tác nhân càng khó giữ toàn bộ trong đầu, các bản sửa càng cục bộ và manh mún, repo càng phình.

Vấn đề không phải là tác nhân "nói dối" hay bịa đặt; nó trả lời đúng câu hỏi được đặt ra trên ngữ cảnh được đưa cho nó. Vấn đề là phần lớn thời gian tôi chưa bao giờ định nghĩa trước phạm vi của câu hỏi. Tôi yêu cầu "sửa lỗi chính tả, hành vi, hàm này" mà không tự hỏi liệu lỗi đó có phiên bản tương đương ở nơi khác trong repo mà tác nhân không thể thấy hay không.

## Kiểm toán số 2: khi sự dài dòng biến thành mã nguồn

Kiểm toán thứ hai mang tính cơ học hơn: chạy `git log --numstat` trên toàn bộ lịch sử, cộng dồn số dòng thêm vào và số ký tự thêm vào theo commit rồi nhìn phân bố.

30 commit lớn nhất về số dòng thêm vào, tự chúng đã chiếm một phần quá lớn trong tổng khối lượng repo. Luôn là đúng những commit đó cũng nổi lên là lớn nhất về số ký tự thêm vào. Điều này dễ đoán, chỉ có điều tỷ lệ ký tự/dòng của những commit đó không chỉ liên quan tới số dòng: bản thân các dòng cũng dài dòng hơn, với nhiều comment giải thích dư thừa so với tên hàm, nhiều khối xử lý lỗi trùng lặp thay vì được tách ra, nhiều docstring diễn đạt lại cùng một điều ba lần.

Đó là hậu quả trực tiếp của một hành vi quen thuộc khi tương tác với LLM qua chat: nếu không có chỉ dẫn ngắn gọn rõ ràng, nó có xu hướng nói nhiều, biện minh, comment, diễn đạt lại. Trong hội thoại, việc đó tốn token đầu ra. Trong sinh mã, cùng phản xạ đó biến thành những dòng nằm lại trong repo vô thời hạn, commit này qua commit khác, mà không ai đọc lại thật sự chừng nào mã còn chạy.

## Khi đặt hai cuộc kiểm toán cạnh nhau, chúng cho thấy điều gì

Đối với báo cáo đầu tiên: tính nhất quán giữa các dịch vụ chịu thiệt vì cửa sổ ngữ cảnh quá nhỏ để chứa toàn bộ repo, dẫn tới các bản sửa cục bộ, dư thừa và lệch quy ước.

Đối với báo cáo thứ hai: `git log --numstat` cho thấy sự dài dòng mặc định của một LLM không được định hướng, gây ra số dòng và ký tự thêm vào quá lớn và mã ít được tách gọn.

Cả hai gộp lại chỉ ra sự dư thừa và khối lượng: điều này tạo ra một repo quá lớn để một tác nhân tương lai giữ trong đầu, làm trầm trọng thêm vấn đề đầu tiên mà kiểm toán thứ nhất đã nêu.

Chính dòng cuối này khiến tôi lo nhất khi viết báo cáo: hai vấn đề liên kết với nhau, chúng nuôi lẫn nhau. Mã sinh ra càng dài dòng, repo phình càng nhanh; càng phình, tác nhân càng khó giữ trong ngữ cảnh; càng khó giữ trong ngữ cảnh, các bản sửa càng cục bộ và dư thừa; càng dư thừa, khối lượng càng tăng. Một vòng phản hồi tiêu cực, hoàn toàn do dùng tác nhân mà không định hướng.

## Vì sao đây không phải lỗi nhất thời của một công cụ cụ thể

Không có gì trong chẩn đoán này đặc thù cho một mô hình hay sản phẩm nào. Một tác nhân kiểu chat, dù là loại nào, cũng vận hành trên những gì người ta cho nó thấy trong cửa sổ tại thời điểm T, và mặc định sinh ra câu trả lời đầy đủ và có lý lẽ nhất có thể. Đó chính xác là hành vi mong đợi của một trợ lý hội thoại, và chính xác là điều cần tránh ở một công cụ viết vào repo production. Vấn đề nằm ở chỗ thiếu định hướng giữa công cụ và repo: phạm vi tệp cần xem xét, định dạng đầu ra mong đợi, ngân sách dòng hay mức dài dòng, nghĩa vụ trích dẫn chính xác những gì đã tồn tại trước khi viết thêm điều mới.

## Những gì tôi đã thay đổi từ đó

Phản xạ logic lẽ ra là cắt giảm mạnh những gì đã viết. Cá nhân tôi quyết định làm khác. Các cuộc kiểm toán giúp tôi làm việc khác: quét mã để tìm code smell, và dùng chúng để khoanh vùng chính xác vấn đề thực sự nằm ở đâu. Những chỗ không nhất quán giữa các dịch vụ, những chỗ dư thừa, những nơi mất dấu, thay vì đoán mò. Khối lượng mã viết ra về cơ bản vẫn giữ nguyên: dài dòng hay không, nó vẫn hữu ích nếu được dùng đúng. Đòn bẩy là biết chính xác nhìn vào đâu để sửa những chỗ chưa khớp, thay vì ngăn tác nhân viết.

## Bước tiếp theo

Chia repo thành các đơn vị nhỏ hơn và được giới hạn rõ hơn. Cùng với đó là các chốt chặn production cho thực thi và tài liệu. Vấn đề đặt ra tiếp theo là một câu hỏi kiến trúc: làm sao phân tích, phê bình và cho các dịch vụ, thành phần và tài liệu giao tiếp sạch sẽ với nhau, khi một khi tách ra chúng vẫn phải phối hợp quyết định mà không quay lại cùng một khối monolith như trước.
