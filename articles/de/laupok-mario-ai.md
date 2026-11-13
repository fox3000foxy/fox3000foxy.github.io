---
title: "Laupok hat eine KI gebaut, die Super Mario World allein spielt, so funktioniert es"

date: 2026-07-11
tags:
  - ai
  - lua
  - emulation
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "2u5JcZGL0nGlJyx2RFmnCVqY+Oty1ylTJXSyRI+tu/pE1ZKltXQFmo8uiqm5tCc0+ZhCnn97TW2A2Co6VQVZeg=="
---

# Laupok hat eine KI gebaut, die Super Mario World allein spielt, so funktioniert es

Laupok hat eine künstliche Intelligenz gebaut, die **Super Mario World** völlig autonom spielt. Sie startet bei null: Kein vordefiniertes Skript, kein aufgezeichneter Frame. Die KI lernt allein, durch zufällige Mutationen und natürliche Selektion, die Spiellevel zu beenden. Das Projekt läuft auf **BizHawk**, einem Multi-Plattform-Emulator, via ein Lua-Skript von etwa **4200 Zeilen**.

Was dieses Projekt faszinierend macht, ist, dass es auf biologischen Konzepten angewandt auf Informatik beruht: **Darwins Evolutionstheorie**, **künstliche neuronale Netze** und vor allem ein spezifischer Algorithmus namens **NEAT** (NeuroEvolution of Augmenting Topologies). Die KI weiß anfangs nichts über das Spiel. Sie testet zufällige Aktionen, scheitert tausendfach, und nach und nach versteht sie, wie man vorankommt, springt und überlebt.

In diesem Artikel zerlegen wir das alles, Konzept für Konzept, Codezeile für Codezeile.

![Laupok stellt den NEAT-Algorithmus vor der Kamera vor](/images/laupok-mario-ai/neat-title.jpg)

---

## Das Setup: BizHawk, Lua und Super Mario World

### Der BizHawk-Emulator

BizHawk ist ein Open-Source-Emulator, der eine Tonne Konsolen unterstützt, NES, SNES, Genesis, PS1, Game Boy und viele mehr. Seine Besonderheit ist, dass er **Lua-Skripte** parallel zum Spiel starten kann. Diese Skripte haben Zugriff auf den **Arbeitsspeicher** (RAM) der Emulation, was heißt, dass sie alle Spieldaten live lesen und modifizieren können.

Konkret heißt das, man kann:
- Marios Position im Level lesen
- Wissen, welche Sprites (Gegner, Items) auf dem Bildschirm sind
- Den Zustand jeder Tile (Block) um Mario kennen
- Den Controller steuern, jeden Button drücken

Genau das braucht man, um eine KI spielen zu lassen.

### Die Speicheradressen von Super Mario World

Im RAM von Super Mario World liegt jede Dateneinheit an einer spezifischen Adresse. Ein bisschen wie ein Viertel: Jede Adresse entspricht einem "Haus", das eine Information enthält. Zum Beispiel:

| Adresse | Daten |
|---------|--------|
| `0x94`-`0x95` | Marios X-Position (16 Bit, Little-Endian) |
| `0x96`-`0x97` | Marios Y-Position |
| `0x14C8`+`i` | Zustand des Sprites `i` (>7 = lebend) |
| `0xE4`+`i` | Untere X-Position des Sprites `i` |
| `0x14E0`+`i` | Obere X-Position des Sprites `i` |
| `0xD8`+`i` | Untere Y-Position des Sprites `i` |
| `0x14D4`+`i` | Obere Y-Position des Sprites `i` |
| `0x170B`+`i` | Typ des Extended Sprites `i` |
| `0x0100` | Spielzustand (12 = Level beendet) |
| `0x13D4` | Pause aktiv |
| `0x0071` | Marios Todesanimation (9 = tot) |
| `0x1C800`+... | Level-Tile-Tabelle |

