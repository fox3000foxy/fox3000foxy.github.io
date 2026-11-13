---
title: >-
  Sabaki ปะทะ System One : ดาวิดปะทะโกลิอัท โมเดลตัดสินใจที่เล็กที่สุดในโลก
description: >-
  20KB ปะทะ 421M พารามิเตอร์ Sabaki ยอมเสีย 7 แต้มบน typed-decisions แลกกับความเร็วจาก 25 วินาทีบน CPU เหลือต่ำกว่า 1ms แบบออฟไลน์ ชำแหละ MoE เชิงองค์กรแบบหมดเปลือก
date: 2026-11-12
tags:
  - ai
  - system-one
  - typescript
  - cpu
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "jNIaUWFBpYDheBt0L/UcwdFl4KHRyv29K1W4pchRiFQWBd/XrAS5B1XvSjRWrdJkLhHQuVKMxhqDd4BMLG6L3A=="
---

## บทนำ

ถ้าคุณสิงอยู่บน Hacker News หรือ Twitter มาตั้งแต่เดือนกันยา คุณต้องเคยเห็นชื่อ Jev ผ่านตาแน่ๆ

วันที่ 15 กันยายน 2026 TypeSafe เปิดตัว Jev ซึ่งเป็น "System One" ตัวแรกของพวกเขา Pitch จบในประโยคเดียว : เลิกให้ LLM ปั่น JSON เพื่อเลือก label ได้แล้ว โยน `state` กับคำถามแบบ typed ให้มัน แล้วมันจะคืนคำตัดสินใจแบบ typed พร้อมความน่าจะเป็นมาให้ รอบเดียว ไม่ต้อง sample token สักตัว ไม่ต้อง parse อะไรต่อข้างหลัง

มันระเบิดเลย วันแรกยอดใช้บน Vercel AI Gateway ทำสถิติ ลูกค้า Elixir โผล่มาห้ารายในไม่กี่วัน ทุกคนเอา Jev ไป benchmark เทียบของตัวเอง แล้วพูดตรงๆ กระแสนี้เข้าใจได้ เราทนเขียน prompt แบบ `ตอบกลับมา ONLY ด้วย {"choice": ...}` มาหลายปีแล้ว พร้อมภาวนาว่าโมเดลจะไม่มโน option เพิ่ม จะไม่ทำ JSON พัง จะไม่หลอน field ขึ้นมา Jev ตั้งชื่อให้ความต้องการนี้แล้ว ship เป็น API สะอาดๆ : `POST /v1/systemone` คำถามแบบ `choice / score / noul` คำตอบมี `probabilities` + `confidence`

ผมชอบไอเดียนี้มาก ไอเดียประหยัดน่ะ ชอบน้อยกว่าหน่อย และพูดให้ชัด ผมไม่เคยจ่ายเงินให้ Jev เลย

เพราะข้างหลัง Jev ยังเป็น API ปิด น้ำหนักไม่เปิด ไม่มี self-host ทุกคำตัดสินใจคือ network round-trip หนึ่งรอบบวกมิเตอร์ที่หมุนตลอด แล้วทางเลือก open ที่ตามมาก็ซัดไปราว 400M พารามิเตอร์ แถมบังคับใช้ GPU

