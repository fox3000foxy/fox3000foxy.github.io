---
title: "Luna Protocol: Tôi đã tạo một bot Discord tự trị mô phỏng con người"
description: "Luna Protocol là một bot Discord hoàn toàn tự trị được hỗ trợ bởi LLM cục bộ, có khả năng trò chuyện tự nhiên với giấc ngủ, lỗi đánh máy, do dự, quên lãng, mệt mỏi theo chủ đề và tin nhắn tự phát."
date: 2026-07-11
tags:
  - discord-bot
  - llm
  - typescript
  - kien-truc-su-kien
  - tri-tue-nhan-tao
  - nguon-mo
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "T8+YSdhoghLJijdqgTdkrm07EE3rdk91DR39uX1pt3+a7yfqPUwmYq1DdMromqPkuw8SD4O1xywPsS0IS3b4tg=="
---

# Luna Protocol: Tôi đã tạo một bot Discord tự trị mô phỏng con người

Nếu một bot Discord có thể **ngủ**, **đánh sai chính tả**, **do dự**, **quên** trả lời, và đôi khi tự gửi tin nhắn cho bạn thì sao? Đó chính xác là những gì **Luna Protocol** làm: một bot Discord hoàn toàn tự trị chạy LLM cục bộ (llama.cpp) và trò chuyện như một con người không hoàn hảo.

Không có prompt cứng nhắc, không có câu trả lời máy móc. Luna có **hệ thống kích hoạt ưu tiên**, **độ trễ thay đổi**, **lịch ngủ**, **tin nhắn tự phát**, và thậm chí cả **pipeline TTS** để gửi tin nhắn thoại. Tất cả được cấu hình qua một file `config.yml` đơn giản có thể tải lại nóng.

Trong bài viết này, chúng ta phân tích kiến trúc hoàn chỉnh: từ bus sự kiện tổng quát đến pipeline TTS, bao gồm hệ thống kích hoạt, các hành vi giống người, và tập dữ liệu fine-tuning.

![Tổng quan kiến trúc -- các thành phần toàn cục và luồng dữ liệu](/images/luna-protocol/01-architecture-overview.svg)

---

## Kiến trúc: Bus sự kiện được đánh kiểu

Tại trung tâm của Luna là **TypedBus** -- một bus sự kiện tổng quát được đánh kiểu mạnh mẽ trong TypeScript. Đây là khối cơ bản mà mọi thứ đều dựa vào.

```typescript
type EventMap = Record<string, unknown[]>;

export class TypedBus<Events extends EventMap> {
  private listeners = new Map<keyof Events, Set<(...args: unknown[]) => void>>();

  on<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as (...args: unknown[]) => void);
  }

  emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    this.listeners.get(event)?.forEach((fn) => { fn(...args); });
  }
}
```

Hai bus chính xuất phát từ đây:

- **`llmBus`** -- xử lý token LLM, lỗi, crash, reset
- **`stateBus`** -- xử lý thay đổi trạng thái với khả năng lưu trữ tự động

```
┌─────────────────────────────────────────────────────┐
│                   core/bus.ts                        │
│  TypedBus<K, V> -- on / off / once / emit            │
├──────────────────┬──────────────────────────────────┤
│   core/llm-bus   │       state/state-bus             │
│  token / done /  │     state:changed                 │
│  error / crash / │     → persistence auto            │
│  flush / ready / │                                   │
│  reset           │                                   │
└────────┬─────────┴────────┬─────────────────────────┘
         │                  │
┌──────────────────┐  ┌────▼──────────────────────┐
│ core/llm-core.ts │  │ bot.ts (Eris)             │
│ mode direct      │  │ bot/pending.ts             │
│   llama-server   │  │ bot/reactions.ts           │
│ mode online      │  │ state/trigger.ts           │
│   OpenAI API     │  │ state/state.ts             │
│                  │  │ behavior/*                 │
│                  │  │ tts/*                      │
│                  │  │ spontaneous.ts             │
└──────────────────┘  └────────────────────────────┘
```

Ưu điểm của cách tiếp cận này: mỗi module được **tách rời** khỏi phần còn lại. LLM phát token lên bus, bot tiêu thụ, và trạng thái được cập nhật tự động. Không có phụ thuộc vòng tròn.

---

![Xử lý tin nhắn -- luồng xử lý hoàn chỉnh của một tin nhắn](/images/luna-protocol/02-message-processing.svg)

