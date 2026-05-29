## Discord Bot 100% serverless: Hono + Cloudflare Workers = 💸 null

Ich hab ein paar Monate damit verbracht, normale Discord-Bots auf meinem eigenen Rechner zu hosten.

WebSocket-Verbindung immer offen. Der Bot verbindet sich um 3 Uhr morgens neu. Der Bot crasht, weil ich die Schafe komisch angucke. Die Rechnung wird höher.

Eines Tages hab ichs kapiert: **warum ne Verbindung offen halten**? Discord kann dir einfach per POST schicken, was dich interessiert. Du antwortest, fertig.

Seit 2021 bietet Discord die **Interaction Endpoints** an.

Das ist nur HTTP. Kein WebSocket. Kein persistentes State. Du kriegst eine Anfrage, du schickst JSON zurück, fertig. Die nächste Anfrage kommt von alleine.

Und das Beste: Cloudflare Workers ist **kostenlos** bis 100k Anfragen/Tag. Für 90% der Bots heißt das 0€/Monat.

Dieser Artikel zeigt dir, wie du einen Discord-Bot ohne WebSocket baust – mit **Hono** (ultraleichtem Web-Framework) und **Cloudflare Workers**. Ich zeig dir zwei echte Projekte: **Nibi** (Bot zum Japanisch lernen, TTS, nice) und **Konosuba-RPG** (ein komplettes _Discord-Spiel_ mit Echtzeit-Bildrendering xD).

## WebSocket vs. Interaction Endpoints: warum das eine schlechte Idee war

Stell dir ein Minecraft-Spiel vor, bei dem du die Verbindung offen halten musst, auch wenn du grad nicht spielst.

Und der Server verbindet sich automatisch neu, jedes Mal wenn er crasht. Du musst Timeouts behandeln, exponentielle Backoffs, den ganzen beschissenen Boilerplate, den wir alle hassen. Nur um Interactions zu empfangen.

Interaction Endpoints sind das Gegenteil. Discord POSTet auf deine URL. Du antwortest. Fertig.

Wenn dein Server crasht? Discord retried 2-3 Mal und macht dann weiter. Null Drama.

**Kosten vorher**: 50€/Monat auf Heroku, nur damit ein Node-Prozess am Leben bleibt.

**Kosten nachher**: 0€/Monat auf Cloudflare bis 100k Anfragen/Tag.

## Die Architektur: worum gehts eigentlich?

Discord POSTet eine Anfrage an deinen Endpoint.

```plaintext
Discord: "Ey! Der User hat auf /ping geklickt!"
      ↓
   Deine URL (Cloudflare Worker)
      ↓
   Du checkst, obs wirklich Discord ist (Signatur-Prüfung)
      ↓
   Du parsed den Interaction-Typ
      ↓
   Du führst den Handler aus
      ↓
   Du gibst JSON zurück
      ↓
   Discord: "Cool, ich zeig das dem User an"
```

Reines HTTP. Kein Zauber. Keine dicken Libraries.

## Hono + Cloudflare Workers: das sparsame Duo

**Hono** ist ein Web-Framework, das 12KB wiegt. Es läuft überall: Cloudflare Workers, Vercel, AWS Lambda, Deno, Bun... derselbe Code überall.

Cloudflare Workers ist Compute am Edge. Deine Anfragen landen beim nächsten Server. Antwortzeit: \<100ms. Kosten: kostenlos bis 100k Anfragen/Tag.

Das Duo Hono + Cloudflare ist der perfekte Match für einen Discord-Bot.

Hier ist der minimale Code für einen kompletten Bot:

```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. Header holen
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. Prüfen, obs wirklich Discord ist (kein Spam)
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3. Parsen was geschickt wurde
  const interaction = JSON.parse(body);

  // 4. Antwort je nach Typ
  if (interaction.type === 1) {
    // Discord-Test (PING)
    return c.json({ type: 1 });
  }

  if (interaction.type === 2) {
    // Das ist eine Slash Command
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

So, 30 Zeilen und das ist ein funktionierender Bot.

Kein `bot.login()`. Kein Event Emitter. Kein Callback-Hell. Nur HTTP.

Zum Deploy auf Cloudflare:

```plaintext
npm install -D wrangler
npx wrangler deploy
```

Boom. Du hast ne URL wie `https://mein-bot.workers.dev/interactions`.

Das trägst du im Discord Developer Portal unter "INTERACTIONS ENDPOINT URL" ein, und Discord fängt an, deine Interactions dorthin zu schicken.

## Signatur prüfen: keine Fake Requests

Discord signiert jede Anfrage mit einem öffentlichen Schlüssel. Wenn du ne Anfrage mit falscher Signatur kriegst? Das ist Spam. Ignorieren und weitermachen.

