---
title: "Ich habe ein Wochenende damit verbracht, den Code von konosuba-rpg zu lesen, und das hier habe ich gefunden"
description: "Ein Discord-Runden-RPG, bei dem jede Aktion ein WebP-Bild auf
  Anfrage erzeugt: URL als Spielzustand, deterministischer RNG, WASM-Pipeline,
  5-stufiger Cache, serverloser Bot."
date: 2026-06-10
authors:
  - fox3000foxy
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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "qrmiFrzDCRe5LDTXpm+2wb7dpriJRqn+ufoNILdy1yixXYARmG8yWknRBkNp2ehJdSTQdAJ2rzfwd4lMVwMF7A=="
---

# Ich habe ein Wochenende damit verbracht, den Code von konosuba-rpg zu lesen, und das hier habe ich gefunden

Ich betreibe dieses Projekt seit einer Weile, aber den eigenen Code in Ruhe noch einmal durchzugehen, ist immer lehrreich. konosuba-rpg ist ein Discord-Runden-RPG, bei dem jede Aktion ein WebP-Bild auf Anfrage erzeugt. Kein Text-Embed. Ein echtes zusammengesetztes Bild, mit Sprites, Lebensbalken, Kampfnachrichten – alles.

Der Stack: TypeScript, Hono, Vercel, Cloudflare Workers, Supabase. Vollständig kostenloses Hosting. Und der Discord-Bot läuft ohne persistenten Server. Dieser Beitrag erklärt, wie alles zusammenhält.

![Anfangszustand des Spiels](/images/konosuba-rpg/game_init.webp)

---

## Das grundlegende Design: die URL als Spielzustand

Das Erste, was auffällt: Es gibt keinen serverseitigen Zustand für das Gameplay. Der vollständige Zustand eines Kampfes steckt in der URL.

```
/konosuba-rpg/de/abc123/ATK/DEF/ATK/HUG?monster=Vanir&difficulty=hard
```

Jedes Segment nach dem Seed ist eine gespielte Aktion. Der Server erhält diese URL, startet von vorne, spielt alle Aktionen in der Reihenfolge ab und gibt ein Bild des Kampfes zu diesem Zeitpunkt zurück. Keine Session, kein benutzerbezogener Zustand im RAM.

Discord funktioniert über interaktive Buttons – wenn der Spieler auf "Angreifen" drückt, sendet Discord die `custom_id` des Buttons an den Server. Diese custom_id enthält die komprimierte URL des Kampfes mit der neu hinzugefügten Aktion. Der Server berechnet alles von Grund auf neu und gibt das aktualisierte Bild zurück.

```typescript
// processUrl.ts
const VALID_MOVES_SET = new Set(["ATK", "DEF", "HUG", "HEA", "SPE", "USE"]);
// Vor der Funktion vorkompiliert – wird nicht bei jedem Aufruf neu erstellt

export default function processUrl(url: string): [Random, string[], string, string | null, string | null] {
  const urlParts = url.split("/");
  const moves: string[] = [];
  for (const part of urlParts) {
    if (VALID_MOVES_SET.has(part.toUpperCase())) moves.push(part.toUpperCase());
  }
  // seed = 6. Segment, auf 8096 Werte gehasht
  const seedStr = (urlParts[5] || "").toLowerCase();
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed + seedStr.charCodeAt(i)) % 8096;
  }
  return [new Random(seed), moves, seedStr, monster, difficulty];
}
```

Das vorkompilierte `Set` außerhalb der Funktion ist ein Detail, aber es vermeidet, die Struktur bei jedem Aufruf in einem Edge-Kontext neu aufzubauen, wo Module neu evaluiert werden können.

### Der RNG: modifiziertes RC4

Der Zufallsgenerator ist eine als PRNG zweckentfremdete RC4-Implementierung (Stromchiffre-Algorithmus).

