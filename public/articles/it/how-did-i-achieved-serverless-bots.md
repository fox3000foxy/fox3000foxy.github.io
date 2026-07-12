---
title: "Bot Discord 100% serverless: Hono + Cloudflare Workers"
description: Come ho sostituito un bot Discord che mi costava 50€/mese con zero
  euro -- interaction endpoints, Hono, Workers, rendering di immagini in tempo
  reale e un gioco completo senza WebSocket.
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
author_sig: "Czs1StFwyzQeVeGX0PQBZ19N3NPU0pYgEu1LxY0IuieuBnPqa+biocSTWc2VhlglYtYHOskV/RdFuAX6UiQE4w=="
---

## Discord bot 100% serverless : Hono + Cloudflare Workers = 💸 zero

Ho passato qualche mese a mantenere bot Discord classici sulla mia macchina.

Connessione WebSocket sempre aperta. Il bot si riconnette da solo alle 3 di notte. Il bot crasha perché guardo le pecore storte. La bolletta sale.

Un giorno ho scoperto: **perché mantenere una connessione** ? Discord può POSTarti solo le cose che ti interessano. Rispondi, fatto.

Dal 2021, Discord offre gli **interaction endpoints**.

È solo HTTP. Niente WebSocket. Niente stato persistente. Ricevi una richiesta, mandi del JSON, è finita. La richiesta successiva arriva da sola.

E il meglio: Cloudflare Workers è **gratuito** fino a 100k richieste/giorno. Per il 90% dei bot, sono 0€/mese.

