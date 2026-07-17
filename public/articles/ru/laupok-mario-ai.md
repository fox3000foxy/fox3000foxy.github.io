---
title: "Laupok создал ИИ, который играет в Super Mario World сам -- как это работает"
description: "Подробный разбор проекта Laupok: ИИ на основе алгоритма NEAT, который учится играть в Super Mario World автономно. Генетические алгоритмы, нейронные сети, нейроэволюция расширяющих топологий и 4200 строк на Lua."
date: 2026-07-11
authors:
  - fox3000foxy
tags:
  - ai
  - lua
  - emulation
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "1DVfGK+QzoeXGLZ0GX+M2z+ab/D528Wb1KlAF2O/vj6BbsERo6tUm0y/y+QXLvqrYiiYBCJD88bv55g8ySUxbw=="
---

# Laupok создал ИИ, который играет в Super Mario World сам -- как это работает

Laupok создал искусственный интеллект, который играет в **Super Mario World** полностью автономно. Без заранее запрограммированных входных данных, без записанных кадров. ИИ учится сам, через случайные мутации и естественный отбор, проходить уровни игры. Проект работает на **BizHawk** -- мультиплатформенном эмуляторе -- с помощью Lua-скрипта объёмом около **4200 строк**.

Что делает этот проект таким увлекательным -- он опирается на биологические концепции, применённые к вычислениям: **теория эволюции** Дарвина, **искусственные нейронные сети** и, что самое важное, конкретный алгоритм под названием **NEAT** (NeuroEvolution of Augmenting Topologies -- нейроэволюция расширяющих топологий). В начале ИИ ничего не знает об игре. Он пробует случайные действия, терпит тысячи неудач и постепенно учится двигаться, прыгать и выживать.

В этой статье мы разберём всё -- концепция за концепцией, строка за строкой кода.

![Laupok объясняет алгоритм NEAT на камеру](/images/laupok-mario-ai/neat-title.jpg)

---

## Настройка: BizHawk, Lua и Super Mario World

### Эмулятор BizHawk

BizHawk -- это эмулятор с открытым исходным кодом, который поддерживает множество консолей -- NES, SNES, Genesis, PS1, Game Boy и многие другие. Его главная особенность -- возможность запускать **Lua-скрипты** параллельно с игрой. Эти скрипты имеют доступ к **ОЗУ** эмулятора, то есть могут читать -- и изменять -- любые игровые данные в реальном времени.

Конкретно это значит, что вы можете:
- Прочитать позицию Марио на уровне
- Узнать, какие спрайты (враги, предметы) находятся на экране
- Узнать состояние каждого тайла (блока) вокруг Марио
- Управлять контроллером -- нажимать любую кнопку

Это именно то, что нужно для запуска ИИ.

### Адреса памяти Super Mario World

В ОЗУ Super Mario World каждая единица данных хранится по определённому адресу. Это как район: каждый адрес соответствует «дому», в котором находится одна конкретная информация. Например:

| Адрес | Данные |
|-------|--------|
| `0x94`-`0x95` | Позиция Марио по X (16-бит, little-endian) |
| `0x96`-`0x97` | Позиция Марио по Y |
| `0x14C8`+`i` | Состояние спрайта `i` (>7 = жив) |
| `0xE4`+`i` | Младший байт позиции X спрайта `i` |
| `0x14E0`+`i` | Старший байт позиции X спрайта `i` |
| `0xD8`+`i` | Младший байт позиции Y спрайта `i` |
| `0x14D4`+`i` | Старший байт позиции Y спрайта `i` |
| `0x170B`+`i` | Тип расширенного спрайта `i` |
| `0x0100` | Состояние игры (12 = уровень пройден) |
| `0x13D4` | Пауза активна |
| `0x0071` | Анимация смерти Марио (9 = мёртв) |
| `0x1C800`+... | Таблица тайлов уровня |

Позиции спрайтов используют два байта -- «младший» и «старший», потому что позиция может превышать 255 пикселей. Формула всегда: `младший + старший × 256`.

С тайлами всё сложнее: базовый адрес -- `0x1C800`, а смещение рассчитывается на основе координат `x` и `y` тайла в мире, с шагом 16 пикселей на тайл.

![Super Mario World с отладочным оверлеем, показывающим адреса памяти спрайтов и позицию Марио](/images/laupok-mario-ai/memory-debug.jpg)

