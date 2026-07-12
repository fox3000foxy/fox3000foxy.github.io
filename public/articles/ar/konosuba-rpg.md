---
itle: "قضيت عطلة نهاية الأسبوع أقرأ كود konosuba-rpg وهذا ما وجدته"
description: "لعبة تقمّص أدوار (RPG) بنظام الأدوار على Discord حيث كل حركة تولّد صورة WebP فوراً: URL كحالة اللعبة، RNG حتمي، خط أنابيب WASM، 5 مستويات تخزين مؤقت، بوت بدون خادم."
date: 2026-06-10authors:
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
author_sig: "RinlRvcbh0TKPrscX8kuXKrcexjmvEqyOloYf5jzx+zql8ftzYRKZIiMyKOGK3wlliFI4PGWh3Up21rm7lf/3w=="
---

# قضيت عطلة نهاية الأسبوع أقرأ كود konosuba-rpg وهذا ما وجدته

أنا المسؤول عن هذا المشروع منذ فترة، لكن إعادة قراءة الكود الخاص بك بروية هي دائماً تجربة تعليمية. konosuba-rpg هي لعبة تقمّص أدوار (RPG) بنظام الأدوار على Discord حيث كل حركة تولّد صورة WebP فوراً. ليس نص embed. بل صورة حقيقية مركبة، مع sprites وأشرطة الحياة ورسائل القتال -- كل شيء.

المكدس: TypeScript، Hono، Vercel، Cloudflare Workers، Supabase. استضافة مجانية بالكامل. وبوت Discord يعمل بدون خادم دائم. هذا المقال يشرح كيف يعمل كل هذا معاً.

![État initial du jeu](/images/konosuba-rpg/game_init.webp)

---

## التصميم الأساسي: URL كحالة اللعبة

أول ما يلفت الانتباه: لا توجد أية حالة على جانب الخادم لأسلوب اللعب. الحالة الكاملة لأي معركة موجودة في الـ URL.

```
/konosuba-rpg/fr/abc123/ATK/DEF/ATK/HUG?monster=Vanir&difficulty=hard
```

كل مقطع بعد الـ seed هو حركة تم تنفيذها. الخادم يستقبل هذا الـ URL، يعيد من البداية، يعيد تشغيل كل الحركات بالترتيب، ويعيد صورة المعركة في تلك اللحظة بالضبط. لا جلسة، ولا حالة في الذاكرة مرتبطة بأي مستخدم.

Discord يعمل عبر أزرار تفاعلية -- عندما يضغط اللاعب على "هجوم"، Discord يرسل للخادم `custom_id` الخاص بالزر. هذا الـ custom_id يحوي الـ URL المضغوط للمعركة مع الحركة الجديدة المضافة. الخادم يعيد حساب كل شيء من الصفر ويعيد الصورة المحدثة.

```typescript
// processUrl.ts
const VALID_MOVES_SET = new Set(["ATK", "DEF", "HUG", "HEA", "SPE", "USE"]);
// مُجمّع مسبقاً خارج الدالة -- لا يُعاد إنشاؤه في كل استدعاء

export default function processUrl(url: string): [Random, string[], string, string | null, string | null] {
  const urlParts = url.split("/");
  const moves: string[] = [];
  for (const part of urlParts) {
    if (VALID_MOVES_SET.has(part.toUpperCase())) moves.push(part.toUpperCase());
  }
  // seed = المقطع السادس، يُهاش على 8096 قيمة
  const seedStr = (urlParts[5] || "").toLowerCase();
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed + seedStr.charCodeAt(i)) % 8096;
  }
  return [new Random(seed), moves, seedStr, monster, difficulty];
}
```

`Set` المُجمّع خارج الدالة هو تفصيل صغير، لكنه يتجنب إعادة بناء الهيكل في كل استدعاء ضمن سياق edge حيث قد تُعاد تقييم modules.

### RNG: RC4 معدّل

مولد الأرقام العشوائي (RNG) هو تطبيق RC4 (خوارزمية تشفير تدفقي) تم تحويلها إلى PRNG.

