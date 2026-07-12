---
title: "Laupok สร้าง AI ที่เล่น Super Mario World ได้เอง -- มันทำงานอย่างไร"
description: "บทความเชิงลึกเกี่ยวกับโปรเจกต์ของ Laupok: AI ที่ใช้ NEAT เรียนรู้การเล่น Super Mario World ได้อย่างอิสระ อัลกอริทึมพันธุกรรม โครงข่ายประสาทเทียม การวิวัฒน์โครงข่ายประสาทแบบเพิ่มขยาย และ Lua 4200 บรรทัด"
date: 2026-07-11
authors:
  - fox3000foxy
tags:
  - ai
  - lua
  - emulation
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "AktlwKo1kWlBuHIYDcO511TvuoTWavpUOgrlg89cXCy3jumm4hb5gNGzOOESD6mfdmY85L9D1m+oJGcWxagLHg=="
---

# Laupok สร้าง AI ที่เล่น Super Mario World ได้เอง -- มันทำงานอย่างไร

Laupok สร้างปัญญาประดิษฐ์ที่เล่น **Super Mario World** ได้อย่างสมบูรณ์แบบอิสระ ไม่มีการบันทึกอินพุตล่วงหน้า ไม่มีเฟรมที่บันทึกไว้ AI เรียนรู้ด้วยตัวเอง ผ่านการกลายพันธุ์แบบสุ่มและการคัดเลือกโดยธรรมชาติ เพื่อผ่านด่านต่างๆ ของเกม โปรเจกต์นี้รันบน **BizHawk** ซึ่งเป็นอิมิวเลเตอร์หลายแพลตฟอร์ม ผ่านสคริปต์ Lua ประมาณ **4200 บรรทัด**

สิ่งที่ทำให้โปรเจกต์นี้น่าทึ่งคือมันพึ่งพาแนวคิดทางชีววิทยาที่นำมาประยุกต์ใช้กับการคำนวณ: **ทฤษฎีวิวัฒนาการ** ของดาร์วิน **โครงข่ายประสาทเทียม** และที่สำคัญที่สุดคืออัลกอริทึมเฉพาะที่เรียกว่า **NEAT** (NeuroEvolution of Augmenting Topologies) หรือการวิวัฒน์โครงข่ายประสาทแบบเพิ่มขยาย AI ไม่รู้จักเกมเลยในตอนแรก มันลองทำสิ่งต่างๆ แบบสุ่ม ล้มเหลวหลายพันครั้ง และค่อยๆ หาวิธีที่จะเคลื่อนที่ กระโดด และอยู่รอด

ในบทความนี้ เราจะอธิบายทุกอย่าง -- ทีละแนวคิด ทีละบรรทัดโค้ด

![Laupok อธิบายอัลกอริทึม NEAT หน้ากล้อง](/images/laupok-mario-ai/neat-title.jpg)

---

## การตั้งค่า: BizHawk, Lua, และ Super Mario World

### อิมิวเลเตอร์ BizHawk

BizHawk เป็นอิมิวเลเตอร์โอเพนซอร์สที่รองรับคอนโซลจำนวนมาก -- NES, SNES, Genesis, PS1, Game Boy และอีกมากมาย คุณสมบัติเด่นคือมันสามารถรัน **สคริปต์ Lua** ไปพร้อมกับเกมได้ สคริปต์เหล่านี้สามารถเข้าถึง **RAM** (หน่วยความจำเข้าถึงโดยสุ่ม) ของอิมิวเลเตอร์ได้ หมายความว่าสามารถอ่าน -- และแก้ไข -- ข้อมูลเกมใดๆ ได้แบบเรียลไทม์

ในทางปฏิบัติ นั่นหมายความว่าคุณสามารถ:
- อ่านตำแหน่งของมาริโอในด่าน
- รู้ว่าสไปรต์ใดบ้าง (ศัตรู ไอเทม) อยู่บนหน้าจอ
- รู้สถานะของไทล์ (บล็อก) ทุกชิ้นรอบตัวมาริโอ
- ควบคุมจอย -- กดปุ่มใดก็ได้

นี่คือสิ่งที่คุณต้องการเพื่อให้ AI เล่น

### ที่อยู่หน่วยความจำของ Super Mario World

ใน RAM ของ Super Mario World ข้อมูลทุกชิ้นถูกเก็บไว้ในที่อยู่เฉพาะ มันเหมือนย่านที่อยู่อาศัย: ที่อยู่แต่ละจุดตรงกับ "บ้าน" หนึ่งหลังที่มีข้อมูลหนึ่งชิ้น ตัวอย่างเช่น:

| ที่อยู่ | ข้อมูล |
|---------|------|
| `0x94`-`0x95` | ตำแหน่ง X ของมาริโอ (16 บิต, little-endian) |
| `0x96`-`0x97` | ตำแหน่ง Y ของมาริโอ |
| `0x14C8`+`i` | สถานะสไปรต์ `i` (>7 = มีชีวิต) |
| `0xE4`+`i` | ตำแหน่ง X ต่ำของสไปรต์ `i` |
| `0x14E0`+`i` | ตำแหน่ง X สูงของสไปรต์ `i` |
| `0xD8`+`i` | ตำแหน่ง Y ต่ำของสไปรต์ `i` |
| `0x14D4`+`i` | ตำแหน่ง Y สูงของสไปรต์ `i` |
| `0x170B`+`i` | ประเภทสไปรต์ขยาย `i` |
| `0x0100` | สถานะเกม (12 = ผ่านด่าน) |
| `0x13D4` | หยุดชั่วคราวทำงาน |
| `0x0071` | แอนิเมชันตายของมาริโอ (9 = ตาย) |
| `0x1C800`+... | ตารางไทล์ของด่าน |

ตำแหน่งสไปรต์ใช้สองไบต์: ไบต์ "ต่ำ" และไบต์ "สูง" เพราะตำแหน่งอาจเกิน 255 พิกเซล สูตรคือเสมอ `low + high × 256`

