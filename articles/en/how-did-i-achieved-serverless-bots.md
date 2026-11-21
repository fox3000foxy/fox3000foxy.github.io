---
title: "Discord Bot 100% Serverless: Hono + Cloudflare Workers"
description: How I replaced a Discord bot that cost me €50/month with
  zero euros -- interaction endpoints, Hono, Workers, real-time image
  rendering, and a full game with no WebSocket.
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
author_sig: "8SJ5LCFdqBE4EWoMHv6aMZuEj+lfzVoIVylVimYGV9zdAk+SQSv2E7Oan/AGmEtWI4O/tG418DnZH/fYlcUwOQ=="
---

## Discord bot 100% serverless: Hono + Cloudflare Workers = 💸 zero

I spent a few months maintaining classic Discord bots on my own machine.

WebSocket connection always open. The bot reconnects by itself at 3am. The bot crashes because I look at sheep the wrong way. The bill piles up.

One day I discovered: **why keep a connection open**? Discord can just POST you the events you care about. You reply, done.

Since 2021, Discord offers **interaction endpoints**.

It's just HTTP. You work with no WebSocket, no persistent state. You get a request, you send JSON, it's over. The next request arrives on its own.

And the best part: Cloudflare Workers is **free** up to 100k requests/day. For 90% of bots, that's 0€/month.

This article shows you how to make a Discord bot with no WebSocket using **Hono** (an ultra-light web framework) and **Cloudflare Workers**. I'll show you two real projects: **Nibi** (bot for learning Japanese, TTS, cool) and **Konosuba-RPG** (a _complete_ Discord game with real-time image rendering).

## WebSocket vs. Interaction Endpoints: Why It Was a Bad Idea

Imagine a Minecraft game where you have to keep the connection open even when you're not playing.

And the server auto-reconnects every time it crashes. You have to handle timeouts, exponential reconnections, all the crap boilerplate we hate. Just to receive interactions.

Interaction endpoints are the opposite. Discord POSTs to your URL. You reply. Done.

If your server crashes? Discord retries 2-3 times and moves on. Zero drama.

**Cost before**: €50/month on Heroku just to keep a Node process alive.

**Cost after**: 0€/month on Cloudflare up to 100k requests/day.

## The Architecture: What Is It Exactly?

Discord POSTs a request to your endpoint.

```plaintext
Discord: "Hey! The user clicked /ping!"
      ↓
   Your URL (Cloudflare Worker)
      ↓
You check it's really Discord (signature check)
      ↓
You parse the interaction type
      ↓
You run the handler
      ↓
You return JSON
      ↓
Discord: "Cool, I'll display that to the user"
```

It's pure HTTP, with a minimal readable stack.

## Hono + Cloudflare Workers: The Thrifty Combo

**Hono** is a web framework weighing 12KB. It runs everywhere: Cloudflare Workers, Vercel, AWS Lambda, Deno, Bun... the same code everywhere.

Cloudflare Workers is edge compute. Your requests land on the closest server. Response time: \<100ms. Cost: free up to 100k requests/day.

The Hono + Cloudflare combo is the perfect match for a Discord bot.

Here's the minimal code for a full bot:

```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. Grab the headers
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. Check it's really Discord (not spam)
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3. Parse what it sent
  const interaction = JSON.parse(body);

  // 4. Reply by type
  if (interaction.type === 1) {
    // Discord test (PING)
    return c.json({ type: 1 });
  }

  if (interaction.type === 2) {
    // It's a slash command
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

30 lines is enough for a working bot.

You forget `bot.login()`, event emitters, and callback hell. You keep only HTTP.

To deploy on Cloudflare:

```plaintext
npm install -D wrangler
npx wrangler deploy
```

Boom. You have a URL like `https://my-bot.workers.dev/interactions`.

You put that in the Discord Developer Portal under "INTERACTIONS ENDPOINT URL", and Discord starts sending your interactions there.

## Verifying the Signature: No Fake Requests

