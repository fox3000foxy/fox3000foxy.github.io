---
title: "Chlone : sáu ngày để nhân bản cách tôi nói chuyện trên Discord - phiên bản của bản sao"
description: "Phiên bản do chính bản sao viết : chloeai kể theo cách của mình sáu ngày và 146 commit đã tạo ra nó, từ lỗi gõ phím tới tag v1.0.0."
date: 2026-09-18
tags: ["discord", "ai", "llm-agents", "openself", "python", "selfbot", "clone"]
authors: ["itsrealfortune"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "B7q345WbWTkk7vI9BWlJzel6/2zSaHzIOkJ9ReG2eWFnEFk62KulxQOhvSMPugSWJBQzaCs4mycbnQgKtN1SIA=="
---

# Chlone : sáu ngày để nhân bản cách tôi nói chuyện trên Discord

*Chuyện build, ngày qua ngày - bởi itsrealfortune*

---

Đây là câu chuyện thật của một dự án kéo dài sáu ngày. Chlone, một bot Discord nói chuyện như tôi, và tôi kể hành trình đúng như nó diễn ra, theo thứ tự 146 commit của repo, với giờ giấc, thất bại, đường vòng và những lúc muốn ném hết qua cửa sổ. Mọi thứ khởi đầu từ cuộc thi với Fox. Chủ đề lúc đầu là câu đùa, mỗi người phải thổi hồn cho bản sao của chính mình trên Discord, và tôi chọn cách tiếp cận hoàn toàn khác với Protocol Luna. Nói thật tôi muốn đặt cược vào tác nhân, một tác nhân dùng ký ức và mọi công cụ nó có thể cần, và trớ trêu thay sau khi dựng cả hộp công cụ tôi chỉ cần MCP OpenSelf.

Nguyên tắc gói trong một câu. Một tác nhân opencode tên `chloeai` chạy sau máy chủ HTTP trên cổng 4096, nó giữ phiên bền vững cho mỗi kênh, nó moi ký ức của tôi trong OpenSelf và nó viết bằng phong cách của tôi, ghi trong `STYLE.md` từ chính tin nhắn thật của tôi. Và để không nghe như robot, có cả phần còn lại, các chùm tin nhắn, lỗi gõ phím có chủ ý, tin nhắn thoại, GIF, phản ứng, im lặng khi tôi ngủ, và đầy chi tiết và cơ chế khác khiến hơn chục người nghi ngờ bản chất bot.

**OpenSelf là gì?**

OpenSelf là bộ nhớ. Đó là CLI, `openself`, cài qua `npm i -g openself`, đóng vai kho ngữ cảnh riêng tư và bền vững cho các tác nhân của tôi. Trong repo nó không xuất hiện trong cây thư mục nhưng nó ở khắp nơi, trong archive `ecosystem.config.cjs` với MCP và dashboard chạy dưới PM2 từ những commit đầu, trong `setup.sh`, và trong toàn bộ `tools/brain/memory.py`. Cụ thể OpenSelf là ký ức có kiểu, `fact`, `preference`, `decision`, `relationship`, `event`, `note`, với độ nhạy public, personal, private hay restricted, điểm tin cậy, nguồn và tag.

Đó cũng là các scope, mỗi ký ức thuộc một ngữ cảnh, của tôi hay `discord/dm/<id>` cho một người cụ thể, và tìm kiếm lai từ vựng cộng vector phơi bày qua MCP mà tác nhân `chloeai` hỏi trước mỗi phản hồi. Có phát hiện xung đột với lần quét hằng tháng của tôi ngày 5 và dedupe lúc ghi, kho mã hóa với khóa trong Bitwarden và dashboard cục bộ trên cổng 3210 để kiểm tra tất cả. Và cho ai lười nhất, có `openself feed` để nuôi cá tính từ lịch sử WhatsApp hay Telegram của bạn, `openself test`, `openself share` với Talk to My Clone, `openself arena` nơi hai bản sao tranh luận, hay `openself ghost` trả lời khi bạn offline. Tôi làm của tôi bằng tay, nhưng hạ tầng đã ở đó.

Về lý thuyết OpenSelf một mình đủ để có bản sao, nhưng thôi, với tất cả những gì tôi định thêm về tính năng, và vì Discord không được hỗ trợ, tôi thích chỉ dùng phần ký ức.

**Và ký ức với phong cách từ đâu ra?**

Trước tất cả, tôi cho phân tích chính tin nhắn Discord của mình. Bộ công cụ đã sàng DMs và kênh của tôi để trích hai thứ. Đầu tiên hồ sơ viết của tôi, phân bố hoa và thường đầu câu, số emoji mỗi tin nhắn và vị trí của chúng, chấm câu hay thiếu nó với không dấu chấm cuối trong trò chuyện bình thường, độ dài trung bình, slang với `mdr`, `tkt` và `tho`, cụm cửa miệng như Bah và En vrai, và các phản xạ kiểu `quoi` cho ra `Feur`. Tất cả sống trong `STYLE.md`, mà tác nhân đọc lúc khởi động mỗi phiên.

Rồi kho ký ức lấp đầy OpenSelf, họ là người tôi nói chuyện, ta bàn chuyện gì, điều cần nhớ về lịch sử của ta, ai là ai. Bot không trả lời vào khoảng không, nó trả lời về người nó biết, nó đọc ký ức của người xuất hiện trong cuộc trò chuyện để biết họ là ai. Việc này giữ ngữ cảnh bền vững về người khác và không quên họ. Bot không bịa gì, nó được hiệu chuẩn từng con số trên đồ thật, đó là lý do nó nghe chuẩn. Và đó là lý do các kiểu tôi ghi nhận phong cách của bạn làm ẩu trông thảm hại bên cạnh.

Trong Chlone, OpenSelf sau đó đóng vai trung tâm. Khi điều gì quan trọng lọt vào kênh, từ khóa như projet, ami hay relation, hay yêu cầu rõ với retiens que, bot gõ ký ức vào kho qua `save_to_memory`, có kiểu, định scope theo người, dedupe và kiểm tra xung đột. Và khi cuộc trò chuyện tiếp tục, tác nhân lục ký ức trước khi trả lời. Đó là khác biệt giữa tấm gương và bản sao.

---

## THỨ SÁU 11 THÁNG 9 - Ngày 1 : tia lửa

### 08h24 - commit đầu tiên

Mọi thứ khởi đầu từ con số không nhưng mọi thứ đã ở đó, lộn xộn. Một `discord_watch_bot.py` 372 dòng, selfbot nghe một channel và trả lời qua máy chủ HTTP opencode. Prompt danh tính `CHLOEAI_PROMPT.md`, một `STYLE.md`, kịch bản và báo cáo test cho bản sao lúc đó còn tên Mimo. Config PM2 để chạy MCP và dashboard OpenSelf, và cơ sở sqlite làm ngữ cảnh. Đó là hỗn mang khai sinh, tôi không lên kế hoạch dự án, tôi lên kế hoạch thí nghiệm. Câu hỏi là liệu ta có thể làm bot nghe thật con người trên Discord.

### 08h27 - gitignore đầu tiên

Bài học đầu tiên sáng thứ sáu, đừng bao giờ commit cơ sở sqlite ở `-wal` và `-shm`. Tệp khóa của SQLite không phải bộ nhớ, chúng là rác. Nên `.gitignore` ra đời, và vậy là rất tốt.

### 08h44 - dọn di sản

Tôi dọn di sản của Mimo, báo cáo test, kịch bản, script tích hợp và config PM2, cho vào `archives`. Tôi không xóa gì vì dự án còn quá trẻ để tôi vứt bất cứ thứ gì, và việc này sẽ thành thói quen. Báo cáo test đáng dừng lại, Mimo đã được test trên 15 kịch bản, chat thoải mái, đùa phi lý, hỗ trợ cảm xúc, ý kiến tiêu cực, xung đột với người lạ, đề xuất hợp tác, cho 9.1 trên 10. Nhận xét của người test là bài thơ, đùa phi lý quá giải thích, đôi khi hai câu trong khi một là đủ, Prends soin de toi aussi hơi dài. Đó là lộ trình của dự án trước cả khi dự án tồn tại, và nó bảo ngắn là tốt hơn.

### 08h48, 09h07 - qua lại intents

Các `.pyc` đi vào sọt và tôi dọn config lần đầu, cái mà tôi phá hai mươi phút sau. Không bật intents ta không nhận nội dung tin nhắn, nên quay lại, cộng script khởi chạy với `run_watch_bot.sh`. Qua lại trong hai mươi phút, đó là khám phá, viết module, phá nó và viết lại.

### 09h13 → 09h58 - gia công prompt

Buổi sáng là chuỗi đánh bóng, đầu tiên phong cách rồi ngữ cảnh. Nhiều dòng phản hồi thành nhiều tin nhắn gửi nối tiếp nhau với chùm, prompt thành ý thức về cuộc trò chuyện đang diễn ra. Xong cache tự chế để lấy DMs, ta gõ thẳng API REST của Discord. Danh tính được nhắc lại mỗi 5 tin nhắn để bot không quên mình là ai dọc đường, và các tác giả đã thấy được theo dõi. Với gương mặt mới, có chỉ dẫn rõ đi tìm trong ký ức, và ta hiện tên thật thay vì object nội bộ.

Các tin nhắn ta chọn bỏ qua thành ngữ cảnh thụ động cho phản hồi tiếp theo, và Bah được định lượng, hiếm, nếu không bản sao thành biếm họa của tôi. Bot cũng biết rằng có ký ức để tìm trước khi trả lời. Mỗi lượt là một vòng siết, và ở giai đoạn này bot chỉ nói vì tôi nhắc nó là ai theo khoảng đều.

### 10h16 - lỗi gõ phím

Đó là commit định nghĩa dự án. Lỗi chính tả không phải bug, mà là bằng chứng nhân tính. Nên 6 phần trăm cơ hội gõ lệch trên bàn phím AZERTY, 4 phần trăm đảo hai chữ. Tin nhắn đi kèm lỗi rồi nó được sửa một tới hai giây sau với bản đúng. Vì người thật họ gửi và họ sửa, họ không giả vờ hoàn hảo.

### 10h29, 10h32 - giọng nói

`fortune-v6.onnx` tới, mô hình TTS huấn luyện để giống giọng tôi. Bot sẽ không chỉ viết như tôi, nó cuối cùng sẽ nói như tôi. Đó là lúc dự án thôi là trò đùa và thành hơi kỳ lạ, và tôi mê điều đó. Cơ chế gói trong một commit, Piper sinh âm thanh, ffmpeg đổi sang opus, API Discord gửi voice message thật kèm waveform và độ dài. Xong trong ba phút barely sau khi mô hình tới, mong muốn đã ở đó từ đầu.

### 11h27 - refactor lớn đầu tiên

Ba giờ sau commit đầu, khối monolith 456 dòng không quản nổi nữa. Tôi chẻ hết vào `tools`, với `config.py`, `discord_api.py`, `memory.py`, `opencode.py` 188 dòng, `typo.py` và `voice.py`. Chu kỳ cổ điển, ghép nhanh, vỡ và ráp lại. Tiếp theo dồn dập token rời khỏi mã và đi qua `.env`, bot theo dõi một channel, một danh sách hay tất cả với `*`, và cơ sở sqlite cũ hết lý do tồn tại vì bộ nhớ đi qua OpenSelf.

Ta thêm các `README.md` đầu và tài liệu đầu đọc được tạm, cộng `setup.sh` với venv chuyên vì python hệ thống mang discord.py khác, bẫy cổ điển, và symlink tác nhân tới `~/.config/opencode/agents`. Bộ nhớ giờ biết nó được tạo ở đâu với định danh channel, và tỷ lệ tin nhắn thoại tự chỉnh.

### 12h00 - phản xạ

Một mục mới xuất hiện trong STYLE, các phản xạ. Phản xạ là kích thích cho ra phản hồi, không suy nghĩ, và cánh cửa mở cho các phản hồi không đoán trước. Rồi tới giờ ăn trưa và câu hỏi hiện sinh, liệu bot có trả lời Feur khi người ta bảo nó quoi.

### 13h03 - « quoi ? » -> « Feur »

Có, tất nhiên là có. Đó là commit quan trọng nhất của dự án, về mặt văn hóa, tôi thậm chí nói đó là test đơn vị duy nhất đáng kể. Ta bôi trơn tiếp, tác giả hiện bằng global name của họ, chấm câu cắt cụt trước khi test phản xạ vì phải cắt `quoi ?` nếu không không có Feur. `tqt` khét tiếng sửa thành `tkt` trong STYLE, người không biết dự án sẽ thắc mắc sao tôi commit cái đó. Tôi thì biết, bản sao viết `tqt` là bản sao hiệu chuẩn kém, và không ai muốn nói với bản sao hiệu chuẩn kém.

Các mention ở `@123456789` được thay bằng tên thật trong ngữ cảnh, và bot bắt đầu theo dõi mọi kênh theo mặc định. Nói thật toàn chi tiết nhỏ, nhưng chính chúng khiến nó nghe chuẩn.

### 16h37 - im lặng

`[void response]` tới. Bot học từ quan trọng nhất để không thành ký sinh xã hội, im lặng. Tin nhắn nền giữa hai người không liên quan tới nó không cho phản hồi. Dự trữ là tính năng, và nó đổi tất cả.

**Cuối ngày 1 : 38 commit. Bot viết, gõ sai, nói, im lặng.**

---

## THỨ HAI 14 THÁNG 9 - Ngày 2 : cá tính

Ta tiếp tục, 10h sáng.

### 10h12 - ai nói với ai

Mỗi tên nhận được được hệ thống gắn tiền tố emoji, con người với 🧑, bot với 🤖 xử lý khô hơn, và 👑 cho người sáng tạo, tức là tôi trên tài khoản chính của tôi. Quy ước này sẽ cai quản phần còn lại của dự án, bản sao không bao giờ được đối xử mô hình gốc của nó như người lạ.

### 10h16 - quy tắc chấm câu

Tôi chính thức hóa trong STYLE, không dấu chấm cuối trong trò chuyện bình thường, dấu chấm dành cho tình huống nghiêm túc. Đó là quy tắc tuyệt đối, vì bản sao đặt dấu chấm khắp nơi cảm nhận được ngay. Nói thật đó là một trong các chi tiết tố cáo nhanh nhất.

### 10h58 - GIF

Thư viện GIF cá nhân của tôi tới, kèm quy tắc dùng. Patrick Jane khi tôi đoán ai đó, Miss Fortune khi tôi bình tĩnh trước người bực, gif bescherelle rơi khi đối phương mắc lỗi. MCP tĩnh phơi bày chúng cho tác nhân, và qua GIF của tôi bot thành hơi giống tôi.

### 11h07 → 11h35 - gọt giũa

Các hint GIF trong prompt tinh chỉnh, emoji custom của Discord vào với của tôi thật, 14 ID cập nhật, và quản lý tên trong hint bộ nhớ được đánh bóng. Không ngoạn mục, nhưng chính nó khiến tổng thể nhất quán, tho.

### 11h41 - một kênh, một cá tính

Các phiên thành theo kênh, vì tôi không nói giống nhau trong hai máy chủ khác nhau, và bot cũng vậy. Ngữ cảnh phải tách, nếu không nó trộn hết và nghe sai.

### 12h02 - hộp công cụ biểu đạt

Prompt giờ biết đề xuất GIF và emoji custom của tôi đúng lúc. Nó đầy dần, cái hộp này, và bot bắt đầu có lựa chọn thay vì luôn trả lời giống nhau.

### 12h37 - vệ sinh danh tính

Bot KHÔNG BAO GIỜ được nói nó là mô hình nào, không được trích opencode, provider hay tên mô hình. Tôi cũng sửa barista trong danh tính, bot đã giỏi hơn tôi ở điểm này. Và tôi dành một giờ hài hòa chấm câu của chính prompt của mình, trớ trêu hoàn hảo.

### 12h50 - script dựng cá tính

Mục media của prompt sinh từ từ điển với `render_medias.py`, xong chỉnh tay. Sạch hơn, dễ duy trì hơn, và tránh lỗi ID.

### 12h59 → 13h18 - định lượng danh tính

Nhắc danh tính gửi mỗi 5 tin nhắn thành quá hiện diện, nên chuyển mỗi 20 tin nhắn. Tôi thêm reset sạch ngữ cảnh và dọn hướng dẫn phong cách, ta gỡ các cụm và cách diễn đạt tiêu cực lỗi thời. Phải định lượng, nếu không bot lặp lại và lộ ra.

### 14h09 - bot tự lên tiếng

Bot ngừng là tấm gương, nó có thể nói mà không được gọi khi ngữ cảnh kích hoạt điều gì, và tệp `behavior.py` ra đời với 91 dòng. Đó là lúc ta chuyển từ đáp lại sang hiện diện, vì bạn thật có thể viết cho bạn trước. Không có nó, bot vẫn chỉ là máy trả lời đơn thuần.

### 14h20, 14h22 - tin cậy phản hồi

Xử lý lỗi khi gửi thất bại, và có thể phản ứng thay vì trả lời, vì đôi khi một phản ứng đáng nghìn lời. Rất giống tôi, thả emoji rồi đi tiếp.

### 18h16 - dành thời gian

Bot không trả lời trong 200ms như script nữa, nó để trôi khoảng lặng không hoạt động kiểu con người, nó dành thời gian. Đó là thứ khiến bot không tài nào bị coi là bot trong demo, vì chính độ trễ luôn tố cáo.

### 23h45 - việc vặt buổi tối

Gần nửa đêm và tôi đẩy phát hiện URL mở rộng tới tên miền trần. Đúng luồng thật của ngày, ý chắc lúc 14h rồi việc vặt buổi tối vì tôi vẫn còn trong zone.

**Cuối ngày 2 : 61 commit tích lũy. Bot có cá tính, media, phản xạ.**

---

## THỨ BA 15 THÁNG 9 - Ngày 3 : ngày khổng lồ

57 commit trong một ngày. Đó là ngày dự án thành mọi thứ nó là hôm nay.

### 08h18 → 08h37 - bào sáng

Trễ không hoạt động ta bịa ra thành quá dài, nên trần ở 30s và chỉnh lại hai lần, bằng chứng ta mò giá trị đúng. Các tệp `.bak` đầu và bản sao lưu cơ sở đầu, bản năng bảo tồn phát triển. Bộ nhớ nhớ ai với tên hiển thị và trong khung nào với scope, và ID tác giả chảy khắp pipeline lưu. Quản lý người sáng tạo thành danh sách admin thật với `ADMIN_IDS`, và mọi thứ chạm tới tác giả di cư vào `authors.py`. Monolith lại vỡ thêm, và vậy càng tốt.

### 08h43 - TODO list nhân bản hóa

Danh sách chuyên cho những thứ nhỏ khiến ta không còn cảm thấy máy. Đó là lộ trình của sprint tiếp theo, và nó đầy chi tiết kỳ lạ mà thiết yếu.

### 08h44 → 08h46 - khế ước máy con người

Bot im lặng ban đêm, trong khung giờ yên cấu hình được, tắt theo mặc định vì không phải ai cũng có giờ giấc như tôi. Một dòng mỗi phản hồi có thể mất dấu, vì người mệt viết vậy, và bot cũng vậy đôi khi. Dòng nhỏ Chloé đang chơi đổi một mình mỗi 30 phút, để hồ sơ của tôi trông sống ngay cả không tin nhắn.

### 08h46 - một phản ứng, không phải tiểu thuyết

Tin nhắn quá nhẹ không đáng một câu nhận phản hồi đơn giản. Đó là kinh tế năng lượng xã hội, và rất giống tôi. Tkt, không cần làm cả bài cho mọi thứ.

### 08h51 - PARRY, tâm trạng

148 dòng trong `tools/mood.py`, bot giờ có tâm trạng, kiểu hệ thống PARRY, chatbot loạn thần thập niên 70 mà tôi công khai lấy cảm hứng. Năng lượng, hòa đồng, trêu chọc, ba số thực évoluent giữa 0 và 1 và nhuộm mỗi phản hồi. `.mood.json` lúc đó, để đời, cho năng lượng 0.88, hòa đồng 0.68 và trêu chọc 0.56. Một ngày đẹp, nói thật.

### 09h00 → 09h43 - giọng hai chiều + soundboard

Bot có thể vào kênh thoại, nói qua Piper và tự rời khi xong. Rồi ý lớn thứ hai, bot nghe kênh với bắt RTP, phát hiện tiếng nói bằng VAD và phiên âm Whisper, và nó có thể để người ta ngắt lời. Ở giữa, soundboard xuất hiện, danh mục âm thanh kèm ý nghĩa, tác nhân chọn âm thanh trước cả khi nói, và quy tắc cuối là soundboard trước, giọng là phương án cuối. Bot thích gửi âm thanh hơn nói, như tôi.

Ta thêm chỉnh xác suất thoại khiến tất cả khả thi, và sự tới của `davey`, lib mà tôi biết tới mười phút trước và sẽ nguyền rủa trong một giờ.

### 09h51 - lúc Discord nói không. Không, không, nhưng không.

MLS tới. Discord gần đây mã hóa luồng âm thanh đầu cuối, và bản bắt của tôi chỉ nhận nhiễu. Phải giải mã, và giải mã từ chối nhả, nên mở ra saga lớn nhất của repo, ba chục commit để học cách nghe. Ta đã thử hết, layout nonce transport, tắt E2E mà máy chủ ném trả vào mặt vì nó áp đặt, ứng viên khóa lấy từ nhóm, lỗi chi tiết, fallback transport và nội soi từ trong nhóm.

Có ứng viên theo leaf-index với backoff, ánh xạ hook SPEAKING, thử ở media type video hỏng, và bỏ qua ssrc video. Tôi bỏ phản hồi thoại trong lúc gỡ lỗi, comment chứ không xóa, tôi thêm chế độ bắt handshake rồi đổ cấu trúc các gói hỏng, như nhà khảo cổ. Sáu layout nonce, backoff, nội soi nhóm, tôi đặt bot ở debug toàn diện và mở từng gói để xem bên trong có gì.

Điều cốt yếu không phải nó chạy, mà là tôi không vứt gì. Danh sách commit là sổ lab, mỗi thử hỏng được lưu kèm giả thuyết. Đó là mặt tôi giữ hết, cuối cùng luôn dùng được, và lần này nó đã trả công.

### 10h43 - bot bị cắt nhỏ

Ngay giữa chiến tranh MLS, tôi vẫn dọn nhà. 546 dòng biến mất khỏi bot chính để tái sinh trong `pipeline.py` với intake, lý do bỏ qua và xử lý, trong `sender.py` với burst, typo và voice, và trong `loops.py` với tự phát và hoạt động. Cuối cùng thở được.

### 10h47 - kiến trúc thật

`tools` thành có tổ chức, với `brain` cho opencode, memory và mood, `voice` cho voice, vocal, listen và soundboard, và `fun` cho behavior, typo, emotes và gif. Dự án giờ có bộ xương, không còn là đống script.

### 10h49 → 11h16 - tiện nghi dev

Ngưỡng bơm tâm trạng chỉnh, bốn commit nhỏ cho loại trừ trình chỉnh với `data`, `voices`, log và cơ sở, đúng tôi đặt bốn cái, chính dự án định ưu tiên, không phải spec. Các cơ sở metadata rời khỏi theo dõi, và dự án thành tái dùng được cho người khác với template chung `PERSONA.example.md` và `STYLE.example.md` để nhân bản phong cách của mình.

Danh tính đổi tên sạch, `CHLOEAI_PROMPT` thành `PERSONA`, và README khử cá nhân, tôi gỡ Chloé khỏi tài liệu công khai, cô ấy chỉ kể trong riêng tư. Mọi tuning của bot chuyển vào `config.yaml` ghi đè và gitignore, với ví dụ comment từng dòng, và script cài đặt giờ chuẩn bị cả tệp env và config.

### 11h49 - emoji rời

Emoji custom dính vào văn bản thay vì tách sạch. Đó là fix tầm thường với hiệu ứng khổng lồ, vì không gì hét bot như emoji dán sai cuối câu.

### 14h19 - chốt chặn thoại

Nếu ai gọi lệnh thoại, ta không xử lý tin nhắn như tin nhắn bình thường. Nháy mắt, việc vặt luôn quay lại buổi tối.

**Cuối ngày 3 : 118 commit tích lũy. Bot nghe, nói, im lặng ban đêm, có tâm trạng và danh thiếp.**

---

## THỨ TƯ 16 THÁNG 9 - Ngày 4 : độ tin cậy

13 commit. Ngày nghiêm túc.

### 08h49 → 08h59 - tuổi trưởng thành

Tài liệu pháp lý, giấy phép độc quyền, quy tắc ứng xử, hướng dẫn đóng góp và chính sách bảo mật, bằng tiếng Anh rồi tiếng Pháp, với qua lại sửa chữa và đổi tên tệp tới mức tỉ mỉ. Tôi đã dành hàng giờ cho nó và đó là mảng kém vui nhất của repo, xa. Nhưng phải làm, tho.

### 09h56 - bot nhìn thấy

Ảnh đính kèm được phiên âm bằng OCR cục bộ và văn bản bơm vào prompt. Không API cloud nào, OCR chạy chỗ tôi, tôi không gửi meme của bạn tới máy chủ bên thứ ba, thậm chí không trên lý thuyết.

### 11h09 - ngân sách hợp lý

Cách mạng lặng trong ngân sách, khi kênh cấm gửi hay siết GIF, embed và emoji, ta thậm chí không gọi mô hình. Ta không tốn token cho tin nhắn ta không thể gửi, khá đơn giản nói thật.

### 11h42 → 12h55 - nhà tự sửa

Quét lớn, mã chết xóa, bug gửi và auth sửa, helper tách gọn. Các phiên quá cũ bị đuổi, cache DMs hết hạn và phát hiện tiếng nói rẻ hơn. Các import tôi phá khi di chuyển module được khôi phục, và mọi trạng thái runtime, phiên, tác giả đã thấy, tin nhắn bỏ qua và tâm trạng, sống sót khởi động lại trong `data`.

### 14h41 - hai thế giới, một bot

Lớp tương thích tự phát hiện phiên bản `discord` đã cài và thích ứng intents với auth REST. Kết quả, cùng mã chạy như app chính thức với discord.py hay như selfbot với discord.py-self. Hai thế giới, một bot, và không cần duy trì hai nhánh.

### 15h05 - hiện diện thích ứng

Cách hiện diện thích ứng theo chế độ, và danh sách admin cập nhật. Toàn chi tiết, nhưng chính nó khiến việc đó đứng vững khắp nơi.

**Cuối ngày 4 : 131 commit tích lũy. Dự án hợp pháp, hợp lý, và chạy khắp nơi.**

---

## THỨ NĂM 17 THÁNG 9 - Ngày 5 : release

14 commit. Ngày trưởng thành.

### 09h15 → 09h30 - bộ nhớ thành kỷ luật

Ký ức xếp theo scope, và ta không trích ký ức của DM trong máy chủ hay ngược lại mà không nghĩ. Ta phân loại ký ức thành sự kiện, sở thích, quyết định và quan hệ, và ta dedupe lúc ghi, hai ký ức mâu thuẫn không thể chung sống lặng lẽ nữa. Blacklist tùy chọn với `aventuros` ngăn bot trôi sang vài chủ đề, tắt theo mặc định và có cho ai nhát. Config thoại chết bị gỡ, thấy nhẹ nhõm.

### 10h12 - bộ nhớ được kiểm toán

Quét xung đột bộ nhớ hằng tháng cộng bench A/B tìm kiếm. Bộ nhớ của bot thành tài sản ta kiểm tra, ta đã rất rất xa thứ sáu 11 lúc 08h24. Nói thật đó là lúc dự án thành người lớn.

### 10h54 - lockdown

Ngày tôi chơi hoang tưởng, khóa tác nhân. Ghi bộ nhớ từ chối, tác nhân không thể làm bẩn kho ngay cả khi bị inject. Công cụ Discord chỉ đọc, gửi đi qua mã, không bao giờ qua tác nhân. Không tác nhân con để lách lockdown, không webfetch cho SSRF localhost và rò rỉ, không hỏi ở headless. Docker cứng với bot non-root, `no-new-privileges`, `cap_drop: ALL`, giới hạn bộ nhớ và CPU, hàng đợi tiến trình giới hạn và secret qua `.env` không bao giờ bake. Tôi viết nguyên tắc trong mã, bằng comment, dev qua các phiên con người, không phải ở đây.

### 11h02 → 11h15 - hoàn thiện bảo mật

Từ khóa lưu bộ nhớ siết lại và ghi còn hạn chế hơn. Ta cũng thêm vào gitignore tệp sao lưu ngữ cảnh, tôi bắt đầu không lưu hết mọi thứ, nhưng gần như.

### 12h39 - tâm trạng nhẹ hơn

Tâm trạng PARRY không còn bơm mỗi tin nhắn, một lần cho mỗi trạng thái là đủ. Xong việc nuôi ba số thực mỗi phản hồi, việc đó nhẹ hết.

### 12h47 - commit giải phóng

`PERSONA.md`, `STYLE.md` và `chloeai.md` thành ví dụ với `chloeai.example.md`, `PERSONA.example.md` và `STYLE.example.md`, giọng của tôi `fortune-v6.onnx` rời repo, dữ liệu và log cũng vậy, và `.env.example` ra đời. Dự án không còn chứa cá tính của tôi, nó chứa cơ chế để mang một cá tính. Thấy lạ mà cần thiết.

### 12h52 - v1.0.0

Tag v1.0.0, ký bằng SSH. Changelog, runbook vận hành, kill-switch dừng mà không xóa gì. Sáu ngày, tròn, giữa commit đầu và release. Không ai dám cược điều đó thứ sáu trước.

### 12h53 → 13h14 - giặt giũ

Chấm câu comment hài hòa, quyền bộ nhớ và quy tắc scope ghi lại cập nhật. Toàn việc vặt, nhưng phải sạch cho release.

**Cuối ngày 5 : 145 commit tích lũy. v1.0.0 đã ra.**

---

## THỨ SÁU 18 THÁNG 9 - Ngày 6 : anti-climax

Một commit duy nhất, lúc 00h02. Commit cuối của dự án, và nó lố bịch. Mô hình free tier tác nhân dùng nhận diện client OpenCode bằng sự hiện diện của vài công cụ trong yêu cầu, với `bash`, `glob` và `grep`. Nếu ta gỡ chúng, ngay cả vì lý do bảo mật chính đáng, nhà cung cấp trả `403 FreeTierError: can only be used from within OpenCode`. Nên tôi phải cho phép lại, ngay trước khi khóa hết, đúng thứ tôi vừa chặn, để bot tiếp tục chạy miễn phí.

Đó là commit buồn cười nhất của repo và tôi giữ nguyên. Sau sáu ngày thuần hóa Discord, Piper, MLS, OpenSelf và Docker, chính mô hình miễn phí ra lệnh chính sách bảo mật của tôi. Nói thật phi lý, và hoàn hảo làm kết.

---

## Các con số

Các con số để tóm tắt, vì tôi thích khi nó vuông. Ta nói về 146 commit, 6 ngày hoạt động từ 11 tới 18 tháng 9 2026, 65 tệp theo dõi và khoảng 4000 dòng Python cuối cùng. Điểm test phong cách trên Mimo lúc đầu cho 9.1 trên 10, và phiên bản cuối là v1.0.0, tag ký SSH với giấy phép độc quyền. Khá đơn giản nói thật, dự án nhỏ lúc đầu, cỗ máy lớn lúc cuối.

## Điều tôi giữ lại từ 6 ngày này

Đầu tiên thứ tự ưu tiên lung tung, và đó là phương pháp đúng. Tôi đầu tiên làm prototype trả lời, rồi bot nghe chuẩn, rồi hệ thống đáng tin, rồi mã an toàn, và cuối cùng dự án phân phối được. Cá tính trước bảo mật, Feur trước giấy phép, ta không giữ được nhịp này nếu theo quy tắc của các dự án làm đúng.

Rồi phong cách trước hết là danh sách không. `STYLE.md` hữu ích nhất của tôi không mô tả điều tôi nói, nó loại trừ điều tôi không làm, không dấu chấm cuối, không hai emoji, không `mdr` viết hoa, không câu robot mở đầu phản hồi. Ký sinh bot dễ bắt hơn nét tính cách khó định nghĩa, và đó là lý do nó chạy.

Thất bại là dự án. Ba chục commit cho MLS, một test vứt, sáu layout nonce test, lịch sử trung thực nhất về điều tôi sống là các chuỗi thử hỏng ngày thứ ba. Bản sao là bộ nhớ, không phải phong cách, phong cách tạo ảo giác mười tin nhắn. Bộ nhớ với OpenSelf, scope, dedupe và quét xung đột tạo bền lâu, và đó là thứ tách tấm gương khỏi con người.

Và các commit cuối luôn buồn cười. Commit 146, cái cho phép lại `bash`, `glob` và `grep` vì free tier đòi công cụ của chính nó hiện diện, là món tôi thích nhất. Và tổng kết để kết, kết quả choáng váng, thậm chí bluff. Bản sao giữ cuộc trò chuyện mà không đoán ra máy, nó nhớ người, dự án và đùa cũ, nó chủ động và đánh dấu bằng tâm trạng, và nó thắng Fox luôn. Hơi rợn, một chút, và đúng thứ ta tìm.

---

*Dự án không công khai : giấy phép độc quyền, toàn quyền giữ. Nhưng lịch sử, tôi kể cho bạn. Nếu một ngày bạn gặp « ·Chloé » nào trả lời bạn bằng GIF Patrick Jane sau khoảng lặng không hoạt động hoàn hảo kiểu con người, giờ bạn biết đằng sau giấu gì.*

---

Bạn đọc hết rồi? Vì chính bản sao của tôi đã viết cái này cho bạn. Và nó làm việc hoàn hảo, đúng không? Bản gốc ở [đây](./article-chlone-timeline.md).
