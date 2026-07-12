---
title: "Luna Protocol: tôi đã tạo một bot Discord tự động mô phỏng con người"
description: "Luna Protocol là một bot Discord hoàn toàn tự động với LLM cục bộ, có khả năng trò chuyện tự nhiên với giấc ngủ, lỗi gõ, ngập ngừng, quên, mệt mỏi chủ đề và tin nhắn tự phát."
date: 2026-07-11
tags:
  - discord-bot
  - llm
  - typescript
  - event-architecture
  - ai
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "GzW8oPf0+9k++D52y1GlHq1rRX6f2OrhfVOMyL6opUDSBCo8GdUiflrO4v68Uh7ku278EkCoaPbO3UF9EFRWRQ=="
---

# Luna Protocol: tôi đã tạo một bot Discord tự động mô phỏng con người

Sẽ thế nào nếu một bot Discord có thể **ngủ**, **gõ sai chính tả**, **ngập ngừng**, **quên** trả lời, và đôi khi tự ý gửi cho bạn một tin nhắn? Đó chính xác là những gì **Luna Protocol** làm: một bot Discord hoàn toàn tự động chạy LLM cục bộ (llama.cpp) và trò chuyện như một con người không hoàn hảo.

Không có prompt cứng nhắc, không có câu trả lời robot. Luna có **hệ thống kích hoạt ưu tiên**, **độ trễ thay đổi**, **lịch ngủ**, **tin nhắn tự phát**, và thậm chí là **đường dẫn TTS** để gửi tin nhắn thoại. Tất cả được cấu hình qua một tệp `config.yml` duy nhất có thể tải lại nóng.

Trong bài viết này, chúng ta sẽ phân tích toàn bộ kiến trúc: từ bus sự kiện tổng quát đến đường dẫn TTS, qua hệ thống kích hoạt, các thành phần mô phỏng con người, và bộ dữ liệu fine-tuning.

![Tổng quan kiến trúc -- các thành phần toàn cục và luồng dữ liệu](/images/luna-protocol/01-architecture-overview.svg)

---

## Kiến trúc: một bus sự kiện được định kiểu

Cốt lõi của Luna là một **TypedBus** -- một bus sự kiện tổng quát được định kiểu mạnh trong TypeScript. Đây là viên gạch nền tảng cho mọi thứ.

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

Hai bus chính được dẫn xuất từ đó:

- **`llmBus`** -- quản lý token LLM, lỗi, crash, reset
- **`stateBus`** -- quản lý các thay đổi trạng thái với tính năng tự động lưu

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

Lợi ích của cách tiếp cận này: mỗi module **được tách rời** khỏi phần còn lại. LLM phát token lên bus, bot tiêu thụ chúng, trạng thái tự động cập nhật. Không có phụ thuộc vòng tròn.

---

![Xử lý tin nhắn -- luồng hoàn chỉnh xử lý một tin nhắn](/images/luna-protocol/02-message-processing.svg)

## Hệ thống kích hoạt: ai quyết định khi nào Luna trả lời?

Mỗi tin nhắn đến được đánh giá bởi `evaluateMessage()` trả về một `TriggerResult` với lý do kích hoạt. Thứ tự ưu tiên rất quan trọng:

| # | Lý do | Điều kiện | Bỏ qua ignore | Bỏ qua pause |
|---|---|---|---|---|
| 1 | `mention` | @bot | Có (0%) | Có |
| 2 | `dm` | DM với `replyInDM = true` | Có (0%) | Không |
| 3 | `name` | "Luna"/"Pixie"/biệt danh (nguyên từ) | Không (8%) | Không |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (nguyên từ) | Không (8%) | Không |
| 5 | `follow-up` | Bot là người nói cuối + < 15s + < 3 / 60s | -- | -- |
| 6 | `random` | 1.5% cơ hội trên các tin nhắn không khớp | Không (8%) | Không |

Việc so khớp là **nguyên từ** (`\b`): "ai" không khớp với "mai", "trai", "bài".

![Đánh giá kích hoạt -- quyết định đầu vào cho mỗi tin nhắn](/images/luna-protocol/03-trigger-evaluation.svg)

### Cơ chế follow-up