## Hệ thống kích hoạt: Ai quyết định khi nào Luna phản hồi?

Mỗi tin nhắn đến được đánh giá bởi `evaluateMessage()` trả về `TriggerResult` với lý do kích hoạt. Thứ tự ưu tiên là quan trọng:

| # | Lý do | Điều kiện | Bỏ qua ignored | Bypass pause |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | Có (0%) | Có |
| 2 | `dm` | Tin nhắn riêng với `replyInDM = true` | Có (0%) | Không |
| 3 | `name` | "Luna"/"Pixie"/alias (từ đầy đủ) | Không (8%) | Không |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (từ đầy đủ) | Không (8%) | Không |
| 5 | `follow-up` | Bot là người nói cuối cùng + < 15s + < 3 / 60s | -- | -- |
| 6 | `random` | 1.5% xác suất trên các tin nhắn không khớp | Không (8%) | Không |

Khớp theo **từ đầy đủ** (`\b`): "ai" không khớp với "mais", "vrai", "lait".

![Đánh giá kích hoạt -- quyết định nhập cho mỗi tin nhắn](/images/luna-protocol/03-trigger-evaluation.svg)

### Cơ chế phản hồi tiếp theo

Khi Luna trả lời tin nhắn, cô ấy đăng ký mình là `lastSpeaker`. Bất kỳ tin nhắn tiếp theo nào trong vòng 15 giây sẽ kích hoạt phản hồi **ngay lập tức** -- không có bộ đếm thời gian, không kiểm tra từ khóa. Ngân sách: 3 phản hồi tiếp theo trong cửa sổ 60 giây.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### Thời gian chờ

8 giây giữa hai phản hồi trong cùng một kênh. Bị bỏ qua bởi các đề cập và phản hồi tiếp theo.

---

## Hành vi con người: Sự tập trung thay đổi

Đây là nơi Luna trở nên thú vị. Mỗi loại kích hoạt có **ngưỡng tập trung riêng**: độ trễ tối thiểu/tối đa, xác suất bỏ qua, và xác suất phản hồi.

| Kích hoạt | Delay tối thiểu | Delay tối đa | Bỏ qua | Phản hồi |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

Tính toán delay cũng tính đến:
- **Độ dài tin nhắn**: tin nhắn càng dài, Luna càng mất thời gian để "đọc"
- **Sự không hoạt động**: nếu Luna không hoạt động trong 10 phút, delay được nhân lên 2 lần (mô phỏng "tỉnh dậy")
- **Giấc ngủ**: trong chế độ `slow`, delay được nhân lên 3 đến 5 lần

```typescript
export function computeDelay(
  reason: string | null = null,
  sleepBehavior?: string | null,
  msgLength?: number,
  inactivityMs?: number
): number {
  const t = getThresholds(reason);
  let delay = t.delay_min + Math.random() * (t.delay_max - t.delay_min);
  if (msgLength) {
    const readingFactor = Math.min(msgLength / 500, 3);
    delay *= 1 + readingFactor * (0.3 + Math.random() * 0.7);
  }
  if (sleepBehavior === "slow") {
    delay *= 3 + Math.random() * 2;
  }
  delay *= 0.5 + Math.random() * 1.5; // jitter mạnh
  return delay;
}
```

---

## Lịch ngủ

Luna có thể ngủ. Cấu hình qua `config.yml`:

```yaml
timezone: "Europe/Paris"
time_schedules:
  - start: "00:00"
    end: "07:00"
    behavior: sleep
  - start: "23:00"
    end: "00:00"
    behavior: slow
  - start: "07:00"
    end: "08:00"
    behavior: short
```

| Chế độ | Hiệu ứng |
|------|-------|
| `sleep` | Chỉ có đề cập và tin nhắn riêng mới được xử lý |
| `slow` | Delay x3-5, phản hồi gần như bằng không |
| `short` | Xác suất bỏ qua +30%, phản hồi gần như bằng không |

Trong giờ ngủ, trạng thái Discord chuyển sang `invisible`.

---

## Lỗi đánh máy