---

## Основы: генетические алгоритмы и нейронные сети

Прежде чем погружаться в код, нужно понять два фундаментальных концепта. Без них остальное не будет иметь смысла.

### Генетические алгоритмы

Генетический алгоритм -- это моделирование **теории эволюции**. Ключевая идея: вы создаёте **популяцию** особей, каждая с несколько различными характеристиками («генами»). Вы позволяете им «жить» в среде. Те, кто лучше справляется, выживают и размножаются. Те, кто хуже, вымирают.

Laupok иллюстрирует это на примере **Кирби**:
- Популяция Кирби появляется на местности с шипами и помидорами
- Шипы отнимают очки здоровья, помидоры восстанавливают
- У каждого Кирби есть гены: размер, скорость, здоровье, поведение (убегать, искать помидоры, бежать вслепую)

![ДНК двойная спираль с подписями «the baby», «size», «speed», «color» -- гены, из которых состоит особь](/images/laupok-mario-ai/dna-genes.jpg)

- Через 15 секунд проверяется, кто продержался дольше всех
- Лучший Кирби спаривается с остальными: дети наследуют половину генов лучшего и половину «худшего»
- Дети подвергаются случайным **мутациям** (чуть больше, чуть быстрее...)
- Старые Кирби заменяются новыми
- Начинается заново

Через 180 поколений (~15 часов) Кирби переходят от 15 секунд выживания до **15 минут**. Они стали крошечными (меньший хитбокс), быстрыми и постоянно убегают от опасности.

![Моделирование Кирби, поколение 0: разноцветные круги, случайно рассыпанные на чёрном фоне, все примерно одного размера](/images/laupok-mario-ai/kirby-gen0.jpg)

![Моделирование Кирби, поколение 1866: Кирби стали меньше, быстрее и систематически убегают от опасности](/images/laupok-mario-ai/kirby-gen1866.jpg)

![Статистика моделирования Кирби: фитнес, здоровье, поведение каждой особи, ранжированные по производительности](/images/laupok-mario-ai/kirby-stats.jpg)

Ключевой момент: **вы не определяете решение**. Алгоритм **находит его сам**. И именно в этом его сила для задач, где вы не знаете, какой набор параметров будет оптимальным.

### Искусственные нейронные сети

Нейронная сеть -- это упрощённая математическая модель человеческого мозга. Она состоит из:
- **Входных нейронов**: то, что сеть «видит»
- **Выходных нейронов**: то, что сеть «решает»
- **Связей (весов)**: каждая связь имеет **вес**, который усиливает или ослабляет сигнал

Принцип прост: каждый входной нейрон отправляет своё значение. Оно умножается на вес связи, затем складывается с другими сигналами. Если результат превышает определённый порог (**функция активации**), выходной нейрон срабатывает.

В аналогии Laupok с Марио и курсором мыши:
- Входной нейрон = расстояние между Марио и курсором
- Вес связи = чувствительность Марио
- Выходной нейрон = Марио кричит или нет

Чем ближе курсор, тем выше входное значение. Если вес большой, выходной сигнал сильный, и Марио закричит. Изменяя вес, вы меняете чувствительность Марио.

![Демо «Марио испуган»: Марио стоит перед Бу, полоска синапса показывает вес связи между входом и выходом](/images/laupok-mario-ai/mario-fear-demo.jpg)

В нейронной сети реального ИИ та же логика, но в гораздо большем масштабе:
- **99 входных нейронов** (11×9 тайлов обзора Марио)
- **8 выходных нейронов** (A, B, X, Y, вверх, вниз, влево, вправо)
- **Скрытые нейроны** между ними
- Сотни связей с различными весами

---

## NEAT: алгоритм, который меняет всё

### Проблема простых генетических алгоритмов

Если наивно скомбинировать генетический алгоритм с нейронной сетью, возникает проблема: вы создаёте 100 совершенно разных нейронных сетей и не можете их сравнить. У каждой свои нейроны, связи и веса. Как узнать, похожи две сети или «различны»?

Именно здесь на помощь приходит **NEAT** -- NeuroEvolution of Augmenting Topologies (нейроэволюция расширяющих топологий). Изобретённый **Кеннетом Стэнли** и **Ристо Мииккулайненом** в 2002 году, он решает именно эту проблему.

### Виды (Species)

