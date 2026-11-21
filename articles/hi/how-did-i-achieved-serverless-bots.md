---
title: "Discord बॉट 100% serverless : Hono + Cloudflare Workers"
description: मैंने 50€/महीना वाला Discord बॉट शून्य euro से कैसे बदला, interaction endpoint, Hono, Workers, वास्तविक समय छवि रेंडर, और बिना WebSocket पूरा गेम।
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
author_sig: "2a8vZ5JkuSoEelX+6CVnY1F9pcOWZYb2sh2jRjlATKG5R8H6De1HiRNXTXY0ZTxhEQ7WnIDzvTkvPm3EUQBqbg=="
---

## Discord बॉट 100% serverless : Hono + Cloudflare Workers = 💸 शून्य

मैंने अपनी मशीन पर क्लासिक Discord बॉट बनाए रखने में कुछ महीने बिताए।

हमेशा खुला WebSocket कनेक्शन। बॉट रात 3 बजे खुद फिर से जुड़ता है। बॉट crash करता है क्योंकि मैं भेड़ों को टेढ़ा देखता हूँ। बिल बढ़ता है।

एक दिन मैंने खोजा : **कनेक्शन बनाए क्यों रखना** ? Discord तुम्हें सिर्फ रुचि की घटनाएँ POST कर सकता है। तुम जवाब देते हो, हो गया।

2021 से, Discord **interaction endpoint** देता है।

यह बस HTTP है। तुम बिना WebSocket, बिना स्थायी स्थिति काम करते हो। तुम अनुरोध पाते हो, तुम JSON भेजते हो, खत्म। अगला अनुरोध अपने आप आता है।

और सबसे अच्छा : Cloudflare Workers 100k अनुरोध/दिन तक **मुफ्त** है। 90% बॉट के लिए, यह 0€/महीना है।

यह लेख दिखाता है कि **Hono** (अति हल्का वेब framework) और **Cloudflare Workers** इस्तेमाल करके बिना WebSocket Discord बॉट कैसे बनाया जाए। मैं तुम्हें दो असली प्रोजेक्ट दिखाऊँगा : **Nibi** (जापानी सीखने का बॉट, TTS, cool) और **Konosuba-RPG** (वास्तविक समय छवि रेंडर वाला _पूरा_ Discord गेम)।

## WebSocket बनाम Interaction Endpoint : यह बुरा विचार क्यों था

Minecraft खेल कल्पना करो जहाँ तुम्हें कनेक्शन खुला रखना पड़ता है जब तुम खेल भी नहीं रहे।

और सर्वर हर crash पर अपने आप फिर से जुड़ता है। तुम्हें timeout, घातांकीय पुनः जुड़ाव, सारा घटिया boilerplate संभालना पड़ता है जिससे हम नफरत करते हैं। सिर्फ interaction पाने के लिए।

interaction endpoint इसका उल्टा है। Discord तुम्हारे URL पर POST करता है। तुम जवाब देते हो। खत्म।

अगर तुम्हारा सर्वर crash करता है ? Discord 2-3 बार retry करता है और आगे बढ़ता है। Zero drama।

**पहले लागत** : सिर्फ Node प्रक्रिया जीवित रखने के लिए Heroku पर 50€/महीना।

**बाद में लागत** : 100k अनुरोध/दिन तक Cloudflare पर 0€/महीना।

## आर्किटेक्चर : यह ठीक क्या है ?

Discord तुम्हारे endpoint पर अनुरोध POST करता है।

```plaintext
Discord: "Eh! L'utilisateur a cliqué sur /ping!"
      ↓
   Ton URL (Cloudflare Worker)
      ↓
Tu vérifie que c'est vraiment Discord (signature check)
      ↓
Tu parse le type d'interaction
      ↓
Tu exécute le handler
      ↓
Tu retourne du JSON
      ↓
Discord: "Cool, je vais afficher ça à l'utilisateur"
```

यह शुद्ध HTTP है, न्यूनतम और पठनीय stack के साथ।

## Hono + Cloudflare Workers : किफायती combo

**Hono** एक वेब framework है जो 12KB का है। वह हर जगह चलता है : Cloudflare Workers, Vercel, AWS Lambda, Deno, Bun... हर जगह वही कोड।

Cloudflare Workers edge पर compute है। तुम्हारे अनुरोध निकटतम सर्वर पर पहुँचते हैं। उत्तर समय : \<100ms। लागत : 100k अनुरोध/दिन तक मुफ्त।

