---
title: "Luna Protocol: bộ não dùng chung, phân loại cảm xúc, và định tuyến thú vị/vô ích"
description: "Luna Protocol đã chuyển từ một khối nguyên khối sang kiến trúc bốn lớp: adapter, brain, bộ phân loại cảm xúc, và inference. Trong bài viết: centroid embedding, định tuyến thú vị/vô ích, và tinh chỉnh tham số LLM theo valence và arousal."
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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "0ujXY0ngq9MGciKm24Vg73ftleMmWGlb5gobTTrfrIM6PcJ69jp8IF9+w3VTBPi4yTUs4QbIn1/UHKUZ0zGluA=="
---

# Luna Protocol: bộ não dùng chung, phân loại cảm xúc, và định tuyến thú vị/vô ích

Trong [hai](/articles/vi/luna-protocol-discord-bot) [bài viết](/articles/vi/luna-protocol-official-models) trước, tôi đã giới thiệu Luna Protocol như một bot Discord đơn lẻ với hệ thống hành vi phức tạp và một mô hình đã được fine-tune. Nhưng kiến trúc đã tiến hóa rất nhiều kể từ đó. Thứ từng là một khối nguyên khối -- một tiến trình Node.js duy nhất xử lý bot Discord, hành vi, và các lệnh gọi LLM -- giờ đã trở thành **bốn lớp độc lập**, mỗi lớp có trách nhiệm riêng, ngôn ngữ riêng, và vòng đời riêng.

Sự tách lớp này mang lại những lợi ích bất ngờ: chia sẻ "bộ não" giữa nhiều nền tảng, một hệ thống phân loại cảm xúc điều chỉnh động các tham số của LLM, và định tuyến thông minh các tin nhắn giữa hai mô hình dựa trên mức độ quan trọng cảm nhận được của cuộc trò chuyện.

Quá trình tiến hóa này không diễn ra cùng một lúc -- nó đi theo một con đường tự nhiên. Đầu tiên tôi tách thư mục `server/` ra khỏi repo của bot, tạo ra **Krystal** ở một bên và giữ lại **Jade** làm adapter Discord. Sau đó tôi tạo **Pixieglow** (adapter Matrix) bằng cách tái sử dụng `llm-core` và event bus của Jade. Tiếp theo là **Sapphire**, giới thiệu phân loại GENERIC/SEMANTIC bằng DistilBERT -- nhưng kết quả không thuyết phục, nên tôi chuyển sang centroid embedding, vốn dễ uốn nắn hơn khi làm giàu ví dụ và chính xác hơn; việc phân loại trở thành FUTILE/INTERESTING (vô ích/thú vị). Cuối cùng tôi thêm các centroid **valence** và **arousal** để điều chỉnh temperature và repeat penalty của LLM. Sau cùng, tôi loại bỏ toàn bộ mã trùng lặp giữa Jade và Pixieglow bằng cách tạo ra **Emerald**, bộ não dùng chung, biến Jade và Pixieglow thành những client đơn giản chạy trên socket.

