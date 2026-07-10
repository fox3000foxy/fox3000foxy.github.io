---
title: บล็อกนี้ทำงานอย่างไร ?
description: "เบื้องหลังของบล็อก: React, Vite, Markdown, CI/CD Pipeline
  และขั้นตอนการเขียนบทความ"
date: 2026-03-08
aiGenerated: true
tags:
  - react
  - meta
  - blog
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "CyjvjRu5SnmyXU92gF68vGhSf/jsoWIqzDw2MdgUH8FojUMVu/sR0nYJSeysp3chWXh5WbRnEmkD2pwVUEHgNA=="
---

# บล็อกนี้ทำงานอย่างไร ?

คุณเคยสงสัยไหมว่าบล็อกนี้ทำงานภายใต้ฝาครอบอย่างไร ? ในบทความนี้ ผมจะอธิบายรายละเอียดทั้งหมดเกี่ยวกับสถาปัตยกรรมของแอปพลิเคชัน ตั้งแต่เทคนิคสแตกไปจนถึงกระบวนการเขียนบทความ ใช่แล้ว ผมจะโชว์ให้คุณเห็นด้วยว่าผมเขียนบทความของผมจาก VS Code อย่างไร !

## เทคนิคสแตก (Tech Stack)

บล็อกนี้สร้างขึ้นด้วยเทคโนโลยีเว็บสมัยใหม่:

- **React 19** -- สำหรับอินเทอร์เฟซผู้ใช้
- **TypeScript** -- สำหรับโค้ดที่กำหนดชนิดและเชื่อถือได้มากขึ้น
- **Vite** -- เป็นเครื่องมือ build ที่เร็วเป็นพิเศษ
- **React Router v7** -- สำหรับการนำทางระหว่างหน้า
- **react-markdown** -- สำหรับแปลง Markdown เป็น HTML
- **rehype-raw + rehype-sanitize** -- สำหรับอนุญาต HTML ดิบใน Markdown อย่างปลอดภัย

ทั้งหมดโฮสต์บน **GitHub Pages** โดยตรงจาก repository `fox3000foxy.github.io`

## โครงสร้างโปรเจกต์

นี่คือลักษณะโครงสร้างของโปรเจกต์:

![](assets/how-this-blog-works/project-structure.png)

```
├── .github/
│   └── workflows/
│       └── deploy.yml              ← CI/CD Pipeline
├── public/
│   ├── home.md                     ← เนื้อหาหน้าแรก
│   ├── portfolio.md                ← เนื้อหาพอร์ตโฟลิโอ
│   └── articles/
│       ├── index.json              ← รายการบทความทั้งหมด
│       ├── hello-world.md          ← บทความหนึ่ง
│       ├── how-this-blog-works.md  ← บทความนี้ !
│       └── assets/                 ← รูปภาพของบทความ
├── src/
│   ├── main.tsx                    ← จุดเริ่มต้น React
│   ├── App.tsx                     ← เราเตอร์หลัก
│   ├── components/
│   │   ├── Header.tsx              ← แถบนำทาง
│   │   └── Footer.tsx              ← ส่วนท้าย
│   └── pages/
│       ├── Home.tsx                ← หน้าแรก
│       ├── BlogList.tsx            ← รายการบทความ
│       ├── Article.tsx             ← โปรแกรมอ่านบทความ
│       ├── Portfolio.tsx           ← หน้าพอร์ตโฟลิโอ
│       └── NotFound.tsx            ← หน้า 404
└── vite.config.ts                  ← การกำหนดค่า Vite
```

แนวคิดหลักนั้นเรียบง่าย: **เนื้อหาถูกแยกออกจากโค้ด** หน้าต่าง ๆ เขียนด้วย Markdown ในโฟลเดอร์ `public/` และโค้ด React ใน `src/` ทำหน้าที่แสดงผล

## ระบบการกำหนดเส้นทาง (Routing System)

ไฟล์ `App.tsx` กำหนดเส้นทางทั้งหมดของแอปพลิเคชันด้วย React Router:

![](assets/20260308_153440_image.png)


| Route         | Page      | คำอธิบาย                                   |
| --------------- | ----------- | -------------------------------------------- |
| `/`           | Home      | หน้าแรก, โหลด `home.md`                     |
| `/blog`       | BlogList  | รายการบทความทั้งหมด                         |
| `/blog/:slug` | Article   | บทความ, โหลด `articles/{slug}.md`          |
| `/portfolio`  | Portfolio | หน้าพอร์ตโฟลิโอ, โหลด `portfolio.md`       |
| `*`           | NotFound  | หน้า 404 สำหรับ URL ที่ไม่รู้จัก             |

