---
title: "J'ai passé un week-end à lire le code de konosuba-rpg et voilà ce que j'ai trouvé"
description: "Un RPG tour par tour Discord où chaque action génère une image WebP
  à la volée : URL comme état de jeu, RNG déterministe, pipeline WASM, cache 5
  niveaux, bot serverless."
date: 2026-06-10
tags:
  - discord
  - rpg
  - typescript
  - hono
  - cloudflare-workers
  - supabase
  - wasm
  - gaming
  - serverless
authors:
  - fox3000foxy
---

# J'ai passé un week-end à lire le code de konosuba-rpg et voilà ce que j'ai trouvé

Je maintiens ce projet depuis un moment, mais relire son propre code à tête reposée c'est toujours instructif. konosuba-rpg c'est un RPG tour par tour Discord où chaque action génère une image WebP à la volée. Pas un embed texte. Une vraie image composée, avec les sprites, les barres de vie, les messages de combat -- tout.

La stack : TypeScript, Hono, Vercel, Cloudflare Workers, Supabase. Hébergement entièrement gratuit. Et le bot Discord fonctionne sans serveur persistant. Ce post explique comment tout ça tient ensemble.

![État initial du jeu](/images/konosuba-rpg/game_init.webp)

---

## Le design de base : l'URL comme état du jeu

La première chose qui frappe : il n'y a aucun état côté serveur pour le gameplay. L'état complet d'un combat tient dans l'URL.

```
/konosuba-rpg/fr/abc123/ATK/DEF/ATK/HUG?monster=Vanir&difficulty=hard
```

Chaque segment après le seed est une action jouée. Le serveur reçoit cette URL, repart du début, rejoue toutes les actions dans l'ordre, et renvoie une image du combat à cet instant précis. Aucune session, aucun état en RAM lié à un utilisateur.

Discord fonctionne par boutons interactifs -- quand le joueur appuie sur "Attaquer", Discord envoie au serveur le `custom_id` du bouton. Ce custom_id contient l'URL compressée du combat avec la nouvelle action ajoutée. Le serveur recalcule tout depuis zéro et renvoie l'image mise à jour.

```typescript
// processUrl.ts
const VALID_MOVES_SET = new Set(["ATK", "DEF", "HUG", "HEA", "SPE", "USE"]);
// Précompilé hors fonction -- pas recréé à chaque appel

export default function processUrl(url: string): [Random, string[], string, string | null, string | null] {
  const urlParts = url.split("/");
  const moves: string[] = [];
  for (const part of urlParts) {
    if (VALID_MOVES_SET.has(part.toUpperCase())) moves.push(part.toUpperCase());
  }
  // seed = 6ème segment, haché sur 8096 valeurs
  const seedStr = (urlParts[5] || "").toLowerCase();
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed + seedStr.charCodeAt(i)) % 8096;
  }
  return [new Random(seed), moves, seedStr, monster, difficulty];
}
```

Le `Set` précompilé en dehors de la fonction c'est un détail, mais ça évite de reconstruire la structure à chaque invocation dans un contexte edge où les modules peuvent être ré-évalués.

### Le RNG : RC4 modifié

Le générateur aléatoire est une implémentation RC4 (algorithme de chiffrement stream) détournée en PRNG.

```typescript
export class Random {
  private S: number[]; // table de 256 entrées
  private i: number;
  private j: number;

  constructor(seed?: number) {
    this.S = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    let workingSeed = seed || Date.now();
    for (let i = 0; i < 256; i++) {
      j = (j + this.S[i] + (workingSeed & 0xff)) & 0xff;
      // swap S[i] et S[j]
      [this.S[i], this.S[j]] = [this.S[j], this.S[i]];
      workingSeed >>>= 8;
    }
  }

  next(): number { /* ... */ }
  randint(min: number, max: number): number { /* ... */ }
  choice(array: T[]): T { /* ... */ }
}
```

Pourquoi RC4 ? Parce que c'est un PRNG déterministe avec une distribution correcte et une résistance aux collisions de seed raisonnable. Même seed = même séquence de nombres = même combat à chaque fois. Ça permet de "rejouer" n'importe quel combat en conservant son URL, et garantit que deux serveurs différents (Vercel + Cloudflare) produisent exactement le même résultat pour la même URL.

---

## Le problème de la limite des 100 caractères Discord

Discord impose une limite de 100 caractères sur les `custom_id` des boutons. Après quelques dizaines d'actions, une URL de combat dépasse allègrement cette limite.