Song song đó, tôi vẫn duy trì một trang web cập nhật tiến độ dự án: [protocol-luna.github.io](https://protocol-luna.github.io/).

Bài viết này kể lại câu chuyện về cách và lý do tôi tách các lớp này, mỗi dịch vụ làm chính xác điều gì, và các khái niệm như **centroid** (vector embedding trung bình) và **biến resentment** (lấy cảm hứng từ chatbot PARRY những năm 1970) đã biến một bot Discord đơn giản thành một hệ thống đa nền tảng gắn kết đến bất ngờ như thế nào.

---

## Vấn đề với khối nguyên khối

Ban đầu, Luna Protocol nằm gọn trong một tiến trình Node.js duy nhất. Mã nguồn xử lý:

- Kết nối Discord (qua thư viện Eris)
- Đánh giá trigger (nhắc tên, từ khóa, tin nhắn nối tiếp...)
- Mô phỏng hành vi con người (gõ sai, ngập ngừng, ngủ...)
- Gọi HTTP tới server LLM cục bộ (llama.cpp)
- Quản lý phiên và chống spam
- Pipeline TTS

Tất cả sống trong cùng một tiến trình, giao tiếp qua các event bus có kiểu (`TypedBus`). Nó hoạt động, nhưng có những giới hạn:

- **Không thể thêm client Matrix** mà không phải nhân bản toàn bộ mã hành vi
- **LLM và bot nằm trong cùng một repo**: thư mục `server/` đã tồn tại, nhưng bạn không thể phát triển cái này mà không đụng vào cái kia
- **Không có phân loại thông minh**: mọi tin nhắn đều được xử lý như nhau, dù là "lol" hay một câu hỏi mang tính hiện sinh
- **Không có trạng thái cảm xúc bền vững**: bot không "cảm nhận" gì cả

Việc tách thành các lớp đã giải quyết tất cả những vấn đề này.

---

## Bốn lớp

Kiến trúc hiện tại của Luna Protocol được tổ chức như một phễu bốn cấp:

```
Matrix / Discord
      |
      v
  [ADAPTERS]      Pixieglow (Matrix) / Jade (Discord)
      |
      v
  [BRAIN]         Emerald (WebSocket, cổng 3126)
      |
      v
  [CLASSIFIER]    Sapphire (HTTP, cổng 3123)
      |
      v
  [INFERENCE]     Krystal (llama.cpp, cổng 3124 / 3125)
```

Mỗi lớp có thể được khởi động lại, cập nhật, hoặc thay thế một cách độc lập.

---

### Lớp 1: các adapter (Pixieglow và Jade)

Đây là các lớp đơn giản nhất. Nhiệm vụ duy nhất của chúng là dịch các sự kiện từ một nền tảng nhắn tin thành một giao thức chuẩn hóa hướng tới Emerald:

- **Jade** là adapter Discord. Nó dùng thư viện Eris để kết nối với Discord và chuyển tiếp tin nhắn đến Emerald qua WebSocket. Nó cũng xử lý pipeline TTS (tổng hợp giọng nói qua Piper, chuyển đổi OGG, tải lên Discord).
- **Pixieglow** là adapter Matrix. Nó dùng trực tiếp Matrix Client-Server HTTP API (không SDK), với long-poll sync. Nó không có TTS.

Cả hai adapter đều dùng chung một giao thức WebSocket được định nghĩa trong `emerald-client.ts`:

```typescript
type ClientId = "jade" | "pixieglow";

// Sự kiện (adapter -> Emerald)
type InEvent = MessageEvent | ReadyEvent | BotMessageEvent | PresenceEvent;

// Lệnh (Emerald -> adapter)
type OutCommand = RespondCommand | TypingCommand | SetPresenceCommand
                | SpontaneousCommand | ForgotCommand;
```

Sự tồn tại của hai adapter với cùng một interface chứng minh rằng việc chia sẻ bộ não thực sự hiệu quả: **cùng một "bộ não" (Emerald) phục vụ cả bot Discord lẫn bot Matrix một cách không phân biệt**, với hành vi giống hệt nhau. Giao thức mang tính khai báo: Emerald không nói cho adapter biết *cách* gửi tin nhắn, mà nói *cái gì* cần gửi (văn bản kèm độ trễ, có thể là một kế hoạch burst, một reaction, v.v.). Mỗi adapter tự thực thi cụ thể cho nền tảng của mình.

Đó là sức mạnh của kiến trúc này: để thêm hỗ trợ cho Telegram, Signal, hay bất cứ thứ gì khác, bạn chỉ cần viết một adapter triển khai giao thức WebSocket.

Bộ não không biết nó đang chạy trên nền tảng nào. Nó nhận một `MessageEvent` với một `clientId` ("jade" hoặc "pixieglow"), đưa ra quyết định, và trả về một lệnh. Adapter xử lý phần còn lại.

---

### Lớp 2: bộ não (Emerald)

Emerald là dịch vụ ra quyết định trung tâm. Nó lắng nghe trên cổng 3126 qua WebSocket và xử lý:

- **Đánh giá trigger**: nhắc tên, DM, tên riêng, từ khóa, tin nhắn nối tiếp, ngẫu nhiên
- **Mô phỏng hành vi**: độ trễ tập trung, gõ sai, ngập ngừng, hay quên, burst, mệt mỏi chủ đề
- **Chu kỳ ngủ**: chế độ sleep / slow / short
- **Quản lý phiên**: cooldown, giới hạn phiên, chống spam
- **Định tuyến tới Sapphire**: gửi tin nhắn, nhận phản hồi dạng stream

Emerald là dịch vụ trung tâm giúp việc chia sẻ bộ não trở nên khả thi, và cũng là dịch vụ hưởng lợi nhiều nhất từ việc tách lớp. Trước đây, mọi hành vi (gõ sai, burst, ngập ngừng) đều bị trộn lẫn với mã Discord. Giờ đây chúng nằm trong các module chuyên biệt dưới `behavior/`:

```
emerald/src/behavior/
  burst.ts         -- Lập kế hoạch tin nhắn burst
  mannerisms.ts    -- Độ trễ, ngập ngừng, reaction, hay quên
  sleep.ts         -- Đánh giá lịch trình ngủ
  typo.ts          -- Mô phỏng gõ sai (AZERTY/QWERTY)
```

---

### Lớp 3: bộ phân loại cảm xúc (Sapphire)

Sapphire là dịch vụ thú vị nhất về mặt kỹ thuật. Nó là một **middleware LLM** viết bằng Python với FastAPI, đảm nhận bốn vai trò quan trọng:

1. **Bộ phân loại nhị phân FUTILE / INTERESTING** thông qua centroid embedding
2. **Bộ tính điểm cảm xúc** (valence / arousal) thông qua centroid
3. **Bộ định tuyến backend** tới Krystal (mô hình nhỏ vs mô hình lớn)
4. **Bộ tiêm few-shot** và quản lý phiên

#### Centroid: trái tim của việc phân loại

**Centroid** là một khái niệm đơn giản: đó là trung bình của một tập các vector embedding. Cụ thể, tôi đã thu thập hàng trăm tin nhắn mẫu, cho chúng qua một mô hình embedding (`BAAI/bge-small-en-v1.5`, 384 chiều), và lấy trung bình các vector kết quả.

Có **hai centroid phân loại**:

- `futile_centroid`: embedding trung bình của khoảng 683 tin nhắn tầm thường ("lol", "ok", "hello") via k-means (k=10, seed=42)
- `interesting_centroid`: embedding trung bình của khoảng 678 tin nhắn thực chất (kỹ thuật, cá nhân, triết học) via k-means (k=10, seed=42)

Khi một tin nhắn đến:

```python
def classify(text, embedder, futile_centroids, interesting_centroids):
    emb = embedder.query_embed(text)                        # 384-D vector
    sim_f = max(cos(emb, c) for c in futile_centroids)     # max over 10
    sim_i = max(cos(emb, c) for c in interesting_centroids)     # max over 10
    diff = sim_i - sim_f
    label = "INTERESSANT" if diff > 0 else "FUTILE"
    return label, abs(diff), sim_f, sim_i
```

Độ tương đồng cosine giữa tin nhắn và mỗi centroid quyết định danh mục. Hiệu số tuyệt đối cho biết độ tin cậy. Nó đơn giản, nhanh (không cần forward pass của LLM), và hiệu quả đến bất ngờ.

#### Tại sao lại hai mô hình?

Kết quả phân loại này quyết định backend LLM nào sẽ được gọi:

| Nhãn | Backend Krystal | Mô hình | Cổng |
|-------|-----------------|-------|------|
| `FUTILE` | `generic` | Luna-Protocol-1.5B (941 MB, Q4_K_M) | 3124 |
| `INTERESTING` | `semantic` | Hermes-3-3B hoặc 8B (tùy cấu hình) | 3125 |

Trực giác rất đơn giản: một câu "lol" hay "nm just chillin u" không xứng đáng để gọi một mô hình 8 tỷ tham số. Mô hình Luna 1.5B nhỏ đã fine-tune, huấn luyện trên 200.000 mẫu Discord, đã quá đủ cho các trao đổi nhẹ nhàng. Ngược lại, một câu hỏi về cuộc sống, một lời tâm sự, hay một cuộc tranh luận kỹ thuật sẽ được định tuyến tới mô hình lớn, vốn có thể tạo ra phản hồi phong phú hơn.

Việc định tuyến tiết kiệm này giảm đáng kể tải trên server LLM: khoảng 70% tin nhắn được phân loại là FUTILE và do mô hình nhỏ xử lý, giải phóng mô hình lớn cho những cuộc trò chuyện thực sự xứng đáng.

#### Trục cảm xúc: valence và arousal

Nhưng đó chưa phải là tất cả. Sapphire dùng **cùng cơ chế centroid** trên một trục độc lập để đánh giá cảm xúc của tin nhắn:

Có **bốn centroid cảm xúc**:

| Cực | Ví dụ |
|------|----------|
| `positive` | "hell yeah", "love that", "this is great" |
| `negative` | "shut up", "i hate this", "this sucks" |
| `high_arousal` | "WHAT THE HELL", "omg omg omg", "AAAAA" |
| `low_arousal` | "just chilling", "meh", "i guess" |

Điểm số được tính như hiệu số của các độ tương đồng trên mỗi trục:

```python
valence = sim(emb, positive) - sim(emb, negative)     # [-1, +1]
arousal = sim(emb, high_arousal) - sim(emb, low_arousal)  # [-1, +1]
```

**Valence** đo mức độ tích cực hay tiêu cực của tin nhắn. **Arousal** đo cường độ cảm xúc của nó. Kết hợp lại, chúng tạo thành mô hình vòng tròn cảm xúc (circumplex model of affect, Russell, 1980) -- cùng mô hình tâm lý học đã truyền cảm hứng cho chatbot **PARRY** năm 1972.

#### Biến resentment: cảm xúc điều khiển LLM như thế nào

Đây là chỗ nguồn cảm hứng từ PARRY trở nên hữu hình. PARRY (do Kenneth Colby tạo ra năm 1972) là một chatbot được thiết kế để mô phỏng một bệnh nhân hoang tưởng. Nó có các biến nội tại -- sợ hãi, tức giận, nghi kỵ -- làm thay đổi phản hồi của nó. Ví dụ, một PARRY đang "sợ hãi" sẽ phản hồi hung hăng hơn.

Sapphire làm điều tương tự, nhưng với các biến liên tục và một phương pháp thanh lịch hơn: các tham số lấy mẫu của LLM được điều chỉnh theo thời gian thực dựa trên trạng thái cảm xúc của cuộc trò chuyện.

##### Temperature theo arousal

```python
temperature = clamp(0.7 + arousal * 0.3, 0.4, 1.0)
```

| Arousal | Temperature | Hiệu ứng |
|---------|-------------|--------|
| -1.0 (bình tĩnh) | 0.40 | Sáng tạo thấp, phản hồi dễ đoán |
| 0.0 (trung tính) | 0.70 | Sáng tạo mặc định |
| +1.0 (hào hứng) | 1.00 | Ngẫu nhiên tối đa, phản hồi bất ngờ |

Khi ai đó hào hứng hoặc bực bội (arousal cao), temperature tăng lên. Mô hình tạo ra các phản hồi đa dạng hơn, sáng tạo hơn, đôi khi hỗn loạn hơn -- giống như một con người "bị cuốn theo". Khi cuộc trò chuyện bình lặng, temperature giảm xuống, và phản hồi trở nên chừng mực hơn.

##### Repeat penalty theo valence

```python
repeat_penalty = clamp(1.15 - valence * 0.1, 1.0, 1.3)
```

| Valence | Repeat Penalty | Hiệu ứng |
|---------|-----------------|--------|
| -1.0 (tiêu cực) | 1.25 | Phạt mạnh, tránh lặp lại |
| 0.0 (trung tính) | 1.15 | Giá trị mặc định |
| +1.0 (tích cực) | 1.05 | Phạt nhẹ, cho phép lặp lại |

Cuộc trò chuyện càng tiêu cực, mô hình càng bị thúc đẩy tránh lặp lại chính mình -- giống như ai đó đang tìm từ trong một cuộc tranh cãi căng thẳng. Cuộc trò chuyện càng tích cực, mô hình càng có thể chấp nhận những phát biểu dư thừa, như một cuộc trò chuyện thư giãn.

##### Trạng thái cảm xúc tích lũy

Những điểm số này không chỉ áp dụng cho tin nhắn tức thời. Một `EmotionState` duy trì **trung bình động theo cấp số nhân** của valence và arousal cho mỗi phiên:

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

`decay` là 0.85 nghĩa là 85% trạng thái trước đó được giữ lại ở mỗi tin nhắn, với 15% tín hiệu mới được tích hợp vào. Điều này tạo ra một **bộ nhớ cảm xúc** làm dịu đi những biến động đột ngột: một tin nhắn tiêu cực đơn lẻ không khiến bot "buồn", nhưng một chuỗi tin nhắn tiêu cực sẽ dần dần kéo tâm trạng của nó đi theo.

Trong thực tế: nếu ai đó bắt đầu cuộc trò chuyện rất hào hứng (`arousal=+0.8`), temperature vẫn cao trong vài lượt trao đổi tiếp theo, ngay cả khi các tin nhắn sau đó bình tĩnh hơn. Cảm xúc cần thời gian để lắng xuống -- giống như một con người vẫn còn "nóng" sau một cuộc tranh cãi.

---

### Lớp 4: inference (Krystal)

Krystal là lớp thấp nhất: một wrapper quanh `llama.cpp` cung cấp một API tương thích OpenAI (`/v1/chat/completions`). Nó chạy dưới dạng hai instance PM2:

- `krystal-small`: mô hình Luna 1.5B đã fine-tune, trên cổng 3124, với CPU affinity 0
- `krystal-large`: một mô hình Hermes 3B, trên cổng 3125, với CPU affinity 0,1

Cả hai instance đều là các tiến trình `llama-server` được biên dịch sẵn, khởi chạy bằng `taskset` để ghim CPU.

Việc fine-tune mô hình Luna cũng đã tiến hóa kể từ bài viết thứ hai: giờ đây nó được huấn luyện trên **200.000 mẫu** (tăng từ 50.000 trước đó), vẫn xuất phát từ Qwen2.5-1.5B-Instruct qua QLoRA. 200 nghìn mẫu này là một tập con của bộ dữ liệu Discord-Dialogues, được lọc để chỉ giữ lại những cuộc trò chuyện tự nhiên và đa dạng nhất. Mục tiêu: mở rộng phạm vi phong cách của mô hình mà không đánh mất sự linh hoạt khiến few-shot priming trở nên hiệu quả đến vậy.

---

## Bức tranh toàn cảnh: một tin nhắn đang được xử lý

Đây là những gì thực sự xảy ra khi ai đó gửi "i'm really sad today" trên Discord:

1. **Jade** nhận tin nhắn qua Discord Gateway API. Nó chuyển đổi thành một `MessageEvent` và gửi tới Emerald qua WebSocket.
2. **Emerald** đánh giá trigger (nhắc tên? tên riêng? từ khóa?). Đây là một lần nhắc tên trực tiếp. Nó tính toán độ trễ tập trung, kiểm tra cooldown, phiên, mệt mỏi chủ đề. Nó quyết định phản hồi và gửi tin nhắn tới Sapphire qua HTTP.
3. **Sapphire** embedding tin nhắn bằng `bge-small-en-v1.5`.
   - Phân loại: tin nhắn gần centroid `interesting` hơn centroid `futile` (diff = +0.31) -> **INTERESTING**
   - Cảm xúc: valence tiêu cực (-0.42), arousal vừa phải (0.35)
   - Định tuyến: hướng `KRYSTAL_SEMANTIC_URL` (cổng 3125, mô hình lớn)
   - Tham số lấy mẫu: temperature = 0.80 (arousal tăng), repeat_penalty = 1.19 (valence tiêu cực)
   - Trạng thái cảm xúc của phiên được cập nhật với các giá trị này
4. **Krystal** (instance lớn) tạo ra phản hồi với các tham số đã điều chỉnh theo cảm xúc và gửi lại cho Sapphire.
5. **Sapphire** stream phản hồi tới Emerald cùng với metadata (nhãn, valence, arousal, số liệu debug).
6. **Emerald** quyết định thêm một sự ngập ngừng ("oh..."), lên kế hoạch burst (2 mảnh), và chọn một reaction. Nó gửi một `RespondCommand` tới Jade.
7. **Jade** thực thi: chờ độ trễ ban đầu, gửi mảnh đầu tiên kèm sự ngập ngừng, chờ 1,5 giây, gửi mảnh thứ hai. Nó hiển thị chỉ báo đang gõ trong suốt quá trình tạo phản hồi.

Tất cả điều này diễn ra trong chưa đầy 3 giây đối với người dùng.

---

## Centroid: tại sao chúng tốt hơn một bộ phân loại neural

Việc lựa chọn centroid embedding thay vì một bộ phân loại truyền thống (như DistilBERT tôi từng dùng trước đây) đáng để giải thích.

Một bộ phân loại neural học một ranh giới quyết định giữa các lớp -- thường là một phép biến đổi phi tuyến ánh xạ đầu vào thành xác suất. Nó chính xác, nhưng:

- Nó cần dữ liệu huấn luyện đã gán nhãn
- Nó nhạy cảm với sự thay đổi phân phối (data drift)
- Nó khó diễn giải
- Nó cần được huấn luyện lại để thêm một lớp mới

Ngược lại, centroid là một **vector trung bình** của các embedding mẫu. Việc phân loại được thực hiện bằng độ tương đồng cosine với vector trung bình đó. Ưu điểm:

- **Không cần huấn luyện**: bạn chỉ cần tính trung bình embedding của các ví dụ được chọn thủ công
- **Dễ diễn giải**: bạn có thể xem những ví dụ nào gần centroid nhất để hiểu "centroid đã học được gì"
- **Thêm một lớp**: bạn chỉ cần thêm một centroid mới -- không cần huấn luyện lại
- **Vững chắc**: centroid là một trung bình, nên các giá trị ngoại lai có ít tác động

Sức mạnh thực sự của centroid là chúng biến một bài toán phân loại thành một bài toán **đo khoảng cách không gian**. Bạn có thể hình dung các danh mục như những vùng trong không gian 384 chiều (hoặc trong 2D/3D sau khi giảm chiều bằng PCA/t-SNE).

### Trực quan hóa centroid 3D

Trong thực tế, đây là hình ảnh của các centroid phân loại trong không gian embedding. Mỗi điểm là một tin nhắn mẫu, được chiếu vào 3D qua PCA (384 chiều gốc được giảm xuống còn 3 để trực quan hóa). Các điểm màu xanh là tin nhắn vô ích (futile), các điểm màu vàng là tin nhắn thú vị (interesting). Hai viên kim cương lớn là các centroid đã tính toán -- trung bình của mỗi nhóm. Di chuột qua một điểm để xem văn bản gốc của ví dụ.

<iframe src="assets/centroids-plot.html" style="width:100%;height:550px;border:none;border-radius:8px;" loading="lazy" title="Phân loại centroid - chế độ xem 3D tương tác"></iframe>

Hai ví dụ được hiển thị màu đỏ: "lol" (phân loại futile) và "i feel sad today" (phân loại interesting). "lol" rơi vào đám mây xanh của các tin nhắn vô ích, trong khi "i feel sad today" nằm về phía các điểm màu vàng. Sự phân tách vẫn có thể nhìn thấy ngay cả sau khi giảm xuống 3 chiều (chỉ giải thích được 14,7% tổng phương sai). Trong không gian 384 chiều, ranh giới sắc nét hơn nhiều.

Centroid của tin nhắn đầu vào di chuyển trong không gian này tùy theo nội dung của nó. Việc phân loại FUTILE/INTERESTING đơn giản chỉ là đo xem centroid nào gần hơn bằng độ tương đồng cosine. Điều này cho phép chúng ta biểu diễn mỗi tin nhắn như một điểm trong không gian đa chiều, với mỗi chiều tương ứng với một thuộc tính ngữ nghĩa.

---

## Điều này thay đổi gì trong thực tế

Người dùng không nhìn thấy các lớp, các centroid, hay các điều chỉnh temperature. Nhưng họ cảm nhận được hiệu ứng:

- **Phản hồi nhanh hơn** cho các tin nhắn đơn giản (mô hình nhỏ nhanh gấp 2 lần và xử lý 70% lưu lượng)
- **Giọng điệu thích ứng**: nếu bạn đang khó chịu, bot "cảm nhận" được sự bực bội và điều chỉnh phong cách của nó
- **Tính nhất quán đa nền tảng**: một bot Matrix và một bot Discord chia sẻ cùng một bộ não và cùng một trạng thái cảm xúc
- **Không có "chế độ trợ lý"**: fine-tune + few-shot + định tuyến thông minh giúp tránh những phản hồi nghe như doanh nghiệp

Việc tăng tập huấn luyện của mô hình nhỏ lên 200.000 mẫu càng củng cố thêm những hiệu ứng này: mô hình nắm bắt tốt hơn sự đa dạng của các cuộc trò chuyện trên Discord mà không đánh mất sự linh hoạt mà few-shot priming mang lại.

---

## Toàn bộ hạ tầng

Đây là các dịch vụ đang chạy hiện tại:

| Dịch vụ | Công nghệ | Cổng | Vai trò |
|---------|------------|---------|------|
| Pixieglow | TypeScript (Bun) | -- | Adapter Matrix |
| Jade | TypeScript (esbuild) | -- | Adapter Discord |
| Emerald | TypeScript (Bun) | 3126 (WebSocket) | Bộ não / quyết định |
| Sapphire | Python (FastAPI) | 3123 (HTTP) | Bộ phân loại + cảm xúc |
| Krystal small | llama.cpp (PM2) | 3124 | Mô hình nhỏ (1.5B, futile) |
| Krystal large | llama.cpp (PM2) | 3125 | Mô hình lớn (3B+, interesting) |

Các phụ thuộc giữa các dịch vụ là một chiều: adapter phụ thuộc vào Emerald, Emerald phụ thuộc vào Sapphire, Sapphire phụ thuộc vào Krystal. Không có vòng lặp. Mỗi dịch vụ có thể được khởi động lại một cách độc lập.

---

## Kết luận

Việc tách Luna Protocol thành bốn lớp không chỉ là một bài tập kiến trúc. Đó là câu trả lời cho những hạn chế cụ thể: không thể hỗ trợ Matrix, thiếu nhận thức cảm xúc, và không có sự ưu tiên thông minh cho tin nhắn.

Ngày nay, hệ thống mạnh mẽ hơn (một sự cố LLM không làm chết bot), có thể mở rộng hơn (một adapter Telegram hay WhatsApp sẽ tuân theo cùng một giao thức WebSocket), và "sống động" hơn: bot điều chỉnh hành vi, giọng điệu, và thậm chí cả các tham số của LLM theo trạng thái cảm xúc cảm nhận được của cuộc trò chuyện.

Centroid embedding là mảnh ghép then chốt giúp tất cả những điều này khả thi mà không cần sự phức tạp quá mức: không có mạng neural đã huấn luyện, không có pipeline dữ liệu gán nhãn, chỉ có các vector trung bình và độ tương đồng cosine. Đó là một kỹ thuật đơn giản, hiệu quả đến kinh ngạc, và bị đánh giá thấp một cách tệ hại.

| Tài nguyên | Liên kết |
|----------|------|
| Trang web dự án | [protocol-luna.github.io](https://protocol-luna.github.io/) |
| Pixieglow | [protocol-luna/pixieglow](https://github.com/protocol-luna/pixieglow) |
| Emerald | [protocol-luna/emerald](https://github.com/protocol-luna/emerald) |
| Sapphire | [protocol-luna/sapphire](https://github.com/protocol-luna/sapphire) |
| Krystal | [protocol-luna/krystal](https://github.com/protocol-luna/krystal) |
| Bài viết 1: bot Discord | [Luna Protocol: tôi đã xây dựng một bot Discord tự động](/articles/vi/luna-protocol-discord-bot) |
| Bài viết 2: fine-tuning | [Luna Protocol: tại sao tôi fine-tune một mô hình 1.5B](/articles/vi/luna-protocol-official-models) |