Первый ключевой механизм NEAT -- **виды**. Когда нейронная сеть становится слишком отличающейся от другой, она классифицируется в другой вид. Сходство рассчитывается через три параметра:

1. **Избыточные** (`EXCES_COEF = 0.50`): количество связей, которые не имеют ничего общего между двумя сетями (разные инновации)
2. **Разобщённые**: то же самое, но для связей в середине
3. **Разница весов** (`POIDSDIFF_COEF = 0.92`): средняя разница весов между связями с одинаковой инновацией

Формула оценки:

```
score = (EXCES_COEF × disjoint) / max(nbConnexions1 + nbConnexions2, 1)
      + POIDSDIFF_COEF × diffPoids
```

Если эта оценка ниже `DIFF_LIMITE` (1.0), две сети принадлежат к одному виду. В противном случае создаётся новый вид.

### Инновации

Это гений NEAT. Каждый раз при создании связи она получает уникальный, глобальный номер **инновации**. Этот номер следует за нейронной сетью даже при размножении.

Конкретно: когда ребёнок создаётся через скрещивание, он наследует инновации родителей. Если две сети разделяют одну и ту же инновацию -- это значит, что у них есть связь от общего предка. Именно это позволяет сравнивать сети разных размеров.

### Скрещивание

При размножении двух нейронных сетей **скрещивание** работает так:

![Laupok объясняет концепцию скрещивания с текстом «CROSSOVER» поверх видео](/images/laupok-mario-ai/crossover-label.jpg)

1. Сеть с лучшими показателями становится «доминантным родителем»
2. Ребёнок наследует все связи от доминанта
3. Для каждой связи с одинаковой инновацией другой родитель может заменить её (50% вероятность)
4. Заменять могут только активные связи от не-доминантного родителя

Это гарантирует, что ребёнок всегда будет как минимум так же хорош, как лучший родитель.

### Мутации

После скрещивания ребёнок подвергается мутациям с настраиваемой вероятностью:

![Laupok объясняет мутации с текстом «(small modif = mutation)» поверх видео](/images/laupok-mario-ai/mutation-label.jpg)

| Мутация | Вероятность | Эффект |
|---------|-------------|--------|
| Сброс веса связи | 25% | Вес полностью рандомизируется |
| Мутация веса | 95% | Вес изменяется на ±0.80 |
| Добавление связи | 85% | Новая связь между двумя несвязанными нейронами |
| Добавление нейрона | 39% | Между двумя связанными нейронами вставляется скрытый нейрон |

Частота добавления нейронов важна: именно она позволяет сети **расти**. В начале есть только входы и выходы. Постепенно появляются скрытые нейроны, делая сеть всё более и более сложной.

---

## Код: полный разбор

### Константы

Скрипт начинается с блока констант, определяющих все настройки:

```lua
-- Обзор Марио вокруг него
TAILLE_TILE = 16
TAILLE_VUE_W = TAILLE_TILE * 11  -- 176 пикселей в ширину
TAILLE_VUE_H = TAILLE_TILE * 9   -- 144 пикселей в высоту
NB_TILE_W = TAILLE_VUE_W / TAILLE_TILE  -- 11 тайлов
NB_TILE_H = TAILLE_VUE_H / TAILLE_TILE  -- 9 тайлов

-- Нейронная сеть
NB_INPUT = NB_TILE_W * NB_TILE_H  -- 99 входов (видимые тайлы)
NB_OUTPUT = 8  -- A, B, X, Y, вверх, вниз, влево, вправо
NB_INDIVIDU_POPULATION = 100  -- особей в популяции
NB_NEURONE_MAX = 100000  -- максимум скрытых нейронов

-- Фитнес
FITNESS_LEVEL_FINI = 1000000  -- значение при прохождении уровня
NB_FRAME_RESET_BASE = 33  -- кадров без прогресса до сброса
NB_FRAME_RESET_PROGRES = 300  -- кадров, если обнаружен прогресс

-- Виды
EXCES_COEF = 0.50
POIDSDIFF_COEF = 0.92
DIFF_LIMITE = 1.00

-- Мутации
CHANCE_MUTATION_RESET_CONNEXION = 0.25
POIDS_CONNEXION_MUTATION_AJOUT = 0.80
CHANCE_MUTATION_POIDS = 0.95
CHANCE_MUTATION_CONNEXION = 0.85
CHANCE_MUTATION_NEURONE = 0.39
```

