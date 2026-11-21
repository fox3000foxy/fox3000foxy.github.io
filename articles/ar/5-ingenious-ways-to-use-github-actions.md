---
title: "5 طرق ملتوية لاستخدام GitHub Actions (وما تعلّمه عن الأسرار)"
description: "runner CI تحوّل إلى VPS مجاني، وبوت يفتح pull requests الخاصة به، ونشر npm دون أي secret. جولة في مستودعاتي لسرد أنماط GitHub Actions الخارجة عن مجرد lint + test + deploy."
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "JB6b1BPzGyGyBJ7zcTHiWFHqyVP3W61w6kkxfCgWQPs52Q3vUPBMGR38jozga0NIIJKb0lQnrFwIo/PlMB/TYQ=="
---

# 5 طرق ملتوية لاستخدام GitHub Actions

GitHub Actions، نظريا، مصمم لـCI/CD تقليدي : تدفع، فيفحص ويختبر وينشر. كتبت فعلا عن حالة خاصة (استخدام وسوم git كقاعدة بيانات لبوت بريد، انظر المقال المخصص). لكن بالتنقيب في مستودعاتي، هناك ما يكفي من الأنماط المختلفة ليستحق مقالا مستقلا، أقل تركيزا على مشروع واحد، وأكثر كفهرس تقنيات.

خمسة استخدامات، من الأكثر تقليدية إلى الأكثر التواء.

## 1. وسم git كحالة دائمة بين تشغيلين

تذكير سريع، التفصيل الكامل في مقال `email-autoreply`. GitHub Actions عديم الحالة بالتصميم : كل تشغيل ينطلق من آلة عذراء. الالتفاف : تخزين قيمة (معرف أو طابع زمني أو أي حالة صغيرة) في وسم git مخصص، أبدا في فرع.

```bash
# قراءة الحالة
git show refs/tags/lastid:data/lastId > data/lastId

# كتابة الحالة (فرع يتيم، commit واحد، دفع إجباري للوسم)
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```

النقطة الأساسية : فرع يتيم لعدم تراكم السجل أبدا، ووسم مُجبَر بدلا من فرع لعدم تلويث قائمة فروع المستودع.

## 2. وسم git ككاش بناء مُجمَّع مسبقا

نفس عائلة الفكرة، استخدام آخر : بدلا من تخزين حالة تطبيقية، نخزن **منتج بناء**. وظيفة `build` تُجمِّع الكود مرة (عند الدفع نحو `master`)، ثم تدفع `dist/` + `node_modules/` في وسم `runtime`. أما وظيفة `cron` فتسحب هذا الوسم مباشرة بدلا من تشغيل `bun install && bun run build` مع كل تنفيذ :

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# لا install ولا build، الكود جاهز فعلا
- run: node dist/index.js --action
```

وهذا يغيّر التشغيل من ~20s إلى ~10s. في cron يعمل غالبا، يُحتسَب ذلك. يقوم `actions/cache` بعمل مشابه (تخزين تبعيات مؤقتا)، لكن وسم git أكثر مباشرة عندما تريد تثبيت منتج مُصدَر ومُشار إليه صراحة، بدلا من مجرد تسريع `npm install`.

## 3. فحص واحد إلزامي يجمّع عدة وظائف

نمط صغير لا يبدو شيئا لكنه يغيّر الحياة في إعداد فرع محمي. في `konosuba-rpg`، تملك CI ثلاث وظائف مستقلة (`typecheck` و`lint` و`tests`) تعمل بالتوازي، ووظيفة رابعة، `test-battery`، لا تفعل شيئا سوى الاعتماد على الثلاث الأولى :

```yaml
test-battery:
  needs:
    - typecheck
    - lint
    - tests
  runs-on: ubuntu-latest
  steps:
    - run: echo "Typecheck, lint and tests succeeded."
```

دون وظيفة الواجهة هذه، يتطلب إعداد فرع محمي تحديد ثلاثة فحوص إلزامية منفصلة، وتحديث هذه القائمة كلما أُضيفت وظيفة أو أُعيدت تسميتها. مع `test-battery`، اسم واحد يُحدَّد في إعدادات المستودع، ويبقى ثابتا حتى لو تغيّر التفصيل الداخلي.

## 4. تحويل runner مجاني إلى VPS مؤقت

هذا هو الأكثر التواء من الكل، وبوضوح المفضل لدي : يحوّل `repo-to-vps` تماما الاستخدام المقصود لـrunner في GitHub Actions ليجعله آلة Linux قابلة للوصول عبر SSH، مجانية، حتى 6 ساعات (الحد الأقصى لوظيفة).

المبدأ : وظيفة لا تفعل شيئا تقريبا سوى إطلاق [tmate](https://tmate.io/) (تفرع من tmux يعرض جلسة طرفية قابلة للمشاركة عبر SSH أو متصفح) :

```yaml
name: debug-runner
on:
  push:
    branches: [main, master]
  workflow_dispatch:
permissions:
  contents: write
  actions: write
jobs:
  debug:
    runs-on: ubuntu-latest
    timeout-minutes: 360
    steps:
      - uses: actions/checkout@v4
      - uses: awalsh128/cache-apt-pkgs-action@v1.6.0
        with:
          packages: tmate inotify-tools
      - run: bash .github/scripts/start-tmate.sh
```

المعضلة الحقيقية أن نظام ملفات runner في GitHub Actions **قابل للرمي** : بمجرد انتهاء الوظيفة، يختفي كل شيء. جلسة SSH تدوم ساعات لا تنفع إذا تبخر كل ما تفعله فيها مع التشغيل التالي. الحل : فرع git يعمل كلقطة حية لنظام الملفات، متزامن باستمرار.

يفعل سكربت `start-tmate.sh`، بالترتيب :

1. **يستعيد** نظام الملفات من فرع مخصص `filesystem` عند بدء الوظيفة (`git reset --hard` عليه).
2. **يراقب** تغيرات الملفات مع `inotifywait` باستمرار، و**يُدخل + يدفع فورا** بمجرد تحرك ملف :

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1   # debounce
  done
}
```

3. كل حفظ **يعدّل** الـcommit السابق بدلا من إنشاء جديد (`git commit --amend --no-edit`)، فيبقى فرع `filesystem` دائما على commit واحد، مما يتجنب تراكم آلاف اللقطات.
4. حلقة `while true` تعيد إطلاق `tmate` تلقائيا إذا ماتت الجلسة، مع `remain-on-exit on` ليبقى الطرفية قابلا للوصول حتى بعد `exit`.
5. يُكتَب رابط SSH الذي يولده tmate في ملف `host.conf`، مُدخَل على فرع `filesystem`، فيُسترجَع عبر GitHub API (`gh api .../contents/host.conf`) دون الوصول أبدا لسجلات الوظيفة مباشرة.
6. روتين `periodic_save` يعمل كل 5 ثوانٍ في الخلفية، تحسبا لفوات `inotifywait` حدثا ما.

النتيجة : shell لينكس كامل، قابل للوصول من أي مكان، مع نظام ملفات يدوم بين الجلسات، بينما البنية الكامنة (runner في GitHub Actions) لم تُصمَّم لذلك إطلاقا. الحد الحقيقي الوحيد هو مهلة 6h لكل وظيفة : بعدها يجب إعادة إطلاق الـworkflow.

## 5. بوت يفتح pull requests الخاصة به

في `konosuba-rpg`، دفع على فرع `dev` يحفّز وظيفة تتحقق إن كانت توجد pull request مفتوحة فعلا نحو `main`، وتنشئ واحدة تلقائيا وإلا، عبر `actions/github-script` وGitHub REST API :

```js
const { data: comparison } = await github.rest.repos.compareCommits({
  owner, repo, base: 'main', head: 'dev',
});
if (comparison.ahead_by === 0) return; // لا شيء لاقتراحه

const { data: existing } = await github.rest.pulls.list({
  owner, repo, state: 'open', head: `${owner}:dev`, base: 'main',
});
if (existing.length > 0) return; // توجد PR مفتوحة فعلا

await github.rest.pulls.create({
  owner, repo, head: 'dev', base: 'main',
  title: 'chore: auto PR from dev to main',
});
```

التفصيل المهم هنا هو الرمز المستخدم. لا يستخدم هذا الـworkflow رمز `GITHUB_TOKEN` التلقائي : بل يتطلب secret منفصلا `AUTO_PR_TOKEN`، ويرفض المتابعة إذا غاب :

```yaml
- name: Validate pull request token
  env:
    AUTO_PR_TOKEN: ${{ secrets.AUTO_PR_TOKEN }}
  run: |
    if [ -z "$AUTO_PR_TOKEN" ]; then
      echo "AUTO_PR_TOKEN is required... Use a PAT or GitHub App token with contents:write and pull-requests:write."
      exit 1
    fi
```

