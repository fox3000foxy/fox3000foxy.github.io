---
title: "Repo to VPS : تحويل GitHub Actions إلى VPS مجاني مع تخزين دائم"
description: كيفية تحويل مشغل GitHub Actions إلى VPS دائم باستخدام git كتخزين دائم -- tmate و inotify و commit --amend.
date: 2026-05-29
authors:
  - fox3000foxy
tags:
  - github
  - devops
  - automation
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "RzVufeQ7zky70nNDOX5+JgL/RmTHeioY3nto3ziLUx3oq4K61P6gPE+Qd5DeB7GKJ6snJdNR08oQkB5CX8maVQ=="
---

## GitHub يعطيك VPS مجاني لمدة 6 ساعات. لقد وجدت كيف أجعله دائماً.

GitHub Actions يعطيك أجهزة Linux مجانية.

أعني، خوادم Ubuntu حقيقية. 2 نواة، 7 جيجا رام، 14 جيجا قرص. مجاني. لمدة 6 ساعات لكل تشغيلة.

"المشكلة" الوحيدة: في نهاية التشغيلة، يُمسح كل شيء. الجهاز قابل للرمي. تثبّت أشياء، تكتب كوداً، تهيئ... وفجأة، في النهاية يختفي كل شيء. وكأنك لم تفعل شيئاً.

إلا إذا.

إلا إذا استخدمت **git كقرص صلب**.

وهنا، فجأة، تحصل على VPS مجاني بقرص دائم ينجو من التشغيلات. تتصل مرة أخرى، كل شيء لا يزال موجوداً. تستأنف من حيث توقفت.

هذا مكسور تماماً. دعني أشرح لك xD

---

## السياق: مشغلات GitHub Actions

عندما تشغل سير عمل GitHub Actions، يعطيك GitHub جهاز VM.

هذا مصمم لبناء كودك، تشغيل اختباراتك، النشر. سير العمل يعمل، يؤدي مهمته، ثم يُدمر الجهاز.

لكن لا شيء يمنعك من فعل شيء آخر بهذا الـ VM. مثلاً، فتح شيل SSH عليه واستخدامه كخادم.

الفكرة هي أن هذه الأجهزة **عديمة الحالة** و **مؤقتة**:
- مؤقتة: 6 ساعات كحد أقصى لكل تشغيلة (`timeout-minutes: 360`، سقف GitHub)
- عديمة الحالة: كل شيء يُمحى في النهاية

إذاً لجعلها VPS قابل للاستخدام، يجب حل مشكلتين:
1. **كيف نتصل بها في الوقت الفعلي؟**
2. **كيف نحتفظ بالقرص بين تشغيلتين؟**

هنا يصبح الأمر اختراقاً قذراً.

---

## المشكلة 1: SSH المباشر مع tmate

**tmate** هو fork من tmux ينشئ جلسة SSH قابلة للمشاركة.

تشغّله على جهاز، فيولّد لك رابطين:
- رابط SSH (`ssh xxx@nyc1.tmate.io`)
- رابط ويب (طرفية في المتصفح)

تتصل بأحد هذين الرابطين، وفجأة، أنت في شيل على الجهاز. في الوقت الفعلي.

سير العمل يشغّل tmate:

```bash
tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
tmate -S /tmp/tmate.sock set-option -g remain-on-exit on

# récupère les liens de connexion
tmate_ssh=$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')
tmate_web=$(tmate -S /tmp/tmate.sock display -p '#{tmate_web}')
```

وهذه الروابط تُكتب مباشرة في README المستودع بواسطة سكريبت Python. تفتح مستودعك، ترى رابط الاتصال، تضغط. ها أنت في VPS الخاص بك.

المشكلة الأولى حُلّت. لكن الثانية هي المجنونة حقاً.

---

## المشكلة 2: git كقرص صلب

هذا هو الأمر المهول.

الجهاز يُمحى مع كل تشغيلة. لذلك نخزّن **نظام الملفات في فرع git مخصص**، يُسمى `filesystem`.

عند بدء التشغيل، السكريبت يستعيد الحالة من هذا الفرع:

