---
title: "قضيت عطلة نهاية أسبوع أقرأ كود konosuba-rpg وإليكم ما وجدت"
description: "RPG أدوار Discord حيث يولد كل فعل صورة WebP لحظيا : الرابط
  كحالة لعب وRNG حتمي وخط WASM وكاش من 5 مستويات وبوت بلا خادم."
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
author_sig: "STkimko4Vzewwh0HlIMFWicwXeo9h2IaF9Fq5Z/XtWT3A9olPjdhd6yVj58zzkKltRLEdDfn9g6SrrJjp5wnPw=="
---

# قضيت عطلة نهاية أسبوع أقرأ كود konosuba-rpg وإليكم ما وجدت

أصون هذا المشروع منذ مدة، لكن إعادة قراءة كود المرء برأس مرتاح مفيدة دائما. konosuba-rpg هو RPG أدوار في Discord حيث يولد كل فعل صورة WebP لحظيا. إنها صورة مركبة فعلا، مع sprites وأشرطة حياة ورسائل قتال، كل شيء.

الحزمة : TypeScript وHono وVercel وCloudflare Workers وSupabase. استضافة مجانية تماما. ويعمل بوت Discord دون خادم دائم. يشرح هذا المنشور كيف يتماسك كل ذلك.

![الحالة الأولية للعبة](/images/konosuba-rpg/game_init.webp)

---

## التصميم الأساسي : الرابط كحالة اللعبة

أول ما يدهش : لا توجد حالة جهة الخادم للعب. حالة القتال الكاملة تقف في الرابط.

```
/konosuba-rpg/fr/abc123/ATK/DEF/ATK/HUG?monster=Vanir&difficulty=hard
```

كل مقطع بعد البذرة فعل ملعوب. يستلم الخادم هذا الرابط، وينطلق من البداية، ويعيد تشغيل كل الأفعال بالترتيب، ويعيد صورة القتال في تلك اللحظة بالضبط. لا جلسة، ولا حالة في RAM مرتبطة بمستخدم.

يعمل Discord بأزرار تفاعلية، فعندما يضغط اللاعب "هجوم"، يرسل Discord للخادم `custom_id` الخاص بالزر. يحوي custom_id الرابط المضغوط للقتال مع الفعل الجديد المضاف. يعيد الخادم حساب كل شيء من الصفر ويعيد الصورة المحدثة.

```typescript
// processUrl.ts
const VALID_MOVES_SET = new Set(["ATK", "DEF", "HUG", "HEA", "SPE", "USE"]);
// مُجمَّع مسبقا خارج الدالة، لا يُعاد إنشاؤه مع كل استدعاء

export default function processUrl(url: string): [Random, string[], string, string | null, string | null] {
  const urlParts = url.split("/");
  const moves: string[] = [];
  for (const part of urlParts) {
    if (VALID_MOVES_SET.has(part.toUpperCase())) moves.push(part.toUpperCase());
  }
  // البذرة = المقطع السادس، مُجزَّأة على 8096 قيمة
  const seedStr = (urlParts[5] || "").toLowerCase();
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed + seedStr.charCodeAt(i)) % 8096;
  }
  return [new Random(seed), moves, seedStr, monster, difficulty];
}
```

`Set` المُجمَّع مسبقا خارج الدالة تفصيل، لكنه يتجنب إعادة بناء البنية مع كل استدعاء في سياق edge حيث يمكن إعادة تقييم الوحدات.

### RNG : نسخة معدلة من RC4

المولد العشوائي تنفيذ RC4 (خوارزمية تشفير تدفق) مُحوَّل إلى PRNG.

```typescript
export class Random {
  private S: number[]; // جدول 256 مدخلا
  private i: number;
  private j: number;

  constructor(seed?: number) {
    this.S = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    let workingSeed = seed || Date.now();
    for (let i = 0; i < 256; i++) {
      j = (j + this.S[i] + (workingSeed & 0xff)) & 0xff;
      // تبديل S[i] وS[j]
      [this.S[i], this.S[j]] = [this.S[j], this.S[i]];
      workingSeed >>>= 8;
    }
  }

  next(): number { /* ... */ }
  randint(min: number, max: number): number { /* ... */ }
  choice(array: T[]): T { /* ... */ }
}
```

لماذا RC4 ؟ لأنه PRNG حتمي بتوزيع صحيح ومقاومة معقولة لتصادمات البذور. نفس البذرة = نفس تسلسل الأرقام = نفس القتال في كل مرة. وهذا يسمح "بإعادة تشغيل" أي قتال بالاحتفاظ برابطه، ويضمن أن خادمين مختلفين (Vercel + Cloudflare) ينتجان بالضبط نفس النتيجة لنفس الرابط.

