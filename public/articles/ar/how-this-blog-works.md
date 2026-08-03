---
title: كيف يعمل هذه المدونة؟
description: "وراء كواليس المدونة: React، Vite، Markdown، خط أنابيب CI/CD
  وسير عمل الكتابة."
date: 2026-03-08
aiGenerated: true
authors:
  - fox3000foxy
tags:
  - react
  - meta
  - blog
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "W703KA8QuA9CI9wHdV0vyRtLexIf/qYY77qeRtwuopJ8J9NhosrrjqiLBOiZ+CsLoirXFHvwLO3udksFzEN09A=="
---

# كيف يعمل هذه المدونة؟

هل تساءلت يوماً كيف تعمل هذه المدونة تحت الغطاء؟ في هذا المقال، سأشرح لك بالتفصيل بنية التطبيق بالكامل، بدءاً من التقنيات المستخدمة وصولاً إلى عملية كتابة مقال. ونعم، سأريك أيضاً كيف أكتب مقالاتي من VS Code!

## التقنيات المستخدمة

هذه المدونة مبنية باستخدام تقنيات ويب حديثة:

- **React 19** -- لواجهة المستخدم
- **TypeScript** -- لكود منسق وأكثر موثوقية
- **Vite** -- كأداة بناء فائقة السرعة
- **React Router v7** -- للتنقل بين الصفحات
- **react-markdown** -- لتحويل Markdown إلى HTML
- **rehype-raw + rehype-sanitize** -- للسماح بـ HTML الخام داخل Markdown بأمان


## هيكل المشروع

إليك شجرة المشروع:

![](assets/how-this-blog-works/project-structure.png)

```
├── .github/
│   └── workflows/
│       └── deploy.yml              ← خط أنابيب CI/CD
├── public/
│   ├── home.md                     ← محتوى الصفحة الرئيسية
│   ├── portfolio.md                ← محتوى صفحة الأعمال
│   └── articles/
│       ├── index.json              ← قائمة بجميع المقالات
│       ├── hello-world.md          ← مقال
│       ├── how-this-blog-works.md  ← هذا المقال!
│       └── assets/                 ← صور المقالات
├── src/
│   ├── main.tsx                    ← نقطة الدخول React
│   ├── App.tsx                     ← الموجه الرئيسي
│   ├── components/
│   │   ├── Header.tsx              ← شريط التنقل
│   │   └── Footer.tsx              ← تذييل الصفحة
│   └── pages/
│       ├── Home.tsx                ← الصفحة الرئيسية
│       ├── BlogList.tsx            ← قائمة المقالات
│       ├── Article.tsx             ← قارئ المقالات
│       ├── Portfolio.tsx           ← صفحة الأعمال
│       └── NotFound.tsx            ← صفحة 404
└── vite.config.ts                  ← إعدادات Vite
```

الفكرة الأساسية بسيطة: **المحتوى منفصل عن الكود**. الصفحات مكتوبة بـ Markdown في مجلد `public/`، وكود React في `src/` يقوم بعرضها.

## نظام التوجيه

الملف `App.tsx` يحدد جميع مسارات التطبيق باستخدام React Router:

![](assets/20260308_153440_image.png)


| المسار        | الصفحة      | الوصف                                    |
| --------------- | ----------- | --------------------------------------------- |
| `/`           | Home      | الصفحة الرئيسية، تحميل `home.md`               |
| `/blog`       | BlogList  | قائمة بجميع المقالات                           |
| `/blog/:slug` | Article   | مقال، تحميل `articles/{slug}.md`              |
| `/portfolio`  | Portfolio | صفحة الأعمال، تحميل `portfolio.md`             |
| `*`           | NotFound  | صفحة 404 للعناوين غير المعروفة                 |

كل صفحة لها دور محدد: تجلب ملف Markdown، تحوله إلى HTML باستخدام `react-markdown`، وتعرضه على الشاشة.

## كيف يعمل المقال؟

هذا هو الجزء الأكثر إثارة للاهتمام! إليك دورة حياة المقال:

### 1. ملف `index.json`

جميع المقالات مُشار إليها في `public/articles/index.json`. كل مدخل يحتوي على بيانات المقال الوصفية:

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

- **slug** -- المعرف الفريد، يُستخدم في الرابط (`/blog/hello-world`)
- **title** -- العنوان المعروض في القائمة
- **description** -- ملخص قصير
- **date** -- تاريخ النشر

