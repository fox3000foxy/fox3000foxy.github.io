---
title: "Ho passato un weekend a leggere il codice di konosuba-rpg ed ecco cosa ho trovato"
description: "Un RPG a turni Discord dove ogni azione genera un'immagine WebP al volo: URL come stato di gioco, RNG deterministico, pipeline WASM, cache a 5 livelli, bot serverless."
date: 2026-06-10
tags:
  - discord
  - rpg
  - typescript
  - hono
  - cloudflare
  - supabase
  - wasm
  - gaming
  - serverless
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "h+0pugR5CLR7TWHHF0Gr3ajxvcisqNjG/Upot/S09pm3vSFstj6iKvnqnku7m3VOKPh9NAvdu8YRJgU2NQl8zg=="
---

# Ho passato un weekend a leggere il codice di konosuba-rpg ed ecco cosa ho trovato

Mantengo questo progetto da un po', ma rileggere il proprio codice a testa riposata è sempre istruttivo. konosuba-rpg è un RPG a turni Discord dove ogni azione genera un'immagine WebP al volo. È una vera immagine composta, con gli sprite, le barre di vita, i messaggi di combattimento: tutto.

Lo stack: TypeScript, Hono, Vercel, Cloudflare Workers, Supabase. Hosting interamente gratuito. E il bot Discord funziona senza server persistente. Questo post spiega come tutto questo sta insieme.

![État initial du jeu](/images/konosuba-rpg/game_init.webp)

---

## Il design di base: l'URL come stato del gioco

La prima cosa che colpisce: non c'è alcuno stato lato server per il gameplay. Lo stato completo di un combattimento sta nell'URL.

```
/konosuba-rpg/fr/abc123/ATK/DEF/ATK/HUG?monster=Vanir&difficulty=hard
```

Ogni segmento dopo il seed è un'azione giocata. Il server riceve questo URL, riparte dall'inizio, rigioca tutte le azioni in ordine, e rinvia un'immagine del combattimento a quell'istante preciso. Nessuna sessione, nessuno stato in RAM legato a un utente.

Discord funziona con pulsanti interattivi: quando il giocatore preme "Attacca", Discord invia al server il `custom_id` del pulsante. Questo custom_id contiene l'URL compresso del combattimento con la nuova azione aggiunta. Il server ricalcola tutto da zero e rinvia l'immagine aggiornata.

```typescript
// processUrl.ts
// Set precompilato: mosse valide riconosciute nell'URL
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

Il `Set` precompilato fuori dalla funzione è un dettaglio, ma evita di ricostruire la struttura a ogni invocazione in un contesto edge dove i moduli possono essere rivalutati.

### Il RNG: RC4 modificato

Il generatore casuale è un'implementazione RC4 (algoritmo di cifratura stream) deviata in PRNG.

```typescript
// PRNG deterministico stile RC4 per rigiocare i combattimenti
export class Random {
  private S: number[]; // tabella di 256 voci
  private i: number;
  private j: number;

  constructor(seed?: number) {
    this.S = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    let workingSeed = seed || Date.now();
    for (let i = 0; i < 256; i++) {
      j = (j + this.S[i] + (workingSeed & 0xff)) & 0xff;
      // scambia S[i] e S[j]
      [this.S[i], this.S[j]] = [this.S[j], this.S[i]];
      workingSeed >>>= 8;
    }
  }

  next(): number { /* ... */ }
  randint(min: number, max: number): number { /* ... */ }
  choice(array: T[]): T { /* ... */ }
}
```

Perché RC4? Perché è un PRNG deterministico con una distribuzione corretta e una resistenza ragionevole alle collisioni di seed. Stesso seed = stessa sequenza di numeri = stesso combattimento ogni volta. Permette di "rigiocare" qualsiasi combattimento conservandone l'URL, e garantisce che due server diversi (Vercel + Cloudflare) producano esattamente lo stesso risultato per lo stesso URL.

---

## Il problema del limite di 100 caratteri Discord

Discord impone un limite di 100 caratteri sui `custom_id` dei pulsanti. Dopo qualche decina di azioni, un URL di combattimento supera abbondantemente questo limite.

Due meccanismi rispondono a questo.

### 1. Compressione RLE delle azioni

Le azioni sono codificate con un solo carattere (`a`=attack, `d`=defend, `h`=hug...) e compresse con run-length encoding:

```typescript
// movesUtils.ts
// comprime sequenze ripetute: "aaaaaadddh" → "a6d3h"
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