```bash
filesystem_branch="filesystem"

# récupère la branche filesystem depuis le remote
git fetch origin "$filesystem_branch":refs/remotes/origin/$filesystem_branch

# restore le workspace depuis cette branche
git checkout -B filesystem-workspace "refs/remotes/origin/$filesystem_branch"
git reset --hard "refs/remotes/origin/$filesystem_branch"
```

فرع `filesystem` هو قرصك الصلب. ملفاتك، تثبيتاتك، إعداداتك -- كل شيء فيه.

هل ترى الفكرة؟ الجهاز قابل للرمي، لكن القرص يعيش في git. تعيد تشغيل سير العمل، يُستعاد القرص، تستأنف تماماً من حيث كنت.

هذا يشبه VPS في وضع السبات. الفرق أن السبات هو مستودع git xD

### التشغيل الأول: إنشاء القرص الفارغ

في أول تشغيلة، فرع `filesystem` غير موجود بعد. يجب إنشاؤه. وهذا ليس بسيطاً:

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

`git checkout --orphan` هو المفتاح. الفرع اليتيم هو فرع **بدون أي تاريخ** -- وكأنك تبدأ من مستودع فارغ.

لماذا يتيم؟ لأنك لا تريد أن يجرّ قرصك الدائم كل تاريخ كودك المصدر. القرص شيء منفصل، له حياته الخاصة. يبدأ فارغاً.

و `git ls-remote --exit-code` في البداية، هو مجرد فحص نظيف: "هل الفرع موجود بالفعل على الـ remote؟". إذا نعم، لا نلمس شيئاً. إذا لا، ننشئه. Idempotent، كما نحب.

### الـ git clean الانتقائي: حماية المخابئ

هذا السطر يستحق التوقف عنده:

```bash
git clean -fdx -e .apt-cache -e .cache -e host.conf -e tmate.sock
```

`git clean -fdx` يزيل كل ما ليس متتبعاً من قبل git. عادةً هذا عنيف -- ينظف workspace بالكامل.

لكن الـ `-e` (exclude) يحمي بعض الأشياء:
- `.apt-cache` → مخبأ حزم APT (سنعود إليه، إنه ذكي)
- `.cache` → مخبأ عام
- `host.conf` → عنوان SSH للجلسة
- `tmate.sock` → socket جلسة tmate الحالية

إذا نظّفت هذه الملفات، لَكسَرت الجلسة النشطة أو خسرت مخبأك. لذلك نُبقيها أثناء إعادة التعيين.

تفصيلة تافهة للوهلة الأولى، لكن بدونها كل شيء ينهار.

---

## الحفظ التلقائي: inotify يراقب كل شيء

حسناً، لكن كيف تصل الملفات إلى فرع `filesystem`؟

الإجابة: مراقب يراقب كل تغييرات الملفات ويقوم بـ commit/push تلقائياً.

الأداة السحرية هي **inotifywait** (من حزمة `inotify-tools`). يراقب نظام الملفات على مستوى النواة ويُفعّل حالما يتغير ملف.

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock|\.gitignore|\.txt\.swp)(/|$)' .; do
    echo "[autosave] change detected"
    commit_and_push
    sleep 1   # debounce si plein de changements d'un coup
  done
}