สำหรับไทล์จะซับซ้อนกว่า: ที่อยู่ฐานคือ `0x1C800` และคุณคำนวณออฟเซตตามพิกัด `x` และ `y` ของไทล์ในโลก โดยมีขั้น 16 พิกเซลต่อไทล์

![Super Mario World พร้อมโอเวอร์เลย์ดีบักที่แสดงที่อยู่หน่วยความจำของสไปรต์และตำแหน่งของมาริโอ](/images/laupok-mario-ai/memory-debug.jpg)

---

## พื้นฐาน: อัลกอริทึมพันธุกรรมและโครงข่ายประสาทเทียม

ก่อนที่จะดำดิ่งเข้าไปในโค้ด คุณต้องเข้าใจแนวคิดพื้นฐานสองอย่าง ถ้าไม่มีมัน สิ่งอื่นจะไม่สมเหตุสมผล

### อัลกอริทึมพันธุกรรม

อัลกอริทึมพันธุกรรมเป็นการจำลอง **ทฤษฎีวิวัฒนาการ** แนวคิดหลัก: คุณสร้าง **ประชากร** ของสิ่งมีชีวิต แต่ละตัวมีลักษณะที่แตกต่างกันเล็กน้อย ("ยีน") คุณปล่อยให้มัน "มีชีวิต" ในสภาพแวดล้อม ตัวที่ทำได้ดีที่สุดจะอยู่รอดและสืบพันธุ์ ตัวที่ทำได้ไม่ดีจะสูญพันธุ์ไป

Laupok อธิบายเรื่องนี้ด้วยการเปรียบเทียบ **Kirby**:
- ประชากรของ Kirby ปรากฏบนพื้นผิวที่มีหนามและมะเขือเทศ
- หนามลดพลังชีวิต มะเขือเทศกู้คืนมัน
- แต่ละ Kirby มียีน: ขนาด ความเร็ว พลังชีวิต พฤติกรรม (หนี หามะเขือเทศ วิ่งแบบมั่วๆ)

![เกลียวคู่ดีเอ็นเอพร้อมป้าย "the baby", "size", "speed", "color" -- ยีนที่ประกอบขึ้นเป็นสิ่งมีชีวิตหนึ่งตัว](/images/laupok-mario-ai/dna-genes.jpg)

- หลังจาก 15 วินาที คุณตรวจสอบว่าใครอยู่รอดนานที่สุด
- Kirby ที่ดีที่สุดสืบพันธุ์กับตัวอื่น: ลูกจะได้รับยีนครึ่งหนึ่งจากตัวที่ดีที่สุดและอีกครึ่งจากตัวที่ "แย่ที่สุด"
- ลูกผ่านการกลายพันธุ์แบบสุ่ม (**mutations**) (ใหญ่ขึ้นเล็กน้อย เร็วขึ้นเล็กน้อย...)
- Kirby เก่าถูกแทนที่ด้วยตัวใหม่
- คุณเริ่มต้นใหม่

หลังจาก 180 รุ่น (~15 ชั่วโมง) Kirby จากที่อยู่รอด 15 วินาทีกลายเป็น **15 นาที** พวกมันเล็กลง (hitbox เล็ก) เร็วขึ้น และหนีอันตรายอยู่ตลอดเวลา

![การจำลอง Kirby รุ่นที่ 0: วงกลมหลากสีกระจายแบบสุ่มบนพื้นหลังดำ ทุกตัวมีขนาดใกล้เคียงกัน](/images/laupok-mario-ai/kirby-gen0.jpg)

![การจำลอง Kirby รุ่นที่ 1866: Kirby เล็กลง เร็วขึ้น และหนีอันตรายอย่างเป็นระบบ](/images/laupok-mario-ai/kirby-gen1866.jpg)

![สถิติการจำลอง Kirby: ความ Fitness พลังชีวิต พฤติกรรมของแต่ละบุคคลเรียงตามประสิทธิภาพ](/images/laupok-mario-ai/kirby-stats.jpg)

จุดสำคัญ: **คุณไม่ได้กำหนดวิธีแก้ปัญหา** อัลกอริทึม **ค้นหามันเอง** และนั่นคือสิ่งที่ทำให้มันมีประสิทธิภาพสำหรับปัญหาที่คุณไม่รู้ว่าการผสมผสานพารามิเตอร์ที่เหมาะสมที่สุดจะเป็นอย่างไร

### โครงข่ายประสาทเทียม

โครงข่ายประสาทเทียมเป็นแบบจำลองทางคณิตศาสตร์ที่เรียบง่ายของสมองมนุษย์ ประกอบด้วย:
- **นิวรอนอินพุต**: สิ่งที่โครงข่าย "มองเห็น"
- **นิวรอนเอาต์พุต**: สิ่งที่โครงข่าย "ตัดสินใจ"
- **การเชื่อมต่อ (น้ำหนัก)**: การเชื่อมต่อแต่ละจุดมี **น้ำหนัก** ที่ขยายหรือลดสัญญาณ

หลักการคือง่าย: นิวรอนอินพุตแต่ละตัวส่งค่าของมัน คูณด้วยน้ำหนักการเชื่อมต่อ แล้วบวกกับสัญญาณอื่นๆ ถ้าผลลัพธ์เกินเกณฑ์บางอย่าง (**ฟังก์ชันเปิดใช้งาน**) นิวรอนเอาต์พุตจะทำงาน

ในการเปรียบเทียบของ Laupok กับมาริโอและเคอร์เซอร์เมาส์:
- นิวรอนอินพุต = ระยะห่างระหว่างมาริโอกับเคอร์เซอร์
- น้ำหนักการเชื่อมต่อ = ความอ่อนไหวของมาริโอ
- นิวรอนเอาต์พุต = มาริโอกรีดร้องหรือไม่

ยิ่งเคอร์เซอร์ใกล้ ค่าอินพุตก็ยิ่งสูง ถ้าน้ำหนักแรง สัญญาณเอาต์พุตก็แรง และมาริโอจะกรีดร้อง เมื่อเปลี่ยนน้ำหนัก คุณก็เปลี่ยนความอ่อนไหวของมาริโอ

