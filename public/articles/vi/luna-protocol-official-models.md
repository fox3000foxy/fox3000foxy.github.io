---
title: "Luna Protocol: Tại sao tôi fine-tune mô hình 1.5B trên 50k mẫu Discord và biến few-shot priming thành vũ khí bí mật"
description: "Một mô hình nhỏ hơn được huấn luyện trên ít dữ liệu hơn có thể vượt trội hơn mô hình lớn hơn -- nếu bạn biết cách priming nó. Đây là lý do Luna Protocol chuyển từ Hermes 3B sang fine-tune Qwen 1.5B, và tại sao few-shot priming trở thành yếu tố thay đổi cuộc chơi thực sự."
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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "ME9FNL53TIMsMjGEOyojVNlZdSPHF0sGPD69aGgmbN0AM4dM9YSDTCFpbkpiPmtvmbckjnM2cwguW+OTTpbYLg=="
---

# Luna Protocol: Tại sao tôi fine-tune mô hình 1.5B trên 50k mẫu Discord và biến few-shot priming thành vũ khí bí mật

Trong [bài viết đầu tiên](/articles/en/luna-protocol-discord-bot), tôi đã xây dựng một bot Discord mô phỏng hành vi con người -- ngủ, gõ sai, ngập ngừng, hay quên, tin nhắn tự phát. Hệ thống hành vi rất vững chắc. LLM đằng sau nó là mô hình Hermes 3B, được lượng tử hóa ở mức Q8_0, ngốn 3GB VRAM.

Nó hoạt động. Nhưng nó là quá mức cần thiết.

Một bot Discord không cần mô hình 3B tham số để nói "nm just chillin, u". Thứ nó cần là **sự nhất quán về phong cách** -- khả năng duy trì một giọng điệu hội thoại cụ thể, hết tin nhắn này đến tin nhắn khác, mà không trôi vào chế độ trợ lý công ty. Và hóa ra, một mô hình nhỏ hơn được huấn luyện trên ít dữ liệu hơn, được priming với vài ví dụ, làm điều đó tốt hơn một mô hình lớn hơn cố gắng ép bằng system prompt.

Bài viết này nói về các mô hình chính thức của Luna Protocol: tại sao chúng tồn tại, tại sao là 1.5B thay vì 3B, tại sao 50k mẫu huấn luyện thay vì 7.3M, và tại sao few-shot priming đi từ một tính năng tốt-để-có thành cốt lõi của toàn bộ cách tiếp cận.

---

## Vấn đề với mô hình 3B

Thiết lập ban đầu sử dụng `Discord-Micae-Hermes-3-3B.Q8_0.gguf` -- mô hình 3B tham số được fine-tune trên dữ liệu Discord. Nó tạo ra các phản hồi tốt, nhưng:

| Chỉ số | Hermes-3-3B Q8_0 | Mục tiêu |
|--------|-------------------|--------|
| Sử dụng VRAM | ~3 GB | < 1 GB |
| Sinh token | ~30 tok/s | ~60+ tok/s |
| Kích thước tệp mô hình | ~3.2 GB | < 1 GB |
| Thời gian khởi động nguội | ~8s | ~3s |

Đối với một bot chạy 24/7 trên một máy chủ khiêm tốn, 3GB VRAM là rất nhiều. Và tốc độ sinh -- dù ổn cho các tin nhắn không thường xuyên -- cảm thấy chậm chạp trong các phản hồi bùng nổ hoặc khi nhiều kênh hoạt động cùng lúc.

Câu hỏi là: liệu chúng ta có thể đạt được cùng phong cách Discord-Dialogues với một nửa số tham số không?

---

## Quyết định fine-tune: tại sao 50k, không phải 7.3M

Bộ dữ liệu [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) chứa **7.3M lượt trao đổi** và **17M lượt tương tác**. Đó là một kho ngữ liệu khổng lồ các cuộc hội thoại Discord thực tế. Cách tiếp cận hiển nhiên là huấn luyện trên toàn bộ bộ dữ liệu.

Tôi đã làm ngược lại. Tôi huấn luyện trên **50.000 mẫu** -- ít hơn 1% dữ liệu có sẵn.

Đây là lý do: **kích thước của tập huấn luyện ảnh hưởng trực tiếp đến mức độ mô hình overfit vào phân phối huấn luyện của nó**.

Một mô hình được huấn luyện trên 7.3M ví dụ học một phân phối thống kê rất cụ thể của các cuộc hội thoại. Nó trở nên xuất sắc trong việc tái tạo phân phối đó, nhưng nó cũng trở nên **cứng nhắc** -- nó có ít linh hoạt hơn để thích ứng với các mẫu mới được cung cấp tại thời điểm suy luận.

