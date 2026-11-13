---
title: "بوت Discord بلا خادم 100% : Hono + Cloudflare Workers"
description: كيف استبدلت بوت Discord الذي كان يكلفني 50€/شهر بصفر يورو،
  نقاط تفاعل وHono وWorkers وعرض صور في الوقت الحقيقي ولعبة كاملة دون WebSocket.
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
author_sig: "YSnoVs/Eg7FrZP96GrsoLu0ri9Q+INuv1veiwwbDe2rQZYlhp7QXNSBAS31t5wi+SOwgo+OCVK/4r0UekvBuSQ=="
---

## بوت Discord بلا خادم 100% : Hono + Cloudflare Workers = 💸 صفر

قضيت بضعة أشهر أصون بوتات Discord تقليدية على آلتي الخاصة.

اتصال WebSocket مفتوح دائما. يعيد البوت الاتصال وحده في 3 صباحا. ينهار البوت لأني أنظر للأغنام نظرة خاطئة. الفاتورة تصعد.

يوما اكتشفت : **لماذا أصون اتصالا** ؟ يستطيع Discord أن يرسل لك POST فقط الأحداث التي تهمك. ترد، انتهى.

منذ 2021، يقترح Discord **نقاط التفاعل**.

إنها مجرد HTTP. تعمل دون WebSocket ودون حالة دائمة. تستلم طلبا، وترسل JSON، انتهى. يصل الطلب التالي وحده.

والأفضل : Cloudflare Workers **مجاني** حتى 100k طلب/يوم. لـ90% من البوتات، هذا 0€/شهر.

يريك هذا المقال كيف تصنع بوت Discord دون WebSocket باستخدام **Hono** (إطار ويب خفيف للغاية) و**Cloudflare Workers**. سأريك مشروعين حقيقيين : **Nibi** (بوت لتعلم اليابانية وTTS ورائع) و**Konosuba-RPG** (لعبة Discord _كاملة_ مع عرض صور في الوقت الحقيقي).

## WebSocket ضد نقاط التفاعل : لماذا كانت فكرة سيئة

تخيل لعبة Minecraft حيث يجب إبقاء الاتصال مفتوحا حتى عندما لا تلعب.

ويعيد الخادم الاتصال تلقائيا كلما انهار. يجب أن تدير المهلات وإعادات الاتصال الأسّية، وكل boilerplate اللعين الذي نكرهه. فقط لاستلام تفاعلات.

نقاط التفاعل هي العكس. يرسل Discord POST على رابطك. ترد. انتهى.

إذا انهار خادمك ؟ يعيد Discord المحاولة 2-3 مرات ويمضي لشيء آخر. صفر دراما.

**الkost قبل** : 50€/شهر على Heroku فقط ليبقى عملية Node حية.

**الkost بعد** : 0€/شهر على Cloudflare حتى 100k طلب/يوم.

## البنية : ما هي بالضبط ؟

يرسل Discord POST طلبا على نقطتك.

```plaintext
Discord: "مرحبا ! نقر المستخدم على /ping!"
      ↓
   رابطك (Cloudflare Worker)
      ↓
تتحقق أنه فعلا Discord (فحص توقيع)
      ↓
تحلل نوع التفاعل
      ↓
تنفذ المعالج
      ↓
تعيد JSON
      ↓
Discord: "رائع، سأعرض ذلك للمستخدم"
```

إنه HTTP خالص، مع حزمة دنيا ومقروءة.

## Hono + Cloudflare Workers : الثنائي المقتصد

**Hono** إطار ويب يزن 12KB. يعمل في كل مكان : Cloudflare Workers وVercel وAWS Lambda وDeno وBun... نفس الكود في كل مكان.

Cloudflare Workers هو حساب عند الحافة. تصل طلباتك لأقرب خادم. زمن الاستجابة : \<100ms. الـkost : مجاني حتى 100k طلب/يوم.

ثنائي Hono + Cloudflare هو المباراة المثالية لبوت Discord.

إليكم الكود الأدنى لبوت كامل :

