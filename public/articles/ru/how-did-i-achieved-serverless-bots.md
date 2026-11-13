---
title: "Discord-бот 100% serverless : Hono + Cloudflare Workers"
description: Как я заменил Discord-бота, стоившего мне 50€/мес, на
  ноль евро -- interaction endpoints, Hono, Workers, рендер картинок в реальном
  времени и целая игра без WebSocket.
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
author_sig: "bZZEe5q49cIMUxP8ZmHgHepAOOOYox4poqcBG5Rr5s3nVjpGDhFySwiV6+88pC0TvJcqiv4wI5OmZPW8O4W/4Q=="
---

## Discord-бот 100% serverless : Hono + Cloudflare Workers = 💸 ноль

Я провёл несколько месяцев, поддерживая классических Discord-ботов на собственной машине.

WebSocket-соединение всегда открыто. Бот сам переподключается в 3 часа ночи. Бот крашится, потому что я косо смотрю на овец. Счёт растёт.

Однажды я открыл : **зачем держать соединение**? Discord может просто POSTить тебе интересующие события. Ты отвечаешь, и всё.

С 2021 Discord предлагает **interaction endpoints**.

Это просто HTTP. Ты работаешь без WebSocket, без персистентного состояния. Получаешь запрос, отправляешь JSON, конец. Следующий запрос приходит сам.

А лучшее : Cloudflare Workers **бесплатны** до 100k запросов в день. Для 90 % ботов это 0€/мес.

Эта статья показывает, как сделать Discord-бота без WebSocket, используя **Hono** (ультралёгкий веб-фреймворк) и **Cloudflare Workers**. Я покажу два реальных проекта : **Nibi** (бот для изучения японского, TTS, круто) и **Konosuba-RPG** (целая Discord-_игра_ с рендером картинок в реальном времени).

## WebSocket против Interaction Endpoints : почему это была плохая идея

Представь игру Minecraft, где надо держать соединение открытым, даже когда не играешь.

А сервер автоматически переподключается каждый раз, когда крашится. Ты должен управлять таймаутами, экспоненциальными переподключениями, всем дерьмовым boilerplate, который ненавидим. Только ради получения взаимодействий.

Interaction endpoints это наоборот. Discord POSTит на твой URL. Ты отвечаешь. Конец.

Если твой сервер крашнулся? Discord ретраит 2-3 раза и идёт дальше. Zero drama.

**Цена до** : 50€/мес на Heroku только за то, чтобы процесс Node оставался жив.

**Цена после** : 0€/мес на Cloudflare до 100k запросов в день.

## Архитектура : что это вообще?

Discord POSTит запрос на твой эндпоинт.

```plaintext
Discord: "Эй! Пользователь кликнул /ping!"
      ↓
   Твой URL (Cloudflare Worker)
      ↓
Проверяешь, что это реально Discord (проверка подписи)
      ↓
Парсишь тип взаимодействия
      ↓
Выполняешь хендлер
      ↓
Возвращаешь JSON
      ↓
Discord: "Круто, покажу это пользователю"
```

Это чистый HTTP с минимальным и читаемым стеком.

## Hono + Cloudflare Workers : экономное комбо

**Hono** это веб-фреймворк весом 12KB. Он крутится везде : Cloudflare Workers, Vercel, AWS Lambda, Deno, Bun... один код везде.

Cloudflare Workers это вычисления на edge. Твои запросы приходят на ближайший сервер. Время ответа : \<100ms. Цена : бесплатно до 100k запросов в день.

Связка Hono + Cloudflare идеальный матч для Discord-бота.

Вот минимальный код целого бота :

```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. Забираем заголовки
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. Проверяем, что это реально Discord (а не спам)
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3. Парсим то, что он прислал
  const interaction = JSON.parse(body);

  // 4. Отвечаем по типу
  if (interaction.type === 1) {
    // Тест Discord (PING)
    return c.json({ type: 1 });
  }

  if (interaction.type === 2) {
    // Это слеш-команда
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

30 строк достаточно для рабочего бота.

Ты забываешь `bot.login()`, event emitter и callback hell. Оставляешь только HTTP.

Для деплоя на Cloudflare :

```plaintext
npm install -D wrangler
npx wrangler deploy
```

Бум. У тебя URL вроде `https://mon-bot.workers.dev/interactions`.

Кладёшь это в Discord Developer Portal под "INTERACTIONS ENDPOINT URL", и Discord начинает слать твои взаимодействия туда.