![เดโม "มาริโอกลัว": มาริอยืนหน้า Boo พร้อมแถบซินแนปส์ที่แสดงน้ำหนักการเชื่อมต่อระหว่างอินพุตและเอาต์พุต](/images/laupok-mario-ai/mario-fear-demo.jpg)

ในโครงข่ายประสาทเทียมของ AI จริง มันเป็นตรรกะเดียวกัน แต่ในขนาดมหึมา:
- **นิวรอนอินพุต 99 ตัว** (ตาราง 11×9 ไทล์จากมุมมองของมาริโอ)
- **นิวรอนเอาต์พุต 8 ตัว** (A, B, X, Y, ขึ้น ลง ซ้าย ขวา)
- **นิวรอนซ่อน** ระหว่างนั้น
- การเชื่อมต่อหลายร้อยจุดที่มีน้ำหนักต่างกัน

---

## NEAT: อัลกอริทึมที่เปลี่ยนทุกอย่าง

### ปัญหาของอัลกอริทึมพันธุกรรมพื้นฐาน

ถ้าคุณผสมอัลกอริทึมพันธุกรรมกับโครงข่ายประสาทเทียมอย่างง่ายๆ คุณมีปัญหา: คุณสร้างโครงข่ายประสาทเทียม 100 ตัวที่แตกต่างกันโดยสิ้นเชิง และคุณไม่สามารถเปรียบเทียบมันได้ แต่ละตัวมีนิวรอน การเชื่อมต่อ และน้ำหนักของตัวเอง คุณจะรู้ได้อย่างไรว่าโครงข่ายสองตัว "คล้ายกัน" หรือ "ต่างกัน"?

นี่คือที่ที่ **NEAT** เข้ามา -- NeuroEvolution of Augmenting Topologies หรือการวิวัฒน์โครงข่ายประสาทแบบเพิ่มขยาย ประดิษฐ์โดย **Kenneth Stanley** และ **Risto Miikkulainen** ในปี 2002 มันแก้ปัญหานี้ได้พอดี

### สายพันธุ์ (Species)

กลไกสำคัญตัวแรกของ NEAT คือ **สายพันธุ์** เมื่อโครงข่ายประสาทเทียมตัวหนึ่งแตกต่างจากอีกตัวมากเกินไป มันจะถูกจัดเป็นสายพันธุ์ต่างออกไป ความคล้ายคลึงคำนวณผ่านพารามิเตอร์สามตัว:

1. **ส่วนเกิน** (`EXCES_COEF = 0.50`): จำนวนการเชื่อมต่อที่ไม่มีอะไรเหมือนกันระหว่างสองโครงข่าย (นวัตกรรมที่ต่างกัน)
2. **แยก** (Disjoint): เหมือนกัน แต่สำหรับการเชื่อมต่อที่อยู่ตรงกลาง
3. **ความแตกต่างของน้ำหนัก** (`POIDSDIFF_COEF = 0.92`): ค่าเฉลี่ยของความแตกต่างน้ำหนักระหว่างการเชื่อมต่อที่มีนวัตกรรมเดียวกัน

สูตรคะแนน:

```
score = (EXCES_COEF × disjoint) / max(nbConnexions1 + nbConnexions2, 1)
      + POIDSDIFF_COEF × diffPoids
```

ถ้าคะแนนนี้ต่ำกว่า `DIFF_LIMITE` (1.0) โครงข่ายสองตัวอยู่ในสายพันธุ์เดียวกัน มิฉะนั้นจะสร้างสายพันธุ์ใหม่

### นวัตกรรม (Innovations)

นี่คือความอัจฉริยะของ NEAT ทุกครั้งที่สร้างการเชื่อมต่อใหม่ มันจะได้รับหมายเลข **นวัตกรรม** ที่ไม่ซ้ำกันและเป็นสากล หมายเลขนี้ติดตามโครงข่ายประสาทเทียมแม้ว่ามันจะสืบพันธุ์ก็ตาม

ในทางปฏิบัติ เมื่อลูกถูกสร้างผ่านการข้ามพันธุ์ (crossover) มันจะได้รับนวัตกรรมจากพ่อแม่ ถ้าโครงข่ายสองตัวมีนวัตกรรมเดียวกัน นั่นหมายความว่ามันมีการเชื่อมต่อจากบรรพบุรุษเดียวกัน นี่คือสิ่งที่ทำให้สามารถเปรียบเทียบโครงข่ายที่มีขนาดต่างกันได้

### การข้ามพันธุ์ (Crossover)

เมื่อโครงข่ายประสาทเทียมสองตัวสืบพันธุ์ **การข้ามพันธุ์** ทำงานดังนี้:

![Laupok อธิบายแนวคิดการข้ามพันธุ์พร้อมข้อความ "CROSSOVER" ซ้อนทับ](/images/laupok-mario-ai/crossover-label.jpg)

1. โครงข่ายที่มีประสิทธิภาพดีกว่ากลายเป็น "พ่อแม่เด่น"
2. ลูกได้รับการเชื่อมต่อทั้งหมดจากพ่อแม่เด่น
3. สำหรับการเชื่อมต่อแต่ละจุดที่มีนวัตกรรมเดียวกัน พ่อแม่อีกฝ่ายสามารถแทนที่มันได้ (โอกาส 50%)
4. เฉพาะการเชื่อมต่อที่ยังทำงานจากพ่อแม่ไม่เด่นเท่านั้นที่สามารถแทนที่ได้

การรับประกันนี้ทำให้ลูกต้องดีพอๆ กับพ่อแม่ที่ดีที่สุดเสมอ

### การกลายพันธุ์ (Mutations)

หลังจากการข้ามพันธุ์ ลูกผ่านการกลายพันธุ์ด้วยความน่าจะเป็นที่กำหนดได้:

![Laupok อธิบายการกลายพันธุ์พร้อมข้อความ "(small modif = mutation)" ซ้อนทับ](/images/laupok-mario-ai/mutation-label.jpg)