autosave &
```

دعنا نحلّل أعلام inotify، لأن كل واحد مهم:
- `-r` → تكراري، يراقب كل المجلدات الفرعية
- `-e modify,create,delete,move` → يتفاعل مع هذه الأنواع الأربعة من الأحداث
- `--exclude '...'` → regex لتجاهل بعض الملفات

الـ `--exclude` حاسم. انظر ما يتجاهله:
- `.git` → طبعاً، وإلا كل commit سيُفعّل حفظاً تلقائياً يُفعّل commitاً... حلقة لا نهائية. كارثة.
- `.apt-cache` و `.cache` → المخابئ، التي تتغير طوال الوقت ولا نريد إغراق git بها
- `host.conf` و `tmate.sock` → ملفات الجلسة، التي تتغير باستمرار
- `.gitignore`, `.txt.swp` → الملفات المؤقتة (`.swp` هي ملفات تحرير vim)

بدون هذا الاستثناء، ستجد الحفظ التلقائي يُفعّل في حلقة على تغييراته الخاصة. `.git` في القائمة، هو السطر الذي يمنعك من إطلاق النار على قدمك.

تعدّل ملفاً؟ inotify يكتشفه فوراً، يقوم commit، push. في أقل من ثانية، تغييرك في فرع `filesystem`.

تثبّت شيئاً، تكتب كوداً، تلمس إعداداً -- كل شيء يُحفظ في الوقت الفعلي، تلقائياً، دون أن تفعل أي شيء.

لديك حرفياً نظام حفظ تلقائي للقرص بأكمله. مهول.

### الـ Debounce: لا تُغرِق git

`sleep 1` بعد كل حفظ هو **debounce**.

عندما تحفظ ملفاً في محرر، غالباً ما يُولّد عدة أحداث نظام ملفات بشكل متتابع (إنشاء ملف مؤقت، rename، حذف القديم...). بدون debounce، ستُفعّل 3-4 commits لحفظ واحد فقط.

`sleep 1` يقول: "انتظر ثانية بعد الحفظ، ريثما تهدأ الموجة، قبل أن تستمع من جديد". هذا يجمع التغييرات المتقاربة في commit واحد. ذكي.

### وحفظ دوري أيضاً

في حال فات inotify شيئاً، يوجد أيضاً حفظ كل 5 ثوانٍ:

```bash
periodic_save() {
  while true; do
    sync_from_remote   # récupère les changements distants éventuels
    sleep 5
    commit_and_push
  done
}

periodic_save &
```

حزام وأيضاً حمّالات. لا نريد أبداً أن نفقد حالة القرص.

---

## التفصيلة الذكية: commit واحد فقط

إذا قمت بـ commit عند كل تغيير ملف، ستتراكم آلاف الـ commits. في ساعة من الجلسة، تاريخ git سينفجر. المستودع سيصبح ضخماً. هذا مقرف.

الحل أنيق: **نُعدّل الـ commit الموجود** بدلاً من إنشاء واحد جديد.

```bash
commit_and_push() {
  (
    flock -n 200 || return   # lock pour pas que deux saves tournent en même temps

    git add -A
    git reset -- .github/workflows/ .github/scripts/   # touche pas aux scripts

    if ! git diff --cached --quiet; then
      if git rev-parse --verify HEAD >/dev/null 2>&1; then
        git commit --amend --no-edit    # AMEND : écrase le commit précédent
      else
        git commit -m "autosave $(date -u +%Y%m%dT%H%M%SZ)"
      fi
      git push --force origin "filesystem-workspace:filesystem"
    fi
  ) 200>/tmp/tmate_autosave.lock
}
```

`git commit --amend` يعني: "استبدل آخر commit بهذا".

وبالتالي فرع `filesystem` لديه دائماً commit واحد فقط. بغض النظر عن عدد مرات الحفظ. إنها مجرد لقطة للحالة الحالية، force-push مراراً وتكراراً.

`flock` هو قفل: بما أن هناك حلقتا حفظ (inotify + دوري)، يجب تجنب تشغيل git في نفس الوقت وتداخلهما. عملية git واحدة في كل مرة.

نظيف.

---

## sync_from_remote: التعامل مع جلسات متعددة

هذا شيء لم تفكر فيه في البداية: ماذا لو شغّلت تشغيلتين في نفس الوقت؟ أو إذا عدّلت جلسة فرع `filesystem` بينما جلسة أخرى تعمل؟

السكريبت يتعامل مع هذا بـ `sync_from_remote` قبل كل commit:

```bash
sync_from_remote() {
  git fetch origin "filesystem":refs/remotes/origin/filesystem
  git merge --ff-only "refs/remotes/origin/filesystem"
}
```

`--ff-only` (fast-forward only) مهم: يعني "ادمج فقط إذا أمكن التقدم بشكل نظيف، دون إنشاء commit دمج".

إذا تفرّع الفرعان (مثلاً، جلستان عدّلتا أشياء مختلفة)، يفشل الـ fast-forward بصمت (`2>/dev/null || true`) ونحتفظ بالحالة المحلية. ليس نظام دمج مثالياً، لكنه يتجنب التلف في الحالة البسيطة حيث تعمل جلسة واحدة فقط.

بصراحة، لا يجب تشغيل 3 جلسات بالتوازي على نفس المستودع. لكن الكود يحاول على الأقل ألا ينفجر إذا حدث ذلك. هذا دفاع.

---

## مخبأ APT: التثبيت السريع

هناك تفصيلة في سير العمل لا تلفت الانتباه لكنها مدروسة جيداً:

```yaml
- name: Cache & install APT packages (tmate + watcher)
  uses: awalsh128/cache-apt-pkgs-action@v1.6.0
  with:
    packages: tmate inotify-tools
