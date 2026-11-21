---
title: "Repo to VPS : تحويل GitHub Actions إلى VPS مجاني مع تخزين دائم"
description: كيف تحوّل runner في GitHub Actions إلى VPS دائم مع git كمخزن دائم، tmate وinotify وcommit --amend.
date: 2026-05-29
tags:
  - github
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "rMyWpVDH3hDiCpAK2sA8BulDn0s+EliQgHWQ0ZHI/nUz32q7npkvOH1xOenBjDw8fRaOUQXX5xqvt5UDFYja2A=="
---

## تمنحك GitHub VPS مجانيا لـ6h. وجدت كيف أجعله دائما.

تمنحك GitHub Actions آلات Linux مجانية.

يعني، خوادم Ubuntu حقيقية. نواتان و7 Go ذاكرة و14 Go قرص. مجانا. لـ6h لكل تشغيل.

"المشكلة" الوحيدة : في نهاية التشغيل، يُمحَى كل شيء. الآلة قابلة للرمي. تثبت حزما وتبرمج وتضبط... وفجأة، في النهاية يختفي كل شيء. كأنك لم تفعل شيئا.

إلا إذا.

إلا إذا استخدمت **git كقرص صلب**.

وهناك، فجأة، لديك VPS مجاني مع قرص دائم ينجو من التشغيلات. تعيد الاتصال، وكل شيء ما زال هناك. تستأنف حيث توقفت.

إنه معطوب تماما. دعني أشرح لك.

---

## السياق : runners الخاصة بـGitHub Actions

عندما تطلق workflow في GitHub Actions، تمنحك GitHub آلة VM.

إنها مصممة لبناء كودك وتشغيل اختباراتك والنشر. يعمل workflow ويؤدي عمله، وتُدمَّر الآلة.

لكن لا شيء يمنعك من فعل شيء آخر بهذه VM. مثلا، فتح shell عبر SSH عليها واستخدامها كخادم.

القيد أن هذه الآلات **عديمة الحالة** و**مؤقتة** :
- مؤقتة : 6h حدا لكل تشغيل (`timeout-minutes: 360`، سقف GitHub)
- عديمة الحالة : يُمحَى كل شيء في النهاية

إذن لجعلها VPS قابلة للاستخدام، يجب حل مشكلتين :
1. **كيف تتصل عليها في الوقت الحقيقي ؟**
2. **كيف تحفظ القرص بين تشغيلين ؟**

هنا يصبح hack قذرا.

---

## المشكلة 1 : SSH المباشر مع tmate

**tmate** تفرع من tmux ينشئ جلسة SSH قابلة للمشاركة.

تشغّله على آلة، فيولد لك رابطين :
- رابط SSH (`ssh xxx@nyc1.tmate.io`)
- رابط ويب (طرفية في المتصفح)

تتصل بأحد هذين الرابطين، وبوم، أنت في shell على الآلة. في الوقت الحقيقي.

إذن يطلق workflow برنامج tmate :

```bash
tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
tmate -S /tmp/tmate.sock set-option -g remain-on-exit on

# استرجاع روابط الاتصال
tmate_ssh=$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')
tmate_web=$(tmate -S /tmp/tmate.sock display -p '#{tmate_web}')
```

وتُكتَب هذه الروابط مباشرة في README الخاص بالمستودع بواسطة سكربت Python. تفتح مستودعك، وترى رابط الاتصال، وتنقر. ها أنت في VPS خاصتك.

حُلّت المشكلة الأولى. لكن الثانية هي المجنونة فعلا.

---

## المشكلة 2 : git كقرص صلب

إليكم الفكرة التي تغيّر كل شيء.

الآلة تُمحَى مع كل تشغيل. إذن نخزن **نظام الملفات في فرع git مخصص**، اسمه `filesystem`.

عند الإقلاع، يستعيد السكربت الحالة من هذا الفرع :

```bash
filesystem_branch="filesystem"

# استرجاع فرع filesystem من البعيد
git fetch origin "$filesystem_branch":refs/remotes/origin/$filesystem_branch

# استعادة مساحة العمل من هذا الفرع
git checkout -B filesystem-workspace "refs/remotes/origin/$filesystem_branch"
git reset --hard "refs/remotes/origin/$filesystem_branch"
```

