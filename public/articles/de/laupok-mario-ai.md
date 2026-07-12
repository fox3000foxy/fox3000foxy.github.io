---
title: "Laupok hat eine KI gebaut, die Super Mario World alleine spielt -- so funktioniert sie"
description: "Ein tiefer Einblick in Laupoks Projekt: Eine NEAT-basierte KI, die lernt, Super Mario World autonom zu spielen. Genetische Algorithmen, neuronale Netze, Neuroevolution augmentierender Topologien und 4200 Zeilen Lua."
date: 2026-07-11authors:
  - fox3000foxy
tags:
  - ai
  - lua
  - emulation
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "hpXsVnmAfX3qNc+tPcNnKJ/7ws+CEf5X7+vBDn9YPaq0yfsXIdeCshdUxxIJ8tHhDAWE8zhf2xv1Sw5aFBNpDA=="
---

# Laupok hat eine KI gebaut, die Super Mario World alleine spielt -- so funktioniert sie

Laupok hat eine künstliche Intelligenz gebaut, die **Super Mario World** vollständig autonom spielt. Keine vordefinierten Eingaben, keine aufgezeichneten Frames. Die KI lernt eigenständig, durch zufällige Mutationen und natürliche Selektion, die Level des Spiels zu absolvieren. Das Projekt läuft auf **BizHawk**, einem Multiplattform-Emulator, über ein Lua-Skript von etwa **4200 Zeilen**.

Was dieses Projekt faszinierend macht, ist, dass es auf biologischen Konzepten basiert, die auf die Informatik angewendet werden: Darwins **Theorie der Evolution**, **künstliche neuronale Netze** und vor allem ein spezifischer Algorithmus namens **NEAT** (NeuroEvolution of Augmenting Topologies). Die KI weiß zu Beginn nichts über das Spiel. Sie probiert zufällige Dinge aus, scheitert Tausende von Malen und findet heraus, wie man sich bewegt, springt und überlebt.

In diesem Artikel werden wir alles aufschlüsseln -- Konzept für Konzept, Codezeile für Codezeile.

![Laupok stellt den NEAT-Algorithmus vor der Kamera vor](/images/laupok-mario-ai/neat-title.jpg)

---

## Die Konfiguration: BizHawk, Lua und Super Mario World

### Der BizHawk-Emulator

BizHawk ist ein Open-Source-Emulator, der viele Konsolen unterstützt -- NES, SNES, Genesis, PS1, Game Boy und viele mehr. Sein Hauptmerkmal ist, dass er **Lua-Skripte** zusammen mit dem Spiel ausführen kann. Diese Skripte haben Zugriff auf den **RAM** (Arbeitsspeicher) der Emulation, was bedeutet, dass sie beliebige Spieldaten in Echtzeit lesen -- und modifizieren -- können.

Konkret bedeutet das, dass du:
- Marios Position im Level lesen kannst
- Wissen kannst, welche Sprites (Gegenstände, Feinde) auf dem Bildschirm sind
- Den Zustand jedes Blocks um Mario kennen kannst
- Den Controller steuern -- jeden Button drücken kannst

Das ist genau das, was du brauchst, damit eine KI spielt.

### Super Mario Worlds Speicheradressen

In Super Mario Worlds RAM werden alle Daten an einer bestimmten Adresse gespeichert. Es ist wie eine Nachbarschaft: Jede Adresse entspricht einem "Haus", das ein Stück Information enthält. Zum Beispiel:

| Adresse | Daten |
|---------|-------|
| `0x94`-`0x95` | Marios X-Position (16-Bit, Little-Endian) |
| `0x96`-`0x97` | Marios Y-Position |
| `0x14C8`+`i` | Sprite `i` Status (>7 = lebendig) |
| `0xE4`+`i` | Sprite `i` niedrige X-Position |
| `0x14E0`+`i` | Sprite `i` hohe X-Position |
| `0xD8`+`i` | Sprite `i` niedrige Y-Position |
| `0x14D4`+`i` | Sprite `i` hohe Y-Position |
| `0x170B`+`i` | Erweitertes Sprite `i` Typ |
| `0x0100` | Spielstatus (12 = Level beendet) |
| `0x13D4` | Pause aktiv |
| `0x0071` | Marios Todesanimation (9 = tot) |
| `0x1C800`+... | Level-Tile-Tabelle |

