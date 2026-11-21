---
title: "Discord-Bot 100 % serverless: Hono + Cloudflare Workers"
description: "Wie ich einen Discord-Bot, der mich 50€/Monat kostete, durch null Euro ersetzt habe, Interaction Endpoints, Hono, Workers, Echtzeit-Bildrendering, und ein komplettes Spiel ohne WebSocket."
date: 2026-05-29
tags:
  - discord
  - cloudflare
  - serverless
  - typescript
  - bots
authors:
  - fox3000foxy
lang: "de"
---
## 

Ich verbrachte einige Monate damit, klassische Discord-Bots auf meiner eigenen Maschine zu halten.

Der Bot verbindet sich um 3 Uhr morgens wieder. Der Bot ist abgestürzt, weil ich die Schafe falsch ansehe.

Eines Tages entdeckte ich: **Warum eine Verbindung aufrechtzuerhalten**? Discord kann dir nur die Ereignisse, die du interessieren.

Seit 2021 bietet Discord die ** endpoints** Interaktion an.

Du arbeitest ohne WebSocket, ohne dauerhaften Zustand.

Und das Beste: Cloudflare Workers ist **gratis** bis zu 100k Anfragen pro Tag. Für 90% der Bots ist es 0€/Monat.

Dieser Artikel zeigt dir, wie du einen Discord-Bot ohne WebSocket mit **Hono** (soft-lever web framework) und **Cloudflare Workers** machst. Ich zeige dir zwei echte Projekte: **Nibi** (Soft-to-the-the -TTS) und **Konosuba-RPG** (ein Discord _komplettes Spiel mit Echtzeit-Bildwiedergabe).

## WebSocket vs. Interaktion Endpoints: Warum war es eine schlechte Idee

Stell dir ein Minecraft-Spiel vor, wo du die Verbindung offen halten musst, auch wenn du nicht spielst.

Und der Server verbindet sich automatisch jedes Mal, wenn er abstürzt. Du musst die Zeitouts, exponentiellen Neuverbindungen, den ganzen Scheiß-Boiler, den wir hassen, verwalten, nur um Interaktionen zu empfangen.

Die endpoint Interaktionen sind umgekehrt.

Wenn dein Server abstürzt? Discord retry 2-3 Mal und geht weiter. Zero drama.

**Vorkosten**: 50€/Monat auf Heroku, nur damit ein Node-Prozess am Leben bleibt.

**Kosten nach**: 0€/Monat auf Cloudflare bis zu 100k Anfragen/Tag.

## Architektur: Was genau ist das?

Discord POST eine Anfrage auf deinem Endpoint.
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
Es ist reines HTTP, mit minimalem und lesbarem Stack.

## Hono + Cloudflare Workers: der sparsame Combo

**Hono** ist ein Webframework, das 12KB wiegt. Es dreht sich überall: Cloudflare Workers, Vercel, AWS Lambda, Deno, Bun... der gleiche Code überall.

Cloudflare Workers ist ein Compute-System. Deine Anfragen kommen auf den nächsten Server. Antwortzeit: \ <100ms. Kosten: kostenlos bis zu 100k Anfragen/Tag.

Die Hono + Cloudflare Combo ist das perfekte Spiel für einen Discord-Bot.

Hier ist der Mindestcode eines kompletten Bots:
```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1 Holt die Headers zurück.
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2- Vergewissern Sie sich, dass es wirklich Discord ist.
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3- Geh, was er geschickt hat.
  const interaction = JSON.parse(body);

  // 4 Antwort je nach Typ
  if (interaction.type === 1) {
    // Discord Test (PING)
    return c.json({ type: 1 });
  }

  if (interaction.type === 2) {
    // Das ist ein Slash-Kommando.
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
30 Linien reichen für einen funktionierenden Bot.

Du vergisst es.`bot.login()`Du bewahrst nur HTTP.

Für Deploy auf Cloudflare:
```plaintext
npm install -D wrangler
npx wrangler deploy
```
Du hast eine URL wie`https://mon-bot.workers.dev/interactions` .

Du legst das in Discord Developer Portal unter "INTERAKTIONEN ENDPOINT URL" und Discord fängt an, deine Interaktionen dort zu senden.

## Signatur überprüfen: keine fake requests

Discord unterschreibt jede Anfrage mit einem öffentlichen Schlüssel. Wenn du eine Anfrage mit einer schlechten Signatur erhalten? Es ist Spam. Ignore und weiter.

Das Paket`discord-interactions`macht den Job:
```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody, // Genauer Bruttotext (nicht JSON parse!)
  signature, // header x-signature-ed25519
  timestamp, // header x-signature-timestamp
  publicKey // von Discord Dev Portal
);
```
**Wichtige Szene**: Die Signatur hängt vom Body _exact_ ab. Wenn du JSON und re-stringify fährst oder den Body unternimmst, bricht du die Signatur.

