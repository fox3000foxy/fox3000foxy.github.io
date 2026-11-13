---
title: "Pasé un fin de semana leyendo el código de konosuba-rpg y esto encontré"
description: "Un RPG por turnos en Discord donde cada acción genera una imagen WebP
  al vuelo: URL como estado de juego, RNG determinista, pipeline WASM, caché 5 niveles,
  bot serverless."
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
author_sig: "X8KPwfSyqyNLstAS149P1C314tR3zeQiwjswJVBELEooxoQNteRtDGml4D98BfHM3MXqdEiAqZP3VfH827Tbdw=="
---

# Pasé un fin de semana leyendo el código de konosuba-rpg y esto encontré

Mantengo ese proyecto desde hace tiempo, pero releer tu propio código con la cabeza despejada siempre es instructivo. konosuba-rpg es un RPG por turnos en Discord donde cada acción genera una imagen WebP al vuelo. Es una verdadera imagen compuesta, con los sprites, las barras de vida, los mensajes de combate: todo.

La stack: TypeScript, Hono, Vercel, Cloudflare Workers, Supabase. Alojamiento totalmente gratuito. Y el bot Discord funciona sin servidor persistente. Este post explica cómo todo eso se sostiene.

![Estado inicial del juego](/images/konosuba-rpg/game_init.webp)

---

## El diseño base: la URL como estado del juego

Lo primero que llama: no hay ningún estado en servidor para el gameplay. El estado completo de un combate cabe en la URL.

```
/konosuba-rpg/fr/abc123/ATK/DEF/ATK/HUG?monster=Vanir&difficulty=hard
```

Cada segmento tras el seed es una acción jugada. El servidor recibe esa URL, parte del principio, vuelve a jugar todas las acciones en orden, y devuelve una imagen del combate en ese instante preciso. Ninguna sesión, ningún estado en RAM ligado a un usuario.

Discord funciona por botones interactivos: cuando el jugador pulsa "Atacar", Discord envía al servidor el `custom_id` del botón. Ese custom_id contiene la URL comprimida del combate con la nueva acción añadida. El servidor recalcula todo desde cero y devuelve la imagen actualizada.

```typescript
// processUrl.ts
const VALID_MOVES_SET = new Set(["ATK", "DEF", "HUG", "HEA", "SPE", "USE"]);
// Precompilado fuera de función: no recreado en cada llamada

export default function processUrl(url: string): [Random, string[], string, string | null, string | null] {
  const urlParts = url.split("/");
  const moves: string[] = [];
  for (const part of urlParts) {
    if (VALID_MOVES_SET.has(part.toUpperCase())) moves.push(part.toUpperCase());
  }
  // seed = 6º segmento, hasheado sobre 8096 valores
  const seedStr = (urlParts[5] || "").toLowerCase();
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed + seedStr.charCodeAt(i)) % 8096;
  }
  return [new Random(seed), moves, seedStr, monster, difficulty];
}
```

El `Set` precompilado fuera de la función es un detalle, pero evita reconstruir la estructura en cada invocación en un contexto edge donde los módulos pueden reevaluarse.

### El RNG: RC4 modificado

El generador aleatorio es una implementación RC4 (algoritmo de cifrado stream) desviada a PRNG.

```typescript
export class Random {
  private S: number[]; // tabla de 256 entradas
  private i: number;
  private j: number;

  constructor(seed?: number) {
    this.S = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    let workingSeed = seed || Date.now();
    for (let i = 0; i < 256; i++) {
      j = (j + this.S[i] + (workingSeed & 0xff)) & 0xff;
      // swap S[i] y S[j]
      [this.S[i], this.S[j]] = [this.S[j], this.S[i]];
      workingSeed >>>= 8;
    }
  }

  next(): number { /* ... */ }
  randint(min: number, max: number): number { /* ... */ }
  choice(array: T[]): T { /* ... */ }
}
```

