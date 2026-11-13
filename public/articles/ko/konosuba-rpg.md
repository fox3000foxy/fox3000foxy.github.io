---
title: konosuba-rpg 코드를 주말에 읽고 찾은 것
description: "매 행동마다 즉석에서 WebP 이미지를 만드는 Discord 턴제 RPG. 상태로서의 URL, 결정적 RNG, WASM 파이프라인, 5단계 캐시, 서버리스 봇."
date: 2026-06-10
tags:
  - discord
  - rpg
  - typescript
  - hono
  - cloudflare
  - supabase
  - wasm
  - gaming
  - serverless
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "uFYEbC6rNsmDNRdo9t6jMLTKCm5w82HEfnPAYqGpUhXwR0PGsvfS5U8+Y1HYLJbuSvH93TwkODDwQA1xhHp6NA=="
---

# konosuba-rpg 코드를 주말에 읽고 찾은 것

이 프로젝트를 한동안 유지해 왔지만, 머리를 식히고 자기 코드를 다시 읽는 것은 항상 배움이 있어요. konosuba-rpg는 매 행동마다 즉석에서 WebP 이미지를 만드는 Discord 턴제 RPG예요. 스프라이트와 체력 바, 전투 메시지가 있는 완전한 합성 이미지, 전부요.

스택은 TypeScript, Hono, Vercel, Cloudflare Workers, Supabase. 호스팅은 완전히 무료. 그리고 Discord 봇은 영속 서버 없이 돌아요. 이 글에서는 이 모든 것이 어떻게 하나로 맞물리는지 설명해요.

![게임 초기 상태](/images/konosuba-rpg/game_init.webp)

---

## 기본 설계: 게임 상태로서의 URL

가장 먼저 눈에 띄는 것은 게임플레이에 서버 쪽 상태가 전혀 없다는 거예요. 전투의 완전한 상태가 URL에 들어 있어요.

```
/konosuba-rpg/fr/abc123/ATK/DEF/ATK/HUG?monster=Vanir&difficulty=hard
```

시드 뒤의 각 구간이 플레이한 행동 하나예요. 서버는 이 URL을 받아서 처음부터 다시 시작하고 모든 행동을 순서대로 다시 실행한 뒤, 바로 그 순간 전투 이미지를 돌려줘요. 세션도 없고, 사용자와 연결된 RAM 상태도 없어요.

Discord는 상호작용 버튼으로 동작해요. 플레이어가 "공격"을 누르면 Discord가 버튼의 `custom_id`를 서버로 보내요. 이 custom_id에는 새 행동이 추가된 압축 전투 URL이 들어 있어요. 서버는 처음부터 전부 다시 계산하고 고쳐진 이미지를 돌려줘요.

```typescript
// processUrl.ts
const VALID_MOVES_SET = new Set(["ATK", "DEF", "HUG", "HEA", "SPE", "USE"]);
// 함수 밖에 미리 컴파일 -- 매 호출마다 다시 만들지 않아요

export default function processUrl(url: string): [Random, string[], string, string | null, string | null] {
  const urlParts = url.split("/");
  const moves: string[] = [];
  for (const part of urlParts) {
    if (VALID_MOVES_SET.has(part.toUpperCase())) moves.push(part.toUpperCase());
  }
  // seed = 6번째 구간, 8096개 값으로 해시
  const seedStr = (urlParts[5] || "").toLowerCase();
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed + seedStr.charCodeAt(i)) % 8096;
  }
  return [new Random(seed), moves, seedStr, monster, difficulty];
}
```

함수 밖에 미리 컴파일된 `Set`은 세부 사항이지만, 모듈이 다시 평가될 수 있는 엣지 맥락에서 매 호출마다 구조를 다시 만드는 것을 피해요.

### RNG: 개조 RC4

난수 생성기는 PRNG로 전용된 RC4 구현(스트림 암호화 알고리즘)이에요.

