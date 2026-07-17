---
title: "Bot TF2 Không Phải Ngẫu Nhiên: Tôi Đã Dịch Ngược Từng Thiết Lập Độ Khó"
description: "Tầm nhìn, theo dõi mục tiêu, góc đâm sau lưng của Spy, logic headshot của Sniper, mọi lỗi đã biết -- Valve chưa bao giờ ghi chép điều nào. Vì vậy chúng tôi đã lục tung mã nguồn và biến nó thành một bảng thông số đầy đủ."
date: 2026-07-12
authors:
  - fox3000foxy
tags:
  - tf2
  - game-ai
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "GAsludYk8n+hS3GJ1WQ3Dge92264pM+hPKlaIVXHWJUyKOh8qN0KafxSaFSZ5+9D/Ush3PcpkGtP0E3vXCyjag=="
---

## Giới thiệu

![Bot Soldier TF2 đang ngắm súng rocket](assets/tf2-bot-ai-soldier-aim.png)

Mọi người chơi TF2 đều đã từng nói ít nhất một lần: "con bot này gian lận." Hoặc ngược lại: "sao con bot Dễ này cứ đứng đó hứng rocket vậy." Không ai thực sự biết "Dễ," "Thường," "Khó," và "Chuyên gia" thực sự có nghĩa là gì bên dưới lớp vỏ -- Valve đưa ra bốn nhãn độ khó và không một tài liệu nào.

Vì vậy một nhóm chúng tôi (tôi, awimii, Mush The Possum, với phần lớn nền tảng do sigsegv thực hiện, người đã thực sự đào bới mã nguồn game đã dịch ngược) đã tổng hợp một tài liệu nghiên cứu đầy đủ về hành vi của TFBot. Mọi cơ chế, mọi lỗi đã biết, mọi xác suất được lập trình cứng. Bài viết này là bản tường trình đầy đủ, không phải bản rút gọn. Cầm lấy lon Bonk đi, bài này dài lắm đây.

---

## Chương I: Những Điều Cơ Bản

### Bot so với Bot Rối

TF2 có hai thứ hoàn toàn khác nhau mà người ta gọi là "bot":

- **Bot AI (TFBot)**: AI thật, được xây dựng trên cùng nền tảng PlayerBot/Infected mà Valve đã dùng cho dòng *Left 4 Dead*. Chúng chọn lớp ngẫu nhiên, chơi theo mục tiêu, hoạt động mà không cần `sv_cheats`, và kích hoạt thành tích như người chơi thật.
- **Bot rối (Puppet bot)**: không có AI, không thể tự di chuyển hay hành động. Chúng tồn tại thuần túy để bị điều khiển thủ công -- người chơi có thể buộc chúng đi theo, ngắm và bắn, chủ yếu dùng để thử nghiệm hoặc tạo ảnh/video điện ảnh. Triệu hồi chúng cần `sv_cheats 1`, cũng vô hiệu hóa thành tích trong phiên chơi đó.

Bài viết này hoàn toàn nói về loại đầu tiên.

### Những gì bot AI có thể (đại loại) được bảo làm

TFBot không thể điều khiển trực tiếp, nhưng có một danh sách ngắn những việc bạn có thể xui chúng làm:

- Ngắm nòng súng vào bất kỳ bot nào (đồng đội hay kẻ địch) và nó sẽ chế nhạo bạn nếu bạn dùng đúng lệnh giọng nói.
- Bot Medic đồng minh sẽ chữa trị cho bạn nếu bạn dùng lệnh giọng nói "Medic!"
- Nếu bot Medic đang chữa cho bạn và có ÜberCharge sẵn sàng, nói "Go go go!" hoặc "Activate charging!" sẽ khiến nó kích hoạt charge ngay lập tức.
- Bot Medic có charge sẵn sẽ tự động kích hoạt ngay khi nó hoặc mục tiêu đang chữa bị sát thương nghiêm trọng, không cần lệnh giọng nói.
- Bot sẽ tự động thực hiện các điệu nhảy đôi (High Five) hoặc nhảy nhóm (Conga) với đồng đội gần đó.

### Làm cho bot hoạt động trên map không được hỗ trợ

Bot dựa vào lưới dẫn đường (navmesh) để biết nơi chúng được phép đi, và hầu hết map cộng đồng không có sẵn lưới này. Để ép buộc:

1. `sv_cheats 1`
2. `nav_generate` -- xây dựng navmesh ban đầu, tiến trình hiển thị trong console
3. Chờ game hoàn tất tạo đường đi
4. Tùy chọn sửa dữ liệu dẫn đường xấu bằng `nav_edit 1`
5. Tải lại hoặc khởi động lại server (bỏ qua bước này sẽ vô hiệu hóa thành tích)
6. `tf_bot_add <số_lượng>` để thực sự sinh bot

