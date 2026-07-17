---
title: "5 طرق بارعة لاستخدام GitHub Actions (وما تعلمه عن الأسرار)"
description: "محول CI يتحول إلى VPS مجاني، بوت يفتح طلبات السحب الخاصة به، نشر npm بدون أي سر. جولة في مستودعاتي لفهرسة أنماط GitHub Actions التي تتجاوز مجرد \"lint + test + deploy\"."
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "URrMiwghqS/PPIdc4MWZ+bM05pekohYNevnTyeYvnqNMuOQ8XpYLAK9m/GITRpGAIjAzIrTX8e4weSr0h8FeNg=="
---

# 5 طرق بارعة لاستخدام GitHub Actions

على الورق، GitHub Actions مصمم لـ CI/CD الكلاسيكي: تدفع، يفحص، يختبر، ينشر. لقد كتبت بالفعل عن حالة خاصة -- استخدام git tags كقاعدة بيانات لبوت بريد إلكتروني (انظر المقال المخصص). لكن بالتنقيب في مستودعاتي، هناك أنماط مختلفة كافية لتستحق مقالاً مستقلاً، أقل تركيزاً على مشروع واحد، وأكثر كفهرس للتقنيات.

خمسة أشياء، من الأكثر كلاسيكية إلى الأكثر التواءً.

## 1. git tag كحالة دائمة بين التشغيلات

ملخص سريع، التفاصيل الكاملة في مقال `email-autoreply`. GitHub Actions بلا حالة حسب التصميم -- كل تشغيل يبدأ من آلة فارغة. الالتفاف: تخزين قيمة (معرف، طابع زمني، أي حالة صغيرة) في git tag مخصص، وليس في فرع أبداً.

```bash
# قراءة الحالة
git show refs/tags/lastid:data/lastId > data/lastId

# كتابة الحالة (فرع يتيم، commit واحد، force-push للوسم)
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```

النقطة الأساسية: فرع يتيم لعدم تراكم التاريخ أبداً، ووسم قسري بدلاً من فرع لعدم تلويث قائمة الفروع في المستودع.

## 2. git tag كذاكرة تخزين مؤقت للبناء المجمع مسبقاً

نفس عائلة الأفكار، استخدام مختلف: بدلاً من تخزين حالة التطبيق، نخزن **أثر بناء**. وظيفة `build` تجمع الكود مرة واحدة (عند الدفع إلى `master`)، ثم تدفع `dist/` + `node_modules/` في وسم `runtime`. وظيفة `cron` تسحب ذلك الوسم مباشرة بدلاً من تشغيل `bun install && bun run build` في كل تنفيذ:

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# لا تثبيت، لا بناء -- الكود جاهز
- run: node dist/index.js --action
```

هذا يغير وقت التنفيذ من ~20 ثانية إلى ~10 ثوانٍ. على cron يعمل كثيراً، هذا مهم. `actions/cache` يقوم بعمل مشابه (تخزين التبعيات مؤقتاً)، لكن git tag أكثر مباشرة عندما تريد تجميد أثر مُؤَرْخ بالكامل والإشارة إليه بشكل صريح -- ليس مجرد تسريع `npm install`.

## 3. فحص إلزامي واحد يجمع عدة وظائف

نمط صغير لا يبدو كبيراً لكنه يغير الحياة في إعداد حماية الفروع. على `konosuba-rpg`، لدى CI ثلاث وظائف مستقلة (`typecheck`، `lint`، `tests`) تعمل بالتوازي -- ووظيفة رابعة، `test-battery`، لا تفعل شيئاً سوى الاعتماد على الثلاث الأولى:

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

بدون وظيفة الواجهة هذه، سيتطلب تكوين فرع محمي تحديد ثلاث فحوصات إلزامية منفصلة -- وتحديث تلك القائمة في كل مرة تُضاف فيها وظيفة أو يُعاد تسميتها. مع `test-battery`، اسم واحد فقط لتحديده في إعدادات المستودع، يبقى مستقراً حتى لو تغيرت التفاصيل الداخلية.

## 4. تحويل مشغل مجاني إلى VPS مؤقت

هذا الأكثر التواءً على الإطلاق، وبوضوح المفضل لدي: `repo-to-vps` يحول تماماً الاستخدام المقصود لمشغل GitHub Actions ليصبح آلة Linux يمكن الوصول إليها عبر SSH، مجاناً، لمدة تصل إلى 6 ساعات (المدة القصوى لوظيفة).

المبدأ: وظيفة لا تفعل شيئاً تقريباً سوى تشغيل tmate:

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

المشكلة الحقيقية هي أن نظام ملفات مشغل GitHub Actions **قابل للاستبدال** -- بمجرد انتهاء الوظيفة، يختفي كل شيء. جلسة SSH تدوم لساعات لا فائدة منها إذا كان كل ما تفعله يتبخر في التشغيل التالي. الحل: فرع git يعمل كلقطة حية لنظام الملفات، متزامن باستمرار.

سكريبت `start-tmate.sh` يقوم، بالترتيب:

1. **يستعيد** نظام الملفات من فرع `filesystem` المخصص عند بدء الوظيفة (`git reset --hard` عليه).
2. **يراقب** تغييرات الملفات باستمرار باستخدام `inotifywait`، و **يcommit + يpush فوراً** بمجرد تحرك ملف:

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1
  done
}
```