```

tmate و inotify-tools يُثبّتان عبر إجراء **يخزّن حزم APT مؤقتاً**.

في التشغيل الأول، يُحمّل ويُثبّت. في التشغيلات التالية، يُستعاد من مخبأ GitHub Actions -- أسرع، لا حاجة لإعادة التحميل.

وتتذكر `git clean -fdx -e .apt-cache` من قبل؟ هذا مرتبط. مجلد `.apt-cache` محمي من التنظيف تحديداً لكي تستمر الحزم التي تثبّتها أثناء جلستك بشكلٍ ما.

كل شيء مترابط. لقد فكرت في دورة الحياة الكاملة.

---

## السكريبتات المخبأة في /tmp

تفصيلة أخرى خبيثة لكن ذكية. في بداية السكريبت:

```bash
RUNNER_SCRIPTS_DIR="/tmp/runner-scripts"
rm -rf "$RUNNER_SCRIPTS_DIR"
mkdir -p "$RUNNER_SCRIPTS_DIR"
cp -r .github/scripts "$RUNNER_SCRIPTS_DIR/"
```

السكريبتات (`update_readme.py`، إلخ) تُنسخ إلى `/tmp` قبل لمس فرع `filesystem`.

لماذا؟ لأنه عندما تقوم بـ `git reset --hard` إلى فرع `filesystem` (الفارغ في البداية، أو الذي يحتوي على قرصك)، تختفي ملفات `.github/scripts` من المستودع المصدر من workspace.

لكن السكريبت لا يزال بحاجة إليها أثناء الجلسة (لتحديث README عند كل إعادة تشغيل tmate). لذلك يُخبّئها في `/tmp`، خارج متناول git:

```bash
python3 "$RUNNER_SCRIPTS_DIR/scripts/update_readme.py" --ssh "$tmate_ssh" ...
```

إذا لم تفكر في هذا، ستتوه 30 دقيقة محاولاً فهم لماذا اختفى سكريبتك. لقد فكرت فيه.

---

## الشيل المخصص

راحة صغيرة: الجلسة تعطيك شيلاً مهيئاً، ليس bash عارياً.

`prestart.sh` ينسخ `.bashrc` مخصص:

```bash
if ! grep -q "Custom prompt and aliases for remote sessions" "$HOME/.bashrc"; then
  cp .github/scripts/remote_bashrc "$HOME/.bashrc"
fi
sudo cp "$HOME/.bashrc" /root/.bashrc
```

وهذا `.bashrc` يحتوي على prompt ملون، aliases (`ll`، `lla`، `rm -i`)، والأهم override لـ `exit`:

```bash
exit() {
    killall -9 -u "$(whoami)" tmate 2>/dev/null || true
    builtin exit "$@"
}

# Ctrl+D fait pareil que exit
bind -x '"\C-d": "exit"'
```

عندما تكتب `exit` (أو Ctrl+D)، يقتل عمليات tmate بشكل نظيف قبل الإغلاق. هذا يتجنب ترك جلسات tmate زومبي.

يوجد أيضاً دالة `tmate-detach` إذا أردت فصل نفسك دون قتل الجلسة (لتتصل لاحقاً). تفصيلة راحة، لكنها تُظهر مستوى العناية.

---

## tmate الذي يعيد تشغيل نفسه

راحة صغيرة: إذا كتبت `exit` في شيلك، عادةً جلسة tmate تموت وتنقطع للأبد.

إلا أنه هنا، tmate في حلقة `while true`:

```bash
while true; do
  tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
  while tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' >/dev/null 2>&1; do
    sleep 2
  done
  echo "tmate session ended; restarting..."