```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. استرجاع الترويسات
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. تحقق أنه فعلا Discord (لا spam)
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3. حلل ما أرسله
  const interaction = JSON.parse(body);

  // 4. رد حسب النوع
  if (interaction.type === 1) {
    // اختبار Discord (PING)
    return c.json({ type: 1 });
  }

  if (interaction.type === 2) {
    // إنها slash command
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

تكفي 30 سطرا لبوت عامل.

تنسى `bot.login()` وباعثات الأحداث وجحيم callbacks. تحتفظ فقط بـHTTP.

للنشر على Cloudflare :

```plaintext
npm install -D wrangler
npx wrangler deploy
```

بوم. لديك رابط مثل `https://mon-bot.workers.dev/interactions`.

تضع ذلك في Discord Developer Portal تحت "INTERACTIONS ENDPOINT URL"، ويبدأ Discord إرسال تفاعلاتك هناك.

## التحقق من التوقيع : لا طلبات مزيفة

يوقّع Discord كل طلب بمفتاح عام. إذا استلمت طلبا بتوقيع سيئ ؟ إنه spam. تجاهل وواصل.

تقوم حزمة `discord-interactions` بالمهمة :

```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // النص الخام الدقيق (لا JSON مُحلَّل !)
  signature,         // ترويسة x-signature-ed25519
  timestamp,         // ترويسة x-signature-timestamp
  publicKey          // من Discord Dev Portal
);
```

**فخ مهم** : يعتمد التوقيع على الجسم _الدقيق_. إذا حللت JSON وأعدت تحويله لسلسلة، أو سجلت الجسم، تكسر التوقيع.

تحقق أولا. حلل بعدها. هذا هو الترتيب المهم.

## الحالة 1 : Nibi (بوت تعلم اليابانية)

Nibi بوت Discord لتعلم اليابانية. أوامر بسيطة :

*   `/dictionary kanji` ← يعرض التعاريف
*   `/pronounce テキスト` ← يولد TTS (تحويل نص لكلام)
*   `/hello` ← رسالة ترحيب

كل أمر ملف TypeScript :

```plaintext
src/commands/
├── dictionary.ts
├── pronounce.ts
├── hello.ts
└── ...
```

ينفذ أمر هذه الواجهة :

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

### أمر /pronounce : جعل البوت يتكلم

إنه الغريب فعلا. ترسل نصا (romaji أو hiragana أو kanji أو أي شيء)، يحوّله البوت إلى hiragana، ويولد TTS عبر VOICEVOX أو Google TTS، ويرسل رسالة صوتية على Discord.

```typescript
const pronounce: Command = {
  data: {
    name: 'pronounce',
    description: 'يولد TTS لنص ياباني',
    options: [
      {
        type: 3,  // STRING
        name: 'text',
        description: 'نص للنطق',
        required: true
      }
    ]
  },

  async execute(interaction, env) {
    const text = interaction.data.options[0].value;

    try {
      // 1. تحويل romaji ← hiragana مع Kuroshiro
      const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });

      // 2. توليد صوت TTS
      const audioBuffer = await generateTTS(hiragana);

      // 3. رفع الملف نحو Discord
      const uploadFilename = await uploadToDiscord(
        audioBuffer,
        interaction.channel.id,
        env.BOT_TOKEN
      );

      // 4. إرسال الرسالة مع الصوت
      await sendVoiceMessage(
        interaction.channel.id,
        uploadFilename,
        audioBuffer.length / 16000,  // المدة بالثواني
        env.BOT_TOKEN
      );

      return {
        type: 4,
        data: { content: `النطق لـ"${text}"` }
      };
    } catch (err) {
      return {
        type: 4,
        data: {
          content: 'خطأ : مستحيل توليد الصوت xD',
          flags: 64  // ephemeral (رسالة خاصة)
        }
      };
    }
  }
};
```

إنه مجنون : تستدعي API خارجية، وترفع ملفا نحو Discord، وترسل رسالة مع الملف. كل ذلك دون WebSocket، فقط HTTP.

### الثبات مع Supabase

يستخدم Nibi قاعدة Supabase كمخزن key-value. للتحقق إن كان مستخدم مسجلا :

