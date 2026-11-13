---
title: "Bot Discord 100% serverless: Hono + Cloudflare Workers"
description: "Come ho sostituito un bot Discord che mi costava 50€/mese con zero euro: interaction endpoint, Hono, Worker, rendering di immagini in tempo reale, e un gioco completo senza WebSocket."
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
author_sig: "dAGY/XGms1tPwhNDyRsm2CEKMFL+PJmqDEz5BPYE6WAZJ85F6eGBl6Lpx03JZas648LWBGYOnUo0cNQlL3zbxQ=="
---

## Bot Discord 100% serverless: Hono + Cloudflare Workers = zero soldi

Ho passato qualche mese a mantenere bot Discord classici sulla mia macchina.

Connessione WebSocket sempre aperta. Il bot si riconnette da solo alle 3 di mattina. Il bot crasha perché guardo le pecore di traverso. La fattura sale.

Un giorno ho scoperto: **perché mantenere una connessione**? Discord può farti POST solo gli eventi che ti interessano. Rispondi, ed è fatta.

Dal 2021, Discord propone gli **interaction endpoint**.

È solo HTTP. Lavori senza WebSocket, senza stato persistente. Ricevi una richiesta, invii JSON, è finita. La richiesta successiva arriva da sola.

E il meglio: Cloudflare Workers è **gratis** fino a 100k richieste/giorno. Per il 90% dei bot, è 0€/mese.

Questo articolo ti mostra come fare un bot Discord senza WebSocket usando **Hono** (framework web ultra-leggero) e **Cloudflare Workers**. Ti mostro due progetti reali: **Nibi** (bot per imparare il giapponese, TTS, figo) e **Konosuba-RPG** (un gioco Discord _completo_ con rendering di immagini in tempo reale).

## WebSocket contro Interaction Endpoint: perché era una cattiva idea

Immagina un gioco Minecraft dove devi tenere la connessione aperta anche quando non giochi.

E il server si riconnette automaticamente ogni volta che crasha. Devi gestire timeout, riconnessioni esponenziali, tutto il boilerplate di merda che detestiamo. Solo per ricevere interazioni.

Gli interaction endpoint sono l'inverso. Discord fa POST sul tuo URL. Rispondi. È finita.

Se il tuo server crasha? Discord ritenta 2-3 volte e passa oltre. Zero drama.

**Costo prima**: 50€/mese su Heroku solo perché un processo Node resti vivo.

**Costo dopo**: 0€/mese su Cloudflare fino a 100k richieste/giorno.

## L'architettura: cos'è di preciso?

Discord fa POST di una richiesta sul tuo endpoint.

```plaintext
Discord: "Ehi! L'utente ha cliccato su /ping!"
      ↓
   Il tuo URL (Cloudflare Worker)
      ↓
 Verifichi che sia davvero Discord (controllo firma)
      ↓
 Analizzi il tipo di interazione
      ↓
 Esegui l'handler
      ↓
 Restituisci JSON
      ↓
Discord: "Figo, lo mostro all'utente"
```

È HTTP puro, con uno stack minimo e leggibile.

## Hono + Cloudflare Workers: il combo economico

**Hono** è un framework web che pesa 12KB. Gira ovunque: Cloudflare Workers, Vercel, AWS Lambda, Deno, Bun... lo stesso codice ovunque.

Cloudflare Workers è compute all'edge. Le tue richieste arrivano al server più vicino. Tempo di risposta: <100ms. Costo: gratis fino a 100k richieste/giorno.

Il combo Hono + Cloudflare è il match perfetto per un bot Discord.

Ecco il codice minimo di un bot completo:

```typescript
// bot Discord minimo: verifica firma + routing comandi
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. Recupera gli header
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. Verifica che sia davvero Discord (non spam)
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3. Analizza ciò che ha inviato
  const interaction = JSON.parse(body);

  // 4. Rispondi secondo il tipo
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

30 righe bastano per un bot funzionante.

Dimentichi `bot.login()`, gli event emitter e il callback hell. Tieni solo HTTP.

Per deployare su Cloudflare:

```plaintext
npm install -D wrangler
npx wrangler deploy
```

Boom. Hai un URL come `https://mio-bot.workers.dev/interactions`.