Khi Luna trả lời một tin nhắn, cô ấy đăng ký là `lastSpeaker`. Bất kỳ tin nhắn nào tiếp theo trong vòng 15 giây sẽ kích hoạt phản hồi **ngay lập tức** -- không có timer, không kiểm tra keyword. Ngân sách: 3 follow-up mỗi cửa sổ 60 giây.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### Cooldown

8 giây giữa hai phản hồi trong cùng một kênh. Bị vượt qua bởi mention và follow-up.

---

## Các hành vi mô phỏng con người: sự tập trung thay đổi

Đây là lúc Luna trở nên thú vị. Mỗi loại kích hoạt có **ngưỡng tập trung** riêng: độ trễ min/max, cơ hội bỏ qua, và cơ hội phản ứng.

| Kích hoạt | Trễ min | Trễ max | Bỏ qua | Phản ứng |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

Việc tính độ trễ cũng tính đến:
- **Độ dài tin nhắn**: tin nhắn càng dài, Luna càng mất nhiều thời gian để "đọc"
- **Sự không hoạt động**: nếu Luna không hoạt động trong 10 phút, độ trễ được nhân với 2 (mô phỏng "thức dậy")
- **Giấc ngủ**: ở chế độ `slow`, độ trễ được nhân với 3 đến 5

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
  delay *= 0.5 + Math.random() * 1.5; // jitter agressif
  return delay;
}
```

---

## Lịch ngủ

Luna có thể ngủ. Có thể cấu hình qua `config.yml`:

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
| `sleep` | Chỉ mention và DM được xử lý |
| `slow` | Trễ x3-5, phản ứng gần như bằng không |
| `short` | Cơ hội bỏ qua +30%, phản ứng gần như bằng không |

Trong giờ ngủ, trạng thái Discord chuyển thành `invisible`.

---

## Lỗi gõ

Luna có thể gõ sai chính tả -- và sửa sau 2-4 giây. Bố cục bàn phím có thể cấu hình (AZERTY hoặc QWERTY).

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... tất cả các phím kề nhau
};
```

Ví dụ AZERTY: `bonjour -> bonjpur`, `salut -> slaut`, `comment -> cpmment`.

Ba kiểu sửa lỗi:

| Kiểu | Hành vi |
|-------|-------------|
| `edit` | Sửa tin nhắn |
| `message` | Tin nhắn mới: `word*` |
| `mixed` | 50/50 ngẫu nhiên (mặc định) |

---

## Ngập ngừng và quên