```typescript
export class Random {
  private S: number[]; // 256개 항목 표
  private i: number;
  private j: number;

  constructor(seed?: number) {
    this.S = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    let workingSeed = seed || Date.now();
    for (let i = 0; i < 256; i++) {
      j = (j + this.S[i] + (workingSeed & 0xff)) & 0xff;
      // S[i]와 S[j] 바꾸기
      [this.S[i], this.S[j]] = [this.S[j], this.S[i]];
      workingSeed >>>= 8;
    }
  }

  next(): number { /* ... */ }
  randint(min: number, max: number): number { /* ... */ }
  choice(array: T[]): T { /* ... */ }
}
```

왜 RC4냐고요? 분포가 괜찮고 시드 충돌 내성이 합리적인 결정적 PRNG라서요. 같은 시드 = 같은 숫자 연속 = 매번 같은 전투. 어떤 전투든 URL을 간직해서 "다시 실행"할 수 있게 하고, 서로 다른 두 서버(Vercel + Cloudflare)가 같은 URL에 정확히 같은 결과를 내도록 보장해요.

---

## Discord 100자 한도 문제

Discord는 버튼 `custom_id`에 100자 한도를 강제해요. 행동이 수십 개 쌓이면 전투 URL이 이 한도를 훌쩍 넘겨요.

두 구조가 이를 받아요.

### 1. 행동의 RLE 압축

행동은 한 글자로 인코딩되고(`a`=attack, `d`=defend, `h`=hug...) 런렝스 인코딩으로 압축돼요.

```typescript
// movesUtils.ts
export function compressMoves(moves: string): string {
  // "aaaaaadddh" → "a6d3h"
  let result = "";
  let count = 1;
  for (let i = 1; i <= actions.length; i++) {
    if (actions[i] === actions[i - 1]) {
      count++;
    } else {
      result += actions[i - 1] + (count > 1 ? String(count) : "");
      count = 1;
    }
  }
  return head + result;
}
```

단순하지만, 플레이어가 공격 x10을 연타하면 `aaaaaaaaaa`(10자)에서 `a10`(3자)으로 바뀌어요. UI의 "공격 x4"와 "공격 x10" 버튼이 바로 그 때문에 있어요. 전투를 빠르게 하면서 페이로드를 잘 압축해요.

### 2. 압축이 부족하면 세션 토큰

압축된 페이로드가 여전히 너무 길면, 짧은 토큰과 함께 자료에 저장돼요.

```typescript
// gameSessionService.ts
const TOKEN_PREFIX = "gs.";
const TOKEN_SIZE = 10; // "gs.aBcDeFgHiJ"

export async function encodeGameplayButtons(buttons: RawButton[]): Promise {
  // battle_key별로 페이로드를 묶어서 Supabase에 배치 삽입
  // custom_id를 "gs.{token}:{userId}"로 바꿔요
}

export async function decodeGameplayPayloadWithStatus(encodedPayload: string, userID: string) {
  if (!encodedPayload.startsWith(TOKEN_PREFIX)) {
    return { payload: encodedPayload }; // 필요 없으면 조회 없어요
  }
  // 메모리에서 먼저 조회, 없으면 Supabase
  const cached = tokenToSession.get(token) || await loadTokenRowByToken(token);
  // 소유권, TTL (7일), turn_version 확인 (낡은 상태 재실행 방지)
}
```

세션은 TTL 7일에 10분마다 자동 정리돼요. `turnVersion` 검사는 플레이어가 게임에서 앞으로 나아갔을 때 낡은 상태를 재실행하지 않게 막아요. 우연한 "뒤로 가기"에 대한 은근한 보호예요.

메모리 Map 둘(`tokenToSession`, `latestTurnByBattle`)은 아래에서 볼 이미지 캐시와 같은 이유로 `globalThis as unknown as GameSessionGlobals` 패턴을 써요.

---

## 이미지 렌더링 파이프라인

![Slime과의 전투 시작](/images/konosuba-rpg/shot_01_start.webp)

`/konosuba-rpg/:lang/*` 라우트는 JSON을 돌려주지 않아요. 요청에 따라 만든 WebP 이미지를 돌려줘요.

파이프라인은 3개 층 합성으로 짜여 있어요.

