---
title: "Я провёл выходные за чтением кода konosuba-rpg и вот что я нашёл"
description: "Пошаговая RPG для Discord, где каждое действие генерирует изображение WebP
  на лету: URL как состояние игры, детерминированный ГСЧ, конвейер WASM, кеш 5
  уровней, бот без сервера."
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
author_sig: "k9P3xqM/9mwwkEOJurcdljXj+Gl/J64ROlJyo/+0KO6/6SOoJyZ7TxZrNSRh0RGwroNLp8unpEPAAMFydeHdGw=="
---

# Я провёл выходные за чтением кода konosuba-rpg и вот что я нашёл

Я поддерживаю этот проект уже некоторое время, но перечитывать свой собственный код спокойно -- это всегда поучительно. konosuba-rpg -- это пошаговая RPG для Discord, где каждое действие генерирует изображение WebP на лету. Не текстовый embed. Настоящее скомпонованное изображение со спрайтами, полосками здоровья, сообщениями о боях -- всё в одном.

Стек: TypeScript, Hono, Vercel, Cloudflare Workers, Supabase. Полностью бесплатный хостинг. И бот Discord работает без постоянного сервера. Этот пост объясняет, как всё это работает вместе.

![Начальное состояние игры](/images/konosuba-rpg/game_init.webp)

---

## Базовая архитектура: URL как состояние игры

Первое, что бросается в глаза: на стороне сервера нет никакого состояния для геймплея. Полное состояние боя помещается в URL.

```
/konosuba-rpg/fr/abc123/ATK/DEF/ATK/HUG?monster=Vanir&difficulty=hard
```

Каждый сегмент после seed -- это сыгранное действие. Сервер получает этот URL, начинает с начала, воспроизводит все действия по порядку и возвращает изображение боя на этот момент. Никаких сессий, никакого состояния в RAM, привязанного к пользователю.

Discord работает через интерактивные кнопки -- когда игрок нажимает «Атаковать», Discord отправляет на сервер `custom_id` кнопки. Этот `custom_id` содержит сжатый URL битвы с добавленным новым действием. Сервер пересчитывает всё с нуля и возвращает обновлённое изображение.

```typescript
// processUrl.ts
const VALID_MOVES_SET = new Set(["ATK", "DEF", "HUG", "HEA", "SPE", "USE"]);
// Предварительно скомпилировано вне функции -- не создаётся заново при каждом вызове

export default function processUrl(url: string): [Random, string[], string, string | null, string | null] {
  const urlParts = url.split("/");
  const moves: string[] = [];
  for (const part of urlParts) {
    if (VALID_MOVES_SET.has(part.toUpperCase())) moves.push(part.toUpperCase());
  }
  // seed = 6-й сегмент, хеширован до 8096 значений
  const seedStr = (urlParts[5] || "").toLowerCase();
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed + seedStr.charCodeAt(i)) % 8096;
  }
  return [new Random(seed), moves, seedStr, monster, difficulty];
}
```

`Set`, предварительно скомпилированный вне функции -- это деталь, но это позволяет избежать пересоздания структуры при каждом вызове в edge-контексте, где модули могут быть переоценены.

### ГСЧ: модифицированный RC4

Генератор случайных чисел -- это реализация RC4 (алгоритм потокового шифрования), перепрофилированная в PRNG.

```typescript
export class Random {
  private S: number[]; // таблица из 256 записей
  private i: number;
  private j: number;

  constructor(seed?: number) {
    this.S = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    let workingSeed = seed || Date.now();
    for (let i = 0; i < 256; i++) {
      j = (j + this.S[i] + (workingSeed & 0xff)) & 0xff;
      // swap S[i] и S[j]
      [this.S[i], this.S[j]] = [this.S[j], this.S[i]];
      workingSeed >>>= 8;
    }
  }

  next(): number { /* ... */ }
  randint(min: number, max: number): number { /* ... */ }
  choice(array: T[]): T { /* ... */ }
}
```

