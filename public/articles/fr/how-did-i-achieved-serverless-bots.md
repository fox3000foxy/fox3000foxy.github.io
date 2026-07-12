---
title: "Discord bot 100% serverless : Hono + Cloudflare Workers"
description: Comment j'ai remplacé un bot Discord qui me coûtait 50€/mois par
  zéro euro -- interaction endpoints, Hono, Workers, rendu d'image en temps
  réel, et un jeu complet sans WebSocket.
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
author_sig: "xGMEyhZ86/M/8x/hPW59BIgMC9C0uMR0ggeXo94d5c//0yqUhCo2qG61EO+ooRvkGMDzx9EJwaCvpBdbAmsB8Q=="
---

## Discord bot 100% serverless : Hono + Cloudflare Workers = 💸 zéro

J'ai passé quelques mois à maintenir des bot Discord classique sur ma propre machine.

Connexion WebSocket toujours ouverte. Le bot reconnecte tout seul à 3h du matin. Le bot crash parce que je regarde les moutons mal de travers. La facture monte.

Un jour j'ai découvert : **pourquoi maintenir une connexion** ? Discord peut te POST juste les trucs qui t'intéressent. Tu réponds, c'est bon.

Depuis 2021, Discord propose les **interaction endpoints**.

C'est juste HTTP. Pas de WebSocket. Pas d'état persistant. Tu reçois une requête, tu envoies du JSON, c'est fini. La requête suivante arrive toute seule.

Et le meilleur : Cloudflare Workers c'est **gratuit** jusqu'à 100k requêtes/jour. Pour 90% des bots, c'est 0€/mois.

Cet article te montre comment faire un bot Discord sans WebSocket en utilisant **Hono** (framework web ultra-léger) et **Cloudflare Workers**. Je vais te montrer deux projets réels : **Nibi** (bot pour apprendre le japonais, TTS, cool) et **Konosuba-RPG** (un jeu Discord _complet_ avec rendu d'image en temps réel xD).

## WebSocket vs. Interaction Endpoints : pourquoi c'était une mauvaise idée

Imagine un jeu Minecraft où tu dois garder la connexion ouverte même quand tu ne joues pas.

Et le serveur se reconnecte automatiquement chaque fois qu'il crash. Tu dois gérer les timeouts, les reconnections exponentielles, tout le boilerplate de merde qu'on deteste. Juste pour recevoir des interactions.

Les interaction endpoints c'est l'inverse. Discord POST sur ton URL. Tu réponds. C'est fini.

Si ton serveur crash ? Discord retry 2-3 fois et passe à autre chose. Zero drama.

**Coût avant** : 50€/mois sur Heroku juste pour qu'un processus Node reste vivant.

**Coût après** : 0€/mois sur Cloudflare jusqu'à 100k requêtes/jour.

## L'architecture : c'est quoi au juste ?

Discord POSTe une requête sur ton endpoint.

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

C'est HTTP pur. Pas de magie. Pas de libraire lourde.

## Hono + Cloudflare Workers : le combo économe

**Hono** c'est un framework web qui pèse 12KB. Il tourne partout : Cloudflare Workers, Vercel, AWS Lambda, Deno, Bun... le même code partout.

Cloudflare Workers c'est du compute au edge. Tes requêtes arrivent chez le serveur le plus proche. Temps de réponse : \<100ms. Coût : gratuit jusqu'à 100k requêtes/jour.

La combo Hono + Cloudflare c'est le match parfait pour un bot Discord.

Voilà le code minimal d'un bot complet :

```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. Récupère les headers
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. Vérifie que c'est vraiment Discord (pas du spam)
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3. Parse ce qu'il a envoyé
  const interaction = JSON.parse(body);

  // 4. Répond selon le type
  if (interaction.type === 1) {
    // Discord test (PING)
    return c.json({ type: 1 });
  }

  if (interaction.type === 2) {
    // C'est une slash command
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

Genre, 30 lignes et c'est un bot fonctionnel.

Pas de `bot.login()`. Pas de event emitter. Pas de callback hell. Juste HTTP.

Pour deploy sur Cloudflare :

```plaintext
npm install -D wrangler
npx wrangler deploy
```

Boom. Tu as une URL genre `https://mon-bot.workers.dev/interactions`.

Tu mets ça dans Discord Developer Portal sous "INTERACTIONS ENDPOINT URL", et Discord commence à envoyer tes interactions là-bas.

## Vérifier la signature : pas de fake requests

Discord signe chaque requête avec une clé publique. Si tu reçois une requête avec une mauvaise signature ? C'est du spam. Ignore et continue.

Le paquet `discord-interactions` fait le job :

```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // texte brut exact (pas JSON parsé !)
  signature,         // header x-signature-ed25519
  timestamp,         // header x-signature-timestamp
  publicKey          // de Discord Dev Portal
);
```

**Piège important** : la signature dépend du body _exact_. Si tu parse JSON et re-stringify, ou si tu log le body, tu casses la signature.

Vérifie d'abord. Parse après. C'est l'ordre qui compte.

## Cas 1 : Nibi (bot apprentissage du japonais)

Nibi c'est un bot Discord pour apprendre le japonais. Commandes simples :

*   `/dictionary kanji` → affiche les définitions
*   `/pronounce テキスト` → génère du TTS (text-to-speech)
*   `/hello` → message d'accueil

Chaque commande c'est un fichier TypeScript :

```plaintext
src/commands/
├── dictionary.ts
├── pronounce.ts
├── hello.ts
└── ...
```

Une commande implémente cette interface :

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

### La commande /pronounce : faire parler le bot

C'est celle qui est bien chelou. Tu envoies du texte (romaji, hiragana, kanji, n'importe quoi), le bot convertit ça en hiragana, génère du TTS via VOICEVOX ou Google TTS, et envoie un message audio sur Discord.

