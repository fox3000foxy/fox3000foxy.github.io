---
title: "Discord-Bot 100 % serverless: Hono + Cloudflare Workers"
description: Wie ich einen Discord-Bot, der mich 50€/Monat kostete, durch
  null Euro ersetzt habe, Interaction Endpoints, Hono, Workers, Echtzeit-Bildrendering,
  und ein komplettes Spiel ohne WebSocket.
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
author_sig: "qYsvsfcw79/vj4mBzY5qPuHHdh/ZChK2yHqLtKjCNYnjXNWQUdtL6E4HI5QjsixX5d3jQ3T/WngETpNChLsDlQ=="
---

## Discord-Bot 100 % serverless: Hono + Cloudflare Workers = 💸 null

Ich habe ein paar Monate klassische Discord-Bots auf meiner eigenen Maschine gepflegt.

Immer offene WebSocket-Verbindung. Der Bot reconnectet allein um 3 Uhr morgens. Der Bot crasht, weil ich die Schafe schief anschaue. Die Rechnung steigt.

Eines Tages habe ich entdeckt: **Warum eine Verbindung pflegen**? Discord kann dir einfach die Events POSTen, die dich interessieren. Du antwortest, fertig.

Seit 2021 bietet Discord **Interaction Endpoints** an.

Das ist nur HTTP. Du arbeitest ohne WebSocket, ohne persistenten Zustand. Du empfängst eine Anfrage, du schickst JSON, fertig. Die nächste Anfrage kommt von allein.

Und das Beste: Cloudflare Workers ist **gratis** bis 100k Anfragen/Tag. Für 90 % der Bots sind das 0€/Monat.

Dieser Artikel zeigt dir, wie man einen Discord-Bot ohne WebSocket macht, mit **Hono** (ultraleichtes Webframework) und **Cloudflare Workers**. Ich zeige dir zwei echte Projekte: **Nibi** (Bot zum Japanischlernen, TTS, cool) und **Konosuba-RPG** (ein _komplettes_ Discord-Spiel mit Echtzeit-Bildrendering).

## WebSocket vs. Interaction Endpoints: warum das eine schlechte Idee war

Stell dir ein Minecraft-Spiel vor, in dem du die Verbindung offen halten musst, selbst wenn du nicht spielst.

Und der Server reconnectet automatisch jedes Mal, wenn er crasht. Du musst Timeouts handhaben, exponentielle Reconnects, den ganzen scheiß Boilerplate, den man hasst. Nur um Interaktionen zu empfangen.

Die Interaction Endpoints sind das Gegenteil. Discord POSTet auf deine URL. Du antwortest. Fertig.

Wenn dein Server crasht? Discord retryt 2-3 Mal und geht weiter. Zero Drama.

**Kosten vorher**: 50€/Monat auf Heroku, nur damit ein Node-Prozess am Leben bleibt.

**Kosten nachher**: 0€/Monat auf Cloudflare bis 100k Anfragen/Tag.

## Die Architektur: was ist das eigentlich?

Discord POSTet eine Anfrage auf deinen Endpoint.

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

Das ist pures HTTP, mit minimalem lesbarem Stack.

## Hono + Cloudflare Workers: die sparsame Combo

**Hono** ist ein Webframework, das 12KB wiegt. Es läuft überall: Cloudflare Workers, Vercel, AWS Lambda, Deno, Bun... derselbe Code überall.

Cloudflare Workers ist Edge-Compute. Deine Anfragen kommen beim nächsten Server an. Antwortzeit: \<100ms. Kosten: gratis bis 100k Anfragen/Tag.

Die Hono + Cloudflare-Combo ist das perfekte Match für einen Discord-Bot.

Hier der Minimalcode eines kompletten Bots:

```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. Header holen
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. Prüfen, dass es wirklich Discord ist (kein Spam)
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3. Parsen, was es geschickt hat
  const interaction = JSON.parse(body);

  // 4. Je nach Typ antworten
  if (interaction.type === 1) {
    // Discord-Test (PING)
    return c.json({ type: 1 });
  }

  if (interaction.type === 2) {
    // Das ist ein Slash Command
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

30 Zeilen reichen für einen funktionsfähigen Bot.

Du vergisst `bot.login()`, die Event Emitter und die Callback-Hölle. Du behältst nur HTTP.

Fürs Deploy auf Cloudflare:

```plaintext
npm install -D wrangler
npx wrangler deploy
```

Boom. Du hast eine URL wie `https://mon-bot.workers.dev/interactions`.

Du trägst das im Discord Developer Portal unter "INTERACTIONS ENDPOINT URL" ein, und Discord fängt an, deine Interaktionen dorthin zu schicken.

## Die Signatur prüfen: keine Fake-Requests

Discord signiert jede Anfrage mit einem öffentlichen Schlüssel. Wenn du eine Anfrage mit schlechter Signatur empfängst? Das ist Spam. Ignorieren und weitermachen.

Das Paket `discord-interactions` macht den Job:

```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // exakter Rohtext (kein geparstes JSON !)
  signature,         // Header x-signature-ed25519
  timestamp,         // Header x-signature-timestamp
  publicKey          // aus Discord Dev Portal
);
```

**Wichtige Falle**: Die Signatur hängt vom _exakten_ Body ab. Wenn du JSON parst und neu stringifizierst oder den Body loggst, brichst du die Signatur.

Zuerst prüfen. Danach parsen. Das ist die Reihenfolge, die zählt.

## Fall 1: Nibi (Bot zum Japanischlernen)

Nibi ist ein Discord-Bot zum Japanischlernen. Simple Commands:

*   `/dictionary kanji` → zeigt Definitionen an
*   `/pronounce テキスト` → generiert TTS (Text-to-Speech)
*   `/hello` → Begrüßungsnachricht

Jeder Command ist eine TypeScript-Datei:

```plaintext
src/commands/
├── dictionary.ts
├── pronounce.ts
├── hello.ts
└── ...
```

Ein Command implementiert dieses Interface:

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

### Der /pronounce-Command: den Bot zum Sprechen bringen

Der ist richtig schräg. Du schickst Text (Romaji, Hiragana, Kanji, egal was), der Bot konvertiert das in Hiragana, generiert TTS via VOICEVOX oder Google TTS und schickt eine Audionachricht auf Discord.

```typescript
const pronounce: Command = {
  data: {
    name: 'pronounce',
    description: 'Generiert TTS für japanischen Text',
    options: [
      {
        type: 3,  // STRING
        name: 'text',
        description: 'Auszusprechender Text',
        required: true
      }
    ]
  },

  async execute(interaction, env) {
    const text = interaction.data.options[0].value;

    try {
      // 1. Romaji → Hiragana konvertieren mit Kuroshiro
      const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });

      // 2. TTS-Audio generieren
      const audioBuffer = await generateTTS(hiragana);

      // 3. Datei zu Discord hochladen
      const uploadFilename = await uploadToDiscord(
        audioBuffer,
        interaction.channel.id,
        env.BOT_TOKEN
      );

      // 4. Nachricht mit Audio schicken
      await sendVoiceMessage(
        interaction.channel.id,
        uploadFilename,
        audioBuffer.length / 16000,  // Dauer in Sekunden
        env.BOT_TOKEN
      );

      return {
        type: 4,
        data: { content: `Aussprache für "${text}"` }
      };
    } catch (err) {
      return {
        type: 4,
        data: {
          content: 'Fehler : Audio konnte nicht generiert werden xD',
          flags: 64  // ephemeral (private Nachricht)
        }
      };
    }
  }
};
```

Das ist verrückt: Du rufst eine externe API auf, lädst eine Datei zu Discord hoch, schickst eine Nachricht mit der Datei. Alles ohne WebSocket, nur HTTP.

### Persistenz mit Supabase

Nibi nutzt Supabase als Key-Value-Store. Um zu prüfen, ob ein Nutzer registriert ist:

```typescript
const DatabaseUtils = new DatabaseUtils({
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY
});

const users = await DatabaseUtils.readJson('users');
const user = users.find(u => u.id === interaction.member.user.id);

if (!user) {
  // Nutzer hinzufügen
  users.push({ id: interaction.member.user.id, verified: true });
  await DatabaseUtils.writeJson('users', users);
}
```

Das ist sehr simpel (keine echten SQL-Queries, nur JSON), aber es funktioniert. Für kleine Bots perfekt.

## Fall 2: Konosuba-RPG (Discord-Spiel mit Bildrendering)

Okay, das hier ist verrückt.

Konosuba-RPG ist ein **komplettes Spiel** auf Discord. Du bekämpfst Mobs, gewinnst XP, rüstest Accessoires aus, steigst Level auf. Jeder Battle generiert ein **Bild** in Echtzeit. Du vermeidest vorgerenderte Spritesheets. Das Bild wird dynamisch aus Spielerstats, Mob und Kampfzustand komponiert.

Und das Bild generiert sich in \<500ms auf Cloudflare Workers. Buchstäblich.

### Die Rendering-Architektur

```plaintext
Discord (du klickst "Attack")
    ↓
Cloudflare Worker empfängt die Interaktion
    ↓
Game-State-Update (XP, HP usw.)
    ↓
JSX mit Satori generieren
    ↓
SVG → PNG konvertieren mit Resvg (Wasm)
    ↓
Bild zu Discord hochladen
    ↓
Nachricht mit Bild schicken
```

Alles in weniger als einer Sekunde. Das ist dingue.

### Bildrendering auf Workers-Seite

Konosuba nutzt **Satori** (JSX → SVG) und **Resvg** (SVG → PNG):

```typescript
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. JSX für die UI erstellen
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

Du schreibst normales JSX. Das wird SVG. SVG wird PNG. \<100ms auf einem Cloudflare Worker.

Du kapierst die Power? Das ist einfach schön.

### Game State und Progression

Die Spielerdaten liegen in Supabase:

```typescript
const player = await db
  .from('players')
  .select('*')
  .eq('discord_id', interaction.user.id)
  .single();

// Der Spieler hat gewonnen
const { data: updated } = await db
  .from('players')
  .update({
    level: player.level + 1,
    xp: player.xp + xpGain
  })
  .eq('id', player.id);
```

Jede Aktion (Angriff, Verteidigung, Heilung) aktualisiert die Stats in der DB. Und danach regenerierst du das Bild mit den neuen Stats.

### Interaktionen: die Gameplay-Buttons

Das Spiel nutzt **Button Interactions** für Kampfaktionen:

```typescript
{
  type: 1,  // ActionRow
  components: [
    {
      type: 2,  // Button
      style: 1,  // Primary (blau)
      label: 'Attack',
      custom_id: 'battle_attack'
    },
    {
      type: 2,
      style: 2,  // Secondary (grau)
      label: 'Defend',
      custom_id: 'battle_defend'
    }
  ]
}
```

Wenn du "Attack" klickst, POSTet Discord eine Interaktion mit `custom_id: 'battle_attack'`. Der Handler routet das:

```typescript
if (interaction.type === 3) {
  // Component-Interaktion (Button-Klick usw.)
  const customId = interaction.data.custom_id;

  if (customId === 'battle_attack') {
    return await handleAttack(interaction, env);
  }
  if (customId === 'battle_defend') {
    return await handleDefend(interaction, env);
  }
}
```

Und boom, du berechnest den Schaden, updatest die DB, regenerierst das Bild, schickst.

Das ist ein komplettes Turn-based-Spiel ohne jegliche Connection-Persistenz. Nur stateless HTTP. Komplett kaputt.

## Supabase: die DB gemacht für Workers

Klassische Datenbanken (PostgreSQL, MySQL, MongoDB) sind für persistente TCP-Verbindungen entworfen. Du öffnest einen Socket, hältst die Verbindung offen, schickst Queries. Problem: **Cloudflare Workers unterstützt keine persistenten TCP-Verbindungen**. Jede Anfrage ist ein ephemerer Prozess. Sobald du dem Client antwortest, verschwindet der Worker.

Du kannst das nicht machen:

```typescript
// Das geht NICHT auf Workers
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // persistente TCP-Verbindung = tot
```

Und selbst native PostgreSQL-Driver wie `pg` oder `postgres.js` nutzen TCP-Verbindungen. Auf Workers crashen sie.

**Supabase löst das alles.**

Supabase ist eine REST-API über PostgreSQL. Du machst normale HTTP-Anfragen. Jeder Call ist unabhängig, keine persistente Verbindung, kein zu verwaltender Zustand. Das passt perfekt zum Serverless-Modell.

```typescript
// Das geht PERFEKT auf Workers
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

