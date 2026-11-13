---
title: "Luna Protocol : vì sao tôi fine-tune mô hình 1,5 tỷ tham số trên 50k mẫu Discord, và vì sao few-shot priming đổi tất cả"
description: "Mô hình nhỏ hơn huấn luyện trên ít dữ liệu hơn có thể vượt mô hình lớn hơn -- với điều kiện biết mồi nó đúng cách. Đây là lý do Luna Protocol chuyển từ Hermes 3B sang fine-tune Qwen 1,5B, và vì sao few-shot priming thành nhân tố tiến bộ thật sự."
date: 2026-07-17
authors:
  - fox3000foxy
tags:
  - discord
  - llm
  - fine-tuning
  - few-shot-learning
  - qwen
  - unsloth
  - open-source
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "lDxqpCRHTUAvF+t6yT99UJR8/H8AjHN27CogM+WiNGjBYG/gOWNoeeoCUayFsmrvBrYEtxag+xwnQyYTkUZDzg=="
---

# Luna Protocol : vì sao tôi fine-tune mô hình 1,5 tỷ tham số trên 50k mẫu Discord, và vì sao few-shot priming đổi tất cả

Trong [bài đầu](/articles/en/luna-protocol-discord-bot), tôi đã xây bot Discord mô phỏng con người : giấc ngủ, lỗi gõ phím, ngập ngừng, quên lãng, tin nhắn tự phát. Hệ thống hành vi chạy tốt. LLM đằng sau tất cả là mô hình Hermes 3 tỷ tham số, lượng tử Q8_0, ngốn 3 Go VRAM.

Nó chạy. Nhưng quá khổ.

Bot Discord không cần mô hình 3 tỷ tham số để nói « nm just chillin, u ». Điều nó cần là **nhất quán phong cách** : khả năng giữ đúng giọng trò chuyện, tin này qua tin khác, không trôi sang chế độ « trợ lý corporate ». Và hóa ra mô hình nhỏ hơn, huấn luyện trên ít dữ liệu hơn và mồi bằng vài ví dụ, làm điều đó tốt hơn mô hình lớn hơn ép đường qua prompt hệ thống đơn thuần.

Bài này nói về các mô hình chính thức của Luna Protocol : vì sao chúng tồn tại, vì sao 1,5B thay vì 3B, vì sao 50k mẫu huấn luyện thay vì 7,3M, và vì sao few-shot priming đi từ « bonus hay » thành lõi của toàn bộ cách tiếp cận.

---

## Vấn đề với mô hình 3B

Cấu hình gốc dùng `Discord-Micae-Hermes-3-3B.Q8_0.gguf`, mô hình 3 tỷ tham số fine-tune trên dữ liệu Discord. Nó cho phản hồi tốt, nhưng :

| Chỉ số | Hermes-3-3B Q8_0 | Mục tiêu |
|--------|-------------------|--------|
| Dùng VRAM | ~3 Go | < 1 Go |
| Sinh token | ~30 tok/s | ~60+ tok/s |
| Kích thước tệp mô hình | ~3,2 Go | < 1 Go |
| Khởi động lạnh | ~8s | ~3s |

Với bot chạy 24/7 trên máy chủ khiêm tốn, 3 Go VRAM là nhiều. Và tốc độ sinh, ổn cho tin nhắn thỉnh thoảng, thấy ì ạch khi trả lời chùm hay nhiều kênh hoạt động.

Câu hỏi là : có thể đạt cùng phong cách Discord-Dialogues với một nửa tham số?

---

## Quyết định fine-tuning : vì sao 50k, không phải 7,3M

Bộ dữ liệu [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) chứa **7,3M lượt trao đổi** và **17M lượt nói**. Đó là kho hội thoại Discord thật khổng lồ. Cách hiển nhiên là huấn luyện trên toàn bộ dataset.

Tôi làm ngược lại. Tôi huấn luyện trên **50 000 mẫu**, tức dưới 1% dữ liệu có sẵn.

Đây là lý do : **kích thước tập huấn luyện ảnh hưởng trực tiếp mức độ quá khớp của mô hình với phân bố huấn luyện của nó**.

Mô hình huấn luyện trên 7,3M ví dụ học phân bố thống kê rất đặc thù của cuộc trò chuyện. Nó thành xuất sắc trong tái tạo phân bố đó, nhưng cũng thành **cứng** : ít dư địa thích ứng với mẫu mới đưa lúc suy luận.

Mô hình huấn luyện trên 50k ví dụ học giọng và thanh ghi chung của hội thoại Discord (thân mật, ngắn, viết tắt, chữ thường), nhưng giữ đủ linh hoạt để được **dẫn dắt bằng ví dụ trong ngữ cảnh**. Các ví dụ few-shot không phải chống lại phân bố khổng lồ đã học : chúng bổ sung cho phân bố nhẹ hơn.