```typescript
const DatabaseUtils = new DatabaseUtils({
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY
});

const users = await DatabaseUtils.readJson('users');
const user = users.find(u => u.id === interaction.member.user.id);

if (!user) {
  // إضافة المستخدم
  users.push({ id: interaction.member.user.id, verified: true });
  await DatabaseUtils.writeJson('users', users);
}
```

إنه أساسي جدا (لا استعلامات SQL حقيقية، فقط JSON)، لكنه يعمل. للبوتات الصغيرة إنه مثالي.

## الحالة 2 : Konosuba-RPG (لعبة Discord مع عرض صور)

حسنا هذه مجنونة.

Konosuba-RPG **لعبة كاملة** على Discord. تقاتل وحوشا، وتكسب XP، وتجهز إكسسوارات، وتصعد مستوى. كل معركة تولد **صورة** في الوقت الحقيقي. تتجنب spritesheets المُصيَّرة مسبقا. تُركَّب الصورة ديناميكيا من إحصاءات اللاعب والوحش وحالة القتال.

وتُولَّد الصورة في \<500ms على Cloudflare Workers. حرفيا.

### بنية العرض

```plaintext
Discord (تنقر "Attack")
    ↓
يستلم Cloudflare Worker التفاعل
    ↓
تحديث حالة اللعبة (XP وHP، إلخ.)
    ↓
توليد JSX مع Satori
    ↓
تحويل SVG ← PNG مع Resvg (Wasm)
    ↓
رفع الصورة نحو Discord
    ↓
إرسال الرسالة مع الصورة
```

كل ذلك في أقل من ثانية. إنه مجنون.

### عرض صور جهة Workers

يستخدم Konosuba **Satori** (JSX ← SVG) و**Resvg** (SVG ← PNG) :

```typescript
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. إنشاء JSX للواجهة
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

  // 2. JSX ← SVG
  const svg = await satori.render(jsx, {
    width: 1200,
    height: 800,
    fonts: [/* ... */]
  });

  // 3. SVG ← PNG
  const png = resvg.render(svg).asPng();

  return png;  // Uint8Array
}
```

تكتب JSX عادي. يصبح SVG. يصبح SVG صورة PNG. في \<100ms على Cloudflare Worker.

تستوعب القوة ؟ إنها جميلة فقط.

### حالة اللعبة والتقدم

بيانات اللاعب في Supabase :

```typescript
const player = await db
  .from('players')
  .select('*')
  .eq('discord_id', interaction.user.id)
  .single();

// فاز اللاعب
const { data: updated } = await db
  .from('players')
  .update({
    level: player.level + 1,
    xp: player.xp + xpGain
  })
  .eq('id', player.id);
```

كل فعل (هجوم ودفاع وشفاء) يحدّث الإحصاءات في القاعدة. ثم تعيد توليد الصورة مع الإحصاءات الجديدة.

### التفاعلات : أزرار اللعب

تستخدم اللعبة **تفاعلات أزرار** لأفعال القتال :

```typescript
{
  type: 1,  // ActionRow
  components: [
    {
      type: 2,  // Button
      style: 1,  // Primary (أزرق)
      label: 'Attack',
      custom_id: 'battle_attack'
    },
    {
      type: 2,
      style: 2,  // Secondary (رمادي)
      label: 'Defend',
      custom_id: 'battle_defend'
    }
  ]
}
```

عندما تنقر "Attack"، يرسل Discord POST تفاعلا مع `custom_id: 'battle_attack'`. يوجّه المعالج ذلك :

```typescript
if (interaction.type === 3) {
  // تفاعل مكون (نقرة زر، إلخ.)
  const customId = interaction.data.custom_id;

  if (customId === 'battle_attack') {
    return await handleAttack(interaction, env);
  }
  if (customId === 'battle_defend') {
    return await handleDefend(interaction, env);
  }
}
```

وبوم، تحسب الأضرار، وتحدّث القاعدة، وتعيد توليد الصورة، وترسل.

إنها لعبة أدوار كاملة دون أي ثبات للاتصال. فقط HTTP عديم الحالة. معطوبة تماما.

## Supabase : قاعدة البيانات المصممة لـWorkers