Sprite-Positionen verwenden zwei Bytes: ein "niedriges" und ein "hohes" Byte, weil die Position 255 Pixel überschreiten kann. Die Formel ist immer `niedrig + hoch × 256`.

Bei Tiles ist es komplizierter: Die Basisadresse ist `0x1C800`, und du berechnest den Offset basierend auf den `x`- und `y`-Koordinaten des Tiles in der Welt, mit einem Schritt von 16 Pixeln pro Tile.

![Super Mario World mit einer Debug-Overlay, die Sprite-Speicheradressen und Marios Position zeigt](/images/laupok-mario-ai/memory-debug.jpg)

---

## Die Grundlagen: genetische Algorithmen und neuronale Netze

Bevor wir in den Code eintauchen, musst du zwei grundlegende Konzepte verstehen. Ohne sie macht nichts anderes Sinn.

### Genetische Algorithmen

Ein genetischer Algorithmus ist eine Simulation der **Theorie der Evolution**. Die Kernidee: Du erstellst eine **Population** von Individuen, jedes mit leicht unterschiedlichen Eigenschaften ("Genen"). Du lässt sie in einer Umgebung "leben". Diejenigen, die am besten abschneiden, überleben und pflanzen sich fort. Diejenigen, die schlecht abschneiden, sterben aus.

Laupok veranschaulicht dies mit einer **Kirby**-Analogie:
- Eine Population von Kirbys erscheint auf einem Gelände mit Dornen und Tomaten
- Dornen nehmen Lebenspunkte, Tomaten stellen sie wieder her
- Jeder Kirby hat Gene: Größe, Geschwindigkeit, Lebenspunkte, Verhalten (fliehen, Tomaten suchen, blind rennen)

![Doppelhelix-DNA mit Beschriftungen "the baby", "size", "speed", "color" -- die Gene, die ein Individuum ausmachen](/images/laupok-mario-ai/dna-genes.jpg)

- Nach 15 Sekunden prüfst du, wer am längsten überlebt hat
- Der beste Kirby paart sich mit den anderen: Babys erben die Hälfte der Gene des Besten und die Hälfte der "Schlechtesten"
- Babys erleiden zufällige **Mutationen** (etwas größer, etwas schneller...)
- Alte Kirbys werden durch die neuen ersetzt
- Du startest neu

Nach 180 Generationen (~15 Stunden) gehen Kirbys von 15 Sekunden Überlebenszeit auf **15 Minuten** über. Sie wurden kleiner (kleinere Trefferbox), schneller und fliehen ständig vor Gefahr.

![Kirby-Simulation Generation 0: bunte Kreise zufällig auf schwarzem Hintergrund verteilt, alle ähnlich groß](/images/laupok-mario-ai/kirby-gen0.jpg)

![Kirby-Simulation Generation 1866: Kirbys sind kleiner, schneller und fliehen systematisch vor Gefahr](/images/laupok-mario-ai/kirby-gen1866.jpg)

![Kirby-Simulationsstatistiken: Fitness, Lebenspunkte, Verhalten jedes Individuums nach Leistung geordnet](/images/laupok-mario-ai/kirby-stats.jpg)

Der entscheidende Punkt: **Du definierst nicht die Lösung**. Der Algorithmus **findet sie von selbst**. Und genau das macht ihn so mächtig für Probleme, bei denen du nicht weißt, welche Kombination optimaler Parameter die beste wäre.

### Künstliche neuronale Netze

Ein neuronales Netz ist ein vereinfachtes mathematisches Modell des menschlichen Gehirns. Es besteht aus:
- **Input-Neuronen**: Was das Netz "sieht"
- **Output-Neuronen**: Was das Netz "entscheidet"
- **Verbindungen (Gewichte)**: Jede Verbindung hat ein **Gewicht**, das das Signal verstärkt oder abschwächt

Das Prinzip ist einfach: Jede Input-Neurone sendet ihren Wert. Er wird mit dem Verbindungsgewicht multipliziert und dann zu anderen Signalen addiert. Wenn das Ergebnis einen bestimmten Schwellenwert überschreitet (die **Aktivierungsfunktion**), feuert die Output-Neurone.

In Laupoks Analogie mit Mario und dem Mauszeiger:
- Input-Neurone = Abstand zwischen Mario und dem Mauszeiger
- Verbindungsgewicht = Marios Empfindlichkeit
- Output-Neurone = Mario schreit oder nicht

