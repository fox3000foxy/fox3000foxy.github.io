---
title: "Luna Protocol: ฉันสร้าง Discord Bot อิสระที่จำลองมนุษย์"
description: "Luna Protocol เป็น Discord Bot ที่เป็นอิสระอย่างสมบูรณ์พร้อม LLM ในเครื่อง สามารถสนทนาได้อย่างเป็นธรรมชาติด้วยการนอน พิมพ์ผิด ลังเล หลงลืม ความเหนื่อยล้าตามหัวข้อ และข้อความที่เกิดขึ้นเอง"
date: 2026-07-11
tags:
  - discord-bot
  - llm
  - typescript
  - สถาปัตยกรรม-ขับเคลื่อนด้วยเหตุการณ์
  - ปัญญาประดิษฐ์
  - โอเพ่นซอร์ส
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "UcSnQWh/mPVIr2Etqlc67CYJ+B3IxpUif99fFk8fK8yaNiWqr2dqlO7dEkrTkl8lEmtcOJSs6ON9U0sn2I2KBQ=="
---

# Luna Protocol: ฉันสร้างบ็อต Discord อิสระที่จำลองมนุษย์
ถ้าบ็อต Discord สามารถ**นอนหลับ** **พิมพ์ผิด** **ลังเล** **ลืม**ตอบ และบางครั้งส่งข้อความด้วยตัวเองล่ะ? นั่นคือสิ่งที่ **Luna Protocol** ทำ: บ็อต Discord ที่เป็นอิสระอย่างสมบูรณ์ซึ่งรัน LLM ท้องถิ่น (llama.cpp) และสนทนาเหมือนมนุษย์ที่ไม่สมบูรณ์แบบ
ไม่มี prompt ที่เข้มงวด ไม่มีคำตอบแบบหุ่นยนต์ Luna มี**ระบบทริกเกอร์ที่มีลำดับความสำคัญ** **เวลาหน่วงที่เปลี่ยนแปลงได้** **ตารางการนอน** **ข้อความที่เกิดขึ้นเอง** แม้แต่**ท่อ TTS** สำหรับส่งข้อความเสียง ทั้งหมดกำหนดค่าได้ผ่านไฟล์ `config.yml` ที่สามารถโหลดซ้ำได้
ในบทความนี้ เราแยกส่วนสถาปัตยกรรมที่สมบูรณ์: จากบัสอีเวนต์ทั่วไปไปจนถึงท่อ TTS รวมถึงระบบทริกเกอร์ องค์ประกอบของมนุษย์ และชุดข้อมูล fine-tuning
![ภาพรวมสถาปัตยกรรม -- องค์ประกอบทั่วไปและกระแสข้อมูล](/images/luna-protocol/01-architecture-overview.svg)

---

## สถาปัตยกรรม: บัสเหตุการณ์ที่มีการพิมพ์

แกนหลักของ Luna คือ **TypedBus** -- อีเวนต์บัสแบบเจน릭ที่มีการพิมพ์ที่เข้มงวด (TypeScript) นี่คือบล็อกพื้นฐานของทุกสิ่ง

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

จากที่นี่ บัสหลักสองตัวถูกสร้างขึ้น:

- **`llmBus`** -- จัดการโทเค็น LLM ข้อผิดพลาด การล่ม และการรีเซ็ต
- **`stateBus`** -- จัดการการเปลี่ยนแปลงสถานะพร้อมการเก็บถาวรอัตโนมัติ

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

ข้อดีของวิธีนี้: แต่ละโมดูล**แยกจาก**ส่วนที่เหลือ LLM จะตีพิมพ์โทเค็นไปยังบัส บ็อตจะบริโภค และสถานะจะอัปเดตโดยอัตโนมัติ ไม่มีการพึ่งพาอาศัยแบบวงจร

---

![Message Processing -- กระแสข้อมูลการประมวลผลข้อความที่สมบูรณ์](/images/luna-protocol/02-message-processing.svg)

## ระบบทริกเกอร์: ใครเป็นตัวตัดสินใจว่า Luna จะตอบเมื่อใด

ข้อความที่เข้ามาแต่ละรายการจะถูกประเมินโดย `evaluateMessage()` ซึ่งจะส่งคืน `TriggerResult` พร้อมเหตุผลในการทริกเกอร์ ลำดับความสำคัญมีความสำคัญ:

| # | เหตุผล | เงื่อนไข | Bypass ignore | Bypass pause |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | ใช่ (0%) | ใช่ |
| 2 | `dm` | DM ที่มี `replyInDM = true` | ใช่ (0%) | ไม่ |
| 3 | `name` | "Luna"/"Pixie"/alias (คำทั้งหมด) | ไม่ (8%) | ไม่ |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (คำทั้งหมด) | ไม่ (8%) | ไม่ |
| 5 | `follow-up` | บอตเป็นผู้พูดล่าสุด + < 15 วินาที + < 3 / 60 วินาที | -- | -- |
| 6 | `random` | โอกาส 1.5% ในข้อความที่ไม่ตรงกัน | ไม่ (8%) | ไม่ |

การจับคู่เป็น**คำทั้งหมด** (`\b`) : "ai" ไม่ตรงกับ "mais", "vrai", "lait"

![Trigger evaluation -- การตัดสินใจทางเข้าของแต่ละข้อความ](/images/luna-protocol/03-trigger-evaluation.svg)

### กลไกการติดตาม

เมื่อ Luna ตอบข้อความ จะลงทะเบียนเป็น `lastSpeaker` ข้อความที่ตามมาภายใน 15 วินาทีจะทริกเกอร์การตอบ**ทันที** -- ไม่มีตั้งเวลา ไม่มีการตรวจสอบคำหลัก งบประมาณ: การติดตามสูงสุด 3 ครั้งต่อหน้าต่าง 60 วินาที

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### ระบายความร้อน

8 วินาทีระหว่างการตอบสองครั้งในช่องเดียวกัน หลีกเลี่ยงได้ด้วยการmentionและการติดตาม

---

## พฤติกรรมของมนุษย์: ระดับสมาธิที่เปลี่ยนแปลงได้

ที่นี่ Luna น่าสนใจยิ่งขึ้น แต่ละประเภททริกเกอร์มี**เกณฑ์สมาธิ**เฉพาะ: หน่วงต่ำสุด/สูงสุด โอกาสที่จะเพิกเฉย และโอกาสที่จะตอบสนอง

| ทริกเกอร์ | หน่วงต่ำสุด | หน่วงสูงสุด | เพิกเฉย | ตอบสนอง |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

การคำนวณหน่วงยังพิจารณา:
- **ความยาวของข้อความ**: ยิ่งข้อความยาว Luna ยิ่งใช้เวลา "อ่าน"
- **ความไม่ใช้งาน**: ถ้า Luna ไม่ได้ใช้งานมา 10 นาที หน่วงจะเพิ่มเป็น 2 เท่า (จำลองการ "ตื่น")
- **การนอนหลับ**: ในโหมด `slow` หน่วงจะเพิ่มเป็น 3 ถึง 5 เท่า

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
  delay *= 0.5 + Math.random() * 1.5; // jitter รุนแรง
  return delay;
}
```

---

## กำหนดการนอนหลับ

Luna สามารถนอนหลับได้ กำหนดค่าผ่าน `config.yml`:

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

| โหมด | ผลลัพธ์ |
|------|-------|
| `sleep` | เฉพาะการmentionและDM เท่านั้นที่ผ่าน |
| `slow` | หน่วง ×3-5, การตอบสนองแทบเป็นศูนย์ |
| `short` | โอกาสเพิกเฉย +30%, การตอบสนองแทบเป็นศูนย์ |

ระหว่างเวลาเข้านอน สถานะ Discord จะเปลี่ยนเป็น `invisible`

---

## ข้อผิดพลาดในการพิมพ์

Luna สามารถพิมพ์ผิดได้ -- แก้ไขหลัง 2-4 วินาที ผังแป้นพิมพ์กำหนดค่าได้ (AZERTY หรือ QWERTY)

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... แป้นพิมพ์ที่อยู่ติดกันทั้งหมด
};
```

ตัวอย่าง AZERTY: `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`

สามสไตล์การแก้ไข:

| สไตล์ | การทำงาน |
|-------|-------------|
| `edit` | แก้ไขข้อความ |
| `message` | ข้อความใหม่: `word*` |
| `mixed` | สุ่ม 50/50 (ค่าเริ่มต้น) |

---

## ความลังเลและการหลงลืม