Discord signs every request with a public key. If you get a request with a bad signature? It's spam. Ignore and move on.

The `discord-interactions` package does the job:

```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // exact raw text (not parsed JSON!)
  signature,         // x-signature-ed25519 header
  timestamp,         // x-signature-timestamp header
  publicKey          // from Discord Dev Portal
);
```

**Important trap**: the signature depends on the _exact_ body. If you parse JSON and re-stringify, or log the body, you break the signature.

Verify first. Parse after. That's the order that matters.

## Case 1: Nibi (Japanese Learning Bot)

Nibi is a Discord bot for learning Japanese. Simple commands:

*   `/dictionary kanji` → shows definitions
*   `/pronounce テキスト` → generates TTS (text-to-speech)
*   `/hello` → greeting message

Each command is a TypeScript file:

```plaintext
src/commands/
├── dictionary.ts
├── pronounce.ts
├── hello.ts
└── ...
```

A command implements this interface:

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

### The /pronounce Command: Making the Bot Talk

This one is nicely weird. You send text (romaji, hiragana, kanji, whatever), the bot converts it to hiragana, generates TTS via VOICEVOX or Google TTS, and sends an audio message on Discord.

```typescript
const pronounce: Command = {
  data: {
    name: 'pronounce',
    description: 'Generate TTS for Japanese text',
    options: [
      {
        type: 3,  // STRING
        name: 'text',
        description: 'Text to pronounce',
        required: true
      }
    ]
  },

  async execute(interaction, env) {
    const text = interaction.data.options[0].value;

    try {
      // 1. Convert romaji → hiragana with Kuroshiro
      const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });

      // 2. Generate TTS audio
      const audioBuffer = await generateTTS(hiragana);

      // 3. Upload the file to Discord
      const uploadFilename = await uploadToDiscord(
        audioBuffer,
        interaction.channel.id,
        env.BOT_TOKEN
      );

      // 4. Send the message with the audio
      await sendVoiceMessage(
        interaction.channel.id,
        uploadFilename,
        audioBuffer.length / 16000,  // duration in seconds
        env.BOT_TOKEN
      );

      return {
        type: 4,
        data: { content: `Pronunciation for "${text}"` }
      };
    } catch (err) {
      return {
        type: 4,
        data: {
          content: 'Error: could not generate audio xD',
          flags: 64  // ephemeral (private message)
        }
      };
    }
  }
};
```

Crazy: you call an external API, upload a file to Discord, send a message with the file. All with no WebSocket, just HTTP.

### Persistence With Supabase

Nibi uses Supabase as a key-value store. To check whether a user is registered:

```typescript
const DatabaseUtils = new DatabaseUtils({
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY
});

const users = await DatabaseUtils.readJson('users');
const user = users.find(u => u.id === interaction.member.user.id);

if (!user) {
  // Add the user
  users.push({ id: interaction.member.user.id, verified: true });
  await DatabaseUtils.writeJson('users', users);
}
```

Very basic (no real SQL queries, just JSON), but it works. For small bots it's perfect.

## Case 2: Konosuba-RPG (Discord Game With Image Rendering)

Okay this one is wild.

Konosuba-RPG is a **full game** on Discord. You fight mobs, earn XP, equip accessories, level up. Every battle generates an **image** in real time. No pre-rendered spritesheets. The image is composed dynamically from player stats, the mob, and fight state.

And the image renders in \<500ms on Cloudflare Workers. Literally.

### The Render Architecture

```plaintext
Discord (you click "Attack")
    ↓
Cloudflare Worker receives the interaction
    ↓
Game state update (XP, HP, etc.)
    ↓
Generate JSX with Satori
    ↓
Convert SVG → PNG with Resvg (Wasm)
    ↓
Upload the image to Discord
    ↓
Send the message with the image
```

All in under a second. Wild.

### Image Rendering on Workers

Konosuba uses **Satori** (JSX → SVG) and **Resvg** (SVG → PNG):