¿Por qué RC4? Porque es un PRNG determinista con una distribución correcta y una resistencia razonable a las colisiones de seed. Mismo seed = misma secuencia de números = mismo combate cada vez. Eso permite "volver a jugar" cualquier combate conservando su URL, y garantiza que dos servidores distintos (Vercel + Cloudflare) produzcan exactamente el mismo resultado para la misma URL.

---

## El problema del límite de 100 caracteres de Discord

Discord impone un límite de 100 caracteres en los `custom_id` de los botones. Tras unas decenas de acciones, una URL de combate supera ampliamente ese límite.

Dos mecanismos responden a eso.

### 1. Compresión RLE de las acciones

Las acciones se codifican con un solo carácter (`a`=attack, `d`=defend, `h`=hug...) y se comprimen por run-length encoding:

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

Simple, pero cuando el jugador spamea Ataque x10 eso pasa de `aaaaaaaaaa` (10 chars) a `a10` (3 chars). Los botones "Atacar x4" y "Atacar x10" en la UI existen justo para eso: acelerar el combate comprimiendo bien el payload.

### 2. Session tokens cuando la compresión no basta

Si el payload comprimido sigue siendo demasiado largo, se guarda en base con un token corto:

```typescript
// gameSessionService.ts
const TOKEN_PREFIX = "gs.";
const TOKEN_SIZE = 10; // "gs.aBcDeFgHiJ"

export async function encodeGameplayButtons(buttons: RawButton[]): Promise {
  // Agrupa los payloads por battle_key, inserta en batch en Supabase
  // Reemplaza el custom_id por "gs.{token}:{userId}"
}

export async function decodeGameplayPayloadWithStatus(encodedPayload: string, userID: string) {
  if (!encodedPayload.startsWith(TOKEN_PREFIX)) {
    return { payload: encodedPayload }; // Sin lookup si no hace falta
  }
  // Lookup en memoria primero, luego Supabase si falta
  const cached = tokenToSession.get(token) || await loadTokenRowByToken(token);
  // Comprueba ownership, TTL (7 días), y turn_version (evita rejugar un estado viejo)
}
```

Las sesiones tienen un TTL de 7 días y un pruning automático cada 10 minutos. La comprobación `turnVersion` impide rejugar un estado caducado si el jugador avanzó en la partida: una protección discreta contra el "retroceso" accidental.

Ambos Maps en memoria (`tokenToSession`, `latestTurnByBattle`) usan el mismo patrón `globalThis as unknown as GameSessionGlobals` que los cachés de imagen, por las mismas razones que veremos más abajo.

---

## El pipeline de render de imagen

![Inicio de combate contra un Slime](/images/konosuba-rpg/shot_01_start.webp)

La ruta `/konosuba-rpg/:lang/*` no devuelve JSON. Devuelve una imagen WebP generada bajo demanda.

El pipeline está organizado en 3 layers compuestas:

```
Background (board + frame)
    +
Characters layer (sprites jugadores + mob, posiciones fijas)
    +
UI overlay (barras HP, mensajes, iconos persos vía Satori → SVG → PNG)
    ↓
Photon.watermark() × 2
    ↓
WebP output
```

**Background**: dos imágenes fijas (el tablero y el marco), cargadas desde el filesystem y compuestas una vez.

**Characters layer**: los sprites se posicionan según coordenadas calculadas. Los jugadores muertos se excluyen (`activeSlots = slots.filter(s => playerHp[s.i] > 0)`). Los sprites enemigos se espejan horizontalmente con un `flipX` custom: un bucle píxel por píxel en vez de una dependencia externa.

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

**UI overlay**: es la parte pesada. El JSX de la interfaz (barras de vida, textos, iconos) se describe en React-like con Satori, renderizado en SVG, convertido en PNG por `@cf-wasm/resvg`, y luego importado en Photon para la composición final. Satori + resvg son dos módulos WASM compilados específicamente para Cloudflare Workers con el flag `edge-light`.

![Acción Defensa](/images/konosuba-rpg/shot_03_defend.webp)