## Проверка подписи : никаких фейковых запросов

Discord подписывает каждый запрос публичным ключом. Получил запрос с плохой подписью? Это спам. Игнорируй и иди дальше.

Пакет `discord-interactions` делает работу :

```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // точный сырой текст (не распарсенный JSON !)
  signature,         // заголовок x-signature-ed25519
  timestamp,         // заголовок x-signature-timestamp
  publicKey          // из Discord Dev Portal
);
```

**Важная ловушка** : подпись зависит от _точного_ body. Если парсишь JSON и снова stringify, или если логируешь body, ломаешь подпись.

Сначала проверяй. Потом парси. Порядок важен.

## Случай 1 : Nibi (бот изучения японского)

Nibi это Discord-бот для изучения японского. Простые команды :

*   `/dictionary kanji` → показывает определения
*   `/pronounce テキスト` → генерирует TTS (text-to-speech)
*   `/hello` → приветственное сообщение

Каждая команда это файл TypeScript :

```plaintext
src/commands/
├── dictionary.ts
├── pronounce.ts
├── hello.ts
└── ...
```

Команда реализует этот интерфейс :

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

### Команда /pronounce : заставить бота говорить

Она-то и прикольная. Шлёшь текст (romaji, hiragana, kanji, что угодно), бот конвертирует это в hiragana, генерирует TTS через VOICEVOX или Google TTS и отправляет аудиосообщение в Discord.

```typescript
const pronounce: Command = {
  data: {
    name: 'pronounce',
    description: 'Генерирует TTS для японского текста',
    options: [
      {
        type: 3,  // STRING
        name: 'text',
        description: 'Текст для произнесения',
        required: true
      }
    ]
  },

  async execute(interaction, env) {
    const text = interaction.data.options[0].value;

    try {
      // 1. Конвертировать romaji → hiragana через Kuroshiro
      const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });

      // 2. Сгенерировать аудио TTS
      const audioBuffer = await generateTTS(hiragana);

      // 3. Залить файл в Discord
      const uploadFilename = await uploadToDiscord(
        audioBuffer,
        interaction.channel.id,
        env.BOT_TOKEN
      );

      // 4. Отправить сообщение с аудио
      await sendVoiceMessage(
        interaction.channel.id,
        uploadFilename,
        audioBuffer.length / 16000,  // длительность в секундах
        env.BOT_TOKEN
      );

      return {
        type: 4,
        data: { content: `Произношение для "${text}"` }
      };
    } catch (err) {
      return {
        type: 4,
        data: {
          content: 'Ошибка : невозможно сгенерировать аудио xD',
          flags: 64  // ephemeral (приватное сообщение)
        }
      };
    }
  }
};
```

С ума сойти : зовёшь внешний API, заливаешь файл в Discord, отправляешь сообщение с файлом. Всё это без WebSocket, только HTTP.

### Персистентность с Supabase

Nibi использует Supabase как key-value store. Чтобы проверить, зарегистрирован ли пользователь :

```typescript
const DatabaseUtils = new DatabaseUtils({
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY
});

const users = await DatabaseUtils.readJson('users');
const user = users.find(u => u.id === interaction.member.user.id);

if (!user) {
  // Добавить пользователя
  users.push({ id: interaction.member.user.id, verified: true });
  await DatabaseUtils.writeJson('users', users);
}
```

Это очень базово (никаких настоящих SQL-запросов, только JSON), но работает. Для маленьких ботов идеально.

## Случай 2 : Konosuba-RPG (игра Discord с рендером картинок)

Так, это вообще дичь.

Konosuba-RPG это **целая игра** в Discord. Ты сражаешься с мобами, получаешь XP, надеваешь аксессуары, качаешь уровень. Каждый бой генерирует **картинку** в реальном времени. Ты избегаешь предрендеренных спрайтшитов. Картинка динамически компонуется из статов игрока, моба и состояния боя.

А картинка генерируется за \<500ms на Cloudflare Workers. Буквально.

### Архитектура рендера

```plaintext
Discord (ты жмёшь "Attack")
    ↓
Cloudflare Worker получает взаимодействие
    ↓
Обновление game state (XP, HP и т.д.)
    ↓
Генерация JSX через Satori
    ↓
Конверсия SVG → PNG через Resvg (Wasm)
    ↓
Заливка картинки в Discord
    ↓
Отправка сообщения с картинкой
```

Всё это меньше чем за секунду. С ума сойти.

### Рендер картинок на Workers