Die Sprite-Position nutzt zwei Bytes: Ein "unteres" und ein "oberes" Byte, weil die Position 255 Pixel übersteigen kann. Die Formel ist immer `unten + oben × 256`.

Für Tiles ist es komplexer: Die Basisadresse ist `0x1C800`, und man berechnet den Offset je nach `x`- und `y`-Koordinaten der Tile in der Welt, mit 16 Pixeln Schritt pro Tile.

![Super Mario World mit Debug-Overlay, das Sprite-Speicheradressen und Marios Position zeigt](/images/laupok-mario-ai/memory-debug.jpg)

---

## Die Basics: Genetische Algorithmen und neuronale Netze

Bevor wir in den Code tauchen, muss man zwei fundamentale Konzepte verstehen. Ohne sie ergibt der Rest keinen Sinn.

### Die genetischen Algorithmen

Ein genetischer Algorithmus ist eine Simulation der **Evolutionstheorie**. Die zentrale Idee: Man erschafft eine **Population** von Individuen, jedes mit leicht unterschiedlichen Eigenschaften ("Genen"). Man lässt sie in einer Umgebung "leben". Die, die sich am besten schlagen, überleben und pflanzen sich fort. Die, die sich schlecht schlagen, verschwinden.

Laupok illustriert das mit einer **Kirby**-Analogie:
- Eine Kirby-Population erscheint auf einem Terrain mit Stacheln und Tomaten
- Die Stacheln nehmen Lebenspunkte, die Tomaten geben welche zurück
- Jeder Kirby hat Gene: Größe, Geschwindigkeit, Lebenspunkte, Verhalten (fliehen, Tomaten suchen, irgendwohin rennen)

![Doppel-DNA-Helix mit Labels "das Baby", "Größe", "Geschwindigkeit", "Farbe", die Gene, die ein Individuum bilden](/images/laupok-mario-ai/dna-genes.jpg)

- Nach 15 Sekunden schaut man, wer am längsten überlebt hat
- Der beste Kirby pflanzt sich mit den anderen fort: Die Babys erben die Hälfte der Gene des Besten und die Hälfte des "Schlechtesten"
- Die Babys erleiden zufällige **Mutationen** (etwas größer, etwas schneller...)
- Die alten Kirbys werden durch die neuen ersetzt
- Man startet neu

Nach 180 Generationen (~15 Stunden) gehen die Kirbys von 15 Sekunden Überleben auf **15 Minuten**. Sie wurden klein (reduzierte Kollisionszone), schnell und fliehen permanent vor Gefahr.

![Kirby-Simulation Generation 0: zufällig verstreute farbige Kreise auf schwarzem Grund, alle ähnlich groß](/images/laupok-mario-ai/kirby-gen0.jpg)

![Kirby-Simulation Generation 1866: die Kirbys sind kleiner, schneller und fliehen systematisch vor Gefahren](/images/laupok-mario-ai/kirby-gen1866.jpg)

![Statistiken der Kirby-Simulation: Fitness, Lebenspunktezahl, Verhalten jedes Individuums sortiert nach Leistung](/images/laupok-mario-ai/kirby-stats.jpg)

Der entscheidende Punkt: **Man definiert die Lösung nicht**. Der Algorithmus **findet sie allein**. Und genau das macht ihn mächtig für Probleme, bei denen man nicht weiß, welche Parameterkombination optimal wäre.

### Die künstlichen neuronalen Netze

Ein neuronales Netz ist ein vereinfachtes mathematisches Modell des menschlichen Gehirns. Es besteht aus:
- **Input-Neuronen**: Was das Netz "sieht"
- **Output-Neuronen**: Was das Netz "entscheidet"
- **Verbindungen** (Gewichte): Jede Verbindung hat ein **Gewicht**, das das Signal verstärkt oder dämpft

Das Prinzip ist simpel: Jedes Input-Neuron schickt seinen Wert. Er wird mit dem Verbindungsgewicht multipliziert, dann zu den anderen Signalen addiert. Wenn das Ergebnis eine gewisse Schwelle übersteigt (die **Aktivierungsfunktion**), aktiviert sich das Output-Neuron.

