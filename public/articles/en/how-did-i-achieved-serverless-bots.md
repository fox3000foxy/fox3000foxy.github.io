---
title: "Discord bot 100% serverless: Hono + Cloudflare Workers"
description: How I replaced a Discord bot that cost me 50€/month with zero euros
  -- interaction endpoints, Hono, Workers, real-time image rendering, and a full
  game without WebSocket.
date: 2026-05-29
tags:
  - discord
  - cloudflare
  - serverless
  - typescript
  - bots
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "t1KaEYzDT8xLv8ouy8Mh7ZatnLKjHfxnP4V2iD6y7uP+6hdKAc3wVws1qyzn0+oStUBBmHtfBnwXpEkyfjOHjA=="
---

## 100% serverless Discord bot: Hono + Cloudflare Workers = 💸 zero

I spent a few months running classic Discord bots on my own machine.

Always-open WebSocket connection. Bot auto-reconnects at 3 AM. Bot crashes because I looked at the sheep wrong. The bill goes up.

Then one day I realized: **why keep a connection alive**? Discord can just POST the stuff you care about. You reply, done.

Since 2021, Discord has had **interaction endpoints**.

It's just HTTP. No WebSocket. No persistent state. You get a request, you send JSON, that's it. The next request comes on its own.

And the best part: Cloudflare Workers is **free** up to 100k requests/day. For 90% of bots, that's 0€/month.

This article shows you how to build a Discord bot without WebSocket using **Hono** (ultra-light web framework) and **Cloudflare Workers**. I'll show you two real projects: **Nibi** (bot for learning Japanese, TTS, cool) and **Konosuba-RPG** (a _full_ Discord game with real-time image rendering xD).

## WebSocket vs. Interaction Endpoints: why it was a bad idea

Imagine a Minecraft world where you gotta keep the connection open even when you're not playing.

And the server auto-reconnects every time it crashes. You gotta handle timeouts, exponential backoff reconnections, all that shitty boilerplate everyone hates. Just to receive interactions.

Interaction endpoints are the opposite. Discord POSTs to your URL. You reply. Done.

If your server crashes? Discord retries 2-3 times and moves on. Zero drama.

**Cost before**: 50€/month on Heroku just to keep a Node process alive.

**Cost after**: 0€/month on Cloudflare up to 100k requests/day.

## The architecture: what's it actually about?

Discord POSTs a request to your endpoint.

```plaintext
Discord: "Hey! User clicked /ping!"
      ↓
   Your URL (Cloudflare Worker)
      ↓
   You verify it's really Discord (signature check)
      ↓
   You parse the interaction type
      ↓
   You run the handler
      ↓
   You return JSON
      ↓
Discord: "Cool, I'll show that to the user"
```

It's pure HTTP. No magic. No heavy library.

## Hono + Cloudflare Workers: the cheap combo

**Hono** is a web framework that weighs 12KB. It runs everywhere: Cloudflare Workers, Vercel, AWS Lambda, Deno, Bun... same code everywhere.

Cloudflare Workers is compute at the edge. Your requests hit the nearest server. Response time: \<100ms. Cost: free up to 100k requests/day.

The Hono + Cloudflare combo is the perfect match for a Discord bot.

Here's the minimal code for a complete bot:

```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. Get the headers
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. Verify it's really Discord (not spam)
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3. Parse what it sent
  const interaction = JSON.parse(body);

  // 4. Reply based on type
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

Like, 30 lines and it's a working bot.

No `bot.login()`. No event emitter. No callback hell. Just HTTP.

To deploy on Cloudflare:

```plaintext
npm install -D wrangler
npx wrangler deploy
```

Boom. You get a URL like `https://my-bot.workers.dev/interactions`.

You drop that in the Discord Developer Portal under "INTERACTIONS ENDPOINT URL", and Discord starts sending your interactions there.

## Verifying the signature: no fake requests

Discord signs every request with a public key. If you get a request with a bad signature? That's spam. Ignore and move on.

The `discord-interactions` package does the job:

```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // exact raw text (not parsed JSON!)
  signature,         // header x-signature-ed25519
  timestamp,         // header x-signature-timestamp
  publicKey          // from Discord Dev Portal
);
```