**ความลังเล**: โอกาสเริ่มต้นด้วยคำเติม 15% (`uh...`, `um...`, `well...`, `hmm...`, `so...`)

**ความลืม**: แม้จะตรงกับทริกเกอร์แล้ว Luna ยังมีโอกาส 3% ที่จะ "ลืม" ตอบ ไม่มีข้อความ ไม่มีการตอบสนอง -- เหมือนไม่เห็นอะไรเลย

**ความเหนื่อยล้าตามหัวข้อ**: ถ้าคำปรากฏบ่อยเกินไปใน 10 ข้อความล่าสุด (เกณฑ์: 3 ครั้ง) หน่วงจะถูกคูณและโอกาสเพิกเฉยจะเพิ่มขึ้น 15%

---

## ไปป์ไลน์ LLM: สองโหมด

### โหมด `direct` (ค่าเริ่มต้น)

บ็อตส่งคำขอโดยตรงไปยัง `llama-server` ท้องถิ่นผ่าน HTTP โมเดลถูกแชร์ พร้อม prompt cache และ 4 สล็อตพร้อมกัน สองโปรเซส PM2: เซิร์ฟเวอร์ LLM และลูกค้าบ็อต

### โหมด `online`

บ็อตเรียก API ใดก็ได้ที่เข้ากันได้กับ OpenAI (OpenAI, OpenRouter, Groq, Together...) ไม่จำเป็นต้องมี LLM ท้องถิ่น

### การสตรีมแบบเรียลไทม์

LLM สตรีมคำตอบทีละบรรทัด (`\n`) แต่ละบรรทัดจะถูกแบ่งเป็นคำ และ `llmBus.emit("token", word)` ทุก `\n` จะมีการตีพิมพ์เหตุการณ์ `flush` -- บ็อตจะส่งข้อความที่สะสมทันที ไม่มีการจำลองหน่วง: จังหวะเป็นของ LLM

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

คิว (`requestQueue`) จัดการคำขอทีละรายการ และล้างโดยอัตโนมัติเมื่อเกิน 100 รายการ

---

## ข้อความที่เกิดขึ้นเอง

ทุก 5 นาที บ็อตมีโอกาส 12% ที่จะโพสต์ข้อความด้วยตนเอง เซิร์ฟเวอร์จะถูกเลือกโดยระบบ**น้ำหนักเชิงเส้น**: เซิร์ฟเวอร์ที่ใช้งานมากที่สุดจะมีโอกาสมากกว่าเซิร์ฟเวอร์สุดท้าย N เท่า

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

บริบทของ 5 ข้อความล่าสุดจะถูกอ่าน และ Luna จะเข้าร่วมการสนทนา "อย่างเป็นธรรมชาติ"

---

## ไปป์ไลน์ TTS: ข้อความเสียง

8% ของเวลา Luna จะส่งข้อความเสียงแทนข้อความ ไปป์ไลน์ที่สมบูรณ์:

1. **Piper TTS** สังเคราะห์ข้อความเป็น WAV
2. **ffmpeg** แปลงเป็น OGG
3. คำนวณ waveform สำหรับตัวอย่าง Discord
4. อัปโหลดไฟล์ผ่าน API Discord CDN
5. ส่งข้อความเสียง

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

![TTS Pipeline -- จากข้อความที่สังเคราะห์ไปยังข้อความเสียง Discord](/images/luna-protocol/10-tts-pipeline.svg)

---

## ป้องกันสแปมและการเก็บรักษา

### ป้องกันสแปม

คิวตาม `channelId:userId` หนึ่งข้อความต่อคิวต่อผู้ใช้ต่อช่อง จะประมวลผลทันทีเมื่อการตอบปัจจุบันเสร็จสิ้น

### จำกัดเซสชัน

หลังการแลกเปลี่ยน 8 ครั้ง Luna จะหยุดพัก 30 วินาที ตัวนับจะรีเซ็ตหลังไม่ใช้งาน 3 นาที

### การเก็บถาวรอัตโนมัติ

การเปลี่ยนแปลงสถานะแต่ละครั้งจะถูกตีพิมพ์ไปยัง `stateBus` → บันทึกอัตโนมัติ (debounce 500ms) ไม่จำเป็นต้องเรียก `saveAllState()` ด้วยตนเองอีกต่อไป สถานะที่เก็บถาวร: pendingMessages, paused, cooldowns, timestamps, lastSpeaker, ตัวนับการติดตาม