ผมเลยสร้างขั้วตรงข้าม : [Sabaki](https://sabaki.fox3000foxy.com/) เราเตอร์ keyword บวก logistic regression ใน TypeScript ล้วนๆ ที่พูด contract เดียวกับ Jev (shape `choice / score / noul` เหมือนกัน endpoint `/v1/systemone` เหมือนกัน) แต่รันใน **ต่ำกว่า 1ms** ด้วย JSON **20 กิโลไบต์** โหมด nano ไม่มี dependency เลย ออฟไลน์ 0 บาท

เทียบให้เห็นภาพ : Laya คือ safetensors 843 MB ที่ต้องโหลด OpenDecider-nano คือ RAM 2 GB Sabaki nano invoices คือ 20 KB อัตราส่วนน้ำหนักราวๆ **40,000 เท่า**

ถ้าอยากได้เวอร์ชันแน่นๆ เป็นตัวเลข มี preprint v1 เดือนตุลา 2026 บนเว็บ : *Sabaki: An Organizational Mixture-of-Experts for Typed Decisions on CPU* ([PDF](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf)) ดีไซน์ ตัวเลขวัด tradeoff ครบหมด บทความนี้คือเวอร์ชันอ่านง่าย พร้อมโค้ดเปิดข้างๆ

ผมไม่ได้เขียนมันเงียบๆ คนเดียวแบบ benchmark กระดาษ ผม contribute ให้ [azalio/doomLaya](https://github.com/azalio/doomLaya) (fork ผมเอง : [fox3000foxy/doomLaya](https://github.com/fox3000foxy/doomLaya)) ซึ่งเป็น harness ที่ Laya กับ Jev เล่น FreeDoom กันจริงๆ แบบ decisions เป็นของโมเดล มี telemetry ทุก tick มีวิดีโอ ผมเห็นโกลิอัทเล่นจริงมาแล้ว และพอเน็ตกระตุก มันก็ร่วงเหมือนกัน

เราจะแงะเครื่องทีละตัว เช่นเคย เอาโค้ดจริงมาดูกัน

## สังเวียนที่ทุกคนยอมขึ้นชก

มี dataset เดียวที่ Jev, Laya และ OpenDecider อ้างถึงเหมือนกันหมด : [LocalLLaMA/typed-decisions](https://huggingface.co/datasets/LocalLLaMA/typed-decisions) 4 workflow สังเคราะห์ (support, invoices, security, agent traces) เคสละ 5 คำถาม train 1200 เคส test 400 เคส รวม 2000 คำตัดสินใจ

| โมเดล | พารามิเตอร์ | คะแนน test | Latency | รันที่ไหน |
|---|---|---|---|---|
| OpenDecider-nano | ~400M | 0.796 | 17ms GPU | GPU, RAM 2 GB |
| Laya typed-decisions | 421M | 0.766 | ~25s/state CPU, ~830ms/เคส MLX | GPU |
| Jev 1.13 | ปิด | ~0.73-0.75 | ~710ms API | API only |
| **Sabaki mini** | 22M int8 | **0.69** | **~20ms CPU** | CPU, 22 MB |
| **Sabaki nano** | ~0 | **0.61** | **<1ms** | ทุกที่ |
| Laya base zero-shot | 421M | 0.362 | เท่ากัน | GPU |

สุ่มมั่วได้ 0.318 ตอบเสียงข้างมากได้ 0.461 ฉะนั้น Laya base ที่ 0.362 แบบไม่ fine-tune คือระดับ "ตอบมั่วแบบสุภาพ" จำไว้ เดี๋ยวได้ใช้

7 แต้มห่างระหว่าง Sabaki กับที่หนึ่ง แต่ latency ห่างกัน 1000 เท่าในทิศกลับกันเวลาคุณไม่มี GPU บทความนี้สรุปได้ในสองประโยค ที่เหลือคืออธิบายว่าทำไม

แต่ระวัง : หลังปลั๊ก `choice / score / noul` อันเดียวกัน ครัวข้างในคนละเรื่องเลย Jev คือ API ปิด Laya คือ ModernBERT-large fine-tune OpenDecider คือ Ettin-encoder แบบ distill Sabaki คือการนับคำบวก MiniLM int8 contract เดียวกัน งบคนละจักรวาล

## Jev หมัดที่ทุกคนเห็น

ต้องให้เครดิต TypeSafe ตรงนี้ : contract แบบ System One เป็นไอเดียที่ดีจริงๆ

ก่อนหน้านี้จะแยก ticket สักใบ คุณต้องทำแบบนี้ : ขอ LLM ว่า "เลือกระหว่าง billing, technique กับ spam ตอบเป็น JSON เท่านั้น" แล้วมา parse คำตอบ แล้วยังต้องรับมือเวลามันตอบว่า "ผมว่า billing นะ! 😊" หรือมโนหมวดที่สี่ขึ้นมา ทุกคำถามเสีย token ทุกคำตอบพัง pipeline คุณได้

Jev เปลี่ยนดีล : คุณส่งข้อความบวกคำถามพร้อมเกณฑ์ไป มันประเมินแต่ละคำถามขนานกัน แล้วคืนค่าแบบ typed มาพร้อม distribution

```bash
curl https://api.typesafe.ai/v1/systemone \
 -H "Authorization: Bearer $KEY" \
 -H 'content-type: application/json' \
 -d '{"state":"charge double ce mois-ci","questions":{"dept":{"type":"choice","instructions":"Route ce message.","criteria":{"billing":"paiements","technical":"bugs"}}}}}'
```

คำตอบ : `{ choice, probabilities, confidence }` ไม่มี free text โค้ดคุณเอาไปต่อได้เลย

นี่คือเหตุผลที่มันไวรัล : SDK Python + JS, ปลั๊กอิน Claude Code, เชื่อม LangChain ทุกคนเสียบ agent ตัวเองได้ในบ่ายเดียว Doc ของ TypeSafe ยังดัน pattern ที่ดีด้วย : Jev ไว้ตัดสินเล็กๆ เร็วๆ โค้ด deterministic ล้อมรอบเพื่อประกอบคำตัดสินใจจริง LLM ตัวช้าหรือคนจริงมาเสียบตอน confidence ต่ำ

ปัญหาคือส่วนที่เหลือ น้ำหนักปิด ออฟไลน์หมดสิทธิ์ จ่ายราย call agent ที่ตัดสิน 100 ครั้งต่อ run โดนภาษีอ่วม สำหรับ Doom ที่ 35 ticks/s คือตายสนิท : ใน doomLaya Jev จบ MAP01 seed 48 ใน 68.97 วินาที ด้วย p50 HTTP 357ms run นี้มีค่า API $0.0046 ไม่ใช่บิลผม เป็นบิลของ benchmark มันรันได้ run สะอาด ไม่ตายเลย แต่ 357ms ที่ 35 ticks/s คือเกมเดินไป 12 ticks ระหว่างที่คุณรอเน็ต

Sabaki ลอก contract นี้มาทั้งดุ้น คำถามเหมือน คำตอบเหมือน endpoint `/v1/systemone` ที่เสิร์ฟโดย `serve()` เหมือนกัน แค่ตัดทุกอย่างที่ต้องใช้ datacenter ออก

## Laya ยักษ์ open ที่พิสูจน์ว่าทำได้โดยไม่ต้องพึ่ง API

[Laya](https://github.com/NandhaKishorM/laya) โดย Convai Innovations, Apache-2.0 ใต้ฝา : ModernBERT-large 421M มี 1 token `[MASK]` ต่อหนึ่ง option hidden state ของแต่ละ marker วิ่งผ่าน MLP เล็กๆ แล้ว softmax เหนือ option ของคำถาม รอบเดียวต่อคำถามเหมือน Jev

```python
pipe = pipeline("text-classification", model="convaiinnovations/laya-typed-decisions")
```

เลข 0.766 ควรหยุดดูหน่อย นี่คือ checkpoint **fine-tune บน train ของ benchmark** : 1200 เคส RLCD ใส่ gaussian noise บน logits reward แบบ log + spherical โมเดลตัวเดียวกันไม่ fit แบบนี้ร่วงไป 0.362 พูดง่ายๆ คือเดา ฉะนั้นคะแนน Laya คือ "encoder ตัวใหญ่บวกเทรนตรงโดเมน" ไม่ใช่ "encoder ตัวใหญ่แบบเวทมนตร์"

บน CPU มันคืออิฐก้อน Port ONNX ที่วัดได้วิ่งราว 25 วินาทีต่อ state บน MLX FP16 เฉลี่ย 830ms ต่อเคส p99 ล่อไป 5.3 วินาที แล้วยังต้องโหลด 843 MB ก่อนจะตอบอะไรสักคำ

ใน doomLaya Laya ตัว stock ล้มเหลว MAP01 ใน 180 วินาที ตัว v3 ที่ปรับแล้ว ([azalio/laya-doom-v3](https://huggingface.co/azalio/laya-doom-v3)) ซึ่งเทรนใหม่บน Doom โดยเฉพาะ จบใน 61.43 วินาที ด้วย p50 108ms บน MPS แถมเก็บ shotgun ระหว่างทาง ฉะนั้นใช่ มันเล่นได้ แต่ต้องเทรนเฉพาะทาง บน GPU Apple แถมมี executor แบบ script ทำของจริง (A*, ประตูแบบ latch 15 ticks, เล็งอัตโนมัติ)

สรุปของผม : ไม่เทรนตรงงานของคุณ Laya ก็แค่ที่ทับกระดาษ 421M เทรนแล้วมันโหดมาก แต่ต้องมี GPU กับ data ที่เข้าคู่กัน

## OpenDecider ตัวที่ชนะ leaderboard

[OpenDecider](https://github.com/manjunathshiva/opendecider) คือ Manjunath ที่ตัดสินใจมาเก็บทุกคนบน benchmark ของพวกเขาเอง ผลลัพธ์ : **0.796** ด้วย Ettin-encoder-400m full fine-tune บวกหัว MLP, loss แบบ KL บน soft target ที่ distill จาก Qwen3-235B + DeepSeek

```bash
pip install opendecider
# 17ms/คำถามบน L40S, 18ms บน M4 Max, ~9ms แบบ batch
```

ที่ coverage 50% selective accuracy ขึ้นไป 0.943 เทียบกับ Jev ที่ 0.882 บนกระดาษคือดีที่สุดทั้งสองโลก : open, calibrate มาดี, เร็ว

ของจริง : โหลด nano ต้องใช้ RAM 2 GB อยากได้ 17ms ต้องมี GPU, phishing ได้ 0.63 เทียบกับ Jev ที่ 0.90 (เจอ OOD แล้วโดนล้าง) และเหมือน Laya คือเทรนบน train ของ benchmark test ไม่เคยเห็น แต่โดเมนเคยเห็นแล้ว

มันชนะตอนวัดกล้าม แต่ก็ยังเป็น 400M ที่มี GPU อยู่ข้างหลัง คุณยัดมันลง Worker Cloudflare ไม่ได้ หรือยัดใน game loop บน laptop ไม่ได้

## พวก 150M กับหลุมข้างล่าง

openJev-verdict-2.0 (151M), julia-1 (144M หลายภาษา), Open Jev (150M), Largha-150M (144M en+zh), Vela (0.3B-9B) ทั้งหมดคือ ModernBERT หรือ mmBERT-small รันบน CPU ได้หมด เทรนง่าย (Open Jev เคลมว่า 30 นาทีบน T4 Colab) ตัวเลข self-reported โปรโตคอลคนละแบบ ฟังหูไว้หู แต่ตระกูลนี้มีอยู่จริง

generalist ของ Sabaki ทำได้ **22.7M** เล็กกว่าตัวเล็กสุดในกลุ่มนี้ราว 6.5 เท่า ไม่มีใครลงต่ำกว่า 100M เพื่อตอบคำถามที่กำหนดตอน runtime

นี่แหละความหมายของ "เล็กที่สุดในโลก" : ไม่ใช่คะแนนดีสุด แต่เป็นซองเล็กสุดที่อ่าน `instructions` + `criteria` ของคุณแล้วกล้าตัดสินตอนที่ไม่มี specialist คนไหนตอบได้

## Sabaki เราเตอร์โง่ๆ กับผู้เชี่ยวชาญแบบใช้แล้วทิ้ง

พอเรื่องพวกยักษ์ มาดูฝั่งดาวิดบ้าง เพราะตรงนี้แหละสนุก

Sabaki ไม่พยายามเป็นโมเดลใหญ่ฉลาดที่เข้าใจโลก มันคือ MoE เชิงองค์กร : 1 sparse router ระดับระบบ ผู้เชี่ยวชาญอิสระ ทำงานจริงทีละตัวต่อ input แต่ละปลั๊กอินคือ package npm แยกกัน มี manifest น้ำหนัก และเวอร์ชันของตัวเอง คุณติดตั้งเฉพาะทางที่คุณ route ไป

org [sabaki-js](https://github.com/sabaki-js) : 13 repo, core `sabaki` (129 commits), 6 ปลั๊กอิน `@sabaki-js/*`, น้ำหนัก, Cloudflare worker, template สำหรับเขียนของตัวเอง

`package.json` ของ core เล่าเรื่องหมดแล้ว :

```json
"dependencies": { "@typesafe-ai/sdk": "^0.7.0" },
"optionalDependencies": { "onnxruntime-node": "^1.22.0" }
```

โหมด nano ไม่มี dependency ตอนรันเลย มีแค่ TypeScript คอมไพล์ล้วนๆ ไม่มีอะไรให้ติดตั้ง ไม่มีอะไรพังระหว่างเวอร์ชัน ONNX

### เราเตอร์ หรือวิธีตัดสินใจในไม่กี่บรรทัด

เราเตอร์อยู่ใน `src/index.ts` และการ tokenize หน้าตาแบบนี้ (`src/index.ts:129`) :

```ts
function tokens(s: string): string[] {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/).filter((w) => w.length > 3);
}
```

ตัวเล็กหมด ตัด accent ทิ้ง เอาเฉพาะคำยาวเกิน 4 ตัวอักษร ฟิลเตอร์นี้ตัด noise ออกหมด ("le", "de", "ok") บน ticket support เรื่องนี้เปลี่ยนเกม เพราะ matching ของคุณวิ่งบนคำที่มีความหมายจริงๆ

ตัว scoring อยู่ใน `route()` (`src/index.ts:251`) และทั้งหมดตัดสินกันตรงนี้ :

```ts
const hits = kws.filter((k) =>
  words.some((w) => w.includes(k) || k.includes(w))).length;
const score = hits / Math.sqrt(kws.length);
```

matching แบบหลวมๆ ทั้งสองทาง : `billing` จับ `billed` ได้ `invoice` จับ `invoicing` ได้ หารด้วยรากที่สองเพื่อไม่ลงโทษลิสต์ keyword ใหญ่ๆ ไม่งั้นปลั๊กอินเมลที่มี 600 คำจะเหมาหมดทุกครั้งที่เมลมีคำว่า "hello"

แต่ละปลั๊กอินมี threshold ของตัวเอง ค่าเริ่มต้น 0.15 เก็บใน `src/index.ts:139` เมลใช้ 0.03 เพราะหัวข้อสั้น ต่ำกว่านั้น :

```ts
return { domain: "unknown", decision: null, confidence: 0, plugin: null };
```

โดเมนไม่รู้จักคือ `unknown` ไม่เคยมโนคำตอบเอาใจ เป็นความโง่โดยตั้งใจ และนี่แหละที่ทำให้ threshold `automate > 0.8` ใช้ได้จริงทีหลัง : เวลา Sabaki ตอบ คือ specialist ตัวจริง match เจอแล้ว

มีแกนภาษาแถมผ่าน `langid` : ปลั๊กอินที่ประกาศ `languages` จะแข่งเฉพาะภาษาของตัวเอง สะดวกเวลาจะแยก phishing ละตินกับ CJK ข้อความสั้นเกินไปคือไม่กรอง ทุกคนแข่งหมด

ต้นทุนรวม : ไม่กี่ไมโครวินาทีต่อคำตัดสินใจ ไม่มี matrix ให้คูณ ไม่มีเน็ตให้เรียก มีแค่เทียบ string กับหารเลข

### Nano ไฟล์โปรดของผมใน repo

`src/logreg.ts:28` ส่วน tokenize :

```ts
function tokens(s: string): string[] {
  const words = s.toLowerCase().split(/[^a-z0-9]+/)
    .filter((w) => /^[a-z]{3,}$/.test(w));
  const out = [...words];
  for (let i = 0; i < words.length - 1; i++)
    out.push(`${words[i]} ${words[i + 1]}`);
  return out;
}
```

unigram บวก bigram `charged twice` ได้ `charged`, `twice` และคู่ `charged twice` แค่นี้พอจับ "เก็บเงินซ้ำ" ได้โดยไม่ต้องงัด transformer 400M

`src/logreg.ts:46` ส่วน vectorize ตรงที่ TF-IDF ทำงาน :

```ts
const tf = 1 + Math.log(c);  // TF แบบ sublinear
const val = tf * w.idf[i]!;  // IDF แบบ smooth สไตล์ sklearn
```

คำที่โผล่ครั้งที่สิบน้ำหนักน้อยกว่าครั้งแรก คำหายากน้ำหนักมากว่า "please" สูตร sklearn เป๊ะๆ ตรวจ parity แล้วบน 20 คำถาม

แล้วคอมเมนต์ที่ทำให้ผมยิ้มตอนกลับมาอ่าน :

```ts
// แตะเฉพาะเทอมที่มีอยู่ (sparse) แทนการกวาด 3000 มิติ
for (const [t, c] of counts) {
```

แทนที่จะกวาด 3000 มิติทุก ticket คุณแตะแค่ยี่สิบกว่าคำที่มีอยู่จริง นี่คือเหตุผลที่ตอบในต่ำกว่า 1ms รายละเอียดเล็กๆ ที่มองไม่เห็นแต่เปลี่ยนทุกอย่างใน prod เพราะ complexity วิ่งตามขนาด ticket ไม่ใช่ขนาด vocab

`src/logreg.ts:86` ส่วน inference จบในสามบรรทัด :

```ts
// ไบนารี : coef บรรทัดเดียว + sigmoid
const pPos = 1 / (1 + Math.exp(-s));
// หลายคลาส : dot product + softmax แล้ว argmax
```

dot product หนึ่งครั้ง sigmoid หรือ softmax แล้วแต่จำนวนคลาส รอบเดียวจบ ไม่สร้าง token สักตัว ฉะนั้นไม่มี JSON พังให้ต้องซ่อมด้วย retry กับ heuristic parse

สูตร `train.py` : workflow ละ 300 train / 100 test split แบบ deterministic (test 1 ชิ้นทุก 5 ชิ้นเพื่อเลี่ยง bias เวลา) vocab 3000-6000 ปัด coef ที่ 1e-4 วัดแล้วไม่เสียอะไรเลย export เป็น JSON `{ vocab, idf, questions }`

น้ำหนัก : 20 KB สำหรับ invoices (`duplicate` 0.89) ถึง 650 KB สำหรับเมล (`bucket` 0.889) ขนาดที่ยัดลง bundle frontend ได้สบายๆ

รายละเอียดที่ผมอึ้ง : บนเมล MiniLM เสมอกับ TF-IDF ที่ +/-0.02 ฉะนั้น nano ship ตามนั้น ใครจะจ่าย GPU เพื่อแยกเมล ผมขอบาย แต่ agent_trace ติด (`needs_review` 0.59 ใน nano) : ข้อความ observability มันจืด ไม่มีคำไหนแบกคำตัดสินใจได้จริง

โรงงานที่เปลี่ยนน้ำหนักเป็นปลั๊กอินอยู่ใน `src/plugin.ts:52` :

```ts
export function nanoClassifier(manifest, weights, opts = {}) {
  return definePlugin({ manifest,
    classify: (input) => {
      const r = predict(`${from}${input.state}`, weights, q);
      return { decision: r.decision, confidence: r.confidence, domain: manifest.domain };
    }});
}
```

`decide()` ยัง sync ใน nano `decideAsync()` ปลดล็อก ONNX ให้ mini สองทาง กฎง่ายๆ : ถ้าต้อง async แปลว่าคุณอยากได้ mini ไม่งั้น nano พอ จำง่ายตอนโค้ด debug ง่ายตอนพัง

ให้ดูว่าไม่ใช่แค่ทฤษฎี นี่คือหน้าตาการใช้จริง :

```ts
import { Sabaki } from "sabaki";
import customerService from "@sabaki-js/customer-service";

const sabaki = new Sabaki().register(customerService);
sabaki.decide({ state: "charged twice, refund please" });
// { decision: "billing", confidence: 0.31, domain: "customer_service" }
```

### Mini 22 MB ที่เปลี่ยนเกมบนเคสยาก

Nano มีขีดจำกัด คุณเห็นแล้วบน agent_trace ข้างบน MiniLM-L6 มารับช่วงต่อ : encoder กลางตัวเดียวทั้งโดเมน บวกหัว linear ต่อคำถาม Fine-tune end-to-end 8-12 epochs, lr 2e-5 บน GPU CUDA ตอนเทรน (ตอน inference ยัง CPU นี่คือประเด็น)

ตัวเลขที่ตัดสิน วัดบน split เดียวกัน :
- encoder แช่แข็ง + MLP : 0.65
- full fine-tune : 0.68
- distill 400M ลง embeddings แช่แข็ง : ลองแล้ว โยนทิ้ง แพ้ gold label

export ONNX ผ่าน dynamo ตรวจ parity เป๊ะ แล้ว quant int8 แบบ dynamic : 90 MB เหลือ 22 MB เสีย accuracy **0.004** บน customer_service ECE เท่าเดิมหรือดีกว่า ทุก export วัดใหม่หมด ไม่งั้น optimize ไปก็ไร้ความหมาย

ตั้งแต่ 1.0.2 น้ำหนักฝังใน package (`models/<workflow>-int8/` + export `modelDir`) `npm i` จบ โหมดเครื่องบินก็รอด อัปเดตคือปล่อย patch เซ็นผ่าน trusted publishing

ของจริง : `needs_review` จาก 0.59 ขึ้นไป **0.82** `disposition` 0.73 ไป 0.76 ECE ต่ำกว่า 0.14 ทุกที่ พร้อมความลังเลแบบ OOD ที่ดี (0.2-0.5 บนมังกร สูตรอาหาร และ string ว่าง) ความลังเลนี่แหละที่ทำให้ threshold โหดๆ ใน prod เป็นไปได้

### Generalist ตาข่ายกันตกที่ทำให้ Sabaki เป็น System One จริงๆ

Jev กับตัวอื่นตอบได้ทุกอย่าง : คำถามอะไรก็ได้ option อะไรก็ได้ กำหนดตอน runtime ได้หมด นี่คือ contract System One ที่ทำให้ Jev ไวรัล คุณวาง `instructions` + `criteria` กับ option ของคุณเอง มันตัดสินให้

specialist ของ Sabaki ทำแบบนั้นไม่ได้ มันรู้จักแค่คำถามของตัวเอง (`category`, `duplicate`, `bucket`) อย่างอื่นไม่รู้ ไม่มีตาข่าย Sabaki จะคืน `unknown` ทันทีที่หลุดสคริปต์ ตรงที่ Jev ยังตอบอะไรสักอย่างเสมอ

generalist คือตาข่ายนั้น cross-encoder ที่อ่านคำถาม + option + state แล้วพ่น score รอบเดียวต่อ option softmax แล้ว argmax 22.7M MiniLM int8 เล็กกว่าพวก 144-151M ราว 6.5 เท่า แต่งานมันไม่ใช่คะแนน งานมันคือความเข้ากันได้ : เสียบมันเป็น fallback แล้ว `POST /v1/systemone` จะรับ state กับคำถามอะไรก็ได้เหมือน Jev field `model` บอกว่าใครตอบจริง (`@sabaki-js/mail@1.1.2+mini`, `sabaki-generalist-v1`...) ฝั่งคนเรียกไม่ต้องเปลี่ยนอะไร

และสำคัญสุด มันคือ fallback ไม่ใช่หัวหน้า กฎทองใน `decideAsync()` : ถ้า specialist ชนะ routing มันตอบ generalist พูดเฉพาะตอน `unknown` เท่านั้น ไม่มีกลับกัน กันไม่ให้ generalist กลางๆ มาทับ specialist เก่งๆ ในบ้านมันเอง

loader อยู่ใน `src/generalist.ts` มี cache ต่อโฟลเดอร์เพื่อไม่โหลด session ONNX ใหม่ทุก call :

```ts
export function loadGeneralist(modelDir: string) {
  // cache ตามโฟลเดอร์ ใช้ session ONNX เดิมซ้ำ
  // tokenizer.json แบบ Unigram หรือ wordpiece ตรวจอัตโนมัติ
  const sess = await ort.InferenceSession.create(
    path.join(modelDir, "generalist.onnx"),
    { intraOpNumThreads: 2 },
  );
}
```

คุณชี้ `SABAKI_GENERALIST_DIR` ไปโฟลเดอร์ที่มี `generalist.onnx` + `tokenizer/` โมเดลสลับได้ id มาจาก `config.json` ไม่งั้นคือ `"sabaki-generalist"` cache แบบ `Map` กันโหลด session ซ้ำทุก call

ฟอร์แมต input คือ cross-encoder คลาสสิก : คำถาม option และ state ต่อกันด้วย separator บรรทัดละ option ที่จะ score :

```ts
const texts = options.map(
  (o) => `${input.question ?? "decision"} [SEP] ${o} [SEP] ${input.state}`,
);
```

คำถาม + option + state คั่นด้วย `[SEP]` บรรทัดละ option option ตัดที่ 8 (`slice(0, 8)`) ไม่ให้มาก็ใช้ default `["yes", "no"]` เกินนั้นไปตัดฝั่งคนเรียก 8 ก็กว้างพอสำหรับคำตัดสินใจแบบ typed แล้ว

แล้วก็ batch แบบฉลาดเล็กๆ ที่ดูไม่แพงแต่หาร latency ด้วยจำนวน option แทนที่จะ `session.run` ทีละ option ส่งหมดใน forward เดียว :

```ts
// forward เดียวแบบ batch ครบทุก option
// (pad ให้ยาวเท่าตัวที่ยาวสุด) แทน run ทีละ option
const L = Math.max(...encs.map((e) => e.ids.length));
// ids + attention_mask เป็น [options.length, L] pad ด้วย padId
const out = await sess.run({ input_ids, attention_mask });
const scores = Array.from(out["score"].data).map(Number);
```

แต่ละข้อความถูก encode (wordpiece สไตล์ BERT หรือ unigram SentencePiece แล้วแต่ `tokenizer.json`) pad ให้ยาวเท่าตัวที่ยาวสุดใน batch ซ้อนเป็น tensor `[จำนวน_option, L]` `sess.run` ครั้งเดียว ได้ score ต่อ option บน CPU เรื่องนี้เปลี่ยนโลก : 20-36ms แทนที่จะคูณแปด

แล้วก็ softmax + argmax พร้อม proba ครบทุก option ในฟอร์แมตเดียวกับที่ Jev ทำให้ดัง :

```ts
const pr = softmax(scores);
// bi คือ index ของค่ามากสุด
const confidence = Math.round(pr[bi] * 1000) / 1000;
const probs = Object.fromEntries(
  options.map((o, i) => [o, Math.round(pr[i] * 1000) / 1000]),
);
```

และรายละเอียดที่ทำให้ใช้ใน prod ได้จริง ไม่ใช่แค่เดโม คือ `abstainAt` :

```ts
if (input.abstainAt !== undefined && confidence < input.abstainAt) {
  return { decision: null, confidence, domain: "generalist", probabilities: probs };
}
```

opt-in ไม่ abstain เป็น default คุณส่ง `abstainAt: 0.6-0.7` แล้วทุกอย่างที่แกว่งจะคืน `null` แทนเดา เพราะ softmax พ่น 1.00 ออกมาแม้ตอบผิดนอก distribution ไม่ใช่ของฟุ่มเฟือย GUIDE แนะนำสำหรับงาน autonomous ทุกแบบ : ต่ำกว่า threshold ให้ถามเพิ่มแทน auto-resolve

สุดท้าย นี่คือโครงเดียวกันแบบเสียบ fallback generalist : พอไม่มี specialist match มันรับช่วงแทนคืน `unknown`

```ts
import { Sabaki, definePlugin, loadGeneralist } from "sabaki";
import mail from "@sabaki-js/mail";

const backend = loadGeneralist(process.env.SABAKI_GENERALIST_DIR!);
const generalist = definePlugin({
  manifest: { name: "@sabaki-js/generalist", domain: "generalist",
    version: "0.1.0", questions: ["decision"], keywords: [] },
  classify: (input) => backend.decide(input),
});

const sabaki = new Sabaki().register(mail).setFallback(generalist);

await sabaki.decideAsync({
  state: "le client dit que l'app a supprimé ses données",
  question: "c'est urgent ?",
  options: ["yes", "no"],
  abstainAt: 0.65,
});
// specialist เมลถ้า routing เข้า ไม่งั้น generalist รับแบบ catch-all สไตล์ Jev
```

รุ่น generalist วัดเหมือนกันหมดบน PhishNChips (เมล 2000 ฉบับ) กับ test typed-decisions เพื่อเทียบที่เทียบได้ :
- v4 : test 0.29, R=0.026 phishing โยนทิ้งได้เลย ตอบคนละเรื่อง
- A (22M 80k) : 0.546, R=0.406 เริ่มเป็นรูปเป็นร่าง
- mini v1 ที่เสิร์ฟอยู่ : **0.536, R=0.616** ตัวที่รันบนเว็บ Recall phishing ใช้ได้ test กลางๆ
- B (144M scratch) : 0.568, R=0.062 ใหญ่กว่า test ดีกว่านิดเดียว phishing กาก

ตัว 144M from scratch ที่ transfer ไม่ดีกว่า ทำผมเลิกคิดว่า "ใส่ param เพิ่มแล้วจะ generalize ดี" งานเท่ากัน ตัวใหญ่แพงกว่าโดยไม่ได้เดาเก่งกว่า แม้เป็น catch-all ตัวเล็กก็เอาอยู่ และมันยัง EN-only (`all-MiniLM-L6-v2`) routing EN, FR คือนอก distribution งาน FR ต้องผ่าน specialist ที่เทรนตรง ไม่ใช่ generalist

## Doom บทสอบเดียวที่มีความหมายจริงๆ สำหรับผม

doomLaya คือ Laya กับ Jev เล่น FreeDoom กันจริงๆ โมเดลเลือก `command / target / weapon` executor วาง path A* เปิดประตู เล็ง ยิง telemetry ทุก tick มีวิดีโอ มี SHA ของ run ผม contribute อยู่ ฉะนั้นไม่ได้พูดจาก leaderboard ที่อ่านผ่านๆ

v0.1.0, MAP01 seed 48, skill 3, 35 ticks/s, executor เดียวกัน :

| โมเดล | ผลลัพธ์ | p50 HTTP | ค่า API |
|---|---|---|---|
| Laya stock | ล้มเหลว 180s | 106ms | $0 |
| Laya v3 แบบปรับแล้ว | จบ 61.43s | 108ms | $0 |
| Jev 1.13 | จบ 68.97s | 357ms | $0.0046 |

จบสวยสอง run ไม่ตาย Laya เก็บ shotgun ระหว่างทางเพราะ executor จัด pickup เอง ซื่อสัตย์หน่อย : Laya v3 เทรนบน Doom มา Jev ไม่ได้เทรน seed เดียว map เดียว พิสูจน์อะไรกว้างๆ ไม่ได้ README ของโปรเจกต์เขียนไว้ตรงๆ และน่านับถือที่ไม่ขายเกินจริง

ฝั่ง Sabaki ([plugin-doom](https://github.com/sabaki-js/plugin-doom)) : ViZDoom ใน Python เรียกเซิร์ฟเวอร์ JS ทุก tick nano ราว 18k req/s, mini ราว 71 req/s บน thread i5 เดียว tick 35Hz สบายๆ แม้บน laptop กลางๆ

ใส่เข็มทิศทางออก mini จบ MAP01 ได้ 2-4 run จาก 6, nano 0/6 สมเหตุสมผล : ข้อความเสียมิติ spatial state แบบ doomLaya ตันราว 0.57 ทั้ง MiniLM และ ModernBERT-base พอข้อมูล spatial หาย ไม่มี classifier ข้อความตัวไหนเสกมันกลับมาได้

เพื่อนบ้านแข่งซ้ำด้วยข้อมูลเท่ากัน : [doomgemma](https://github.com/dexmac221/doomgemma) ใส่ LoRA 27 นาทีบน RTX 4070 แล้วพา Gemma 4 E2B ขึ้นชั้น Laya v3 ตอนเล่น (6/6 เทียบ 6/6) และเหนือกว่าตอนตัดสินเดี่ยวๆ ขนาดเท่ากัน decoder เร็วพอๆ กับ Laya (270M : 22ms เทียบ 23ms) ผลเท่ากัน Laya ยังเร็วกว่าราว 3 เท่าเพราะทำได้ด้วยโมเดลเล็กกว่า

มุมมองผม : เทรนตรงงานสำคัญกว่าสถาปัตยกรรม specialist ตัวเล็กที่เทรนมาตรง ชนะ generalist ตัวใหญ่ที่เพิ่งมาเจอ นี่คือเดิมพันของ Sabaki เปเปอร์ตามมา *System Switch* ([arXiv:2610.09683](https://arxiv.org/abs/2610.09683)) ดันตรรกะนี้สุดทาง : โมเดลเล็กเร็วเล่นไป โมเดลใหญ่สาย reason เสียบตอน gate เปิด pre-triage ของ Sabaki (`automate > 0.85 ไม่งั้น escalate`) เอามาใช้กับเกมนั่นเอง

## สิ่งที่ยอมทิ้ง

ทุกฟีเจอร์ที่หายไปจ่ายให้อีกอย่าง นี่คือกฎตอนเล็ง CPU ลิสต์แบบซื่อสัตย์ เหมือนตอน Bareiron ที่ C ทุกบรรทัดคือ tradeoff :

**Sabaki ไม่เล่าเรื่อง** มันเลือกตัวเลือกที่คุณยื่นให้ พร้อม proba อยากได้คำอธิบาย สรุป หรือ free text ไปเอา LLM

**ภาษาฝรั่งเศสยังนอก distribution ของ generalist** routing EN (`all-MiniLM-L6-v2`) probe ได้ FR 1/4 เทียบ EN 3/4 บนเคสคล้ายกัน ปลั๊กอินเมลมาจากกล่องที่ส่วนใหญ่เป็น FR แต่ anonymize แล้ว : 0 PII เสีย accuracy ไป 0.024 เพื่อแลก vocab ที่ไม่มีคำส่วนบุคคล anonymize มีราคา แต่ต่อรองไม่ได้

**softmax มั่นเกินตอนหลุดโซน** เห็น false ที่ 1.00 มาแล้ว ใช่ เลยต้องมี pre-triage ตาม GUIDE : `abstainAt: 0.6-0.7` เพื่อคืน `null` ใต้ threshold แล้ว gate `confidence > 0.85` ค่อย automate นอกนั้นส่งคน จุดอ้างอิงที่วัดแล้ว : recall phishing 0.62 ที่ precision 0.87 มากพอผ่าคิวเป็นสองกอง ไม่พอไล่ reviewer ออก

**Nano ลำบากบน agent traces** 0.34 ถึง 0.59 แล้วแต่คำถาม Mini ดัน `needs_review` ไป 0.82 ได้ แต่ `risk / urgency / action` ยังหิน ข้อความ observability มันจืด สัญญาณ lexical น้อย

**Doom แบบข้อความตัน** ราว 0.57 ทั้ง MiniLM และ ModernBERT-base ตราบใดที่อยู่บนข้อความไม่มี pixel MAP02 บล็อกคุณแน่ ทางที่เชื่อได้สำหรับผู้เล่นจริงคือ vision + RL (tiny-doom-defender 1.1M param จาก pixel) ไม่ใช่ classifier ข้อความที่ดีกว่า

**benchmark ดริฟต์เป็น batch** typed-decisions สร้างเป็นล็อต split เวลาเลยกลายเป็น split ของ batch จริงๆ `drift_tool.py` ได้ 0.82 บน customer_service, 0.67 บน agent_trace (0.5 คือแยกไม่ออก) ผลที่วัดได้ : น้ำหนักที่ปล่อยทำ 0.733 แบบผสม เทียบ 0.61 บน split ทางการ เลขทางการเลยค่อนข้าง conservative การ calibrate แบบ Platt / temperature+bias ไม่ย้ายข้าม batch ฉะนั้น ship แค่ temperature scaling ที่ calibrate บน batch ล่าสุด กฎบ้าน : รัน `drift_tool.py` ก่อน เตือนเหนือ 0.6 บล็อกเหนือ 0.8 ไม่มีใครปล่อยของแบบนี้ แต่ทุกคนควรทำ

## ผลสุดท้าย ตัวเลขในมือ

ฝั่งหนึ่งคือ i5 บน laptop อีกฝั่งคือ API ที่คิดเงินราย call แต่ละโหมดให้ของจริงแบบนี้ :

- nano : <1ms, ราว 18k req/s, 20-650 KB, 0 dep
- mini : ~20ms, ราว 71 req/s, 22 MB int8, onnxruntime แบบ optional
- generalist : 20-36ms, 22.7M, generalist open เล็กสุดที่ผมรู้จัก

โหลดหลายโดเมน : RAM ราว 0.5 GB แบบ lazy-load รายโดเมน แทน 2 GB แบบเหมาหมด deterministic : input เดียวกัน 100/100 ให้ output เดิม threshold รายคำถาม gate บน `confidence` คืน `unknown` ตอนไม่มีอะไร match

บน Bareiron รันผู้เล่น 3 คนขึ้นไปแล้วอืด เพราะผู้เล่นหนึ่งคนกิน chunk ละ 200ms ที่นี่รัน 3 โดเมนขึ้นไปสบาย เพราะผู้เชี่ยวชาญแต่ละตัวจิ๋วและโหลดตามต้องการ แทนที่จะโหลดตูมเดียว ปรัชญา "เล็กแต่พอ" ตัวเดียว เอามาใช้กับ hardware อีกแบบ

## ปรัชญา

p2r3 เคยว่าไว้ : *"ผมแค่ชอบไอเดียที่ว่าชิปจิ๋วราคา 1 ดอลลาร์รันอะไรล้ำๆ อย่าง Minecraft ได้"*

อารมณ์เดียวกันตรงนี้ : ผมชอบไอเดียที่ JSON 20 KB กับ TS ร้อยกว่าบรรทัดเสียบแทน call GPU เพื่อเลือก label ได้สักใบ แน่นอนมันแทนทุกอย่างไม่ได้ อย่ามั่ว มันแทนเคสน่ารำคาญที่คุณอยากได้ label ในไม่กี่ ms แบบ local พร้อม confidence ที่ threshold ได้จริงๆ แทนที่จะหลับตาลุ้น

tradeoff เขียนไว้ขาวดำ :
- encoder ไปนับคำ : เสีย 7 แต้ม latency หารพัน infra เป็นศูนย์
- โมเดลใหญ่ตัวเดียวไปปลั๊กอิน npm : gate หยาบกว่า ops ง่ายกว่าเยอะ
- generation ไปคำตัดสินใจแบบ typed : จบเรื่อง parse พังกับ option มโน
- confidence ดิบไป pre-triage : abstain ก่อน automate เหนือ 0.85 ที่เหลือนส่งคน

**3 อย่างที่อยากให้จำ :**

1. **เสีย 7 แต้ม เร็วพันเท่า** : 0.61/0.69 เทียบ 0.75-0.80 แต่ <1ms/20ms CPU ออฟไลน์ เทียบ 25 วินาทีบน CPU หรือ API จ่ายเงิน คะแนนที่ไม่มีต้นทุนกำกับไม่มีความหมาย
2. **เราเตอร์ง่ายๆ บวกผู้เชี่ยวชาญแยกกัน** : `hits / sqrt(keywords)` threshold `unknown` แต่ละปลั๊กอินเทรน version และ ship เดี่ยวๆ บนเมล TF-IDF เสมอ MiniLM : ตรงนี้ GPU ไม่ช่วยอะไร
3. **ออฟไลน์ก่อน พร้อม calibrate แบบซื่อสัตย์** : `npm i` น้ำหนักฝังมา 0 GPU ECE ต่ำกว่า 0.14 มี abstain มี drift tool stack เดียวในกลุ่มเทียบที่ยืน game loop 35Hz ได้โดยไม่ต้องมี GPU

ถ้าโปรเจกต์โดนใจ ทุกอย่าง MIT บน [github.com/sabaki-js](https://github.com/sabaki-js) เวอร์ชันวิชาการพร้อมตัวเลขและ bibtex คือ [preprint v1](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf) ถ้าอยากเห็นโกลิอัทเล่น Doom จริงๆ ไปที่ [azalio/doomLaya](https://github.com/azalio/doomLaya) xD
