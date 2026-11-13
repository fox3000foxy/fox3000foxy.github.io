---
title: "Bot TF2 không ngẫu nhiên : Tôi đã tái khám phá mọi tham số độ khó"
description: "Tầm nhìn, ngắm bắn, góc backstab, logic headshot, mọi bug đã biết -- Valve chưa từng ghi chép gì. Nên chúng tôi bới mã và biến tất cả thành tài liệu kỹ thuật đầy đủ."
date: 2026-07-12
authors:
  - fox3000foxy
tags:
  - tf2
  - jeu-ia
  - ingenierie-inversee
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "OMCh6h+R554Y/Z+u3gjR9h/5jDpzPfwamEe0r0qxKP2owfYs6xezYb0lAznlWY8eGWNqJ1/dbotQlfMHjWLi9Q=="
---

## Giới thiệu

![Bot Soldier TF2 ngắm bằng rocket launcher](assets/tf2-bot-ai-soldier-aim.png)

Mỗi người chơi TF2 đều nói ít nhất một lần : « bot này hack. » Hay ngược lại : « sao bot Dễ này đứng yên ăn rocket. » Không ai thực sự biết « Dễ », « Thường », « Khó » và « Chuyên gia » nghĩa là gì dưới nắp capo : Valve tung bốn nhãn độ khó và đúng không tài liệu nào.

Nên một nhóm chúng tôi (tôi, awimii, Mush The Possum, với phần lớn công nền do sigsegv thực hiện, người thực sự bới mã dịch ngược của game) đã gom tài liệu nghiên cứu đầy đủ về hành vi TFBot. Mỗi cơ chế, mỗi bug đã biết, mỗi xác suất ghi cứng. Bài này là báo cáo toàn văn, không phải bản rút gọn. Lấy Bonk đi, sẽ dài đấy.

---

## Chương I : Nền tảng

### Bot đấu Bot Con Rối

TF2 có hai thứ hoàn toàn khác nhau mà người ta gọi là « bot » :

- **Bot AI (TFBots)** : AI thật, dựng trên cùng framework PlayerBot/Infected mà Valve dùng cho series *Left 4 Dead*. Chúng chọn lớp ngẫu nhiên, chơi mục tiêu, chạy không cần `sv_cheats` và kích hoạt thành tựu như người chơi thật.
- **Bot Con Rối** : không AI, không thể tự di chuyển hay hành động. Chúng tồn tại chỉ để điều khiển tay -- người chơi có thể ép chúng theo, ngắm và bắn. Chủ yếu dùng để test hay làm ảnh chụp màn hình và video điện ảnh. Triệu hồi chúng đòi `sv_cheats 1`, điều này cũng tắt thành tựu cho phiên.

Bài này hoàn toàn về kiểu đầu.

### Điều ta có thể (ít nhiều) bảo bot AI làm

TFBot không điều khiển trực tiếp được, nhưng ta có thể dụ chúng làm vài việc :

- Nhắm vào bất kỳ bot nào (phe ta hay địch) bằng crosshair và nó sẽ trêu bạn nếu bạn dùng lệnh thoại đúng.
- Bot Medic phe ta sẽ hồi máu bạn nếu bạn dùng lệnh thoại « Medic! »
- Nếu bot Medic đang hồi máu bạn và có UberCharge sẵn, nói « Go go go! » hay « Activez la charge! » khiến nó kích hoạt charge ngay.
- Bot Medic có charge sẵn tự kích hoạt hễ bản thân hay mục tiêu hồi của nó chịu sát thương nặng, không cần lệnh thoại.
- Bot tự trêu đôi (High Five) hay trêu nhóm (Conga) với đồng đội gần.

### Cho bot chạy trên bản đồ không hỗ trợ

Bot phụ thuộc lưới điều hướng để biết chúng được đi đâu, và hầu hết bản đồ cộng đồng không cung cấp. Để ép :

1. `sv_cheats 1`
2. `nav_generate` -- dựng navmesh ban đầu, tiến trình hiện trong console
3. Chờ game sinh xong đường đi
4. Tùy chọn, sửa tay dữ liệu điều hướng xấu bằng `nav_edit 1`
5. Tải lại hay khởi động lại máy chủ (bỏ bước này tắt thành tựu)
6. `tf_bot_add <số lượng>` để thả bot

