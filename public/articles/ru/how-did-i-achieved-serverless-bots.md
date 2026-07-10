---
title: "100% serverless бот Discord: Hono + Cloudflare Workers"
description: Как я заменил Discord-бота, который обходился мне в 50€/месяц, на
  ноль евро -- interaction endpoints, Hono, Workers, рендеринг изображений в
  реальном времени и полноценная игра без WebSocket.
date: 2026-05-29
tags:
  - discord
  - cloudflare
  - serverless
  - typescript
  - bots
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "MEUCIBSvHqGmWB/Wv3LvdbHHjKIYbybfpQGxjwkEyZoenyaNAiEA5u/7+3QyuO7NUc6xBqZGZM94/L7dopp3WE1/2GY0poo="
---

## Discord bot 100% serverless : Hono + Cloudflare Workers = 💸 ноль

Я несколько месяцев держал обычных Discord ботов на своей машине.

WebSocket соединение всегда открыто. Бот сам переподключается в 3 ночи. Бот падает, потому что я косо посмотрел на овец. Счёт растёт.

Однажды я понял: **зачем держать соединение**? Discord может POSTить тебе только то, что интересно. Ты отвечаешь -- готово.

С 2021 года Discord поддерживает **interaction endpoints**.

Это просто HTTP. Никакого WebSocket. Никакого состояния. Ты получаешь запрос, шлёшь JSON, всё. Следующий запрос приходит сам.

И самое крутое: Cloudflare Workers -- это **бесплатно** до 100k запросов/день. Для 90% ботов это 0€/мес.

Эта статья покажет, как сделать Discord бота без WebSocket, используя **Hono** (ультра-лёгкий веб-фреймворк) и **Cloudflare Workers**. Я покажу два реальных проекта: **Nibi** (бот для изучения японского, TTS, круто) и **Konosuba-RPG** (полноценная Discord-игра _с рендером изображений в реальном времени_ xD).

## WebSocket vs. Interaction Endpoints : почему это было плохой идеей

Представь Minecraft, где тебе нужно держать соединение открытым, даже когда ты не играешь.

А сервер переподключается автоматически каждый раз, когда падает. Ты должен обрабатывать таймауты, экспоненциальные реконнекты, весь этот грёбаный boilerplate, который мы ненавидим. Просто чтобы получать взаимодействия.

Interaction endpoints -- всё наоборот. Discord POST'ит на твой URL. Ты отвечаешь. Готово.

Если твой сервер упал? Discord повторяет 2-3 раза и идёт дальше. Ноль драмы.

**Цена до** : 50€/мес на Heroku просто чтобы процесс Node оставался живым.

**Цена после** : 0€/мес на Cloudflare до 100k запросов/день.

## Архитектура : что это вообще такое?

Discord POST'ит запрос на твой endpoint.

```plaintext
Discord: "Эй! Пользователь нажал на /ping!"
      ↓
   Твой URL (Cloudflare Worker)
      ↓
   Ты проверяешь, что это действительно Discord (проверка подписи)
      ↓
   Ты парсишь тип взаимодействия
      ↓
   Ты выполняешь handler
      ↓
   Ты возвращаешь JSON
      ↓
Discord: "Ок, я покажу это пользователю"
```

Чистый HTTP. Никакой магии. Никаких тяжёлых библиотек.

## Hono + Cloudflare Workers : экономная комбинация

**Hono** -- это веб-фреймворк весом 12KB. Работает везде: Cloudflare Workers, Vercel, AWS Lambda, Deno, Bun... один и тот же код везде.

Cloudflare Workers -- это вычисления на edge. Твои запросы приходят на ближайший сервер. Время ответа: \<100ms. Цена: бесплатно до 100k запросов/день.

Связка Hono + Cloudflare -- идеальный мэтч для Discord бота.

Вот минимальный код полноценного бота:

```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. Получаем заголовки
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. Проверяем, что это реально Discord (не спам)
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3. Парсим, что он прислал
  const interaction = JSON.parse(body);

  // 4. Отвечаем по типу
  if (interaction.type === 1) {
    // Проверка Discord (PING)
    return c.json({ type: 1 });
  }

  if (interaction.type === 2) {
    // Это слэш-команда
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

Типа, 30 строк и это рабочий бот.

Никакого `bot.login()`. Никаких event emitter'ов. Никакого callback hell. Просто HTTP.

Чтобы задеплоить на Cloudflare:

```plaintext
npm install -D wrangler
npx wrangler deploy
```

Бум. У тебя URL типа `https://mon-bot.workers.dev/interactions`.

