---
title: "Luna Protocol : dùng chung não, phân loại cảm xúc, và định tuyến phù phiếm/thú vị"
description: "Luna Protocol đã đi từ monolith tới kiến trúc bốn lớp : adapter, brain, bộ phân loại cảm xúc, và inference. Với centroid embedding, định tuyến phù phiếm/thú vị, và chỉnh tham số LLM theo valence và arousal."
date: 2026-07-27
tags:
  - discord
  - matrix
  - llm
  - architecture
  - embeddings
  - centroids
  - emotion-ai
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "dgHkhfYW0Px3o6kaojL05TS3Hk923KGhl42Wg8gK7ntCUii8c+pj2GakAPWoOGT+kPQrwkf7H5Dsvc9iKh901w=="
---

# Luna Protocol : dùng chung não, phân loại cảm xúc, và định tuyến phù phiếm/thú vị

Trong [hai](/articles/fr/luna-protocol-discord-bot) [bài](/articles/fr/luna-protocol-official-models) trước, tôi đã giới thiệu Luna Protocol như bot Discord duy nhất với hệ thống hành vi phức tạp và mô hình fine-tune. Nhưng kiến trúc từ đó đã tiến hóa nhiều. Thứ từng là monolith : một tiến trình Node.js duy nhất vừa quản lý bot Discord, hành vi, vừa gọi LLM, đã biến thành **bốn lớp độc lập**, mỗi lớp có trách nhiệm, ngôn ngữ, và vòng đời riêng.

Tách ra mang lại lợi ích bất ngờ : dùng chung "bộ não" giữa nhiều nền tảng, hệ thống phân loại cảm xúc điều chỉnh động tham số LLM, và định tuyến thông minh tin nhắn giữa hai mô hình theo tầm quan trọng cảm nhận của cuộc trò chuyện.

Tiến hóa không diễn ra một lúc : nó theo đường hữu cơ. Tôi đầu tiên tách thư mục `server/` khỏi repo bot, tạo ra **Krystal** một bên và để lại **Jade** làm adapter Discord. Rồi tôi tạo **Pixieglow** (adapter Matrix) bằng cách lấy lại `llm-core` và bus sự kiện của Jade. Tiếp đó tới **Sapphire** để đưa phân loại GENERIC/SEMANTIC bằng DistilBERT. Kết quả không thuyết phục, nên tôi chuyển qua centroid embedding, dễ tạo giàu ví dụ và chính xác hơn ; phân loại thành FUTILE/INTERESSANT. Cuối cùng tôi thêm centroid **valence** và **arousal** để điều tiết temperature và repeat penalty của LLM. Để kết, tôi gỡ mọi mã dư thừa giữa Jade và Pixieglow bằng cách tạo **Emerald**, bộ não dùng chung, biến Jade và Pixieglow thành client socket-driven đơn thuần.