Luna có thể mắc lỗi đánh máy -- và sửa chúng sau 2-4 giây. Bố cục bàn phím có thể cấu hình (AZERTY hoặc QWERTY).

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... tất cả các phím liền kề
};
```

Ví dụ AZERTY: `bonjour -> bonjpur`, `salut -> slaut`, `comment -> cpmment`.

Ba kiểu sửa lỗi:

| Kiểu | Hành vi |
|-------|-------------|
| `edit` | Chỉnh sửa tin nhắn |
| `message` | Tin nhắn mới: `word*` |
| `mixed` | 50/50 ngẫu nhiên (mặc định) |

---

## Do dự và quên lãng

**Do dự**: 15% xác suất bắt đầu bằng từ đệm (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**Quên lãng**: ngay cả sau khi khớp một kích hoạt, Luna có thể "quên" phản hồi với xác suất 3%. Không tin nhắn, không phản hồi -- như thể cô ấy không thấy gì cả.

**Mệt mỏi theo chủ đề**: nếu một từ xuất hiện quá thường xuyên trong 10 tin nhắn gần nhất (ngưỡng: 3 lần), delay được nhân lên và xác suất bỏ qua tăng thêm 15%.

---

## Pipeline LLM: Hai chế độ

### Chế độ `direct` (mặc định)

Bot gửi trực tiếp yêu cầu đến `llama-server` cục bộ qua HTTP. Mô hình được chia sẻ, với prompt cache và 4 slot đồng thời. Hai tiến trình PM2: server LLM và client bot.

### Chế độ `online`

Bot gọi bất kỳ API tương thích OpenAI nào (OpenAI, OpenRouter, Groq, Together...). Không cần LLM cục bộ.

### Streaming thời gian thực

LLM streaming phản hồi theo từng dòng (`\n`). Mỗi dòng được tách thành các từ, phát từng cái một lên `llmBus.emit("token", word)`. Với mỗi `\n`, sự kiện `flush` được phát -- bot ngay lập tức gửi tin nhắn đã tích lũy. Không có độ trễ mô phỏng: nhịp độ là của LLM.

```typescript
function emitWordTokens(chunk: string): void {
  const words = chunk.match(/\S+/g) ?? [];
  wordEmitQueue.push(() => {
    let i = 0;
    const emitNext = () => {
      llmBus.emit("token", words[i]);
      i++;
      if (i < words.length) {
        const delay = MIN_WORD_DELAY + Math.random() * (MAX_WORD_DELAY - MIN_WORD_DELAY);
        setTimeout(emitNext, delay);
      } else {
        llmBus.emit("flush");
      }
    };
    emitNext();
  });
}
```

Hàng đợi (`requestQueue`) xử lý các yêu cầu từng cái một, với khả năng dọn dẹp tự động khi hàng đợi vượt quá 100 phần tử.

---

## Tin nhắn tự phát

Mỗi 5 phút, có 12% xác suất Luna tự đăng tin nhắn. Máy chủ được chọn bằng hệ thống **trọng số tuyến tính**: máy chủ hoạt động nhiều nhất có N lần xác suất nhiều hơn máy chủ ít hoạt động nhất.

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

Ngữ cảnh của 5 tin nhắn cuối cùng được đọc, và Luna tham gia cuộc trò chuyện một cách "tự nhiên".

---

## Pipeline TTS: Tin nhắn thoại

Với 8% xác suất, Luna gửi tin nhắn thoại thay vì văn bản. Pipeline hoàn chỉnh:

1. **Piper TTS** tổng hợp văn bản thành WAV
2. **ffmpeg** chuyển đổi sang OGG
3. Biểu đồ sóng được tính toán cho Discord preview
4. Tải tệp lên qua Discord CDN API
5. Gửi tin nhắn thoại

```typescript
export async function sendTextAsVoiceMessage(
  channelId: string, replyToMessageId: string, text: string
): Promise<void> {
  const safe = sanitizeForTTS(text);
  const { audio: wavBuf } = await synthesize(safe);
  const oggBuf = await wavToOgg(wavBuf);
  const durationSecs = await getAudioDuration(oggBuf);
  const waveform = buildWaveformBase64();
  const { uploadUrl, uploadFilename } = await requestUploadUrl(channelId, oggBuf.byteLength, durationSecs);
  await putFileToUploadUrl(uploadUrl, oggBuf);
  await postVoiceMessage(channelId, uploadFilename, durationSecs, waveform, replyToMessageId);
}
```

![Pipeline TTS -- từ văn bản được tổng hợp đến tin nhắn thoại Discord](/images/luna-protocol/10-tts-pipeline.svg)

---

## Chống spam và Lưu trữ

### Chống spam

Hàng đợi theo `channelId:userId`. Chỉ một tin nhắn được xếp hàng mỗi người dùng mỗi kênh. Xử lý ngay khi phản hồi hiện tại hoàn thành.

### Giới hạn phiên

Sau 8 cuộc trao đổi, Luna nghỉ 30 giây. Bộ đếm được đặt lại sau 3 phút không hoạt động.

### Lưu trữ tự động

Mỗi thay đổi trạng thái phát lên `stateBus` -> lưu tự động (debounce 500ms). Không còn cần gọi `saveAllState()` thủ công. Trạng thái được lưu trữ bao gồm: pendingMessages, paused, cooldowns, timestamps, lastSpeaker, bộ đếm phản hồi tiếp theo.

---

## Cấu hình tải lại nóng

Một file `config.yml`. Hầu hết các giá trị đều **có thể tải lại nóng** -- thay đổi có hiệu lực mà không cần khởi động lại.

| Danh mục | Hot-reload |
|-----------|-----------|
| Kích hoạt, từ khóa, tên | ✅ |
| Tập trung, delay | ✅ |
| Lỗi đánh máy, burst, mệt mỏi | ✅ |
| Lịch ngủ | ✅ |
| TTS, tin nhắn thoại | ✅ |
| Discord token, chế độ LLM | ❌ (cần khởi động lại) |

```typescript
// config.ts -- getter trả về giá trị thời gian thực
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## Tập dữ liệu: Discord-Dialogues