Du musst erst mal nachsehen, dann geh, dann ist der Befehl wichtig.

## Fall 1: Nibi (japanisch lernender Lernpfad)

Nibi ist ein Discount-Bot, um Japanisch zu lernen. Einfache Befehle:

*   `/dictionary kanji`→ zeigt die Definitionen
*   `/pronounce テキスト`→ erzeugt TTS (text-to-speech)
*   `/hello`→ Empfangsbotschaft

Jeder Befehl ist eine TypeScript-Datei:
```plaintext
src/commands/
├── dictionary.ts
├── pronounce.ts
├── hello.ts
└── ...
```
Ein Befehl implementiert diese Schnittstelle:
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
### Der Befehl /pronounce: den Bot sprechen lassen

Das ist das, was gut ist. Du schickst Text (Romaji, Hiragana, Kanji, alles), der Bot wandelt es in Hiragana um, erzeugt TTS über VOICEVOX oder Google TTS und sendet eine Audio-Nachricht über Discord.
```typescript
const pronounce: Command = {
  data: {
    name: 'pronounce',
    description: 'Génère du TTS pour du texte japonais',
    options: [
      {
        type: 3, // STRING
        name: 'text',
        description: 'Texte à prononcer',
        required: true
      }
    ]
  },

  async execute(interaction, env) {
    const text = interaction.data.options[0].value;

    try {
      // 1. Umrechnen romaji → hiragana mit Kuroshiro
      const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });

      // 2. Generieren von TTS-Audio
      const audioBuffer = await generateTTS(hiragana);

      // 3. Upload-Datei zu Discord
      const uploadFilename = await uploadToDiscord(
        audioBuffer,
        interaction.channel.id,
        env.BOT_TOKEN
      );

      // 4. Senden Sie die Nachricht mit Audio
      await sendVoiceMessage(
        interaction.channel.id,
        uploadFilename,
        audioBuffer.length / 16000, // Dauer in Sekunden
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
          flags: 64 // ephemeral (private Botschaft)
        }
      };
    }
  }
};
```
Das ist verrückt: Du nennst eine externe API, uploadst eine Datei an Discord, sendest eine Nachricht mit der Datei. All das ohne WebSocket, nur HTTP.

### Persistenz mit Supabase

Nibi verwendet Supabase als Key-value store. Um zu überprüfen, ob ein Benutzer registriert ist:
```typescript
const DatabaseUtils = new DatabaseUtils({
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY
});

const users = await DatabaseUtils.readJson('users');
const user = users.find(u => u.id === interaction.member.user.id);

if (!user) {
  // Benutzer hinzufügen
  users.push({ id: interaction.member.user.id, verified: true });
  await DatabaseUtils.writeJson('users', users);
}
```
Es ist sehr einfach (keine echten SQL-Anfragen, nur JSON), aber es funktioniert. Für kleine Bots ist es perfekt.

## Fall 2: Konosuba-RPG (Spiel Discord mit Bildwiedergabe)

Okay, das ist verrückt.

Konosuba-RPG ist ein ** Komplettes Spiel** auf Discord. Du kämpfst gegen Mobs, du gewinnst XP, du verwendest Zubehör, du steigst auf der Ebene. Jedes Battle erzeugt ein **Image** in Echtzeit. Du vermeidest vorrendere Spritesheets. Das Bild wird dynamisch aus den Statistiken des Spielers, dem Mob und dem Zustand des Kampfes zusammengesetzt.

Und das Bild wird in \ <500ms auf Cloudflare Workers. wörtlich.

### Die Architektur des Renderns
```plaintext
Discord (tu cliques "Attack")
    ↓
Cloudflare Worker reçoit l'interaction
    ↓
Mise à jour du game state (XP, HP, etc.)
    ↓
Génère du JSX avec Satori
    ↓
Convertit SVG → PNG avec Resvg (Wasm)
    ↓
Upload l'image vers Discord
    ↓
Envoie le message avec l'image
```
Das alles in weniger als einer Sekunde.

### Bild auf der Seite Workers

Konosuba verwendet **Satori** (JSX → SVG) und **Resvg** (SVG → PNG)
```typescript
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. Erstellen Sie JSX für die U.S.
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

  return png; // Uint8 Array
}
```
Du schreibst normales JSX. Es wird SVG. SVG wird PNG. \ < 100ms auf einer Cloudflare Worker.

- Ist das nicht schön?

### Game state und progression

Die Daten des Spielers sind in Supabase:
```typescript
const player = await db
  .from('players')
  .select('*')
  .eq('discord_id', interaction.user.id)
  .single();

// Der Spieler hat gewonnen.
const { data: updated } = await db
  .from('players')
  .update({
    level: player.level + 1,
    xp: player.xp + xpGain
  })
  .eq('id', player.id);
```
Jede Aktion (Angriff, Verteidigung, Pflege) aktualisiert die Statistiken in der Basis. Und dann stellst du das Bild mit den neuen Statistiken neu.