| การกลายพันธุ์ | ความน่าจะเป็น | ผลลัพธ์ |
|----------|------------|--------|
| รีเซ็ตน้ำหนักการเชื่อมต่อ | 25% | น้ำหนักถูกสุ่มทั้งหมด |
| การกลายพันธุ์น้ำหนัก | 95% | น้ำหนักเปลี่ยนแปลง ±0.80 |
| เพิ่มการเชื่อมต่อ | 85% | การเชื่อมต่อใหม่ระหว่างนิวรอนสองตัวที่ไม่ได้เชื่อมต่อกัน |
| เพิ่มนิวรอน | 39% | นิวรอนซ่อนหนึ่งตัวถูกแทรกระหว่างนิวรอนสองตัวที่เชื่อมต่อกัน |

อัตราการเพิ่มนิวรอนสำคัญมาก: มันคือสิ่งที่ทำให้โครงข่าย **เติบโต** ได้ ในตอนแรกมีแค่อินพุตและเอาต์พุต ค่อยๆ นิวรอนซ่อนปรากฏ ทำให้โครงข่ายซับซ้อนขึ้นเรื่อยๆ

---

## โค้ด: การเดินชมทั้งหมด

### ค่าคงที่

สคริปต์เริ่มต้นด้วยบล็อกค่าคงที่ที่กำหนดการตั้งค่าทั้งหมด:

```lua
-- Mario's view around him
TAILLE_TILE = 16
TAILLE_VUE_W = TAILLE_TILE * 11  -- 176 pixels wide
TAILLE_VUE_H = TAILLE_TILE * 9   -- 144 pixels tall
NB_TILE_W = TAILLE_VUE_W / TAILLE_TILE  -- 11 tiles
NB_TILE_H = TAILLE_VUE_H / TAILLE_TILE  -- 9 tiles

-- Neural network
NB_INPUT = NB_TILE_W * NB_TILE_H  -- 99 inputs (visible tiles)
NB_OUTPUT = 8  -- A, B, X, Y, Up, Down, Left, Right
NB_INDIVIDU_POPULATION = 100  -- individuals per population
NB_NEURONE_MAX = 100000  -- max hidden neurons

-- Fitness
FITNESS_LEVEL_FINI = 1000000  -- value when level is finished
NB_FRAME_RESET_BASE = 33  -- frames without progress before reset
NB_FRAME_RESET_PROGRES = 300  -- frames if progress detected

-- Species
EXCES_COEF = 0.50
POIDSDIFF_COEF = 0.92
DIFF_LIMITE = 1.00

-- Mutations
CHANCE_MUTATION_RESET_CONNEXION = 0.25
POIDS_CONNEXION_MUTATION_AJOUT = 0.80
CHANCE_MUTATION_POIDS = 0.95
CHANCE_MUTATION_CONNEXION = 0.85
CHANCE_MUTATION_NEURONE = 0.39
```

`NB_INPUT` เป็น 99 เพราะมุมมองของมาริโอคือ 11×9 ไทล์ แต่ละไทล์เป็นนิวรอนอินพุตหนึ่งตัว ไทล์ว่าง = 0 บล็อก = 1 ศัตรู = -1

เอาต์พุต 8 ตัวตรงกับปุ่มจอย SNES: A, B, X, Y, ขึ้น ลง ซ้าย ขวา Start, Select, L และ R ถูกตัดออกเพื่อไม่ให้มาริโอ "เสียสมาธิ"

### โครงสร้างข้อมูล

สคริปต์กำหนดโครงสร้างหลักสามอย่าง:

```lua
function newNeurone()
    local neurone = {}
    neurone.valeur = 0    -- current neuron value
    neurone.id = 0        -- unique identifier
    neurone.type = ""     -- "input", "output", or "hidden"
    return neurone
end

function newConnexion()
    local connexion = {}
    connexion.entree = 0     -- source neuron ID
    connexion.sortie = 0     -- destination neuron ID
    connexion.actif = true   -- can be disabled if a hidden neuron is inserted
    connexion.poids = 0      -- connection weight
    connexion.innovation = 0 -- unique innovation number
    connexion.allume = false -- for display: true if signal passes
    return connexion
end

function newReseau()
    local reseau = {
        nbNeurone = 0,        -- number of hidden neurons
        fitness = 1,          -- performance (distance traveled)
        idEspeceParent = 0,   -- which species it belongs to
        lesNeurones = {},     -- neuron array
        lesConnexions = {}    -- connection array
    }
    -- Initialize with inputs
    for j = 1, NB_INPUT, 1 do
        ajouterNeurone(reseau, j, "input", 1)
    end
    -- Then outputs
    for j = NB_INPUT + 1, NB_INPUT + NB_OUTPUT, 1 do
        ajouterNeurone(reseau, j, "output", 0)
    end
    return reseau
end
```

ในตอนแรก แต่ละโครงข่ายมีแค่อินพุตและเอาต์พุต ไม่มีนิวรอนซ่อน ไม่มีการเชื่อมต่อ อัลกอริทึมตัดสินใจว่าจำเป็นต้องมีหรือไม่

### การกลายพันธุ์โดยละเอียด

#### การกลายพันธุ์น้ำหนัก

```lua
function mutationPoidsConnexions(unReseau)
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            if math.random() < CHANCE_MUTATION_RESET_CONNEXION then
                -- 25%: total weight reset
                unReseau.lesConnexions[i].poids = genererPoids()
            else
                -- 75%: variation of ±0.80
                if math.random() >= 0.5 then
                    unReseau.lesConnexions[i].poids =
                        unReseau.lesConnexions[i].poids - POIDS_CONNEXION_MUTATION_AJOUT
                else
                    unReseau.lesConnexions[i].poids =
                        unReseau.lesConnexions[i].poids + POIDS_CONNEXION_MUTATION_AJOUT
                end
            end
        end
    end
end
```