```
Background (board + frame)
    +
Characters layer (player sprites + mob, fixed positions)
    +
UI overlay (HP bars, messages, personal icons via Satori → SVG → PNG)
    ↓
Photon.watermark() × 2
    ↓
WebP output
```

**Background**: 고정 이미지 둘(판과 틀). 파일시스템에서 불러와서 한 번 합성해요.

**Characters layer**: 계산된 좌표에 따라 스프라이트를 배치해요. 죽은 플레이어는 빠져요(`activeSlots = slots.filter(s => playerHp[s.i] > 0)`). 적 스프라이트는 외부 의존성 대신 픽셀별 루프 커스텀 `flipX`로 수평 뒤집어요.

```typescript
function flipX(img: Photon.PhotonImage): Photon.PhotonImage {
  const w = img.get_width(), h = img.get_height();
  const raw = img.get_raw_pixels();
  const flipped = new Uint8Array(raw.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      const dst = (y * w + (w - 1 - x)) * 4;
      flipped[dst] = raw[src]; flipped[dst+1] = raw[src+1];
      flipped[dst+2] = raw[src+2]; flipped[dst+3] = raw[src+3];
    }
  }
  return new Photon.PhotonImage(flipped, w, h);
}
```

**UI overlay**: 무거운 부분이에요. 인터페이스 JSX(체력 바, 텍스트, 아이콘)를 Satori로 React처럼 기술하고, SVG로 렌더링하고, `@cf-wasm/resvg`로 PNG로 바꾸고, 최종 합성을 위해 Photon으로 가져와요. Satori와 resvg는 `edge-light` 플래그로 Cloudflare Workers용으로 특별히 컴파일된 WASM 모듈 둘이에요.

![방어 행동](/images/konosuba-rpg/shot_03_defend.webp)

![진행 중 전투](/images/konosuba-rpg/shot_02_combat.webp)

![포옹 행동](/images/konosuba-rpg/shot_04_hug.webp)

---

## 캐시 시스템: 가장 공들인 부분

수준이 다른 캐시 5개가 있어요. 파이프라인의 서로 다른 세밀함을 노려요.

```typescript
// renderImage.ts -- 전부 globalThis 위
G.__imageCache  ??= {} as Record; // 날것 에셋
G.__base64Cache ??= {} as Record;       // 에셋 base64 (Satori용)
G.__fontCache   ??= {} as Record; // 글꼴
G.__photonCache    ??= new LRUCache(40, freePhoton);
G.__layerCache     ??= new LRUCache(12, freePhoton);
G.__uiPhotonCache  ??= new LRUCache(30, freePhoton);
G.__renderOutputCache ??= new LRUCache(120);
```

`globalThis`의 `??=` 패턴. 엣지 워커의 JavaScript 모듈은 특정 설정에서 요청 사이에 다시 평가될 수 있어요. 캐시를 `??=`와 함께 `globalThis`에 저장하면 다시 만들어지지 않고 이런 재평가를 살아남아요.

### WASM 제거

Photon 이미지 캐시(`photonCache`, `layerCache`, `uiPhotonCache`)는 제거 콜백을 써요.

```typescript
function freePhoton(_key: string, img: Photon.PhotonImage): void {
  try { img.free(); } catch { /* 이미 해제됨 */ }
}

new LRUCache(40, freePhoton)
```

`Photon.PhotonImage`은 JavaScript GC 밖에 선형 WASM 메모리를 할당한 WASM 객체예요. `.free()`를 명시적으로 부르지 않으면 이 메모리는 할당된 채로 남아요. LRU 제거가 자동으로 `.free()`를 일으켜요. JavaScript로 옮긴 RAII예요.

### 캐시 키는 일부러 손실돼요

```typescript
function buildCharactersKey(playerImages: string[][], playerHp: number[], creatureImages: string[], creatureHp: number): string {
  const players = playerImages.map((imgs, i) => `${imgs[0]}:${playerHp[i] > 0 ? 1 : 0}`).join("|");
  return `chars::${players}::${creatureImages[0]}:${creatureHp > 0 ? 1 : 0}`;
}
```