Konosuba использует **Satori** (JSX → SVG) и **Resvg** (SVG → PNG) :

```typescript
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. Создать JSX для UI
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

Ты пишешь нормальный JSX. Он становится SVG. SVG становится PNG. \<100ms на Cloudflare Worker.

Сечёшь мощь? Это просто красиво.

### Game state и прогрессия

Данные игрока в Supabase :

```typescript
const player = await db
  .from('players')
  .select('*')
  .eq('discord_id', interaction.user.id)
  .single();

// Игрок выиграл
const { data: updated } = await db
  .from('players')
  .update({
    level: player.level + 1,
    xp: player.xp + xpGain
  })
  .eq('id', player.id);
```

Каждое действие (атака, защита, лечение) обновляет статы в базе. А потом регенерируешь картинку с новыми статами.

### Взаимодействия : кнопки геймплея

Игра использует **button interactions** для действий в бою :

```typescript
{
  type: 1,  // ActionRow
  components: [
    {
      type: 2,  // Button
      style: 1,  // Primary (синий)
      label: 'Attack',
      custom_id: 'battle_attack'
    },
    {
      type: 2,
      style: 2,  // Secondary (серый)
      label: 'Defend',
      custom_id: 'battle_defend'
    }
  ]
}
```

Когда жмёшь "Attack", Discord POSTит взаимодействие с `custom_id: 'battle_attack'`. Хендлер роутит это :

```typescript
if (interaction.type === 3) {
  // Взаимодействие с компонентом (клик кнопки и т.д.)
  const customId = interaction.data.custom_id;

  if (customId === 'battle_attack') {
    return await handleAttack(interaction, env);
  }
  if (customId === 'battle_defend') {
    return await handleDefend(interaction, env);
  }
}
```

И бум, считаешь урон, апдейтишь базу, регенерируешь картинку, отправляешь.

Это целая пошаговая игра без какого-либо персистентного соединения. Только stateless HTTP. Совершенно сломано.

## Supabase : БД, сделанная для Workers

Классические базы данных (PostgreSQL, MySQL, MongoDB) спроектированы под персистентные TCP-соединения. Открываешь сокет, держишь соединение открытым, шлёшь запросы. Проблема : **Cloudflare Workers не поддерживают персистентные TCP-соединения**. Каждый запрос эфемерный процесс. Как только ответил клиенту, Worker исчезает.

Так делать нельзя :

```typescript
// Это НЕ работает на Workers
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // персистентное TCP-соединение = dead
```

А нативные драйверы PostgreSQL вроде `pg` или `postgres.js` используют TCP-соединения. На Workers они падают.

**Supabase решает всё это.**

Supabase это REST API поверх PostgreSQL. Ты делаешь нормальные HTTP-запросы. Каждый вызов независим, никакого персистентного соединения, никакого состояния для управления. Идеально подходит serverless-модели.

```typescript
// Это работает ИДЕАЛЬНО на Workers
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

Клиент Supabase (`@supabase/supabase-js`) использует `fetch` под капотом. А `fetch` нативен на Workers. Ноль конфигурации, ноль драйвера, ноль персистентных соединений.

| База данных | Совместим с Workers? | Почему |
| --- | --- | --- |
| **Supabase** | ✅ Да | REST API без состояния, чистый HTTP |
| **PlanetScale (MySQL)** | ⚠️ Частично | Только HTTPS-соединение, без длинных транзакций |
| **Neon** | ⚠️ Частично | Serverless-ветки, но нужен TCP-драйвер |
| **Turso (libSQL)** | ⚠️ Частично | HTTP возможен, но лимитирован |
| **Prisma/Prisma Postgres** | ❌ Нет | Нужен персистентный TCP |
| **MongoDB Atlas** | ❌ Нет | TCP-драйвер, без нативного REST API |
| **Redis (Upstash)** | ✅ Да | REST API HTTP |

Настоящее преимущество Supabase не только БД -- это вся экосистема, задуманная edge-first :

- **Auth** : REST API для управления сессиями, работает без состояния
- **Storage** : Заливка/скачивание файлов через HTTP
- **Realtime** : WebSocket опционально, но можно и poll через REST
- **Row Level Security** : правила безопасности в БД, а не в твоём бэкенде

Для serverless Discord-бота Supabase самый простой и надёжный выбор. Не настраиваешь драйвер, не держишь соединение, не управляешь таймаутами. Просто шлёшь HTTP-запросы.