done
```

تكتب `exit`؟ الجلسة تعيد تشغيل نفسها تلقائياً. تتصل مجدداً بنفس الرابط.

هذا سخيف، لكنه يجعل الشيء usable.

---

## إعادة الاتصال بأمر واحد

كيف تعيد الاتصال بعد انقطاع، دون البحث في سجلات التشغيل في كل مرة؟

عنوان SSH لـ tmate يُكتب في ملف `host.conf`، مُلتزم في فرع `filesystem`:

```bash
printf '%s' "${tmate_ssh#ssh }" > host.conf
```

وبما أن هذا الملف في git، يمكنك استرجاعه عبر API GitHub بأمر واحد:

```bash
ssh "$(gh api -H 'Accept: application/vnd.github.v3.raw' \
  "/repos/USER/REPO/contents/host.conf?ref=filesystem" | tr -d '\r\n')"
"

تشغّل هذا، يذهب ليجلب عنوان SSH الحالي من المستودع، ويتصل بك. حتى لو تغير العنوان بين جلستين.

---

## التدفق الكامل

لنلخّص:

1. تُشغّل سير العمل (push أو زر يدوي)
2. GitHub يعطيك VM Ubuntu
3. السكريبت يستعيد القرص من فرع "filesystem"
4. inotify يبدأ بمراقبة كل التغييرات
5. periodic_save يقوم بـ commit كل 5 ثوانٍ كنسخ احتياطي
6. tmate يبدأ → يولّد روابط SSH/الويب
7. الروابط تُكتب في README + host.conf
8. تتصل عبر SSH أو الطرفية في المتصفح
9. تفعل ما تريد -- كل تغيير ملف = حفظ تلقائي
10. بعد 6 ساعات، GitHub يقتل VM
11. قرصك سليم في فرع "filesystem"
12. تعيد تشغيل سير العمل → العودة إلى الخطوة 3، كل شيء لا يزال موجوداً

VPS مجاني بقرص دائم. فقط باستخدام git و GitHub Actions.

---

## حسناً، لنكن صادقين: الحدود

هذا اختراق، ليس VPS حقيقياً. لذلك:

- **6 ساعات كحد أقصى لكل تشغيلة.** يجب إعادة تشغيل سير العمل بانتظام. لا uptime غير محدود.
- **ليس للإنتاج.** لن تستضيف موقعك عليه. هذا للاستكشاف، التطوير، التصحيح، اختبار شيء في Linux قابل للرمي لكن قابل للاستعادة.
- **GitHub يرى كل شيء.** هذه أجهزتهم. لا تضع أي شيء حساس.
- **اجعل المستودع خاصاً.** أنت تعرض شيل SSH. مستودع عام = أي شخص يمكنه الاتصال. فكرة سيئة.
- **هذا على حافة شروط الاستخدام.** GitHub Actions مصممة لـ CI/CD، ليس لـ VPS مجاني. لذا استخدمه باعتدال، لأغراض مشروعة، دون إساءة.

### كعب الأخيل الحقيقي: git يكره الملفات الكبيرة

Git مصمم للنصوص، ليس لنظام ملفات.

القرص الدائم يعيش في فرع git. لذا كل ما تحفظه يمر عبر git. و git:
- يتعامل بشكل سيء مع الملفات الثنائية الكبيرة (صورة Docker بحجم 2 جيجا في git؟ انسَ)
- لديه حد 100 ميجا لكل ملف على GitHub (حد صلب، لا يدفع لأكثر من ذلك)
- يوصي بالبقاء تحت ~5 جيجا لكل مستودع

لذا إذا قمت بـ `npm install` لمشروع مع 500 ميجا من `node_modules`، أو بنيت شيئاً ينتج ملفات ثنائية ثقيلة، فإن push إلى `filesystem` إما سيتعطل بشدة، أو سيفشل تماماً.

`git commit --amend` يساعد (commit واحد، لا تاريخ متضخم)، لكنه لا يغير حقيقة أن ملف 200 ميجا لن يمر أبداً.

باختصار: **هذا يعمل رائعاً للكود، الإعدادات، الملفات الصغيرة. لا يعمل لتخزين بيانات كبيرة أو قطع أثرية ثنائية.** يجب أن تضع هذا في اعتبارك أثناء ما تفعله في جلستك.

