---
title: Bareiron -- сервер Minecraft, крутящийся на микроконтроллере за 1$
description: 6800 строк C, ноль malloc, шум Перлина, заменённый
  билинейной интерполяцией, биомы в tile map, и всё это на чипе за 1$.
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
author_sig: "xaPuSMHu9/0PAch0rOPf4MjpuHxBUDsKqJrRUMvMbm7yPJ69bGig5PUPE520QpnqM9V7BC3CLyJWYqVOUYT6cQ=="
---

## Введение

Запустить сервер Minecraft на микроконтроллере за доллар звучит как шутка.

Я задался вопросом, и ответ да. Буквально.

Есть проект под названием [Bareiron](https://github.com/p2r3/bareiron/), автор p2r3, и это, наверное, один из самых захватывающих проектов, что я видел в мире Minecraft за последние годы. Речь о бинаре, умещающемся в **300 килобайт**, **6800 строк C**, ноль внешних зависимостей, без malloc, без трединга, и это крутится на **ESP32 за 1 доллар**.

![ESP32-C3, микроконтроллер, на котором крутится сервер](/images/bareiron/esp32-board.jpg)

Бесконечная генерация террейна. Биомы. Пещеры. Крафт. Копка. Мобы. Голод. Сундуки. Всё, чего ждёшь от survival-сервера.

На чипе, потребляющем **0.5 Ватт** и имеющем **160 МГц** клока.

Для порядка идеи : ванильному серверу Minecraft нужны несколько гигов RAM. ESP32-C3 это **520 КБ SRAM** (400 доступно после бута). Процессоры 20 лет назад уже крутились на гигагерцах -- этот упирается в 160 МГц. Фактор между ними в чистой мощи примерно **20 000**.

p2r3 не писал сервер Minecraft на C, он переизобрёл каждый кирпич сервера, чтобы уместить в эти лимиты. Смотрим как, открыв исходник.

![Миниатюра видео-презентации Bareiron от p2r3](/images/bareiron/title-card.jpg)

## Мозг проекта : генерация террейна без памяти

Самая большая проблема, когда хочешь сделать встроенный MC-сервер, это генерация террейна.

В ванильном Minecraft мир генерируется **шумом Перлина** : несколько наложенных слоёв (октавы), 6 биомических параметров (температура, влажность, континентальность, эрозия, weirdness, глубина) и целая система кэширования, чтобы не пересчитывать всё каждый раз.

Результат великолепен. Но дорог в вычислениях и жрёт RAM на хранение сгенерированных чанков.

Подход Bareiron радикально другой. Вместо нагромождения шума он использует **билинейную интерполяцию** на 4 точках, сгенерированных **детерминированным RNG**.

Знаешь, когда увеличиваешь маленькую пиксельную картинку и края становятся размытыми? Это ровно оно.

```c
// worldgen.c, строки 117-171 (упрощённо)

uint8_t interpolate (uint8_t a, uint8_t b, uint8_t c, uint8_t d, int x, int z) {
  uint16_t top    = a * (CHUNK_SIZE - x) + b * x;
  uint16_t bottom = c * (CHUNK_SIZE - x) + d * x;
  return (top * (CHUNK_SIZE - z) + bottom * z) / (CHUNK_SIZE * CHUNK_SIZE);
}

uint8_t getHeightAt (int x, int z) {
  int _x = floor(x / CHUNK_SIZE);  // координаты чанка
  int _z = floor(z / CHUNK_SIZE);
  int rx = x % CHUNK_SIZE;          // офсет внутри чанка
  int rz = z % CHUNK_SIZE;
  uint32_t hash = getChunkHash(_x, _z);
  uint8_t biome = getChunkBiome(_x, _z);
  // интерполяция между 4 углами, засиденными hash + biome
  return getHeightAtFromHash(rx, rz, _x, _z, hash, biome);
}
```

Стандартная билинейная интерполяция : 4 угла, веса по позиции, один `uint8_t` на выходе. CHUNK_SIZE равен 8, так что делается целочисленными умножениями, без float.

p2r3 показывает шаг за шагом в видео : сначала 4 угла чанка, каждый с высотой, засиденной RNG.

![4 угла чанка, каждый засиден детерминированным RNG](/images/bareiron/gen-four-corners.jpg)

Затем интерполяция между этими 4 точками создаёт непрерывную поверхность.

![Применение билинейной интерполяции между 4 углами](/images/bareiron/gen-interpolate.jpg)

А повторяя паттерн на всех соседних чанках, получаем террейн, тянущийся бесконечно.

![Финальный результат : непрерывный неровный террейн](/images/bareiron/gen-result.jpg)

### Детерминированный RNG

Ключ, делающий всё это возможным, это сидирование. У каждого чанка 4 угла, и каждому углу нужно уникальное, но воспроизводимое псевдослучайное значение.

```c
// worldgen.c, строки 13-22

uint32_t getChunkHash (short x, short z) {
  uint8_t buf[8];
  memcpy(buf, &x, 2);          // 16 бит координаты X
  memcpy(buf + 2, &z, 2);      // 16 бит координаты Z
  memcpy(buf + 4, &world_seed, 4);  // 32 бита глобального сида
  return splitmix64(*((uint64_t *)buf));  // хэш
}
```

Он пакует 16 бит X, 16 бит Z и 32 бита сида в буфер 8 байтов и прогоняет всё через `splitmix64`. Итог : детерминированное уникальное значение для каждой позиции на основе сида мира.

Сечёшь мощь механизма? Серверу не надо хранить террейн. Он пересчитывает на лету, когда игрок приходит в новую зону, и это даёт ровно тот же результат каждый раз.

Используемый `splitmix64` это ультрабыстрый prng, спроектированный для 64-битных хэшей :

```c
// worldgen.c (упрощённо)

static uint32_t splitmix64 (uint64_t state) {
  state += 0x9E3779B97F4A7C15ull;
  uint64_t z = state;
  z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ull;
  z = (z ^ (z >> 27)) * 0x94D049BB133111EBull;
  return (z ^ (z >> 31)) >> 32;
}
```

3 операции : сложение, xor/shift, умножение, xor/shift, умножение, xor/shift. Всё укладывается в прямые операции, без таблиц и циклов. Он берёт буфер 8 байтов (X + Z + сид), трактует как 64-битное целое и возвращает 32 бита хэша. Детерминировано, быстро, укладывается в 5 строк.

### Почему это не шум Перлина

p2r3 сам говорит в видео : "чем больше цифр случайного числа добавляешь, тем регулярнее становится террейн, как больше бросков монеты приближают к 50/50". На практике это число бит хэша, которые он комбинирует :

```c
// worldgen.c, строки 51-115

// Для биома plains : 4 скомбинированных фактора → регулярный террейн
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// Для snowy plains : 2 фактора → более рваный
h = (hash % 5) + ((hash >> 4) % 5);
```

Каждый биом выбирает, сколько битовых экстракций комбинировать. Чем больше, тем стабильнее распределение -- как больше бросков монеты, приближающих 50/50. Чем меньше, тем сильнее локальные вариации.

![Неровный террейн -- мало факторов, сильные вариации](/images/bareiron/terrain-irregular.jpg)

Всего с 2 факторами snowy plains даёт холмистый, почти горный террейн. Пики и впадины часты.

![Регулярный террейн -- множественные факторы, гладкая поверхность](/images/bareiron/terrain-regular.jpg)

С 4 факторами равнины остаются плоскими и предсказуемыми. Распределение стабилизируется.

Чанк генерируется за **200 мс** на ESP32 -- против неизмеримого времени на том же железе с шумом Перлина, настолько это дорого.

### Убивающая деталь : опросить блок, не генерируя весь чанк

Ты играешь, копаешь блок. Сервер должен знать, какой предмет тебе дать. Наивно надо бы сгенерировать весь чанк ради этого.

С билинейной интерполяцией опрашиваешь **любую точку** плоскости прямо из координат. Углы чанка получаются из позиции игрока, интерполяция даёт высоту на любом офсете. Горсть матопераций, без генерации чанка.

p2r3 : "чего я хочу, так это магической функции, способной сказать, какой блок находится по данной координате, без доступа к памяти и без вычисления дорогих шумовых карт". Ровно это он и сделал.

Вот как высота становится конкретными блоками :

```c
// worldgen.c (упрощённо)

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

5 условий. Слой grass/dirt/stone/deepslate/bedrock. Поверхностный блок зависит от биома через `biome_top[]` -- grass для равнин, sand для пустыни. Простой каскад if падает в правильный слой, заменяя цикл и switch.

### Пещеры, ленивейшее зеркало

```c
altitude_grotte = CAVE_BASE_DEPTH - (hauteur_surface - y);
```

Он зеркалит высоту поверхности под землю. Похоже на большие deepslate-полости. Ноль вычислений, одна строка.

![Пещеры, сгенерированные зеркалом поверхностного террейна](/images/bareiron/cave-mirror.jpg)

![Схема зеркала террейна для генерации пещер](/images/bareiron/cave-diagram.jpg)

### Руды, XOR-версия

```c
candidat = (chunk_x ^ col_x ^ col_z) % 100;
if (candidat < 5 && y < 16) -> diamond
```

XOR координат гарантирует кандидата на колонку. Тип зависит только от высоты. Алмазы спрятаны под самой низкой точкой пещер, чтобы копание оставалось полезным.

### Биомы в tile map

Каждый биом это круговой остров в сетке, его тип определён паттерном, вычисленным из сида. Сетчато, предсказуемо и бесплатно.

![Карта биомов в tile map -- каждый остров отдельный биом](/images/bareiron/biome-tilemap.jpg)

У каждого биома собственный набор параметров, закодированный в таблицах :

```c
// worldgen.c (упрощённо)

static const uint8_t biome_base[] = {
  [BIOME_PLAINS]  = 48,   // базовая высота : 48
  [BIOME_DESERT]  = 52,   // чуть выше
  [BIOME_FOREST]  = 50,   // между ними
  [BIOME_TAIGA]   = 46,   // чуть ниже
  [BIOME_SNOWY]   = 40,   // самый низкий
};

static const uint8_t biome_top[] = {
  [BIOME_PLAINS]  = B_grass,
  [BIOME_DESERT]  = B_sand,
  [BIOME_FOREST]  = B_grass,
  [BIOME_TAIGA]   = B_grass,
  [BIOME_SNOWY]   = B_snow_block,
};

static const uint8_t biome_factors[] = {
  [BIOME_PLAINS]  = 4,   // 4 экстракции → очень регулярно
  [BIOME_DESERT]  = 3,   // 3 экстракции → умеренно
  [BIOME_FOREST]  = 4,   // 4 экстракции → регулярно, холмисто
  [BIOME_TAIGA]   = 3,   // 3 экстракции → умеренно
  [BIOME_SNOWY]   = 2,   // 2 экстракции → очень рвано
};
```

**Plains** : высота 48, 4 фактора → очень плоский террейн, трава.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3) + ((hash >> 12) % 3);
// Итог : вариация макс ±4 блока
```

**Desert** : высота 52, 3 фактора, поверхностный блок = песок. Никогда ниже уровня моря.

```c
h = (hash % 3) + ((hash >> 4) % 3) + ((hash >> 8) % 3);
// Итог : вариация макс ±6 блоков, клампнуто на SEA_LEVEL+1
```

**Forest** : высота 50, 4 фактора, как plains, но база выше → лесистые холмы.

**Taiga** : высота 46, 3 фактора → умеренные вариации, холодный террейн.

**Snowy plains** : высота 40, только 2 фактора → самый рваный.

```c
h = (hash % 5) + ((hash >> 4) % 5);
// Итог : вариация макс ±14 блоков
```

Каждый биом закодирован в **3 таблицах по 5 входов** : базовая высота, поверхностный блок, число факторов. Когда `getHeightAtFromHash` получает биом, она консультируется с этими таблицами, чтобы подстроить террейн. 15 байтов данных вместо целой системы биомов ванильного Minecraft.

Детектор биома использует сид, чтобы определить, какой биом соответствует каждому чанку :

```c
// worldgen.c (упрощённо)

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

Паттерн на 16 входов, индекс, засиденный координатами чанка. Даёт повторяющуюся, но визуально связную сетку. 4 строки кода вместо целой системы биомических параметров ванильного Minecraft.

### getHeightAtFromHash : сборщик террейна

Функция в сердце генерации комбинирует 4 угла, засиденных по биому :

```c
// worldgen.c (упрощённо)

static uint8_t getHeightAtFromHash (int rx, int rz, short cx, short cz,
                                    uint32_t h, uint8_t biome) {
  // 4 угла, извлечённые из хэша, разный сид на угол
  uint8_t h1 = biome_base[biome] + (h & 0x0F);
  uint8_t h2 = biome_base[biome] + ((h >> 4) & 0x0F);
  uint8_t h3 = biome_base[biome] + ((h >> 8) & 0x0F);
  uint8_t h4 = biome_base[biome] + ((h >> 12) & 0x0F);

  // Биомное ограничение : пустыня никогда под водой
  if (biome == BIOME_DESERT) {
    h1 = max(h1, SEA_LEVEL + 1);
    h2 = max(h2, SEA_LEVEL + 1);
    h3 = max(h3, SEA_LEVEL + 1);
    h4 = max(h4, SEA_LEVEL + 1);
  }

  // Интерполяция из 4 углов
  return interpolate(h1, h2, h3, h4, rx, rz);
}
```

У каждого биома есть `biome_base`, сдвигающая референсную высоту, а 4 угла извлекаются из хэша с разными сдвигами. Пустыня форсирует минимум выше уровня моря -- строка ограничения, избегающая воды без дополнительного биомического вычисления.

### Деревья и кактусы : вероятностное размещение

Генерация поверхности использует тот же хэш чанка, чтобы решать, где сажать :

```c
// worldgen.c (упрощённо)

static void genFoliage (uint8_t *chunk_data, short cx, short cz,
                        uint32_t hash, uint8_t biome) {
  if (biome == BIOME_DESERT) {
    // Кактус : кандидат на чанк, хэш определяет позицию
    int tx = (hash >> 8) & 7;
    int tz = (hash >> 12) & 7;
    int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
    if (chunk_data[ty * 64 + tz * 8 + tx] == B_sand)
      placeCactus(chunk_data, tx, ty + 1, tz);
  } else {
    // Деревья : хэш определяет, ставить ли и куда
    int tree_count = (hash & 3);  // 0-3 дерева на чанк
    for (int i = 0; i < tree_count; i ++) {
      int tx = ((hash >> (4 + i * 4)) & 7);
      int tz = ((hash >> (6 + i * 4)) & 7);
      int ty = getHeightAt(cx * 8 + tx, cz * 8 + tz);
      placeTree(chunk_data, tx, ty + 1, tz);
    }
  }
}
```

0-3 дерева на чанк для зелёных биомов, максимум 1 кактус для пустыни. Хэш чанка единственный источник энтропии -- `& 7` для позиции в чанке, `& 3` для счётчика. Всё детерминировано, ничего не хранится.

### generateChunk : собрать всё

Функция, соединяющая всё, чтобы выдать полный чанк 8×8×256 блоков :

```c
// worldgen.c (упрощённо)

void generateChunk (uint8_t *chunk, short cx, short cz) {
  uint32_t hash = getChunkHash(cx, cz);
  uint8_t biome = getChunkBiome(cx, cz);

  // На каждую колонку чанка (8×8 = 64)
  for (int x = 0; x < 8; x ++) {
    for (int z = 0; z < 8; z ++) {
      // Абсолютные мировые координаты
      int wx = cx * 8 + x;
      int wz = cz * 8 + z;

      // Высота колонки
      uint8_t height = getHeightAt(wx, wz);

      // Заполнить колонку снизу вверх
      for (int y = 0; y < height; y ++) {
        uint8_t block = getTerrainBlock(wx, y, wz);
        chunk[y * 64 + z * 8 + x] = block;
      }
    }
  }

  // Добавить поверхностные элементы (деревья, кактусы)
  genFoliage(chunk, cx, cz, hash, biome);
}
```

И всё. 3 вложенных цикла : на каждую колонку найти высоту, заполнить блоки, перейти к следующей. Выход это `uint8_t[16384]` (8 × 8 × 256), представляющий полный чанк. Чанк генерируется и отправляется прямо клиенту, без кэширования, lazy loading или компрессии.

## Хранение : статичные массивы повсюду

Архитектура памяти Bareiron это встроенный C во всей красе : только глобальные массивы фиксированного размера, ни malloc, ни hash maps, ни связных списков.

### Изменения блоков

```c
// globals.h, строки 191-196

typedef struct {
  short x;      // 2 байта -- лимит 32 000 блоков горизонтально
  short z;      // 2 байта
  uint8_t y;    // 1 байт -- лимит 256 блоков вертикально
  uint8_t block; // 1 байт -- лимит 256 типов блоков
} BlockChange;
```

20 000 входов, то есть около **25 000 изменений** -- эквивалент полутора чанков, целиком выкопанных. Поле `block` на `0xFF` маркирует свободный вход. Поиск это линейный скан :

![Раскладка памяти таблицы блоков -- 6 байтов на вход](/images/bareiron/memory-layout.jpg)

```c
// procedures.c

uint8_t getBlockChange (short x, uint8_t y, short z) {
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block == 0xFF) continue;
    if (block_changes[i].x == x && block_changes[i].y == y && block_changes[i].z == z)
      return block_changes[i].block;
    #ifdef ALLOW_CHESTS
      if (block_changes[i].block == B_chest) i += 14;  // пропустить данные сундука
    #endif
  }
  return 0xFF;
}
```

Добавить изменение так же прямо, как поиск :

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

Счётчик, индекс, запись. Таблица просто堆ует : никакой сортировки, никакой компактификации, никакого управления памятью. Когда таблица полна, новые изменения игнорируются -- террейн возвращается к сгенерированному состоянию.

Комментарий автора про лимит 256 блоков : "я не собираюсь имплементировать слегка патинированные вощёные медные ступени в ближайшее время."

### Мобы : 8 байтов на голову трубы

```c
// globals.h, строки 240-251 (pragma pack(push, 1), чтобы убить паддинг)

