---
title: Bareiron -- der Minecraft-Server auf einem 1$-Mikrocontroller
description: 6800 Zeilen C, null malloc, Perlin Noise ersetzt durch bilineare
  Interpolation, Biome als Tilemap, und das alles auf einem 1$-Chip.
date: 2026-05-30
tags:
  - minecraft
  - reverse-engineering
  - embedded
  - c
  - esp32
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "iE9/knyViDrW1otzT/5o1x8ZYPpWPOZS7I2zeb7JA+nXsjnBABUaUSMESL4C2h4sjI93U4PoByQlITpdFsbfjQ=="
---

## Einleitung

Hast du dich jemals gefragt, ob man einen Minecraft-Server auf einem 1$-Mikrocontroller laufen lassen kann?

Ich schon. Und die Antwort ist ja. Wirklich.

Es gibt ein Projekt namens [Bareiron](https://github.com/p2r3/bareiron/), von p2r3, und es ist wahrscheinlich eines der faszinierendsten Projekte, die ich in den letzten Jahren in der Minecraft-Welt gesehen habe. Wir reden von einer Binary, die in **300 Kilobyte** passt, **6800 Zeilen C**, null externe Abhängigkeiten, kein malloc, kein Threading, und das läuft auf einer **ESP32 für 1 Dollar**.

![ESP32-C3, der Mikrocontroller, der den Server antreibt](/images/bareiron/esp32-board.jpg)

Unendliche Terrain-Generierung. Biome. Höhlen. Crafting. Mining. Mobs. Hunger. Truhen. Alles, was du von einem Survival-Server erwartest.

Auf einem Chip, der **0.5 Watt** verbraucht und **160 MHz** Takt hat.

Zur Einordnung: Ein Vanilla-Minecraft-Server braucht mehrere Gigabyte RAM. Der ESP32-C3 hat **520 KB SRAM** (400 verfügbar nach dem Booten). Prozessoren vor 20 Jahren takteten schon im Gigahertz-Bereich -- dieser hier erreicht maximal 160 MHz. Der reine Leistungsfaktor zwischen beiden liegt bei etwa **20.000**.

p2r3 hat nicht einfach einen Minecraft-Server in C geschrieben, er hat jeden Baustein des Servers neu erfunden, damit alles in diese Grenzen passt. Lass uns mal reinschauen, wie er das gemacht hat -- im Quellcode.

![Vorschaubild des Präsentationsvideos von Bareiron von p2r3](/images/bareiron/title-card.jpg)

## Das Gehirn des Projekts: Terrain-Generierung ohne Speicher

Das größte Problem, wenn du einen eingebetteten MC-Server bauen willst, ist die Terrain-Generierung.

In Minecraft Vanilla wird die Welt mit **Perlin Noise** generiert: mehrere übereinandergelegte Schichten (Oktaven), 6 biomische Parameter (Temperatur, Feuchtigkeit, Kontinentalität, Erosion, Weirdness, Tiefe) und ein ganzes Caching-System, um nicht alles jedes Mal neu berechnen zu müssen.

Das Ergebnis ist wunderschön. Aber es ist rechenintensiv und braucht RAM, um die generierten Chunks zu speichern.

Bareirons Ansatz ist radikal anders. Statt Noise zu stapeln, verwendet es **bilineare Interpolation** über 4 Punkte, die von einem **deterministischen RNG** erzeugt werden.

Kennst du das, wenn du ein kleines verpixeltes Bild vergrößerst und die Kanten verschwimmen? Genau das ist es.

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
  int rx = x % CHUNK_SIZE;          // Offset innerhalb des Chunks
  int rz = z % CHUNK_SIZE;
  uint32_t hash = getChunkHash(_x, _z);
  uint8_t biome = getChunkBiome(_x, _z);
  // Interpolation zwischen 4 Ecken, geseedet durch Hash + Biome
  return getHeightAtFromHash(rx, rz, _x, _z, hash, biome);
}
```

Standard-Bilineare Interpolation: 4 Ecken, Gewichte je nach Position, ein einziger `uint8_t` als Ausgabe. CHUNK_SIZE ist 8, also läuft das mit ganzzahligen Multiplikationen, kein Float.

p2r3 zeigt es Schritt für Schritt im Video: zuerst die 4 Ecken des Chunks, jede mit einer durch den RNG geseedeten Höhe.

![Die 4 Ecken des Chunks, jede durch den deterministischen RNG geseedet](/images/bareiron/gen-four-corners.jpg)

Dann erzeugt die Interpolation zwischen diesen 4 Punkten eine durchgehende Oberfläche.

![Anwendung der bilinearen Interpolation zwischen den 4 Ecken](/images/bareiron/gen-interpolate.jpg)

Und indem man das Muster auf allen benachbarten Chunks wiederholt, erhält man ein Terrain, das sich ins Unendliche erstreckt.

![Endergebnis: durchgehendes unregelmäßiges Gelände](/images/bareiron/gen-result.jpg)

### Der deterministische RNG

Der Schlüssel, der das alles möglich macht, ist das Seeding. Jeder Chunk hat 4 Ecken, und jede Ecke braucht einen eindeutigen, aber reproduzierbaren Pseudozufallswert.

```c
// worldgen.c, Zeilen 13-22