น้ำหนักเริ่มต้นเป็น 1 หรือ -1 เสมอ (`genererPoids()`) การเปลี่ยนแปลง ±0.80 สามารถเปลี่ยนให้อยู่ระหว่างค่าลบและบวก เปลี่ยนพฤติกรรมของโครงข่ายอย่าง-radically

#### เพิ่มการเชื่อมต่อ

```lua
function mutationAjouterConnexion(unReseau)
    local liste = {}
    -- Shuffle the neuron list
    for i, v in ipairs(unReseau.lesNeurones) do
        local pos = math.random(1, #liste+1)
        table.insert(liste, pos, v)
    end

    local traitement = false
    for i = 1, #liste, 1 do
        for j = 1, #liste, 1 do
            if i ~= j then
                local n1 = liste[i]
                local n2 = liste[j]
                -- Valid connection: input→output, hidden→hidden, hidden→output
                if (n1.type == "input" and n2.type == "output") or
                   (n1.type == "hidden" and n2.type == "hidden") or
                   (n1.type == "hidden" and n2.type == "output") then
                    -- Check no connection already exists
                    local dejaConnexion = false
                    for k = 1, #unReseau.lesConnexions, 1 do
                        if unReseau.lesConnexions[k].entree == n1.id
                            and unReseau.lesConnexions[k].sortie == n2.id then
                            dejaConnexion = true
                            break
                        end
                    end
                    if dejaConnexion == false then
                        traitement = true
                        ajouterConnexion(unReseau, n1.id, n2.id)
                    end
                end
            end
            if traitement then break end
        end
        if traitement then break end
    end
end
```

คุณไม่สามารถเชื่อมเอาต์พุตกับอินพุตได้ (นั่นจะสร้างวงจร) และไม่สามารถเชื่อมนิวรอนสองตัวที่เชื่อมต่อกันอยู่แล้ว การสลับรับประกันว่าจะสำรวจความเป็นไปได้ที่ต่างกันทุกครั้ง

#### เพิ่มนิวรอน

นี่คือการกลายพันธุ์ที่น่าสนใจที่สุด:

```lua
function mutationAjouterNeurone(unReseau)
    if #unReseau.lesConnexions == 0 then return nil end
    if unReseau.nbNeurone == NB_NEURONE_MAX then return nil end

    -- Shuffle connections
    local listeRandom = {}
    for i = 1, #unReseau.lesConnexions, 1 do
        local pos = math.random(1, #listeRandom+1)
        table.insert(listeRandom, pos, i)
    end

    for i = 1, #listeRandom, 1 do
        if unReseau.lesConnexions[listeRandom[i]].actif then
            -- Disable the existing connection
            unReseau.lesConnexions[listeRandom[i]].actif = false
            unReseau.nbNeurone = unReseau.nbNeurone + 1
            local indice = unReseau.nbNeurone + NB_INPUT + NB_OUTPUT

            -- Create the hidden neuron
            ajouterNeurone(unReseau, indice, "hidden", 1)

            -- Connect input to hidden neuron
            ajouterConnexion(unReseau,
                unReseau.lesConnexions[listeRandom[i]].entree,
                indice, genererPoids())

            -- Connect hidden neuron to output
            ajouterConnexion(unReseau,
                indice,
                unReseau.lesConnexions[listeRandom[i]].sortie,
                genererPoids())
            break
        end
    end
end
```

กลไกคือ: คุณเอาการเชื่อมต่อที่มีอยู่ **ปิดการใช้งานมัน** และแทรกนิวรอนซ่อนไว้ตรงกลาง การเชื่อมต่อดั้งเดิมถูกแทนที่ด้วยสองจุดใหม่: อินพุต→ซ่อน และ ซ่อน→เอาต์พุต มันเหมือนการตัดสายไฟเพื่อต่อสวิตช์เข้าไป

นี่คือสิ่งที่ทำให้ NEAT เป็น "การเพิ่มขยายโครงสร้าง": โครงข่าย **เติบโต** ไปตามเวลา มันเริ่มง่ายๆ และซับซ้อนก็ต่อเมื่อจำเป็น

### feedForward

นี่คือฟังก์ชันที่แพร่กระจายสัญญาณผ่านโครงข่าย:

```lua
function feedForward(unReseau)
    -- Reset output neurons
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur = 0
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].allume = false
        end
    end

    -- Propagation
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            local avantTraitement = unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur =
                unReseau.lesNeurones[unReseau.lesConnexions[i].entree].valeur *
                unReseau.lesConnexions[i].poids +
                unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur

            if avantTraitement ~= unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur then
                unReseau.lesConnexions[i].allume = true
            else
                unReseau.lesConnexions[i].allume = false
            end
        end
    end
end
```

การเชื่อมต่อที่ยังทำงานแต่ละจุดส่ง `ค่าอินพุต × น้ำหนัก` ไปยังนิวรอนเอาต์พุต ค่าถูก **สะสม** (บวก) ธง `allume` ใช้สำหรับการแสดงโครงข่ายเท่านั้น

### อ่านหน่วยความจำของเกม

ฟังก์ชัน `getLesInputs()` แปลงโลกของ Super Mario World เป็นข้อมูลที่โครงข่ายเข้าใจได้:

```lua
function getLesInputs()
    local lesInputs = {}
    -- Initialize to 0 (gray = nothing)
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            lesInputs[getIndiceLesInputs(i, j)] = 0
        end
    end

    -- Sprites (enemies) = -1 (black)
    local lesSprites = getLesSprites()
    for i = 1, #lesSprites, 1 do
        local input = convertirPositionPourInput(getLesSprites()[i])
        if input.x > 0 and input.x < (TAILLE_VUE_W / TAILLE_TILE) + 1 then
            lesInputs[getIndiceLesInputs(input.x, input.y)] = -1
        end
    end

    -- Tiles (blocks) = tile value (white if > 0)
    local lesTiles = getLesTiles()
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            local indice = getIndiceLesInputs(i, j)
            if lesTiles[indice] ~= 0 then
                lesInputs[indice] = lesTiles[indice]
            end
        end
    end

    return lesInputs
end
```