Semplice, ma quando il giocatore spamma Attacco x10 passa da `aaaaaaaaaa` (10 char) a `a10` (3 char). I pulsanti "Attacca x4" e "Attacca x10" nella UI esistono proprio per questo: accelerare il combattimento comprimendo bene il payload.

### 2. Token di sessione quando la compressione non basta più

Se il payload compresso resta troppo lungo, è salvato in DB con un token corto:

```typescript
// gameSessionService.ts
// token corto che punta al payload completo in DB
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

Le sessioni hanno un TTL di 7 giorni e un pruning automatico ogni 10 minuti. La verifica `turnVersion` impedisce di rigiocare uno stato scaduto se il giocatore è avanzato nella partita: una protezione discreta contro il "ritorno indietro" accidentale.

Entrambe le Map in memoria (`tokenToSession`, `latestTurnByBattle`) usano lo stesso pattern `globalThis as unknown as GameSessionGlobals` delle cache di immagini, per le stesse ragioni che vedremo più sotto.

---

## La pipeline di rendering immagini

![Début de combat contre un Slime](/images/konosuba-rpg/shot_01_start.webp)

La route `/konosuba-rpg/:lang/*` non rinvia JSON. Rinvia un'immagine WebP generata su richiesta.

La pipeline è organizzata in 3 layer compositi:

```
Background (board + frame)
    +
Characters layer (sprite giocatori + mob, posizioni fisse)
    +
UI overlay (barre HP, messaggi, icone personaggi via Satori → SVG → PNG)
    ↓
Photon.watermark() × 2
    ↓
WebP output
```

**Background**: due immagini fisse (il tavolo e la cornice), caricate dal filesystem e composte una volta.

**Characters layer**: gli sprite sono posizionati secondo coordinate calcolate. I giocatori morti sono esclusi (`activeSlots = slots.filter(s => playerHp[s.i] > 0)`). Gli sprite nemici sono specchiati orizzontalmente con un `flipX` custom: un ciclo pixel per pixel invece di una dipendenza esterna.

```typescript
// specchia uno sprite orizzontalmente pixel per pixel
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

**UI overlay**: è la parte pesante. Il JSX dell'interfaccia (barre di vita, testi, icone) è descritto in React-like con Satori, reso in SVG, convertito in PNG da `@cf-wasm/resvg`, poi importato in Photon per la composizione finale. Satori + resvg sono due moduli WASM compilati apposta per Cloudflare Workers col flag `edge-light`.

![Action Défense](/images/konosuba-rpg/shot_03_defend.webp)

![Combat en cours](/images/konosuba-rpg/shot_02_combat.webp)

![Action Câlin](/images/konosuba-rpg/shot_04_hug.webp)

---

## Il sistema di cache: la parte più lavorata

Ci sono 5 livelli di cache distinti. Ognuno punta a una granularità diversa della pipeline.

```typescript
// renderImage.ts -- tutti su globalThis
G.__imageCache  ??= {} as Record; // asset grezzi
G.__base64Cache ??= {} as Record;       // base64 degli asset (per Satori)
G.__fontCache   ??= {} as Record; // font
G.__photonCache    ??= new LRUCache(40, freePhoton);
G.__layerCache     ??= new LRUCache(12, freePhoton);
G.__uiPhotonCache  ??= new LRUCache(30, freePhoton);
G.__renderOutputCache ??= new LRUCache(120);
```

Il pattern `??=` su `globalThis`: i moduli JavaScript nei worker edge possono essere rivalutati tra richieste su certe configurazioni. Salvare le cache su `globalThis` con `??=` garantisce che sopravvivano a queste rivalutazioni senza essere ricreate.

### L'eviction WASM

Le cache di immagini Photon (`photonCache`, `layerCache`, `uiPhotonCache`) usano una callback di eviction:

```typescript
// libera la memoria WASM all'eviction LRU
function freePhoton(_key: string, img: Photon.PhotonImage): void {
  try { img.free(); } catch { /* già liberato */ }
}

