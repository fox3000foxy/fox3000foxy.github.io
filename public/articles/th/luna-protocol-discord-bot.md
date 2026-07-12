---
title: "Luna Protocol: ฉันสร้างบอท Discord อัตโนมัติที่จำลองความเป็นมนุษย์"
description: "Luna Protocol คือบอท Discord อัตโนมัติเต็มรูปแบบที่ขับเคลื่อนด้วย LLM ในเครื่อง สามารถสนทนาอย่างเป็นธรรมชาติ พร้อมการนอน พิมพ์ผิด การลังเล การลืม ความเหนื่อยล้าตามหัวข้อ และข้อความที่ส่งเองตามธรรมชาติ"
date: 2026-07-11
tags:
  - discord-bot
  - llm
  - typescript
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "43eV7uM1V1V3YSNXz7sxnd8tT4J5eUWRWPSpFprvGnLPqk2sz+I796H/DrPE4PCtFZGhUmyB5x3MPlfiD/66wg=="
---

# Luna Protocol: ฉันสร้างบอท Discord อัตโนมัติที่จำลองความเป็นมนุษย์

จะเป็นอย่างไรถ้าบอท Discord สามารถ **นอน** พิมพ์**ผิด** **ลังเล** **ลืม**ตอบ และบางครั้งส่งข้อความหาคุณเองได้? นี่คือสิ่งที่ **Luna Protocol** ทำ: บอท Discord อัตโนมัติเต็มรูปแบบที่รัน LLM ในเครื่อง (llama.cpp) และสนทนาเหมือนมนุษย์ผู้ไม่สมบูรณ์แบบ

ไม่มีพรอมป์ที่ตายตัว ไม่มีการตอบแบบหุ่นยนต์ Luna มี **ระบบการตัดสินใจแบบมีลำดับความสำคัญ**, **ระยะเวลาที่แปรผัน**, **ตารางการนอน**, **ข้อความที่ส่งเองตามธรรมชาติ**, และแม้กระทั่ง **ไปป์ไลน์ TTS** สำหรับส่งข้อความเสียง ทั้งหมดนี้ตั้งค่าผ่านไฟล์ `config.yml` ไฟล์เดียวที่สามารถโหลดซ้ำได้ทันที

ในบทความนี้ เราจะเจาะลึกสถาปัตยกรรมทั้งหมด: จากบัสอีเวนต์ทั่วไป ไปจนถึงไปป์ไลน์ TTS, ระบบการตัดสินใจ, คอมโพเนนต์ความเป็นมนุษย์, และชุดข้อมูลสำหรับ fine-tuning

![ภาพรวมสถาปัตยกรรม -- คอมโพเนนต์ทั่วโลกและโฟลว์ข้อมูล](/images/luna-protocol/01-architecture-overview.svg)

---

## สถาปัตยกรรม: บัสอีเวนต์แบบชนิดข้อมูล

หัวใจของ Luna คือ **TypedBus** -- บัสอีเวนต์ทั่วไปที่ตรวจสอบชนิดข้อมูลอย่างเข้มงวดใน TypeScript นี่คือรากฐานที่ทุกอย่างสร้างขึ้น

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

บัสหลักสองตัวที่สืบทอดออกมา:

- **`llmBus`** -- จัดการโทเค็น LLM, ข้อผิดพลาด, การพัง, การรีเซ็ต
- **`stateBus`** -- จัดการการเปลี่ยนแปลงสถานะพร้อมบันทึกอัตโนมัติ

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

ข้อดีของแนวทางนี้: แต่ละโมดูลเป็น**อิสระ**จากกัน LLM ปล่อยโทเค็นบนบัส, บอทรับไปใช้, สถานะอัปเดตโดยอัตโนมัติ ไม่มีการอ้างอิงแบบวงกลม

---

![การประมวลผลข้อความ -- โฟลว์ทั้งหมดของการประมวลผลข้อความ](/images/luna-protocol/02-message-processing.svg)

## ระบบการตัดสินใจ: ใครเป็นคนตัดสินว่าเมื่อไร Luna จะตอบ?

ข้อความขาเข้าทุกข้อความจะถูกประเมินโดย `evaluateMessage()` ซึ่งคืนค่า `TriggerResult` พร้อมเหตุผลในการตัดสินใจ ลำดับความสำคัญมีความสำคัญ:

| # | เหตุผล | เงื่อนไข | ข้ามการละเว้น | ข้ามการหยุดชั่วคราว |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | ใช่ (0%) | ใช่ |
| 2 | `dm` | DM กับ `replyInDM = true` | ใช่ (0%) | ไม่ |
| 3 | `name` | "Luna"/"Pixie"/ชื่ออื่น (ทั้งคำ) | ไม่ (8%) | ไม่ |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (ทั้งคำ) | ไม่ (8%) | ไม่ |
| 5 | `follow-up` | บอทเป็นคนพูดล่าสุด + < 15วิ + < 3 / 60วิ | -- | -- |
| 6 | `random` | โอกาส 1.5% สำหรับข้อความที่ไม่ตรงเงื่อนไข | ไม่ (8%) | ไม่ |

การจับคู่เป็นแบบ**ทั้งคำ** (`\b`): "ai" ไม่ตรงกับ "mai", "vrai", "lait"

![การประเมินทริกเกอร์ -- การตัดสินใจเข้าสำหรับแต่ละข้อความ](/images/luna-protocol/03-trigger-evaluation.svg)

### กลไกการตอบตาม

เมื่อ Luna ตอบข้อความ มันจะบันทึกตัวเองเป็น `lastSpeaker` ข้อความถัดไปภายใน 15 วินาทีจะทำให้เกิดการตอบ**ทันที** -- ไม่มีตัวจับเวลา ไม่มีการตรวจสอบคีย์เวิร์ด งบประมาณ: 3 ครั้งต่อหน้าต่าง 60 วินาที

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### การหน่วงเวลา

8 วินาทีระหว่างการตอบสองครั้งในช่องเดียวกัน ข้ามได้โดยการพูดถึงและตอบตาม

---

## พฤติกรรมมนุษย์: สมาธิที่แปรผัน

นี่คือจุดที่ Luna น่าสนใจ การตัดสินใจแต่ละประเภทจะมี**ระดับสมาธิ**ของตัวเอง: ระยะเวลาต่ำสุด/สูงสุด, โอกาสในการละเว้น, และโอกาสในการโต้ตอบ

| ทริกเกอร์ | ระยะเวลาต่ำสุด | ระยะเวลาสูงสุด | ละเว้น | โต้ตอบ |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

การคำนวณระยะเวลายังคำนึงถึง:
- **ความยาวข้อความ**: ยิ่งข้อความยาว Luna ยิ่งใช้เวลาในการ "อ่าน" นานขึ้น
- **การไม่เคลื่อนไหว**: ถ้า Luna ไม่ได้เคลื่อนไหวเกิน 10 นาที ระยะเวลาจะคูณด้วย 2 (จำลองการ "ตื่น")
- **การนอน**: ในโหมด `slow` ระยะเวลาจะคูณด้วย 3 ถึง 5

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

## ตารางการนอน

Luna สามารถนอนได้ ตั้งค่าผ่าน `config.yml`:

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

| โหมด | ผล |
|------|-------|
| `sleep` | เฉพาะการพูดถึงและ DM เท่านั้นที่ผ่าน |
| `slow` | ระยะเวลา x3-5, การโต้ตอบใกล้เป็นศูนย์ |
| `short` | โอกาสละเว้น +30%, การโต้ตอบใกล้เป็นศูนย์ |

ในช่วงเวลานอน สถานะ Discord จะเปลี่ยนเป็น `invisible`

---

## การพิมพ์ผิด