Das Paket `discord-interactions` macht den Job:

```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // exakter roher Text (nicht geparstes JSON!)
  signature,         // Header x-signature-ed25519
  timestamp,         // Header x-signature-timestamp
  publicKey          // vom Discord Dev Portal
);
```

**Wichtige Falle**: Die Signatur hängt vom _exakten_ Body ab. Wenn du JSON parst und wieder stringifyst, oder den Body loggst, zerstörst du die Signatur.

Erst prüfen. Dann parsen. Die Reihenfolge ist entscheidend.

## Fall 1: Nibi (Bot zum Japanisch lernen)

Nibi ist ein Discord-Bot zum Japanisch lernen. Einfache Commands:

*   `/dictionary kanji` → zeigt die Definitionen an
*   `/pronounce テキスト` → generiert TTS (Text-to-Speech)
*   `/hello` → Begrüßungsnachricht

Jeder Command ist eine eigene TypeScript-Datei:

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
  ): Promise<InteractionResponse>;
}
```

### Der /pronounce-Command: den Bot zum Sprechen bringen

Das ist der, der richtig abgedreht ist. Du schickst Text (Romaji, Hiragana, Kanji, egal), der Bot konvertiert das in Hiragana, generiert TTS über VOICEVOX oder Google TTS und schickt eine Audio-Nachricht auf Discord.

```typescript
const pronounce: Command = {
  data: {
    name: 'pronounce',
    description: 'Generiert TTS für japanischen Text',
    options: [
      {
        type: 3,  // STRING
        name: 'text',
        description: 'Text zum Aussprechen',
        required: true
      }
    ]
  },

  async execute(interaction, env) {
    const text = interaction.data.options[0].value;

    try {
      // 1. Romaji → Hiragana mit Kuroshiro konvertieren
      const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });

      // 2. TTS-Audio generieren
      const audioBuffer = await generateTTS(hiragana);

      // 3. Datei zu Discord hochladen
      const uploadFilename = await uploadToDiscord(
        audioBuffer,
        interaction.channel.id,
        env.BOT_TOKEN
      );

      // 4. Nachricht mit Audio senden
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
          content: 'Fehler: Konnte Audio nicht generieren xD',
          flags: 64  // ephemeral (private Nachricht)
        }
      };
    }
  }
};
```

Ist das verrückt: du rufst eine externe API auf, uploadest ne Datei zu Discord, schickst ne Nachricht mit der Datei. Alles ohne WebSocket, nur HTTP.

### Persistenz mit Supabase

Nibi nutzt Supabase als Key-Value-Store. Um zu prüfen, ob ein User registriert ist:

```typescript
const DatabaseUtils = new DatabaseUtils({
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY
});

const users = await DatabaseUtils.readJson('users');
const user = users.find(u => u.id === interaction.member.user.id);

if (!user) {
  // User hinzufügen
  users.push({ id: interaction.member.user.id, verified: true });
  await DatabaseUtils.writeJson('users', users);
}
```

Das ist sehr basic (keine echten SQL-Queries, nur JSON), aber es funktioniert. Für kleine Bots ist das perfekt.

## Fall 2: Konosuba-RPG (Discord-Spiel mit Bildrendering)

Okay, das hier ist abgefahren.

Konosuba-RPG ist ein **komplettes Spiel** auf Discord. Du kämpfst gegen Mobs, sammelst XP, rüstest Accessoires aus, steigst Level auf. Jeder Battle generiert ein **Bild** in Echtzeit. Kein vorgerendertes Spritesheet. Das Bild wird dynamisch aus den Stats des Spielers, dem Mob und dem Kampfzustand zusammengesetzt.

Und das Bild wird in \<500ms auf Cloudflare Workers generiert. Wirklich.

### Die Rendering-Architektur

```plaintext
Discord (du klickst "Attack")
    ↓
Cloudflare Worker empfängt die Interaction
    ↓
Game-State aktualisieren (XP, HP, etc.)
    ↓
JSX mit Satori generieren
    ↓
SVG → PNG mit Resvg (Wasm) konvertieren
    ↓
Bild zu Discord hochladen
    ↓
Nachricht mit Bild senden
```

Das alles in unter einer Sekunde. Ist der Wahnsinn.

### Bildrendering auf den Workers

Konosuba verwendet **Satori** (JSX → SVG) und **Resvg** (SVG → PNG):

```typescript
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. JSX für das UI erstellen
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

Du schreibst normales JSX. Das wird zu SVG. SVG wird zu PNG. \<100ms auf einem Cloudflare Worker.

Checkst du die Power? Das ist einfach... schön xD

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

Jede Aktion (Angriff, Verteidigung, Heilung) updated die Stats in der Datenbank. Und danach wird das Bild mit den neuen Stats neu generiert.

