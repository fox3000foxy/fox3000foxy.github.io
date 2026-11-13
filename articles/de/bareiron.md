---
title: Bareiron, der Minecraft-Server, der auf einem 1$-Mikrocontroller läuft
description: 6800 Zeilen C, null malloc, Perlin Noise ersetzt durch
  bilineare Interpolation, Biome als Tile Map, und das alles auf einem 1$-Chip.
date: 2026-05-30
tags:
  - minecraft
  - reverse-engineering
  - embedded
  - c
  - esp32
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "LbmkB/1WTGYIUdYmhuUPdK2ekfsMDKt4jJnz1dXg7GDJ+Q7PZuRsu4z26iqCr2FJU7x6/pF27ZadhCbsrtc35Q=="
---

## Einleitung

Einen Minecraft-Server auf einem 1-Dollar-Mikrocontroller laufen lassen klingt wie ein Witz.

Ich stellte mir die Frage, und die Antwort ist ja. Buchstäblich.

Es gibt ein Projekt namens [Bareiron](https://github.com/p2r3/bareiron/), signiert p2r3, und es ist wahrscheinlich eines der faszinierendsten Projekte, die ich in den letzten Jahren in der Minecraft-Welt gesehen habe. Man redet von einem Binary, das in **300 Kilobyte** passt, **6800 Zeilen C**, null externe Abhängigkeiten, kein malloc, kein Threading, und es läuft auf einem **1-Dollar-ESP32**.

![ESP32-C3, der Mikrocontroller, der den Server laufen lässt](/images/bareiron/esp32-board.jpg)

Unendliche Terraingenerierung. Biome. Höhlen. Craften. Minen. Mobs. Hunger. Truhen. Alles, was du von einem Survival-Server erwartest.

Auf einem Chip, der **0.5 Watt** verbraucht und **160 MHz** Clock hat.

Zur Größenordnung: Ein Vanilla-Minecraft-Server braucht mehrere GB RAM. Der ESP32-C3 hat **520 KB SRAM** (400 verfügbar nach Boot). Prozessoren vor 20 Jahren liefen schon im Gigahertz, dieser cappt bei 160 MHz. Der Faktor zwischen beiden in purer Power ist etwa **20.000**.

p2r3 schrieb keinen Minecraft-Server in C, er erfand jeden Baustein des Servers neu, damit er in diese Constraints passt. Wir schauen wie, indem wir den Sourcecode öffnen.

![Thumbnail von p2r3s Bareiron-Präsentationsvideo](/images/bareiron/title-card.jpg)

## Das Gehirn des Projekts: speicherlose Terraingenerierung

Das größte Problem, wenn du einen eingebetteten MC-Server machen willst, ist Terraingenerierung.

In Vanilla-Minecraft wird die Welt mit **Perlin Noise** generiert: Mehrere überlagerte Schichten (Oktaven), 6 biomische Parameter (Temperatur, Feuchte, Kontinentalität, Erosion, Weirdness, Tiefe) und ein ganzes Caching-System, um nicht alles jedes Mal neu berechnen zu müssen.

Das Ergebnis ist wunderschön. Aber es ist rechenintensiv und braucht RAM, um generierte Chunks zu speichern.

Bareirons Ansatz ist radikal anders. Statt Noise zu stapeln, nutzt er **bilineare Interpolation** auf 4 von einem **deterministischen RNG** generierten Punkten.

Du weißt, wenn du ein kleines verpixeltes Bild vergrößerst und die Kanten verschwimmen? Genau das.

```c
// worldgen.c, Zeilen 117-171 (vereinfacht)

uint8_t interpolate (uint8_t a, uint8_t b, uint8_t c, uint8_t d, int x, int z) {
  uint16_t top    = a * (CHUNK_SIZE - x) + b * x;
  uint16_t bottom = c * (CHUNK_SIZE - x) + d * x;
  return (top * (CHUNK_SIZE - z) + bottom * z) / (CHUNK_SIZE * CHUNK_SIZE);
}

uint8_t getHeightAt (int x, int z) {
  int _x = floor(x / CHUNK_SIZE);  // Chunk-Koordinaten
  int _z = floor(z / CHUNK_SIZE);
  int rx = x % CHUNK_SIZE;          // Offset im Chunk
  int rz = z % CHUNK_SIZE;
  uint32_t hash = getChunkHash(_x, _z);
  uint8_t biome = getChunkBiome(_x, _z);
  // Interpolation zwischen 4 Ecken geseedet von Hash + Biom
  return getHeightAtFromHash(rx, rz, _x, _z, hash, biome);
}
```

Standard-bilineare Interpolation: 4 Ecken, Gewichte nach Position, ein einziges `uint8_t` Output. CHUNK_SIZE ist 8, also passiert das in Integer-Multiplikationen, kein Float.

p2r3 zeigt es Schritt für Schritt im Video: Erst die 4 Chunk-Ecken, jede mit einer vom RNG geseedeten Höhe.

![Die 4 Chunk-Ecken, jede geseedet vom deterministischen RNG](/images/bareiron/gen-four-corners.jpg)

Dann erzeugt die Interpolation zwischen diesen 4 Punkten eine kontinuierliche Oberfläche.

![Anwendung bilinearer Interpolation zwischen den 4 Ecken](/images/bareiron/gen-interpolate.jpg)

Und durch Wiederholen des Patterns auf allen angrenzenden Chunks erhält man ein Terrain, das sich ins Unendliche erstreckt.

![Endergebnis: kontinuierliches unregelmäßiges Terrain](/images/bareiron/gen-result.jpg)

### Der deterministische RNG

Der Schlüssel, der das alles möglich macht, ist das Seeding. Jeder Chunk hat 4 Ecken, und jede Ecke braucht einen einzigartigen aber reproduzierbaren Pseudozufallswert.

```c
// worldgen.c, Zeilen 13-22

uint32_t getChunkHash (short x, short z) {
  uint8_t buf[8];
  memcpy(buf, &x, 2);          // 16 Bit X-Koordinate
  memcpy(buf + 2, &z, 2);      // 16 Bit Z-Koordinate
  memcpy(buf + 4, &world_seed, 4);  // 32 Bit globale Seed
  return splitmix64(*((uint64_t *)buf));  // Hash
}
```

Er packt 16 Bit X, 16 Bit Z und 32 Bit Seed in einen 8-Byte-Buffer und schickt alles durch `splitmix64`. Ergebnis: Ein deterministischer einzigartiger Wert für jede Position, basierend auf der Welt-Seed.

Du kapierst die Power des Mechanismus? Der Server muss das Terrain nicht speichern. Er berechnet neu on the fly, wenn der Spieler in eine neue Zone kommt, und das gibt jedes Mal exakt dasselbe Ergebnis.

Das genutzte `splitmix64` ist ein ultraschneller PRNG designed für 64-bit-Hashes:

```c
// worldgen.c (vereinfacht)

static uint32_t splitmix64 (uint64_t state) {
  state += 0x9E3779B97F4A7C15ull;
  uint64_t z = state;
  z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ull;
  z = (z ^ (z >> 27)) * 0x94D049BB133111EBull;
  return (z ^ (z >> 31)) >> 32;
}
```

3 Operationen: Addition, Xor/Shift, Multiplikation, Xor/Shift, Multiplikation, Xor/Shift. Alles passt in direkte Operationen, ohne Tabelle oder Schleife. Es nimmt den 8-Byte-Buffer (X + Z + Seed), behandelt ihn wie eine 64-bit-Ganzzahl und gibt 32 Bit Hash zurück. Deterministisch, schnell, und passt in 5 Zeilen.

### Warum das kein Perlin Noise ist

p2r3 sagt es selbst im Video: "Je mehr Digits der Zufallszahl du hinzufügst, desto regelmäßiger wird das Terrain, wie mehr Münzwürfe dich näher an 50/50 bringen". In der Praxis ist es die Zahl der Hash-Bits, die er kombiniert:

```c
// worldgen.c, Zeilen 51-115

// Für Plains-Biom : 4 kombinierte Faktoren → regelmäßiges Terrain
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// Für Snowy Plains : 2 Faktoren → hügeliger
h = (hash % 5) + ((hash >> 4) % 5);
```

Jedes Biom wählt, wie viele Bit-Extraktionen es kombiniert. Je mehr, desto mehr stabilisiert sich die Verteilung, wie mehr Münzwürfe, die sich 50/50 annähern. Je weniger, desto stärker die lokalen Variationen.

![Unregelmäßiges Terrain, wenige Faktoren, starke Variationen](/images/bareiron/terrain-irregular.jpg)

Mit nur 2 Faktoren produziert Snowy Plains hügeliges, fast bergiges Terrain. Peaks und Täler sind häufig.

![Regelmäßiges Terrain, multiple Faktoren, glatte Oberfläche](/images/bareiron/terrain-regular.jpg)

Mit 4 Faktoren bleiben Plains flach und vorhersehbar. Die Verteilung stabilisiert sich.

Ein Chunk generiert sich in **200 ms** auf ESP32, gegen unmessbare Zeit auf selber Hardware mit Perlin Noise, so teuer ist es.

### Das Killer-Detail: einen Block abfragen ohne den ganzen Chunk zu generieren

Du spielst, du minst einen Block. Der Server muss wissen, welches Item er dir geben muss. Naiv müsste er dafür den ganzen Chunk generieren.

Mit bilinearer Interpolation fragst du **jeden Punkt** der Ebene direkt aus Koordinaten ab. Die Chunk-Ecken bekommt man aus der Spielerposition, die Interpolation gibt die Höhe bei jedem Offset. Eine Handvoll Matheoperationen, keine Chunk-Generierung.

p2r3: "Was ich will, ist eine magische Funktion, die mir sagen kann, welcher Block an einer gegebenen Koordinate ist, ohne auf Speicher zuzugreifen oder teure Noise-Maps zu berechnen". Exakt was er machte.

So wird Höhe zu konkreten Blöcken:

```c
// worldgen.c (vereinfacht)

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

5 Bedingungen. Eine Grass/Dirt/Stone/Deepslate/Bedrock-Schicht. Der Oberflächenblock hängt via `biome_top[]` vom Biom ab, Grass für Plains, Sand für Wüste. Eine simple If-Kaskade fällt in die richtige Schicht, was Schleife und Switch ersetzt.

### Die Höhlen, faulster Mirror

```c
Höhlenhöhe = CAVE_BASE_DEPTH - (Oberflächenhöhe - y);
```

Er mirrort die Oberflächenhöhe unter Erde. Sieht aus wie große Deepslate-Kavernen. Null Compute, eine Zeile.

![Durch Oberflächen-Terrain-Mirror generierte Höhlen](/images/bareiron/cave-mirror.jpg)

![Schema des Terrain-Mirrors zur Höhlengenerierung](/images/bareiron/cave-diagram.jpg)

### Die Erze, XOR-Version

```c
Kandidat = (chunk_x ^ col_x ^ col_z) % 100;
if (Kandidat < 5 && y < 16) -> Diamant
```

Ein Koordinaten-XOR garantiert einen Kandidaten pro Spalte. Der Typ hängt nur von der Höhe ab. Diamanten verstecken sich unter dem tiefsten Punkt der Höhlen, damit Graben nützlich bleibt.

### Die Biome als Tile Map

Jedes Biom ist eine kreisförmige Insel in einem Grid, sein Typ bestimmt von einem aus der Seed berechneten Pattern. Gegridet, vorhersehbar und gratis.

![Biomkarte als Tile Map, jede Insel ein anderes Biom](/images/bareiron/biome-tilemap.jpg)

Jedes Biom hat seinen eigenen Parametersatz kodiert in Tabellen:

```c
// worldgen.c (vereinfacht)

static const uint8_t biome_base[] = {
  [BIOME_PLAINS]  = 48,   // Basishöhe : 48
  [BIOME_DESERT]  = 52,   // etwas höher
  [BIOME_FOREST]  = 50,   // dazwischen
  [BIOME_TAIGA]   = 46,   // etwas tiefer
  [BIOME_SNOWY]   = 40,   // am tiefsten
};

static const uint8_t biome_top[] = {
  [BIOME_PLAINS]  = B_grass,
  [BIOME_DESERT]  = B_sand,
  [BIOME_FOREST]  = B_grass,
  [BIOME_TAIGA]   = B_grass,
  [BIOME_SNOWY]   = B_snow_block,
};

static const uint8_t biome_factors[] = {
  [BIOME_PLAINS]  = 4,   // 4 Extraktionen → sehr regelmäßig
  [BIOME_DESERT]  = 3,   // 3 Extraktionen → moderat
  [BIOME_FOREST]  = 4,   // 4 Extraktionen → regelmäßig, hügelig
  [BIOME_TAIGA]   = 3,   // 3 Extraktionen → moderat
  [BIOME_SNOWY]   = 2,   // 2 Extraktionen → sehr hügelig
};
```

**Plains**: Höhe 48, 4 Faktoren → sehr flaches Terrain, Gras.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// Ergebnis : Variation max ±4 Blöcke
```

**Desert**: Höhe 52, 3 Faktoren, Oberflächenblock = Sand. Nie unter Meeresspiegel.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3);
// Ergebnis : Variation max ±6 Blöcke, geclampt auf SEA_LEVEL+1
```

**Forest**: Höhe 50, 4 Faktoren wie Plains aber höhere Basis → bewaldete Hügel.

**Taiga**: Höhe 46, 3 Faktoren → moderate Variationen, kaltes Terrain.

**Snowy Plains**: Höhe 40, nur 2 Faktoren → am hügeligsten.

```c
h = (hash % 5) + ((hash >> 4) % 5);
// Ergebnis : Variation max ±14 Blöcke
```

Jedes Biom ist in **3 Tabellen zu 5 Einträgen** kodiert: Basishöhe, Oberflächenblock, Faktorenzahl. Wenn `getHeightAtFromHash` das Biom empfängt, konsultiert es diese Tabellen, um das Terrain anzupassen. 15 Byte Daten, um das ganze Vanilla-Minecraft-Biomsystem zu ersetzen.

Der Biomdetektor nutzt die Seed, um zu bestimmen, welches Biom zu jedem Chunk passt:

```c
// worldgen.c (vereinfacht)

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