```typescript
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. Create JSX for the UI
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

You write normal JSX. It becomes SVG. SVG becomes PNG. \<100ms on a Cloudflare Worker.

You get the power? Just beautiful.

### Game State and Progression

Player data lives in Supabase:

```typescript
const player = await db
  .from('players')
  .select('*')
  .eq('discord_id', interaction.user.id)
  .single();

// The player won
const { data: updated } = await db
  .from('players')
  .update({
    level: player.level + 1,
    xp: player.xp + xpGain
  })
  .eq('id', player.id);
```

Every action (attack, defend, heal) updates stats in the DB. Then you regenerate the image with the new stats.

### Interactions: Gameplay Buttons

The game uses **button interactions** for combat actions:

```typescript
{
  type: 1,  // ActionRow
  components: [
    {
      type: 2,  // Button
      style: 1,  // Primary (blue)
      label: 'Attack',
      custom_id: 'battle_attack'
    },
    {
      type: 2,
      style: 2,  // Secondary (gray)
      label: 'Defend',
      custom_id: 'battle_defend'
    }
  ]
}
```

When you click "Attack", Discord POSTs an interaction with `custom_id: 'battle_attack'`. The handler routes it:

```typescript
if (interaction.type === 3) {
  // Component interaction (button click, etc.)
  const customId = interaction.data.custom_id;

  if (customId === 'battle_attack') {
    return await handleAttack(interaction, env);
  }
  if (customId === 'battle_defend') {
    return await handleDefend(interaction, env);
  }
}
```

And boom, you compute damage, update the DB, regenerate the image, send it.

A full turn-based game with zero persistent connection. Just stateless HTTP. Completely broken.

## Supabase: The DB Made for Workers

Classic databases (PostgreSQL, MySQL, MongoDB) are designed for persistent TCP connections. You open a socket, keep the connection open, send queries. Problem: **Cloudflare Workers doesn't support persistent TCP connections**. Every request is an ephemeral process. As soon as you answer the client, the Worker disappears.

You can't do this:

```typescript
// This does NOT work on Workers
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // persistent TCP connection = dead
```

And even native PostgreSQL drivers like `pg` or `postgres.js` use TCP connections. On Workers, they crash.

**Supabase solves all of that.**

Supabase is a REST API on top of PostgreSQL. You make plain HTTP requests. Each call is independent, no persistent connection, no state to manage. It's perfectly suited to the serverless model.

```typescript
// This works PERFECTLY on Workers
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

The Supabase client (`@supabase/supabase-js`) uses `fetch` under the hood. And `fetch` is native on Workers. Zero config, zero driver, zero persistent connection.

| Database | Workers-compatible? | Why |
| --- | --- | --- |
| **Supabase** | ✅ Yes | Stateless REST API, pure HTTP |
| **PlanetScale (MySQL)** | ⚠️ Partial | HTTPS connection only, no long transactions |
| **Neon** | ⚠️ Partial | Serverless branches but TCP driver needed |
| **Turso (libSQL)** | ⚠️ Partial | HTTP possible but limited |
| **Prisma/Prisma Postgres** | ❌ No | Requires persistent TCP |
| **MongoDB Atlas** | ❌ No | TCP driver, no native REST API |
| **Redis (Upstash)** | ✅ Yes | HTTP REST API |

Supabase's real advantage isn't just the DB -- it's the whole ecosystem designed edge-first:

- **Auth**: REST API to manage sessions, works statelessly
- **Storage**: File upload/download over HTTP
- **Realtime**: Optional WebSocket, but you can also just poll via REST
- **Row Level Security**: security rules live in the DB, not in your backend

For a serverless Discord bot, Supabase is the simplest, most reliable choice. You configure no driver, maintain no connection, manage no timeout. You just send HTTP requests.

If you want a real example, look at Nibi above: the persistence code is literally `readJson()` and `writeJson()` on Supabase. You start with no migrations, no complex schema, no heavy config. It works out of the box. And if your bot gets big, you migrate to real SQL queries without switching providers.