### Interaktionen: die Tasten des Gameplay

Das Spiel verwendet **Button Interaktion** für Kampfaktionen:
```typescript
{
  type: 1, // ActionRow
  components: [
    {
      type: 2, // Button
      style: 1, // Primary (blau)
      label: 'Attack',
      custom_id: 'battle_attack'
    },
    {
      type: 2,
      style: 2, // Secondary (grau)
      label: 'Defend',
      custom_id: 'battle_defend'
    }
  ]
}
```
Wenn du "Attack" klicken, Discord POST eine Interaktion mit`custom_id: 'battle_attack'`Der Handler fährt das:
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
Und Boom, du rechnest den Schaden, updatest die Basis, tauschst das Bild aus, schickst es.

Es ist ein komplettes turn-based Spiel ohne Konnektivität. Einfach HTTP stateless. Vollständig stürmisch.

## Supabase: die DB für Workers

Die klassischen Datenbanken (PostgreSQL, MySQl, MongoDB) sind für dauerhafte TCP-Verbindungen ausgelegt. Du öffnest einen Socket, behaltest die Verbindung offen, sendest Anfragen. Problem: **Cloudflare Workers unterstützt keine permanenten TCP Verbindungen**. Jede Abfrage ist ein kurzlebiger Prozess. Sobald du auf den Kunden antwortest, verschwindet der Worker.

Das kannst du nicht machen:
```typescript
// Es funktioniert nicht bei Workers
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient(); // Persistente TCP-Verbindung = dead
```
Und sogar die nativen PostgreSQL-Treiber wie `pg` oder `postgres.js` nutzen TCP-Verbindungen. Auf Workers stürzen sie ab.

**Supabase löst all das.**

Supabase ist eine REST-API über PostgreSQL. Du machst normale HTTP-Anfragen. Jeder Anruf ist unabhängig, keine dauerhafte Verbindung, kein Status ist zu verwalten. Es ist perfekt für das Serverless-Modell geeignet.
```typescript
// Es funktioniert PARFAIT auf Workers
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```
Der Kunde Supabase (`@supabase/supabase-js`) verwendet`fetch`Unter der Haube.`fetch`ist natives auf Workers. Null Konfiguration, Null Treiber, Null dauerhafte Verbindung.

| Datenbank | Kompatibel Workers? | Warum |
| --- | --- | --- |
| **Superbase** | ✓ Ja | REST API ohne Status, reines HTTP |
| **PlanetScale (MySQL)** | Teilweise | Nur HTTPS-Verbindung, keine langen Transaktionen |
| **Neon** | Teilweise | Serverless-Branches aber TCP-Treiber erforderlich |
| **Turso (libSQL)** | Teilweise | HTTP möglich, aber gesperrt |
| **Prisma/Prisima Postgres** | ✓ Nein | Dauerhaftes TCP-Bedarfs-Verhältnis |
| **MongoDB Atlas** | ✓ Nein | Driver TCP, kein natives REST API |
| **Redis (Upstash)** | ✓ Ja | REST API HTTP |

Der wahre Vorteil von Supabase ist nicht nur die DB – das ist das ganze Ökosystem, das als edge-first gedacht wird:

- **Auth**: REST-API zur Verwaltung von Sitzungen, funktioniert ohne Status
- **Storage**: Upload/Download von Dateien über HTTP
- **Realtime**: WebSocket optional, aber auch REST-Poller
- **Row Level Security**: Sicherheitsregeln sind in der DB, nicht in deinem Backend

Für einen Discord serverless-Bot ist Supabase die einfachste und zuverlässigste Wahl. Du konfigurierst keinen Treiber, hältst keine Verbindung, verwaltest keine Zeitouts. Du schickst nur HTTP-Anfragen.

Wenn du ein echtes Beispiel willst, schau Nibi höher an: der Persistenzcode ist buchstäblich vom`readJson()`und`writeJson()`Du startest ohne Migration, ohne komplexe Muster, ohne schwere Konfig-Konfigurationen, und wenn dein Bot fett wird, wanderst du in echte SQL-Anfragen, ohne die Vorsehung zu ändern.

## Polyfills: wenn Node auf Workers drehen will

Einige Pakete erwarten Node APIs. Kuromji (parser kanji) verwendet`XMLHttpRequest`Die Workers haben`fetch`nicht`XMLHttpRequest` .

Einfache Lösung: Fügen du ein Polyfill zur Spitze des index.ts hinzu:
```typescript
// Polyfill XMLHttpRequest für Kuromji
if (!globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest = class {
    // Mindest-Stub
  } as any;
}
```
Oder machst du ein spezielles Modul:
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
Das ist ein einfacher Hack, aber es funktioniert.