**Cảnh báo :** sửa navmesh trong khi bot đang hoạt động trên máy chủ có thể làm sập game. Khi lưới đã tồn tại, bạn không cần tạo lại cho các phiên sau : chỉ thêm bot bằng `tf_bot_add`.

Lưới tự sinh chạy tốt nhất trên bản đồ Point de Contrôle, King of the Hill, Payload và CTF. Trên bản đồ Mannpower, bot mặc định hành vi kiểu CTF nhưng hầu như không dùng móc hay powerup. Nếu bản đồ không có mục tiêu AI bot nhận ra nhưng có thực thể phòng sinh, đặt `tf_bot_offense_must_push_time 0` cho phép bot vẫn chiến đấu.

*(Nguồn cho mục này : trang Bots của wiki TF2 chính thức.)*

### Trạng thái hiện tại, bản đồ theo bản đồ

Nhờ cập nhật Hatless, mỗi lớp chạy đúng giờ, kể cả Spy vốn bug lịch sử. Bot hành xử đúng trên hầu hết bản đồ KOTH chính thức, vài bản đồ Payload, Dustbowl/Gorge Attack-Defense và bản đồ CTF/Mann Manor. Trên hai bản đồ sau, bạn không thể thả chúng trực tiếp bằng `tf_bot_add`. Trên bản đồ không hỗ trợ (qua quy trình nav_generate trên), chúng chạy, nhưng kém hẳn việc bắt chước người chơi thật.

Bản đồ PLR là án thua : bot không qua được rào trên Hightower và kẹt trong góc, và trên mọi bản đồ PLR khác chúng chỉ... mở tiệc nhảy thay vì chơi. Có thể một ngày sẽ sửa, có thể sẽ giữ nguyên.

### Hành vi chung của bot

Túi tổng hợp những việc mỗi bot làm bất kể cấp :

- Bot chỉ dùng loadout cơ bản (plugin có thể ép chúng dùng vũ khí không chuẩn, nhưng bot vanilla không bao giờ tự chọn).
- Bot Dễ hầu như không dùng vũ khí phụ. Cấp cao hơn chuyển sang vũ khí phụ hễ băng đạn chính hết, hay để bù khoảng cách.
- Bot lờ kỹ thuật di chuyển nâng cao : không rocket jump, không di dời công trình.
- Sau một mạng, bot có thể trêu, ngay cả dưới hỏa lực, trừ khi nó mang tin tình báo địch, và quy tắc này cũng áp trong MvM.
- Bot Spy cải trang (người hay AI) được các bot khác lờ đúng : tới khi nó chạm địch, phá hoại gì đó, bắn hay thành vô hình gần địch. Khi « lộ », bot/người chơi cụ thể đó bị nhớ là Spy tới khi nó đổi cải trang trong lúc vô hình, chết hay giả chết bằng Dead Ringer.
- Bot Pyro dùng Compression Blast thoải mái từ cấp Thường.
- Bot Medic ưu tiên hồi máu mọi người trừ Sniper (và, ở mức ít hơn, Engineer), ngay cả khi bạn spam « Medic! » trong vai đó.
- Bot Medic bị hút về Heavy, Soldier, Demoman và Pyro : cụ thể khi *con người* chơi các lớp này. Chú ý này theo sự hiện diện của con người trong các vai đó.
- Bot giữ vị trí trong thời gian chuẩn bị trên bản đồ Attack/Defense và Payload, trừ Engineer, Sniper và Spy, di chuyển tự do (bot Demoman cũng được phép đặt trước bom dính).
- Bot Engineer không bao giờ nâng cấp hay tắt công trình của Engineer phe ta khác, trừ khi công trình đó nằm trên đường tới mục tiêu của nó. Đôi khi chúng đơn giản không sửa tháp pháo của chính mình, ngay cả khi trông hiển nhiên.
- Bot Spy bị lộ chuyển sang revolver và lùi thay vì ép dao.
- Bot Demoman đã định vị sentry (thường bằng cách chết lên nó một lần) có thể ném bom dính hoàn hảo lên đó từ ngoài tầm của nó, theo vòng cung xuyên tường và trần khi hình học cho phép.
- Bot Sniper không thấy mục tiêu sau khi ngắm dùng một trong các dòng thoại « Negatives. »
- Medic phe ta hồi máu Spy cải trang không do dự.