typedef struct {
  uint8_t type;   // 25=chicken, 28=cow, 95=pig, 106=sheep, 145=zombie
  short x;
  uint8_t y;      // если health=0, Y становится таймером до удаления
  short z;
  uint8_t data;   // биты 0-4: health, бит 5: sheep sheared, биты 6-7: panic timer
} MobData;
```

8 байтов. Макс 16 слотов. Выравнивание и паддинг идут лесом. Байт `data` это домашний bitfield : 5 бит жизни, 1 бит стрижки, 2 бита таймера паники. А когда моб умирает, поле Y становится таймером до удаления. Переиспользование памяти на уровне бита.

### Игроки : упакованы плотно

Данные игроков тоже используют `#pragma pack(push, 1)` -- координаты в `short` + `uint8_t`, инвентари в фиксированных массивах `uint16_t` + `uint8_t`, а поле `flags`, кодирующее одновременно кулдаун атаки, состояние спавна, sneak, sprint, eat, load, movement cooldown и лок крафта. Всё это в отдельных битах.

## Главный цикл : while(true) и неблокирующее

Весь сервер крутится на одном цикле, одном треде, ноль event library.

```c
// main.c, строки 594-720

while (true) {
  task_yield();  // даёт дышать вотчдогу на ESP32

  // Принять новое соединение (неблокирующе)
  for (int i = 0; i < MAX_PLAYERS; i ++) {
    if (clients[i] != -1) continue;
    clients[i] = accept(server_fd, ...);
    if (clients[i] != -1) client_count ++;
    break;
  }

  // Тик сервера, если время вышло
  if (get_program_time() - last_tick_time > TIME_BETWEEN_TICKS) {
    handleServerTick(time_since_last_tick);
    last_tick_time = get_program_time();
  }

  // Round-robin : клиент, пакет за итерацию
  client_index = (client_index + 1) % MAX_PLAYERS;
  if (clients[client_index] == -1) continue;

  // Читать заголовок пакета : length + ID
  recv(client_fd, &recv_buffer, 2, MSG_PEEK);
  int length = readVarInt(client_fd);
  int packet_id = readVarInt(client_fd);
  handlePacket(client_fd, length - sizeVarInt(packet_id), packet_id, state);
}
```