Почему RC4? Потому что это детерминированный PRNG с хорошим распределением и приемлемой устойчивостью к коллизиям seed. Одинаковый seed = одинаковая последовательность чисел = одинаковый бой каждый раз. Это позволяет «переиграть» любой бой, сохранив его URL, и гарантирует, что два разных сервера (Vercel + Cloudflare) дадут одинаковый результат для одного и того же URL.

---

## Проблема ограничения Discord в 100 символов

Discord устанавливает ограничение в 100 символов на `custom_id` кнопок. После нескольких десятков действий URL битвы легко превышает этот лимит.

Два механизма решают эту проблему.

### 1. RLE-сжатие действий

Действия кодируются одним символом (`a`=атака, `d`=защита, `h`=объятие...) и сжимаются с помощью кодирования длин серий:

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

Просто, но когда игрок спамит Атака x10, это превращается из `aaaaaaaaaa` (10 символов) в `a10` (3 символа). Кнопки «Атака x4» и «Атака x10» в интерфейсе существуют именно для этого -- ускорить бой, одновременно хорошо сжимая полезную нагрузку.

### 2. Токены сессий, когда сжатия недостаточно

Если сжатая полезная нагрузка всё ещё слишком длинная, она сохраняется в базе данных с коротким токеном:

```typescript
// gameSessionService.ts
const TOKEN_PREFIX = "gs.";
const TOKEN_SIZE = 10; // "gs.aBcDeFgHiJ"

export async function encodeGameplayButtons(buttons: RawButton[]): Promise {
  // Группирует полезные нагрузки по battle_key, вставляет батчем в Supabase
  // Заменяет custom_id на "gs.{token}:{userId}"
}

export async function decodeGameplayPayloadWithStatus(encodedPayload: string, userID: string) {
  if (!encodedPayload.startsWith(TOKEN_PREFIX)) {
    return { payload: encodedPayload }; // Без lookup, если не нужно
  }
  // Сначала lookup в памяти, затем Supabase, если отсутствует
  const cached = tokenToSession.get(token) || await loadTokenRowByToken(token);
  // Проверяет ownership, TTL (7 дней) и turn_version (предотвращает повторное воспроизведение старого состояния)
}
```

Сессии имеют TTL 7 дней и автоматическую очистку каждые 10 минут. Проверка `turnVersion` предотвращает повторное воспроизведение устаревшего состояния, если игрок продвинулся в партии -- незаметная защита от случайного «возврата назад».

Обе `Map` в памяти (`tokenToSession`, `latestTurnByBattle`) используют тот же паттерн `globalThis as unknown as GameSessionGlobals`, что и кеши изображений, по тем же причинам, которые мы рассмотрим ниже.

---

## Конвейер рендеринга изображений

![Начало боя со Слимом](/images/konosuba-rpg/shot_01_start.webp)

Маршрут `/konosuba-rpg/:lang/*` возвращает не JSON. Он возвращает изображение WebP, сгенерированное по запросу.

Конвейер организован в 3 композитных слоя:

```
Background (доска + рамка)
    +
Characters layer (спрайты игроков + моб, фиксированные позиции)
    +
UI overlay (полоски HP, сообщения, иконки персонажей через Satori → SVG → PNG)
    ↓
Photon.watermark() × 2
    ↓
WebP output
```

**Background**: два фиксированных изображения (доска и рамка), загруженные из файловой системы и скомпонованные один раз.

**Characters layer**: спрайты располагаются по вычисленным координатам. Мёртвые игроки исключаются (`activeSlots = slots.filter(s => playerHp[s.i] > 0)`). Спрайты врагов зеркально отражаются по горизонтали с помощью кастомного `flipX` -- цикл попиксельно, без внешних зависимостей.

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

**UI overlay**: это самая тяжёлая часть. JSX интерфейса (полоски здоровья, тексты, иконки) описывается в React-подобном стиле с помощью Satori, рендерится в SVG, конвертируется в PNG через `@cf-wasm/resvg`, а затем импортируется в Photon для финальной компоновки. Satori + resvg -- это два WASM-модуля, скомпилированные специально для Cloudflare Workers с флагом `edge-light`.