uint32_t getChunkHash (short x, short z) {
  uint8_t buf[8];
  memcpy(buf, &x, 2);          // 16 Bit X-Koordinate
  memcpy(buf + 2, &z, 2);      // 16 Bit Z-Koordinate
  memcpy(buf + 4, &world_seed, 4);  // 32 Bit globaler Seed
  return splitmix64(*((uint64_t *)buf));  // Hash
}
```

Es packt die 16 Bit von X, 16 Bit von Z und 32 Bit Seed in einen 8-Byte-Puffer und gibt das Ganze durch `splitmix64`. Ergebnis: ein deterministischer, eindeutiger Wert für jede Position, basierend auf dem Welt-Seed.

Checkst du, wie mächtig das ist? Der Server muss das Terrain nicht speichern. Er berechnet es in Echtzeit nach, sobald der Spieler in eine neue Zone kommt, und es liefert jedes Mal exakt das gleiche Ergebnis.

Das verwendete `splitmix64` ist ein ultraschneller PRNG, der für 64-Bit-Hashes entwickelt wurde:

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

3 Operationen: Addition, XOR/Shift, Multiplikation, XOR/Shift, Multiplikation, XOR/Shift. Keine Lookup-Tabelle, keine Schleife. Es nimmt den 8-Byte-Puffer (X + Z + Seed), behandelt ihn als 64-Bit-Integer und gibt 32 Bit Hash zurück. Deterministisch, schnell, und in 5 Zeilen.

### Warum das kein Perlin Noise ist

p2r3 sagt es selbst im Video: "Je mehr Digits der Zufallszahl du hinzufügst, desto regelmäßiger wird das Terrain, so wie mehr Münzwürfe dich 50/50 annähern." In der Praxis ist es die Anzahl der Hash-Bits, die er kombiniert:

```c
// worldgen.c, Zeilen 51-115

// Für ein Plains-Biom: 4 kombinierte Faktoren → gleichmäßiges Gelände
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// Für verschneite Ebenen: 2 Faktoren → unebener
h = (hash % 5) + ((hash >> 4) % 5);
```

Jedes Biom wählt, wie viele Bit-Extraktionen es kombiniert. Je mehr, desto stabiler wird die Verteilung -- wie mehr Münzwürfe, die sich 50/50 annähern. Je weniger, desto stärker die lokalen Variationen.

![Unregelmäßiges Gelände -- wenige Faktoren, starke Schwankungen](/images/bareiron/terrain-irregular.jpg)

Mit nur 2 Faktoren erzeugen die verschneiten Ebenen ein hügeliges, fast bergiges Gelände. Spitzen und Täler sind häufig.

![Regelmäßiges Gelände -- viele Faktoren, glatte Oberfläche](/images/bareiron/terrain-regular.jpg)

Mit 4 Faktoren bleiben die Ebenen flach und vorhersagbar. Die Verteilung stabilisiert sich.

Ein Chunk wird in **200 ms** auf dem ESP32 generiert -- im Vergleich zu einer nicht messbaren Zeit auf derselben Hardware mit Perlin Noise, weil es so teuer ist.

### Das Killer-Detail: einen Block abfragen, ohne den ganzen Chunk zu generieren

Du spielst, du baust einen Block ab. Der Server muss wissen, welches Item er dir geben soll. Naiv müsste man dafür den ganzen Chunk generieren.

Mit der bilinearen Interpolation kannst du **jeden beliebigen Punkt** der Ebene direkt aus den Koordinaten abfragen. Die Chunk-Ecken werden von der Spielerposition abgeleitet, die Interpolation liefert die Höhe an jedem beliebigen Offset. Eine Handvoll mathematischer Operationen, keine Chunk-Generierung.

p2r3: "Was ich will, ist eine magische Funktion, die mir sagen kann, welcher Block sich an einer bestimmten Koordinate befindet, ohne auf Speicher zuzugreifen oder teure Noise-Maps zu berechnen." Genau das hat er gebaut.

So wird aus der Höhe ein konkreter Block:

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

5 Bedingungen. Eine Schicht Grass/Dirt/Stone/Deepslate/Bedrock. Der Oberflächenblock hängt vom Biom ab, über `biome_top[]` -- Gras für die Ebene, Sand für die Wüste. Keine Schleife, kein Switch, eine Kaskade von Ifs, die in die richtige Schicht fällt.

### Höhlen, der faulste Mirror

```c
altitude_grotte = CAVE_BASE_DEPTH - (hauteur_surface - y);
```

Er spiegelt die Oberflächenhöhe unter die Erde. Das ergibt große Deepslate-Kavitäten. Null Rechenaufwand, eine Zeile.

![Durch Spiegelung des Oberflächengeländes generierte Höhlen](/images/bareiron/cave-mirror.jpg)

![Diagramm der Geländespiegelung zur Höhlengenerierung](/images/bareiron/cave-diagram.jpg)

### Erze, XOR-Version

```c
candidat = (chunk_x ^ col_x ^ col_z) % 100;
if (candidat < 5 && y < 16) -> diamond
```

Ein XOR der Koordinaten garantiert einen Kandidaten pro Säule. Der Typ hängt nur von der Höhe ab. Diamanten sind unter dem tiefsten Punkt der Höhlen versteckt, damit Graben sinnvoll bleibt.

### Biome als Tilemap

Jedes Biom ist eine kreisförmige Insel in einem Raster, sein Typ bestimmt durch ein aus dem Seed berechnetes Muster. Gerastert, vorhersagbar und kostenlos.

![Biomkarte als Tilemap -- jede Insel ist ein anderes Biom](/images/bareiron/biome-tilemap.jpg)

Jedes Biom hat seinen eigenen Parametersatz, kodiert in Arrays:

```c
// worldgen.c (vereinfacht)

