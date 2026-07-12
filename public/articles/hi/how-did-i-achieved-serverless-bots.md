---
title: "Discord bot 100% सर्वरलेस : Hono + Cloudflare Workers"
description: कैसे मैंने एक Discord बॉट को जो मुझे 50€/माह खर्च कराता था, शून्य
  यूरो में बदल दिया -- इंटरैक्शन एंडपॉइंट्स, Hono, Workers, रीयल-टाइम
  इमेज रेंडरिंग, और WebSocket के बिना एक पूरा गेम।
date: 2026-05-29authors:
  - fox3000foxy
tags:
  - discord
  - cloudflare
  - serverless
  - typescript
  - bots
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "g/E5r6hO8lz5iSg+97w4KNC4f4uA2DeMX6tIXMxZf6qszqdb7QJgEJKMdZfRnqoc8eRzwT8A/6lzNLWOgMd+BA=="
---

## Discord bot 100% सर्वरलेस : Hono + Cloudflare Workers = 💸 शून्य

मैंने कुछ महीने अपनी खुद की मशीन पर सामान्य Discord बॉट्स को मेंटेन करने में बिताए।

WebSocket कनेक्शन हमेशा खुला रहता है। बॉट सुबह 3 बजे खुद रीकनेक्ट करता है। बॉट क्रैश हो जाता है बिना किसी कारण के। बिल बढ़ता जाता है।

एक दिन मुझे पता चला : **कनेक्शन क्यों बनाए रखें** ? Discord सिर्फ वो चीज़ें POST कर सकता है जिनमें तुम्हारी रुचि हो। तुम जवाब दो, बस हो गया।

2021 से, Discord **इंटरैक्शन एंडपॉइंट्स** प्रदान करता है।

यह सिर्फ HTTP है। कोई WebSocket नहीं। कोई स्थायी स्थिति नहीं। तुम्हें एक रिक्वेस्ट मिलती है, तुम JSON भेजते हो, बस हो गया। अगली रिक्वेस्ट अपने आप आ जाती है।

और सबसे अच्छी बात : Cloudflare Workers **मुफ़्त** है 100k रिक्वेस्ट/दिन तक। 90% बॉट्स के लिए, यह 0€/माह है।

यह लेख तुम्हें दिखाता है कि बिना WebSocket के Hono (अल्ट्रा-लाइटवेट वेब फ्रेमवर्क) और Cloudflare Workers का उपयोग करके Discord बॉट कैसे बनाया जाता है। मैं तुम्हें दो वास्तविक प्रोजेक्ट दिखाऊंगा : **Nibi** (जापानी सीखने के लिए बॉट, TTS, कूल) और **Konosuba-RPG** (रीयल-टाइम इमेज रेंडरिंग के साथ एक _पूरा_ Discord गेम xD)।

## WebSocket बनाम इंटरैक्शन एंडपॉइंट्स : यह बुरा विचार क्यों था

एक Minecraft गेम की कल्पना करो जहाँ तुम्हें कनेक्शन खुला रखना है भले ही तुम खेल नहीं रहे हो।

और सर्वर हर बार क्रैश होने पर अपने आप रीकनेक्ट होता है। तुम्हें टाइमआउट, एक्सपोनेंशियल रीकनेक्शन, वह सब बेकार बॉयलरप्लेट संभालना होता है जिससे हम नफरत करते हैं। सिर्फ इंटरैक्शन प्राप्त करने के लिए।

इंटरैक्शन एंडपॉइंट्स इसका उल्टा है। Discord तुम्हारे URL पर POST करता है। तुम जवाब देते हो। बस हो गया।

अगर तुम्हारा सर्वर क्रैश हो जाए ? Discord 2-3 बार रीट्राई करता है और आगे बढ़ जाता है। कोई ड्रामा नहीं।

**पहले की लागत** : Heroku पर 50€/माह सिर्फ एक Node प्रोसेस को जीवित रखने के लिए।

**बाद की लागत** : Cloudflare पर 0€/माह 100k रिक्वेस्ट/दिन तक।

## आर्किटेक्चर : यह आखिर है क्या ?

Discord तुम्हारे एंडपॉइंट पर एक रिक्वेस्ट POST करता है।