Der Supabase-Client (`@supabase/supabase-js`) nutzt `fetch` unter der Haube. Und `fetch` ist nativ auf Workers. Null Konfiguration, null Driver, null persistente Verbindung.

| Datenbank | Workers-kompatibel? | Warum |
| --- | --- | --- |
| **Supabase** | ✅ Ja | Zustandslose REST-API, pures HTTP |
| **PlanetScale (MySQL)** | ⚠️ Teilweise | Nur HTTPS-Verbindung, keine langen Transaktionen |
| **Neon** | ⚠️ Teilweise | Serverless-Branches aber TCP-Driver nötig |
| **Turso (libSQL)** | ⚠️ Teilweise | HTTP möglich aber limitiert |
| **Prisma/Prisma Postgres** | ❌ Nein | Braucht persistentes TCP |
| **MongoDB Atlas** | ❌ Nein | TCP-Driver, keine native REST-API |
| **Redis (Upstash)** | ✅ Ja | HTTP-REST-API |

Der echte Vorteil von Supabase ist nicht nur die DB, es ist das ganze Ökosystem, das edge-first gedacht ist:

- **Auth**: REST-API zum Verwalten der Sessions, funktioniert zustandslos
- **Storage**: Datei-Upload/Download via HTTP
- **Realtime**: Optionales WebSocket, aber du kannst auch via REST pollen
- **Row Level Security**: Die Sicherheitsregeln liegen in der DB, nicht in deinem Backend

Für einen serverless Discord-Bot ist Supabase die simpelste und verlässlichste Wahl. Du konfigurierst keinen Driver, du pflegst keine Verbindung, du handhabst keinen Timeout. Du schickst nur HTTP-Anfragen.

Wenn du ein echtes Beispiel willst, schau dir Nibi oben an: Der Persistenzcode ist buchstäblich `readJson()` und `writeJson()` auf Supabase. Du startest ohne Migrationen, ohne komplexes Schema, ohne schwere Config. Das funktioniert direkt. Und wenn dein Bot groß wird, migrierst du zu echten SQL-Queries, ohne den Provider zu wechseln.

## Polyfills: wenn Node auf Workers laufen will

Manche Pakete erwarten Node-APIs. Kuromoji (Kanji-Parser) nutzt `XMLHttpRequest`. Workers haben `fetch`, kein `XMLHttpRequest`.

Simpler Workaround: Ein Polyfill oben in der index.ts hinzufügen:

```typescript
// XMLHttpRequest-Polyfill für kuromoji
if (!globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest = class {
    // Minimaler Stub
  } as any;
}
```

Oder ein dediziertes Modul machen:

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

Das ist simpler Hack, aber er funktioniert.

## Zu einem npm-Paket: hono-discord-interactions

Von Hand ist einen Bot machen viel Boilerplate:

*   Discord-Signatur prüfen
*   Interaktionstypen routen
*   Commands, Components, Modals handhaben
*   Gültiges JSON zurückgeben

Man könnte das alles in einem npm-Paket abstrahieren. So in der Art:

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