```typescript
const pronounce: Command = {
  data: {
    name: 'pronounce',
    description: 'Génère du TTS pour du texte japonais',
    options: [
      {
        type: 3,  // STRING
        name: 'text',
        description: 'Texte à prononcer',
        required: true
      }
    ]
  },

  async execute(interaction, env) {
    const text = interaction.data.options[0].value;

    try {
      // 1. Convertir romaji → hiragana avec Kuroshiro
      const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });

      // 2. Générer l'audio TTS
      const audioBuffer = await generateTTS(hiragana);

      // 3. Upload le fichier vers Discord
      const uploadFilename = await uploadToDiscord(
        audioBuffer,
        interaction.channel.id,
        env.BOT_TOKEN
      );

      // 4. Envoyer le message avec l'audio
      await sendVoiceMessage(
        interaction.channel.id,
        uploadFilename,
        audioBuffer.length / 16000,  // durée en secondes
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
          flags: 64  // ephemeral (message privé)
        }
      };
    }
  }
};
```

C'est fou : tu appelles une API externe, tu upload un fichier vers Discord, tu envoies un message avec le fichier. Tout ça sans WebSocket, juste HTTP.

### Persistance avec Supabase

Nibi utilise Supabase comme key-value store. Pour vérifier si un utilisateur est enregistré :

```typescript
const DatabaseUtils = new DatabaseUtils({
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY
});

const users = await DatabaseUtils.readJson('users');
const user = users.find(u => u.id === interaction.member.user.id);

if (!user) {
  // Ajouter l'utilisateur
  users.push({ id: interaction.member.user.id, verified: true });
  await DatabaseUtils.writeJson('users', users);
}
```

C'est très basique (pas de vraies requêtes SQL, juste du JSON), mais ça marche. Pour les petits bots c'est parfait.

## Cas 2 : Konosuba-RPG (jeu Discord avec rendu image)

Okay celle-là c'est fou.

Konosuba-RPG c'est un **jeu complet** sur Discord. Tu combats des mobs, tu gagnes de l'XP, tu équipes des accessoires, tu montes de niveau. Chaque battle génère une **image** en temps réel. Pas de spritesheet pre-rendu. L'image est composée dynamiquement depuis les stats du joueur, le mob, et l'état du combat.

Et l'image se genere en \<500ms sur Cloudflare Workers. Littéralement.

### L'architecture du rendu

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

Tout ça en moins d'une seconde. C'est dingue.

### Rendu d'image côté Workers

Konosuba utilise **Satori** (JSX → SVG) et **Resvg** (SVG → PNG) :

```typescript
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. Créer JSX pour le UI
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

Tu écris du JSX normal. Ça devient SVG. SVG devient PNG. \<100ms sur un Cloudflare Worker.

Tu captes la puissance ? C'est juste... beau xD

### Game state et progression

Les données du joueur sont dans Supabase :

```typescript
const player = await db
  .from('players')
  .select('*')
  .eq('discord_id', interaction.user.id)
  .single();