```typescript
export class Random {
  private S: number[]; // Tabelle mit 256 Einträgen
  private i: number;
  private j: number;

  constructor(seed?: number) {
    this.S = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    let workingSeed = seed || Date.now();
    for (let i = 0; i < 256; i++) {
      j = (j + this.S[i] + (workingSeed & 0xff)) & 0xff;
      // swap S[i] und S[j]
      [this.S[i], this.S[j]] = [this.S[j], this.S[i]];
      workingSeed >>>= 8;
    }
  }

  next(): number { /* ... */ }
  randint(min: number, max: number): number { /* ... */ }
  choice(array: T[]): T { /* ... */ }
}
```

Warum RC4? Weil es ein deterministischer PRNG mit einer ordentlichen Verteilung und einer vernünftigen Resistenz gegen Seed-Kollisionen ist. Gleicher Seed = gleiche Zahlenfolge = gleicher Kampf jedes Mal. Das ermöglicht es, jeden Kampf über seine URL „wiederzuspielen", und garantiert, dass zwei verschiedene Server (Vercel + Cloudflare) für dieselbe URL exakt dasselbe Ergebnis liefern.

---

## Das Problem der 100-Zeichen-Grenze von Discord

Discord erzwingt eine Grenze von 100 Zeichen für die `custom_id` von Buttons. Nach ein paar Dutzend Aktionen überschreitet eine Kampf-URL locker diese Grenze.

Zwei Mechanismen begegnen dem.

### 1. RLE-Kompression der Aktionen

Die Aktionen werden mit einem einzelnen Zeichen kodiert (`a`=attack, `d`=defend, `h`=hug...) und per Lauflängenkodierung komprimiert:

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

Einfach, aber wenn der Spieler Angriff x10 spammt, wird aus `aaaaaaaaaa` (10 Zeichen) `a10` (3 Zeichen). Die Buttons "Angreifen x4" und "Angreifen x10" in der UI existieren genau dafür – den Kampf beschleunigen und gleichzeitig die Nutzlast gut komprimieren.

### 2. Session-Tokens, wenn die Kompression nicht mehr ausreicht

Wenn die komprimierte Nutzlast immer noch zu lang ist, wird sie mit einem kurzen Token in der Datenbank gespeichert:

```typescript
// gameSessionService.ts
const TOKEN_PREFIX = "gs.";
const TOKEN_SIZE = 10; // "gs.aBcDeFgHiJ"

export async function encodeGameplayButtons(buttons: RawButton[]): Promise {
  // Gruppiert die Nutzlasten nach battle_key, fügt sie batchweise in Supabase ein
  // Ersetzt die custom_id durch "gs.{token}:{userId}"
}

export async function decodeGameplayPayloadWithStatus(encodedPayload: string, userID: string) {
  if (!encodedPayload.startsWith(TOKEN_PREFIX)) {
    return { payload: encodedPayload }; // Kein Lookup, wenn nicht nötig
  }
  // Lookup zuerst im Speicher, dann Supabase falls nicht vorhanden
  const cached = tokenToSession.get(token) || await loadTokenRowByToken(token);
  // Prüft Ownership, TTL (7 Tage) und turn_version (verhindert die Wiederverwendung eines alten Zustands)
}
```

Die Sessions haben ein TTL von 7 Tagen und werden automatisch alle 10 Minuten bereinigt. Die `turnVersion`-Prüfung verhindert, dass ein veralteter Zustand erneut abgespielt wird, wenn der Spieler im Spiel vorangekommen ist – ein diskreter Schutz gegen versehentliches „Zurückgehen".

Die beiden `Map`s im Speicher (`tokenToSession`, `latestTurnByBattle`) verwenden dasselbe `globalThis as unknown as GameSessionGlobals`-Muster wie die Bild-Caches, aus denselben Gründen, die weiter unten erläutert werden.

---

## Die Bild-Rendering-Pipeline

![Kampfbeginn gegen einen Schleim](/images/konosuba-rpg/shot_01_start.webp)

