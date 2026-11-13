---
title: "بنيت honeypot Express واقعيا للغاية"
description: "328 endpoint زائفا مع ردود مولدة لحظيا، وتزوير ترويسات، وتسجيل ترافيك البوتات، غوص في قلب middleware honeypot لـExpress مصمم لخداع الماسحات."
date: 2026-06-10
aiGenerated: true
tags:
  - express
  - nodejs
  - security
  - honeypot
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "/S+IEQuIFAq3bIN7a8JxYW9vib+5uRx1DzdMPUmkKs+G258kbY+yCIwElDDTzSwVF92t1uYD9lPrALD7ZpS9vA=="
---

## TL;DR

أنشأت middleware لـExpress يعرض **328 endpoint زائفا** للاختيار بين متغيرين : `default` (ردود رصينة لكن موثوقة) و`complete` (ردود مفصلة جدا). كل رد **مولَّد لحظيا** مع طوابع زمنية ومعرفات طلب جديدة، مما يجعل كل رد فريدا. لا يوجد أي ملف mock على القرص. يستطيع الـmiddleware أيضا **تسجيل الترافيك** في ملف نصي وعرض الطرق غير المُدارَة على `/newBotsRoute` لتحليل ما تبحث عنه البوتات.

**إنه أكثر بكثير من مجرد إعادة 404.** صممت هذه القطعة الهندسية لتشبه خادما حقيقيا، لكي تضيّع الماسحات وقتها عليها. أريك كيف تعمل.

## المشكلة

بوتات الأمان والكاشطات والفاعلون الخبثاء يمسحون باستمرار خوادم الويب بحثا عن طرق شائعة :

- `.env` و`wp-config.php` و`admin/` و`phpinfo.php`، إلخ.
- نقاط API مثل `/api/version` و`/api/config`
- ملفات إعداد : `dump.sql` و`.git/config` و`docker-compose.yml`
- صفحات تصيد مصرفي : `/lander/sberbank*` و`/index_sber.php`

رأيت هذا الحد على خوادمي الخاصة : إعادة 404 أو 403 تشير فورا للماسح أن الطريق غير موجود، فينتقل للتالي. اخترت العكس مع هذا الـhoneypot : **جعل الماسح يظن أن كل شيء موجود**، ليضيع وقته على ردود زائفة بينما يبقى خادمك الحقيقي محميا خلف طرقك المعروفة.

## البنية

### 1. مصنف، لا جدول بحث

القطعة الأساسية هي دالة `classify()` في `src/services/mockupGenerator.ts` تأخذ مسار endpoint وتعيد مولد رد. بنيتها كسلسلة قواعد :

1. **مطابقات دقيقة** : أكثر الـendpoints شيوعا لها مولدات مخصصة
2. **مطابقات بالنمط** : regex على المسار لكشف أنماط مثل `id_rsa` و`wp-admin` و`sitemap.xml`
3. **تصنيف ذكي** : مسارات مثل `/262LBNFp` (6+ حروف عشوائية) تُصنَّف "نبضات قلب C2"
4. **قواعد شاملة** : مسارات API وملفات `.php` و`.html` و`.js` و`.json` و`.asmx` لها مولدات عامة
5. **التقاط نهائي** : `genCatchall()` ينتج رد JSON عاما مع بيانات وصفية

أحب هذه المقاربة لأن الردود تبقى **جديدة مع كل طلب** : لا ملف ثابت، ولا تخزين مؤقت، كل رد يحمل طابعه الزمني الخاص كأنه من خادم حقيقي.

### 2. نظام المتغير المزدوج

يدعم كل مولد متغيرين :

```typescript
type Variant = "default" | "complete";
```

- **`default`** : ردود موجزة لكن موثوقة. مثال لـ`.env` :
  ```
  DB_HOST=localhost
  DB_USER=root
  DB_PASS=s3cur3P@ss
  APP_ENV=development
  APP_DEBUG=true
  ```

- **`complete`** : ردود مفصلة جدا. مثال لـ`.env` :
  ```
  # Database
  DB_CONNECTION=mysql
  DB_HOST=db-master-01.internal.example.com
  DB_PORT=3306
  DB_DATABASE=production_app_v2
  DB_USER=admin_service
  DB_PASS=mM9k#2$xL!qR7pZ

  # Redis
  REDIS_HOST=redis-cluster-01.internal.example.com
  REDIS_PORT=6379
  REDIS_PASSWORD=R3d!s_S3cur3_K3y_2025

  # App
  APP_ENV=production
  APP_DEBUG=false
  APP_URL=https://admin.internal.example.com
  APP_KEY=base64:qJ3fR8mL2pX5vB7nC4kA9wE1yH6sD0tG
  ...
  ```

