---
title: "Pasé un fin de semana leyendo el código de konosuba-rpg y esto es lo que encontré"
description: "Un RPG por turnos de Discord donde cada acción genera una imagen WebP
  sobre la marcha: URL como estado del juego, RNG determinista, pipeline WASM, caché
  de 5 niveles, bot serverless."
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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "QWQk5PUvrA77JjvvndU/PRNNcswHK2jvZhFd9zhqReI7Itfz5JJ+Av90rp2UkEiBi2pJJLaYJ4kGE5Ewc3PuSw=="
---

# Pasé un fin de semana leyendo el código de konosuba-rpg y esto es lo que encontré

Mantengo este proyecto desde hace un tiempo, pero releer el propio código con calma siempre es instructivo. konosuba-rpg es un RPG por turnos de Discord donde cada acción genera una imagen WebP sobre la marcha. No un embed de texto. Una imagen real compuesta, con los sprites, las barras de vida, los mensajes de combate — todo.

La stack: TypeScript, Hono, Vercel, Cloudflare Workers, Supabase. Hospedaje completamente gratuito. Y el bot de Discord funciona sin servidor persistente. Este post explica cómo todo se mantiene unido.

![Estado inicial del juego](/images/konosuba-rpg/game_init.webp)

---

## El diseño base: la URL como estado del juego

Lo primero que sorprende: no hay ningún estado del lado del servidor para el gameplay. El estado completo de un combate cabe en la URL.

```
/konosuba-rpg/es/abc123/ATK/DEF/ATK/HUG?monster=Vanir&difficulty=hard
```

Cada segmento después del seed es una acción jugada. El servidor recibe esta URL, vuelve al inicio, reproduce todas las acciones en orden, y devuelve una imagen del combate en ese instante preciso. Sin sesión, sin estado en RAM vinculado a un usuario.

Discord funciona mediante botones interactivos — cuando el jugador pulsa "Atacar", Discord envía al servidor el `custom_id` del botón. Este custom_id contiene la URL comprimida del combate con la nueva acción añadida. El servidor recalcula todo desde cero y devuelve la imagen actualizada.

```typescript
// processUrl.ts
const VALID_MOVES_SET = new Set(["ATK", "DEF", "HUG", "HEA", "SPE", "USE"]);
// Precompilado fuera de la función — no se recrea en cada llamada

export default function processUrl(url: string): [Random, string[], string, string | null, string | null] {
  const urlParts = url.split("/");
  const moves: string[] = [];
  for (const part of urlParts) {
    if (VALID_MOVES_SET.has(part.toUpperCase())) moves.push(part.toUpperCase());
  }
  // seed = 6º segmento, hasheado a 8096 valores
  const seedStr = (urlParts[5] || "").toLowerCase();
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed + seedStr.charCodeAt(i)) % 8096;
  }
  return [new Random(seed), moves, seedStr, monster, difficulty];
}
```

El `Set` precompilado fuera de la función es un detalle, pero evita reconstruir la estructura en cada invocación en un contexto edge donde los módulos pueden ser reevaluados.

### El RNG: RC4 modificado

El generador aleatorio es una implementación RC4 (algoritmo de cifrado de flujo) desviada como PRNG.

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

¿Por qué RC4? Porque es un PRNG determinista con una distribución correcta y una resistencia razonable a colisiones de seed. Misma seed = misma secuencia de números = mismo combate cada vez. Esto permite "reproducir" cualquier combate conservando su URL, y garantiza que dos servidores diferentes (Vercel + Cloudflare) produzcan exactamente el mismo resultado para la misma URL.

---

## El problema del límite de 100 caracteres de Discord

Discord impone un límite de 100 caracteres en los `custom_id` de los botones. Después de unas decenas de acciones, una URL de combate supera ampliamente ese límite.

Dos mecanismos responden a esto.

### 1. Compresión RLE de las acciones

Las acciones se codifican con un solo carácter (`a`=attack, `d`=defend, `h`=hug...) y se comprimen mediante run-length encoding:

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

Simple, pero cuando el jugador spammea Ataque x10 pasa de `aaaaaaaaaa` (10 chars) a `a10` (3 chars). Los botones "Atacar x4" y "Atacar x10" en la UI existen precisamente para eso — acelerar el combate mientras se comprime bien el payload.

### 2. Tokens de sesión cuando la compresión no es suficiente