new LRUCache(40, freePhoton)
```

`Photon.PhotonImage` è un oggetto WASM con memoria allocata lato lineare WASM, fuori dal GC JavaScript. Questa memoria resta allocata finché `.free()` non è chiamato in modo esplicito. L'eviction dell'LRU innesca `.free()` automaticamente: è RAII portato in JavaScript.

### Le chiavi di cache sono volutamente lossy

```typescript
// chiave lossy: solo vivo/morto, non gli HP esatti
function buildCharactersKey(playerImages: string[][], playerHp: number[], creatureImages: string[], creatureHp: number): string {
  const players = playerImages.map((imgs, i) => `${imgs[0]}:${playerHp[i] > 0 ? 1 : 0}`).join("|");
  return `chars::${players}::${creatureImages[0]}:${creatureHp > 0 ? 1 : 0}`;
}
```

La chiave del characters layer non codifica il valore esatto degli HP: solo `1` (vivo) o `0` (morto). Perché lo sprite di un giocatore a 40 HP e un giocatore a 15 HP è identico. Un hit di cache sopravvive quindi a qualsiasi danno finché nessuno cade.

La chiave UI invece codifica gli HP esatti (la barra di vita cambia a ogni colpo) e un hash dei messaggi:

```typescript
// hash polinomiale stabile su intero 32 bit
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0; // intero 32-bit con segno
  }
  return hash.toString(16);
}
```

`Math.imul` forza la moltiplicazione in intero a 32 bit, il che evita conversioni float64 e dà un hash polinomiale stabile. Evita di aggiungere una dipendenza esterna per questo.

### La conversione base64 senza stack overflow

```typescript
// conversione base64 a chunk per evitare stack overflow
function getBase64Cached(key: string, buf: ArrayBuffer): string {
  if (base64Cache[key]) return base64Cache[key];
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000; // 32768 byte
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  const b64 = btoa(binary);
  base64Cache[key] = b64;
  return b64;
}
```

`String.fromCharCode(...largeArray)` può provocare uno stack overflow sulle grosse immagini perché gli argomenti sono passati sul call stack. Il chunking da 32Ko evita questo. Il risultato è messo in cache: la conversione base64 di una stessa immagine è fatta una sola volta per istanza di worker.

---

## STRIPPER.md: audit degli await sequenziali

C'è un file `STRIPPER.md` nel repo che documenta un audit di parallelizzazione degli `await`. Qualche esempio di ciò che vi è annotato:

- Il caricamento del profilo giocatore faceva 3 richieste Supabase in serie (progressione, riassunto di run, achievement). Sono state passate in `Promise.all`: nessuna dipendenza tra loro.
- La distribuzione delle ricompense di fine combattimento (accessori + consumabili) era sequenziale. Parallelizzata allo stesso modo.
- La creazione dei token di sessione per i pulsanti avveniva gruppo per gruppo. I gruppi indipendenti sono ormai creati in parallelo.

```typescript
// progressionService.ts -- prima (sequenziale)
// progressioneService.ts -- prima (sequenziale)
await grantAccessoryDropRewards(...);
await grantConsumableDropRewards(...);

// dopo
await Promise.all([
  grantAccessoryDropRewards(...),
  grantConsumableDropRewards(...),
]);
```

Niente di rivoluzionario, ma in un contesto serverless dove ogni millisecondo di tempo di risposta è fatturato (o contribuisce al cold start), conta.

---

## Il bot Discord senza server persistente

![Victoire](/images/konosuba-rpg/shot_05_win.webp)

Punto spesso frainteso: un bot Discord non richiede per forza una connessione WebSocket persistente. Discord propone un'alternativa: le **Interactions Endpoint URL**. Fornisci un URL HTTPS a Discord, e Discord ti invia un POST per ogni interazione (slash command, pulsante, autocomplete).

```typescript
// interactions.ts
// smista POST Discord: ping, slash, pulsanti, autocomplete
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