---

## การกำหนดค่าแบบรีโหลดร้อน

ไฟล์ `config.yml` หนึ่งไฟล์ ค่าส่วนใหญ่**สามารถรีโหลดได้** -- การเปลี่ยนแปลงจะมีผลทันทีโดยไม่ต้องรีสตาร์ท

| หมวดหมู่ | รีโหลดร้อน |
|-----------|-----------|
| ทริกเกอร์, คำหลัก, ชื่อ | ✅ |
| สมาธิ, หน่วง | ✅ |
| ข้อผิดพลาด, burst, ความเหนื่อยล้า | ✅ |
| กำหนดการนอนหลับ | ✅ |
| TTS, ข้อความเสียง | ✅ |
| Discord token, โหมด LLM | ❌ (ต้องรีสตาร์ท) |

```typescript
// config.ts -- getter จะคืนค่าแบบเรียลไทม์
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## ชุดข้อมูล: Discord-Dialogues

โมเดลได้รับการ fine-tune จาก: [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) : **7.3M การแลกเปลี่ยน**, **17M รอบ**, **140M คำ** การสนทนา Discord จริงจากฤดูใบไม้ผลิ-ฤดูร้อน 2025 กรองแล้ว (PII, ToS, บ็อต, คำสั่ง) Apache 2.0

| เมตริก | ค่า |
|----------|--------|
| จำนวนตัวอย่าง | 7 303 464 |
| จำนวนรอบทั้งหมด | 16 881 010 |
| จำนวนคำทั้งหมด | 139 922 950 |
| โทเค็นเฉลี่ย | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

โมเดลที่ใช้คือ GGUF แบบ quantized (เช่น `Discord-Hermes-3-8B.Q3_K_M.gguf`)

![การกระจายข้อมูลชุด Discord-Dialogues](/images/luna-protocol/dataset-distribution.svg)

---

![Complete Lifecycle -- พฤติกรรมบ็อตที่สมบูรณ์จากข้อความไปจนถึงคำตอบ รวมถึงตั้งเวลาและกรณีขอบ](/images/luna-protocol/22-complete-lifecycle.svg)

## แผนภาพสถาปัตยกรรม

โฟลเดอร์ `state-machines/` มี**แผนภาพ Mermaid 24 แผนภาพ**ครอบคลุมซอร์สโค้ดทั้งหมด แต่ละแผนภาพมีคำอธิบายโดยละเอียดในภาษาที่เข้าใจง่าย

แผนภาพที่สำคัญที่สุด:

| # | แผนภาพ | ประเภท |
|---|-----------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (สมบูรณ์) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 backends) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

แผนภาพเหล่านี้เป็นเหมืองทองสำหรับการทำความเข้าใจกระแสที่สมบูรณ์: จากข้อความที่เข้ามาไปจนถึงคำตอบ ผ่านตั้งเวลาและกรณีขอบ

---

## โค้ดทริกเกอร์โดยละเอียด

ทริกเกอร์จะถูกประเมินโดย `evaluateMessage()` ใน `state/trigger.ts` ลอจิกทั้งหมด:

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

  // ... การจับคู่ตามชื่อ, คำหลัก, การติดตาม, สุ่ม
}
```

แคชรูปแบบ (`hasWordCache`) ป้องกันการคอมไพล์ใหม่ของรูปแบบในแต่ละข้อความ

---

## การตอบสนอง

Luna ตอบข้อความด้วยอิโมจิ โอกาสใช้อิโมจิที่กำหนดเองของเซิร์ฟเวอร์ 30% อิโมจิยูนิคอร์ด 70% การตอบสนองจะทริกเกอร์หลังจากหน่วงสมาธิ ไม่ใช่ทันที

คำสั่งการตอบสนองต่อข้อความ Luna:
- ❌ → หยุด
- ▶️ → เริ่ม
- 🗑️ → ล้าง

---

## สไตล์การตอบกลับ

น้ำหนักของสไตล์การตอบกลับขึ้นอยู่กับกิจกรรมล่าสุดของ Luna ในช่อง:

| บริบท | messageReference | mentionRepliedUser | น้ำหนัก |
|----------|-----------------|-------------------|-------|
| เย็น | true | false | 70% |
| เย็น | true | true | 20% |
| เย็น | false | false | 10% |
| ใช้งาน | true | false | 50% |
| ใช้งาน | true | true | 15% |
| ใช้งาน | false | false | 30% |
| ใช้งาน | false | true | 5% |

ใน DM `messageReference` จะเป็น `false` เสมอ

---

## ข้อความแบบ burst

15% ของเวลา คำตอบจะถูกแบ่งเป็น 2-3 ส่วนด้วยจังหวะของมนุษย์ (1.5-4 วินาทีระหว่างแต่ละส่วน) จำลองการพิมพ์หลายครั้ง

![Timing Gantt -- เวลาแฝงจริงของการหน่วง การตอบสนอง การสตรี밍 LLM และการแก้ไข](/images/luna-protocol/21-timing-gantt.svg)

---

## สถานะแบบไดนามิก

สถานะ Discord ของ Luna จะสลับระหว่างหลายพรีเซ็ตที่กำหนดค่าไว้ทุก 15 นาที ประเภทที่รองรับ: Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5) สถานะจะเปลี่ยนเป็น `invisible` ระหว่างการนอนหลับ

```yaml
dynamic_status_presets:
  - status: online
    text: "avec les pixels"
    type: 0       # Playing
  - status: idle
    text: "du bruit blanc"
    type: 2       # Listening
```

Jitter แบบสุ่ม (×0.5-1.0) ป้องกันการหมุนเวียนที่คาดเดาได้ 10% ของความพยายามจะข้ามเพื่อหลีกเลี่ยงการทำซ้ำ

## ตัวแสดงการพิมพ์

ก่อนเรียก LLM Luna จะเรียก `startTyping()` `setInterval` จะรีเฟรชตัวแสดงทุก 8 วินาทีระหว่างการสร้าง จะถูกล้างใน `finally` (`clearInterval`)

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

## การกู้คืนหลังล่ม

เมื่อ LLM ล่ม (โปรเซส `llama-server` หยุด) Luna จะตรวจจับเหตุการณ์ผ่าน `llmBus.emit("crash", code)` และพยายามรีสตาร์ทด้วย exponential backoff ป้องกันลูปรีสตาร์ทที่ไม่มีที่สิ้นสุด

## พารามิเตอร์ LLM

พารามิเตอร์ถูก hardcode ใน `src/config.ts`:

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

เทมเพลต ChatML (`<|im_start|>/<|im_start|>`) ถูกใช้ จำนวนเธรดคือ `os.cpus().length`

---

## การตั้งค่า

```bash
npm install
cp config.example.yml config.yml
# แก้ไข config.yml
npm run dev                    # dev (hot reload)
npm run build && npm start     # production
```

| สคริปต์ | คำอธิบาย |
|--------|-------------|
| `build` | บันเดิล CLI อิสระ |
| `start` | เริ่มบ็อต |
| `lint` / `format` / `check` | Biome |
| `test` | ทดสอบ (Bun) |
| `download-model` | GGUF จาก HuggingFace |
| `diagrams` | ส่งออกแผนภาพ Mermaid เป็น SVG/PNG |

### การ部署 PM2

```bash
./start.sh   # เริ่ม llm-server + llm-client ด้วย PM2
```

---

## สรุป

Luna Protocol ไม่ใช่แค่บ็อต Discord ที่มี LLM นี่คือ**ระบบพฤติกรรมที่สมบูรณ์**ที่จำลองความไม่สมบูรณ์แบบของมนุษย์ -- ความลืม ข้อผิดพลาดในการพิมพ์ การนอนหลับ ความลังเล ความเหนื่อยล้า -- ทุกสิ่งสร้างขึ้นรอบบัสอีเวนต์ที่มีการพิมพ์ แผนภาพ Mermaid 24 แผนภาพเอกสารกระแสแต่ละรายการ

โค้ดเป็นโอเพ่นซอร์ส ชุดข้อมูลเป็นสาธารณะ และกำหนดค่าได้แบบรีโหลดร้อน ถ้าคุณสนใจหัวข้อนี้ ลองดูโค้ด -- เข้าถึงได้ง่ายกว่าที่คุณคิด

| ทรัพยากร | ลิงก์ |
|-----------|------|
| คลัง GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| ชุดข้อมูล | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