---

## مشكلة حد 100 حرف في Discord

يفرض Discord حد 100 حرف على `custom_id` الخاصة بالأزرار. بعد بضع عشرات من الأفعال، يتجاوز رابط قتال هذا الحد بارتياح.

تجيب آليتان عن ذلك.

### 1. ضغط RLE للأفعال

تُرمَّز الأفعال بحرف واحد (`a`=هجوم و`d`=دفاع و`h`=عناق...) وتُضغَط بترميز طول التشغيل :

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

بسيط، لكن عندما يغمر اللاعب الهجوم x10 ينتقل من `aaaaaaaaaa` (10 حروف) إلى `a10` (3 حروف). زرا "هجوم x4" و"هجوم x10" في الواجهة موجودان لهذا بالضبط، تسريع القتال مع ضغط الحمولة جيدا.

### 2. رموز جلسة عندما لا يكفي الضغط

إذا بقيت الحمولة المضغوطة طويلة أكثر من اللازم، تُخزَّن في القاعدة مع رمز قصير :

```typescript
// gameSessionService.ts
const TOKEN_PREFIX = "gs.";
const TOKEN_SIZE = 10; // "gs.aBcDeFgHiJ"

export async function encodeGameplayButtons(buttons: RawButton[]): Promise {
  // يجمّع الحمولات حسب battle_key، ويدخل دفعيا في Supabase
  // يستبدل custom_id بـ"gs.{token}:{userId}"
}

export async function decodeGameplayPayloadWithStatus(encodedPayload: string, userID: string) {
  if (!encodedPayload.startsWith(TOKEN_PREFIX)) {
    return { payload: encodedPayload }; // لا بحث إذا لم يلزم
  }
  // البحث في الذاكرة أولا، ثم Supabase إذا غاب
  const cached = tokenToSession.get(token) || await loadTokenRowByToken(token);
  // يتحقق من الملكية وTTL (7 أيام) وturn_version (يتجنب إعادة تشغيل حالة قديمة)
}
```

للجلسات TTL من 7 أيام وتقليم آلي كل 10 دقائق. يمنع فحص `turnVersion` إعادة تشغيل حالة متقادمة إذا تقدم اللاعب في المباراة، حماية خفية ضد "الرجوع" العرضي.

تستخدم خريطتا الذاكرة (`tokenToSession` و`latestTurnByBattle`) نفس نمط `globalThis as unknown as GameSessionGlobals` مثل كاشات الصور، لنفس الأسباب التي سنراها أدناه.

---

## خط عرض الصور

![بداية قتال ضد Slime](/images/konosuba-rpg/shot_01_start.webp)

لا يعيد طريق `/konosuba-rpg/:lang/*` JSON. بل يعيد صورة WebP مولدة عند الطلب.

الخط منظم في 3 طبقات مركبة :

```
Background (لوحة + إطار)
    +
Characters layer (sprites لاعبين + وحش، مواضع ثابتة)
    +
UI overlay (أشرطة HP ورسائل وأيقونات شخصيات عبر Satori ← SVG ← PNG)
    ↓
Photon.watermark() × 2
    ↓
مخرجات WebP
```

**الخلفية** : صورتان ثابتتان (اللوحة والإطار)، تُحمَّلان من نظام الملفات وتُركَّبان مرة.

**طبقة الشخصيات** : توضع sprites حسب إحداثيات محسوبة. يُستبعَد اللاعبون الموتى (`activeSlots = slots.filter(s => playerHp[s.i] > 0)`). تُعكَس sprites العدو أفقيا مع `flipX` مخصص، حلقة بكسل ببكسل بدلا من تبعية خارجية.

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

**تراكب الواجهة** : إنه الجزء الثقيل. واجهة JSX (أشرطة حياة ونصوص وأيقونات) موصوفة بنمط React مع Satori، وتُعرض SVG، وتُحوَّل PNG بواسطة `@cf-wasm/resvg`، ثم تُستورَد في Photon للتركيب النهائي. Satori وresvg وحدتا WASM مُجمَّعتان خصيصا لـCloudflare Workers مع علم `edge-light`.

![فعل دفاع](/images/konosuba-rpg/shot_03_defend.webp)

![قتال جارٍ](/images/konosuba-rpg/shot_02_combat.webp)