Один клиент обрабатывается за итерацию цикла, и один пакет читается зараз. `task_yield()` в начале цикла даёт дышать idle-задаче FreeRTOS на ESP32 -- без этого таймер вотчдога ресетнет чип.

Диспатч пакетов это монструозный switch на **400 строк** :

```c
// main.c, строки 68-497

void handlePacket (int client_fd, int length, int packet_id, int state) {
  switch (packet_id) {
    case 0x00:  // Handshake / Status / Login по состоянию
    case 0x01:  // Status ping
    case 0x02:  // Plugin message
    case 0x03:  // Login/configuration acknowledgment
    case 0x08:  // Chat
    case 0x0B:  // Client status (respawn)
    case 0x11:  // Click container (управляет сундуками)
    case 0x19:  // Interact entity
    case 0x1D..0x20:  // Movement packets (самый большой случай)
    case 0x28:  // Player action (dig/place)
    // ... 40+ случаев
  }
}
```

Switch компилируется в статичную jump table, заменяющую динамическую jump table, vtable и map. Идеально для встроенного.

Случай `0x1D-0x20` самый большой -- он управляет обновлениями позиции, уроном падения, пересечениями границ чанков, спавном мобов, генерацией чанков И голодом. Всё в одном большом fall-through.

![Код сервера Bareiron -- 6800 строк C](/images/bareiron/code-shot.jpg)

