---
title: "주말 동안 konosuba-rpg 코드를 읽고 알게 된 것들"
description: "턴제 Discord RPG로, 각 액션마다 WebP 이미지를 실시간 생성합니다: URL을 게임 상태로 사용, 결정론적 RNG, WASM 파이프라인, 5단계 캐시, 서버리스 봇."
date: 2026-06-10
authors:
  - fox3000foxy
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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "S0cyDs21Ij7HOVUUJyqB3EsPmxpyTOhPfGGkA75CoPNqov00IxeMsE4pzcLtzoOghY4tpMW7TQX0pKUaittIeA=="
---

# 주말 동안 konosuba-rpg 코드를 읽고 알게 된 것들

한동안 이 프로젝트를 유지해왔지만, 자신의 코드를 차분히 다시 읽는 것은 항상 유익합니다. konosuba-rpg는 턴제 Discord RPG로, 각 액션이 실시간으로 WebP 이미지를 생성합니다. 텍스트 embed가 아닙니다. 스프라이트, HP바, 전투 메시지 등 모든 것이 포함된 실제 합성 이미지입니다.

스택: TypeScript, Hono, Vercel, Cloudflare Workers, Supabase. 완전 무료 호스팅입니다. Discord 봇은 영구 서버 없이 작동합니다. 이 글은 이 모든 것이 어떻게 함께 작동하는지 설명합니다.

![게임 초기 상태](/images/konosuba-rpg/game_init.webp)

---

## 기본 설계: URL을 게임 상태로 사용

가장 먼저 눈에 띄는 점: 게임플레이를 위한 서버 측 상태가 전혀 없습니다. 전투의 전체 상태가 URL에 담겨 있습니다.

```
/konosuba-rpg/fr/abc123/ATK/DEF/ATK/HUG?monster=Vanir&difficulty=hard
```

seed 이후의 각 세그먼트는 수행된 액션입니다. 서버는 이 URL을 받아 처음부터 다시 시작하여 모든 액션을 순서대로 재생하고, 그 순간의 전투 이미지를 반환합니다. 세션도, 사용자별 RAM 상태도 없습니다.

Discord는 인터랙티브 버튼으로 작동합니다 -- 플레이어가 "공격"을 누르면 Discord가 버튼의 `custom_id`를 서버로 전송합니다. 이 custom_id에는 새 액션이 추가된 압축된 전투 URL이 포함되어 있습니다. 서버는 모든 것을 처음부터 다시 계산하고 업데이트된 이미지를 반환합니다.

```typescript
// processUrl.ts
const VALID_MOVES_SET = new Set(["ATK", "DEF", "HUG", "HEA", "SPE", "USE"]);
// Précompilé hors fonction -- pas recréé à chaque appel

export default function processUrl(url: string): [Random, string[], string, string | null, string | null] {
  const urlParts = url.split("/");
  const moves: string[] = [];
  for (const part of urlParts) {
    if (VALID_MOVES_SET.has(part.toUpperCase())) moves.push(part.toUpperCase());
  }
  // seed = 6ème segment, haché sur 8096 valeurs
  const seedStr = (urlParts[5] || "").toLowerCase();
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed + seedStr.charCodeAt(i)) % 8096;
  }
  return [new Random(seed), moves, seedStr, monster, difficulty];
}
```

함수 밖에 미리 컴파일된 `Set`은 세부 사항이지만, 모듈이 재평가될 수 있는 edge 컨텍스트에서 매 호출마다 구조를 재구성하는 것을 방지합니다.

### RNG: 수정된 RC4

난수 생성기는 스트림 암호화 알고리즘인 RC4 구현을 PRNG로 변용한 것입니다.