### Interactions: die Gameplay-Buttons

Das Spiel nutzt **Button Interactions** für die Kampfaktionen:

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

Wenn du "Attack" klickst, POSTet Discord eine Interaction mit `custom_id: 'battle_attack'`. Der Handler routet das:

```typescript
if (interaction.type === 3) {
  // Component Interaction (Button-Klick, etc.)
  const customId = interaction.data.custom_id;

  if (customId === 'battle_attack') {
    return await handleAttack(interaction, env);
  }
  if (customId === 'battle_defend') {
    return await handleDefend(interaction, env);
  }
}
```

Und boom, du berechnest den Schaden, updatest die Datenbank, generierst das Bild neu, sendest es.

Es ist ein komplettes rundenbasiertes Spiel ohne jede Verbindungspersistenz. Nur HTTP stateless. Völlig kaputt xD

## Supabase: die Datenbank, die für Workers gemacht ist

Traditionelle Datenbanken (PostgreSQL, MySQL, MongoDB) sind für persistente TCP-Verbindungen ausgelegt. Du öffnest einen Socket, hältst die Verbindung offen, sendest Abfragen. Problem: **Cloudflare Workers unterstützen keine persistenten TCP-Verbindungen**. Jede Anfrage ist ein flüchtiger Prozess. Sobald du antwortest, verschwindet der Worker.

Das geht nicht:

```typescript
// Das funktioniert NICHT auf Workers
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // persistente TCP-Verbindung = tot
```

Selbst native PostgreSQL-Treiber wie `pg` oder `postgres.js` nutzen TCP-Verbindungen. Auf Workers crashen sie.

**Supabase löst das alles.**

Supabase ist eine REST-API auf Basis von PostgreSQL. Du machst normale HTTP-Anfragen. Jeder Aufruf ist unabhängig, keine persistente Verbindung, kein zu verwaltender Zustand. Perfekt für das serverless Modell.

```typescript
// Das funktioniert PERFEKT auf Workers
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

Der Supabase-Client (`@supabase/supabase-js`) verwendet `fetch` unter der Haube. Und `fetch` ist nativ auf Workers. Null Konfiguration, null Treiber, null persistente Verbindung.

| Datenbank | Workers-kompatibel? | Warum |
| --- | --- | --- |
| **Supabase** | ✅ Ja | Zustandslose REST-API, reines HTTP |
| **PlanetScale (MySQL)** | ⚠️ Teilweise | Nur HTTPS-Verbindung, keine langen Transaktionen |
| **Neon** | ⚠️ Teilweise | Serverless Branches, aber TCP-Treiber nötig |
| **Turso (libSQL)** | ⚠️ Teilweise | HTTP möglich, aber eingeschränkt |
| **Prisma/Prisma Postgres** | ❌ Nein | Benötigt persistentes TCP |
| **MongoDB Atlas** | ❌ Nein | TCP-Treiber, keine native REST-API |
| **Redis (Upstash)** | ✅ Ja | REST-API über HTTP |

Der wahre Vorteil von Supabase ist nicht nur die DB -- es ist das gesamte Ökosystem, das für Edge-Compute designt ist:

- **Auth**: REST-API für Sessions, funktioniert zustandslos
- **Storage**: Datei-Upload/Download via HTTP
- **Realtime**: Optionales WebSocket, aber du kannst auch per REST pollan
- **Row Level Security**: Sicherheitsregeln leben in der DB, nicht in deinem Backend

Für einen serverless Discord-Bot ist Supabase die einfachste und zuverlässigste Wahl. Kein Treiber zum Konfigurieren, keine Verbindung zum Aufrechterhalten, keine Timeouts. Nur HTTP-Anfragen.

Wenn du ein echtes Beispiel willst, schau dir Nibi oben an: Sein Persistenz-Code ist buchstäblich `readJson()` und `writeJson()` auf Supabase. Keine Migrationen, keine komplexen Schemas, keine verrückte Konfiguration. Es funktioniert sofort. Und wenn dein Bot groß wird, kannst du auf echte SQL-Abfragen migrieren, ohne den Anbieter zu wechseln.

## Polyfills: wenn Node auf Workers laufen will

Manche Packages erwarten Node-APIs. Kuromoji (Kanji-Parser) nutzt `XMLHttpRequest`. Workers haben `fetch`, nicht `XMLHttpRequest`.

Einfache Lösung: ein Polyfill oben in index.ts einfügen:

```typescript
// Polyfill XMLHttpRequest für kuromoji
if (!globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest = class {
    // Minimaler Stub
  } as any;
}
```

Oder ein dediziertes Modul:

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

Ist ein simpler Hack, aber es funktioniert.

## Auf dem Weg zu einem npm-Paket: hono-discord-interactions

Von Hand einen Bot zu bauen bedeutet viel Boilerplate:

*   Discord-Signatur prüfen
*   Interaction-Types routen
*   Commands, Components, Modals verwalten
*   Valides JSON zurückgeben

Man könnte das alles in ein npm-Paket abstrahieren. So was wie:

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

Bäm. 20 Zeilen statt 200. Das würde Nibi locker um die Hälfte reduzieren.

Idee für später xD

## Deploy

### Cloudflare Workers

```plaintext
npm install -D wrangler