## Тик сервера и ИИ мобов

Функция `handleServerTick` зовётся каждые 50 мс (20 TPS). Она управляет миром, пока главный цикл занимается игроками :

```c
// main.c (упрощённо)

void handleServerTick (uint32_t delta) {
  // Обновить каждого моба
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type == 0 || mobs[i].data == 0) continue;  // мёртв или пуст

    MobData *mob = &mobs[i];
    int px, pz;
    getNearestPlayer(mob->x, mob->z, &px, &pz);

    if (mob->type == MOB_ZOMBIE) {
      // Враждебный : идёт к ближайшему игроку
      if (px < mob->x) mob->x --;
      else if (px > mob->x) mob->x ++;
      if (pz < mob->z) mob->z --;
      else if (pz > mob->z) mob->z ++;
      // Контактный урон на 2 блока
      if (abs(px - mob->x) <= 2 && abs(pz - mob->z) <= 2)
        damagePlayer(getNearestPlayerId(mob->x, mob->z), 3);
    } else {
      // Пассивный : 8 случайных направлений
      uint8_t dir = getMobDir(mob);
      mob->x += dir_lookup[dir][0];
      mob->z += dir_lookup[dir][1];
      // Смена направления примерно каждые 40 тиков
      if (mob->data >> 6 < 1) setMobDir(mob, rand() & 7);
      mob->data = (mob->data & 0x3F) | ((mob->data - 0x40) & 0xC0);
    }

    // Будить чанки вокруг моба
    setChunkGenerated(mob->x / 8, mob->z / 8);
  }
}
```