Ein 16-Einträge-Pattern, ein von Chunk-Koordinaten geseedeter Index. Das gibt ein repetitives aber visuell kohärentes Grid. 4 Codezeilen, um das ganze biomische Vanilla-Minecraft-Parametersystem zu ersetzen.

### getHeightAtFromHash: der Terrain-Assembler

Die Kernfunktion der Generierung kombiniert die 4 biomgeseedeten Ecken:

```c
// worldgen.c (vereinfacht)

static uint8_t getHeightAtFromHash (int rx, int rz, short cx, short cz,
                                    uint32_t h, uint8_t biome) {
  // 4 Ecken aus Hash extrahiert, andere Seed pro Ecke
  uint8_t h1 = biome_base[biome] + (h & 0x0F);
  uint8_t h2 = biome_base[biome] + ((h >> 4) & 0x0F);
  uint8_t h3 = biome_base[biome] + ((h >> 8) & 0x0F);
  uint8_t h4 = biome_base[biome] + ((h >> 12) & 0x0F);

  // Biom-Bedingung : Wüste nie unter Wasser
  if (biome == BIOME_DESERT) {
    h1 = max(h1, SEA_LEVEL + 1);
    h2 = max(h2, SEA_LEVEL + 1);
    h3 = max(h3, SEA_LEVEL + 1);
    h4 = max(h4, SEA_LEVEL + 1);
  }

  // Interpolation aus den 4 Ecken
  return interpolate(h1, h2, h3, h4, rx, rz);
}
```