static const uint8_t biome_base[] = {
  [BIOME_PLAINS]  = 48,   // Basishöhe: 48
  [BIOME_DESERT]  = 52,   // etwas höher
  [BIOME_FOREST]  = 50,   // dazwischen
  [BIOME_TAIGA]   = 46,   // etwas niedriger
  [BIOME_SNOWY]   = 40,   // am niedrigsten
};

static const uint8_t biome_top[] = {
  [BIOME_PLAINS]  = B_grass,
  [BIOME_DESERT]  = B_sand,
  [BIOME_FOREST]  = B_grass,
  [BIOME_TAIGA]   = B_grass,
  [BIOME_SNOWY]   = B_snow_block,
};

static const uint8_t biome_factors[] = {
  [BIOME_PLAINS]  = 4,   // 4 Extraktionen → sehr gleichmäßig
  [BIOME_DESERT]  = 3,   // 3 Extraktionen → moderat
  [BIOME_FOREST]  = 4,   // 4 Extraktionen → gleichmäßig, hügelig
  [BIOME_TAIGA]   = 3,   // 3 Extraktionen → moderat
  [BIOME_SNOWY]   = 2,   // 2 Extraktionen → sehr uneben
};
```

**Plains**: Höhe 48, 4 Faktoren → sehr flaches Gelände, Gras.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// Ergebnis: maximal ±4 Blöcke Variation
```

**Desert**: Höhe 52, 3 Faktoren, Oberflächenblock = Sand. Niemals unter dem Meeresspiegel.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3);
// Ergebnis: maximal ±6 Blöcke Variation, auf SEA_LEVEL+1 begrenzt
```

**Forest**: Höhe 50, 4 Faktoren wie Plains, aber höhere Basis → bewaldete Hügel.

**Taiga**: Höhe 46, 3 Faktoren → moderate Variationen, kaltes Gelände.

**Snowy plains**: Höhe 40, nur 2 Faktoren → am unebensten.

```c
h = (hash % 5) + ((hash >> 4) % 5);
// Ergebnis: maximal ±14 Blöcke Variation
```

Jedes Biom ist in **3 Arrays mit je 5 Einträgen** kodiert: Basishöhe, Oberflächenblock, Anzahl Faktoren. Wenn `getHeightAtFromHash` das Biom erhält, greift es auf diese Arrays zu, um das Gelände anzupassen. 15 Bytes Daten, um das gesamte Biom-System von Minecraft zu ersetzen.

Der Biom-Detektor verwendet den Seed, um zu bestimmen, welches Biom zu welchem Chunk gehört:

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

Ein Muster mit 16 Einträgen, ein Index, der durch die Chunk-Koordinaten geseedet wird. Das ergibt ein sich wiederholendes, aber visuell konsistentes Raster. 4 Zeilen Code, um das gesamte Biom-Parametersystem von Minecraft Vanilla zu ersetzen.

### getHeightAtFromHash: Der Gelände-Assembler

Die Funktion im Herzen der Generierung kombiniert die 4 biom-geseedeten Ecken:

```c
// worldgen.c (vereinfacht)