In Laupoks Analogie mit Mario und dem Mäuseende:
- Das Input-Neuron = die Distanz zwischen Mario und dem Ende
- Das Verbindungsgewicht = Marios Sensibilität
- Das Output-Neuron = Mario schreit oder nicht

Je näher das Ende, desto höher der Inputwert. Wenn das Gewicht stark ist, ist das Outputsignal stark, und Mario würde schreien. Indem man das Gewicht ändert, ändert man Marios Sensibilität.

![Demo "Mario hat Angst": Mario vor einem Buu mit Synapsenbalken, der das Verbindungsgewicht zwischen Input und Output zeigt](/images/laupok-mario-ai/mario-fear-demo.jpg)

Im echten neuronalen Netz der KI ist es dieselbe Logik, aber in massivem Maßstab:
- **99 Input-Neuronen** (11×9 Tiles von Marios Sicht)
- **8 Output-Neuronen** (A, B, X, Y, Hoch, Runter, Links, Rechts)
- **Versteckte Neuronen** (hidden) dazwischen
- Hunderte Verbindungen mit variierten Gewichten

---

## NEAT: der Algorithmus, der alles ändert

### Das Problem klassischer genetischer Algorithmen

Wenn man einen genetischen Algorithmus naiv mit einem neuronalen Netz kombiniert, hat man ein Problem: Man erschafft 100 völlig verschiedene neuronale Netze und weiß nicht, wie man sie vergleicht. Jedes hat eigene Neuronen, eigene Verbindungen, eigene Gewichte. Wie weiß man, ob zwei Netze "nah" oder "fern" sind?

Hier kommt **NEAT** ins Spiel, NeuroEvolution of Augmenting Topologies. Erfunden von **Kenneth Stanley** und **Risto Miikkulainen** 2002, löst es exakt dieses Problem.

### Die Spezies

Der erste Schlüsselmechanismus von NEAT sind die **Spezies**. Wenn ein neuronales Netz zu verschieden von einem anderen wird, wird es in eine andere Spezies klassifiziert. Die Ähnlichkeit wird via drei Parameter berechnet:

1. **Excess** (`EXCES_COEF = 0.50`): Die Zahl der Verbindungen, die gar nichts miteinander zu tun haben (verschiedene Innovationen)
2. **Disjoint**: Dasselbe, aber für Verbindungen, die in der Mitte liegen
3. **Gewichtsdifferenz** (`POIDSDIFF_COEF = 0.92`): Die mittlere Gewichtsdifferenz zwischen Verbindungen mit derselben Innovation

Die Score-Formel:

```
score = (EXCES_COEF × disjoint) / max(nbConnexions1 + nbConnexions2, 1)
      + POIDSDIFF_COEF × diffPoids
```

Wenn dieser Score unter `DIFF_LIMITE` (1.0) liegt, sind beide Netze in derselben Spezies. Sonst erstellt man eine neue Spezies.

### Die Innovationen

Das ist NEATs Genie. Jedes Mal, wenn eine Verbindung erstellt wird, erhält sie eine global eindeutige **Innovations**-Nummer. Diese Nummer folgt dem neuronalen Netz, selbst wenn es sich fortpflanzt.

Konkret erbt ein per Crossover erstelltes Baby die Innovationen seiner Eltern. Wenn zwei Netze dieselbe Innovation teilen, heißt das, dass sie eine Verbindung haben, die vom selben Vorfahren kommt. Das erlaubt, verschieden große Netze zu vergleichen.

### Der Crossover

Wenn sich zwei neuronale Netze fortpflanzen, funktioniert der **Crossover** so:

![Laupok erklärt das Crossover-Konzept mit "CROSSOVER"-Text-Overlay](/images/laupok-mario-ai/crossover-label.jpg)