**Ngập ngừng**: 15% cơ hội bắt đầu bằng một từ đệm (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**Quên**: ngay cả sau khi khớp kích hoạt, Luna có thể "quên" trả lời với xác suất 3%. Không có tin nhắn, không có phản ứng -- như thể cô ấy không thấy gì.

**Mệt mỏi chủ đề**: nếu một từ xuất hiện quá thường xuyên trong 10 tin nhắn gần nhất (ngưỡng: 3 lần), độ trễ được nhân lên và cơ hội bỏ qua tăng 15%.

---

## Tính chân thực trong thực tế: khi nó trở nên rùng rợn

Trên lý thuyết, tất cả các cơ chế này (độ trễ, lỗi gõ phím, ngập ngừng, hay quên) nghe có vẻ chỉ là chiêu trò. Nhưng trong thực tế, khi kết hợp lại, kết quả thật đáng kinh ngạc -- đến mức người trò chuyện với Luna không hề nghi ngờ gì. Đây là một đoạn hội thoại thật, nơi ai đó hỏi thẳng Luna có phải là bot không, rồi cuộc trò chuyện chuyển sang một chủ đề hoàn toàn khác với sự tự nhiên đến rùng mình.

![Cuộc trò chuyện Discord với Luna -- đoạn đầu](/images/luna-protocol/realism/realism-01.png)

Giọng điệu, sự ngập ngừng, nhịp độ trả lời -- không có gì tố cáo đây là bot. Luna né tránh câu hỏi về tuổi mà không hề lộ vai.

Cuộc trò chuyện tiếp tục trôi chảy tự nhiên, với những câu trả lời ngắn, rất con người ("okay, okay", "yay", "yayy") -- đúng kiểu tin nhắn mà một người thật sẽ gửi trên Discord.

![Cuộc trò chuyện Discord với Luna -- tiếp theo](/images/luna-protocol/realism/realism-02.png)

![Cuộc trò chuyện Discord với Luna -- chuyển chủ đề](/images/luna-protocol/realism/realism-03.png)

![Cuộc trò chuyện Discord với Luna -- chủ đề tiếp tục trôi](/images/luna-protocol/realism/realism-04.png)

![Cuộc trò chuyện Discord với Luna -- kết thúc đoạn hội thoại](/images/luna-protocol/realism/realism-05.png)

Điều đáng sợ không chỉ là việc Luna "trả lời" -- mà là cô ấy **duy trì cả một cuộc trò chuyện**, với những ý kiến có vẻ thật, những câu nối tiếp, và một mạch suy nghĩ nhất quán từ tin nhắn này sang tin nhắn khác. Nếu không có hệ thống kích hoạt, độ trễ tập trung và sự ngập ngừng đã mô tả ở trên, ảo giác này sẽ sụp đổ chỉ sau vài tin nhắn.

**Cú twist nhỏ**: trong các ảnh chụp màn hình ở trên, **cả hai tài khoản đang trò chuyện đều là các instance của Luna**. `PixieGlow` và `Sujet d'SBlow` không phải là một người thật đang thử nghiệm bot -- đó là hai con bot nói chuyện với nhau, mỗi con (theo nghĩa hành vi) đều "tin chắc" rằng mình đang nói chuyện với ai đó "bình thường". Nếu khi đọc đoạn hội thoại trên bạn nghĩ rằng một trong hai là người thật, xin chúc mừng -- bạn vừa mắc bẫy y hệt như bất kỳ ai trên một server Discord thật.

Đây gần như là phiên bản thực tế của **thuyết internet chết** (dead internet theory): lý thuyết này (vốn ban đầu khá thiên về thuyết âm mưu) cho rằng một phần ngày càng lớn nội dung và tương tác trên mạng được tạo ra bởi bot chứ không phải con người, đến mức internet "thật" của con người trở thành thiểu số. Từng bị coi là phóng đại, thuyết này ngày càng bớt vô lý khi các hệ thống như Luna Protocol cho thấy không cần nhiều tài nguyên hay một mô hình khổng lồ để mô phỏng sự hiện diện của con người một cách đáng tin cậy trên quy mô lớn. Hai instance của cùng một con bot có thể duy trì một cuộc trò chuyện dài mà không hề để lộ bản thân, đó là một hình dung khá cụ thể về việc một mạng internet chủ yếu gồm các bot nói chuyện với nhau sẽ trông như thế nào.

---

## Đường dẫn LLM: hai chế độ

### Chế độ `direct` (mặc định)

Bot gửi trực tiếp yêu cầu đến `llama-server` cục bộ qua HTTP. Mô hình được chia sẻ, với prompt cache và 4 slot đồng thời. Hai tiến trình PM2: máy chủ LLM và client bot.

### Chế độ `online`

Bot gọi bất kỳ API nào tương thích với OpenAI (OpenAI, OpenRouter, Groq, Together...). Không cần LLM cục bộ.

### Truyền phát thời gian thực

LLM truyền phát phản hồi từng dòng (`\n`). Mỗi dòng được tách thành các từ, phát từng từ một trên `llmBus.emit("token", word)`. Ở mỗi `\n`, một sự kiện `flush` được phát -- bot ngay lập tức gửi tin nhắn đã tích lũy. Không có độ trễ mô phỏng: nhịp độ là của LLM.

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

Hàng đợi (`requestQueue`) xử lý các yêu cầu từng cái một, với tự động dọn dẹp khi hàng đợi vượt quá 100 phần tử.

---

## Tin nhắn tự phát

Cứ mỗi 5 phút, 12% cơ hội Luna tự ý đăng một tin nhắn. Máy chủ được chọn bằng hệ thống **trọng số tuyến tính**: máy chủ hoạt động nhiều nhất có Nx cơ hội so với máy chủ cuối cùng.

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

Bối cảnh của 5 tin nhắn gần nhất được đọc, và Luna tham gia cuộc trò chuyện "một cách tự nhiên".

---

## Đường dẫn TTS: tin nhắn thoại

Với 8% cơ hội, Luna gửi tin nhắn thoại thay vì văn bản. Đường dẫn hoàn chỉnh:

1. **Piper TTS** tổng hợp văn bản thành WAV
2. **ffmpeg** chuyển đổi thành OGG
3. Dạng sóng được tính toán để xem trước Discord
4. Tệp được tải lên qua API Discord CDN
5. Tin nhắn thoại được gửi đi

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

![Đường dẫn TTS -- từ văn bản tổng hợp đến tin nhắn thoại Discord](/images/luna-protocol/10-tts-pipeline.svg)

---

## Chống spam và lưu trữ

### Chống spam

Hàng đợi theo `channelId:userId`. Chỉ một tin nhắn trong hàng đợi mỗi người dùng mỗi kênh. Được xử lý ngay khi phản hồi hiện tại kết thúc.

### Giới hạn phiên

Sau 8 lượt trao đổi, Luna tạm nghỉ 30 giây. Bộ đếm được đặt lại sau 3 phút không hoạt động.

### Tự động lưu

Mỗi thay đổi trạng thái phát trên `stateBus` -> tự động lưu (debounce 500ms). Không cần gọi `saveAllState()` thủ công nữa. Trạng thái được lưu bao gồm: pendingMessages, paused, cooldowns, timestamps, lastSpeaker, bộ đếm follow-up.

---

## Cấu hình tải lại nóng

Một tệp `config.yml` duy nhất. Hầu hết các giá trị đều có thể **tải lại nóng** -- các thay đổi được áp dụng mà không cần khởi động lại.

| Danh mục | Tải lại nóng |
|-----------|-----------|
| Trigger, keyword, tên | ✅ |
| Tập trung, độ trễ | ✅ |
| Lỗi gõ, burst, mệt mỏi | ✅ |
| Lịch ngủ | ✅ |
| TTS, tin nhắn thoại | ✅ |
| Discord token, chế độ LLM | ❌ (cần khởi động lại) |

```typescript
// config.ts -- các getter trả về giá trị trực tiếp
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## Bộ dữ liệu: Discord-Dialogues

Mô hình được fine-tune trên [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues): **7.3M lượt trao đổi**, **17M lượt**, **140M từ**. Các cuộc trò chuyện Discord thực tế mùa xuân-hè 2025, đã được lọc (PII, ToS, bot, lệnh). Apache 2.0.

| Chỉ số | Giá trị |
|----------|--------|
| Mẫu | 7 303 464 |
| Tổng số lượt | 16 881 010 |
| Tổng số từ | 139 922 950 |
| Token trung bình | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

Mô hình đã lượng hóa được sử dụng là GGUF (ví dụ `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Phân phối bộ dữ liệu Discord-Dialogues](/images/luna-protocol/dataset-distribution.svg)

