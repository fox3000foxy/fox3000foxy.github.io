---
itle: "100% 서버리스 Discord 봇: Hono + Cloudflare Workers"
description: 월 50€나 들던 Discord 봇을 0원으로 교체한 방법 -- 인터랙션 엔드포인트, Hono, Workers, 실시간
  이미지 렌더링, WebSocket 없는 완전한 게임.
date: 2026-05-29authors:
  - fox3000foxy
tags:
  - discord
  - cloudflare
  - serverless
  - typescript
  - bots
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "/SnZnu/TsTGICytHAQq0f/DM5xNlgQDpSlwqm4egqc/EkFgIQaCw5JNjtFq3qyjLtaPFP9D625GsuKtsXFDW/w=="
---

## Discord bot 100% serverless: Hono + Cloudflare Workers = 💸 제로

내 개인 서버에서 일반 Discord 봇 돌리다가 몇 달을 버텼어.

WebSocket 계속 연결된 상태. 새벽 3시마다 봇이 알아서 재접속. 양을 이상하게 쳐다봤다고 봇이 팡 터짐. 요금은 계속 올라가고.

어느 날 깨달았어: **왜 연결을 유지해야 하는데**? Discord가 니가 관심 있는 것만 POST로 보내주면 되잖아. 니가 응답하면 끝.

2021년부터 Discord는 **interaction endpoints**를 제공하고 있어.

그냥 HTTP야. WebSocket 없음. 상태 저장 없음. 요청 받고, JSON 보내고, 끝. 다음 요청은 알아서 옴.

그리고 최고: Cloudflare Workers는 **무료**임, 하루 10만 요청까지. 90% 봇은 한 달에 0€임.

이 글은 **Hono** (초경량 웹 프레임워크)랑 **Cloudflare Workers**로 WebSocket 없이 Discord 봇 만드는 법을 알려줄 거야. 실제 프로젝트 두 개를 보여줄게: **Nibi** (일본어 학습 봇, TTS, 짱)랑 **Konosuba-RPG** (실시간 이미지 렌더링 있는 _완전체_ Discord 게임 xD).

## WebSocket vs Interaction Endpoints: 왜 별로였는가

니가 게임 안 할 때도 연결을 계속 열어둬야 하는 Minecraft 서버를 상상해봐.

그리고 서버가 터질 때마다 자동으로 재접속함. 타임아웃 처리해야 하고, 지수 백오프 재접속 해야 하고, 우리가 다 좆같아하는 boilerplate를 다 처리해야 해. 그냥 interaction 받으려고.

Interaction endpoints는 반대야. Discord가 니 URL로 POST함. 니가 응답함. 끝.

서버가 터지면? Discord가 2-3번 재시도하고 넘어감. 노 드라마.

**전 비용**: Heroku에서 Node 프로세스 하나 살리려고 한 달에 50€.

**후 비용**: Cloudflare에서 하루 10만 요청까지 한 달에 0€.

## 아키텍처: 대체 뭔데?

Discord가 니 endpoint로 요청을 POST함.

```plaintext
Discord: "야! 유저가 /ping 눌렀어!"
      ↓
   니 URL (Cloudflare Worker)
      ↓
   진짜 Discord가 보낸 건지 확인 (서명 검증)
      ↓
   interaction 타입 파싱
      ↓
   핸들러 실행
      ↓
   JSON 반환
      ↓
Discord: "좋아, 이걸 유저한테 보여줄게"
```

순수 HTTP임. 마법 없음. 무거운 라이브러리 없음.

## Hono + Cloudflare Workers: 지갑을 지키는 조합

**Hono**는 12KB짜리 웹 프레임워크야. 어디서든 돌아감: Cloudflare Workers, Vercel, AWS Lambda, Deno, Bun... 같은 코드가 어디서든 돌아감.

Cloudflare Workers는 엣지에서 계산하는 거야. 니 요청이 제일 가까운 서버로 감. 응답 시간: \<100ms. 비용: 하루 10만 요청까지 무료.

Hono + Cloudflare 조합은 Discord 봇에 완벽함.

전체 봇의 최소 코드는 이거야:

```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. 헤더 가져오기
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. 진짜 Discord인지 확인 (스팸 아님)
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3. 받은 거 파싱
  const interaction = JSON.parse(body);

  // 4. 타입에 따라 응답
  if (interaction.type === 1) {
    // Discord 테스트 (PING)
    return c.json({ type: 1 });
  }

  if (interaction.type === 2) {
    // 슬래시 커맨드
    const name = interaction.data.name;
    if (name === 'ping') {
      return c.json({
        type: 4,
        data: { content: 'Pong!' }
      });
    }
  }

  return c.json({ type: 4, data: { content: 'Unknown command' } });
});

export default app;
```