캐릭터 층 키는 HP 정확한 값을 인코딩하지 않아요. `1`(생존) 또는 `0`(사망)뿐이에요. HP 40인 플레이어와 HP 15인 플레이어의 스프라이트가 똑같으니까요. 그래서 아무도 쓰러지지 않는 한 어떤 피해를 입어도 캐시 적중이 살아남아요.

UI 키는 정확한 HP(매 타격마다 체력 바가 바뀌어요)와 메시지 해시를 인코딩해요.

```typescript
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0; // 부호 있는 32비트 정수
  }
  return hash.toString(16);
}
```

`Math.imul`은 곱셈을 32비트 정수로 강제해서, float64 변환을 피하고 안정적인 다항 해시를 줘요. 외부 의존성을 더하지 않아요.

### 스택 오버플로우 없는 base64 변환

```typescript
function getBase64Cached(key: string, buf: ArrayBuffer): string {
  if (base64Cache[key]) return base64Cache[key];
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000; // 32768 바이트
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  const b64 = btoa(binary);
  base64Cache[key] = b64;
  return b64;
}
```

`String.fromCharCode(...largeArray)`는 인수가 호출 스택으로 넘어가서 큰 이미지에 스택 오버플로우를 일으킬 수 있어요. 32KB 청킹이 이를 피해요. 결과는 캐시돼요. 같은 이미지의 base64 변환은 워커 인스턴스당 한 번만 해요.

---

## STRIPPER.md: 순차 await 감사

순차 `await` 병렬화 감사를 문서화한 `STRIPPER.md` 파일이 저장소에 있어요. 기록된 예시 몇 가지예요.

- 플레이어 프로필 불러오기가 Supabase 요청 셋을 연속으로 했어요 (진행, 실행 요약, 업적). `Promise.all`로 넘어갔어요. 서로 의존 없어요.
- 전투 종료 보상 분배(액세서리와 소모품)가 순차였어요. 마찬가지로 병렬화했어요.
- 버튼용 세션 토큰 만들기가 그룹별로 일어났어요. 독립 그룹은 이제 병렬로 만들어요.

```typescript
// progressionService.ts -- 전 (순차)
await grantAccessoryDropRewards(...);
await grantConsumableDropRewards(...);

// 후
await Promise.all([
  grantAccessoryDropRewards(...),
  grantConsumableDropRewards(...),
]);
```

혁명적인 것은 아니지만, 응답 시간 1밀리초가 청구되거나(콜드 스타트에 기여하는) 서버리스 맥락에서는 중요해요.

---

## 영속 서버 없는 Discord 봇

![승리](/images/konosuba-rpg/shot_05_win.webp)

흔히 잘못 이해하는 점이에요. Discord 봇이 꼭 영속 WebSocket 연결을 필요로 하지는 않아요. Discord는 대안을 제공해요. **Interactions Endpoint URL**. Discord에 HTTPS URL 하나를 주고, Discord가 각 인터랙션(슬래시 명령어, 버튼, 자동 완성)마다 POST를 보내요.

```typescript
// interactions.ts
export async function handleInteractions(c: Context) {
  const body = await c.req.text();
  const isVerified = await verifySignature(c, body); // Ed25519
  if (!isVerified) return c.text("Invalid signature", 401);

  const interaction: Interaction = JSON.parse(body);
  if (interaction.type === 1) return c.json({ type: 1 }); // Discord 핑
  if (interaction.type === 2) return handleSlashCommand(...);
  if (interaction.type === 3) return handleButtonInteraction(...);
  if (interaction.type === 4) return handleAutocomplete(...);
}
```

Discord가 POST를 보내고, 핸들러가 Vercel 함수나 Cloudflare Worker에서 50~200ms 돌고, 답하고, 끝이에요. 유지할 영속 연결도 없고, 켜둘 서버도 없어요. Discord 봇 전체가 Vercel 무료 티어에 호스팅돼요.

Ed25519 검증(`discord-interactions`의 `verifyKey`)은 필수예요. Discord가 헤더에 서명을 보내고 검증해야 해요. 아니면 엔드포인트를 거부해요.