```typescript
export class Random {
  private S: number[]; // table de 256 entrées
  private i: number;
  private j: number;

  constructor(seed?: number) {
    this.S = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    let workingSeed = seed || Date.now();
    for (let i = 0; i < 256; i++) {
      j = (j + this.S[i] + (workingSeed & 0xff)) & 0xff;
      // swap S[i] et S[j]
      [this.S[i], this.S[j]] = [this.S[j], this.S[i]];
      workingSeed >>>= 8;
    }
  }

  next(): number { /* ... */ }
  randint(min: number, max: number): number { /* ... */ }
  choice(array: T[]): T { /* ... */ }
}
```

왜 RC4일까요? 올바른 분포와 합리적인 seed 충돌 저항성을 가진 결정론적 PRNG이기 때문입니다. 동일한 seed = 동일한 숫자 시퀀스 = 매번 동일한 전투입니다. URL을 보존하여 모든 전투를 "재생"할 수 있으며, 두 개의 다른 서버(Vercel + Cloudflare)가 동일한 URL에 대해 정확히 동일한 결과를 생성함을 보장합니다.

---

## Discord의 100자 제한 문제

Discord는 버튼의 `custom_id`에 100자 제한을 둡니다. 수십 번의 액션 후에는 전투 URL이 이 제한을 쉽게 초과합니다.

두 가지 메커니즘이 이에 대응합니다.

### 1. 액션의 RLE 압축

액션은 단일 문자(`a`=attack, `d`=defend, `h`=hug...)로 인코딩되고 run-length encoding으로 압축됩니다:

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

간단하지만, 플레이어가 공격을 10번 연속하면 `aaaaaaaaaa`(10자)에서 `a10`(3자)으로 줄어듭니다. UI에 "x4 공격"과 "x10 공격" 버튼이 있는 이유가 바로 이것입니다 -- 전투를 가속화하면서 페이로드도 잘 압축합니다.

### 2. 압축이 충분하지 않을 때의 세션 토큰

압축된 페이로드가 여전히 너무 길면, 짧은 토큰과 함께 데이터베이스에 저장됩니다:

```typescript
// gameSessionService.ts
const TOKEN_PREFIX = "gs.";
const TOKEN_SIZE = 10; // "gs.aBcDeFgHiJ"

export async function encodeGameplayButtons(buttons: RawButton[]): Promise {
  // Groupe les payloads par battle_key, insère en batch dans Supabase
  // Remplace le custom_id par "gs.{token}:{userId}"
}

export async function decodeGameplayPayloadWithStatus(encodedPayload: string, userID: string) {
  if (!encodedPayload.startsWith(TOKEN_PREFIX)) {
    return { payload: encodedPayload }; // Pas de lookup si pas nécessaire
  }
  // Lookup en mémoire d'abord, puis Supabase si absent
  const cached = tokenToSession.get(token) || await loadTokenRowByToken(token);
  // Vérifie ownership, TTL (7 jours), et turn_version (évite de rejouer un ancien état)
}
```

세션은 7일의 TTL과 10분마다 자동 정리(pruning)가 있습니다. `turnVersion` 검사는 플레이어가 게임을 진행했을 때 오래된 상태를 재생하는 것을 방지합니다 -- 의도치 않은 "되돌리기"에 대한 미묘한 보호 장치입니다.

두 메모리 내 Map(`tokenToSession`, `latestTurnByBattle`)은 이미지 캐시와 동일한 `globalThis as unknown as GameSessionGlobals` 패턴을 사용하며, 그 이유는 아래에서 살펴보겠습니다.

---

## 이미지 렌더링 파이프라인

![슬라임과의 전투 시작](/images/konosuba-rpg/shot_01_start.webp)

`/konosuba-rpg/:lang/*` 라우트는 JSON을 반환하지 않습니다. 요청 시 생성된 WebP 이미지를 반환합니다.

파이프라인은 3개의 합성 레이어로 구성됩니다:

```
Background (board + frame)
    +
Characters layer (sprites joueurs + mob, positions fixes)
    +
UI overlay (barres HP, messages, icônes persos via Satori → SVG → PNG)
    ↓
Photon.watermark() × 2
    ↓
WebP output
```