static uint8_t getHeightAtFromHash (int rx, int rz, short cx, short cz,
                                    uint32_t h, uint8_t biome) {
  // 4 Ecken aus dem Hash extrahiert, unterschiedlicher Seed pro Ecke
  uint8_t h1 = biome_base[biome] + (h & 0x0F);
  uint8_t h2 = biome_base[biome] + ((h >> 4) & 0x0F);
  uint8_t h3 = biome_base[biome] + ((h >> 8) & 0x0F);
  uint8_t h4 = biome_base[biome] + ((h >> 12) & 0x0F);

  // Biome-Einschränkung: Wüste nie unter Wasser
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

Jedes Biom hat eine `biome_base`, die die Referenzhöhe verschiebt, und die 4 Ecken werden mit unterschiedlichen Offsets aus dem Hash extrahiert. Die Wüste erzwingt ein Minimum über dem Meeresspiegel -- eine einzige Einschränkungszeile, die Wasser ohne zusätzliche biomische Berechnung vermeidet.

### Bäume und Kakteen: probabilistische Platzierung

Die Oberflächengenerierung verwendet denselben Chunk-Hash, um zu entscheiden, wo gepflanzt wird:

```c
// worldgen.c (vereinfacht)

static void genFoliage (uint8_t *chunk_data, short cx, short cz,
                        uint32_t hash, uint8_t biome) {
  if (biome == BIOME_DESERT) {
    // Kaktus: ein Kandidat pro Chunk, Hash bestimmt Position
    int tx = (hash >> 8) & 7;
    int tz = (hash >> 12) & 7;
    int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
    if (chunk_data[ty * 64 + tz * 8 + tx] == B_sand)
      placeCactus(chunk_data, tx, ty + 1, tz);
  } else {
    // Bäume: Hash bestimmt, ob und wo platziert wird
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

0-3 Bäume pro Chunk für grüne Biome, maximal 1 Kaktus für die Wüste. Der Chunk-Hash ist die einzige Entropiequelle -- ein `& 7` für die Position im Chunk, ein `& 3` für den Zähler. Alles deterministisch, nichts wird gespeichert.

### generateChunk: Alles zusammenfügen

Die Funktion, die alles zusammensetzt, um einen kompletten 8×8×256-Chunk zu produzieren:

```c
// worldgen.c (vereinfacht)

void generateChunk (uint8_t *chunk, short cx, short cz) {
  uint32_t hash = getChunkHash(cx, cz);
  uint8_t biome = getChunkBiome(cx, cz);

  // Für jede Spalte des Chunks (8×8 = 64)
  for (int x = 0; x < 8; x ++) {
    for (int z = 0; z < 8; z ++) {
      // Absolute Weltkoordinaten
      int wx = cx * 8 + x;
      int wz = cz * 8 + z;

      // Höhe der Spalte
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

Das war's. 3 verschachtelte Schleifen: für jede Spalte die Höhe finden, Blöcke füllen, weiter zur nächsten. Die Ausgabe ist ein `uint8_t[16384]` (8 × 8 × 256), der den kompletten Chunk repräsentiert. Kein Caching, kein Lazy Loading, keine Kompression -- der Chunk wird generiert und direkt an den Client gesendet.

## Speicher: Überall statische Arrays

Die Speicherarchitektur von Bareiron ist Embedded-C in seiner ganzen Pracht. Kein malloc, keine Hashmaps, keine verketteten Listen.

Alles befindet sich in globalen Arrays mit fester Größe.

### Die Block-Änderungen

```c
// globals.h, Zeilen 191-196

typedef struct {
  short x;      // 2 Bytes -- begrenzt auf 32.000 Blöcke horizontal
  short z;      // 2 Bytes
  uint8_t y;    // 1 Byte -- begrenzt auf 256 Blöcke vertikal
  uint8_t block; // 1 Byte -- begrenzt auf 256 Blocktypen
} BlockChange;
```

20.000 Einträge, also etwa **25.000 Änderungen** -- das entspricht eineinhalb komplett ausgegrabenen Chunks. Das Feld `block` mit `0xFF` markiert einen freien Eintrag. Die Suche ist ein linearer Scan:

![Speicherlayout des Block-Arrays -- 6 Bytes pro Eintrag](/images/bareiron/memory-layout.jpg)

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

Das Hinzufügen einer Änderung ist genauso direkt wie die Suche:

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

Ein Zähler, ein Index, ein Schreibvorgang. Kein Sortieren, keine Kompaktierung, keine Speicherverwaltung. Wenn das Array voll ist, werden neue Änderungen ignoriert -- das Gelände kehrt in seinen generierten Zustand zurück.

Der Kommentar des Autors zur 256-Block-Grenze: "Ich habe nicht vor, in absehbarer Zeit leicht angerostete, gewachste Kupfertreppen zu implementieren."

### Mobs: 8 Bytes pro Nase

```c
// globals.h, Zeilen 240-251 (pragma pack(push, 1) zum Eliminieren von Padding)

typedef struct {
  uint8_t type;   // 25=chicken, 28=cow, 95=pig, 106=sheep, 145=zombie
  short x;
  uint8_t y;      // wenn health=0, wird Y zum Timer vor Löschung
  short z;
  uint8_t data;   // Bits 0-4: health, Bit 5: sheep sheared, Bits 6-7: panic timer
} MobData;
```

8 Bytes. Maximal 16 Plätze. Keine Ausrichtung, kein Padding. Das `data`-Byte ist ein selbstgebautes Bitfeld: 5 Bit Leben, 1 Bit geschoren, 2 Bit Panik-Timer. Und wenn ein Mob stirbt, wird das Y-Feld zu einem Timer vor der Löschung. Bit-Level-Speicherwiederverwendung.

### Spieler: Dicht gepackt

Die Spielerdaten verwenden auch `#pragma pack(push, 1)` -- Koordinaten als `short` + `uint8_t`, Inventare als feste Arrays von `uint16_t` + `uint8_t`, und ein `flags`-Feld, das gleichzeitig den Angriffs-Cooldown, Spawn-Status, Schleichen, Sprinten, Essen, Laden, Bewegungs-Cooldown und Craft-Sperre kodiert. Alles in einzelnen Bits.

## Die Hauptschleife: while(true) und nicht-blockierend

Der gesamte Server läuft in einer Schleife, einem Thread, null Event-Library.

```c
// main.c, Zeilen 594-720

while (true) {
  task_yield();  // lässt den Watchdog auf dem ESP32 atmen

  // Neue Verbindung annehmen (nicht-blockierend)
  for (int i = 0; i < MAX_PLAYERS; i ++) {
    if (clients[i] != -1) continue;
    clients[i] = accept(server_fd, ...);
    if (clients[i] != -1) client_count ++;
    break;
  }

  // Server-Tick, wenn die Zeit abgelaufen ist
  if (get_program_time() - last_tick_time > TIME_BETWEEN_TICKS) {
    handleServerTick(time_since_last_tick);
    last_tick_time = get_program_time();
  }

  // Round-Robin: ein Client, ein Paket pro Iteration
  client_index = (client_index + 1) % MAX_PLAYERS;
  if (clients[client_index] == -1) continue;

  // Paket-Header lesen: Länge + ID
  recv(client_fd, &recv_buffer, 2, MSG_PEEK);
  int length = readVarInt(client_fd);
  int packet_id = readVarInt(client_fd);
  handlePacket(client_fd, length - sizeVarInt(packet_id), packet_id, state);
}
```

Nur ein Client wird pro Schleifeniteration bearbeitet, und es wird jeweils nur ein Paket gelesen. Das `task_yield()` am Anfang der Schleife lässt die FreeRTOS-Leerlaufaufgabe auf dem ESP32 atmen -- ohne das setzt der Watchdog-Timer den Chip zurück.

Das Paket-Dispatching ist ein monströser Switch mit **400 Zeilen**:

```c
// main.c, Zeilen 68-497

void handlePacket (int client_fd, int length, int packet_id, int state) {
  switch (packet_id) {
    case 0x00:  // Handshake / Status / Login je nach Zustand
    case 0x01:  // Status ping
    case 0x02:  // Plugin message
    case 0x03:  // Login/configuration acknowledgment
    case 0x08:  // Chat
    case 0x0B:  // Client status (respawn)
    case 0x11:  // Click container (verwaltet Truhen)
    case 0x19:  // Interact entity
    case 0x1D..0x20:  // Bewegungs-Pakete (der größte Fall)
    case 0x28:  // Player action (abbauen/platzieren)
    // ... 40+ Fälle
  }
}
```

Keine dynamische Jump-Tabelle, keine Vtable, keine Map. Ein Switch kompiliert zu einer statischen Sprungtabelle. Perfekt für Embedded.

Der Fall `0x1D-0x20` ist der größte -- er behandelt Positionsaktualisierungen, Fallschaden, Chunk-Grenzüberschreitungen, Mob-Spawning, Chunk-Generierung UND Hunger. Alles in einem einzigen großen Fall-Through.

![Der Bareiron-Servercode -- 6800 Zeilen C](/images/bareiron/code-shot.jpg)

## Der Server-Tick und die Mob-KI

Die Funktion `handleServerTick` wird alle 50 ms aufgerufen (20 TPS). Sie verwaltet die Welt, während sich die Hauptschleife um die Spieler kümmert:

```c
// main.c (vereinfacht)

void handleServerTick (uint32_t delta) {
  // Jeden Mob aktualisieren
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type == 0 || mobs[i].data == 0) continue;  // tot oder leer

    MobData *mob = &mobs[i];
    int px, pz;
    getNearestPlayer(mob->x, mob->z, &px, &pz);

    if (mob->type == MOB_ZOMBIE) {
      // Feindlich: läuft zum nächsten Spieler
      if (px < mob->x) mob->x --;
      else if (px > mob->x) mob->x ++;
      if (pz < mob->z) mob->z --;
      else if (pz > mob->z) mob->z ++;
      // Kontaktschaden bei 2 Blöcken
      if (abs(px - mob->x) <= 2 && abs(pz - mob->z) <= 2)
        damagePlayer(getNearestPlayerId(mob->x, mob->z), 3);
    } else {
      // Passiv: 8 zufällige Richtungen
      uint8_t dir = getMobDir(mob);
      mob->x += dir_lookup[dir][0];
      mob->z += dir_lookup[dir][1];
      // Richtungswechsel alle ~40 Ticks
      if (mob->data >> 6 < 1) setMobDir(mob, rand() & 7);
      mob->data = (mob->data & 0x3F) | ((mob->data - 0x40) & 0xC0);
    }

    // Chunks um den Mob herum aufwecken
    setChunkGenerated(mob->x / 8, mob->z / 8);
  }
}
```

Die KI feindlicher Mobs ist ein Koordinatenvergleich. Buchstäblich `if (px < x) x--`. Kein Pathfinding, kein A*, keine Hindernisvermeidung. Der Zombie passt X und Z unabhängig voneinander in Richtung des Spielers an -- er geht durch Wände, falls welche da sind.

Der Kontaktschaden beträgt 3 Herzen/Sek. p2r3 hat ihn bewusst hoch angesetzt, weil das Fehlen von Pathfinding Zombies leicht zu kiten macht.

Die Rüstungsformel ist die von vor dem Combat Update -- die denkbar einfachste:

```c
// main.c (vereinfacht)

static uint8_t applyArmor (uint8_t damage, uint16_t armor_value) {
  // Pre-1.9-Formel: lineare Reduktion
  // Jeder Rüstungspunkt = 4% Reduktion, max 80%
  uint8_t reduction = (armor_value * 4);
  if (reduction > 80) reduction = 80;
  return damage * (100 - reduction) / 100;
}
```

Full Diamond = 80% Reduktion. Ein Zombie-Treffer mit 3 Herzen wird zu 0,6 Herzen. p2r3 hat diese alte Formel gewählt, weil sie in 2 Operationen berechnet wird -- keine Schwellenwerte, keine Kurven, nur ein linearer Prozentsatz.

Passive Mobs: 8 Richtungen in einer Lookup-Tabelle, Richtungswechsel alle ~40 Ticks. Das `data`-Feld kodiert die aktuelle Richtung in den oberen 2 Bits und den Richtungswechsel-Timer in den restlichen 6 Bits.

![Mobs in Bareiron -- Zombies, Schweine, Schafe](/images/bareiron/mobs.jpg)

### Mob-Respawn

Mobs spawnen nicht durch Random Ticks. Sie erscheinen, wenn der Server-Tick eine neue Chunk-Grenze erreicht:

```c
if (player crossed chunk boundary) {
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type != 0) continue;
    spawnMob(&mobs[i], new_chunk_coords, getChunkHash(cx, cz));
    break;
  }
}
```

Gleiches RNG wie das Gelände, gleicher Chunk-Seed. Wenn ein Mob-Platz frei ist, ist das Spawning deterministisch.

## Crafting: Keine Matrizen, nur if/else

```c
// crafting.c, Zeilen 9-347 (vereinfacht)

void getCraftingOutput (PlayerData *player, uint8_t *count, uint16_t *item) {
  // Wenn Flag 0x80 gesetzt ist, wird der Craft-Puffer von einer Truhe verwendet
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
    case 3:  /* Schaufeln, Schwerter, Platten */
    case 4:  /* Werkbank, Stiefel */
    case 5:  /* Spitzhacken, Äxte, Helme */
    case 7:  /* Beinschienen, Komposter */
    case 8:  /* Ofen, Truhe, Brustplatte */
    case 9:  /* Volle Blöcke (Eisen, Gold, usw.) */
  }
}
```

Der erste Check: Wenn Flag `0x80` gesetzt ist, wird der Craft-Puffer als Truhenzeiger zweckentfremdet. Kein Crafting möglich.

Dann zählt es die gefüllten Slots, merkt sich das erste Item und prüft die Identität. Damit allein matcht es den Ofen in 4 Checks:

```c
if (count == 8 && first == cobblestone && all_identical && center_empty)
    return furnace;
```

Für komplexe Formen verwendet es den Index des ersten Items und prüft die relative Position. Die Rezepte teilen sich dieselbe Matching-Funktion -- das Material bestimmt das Ergebnis.

![Crafting- und Truhen-Interface in Bareiron](/images/bareiron/crafting.jpg)

## Die Truhen: Der berüchtigte Hack

Der Memory-Hack, von dem alle reden, in echtem Code:

```c
// procedures.c, Zeilen 1262-1293

if (target == B_chest) {
  // Truheneintrag im Block-Array suchen
  uint8_t *storage_ptr = NULL;
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block != B_chest) continue;
    if (block_changes[i].x != x || block_changes[i].y != y || block_changes[i].z != z)
      continue;
    storage_ptr = (uint8_t *)(&block_changes[i + 1]);  // zeigt hinter den Truhen-Block
    break;
  }
  if (storage_ptr == NULL) return;

  // Terrible memory hack!!
  // Wir kopieren den ZEIGER in das Craft-Item-Array des Spielers
  memcpy(player->craft_items, &storage_ptr, sizeof(storage_ptr));
  player->flags |= 0x80;  // Craft sperren

  // Truhen-Interface an Client senden
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

Genau das ist es. Es nimmt die Speicheradresse des nächsten Eintrags in `block_changes[]`, kopiert sie in `player->craft_items` (ein `uint16_t[9]`, also 18 Bytes -- genug, um einen 32-Bit-Zeiger zu speichern) und setzt das Flag, damit niemand in dieser Zeit craften kann.

Bei jedem Klick im Truhen-Inventar:

```c
// packets.c, Zeilen 620-638

uint8_t *storage_ptr;
memcpy(&storage_ptr, player->craft_items, sizeof(storage_ptr));
// storage_ptr zeigt jetzt auf die Truhendaten
uint16_t *p_item = (uint16_t *)(storage_ptr + (slot - 41) * 3);
uint8_t *p_count = storage_ptr + (slot - 41) * 3 + 2;
```

Es holt den Zeiger aus dem Craft-Puffer und greift mit einem Offset auf die Slots zu. Die Truhendaten werden mit 3 Bytes pro Slot gespeichert (2 für die ID, 1 für die Menge), direkt hintereinander im Block-Array.

![Truhendaten im Block-Array gespeichert -- ein Memory-Hack](/images/bareiron/chest-hack.jpg)

## Der Hunger: 5 Zeilen Genie

```c
// main.c, Zeilen 293-305

// Spieler senden Bewegungs-Pakete mit ~20/Sek, wenn sie sich
// bewegen, viel weniger, wenn sie stillstehen. Wir korrelieren
// das mit der Aktivität, um Hunger kostenlos zu simulieren.
if (player->saturation == 0) {
  if (player->hunger > 0) player->hunger--;
  player->saturation = 200;
  sc_setHealth(client_fd, player->health, player->hunger, player->saturation);
} else if (player->flags & 0x08) {  // sprinting
  player->saturation -= 1;
}
```

Es ist wirklich das. 5 Zeilen. Jedes Bewegungs-Paket verringert die Sättigung. Wenn die Sättigung Null erreicht, sinkt der Hunger und die Sättigung wird zurückgesetzt. Sprinten (Flag `0x08`) verdoppelt die Abnahme.

Null Timer, null allokierter Speicher, null dedizierte Berechnung. Ein Zähler, der auf bereits existierenden Paketen dekrementiert.

### Fallschaden

Das einfachste Schadenssystem im Projekt:

```c
// Wenn der Spieler den Boden verlässt, speichern wir sein Y
// Wenn er wieder Boden berührt, subtrahieren wir
schaden = letztes_y_am_boden - aktuelles_y;
```

Eine Subtraktion.

## Blöcke abbauen und platzieren

Wenn du auf einen Block klickst, landet das Paket `0x28` (Player Action) im Switch. Der Handler muss bestimmen, welcher Block sich an der Position befindet, ihn entfernen und das Item ins Inventar legen:

```c
// main.c, case 0x28 (vereinfacht)

void handlePlayerAction (int client_fd, uint8_t action, int x, uint8_t y, int z) {
  switch (action) {
    case START_DESTROY_BLOCK: {
      // Blocktyp an der angeklickten Position bestimmen
      uint8_t block = getBlockAt(x, y, z);

      if (block == B_chest) {
        openChest(client_fd, x, y, z);
        break;
      }

      // Zu block_changes hinzufügen
      addBlockChange(x, z, y, 0);  // 0 = air

      // Item dem Spieler geben (trust the client)
      addItemToPlayer(client_fd, block_to_item(block), 1);

      // Update an Client senden
      sc_blockChange(client_fd, x, y, z, 0);
      sc_ackBlockChange(client_fd, x, y, z, 0);
      break;
    }
    case PLACE_BLOCK: {
      // Blocktyp aus der Spielerhand lesen
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

`getBlockAt` kombiniert die Terrain-Generierung UND die Spieler-Änderungen:

```c
uint8_t getBlockAt (int x, uint8_t y, int z) {
  // Zuerst Spieler-Änderungen prüfen
  uint8_t change = getBlockChange(x, y, z);
  if (change != 0xFF) return change;

  // Sonst vom generierten Gelände lesen
  return getTerrainBlock(x, y, z);
}
```

Priorität für Änderungen, Fallback auf das Gelände. Null Debatte, Null Cache, Null Overhead. Unter der Haube ist `getTerrainBlock` = `getHeightAt` + die Stone/Dirt/Grass/Coal-Schichten.

### Der Instant-Ofen

Das Lustigste: Der Ofen existiert nicht als Entität. Wenn du Bruchstein in den "Kochen"-Slot und Kohle in den "Brennstoff"-Slot legst, erscheint das Ergebnis sofort. Kein Timer, kein Chunk-Ticking. Es ist nur ein Inventar-Slot, der sich leert, wenn du die richtigen Items reinlegst.

![Instant-Ofen -- Zutaten rein, Ergebnis sofort](/images/bareiron/furnace.jpg)

## Die ESP32-Schleife: Ein MC-Server in 4 KB Stack

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
  // Der Rest wird vom Event-Handler erledigt
}
#endif
```

Der gesamte Server läuft in einer FreeRTOS-Aufgabe mit **4096 Bytes Stack**. Das war's. Der Haupt-Thread initialisiert nur das WLAN und wartet auf eine Verbindung. Sobald verbunden, startet er `bareiron_main`, das die Standard-`main()` aufruft.

Der gesamte ESP32-spezifische Code ist durch `#ifdef ESP_PLATFORM` geschützt. Auf dem PC kompiliert das alles zu Standard-POSIX-Code.

## Was geopfert wurde

Damit alles reinpasst, gibt es einige Vanilla-Features nicht:

- **Keine Netzwerk-Kompression** -- zlib zu teuer. Der Server generiert Chunks schnell, aber sie zu senden ist der Flaschenhals.
- **Keine Random Ticks** -- Bäume wachsen mit Knochenmehl oder gar nicht. Mobs spawnen an Chunk-Grenzen.
- **Keine Item-Entitäten** -- abgebaute Blöcke landen direkt im Inventar. Die Animation ist rein visuell.
- **Keinerlei Inventar-Validierung** -- trust the client. 64 Diamanten? OK. Ein Chunk in 1 Sekunde abgebaut? OK. Nur zwischen vertrauenswürdigen Leuten nutzbar.
- **Kein Server-Licht** -- Fackeln werden nach allem anderen gesendet, der Client berechnet.
- **Keine fließenden Flüssigkeiten** -- sofortiger Endzustand.

## Das Endergebnis

Ryzen 5 3600: ~0,5 ms pro Chunk.
ESP32-C3 für 1$: ~200 ms pro Chunk. Spielbar.

![Chunk-Generierungs-Benchmark -- Ryzen vs ESP32](/images/bareiron/performance.jpg)

3+ Spieler: es ruckelt. Vergleichbar mit 2b2t zu Stoßzeiten, so der Autor.

![Mehrere Spieler auf demselben Bareiron-Server](/images/bareiron/multiplayer.jpg)

## Die Philosophie

p2r3: "Ich mag einfach den Gedanken, dass dieser winzige 1$-Chip, der 0,5 Watt verbraucht, etwas so Fortschrittliches wie Minecraft zum Laufen bringen kann. Science isn't about 'why', it's about 'why not'."

Jede Zeile ist ein Tradeoff:
- Perlin Noise → Interpolation: weniger hübsch, 200x schneller, null Speicher
- Crafting-Matrizen → hartkodiertes Matching: hässlicher Code, null Bytes
- zlib → nichts: schlechte Verbindung = Tod, aber spielbar
- Validierung → Trust: null Sicherheit, null Rechenaufwand

Jede fehlende Feature ermöglicht es einem anderen, innerhalb der Hardware-Grenzen zu existieren.

**Die 3 Dinge zum Mitnehmen:**

1. **Interpolation + RNG** -- 4 geseedete Punkte, unendliches Gelände, null Speicher, Abfragen ohne Chunk-Neugenerierung, 200 ms Generierung. Das ist der Geniestreich, der alles andere ermöglicht.
2. **Jedes Feature hat seinen Preis** -- Keine Kompression, keine Random Ticks, keine Validierung. Das sind keine Versehen, das ist der Grund, warum alles in 520 KB passt.
3. **Die dreckigsten Hacks sind die cleversten** -- Truhen im Block-Array per memcpy, Hunger durch Bewegungs-Pakete, Instant-Ofen. Die saubere Lösung wäre zu teuer gewesen.

Wenn dich das Projekt interessiert, alles ist auf [GitHub unter GPLv3](https://github.com/p2r3/bareiron/). Es ist richtig dreckiges C, und ich habe selten so viel Spaß beim Lesen von Quellcode gehabt xD