แต่ละหน้ามีบทบาทที่ชัดเจน: ดึงไฟล์ Markdown, แปลงเป็น HTML ด้วย `react-markdown`, และแสดงผลบนหน้าจอ

## บทความทำงานอย่างไร ?

นี่คือส่วนที่น่าสนใจที่สุด ! นี่คือวงจรชีวิตของบทความ:

### 1. ไฟล์ `index.json`

บทความทั้งหมดถูกอ้างอิงใน `public/articles/index.json` แต่ละรายการประกอบด้วยข้อมูลเมตาของบทความ:

```json
[
  {
    "slug": "hello-world",
    "title": "Hello World",
    "description": "A sample post for Fox's Blog.",
    "date": "2026-03-08"
  }
]
```

- **slug** -- ตัวระบุเฉพาะ, ใช้ใน URL (`/blog/hello-world`)
- **title** -- ชื่อเรื่องที่แสดงในรายการ
- **description** -- สรุปสั้น ๆ
- **date** -- วันที่เผยแพร่

### 2. ไฟล์ Markdown

เนื้อหาของบทความเป็นไฟล์ `.md` ธรรมดาใน `public/articles/` ชื่อไฟล์ตรงกับ `slug` ที่กำหนดใน `index.json`

![](assets/20260308_153509_image.png)

คุณสามารถใส่สิ่งที่ต้องการ: หัวข้อ, รายการ, รูปภาพ, ตาราง, และแม้แต่ HTML ดิบได้ด้วย `rehype-raw` !

### 3. การเรนเดอร์ฝั่ง React

เมื่อคุณเยี่ยมชม `/blog/hello-world` สิ่งนี้จะเกิดขึ้น:

1. React Router ดึงพารามิเตอร์ `slug` จาก URL
2. คอมโพเนนต์ `Article.tsx` โหลด `/articles/hello-world.md`
3. Markdown ถูกแปลงเป็น HTML โดย `react-markdown`
4. ลิงก์ไปยัง `assets/` ถูกเขียนใหม่เป็น `/articles/assets/` โดยอัตโนมัติ
5. ในเวลาเดียวกัน, ข้อมูลเมตาจะถูกโหลดจาก `index.json` เพื่อแสดงวันที่และคำอธิบาย

ง่ายแบบนั้นเลย !

## หน้าแรกและพอร์ตโฟลิโอ

หน้าหลักและหน้าพอร์ตโฟลิโอทำงานในลักษณะเดียวกันทุกประการ: โหลดไฟล์ Markdown (`home.md` หรือ `portfolio.md`) และเรนเดอร์เป็น HTML

จุดพิเศษคือ พวกมันใช้ schema sanitization ที่กำหนดเองซึ่งอนุญาตให้ใช้แอตทริบิวต์ `class` และ `style` บนองค์ประกอบ HTML ทั้งหมด ซึ่งทำให้ผมสามารถเขียน HTML ที่มีสไตล์ได้โดยตรงใน Markdown เช่น แกลเลอรีรูปภาพ

## ส่วนหัวและส่วนท้าย (Header และ Footer)

Header ถูกปักหมุดไว้ด้านบนของหน้าด้วย `position: fixed` ประกอบด้วย:

- Avatar GitHub ของผม (โหลดโดยตรงจาก `github.com/fox3000foxy.png`)
- ชื่อบล็อก
- ลิงก์นำทาง: หน้าแรก, บล็อก, พอร์ตโฟลิโอ

Footer เป็นแบบมินิมอล: แค่ลิขสิทธิ์พร้อมปีปัจจุบันที่คำนวณแบบไดนามิก

## โหมดมืด (Dark Theme)

เว็บไซต์เป็น **โหมดมืดเสมอ** -- ไม่มีการสลับกลางวัน/กลางคืน นี่คือการตัดสินใจโดยเจตนา: `color-scheme: dark` ถูกกำหนดในสไตล์ส่วนกลาง, พร้อมพื้นหลังสีดำ `#000` และข้อความสีขาว `#fff` ลิงก์เป็นสีน้ำเงิน (`#64b5f6`) และเปลี่ยนเป็นสีเขียวเมื่อชี้ (`#81c784`)

## ผมเขียนบทความอย่างไร

