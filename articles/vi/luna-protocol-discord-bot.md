---
title: "Luna Protocol : tôi đã tạo bot Discord tự chủ mô phỏng con người"
description: "Luna Protocol là bot Discord hoàn toàn tự chủ chạy LLM cục bộ, có khả năng trò chuyện tự nhiên với giấc ngủ, lỗi gõ phím, ngập ngừng, quên lãng, mệt mỏi chủ đề và tin nhắn tự phát."
date: 2026-07-11
tags:
  - discord
  - llm
  - typescript
  - event-driven-architecture
  - ai
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "D3kLRPzq3tU/5aeZq5C/f+UHy1YcAWI7Y/2NMku3BBaKDjQgm3a89CBTZZNiq12WMYKvrV3qoaTc7Otmj9fAvA=="
---

# Luna Protocol : tôi đã tạo bot Discord tự chủ mô phỏng con người

Và nếu một bot Discord có thể **ngủ**, mắc **lỗi gõ phím**, **ngập ngừng**, **quên** trả lời, và thỉnh thoảng tự gửi cho bạn tin nhắn theo ý nó? Đó chính xác là điều **Luna Protocol** làm : một bot Discord hoàn toàn tự chủ chạy LLM cục bộ (llama.cpp) và trò chuyện như con người không hoàn hảo.

Luna chạy với kích hoạt theo ngữ cảnh và sự không hoàn hảo có chủ ý. Cô ấy có **hệ thống kích hoạt ưu tiên**, **độ trễ thay đổi**, **giờ ngủ**, **tin nhắn tự phát**, và cả **pipeline TTS** để gửi tin nhắn thoại. Tất cả cấu hình qua một tệp `config.yml` hot-reload đơn giản.

Trong bài này, tôi mổ xẻ kiến trúc đầy đủ : từ bus sự kiện generic tới pipeline TTS, qua hệ thống kích hoạt, thành phần con người, và dataset fine-tuning.

![Architecture Overview -- thành phần toàn cục và luồng dữ liệu](/images/luna-protocol/01-architecture-overview.svg)

---

## Kiến trúc : bus sự kiện có kiểu

Lõi của Luna là **TypedBus** : bus sự kiện generic gõ kiểu mạnh bằng TypeScript. Đó là viên gạch nền mọi thứ dựa lên. Tôi xây nó như vậy vì muốn tránh phụ thuộc vòng ngay từ đầu.

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

Hai bus chính từ đó ra :

- **`llmBus`** : quản lý token LLM, lỗi, crash, reset
- **`stateBus`** : quản lý thay đổi trạng thái với bền vững tự động

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

Lợi thế của cách này : mỗi module **tách rời** khỏi phần còn lại. LLM phát token lên bus, bot tiêu thụ, state tự cập nhật. Không phụ thuộc vòng.

---

![Message Processing -- luồng xử lý đầy đủ của một tin nhắn](/images/luna-protocol/02-message-processing.svg)

## Hệ thống kích hoạt : ai quyết khi nào Luna trả lời?

Mỗi tin nhắn tới được đánh giá bởi `evaluateMessage()` trả về `TriggerResult` với lý do kích hoạt. Thứ tự ưu tiên then chốt :

| # | Lý do | Điều kiện | Bỏ qua ignore | Bỏ qua pause |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | Có (0%) | Có |
| 2 | `dm` | MP với `replyInDM = true` | Có (0%) | Không |
| 3 | `name` | "Luna"/"Pixie"/alias (từ nguyên) | Không (8%) | Không |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (từ nguyên) | Không (8%) | Không |
| 5 | `follow-up` | Bot là người nói cuối + < 15s + < 3 / 60s | -- | -- |
| 6 | `random` | 1.5% cơ hội trên tin nhắn không khớp | Không (8%) | Không |

Khớp là **từ nguyên** (`\b`) : "ai" không khớp "mais", "vrai", "lait".

![Trigger evaluation -- quyết định đầu vào cho mỗi tin nhắn](/images/luna-protocol/03-trigger-evaluation.svg)