봐봐, 30줄이고 작동하는 봇이야.

`bot.login()` 없음. event emitter 없음. callback hell 없음. 그냥 HTTP.

Cloudflare에 배포:

```plaintext
npm install -D wrangler
npx wrangler deploy
```

붐. `https://mon-bot.workers.dev/interactions` 같은 URL이 나옴.

Discord Developer Portal의 "INTERACTIONS ENDPOINT URL"에 넣으면 Discord가 거기로 interaction을 보내기 시작함.

## 서명 확인: 가짜 요청 금지

Discord는 모든 요청에 공개 키로 서명함. 서명이 잘못된 요청이 오면? 스팸임. 무시하고 계속 감.

`discord-interactions` 패키지가 처리해줌:

```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // 정확한 원본 텍스트 (JSON 파싱하면 안 됨!)
  signature,         // x-signature-ed25519 헤더
  timestamp,         // x-signature-timestamp 헤더
  publicKey          // Discord Dev Portal에서 가져옴
);
```

**중요한 함정**: 서명은 _정확한_ body에 의존함. JSON 파싱하고 다시 문자열로 만들거나, body를 로그로 찍으면 서명이 깨짐.

먼저 검증. 그 다음 파싱. 순서가 중요함.

## 사례 1: Nibi (일본어 학습 봇)

Nibi는 일본어 학습용 Discord 봇이야. 간단한 명령어:

*   `/dictionary kanji` → 정의 표시
*   `/pronounce テキスト` → TTS (text-to-speech) 생성
*   `/hello` → 환영 메시지

각 명령어는 TypeScript 파일 하나씩:

```plaintext
src/commands/
├── dictionary.ts
├── pronounce.ts
├── hello.ts
└── ...
```

명령어는 이 인터페이스를 구현함:

```typescript
interface Command {
  data: {
    name: string;
    description: string;
    options?: SlashCommandOption[];
  };
  execute(
    interaction: Interaction,
    env: Bindings
  ): Promise<InteractionResponse>;
}
```

### /pronounce 명령어: 봇 말하게 하기

이게 제일 신기해. 텍스트(로마지, 히라가나, 칸지, 뭐든)를 보내면 봇이 히라가나로 변환하고, VOICEVOX나 Google TTS로 TTS를 생성하고, Discord에 오디오 메시지를 보냄.

```typescript
const pronounce: Command = {
  data: {
    name: 'pronounce',
    description: '일본어 텍스트 TTS 생성',
    options: [
      {
        type: 3,  // STRING
        name: 'text',
        description: '발음할 텍스트',
        required: true
      }
    ]
  },

  async execute(interaction, env) {
    const text = interaction.data.options[0].value;

    try {
      // 1. Kuroshiro로 로마지 → 히라가나 변환
      const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });

      // 2. TTS 오디오 생성
      const audioBuffer = await generateTTS(hiragana);

      // 3. Discord에 파일 업로드
      const uploadFilename = await uploadToDiscord(
        audioBuffer,
        interaction.channel.id,
        env.BOT_TOKEN
      );

      // 4. 오디오와 함께 메시지 전송
      await sendVoiceMessage(
        interaction.channel.id,
        uploadFilename,
        audioBuffer.length / 16000,  // 초 단위 길이
        env.BOT_TOKEN
      );

      return {
        type: 4,
        data: { content: `"${text}" 발음` }
      };
    } catch (err) {
      return {
        type: 4,
        data: {
          content: '에러: 오디오 생성 불가 xD',
          flags: 64  // ephemeral (비공개 메시지)
        }
      };
    }
  }
};
```

미쳤지: 외부 API 호출하고, Discord에 파일 업로드하고, 파일로 메시지 보냄. 이 모든 게 WebSocket 없이, 그냥 HTTP로.

### Supabase로 데이터 유지

Nibi는 Supabase를 key-value 저장소로 씀. 유저가 등록됐는지 확인:

```typescript
const DatabaseUtils = new DatabaseUtils({
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY
});

const users = await DatabaseUtils.readJson('users');
const user = users.find(u => u.id === interaction.member.user.id);

if (!user) {
  // 유저 추가
  users.push({ id: interaction.member.user.id, verified: true });
  await DatabaseUtils.writeJson('users', users);
}
```