يتضمن المتغير `complete` أيضا صفحات HTML كاملة مع CSS منسق : صفحات إدارة وشاشات دخول WordPress وصفحات تصيد مصرفي بالروسية، إلخ. أجده مرعبا عندما تريد فعلا إشغال ماسح.

### 3. توليد لحظي

أستخدم `Date.now()` و`Date().toISOString()` لإنتاج طوابع زمنية ومعرفات طلب فريدة مع كل استدعاء. إليكم دالة الإثراء :

```typescript
function enrichResponse(response: Record<string, unknown>): Record<string, unknown> {
  return {
    ...response,
    timestamp: getTimestamp(),
    version: "1.0",
    lastUpdated: getTimestamp(),
  };
}
```

لردود JSON، يحاول الـmiddleware التحليل والإثراء بهذه الحقول. الردود غير JSON تُعاد كما هي.

### 4. middleware تزوير الترويسات

أضفت middleware مخصصا يضبط ترويسات HTTP واقعية حسب امتداد الملف المطلوب :

```typescript
res.setHeader("Server", "nginx/1.24.0");
res.setHeader("X-Frame-Options", "SAMEORIGIN");
res.setHeader("X-XSS-Protection", "1; mode=block");
res.setHeader("X-Content-Type-Options", "nosniff");
res.setHeader("X-Robots-Tag", "noindex, nofollow");
res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

// X-Powered-By واقعي حسب امتداد الملف
if (path.endsWith(".php")) res.setHeader("X-Powered-By", "PHP/8.1.12");
else if (path.endsWith(".jsp")) res.setHeader("X-Powered-By", "JSP/3.0");
else if (path.endsWith(".aspx") || path.endsWith(".ashx") || path.endsWith(".asmx"))
  res.setHeader("X-Powered-By", "ASP.NET");
else if (path.endsWith(".do") || path.endsWith(".action"))
  res.setHeader("X-Powered-By", "Servlet/3.0");
```

وهذا يجعل الردود أكثر موثوقية : endpoint بصيغة `.php` مع `X-Powered-By: PHP/8.1.12` و`Server: nginx/1.24.0` يشبه تماما خادم WordPress حقيقي. أتمسك بهذا التفصيل لأن الترويسة هي غالبا ما تخون خادما زائفا.

### 5. مُزوِّر PHP

يبقى `phpSpoofer` مكوني المفضل. إذا وصل طلب لملف `.php` وكان المضيف localhost، **يوكّل** الـmiddleware الطلب نحو خادم PHP المحلي الخاص بك، الذي يعالج ويعيد صفحة PHP حقيقية. وإذا كان المضيف بعيدا، يعيد 404 لحظر أي محاولة SSRF.