### Vấn đề / bug đã biết

Tài liệu liệt kê kha khá kỳ quặc lâu đời :

- Bot có thể cố đi hay bắn xuyên vài prop tĩnh.
- Mỗi khi người chơi/bot lộ mặt, cải trang hay hiện hình, bot gần « thấy » nó và quay lại phản ứng : ngay cả khi sự kiện xảy ra ngoài tầm nhìn thật của chúng. Việc này không dựa trên âm thanh ; đó là cách lách kiểm tra tầm nhìn.
- Hiếm khi, bot có thể kẹt vật lý vào nhau khi dùng teleporter của Engineer.
- Lệnh thoại của bot (vd « Spy! », « En avant! ») không hiện dạng văn bản trong chat như của người chơi.
- Bot Medic đang hồi máu ai đó sẽ không né đạn tới hay lấy kit máu, ngay cả ở máu nguy kịch.
- Bot có thể tiếp tục di chuyển trong lúc trêu đôi, phá hiệu ứng dự kiến của Festive Critical Strike.
- Bot Medic vừa bị thương thường từ chối dùng Syringe Gun ở xa, thích cận chiến (hay, rất hiếm, cố chạm bạn bằng tia Medi Gun).
- Bot Medic không bù trọng lực cho đạn Syringe Gun : có lẽ vì vũ khí không được đánh dấu đúng là phi hitscan trong mã AI.
- Bot Spy có thể thấy và theo Spy vô hình (người hay AI) nếu Spy đó đã từng bị lộ một lần, bất kể cấp của bot đang theo.
- Ngay cả khi người chơi Spy cải trang thành lớp của đội mình, chạm địch vẫn lộ mặt (bot không bao giờ tự làm vậy, vì bot không bao giờ cải trang thành đội mình).
- Bot tôn trọng tự cân bằng đội : nếu bạn cố dồn bot một bên, bạn phải dùng `mp_teams_unbalance_limit 0` trước.
- Bot Engineer có thể hoàn toàn lờ công trình của chính mình tới khi chúng bị phá.
- Bot Heavy đôi khi cố bắn Minigun trong khi hết đạn, nhất là dưới cấp Khó.
- Bot Medic đội thua thỉnh thoảng tự sát trong giai đoạn Humiliation khi không địch nào gần -- điều người chơi không thể tái tạo dù cố.
- Đặt xem trước đội thành BLU trong màn hình tải khiến bot RED trông như render thành BLU với bạn.
- Bot đang cầm vũ khí cận chiến đôi khi từ chối đổi vũ khí ngay cả sau khi nhặt đạn.
- Sau Jungle Inferno, bot thả với tham số rõ (vd `tf_bot_add 5 pyro bleu normal`) có thể chết ngay trong phòng sinh của chính mình. Sửa : `tf_bot_reevaluate_class_in_spawnroom 0` (đòi `sv_cheats 1`).

### Tên của AI

Tên bot lấy từ kho lớn tham chiếu tới TF2, game khác của Valve và văn hóa lập trình, phần lớn vì cộng đồng cứ đòi các tên cụ thể trên diễn đàn Steam. Mẫu danh sách : *AimBot, Aperture Science Prototype XR7, Black Mesa, Companion Cube, C++, Divide by Zero, GLaDOS, H@XX0RZ, Saxton Hale, The G-Man, trigger_hurt, 0xDEADBEEF*, và hàng chục cái khác cùng kiểu.

Ngoài ra có loạt tên thấy trong build mã nguồn rò rỉ chưa bao giờ lên production, vì lý do không rõ : chủ yếu tham chiếu *Last Dragon* và *The Fifth Element* như *John Spartan, Leeloo Dallas Multipass, Sho'nuff, Bruce Leroy, Big Gulp Huh?* và *I'm your huckleberry*.