Je näher der Mauszeiger, desto höher der Input-Wert. Wenn das Gewicht stark ist, ist das Output-Signal stark, und Mario würde schreien. Durch Ändern des Gewichts änderst du Marios Empfindlichkeit.

![Die "Mario ist verängstigt" Demo: Mario steht einem Boo mit einer Synapse-Anzeige gegenüber, die das Verbindungsgewicht zwischen Input und Output zeigt](/images/laupok-mario-ai/mario-fear-demo.jpg)

Im tatsächlichen neuronalen Netz der KI ist es dieselbe Logik, aber in großem Maßstab:
- **99 Input-Neuronen** (11×9 Tiles von Marios Sicht)
- **8 Output-Neuronen** (A, B, X, Y, Hoch, Runter, Links, Rechts)
- **Versteckte Neuronen** dazwischen
- Hunderte von Verbindungen mit variierenden Gewichten

---

## NEAT: Der Algorithmus, der alles verändert

### Das Problem mit grundlegenden genetischen Algorithmen

Wenn du naiv einen genetischen Algorithmus mit einem neuronalen Netz kombinierst, hast du ein Problem: Du erstellst 100 völlig unterschiedliche neuronale Netze und kannst sie nicht vergleichen. Jedes hat seine eigenen Neuronen, Verbindungen und Gewichte. Wie weißt du, ob zwei Netze "ähnlich" oder "verschieden" sind?

Hier kommt **NEAT** ins Spiel -- NeuroEvolution of Augmenting Topologies. Erfunden von **Kenneth Stanley** und **Risto Miikkulainen** im Jahr 2002, löst es genau dieses Problem.

### Arten

NEats erster Schlüsselmechanismus sind **Arten**. Wenn ein neuronales Netz zu sehr von einem anderen abweicht, wird es in eine andere Art eingeteilt. Ähnlichkeit wird über drei Parameter berechnet:

1. **Überschuss** (`EXCES_COEF = 0.50`): Die Anzahl der Verbindungen, die zwischen zwei Netzen nichts gemeinsam haben (unterschiedliche Innovationen)
2. **Disjunkt**: Dasselbe, aber für Verbindungen in der Mitte
3. **Gewichtsdifferenz** (`POIDSDIFF_COEF = 0.92`): Die durchschnittliche Gewichtsdifferenz zwischen Verbindungen, die dieselbe Innovation teilen

Die Bewertungsformel:

```
Bewertung = (EXCES_COEF × disjunkt) / max(nbVerbindungen1 + nbVerbindungen2, 1)
          + POIDSDIFF_COEF × gewichtsdifferenz
```

Wenn diese Bewertung unter `DIFF_LIMITE` (1.0) liegt, sind die beiden Netze in derselben Art. Andernfalls wird eine neue Art erstellt.

### Innovationen

Das ist NEats Genie. Jedes Mal, wenn eine Verbindung erstellt wird, erhält sie eine einzigartige, globale **Innovationsnummer**. Diese Nummer folgt dem neuronalen Netz auch bei der Fortpflanzung.

Konkret: Wenn ein Baby durch Crossover erstellt wird, erbt es die Innovationen seiner Eltern. Wenn zwei Netze dieselbe Innovation teilen, bedeutet das, dass sie eine Verbindung vom selben Vorfahren haben. Das ist es, was es ermöglicht, Netze unterschiedlicher Größe zu vergleichen.

### Crossover

Wenn zwei neuronale Netze sich fortpflanzen, funktioniert **Crossover** so:

![Laupok erklärt das Crossover-Konzept mit dem Text "CROSSOVER" überlagert](/images/laupok-mario-ai/crossover-label.jpg)

1. Das leistungsstärkere Netz wird zum "dominanten Elternteil"
2. Das Baby erbt alle Verbindungen des Dominanten
3. Für jede Verbindung mit derselben Innovation kann das andere Elternteil sie ersetzen (50% Chance)
4. Nur aktive Verbindungen des nicht-dominanten Elternteils können ersetzen

Das garantiert, dass das Baby immer mindestens so gut ist wie das beste Elternteil.

### Mutationen

Nach dem Crossover erleidet das Baby Mutationen mit konfigurierbaren Wahrscheinlichkeiten:

![Laupok erklärt Mutationen mit dem Text "(small modif = mutation)" überlagert](/images/laupok-mario-ai/mutation-label.jpg)

| Mutation | Wahrscheinlichkeit | Effekt |
|----------|-------------------|--------|
| Verbindungsgewicht zurücksetzen | 25% | Gewicht wird vollständig randomisiert |
| Gewichts-Mutation | 95% | Gewicht variiert um ±0,80 |
| Verbindung hinzufügen | 85% | Neue Verbindung zwischen zwei nicht verbundenen Neuronen |
| Neuron hinzufügen | 39% | Ein verstecktes Neuron wird zwischen zwei verbundene Neuronen eingefügt |

Die Rate der Neuron-Hinzufügung ist wichtig: Sie ist es, die dem Netz erlaubt zu **wachsen**. Anfangs gibt es nur Inputs und Outputs. Allmählich erscheinen versteckte Neuronen und machen das Netz immer komplexer.

---

## Der Code: vollständiger Durchlauf

### Konstanten

Das Skript beginnt mit einem Block von Konstanten, die alle Einstellungen definieren:

```lua
-- Marios Sicht um ihn herum
TAILLE_TILE = 16
TAILLE_VUE_W = TAILLE_TILE * 11  -- 176 Pixel breit
TAILLE_VUE_H = TAILLE_TILE * 9   -- 144 Pixel hoch
NB_TILE_W = TAILLE_VUE_W / TAILLE_TILE  -- 11 Tiles
NB_TILE_H = TAILLE_VUE_H / TAILLE_TILE  -- 9 Tiles

-- Neuronales Netz
NB_INPUT = NB_TILE_W * NB_TILE_H  -- 99 Inputs (sichtbare Tiles)
NB_OUTPUT = 8  -- A, B, X, Y, Hoch, Runter, Links, Rechts
NB_INDIVIDU_POPULATION = 100  -- Individuen pro Population
NB_NEURONE_MAX = 100000  -- Max. versteckte Neuronen

-- Fitness
FITNESS_LEVEL_FINI = 1000000  -- Wert wenn Level beendet
NB_FRAME_RESET_BASE = 33  -- Frames ohne Fortschritt vor Reset
NB_FRAME_RESET_PROGRES = 300  -- Frames wenn Fortschritt erkannt

-- Arten
EXCES_COEF = 0.50
POIDSDIFF_COEF = 0.92
DIFF_LIMITE = 1.00

-- Mutationen
CHANCE_MUTATION_RESET_CONNEXION = 0.25
POIDS_CONNEXION_MUTATION_AJOUT = 0.80
CHANCE_MUTATION_POIDS = 0.95
CHANCE_MUTATION_CONNEXION = 0.85
CHANCE_MUTATION_NEURONE = 0.39
```

`NB_INPUT` ist 99, weil Marios Sicht 11×9 Tiles ist. Jedes Tile ist eine Input-Neurone. Leeres Tile = 0. Block = 1. Feind = -1.

Die 8 Outputs entsprechen den SNES-Controller-Buttons: A, B, X, Y, Hoch, Runter, Links, Rechts. Start, Select, L und R sind ausgeschlossen, damit sie Mario nicht "ablenken".

### Datenstrukturen

Das Skript definiert drei Hauptstrukturen:

```lua
function newNeurone()
    local neurone = {}
    neurone.valeur = 0    -- aktueller Neuronenwert
    neurone.id = 0        -- eindeutige Kennung
    neurone.type = ""     -- "input", "output" oder "hidden"
    return neurone
end

function newConnexion()
    local connexion = {}
    connexion.entree = 0     -- Quell-Neuronen-ID
    connexion.sortie = 0     -- Ziel-Neuronen-ID
    connexion.actif = true   -- kann deaktiviert werden wenn verstecktes Neuron eingefügt
    connexion.poids = 0      -- Verbindungsgewicht
    connexion.innovation = 0 -- eindeutige Innovationsnummer
    connexion.allume = false -- für Anzeige: true wenn Signal durchläuft
    return connexion
end

function newReseau()
    local reseau = {
        nbNeurone = 0,        -- Anzahl versteckter Neuronen
        fitness = 1,          -- Leistung ( zurückgelegte Distanz)
        idEspeceParent = 0,   -- zu welcher Art es gehört
        lesNeurones = {},     -- Neuronen-Array
        lesConnexions = {}    -- Verbindungs-Array
    }
    -- Initialisieren mit Inputs
    for j = 1, NB_INPUT, 1 do
        ajouterNeurone(reseau, j, "input", 1)
    end
    -- Dann Outputs
    for j = NB_INPUT + 1, NB_INPUT + NB_OUTPUT, 1 do
        ajouterNeurone(reseau, j, "output", 0)
    end
    return reseau
end
```

