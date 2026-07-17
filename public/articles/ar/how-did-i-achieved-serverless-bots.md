---
title: "بوت Discord بدون سيرفر 100% : Hono + Cloudflare Workers"
description: كيف استبدلت بوت Discord كان يكلفني 50€/شهر بصفر يورو -- نقاط التفاعل،
  Hono، Workers، عرض الصور في الوقت الفعلي، ولعبة كاملة بدون WebSocket.
date: 2026-05-29
authors:
  - fox3000foxy
tags:
  - discord
  - cloudflare
  - serverless
  - typescript
  - bots
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "VbBEeLkrPack0rXh8NdtGeIPGWBK8jsvGQcp/TibLqI2s+dUtxyKp6flcnI2RBnBYydTq/L1tmdvoJFvQujJ4g=="
---

## بوت Discord بدون سيرفر 100% : Hono + Cloudflare Workers = 💸 صفر

قضيت بضعة أشهر في صيانة بوتات Discord تقليدية على جهازي الخاص.

اتصال WebSocket مفتوح دائمًا. البوت يعيد الاتصال تلقائيًا في الساعة 3 صباحًا. البوت يتعطل لأنني نظرت إلى الخروف بشكل خاطئ. الفاتورة ترتفع.

في يوم اكتشفت: **لماذا نحافظ على اتصال**؟ Discord يمكنه أن يرسل لك POST فقط الأشياء التي تهمك. ترد، ينتهي الأمر.

منذ 2021، Discord يقدم **نقاط التفاعل (interaction endpoints)**.

إنها مجرد HTTP. لا WebSocket. لا حالة دائمة. تستقبل طلبًا، ترسل JSON، ينتهي. الطلب التالي يأتي بمفرده.

والأفضل: Cloudflare Workers **مجاني** حتى 100k طلب/يوم. لـ 90% من البوتات، هذا يساوي 0€/شهر.

هذه المقالة تريك كيفية عمل بوت Discord بدون WebSocket باستخدام **Hono** (إطار ويب فائق الخفة) و **Cloudflare Workers**. سأريك مشروعين حقيقيين: **Nibi** (بوت لتعلم اليابانية، TTS، رائع) و **Konosuba-RPG** (لعبة Discord _كاملة_ مع عرض صور في الوقت الفعلي xD).

## WebSocket مقابل Interaction Endpoints : لماذا كانت فكرة سيئة

تخيل لعبة Minecraft حيث يجب عليك إبقاء الاتصال مفتوحًا حتى عندما لا تلعب.

والسيرفر يعيد الاتصال تلقائيًا كلما تعطل. يجب عليك إدارة المهلات، وإعادة الاتصال الأسي، وكل هذا البويلربليت السيئ الذي نكرهه. فقط لتلقي التفاعلات.

Interaction endpoints هو العكس. Discord يرسل POST على رابطك. ترد. ينتهي.

إذا تعطل سيرفرك؟ Discord يحاول 2-3 مرات ويمر إلى شيء آخر. لا دراما.

**التكلفة قبل** : 50€/شهر على Heroku فقط لإبقاء عملية Node حية.

**التكلفة بعد** : 0€/شهر على Cloudflare حتى 100k طلب/يوم.

## البنية : ما هي بالضبط؟

Discord يرسل POST على نقطة النهاية الخاصة بك.

```plaintext
Discord: "مرحبًا! المستخدم نقر على /ping!"
      ↓
   رابطك (Cloudflare Worker)
      ↓
تتحقق أنه بالفعل Discord (التحقق من التوقيع)
      ↓
تحلل نوع التفاعل
      ↓
تنفذ المعالج
      ↓
ترجع JSON
      ↓
Discord: "رائع، سأعرض هذا للمستخدم"
```

إنها HTTP خالص. لا سحر. لا مكتبات ثقيلة.

## Hono + Cloudflare Workers : التركيبة الاقتصادية