## Polyfills: When Node Wants to Run on Workers

Some packages expect Node APIs. Kuromoji (kanji parser) uses `XMLHttpRequest`. Workers have `fetch`, not `XMLHttpRequest`.

Simple fix: add a polyfill at the top of index.ts:

```typescript
// Polyfill XMLHttpRequest for kuromoji
if (!globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest = class {
    // Minimal stub
  } as any;
}
```

Or make a dedicated module:

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

Basic hack, but it works.

## Toward an npm Package: hono-discord-interactions

By hand, making a bot is a lot of boilerplate:

*   Verify the Discord signature
*   Route interaction types
*   Handle commands, components, modals
*   Return valid JSON

You could abstract all that into an npm package. Like:

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

Boom. 20 lines instead of 200. That would cut Nibi in half easily.

Idea for later.

## Deploy

### Cloudflare Workers

```plaintext
npm install -D wrangler

# wrangler.toml
[env.production]
name = "my-bot"
main = "src/index.ts"

# Secrets
wrangler secret put PUBLIC_KEY --env production
wrangler secret put BOT_TOKEN --env production
wrangler secret put SUPABASE_URL --env production

# Deploy
wrangler deploy --env production
```

Resulting URL: `https://my-bot.workers.dev/interactions`

Cost: **free** up to 100k requests/day. Beyond: $0.50/million.

Spoiler: you'll never burn the 100k requests unless you have 10,000 active users.

### Vercel

```plaintext
npm run vercel:deploy
```

URL: `https://my-bot-xyz.vercel.app/api/interactions`

Same, free.

### Both at once

Hono runs everywhere. You can deploy the same code on Cloudflare AND Vercel. Useful for redundancy or testing before picking one.

## Quick Checklist

1.  Create an Application on the Discord Developer Portal
2.  Copy PUBLIC_KEY, BOT_TOKEN, APP_ID
3.  Create the project:
4.  Write index.ts (signature check + routing)
5.  Register the slash commands (once):
6.  Deploy:
7.  Put the URL in Discord (Developer Portal → Application → Interactions Endpoint URL)
8.  Discord tests the connection (you must answer the PING)
9.  Invite the bot to a server
10.  Done

## Advantages vs Limitations

**Advantages**

*   Minimal cost (free up to 100k req/day)
*   Scalable (no connection management)
*   Simple (no WebSocket boilerplate)
*   Fast (Cloudflare = edge servers)
*   Portable (Hono code = multiple hosts)

**Limitations**

*   You only receive interactions (slash commands, buttons, modals), no real-time server events (member joined, role added, message deleted, etc.)
*   3-second timeout to reply -- otherwise Discord shows "Application did not respond"
*   If you need real events -- you need a separate HTTP webhook or an auxiliary WebSocket connection

For 90% of bots (all slash-command based)? Good.

## To Conclude

I spent quite a while optimizing KonosubaRPG and Nibi to save either as many requests as possible, or to cut hot CPU time, or to cut cold boot. Result: I've got solid perf on pretty much everything.
Fact is I started cloudifying (no idea if that's even a word) most of my projects because I had monumental laziness about keeping hosting them on my own VM. Really, I think GitHub Actions saved my skin. Workers too, but actually when I saw I could run daemons with GitHub Actions and schedules, that really saved me for real.

I'll probably write an article on a project called [email-autoreply](https://github.com/fox3000foxy/email-autoreply/), so subscribe to the RSS feed to see it drop soon :)).

**3 key points:**

1.  **Interaction endpoints = serverless HTTP** -- no WebSocket, no persistent connection. Discord POSTs, you reply. Free on Cloudflare.
2.  **Hono is the perfect tool** -- Lightweight framework (12KB), multi-runtime, zero dependencies. Identical code on Cloudflare, Vercel, Node, everywhere.
3.  **Image render on Workers = wild** -- Satori + Resvg (Wasm) let you compose dynamic UIs in JSX and convert them to PNG in \<100ms. A full game can run on that.

Wild.

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