Hono + Cloudflare combo Discord बॉट के लिए सही match है।

पूरे बॉट का न्यूनतम कोड यहाँ है :

```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. हेडर लेता है
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. जाँचता है कि यह सच में Discord है (spam नहीं)
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3. उसने क्या भेजा parse करता है
  const interaction = JSON.parse(body);

  // 4. प्रकार के अनुसार जवाब देता है
  if (interaction.type === 1) {
    // Discord test (PING)
    return c.json({ type: 1 });
  }

  if (interaction.type === 2) {
    // यह slash command है
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

कार्यात्मक बॉट के लिए 30 पंक्तियाँ काफी हैं।

तुम `bot.login()`, event emitter और callback hell भूल जाते हो। तुम सिर्फ HTTP रखते हो।

Cloudflare पर deploy करने के लिए :

```plaintext
npm install -D wrangler
npx wrangler deploy
```

धड़ाम। तुम्हें `https://mon-bot.workers.dev/interactions` जैसा URL मिलता है।

तुम इसे Discord Developer Portal में "INTERACTIONS ENDPOINT URL" के नीचे रखते हो, और Discord वहाँ तुम्हारे interaction भेजना शुरू करता है।

## हस्ताक्षर जाँचना : कोई नकली अनुरोध नहीं

Discord हर अनुरोध सार्वजनिक कुंजी से हस्ताक्षर करता है। अगर तुम्हें गलत हस्ताक्षर वाला अनुरोध मिलता है ? यह spam है। नजरअंदाज करो और आगे बढ़ो।

`discord-interactions` पैकेज काम करता है :

```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // सटीक कच्चा पाठ (pars किया JSON नहीं !)
  signature,         // header x-signature-ed25519
  timestamp,         // header x-signature-timestamp
  publicKey          // Discord Dev Portal से
);
```

**महत्वपूर्ण जाल** : हस्ताक्षर _सटीक_ body पर निर्भर करता है। अगर तुम JSON parse करके फिर से stringify करते हो, या body log करते हो, तो तुम हस्ताक्षर तोड़ते हो।

पहले जाँचो। बाद में parse करो। यही क्रम मायने रखता है।

## मामला 1 : Nibi (जापानी सीखने का बॉट)

Nibi जापानी सीखने का Discord बॉट है। सरल कमांड :

*   `/dictionary kanji` → परिभाषाएँ दिखाता है
*   `/pronounce テキスト` → TTS (text-to-speech) बनाता है
*   `/hello` → स्वागत संदेश

हर कमांड एक TypeScript फाइल है :

```plaintext
src/commands/
├── dictionary.ts
├── pronounce.ts
├── hello.ts
└── ...
```

कमांड यह इंटरफेस लागू करती है :

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

### /pronounce कमांड : बॉट को बुलवाना

यह वह है जो अच्छी तरह अजीब है। तुम पाठ भेजते हो (romaji, hiragana, kanji, कुछ भी), बॉट उसे hiragana में बदलता है, VOICEVOX या Google TTS से TTS बनाता है, और Discord पर ऑडियो संदेश भेजता है।

```typescript
const pronounce: Command = {
  data: {
    name: 'pronounce',
    description: 'जापानी पाठ के लिए TTS बनाता है',
    options: [
      {
        type: 3,  // STRING
        name: 'text',
        description: 'बोलने वाला पाठ',
        required: true
      }
    ]
  },

  async execute(interaction, env) {
    const text = interaction.data.options[0].value;

    try {
      // 1. Kuroshiro से romaji → hiragana बदलना
      const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });

      // 2. TTS ऑडियो बनाना
      const audioBuffer = await generateTTS(hiragana);

      // 3. फाइल Discord पर upload करना
      const uploadFilename = await uploadToDiscord(
        audioBuffer,
        interaction.channel.id,
        env.BOT_TOKEN
      );

      // 4. ऑडियो के साथ संदेश भेजना
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
          content: 'Erreur : impossible de générer l\'audio xD',
          flags: 64  // ephemeral (निजी संदेश)
        }
      };
    }
  }
};
```

यह पागल है : तुम बाहरी API बुलाते हो, तुम Discord पर फाइल upload करते हो, तुम फाइल के साथ संदेश भेजते हो। सब बिना WebSocket, सिर्फ HTTP।

### Supabase से स्थायित्व