ИИ враждебных мобов это сравнение координат. Буквально `if (px < x) x--`. Зомби игнорирует патфайндинг, A* и обход препятствий : он подстраивает X и Z независимо к игроку -- проходит сквозь стены, если есть.

Контактный урон на 3 сердца/сек. p2r3 захотел высоким, потому что отсутствие патфайндинга делает зомби лёгкими для кайта.

Формула брони та, что до combat update -- простейшая возможная :

```c
// main.c (упрощённо)

static uint8_t applyArmor (uint8_t damage, uint16_t armor_value) {
  // Формула пре-1.9 : линейная редукция
  // Каждое очко брони = 4% редукции, макс 80%
  uint8_t reduction = (armor_value * 4);
  if (reduction > 80) reduction = 80;
  return damage * (100 - reduction) / 100;
}
```

Фулл даймонд = 80 % редукции. Удар зомби на 3 сердца становится 0.6 сердца. p2r3 выбрал эту старую формулу, потому что она считается в 2 операции -- без порогов, без кривых, просто линейный процент.

Пассивные мобы : 8 направлений в lookup table, смена курса примерно каждые 40 тиков. Поле `data` кодирует текущее направление в 2 старших битах, а таймер смены направления в остальных 6 битах.

![Мобы в Bareiron -- зомби, свиньи, овцы](/images/bareiron/mobs.jpg)

