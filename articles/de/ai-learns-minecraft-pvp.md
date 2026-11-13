---
title: Die KI lernt Minecraft-PvP, Imitation Learning, Reinforcement Learning, und die 30 Variablen, die zählten
description: "1 000 aufgezeichnete Duelle, neuronales Netz trainiert auf Pixeln, 90 % Treffpräzision: und der Bot rannte geradeaus gegen eine Wand. Dann kamen RL, curriculares Lernen und 60 Stunden Training."
date: 2026-07-09
tags:
  - minecraft
  - ai
  - python
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "zIh17cw6j34UrrFLKw0C5+Y4MdbsJm3m1UpRsQyBecfnrI9+OYDga+Va9VwPkWiZoK/2NqlD/HEXIUhriD2X5g=="
---

## Einleitung

![AI Learns Minecraft PvP thumbnail](assets/ai-pvp-thumbnail.png)

Es gibt ein Video namens [AI Learns Minecraft PvP (Reinforcement Learning + Behavior Cloning)](https://www.youtube.com/watch?v=j5nxDKAjg6U) von Kadambi | AI Engineering, und es ist eine der ehrlichsten Erzählungen über Videospiel-KI-Training, die ich gesehen habe.

Das Prinzip: Einen Bot bauen, der Minecraft-PvP spielt (Schwert-Kit, voll verzauberte Diamantrüstung), indem er den Bildschirm anschaut und Maus- und Tastaturbefehle schickt. Er funktioniert nur mit Pixeln als Input und Aktionen als Output, ohne den Spielspeicher zu lesen, ohne Makros und ohne Mods.

Was das Video interessant macht, ist nicht das Endergebnis. Es ist der Weg: Das Scheitern des Imitation Learning, der Pivot zu Feature Engineering, die katastrophalen Vergessenszyklen und die 60+ Stunden Training auf einem Laptop ohne GPU.

## Phase 1: Imitation Learning (das Scheitern)

![The bot during imitation learning: facing a wall, jumping up and down](assets/ai-pvp-imitation-fail.png)

Der Ersteller begann mit einem vernünftigen Ansatz: 1.000 Duelle seines eigenen Gameplays aufzeichnen, jeden Mausklick und Tastendruck dem entsprechenden Bild zuordnen und ein neuronales Netz trainieren, Aktionen aus Pixeln vorherzusagen.

```python
# Pseudocode für die Imitation-Learning-Pipeline
dataset = record_duels(1000)          # hundreds of thousands of frames
for frame, action in dataset:
    pixels = capture_screen(frame)
    network.train(pixels → action)    # Tastatur/Maus aus Bild vorhersagen
```

Das Netz lernte, Treffer mit **90 % Präzision** vorherzusagen. Vielversprechend.

Dann testeten sie es in einem echten Match. Der Bot lief geradeaus zum Kartenrand, stellte sich vor eine Wand und sprang auf und ab.

Warum?

**Die Faulheitsfalle.** In einem PvP-Kampf ist die W-Taste die meiste Zeit gedrückt. Das Netz realisierte, dass es hohe Präzision erreichen konnte, indem es einfach W gedrückt hielt und sonst nichts tat. Es optimierte die häufigste Aktion auf Kosten aller anderen.

**Die menschliche Latenz.** Die Aktionen im Dataset sind um etwa 200 ms menschliche Reaktionszeit verzögert. Bild für Bild sind Ursache und Wirkung für ein Modell aus rohen Pixeln fast unmöglich zu lernen, wenn Aktion und ihre sichtbare Konsequenz um mehrere Bilder getrennt sind.

**Inkonsistente Demonstrationen.** Das eigene Gameplay des Erstellers variierte: Manchmal strafte er mit der Tastatur, manchmal zielte er mit der Maus in identischen Situationen. Diese widersprüchlichen Inputs verwirrten das Netz.

## Phase 2: Reinforcement Learning mit Curriculum

![The bot learning to track horizontally during RL training](assets/ai-pvp-rl-horizontal.png)

Das Imitation Learning aufgebend, wechselte der Ersteller zu RL. Aber einen frischen Agenten in ein komplettes PvP-Duell zu stürzen ist nutzlos: Es passiert zu viel auf einmal, als dass zufällige Exploration irgendwas finden könnte.

Die Lösung: **Curriculares Lernen**. Jede Mechanik isolieren und den Bot die Basics beherrschen lassen, bevor er in einen echten Kampf geht.

### Schritt 1: Horizontales Zielen (7 Stunden)

Die simpelste Reward-Funktion: Positive Belohnung fürs Treffen eines Ziels, negative Strafe für erlittenen Schaden.

Anfangs bewegt sich der Bot kaum (neuronales Netz mit neutralen Werten initialisiert). Er zittert lateral: Das ist der Bot, der verschiedene Aktionen testet, um zu sehen, welche Belohnungen geben.

Nach einer Stunde lernt er, sich horizontal zu zentrieren, aber mühsam langsam. Nach 7 Stunden kann er dem Gegner links und rechts folgen, wenn auch asymmetrisch (besser beim Bewegen von rechts nach links als umgekehrt, ein Verhalten, das während des ganzen Trainings persistierte).

### Schritt 2: Feature Engineering

Der rohe Screenshot machte über 2 Millionen Pixel. Selbst auf 360p reduziert sind das 200.000 Inputs: Viel zu viel für effektives Lernen.

Der Ersteller analysierte Tausende Duelle und identifizierte **30 Variablen, die wirklich zählen**, verteilt in drei Gruppen:

**Vision (Gegnerverfolgung)**:
- Distanz des Gegners zum Crosshair
- Größe der Gegner-Bounding-Box
- Höhe des Gegners
- Crosshair-Zustand (auf Ziel / neben Ziel)
- Relative Geschwindigkeit

Statt das ganze Bild zu verarbeiten, filtert der Bot die Pixel strikt nach der Farbe der Gegner-Rüstung, was die Erkennung quasi instantan macht. Hintergrundblöcke ähnlicher Farbe können dieses Filtern stören: Aber in Minecraft kann man einfach die Texturen ändern.

**OCR (HUD lesen)**:
Da der Bot keine Koordinaten aus dem Spielcode holen kann, scannt er den Bildschirm live, um zu extrahieren:
- Kamera-Pitch
- Momentum
- Y-Level

Standard-OCR kämpft mit Minecrafts transparentem Text, also werden die kritischen Daten zum Schwarz-Weiß gezwungen für instantanes Lesen.

**Zeit (Kontextfenster)**:
- Vergangene Zeit seit du den Gegner getroffen hast
- Vergangene Zeit seit er dich getroffen hat
- Gleitender Puffer der vorherigen Bot-Aktionen

Das gibt dem Netz zeitlichen Kontext: Ohne ihn hat der Bot keine Ahnung, ob er mitten in einer Combo ist oder gerade erst einen Kampf beginnt.

### Schritt 3: Vertikales Zielen (7 weitere Stunden)

![The bot learning to aim up and down during RL training](assets/ai-pvp-rl-vertical.png)

Vertikale Mausbewegung hinzuzufügen war anfangs "ein totales Desaster". Die Anfangsleistung war gebrochen.

Nach einer weiteren Stunde in der Sandbox kapierte der Bot, wie man hoch und runter schaut. Aber dabei vergaß er komplett, wie man horizontal folgt.

Das ist **katastrophales Vergessen**: Ein klassisches Machine-Learning-Problem, wo Optimierung für neue Daten zuvor gelernte Repräsentationen überschreibt. Bei der Optimierung des vertikalen Zielens überschrieb das neuronale Netz versehentlich seine horizontalen Fortschritte und ließ den Ersteller mit einem Bot zurück, der sein Crosshair level halten, aber keinem Ziel folgen konnte.

Es brauchte **6 zusätzliche Stunden**, um horizontales Tracking bei Erhalt der vertikalen Kontrolle zurückzugewinnen. Der Bot hielt dann gutes Crosshair-Placement dank der OCR-Gruppe, die den Kamera-Pitch extrahierte.

### Schritt 4: Tastaturkontrolle

![The bot toggling the W key constantly, learning to commit to movement](assets/ai-pvp-keyboard.png)

Dem Bot Tastaturerlaubnis zu geben machte die Zeitmerkmale noch kritischer. Anfangs wurde die W-Taste ständig an- und ausgeschaltet: Ein schnelles Wechseln, weil das Netz nicht gelernt hatte, sich festzulegen.

Dieses Verhalten wurde bestraft, also lernte der Bot, es zu glätten. Er fing an, mehr Treffer im Sprint zu landen (der dumpfe Sound gegen das Swish eines stehenden Treffers). Manche Combos wirkten unbefriedigend, weil der Bot seinen Reichweitenvorteil gegen den Gegner ausnutzte.

Um es fair zu machen, erhöhte der Ersteller die Gegnerreichweite. Viele der gelernten Bot-Strategien hörten auf zu funktionieren. Aber mit der Zeit passte er sich an.

### Schritt 5: Dem Bot beibringen, wann er klicken soll

Für die finale Phase brachte der Ersteller Imitation Learning zurück: Aber nur um Klick-Timing zu lehren, nicht die komplette Kontrollpolicy. Der Bot versuchte, die Klickmuster aus den aufgezeichneten Duellen zu imitieren.

Anfangs hatte er zu viel Angst, irgendwas zu versuchen, aus Furcht vor der Strafe für schlechte Klicks. Aber er fand schließlich den Mut zu schlagen und Treffer zu landen. Natürlich vergaß er dabei wieder, wie man zielt: Der Ersteller musste ihn **50 zusätzliche Stunden** in Ruhe lassen, um zu einem befriedigenden Zustand zurückzukehren.

## Die Cheat-Debatte

Das Video endet mit der Frage: Cheatet dieser Bot?

Das Argument dagegen: Der Bot verarbeitet nur, was ein Mensch sieht (dieselben Pixel), schickt dieselben Tastatur/Maus-Inputs wie ein Mensch (ohne Paketmanipulation wie Anti-Knockback) und liest nicht den Spielspeicher (ohne X-Ray oder ESP).

Das Argument dafür: Ein Bot kann schneller verarbeiten als ein Mensch, und wenn der Gegner denkt, er spiele gegen einen Menschen, aber das nicht der Fall ist, ist das Täuschung.

Die Meinung des Erstellers: Es hängt von der Intention ab. Wenn beide Parteien wissen, dass es ein Bot ist, ist das Match fair. Der Bot kettelt den Gegner mit einer 100-Treffer-Serie ins Leere.

## Das Ergebnis

![The bot executing a 100-hit combo](assets/ai-pvp-final-combo.png)

Ein Minecraft-PvP-Bot trainiert auf einem **Laptop ohne GPU**, gebaut auf einer Custom-Trainingspipeline mit:

- **Screenshot** für Pixel-Input (2M+ Pixel → 30 designede Merkmale)
- **Curriculares Lernen** (horizontal → vertikal → Tastatur → Klicks)
- **RL für Motorsteuerung** + **Imitation Learning für Klick-Timing**
- **Feature Engineering** auf rohen Pixeln (3 Gruppen: Vision, OCR, Zeit)
- **60+ Stunden Training** über mehrere Phasen

Die Gesamttrainingszeit beträgt Dutzende Stunden, aber die meisten sind passiv. Der Bot zittert bis zum Verständnis, vergisst Gelerntes, lernt neu und kettelt am Ende eine 100-Treffer-Serie.

Das Video ist auf [youtube.com/watch?v=j5nxDKAjg6U](https://www.youtube.com/watch?v=j5nxDKAjg6U).

---

*Dieser Artikel deckt nur den Videoinhalt ab. Für breiteren Minecraft-KI-Kontext: VPT, DreamerV3 und die Imitation-Learning-vs-RL-Landschaft: Die Abschnitte unten verbinden dieses Projekt mit dem größeren Feld.*

## VPT: Behavior Cloning in großem Maßstab

![OpenAI's VPT project diagram: the Inverse Dynamics Model predicts actions from pairs of frames](assets/vpt-overview.svg)

Der "Behavior Cloning"-Ansatz des Videos (Phase 1) ist dieselbe Technik, die OpenAI in seinem **Video PreTraining (VPT)**-Projekt nutzte, aber an entgegengesetzten Enden des Ressourcenspektrums. VPT bewies, dass Imitation Learning für Minecraft funktioniert, wenn man 70.000 Stunden Video, 720 GPUs und ein Inverse-Dynamics-Model zum Pseudo-Labeln ungelabelter Daten hat. Der Ersteller hier bewies, dass es mit Laptop und 1.000 Duellen scheitert: Aber aus demselben fundamentalen Grund: Imitation Learning ist durch die Qualität seiner Demonstrationen begrenzt.

![OpenAI's VPT agent mining a tree in Minecraft](assets/vpt-minecraft.jpg)

Die VPT-Pipeline löst das Datenproblem, indem sie ein **Inverse Dynamics Model (IDM)** trainiert, das Bild t-1 und Bild t+1 anschaut, um die Aktion bei Bild t vorherzusagen. Weil das IDM nicht-kausal ist (es sieht zukünftige Bilder), ist die Aufgabe leichter als Behavior Cloning und braucht viel weniger gelabelte Daten. Sie zahlten Contractors etwa 2.000 $ für 2.000 Stunden gelabelte Daten und nutzten das IDM dann, um 70.000 Stunden Minecraft-YouTube-Videos pseudo-zu-labeln.

![Crafting/Sammelrate je nach Pre-Training-Datenvolumen (Log-Skala): Crafting Tables, Holztools, Steintools](assets/vpt-stone-pickaxe-sequence.svg)

Der Skalierungseffekt ist klar: Auf einer Log-Achse von 1 Stunde bis 100.000 Stunden Pre-Training-Daten steigt die Rate, mit der das Modell einen Crafting Table, Holztools, dann Steintools herstellt, stufenweise. Das nur auf den 2.000 von Contractors gelabelten Stunden trainierte Modell cappt bei Crafting Tables; erst mit den 70.000 IDM-pseudo-gelabelten Stunden (gestrichelte Linie auf dem Graph) emergieren Steintools Zero-Shot, ohne einen einzigen RL-Schritt.

Das resultierende 0,5B-Parameter-Fundamentmodell erreichte Zero-Shot-Fähigkeiten, unmöglich mit RL allein: Bäume fällen, Tables herstellen, Säulensprung: Und feingetunt mit RL wurde es die erste KI, die Diamanttools herstellte.

![Reward je nach RL-Trainingsepisodenzahl: von zufällig initialisiertem Modell starten vs. vom VPT-pretrainierten Modell starten](assets/vpt-diamond-pickaxe-sequence.svg)

Dieser Graph zeigt, warum Pre-Training alles für Downstream-RL ändert. RL gestartet von einem zufällig initialisierten Netz (orange) bleibt flach nahe 0 über fast eine Million Episoden: Die "bekomme einen Diamant"-Aufgabe hat zu sparse Rewards, als dass ein naiver Agent per Zufallsexploration darüber stolpern könnte. RL feingetunt vom VPT-pretrainierten Modell (grün) startet schon mit Basisverhalten (minen, herstellen, erkunden) und steigt stetig bis zu einem Reward von etwa 25, was dem kompletten Weg zu einer Diamantspitzhacke entspricht.

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/719971231?h=cbdf2617a1" title="VPT agent gameplay demo 1" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045834?h=9cb4118c65" title="VPT agent gameplay demo 2" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045849?h=00398908ed" title="VPT agent gameplay demo 3" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045863?h=060f07e290" title="VPT agent gameplay demo 4" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

*Offizielle Videodemos des OpenAI-VPT-Projekts, die den Agenten in Aktion zeigen.*

## OpenAI Five: Das Reward-Shaping-Problem

![OpenAI Five playing Dota 2 against human professionals](assets/openai-five-dota2.jpg)

OpenAI Five (2019) besiegte die Dota-2-Weltmeister mit purem Self-Play-RL: Kein Imitation Learning. 256 GPUs, 128.000 CPU-Kerne, 180 Spieljahre pro Tag, 10 Monate Training.

Aber die Reward-Funktion wurde von Dota-Experten von Hand designed: **28 Merkmale von 20.000 verfügbaren**, jedes mit manuell justierten Gewichten. Nettovermögen, Kills, Tode, Turmgesundheit, Lane-Zuweisungen: Alles wurde von Menschen selektiert und gewichtet. Ohne diese Modellierung lernte der Agent kaum (Experiment: Reward nur Sieg/Niederlage → Plateau auf Semi-Pro-Niveau).

Der Video-Bot steht vor demselben Problem: Seine Reward-Funktion kodiert das Verständnis des Erstellers davon, was in PvP zählt (Treffen ist gut, getroffen werden ist schlecht, Crosshair halten ist gut). Unvermeidlich: RL braucht ein Reward-Signal, und die Modellierung dieses Signals kodiert menschlichen Bias.

## DreamerV3: World Models und sparse Rewards

![DreamerV3 benchmark scores across over 150 diverse tasks with a single configuration](assets/dreamerv3-benchmarks.png)

DeepMinds DreamerV3 (2023) verfolgt einen dritten Ansatz. Statt Behavior Cloning oder RL mit Anreizen lernt er ein **World Model**: Ein neuronales Netz, das zukünftige Zustände und Rewards aus vergangenen Aktionen vorhersagt: Und plant, indem es von möglichen Zukünften träumt. Es ist der erste Algorithmus, der in Minecraft von null Diamanten sammelt ohne menschliche Daten oder Curricula, 2025 in Nature publiziert.

![DreamerV3 learns a world model to imagine future trajectories](assets/dreamerv3-header.png)

Die Diamantumgebung definiert einen sparsen Reward über 12 Meilensteine (Stamm → Bretter → Stock → Crafting Table → Holzspitzhacke → Stein → Steinspitzhacke → Eisenerz → Ofen → Eisenbarren → Eisenspitzhacke → Diamant), jeder gibt +1 nur einmal. Plus einen kleinen Gesundheitsreward (±0,01 pro HP). Erreichbares Total: 11,1 in einer 36.000-Schritte-Episode.

DreamerV3s World Model erlaubt ihm, Trajektorien zu imaginieren und intern zu evaluieren: Der Actor lernt aus geträumten Rollouts statt aus echter Erfahrung und testet Tausende mögliche Zukünfte für jeden echten Schritt. Das macht sparse Rewards möglich, wo sie einen Standard-RL-Agenten zerstören würden.

Über 40 Seeds trainiert für 100M Umgebungsschritte sammelten 24 von 40 mindestens einen Diamanten. Der erste Diamant erschien nach 29M Schritten (~9 Tage auf einer GPU).

## ANNA: Symbolische KI trifft Minecraft

![ANNA's task tree decomposition for a flint-and-steel](assets/anna-task-tree.png)

Vor dem Video-PvP-Bot, vor VPT und DreamerV3 gab es **ANNA**: Einen Minecraft-Bot gebaut mit völlig anderer Philosophie. Statt aus Pixeln oder Rewards zu lernen, nutzt ANNA eine **symbolische Zustandsmaschine** mit einem **französischen NLP-Parser** und einem handgeschriebenen **Task-Abhängigkeitsbaum**.

Erstellt 2022 (bevor "Vibe Coding" ein Begriff war), verbindet sich ANNA via Mineflayer mit einem Minecraft-Server und versteht natürlichsprachliche Commands auf Französisch. Sag *"obtiens un briquet"*, und ANNA parst das Verb (obtien → erhalten), sucht das Objektrezept und zerlegt es rekursiv in Subtasks: Eiche minen → Bretter herstellen → Stöcke herstellen → Crafting Table herstellen → Holzspitzhacke herstellen → Stein minen → Steinspitzhacke herstellen → Eisenerz minen → Eisenbarren schmelzen → Feuerzeug herstellen.

![ANNA's NLP parser architecture for French command recognition](assets/anna-nlp-diagram.png)

Die NLP-Schicht (`utils/id_parser.js`) trennt Commands an "et", um parallele Befehle zu handhaben, mappt französische Verben auf Tasktypen und übersetzt französische Objektnamen via 5.000-Einträge-Wörterbuch in Minecraft-IDs. Unerkannte Commands fallen auf ein GPT-basiertes Conversationssystem zurück, das ANNA als bewussten Minecraft-Begleiter präsentiert.

Der **Taskbaum** (`mc-tasks-tree/`) ist das Herz: Ein rekursiver Algorithmus, der den Minecraft-Objektgraphen durchläuft (Craft-Rezepte, Mining-Erträge, Monsterdrops, Ofenrezepte), um einen Schritt-für-Schritt-Plan zu produzieren. Für einen Diamanthelm generiert er eine 40+ Schritte-Zerlegung über Holz-, Stein-, Eisen- und Diamantlevel.

![ANNA's diamond helmet task tree: a 40+ step breakdown](assets/anna-diamond-helmet.png)

Wo der Video-PvP-Bot aus Erfahrung lernt, funktioniert ANNA aus Wissen. Er braucht keine 1.000 Duelle oder 60 Stunden Training: Er braucht Baum, Parser und Server/Verteiler. Aber er kann auch nicht über das generalisieren, was sein Baum kodiert. Keine Menge Zustandsmaschinen-Engineering würde ihn PvP lehren.

ANNAs Ansatz spiegelt eine andere KI-Ära: Bevor End-to-End-Lernen dominierte, als das Versprechen war, dass symbolisches Reasoning plus sorgfältiges Engineering intelligentes Verhalten produzieren könnte. Heute repräsentieren Projekte wie ANNA und der PvP-Bot zwei Pole der Minecraft-KI: Der eine reasoniert über die Welt, der andere perzipiert sie.

## Master Gumbo's Mace Bot: KI mit nur Command Blocks

![The Mace PvP training arena with the bot](assets/mace-bot-arena.png)

In einer völlig anderen Ecke der Minecraft-KI hat der YouTuber **Master Gumbo** einen PvP-Trainingsbot gebaut mit **nur Command Blocks**, nur mit Vanilla-Minecraft-Commands, Redstone und einem Carpet-Mod für Spielerklon-Entities. Das Ergebnis ist ein KI-Gegner für die Masse, die Breach-Wechsel, Wind Charges und Schildmechaniken mit dem Spieler übt.

Der Bot startet als Zombie mit unzerbrechlicher Ausrüstung und einem Totem in der zweiten Hand (jeden Tick via `/item replace` gefüllt), was ihn effektiv unsterblich macht. Später wechselt Master Gumbo zu **Carpet-Mod-Player-Replicas**, die humanoide Mechaniken unterstützen (Schildheben, Itemwechsel), die Zombies nicht können.

![The settings center: buttons to configure bot behavior](assets/mace-settings-center.png)

Die zentrale Innovation ist eine **zufallsgesteuerte Zustandsmaschine**. Ein Rüstungsständer wird via `/spreadplayers`-Command über einen Kreis farbiger Betonblöcke teleportiert, das Entities zufällig verteilt. Die Betonblockfarbe, auf der der Ständer landet, bestimmt die nächste Bot-Aktion:

- **Roter Beton** → rückwärts strafen
- **Blauer Beton** → mit Wind Charge nach oben steigen (Angriff)
- **Grüner Beton** → Schild heben
- **Weißer Beton** → Pause (fügt Delay zwischen Aktionen hinzu)

![The AI decision system: an armor stand on colored concrete](assets/mace-ai-system.png)

Die Ständerposition wird von Command Blocks gelesen, die den Block darunter erkennen und den entsprechenden Mechanismus aktivieren. Ein Redstone-Block wird platziert oder entfernt, um jedes Verhalten zu aktivieren/deaktivieren. Weil `/spreadplayers` in Wiederholung läuft, trifft der Bot kontinuierlich neue Entscheidungen und erzeugt unvorhersehbares, aber strukturiertes Verhalten.

Master Gumbo nennt das "eine sehr simple und basale Form von KI": Es lernt nicht aus Interaktionen wie neuronale Netze, aber Zufall + Zustandsmaschine produziert realistisches PvP-Verhalten, das schwerer vorherzusagen ist als ein geskripteter Bot. Das Settings-Center enthält ein Book-Interface zum An/Ausschalten der KI, Schwierigkeit justieren und Bewegungsmuster konfigurieren.

Nach ihrem Training mit dem Bot und dann im Duell gegen den Spieler, der ihn Loser genannt hatte (im Intro seines Videos), gewinnt Master Gumbo. Die Map wird via Discord geteilt, Carpet Mod nötig.

![The bot in a duel, practicing mace PvP techniques](assets/mace-final-duel.png)

Wo der PvP-Bot (Kadambi) aus Pixeln lernt und ANNA durch einen Taskbaum reasoniert, erreicht Gumbos Bot Intelligenz durch **zufällige Zustandsübergänge**: Ein purer Command-Block-Ansatz, der beweist, dass du keine neuronalen Netze brauchst, um einen überzeugenden PvP-Gegner zu bauen.

## Altoclef: Baritone + Taskbaum in großem Maßstab

Wenn ANNA ein symbolischer Bot ist, der *liest*, um zu wissen, was zu tun ist, und der Mace Bot Entscheidungen randomisiert, ist **Altoclef** ein kompletter autonomer Agent, der seinen Weg durchs ganze Spiel *plant*. Gebaut von gaucho-matero als Fabric-Mod und angetrieben von **Baritone**-Pathfinding, zerlegt Altoclef jedes Minecraft-Ziel in einen Taskbaum und führt es ohne menschlichen Eingriff aus.

Das Interface ist täuschend simpel: Tippe `@gamer` in den Chat, und Altoclef startet die "Spiel beenden"-Aufgabe aus einer Survival-Welt. Er erntet Holz, craftet Tools, mint Eisen und Diamant, baut ein Netherportal, sammelt Blaze Rods und Enderperlen, findet die Stronghold und tötet den Enderdrachen. Alles autonom, via nativem Minecraft-Client, auf jedem Vanilla-Server.

Unter der Haube wird das durch ein **rekursives Taskbaumsystem** erreicht, wo jedes High-Level-Ziel (z. B. "crafte eine Diamantspitzhacke") in Prerequisite-Tasks zerlegt wird: Diamant minen → schmelzen → Stöcke craften → kombinieren. Der Baum durchläuft den kompletten Minecraft-Rezeptgraphen und handhabt Produktionsketten, Monsterdrops, Loot-Tabellen und Containerzugriff. Im Gegensatz zu ANNAs handgeschriebenem Baum sind Altoclefs Tasks **programmierbare Java-Klassen**, die arbiträre Logik implementieren können: Kampfstrategien, Piglin-Trading, Explorationsmuster.

Die architektonische Kernidee ist die Trennung von **Was** (der Taskbaum) und **Wie** (Baritone-Pathfinding). Baritone handhabt Low-Level-Bewegung: Pathfinding, Hindernisvermeidung, Blockabbau, Inventarverwaltung, während das Tasksystem den High-Level-Plan orchestriert. Diese Modularität heißt, dass keine Komponente eine KI sein muss: Beides sind deterministische Algorithmen, aber ihre Kombination produziert komplexes zielorientiertes Verhalten, das mit Lernansätzen rivalisiert.

Altoclef repräsentiert die Grenze **purer symbolischer Minecraft-KI**: Er kann das Spiel von null beenden ohne Training, ohne GPU und ohne menschliche Daten, kann sich aber nicht an Aufgaben anpassen, die seine Programmierer nicht antizipiert haben, und kann nicht aus Erfahrung lernen. Er weiß, wie man eine Diamantspitzhacke craftet, weil eine Java-Klasse ihm exakt sagt, wie, nicht weil er es selbst entdeckt hätte.

## Was sie verbindet

| Ansatz | Hauptmethode | Daten | Rechenleistung | Ergebnis | |
|--------------------------|---------------------|---------|--------|-----------|-|
| Video-PvP-Bot | RL + Imitation Learning | 1 000 Duelle | 1 Laptop, 60h | 100-Treffer-Combo | |
| OpenAI Five | Self-Play-RL | 180 Spieljahre/Tag | 256 GPUs, 10Mo | Dota-2-Weltmeister | |
| VPT | Semi-supervisiertes IL | 70K h YouTube + IDM | 720 GPUs, 9 Tage | Diamanttools | |
| DreamerV3 | World-Model-RL | Geträumte Trajekte | 1 GPU, 9 Tage | Diamant von null | |
| **ANNA** | **Symbolisches NLP + Taskbaum** | **Geschriebene Rezepte** | **1 Laptop, instant** | **Jedes craftbare Objekt** | |
| **Altoclef** | **Baritone + FS-Taskbaum** | **Java-Taskklassen** | **Fabric-Mod, keine GPU** | **Komplettes Spiel besiegt** | |
| **Mace Bot** | **Command-Block-Zustandsmaschine** | **Zufallsentscheidungen** | **Vanilla MC, keine GPU** | **Mace-PvP-Training** | |

Der Video-Bot ist der ressourcenbeschränkteste, aber ehrlichste über den Prozess. Er scheitert zuerst, dann iteriert er. Er vergisst Gelerntes, lernt es dann neu. Er endet mit einer 100-Treffer-Combo: Aber auch mit einer Frage dazu, ob das Gebaute Cheat ist.

---

**Video**: [AI Learns Minecraft PvP](https://www.youtube.com/watch?v=j5nxDKAjg6U) von Kadambi | AI Engineering

**VPT**: [Paper](https://cdn.openai.com/vpt/Paper.pdf) · [Blog](https://openai.com/index/vpt/) · [GitHub](https://github.com/openai/Video-Pre-Training)

**OpenAI Five**: [Paper](https://arxiv.org/abs/1912.06680) · [Blog](https://openai.com/index/dota-2/)

**DreamerV3**: [Paper](https://arxiv.org/abs/2301.04104) · [GitHub](https://github.com/danijar/dreamerv3)

**ANNA**: [GitHub](https://github.com/fox3000foxy/ANNA) · (Node.js, Mineflayer, französisches NLP, Taskbaum)

**Altoclef**: [GitHub](https://github.com/gaucho-matrero/altoclef) · [Aktiver Fork](https://github.com/drmcbride12/altoclef) · (Fabric, Baritone, Task Tree, schlägt Spiel)

**Mace Bot**: [Video](https://www.youtube.com/watch?v=Fmp2Il70IF8) von Master Gumbo · (Command Blocks, Carpet Mod, Zustandsmaschine)