Deux mécanismes répondent à ça.

### 1. Compression RLE des actions

Les actions sont encodées avec un seul caractère (`a`=attack, `d`=defend, `h`=hug...) et compressées par run-length encoding :

```typescript
// movesUtils.ts
export function compressMoves(moves: string): string {
  // "aaaaaadddh" → "a6d3h"
  let result = "";
  let count = 1;
  for (let i = 1; i <= actions.length; i++) {
    if (actions[i] === actions[i - 1]) {
      count++;
    } else {
      result += actions[i - 1] + (count > 1 ? String(count) : "");
      count = 1;
    }
  }
  return head + result;
}
```

Simple, mais quand le joueur spam Attaque x10 ça passe de `aaaaaaaaaa` (10 chars) à `a10` (3 chars). Les boutons "Attaquer x4" et "Attaquer x10" dans l'UI existent justement pour ça -- accélérer le combat tout en compressant bien le payload.

### 2. Session tokens quand la compression ne suffit plus

Si le payload compressé reste trop long, il est stocké en base avec un token court :

```typescript
// gameSessionService.ts
const TOKEN_PREFIX = "gs.";
const TOKEN_SIZE = 10; // "gs.aBcDeFgHiJ"

export async function encodeGameplayButtons(buttons: RawButton[]): Promise {
  // Groupe les payloads par battle_key, insère en batch dans Supabase
  // Remplace le custom_id par "gs.{token}:{userId}"
}

export async function decodeGameplayPayloadWithStatus(encodedPayload: string, userID: string) {
  if (!encodedPayload.startsWith(TOKEN_PREFIX)) {
    return { payload: encodedPayload }; // Pas de lookup si pas nécessaire
  }
  // Lookup en mémoire d'abord, puis Supabase si absent
  const cached = tokenToSession.get(token) || await loadTokenRowByToken(token);
  // Vérifie ownership, TTL (7 jours), et turn_version (évite de rejouer un ancien état)
}
```

Les sessions ont un TTL de 7 jours et un pruning automatique toutes les 10 minutes. La vérification `turnVersion` empêche de rejouer un état périmé si le joueur a avancé dans la partie -- une protection discrète contre le "retour arrière" accidentel.

Les deux Maps en mémoire (`tokenToSession`, `latestTurnByBattle`) utilisent le même pattern `globalThis as unknown as GameSessionGlobals` que les caches d'image, pour les mêmes raisons qu'on verra plus bas.

---

## Le pipeline de rendu d'image

![Début de combat contre un Slime](/images/konosuba-rpg/shot_01_start.webp)

La route `/konosuba-rpg/:lang/*` ne renvoie pas du JSON. Elle renvoie une image WebP générée à la demande.

Le pipeline est organisé en 3 layers composités :

```
Background (board + frame)
    +
Characters layer (sprites joueurs + mob, positions fixes)
    +
UI overlay (barres HP, messages, icônes persos via Satori → SVG → PNG)
    ↓
Photon.watermark() × 2
    ↓
WebP output
```

**Background** : deux images fixes (le plateau et le cadre), chargées depuis le filesystem et composées une fois.

**Characters layer** : les sprites sont positionnés selon des coordonnées calculées. Les joueurs morts sont exclus (`activeSlots = slots.filter(s => playerHp[s.i] > 0)`). Les sprites ennemi sont mirrorés horizontalement avec un `flipX` custom -- une boucle pixel par pixel plutôt qu'une dépendance externe.

```typescript
function flipX(img: Photon.PhotonImage): Photon.PhotonImage {
  const w = img.get_width(), h = img.get_height();
  const raw = img.get_raw_pixels();
  const flipped = new Uint8Array(raw.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      const dst = (y * w + (w - 1 - x)) * 4;
      flipped[dst] = raw[src]; flipped[dst+1] = raw[src+1];
      flipped[dst+2] = raw[src+2]; flipped[dst+3] = raw[src+3];
    }
  }
  return new Photon.PhotonImage(flipped, w, h);
}
```

**UI overlay** : c'est la partie lourde. Le JSX de l'interface (barres de vie, textes, icônes) est décrit en React-like avec Satori, rendu en SVG, converti en PNG par `@cf-wasm/resvg`, puis importé dans Photon pour la composition finale. Satori + resvg sont deux modules WASM compilés spécifiquement pour Cloudflare Workers avec le flag `edge-light`.

![Action Défense](/images/konosuba-rpg/shot_03_defend.webp)

![Combat en cours](/images/konosuba-rpg/shot_02_combat.webp)