![Combate en curso](/images/konosuba-rpg/shot_02_combat.webp)

![Acción Abrazo](/images/konosuba-rpg/shot_04_hug.webp)

---

## El sistema de caché: la parte más trabajada

Hay 5 niveles de caché distintos. Cada uno apunta a una granularidad distinta del pipeline.

```typescript
// renderImage.ts: todos sobre globalThis
G.__imageCache  ??= {} as Record; // assets en bruto
G.__base64Cache ??= {} as Record;       // base64 de los assets (para Satori)
G.__fontCache   ??= {} as Record; // fuentes
G.__photonCache    ??= new LRUCache(40, freePhoton);
G.__layerCache     ??= new LRUCache(12, freePhoton);
G.__uiPhotonCache  ??= new LRUCache(30, freePhoton);
G.__renderOutputCache ??= new LRUCache(120);
```

El patrón `??=` sobre `globalThis`: los módulos JavaScript en los workers edge pueden reevaluarse entre peticiones en ciertas configuraciones. Guardar los cachés en `globalThis` con `??=` garantiza que sobrevivan a esas reevaluaciones sin recrearse.

### La evicción WASM

Los cachés de imágenes Photon (`photonCache`, `layerCache`, `uiPhotonCache`) usan un callback de evicción:

```typescript
function freePhoton(_key: string, img: Photon.PhotonImage): void {
  try { img.free(); } catch { /* ya liberado */ }
}

new LRUCache(40, freePhoton)
```

`Photon.PhotonImage` es un objeto WASM con memoria asignada en el lado lineal WASM, fuera del GC JavaScript. Esa memoria queda asignada mientras no se llame a `.free()` explícitamente. La evicción del LRU dispara `.free()` automáticamente: es RAII llevado a JavaScript.

### Las claves de caché son intencionadamente lossy

```typescript
function buildCharactersKey(playerImages: string[][], playerHp: number[], creatureImages: string[], creatureHp: number): string {
  const players = playerImages.map((imgs, i) => `${imgs[0]}:${playerHp[i] > 0 ? 1 : 0}`).join("|");
  return `chars::${players}::${creatureImages[0]}:${creatureHp > 0 ? 1 : 0}`;
}
```

La clave del characters layer no codifica el valor exacto de los HP: solo `1` (vivo) o `0` (muerto). Porque el sprite de un jugador a 40 HP y un jugador a 15 HP es idéntico. Un hit de caché sobrevive por tanto a cualquier daño mientras nadie caiga.

La clave UI en cambio codifica los HP exactos (la barra de vida cambia en cada golpe) y un hash de los mensajes:

```typescript
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0; // entero 32-bit con signo
  }
  return hash.toString(16);
}
```

`Math.imul` fuerza la multiplicación en entero 32 bits, lo que evita las conversiones float64 y da un hash polinomial estable. Eso evita añadir una dependencia externa para eso.

### La conversión base64 sin stack overflow

```typescript
function getBase64Cached(key: string, buf: ArrayBuffer): string {
  if (base64Cache[key]) return base64Cache[key];
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000; // 32768 bytes
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  const b64 = btoa(binary);
  base64Cache[key] = b64;
  return b64;
}
```

`String.fromCharCode(...largeArray)` puede provocar un stack overflow en las imágenes grandes porque los argumentos pasan por la call stack. El chunking por 32KB lo evita. El resultado se cachea: la conversión base64 de una misma imagen solo se hace una vez por instancia de worker.

---

## STRIPPER.md: auditoría de los awaits secuenciales

Hay un archivo `STRIPPER.md` en el repo que documenta una auditoría de paralelización de los `await`. Algunos ejemplos de lo consignado:

- La carga del perfil jugador hacía 3 peticiones Supabase en serie (progresión, resumen de run, achievements). Se pasaron a `Promise.all`: sin dependencia entre ellas.
- La distribución de las recompensas de fin de combate (accesorios + consumibles) era secuencial. Paralelizada igual.
- La creación de los tokens de sesión para los botones se hacía grupo por grupo. Los grupos independientes ahora se crean en paralelo.

