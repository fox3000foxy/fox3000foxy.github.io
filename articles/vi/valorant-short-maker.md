---
title: "valorant-short-maker : pipeline tự động tạo shorts Valorant của tôi"
description: "Groq/Llama viết kịch bản, Piper lồng tiếng, FFmpeg lo phần còn lại. Cách một cron job sản xuất và đăng một video mỗi ngày lên @valorant_agents, từ A đến Z."
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "HJZn57uG54MXiBogCL2OU/fAqJUfl5JBZw/jBzSkEncV3fBRgi5299SmuzzBiAnz6PELkjZEZ54QT/OMxtjmHw=="
---

# valorant-short-maker : pipeline tự động tạo shorts Valorant của tôi

Vài tháng nay, một kênh YouTube chạy mà tôi không hề đụng vào : [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop). Các đặc vụ Valorant trêu nhau giữa hai round, được lồng tiếng, phụ đề karaoke, đăng dưới dạng Shorts. Mọi thứ đều do [`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker) tạo ra, một pipeline TypeScript/Bun chạy bằng cron và đăng bài mà không cần ai bấm gì cả.

Đây là cách nó hoạt động, từng bước một.

## Thành phẩm trông thế nào

Ba frame trích từ video được tạo cho "Duelist Debate" (Phoenix, Yoru và Jett) :

![Intro của một short, vòng tròn đặc vụ với tiêu đề cảnh](/images/valorant-short-maker/vsm-01-intro.png)

![Một câu thoại đang diễn ra, phụ đề karaoke sáng dần](/images/valorant-short-maker/vsm-02-dialogue.png)

![Một câu thoại khác, màu phụ đề đổi theo đặc vụ](/images/valorant-short-maker/vsm-03-dialogue.png)

Kết quả trực tiếp trên Short này : [Duelist Debate -- youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU). Trên kênh, các Short xoay quanh 1,2 đến 1,5k lượt xem. Không có gì to tát, nhưng đây là một kênh chạy hoàn toàn tự động từ đầu, nên con số thực sự đáng kể là số không -- không phút nào bỏ ra một khi cron đã chạy.

## Pipeline, theo thứ tự

### 1. Viết kịch bản -- Groq + Llama 3.3

Mỗi lần chạy bốc ngẫu nhiên 3 đến 4 đặc vụ trong số 26 đặc vụ có sẵn, và gửi cho Llama 3.3 70B (qua Groq) một prompt hệ thống chứa, cho mỗi đặc vụ được chọn, một bản tóm tắt gọn về tính cách và mối quan hệ của họ với các đặc vụ khác có mặt trong cảnh (các persona này sống trong `src/lore/`, một tệp cho mỗi đặc vụ). Prompt áp đặt các quy tắc chính xác : một câu ngắn gọn đanh thép cho mỗi lời thoại, luân phiên công bằng giữa các nhân vật, ưu tiên hài hước, và nhất là các khoảng nghỉ.

Ví dụ cụ thể với "Duelist Debate" -- Phoenix, Yoru và Jett tranh nhau xem ai chơi duelist, được tạo ngày 6 tháng 7 năm 2026 :

```
phoenix: I'm telling you, I've got the skills to play duelist this match.
yoru: Skills, you call burning things skills, Phoenix.
jett: I'm the fastest one here, I should play duelist.
phoenix: Fastest, but can you handle the heat, Jett [0.3] I doubt it.
yoru: Heat, ha, you think your flames are hotter than my rifts.
jett: This isn't about heat or flames, it's about speed and agility.
phoenix: Oh, I see, so now you're an expert on duelists, Yoru [0.3] that's rich.
yoru: At least I don't rely on cheap fire tricks.
jett: Cheap fire tricks, that's what you call Phoenix's abilities.
phoenix: Hey, my fire tricks have gotten us out of tight spots before [0.3] can't say the same for your rifts, Yoru.
yoru: Tight spots, you mean like the time I rifted us out of that trap.
jett: Enough, this is getting nowhere, let's just decide already.
phoenix: Fine, but I'm still saying I'm the best duelist here.
yoru: Please, you think you can take on the enemy team alone [0.3] I doubt it.
jett: I can take them on, no problem, I'm the fastest.
phoenix: Fastest, yeah, but can you outmaneuver them [0.3] that's the question.
yoru: Outmaneuver, ha, you think you can outmaneuver anyone, Phoenix.
jett: This is stupid, we're not going to agree on this.
phoenix: Fine, let's just play and see who comes out on top [0.3] I'm game if you are.
yoru: Bring it on, I'll show you what a real duelist looks like.
jett: I'm not backing down, I'm playing duelist.
phoenix: Oh, this should be good [0.3] let's see how you two do.
yoru: We'll see who comes out on top, won't we, Jett.
jett: Yeah, let's end this debate once and for all.
pause: 0.3
phoenix: Alright, let's get started then [0.3] may the best duelist win.
yoru: I'll make sure to burn you, Phoenix, not with fire, but with my rifts.
jett: I'll take you both down, no problem.
```

Các khoảng nghỉ là chi tiết khiến nhịp tự nhiên : `[0.3]` chèn giữa một câu thoại tạo ra khoảng lặng 0.3s trong tệp âm thanh mà không cắt vòng tròn đặc vụ trên màn hình, trong khi một dòng `pause: 1.0` riêng biệt tạo ra khoảng lặng thật giữa hai người nói, vòng tròn ẩn đi. Không có nó, một TTS nối các câu thoại không ngừng nghỉ nghe rất robot.

### 2. Lồng tiếng -- Piper, một mô hình cho mỗi đặc vụ

Mỗi đặc vụ có mô hình Piper riêng (`.onnx`) được huấn luyện chuyên biệt, lưu trong `voices/<agent>/`. Văn bản sinh ra đi qua mô hình tương ứng, cho ra một WAV. Đây là cùng công nghệ tôi dùng để huấn luyện giọng tùy chỉnh nói chung (xem bài về pipeline Piper/Kaggle) -- ở đây áp dụng trực tiếp trong prod, tức thì, mỗi lần tạo video.

### 3. Phụ đề karaoke -- ASS sinh ra, màu trích từ biểu tượng

Phụ đề không phải `.srt` đơn giản. Đó là tệp `.ass` (Advanced SubStation Alpha) sinh ra từng từ, với hiệu ứng karaoke : mỗi từ sáng dần bằng một màu khi được phát âm, trong khi phần còn lại của văn bản giữ màu trung tính. Màu nhấn không cố định -- nó được trích động từ biểu tượng của đặc vụ đang nói (một script Python chạy PIL trên PNG biểu tượng, lấy mẫu các pixel không trong suốt, và trả về các màu trội). Kết quả : phụ đề của Killjoy sáng màu tím, của Jett màu xanh ngọc, mà không màu nào bị ghi cứng ở đâu cả.

### 4. Vòng tròn phản ứng âm thanh -- một biểu thức FFmpeg cho mỗi frame

Đây là phần quái nhất của pipeline, và có lẽ là phần tôi tự hào nhất. Biểu tượng tròn của đặc vụ đang nói không đứng yên : nó phóng to thu nhỏ nhẹ theo nhịp giọng nói của chính mình.

Phép tính thực hiện bằng cách đọc WAV thô của câu thoại, tính đường bao RMS (root mean square, một thước đo năng lượng tín hiệu) từng frame ở 60 fps, chuẩn hóa theo giá trị tối đa, rồi làm mượt trên cửa sổ 3 frame để tránh giật. Mỗi giá trị đường bao sau đó được chuyển thành hệ số thu phóng bị chặn bởi `MAX_ZOOM_VARIATION` (0.2, tức ±20% quanh kích thước cơ sở).

Kết quả tính toán này không được áp dụng qua mã thao tác pixel -- nó được dịch thành một biểu thức điều kiện FFmpeg khổng lồ (`lt(n,K)*val + between(n,K,K')*val + ...`, một nhánh cho mỗi nhóm frame) điều khiển trực tiếp tham số `scale` của bộ lọc video. FFmpeg đánh giá biểu thức này ở mỗi frame render. Với một câu thoại vài giây ở 60 fps, nhanh chóng thành hàng trăm nhánh trong một biểu thức duy nhất -- vì vậy tham số `STEP` gom các frame để giới hạn độ sâu.

### 5. Render từng đoạn, rồi fisheye trên intro

Mỗi câu thoại được render riêng : nền video (đoạn trích ngẫu nhiên từ một trong các clip gameplay trong `bg-video/`, cắt đúng độ dài), vòng tròn đặc vụ phủ lên trên với zoom phản ứng âm thanh, phụ đề nhúng qua bộ lọc `ass` của FFmpeg, âm thanh TTS trộn với âm gameplay nền.

Đoạn đầu tiên nhận xử lý đặc biệt : méo fisheye tan dần trên 20% frame đầu (bộ lọc `lenscorrection` đánh giá từng frame, cộng `tmix=frames=3` trộn các frame kề để mô phỏng motion blur), đồng bộ với tiếng "whoosh". Đó là chuyển cảnh intro tạo cảm giác camera "lao" vào cảnh.

### 6. Nối và trộn cuối

Tất cả các đoạn được nối liền nhau, nhạc nền (Sneaky Snitch, Kevin MacLeod, giấy phép Creative Commons) được trộn lên trên với **ducking audio** -- nén sidechain tự động hạ âm lượng nhạc khi một đặc vụ nói, và nâng lên trong khoảng lặng. Toàn bộ chạy 60 fps từ đầu đến cuối, không chuyển đổi framerate giữa các bước.

### 7. Đăng tự động

Script `run-cron.sh`, chạy bởi một cron cổ điển, kích hoạt môi trường Python, tải `.env`, và chạy `bun src/workflow.ts --upload`. Cờ `--upload` kích hoạt thêm việc tạo metadata (tiêu đề, mô tả, tag) và gọi `uploaders/upload.py`, đăng video lên YouTube và Instagram qua hai script riêng (`uploaders/youtube/upload.py` và `uploaders/instagram/`). Toàn bộ chuỗi, từ prompt LLM tới video online, chạy không cần can thiệp con người.

## Vì sao TypeScript/Bun thay vì thứ gì đó toàn Python

Lựa chọn không mang tính ý thức hệ -- vì Bun cho truy cập trực tiếp và nhanh tới `Bun.spawn` để điều khiển FFmpeg trong tiến trình con, gõ kiểu mạnh trên cấu trúc dữ liệu pipeline (`Phrase`, `SegmentInfo`), và runtime khởi động nhanh hơn nhiều so với Node cho một script chạy bằng cron mỗi X giờ. Hai mẩu Python duy nhất trong dự án nằm đúng chỗ Python thực sự có công cụ tốt nhất : PIL để trích màu, và các API upload (`google-api-python-client` cho YouTube, stack Instagram Graph API cho IG).

## Điều này minh họa điều gì

Dự án này là một ví dụ hay về những gì có thể xây dựng ngày nay với các viên gạch hoàn toàn miễn phí hoặc open source : một LLM nhanh và miễn phí qua API Groq, một động cơ TTS cục bộ chạy không cần GPU chuyên dụng, FFmpeg cho toàn bộ render video -- và chất kết dính, chỉ là vài trăm dòng TypeScript. Không viên gạch nào mới riêng lẻ. Điều làm nên pipeline chính là cách sắp xếp : tạo một kịch bản mạch lạc với quan hệ thật giữa các nhân vật, biến nó thành âm thanh biểu cảm với khoảng nghỉ tự nhiên, đồng bộ render hình ảnh theo năng lượng âm thanh đó từng frame, và tự động hóa toàn bộ chuỗi tới khi đăng bài.

---

**Tài nguyên**

- **Repo** : [github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **Kênh** : [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**3 điểm chính**

1. Kịch bản do LLM tạo (Groq/Llama 3.3) với persona và quan hệ cho mỗi đặc vụ, không phải danh sách câu đùa viết sẵn đơn giản.
2. Zoom vòng tròn đặc vụ được điều khiển bởi biểu thức FFmpeg tính từng frame từ đường bao RMS của WAV -- không phải animation keyframe cổ điển.
3. Toàn bộ chuỗi, từ prompt tới bài đăng YouTube/Instagram, chạy qua một cron job duy nhất không cần can thiệp con người.