Questo articolo ti mostra come fare un bot Discord senza WebSocket usando **Hono** (framework web ultra-leggero) e **Cloudflare Workers**. Ti mostrerò due progetti reali: **Nibi** (bot per imparare il giapponese, TTS, figo) e **Konosuba-RPG** (un gioco Discord _completo_ con rendering dell'immagine in tempo reale xD).

## WebSocket vs. Interaction Endpoints : perché era una brutta idea

Immagina un gioco Minecraft dove devi tenere la connessione aperta anche quando non giochi.

E il server si riconnette automaticamente ogni volta che crasha. Devi gestire i timeout, le riconnessioni esponenziali, tutto il boilerplate di merda che odiamo. Solo per ricevere interazioni.

Gli interaction endpoints sono l'opposto. Discord POSTa sulla tua URL. Rispondi. Fine.

Se il tuo server crasha? Discord riprova 2-3 volte e passa oltre. Zero drama.

**Costo prima**: 50€/mese su Heroku solo per tenere vivo un processo Node.

**Costo dopo**: 0€/mese su Cloudflare fino a 100k richieste/giorno.

## L'architettura : cos'è di preciso?

Discord POSTa una richiesta sul tuo endpoint.

```plaintext
Discord: "Ehi! L'utente ha cliccato su /ping!"
      ↓
   La tua URL (Cloudflare Worker)
      ↓
Verifichi che sia davvero Discord (controllo firma)
      ↓
Parso il tipo di interazione
      ↓
Esegui l'handler
      ↓
Ritorni JSON
      ↓
Discord: "Figo, mostro questo all'utente"
```

È HTTP puro. Nessuna magia. Nessuna libreria pesante.

## Hono + Cloudflare Workers : il combo economico

**Hono** è un framework web che pesa 12KB. Gira ovunque: Cloudflare Workers, Vercel, AWS Lambda, Deno, Bun... lo stesso codice dappertutto.

Cloudflare Workers è compute al edge. Le tue richieste arrivano al server più vicino. Tempo di risposta: \<100ms. Costo: gratuito fino a 100k richieste/giorno.

Il combo Hono + Cloudflare è la partita perfetta per un bot Discord.

Ecco il codice minimo di un bot completo:

```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. Prendi gli header
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. Verifica che sia davvero Discord (niente spam)
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3. Parso quello che ha mandato
  const interaction = JSON.parse(body);

  // 4. Rispondi in base al tipo
  if (interaction.type === 1) {
    // Test Discord (PING)
    return c.json({ type: 1 });
  }

  if (interaction.type === 2) {
    // È una slash command
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

Tipo, 30 righe ed è un bot funzionante.

Niente `bot.login()`. Niente event emitter. Niente callback hell. Solo HTTP.

Per deploy su Cloudflare:

```plaintext
npm install -D wrangler
npx wrangler deploy
```

Boom. Hai una URL tipo `https://mon-bot.workers.dev/interactions`.

La metti nel Discord Developer Portal sotto "INTERACTIONS ENDPOINT URL", e Discord inizia a mandarti le interazioni lì.

## Verificare la firma : niente fake requests

Discord firma ogni richiesta con una chiave pubblica. Se ricevi una richiesta con una firma sbagliata? È spam. Ignora e vai avanti.

Il pacchetto `discord-interactions` fa il lavoro:

```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // testo esatto (non JSON parsato!)
  signature,         // header x-signature-ed25519
  timestamp,         // header x-signature-timestamp
  publicKey          // dal Discord Dev Portal
);
```

**Trappola importante**: la firma dipende dal body _esatto_. Se parsi JSON e re-stringifichi, o se logghi il body, rompi la firma.

Verifica prima. Parsa dopo. È l'ordine che conta.

## Caso 1 : Nibi (bot apprendimento giapponese)

Nibi è un bot Discord per imparare il giapponese. Comandi semplici:

*   `/dictionary kanji` → mostra le definizioni
*   `/pronounce テキスト` → genera TTS (text-to-speech)
*   `/hello` → messaggio di benvenuto

Ogni comando è un file TypeScript:

```plaintext
src/commands/
├── dictionary.ts
├── pronounce.ts
├── hello.ts
└── ...
```

Un comando implementa questa interfaccia:

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

### Il comando /pronounce : far parlare il bot

Questo è quello più pazzesco. Mandi del testo (romaji, hiragana, kanji, qualsiasi cosa), il bot converte in hiragana, genera TTS via VOICEVOX o Google TTS, e invia un messaggio audio su Discord.

```typescript
const pronounce: Command = {
  data: {
    name: 'pronounce',
    description: 'Genera TTS per testo giapponese',
    options: [
      {
        type: 3,  // STRING
        name: 'text',
        description: 'Testo da pronunciare',
        required: true
      }
    ]
  },

  async execute(interaction, env) {
    const text = interaction.data.options[0].value;

    try {
      // 1. Convertire romaji → hiragana con Kuroshiro
      const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });

      // 2. Generare l'audio TTS
      const audioBuffer = await generateTTS(hiragana);

      // 3. Upload del file su Discord
      const uploadFilename = await uploadToDiscord(
        audioBuffer,
        interaction.channel.id,
        env.BOT_TOKEN
      );

      // 4. Inviare il messaggio con l'audio
      await sendVoiceMessage(
        interaction.channel.id,
        uploadFilename,
        audioBuffer.length / 16000,  // durata in secondi
        env.BOT_TOKEN
      );

      return {
        type: 4,
        data: { content: `Pronuncia per "${text}"` }
      };
    } catch (err) {
      return {
        type: 4,
        data: {
          content: 'Errore: impossibile generare l\'audio xD',
          flags: 64  // ephemeral (messaggio privato)
        }
      };
    }
  }
};
```

È pazzesco: chiami un'API esterna, carichi un file su Discord, invii un messaggio con il file. Tutto senza WebSocket, solo HTTP.

### Persistenza con Supabase

Nibi usa Supabase come key-value store. Per verificare se un utente è registrato:

```typescript
const DatabaseUtils = new DatabaseUtils({
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY
});

const users = await DatabaseUtils.readJson('users');
const user = users.find(u => u.id === interaction.member.user.id);

if (!user) {
  // Aggiungere l'utente
  users.push({ id: interaction.member.user.id, verified: true });
  await DatabaseUtils.writeJson('users', users);
}
```

È molto basico (niente vere query SQL, solo JSON), ma funziona. Per i bot piccoli è perfetto.

## Caso 2 : Konosuba-RPG (gioco Discord con rendering immagine)

Ok, questa è pazzesca.

Konosuba-RPG è un **gioco completo** su Discord. Combatti mob, guadagni XP, equipaggi accessori, sali di livello. Ogni battaglia genera un'**immagine** in tempo reale. Niente spritesheet pre-renderizzato. L'immagine è composta dinamicamente dalle stats del giocatore, il mob, e lo stato del combattimento.

E l'immagine si genera in \<500ms su Cloudflare Workers. Letteralmente.

### L'architettura del rendering

```plaintext
Discord (clicchi "Attack")
    ↓
Cloudflare Worker riceve l'interazione
    ↓
Aggiornamento del game state (XP, HP, ecc.)
    ↓
Genera JSX con Satori
    ↓
Converte SVG → PNG con Resvg (Wasm)
    ↓
Upload dell'immagine su Discord
    ↓
Invia il messaggio con l'immagine
```

Tutto in meno di un secondo. È pazzesco.

### Rendering immagine lato Workers

Konosuba usa **Satori** (JSX → SVG) e **Resvg** (SVG → PNG):

```typescript
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. Creare JSX per la UI
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

Scrivi JSX normale. Diventa SVG. SVG diventa PNG. \<100ms su un Cloudflare Worker.

Capisci la potenza? È tipo... bellissimo xD

### Game state e progressione

I dati del giocatore sono su Supabase:

```typescript
const player = await db
  .from('players')
  .select('*')
  .eq('discord_id', interaction.user.id)
  .single();

// Il giocatore ha vinto
const { data: updated } = await db
  .from('players')
  .update({
    level: player.level + 1,
    xp: player.xp + xpGain
  })
  .eq('id', player.id);
```

Ogni azione (attacco, difesa, cura) aggiorna le stats nel database. E poi rigeneri l'immagine con le nuove stats.

### Interazioni : i bottoni del gameplay

Il gioco usa **button interactions** per le azioni in combattimento:

```typescript
{
  type: 1,  // ActionRow
  components: [
    {
      type: 2,  // Button
      style: 1,  // Primary (blu)
      label: 'Attack',
      custom_id: 'battle_attack'
    },
    {
      type: 2,
      style: 2,  // Secondary (grigio)
      label: 'Defend',
      custom_id: 'battle_defend'
    }
  ]
}
```

Quando clicchi "Attack", Discord POSTa un'interazione con `custom_id: 'battle_attack'`. L'handler la smista:

```typescript
if (interaction.type === 3) {
  // Component interaction (click bottone, ecc.)
  const customId = interaction.data.custom_id;

  if (customId === 'battle_attack') {
    return await handleAttack(interaction, env);
  }
  if (customId === 'battle_defend') {
    return await handleDefend(interaction, env);
  }
}
```

E boom, calcoli i danni, aggiorni il database, rigeneri l'immagine, invii.

È un gioco turn-based completo senza nessuna persistenza di connessione. Solo HTTP stateless. Completamente rotto xD

## Supabase: il database fatto per Workers

I database tradizionali (PostgreSQL, MySQL, MongoDB) sono progettati per connessioni TCP persistenti. Apri un socket, tieni la connessione aperta, invii query. Problema: **Cloudflare Workers non supporta connessioni TCP persistenti**. Ogni richiesta è un processo effimero. Nel momento in cui rispondi al client, il Worker sparisce.

Non puoi fare questo:

```typescript
// Questo NON funziona su Workers
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // connessione TCP persistente = morto
```

Anche i driver PostgreSQL nativi come `pg` o `postgres.js` usano connessioni TCP. Su Workers, crashano.

**Supabase risolve tutto.**

Supabase è un'API REST sopra PostgreSQL. Fai normali richieste HTTP. Ogni chiamata è indipendente, nessuna connessione persistente, nessuno stato da gestire. È perfetto per il modello serverless.

```typescript
// Questo funziona PERFETTAMENTE su Workers
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

Il client Supabase (`@supabase/supabase-js`) usa `fetch` sotto il cofano. E `fetch` è nativo su Workers. Zero configurazione, zero driver, zero connessione persistente.

| Database | Compatibile con Workers? | Perché |
| --- | --- | --- |
| **Supabase** | ✅ Sì | API REST senza stato, HTTP puro |
| **PlanetScale (MySQL)** | ⚠️ Parziale | Solo connessione HTTPS, niente transazioni lunghe |
| **Neon** | ⚠️ Parziale | Ramificazioni serverless ma driver TCP necessario |
| **Turso (libSQL)** | ⚠️ Parziale | HTTP possibile ma limitato |
| **Prisma/Prisma Postgres** | ❌ No | Richiede TCP persistente |
| **MongoDB Atlas** | ❌ No | Driver TCP, niente API REST nativa |
| **Redis (Upstash)** | ✅ Sì | API REST su HTTP |

Il vero vantaggio di Supabase non è solo il DB -- è l'intero ecosistema pensato per l'edge:

- **Auth**: API REST per le sessioni, funziona senza stato
- **Storage**: Caricamento/scaricamento file via HTTP
- **Realtime**: WebSocket opzionale, ma puoi anche fare poll via REST
- **Row Level Security**: le regole di sicurezza vivono nel DB, non nel tuo backend

Per un bot Discord serverless, Supabase è la scelta più semplice e affidabile. Nessun driver da configurare, nessuna connessione da mantenere, nessun timeout. Solo richieste HTTP.

Se vuoi un esempio reale, guarda Nibi qui sopra: il suo codice di persistenza è letteralmente `readJson()` e `writeJson()` su Supabase. Nessuna migrazione, nessuno schema complesso, nessuna configurazione pazzesca. Funziona subito. E se il tuo bot diventa grande, puoi migrare a vere query SQL senza cambiare fornitore.

## Polyfills : quando Node vuole girare su Workers

Alcuni pacchetti si aspettano API Node. Kuromoji (parser kanji) usa `XMLHttpRequest`. I Workers hanno `fetch`, non `XMLHttpRequest`.

Soluzione semplice: aggiungere un polyfill all'inizio di index.ts:

```typescript
// Polyfill XMLHttpRequest per kuromoji
if (!globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest = class {
    // Stub minimale
  } as any;
}
```

O fare un modulo dedicato:

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

È un hack basico, ma funziona.

## Verso un pacchetto npm : hono-discord-interactions

A mano, fare un bot è tanto boilerplate:

*   Verificare la firma Discord
*   Smistare i tipi di interazione
*   Gestire comandi, components, modals
*   Ritornare JSON valido

Si potrebbe astrarre tutto questo in un pacchetto npm. Tipo:

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

Boom. 20 righe invece di 200. Ridurrebbe Nibi della metà facile.

Idea per dopo xD

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

URL risultante: `https://mon-bot.workers.dev/interactions`

Costo: **gratuito** fino a 100k richieste/giorno. Oltre: $0.50/milione.

Spoiler: non raggiungerai mai le 100k richieste a meno di avere 10 000 utenti attivi.

### Vercel

```plaintext
npm run vercel:deploy
```

URL: `https://mon-bot-xyz.vercel.app/api/interactions`

Stesso, gratuito.

### Entrambi insieme

Hono gira ovunque. Puoi deployare lo stesso codice su Cloudflare E Vercel. Utile per ridondanza o per testare prima di scegliere.

## Checklist veloce

1.  Creare un'Applicazione su Discord Developer Portal
2.  Copiare PUBLIC\_KEY, BOT\_TOKEN, APP\_ID
3.  Creare il progetto:
4.  Scrivere index.ts (verifica firma + routing)
5.  Registrare le slash commands (una volta):
6.  Deploy:
7.  Mettere l'URL in Discord (Developer Portal → Application → Interactions Endpoint URL)
8.  Discord testa la connessione (devi rispondere al PING)
9.  Invitare il bot su un server
10.  Fatto

## Vantaggi vs Limitazioni

**Vantaggi**

*   Economico (gratuito fino a 100k req/giorno)
*   Scalabile (niente gestione connessioni)
*   Semplice (niente boilerplate WebSocket)
*   Veloce (Cloudflare = server al edge)
*   Portabile (codice Hono = più host)

**Limitazioni**

*   Niente eventi server in tempo reale (membro entra, ruolo aggiunto, messaggio eliminato, ecc.) -- ricevi solo interazioni (slash commands, buttons, modals)
*   Timeout di 3 secondi per rispondere -- altrimenti Discord mostra "Application did not respond"
*   Se ti servono veri eventi -- serve un webhook HTTP separato o una connessione WebSocket ausiliaria

Per il 90% dei bot (tutto basato su slash commands)? È ok.

## Per concludere

Ho passato un bel po' di tempo a ottimizzare KonosubaRPG e Nibi per risparmiare più richieste possibili, o per ridurre il tempo di processore a caldo, o per ridurre il boot cold. Risultato, ho delle prestazioni pazzesche su praticamente tutto.  
Devo dire che avevo iniziato a "nuvolificare" (non so nemmeno se si dice) la maggior parte dei miei progetti perché avevo una pigrizia monumentale di continuare a ospitarli sulla mia VM. Davvero, credo che siano le Github Actions che mi hanno salvato il culo. I workers anche, ma in realtà quando ho visto che potevo fare daemon con le Github Actions e gli schedule, mi ha davvero salvato fra'.

Scriverò probabilmente un articolo su un progetto chiamato [email-autoreply](https://github.com/fox3000foxy/email-autoreply/), quindi iscriviti al feed RSS per vederlo uscire a breve :)).

**Le 3 cose da ricordare:**

1.  **Interaction endpoints = HTTP serverless** -- Niente WebSocket, niente connessione persistente. Discord POSTa, tu rispondi. Gratuito su Cloudflare.
2.  **Hono è lo strumento perfetto** -- Framework leggero (12KB), multi-runtime, zero dipendenze. Codice identico su Cloudflare, Vercel, Node, ovunque.
3.  **Render immagine su Workers = pazzesco** -- Satori + Resvg (Wasm) ti permette di comporre UI dinamiche in JSX e convertirle in PNG in \<100ms. Un gioco completo può girare su questo.

È malato xD

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