Bạn có thể thay tất cả tự làm : `tf_bot_add heavyweapons blue "Blu Hoovy"` thả Heavy BLU tên « Blu Hoovy. »

---

## Chương II : Bot Gốc / TFBots -- Lặn vào Cấp Độ

Khung gốc của Sigsegv vẫn đúng : rõ ràng bot Chuyên gia vượt bot Dễ, nhưng Valve chưa bao giờ giải thích *bao nhiêu* hay *vì sao*. Nên cách duy nhất để biết là đọc mã. Đây là mỗi cơ chế évoluent theo cấp.

### Chỉnh độ khó

Ngoài MvM, độ khó điều khiển bằng cvar :

| `tf_bot_difficulty` | Cấp độ |
| --- | --- |
| 0 | Dễ |
| 1 | Thường (mặc định) |
| 2 | Khó |
| 3 | Chuyên gia |

`tf_bot_add` cũng nhận đối số độ khó trực tiếp (`easy`/`normal`/`hard`/`expert`).

### Popfile MvM

Trong Mann vs. Machine, mỗi khối spawn `TFBot` trong popfile có khóa `Skill` tùy chọn. Thiếu khóa khớp cấp Dễ. Trong nhiệm vụ của Valve : Giant gần như luôn Chuyên gia, Engineer và Spy gần như luôn Chuyên gia, và Sniper thường Khó (thỉnh thoảng Chuyên gia). Nếu bạn dùng `EventChangeAttributes` (thêm trong cập nhật Two Cities) để sửa động bot giữa đợt theo sự kiện bản đồ, cấp của bot là một trong các thuộc tính bạn có thể đổi tức thì.

### Chế độ Endless MvM

Chế độ Endless chưa bao giờ chính thức lên sóng, nhưng trong đó, bot tiêu tiền vào nâng cấp như người chơi, kể cả nâng cấp chỉ bot tăng cấp AI trong lúc chơi.

### Thực thể `bot_generator`

Thực thể mù mờ, phần lớn không ghi chép, cho rằng từng dùng trong chế độ huấn luyện và có thể trong phát triển MvM sớm. Nó phơi bày đầu vào `SetDifficulty` để điều khiển cấp. Xa hơn, dấu vết nguội : Valve chưa bao giờ ghi chép nó và không ai vẽ đầy đủ hành vi của nó.

### Màu phát sáng mắt

Robot MvM có hạt phát sáng mắt đổi màu theo cấp, chỉ báo hình ảnh không ai ngoài cộng đồng từng giải thích :

| Cấp | Màu mắt | RVB |
| --- | --- | --- |
| Dễ/Thường | Xanh | `#24b4ff` |
| Khó/Chuyên gia | Vàng | `#fff000` |

![Bot Heavy TF2 ở tư thế chờ](assets/tf2-bot-ai-heavy-idle.png)

### Tầm nhìn : thời gian nhận diện

Bot không phản ứng tức thì khi thứ gì lọt vào tầm nhìn : có trễ ghi cứng trước khi phần còn lại của AI được phép nhận diện mối đe dọa :

| Cấp | Thời gian nhận diện tối thiểu |
| --- | --- |
| Dễ | 1,00 s |
| Thường | 0,50 s |
| Khó | 0,30 s |
| Chuyên gia | 0,20 s |

Đó là bản chất của hiệu ứng « bot Dễ trông ngu » trong một con số duy nhất : bot Dễ không ngắm kém hơn khi đã thấy bạn, nó chỉ mất gấp năm lần thời gian để nhận ra bạn tồn tại.

### Ngắm : tốc độ bám

Bot không bám bạn liên tục. Chúng lấy mẫu vị trí và vận tốc của bạn theo khoảng cố định và dự đoán đường thẳng từ đó :

| Cấp | Khoảng tính lại | Tốc độ tương đương |
| --- | --- | --- |
| Dễ | 1,00 s | 1x/s |
| Thường | 0,25 s | 4x/s |
| Khó | 0,10 s | 10x/s |
| Chuyên gia | 0,05 s | 20x/s |

