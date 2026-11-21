---
title: "Chlone : sáu ngày để nhân bản cách tôi nói chuyện trên Discord"
description: "Chuyện build, ngày qua ngày : cách một tác nhân opencode tên chloeai, gắn với bộ nhớ OpenSelf, đã học nói như tôi trên Discord trong sáu ngày và 146 commit."
date: 2026-09-18
tags: ["discord", "ai", "llm-agents", "openself", "python", "selfbot", "clone"]
authors: ["itsrealfortune"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "zZjU0anqx/bb6Rm7VI+8CCOY9xVF/SIhDfFeZxOG86wV2lXmgjuhtAMVloBTOu4g8bhLGYSTLpIA06iLT04ADQ=="
---

# Chlone : sáu ngày để nhân bản cách tôi nói chuyện trên Discord

*Chuyện build, ngày qua ngày - bởi itsrealfortune*

---

Đây là câu chuyện thật của một dự án kéo dài sáu ngày : **Chlone**, một bot Discord nói chuyện như tôi. Tôi kể hành trình đúng như nó diễn ra, theo thứ tự 146 commit của repo, với giờ giấc, thất bại, đường vòng và những lúc muốn ném hết qua cửa sổ, nhưng không bắt bạn chịu đựng các thông điệp commit.

Mọi thứ khởi đầu từ **cuộc thi với Fox**. Chủ đề, một câu đùa : mỗi người phải thổi hồn cho bản sao của chính mình trên Discord. Và tôi chọn cách tiếp cận hoàn toàn khác với **Protocol Luna** : tôi muốn đặt cược vào tác nhân, một tác nhân dùng ký ức và mọi công cụ AI có thể cần. Trớ trêu thay : sau khi dựng cả hộp công cụ, tôi chỉ cần MCP OpenSelf.

Nguyên tắc, một câu : một tác nhân [opencode](https://opencode.ai) tên `chloeai` chạy sau máy chủ HTTP (cổng 4096), giữ phiên bền vững cho mỗi kênh, moi ký ức của tôi trong OpenSelf, và viết bằng phong cách của tôi, ghi trong `STYLE.md` từ chính tin nhắn thật của tôi. Và để không nghe như robot : chùm tin nhắn, lỗi gõ phím có chủ ý, tin nhắn thoại, GIF, phản ứng, im lặng khi tôi ngủ, và đầy chi tiết và cơ chế khác khiến hơn chục người nghi ngờ bản chất bot.

**OpenSelf là gì?**

OpenSelf là bộ nhớ. Một CLI (`openself`, cài qua `npm i -g openself`) đóng vai kho ngữ cảnh riêng tư và bền vững cho các tác nhân AI của tôi. Trong repo nó không xuất hiện trong cây thư mục, nhưng nó ở khắp nơi : trong archive `ecosystem.config.cjs` (MCP và dashboard OpenSelf chạy dưới PM2 từ những commit đầu), trong `setup.sh` (`npm i -g openself`), và trong toàn bộ `tools/brain/memory.py`.

Cụ thể, OpenSelf là :

- các **ký ức có kiểu** (`fact`, `preference`, `decision`, `relationship`, `event`, `note`), với độ nhạy (public / personal / private / restricted), điểm tin cậy, nguồn, tag ;
- các **scope** : mỗi ký ức thuộc một ngữ cảnh, của tôi, hay `discord/dm/<id>` cho một người cụ thể ;
- **tìm kiếm lai** (từ vựng + vector) phơi bày qua MCP (`openself_openself_search_memory`, `openself_openself_get_context`) mà tác nhân `chloeai` hỏi trước mỗi phản hồi ;
- **phát hiện xung đột** (lần quét hằng tháng của tôi ngày 5) và dedupe lúc ghi ;
- **kho mã hóa** (khóa trong Bitwarden) và **dashboard cục bộ** (cổng 3210) để kiểm tra tất cả ;
- và cho ai lười hơn tôi : `openself feed` để nuôi cá tính từ lịch sử WhatsApp/Telegram của bạn, `openself test`, `openself share` (« Talk to My Clone », trang web), `openself arena` (hai bản sao tranh luận) hay `openself ghost` (nó trả lời khi bạn offline). Tôi làm của tôi bằng tay, nhưng hạ tầng đã ở đó.

Về lý thuyết, một mình OpenSelf đủ để có bản sao, nhưng với tất cả những gì tôi định thêm về tính năng, và vì Discord không được hỗ trợ, tôi thích chỉ dùng phần ký ức.

**Và ký ức với phong cách từ đâu ra?**

Trước tất cả, tôi cho phân tích chính tin nhắn Discord của mình. Bộ công cụ đã sàng DMs và kênh của tôi để trích hai thứ :

1. **Hồ sơ viết của tôi** - phân bố hoa/thường đầu câu, số emoji mỗi tin nhắn và vị trí của chúng, chấm câu (hay thiếu nó : câu không dấu chấm cuối trong trò chuyện bình thường), độ dài trung bình, slang (`mdr`, `tkt`, `tho`), cụm cửa miệng (« Bah », « En vrai ») và các phản xạ kiểu `quoi` -> `Feur`. Tất cả sống trong `STYLE.md`, mà tác nhân đọc lúc khởi động mỗi phiên.
2. **Kho ký ức** lấp đầy OpenSelf : những người tôi nói chuyện là ai, ta bàn chuyện gì, điều cần nhớ về lịch sử của ta, ai là ai. Bot không trả lời vào khoảng không : nó trả lời *về* những người nó « biết ». Nó đọc ký ức của những người xuất hiện trong cuộc trò chuyện để biết họ là ai. Việc này giữ ngữ cảnh bền vững về người khác, không quên họ.

Bot không bịa gì : nó được hiệu chuẩn từng con số trên đồ thật. Đó là lý do nó nghe chuẩn, và những ước lượng « tôi ghi nhận phong cách của bạn » làm bằng tay trông thảm hại bên cạnh.

Trong Chlone, OpenSelf sau đó đóng vai trung tâm : khi điều gì quan trọng lọt vào kênh (từ khóa « projet », « ami », « relation », hay yêu cầu rõ « retiens que... »), bot gõ ký ức vào kho qua `save_to_memory`, có kiểu, định scope theo người, dedupe, kiểm tra xung đột. Và khi cuộc trò chuyện tiếp tục, tác nhân lục ký ức trước khi trả lời. Đó là khác biệt giữa tấm gương và bản sao.

---

---

## THỨ SÁU 11 THÁNG 9 - Ngày 1 : tia lửa

### 08h24 - commit đầu tiên

Mọi thứ khởi đầu từ con số không, nhưng mọi thứ đã ở đó, lộn xộn. Một `discord_watch_bot.py` 372 dòng, selfbot nghe một channel và trả lời qua máy chủ HTTP opencode. Prompt danh tính `CHLOEAI_PROMPT.md`. Một `STYLE.md`. Kịch bản và báo cáo test cho bản sao lúc đó còn tên **Mimo**. Config PM2 để chạy MCP và dashboard OpenSelf. Và cơ sở sqlite làm ngữ cảnh.

Đó là hỗn mang khai sinh. Tôi không lên kế hoạch dự án : tôi lên kế hoạch thí nghiệm. Liệu ta có thể làm bot nghe *thật* con người trên Discord?

### 08h27 - gitignore đầu tiên

Bài học đầu tiên sáng thứ sáu : không bao giờ commit cơ sở sqlite `-wal` / `-shm`. Tệp khóa của SQLite không phải bộ nhớ, chúng là rác. `.gitignore` ra đời.

### 08h44 - dọn di sản

Tôi dọn di sản của Mimo : báo cáo test, kịch bản, script tích hợp, config PM2. Cho vào `archives/`. Tôi không xóa gì, dự án còn quá trẻ để tôi vứt bất cứ thứ gì. Việc này sẽ thành thói quen.

Báo cáo test đáng dừng lại : Mimo đã được test trên **15 kịch bản** (chat thoải mái, đùa phi lý, hỗ trợ cảm xúc, ý kiến tiêu cực, xung đột với người lạ, đề xuất hợp tác...) cho **9.1/10**. Nhận xét của người test là bài thơ : *« đùa phi lý quá giải thích »*, *« đôi khi 2 câu trong khi 1 là đủ »*, *« "Prends soin de toi aussi" hơi dài »*. Đó là lộ trình của dự án trước cả khi dự án tồn tại : **ngắn = tốt hơn**.

### 08h48, 09h07 - qua lại intents

Các `.pyc` bị loại, và lần dọn config đầu... mà tôi phá hai mươi phút sau : không bật intents, ta không nhận nội dung tin nhắn. Quay lại, cộng script khởi chạy (`run_watch_bot.sh`). Qua lại trong 20 phút : đó là khám phá. Viết bản đầu, phá, viết lại.

### 09h13 → 09h58 - gia công prompt

Buổi sáng là chuỗi đánh bóng, đầu tiên phong cách, rồi ngữ cảnh :

- nhiều dòng phản hồi = nhiều tin nhắn gửi nối tiếp nhau (chùm), prompt thành ý thức về cuộc trò chuyện đang diễn ra ;
- xong cache tự chế để lấy DMs : gõ thẳng API REST của Discord ;
- danh tính được nhắc lại mỗi 5 tin nhắn, để bot không quên mình là ai dọc đường ;
- theo dõi tác giả đã thấy : với gương mặt mới, chỉ dẫn rõ đi tìm trong ký ức ;
- hiện tên hiển thị thật thay vì object nội bộ ;
- các tin nhắn ta chọn bỏ qua thành ngữ cảnh thụ động cho phản hồi tiếp theo ;
- « Bah » được định lượng : hiếm, nếu không bản sao thành biếm họa của tôi ;
- bot biết rằng có ký ức để tìm trước khi trả lời.

Mỗi lượt là một vòng siết. Ở giai đoạn này, bot không « nói » chỉ vì tôi nhắc nó là ai theo khoảng đều.

### 10h16 - lỗi gõ phím

Commit định nghĩa dự án. Lỗi chính tả không phải bug : đó là **bằng chứng nhân tính**. 6% cơ hội gõ lệch trên bàn phím AZERTY, 4% đảo hai chữ. Tin nhắn đi kèm lỗi, rồi được **sửa 1-2 giây sau** với bản đúng. Vì người thật, họ gửi rồi sửa.

### 10h29, 10h32 - giọng nói

`fortune-v6.onnx` : mô hình TTS, huấn luyện để giống *giọng tôi*. Bot sẽ không chỉ viết như tôi, nó cuối cùng sẽ *nói* như tôi. Đó là lúc dự án thôi là trò đùa và thành hơi kỳ lạ. Tôi mê.

Cơ chế gói trong một commit : Piper sinh âm thanh, ffmpeg đổi sang opus, API Discord gửi « voice message » thật kèm waveform và độ dài. Xong trong 3 phút barely sau khi mô hình tới. Mong muốn đã ở đó từ đầu.

### 11h27 - refactor lớn đầu tiên

Ba giờ sau commit đầu, khối monolith 456 dòng không quản nổi nữa. Tôi chẻ hết vào `tools/` : `config.py`, `discord_api.py`, `memory.py`, `opencode.py` (188 dòng), `typo.py`, `voice.py`. Chu kỳ cổ điển : ghép nhanh, vỡ, ráp lại.

Tiếp theo, dồn dập :

- token rời khỏi mã và đi qua `.env` ;
- bot theo dõi một channel, một danh sách, hay tất cả (`*`) ;
- cơ sở sqlite cũ hết lý do tồn tại : bộ nhớ đi qua OpenSelf ;
- các `README.md` đầu, và tài liệu đầu đọc được tạm ;
- một `setup.sh` : venv chuyên (python hệ thống mang discord.py khác, bẫy cổ điển), symlink tác nhân tới `~/.config/opencode/agents/`, sẵn sàng chạy ;
- bộ nhớ biết nó được tạo *ở đâu* (định danh channel), và tỷ lệ tin nhắn thoại tự chỉnh.

### 12h00 - phản xạ

Một mục mới trong STYLE : phản xạ. Phản xạ là kích thích -> phản hồi, không suy nghĩ. Cánh cửa mở cho các phản hồi phi lý.

Rồi tới giờ ăn trưa, và câu hỏi hiện sinh : bot có trả lời `Feur` khi người ta bảo nó `quoi` không?

### 13h03 - « quoi ? » -> « Feur »

Có. Tất nhiên là có. Đó là commit quan trọng nhất của dự án, về mặt văn hóa. Tôi thậm chí nói : test đơn vị duy nhất đáng kể.

Rồi ta bôi trơn :

- tác giả hiện bằng *global name* của họ ;
- chấm câu cắt cụt trước khi test phản xạ (phải cắt `quoi ?`, nếu không `Feur` không đi) ;
- `tqt` khét tiếng sửa thành `tkt` trong STYLE, người không biết dự án sẽ thắc mắc sao tôi commit cái đó. Tôi thì biết : bản sao viết `tqt` là bản sao hiệu chuẩn kém, và không ai muốn nói với bản sao hiệu chuẩn kém ;
- mention `@123456789` thay bằng tên thật trong ngữ cảnh ;
- bot bắt đầu theo dõi mọi kênh theo mặc định.

### 16h37 - im lặng

`[void response]`. Bot học từ quan trọng nhất để không thành ký sinh xã hội : **im lặng**. Tin nhắn nền giữa hai người không liên quan tới nó gọi im lặng. Dự trữ là tính năng.

**Cuối ngày 1 : 38 commit. Bot viết, gõ sai, nói, im lặng.**

---

---

## THỨ HAI 14 THÁNG 9 - Ngày 2 : cá tính

Ta tiếp tục, 10h sáng.

### 10h12 - ai nói với ai

Mỗi tên nhận được được hệ thống gắn tiền tố emoji : 🧑 con người, 🤖 bot (xử lý khô hơn), 👑 **người sáng tạo, tức là tôi** trên tài khoản chính của tôi. Quy ước này sẽ cai quản phần còn lại của dự án : bản sao không bao giờ được đối xử « mô hình gốc » của nó như người lạ.

### 10h16 - quy tắc chấm câu

Tôi chính thức hóa trong STYLE : câu không dấu chấm cuối trong trò chuyện bình thường, dấu chấm dành cho tình huống nghiêm túc. Quy tắc tuyệt đối. Bản sao đặt dấu chấm khắp nơi, cảm nhận được ngay.

### 10h58 - GIF

Thư viện GIF cá nhân của tôi, kèm quy tắc dùng : Patrick Jane khi tôi đoán ai đó, Miss Fortune khi tôi bình tĩnh trước người bực, gif bescherelle rơi khi đối phương mắc lỗi. MCP tĩnh phơi bày chúng cho tác nhân. Bot, qua GIF của tôi, thành hơi giống tôi.

### 11h07 → 11h35 - gọt giũa

Hint GIF trong prompt tinh chỉnh, emoji custom của Discord vào (của tôi thật, 14 ID cập nhật), và quản lý tên trong hint bộ nhớ được đánh bóng.

### 11h41 - một kênh, một cá tính

Phiên thành **theo kênh** : tôi không nói giống nhau trong hai máy chủ khác nhau, và bot cũng vậy.

### 12h02 - hộp công cụ biểu đạt

Prompt giờ biết đề xuất GIF *và* emoji custom của tôi đúng lúc. Hộp này đầy dần.

### 12h37 - vệ sinh danh tính

- bot KHÔNG BAO GIỜ được nói nó là mô hình nào, không được trích opencode, provider, tên mô hình ;
- sửa « barista » trong danh tính (bot đã giỏi hơn tôi) ;
- tôi dành một giờ hài hòa chấm câu của chính prompt của mình, trớ trêu hoàn hảo.

### 12h50 - script dựng cá tính

Mục media của prompt sinh từ từ điển (`render_medias.py`), xong chỉnh tay.

### 12h59 → 13h18 - định lượng danh tính

Nhắc danh tính, gửi mỗi 5 tin nhắn, thành quá hiện diện : chuyển mỗi 20 tin nhắn. Thêm reset sạch ngữ cảnh. Và dọn hướng dẫn phong cách : gỡ các cụm và cách diễn đạt tiêu cực lỗi thời.

### 14h09 - bot tự lên tiếng

Bot ngừng là phản xạ : nó có thể **nói mà không được gọi**, khi ngữ cảnh kích hoạt điều gì (tệp `behavior.py` ra đời, 91 dòng). Đó là lúc ta chuyển từ « đáp lại » sang « hiện diện » : bạn thật có thể viết cho bạn trước.

### 14h20, 14h22 - tin cậy phản hồi

Xử lý lỗi khi gửi thất bại, và có thể phản ứng thay vì trả lời, đôi khi một phản ứng đáng nghìn lời.

### 18h16 - dành thời gian

Bot không trả lời trong 200ms như script nữa. Nó để trôi khoảng lặng không hoạt động kiểu con người, nó « dành thời gian ». Đó là thứ khiến bot không thể phát hiện trong demo : chính độ trễ luôn tố cáo những bot khác.

### 23h45 - việc vặt buổi tối

Gần nửa đêm và tôi đẩy phát hiện URL mở rộng tới tên miền trần. Đúng nhịp thật của ngày : tiến bộ rực rỡ lúc 14h, rồi việc vặt buổi tối vì tôi vẫn còn trong zone.

**Cuối ngày 2 : 61 commit tích lũy. Bot có cá tính, media, phản xạ.**

---

---

## THỨ BA 15 THÁNG 9 - Ngày 3 : ngày khổng lồ

57 commit trong một ngày. Đó là ngày dự án thành... mọi thứ nó là hôm nay.

### 08h18 → 08h37 - bào sáng

- trễ không hoạt động ta bịa ra thành quá dài : trần ở 30s (và chỉnh lại hai lần, bằng chứng ta mò giá trị đúng) ;
- các tệp `.bak` đầu và bản sao lưu cơ sở đầu : bản năng bảo tồn phát triển ;
- bộ nhớ nhớ *ai* (tên hiển thị) và *trong khung nào* (scope) ;
- ID tác giả chảy khắp pipeline lưu ;
- quản lý « người sáng tạo » thành danh sách admin thật (`ADMIN_IDS`), và mọi thứ chạm tới tác giả di cư vào `authors.py`. Monolith lại vỡ thêm.

### 08h43 - TODO list nhân bản hóa

Danh sách chuyên cho những thứ nhỏ khiến ta không còn cảm thấy máy. Đó là lộ trình của sprint tiếp theo.

### 08h44 → 08h46 - khế ước máy con người

- bot im lặng ban đêm, trong khung giờ yên cấu hình được (tắt theo mặc định, không phải ai cũng có giờ giấc như tôi) ;
- một dòng mỗi phản hồi có thể mất dấu. Người mệt viết vậy. Bot cũng vậy, đôi khi ;
- dòng nhỏ « Chloé đang chơi ... » tự đổi mỗi 30 phút, để hồ sơ của tôi trông sống ngay cả không tin nhắn.

### 08h46 - một phản ứng, không phải tiểu thuyết

Tin nhắn quá yếu không đáng một câu? Một phản ứng là đủ. Kinh tế năng lượng xã hội, và rất giống tôi.

### 08h51 - PARRY, tâm trạng

148 dòng trong `tools/mood.py`. Bot giờ có **tâm trạng**, kiểu hệ thống PARRY (chatbot loạn thần thập niên 70, tôi công khai lấy cảm hứng) : năng lượng, hòa đồng, trêu chọc, ba số thực évoluent giữa 0 và 1 và nhuộm mỗi phản hồi. `.mood.json` lúc đó, để đời : năng lượng 0.88, hòa đồng 0.68, trêu chọc 0.56. Một ngày đẹp.

### 09h00 → 09h43 - giọng hai chiều + soundboard

- bot có thể vào kênh **thoại**, nói qua Piper, và tự rời khi xong ;
- rồi ý lớn thứ hai : bot **nghe** kênh (bắt RTP, phát hiện tiếng nói VAD, phiên âm Whisper), và có thể để người ta ngắt lời ;
- ở giữa, soundboard xuất hiện : danh mục âm thanh kèm ý nghĩa, tác nhân **chọn** âm thanh trước cả khi nói, và quy tắc cuối là « soundboard trước, giọng là phương án cuối », bot thích gửi âm thanh hơn nói. Như tôi ;
- chỉnh xác suất thoại khiến tất cả khả thi ;
- và sự tới của `davey`, lib mà tôi biết tới mười phút trước và sẽ nguyền rủa trong một giờ.

### 09h51 - lúc Discord nói không. Không, không, nhưng không.

**MLS**. Discord gần đây mã hóa luồng âm thanh đầu cuối, và bản bắt của tôi chỉ nhận nhiễu. Phải giải mã, và giải mã từ chối nhả. Mở ra saga lớn nhất của repo, ba chục commit để học cách nghe.

Ta đã thử mọi thứ : layout nonce transport, tắt E2E (máy chủ ném trả vào mặt, nó áp đặt), ứng viên khóa lấy từ nhóm, lỗi chi tiết, fallback transport, nội soi từ trong nhóm, ứng viên theo leaf-index với backoff, ánh xạ hook SPEAKING, thử ở media type video (hỏng), và bỏ qua ssrc video...

Tôi bỏ phản hồi thoại trong lúc gỡ lỗi (comment, không xóa), thêm chế độ bắt handshake, rồi đổ cấu trúc các gói hỏng, như nhà khảo cổ. Sáu layout nonce. Backoff. Nội soi nhóm. Tôi đặt bot ở debug toàn diện và mở từng gói để xem bên trong có gì.

Điều cốt yếu không phải nó chạy, mà là **tôi không vứt gì**. Danh sách commit là sổ lab : mỗi thử hỏng được lưu kèm giả thuyết. Đó là mặt « tôi giữ hết, sẽ dùng cho debug sau » của tôi đã trả công.

### 10h43 - bot bị cắt nhỏ

Ngay giữa chiến tranh MLS, tôi vẫn dọn nhà. 546 dòng biến mất khỏi bot chính, để tái sinh trong `pipeline.py` (intake, lý do bỏ qua, xử lý), `sender.py` (burst, typo, voice) và `loops.py` (tự phát, hoạt động).

### 10h47 - kiến trúc thật

`tools/` thành có tổ chức : `brain/` (opencode, memory, mood), `voice/` (voice, vocal, listen, soundboard), `fun/` (behavior, typo, emotes, gif). Dự án có bộ xương rồi.

### 10h49 → 11h16 - tiện nghi dev

- ngưỡng bơm tâm trạng chỉnh ;
- bốn commit nhỏ cho loại trừ trình chỉnh (`data/`, `voices/`, log, cơ sở), đúng, tôi đặt bốn cái, chính dự án định ưu tiên, không phải spec ;
- cơ sở metadata rời khỏi theo dõi ;
- dự án thành **tái dùng được cho người khác** : template chung `PERSONA.example.md` và `STYLE.example.md` để nhân bản phong cách *của mình* ;
- danh tính đổi tên sạch (`CHLOEAI_PROMPT` thành `PERSONA`), và README khử cá nhân, tôi gỡ « Chloé » khỏi tài liệu công khai, cô ấy chỉ kể trong riêng tư ;
- mọi tuning của bot chuyển vào `config.yaml` ghi đè (gitignore), với ví dụ comment từng dòng ;
- script cài đặt giờ chuẩn bị cả tệp env và config.

### 11h49 - emoji rời

Emoji custom dính vào văn bản thay vì tách sạch. Fix tầm thường, hiệu ứng khổng lồ : không gì hét « bot » như emoji dán sai cuối câu.

### 14h19 - chốt chặn thoại

Nếu ai gọi lệnh thoại, ta không xử lý tin nhắn như tin nhắn bình thường. Nháy mắt : việc vặt luôn quay lại buổi tối.

**Cuối ngày 3 : 118 commit tích lũy. Bot nghe, nói, im lặng ban đêm, có tâm trạng và danh thiếp.**

---

---

## THỨ TƯ 16 THÁNG 9 - Ngày 4 : độ tin cậy

13 commit. Ngày « nghiêm túc ».

### 08h49 → 08h59 - tuổi trưởng thành

Tài liệu pháp lý : giấy phép **độc quyền**, quy tắc ứng xử, hướng dẫn đóng góp, chính sách bảo mật, bằng tiếng Anh rồi tiếng Pháp, với qua lại sửa chữa và đổi tên tệp tới mức tỉ mỉ. Tôi đã dành hàng giờ cho nó, và đó là mảng kém vui nhất của repo, xa.

### 09h56 - bot nhìn thấy

Ảnh đính kèm được phiên âm bằng OCR cục bộ và văn bản bơm vào prompt. OCR chạy cục bộ chỗ tôi. Tôi không gửi meme của bạn tới máy chủ bên thứ ba, ngay cả trên lý thuyết.

### 11h09 - ngân sách hợp lý

Cách mạng lặng trong ngân sách : khi kênh cấm gửi hay siết GIF, embed và emoji, **ta thậm chí không gọi mô hình**. Ta không tốn token cho tin nhắn ta không thể gửi.

### 11h42 → 12h55 - nhà tự sửa

- quét lớn : mã chết xóa, bug gửi và auth sửa, helper tách gọn ;
- phiên quá cũ bị đuổi, cache DMs hết hạn, phát hiện tiếng nói rẻ hơn ;
- các import tôi phá khi di chuyển module được khôi phục, và mọi trạng thái runtime (phiên, tác giả đã thấy, tin nhắn bỏ qua, tâm trạng) sống sót khởi động lại trong `data/`.

### 14h41 - hai thế giới, một bot

Lớp tương thích tự phát hiện phiên bản `discord` đã cài và thích ứng intents với auth REST. Kết quả : cùng mã chạy như **app chính thức** (discord.py) hay như **selfbot** (discord.py-self). Hai thế giới, một bot.

### 15h05 - hiện diện thích ứng

Cách hiện diện thích ứng theo chế độ, và danh sách admin cập nhật.

**Cuối ngày 4 : 131 commit tích lũy. Dự án hợp pháp, hợp lý, và chạy khắp nơi.**

---

---

## THỨ NĂM 17 THÁNG 9 - Ngày 5 : release

14 commit. Ngày trưởng thành.

### 09h15 → 09h30 - bộ nhớ thành kỷ luật

- ký ức xếp theo scope, và ta không trích ký ức của DM trong máy chủ (hay ngược lại) mà không nghĩ ;
- ta phân loại ký ức (sự kiện, sở thích, quyết định, quan hệ...) và dedupe lúc ghi : hai ký ức mâu thuẫn không thể chung sống lặng lẽ nữa ;
- blacklist tùy chọn (`aventuros`) ngăn bot trôi sang vài chủ đề. Tắt theo mặc định, có cho ai nhát ;
- config thoại chết bị gỡ.

### 10h12 - bộ nhớ được kiểm toán

**Quét xung đột bộ nhớ hằng tháng** + bench A/B tìm kiếm. Bộ nhớ của bot thành tài sản được kiểm tra. Ta đã rất, rất xa thứ sáu 11, 08h24.

### 10h54 - lockdown

Ngày tôi chơi hoang tưởng. Khóa tác nhân :

- ghi bộ nhớ **từ chối** (tác nhân không thể làm bẩn kho, ngay cả khi bị inject) ;
- công cụ Discord **chỉ đọc** (gửi đi qua mã, không bao giờ qua tác nhân) ;
- **không tác nhân con** (lách lockdown), không webfetch (SSRF localhost, rò rỉ), không hỏi ở headless ;
- Docker cứng : bot non-root, `no-new-privileges`, `cap_drop: ALL`, giới hạn bộ nhớ/CPU, hàng đợi tiến trình giới hạn, secret qua `.env` không bao giờ bake.

Tôi viết nguyên tắc trong mã, bằng comment : *« dev qua các phiên con người, không phải ở đây »*.

### 11h02 → 11h15 - hoàn thiện bảo mật

Từ khóa lưu bộ nhớ siết lại và ghi còn hạn chế hơn. Ta cũng thêm vào gitignore tệp sao lưu ngữ cảnh, tôi bắt đầu không lưu hết mọi thứ, nhưng gần như.

### 12h39 - tâm trạng nhẹ hơn

Tâm trạng PARRY không còn bơm mỗi tin nhắn : một lần cho mỗi trạng thái. Xong việc nuôi 3 số thực mỗi phản hồi.

### 12h47 - commit giải phóng

`PERSONA.md`, `STYLE.md` và `chloeai.md` thành **ví dụ** (`chloeai.example.md`, `PERSONA.example.md`, `STYLE.example.md`), giọng của tôi `fortune-v6.onnx` rời repo, dữ liệu và log cũng vậy, `.env.example` ra đời. Dự án không còn chứa cá tính *của tôi* : nó chứa **cơ chế** để mang một cá tính.

### 12h52 - v1.0.0

**Tag v1.0.0, ký bằng SSH.** Changelog, runbook vận hành, kill-switch (dừng mà không xóa gì). Sáu ngày, tròn, giữa commit đầu và release.

### 12h53 → 13h14 - giặt giũ

Chấm câu comment hài hòa, quyền bộ nhớ và quy tắc scope ghi lại cập nhật.

**Cuối ngày 5 : 145 commit tích lũy. v1.0.0 đã ra.**

---

---

## THỨ SÁU 18 THÁNG 9 - Ngày 6 : anti-climax

Một commit duy nhất, lúc 00h02.

Commit cuối của dự án, và nó lố bịch. Mô hình « free tier » tác nhân dùng nhận diện client OpenCode bằng **sự hiện diện** của vài công cụ trong yêu cầu (`bash`, `glob`, `grep`). Nếu ta gỡ chúng, ngay cả vì lý do bảo mật chính đáng, nhà cung cấp trả `403 FreeTierError: can only be used from within OpenCode`. Nên tôi phải cho phép lại, ngay trước khi khóa hết, đúng thứ tôi vừa chặn, để bot tiếp tục chạy miễn phí.

Đó là commit buồn cười nhất của repo và tôi giữ nguyên : sau 6 ngày thuần hóa Discord, Piper, MLS, OpenSelf và Docker, chính **mô hình AI miễn phí** ra lệnh chính sách bảo mật của tôi.

---

---

## Các con số


|                                               |                                                |
| --------------------------------------------- | ---------------------------------------------- |
| Commit                                       | **146**                                        |
| Ngày hoạt động                                  | **6** (11 -> 18 tháng 9 2026)                |
| Tệp theo dõi                             | 65                                             |
| Dòng Python cuối                         | ~4 000                                         |
| Điểm test phong cách (Mimo, ngày đầu) | **9.1/10**                                     |
| Phiên bản cuối                                | v1.0.0 (tag ký SSH, giấy phép độc quyền) |

## Điều tôi giữ lại từ 6 ngày này

1. **Thứ tự ưu tiên lung tung, và đó là phương pháp đúng.** Tôi đầu tiên xây bot *trả lời*, rồi bot *nghe chuẩn*, rồi bot *đáng tin*, rồi bot *an toàn*, và cuối cùng bot *phân phối được*. Cá tính trước bảo mật, `Feur` trước giấy phép. Ta không giữ được nhịp này nếu theo quy tắc của các dự án « làm đúng ».
2. **Phong cách, trước hết là danh sách « không ».** `STYLE.md` hữu ích nhất của tôi không mô tả điều tôi nói, nó loại trừ điều tôi không làm : kết câu không dấu chấm, giới hạn emoji ở một cái, viết `mdr` chữ thường, vào thẳng không mở đầu kiểu « Je vérifie juste un détail » đầu phản hồi. Ký sinh bot dễ bắt hơn nét tính cách khó định nghĩa.
3. **Thất bại là dự án.** Ba chục commit cho MLS, một test vứt, sáu layout nonce test. Lịch sử trung thực nhất về điều tôi sống là các chuỗi thử hỏng ngày thứ ba.
4. **Bản sao là bộ nhớ, không phải phong cách.** Phong cách tạo ảo giác mười tin nhắn. Bộ nhớ (OpenSelf, scope, dedupe, quét xung đột) tạo bền lâu. Đó là thứ tách tấm gương khỏi con người.
5. **Các commit cuối luôn buồn cười.** Commit 146, cái cho phép lại `bash`, `glob` và `grep` vì free tier đòi công cụ của chính nó hiện diện, là món tôi thích nhất.

Và tổng kết, để kết : **kết quả choáng váng, thậm chí bluff.** Bản sao giữ cuộc trò chuyện mà không đoán ra máy, nhớ người, dự án, đùa cũ, chủ động và đánh dấu bằng tâm trạng, và nó thắng Fox luôn. Hơi rợn, một chút, và đúng thứ ta tìm.

---

*Dự án không công khai : giấy phép độc quyền, toàn quyền giữ. Nhưng lịch sử, tôi kể cho bạn. Nếu một ngày bạn gặp « ·Chloé » nào trả lời bạn bằng GIF Patrick Jane sau khoảng lặng không hoạt động hoàn hảo kiểu con người... giờ bạn biết đằng sau giấu gì.*

---

Bản sao của tôi đã viết phiên bản riêng của bài, bạn có thể đọc [ở đây](./article-chlone-timeline-chloeai.md).