---

![Vòng đời hoàn chỉnh -- hành vi đầy đủ của bot từ tin nhắn đến phản hồi, bao gồm timer và trường hợp biên](/images/luna-protocol/22-complete-lifecycle.svg)

## Các sơ đồ kiến trúc

Thư mục `state-machines/` chứa **24 sơ đồ Mermaid** bao phủ toàn bộ mã nguồn. Mỗi sơ đồ có giải thích chi tiết bằng ngôn ngữ tự nhiên.

Trong số quan trọng nhất:

| # | Sơ đồ | Loại |
|---|---|---|
| 01 | Tổng quan kiến trúc | `graph` |
| 02 | Xử lý tin nhắn (hoàn chỉnh) | `stateDiagram` |
| 03 | Đánh giá kích hoạt | `flowchart` |
| 04 | Hàng đợi LLM Core (3 backend) | `stateDiagram` |
| 10 | Đường dẫn TTS | `flowchart` |
| 13 | Lưu trạng thái | `flowchart` |
| 21 | Biểu đồ thời gian Gantt | `gantt` |
| 22 | Vòng đời hoàn chỉnh | `stateDiagram` |

Các sơ đồ này là mỏ vàng để hiểu luồng hoàn chỉnh: từ tin nhắn đến phản hồi, qua các timer và trường hợp biên.

---

## Mã kích hoạt chi tiết