![فعل عناق](/images/konosuba-rpg/shot_04_hug.webp)

---

## نظام الكاش، الجزء الأكثر عملا

هناك 5 مستويات كاش متميزة. يستهدف كل واحد دقة مختلفة من الخط.

```typescript
// renderImage.ts، كلها على globalThis
G.__imageCache  ??= {} as Record; // أصول خام
G.__base64Cache ??= {} as Record;       // base64 الأصول (لـSatori)
G.__fontCache   ??= {} as Record; // خطوط
G.__photonCache    ??= new LRUCache(40, freePhoton);
G.__layerCache     ??= new LRUCache(12, freePhoton);
G.__uiPhotonCache  ??= new LRUCache(30, freePhoton);
G.__renderOutputCache ??= new LRUCache(120);
```

نمط `??=` على `globalThis` : يمكن إعادة تقييم وحدات JavaScript في workers الحافة بين الطلبات على بعض الإعدادات. تخزين الكاشات على `globalThis` مع `??=` يضمن نجاتها من إعادة التقييم دون إعادة إنشائها.

### إخلاء WASM

تستخدم كاشات صور Photon (`photonCache` و`layerCache` و`uiPhotonCache`) رد إخلاء :

```typescript
function freePhoton(_key: string, img: Photon.PhotonImage): void {
  try { img.free(); } catch { /* مُحرَّرة فعلا */ }
}

new LRUCache(40, freePhoton)
```

`Photon.PhotonImage` كائن WASM بذاكرة مخصصة جهة WASM الخطية، خارج GC الخاص بـJavaScript. تبقى هذه الذاكرة مخصصة ما لم يُستدعَ `.free()` صراحة. يحفّز إخلاء LRU دالة `.free()` تلقائيا، إنه RAII منقول إلى JavaScript.

### مفاتيح الكاش ضبابية عمدا

```typescript
function buildCharactersKey(playerImages: string[][], playerHp: number[], creatureImages: string[], creatureHp: number): string {
  const players = playerImages.map((imgs, i) => `${imgs[0]}:${playerHp[i] > 0 ? 1 : 0}`).join("|");
  return `chars::${players}::${creatureImages[0]}:${creatureHp > 0 ? 1 : 0}`;
}
```

لا يرمّز مفتاح طبقة الشخصيات قيمة HP الدقيقة، فقط `1` (حي) أو `0` (ميت). لأن sprite لاعب بـ40 HP ولاعب بـ15 HP متماثل. إذن تنجو إصابة كاش من أي ضرر ما لم يسقط أحد.

بينما يرمّز مفتاح الواجهة HP الدقيقة (يتغير شريط الحياة مع كل ضربة) وhash للرسائل :

```typescript
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0; // عدد صحيح 32-bit موقَّع
  }
  return hash.toString(16);
}
```

يجبر `Math.imul` الضرب في عدد صحيح 32 بت، مما يتجنب تحويلات float64 ويعطي hash متعدد الحدود مستقر. وهذا يتجنب إضافة تبعية خارجية لذلك.

### تحويل base64 دون فيض كومة

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

يمكن أن يسبب `String.fromCharCode(...largeArray)` فيض كومة على الصور الكبيرة لأن الوسائط تُمرَّر على كومة الاستدعاء. يتجنب التقطيع بـ32Ko ذلك. تُوضَع النتيجة في الكاش، فلا يُجرَى تحويل base64 لنفس الصورة إلا مرة لكل نسخة worker.

---

## STRIPPER.md، تدقيق awaits المتسلسلة

هناك ملف `STRIPPER.md` في المستودع يوثق تدقيق موازاة `await`. بعض أمثلة ما هو مدوَّن فيه :

- تحميل ملف اللاعب كان ينفذ 3 طلبات Supabase متسلسلة (تقدم وملخص جولة وإنجازات). نُقلت إلى `Promise.all`، لا تبعية بينها.
- توزيع مكافآت نهاية القتال (إكسسوارات + مستهلكات) كان متسلسلا. وُوزي بنفس الطريقة.
- إنشاء رموز جلسة للأزرار كان يتم مجموعة بمجموعة. تُنشأ الآن المجموعات المستقلة بالتوازي.

```typescript
// progressionService.ts، قبل (متسلسل)
await grantAccessoryDropRewards(...);
await grantConsumableDropRewards(...);

// بعد
await Promise.all([
  grantAccessoryDropRewards(...),
  grantConsumableDropRewards(...),
]);
```