### 2. ملف Markdown

محتوى المقال هو مجرد ملف `.md` في `public/articles/`. اسم الملف يطابق `slug` المعرف في `index.json`.

![](assets/20260308_153509_image.png)

يمكنك وضع ما تريد فيه: عناوين، قوائم، صور، جداول، وحتى HTML خام بفضل `rehype-raw`!

### 3. العرض عبر React

عندما تزور `/blog/hello-world`، إليك ما يحدث:

1. React Router يستخرج معامل `slug` من الرابط
2. المكون `Article.tsx` يحمل `/articles/hello-world.md`
3. يتم تحويل Markdown إلى HTML بواسطة `react-markdown`
4. الروابط إلى `assets/` تُعاد كتابتها تلقائياً إلى `/articles/assets/`
5. بالتوازي، يتم تحميل البيانات الوصفية من `index.json` لعرض التاريخ والوصف

الأمر بهذه البساطة!

## الصفحة الرئيسية وصفحة الأعمال

صفحتا الرئيسية والأعمال تعملان بنفس الطريقة تماماً: تحملان ملف Markdown (`home.md` أو `portfolio.md`) وتحولانه إلى HTML.

الخصوصية هي أنهما تستخدمان مخطط تنظيف مخصص يسمح بالخاصيتين `class` و `style` على جميع عناصر HTML. هذا يسمح لي بكتابة HTML منسق مباشرة في Markdown، مثل معارض الصور على سبيل المثال.

## الرأس والتذييل

الرأس مثبت في أعلى الصفحة باستخدام `position: fixed`. يحتوي على:

- صورتي الرمزية على GitHub (تُحمّل مباشرة من `github.com/fox3000foxy.png`)
- عنوان المدونة
- روابط التنقل: الرئيسية، المدونة، الأعمال

التذييل بسيط جداً: مجرد حقوق نشر مع السنة الحالية محسوبة ديناميكياً.

## الوضع الداكن

الموقع **دائماً في الوضع الداكن** -- لا يوجد تبديل بين النهار والليل. هذا اختيار متعمد: `color-scheme: dark` محدد في الأنماط العامة، مع خلفية سوداء `#000` ونص أبيض `#fff`. الروابط زرقاء (`#64b5f6`) وتصبح خضراء عند التمرير (`#81c784`).

## كيف أكتب مقالاً

لننتقل إلى الجانب العملي! إليك سير عملي لكتابة مقال جديد:

### الخطوة 1: إنشاء ملف Markdown

أفتح VS Code وأنشئ ملف `.md` جديد في `public/articles/`:

### الخطوة 2: كتابة المحتوى

أكتب محتوى المقال مباشرة بـ Markdown. VS Code لديه معاينة Markdown ممتازة مدمجة:

![](assets/20260308_153613_image.png)

للصور، أضعها في `public/articles/assets/` وأشير إليها باستخدام صيغة Markdown القياسية:

```markdown
![description](assets/my-image.png)
```

المكون `Article.tsx` يعيد كتابة المسار `assets/` تلقائياً إلى `/articles/assets/` لتظهر الصور بشكل صحيح.

### الخطوة 3: تسجيل المقال في index.json

بمجرد الانتهاء من المقال، أضيفه إلى `public/articles/index.json` ليظهر في قائمة المدونة:

![](assets/20260308_153629_image.png)

### الخطوة 4: الاختبار محلياً

أشغل خادم التطوير Vite:

```bash
pnpm dev
```

Vite يبدأ في غضون ميلي ثوانٍ ويمكنني رؤية مقالي في الوقت الفعلي على `localhost:5173`:

![](assets/20260308_153703_image.png)

### الخطوة 5: النشر

مجرد `git push` يكفي! خط أنابيب CI/CD يتولى الباقي تلقائياً.

## خط أنابيب النشر CI/CD

لقد أعددت خط أنابيب **GitHub Actions** كامل يؤتمت الفحص والبناء والنشر للموقع عند كل push على `main`. لنرَ ذلك بالتفصيل.

سير العمل موجود في `.github/workflows/deploy.yml` ومقسم إلى وظيفتين: **build** و **deploy**.

### المشغلات

```yaml
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
```