มาถึงภาคปฏิบัติ ! นี่คือขั้นตอนการทำงานของผมในการเขียนบทความใหม่:

### ขั้นตอนที่ 1: สร้างไฟล์ Markdown

ผมเปิด VS Code และสร้างไฟล์ `.md` ใหม่ใน `public/articles/`:

### ขั้นตอนที่ 2: เขียนเนื้อหา

ผมเขียนเนื้อหาของบทความโดยตรงใน Markdown VS Code มีตัวอย่าง Markdown ในตัวที่ยอดเยี่ยม:

![](assets/20260308_153613_image.png)

สำหรับรูปภาพ ผมวางไว้ใน `public/articles/assets/` และอ้างอิงด้วยไวยากรณ์ Markdown มาตรฐาน:

```markdown
![description](assets/my-image.png)
```

คอมโพเนนต์ `Article.tsx` จะเขียนเส้นทาง `assets/` เป็น `/articles/assets/` โดยอัตโนมัติเพื่อให้รูปภาพแสดงผลอย่างถูกต้อง

### ขั้นตอนที่ 3: ลงทะเบียนบทความใน index.json

เมื่อบทความเสร็จสมบูรณ์ ผมเพิ่มมันใน `public/articles/index.json` เพื่อให้ปรากฏในรายการบล็อก:

![](assets/20260308_153629_image.png)

### ขั้นตอนที่ 4: ทดสอบในเครื่อง

ผมรันเซิร์ฟเวอร์พัฒนา Vite:

```bash
pnpm dev
```

Vite เริ่มทำงานในไม่กี่มิลลิวินาที และผมสามารถดูบทความแบบเรียลไทม์ที่ `localhost:5173`:

![](assets/20260308_153703_image.png)

### ขั้นตอนที่ 5: เผยแพร่

แค่ `git push` ก็พอ ! CI/CD Pipeline จัดการส่วนที่เหลือโดยอัตโนมัติ

## Deployment Pipeline CI/CD

ผมตั้งค่า **GitHub Actions** pipeline ที่สมบูรณ์ซึ่งจะทำ lint, build และ deploy เว็บไซต์โดยอัตโนมัติทุกครั้งที่มีการ push ไปยัง `main` มาดูรายละเอียดกัน

Workflow อยู่ใน `.github/workflows/deploy.yml` และแบ่งออกเป็นสอง jobs: **build** และ **deploy**

### ตัวกระตุ้น (Triggers)

```yaml
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
```

Pipeline จะทำงานทุกครั้งที่มี **push** ไปยัง `main` และทุก **pull request** ที่มีเป้าหมายเป็น `main` ดังนั้น PRs จะถูกตรวจสอบ (lint + build) ก่อนที่จะถูก merge แต่เฉพาะ push ที่ `main` เท่านั้นที่จะกระตุ้นให้มีการ deploy

### Job 1: Build

Job build ทำงานบน `ubuntu-latest` และทำตามขั้นตอนเหล่านี้:

1. **Checkout** -- โคลน repository พร้อมประวัติทั้งหมด (`fetch-depth: 0`)
2. **Setup pnpm** -- ติดตั้ง pnpm เวอร์ชันล่าสุดด้วย `pnpm/action-setup@v4`
3. **Setup Node.js 20** -- กำหนดค่า Node พร้อมเปิดใช้งานแคช pnpm เพื่อการติดตั้งที่เร็วขึ้น
4. **Install dependencies** -- รัน `pnpm install --frozen-lockfile` เพื่อรับประกัน build ที่ reproducible (ไม่อนุญาตให้แก้ไข lockfile)
5. **Lint** -- รัน `pnpm run lint` (ESLint) เพื่อตรวจสอบคุณภาพโค้ดก่อน build
6. **Build** -- รัน `pnpm run build` ซึ่งตรวจสอบชนิด TypeScript ก่อน (`tsc -b`) จากนั้น bundle ทุกอย่างด้วย Vite
7. **Upload artifact** -- อัปโหลดโฟลเดอร์ `dist/` เป็น build artifact สำหรับ job deploy

หากขั้นตอนใดล้มเหลว -- ไม่ว่าจะเป็น lint error, type error หรือ build error -- ทั้ง pipeline จะหยุดและไม่มีอะไรถูก deploy ซึ่งช่วยปกป้องเว็บไซต์ใน production จากโค้ดที่เสียหาย

### Job 2: Deploy

Job deploy จะทำงานก็ต่อเมื่อ:

- Job build สำเร็จ (`needs: build`)
- Event เป็น **push** (ไม่ใช่ PR)
- Branch เป็น **main**

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

จากนั้นดำเนินการ:

1. **ดาวน์โหลด build artifact** -- ดึงโฟลเดอร์ `dist/` ที่ผลิตโดย job build
2. **กำหนดค่า GitHub Pages** -- ตั้งค่าสภาพแวดล้อม Pages
3. **อัปโหลดไปยัง Pages** -- เตรียมโฟลเดอร์ `dist/` สำหรับ GitHub Pages
4. **Deploy** -- เผยแพร่เว็บไซต์ด้วย `actions/deploy-pages@v4`

### ตารางแบบครบถ้วน

นี่คือสิ่งที่เกิดขึ้นตั้งแต่การเขียนจนถึงการ deploy:

```
เขียนบทความใน VS Code
         ↓
   git add & commit
         ↓
      git push
         ↓
 GitHub Actions เริ่มทำงาน
         ↓
 ┌─────────────────┐
 │   BUILD JOB     │
 │  1. Checkout    │
 │  2. Setup pnpm  │
 │  3. Setup Node  │
 │  4. Install     │
 │  5. Lint ✓      │
 │  6. Build ✓     │
 │  7. Upload dist │
 └────────┬────────┘
          ↓
 ┌─────────────────┐
 │  DEPLOY JOB     │
 │  1. Download    │
 │  2. Configure   │
 │  3. Upload      │
 │  4. Deploy 🚀   │
 └─────────────────┘
          ↓
   ออนไลน์บน GitHub Pages !
```

กระบวนการทั้งหมดใช้เวลาประมาณหนึ่งนาทีตั้งแต่ push จนถึงออนไลน์ ไม่มีการ deploy ด้วยตนเอง, ไม่มี FTP, ไม่มี SSH -- แค่ `git push` เท่านั้น

## Production Build

ภายใต้ฝาครอบ, คำสั่ง `pnpm build` จะทำงาน:

1. `tsc -b` -- ตรวจสอบชนิด TypeScript
2. `vite build` -- Bundle และปรับแต่งโค้ดทั้งหมด

Vite สร้างไฟล์ที่ minified และปรับแต่งแล้วพร้อม code-splitting อัตโนมัติ ผลลัพธ์คือเว็บไซต์แบบ static ที่เร็วเป็นพิเศษ

## ทำไมถึงเลือกสถาปัตยกรรมนี้ ?

ผมอาจใช้ CMS, เครื่องมือสร้างเว็บไซต์ static อย่าง Hugo หรือ Jekyll, หรือแม้แต่ Next.js แต่ทำไมผมถึงเลือกแนวทางนี้:

- **ความเรียบง่าย** -- เขียนใน Markdown, push ไปยัง GitHub, ก็ออนไลน์
- **ควบคุมได้ทั้งหมด** -- ไม่พึ่งพา CMS หรือฐานข้อมูล
- **ประสิทธิภาพ** -- Vite + React = โหลดเร็ว
- **ความยืดหยุ่น** -- ผมสามารถผสม Markdown และ HTML ได้ตามต้องการ
- **การเรียนรู้** -- มันเป็นโปรเจกต์ที่ยอดเยี่ยมสำหรับการเรียนรู้ React และ TypeScript
- **CI/CD** -- การตรวจสอบคุณภาพและการ deploy อัตโนมัติด้วย GitHub Actions

## บทสรุป

บล็อกนี้เป็นโปรเจกต์ที่เรียบง่ายแต่ออกแบบมาอย่างดี: Markdown สำหรับเนื้อหา, React สำหรับการเรนเดอร์, Vite เพื่อประสิทธิภาพ, GitHub Actions สำหรับ CI/CD, และ GitHub Pages สำหรับโฮสต์ ไม่มีฐานข้อมูล, ไม่มีเซิร์ฟเวอร์ backend, แค่ไฟล์ static ที่ให้บริการอย่างมีประสิทธิภาพด้วย pipeline อัตโนมัติที่รับประกันคุณภาพทุกครั้งที่มีการ push

ถ้าคุณต้องการสร้างบล็อกของคุณเองด้วยสถาปัตยกรรมที่คล้ายกัน อย่าลังเลที่จะดู[ซอร์สโค้ดบน GitHub](https://github.com/fox3000foxy/fox3000foxy.github.io) !

ขอบคุณที่อ่าน แล้วพบกันในบทความหน้าครับ ! 🦊