Boum. 20 Zeilen statt 200. Das würde Nibi locker halbieren.

Idee für später.

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

Resultierende URL: `https://mon-bot.workers.dev/interactions`

Kosten: **gratis** bis 100k Anfragen/Tag. Darüber: $0.50/Million.

Spoiler: Du wirst die 100k Anfragen nie ausgeben, außer du hast 10.000 aktive Nutzer.

### Vercel

```plaintext
npm run vercel:deploy
```

URL: `https://mon-bot-xyz.vercel.app/api/interactions`

Gleich, gratis.

### Beide zugleich

Hono läuft überall. Du kannst denselben Code auf Cloudflare UND Vercel deployen. Nützlich für Redundanz oder zum Testen vor der Wahl.

## Schnelle Checkliste

1.  Eine Application auf Discord Developer Portal erstellen
2.  PUBLIC\_KEY, BOT\_TOKEN, APP\_ID kopieren
3.  Das Projekt erstellen:
4.  index.ts schreiben (Signaturprüfung + Routing)
5.  Die Slash Commands registrieren (einmal):
6.  Deployen:
7.  Die URL in Discord eintragen (Developer Portal → Application → Interactions Endpoint URL)
8.  Discord testet die Verbindung (du musst auf PING antworten)
9.  Den Bot auf einen Server einladen
10.  Fertig

## Vorteile vs. Grenzen

**Vorteile**

*   Minimale Kosten (gratis bis 100k Req/Tag)
*   Skalierbar (ohne Verbindungsverwaltung)
*   Simpel (ohne WebSocket-Boilerplate)
*   Schnell (Cloudflare = Edge-Server)
*   Portabel (Hono-Code = mehrere Hosts)

**Grenzen**

*   Du empfängst nur Interaktionen (Slash Commands, Buttons, Modals), ohne Server-Events in Echtzeit (Member joint, Rolle hinzugefügt, Nachricht gelöscht usw.)
*   3 Sekunden Timeout zum Antworten, sonst zeigt Discord "Application did not respond"
*   Wenn du echte Events brauchst, braucht es einen separaten HTTP-Webhook oder eine auxiliare WebSocket-Verbindung

Für 90 % der Bots (alles basierend auf Slash Commands)? Passt.

## Zum Abschluss

Ich habe ziemlich viel Zeit damit verbracht, KonosubaRPG und Nibi zu optimieren, um entweder so viele Anfragen wie möglich zu sparen oder die Hot-CPU-Zeit zu reduzieren oder den Cold Boot zu reduzieren. Ergebnis: Ich habe ziemlich überall saubere Perfs. Man muss wissen, dass ich angefangen hatte, die meisten meiner Projekte zu cloudifizieren (ich weiß nicht mal, ob man das sagt), weil ich monumental faul war, sie weiter auf meiner eigenen VM zu hosten. Wirklich, ich glaube, die Github Actions haben mir den Arsch gerettet. Die Workers auch, aber eigentlich, als ich sah, dass ich mit Github Actions und Schedules Daemons machen konnte, hat mich das wirklich gerettet, ehrlich.

Ich werde wohl einen Artikel über ein Projekt namens [email-autoreply](https://github.com/fox3000foxy/email-autoreply/) schreiben, also abonniert den RSS-Feed, um ihn bald erscheinen zu sehen :)).

**Die 3 Punkte zum Mitnehmen :**

1.  **Interaction Endpoints = HTTP serverless**, ohne WebSocket, ohne persistente Connection. Discord POSTet, du antwortest. Gratis auf Cloudflare.
2.  **Hono ist das perfekte Tool**, leichtes Framework (12KB), Multi-Runtime, null Abhängigkeiten. Identischer Code auf Cloudflare, Vercel, Node, überall.
3.  **Bildrendering auf Workers = verrückt**, Satori + Resvg (Wasm) lässt dich dynamische UIs in JSX komponieren und in \<100ms in PNG konvertieren. Ein komplettes Spiel kann darauf laufen.

Das ist krank.

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