Jedes Biom hat eine `biome_base`, die die Referenzhöhe verschiebt, und die 4 Ecken werden mit verschiedenen Shifts aus dem Hash extrahiert. Die Wüste forct das Min über Meeresspiegel, eine Bedingungszeile, die Wasser ohne zusätzliche biomische Berechnung vermeidet.

### Bäume und Kakteen: probabilistisches Platzieren

Die Oberflächengenerierung nutzt denselben Chunk-Hash, um zu entscheiden, wo zu pflanzen:

```c
// worldgen.c (vereinfacht)

static void genFoliage (uint8_t *chunk_data, short cx, short cz,
                        uint32_t hash, uint8_t biome) {
  if (biome == BIOME_DESERT) {
    // Kaktus : ein Kandidat pro Chunk, Hash bestimmt Position
    int tx = (hash >> 8) & 7;
    int tz = (hash >> 12) & 7;
    int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
    if (chunk_data[ty * 64 + tz * 8 + tx] == B_sand)
      placeCactus(chunk_data, tx, ty + 1, tz);
  } else {
    // Bäume : Hash bestimmt ob und wo
    int tree_count = (hash & 3);  // 0-3 Bäume pro Chunk
    for (int i = 0; i < tree_count; i ++) {
      int tx = ((hash >> (4 + i * 4)) & 7);
      int tz = ((hash >> (6 + i * 4)) & 7);
      int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
      placeTree(chunk_data, tx, ty + 1, tz);
    }
  }
}
```