Luna สามารถพิมพ์ผิด -- และแก้ไขหลังจาก 2-4 วินาที รูปแบบแป้นพิมพ์สามารถตั้งค่าได้ (AZERTY หรือ QWERTY)

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... ปุ่มที่อยู่ติดกันทั้งหมด
};
```

ตัวอย่าง AZERTY: `bonjour -> bonjpur`, `salut -> slaut`, `comment -> cpmment`

รูปแบบการแก้ไขสามแบบ:

| รูปแบบ | พฤติกรรม |
|-------|-------------|
| `edit` | แก้ไขข้อความ |
| `message` | ข้อความใหม่: `word*` |
| `mixed` | สุ่ม 50/50 (ค่าเริ่มต้น) |

---

## การลังเลและการลืม

**การลังเล**: โอกาส 15% ที่จะเริ่มต้นด้วยคำเติม (`uh...`, `um...`, `well...`, `hmm...`, `so...`)

**การลืม**: แม้หลังจากจับคู่ทริกเกอร์แล้ว Luna ก็สามารถ "ลืม" ตอบด้วยความน่าจะเป็น 3% ไม่มีข้อความ ไม่มีปฏิกิริยา -- เหมือนไม่เห็นอะไรเลย

**ความเหนื่อยล้าตามหัวข้อ**: ถ้าคำใดคำหนึ่งปรากฏบ่อยเกินไปใน 10 ข้อความล่าสุด (เกณฑ์: 3 ครั้ง) ระยะเวลาจะถูกคูณและโอกาสละเว้นเพิ่มขึ้น 15%

---

## ความสมจริงในทางปฏิบัติ: เมื่อมันน่าขนลุก

ในทางทฤษฎี ระบบทั้งหมดนี้ (ความหน่วง การพิมพ์ผิด การลังเล การหลงลืม) ฟังดูเหมือนแค่ลูกเล่น แต่ในทางปฏิบัติ เมื่อรวมกันแล้วผลลัพธ์กลับน่าทึ่งมาก จนคนที่คุยกับ Luna ไม่ทันสังเกตเลยแม้แต่น้อย นี่คือบทสนทนาจริงที่มีคนถาม Luna ตรงๆ ว่าเป็นบอทหรือเปล่า แล้วบทสนทนาก็ค่อยๆ เปลี่ยนไปเป็นเรื่องอื่นโดยสิ้นเชิง ด้วยความเป็นธรรมชาติที่ชวนขนลุก

![บทสนทนา Discord กับ Luna -- ช่วงแรก](/images/luna-protocol/realism/realism-01.png)

น้ำเสียง การลังเล จังหวะการตอบ -- ไม่มีอะไรที่บ่งบอกว่าเป็นบอทเลย Luna หลบคำถามเรื่องอายุได้อย่างแนบเนียนโดยไม่หลุดคาแรกเตอร์เลยแม้แต่น้อย

บทสนทนาดำเนินต่อไปอย่างเป็นธรรมชาติ ด้วยคำตอบสั้นๆ แบบมนุษย์ ("okay, okay", "yay", "yayy") -- ตรงกับข้อความที่คนจริงๆ จะส่งใน Discord

![บทสนทนา Discord กับ Luna -- ต่อเนื่อง](/images/luna-protocol/realism/realism-02.png)

![บทสนทนา Discord กับ Luna -- เปลี่ยนหัวข้อ](/images/luna-protocol/realism/realism-03.png)

![บทสนทนา Discord กับ Luna -- เปลี่ยนหัวข้อต่อ](/images/luna-protocol/realism/realism-04.png)

![บทสนทนา Discord กับ Luna -- ช่วงจบบทสนทนา](/images/luna-protocol/realism/realism-05.png)

สิ่งที่น่าขนลุกไม่ใช่แค่ Luna "ตอบกลับ" เท่านั้น -- แต่คือการที่เธอ**ดำเนินบทสนทนาได้จริง** ด้วยความเห็นที่ดูสมจริง การถามต่อ และแนวคิดที่ต่อเนื่องกันจากข้อความหนึ่งไปอีกข้อความหนึ่ง หากไม่มีระบบทริกเกอร์ ความหน่วงในการโฟกัส และการลังเลที่อธิบายไว้ข้างต้น ภาพลวงตานี้จะพังทลายภายในไม่กี่ข้อความ

**พลิกโผนิดหน่อย**: ในภาพหน้าจอข้างต้น **บัญชีทั้งสองที่กำลังคุยกันคือ Luna ทั้งคู่**  `PixieGlow` และ `Sujet d'SBlow` ไม่ใช่มนุษย์ที่กำลังทดสอบบอท -- แต่เป็นบอทสองตัวที่คุยกันเอง โดยแต่ละตัว(ในเชิงพฤติกรรม)"เชื่อมั่น"ว่ากำลังคุยกับใครสักคนที่ "ปกติ" อยู่ ถ้าตอนอ่านบทสนทนาข้างต้นคุณคิดว่าฝ่ายใดฝ่ายหนึ่งเป็นมนุษย์ ยินดีด้วย -- คุณเพิ่งตกหลุมพรางแบบเดียวกับที่ใครก็ตามจะตกในเซิร์ฟเวอร์ Discord จริงๆ