قواعد البيانات التقليدية (PostgreSQL وMySQL وMongoDB) مصممة لاتصالات TCP دائمة. تفتح socket، وتُبقي الاتصال مفتوحا، وترسل استعلامات. المشكلة : **لا تدعم Cloudflare Workers اتصالات TCP دائمة**. كل طلب عملية زائلة. بمجرد ردك على العميل، يختفي Worker.

لا تستطيع فعل هذا :

```typescript
// هذا لا يعمل على Workers
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // اتصال TCP دائم = ميت
```

وحتى مشغلات PostgreSQL الأصلية مثل `pg` أو `postgres.js` تستخدم اتصالات TCP. على Workers، تنهار.

**تحل Supabase كل ذلك.**

Supabase هي REST API فوق PostgreSQL. تنفذ طلبات HTTP عادية. كل استدعاء مستقل، دون اتصال دائم، ودون حالة تُدار. إنها ملائمة تماما لنموذج serverless.

```typescript
// هذا يعمل تماما على Workers
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

يستخدم عميل Supabase (`@supabase/supabase-js`) دالة `fetch` تحت الغطاء. ودالة `fetch` أصلية على Workers. صفر إعداد وصفر مشغل وصفر اتصال دائم.

| قاعدة البيانات | متوافقة مع Workers ؟ | لماذا |
| --- | --- | --- |
| **Supabase** | ✅ نعم | REST API دون حالة وHTTP خالص |
| **PlanetScale (MySQL)** | ⚠️ جزئي | اتصال HTTPS فقط، دون معاملات طويلة |
| **Neon** | ⚠️ جزئي | فروع serverless لكن يلزم مشغل TCP |
| **Turso (libSQL)** | ⚠️ جزئي | HTTP ممكن لكن محدود |
| **Prisma/Prisma Postgres** | ❌ لا | يتطلب TCP دائما |
| **MongoDB Atlas** | ❌ لا | مشغل TCP، ولا REST API أصلي |
| **Redis (Upstash)** | ✅ نعم | REST API عبر HTTP |

ميزة Supabase الحقيقية ليست فقط قاعدة البيانات، بل النظام البيئي كله المصمم edge-first :

- **Auth** : REST API لإدارة الجلسات، يعمل دون حالة
- **Storage** : رفع/تنزيل ملفات عبر HTTP
- **Realtime** : WebSocket اختياري، لكن تستطيع أيضا الاستطلاع عبر REST
- **Row Level Security** : قواعد الأمان في قاعدة البيانات، لا في خلفيتك

لبوت Discord بلا خادم، Supabase هو الخيار الأبسط والأكثر موثوقية. لا تضبط مشغلا، ولا تصون اتصالا، ولا تدير مهلة. فقط ترسل طلبات HTTP.

إذا أردت مثالا حقيقيا، انظر Nibi أعلاه : كود الثبات هو حرفيا `readJson()` و`writeJson()` على Supabase. تبدأ دون ترحيلات ودون مخطط معقد ودون إعداد ثقيل. يعمل مباشرة. وإذا كبر بوتك، تهاجر نحو استعلامات SQL حقيقية دون تغيير المزود.

## Polyfills : عندما تريد Node العمل على Workers

تتوقع بعض الحزم واجهات Node. يستخدم Kuromoji (محلل kanji) خاصية `XMLHttpRequest`. لدى Workers خاصية `fetch`، لا `XMLHttpRequest`.

حل بسيط : إضافة polyfill في أعلى index.ts :

```typescript
// Polyfill خاصية XMLHttpRequest لـkuromoji
if (!globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest = class {
    // Stub دنيا
  } as any;
}
```

أو صنع وحدة مخصصة :

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

إنه hack أساسي، لكنه يعمل.

## نحو حزمة npm : hono-discord-interactions

يدويا، صنع بوت هو الكثير من boilerplate :

*   تحقق من توقيع Discord
*   وجّه أنواع التفاعل
*   أدِر الأوامر والمكونات والنوافذ
*   أعد JSON صالحا

يمكن تجريد كل ذلك في حزمة npm. مثلا :

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
        data: { content: `مرحبا ${interaction.member.user.username}!` }
      })
    }
  ]
});

const app = new Hono();
app.post('/interactions', handler);
export default app;
```