**Hono** هو إطار ويب وزنه 12KB. يعمل في كل مكان: Cloudflare Workers، Vercel، AWS Lambda، Deno، Bun... نفس الكود في كل مكان.

Cloudflare Workers هي حوسبة عند الحافة. طلباتك تصل إلى أقرب سيرفر. زمن الاستجابة: \<100ms. التكلفة: مجاني حتى 100k طلب/يوم.

تركيبة Hono + Cloudflare هي المطابقة المثالية لبوت Discord.

هذا هو الكود الأدنى لبوت كامل:

```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. استرجاع الهيدرات
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. التحقق من أنه بالفعل Discord (ليس سبام)
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3. تحليل ما أرسله
  const interaction = JSON.parse(body);

  // 4. الرد حسب النوع
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

يعني، 30 سطرًا وهذا بوت يعمل.

لا `bot.login()`. لا event emitter. لا callback hell. فقط HTTP.

للنشر على Cloudflare:

```plaintext
npm install -D wrangler
npx wrangler deploy
```

بوم. لديك رابط مثل `https://mon-bot.workers.dev/interactions`.

تضع هذا في Discord Developer Portal تحت "INTERACTIONS ENDPOINT URL"، وDiscord يبدأ بإرسال تفاعلاتك هناك.

## التحقق من التوقيع : لا طلبات مزيفة

Discord يوقع كل طلب بمفتاح عمومي. إذا استقبلت طلبًا بتوقيع خاطئ؟ إنه سبام. تجاهل واستمر.

حزمة `discord-interactions` تقوم بالمهمة:

```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // النص الخام بالضبط (ليس JSON محلل!)
  signature,         // الهيدر x-signature-ed25519
  timestamp,         // الهيدر x-signature-timestamp
  publicKey          // من Discord Dev Portal
);
```

**فخ مهم** : التوقيع يعتمد على الـ body _بالضبط_. إذا حللت JSON ثم أعدت تحويله إلى نص، أو إذا سجلت الـ body، فسوف تكسر التوقيع.

تحقق أولاً. حلل بعد ذلك. هذا هو الترتيب المهم.

## حالة 1 : Nibi (بوت تعلم اليابانية)

Nibi هو بوت Discord لتعلم اللغة اليابانية. أوامر بسيطة:

*   `/dictionary kanji` → يعرض التعريفات
*   `/pronounce テキスト` → يولد TTS (تحويل النص إلى كلام)
*   `/hello` → رسالة ترحيب

كل أمر عبارة عن ملف TypeScript:

```plaintext
src/commands/
├── dictionary.ts
├── pronounce.ts
├── hello.ts
└── ...
```

الأمر يطبق هذه الواجهة:

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

هذا هو الأمر الغريب. ترسل نصًا (romaji، hiragana، kanji، أي شيء)، البوت يحوله إلى hiragana، يولد TTS عبر VOICEVOX أو Google TTS، ويرسل رسالة صوتية على Discord.

```typescript
const pronounce: Command = {
  data: {
    name: 'pronounce',
    description: 'يولد TTS للنص الياباني',
    options: [
      {
        type: 3,  // STRING
        name: 'text',
        description: 'النص للنطق',
        required: true
      }
    ]
  },

  async execute(interaction, env) {
    const text = interaction.data.options[0].value;

    try {
      // 1. تحويل romaji → hiragana باستخدام Kuroshiro
      const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });

      // 2. توليد الصوت TTS
      const audioBuffer = await generateTTS(hiragana);

      // 3. رفع الملف إلى Discord
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
        data: { content: `النطق لـ "${text}"` }
      };
    } catch (err) {
      return {
        type: 4,
        data: {
          content: 'خطأ: تعذر توليد الصوت xD',
          flags: 64  // ephemeral (رسالة خاصة)
        }
      };
    }
  }
};
```

إنه جنون: تستدعي API خارجي، ترفع ملفًا إلى Discord، ترسل رسالة مع الملف. كل هذا بدون WebSocket، فقط HTTP.