Anfangs hat jedes Netz nur Inputs und Outputs. Keine versteckten Neuronen, keine Verbindungen. Der Algorithmus entscheidet, ob welche benötigt werden.

### Mutationen im Detail

#### Gewichts-Mutation

```lua
function mutationPoidsConnexions(unReseau)
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            if math.random() < CHANCE_MUTATION_RESET_CONNEXION then
                -- 25%: vollständige Gewichtsneusetzung
                unReseau.lesConnexions[i].poids = genererPoids()
            else
                -- 75%: Variation von ±0,80
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

Das Anfangsgewicht ist immer 1 oder -1 (`genererPoids()`). Die ±0,80-Variation kann es zwischen negativen und positiven Werten schwanken lassen, was das Verhalten des Netzes radikal verändert.

#### Eine Verbindung hinzufügen

```lua
function mutationAjouterConnexion(unReseau)
    local liste = {}
    -- Neuronenliste mischen
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
                -- Gültige Verbindung: Input→Output, Hidden→Hidden, Hidden→Output
                if (n1.type == "input" and n2.type == "output") or
                   (n1.type == "hidden" and n2.type == "hidden") or
                   (n1.type == "hidden" and n2.type == "output") then
                    -- Prüfen ob bereits eine Verbindung existiert
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

Du kannst Output nicht mit Input verbinden (das würde einen Zyklus erzeugen), und du kannst zwei bereits verbundene Neuronen nicht verbinden. Das Mischen garantiert, dass jedes Mal verschiedene Möglichkeiten erkundet werden.

#### Ein Neuron hinzufügen

Das ist die interessanteste Mutation:

```lua
function mutationAjouterNeurone(unReseau)
    if #unReseau.lesConnexions == 0 then return nil end
    if unReseau.nbNeurone == NB_NEURONE_MAX then return nil end

    -- Verbindungen mischen
    local listeRandom = {}
    for i = 1, #unReseau.lesConnexions, 1 do
        local pos = math.random(1, #listeRandom+1)
        table.insert(listeRandom, pos, i)
    end

    for i = 1, #listeRandom, 1 do
        if unReseau.lesConnexions[listeRandom[i]].actif then
            -- Bestehende Verbindung deaktivieren
            unReseau.lesConnexions[listeRandom[i]].actif = false
            unReseau.nbNeurone = unReseau.nbNeurone + 1
            local indice = unReseau.nbNeurone + NB_INPUT + NB_OUTPUT

            -- Verstecktes Neuron erstellen
            ajouterNeurone(unReseau, indice, "hidden", 1)

            -- Input mit verstecktem Neuron verbinden
            ajouterConnexion(unReseau,
                unReseau.lesConnexions[listeRandom[i]].entree,
                indice, genererPoids())

            -- Verstecktes Neuron mit Output verbinden
            ajouterConnexion(unReseau,
                indice,
                unReseau.lesConnexions[listeRandom[i]].sortie,
                genererPoids())
            break
        end
    end
end
```

Der Mechanismus: Du nimmst eine bestehende Verbindung, **deaktivierst sie** und fügst ein verstecktes Neuron dazwischen ein. Die ursprüngliche Verbindung wird durch zwei neue ersetzt: Input→Versteckt und Versteckt→Output. Es ist wie ein Kabel zu schneiden, um einen Schalter einzufügen.

Das ist es, was NEAT zu "augmenting topologies" macht: Das Netz **wächst** mit der Zeit. Es beginnt einfach und wird nur dann komplex, wenn nötig.

### Der feedForward

Das ist die Funktion, die Signale durch das Netz propagiert:

```lua
function feedForward(unReseau)
    -- Output-Neuronen zurücksetzen
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur = 0
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].allume = false
        end
    end

    -- Propagation
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

Jede aktive Verbindung sendet `Input-Wert × Gewicht` an die Output-Neurone. Der Wert wird **akkumuliert** (addiert). Das `allume`-Flag ist nur für die visuelle Netzdarstellung.

### Das Spielgedenks lesen

Die Funktion `getLesInputs()` übersetzt Super Mario Worlds Welt in Daten, die das Netz verstehen kann:

```lua
function getLesInputs()
    local lesInputs = {}
    -- Auf 0 initialisieren (grau = nichts)
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            lesInputs[getIndiceLesInputs(i, j)] = 0
        end
    end

    -- Sprites (Feinde) = -1 (schwarz)
    local lesSprites = getLesSprites()
    for i = 1, #lesSprites, 1 do
        local input = convertirPositionPourInput(getLesSprites()[i])
        if input.x > 0 and input.x < (TAILLE_VUE_W / TAILLE_TILE) + 1 then
            lesInputs[getIndiceLesInputs(input.x, input.y)] = -1
        end
    end

    -- Tiles (Blöcke) = Tile-Wert (weiß wenn > 0)
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

Das Eingabegitter ist eine auf Mario zentrierte Sicht: 11 Tiles breit, 9 hoch. Der Wert jedes Tiles:
- **0** (grau): nichts
- **1** (weiß): fester Block
- **-1** (schwarz): Feind

Feinde werden aus zwei Listen im RAM gelesen: normale Sprites (`0x14C8`-`0x14F8`) und erweiterte Sprites (`0x170B`-`0x173B`). Für jedes lebende Sprite (Status > 7) wird seine Tile-Position relativ zu Mario berechnet und -1 in die entsprechende Zelle gesetzt.

### Fitness: Wie die KI weiß, dass sie fortschreitet

```lua
function majReseau(unReseau, marioBase)
    local mario = getPositionMario()

    if not niveauFini and memory.readbyte(0x0100) == 12 then
        -- Level beendet!
        unReseau.fitness = FITNESS_LEVEL_FINI
        niveauFini = true
    elseif marioBase.x < mario.x then
        -- Mario hat sich nach rechts bewegt
        unReseau.fitness = unReseau.fitness + (mario.x - marioBase.x)
        marioBase.x = mario.x
    end

    -- Inputs aktualisieren
    local lesInputs = getLesInputs()
    for i = 1, NB_INPUT, 1 do
        unReseau.lesNeurones[i].valeur = lesInputs[i]
    end
end
```

Fitness ist einfach: Es ist die **zurückgelegte Distanz nach rechts**. Wenn Mario sich 10 Pixel bewegt, erhöht sich Fitness um 10. Wenn Mario sich nach links bewegt, passiert nichts (keine Bestrafung). Wenn das Level beendet ist (Adresse `0x0100` == 12), wird Fitness zu 1.000.000.

Es ist absichtlich einfach. Kein Bonus für das Töten von Feinden, keine Bestrafung für das Sterben. Nur: Beweg dich nach rechts.

### Intelligenter Reset

Wenn Mario sich 33 Frames lang nicht bewegt, wird der Level zurückgesetzt und wir zum nächsten Individuum wechseln. Aber wenn Mario Fortschritte gemacht hat (die aktuelle Fitness unterscheidet sich vom Start), warten wir 300 Frames -- und geben dem Netz die Chance zu "verstehen", was es richtig gemacht hat.

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

Die Bedingung `memory.readbyte(0x0071) ~= 9` prüft, dass Mario nicht in seiner Todesanimation ist. Es keinen Sinn zurückzusetzen, wenn Mario bereits tot ist.

### Die Hauptschleife

Die Schleife läuft bei 30 fps (Super Mario Worlds normale Geschwindigkeit):

```lua
while true do
    local fitnessAvant = laPopulation[idPopulation].fitness

    -- Anzeige (Netz, Informationen)
    if forms.ischecked(estAccelere) then
        emu.limitframerate(false)  -- beschleunigen
    else
        emu.limitframerate(true)   -- 30 fps
    end

    -- Die 3 Vitalfunktionen
    majReseau(laPopulation[idPopulation], marioBase)
    feedForward(laPopulation[idPopulation])
    appliquerLesBoutons(laPopulation[idPopulation])

    emu.frameadvance()
    nbFrame = nbFrame + 1

    -- Reset bei keinem Fortschritt
    -- ...
    -- Neue Generation wenn alle Individuen getestet
    -- ...
end
```