```typescript
export class Random {
  private S: number[]; // جدول من 256 مدخلاً
  private i: number;
  private j: number;

  constructor(seed?: number) {
    this.S = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    let workingSeed = seed || Date.now();
    for (let i = 0; i < 256; i++) {
      j = (j + this.S[i] + (workingSeed & 0xff)) & 0xff;
      // swap S[i] و S[j]
      [this.S[i], this.S[j]] = [this.S[j], this.S[i]];
      workingSeed >>>= 8;
    }
  }

  next(): number { /* ... */ }
  randint(min: number, max: number): number { /* ... */ }
  choice(array: T[]): T { /* ... */ }
}
```

لماذا RC4؟ لأنه PRNG حتمي بتوزيع صحيح ومقاومة معقولة لتصادم الـ seed. نفس الـ seed = نفس تسلسل الأرقام = نفس المعركة في كل مرة. هذا يسمح بـ "إعادة تشغيل" أي معركة والاحتفاظ بـ URL الخاص بها، ويضمن أن خادمين مختلفين (Vercel + Cloudflare) ينتجان نفس النتيجة تماماً لنفس الـ URL.

---

## مشكلة حد 100 حرف في Discord

Discord يفرض حد 100 حرف على `custom_id` للأزرار. بعد بضع عشرات من الحركات، أي URL معركة يتجاوز هذا الحد بسهولة.

آليتان تتعاملان مع هذا.

### 1. ضغط RLE للحركات

الحركات تُرمّز بحرف واحد (`a`=هجوم, `d`=دفاع, `h`=عناق...) وتُضغط عبر تشفير طول التشغيل (RLE):

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

بسيط، لكن عندما يكرر اللاعب هجوم x10 فإن `aaaaaaaaaa` (10 حروف) تتحول إلى `a10` (3 حروف). أزرار "هجوم x4" و"هجوم x10" في واجهة المستخدم موجودة لهذا بالتحديد -- تسريع المعركة مع ضغط الحمولة جيداً.

### 2. رموز الجلسة (Session tokens) عندما لا يكفي الضغط

إذا بقيت الحمولة المضغوطة طويلة جداً، تُخزّن في قاعدة البيانات مع رمز قصير:

```typescript
// gameSessionService.ts
const TOKEN_PREFIX = "gs.";
const TOKEN_SIZE = 10; // "gs.aBcDeFgHiJ"

export async function encodeGameplayButtons(buttons: RawButton[]): Promise {
  // تجميع الحمولات حسب battle_key، إدراج دفعة في Supabase
  // استبدال custom_id بـ "gs.{token}:{userId}"
}

export async function decodeGameplayPayloadWithStatus(encodedPayload: string, userID: string) {
  if (!encodedPayload.startsWith(TOKEN_PREFIX)) {
    return { payload: encodedPayload }; // لا بحث إذا لم يكن ضرورياً
  }
  // بحث في الذاكرة أولاً، ثم Supabase إذا لم يوجد
  const cached = tokenToSession.get(token) || await loadTokenRowByToken(token);
  // تحقق من الملكية، TTL (7 أيام)، و turn_version (يمنع إعادة تشغيل حالة قديمة)
}
```

الجلسات لها TTL مدته 7 أيام وتنظيف تلقائي كل 10 دقائق. التحقق من `turnVersion` يمنع إعادة تشغيل حالة منتهية إذا كان اللاعب قد تقدّم في اللعبة -- حماية غير ظاهرة ضد "التراجع" العرضي.

كلا الخريطتين في الذاكرة (`tokenToSession`, `latestTurnByBattle`) تستخدمان نفس النمط `globalThis as unknown as GameSessionGlobals` مثل ذاكرات التخزين المؤقت للصور، لنفس الأسباب التي سنراها لاحقاً.

---

## خط أنابيب توليد الصور

![بداية معركة مع Slime](/images/konosuba-rpg/shot_01_start.webp)