### Cơ chế follow-up

Khi Luna trả lời tin nhắn, cô ấy đăng ký mình là `lastSpeaker`. Mọi tin nhắn tiếp theo trong 15 giây kích hoạt phản hồi **ngay**, bỏ qua timer và kiểm tra keyword. Ngân sách : 3 follow-up cho mỗi cửa sổ 60 giây.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### Cooldown

8 giây giữa hai phản hồi trong cùng kênh. Bị mention và follow-up bỏ qua.

---

## Hành vi con người : độ tập trung thay đổi

Đây là lúc Luna thành thú vị. Mỗi kiểu kích hoạt có **ngưỡng tập trung** riêng : độ trễ min/max, cơ hội bỏ qua, và cơ hội phản ứng.

| Trigger | Trễ min | Trễ max | Bỏ qua | Phản ứng |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

Phép tính trễ còn xét :
- **Độ dài tin nhắn** : tin nhắn càng dài, Luna càng mất thời gian "đọc"
- **Không hoạt động** : nếu Luna không hoạt động 10 phút, trễ nhân 2 (mô phỏng "tỉnh dậy")
- **Giấc ngủ** : ở chế độ `slow`, trễ nhân 3 tới 5

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

## Giờ ngủ

Luna có thể ngủ. Cấu hình qua `config.yml` :

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
| `sleep` | Chỉ mention và MP qua được |
| `slow` | Trễ ×3-5, phản ứng gần như không |
| `short` | Cơ hội bỏ qua +30%, phản ứng gần như không |

Trong giờ ngủ, trạng thái Discord chuyển sang `invisible`.

---

## Lỗi gõ phím

Luna có thể mắc lỗi gõ phím, sửa sau 2-4 giây. Layout bàn phím cấu hình được (AZERTY hay QWERTY). Tôi để cấu hình được vì bạn nhận ra ngay bot nào viết quá sạch.

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... mọi phím kề nhau
};
```

Ví dụ AZERTY : `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`.

Ba kiểu sửa :

| Kiểu | Hành vi |
|-------|-------------|
| `edit` | Sửa tin nhắn |
| `message` | Tin nhắn mới : `word*` |
| `mixed` | 50/50 ngẫu nhiên (mặc định) |

---

## Ngập ngừng và quên lãng

**Ngập ngừng** : 15% cơ hội mở đầu bằng từ đệm (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**Quên lãng** : ngay cả khi đã khớp trigger, Luna có thể "quên" trả lời với xác suất 3%. Cô ấy khi đó im lặng hoàn toàn, như thể chẳng thấy gì. Tôi mê hành vi này vì bạn từng thấy con người lỡ tin nhắn mà không cố ý.

**Mệt mỏi chủ đề** : nếu một từ quay lại quá thường trong 10 tin nhắn cuối (ngưỡng : 3 lần xuất hiện), độ trễ nhân lên và cơ hội bỏ qua tăng 15%.

---

## Hiện thực trong thực hành : khi nó thành rợn

Trên giấy tờ, mọi hệ thống này (trễ, lỗi gõ phím, ngập ngừng, quên lãng) trông như đồ chơi. Thực tế, đặt cạnh nhau, kết quả gây choáng : người trò chuyện với Luna không hề nghi ngờ. Đây là cuộc trao đổi thật nơi ai đó hỏi thẳng Luna có phải bot không, và cuộc trò chuyện sau đó trôi sang chủ đề hoàn toàn khác, với tự nhiên lạnh sống lưng. Tôi không ngờ nó đáng tin tới vậy trong điều kiện thật.

![Trò chuyện Discord với Luna -- cuộc trao đổi đầu](/images/luna-protocol/realism/realism-01.png)

Giọng, ngập ngừng, nhịp phản hồi : không gì tố cáo bot. Luna lảng câu hỏi tuổi mà không bao giờ phá vai.

![Trò chuyện Discord với Luna -- tiếp cuộc trao đổi](/images/luna-protocol/realism/realism-02.png)

Cuộc trò chuyện tiếp tục hoàn toàn trôi chảy, với phản hồi ngắn tự nhiên ("okay, okay", "yay", "yayy") : đúng kiểu tin nhắn con người gửi trên Discord.

![Trò chuyện Discord với Luna -- trôi chủ đề](/images/luna-protocol/realism/realism-03.png)

![Trò chuyện Discord với Luna -- tiếp đoạn trôi](/images/luna-protocol/realism/realism-04.png)

![Trò chuyện Discord với Luna -- cuối cuộc trao đổi](/images/luna-protocol/realism/realism-05.png)

Điều đáng sợ không chỉ là Luna "trả lời" : mà là cô ấy **giữ được cuộc trò chuyện**, với ý kiến bề ngoài, câu gợi, mạch suy nghĩ mạch lạc từ tin nhắn này sang tin khác. Không có hệ thống kích hoạt, trễ tập trung và ngập ngừng mô tả ở trên, ảo giác này sẽ sụp trong vài tin nhắn.

**Plot twist nhỏ** : trong các screenshot trên, **cả hai tài khoản đang nói chuyện đều là instance của Luna**. `PixieGlow` và `Sujet d'SBlow` không phải con người đang test bot : đó là hai bot nói chuyện với nhau, mỗi bên tin (theo nghĩa hành vi) mình đang bàn với ai đó "bình thường". Nếu khi đọc cuộc trao đổi trên bạn cho rằng một trong hai bên là con người, chúc mừng : bạn vừa sập bẫy đúng như bất kỳ ai trên máy chủ Discord thật.

