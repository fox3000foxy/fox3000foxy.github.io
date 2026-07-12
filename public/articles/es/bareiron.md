---
title: Bareiron -- el servidor de Minecraft que corre en un microcontrolador de 1$
description: 6800 líneas de C, cero malloc, Perlin noise reemplazado por
  interpolación bilineal, biomas en tile map, y todo eso en un chip de 1$.
date: 2026-05-30
authors:
  - fox3000foxy
tags:
  - minecraft
  - reverse-engineering
  - embedded
  - c
  - esp32
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "qsjB64H/xaDuAsHFgRxtI/OdQbXLkqJAMpRh2lQLKX4ZD8Di5Ioxq62NBfDJOKMQvpP7wHi/19oEk5gWgiuqCA=="
---

## Introducción

¿Alguna vez te has preguntado si se podría hacer funcionar un servidor de Minecraft en un microcontrolador de 1 dólar?

Yo sí. Y la respuesta es sí. Literalmente.

Hay un proyecto que se llama [Bareiron](https://github.com/p2r3/bareiron/), firmado por p2r3, y es probablemente uno de los proyectos más fascinantes que he visto en el mundo de Minecraft en los últimos años. Hablamos de un binario que cabe en **300 kilobytes**, **6800 líneas de C**, cero dependencias externas, sin malloc, sin threading, y corre en una **ESP32 de 1 dólar**.

![ESP32-C3, el microcontrolador que hace funcionar el servidor](/images/bareiron/esp32-board.jpg)

Generación de terreno infinita. Biomas. Cuevas. Crafteo. Minería. Mobs. Hambre. Cofres. Todo lo que esperas de un servidor survival.

En un chip que consume **0.5 Watts** y tiene **160 MHz** de reloj.

Para que te hagas una idea: un servidor Minecraft vanilla necesita varios gigas de RAM. La ESP32-C3 tiene **520 KB de SRAM** (400 disponibles después del boot). Los procesadores de hace 20 años ya corrían en gigahercios -- este llega a 160 MHz. El factor entre ambos en potencia pura es de aproximadamente **20 000**.

p2r3 no escribió un servidor de Minecraft en C, reinventó cada pieza del servidor para que quepa dentro de esas limitaciones. Vamos a ver cómo, abriendo el código fuente.

![Miniatura del video de presentación de Bareiron por p2r3](/images/bareiron/title-card.jpg)

## El cerebro del proyecto: generación de terreno sin memoria

El problema más grande cuando quieres hacer un servidor MC embebido es la generación de terreno.

En Minecraft vanilla, el mundo se genera con **Perlin noise**: varias capas superpuestas (octavas), 6 parámetros biomásicos (temperatura, humedad, continentalidad, erosión, weirdness, profundidad), y todo un sistema de caching para no tener que recalcular todo cada vez.

El resultado es magnífico. Pero es caro en cálculo, y ocupa RAM para almacenar los chunks generados.

El enfoque de Bareiron es radicalmente diferente. En lugar de apilar ruido, usa **interpolación bilineal** sobre 4 puntos generados por un **RNG determinista**.

¿Sabes cuando agrandas una imagen pequeña pixelada y los bordes se vuelven borrosos? Es exactamente eso.

```c
// worldgen.c, líneas 117-171 (simplificado)

uint8_t interpolate (uint8_t a, uint8_t b, uint8_t c, uint8_t d, int x, int z) {
  uint16_t top    = a * (CHUNK_SIZE - x) + b * x;
  uint16_t bottom = c * (CHUNK_SIZE - x) + d * x;
  return (top * (CHUNK_SIZE - z) + bottom * z) / (CHUNK_SIZE * CHUNK_SIZE);
}

uint8_t getHeightAt (int x, int z) {
  int _x = floor(x / CHUNK_SIZE);  // coordenadas del chunk
  int _z = floor(z / CHUNK_SIZE);
  int rx = x % CHUNK_SIZE;          // offset dentro del chunk
  int rz = z % CHUNK_SIZE;
  uint32_t hash = getChunkHash(_x, _z);
  uint8_t biome = getChunkBiome(_x, _z);
  // interpolación entre 4 esquinas seedeadas por hash + bioma
  return getHeightAtFromHash(rx, rz, _x, _z, hash, biome);
}
```

La interpolación bilineal estándar: 4 esquinas, pesos según la posición, un solo `uint8_t` de salida. CHUNK_SIZE es 8, así que se hace con multiplicaciones enteras, sin floats.

p2r3 lo muestra paso a paso en el video: primero las 4 esquinas del chunk, cada una con una altura seedeada por el RNG.

![Las 4 esquinas del chunk, cada una seedeada por el RNG determinista](/images/bareiron/gen-four-corners.jpg)

Luego la interpolación entre estos 4 puntos crea una superficie continua.

![Aplicación de la interpolación bilineal entre las 4 esquinas](/images/bareiron/gen-interpolate.jpg)

Y repitiendo el patrón en todos los chunks adyacentes, se obtiene un terreno que se extiende hasta el infinito.

![Resultado final: terreno irregular continuo](/images/bareiron/gen-result.jpg)

### El RNG determinista

La clave que hace todo esto posible es el seedeo. Cada chunk tiene 4 esquinas, y cada esquina necesita un valor pseudoaleatorio único pero reproducible.

```c
// worldgen.c, líneas 13-22

uint32_t getChunkHash (short x, short z) {
  uint8_t buf[8];
  memcpy(buf, &x, 2);          // 16 bits de coordenada X
  memcpy(buf + 2, &z, 2);      // 16 bits de coordenada Z
  memcpy(buf + 4, &world_seed, 4);  // 32 bits de seed global
  return splitmix64(*((uint64_t *)buf));  // hash
}
```

Empaqueta los 16 bits de X, 16 bits de Z, y 32 bits de seed, en un buffer de 8 bytes, y lo pasa todo por `splitmix64`. Resultado: un valor determinista único para cada posición, basado en la seed del mundo.

¿Captas la potencia de esto? El servidor no necesita almacenar el terreno. Recalcula sobre la marcha cuando el jugador llega a una nueva zona, y da exactamente el mismo resultado cada vez.

El `splitmix64` usado es un prng ultra-rápido diseñado para hashes de 64 bits:

```c
// worldgen.c (simplificado)

static uint32_t splitmix64 (uint64_t state) {
  state += 0x9E3779B97F4A7C15ull;
  uint64_t z = state;
  z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ull;
  z = (z ^ (z >> 27)) * 0x94D049BB133111EBull;
  return (z ^ (z >> 31)) >> 32;
}
```

3 operaciones: suma, xor/shift, multiplicación, xor/shift, multiplicación, xor/shift. Sin lookup table, sin bucle. Toma el buffer de 8 bytes (X + Z + seed), lo trata como un entero de 64 bits, y devuelve 32 bits de hash. Es determinista, rápido, y cabe en 5 líneas.

### Por qué no es Perlin noise

p2r3 lo dice él mismo en el video: "cuantos más dígitos del número aleatorio añades, más regular se vuelve el terreno, como más lanzamientos de moneda te acercan a 50/50". En la práctica, es el número de bits del hash que combina:

```c
// worldgen.c, líneas 51-115

// Para un bioma plains: 4 factores combinados → terreno regular
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// Para snowy plains: 2 factores → más accidentado
h = (hash % 5) + ((hash >> 4) % 5);
```

Cada bioma elige cuántas extracciones de bits combina. Cuantas más, más se estabiliza la distribución -- como más lanzamientos de moneda que se acercan a 50/50. Menos, más fuertes son las variaciones locales.

![Terreno irregular -- pocos factores, variaciones fuertes](/images/bareiron/terrain-irregular.jpg)

Con solo 2 factores, el snowy plains produce un terreno ondulado, casi montañoso. Los picos y los valles son frecuentes.

![Terreno regular -- factores múltiples, superficie lisa](/images/bareiron/terrain-regular.jpg)

Con 4 factores, las planicies se mantienen llanas y predecibles. La distribución se estabiliza.

Un chunk se genera en **200 ms** en ESP32 -- frente a un tiempo no medible en el mismo hardware con Perlin noise de lo caro que es.

### El detalle que mata: consultar un bloque sin generar todo el chunk

Juegas, minas un bloque. El servidor debe saber qué item darte. Ingenuamente, habría que generar todo el chunk para eso.

Con la interpolación bilineal, consultas **cualquier punto** del plano directamente desde las coordenadas. Las esquinas del chunk se obtienen desde la posición del jugador, la interpolación te da la altura en cualquier offset. Un puñado de operaciones matemáticas, sin generación de chunk.

p2r3: "lo que quiero es una función mágica que pueda decirme qué bloque hay en una coordenada dada, sin acceder a la memoria ni calcular mapas de ruido caros". Exactamente lo que hizo.

Así es como la altura se convierte en bloques concretos:

```c
// worldgen.c (simplificado)

uint8_t getTerrainBlock (int x, uint8_t y, int z) {
  uint8_t surface = getHeightAt(x, z);

  if (y > surface)             return B_air;
  if (y == surface)            return biome_top[getChunkBiome(x, z)];
  if (y > surface - 4)         return B_dirt;
  if (y > surface - 16)        return B_stone;
  if (y > CAVE_BASE_DEPTH)     return B_deepslate;
                               return B_bedrock;
}
```

5 condiciones. Una capa de grass/dirt/stone/deepslate/bedrock. El bloque de superficie depende del bioma mediante `biome_top[]` -- grass para las planicies, sand para el desierto. Sin bucle, sin switch, una cascada de if que cae en la capa correcta.

### Las cuevas, el mirror más vago

```c
altitud_cueva = CAVE_BASE_DEPTH - (altura_superficie - y);
```

Hace mirror de la altura de la superficie bajo tierra. Se parece a las grandes cavidades de deepslate. Cero cómputo, una línea.

![Cuevas generadas por mirror del terreno de superficie](/images/bareiron/cave-mirror.jpg)

![Diagrama del mirror de terreno para generar cuevas](/images/bareiron/cave-diagram.jpg)

### Los minerales, versión XOR

```c
candidato = (chunk_x ^ col_x ^ col_z) % 100;
if (candidato < 5 && y < 16) -> diamond
```

Un XOR de coordenadas garantiza un candidato por columna. El tipo depende solo de la altitud. Los diamantes están escondidos bajo el punto más bajo de las cuevas para que minar siga siendo útil.

### Los biomas en tile map

Cada bioma es una isla circular en una cuadrícula, su tipo determinado por un patrón calculado desde la seed. Cuadriculado, predecible y gratuito.

![Mapa de biomas en tile map -- cada isla es un bioma diferente](/images/bareiron/biome-tilemap.jpg)

Cada bioma tiene su propio conjunto de parámetros codificados en arrays:

```c
// worldgen.c (simplificado)

static const uint8_t biome_base[] = {
  [BIOME_PLAINS]  = 48,   // altura base: 48
  [BIOME_DESERT]  = 52,   // ligeramente más alto
  [BIOME_FOREST]  = 50,   // entre ambos
  [BIOME_TAIGA]   = 46,   // un poco más bajo
  [BIOME_SNOWY]   = 40,   // el más bajo
};

static const uint8_t biome_top[] = {
  [BIOME_PLAINS]  = B_grass,
  [BIOME_DESERT]  = B_sand,
  [BIOME_FOREST]  = B_grass,
  [BIOME_TAIGA]   = B_grass,
  [BIOME_SNOWY]   = B_snow_block,
};

static const uint8_t biome_factors[] = {
  [BIOME_PLAINS]  = 4,   // 4 extracciones → muy regular
  [BIOME_DESERT]  = 3,   // 3 extracciones → moderado
  [BIOME_FOREST]  = 4,   // 4 extracciones → regular, ondulado
  [BIOME_TAIGA]   = 3,   // 3 extracciones → moderado
  [BIOME_SNOWY]   = 2,   // 2 extracciones → muy accidentado
};
```

**Plains**: altura 48, 4 factores → terreno muy plano, hierba.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// Resultado: variación de ±4 bloques como máximo
```

**Desert**: altura 52, 3 factores, bloque superficie = arena. Nunca bajo el nivel del mar.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3);
// Resultado: variación de ±6 bloques como máximo, clampado a SEA_LEVEL+1
```

**Forest**: altura 50, 4 factores como plains pero base más alta → colinas boscosas.

**Taiga**: altura 46, 3 factores → variaciones moderadas, terreno frío.

**Snowy plains**: altura 40, solo 2 factores → el más accidentado.

```c
h = (hash % 5) + ((hash >> 4) % 5);
// Resultado: variación de ±14 bloques como máximo
```

Cada bioma está codificado en **3 arrays de 5 entradas**: altura base, bloque de superficie, número de factores. Cuando `getHeightAtFromHash` recibe el bioma, consulta estos arrays para ajustar el terreno. 15 bytes de datos para reemplazar todo el sistema de biomas de Minecraft.

El detector de biomas usa la seed para determinar qué bioma corresponde a cada chunk:

```c
// worldgen.c (simplificado)

static const uint8_t biome_pattern[] = {
  BIOME_PLAINS, BIOME_FOREST, BIOME_PLAINS, BIOME_DESERT,
  BIOME_FOREST, BIOME_TAIGA,  BIOME_PLAINS, BIOME_SNOWY,
  BIOME_PLAINS, BIOME_FOREST, BIOME_DESERT,  BIOME_PLAINS,
  BIOME_SNOWY,  BIOME_PLAINS, BIOME_FOREST, BIOME_TAIGA,
};

uint8_t getChunkBiome (short cx, short cz) {
  uint32_t h = splitmix64(cx * 31 + cz * 97 + world_seed);
  uint8_t index = h % 16;
  return biome_pattern[index];
}
```

Un patrón de 16 entradas, un índice seedeado por las coordenadas del chunk. Da una cuadrícula repetitiva pero visualmente coherente. 4 líneas de código para reemplazar todo el sistema de parámetros biomásicos de Minecraft vanilla.

### getHeightAtFromHash: el ensamblador de terreno

La función en el corazón de la generación combina las 4 esquinas seedeadas por bioma:

```c
// worldgen.c (simplificado)

static uint8_t getHeightAtFromHash (int rx, int rz, short cx, short cz,
                                    uint32_t h, uint8_t biome) {
  // 4 esquinas extraídas del hash, seed diferente por esquina
  uint8_t h1 = biome_base[biome] + (h & 0x0F);
  uint8_t h2 = biome_base[biome] + ((h >> 4) & 0x0F);
  uint8_t h3 = biome_base[biome] + ((h >> 8) & 0x0F);
  uint8_t h4 = biome_base[biome] + ((h >> 12) & 0x0F);

  // Restricción del bioma: desierto nunca bajo el agua
  if (biome == BIOME_DESERT) {
    h1 = max(h1, SEA_LEVEL + 1);
    h2 = max(h2, SEA_LEVEL + 1);
    h3 = max(h3, SEA_LEVEL + 1);
    h4 = max(h4, SEA_LEVEL + 1);
  }

  // Interpolación desde las 4 esquinas
  return interpolate(h1, h2, h3, h4, rx, rz);
}
```

Cada bioma tiene una `biome_base` que desplaza la altura de referencia, y las 4 esquinas se extraen del hash con desplazamientos diferentes. El desierto fuerza el mínimo por encima del nivel del mar -- una línea de restricción que evita el agua sin cálculo biomásico adicional.

### Árboles y cactus: colocación probabilística

La generación de superficie usa el mismo hash del chunk para decidir dónde plantar:

```c
// worldgen.c (simplificado)

static void genFoliage (uint8_t *chunk_data, short cx, short cz,
                        uint32_t hash, uint8_t biome) {
  if (biome == BIOME_DESERT) {
    // Cactus: un candidato por chunk, el hash determina la posición
    int tx = (hash >> 8) & 7;
    int tz = (hash >> 12) & 7;
    int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
    if (chunk_data[ty * 64 + tz * 8 + tx] == B_sand)
      placeCactus(chunk_data, tx, ty + 1, tz);
  } else {
    // Árboles: el hash determina si se colocan y dónde
    int tree_count = (hash & 3);  // 0-3 árboles por chunk
    for (int i = 0; i < tree_count; i ++) {
      int tx = ((hash >> (4 + i * 4)) & 7);
      int tz = ((hash >> (6 + i * 4)) & 7);
      int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
      placeTree(chunk_data, tx, ty + 1, tz);
    }
  }
}
```

0-3 árboles por chunk para los biomas verdes, 1 cactus como máximo para el desierto. El hash del chunk es la única fuente de entropía -- un `& 7` para la posición dentro del chunk, un `& 3` para el contador. Todo es determinista, nada se almacena.

### generateChunk: ensamblarlo todo

La función que junta todo para producir un chunk completo de 8×8×256 bloques:

```c
// worldgen.c (simplificado)

void generateChunk (uint8_t *chunk, short cx, short cz) {
  uint32_t hash = getChunkHash(cx, cz);
  uint8_t biome = getChunkBiome(cx, cz);

  // Para cada columna del chunk (8×8 = 64)
  for (int x = 0; x < 8; x ++) {
    for (int z = 0; z < 8; z ++) {
      // Coordenadas mundo absolutas
      int wx = cx * 8 + x;
      int wz = cz * 8 + z;

      // Altura de la columna
      uint8_t height = getHeightAt(wx, wz);

      // Rellenar la columna de abajo arriba
      for (int y = 0; y < height; y ++) {
        uint8_t block = getTerrainBlock(wx, y, wz);
        chunk[y * 64 + z * 8 + x] = block;
      }
    }
  }

  // Añadir los elementos de superficie (árboles, cactus)
  genFoliage(chunk, cx, cz, hash, biome);
}
```

Eso es todo. 3 bucles anidados: para cada columna, encontrar la altura, rellenar los bloques, pasar a la siguiente. La salida es un `uint8_t[16384]` (8 × 8 × 256) que representa el chunk completo. Sin caching, sin lazy loading, sin compresión -- el chunk se genera y se envía directo al cliente.

## El almacenamiento: arrays estáticos por todas partes

La arquitectura de memoria de Bareiron es C embebido en todo su esplendor. Sin malloc, sin hash maps, sin listas enlazadas.

Todo está en arrays globales de tamaño fijo.

### Los cambios de bloques

```c
// globals.h, líneas 191-196

typedef struct {
  short x;      // 2 bytes -- límite de 32 000 bloques horizontal
  short z;      // 2 bytes
  uint8_t y;    // 1 byte -- límite de 256 bloques vertical
  uint8_t block; // 1 byte -- límite de 256 tipos de bloques
} BlockChange;
```

20 000 entradas, aproximadamente **25 000 cambios** -- el equivalente a un chunk y medio completamente excavado. El campo `block` con valor `0xFF` marca una entrada libre. La búsqueda es un escaneo lineal:

![Layout de memoria del array de bloques -- 6 bytes por entrada](/images/bareiron/memory-layout.jpg)

```c
// procedures.c

uint8_t getBlockChange (short x, uint8_t y, short z) {
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block == 0xFF) continue;
    if (block_changes[i].x == x && block_changes[i].y == y && block_changes[i].z == z)
      return block_changes[i].block;
    #ifdef ALLOW_CHESTS
      if (block_changes[i].block == B_chest) i += 14;  // saltar datos del cofre
    #endif
  }
  return 0xFF;
}

Añadir un cambio es igual de directo que la búsqueda:

```c
static uint8_t changes_count = 0;

void addBlockChange (short x, short z, uint8_t y, uint8_t block) {
  if (changes_count >= MAX_CHANGES) return;
  block_changes[changes_count].x = x;
  block_changes[changes_count].z = z;
  block_changes[changes_count].y = y;
  block_changes[changes_count].block = block;
  changes_count ++;
}
```

Un contador, un índice, una escritura. Sin ordenamiento, sin compactación, sin gestión de memoria. Cuando el array está lleno, los nuevos cambios se ignoran -- el terreno vuelve a su estado generado.

El comentario del autor sobre el límite de 256 bloques: "no pienso implementar las escaleras de cobre ligeramente patinado encerado por ahora."

### Los mobs: 8 bytes por cabeza

```c
// globals.h, líneas 240-251 (pragma pack(push, 1) para eliminar el padding)

typedef struct {
  uint8_t type;   // 25=chicken, 28=cow, 95=pig, 106=sheep, 145=zombie
  short x;
  uint8_t y;      // si health=0, Y se convierte en un timer antes de eliminar
  short z;
  uint8_t data;   // bits 0-4: health, bit 5: sheep sheared, bits 6-7: panic timer
} MobData;
```

8 bytes. 16 espacios como máximo. Sin alineación, sin padding. El byte `data` es un bitfield casero: 5 bits de vida, 1 bit de esquilado, 2 bits de timer de pánico. Y cuando un mob muere, el campo Y se convierte en un timer antes de eliminarlo. Reutilización de memoria a nivel de bit.

### Los jugadores: empaquetados apretados

Los datos de jugadores usan `#pragma pack(push, 1)` también -- coordenadas en `short` + `uint8_t`, inventarios en arrays fijos de `uint16_t` + `uint8_t`, y un campo `flags` que codifica a la vez el cooldown de ataque, el estado de spawn, sneak, sprint, eat, load, movement cooldown, y el lock de crafteo. Todo eso en bits individuales.

## El bucle principal: while(true) y no-bloqueante

El servidor entero corre en un bucle, un hilo, cero event library.

```c
// main.c, líneas 594-720

while (true) {
  task_yield();  // deja respirar al watchdog en ESP32

  // Aceptar una nueva conexión (no-bloqueante)
  for (int i = 0; i < MAX_PLAYERS; i ++) {
    if (clients[i] != -1) continue;
    clients[i] = accept(server_fd, ...);
    if (clients[i] != -1) client_count ++;
    break;
  }

  // Tick del servidor si el tiempo ha pasado
  if (get_program_time() - last_tick_time > TIME_BETWEEN_TICKS) {
    handleServerTick(time_since_last_tick);
    last_tick_time = get_program_time();
  }

  // Round-robin: un cliente, un paquete por iteración
  client_index = (client_index + 1) % MAX_PLAYERS;
  if (clients[client_index] == -1) continue;

  // Leer el header del paquete: length + ID
  recv(client_fd, &recv_buffer, 2, MSG_PEEK);
  int length = readVarInt(client_fd);
  int packet_id = readVarInt(client_fd);
  handlePacket(client_fd, length - sizeVarInt(packet_id), packet_id, state);
}
```

Solo un cliente se procesa por iteración del bucle, y solo un paquete se lee a la vez. El `task_yield()` al inicio del bucle deja respirar al FreeRTOS idle task en ESP32 -- sin eso, el watchdog timer te resetea el chip.

El dispatch de paquetes es un switch monstruoso de **400 líneas**:

```c
// main.c, líneas 68-497

void handlePacket (int client_fd, int length, int packet_id, int state) {
  switch (packet_id) {
    case 0x00:  // Handshake / Status / Login según el estado
    case 0x01:  // Status ping
    case 0x02:  // Plugin message
    case 0x03:  // Login/configuration acknowledgment
    case 0x08:  // Chat
    case 0x0B:  // Client status (respawn)
    case 0x11:  // Click container (gestiona los cofres)
    case 0x19:  // Interact entity
    case 0x1D..0x20:  // Movement packets (el caso más grande)
    case 0x28:  // Player action (dig/place)
    // ... 40+ casos
  }
}
```

Sin jump table dinámica, sin vtable, sin map. Un switch se compila en jump table estática. Perfecto para embebido.

El caso `0x1D-0x20` es el más grande -- gestiona las actualizaciones de posición, el daño por caída, los cruces de fronteras de chunk, el spawn de mobs, la generación de chunks, Y el hambre. Todo en un solo gran fall-through.

![El código del servidor Bareiron -- 6800 líneas de C](/images/bareiron/code-shot.jpg)

## El tick del servidor y la IA de los mobs

La función `handleServerTick` se llama cada 50 ms (20 TPS). Gestiona el mundo mientras el bucle principal se ocupa de los jugadores:

```c
// main.c (simplificado)

void handleServerTick (uint32_t delta) {
  // Actualizar cada mob
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type == 0 || mobs[i].data == 0) continue;  // muerto o vacío

    MobData *mob = &mobs[i];
    int px, pz;
    getNearestPlayer(mob->x, mob->z, &px, &pz);

    if (mob->type == MOB_ZOMBIE) {
      // Hostil: camina hacia el jugador más cercano
      if (px < mob->x) mob->x --;
      else if (px > mob->x) mob->x ++;
      if (pz < mob->z) mob->z --;
      else if (pz > mob->z) mob->z ++;
      // Daño por contacto a 2 bloques
      if (abs(px - mob->x) <= 2 && abs(pz - mob->z) <= 2)
        damagePlayer(getNearestPlayerId(mob->x, mob->z), 3);
    } else {
      // Pasivo: 8 direcciones aleatorias
      uint8_t dir = getMobDir(mob);
      mob->x += dir_lookup[dir][0];
      mob->z += dir_lookup[dir][1];
      // Cambio de dirección cada ~40 ticks
      if (mob->data >> 6 < 1) setMobDir(mob, rand() & 7);
      mob->data = (mob->data & 0x3F) | ((mob->data - 0x40) & 0xC0);
    }

    // Despertar los chunks alrededor del mob
    setChunkGenerated(mob->x / 8, mob->z / 8);
  }
}
```

La IA de los mobs hostiles es una comparación de coordenadas. Literalmente `if (px < x) x--`. Sin pathfinding, sin A*, sin obstacle avoidance. El zombie ajusta X y Z independientemente hacia el jugador -- atraviesa las paredes si las hay.

El daño por contacto es de 3 corazones/seg. p2r3 lo puso alto porque la ausencia de pathfinding hace que los zombies sean fáciles de kitar.

La fórmula de armadura es la de antes del combat update -- la más simple posible:

```c
// main.c (simplificado)

static uint8_t applyArmor (uint8_t damage, uint16_t armor_value) {
  // Fórmula pre-1.9: reducción lineal
  // Cada punto de armadura = 4% de reducción, max 80%
  uint8_t reduction = (armor_value * 4);
  if (reduction > 80) reduction = 80;
  return damage * (100 - reduction) / 100;
}
```

Full diamond = 80% de reducción. Un golpe de zombie de 3 corazones se convierte en 0.6 corazones. p2r3 eligió esta vieja fórmula porque se calcula en 2 operaciones -- sin umbrales, sin curvas, solo un porcentaje lineal.

Los mobs pasivos: 8 direcciones en una lookup table, cambio de rumbo cada ~40 ticks. El campo `data` codifica la dirección actual en los 2 bits más altos, y el timer de cambio de dirección en los 6 bits restantes.

![Mobs en Bareiron -- zombies, cerdos, ovejas](/images/bareiron/mobs.jpg)

### El respawn de los mobs

Los mobs no spawnean con random ticks. Aparecen cuando el tick del servidor encuentra una nueva frontera de chunk:

```c
if (player crossed chunk boundary) {
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type != 0) continue;
    spawnMob(&mobs[i], new_chunk_coords, getChunkHash(cx, cz));
    break;
  }
}
```

Mismo RNG que el terreno, misma seed del chunk. Si un espacio de mob está libre, el spawn es determinista.

## El crafteo: sin matrices, con if/else

```c
// crafting.c, líneas 9-347 (simplificado)

void getCraftingOutput (PlayerData *player, uint8_t *count, uint16_t *item) {
  // Si el flag 0x80 está activado, el buffer de crafteo está siendo usado por un cofre
  if (player->flags & 0x80) { *count = 0; *item = 0; return; }

  // Contar los slots, encontrar el primer item, verificar la identidad
  uint8_t filled = 0, first = 10, identical = true;
  for (int i = 0; i < 9; i ++) {
    if (player->craft_items[i]) {
      filled ++;
      if (first == 10) first = i;
      else if (player->craft_items[i] != player->craft_items[first])
        identical = false;
    }
  }

  switch (filled) {
    case 1:  /* tablones, lingotes... */
    case 2:  /* palos, tijeras, antorchas */
    case 3:  /* palas, espadas, losas */
    case 4:  /* mesa de crafteo, botas */
    case 5:  /* picos, hachas, cascos */
    case 7:  /* grebas, compostadores */
    case 8:  /* horno, cofre, peto */
    case 9:  /* bloques completos (hierro, oro, etc.) */
  }
}
```

Primer check: si el flag `0x80` está activado, el buffer de crafteo se recicla como puntero de cofre. No se puede craftear.

Luego, cuenta los slots llenos, anota el primer item, verifica la identidad. Con solo eso, matcheas el horno en 4 checks:

```c
if (count == 8 && first == cobblestone && all_identical && center_empty)
    return furnace;
```

Para las formas complejas, usa el índice del primer item y verifica la posición relativa. Las recetas comparten una misma función de matching -- el material determina el resultado.

![Interfaz de crafteo y cofre en Bareiron](/images/bareiron/crafting.jpg)

## Los cofres: el hack de verdad

El hack de memoria del que todo el mundo habla, en código real:

```c
// procedures.c, líneas 1262-1293

if (target == B_chest) {
  // Buscar la entrada del cofre en el array de bloques
  uint8_t *storage_ptr = NULL;
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block != B_chest) continue;
    if (block_changes[i].x != x || block_changes[i].y != y || block_changes[i].z != z)
      continue;
    storage_ptr = (uint8_t *)(&block_changes[i + 1]);  // apunta después del bloque cofre
    break;
  }
  if (storage_ptr == NULL) return;

  // Terrible memory hack!!
  // Copiamos el PUNTERO en el array de items de crafteo del jugador
  memcpy(player->craft_items, &storage_ptr, sizeof(storage_ptr));
  player->flags |= 0x80;  // bloquea el crafteo

  // Enviar la interfaz del cofre al cliente
  sc_openScreen(player->client_fd, 2, "Chest", 5);
  for (int i = 0; i < 27; i ++) {
    uint16_t item;
    uint8_t count;
    memcpy(&item, storage_ptr + i * 3, 2);
    memcpy(&count, storage_ptr + i * 3 + 2, 1);
    sc_setContainerSlot(player->client_fd, 2, i, count, item);
  }
}
```

Y el comentario en el código: `// Terrible memory hack!!1!`

Es exactamente eso. Toma la dirección de memoria de la entrada siguiente en `block_changes[]`, la copia en `player->craft_items` (que es un `uint16_t[9]`, o sea 18 bytes -- suficiente para almacenar un puntero de 32 bits), y activa el flag para que nadie intente craftear mientras tanto.

En cada clic en el inventario del cofre:

```c
// packets.c, líneas 620-638

uint8_t *storage_ptr;
memcpy(&storage_ptr, player->craft_items, sizeof(storage_ptr));
// storage_ptr ahora apunta a los datos del cofre
uint16_t *p_item = (uint16_t *)(storage_ptr + (slot - 41) * 3);
uint8_t *p_count = storage_ptr + (slot - 41) * 3 + 2;
```

Recupera el puntero desde el buffer de crafteo, y accede a los slots con un offset. Los datos del cofre se almacenan a razón de 3 bytes por slot (2 para el ID, 1 para la cantidad), pegados unos a otros en el array de bloques.

![Datos de cofre almacenados en el array de bloques -- un hack de memoria](/images/bareiron/chest-hack.jpg)

## El hambre: 5 líneas de genio

```c
// main.c, líneas 293-305

// Los jugadores envían paquetes de movimiento a ~20/seg cuando se
// mueven, mucho menos cuando están quietos. Correlacionamos eso
// con la actividad para simular el hambre gratuitamente.
if (player->saturation == 0) {
  if (player->hunger > 0) player->hunger--;
  player->saturation = 200;
  sc_setHealth(client_fd, player->health, player->hunger, player->saturation);
} else if (player->flags & 0x08) {  // sprinting
  player->saturation -= 1;
}
}
```

Es literalmente eso. 5 líneas. Cada paquete de movimiento decrementa la saturación. Cuando la saturación llega a cero, el hambre baja y se resetea la saturación. El sprint (flag `0x08`) duplica el drenaje.

Cero timer, cero memoria asignada, cero cómputo dedicado. Un contador que se decrementa con paquetes que ya existen.

### El daño por caída

El sistema de daño más simple del proyecto:

```c
// Cuando el jugador deja el suelo, almacenamos su Y
// Cuando vuelve a tocar el suelo, restamos
danio = ultima_y_en_suelo - y_actual;
```

Una resta.

## Minar y colocar bloques

Cuando haces clic en un bloque, el paquete `0x28` (Player Action) llega al switch. El handler debe determinar qué bloque hay en la posición, retirarlo, y poner el item en el inventario:

```c
// main.c, case 0x28 (simplificado)

void handlePlayerAction (int client_fd, uint8_t action, int x, uint8_t y, int z) {
  switch (action) {
    case START_DESTROY_BLOCK: {
      // Determinar el tipo de bloque en la posición cliqueada
      uint8_t block = getBlockAt(x, y, z);

      if (block == B_chest) {
        openChest(client_fd, x, y, z);
        break;
      }

      // Añadir a block_changes
      addBlockChange(x, z, y, 0);  // 0 = air

      // Dar el item al jugador (trust the client)
      addItemToPlayer(client_fd, block_to_item(block), 1);

      // Enviar la actualización al cliente
      sc_blockChange(client_fd, x, y, z, 0);
      sc_ackBlockChange(client_fd, x, y, z, 0);
      break;
    }
    case PLACE_BLOCK: {
      // Leer el tipo de bloque desde la mano del jugador
      uint16_t item = getHeldItem(client_fd);
      uint8_t block = item_to_block(item);
      addBlockChange(x, z, y, block);
      removeItemFromPlayer(client_fd, item, 1);
      sc_blockChange(client_fd, x, y, z, block);
      break;
    }
  }
}
```

`getBlockAt` combina la generación de terreno Y los cambios de jugadores:

```c
uint8_t getBlockAt (int x, uint8_t y, int z) {
  // Primero verificar los cambios de jugadores
  uint8_t change = getBlockChange(x, y, z);
  if (change != 0xFF) return change;

  // Si no, leer desde el terreno generado
  return getTerrainBlock(x, y, z);
}
```

Prioridad a los cambios, fallback al terreno. Cero debate, cero caché, cero overhead. El `getTerrainBlock` bajo el capó es `getHeightAt` + las capas de stone/dirt/grass/coal.

### El horno instantáneo

Lo más gracioso: el horno no existe como entidad. Si pones cobblestone en la ranura "cocción" y coal en "combustible", el resultado aparece inmediatamente. Sin timer, sin chunk ticking. Es solo una ranura de inventario que se vacía cuando pones los items correctos.

![Horno instantáneo -- pon los ingredientes, resultado inmediato](/images/bareiron/furnace.jpg)

## El bucle ESP32: un servidor MC en 4 KB de stack

```c
// main.c, líneas 732-779

#ifdef ESP_PLATFORM

void bareiron_main (void *pvParameters) {
  main();
  vTaskDelete(NULL);
}

static void wifi_event_handler (...) {
  if (/* conectado */) {
    xTaskCreate(bareiron_main, "bareiron", 4096, NULL, 5, NULL);
  }
}

void app_main () {
  esp_timer_early_init();
  wifi_init();
  // El resto lo gestiona el event handler
}
#endif
```

El servidor entero corre en una tarea FreeRTOS con **4096 bytes de stack**. Eso es todo. El hilo principal solo inicializa el WiFi y espera una conexión. Una vez conectado, lanza `bareiron_main` que llama al `main()` estándar.

Todo el código específico de ESP32 está protegido por `#ifdef ESP_PLATFORM`. En PC, todo esto compila como código POSIX estándar.

## Lo que se ha sacrificado

Para que todo quepa, hay características vanilla que no existen:

- **Sin compresión de red** -- zlib demasiado caro. El servidor genera chunks rápido, pero enviarlos es el bottleneck.
- **Sin random ticks** -- los árboles crecen con bone meal o no crecen. Los mobs spawnean en las fronteras de chunk.
- **Sin entidades item** -- los bloques minados van directo al inventario. La animación es puramente visual.
- **Sin verificación de inventario** -- trust the client. ¿64 diamantes? OK. ¿Un chunk minado en 1 seg? OK. Para usar entre gente de confianza.
- **Sin luz del servidor** -- las antorchas se envían después de todo lo demás, el cliente calcula.
- **Sin fluidos progresivos** -- estado final instantáneo.

## El resultado final

Ryzen 5 3600: ~0.5 ms por chunk.
ESP32-C3 de 1$: ~200 ms por chunk. Jugable.

![Benchmark de generación de chunks -- Ryzen vs ESP32](/images/bareiron/performance.jpg)

3+ jugadores: va lento. Comparable a 2b2t en horas pico, según el autor.

![Varios jugadores conectados al mismo servidor Bareiron](/images/bareiron/multiplayer.jpg)

## La filosofía

p2r3: "Simplemente me gusta la idea de que este chip diminuto de 1 dólar que consume 0.5 Watts pueda hacer funcionar algo tan avanzado como Minecraft. Science isn't about 'why', it's about 'why not'."

Cada línea es un tradeoff:
- Perlin noise → interpolación: menos bonito, 200x más rápido, cero memoria
- Matrices de crafteo → matching hardcodeado: código feo, cero bytes
- zlib → nada: conexión mala = muerte, pero jugable
- Validación → trust: cero seguridad, cero cómputo

Cada característica ausente permite que otra exista dentro de los límites del hardware.

**Las 3 cosas para recordar:**

1. **Interpolación + RNG** -- 4 puntos seedeados, terreno infinito, cero almacenamiento, query sin regenerar el chunk, 200 ms de generación. Es la jugada genial que hace todo lo demás posible.
2. **Cada característica tiene un costo** -- Sin compresión, sin random ticks, sin validación. No son olvidos, es lo que permite caber en 520 KB.
3. **Los hacks feos son los más inteligentes** -- Cofres en el array de bloques via memcpy, hambre por paquetes de movimiento, horno instantáneo. La solución limpia habría sido demasiado cara.

Si el proyecto te interesa, todo está en [GitHub bajo GPLv3](https://github.com/p2r3/bareiron/). Es C bien sucio, y rara vez he disfrutado tanto leyendo un código fuente xD