Die Route `/konosuba-rpg/:lang/*` gibt kein JSON zurück. Sie gibt ein auf Anfrage generiertes WebP-Bild zurück.

Die Pipeline ist in 3 zusammengesetzte Schichten organisiert:

```
Hintergrund (Spielfeld + Rahmen)
    +
Figurenschicht (Spieler-Sprites + Mob, feste Positionen)
    +
UI-Overlay (Lebensbalken, Nachrichten, Charakter-Icons via Satori → SVG → PNG)
    ↓
Photon.watermark() × 2
    ↓
WebP-Ausgabe
```

**Hintergrund**: zwei feste Bilder (das Spielfeld und der Rahmen), die einmal vom Dateisystem geladen und zusammengesetzt werden.

**Figurenschicht**: Die Sprites werden anhand berechneter Koordinaten positioniert. Tote Spieler werden ausgeschlossen (`activeSlots = slots.filter(s => playerHp[s.i] > 0)`). Gegner-Sprites werden mit einem benutzerdefinierten `flipX` horizontal gespiegelt – eine Pixel-für-Pixel-Schleife statt einer externen Abhängigkeit.

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

**UI-Overlay**: Das ist der schwere Teil. Das JSX der Oberfläche (Lebensbalken, Texte, Icons) wird React-ähnlich mit Satori beschrieben, in SVG gerendert, von `@cf-wasm/resvg` in PNG konvertiert und dann in Photon für die endgültige Komposition importiert. Satori + resvg sind zwei WASM-Module, die speziell für Cloudflare Workers mit dem Flag `edge-light` kompiliert wurden.

![Aktion Verteidigung](/images/konosuba-rpg/shot_03_defend.webp)

![Laufender Kampf](/images/konosuba-rpg/shot_02_combat.webp)

![Aktion Umarmung](/images/konosuba-rpg/shot_04_hug.webp)

---

## Das Cachesystem – der am meisten ausgearbeitete Teil

Es gibt 5 verschiedene Cache-Ebenen. Jede zielt auf eine andere Granularität der Pipeline ab.

```typescript
// renderImage.ts -- alle auf globalThis
G.__imageCache  ??= {} as Record; // rohe Assets
G.__base64Cache ??= {} as Record;       // base64 der Assets (für Satori)
G.__fontCache   ??= {} as Record; // Schriftarten
G.__photonCache    ??= new LRUCache(40, freePhoton);
G.__layerCache     ??= new LRUCache(12, freePhoton);
G.__uiPhotonCache  ??= new LRUCache(30, freePhoton);
G.__renderOutputCache ??= new LRUCache(120);
```

Das `??=`-Muster auf `globalThis`: JavaScript-Module in Edge-Workern können bei bestimmten Konfigurationen zwischen Anfragen neu evaluiert werden. Das Speichern der Caches auf `globalThis` mit `??=` stellt sicher, dass sie diese Neubewertungen überleben, ohne neu erstellt zu werden.

### Die WASM-Eviction

Die Photon-Bild-Caches (`photonCache`, `layerCache`, `uiPhotonCache`) verwenden einen Eviction-Callback:

```typescript
function freePhoton(_key: string, img: Photon.PhotonImage): void {
  try { img.free(); } catch { /* bereits freigegeben */ }
}

new LRUCache(40, freePhoton)
```

`Photon.PhotonImage` ist ein WASM-Objekt mit Speicher, der auf der linearen WASM-Seite allokiert ist, außerhalb des JavaScript-GC. Ohne expliziten Aufruf von `.free()` wird dieser Speicher nie freigegeben. Die LRU-Eviction triggert `.free()` automatisch – das ist RAII nach JavaScript portiert.

### Die Cache-Schlüssel sind bewusst verlustbehaftet