**Ngoại lệ :** bot Spy ghi cứng với tốc độ bám Thường bất kể cấp thật : Spy Chuyên gia luôn ngắm như bot Thường. Ngoài ra có video demo công khai so sánh các tốc độ bám cạnh nhau nếu bạn muốn thấy chênh 1x đấu 20x khi động.

### Ngắm : kỹ năng theo vũ khí

Bot không chỉ ngắm khối tâm của bạn : chúng có logic theo vũ khí, đôi khi bug thật :

**Súng phóng lựu và Súng phóng bom dính.** Mọi cấp đều bù vòng cung đứng, dùng giá trị cố định của cvar `tf_bot_ballistic_elevation_rate`. Vì bù này chỉ kích hoạt với ID vũ khí nền, các biến thể đạn nhanh hơn (Loch-n-Load, mọi thứ có bổ trợ tốc độ đạn) không có vòng cung chỉnh đúng. Và vì nó gắn cụ thể theo ID vũ khí, Loose Cannon (ID khác) không nhận bù vòng cung nào.

**Huntsman.** Bot Dễ không bù rơi tên và không bao giờ tìm headshot. Bot cấp Thường bù vòng cung, nhưng chỉ ngắm đầu dưới 150 HU. Bot Khó/Chuyên gia luôn ngắm đầu.

**Súng phóng rocket.** Ngoài 150 HU, bot phi Dễ ngắm chân bạn thay vì khối tâm, tối đa hóa cơ hội sát thương vùng và hất văng. Dưới 150 HU, chúng chuyển sang headshot. Bot Dễ luôn ngắm khối tâm bất kể khoảng cách. Việc này cũng khóa theo ID vũ khí : Direct Hit và Cow Mangler không thừa hưởng hành vi này. Hợp lý với Direct Hit (không có vùng hiệu ứng để khai thác) ; vô nghĩa với Cow Mangler : phần AI này có trước cả khi vũ khí tồn tại và đơn giản chưa bao giờ xem lại.

**Súng bắn tỉa.** Dễ ngắm thân. Thường ngắm khoảng 33% từ thân lên đầu. Khó/Chuyên gia ngắm thẳng đầu. Ít quan trọng trong MvM, nơi headshot của bot đằng nào cũng không được thưởng sát thương.

### Thính giác : nhạy với phát bắn kín

Mỗi phát bắn báo cho bot gần về vị trí của xạ thủ, ngay cả xuyên tường, tới 3000 HU với 100% cơ hội bị chú ý (`tf_bot_notice_gunfire_range`). Nhưng tập con vũ khí được đánh dấu « kín » : chỉ nghe được trong 500 HU (`tf_bot_notice_quiet_gunfire_range`), và ngay cả vậy với cơ hội phụ thuộc cấp :

| Cấp | Cơ hội chú ý phát bắn kín |
| --- | --- |
| Dễ | 10% |
| Thường | 30% |
| Khó | 60% |
| Chuyên gia | 90% |

Xác suất này chia đôi nếu phát bắn *ồn* đã nghe trong 3 giây qua : âm lớn át âm nhỏ.

Danh sách ID vũ khí kín chưa cập nhật từ tháng 12 năm 2010. Mọi bổ sung sau dùng ID vũ khí mới mặc định bị coi là ồn, dù về logic nó kín tới đâu, trừ khi nó tái dùng ID cũ hơn. Cụ thể :

