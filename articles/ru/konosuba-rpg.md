---
title: "Я провёл выходные за чтением кода konosuba-rpg, и вот что нашёл"
description: "Пошаговая Discord-RPG, где каждое действие генерирует WebP-картинку
  на лету : URL как состояние игры, детерминированный RNG, WASM-пайплайн, кэш 5
  уровней, serverless-бот."
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
author_sig: "IW924Nke8BTsEiiIADqqRC8xhYCKYxKnmpr4LQdSuQLj8WssCk26psdyc7pm3u5UMCXtG19zPy2q/nHisFabGQ=="
---

# Я провёл выходные за чтением кода konosuba-rpg, и вот что нашёл

Я поддерживаю этот проект уже давно, но перечитывать собственный код на свежую голову всегда поучительно. konosuba-rpg это пошаговая Discord-RPG, где каждое действие генерирует WebP-картинку на лету. Настоящая скомпонованная картинка со спрайтами, полосками жизней, сообщениями боя -- всё.

Стек : TypeScript, Hono, Vercel, Cloudflare Workers, Supabase. Хостинг полностью бесплатный. А Discord-бот работает без персистентного сервера. Этот пост объясняет, как всё это держится вместе.

![Начальное состояние игры](/images/konosuba-rpg/game_init.webp)

---

## Базовый дизайн : URL как состояние игры

Первое, что бросается в глаза : никакого серверного состояния для геймплея. Полное состояние боя умещается в URL.

```
/konosuba-rpg/fr/abc123/ATK/DEF/ATK/HUG?monster=Vanir&difficulty=hard
```

Каждый сегмент после сида это сыгранное действие. Сервер получает этот URL, стартует с начала, переигрывает все действия по порядку и возвращает картинку боя ровно на этот момент. Никаких сессий, никакого состояния в RAM, привязанного к пользователю.

Discord работает интерактивными кнопками -- когда игрок жмёт "Атаковать", Discord шлёт на сервер `custom_id` кнопки. Этот custom_id содержит сжатый URL боя с добавленным новым действием. Сервер пересчитывает всё с нуля и возвращает обновлённую картинку.

```typescript
// processUrl.ts
const VALID_MOVES_SET = new Set(["ATK", "DEF", "HUG", "HEA", "SPE", "USE"]);
// Предскомпилирован вне функции -- не пересоздаётся при каждом вызове

export default function processUrl(url: string): [Random, string[], string, string | null, string | null] {
  const urlParts = url.split("/");
  const moves: string[] = [];
  for (const part of urlParts) {
    if (VALID_MOVES_SET.has(part.toUpperCase())) moves.push(part.toUpperCase());
  }
  // seed = 6-й сегмент, хешированный на 8096 значений
  const seedStr = (urlParts[5] || "").toLowerCase();
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed + seedStr.charCodeAt(i)) % 8096;
  }
  return [new Random(seed), moves, seedStr, monster, difficulty];
}
```

Предскомпилированный `Set` вне функции это деталь, но он избегает перестраивать структуру при каждом вызове в edge-контексте, где модули могут перевычисляться.

### RNG : модифицированный RC4

Генератор случайных чисел это реализация RC4 (алгоритм поточного шифрования), угнанная под PRNG.

```typescript
export class Random {
  private S: number[]; // таблица на 256 входов
  private i: number;
  private j: number;

  constructor(seed?: number) {
    this.S = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    let workingSeed = seed || Date.now();
    for (let i = 0; i < 256; i++) {
      j = (j + this.S[i] + (workingSeed & 0xff)) & 0xff;
      // обмен S[i] и S[j]
      [this.S[i], this.S[j]] = [this.S[j], this.S[i]];
      workingSeed >>>= 8;
    }
  }

  next(): number { /* ... */ }
  randint(min: number, max: number): number { /* ... */ }
  choice(array: T[]): T { /* ... */ }
}
```