Si el payload comprimido sigue siendo demasiado largo, se almacena en base de datos con un token corto:

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
    return { payload: encodedPayload }; // Sin lookup si no es necesario
  }
  // Lookup en memoria primero, luego Supabase si está ausente
  const cached = tokenToSession.get(token) || await loadTokenRowByToken(token);
  // Verifica ownership, TTL (7 días), y turn_version (evita reproducir un estado antiguo)
}
```

Las sesiones tienen un TTL de 7 días y un pruning automático cada 10 minutos. La verificación `turnVersion` impide reproducir un estado obsoleto si el jugador ha avanzado en la partida — una protección discreta contra el "retroceso" accidental.

Los dos Maps en memoria (`tokenToSession`, `latestTurnByBattle`) usan el mismo patrón `globalThis as unknown as GameSessionGlobals` que los cachés de imagen, por las mismas razones que veremos más abajo.

---

## El pipeline de renderizado de imagen

![Inicio de combate contra un Slime](/images/konosuba-rpg/shot_01_start.webp)

La ruta `/konosuba-rpg/:lang/*` no devuelve JSON. Devuelve una imagen WebP generada bajo demanda.

El pipeline está organizado en 3 capas compuestas:

```
Background (board + frame)
    +
Characters layer (sprites jugadores + mob, posiciones fijas)
    +
UI overlay (barras HP, mensajes, iconos persos via Satori → SVG → PNG)
    ↓
Photon.watermark() × 2
    ↓
WebP output
```

**Background**: dos imágenes fijas (el tablero y el marco), cargadas desde el filesystem y compuestas una vez.

**Characters layer**: los sprites se posicionan según coordenadas calculadas. Los jugadores muertos se excluyen (`activeSlots = slots.filter(s => playerHp[s.i] > 0)`). Los sprites enemigos se reflejan horizontalmente con un `flipX` personalizado — un bucle píxel por píxel en lugar de una dependencia externa.

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

**UI overlay**: es la parte pesada. El JSX de la interfaz (barras de vida, textos, iconos) se describe en React-like con Satori, se renderiza a SVG, se convierte a PNG mediante `@cf-wasm/resvg`, y luego se importa en Photon para la composición final. Satori + resvg son dos módulos WASM compilados específicamente para Cloudflare Workers con el flag `edge-light`.

![Acción Defensa](/images/konosuba-rpg/shot_03_defend.webp)

![Combate en curso](/images/konosuba-rpg/shot_02_combat.webp)

![Acción Abrazo](/images/konosuba-rpg/shot_04_hug.webp)

---

## El sistema de caché — la parte más trabajada

Hay 5 niveles de caché distintos. Cada uno apunta a una granularidad diferente del pipeline.

```typescript
// renderImage.ts -- todos en globalThis
G.__imageCache  ??= {} as Record; // assets brutos
G.__base64Cache ??= {} as Record;       // base64 de los assets (para Satori)
G.__fontCache   ??= {} as Record; // fuentes
G.__photonCache    ??= new LRUCache(40, freePhoton);
G.__layerCache     ??= new LRUCache(12, freePhoton);
G.__uiPhotonCache  ??= new LRUCache(30, freePhoton);
G.__renderOutputCache ??= new LRUCache(120);
```

El patrón `??=` sobre `globalThis`: los módulos JavaScript en los workers edge pueden ser reevaluados entre peticiones en ciertas configuraciones. Almacenar los cachés en `globalThis` con `??=` garantiza que sobrevivan a esas reevaluaciones sin ser recreados.

### La evicción WASM

Los cachés de imágenes Photon (`photonCache`, `layerCache`, `uiPhotonCache`) usan un callback de evicción:

```typescript
function freePhoton(_key: string, img: Photon.PhotonImage): void {
  try { img.free(); } catch { /* ya liberado */ }
}