فرع `filesystem` هو قرصك الصلب. ملفاتك وتثبيتاتك وإعداداتك، كل شيء فيه.

ترى الفكرة ؟ الآلة قابلة للرمي، لكن القرص يعيش في git. تعيد إطلاق workflow، فيُستعاد القرص، وتستأنف بالضبط حيث كنت.

كأن VPS في سبات. إلا أن السبات مستودع git

### الإطلاق الأول : إنشاء القرص الفارغ

في أول تشغيل، لا يوجد فرع `filesystem` بعد. يجب إنشاؤه. وليس ذلك عاديا :

```bash
ensure_filesystem_branch() {
  if ! git ls-remote --exit-code origin "refs/heads/$filesystem_branch" >/dev/null 2>&1; then
    git checkout --orphan filesystem-workspace
    git rm -rf --cached .
    git clean -fdx -e .git -e .github -e .github/scripts -e .github/workflows
    git commit --allow-empty -m "init filesystem (empty)"
    push_filesystem
  fi
}
```

`git checkout --orphan` هو المفتاح. فرع يتيم هو فرع **دون أي سجل**، كأنك تنطلق من مستودع فارغ.

لماذا يتيما ؟ لأنك لا تريد لقرصك الدائم أن يجر كل سجل كودك المصدري. يبقى القرص معزولا، بحياة خاصة. يبدأ عذراء.

و`git ls-remote --exit-code` في البداية مجرد فحص نظيف : "هل يوجد الفرع فعلا على البعيد ؟". إذا نعم، لا نلمس شيئا. وإذا لا، ننشئه. Idempotent، كما نحب.

### git clean الانتقائي : حماية الكاشات

يستحق هذا السطر التوقف عنده :

```bash
git clean -fdx -e .apt-cache -e .cache -e host.conf -e tmate.sock
```

يزيل `git clean -fdx` كل ما لا يتعقبه git. عادة عنيف، ينظف مساحة العمل بعمق.

لكن `-e` (استثناء) تحمي بعض الملفات :
- `.apt-cache` ← كاش حزم APT (سنعود له، إنه ذكي)
- `.cache` ← كاش عام
- `host.conf` ← عنوان SSH للجلسة
- `tmate.sock` ← مقبس جلسة tmate الجارية

لو نظفت تلك الملفات، كسرت الجلسة النشطة أو فقدت كاشك. إذن نستثنيها أثناء إعادة الضبط.

تفصيل غبي لأول وهلة، لكن دونه ينكسر كل شيء.

---

## الحفظ التلقائي : inotify يراقب كل شيء

حسنا، لكن كيف تصل الملفات إلى فرع `filesystem` ؟

الجواب : مراقب يراقب كل تغيرات الملفات ويُدخل/يدفع تلقائيا.

الأداة السحرية هي **inotifywait** (من حزمة `inotify-tools`). يراقب نظام الملفات في مستوى النواة ويُحفَّز بمجرد تغير ملف.

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock|\.gitignore|\.txt\.swp)(/|$)' .; do
    echo "[autosave] change detected"
    commit_and_push
    sleep 1   # debounce إذا تغيرات كثيرة دفعة واحدة
  done
}