0-3 Bäume pro Chunk für grüne Biome, max 1 Kaktus für Wüste. Der Chunk-Hash ist die einzige Entropiequelle, ein `& 7` für Position im Chunk, ein `& 3` für Zähler. Alles deterministisch, nichts gespeichert.

### generateChunk: alles zusammensetzen

Die Funktion, die alles zusammenfügt, um einen kompletten 8×8×256-Block-Chunk zu produzieren:

```c
// worldgen.c (vereinfacht)

void generateChunk (uint8_t *chunk, short cx, short cz) {
  uint32_t hash = getChunkHash(cx, cz);
  uint8_t biome = getChunkBiome(cx, cz);

  // Für jede Chunk-Spalte (8×8 = 64)
  for (int x = 0; x < 8; x ++) {
    for (int z = 0; z < 8; z ++) {
      // Absolute Weltkoordinaten
      int wx = cx * 8 + x;
      int wz = cz * 8 + z;

      // Spaltenhöhe
      uint8_t height = getHeightAt(wx, wz);

      // Spalte von unten nach oben füllen
      for (int y = 0; y < height; y ++) {
        uint8_t block = getTerrainBlock(wx, y, wz);
        chunk[y * 64 + z * 8 + x] = block;
      }
    }
  }

  // Oberflächenelemente hinzufügen (Bäume, Kakteen)
  genFoliage(chunk, cx, cz, hash, biome);
}
```

Das ist alles. 3 verschachtelte Schleifen: Für jede Spalte Höhe finden, Blöcke füllen, weiter. Output ist ein `uint8_t[16384]` (8 × 8 × 256), das den kompletten Chunk darstellt. Der Chunk wird generiert und direkt an den Client geschickt, ohne Caching, Lazy Loading oder Kompression.

## Der Speicher: überall statische Arrays

Bareirons Speicherarchitektur ist eingebettetes C in voller Pracht: Nur globale fixgroße Tabellen, kein malloc, keine Hash Maps, keine Linked Lists.

### Die Blockänderungen

```c
// globals.h, Zeilen 191-196

typedef struct {
  short x;      // 2 Bytes, limitiert auf 32.000 horizontale Blöcke
  short z;      // 2 Bytes
  uint8_t y;    // 1 Byte, limitiert auf 256 vertikale Blöcke
  uint8_t block; // 1 Byte, limitiert auf 256 Blocktypen
} BlockChange;
```

20.000 Einträge, also etwa **25.000 Änderungen**, das Äquivalent von anderthalb komplett umgegrabenen Chunks. Das `block`-Feld auf `0xFF` markiert einen freien Eintrag. Suche ist linearer Scan:

![Speicherlayout der Blocktabelle, 6 Bytes pro Eintrag](/images/bareiron/memory-layout.jpg)