![Действие Защита](/images/konosuba-rpg/shot_03_defend.webp)

![Бой в процессе](/images/konosuba-rpg/shot_02_combat.webp)

![Действие Объятие](/images/konosuba-rpg/shot_04_hug.webp)

---

## Система кеширования -- самая проработанная часть

Есть 5 отдельных уровней кеша. Каждый нацелен на разную гранулярность конвейера.

```typescript
// renderImage.ts -- всё на globalThis
G.__imageCache  ??= {} as Record; // сырые ассеты
G.__base64Cache ??= {} as Record;       // base64 ассетов (для Satori)
G.__fontCache   ??= {} as Record; // шрифты
G.__photonCache    ??= new LRUCache(40, freePhoton);
G.__layerCache     ??= new LRUCache(12, freePhoton);
G.__uiPhotonCache  ??= new LRUCache(30, freePhoton);
G.__renderOutputCache ??= new LRUCache(120);
```

Паттерн `??=` на `globalThis`: JavaScript-модули в edge-воркерах могут быть переоценены между запросами при некоторых конфигурациях. Хранение кешей на `globalThis` с `??=` гарантирует, что они переживут эти переоценки без пересоздания.

### WASM-вытеснение

Кеши изображений Photon (`photonCache`, `layerCache`, `uiPhotonCache`) используют колбэк вытеснения:

```typescript
function freePhoton(_key: string, img: Photon.PhotonImage): void {
  try { img.free(); } catch { /* уже освобождено */ }
}

new LRUCache(40, freePhoton)
```

`Photon.PhotonImage` -- это объект WASM с памятью, выделенной в линейной памяти WASM, вне GC JavaScript. Без явного вызова `.free()` эта память никогда не освобождается. Вытеснение из LRU автоматически вызывает `.free()` -- это RAII, перенесённый в JavaScript.

### Ключи кеша намеренно lossy

```typescript
function buildCharactersKey(playerImages: string[][], playerHp: number[], creatureImages: string[], creatureHp: number): string {
  const players = playerImages.map((imgs, i) => `${imgs[0]}:${playerHp[i] > 0 ? 1 : 0}`).join("|");
  return `chars::${players}::${creatureImages[0]}:${creatureHp > 0 ? 1 : 0}`;
}
```

Ключ слоя персонажей не кодирует точное значение HP -- только `1` (жив) или `0` (мёртв). Потому что спрайт игрока с 40 HP и игрока с 15 HP одинаков. Попадание в кеш, таким образом, переживает любой урон, пока никто не падает.

Ключ UI, наоборот, кодирует точные HP (полоска здоровья меняется при каждом ударе) и хеш сообщений:

```typescript
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0; // 32-битное целое со знаком
  }
  return hash.toString(16);
}
```

`Math.imul` принудительно выполняет умножение в 32-битном целом, что избегает преобразований в float64 и даёт стабильный полиномиальный хеш. Никаких внешних зависимостей для этого.

### Конвертация base64 без переполнения стека

```typescript
function getBase64Cached(key: string, buf: ArrayBuffer): string {
  if (base64Cache[key]) return base64Cache[key];
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000; // 32768 байт
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  const b64 = btoa(binary);
  base64Cache[key] = b64;
  return b64;
}
```

`String.fromCharCode(...largeArray)` может вызвать переполнение стека на больших изображениях, потому что аргументы передаются через стек вызовов. Разбивка на чанки по 32КБ предотвращает это. Результат кешируется -- конвертация base64 одного и того же изображения выполняется только один раз на инстанс воркера.

---

## STRIPPER.md -- аудит последовательных await

В репозитории есть файл `STRIPPER.md`, который документирует аудит распараллеливания `await`. Вот несколько примеров того, что в нём зафиксировано:

- Загрузка профиля игрока делала 3 последовательных запроса к Supabase (прогрессия, сводка забега, достижения). Они были переведены на `Promise.all` -- между ними нет зависимостей.
- Раздача наград после боя (аксессуары + расходники) была последовательной. Распараллелена аналогично.
- Создание токенов сессий для кнопок делалось группами. Независимые группы теперь создаются параллельно.