لا شيء ثوري، لكن في سياق serverless حيث كل مللي ثانية من زمن الاستجابة مُفوترَة (أو تسهم في الإقلاع البارد)، يُحتسَب ذلك.

---

## بوت Discord دون خادم دائم

![نصر](/images/konosuba-rpg/shot_05_win.webp)

نقطة يُساء فهمها غالبا : لا يتطلب بوت Discord بالضرورة اتصال WebSocket دائما. يقترح Discord بديلا : **Interactions Endpoint URL**. تعطي رابط HTTPS لـDiscord، ويرسل لك Discord POST مع كل تفاعل (slash command وزر وإكمال تلقائي).

```typescript
// interactions.ts
export async function handleInteractions(c: Context) {
  const body = await c.req.text();
  const isVerified = await verifySignature(c, body); // Ed25519
  if (!isVerified) return c.text("Invalid signature", 401);

  const interaction: Interaction = JSON.parse(body);
  if (interaction.type === 1) return c.json({ type: 1 }); // ping الخاص بـDiscord
  if (interaction.type === 2) return handleSlashCommand(...);
  if (interaction.type === 3) return handleButtonInteraction(...);
  if (interaction.type === 4) return handleAutocomplete(...);
}
```

يرسل Discord POST، يعمل المعالج 50-200ms على دالة Vercel أو Cloudflare Worker، ويرد، وانتهى. لا اتصال دائم يُصان، ولا خادم يُبقَى مشتعلا. بوت Discord كله مستضاف على المستوى المجاني في Vercel.

التحقق Ed25519 (`verifyKey` من `discord-interactions`) إلزامي، فيرسل Discord توقيعا في الترويسات يجب التحقق منه، وإلا يرفض نقطة النهاية.

### الحركة الخاصة، await الوحيد المقصود

```typescript
// handleSpecialButton.ts
await new Promise(resolve => setTimeout(resolve, 3000)); // 3 ثوانٍ
await fetch(`${DISCORD_API_URL}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
  method: "PATCH",
  // ...
});
```

هذا التأخير الطوعي لـ3 ثوانٍ موثق في STRIPPER.md كمقصود. لهجوم Megumin الخاص (Explosion) حركة جهة Discord، يُحدَّث أولا الرسالة ببصري وسيط، ثم تُعدَّل بعد 3 ثوانٍ بالنتيجة. إنها الحالة الوحيدة حيث تعمل دالة Vercel طوعا أطول من اللازم.

![هجوم خاص](/images/konosuba-rpg/shot_08_special.webp)

---

## قابلية النشر على منصتين

يعمل نفس قاعدة الكود على Vercel (Node.js) وعلى Cloudflare Workers (V8 isolates) دون تعديل :

```typescript
// worker.ts، مدخل Cloudflare
export default {
  fetch(request: Request, env: WorkerBindings): Promise {
    syncBindingsToProcessEnv(env); // يحقن أسرار CF في process.env
    return app.fetch(request, env, ctx);
  }
};

// index.ts، مدخل Vercel/Node
const isVercelRuntime = process.env.VERCEL === "1";
if (!isVercelRuntime) { start(); }
```

الفرق الرئيسي : الأصول الثابتة. على Vercel، تُقرَأ من نظام الملفات (`/var/task/assets/`). على Cloudflare Workers، تمر عبر ربط `ASSETS` (أصول CF الثابتة) مع fallback نحو مرآة HTTPS (`fox3000foxy.com/konosuba-rpg/assets`). تدير دالة `getAssetBytes` في `assetLoader.ts` المسارين بتجربة نظام الملفات أولا، ثم fetch.

لدى WASM (`@cf-wasm/photon/edge-light` و`@cf-wasm/resvg`) بناءات منفصلة لكل runtime. يشير علم `edge-light` في اسم الحزمة للبناء المتوافق مع Cloudflare Workers، الذي لا يسمح بـ`new WebAssembly.Module()` عند التشغيل، فيجب تجميع WASM مسبقا.

---

## التقدم : XP ومستويات وألفة

![زعيم، 650 HP](/images/konosuba-rpg/shot_06_boss.webp)

يرتكز التقدم الوصفي على المستوى المجاني في Supabase. يتضمن المخطط جدول `players` (XP شامل ومستوى وذهب) و`character_progress` (XP/مستوى/ألفة لكل شخصية لـDarkness وAqua وMegumin) و`runs` (سجل القتالات) و`inventory_items` و`daily_quests_progress` و`achievements_unlocked` و`game_sessions`.

نموذج التقدم بسيط :

```typescript
// characterService.ts
export function computeLevelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1; // 100 XP لكل مستوى
}