`NB_INPUT` равен 99, потому что обзор Марио составляет 11×9 тайлов. Каждый тайл -- входной нейрон. Пустой тайл = 0. Блок = 1. Враг = -1.

8 выходов соответствуют кнопкам контроллера SNES: A, B, X, Y, вверх, вниз, влево, вправо. Start, Select, L и R исключены, чтобы не «отвлекали» Марио.

### Структуры данных

Скрипт определяет три основные структуры:

```lua
function newNeurone()
    local neurone = {}
    neurone.valeur = 0    -- текущее значение нейрона
    neurone.id = 0        -- уникальный идентификатор
    neurone.type = ""     -- "input", "output" или "hidden"
    return neurone
end

function newConnexion()
    local connexion = {}
    connexion.entree = 0     -- ID исходного нейрона
    connexion.sortie = 0     -- ID целевого нейрона
    connexion.actif = true   -- может быть отключён, если вставляется скрытый нейрон
    connexion.poids = 0      -- вес связи
    connexion.innovation = 0 -- уникальный номер инновации
    connexion.allume = false -- для отображения: true, если сигнал проходит
    return connexion
end

function newReseau()
    local reseau = {
        nbNeurone = 0,        -- количество скрытых нейронов
        fitness = 1,          -- производительность (пройденное расстояние)
        idEspeceParent = 0,   -- к какому виду принадлежит
        lesNeurones = {},     -- массив нейронов
        lesConnexions = {}    -- массив связей
    }
    -- Инициализация входами
    for j = 1, NB_INPUT, 1 do
        ajouterNeurone(reseau, j, "input", 1)
    end
    -- Затем выходами
    for j = NB_INPUT + 1, NB_INPUT + NB_OUTPUT, 1 do
        ajouterNeurone(reseau, j, "output", 0)
    end
    return reseau
end
```

В начале у каждой сети есть только входы и выходы. Нет скрытых нейронов, нет связей. Алгоритм сам решает, нужны ли они.

### Мутации подробно

#### Мутация весов

```lua
function mutationPoidsConnexions(unReseau)
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            if math.random() < CHANCE_MUTATION_RESET_CONNEXION then
                -- 25%: полный сброс веса
                unReseau.lesConnexions[i].poids = genererPoids()
            else
                -- 75%: изменение на ±0.80
                if math.random() >= 0.5 then
                    unReseau.lesConnexions[i].poids =
                        unReseau.lesConnexions[i].poids - POIDS_CONNEXION_MUTATION_AJOUT
                else
                    unReseau.lesConnexions[i].poids =
                        unReseau.lesConnexions[i].poids + POIDS_CONNEXION_MUTATION_AJOUT
                end
            end
        end
    end
end
```

Начальный вес всегда 1 или -1 (`genererPoids()`). Изменение на ±0.80 может перекинуть его между отрицательным и положительным значениями, радикально меняя поведение сети.

#### Добавление связи

```lua
function mutationAjouterConnexion(unReseau)
    local liste = {}
    -- Перемешать список нейронов
    for i, v in ipairs(unReseau.lesNeurones) do
        local pos = math.random(1, #liste+1)
        table.insert(liste, pos, v)
    end

    local traitement = false
    for i = 1, #liste, 1 do
        for j = 1, #liste, 1 do
            if i ~= j then
                local n1 = liste[i]
                local n2 = liste[j]
                -- Допустимая связь: вход→выход, скрытый→скрытый, скрытый→выход
                if (n1.type == "input" and n2.type == "output") or
                   (n1.type == "hidden" and n2.type == "hidden") or
                   (n1.type == "hidden" and n2.type == "output") then
                    -- Проверка: связь уже не существует
                    local dejaConnexion = false
                    for k = 1, #unReseau.lesConnexions, 1 do
                        if unReseau.lesConnexions[k].entree == n1.id
                            and unReseau.lesConnexions[k].sortie == n2.id then
                            dejaConnexion = true
                            break
                        end
                    end
                    if dejaConnexion == false then
                        traitement = true
                        ajouterConnexion(unReseau, n1.id, n2.id)
                    end
                end
            end
            if traitement then break end
        end
        if traitement then break end
    end
end
```

Нельзя соединить выход с входом (это создало бы цикл) и нельзя соединить два уже связанных нейрона. Перемешивание гарантирует, что каждый раз исследуются разные возможности.