```typescript
function buildCharactersKey(playerImages: string[][], playerHp: number[], creatureImages: string[], creatureHp: number): string {
  const players = playerImages.map((imgs, i) => `${imgs[0]}:${playerHp[i] > 0 ? 1 : 0}`).join("|");
  return `chars::${players}::${creatureImages[0]}:${creatureHp > 0 ? 1 : 0}`;
}
```

Der Schlüssel der Figurenschicht kodiert nicht den genauen HP-Wert – nur `1` (lebendig) oder `0` (tot). Denn das Sprite eines Spielers mit 40 HP und eines mit 15 HP ist identisch. Ein Cache-Treffer überlebt daher jeden Schaden, solange niemand fällt.

Der UI-Schlüssel kodiert dagegen die exakten HP (der Lebensbalken ändert sich bei jedem Treffer) und einen Hash der Nachrichten:

```typescript
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0; // vorzeichenbehaftete 32-Bit-Ganzzahl
  }
  return hash.toString(16);
}
```

`Math.imul` erzwingt die Multiplikation als 32-Bit-Ganzzahl, was float64-Konvertierungen vermeidet und einen stabilen Polynom-Hash ergibt. Keine externe Abhängigkeit dafür.

### Die base64-Konvertierung ohne Stack Overflow

```typescript
function getBase64Cached(key: string, buf: ArrayBuffer): string {
  if (base64Cache[key]) return base64Cache[key];
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000; // 32768 Bytes
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  const b64 = btoa(binary);
  base64Cache[key] = b64;
  return b64;
}
```

`String.fromCharCode(...largeArray)` kann bei großen Bildern einen Stack Overflow verursachen, weil die Argumente über den Call-Stack übergeben werden. Das Aufteilen in 32-KB-Blöcke vermeidet das. Das Ergebnis wird zwischengespeichert – die base64-Konvertierung desselben Bildes wird nur einmal pro Worker-Instanz durchgeführt.

---

## STRIPPER.md – Audit von sequenziellen awaits

Es gibt eine Datei `STRIPPER.md` im Repo, die ein Audit zur Parallelisierung von `await`s dokumentiert. Einige Beispiele dessen, was dort festgehalten wurde:

- Das Laden des Spielerprofils machte 3 sequenzielle Supabase-Abfragen (Fortschritt, Run-Zusammenfassung, Erfolge). Sie wurden auf `Promise.all` umgestellt – es gibt keine Abhängigkeiten zwischen ihnen.
- Die Verteilung der Kampfbelohnungen (Accessoires + Verbrauchsgegenstände) war sequenziell. Ebenfalls parallelisiert.
- Die Erstellung der Session-Tokens für die Buttons erfolgte Gruppe für Gruppe. Unabhängige Gruppen werden jetzt parallel erstellt.

```typescript
// progressionService.ts -- vorher (sequenziell)
await grantAccessoryDropRewards(...);
await grantConsumableDropRewards(...);

// nachher
await Promise.all([
  grantAccessoryDropRewards(...),
  grantConsumableDropRewards(...),
]);
```

Nichts Revolutionäres, aber in einem serverlosen Kontext, wo jede Millisekunde Antwortzeit abgerechnet wird (oder zum Cold Start beiträgt), zählt es.

---

## Der Discord-Bot ohne persistenten Server

![Sieg](/images/konosuba-rpg/shot_05_win.webp)

Ein oft missverstandener Punkt: Ein Discord-Bot benötigt nicht zwingend eine persistente WebSocket-Verbindung. Discord bietet eine Alternative: die **Interactions Endpoint URL**. Du stellst Discord eine HTTPS-URL zur Verfügung, und Discord sendet dir einen POST für jede Interaktion (Slash-Command, Button, Autocomplete).

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

Discord sendet einen POST, der Handler läuft 50–200 ms auf einer Vercel-Funktion oder einem Cloudflare Worker, antwortet, und fertig. Keine dauerhafte Verbindung, kein Server, der eingeschaltet bleiben muss. Der gesamte Discord-Bot wird auf dem Vercel Free Tier gehostet.