خط الأنابيب يعمل عند كل **push** على `main` وعند كل **pull request** يستهدف `main`. يتم فحص الطلبات (فحص + بناء) قبل دمجها، لكن فقط الـ pushes على `main` تشغل النشر.

### الوظيفة 1: Build

وظيفة البناء تعمل على `ubuntu-latest` وتتبع هذه الخطوات:

1. **Checkout** -- يستنسخ المستودع مع كل التاريخ (`fetch-depth: 0`)
2. **Setup pnpm** -- يثبت أحدث إصدار من pnpm باستخدام `pnpm/action-setup@v4`
3. **Setup Node.js 20** -- يهيئ Node مع تفعيل cache pnpm لتركيبات أسرع
4. **Install dependencies** -- ينفذ `pnpm install --frozen-lockfile` لضمان بناءات قابلة للتكرار (لا يُسمح بتعديل lockfile)
5. **Lint** -- ينفذ `pnpm run lint` (ESLint) للتحقق من جودة الكود قبل البناء
6. **Build** -- ينفذ `pnpm run build`، الذي يتحقق أولاً من أنواع TypeScript (`tsc -b`) ثم يحزم كل شيء مع Vite
7. **Upload artifact** -- يرفع مجلد `dist/` كقطعة بناء لوظيفة النشر

إذا فشلت أي خطوة -- خطأ في الفحص أو الأنواع أو البناء -- يتوقف خط الأنابيب بالكامل ولا يُنشر شيء. هذا يحمي الموقع في الإنتاج من الكود المعطل.

### الوظيفة 2: Deploy

وظيفة النشر تُنفذ فقط إذا:

- وظيفة البناء نجحت (`needs: build`)
- الحدث هو **push** (ليس PR)
- الفرع هو **main**

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

ثم تتابع:

1. **تنزيل قطعة البناء** -- تسترجع مجلد `dist/` المنتج بواسطة وظيفة البناء
2. **إعداد GitHub Pages** -- تهيئة بيئة Pages
3. **رفع إلى Pages** -- تحضير مجلد `dist/` لـ GitHub Pages
4. **نشر** -- تنشر الموقع باستخدام `actions/deploy-pages@v4`

### الجدول الكامل

إليك ما يحدث من الكتابة إلى النشر:

```
كتابة المقال في VS Code
         ↓
   git add & commit
         ↓
      git push
         ↓
   GitHub Actions يبدأ
         ↓
   ┌─────────────────┐
   │  BUILD JOB      │
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
    على الإنترنت على GitHub Pages!
```

العملية بأكملها تستغرق حوالي دقيقة بين push والنشر. لا نشر يدوي، لا FTP، لا SSH -- مجرد `git push` ويتم الأمر.

## بناء الإنتاج

تحت الغطاء، الأمر `pnpm build` ينفذ:

1. `tsc -b` -- يتحقق من أنواع TypeScript
2. `vite build` -- يحزم ويحسن كل الكود

Vite ينتج ملفات مصغرة ومحسنة مع تقسيم تلقائي للكود. النتيجة هي موقع ثابت فائق السرعة.

## لماذا هذه البنية؟

كان بإمكاني استخدام CMS، أو مولد موقع ثابت مثل Hugo أو Jekyll، أو حتى Next.js. لكن إليك لماذا اخترت هذا النهج:

- **البساطة** -- اكتب بـ Markdown، ادفع إلى GitHub، يصبح على الإنترنت
- **تحكم كامل** -- لا اعتماد على CMS أو قاعدة بيانات
- **الأداء** -- Vite + React = تحميل سريع
- **المرونة** -- يمكنني مزج Markdown و HTML كما أريد
- **التعلم** -- إنه مشروع رائع لإتقان React و TypeScript
- **CI/CD** -- فحوصات جودة ونشر آلي مع GitHub Actions

## الخاتمة

هذه المدونة مشروع بسيط ولكنه مدروس جيداً: Markdown للمحتوى، React للعرض، Vite للأداء، GitHub Actions لـ CI/CD، و GitHub Pages للاستضافة. لا قاعدة بيانات، لا خادم طرف خلفي، مجرد ملفات ثابتة تُخدم بكفاءة مع خط أنابيب آلي يضمن الجودة عند كل push.


شكراً للقراءة، وإلى اللقاء في المقال القادم! 🦊