1. Das leistungsstärkste Netz wird der "dominante Elternteil"
2. Das Baby erbt alle Verbindungen des Dominanten
3. Für jede Verbindung mit derselben Innovation kann der andere Elternteil sie ersetzen (50% Chance)
4. Nur aktive Verbindungen des nicht-dominanten Elternteils können ersetzen

Das garantiert, dass das Baby immer mindestens so gut ist wie der beste Elternteil.

### Die Mutationen

Nach dem Crossover erleidet das Baby Mutationen mit konfigurierbaren Wahrscheinlichkeiten:

![Laupok erklärt Mutationen mit "(kleine Änderung = Mutation)"-Text-Overlay](/images/laupok-mario-ai/mutation-label.jpg)

| Mutation | Wahrscheinlichkeit | Effekt |
|----------|------------|-------|
| Verbindungsgewicht-Reset | 25% | Das Gewicht wird total randomisiert |
| Gewichts-Mutation | 95% | Das Gewicht variiert um ±0.80 |
| Verbindungs-Hinzufügung | 85% | Neue Verbindung zwischen zwei noch nicht verbundenen Neuronen |
| Neuronen-Hinzufügung | 39% | Ein verstecktes Neuron wird zwischen zwei verbundenen Neuronen eingefügt |

Die Neuronen-Hinzufügungsrate ist wichtig: Sie erlaubt dem Netz zu **wachsen**. Anfangs gibt es nur Inputs und Outputs. Progressiv erscheinen versteckte Neuronen, was das Netz immer komplexer macht.

---

## Der Code: kompletter Walkthrough

### Die Konstanten

Das Skript beginnt mit einem Konstantenblock, der das ganze Setting definiert:

```lua
-- Marios Sicht um ihn herum
TAILLE_TILE = 16
TAILLE_VUE_W = TAILLE_TILE * 11  -- 176 Pixel Breite
TAILLE_VUE_H = TAILLE_TILE * 9   -- 144 Pixel Höhe
NB_TILE_W = TAILLE_VUE_W / TAILLE_TILE  -- 11 Tiles
NB_TILE_H = TAILLE_VUE_H / TAILLE_TILE  -- 9 Tiles

-- Neuronales Netz
NB_INPUT = NB_TILE_W * NB_TILE_H  -- 99 Inputs (sichtbare Tiles)
NB_OUTPUT = 8  -- A, B, X, Y, Hoch, Runter, Links, Rechts
NB_INDIVIDU_POPULATION = 100  -- Individuen pro Population
NB_NEURONE_MAX = 100000  -- Limit versteckter Neuronen

-- Fitness
FITNESS_LEVEL_FINI = 1000000  -- Wert wenn Level beendet
NB_FRAME_RESET_BASE = 33  -- Frames ohne Fortschritt vor Reset
NB_FRAME_RESET_PROGRES = 300  -- Frames wenn Fortschritt erkannt

-- Spezies
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

Das `NB_INPUT` ist 99, weil Marios Sicht 11×9 Tiles macht. Jede Tile ist ein Input-Neuron. Wenn die Tile leer ist, ist sie 0 wert. Wenn es ein Block ist, ist sie 1 wert. Wenn es ein Gegner ist, ist sie -1 wert.

Die 8 Outputs entsprechen den SNES-Controller-Buttons: A, B, X, Y, Hoch, Runter, Links, Rechts. Man schließt Start, Select, L und R aus, um seine Entscheidungen aufs Wesentliche zu begrenzen.

### Die Datenstrukturen

Das Skript definiert drei Hauptstrukturen:

```lua
function newNeurone()
    local neurone = {}
    neurone.valeur = 0    -- aktueller Neuronwert
    neurone.id = 0        -- eindeutige Kennung
    neurone.type = ""     -- "input", "output" oder "hidden"
    return neurone
end

function newConnexion()
    local connexion = {}
    connexion.entree = 0     -- Quellneuron-ID
    connexion.sortie = 0     -- Zielneuron-ID
    connexion.actif = true   -- kann deaktiviert werden wenn ein verstecktes Neuron eingefügt wird
    connexion.poids = 0      -- Verbindungsgewicht
    connexion.innovation = 0 -- eindeutige Innovationsnummer
    connexion.allume = false -- für Anzeige : true wenn Signal durchgeht
    return connexion