```typescript
// progressionService.ts -- до (последовательно)
await grantAccessoryDropRewards(...);
await grantConsumableDropRewards(...);

// после
await Promise.all([
  grantAccessoryDropRewards(...),
  grantConsumableDropRewards(...),
]);
```

Ничего революционного, но в serverless-контексте, где каждая миллисекунда времени ответа оплачивается (или влияет на холодный старт), это имеет значение.

---

## Бот Discord без постоянного сервера

![Победа](/images/konosuba-rpg/shot_05_win.webp)

Момент, который часто неправильно понимают: бот Discord не обязательно требует постоянного WebSocket-соединения. Discord предлагает альтернативу: **Interactions Endpoint URL**. Вы предоставляете HTTPS-URL Discord, и Discord отправляет POST на каждый запрос взаимодействия (slash-команда, кнопка, автозаполнение).

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

Discord отправляет POST, обработчик работает 50–200 мс на функции Vercel или Cloudflare Worker, отвечает, и всё. Никакого постоянного соединения, никакого сервера, который нужно держать включённым. Весь бот Discord размещён на бесплатном тарифе Vercel.

Проверка Ed25519 (`verifyKey` из `discord-interactions`) обязательна -- Discord отправляет подпись в заголовках, которую вы должны проверить, иначе он отвергает endpoint.

### Специальная анимация -- единственный намеренный await

```typescript
// handleSpecialButton.ts
await new Promise(resolve => setTimeout(resolve, 3000)); // 3 секунды
await fetch(`${DISCORD_API_URL}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
  method: "PATCH",
  // ...
});
```

Эта намеренная задержка в 3 секунды задокументирована в STRIPPER.md как осознанное решение. Специальная атака Megumin (Взрыв) имеет анимацию на стороне Discord -- сначала сообщение обновляется с промежуточным визуалом, затем через 3 секунды изменяется с результатом. Это единственный случай, когда функция Vercel намеренно работает дольше необходимого.

![Специальная атака](/images/konosuba-rpg/shot_08_special.webp)

---

## Развёртывание на двух платформах

Одна и та же кодовая база работает на Vercel (Node.js) и Cloudflare Workers (V8 isolates) без изменений:

```typescript
// worker.ts -- точка входа Cloudflare
export default {
  fetch(request: Request, env: WorkerBindings): Promise {
    syncBindingsToProcessEnv(env); // вставляет секреты CF в process.env
    return app.fetch(request, env, ctx);
  }
};

// index.ts -- точка входа Vercel/Node
const isVercelRuntime = process.env.VERCEL === "1";
if (!isVercelRuntime) { start(); }
```

Основное отличие -- статические ассеты. На Vercel они читаются из файловой системы (`/var/task/assets/`). На Cloudflare Workers они проходят через binding `ASSETS` (статические ассеты CF) с fallback на HTTPS-зеркало (`fox3000foxy.com/konosuba-rpg/assets`). Функция `getAssetBytes` в `assetLoader.ts` обрабатывает оба пути, пытаясь сначала читать из файловой системы, затем через fetch.

WASM-модули (`@cf-wasm/photon/edge-light`, `@cf-wasm/resvg`) имеют отдельные сборки для каждого рантайма. Флаг `edge-light` в имени пакета обозначает сборку, совместимую с Cloudflare Workers, которая не разрешает `new WebAssembly.Module()` во время выполнения -- WASM должен быть предварительно скомпилирован.

---

## Прогрессия: XP, уровни, аффинити

![Босс, 650 HP](/images/konosuba-rpg/shot_06_boss.webp)

Мета-прогрессия основана на бесплатном тарифе Supabase. Схема включает таблицы `players` (глобальный XP, уровень, золото), `character_progress` (XP/уровень/аффинити по персонажам для Darkness, Aqua, Megumin), `runs` (история боёв), `inventory_items`, `daily_quests_progress`, `achievements_unlocked`, `game_sessions`.

Модель прогрессии проста:

```typescript
// characterService.ts
export function computeLevelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1; // 100 XP за уровень
}

