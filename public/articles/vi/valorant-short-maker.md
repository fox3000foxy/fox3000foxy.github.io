---
title: "valorant-short-maker: pipeline tự sinh short Valorant của tôi"
description: "Groq/Llama viết kịch bản, Piper lồng tiếng, FFmpeg xử lý phần còn lại. Cách một cron job sản xuất và đăng tải một video mỗi ngày lên @valorant_agents, từ A đến Z."
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "uz8H627awfkX1tNmaiDv3zN1DJB1hH5SkLiY9L99G9LUv5U9X6gECN9nU5dAI6exmLBh/g/BOEf2m6K3cixRQw=="
---

# valorant-short-maker: pipeline tự sinh short Valorant của tôi

Vài tháng nay, một kênh YouTube chạy mà tôi không phải động tay vào: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop). Các đặc vụ Valorant cãi nhau giữa các vòng đấu, được lồng tiếng, phụ đề karaoke, đăng dưới dạng Shorts. Mọi thứ đều do [`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker) tạo ra, một pipeline TypeScript/Bun chạy cron và tự đăng tải mà không ai phải bấm gì cả.

Đây là cách nó hoạt động, từng bước một.

## Kết quả ra sao

Ba khung hình trích từ video tạo cho "Duelist Debate" (Phoenix, Yoru và Jett):

![Intro short, vòng tròn đặc vụ với tiêu đề cảnh](/images/valorant-short-maker/vsm-01-intro.png)

![Một câu thoại đang chạy, phụ đề karaoke sáng lên](/images/valorant-short-maker/vsm-02-dialogue.png)

![Một câu khác, màu phụ đề thay đổi theo đặc vụ đang nói](/images/valorant-short-maker/vsm-03-dialogue.png)

Kết quả thực tế trên Short này: [Duelist Debate -- youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU). Shorts trên kênh dao động khoảng 1,2 đến 1,5k lượt xem. Không có gì to tát, nhưng đó là một kênh tự chạy từ đầu, nên con số thực sự quan trọng là không -- không phút nào bỏ ra kể từ khi cron được khởi động.

## Pipeline, theo thứ tự

### 1. Viết kịch bản -- Groq + Llama 3.3

Mỗi lần chạy chọn ngẫu nhiên 3 đến 4 đặc vụ trong số 26 có sẵn, và gửi cho Llama 3.3 70B (qua Groq) một prompt hệ thống chứa, với mỗi đặc vụ được chọn, một bản tóm tắt gọn về tính cách và quan hệ của họ với các đặc vụ khác trong cảnh (những persona này nằm trong `src/lore/`, mỗi đặc vụ một file). Prompt áp đặt các quy tắc chặt chẽ: mỗi câu thoại ngắn gọn và sắc bén, luân phiên công bằng giữa các nhân vật, hài hước ưu tiên, và trên hết là khoảng nghỉ.

Ví dụ cụ thể với "Duelist Debate" -- Phoenix, Yoru và Jett tranh cãi xem ai sẽ chơi duelist, tạo ngày 6 tháng 7 năm 2026:

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

Khoảng nghỉ chính là chi tiết tạo nên nhịp điệu tự nhiên: `[0.3]` chèn giữa câu thoại tạo ra 0,3 giây im lặng trong audio mà không cắt vòng tròn đặc vụ trên màn hình, còn một dòng `pause: 1.0` riêng biệt tạo khoảng lặng thực sự giữa hai người nói, vòng tròn ẩn đi. Không có chúng, TTS đọc liền tù tì không nghỉ sẽ nghe như robot.

### 2. Lồng tiếng -- Piper, mỗi đặc vụ một mô hình

Mỗi đặc vụ có mô hình Piper (`.onnx`) riêng được huấn luyện đặc biệt, lưu trong `voices/<agent>/`. Văn bản sinh ra đi qua mô hình tương ứng, đầu ra là file WAV. Cùng công nghệ tôi dùng để huấn luyện giọng tùy chỉnh nói chung (xem bài về pipeline Piper/Kaggle) -- ở đây áp dụng trực tiếp trong môi trường production, on-the-fly, mỗi lần tạo video.

### 3. Phụ đề karaoke -- file ASS tạo động, màu trích từ icon

Phụ đề không phải là file `.srt` đơn giản. Đó là file `.ass` (Advanced SubStation Alpha) được tạo từng từ một, với hiệu ứng karaoke: mỗi từ sáng lên với một màu khi được phát âm, phần còn lại của văn bản giữ màu trung tính. Màu nhấn không cố định -- nó được trích xuất động từ icon của đặc vụ đang nói (một script Python dùng PIL đọc PNG của icon, lấy mẫu các pixel không trong suốt, và trả về các màu chủ đạo). Kết quả: phụ đề của Killjoy sáng màu tím, của Jett sáng màu xanh ngọc, không màu nào bị hardcode ở bất cứ đâu.

### 4. Vòng tròn phản ứng âm thanh -- một biểu thức FFmpeg cho mỗi khung hình

Đây là phần phức tạp nhất của pipeline, và có lẽ là phần tôi tự hào nhất. Icon tròn của đặc vụ đang nói không đứng yên: nó zoom nhẹ theo nhịp giọng nói của chính mình.

Quá trình tính toán đọc WAV thô của câu thoại, tính đường bao RMS (root mean square, thước đo năng lượng tín hiệu) từng khung hình ở 60 fps, chuẩn hóa theo giá trị tối đa, rồi làm mịn qua cửa sổ 3 khung hình để tránh giật. Mỗi giá trị đường bao sau đó được chuyển thành hệ số tỷ lệ giới hạn bởi `MAX_ZOOM_VARIATION` (0,2, tức ±20% quanh kích thước cơ bản).

Kết quả tính toán này không được áp dụng qua code thao tác pixel -- nó được dịch thành một biểu thức điều kiện FFmpeg khổng lồ (`lt(n,K)*val + between(n,K,K')*val + ...`, một nhánh cho mỗi nhóm khung hình) trực tiếp điều khiển tham số `scale` của bộ lọc video. FFmpeg đánh giá biểu thức này trên từng khung hình render. Với một câu thoại vài giây ở 60 fps, nhanh chóng có hàng trăm nhánh trong một biểu thức duy nhất -- vì thế có tham số `STEP` để nhóm khung hình nhằm giới hạn độ sâu.

### 5. Render từng phân đoạn, rồi fisheye cho intro

Mỗi câu thoại được render riêng lẻ: nền video (một clip gameplay ngẫu nhiên từ `bg-video/`, cắt đúng thời lượng), vòng tròn đặc vụ phủ lên với zoom phản ứng âm thanh, phụ đề được chèn qua bộ lọc `ass` của FFmpeg, audio TTS trộn với âm thanh gameplay nền.

Phân đoạn đầu tiên được xử lý đặc biệt: hiệu ứng méo fisheye tan dần trong 20% khung hình đầu tiên (bộ lọc `lenscorrection` đánh giá từng khung hình, cộng với `tmix=frames=3` trộn các khung hình liền kề để mô phỏng motion blur), đồng bộ với âm thanh "whoosh". Đó là hiệu ứng chuyển cảnh intro khiến camera như đang "lao vào" khung cảnh.

### 6. Ghép nối và trộn âm thanh cuối cùng

Tất cả phân đoạn được ghép nối tiếp nhau, nhạc nền (Sneaky Snitch, Kevin MacLeod, giấy phép Creative Commons) được trộn vào với **audio ducking** -- nén sidechain tự động giảm âm lượng nhạc khi đặc vụ đang nói, và tăng trở lại khi im lặng. Toàn bộ chạy ở 60 fps từ đầu đến cuối, không chuyển đổi framerate giữa các bước.

### 7. Đăng tải tự động

Script `run-cron.sh`, được cron thông thường khởi chạy, kích hoạt môi trường Python, tải `.env`, và chạy `bun src/workflow.ts --upload`. Cờ `--upload` còn kích hoạt tạo metadata (tiêu đề, mô tả, thẻ) và gọi `uploaders/upload.py`, đăng video lên YouTube và Instagram qua hai script riêng biệt (`uploaders/youtube/upload.py` và `uploaders/instagram/`). Toàn bộ chuỗi, từ prompt LLM đến video online, chạy không cần can thiệp của con người.

## Tại sao TypeScript/Bun thay vì toàn Python

Lựa chọn này không mang tính ý thức hệ -- Bun cho phép truy cập trực tiếp và nhanh chóng tới `Bun.spawn` để điều khiển FFmpeg như tiến trình con, kiểu dữ liệu mạnh cho cấu trúc dữ liệu của pipeline (`Phrase`, `SegmentInfo`), và runtime khởi động nhanh hơn nhiều so với Node cho một script chạy cron mỗi vài giờ. Hai chỗ Python duy nhất trong dự án là nơi Python thực sự là công cụ tốt nhất: PIL để trích xuất màu, và các API đăng tải (`google-api-python-client` cho YouTube, stack Instagram Graph API cho IG).

## Điều này minh họa cho điều gì

Dự án này là một ví dụ tốt về những gì có thể xây dựng ngày nay với các khối hoàn toàn miễn phí hoặc mã nguồn mở: một LLM nhanh và miễn phí qua Groq API, một engine TTS cục bộ chạy không cần GPU riêng, FFmpeg cho toàn bộ render video -- và chất kết dính chỉ là vài trăm dòng TypeScript. Không khối nào trong số này là mới. Điều làm nên pipeline chính là sự sắp xếp: tạo một kịch bản mạch lạc với quan hệ nhân vật thực sự, chuyển thành audio biểu cảm với các khoảng nghỉ tự nhiên, đồng bộ render hình ảnh với năng lượng của audio đó theo từng khung hình, và tự động hóa toàn bộ chuỗi cho đến khi đăng tải.

---

**Tài nguyên**

- **Repo**: [github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **Kênh**: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**3 điểm chính**

1. Kịch bản được sinh bởi LLM (Groq/Llama 3.3) với persona và quan hệ riêng cho từng đặc vụ, không phải danh sách truyện cười viết sẵn.
2. Zoom vòng tròn đặc vụ được điều khiển bởi biểu thức FFmpeg tính toán từng khung hình từ đường bao RMS của WAV -- không phải animation keyframe cổ điển.
3. Toàn bộ chuỗi, từ prompt đến bài đăng YouTube/Instagram, chạy qua một cron job duy nhất không cần can thiệp của con người.