**Cảnh báo:** thay đổi navmesh khi bot đang hoạt động trên server có thể làm game crash. Khi lưới đã tồn tại, bạn không cần tạo lại cho các phiên sau -- chỉ cần thêm bot lại bằng `tf_bot_add`.

Lưới tự động hoạt động tốt nhất trên map Control Point, King of the Hill, Payload và CTF. Trên map Mannpower, bot mặc định chơi kiểu CTF nhưng hầu như không dùng móc hay powerup. Nếu map không có mục tiêu mà bot AI nhận diện được nhưng có entity phòng sinh, đặt `tf_bot_offense_must_push_time 0` cho phép bot chiến đấu dù sao.

*(Nguồn cho phần này: trang Bot trên Wiki chính thức của TF2.)*

### Tình trạng hiện tại, theo từng map

Nhờ bản cập nhật Hatless, mọi lớp đều hoạt động chính xác, bao gồm Spy vốn đầy lỗi trước đây. Bot hoạt động tốt trên hầu hết map KOTH chính thức, một số map Payload, Dustbowl/Gorge Attack-Defense, và map CTF/Mann Manor -- dù trên hai loại sau bạn không thể sinh chúng trực tiếp bằng `tf_bot_add`. Trên map không được hỗ trợ (qua quy trình nav_generate ở trên) chúng vẫn hoạt động, nhưng kém hơn rõ rệt trong việc bắt chước người chơi thật.

Map PLR là vô vọng: bot không thể vượt qua rào trên Hightower và bị kẹt trong góc, và trên mọi map PLR khác chúng chỉ... tổ chức tiệc khiêu vũ thay vì chơi. Việc này có thể sẽ được sửa. Hoặc không.

### Hành vi chung của bot

Một tập hợp linh tinh những điều mọi bot đều làm bất kể kỹ năng:

- Bot chỉ dùng trang bị mặc định (plugin có thể ép chúng dùng vũ khí không mặc định, nhưng bot gốc không bao giờ tự chọn).
- Bot Dễ hầu như không đụng đến vũ khí phụ. Độ khó cao hơn chuyển sang vũ khí phụ ngay khi đạn chính cạn, hoặc để bù tầm bắn.
- Bot không thể làm kỹ thuật di chuyển -- không nhảy rocket, không di dời công trình.
- Sau khi hạ gục, bot có thể chế nhạo, kể cả khi đang bị bắn -- ngoại trừ khi đang mang intelligence của địch, và quy tắc này cũng áp dụng trong MvM.
- Bot Spy đang cải trang (người chơi hoặc AI) bị các bot khác bỏ qua -- cho đến khi chúng chạm vào kẻ địch, đặt sapper, bắn, hay tàng hình gần một bot. Khi đã bị "lộ," bot/người chơi đó bị nhớ là Spy cho đến khi nó đổi cải trang trong khi vẫn tàng hình, chết, hoặc giả chết bằng Dead Ringer.
- Bot Pyro dùng Compression Blast thoải mái ở mọi cấp trên Dễ.
- Bot Medic ưu tiên chữa cho mọi người hơn là Sniper (và ở mức độ thấp hơn, Engineer), kể cả khi bạn spam "Medic!" khi đang chơi Sniper.
- Bot Medic bị thu hút về phía Heavy, Soldier, Demoman và Pyro -- đặc biệt nếu có *người chơi* đang dùng các lớp đó. Không có người chơi ở các vai trò đó, không có sự chú ý đặc biệt nào từ Medic.
- Bot giữ vị trí trong thời gian setup trên map Attack/Defense và Payload -- ngoại trừ Engineer, Sniper và Spy, những lớp di chuyển tự do (bot Demoman cũng được phép đặt stickies trước).
- Bot Engineer không bao giờ nâng cấp hoặc gỡ sapper khỏi công trình của Engineer đồng đội, trừ khi công trình đó tình cờ nằm trên đường đi của mục tiêu. Chúng đôi khi cũng... không sửa turret của chính mình, dù an toàn để làm.
- Bot Spy bị phát hiện sẽ chuyển sang revolver và lùi lại thay vì cố đâm.
- Bot Demoman đã xác định được vị trí sentry (thường bằng cách chết vì nó một lần) có thể ném stickies hoàn hảo vào nó từ ngoài tầm bắn, vòng qua tường và trần nhà nếu hình học cho phép.
- Bot Sniper không tìm được mục tiêu sau khi ngắm sẽ dùng một trong các câu thoại "Tiêu cực."
- Medic đồng minh sẽ chữa cho Spy đang cải trang mà không do dự.