## 6. النشر على npm دون أي secret

الأكثر تحفظا من الخمسة، لكنه على الأرجح الأهم للمستقبل : لا يحوي workflow الـ`publish.yml` في `typescript-virtual-container` **أي secret خاص بـnpm**. لا `NPM_TOKEN` ولا `NODE_AUTH_TOKEN`. فقط هذا :

```yaml
permissions:
  id-token: write  # Required for OIDC
  contents: read
jobs:
  publish:
    steps:
      - uses: actions/setup-node@v6
        with:
          registry-url: 'https://registry.npmjs.org'
      - run: npm publish
```

يعمل `npm publish` مع ذلك، لأن سجل npm يدعم الآن **النشر الموثوق** عبر OIDC : يثبت الـworkflow هويته مباشرة للسجل (المستودع + الـworkflow الدقيقان، المُعدَّلان جهة npmjs.org)، دون عبور أي رمز ثابت أو تخزينه في أي مكان. صفر secret قابل للتسريب، وصفر رمز يُدوَّر كل ستة أشهر.

---

## أسرار GitHub، في العمق

تمس هذه الأنماط الخمسة كلها، بطريقة أو أخرى، مسألة الأسرار. بعض المبادئ التي تعود في كل مكان في workflows خاصتي :

**الـsecret ليس بالضرورة سلسلة بسيطة.** في `email-autoreply`، يحوي `ACCOUNTS_JSON` كامل JSON المصغَّر لإعداد الحسابات المتعددة : بنية بيانات كاملة بدلا من مجرد مفتاح API، تُحقَن كما هي في ملف عند التشغيل :

```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

وهذا يتجنب الاضطرار لإدخال ملف إعداد في الـcommit، ولو مشفرا، ويُحدَّث بنقرة في إعدادات المستودع دون لمس الكود.

**لرمز `GITHUB_TOKEN` حدود دقيقة، وهذا مقصود.** الرمز التلقائي الذي يحقنه GitHub في كل تشغيل قوي، لكنه مختوم في نقاط معينة : افتراضيا، لا يستطيع تحفيز workflow آخر، وحسب إعداد المستودع قد تحجبه قواعد حماية الفرع. وهذا بالضبط سبب اشتراط `create-pull-request.yml` رمز PAT منفصلا (`AUTO_PR_TOKEN`) : رمز من حساب حقيقي (أو GitHub App)، بحقوق صريحة `contents:write` + `pull-requests:write`، متميز عن الرمز الزائل للوظيفة.

**الأذونات تُحدَّد لكل وظيفة، لا شموليا.** كل workflow سردته هنا يعلن كتلة `permissions:` دنيا ومُعلَّقة :

```yaml
permissions:
  contents: read
  actions: read
  checks: write
  # Only allow writing checks, everything else is read-only
```

كان لرمز `GITHUB_TOKEN` الافتراضي تاريخيا حقوق واسعة على مستودع عام ؛ وتقييده صراحة لما تحتاجه الوظيفة فعلا يحد من الأضرار إذا تبين أن action طرف ثالث في السلسلة (`uses: quelqu-un/action@version`) مُخترَقة.

**أفضل secret هو الذي لا يوجد.** نمط OIDC في `typescript-virtual-container` هو النسخة الأكثر نضجا من هذه الفكرة : بدلا من إدارة تدوير `NPM_TOKEN` وانتهائه وخطر تسريبه، يثبت الـworkflow تشفيريا هويته (هذا المستودع بالذات، هذا الـworkflow بالذات) مباشرة للخدمة الطرف الثالث. نفس المنطق متاح لـAWS وDocker Hub وPyPI : المزيد والمزيد من السجلات والسحب تدعم OIDC من GitHub Actions.

---

**3 نقاط أساسية**

1. وسم git (يتيم، مُدفَع بالإجبار) يمكنه العمل كقاعدة بيانات مصغرة أو ككاش بناء مُجمَّع مسبقا : استخدامان متميزان لنفس الآلية.
2. يمكن لـrunner مجاني في GitHub Actions أن يصبح shell SSH دائما إذا قبلنا مزامنة نظام ملفاته باستمرار نحو فرع git، مع حفظ تلقائي عبر `inotifywait` وcommit واحد مُعدَّل.
3. رمز `GITHUB_TOKEN` الافتراضي محدود عمدا : إنشاء PR بين الفروع أو النشر دون secret يتطلب إما PAT مخصصا، أو انتقالا إلى النشر الموثوق OIDC.