autosave &
```

لنفكك أعلام inotify، لأن كل واحد يهم :
- `-r` ← تكراري، يراقب كل المجلدات الفرعية
- `-e modify,create,delete,move` ← يتفاعل مع هذه الأنواع الأربعة من الأحداث
- `--exclude '...'` ← تعبير نمطي لتجاهل بعض الملفات

`--exclude` حاسم. انظر ما يتجاهله :
- `.git` ← بديهي، وإلا حفّز كل commit حفظا تلقائيا يحفّز commit... حلقة لانهائية. كارثة.
- `.apt-cache` و`.cache` ← الكاشات، التي تتغير طوال الوقت ولا نريد إغراق git بها
- `host.conf` و`tmate.sock` ← ملفا الجلسة، اللذان يتحركان بلا توقف
- `.gitignore` و`.txt.swp` ← الملفات المؤقتة (ملفات `.swp` هي ملفات تحرير vim)

دون هذا الاستثناء، انتهيت بحفظ تلقائي يُحفَّز في حلقة على تغيراته الخاصة. وجود `.git` في القائمة هو السطر الذي يمنعك من إطلاق النار على قدمك.

تعدل ملفا ؟ يكشفه inotify فورا، فيُدخِل ويدفع. في أقل من ثانية، تغييرك في فرع `filesystem`.

تثبت حزمة وتكتب كودا وتلمس إعدادا، كل شيء يُحفَظ في الوقت الحقيقي، تلقائيا، دون أن تفعل شيئا.

لديك حرفيا نظام حفظ تلقائي للقرص كله. معطوب.

### debounce : عدم إغراق git

`sleep 1` بعد كل حفظ هو **debounce**.

عندما تحفظ ملفا في محرر، غالبا يولد ذلك عدة أحداث نظام ملفات دفعة (إنشاء ملف مؤقت وإعادة تسمية وحذف القديم...). دون debounce، حفّزت 3-4 commits لحفظ واحد.

يقول `sleep 1` : "انتظر ثانية بعد حفظ، حتى تهدأ الدفعة، قبل إعادة الاستماع". وهذا يجمّع التغيرات القريبة في commit واحد. ذكي.

### وحفظ دوري زيادة

تحسبا لفوات inotify حدثا، هناك أيضا حفظ كل 5 ثوانٍ :

```bash
periodic_save() {
  while true; do
    sync_from_remote   # يسترجع التغيرات البعيدة المحتملة
    sleep 5
    commit_and_push
  done
}

periodic_save &
```

حزام وحمالات. لا نريد خاصة فقدان حالة القرص.

---

## التفصيل الذكي : commit واحد

إذا أدخلت مع كل تغير ملف، ستتراكم آلاف commits. في ساعة جلسة، ينفجر سجلك. يصبح المستودع ضخما. إنه قبيح.

الحل أنيق : **نعدّل commit الموجود** بدلا من إنشاء جديد.

```bash
commit_and_push() {
  (
    flock -n 200 || return   # قفل لكي لا تعمل حفظتان في آن واحد

    git add -A
    git reset -- .github/workflows/ .github/scripts/   # لا تلمس السكربتات

    if ! git diff --cached --quiet; then
      if git rev-parse --verify HEAD >/dev/null 2>&1; then
        git commit --amend --no-edit    # تعديل : يمحو commit السابق
      else
        git commit -m "autosave $(date -u +%Y%m%dT%H%M%SZ)"
      fi
      git push --force origin "filesystem-workspace:filesystem"
    fi
  ) 200>/tmp/tmate_autosave.lock
}
```

يعني `git commit --amend` : "استبدل آخر commit بهذا".

إذن لدى فرع `filesystem` دائما commit واحد. مهما حفظت. إنه فقط لقطة الحالة الراهنة، تُدفَع بالإجبار مرارا وتكرارا.

`flock` قفل : وبما أن هناك حلقتي حفظ (inotify + دوري)، يجب تجنب إطلاقهما git في آن واحد والتداخل. عملية git واحدة في كل مرة.

نظيف.

---

## sync_from_remote : إدارة جلسات متعددة

حسنا، حالة لا تفكر فيها في البداية : وماذا لو أطلقت تشغيلين في آن واحد ؟ أو عدّلت جلسة فرع `filesystem` بينما أخرى تعمل ؟

يدير السكربت ذلك مع `sync_from_remote` قبل كل commit :

```bash
sync_from_remote() {
  git fetch origin "filesystem":refs/remotes/origin/filesystem
  git merge --ff-only "refs/remotes/origin/filesystem"
}
```

`--ff-only` (تقديم سريع فقط) مهم : يعني "ادمج فقط إذا أمكن التقدم نظيفا، دون إنشاء commit دمج".

إذا تباعد الفرعان (مثلا، عدّلت جلستان ملفات مختلفة)، يفشل التقديم السريع بصمت (`2>/dev/null || true`) ونحتفظ بالحالة المحلية. ليس نظام دمج مثاليا، لكنه يتجنب الفساد في الحالة البسيطة حيث تعمل جلسة واحدة.

بصراحة، لا يجب إطلاق 3 جلسات بالتوازي على نفس المستودع. لكن الكود يحاول مع ذلك ألا ينفجر إذا حدث. إنه دفاع.

---

## كاش APT : تثبيت سريع

هناك تفصيل في workflow لا يبدو شيئا لكنه مدروس جيدا :

```yaml
- name: Cache & install APT packages (tmate + watcher)
  uses: awalsh128/cache-apt-pkgs-action@v1.6.0
  with:
    packages: tmate inotify-tools