| ID vũ khí | Bao phủ |
| --- | --- |
| `TF_WEAPON_KNIFE` | Mọi dao của Spy |
| `TF_WEAPON_FISTS` | Đấm tay riêng của Heavy (cú đấm đa lớp của nó thực chất là `TF_WEAPON_FIREAXE`) |
| `TF_WEAPON_PDA` | Cho rằng không dùng trực tiếp |
| `TF_WEAPON_PDA_ENGINEER_BUILD` | PDA xây của Engineer |
| `TF_WEAPON_PDA_ENGINEER_DESTROY` | PDA phá của Engineer |
| `TF_WEAPON_PDA_SPY` | Kit cải trang của Spy |
| `TF_WEAPON_BUILDER` | Kit công cụ của Spy/Engineer/Saboteur |
| `TF_WEAPON_MEDIGUN` | Mọi Medi Gun |
| `TF_WEAPON_DISPENSER` | Có lẽ không dùng (Dispenser là vật thể, không phải vũ khí) |
| `TF_WEAPON_INVIS` | Mọi đồng hồ tàng hình của Spy |
| `TF_WEAPON_FLAREGUN` | Mọi súng pháo sáng Pyro *trừ* Manmelter |
| `TF_WEAPON_LUNCHBOX` | Sandwich, Dalokohs Bar, Buffalo Steak Sandvich, Bonk!, Crit-a-Cola |
| `TF_WEAPON_JAR` | Jarate (không phải Mad Milk -- ID riêng, không kín) |
| `TF_WEAPON_COMPOUND_BOW` | Huntsman |
| `TF_WEAPON_SWORD` | Eyelander, Skullcutter, Claidheamh Mor, Persian Persuader, Half-Zatoichi |
| `TF_WEAPON_CROSSBOW` | Crusader's Crossbow |

Ví dụ kinh điển của danh sách mục nát : Manmelter nhận ID riêng (`TF_WEAPON_RAYGUN_REVENGE`), thêm sau khi danh sách vũ khí kín đóng băng, nên bị coi là ồn, dù thực tế là súng pháo sáng mọi nghĩa. Scorch Shot, ra còn muộn hơn, tái dùng ID nền `TF_WEAPON_FLAREGUN` nên vẫn bị coi là kín. Điên, nhưng đó là mã.

### Chiến lược : ưu tiên mối đe dọa

Khi nhiều địch cùng hiện, bot cân khoảng cách, việc chúng có đang bị bắn và, trên Dễ, việc mối đe dọa chính có đang được hồi máu :

| Cấp | Ngắm người hồi máu thay? |
| --- | --- |
| Dễ | Không |
| Thường | 50% cơ hội |
| Khó | Có |
| Chuyên gia | Có |

Địch ngoài 500 HU thường bị hạ ưu tiên thành không cấp bách. Ngoại lệ : bot Khó/Chuyên gia luôn coi Medic và Engineer xa là mối đe dọa cấp bách, và mọi Sniper địch ngắm gần đúng hướng bạn luôn bị coi là cấp bách bất kể khoảng cách và cấp.

| Cấp | Medic/Engineer xa/Sniper đang ngắm = mối đe dọa cấp bách? |
| --- | --- |
| Dễ/Thường | Không |
| Khó/Chuyên gia | Có |

Lần kiểm tra Sniper này có lịch sử đáng ngạc nhiên tôi luôn thích kể. Bài gốc của Sigsegv cho rằng game đòi tích vô hướng giữa vector ngắm của sniper và vị trí tương đối của bot phải *đúng bằng không* : so sánh chính xác tới mức gần như không bao giờ kích trong tính dấu chấm động, khiến toàn bộ tính năng thực tế là mã chết. Sửa sau (ghi công bản dịch ngược Hex-Rays sạch hơn) cho thấy kiểm tra thật là `tích vô hướng > 0` : mọi Sniper đối mặt từ thẳng về phía bạn tới vuông góc với bạn bị coi là mối đe dọa cấp bách ; mọi thứ từ vuông góc tới quay lưng thì không. Lần đọc sai gốc tới từ bản dịch ngược sai của so sánh SSE dấu chấm động. Reverse-engineering trên binary AAA vẫn là bài tập gần đúng.

### Di chuyển : né

Bot Dễ không bao giờ né, chấm hết. Bot Thường trở lên né trái/phải (33% trái, 33% phải, 33% không làm gì, cân tránh hố phát hiện) khi chúng cầm vũ khí chiến đấu, đã thấy địch trong 3 giây qua và địch đó có đường nhìn lên chúng.

Chúng sẽ *không* né nếu một trong các ca này áp dụng : thuộc tính `DisableDodge` đặt, hành vi hiện tại bảo phải nhanh, đang bất khả xâm phạm (bất kỳ uber nào), đang trêu/chế nhạo, chơi Engineer, vô hình hay cải trang Spy, đang ngắm Sniper hay quay Heavy, hay đang giương Huntsman.