بوم. 20 سطرا بدلا من 200. سيقلّص ذلك Nibi إلى النصف بسهولة.

فكرة لاحقا.

## النشر

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

الرابط الناتج : `https://mon-bot.workers.dev/interactions`

الkost : **مجاني** حتى 100k طلب/يوم. بعدها : $0.50/مليون.

تشويق : لن تنفق أبدا 100k طلب إلا إذا كان لديك 10 000 مستخدم نشط.

### Vercel

```plaintext
npm run vercel:deploy
```

الرابط : `https://mon-bot-xyz.vercel.app/api/interactions`

نفس الشيء، مجاني.

### الاثنان معا

يعمل Hono في كل مكان. تستطيع نشر نفس الكود على Cloudflare وVercel. مفيد للازدواج أو الاختبار قبل الاختيار.

## قائمة فحص سريعة

1.  إنشاء تطبيق على Discord Developer Portal
2.  نسخ PUBLIC\_KEY وBOT\_TOKEN وAPP\_ID
3.  إنشاء المشروع :
4.  كتابة index.ts (فحص توقيع + توجيه)
5.  تسجيل slash commands (مرة) :
6.  النشر :
7.  وضع الرابط في Discord (Developer Portal ← Application ← Interactions Endpoint URL)
8.  يختبر Discord الاتصال (يجب أن ترد على PING)
9.  دعوة البوت على خادم
10.  انتهى الأمر

## مزايا ضد حدود

**مزايا**

*   kost دنيا (مجاني حتى 100k طلب/يوم)
*   قابل للتوسع (دون إدارة اتصال)
*   بسيط (دون boilerplate خاص بـWebSocket)
*   سريع (Cloudflare = خوادم عند الحافة)
*   محمول (كود Hono = مضيفون متعددون)

**حدود**

*   تستلم فقط التفاعلات (slash commands وأزرار ونوافذ)، دون أحداث الخادم في الوقت الحقيقي (انضمام عضو وإضافة دور وحذف رسالة، إلخ.)
*   مهلة 3 ثوانٍ للرد، وإلا يعرض Discord "Application did not respond"
*   إذا احتجت أحداثا حقيقية، يلزم webhook HTTP منفصل أو اتصال WebSocket مساعد

لـ90% من البوتات (كلها قائمة على slash commands) ؟ إنه جيد.

## للختم

قضيت وقتا طويلا في تحسين KonosubaRPG وNibi لتوفير إما أكبر عدد طلبات ممكن، أو لتقليل زمن المعالج الساخن، أو لتقليل الإقلاع البارد. النتيجة، لدي أداء رائع في كل شيء تقريبا.
اعلم أنني بدأت في جعل معظم مشاريعي سحابية (لا أعرف حتى إن قيل ذلك) لأن كسلا هائلا منعني من مواصلة استضافتها على VM خاصتي. فعلا، أظن أن Github Actions هي التي أنقذت جلدي. Workers أيضا، لكن في الواقع عندما رأيت أنني أستطيع صنع daemons مع Github Actions والجداول، أنقذني ذلك فعلا.

سأكتب غالبا مقالا عن مشروع اسمه [email-autoreply](https://github.com/fox3000foxy/email-autoreply/)، إذن اشتركوا في تدفق RSS لرؤيته يصدر قريبا :)).

**النقاط الثلاث للتذكر :**

1.  **نقاط التفاعل = HTTP بلا خادم**، دون WebSocket ودون اتصال دائم. يرسل Discord POST، وترد. مجاني على Cloudflare.
2.  **Hono هو الأداة المثالية**، إطار خفيف (12KB) ومتعدد runtime وصفر تبعيات. كود مطابق على Cloudflare وVercel وNode وفي كل مكان.
3.  **عرض الصور على Workers = مجنون**، يتيح لك Satori + Resvg (Wasm) تركيب واجهات ديناميكية في JSX وتحويلها إلى PNG في \<100ms. يمكن للعبة كاملة العمل على ذلك.

إنه مريض.

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