// Le joueur a gagné
const { data: updated } = await db
  .from('players')
  .update({
    level: player.level + 1,
    xp: player.xp + xpGain
  })
  .eq('id', player.id);
```

Chaque action (attaque, défense, soin) met à jour les stats en base. Et ensuite tu régenère l'image avec les nouvelles stats.

### Interactions : les boutons du gameplay

Le jeu utilise des **button interactions** pour les actions en combat :

```typescript
{
  type: 1,  // ActionRow
  components: [
    {
      type: 2,  // Button
      style: 1,  // Primary (bleu)
      label: 'Attack',
      custom_id: 'battle_attack'
    },
    {
      type: 2,
      style: 2,  // Secondary (gris)
      label: 'Defend',
      custom_id: 'battle_defend'
    }
  ]
}
```

Quand tu cliques "Attack", Discord POST une interaction avec `custom_id: 'battle_attack'`. Le handler route ça :

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

Et boom, tu calcules les dégâts, tu updates la base, tu regenere l'image, tu envoies.

C'est un jeu turn-based complet sans aucune persistence de connection. Juste HTTP stateless. Complètement pété xD

## Supabase : la DB faite pour les Workers

Les bases de données classiques (PostgreSQL, MySQL, MongoDB) sont conçues pour des connexions TCP persistantes. Tu ouvres un socket, tu gardes la connexion ouverte, tu envoies des requêtes. Problème : **Cloudflare Workers ne supporte pas les connexions TCP persistantes**. Chaque requête est un processus éphémère. Dès que tu réponds au client, le Worker disparaît.

Tu peux pas faire ça :

```typescript
// Ça marche PAS sur Workers
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // connexion TCP persistante = dead
```

Et même les drivers PostgreSQL natifs comme `pg` ou `postgres.js` utilisent des connexions TCP. Sur Workers, ils plantent.

**Supabase résout tout ça.**

Supabase c'est une API REST au-dessus de PostgreSQL. Tu fais des requêtes HTTP normales. Chaque appel est indépendant, pas de connexion persistante, pas d'état à gérer. C'est parfaitement adapté au modèle serverless.

```typescript
// Ça marche PARFAITEMENT sur Workers
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

Le client Supabase (`@supabase/supabase-js`) utilise `fetch` sous le capot. Et `fetch` est natif sur Workers. Zéro configuration, zéro driver, zéro connexion persistante.

| Base de données | Compatible Workers ? | Pourquoi |
| --- | --- | --- |
| **Supabase** | ✅ Oui | REST API sans état, HTTP pur |
| **PlanetScale (MySQL)** | ⚠️ Partiel | Connexion HTTPS uniquement, pas de transactions longues |
| **Neon** | ⚠️ Partiel | Branches serverless mais driver TCP nécessaire |
| **Turso (libSQL)** | ⚠️ Partiel | HTTP possible mais limogé |
| **Prisma/Prisma Postgres** | ❌ Non | Nécessite TCP persistant |
| **MongoDB Atlas** | ❌ Non | Driver TCP, pas de REST API native |
| **Redis (Upstash)** | ✅ Oui | REST API HTTP |

Le vrai avantage de Supabase c'est pas juste la DB -- c'est tout l'écosystème qui est pensé edge-first :

- **Auth** : API REST pour gérer les sessions, fonctionne sans état
- **Storage** : Upload/download de fichiers via HTTP
- **Realtime** : WebSocket optionnel, mais tu peux aussi poller via REST
- **Row Level Security** : les règles de sécurité sont dans la DB, pas dans ton backend

Pour un bot Discord serverless, Supabase c'est le choix le plus simple et le plus fiable. Pas de driver à configurer, pas de connexion à maintenir, pas de timeouts. Juste des requêtes HTTP.

Si tu veux un vrai exemple, regarde Nibi plus haut : le code de persistance c'est littéralement du `readJson()` et `writeJson()` sur Supabase. Pas de migrations, pas de schémas complexes, pas de config de ouf. Ça marche direct. Et si ton bot devient gros, tu migres vers des vraies requêtes SQL sans changer de provider.

## Polyfills : quand Node veut tourner sur Workers

Certains packages s'attendent à des APIs Node. Kuromoji (parser kanji) utilise `XMLHttpRequest`. Les Workers ont `fetch`, pas `XMLHttpRequest`.

