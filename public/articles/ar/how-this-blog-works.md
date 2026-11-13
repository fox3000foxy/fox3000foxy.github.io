---
title: كيف تعمل هذه المدونة؟
description: "وراء كواليس المدونة : React وVite وMarkdown وخط CI/CD
  وتدفق الكتابة."
date: 2026-03-08
aiGenerated: true
tags:
  - react
  - meta
  - blog
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "1JRYjWyYNZL1zcCeyAXR1vXcycntdSOQ/4U905pj9Gdcj8ObM9lkWHjiPgBNvIqFLiu2hndzu3KPT3pG1WNwcg=="
---

# كيف تعمل هذه المدونة ؟

هل تساءلت يوما كيف تعمل هذه المدونة تحت الغطاء ؟ في هذا المقال، سأفصّل لك بنية التطبيق كاملة، من الحزمة التقنية حتى عملية كتابة مقال. ونعم، سأريك حتى كيف أكتب مقالاتي من VS Code !

## الحزمة التقنية

هذه المدونة مبنية بتقنيات ويب حديثة :

- **React 19** : لواجهة المستخدم
- **TypeScript** : لكود مُنمَّط وأكثر موثوقية
- **Vite** : كأداة بناء فائقة السرعة
- **React Router v7** : للتنقل بين الصفحات
- **react-markdown** : لتحويل Markdown إلى HTML
- **rehype-raw + rehype-sanitize** : للسماح بـHTML خام في Markdown بأمان


## بنية المشروع

إليكم كيف تبدو شجرة المشروع :

![](assets/how-this-blog-works/project-structure.png)

```
├── .github/
│   └── workflows/
│       └── deploy.yml              ← خط CI/CD
├── public/
│   ├── home.md                     ← محتوى الصفحة الرئيسية
│   ├── portfolio.md                ← محتوى المحفظة
│   └── articles/
│       ├── index.json              ← قائمة كل المقالات
│       ├── hello-world.md          ← مقال
│       ├── how-this-blog-works.md  ← هذا المقال !
│       └── assets/                 ← صور المقالات
├── src/
│   ├── main.tsx                    ← مدخل React
│   ├── App.tsx                     ← الموجه الرئيسي
│   ├── components/
│   │   ├── Header.tsx              ← شريط التنقل
│   │   └── Footer.tsx              ← تذييل الصفحة
│   └── pages/
│       ├── Home.tsx                ← الصفحة الرئيسية
│       ├── BlogList.tsx            ← قائمة المقالات
│       ├── Article.tsx             ← قارئ المقال
│       ├── Portfolio.tsx           ← صفحة المحفظة
│       └── NotFound.tsx            ← صفحة 404
└── vite.config.ts                  ← إعداد Vite
```

الفكرة المركزية بسيطة : **المحتوى منفصل عن الكود**. تُكتَب الصفحات بـMarkdown في مجلد `public/`، وكود React في `src/` يتكفل بعرضها. أتمسك بهذا الفصل : يجعل المحتوى سهل المراجعة والكود سهل التطوير.

## نظام التوجيه

يعرّف ملف `App.tsx` كل طرق التطبيق مع React Router :

![](assets/20260308_153440_image.png)


| الطريق | الصفحة | الوصف |
| --------------- | ----------- | -------------------------------------------- |
| `/` | Home | الصفحة الرئيسية، تحمّل `home.md` |
| `/blog` | BlogList | قائمة كل المقالات |
| `/blog/:slug` | Article | مقال، يحمّل `articles/{slug}.md` |
| `/portfolio` | Portfolio | صفحة المحفظة، تحمّل `portfolio.md` |
| `*` | NotFound | صفحة 404 للروابط المجهولة |

لكل صفحة دور محدد : تسترجع ملف Markdown، وتحوّله إلى HTML مع `react-markdown`، وتعرضه على الشاشة.

## كيف يعمل مقال ؟

هذا هو الجزء الذي أفضله ! إليكم دورة حياة مقال :

### 1. ملف `index.json`

كل المقالات مُشار إليها في `public/articles/index.json`. يحوي كل مدخل بيانات المقال الوصفية :

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