### Vấn đề / lỗi đã biết

Tài liệu liệt kê một đống các tính năng kỳ lạ tồn tại lâu năm:

- Bot có thể cố đi hoặc bắn xuyên qua một số vật thể tĩnh nhất định.
- Bất kỳ khi nào người chơi/bot lộ diện, cải trang, hoặc lộ tẩy, các bot gần đó "thấy" và quay lại phản ứng -- ngay cả khi sự kiện xảy ra bên ngoài tầm nhìn thực tế của chúng. Nó không dựa trên âm thanh; đó là một lỗi kiểm tra thị giác.
- Hiếm khi, bot có thể bị kẹt vật lý với nhau khi dùng teleporter của Engineer.
- Lệnh giọng nói của bot (ví dụ "Spy!", "Forward!") không hiển thị dưới dạng chat text như của người chơi.
- Bot Medic đang tích cực chữa trị cho ai đó sẽ không né đạn hoặc nhặt bộ dụng cụ y tế, ngay cả khi HP cực kỳ thấp.
- Bot có thể tiếp tục di chuyển khi thực hiện điệu nhảy đôi, điều này phá vỡ hiệu ứng dự định của Festive Critical Strike.
- Bot Medic vừa bị sát thương thường từ chối dùng Syringe Gun ở tầm xa, thích cận chiến hơn (hoặc, trong trường hợp rất hiếm, cố đánh bạn bằng tia Medi Gun).
- Bot Medic không bù độ rơi trọng lực cho đạn Syringe Gun -- có khả năng vì vũ khí này không được gắn cờ hitscan đúng trong mã AI.
- Bot Spy có thể thấy và theo dõi Spy đang tàng hình (người chơi hoặc AI) nếu Spy đó đã từng lộ diện, bất kể cấp kỹ năng của bot theo dõi.
- Ngay cả khi người chơi Spy cải trang thành lớp của phe mình, va vào kẻ địch vẫn làm lộ chúng (bot không bao giờ tự làm điều này, vì bot không bao giờ cải trang thành phe mình).
- Bot tôn trọng cân bằng đội tự động -- nếu bạn đang cố dồn bot về một đội, bạn cần `mp_teams_unbalance_limit 0` trước.
- Bot Engineer đôi khi hoàn toàn phớt lờ công trình của chính mình cho đến khi chúng bị phá hủy.
- Bot Heavy đôi khi cố bắn Minigun khi gần hết đạn, chủ yếu ở độ khó dưới Khó.
- Bot Medic của đội thua đôi khi tự sát trong giai đoạn Nhục nhã khi không có kẻ địch nào gần -- điều mà người chơi không thể làm được dù có cố.
- Đặt màn hình chọn đội thành BLU sẽ khiến bot RED hiển thị màu BLU cho bạn.
- Bot đang cầm vũ khí cận chiến đôi khi từ chối đổi vũ khí ngay cả sau khi nhặt đạn.
- Sau bản cập nhật Jungle Inferno, bot được sinh với tham số rõ ràng (ví dụ `tf_bot_add 5 pyro blue normal`) có thể chết ngay trong phòng sinh của chính chúng. Cách sửa: `tf_bot_reevaluate_class_in_spawnroom 0` (cần `sv_cheats 1`).

### Tên AI

Tên bot được lấy từ một kho tham chiếu lớn đến TF2, các game khác của Valve và văn hóa lập trình, phần lớn vì cộng đồng liên tục yêu cầu những tên cụ thể trên Steam forums. Một mẫu danh sách: *AimBot, Aperture Science Prototype XR7, Black Mesa, Companion Cube, C++, Divide by Zero, GLaDOS, H@XX0RZ, Saxton Hale, The G-Man, trigger_hurt, 0xDEADBEEF*, và hàng tá tên tương tự.

Cũng có một loạt tên được tìm thấy trong bản dựng nguồn bị rò rỉ chưa từng được phát hành chính thức, vì lý do không rõ -- chủ yếu là các tham chiếu từ *Last Dragon* và *The Fifth Element* như *John Spartan, Leeloo Dallas Multipass, Sho'nuff, Bruce Leroy, Big Gulp Huh?*, và *I'm your huckleberry*.

Bạn có thể ghi đè tất cả: `tf_bot_add heavyweapons blue "Blu Hoovy"` sinh một BLU Heavy tên là "Blu Hoovy."

---