#### Добавление нейрона

Это самая интересная мутация:

```lua
function mutationAjouterNeurone(unReseau)
    if #unReseau.lesConnexions == 0 then return nil end
    if unReseau.nbNeurone == NB_NEURONE_MAX then return nil end

    -- Перемешать связи
    local listeRandom = {}
    for i = 1, #unReseau.lesConnexions, 1 do
        local pos = math.random(1, #listeRandom+1)
        table.insert(listeRandom, pos, i)
    end

    for i = 1, #listeRandom, 1 do
        if unReseau.lesConnexions[listeRandom[i]].actif then
            -- Отключить существующую связь
            unReseau.lesConnexions[listeRandom[i]].actif = false
            unReseau.nbNeurone = unReseau.nbNeurone + 1
            local indice = unReseau.nbNeurone + NB_INPUT + NB_OUTPUT

            -- Создать скрытый нейрон
            ajouterNeurone(unReseau, indice, "hidden", 1)

            -- Соединить вход со скрытым нейроном
            ajouterConnexion(unReseau,
                unReseau.lesConnexions[listeRandom[i]].entree,
                indice, genererPoids())

            -- Соединить скрытый нейрон с выходом
            ajouterConnexion(unReseau,
                indice,
                unReseau.lesConnexions[listeRandom[i]].sortie,
                genererPoids())
            break
        end
    end
end
```

Механизм: вы берёте существующую связь, **отключаете** её и вставляете в середину скрытый нейрон. Исходная связь заменяется двумя новыми: вход→скрытый и скрытый→выход. Это как разрезать провод, чтобы вставить в него переключатель.

Именно это делает NEAT «расширяющим топологии»: сеть **растёт** со временем. Она начинается простой и становится сложной только при необходимости.

### FeedForward

Это функция, которая распространяет сигналы по сети:

```lua
function feedForward(unReseau)
    -- Сбросить выходные нейроны
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur = 0
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].allume = false
        end
    end

    -- Распространение
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            local avantTraitement = unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur =
                unReseau.lesNeurones[unReseau.lesConnexions[i].entree].valeur *
                unReseau.lesConnexions[i].poids +
                unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur

            if avantTraitement ~= unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur then
                unReseau.lesConnexions[i].allume = true
            else
                unReseau.lesConnexions[i].allume = false
            end
        end
    end
end
```

Каждая активная связь отправляет `значение_входа × вес` на выходной нейрон. Значение **накапливается** (складывается). Флаг `allume` используется только для визуального отображения сети.

### Чтение памяти игры

Функция `getLesInputs()` превращает мир Super Mario World в данные, которые сеть может понять:

```lua
function getLesInputs()
    local lesInputs = {}
    -- Инициализация нулями (серый = пусто)
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            lesInputs[getIndiceLesInputs(i, j)] = 0
        end
    end

    -- Спрайты (враги) = -1 (чёрный)
    local lesSprites = getLesSprites()
    for i = 1, #lesSprites, 1 do
        local input = convertirPositionPourInput(getLesSprites()[i])
        if input.x > 0 and input.x < (TAILLE_VUE_W / TAILLE_TILE) + 1 then
            lesInputs[getIndiceLesInputs(input.x, input.y)] = -1
        end
    end

    -- Тайлы (блоки) = значение тайла (белый если > 0)
    local lesTiles = getLesTiles()
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            local indice = getIndiceLesInputs(i, j)
            if lesTiles[indice] ~= 0 then
                lesInputs[indice] = lesTiles[indice]
            end
        end
    end

    return lesInputs
end
```

Входная сетка -- вид, центрированный на Марио: 11 тайлов в ширину, 9 в высоту. Значение каждого тайла:
- **0** (серый): пусто
- **1** (белый): сплошной блок
- **-1** (чёрный): враг

Враги считываются из двух списков в ОЗУ: обычные спрайты (`0x14C8`-`0x14F8`) и расширенные спрайты (`0x170B`-`0x173B`). Для каждого живого спрайта (состояние > 7) вычисляется его тайловая позиция относительно Марио, и в соответствующую ячейку записывается -1.

### Фитнес: как ИИ понимает, что он прогрессирует