Die Ed25519-Überprüfung (`verifyKey` von `discord-interactions`) ist obligatorisch – Discord sendet eine Signatur in den Headern, die du validieren musst, sonst wird der Endpunkt abgelehnt.

### Die Spezialanimation – der einzige absichtliche await

```typescript
// handleSpecialButton.ts
await new Promise(resolve => setTimeout(resolve, 3000)); // 3 Sekunden
await fetch(`${DISCORD_API_URL}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
  method: "PATCH",
  // ...
});
```

Diese bewusste 3-Sekunden-Verzögerung ist in STRIPPER.md als beabsichtigt dokumentiert. Megumins Spezialangriff (Explosion) hat eine Animation auf Discord-Seite – die Nachricht wird zuerst mit einem Zwischenbild aktualisiert und 3 Sekunden später mit dem Ergebnis geändert. Dies ist der einzige Fall, in dem eine Vercel-Funktion bewusst länger als nötig läuft.

![Spezialangriff](/images/konosuba-rpg/shot_08_special.webp)

---

## Die Bereitstellbarkeit auf zwei Plattformen

Dieselbe Codebasis läuft auf Vercel (Node.js) und Cloudflare Workers (V8-Isolates) ohne Änderungen:

```typescript
// worker.ts -- Cloudflare-Einstiegspunkt
export default {
  fetch(request: Request, env: WorkerBindings): Promise {
    syncBindingsToProcessEnv(env); // injiziert die CF-Secrets in process.env
    return app.fetch(request, env, ctx);
  }
};

// index.ts -- Vercel/Node-Einstiegspunkt
const isVercelRuntime = process.env.VERCEL === "1";
if (!isVercelRuntime) { start(); }
```

Der Hauptunterschied: die statischen Assets. Auf Vercel werden sie vom Dateisystem gelesen (`/var/task/assets/`). Auf Cloudflare Workers laufen sie über ein `ASSETS`-Binding (statische CF-Assets) mit Fallback auf einen HTTPS-Mirror (`fox3000foxy.com/konosuba-rpg/assets`). Das `getAssetBytes` in `assetLoader.ts` handhabt beide Pfade, indem es zuerst das Dateisystem und dann fetch versucht.

Die WASM-Bibliotheken (`@cf-wasm/photon/edge-light`, `@cf-wasm/resvg`) haben separate Builds für jede Laufzeit. Das Flag `edge-light` im Paketnamen bezeichnet den Build, der mit Cloudflare Workers kompatibel ist, wo `new WebAssembly.Module()` zur Laufzeit nicht erlaubt ist – das WASM muss vorcompiliert sein.

---

## Der Fortschritt: XP, Level, Affinität

![Ein Boss, 650 HP](/images/konosuba-rpg/shot_06_boss.webp)

Die Meta-Progression basiert auf dem Supabase Free Tier. Das Schema umfasst eine Tabelle `players` (globales XP, Level, Gold), `character_progress` (XP/Level/Affinität pro Charakter für Darkness, Aqua, Megumin), `runs` (Kampfhistorie), `inventory_items`, `daily_quests_progress`, `achievements_unlocked`, `game_sessions`.

Das Fortschrittsmodell ist einfach:

```typescript
// characterService.ts
export function computeLevelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1; // 100 XP pro Level
}

export function getLevelFactor(level: number): number {
  return 1 + 0.2 * (level - 1); // +20% Stats pro Level
}

export function getAffinityFactor(affinity: number): number {
  const stars = Math.floor(affinity / 20); // 20 Punkte pro Stern, maximal 5 Sterne
  return 1.2 ** stars; // exponentielle Progression
}
```

Diese Faktoren werden zu Beginn jedes `processGame` auf die Stats der Charaktere angewendet. Kazuma folgt dem globalen Spielerlevel, die anderen drei haben jeweils ihr eigenes XP/Level. Die Affinität (erhalten durch das Einsammeln von charakterspezifischen Drops) multipliziert seine Stats unabhängig.

![Heilung](/images/konosuba-rpg/shot_07_heal.webp)

Das Drop-System verwendet nach Schwierigkeit gewichtete Loot-Tabellen:

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
  // ...bis Legendary
};
```