## Chương II: Bot Gốc / TFBot -- Phân Tích Sâu Cấp Độ Kỹ Năng

Khung phân tích gốc của Sigsegv vẫn đúng: rõ ràng bot Chuyên gia chơi hay hơn bot Dễ, nhưng Valve chưa bao giờ giải thích *bao nhiêu* hay *tại sao*. Vì vậy cách duy nhất để biết là đọc mã nguồn. Dưới đây là mọi cơ chế thay đổi theo kỹ năng.

### Thiết lập độ khó

Bên ngoài MvM, độ khó được điều khiển bởi một cvar:

| `tf_bot_difficulty` | Cấp độ kỹ năng |
| --- | --- |
| 0 | Dễ |
| 1 | Thường (mặc định) |
| 2 | Khó |
| 3 | Chuyên gia |

`tf_bot_add` cũng chấp nhận tham số độ khó trực tiếp (`easy`/`normal`/`hard`/`expert`).

### Popfile MvM

Trong Mann vs. Machine, mỗi block sinh `TFBot` trong popfile có một khóa `Skill` tùy chọn. Không có khóa nghĩa là Dễ. Trong các nhiệm vụ chính thức của Valve: Giant hầu như luôn là Chuyên gia, Engineer và Spy hầu như luôn là Chuyên gia, và Sniper thường là Khó (thỉnh thoảng Chuyên gia). Nếu bạn dùng `EventChangeAttributes` (thêm vào trong bản cập nhật Two Cities) để thay đổi bot linh hoạt giữa đợt dựa trên sự kiện map, kỹ năng bot là một trong những thuộc tính bạn được phép thay đổi ngay lập tức.

### Chế độ Vô Tận MvM

Chế độ Vô tận chưa bao giờ được phát hành chính thức, nhưng trong đó, bot tiêu tiền nâng cấp như người chơi -- bao gồm một nâng cấp độc quyền của bot giúp tăng cấp độ kỹ năng AI giữa trận.

### Entity `bot_generator`

Một entity ít biết, hầu như không có tài liệu, được cho là đã dùng trong chế độ luyện tập và có thể trong quá trình phát triển MvM ban đầu. Nó có đầu vào `SetDifficulty` để kiểm soát cấp độ kỹ năng. Ngoài ra, thông tin rất mơ hồ -- Valve chưa bao giờ ghi chép nó và chưa ai lập bản đồ đầy đủ hành vi của nó.

### Màu mắt phát sáng

Robot trong MvM có hiệu ứng hạt phát sáng mắt thay đổi màu theo cấp độ kỹ năng -- một dấu hiệu trực quan mà chưa ai ngoài cộng đồng từng giải thích:

| Kỹ năng | Màu mắt | RGB |
| --- | --- | --- |
| Dễ/Thường | Xanh dương | `#24b4ff` |
| Khó/Chuyên gia | Vàng | `#fff000` |

![Bot Heavy TF2 ở tư thế đứng yên](assets/tf2-bot-ai-heavy-idle.png)

### Tầm nhìn: thời gian nhận diện

Bot không phản ứng ngay khi thứ gì đó vào tầm nhìn của nó -- có một độ trễ được lập trình cứng trước khi phần còn lại của AI được phép thừa nhận mối đe dọa:

| Kỹ năng | Thời gian nhận diện tối thiểu |
| --- | --- |
| Dễ | 1,00 giây |
| Thường | 0,50 giây |
| Khó | 0,30 giây |
| Chuyên gia | 0,20 giây |

Đó là phần lớn hiệu ứng "bot Dễ có vẻ ngu đần" trong một con số -- bot Dễ không ngắm tệ hơn khi nó thấy bạn, nó chỉ mất thời gian gấp năm lần để nhận ra bạn tồn tại.

### Ngắm: tốc độ cập nhật

Bot không theo dõi bạn liên tục. Chúng lấy mẫu vị trí và vận tốc của bạn ở một khoảng thời gian cố định và dự đoán đường thẳng từ đó:

| Kỹ năng | Khoảng thời gian tính lại | Tốc độ tương đương |
| --- | --- | --- |
| Dễ | 1,00 giây | 1 lần/giây |
| Thường | 0,25 giây | 4 lần/giây |
| Khó | 0,10 giây | 10 lần/giây |
| Chuyên gia | 0,05 giây | 20 lần/giây |

**Ngoại lệ:** Bot Spy được lập trình cứng ở tốc độ theo dõi Thường bất kể cấp kỹ năng thực tế -- một Spy Chuyên gia vẫn ngắm như bot Thường. Cũng có một video trình diễn công khai so sánh tốc độ theo dõi cạnh nhau nếu bạn muốn thấy khoảng cách 1 lần so với 20 lần trong thực tế.