Die drei Vitalfunktionen sind `majReseau`, `feedForward` und `appliquerLesBoutons`. Deaktiviere eine davon und Mario hört auf sich zu bewegen.

### Crossover

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

Das Baby erbt vom besseren Elternteil. Für jede Verbindung mit derselben Innovation hat das andere Elternteil eine 50%ige Chance, sie zu ersetzen -- aber **nur wenn die Verbindung aktiv ist**. Das ist eine wichtige Korrektur: Ohne sie könnten unnütze versteckte Neuronen erstellt werden.

### Arten-Auswahl

```lua
function nouvelleGeneration(laPopulation, lesEspeces)
    local laNouvellePopulation = newPopulation()
    local nbIndividuACreer = NB_INDIVIDU_POPULATION

    -- Durchschnittliche Fitness pro Art berechnen
    for i = 1, #lesEspeces, 1 do
        lesEspeces[i].fitnessMoyenne = 0
        for j = 1, #lesEspeces[i].lesReseaux, 1 do
            lesEspeces[i].fitnessMoyenne =
                lesEspeces[i].fitnessMoyenne + lesEspeces[i].lesReseaux[j].fitness
        end
        lesEspeces[i].fitnessMoyenne =
            lesEspeces[i].fitnessMoyenne / #lesEspeces[i].lesReseaux
    end

    -- Jede Art erzeugt eine Anzahl Kind proportional zur durchschnittlichen Fitness
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

Die Idee: Eine Art mit einer durchschnittlichen Fitness von 10.000 kann viel mehr Kinder erzeugen als eine Art mit einer durchschnittlichen Fitness von 1. Das ist **natürliche Selektion** in Aktion.

`choisirParent` verwendet Roulette-Auswahl: Je höher die Fitness eines Individuums, desto wahrscheinlicher wird es als Elternteil ausgewählt.

### Speichern und Laden

Populationen werden in `.pop`-Dateien gespeichert:

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

Das Speichern umfasst auch das beste Individuum aller vorherigen Populationen. Wenn das Beste der alten Population besser ist als das der neuen, kehren wir zur alten als Basis zurück. Das ist eine Form von **Elitismus**: Das Beste geht nie verloren.

### Netzvisualisierung

Laupok hat einen neuronalen Netzvisualisierer hinzugefügt, der über dem Spiel angezeigt wird:

```lua
function dessinerUnReseau(unReseau)
    -- Inputs: 11×9-Gitter um Mario
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            local xT = ENCRAGE_X_INPUT + (i - 1) * TAILLE_INPUT
            local yT = ENCRAGE_Y_INPUT + (j - 1) * TAILLE_INPUT
            local couleurFond = "gray"
            if unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur < 0 then
                couleurFond = "black"   -- Feind
            elseif unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur > 0 then
                couleurFond = "white"   -- Block
            end
            gui.drawRectangle(xT, yT, TAILLE_INPUT, TAILLE_INPUT, "black", couleurFond)
        end
    end

    -- Outputs: 8 Buttons
    for i = 1, NB_OUTPUT, 1 do
        local xT = ENCRAGE_X_OUTPUT
        local yT = ENCRAGE_Y_OUTPUT + ESPACE_Y_OUTPUT * (i - 1)
        if sigmoid(unReseau.lesNeurones[i + NB_INPUT].valeur) then
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "white")
        else
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "black")
        end
    end

    -- Verbindungen
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

Es ist unglaublich nützlich, um zu verstehen, was das Netz tut. Aktive Verbindungen sind weiß, inaktive sind halbtransparent. Inputs sind ein Gitter aus weißer/schwarzer/grauer Zellen. Outputs zeigen, welche Buttons gedrückt werden.

---

## Ergebnisse

### Was die KI gelernt hat

Über Stunden (und Tage) der Ausführung entdeckte die KI eigenständig:

1. **Nach rechts bewegen**: Das grundlegendste Verhalten, aber eines, das das Halten des Rechts-Buttons erfordert
2. **Über Feinde springen**: Durch Verbinden einer "Feind erkannt"-Input mit dem A- oder B-Button
3. **Hindernisse vermeiden**: Einige Netze lernten, vorübergehend zurückzuweichen, um weiter voranzukommen
4. **Level abschließen**: Das beste Individuum konnte den ersten Level von Super Mario World bestehen