```lua
function majReseau(unReseau, marioBase)
    local mario = getPositionMario()

    if not niveauFini and memory.readbyte(0x0100) == 12 then
        -- Уровень пройден!
        unReseau.fitness = FITNESS_LEVEL_FINI
        niveauFini = true
    elseif marioBase.x < mario.x then
        -- Марио двигается вправо
        unReseau.fitness = unReseau.fitness + (mario.x - marioBase.x)
        marioBase.x = mario.x
    end

    -- Обновление входов
    local lesInputs = getLesInputs()
    for i = 1, NB_INPUT, 1 do
        unReseau.lesNeurones[i].valeur = lesInputs[i]
    end
end
```

Фитнес прост: это **расстояние, пройденное вправо**. Если Марио переместился на 10 пикселей, фитнес увеличивается на 10. Если Марио двигается влево -- ничего не происходит (нет штрафа). Если уровень пройден (адрес `0x0100` == 12), фитнес становится 1 000 000.

Это намеренно просто. Нет бонусов за убийство врагов, нет штрафов за смерть. Только: двигайся вправо.

### Умный сброс

Если Марио не двигается в течение 33 кадров, уровень сбрасывается и мы переходим к следующей особи. Но если Марио продвинулся вперёд (текущий фитнес отличается от начального), мы ждём 300 кадров -- давая сети шанс «понять», что она сделала правильно.

```lua
if fitnessAvant == laPopulation[idPopulation].fitness
   and memory.readbyte(0x13D4) == 0 then
    nbFrameStop = nbFrameStop + 1
    local nbFrameReset = NB_FRAME_RESET_BASE
    if fitnessInit ~= laPopulation[idPopulation].fitness
       and memory.readbyte(0x0071) ~= 9 then
        nbFrameReset = NB_FRAME_RESET_PROGRES
    end
    if nbFrameStop > nbFrameReset then
        nbFrameStop = 0
        lancerNiveau()
        idPopulation = idPopulation + 1
        -- ...
    end
end
```

Условие `memory.readbyte(0x0071) ~= 9` проверяет, что Марио не в анимации смерти. Нет смысла сбрасывать, если Марио уже мёртв.

### Основной цикл

Цикл работает на 30 кадров в секунду (нормальная скорость Super Mario World):

```lua
while true do
    local fitnessAvant = laPopulation[idPopulation].fitness

    -- Отображение (сеть, информация)
    if forms.ischecked(estAccelere) then
        emu.limitframerate(false)  -- ускорение
    else
        emu.limitframerate(true)   -- 30 fps
    end

    -- Три жизненно важные функции
    majReseau(laPopulation[idPopulation], marioBase)
    feedForward(laPopulation[idPopulation])
    appliquerLesBoutons(laPopulation[idPopulation])

    emu.frameadvance()
    nbFrame = nbFrame + 1

    -- Сброс при отсутствии прогресса
    -- ...
    -- Новое поколение, если все особи проверены
    -- ...
end
```

Три жизненно важные функции -- `majReseau`, `feedForward` и `appliquerLesBoutons`. Отключите любую из них, и Марио перестанет двигаться.

### Скрещивание

```lua
function crossover(unReseau1, unReseau2)
    local leReseau = newReseau()
    local leBon = unReseau1
    local leNul = unReseau2

    if leBon.fitness < leNul.fitness then
        leBon = unReseau2
        leNul = unReseau1
    end

    leReseau = copier(leBon)

    for i = 1, #leReseau.lesConnexions, 1 do
        for j = 1, #leNul.lesConnexions, 1 do
            if leReseau.lesConnexions[i].innovation == leNul.lesConnexions[j].innovation
               and leNul.lesConnexions[j].actif then
                if math.random() > 0.5 then
                    leReseau.lesConnexions[i] = leNul.lesConnexions[j]
                end
            end
        end
    end
    leReseau.fitness = 1
    return leReseau
end
```

Ребёнок наследует от лучшего родителя. Для каждой связи с одинаковой инновацией другой родитель имеет 50% шанс заменить её -- но **только если связь активна**. Это важное исправление: без него могли бы создаваться бесполезные скрытые нейроны.

### Отбор по видам