Song song, tôi duy trì website ghi lại tiến độ dự án : [protocol-luna.github.io](https://protocol-luna.github.io/).

Bài này kể cách và vì sao tôi cắt các lớp, mỗi service làm chính xác gì, và cách các khái niệm như **centroid** (vector trung bình embedding) và **biến oán giận** (lấy cảm hứng từ chatbot PARRY thập niên 70) đã biến bot Discord đơn thuần thành hệ thống đa nền tảng nhất quán đáng ngạc nhiên.

---

## Vấn đề với monolith

Ban đầu, Luna Protocol nằm gọn trong một tiến trình Node.js. Mã quản lý :

- Kết nối tới Discord (qua thư viện Eris)
- Đánh giá kích hoạt (mention, keyword, follow-up...)
- Mô phỏng hành vi con người (lỗi gõ phím, ngập ngừng, giấc ngủ...)
- Gọi HTTP tới máy chủ LLM cục bộ (llama.cpp)
- Quản lý phiên và chống spam
- Pipeline TTS

Mọi thứ cùng một tiến trình, giao tiếp qua bus sự kiện có kiểu (`TypedBus`). Nó chạy, nhưng có giới hạn :

- **Không thể thêm client Matrix** mà không nhân đôi toàn bộ mã hành vi
- **LLM và bot cùng repo** : thư mục `server/` đã tồn tại, nhưng không thể tiến hóa bên này mà không đụng bên kia
- **Xử lý không phân biệt** : mỗi tin nhắn xử lý giống nhau, dù là "lol" hay câu hỏi hiện sinh
- **Mất trí cảm xúc** : bot không "cảm" gì

Cắt thành lớp giải quyết mọi vấn đề đó.

---

## Bốn lớp

Kiến trúc hiện tại của Luna Protocol tổ chức như phễu bốn tầng :

```
Matrix / Discord
      |
      v
  [ADAPTER]      Pixieglow (Matrix) / Jade (Discord)
      |
      v
  [BRAIN]        Emerald (WebSocket, cổng 3126)
      |
      v
  [BỘ PHÂN LOẠI] Sapphire (HTTP, cổng 3123)
      |
      v
  [INFERENCE]    Krystal (llama.cpp, cổng 3124 / 3125)
```

Mỗi lớp có thể khởi động lại, cập nhật, hay thay thế độc lập.

---

### Lớp 1 : adapter (Pixieglow và Jade)

Đây là các lớp đơn giản nhất. Việc duy nhất của chúng là dịch sự kiện của nền tảng nhắn tin thành giao thức chuẩn hóa về Emerald :

- **Jade** là adapter Discord. Nó dùng thư viện Eris để nối Discord và chuyển tiếp tin nhắn về Emerald qua WebSocket. Nó cũng quản lý pipeline TTS (tổng hợp giọng bằng Piper, đổi sang OGG, tải lên Discord).
- **Pixieglow** là adapter Matrix. Nó dùng trực tiếp API HTTP Client-Server của Matrix (không SDK), với long-poll sync. Nó không có TTS.

Cả hai adapter dùng chung giao thức WebSocket định nghĩa trong `emerald-client.ts` :

```typescript
type ClientId = "jade" | "pixieglow";

// Sự kiện (adapter -> Emerald)
type InEvent = MessageEvent | ReadyEvent | BotMessageEvent | PresenceEvent;

// Lệnh (Emerald -> adapter)
type OutCommand = RespondCommand | TypingCommand | SetPresenceCommand
                | SpontaneousCommand | ForgotCommand;
```

Việc hai adapter cùng interface chứng minh dùng chung : **cùng một "bộ não" (Emerald) phục vụ tùy ý bot Discord và bot Matrix**, với hành vi giống hệt. Giao thức mang tính khai báo : Emerald không bảo adapter *cách* gửi tin nhắn, nó bảo *gửi gì* (văn bản với độ trễ, có thể kèm kế hoạch burst, phản ứng, v.v.). Mỗi adapter triển khai thực thi cụ thể theo nền tảng của nó.

Đó là sức mạnh của kiến trúc này : để hỗ trợ Telegram, Signal, hay khác, chỉ cần viết adapter triển khai giao thức WebSocket.

---

### Lớp 2 : bộ não (Emerald)

Emerald là service quyết định trung tâm. Nó nghe trên cổng 3126 bằng WebSocket và quản lý :

- **Đánh giá kích hoạt** : mention, DM, tên, keyword, follow-up, ngẫu nhiên
- **Mô phỏng hành vi** : trễ tập trung, lỗi gõ phím, ngập ngừng, quên, burst, mệt mỏi chủ đề
- **Chu kỳ ngủ** : chế độ sleep / slow / short
- **Quản lý phiên** : cooldown, giới hạn phiên, chống spam
- **Định tuyến về Sapphire** : gửi tin nhắn, nhận phản hồi stream

Emerald là service trung tâm cho phép dùng chung, và là nơi hưởng lợi nhiều nhất từ tách ra. Trước đây, mỗi hành vi (typo, burst, hesitation) đan xen với mã Discord. Giờ đây, chúng nằm trong module chuyên trong `behavior/` :

```
emerald/src/behavior/
  burst.ts         -- Lập kế hoạch tin nhắn chùm
  mannerisms.ts    -- Trễ, ngập ngừng, phản ứng, quên
  sleep.ts         -- Đánh giá giờ ngủ
  typo.ts          -- Mô phỏng lỗi gõ phím (AZERTY/QWERTY)
```

Bộ não không biết mình chạy trên nền tảng nào. Nó nhận `MessageEvent` với `clientId` ("jade" hay "pixieglow"), quyết định, và trả về lệnh. Adapter lo phần còn lại.

---

### Lớp 3 : bộ phân loại cảm xúc (Sapphire)

Sapphire là service thú vị nhất về kỹ thuật. Đó là **middleware LLM** viết bằng Python với FastAPI, đóng bốn vai trò then chốt :

1. **Bộ phân loại nhị phân FUTILE / INTERESSANT** qua centroid embedding
2. **Chấm cảm xúc** (valence / arousal) qua centroid
3. **Bộ định tuyến backend** về Krystal (mô hình nhỏ so với mô hình lớn)
4. **Bộ bơm few-shot** và quản lý phiên

#### Centroid : lõi phân loại

**centroid** là khái niệm đơn giản : trung bình của một tập vector embedding. Cụ thể, tôi gom hàng trăm ví dụ tin nhắn, chạy chúng qua mô hình embedding (`BAAI/bge-small-en-v1.5`, 384 chiều), và lấy trung bình các vector thu được.

Có **hai centroid phân loại** :

- `futile_centroid` : ~683 tin nhắn tầm thường ("lol", "ok", "hello") qua k-means (k=10, seed=42)
- `interessant_centroid` : ~678 tin nhắn có chất (kỹ thuật, cá nhân, triết lý) qua k-means (k=10, seed=42)

Khi tin nhắn tới :

```python
def classify(text, embedder, futile_centroids, interessant_centroids):
    emb = embedder.query_embed(text)                     # vector 384-D
    sim_f = max(cos(emb, c) for c in futile_centroids)     # max trên 10
    sim_i = max(cos(emb, c) for c in interessant_centroids) # max trên 10
    diff = sim_i - sim_f
    label = "INTERESSANT" if diff > 0 else "FUTILE"
    return label, abs(diff), sim_f, sim_i
```

Điểm mỗi lớp là **tương đồng cosin tối đa** trong 10 centroid của nó. Việc này bắt được kiểu con trong mỗi danh mục : lời chào và lời tạm biệt đều rơi gần một trong 10 centroid phù phiếm dù chúng xa nhau trong không gian embedding. Chỉ k-means lúc khởi động và tích vô hướng lúc chạy : không huấn luyện, không GPU.

#### Vì sao hai mô hình?

Kết quả phân loại này quyết backend LLM nào được gọi :

| Nhãn | Backend Krystal | Mô hình | Cổng |
|-------|----------------|--------|------|
| `FUTILE` | `generic` | Luna-Protocol-1.5B (941 Mo, Q4_K_M) | 3124 |
| `INTERESSANT` | `semantic` | Hermes-3-3B hay 8B (tùy config) | 3125 |

Trực giác đơn giản : "lol" hay "nm just chillin u" không đáng gọi mô hình 8 tỷ tham số. Mô hình nhỏ Luna 1.5B fine-tune, huấn luyện trên 200 000 mẫu Discord, quá đủ cho trao đổi nhẹ. Ngược lại, câu hỏi về cuộc sống, tâm sự, hay tranh luận kỹ thuật được định tuyến tới mô hình lớn cho phản hồi giàu hơn.

Định tuyến kinh tế này giảm đáng kể tải trên máy chủ LLM : khoảng 70% tin nhắn xếp FUTILE và do mô hình nhỏ xử lý, nhường mô hình lớn cho cuộc trò chuyện thực sự xứng đáng.

#### Trục cảm xúc : valence và arousal

Nhưng chưa hết. Sapphire dùng **cùng cơ chế centroid** trên trục độc lập để đánh giá cảm xúc tin nhắn :

Có **bốn centroid cảm xúc** :

| Cực | Ví dụ |
|------|----------|
| `positive` | "hell yeah", "love that", "this is great" |
| `negative` | "shut up", "i hate this", "this sucks" |
| `high_arousal` | "WHAT THE HELL", "omg omg omg", "AAAAA" |
| `low_arousal` | "just chilling", "meh", "i guess" |

Điểm tính bằng hiệu tương đồng trên mỗi trục :

```python
valence = sim(emb, positive) - sim(emb, negative)     # [-1, +1]
arousal = sim(emb, high_arousal) - sim(emb, low_arousal)  # [-1, +1]
```

**Valence** đo tin nhắn tích cực hay tiêu cực. **Arousal** đo cường độ cảm xúc. Cùng nhau, chúng tạo mô hình circumplex của cảm xúc (Russell, 1980), cùng mô hình tâm lý đã truyền cảm hứng cho chatbot **PARRY** năm 1972.

#### Biến oán giận : cảm xúc điều khiển LLM thế nào

Đây là lúc cảm hứng PARRY thành hữu hình. PARRY (Kenneth Colby tạo năm 1972) là chatbot mô phỏng bệnh nhân hoang tưởng. Nó có biến nội tại (sợ, giận, ngờ) sửa đổi phản hồi. Ví dụ, PARRY "sợ hãi" trả lời hung hăng hơn.

Sapphire làm tương tự, nhưng với biến liên tục và phương pháp thanh lịch hơn : tham số lấy mẫu của LLM được chỉnh thời gian thực theo trạng thái cảm xúc của cuộc trò chuyện.

##### Temperature theo arousal

```python
temperature = clamp(0.7 + arousal * 0.3, 0.4, 1.0)
```

| Arousal | Temperature | Hiệu ứng |
|---------|-------------|-------|
| -1.0 (bình tĩnh) | 0.40 | Sáng tạo thấp, phản hồi đoán được |
| 0.0 (trung tính) | 0.70 | Sáng tạo mặc định |
| +1.0 (kích động) | 1.00 | Ngẫu nhiên tối đa, phản hồi bất ngờ |

Khi ai đó hào hứng hay bực (arousal cao), temperature tăng. Mô hình cho phản hồi đa dạng, sáng tạo hơn, đôi khi hỗn loạn hơn, như con người "cuốn theo". Khi cuộc trò chuyện bình tĩnh, temperature giảm, phản hồi điềm đạm hơn.

##### Repeat penalty theo valence

```python
repeat_penalty = clamp(1.15 - valence * 0.1, 1.0, 1.3)
```

| Valence | Repeat Penalty | Hiệu ứng |
|---------|---------------|-------|
| -1.0 (tiêu cực) | 1.25 | Phạt mạnh, tránh lặp lại |
| 0.0 (trung tính) | 1.15 | Giá trị mặc định |
| +1.0 (tích cực) | 1.05 | Phạt nhẹ, cho phép lặp lại |

Cuộc trò chuyện càng tiêu cực, mô hình càng bị đẩy tránh lặp lại, như người tìm lời trong tranh cãi căng. Cuộc trò chuyện càng tích cực, mô hình càng được khẳng định dư thừa, như trò chuyện thư giãn.

##### Trạng thái cảm xúc tích lũy

Các điểm này không chỉ mang tin nhắn tức thì. `EmotionState` duy trì **trung bình trượt lũy thừa** của valence và arousal cho mỗi phiên :

```python
class EmotionState:
    def __init__(self, decay=0.85, deadzone=0.06):
        self.decay = decay
        self.deadzone = deadzone

    def update(self, key, valence_delta, arousal_delta):
        if abs(valence_delta) < self.deadzone:
            valence_delta = 0.0
        if abs(arousal_delta) < self.deadzone:
            arousal_delta = 0.0
        s = self._state.setdefault(key, {"valence": 0.0, "arousal": 0.0})
        s["valence"] = s["valence"] * self.decay + valence_delta * (1 - self.decay)
        s["arousal"] = s["arousal"] * self.decay + arousal_delta * (1 - self.decay)
        return s
```

`decay` ở 0.85 nghĩa là 85% trạng thái trước được giữ mỗi tin nhắn, và 15% tín hiệu mới hòa vào. Việc này cho **trí nhớ cảm xúc** làm mượt biến động đột ngột : một tin nhắn tiêu cực đơn không khiến bot "buồn", nhưng chuỗi tin nhắn tiêu cực dần đẩy tâm trạng của nó.

Thực tế : nếu ai đó mở cuộc trò chuyện rất hào hứng (`arousal=+0.8`), temperature giữ cao nhiều lượt trao đổi, dù các tin nhắn sau bình tĩnh hơn. Cảm xúc mất thời gian hạ, như con người vẫn "nóng" sau tranh cãi.

---

### Lớp 4 : inference (Krystal)

Krystal là lớp thấp nhất : wrapper quanh `llama.cpp` phơi bày API tương thích OpenAI (`/v1/chat/completions`). Nó chạy trong hai instance PM2 :

- `krystal-small` : mô hình Luna 1.5B fine-tune, trên cổng 3124, với affinity CPU 0
- `krystal-large` : mô hình Hermes 3B, trên cổng 3125, với affinity CPU 0,1

Cả hai instance là tiến trình `llama-server` tiền biên dịch, chạy với `taskset` để ghim CPU.

Fine-tune mô hình Luna cũng tiến hóa từ bài thứ hai : giờ nó huấn luyện trên **200 000 mẫu** (thay vì 50 000 trước), vẫn từ Qwen2.5-1.5B-Instruct qua QLoRA. 200k mẫu là tập con của dataset Discord-Dialogues, lọc chỉ giữ cuộc trò chuyện tự nhiên và đa dạng nhất. Mục tiêu : mở rộng thanh ghi phong cách của mô hình mà không mất linh hoạt giúp few-shot priming hiệu quả.

---

## Sơ đồ đầy đủ : một tin nhắn quá cảnh

Đây là chuyện xảy ra cụ thể khi ai đó gửi "je suis vraiment triste aujourd'hui" trên Discord :

1. **Jade** nhận tin nhắn qua API Gateway Discord. Nó đổi thành `MessageEvent` và gửi tới Emerald qua WebSocket.
2. **Emerald** đánh giá kích hoạt (mention? tên? keyword?). Đây là mention trực tiếp. Nó tính trễ tập trung, kiểm tra cooldown, phiên, mệt mỏi chủ đề. Nó quyết trả lời và gửi tin nhắn tới Sapphire qua HTTP.
3. **Sapphire** nhúng tin nhắn bằng `bge-small-en-v1.5`.
   - Phân loại : tin nhắn gần centroid `interessant` hơn centroid `futile` (diff = +0.31) -> **INTERESSANT**
   - Cảm xúc : valence tiêu cực (-0.42), arousal vừa (0.35)
   - Định tuyến : hướng `KRYSTAL_SEMANTIC_URL` (cổng 3125, mô hình lớn)
   - Tham số lấy mẫu : temperature = 0.80 (arousal tăng), repeat_penalty = 1.19 (valence tiêu cực)
   - Trạng thái cảm xúc của phiên được cập nhật bằng các giá trị này
4. **Krystal** (instance lớn) sinh phản hồi với tham số chỉnh theo cảm xúc và trả về Sapphire.
5. **Sapphire** stream phản hồi về Emerald kèm metadata (nhãn, valence, arousal, thống kê gỡ lỗi).
6. **Emerald** quyết thêm ngập ngừng ("oh..."), lập kế hoạch burst (2 mảnh), và chọn phản ứng. Nó gửi `RespondCommand` tới Jade.
7. **Jade** thực thi : chờ trễ ban đầu, gửi mảnh đầu kèm ngập ngừng, chờ 1.5s, gửi mảnh hai. Nó hiện chỉ báo đang gõ suốt quá trình sinh.

Tất cả dưới 3 giây với người dùng.

---

## Centroid : vì sao tốt hơn bộ phân loại nơ-ron

Chọn centroid embedding thay vì bộ phân loại truyền thống (như DistilBERT tôi từng dùng) đáng được giải thích.

Bộ phân loại nơ-ron học ranh giới quyết định giữa các lớp, thường là biến đổi phi tuyến chiếu đầu vào thành xác suất. Nó chính xác, nhưng :

- Nó đòi dữ liệu huấn luyện gán nhãn
- Nó nhạy với thay đổi phân bố (data drift)
- Nó khó diễn giải
- Nó phải huấn luyện lại để thêm lớp mới

Centroid, ngược lại, là **vector trung bình** của embedding ví dụ. Phân loại bằng tương đồng cosin tới vector trung bình này. Lợi thế :

- **Không cần huấn luyện** : chỉ tính trung bình embedding của ví dụ chọn tay
- **Dễ diễn giải** : có thể xem ví dụ nào gần centroid nhất để hiểu "centroid đã học gì"
- **Thêm lớp** : chỉ thêm centroid mới, không huấn luyện lại
- **Vững** : centroid là trung bình, nên outlier ít ảnh hưởng

Sức mạnh thật của centroid là biến bài toán phân loại thành bài toán **đo khoảng cách không gian**. Ta có thể trực quan hóa các danh mục như vùng trong không gian 384 chiều (hay 2D/3D sau giảm chiều PCA/t-SNE).

### Trực quan hóa 3D centroid

Thực tế, đây là dáng centroid phân loại trong không gian embedding. Mỗi điểm là ví dụ tin nhắn, chiếu 3D bằng PCA (384 chiều gốc rút còn 3 để trực quan). Điểm xanh là tin nhắn phù phiếm, điểm vàng là tin nhắn thú vị. **20 dấu kim cương** là centroid k-means (10 cho mỗi lớp, seed=42). Di chuột lên điểm để thấy văn bản gốc của ví dụ.

<iframe src="assets/centroids-plot.html" style="width:100%;height:550px;border:none;border-radius:8px;" loading="lazy" title="Phân loại theo centroid -- khung nhìn 3D tương tác"></iframe>

Hai ví dụ test hiện màu đỏ : "lol" (xếp phù phiếm) và "i feel sad today" (xếp thú vị). Ngay cả sau khi rút từ 384 còn 3 chiều (giải thích 14,7% phương sai), hai cụm tách rõ. Chú thích trên cho số lượng chính xác và vùng mơ hồ.

Centroid của tin nhắn tới dạo quanh không gian này tùy nội dung. Phân loại FUTILE/INTERESSANT chỉ là đo centroid nào gần nhất bằng tương đồng cosin. Nhờ vậy ta có thể biểu diễn mỗi tin nhắn như điểm trong không gian đa chiều, mỗi chiều khớp một thuộc tính ngữ nghĩa.

---

## Điều đó đổi gì trong thực hành

Người dùng không thấy lớp, centroid, hay chỉnh temperature. Nhưng họ cảm hiệu ứng :

- **Phản hồi nhanh hơn** cho tin nhắn đơn giản (mô hình nhỏ nhanh gấp 2 và xử lý 70% lưu lượng)
- **Giọng thích ứng** : nếu bạn bực, bot "cảm" bực và thích ứng phong cách
- **Nhất quán xuyên nền tảng** : bot Matrix và bot Discord dùng chung não và trạng thái cảm xúc
- **Giọng chân thật giữ nguyên** : fine-tune + few-shot + định tuyến thông minh tránh phản hồi corporate

Chuyển sang 200k mẫu huấn luyện cho mô hình nhỏ càng củng cố các hiệu ứng này : mô hình nắm tốt hơn đa dạng hội thoại Discord mà không mất dẻo dai giúp few-shot priming hiệu quả.

---

## Hạ tầng đầy đủ

Đây là các service đang chạy :

| Service | Công nghệ | Cổng | Vai trò |
|---------|------------|------|------|
| Pixieglow | TypeScript (Bun) | -- | Adapter Matrix |
| Jade | TypeScript (esbuild) | -- | Adapter Discord |
| Emerald | TypeScript (Bun) | 3126 (WebSocket) | Não / quyết định |
| Sapphire | Python (FastAPI) | 3123 (HTTP) | Bộ phân loại + cảm xúc |
| Krystal small | llama.cpp (PM2) | 3124 | Mô hình nhỏ (1.5B, phù phiếm) |
| Krystal large | llama.cpp (PM2) | 3125 | Mô hình lớn (3B+, thú vị) |

Phụ thuộc giữa service một chiều : adapter phụ thuộc Emerald, Emerald phụ thuộc Sapphire, Sapphire phụ thuộc Krystal. Đồ thị vẫn không chu trình. Mỗi service có thể khởi động lại độc lập.

---

## Kết luận

Chia Luna Protocol thành bốn lớp không chỉ là bài tập kiến trúc. Đó là câu trả lời cho giới hạn cụ thể : không thể hỗ trợ Matrix, thiếu ý thức cảm xúc, thiếu ưu tiên thông minh tin nhắn.

Ngày nay, hệ thống vững hơn (LLM crash không giết bot), mở rộng được hơn (adapter Telegram hay WhatsApp sẽ theo cùng giao thức WebSocket), và "sống" hơn : bot thích ứng hành vi, giọng, và ngay cả tham số LLM theo trạng thái cảm xúc cảm nhận của cuộc trò chuyện.

Centroid embedding là yếu tố mấu chốt giúp tất cả khả thi mà không phức tạp quá : không mạng nơ-ron huấn luyện, không pipeline dữ liệu gán nhãn, chỉ trung bình vector và tương đồng cosin. Đó là kỹ thuật đơn giản, hiệu quả bất ngờ, và bị đánh giá thấp tệ hại.

| Tài nguyên | Link |
|----------|------|
| Website dự án | [protocol-luna.github.io](https://protocol-luna.github.io/) |
| Pixieglow | [protocol-luna/pixieglow](https://github.com/protocol-luna/pixieglow) |
| Emerald | [protocol-luna/emerald](https://github.com/protocol-luna/emerald) |
| Sapphire | [protocol-luna/sapphire](https://github.com/protocol-luna/sapphire) |
| Krystal | [protocol-luna/krystal](https://github.com/protocol-luna/krystal) |
| Bài 1 : bot Discord | [Luna Protocol : tôi đã tạo bot Discord tự chủ](/articles/fr/luna-protocol-discord-bot) |
| Bài 2 : fine-tuning | [Luna Protocol : vì sao tôi fine-tune mô hình 1,5B](/articles/fr/luna-protocol-official-models) |
