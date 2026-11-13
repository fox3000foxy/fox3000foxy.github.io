---
title: "Discord 봇 100퍼센트 서버리스: Hono + Cloudflare Workers"
description: 월 50유로 들던 Discord 봇을 0유로로 바꾼 방법. 인터랙션 엔드포인트, Hono, Workers, 실시간 이미지 렌더링, WebSocket 없는 완전한 게임.
date: 2026-05-29
tags:
  - discord
  - cloudflare
  - serverless
  - typescript
  - bots
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "O59kABejKhfoT/PdjtEkfzY2naVVtRhLTCRNH9F+8mN/ng/wkP7kfQ35DQxO4avZtqgRgkGySsj4o+mE4+NFKQ=="
---

## Discord 봇 100퍼센트 서버리스: Hono + Cloudflare Workers = 💸 0원

제 기기에서 고전 Discord 봇들을 몇 달 유지했어요.

항상 열린 WebSocket 연결. 새벽 3시에 혼자 다시 연결하는 봇. 제가 양을 삐딱하게 본다고 죽는 봇. 청구서가 올라가요.

어느 날 깨달았어요. **왜 연결을 유지해야 하지**? Discord가 관심 있는 이벤트만 POST로 보내줄 수 있잖아요. 답장하면 끝이에요.

2021년부터 Discord는 **인터랙션 엔드포인트**를 제공해요.

그냥 HTTP예요. WebSocket 없이, 영속 상태 없이 일해요. 요청을 받고 JSON을 보내면 끝이에요. 다음 요청은 혼자 와요.

그리고 최고예요. Cloudflare Workers는 하루 10만 요청까지 **무료**예요. 90퍼센트의 봇에게는 월 0유로예요.

이 글에서는 **Hono**(초경량 웹 프레임워크)와 **Cloudflare Workers**로 WebSocket 없는 Discord 봇을 만드는 법을 보여줘요. 실제 프로젝트 둘을 보여드릴게요. **Nibi**(일본어 학습 봇, TTS, 멋져요)와 **Konosuba-RPG**(실시간 이미지 렌더링이 있는 완전한 Discord 게임)예요.

## WebSocket 대 인터랙션 엔드포인트: 왜 나쁜 생각이었는지

놀지 않을 때도 연결을 열어 두어야 하는 Minecraft 게임을 상상해 보세요.

그리고 서버는 죽을 때마다 자동으로 다시 연결돼요. 타임아웃과 지수 재접속, 우리가 싫어하는 온갖 상용구 코드를 다뤄야 해요. 인터랙션을 받는 것만 위해서요.

인터랙션 엔드포인트는 반대예요. Discord가 여러분 URL에 POST해요. 답장해요. 끝이에요.

서버가 죽으면요? Discord가 2-3번 재시도하고 넘어가요. 드라마 제로예요.

**전 비용**: Node 프로세스 하나를 살려 두려고 Heroku에 월 50유로.

**후 비용**: 하루 10만 요청까지 Cloudflare에서 월 0유로.

## 아키텍처: 정확히 뭔가요?

Discord가 여러분 엔드포인트에 요청을 POST해요.

```plaintext
Discord: "야! 사용자가 /ping을 눌렀어!"
      ↓
여러분 URL (Cloudflare Worker)
      ↓
정말 Discord인지 확인해요 (서명 검사)
      ↓
인터랙션 종류를 파싱해요
      ↓
핸들러를 실행해요
      ↓
JSON을 돌려줘요
      ↓
Discord: "좋아, 사용자에게 보여줄게"
```

순수 HTTP에 최소한의 읽기 쉬운 스택이에요.

## Hono + Cloudflare Workers: 알뜰 조합

**Hono**는 12KB 웹 프레임워크예요. 어디서든 돌아요. Cloudflare Workers, Vercel, AWS Lambda, Deno, Bun... 코드가 어디서나 같아요.

Cloudflare Workers는 엣지 컴퓨팅이에요. 요청이 가장 가까운 서버에 닿아요. 응답 시간 100ms 미만. 비용은 하루 10만 요청까지 무료예요.