Вставляешь это в Discord Developer Portal в "INTERACTIONS ENDPOINT URL", и Discord начинает слать твои взаимодействия туда.

## Проверка подписи : никаких фейковых запросов

Discord подписывает каждый запрос публичным ключом. Если пришёл запрос с неправильной подписью? Это спам. Игнорируй и живи дальше.

Пакет `discord-interactions` делает всю работу:

```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // точный сырой текст (не паршеный JSON!)
  signature,         // header x-signature-ed25519
  timestamp,         // header x-signature-timestamp
  publicKey          // из Discord Dev Portal
);
```

**Важная ловушка** : подпись зависит от _точного_ body. Если ты спарсишь JSON и обратно превратишь в строку, или залогируешь body -- подпись сломается.

Сначала проверяй. Потом парси. Порядок важен.

## Кейс 1 : Nibi (бот для изучения японского)

Nibi -- это Discord бот для изучения японского. Простые команды:

*   `/dictionary kanji` → показывает определения
*   `/pronounce テキスト` → генерирует TTS (text-to-speech)
*   `/hello` → приветственное сообщение

Каждая команда -- отдельный TypeScript файл:

```plaintext
src/commands/
├── dictionary.ts
├── pronounce.ts
├── hello.ts
└── ...
```

Команда реализует такой интерфейс:

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

### Команда /pronounce : заставляем бота говорить

Эта самая безумная. Ты шлёшь текст (ромадзи, хирагана, кандзи, что угодно), бот конвертит это в хирагану, генерирует TTS через VOICEVOX или Google TTS, и отправляет аудиосообщение в Discord.

```typescript
const pronounce: Command = {
  data: {
    name: 'pronounce',
    description: 'Генерирует TTS для японского текста',
    options: [
      {
        type: 3,  // STRING
        name: 'text',
        description: 'Текст для произношения',
        required: true
      }
    ]
  },

  async execute(interaction, env) {
    const text = interaction.data.options[0].value;

    try {
      // 1. Конвертируем ромадзи → хирагану через Kuroshiro
      const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });

      // 2. Генерируем TTS аудио
      const audioBuffer = await generateTTS(hiragana);

      // 3. Загружаем файл в Discord
      const uploadFilename = await uploadToDiscord(
        audioBuffer,
        interaction.channel.id,
        env.BOT_TOKEN
      );

      // 4. Отправляем сообщение с аудио
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
          content: 'Ошибка : не удалось сгенерировать аудио xD',
          flags: 64  // ephemeral (приватное сообщение)
        }
      };
    }
  }
};
```

Это же безумие: ты вызываешь внешнее API, загружаешь файл в Discord, отправляешь сообщение с файлом. Всё без WebSocket, просто HTTP.

### Хранение данных с Supabase

Nibi использует Supabase как key-value store. Чтобы проверить, зарегистрирован ли пользователь:

```typescript
const DatabaseUtils = new DatabaseUtils({
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY
});

const users = await DatabaseUtils.readJson('users');
const user = users.find(u => u.id === interaction.member.user.id);

if (!user) {
  // Добавляем пользователя
  users.push({ id: interaction.member.user.id, verified: true });
  await DatabaseUtils.writeJson('users', users);
}
```

Очень базово (никаких настоящих SQL запросов, просто JSON), но работает. Для маленьких ботов идеально.

## Кейс 2 : Konosuba-RPG (игра в Discord с рендером изображений)

Окей, вот это уже жесть.

Konosuba-RPG -- это **полноценная игра** в Discord. Ты сражаешься с мобами, получаешь XP, экипируешь аксессуары, повышаешь уровень. Каждая битва генерирует **изображение** в реальном времени. Никаких предварительно отрендеренных спрайтов. Изображение составляется динамически на основе статов игрока, моба и состояния битвы.

И изображение генерируется за \<500ms на Cloudflare Workers. Буквально.

### Архитектура рендера

```plaintext
Discord (ты нажимаешь "Attack")
    ↓
Cloudflare Worker получает взаимодействие
    ↓
Обновление игрового состояния (XP, HP, и т.д.)
    ↓
Генерация JSX с помощью Satori
    ↓
Конвертация SVG → PNG с помощью Resvg (Wasm)
    ↓
Загрузка изображения в Discord
    ↓
Отправка сообщения с изображением
```

Всё это меньше чем за секунду. Это чертовски круто.

