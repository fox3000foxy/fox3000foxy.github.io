---
title: "Die KI lernt Minecraft-PvP, Imitation Learning, Reinforcement Learning, und die 30 Variablen, die zählten"
description: "1 000 aufgezeichnete Duelle, neuronales Netz trainiert auf Pixeln, 90 % Treffpräzision: und der Bot rannte geradeaus gegen eine Wand. Dann kamen RL, curriculares Lernen und 60 Stunden Training."
date: 2026-07-09
tags:
  - minecraft
  - ai
  - python
authors:
  - fox3000foxy
lang: "de"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "dhSqerZbX5G4pdImoipXpGCEYPc0vznFwltE+TyhfFCwjX9mgD/PHtlDpsglpeeasfxeVvRxgPkVjFQl3oqEgg=="
---
## 

![AI Learns Minecraft PvP thumbnail](assets/ai-pvp-thumbnail.png)

Es gibt ein Video mit dem Titel [AI Learns Minecraft PvP (Reinforcement Learning + Behavior Cloning)](https://www.youtube.com/watch?v=j5nxDKAjg6U)von Kadambi ✓ AI Engineering, und das ist eine der ehrlichsten Erzählungen des Trainings einer IA Videospiel, die ich gesehen habe.

Das Prinzip: einen Bot bauen, der PvP Minecraft spielt (Schwertkit, komplett verzauberte Diamantenrüstung) indem er auf den Bildschirm schaut und Maus- und Tastatursteuerungen sendet. Es funktioniert nur mit Pixeln in der Eingabe und Aktionen in der Ausgabe, ohne den Speicher des Spiels zu lesen, ohne Makros und Mods.

Was das Video interessant macht, ist nicht das Endergebnis. Es ist der Weg: das Scheitern der Imitation Learning, der Drehpunkt zum feature engineering, die verheerenden Vergessenszyklen und die 60+ Stunden Training auf einem Laptop ohne GPU.

## Phase 1: Imitation Learning (das Scheitern)

![The bot during imitation learning: facing a wall, jumping up and down](assets/ai-pvp-imitation-fail.png)

Der Schöpfer begann mit einem vernünftigen Ansatz: 1.000 Duells aus seinem eigenen Gameplay aufnehmen, jeden Mausklick mit dem entsprechenden Tastendruck verbinden und ein neuronales Netzwerk zur Vorhersage von Aktionen aus Pixeln führen.
```python
# Pseudocode für die Imitations-Lernpipeline
dataset = record_duels(1000)          # hundreds of thousands of frames
for frame, action in dataset:
    pixels = capture_screen(frame)
    network.train(pixels → action)    # predict keyboard/mouse from image
```
Das Netzwerk hat gelernt, die Tasten mit **90 % Genauigkeit** vorauszusagen.

Dann haben sie es in einem echten Spiel getestet. Der Bot hat sich geradeaus zum Rand der Karte gewendet, hat eine Wand gegenübergestellt und ist von oben nach unten gesprungen.

Warum?

**Die Falle der Faulheit.** In einem PvP-Kampf wird die W-Taste meist gedrückt. Das Netzwerk erkannte, dass es eine hohe Genauigkeit erreichen konnte, indem es einfach W gedrückt hielt und nichts anderes tat. Es optimierte die häufigste Aktion auf Kosten aller anderen.

**Die menschliche Latenz.** Die Aktionen im Datensatz werden um etwa 200 ms menschliche Reaktionszeit verzögert. Bild nach Bild, Ursache und Wirkung sind für ein Modell aus rohen Pixeln fast unmöglich zu lernen, wenn Aktion und sichtbare Folge durch mehrere Bilder getrennt werden.

**Unkonsistente Demonstrationen.** Das eigene Gameplay des Schöpfers variierte: Manchmal streifte es mit der Tastatur, manchmal zielte es auf die Maus in identischen Situationen. Diese widersprüchlichen Einträge haben das Netzwerk gestört.

## Phase 2: Reinforcement Learning mit Lehrplan

![The bot learning to track horizontally during RL training](assets/ai-pvp-rl-horizontal.png)

Der Schöpfer hat die Nachahmung von Learning aufgegeben und sich auf den RL gedreht. Aber ein frischer Agent in ein komplettes PvP-Duell zu stürzen ist nutzlos: Es passiert zu viel auf einmal, damit eine zufällige Entdeckung etwas findet.

Die Lösung: das **curricular Lernen**. Jede Mechanik isolieren und den Bot die Grundlagen beherrschen lassen, bevor er in einen echten Kampf eintritt.

### Schritt 1: Horizontales Sichtfeld (7 Stunden)

Die einfachste Belohnungsfunktion: Positive Belohnungen für das Berühren eines Ziels, negative Strafe für Schaden.

Ursprünglich bewegt sich der Bot kaum (neuronale Netzwerk mit neutralen Werten initialisiert). Er zittert seitlich: Der Bot testet verschiedene Aktionen, um zu sehen, welche Belohnungen gegeben werden.

Nach einer Stunde lernt er, sich horizontal, aber schmerzhaft langsam zu zentrieren. Nach 7 Stunden kann er dem Feind nach links und rechts folgen, obwohl asymmetriemäßig (besser, um von rechts nach links zu bewegen als von links nach rechts, ein Verhalten, das während des Trainings anhielt).

### Schritt 2: Feature Engineering

Der Brutto-Bildschirmfotos machte mehr als 2 Millionen Pixel. Selbst wenn er auf 360p reduziert wurde, bedeutet das 200.000 Einträge: viel zu viel für ein effektives Lernen.

Der Schöpfer analysierte Tausende von Duellen und identifizierte **30 Variablen, die wirklich zählen**, in drei Gruppen aufgeteilt:

**Vision (Feind-Folge)**:

- Abstand vom Feind zum Zielor (crosshair)

- Größe der feindlichen Umkarton-Box

- Höhe des Feindes

- Ziel-/Ziel-Status

- Relative Geschwindigkeit

Anstatt das gesamte Bild zu bearbeiten, filtert der Bot die Pixel streng durch die Farbe der feindlichen Rüstung, so dass die Erkennung fast sofort. Ähnliche Farbhintergrundblöcke können diese Filterung stören: aber in Minecraft kannst du einfach die Texturen ändern.

**OCR (HUD-Lesen)**:

Da der Bot die Koordinaten aus dem Spielcode nicht wiederherstellen kann, scannt er den Bildschirm in Echtzeit, um zu extrahieren:

- Kamera-Pitch

- Momentum

- Ebene Y

Standard OCR Strafe mit dem transparenten Text von Minecraft, so werden kritische Daten in Schwarz-Weiß für sofortige Wiedergabe gezwungen.

**Zeit (Kontextfenster)**:

- Zeit, seit du den Feind getroffen hast.

- Zeit, seit er dich berührt hat.

- Gleittampon der vorhergehenden Bot-Aktionen

Dies gibt dem Netzwerk einen zeitlichen Kontext: Ohne ihn hat der Bot keine Ahnung, ob er in der Mitte eines Combos ist oder ob er gerade einen Kampf beginnt.

### Schritt 3: Vertikales Sichtfeld (7 weitere Stunden)

![The bot learning to aim up and down during RL training](assets/ai-pvp-rl-vertical.png)

Die vertikale Mausbewegung wurde am Anfang ✓ ein totales Desaster. Die anfängliche Leistung war gebrochen.

Nach einer weiteren Stunde im Sandkasten verstand der Bot, wie man nach oben und unten schauen sollte. Aber im Prozess vergaß er völlig, wie er horizontal folgen sollte.

Das ist das katastrophale** Vergessen**: ein klassisches Problem des Maschinenlernens, bei dem die Optimierung für neue Daten die zuvor gelernten Darstellungen überschrieben. Durch die Optimierung der vertikalen Zielrichtung hat das neuronale Netzwerk versehentlich seinen horizontalen Fortschritt niedergeschlagen und den Schöpfer mit einem Bot zurückgelassen, der seinen Zielor auf einem Niveau halten konnte, aber nicht einem Ziel folgen konnte.

Es dauerte **6 Überstunden**, um die horizontale Überwachung zu finden und dabei die vertikale Kontrolle zu behalten. Der Bot hielt eine gute Platzierung des Suchers durch die OCR-Gruppe, die den Pitch der Kamera auszog.

### Schritt 4: Tastatursteuerung

![The bot toggling the W key constantly, learning to commit to movement](assets/ai-pvp-keyboard.png)

Die Erlaubnis, die Tastatur zu benutzen, machte die Zeitmerkmale noch kritischer. Zuerst war die W-Taste ständig aktiviert und deaktiviert: eine schnelle Änderung, weil das Netzwerk nicht gelernt hatte, sich zu engagieren.

Dieses Verhalten wurde bestraft, so dass der Bot gelernt, ihn zu glätten. Er begann, mehr Schläge durch Sprint (der taube Ton gegen den swish mit einem Schlag aufstehen). Einige Combos schien unbefriedigend, weil der Bot nutzte seinen Vorteil der Reichweite auf den Feind.

Um die Dinge gerecht zu machen, hat der Schöpfer die Reichweite des Feindes erhöht. Viele der Strategien, die der Bot gelernt hat, haben aufgehört zu funktionieren. Aber mit der Zeit hat er sich angepasst.

### Schritt 5: Lernst du beim Klicken beim Bot

Für die Endphase brachte der Schöpfer die Imitation Learning zurück: aber nur um das Timing der Klicks zu lehren, nicht die komplette Kontrollpolitik. Der Bot versuchte, die Klickmuster der registrierten Duells nachzuahmen.

Ursprünglich hatte er zu viel Angst, etwas zu versuchen, Angst vor der Strafe für schlechte Klicks. Aber schließlich fand er den Mut, zu schlagen und landen Schläge. Natürlich hat er vergessen, wie man wieder in den Prozess zielen: der Schöpfer musste ihn ruhig für **50 Überstunden** zu einem zufrieden stellenden Zustand zurück.

## Die Diskussion über Betrug

Das Video endet mit der Frage: Betrüget dieser Bot?

Das Argument gegen: Der Bot behandelt nur das, was ein Mensch sieht (die gleichen Pixel), sendet die gleichen Tastatureinträge/Maus wie ein Mensch (ohne Manipulation von Paketen wie Anti-Knockback) und liest nicht den Speicher des Spiels (ohne X-Ray oder ESP).

Das Argument für: Ein Bot kann schneller als ein Mensch handeln, und wenn der Gegner denkt, er spiele gegen einen Menschen, aber das ist nicht der Fall, dann ist es Betrug.

Die Meinung des Schöpfers: Das hängt von der Absicht ab. Wenn beide Seiten wissen, dass es ein Bot ist, ist das Spiel fair. Der Bot kettet den Feind ins Leere mit einer Reihe von 100 Schlägen.

## Das Ergebnis

![The bot executing a 100-hit combo](assets/ai-pvp-final-combo.png)

Ein PvP Minecraft Bot, der auf einem **Laptop ohne GPU** angetrieben wird, auf einer benutzerdefinierten Trainingspipeline mit:

- **Bildschirm-Kanäle** für Pixeleingang (2M+ Pixel → 30 entworfene Eigenschaften)
- **Kurren lernen** (horizontal → vertikal → Tastatur → Klicken)
- **RL für die Motorsteuerung** + **imitation learning für das Timing von Klicks**
- **Feature engineering** auf den Rohpixeln (3 Gruppen: Vision, OCR, Zeit)
- **60+ Stunden Training** über mehrere Phasen

Die Gesamtdauer des Trainings ist Dutzende von Stunden, aber die meisten sind passiv. Der Bot zittert bis zum Verstehen, vergiss, was er gelernt hat, erlernt und schliesslich eine Reihe von 100 Schlägen.

Das Video ist auf [youtube.com/watch?v=j5nxDKAjg6U](https://www.youtube.com/watch?v=j5nxDKAjg6U) .

---

*Dieser Artikel deckt nur den Inhalt des Videos ab. Für einen breiteren Kontext auf der IA Minecraft: VPT, DreamerV3 und die Landschaft des Imitation Learning vs RL: Die folgenden Abschnitte verbinden dieses Projekt mit dem größeren Bereich.*

## VPT: Behavior Cloning in großem Maßstab

![OpenAIs VPT-Projektdiagramm: Das Inverse-Dynamics-Modell sagt Aktionen aus Bildpaaren voraus](assets/vpt-overview.svg)

Der Ansatz ✓ behavior cloning having des Videos (Phase 1) ist die gleiche Technik, die OpenAI in seinem Projekt verwendet **Video PreTraining (VPT)**, aber an den entgegengesetzten Enden des Ressourcenspektrums. VPT hat bewiesen, dass Imitation learning für Minecraft funktioniert, wenn man 70.000 Stunden Video, 720 GPUs und ein dynamisches Gegenstück model, um pseudo-etikettierte Daten zu markieren. Der Schöpfer hat hier bewiesen, daß er mit einem Laptop und 1.000 Duell fehlschlägt: aber aus dem gleichen Grund: Learning Imitation ist durch die Qualität seiner Demonstrationen begrenzt.

![OpenAIs VPT-Agent fällt einen Baum in Minecraft](assets/vpt-minecraft.jpg)

Die VPT-Pipeline löst das Problem der Daten, indem sie ein **Inverse Dynamics Model (IDM)** erzeugt, das das Bild t-1 und das Bildt+1 betrachtet, um die Aktion mit dem Bild t vorauszusagen. Weil das IDM nicht kausal ist (es sieht zukünftige Bilder), ist die Aufgabe einfacher als Behavior Cloning und braucht viel weniger gelabelte Daten. Sie bezahlten Contractor etwa 2.000 $ für 2.000 Stunden gelabelte Daten und nutzten dann das IDM, um 70.000 Stunden YouTube-Minecraft-Videos zu pseudo-labeln.

![Crafting-/Sammelrate je nach Vortrainings-Datenvolumen (Log-Skala): Crafting-Tische, Holzwerkzeuge, Steinwerkzeuge](assets/vpt-stone-pickaxe-sequence.svg)

Der Skaleneffekt ist klar: auf einer 1-Stunden-Logachse bis 100.000 Stunden Vorantriebsdaten ist der Satz, zu dem das Modell eine Craft-Tisch, Holzwerkzeuge und dann Steinwerkzeuge herstellt, in Stufen klettert. Das Modell, das nur über 2.000 Stunden von Crafttischen mit einem Limit-Kontraktoren angetrieben wird, fügt die 70.000 Stunden hinzu, die von der IDC (auf der Grafik gepunktete Linie) nicken, dass Steinwerkzeuge aus Zero-Shot ohne einen einzigen RL-Schritt entstehen.

Das grundlegende Modell von 0,5B resultierende Parameter erreichte nicht prÃ¤fende Zero-Shot-FÃ¤higkeiten mit dem RL allein: Baumschneiden, Tische herstellen, Säulenspringen: und fein-gemÃ¤hlt mit RL, wurde es die erste IA, Diamantwerkzeuge herzustellen.

![Belohnung je nach Anzahl der RL-Trainingsepisoden: zufällig initialisiertes Modell vs. vortrainiertes VPT-Modell](assets/vpt-diamond-pickaxe-sequence.svg)

Diese Grafik zeigt, warum das Vortraining alles für die RL nachgeschaltet ändert. Die RL, die aus einem zufällig initialisierten Netzwerk (orange) stammt, bleibt flach bei 0 auf fast einer Million Episoden: die Aufgabe ✓ einen Diamanten zu erhalten hat eine zu zerstreute Belohnung, damit ein naiver Agent durch zufällige Erkundung auf sie fällt. Der feine getönte RL aus dem vor-verwachsenen (grünen) VPT-Modell geht bereits mit dem Grundverhalten (mineren, herstellen, erforschen) auf und steigt regelmäßig bis zu einem Preis von etwa 25, was dem kompletten Weg zu einem Diamanten-Teich entspricht.

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

*Offizielle Videodemos des VPT-Projekts von OpenAI, die den Agenten in Aktion zeigen.*

## OpenAI Five: Das Problem des Reward Shaping

![OpenAI Five playing Dota 2 against human professionals](assets/openai-five-dota2.jpg)

OpenAI Five (2019) besiegte die Weltmeister von Dota 2 mit reiner RL im Selbstlernen: keine Nachahmung Learning. 256 GPUs, 128.000 CPU-Herzen, 180 Jahre Spiel am Tag, 10 Monate Training.

Aber die Belohnungsfunktion wurde von Dota-Experten von Hand entworfen: **28 Eigenschaften von 20.000**, jeweils mit manuell angepassten Gewichten. Nettowert, Beseitigungen, Tote, Gesundheit der Türme, Flurzuweisungen: Alles wurde von Menschen ausgewählt und gewichtet. Ohne diese Modellierung lernte der Agent kaum (Erfahrung: Belohnen Sieg/Vernichtung nur → Plateau auf halbprofessioneller Ebene).

Der Videobot steht vor dem gleichen Problem: seine Belohnungsfunktion encode das Verständnis des Schöpfers von dem, was in PvP zählt (Tuch ist gut, berührt zu werden ist schlecht, das Ziel ist gut). Das ist unvermeidlich: RL braucht ein Belohnungssignal, und die Modellierung dieses Signals encodiert eine menschliche Verzerrung.

## DreamerV3: World Models und disparierte Belohnungen

![DreamerV3 benchmark scores across over 150 diverse tasks with a single configuration](assets/dreamerv3-benchmarks.png)

Der DeepMind DreamerV3 (2023) verfolgt einen dritten Ansatz. Anstelle von Behavior Cloning oder RL mit Anreizen erlernt er ein **world model**: ein neuronales Netzwerk, das zukünftige Zustände und Belohnungen aus früheren Aktionen vorhersagt: und plant, indem er mögliche zukünftige Algorithmusen erträumt. Es ist der erste Algorithmus, der Diamanten in Minecraft ohne menschliche Daten oder Curricula sammelt, veröffentlicht 2025 in Nature.

![DreamerV3 learns a world model to imagine future trajectories](assets/dreamerv3-header.png)

Die Diamantumgebung definiert eine sparsame Belohnung auf 12 Meilensteinen (Bolzen → Bretter → Stock → Crafttisch → Holzstapel → Stein → Eisensteinstapeln → Eisenerzen → Ofen → Stahlstift → Diamanten), jeder gibt +1 einmal. Mehr eine kleine Belohnungen für Gesundheit (±0,01 pro pv). Insgesamt erreichbar: 11,1 in einer Episode von 36.000 Schritten.

Das World Model von DreamerV3 ermöglicht es ihm, sich Wege vorzustellen und sie intern zu bewerten: Der Schauspieler lernt traumhafte Rollouts anstatt reale Erfahrung, indem er Tausende von möglichen Zukunfts-Tests für jeden realen Schritt testet. Dies ermöglicht die getrennten Belohnungen, wo sie einen Standard-RL-Agenten zerstören würden.

Von 40 auf 100M getriebenen Samen von Umweltschritten haben 24 von 40 mindestens einen Diamanten gesammelt. Der erste Diamant erschien nach 29M Runden (~9 Tage an einer GPU).

## ANNA: Die symbolische KI trifft Minecraft

![ANNAs Aufgabenbaum-Zerlegung für ein Feuerzeug](assets/anna-task-tree.png)

Vor dem PvP-Bot des Videos, vor VPT und DreamerV3, gab es **ANNA**: ein Minecraft-Bort, der mit einer völlig anderen Philosophie gebaut wurde. Anstatt von Pixeln oder Belohnungen zu lernen, verwendet ANNA eine **Symbolische Statusmaschine** mit einem **Französischen NLP-Scanner** und einem **Ordner von Aufgabenabhängigkeit**, die von Hand geschrieben wurde.

Die 2022 gegründete ANNA (vor der ✓ vibe coding ✓ ein Begriff ist) verbindet sich mit einem Minecraft Server über Mineflayer und umfasst Befehle in natürlicher Sprache in Französisch. Dis * ✓ erhält ein Feuerzeug ←, und ANNA analysiert das Verb (erhalten → erhalten), sucht das Rezept des Objekts, und rekursiv zerlegt in Untertassen: Miner Eiche → Herstellung von Brettern → Herstellen von Stöcken → Produktion eines Craft Tisches → eine Holztasche herstellen → Steinsteinsteinstein → einen Steinkipper herstellen © Miner von Eisenerz → schmelzen von Eisenblöcken › das Feuerzeug herstellen.

![ANNAs NLP-Parser-Architektur für französische Befehlserkennung](assets/anna-nlp-diagram.png)

Die Schicht NLP (`utils/id_parser.js`) trennt Befehle auf ✓ und ← zur Verwaltung paralleler Befehle, verbindet französische Verben mit Aufgabentypen und übersetzt die Namen französischer Objekte in Minecraft-IDs über ein Wörterbuch mit 5.000 Einträgen. Unerkannte Befehle wechseln zu einem GPT-basierten Konversationssystem, das ANNA als bewusster Minecraw-Gefährte präsentiert.

Der** Aufgabenbaum** (`mc-tasks-tree/`) ist das Herz: ein rekursiver Algorithmus, der den Minecraft-Objektgrafiken (Craft-Rest, Bergbau-Ressourcen, Monster-Drops, Back-Rezepte) durchläuft, um einen Schritt für Schritt zu produzieren. Für einen Diamanthelm erzeugt es eine Zersetzung in 40+ Schritten, die Holz, Stein, Eisen und Diamanten abdecken.

![ANNAs Diamanthelm-Aufgabenbaum: Zerlegung in über 40 Schritte](assets/anna-diamond-helmet.png)

Wo der PvP-Bot des Videos aus Erfahrung lernt, funktioniert ANNA aus Wissen. Er braucht keine 1000 Duells oder 60 Stunden Training: er braucht den Baum, den Analysator und den Server/Vertreiber. Aber er kann auch nicht über das hinaus verallgemeinern, was sein encode Baum ist. Keine Menge Zustandmaschinentechnik-Engineering würde ihn lehren, PvV zu machen.

ANNAs Ansatz spiegelt eine andere Zeit der KI wider: bevor das End-to-End-Lernen dominiert, wenn das Versprechen war, dass die symbolische Argumentation in Verbindung mit einer sorgfältigen Technik intelligentes Verhalten erzeugen konnte. Heute sind Projekte wie ANNA und der PvP-Bot zwei Pole der IA Minecraft vertreten: einer über die Welt, der andere übersieht es.

## Master Gumbo's Mace Bot: IA mit nur Block-Befehlen

![The Mace PvP training arena with the bot](assets/mace-bot-arena.png)

In einer völlig anderen Ecke als der IA Minecraft hat der YouTube **Master Gumbo** einen PvP-Training-Bot mit **nur Befehlen Blocks** gebaut, nur mit Minec Raf Vanilla-Befehlen, Redstone und einem Mod-Carpet für Spieler-Kloneinheiten. Das Ergebnis ist ein IA-Wander für die Masse, die Brechungswechsel, Windlasten und Schildmechanismen mit dem Spieler praktiziert.

Der Bot beginnt wie ein Zombie mit unzerbrechlicher Ausrüstung und einem Totem in seiner zweiten Hand (bei jedem Tick via gefüllt`/item replace`), macht es unsterblich. Später, Master Gumbo geht zu Bots **Carpet Mod's player replica**, die humanoide Mechaniken (Schildablage, Objektwechsel) unterstützen, die Zombies nicht tun können.

![The settings center: buttons to configure bot behavior](assets/mace-settings-center.png)

Die zentrale Innovation ist eine **-Sicherungsmaschine, die durch das Zufällige gesteuert wird**. Ein Waffenträger wird über einen Kreis von Betonblöcken mit Hilfe der Steuerung beamen`/spreadplayers`Die Farbe des Betonblocks, auf dem der Waffenhalter landet, bestimmt die nächste Wirkung des Bots:

- **Rötlicher Bug** → straffe zurück
- **Blauer Bug** → steigt nach oben (Angriff) mit Windlast
- **Grüner Beton** → Schild hochheben
- **Weißer Balken** → Pause (Füge Zeit zwischen den Aktionen hinzu)

![The AI decision system: an armor stand on colored concrete](assets/mace-ai-system.png)

Die Position des Waffenträgers wird von Block-Befehlen gelesen, die den Block unter der Oberfläche erkennen und den entsprechenden Mechanismus aktivieren. Ein redstone Block wird platziert oder entfernt, um jedes Verhalten zu aktivieren/deaktivieren.`/spreadplayers`Dreht sich in Wiederholung, nimmt der Bot ständig neue Entscheidungen, die ein unvorhersehbares aber strukturiertes Verhalten verursachen.

Master Gumbo nennt dies eine sehr einfache und grundlegende Form von KI ✓: Es lernt nicht Interaktionen wie neuronale Netzwerke, aber die Aaleatory + Status-Maschine erzeugt ein realistisches PvP-Verhalten, das schwieriger vorherzusagen ist als ein scriptierter Bot. Das Parameterzentrum beinhaltet eine Buchschnittstelle, um die KI zu aktivieren/deaktivieren, die Schwierigkeit zu ändern und die Bewegungsmotive zu konfigurieren.

Nachdem sie mit dem Bot trainiert haben und dann gegen den Spieler duelliert haben, der ihn als Null bezeichnet hat (in der Intro seines Videos), gewinnt Master Gumbo. Die Karte wird über Discord, Carpet Mod benötigt geteilt.

![The bot in a duel, practicing mace PvP techniques](assets/mace-final-duel.png)

Wo der PvP Bot (Kadambi) aus Pixeln lernt und ANNA durch einen Taskbaum redet, erreicht der Master Gumbo Bot Intelligenz durch **Übergänge zufälliger Zustände**: eine reine Befehlsblockanflug, der beweist, dass du keine neuronalen Netzwerke brauchst, um einen überzeugenden PvV-Widerstand zu bauen.

## Altoclef: Baritone + Aufgabenbaum in großem Maßstab

Wenn ANNA ein symbolischer Bot ist, der *liest* um zu wissen, was zu tun ist, und der Mace Bot die Entscheidungen wandert, **Altoclef** ist ein vollständiger autonomer Agent, der* seinen Weg durch das ganze Spiel plant. Erbaut von gaucho-matero als Fabric-Mod und angetrieben durch das pathfinding **Baritone**, Altoclaf zerlegt jedes Minecraft-Objektiv in einen Taskbaum und führt es ohne menschliche Intervention aus.

Die Schnittstelle ist irreführend einfach: tipp`@gamer`in der Katze, und Altoclef beginnt die Aufgabe ✓ das Spiel von einer überlebenden Welt zu beenden. Er sammelt Holz, Werkzeug-Craft, Eisen- und Diamantmine, baut ein Nether-Portal, sammelt Blaze-Sticks und Ender-Perlen, findet den Stronghold und tötet den Ender Dragon. Alles in Autonomie, über den nativen Minecraft-Client, auf jedem Vanilla-Server.

Unter der Haube wird dies durch ein **Rekursiv-Arbeitswellensystem** erreicht, bei dem jedes hohe Ziel (z. B. ✓ craft ein Diamantenstapel ✓) in die voreingestellten Aufgaben aufgeteilt wird: → schmelzen du den Diamanten → craft der Sticks → kombinieren. Der Baum durchläuft den vollständigen Graphen der Minecraft-Rezepte, verwaltet die Produktionsketten, Monsterdrops, Beutetische und den Zugang zu Containern. Im Gegensatz zu dem handgeschriebenen Baum von ANNA sind die Aufgaben von Altoclef programmierbare ** Java-Klassen, die eine willkürliche Logik implementieren können: Kampfstrategien, Troc mit Piglins, Erkundungsmotive.

Die wichtigste architektonische Idee ist die Trennung von **Warum** (der Task-Baum) vom **comment** (das pathfinding Baritone). Baritones Verwaltung von niedrigen Verschiebungen: pathfinding, Vermeidung von Hindernissen, Blockbruch, Inventarverwaltung, während das Task-System die hohe Ebene orchiert. Diese Modularität bedeutet, dass keine Komponente eine IA sein muss: beide sind deterministische Algorithmen, aber ihre Kombination erzeugt ein komplexes und zielorientiertes Verhalten, das mit Lernansätzen konkurriert.

Altoclef stellt die Grenze von ** der reinen symbolischen Minecraft IA** dar: Es kann das Null-Spiel ohne Training, ohne GPU, und ohne menschliche Daten beenden, aber es kann nicht an Aufgaben passen, die seine Programmierer nicht vorausgesehen haben, und es kann aus Erfahrung nicht lernen. Es weiß craft einen Diamanten Talon, weil eine Java-Klasse ihm genau sagt, wie, nicht weil er es allein entdeckt hat.

## Was sie verbindet

| Ansatz | Hauptmethode | Daten | Berechnung | Ergebnis | |
|--------------------------|---------------------|---------|--------|-----------|-|
| PvP-Bot für Video | RL + Imitation learning | 1 000 Duells | 1 Laptop, 60 Stunden | 100-Schläge-Beombo | |
| OpenAI Five | RL für Selbstlernfähigkeit | 180 Jahre Spielzeit/Tag | 256 GPUs, 10mo | Weltmeister Dota 2 | |
| VPT | II. Halb-Supervisorisch | 70K h YouTube + IDM | 720 GPUs, 9 Tage | Diamantwerkzeuge | |
| DreamerV3 | RL Weltmodell | Traumhafte Reise | 1 GPU, 9 Tage | Null-Diamant | |
| **ANNA** | **Symbolische NLP + Arbeitsbaum** | **Schriftliche Rezepte** | **1 Laptop, Moment** | **Alle verwertbaren Gegenstände** | |
| **Altoclef** | **Baritone + Tasktree FS** | **Java task class** | **Fabrik mod, Nr. GPU** | **Beat das gesamte Spiel** | |
| **Mace Bot** | **Befehlsblock-Statusmaschine** | **Zufällige Entscheidungen** | **Vanilla MC, ohne GPU** | **PvP-Training | |

Der Videobot ist am meisten in Ressourcen gezwungen, aber ehrlicher über den Prozess. Er scheitert zuerst, dann iter. Er vergisst, was er gelernt hat, und dann erfährt er es wieder. Er endet mit einem Compo mit 100 Schlägen: aber auch mit einer Frage, was es im Betrug gebaut hat.

---

**Video**:[AI Learns Minecraft PvP](https://www.youtube.com/watch?v=j5nxDKAjg6U)von Kadambi ✓ AI Engineering

**VPT**:[Article](https://cdn.openai.com/vpt/Paper.pdf) · [Blog](https://openai.com/index/vpt/) · [GitHub](https://github.com/openai/Video-Pre-Training)

**OpenAI Five**:[Article](https://arxiv.org/abs/1912.06680) · [Blog](https://openai.com/index/dota-2/)

**DreamerV3**:[Article](https://arxiv.org/abs/2301.04104) · [GitHub](https://github.com/danijar/dreamerv3)

**ANNA**:[GitHub](https://github.com/fox3000foxy/ANNA)· (Node.js, Mineflayer, NLP Französisch, Arbeitsbaum)

**Altoclef**:[GitHub](https://github.com/gaucho-matrero/altoclef) · [Active fork](https://github.com/drmcbride12/altoclef)· (Fabrik, Baritone, task tree, beats game)

**Mace Bot**:[Vidéo](https://www.youtube.com/watch?v=Fmp2Il70IF8)von Master Gumbo · (Kommando Blocks, Carpet Mod, Statusmaschine)