**Background**: 두 개의 고정 이미지(보드판과 프레임)로, 파일시스템에서 로드되어 한 번 합성됩니다.

**Characters layer**: 스프라이트는 계산된 좌표에 따라 배치됩니다. 죽은 플레이어는 제외됩니다(`activeSlots = slots.filter(s => playerHp[s.i] > 0)`). 적 스프라이트는 커스텀 `flipX`로 수평 미러링됩니다 -- 외부 의존성 대신 픽셀 단위 루프를 사용합니다.

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

**UI overlay**: 무거운 부분입니다. 인터페이스(HP바, 텍스트, 아이콘)의 JSX는 Satori로 React-like하게 기술되고, SVG로 렌더링된 후, `@cf-wasm/resvg`로 PNG로 변환되어 최종 합성을 위해 Photon으로 가져옵니다. Satori + resvg는 `edge-light` 플래그로 Cloudflare Workers용으로 특별히 컴파일된 두 WASM 모듈입니다.

![방어 액션](/images/konosuba-rpg/shot_03_defend.webp)

![전투 진행 중](/images/konosuba-rpg/shot_02_combat.webp)

![포옹 액션](/images/konosuba-rpg/shot_04_hug.webp)

---

## 캐시 시스템 -- 가장 공들인 부분

5개의 별도 캐시 레벨이 있습니다. 각각은 파이프라인의 다른 세분화 수준을 대상으로 합니다.

```typescript
// renderImage.ts -- tous sur globalThis
G.__imageCache  ??= {} as Record; // assets bruts
G.__base64Cache ??= {} as Record;       // base64 des assets (pour Satori)
G.__fontCache   ??= {} as Record; // polices
G.__photonCache    ??= new LRUCache(40, freePhoton);
G.__layerCache     ??= new LRUCache(12, freePhoton);
G.__uiPhotonCache  ??= new LRUCache(30, freePhoton);
G.__renderOutputCache ??= new LRUCache(120);
```

`globalThis`의 `??=` 패턴: edge worker의 JavaScript 모듈은 특정 설정에서 요청 간에 재평가될 수 있습니다. `??=`로 `globalThis`에 캐시를 저장하면 재생성되지 않고 이러한 재평가에서 살아남을 수 있습니다.

### WASM 제거(Eviction)

Photon 이미지 캐시(`photonCache`, `layerCache`, `uiPhotonCache`)는 제거 콜백을 사용합니다:

```typescript
function freePhoton(_key: string, img: Photon.PhotonImage): void {
  try { img.free(); } catch { /* déjà libéré */ }
}

new LRUCache(40, freePhoton)
```

`Photon.PhotonImage`는 JavaScript GC 외부의 WASM 선형 메모리에 할당된 WASM 객체입니다. 명시적인 `.free()` 호출 없이는 이 메모리가 해제되지 않습니다. LRU 제거가 자동으로 `.free()`를 트리거합니다 -- JavaScript로 구현된 RAII입니다.

### 캐시 키는 의도적으로 손실(lossy)이 있습니다

```typescript
function buildCharactersKey(playerImages: string[][], playerHp: number[], creatureImages: string[], creatureHp: number): string {
  const players = playerImages.map((imgs, i) => `${imgs[0]}:${playerHp[i] > 0 ? 1 : 0}`).join("|");
  return `chars::${players}::${creatureImages[0]}:${creatureHp > 0 ? 1 : 0}`;
}
```

characters layer의 키는 정확한 HP 값을 인코딩하지 않습니다 -- `1`(생존) 또는 `0`(사망)만 있습니다. 40 HP의 플레이어 스프라이트와 15 HP의 플레이어 스프라이트는 동일하기 때문입니다. 따라서 아무도 쓰러지지 않는 한 캐시 히트는 모든 피해에 대해 유지됩니다.