### Рендер изображений на Workers

Konosuba использует **Satori** (JSX → SVG) и **Resvg** (SVG → PNG):

```typescript
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. Создаём JSX для интерфейса
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

Ты пишешь обычный JSX. Он становится SVG. SVG становится PNG. \<100ms на Cloudflare Worker.

Прочувствуй мощь? Это просто... красиво xD

### Игровое состояние и прогрессия

Данные игрока хранятся в Supabase:

```typescript
const player = await db
  .from('players')
  .select('*')
  .eq('discord_id', interaction.user.id)
  .single();

// Игрок победил
const { data: updated } = await db
  .from('players')
  .update({
    level: player.level + 1,
    xp: player.xp + xpGain
  })
  .eq('id', player.id);
```

Каждое действие (атака, защита, лечение) обновляет статы в базе. А затем ты заново генерируешь изображение с новыми статами.

### Взаимодействия : кнопки геймплея

Игра использует **button interactions** для действий в бою:

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

Когда ты нажимаешь "Attack", Discord POST'ит взаимодействие с `custom_id: 'battle_attack'`. Handler направляет это:

```typescript
if (interaction.type === 3) {
  // Component interaction (нажатие кнопки и т.д.)
  const customId = interaction.data.custom_id;

  if (customId === 'battle_attack') {
    return await handleAttack(interaction, env);
  }
  if (customId === 'battle_defend') {
    return await handleDefend(interaction, env);
  }
}
```

И бум, ты вычисляешь урон, обновляешь базу, регенерируешь изображение, отправляешь.

Это полноценная пошаговая игра без единого постоянного соединения. Просто HTTP без состояния. Полный отрыв xD

## Supabase: база данных, созданная для Workers

Традиционные базы данных (PostgreSQL, MySQL, MongoDB) спроектированы для постоянных TCP-соединений. Ты открываешь сокет, держишь соединение, отправляешь запросы. Проблема: **Cloudflare Workers не поддерживает постоянные TCP-соединения**. Каждый запрос -- это эфемерный процесс. Как только ты отвечаешь клиенту, Worker исчезает.

Ты не можешь сделать так:

```typescript
// Это НЕ сработает на Workers
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // постоянное TCP-соединение = мертво
```

Даже нативные драйверы PostgreSQL вроде `pg` или `postgres.js` используют TCP-соединения. На Workers они падают.

**Supabase решает всё это.**

Supabase -- это REST API поверх PostgreSQL. Ты делаешь обычные HTTP-запросы. Каждый вызов независим, нет постоянного соединения, нет состояния, которым нужно управлять. Это идеально подходит для serverless-модели.

```typescript
// Это отлично работает на Workers
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

Клиент Supabase (`@supabase/supabase-js`) использует `fetch` под капотом. А `fetch` -- нативный на Workers. Ноль конфигурации, ноль драйверов, ноль постоянных соединений.

| База данных | Совместима с Workers? | Почему |
| --- | --- | --- |
| **Supabase** | ✅ Да | REST API без состояния, чистый HTTP |
| **PlanetScale (MySQL)** | ⚠️ Частично | Только HTTPS, нет длинных транзакций |
| **Neon** | ⚠️ Частично | Serverless-ветки, но нужен TCP-драйвер |
| **Turso (libSQL)** | ⚠️ Частично | HTTP возможен, но ограничен |
| **Prisma/Prisma Postgres** | ❌ Нет | Требует постоянного TCP |
| **MongoDB Atlas** | ❌ Нет | TCP-драйвер, нет нативного REST API |
| **Redis (Upstash)** | ✅ Да | REST API через HTTP |

Настоящее преимущество Supabase -- не только БД, а вся экосистема, спроектированная для edge:

- **Auth**: REST API для сессий, работает без состояния
- **Storage**: Загрузка/скачивание файлов через HTTP
- **Realtime**: Опциональный WebSocket, но можно делать poll через REST
- **Row Level Security**: правила безопасности живут в БД, а не в твоём бэкенде

Для serverless Discord-бота Supabase -- самый простой и надёжный выбор. Никаких драйверов для настройки, никаких соединений для поддержания, никаких таймаутов. Просто HTTP-запросы.

Хочешь реальный пример? Посмотри на Nibi выше: его код сохранения -- буквально `readJson()` и `writeJson()` на Supabase. Никаких миграций, никаких сложных схем, никакой безумной конфигурации. Работает из коробки. А если твой бот вырастет, ты можешь перейти на настоящие SQL-запросы без смены провайдера.