### Респавн мобов

Мобы не спавнятся random ticks. Они появляются, когда тик сервера встречает новую границу чанка :

```c
if (player crossed chunk boundary) {
  for (int i = 0; i < MOB_COUNT; i ++) {
    if (mobs[i].type != 0) continue;
    spawnMob(&mobs[i], new_chunk_coords, getChunkHash(cx, cz));
    break;
  }
}
```

Тот же RNG, что террейн, тот же сид чанка. Если слот моба свободен, спавн детерминирован.

## Крафт : никаких матриц, if/else

```c
// crafting.c, строки 9-347 (упрощённо)

void getCraftingOutput (PlayerData *player, uint8_t *count, uint16_t *item) {
  // Если флаг 0x80 поднят, буфер крафта используется сундуком
  if (player->flags & 0x80) { *count = 0; *item = 0; return; }

  // Посчитать слоты, найти первый предмет, проверить идентичность
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
    case 1:  /* доски, слитки... */
    case 2:  /* палки, ножницы, факелы */
    case 3:  /* лопаты, мечи, плиты */
    case 4:  /* верстак, ботинки */
    case 5:  /* кирки, топоры, шлемы */
    case 7:  /* поножи, компостеры */
    case 8:  /* печь, сундук, нагрудник */
    case 9:  /* полные блоки (железо, золото и т.д.) */
  }
}
```

Первая проверка : если флаг `0x80` поднят, буфер крафта переработан в указатель сундука. Крафт остаётся залоченным.

Затем считает заполненные слоты, отмечает первый предмет, проверяет идентичность. С одним этим матчатся печь в 4 проверки :

```c
if (count == 8 && first == cobblestone && all_identical && center_empty)
    return furnace;
```

Для сложных форм использует индекс первого предмета и проверяет относительную позицию. Рецепты разделяют одну функцию матчинга -- материал определяет результат.