Почему RC4? Потому что это детерминированный PRNG с корректным распределением и разумной устойчивостью к коллизиям сидов. Тот же сид = та же последовательность чисел = тот же бой каждый раз. Это позволяет "переигрывать" любой бой, сохраняя его URL, и гарантирует, что два разных сервера (Vercel + Cloudflare) дают ровно тот же результат для того же URL.

---

## Проблема лимита Discord в 100 символов

Discord навязывает лимит в 100 символов на `custom_id` кнопок. После нескольких десятков действий URL боя весело превышает этот лимит.

Два механизма отвечают на это.

### 1. RLE-сжатие действий

Действия кодируются одним символом (`a`=attack, `d`=defend, `h`=hug...) и сжимаются run-length encoding :

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

Просто, но когда игрок спамит Атаку x10, это переходит с `aaaaaaaaaa` (10 символов) на `a10` (3 символа). Кнопки "Атаковать x4" и "Атаковать x10" в UI существуют как раз для этого -- ускорить бой, хорошо сжимая пейлоад.

### 2. Токены сессий, когда сжатия уже не хватает

Если сжатый пейлоад остаётся слишком длинным, он хранится в базе с коротким токеном :

```typescript
// gameSessionService.ts
const TOKEN_PREFIX = "gs.";
const TOKEN_SIZE = 10; // "gs.aBcDeFgHiJ"

export async function encodeGameplayButtons(buttons: RawButton[]): Promise {
  // Группирует пейлоады по battle_key, вставляет батчем в Supabase
  // Заменяет custom_id на "gs.{token}:{userId}"
}

export async function decodeGameplayPayloadWithStatus(encodedPayload: string, userID: string) {
  if (!encodedPayload.startsWith(TOKEN_PREFIX)) {
    return { payload: encodedPayload }; // Без лукапа, если не нужно
  }
  // Лукап сначала в памяти, затем в Supabase, если отсутствует
  const cached = tokenToSession.get(token) || await loadTokenRowByToken(token);
  // Проверяет владение, TTL (7 дней) и turn_version (избегает переигрывания старого состояния)
}
```

У сессий TTL 7 дней и автопрунинг каждые 10 минут. Проверка `turnVersion` не даёт переиграть просроченное состояние, если игрок продвинулся в партии -- незаметная защита от случайного "отката назад".

Обе Maps в памяти (`tokenToSession`, `latestTurnByBattle`) используют тот же паттерн `globalThis as unknown as GameSessionGlobals`, что и кэши картинок, по тем же причинам, что увидим ниже.

---

## Пайплайн рендера картинок

![Начало боя против Slime](/images/konosuba-rpg/shot_01_start.webp)

Роут `/konosuba-rpg/:lang/*` возвращает не JSON. Он возвращает WebP-картинку, сгенерированную по требованию.

Пайплайн организован в 3 компонуемых слоя :

```
Background (board + frame)
    +
Characters layer (спрайты игроков + моб, фиксированные позиции)
    +
UI overlay (полоски HP, сообщения, иконки персов через Satori → SVG → PNG)
    ↓
Photon.watermark() × 2
    ↓
WebP output
```

**Background** : две фиксированные картинки (доска и рамка), грузятся с файловой системы и компонуются один раз.

**Characters layer** : спрайты позиционируются по вычисленным координатам. Мёртвые игроки исключаются (`activeSlots = slots.filter(s => playerHp[s.i] > 0)`). Спрайты врага отзеркаливаются горизонтально кастомным `flipX` -- циклом попиксельно вместо внешней зависимости.

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

**UI overlay** : тяжёлая часть. JSX интерфейса (полоски жизней, тексты, иконки) описывается в React-like через Satori, рендерится в SVG, конвертируется в PNG через `@cf-wasm/resvg`, затем импортируется в Photon для финальной компоновки. Satori + resvg это два WASM-модуля, скомпилированные специально для Cloudflare Workers с флагом `edge-light`.