ตารางอินพุตเป็นมุมมองที่:centered บนมาริโอ: กว้าง 11 ไทล์ สูง 9 ไทล์ ค่าของแต่ละไทล์:
- **0** (เทา): ว่างเปล่า
- **1** (ขาว): บล็อกแข็ง
- **-1** (ดำ): ศัตรู

ศัตรูถูกอ่านจากรายการสองรายการใน RAM: สไปรต์ปกติ (`0x14C8`-`0x14F8`) และสไปรต์ขยาย (`0x170B`-`0x173B`) สำหรับสไปรต์ที่ยังมีชีวิตทุกตัว (สถานะ > 7) ตำแหน่งไทล์เทียบกับมาริโอจะถูกคำนวณและ -1 จะถูกวางไว้ในเซลล์ที่ตรงกัน

### Fitness: วิธีที่ AI รู้ว่ามันกำลังก้าวหน้า

```lua
function majReseau(unReseau, marioBase)
    local mario = getPositionMario()

    if not niveauFini and memory.readbyte(0x0100) == 12 then
        -- Level finished!
        unReseau.fitness = FITNESS_LEVEL_FINI
        niveauFini = true
    elseif marioBase.x < mario.x then
        -- Mario moved right
        unReseau.fitness = unReseau.fitness + (mario.x - marioBase.x)
        marioBase.x = mario.x
    end

    -- Update inputs
    local lesInputs = getLesInputs()
    for i = 1, NB_INPUT, 1 do
        unReseau.lesNeurones[i].valeur = lesInputs[i]
    end
end
```

Fitness ง่ายๆ: คือ **ระยะทางที่เดินไปทางขวา** ถ้ามาริโอเคลื่อนที่ 10 พิกเซล fitness จะเพิ่มขึ้น 10 ถ้ามาริโอเคลื่อนที่ทางซ้าย ไม่มีอะไรเกิดขึ้น (ไม่มีบทลงโทษ) ถ้าผ่านด่านแล้ว (ที่อยู่ `0x0100` == 12) fitness จะกลายเป็น 1,000,000

มันตั้งใจให้เรียบง่าย ไม่มีโบนัสสำหรับการฆ่าศัตรู ไม่มีบทลงโทษสำหรับการตาย แค่: เคลื่อนที่ไปทางขวา

### การรีเซ็ตอัจฉริยะ

ถ้ามาริโอไม่เคลื่อนที่ 33 เฟรม ด่านจะรีเซ็ตและเราเปลี่ยนไปยังบุคคลถัดไป แต่ถ้ามาริโอทำได้ก้าวหน้า (fitness ปัจจุบันต่างจากจุดเริ่มต้น) เราจะรอ 300 เฟรม -- ให้โอกาสนามเรียนรู้ว่ามันทำอะไรถูก

```lua
if fitnessAvant == laPopulation[idPopulation].fitness
   and memory.readbyte(0x13D4) == 0 then
    nbFrameStop = nbFrameStop + 1
    local nbFrameReset = NB_FRAME_RESET_BASE
    if fitnessInit ~= laPopulation[idPopulation].fitness
       and memory.readbyte(0x0071) ~= 9 then
        nbFrameReset = NB_FRAME_RESET_PROGRES
    end
    if nbFrameStop > nbFrameReset then
        nbFrameStop = 0
        lancerNiveau()
        idPopulation = idPopulation + 1
        -- ...
    end
end
```

เงื่อนไข `memory.readbyte(0x0071) ~= 9` ตรวจสอบว่ามาริโอไม่ได้อยู่ในแอนิเมชันตาย ไม่มีประโยชน์ที่จะรีเซ็ตถ้ามาริโอตายแล้ว

### ลูปหลัก

ลูปทำงานที่ 30 fps (ความเร็วปกติของ Super Mario World):

```lua
while true do
    local fitnessAvant = laPopulation[idPopulation].fitness

    -- Display (network, info)
    if forms.ischecked(estAccelere) then
        emu.limitframerate(false)  -- speed up
    else
        emu.limitframerate(true)   -- 30 fps
    end

    -- The 3 vital functions
    majReseau(laPopulation[idPopulation], marioBase)
    feedForward(laPopulation[idPopulation])
    appliquerLesBoutons(laPopulation[idPopulation])

    emu.frameadvance()
    nbFrame = nbFrame + 1

    -- Reset if no progress
    -- ...
    -- New generation if all individuals tested
    -- ...
end
```

ฟังก์ชันสำคัญสามอย่างคือ `majReseau`, `feedForward`, และ `appliquerLesBoutons` ปิดใช้งานตัวใดตัวหนึ่ง มาริโอจะหยุดเคลื่อนที่

### การข้ามพันธุ์

```lua
function crossover(unReseau1, unReseau2)
    local leReseau = newReseau()
    local leBon = unReseau1
    local leNul = unReseau2

    if leBon.fitness < leNul.fitness then
        leBon = unReseau2
        leNul = unReseau1
    end

    leReseau = copier(leBon)

    for i = 1, #leReseau.lesConnexions, 1 do
        for j = 1, #leNul.lesConnexions, 1 do
            if leReseau.lesConnexions[i].innovation == leNul.lesConnexions[j].innovation
               and leNul.lesConnexions[j].actif then
                if math.random() > 0.5 then
                    leReseau.lesConnexions[i] = leNul.lesConnexions[j]
                end
            end
        end
    end
    leReseau.fitness = 1
    return leReseau
end
```

ลูกได้รับมรดกจากพ่อแม่ที่ดีกว่า สำหรับการเชื่อมต่อแต่ละจุดที่มีนวัตกรรมเดียวกัน พ่อแม่อีกฝ่ายมีโอกาส 50% ที่จะแทนที่มัน -- แต่ **เฉพาะเมื่อการเชื่อมต่อยังทำงานเท่านั้น** นี่คือการแก้ไขที่สำคัญ: ถ้าไม่มีมัน นิวรอนซ่อนที่ไร้ประโยชน์อาจถูกสร้างขึ้น