반면 UI 키는 정확한 HP(HP바는 매 타격마다 변경됨)와 메시지 해시를 인코딩합니다:

```typescript
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0; // entier 32-bit signé
  }
  return hash.toString(16);
}
```

`Math.imul`는 곱셈을 32비트 정수로 강제하여 float64 변환을 피하고 안정적인 다항식 해시를 제공합니다. 이를 위한 외부 의존성은 없습니다.

### 스택 오버플로우 없는 base64 변환

```typescript
function getBase64Cached(key: string, buf: ArrayBuffer): string {
  if (base64Cache[key]) return base64Cache[key];
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000; // 32768 octets
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  const b64 = btoa(binary);
  base64Cache[key] = b64;
  return b64;
}
```

`String.fromCharCode(...largeArray)`는 인수가 콜 스택에 전달되므로 큰 이미지에서 스택 오버플로우를 일으킬 수 있습니다. 32KB 청킹이 이를 방지합니다. 결과는 캐시됩니다 -- 동일한 이미지의 base64 변환은 worker 인스턴스당 한 번만 수행됩니다.

---

## STRIPPER.md -- 순차적 await 감사

레포지토리에 `await` 병렬화 감사를 문서화한 `STRIPPER.md` 파일이 있습니다. 기록된 몇 가지 예시:

- 플레이어 프로필 로딩이 3개의 Supabase 요청을 직렬로 수행했습니다(진행 상황, 실행 요약, 업적). 의존성이 없어 `Promise.all`로 변경되었습니다.
- 전투 종료 보상(장비 + 소모품) 분배가 순차적이었습니다. 마찬가지로 병렬화되었습니다.
- 버튼용 세션 토큰 생성이 그룹별로 이루어졌습니다. 이제 독립적인 그룹은 병렬로 생성됩니다.

```typescript
// progressionService.ts -- avant (séquentiel)
await grantAccessoryDropRewards(...);
await grantConsumableDropRewards(...);

// après
await Promise.all([
  grantAccessoryDropRewards(...),
  grantConsumableDropRewards(...),
]);
```

혁신적인 것은 아니지만, 응답 시간의 모든 밀리초가 비용으로 청구되거나(콜드 스타트에 기여하는) 서버리스 컨텍스트에서는 중요합니다.

---

## 영구 서버 없는 Discord 봇

![승리](/images/konosuba-rpg/shot_05_win.webp)

자주 오해되는 점: Discord 봇이 반드시 영구 WebSocket 연결을 필요로 하지는 않습니다. Discord는 대안을 제공합니다: **Interactions Endpoint URL**. Discord에 HTTPS URL을 제공하면, Discord가 각 상호작용(슬래시 명령어, 버튼, 자동완성)마다 POST를 보냅니다.

```typescript
// interactions.ts
export async function handleInteractions(c: Context) {
  const body = await c.req.text();
  const isVerified = await verifySignature(c, body); // Ed25519
  if (!isVerified) return c.text("Invalid signature", 401);

  const interaction: Interaction = JSON.parse(body);
  if (interaction.type === 1) return c.json({ type: 1 }); // ping Discord
  if (interaction.type === 2) return handleSlashCommand(...);
  if (interaction.type === 3) return handleButtonInteraction(...);
  if (interaction.type === 4) return handleAutocomplete(...);
}
```

Discord가 POST를 보내면, 핸들러가 Vercel 함수나 Cloudflare Worker에서 50-200ms 동안 실행되고 응답한 후 종료됩니다. 유지해야 할 영구 연결도, 켜두어야 할 서버도 없습니다. Discord 봇 전체가 Vercel 무료 티어에서 호스팅됩니다.

Ed25519 검증(`discord-interactions`의 `verifyKey`)은 필수입니다 -- Discord가 헤더에 서명을 보내며, 이를 검증하지 않으면 엔드포인트를 거부합니다.