```plaintext
Discord: "अरे! उपयोगकर्ता ने /ping पर क्लिक किया!"
      ↓
   तुम्हारा URL (Cloudflare Worker)
      ↓
तुम जाँच करते हो कि यह सच में Discord है (सिग्नेचर चेक)
      ↓
तुम इंटरैक्शन टाइप को पार्स करते हो
      ↓
तुम हैंडलर को एक्सीक्यूट करते हो
      ↓
तुम JSON लौटाते हो
      ↓
Discord: "बढ़िया, मैं यह उपयोगकर्ता को दिखाऊंगा"
```

यह शुद्ध HTTP है। कोई जादू नहीं। कोई भारी लाइब्रेरी नहीं।

## Hono + Cloudflare Workers : किफायती कॉम्बो

**Hono** एक वेब फ्रेमवर्क है जिसका वजन 12KB है। यह हर जगह चलता है : Cloudflare Workers, Vercel, AWS Lambda, Deno, Bun... एक ही कोड हर जगह।

Cloudflare Workers एज पर कंप्यूट है। तुम्हारी रिक्वेस्ट सबसे नज़दीकी सर्वर पर पहुँचती है। रिस्पॉन्स टाइम : \<100ms. लागत : 100k रिक्वेस्ट/दिन तक मुफ़्त।

Hono + Cloudflare का कॉम्बो Discord बॉट के लिए परफेक्ट मैच है।

यह रहा एक पूर्ण बॉट का न्यूनतम कोड :

```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. हेडर प्राप्त करो
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. जाँच करो कि यह सच में Discord है (स्पैम नहीं)
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3. उसने जो भेजा है उसे पार्स करो
  const interaction = JSON.parse(body);

  // 4. टाइप के अनुसार जवाब दो
  if (interaction.type === 1) {
    // Discord test (PING)
    return c.json({ type: 1 });
  }

  if (interaction.type === 2) {
    // यह एक स्लैश कमांड है
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

बस, 30 लाइनें और यह एक काम करने वाला बॉट है।

कोई `bot.login()` नहीं। कोई event emitter नहीं। कोई callback hell नहीं। बस HTTP।

Cloudflare पर डिप्लॉय करने के लिए :

```plaintext
npm install -D wrangler
npx wrangler deploy
```

बूम। तुम्हें एक URL मिलता है जैसे `https://mon-bot.workers.dev/interactions`।

इसे Discord Developer Portal में "INTERACTIONS ENDPOINT URL" के तहत डालो, और Discord वहाँ तुम्हारी इंटरैक्शन भेजना शुरू कर देगा।

## सिग्नेचर वेरिफिकेशन : कोई फ़ेक रिक्वेस्ट नहीं

Discord हर रिक्वेस्ट पर पब्लिक की से साइन करता है। अगर तुम्हें गलत सिग्नेचर वाली रिक्वेस्ट मिले ? यह स्पैम है। इसे अनदेखा करो और आगे बढ़ो।

`discord-interactions` पैकेज यह काम करता है :

```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // सटीक रॉ टेक्स्ट (पार्स किया हुआ JSON नहीं!)
  signature,         // हेडर x-signature-ed25519
  timestamp,         // हेडर x-signature-timestamp
  publicKey          // Discord Dev Portal से
);
```

**महत्वपूर्ण ट्रैप** : सिग्नेचर _सटीक_ body पर निर्भर करता है। अगर तुम JSON पार्स करके फिर से stringify करते हो, या body को लॉग करते हो, तो सिग्नेचर टूट जाता है।

पहले जाँच करो। बाद में पार्स करो। यही सही क्रम है।

## केस 1 : Nibi (जापानी सीखने का बॉट)

Nibi जापानी सीखने के लिए एक Discord बॉट है। सरल कमांड्स :

*   `/dictionary kanji` → परिभाषाएँ दिखाता है
*   `/pronounce テキスト` → TTS (टेक्स्ट-टू-स्पीच) जनरेट करता है
*   `/hello` → स्वागत संदेश

हर कमांड एक TypeScript फ़ाइल है :

```plaintext
src/commands/
├── dictionary.ts
├── pronounce.ts
├── hello.ts
└── ...
```

एक कमांड इस इंटरफ़ेस को इम्प्लीमेंट करती है :

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

### /pronounce कमांड : बॉट को बोलने दो