```

تُثبَّت tmate وinotify-tools عبر action **يخزّن حزم APT مؤقتا**.

في أول تشغيل، ينزّل ويثبّت. وفي التشغيلات التالية، يُستعاد من كاش GitHub Actions، أسرع، دون حاجة لإعادة التنزيل.

وتتذكر `git clean -fdx -e .apt-cache` من قبل ؟ إنه مرتبط. مجلد `.apt-cache` محمي من التنظيف ليتمكن ما تثبته أثناء جلستك من الثبات حدا أدنى.

كل شيء متماسك. فكرت في دورة الحياة كاملة.

---

## السكربتات المخبأة في /tmp

تفصيل خبيث آخر لكن ذكي. في بداية السكربت تماما :

```bash
RUNNER_SCRIPTS_DIR="/tmp/runner-scripts"
rm -rf "$RUNNER_SCRIPTS_DIR"
mkdir -p "$RUNNER_SCRIPTS_DIR"
cp -r .github/scripts "$RUNNER_SCRIPTS_DIR/"
```

تُنسَخ السكربتات (`update_readme.py`، إلخ) إلى `/tmp` قبل لمس فرع `filesystem`.

لماذا ؟ لأنه عندما تنفذ `git reset --hard` نحو فرع `filesystem` (الفارغ في البداية، أو الذي يحوي قرصك)، تختفي ملفات `.github/scripts` الخاصة بالمستودع المصدري من مساحة العمل.

لكن السكربت ما زال يحتاجها أثناء الجلسة (لتحديث README مع كل إعادة إطلاق لـtmate). إذن يخبئها في `/tmp`، بعيدا عن متناول git :

```bash
python3 "$RUNNER_SCRIPTS_DIR/scripts/update_readme.py" --ssh "$tmate_ssh" ...
```

إذا لم تفكر في ذلك، تقضي 30 دقيقة لتفهم لماذا اختفى سكربتك. فكرت في ذلك.

---

## shell المصمم

راحة صغيرة : تمنحك الجلسة shell مُعدَّلا، لا bash عاريا.

ينسخ `prestart.sh` ملف `.bashrc` مخصصا :

```bash
if ! grep -q "Custom prompt and aliases for remote sessions" "$HOME/.bashrc"; then
  cp .github/scripts/remote_bashrc "$HOME/.bashrc"
fi
sudo cp "$HOME/.bashrc" /root/.bashrc
```

ويحوي `.bashrc` هذا prompt ملونا وأسماء مستعارة (`ll` و`lla` و`rm -i`)، وقبل كل شيء تجاوزا لـ`exit` :

```bash
exit() {
    killall -9 -u "$(whoami)" tmate 2>/dev/null || true
    builtin exit "$@"
}

# Ctrl+D يفعل مثل exit
bind -x '"\C-d": "exit"'
```

عندما تكتب `exit` (أو Ctrl+D)، يقتل نظيفا عمليات tmate قبل الإغلاق. وهذا يتجنب ترك جلسات tmate زومبي.

وهناك أيضا دالة `tmate-detach` إذا أردت قطع الاتصال دون قتل الجلسة (لإعادة الاتصال لاحقا). تفصيل راحة، لكنه يظهر مستوى العناية.

---

## tmate الذي يعيد إطلاق نفسه

راحة صغيرة : إذا كتبت `exit` في shell خاصتك، عادة تموت جلسة tmate وتُقطَع نهائيا.

إلا أن tmate هنا في حلقة `while true` :

```bash
while true; do
  tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
  while tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' >/dev/null 2>&1; do
    sleep 2
  done
  echo "tmate session ended; restarting..."