Đó hơi là **thuyết internet chết** phiên bản thực hành : thuyết này (gốc hơi thuyết âm mưu) cho rằng phần ngày càng lớn của nội dung và tương tác trực tuyến do bot tạo ra thay vì con người, tới mức internet con người "thật" thành thiểu số. Lâu nay bị coi là phóng đại, nó ngày càng bớt phi lý khi các hệ thống như Luna Protocol cho thấy không cần nhiều phương tiện hay mô hình khổng lồ để mô phỏng sự hiện diện con người đáng tin ở quy mô lớn. Hai instance của cùng bot có thể giữ cuộc trò chuyện dài mà không bao giờ tự tố, điều đó cho cái nhìn khá cụ thể về web đông bot nói chuyện với nhau trông sẽ ra sao.

---

## Pipeline LLM : hai chế độ

### Chế độ `direct` (mặc định)

Bot gửi thẳng yêu cầu tới `llama-server` cục bộ qua HTTP. Mô hình dùng chung, với prompt cache và 4 slot đồng thời. Hai tiến trình PM2 : máy chủ LLM và client bot.

### Chế độ `online`

Bot gọi bất kỳ API tương thích OpenAI nào (OpenAI, OpenRouter, Groq, Together...). Bạn chỉ cần khóa API, LLM chạy phía nhà cung cấp.

### Streaming thời gian thực

LLM stream phản hồi từng dòng (`\n`). Mỗi dòng cắt thành từ, phát từng từ lên `llmBus.emit("token", word)`. Mỗi `\n`, sự kiện `flush` được phát : bot gửi ngay tin nhắn tích lũy. Nhịp theo đúng nhịp LLM.

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

Hàng đợi (`requestQueue`) xử lý yêu cầu từng cái, với dọn tự động khi hàng đợi vượt 100 phần tử.

---

## Tin nhắn tự phát

Mỗi 5 phút, 12% cơ hội Luna đăng tin nhắn theo ý mình. Máy chủ được chọn bằng hệ thống **trọng số tuyến tính** : máy chủ hoạt động nhất có cơ hội gấp N× máy cuối.

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

Ngữ cảnh 5 tin nhắn cuối được đọc, và Luna nhập cuộc "tự nhiên".

---

## Pipeline TTS : tin nhắn thoại

Với 8% cơ hội, Luna gửi tin nhắn thoại thay vì văn bản. Pipeline đầy đủ :