Một mô hình được huấn luyện trên 50k ví dụ học được giọng điệu và thanh điệu chung của các cuộc hội thoại Discord (không trang trọng, dạng ngắn, viết tắt, chữ thường), nhưng nó giữ đủ linh hoạt để được **dẫn dắt bởi các ví dụ trong ngữ cảnh**. Các ví dụ few-shot không chống lại một phân phối đã học khổng lồ -- chúng bổ sung cho một phân phối nhẹ hơn.

Đây là hiểu biết cốt lõi: **dữ liệu huấn luyện hạn chế làm cho few-shot priming hiệu quả hơn**.

---

## Mô hình: chi tiết kỹ thuật

Mô hình Luna Protocol là một **fine-tune QLoRA** của [Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct):

| Tham số | Giá trị |
|-----------|-------|
| Mô hình cơ sở | `unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit` |
| Phương pháp | QLoRA (4-bit) |
| Hạng LoRA | `r=16`, `lora_alpha=16` |
| Mô-đun mục tiêu | `q/k/v/o_proj`, `gate/up/down_proj` |
| Tham số có thể huấn luyện | 18.464.768 / 1.562.179.072 (1,18%) |
| Dữ liệu huấn luyện | ~50.000 ví dụ (tập con của Discord-Dialogues) |
| Bộ lọc | 8-512 token mỗi mẫu |
| Số epoch | 2-3 |
| Phần cứng | Kaggle T4 |
| Framework | [Unsloth](https://github.com/unslothai/unsloth) |

Bộ dữ liệu là một fork đã được tiền xử lý của Discord-Dialogues, được lọc để chỉ chứa các lượt `user`/`assistant` sạch -- không có tin nhắn hệ thống, không có siêu dữ liệu, không có lệnh bot. Điều này quan trọng về sau.

### Các lượng tử hóa có sẵn

| Tệp | Lượng tử hóa | Kích thước | Ghi chú |
|------|-------------|------|-------|
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q2_K.gguf` | Q2_K | 676 MB | Suy giảm đáng kể -- không khuyến nghị |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf` | Q4_K_M | 986 MB | Cân bằng tốt giữa kích thước/chất lượng (khuyến nghị) |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q8_0.gguf` | Q8_0 | 1,65 GB | Độ trung thực phong cách tốt nhất |

Mô hình được khuyến nghị là **Q4_K_M** -- dưới 1GB, nhanh, và giữ phong cách hội thoại tốt. Q2_K suy giảm quá nhiều trên một mô hình nhỏ như vậy. Q8_0 là chất lượng tốt nhất nhưng sử dụng nhiều hơn 68% bộ nhớ.

---

## Bước đột phá về few-shot priming

Đây là phần đã thay đổi mọi thứ.

Thẻ mô hình HuggingFace có một cảnh báo:

> Với một prompt trần và không có priming, mô hình này có xu hướng quay lại giọng trợ lý mặc định của Qwen. Một vài ví dụ few-shot ngắn tạo ra sự khác biệt lớn.

Đây không phải là lỗi -- đó là hậu quả trực tiếp của cách dữ liệu huấn luyện được cấu trúc.

### Tại sao system prompt một mình không hiệu quả

Dữ liệu huấn luyện Discord-Dialogues chỉ chứa các lượt `user`/`assistant`. **Không có ví dụ nào về vai trò hệ thống** trong tập huấn luyện. Mô hình chưa bao giờ được huấn luyện để làm theo system prompt như các chỉ thị về phong cách.

Khi bạn đưa cho nó một system prompt như "Tên bạn là Luna, hãy nói chuyện thoải mái", nó nghe được chỉ dẫn nhưng không có một mẫu học mạnh để chuyển điều đó thành đầu ra. Nó quay về mặc định của Qwen: hữu ích, có cấu trúc, hơi trang trọng.

### Tại sao ví dụ few-shot hiệu quả

Khi bạn đưa vào các ví dụ hội thoại cùng định dạng ChatML mà mô hình được huấn luyện (sử dụng cấu trúc lượt `user`/`assistant`), một điều xảy ra. Mô hình nhận ra mẫu từ dữ liệu huấn luyện của nó và điều chỉnh đầu ra để phù hợp.

Đây là những gì một few-shot prime trông như thế nào trong thực tế:

```yaml
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

Những ví dụ này được đưa vào sau system prompt và trước cuộc hội thoại thực tế. Mô hình xem chúng như một phần của lịch sử hội thoại, không phải như chỉ dẫn. Đây là một sự khác biệt quan trọng -- nó không bị *bảo* phải thoải mái, nó được *cho thấy* thoải mái trông như thế nào.

### Trước và sau

Không có few-shot priming (system prompt trần):

```
User: yo whats good
Bot: Hello! I am doing well, thank you for asking. How can I assist you today?
```

Với few-shot priming (3 ví dụ):

```
User: yo whats good
Bot: nm just chillin, u
```

Sự khác biệt rất rõ rệt. Mô hình không chỉ tạo ra các từ khác nhau -- nó áp dụng toàn bộ thanh điệu: chữ thường, viết tắt, giọng thoải mái, câu trả lời ngắn. Nó khớp với phong cách của các ví dụ, không phải phong cách của dữ liệu huấn luyện Qwen.

---

## Bộ nhớ và tốc độ: những con số cụ thể

Sự chuyển đổi từ Hermes-3-3B sang Luna-Protocol-1.5B mang lại những cải thiện có thể đo lường:

| Chỉ số | Hermes-3-3B Q8_0 | Luna-Protocol Q4_K_M | Cải thiện |
|--------|-------------------|----------------------|-------------|
| Sử dụng VRAM | ~3 GB | ~986 MB | **ít hơn 67%** |
| Kích thước tệp mô hình | ~3.2 GB | ~986 MB | **nhỏ hơn 69%** |
| Sinh token | ~30 tok/s | ~60+ tok/s | **nhanh gấp 2x** |
| Khởi động nguội | ~8s | ~3s | **nhanh hơn 62%** |
| Cửa sổ ngữ cảnh | 8192 | 8192 | Giống nhau |

### Tại sao tốc độ tăng là thật

Các mô hình nhỏ hơn không chỉ "ít chậm hơn" -- chúng về cơ bản nhanh hơn cho suy luận. Với 1.5B tham số thay vì 3B:

- **Ít phép nhân ma trận hơn** mỗi token: các layer attention, layer FFN, và projection đầu ra đều tỷ lệ tuyến tính với số lượng tham số
- **Tận dụng bộ nhớ đệm tốt hơn**: mô hình nhỏ hơn khớp nhiều trọng số hơn trong bộ nhớ đệm L2/L3
- **Áp lực băng thông bộ nhớ thấp hơn**: ít byte hơn phải đọc từ VRAM mỗi token

Trên một thiết lập khiêm tốn chỉ có CPU (2 lõi, không GPU), mô hình 1.5B tạo token với tốc độ gấp khoảng **2 lần** so với mô hình 3B. Đây là sự khác biệt giữa "cảm giác như bot" và "cảm giác như người thật đang gõ".

### Bộ nhớ đệm prompt khuếch đại lợi thế

Luna Protocol sử dụng `llama-server` với bộ nhớ đệm prompt được bật (`--cache-reuse 256`). Điều này có nghĩa:

1. Tin nhắn đầu tiên trong một phiên chịu toàn bộ chi phí xử lý prompt (system prompt + ví dụ few-shot + tin nhắn người dùng)
2. Các tin nhắn tiếp theo chỉ xử lý các token *mới* -- tiền tố được lưu trong bộ nhớ đệm được tái sử dụng
3. Với 5 ví dụ few-shot (~50-150 token), chi phí là không đáng kể sau yêu cầu đầu tiên

Các ví dụ few-shot thực chất là "miễn phí" sau tin nhắn đầu tiên trong một phiên. Mô hình nhận được hướng dẫn phong cách với chi phí biên bằng không.

---

## Triển khai: cách nó hoạt động trong code

Hệ thống few-shot trong Luna Protocol sạch sẽ và tối giản. Ba tệp xử lý mọi thứ:

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

Cấu hình có thể tải lại nóng. Thay đổi các ví dụ, lưu lại, và bot áp dụng phong cách mới ngay lập tức -- không cần khởi động lại.

### 2. Định dạng và tiêm (`src/core/few-shot.ts`)

Hàm `formatFewShotExamples()` chuyển đổi các ví dụ YAML thành các đối tượng tin nhắn ChatML:

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

Hàm `injectFewShotIntoConversation()` đặt chúng ngay sau system prompt:

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

Trước mỗi lần gọi LLM, các ví dụ few-shot được tiêm vào nếu được bật:

```typescript
let finalMessages = messages;
if (FEW_SHOT_ENABLED && FEW_SHOT_EXAMPLES.length > 0) {
  const fewShotMessages = formatFewShotExamples(FEW_SHOT_EXAMPLES);
  finalMessages = injectFewShotIntoConversation(messages, fewShotMessages);
}
```

Mô hình nhận được: `[system_prompt] + [few_shot_examples] + [conversation_history]`

---

## Giữ phong cách Discord-Dialogues

Bộ dữ liệu Discord-Dialogues gốc có một dấu ấn hội thoại rất cụ thể:

- **Tin nhắn ngắn**: trung bình 32,8 token mỗi lượt
- **Thanh điệu không trang trọng**: viết tắt, chữ thường, không dấu câu
- **Trao đổi nhanh**: nhiều trao đổi ngắn thay vì độc thoại dài
- **Không hoàn hảo tự nhiên**: lỗi gõ, "lol", "fr", "ngl", "tbh"

Mô hình Luna-Protocol giữ phong cách này thông qua hai cơ chế:

### 1. Fine-tuning dịch chuyển phân phối cơ sở

50k mẫu huấn luyện dạy mô hình **dấu vân tay thống kê** của các cuộc hội thoại Discord. Nó học rằng các phản hồi thường ngắn, chữ thường và không trang trọng. Điều này dịch chuyển đầu ra mặc định của mô hình ra khỏi chế độ trợ lý hữu ích của Qwen.

### 2. Few-shot priming khóa nó lại

Các ví dụ few-shot củng cố chính xác các mẫu mà mô hình đã học trong quá trình fine-tune. Chúng hoạt động như một **neo phong cách** -- ngay cả khi mô hình hơi trôi về giọng trang trọng trong một cuộc hội thoại dài, các ví dụ trong ngữ cảnh liên tục kéo nó trở lại.

Sự kết hợp mạnh mẽ hơn bất kỳ cơ chế nào một mình:
- Fine-tune không có few-shot: mô hình *nhìn chung* thoải mái nhưng không nhất quán
- Few-shot không có fine-tune: mô hình cố gắng làm theo ví dụ nhưng liên tục quay lại chế độ trợ lý
- Fine-tune + few-shot: mô hình **luôn nhất quán** trong tính cách

---

## Triết lý: mô hình nhỏ hơn, prompting thông minh hơn

Suy nghĩ thông thường trong triển khai LLM là "càng lớn càng tốt". Nhiều tham số hơn, nhiều dữ liệu huấn luyện hơn, nhiều VRAM hơn. Luna Protocol đi theo hướng ngược lại:

- **1.5B thay vì 3B**: một nửa tham số, một nửa bộ nhớ, gấp đôi tốc độ
- **50k mẫu thay vì 7.3M**: ít dữ liệu huấn luyện hơn, linh hoạt hơn cho học trong ngữ cảnh
- **Few-shot priming thay vì system prompt**: cho mô hình thấy bạn muốn gì, đừng chỉ nói với nó

Đây không chỉ là một tối ưu hóa kỹ thuật -- nó là một triết lý thiết kế. Một bot Discord không cần phải là một trợ lý đa năng. Nó cần nói "nm just chillin, u" một cách nhất quán, nhanh chóng, và không ngốn hết ngân sách VRAM của máy chủ bạn.

Kết quả: một bot chạy trên VPS 5$/tháng, tạo token đủ nhanh để cảm giác như gõ phím thời gian thực, và duy trì một tính cách nhất quán thông qua sự kết hợp của fine-tuning và few-shot priming lớn hơn tổng các phần của nó.

---

## Thiết lập

### Tải mô hình

```bash
npm run download-model
# Tải Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf
```

Hoặc thủ công từ [HuggingFace](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues).

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
npm run dev                    # dev (tải lại nóng)
npm run build && npm start     # production
./start.sh                     # PM2 (production với llama-server)
```

---

## Kết luận

Các mô hình Luna Protocol chứng minh rằng đối với AI hội thoại tập trung vào phong cách, **ít hơn là nhiều hơn**. Một mô hình 1.5B được huấn luyện trên 50k mẫu được chọn lọc kỹ lưỡng, được prime với vài ví dụ, vượt trội hơn mô hình 3B được huấn luyện trên hàng triệu ví dụ -- với một phần nhỏ chi phí bộ nhớ và gấp đôi tốc độ sinh.

Few-shot priming không chỉ là một tính năng tốt-để-có cho các mô hình nhỏ. Nó là cơ chế làm cho chúng khả thi cho các ứng dụng hội thoại thời gian thực. Các ví dụ không chỉ "giúp đỡ" -- chúng thay đổi cơ bản cách mô hình hoạt động, bằng cách khớp chính xác định dạng mà nó được huấn luyện.

Mã nguồn là mã nguồn mở, mô hình trên HuggingFace, và bộ dữ liệu công khai. Nếu bạn muốn xây dựng một bot hội thoại cảm giác như con người, công thức là: mô hình nhỏ, fine-tune hạn chế, few-shot priming mạnh.

| Tài nguyên | Liên kết |
|----------|------|
| Kho GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Mô hình (HuggingFace) | [fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) |
| Bộ dữ liệu | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Bài viết đầu tiên | [Luna Protocol: Tôi đã tạo một bot Discord tự động](/articles/en/luna-protocol-discord-bot) |