المسار `/konosuba-rpg/:lang/*` لا يعيد JSON. بل يعيد صورة WebP مولّدة عند الطلب.

خط الأنابيب منظم في 3 طبقات مركّبة:

```
خلفية (board + frame)
    +
طبقة الشخصيات (sprites لاعبين + مخلوق، مواضع ثابتة)
    +
تراكب واجهة المستخدم (أشرطة HP، رسائل، أيقونات شخصيات عبر Satori → SVG → PNG)
    ↓
Photon.watermark() × 2
    ↓
مخرجات WebP
```

**الخلفية**: صورتان ثابتتان (اللوحة والإطار)، تُحمّلان من نظام الملفات وتُركبان مرة واحدة.

**طبقة الشخصيات**: sprites موضوعة حسب إحداثيات محسوبة. اللاعبون الموتى مستبعدون (`activeSlots = slots.filter(s => playerHp[s.i] > 0)`). sprites الأعداء معكوسة أفقياً باستخدام `flipX` مخصص -- حلقة بيكسل ببيكسل بدلاً من اعتماد خارجي.

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

**تراكب واجهة المستخدم**: هذا هو الجزء الثقيل. JSX الواجهة (أشرطة الحياة، نصوص، أيقونات) يُوصف بنمط React-like باستخدام Satori، يُحوّل إلى SVG، ثم يُحوّل إلى PNG بواسطة `@cf-wasm/resvg`، ثم يُستورد إلى Photon للتركيب النهائي. Satori + resvg هما وحدتان WASM مخصّصتان لـ Cloudflare Workers مع العلم `edge-light`.

![حركة دفاع](/images/konosuba-rpg/shot_03_defend.webp)

![معركة جارية](/images/konosuba-rpg/shot_02_combat.webp)

![حركة عناق](/images/konosuba-rpg/shot_04_hug.webp)

---

## نظام التخزين المؤقت -- الجزء الأكثر إتقاناً

هناك 5 مستويات تخزين مؤقت منفصلة. كل منها يستهدف تفصيلاً مختلفاً من خط الأنابيب.

```typescript
// renderImage.ts -- كلها على globalThis
G.__imageCache  ??= {} as Record; // الأصول الخام
G.__base64Cache ??= {} as Record;       // base64 للأصول (لـ Satori)
G.__fontCache   ??= {} as Record; // الخطوط
G.__photonCache    ??= new LRUCache(40, freePhoton);
G.__layerCache     ??= new LRUCache(12, freePhoton);
G.__uiPhotonCache  ??= new LRUCache(30, freePhoton);
G.__renderOutputCache ??= new LRUCache(120);
```

نمط `??=` على `globalThis`: modules JavaScript في edge workers قد تُعاد تقييمها بين الطلبات في بعض الإعدادات. تخزين الـ caches على `globalThis` مع `??=` يضمن بقاءها بعد هذه التقييمات دون إعادة إنشائها.

### إخلاء WASM (Eviction)

caches صور Photon (`photonCache`, `layerCache`, `uiPhotonCache`) تستخدم رد اتصال (callback) للإخلاء:

```typescript
function freePhoton(_key: string, img: Photon.PhotonImage): void {
  try { img.free(); } catch { /* تم التحرير بالفعل */ }
}

new LRUCache(40, freePhoton)
```

`Photon.PhotonImage` هو كائن WASM بذاكرة مخصّصة على الجانب الخطي لـ WASM، خارج GC الخاص بـ JavaScript. بدون استدعاء صريح لـ `.free()`، هذه الذاكرة لا تُحرّر أبداً. إخلاء LRU يقوم بتشغيل `.free()` تلقائياً -- هذا هو RAII منقول إلى JavaScript.

### مفاتيح التخزين المؤقت فقدانية عمداً

```typescript
function buildCharactersKey(playerImages: string[][], playerHp: number[], creatureImages: string[], creatureHp: number): string {
  const players = playerImages.map((imgs, i) => `${imgs[0]}:${playerHp[i] > 0 ? 1 : 0}`).join("|");
  return `chars::${players}::${creatureImages[0]}:${creatureHp > 0 ? 1 : 0}`;
}
```