Lo metti nel Discord Developer Portal sotto "INTERACTIONS ENDPOINT URL", e Discord inizia a inviarti le interazioni lì.

## Verificare la firma: niente richieste fake

Discord firma ogni richiesta con una chiave pubblica. Se ricevi una richiesta con una firma sbagliata? È spam. Ignora e vai avanti.

Il pacchetto `discord-interactions` fa il lavoro:

```typescript
// verifica la firma Ed25519 di Discord sul body grezzo
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // testo grezzo esatto (non JSON parsato!)
  signature,         // header x-signature-ed25519
  timestamp,         // header x-signature-timestamp
  publicKey          // dal Discord Dev Portal
);
```

**Trappola importante**: la firma dipende dal body _esatto_. Se parsi JSON e re-stringify, o se logghi il body, rompi la firma.

Verifica prima. Parsa dopo. È l'ordine che conta.

## Caso 1: Nibi (bot apprendimento del giapponese)

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
  ): Promise<interactionresponse>;
}
```

### Il comando /pronounce: far parlare il bot

È quello ben strano. Invii testo (romaji, hiragana, kanji, qualsiasi cosa), il bot lo converte in hiragana, genera TTS via VOICEVOX o Google TTS, e invia un messaggio audio su Discord.

```typescript
// comando TTS: romaji → hiragana → audio → Discord
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
      // 1. Converti romaji → hiragana con Kuroshiro
      const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });

      // 2. Genera l'audio TTS
      const audioBuffer = await generateTTS(hiragana);

      // 3. Carica il file su Discord
      const uploadFilename = await uploadToDiscord(
        audioBuffer,
        interaction.channel.id,
        env.BOT_TOKEN
      );

      // 4. Invia il messaggio con l'audio
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

È folle: chiami un'API esterna, carichi un file su Discord, invii un messaggio col file. Tutto senza WebSocket, solo HTTP.

### Persistenza con Supabase

Nibi usa Supabase come key-value store. Per verificare se un utente è registrato:

```typescript
// lettura/scrittura JSON su Supabase
const DatabaseUtils = new DatabaseUtils({
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY
});

const users = await DatabaseUtils.readJson('users');
const user = users.find(u => u.id === interaction.member.user.id);

if (!user) {
  // Aggiungi l'utente
  users.push({ id: interaction.member.user.id, verified: true });
  await DatabaseUtils.writeJson('users', users);
}
```

È molto basico (niente vere query SQL, solo JSON), ma funziona. Per i piccoli bot è perfetto.

## Caso 2: Konosuba-RPG (gioco Discord con rendering immagini)

Okay questa è folle.

Konosuba-RPG è un **gioco completo** su Discord. Combatti mob, guadagni XP, equipaggi accessori, sali di livello. Ogni battaglia genera un'**immagine** in tempo reale. Eviti gli spritesheet pre-renderizzati. L'immagine è composta dinamicamente dalle stat del giocatore, il mob, e lo stato del combattimento.

E l'immagine si genera in <500ms su Cloudflare Workers. Letteralmente.

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
Carica l'immagine su Discord
    ↓
Invia il messaggio con l'immagine
```

Tutto in meno di un secondo. È pazzesco.

### Rendering di immagini sui Worker

Konosuba usa **Satori** (JSX → SVG) e **Resvg** (SVG → PNG):

```typescript
// JSX → SVG → PNG sul Worker
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. Crea JSX per la UI
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

Scrivi JSX normale. Diventa SVG. SVG diventa PNG. <100ms su un Cloudflare Worker.

Cogli la potenza? È solo bello.

### Game state e progressione

I dati del giocatore sono in Supabase:

```typescript
// legge e aggiorna il giocatore in Supabase
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

Ogni azione (attacco, difesa, cura) aggiorna le stat nel DB. E poi rigeneri l'immagine con le nuove stat.

### Interazioni: i pulsanti del gameplay

Il gioco usa **interazioni pulsante** per le azioni in combattimento:

```typescript
// riga di pulsanti attacco/difesa
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

Quando clicchi "Attack", Discord fa POST di un'interazione con `custom_id: 'battle_attack'`. L'handler la instrada così:

```typescript
// instrada i clic sui pulsanti battaglia
if (interaction.type === 3) {
  // Interazione componente (clic pulsante, ecc.)
  const customId = interaction.data.custom_id;

  if (customId === 'battle_attack') {
    return await handleAttack(interaction, env);
  }
  if (customId === 'battle_defend') {
    return await handleDefend(interaction, env);
  }
}
```

E boom, calcoli i danni, aggiorni il DB, rigeneri l'immagine, invii.

È un gioco a turni completo senza alcuna persistenza di connessione. Solo HTTP stateless. Completamente rotto.

## Supabase: il DB fatto per i Worker

I database classici (PostgreSQL, MySQL, MongoDB) sono pensati per connessioni TCP persistenti. Apri un socket, tieni la connessione aperta, invii query. Problema: **Cloudflare Workers non supporta connessioni TCP persistenti**. Ogni richiesta è un processo effimero. Appena rispondi al client, il Worker sparisce.

Non puoi fare questo:

```typescript
// NON funziona sui Worker: connessione TCP persistente
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // connessione TCP persistente = morto
```

E anche i driver PostgreSQL nativi come `pg` o `postgres.js` usano connessioni TCP. Sui Worker, si piantano.

**Supabase risolve tutto questo.**

Supabase è un'API REST sopra PostgreSQL. Fai normali richieste HTTP. Ogni chiamata è indipendente, niente connessione persistente, niente stato da gestire. È perfettamente adatto al modello serverless.

```typescript
// Funziona PERFETTAMENTE sui Worker: solo fetch HTTP
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

Il client Supabase (`@supabase/supabase-js`) usa `fetch` sotto il cofano. E `fetch` è nativo sui Worker. Zero configurazione, zero driver, zero connessione persistente.

| Database | Compatibile Worker? | Perché |
| --- | --- | --- |
| **Supabase** | Sì | REST API senza stato, HTTP puro |
| **PlanetScale (MySQL)** | Parziale | Connessione solo HTTPS, niente transazioni lunghe |
| **Neon** | Parziale | Branch serverless ma serve driver TCP |
| **Turso (libSQL)** | Parziale | HTTP possibile ma limitato |
| **Prisma/Prisma Postgres** | No | Richiede TCP persistente |
| **MongoDB Atlas** | No | Driver TCP, niente REST API nativa |
| **Redis (Upstash)** | Sì | REST API HTTP |

Il vero vantaggio di Supabase non è solo il DB: è tutto l'ecosistema pensato edge-first:

- **Auth**: API REST per gestire le sessioni, funziona senza stato
- **Storage**: Upload/download di file via HTTP
- **Realtime**: WebSocket opzionale, ma puoi anche fare poll via REST
- **Row Level Security**: le regole di sicurezza sono nel DB, non nel tuo backend

Per un bot Discord serverless, Supabase è la scelta più semplice e affidabile. Non configuri alcun driver, non mantieni alcuna connessione, non gestisci alcun timeout. Invii solo richieste HTTP.

Se vuoi un vero esempio, guarda Nibi più sopra: il codice di persistenza è letteralmente `readJson()` e `writeJson()` su Supabase. Parti senza migration, senza schema complesso, senza config pesante. Funziona subito. E se il tuo bot diventa grosso, migri verso vere query SQL senza cambiare provider.

## Polyfill: quando Node vuole girare sui Worker

Alcuni package si aspettano API Node. Kuromoji (parser kanji) usa `XMLHttpRequest`. I Worker hanno `fetch`, non `XMLHttpRequest`.

Soluzione semplice: aggiungi un polyfill in cima a index.ts:

```typescript
// Polyfill XMLHttpRequest per kuromoji
if (!globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest = class {
    // Stub minimo
  } as any;
}
```

O fai un modulo dedicato:

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

È hack basico, ma funziona.

## Verso un pacchetto npm: hono-discord-interactions

A mano, fare un bot è tanto boilerplate:

*   Verifica la firma Discord
*   Instrada i tipi di interazione
*   Gestisce comandi, componenti, modali
*   Restituisce JSON valido

Si potrebbe astrarre tutto questo in un pacchetto npm. Tipo:

```typescript
// handler dichiarativo per comandi slash
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
        data: { content: `Ciao ${interaction.member.user.username}!` }
      })
    }
  ]
});