### التخزين المستمر مع Supabase

Nibi يستخدم Supabase كمخزن key-value. للتحقق مما إذا كان المستخدم مسجلاً:

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

هذا بسيط جدًا (لا استعلامات SQL حقيقية، مجرد JSON)، لكنه يعمل. للبوتات الصغيرة هذا ممتاز.

## حالة 2 : Konosuba-RPG (لعبة Discord مع عرض صور)

حسنًا هذه مجنونة.

Konosuba-RPG هي **لعبة كاملة** على Discord. تحارب الوحوش، تكتسب XP، تجهز الإكسسوارات، ترتفع في المستوى. كل معركة تولد **صورة** في الوقت الفعلي. لا spritesheet محضّر مسبقًا. الصورة تُركب ديناميكيًا من إحصائيات اللاعب، والوحش، وحالة المعركة.

والصورة تُولد في \<500ms على Cloudflare Workers. حرفيًا.

### بنية العرض

```plaintext
Discord (تضغط "Attack")
    ↓
Cloudflare Worker يستقبل التفاعل
    ↓
تحديث حالة اللعبة (XP, HP, إلخ.)
    ↓
توليد JSX باستخدام Satori
    ↓
تحويل SVG → PNG باستخدام Resvg (Wasm)
    ↓
رفع الصورة إلى Discord
    ↓
إرسال الرسالة مع الصورة
```

كل هذا في أقل من ثانية. هذا مذهل.

### عرض الصور على Workers

Konosuba يستخدم **Satori** (JSX → SVG) و **Resvg** (SVG → PNG):

```typescript
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. إنشاء JSX للواجهة
  const jsx = (
    <div style="{{" display:="" 'flex',="" gap:="" '20px'="" }}>
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

تكتب JSX عادي. يصبح SVG. SVG يصبح PNG. \<100ms على Cloudflare Worker.

هل تستوعب القوة؟ إنه فقط... جميل xD

### حالة اللعبة والتقدم

بيانات اللاعب موجودة في Supabase:

```typescript
const player = await db
  .from('players')
  .select('*')
  .eq('discord_id', interaction.user.id)
  .single();

// اللاعب فاز
const { data: updated } = await db
  .from('players')
  .update({
    level: player.level + 1,
    xp: player.xp + xpGain
  })
  .eq('id', player.id);
```

كل إجراء (هجوم، دفاع، علاج) يحدث الإحصائيات في قاعدة البيانات. ثم تعيد توليد الصورة مع الإحصائيات الجديدة.

### التفاعلات : أزرار اللعب

اللعبة تستخدم **تفاعلات الأزرار** للإجراءات في المعركة:

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

عندما تضغط "Attack"، Discord يرسل POST للتفاعل مع `custom_id: 'battle_attack'`. المعالج يوجه هذا:

```typescript
if (interaction.type === 3) {
  // Component interaction (نقر زر، إلخ.)
  const customId = interaction.data.custom_id;

  if (customId === 'battle_attack') {
    return await handleAttack(interaction, env);
  }
  if (customId === 'battle_defend') {
    return await handleDefend(interaction, env);
  }
}
```

وبوم، تحسب الضرر، تحدث قاعدة البيانات، تعيد توليد الصورة، ترسل.

إنها لعبة كاملة تعتمد على الأدوار بدون أي استمرارية اتصال. مجرد HTTP بدون حالة. مكسور تمامًا xD

## Supabase : قاعدة البيانات المصممة للـ Workers

قواعد البيانات التقليدية (PostgreSQL، MySQL، MongoDB) مصممة لاتصالات TCP مستمرة. تفتح socket، تبقي الاتصال مفتوحًا، ترسل استعلامات. المشكلة: **Cloudflare Workers لا يدعم اتصالات TCP المستمرة**. كل طلب هو عملية مؤقتة. بمجرد أن ترد على العميل، يختفي Worker.

لا يمكنك فعل هذا:

```typescript
// هذا لا يعمل على Workers
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // اتصال TCP مستمر = ميت
```

وحتى مشغلات PostgreSQL الأصلية مثل `pg` أو `postgres.js` تستخدم اتصالات TCP. على Workers، تتعطل.

**Supabase يحل كل هذا.**

Supabase هو REST API فوق PostgreSQL. تقوم باستعلامات HTTP عادية. كل استدعاء مستقل، لا اتصال مستمر، لا حالة لإدارتها. إنه متكيف تمامًا مع النموذج الـ serverless.

```typescript
// هذا يعمل بشكل ممتاز على Workers
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