### 특별 애니메이션: 유일하게 의도적인 await

```typescript
// handleSpecialButton.ts
await new Promise(resolve => setTimeout(resolve, 3000)); // 3초
await fetch(`${DISCORD_API_URL}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
  method: "PATCH",
  // ...
});
```

의도적인 3초 지연은 STRIPPER.md에 의도적이라고 문서화되어 있어요. Megumin의 특별 공격(Explosion)에 Discord 쪽 애니메이션이 있어요. 메시지가 먼저 중간 비주얼로 고쳐졌다가 3초 뒤에 결과로 수정돼요. Vercel 함수를 필요보다 일부러 오래 돌리는 유일한 경우예요.

![특별 공격](/images/konosuba-rpg/shot_08_special.webp)

---

## 두 플랫폼 배포 가능성

같은 코드베이스가 수정 없이 Vercel(Node.js)과 Cloudflare Workers(V8 아이솔레이트)에서 돌아요.

```typescript
// worker.ts -- Cloudflare 진입점
export default {
  fetch(request: Request, env: WorkerBindings): Promise {
    syncBindingsToProcessEnv(env); // CF 시크릿을 process.env에 주입
    return app.fetch(request, env, ctx);
  }
};

// index.ts -- Vercel과 Node 진입점
const isVercelRuntime = process.env.VERCEL === "1";
if (!isVercelRuntime) { start(); }
```

주된 차이는 정적 에셋이에요. Vercel에서는 파일시스템(`/var/task/assets/`)에서 읽어요. Cloudflare Workers에서는 정적 에셋 바인딩 `ASSETS`(CF 정적 에셋)가 있고 HTTPS 미러(`fox3000foxy.com/konosuba-rpg/assets`)로 폴백해요. `assetLoader.ts`의 `getAssetBytes`가 파일시스템 먼저, 다음 fetch로 두 경로를 다뤄요.

WASM(`@cf-wasm/photon/edge-light`, `@cf-wasm/resvg`)은 각 런타임용 빌드가 따로 있어요. 패키지 이름의 `edge-light` 플래그는 Cloudflare Workers 호환 빌드를 가리켜요. 런타임에 `new WebAssembly.Module()`을 허용하지 않아서 WASM이 미리 컴파일되어야 해요.

---

## 진행: XP, 레벨, 호감도

![보스, HP 650](/images/konosuba-rpg/shot_06_boss.webp)

메타 진행은 Supabase 무료 티어에 기대요. 스키마에 `players` 표(전체 XP, 레벨, 골드), `character_progress`(Darkness, Aqua, Megumin별 XP와 레벨, 호감도), `runs`(전투 기록), `inventory_items`, `daily_quests_progress`, `achievements_unlocked`, `game_sessions` 표가 있어요.

진행 모델은 단순해요.

```typescript
// characterService.ts
export function computeLevelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1; // 레벨당 XP 100
}

export function getLevelFactor(level: number): number {
  return 1 + 0.2 * (level - 1); // 레벨당 스탯 20퍼센트 증가
}

