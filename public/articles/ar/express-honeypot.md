---
title: "بنيت شرك Express فائق الواقعية"
description: "328 نقطة نهاية وهمية مع ردود تُنشأ فورياً، تزوير الرؤوس، تسجيل حركة البوتات -- غوص عميق في برمجية وسيطة لـ Express مصممة لخداع الماسحات الضوئية."
aiGenerated: true
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "7ja9gl+RFfE+JKLEFvDNxriAvxcVSHt8znn+vsUxS23rQdYQFz84BRa3lnxzYAhCyuF8mHvXmc1WULLsYUKqkA=="
---

## الفكرة

هل سبق لك أن نظرت إلى سجلات خادم Express ورأيت طلبات غريبة إلى `/wp-admin`، `/.env`، `/etc/shadow`؟ هذه هي البوتات والماسحات الضوئية والفضوليون الذين يختبرون تطبيقك بحثاً عن نقاط الضعف.

لذلك قررت بناء **برمجية وسيطة (middleware) من نوع honeypot لـ Express** -- شرك يستجيب لهذه الطلبات بردود فائقة الواقعية، كما لو كانت كل نقطة نهاية خدمة حقيقية مكشوفة.

## لماذا honeypot بدلاً من 404 فقط

عندما يصادف بوت تطبيقك:

- **مع 404**: يعرف أن المسار غير موجود، فينتقل إلى التالي.
- **مع رد مزيف**: يظن أنه وجد شيئاً مثيراً للاهتمام ويواصل الاستكشاف، كاشفاً بذلك سلوكه وتقنياته.

الـ honeypot المصمم جيداً يسمح بـ:
- تسجيل حركة البوتات للتحليل
- إضاعة وقت الماسحات الضوئية
- اكتشاف أنماط هجوم ناشئة
- دراسة تقنيات البوتنتات

## نقاط النهاية الـ 328

تغطي البرمجية الوسيطة **328 نقطة نهاية** (بنمطين: `default` و `complete`). كل نقطة نهاية ترجع محتوى معقولاً يتم إنشاؤه فورياً.

إليك توزيعها:

| الفئة | أمثلة |
|---|---|
| تسريبات بيانات الدخول | `.env`، `secrets.json`، `aws/credentials` |
| مفاتيح SSH | `.ssh/id_rsa`، `.ssh/id_ed25519` |
| إعدادات قواعد البيانات | `config/database`، `wp-config.php`، `docker-compose.yml` |
| لوحات الإدارة | `/admin`، `/wp-admin`، `/manage/account/login` |
| ردود API | `/api/version`، `/api/config` |
| تصيد بنكي | `/lander/sber*`، `/index_sber.php` |
| نبضات C2 | مسارات عشوائية (`/262LBNFp`، `/Kd67Fq1x`) |
| عملات رقمية/أسهم | `/stock/mzhishu`، `/kline/1m/1` |
| ألعاب/مقامرة | `/proxy/games`، `/Ctrls/GetSysCoin` |
| صفحات ثابتة | `/about`، `/contact`، `/products`، `/blog` |

## بنية البرمجية الوسيطة

جوهر المشروع هو مولد النماذج الذي ينتج كل رد على الطاير:

```ts
// المولد يعيّن طابعاً زمنياً و request_id فريدين
function generateMockResponse(endpoint: string): MockResponse {
    return {
        timestamp: Date.now(),
        requestId: crypto.randomUUID(),
        data: generateContentFor(endpoint),
    };
}
```

### مستويان من الواقعية

النمط `default` يعيد ردوداً موجزة لكنها معقولة:

```json
{
    "code": 0,
    "message": "ok",
    "data": { "user": "admin", "role": "superadmin" }
}
```

النمط `complete` يضيف بيانات وصفية وأختام زمنية ورؤوس إصدار لأقصى واقعية:

```json
{
    "code": 0,
    "message": "ok",
    "timestamp": 1718032412000,
    "request_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "version": "1.2.3",
    "data": { "user": "admin", "role": "superadmin" }
}
```

## تزوير الرؤوس

جانب حاسم للمصداقية -- رؤوس HTTP. تختارها البرمجية الوسيطة ديناميكياً حسب امتداد الملف المطلوب:

| الامتداد | `X-Powered-By` |
|---|---|
| `.php` | `PHP/8.1.12` |
| `.jsp` | `JSP/3.0` |
| `.aspx`، `.ashx`، `.asmx` | `ASP.NET` |
| `.do`، `.action` | `Servlet/3.0` |
| أخرى | بدون رأس |

## مزيف PHP

مكوّن مثير للاهتمام هو `phpSpoofer`. بدلاً من إعادة رد ثابت، يمكنه **توكيل طلبات `.php` إلى خادم PHP محلي**:

1. يعترض الطلبات التي تحتوي على `.php` في المسار
2. يزيل اللاحقة `.php` ويوكل إلى `http://localhost:<port>/<base>`
3. إذا استجاب الخادم المحلي، يتم إرجاع HTML إلى البوت
4. إذا لم يكن المضيف localhost، يرجع 404 (حماية SSRF)

هذا يسمح بتسليم **صفحات WordPress حقيقية** للبوتات في بيئة التطوير.

## واجهة برمجية عامة

توفر البرمجية الوسيطة واجهة قابلة للتجميع:

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

### استخدام بسيط

```js
const { createHoneypot } = require("express-middleware-honeypot");
const instance = createHoneypot({ logTraffic: true });
instance.register(app);
```

### استخدام متقدم -- نقاط نهاية فردية

```js
const instance = createHoneypot({});
app.all('/admin', instance.mocks['/admin']);
app.all('/.env', instance.mocks['/.env']);
```

### وضع catch-all

```js
app.use(instance.middleware);
app.use(instance.phpSpoofer);
```

## تسجيل الحركة

مع خيار `logTraffic: true`، يُسجل كل طلب وارد بصيغة JSON-lines في `traffic.txt`. المسارات غير المعروفة (غير المدرجة ضمن الـ 328 نقطة نهاية مدمجة) متاحة عبر `/newBotsRoute`، مما يسمح بتوسيع التغطية.

## توليد النماذج للتصحيح

لكتابة النماذج على القرص وفحصها:

```bash
bun run scripts/generate-mockups.ts --dry-run
bun run scripts/generate-mockups.ts --list-uncategorized
```

## النتائج

منذ تثبيت هذا honeypot على خادم staging:

- **أكثر من 5000 طلب مشبوه** تم تسجيلها في 48 ساعة
- **بوتات جديدة** تُكتشف يومياً عبر المسارات غير المغطاة
- **أنماط هجوم ناشئة** تم تحديدها (C2 جديدة، تقنيات مسح)
- **صفر نتائج إيجابية خاطئة** -- المستخدمون الحقيقيون لا يزورون هذه المسار أبداً

## الخاتمة

هذا المشروع يظهر أنه يمكن تحويل نقطة ضعف تشغيلية (الطلبات غير المرغوب فيها) إلى أداة استخباراتية. البرمجية الوسيطة متاحة على npm والكود مفتوح المصدر.

الكود المصدري متاح هنا: [https://github.com/fox3000foxy/express-honeypot-middleware](https://github.com/fox3000foxy/express-honeypot-middleware)