यह वाली काफी अजीब है। तुम टेक्स्ट भेजते हो (रोमाजी, हीरागाना, कांजी, कुछ भी), बॉट इसे हीरागाना में बदलता है, VOICEVOX या Google TTS के ज़रिए TTS जनरेट करता है, और Discord पर एक ऑडियो संदेश भेजता है।

```typescript
const pronounce: Command = {
  data: {
    name: 'pronounce',
    description: 'जापानी टेक्स्ट के लिए TTS जनरेट करता है',
    options: [
      {
        type: 3,  // STRING
        name: 'text',
        description: 'उच्चारण करने के लिए टेक्स्ट',
        required: true
      }
    ]
  },

  async execute(interaction, env) {
    const text = interaction.data.options[0].value;

    try {
      // 1. Kuroshiro से रोमाजी → हीरागाना
      const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });

      // 2. TTS ऑडियो जनरेट करो
      const audioBuffer = await generateTTS(hiragana);

      // 3. फ़ाइल को Discord पर अपलोड करो
      const uploadFilename = await uploadToDiscord(
        audioBuffer,
        interaction.channel.id,
        env.BOT_TOKEN
      );

      // 4. ऑडियो के साथ संदेश भेजो
      await sendVoiceMessage(
        interaction.channel.id,
        uploadFilename,
        audioBuffer.length / 16000,  // सेकंड में अवधि
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
          content: 'त्रुटि : ऑडियो जनरेट नहीं कर सका xD',
          flags: 64  // ephemeral (निजी संदेश)
        }
      };
    }
  }
};
```

यह पागलपन है : तुम एक बाहरी API कॉल करते हो, Discord पर एक फ़ाइल अपलोड करते हो, फ़ाइल के साथ एक संदेश भेजते हो। यह सब बिना WebSocket के, सिर्फ HTTP से।

### Supabase के साथ पर्सिस्टेंस

Nibi Supabase को key-value स्टोर के रूप में उपयोग करता है। यह जाँचने के लिए कि कोई उपयोगकर्ता पंजीकृत है या नहीं :

```typescript
const DatabaseUtils = new DatabaseUtils({
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY
});

const users = await DatabaseUtils.readJson('users');
const user = users.find(u => u.id === interaction.member.user.id);

if (!user) {
  // उपयोगकर्ता जोड़ो
  users.push({ id: interaction.member.user.id, verified: true });
  await DatabaseUtils.writeJson('users', users);
}
```

यह बहुत बुनियादी है (कोई असली SQL क्वेरी नहीं, सिर्फ JSON), लेकिन यह काम करता है। छोटे बॉट्स के लिए यह परफेक्ट है।

## केस 2 : Konosuba-RPG (इमेज रेंडरिंग के साथ Discord गेम)

ठीक है यह वाला पागलपन है।

Konosuba-RPG Discord पर एक **पूरा गेम** है। तुम मॉब्स से लड़ते हो, XP कमाते हो, एक्सेसरीज़ इक्विप करते हो, लेवल अप करते हो। हर बैटल एक रीयल-टाइम **इमेज** जनरेट करती है। कोई प्री-रेंडर्ड स्प्राइटशीट नहीं। इमेज प्लेयर के स्टैट्स, मॉब और बैटल की स्थिति से डायनामिक रूप से कंपोज़ होती है।

और इमेज Cloudflare Workers पर \<500ms में जनरेट होती है। सचमुच।

### रेंडर आर्किटेक्चर

```plaintext
Discord (तुम "Attack" पर क्लिक करते हो)
    ↓
Cloudflare Worker इंटरैक्शन प्राप्त करता है
    ↓
गेम स्टेट अपडेट (XP, HP, आदि)
    ↓
Satori के साथ JSX जनरेट करो
    ↓
Resvg (Wasm) से SVG → PNG बदलो
    ↓
इमेज Discord पर अपलोड करो
    ↓
इमेज के साथ संदेश भेजो
```

यह सब एक सेकंड से भी कम में। यह कमाल है।

### Workers पर इमेज रेंडरिंग

Konosuba **Satori** (JSX → SVG) और **Resvg** (SVG → PNG) का उपयोग करता है :