Solution simple : ajouter un polyfill au top du index.ts :

```typescript
// Polyfill XMLHttpRequest pour kuromoji
if (!globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest = class {
    // Stub minimal
  } as any;
}
```

Ou faire un module dédié :

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

C'est du hack basique, mais ça marche.

## Vers un paquet npm : hono-discord-interactions

À la main, faire un bot c'est beaucoup de boilerplate :

*   Vérifie la signature Discord
*   Route les types d'interaction
*   Gère les commandes, components, modals
*   Retourne du JSON valide

On pourrait abstraire tout ça dans un paquet npm. Genre :

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

Boum. 20 lignes au lieu de 200. Ça réduirait Nibi de la moitié facile.

Idée pour plus tard xD

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

URL résultante : `https://mon-bot.workers.dev/interactions`

Coût : **gratuit** jusqu'à 100k requêtes/jour. Au-delà : $0.50/million.

Spoiler : tu dépenseras jamais les 100k requêtes à moins d'avoir 10 000 utilisateurs actifs.

### Vercel

```plaintext
npm run vercel:deploy
```

URL : `https://mon-bot-xyz.vercel.app/api/interactions`

Pareil, gratuit.

### Les deux à la fois

Hono tourne partout. Tu peux déployer le même code sur Cloudflare ET Vercel. Utile pour la redondance ou tester avant de choisir.

## Checkliste rapide

1.  Créer une Application sur Discord Developer Portal
2.  Copier PUBLIC\_KEY, BOT\_TOKEN, APP\_ID
3.  Créer le projet :
4.  Écrire index.ts (vérif signature + routing)
5.  Enregistrer les slash commands (une fois) :
6.  Deploy :
7.  Mettre l'URL dans Discord (Developer Portal → Application → Interactions Endpoint URL)
8.  Discord test la connexion (tu dois répondre au PING)
9.  Inviter le bot sur un serveur
10.  C'est bon

## Avantages vs Limitations

**Avantages**

*   Pas cher (gratuit jusqu'à 100k req/jour)
*   Scalable (pas de connection gestion)
*   Simple (pas de WebSocket boilerplate)
*   Rapide (Cloudflare = serveurs au edge)
*   Portable (code Hono = plusieurs hosts)

**Limitations**

*   Pas d'événements server en temps réel (membre rejoint, rôle ajouté, message supprimé, etc.) -- tu reçois uniquement les interactions (slash commands, buttons, modals)
*   Timeout de 3 secondes pour répondre -- sinon Discord affiche "Application did not respond"
*   Si tu besoin de vraies events -- faut un webhook HTTP séparé ou une connexion WebSocket auxiliaire

Pour 90% des bots (tout basé sur slash commands) ? C'est bon.

## Pour conclure

J'ai passé pas mal de temps à optimiser KonosubaRPG et Nibi pour économiser soit le plus de requêtes possibles, soit pour réduire le temps de processeur à chaud, soit pour réduire le boot cold. Résultat, j'ai de sacrés perfs sur à peu près tout.  
Faut savoir que j'avais commencé à cloudifier (je sais même pas si ca se dit) la plupart de mes projets parce que j'avais une flemme monumentale de continuer à les héberger sur ma propre VM. Vraiment, je crois que ce sont les Github Actions qui m'ont sauvé la peau du cul. Les workers aussi, mais en fait quand j'ai vu que je pouvais faire des daemons avec les Github Actions et les schedules, ça m'a vraiment sauvé en sah.

Je vais sans doute écrire un article sur un projet nommé [email-autoreply](https://github.com/fox3000foxy/email-autoreply/), donc abonnez vous au fil RSS pour le voir sortir prochainement :)).

**Les 3 trucs à retenir :**

1.  **Interaction endpoints = HTTP serverless** -- Pas de WebSocket, pas de connection persistente. Discord POST, tu réponds. Gratuit sur Cloudflare.
2.  **Hono c'est l'outil parfait** -- Framework léger (12KB), multi-runtime, zéro dépendances. Code identique sur Cloudflare, Vercel, Node, partout.
3.  **Renderimage sur Workers = fou** -- Satori + Resvg (Wasm) te laisse composer des UI dynamiques en JSX et les convertir en PNG en \<100ms. Un jeu complet peut tourner sur ça.

C'est malade xD

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