1. **Piper TTS** tổng hợp văn bản thành WAV
2. **ffmpeg** đổi sang OGG
3. Waveform được tính cho xem trước Discord
4. Tệp được tải lên qua API Discord CDN
5. Tin nhắn thoại được gửi

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

![TTS Pipeline -- từ văn bản tổng hợp tới tin nhắn thoại Discord](/images/luna-protocol/10-tts-pipeline.svg)

---

## Chống spam và bền vững

### Chống spam

Hàng đợi cho mỗi `channelId:userId`. Một tin nhắn trong hàng cho mỗi người dùng mỗi kênh. Xử lý ngay khi phản hồi đang chạy xong.

### Giới hạn phiên

Sau 8 lượt trao đổi, Luna nghỉ 30 giây. Bộ đếm reset sau 3 phút không hoạt động.

### Bền vững tự động

Mỗi đột biến trạng thái phát lên `stateBus` → lưu tự động (debounce 500ms). Không cần gọi `saveAllState()` tay nữa. Trạng thái bền vững gồm : pendingMessages, paused, cooldown, timestamp, lastSpeaker, bộ đếm follow-up.

---

## Cấu hình hot-reload

Một tệp `config.yml` duy nhất. Hầu hết giá trị **hot-reload** : thay đổi có hiệu lực không cần khởi động lại. Tôi muốn chỉnh trễ trực tiếp, không cắt cuộc trò chuyện đang diễn ra.

| Danh mục | Hot-reload |
|-----------|-----------|
| Trigger, keyword, tên | ✅ |
| Tập trung, trễ | ✅ |
| Typo, burst, mệt mỏi | ✅ |
| Lịch ngủ | ✅ |
| TTS, tin nhắn thoại | ✅ |
| Token Discord, chế độ LLM | ❌ (đòi khởi động lại) |

```typescript
// config.ts -- getter trả về giá trị trực tiếp
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## Dataset : Discord-Dialogues

Mô hình được fine-tune trên [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) : **7.3M lượt trao đổi**, **17M lượt**, **140M từ**. Hội thoại Discord thật xuân-hè 2025, đã lọc (PII, ToS, bot, lệnh). Apache 2.0.

| Chỉ số | Giá trị |
|----------|--------|
| Mẫu | 7 303 464 |
| Tổng lượt | 16 881 010 |
| Tổng từ | 139 922 950 |
| Token trung bình | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

Mô hình lượng tử dùng là GGUF (ví dụ `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Phân bố dataset Discord-Dialogues](/images/luna-protocol/dataset-distribution.svg)

---

![Complete Lifecycle -- hành vi đầy đủ của bot từ tin nhắn tới phản hồi, gồm timer và trường hợp biên](/images/luna-protocol/22-complete-lifecycle.svg)

## Sơ đồ kiến trúc

Thư mục `state-machines/` chứa **24 sơ đồ Mermaid** phủ toàn bộ mã nguồn. Mỗi sơ đồ có giải thích chi tiết bằng ngôn ngữ con người.

Trong các sơ đồ quan trọng nhất :

| # | Sơ đồ | Kiểu |
|---|-----------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (đầy đủ) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 backend) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

Các sơ đồ này là mỏ vàng để hiểu luồng đầy đủ : từ tin nhắn tới tới phản hồi, qua timer và trường hợp biên.

---

## Mã kích hoạt chi tiết