### Ngắm: kỹ năng theo từng vũ khí

Bot không chỉ ngắm vào tâm khối của bạn -- chúng có logic theo từng vũ khí, một số thực sự có lỗi:

**Súng phóng lựu & Bẫy dính.** Mọi cấp kỹ năng đều bù đường cong thẳng đứng, dùng một giá trị cố định từ cvar `tf_bot_ballistic_elevation_rate`. Vì việc bù đó chỉ kích hoạt cho ID vũ khí gốc, các biến thể đạn nhanh hơn (Loch-n-Load, bất kỳ thứ gì có chỉ số tốc độ đạn) không được điều chỉnh đường cong chính xác. Và vì nó gắn với ID vũ khí cụ thể, Loose Cannon -- một ID hoàn toàn khác -- không được bù đường cong nào cả.

**Huntsman.** Bot Dễ không bù độ rơi mũi tên và không bao giờ nhắm đầu. Bot kỹ năng Thường bù đường cong, nhưng chỉ nhắm đầu trong phạm vi 150 HU. Bot Khó/Chuyên gia luôn nhắm đầu.

**Súng Rocket.** Trên 150 HU, bot không phải Dễ nhắm vào chân bạn thay vì tâm khối, tối đa hóa sát thương lan và tỷ lệ knockback. Trong 150 HU chúng chuyển sang nhắm đầu. Bot Dễ luôn nhắm tâm khối bất kể khoảng cách. Điều này cũng bị khóa theo ID vũ khí: Direct Hit và Cow Mangler không kế thừa hành vi này. Hợp lý cho Direct Hit (không có AoE để khai thác); hoàn toàn vô lý cho Cow Mangler -- phần AI này có trước khi vũ khí tồn tại và đơn giản là chưa bao giờ được xem xét lại.

**Súng Sniper.** Dễ nhắm vào thân. Thường nhắm khoảng 33% từ thân lên đầu. Khó/Chuyên gia nhắm thẳng vào đầu. Ít quan trọng hơn trong MvM, nơi headshot của bot không nhận thưởng sát thương.

### Thính giác: độ nhạy với đạn lén

Mọi tiếng súng đều cảnh báo bot gần đó về vị trí của người bắn, ngay cả qua tường, trong phạm vi 3000 HU với 100% cơ hội phát hiện (`tf_bot_notice_gunfire_range`). Nhưng một số vũ khí được gắn cờ "lén" -- chỉ nghe được trong phạm vi 500 HU (`tf_bot_notice_quiet_gunfire_range`), và ngay cả khi đó cũng có xác suất phụ thuộc vào kỹ năng:

| Kỹ năng | Cơ hội phát hiện đạn lén |
| --- | --- |
| Dễ | 10% |
| Thường | 30% |
| Khó | 60% |
| Chuyên gia | 90% |

Xác suất đó bị giảm một nửa nếu có tiếng súng *lớn* được nghe thấy trong 3 giây qua -- âm thanh lớn che lấp âm thanh nhỏ.

Danh sách ID vũ khí lén đã không được cập nhật từ tháng 12 năm 2010. Bất cứ thứ gì thêm vào sau ngày đó với ID vũ khí mới đều bị coi là lớn theo mặc định, bất kể logic nó có nên nhỏ đến đâu, trừ khi nó tình cờ dùng lại ID cũ. Cụ thể:

| ID vũ khí | Bao gồm |
| --- | --- |
| `TF_WEAPON_KNIFE` | Tất cả dao của Spy |
| `TF_WEAPON_FISTS` | Đòn đấm của Heavy (đòn đấm đa lớp của anh ta thực ra là `TF_WEAPON_FIREAXE`) |
| `TF_WEAPON_PDA` | Được cho là không dùng trực tiếp |
| `TF_WEAPON_PDA_ENGINEER_BUILD` | PDA Xây dựng của Engineer |
| `TF_WEAPON_PDA_ENGINEER_DESTROY` | PDA Phá hủy của Engineer |
| `TF_WEAPON_PDA_SPY` | Bộ cải trang của Spy |
| `TF_WEAPON_BUILDER` | Bộ đồ nghề Engineer/Sapper của Spy |
| `TF_WEAPON_MEDIGUN` | Tất cả Súng Medi |
| `TF_WEAPON_DISPENSER` | Có thể không dùng (Dispenser là vật thể, không phải vũ khí) |
| `TF_WEAPON_INVIS` | Tất cả đồng hồ tàng hình của Spy |
| `TF_WEAPON_FLAREGUN` | Tất cả súng pháo sáng của Pyro *ngoại trừ* Manmelter |
| `TF_WEAPON_LUNCHBOX` | Sandwich, Dalokohs Bar, Buffalo Steak Sandvich, Bonk!, Crit-a-Cola |
| `TF_WEAPON_JAR` | Jarate (không phải Mad Milk -- ID riêng, không lén) |
| `TF_WEAPON_COMPOUND_BOW` | Huntsman |
| `TF_WEAPON_SWORD` | Eyelander, Skullcutter, Claidheamh Mòr, Persian Persuader, Half-Zatoichi |
| `TF_WEAPON_CROSSBOW` | Crusader's Crossbow |