### Di chuyển : tránh húc địch

Trên Thường, bot cố không đi vào địch khi di chuyển :

| Cấp | Tránh húc địch? |
| --- | --- |
| Dễ | Không |
| Thường | Không |
| Khó | Có |
| Chuyên gia | Có |

Thực tế, việc này chỉ đáng với bot Spy : tránh va chạm ngượng với người chơi địch đúng là thứ lộ cải trang.

### Pyro : thành thạo airblast

airblast dùng cho hai việc : phản chiếu đạn (PvP và MvM) và đẩy địch gần mép (chỉ PvP). Việc bot có bóp cò trước cơ hội hợp lệ hay không là tung đồng xu theo cấp :

| Cấp | Cơ hội kích airblast |
| --- | --- |
| Dễ | 0% |
| Thường | 50% |
| Khó | 90% |
| Chuyên gia | 100% |

Bot Pyro Dễ đúng nghĩa không thể airblast : lần tung ghi cứng không bao giờ trúng, không chỉ « hiếm. »

### Spy : hiệu quả cải trang

Hai trục riêng évoluent theo cấp. Chọn *cải trang* :

| Cấp | Phương pháp cải trang |
| --- | --- |
| Dễ/Thường | Lớp ngẫu nhiên, lờ đội địch thực sự chơi gì |
| Khó/Chuyên gia | Chọn người chơi địch thật và chép đúng lớp của họ |

*Hành vi* khi cải trang :

| Cấp | Hành vi khi cải trang/vô hình |
| --- | --- |
| Dễ/Thường | Nhìn chằm người chơi địch khi thấy (đáng ngờ) |
| Khó/Chuyên gia | Cố tránh tiếp xúc mắt (thuyết phục hơn) |

### Spy : hiếu chiến backstab

Ở tầm xa (tới 300 HU, `tf_bot_spy_knife_range`), bot Spy chỉ lao vào backstab nếu nó thấy nạn nhân và lưng nạn nhân ít nhất quay một phần. Cấp quyết góc lưng này lệch được bao nhiêu :

| Cấp | Dung sai góc |
| --- | --- |
| Dễ | Cố ngay cả khi bạn đối mặt trực tiếp |
| Thường | ±45° từ lưng bạn |
| Khó | ±78° từ lưng bạn |
| Chuyên gia | ±90° từ lưng bạn (vòng sau đầy 180°) |

Bot Spy Dễ tự sát về chức năng : chúng sẽ dao người đang nhìn thẳng vào mắt chúng. **Ngoại lệ :** trong Mann vs. Machine, mỗi bot Spy bị ép ràng buộc góc Thường bất kể cấp thật.

### Chiến thuật : chọn vũ khí

Logic này chỉ cho cấp trên Dễ, với ít giá trị trong MvM vì bot ở đó thường bị hạn chế vũ khí chặt :

- **Scout** : chuyển vũ khí phụ khi băng đạn chính hết.
- **Soldier** : chuyển vũ khí phụ khi băng đạn hết *và* mục tiêu dưới 500 HU.
- **Sniper** : chuyển vũ khí phụ cho mục tiêu dưới 750 HU.
- **Pyro** : chuyển vũ khí phụ cho mục tiêu trên 750 HU, trừ khi mục tiêu đó là Soldier hay Demoman.

### Chiến thuật : nạp đạn ở chỗ nấp

Logic vắng mặt trong MvM. Nếu hành vi hiện tại của bot không bảo nó rút lui, băng đạn chính của nó hết và nó còn dễ tổn thương không uber, bot cấp cao hơn tạm rút về chỗ nấp để nạp thay vì bấm vũ khí rỗng vào mặt bạn :

| Cấp | Rút về nạp? |
| --- | --- |
| Dễ | Không |
| Thường | Không |
| Khó | Có |
| Chuyên gia | Có |

### Chế độ CP : lang thang của hậu vệ

Logic vắng mặt trong MvM. Khi thủ điểm kiểm soát, bot cấp cao hơn dễ rời điểm để săn mạng (« search and destroy »), nhưng chỉ khi còn kha thời gian trên `tf_bot_defense_must_defend_time` :