### การคัดเลือกสายพันธุ์

```lua
function nouvelleGeneration(laPopulation, lesEspeces)
    local laNouvellePopulation = newPopulation()
    local nbIndividuACreer = NB_INDIVIDU_POPULATION

    -- Calculate average fitness per species
    for i = 1, #lesEspeces, 1 do
        lesEspeces[i].fitnessMoyenne = 0
        for j = 1, #lesEspeces[i].lesReseaux, 1 do
            lesEspeces[i].fitnessMoyenne =
                lesEspeces[i].fitnessMoyenne + lesEspeces[i].lesReseaux[j].fitness
        end
        lesEspeces[i].fitnessMoyenne =
            lesEspeces[i].fitnessMoyenne / #lesEspeces[i].lesReseaux
    end

    -- Each species creates a number of children proportional to its average fitness
    for i = 1, #lesEspeces, 1 do
        local nbEnfant = math.ceil(
            #lesEspeces[i].lesReseaux *
            lesEspeces[i].fitnessMoyenne / fitnessMoyenneGlobal)

        for j = 1, nbEnfant, 1 do
            local unReseau = crossover(
                choisirParent(lesEspeces[i].lesReseaux),
                choisirParent(lesEspeces[i].lesReseaux))
            mutation(unReseau)
            laNouvellePopulation[indiceNouvelleEspece] = copier(unReseau)
        end
    end
end
```

แนวคิดคือ: สายพันธุ์ที่มี fitness เฉลี่ย 10,000 จะสร้างลูกได้มากกว่าสายพันธุ์ที่มี fitness เฉลี่ย 1 อย่างมาก นี่คือ **การคัดเลือกโดยธรรมชาติ** ที่ทำงานจริง

`choisirParent` ใช้การเลือกรูเล็ต: ยิ่ง fitness ของบุคคลสูงเท่าไหร่ ก็ยิ่งมีโอกาสถูกเลือกเป็นพ่อแม่มากเท่านั้น

### การบันทึกและโหลด

ประชากรถูกบันทึกลงไฟล์ `.pop`:

```lua
function sauvegarderUnReseau(unReseau, fichier)
    io.write(unReseau.nbNeurone .. "\n")
    io.write(#unReseau.lesConnexions .. "\n")
    io.write(unReseau.fitness .. "\n")
    for i = 1, unReseau.nbNeurone, 1 do
        local indice = NB_INPUT + NB_OUTPUT + i
        io.write(unReseau.lesNeurones[indice].id .. "\n")
    end
    for i = 1, #unReseau.lesConnexions, 1 do
        local actif = 1
        if unReseau.lesConnexions[i].actif ~= true then actif = 0 end
        io.write(actif .. "\n" ..
            unReseau.lesConnexions[i].entree .. "\n" ..
            unReseau.lesConnexions[i].sortie .. "\n" ..
            unReseau.lesConnexions[i].poids .. "\n" ..
            unReseau.lesConnexions[i].innovation .. "\n")
    end
end
```

การบันทึกรวมถึงบุคคลที่ดีที่สุดจากประชากรก่อนหน้าทั้งหมดด้วย ถ้าบุคคลที่ดีที่สุดของประชากรเก่าดีกว่าตัวใหม่ เราจะย้อนกลับเป็นตัวเก่าเป็นฐาน นี่คือรูปแบบหนึ่งของ **ความเป็นชนชั้น**: สิ่งที่ดีที่สุดไม่มีวันสูญหาย

### การแสดงโครงข่าย

Laupok เพิ่มตัวแสดงโครงข่ายประสาทเทียมที่ซ้อนทับบนเกม:

```lua
function dessinerUnReseau(unReseau)
    -- Inputs: 11×9 grid around Mario
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            local xT = ENCRAGE_X_INPUT + (i - 1) * TAILLE_INPUT
            local yT = ENCRAGE_Y_INPUT + (j - 1) * TAILLE_INPUT
            local couleurFond = "gray"
            if unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur < 0 then
                couleurFond = "black"   -- enemy
            elseif unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur > 0 then
                couleurFond = "white"   -- block
            end
            gui.drawRectangle(xT, yT, TAILLE_INPUT, TAILLE_INPUT, "black", couleurFond)
        end
    end

    -- Outputs: 8 buttons
    for i = 1, NB_OUTPUT, 1 do
        local xT = ENCRAGE_X_OUTPUT
        local yT = ENCRAGE_Y_OUTPUT + ESPACE_Y_OUTPUT * (i - 1)
        if sigmoid(unReseau.lesNeurones[i + NB_INPUT].valeur) then
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "white")
        else
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "black")
        end
    end

    -- Connections
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            local alpha = 25
            if unReseau.lesConnexions[i].allume then alpha = 255 end
            local couleur = forms.createcolor(255, 255, 255, alpha)
            gui.drawLine(
                lesPositions[unReseau.lesConnexions[i].entree].x,
                lesPositions[lesConnexions[i].entree].y,
                lesPositions[unReseau.lesConnexions[i].sortie].x,
                lesPositions[lesConnexions[i].sortie].y,
                couleur)
        end
    end
end
```

มันมีประโยชน์อย่างเหลือเชื่อสำหรับการทำความเข้าใจว่าโครงข่ายทำอะไร การเชื่อมต่อที่ยังทำงานเป็นสีขาว ที่ไม่ทำงานเป็นกึ่งโปร่งใส อินพุตเป็นตารางเซลล์สีขาว/ดำ/เทา เอาต์พุตแสดงว่าปุ่มใดถูกกด

---

## ผลลัพธ์

### สิ่งที่ AI เรียนรู้

ตลอดหลายชั่วโมง (และหลายวัน) ของการรัน AI ค้นพบด้วยตัวเอง:

1. **เคลื่อนที่ไปทางขวา**: พฤติกรรมพื้นฐานที่สุด แต่ต้องกดปุ่มค้างไว้
2. **กระโดดข้ามศัตรู**: โดยเชื่อมต่ออินพุต "ตรวจพบศัตรู" เข้ากับปุ่ม A หรือ B
3. **หลีกเลี่ยงสิ่งกีดขวาง**: โครงข่ายบางตัวเรียนรู้ที่จะถอยกลับชั่วคราวเพื่อก้าวไปข้างหน้าไกลขึ้น
4. **ผ่านด่าน**: บุคคลที่ดีที่สุดสามารถผ่านด่านแรกของ Super Mario World ได้

![มาริโอที่ควบคุมโดย AI ยืนหน้า Boo ในด่าน Super Mario World -- โครงข่ายประสาทเทียมตัดสินใจการกระทำแบบเรียลไทม์](/images/laupok-mario-ai/mario-ai-playing.jpg)

### ข้อจำกัด

โปรเจกต์มีข้อจำกัดของมัน:

- **ด่านเดียว**: AI ถูกฝึกบนด่านใดด่านหนึ่งโดยเฉพาะ มันไม่ได้ขยายไปยังด่านอื่นโดยอัตโนมัติ
- **เวลาฝึก**: ต้องใช้เวลาหลายสิบชั่วโมงเพื่อให้ได้ผลลัพธ์ที่น่าพอใจ
- **ไม่เข้าใจ**: AI ไม่ได้ "เข้าใจ" ว่ามันทำอะไร มันเพิ่มประสิทธิภาพฟังก์ชัน fitness (ระยะทางที่เดิน) ผ่านการกลายพันธุ์แบบสุ่ม
- **T-bagging**: Laupok สังเกตว่ามาริโอกระโดดอยู่กับที่เมื่อเห็นศัตรู แค่เพราะมันเพิ่ม fitness (เขาเคลื่อนที่เล็กน้อยขณะกระโดด)

---

## วิธีทำซ้ำการทดลอง

Laupok แบ่งปันทุกอย่าง นี่คือขั้นตอน:

1. **ดาวน์โหลด BizHawk** จาก [tasvideos.org](https://tasvideos.org/BizHawk) (ส่วนดาวน์โหลด)
2. **หา ROM ของ Super Mario World เวอร์ชัน USA** (สำเนาส่วนตัวจากตลับของคุณเอง)
3. **ดาวน์โหลดสคริปต์ Lua** จาก [Pastebin](https://pastebin.com/Jcvdqhqm) -- เปลี่ยนชื่อเป็น `mario.lua`
4. **วางสคริปต์ไว้ในโฟลเดอร์เดียวกับ ROM**
5. **เริ่ม BizHawk** เปิด ROM
6. **ใน Lua console**: `dofile("mario.lua")` หรือผ่านเมนู Script > Open Script
7. **บันทึกสถานะ** ที่จุดเริ่มต้นของด่าน (เมนู Savestate > Save State) และตั้งชื่อว่า `debut.state`
8. **เริ่มสคริปต์ใหม่** -- มันทำงานแล้ว

สคริปต์มีแบบฟอร์มพร้อมตัวเลือก:
- **Accelerate**: ปิดการจำกัด 30 fps เพื่อให้เร็วขึ้น
- **Show network**: แสดงโครงข่ายประสาทเทียมซ้อนทับบนเกม
- **Show info**: แสดงแบนเนอร์พร้อมรุ่น, fitness และจำนวนสายพันธุ์
- **Pause**: หยุดการรันชั่วคราว
- **Save/Load**: บันทึกและโหลดประชากรปัจจุบันไปยังไฟล์ `.pop`

---

## แหล่งอ้างอิงและแหล่งข้อมูล

| ทรัพยากร | ลิงก์ |
|----------|------|
| วิดีโอหลักของ Laupok | [I built an AI that plays Mario by itself](https://www.youtube.com/watch?v=F63GNXGHVwM) |
| วิดีโอทบทวนโค้ด + การตั้งค่า | [How to set up the AI + source code review](https://www.youtube.com/watch?v=u5xCl1bSe6o) |
| ซอร์สโค้ดทั้งหมด | [Pastebin Jcvdqhqm](https://pastebin.com/Jcvdqhqm) |
| บทความ NEAT ดั้งเดิม | Stanley & Miikkulainen, "Evolving Neural Networks through Augmenting Topologies", 2002 |
| บทเรียน N8Programs | [NEAT implementation walkthrough](https://n8programs.github.io/) (JavaScript แต่แนวคิดเหมือนกัน) |
| 16blings (แรงบันดาลใจของ Laupok) | [AI plays Super Mario World](https://www.youtube.com/watch?v=qv6IFaOz3bA) |
| BizHawk | [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) |
| หน่วยความจำ Super Mario World | [SMW Central - RAM Map](https://www.smwcentral.net/?p=section&a=details&id=21702) |

---

## สรุป

สิ่งที่ Laupok ทำคือการนำอัลกอริทึมเชิงวิชาการ (NEAT, 2002) มาเขียนใหม่เป็น Lua สำหรับอิมิวเลเตอร์ (BizHawk) และนำไปใช้กับ Super Mario World ผลลัพธ์: AI ที่เรียนรู้จากศูนย์เพื่อเล่นเกม โดยไม่มีความรู้ล่วงหน้า ผ่านการกลายพันธุ์แบบสุ่มและการคัดเลือกโดยธรรมชาติเท่านั้น

มันเป็นตัวอย่างที่สวยงามของพลังของอัลกอริทึมพันธุกรรม ไม่มี deep learning ไม่มี GPU ไม่มีข้อมูลฝึกหลายล้านจุด แค่การคัดเลือกโดยธรรมชาติ Lua บางส่วน และความอดทนมากมาย

โค้ดมีหมายเหตุ แบ่งปัน และ Laupok ทำวิดีโออธิบายสองเรื่อง -- เรื่องใหญ่สำหรับแนวคิดหลัก อีกเรื่องสำหรับโค้ด ถ้าหัวข้อนี้น่าสนใจ ดำดิ่งเข้าไปเลย มันเข้าถึงง่ายกว่าที่ดูเหมือน