```c
// procedures.c

uint8_t getBlockChange (short x, uint8_t y, short z) {
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block == 0xFF) continue;
    if (block_changes[i].x == x && block_changes[i].y == y && block_changes[i].z == z)
      return block_changes[i].block;
    #ifdef ALLOW_CHESTS
      if (block_changes[i].block == B_chest) i += 14;  // Truhendaten überspringen
    #endif
  }
  return 0xFF;
}
```

Änderung hinzufügen ist so direkt wie Suche:

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

Ein Zähler, ein Index, ein Write. Die Tabelle stapelt nur: Kein Sortieren, keine Kompaktierung, kein Speichermanagement. Wenn die Tabelle voll ist, werden neue Änderungen ignoriert, das Terrain kehrt zu generiertem Zustand zurück.

Der Autorenkommentar zum 256-Block-Limit: "Ich habe nicht vor, die leicht patiniert gewachste Kupfertrappe so bald zu implementieren."

### Die Mobs: 8 Bytes pro Pipe-Kopf

```c
// globals.h, Zeilen 240-251 (pragma pack(push, 1) um Padding zu eliminieren)

typedef struct {
  uint8_t type;   // 25=Huhn, 28=Kuh, 95=Schwein, 106=Schaf, 145=Zombie
  short x;
  uint8_t y;      // wenn Health=0, wird Y Timer vor Löschung
  short z;
  uint8_t data;   // Bits 0-4 : Health, Bit 5 : Schaf geschoren, Bits 6-7 : Panik-Timer
} MobData;
```

8 Bytes. Max 16 Slots. Alignment und Padding fliegen raus. Das `data`-Byte ist ein Haus-Bitfield: 5 Bit Leben, 1 Bit Schur, 2 Bit Panik-Timer. Und wenn ein Mob stirbt, wird das Y-Feld Timer vor Löschung. Speichernutzung auf Bitebene.

### Die Spieler: eng gepackt

Spielerdaten nutzen auch `#pragma pack(push, 1)`, Koordinaten in `short` + `uint8_t`, Inventare in fixen `uint16_t`- + `uint8_t`-Tabellen, und ein `flags`-Feld, das zugleich Angriffs-Cooldown, Spawn-State, Sneak, Sprint, Eat, Load, Movement-Cooldown und Craft-Lock kodiert. Alles in individuellen Bits.

## Die Hauptschleife: while(true) und non-blocking

Der ganze Server läuft auf einer Schleife, einem Thread, null Event-Library.

```c
// main.c, Zeilen 594-720

while (true) {
  task_yield();  // lässt Watchdog auf ESP32 atmen

  // Neue Verbindung akzeptieren (non-blocking)
  for (int i = 0; i < MAX_PLAYERS; i ++) {
    if (clients[i] != -1) continue;
    clients[i] = accept(server_fd, ...);
    if (clients[i] != -1) client_count ++;
    break;
  }

  // Server-Tick wenn Zeit um
  if (get_program_time() - last_tick_time > TIME_BETWEEN_TICKS) {
    handleServerTick(time_since_last_tick);
    last_tick_time = get_program_time();
  }

  // Round-Robin : ein Client, ein Paket pro Iteration
  client_index = (client_index + 1) % MAX_PLAYERS;
  if (clients[client_index] == -1) continue;

  // Paket-Header lesen : Length + ID
  recv(client_fd, &recv_buffer, 2, MSG_PEEK);
  int length = readVarInt(client_fd);
  int packet_id = readVarInt(client_fd);
  handlePacket(client_fd, length - sizeVarInt(packet_id), packet_id, state);
}
```

Ein einziger Client wird pro Schleifeniteration behandelt, und ein einziges Paket auf einmal gelesen. Das `task_yield()` am Schleifenanfang lässt den FreeRTOS-Idle-Task auf ESP32 atmen, ohne das resettet dich der Watchdog-Timer den Chip.

Der Paket-Dispatch ist ein monströser **400-Zeilen**-Switch:

```c
// main.c, Zeilen 68-497

void handlePacket (int client_fd, int length, int packet_id, int state) {
  switch (packet_id) {
    case 0x00:  // Handshake / Status / Login je nach State
    case 0x01:  // Status-Ping
    case 0x02:  // Plugin-Message
    case 0x03:  // Login/Config-Acknowledgment
    case 0x08:  // Chat
    case 0x0B:  // Client-Status (Respawn)
    case 0x11:  // Click Container (handhabt Truhen)
    case 0x19:  // Interact Entity
    case 0x1D..0x20:  // Movement-Pakete (größter Fall)
    case 0x28:  // Player Action (Dig/Place)
    // ... 40+ Fälle
  }
}
```

Ein Switch kompiliert zu statischer Jump Table, was dynamische Jump Table, Vtable und Map ersetzt. Perfekt für Embedded.

Der `0x1D-0x20`-Fall ist der größte, er handhabt Positionsupdates, Fallschaden, Chunk-Grenzüberquerungen, Mob-Spawn, Chunk-Generierung UND Hunger. Alles in einem einzigen großen Fall-through.