Hono와 Cloudflare 조합은 Discord 봇에 완벽한 매치예요.

완전한 봇의 최소 코드는 이렇습니다.

```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. 헤더를 가져와요
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. 정말 Discord인지 확인해요 (스팸이 아니에요)
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3. 보낸 것을 파싱해요
  const interaction = JSON.parse(body);

  // 4. 종류에 따라 답장해요
  if (interaction.type === 1) {
    // Discord 테스트 (PING)
    return c.json({ type: 1 });
  }

  if (interaction.type === 2) {
    // 슬래시 명령어예요
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

동작하는 봇에 30줄이면 충분해요.

`bot.login()`과 이벤트 이미터, 콜백 지옥은 잊어요. HTTP만 남겨요.

Cloudflare에 배포하려면요.

```plaintext
npm install -D wrangler
npx wrangler deploy
```

쾅. `https://mon-bot.workers.dev/interactions` 같은 URL이 생겨요.

Discord Developer Portal의 "INTERACTIONS ENDPOINT URL"에 넣으면 Discord가 인터랙션을 그리로 보내기 시작해요.

## 서명 확인하기: 가짜 요청은 안 돼요

Discord는 각 요청에 공개 키로 서명해요. 서명이 나쁜 요청을 받으면요? 스팸이에요. 무시하고 계속해요.

`discord-interactions` 패키지가 일을 해요.

```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // 정확한 날것 바디 (파싱된 JSON이 아니에요!)
  signature,         // x-signature-ed25519 헤더
  timestamp,         // x-signature-timestamp 헤더
  publicKey          // Discord Dev Portal에서
);
```

**중요한 함정**: 서명은 정확한 바디에 달려 있어요. JSON을 파싱했다가 다시 문자열로 만들거나 바디를 로그하면 서명이 깨져요.

먼저 확인해요. 나중에 파싱해요. 순서가 중요해요.

## 사례 1: Nibi (일본어 학습 봇)

Nibi는 일본어를 배우는 Discord 봇이에요. 단순한 명령어들이에요.

*   `/dictionary kanji` → 정의를 보여줘요
*   `/pronounce テキスト` → TTS(음성 합성)를 만들어요
*   `/hello` → 환영 메시지

각 명령어가 TypeScript 파일 하나예요.

```plaintext
src/commands/
├── dictionary.ts
├── pronounce.ts
├── hello.ts
└── ...
```

명령어는 이 인터페이스를 구현해요.

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
  ): Promise<interactionresponse>;
}
```

### /pronounce 명령어: 봇에게 말 시키기

제대로 이상한 것이 바로 이거예요. 텍스트(로마자, 히라가나, 한자, 뭐든)를 보내면 봇이 히라가나로 바꾸고, VOICEVOX나 Google TTS로 TTS를 만들고, Discord에 오디오 메시지를 보내요.

```typescript
const pronounce: Command = {
  data: {
    name: 'pronounce',
    description: '일본어 텍스트용 TTS 만들기',
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
      // 1. Kuroshiro로 로마자를 히라가나로 바꾸기
      const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });

      // 2. TTS 오디오 만들기
      const audioBuffer = await generateTTS(hiragana);

      // 3. 파일을 Discord에 올리기
      const uploadFilename = await uploadToDiscord(
        audioBuffer,
        interaction.channel.id,
        env.BOT_TOKEN
      );

      // 4. 오디오가 있는 메시지 보내기
      await sendVoiceMessage(
        interaction.channel.id,
        uploadFilename,
        audioBuffer.length / 16000,  // 초 단위 길이
        env.BOT_TOKEN
      );

      return {
        type: 4,
        data: { content: `Prononciation pour "${text}"` }
      };
    } catch (err) {
      return {
        type: 4,
        data: {
          content: 'Erreur : impossible de générer l\'audio xD',
          flags: 64  // ephemeral (비공개 메시지)
        }
      };
    }
  }
};
```

미쳤어요. 외부 API를 부르고, 파일을 Discord에 올리고, 파일이 있는 메시지를 보내요. 전부 WebSocket 없이 그냥 HTTP로요.

### Supabase로 영속화

Nibi는 Supabase를 키-값 저장소로 써요. 사용자가 등록되어 있는지 확인하려면요.

```typescript
const DatabaseUtils = new DatabaseUtils({
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY
});