## Zu einem Paket npm: hano-discord-interactions

In der Hand, einen Bot zu machen, ist eine Menge Boilerplate:

*   Prüft die Signatur Discord
*   Route die Arten der Interaktion
*   Steuerung, Komponenten, Modals
*   Zurück vom gültigen JSON

Wir könnten das alles in einem Paket abstrakt machen.
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
20 Zeilen statt 200, das würde Nibi um die Hälfte leicht reduzieren.

Ich dachte, wir könnten später gehen.

## Deploy

### Cloudflare Workers
```plaintext
npm install -D wrangler

# wrangler.toml
[env.production]
name = "mon-bot"
main = "src/index.ts"

# Geheimnisse
wrangler secret put PUBLIC_KEY --env production
wrangler secret put BOT_TOKEN --env production
wrangler secret put SUPABASE_URL --env production

# Deploy
wrangler deploy --env production
```
Ergebnis-URL:`https://mon-bot.workers.dev/interactions`

Kosten: **gratis** bis zu 100k Anfragen/Tag. Weiter: $0.50/Million.

Spoiler: Du wirst nie 100k Anfragen ausgeben, wenn du nicht 10.000 aktive Benutzer hast.

### Vercel
```plaintext
npm run vercel:deploy
```
Adresse:`https://mon-bot-xyz.vercel.app/api/interactions`

- Das Gleiche, umsonst.

### Beides auf einmal

Hono läuft überall. Du kannst den gleichen Code auf Cloudflare ET Vercel bereitstellen. Nützlich für Redundanz oder Testen, bevor du dich wählst.

## Schneller Checkliste

1.  App auf Discord Developer Portal erstellen
2.  ÖFFENTLICHKEITS-kopieren\_KEY, BOT\_TOKEN, APP\_ID
3.  Projekt erstellen:
4.  Schreibst du index.ts (echte Signatur + Routing)
5.  Slash commands speichern (einmal):
6.  Deploy:
7.  URL in Discord setzen (Developer Portal → Application → Wechselwirkungen Endpoint URL)
8.  Discord Testest du die Verbindung (du musst PING antworten)
9.  Bot auf einen Server einladen
10.  Ist schon gut.

## Vorteile vs. Einschränkungen

**Vorteile**

*   Mindestkosten (kostenlos bis 100k req/Tag)
*   Skalierbar (ohne Verbindungsverwaltung)
*   Einfach (ohne WebSocket-Boilerplatte)
*   Schnell (Cloudflare = edge-Server)
*   Portable (Hono-Code = mehrere Hosts)

**Beschränkungen**

*   Du erhältst nur Interaktionen (slash commands, buttons, modals), ohne Echtzeit-Server-Events (Mitglied, hinzugefügte Rolle, gelöschte Nachricht, etc.)
*   Timeout von 3 Sekunden, um zu antworten – sonst wird Discord "Application did not response" angezeigt
*   Wenn du echte Events benötigen – du benötigen einen separaten HTTP-Webhook oder eine zusätzliche WebSocket-Verbindung

Für 90% der Bots (alles basiert auf slash commands)?

## Zum Abschluss

Ich verbrachte viel Zeit damit KonosubaRPG und Nibi zu optimieren, um entweder so viele Anfragen wie möglich zu sparen, oder um die Prozessorzeit zu reduzieren oder um den cold-Boot zu reduzieren. Ergebnis: Ich habe so ziemlich alles mit stürmischen Perfektionen auf meinem eigenen VM zu tun. Ich muss wissen, dass ich damit begonnen habe, die meisten meiner Projekte zu klonen (ich weiß nicht einmal, ob es sich dabei um eine Art "Github-Action" handelt, weil ich ein monumentales Flemma hatte, sie auf meinem VM weiter zu hosten. Wirklich, ich glaube, dass die Github Actions mich in den Arsch retteten.

Ich werde wahrscheinlich einen Artikel über ein Projekt schreiben, das ich als [email-autoreply](https://github.com/fox3000foxy/email-autoreply/), so abonnieren du den RSS-Kabel, um es bald heraus zu sehen:)).

**Die 3 Punkte, die zu berücksichtigen sind:**

1.  **Interaction endpoints = HTTP serverless** – ohne WebSocket, ohne Verbindung. Discord POST, du antwortest. Kostenlos auf Cloudflare.
2.  **Hono ist das perfekte Werkzeug** – leichtes Framework (12KB), Multi-Runtime, Null Abhängigkeiten. Der Code ist überall auf Cloudflare, Vercel, Node identisch.
3.  **Renderimage auf Workers = verrückt** – Satori + Resvg (Wasm) lässt dich dynamische UIs in JSX komponieren und sie in PNG in \ <100ms konvertieren. Ein komplettes Spiel kann darauf schießen.

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
