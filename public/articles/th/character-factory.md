---
title: "สร้าง character-factory : อวาตาร์ที่มีพันธุกรรม"
description: "โมดูล TypeScript ที่ทำงานบน DiceBear: สร้างอวาตาร์ที่สอดคล้อง
กันตามประเทศ/เชื้อชาติ, เอนจินพันธุกรรมขนาดเล็กสำหรับสร้างลูกหลาน, และ
รายละเอียดทางวิศวกรรมที่ทำให้มันใช้งานได้จริงในเกมการ์ด"
date: 2026-05-16
aiGenerated: true
tags:
  - typescript
  - npm
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "MEUCIFTZbKsxHKh4gNN6iLSxMvrFIYm8p7vBJ8CmcNEuKGO5AiEA0T9InoxBkUBTiyn3eRXMlzINMUaAJay15ccnLLXJtvY="
---

# สร้าง character-factory : อวาตาร์ที่มีระบบพันธุกรรม

ผมต้องการอวาตาร์ที่ดูสมจริงและแตกต่างกันเป็นพัน ๆ ตัวสำหรับ [Kurekuta](https://github.com/fox3000foxy/kurekuta/) -- โปรเจกต์เกมการ์ดส่วนตัวที่การ์ดแต่ละใบมี "DNA" ของตัวละครที่เอนจินเรนเดอร์เปลี่ยนเป็นภาพพอร์ตเรต การซื้อแพ็คสำเร็จรูปก็ดูออก การสร้างอวาตาร์ DiceBear ด้วย seed ต่อตัวละครก็ให้ผลลัพธ์ที่ไม่แน่นอน : การ์ดแนวญี่ปุ่นอาจได้ตัวละครสาวผมบลอนด์สแกนดิเนเวีย และ "พี่น้อง" สองคนกลับดูไม่ใช่คนรู้จักกันเลย

ผมเลยเขียน [character-factory](https://github.com/fox3000foxy/character-factory) -- โมดูล TypeScript ที่ทำงานบนชุด Lorelei ของ DiceBear ซึ่งเพิ่มสามสิ่งที่ DiceBear อย่างเดียวทำไม่ได้ : **โปรไฟล์ประชากรที่สอดคล้องกัน**, **เอนจินพันธุกรรมขนาดเล็ก**, และ **builder ที่ใช้งานง่าย** สะดวกต่อการเรียกใช้จากลูปเกม

## มันทำอะไรได้บ้าง

ตัวอย่างสั้นที่สุดที่ใช้งานได้ :

```ts
import { CharacterFactory, Country, Mood } from "character-factory";

const svg = new CharacterFactory()
  .setCountry(Country.Japan)   // ถ่วงน้ำหนักเชื้อชาติ → ผิว/ผม/ทรงผม/หนวดเครา ที่สอดคล้องกัน
  .setMood(Mood.Happy)
  .buildSvg();
```

การเรียกใช้เพียงเท่านี้จะสุ่มเชื้อชาติโดยถ่วงน้ำหนักตามประชากรญี่ปุ่น, จับคู่สีผิวและสีผมที่เข้ากัน, เลือกทรงผมในกลุ่มย่อยตามเพศที่เหมาะสม, จากนั้นล็อคดวงตา/คิ้ว/ปากเป็นโหมด "มีความสุข" ผลลัพธ์ที่ได้คือ SVG หรือหากติดตั้ง `sharp` ก็จะได้ PNG ที่ขนาดตามต้องการ

ตัวละครแต่ละตัวเป็นแค่อ็อบเจกต์ `CharacterConfig` -- ใบหน้า, ผม, อุปกรณ์เสริม, การนำเสนอ builder จะปรับเปลี่ยนภายใน และคุณสามารถส่งออกเป็น JSON, base64 หรือไฟล์ แล้วโหลดกลับมาเหมือนเดิม สำหรับ Kurekuta นี่เป็นสิ่งสำคัญ : การ์ดเก็บ config ไม่ใช่ภาพที่เรนเดอร์แล้ว ดังนั้นอาร์ตเวิร์กจึงสามารถสร้างซ้ำได้เสมอ และขนาดการ์ดก็เล็กมาก

## โปรไฟล์ประชากรที่สอดคล้องกัน ไม่ใช่พิกเซลสุ่ม

ตัวเลือกของ DiceBear เป็นตัวเลือกแบบสม่ำเสมอ ใส่ `["#ffdbb4", "#2c1b18"]` สำหรับสีผิว แล้วคุณจะได้สีใดสีหนึ่งด้วยความน่าจะเป็นเท่ากัน -- ใช้ได้กับโลโก้ แต่ไร้ประโยชน์สำหรับ "ขอตัวละครจากบราซิลหน่อย"

`character-factory` มาพร้อมกับไปป์ไลน์ ประเทศ → เชื้อชาติ → ลักษณะ :

```ts
// สิ่งที่อยู่ในโมดูล :
ethnicitiesByCountry[Country.Brazil] = [
  { ethnicity: Ethnicity.WestEuropean,  weight: 35 },
  { ethnicity: Ethnicity.BlackAfrican,  weight: 25 },
  { ethnicity: Ethnicity.Latino,        weight: 30 },
  // ...
];

ETHNICITY_PROFILES[Ethnicity.EastAsian] = {
  skinColors: [
    { color: SkinColor.Light,  weight: 35 },
    { color: SkinColor.Warm,   weight: 40 },
    { color: SkinColor.Medium, weight: 20 },
    // ...
  ],
  hairColors: [/* ส่วนใหญ่เป็นสีดำ/น้ำตาลเข้ม ไม่มีบลอนด์ */],
  hairCuts:   { male: [...], female: [...] },
  beardProbability: 0.15,
};
```

แต่ละชั้นเป็นการสุ่มแบบถ่วงน้ำหนัก ค่าน้ำหนักไม่ใช่วิทยานิพนธ์ทางสังคม -- เป็นฮิวริสติกที่ป้องกันไม่ให้ "มาจากญี่ปุ่น" ได้คนผมแดง หรือ "มาจากสวีเดน" ได้คนผมดำสนิท ทั้งไปป์ไลน์ทำงานด้วยการเรียกเพียงครั้งเดียว : `setCountry(country)` หรือ `randomizeFromCountry(country, gender?)`

## เอนจินพันธุกรรมขนาดเล็ก

ฟังก์ชันที่สนุกที่สุดในการเขียน : `projectChild` สอง factories สามารถสร้างลูกที่มีลักษณะสืบทอดแบบเด่นทางชีวภาพโดยประมาณ :

```ts
const parentA = new CharacterFactory().setCountry(Country.Sweden);
const parentB = new CharacterFactory().setCountry(Country.Japan);
const kid     = parentA.projectChild(parentB.getConfig());
```

เบื้องหลังเป็นโมเดลที่ตั้งใจให้เล็กมาก พ่อแม่แต่ละคนมีจีโนไทป์แบบ 2 อัลลีล สุ่มจากแต่ละฝ่าย รวมกันเป็นเด่นหรือด้อย :

```ts
function combine(a: Allele, b: Allele): "dominant" | "recessive" {
  return a === "D" || b === "D" ? "dominant" : "recessive";
}
```

ลักษณะที่มีแกนความเด่นจริง (ผิว, ดวงตา, ผม) ถูกกำหนดโดยลิสต์ลำดับที่ชัดเจน -- สีเข้มเด่นกว่าสีอ่อน, ตาสีน้ำตาล/ดำเด่นกว่าสีฟ้า, ผมดำสนิทเด่นกว่าผมบลอนด์ :

```ts
const HAIR_DOMINANCE_ORDER = [
  HairColor.LightBlonde,   // ด้อยที่สุด
  HairColor.GoldenBlonde,
  HairColor.HoneyBlonde,
  HairColor.Auburn,
  HairColor.Red,
  HairColor.Copper,
  HairColor.LightBrown,
  HairColor.Brown,
  HairColor.DarkBrown,
  HairColor.SoftBlack,
  HairColor.JetBlack,      // เด่นที่สุด
] as const;
```

`resolveByRank` หา index ของพ่อแม่แต่ละคน เลือกค่าสูงสุดเมื่อรวมอัลลีลแบบ "เด่น" และค่าต่ำสุดเมื่อเป็น "ด้อย" สีแฟนตาซี (ชมพูพาสเทล, ม่วง) ไม่ได้อยู่ในลำดับ -- มันสุ่ม 50/50 ซึ่งเป็นพฤติกรรมที่ถูกต้อง : มันไม่ใช่ลักษณะทางชีวภาพ ดังนั้นความเด่นจึงไม่มีความหมาย

กระจุดจำลอง MC1R : 75% ถ้าพ่อแม่ทั้งสองมี, 25% ถ้ามีเพียงคนเดียว, 0% ถ้าไม่มี เคราขึ้นอยู่กับ SRY : ถูกลบออกถ้าเด็กเป็นผู้หญิง ไม่เช่นนั้นก็สืบทอดจากพ่อแม่ที่มีเครา ทรงผมไม่ใช่เรื่องชีวภาพ -- เป็นเรื่องวัฒนธรรม ดังนั้นเด็กจึงสุ่มจาก pool ของเพศตนเอง โดยคง texture ไว้ถ้าเป็นไปได้

ไม่มีอะไรที่เป็นพันธุศาสตร์ระดับตีพิมพ์ มันเป็นชั้นของความรู้สึก : เด็กดูเหมือนการผสมผสานที่ plausible ของพ่อแม่ ไม่ใช่ค่าเฉลี่ยของคนสองคนที่ไม่รู้จัก

## ส่วนวิศวกรรมที่ไม่สวยหรูแต่สำคัญ

มีบางอย่างที่ไม่เด่นแต่คุ้มค่าที่อยู่ใน diff :

**`pick` ที่ปลอดภัยขึ้น.** ต้นฉบับคืนค่า `undefined` ที่ cast เป็น `T` เมื่อเจออาเรย์ว่าง ด้วย `strict` + `noUncheckedIndexedAccess` ใน TypeScript นั่นคือการโกหกที่คอมไพเลอร์ยอมรับ เวอร์ชันใหม่โยน `RangeError` -- ถูกจับทันทีที่จุดเรียกแทนที่จะสร้าง props `undefined` สามระดับลึกลงไป

**`deepMerge` ที่ไม่ทำให้อาเรย์เสียหาย.** การเรียกซ้ำแบบเก่าทำงานเมื่อค่าต้นทางเป็นอ็อบเจกต์ แม้ว่าเป้าหมายจะเป็น `null` หรืออาเรย์ `merge({tags: ["a"]}, {tags: ["b"]})` ให้ผลลัพธ์เป็น `{tags: {0: "b"}}` เวอร์ชันใหม่จะเรียกซ้ำเฉพาะเมื่อทั้งสองฝั่งเป็นอ็อบเจกต์ธรรมดา

**เรนเดอร์แบบ batch แบบขนาน.** `batchFactory` เคยเรนเดอร์ PNG เป็นลูปต่อเนื่อง -- การส่งออก 1,000 ใบใช้เวลานานมาก ตอนนี้เป็น pool ของ workers ที่ปรับระดับความขนานได้ (ค่าเริ่มต้น 4) ซึ่งรักษาลำดับผลลัพธ์โดยเขียนลงในอาเรย์ที่จองพื้นที่ไว้แล้ว :

```ts
const worker = async () => {
  while (true) {
    const i = nextIndex++;
    if (i >= count) return;
    // render and save
    results[i] = { index: i + 1, filePath, config: clone.getConfig() };
    done++;
    onProgress?.(done, count);
  }
};
await Promise.all(Array.from({ length: concurrency }, () => worker()));
```

ในการส่งออกตัวละคร 1,000 ตัว มันเปลี่ยนจาก "ไปชงกาแฟรอ" เป็น "เสร็จแล้วเหรอ?"

**ข้อความข้อผิดพลาด `sharp` ที่มีความหมาย.** `buildPng` import `sharp` แบบขี้เกียจเพราะมันเป็น dependency ตัวเลือกที่คุณไม่อยากบังคับผู้ใช้ที่ใช้แค่ SVG โค้ดจับข้อผิดพลาดแบบเก่ากลบข้อผิดพลาดจริงและบอกแค่ว่า "sharp is required." ถ้าความล้มเหลวจริงเป็นเรื่องเวอร์ชันขัดแย้งหรือปัญหา native bindings คุณจะเสียเวลาสิบนาทีลงใหม่ทั้งที่ติดตั้งไว้แล้ว เวอร์ชันใหม่ยังคงบอกให้ติดตั้ง แต่รวมข้อผิดพลาดที่แท้จริงไว้ด้วย

## ต่อไป

โมดูลอยู่ที่เวอร์ชัน 1.1.1 บน [repository character-factory](https://github.com/fox3000foxy/character-factory) เอนจินพันธุกรรมเป็นจุดที่เหมาะสำหรับการพัฒนาต่อ -- ยังไม่มีชุดทดสอบ ดังนั้น invariants ความสอดคล้อง ("ตัวละครบราซิลเชื้อสายเอเชียตะวันออกจะไม่มีวันมีตาสีดำสนิทกับผมสีพลาตินัม") จึงรับประกันด้วยน้ำหนักเท่านั้น การเพิ่ม `bun test` หรือ `vitest` และเขียนเทสต์ความสอดคล้องที่สุ่ม `randomizeFromCountry` หมื่นครั้งต่อประเทศ คือขั้นตอนถัดไป

Kurekuta เองยังเป็นโปรเจกต์ส่วนตัวในตอนนี้ แต่ทุกการ์ดที่คุณจะได้เห็นในอนาคตนั้นเป็นเพียง blob `CharacterConfig` และ `buildPng()` เท่านั้น