```lua
function nouvelleGeneration(laPopulation, lesEspeces)
    local laNouvellePopulation = newPopulation()
    local nbIndividuACreer = NB_INDIVIDU_POPULATION

    -- Расчёт среднего фитнеса для каждого вида
    for i = 1, #lesEspeces, 1 do
        lesEspeces[i].fitnessMoyenne = 0
        for j = 1, #lesEspeces[i].lesReseaux, 1 do
            lesEspeces[i].fitnessMoyenne =
                lesEspeces[i].fitnessMoyenne + lesEspeces[i].lesReseaux[j].fitness
        end
        lesEspeces[i].fitnessMoyenne =
            lesEspeces[i].fitnessMoyenne / #lesEspeces[i].lesReseaux
    end

    -- Каждый вид создаёт количество детей, пропорциональное его среднему фитнесу
    for i = 1, #lesEspeces, 1 do
        local nbEnfant = math.ceil(
            #lesEspeces[i].lesReseaux *
            lesEspeces[i].fitnessMoyenne / fitnessMoyenneGlobal)

        for j = 1, nbEnfant, 1 do
            local unReseau = crossover(
                choisirParent(lesEspeces[i].lesReseaux),
                choisirParent(lesEspeces[i].lesReseaux))
            mutation(unReseau)
            laNouvellePopulation[indiceNouvelleEspece] = copier(unReseau)
        end
    end
end
```

Суть: вид со средним фитнесом 10 000 создаёт гораздо больше детей, чем вид со средним фитнесом 1. Это и есть **естественный отбор** в действии.

`choisirParent` использует рулеточный отбор: чем выше фитнес особи, тем больше вероятность, что она будет выбрана родителем.

### Сохранение и загрузка

Популяции сохраняются в файлы `.pop`:

```lua
function sauvegarderUnReseau(unReseau, fichier)
    io.write(unReseau.nbNeurone .. "\n")
    io.write(#unReseau.lesConnexions .. "\n")
    io.write(unReseau.fitness .. "\n")
    for i = 1, unReseau.nbNeurone, 1 do
        local indice = NB_INPUT + NB_OUTPUT + i
        io.write(unReseau.lesNeurones[indice].id .. "\n")
    end
    for i = 1, #unReseau.lesConnexions, 1 do
        local actif = 1
        if unReseau.lesConnexions[i].actif ~= true then actif = 0 end
        io.write(actif .. "\n" ..
            unReseau.lesConnexions[i].entree .. "\n" ..
            unReseau.lesConnexions[i].sortie .. "\n" ..
            unReseau.lesConnexions[i].poids .. "\n" ..
            unReseau.lesConnexions[i].innovation .. "\n")
    end
end
```

Сохранение также включает лучшую особь из всех предыдущих популяций. Если лучшая особь старой популяции лучше новой, мы возвращаемся к старой как к основе. Это форма **элитизма**: лучшее никогда не теряется.

### Визуализация сети

Laupok добавил визуализатор нейронной сети, наложенный на игру:

```lua
function dessinerUnReseau(unReseau)
    -- Входы: сетка 11×9 вокруг Марио
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            local xT = ENCRAGE_X_INPUT + (i - 1) * TAILLE_INPUT
            local yT = ENCRAGE_Y_INPUT + (j - 1) * TAILLE_INPUT
            local couleurFond = "gray"
            if unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur < 0 then
                couleurFond = "black"   -- враг
            elseif unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur > 0 then
                couleurFond = "white"   -- блок
            end
            gui.drawRectangle(xT, yT, TAILLE_INPUT, TAILLE_INPUT, "black", couleurFond)
        end
    end

    -- Выходы: 8 кнопок
    for i = 1, NB_OUTPUT, 1 do
        local xT = ENCRAGE_X_OUTPUT
        local yT = ENCRAGE_Y_OUTPUT + ESPACE_Y_OUTPUT * (i - 1)
        if sigmoid(unReseau.lesNeurones[i + NB_INPUT].valeur) then
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "white")
        else
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "black")
        end
    end

    -- Связи
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            local alpha = 25
            if unReseau.lesConnexions[i].allume then alpha = 255 end
            local couleur = forms.createcolor(255, 255, 255, alpha)
            gui.drawLine(
                lesPositions[unReseau.lesConnexions[i].entree].x,
                lesPositions[lesConnexions[i].entree].y,
                lesPositions[unReseau.lesConnexions[i].sortie].x,
                lesPositions[lesConnexions[i].sortie].y,
                couleur)
        end
    end
end
```

Это невероятно полезно для понимания того, что делает сеть. Активные связи -- белые, неактивные -- полупрозрачные. Входы -- сетка белых/чёрных/серых ячеек. Выходы показывают, какие кнопки нажимаются.