![Mario, gesteuert von der KI, gegenüber einem Boo in einem Super Mario World Level -- das neuronale Netz entscheidet Aktionen in Echtzeit](/images/laupok-mario-ai/mario-ai-playing.jpg)

### Einschränkungen

Das Projekt hat seine Grenzen:

- **Einzelner Level**: Die KI wird für einen bestimmten Level trainiert. Sie verallgemeinert nicht automatisch auf andere Level
- **Trainingszeit**: Es dauert Dutzende von Stunden, um befriedigende Ergebnisse zu erzielen
- **Kein Verständnis**: Die KI "versteht" nicht, was sie tut. Sie optimiert eine Fitness-Funktion (zurückgelegte Distanz) durch zufällige Mutationen
- **T-Bagging**: Laupok stellt fest, dass Mario dazu neigt, an Ort und Stelle zu springen, wenn er einen Feind sieht, einfach weil es die Fitness erhöht (er bewegt sich beim Springen ein wenig vor)

---

## Wie man das Experiment reproduziert

Laupok hat alles geteilt. Hier sind die Schritte:

1. **Lade BizHawk herunter** von [tasvideos.org](https://tasvideos.org/BizHawk) (Download-Bereich)
2. **Besorge eine USA-ROM von Super Mario World** (Privatkopie von deiner eigenen Kassette)
3. **Lade das Lua-Skript** von [Pastebin](https://pastebin.com/Jcvdqhqm) herunter -- benenne es zu `mario.lua` um
4. **Lege das Skript in denselben Ordner wie die ROM**
5. **Starte BizHawk**, öffne die ROM
6. **In der Lua-Konsole**: `dofile("mario.lua")` oder über das Menü Script > Open Script
7. **Speichere einen Zustand** am Beginn des Levels (Menü Savestate > Save State) und benenne ihn `debut.state`
8. **Starte das Skript neu** -- es funktioniert

Das Skript enthält ein Formular mit Optionen:
- **Beschleunigen**: Deaktiviert die 30-fps-Begrenzung für mehr Geschwindigkeit
- **Netz anzeigen**: Zeigt das neuronale Netz über dem Spiel
- **Informationen anzeigen**: Zeigt ein Banner mit Generation, Fitness und Art-Anzahl
- **Pause**: Pausiert die Ausführung
- **Speichern/Laden**: Speichert die aktuelle Population in einer `.pop`-Datei

---

## Quellen und Referenzen

| Ressource | Link |
|-----------|------|
| Laupoks Hauptvideo | [Ich habe eine KI gebaut, die Mario alleine spielt](https://www.youtube.com/watch?v=F63GNXGHVwM) |
| Code-Review + Setup-Video | [Wie man die KI einrichtet + Quellcode-Review](https://www.youtube.com/watch?v=u5xCl1bSe6o) |
| Voller Quellcode | [Pastebin Jcvdqhqm](https://pastebin.com/Jcvdqhqm) |
| Originales NEAT-Paper | Stanley & Miikkulainen, "Evolving Neural Networks through Augmenting Topologies", 2002 |
| N8Programs-Tutorial | [NEAT-Implementierung-Durchlauf](https://n8programs.github.io/) (JavaScript, aber Konzepte sind identisch) |
| 16blings (Laupoks Inspiration) | [KI spielt Super Mario World](https://www.youtube.com/watch?v=qv6IFaOz3bA) |
| BizHawk | [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) |
| Super Mario World Speicher | [SMW Central - RAM Map](https://www.smwcentral.net/?p=section&a=details&id=21702) |

---

## Fazit

Was Laupok getan hat, war einen akademischen Algorithmus (NEAT, 2002) zu nehmen, ihn in Lua für einen Emulator (BizHawk) neu zu schreiben und auf Super Mario World anzuwenden. Das Ergebnis: Eine KI, die von Grund auf lernt, das Spiel zu spielen, ohne Vorkenntnisse, nur durch zufällige Mutationen und natürliche Selektion.

Es ist ein schönes Beispiel für die Macht genetischer Algorithmen. Kein Deep Learning, keine GPU, keine Millionen Trainingsdaten. Nur natürliche Selektion, etwas Lua und viel Geduld.

Der Code ist kommentiert, geteilt, und Laupok hat zwei erklärende Videos gemacht -- eines für die großen Konzepte, eines für den Code. Wenn dich das Thema interessiert, tauche ein. Es ist zugänglicher, als es scheint.