عميل Supabase (`@supabase/supabase-js`) يستخدم `fetch` تحت الغطاء. و `fetch` أصلي على Workers. صفر إعداد، صفر مشغل، صفر اتصال مستمر.

| قاعدة البيانات | متوافقة مع Workers؟ | لماذا |
| --- | --- | --- |
| **Supabase** | ✅ نعم | REST API بدون حالة، HTTP خالص |
| **PlanetScale (MySQL)** | ⚠️ جزئي | اتصال HTTPS فقط، لا معاملات طويلة |
| **Neon** | ⚠️ جزئي | فروع serverless لكن مشغل TCP ضروري |
| **Turso (libSQL)** | ⚠️ جزئي | HTTP ممكن لكن محدود |
| **Prisma/Prisma Postgres** | ❌ لا | يحتاج TCP مستمر |
| **MongoDB Atlas** | ❌ لا | مشغل TCP، لا REST API أصلي |
| **Redis (Upstash)** | ✅ نعم | REST API HTTP |

الميزة الحقيقية لـ Supabase ليست فقط قاعدة البيانات -- بل النظام البيئي بأكمله مصمم edge-first:

- **Auth** : REST API لإدارة الجلسات، يعمل بدون حالة
- **Storage** : رفع/تنزيل الملفات عبر HTTP
- **Realtime** : WebSocket اختياري، لكن يمكنك أيضًا الاستعلام عبر REST
- **Row Level Security** : قواعد الأمان في قاعدة البيانات، وليس في الـ backend الخاص بك

لبوت Discord serverless، Supabase هو الخيار الأبسط والأكثر موثوقية. لا مشغل لتكوينه، لا اتصال لصيانته، لا مهلات. مجرد استعلامات HTTP.

إذا أردت مثالًا حقيقيًا، انظر إلى Nibi أعلاه: كود التخزين المستمر هو حرفيًا `readJson()` و `writeJson()` على Supabase. لا ترحيلات، لا مخططات معقدة، لا إعداد مجنون. يعمل فورًا. وإذا أصبح بوتك كبيرًا، تهاجر إلى استعلامات SQL حقيقية دون تغيير المزود.

## Polyfills : عندما يريد Node العمل على Workers

بعض الحزم تتوقع واجهات برمجة Node. Kuromoji (محلل kanji) يستخدم `XMLHttpRequest`. الـ Workers لديهم `fetch`، وليس `XMLHttpRequest`.

حل بسيط: إضافة polyfill في أعلى index.ts:

```typescript
// Polyfill XMLHttpRequest لـ kuromoji
if (!globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest = class {
    // Stub أدنى
  } as any;
}
```

أو عمل وحدة مخصصة:

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

يدويًا، عمل بوت يتطلب الكثير من الـ boilerplate:

*   تحقق من توقيع Discord
*   توجيه أنواع التفاعل
*   إدارة الأوامر، المكونات، النوافذ المنبثقة
*   إرجاع JSON صالح

يمكننا تجريد كل هذا في حزمة npm. مثل:

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

بوم. 20 سطرًا بدلاً من 200. سيقلص Nibi إلى النصف بسهولة.

فكرة لوقت لاحق xD

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

الرابط الناتج: `https://mon-bot.workers.dev/interactions`