```typescript
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. UI के लिए JSX बनाओ
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

तुम सामान्य JSX लिखते हो। वह SVG बन जाता है। SVG PNG बन जाता है। Cloudflare Worker पर \<100ms।

समझ रहे हो कितनी ताकत है ? यह बस... सुंदर है xD

### गेम स्टेट और प्रोग्रेस

प्लेयर डेटा Supabase में है :

```typescript
const player = await db
  .from('players')
  .select('*')
  .eq('discord_id', interaction.user.id)
  .single();

// प्लेयर जीत गया
const { data: updated } = await db
  .from('players')
  .update({
    level: player.level + 1,
    xp: player.xp + xpGain
  })
  .eq('id', player.id);
```

हर एक्शन (हमला, बचाव, उपचार) डेटाबेस में स्टैट्स अपडेट करता है। और फिर तुम नए स्टैट्स के साथ इमेज दोबारा जनरेट करते हो।

### इंटरैक्शन : गेमप्ले के बटन

गेम कॉम्बैट एक्शन के लिए **बटन इंटरैक्शन** का उपयोग करता है :

```typescript
{
  type: 1,  // ActionRow
  components: [
    {
      type: 2,  // Button
      style: 1,  // Primary (नीला)
      label: 'Attack',
      custom_id: 'battle_attack'
    },
    {
      type: 2,
      style: 2,  // Secondary (ग्रे)
      label: 'Defend',
      custom_id: 'battle_defend'
    }
  ]
}
```

जब तुम "Attack" पर क्लिक करते हो, Discord `custom_id: 'battle_attack'` के साथ एक इंटरैक्शन POST करता है। हैंडलर इसे रूट करता है :

```typescript
if (interaction.type === 3) {
  // Component interaction (बटन क्लिक, आदि)
  const customId = interaction.data.custom_id;

  if (customId === 'battle_attack') {
    return await handleAttack(interaction, env);
  }
  if (customId === 'battle_defend') {
    return await handleDefend(interaction, env);
  }
}
```

और बूम, तुम नुकसान की गणना करते हो, डेटाबेस अपडेट करते हो, इमेज रीजनरेट करते हो, भेजते हो।

यह बिना किसी कनेक्शन पर्सिस्टेंस के एक पूरा टर्न-बेस्ड गेम है। बस HTTP स्टेटलेस। पूरी तरह से पागलपन xD

## Supabase : Workers के लिए बनी DB

पारंपरिक डेटाबेस (PostgreSQL, MySQL, MongoDB) स्थायी TCP कनेक्शन के लिए डिज़ाइन किए गए हैं। तुम एक सॉकेट खोलते हो, कनेक्शन खुला रखते हो, क्वेरी भेजते हो। समस्या : **Cloudflare Workers स्थायी TCP कनेक्शन सपोर्ट नहीं करता**। हर रिक्वेस्ट एक अस्थायी प्रक्रिया है। जैसे ही तुम क्लाइंट को जवाब देते हो, Worker गायब हो जाता है।

तुम यह नहीं कर सकते :

```typescript
// यह Workers पर काम नहीं करता
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // स्थायी TCP कनेक्शन = डेड
```

और यहाँ तक कि नेटिव PostgreSQL ड्राइवर जैसे `pg` या `postgres.js` भी TCP कनेक्शन का उपयोग करते हैं। Workers पर, वे क्रैश हो जाते हैं।

**Supabase यह सब हल करता है।**

Supabase PostgreSQL के ऊपर एक REST API है। तुम सामान्य HTTP रिक्वेस्ट करते हो। हर कॉल स्वतंत्र है, कोई स्थायी कनेक्शन नहीं, कोई स्टेट मैनेज नहीं करना। यह सर्वरलेस मॉडल के लिए पूरी तरह उपयुक्त है।

```typescript
// यह Workers पर पूरी तरह काम करता है
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

Supabase क्लाइंट (`@supabase/supabase-js`) अंदरूनी रूप से `fetch` का उपयोग करता है। और `fetch` Workers पर नेटिव है। जीरो कॉन्फ़िगरेशन, जीरो ड्राइवर, जीरो स्थायी कनेक्शन।