new LRUCache(40, freePhoton)
```

`Photon.PhotonImage` es un objeto WASM con memoria asignada en el lado lineal de WASM, fuera del GC de JavaScript. Sin una llamada explícita a `.free()`, esa memoria nunca se libera. La evicción del LRU dispara `.free()` automáticamente — es RAII implementado en JavaScript.

### Las claves de caché son intencionalmente lossy

```typescript
function buildCharactersKey(playerImages: string[][], playerHp: number[], creatureImages: string[], creatureHp: number): string {
  const players = playerImages.map((imgs, i) => `${imgs[0]}:${playerHp[i] > 0 ? 1 : 0}`).join("|");
  return `chars::${players}::${creatureImages[0]}:${creatureHp > 0 ? 1 : 0}`;
}
```

La clave del characters layer no codifica el valor exacto de los HP — solo `1` (vivo) o `0` (muerto). Porque el sprite de un jugador con 40 HP y un jugador con 15 HP es idéntico. Un acierto de caché sobrevive por tanto a cualquier daño mientras nadie caiga.

La clave UI por el contrario codifica los HP exactos (la barra de vida cambia con cada golpe) y un hash de los mensajes:

```typescript
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0; // entero 32-bit signado
  }
  return hash.toString(16);
}
```

`Math.imul` fuerza la multiplicación a entero de 32 bits, lo que evita las conversiones float64 y da un hash polinomial estable. Sin dependencia externa para esto.

### La conversión base64 sin stack overflow

```typescript
function getBase64Cached(key: string, buf: ArrayBuffer): string {
  if (base64Cache[key]) return base64Cache[key];
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000; // 32768 octetos
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  const b64 = btoa(binary);
  base64Cache[key] = b64;
  return b64;
}
```

`String.fromCharCode(...largeArray)` puede provocar un stack overflow en imágenes grandes porque los argumentos se pasan en la call stack. El chunking de 32KB lo evita. El resultado se almacena en caché — la conversión base64 de una misma imagen se hace solo una vez por instancia de worker.

---

## STRIPPER.md — auditoría de awaits secuenciales

Hay un archivo `STRIPPER.md` en el repo que documenta una auditoría de paralelización de los `await`. Algunos ejemplos de lo que allí se registra:

- La carga del perfil del jugador hacía 3 consultas Supabase en serie (progresión, resumen de run, logros). Se pasaron a `Promise.all` — no hay dependencia entre ellas.
- La distribución de recompensas de fin de combate (accesorios + consumibles) era secuencial. Paralelizada igualmente.
- La creación de tokens de sesión para los botones se hacía grupo por grupo. Los grupos independientes ahora se crean en paralelo.

```typescript
// progressionService.ts -- antes (secuencial)
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

## El bot de Discord sin servidor persistente

![Victoria](/images/konosuba-rpg/shot_05_win.webp)

Punto a menudo malentendido: un bot de Discord no requiere necesariamente una conexión WebSocket persistente. Discord ofrece una alternativa: las **Interactions Endpoint URL**. Proporcionas una URL HTTPS a Discord, y Discord te envía un POST por cada interacción (slash command, botón, autocomplete).

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

Discord envía un POST, el handler se ejecuta 50-200ms en una función Vercel o un Cloudflare Worker, responde, y se acabó. Sin conexión permanente que mantener, sin servidor que mantener encendido. La totalidad del bot de Discord está alojada en el free tier de Vercel.

La verificación Ed25519 (`verifyKey` desde `discord-interactions`) es obligatoria — Discord envía una firma en los headers que debes validar, de lo contrario rechaza el endpoint.

### La animación especial — el único await intencional

```typescript
// handleSpecialButton.ts
await new Promise(resolve => setTimeout(resolve, 3000)); // 3 segundos
await fetch(`${DISCORD_API_URL}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
  method: "PATCH",
  // ...
});
```

Este retardo voluntario de 3 segundos está documentado en STRIPPER.md como intencional. El ataque especial de Megumin (Explosión) tiene una animación del lado de Discord — el mensaje se actualiza primero con un visual intermedio, y luego se modifica 3 segundos después con el resultado. Es el único caso donde una función de Vercel se ejecuta voluntariamente más tiempo del necesario.

![Ataque especial](/images/konosuba-rpg/shot_08_special.webp)

---

## Despliegue en dos plataformas

El mismo codebase funciona en Vercel (Node.js) y en Cloudflare Workers (V8 isolates) sin modificación:

```typescript
// worker.ts -- entrypoint Cloudflare
export default {
  fetch(request: Request, env: WorkerBindings): Promise {
    syncBindingsToProcessEnv(env); // inyecta los secrets de CF en process.env
    return app.fetch(request, env, ctx);
  }
};