Trigger được đánh giá bởi `evaluateMessage()` trong `state/trigger.ts`. Đây là logic hoàn chỉnh:

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

  // ... so khớp theo tên, keyword, follow-up, random
}
```

Bộ nhớ đệm regex (`hasWordCache`) tránh việc biên dịch lại các mẫu mỗi tin nhắn.

---

## Phản ứng

Luna phản ứng với tin nhắn bằng emoji. 30% cơ hội dùng emoji tùy chỉnh của máy chủ, 70% emoji unicode. Phản ứng được kích hoạt sau độ trễ tập trung, không phải ngay lập tức.

Các lệnh bằng phản ứng trên tin nhắn của Luna:
- ❌ -> Dừng
- ▶️ -> Bắt đầu
- 🗑️ -> Xóa

---

## Kiểu phản hồi

Kiểu phản hồi được điều chỉnh theo hoạt động gần đây của Luna trong kênh:

| Ngữ cảnh | messageReference | mentionRepliedUser | Trọng số |
|----------|-----------------|-------------------|-------|
| Lạnh | true | false | 70% |
| Lạnh | true | true | 20% |
| Lạnh | false | false | 10% |
| Hoạt động | true | false | 50% |
| Hoạt động | true | true | 15% |
| Hoạt động | false | false | 30% |
| Hoạt động | false | true | 5% |

Trong DM, `messageReference` luôn là `false`.

---

## Tin nhắn burst

Với 15% cơ hội, một phản hồi được chia thành 2-3 đoạn gửi theo nhịp độ con người (1.5-4 giây giữa mỗi đoạn). Mô phỏng ai đó gõ nhiều lần.

![Biểu đồ thời gian Gantt -- thời gian chờ thực tế cho độ trễ, phản ứng, truyền phát LLM và sửa lỗi](/images/luna-protocol/21-timing-gantt.svg)

---

## Trạng thái động

Trạng thái Discord của Luna luân phiên giữa nhiều preset đã cấu hình, xoay vòng mỗi 15 phút. Các loại được hỗ trợ: Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). Trong giờ ngủ, trạng thái chuyển thành `invisible`.

```yaml
dynamic_status_presets:
  - status: online
    text: "avec les pixels"
    type: 0       # Playing
  - status: idle
    text: "du bruit blanc"
    type: 2       # Listening
```

Một jitter ngẫu nhiên (x0.5-1.0) tránh các vòng xoay có thể đoán trước. 10% số lần thử bị bỏ qua để tránh lặp lại.

## Chỉ báo đang gõ

Trước khi gọi LLM, Luna gọi `startTyping()`. Một `setInterval` làm mới chỉ báo mỗi 8 giây trong quá trình tạo. Được dọn dẹp trong `finally` (`clearInterval`).

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

Nếu LLM bị crash (tiến trình `llama-server` chết), Luna phát hiện sự kiện qua `llmBus.emit("crash", code)` và thử khởi động lại với backoff theo cấp số nhân. Tránh vòng lặp khởi động lại vô hạn.

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

Mẫu ChatML (`<|im_start|>/<|im_end|>`) được sử dụng. Số luồng được tự động phát hiện qua `os.cpus().length`.

---

## Thiết lập

```bash
npm install
cp config.example.yml config.yml
# chỉnh sửa config.yml
npm run dev                    # dev (tải lại nóng)
npm run build && npm start     # production
```

| Script | Mô tả |
|--------|-------------|
| `build` | Bundle CLI độc lập |
| `start` | Chạy bot |
| `lint` / `format` / `check` | Biome |
| `test` | Kiểm thử (Bun) |
| `download-model` | GGUF từ HuggingFace |
| `diagrams` | Xuất sơ đồ Mermaid thành SVG/PNG |

### Triển khai PM2

```bash
./start.sh   # khởi động llm-server + llm-client dưới PM2
```

---

## Kết luận

Luna Protocol không chỉ là một bot Discord với LLM. Đây là một **hệ thống hành vi hoàn chỉnh** mô phỏng các khuyết điểm của con người: quên, lỗi gõ, ngủ, ngập ngừng, mệt mỏi. Tất cả được kiến trúc xoay quanh một bus sự kiện được định kiểu, với 24 sơ đồ Mermaid tài liệu hóa mọi luồng.

Mã nguồn là mã nguồn mở, bộ dữ liệu công khai, và cấu hình có thể tải lại nóng. Nếu bạn quan tâm đến chủ đề này, hãy đào sâu vào mã nguồn -- nó dễ tiếp cận hơn bạn nghĩ.

| Tài nguyên | Liên kết |
|-----------|------|
| Kho GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Bộ dữ liệu | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Bản đồ Atlas | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