![Действие Защита](/images/konosuba-rpg/shot_03_defend.webp)

![Бой в разгаре](/images/konosuba-rpg/shot_02_combat.webp)

![Действие Обнимашки](/images/konosuba-rpg/shot_04_hug.webp)

---

## Система кэша -- самая проработанная часть

Есть 5 отдельных уровней кэша. Каждый целит разную гранулярность пайплайна.

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

Паттерн `??=` на `globalThis` : JS-модули в edge-воркерах могут перевычисляться между запросами на некоторых конфигурациях. Хранение кэшей на `globalThis` с `??=` гарантирует, что они переживают эти перевычисления, не пересоздаваясь.

### WASM-эвикция

Кэши картинок Photon (`photonCache`, `layerCache`, `uiPhotonCache`) используют колбэк эвикции :

```typescript
function freePhoton(_key: string, img: Photon.PhotonImage): void {
  try { img.free(); } catch { /* уже освобождён */ }
}

new LRUCache(40, freePhoton)
```

`Photon.PhotonImage` это WASM-объект с памятью, аллоцированной на линейной WASM-стороне, вне JS GC. Эта память остаётся аллоцированной, пока `.free()` не вызван явно. Эвикция LRU триггерит `.free()` автоматически -- это RAII, портированный в JavaScript.

### Ключи кэша намеренно lossy

```typescript
function buildCharactersKey(playerImages: string[][], playerHp: number[], creatureImages: string[], creatureHp: number): string {
  const players = playerImages.map((imgs, i) => `${imgs[0]}:${playerHp[i] > 0 ? 1 : 0}`).join("|");
  return `chars::${players}::${creatureImages[0]}:${creatureHp > 0 ? 1 : 0}`;
}
```

Ключ characters layer не кодирует точное значение HP -- только `1` (жив) или `0` (мёртв). Потому что спрайт игрока на 40 HP и игрока на 15 HP идентичен. Хит кэша переживает любой урон, пока никто не падает.

Ключ UI, напротив, кодирует точные HP (полоска жизни меняется при каждом ударе) и хэш сообщений :

```typescript
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0; // знаковое 32-битное целое
  }
  return hash.toString(16);
}
```

`Math.imul` форсирует умножение в 32-битные целые, избегая float64-конверсий и давая стабильный полиномиальный хэш. Это избегает добавления внешней зависимости ради этого.

### Base64-конверсия без переполнения стека

```typescript
function getBase64Cached(key: string, buf: ArrayBuffer): string {
  if (base64Cache[key]) return base64Cache[key];
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000; // 32768 байтов
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  const b64 = btoa(binary);
  base64Cache[key] = b64;
  return b64;
}
```

`String.fromCharCode(...largeArray)` может вызвать переполнение стека на больших картинках, потому что аргументы передаются через call stack. Чанкинг по 32КБ избегает этого. Результат кэшируется -- base64-конверсия одной картинки делается раз на инстанс воркера.

---

## STRIPPER.md -- аудит последовательных await

В репо есть файл `STRIPPER.md`, документирующий аудит распараллеливания `await`. Несколько примеров того, что там зафиксировано :

- Загрузка профиля игрока делала 3 запроса Supabase подряд (прогресс, резюме рана, achievements). Они переведены в `Promise.all` -- зависимостей между ними нет.
- Раздача наград конца боя (аксессуары + расходники) была последовательной. Распараллелена так же.
- Создание токенов сессий для кнопок делалось группа за группой. Независимые группы теперь создаются параллельно.

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

Ничего революционного, но в serverless-контексте, где каждая миллисекунда времени ответа тарифицируется (или вносит в cold start), это считается.

---

## Discord-бот без персистентного сервера

![Победа](/images/konosuba-rpg/shot_05_win.webp)

