---
title: "ฉันสร้าง honeypot Express ที่สมจริงอย่างยิ่ง"
description: "328 ปลายทางปลอมพร้อมการตอบสนองที่สร้างขึ้นทันที การปลอมแปลงส่วนหัว การบันทึกทราฟฟิกบอท — เจาะลึกโค้ดของมิดเดิลแวร์ honeypot Express ที่ออกแบบมาเพื่อหลอกลวงสแกนเนอร์"
date: "2026-06-10"
aiGenerated: true
tags:
  - express
  - nodejs
  - security
  - honeypot
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "yBPflhf7Eewds8MJj1Tb27Y2bTrlmtoyIY2saUTOE7SVbYRMNBDDOzwYkF1JIYSl6lc1x1Pdgsw4sTt2IHdl3A=="
---

## แนวคิด

บอทและสแกนเนอร์อัตโนมัติสแกนเว็บแอปพลิเคชันอย่างต่อเนื่องเพื่อหาช่องโหว่ พวกมันมองหาไฟล์ `.env` แผงผู้ดูแลระบบ การสำรองฐานข้อมูล ข้อมูลประจำตัว SSH — อะไรก็ตามที่สามารถนำไปใช้ประโยชน์ได้

แทนที่จะส่งคืน 404 ธรรมดา ฉันต้องการสร้างสิ่งที่สนุกกว่า: **honeypot Express** ที่ตอบสนองด้วยเนื้อหาที่น่าเชื่อถือ ทำให้ผู้โจมตีเชื่อว่าพวกเขาพบเป้าหมายที่มีช่องโหว่

## ความสามารถ

มิดเดิลแวร์นี้เปิดเผย **328 ปลายทาง** แบ่งเป็นสองรูปแบบ (ค่าเริ่มต้นและสมบูรณ์) แต่ละคำขอจะได้รับการตอบสนองที่ไม่ซ้ำกันซึ่งสร้างขึ้นทันทีพร้อมประทับเวลาและ ID คำขอใหม่ เลียนแบบเซิร์ฟเวอร์จริง

## เริ่มต้นใช้งาน

```bash
npm install express-middleware-honeypot
```

การใช้งานพื้นฐานกับการลงทะเบียนอัตโนมัติ:

```js
const express = require("express");
const { createHoneypot } = require("express-middleware-honeypot");

const app = express();

const instance = createHoneypot({
    knownPaths: ["/", "/login", "/support"],
    knownPatterns: [/^\/blogs\/[^/]+$/],
    knownApiPaths: ["/api/cart", "/api/cart/list"],
    knownApiPatterns: [/^\/api\/cart\/[^/]+$/],
    logTraffic: true,
    is404Handler: true,
    isCompleteResponses: false,
});

instance.register(app);

app.listen(3000, () => {
    console.log("เซิร์ฟเวอร์กำลังทำงานบนพอร์ต 3000");
});
```

## วิธีการทำงาน

### การสร้างทันที

ไม่มีไฟล์จำลองบนดิสก์ บริการ `mockupGenerator.ts` สร้างการตอบสนองแต่ละรายการ ณ เวลาที่คำขอด้วย:

- ประทับเวลาและ ID คำขอที่ไม่ซ้ำกัน
- เนื้อหาที่ปรับให้เหมาะกับปลายทาง (ข้อมูลประจำตัว การกำหนดค่า หน้าเข้าสู่ระบบ การตอบสนอง API)
- ส่วนหัว HTTP ที่สมจริงพร้อมการปลอมแปลง `X-Powered-By` แบบไดนามิก

### การปลอมแปลงส่วนหัว

`headersMiddleware` เลือกส่วนหัว `X-Powered-By` แบบไดนามิกตามนามสกุลของเส้นทาง:

- `.php` → `X-Powered-By: PHP/8.1.12`
- `.jsp` → `X-Powered-By: JSP/3.0`
- `.aspx/.ashx/.asmx` → `X-Powered-By: ASP.NET`
- `.do/.action` → `X-Powered-By: Servlet/3.0`
- เส้นทางอื่น → ไม่มีส่วนหัว `X-Powered-By`

### 328 ปลายทาง

| ประเภท | ตัวอย่างปลายทาง |
|---|---|
| การรั่วไหลของข้อมูลประจำตัว | `.env`, `secrets.json`, `aws/credentials`, `etc/shadow` |
| คีย์ SSH | `.ssh/id_rsa`, `.ssh/id_ed25519` |
| การกำหนดค่าฐานข้อมูล | `config/database`, `wp-config.php`, `docker-compose.yml` |
| แผงผู้ดูแลระบบ | `/admin`, `/wp-admin`, `/manage/account/login` |
| การตอบสนอง API | `/api/version`, `/api/config`, `.do`, `.ashx` |
| ฟิชชิ่งธนาคาร | `/lander/sber*`, `/index_sber.php` |
| การส่งสัญญาณ C2 | เส้นทางสุ่ม 6+ ตัวอักษร (`/262LBNFp`, `/Kd67Fq1x`) |
| หุ้น/คริปโต | `/stock/mzhishu`, `/kline/1m/1`, `/m/allticker/1` |
| การพนัน/เกม | `/proxy/games`, `/Ctrls/GetSysCoin`, `/room/getRoomBangFans` |
| ไฟล์กำหนดค่า | `config.json`, `config.yml`, `sitemap.xml`, `ads.txt` |
| หน้าแลนดิ้ง | `/about`, `/contact`, `/products`, `/blog` |

### การปลอมแปลง PHP

`instance.phpSpoofer` ดักจับคำขอ `*.php` และส่งต่อพร็อกซีไปยังเซิร์ฟเวอร์พัฒนาท้องถิ่นของคุณ โดยส่งคืนผลลัพธ์ PHP จริงแทนการจำลองแบบคงที่

### การบันทึกทราฟฟิก

ทราฟฟิกสามารถบันทึกในรูปแบบ JSON-lines ไปยัง `traffic.txt` เส้นทางที่ไม่รู้จักซึ่งไม่ได้รับการจัดการสามารถดึงข้อมูลผ่าน `GET /newBotsRoute`

## API ของ HoneypotInstance

```ts
interface HoneypotInstance {
  mocks: Record<string, Middleware>;
  middleware: Middleware;
  headersMiddleware: Middleware;
  phpSpoofer: Middleware;
  notFoundHandler: Middleware;
  register(app: RouteApp): void;
  getUnhandledRoutes(): Promise<string[]>;
  getNotCoveredEndpoints(): string[];
}
```

## ทำไมถึงมีประสิทธิภาพ

สแกนเนอร์อัตโนมัติคาดหวังให้เว็บไซต์ที่มีช่องโหว่มีไฟล์บางอย่าง โดยการตอบสนองด้วยเนื้อหาจริงแทน 404 honeypot สามารถ:

1. **ทำให้ผู้โจมตีเสียเวลา** ในการวิเคราะห์ผลลัพธ์ปลอม
2. **บันทึกลายนิ้วมือของพวกเขา** เพื่อวิเคราะห์ในภายหลัง
3. **เบี่ยงเบนความสนใจ** จากช่องโหว่ที่แท้จริง
4. **เผยให้เห็นรูปแบบการโจมตีใหม่** ผ่านเส้นทางที่ไม่ได้รับการจัดการ

## บทสรุป

ซอร์สโค้ดทั้งหมดพร้อมใช้งานบน GitHub ที่ [github.com/anomalyco/express-honeypot-middleware](https://github.com/anomalyco/express-honeypot-middleware) ลองนำไปใช้ เปิด issue หรือมีส่วนร่วมได้เลย