![Интерфейс крафта и сундука в Bareiron](/images/bareiron/crafting.jpg)

## Сундуки : хак вживую

Хак памяти, о котором все говорят, в настоящем коде :

```c
// procedures.c, строки 1262-1293

if (target == B_chest) {
  // Искать вход сундука в таблице блоков
  uint8_t *storage_ptr = NULL;
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block != B_chest) continue;
    if (block_changes[i].x != x || block_changes[i].y != y || block_changes[i].z != z)
      continue;
    storage_ptr = (uint8_t *)(&block_changes[i + 1]);  // указывает после блока сундука
    break;
  }
  if (storage_ptr == NULL) return;

  // Ужасный хак памяти!!
  // Копируем УКАЗАТЕЛЬ в таблицу предметов крафта игрока
  memcpy(player->craft_items, &storage_ptr, sizeof(storage_ptr));
  player->flags |= 0x80;  // лочит крафт

  // Отправить интерфейс сундука клиенту
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

А комментарий в коде : `// Terrible memory hack!!1!`

Это ровно оно. Он берёт адрес памяти следующего входа в `block_changes[]`, копирует его в `player->craft_items` (который это `uint16_t[9]`, то есть 18 байтов -- достаточно, чтобы хранить 32-битный указатель), и поднимает флаг, чтобы никто не пытался крафтить в это время.

На каждый клик в инвентаре сундука :

```c
// packets.c, строки 620-638

uint8_t *storage_ptr;
memcpy(&storage_ptr, player->craft_items, sizeof(storage_ptr));
// storage_ptr теперь указывает на данные сундука
uint16_t *p_item = (uint16_t *)(storage_ptr + (slot - 41) * 3);
uint8_t *p_count = storage_ptr + (slot - 41) * 3 + 2;
```

Он забирает указатель из буфера крафта и обращается к слотам с офсетом. Данные сундука хранятся по 3 байта на слот (2 на ID, 1 на количество), прилепленные друг к другу в таблице блоков.

![Данные сундука, хранящиеся в таблице блоков -- хак памяти](/images/bareiron/chest-hack.jpg)

## Голод : 5 строк гениальности

```c
// main.c, строки 293-305

// Игроки шлют пакеты движения ~20/сек, когда
// двигаются, куда меньше, когда неподвижны. Коррелируем это
// с активностью, чтобы симулировать голод бесплатно.
if (player->saturation == 0) {
  if (player->hunger > 0) player->hunger--;
  player->saturation = 200;
  sc_setHealth(client_fd, player->health, player->hunger, player->saturation);
} else if (player->flags & 0x08) {  // спринт
  player->saturation -= 1;
}
}
```

Это буквально оно. 5 строк. Каждый пакет движения декрементирует насыщение. Когда насыщение доходит до нуля, голод падает, и сбрасываем насыщение. Спринт (флаг `0x08`) удваивает drain.

Ноль таймера, ноль аллоцированной памяти, ноль выделенных вычислений. Счётчик, декрементирующийся на уже существующих пакетах.

### Урон падения

Простейшая система урона проекта :

```c
// Когда игрок покидает землю, храним его Y
// Когда снова касается земли, вычитаем
урон = последний_y_на_земле - y_текущий;
```

Одно вычитание.

## Копание и установка блоков

Когда кликаешь по блоку, пакет `0x28` (Player Action) приземляется в switch. Хендлер должен определить, какой блок находится в позиции, убрать его и положить предмет в инвентарь :