Часто плохо понимаемый момент : Discord-боту вовсе не обязательно персистентное WebSocket-соединение. Discord предлагает альтернативу : **Interactions Endpoint URL**. Ты даёшь Discord HTTPS URL, и Discord шлёт тебе POST на каждое взаимодействие (slash command, кнопка, autocomplete).

```typescript
// interactions.ts
export async function handleInteractions(c: Context) {
  const body = await c.req.text();
  const isVerified = await verifySignature(c, body); // Ed25519
  if (!isVerified) return c.text("Invalid signature", 401);

  const interaction: Interaction = JSON.parse(body);
  if (interaction.type === 1) return c.json({ type: 1 }); // пинг Discord
  if (interaction.type === 2) return handleSlashCommand(...);
  if (interaction.type === 3) return handleButtonInteraction(...);
  if (interaction.type === 4) return handleAutocomplete(...);
}
```

Discord шлёт POST, хендлер крутится 50-200ms на функции Vercel или Cloudflare Worker, отвечает, и конец. Никакого постоянного соединения для поддержания, никакого сервера для держания включённым. Весь Discord-бот хостится на бесплатном тире Vercel.

Проверка Ed25519 (`verifyKey` из `discord-interactions`) обязательна -- Discord шлёт подпись в заголовках, которую ты должен валидировать, иначе он реджектит эндпоинт.

### Спецанимация -- единственный намеренный await

```typescript
// handleSpecialButton.ts
await new Promise(resolve => setTimeout(resolve, 3000)); // 3 секунды
await fetch(`${DISCORD_API_URL}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
  method: "PATCH",
  // ...
});
```

Эта добровольная задержка в 3 секунды задокументирована в STRIPPER.md как намеренная. У спецатаки Megumin (Explosion) есть анимация на стороне Discord -- сообщение сначала обновляется промежуточным визуалом, затем модифицируется 3 секунды спустя с результатом. Это единственный случай, когда функция Vercel крутится добровольно дольше нужного.

![Спецатака](/images/konosuba-rpg/shot_08_special.webp)

---

## Деплоябельность на две платформы

Тот же кодбейз крутится на Vercel (Node.js) и на Cloudflare Workers (V8 isolates) без модификации :

```typescript
// worker.ts -- entrypoint Cloudflare
export default {
  fetch(request: Request, env: WorkerBindings): Promise {
    syncBindingsToProcessEnv(env); // впрыскивает секреты CF в process.env
    return app.fetch(request, env, ctx);
  }
};

// index.ts -- entrypoint Vercel/Node
const isVercelRuntime = process.env.VERCEL === "1";
if (!isVercelRuntime) { start(); }
```

Главная разница : статичные ассеты. На Vercel они читаются с файловой системы (`/var/task/assets/`). На Cloudflare Workers они идут через биндинг `ASSETS` (статичные ассеты CF) с fallback на HTTPS-зеркало (`fox3000foxy.com/konosuba-rpg/assets`). `getAssetBytes` в `assetLoader.ts` управляет обоими путями, пробуя сначала файловую систему, затем fetch.

WASM (`@cf-wasm/photon/edge-light`, `@cf-wasm/resvg`) имеют отдельные сборки под каждый рантайм. Флаг `edge-light` в имени пакета обозначает сборку, совместимую с Cloudflare Workers, не разрешающую `new WebAssembly.Module()` в рантайме -- WASM должен быть предскомпилирован.

---

## Прогрессия : XP, уровни, аффинити

![Босс, 650 HP](/images/konosuba-rpg/shot_06_boss.webp)

Метапрогрессия опирается на бесплатный тир Supabase. Схема содержит таблицу `players` (глобальный XP, уровень, gold), `character_progress` (XP/уровень/аффинити на перса для Darkness, Aqua, Megumin), `runs` (история боёв), `inventory_items`, `daily_quests_progress`, `achievements_unlocked`, `game_sessions`.

Модель прогрессии проста :

```typescript
// characterService.ts
export function computeLevelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1; // 100 XP на уровень
}