export function getLevelFactor(level: number): number {
  return 1 + 0.2 * (level - 1); // +20% к статам за уровень
}

export function getAffinityFactor(affinity: number): number {
  const stars = Math.floor(affinity / 20); // 20 очков за звезду, максимум 5 звёзд
  return 1.2 ** stars; // экспоненциальная прогрессия
}
```

Эти множители применяются к статам персонажей в начале каждого `processGame`. Kazuma следует глобальному уровню игрока, остальные три имеют собственный XP/уровень. Аффинити (получаемая за сбор дропов, связанных с персонажем) умножает его статы независимо.

![Лечение](/images/konosuba-rpg/shot_07_heal.webp)

Система дропов использует таблицы лута, взвешенные по сложности:

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
  // ...вплоть до Legendary
};
```

---

## Тесты

Три набора: модульные, производительности и утечек.

Тест на утечки особенно прямолинеен:

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
  expect(after - before).toBeLessThan(20); // макс. 20 МБ роста кучи
});
```

1200 итераций `processGame`, принудительный GC до и после, дельта кучи < 20 МБ. Если этот тест проходит, `processGame` не утекает. Тест рендера (`renderImage.spec.ts`) скорее проверяет время выполнения ниже практического порога.

Также есть скрипт `bench.ts` для профилирования всего конвейера:

```
RENDER_PERF=1 npx tsx bench.ts --runs=20 --warmup=3 --monster=Dragon
```

С `RENDER_PERF=1` обёртка `withPerf` в каждом сервисе логирует тайминги:

```typescript
export async function withPerf(scope: string, label: string, work: () => Promise): Promise {
  const perf = createPerfLogger(scope);
  if (!perf.enabled) return work(); // нулевая нагрузка, если отключено
  perf.mark(`${label}:start`);
  try { return await work(); }
  finally { perf.done(`${label}:done`); }
}
```

`createPerfLogger` возвращает no-op, если `DEV_MODE` и `RENDER_PERF` не установлены в `1`. Никакой нагрузки в продакшене.

---

## Сколько стоит поддержка

- **Vercel free tier**: 100 ГБ трафика, 1M serverless-вызовов в месяц. Рендер изображения считается как один вызов.
- **Cloudflare Workers free tier**: 100K запросов/день, 10 мс CPU-времени на запрос (рендер может превышать это на Workers, отсюда Vercel в качестве основного).
- **Supabase free tier**: 500 МБ базы данных, 5 ГБ трафика. Достаточно для тысяч игроков.

Весь бэкенд работает с нулевой стоимостью до достижения значительного объёма. Единственная точка трения -- лимит CPU Cloudflare Workers: рендер изображений требует много CPU из-за WASM, отсюда стратегия с Vercel как основным и Workers как CDN для отказоустойчивости.

---

## 3 вещи, которые стоит запомнить

1. **URL как состояние игры** -- это не просто хитрая уловка; это ограничение, навязанное Discord (кнопки имеют лимит в 100 символов), которое привело к stateless-архитектуре с RLE-сжатием и токенами сессий как запасным вариантом. Ограничение продиктовало дизайн.

2. **WASM-кеш с явным вытеснением**: `PhotonImage` выделяют память вне кучи JavaScript и никогда не будут собраны GC без `.free()`. Подключение `freePhoton` к вытеснению из LRU -- это RAII в JavaScript. Это незаметно в коде, но без этого воркер бы утекал в продакшене.

3. **Бот Discord без сервера и WebSocket**: это менее известный подход по сравнению с WebSocket gateway, но для бота, выполняющего stateless-обработку (каждое взаимодействие независимо), Interactions Endpoint строго превосходит -- никаких переподключений, heartbeat или процессов, которые нужно поддерживать. Discord обеспечивает доступность на своей стороне.

---

*Репозиторий: [fox3000foxy/konosuba-rpg](https://github.com/fox3000foxy/konosuba-rpg)*

*Лицензия source-available custom -- без распространения, free to use.*
