---
title: شرح سكريبت التوقيع SSH
description: تحليل مساعد توقيع commits SSH ولماذا أردت commits أنيقة.
date: 2026-03-08
aiGenerated: trueauthors:
  - fox3000foxy
tags:
  - git
  - security
  - shell
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "cOVkMzEaPwyS5x+KadtqtA9xvQmHOX/YjvAy95WsL6UucM99iNxCbVsEpDSimu2fHFslK6UMEBIBfa+WtrVdNg=="
---

# سكريبت توقيع SSH للـ commits -- شرح

هذا المقال يحلل السكريبت `setup-ssh-signing.sh` الذي نشرته على [Gist](https://gist.github.com/fox3000foxy/95500d129cd4bf5c173c323d2492569a). سنرى ما يفعله كل جزء، كيف يجعل التوقيع SSH المحلي لمستودع أمرًا سلسًا تمامًا، ونعم، لماذا تكبدت عناء كتابته (تنبيه: كنت أريد فقط أن تكون لـ commits الخاصة بي **شكلاً** رائعًا).

## الدافع

لطالما أحببت تعديل سير عمل Git الخاص بي، وبعد رؤية أشخاص بشعارات «Verified» صغيرة بجانب commitsهم، قلت في نفسي: لماذا لا أنا؟ التوقيع GPG المدمج ثقيل وعمومي، لذا انتهى بي الأمر بكتابة مساعد صغير يقوم بـ:

- إنشاء مفتاح SSH مخصص للتوقيع،
- تكوين المستودع الحالي فقط،
- إعادة كتابة التاريخ اختياريًا لتوقيع الـ commits القديمة،
- والسماح بنقل المفتاح بين الأجهزة.

بصراحة، كانت الحاجة للتباهي بشكل أساسي. لا توجد متطلبات تقنية للتوقيع في مشاريعي الشخصية، لكن رؤية شارة خضراء «Verified» على commit يعطي تأثيرًا لطيفًا، وكانت كتابة السكريبت متعة في shell.

> حسنًا، توقيع commitsك يشبه ارتداء سترة جلدية لمراجعة كود -- غير ضروري تمامًا، لكنه يجعلك تشعر وكأنك هاكر.

## ما يفعله السكريبت

السكريبت هو ملف Bash واحد مع `set -euo pipefail` في الأعلى ليتوقف بسرعة وبشكل نظيف. إليك ملخص ما يفعله:

1. **توليد أو استيراد مفتاح توقيع**  
   يتم وضع المفاتيح في `.git-signing/` داخل المجلد حيث تشغّل السكريبت.
2. **تكوين Git محليًا**  
   يضبط `gpg.format=ssh` و`user.signingkey` و`commit.gpgsign=true` و`tag.gpgSign=true` وملف `allowedSignersFile` يشير إلى المفتاح العام.
3. **إدارة المفاتيح بين الأجهزة**  
   بفضل `--export-keys` / `--import-keys`، يمكنك نقل مفتاحك الخاص من جهاز لآخر دون لمس الإعدادات العامة.
4. **إعادة كتابة التاريخ اختياريًا** (`--resign-all`)  
   يعيد كتابة جميع commits كل الفروع/الوسوم (أو فقط تلك غير الموجودة في `upstream` للـ forks) ويعيد توقيعها باستخدام `-S`، دون التأثير على المؤلفين الآخرين.
5. **خيارات مساعدة**  
   `--autostash` و`--autopush` و`--commit-date` و`--yes` للوضع غير التفاعلي، إلخ.
6. **كشف الـ fork والتحقق الأمني**  
   يكتشف الـ remote `upstream`، ويحذر قبل إعادة كتابة التاريخ، ويتحقق من الأدوات المطلوبة (`git` و`ssh-keygen` و`zip/unzip`)، ويتأكد من الصلاحيات الصحيحة، بل وينسخ المفتاح بشكل آمن إذا كانت صلاحيات نظام الملفات متساهلة جدًا.

السكريبت متطابق (idempotent): تشغيله مرتين لا يعيد توليد مفتاحك ولا يمسح الإعدادات الموجودة.

## الشرح خطوة بخطوة

إليك بعض المقتطفات الرئيسية من الكود مع شروحاتها.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Configure SSH commit signing in a controlled, repo-local way.
# - Key files are created in the directory where this script is launched.
# - Git config is written locally to the current repository only.
```

الرأس يضع الأمان ويوثق الهدف. الجزء التالي يحلل خيارات CLI (`--name` و`--email` و`--repo`، إلخ) باستخدام حلقة `while [[ $# -gt 0 ]]; do case … esac done`. يتم التحقق من حقول الهوية الإلزامية لاحقًا:

```bash
if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "Error: missing identity. Provide --name and --email." >&2
  exit 1
fi
```

توليد المفتاح يتم في `$LAUNCH_DIR/.git-signing`. إذا كان المفتاح موجودًا بالفعل، يتركه السكريبت كما هو؛ `--import-keys` يسمح بملء المجلد من ملف ZIP.

```bash
mkdir -p "$KEY_DIR"

if [[ -n "$IMPORT_ZIP_PATH" ]]; then
  import_keys_from_zip "$IMPORT_ZIP_PATH"
fi

if [[ ! -f "$KEY_PATH" ]]; then
  ssh-keygen -t ed25519 -N "" -C "$EMAIL signing key" -f "$KEY_PATH" >/dev/null
  echo "Generated signing key: $KEY_PATH"
else
  echo "Signing key already exists: $KEY_PATH"
fi
```

بعد التحقق من أن المفتاح الخاص قابل للاستخدام (`ssh-keygen -Y sign …`)، يكتب السكريبت ملف `allowed_signers` صغيرًا يحتوي على المفتاح العام ويضبط إعدادات Git المحلية:

```bash
git -C "$REPO_DIR" config --local gpg.format ssh
git -C "$REPO_DIR" config --local user.signingkey "$RUNTIME_KEY_PATH"
git -C "$REPO_DIR" config --local gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS"
git -C "$REPO_DIR" config --local commit.gpgsign true
git -C "$REPO_DIR" config --local tag.gpgSign true
```

إذا طلبت إعادة كتابة التاريخ باستخدام `--resign-all`، يبني السكريبت أمر `git filter-branch` الذي يعيد توقيع الـ commits المؤهلة بـ `-S`. يحترم حالة الـ fork بتخطي الـ commits الموجودة بالفعل في `upstream` اختياريًا.

النتيجة النهائية تعرض المفتاح العام وتعليمات لإضافته في قسم **Signing Key** على GitHub، مع وصفة اختبار صغيرة.

## لماذا توقع commitsك؟

هذه هي اللحظة التي أعترف فيها أنني لم أكن بحاجة لذلك. مستودعاتي لا تتطلب أي إثبات مصدر لما أنشره، ولا أستخدم الوسوم الموقعة للإصدارات. «السبب» هو:

- لأنني استطعت،
- لأنها تبدو جيدة (هل رأيت الشارة؟)،
- لأنها أعطتني عذرًا لأجرب `git filter-branch` وshell،
- ولأنها مجرد «لقد بنيت هذا بنفسي» أخرى للمدونة.

باختصار، كان فقط للتباهي، لكن هذا هو الجميل عندما تعدّل أدواتك الخاصة.

## أمثلة الاستخدام

```bash
# إعداد أولي في المستودع الحالي
chmod +x ./setup-ssh-signing.sh
./setup-ssh-signing.sh --name "Your Name" \
                       --email "you@example.com"

# تصدير المفاتيح لجهاز آخر
./setup-ssh-signing.sh --export-keys ./my-signing-keys.zip

# استيراد المفاتيح على جهاز ثانٍ
./setup-ssh-signing.sh --import-keys ./my-signing-keys.zip --repo ./my-repo \
                       --name "Your Name" --email "you@example.com"

# إعادة كتابة التاريخ والدفع
./setup-ssh-signing.sh --repo ./my-repo --name "Your Name" --email "you@example.com" \
                       --resign-all --autostash --autopush --yes
```

## أفكار أخيرة

هذا السكريبت أداة صغيرة، لكنها تحتوي على بعض الأفكار الجميلة:

- الاحتفاظ بالمفاتيح المشفرة محليًا ولكل مستودع،
- عدم لمس الإعدادات العامة أبدًا إلا إذا طلبت ذلك،
- توفير استيراد/تصدير بسيط وإعادة كتابة التاريخ،
- وتوثيق العملية بأكملها في مقال مدونة، لأنه لم لا.

إذا راودتك الرغبة في إضافة توقيعات إلى commitsك الخاصة، جربه! وإذا كنت هنا فقط من أجل الشكل، نفس الشيء. 😎