export function getLevelFactor(level: number): number {
  return 1 + 0.2 * (level - 1); // +20% статов на уровень
}

export function getAffinityFactor(affinity: number): number {
  const stars = Math.floor(affinity / 20); // 20 очков на звезду, 5 звёзд макс
  return 1.2 ** stars; // экспоненциальная прогрессия
}
```

Эти факторы применяются к статам персов в начале каждого `processGame`. Kazuma следует глобальному уровню игрока, у трёх других у каждого свой XP/уровень. Аффинити (зарабатывается подбором дропов, связанных с персом) умножает его статы независимо.

![Лечение](/images/konosuba-rpg/shot_07_heal.webp)

Система дропов использует loot-таблицы, взвешенные по сложности :

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
  // ...до Legendary
};
```

---

## Тесты

Три набора : юниты, perf и leaks.

Leak-тест особенно прямой :

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
  expect(after - before).toBeLessThan(20); // макс 20MB роста heap
});
```

1200 итераций `processGame`, форсированный GC до и после, дельта heap < 20MB. Если этот тест проходит, `processGame` не течёт. Тест рендера (`renderImage.spec.ts`) проверяет скорее время исполнения под практичным порогом.

Есть ещё скрипт `bench.ts` для профилирования полного пайплайна :

```
RENDER_PERF=1 npx tsx bench.ts --runs=20 --warmup=3 --monster=Dragon
```

С `RENDER_PERF=1` обёртка `withPerf` в каждом сервисе логирует тайминги :

```typescript
export async function withPerf(scope: string, label: string, work: () => Promise): Promise {
  const perf = createPerfLogger(scope);
  if (!perf.enabled) return work(); // нулевой оверхед, если выключено
  perf.mark(`${label}:start`);
  try { return await work(); }
  finally { perf.done(`${label}:done`); }
}
```

`createPerfLogger` возвращает no-op, если `DEV_MODE` и `RENDER_PERF` не равны `1`. Нулевой оверхед в проде.

---

## Сколько стоит крутить

- **Бесплатный тир Vercel** : 100GB bandwidth, 1M serverless-инвокаций в месяц. Рендер картинки считается инвокацией.
- **Бесплатный тир Cloudflare Workers** : 100K запросов/день, 10ms CPU time на запрос (рендер может превышать это на Workers, отсюда Vercel первичен).
- **Бесплатный тир Supabase** : 500MB базы, 5GB bandwidth. Достаточно на тысячи игроков.

Весь бэкенд крутится за ноль до значимого объёма. Единственная точка трения это CPU-лимит Cloudflare Workers -- рендер картинок CPU-intensive из-за WASM, отсюда стратегия Vercel как первичного и Workers как CDN failover.

---

## 3 вещи, стоящие запоминания

1. **URL как состояние игры** это не просто милая хитрость -- это ограничение, навязанное Discord (у кнопок лимит 100 символов), форсировавшее stateless-архитектуру с RLE-сжатием + токеном сессии как fallback. Ограничение продиктовало дизайн.

2. **WASM-кэш с явной эвикцией** : `PhotonImage` аллоцируют вне JS heap и никогда не будут GC'd без `.free()`. Подвешивание `freePhoton` на эвикцию LRU это RAII в JavaScript. Незаметно в коде, но без этого воркер тёк бы в проде.

3. **Serverless Discord-бот без WebSocket** : это менее известно, чем подход WebSocket gateway, но для бота со stateless-обработкой (каждое взаимодействие независимо) Interactions Endpoint строго лучше -- без переподключений, без heartbeat, без процесса для поддержания. Discord управляет доступностью на своей инфре.

---

*Репо : [fox3000foxy/konosuba-rpg](https://github.com/fox3000foxy/konosuba-rpg)*

*Лицензия source-available custom -- без редистрибуции, free to use.*