**Important trap**: the signature depends on the _exact_ body. If you parse JSON and re-stringify, or if you log the body, you break the signature.

Verify first. Parse after. That order matters.

## Case 1: Nibi (Japanese learning bot)

Nibi is a Discord bot for learning Japanese. Simple commands:

*   `/dictionary kanji` → shows definitions
*   `/pronounce テキスト` → generates TTS (text-to-speech)
*   `/hello` → welcome message

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
  ): Promise<InteractionResponse>;
}
```

### The /pronounce command: making the bot talk

This one's wild. You send text (romaji, hiragana, kanji, whatever), the bot converts it to hiragana, generates TTS via VOICEVOX or Google TTS, and sends an audio message on Discord.

```typescript
const pronounce: Command = {
  data: {
    name: 'pronounce',
    description: 'Generates TTS for Japanese text',
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

It's crazy: you call an external API, upload a file to Discord, send a message with the file. All without WebSocket, just HTTP.

### Persistence with Supabase

Nibi uses Supabase as a key-value store. To check if a user is registered:

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

It's very basic (no real SQL queries, just JSON), but it works. For small bots it's perfect.

## Case 2: Konosuba-RPG (Discord game with image rendering)

Okay this one's insane.

Konosuba-RPG is a **full game** on Discord. You fight mobs, gain XP, equip accessories, level up. Each battle generates an **image** in real-time. No pre-rendered spritesheets. The image is composed dynamically from the player's stats, the mob, and the combat state.

And the image gets generated in \<500ms on Cloudflare Workers. Literally.

### The rendering architecture

```plaintext
Discord (you click "Attack")
    ↓
Cloudflare Worker receives the interaction
    ↓
Game state update (XP, HP, etc.)
    ↓
Generates JSX with Satori
    ↓
Converts SVG → PNG with Resvg (Wasm)
    ↓
Uploads the image to Discord
    ↓
Sends the message with the image
```

All of that in under a second. It's nuts.

### Image rendering on Workers

Konosuba uses **Satori** (JSX → SVG) and **Resvg** (SVG → PNG):

```typescript
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. Create JSX for the UI
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

You write normal JSX. That becomes SVG. SVG becomes PNG. \<100ms on a Cloudflare Worker.

You get how powerful this is? It's just... beautiful xD

### Game state and progression

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

Every action (attack, defend, heal) updates the stats in the database. Then you regenerate the image with the new stats.

### Interactions: gameplay buttons

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
      style: 2,  // Secondary (grey)
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

And boom, you calculate damage, update the database, regenerate the image, send it.

It's a complete turn-based game with zero persistent connection. Just stateless HTTP. Completely busted xD

## Supabase: the database built for Workers

Traditional databases (PostgreSQL, MySQL, MongoDB) are designed around persistent TCP connections. You open a socket, keep it alive, send queries. Problem: **Cloudflare Workers don't support persistent TCP connections**. Every request is an ephemeral process. The moment you respond to the client, the Worker disappears.

You can't do this:

```typescript
// This WON'T work on Workers
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // persistent TCP connection = dead
```

Even native PostgreSQL drivers like `pg` or `postgres.js` rely on TCP connections. On Workers, they crash.

**Supabase solves all of this.**

Supabase is a REST API on top of PostgreSQL. You make normal HTTP requests. Every call is independent, no persistent connection, no state to manage. It's perfectly suited for the serverless model.

```typescript
// This works PERFECTLY on Workers
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

The Supabase client (`@supabase/supabase-js`) uses `fetch` under the hood. And `fetch` is native on Workers. Zero config, zero driver, zero persistent connection.

| Database | Workers compatible? | Why |
| --- | --- | --- |
| **Supabase** | ✅ Yes | Stateless REST API, pure HTTP |
| **PlanetScale (MySQL)** | ⚠️ Partial | HTTPS-only connection, no long transactions |
| **Neon** | ⚠️ Partial | Serverless branches but TCP driver needed |
| **Turso (libSQL)** | ⚠️ Partial | HTTP possible but limited |
| **Prisma/Prisma Postgres** | ❌ No | Requires persistent TCP |
| **MongoDB Atlas** | ❌ No | TCP driver, no native REST API |
| **Redis (Upstash)** | ✅ Yes | REST API over HTTP |

The real advantage of Supabase isn't just the DB -- it's the whole ecosystem being designed edge-first:

- **Auth**: REST API for sessions, works without state
- **Storage**: File upload/download via HTTP
- **Realtime**: Optional WebSocket, but you can also poll via REST
- **Row Level Security**: security rules live in the DB, not your backend

For a serverless Discord bot, Supabase is the simplest and most reliable choice. No driver to configure, no connection to maintain, no timeouts. Just HTTP requests.

If you want a real example, look at Nibi above: its persistence code is literally `readJson()` and `writeJson()` on Supabase. No migrations, no complex schemas, no crazy config. It works out of the box. And if your bot gets big, you can migrate to real SQL queries without changing providers.

## Polyfills: when Node wants to run on Workers

Some packages expect Node APIs. Kuromoji (kanji parser) uses `XMLHttpRequest`. Workers have `fetch`, not `XMLHttpRequest`.

Simple solution: add a polyfill at the top of index.ts:

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

It's basic hacking, but it works.

## Towards an npm package: hono-discord-interactions

Doing it by hand, making a bot involves a lot of boilerplate:

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

Boom. 20 lines instead of 200. It'd cut Nibi in half easily.

Idea for later xD

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

Cost: **free** up to 100k requests/day. Beyond that: $0.50/million.

Spoiler: you'll never hit 100k requests unless you have 10,000 active users.

### Vercel

```plaintext
npm run vercel:deploy
```

URL: `https://my-bot-xyz.vercel.app/api/interactions`

Same, free.

### Both at once

Hono runs everywhere. You can deploy the same code on BOTH Cloudflare and Vercel. Useful for redundancy or testing before choosing.

## Quick checklist

1.  Create an Application on Discord Developer Portal
2.  Copy PUBLIC\_KEY, BOT\_TOKEN, APP\_ID
3.  Create the project:
4.  Write index.ts (signature verify + routing)
5.  Register slash commands (once):
6.  Deploy:
7.  Set the URL in Discord (Developer Portal → Application → Interactions Endpoint URL)
8.  Discord tests the connection (you must respond to PING)
9.  Invite the bot to a server
10.  You're done

## Pros vs Limitations

**Pros**

*   Cheap (free up to 100k req/day)
*   Scalable (no connection management)
*   Simple (no WebSocket boilerplate)
*   Fast (Cloudflare = edge servers)
*   Portable (Hono code = multiple hosts)

**Limitations**

*   No real-time server events (member join, role added, message deleted, etc.) -- you only get interactions (slash commands, buttons, modals)
*   3-second timeout to respond -- otherwise Discord shows "Application did not respond"
*   If you need real events -- you'll need a separate webhook HTTP endpoint or an auxiliary WebSocket connection

For 90% of bots (everything slash-command based)? You're good.

## To wrap up

I spent a lot of time optimizing KonosubaRPG and Nibi to save either as many requests as possible, or to reduce hot CPU time, or to reduce cold boot. Result is I have some serious perf across the board.  
You should know I started cloudifying (I don't even know if that's a word) most of my projects because I had a monumental laziness to keep hosting them on my own VM. Seriously, I think it's GitHub Actions that saved my ass. Workers too, but when I realized I could make daemons with GitHub Actions and schedules, that really saved me for real.

I'll probably write an article about a project called [email-autoreply](https://github.com/fox3000foxy/email-autoreply/), so subscribe to the RSS feed to see it drop soon :)).

**The 3 things to remember:**

1.  **Interaction endpoints = HTTP serverless** -- No WebSocket, no persistent connection. Discord POSTs, you reply. Free on Cloudflare.
2.  **Hono is the perfect tool** -- Lightweight framework (12KB), multi-runtime, zero dependencies. Same code on Cloudflare, Vercel, Node, everywhere.
3.  **Rendering images on Workers = insane** -- Satori + Resvg (Wasm) lets you compose dynamic UIs in JSX and convert them to PNG in \<100ms. A full game can run on this.

It's sick xD

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