![Der Bareiron-Servercode, 6800 Zeilen C](/images/bareiron/code-shot.jpg)

## Der Server-Tick und Mob-KI

Die `handleServerTick`-Funktion wird alle 50 ms aufgerufen (20 TPS). Sie handhabt die Welt, während die Hauptschleife sich um Spieler kümmert:

```c
// main.c (vereinfacht)

void handleServerTick (uint32_t delta) {
  // Jeden Mob updaten
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type == 0 || mobs[i].data == 0) continue;  // tot oder leer

    MobData *mob = &mobs[i];
    int px, pz;
    getNearestPlayer(mob->x, mob->z, &px, &pz);

    if (mob->type == MOB_ZOMBIE) {
      // Hostil : läuft zum nächsten Spieler
      if (px < mob->x) mob->x --;
      else if (px > mob->x) mob->x ++;
      if (pz < mob->z) mob->z --;
      else if (pz > mob->z) mob->z ++;
      // Kontaktschaden auf 2 Blöcke
      if (abs(px - mob->x) <= 2 && abs(pz - mob->z) <= 2)
        damagePlayer(getNearestPlayerId(mob->x, mob->z), 3);
    } else {
      // Passiv : 8 Zufallsrichtungen
      uint8_t dir = getMobDir(mob);
      mob->x += dir_lookup[dir][0];
      mob->z += dir_lookup[dir][1];
      // Richtungswechsel etwa alle 40 Ticks
      if (mob->data >> 6 < 1) setMobDir(mob, rand() & 7);
      mob->data = (mob->data & 0x3F) | ((mob->data - 0x40) & 0xC0);
    }

    // Chunks um Mob wecken
    setChunkGenerated(mob->x / 8, mob->z / 8);
  }
}
```

Hostile Mob-KI ist ein Koordinatenvergleich. Buchstäblich `if (px < x) x--`. Der Zombie ignoriert Pathfinding, A* und Obstacle Avoidance: Er justiert X und Z unabhängig zum Spieler, er läuft durch Wände, wenn welche da sind.

Kontaktschaden ist 3 Herzen/Sek. p2r3 wollte ihn hoch, weil fehlendes Pathfinding Zombies leicht kitbar macht.

Die Rüstungsformel ist die von vor dem Combat Update, die simpelstmögliche:

```c
// main.c (vereinfacht)

static uint8_t applyArmor (uint8_t damage, uint16_t armor_value) {
  // Prä-1.9-Formel : lineare Reduktion
  // Jeder Rüstungspunkt = 4% Reduktion, max 80%
  uint8_t reduction = (armor_value * 4);
  if (reduction > 80) reduction = 80;
  return damage * (100 - reduction) / 100;
}
```

Full Diamond = 80% Reduktion. Ein 3-Herzen-Zombieschlag wird 0.6 Herzen. p2r3 wählte diese alte Formel, weil sie sich in 2 Operationen berechnet, keine Schwellen, keine Kurven, nur linearer Prozentsatz.

Passive Mobs: 8 Richtungen in einer Lookup-Table, Kurswechsel etwa alle 40 Ticks. Das `data`-Feld kodiert die laufende Richtung in den 2 hochwertigen Bits und den Richtungswechsel-Timer in den 6 restlichen Bits.

![Mobs in Bareiron, Zombies, Schweine, Schafe](/images/bareiron/mobs.jpg)

### Der Mob-Respawn

Mobs spawnen nicht mit Random Ticks. Sie erscheinen, wenn der Server-Tick auf eine neue Chunk-Grenze trifft:

```c
if (player crossed chunk boundary) {
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type != 0) continue;
    spawnMob(&mobs[i], new_chunk_coords, getChunkHash(cx, cz));
    break;
  }
}
```

Derselbe RNG wie Terrain, dieselbe Chunk-Seed. Wenn ein Mob-Slot frei ist, ist der Spawn deterministisch.

## Das Craften: keine Matrizen, if/else

```c
// crafting.c, Zeilen 9-347 (vereinfacht)

void getCraftingOutput (PlayerData *player, uint8_t *count, uint16_t *item) {
  // Wenn Flag 0x80 gesetzt, wird Craft-Buffer von Truhe benutzt
  if (player->flags & 0x80) { *count = 0; *item = 0; return; }

  // Slots zählen, erstes Item finden, Identität prüfen
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
    case 1:  /* Bretter, Barren... */
    case 2:  /* Stöcke, Scheren, Fackeln */
    case 3:  /* Schaufeln, Schwerter, Stufen */
    case 4:  /* Werktisch, Boots */
    case 5:  /* Spitzhacken, Äxte, Helme */
    case 7:  /* Beinschienen, Komposter */
    case 8:  /* Ofen, Truhe, Brustpanzer */
    case 9:  /* komplette Blöcke (Eisen, Gold usw.) */
  }
}
```

Der erste Check: Wenn Flag `0x80` gesetzt, wird Craft-Buffer als Truhenpointer recycelt. Craften bleibt verriegelt.

Danach zählt er gefüllte Slots, notiert erstes Item, prüft Identität. Schon damit matchst du den Ofen in 4 Checks:

```c
if (count == 8 && first == cobblestone && all_identical && center_empty)
    return furnace;
```

Für komplexe Formen nutzt er den Erst-Item-Index und prüft relative Position. Rezepte teilen dieselbe Matching-Funktion, das Material bestimmt Ergebnis.

![Craft- und Truheninterface in Bareiron](/images/bareiron/crafting.jpg)

## Die Truhen: der Hack live

Der Speichern-Hack, über den alle reden, in echtem Code:

```c
// procedures.c, Zeilen 1262-1293

if (target == B_chest) {
  // Truheneintrag in Blocktabelle suchen
  uint8_t *storage_ptr = NULL;
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block != B_chest) continue;
    if (block_changes[i].x != x || block_changes[i].y != y || block_changes[i].z != z)
      continue;
    storage_ptr = (uint8_t *)(&block_changes[i + 1]);  // zeigt hinter Truhenblock
    break;
  }
  if (storage_ptr == NULL) return;

  // Terrible memory hack!!
  // Wir kopieren den POINTER in das Spieler-Craft-Item-Array
  memcpy(player->craft_items, &storage_ptr, sizeof(storage_ptr));
  player->flags |= 0x80;  // verriegelt Craften

  // Truheninterface an Client schicken
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

Und der Kommentar im Code: `// Terrible memory hack!!1!`

Genau das. Er nimmt die Speicheradresse des folgenden Eintrags in `block_changes[]`, kopiert sie in `player->craft_items` (das ein `uint16_t[9]` ist, also 18 Bytes, genug um einen 32-bit-Pointer zu speichern), und hebt das Flag, damit niemand währenddessen craftet.

Bei jedem Klick in Truheninventar:

```c
// packets.c, Zeilen 620-638

uint8_t *storage_ptr;
memcpy(&storage_ptr, player->craft_items, sizeof(storage_ptr));
// storage_ptr zeigt jetzt auf Truhendaten
uint16_t *p_item = (uint16_t *)(storage_ptr + (slot - 41) * 3);
uint8_t *p_count = storage_ptr + (slot - 41) * 3 + 2;
```

Er holt den Pointer aus dem Craft-Buffer zurück und greift per Offset auf Slots zu. Truhendaten liegen zu 3 Bytes pro Slot (2 für ID, 1 für Menge), aneinandergeklebt in der Blocktabelle.

![In Blocktabelle gespeicherte Truhendaten, ein Speichern-Hack](/images/bareiron/chest-hack.jpg)

## Der Hunger: 5 Zeilen Genie

```c
// main.c, Zeilen 293-305

// Spieler schicken Bewegungspakete ~20/Sek wenn sie
// sich bewegen, viel weniger wenn sie stillstehen. Man korreliert das
// mit Aktivität, um Hunger gratis zu simulieren.
if (player->saturation == 0) {
  if (player->hunger > 0) player->hunger--;
  player->saturation = 200;
  sc_setHealth(client_fd, player->health, player->hunger, player->saturation);
} else if (player->flags & 0x08) {  // Sprinten
  player->saturation -= 1;
}
}
```

Buchstäblich das. 5 Zeilen. Jedes Bewegungspaket dekrementiert Sättigung. Wenn Sättigung null erreicht, sinkt Hunger und man resettet Sättigung. Sprint (Flag `0x08`) verdoppelt Drain.

Null Timer, null allokierter Speicher, null dediziertes Compute. Ein Zähler, der auf eh existierenden Paketen dekrementiert.

### Der Fallschaden

Das simpelste Schadenssystem des Projekts:

```c
// Wenn Spieler Boden verlässt, speichert man sein Y
// Wenn er Boden wieder berührt, subtrahiert man
Schaden = letztes_y_am_Boden - aktuelles_y;
```

Eine Subtraktion.

## Blöcke minen und platzieren

Wenn du auf einen Block klickst, landet das `0x28`-Paket (Player Action) im Switch. Der Handler muss bestimmen, welcher Block an der Position ist, ihn entfernen und das Item ins Inventar legen:

```c
// main.c, Fall 0x28 (vereinfacht)

void handlePlayerAction (int client_fd, uint8_t action, int x, uint8_t y, int z) {
  switch (action) {
    case START_DESTROY_BLOCK: {
      // Blocktyp an geklickter Position bestimmen
      uint8_t block = getBlockAt(x, y, z);

      if (block == B_chest) {
        openChest(client_fd, x, y, z);
        break;
      }

      // Zu block_changes hinzufügen
      addBlockChange(x, z, y, 0);  // 0 = Luft

      // Item an Spieler geben (trust the client)
      addItemToPlayer(client_fd, block_to_item(block), 1);

      // Update an Client schicken
      sc_blockChange(client_fd, x, y, z, 0);
      sc_ackBlockChange(client_fd, x, y, z, 0);
      break;
    }
    case PLACE_BLOCK: {
      // Blocktyp aus Spielerhand lesen
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

`getBlockAt` kombiniert Terraingenerierung UND Spieleränderungen:

```c
uint8_t getBlockAt (int x, uint8_t y, int z) {
  // Zuerst Spieleränderungen prüfen
  uint8_t change = getBlockChange(x, y, z);
  if (change != 0xFF) return change;

  // Sonst aus generiertem Terrain lesen
  return getTerrainBlock(x, y, z);
}
```

Priorität auf Änderungen, Fallback auf Terrain. Null Debatte, null Cache, null Overhead. Das `getTerrainBlock` darunter ist `getHeightAt` + Stone/Dirt/Grass/Coal-Schichten.

### Der Instant-Ofen

Das Lustigste: Der Ofen existiert nicht als Entity. Wenn du Cobblestone in den "Koch"-Slot und Coal in "Fuel" legst, erscheint das Ergebnis sofort, ohne Timer oder Chunk Ticking: Es ist nur ein Inventarslot, der sich leert, wenn du die richtigen Items legst.

![Instant-Ofen, Zutaten reinlegen, sofortiges Ergebnis](/images/bareiron/furnace.jpg)

## Die ESP32-Schleife: ein MC-Server in 4 KB Stack

```c
// main.c, Zeilen 732-779

#ifdef ESP_PLATFORM

void bareiron_main (void *pvParameters) {
  main();
  vTaskDelete(NULL);
}

static void wifi_event_handler (...) {
  if (/* verbunden */) {
    xTaskCreate(bareiron_main, "bareiron", 4096, NULL, 5, NULL);
  }
}

void app_main () {
  esp_timer_early_init();
  wifi_init();
  // Rest handhabt Event Handler
}
#endif
```

Der ganze Server läuft in einem FreeRTOS-Task mit **4096 Bytes Stack**. Das ist alles. Der Main-Thread initialisiert nur WiFi und wartet auf Verbindung. Einmal verbunden, spawnt er `bareiron_main`, das das Standard-`main()` aufruft.

Aller ESP32-spezifische Code ist von `#ifdef ESP_PLATFORM` geschützt. Auf PC kompiliert das alles zu Standard-POSIX-Code.

## Was geopfert wurde

Damit das alles passt, gibt es Vanilla-Features, die nicht existieren:

- **Null Netzwerkkompression**, zlib zu teuer. Der Server generiert Chunks schnell, aber sie zu schicken ist Bottleneck.
- **Null Random Ticks**, Bäume wachsen mit Bone Meal oder nicht. Mobs spawnen an Chunk-Grenzen.
- **Null Item-Entity**, geminte Blöcke gehen direkt ins Inventar. Animation ist rein visuell.
- **Keine Inventarprüfung**, trust the client. 64 Diamanten? OK. Ein Chunk in 1 Sek gemint? OK. Unter vertrauenswürdigen Leuten nutzen.
- **Null Serverlicht**, Fackeln werden nach allem Rest geschickt, der Client berechnet.
- **Null progressive Fluide**, instantaner Endzustand.

## Das Endergebnis

Ryzen 5 3600: ~0.5 ms pro Chunk.
1$-ESP32-C3: ~200 ms pro Chunk. Spielbar.

![Chunk-Generierungs-Benchmark, Ryzen vs ESP32](/images/bareiron/performance.jpg)

3+ Spieler: Es ruckelt. Vergleichbar mit 2b2t zu Stoßzeiten, laut Autor.

![Mehrere Spieler auf demselben Bareiron-Server verbunden](/images/bareiron/multiplayer.jpg)

## Die Philosophie

p2r3: "Ich mag einfach die Idee, dass dieser winzige 1-Balles-Chip, der 0.5 Watt verbraucht, etwas so Fortgeschrittenes wie Minecraft laufen lassen kann. Science isn't about 'why', it's about 'why not'."

Jede Zeile ist ein Tradeoff:
- Perlin Noise → Interpolation: Weniger hübsch, 200x schneller, null Speicher
- Craft-Matrizen → hardcoded Matching: Hässlicher Code, null Byte
- zlib → nichts: Miese Verbindung = tot, aber spielbar
- Validierung → Trust: Null Sicherheit, null Compute

Jedes fehlende Feature erlaubt einem anderen, in Hardware-Limits zu existieren.

**Die 3 Punkte zum Mitnehmen :**

1. **Interpolation + RNG**, 4 geseedete Punkte, unendliches Terrain, null Speicherung, Query ohne Chunk-Regenerierung, 200 ms Generierung. Der Genie-Move, der alles andere erst möglich macht.
2. **Jedes Feature hat Kosten**, fehlende Kompression, Random Ticks und Validierung sind eingestandene Wahl: Das erlaubt, in 520 KB zu passen.
3. **Eklige Hacks sind die cleversten**, Truhen in Blocktabelle via memcpy, Hunger via Bewegungspakete, Instant-Ofen. Die saubere Lösung wäre zu teuer gewesen.

Wenn dich das Projekt interessiert, alles liegt auf [GitHub unter GPLv3](https://github.com/p2r3/bareiron/). Saumäßig dreckiges C, und ich hatte selten so viel Spaß beim Lesen von Sourcecode.