Discord invia un POST, l'handler gira 50-200ms su una funzione Vercel o un Cloudflare Worker, risponde, ed è finita. Nessuna connessione permanente da mantenere, nessun server da tenere acceso. L'intero bot Discord è ospitato sul free tier Vercel.

La verifica Ed25519 (`verifyKey` da `discord-interactions`) è obbligatoria: Discord invia una firma negli header che devi validare, altrimenti rigetta l'endpoint.

### L'animazione speciale: l'unico await intenzionale

```typescript
// handleSpecialButton.ts
// ritardo volontario per l'animazione Explosion di Megumin
await new Promise(resolve => setTimeout(resolve, 3000)); // 3 secondi
await fetch(`${DISCORD_API_URL}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
  method: "PATCH",
  // ...
});
```

Questo ritardo volontario di 3 secondi è documentato in STRIPPER.md come intenzionale. L'attacco speciale di Megumin (Explosion) ha un'animazione lato Discord: il messaggio è prima aggiornato con un visual intermedio, poi modificato 3 secondi dopo col risultato. È l'unico caso dove una funzione Vercel gira volutamente più a lungo del necessario.

![Attaque spéciale](/images/konosuba-rpg/shot_08_special.webp)

---

## La deployabilità su due piattaforme

Lo stesso codebase gira su Vercel (Node.js) e su Cloudflare Workers (isolati V8) senza modifiche:

```typescript
// worker.ts -- entrypoint Cloudflare
// adatta i secret CF e inoltra ad Hono
export default {
  fetch(request: Request, env: WorkerBindings): Promise {
    syncBindingsToProcessEnv(env); // inietta i secret CF in process.env
    return app.fetch(request, env, ctx);
  }
};

// index.ts -- entrypoint Vercel/Node
const isVercelRuntime = process.env.VERCEL === "1";
if (!isVercelRuntime) { start(); }
```

La differenza principale: gli asset statici. Su Vercel, sono letti dal filesystem (`/var/task/assets/`). Su Cloudflare Workers, passano da un binding `ASSETS` (asset statici CF) con fallback verso un mirror HTTPS (`fox3000foxy.com/konosuba-rpg/assets`). Il `getAssetBytes` in `assetLoader.ts` gestisce entrambi i percorsi provando il filesystem prima, poi fetch.

I WASM (`@cf-wasm/photon/edge-light`, `@cf-wasm/resvg`) hanno build separate per ogni runtime. Il flag `edge-light` nel nome del package indica il build compatibile Cloudflare Workers, che non autorizza `new WebAssembly.Module()` al runtime: il WASM deve essere pre-compilato.

---

## La progressione: XP, livelli, affinità

![Un boss, 650 HP](/images/konosuba-rpg/shot_06_boss.webp)

La meta-progressione poggia su Supabase free tier. Lo schema comporta una tabella `players` (XP globale, livello, gold), `character_progress` (XP/livello/affinità per personaggio per Darkness, Aqua, Megumin), `runs` (storico dei combattimenti), `inventory_items`, `daily_quests_progress`, `achievements_unlocked`, `game_sessions`.

Il modello di progressione è semplice:

```typescript
// characterService.ts
// livello, fattore livello e fattore affinità
export function computeLevelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1; // 100 XP per livello
}

export function getLevelFactor(level: number): number {
  return 1 + 0.2 * (level - 1); // +20% stat per livello
}