### ليس لقطة نظام كاملة

فارق مهم آخر: فرع `filesystem` يحفظ **workspace** (مجلد المستودع)، ليس النظام بأكمله.

إذا قمت بـ `apt install htop`، الملف الثنائي يذهب إلى `/usr/bin/htop`، وهو خارج workspace. لذلك لن يُحفظ. في التشغيل التالي، ستحتاج لإعادة تثبيته.

لهذا لدينا مخبأ APT و `prestart.sh`: لإعادة تهيئة بيئة النظام في كل بداية تشغيل، بما أن workspace فقط هو الذي يستمر.

إذا أردت أن تنجو تثبيتاتك، يجب وضعها في workspace (مثلاً، التثبيت في مجلد محلي بدلاً من النظام). هذه جمناستيكة يجب استيعابها.

---

## VPS مجاني مقابل VPS حقيقي: المقارنة

| | repo-to-vps | VPS حقيقي (5€/شهر) |
|---|---|---|
| **السعر** | 0€ | ~5-10€/شهر |
| **Uptime** | 6 ساعات، يُعاد التشغيل | 24/7 |
| **القرص** | فرع git، ملفات صغيرة | SSD حقيقي، عدة جيجا |
| **الرام** | ~7 جيجا (سخي!) | 1-2 جيجا غالباً |
| **المعالج** | 2-4 أنوية جيدة | 1-2 vCPU |
| **الإعداد** | clone قالب | إعداد يدوي |
| **الاستمرارية** | workspace فقط | النظام كاملاً |
| **الشرعية** | على حافة الشروط | 100% نظيف |

الشيء المضحك هو أنه من حيث المواصفات الخام (الرام، المعالج)، مشغل GitHub غالباً أفضل من VPS بـ 5€. لكن uptime 6 ساعات والاستمرارية المحدودة بالـ workspace، هذا ما يجعله لعبة هاكر، وليس خادماً حقيقياً.

للتعلم، الاختبار، تصحيح شيء Linux بسرعة في بيئة قابلة للاستعادة؟ ممتاز. لاستضافة أي شيء جدي؟ خذ VPS حقيقياً.

لكن لبيئة Linux مؤقتة يمكنك استعادتها متى شئت؟ إنه رائع فقط.

---

## النمط وراء كل هذا

إذا أخذت مسافة، repo-to-vps وبوت الإيميل (مقالتي الأخرى) يقومان على نفس الفكرة:

> **Git ليس مجرد مدير إصدارات. إنه نظام تخزين دائم، مجاني، مُرقّم، يمكن الوصول إليه عبر API.**

ما أن يكون لديك نظام عديم الحالة (GitHub Actions، Worker، دالة serverless) وتريد الاحتفاظ بحالة بين تشغيلتين، يمكن لـ git أن يعمل كـ "قرص".

- بوت الإيميل يخزّن `lastId` في وسم git.
- repo-to-vps يخزّن نظام ملفات كاملاً في فرع git.

نفس النمط، مقياسان. قيمة في جانب، قرص في الجانب الآخر.

و `git commit --amend` + force-push هي التقنية المشتركة: **تبقي على commit واحد يمثل الحالة الحالية، يُمسح مع كل تحديث.**

ليس مصمماً لهذا. لكنه يعمل. ومجاني.

---

**3 أشياء لتتذكرها:**

1. **فرع git = قرص صلب دائم** -- خزّن نظام ملفاتك في فرع مخصص، استعده عند بدء التشغيل، وستحصل على حالة تنجو من الأجهزة القابلة للرمي.

2. **inotify + git = حفظ تلقائي فوري** -- `inotifywait` يراقب التغييرات على مستوى النواة ويدفع إلى git فوراً. مع `git commit --amend` للحفاظ على commit واحد نظيف.

3. **tmate يحوّل مشغلاً إلى VPS** -- SSH مباشر على جهاز GitHub Actions، مع إعادة تشغيل تلقائية وإعادة اتصال بأمر واحد عبر API GitHub.

Git كقرص صلب، الحلقة الثانية. أعتقد أنني سأنتهي بتخزين كل شيء في فروع git xD
