---
title: AI học PvP Minecraft -- Imitation Learning, Reinforcement Learning, và 30 biến đáng kể
description: "1 000 trận đấu ghi lại, mạng nơ-ron huấn luyện trên pixel, 90 % độ chính xác đòn đánh : mà bot lao thẳng vào tường. Rồi tới RL, học theo chương trình và 60 giờ huấn luyện."
date: 2026-07-09
tags:
  - minecraft
  - ai
  - python
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "rE+RlM74ZX3XU92sAa7Kr9d7bqYMLUH8Kuqc7NrUA+T42A7j6RHns71cCyIEaad4TJfJWluhsssRX1HjaCkpzA=="
---

## Giới thiệu

![AI Learns Minecraft PvP thumbnail](assets/ai-pvp-thumbnail.png)

Có một video tên [AI Learns Minecraft PvP (Reinforcement Learning + Behavior Cloning)](https://www.youtube.com/watch?v=j5nxDKAjg6U) của Kadambi | AI Engineering, và đó là một trong những câu chuyện trung thực nhất về huấn luyện AI game tôi từng thấy.

Nguyên tắc : dựng bot chơi PvP Minecraft (kit kiếm, giáp kim cương full enchant) bằng cách nhìn màn hình và gửi lệnh chuột với bàn phím. Nó chỉ chạy với pixel làm đầu vào và hành động làm đầu ra, không đọc bộ nhớ game, không macro và không mod.

Điều khiến video thú vị không phải kết quả cuối. Mà là hành trình : thất bại của imitation learning, chuyển hướng sang feature engineering, các chu kỳ quên thảm khốc, và 60+ giờ huấn luyện trên laptop không GPU.

## Giai đoạn 1 : Imitation Learning (thất bại)

![Bot lúc imitation learning: đối mặt tường, nhảy lên nhảy xuống](assets/ai-pvp-imitation-fail.png)

Người sáng tạo khởi đầu với cách hợp lý : ghi 1 000 trận đấu từ chính gameplay của mình, gắn mỗi cú bấm chuột và phím nhấn với hình ảnh tương ứng, và huấn luyện mạng nơ-ron đoán hành động từ pixel.

```python
# Pseudocode for the imitation learning pipeline
dataset = record_duels(1000)          # hundreds of thousands of frames
for frame, action in dataset:
    pixels = capture_screen(frame)
    network.train(pixels → action)    # predict keyboard/mouse from image
```

Mạng đã học đoán đòn đánh với **90 % độ chính xác**. Đầy hứa hẹn.

Rồi họ test nó trong trận thật. Bot đi thẳng tới mép bản đồ, đối mặt tường, và nhảy lên nhảy xuống.

Vì sao?

**Bẫy lười biếng.** Trong trận PvP, phím W giữ phần lớn thời gian. Mạng nhận ra nó có thể đạt độ chính xác cao chỉ bằng cách giữ W và không làm gì khác. Nó tối ưu hành động thường gặp nhất mà hại mọi hành động khác.

**Độ trễ con người.** Các hành động trong dataset trễ khoảng 200 ms thời gian phản ứng con người. Từng ảnh một, nguyên nhân và kết quả gần như không thể học với mô hình từ pixel thô khi hành động và hệ quả thấy được của nó cách nhau nhiều ảnh.

**Demo không nhất quán.** Chính gameplay của người sáng tạo thay đổi : đôi khi anh ấy strafe bằng bàn phím, đôi khi ngắm bằng chuột trong tình huống giống hệt. Các đầu vào mâu thuẫn này làm rối mạng.

## Giai đoạn 2 : Reinforcement Learning với chương trình

![Bot học bám ngang lúc huấn luyện RL](assets/ai-pvp-rl-horizontal.png)

Bỏ imitation learning, người sáng tạo chuyển sang RL. Nhưng thả tác nhân non vào trận PvP đầy đủ là vô ích : quá nhiều thứ cùng lúc để khám phá ngẫu nhiên tìm được gì.

Giải pháp : **học theo chương trình**. Tách từng cơ chế và để bot nắm vững nền trước khi vào trận thật.

### Bước 1 : Ngắm ngang (7 giờ)

Hàm thưởng đơn giản nhất : thưởng dương khi chạm mục tiêu, phạt âm khi chịu sát thương.

Ban đầu, bot hầu như không động (mạng nơ-ron khởi tạo với giá trị trung tính). Nó run ngang : đó là bot thử các hành động khác nhau để xem cái nào cho thưởng.

Sau một giờ, nó học căn giữa ngang, nhưng chậm đau đớn. Sau 7 giờ, nó có thể theo địch sang trái và phải, dù bất đối xứng (giỏi di chuyển từ phải sang trái hơn từ trái sang phải, hành vi bám suốt quá trình huấn luyện).

### Bước 2 : Feature Engineering

Ảnh chụp màn hình thô hơn 2 triệu pixel. Ngay cả rút còn 360p, vẫn là 200 000 đầu vào : quá nhiều cho học hiệu quả.

Người sáng tạo đã phân tích hàng nghìn trận đấu và xác định **30 biến thực sự đáng kể**, chia thành ba nhóm :

**Thị giác (bám địch)** :
- Khoảng cách của địch so với tâm ngắm (crosshair)
- Kích thước hộp bao của địch
- Chiều cao của địch
- Trạng thái tâm ngắm (trên mục tiêu / ngoài mục tiêu)
- Vận tốc tương đối

Thay vì xử lý toàn bộ ảnh, bot lọc pixel nghiêm ngặt theo màu giáp địch, khiến phát hiện gần như tức thì. Các khối nền màu tương tự có thể nhiễu bộ lọc này : nhưng trong Minecraft, ta có thể đơn giản đổi texture.

**OCR (đọc HUD)** :
Vì bot không thể lấy tọa độ từ mã game, nó quét màn hình thời gian thực để trích :
- Pitch của camera
- Momentum
- Mức Y

OCR chuẩn chật vật với văn bản trong suốt của Minecraft, nên dữ liệu then chốt bị ép thành đen trắng để đọc tức thì.

**Thời gian (cửa sổ ngữ cảnh)** :
- Thời gian trôi từ khi bạn chạm địch
- Thời gian trôi từ khi nó chạm bạn
- Bộ đệm trượt các hành động trước của bot

Việc này cho mạng ngữ cảnh thời gian : không có nó, bot không biết nó đang giữa combo hay vừa bắt đầu trận.

### Bước 3 : Ngắm dọc (7 giờ nữa)

![Bot học ngắm lên xuống lúc huấn luyện RL](assets/ai-pvp-rl-vertical.png)

Thêm chuyển động chuột dọc lúc đầu là « thảm họa toàn diện ». Hiệu năng ban đầu vỡ nát.

Sau thêm một giờ trong hộp cát, bot đã hiểu cách nhìn lên và xuống. Nhưng trong quá trình đó, nó hoàn toàn quên cách bám ngang.

Đó là **quên thảm khốc** : vấn đề kinh điển của học máy nơi tối ưu cho dữ liệu mới xóa đè biểu diễn đã học trước. Khi tối ưu ngắm dọc, mạng nơ-ron vô tình xóa tiến triển ngang, để lại cho người sáng tạo bot có thể giữ tâm ngắm ngang mà không thể theo mục tiêu.

Phải mất **6 giờ nữa** để lấy lại bám ngang trong khi giữ điều khiển dọc. Bot sau đó giữ vị trí tâm ngắm tốt nhờ nhóm OCR trích pitch camera.

### Bước 4 : Điều khiển bàn phím

![Bot bật tắt phím W liên tục, học cam kết di chuyển](assets/ai-pvp-keyboard.png)

Cho bot quyền dùng bàn phím khiến đặc trưng thời gian càng then chốt. Lúc đầu, phím W liên tục bật tắt : thay đổi nhanh vì mạng chưa học cam kết.

Hành vi này bị phạt, nên bot học làm mượt nó. Nó bắt đầu trúng nhiều đòn hơn khi chạy nước rút (tiếng thịch so với tiếng vút của đòn đứng yên). Vài combo trông chưa thỏa mãn vì bot khai thác lợi thế tầm đánh lên địch.

Để công bằng, người sáng tạo tăng tầm đánh của địch. Nhiều chiến lược bot học được ngừng chạy. Nhưng theo thời gian, nó thích ứng.

### Bước 5 : Dạy bot khi nào bấm

Cho giai đoạn cuối, người sáng tạo mang imitation learning về : nhưng chỉ để dạy thời điểm bấm, không phải chính sách điều khiển đầy đủ. Bot cố bắt chước mẫu bấm của các trận đấu ghi lại.

Ban đầu, nó quá sợ thử bất cứ gì, sợ bị phạt vì bấm sai. Nhưng cuối cùng nó lấy can đảm đánh và trúng đòn. Tất nhiên, nó lại quên cách ngắm trong quá trình : người sáng tạo phải để nó yên thêm **50 giờ nữa** để về trạng thái ưng ý.

## Tranh luận gian lận

Video kết thúc bằng câu hỏi : bot này có gian lận không?

Lập luận chống : bot chỉ xử lý điều con người thấy (cùng pixel), gửi cùng đầu vào bàn phím/chuột như con người (không thao tác gói như anti-knockback), và không đọc bộ nhớ game (không X-ray hay ESP).

Lập luận thuận : bot có thể xử lý nhanh hơn con người, và nếu đối thủ tưởng mình chơi với con người mà thực ra không, đó là lừa dối.

Ý kiến người sáng tạo : tùy ý định. Nếu cả hai bên biết đó là bot, trận công bằng. Bot xích địch bay trong không trung bằng chuỗi 100 đòn.

## Kết quả

![Bot thực hiện combo 100 đòn](assets/ai-pvp-final-combo.png)

Bot PvP Minecraft huấn luyện trên **laptop không GPU**, dựng trên pipeline huấn luyện tùy chỉnh với :

- **Chụp màn hình** cho đầu vào pixel (2M+ pixel → 30 đặc trưng thiết kế)
- **Học theo chương trình** (ngang → dọc → bàn phím → bấm)
- **RL cho điều khiển vận động** + **imitation learning cho thời điểm bấm**
- **Feature engineering** trên pixel thô (3 nhóm : thị giác, OCR, thời gian)
- **60+ giờ huấn luyện** qua nhiều giai đoạn

Tổng thời gian huấn luyện hàng chục giờ, nhưng phần lớn thụ động. Bot run tới khi hiểu, quên điều đã học, học lại, và cuối cùng xích chuỗi 100 đòn.

Video ở [youtube.com/watch?v=j5nxDKAjg6U](https://www.youtube.com/watch?v=j5nxDKAjg6U).

---

*Bài này chỉ bao quát nội dung video. Để có bối cảnh rộng hơn về AI Minecraft : VPT, DreamerV3, và toàn cảnh imitation learning đấu RL : các mục bên dưới nối dự án này với lĩnh vực rộng hơn.*

## VPT : Behavior cloning ở quy mô lớn

![Sơ đồ dự án VPT của OpenAI : Inverse Dynamics Model đoán hành động từ cặp frame](assets/vpt-overview.svg)

Cách « behavior cloning » của video (Giai đoạn 1) là cùng kỹ thuật OpenAI dùng trong dự án **Video PreTraining (VPT)** của họ, nhưng ở hai đầu đối diện của phổ tài nguyên. VPT đã chứng minh imitation learning chạy được cho Minecraft khi bạn có 70 000 giờ video, 720 GPU, và inverse dynamics model để gán nhãn giả cho dữ liệu không nhãn. Người sáng tạo ở đây đã chứng minh nó thất bại với laptop và 1 000 trận đấu : nhưng vì cùng lý do nền : imitation learning bị giới hạn bởi chất lượng demo của nó.

![Tác nhân VPT của OpenAI đào cây trong Minecraft](assets/vpt-minecraft.jpg)

Pipeline VPT giải bài toán dữ liệu bằng cách huấn luyện **Inverse Dynamics Model (IDM)** nhìn ảnh t-1 và ảnh t+1 để đoán hành động ở ảnh t. Vì IDM phi nhân quả (nó thấy ảnh tương lai), nhiệm vụ dễ hơn behavior cloning và cần ít dữ liệu gán nhãn hơn nhiều. Họ trả nhà thầu khoảng 2 000 $ cho 2 000 giờ dữ liệu gán nhãn, rồi dùng IDM để gán nhãn giả 70 000 giờ video YouTube Minecraft.

![Tỷ lệ craft/thu thập theo khối lượng dữ liệu tiền huấn luyện (thang log) : bàn craft, công cụ gỗ, công cụ đá](assets/vpt-stone-pickaxe-sequence.svg)

Hiệu ứng quy mô rõ : trên trục log từ 1 giờ tới 100 000 giờ dữ liệu tiền huấn luyện, tỷ lệ mô hình chế bàn craft, công cụ gỗ, rồi công cụ đá leo theo bậc. Mô hình chỉ huấn luyện trên 2 000 giờ nhà thầu gán nhãn trần ở bàn craft ; chính khi thêm 70 000 giờ IDM gán nhãn giả (đường đứt nét trên đồ thị) công cụ đá mới nổi lên zero-shot, không một bước RL nào.

Mô hình nền 0,5B tham số kết quả đạt khả năng zero-shot không thể với chỉ RL : chặt cây, chế bàn, nhảy cột : và fine-tune bằng RL, nó thành AI đầu tiên chế công cụ kim cương.

![Thưởng theo số episode huấn luyện RL : khởi đầu từ mô hình khởi tạo ngẫu nhiên đấu khởi đầu từ mô hình VPT tiền huấn luyện](assets/vpt-diamond-pickaxe-sequence.svg)

Đồ thị này cho thấy vì sao tiền huấn luyện đổi tất cả cho RL phía sau. RL khởi đầu từ mạng khởi tạo ngẫu nhiên (cam) nằm phẳng gần 0 suốt gần một triệu episode : nhiệm vụ « lấy kim cương » có thưởng quá thưa để tác nhân ngây thơ tình cờ vớ được qua khám phá ngẫu nhiên. RL fine-tune từ mô hình VPT tiền huấn luyện (xanh lá) khởi đầu đã có hành vi nền (đào, chế, khám phá) và leo đều tới thưởng khoảng 25, khớp đường đầy đủ tới cuốc kim cương.

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/719971231?h=cbdf2617a1" title="VPT agent gameplay demo 1" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045834?h=9cb4118c65" title="VPT agent gameplay demo 2" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045849?h=00398908ed" title="VPT agent gameplay demo 3" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045863?h=060f07e290" title="VPT agent gameplay demo 4" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

*Demo video chính thức của dự án VPT của OpenAI, cho thấy tác nhân đang hoạt động.*

## OpenAI Five : Bài toán định hình thưởng

![OpenAI Five chơi Dota 2 với tuyển thủ chuyên nghiệp](assets/openai-five-dota2.jpg)

OpenAI Five (2019) đã thắng nhà vô địch thế giới Dota 2 bằng RL thuần tự chơi : không imitation learning. 256 GPU, 128 000 lõi CPU, 180 năm game mỗi ngày, 10 tháng huấn luyện.

Nhưng hàm thưởng được thiết kế tay bởi chuyên gia Dota : **28 đặc trưng trên 20 000 có sẵn**, mỗi cái với trọng số chỉnh tay. Giá trị ròng, mạng hạ, mạng chết, máu trụ, phân công lane : mọi thứ được con người chọn và cân. Không có mô hình này, tác nhân hầu như không học (thí nghiệm : chỉ thưởng thắng/thua → trần ở cấp bán chuyên).

Bot của video đối mặt cùng bài toán : hàm thưởng của nó mã hóa hiểu biết của người sáng tạo về điều đáng kể trong PvP (chạm là tốt, bị chạm là xấu, giữ tâm ngắm là tốt). Điều này không tránh được : RL cần tín hiệu thưởng, và mô hình hóa tín hiệu đó mã hóa thiên kiến con người.

## DreamerV3 : World model và thưởng thưa

![Điểm benchmark DreamerV3 trên hơn 150 tác vụ đa dạng với một cấu hình duy nhất](assets/dreamerv3-benchmarks.png)

DreamerV3 của DeepMind (2023) theo cách thứ ba. Thay vì behavior cloning hay RL với khuyến khích, nó học **world model** : mạng nơ-ron đoán trạng thái tương lai và thưởng từ hành động quá khứ : và lập kế hoạch bằng cách mơ các tương lai khả dĩ. Đó là thuật toán đầu tiên thu kim cương trong Minecraft từ con số không không cần dữ liệu con người hay chương trình, đăng trên Nature năm 2025.

![DreamerV3 học world model để tưởng tượng quỹ đạo tương lai](assets/dreamerv3-header.png)

Môi trường kim cương định nghĩa thưởng thưa trên 12 cột mốc (gỗ → ván → gậy → bàn craft → cuốc gỗ → đá → cuốc đá → quặng sắt → lò → thỏi sắt → cuốc sắt → kim cương), mỗi cái cho +1 một lần duy nhất. Cộng thưởng máu nhỏ (±0,01 cho mỗi máu). Tổng đạt được : 11,1 trong episode 36 000 bước.

World model của DreamerV3 cho phép nó tưởng tượng quỹ đạo và đánh giá chúng nội tại : tác nhân học từ rollout mơ thay vì kinh nghiệm thật, thử hàng nghìn tương lai khả dĩ cho mỗi bước thật. Việc này khiến thưởng thưa khả thi nơi chúng sẽ hủy tác nhân RL chuẩn.

Trên 40 seed huấn luyện cho 100M bước môi trường, 24 trong 40 thu ít nhất một kim cương. Viên kim cương đầu xuất hiện sau 29M bước (~9 ngày trên GPU).

## ANNA : AI ký hiệu gặp Minecraft

![Phân rã cây nhiệm vụ của ANNA cho đá lửa](assets/anna-task-tree.png)

Trước bot PvP của video, trước VPT và DreamerV3, có **ANNA** : bot Minecraft dựng với triết lý hoàn toàn khác. Thay vì học từ pixel hay thưởng, ANNA dùng **máy trạng thái ký hiệu** với **bộ phân tích NLP tiếng Pháp** và **cây phụ thuộc nhiệm vụ** viết tay.

Tạo năm 2022 (trước khi « vibe coding » thành thuật ngữ), ANNA nối tới máy chủ Minecraft qua Mineflayer và hiểu lệnh ngôn ngữ tự nhiên bằng tiếng Pháp. Nói *« kiếm đá lửa », và ANNA phân tích động từ (kiếm → lấy), tìm công thức vật phẩm, và rã đệ quy thành nhiệm vụ con : đào sồi → chế ván → chế gậy → chế bàn craft → chế cuốc gỗ → đào đá → chế cuốc đá → đào quặng sắt → nung thỏi sắt → chế đá lửa.

![Kiến trúc bộ phân tích NLP của ANNA cho nhận diện lệnh tiếng Pháp](assets/anna-nlp-diagram.png)

Lớp NLP (`utils/id_parser.js`) tách lệnh trên « et » để xử lý lệnh song song, gắn động từ Pháp với kiểu nhiệm vụ, và dịch tên vật phẩm Pháp sang định danh Minecraft qua từ điển 5 000 mục. Các lệnh không nhận ra chuyển tới hệ thống hội thoại dựa trên GPT giới thiệu ANNA như bạn đồng hành Minecraft có ý thức.

**Cây nhiệm vụ** (`mc-tasks-tree/`) là lõi : thuật toán đệ quy duyệt đồ thị vật phẩm Minecraft (công thức craft, sản lượng đào, rơi quái, công thức lò) để cho ra kế hoạch từng bước. Với mũ kim cương, nó sinh phân rã hơn 40 bước phủ các cấp gỗ, đá, sắt và kim cương.

![Cây nhiệm vụ mũ kim cương của ANNA : phân rã hơn 40 bước](assets/anna-diamond-helmet.png)

Nơi bot PvP của video học từ kinh nghiệm, ANNA chạy từ tri thức. Nó không cần 1 000 trận đấu hay 60 giờ huấn luyện : nó cần cây, bộ phân tích và máy chủ/nhà phân phối. Nhưng nó cũng không thể khái quát vượt điều cây của nó mã hóa. Không lượng kỹ thuật máy trạng thái nào dạy nó PvP.

Cách của ANNA phản ánh thời khác của AI : trước khi học đầu cuối thống trị, khi lời hứa là suy luận ký hiệu cộng kỹ thuật cẩn thận có thể cho ra hành vi thông minh. Ngày nay, các dự án như ANNA và bot PvP đại diện hai cực của AI Minecraft : một bên suy luận về thế giới, một bên cảm nhận nó.

## Mace Bot của Master Gumbo : AI chỉ bằng command block

![Sân huấn luyện PvP Mace với bot](assets/mace-bot-arena.png)

Ở góc hoàn toàn khác của AI Minecraft, YouTuber **Master Gumbo** đã dựng bot huấn luyện PvP chỉ dùng **command block**, thuần lệnh Minecraft vanilla, redstone, và carpet mod cho thực thể nhái người chơi. Kết quả là đối thủ AI cho số đông luyện đổi breach, lao gió và cơ chế khiên với người chơi.

Bot khởi đầu là zombie với trang bị không thể phá và totem ở tay phụ (nạp mỗi tick qua `/item replace`), khiến nó thực tế bất tử. Sau này, Master Gumbo chuyển sang bot **Carpet Mod's player replica**, hỗ trợ cơ chế giống người (giơ khiên, đổi vật phẩm) mà zombie không làm được.

![Trung tâm cài đặt : nút cấu hình hành vi bot](assets/mace-settings-center.png)

Đổi mới trung tâm là **máy trạng thái dẫn bằng ngẫu nhiên**. Giá giáp được dịch chuyển lên trên vòng tròn khối bê tông màu qua lệnh `/spreadplayers`, rải thực thể ngẫu nhiên. Màu của khối bê tông nơi giá giáp đáp xuống quyết hành động tiếp của bot :

- **Bê tông đỏ** → strafe lùi
- **Bê tông xanh** → bay lên (tấn công) bằng lao gió
- **Bê tông xanh lá** → giơ khiên
- **Bê tông trắng** → nghỉ (thêm trễ giữa các hành động)

![Hệ quyết định AI : giá giáp trên bê tông màu](assets/mace-ai-system.png)

Vị trí giá giáp được command block đọc để phát hiện khối bên dưới và kích hoạt cơ chế tương ứng. Khối redstone được đặt hay gỡ để bật/tắt mỗi hành vi. Vì `/spreadplayers` chạy lặp lại, bot liên tục ra quyết định mới, tạo hành vi không đoán được mà có cấu trúc.

Master Gumbo gọi đây là « dạng AI rất đơn giản và cơ bản » : nó không học từ tương tác như mạng nơ-ron, nhưng ngẫu nhiên + máy trạng thái cho ra hành vi PvP thực tế khó đoán hơn bot viết kịch bản. Trung tâm tham số gồm giao diện sách để bật/tắt AI, chỉnh độ khó và cấu hình mẫu di chuyển.

Sau khi họ luyện với bot rồi đấu tay đôi với người chơi từng chê anh ta gà (trong intro video của anh ấy), Master Gumbo thắng. Bản đồ chia sẻ qua Discord, đòi Carpet Mod.

![Bot trong trận tay đôi, luyện kỹ thuật PvP mace](assets/mace-final-duel.png)

Nơi bot PvP (Kadambi) học từ pixel và ANNA suy luận qua cây nhiệm vụ, bot của Master Gumbo đạt trí tuệ bằng **chuyển trạng thái ngẫu nhiên** : cách thuần command block chứng minh bạn không cần mạng nơ-ron để dựng đối thủ PvP thuyết phục.

## Altoclef : Baritone + cây nhiệm vụ quy mô lớn

Nếu ANNA là bot ký hiệu *đọc* để biết phải làm gì, và Mace Bot ngẫu nhiên hóa quyết định, **Altoclef** là tác nhân tự chủ đầy đủ *lập kế hoạch* đường qua cả game. Do gaucho-matero dựng thành mod Fabric và chạy bằng pathfinding **Baritone**, Altoclef rã bất kỳ mục tiêu Minecraft nào thành cây nhiệm vụ và thực thi không can thiệp con người.

Giao diện lừa đơn giản : gõ `@gamer` trong chat, và Altoclef bắt đầu nhiệm vụ « phá đảo game » từ thế giới survival. Nó chặt gỗ, craft công cụ, đào sắt và kim cương, dựng cổng Nether, thu gậy Blaze và ngọc Ender, tìm stronghold, và giết Ender Dragon. Tất cả tự chủ, qua client Minecraft gốc, trên bất kỳ máy chủ vanilla nào.

Dưới nắp capo, việc này thực hiện nhờ **hệ cây nhiệm vụ đệ quy** nơi mỗi mục tiêu cấp cao (ví dụ, « craft cuốc kim cương ») được rã thành nhiệm vụ tiên quyết : đào kim cương → nung nó → craft gậy → kết hợp chúng. Cây duyệt đồ thị công thức Minecraft đầy đủ, xử lý chuỗi sản xuất, rơi quái, bảng loot và truy cập container. Không như cây viết tay của ANNA, nhiệm vụ của Altoclef là **lớp Java lập trình được** có thể triển khai logic tùy ý : chiến lược chiến đấu, trao đổi với piglin, mẫu khám phá.

Ý kiến trúc mấu chốt là tách **cái gì** (cây nhiệm vụ) khỏi **cách** (pathfinding Baritone). Baritone xử lý di chuyển cấp thấp : pathfinding, tránh chướng ngại, đập khối, quản lý túi, trong khi hệ nhiệm vụ dàn xếp kế hoạch cấp cao. Tính module này nghĩa là không thành phần nào cần là AI : cả hai đều là thuật toán xác định, nhưng kết hợp chúng cho ra hành vi phức tạp hướng mục tiêu sánh ngang cách học.

Altoclef đại diện giới hạn của **AI Minecraft ký hiệu thuần** : nó có thể phá đảo game từ con số không không cần huấn luyện, không GPU, và không dữ liệu con người, nhưng nó không thể thích ứng với nhiệm vụ lập trình viên không lường trước, và nó không thể học từ kinh nghiệm. Nó biết craft cuốc kim cương vì lớp Java bảo nó chính xác cách, không phải vì nó tự phát hiện.

## Điều nối chúng

| Cách | Phương pháp chính | Dữ liệu | Tính toán | Kết quả | |
|--------------------------|---------------------|---------|--------|-----------|-|
| Bot PvP của video | RL + imitation learning | 1 000 trận | 1 laptop, 60h | Combo 100 đòn | |
| OpenAI Five | RL tự chơi | 180 năm game/ngày | 256 GPU, 10th | Vô địch thế giới Dota 2 | |
| VPT | IL bán giám sát | 70K h YouTube + IDM | 720 GPU, 9 ngày | Công cụ kim cương | |
| DreamerV3 | RL world model | Quỹ đạo mơ | 1 GPU, 9 ngày | Kim cương từ không | |
| **ANNA** | **NLP ký hiệu + cây nhiệm vụ** | **Công thức viết** | **1 laptop, tức thì** | **Mọi vật craft được** | |
| **Altoclef** | **Baritone + task tree FS** | **Lớp nhiệm vụ Java** | **Mod Fabric, không GPU** | **Phá đảo cả game** | |
| **Mace Bot** | **Máy trạng thái Command block** | **Quyết định ngẫu nhiên** | **Vanilla MC, không GPU** | **Luyện PvP mace** | |

Bot của video bị ràng tài nguyên nhất mà trung thực nhất về quy trình. Nó thất bại trước, rồi lặp. Nó quên điều đã học, rồi học lại. Nó kết bằng combo 100 đòn : mà còn bằng câu hỏi về điều nó dựng có gian lận.

---

**Video** : [AI Learns Minecraft PvP](https://www.youtube.com/watch?v=j5nxDKAjg6U) bởi Kadambi | AI Engineering

**VPT** : [Bài](https://cdn.openai.com/vpt/Paper.pdf) · [Blog](https://openai.com/index/vpt/) · [GitHub](https://github.com/openai/Video-Pre-Training)

**OpenAI Five** : [Bài](https://arxiv.org/abs/1912.06680) · [Blog](https://openai.com/index/dota-2/)

**DreamerV3** : [Bài](https://arxiv.org/abs/2301.04104) · [GitHub](https://github.com/danijar/dreamerv3)

**ANNA** : [GitHub](https://github.com/fox3000foxy/ANNA) · (Node.js, Mineflayer, NLP tiếng Pháp, cây nhiệm vụ)

**Altoclef** : [GitHub](https://github.com/gaucho-matrero/altoclef) · [Fork hoạt động](https://github.com/drmcbride12/altoclef) · (Fabric, Baritone, task tree, beats game)

**Mace Bot** : [Video](https://www.youtube.com/watch?v=Fmp2Il70IF8) bởi Master Gumbo · (Command blocks, Carpet Mod, máy trạng thái)