---

## Die Tests

Drei Test-Suites: Unit-, Performance- und Leak-Tests.

Der Leak-Test ist besonders direkt:

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
  expect(after - before).toBeLessThan(20); // max 20MB Heap-Wachstum
});
```

1200 Iterationen von `processGame`, GC erzwungen vorher und nachher, Heap-Delta < 20 MB. Wenn dieser Test bestanden wird, leakt `processGame` nicht. Der Rendertest (`renderImage.spec.ts`) prüft eher die Ausführungszeit unter einer praktischen Schwelle.

Es gibt auch ein Skript `bench.ts` zum Profiling der gesamten Pipeline:

```
RENDER_PERF=1 npx tsx bench.ts --runs=20 --warmup=3 --monster=Dragon
```

Mit `RENDER_PERF=1` protokolliert der Wrapper `withPerf` in jedem Dienst die Timings:

```typescript
export async function withPerf(scope: string, label: string, work: () => Promise): Promise {
  const perf = createPerfLogger(scope);
  if (!perf.enabled) return work(); // null Overhead wenn deaktiviert
  perf.mark(`${label}:start`);
  try { return await work(); }
  finally { perf.done(`${label}:done`); }
}
```

`createPerfLogger` gibt No-ops zurück, wenn `DEV_MODE` und `RENDER_PERF` nicht auf `1` gesetzt sind. Kein Overhead in der Produktion.

---

## Was der Betrieb kostet

- **Vercel Free Tier**: 100 GB Bandbreite, 1 Mio. serverlose Aufrufe pro Monat. Das Rendern eines Bildes zählt als ein Aufruf.
- **Cloudflare Workers Free Tier**: 100K Anfragen/Tag, 10 ms CPU-Zeit pro Anfrage (das Rendern kann dies auf den Workers überschreiten, daher Vercel als Primär).
- **Supabase Free Tier**: 500 MB Datenbank, 5 GB Bandbreite. Ausreichend für Tausende von Spielern.

Das gesamte Backend läuft bis zu einem signifikanten Volumen kostenlos. Der einzige Reibungspunkt ist die CPU-Grenze von Cloudflare Workers – das Bildrendering ist CPU-intensiv aufgrund von WASM, daher die Strategie mit Vercel als Primär und Workers als Failover-CDN.

---

## Die 3 Dinge, die man sich merken sollte

1. **Die URL als Spielzustand** ist nicht nur ein netter Trick – es ist eine von Discord auferlegte Einschränkung (Buttons haben ein 100-Zeichen-Limit), die zu einer zustandslosen Architektur mit RLE-Kompression und Session-Token als Fallback gezwungen hat. Die Einschränkung hat das Design bestimmt.

2. **Der WASM-Cache mit expliziter Eviction**: `PhotonImage` allokiert außerhalb des JavaScript-Heaps und wird ohne `.free()` niemals vom GC erfasst. `freePhoton` an die LRU-Eviction zu hängen, ist RAII in JavaScript. Es ist unscheinbar im Code, aber ohne dies würde der Worker in der Produktion leaken.

3. **Ein serverloser Discord-Bot ohne WebSocket**: Weniger bekannt als der WebSocket-Gateway-Ansatz, aber für einen Bot, der zustandslose Verarbeitung macht (jede Interaktion ist unabhängig), ist der Interactions Endpoint strikt überlegen – keine Wiederverbindung, kein Heartbeat, kein zu wartender Prozess. Discord verwaltet die Verfügbarkeit auf ihrer Infrastruktur.

---

*Repo: [fox3000foxy/konosuba-rpg](https://github.com/fox3000foxy/konosuba-rpg)*

*Source-available custom licence – no redistribution, free to use.*