export function getAffinityFactor(affinity: number): number {
  const stars = Math.floor(affinity / 20); // 20 punti per stella, 5 stelle max
  return 1.2 ** stars; // progressione esponenziale
}
```

Questi fattori sono applicati alle stat dei personaggi all'inizio di ogni `processGame`. Kazuma segue il livello globale del giocatore, gli altri tre hanno ognuno il loro XP/livello. L'affinità (guadagnata recuperando drop legati a un personaggio) moltiplica le sue stat in modo indipendente.

![Soin](/images/konosuba-rpg/shot_07_heal.webp)

Il sistema di drop usa loot table pesate per difficoltà:

```typescript
// loot table pesate per difficoltà
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
  // ...fino a Legendary
};
```

---

## I test

Tre suite: unitari, perf, e leak.

Il leak test è particolarmente diretto:

```typescript
// leaks.spec.ts
// 1200 run senza crescita heap oltre 20MB
it('does not show strong heap growth across repeated runs', async () => {
  global.gc();
  const before = heapUsedMb();

  for (let i = 0; i < 1200; i++) {
    await processGame(new Random(), ['ATK', 'DEF', 'HUG', 'ATK', 'DEF'], 'Dragon', Lang.English);
  }

  global.gc();
  const after = heapUsedMb();
  expect(after - before).toBeLessThan(20); // max 20MB di crescita heap
});
```

1200 iterazioni di `processGame`, GC forzato prima e dopo, delta heap < 20MB. Se questo test passa, `processGame` non perde. Il test di render (`renderImage.spec.ts`) verifica invece il tempo di esecuzione sotto una soglia pratica.

C'è anche uno script `bench.ts` per profilare la pipeline completa:

```
RENDER_PERF=1 npx tsx bench.ts --runs=20 --warmup=3 --monster=Dragon
```

Con `RENDER_PERF=1`, il wrapper `withPerf` in ogni servizio logga i timing:

```typescript
// wrapper perf con overhead zero se disattivato
export async function withPerf(scope: string, label: string, work: () => Promise): Promise {
  const perf = createPerfLogger(scope);
  if (!perf.enabled) return work(); // zero overhead se disattivato
  perf.mark(`${label}:start`);
  try { return await work(); }
  finally { perf.done(`${label}:done`); }
}
```

`createPerfLogger` restituisce no-op se `DEV_MODE` e `RENDER_PERF` non sono a `1`. Nessun overhead in produzione.

---

## Cosa costa farlo girare

- **Vercel free tier**: 100GB di bandwidth, 1M di invocazioni serverless al mese. Il render di immagini conta come un'invocazione.
- **Cloudflare Workers free tier**: 100K richieste/giorno, 10ms CPU time per richiesta (il render può superare questo sui Worker, da cui Vercel in primario).
- **Supabase free tier**: 500MB di DB, 5GB di bandwidth. Bastano per migliaia di giocatori.

L'insieme del backend gira a costo zero fino a un volume significativo. L'unico punto di frizione è il limite CPU dei Cloudflare Workers: il render immagini è CPU-intensive per via di WASM, da cui la strategia di Vercel come primario e Worker come CDN di failover.

---

## Le 3 cose che meritano di essere trattenute

1. **L'URL come stato di gioco** non è solo un trucco simpatico: è un vincolo imposto da Discord (i pulsanti hanno un limite di 100 char) che ha forzato un'architettura stateless con compressione RLE + token di sessione come fallback. Il vincolo ha dettato il design.

2. **La cache WASM con eviction esplicita**: i `PhotonImage` allocano fuori dall'heap JavaScript e non saranno mai GC senza `.free()`. Collegare `freePhoton` all'eviction dell'LRU è RAII in JavaScript. È discreto nel codice, ma senza questo il worker perderebbe in produzione.

3. **Un bot Discord serverless senza WebSocket**: è meno noto dell'approccio WebSocket gateway, ma per un bot che fa elaborazione stateless (ogni interazione è indipendente), l'Interactions Endpoint è strettamente superiore: niente riconnessione, niente heartbeat, niente processo da mantenere. Discord gestisce la disponibilità lato loro infra.

---

*Repo: [fox3000foxy/konosuba-rpg](https://github.com/fox3000foxy/konosuba-rpg)*

*Licenza source-available custom: niente ridistribuzione, free to use.*