التكلفة: **مجاني** حتى 100k طلب/يوم. بعد ذلك: $0.50/مليون.

حرق: لن تنفق 100k طلب أبدًا إلا إذا كان لديك 10,000 مستخدم نشط.

### Vercel

```plaintext
npm run vercel:deploy
```

الرابط: `https://mon-bot-xyz.vercel.app/api/interactions`

نفس الشيء، مجاني.

### كليهما معًا

Hono يعمل في كل مكان. يمكنك نشر نفس الكود على Cloudflare AND Vercel. مفيد للتكرار أو الاختبار قبل الاختيار.

## قائمة سريعة

1.  إنشاء تطبيق على Discord Developer Portal
2.  نسخ PUBLIC\_KEY، BOT\_TOKEN، APP\_ID
3.  إنشاء المشروع:
4.  كتابة index.ts (تحقق التوقيع + التوجيه)
5.  تسجيل الـ slash commands (مرة واحدة):
6.  النشر:
7.  وضع الرابط في Discord (Developer Portal ← Application ← Interactions Endpoint URL)
8.  Discord يختبر الاتصال (يجب الرد على PING)
9.  دعوة البوت إلى سيرفر
10. تم الأمور

## المزايا والعيوب

**المزايا**

*   غير مكلف (مجاني حتى 100k طلب/يوم)
*   قابل للتوسع (لا إدارة اتصال)
*   بسيط (لا boilerplate لـ WebSocket)
*   سريع (Cloudflare = سيرفرات عند الحافة)
*   محمول (كود Huno = عدة مستضيفين)

**العيوب**

*   لا أحداث سيرفر في الوقت الفعلي (عضو ينضم، دور يضاف، رسالة تُحذف، إلخ.) -- تستقبل فقط التفاعلات (slash commands، أزرار، نوافذ منبثقة)
*   مهلة 3 ثوانٍ للرد -- وإلا Discord يعرض "Application did not respond"
*   إذا احتجت أحداثًا حقيقية -- تحتاج webhook HTTP منفصل أو اتصال WebSocket مساعد

لـ 90% من البوتات (كلها مبنية على slash commands)؟ هذا كافٍ.

## للختام

قضيت وقتًا لا بأس به في تحسين KonosubaRPG و Nibi لتوفير أكبر عدد ممكن من الطلبات، أو لتقليل وقت المعالجة الساخنة، أو لتقليل boot البارد. النتيجة، لدي أداء رائع في كل شيء تقريبًا.
يجب أن تعلم أنني بدأت في نقل (لا أعرف حتى إذا كانت الكلمة صحيحة) معظم مشاريعي إلى السحابة لأنني كنت أكسل بشكل هائل عن الاستمرار في استضافتها على جهاز VM الخاص بي. حقًا، أعتقد أن Github Actions هي التي أنقذت جلدي. الـ Workers أيضًا، لكن في الحقيقة عندما رأيت أنه يمكنني عمل daemons مع Github Actions والجداول الزمنية، هذا أنقذني حقًا.

سأكتب على الأرجح مقالة عن مشروع اسمه [email-autoreply](https://github.com/fox3000foxy/email-autoreply/)، لذا اشتركوا في خلاصة RSS لرؤيتها قريبًا :)).
x
**3 أشياء يجب تذكرها:**

1.  **Interaction endpoints = HTTP serverless** -- لا WebSocket، لا اتصال مستمر. Discord يرسل POST، ترد. مجاني على Cloudflare.
2.  **Hono هو الأداة المثالية** -- إطار خفيف (12KB)، متعدد بيئات التشغيل، صفر تبعيات. كود متطابق على Cloudflare، Vercel، Node، في كل مكان.
3.  **عرض الصور على Workers = جنون** -- Satori + Resvg (Wasm) تسمح لك بتركيب واجهات ديناميكية في JSX وتحويلها إلى PNG في \<100ms. لعبة كاملة يمكنها العمل على هذا.

إنه مكسور xD

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