3. كل حفظ **يعدل** الـ commit السابق بدلاً من إنشاء واحد جديد (`git commit --amend --no-edit`)، لذلك يبقى فرع `filesystem` دائماً عند commit واحد -- لا تراكم لآلاف اللقطات.
4. حلقة `while true` تعيد تشغيل tmate تلقائياً إذا ماتت الجلسة، مع `remain-on-exit on` ليظل الطرفية قابلة للوصول حتى بعد `exit`.
5. عنوان SSH الذي يولده tmate يُكتب في ملف `host.conf`، ويُcommit على فرع `filesystem` -- قابل للاسترجاع عبر GitHub API (`gh api .../contents/host.conf`) دون الحاجة للوصول المباشر إلى سجلات الوظيفة.
6. روتين `periodic_save` يعمل كل 5 ثوانٍ في الخلفية، في حال فات `inotifywait` حدثاً.

النتيجة: صدفة Linux كاملة، يمكن الوصول إليها من أي مكان، مع نظام ملفات يستمر بين الجلسات -- مع أن البنية التحتية الأساسية (مشغل GitHub Actions) لم تُصمم أبداً لهذا. القيد الحقيقي الوحيد هو المهلة البالغة 6 ساعات لكل وظيفة -- بعدها يجب إعادة تشغيل سير العمل.

## 5. بوت يفتح طلبات السحب الخاصة به

على `konosuba-rpg`، الدفع إلى فرع `dev` يشغل وظيفة تتحقق مما إذا كان هناك طلب سحب مفتوح إلى `main` بالفعل -- وتنشئ واحداً تلقائياً إذا لم يكن، عبر `actions/github-script` و GitHub REST API:

```js
const { data: comparison } = await github.rest.repos.compareCommits({
  owner, repo, base: 'main', head: 'dev',
});
if (comparison.ahead_by === 0) return;

const { data: existing } = await github.rest.pulls.list({
  owner, repo, state: 'open', head: `${owner}:dev`, base: 'main',
});
if (existing.length > 0) return;

await github.rest.pulls.create({
  owner, repo, head: 'dev', base: 'main',
  title: 'chore: auto PR from dev to main',
});
```

التفصيل المهم هنا هو الرمز المستخدم. سير العمل هذا **لا** يستخدم `GITHUB_TOKEN` التلقائي -- إنه يتطلب سر `AUTO_PR_TOKEN` منفصل، ويرفض المتابعة إذا كان مفقوداً:

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

## 6. النشر على npm بدون أي سر

الأكثر هدوءً من الخمسة، لكنه ربما الأكثر أهمية للمستقبل: سير العمل `publish.yml` لـ `typescript-virtual-container` لا يحتوي على **أي سر npm**. لا `NPM_TOKEN`، ولا `NODE_AUTH_TOKEN`. فقط هذا:

```yaml
permissions:
  id-token: write
  contents: read
jobs:
  publish:
    steps:
      - uses: actions/setup-node@v6
        with:
          registry-url: 'https://registry.npmjs.org'
      - run: npm publish
```

`npm publish` يعمل رغم ذلك، لأن سجل npm يدعم الآن **النشر الموثوق** عبر OIDC: سير العمل يثبت هويته مباشرة للسجل (مستودع محدد + سير عمل محدد، مكونان من جانب npmjs.org)، دون أن يمر أي رمز ثابت أو يُخزن في أي مكان. صفر أسرار للتسرب، صفر رموز للتدوير كل ستة أشهر.

---

## أسرار GitHub، بعمق

هذه الأنماط الخمسة تلمس جميعها، بطريقة أو بأخرى، مسألة الأسرار. بعض المبادئ التي تتكرر في كل سير عمل لدي:

**السر ليس بالضرورة سلسلة بسيطة.** في `email-autoreply`، يحتوي `ACCOUNTS_JSON` على JSON المضغوط بالكامل لإعدادات الحسابات المتعددة -- ليس مجرد مفتاح API، بل بنية بيانات كاملة، تُحقن كما هي في ملف وقت التشغيل:

```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

هذا يتجنب الحاجة إلى commit ملف إعدادات، حتى لو كان مشفراً، ويمكن تحديثه بنقرة واحدة في إعدادات المستودع دون لمس الكود.

**`GITHUB_TOKEN` له حدود دقيقة، وهذا مقصود.** الرمز التلقائي الذي يحقنه GitHub في كل تشغيل قوي، لكنه مختوم في نقاط معينة: افتراضياً لا يمكنه تشغيل سير عمل آخر، وحسب إعدادات المستودع يمكن أن يُمنع بقواعد حماية الفروع. لهذا السبب تحديداً يتطلب `create-pull-request.yml` PAT منفصلاً (`AUTO_PR_TOKEN`) -- رمز من حساب حقيقي (أو GitHub App)، بصلاحيات صريحة `contents:write` + `pull-requests:write`، منفصل عن الرمز المؤقت للوظيفة.

**الصلاحيات محددة النطاق وظيفة بوظيفة، وليس بشكل عام.** كل سير عمل أدرجته هنا يعلن كتلة `permissions:` دنيا ومعلّق عليها:

```yaml
permissions:
  contents: read
  actions: read
  checks: write
```

`GITHUB_TOKEN` الافتراضي تاريخياً له صلاحيات واسعة نسبياً على مستودع عام؛ تقييده صراحة لما تحتاجه الوظيفة فعلاً يحد من الضرر إذا تبين أن إجراءً خارجياً في السلسلة مخترق.

**أفضل سر هو الذي لا يوجد.** نمط OIDC من `typescript-virtual-container` هو النسخة الأكثر اكتمالاً من هذه الفكرة: بدلاً من إدارة التدوير والانتهاء وخطر تسرب `NPM_TOKEN`، يثبت سير العمل هويته تشفيرياً (هذا المستودع المحدد، سير العمل المحدد هذا) مباشرة للخدمة الخارجية. نفس المنطق متاح لـ AWS وDocker Hub وPyPI -- المزيد والمزيد من السجلات والسحابات تدعم OIDC من GitHub Actions.

---

**3 نقاط رئيسية**

1. git tag (يتيم، مدفوع بالقوة) يمكن أن يعمل كقاعدة بيانات بسيطة أو ذاكرة تخزين مؤقت للبناء المجمع مسبقاً -- استخدامان مختلفان لنفس الآلية.
2. مشغل GitHub Actions المجاني يمكن أن يصبح صدفة SSH دائمة إذا قبلت بمزامنة نظام ملفاته باستمرار إلى فرع git، مع حفظ تلقائي عبر `inotifywait` و commit معدل واحد.
3. `GITHUB_TOKEN` الافتراضي محدود عن قصد -- إنشاء طلبات سحب بين الفروع أو النشر بدون أسرار يتطلب إما PAT مخصصاً، أو التحول إلى OIDC trusted publishing.