end

function newReseau()
    local reseau = {
        nbNeurone = 0,        -- Zahl versteckter Neuronen
        fitness = 1,          -- Leistung (zurückgelegte Distanz)
        idEspeceParent = 0,   -- zu welcher Spezies es gehört
        lesNeurones = {},     -- Neuronentabelle
        lesConnexions = {}    -- Verbindungstabelle
    }
    -- Initialisierung mit Inputs
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

Anfangs enthält jedes Netz nur Inputs und Outputs: Kein verstecktes Neuron, keine Verbindung. Der Algorithmus entscheidet, ob er welche braucht.

### Die Mutationen im Detail

#### Gewichts-Mutation

```lua
function mutationPoidsConnexions(unReseau)
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            if math.random() < CHANCE_MUTATION_RESET_CONNEXION then
                -- 25% : totaler Gewichtsreset
                unReseau.lesConnexions[i].poids = genererPoids()
            else
                -- 75% : Variation um ±0.80
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

Das Initialgewicht ist immer 1 oder -1 (`genererPoids()`). Die ±0.80-Variation kann es zwischen negativen und positiven Werten oszillieren lassen, was das Netzverhalten radikal ändert.

#### Verbindungs-Hinzufügung

```lua
function mutationAjouterConnexion(unReseau)
    local liste = {}
    -- Randomisierung der Neuronenliste
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
                -- Gültige Verbindung : input→output, hidden→hidden, hidden→output
                if (n1.type == "input" and n2.type == "output") or
                   (n1.type == "hidden" and n2.type == "hidden") or
                   (n1.type == "hidden" and n2.type == "output") then
                    -- Prüfen dass noch keine Verbindung existiert
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

Man kann keinen Output mit einem Input verbinden (das würde einen Zyklus erzeugen), und man kann keine zwei schon verbundenen Neuronen verbinden. Die Randomisierung garantiert, dass man jedes Mal verschiedene Möglichkeiten erkundet.

#### Neuronen-Hinzufügung

Das ist die interessanteste Mutation:

```lua
function mutationAjouterNeurone(unReseau)
    if #unReseau.lesConnexions == 0 then return nil end
    if unReseau.nbNeurone == NB_NEURONE_MAX then return nil end

    -- Randomisierung der Verbindungen
    local listeRandom = {}
    for i = 1, #unReseau.lesConnexions, 1 do
        local pos = math.random(1, #listeRandom+1)
        table.insert(listeRandom, pos, i)
    end

    for i = 1, #listeRandom, 1 do
        if unReseau.lesConnexions[listeRandom[i]].actif then
            -- Existierende Verbindung deaktivieren
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

Der Mechanismus: Man nimmt eine existierende Verbindung, **deaktiviert** sie und fügt ein verstecktes Neuron in der Mitte ein. Die Ursprungsverbindung wird durch zwei neue ersetzt: Input→hidden und hidden→Output. Als schneide man ein Kabel durch, um einen Schalter dazwischenzusetzen.

Das macht NEAT "augmenting topologies": Das Netz **wächst** mit der Zeit. Es startet simpel und wird nur komplex, wenn nötig.

### Das FeedForward

Das ist die Funktion, die Signale durchs Netz propagiert:

```lua
function feedForward(unReseau)
    -- Reset der Output-Neuronen
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

Jede aktive Verbindung schickt `Inputwert × Gewicht` zum Output-Neuron. Der Wert wird **kumuliert** (addiert). Das `allume`-Flag ist nur für die visuelle Netzanzeige.

### Das Lesen des Spielspeichers

Die Funktion `getLesInputs()` übersetzt die Super-Mario-World-Welt in netzverständliche Daten:

```lua
function getLesInputs()
    local lesInputs = {}
    -- Initialisierung auf 0 (grau = nichts)
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            lesInputs[getIndiceLesInputs(i, j)] = 0
        end
    end

    -- Die Sprites (Gegner) = -1 (schwarz)
    local lesSprites = getLesSprites()
    for i = 1, #lesSprites, 1 do
        local input = convertirPositionPourInput(getLesSprites()[i])
        if input.x > 0 and input.x < (TAILLE_VUE_W / TAILLE_TILE) + 1 then
            lesInputs[getIndiceLesInputs(input.x, input.y)] = -1
        end
    end

    -- Die Tiles (Blöcke) = Tile-Wert (weiß wenn > 0)
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

Das Input-Grid ist eine auf Mario zentrierte Sicht: 11 Tiles breit, 9 hoch. Jede Tile ist wert:
- **0** (grau): nichts
- **1** (weiß): solider Block
- **-1** (schwarz): Gegner

Gegner werden aus zwei RAM-Listen gelesen: Normale Sprites (`0x14C8`-`0x14F8`) und Extended Sprites (`0x170B`-`0x173B`). Für jeden lebenden Sprite (Zustand > 7) berechnet man seine Tile-Position relativ zu Mario und setzt -1 ins entsprechende Feld.

### Die Fitness: wie die KI weiß, ob sie vorankommt

```lua
function majReseau(unReseau, marioBase)
    local mario = getPositionMario()

    if not niveauFini and memory.readbyte(0x0100) == 12 then
        -- Level beendet !
        unReseau.fitness = FITNESS_LEVEL_FINI
        niveauFini = true
    elseif marioBase.x < mario.x then
        -- Mario geht nach rechts voran
        unReseau.fitness = unReseau.fitness + (mario.x - marioBase.x)
        marioBase.x = mario.x
    end

    -- Input-Update
    local lesInputs = getLesInputs()
    for i = 1, NB_INPUT, 1 do
        unReseau.lesNeurones[i].valeur = lesInputs[i]
    end
end
```

Die Fitness ist simpel: Es ist die **nach rechts zurückgelegte Distanz**. Wenn Mario 10 Pixel vorankommt, steigt die Fitness um 10. Wenn Mario zurückgeht, passiert nichts (keine Penalty). Wenn das Level beendet ist (Adresse `0x0100` == 12), wird die Fitness 1.000.000.

Absichtlich simpel. Nur Fortschritt nach rechts zählt: Gegner töten bringt nichts, Sterben kostet nichts.

### Der intelligente Reset

Wenn sich Mario 33 Frames nicht bewegt, resettet man das Level und geht zum nächsten Individuum. Aber wenn Mario Fortschritt gemacht hat (seine aktuelle Fitness unterscheidet sich von der am Anfang), wartet man 300 Frames, das gibt dem Netz eine Chance zu "verstehen", was es gut gemacht hat.

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

Die Bedingung `memory.readbyte(0x0071) ~= 9` prüft, dass Mario nicht in Todesanimation ist. Der Reset wird unnütz, wenn Mario schon in Todesanimation ist.

### Die Hauptschleife

Die Schleife läuft mit 30 fps (Super Mario Worlds normale Geschwindigkeit):

```lua
while true do
    local fitnessAvant = laPopulation[idPopulation].fitness

    -- Anzeige (Netz, Infos)
    if forms.ischecked(estAccelere) then
        emu.limitframerate(false)  -- beschleunigen
    else
        emu.limitframerate(true)   -- 30 fps
    end

    -- Die 3 vitalen Funktionen
    majReseau(laPopulation[idPopulation], marioBase)
    feedForward(laPopulation[idPopulation])
    appliquerLesBoutons(laPopulation[idPopulation])

    emu.frameadvance()
    nbFrame = nbFrame + 1

    -- Reset wenn kein Fortschritt
    -- ...
    -- Neue Generation wenn alle Individuen getestet
    -- ...
