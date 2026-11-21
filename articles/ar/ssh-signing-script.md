---
title: سكربت التوقيع SSH مشروح
description: تشريح مساعد توقيع commits بـSSH ولماذا أردت commits أنيقة.
date: 2026-03-08
aiGenerated: true
tags:
  - git
  - security
  - shell
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "Be4D3ODiyC0hCCVMfu8MYPfHzFk5WkorIQr/GIlZeTV72/dyDXsd8O1Ii3LGjnLt2iKKlQhDoFhJKARkmknWHw=="
---

# سكربت التوقيع SSH للـcommits، شرح

يشرّح هذا المقال سكربت `setup-ssh-signing.sh` الذي نشرته على [Gist](https://gist.github.com/fox3000foxy/95500d129cd4bf5c173c323d2492569a). سنرى ماذا يفعل كل جزء، وكيف يجعل توقيع SSH المحلي لمستودع عديم الألم تماما، ونعم، لماذا تحملت عناء كتابته (تشويق : أردت فقط أن تكون commits خاصتي لها **مظهر**).

## الدافع

لطالما أحببت العبث بسير عمل Git، وبعد رؤية أناس مع شارات «Verified» الصغيرة بجانب commits خاصتهم، قلت : لماذا لا أنا ؟ توقيع GPG المدمج ثقيل وشامل، فانتهيت بكتابة مساعد صغير :

- ينشئ مفتاح SSH مخصصا للتوقيع،
- يضبط المستودع الحالي فقط،
- يعيد كتابة السجل ربما لتوقيع commits القديمة،
- ويسمح بنقل المفتاح بين الآلات.

بصراحة، كان الاحتياج غرورا أساسا. مشاريعي الشخصية لا تفرض أي شرط توقيع، لكن رؤية شارة خضراء «Verified» على commit لها أثرها الصغير، وكتابة هذا السكربت في shell أسعدتني فعلا.

> حسنا، توقيع commits خاصتك يشبه ارتداء سترة جلدية لمراجعة كود، عديم الفائدة تماما، لكنه يعطيك انطباع أنك هاكر.

## ماذا يفعل السكربت

السكربت ملف Bash واحد مع `set -euo pipefail` في الأعلى لقطع التنفيذ من أول خطأ. إليكم ملخص ما يفعله :

1. **توليد أو استيراد مفتاح توقيع**
   تنزل المفاتيح في `.git-signing/` في المجلد الذي تشغّل منه السكربت.
2. **ضبط Git محليا**
   يضع `gpg.format=ssh` و`user.signingkey` و`commit.gpgsign=true` و`tag.gpgSign=true` و`allowedSignersFile` يشير للمفتاح العام.
3. **إدارة المفاتيح بين الآلات**
   بفضل `--export-keys` / `--import-keys`، تستطيع نقل مفتاحك الخاص من حاسوب لآخر دون لمس الإعداد العام.
4. **إعادة كتابة سجل اختيارية** (`--resign-all`)
   تعيد كتابة كل commits لكل الفروع/الوسوم (أو فقط ما ليس في `upstream` للـforks) وتعيد توقيعها مع `-S`، دون لمس الكتّاب الآخرين.
5. **أعلام خدماتية**
   `--autostash` و`--autopush` و`--commit-date` و`--yes` للوضع غير التفاعلي، إلخ.
6. **كشف fork وفحوص أمان**
   يكشف remote الـ`upstream`، ويحذر قبل إعادة كتابة السجل، ويتحقق من الأدوات المطلوبة (`git` و`ssh-keygen` و`zip/unzip`)، ويتأكد من الأذونات الصحيحة، وينشئ حتى نسخة آمنة من المفتاح إذا كانت أذونات نظام الملفات متساهلة أكثر من اللازم.

السكربت idempotent : تشغيله مرتين لا يعيد توليد مفتاحك ولا يمحو الإعداد الموجود.

## التسلسل خطوة بخطوة

إليكم بعض المقتطفات الأساسية من الكود مع شرحها.

```bash
#!/usr/bin/env bash
set -euo pipefail

# تهيئة توقيع commits بـSSH بطريقة مضبوطة ومحلية للمستودع.
# - تُنشأ ملفات المفاتيح في المجلد الذي يُطلَق منه هذا السكربت.
# - تُكتَب إعدادات Git محليا للمستودع الحالي فقط.
```

يضع الترويس الأمان ويوثق الهدف. القطعة التالية تحلل خيارات CLI (`--name` و`--email` و`--repo`، إلخ) بحلقة `while [[ $# -gt 0 ]]; do case … esac done`. حقول الهوية الإلزامية تُتحقَّق لاحقا :

```bash
if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "خطأ : هوية ناقصة. مرر --name و--email." >&2
  exit 1
fi
```

يحدث توليد المفتاح في `$LAUNCH_DIR/.git-signing`. إذا وُجد مفتاح فعلا، يحتفظ به السكربت كما هو ؛ و`--import-keys` يسمح بملء المجلد من ZIP.

```bash
mkdir -p "$KEY_DIR"

if [[ -n "$IMPORT_ZIP_PATH" ]]; then
  import_keys_from_zip "$IMPORT_ZIP_PATH"
fi

if [[ ! -f "$KEY_PATH" ]]; then
  ssh-keygen -t ed25519 -N "" -C "$EMAIL signing key" -f "$KEY_PATH" >/dev/null
  echo "مفتاح توقيع مولّد : $KEY_PATH"
else
  echo "مفتاح توقيع موجود فعلا : $KEY_PATH"
fi
```

بعد التحقق من أن المفتاح الخاص قابل للاستخدام (`ssh-keygen -Y sign …`)، يكتب السكربت ملف `allowed_signers` يحوي المفتاح العام ويضع إعداد Git المحلي :

```bash
git -C "$REPO_DIR" config --local gpg.format ssh
git -C "$REPO_DIR" config --local user.signingkey "$RUNTIME_KEY_PATH"
git -C "$REPO_DIR" config --local gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS"
git -C "$REPO_DIR" config --local commit.gpgsign true
git -C "$REPO_DIR" config --local tag.gpgSign true
```

إذا طلبت إعادة كتابة السجل مع `--resign-all`، يبني السكربت أمر `git filter-branch` يعيد توقيع commits المؤهلة مع `-S`. يحترم حالة fork بتخطي اختياريا commits الموجودة فعلا في `upstream`.

تعرض النتيجة النهائية المفتاح العام وتعليمات إضافته في قسم **Signing Key** في GitHub، مع وصفة اختبار.

## لماذا توقّع commits خاصتك ؟

هنا أعترف أنني لم أكن أحتاجه. مستودعاتي لا تشترط أي مصدر لما أنشره، ولا أستخدم الوسوم الموقعة للإصدارات. "لماذا" هي :

- لأنني استطعت،
- لأنه يبدو جيدا (رأيت الشارة ؟)،
- لأنه أعطاني ذريعة للتجريب مع `git filter-branch` والـshell،
- ولأنه "بنيت هذا بنفسي" إضافي للمدونة.

باختصار، كان فقط للتباهي، لكن هذا ما أحبه عندما أعبث بأدواتي.

## أمثلة استخدام

```bash
# إعداد أولي في المستودع الحالي
chmod +x ./setup-ssh-signing.sh
./setup-ssh-signing.sh --name "Your Name" \
                       --email "you@example.com"

# تصدير المفاتيح لآلة أخرى
./setup-ssh-signing.sh --export-keys ./my-signing-keys.zip

# استيراد المفاتيح على آلة ثانية
./setup-ssh-signing.sh --import-keys ./my-signing-keys.zip --repo ./my-repo \
                       --name "Your Name" --email "you@example.com"

# إعادة كتابة السجل والدفع
./setup-ssh-signing.sh --repo ./my-repo --name "Your Name" --email "you@example.com" \
                       --resign-all --autostash --autopush --yes
```

## تأملات أخيرة

يبقى هذا السكربت أداة مدمجة، لكنه يحمل بعض المبادئ التي أتبناها :

- إبقاء المفاتيح التشفيرية محلية ولكل مستودع،
- عدم لمس الإعداد العام أبدا إلا إذا طلبت،
- توفير استيراد/تصدير بسيط وإعادة كتابة سجل،
- وتوثيق العملية كلها في مقال مدونة للاحتفاظ بأثر قابل لإعادة الاستخدام.

إذا راودتك الرغبة في إضافة توقيعات لـcommits الخاصة بك، جرّبه ! وإذا كنت هنا فقط للأناقة، نفس الشيء. 😎