| डेटाबेस | Workers के साथ संगत ? | क्यों |
| --- | --- | --- |
| **Supabase** | ✅ हाँ | REST API स्टेटलेस, शुद्ध HTTP |
| **PlanetScale (MySQL)** | ⚠️ आंशिक | केवल HTTPS कनेक्शन, कोई लंबा ट्रांज़ैक्शन नहीं |
| **Neon** | ⚠️ आंशिक | सर्वरलेस ब्रांचेज़ लेकिन TCP ड्राइवर आवश्यक |
| **Turso (libSQL)** | ⚠️ आंशिक | HTTP संभव लेकिन सीमित |
| **Prisma/Prisma Postgres** | ❌ नहीं | स्थायी TCP आवश्यक |
| **MongoDB Atlas** | ❌ नहीं | TCP ड्राइवर, कोई नेटिव REST API नहीं |
| **Redis (Upstash)** | ✅ हाँ | REST API HTTP |

Supabase का असली फायदा सिर्फ DB नहीं है -- पूरा इकोसिस्टम एज-फर्स्ट सोचा गया है :

- **Auth** : सेशन मैनेज करने के लिए REST API, स्टेटलेस काम करता है
- **Storage** : HTTP के ज़रिए फ़ाइल अपलोड/डाउनलोड
- **Realtime** : वैकल्पिक WebSocket, लेकिन REST के ज़रिए पोल भी कर सकते हो
- **Row Level Security** : सुरक्षा नियम DB में हैं, तुम्हारे बैकएंड में नहीं

सर्वरलेस Discord बॉट के लिए, Supabase सबसे सरल और सबसे भरोसेमंद विकल्प है। कोई ड्राइवर कॉन्फ़िगर नहीं करना, कोई कनेक्शन बनाए नहीं रखना, कोई टाइमआउट नहीं। बस HTTP रिक्वेस्ट।

अगर तुम एक वास्तविक उदाहरण चाहते हो, ऊपर Nibi देखो : पर्सिस्टेंस कोड सचमुच Supabase पर `readJson()` और `writeJson()` है। कोई माइग्रेशन नहीं, कोई जटिल स्कीमा नहीं, कोई पागल कॉन्फ़िग नहीं। यह सीधे काम करता है। और अगर तुम्हारा बॉट बड़ा हो जाता है, तुम प्रोवाइडर बदले बिना असली SQL क्वेरी पर माइग्रेट कर सकते हो।

## पॉलीफ़िल्स : जब Node Workers पर चलना चाहता है

कुछ पैकेज Node APIs की उम्मीद करते हैं। Kuromoji (कांजी पार्सर) `XMLHttpRequest` का उपयोग करता है। Workers के पास `XMLHttpRequest` नहीं, `fetch` है।

सरल उपाय : index.ts के शीर्ष पर एक पॉलीफ़िल जोड़ो :

```typescript
// kuromoji के लिए XMLHttpRequest पॉलीफ़िल
if (!globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest = class {
    // न्यूनतम स्टब
  } as any;
}
```

या एक समर्पित मॉड्यूल बनाओ :

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

यह बुनियादी हैक है, लेकिन काम करता है।

## एक npm पैकेज की ओर : hono-discord-interactions

हाथ से बॉट बनाने में बहुत बॉयलरप्लेट है :

*   Discord सिग्नेचर जाँच करो
*   इंटरैक्शन टाइप रूट करो
*   कमांड्स, कम्पोनेंट्स, मॉडल्स संभालो
*   मान्य JSON लौटाओ

हम यह सब एक npm पैकेज में एब्स्ट्रैक्ट कर सकते हैं। जैसे :

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

बूम। 200 के बजाय 20 लाइनें। यह Nibi को आसानी से आधा कर देगा।

बाद के लिए विचार xD

## डिप्लॉय

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

परिणामी URL : `https://mon-bot.workers.dev/interactions`

लागत : 100k रिक्वेस्ट/दिन तक **मुफ़्त**। उससे अधिक : $0.50/मिलियन।

स्पॉइलर : जब तक तुम्हारे 10,000 सक्रिय उपयोगकर्ता न हों, तुम कभी 100k रिक्वेस्ट नहीं पहुँचोगे।

### Vercel

```plaintext
npm run vercel:deploy
```

URL : `https://mon-bot-xyz.vercel.app/api/interactions`

वैसे ही, मुफ़्त।

### दोनों एक साथ

