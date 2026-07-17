---
title: "valorant-short-maker: ไปป์ไลน์ที่สร้าง Shorts Valorant ให้ผมแบบอัตโนมัติ"
description: "Groq/Llama สำหรับสคริปต์ Piper สำหรับเสียง FFmpeg สำหรับทุกอย่างที่เหลือ cron job ผลิitและเผยแพร่วิดีโอวันละคลิปบน @valorant_agents ได้ยังไงตั้งแต่ต้นจนจบ"
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "PF5knSb0gPxhyviqT4tHsLM9CwO7G2qUs57NEHIdnIZYvi6wCrHuKjdZPQ3ACdgqEClP5d/V/AIk5DiQbYUAig=="
---

# valorant-short-maker: ไปป์ไลน์ที่สร้าง Shorts Valorant ให้ผมแบบอัตโนมัติ

ไม่กี่เดือนมานี้ มีช่อง YouTube ช่องหนึ่งที่ทำงานโดยผมไม่ต้องแตะอะไรเลย: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop) เอเจนต์ Valorant เถียงกันระหว่างยก พากย์เสียง มีซับคาราโอเกะ ลงเป็น Shorts ทุกอย่างสร้างโดย [`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker) ไปป์ไลน์ TypeScript/Bun ที่ทำงานผ่าน cron และเผยแพร่โดยไม่มีใครต้องกดอะไรทั้งนั้น

นี่คือวิธีการทำงาน ทีละขั้น

## ผลลัพธ์หน้าตาเป็นยังไง

สามเฟรมจากวิดีโอที่สร้างให้ "Duelist Debate" (Phoenix, Yoru และ Jett):

![อินโทร Shorts วงกลมเอเจนต์กับชื่อฉาก](/images/valorant-short-maker/vsm-01-intro.png)

![บทพูดกำลังดำเนินอยู่ ซับคาราโอเกะกำลังสว่าง](/images/valorant-short-maker/vsm-02-dialogue.png)

![อีกบทพูด สีซับเปลี่ยนตามเอเจนต์ที่พูด](/images/valorant-short-maker/vsm-03-dialogue.png)

ผลลัพธ์ของจริงใน Shorts นี้: [Duelist Debate -- youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU) Shorts ในช่องมียอดวิวประมาณ 1.2 ถึง 1.5k วิว ไม่ได้เยอะอะไร แต่เป็นช่องที่เดินเองตั้งแต่แรก ดังนั้นตัวเลขที่สำคัญจริง ๆ คือศูนย์ -- ศูนย์นาทีที่ใช้ไปกับมันตั้งแต่ cron ทำงาน

## ไปป์ไลน์ ตามลำดับ

### 1. เขียนสคริปต์ -- Groq + Llama 3.3

แต่ละรอบจะสุ่มเลือก 3 ถึง 4 เอเจนต์จากทั้งหมด 26 ตัว แล้วส่งให้ Llama 3.3 70B (ผ่าน Groq) พร้อม system prompt ที่มีสรุปสั้น ๆ เกี่ยวกับบุคลิกของแต่ละเอเจนต์และความสัมพันธ์กับเอเจนต์อื่นในฉาก (persona พวกนี้อยู่ใน `src/lore/` ไฟล์ละเอเจนต์) prompt บังคับกฎตายตัว: ประโยคสั้น ๆ หนึ่งประโยคต่อหนึ่งบทพูด สลับตัวละครอย่างยุติธรรม เน้นความตลก และสำคัญที่สุด -- การเว้นจังหวะ

ตัวอย่างจริงจาก "Duelist Debate" -- Phoenix, Yoru และ Jett เถียงกันว่าใครควรเล่น duelist สร้างเมื่อ 6 กรกฎาคม 2026:

```
phoenix: I'm telling you, I've got the skills to play duelist this match.
yoru: Skills, you call burning things skills, Phoenix.
jett: I'm the fastest one here, I should play duelist.
phoenix: Fastest, but can you handle the heat, Jett [0.3] I doubt it.
yoru: Heat, ha, you think your flames are hotter than my rifts.
jett: This isn't about heat or flames, it's about speed and agility.
phoenix: Oh, I see, so now you're an expert on duelists, Yoru [0.3] that's rich.
yoru: At least I don't rely on cheap fire tricks.
jett: Cheap fire tricks, that's what you call Phoenix's abilities.
phoenix: Hey, my fire tricks have gotten us out of tight spots before [0.3] can't say the same for your rifts, Yoru.
yoru: Tight spots, you mean like the time I rifted us out of that trap.
jett: Enough, this is getting nowhere, let's just decide already.
phoenix: Fine, but I'm still saying I'm the best duelist here.
yoru: Please, you think you can take on the enemy team alone [0.3] I doubt it.
jett: I can take them on, no problem, I'm the fastest.
phoenix: Fastest, yeah, but can you outmaneuver them [0.3] that's the question.
yoru: Outmaneuver, ha, you think you can outmaneuver anyone, Phoenix.
jett: This is stupid, we're not going to agree on this.
phoenix: Fine, let's just play and see who comes out on top [0.3] I'm game if you are.
yoru: Bring it on, I'll show you what a real duelist looks like.
jett: I'm not backing down, I'm playing duelist.
phoenix: Oh, this should be good [0.3] let's see how you two do.
yoru: We'll see who comes out on top, won't we, Jett.
jett: Yeah, let's end this debate once and for all.
pause: 0.3
phoenix: Alright, let's get started then [0.3] may the best duelist win.
yoru: I'll make sure to burn you, Phoenix, not with fire, but with my rifts.
jett: I'll take you both down, no problem.
```

การเว้นจังหวะคือรายละเอียดที่ทำให้ลีลาดูเป็นธรรมชาติ: `[0.3]` ที่แทรกกลางบทพูดสร้างความเงียบ 0.3 วินาทีในเสียงโดยไม่ตัดวงกลมเอเจนต์บนจอ ส่วนบรรทัด `pause: 1.0` แบบเต็มสร้างความเงียบจริงระหว่างผู้พูดสองคน ซ่อนวงกลม ถ้าไม่มีสิ่งนี้ TTS ที่พูดต่อกันไม่หยุดหายใจจะฟังดูเหมือนหุ่นยนต์

### 2. ให้เสียง -- Piper หนึ่งโมเดลต่อเอเจนต์

เอเจนต์แต่ละตัวมีโมเดล Piper (`.onnx`) ที่ฝึกมาเฉพาะ เก็บใน `voices/<agent>/` ข้อความที่สร้างขึ้นจะผ่านโมเดลที่ตรงกัน ได้ออกมาเป็นไฟล์ WAV เป็นเทคโนโลยีเดียวกับที่ผมใช้ฝึกเสียง custom ทั่วไป (ดูบทความเกี่ยวกับ Piper/Kaggle pipeline) -- ที่นี่ใช้โดยตรงใน production แบบ on-the-fly ทุกครั้งที่สร้างวิดีโอ

### 3. ซับคาราโอเกะ -- สร้าง ASS ดึงสีจากไอคอน

ซับไม่ใช่ `.srt` ธรรมดา แต่เป็นไฟล์ `.ass` (Advanced SubStation Alpha) ที่สร้างทีละคำ พร้อมเอฟเฟกต์คาราโอเกะ: แต่ละคำสว่างขึ้นเป็นสีหนึ่งตอนที่ถูกพูด ส่วนข้อความที่เหลือจะอยู่เป็นสีกลาง ๆ สีเน้นไม่ตายตัว -- มันถูกดึงออกมาแบบไดนามิกจากไอคอนของเอเจนต์ที่กำลังพูด (สคริปต์ Python รัน PIL บน PNG ของไอคอน สุ่มพิกเซลที่ไม่โปร่งใส แล้วคืนค่าสีเด่น) ผลลัพธ์: ซับของ Killjoy สว่างเป็นสีม่วง ของ Jett เป็นสีน้ำเงินอมเขียว โดยไม่มีสีไหนถูก hardcode ไว้ที่ไหนเลย

### 4. วงกลมตอบสนองเสียง -- นิพจน์ FFmpeg หนึ่งนิพจน์ต่อเฟรม

นี่คือส่วนที่ซับซ้อนที่สุดของไปป์ไลน์ และน่าจะเป็นส่วนที่ผมภูมิใจที่สุด ไอคอนวงกลมของเอเจนต์ที่กำลังพูดไม่หยุดนิ่ง: มันซูมเข้า-ออกเบา ๆ ตามจังหวะเสียงของตัวเอง

การคำนวณอ่าน WAV ดิบของบทพูด คำนวณ RMS envelope (root mean square มาตรวัดพลังงานสัญญาณ) ทีละเฟรมที่ 60 fps ปรับค่าให้เป็นมาตรฐานด้วยค่าสูงสุด แล้วทำให้เรียบด้วยหน้าต่าง 3 เฟรมเพื่อป้องกันการกระตุก แต่ละค่า envelope จะถูกแปลงเป็นค่าสเกลที่ถูกจำกัดด้วย `MAX_ZOOM_VARIATION` (0.2 หรือ ±20% จากขนาดพื้นฐาน)

ผลลัพธ์ของการคำนวณนี้ไม่ได้ถูกใช้ผ่านโค้ดที่จัดการพิกเซล -- แต่มันถูกแปลเป็นนิพจน์เงื่อนไข FFmpeg ขนาดมหึมา (`lt(n,K)*val + between(n,K,K')*val + ...` หนึ่งสาขาต่อกลุ่มเฟรม) ที่ขับเคลื่อนพารามิเตอร์ `scale` ของฟิลเตอร์วิดีโอโดยตรง FFmpeg ประเมินนิพจน์นี้ทุกเฟรมของการเรนเดอร์ สำหรับบทพูดไม่กี่วินาทีที่ 60 fps จะมีหลายร้อยสาขาในนิพจน์เดียว -- จึงมีพารามิเตอร์ `STEP` ที่รวมเฟรมเป็นกลุ่มเพื่อจำกัดความลึก

### 5. เรนเดอร์ทีละส่วน แล้ว fisheye บนอินโทร

แต่ละบทพูดถูกเรนเดอร์แยกกัน: พื้นหลังวิดีโอ (คลิป gameplay สุ่มจาก `bg-video/` ตัดให้ยาวพอดี) วงกลมเอเจนต์ซ้อนทับพร้อมซูมตามเสียง ซับฝังผ่านฟิลเตอร์ `ass` ของ FFmpeg เสียง TTS ผสมกับเสียง gameplay พื้นหลัง

ส่วนแรกสุดได้รับการดูแลเป็นพิเศษ: การบิดเบือนแบบ fisheye ที่ค่อย ๆ จางหายในช่วง 20% แรกของเฟรม (ฟิลเตอร์ `lenscorrection` ประเมินทีละเฟรม บวกกับ `tmix=frames=3` ที่ผสมเฟรมติดกันเพื่อจำลอง motion blur) ซิงก์กับเสียง "whoosh" นั่นคือทรานสิชั่นอินโทรที่ทำให้กล้องดูเหมือน "พุ่งเข้าไป" ในฉาก

### 6. ต่อคลิปและมิกซ์เสียงสุดท้าย

ทุกส่วนถูกต่อกันจากต้นถึงท้าย เพลงพื้นหลัง (Sneaky Snitch, Kevin MacLeod, สัญญาอนุญาต Creative Commons) ถูกมิกซ์ทับด้วย **audio ducking** -- sidechain compression ที่ลดระดับเสียงเพลงโดยอัตโนมัติขณะที่เอเจนต์กำลังพูด และเพิ่มกลับมาในช่วงเงียบ ทุกอย่างทำงานที่ 60 fps ตลอดทั้งกระบวนการ ไม่มีการแปลง framerate ระหว่างขั้นตอน

### 7. เผยแพร่อัตโนมัติ

สคริปต์ `run-cron.sh` ที่ถูกเรียกโดย cron ปกติ เปิดใช้งานสภาพแวดล้อม Python โหลด `.env` และรัน `bun src/workflow.ts --upload` แฟล็ก `--upload` ยังเรียกการสร้าง metadata (ชื่อ คำอธิบาย แท็ก) และเรียก `uploaders/upload.py` ซึ่งเผยแพร่วิดีโอขึ้น YouTube และ Instagram ผ่านสองสคริปต์แยกกัน (`uploaders/youtube/upload.py` และ `uploaders/instagram/`) ทั้งสายพาน ตั้งแต่ prompt LLM ไปจนถึงวิดีโอออนไลน์ ทำงานโดยไม่มีการแทรกแซงจากมนุษย์

## ทำไมต้อง TypeScript/Bun แทนที่จะเป็น Python ล้วน

ตัวเลือกนี้ไม่เกี่ยวกับอุดมคติ -- แต่เพราะ Bun ให้การเข้าถึง `Bun.spawn` โดยตรงและรวดเร็วเพื่อควบคุม FFmpeg แบบ subprocess มี strong typing บนโครงสร้างข้อมูลของไปป์ไลน์ (`Phrase`, `SegmentInfo`) และ runtime ที่เริ่มต้นเร็วกว่า Node มากสำหรับสคริปต์ที่รัน cron ทุก ๆ ไม่กี่ชั่วโมง Python สองที่เดียวในโปรเจกต์นี้คือที่ที่ Python เป็นเครื่องมือที่ดีที่สุดจริง ๆ: PIL สำหรับดึงสี และ API อัปโหลด (`google-api-python-client` สำหรับ YouTube, Instagram Graph API stack สำหรับ IG)

## สิ่งนี้แสดงให้เห็นอะไร

โปรเจกต์นี้เป็นตัวอย่างที่ดีของสิ่งที่สร้างได้ในวันนี้ด้วยบล็อกที่ฟรีหรือโอเพนซอร์สทั้งหมด: LLM ที่เร็วและฟรีผ่าน Groq API, เอ็นจิน TTS ในเครื่องที่ทำงานโดยไม่ต้องมี GPU เฉพาะ, FFmpeg สำหรับการเรนเดอร์วิดีโอทั้งหมด -- และตัวเชื่อมก็แค่ TypeScript ไม่กี่ร้อยบรรทัด ไม่มีบล็อกไหนใหม่เอี่ยมเลย สิ่งที่ทำให้เป็นไปป์ไลน์คือการจัดเรียง: สร้างสคริปต์ที่สอดคล้องกับความสัมพันธ์ตัวละครจริง แปลงเป็นเสียงที่มีอารมณ์พร้อมการเว้นจังหวะธรรมชาติ ซิงก์การเรนเดอร์ภาพกับพลังงานของเสียงนั้นทีละเฟรม และทำทุกอย่างอัตโนมัติไปจนถึงการเผยแพร่

---

**ทรัพยากร**

- **Repo**: [github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **ช่อง**: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**3 ประเด็นสำคัญ**

1. สคริปต์ถูกสร้างโดย LLM (Groq/Llama 3.3) พร้อม persona และความสัมพันธ์เฉพาะเอเจนต์ ไม่ใช่แค่ลิสต์มุกที่เขียนไว้ล่วงหน้า
2. การซูมวงกลมเอเจนต์ถูกขับเคลื่อนด้วยนิพจน์ FFmpeg ที่คำนวณทีละเฟรมจาก RMS envelope ของ WAV -- ไม่ใช่ animation แบบ keyframe ทั่วไป
3. ทั้งสายพาน ตั้งแต่ prompt จนถึงโพสต์ YouTube/Instagram ทำงานผ่าน cron job เดียว โดยไม่มีการแทรกแซงจากมนุษย์