นี่แทบจะเป็นเวอร์ชันปฏิบัติของ **ทฤษฎีอินเทอร์เน็ตตาย (dead internet theory)**: ทฤษฎีนี้ (ซึ่งเดิมทีค่อนข้างเป็นทฤษฎีสมคบคิด) เสนอว่าเนื้อหาและปฏิสัมพันธ์ออนไลน์สัดส่วนที่เพิ่มขึ้นเรื่อยๆ ถูกสร้างโดยบอทแทนที่จะเป็นมนุษย์ จนอินเทอร์เน็ตของมนุษย์ "ตัวจริง" กลายเป็นเสียงส่วนน้อย ทฤษฎีนี้เคยถูกมองว่าเกินจริงมานาน แต่กลับดูไร้สาระน้อยลงเรื่อยๆ เมื่อระบบอย่าง Luna Protocol แสดงให้เห็นว่าการจำลองการมีตัวตนของมนุษย์ที่น่าเชื่อถือในระดับใหญ่ไม่จำเป็นต้องใช้พลังประมวลผลมากหรือโมเดลขนาดมหึมาแต่อย่างใด บอทตัวเดียวกันสองอินสแตนซ์ที่สามารถคุยกันยาวๆ โดยไม่มีใครเผยตัวเลย ก็ทำให้เห็นภาพที่ค่อนข้างชัดเจนว่าเว็บที่เต็มไปด้วยบอทคุยกันเองส่วนใหญ่จะมีหน้าตาเป็นอย่างไร

---

## ไปป์ไลน์ LLM: สองโหมด

### โหมด `direct` (ค่าเริ่มต้น)

บอทส่งคำขอโดยตรงไปยัง `llama-server` ในเครื่องผ่าน HTTP โมเดลถูกแชร์ พร้อมแคชพรอมป์และ 4 สล็อตพร้อมกัน สองกระบวนการ PM2: เซิร์ฟเวอร์ LLM และไคลเอนต์บอท

### โหมด `online`

บอทเรียก API ที่เข้ากันได้กับ OpenAI (OpenAI, OpenRouter, Groq, Together...) ไม่ต้องใช้ LLM ในเครื่อง

### การสตรีมแบบเรียลไทม์

LLM สตรีมคำตอบทีละบรรทัด (`\n`) แต่ละบรรทัดถูกแบ่งเป็นคำ ส่งทีละคำบน `llmBus.emit("token", word)` ทุกครั้งที่เจอ `\n` จะมีการส่งอีเวนต์ `flush` -- บอทส่งข้อความที่สะสมไว้ทันที ไม่มีการจำลองความล่าช้า: จังหวะเป็นไปตาม LLM

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

คิวคำขอ (`requestQueue`) จัดการคำขอทีละรายการ พร้อมทำความสะอาดอัตโนมัติเมื่อคิวเกิน 100 รายการ

---

## ข้อความที่ส่งเองตามธรรมชาติ

ทุก 5 นาที มีโอกาส 12% ที่ Luna จะโพสต์ข้อความเอง เซิร์ฟเวอร์ถูกเลือกโดยระบบ**ถ่วงน้ำหนักเชิงเส้น**: เซิร์ฟเวอร์ที่คึกคักที่สุดมีโอกาส N เท่าของเซิร์ฟเวอร์สุดท้าย

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

บริบทของ 5 ข้อความล่าสุดถูกอ่าน และ Luna เข้าร่วมการสนทนาอย่าง "เป็นธรรมชาติ"

---

## ไปป์ไลน์ TTS: ข้อความเสียง

ด้วยโอกาส 8% Luna ส่งข้อความเสียงแทนข้อความ ไปป์ไลน์ทั้งหมด:

1. **Piper TTS** สังเคราะห์ข้อความเป็น WAV
2. **ffmpeg** แปลงเป็น OGG
3. คำนวณรูปคลื่นสำหรับตัวอย่างเสียง Discord
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

![ไปป์ไลน์ TTS -- จากข้อความที่สังเคราะห์แล้วไปยังข้อความเสียง Discord](/images/luna-protocol/10-tts-pipeline.svg)

---

## การป้องกันสแปมและการบันทึกข้อมูล

### การป้องกันสแปม

คิวตาม `channelId:userId` หนึ่งข้อความต่อคิวต่อผู้ใช้ต่อช่อง ประมวลผลเมื่อคำตอบปัจจุบันเสร็จสิ้น

### ขีดจำกัดเซสชัน

หลังจาก 8 การสนทนา Luna จะหยุดพัก 30 วินาที ตัวนับจะรีเซ็ตหลังจากไม่มีการเคลื่อนไหว 3 นาที

### การบันทึกอัตโนมัติ