Nibi Supabase को key-value store की तरह इस्तेमाल करता है। जाँचने के लिए कि उपयोगकर्ता दर्ज है या नहीं :

```typescript
const DatabaseUtils = new DatabaseUtils({
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY
});

const users = await DatabaseUtils.readJson('users');
const user = users.find(u => u.id === interaction.member.user.id);

if (!user) {
  // उपयोगकर्ता जोड़ना
  users.push({ id: interaction.member.user.id, verified: true });
  await DatabaseUtils.writeJson('users', users);
}
```

यह बहुत बुनियादी है (असली SQL query नहीं, सिर्फ JSON), लेकिन काम करता है। छोटे बॉट के लिए एकदम सही है।

## मामला 2 : Konosuba-RPG (छवि रेंडर वाला Discord गेम)

अच्छा यह पागल है।

Konosuba-RPG Discord पर **पूरा गेम** है। तुम mob से लड़ते हो, तुम XP जीतते हो, तुम सहायक वस्तुएँ सजाते हो, तुम स्तर बढ़ाते हो। हर battle **छवि** वास्तविक समय बनाती है। तुम पूर्व रेंडर spritesheet से बचते हो। छवि खिलाड़ी stats, mob और युद्ध स्थिति से गतिशील बनती है।

और छवि Cloudflare Workers पर \<500ms में बनती है। सचमुच।

### रेंडर आर्किटेक्चर

```plaintext
Discord (तुम "Attack" क्लिक करते हो)
    ↓
Cloudflare Worker interaction पाता है
    ↓
गेम स्थिति अद्यतन (XP, HP, आदि)
    ↓
Satori से JSX बनाता है
    ↓
Resvg (Wasm) से SVG → PNG बदलता है
    ↓
छवि Discord पर upload करता है
    ↓
छवि के साथ संदेश भेजता है
```

सब एक सेकंड से कम में। यह पागलपन है।

### Workers तरफ छवि रेंडर

Konosuba **Satori** (JSX → SVG) और **Resvg** (SVG → PNG) इस्तेमाल करता है :

```typescript
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. UI के लिए JSX बनाना
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

तुम सामान्य JSX लिखते हो। यह SVG बनता है। SVG PNG बनता है। Cloudflare Worker पर \<100ms।

शक्ति समझ रहे हो ? यह बस सुंदर है।

### गेम स्थिति और प्रगति

खिलाड़ी डेटा Supabase में है :

```typescript
const player = await db
  .from('players')
  .select('*')
  .eq('discord_id', interaction.user.id)
  .single();

// खिलाड़ी जीता
const { data: updated } = await db
  .from('players')
  .update({
    level: player.level + 1,
    xp: player.xp + xpGain
  })
  .eq('id', player.id);
```

हर क्रिया (हमला, रक्षा, उपचार) आधार में stats अद्यतन करती है। और फिर तुम नई stats के साथ छवि फिर से बनाते हो।

### Interaction : gameplay बटन

खेल युद्ध में क्रियाओं के लिए **button interaction** इस्तेमाल करता है :

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
      style: 2,  // Secondary (धूसर)
      label: 'Defend',
      custom_id: 'battle_defend'
    }
  ]
}
```

जब तुम "Attack" क्लिक करते हो, तो Discord `custom_id: 'battle_attack'` के साथ interaction POST करता है। handler इसे route करता है :

```typescript
if (interaction.type === 3) {
  // Component interaction (button click, आदि)
  const customId = interaction.data.custom_id;

  if (customId === 'battle_attack') {
    return await handleAttack(interaction, env);
  }
  if (customId === 'battle_defend') {
    return await handleDefend(interaction, env);
  }
}
```

और धड़ाम, तुम नुकसान गणना करते हो, तुम आधार अद्यतन करते हो, तुम छवि फिर से बनाते हो, तुम भेजते हो।

यह बिना किसी कनेक्शन स्थायित्व के पूरा turn-based गेम है। सिर्फ stateless HTTP। पूरी तरह टूटा हुआ।

## Supabase : Workers के लिए बनी DB

क्लासिक डेटाबेस (PostgreSQL, MySQL, MongoDB) स्थायी TCP कनेक्शन के लिए डिजाइन किए हैं। तुम socket खोलते हो, तुम कनेक्शन खुला रखते हो, तुम query भेजते हो। समस्या : **Cloudflare Workers स्थायी TCP कनेक्शन समर्थन नहीं करते**। हर अनुरोध अल्पकालिक प्रक्रिया है। जैसे ही तुम client को जवाब देते हो, Worker गायब हो जाता है।