![Action Câlin](/images/konosuba-rpg/shot_04_hug.webp)

---

## Le système de cache -- la partie la plus travaillée

Il y a 5 niveaux de cache distincts. Chacun cible une granularité différente du pipeline.

```typescript
// renderImage.ts -- tous sur globalThis
G.__imageCache  ??= {} as Record; // assets bruts
G.__base64Cache ??= {} as Record;       // base64 des assets (pour Satori)
G.__fontCache   ??= {} as Record; // polices
G.__photonCache    ??= new LRUCache(40, freePhoton);
G.__layerCache     ??= new LRUCache(12, freePhoton);
G.__uiPhotonCache  ??= new LRUCache(30, freePhoton);
G.__renderOutputCache ??= new LRUCache(120);
```

Le pattern `??=` sur `globalThis` : les modules JavaScript dans les workers edge peuvent être ré-évalués entre requêtes sur certaines configurations. Stocker les caches sur `globalThis` avec `??=` garantit qu'ils survivent à ces ré-évaluations sans être recréés.

### L'eviction WASM

Les caches d'images Photon (`photonCache`, `layerCache`, `uiPhotonCache`) utilisent un callback d'éviction :

```typescript
function freePhoton(_key: string, img: Photon.PhotonImage): void {
  try { img.free(); } catch { /* déjà libéré */ }
}

new LRUCache(40, freePhoton)
```

`Photon.PhotonImage` est un objet WASM avec une mémoire allouée côté linéaire WASM, hors du GC JavaScript. Sans appel explicite à `.free()`, cette mémoire ne se libère jamais. L'eviction du LRU trigger `.free()` automatiquement -- c'est du RAII porté en JavaScript.

### Les clés de cache sont intentionnellement lossy

```typescript
function buildCharactersKey(playerImages: string[][], playerHp: number[], creatureImages: string[], creatureHp: number): string {
  const players = playerImages.map((imgs, i) => `${imgs[0]}:${playerHp[i] > 0 ? 1 : 0}`).join("|");
  return `chars::${players}::${creatureImages[0]}:${creatureHp > 0 ? 1 : 0}`;
}
```

La clé du characters layer n'encode pas la valeur exacte des HP -- juste `1` (vivant) ou `0` (mort). Parce que le sprite d'un joueur à 40 HP et un joueur à 15 HP est identique. Un hit de cache survit donc à n'importe quel dégât tant que personne ne tombe.

La clé UI par contre encode les HP exacts (la barre de vie change à chaque coup) et un hash des messages :

```typescript
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0; // entier 32-bit signé
  }
  return hash.toString(16);
}
```

`Math.imul` force la multiplication en entier 32 bits, ce qui évite les conversions float64 et donne un hash polynomial stable. Pas de dépendance externe pour ça.

### La conversion base64 sans stack overflow

```typescript
function getBase64Cached(key: string, buf: ArrayBuffer): string {
  if (base64Cache[key]) return base64Cache[key];
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000; // 32768 octets
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  const b64 = btoa(binary);
  base64Cache[key] = b64;
  return b64;
}
```

`String.fromCharCode(...largeArray)` peut provoquer un stack overflow sur les grosses images parce que les arguments sont passés sur la call stack. Le chunking par 32Ko évite ça. Le résultat est mis en cache -- la conversion base64 d'une même image n'est faite qu'une fois par instance de worker.

---

## STRIPPER.md -- audit des awaits séquentiels

Il y a un fichier `STRIPPER.md` dans le repo qui documente un audit de parallélisation des `await`. Quelques exemples de ce qui y est consigné :

- Le chargement du profil joueur faisait 3 requêtes Supabase en série (progression, résumé de run, achievements). Elles ont été passées en `Promise.all` -- pas de dépendance entre elles.
- La distribution des récompenses de fin de combat (accessoires + consommables) était séquentielle. Parallélisée de même.
- La création des tokens de session pour les boutons se faisait groupe par groupe. Les groupes indépendants sont maintenant créés en parallèle.

```typescript
// progressionService.ts -- avant (séquentiel)
await grantAccessoryDropRewards(...);
await grantConsumableDropRewards(...);

// après
await Promise.all([
  grantAccessoryDropRewards(...),
  grantConsumableDropRewards(...),
]);
```

Rien de révolutionnaire, mais dans un contexte serverless où chaque milliseconde de temps de réponse est facturée (ou contribue au cold start), ça compte.

---

## Le bot Discord sans serveur persistant