- **slug** : المعرف الوحيد، المستخدم في الرابط (`/blog/hello-world`)
- **title** : العنوان المعروض في القائمة
- **description** : ملخص قصير
- **date** : تاريخ النشر

### 2. ملف Markdown

محتوى المقال هو ملف `.md` بسيط في `public/articles/`. يطابق اسم الملف `slug` المعرّف في `index.json`.

![](assets/20260308_153509_image.png)

تستطيع وضع ما تريد فيه : عناوين وقوائم وصور وجداول، وحتى HTML خام بفضل `rehype-raw` !

### 3. العرض جهة React

عندما تزور `/blog/hello-world`، يحدث هذا :

1. يستخرج React Router معامل `slug` من الرابط
2. يحمّل المكوّن `Article.tsx` ملف `/articles/hello-world.md`
3. يتحوّل Markdown إلى HTML بواسطة `react-markdown`
4. تُعاد كتابة روابط `assets/` تلقائيا نحو `/articles/assets/`
5. بالتوازي، تُحمَّل البيانات الوصفية من `index.json` لعرض التاريخ والوصف

بهذه البساطة !

## الصفحة الرئيسية والمحفظة

تعمل صفحتا الرئيسية والمحفظة بنفس الطريقة تماما : تحمّلان ملف Markdown (`home.md` أو `portfolio.md`) وتعرضانه كـHTML.

خصوصيتهما أنهما تستخدمان مخطط تعقيم مخصصا يسمح بخصائص `class` و`style` على كل عناصر HTML. وهذا يسمح لي بكتابة HTML منسق مباشرة في Markdown، كمعارض صور مثلا.

## الترويسة والتذييل

الترويسة مثبتة أعلى الصفحة مع `position: fixed`. تحوي :

- صورتي الرمزية في GitHub (مُحمَّلة مباشرة من `github.com/fox3000foxy.png`)
- عنوان المدونة
- روابط التنقل : الرئيسية والمدونة والمحفظة

التذييل بسيط : فقط حقوق نشر مع السنة الحالية محسوبة ديناميكيا.

## السمة الداكنة

يبقى الموقع في الوضع الداكن دائما. اخترت ذلك عمدا لقراءة مريحة مساء : `color-scheme: dark` معرّف في الأنماط العامة، مع خلفية سوداء `#000` ونص أبيض `#fff`. الروابط زرقاء (`#64b5f6`) وتصبح خضراء عند التحويم (`#81c784`).

## كيف أكتب مقالا

لننتقل للعملي ! إليكم سير عملي لكتابة مقال جديد :

### الخطوة 1 : إنشاء ملف Markdown

أفتح VS Code وأنشئ ملف `.md` جديدا في `public/articles/` :

### الخطوة 2 : كتابة المحتوى

أكتب محتوى المقال مباشرة بـMarkdown. لدى VS Code معاينة Markdown مدمجة ممتازة :

![](assets/20260308_153613_image.png)

للصور، أضعها في `public/articles/assets/` وأشير إليها بصياغة Markdown القياسية :

```markdown
![description](assets/my-image.png)
```

يعيد المكوّن `Article.tsx` كتابة مسار `assets/` تلقائيا نحو `/articles/assets/` لكي تظهر الصور صحيحا.

### الخطوة 3 : تسجيل المقال في index.json

بمجرد انتهاء المقال، أضيفه في `public/articles/index.json` ليظهر في قائمة المدونة :

![](assets/20260308_153629_image.png)

### الخطوة 4 : الاختبار محليا

أطلق خادم تطوير Vite :

```bash
pnpm dev
```

يقلع Vite في مللي ثوانٍ وأستطيع رؤية مقالي في الوقت الحقيقي على `localhost:5173`. تسمح لي هذه السرعة بالتحقق من كل تعديل فورا تقريبا :

![](assets/20260308_153703_image.png)

### الخطوة 5 : النشر

تكفي `git push` بسيطة ! يتكفل خط CI/CD بالباقي تلقائيا.

## خط النشر CI/CD

وضعت خط **GitHub Actions** كاملا يؤتمت الفحص والبناء ونشر الموقع مع كل دفع على `main`. لنرَ ذلك بالتفصيل.

يوجد workflow في `.github/workflows/deploy.yml` ومنقسم إلى وظيفتين : **build** و**deploy**.