तुम यह नहीं कर सकते :

```typescript
// यह Workers पर काम नहीं करता
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // स्थायी TCP कनेक्शन = dead
```

और `pg` या `postgres.js` जैसे नेटिव PostgreSQL driver भी TCP कनेक्शन इस्तेमाल करते हैं। Workers पर, वे crash करते हैं।

**Supabase यह सब सुलझाता है।**

Supabase PostgreSQL के ऊपर REST API है। तुम सामान्य HTTP अनुरोध करते हो। हर कॉल स्वतंत्र है, कोई स्थायी कनेक्शन नहीं, प्रबंधित करने को कोई स्थिति नहीं। यह serverless मॉडल के लिए पूरी तरह अनुकूल है।

```typescript
// यह Workers पर एकदम सही काम करता है
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

Supabase client (`@supabase/supabase-js`) हुड के नीचे `fetch` इस्तेमाल करता है। और `fetch` Workers पर नेटिव है। शून्य कॉन्फ़िगरेशन, शून्य driver, शून्य स्थायी कनेक्शन।

| डेटाबेस | Workers संगत ? | क्यों |
| --- | --- | --- |
| **Supabase** | ✅ हाँ | बिना स्थिति REST API, शुद्ध HTTP |
| **PlanetScale (MySQL)** | ⚠️ आंशिक | सिर्फ HTTPS कनेक्शन, लंबे लेनदेन नहीं |
| **Neon** | ⚠️ आंशिक | Serverless शाखाएँ लेकिन जरूरी TCP driver |
| **Turso (libSQL)** | ⚠️ आंशिक | HTTP संभव लेकिन सीमित |
| **Prisma/Prisma Postgres** | ❌ नहीं | स्थायी TCP जरूरी |
| **MongoDB Atlas** | ❌ नहीं | TCP driver, कोई नेटिव REST API नहीं |
| **Redis (Upstash)** | ✅ हाँ | HTTP REST API |

Supabase का असली फायदा सिर्फ DB नहीं है, यह पूरा पारिस्थितिकी तंत्र है जो edge-first सोचा गया है :

- **Auth** : सत्र प्रबंधित करने के लिए REST API, बिना स्थिति काम करता है
- **Storage** : HTTP से फाइल Upload/download
- **Realtime** : वैकल्पिक WebSocket, लेकिन तुम REST से poll भी कर सकते हो
- **Row Level Security** : सुरक्षा नियम DB में हैं, तुम्हारे backend में नहीं

serverless Discord बॉट के लिए, Supabase सबसे सरल और सबसे विश्वसनीय चुनाव है। तुम कोई driver कॉन्फ़िगर नहीं करते, तुम कोई कनेक्शन नहीं रखते, तुम कोई timeout नहीं संभालते। तुम बस HTTP अनुरोध भेजते हो।

अगर तुम्हें असली उदाहरण चाहिए, तो ऊपर Nibi देखो : स्थायित्व कोड सचमुच Supabase पर `readJson()` और `writeJson()` है। तुम बिना migration, बिना जटिल schema, बिना भारी config शुरू करते हो। यह सीधे काम करता है। और अगर तुम्हारा बॉट बड़ा होता है, तो तुम provider बदले बिना असली SQL query की ओर migrate करते हो।

## Polyfill : जब Node Workers पर चलना चाहता है

कुछ पैकेज Node API अपेक्षा करते हैं। Kuromoji (kanji parser) `XMLHttpRequest` इस्तेमाल करता है। Workers के पास `fetch` है, `XMLHttpRequest` नहीं।

सरल समाधान : index.ts के ऊपर polyfill जोड़ना :

```typescript
// kuromoji के लिए XMLHttpRequest Polyfill
if (!globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest = class {
    // न्यूनतम Stub
  } as any;
}
```

या समर्पित मॉड्यूल बनाना :

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

यह बुनियादी hack है, लेकिन काम करता है।

## npm पैकेज की ओर : hono-discord-interactions

हाथ से, बॉट बनाना बहुत boilerplate है :

*   Discord हस्ताक्षर जाँचना
*   interaction प्रकार route करना
*   कमांड, component, modal संभालना
*   वैध JSON लौटाना

यह सब npm पैकेज में समेटा जा सकता है। जैसे :

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

धड़ाम। 200 के बजाय 20 पंक्तियाँ। यह Nibi को आसानी से आधा घटा देगा।

बाद के लिए विचार।

## Deploy

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

लागत : 100k अनुरोध/दिन तक **मुफ्त**। उसके बाद : $0.50/million।

स्पॉइलर : तुम 100k अनुरोध कभी खर्च नहीं करोगे जब तक 10 000 सक्रिय उपयोगकर्ता न हों।

### Vercel

```plaintext
npm run vercel:deploy
```

URL : `https://mon-bot-xyz.vercel.app/api/interactions`