# wrangler.toml
[env.production]
name = "mein-bot"
main = "src/index.ts"

# Secrets
wrangler secret put PUBLIC_KEY --env production
wrangler secret put BOT_TOKEN --env production
wrangler secret put SUPABASE_URL --env production

# Deploy
wrangler deploy --env production
```

Resultierende URL: `https://mein-bot.workers.dev/interactions`

Kosten: **kostenlos** bis 100k Anfragen/Tag. Danach: $0.50/Million.

Spoiler: du wirst die 100k Anfragen nie erreichen, außer du hast 10.000 aktive User.

### Vercel

```plaintext
npm run vercel:deploy
```

URL: `https://mein-bot-xyz.vercel.app/api/interactions`

Genauso, kostenlos.

### Beide gleichzeitig

Hono läuft überall. Du kannst denselben Code auf Cloudflare UND Vercel deployen. Nützlich für Redundanz oder zum Testen vor der Entscheidung.

## Schnell-Checkliste

1.  Application im Discord Developer Portal erstellen
2.  PUBLIC\_KEY, BOT\_TOKEN, APP\_ID kopieren
3.  Projekt erstellen:
4.  index.ts schreiben (Signatur-Prüfung + Routing)
5.  Slash Commands registrieren (einmalig):
6.  Deployen:
7.  URL in Discord eintragen (Developer Portal → Application → Interactions Endpoint URL)
8.  Discord testet die Verbindung (du musst auf PING antworten)
9.  Bot auf einen Server einladen
10.  Fertig

## Vorteile vs. Einschränkungen

**Vorteile**

*   Günstig (kostenlos bis 100k Anfragen/Tag)
*   Skalierbar (kein Verbindungsmanagement)
*   Einfach (kein WebSocket-Boilerplate)
*   Schnell (Cloudflare = Server am Edge)
*   Portabel (Hono-Code = mehrere Hosts)

**Einschränkungen**

*   Keine Echtzeit-Server-Events (Member joined, Rolle hinzugefügt, Nachricht gelöscht, etc.) -- du kriegst nur Interactions (Slash Commands, Buttons, Modals)
*   3 Sekunden Timeout zum Antworten -- sonst zeigt Discord "Application did not respond" an
*   Wenn du echte Events brauchst -- brauchst du einen separaten HTTP-Webhook oder eine zusätzliche WebSocket-Verbindung

Für 90% der Bots (alles auf Slash Commands basierend)? Reicht das.

## Fazit

Ich hab ne ganze Menge Zeit damit verbracht, KonosubaRPG und Nibi zu optimieren – entweder um so viele Requests wie möglich zu sparen, oder um die heiße Rechenzeit zu reduzieren, oder um den Cold Boot zu verkürzen. Ergebnis: ich hab auf fast allem verdammt gute Performance.  
Du musst wissen, ich hatte angefangen, den Großteil meiner Projekte zu cloudifizieren (keine Ahnung ob man das so sagt), weil ich eine monumentale Lust hatte, sie weiter auf meiner eigenen VM zu hosten. Wirklich, ich glaube, die GitHub Actions haben mir den Arsch gerettet. Die Workers auch, aber als ich gesehen hab, dass ich mit GitHub Actions und Schedules Dämonen bauen kann, hat mich das echt gerettet, Alter.

Ich werde wahrscheinlich einen Artikel über ein Projekt namens [email-autoreply](https://github.com/fox3000foxy/email-autoreply/) schreiben, also abonniert den RSS-Feed, damit ihrs seht wenns rauskommt :))

**Die 3 Dinge zum Merken:**

1.  **Interaction Endpoints = HTTP serverless** -- Kein WebSocket, keine persistente Verbindung. Discord POSTet, du antwortest. Kostenlos auf Cloudflare.
2.  **Hono ist das perfekte Tool** -- Leichtes Framework (12KB), Multi-Runtime, null Abhängigkeiten. Identischer Code auf Cloudflare, Vercel, Node, überall.
3.  **Bildrendering auf Workers = verrückt** -- Satori + Resvg (Wasm) lassen dich dynamische UIs in JSX bauen und in \<100ms in PNG konvertieren. Ein komplettes Spiel kann darauf laufen.

Das ist krank xD

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