end
```

Die drei vitalen Funktionen sind `majReseau`, `feedForward` und `appliquerLesBoutons`. Wenn man nur eine deaktiviert, bewegt sich Mario nicht mehr.

### Der Crossover

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

Das Baby erbt vom besten Elternteil. Für jede Verbindung mit derselben Innovation hat der andere Elternteil 50% Chance zu ersetzen, aber **nur wenn die Verbindung aktiv ist**. Ein wichtiger Fix: Ohne das konnten nutzlose versteckte Neuronen erstellt werden.

### Die Spezies-Selektion

```lua
function nouvelleGeneration(laPopulation, lesEspeces)
    local laNouvellePopulation = newPopulation()
    local nbIndividuACreer = NB_INDIVIDU_POPULATION

    -- Mittlere Fitness pro Spezies berechnen
    for i = 1, #lesEspeces, 1 do
        lesEspeces[i].fitnessMoyenne = 0
        for j = 1, #lesEspeces[i].lesReseaux, 1 do
            lesEspeces[i].fitnessMoyenne =
                lesEspeces[i].fitnessMoyenne + lesEspeces[i].lesReseaux[j].fitness
        end
        lesEspeces[i].fitnessMoyenne =
            lesEspeces[i].fitnessMoyenne / #lesEspeces[i].lesReseaux
    end

    -- Jede Spezies erstellt Kinderzahl proportional zu ihrer mittleren Fitness
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

Die Idee: Eine Spezies mit mittlerer Fitness 10.000 darf viel mehr Kinder erstellen als eine mit mittlerer Fitness 1. Das ist **natürliche Selektion** in Aktion.

Das `choisirParent` nutzt Roulette-Selektion: Je mehr Fitness ein Individuum hat, desto höher seine Chance, als Elternteil selektiert zu werden.

### Das Speichern und Laden

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

Das Speichern schließt auch das beste Individuum aller vorherigen Populationen ein. Wenn das Beste der alten Population besser ist als das Beste der neuen, nimmt man das alte als Basis wieder. Eine Form von **Elitismus**: Man verliert nie das Beste.

### Das Netzzeichnen

Laupok hat einen neuronalen Netz-Visualisierer als Spiel-Overlay hinzugefügt:

```lua
function dessinerUnReseau(unReseau)
    -- Inputs : 11×9-Grid um Mario
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            local xT = ENCRAGE_X_INPUT + (i - 1) * TAILLE_INPUT
            local yT = ENCRAGE_Y_INPUT + (j - 1) * TAILLE_INPUT
            local couleurFond = "gray"
            if unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur < 0 then
                couleurFond = "black"   -- Gegner
            elseif unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur > 0 then
                couleurFond = "white"   -- Block
            end
            gui.drawRectangle(xT, yT, TAILLE_INPUT, TAILLE_INPUT, "black", couleurFond)
        end
    end

    -- Outputs : 8 Buttons
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

Super nützlich, um zu verstehen, was das Netz tut. Aktive Verbindungen sind weiß, inaktive semi-transparent. Inputs sind ein Grid weiß/schwarz/grauer Felder. Outputs zeigen, welche Buttons gedrückt sind.

---

## Die Ergebnisse

### Was die KI gelernt hat

Im Laufe stunden- (und tage-) langer Läufe hat die KI allein entdeckt:

1. **Nach rechts vorankommen**: Das basischste Verhalten, erfordert aber, den Rechts-Button gedrückt zu halten
2. **Über Gegner springen**: Indem man einen "Gegner erkannt"-Input mit Button A oder B verbindet
3. **Hindernissen ausweichen**: Manche Netze lernten, temporär zurückzuweichen, um besser voranzukommen
4. **Level beenden**: Das beste Individuum konnte Super Mario Worlds erstes Level beenden

![Von der KI gesteuerter Mario vor einem Buu in einem Super-Mario-World-Level, das neuronale Netz entscheidet live über Aktionen](/images/laupok-mario-ai/mario-ai-playing.jpg)

### Die Grenzen

Das Projekt hat seine Grenzen:

- **Ein einziges Level**: Die KI ist auf ein spezifisches Level trainiert. Sie generalisiert nicht automatisch auf andere Level
- **Trainingszeit**: Es braucht Dutzende Stunden, um befriedigende Ergebnisse zu erreichen
- **Kein Verständnis**: Die KI "versteht" nicht, was sie tut. Sie optimiert eine Fitnessfunktion (zurückgelegte Distanz) via Zufallsmutationen
- **T-Bagging**: Laupok merkt an, dass Mario dazu neigt, auf der Stelle zu springen, wenn er einen Gegner sieht, einfach weil das die Fitness erhöht (er kommt springend etwas voran)

---

## Das Experiment reproduzieren

Laupok hat alles geteilt. Hier die Schritte:

1. **BizHawk herunterladen** auf [tasvideos.org](https://tasvideos.org/BizHawk) (Download-Bereich)
2. **Eine USA-ROM von Super Mario World besorgen** (Privatkopie deiner eigenen Cartridge)
3. **Das Lua-Skript herunterladen** von [Pastebin](https://pastebin.com/Jcvdqhqm), umbenennen zu `mario.lua`
4. **Das Skript in denselben Ordner wie die ROM legen**
5. **BizHawk starten**, die ROM öffnen
6. **In der Lua-Konsole**: `dofile("mario.lua")` oder via Menü Skript > Skript öffnen
7. **Einen State** am Levelanfang speichern (Menü Savestate > State speichern) und `debut.state` nennen
8. **Das Skript neu starten**, es geht

Das Skript enthält ein Formular mit Optionen:
- **Beschleunigen**: Deaktiviert das 30-fps-Limit, um schneller zu gehen
- **Netz anzeigen**: Zeigt das neuronale Netz als Overlay
- **Infos anzeigen**: Zeigt ein Banner mit Generation, Fitness, Spezieszahl
- **Pause**: Pausiert die Ausführung
- **Speichern/Laden**: Persistiert die aktuelle Population in einer `.pop`-Datei

---

## Quellen und Referenzen

| Ressource | Link |
|-----------|------|
| Laupoks Hauptvideo | [Ich habe eine KI gebaut, die Mario allein spielt](https://www.youtube.com/watch?v=F63GNXGHVwM) |
| Video Code-Review + Setup | [KI-Setup + Quellcode-Review](https://www.youtube.com/watch?v=u5xCl1bSe6o) |
| Kompletter Quellcode | [Pastebin Jcvdqhqm](https://pastebin.com/Jcvdqhqm) |
| Originaler NEAT-Artikel | Stanley & Miikkulainen, "Evolving Neural Networks through Augmenting Topologies", 2002 |
| N8Programs-Tutorial | [NEAT implementation walkthrough](https://n8programs.github.io/) (JavaScript, aber Konzepte identisch) |
| 16blings (Laupoks Inspiration) | [AI plays Super Mario World](https://www.youtube.com/watch?v=qv6IFaOz3bA) |
| BizHawk | [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) |
| Super-Mario-World-Speicher | [SMW Central - RAM Map](https://www.smwcentral.net/?p=section&a=details&id=21702) |

---

## Fazit

Was Laupok gemacht hat, ist einen akademischen Algorithmus (NEAT, 2002) nehmen, ihn in Lua für einen Emulator (BizHawk) neu schreiben und auf Super Mario World anwenden. Das Ergebnis: Eine KI, die von null lernt, das Spiel zu spielen, ohne jegliches Vorwissen, nur durch Zufallsmutationen und natürliche Selektion.

Ein wunderschönes Beispiel für die Macht genetischer Algorithmen. Das Rezept passt in drei Zutaten: Natürliche Selektion, etwas Lua und viel Geduld. Kein Deep Learning, keine GPU, keine massiven Trainingsdaten.

Der Code ist kommentiert, geteilt, und Laupok hat zwei Erklärvideos gemacht, eines für die großen Konzepte, eines für den Code. Wenn dich das Thema interessiert, tauch ein. Zugänglicher, als es scheint.