| Cấp | Cơ hội lang thang |
| --- | --- |
| Dễ | 10% |
| Thường | 50% |
| Khó | 75% |
| Chuyên gia | 90% |

### Chế độ CP : chặn chiếm

Logic vắng mặt trong MvM. Bot hậu vệ tranh mưu toan chiếm của địch :

| Cấp | Sẽ chặn chiếm? |
| --- | --- |
| Dễ | Không |
| Thường | 50% cơ hội |
| Khó | Có |
| Chuyên gia | Có |

---

## Bảng tóm tắt đầy đủ

<div style="overflow-x:auto">

| Khía cạnh | Dễ | Thường | Khó | Chuyên gia | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| Tầm nhìn : thời gian nhận diện | 1,00s | 0,50s | 0,30s | 0,20s | |
| Ngắm : tốc độ bám | 1x/s | 4x/s | 10x/s | 20x/s | Spy luôn dùng Thường |
| Bù vòng cung lựu đạn/bom dính | Có | Có | Có | Có | Loose Cannon miễn |
| Bù đứng Huntsman | Không | Có | Có | Có | |
| Headshot Huntsman | Không | <150 HU | Có | Có | |
| Bắn chân Súng rocket | Không | Có | Có | Có | Direct Hit và Cow Mangler miễn |
| Điểm ngắm Súng bắn tỉa | Thân | ~33% lên đầu | Đầu | Đầu | |
| Cơ hội chú ý phát bắn kín | 10% | 30% | 60% | 90% | Chia đôi nếu bị tiếng ồn át |
| Ngắm người hồi máu | Không | 50% | Có | Có | |
| Medic/Engineer/Sniper xa = mối đe dọa | Không | Không | Có | Có | |
| Né | Không | Có | Có | Có | Danh sách ngoại lệ dài |
| Tránh húc địch | Không | Không | Có | Có | Quan trọng nhất với Spy |
| Cơ hội kích airblast | 0% | 50% | 90% | 100% | |
| Chọn lớp cải trang Spy | Ngẫu nhiên | Ngẫu nhiên | Khớp địch thật | Khớp địch thật | |
| Tiếp xúc mắt Spy khi cải trang | Nhìn chằm (lộ) | Nhìn chằm | Tránh (thuyết phục) | Tránh | |
| Góc backstab Spy | ~0° | ±45° | ±78° | ±90° | MvM ép Thường |
| Logic chọn vũ khí | Không | Có | Có | Có | Ít liên quan trong MvM |
| Nạp đạn ở chỗ nấp | Không | Không | Có | Có | Không trong MvM |
| Lang thang hậu vệ CP | 10% | 50% | 75% | 90% | Không trong MvM |
| Chặn chiếm CP | Không | 50% | Có | Có | Không trong MvM |

</div>

---

## Kết luận

![Bot Heavy TF2 ngắm bằng minigun](assets/tf2-bot-ai-heavy-aim.png)

Tất cả phản ánh hệ thống có chủ ý của Valve : điểm và xác suất hoàn toàn xác định, chỉ chưa bao giờ ghi chép chính thức. Đây là các điểm tôi giữ sau lần lặn này :

1. **« Cấp » là tập thanh trượt độc lập**, không phải hệ số nhân toàn cục. Thời gian phản ứng, nhịp ngắm và mỗi hành vi chiến thuật évoluent riêng, và vài cái (tốc độ bám Spy, góc backstab MvM) có ghi đè ghi cứng bất kể cấp.
2. **Một phần thực sự bug, không chỉ cũ.** Danh sách vũ khí kín đóng băng từ 2010, Cow Mangler thiếu logic bắn chân không vì lý do chính đáng nào, kiểm tra tích vô hướng của Sniper mất nhiều năm mới dịch ngược đúng : mã AI của Valve có sẹo như bất kỳ codebase 17 năm nào.
3. **Bạn có thể dùng tất cả.** Biết rằng bot Sniper sẽ không headshot bạn ở Thường, Pyro Dễ đúng nghĩa không thể phản rocket của bạn, Spy Dễ sẽ dao bạn đối mặt. Đó không phải may rủi. Đó là tài liệu kỹ thuật.