Hono हर जगह चलता है। तुम एक ही कोड Cloudflare और Vercel दोनों पर डिप्लॉय कर सकते हो। रिडंडेंसी के लिए या चुनने से पहले परीक्षण के लिए उपयोगी।

## त्वरित चेकलिस्ट

1.  Discord Developer Portal पर एक Application बनाओ
2.  PUBLIC\_KEY, BOT\_TOKEN, APP\_ID कॉपी करो
3.  प्रोजेक्ट बनाओ :
4.  index.ts लिखो (सिग्नेचर वेरिफिकेशन + रूटिंग)
5.  स्लैश कमांड्स रजिस्टर करो (एक बार) :
6.  डिप्लॉय करो :
7.  Discord में URL डालो (Developer Portal → Application → Interactions Endpoint URL)
8.  Discord कनेक्शन टेस्ट करता है (तुम्हें PING का जवाब देना होगा)
9.  बॉट को एक सर्वर पर इनवाइट करो
10.  हो गया

## लाभ बनाम सीमाएँ

**लाभ**

*   सस्ता (100k req/दिन तक मुफ़्त)
*   स्केलेबल (कोई कनेक्शन मैनेजमेंट नहीं)
*   सरल (कोई WebSocket बॉयलरप्लेट नहीं)
*   तेज़ (Cloudflare = एज सर्वर)
*   पोर्टेबल (Hono कोड = कई होस्ट)

**सीमाएँ**

*   कोई रीयल-टाइम सर्वर इवेंट नहीं (मेंबर जॉइन, रोल ऐड, मैसेज डिलीट, आदि) -- तुम्हें केवल इंटरैक्शन मिलते हैं (स्लैश कमांड्स, बटन, मॉडल्स)
*   जवाब देने के लिए 3 सेकंड का टाइमआउट -- नहीं तो Discord "Application did not respond" दिखाता है
*   अगर तुम्हें असली इवेंट चाहिए -- एक अलग HTTP वेबहुक या सहायक WebSocket कनेक्शन चाहिए

90% बॉट्स के लिए (सभी स्लैश कमांड-आधारित) ? यह ठीक है।

## निष्कर्ष

मैंने KonosubaRPG और Nibi को ऑप्टिमाइज़ करने में काफी समय बिताया, या तो जितना संभव हो उतनी रिक्वेस्ट बचाने के लिए, या हॉट प्रोसेसर समय कम करने के लिए, या कोल्ड बूट कम करने के लिए। परिणामस्वरूप, मुझे लगभग हर चीज़ पर शानदार परफॉरमेंस मिली।
यह जान लो कि मैंने अपने अधिकांश प्रोजेक्ट्स को क्लाउडिफाई करना शुरू कर दिया था (मुझे नहीं पता यह शब्द सही है या नहीं) क्योंकि मुझे उन्हें अपनी खुद की VM पर होस्ट करते रहने में बहुत आलस आ रहा था। सच में, मुझे लगता है कि Github Actions ने मेरी जान बचाई। Workers ने भी, लेकिन जब मैंने देखा कि मैं Github Actions और शेड्यूल के साथ डेमॉन बना सकता हूँ, तो इसने सच में मुझे बहुत बचाया।

मैं शायद [email-autoreply](https://github.com/fox3000foxy/email-autoreply/) नामक एक प्रोजेक्ट पर एक लेख लिखूंगा, इसलिए इसे जल्द ही देखने के लिए RSS फ़ीड को सब्सक्राइब करो :))।

**याद रखने वाली 3 बातें :**

1.  **इंटरैक्शन एंडपॉइंट्स = HTTP सर्वरलेस** -- कोई WebSocket नहीं, कोई स्थायी कनेक्शन नहीं। Discord POST करता है, तुम जवाब देते हो। Cloudflare पर मुफ़्त।
2.  **Hono सही टूल है** -- हल्का फ्रेमवर्क (12KB), मल्टी-रनटाइम, शून्य डिपेंडेंसी। Cloudflare, Vercel, Node, हर जगह एक जैसा कोड।
3.  **Workers पर इमेज रेंडरिंग = पागलपन** -- Satori + Resvg (Wasm) तुम्हें JSX में डायनामिक UI कंपोज़ करने और उन्हें \<100ms में PNG में बदलने देता है। एक पूरा गेम इस पर चल सकता है।

यह कमाल है xD

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