매우 기본적이지만 (진짜 SQL 쿼리 없이 그냥 JSON), 작동은 함. 작은 봇에는 완벽해.

## 사례 2: Konosuba-RPG (이미지 렌더링 Discord 게임)

자 이건 진짜 미친 거야.

Konosuba-RPG는 Discord 위의 **완전체 게임**이야. 몹과 싸우고, XP 얻고, 악세서리 장착하고, 레벨 업 함. 전투마다 **이미지**를 실시간으로 생성함. 미리 렌더링된 스프라이트 시트 없음. 플레이어 스탯, 몹, 전투 상태로 동적으로 이미지를 구성함.

그리고 이미지가 Cloudflare Workers에서 \<500ms만에 생성됨. 말 그대로.

### 렌더링 아키텍처

```plaintext
Discord ("Attack" 클릭)
    ↓
Cloudflare Worker가 interaction 받음
    ↓
게임 상태 업데이트 (XP, HP 등)
    ↓
Satori로 JSX 생성
    ↓
Resvg (Wasm)로 SVG → PNG 변환
    ↓
Discord에 이미지 업로드
    ↓
이미지와 함께 메시지 전송
```

이 모든 게 1초도 안 걸림. 존나 대박이야.

### Workers에서 이미지 렌더링

Konosuba는 **Satori** (JSX → SVG)랑 **Resvg** (SVG → PNG)를 씀:

```typescript
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. UI용 JSX 생성
  const jsx = (
    <div style={{ display: 'flex', gap: '20px' }}>
      <div>
        <h1>{gameState.player.name}</h1>
        <p>HP: {gameState.player.hp}/{gameState.player.maxHp}</p>
      </div>
      <div>
        <h1>{gameState.enemy.name}</h1>
        <p>HP: {gameState.enemy.hp}/{gameState.enemy.maxHp}</p>
      </div>
    </div>
  );

  // 2. JSX → SVG
  const svg = await satori.render(jsx, {
    width: 1200,
    height: 800,
    fonts: [/* ... */]
  });

  // 3. SVG → PNG
  const png = resvg.render(svg).asPng();

  return png;  // Uint8Array
}
```

평범한 JSX를 쓰면 됨. 그게 SVG가 됨. SVG가 PNG가 됨. Cloudflare Worker에서 \<100ms.

파워를 이해하겠어? 그냥... 아름다워 xD

### 게임 상태와 진행

플레이어 데이터는 Supabase에 있음:

```typescript
const player = await db
  .from('players')
  .select('*')
  .eq('discord_id', interaction.user.id)
  .single();

// 플레이어 승리
const { data: updated } = await db
  .from('players')
  .update({
    level: player.level + 1,
    xp: player.xp + xpGain
  })
  .eq('id', player.id);
```

모든 액션 (공격, 방어, 힐)이 DB에 스탯을 업데이트함. 그리고 새 스탯으로 이미지를 다시 생성함.

### 인터랙션: 게임플레이 버튼

게임은 전투 액션에 **button interaction**을 사용함:

```typescript
{
  type: 1,  // ActionRow
  components: [
    {
      type: 2,  // Button
      style: 1,  // Primary (파랑)
      label: 'Attack',
      custom_id: 'battle_attack'
    },
    {
      type: 2,
      style: 2,  // Secondary (회색)
      label: 'Defend',
      custom_id: 'battle_defend'
    }
  ]
}
```

"Attack"을 클릭하면 Discord가 `custom_id: 'battle_attack'`를 가진 interaction을 POST함. 핸들러가 이걸 라우팅:

```typescript
if (interaction.type === 3) {
  // 컴포넌트 interaction (버튼 클릭 등)
  const customId = interaction.data.custom_id;

  if (customId === 'battle_attack') {
    return await handleAttack(interaction, env);
  }
  if (customId === 'battle_defend') {
    return await handleDefend(interaction, env);
  }
}
```

그리고 붐, 데미지 계산하고, DB 업데이트하고, 이미지 다시 생성하고, 보냄.

연결 유지 하나 없이 완전한 턴제 게임임. 그냥 HTTP stateless. 완전 개쩔어 xD

## Supabase: Workers를 위해 만들어진 DB

전통적인 DB들(PostgreSQL, MySQL, MongoDB)은 지속적인 TCP 연결을 위해 설계됐어. 소켓 열고, 연결 유지하고, 쿼리 보내고. 문제: **Cloudflare Workers는 지속적인 TCP 연결을 지원하지 않음**. 각 요청은 임시 프로세스라서, 클라이언트에 응답하는 순간 Worker가 사라짐.