Trigger được đánh giá bởi `evaluateMessage()` trong `state/trigger.ts`. Đây là logic đầy đủ :

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
  if (isPaused()) return { shouldRespond: false, reason: null, botName };
  if (isOnCooldown(channelId)) return { shouldRespond: false, reason: null, botName };

  // ... khớp theo tên, keyword, follow-up, random
}
```

Cache regex (`hasWordCache`) tránh biên dịch lại pattern mỗi tin nhắn.

---

## Phản ứng

Luna phản ứng tin nhắn bằng emoji. 30% cơ hội dùng emoji custom của máy chủ, 70% emoji unicode. Phản ứng đi sau trễ tập trung, với cùng nhịp lệch như phản hồi. Tôi thích độ lệch này vì bạn cảm thấy cô ấy đã dành thời gian đọc.

Lệnh bằng phản ứng trên tin nhắn của Luna :
- ❌ → Stop
- ▶️ → Start
- 🗑️ → Clear

---

## Kiểu phản hồi

Kiểu phản hồi có trọng số theo hoạt động gần đây của Luna trong kênh :

| Ngữ cảnh | messageReference | mentionRepliedUser | Trọng số |
|----------|-----------------|-------------------|-------|
| Lạnh | true | false | 70% |
| Lạnh | true | true | 20% |
| Lạnh | false | false | 10% |
| Nóng | true | false | 50% |
| Nóng | true | true | 15% |
| Nóng | false | false | 30% |
| Nóng | false | true | 5% |

Trong MP, `messageReference` luôn `false`.

---

## Tin nhắn chùm

Với 15% cơ hội, phản hồi bị cắt thành 2-3 mảnh gửi theo nhịp con người (1.5-4 giây giữa mỗi mảnh). Mô phỏng người gõ nhiều lần.

![Timing Gantt -- thời gian chờ thật cho trễ, phản ứng, streaming LLM và sửa lỗi](/images/luna-protocol/21-timing-gantt.svg)

---

## Trạng thái động

Trạng thái Discord của Luna luân phiên giữa nhiều preset cấu hình, xoay mỗi 15 phút. Các kiểu hỗ trợ : Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). Trong lúc ngủ, trạng thái chuyển sang `invisible`.

```yaml
dynamic_status_presets:
  - status: online
    text: "với các pixel"
    type: 0       # Playing
  - status: idle
    text: "tiếng ồn trắng"
    type: 2       # Listening
```

Jitter ngẫu nhiên (×0.5-1.0) tránh xoay đoán được. 10% lần thử bị bỏ để tránh lặp.

## Chỉ báo đang gõ

Trước khi gọi LLM, Luna gọi `startTyping()`. `setInterval` làm mới chỉ báo mỗi 8 giây trong lúc sinh. Dọn trong `finally` (`clearInterval`).

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

## Phục hồi sau crash

Nếu LLM crash (tiến trình `llama-server` chết), Luna phát hiện sự kiện qua `llmBus.emit("crash", code)` và thử khởi động lại với backoff lũy thừa. Tránh vòng khởi động lại vô hạn.

## Tham số LLM

Tham số ghi cứng trong `src/config.ts` :

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

Mẫu ChatML (`<|im_start|>/<|im_end|>`) được dùng. Số luồng tự phát hiện qua `os.cpus().length`.

---

## Cài đặt

```bash
npm install
cp config.example.yml config.yml
# sửa config.yml
npm run dev                    # dev (hot reload)
npm run build && npm start     # production
```

| Script | Mô tả |
|--------|-------------|
| `build` | Bundle CLI độc lập |
| `start` | Chạy bot |
| `lint` / `format` / `check` | Biome |
| `test` | Test (Bun) |
| `download-model` | GGUF từ HuggingFace |
| `diagrams` | Xuất sơ đồ Mermaid sang SVG/PNG |

### Triển khai PM2

```bash
./start.sh   # chạy llm-server + llm-client dưới PM2
```

---

## Kết luận

Luna Protocol đi xa hơn bot Discord gắn LLM. Đó là **hệ thống hành vi đầy đủ** mô phỏng sự không hoàn hảo con người : quên lãng, lỗi gõ phím, giấc ngủ, ngập ngừng, mệt mỏi. Tất cả kiến trúc quanh bus sự kiện có kiểu, với 24 sơ đồ Mermaid ghi lại mỗi luồng.

Mã open source, dataset công khai, và cấu hình hot-reload. Nếu chủ đề khiến bạn hứng thú, hãy lặn vào mã : nó dễ tiếp cận hơn vẻ ngoài. Tôi đã dùng nó làm nền để thử nhiều ý tưởng về hành vi, và bạn có thể lấy lại từng module riêng.

| Tài nguyên | Link |
|-----------|------|
| Repo GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