Если хочешь настоящий пример, смотри Nibi выше : код персистентности это буквально `readJson()` и `writeJson()` на Supabase. Стартуешь без миграций, без сложной схемы, без тяжёлой конфигурации. Работает сразу. А если бот вырастет, мигрируешь на настоящие SQL-запросы, не меняя провайдера.

## Полифиллы : когда Node хочет крутиться на Workers

Некоторые пакеты ожидают Node API. Kuromoji (парсер kanji) использует `XMLHttpRequest`. У Workers есть `fetch`, а `XMLHttpRequest` нет.

Простое решение : добавить полифилл наверху index.ts :

```typescript
// Полифилл XMLHttpRequest для kuromoji
if (!globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest = class {
    // Минимальный стаб
  } as any;
}
```

Или сделать выделенный модуль :

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

Базовый хак, но работает.

## К npm-пакету : hono-discord-interactions

Вручную делать бота это много boilerplate :

*   Проверяешь подпись Discord
*   Роутишь типы взаимодействий
*   Управляешь командами, компонентами, модалками
*   Возвращаешь валидный JSON

Всё это можно абстрагировать в npm-пакет. Типа :

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

Бум. 20 строк вместо 200. Это урезало бы Nibi вдвое легко.

Идея на потом.

## Деплой

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

Результирующий URL : `https://mon-bot.workers.dev/interactions`

Цена : **бесплатно** до 100k запросов в день. Дальше : $0.50/миллион.

Спойлер : 100k запросов не потратишь, если нет 10 000 активных пользователей.

### Vercel

```plaintext
npm run vercel:deploy
```

URL : `https://mon-bot-xyz.vercel.app/api/interactions`

Так же, бесплатно.

### Оба сразу

Hono крутится везде. Можешь деплоить тот же код на Cloudflare И Vercel. Удобно для избыточности или тестов перед выбором.

## Быстрый чеклист

1.  Создать Application в Discord Developer Portal
2.  Скопировать PUBLIC\_KEY, BOT\_TOKEN, APP\_ID
3.  Создать проект :
4.  Написать index.ts (проверка подписи + роутинг)
5.  Зарегистрировать слеш-команды (один раз) :
6.  Деплой :
7.  Положить URL в Discord (Developer Portal → Application → Interactions Endpoint URL)
8.  Discord тестирует соединение (ты должен ответить на PING)
9.  Пригласить бота на сервер
10.  Готово

## Плюсы против лимитов

**Плюсы**

*   Минимальная цена (бесплатно до 100k req/день)
*   Масштабируемо (без управления соединениями)
*   Просто (без WebSocket boilerplate)
*   Быстро (Cloudflare = серверы на edge)
*   Портативно (код Hono = несколько хостов)

**Лимиты**

*   Ты получаешь только взаимодействия (slash commands, buttons, modals), без серверных событий реального времени (участник зашёл, роль добавлена, сообщение удалено и т.д.)
*   Таймаут 3 секунды на ответ -- иначе Discord показывает "Application did not respond"
*   Если нужны настоящие events -- нужен отдельный HTTP-webhook или вспомогательное WebSocket-соединение

Для 90 % ботов (всё на слеш-командах)? Годится.

## В заключение

Я провёл немало времени, оптимизируя KonosubaRPG и Nibi, чтобы экономить то максимум запросов, то горячее процессорное время, то холодный старт. Итог : у меня приличные перфы почти во всём.
Надо знать, что я начал клаудифицировать (даже не знаю, говорится ли так) большинство проектов, потому что было монументально лень продолжать хостить их на собственной VM. Реально, думаю, меня спасли Github Actions. Воркеры тоже, но вообще когда я увидел, что могу делать демонов через Github Actions и schedules, это меня реально спасло.

Я, наверное, напишу статью про проект под названием [email-autoreply](https://github.com/fox3000foxy/email-autoreply/), так что подписывайтесь на RSS-ленту, чтобы увидеть её выход :)).

**3 пункта запомнить :**

1.  **Interaction endpoints = HTTP serverless** -- без WebSocket, без персистентного соединения. Discord POSTит, ты отвечаешь. Бесплатно на Cloudflare.
2.  **Hono идеальный инструмент** -- Лёгкий фреймворк (12KB), мультирантайм, ноль зависимостей. Одинаковый код на Cloudflare, Vercel, Node, везде.
3.  **Рендер картинок на Workers = дичь** -- Satori + Resvg (Wasm) дают компоновать динамические UI на JSX и конвертировать в PNG за \<100ms. Целая игра может на этом крутиться.

Это больно.

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