export function getLevelFactor(level: number): number {
  return 1 + 0.2 * (level - 1); // +20% إحصاءات لكل مستوى
}

export function getAffinityFactor(affinity: number): number {
  const stars = Math.floor(affinity / 20); // 20 نقطة لكل نجمة، 5 نجوم حدا
  return 1.2 ** stars; // تقدم أسّي
}
```

تُطبَّق هذه العوامل على إحصاءات الشخصيات في بداية كل `processGame`. يتبع Kazuma المستوى الشامل للاعب، وللثلاثة الآخرين XP/مستوى خاص لكل واحد. تضرب الألفة (المكتسبة باسترجاع إسقاطات مرتبطة بشخصية) إحصاءاته مستقلة.

![شفاء](/images/konosuba-rpg/shot_07_heal.webp)

يستخدم نظام الإسقاطات جداول غنائم موزونة بالصعوبة :

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

ثلاث سلاسل : وحدات وأداء وتسريبات.

اختبار التسريب مباشر خصوصا :

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
  expect(after - before).toBeLessThan(20); // حد 20MB نمو كومة
});
```

1200 تكرار لـ`processGame`، وGC مُجبَر قبل وبعد، وفرق كومة < 20MB. إذا نجح هذا الاختبار، فلا يسرّب `processGame`. بينما يتحقق اختبار العرض (`renderImage.spec.ts`) من زمن التنفيذ تحت عتبة عملية.

وهناك أيضا سكربت `bench.ts` لتنميط الخط الكامل :

```
RENDER_PERF=1 npx tsx bench.ts --runs=20 --warmup=3 --monster=Dragon
```

مع `RENDER_PERF=1`، يسجل الغلاف `withPerf` في كل خدمة التوقيتات :

```typescript
export async function withPerf(scope: string, label: string, work: () => Promise): Promise {
  const perf = createPerfLogger(scope);
  if (!perf.enabled) return work(); // صفر عبء إذا عُطّل
  perf.mark(`${label}:start`);
  try { return await work(); }
  finally { perf.done(`${label}:done`); }
}
```

يعيد `createPerfLogger` عمليات معدومة إذا لم تكن `DEV_MODE` و`RENDER_PERF` على `1`. لا عبء في الإنتاج.

---

## ما kost تشغيله

- **المستوى المجاني في Vercel** : 100GB عرض نطاق و1M استدعاء serverless شهريا. يُحتسَب عرض الصورة كاستدعاء.
- **المستوى المجاني في Cloudflare Workers** : 100K طلب/يوم و10ms زمن CPU لكل طلب (قد يتجاوز العرض ذلك على Workers، ومن هنا Vercel أوليا).
- **المستوى المجاني في Supabase** : 500MB قاعدة و5GB عرض نطاق. كافٍ لآلاف اللاعبين.

يعمل backend كله بkost صفر حتى حجم ملحوظ. نقطة الاحتكاك الوحيدة هي حد CPU في Cloudflare Workers، فعرض الصور مكثف CPU بسبب WASM، ومن هنا استراتيجية Vercel أوليا وWorkers كـCDN احتياطي.

---

## الأشياء الثلاثة الجديرة بالتذكر

1. **الرابط كحالة لعب** ليس مجرد حيلة لطيفة، بل قيد فرضه Discord (للأزرار حد 100 حرف) الذي أجبر بنية عديمة الحالة مع ضغط RLE + رمز جلسة كاحتياطي. أملى القيد التصميم.

2. **كاش WASM مع إخلاء صريح** : تخصّص `PhotonImage` خارج كومة JavaScript ولن تُجمَع قمامة أبدا دون `.free()`. ربط `freePhoton` بإخلاء LRU هو RAII في JavaScript. إنه خفي في الكود، لكن دونه كان worker سيسرّب في الإنتاج.

3. **بوت Discord بلا خادم دون WebSocket** : إنه أقل شهرة من مقاربة بوابة WebSocket، لكن لبوت يقوم بمعالجة عديمة الحالة (كل تفاعل مستقل)، نقطة النهاية Interactions متفوقة تماما، لا إعادة اتصال ولا نبضات ولا عملية تُصان. يدير Discord التوافر جهة بنيته.

---

*المستودع : [fox3000foxy/konosuba-rpg](https://github.com/fox3000foxy/konosuba-rpg)*

*رخصة custom متاحة المصدر، لا إعادة توزيع، والاستخدام مجاني.*