---

## Результаты

### Чему научился ИИ

За часы (и дни) выполнения ИИ самостоятельно обнаружил:

1. **Двигаться вправо**: самое базовое поведение, но требующее удержания кнопки «Вправо»
2. **Прыгать через врагов**: соединив вход «обнаружен враг» с кнопкой A или B
3. **Избегать препятствий**: некоторые сети научились временно отступать, чтобы продвинуться дальше
4. **Проходить уровни**: лучшая особь смогла пройти первый уровень Super Mario World

![Марио под управлением ИИ, встречающий Бу на уровне Super Mario World -- нейронная сеть принимает решения в реальном времени](/images/laupok-mario-ai/mario-ai-playing.jpg)

### Ограничения

У проекта есть свои ограничения:

- **Один уровень**: ИИ обучается на одном конкретном уровне. Он не обобщает автоматически на другие уровни
- **Время обучения**: нужны десятки часов для достижения удовлетворительных результатов
- **Нет понимания**: ИИ не «понимает», что он делает. Он оптимизирует функцию фитнеса (пройденное расстояние) через случайные мутации
- **Т-бэггинг**: Laupok отмечает, что Марио имеет тенденцию прыгать на месте при виде врага, просто потому что это увеличивает фитнес (он немного продвигается вперёд при прыжке)

---

## Как воспроизвести эксперимент

Laupok поделился всем. Вот шаги:

1. **Скачайте BizHawk** на [tasvideos.org](https://tasvideos.org/BizHawk) (раздел Download)
2. **Получите ROM Super Mario World для США** (личная копия с вашей собственной картриджа)
3. **Скачайте Lua-скрипт** с [Pastebin](https://pastebin.com/Jcvdqhqm) -- переименуйте в `mario.lua`
4. **Поместите скрипт в ту же папку, что и ROM**
5. **Запустите BizHawk**, откройте ROM
6. **В Lua-консоли**: `dofile("mario.lua")` или через меню Script > Open Script
7. **Сохраните состояние** в начале уровня (меню Savestate > Save State) и назовите `debut.state`
8. **Перезапустите скрипт** -- он работает

Скрипт включает форму с настройками:
- **Ускорение**: отключает лимит 30 кадров в секунду для ускорения
- **Показать сеть**: отображает нейронную сеть поверх игры
- **Показать информацию**: отображает баннер с поколением, фитнесом и количеством видов
- **Пауза**: приостанавливает выполнение
- **Сохранить/Загрузить**: сохраняет текущую популяцию в файл `.pop`

---

## Источники и ссылки

| Ресурс | Ссылка |
|--------|--------|
| Основное видео Laupok | [I built an AI that plays Mario by itself](https://www.youtube.com/watch?v=F63GNXGHVwM) |
| Обзор кода + видео настройки | [How to set up the AI + source code review](https://www.youtube.com/watch?v=u5xCl1bSe6o) |
| Полный исходный код | [Pastebin Jcvdqhqm](https://pastebin.com/Jcvdqhqm) |
| Оригинальная статья по NEAT | Stanley & Miikkulainen, "Evolving Neural Networks through Augmenting Topologies", 2002 |
| Руководство N8Programs | [NEAT implementation walkthrough](https://n8programs.github.io/) (JavaScript, но концепции идентичны) |
| 16blings (вдохновение для Laupok) | [AI plays Super Mario World](https://www.youtube.com/watch?v=qv6IFaOz3bA) |
| BizHawk | [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) |
| Память Super Mario World | [SMW Central - RAM Map](https://www.smwcentral.net/?p=section&a=details&id=21702) |

---

## Заключение

То, что сделал Laupok -- взял академический алгоритм (NEAT, 2002), переписал его на Lua для эмулятора (BizHawk) и применил к Super Mario World. Результат: ИИ, который учится с нуля играть в игру, без каких-либо предварительных знаний, только через случайные мутации и естественный отбор.

Это прекрасный пример силы генетических алгоритмов. Без глубокого обучения, без GPU, миллионов обучающих данных. Только естественный отбор, немного Lua и много терпения.

Код комментирован, опубликован, и Laupok записал два объясняющих видео -- одно для основных концепций, другое для разбора кода. Если тема вас заинтересовала -- погружайтесь. Это доступнее, чем кажется.