## Полифиллы : когда Node хочет работать на Workers

Некоторые пакеты ожидают Node API. Kuromoji (парсер кандзи) использует `XMLHttpRequest`. У Workers есть `fetch`, нет `XMLHttpRequest`.

Простое решение: добавить полифилл в начале index.ts:

```typescript
// Полифилл XMLHttpRequest для kuromoji
if (!globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest = class {
    // Минимальная заглушка
  } as any;
}
```

Или вынести в отдельный модуль:

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

Это базовый хак, но работает.

## К npm пакету : hono-discord-interactions

Вручную делать бота -- много boilerplate:

*   Проверка подписи Discord
*   Маршрутизация типов взаимодействий
*   Обработка команд, компонентов, модалок
*   Возврат валидного JSON

Можно было бы абстрагировать всё это в npm пакет. Типа:

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

Бац. 20 строк вместо 200. Это бы уменьшило Nibi минимум вдвое.

Идея на потом xD

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

Результирующий URL: `https://mon-bot.workers.dev/interactions`

Цена: **бесплатно** до 100k запросов/день. Выше: $0.50/миллион.

Спойлер: ты никогда не потратишь 100k запросов, если у тебя не 10 000 активных пользователей.

### Vercel

```plaintext
npm run vercel:deploy
```

URL: `https://mon-bot-xyz.vercel.app/api/interactions`

То же самое, бесплатно.

### Оба сразу

Hono работает везде. Ты можешь задеплоить один и тот же код на Cloudflare И Vercel. Полезно для отказоустойчивости или тестирования перед выбором.

## Быстрый чеклист

1.  Создать приложение в Discord Developer Portal
2.  Скопировать PUBLIC\_KEY, BOT\_TOKEN, APP\_ID
3.  Создать проект:
4.  Написать index.ts (проверка подписи + маршрутизация)
5.  Зарегистрировать слэш-команды (один раз):
6.  Задеплоить:
7.  Вставить URL в Discord (Developer Portal → Application → Interactions Endpoint URL)
8.  Discord тестирует соединение (ты должен ответить на PING)
9.  Пригласить бота на сервер
10.  Готово

## Преимущества vs Ограничения

**Преимущества**

*   Дёшево (бесплатно до 100k запросов/день)
*   Масштабируется (никакого управления соединениями)
*   Просто (никакого WebSocket boilerplate)
*   Быстро (Cloudflare = сервера на edge)
*   Портативно (код на Hono = несколько хостов)

**Ограничения**

*   Нет событий сервера в реальном времени (участник зашёл, роль добавлена, сообщение удалено и т.д.) -- ты получаешь только взаимодействия (слэш-команды, кнопки, модалки)
*   Таймаут 3 секунды для ответа -- иначе Discord показывает "Application did not respond"
*   Если нужны настоящие события -- нужен отдельный HTTP вебхук или вспомогательное WebSocket соединение

Для 90% ботов (всё на слэш-командах)? Норм.

## В заключение

Я потратил немало времени, оптимизируя KonosubaRPG и Nibi -- чтобы экономить либо количество запросов, либо время процессора на горячую, либо холодный старт. В итоге у меня весьма крутые показатели почти везде.
Надо сказать, я начал «облачить» (даже не знаю, существует ли такое слово) большинство своих проектов, потому что мне было дико лень продолжать их хостить на своей VM. Серьёзно, кажется, Github Actions спасли мне шкуру. Workers тоже, но когда я понял, что можно делать демонов с Github Actions и расписаниями -- это меня реально спасло, чувак.

Я скорее всего напишу статью о проекте [email-autoreply](https://github.com/fox3000foxy/email-autoreply/), так что подписывайся на RSS, чтобы не пропустить :)).

**3 вещи, которые нужно запомнить:**

1.  **Interaction endpoints = HTTP serverless** -- Никакого WebSocket, никаких постоянных соединений. Discord POST'ит, ты отвечаешь. Бесплатно на Cloudflare.
2.  **Hono -- идеальный инструмент** -- Лёгкий фреймворк (12KB), мульти-рантайм, ноль зависимостей. Одинаковый код на Cloudflare, Vercel, Node, везде.
3.  **Рендер изображений на Workers = безумие** -- Satori + Resvg (Wasm) позволяют собирать динамические UI в JSX и конвертировать их в PNG за \<100ms. Полноценная игра может работать на этом.

Это просто имба xD

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