const app = new Hono();
app.post('/interactions', handler);
export default app;
```

Boom. 20 righe invece di 200. Ridurrebbe Nibi della metà facile.

Idea per dopo.

## Deploy

### Cloudflare Workers

```plaintext
npm install -D wrangler

# wrangler.toml
[env.production]
name = "mio-bot"
main = "src/index.ts"

# Secret
wrangler secret put PUBLIC_KEY --env production
wrangler secret put BOT_TOKEN --env production
wrangler secret put SUPABASE_URL --env production

# Deploy
wrangler deploy --env production
```

URL risultante: `https://mio-bot.workers.dev/interactions`

Costo: **gratis** fino a 100k richieste/giorno. Oltre: $0.50/milione.

Spoiler: non spenderai mai le 100k richieste a meno di avere 10 000 utenti attivi.

### Vercel

```plaintext
npm run vercel:deploy
```

URL: `https://mio-bot-xyz.vercel.app/api/interactions`

Uguale, gratis.

### Entrambi insieme

Hono gira ovunque. Puoi deployare lo stesso codice su Cloudflare E Vercel. Utile per ridondanza o per testare prima di scegliere.

## Checklist rapida

1.  Crea un'Applicazione sul Discord Developer Portal
2.  Copia PUBLIC_KEY, BOT_TOKEN, APP_ID
3.  Crea il progetto:
4.  Scrivi index.ts (verifica firma + routing)
5.  Registra le slash command (una volta):
6.  Deploy:
7.  Metti l'URL in Discord (Developer Portal → Application → Interactions Endpoint URL)
8.  Discord testa la connessione (devi rispondere al PING)
9.  Invita il bot su un server
10.  Fatto

## Vantaggi contro limitazioni

**Vantaggi**

*   Costo minimo (gratis fino a 100k req/giorno)
*   Scalabile (senza gestione di connessione)
*   Semplice (senza boilerplate WebSocket)
*   Rapido (Cloudflare = server all'edge)
*   Portabile (codice Hono = più host)

**Limitazioni**

*   Ricevi solo le interazioni (slash command, pulsanti, modali), senza gli eventi server in tempo reale (membro entra, ruolo aggiunto, messaggio cancellato, ecc.)
*   Timeout di 3 secondi per rispondere: altrimenti Discord mostra "Application did not respond"
*   Se ti servono veri eventi: serve un webhook HTTP separato o una connessione WebSocket ausiliaria

Per il 90% dei bot (tutto basato su slash command)? Va bene.

## Per concludere

Ho passato parecchio tempo a ottimizzare KonosubaRPG e Nibi per risparmiare o più richieste possibili, o per ridurre il tempo di processore a caldo, o per ridurre il boot cold. Risultato, ho performance pazzesche su quasi tutto.
Bisogna sapere che avevo iniziato a cloudificare (non so nemmeno se si dice) la maggior parte dei miei progetti perché avevo una pigrizia monumentale a continuare a ospitarli sulla mia VM. Davvero, credo che siano le Github Action che mi hanno salvato la pelle. I worker anche, ma in realtà quando ho visto che potevo fare demoni con le Github Action e gli schedule, mi ha davvero salvato.

Scriverò senza dubbio un articolo su un progetto chiamato [email-autoreply](https://github.com/fox3000foxy/email-autoreply/), quindi iscrivetevi al feed RSS per vederlo uscire presto :)).

**I 3 punti da ricordare:**

1.  **Interaction endpoint = HTTP serverless**: senza WebSocket, senza connessione persistente. Discord fa POST, tu rispondi. Gratis su Cloudflare.
2.  **Hono è lo strumento perfetto**: framework leggero (12KB), multi-runtime, zero dipendenze. Codice identico su Cloudflare, Vercel, Node, ovunque.
3.  **Rendering immagini sui Worker = folle**: Satori + Resvg (Wasm) ti lascia comporre UI dinamiche in JSX e convertirle in PNG in <100ms. Un gioco completo può girare su questo.

È malato.

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