이런 건 안 됨:

```typescript
// 이건 Workers에서 작동 안 함
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // 지속적 TCP 연결 = 죽음
```

`pg`나 `postgres.js` 같은 네이티브 PostgreSQL 드라이버도 TCP 연결을 씀. Workers에서 죽음.

**Supabase가 다 해결함.**

Supabase는 PostgreSQL 위에 있는 REST API임. 평범한 HTTP 요청을 보내면 됨. 각 호출은 독립적이고, 지속 연결 없고, 관리할 상태도 없음. 서버리스 모델에 완벽함.

```typescript
// 이건 Workers에서 완벽하게 작동함
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

Supabase 클라이언트(`@supabase/supabase-js`)는 내부적으로 `fetch`를 씀. 그리고 `fetch`는 Workers에서 네이티브임. 설정 제로, 드라이버 제로, 지속 연결 제로.

| DB | Workers 호환? | 이유 |
| --- | --- | --- |
| **Supabase** | ✅ 예 | 무상태 REST API, 순수 HTTP |
| **PlanetScale (MySQL)** | ⚠️ 부분적 | HTTPS 전용, 긴 트랜잭션 불가 |
| **Neon** | ⚠️ 부분적 | 서버리스 브랜치지만 TCP 드라이버 필요 |
| **Turso (libSQL)** | ⚠️ 부분적 | HTTP 가능하지만 제한적 |
| **Prisma/Prisma Postgres** | ❌ 아니오 | 지속적 TCP 필요 |
| **MongoDB Atlas** | ❌ 아니오 | TCP 드라이버, 네이티브 REST API 없음 |
| **Redis (Upstash)** | ✅ 예 | HTTP 기반 REST API |

Supabase의 진짜 장점은 DB만이 아님 -- 생태계 전체가 edge-first로 설계됐다는 거:

- **Auth**: 세션용 REST API, 무상태로 작동
- **Storage**: HTTP로 파일 업로드/다운로드
- **Realtime**: 선택적 WebSocket, REST로 폴링도 가능
- **Row Level Security**: 보안 규칙이 DB에 있고, 백엔드에는 없음

서버리스 Discord 봇에는 Supabase가 가장 간단하고 믿을 수 있는 선택임. 설정할 드라이버 없음, 유지할 연결 없음, 타임아웃 없음. 그냥 HTTP 요청.

실제 예시를 보고 싶으면 위에 Nibi를 봐: 그 영속성 코드는 말 그대로 Supabase에서 `readJson()`하고 `writeJson()`임. 마이그레이션 없음, 복잡한 스키마 없음, 미친 설정 없음. 바로 작동함. 그리고 봇이 커지면, 제공자 변경 없이 진짜 SQL 쿼리로 마이그레이션 가능함.

## Polyfills: Node 라이브러리를 Workers에서 돌릴 때

어떤 패키지들은 Node API를 기대함. Kuromoji (칸지 파서)는 `XMLHttpRequest`를 씀. Workers는 `fetch`는 있어도 `XMLHttpRequest`는 없음.

간단한 해결책: index.ts 상단에 polyfill 추가:

```typescript
// kuromoji용 XMLHttpRequest 폴리필
if (!globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest = class {
    // 최소한의 스텁
  } as any;
}
```

아니면 전용 모듈로 만들기:

```typescript
// src/utils/polyfills.ts
export function setupPolyfills() {
  if (!globalThis.XMLHttpRequest) { /* ... */ }
  if (!globalThis.Buffer) { /* ... */ }
}

// src/index.ts
import { setupPolyfills } from './utils/polyfills';
setupPolyfills();
```

기본적인 핵이지만 작동은 함.

## npm 패키지로: hono-discord-interactions

수동으로 봇 만들면 boilerplate가 너무 많음:

*   Discord 서명 확인
*   interaction 타입 라우팅
*   명령어, 컴포넌트, 모달 처리
*   유효한 JSON 반환

이걸 다 npm 패키지로 추상화할 수 있음. 이런 식으로:

```typescript
import { createDiscordHandler } from 'hono-discord-interactions';

const handler = createDiscordHandler({
  publicKey: env.PUBLIC_KEY,
  commands: [
    {
      name: 'ping',
      execute: async (interaction) => ({
        type: 4,
        data: { content: 'Pong!' }
      })
    },
    {
      name: 'hello',
      execute: async (interaction) => ({
        type: 4,
        data: { content: `Hi ${interaction.member.user.username}!` }
      })
    }
  ]
});