done
```

تنفذ `exit` ؟ تعيد الجلسة التشغيل وحدها. تعيد الاتصال بنفس الرابط.

إنه غبي، لكنه يجعل الجلسة قابلة للاستخدام.

---

## إعادة الاتصال بأمر واحد

كيف تعيد الاتصال بعد قطع، دون التنقيب في سجلات التشغيل كل مرة ؟

يُكتَب عنوان SSH الخاص بـtmate في ملف `host.conf`، مُدخَل في فرع `filesystem` :

```bash
printf '%s' "${tmate_ssh#ssh }" > host.conf
```

وبما أن هذا الملف في git، تستطيع استرجاعه عبر GitHub API بأمر واحد :

```bash
ssh "$(gh api -H 'Accept: application/vnd.github.v3.raw' \
  "/repos/USER/REPO/contents/host.conf?ref=filesystem" | tr -d '\r\n')"
```

تطلق ذلك، فيجلب عنوان SSH الحالي من المستودع، ويتصل بك. حتى لو تغير العنوان بين جلستين.

---

## التدفق الكامل

لنلخص :

1. تحفّز workflow (دفع أو زر يدوي)
2. تمنحك GitHub آلة VM بنظام Ubuntu
3. يستعيد السكربت القرص من فرع "filesystem"
4. يبدأ inotify مراقبة كل التغيرات
5. يحفظ periodic_save كل 5s كنسخة احتياطية
6. ينطلق tmate ← يولد روابط SSH/ويب
7. تُكتَب الروابط في README + host.conf
8. تتصل عبر ssh أو الطرفية الويب
9. تفعل ما تريد، كل تغير ملف = حفظ تلقائي
10. بعد 6h، تقتل GitHub الآلة VM
11. قرصك سليم في فرع "filesystem"
12. تعيد إطلاق workflow ← عودة للخطوة 3، وكل شيء ما زال هناك

VPS مجاني مع قرص دائم. فقط مع git وGitHub Actions.

---

## حسنا، لنكن صادقين : الحدود

إنه hack، لا VPS حقيقي. إذن :

- **6h حدا لكل تشغيل.** يجب إعادة إطلاق workflow بانتظام. Uptime محدود لكل تشغيل.
- **مخصص للتطوير والاستكشاف.** لن تستضيف موقعك عليه. إنه للاستكشاف والتطوير والتصحيح واختبار بيئة Linux قابلة للرمي لكن قابلة للاستعادة.
- **ترى GitHub كل شيء.** إنها آلاتها. لا تضع شيئا حساسا.
- **اجعل المستودع خاصا.** تعرض shell عبر SSH. مستودع عام = يمكن لأي كان الاتصال به احتمالا. فكرة سيئة.
- **إنه على حد شروط الاستخدام.** GitHub Actions مصمم لـCI/CD، لا لـVPS مجاني. إذن استخدمه باعتدال، ولشيء مشروع، دون إساءة.

### العقبة الحقيقية : git يكره الملفات الكبيرة

صُمِّم git للنص، لا لنظام ملفات.

يعيش القرص الدائم في فرع git. إذن كل ما تحفظه يمر عبر git. وgit :
- يدير سيئا الملفات الثنائية الكبيرة (صورة Docker من 2 Go في git ؟ انسَ)
- له حد 100 Mo لكل ملف على GitHub (حد صلب، لا يدفع بعده)
- يوصي بالبقاء تحت ~5 Go لكل مستودع

إذن إذا نفذت `npm install` لمشروع مع 500 Mo من `node_modules`، أو بنيت مشروعا يولد ثنائيات ثقيلة، فالدفع نحو `filesystem` سيعمل ببطء شديد أو سيفشل تماما.

يساعد `git commit --amend` (commit واحد، دون سجل ينتفخ)، لكنه لا يغيّر أن ملفا من 200 Mo لن يمر أبدا.

باختصار : **يعمل رائعا للكود والإعدادات والملفات الصغيرة. ولا يعمل لتخزين بيانات ضخمة أو منتجات ثنائية.** يجب إبقاء ذلك في الذهن لما تفعله في جلستك.

### ليس لقطة نظام كاملة

فارق مهم آخر : يحفظ فرع `filesystem` **مساحة العمل** (مجلد المستودع)، لا النظام كله.

إذا نفذت `apt install htop`، يذهب الثنائي إلى `/usr/bin/htop`، وهو خارج مساحة العمل. إذن لن يُحفَظ. في التشغيل التالي، يجب إعادة تثبيته.

لهذا لدينا كاش APT و`prestart.sh` : لإعادة تجهيز بيئة النظام مع كل إقلاع، بما أن مساحة العمل وحدها تدوم.

إذا أردت أن تنجو تثبيتاتك، يجب وضعها في مساحة العمل (مثلا، التثبيت في مجلد محلي بدلا من النظام). إنها رياضة يجب دمجها.

---

## VPS مجاني ضد VPS حقيقي : المباراة

| | repo-to-vps | VPS حقيقي (5€/شهر) |
|---|---|---|
| **السعر** | 0€ | ~5-10€/شهر |
| **Uptime** | 6h، يُعاد إطلاقه | 24/7 |
| **القرص** | فرع git، ملفات صغيرة | SSD حقيقي، عدة Go |
| **RAM** | ~7 Go (سخية !) | 1-2 Go غالبا |
| **CPU** | 2-4 أنوية صحيحة | 1-2 vCPU |
| **الإعداد** | استنساخ قالب | إعداد يدوي |
| **الثبات** | مساحة عمل فقط | نظام كامل |
| **الشرعية** | على حد شروط الاستخدام | نظيف 100% |

النقطة المثيرة أن المواصفات الخام جهة (RAM وCPU)، runner الخاص بـGitHub أفضل غالبا من VPS بـ5€. لكن uptime الـ6h والثبات المحدود بمساحة العمل هو ما يجعله لعبة هاكر، لا خادما حقيقيا.

للتعلم والاختبار وتصحيح نظام Linux سريعا في بيئة قابلة للاستعادة ؟ مثالي. لاستضافة أي شيء جدي ؟ خذ VPS حقيقي.

لكن لبيئة Linux مؤقتة تستطيع استعادتها متى شئت ؟ إنه رائع فقط.

---

## النمط خلف كل ذلك

إذا تراجعت، يرتكز repo-to-vps وبوت البريد (مقالي الآخر) على نفس الفكرة :

> **ليس git مدير إصدارات فقط. إنه نظام تخزين دائم ومجاني ومُصدَر، وقابل للوصول عبر API.**

بمجرد أن يكون لديك نظام عديم الحالة (GitHub Actions أو Worker أو دالة serverless) وتريد الاحتفاظ بحالة بين تنفيذين، يمكن أن يعمل git "قرصا".

- يخزن بوت البريد `lastId` في وسم git.
- يخزن repo-to-vps نظام ملفات كاملا في فرع git.

نفس النمط، ومقياسان. قيمة من جهة، وقرص من جهة.

وتقنية `git commit --amend` + الدفع بالإجبار هي التقنية المشتركة : **تحتفظ بـcommit واحد يمثل الحالة الراهنة، يُمحَى مع كل تحديث.**

ليس مصمما لذلك. لكنه يعمل. وهو مجاني.

---

**النقاط الثلاث للتذكر :**

1. **فرع git = قرص صلب دائم**، خزّن نظام ملفاتك في فرع مخصص، واستعده عند الإقلاع، ولديك حالة تنجو من الآلات القابلة للرمي.

2. **inotify + git = حفظ تلقائي في الوقت الحقيقي**، يراقب `inotifywait` التغيرات في مستوى النواة ويدفع نحو git فورا. مع `git commit --amend` للاحتفاظ بـcommit واحد نظيف.

3. **يحوّل tmate runner إلى VPS**، SSH مباشر على آلة GitHub Actions، مع إعادة تشغيل آلية وإعادة اتصال بأمر واحد عبر GitHub API.

git كقرص صلب، الحلقة الثانية. أظن أنني سأنتهي بتخزين كل شيء في فروع git