![Victoire](/images/konosuba-rpg/shot_05_win.webp)

Point souvent mal compris : un bot Discord ne nécessite pas forcément une connexion WebSocket persistante. Discord propose une alternative : les **Interactions Endpoint URL**. Tu fournis une URL HTTPS à Discord, et Discord t'envoie un POST pour chaque interaction (slash command, bouton, autocomplete).

```typescript
// interactions.ts
export async function handleInteractions(c: Context) {
  const body = await c.req.text();
  const isVerified = await verifySignature(c, body); // Ed25519
  if (!isVerified) return c.text("Invalid signature", 401);

  const interaction: Interaction = JSON.parse(body);
  if (interaction.type === 1) return c.json({ type: 1 }); // ping Discord
  if (interaction.type === 2) return handleSlashCommand(...);
  if (interaction.type === 3) return handleButtonInteraction(...);
  if (interaction.type === 4) return handleAutocomplete(...);
}
```

Discord envoie un POST, le handler tourne 50-200ms sur une fonction Vercel ou un Cloudflare Worker, répond, et c'est fini. Aucune connexion permanente à maintenir, aucun serveur à garder allumé. L'intégralité du bot Discord est hébergée sur le free tier Vercel.

La vérification Ed25519 (`verifyKey` depuis `discord-interactions`) est obligatoire -- Discord envoie une signature dans les headers que tu dois valider, sinon il rejette l'endpoint.

### L'animation spéciale -- le seul await intentionnel

```typescript
// handleSpecialButton.ts
await new Promise(resolve => setTimeout(resolve, 3000)); // 3 secondes
await fetch(`${DISCORD_API_URL}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
  method: "PATCH",
  // ...
});
```

Ce délai volontaire de 3 secondes est documenté dans STRIPPER.md comme intentionnel. L'attaque spéciale de Megumin (Explosion) a une animation côté Discord -- le message est d'abord mis à jour avec un visuel intermédiaire, puis modifié 3 secondes plus tard avec le résultat. C'est le seul cas où une fonction Vercel tourne volontairement plus longtemps que nécessaire.

![Attaque spéciale](/images/konosuba-rpg/shot_08_special.webp)

---

## La déployabilité sur deux plateformes

Le même codebase tourne sur Vercel (Node.js) et sur Cloudflare Workers (V8 isolates) sans modification :

```typescript
// worker.ts -- entrypoint Cloudflare
export default {
  fetch(request: Request, env: WorkerBindings): Promise {
    syncBindingsToProcessEnv(env); // injecte les secrets CF dans process.env
    return app.fetch(request, env, ctx);
  }
};

// index.ts -- entrypoint Vercel/Node
const isVercelRuntime = process.env.VERCEL === "1";
if (!isVercelRuntime) { start(); }
```

La différence principale : les assets statiques. Sur Vercel, ils sont lus depuis le filesystem (`/var/task/assets/`). Sur Cloudflare Workers, ils passent par un binding `ASSETS` (assets statiques CF) avec fallback vers un mirror HTTPS (`fox3000foxy.com/konosuba-rpg/assets`). Le `getAssetBytes` dans `assetLoader.ts` gère les deux chemins en essayant le filesystem d'abord, puis fetch.

Les WASM (`@cf-wasm/photon/edge-light`, `@cf-wasm/resvg`) ont des builds séparés pour chaque runtime. Le flag `edge-light` dans le nom du package désigne le build compatible Cloudflare Workers, qui n'autorise pas `new WebAssembly.Module()` au runtime -- le WASM doit être pré-compilé.

---

## La progression : XP, niveaux, affinité

![Un boss, 650 HP](/images/konosuba-rpg/shot_06_boss.webp)

La meta-progression repose sur Supabase free tier. Le schéma comporte une table `players` (XP global, niveau, gold), `character_progress` (XP/niveau/affinité par perso pour Darkness, Aqua, Megumin), `runs` (historique des combats), `inventory_items`, `daily_quests_progress`, `achievements_unlocked`, `game_sessions`.

Le modèle de progression est simple :

```typescript
// characterService.ts
export function computeLevelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1; // 100 XP par niveau
}

export function getLevelFactor(level: number): number {
  return 1 + 0.2 * (level - 1); // +20% stats par niveau
}