```typescript
const phpSpoofer = async (req, res, next) => {
  if (!req.path?.match(/\.php$/)) return next();
  const host = req.headers?.host;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]")) {
    const baseUrl = req.originalUrl.replace(/\.php.*$/, "");
    const response = await fetch(`http://${host}${baseUrl}`);
    // يعيد رد PHP الحقيقي
  } else {
    res.status(404).send("404 Not Found");
  }
};
```

وهذا يسمح، عندما تشغّل WordPress محليا، أن يخدم الـhoneypot البوتات بصفحات WordPress **حقيقية** : أقصى واقعية حسب تجربتي.

### 6. تسجيل الترافيك وتحليله

فصلت مسؤوليتين : `TrafficService` يسجل كل طلب في ملف JSON-lines. ثم يحلل `UnhandledRoutesService` هذه السجلات لتحديد المسارات التي تطلبها البوتات والتي تبقى لتُغطَّى في الـhoneypot.

```typescript
app.get("/newBotsRoute", async (_req, res) => {
  const routes = await unhandledRoutesService.getUnhandledRoutes(
    additionalEndpoints, knownPathOptions
  );
  res.setHeader("Content-Type", "text/plain");
  res.send(routes.join("\n"));
});
```

أعشق حلقة التغذية الراجعة هذه : كلما تركت الـhoneypot يعمل، تعلمت أكثر عما تبحث عنه البوتات، وتستطيع إضافة هذه المسارات إلى endpoints المعروفة لديك.

### 7. Endpoints معروفة واستثناء

يقبل الـmiddleware قوائم `knownPaths` و`knownPatterns` و`knownApiPaths` و`knownApiPatterns`. كل طريق يطابقها يعبر الـmiddleware نحو تطبيقك الحقيقي. أجد هذا المرشح لا غنى عنه : تبقى endpoints الحقيقية سليمة، ولا يعترضها الـhoneypot أبدا.

```typescript
const matches = (p) => p === endpoint || p.startsWith(endpoint + "/");
```

## الـ328 endpoint بالتفصيل

إليكم كيف تُصنَّف (مقتطف من المصنف) :

| الفئة | أمثلة endpoints |
|---|---|
| تسريبات بيانات اعتماد | `.env` و`secrets.json` و`aws/credentials` و`etc/shadow` |
| مفاتيح SSH | `.ssh/id_rsa` و`.ssh/id_ed25519` |
| إعدادات قواعد بيانات | `config/database` و`wp-config.php` و`docker-compose.yml` |
| لوحات إدارة | `/admin` و`/wp-admin` و`/manage/account/login` |
| ردود API | `/api/version` و`/api/config` و`.do` و`.ashx` |
| تصيد مصرفي | `/lander/sber*` و`/index_sber.php` |
| نبضات قلب C2 | مسارات عشوائية من 6+ حروف (`/262LBNFp`) |
| أفعال/بورصة | `/stock/mzhishu` و`/kline/1m/1` و`/m/allticker/1` |
| ألعاب/كازينو | `/proxy/games` و`/Ctrls/GetSysCoin` و`/room/getRoomBangFans` |
| ملفات إعداد | `config.json` و`config.yml` و`sitemap.xml` و`ads.txt` |
| صفحات هبوط | `/about` و`/contact` و`/products` و`/blog` |

## رموز وendpoints خاصة

أضفت مولدات متخصصة لحالات خاصة :

- **`genLanding()`** : صفحات تصيد مصرفي بالروسية لـСберБанк وТинькофф وГазпромбанк
- **`genC2Heartbeat()`** : رد نبضة قلب C2 واقعي مع `agent_id` و`group` و`version`
- **`genScannerPath()`** : فخاخ لماسحات بعينها (منافذ nmap NICE وHazelcast وCGI)
- **`genChineseApi()`** : ردود API صينية مع `msg: "成功"` (نجاح)
- **`genMerchant()`** : ملفات تجار مع `balance` و`fee_rate` و`tier`

## كيفية الاستخدام

### التثبيت

```bash
npm install express-middleware-honeypot
```

### استخدام أساسي مع تسجيل تلقائي

```javascript
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
app.listen(3000);
```

### مع app.use() (middleware شامل وحيد)

```javascript
const { createHoneypot } = require("express-middleware-honeypot");
const app = express();

// طرقك الحقيقية أولا
app.get("/", (req, res) => res.send("Home"));

// ثم الـhoneypot الشامل
const instance = createHoneypot({ /* options */ });
app.use(instance.headersMiddleware);
app.use(instance.middleware);
```

### ردود كاملة ضد افتراضية

```javascript
// ردود مفصلة مع صفحات HTML كاملة
const instance = createHoneypot({ isCompleteResponses: true });
```

### تسجيل الترافيك

```javascript
const instance = createHoneypot({ logTraffic: true });
// راجع ملف traffic.txt لترى ما تطلبه البوتات
```

## الخلاصة

يتجاوز middleware الـhoneypot في Express هذا مجرد شرك بسيط. مع **328 endpoint** و**توليد لحظي** و**تزوير ترويسات ديناميكي** و**تسجيل ترافيك** وحتى **وكيل PHP** لردود WordPress حقيقية، صممته ليبقى واقعيا قدر الإمكان.

تضيّع الماسحات وقتها على صفحات إدارة زائفة وملفات `.env` موثوقة وصفحات تصيد مصرفي بينما يبقى تطبيقك الحقيقي محميا. أقدّر خصوصا نظام المتغير المزدوج والتصنيف الذكي : كل رد يبقى جديدا وملائما للمسار المطلوب.

الكود المصدري متاح على GitHub : [https://github.com/fox3000foxy/express-honeypot-middleware](https://github.com/fox3000foxy/express-honeypot-middleware)