Đó là trực giác trung tâm : **dữ liệu huấn luyện hạn chế khiến few-shot priming hiệu quả hơn**.

---

## Mô hình : chi tiết kỹ thuật

Mô hình Luna Protocol là **fine-tune QLoRA** của [Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct) :

| Tham số | Giá trị |
|-----------|-------|
| Mô hình nền | `unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit` |
| Phương pháp | QLoRA (4-bit) |
| Hạng LoRA | `r=16`, `lora_alpha=16` |
| Module nhắm | `q/k/v/o_proj`, `gate/up/down_proj` |
| Tham số huấn luyện được | 18 464 768 / 1 562 179 072 (1,18 %) |
| Dữ liệu huấn luyện | ~50 000 ví dụ (tập con của Discord-Dialogues) |
| Lọc | 8-512 token cho mỗi mẫu |
| Epoch | 2-3 |
| Phần cứng | Kaggle T4 |
| Framework | [Unsloth](https://github.com/unslothai/unsloth) |

Dataset là fork tiền xử lý của Discord-Dialogues, lọc chỉ giữ lượt `user`/`assistant` sạch : chỉ trao đổi người dùng và trợ lý, không tin nhắn hệ thống, metadata hay lệnh bot. Điều này quan trọng cho phần sau.

### Lượng tử có sẵn

| Tệp | Lượng tử | Kích thước | Ghi chú |
|------|-------------|------|-------|
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q2_K.gguf` | Q2_K | 676 Mo | Xuống cấp rõ -- không khuyên |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf` | Q4_K_M | 986 Mo | Cân bằng tốt kích thước/chất lượng (khuyên dùng) |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q8_0.gguf` | Q8_0 | 1,65 Go | Trung thực phong cách tốt nhất |

Mô hình khuyên dùng là **Q4_K_M** : dưới 1 Go, nhanh, và giữ tốt phong cách trò chuyện. Q2_K xuống cấp quá nhiều với mô hình cỡ này. Q8_0 cho chất lượng tốt nhất nhưng ngốn thêm 68% bộ nhớ.

---

## Đột phá few-shot priming

Đây là phần đổi tất cả.

Thẻ mô hình trên HuggingFace có cảnh báo :

> Với prompt trần và không mồi, mô hình này có xu hướng rớt về giọng mặc định « trợ lý » của Qwen. Mồi few-shot ngắn tạo khác biệt lớn.

Đó là hậu quả trực tiếp của cách dữ liệu huấn luyện được cấu trúc.

### Vì sao chỉ prompt hệ thống không chạy

Dữ liệu huấn luyện Discord-Dialogues chỉ chứa lượt `user`/`assistant`. Không có **ví dụ vai hệ thống** nào trong tập huấn luyện. Mô hình chưa bao giờ được huấn luyện để theo prompt hệ thống như chỉ dẫn phong cách.

Khi ta đưa prompt hệ thống kiểu « Bạn tên Luna, nói thoải mái », nó nghe chỉ dẫn nhưng không có mẫu đã học vững để dịch thành đầu ra. Nó bèn rớt về hành vi mặc định của Qwen : giúp ích, có cấu trúc, hơi trang trọng.

### Vì sao ví dụ few-shot chạy

Khi ta bơm ví dụ hội thoại đúng định dạng ChatML dùng lúc huấn luyện (với cấu trúc lượt `user`/`assistant`), điều gì đó kích hoạt. Mô hình nhận ra mẫu từ huấn luyện và căn đầu ra theo.

Đây là dáng mồi few-shot trong thực hành :

```yaml
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

Các ví dụ này được bơm sau prompt hệ thống và trước cuộc trò chuyện thật. Mô hình cảm nhận chúng như phần của lịch sử trò chuyện, nên như trao đổi thật thay vì chỉ dẫn. Đó là khác biệt cốt yếu : ta *cho nó thấy* giọng thoải mái trông thế nào thay vì *ra lệnh* cho nó.

### Trước / sau

Không mồi few-shot (prompt hệ thống trần) :

```
User: yo whats good
Bot: Hello! I am doing well, thank you for asking. How can I assist you today?
```

Có mồi few-shot (3 ví dụ) :

```
User: yo whats good
Bot: nm just chillin, u
```

Khác biệt rõ rệt. Mô hình nhận toàn bộ thanh ghi : chữ thường, viết tắt, giọng thoải mái, phản hồi ngắn. Nó chép phong cách của ví dụ thay vì phong cách của dữ liệu huấn luyện Qwen.

---

## Bộ nhớ và tốc độ : con số cụ thể

Chuyển từ Hermes-3-3B sang Luna-Protocol-1.5B mang lại lợi ích đo được :

| Chỉ số | Hermes-3-3B Q8_0 | Luna-Protocol Q4_K_M | Cải thiện |
|--------|-------------------|----------------------|-------------|
| Dùng VRAM | ~3 Go | ~986 Mo | **ít hơn 67 %** |
| Kích thước tệp mô hình | ~3,2 Go | ~986 Mo | **nhỏ hơn 69 %** |
| Sinh token | ~30 tok/s | ~60+ tok/s | **nhanh gấp 2** |
| Khởi động lạnh | ~8s | ~3s | **nhanh hơn 62 %** |
| Cửa sổ ngữ cảnh | 8192 | 8192 | Giống hệt |

### Vì sao lợi tốc độ là thật

Mô hình nhỏ hơn về cơ bản nhanh hơn lúc suy luận. Với 1,5B tham số thay vì 3B :

- **Ít phép nhân ma trận hơn** cho mỗi token : lớp attention, lớp FFN và chiếu đầu ra đều co tuyến tính theo số tham số
- **Dùng cache tốt hơn** : mô hình nhỏ hơn nhét được nhiều trọng số hơn vào cache L2/L3
- **Ít áp lực băng thông bộ nhớ** : ít byte đọc từ VRAM hơn cho mỗi token

Trên cấu hình khiêm tốn, chỉ CPU (2 lõi, không GPU), mô hình 1,5B sinh token với tốc độ khoảng **gấp 2** mô hình 3B. Đó là khác biệt giữa « mùi bot » và « như người thật đang gõ ».

### Cache prompt khuếch đại lợi thế

Luna Protocol dùng `llama-server` với cache prompt bật (`--cache-reuse 256`). Nghĩa là :

1. Tin nhắn đầu của phiên trả đủ chi phí xử lý prompt (prompt hệ thống + ví dụ few-shot + tin nhắn người dùng)
2. Các tin nhắn sau chỉ xử lý token *mới*, vì tiền tố cache được tái dùng
3. Với 5 ví dụ few-shot (~50-150 token), chi phí thêm thành không đáng kể sau yêu cầu đầu

Các ví dụ few-shot thực tế thành « miễn phí » sau tin nhắn đầu của phiên. Mô hình hưởng dẫn dắt phong cách với chi phí biên bằng không.

---

## Triển khai : nó chạy thế nào trong mã

Hệ thống few-shot của Luna Protocol sạch và tối thiểu. Ba tệp quản lý tất cả.

### 1. Cấu hình (`config.yml`)

```yaml
few_shot_enabled: true
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
  - user: "whats up"
    assistant: "yooo not much, what about you"
  - user: "how was your day"
    assistant: "it was alright, nothing crazy happened lol"
```

Cấu hình tải nóng được. Ta sửa ví dụ, lưu, và bot nhận ngay phong cách mới, không khởi động lại.

### 2. Định dạng và bơm (`src/core/few-shot.ts`)

Hàm `formatFewShotExamples()` đổi ví dụ YAML thành object tin nhắn ChatML :

```typescript
export function formatFewShotExamples(
  examples: FewShotExample[],
  username = "user"
): Array<{ role: "user" | "assistant"; content: string }> {
  const messages = [];
  for (const example of examples) {
    messages.push({ role: "user", content: `${username}: ${example.user}` });
    messages.push({ role: "assistant", content: example.assistant });
  }
  return messages;
}
```

Hàm `injectFewShotIntoConversation()` đặt chúng ngay sau prompt hệ thống :

```typescript
export function injectFewShotIntoConversation(
  messages: Message[],
  fewShotMessages: Message[]
): Message[] {
  const systemMessage = messages[0];
  const userMessages = messages.slice(1);
  return [systemMessage, ...fewShotMessages, ...userMessages];
}
```

### 3. Tích hợp (`src/core/llm-client.ts`)

Trước mỗi gọi tới LLM, ví dụ few-shot được bơm nếu bật :

```typescript
let finalMessages = messages;
if (FEW_SHOT_ENABLED && FEW_SHOT_EXAMPLES.length > 0) {
  const fewShotMessages = formatFewShotExamples(FEW_SHOT_EXAMPLES);
  finalMessages = injectFewShotIntoConversation(messages, fewShotMessages);
}
```

Mô hình nhận : `[prompt_hệ_thống] + [ví_dụ_few_shot] + [lịch_sử_trò_chuyện]`

---

## Giữ phong cách Discord-Dialogues

Dataset gốc Discord-Dialogues có chữ ký trò chuyện rất đặc thù :

- **Tin nhắn ngắn** : trung bình 32,8 token cho mỗi lượt
- **Thanh ghi thân mật** : viết tắt, chữ thường, thiếu chấm câu
- **Trao đổi nhanh** : nhiều lượt ngắn thay vì độc thoại dài
- **Không hoàn hảo tự nhiên** : lỗi gõ phím, « lol », « fr », « ngl », « tbh »

Mô hình Luna Protocol giữ phong cách này nhờ hai cơ chế :

### 1. Fine-tuning dịch chuyển phân bố nền

50k mẫu huấn luyện dạy mô hình **dấu vân thống kê** của hội thoại Discord. Nó học rằng phản hồi thường ngắn, chữ thường và thân mật. Việc này kéo đầu ra mặc định của mô hình ra khỏi chế độ « trợ lý giúp ích » của Qwen.

### 2. Few-shot priming khóa kết quả

Ví dụ few-shot củng cố đúng mẫu học lúc fine-tuning. Chúng đóng vai **neo phong cách** : ngay cả khi mô hình hơi trôi sang giọng trang trọng hơn trong cuộc trò chuyện dài, các ví dụ trong ngữ cảnh kéo nó lại.

Kết hợp mạnh hơn mỗi cơ chế riêng :
- Fine-tuning không few-shot : mô hình nhìn chung thoải mái nhưng thiếu nhất quán
- Few-shot không fine-tuning : mô hình cố theo ví dụ nhưng cứ rớt về chế độ trợ lý
- Fine-tuning + few-shot : mô hình giữ **liên tục** trong vai

---

## Triết lý : mô hình nhỏ hơn, prompting khôn hơn

Sự khôn ngoan thông thường trong triển khai LLM nói « càng lớn càng tốt ». Nhiều tham số hơn, nhiều dữ liệu huấn luyện hơn, nhiều VRAM hơn. Luna Protocol đi đường ngược :

- **1,5B thay vì 3B** : một nửa tham số, một nửa bộ nhớ, nhanh gấp đôi
- **50k mẫu thay vì 7,3M** : ít dữ liệu huấn luyện hơn, nhiều linh hoạt hơn cho học trong ngữ cảnh
- **Few-shot priming thay vì prompt hệ thống** : cho mô hình thấy điều ta muốn, không chỉ bảo nó

Đó là lựa chọn thiết kế có chủ ý, hơn nhiều tối ưu kỹ thuật đơn thuần. Bot Discord cần giữ là bạn trò chuyện nhẹ thay vì trợ lý tổng quát. Nó phải nói « nm just chillin, u » nhất quán, nhanh, và không nuốt hết ngân sách VRAM của máy chủ.

Kết quả : bot chạy trên VPS 5 $/tháng, sinh token đủ nhanh để tạo cảm giác gõ thời gian thực, và giữ cá tính nhất quán nhờ kết hợp fine-tuning và few-shot priming đáng giá hơn tổng các phần.

---

## Cài đặt

### Tải mô hình

```bash
npm run download-model
# Tải Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf
```

Hay thủ công từ [HuggingFace](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues).

### Cấu hình

```yaml
# config.yml
llama_model_path: "./models/Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf"
few_shot_enabled: true
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

### Chạy

```bash
npm run dev                    # dev (tải nóng lại)
npm run build && npm start     # production
./start.sh                     # PM2 (production với llama-server)
```

---

## Kết luận

Các mô hình Luna Protocol chứng minh rằng với AI trò chuyện thiên về phong cách, **ít hơn là tốt hơn**. Mô hình 1,5B huấn luyện trên 50k mẫu chọn kỹ, mồi bằng vài ví dụ, vượt mô hình 3B huấn luyện trên hàng triệu ví dụ, với một phần chi phí bộ nhớ và tốc độ sinh nhanh gấp đôi.

Few-shot priming là cơ chế trung tâm cho mô hình nhỏ. Chính nó khiến chúng khả thi cho ứng dụng trò chuyện thời gian thực. Các ví dụ làm hơn nhiều « giúp đỡ » : chúng thay đổi về nền hành vi mô hình, bằng cách chép đúng định dạng nó được huấn luyện.

Mã open source, mô hình trên HuggingFace, và dataset công khai. Nếu bạn muốn xây bot trò chuyện tạo cảm giác con người, công thức là : mô hình nhỏ, fine-tuning hạn chế, mồi few-shot chắc.

| Tài nguyên | Link |
|----------|------|
| Repo GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Mô hình (HuggingFace) | [fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Bài đầu | [Luna Protocol : tôi đã tạo bot Discord tự chủ](/articles/en/luna-protocol-discord-bot) |
