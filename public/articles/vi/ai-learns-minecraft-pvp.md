---
title: AI Học Minecraft PvP -- Imitation Learning, Reinforcement Learning và 30 biến quan trọng
description: "1.000 trận đấu được ghi lại, mạng nơ-ron được huấn luyện trên pixel, độ chính xác gõ phím 90% : và bot chạy thẳng vào tường. Rồi đến RL, curriculum learning và 60 giờ huấn luyện."
date: 2026-07-09
tags:
  - minecraft
  - ai
  - reinforcement-learning
  - imitation-learning
  - python
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "uzG9/RQ5lfGe5d3Omm/jAa2lMsQ0ntsLvEoxm+jdSlRWe/xfJPOdNiNk8NPFBviwRsdwuz3q/+YmYGrp4ihCeA=="
---

## Giới thiệu

![AI Học Minecraft PvP thumbnail](assets/ai-pvp-thumbnail.png)

Có một video có tên [AI Learns Minecraft PvP (Reinforcement Learning + Behavior Cloning)](https://www.youtube.com/watch?v=j5nxDKAjg6U) bởi Kadambi | AI Engineering, và đây là một trong những bản tường thuật trung thực nhất về việc huấn luyện AI chơi game mà tôi từng thấy.

Tiền đề: xây dựng một bot chơi Minecraft PvP (bộ kiếm, giáp kim cương full enchant) bằng cách xem màn hình và xuất lệnh chuột và bàn phím. Không đọc bộ nhớ game, không macro, không mod : chỉ pixel vào, hành động ra.

Điều khiến video thú vị không phải là kết quả cuối cùng. Mà là hành trình: sự thất bại của imitation learning, cú pivot feature engineering, các chu kỳ catastrophic forgetting, và hơn 60 giờ huấn luyện trên laptop không có GPU.

## Giai đoạn 1 : Imitation Learning (thất bại)

![Bot trong quá trình imitation learning: đối diện tường, nhảy lên xuống](assets/ai-pvp-imitation-fail.png)

Người tạo bắt đầu với một cách tiếp cận hợp lý: ghi lại 1.000 trận đấu của chính họ, ánh xạ mọi cú click chuột và lần nhấn phím với khung hình tương ứng, và huấn luyện mạng nơ-ron dự đoán hành động từ pixel.

```python
# Pseudocode for the imitation learning pipeline
dataset = record_duels(1000)          # hundreds of thousands of frames
for frame, action in dataset:
    pixels = capture_screen(frame)
    network.train(pixels → action)    # predict keyboard/mouse from image
```

Mạng nơ-ron học cách dự đoán thao tác gõ phím với độ chính xác **90%**. Đầy hứa hẹn.

Sau đó họ thử nghiệm nó trong một trận đấu thực tế. Bot chạy thẳng đến rìa bản đồ, đối diện tường, và nhảy lên xuống.

Tại sao?

**Bẫy lười biếng.** Trong một trận PvP, phím W được nhấn hầu hết thời gian. Mạng nơ-ron nhận ra rằng nó có thể đạt độ chính xác cao bằng cách chỉ cần giữ W và không làm gì khác. Nó tối ưu cho hành động phổ biến nhất và đánh đổi tất cả những hành động khác.

**Độ trễ của con người.** Các hành động trong tập dữ liệu bị trễ ~200ms do thời gian phản ứng của con người. Từng khung hình một, nguyên nhân và kết quả gần như không thể học được từ pixel thô khi hành động và hậu quả có thể nhìn thấy bị tách biệt nhiều khung hình.

**Sự trình diễn không nhất quán.** Lối chơi của người tạo cũng thay đổi : đôi khi strafe bằng bàn phím, đôi khi ngắm bằng chuột trong các tình huống giống hệt nhau. Đầu vào mâu thuẫn này làm mạng nơ-ron bối rối.

## Giai đoạn 2 : Reinforcement Learning với Curriculum

![Bot học cách theo dõi ngang trong quá trình huấn luyện RL](assets/ai-pvp-rl-horizontal.png)

Từ bỏ imitation learning, người tạo chuyển sang RL. Nhưng thả một tác nhân mới vào một trận PvP đầy đủ là vô ích : có quá nhiều thứ xảy ra cùng lúc để khám phá ngẫu nhiên tìm ra bất cứ điều gì.

Giải pháp: **curriculum learning**. Cô lập từng cơ chế và để bot thành thạo những điều cơ bản trước khi bước vào trận đấu thực sự.

### Bước 1 : Ngắm ngang (7 giờ)

Hàm phần thưởng đơn giản nhất: phần thưởng tích cực khi đánh trúng, hình phạt tiêu cực khi nhận sát thương.

Ban đầu, bot hầu như không di chuyển (mạng nơ-ron được khởi tạo để xuất giá trị trung tính). Nó rung lắc từ bên này sang bên kia : đó là bot đang thử các hành động khác nhau để xem hành động nào mang lại phần thưởng.

Sau một giờ, nó học cách căn giữa theo chiều ngang, nhưng chậm một cách đau đớn. Sau 7 giờ, nó có thể theo dõi kẻ địch trái và phải, mặc dù không đối xứng (di chuyển từ phải sang trái tốt hơn từ trái sang phải, một hành vi tồn tại suốt quá trình huấn luyện).

### Bước 2 : Feature Engineering

Ảnh chụp màn hình thô có hơn 2 triệu pixel. Ngay cả khi thu nhỏ xuống 360p, đó vẫn là 200.000 đầu vào : quá nhiều cho việc học hiệu quả.

Người tạo đã phân tích hàng nghìn trận đấu và xác định **30 biến thực sự quan trọng**, chia thành ba nhóm:

**Vision (theo dõi kẻ địch)** :
- Khoảng cách của kẻ địch từ crosshair
- Kích thước bounding box của kẻ địch
- Chiều cao kẻ địch
- Trạng thái crosshair (trúng/trượt mục tiêu)
- Vận tốc tương đối

Thay vì xử lý toàn bộ hình ảnh, bot lọc pixel một cách chính xác theo màu giáp của kẻ địch, giúp phát hiện gần như tức thì. Các khối nền có màu tương tự có thể làm hỏng việc này : nhưng trong Minecraft, bạn chỉ cần thay đổi kết cấu.

**OCR (đọc HUD)** :
Vì bot không thể lấy tọa độ từ mã game, nó quét màn hình theo thời gian thực để trích xuất:
- Độ nghiêng camera (pitch)
- Động lượng (momentum)
- Cao độ Y

OCR tiêu chuẩn gặp khó khăn với văn bản trong suốt của Minecraft, vì vậy dữ liệu quan trọng bị ép thành đen trắng để đọc tức thì.

**Thời gian (context window)** :
- Thời gian từ khi bạn đánh trúng kẻ địch
- Thời gian từ khi chúng đánh bạn
- Bộ đệm luân chuyển các hành động trước đó của bot

Điều này cung cấp bối cảnh thời gian cho mạng nơ-ron : nếu không có nó, bot không biết liệu nó đang ở giữa một combo hay mới bắt đầu trận đấu.

### Bước 3 : Ngắm dọc (thêm 7 giờ)

![Bot học cách ngắm lên và xuống trong quá trình huấn luyện RL](assets/ai-pvp-rl-vertical.png)

Việc thêm chuyển động chuột dọc là "một thảm họa hoàn toàn" lúc đầu. Hiệu suất ban đầu bị hỏng.

Sau một giờ nữa trong sandbox, bot đã tìm ra cách nhìn lên và xuống. Nhưng trong quá trình đó, nó hoàn toàn quên cách theo dõi theo chiều ngang.

Đây là **catastrophic forgetting** : một vấn đề machine learning kinh điển nơi việc tối ưu hóa cho dữ liệu mới ghi đè lên các biểu diễn đã học trước đó. Bằng cách tối ưu hóa cho việc ngắm dọc, mạng nơ-ron vô tình ghi đè lên tiến trình ngang, để lại cho người tạo một bot có thể giữ crosshair ở mức ngang nhưng không thể theo dõi mục tiêu.

Phải mất thêm **6 giờ** để lấy lại khả năng theo dõi ngang trong khi vẫn giữ được điều khiển dọc. Bot sau đó duy trì vị trí crosshair tốt nhờ nhóm OCR trích xuất độ nghiêng camera.

### Bước 4 : Điều khiển bàn phím

![Bot bật tắt phím W liên tục, học cách cam kết với chuyển động](assets/ai-pvp-keyboard.png)

Việc cho phép bot sử dụng bàn phím làm cho các tính năng dựa trên thời gian trở nên quan trọng hơn nữa. Lúc đầu, phím W liên tục được bật và tắt : chuyển đổi nhanh vì mạng nơ-ron chưa học cách cam kết.

Hành vi này bị phạt, vì vậy bot học cách làm mượt nó. Nó bắt đầu tung ra nhiều cú đánh chạy hơn (âm thanh thud so với whoosh của cú vung đứng yên). Một số combo trông không thỏa mãn vì bot khai thác lợi thế tầm với so với kẻ địch.

Để công bằng, người tạo đã tăng tầm với của kẻ địch. Nhiều chiến lược bot đã học không còn hiệu quả nữa. Nhưng khi có thêm thời gian, nó đã thích nghi.

### Bước 5 : Dạy bot khi nào nên click

Ở giai đoạn cuối, người tạo đã đưa imitation learning trở lại : nhưng chỉ để dạy thời điểm click, không phải chính sách điều khiển toàn bộ. Bot cố gắng bắt chước các mẫu click từ các trận đấu đã ghi lại.

Ban đầu nó quá sợ hãi để thử bất cứ điều gì, lo sợ bị phạt vì click sai. Nhưng cuối cùng nó đã lấy can đảm để vung kiếm và đánh trúng. Tất nhiên, nó lại quên cách ngắm trong quá trình đó : người tạo phải để nó một mình thêm **50 giờ nữa** để trở lại trạng thái hài lòng.

## Cuộc tranh luận về gian lận

Video kết thúc bằng câu hỏi: bot này có gian lận không?

Lập luận phản đối: bot chỉ xử lý những gì con người thấy (cùng pixel), gửi cùng đầu vào bàn phím/chuột như con người (không thao túng gói tin như anti-knockback), và không đọc bộ nhớ game (không X-ray hay ESP).

Lập luận ủng hộ: bot có thể xử lý nhanh hơn con người, và nếu đối thủ nghĩ rằng họ đang chơi với người nhưng thực ra không phải, đó là sự lừa dối.

Quan điểm của người tạo: nó phụ thuộc vào ý định. Nếu cả hai bên đều biết đó là bot, đó là một trận đấu công bằng. Bot sau đó tiếp tục combo kẻ địch xuống vực thẳm với chuỗi 100 đòn.

## Kết quả

![Bot thực hiện combo 100 đòn](assets/ai-pvp-final-combo.png)

Một bot Minecraft PvP được huấn luyện trên **laptop không có GPU**, được xây dựng trên pipeline huấn luyện tùy chỉnh với:

- **Chụp màn hình** cho đầu vào pixel (2M+ pixel → 30 đặc trưng được thiết kế)
- **Curriculum learning** (ngang → dọc → bàn phím → click)
- **RL cho điều khiển vận động** + **imitation learning cho thời điểm click**
- **Feature engineering** thay vì pixel thô (3 nhóm: vision, OCR, thời gian)
- **Hơn 60 giờ huấn luyện** qua nhiều giai đoạn

Tổng thời gian huấn luyện là hàng chục giờ, nhưng hầu hết là thụ động. Bot rung lắc để hiểu, quên những gì đã học, học lại, và cuối cùng kết nối một combo 100 đòn.

Video tại [youtube.com/watch?v=j5nxDKAjg6U](https://www.youtube.com/watch?v=j5nxDKAjg6U).

---

*Bài viết này chỉ bao gồm nội dung của video. Để có bối cảnh rộng hơn về AI Minecraft: VPT, DreamerV3, và bức tranh imitation learning vs RL : các phần bên dưới kết nối dự án này với lĩnh vực rộng hơn.*

## VPT : Behavior cloning ở quy mô lớn

![Sơ đồ dự án VPT của OpenAI: Inverse Dynamics Model dự đoán hành động từ các cặp khung hình](assets/vpt-overview.svg)

Cách tiếp cận "behavior cloning" của video (Giai đoạn 1) là kỹ thuật tương tự OpenAI đã sử dụng trong dự án **Video PreTraining (VPT)**, nhưng ở hai đầu đối diện của phổ tài nguyên. VPT đã chứng minh rằng imitation learning hiệu quả với Minecraft khi bạn có 70.000 giờ video, 720 GPU, và một inverse dynamics model để gán nhãn giả cho dữ liệu chưa được gắn nhãn. Người tạo ở đây đã chứng minh nó thất bại với một laptop và 1.000 trận đấu : nhưng vì cùng một lý do cơ bản: imitation learning bị giới hạn bởi chất lượng của các màn trình diễn.

![Tác nhân VPT của OpenAI đang đốn cây trong Minecraft](assets/vpt-minecraft.jpg)

Pipeline VPT giải quyết vấn đề dữ liệu bằng cách huấn luyện một **Inverse Dynamics Model (IDM)** nhìn vào khung t-1 và khung t+1 để dự đoán hành động tại khung t. Vì IDM là non-causal (nó thấy các khung hình tương lai), nhiệm vụ này dễ dàng hơn behavioral cloning và cần ít dữ liệu được gắn nhãn hơn nhiều. Họ đã trả cho các nhà thầu ~$2.000 cho 2.000 giờ dữ liệu có nhãn, sau đó sử dụng IDM để gán nhãn giả cho 70.000 giờ video YouTube Minecraft.

![Tỷ lệ chế tạo/thu thập theo khối lượng dữ liệu tiền huấn luyện (thang log): bàn chế tạo, công cụ gỗ, công cụ đá](assets/vpt-stone-pickaxe-sequence.svg)

Hiệu ứng tỷ lệ rất rõ ràng: trên trục log từ 1 giờ đến 100.000 giờ dữ liệu tiền huấn luyện, tỷ lệ mô hình chế tạo bàn chế tạo, công cụ gỗ, rồi công cụ đá tăng dần theo từng bậc. Mô hình chỉ được huấn luyện trên 2.000 giờ dữ liệu có nhãn từ các nhà thầu đạt tối đa ở bàn chế tạo; chính nhờ thêm 70.000 giờ được gán nhãn giả bởi IDM (đường chấm trên biểu đồ) mà công cụ đá xuất hiện zero-shot, không cần một bước RL nào.

Mô hình nền tảng 0,5B tham số kết quả đạt được khả năng zero-shot mà không thể có với RL đơn thuần : chặt cây, chế tạo bàn, pillar jumping : và được fine-tuning với RL, trở thành AI đầu tiên chế tạo công cụ kim cương.

![Phần thưởng theo số tập huấn luyện RL: khởi tạo ngẫu nhiên vs khởi tạo từ mô hình VPT tiền huấn luyện](assets/vpt-diamond-pickaxe-sequence.svg)

Biểu đồ này cho thấy tại sao tiền huấn luyện thay đổi mọi thứ cho RL hạ nguồn. RL khởi tạo từ mạng ngẫu nhiên (cam) vẫn bằng phẳng gần 0 qua gần một triệu tập: nhiệm vụ "lấy kim cương" có phần thưởng quá thưa thớt để một tác nhân ngây thơ tình cờ tìm thấy nó qua khám phá ngẫu nhiên. RL fine-tune từ mô hình VPT tiền huấn luyện (xanh lá) đã bắt đầu với hành vi cơ bản (đào, chế tạo, khám phá) và tăng đều đặn lên phần thưởng khoảng 25, tương ứng với con đường hoàn chỉnh đến một cái cuốc kim cương.

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/719971231?h=cbdf2617a1" title="Demo gameplay tác nhân VPT 1" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045834?h=9cb4118c65" title="Demo gameplay tác nhân VPT 2" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045849?h=00398908ed" title="Demo gameplay tác nhân VPT 3" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045863?h=060f07e290" title="Demo gameplay tác nhân VPT 4" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

*Các bản demo video chính thức của dự án VPT của OpenAI, cho thấy tác nhân trong hành động.*

## OpenAI Five : Vấn đề reward shaping

![OpenAI Five chơi Dota 2 đấu với các chuyên gia con người](assets/openai-five-dota2.jpg)

OpenAI Five (2019) đánh bại nhà vô địch thế giới Dota 2 bằng pure self-play RL : không imitation learning. 256 GPU, 128.000 lõi CPU, 180 năm gameplay mỗi ngày, 10 tháng huấn luyện.

Nhưng hàm phần thưởng được tạo thủ công bởi các chuyên gia Dota: **28 trên 20.000 tính năng có sẵn**, mỗi tính năng có trọng số được điều chỉnh thủ công. Tài sản, số mạng hạ gục, số lần chết, máu trụ, phân công đường : tất cả được chọn và gán trọng số bởi con người. Nếu không có shaping này, tác nhân hầu như không học được gì (thí nghiệm: phần thưởng chỉ thắng/thua → chững lại ở trình độ bán chuyên).

Bot trong video đối mặt với cùng vấn đề: hàm phần thưởng của nó mã hóa sự hiểu biết của người tạo về điều gì quan trọng trong PvP (đánh trúng tốt, nhận sát thương xấu, giữ crosshair tốt). Điều này là không thể tránh khỏi : RL cần một tín hiệu phần thưởng, và việc định hình tín hiệu đó mã hóa thiên kiến con người.

## DreamerV3 : World model và phần thưởng thưa thớt

![Điểm benchmark DreamerV3 trên hơn 150 nhiệm vụ đa dạng với một cấu hình duy nhất](assets/dreamerv3-benchmarks.png)

DreamerV3 của DeepMind (2023) thực hiện cách tiếp cận thứ ba. Thay vì behavior cloning hay RL có shaping, nó học một **world model** : một mạng nơ-ron dự đoán trạng thái tương lai và phần thưởng từ các hành động trong quá khứ : và lập kế hoạch bằng cách mơ về các tương lai có thể. Nó là thuật toán đầu tiên thu thập kim cương trong Minecraft từ đầu mà không cần dữ liệu con người hay chương trình giảng dạy, được xuất bản trên Nature vào năm 2025.

![DreamerV3 học world model để tưởng tượng các quỹ đạo tương lai](assets/dreamerv3-header.png)

Môi trường kim cương định nghĩa phần thưởng thưa thớt qua 12 cột mốc (log → planks → stick → crafting table → wooden pickaxe → cobblestone → stone pickaxe → iron ore → furnace → iron ingot → iron pickaxe → diamond), mỗi cái cho +1 đúng một lần. Cộng với phần thưởng sức khỏe nhỏ (±0,01 mỗi hp). Tổng có thể đạt được: 11,1 trong một tập 36.000 bước.

World model của DreamerV3 cho phép nó tưởng tượng các quỹ đạo và đánh giá chúng nội bộ : tác nhân học từ các rollout mơ ước thay vì trải nghiệm thực tế, thử nghiệm hàng nghìn tương lai có thể cho mỗi bước thực tế. Điều này làm cho phần thưởng thưa thớt trở nên khả thi ở nơi chúng sẽ giết chết một tác nhân RL tiêu chuẩn.

Qua 40 seed được huấn luyện trong 100M bước môi trường, 24 trên 40 thu thập được ít nhất một viên kim cương. Viên kim cương đầu tiên xuất hiện sau 29M bước (~9 ngày trên một GPU).

## ANNA : AI biểu tượng gặp Minecraft

![Sự phân rã cây nhiệm vụ của ANNA cho flint-and-steel](assets/anna-task-tree.png)

Trước bot PvP trong video, trước VPT và DreamerV3, đã có **ANNA** : một bot Minecraft được xây dựng với một triết lý hoàn toàn khác. Thay vì học từ pixel hay phần thưởng, ANNA sử dụng **state machine biểu tượng** với **bộ phân tích NLP tiếng Pháp** và **cây phụ thuộc nhiệm vụ** được viết tay.

Được tạo ra vào năm 2022 (trước khi "vibe coding" trở thành thuật ngữ), ANNA kết nối đến máy chủ Minecraft qua Mineflayer và hiểu các lệnh ngôn ngữ tự nhiên bằng tiếng Pháp. Nói *"obtiens un briquet"* (lấy cái bật lửa), bộ phân tích của ANNA xác định động từ (*obtien* → lấy), tra cứu công thức vật phẩm, và phân rã đệ quy thành các nhiệm vụ con : đốn gỗ sồi → chế tạo planks → chế tạo sticks → chế tạo crafting table → chế tạo wooden pickaxe → đá mỏ → chế tạo stone pickaxe → khai thác quặng sắt → nấu chảy iron ingots → chế tạo flint-and-steel.

![Kiến trúc bộ phân tích NLP của ANNA cho nhận dạng lệnh tiếng Pháp](assets/anna-nlp-diagram.png)

Lớp NLP (`utils/id_parser.js`) tách lệnh bằng *"et"* (và) để xử lý lệnh song song, ánh xạ động từ tiếng Pháp sang loại nhiệm vụ (*craft*, *mine*, *tue*, *suis moi*), và dịch tên vật phẩm tiếng Pháp sang ID Minecraft qua từ điển 5.000 mục. Các lệnh không được nhận dạng sẽ rơi xuống hệ thống hội thoại dựa trên GPT biến ANNA thành một người bạn đồng hành Minecraft có tri giác.

**Task tree** (`mc-tasks-tree/`) là cốt lõi : một thuật toán đệ quy đi qua đồ thị vật phẩm Minecraft (công thức chế tạo, sản phẩm khai thác, vật phẩm rơi từ mob, công thức lò nung) để tạo ra một kế hoạch từng bước. Cho một mũ giáp kim cương, nó tạo ra một bảng phân tích 40+ bước trải dài qua các cấp gỗ, đá, sắt và kim cương.

![Cây nhiệm vụ mũ giáp kim cương của ANNA: bảng phân tích 40+ bước](assets/anna-diamond-helmet.png)

Trong khi bot PvP trong video học từ kinh nghiệm, ANNA làm việc từ kiến thức. Nó không cần 1.000 trận đấu hay 60 giờ huấn luyện : nó cần cây, bộ phân tích và máy chủ. Nhưng nó cũng không thể khái quát hóa vượt quá những gì cây của nó mã hóa. Không có lượng kỹ thuật state machine nào có thể dạy nó chơi PvP.

Cách tiếp cận của ANNA phản ánh một kỷ nguyên AI khác : trước khi end-to-end learning thống trị, khi lời hứa là lý luận biểu tượng + kỹ thuật cẩn thận có thể tạo ra hành vi thông minh. Ngày nay, các dự án như ANNA và bot PvP đại diện cho hai cực của AI Minecraft : một lý luận về thế giới, một cảm nhận nó.

## Mace Bot của Master Gumbo : AI chỉ với command block

![Đấu trường huấn luyện Mace PvP với bot](assets/mace-bot-arena.png)

Trong một góc hoàn toàn khác của AI Minecraft, YouTuber **Master Gumbo** đã xây dựng một bot huấn luyện PvP chỉ sử dụng **command block** : không mod, không plugin, không mã ngoài. Chỉ lệnh Minecraft vanilla, redstone, và carpet mod cho các thực thể bản sao người chơi. Kết quả là một đối thủ AI mace PvP luyện tập breach swapping, wind charging, và cơ chế khiên với người chơi.

Bot bắt đầu như một zombie với trang bị không thể phá hủy và một totem ở tay phụ (được làm đầy mỗi tick qua `/item replace`), khiến nó gần như bất tử. Sau đó, Master Gumbo chuyển sang bot **player replica của Carpet Mod**, hỗ trợ các cơ chế giống con người (giơ khiên, chuyển đổi vật phẩm) mà zombie không thể làm được.

![Trung tâm cài đặt: các nút để cấu hình hành vi bot](assets/mace-settings-center.png)

Cải tiến cốt lõi là một **state machine được điều khiển bởi tính ngẫu nhiên**. Một armor stand được dịch chuyển lên trên một vòng tròn các khối bê tông màu bằng lệnh `/spreadplayers`, lệnh này phân tán các thực thể một cách ngẫu nhiên. Nơi armor stand hạ cánh quyết định hành động tiếp theo của bot :

- **Bê tông đỏ** → strafe lùi
- **Bê tông xanh dương** → wind charge lên (tấn công)
- **Bê tông xanh lá** → giơ khiên
- **Bê tông trắng** → tạm dừng (thêm độ trễ giữa các hành động)

![Hệ thống quyết định AI: armor stand trên bê tông màu](assets/mace-ai-system.png)

Vị trí của armor stand được đọc bởi các command block phát hiện khối bên dưới nó và kích hoạt cơ chế tương ứng. Một khối redstone được đặt hoặc loại bỏ để bật/tắt mỗi hành vi. Bởi vì `/spreadplayers` chạy lặp lại, bot liên tục đưa ra các quyết định mới, tạo ra hành vi không thể đoán trước nhưng có cấu trúc.

Master Gumbo gọi đây là "một dạng AI rất đơn giản và cơ bản" : nó không học từ tương tác như mạng nơ-ron, nhưng tính ngẫu nhiên + state machine tạo ra hành vi PvP thực tế khó đoán hơn một bot đã được lập trình sẵn. Trung tâm cài đặt bao gồm giao diện sách để bật/tắt AI, điều chỉnh độ khó và cấu hình mẫu di chuyển.

Sau khi huấn luyện với bot và sau đó đấu tay đôi với người chơi đã gọi anh ta là tệ (trong phần giới thiệu video), Master Gumbo đã thắng. Bản đồ được chia sẻ qua Discord với yêu cầu Carpet Mod.

![Bot trong một trận đấu tay đôi, luyện tập kỹ thuật mace PvP](assets/mace-final-duel.png)

Trong khi bot PvP (Kadambi) học từ pixel và ANNA lý luận qua cây nhiệm vụ, bot của Master Gumbo đạt được trí thông minh thông qua **các chuyển đổi trạng thái ngẫu nhiên** : một cách tiếp cận command block thuần túy chứng minh bạn không cần mạng nơ-ron để xây dựng một đối thủ PvP thuyết phục.

## Altoclef : Baritone + task tree ở quy mô lớn

Nếu ANNA là bot biểu tượng *đọc* để biết phải làm gì, và Mace Bot ngẫu nhiên hóa quyết định, thì **Altoclef** là một tác nhân tự động hoàn chỉnh *lập kế hoạch* xuyên suốt toàn bộ trò chơi. Được xây dựng bởi gaucho-matero dưới dạng mod Fabric và chạy trên **Baritone** pathfinding, Altoclef phân rã bất kỳ mục tiêu Minecraft nào thành một cây nhiệm vụ và thực thi nó mà không cần đầu vào của con người.

Giao diện đơn giản đến bất ngờ : gõ `@gamer` trong chat, và Altoclef bắt đầu nhiệm vụ beat-the-game từ một thế giới survival. Nó thu thập gỗ, chế tạo công cụ, khai thác sắt và kim cương, xây cổng Nether, thu thập blaze rods và ender pearls, tìm stronghold, và giết Ender Dragon. Hoàn toàn tự động, qua Minecraft client gốc, trên bất kỳ máy chủ vanilla nào.

Bên dưới, điều này được thực hiện qua một **hệ thống task tree đệ quy**, nơi mỗi mục tiêu cấp cao (vd: "chế tạo diamond pickaxe") được phân rã thành các nhiệm vụ tiên quyết : khai thác kim cương → nấu chảy → chế tạo sticks → kết hợp. Cây đi qua toàn bộ đồ thị công thức Minecraft, xử lý chuỗi sản xuất, mob drops, loot table, và container access. Không giống cây viết tay của ANNA, các task của Altoclef là **Java classes có thể lập trình** mà có thể thực thi bất kỳ logic tùy ý : chiến lược chiến đấu, đổi đồ với piglin, mô hình thám hiểm.

Điểm mấu chốt trong kiến trúc là sự tách biệt giữa **what** (task tree) và **how** (Baritone pathfinding). Baritone xử lý chuyển động cấp thấp : pathfinding, tránh chướng ngại vật, đập block, quản lý inventory -- trong khi hệ thống task điều phối kế hoạch cấp cao. Sự mô-đun này đồng nghĩa không thành phần nào cần AI : cả hai đều là thuật toán xác định, nhưng sự kết hợp của chúng tạo ra hành vi phức tạp, hướng đến mục tiêu, sánh ngang với các phương pháp học.

Altoclef đại diện cho giới hạn của **AI Minecraft thuần biểu tượng** : nó có thể beat game từ đầu với 0 giờ huấn luyện, 0 GPU, và 0 dữ liệu con người, nhưng nó không thể thích nghi với các tác vụ mà người lập trình không lường trước, và nó không thể học từ kinh nghiệm. Nó biết cách chế tạo một diamond pickaxe vì một Java class chỉ cho nó chính xác cách làm, không phải vì nó tự tìm ra.

## Điều gì kết nối chúng lại với nhau

| Cách tiếp cận | Phương pháp cốt lõi | Dữ liệu | Tính toán | Kết quả |
|----------|------------|------|---------|--------|
| Bot PvP trong video | RL + imitation learning | 1.000 trận đấu | 1 laptop, 60 giờ | Combo 100 đòn |
| OpenAI Five | Self-play RL | 180 năm chơi/ngày | 256 GPU, 10 tháng | Vô địch thế giới Dota 2 |
| VPT | IL bán giám sát | 70K giờ YouTube + IDM | 720 GPU, 9 ngày | Công cụ kim cương |
| DreamerV3 | World model RL | Quỹ đạo mơ ước | 1 GPU, 9 ngày | Kim cương từ đầu |
| **ANNA** | **NLP biểu tượng + cây nhiệm vụ** | **Công thức viết tay** | **1 laptop, tức thì** | **Bất kỳ vật phẩm chế tạo được** |
| **Altoclef** | **Baritone + task tree đệ quy** | **Java classes** | **Mod Fabric, không GPU** | **Beat toàn bộ game** |
| **Mace Bot** | **State machine command block** | **Quyết định ngẫu nhiên** | **Vanilla MC, không GPU** | **Huấn luyện Mace PvP** |

Bot trong video là bot bị giới hạn tài nguyên nhất nhưng trung thực nhất về quá trình. Nó thất bại trước, sau đó lặp lại. Nó quên những gì đã học, sau đó học lại. Nó kết thúc với một combo 100 đòn : nhưng cũng với một câu hỏi về việệu liệu thứ nó xây dựng có phải là gian lận hay không.

---

**Video** : [AI Learns Minecraft PvP](https://www.youtube.com/watch?v=j5nxDKAjg6U) bởi Kadambi | AI Engineering

**VPT** : [Paper](https://cdn.openai.com/vpt/Paper.pdf) · [Blog](https://openai.com/index/vpt/) · [GitHub](https://github.com/openai/Video-Pre-Training)

**OpenAI Five** : [Paper](https://arxiv.org/abs/1912.06680) · [Blog](https://openai.com/index/dota-2/)

**DreamerV3** : [Paper](https://arxiv.org/abs/2301.04104) · [GitHub](https://github.com/danijar/dreamerv3)

**ANNA** : [GitHub](https://github.com/fox3000foxy/ANNA) · (Node.js, Mineflayer, NLP tiếng Pháp, cây nhiệm vụ)

**Altoclef** : [GitHub](https://github.com/gaucho-matrero/altoclef) · [Fork hoạt động](https://github.com/drmcbride12/altoclef) · (Fabric, Baritone, task tree, beat game)

**Mace Bot** : [Video](https://www.youtube.com/watch?v=Fmp2Il70IF8) bởi Master Gumbo · (Command blocks, Carpet Mod, state machine)