Mô hình được fine-tune trên [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues): **7.3M cuộc trao đổi**, **17M lượt**, **140M từ**. Các cuộc trò chuyện Discord thực tế mùa xuân-hè 2025, đã lọc (PII, ToS, bot, lệnh). Apache 2.0.

| Chỉ số | Giá trị |
|----------|--------|
| Số mẫu | 7 303 464 |
| Tổng số lượt | 16 881 010 |
| Tổng số từ | 139 922 950 |
| Token trung bình | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

Mô hình được lượng tử hóa sử dụng là GGUF (ví dụ `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Phân bố tập dữ liệu Discord-Dialogues](/images/luna-protocol/dataset-distribution.svg)

---

![Vòng đời hoàn chỉnh -- hành vi hoàn chỉnh của bot từ tin nhắn đến phản hồi, bao gồm bộ đếm thời gian và trường hợp biên](/images/luna-protocol/22-complete-lifecycle.svg)

## Sơ đồ kiến trúc

Thư mục `state-machines/` chứa **24 sơ đồ Mermaid** bao phủ toàn bộ mã nguồn. Mỗi sơ đồ có giải thích chi tiết bằng ngôn ngữ tự nhiên.

Trong số quan trọng nhất:

| # | Sơ đồ | Loại |
|---|-----------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (hoàn chỉnh) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 backend) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

Các sơ đồ này là mỏ vàng để hiểu luồng hoàn chỉnh: từ tin nhắn đến phản hồi, bao gồm bộ đếm thời gian và trường hợp biên.

---

## Mã kích hoạt chi tiết

Kích hoạt được đánh giá bởi `evaluateMessage()` trong `state/trigger.ts`. Đây là logic hoàn chỉnh:

```typescript
export function evaluateMessage(
  message: Eris.Message, botId: string, botUsername: string, isFollowUp = false
): TriggerResult {
  if (message.author.bot) return { shouldRespond: false, reason: null, botName: "" };
  if (message.content === "-stop") return { shouldRespond: true, reason: "stop", botName: "" };
  if (message.content === "-start") return { shouldRespond: true, reason: "start", botName: "" };
  if (message.content === "-clear") return { shouldRespond: true, reason: "clear", botName: "" };

  const isMentioned = message.mentions.some((u) => u.id === botId);
  if (isMentioned) return { shouldRespond: true, reason: "mention", botName };
  if (!message.guildID) return { shouldRespond: true, reason: "dm", botName };
  if (isPaused()) return { shouldRespond: false, reason: null, botName: "" };
  if (isOnCooldown(channelId)) return { shouldRespond: false, reason: null, botName };

  // ... khớp theo tên, từ khóa, phản hồi tiếp theo, ngẫu nhiên
}
```

Bộ nhớ đệm regex (`hasWordCache`) tránh biên dịch lại các mẫu tại mỗi tin nhắn.

---

## Phản hồi

Luna phản hồi tin nhắn bằng emoji. 30% xác suất sử dụng emoji tùy chỉnh của máy chủ, 70% emoji unicode. Phản hồi được kích hoạt sau độ trễ tập trung, không phải ngay lập tức.

Các lệnh phản hồi trên tin nhắn của Luna:
- ❌ -> Dừng
- ▶️ -> Bắt đầu
- 🗑️ -> Xóa

---

## Kiểu phản hồi

Kiểu phản hồi được tính trọng số theo hoạt động gần đây của Luna trong kênh:

| Ngữ cảnh | messageReference | mentionRepliedUser | Trọng số |
|----------|-----------------|-------------------|-------|
| Lạnh | true | false | 70% |
| Lạnh | true | true | 20% |
| Lạnh | false | false | 10% |
| Hoạt động | true | false | 50% |
| Hoạt động | true | true | 15% |
| Hoạt động | false | false | 30% |
| Hoạt động | false | true | 5% |

Trong tin nhắn riêng, `messageReference` luôn là `false`.

---

## Tin nhắn burst

Với 15% xác suất, một phản hồi được chia thành 2-3 mảnh gửi theo nhịp người (1.5-4 giây giữa mỗi mảnh). Mô phỏng người nào đó gõ nhiều lần.

![Timing Gantt -- thời gian chờ thực tế cho delay, phản hồi, streaming LLM và sửa lỗi](/images/luna-protocol/21-timing-gantt.svg)

---

## Trạng thái động

Trạng thái Discord của Luna luân phiên giữa các preset được cấu hình, quay mỗi 15 phút. Các loại được hỗ trợ: Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). Trong giấc ngủ, trạng thái chuyển sang `invisible`.

```yaml
dynamic_status_presets:
  - status: online
    text: "với các pixel"
    type: 0       # Playing
  - status: idle
    text: "tiếng ồn trắng"
    type: 2       # Listening
```

Jitter ngẫu nhiên (x0.5-1.0) tránh các lượt quay có thể dự đoán. 10% các lần thử bị bỏ qua để tránh lặp lại.

## Chỉ báo đang gõ

Trước khi gọi LLM, Luna gọi `startTyping()`. `setInterval` làm mới chỉ báo mỗi 8 giây trong quá trình tạo. Được dọn dẹp trong `finally` (`clearInterval`).

```typescript
const startTyping = () => {
  client.sendChannelTyping(message.channel.id);
  typingIntervals.set(
    message.channel.id,
    setInterval(() => {
      client.sendChannelTyping(message.channel.id);
    }, 8000)
  );
};
```

## Khôi phục sau crash

Nếu LLM crash (tiến trình `llama-server` bị dừng), Luna phát hiện sự kiện qua `llmBus.emit("crash", code)` và thử khởi động lại với backoff mũ. Tránh các vòng lặp khởi động lại vô hạn.

## Tham số LLM

Các tham số được hardcode trong `src/config.ts`:

```yaml
temp: 0.75
dynatemp-range: 0.15
top-k: 40
top-p: 0.95
min-p: 0.05
repeat-penalty: 1.12
repeat-last-n: 256
presence-penalty: 0.1
batch: 4096
ubatch: 256
context: 4096
```

Mẫu ChatML được sử dụng. Số lượng thread được tự động phát hiện qua `os.cpus().length`.

---

## Bắt đầu

```bash
npm install
cp config.example.yml config.yml
# chỉnh sửa config.yml
npm run dev                    # dev (hot reload)
npm run build && npm start     # production
```

| Script | Mô tả |
|--------|-------------|
| `build` | Bundle CLI tự động |
| `start` | Khởi chạy bot |
| `lint` / `format` / `check` | Biome |
| `test` | Tests (Bun) |
| `download-model` | GGUF từ HuggingFace |
| `diagrams` | Xuất sơ đồ Mermaid ra SVG/PNG |

### Triển khai PM2

```bash
./start.sh   # khởi chạy llm-server + llm-client dưới PM2
```

---

## Kết luận

Luna Protocol không chỉ là một bot Discord với LLM. Đó là một **hệ thống hành vi hoàn chỉnh** mô phỏng các khiếm khuyết con người: sự quên lãng, lỗi đánh máy, giấc ngủ, do dự, mệt mỏi. Tất cả được kiến trúc xoay quanh một bus sự kiện được đánh kiểu, với 24 sơ đồ Mermaid tài liệu hóa từng luồng.

Mã nguồn là open source, tập dữ liệu là công khai, và cấu hình có thể tải lại nóng. Nếu chủ đề này quan tâm bạn, hãy xem mã nguồn -- nó dễ tiếp cận hơn bạn tưởng.

| Tài nguyên | Liên kết |
|-----------|------|
| GitHub Repository | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