export function getAffinityFactor(affinity: number): number {
  const stars = Math.floor(affinity / 20); // 20 points par étoile, 5 étoiles max
  return 1.2 ** stars; // progression exponentielle
}
```

Ces facteurs sont appliqués aux stats des persos au début de chaque `processGame`. Kazuma suit le niveau global du joueur, les trois autres ont chacun leur propre XP/niveau. L'affinité (gagnée en récupérant des drops liés à un perso) multiplie ses stats indépendamment.

![Soin](/images/konosuba-rpg/shot_07_heal.webp)

Le système de drops utilise des loot tables pondérées par difficulté :

```typescript
const LOOT_TABLE_BY_DIFFICULTY: Record = {
  [MonsterDifficulty.Easy]: {
    baseRolls: 2, bonusRollChance: 0.1, maxBonusRolls: 2,
    rarityWeights: [
      { rarity: Rarity.Bronze, weight: 68 },
      { rarity: Rarity.Silver, weight: 25 },
      { rarity: Rarity.Gold,   weight: 6  },
      { rarity: Rarity.Epic,   weight: 1  },
    ],
  },
  // ...jusqu'à Legendary
};
```

---

## Les tests

Trois suites : unitaires, perf, et leaks.

Le leak test est particulièrement direct :

```typescript
// leaks.spec.ts
it('does not show strong heap growth across repeated runs', async () => {
  global.gc();
  const before = heapUsedMb();

  for (let i = 0; i < 1200; i++) {
    await processGame(new Random(), ['ATK', 'DEF', 'HUG', 'ATK', 'DEF'], 'Dragon', Lang.English);
  }

  global.gc();
  const after = heapUsedMb();
  expect(after - before).toBeLessThan(20); // max 20MB de croissance heap
});
```

1200 itérations de `processGame`, GC forcé avant et après, delta heap < 20MB. Si ce test passe, `processGame` ne fuite pas. Le test de render (`renderImage.spec.ts`) vérifie plutôt le temps d'exécution sous un seuil pratique.

Il y a aussi un script `bench.ts` pour profiler le pipeline complet :

```
RENDER_PERF=1 npx tsx bench.ts --runs=20 --warmup=3 --monster=Dragon
```

Avec `RENDER_PERF=1`, le wrapper `withPerf` dans chaque service loggue les timings :

```typescript
export async function withPerf(scope: string, label: string, work: () => Promise): Promise {
  const perf = createPerfLogger(scope);
  if (!perf.enabled) return work(); // zero overhead si désactivé
  perf.mark(`${label}:start`);
  try { return await work(); }
  finally { perf.done(`${label}:done`); }
}
```

`createPerfLogger` renvoie des no-ops si `DEV_MODE` et `RENDER_PERF` ne sont pas à `1`. Aucun overhead en production.

---

## Ce que ça coûte à faire tourner

- **Vercel free tier** : 100GB de bandwidth, 1M d'invocations serverless par mois. Le render d'image compte comme une invocation.
- **Cloudflare Workers free tier** : 100K requêtes/jour, 10ms CPU time par requête (le render peut dépasser ça sur les Workers, d'où Vercel en primaire).
- **Supabase free tier** : 500MB de base, 5GB de bandwidth. Suffisant pour des milliers de joueurs.

L'ensemble du backend tourne à coût zéro jusqu'à un volume significatif. Le seul point de friction est la limite CPU de Cloudflare Workers -- le render image est CPU-intensive à cause de WASM, d'où la stratégie de Vercel comme primaire et Workers comme CDN de failover.

---

## Les 3 choses qui méritent d'être retenues

1. **L'URL comme état de jeu** n'est pas juste une astuce sympa -- c'est une contrainte imposée par Discord (les boutons ont une limite de 100 chars) qui a forcé une architecture stateless avec compression RLE + token de session comme fallback. La contrainte a dicté le design.

2. **Le cache WASM avec eviction explicite** : les `PhotonImage` allouent hors du heap JavaScript et ne seront jamais GC'd sans `.free()`. Brancher `freePhoton` sur l'eviction du LRU c'est du RAII en JavaScript. C'est discret dans le code, mais sans ça le worker fuiterait en production.

3. **Un bot Discord serverless sans WebSocket** : c'est moins connu que l'approche WebSocket gateway, mais pour un bot qui fait du traitement stateless (chaque interaction est indépendante), l'Interactions Endpoint est strictement supérieur -- pas de reconnexion, pas de heartbeat, pas de processus à maintenir. Discord gère la disponibilité côté leur infra.

---

*Repo : [fox3000foxy/konosuba-rpg](https://github.com/fox3000foxy/konosuba-rpg)*

*Licence source-available custom -- pas de redistribution, free to use.*