const users = await DatabaseUtils.readJson('users');
const user = users.find(u => u.id === interaction.member.user.id);

if (!user) {
  // 사용자 추가
  users.push({ id: interaction.member.user.id, verified: true });
  await DatabaseUtils.writeJson('users', users);
}
```

아주 기본적이에요 (진짜 SQL 쿼리 없이 그냥 JSON). 하지만 동작해요. 작은 봇에는 완벽해요.

## 사례 2: Konosuba-RPG (이미지 렌더링 게임)

좋아요, 이건 미쳤어요.

Konosuba-RPG는 Discord 위의 **완전한 게임**이에요. 몹과 싸우고, XP를 얻고, 액세서리를 장착하고, 레벨을 올려요. 매 전투가 실시간 **이미지**를 만들어내요. 미리 렌더링된 스프라이트시트를 피하고요. 이미지는 플레이어 스탯과 몹, 전투 상태에서 동적으로 합성돼요.

그리고 이미지가 Cloudflare Workers에서 500ms 미만으로 만들어져요. 말 그대로요.

### 렌더링 아키텍처

```plaintext
Discord ("Attack"을 눌러요)
    ↓
Cloudflare Worker가 인터랙션을 받아요
    ↓
게임 상태 고치기 (XP, HP 등)
    ↓
Satori로 JSX 만들기
    ↓
Resvg (Wasm)로 SVG를 PNG로 바꾸기
    ↓
이미지를 Discord에 올리기
    ↓
이미지가 있는 메시지 보내기
```

전부 1초 미만에요. 미쳤어요.

### Workers 쪽 이미지 렌더링

Konosuba는 **Satori**(JSX에서 SVG)와 **Resvg**(SVG에서 PNG)를 써요.

```typescript
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. UI용 JSX 만들기
  const jsx = (
    <div style="{{" display:="" 'flex',="" gap:="" '20px'="" }}="">
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

  // 2. JSX에서 SVG로
  const svg = await satori.render(jsx, {
    width: 1200,
    height: 800,
    fonts: [/* ... */]
  });

  // 3. SVG에서 PNG로
  const png = resvg.render(svg).asPng();

  return png;  // Uint8Array
}
```

보통 JSX를 써요. SVG가 돼요. SVG가 PNG가 돼요. Cloudflare Worker에서 100ms 미만이에요.

힘이 느껴지시죠? 그냥 아름다워요.

### 게임 상태와 진행

플레이어 자료는 Supabase에 있어요.

```typescript
const player = await db
  .from('players')
  .select('*')
  .eq('discord_id', interaction.user.id)
  .single();

// 플레이어가 이겼어요
const { data: updated } = await db
  .from('players')
  .update({
    level: player.level + 1,
    xp: player.xp + xpGain
  })
  .eq('id', player.id);