مفتاح طبقة الشخصيات لا يرمّز القيمة الدقيقة لـ HP -- فقط `1` (حي) أو `0` (ميت). لأن صورة اللاعب عند 40 HP واللاعب عند 15 HP متطابقة. لذا فإن hit في التخزين المؤقت ينجو من أي ضرر طالما لم يسقط أحد.

مفتاح واجهة المستخدم بالمقابل يرمّز HP الدقيق (شريط الحياة يتغير مع كل ضربة) و hash للرسائل:

```typescript
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0; // عدد صحيح 32-bit مع إشارة
  }
  return hash.toString(16);
}
```

`Math.imul` يجبر الضرب على عدد صحيح 32 بت، مما يتجنب تحويلات float64 ويعطي معدل تعدد حدودي (polynomial hash) ثابت. لا اعتماد خارجي لهذا.

### تحويل base64 دون تجاوز الكومة (stack overflow)

```typescript
function getBase64Cached(key: string, buf: ArrayBuffer): string {
  if (base64Cache[key]) return base64Cache[key];
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000; // 32768 بايت
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  const b64 = btoa(binary);
  base64Cache[key] = b64;
  return b64;
}
```

`String.fromCharCode(...largeArray)` قد يسبب تجاوز الكومة (stack overflow) على الصور الكبيرة لأن الوسائط تُمرر على call stack. التقسيم إلى أجزاء 32 كيلوبايت يتجنب هذا. النتيجة تُخزّن مؤقتاً -- تحويل base64 لنفس الصورة يتم مرة واحدة فقط لكل نسخة worker.

---

## STRIPPER.md -- تدقيق await المتسلسلة

هناك ملف `STRIPPER.md` في المستودع يوثق تدقيقاً لموازاة `await`. بعض الأمثلة مما تم تسجيله:

- تحميل ملف اللاعب الشخصي كان يقوم بـ 3 استعلامات Supabase متسلسلة (التقدّم، ملخص الجولة، الإنجازات). تم تحويلها إلى `Promise.all` -- لا تبعية بينها.
- توزيع مكافآت نهاية المعركة (إكسسوارات + مواد استهلاكية) كان متسلسلاً. تمت موازاته أيضاً.
- إنشاء رموز الجلسة للأزرار كان يتم مجموعة بمجموعة. المجموعات المستقلة تُنشأ الآن بالتوازي.

```typescript
// progressionService.ts -- قبل (تسلسلي)
await grantAccessoryDropRewards(...);
await grantConsumableDropRewards(...);

// بعد
await Promise.all([
  grantAccessoryDropRewards(...),
  grantConsumableDropRewards(...),
]);
```

لا شيء ثورياً، لكن في سياق serverless حيث كل ملي ثانية من زمن الاستجابة تُفوتر (أو تساهم في cold start)، هذا مهم.

---

## بوت Discord بدون خادم دائم

![نصر](/images/konosuba-rpg/shot_05_win.webp)

نقطة يساء فهمها غالباً: بوت Discord لا يحتاج بالضرورة اتصال WebSocket دائم. Discord يقدم بديلاً: **Interactions Endpoint URL**. تقدم رابط HTTPS لـ Discord، و Discord يرسل لك POST لكل تفاعل (slash command، زر، autocomplete).

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

Discord يرسل POST، المعالج يعمل من 50 إلى 200 ملي ثانية على دالة Vercel أو Cloudflare Worker، يرد، وينتهي الأمر. لا اتصال دائم للحفاظ عليه، ولا خادم لإبقائه قيد التشغيل. بوت Discord بأكمله مستضاف على الخطة المجانية لـ Vercel.

التحقق Ed25519 (`verifyKey` من `discord-interactions`) إلزامي -- Discord يرسل توقيعاً في الترويسات (headers) يجب عليك التحقق منه، وإلا سيرفض النقطة الطرفية (endpoint).