Ví dụ kinh điển về danh sách mục nát: Manmelter có ID riêng (`TF_WEAPON_RAYGUN_REVENGE`), được thêm vào sau khi danh sách lén bị đóng băng -- vì vậy nó bị coi là lớn, mặc dù thực tế nó là súng pháo sáng. Scorch Shot, phát hành muộn hơn, dùng lại ID `TF_WEAPON_FLAREGUN` gốc và do đó vẫn được coi là lén. Vô lý, nhưng đó là mã nguồn.

### Chiến thuật: ưu tiên mối đe dọa

Khi nhiều kẻ địch hiện ra cùng lúc, bot cân nhắc khoảng cách, liệu chúng có đang bị bắn không, và -- trên Dễ -- liệu mối đe dọa chính có đang được chữa trị không:

| Kỹ năng | Nhắm vào người chữa trị thay vì? |
| --- | --- |
| Dễ | Không |
| Thường | 50% cơ hội |
| Khó | Có |
| Chuyên gia | Có |

Kẻ địch cách xa 500 HU thường bị giảm ưu tiên như không khẩn cấp. Ngoại lệ: bot Khó/Chuyên gia luôn coi Medic và Engineer ở xa là mối đe dọa khẩn cấp, và bất kỳ Sniper địch nào đang ngắm về phía bạn luôn bị coi là khẩn cấp bất kể khoảng cách và kỹ năng.

| Kỹ năng | Medic/Engineer ở xa/Sniper đang ngắm = mối đe dọa khẩn cấp? |
| --- | --- |
| Dễ/Thường | Không |
| Khó/Chuyên gia | Có |

Việc kiểm tra Sniper đó có một lịch sử thú vị. Bản viết gốc của sigsegv cho rằng game yêu cầu tích vô hướng giữa vector ngắm của sniper và vị trí tương đối của bot phải *chính xác bằng không* -- một phép so sánh chính xác đến mức hầu như không bao giờ kích hoạt trong số học dấu phẩy động, khiến toàn bộ tính năng trở thành mã chết. Một hiệu chỉnh sau đó (nhờ một bản dịch ngược Hex-Rays sạch hơn) cho thấy kiểm tra thực tế là `tích vô hướng > 0`: bất kỳ Sniper nào đang đối diện từ hướng thẳng vào bạn đến vuông góc với bạn đều bị coi là mối đe dọa khẩn cấp; bất cứ thứ gì từ vuông góc đến quay lưng thì không. Sai sót ban đầu đến từ việc dịch ngược tệ một phép so sánh float SSE -- dịch ngược binary AAA không phải khoa học chính xác.

### Di chuyển: né tránh

Bot Dễ không bao giờ né tránh, chấm hết. Bot từ Thường trở lên né trái/phải (33% trái, 33% phải, 33% không làm gì, có trọng số theo khoảng trống phát hiện) khi chúng đang cầm vũ khí chiến đấu, đã thấy kẻ địch trong 3 giây qua và kẻ địch đó có tầm nhìn thẳng tới chúng.

Chúng sẽ *không* né nếu có bất kỳ điều nào sau đây: thuộc tính `DisableDodge` được đặt, hành vi hiện tại bảo phải nhanh lên, đang bất khả xâm phạm (bất kỳ über nào), đang giữa điệu nhảy/khiêu khích, đang chơi Engineer, tàng hình hoặc cải trang thành Spy, đang ngắm làm Sniper hoặc đang quay súng làm Heavy, hoặc đang giữa lúc kéo cung Huntsman.

### Di chuyển: tránh xô đẩy kẻ địch

Trên Thường, bot đặc biệt cố gắng không va vào kẻ địch khi di chuyển:

| Kỹ năng | Tránh va chạm kẻ địch? |
| --- | --- |
| Dễ | Không |
| Thường | Không |
| Khó | Có |
| Chuyên gia | Có |