```typescript
// progressionService.ts: antes (secuencial)
await grantAccessoryDropRewards(...);
await grantConsumableDropRewards(...);

// después
await Promise.all([
  grantAccessoryDropRewards(...),
  grantConsumableDropRewards(...),
]);
```

Nada revolucionario, pero en un contexto serverless donde cada milisegundo de tiempo de respuesta se factura (o contribuye al cold start), cuenta.

---

## El bot Discord sin servidor persistente

![Victoria](/images/konosuba-rpg/shot_05_win.webp)

Punto a menudo mal entendido: un bot Discord no necesita forzosamente una conexión WebSocket persistente. Discord ofrece una alternativa: las **Interactions Endpoint URL**. Das una URL HTTPS a Discord, y Discord te envía un POST por cada interacción (slash command, botón, autocomplete).

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

Discord envía un POST, el handler corre 50-200ms en una función Vercel o un Cloudflare Worker, responde, y se acabó. Ninguna conexión permanente que mantener, ningún servidor que mantener encendido. Todo el bot Discord está alojado en el free tier Vercel.

La verificación Ed25519 (`verifyKey` desde `discord-interactions`) es obligatoria: Discord envía una firma en las cabeceras que tienes que validar, si no rechaza el endpoint.

### La animación especial: el único await intencional

```typescript
// handleSpecialButton.ts
await new Promise(resolve => setTimeout(resolve, 3000)); // 3 segundos
await fetch(`${DISCORD_API_URL}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
  method: "PATCH",
  // ...
});
```

Ese retardo voluntario de 3 segundos está documentado en STRIPPER.md como intencional. El ataque especial de Megumin (Explosion) tiene una animación en Discord: el mensaje primero se actualiza con un visual intermedio, y luego se modifica 3 segundos después con el resultado. Es el único caso donde una función Vercel corre voluntariamente más tiempo del necesario.

![Ataque especial](/images/konosuba-rpg/shot_08_special.webp)

---

## La desplegabilidad en dos plataformas

El mismo codebase corre en Vercel (Node.js) y en Cloudflare Workers (V8 isolates) sin modificación:

```typescript
// worker.ts: entrypoint Cloudflare
export default {
  fetch(request: Request, env: WorkerBindings): Promise {
    syncBindingsToProcessEnv(env); // inyecta los secrets CF en process.env
    return app.fetch(request, env, ctx);
  }
};

// index.ts: entrypoint Vercel/Node
const isVercelRuntime = process.env.VERCEL === "1";
if (!isVercelRuntime) { start(); }
```

La diferencia principal: los assets estáticos. En Vercel, se leen desde el filesystem (`/var/task/assets/`). En Cloudflare Workers, pasan por un binding `ASSETS` (assets estáticos CF) con fallback hacia un mirror HTTPS (`fox3000foxy.com/konosuba-rpg/assets`). El `getAssetBytes` en `assetLoader.ts` gestiona ambos caminos probando el filesystem primero, y luego fetch.

Los WASM (`@cf-wasm/photon/edge-light`, `@cf-wasm/resvg`) tienen builds separados para cada runtime. El flag `edge-light` en el nombre del paquete designa el build compatible Cloudflare Workers, que no autoriza `new WebAssembly.Module()` en runtime: el WASM tiene que estar precompilado.

---

## La progresión: XP, niveles, afinidad

![Un boss, 650 HP](/images/konosuba-rpg/shot_06_boss.webp)

La metaprogresión se apoya en Supabase free tier. El esquema tiene una tabla `players` (XP global, nivel, gold), `character_progress` (XP/nivel/afinidad por perso para Darkness, Aqua, Megumin), `runs` (historial de los combates), `inventory_items`, `daily_quests_progress`, `achievements_unlocked`, `game_sessions`.

El modelo de progresión es simple:

```typescript
// characterService.ts
export function computeLevelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1; // 100 XP por nivel
}