### الحركة الخاصة -- الـ await المتعمد الوحيد

```typescript
// handleSpecialButton.ts
await new Promise(resolve => setTimeout(resolve, 3000)); // 3 ثوانٍ
await fetch(`${DISCORD_API_URL}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
  method: "PATCH",
  // ...
});
```

هذا التأخير المتعمد لـ 3 ثوانٍ موثّق في STRIPPER.md كمتعمّد. الهجوم الخاص لـ Megumin (انفجار) له حركة على جانب Discord -- تُحدّث الرسالة أولاً بمظهر وسيط، ثم تُعدّل بعد 3 ثوانٍ بالنتيجة. هذه هي الحالة الوحيدة التي تعمل فيها دالة Vercel لفترة أطول من اللازم عمداً.

![هجوم خاص](/images/konosuba-rpg/shot_08_special.webp)

---

## النشر على منصتين

نفس قاعدة الكود تعمل على Vercel (Node.js) وعلى Cloudflare Workers (V8 isolates) دون تعديل:

```typescript
// worker.ts -- نقطة دخول Cloudflare
export default {
  fetch(request: Request, env: WorkerBindings): Promise {
    syncBindingsToProcessEnv(env); // يحقن أسرار CF في process.env
    return app.fetch(request, env, ctx);
  }
};

// index.ts -- نقطة دخول Vercel/Node
const isVercelRuntime = process.env.VERCEL === "1";
if (!isVercelRuntime) { start(); }
```

الفرق الرئيسي: الأصول الثابتة (static assets). على Vercel، تُقرأ من نظام الملفات (`/var/task/assets/`). على Cloudflare Workers، تمر عبر binding `ASSETS` (أصول ثابتة CF) مع fallback إلى مرآة HTTPS (`fox3000foxy.com/konosuba-rpg/assets`). `getAssetBytes` في `assetLoader.ts` تدير كلا المسارين بمحاولة نظام الملفات أولاً، ثم fetch.

وحدات WASM (`@cf-wasm/photon/edge-light`, `@cf-wasm/resvg`) لها بنيات منفصلة لكل بيئة تشغيل. العلم `edge-light` في اسم الحزمة يشير إلى البنية المتوافقة مع Cloudflare Workers، والتي لا تسمح بـ `new WebAssembly.Module()` في وقت التشغيل -- يجب أن يكون WASM مُجمّعاً مسبقاً.

---

## التقدّم: XP، المستويات، الانتماء

![زعيم، 650 HP](/images/konosuba-rpg/shot_06_boss.webp)

التقدّم الكلي (meta-progression) يعتمد على الطبقة المجانية لـ Supabase. المخطط يشمل جدول `players` (XP كلي، مستوى، ذهب)، `character_progress` (XP/مستوى/انتماء لكل شخصية: Darkness، Aqua، Megumin)، `runs` (سجل المعارك)، `inventory_items`، `daily_quests_progress`، `achievements_unlocked`، `game_sessions`.

نموذج التقدّم بسيط:

```typescript
// characterService.ts
export function computeLevelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1; // 100 XP لكل مستوى
}

export function getLevelFactor(level: number): number {
  return 1 + 0.2 * (level - 1); // +20% إحصائيات لكل مستوى
}

export function getAffinityFactor(affinity: number): number {
  const stars = Math.floor(affinity / 20); // 20 نقطة لكل نجمة، 5 نجوم كحد أقصى
  return 1.2 ** stars; // تقدّم أسي
}
```

هذه العوامل تُطبّق على إحصائيات الشخصيات في بداية كل `processGame`. Kazuma يتبع المستوى العام للاعب، بينما الثلاثة الآخرون لكل منهم XP/مستوى خاص بهم. الانتماء (يُكتسب بجمع قطرات مرتبطة بشخصية) يضاعف إحصائياتها بشكل مستقل.

![شفاء](/images/konosuba-rpg/shot_07_heal.webp)

نظام القطرات يستخدم جداول غنائم موزونة حسب الصعوبة:

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
  // ...حتى Legendary
};
```