ทุกการเปลี่ยนแปลงสถานะจะส่งอีเวนต์บน `stateBus` -> บันทึกอัตโนมัติ (debounce 500ms) ไม่ต้องเรียก `saveAllState()` ด้วยตนเองอีกต่อไป สถานะที่บันทึกรวมถึง: pendingMessages, paused, cooldowns, timestamps, lastSpeaker, ตัวนับ follow-up

---

## การตั้งค่าแบบโหลดซ้ำทันที

ไฟล์เดียว `config.yml` ค่าส่วนใหญ่สามารถ**โหลดซ้ำได้ทันที** -- การเปลี่ยนแปลงมีผลทันทีโดยไม่ต้องรีสตาร์ท

| หมวดหมู่ | โหลดซ้ำทันที |
|-----------|-----------|
| ทริกเกอร์, คีย์เวิร์ด, ชื่อ | ✅ |
| สมาธิ, ระยะเวลา | ✅ |
| การพิมพ์ผิด, การระเบิด, ความเหนื่อยล้า | ✅ |
| ตารางการนอน | ✅ |
| TTS, ข้อความเสียง | ✅ |
| Discord token, โหมด LLM | ❌ (ต้องรีสตาร์ท) |

```typescript
// config.ts -- getters คืนค่าที่เป็นปัจจุบัน
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## ชุดข้อมูล: Discord-Dialogues

โมเดลถูก fine-tune บน [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues): **7.3M การสนทนา**, **17M รอบ**, **140M คำ** บทสนทนา Discord จริงจากฤดูใบไม้ผลิ-ฤดูร้อน 2025 ที่ถูกกรองแล้ว (PII, ToS, บอท, คำสั่ง) Apache 2.0

| เมตริก | ค่า |
|----------|--------|
| ตัวอย่าง | 7,303,464 |
| รอบทั้งหมด | 16,881,010 |
| คำทั้งหมด | 139,922,950 |
| โทเค็นเฉลี่ย | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

โมเดลที่ถูก量化ที่ใช้คือ GGUF (เช่น `Discord-Hermes-3-8B.Q3_K_M.gguf`)

![การกระจายของชุดข้อมูล Discord-Dialogues](/images/luna-protocol/dataset-distribution.svg)

---

![วงจรชีวิตสมบูรณ์ -- พฤติกรรมทั้งหมดของบอทตั้งแต่ข้อความถึงการตอบสนอง รวมถึงตัวจับเวลาและกรณีขอบ](/images/luna-protocol/22-complete-lifecycle.svg)

## ไดอะแกรมสถาปัตยกรรม

โฟลเดอร์ `state-machines/` ประกอบด้วย**ไดอะแกรม Mermaid 24 แบบ** ครอบคลุมซอร์สโค้ดทั้งหมด แต่ละไดอะแกรมมีคำอธิบายละเอียดเป็นภาษามนุษย์

ที่สำคัญที่สุด:

| # | ไดอะแกรม | ประเภท |
|---|-----------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (สมบูรณ์) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 backends) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

ไดอะแกรมเหล่านี้เป็นขุมทองสำหรับทำความเข้าใจโฟลว์ทั้งหมด: จากข้อความขาเข้าถึงการตอบสนอง รวมถึงตัวจับเวลาและกรณีขอบ

---

## โค้ดการตัดสินใจโดยละเอียด

ทริกเกอร์ถูกประเมินโดย `evaluateMessage()` ใน `state/trigger.ts` นี่คือตรรกะทั้งหมด:

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

  // ... จับคู่ตามชื่อ, คีย์เวิร์ด, follow-up, สุ่ม
}
```

แคช regex (`hasWordCache`) ป้องกันการคอมไพล์รูปแบบซ้ำสำหรับทุกข้อความ

---

## ปฏิกิริยา

Luna โต้ตอบกับข้อความด้วยอิโมจิ โอกาส 30% ใช้อิโมจิแบบกำหนดเองของเซิร์ฟเวอร์ 70% ใช้อิโมจิยูนิโค้ด ปฏิกิริยาจะเกิดขึ้นหลังจากระยะเวลาสมาธิ ไม่ใช่ทันที

คำสั่งโดยปฏิกิริยาบนข้อความของ Luna:
- ❌ -> หยุด
- ▶️ -> เริ่ม
- 🗑️ -> ล้าง

---

## รูปแบบการตอบ

รูปแบบการตอบถูกถ่วงน้ำหนักตามกิจกรรมล่าสุดของ Luna ในช่อง:

| บริบท | messageReference | mentionRepliedUser | น้ำหนัก |
|----------|-----------------|-------------------|-------|
| เย็น | true | false | 70% |
| เย็น | true | true | 20% |
| เย็น | false | false | 10% |
| กำลังเคลื่อนไหว | true | false | 50% |
| กำลังเคลื่อนไหว | true | true | 15% |
| กำลังเคลื่อนไหว | false | false | 30% |
| กำลังเคลื่อนไหว | false | true | 5% |

ใน DM `messageReference` เป็น `false` เสมอ

---

## ข้อความแบบระเบิด

ด้วยโอกาส 15% คำตอบจะถูกแบ่งเป็น 2-3 ส่วน ส่งตามจังหวะมนุษย์ (1.5-4 วินาทีระหว่างแต่ละส่วน) จำลองคนที่พิมพ์หลายครั้ง

![แผนภาพแกนต์ -- เวลารอจริงสำหรับระยะเวลา, ปฏิกิริยา, การสตรีม LLM และการแก้ไข](/images/luna-protocol/21-timing-gantt.svg)

---

## สถานะแบบไดนามิก

สถานะ Discord ของ Luna สลับไปมาระหว่างค่าที่ตั้งไว้หลายค่า เปลี่ยนทุก 15 นาที ประเภทที่รองรับ: Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5) ระหว่างนอน สถานะจะเปลี่ยนเป็น `invisible`

```yaml
dynamic_status_presets:
  - status: online
    text: "กับพิกเซล"
    type: 0       # Playing
  - status: idle
    text: "เสียงสีขาว"
    type: 2       # Listening
```

การกระจายแบบสุ่ม (x0.5-1.0) ป้องกันการหมุนที่คาดเดาได้ 10% ของความพยายามถูกข้ามเพื่อป้องกันการซ้ำซาก

## ตัวบ่งชี้การพิมพ์

ก่อนเรียก LLM Luna เรียก `startTyping()` `setInterval` รีเฟรชตัวบ่งชี้ทุก 8 วินาทีระหว่างการสร้าง ถูกทำความสะอาดในบล็อก `finally` (`clearInterval`)

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

## การกู้คืนหลังพัง

ถ้า LLM พัง (กระบวนการ `llama-server` ตาย) Luna ตรวจจับอีเวนต์ผ่าน `llmBus.emit("crash", code)` และพยายามรีสตาร์ทด้วย backoff แบบเลขชี้กำลัง ป้องกันการรีสตาร์ทไม่สิ้นสุด

## พารามิเตอร์ LLM

พารามิเตอร์ถูกกำหนดตายตัวใน `src/config.ts`:

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

ใช้เทมเพลต ChatML (`<|im_start|>/<|im_end|>`) จำนวนเธรดถูกตรวจจับอัตโนมัติผ่าน `os.cpus().length`

---

## การตั้งค่า

```bash
npm install
cp config.example.yml config.yml
# แก้ไข config.yml
npm run dev                    # dev (โหลดซ้ำทันที)
npm run build && npm start     # production
```

| สคริปต์ | คำอธิบาย |
|--------|-------------|
| `build` | บันเดิล CLI แบบสแตนด์อโลน |
| `start` | เริ่มบอท |
| `lint` / `format` / `check` | Biome |
| `test` | ทดสอบ (Bun) |
| `download-model` | GGUF จาก HuggingFace |
| `diagrams` | ส่งออกไดอะแกรม Mermaid เป็น SVG/PNG |

### การปรับใช้ PM2

```bash
./start.sh   # เปิด llm-server + llm-client ภายใต้ PM2
```

---

## บทสรุป

Luna Protocol ไม่ใช่แค่บอท Discord ที่มี LLM มันคือ**ระบบพฤติกรรมที่สมบูรณ์**ที่จำลองความไม่สมบูรณ์แบบของมนุษย์: การลืม การพิมพ์ผิด การนอน การลังเล ความเหนื่อยล้า ทั้งหมดถูกออกแบบรอบบัสอีเวนต์แบบชนิดข้อมูล พร้อมไดอะแกรม Mermaid 24 แบบที่บันทึกทุกโฟลว์

โค้ดเป็นโอเพนซอร์ส ชุดข้อมูลเป็นสาธารณะ และการตั้งค่าโหลดซ้ำได้ทันที ถ้าคุณสนใจ ลองดำดิ่งลงไปในโค้ด -- มันเข้าถึงได้ง่ายกว่าที่คิด

| แหล่งข้อมูล | ลิงก์ |
|-----------|------|
| พื้นที่เก็บ GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| ชุดข้อมูล | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| แผนที่ Atlas | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