export function getLevelFactor(level: number): number {
  return 1 + 0.2 * (level - 1); // +20% stats por nivel
}

export function getAffinityFactor(affinity: number): number {
  const stars = Math.floor(affinity / 20); // 20 puntos por estrella, 5 estrellas máx
  return 1.2 ** stars; // progresión exponencial
}
```

Esos factores se aplican a las stats de los persos al inicio de cada `processGame`. Kazuma sigue el nivel global del jugador, los otros tres tienen cada uno su propio XP/nivel. La afinidad (ganada recuperando drops ligados a un perso) multiplica sus stats independientemente.

![Cura](/images/konosuba-rpg/shot_07_heal.webp)

El sistema de drops usa loot tables ponderadas por dificultad:

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
  // ...hasta Legendary
};
```

---

## Los tests

Tres suites: unitarios, perf, y leaks.

El leak test es particularmente directo:

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
  expect(after - before).toBeLessThan(20); // máx 20MB de crecimiento heap
});
```

1200 iteraciones de `processGame`, GC forzado antes y después, delta heap < 20MB. Si ese test pasa, `processGame` no fuga. El test de render (`renderImage.spec.ts`) comprueba más bien el tiempo de ejecución bajo un umbral práctico.

También hay un script `bench.ts` para perfilar el pipeline completo:

```
RENDER_PERF=1 npx tsx bench.ts --runs=20 --warmup=3 --monster=Dragon
```

Con `RENDER_PERF=1`, el wrapper `withPerf` en cada servicio loguea los timings:

```typescript
export async function withPerf(scope: string, label: string, work: () => Promise): Promise {
  const perf = createPerfLogger(scope);
  if (!perf.enabled) return work(); // zero overhead si desactivado
  perf.mark(`${label}:start`);
  try { return await work(); }
  finally { perf.done(`${label}:done`); }
}
```

`createPerfLogger` devuelve no-ops si `DEV_MODE` y `RENDER_PERF` no están a `1`. Ningún overhead en producción.

---

## Lo que cuesta hacerlo correr

- **Vercel free tier**: 100GB de bandwidth, 1M de invocaciones serverless al mes. El render de imagen cuenta como una invocación.
- **Cloudflare Workers free tier**: 100K peticiones/día, 10ms CPU time por petición (el render puede superar eso en los Workers, de ahí Vercel en primario).
- **Supabase free tier**: 500MB de base, 5GB de bandwidth. Suficiente para miles de jugadores.

Todo el backend corre a coste cero hasta un volumen significativo. El único punto de fricción es el límite CPU de Cloudflare Workers: el render imagen es CPU-intensive por WASM, de ahí la estrategia de Vercel como primario y Workers como CDN de failover.

---

## Las 3 cosas que merecen recordarse

1. **La URL como estado de juego** no es solo un truco simpático: es una restricción impuesta por Discord (los botones tienen un límite de 100 chars) que forzó una arquitectura stateless con compresión RLE + token de sesión como fallback. La restricción dictó el diseño.

2. **El caché WASM con evicción explícita**: los `PhotonImage` asignan fuera del heap JavaScript y jamás serán GC sin `.free()`. Enchufar `freePhoton` en la evicción del LRU es RAII en JavaScript. Es discreto en el código, pero sin eso el worker fugaría en producción.

3. **Un bot Discord serverless sin WebSocket**: es menos conocido que el enfoque WebSocket gateway, pero para un bot que hace procesamiento stateless (cada interacción es independiente), el Interactions Endpoint es estrictamente superior: sin reconexión, sin heartbeat, sin proceso que mantener. Discord gestiona la disponibilidad en su infra.

---

*Repo: [fox3000foxy/konosuba-rpg](https://github.com/fox3000foxy/konosuba-rpg)*

*Licencia source-available custom: sin redistribución, free to use.*