---

## الاختبارات

ثلاث مجموعات: وحدة (unit)، أداء (perf)، وتسرب (leak).

اختبار التسرب مباشر بشكل خاص:

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
  expect(after - before).toBeLessThan(20); // حد 20MB أقصى لنمو الكومة
});
```

1200 تكرار لـ `processGame`، GC قسري قبل وبعد، فرق heap < 20MB. إذا نجح هذا الاختبار، فإن `processGame` لا يسرب. اختبار التوليد (`renderImage.spec.ts`) بالتحقق من وقت التنفيذ تحت حد عملي.

يوجد أيضاً سكريبت `bench.ts` لتحليل خط الأنابيب بالكامل:

```
RENDER_PERF=1 npx tsx bench.ts --runs=20 --warmup=3 --monster=Dragon
```

مع `RENDER_PERF=1`، الغلاف `withPerf` في كل خدمة يسجل التوقيتات:

```typescript
export async function withPerf(scope: string, label: string, work: () => Promise): Promise {
  const perf = createPerfLogger(scope);
  if (!perf.enabled) return work(); // بدون أثر إذا معطّل
  perf.mark(`${label}:start`);
  try { return await work(); }
  finally { perf.done(`${label}:done`); }
}
```

`createPerfLogger` يُرجع no-ops إذا لم يكن `DEV_MODE` و `RENDER_PERF` على `1`. لا أثر إضافي في الإنتاج.

---

## تكلفة التشغيل

- **Vercel free tier**: 100GB نطاق ترددي، مليون استدعاء serverless شهرياً. توليد الصورة يُحتسب كاستدعاء واحد.
- **Cloudflare Workers free tier**: 100 ألف طلب/يوم، 10ms وقت وحدة معالجة مركزية لكل طلب (التوليد قد يتجاوز هذا على Workers، لذلك Vercel هو الأساسي).
- **Supabase free tier**: 500MB قاعدة بيانات، 5GB نطاق ترددي. كافٍ لآلاف اللاعبين.

النهاية الخلفية بأكملها تعمل بتكلفة صفرية حتى حجم استخدام كبير. نقطة الاحتكاك الوحيدة هي حد وحدة المعالجة المركزية لـ Cloudflare Workers -- توليد الصور يستهلك وحدة معالجة مركزية بكثافة بسبب WASM، ومن هنا استراتيجية Vercel كأساسي و Workers كـ CDN للتعويض (failover).

---

## 3 أشياء تستحق التذكر

1. **الـ URL كحالة اللعبة** ليست مجرد خدعة جميلة -- إنها قيد فرضه Discord (الأزرار لها حد 100 حرف) الذي أجبر على بنية عديمة الحالة (stateless) مع ضغط RLE + رمز جلسة كحل بديل. القيد هو ما صمّم التصميم.

2. **ذاكرة WASM المؤقتة مع إخلاء صريح**: كائنات `PhotonImage` تخصّص ذاكرة خارج كومة JavaScript ولن تُجمّع أبداً (GC) بدون `.free()`. ربط `freePhoton` بإخلاء LRU هو RAII في JavaScript. غير ظاهر في الكود، لكن بدونه كان الـ worker سيُسرب (leak) في الإنتاج.

3. **بوت Discord serverless بدون WebSocket**: أقل شهرة من نهج WebSocket gateway، لكن بالنسبة لبوت يقوم بمعالجة عديمة الحالة (كل تفاعل مستقل)، فإن Interactions Endpoint هو الأفضل قطعياً -- لا إعادة اتصال، لا heartbeat، لا عملية يجب الحفاظ عليها. Discord يدير التوفر على بنيته التحتية.

---

*المستودع: [fox3000foxy/konosuba-rpg](https://github.com/fox3000foxy/konosuba-rpg)*

*رخصة وصول-مصدر مخصصة -- لا إعادة توزيع، مجانية الاستخدام.*