### 특수 애니메이션 -- 유일한 의도적인 await

```typescript
// handleSpecialButton.ts
await new Promise(resolve => setTimeout(resolve, 3000)); // 3 secondes
await fetch(`${DISCORD_API_URL}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
  method: "PATCH",
  // ...
});
```

이 3초의 의도적인 지연은 STRIPPER.md에 의도적이라고 문서화되어 있습니다. Megumin의 특수 공격(Explosion)은 Discord 측에서 애니메이션이 있습니다 -- 메시지가 먼저 중간 시각 효과로 업데이트된 후, 3초 후에 결과로 변경됩니다. Vercel 함수가 의도적으로 필요 이상으로 오래 실행되는 유일한 경우입니다.

![특수 공격](/images/konosuba-rpg/shot_08_special.webp)

---

## 두 플랫폼에서의 배포 가능성

동일한 코드베이스가 수정 없이 Vercel(Node.js)과 Cloudflare Workers(V8 isolates)에서 실행됩니다:

```typescript
// worker.ts -- entrypoint Cloudflare
export default {
  fetch(request: Request, env: WorkerBindings): Promise {
    syncBindingsToProcessEnv(env); // injecte les secrets CF dans process.env
    return app.fetch(request, env, ctx);
  }
};

// index.ts -- entrypoint Vercel/Node
const isVercelRuntime = process.env.VERCEL === "1";
if (!isVercelRuntime) { start(); }
```

주요 차이점: 정적 에셋입니다. Vercel에서는 파일시스템(`/var/task/assets/`)에서 읽습니다. Cloudflare Workers에서는 HTTPS 미러(`fox3000foxy.com/konosuba-rpg/assets`)로 폴백되는 `ASSETS` 바인딩(CF 정적 에셋)을 통해 전달됩니다. `assetLoader.ts`의 `getAssetBytes`는 먼저 파일시스템을 시도한 후 fetch를 시도하여 두 경로를 모두 처리합니다.

WASM(`@cf-wasm/photon/edge-light`, `@cf-wasm/resvg`)은 각 런타임에 대해 별도의 빌드가 있습니다. 패키지 이름의 `edge-light` 플래그는 Cloudflare Workers 호환 빌드를 나타내며, 런타임에 `new WebAssembly.Module()`을 허용하지 않습니다 -- WASM은 사전 컴파일되어야 합니다.

---

## 진행 시스템: XP, 레벨, 친화도

![보스, HP 650](/images/konosuba-rpg/shot_06_boss.webp)

메타 진행 시스템은 Supabase 무료 티어를 기반으로 합니다. 스키마에는 `players` 테이블(전체 XP, 레벨, 골드), `character_progress`(Darkness, Aqua, Megumin의 캐릭터별 XP/레벨/친화도), `runs`(전투 기록), `inventory_items`, `daily_quests_progress`, `achievements_unlocked`, `game_sessions`이 포함됩니다.

진행 모델은 간단합니다:

```typescript
// characterService.ts
export function computeLevelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1; // 100 XP par niveau
}

export function getLevelFactor(level: number): number {
  return 1 + 0.2 * (level - 1); // +20% stats par niveau
}

export function getAffinityFactor(affinity: number): number {
  const stars = Math.floor(affinity / 20); // 20 points par étoile, 5 étoiles max
  return 1.2 ** stars; // progression exponentielle
}
```

이 계수들은 각 `processGame` 시작 시 캐릭터 스탯에 적용됩니다. Kazuma는 플레이어의 전체 레벨을 따르고, 나머지 세 캐릭터는 각각 고유한 XP/레벨을 가집니다. 친화도(캐릭터와 관련된 드롭 획득으로 얻음)는 해당 캐릭터의 스탯을 독립적으로 곱합니다.

![회복](/images/konosuba-rpg/shot_07_heal.webp)

드롭 시스템은 난이도별 가중치가 적용된 전리품 테이블을 사용합니다:

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
  // ...jusqu'à Legendary
};
```