```c
// main.c, case 0x28 (упрощённо)

void handlePlayerAction (int client_fd, uint8_t action, int x, uint8_t y, int z) {
  switch (action) {
    case START_DESTROY_BLOCK: {
      // Определить тип блока в кликнутой позиции
      uint8_t block = getBlockAt(x, y, z);

      if (block == B_chest) {
        openChest(client_fd, x, y, z);
        break;
      }

      // Добавить в block_changes
      addBlockChange(x, z, y, 0);  // 0 = воздух

      // Дать предмет игроку (доверяем клиенту)
      addItemToPlayer(client_fd, block_to_item(block), 1);

      // Отправить обновление клиенту
      sc_blockChange(client_fd, x, y, z, 0);
      sc_ackBlockChange(client_fd, x, y, z, 0);
      break;
    }
    case PLACE_BLOCK: {
      // Читать тип блока из руки игрока
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

`getBlockAt` комбинирует генерацию террейна И изменения игроков :

```c
uint8_t getBlockAt (int x, uint8_t y, int z) {
  // Сначала проверить изменения игроков
  uint8_t change = getBlockChange(x, y, z);
  if (change != 0xFF) return change;

  // Иначе читать из сгенерированного террейна
  return getTerrainBlock(x, y, z);
}
```

Приоритет изменениям, fallback на террейн. Ноль споров, ноль кэша, ноль оверхеда. `getTerrainBlock` под капотом это `getHeightAt` + слои stone/dirt/grass/coal.

### Мгновенная печь

Самое смешное : печи не существует как энтити. Если кладёшь cobblestone в клетку "готовки", а coal в "топливо", результат появляется сразу, без таймера и тиканья чанков : это просто слот инвентаря, опустошающийся, когда кладёшь правильные предметы.

![Мгновенная печь -- клади ингредиенты, результат сразу](/images/bareiron/furnace.jpg)

## Петля ESP32 : MC-сервер в 4 КБ стека

```c
// main.c, строки 732-779

#ifdef ESP_PLATFORM

void bareiron_main (void *pvParameters) {
  main();
  vTaskDelete(NULL);
}

static void wifi_event_handler (...) {
  if (/* подключено */) {
    xTaskCreate(bareiron_main, "bareiron", 4096, NULL, 5, NULL);
  }
}

void app_main () {
  esp_timer_early_init();
  wifi_init();
  // Остальное управляется event handler
}
#endif
```

Весь сервер крутится в задаче FreeRTOS с **4096 байтами стека**. Всё. Главный main thread только инициализирует WiFi и ждёт соединения. После подключения он спавнит `bareiron_main`, зовущий стандартный `main()`.

Весь специфичный для ESP32 код защищён `#ifdef ESP_PLATFORM`. На ПК всё это компилируется в стандартный POSIX-код.

## Что пожертвовали

Чтобы всё это уместилось, ванильных функций не существует :

- **Ноль сетевой компрессии** -- zlib слишком дорог. Сервер генерирует чанки быстро, но их отправка это bottleneck.
- **Ноль random ticks** -- деревья растут с bone meal или никак. Мобы спавнятся на границах чанков.
- **Ноль item-энтити** -- добытые блоки идут прямо в инвентарь. Анимация чисто визуальная.
- **Никакой проверки инвентаря** -- доверяем клиенту. 64 алмаза? ОК. Чанк, добытый за 1 сек? ОК. Использовать между доверяющими людьми.
- **Ноль серверного света** -- факелы отправляются после всего остального, клиент считает.
- **Ноль прогрессивных жидкостей** -- мгновенное финальное состояние.

## Финальный результат

Ryzen 5 3600 : ~0.5 мс на чанк.
ESP32-C3 за 1$ : ~200 мс на чанк. Играбельно.

![Бенчмарк генерации чанков -- Ryzen против ESP32](/images/bareiron/performance.jpg)

3+ игрока : тормозит. Сравнимо с 2b2t в часы пик, по словам автора.

![Несколько игроков, подключённых к одному серверу Bareiron](/images/bareiron/multiplayer.jpg)

## Философия

p2r3 : "Мне просто нравится идея, что эта крошечная чипка за 1 бак, потребляющая 0.5 Ватт, может крутить нечто продвинутое, как Minecraft. Science isn't about 'why', it's about 'why not'."

Каждая строка это tradeoff :
- Шум Перлина → интерполяция : менее красиво, в 200 раз быстрее, ноль памяти
- Матрицы крафта → захардкоженный матчинг : грязный код, ноль байтов
- zlib → ничего : плохая связь = смерть, но играбельно
- Валидация → доверие : ноль безопасности, ноль вычислений

Каждая отсутствующая функция позволяет существовать другой в лимитах железа.

**3 пункта запомнить :**

1. **Интерполяция + RNG** -- 4 засиденные точки, бесконечный террейн, ноль хранения, опрос без регенерации чанка, 200 мс генерации. Ход гения, делающий возможным всё остальное.
2. **Каждая функция стоит** -- Отсутствие компрессии, random ticks и валидации осознанный выбор : именно он позволяет уместиться в 520 КБ.
3. **Грязные хаки самые умные** -- Сундуки в таблице блоков через memcpy, голод пакетами движения, мгновенная печь. Чистое решение было бы слишком дорогим.

Если проект интересен, всё на [GitHub под GPLv3](https://github.com/p2r3/bareiron/). Это грязный хороший C, и я редко получал столько удовольствия от чтения исходника.