### المحفزات

```yaml
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
```

يعمل الخط مع كل **دفع** على `main` ومع كل **pull request** تستهدف `main`. تُفحَص إذن PRs (فحص + بناء) قبل دمجها، لكن الدفعات وحدها على `main` تحفّز نشرا.

### الوظيفة 1 : Build

تعمل وظيفة البناء على `ubuntu-latest` وتتبع هذه الخطوات :

1. **Checkout** : استنساخ المستودع مع السجل كله (`fetch-depth: 0`)
2. **Setup pnpm** : تثبيت أحدث إصدار من pnpm مع `pnpm/action-setup@v4`
3. **Setup Node.js 20** : إعداد Node مع تفعيل كاش pnpm لتثبيتات أسرع
4. **Install dependencies** : تنفيذ `pnpm install --frozen-lockfile` لضمان بناء قابلة لإعادة الإنتاج (لا تعديل لملف القفل مسموح)
5. **Lint** : تنفيذ `pnpm run lint` (ESLint) لفحص جودة الكود قبل البناء
6. **Build** : تنفيذ `pnpm run build`، الذي يتحقق أولا من أنواع TypeScript (`tsc -b`) ثم يحزم الكل مع Vite
7. **Upload artifact** : رفع مجلد `dist/` كمنتج بناء لوظيفة النشر

إذا فشلت خطوة (خطأ فحص أو نوع أو بناء)، يتوقف الخط كله ولا يُنشَر شيء. يحميني هذا الحارس من الكود المكسور في الإنتاج وأعتمد عليه مع كل دفع.

### الوظيفة 2 : Deploy

لا تعمل وظيفة النشر إلا إذا :

- نجحت وظيفة البناء (`needs: build`)
- الحدث **دفع** (لا PR)
- الفرع **main**

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

ثم تتابع :

1. **تنزيل منتج البناء** : استرجاع مجلد `dist/` الذي أنتجته وظيفة البناء
2. **إعداد GitHub Pages** : تجهيز بيئة Pages
3. **الرفع نحو Pages** : تجهيز مجلد `dist/` لـGitHub Pages
4. **النشر** : نشر الموقع مع `actions/deploy-pages@v4`

### الجدول الكامل

إليكم ما يحدث من الكتابة للنشر :

```
اكتب المقال في VS Code
          ↓
    git add وcommit
          ↓
       git push
          ↓
   يُحفَّز GitHub Actions
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
     متاح على GitHub Pages !
```

تستغرق العملية كلها حوالي دقيقة بين الدفع والظهور. أنشر مع `git push` بسيطة، ويبقى الكل آليا دون المرور عبر FTP ولا SSH.

## بناء الإنتاج

تحت الغطاء، ينفذ أمر `pnpm build` :

1. `tsc -b` : يتحقق من أنواع TypeScript
2. `vite build` : يحزم ويحسّن كل الكود

ينتج Vite ملفات مصغرة ومحسنة مع تقسيم كود آلي. النتيجة موقع ثابت فائق السرعة.

## لماذا هذه البنية ؟

كان بإمكاني استخدام CMS أو مولد موقع ثابت مثل Hugo أو Jekyll، أو حتى Next.js. لكن إليكم لماذا اخترت هذه المقاربة :

- **بساطة** : اكتب بـMarkdown، وادفع على GitHub، وهو على الإنترنت
- **تحكم كامل** : لا تبعية لـCMS ولا قاعدة بيانات
- **أداء** : Vite + React = تحميل سريع
- **مرونة** : أستطيع مزج Markdown وHTML كما أريد
- **تعلم** : إنه مشروع رائع لإتقان React وTypeScript
- **CI/CD** : فحوص جودة ونشر مؤتمت مع GitHub Actions

## الخلاصة

هذه المدونة مشروع بسيط لكن مدروس : Markdown للمحتوى وReact للعرض وVite للأداء وGitHub Actions للـCI/CD وGitHub Pages للاستضافة. يرتكز فقط على ملفات ثابتة تُقدَّم بكفاءة، مع خط مؤتمت يضمن الجودة مع كل دفع.


شكرا على القراءة، وإلى اللقاء في المقال التالي ! 🦊