---

## 테스트

세 가지 테스트 스위트: 유닛 테스트, 성능 테스트, 메모리 누수 테스트.

누수 테스트는 특히 직접적입니다:

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
  expect(after - before).toBeLessThan(20); // max 20MB de croissance heap
});
```

`processGame` 1200회 반복, 전후 강제 GC, 힙 델타 < 20MB. 이 테스트가 통과하면 `processGame`에 메모리 누수가 없는 것입니다. 렌더 테스트(`renderImage.spec.ts`)는 실용적인 임계값 미만의 실행 시간을 확인합니다.

전체 파이프라인을 프로파일링하는 `bench.ts` 스크립트도 있습니다:

```
RENDER_PERF=1 npx tsx bench.ts --runs=20 --warmup=3 --monster=Dragon
```

`RENDER_PERF=1`로 설정하면 각 서비스의 `withPerf` 래퍼가 타이밍을 로깅합니다:

```typescript
export async function withPerf(scope: string, label: string, work: () => Promise): Promise {
  const perf = createPerfLogger(scope);
  if (!perf.enabled) return work(); // zero overhead si désactivé
  perf.mark(`${label}:start`);
  try { return await work(); }
  finally { perf.done(`${label}:done`); }
}
```

`createPerfLogger`는 `DEV_MODE`와 `RENDER_PERF`가 `1`로 설정되지 않으면 no-op을 반환합니다. 프로덕션에서 오버헤드가 없습니다.

---

## 운영 비용

- **Vercel free tier**: 월 100GB 대역폭, 100만 회 서버리스 호출. 이미지 렌더링도 한 번의 호출로 계산됩니다.
- **Cloudflare Workers free tier**: 일 10만 건 요청, 요청당 10ms CPU 시간 (렌더링이 Workers에서 이를 초과할 수 있어 Vercel을 기본으로 사용).
- **Supabase free tier**: 500MB 데이터베이스, 5GB 대역폭. 수천 명의 플레이어에게 충분합니다.

전체 백엔드는 상당한 트래픽이 발생하기 전까지 무료로 운영됩니다. 유일한 문제점은 Cloudflare Workers의 CPU 제한입니다 -- WASM으로 인해 이미지 렌더링이 CPU 집약적이므로, Vercel을 기본으로 하고 Workers를 장애 조치 CDN으로 사용하는 전략입니다.

---

## 기억할 가치가 있는 3가지

1. **URL을 게임 상태로 사용**하는 것은 단순한 재미있는 트릭이 아닙니다 -- Discord(버튼의 100자 제한)에 의해 부과된 제약이 RLE 압축 + 폴백으로서의 세션 토큰을 사용한 무상태 아키텍처를 강제했습니다. 제약이 설계를 결정했습니다.

2. **명시적 제거가 있는 WASM 캐시**: `PhotonImage`는 JavaScript 힙 외부에 할당되며 `.free()` 없이는 GC되지 않습니다. LRU 제거에 `freePhoton`을 연결하는 것은 JavaScript에서의 RAII입니다. 코드에서 눈에 띄지 않지만, 이것 없이는 프로덕션에서 worker가 메모리 누수됩니다.

3. **WebSocket 없는 서버리스 Discord 봇**: WebSocket 게이트웨이 방식보다 덜 알려져 있지만, 무상태 처리를 하는 봇(각 상호작용이 독립적)의 경우 Interactions Endpoint가 엄격히 우수합니다 -- 재연결, 하트비트, 유지해야 할 프로세스가 없습니다. Discord가 인프라 측에서 가용성을 관리합니다.

---

*레포지토리: [fox3000foxy/konosuba-rpg](https://github.com/fox3000foxy/konosuba-rpg)*

*라이선스: 소스 공개 커스텀 -- 재배포 불가, 자유롭게 사용 가능.*