Trong thực tế, điều này chỉ thực sự quan trọng với bot Spy -- tránh một vụ va chạm khó xử với người chơi địch chính là thứ làm lộ cải trang.

### Pyro: khả năng airblast

Airblast phục vụ hai mục đích: phản đạn (PvP và MvM) và đẩy kẻ địch gần đó khỏi vực (chỉ PvP). Liệu bot có thực sự kích hoạt khi có cơ hội hợp lệ hay không là một lần tung đồng xu dựa trên kỹ năng:

| Kỹ năng | Cơ hội kích hoạt airblast |
| --- | --- |
| Dễ | 0% |
| Thường | 50% |
| Khó | 90% |
| Chuyên gia | 100% |

Bot Pyro Dễ hoàn toàn không thể airblast -- tỷ lệ được lập trình cứng không bao giờ thành công, không chỉ "hiếm khi."

### Spy: hiệu quả cải trang

Hai trục riêng biệt thay đổi theo kỹ năng. Lựa chọn *cải trang*:

| Kỹ năng | Phương pháp cải trang |
| --- | --- |
| Dễ/Thường | Lớp ngẫu nhiên, bỏ qua lớp mà đội địch thực sự đang chơi |
| Khó/Chuyên gia | Chọn một người chơi địch thực và sao chép chính xác lớp của họ |

Diễn xuất *cải trang*:

| Kỹ năng | Hành vi khi cải trang/tàng hình |
| --- | --- |
| Dễ/Thường | Nhìn chằm chằm vào người chơi địch khi thấy họ (đáng ngờ) |
| Khó/Chuyên gia | Cố tình tránh giao tiếp bằng mắt (thuyết phục hơn) |

### Spy: độ hung hăng đâm sau lưng

Ở tầm xa (lên đến 300 HU, `tf_bot_spy_knife_range`), bot Spy chỉ cam kết đâm sau lưng nếu nó có thể thấy nạn nhân và lưng nạn nhân ít nhất đã quay đi một phần. Kỹ năng quyết định góc lệch cho phép đó rộng đến đâu:

| Kỹ năng | Dung sai góc |
| --- | --- |
| Dễ | Sẽ đâm ngay cả khi đối diện trực tiếp |
| Thường | ±45° từ sau lưng bạn |
| Khó | ±78° từ sau lưng bạn |
| Chuyên gia | ±90° từ sau lưng bạn (toàn bộ cung 180° phía sau) |

Bot Spy Dễ có chức năng tự sát -- chúng sẽ cố đâm ai đó đang nhìn thẳng vào chúng. **Ngoại lệ:** trong Mann vs. Machine, mọi bot Spy đều bị ép vào ràng buộc góc Thường bất kể kỹ năng thực tế.

### Chiến thuật: chọn vũ khí

Chỉ kích hoạt trên Dễ và hầu như không liên quan trong MvM vì bot ở đó thường bị giới hạn vũ khí cứng:

- **Scout**: chuyển sang vũ khí phụ khi băng đạn chính hết.
- **Soldier**: chuyển sang vũ khí phụ khi hết đạn *và* mục tiêu gần hơn 500 HU.
- **Sniper**: chuyển sang vũ khí phụ cho mục tiêu gần hơn 750 HU.
- **Pyro**: chuyển sang vũ khí phụ cho mục tiêu xa hơn 750 HU, trừ khi mục tiêu đó là Soldier hoặc Demoman.

### Chiến thuật: nạp đạn sau che chắn

Không dùng trong MvM. Nếu hành vi hiện tại của bot không bảo nó rút lui, băng đạn chính đã hết và nó không được uber, bot kỹ năng cao hơn sẽ tạm thời rút lui về chỗ nấp để nạp đạn thay vì bắn súng không đạn vào bạn:

| Kỹ năng | Rút lui để nạp đạn? |
| --- | --- |
| Dễ | Không |
| Thường | Không |
| Khó | Có |
| Chuyên gia | Có |

### Chế độ CP: lang thang của người phòng thủ

Không dùng trong MvM. Khi phòng thủ điểm kiểm soát, bot kỹ năng cao hơn có nhiều khả năng rời điểm để săn mạng ("search and destroy"), nhưng chỉ khi còn một khoảng thời gian kha khá trong `tf_bot_defense_must_defend_time`:

| Kỹ năng | Cơ hội lang thang |
| --- | --- |
| Dễ | 10% |
| Thường | 50% |
| Khó | 75% |
| Chuyên gia | 90% |

### Chế độ CP: chặn chiếm điểm

Không dùng trong MvM. Bot phòng thủ tranh chấp khi kẻ địch đang cố chiếm điểm:

| Kỹ năng | Sẽ cố chặn chiếm điểm? |
| --- | --- |
| Dễ | Không |
| Thường | 50% cơ hội |
| Khó | Có |
| Chuyên gia | Có |

---

## Bảng tổng hợp đầy đủ

<div style="overflow-x:auto">

| Khía cạnh | Dễ | Thường | Khó | Chuyên gia | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| Tầm nhìn: thời gian nhận diện | 1,00s | 0,50s | 0,30s | 0,20s | |
| Ngắm: tốc độ cập nhật | 1 lần/s | 4 lần/s | 10 lần/s | 20 lần/s | Spy luôn dùng Thường |
| Bù đường cong lựu/bẫy dính | Có | Có | Có | Có | Loose Cannon miễn trừ |
| Bù đường thẳng đứng Huntsman | Không | Có | Có | Có | |
| Headshot Huntsman | Không | <150 HU | Có | Có | |
| Nhắm chân Rocket | Không | Có | Có | Có | Direct Hit & Cow Mangler miễn trừ |
| Điểm ngắm Súng Sniper | Thân | ~33% lên đầu | Đầu | Đầu | |
| Cơ hội phát hiện đạn lén | 10% | 30% | 60% | 90% | Giảm nửa nếu bị tiếng lớn che |
| Nhắm vào người chữa trị | Không | 50% | Có | Có | |
| Medic/Engineer/Sniper xa = đe dọa | Không | Không | Có | Có | |
| Né tránh | Không | Có | Có | Có | Danh sách ngoại lệ dài |
| Tránh va chạm kẻ địch | Không | Không | Có | Có | Chủ yếu cho Spy |
| Cơ hội kích hoạt airblast | 0% | 50% | 90% | 100% | |
| Chọn lớp cải trang Spy | Ngẫu nhiên | Ngẫu nhiên | Khớp địch thật | Khớp địch thật | |
| Giao tiếp mắt của Spy khi cải trang | Nhìn chằm chằm (rõ) | Nhìn chằm chằm | Tránh (thuyết phục) | Tránh | |
| Góc đâm Spy | ~0° | ±45° | ±78° | ±90° | MvM ép Thường |
| Logic chọn vũ khí | Không | Có | Có | Có | Ít liên quan trong MvM |
| Nạp đạn sau che chắn | Không | Không | Có | Có | Không trong MvM |
| Lang thang phòng thủ CP | 10% | 50% | 75% | 90% | Không trong MvM |
| Chặn chiếm điểm CP | Không | 50% | Có | Có | Không trong MvM |

</div>

---

## Kết luận

![Bot Heavy TF2 đang ngắm súng minigun](assets/tf2-bot-ai-heavy-aim.png)

Không có điều nào trong số này là phỏng đoán sai lầm từ phía Valve -- đó là một hệ thống tính điểm và xác suất có chủ đích, hoàn toàn xác định, chỉ là chưa bao giờ được viết ra ở bất kỳ đâu chính thức. Một vài điều đáng nhớ:

1. **"Kỹ năng" là một tập hợp các núm điều chỉnh độc lập**, không phải một số nhân toàn cục. Thời gian phản ứng, tốc độ ngắm và mọi hành vi chiến thuật thay đổi riêng rẽ, và một vài thứ (tốc độ theo dõi của Spy, góc đâm trong MvM) bị ghi đè cứng bất kể kỹ năng.
2. **Một số thứ này thực sự có lỗi, không chỉ cũ kỹ.** Danh sách vũ khí lén bị đóng băng từ năm 2010, Cow Mangler thiếu logic nhắm chân vì không có lý do chính đáng, phép kiểm tra tích vô hướng của Sniper mất nhiều năm để dịch ngược chính xác -- mã AI của Valve có sẹo như bất kỳ codebase 17 năm tuổi nào.
3. **Bạn có thể dùng tất cả những điều này.** Biết rằng bot Sniper sẽ không headshot bạn ở Thường, rằng Pyro Dễ hoàn toàn không thể airblast rocket của bạn lại, rằng Spy Dễ sẽ cố đâm bạn mặt đối mặt. Đó không phải may mắn. Đó là một bảng thông số.

Cảm ơn rất nhiều đến sigsegv vì công trình đào mã nguồn ban đầu đã làm nên phần lớn điều này, đến TF2 Wiki vì tài liệu cơ sở về lệnh bot và hỗ trợ map, và đến tất cả mọi người trong cộng đồng vẫn đang mổ xẻ một bot AI 17 năm tuổi để tìm ra chính xác tại sao nó làm những gì nó làm.