export function getAffinityFactor(affinity: number): number {
  const stars = Math.floor(affinity / 20); // 별당 20점, 최대 5개
  return 1.2 ** stars; // 지수 진행
}
```

이 계수들은 매 `processGame` 시작 때 캐릭터 스탯에 적용돼요. Kazuma는 플레이어 전체 레벨을 따르고, 나머지 셋은 각자 XP와 레벨이 있어요. 호감도(캐릭터 관련 드롭을 회수해서 얻어요)는 스탯을 독립적으로 곱해요.

![치유](/images/konosuba-rpg/shot_07_heal.webp)

드롭 시스템은 난이도별 가중 전리품 표를 써요.

```typescript
const LOOT_TABLE_BY_DIFFICULTY: Record = {
  [MonsterDifficulty.Easy]: {
    baseRolls: 2, bonusRollChance: 0.1, maxBonusRolls: 2,
    rarityWeights: [
      { rarity: Rarity.Bronze, weight: 68 },
      { rarity: Rarity.Silver, weight: 25 },
      { rarity: Rarity.Gold,   weight: 6  },
      { rarity: Rarity.Epic,   weight: 1  },
    ],
  },
  // ...Legendary까지
};
```

---

## 테스트

세 모음: 단위, 성능, 누수.

누수 테스트가 특히 직접적이에요.

```typescript
// leaks.spec.ts
it('does not show strong heap growth across repeated runs', async () => {
  global.gc();
  const before = heapUsedMb();

  for (let i = 0; i < 1200; i++) {
    await processGame(new Random(), ['ATK', 'DEF', 'HUG', 'ATK', 'DEF'], 'Dragon', Lang.English);
  }

  global.gc();
  const after = heapUsedMb();
  expect(after - before).toBeLessThan(20); // 힙 증가 최대 20MB
});
```

`processGame` 1200번 반복, 전후 강제 GC, 힙 차이 20MB 미만. 이 테스트를 통과하면 `processGame`은 새지 않아요. 렌더 테스트(`renderImage.spec.ts`)는 실용 임계값 아래 실행 시간을 확인해요.

파이프라인 전체를 프로파일하는 `bench.ts` 스크립트도 있어요.

```
RENDER_PERF=1 npx tsx bench.ts --runs=20 --warmup=3 --monster=Dragon
```

`RENDER_PERF=1`이면 각 서비스의 `withPerf` 래퍼가 타이밍을 로그해요.

```typescript
export async function withPerf(scope: string, label: string, work: () => Promise): Promise {
  const perf = createPerfLogger(scope);
  if (!perf.enabled) return work(); // 끄면 오버헤드 제로
  perf.mark(`${label}:start`);
  try { return await work(); }
  finally { perf.done(`${label}:done`); }
}
```

`DEV_MODE`와 `RENDER_PERF`가 `1`이 아니면 `createPerfLogger`는 no-op을 돌려줘요. 프로덕션 오버헤드 없어요.

---

## 돌리는 비용

- **Vercel 무료 티어**: 월 대역폭 100GB, 서버리스 호출 100만 회. 이미지 렌더가 호출 하나로 쳐요.
- **Cloudflare Workers 무료 티어**: 하루 요청 10만 건, 요청당 CPU 시간 10ms (렌더가 Workers에서 이를 넘을 수 있어서 Vercel이 주예요).
- **Supabase 무료 티어**: 자료 500MB, 대역폭 5GB. 수천 플레이어에 충분해요.

상당한 규모까지 백엔드 전체가 비용 제로로 돌아요. 유일한 마찰 지점은 Cloudflare Workers CPU 한도예요. WASM 때문에 이미지 렌더가 CPU 집약적이라서, Vercel을 주로 쓰고 Workers를 페일오버 CDN으로 쓰는 전략이에요.

---

## 기억할 3가지

1. **게임 상태로서의 URL**은 그저 멋진 잔꾀가 아니에요. Discord가 강제하는 제약(버튼 100자 한도)이 RLE 압축 + 폴백 세션 토큰의 무상태 아키텍처를 강제했어요. 제약이 설계를 정했어요.

2. **명시적 해제가 있는 WASM 캐시**: `PhotonImage`은 JavaScript 힙 밖에 할당하고 `.free()` 없이는 절대 GC되지 않아요. LRU 제거에 `freePhoton`을 붙이는 것이 JavaScript의 RAII예요. 코드에서 은근하지만, 이것이 없으면 워커가 프로덕션에서 새요.

3. **WebSocket 없는 서버리스 Discord 봇**: WebSocket 게이트웨이 방식보다 덜 알려졌지만, 무상태 처리(각 인터랙션이 독립적)를 하는 봇에는 Interactions Endpoint가 엄격히 우월해요. 재연결도 없고, 하트비트도 없고, 유지할 프로세스도 없어요. Discord가 자기 인프라 쪽 가용성을 맡아요.

---

*저장소: [fox3000foxy/konosuba-rpg](https://github.com/fox3000foxy/konosuba-rpg)*

*커스텀 소스어베일러블 라이선스: 재배포 금지, 사용 무료.*