```

각 행동(공격, 방어, 치유)이 자료의 스탯을 고쳐요. 그리고 새 스탯으로 이미지를 다시 만들어요.

### 인터랙션: 게임플레이 버튼

게임은 전투 행동에 **버튼 인터랙션**을 써요.

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

"Attack"을 누르면 Discord가 `custom_id: 'battle_attack'` 인터랙션을 POST해요. 핸들러가 라우팅해요.

```typescript
if (interaction.type === 3) {
  // 컴포넌트 인터랙션 (버튼 클릭 등)
  const customId = interaction.data.custom_id;

  if (customId === 'battle_attack') {
    return await handleAttack(interaction, env);
  }
  if (customId === 'battle_defend') {
    return await handleDefend(interaction, env);
  }
}
```

그리고 쾅, 피해를 계산하고, 자료를 고치고, 이미지를 다시 만들고, 보내요.

연결 영속 없이 완전한 턴제 게임이에요. 그냥 무상태 HTTP. 완전히 맛이 갔어요.

## Supabase: Workers용 DB

고전 데이터베이스(PostgreSQL, MySQL, MongoDB)는 영속 TCP 연결용으로 설계됐어요. 소켓을 열고, 연결을 유지하고, 쿼리를 보내요. 문제: **Cloudflare Workers는 영속 TCP 연결을 지원하지 않아요**. 각 요청은 덧없는 프로세스예요. 클라이언트에 답장하자마자 Worker가 사라져요.

이건 못 해요.

```typescript
// Workers에서는 안 돼요
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // 영속 TCP 연결 = 죽음
```

그리고 `pg`나 `postgres.js` 같은 네이티브 PostgreSQL 드라이버도 TCP 연결을 써요. Workers에서는 죽어요.

**Supabase가 전부 풀어요.**

Supabase는 PostgreSQL 위의 REST API예요. 보통 HTTP 요청을 해요. 각 호출이 독립적이고, 영속 연결도 없고, 관리할 상태도 없어요. 서버리스 모델에 완벽히 맞아요.

```typescript
// Workers에서 완벽히 돼요
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

Supabase 클라이언트(`@supabase/supabase-js`)는 내부에서 `fetch`를 써요. 그리고 `fetch`는 Workers에 네이티브예요. 설정 제로, 드라이버 제로, 영속 연결 제로.

| 데이터베이스 | Workers 호환? | 이유 |
| --- | --- | --- |
| **Supabase** | ✅ 예 | 무상태 REST API, 순수 HTTP |
| **PlanetScale (MySQL)** | ⚠️ 부분 | HTTPS 연결만, 긴 트랜잭션 없어요 |
| **Neon** | ⚠️ 부분 | 서버리스 브랜치지만 TCP 드라이버 필요 |
| **Turso (libSQL)** | ⚠️ 부분 | HTTP 가능하지만 제한 |
| **Prisma/Prisma Postgres** | ❌ 아니요 | 영속 TCP 필요 |
| **MongoDB Atlas** | ❌ 아니요 | TCP 드라이버, 네이티브 REST API 없어요 |
| **Redis (Upstash)** | ✅ 예 | HTTP REST API |

Supabase의 진짜 이점은 DB만이 아니에요. 생태계 전체가 엣지 우선으로 생각됐어요.

- **인증**: 세션 관리용 REST API, 무상태로 동작
- **스토리지**: HTTP로 파일 올리기와 내려받기
- **실시간**: WebSocket 선택 사항이지만 REST로 폴링도 가능
- **행 수준 보안**: 보안 규칙이 백엔드가 아니라 DB 안에 있어요

서버리스 Discord 봇에 Supabase는 가장 단순하고 믿을 만한 선택이에요. 드라이버를 설정하지 않고, 연결을 유지하지 않고, 타임아웃을 다루지 않아요. 그냥 HTTP 요청을 보내요.

진짜 예시를 원하면 위의 Nibi를 보세요. 영속 코드는 말 그대로 Supabase 위의 `readJson()`과 `writeJson()`이에요. 마이그레이션 없이, 복잡한 스키마 없이, 무거운 설정 없이 시작해요. 바로 동작해요. 그리고 봇이 커지면 제공자를 바꾸지 않고 진짜 SQL 쿼리로 옮겨요.

## 폴리필: Node가 Workers에서 돌고 싶을 때

일부 패키지는 Node API를 기대해요. Kuromoji(한자 파서)는 `XMLHttpRequest`를 써요. Workers에는 `fetch`가 있고 `XMLHttpRequest`는 없어요.

단순한 해결책: index.ts 맨 위에 폴리필을 넣어요.

```typescript
// kuromoji용 XMLHttpRequest 폴리필
if (!globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest = class {
    // 최소 스텁
  } as any;
}
```

또는 전용 모듈을 만들어요.

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

기본 핵이지만 동작해요.

## npm 패키지로: hono-discord-interactions

손으로 봇을 만들면 상용구가 많아요.

*   Discord 서명 확인
*   인터랙션 종류 라우팅
*   명령어와 컴포넌트, 모달 다루기
*   유효한 JSON 돌려주기