const app = new Hono();
app.post('/interactions', handler);
export default app;
```

붐. 200줄 대신 20줄. Nibi를 절반으로 줄일 수 있음.

나중에 할 생각 xD

## 배포

### Cloudflare Workers

```plaintext
npm install -D wrangler

# wrangler.toml
[env.production]
name = "mon-bot"
main = "src/index.ts"

# Secrets
wrangler secret put PUBLIC_KEY --env production
wrangler secret put BOT_TOKEN --env production
wrangler secret put SUPABASE_URL --env production

# Deploy
wrangler deploy --env production
```

결과 URL: `https://mon-bot.workers.dev/interactions`

비용: 하루 10만 요청까지 **무료**. 초과 시: $0.50/백만.

스포일러: 사용자 10,000명 없으면 10만 요청 절대 못 넘김.

### Vercel

```plaintext
npm run vercel:deploy
```

URL: `https://mon-bot-xyz.vercel.app/api/interactions`

마찬가지로 무료.

### 둘 다 동시에

Hono는 어디서든 돌아감. 같은 코드를 Cloudflare랑 Vercel 둘 다 배포할 수 있음. 중복성이나 고르기 전에 테스트할 때 유용함.

## 빠른 체크리스트

1.  Discord Developer Portal에서 Application 만들기
2.  PUBLIC\_KEY, BOT\_TOKEN, APP\_ID 복사
3.  프로젝트 생성:
4.  index.ts 작성 (서명 확인 + 라우팅)
5.  슬래시 명령어 등록 (한 번만):
6.  배포:
7.  Discord에 URL 넣기 (Developer Portal → Application → Interactions Endpoint URL)
8.  Discord가 연결 테스트 (PING에 응답해야 함)
9.  서버에 봇 초대
10. 끝

## 장점 vs 한계

**장점**

*   싸다 (하루 10만 req까지 무료)
*   확장 가능 (연결 관리 필요 없음)
*   간단함 (WebSocket boilerplate 없음)
*   빠름 (Cloudflare = 엣지 서버)
*   이식성 좋음 (Hono 코드 = 여러 호스트)

**한계**

*   실시간 서버 이벤트 없음 (멤버 입장, 역할 추가, 메시지 삭제 등) -- interaction만 받음 (슬래시 명령어, 버튼, 모달)
*   응답 제한 3초 -- 안 하면 Discord가 "Application did not respond" 띄움
*   진짜 이벤트가 필요하면 -- 별도 HTTP webhook이나 보조 WebSocket 연결 필요

90% 봇 (슬래시 명령어 기반)이면? 충분함.

## 마무리

KonosubaRPG랑 Nibi 최적화하는 데 꽤 시간을 썼어. 요청을 최대한 줄이거나, 핫 프로세스 시간을 줄이거나, 콜드 부트를 줄이려고. 결과적으로 거의 모든 면에서 쩌는 성능을 냈어.
내 VM에 계속 호스팅하기가 귀찮아서 프로젝트들을 cloud화하기 시작했거든 (이 말이 맞는지도 모르겠다 xD). 진짜, Github Actions가 내 엉덩이를 구했어. Workers도 좋지만, Github Actions로 스케줄된 데몬을 만들 수 있다는 걸 알았을 때 진짜 살았어.

아마 [email-autoreply](https://github.com/fox3000foxy/email-autoreply/)라는 프로젝트에 대한 글도 쓸 거니까 RSS 피드 구독하고 기다려줘 :))

**기억할 3가지:**

1.  **Interaction endpoints = serverless HTTP** -- WebSocket 없음, 지속 연결 없음. Discord가 POST하고 니가 응답함. Cloudflare에서 무료.
2.  **Hono가 완벽한 도구임** -- 가벼운 프레임워크 (12KB), 멀티 런타임, 의존성 제로. Cloudflare, Vercel, Node, 어디서든 같은 코드.
3.  **Workers에서 이미지 렌더링 = 미쳤음** -- Satori + Resvg (Wasm)로 JSX로 동적 UI를 구성하고 \<100ms만에 PNG로 변환. 완전한 게임이 이걸로 돌아감.

존나 쩔어 xD

```plaintext
wrangler deploy
```

```plaintext
npm run register-commands
```

```plaintext
npm init -y
npm install hono discord-interactions
npm install -D wrangler typescript
```