वही, मुफ्त।

### दोनों एक साथ

Hono हर जगह चलता है। तुम वही कोड Cloudflare और Vercel पर डिप्लॉय कर सकते हो। चुनने से पहले अतिरेक या परीक्षण के लिए उपयोगी।

## त्वरित checklist

1.  Discord Developer Portal पर Application बनाना
2.  PUBLIC\_KEY, BOT\_TOKEN, APP\_ID कॉपी करना
3.  प्रोजेक्ट बनाना :
4.  index.ts लिखना (हस्ताक्षर जाँच + routing)
5.  slash command दर्ज करना (एक बार) :
6.  Deploy :
7.  Discord में URL रखना (Developer Portal → Application → Interactions Endpoint URL)
8.  Discord कनेक्शन परखता है (तुम्हें PING का जवाब देना होगा)
9.  सर्वर पर बॉट आमंत्रित करना
10.  हो गया

## फायदे बनाम सीमाएँ

**फायदे**

*   न्यूनतम लागत (100k req/दिन तक मुफ्त)
*   Scalable (बिना कनेक्शन प्रबंधन)
*   सरल (बिना WebSocket boilerplate)
*   तेज (Cloudflare = edge सर्वर)
*   Portable (Hono कोड = कई host)

**सीमाएँ**

*   तुम्हें सिर्फ interaction मिलते हैं (slash command, button, modal), बिना वास्तविक समय सर्वर घटनाओं (सदस्य जुड़ा, भूमिका जुड़ी, संदेश हटाया, आदि) के
*   जवाब देने के लिए 3 सेकंड timeout, वरना Discord "Application did not respond" दिखाता है
*   अगर तुम्हें असली event चाहिए, अलग HTTP webhook या सहायक WebSocket कनेक्शन चाहिए

90% बॉट (सब slash command आधारित) के लिए ? यह अच्छा है।

## समाप्त करने के लिए

मैंने KonosubaRPG और Nibi अनुकूलित करने में काफी समय बिताया ताकि या तो ज्यादा से ज्यादा अनुरोध बचाए जाएँ, या गर्म प्रोसेसर समय घटाया जाए, या cold boot घटाया जाए। परिणाम, मुझे लगभग सब पर शानदार perf मिली।
जानना चाहिए कि मैंने अपने ज्यादातर प्रोजेक्ट cloudify करना (पता नहीं यह कहा भी जाता है) शुरू किया था क्योंकि मुझे उन्हें अपनी VM पर होस्ट करते रहने की बहुत आलस थी। सच में, मुझे लगता है कि Github Actions ने ही मेरी जान बचाई है। Workers भी, लेकिन असल में जब मैंने देखा कि मैं Github Actions और schedule से daemon बना सकता हूँ, तो इसने सच में मुझे बचाया।

मैं [email-autoreply](https://github.com/fox3000foxy/email-autoreply/) नामक प्रोजेक्ट पर लेख लिखने वाला हूँ, इसलिए उसे जल्द निकलता देखने के लिए RSS feed subscribe करो :))।

**याद रखने के 3 बिंदु :**

1.  **Interaction endpoint = HTTP serverless** , बिना WebSocket, बिना स्थायी connection के। Discord POST करता है, तुम जवाब देते हो। Cloudflare पर मुफ्त।
2.  **Hono सही उपकरण है** , हल्का Framework (12KB), multi-runtime, शून्य निर्भरताएँ। Cloudflare, Vercel, Node, हर जगह समान कोड।
3.  **Workers पर Renderimage = पागल** , Satori + Resvg (Wasm) तुम्हें JSX में गतिशील UI बनाने और उन्हें \<100ms में PNG में बदलने देता है। पूरा गेम इस पर चल सकता है।

यह बीमार है।

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