전부 npm 패키지로 추상화할 수 있어요. 예를 들면요.

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

쾅. 200줄 대신 20줄. Nibi를 쉽게 절반으로 줄여요.

나중을 위한 생각이에요.

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

비용: 하루 10만 요청까지 **무료**. 초과분은 백만 건당 0.50달러.

스포일러: 활성 사용자 만 명이 아니면 10만 요청을 절대 쓰지 않아요.

### Vercel

```plaintext
npm run vercel:deploy
```

URL: `https://mon-bot-xyz.vercel.app/api/interactions`

마찬가지로 무료예요.

### 둘 다 한 번에

Hono는 어디서든 돌아요. 같은 코드를 Cloudflare와 Vercel에 배포할 수 있어요. 고르기 전 이중화나 테스트에 유용해요.

## 빠른 체크리스트

1.  Discord Developer Portal에서 애플리케이션 만들기
2.  PUBLIC\_KEY, BOT\_TOKEN, APP\_ID 복사하기
3.  프로젝트 만들기:
4.  index.ts 쓰기 (서명 확인 + 라우팅)
5.  슬래시 명령어 등록하기 (한 번):
6.  배포:
7.  Discord에 URL 넣기 (Developer Portal → Application → Interactions Endpoint URL)
8.  Discord가 연결을 테스트해요 (PING에 답해야 해요)
9.  서버에 봇 초대하기
10.  됐어요

## 이점 대 한계

**이점**

*   최소 비용 (하루 10만 요청까지 무료)
*   확장 가능 (연결 관리 없이)
*   단순 (WebSocket 상용구 없이)
*   빠름 (Cloudflare = 엣지 서버)
*   이식 가능 (Hono 코드 = 여러 호스트)

**한계**

*   인터랙션(슬래시 명령어, 버튼, 모달)만 받아요. 실시간 서버 이벤트(멤버 참가, 역할 추가, 메시지 삭제 등)는 없어요
*   답장 타임아웃 3초. 넘기면 Discord가 "Application did not respond"를 보여줘요
*   진짜 이벤트가 필요하면 별도 HTTP 웹훅이나 보조 WebSocket 연결이 필요해요

90퍼센트 봇(전부 슬래시 명령어 기반)에는요? 충분해요.

## 마무리하자면

KonosubaRPG와 Nibi를 최적화하느라 꽤 많은 시간을 썼어요. 요청을 최대한 아끼거나, 핫 프로세서 시간을 줄이거나, 콜드 부팅을 줄이려고요. 결과적으로 거의 모든 것에서 상당한 성능을 얻었어요.
제가 대부분의 프로젝트를 클라우드화하기(그렇게 말하는지도 모르겠어요) 시작한 것은 제 VM에 호스팅을 계속하는 게 monumentally 귀찮았기 때문이라는 것을 알아두세요. 정말 GitHub Actions가 제 목숨을 살렸다고 생각해요. Workers도요. 하지만 사실 GitHub Actions와 스케줄로 데몬을 만들 수 있다는 것을 봤을 때 정말 살았어요, 진심으로.

[email-autoreply](https://github.com/fox3000foxy/email-autoreply/)라는 프로젝트에 대한 글을 쓸 것 같으니 RSS 피드를 구독해서 곧 나오는 것을 보세요. :))

**기억할 3가지:**

1.  **인터랙션 엔드포인트 = HTTP 서버리스**: WebSocket 없이, 영속 연결 없이. Discord가 POST하면 답장해요. Cloudflare에서 무료예요.
2.  **Hono가 완벽한 도구예요**: 가벼운 프레임워크 (12KB), 멀티 런타임, 의존성 제로. Cloudflare, Vercel, Node, 어디서나 같은 코드예요.
3.  **Workers 위 렌더 이미지는 미쳤어요**: Satori와 Resvg (Wasm)로 JSX로 동적 UI를 합성해서 100ms 미만으로 PNG로 바꿔요. 완전한 게임이 그 위에서 돌 수 있어요.

미쳤어요.

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