// index.ts -- entrypoint Vercel/Node
const isVercelRuntime = process.env.VERCEL === "1";
if (!isVercelRuntime) { start(); }
```

La diferencia principal: los assets estáticos. En Vercel se leen desde el filesystem (`/var/task/assets/`). En Cloudflare Workers pasan por un binding `ASSETS` (assets estáticos de CF) con fallback hacia un mirror HTTPS (`fox3000foxy.com/konosuba-rpg/assets`). El `getAssetBytes` en `assetLoader.ts` gestiona ambos caminos intentando el filesystem primero, luego fetch.

Los WASM (`@cf-wasm/photon/edge-light`, `@cf-wasm/resvg`) tienen builds separados para cada runtime. El flag `edge-light` en el nombre del paquete designa el build compatible con Cloudflare Workers, que no permite `new WebAssembly.Module()` en runtime — el WASM debe estar precompilado.

---

## La progresión: XP, niveles, afinidad

![Un jefe, 650 HP](/images/konosuba-rpg/shot_06_boss.webp)

La meta-progresión se apoya en Supabase free tier. El esquema incluye una tabla `players` (XP global, nivel, gold), `character_progress` (XP/nivel/afinidad por personaje para Darkness, Aqua, Megumin), `runs` (historial de combates), `inventory_items`, `daily_quests_progress`, `achievements_unlocked`, `game_sessions`.

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

Estos factores se aplican a las stats de los personajes al inicio de cada `processGame`. Kazuma sigue el nivel global del jugador, los otros tres tienen cada uno su propio XP/nivel. La afinidad (ganada al recoger drops vinculados a un personaje) multiplica sus stats independientemente.

![Curación](/images/konosuba-rpg/shot_07_heal.webp)

El sistema de drops usa tablas de botín ponderadas por dificultad:

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

Tres suites: unitarios, rendimiento, y leaks.

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
  expect(after - before).toBeLessThan(20); // max 20MB de crecimiento heap
});
```

1200 iteraciones de `processGame`, GC forzado antes y después, delta heap < 20MB. Si este test pasa, `processGame` no tiene fugas. El test de renderizado (`renderImage.spec.ts`) verifica más bien el tiempo de ejecución bajo un umbral práctico.

También hay un script `bench.ts` para perfilar el pipeline completo:

```
RENDER_PERF=1 npx tsx bench.ts --runs=20 --warmup=3 --monster=Dragon
```

Con `RENDER_PERF=1`, el wrapper `withPerf` en cada servicio registra los timings:

```typescript
export async function withPerf(scope: string, label: string, work: () => Promise): Promise {
  const perf = createPerfLogger(scope);
  if (!perf.enabled) return work(); // zero overhead si desactivado
  perf.mark(`${label}:start`);
  try { return await work(); }
  finally { perf.done(`${label}:done`); }
}
```

`createPerfLogger` devuelve no-ops si `DEV_MODE` y `RENDER_PERF` no están a `1`. Sin overhead en producción.

---

## Lo que cuesta hacerlo funcionar

- **Vercel free tier**: 100GB de ancho de banda, 1M de invocaciones serverless al mes. El renderizado de imagen cuenta como una invocación.
- **Cloudflare Workers free tier**: 100K peticiones/día, 10ms CPU time por petición (el renderizado puede superar eso en Workers, de ahí Vercel como primario).
- **Supabase free tier**: 500MB de base de datos, 5GB de ancho de banda. Suficiente para miles de jugadores.

El conjunto del backend funciona a costo cero hasta un volumen significativo. El único punto de fricción es el límite de CPU de Cloudflare Workers — el renderizado de imagen consume mucha CPU debido a WASM, de ahí la estrategia de Vercel como primario y Workers como CDN de failover.

---

## Las 3 cosas que merece la pena recordar

1. **La URL como estado del juego** no es solo un truco ingenioso — es una restricción impuesta por Discord (los botones tienen un límite de 100 chars) que forzó una arquitectura stateless con compresión RLE + token de sesión como fallback. La restricción dictó el diseño.

2. **El caché WASM con evicción explícita**: los `PhotonImage` asignan fuera del heap de JavaScript y nunca serán GC'd sin `.free()`. Conectar `freePhoton` a la evicción del LRU es RAII en JavaScript. Es discreto en el código, pero sin esto el worker tendría fugas en producción.

3. **Un bot de Discord serverless sin WebSocket**: es menos conocido que el enfoque WebSocket gateway, pero para un bot que hace procesamiento stateless (cada interacción es independiente), el Interactions Endpoint es estrictamente superior — sin reconexión, sin heartbeat, sin proceso que mantener. Discord gestiona la disponibilidad desde su infra.

---

*Repo: [fox3000foxy/konosuba-rpg](https://github.com/fox3000foxy/konosuba-rpg)*

*Licencia source-available personalizada — sin redistribución, free to use.*
