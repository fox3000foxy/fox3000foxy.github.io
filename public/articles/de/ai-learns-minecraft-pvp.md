---
title: KI lernt Minecraft PvP -- Imitation Learning, Reinforcement Learning und die 30 Variablen, die zählten
description: "1.000 Duelle aufgezeichnet, neuronales Netzwerk auf Pixeln trainiert, 90 % Tastaturgenauigkeit : und der Bot rannte gegen eine Wand. Dann kamen RL, Curriculum Learning und 60 Stunden Training."
date: 2026-07-09
tags:
  - minecraft
  - ai
  - reinforcement-learning
  - imitation-learning
  - python
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "kl/ocDamtTBQciLlGuoQhdQa5UuU0IwHYjAMHiio2rkv1eeDPRwJ9CTT4fYGysF4eXjFtwXNdp5Hp+HZk2BmTw=="
---

## Einführung

![AI Learns Minecraft PvP thumbnail](assets/ai-pvp-thumbnail.png)

Es gibt ein Video namens [AI Learns Minecraft PvP (Reinforcement Learning + Behavior Cloning)](https://www.youtube.com/watch?v=j5nxDKAjg6U) von Kadambi | AI Engineering, und es ist einer der ehrlichsten Berichte über das Training einer spielenden KI, die ich gesehen habe.

Die Idee: einen Bot bauen, der Minecraft PvP spielt (Schwert-Kit, vollverzauberte Diamantrüstung), indem er den Bildschirm ansieht und Maus- und Tastaturbefehle ausgibt. Kein Lesen des Spielspeichers, keine Makros, keine Mods : nur Pixel hinein, Aktionen heraus.

Was das Video interessant macht, ist nicht das Endergebnis. Es ist der Weg: das Scheitern des Imitation Learning, der Feature-Engineering-Pivot, die Zyklen des katastrophalen Vergessens und die 60+ Stunden Training auf einem Laptop ohne GPU.

## Phase 1: Imitation Learning (das Scheitern)

![The bot during imitation learning: facing a wall, jumping up and down](assets/ai-pvp-imitation-fail.png)

Der Ersteller begann mit einem vernünftigen Ansatz: 1.000 Duelle des eigenen Gameplays aufzeichnen, jeden Mausklick und Tastendruck dem entsprechenden Bild zuordnen und ein neuronales Netzwerk trainieren, um Aktionen aus Pixeln vorherzusagen.

```python
# Pseudocode for the imitation learning pipeline
dataset = record_duels(1000)          # hundreds of thousands of frames
for frame, action in dataset:
    pixels = capture_screen(frame)
    network.train(pixels → action)    # predict keyboard/mouse from image
```

Das Netzwerk lernte, Tastenanschläge mit **90 % Genauigkeit** vorherzusagen. Vielversprechend.

Dann testete man es in einem echten Match. Der Bot lief direkt zum Rand der Karte, stellte sich vor einer Wand und hüpfte auf und ab.

Warum?

**Die Faulheitsfalle.** In einem PvP-Kampf wird die W-Taste die meiste Zeit gedrückt. Das Netzwerk erkannte, dass es hohe Genauigkeit erreichen konnte, indem es einfach W gedrückt hält und sonst nichts tut. Es optimierte auf die häufigste Aktion auf Kosten aller anderen.

**Menschliche Latenz.** Aktionen im Datensatz sind um etwa 200 ms menschlicher Reaktionszeit verzögert. Zwischen den Einzelbildern ist Ursache und Wirkung für ein Modell fast unmöglich aus Rohpixeln zu lernen, wenn die Aktion und ihre sichtbare Konsequenz durch mehrere Einzelbilder getrennt sind.

**Innkonsquenzen Demonstrationen.** Das eigene Gameplay des Erstellers variierte: manchmal mit der Tastatur strafen, manchmal mit der Maus zielen in identischen Situationen. Diese widersprüchlichen Eingaben verwirrten das Netzwerk.

## Phase 2: Reinforcement Learning mit Curriculum

![The bot learning to track horizontally during RL training](assets/ai-pvp-rl-horizontal.png)

Nachdem er das Imitation Learning aufgegeben hatte, wechselte der Ersteller zu RL. Aber einen frischen Agenten in ein volles PvP-Duell zu werfen, ist nutzlos: es passiert zu viel auf einmal, als dass zufällige Erkundung etwas finden könnte.

Die Lösung: **Curriculum Learning**. Jede Mechanik isolieren und den Bot die Grundlagen meistern lassen, bevor er in ein echtes Duell eintritt.

### Schritt 1: Horizontales Zielen (7 Stunden)

Die einfachste Belohnungsfunktion: positive Belohnung für einen Treffer, negative Strafe für erlittenen Schaden.

Zunächst bewegt sich der Bot kaum (neuronales Netzwerk auf neutrale Werte initialisiert). Er zittert hin und her: der Bot testet verschiedene Aktionen, um zu sehen, welche Belohnungen geben.

Nach einer Stunde lernt er, sich horizontal zu zentrieren, aber quälend langsam. Nach 7 Stunden kann er dem Feind links-rechts folgen, wenn auch asymmetrisch (besser beim Bewegen von rechts nach links als von links nach rechts, ein Verhalten, das während des gesamten Trainings bestehen blieb).

### Schritt 2: Feature Engineering

Die rohe Bildschirmaufnahme umfasste über 2 Millionen Pixel. Selbst auf 360p herunterskaliert sind das 200.000 Eingaben: viel zu viele für effizientes Lernen.

Der Ersteller analysierte tausende Duelle und identifizierte **30 Variablen, die wirklich zählen**, in drei Gruppen:

**Vision (Feindverfolgung)** :
- Entfernung des Feindes vom Fadenkreuz
- Größe des Begrenzungsrahmens des Feindes
- Höhe des Feindes
- Fadenkreuzzustand (auf/von Ziel)
- Relative Geschwindigkeit

Anstatt das gesamte Bild zu verarbeiten, filtert der Bot Pixel streng nach der Rüstungsfarbe des Feindes, was die Erkennung nahezu augenblicklich macht. Ähnlich gefärbte Hintergrundblöcke können dies stören: aber in Minecraft kann man einfach die Texturen ändern.

**OCR (HUD-Lesien)** :
Da der Bot keine Koordinaten aus dem Spielcode abrufen kann, scannt er den Bildschirm in Echtzeit, um Folgendes zu extrahieren:
- Kameraneigung (Pitch)
- Momentum
- Y-Höhe

Standard-OCR hat Schwierigkeiten mit Minecrafts transparentem Text, daher werden kritische Daten für sofortiges Lesen auf Schwarzweiß gezwungen.

**Zeit (Kontextfenster)** :
- Zeit seit Sie den Feind getroffen haben
- Zeit seit er Sie getroffen hat
- Laufpuffer der eigenen vorherigen Aktionen des Bots

Dies gibt dem Netzwerk einen zeitlichen Kontext: ohne ihn hat der Bot keine Ahnung, ob er sich mitten in einer Kombination befindet oder gerade einen Kampf beginnt.

### Schritt 3: Vertikales Zielen (weitere 7 Stunden)

![The bot learning to aim up and down during RL training](assets/ai-pvp-rl-vertical.png)

Das Hinzufügen vertikaler Mausbewegungen war anfangs « eine totale Katastrophe ». Die anfängliche Leistung war kaputt.

Nach einer weiteren Stunde im Sandbox lernte der Bot, wie man nach oben und unten schaut. Aber dabei vergaß er völlig, wie man horizontal verfolgt.

Das ist das **katastrophale Vergessen**: ein klassisches Problem des maschinellen Lernens, bei dem die Optimierung für neue Daten zuvor gelernte Repräsentationen überschreibt. Durch die Optimierung auf vertikales Zielen überschrieb das neuronale Netz versehentlich seine horizontalen Fortschritte, sodass der Ersteller einen Bot hatte, der zwar sein Fadenkreuz waagerecht halten, aber kein Ziel verfolgen konnte.

Es dauerte **6 weitere Stunden**, um die horizontaleensuite Vertition wiederzuerlangen unteron gleichzeitiger Beibehaltung der vertikalen Steuerung. Der Bot behielt dann eine gute Fadenkreuzpositionierung dank der OCR-Gruppe bei, die die Kameraneigung extrahierte.

### Schritt 4: Tastaturssteuerung

![The bot toggling the W key constantly, learning to commit to movement](assets/ai-pvp-keyboard.png)

Dem Bot die Erlaubnis zur Tastaturnutzung zu geben, machte dieMöglichkeit zeitbasiertenich die zeitbasierten Funktionen noch kritischer. Zunächst wurde die W-Taste ständig ein- und ausgeschaltet: schnelles Umschalten, weil das Netzwerk nicht gelernt hatte, sich zu committen.

Dieses Verhalten wurde bestraft, also lernte der Bot, es zu glätten. Er begann mehr Sprungtreffer zu landen (das dumpfe Geräusch versus das Schwirren eines stehenden Schlags). Manche Kombos sahen unbefriedigend aus, weil der Bot seine Reichweitenvorteil gegenüber dem Feind ausnutzte.

Um die Chancen auszugleichen, erhöhte der Ersteller die Reichweite des Feindes Viele der erlernten Strategien des Bots funktionierten nicht mehr. Aber mit mehr Zeit passte er sich an.

### Schritt 5: Dem Bot beibringen, wann er klicken soll

Für die letzte Phase brachte der Ersteller das Imitation Learning zurück allerdings nur, um das Klick-Timing zu lehren, nicht die vollständige Steuerungspolik. Der Bot versuchte, die Klickmuster aus den aufgezeichneten Duellen nachzuahmen.

Anfangs hatte er zu viel Angst, etwas zu probieren, aus Furcht vor der Strafe für falsche Klicks. Aber schließlich überwand er die Scheu, zu schlagen und Treffer zu landen. Natürlich vergaß er dabei wieder das Zielen: Der Ersteller musste ihn für **weitere 50 Stunden** in Ruhe lassen, um wieder einen zufriedenstellenden Zustand zu erreichen.

## Die Betrugsdebatte

Das Video endet mit der Frage: Betrügt dieser Bot?

Das Gegenargument: Der Bot verarbeitet nur das, was ein Mensch sieht (gleiche Pixel), sendet die gleichen Tastatur-/Mauseingaben wie ein Mensch (keine Paketmanipulation wie Anti-Knockback) und liest keinen Spielspeicher (kein Röntgensicht oder ESP).

Das Fürargument: Ein Bot kann schneller verarbeiten als ein Mensch, und wenn der Gegner denkt, er spielt gegen einen Menschen, aber das nicht der Fall ist, ist das Täuschung.

Die Meinung des Erstellers: Es hängt von der Absicht ab. Wissen beide Parteien, dass es ein Bot ist, ist es ein faires Match. Der Bot stößt den Gegner mit 100-Treffern-Serie ins Void.

## Das Ergebnis

![The bot executing a 100-hit combo](assets/ai-pvp-final-combo.png)

Ein Minecraft PvP Bot, trainiert auf einem **Laptop ohne GPU**, basierend auf einer eigenen Trainingspipeline mit:

- **Bildschirmerefassung** für Pixel-Eingabe (2M+ Pixel → 30 entwickelteenzene Merkmale)
- **Curriculum Learning** (horizontal → vertikal → Tastatur → Klicken)
- **RL für Motorkontrolle** + **Imitation Learning für Klick-Timing**
- **Feature Engineering** über Rohpixel (3 Gruppen: Vision, OCR, Zeit)
- **60+ Schnitt Traingsstunden** über mehrere Phasen

Die Gesamtszeinerie liegtigen Zeit liegt im zweistelligen Stundenbereich, aber das meiste ist passiv Der Bot zittert sich zum Verständnis, vergisst, was er gelernt hat, lernt es neu und schmiedet schließlich eine 100-Treffer-Kombo zusammen.

Das Video ist auf [youtube.com/watch?v=j5nxDKAjg6U](https://www.youtube.com/watch?v=j5nxDKAjg6U).

---

*Dieser Artikel behandelt nur den Inhalt des Videos. Für einen breiteren Kontext zu Minecraft-KI: VPT, DreamerV3 und die Landschaft von Imitation Learning vs. RL: Die folgenden Abschnitte verbinden dieses Projekt mit dem weiteren Feld.*

## VPT: Behavior Cloning in großem Maßstab

![OpenAI's VPT project diagram : the Inverse Dynamics Model predicts actions from pairs of frames](assets/vpt-overview.svg)

Der « Behavior Cloning »-Ansatz des Videos (Phase 1) ist die gleiche Technik, die OpenAI in seinem **Video PreTraining (VPT)**-Projekt verwendete, aber an entgegengesetzten Enden des Ressourcenspektrums. VPT bewies, dass Imitation Learning für Minecraft funktioniert, wenn man 70.000 Stunden Video, 720 GPUs und ein Inverse Dynamics Model hat, das nicht gelbelte Daten pseud-belabelt. Der Ersteller hier bewies, dass es mit einem Laptop und 1.000 Duellen scheitert: aber aus demselden Grund: Imitation Learning ist durch die Qualität seiner Demonstrationen begrenzt.

![OpenAI's VPT agent mining a tree in Minecraft](assets/vpt-minecraft.jpg)

Die VPT-Pipeline löst das Datenproblem, indem ein **Inverse Dynamics Model (IDM)** trainiert wird, das sich Bild t-1 und Bild t+1 ansieht, um die Aktion zu Bild t vorherzusagen. Da das IDM nicht-kausal ist (es sieht zukünftige Bilder), ist die Aufgabe einfacher als Behavior Cloning und erfordert weit weniger gelabelte Daten. Sie zahlten Auftragnehmern ~2.000 $ für 2.000 Stunden gelabelter Daten und verwendeten dann das IDM, um 70.000 Stunden YouTube-Minecraft-Videos pseudozu beladen.

![Crafting-/Abbaurate in Abhängigkeit von der Pre-Training-Datenmenge (log-Skala): Werkbänke, Holzwerkzeuge, Steinwerkzeuge](assets/vpt-stone-pickaxe-sequence.svg)

Der Skalierungseffekt ist deutlich: Auf einer log-Achse von 1 Stunde bis 100.000 Stunden Pre-Training-Daten steigt die Rate, mit der das Modell eine Werkbank, Holzwerkzeuge und dann Steinwerkzeuge herstellt, stufenweise an. Das nur auf den 2.000 von Auftragnehmern gelabelten Stunden trainierte Modell erreicht maximal Werkbänke; erst durch die Hinzunahme der 70.000 vom IDM pseudo-gelabelten Stunden (gestrichelte Linie im Diagramm) entstehen Steinwerkzeuge zero-shot, ohne einen einzigen RL-Schritt.

Das resultierende 0,5B-Parameter-Basismodell erzielte Zero-Shot-Fähigkeiten, die mit RL allein unmöglich waren: Bäume fällen, Tische herstellen, Spzier-springen: und mit RL verfeinert, wurde es zur ersten KI, die Diamantwerkzeuge herstellte.

![Belohnung in Abhängigkeit von der Anzahl der RL-Trainingsepisoden: Zufällig initialisiertes Modell vs. vortrainiertes VPT-Modell](assets/vpt-diamond-pickaxe-sequence.svg)

Dieses Diagramm zeigt, warum Pre-Training alles für das nachgelagerte RL verändert. Das RL mit einem zufällig initialisierten Netzwerk (orange) bleibt nahe Null für fast eine Million Episoden flach: Die Aufgabe «einen Diamanten beschaffen» hat eine zu spärliche Belohnung, als dass ein naiver Agent durch zufällige Erkundung darauf stoßen könnte. Das vom vortrainierten VPT-Modell fine-getunte RL (grün) startet bereits mit Basisverhalten (abbauen, herstellen, erkunden) und steigt stetig auf eine Belohnung von etwa 25 an, was dem vollständigen Weg zu einer Diamantspitzhacke entspricht.

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/719971231?h=cbdf2617a1" title="VPT Agent Gameplay Demo 1" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045834?h=9cb4118c65" title="VPT Agent Gameplay Demo 2" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045849?h=00398908ed" title="VPT Agent Gameplay Demo 3" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045863?h=060f07e290" title="VPT Agent Gameplay Demo 4" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

*Offizielle Video-Demos des VPT-Projekts von OpenAI, die den Agenten in Aktion zeigen.*

## OpenAI Five: Das Problem der Belohnungsstrukturierung

![OpenAI Five playing Dota 2 against human professionals](assets/openai-five-dota2.jpg)

OpenAI Five (2019) besiegte die Dota 2-Weltmeister mit purem Selbstspiel-RL: kein Imitation Learning. 256 GPUs, 128.000 CPU-Kerne, 180 Jahre Spielspielzeit pro Tag, 10 Monate Training.

Aber die Belohnungsfunktion wurde von Dota-Experten handgefertigt: **28 von 20.000 verfügbaren Merkmalen**, jedes mit hand-abgestimmten Gewichten. Vermögen, Kills, Tode, Turmgesundheit, Bahsen: alle von Menschen ausgewählt und gewertet. Ohne diese Strukturierung lernte der Agent kaum (Experiment: Belohnung nur Sieg/Niederlage → Plateau auf semiprofi Niveau).

Der Bot aus dem Video steht vor dem gleichen Problem: Seine Belohnungsfunktion kodiert das Verständnis des Erstellers davon, worauf es im PvP ankommt (Treffer gut, Schaden nehmen schlecht, Fadenkreuz und Tor halten gut). Das ist unvermeidlich: RL braucht ein Belohnungssignal, und die Formung dieses Signals kodiert menschliche Verzerrung.

## DreamerV3: Weltmodelle und spärliche Belohnungen

![DreamerV3 benchmark scores across over 150 diverse tasks with a single configuration](assets/dreamerv3-benchmarks.png)

DeepMinds DreamerV3 (2023 verfolgt einen dritten Ansatz. Anstatt Behavior Cloning oder geformtem RL, lernt es ein **Weltmodell**: ein neuronales Netzwerk, das zukünftige Zustände und Belohnungen aus vergangenen Aktionen und plant, indem es über mögliche Zukünfte träumt. Es war der erste Algorithmus der Diamanten in Minecraft von Grund auf ohne menschliche Daten oder Curricula sammelte, veröffentlicht in Nature 2025.

![DreamerV3 learns a world model to imagine future trajectories](assets/dreamerv3-header.png)

Die Diamant-Umgebung definiert eine spärliche Belohnung über 12 Meilensteine (Stamm → Breter Stock → Werkbank → Holzspitzhacke → Bruchstein → Steinspitzhacke → Eisenerz → Ofen → Eisenbarren → Eisenspitzhacke → Diamant), die jeweils +1 genau einmal geben. Plus eine kleine Gesundheitsbelohnung (±0,01 pro HP). Gesamt erreichbar: 11,1 in 36.000 Schritten.

DreamerV3s Weltmodell erlaubt es sich, Trajektorien vorzustellen und intern zu bewerten: Der Agent lernt von geträumten Rollouts anstatt von echter Erfahrung und testet tausende mögliche Zukünfte für jeden echten Schritt. Dies machen spärliche Belohnungen machbar, wo sie einen Standard-RL-Agenten zerstören würden.

Über 40 Seeds, trainiert für 100M Umgebungsschritte, sammelten 24 von 40 mindestens einen Diamanten. Der erste Diamant erschien nach 29M Schritten (~9 Tage auf einer GPU).

## ANNA: Symbolische KI trifft Minecraft

![ANNA's task tree decomposition for a flint-and-steel](assets/anna-task-tree.png)

Vor dem PvP-Bot des Videos, vor VPT und DreamerV3, gab es **ANNNA**: einen Minecraft-Bot mit einer ganz anderen Philosophie. Statt aus Pixeln oder Belohnungen zu lernen, verwendet ANNA eine **symbolische Zustandsmaschine** mit einem **französischen NLP-Parser** und einem handgeschriebenen **Aufgabenabhängigkeitsbaum**.

Erstellt im Jahr 2022 (bevor « Vibe Coding » ein Begriff war), verbindet sich ANNA via Mineflayer mit einem Minecraft-Server und verstehteutschsprachliche Befehle auf Französisch. Sage *« obtiens un briquet »* (besorge einen Feuerzeug), und ANNE Parser identifiziert das Verb (*obtien* → besorgen), schlägt das Gegenstandsrezept nach und zerlegt es rekursiv in Unteraufgaben: Eichenstämme abbauen → Bretter herstellen → Stöcke herstellen → Werkbank herstellen → Holzspitzhacke → Stein brechen → Steinspitzhacke herstellen → Eisenerz abbauen → Eisen– Barren schmelzen → den Feuerzeug herstellen.

![ANNA's NLP parser architecture for French command recognition](assets/anna-nlp-diagram.png)

Die NLP-ebene (`utils/id_parser.js`) zerlegt Befehle an « et » (und), um parallele Aufträge zu handndeln, ordnet französische Verben Aufgabentypen (*craft*, *mine*, *tue*, *suis-moi*) zu und übersetzt französische Gegenstandsnamen in Minecraft-IDs durch ein 5.000 Einträge Wörterbuch. Unerkannte Befehle fallen durch ein GPT-basierten Konversationssystem, das ANNA als einen menschlichen Miencraft-Begleiter agieren lässt.

Der **Aufgabenbaum** (`mc-tasks-tree/`) ist der Kern: ein rekursiver Algorithmus, der durch den Minecraft-Gegenstandgraph geht (Herstellungsrezepte, Abbauteile, Mob-Drops, Ofenrezepte), um einen schrittweisen Plan zu erstellenn. Für einen Diamanthelm generiert er eine 40+ Schritte umfassende Aufgliederung über die Stufen Holz, Stein, Eisen und Diamant.

![ANNA's diamond helmet task tree : a 40+ step breakdown](assets/anna-diamond-helmet.png)

Wo der PvP-Bot aus den Video aus Erfahrung lernt, arbeitet ANNA aus Wissen. Er braucht nicht 1.000 Duelle oder 60 Stunden Training: er braucht den Baum, den Parser und dem Server. Aber er kann auch nicht über das hinaus verallgemeinern, was sein Baum kodiert. Keine Maschinenzustandstechnik wird ihn zu PvP lernen lassen.

ANNAs Ansatz spiegelt eine andere Ära der KI wider: bevor das End-to-End-Lernen dominierte, als das Versprechen war, dass symbolisches Denken + sorgfältige Ingenieursarbeit intelligentes Verhalten erzeugen könnte. Dennoen, Projekte wie ANNA und der PvP-Bot repräsentieren zwei Pole der Minecraft-KI: Einer denkt über die Welt nach, der andere nimmt sie wahr.

## Master Gumbos Mace Bot: KI nur mit Befehlsblöcken

![The Mace PvP training arena with the bot](assets/mace-bot-arena.png)

In einer ganz anderen Ecke der Minecraft-KI bitte der YouTuber **Master Gumbo** einen PvP-Trainings-Bot mit **nur Befehlsblöcken** : keine Mods, keine Plugins, kein externer Code. Nur Vanilla-Minecraft-Befehle, Redstone und ein Teppich-Mod für Spielerreplika-Einheiten. Das Ergebnis ist ein KI-Mace-PvP-Gegner der mit dem Spieler Brechwechsel, Windbogen und Schildtechen übt.

Der Bot beginnt als Zombie mit unzerbrechlicher Ausrüstung und einem Totem in der Zweithand (alle Takte über `/item replace` ersetzt), was ihn faktisch unsterblich macht. Später wechselt Master Gumbo zu **Teppich-Mod-Spielerreplika-Bots**, die menschenähnliche Techniken (Schildheben, Gegenstandwechsel) unterstützen, die Zombies nicht können.

![The settings center : buttons to configure bot behavior](assets/mace-settings-center.png)

Die Keminnovation ist eine **durch Zufall gesteuerte Zustandsmaschine**. Ein Rüstungsständer wird über einem Kreis aus farbigen Betonblöcken mit dem Befehl `/spreadplayers` teleportiert, der Einheiten zufällig verteilt. Die Farbe des Betonstücks, auf dem der Rüstungsständer landet, bestimmt die nächste Aktion des Bots:

- **Roter Beton** → seitwärts rückwärts
- **Blauer Beton** → Windladung aufwärts (Angriff)
- **Grüner Beton** → Schild heben
- **Weißer Beton** → Pause (Verzögerung zwischen Aktionen)

![The AI decision system : an armor stand on colored concrete](assets/mace-ai-system.png)

Die Position des Rüstungsständers wird von Befehlsblöcken gelesen, die den Block darunter erkennen und den entsprechenden Mechanimus aktivieren. Ein Redstone-Block wird platziert oder entfernt, um jedes Verhalten ein- auszuschalten. Da `/spreadplayers` wiederholt läuft, trifft der Bot kontinuierlich neue Entscheidungen, was unvorhersehbares, aber strukturiertes Verhalten erzeugt.

Master Gumbo nennt das eine « sehr einfache und grundlegende Form von KI »: es lernt nicht aus Interaktionen wie neuronale Netzwerke, aber die Zufälligkeit + Zustandsmaschine erzeugt realisteschneidener Nachrichtsendes PvP– Verhalten, das schwerer vorherzusagen ist als ein skripter Bot. Das Figurationszentrum enthält eine Buch Schnittstelle, um KI ein/auszuschalten,Schwierigkeit anzupassen und Bewegungsteile zu konfigurieren.

Nach dem Training mit dem Bot und dann einem Duell gegen den Spieler, der ihn (in der Video-Intro) schlecht nannte, gewinnt Master Gumbo. Die Karte wird über Discord geteilt, Carpet Mod erforderlich.

![The bot in a duel, practicing mace PvP techniques](assets/mace-final-duel.png)

Wo der PvP-Bot (Kadambi) aus Pixeln lernt und ANNA durch Aufgabenbäume überlegt, erreicht Master Gambos Bot Intelligenz durch **zufällige Zustandsübergänge**: eine reine Befehlsblock-Ansatz, der beweist, dass man keine neuronalen Netzwerke braucht, um einen überzeugenden PvP-Gegner zu bauen.

## Altoclef : Baritone + Aufgabenbaum im großen Maßstab

Wenn ANNA ein symbolischer Bot ist, der *liest*, um zu wissen, was zu tun ist, und der Mace Bot Entscheidungen randomisiert, dann ist **Altoclef** ein vollständig autonomer Agent, der seinen Weg durch das gesamte Spiel *plant*. Gebaut von gaucho-matero als Fabric-Mod und angetrieben von **Baritone** Pathfinding, zerlegt Altoclef jedes Minecraft-Ziel in einen Aufgabenbaum und führt ihn ohne menschliches Zutun aus.

Die Schnittstelle ist täuschend einfach : gib `@gamer` im Chat ein, und Altoclef beginnt die Beat-the-Game-Aufgabe in einer Überlebenswelt. Es sammelt Holz, craftet Werkzeuge, baut Eisen und Diamant ab, errichtet ein Nether-Portal, sammelt Lohenruten und Enderperlen, findet die Festung und tötet den Enderdrachen. Völlig autonom, durch den nativen Minecraft-Client, auf jedem Vanilla-Server.

Unter der Haube wird dies durch ein **rekursives Task-Tree-System** erreicht, bei dem jedes hochrangige Ziel (z. B. »craft eine Diamantspitzhacke«) in Vorbedingungen zerlegt wird : Diamant abbauen → schmelzen → Stöcke craften → kombinieren. Der Baum durchläuft den vollständigen Minecraft-Rezeptgraphen und verarbeitet Produktionsketten, Mob-Drops, Loot-Tabellen und Containerzugriff. Anders als ANNAs handgeschriebener Baum sind Altoclefs Aufgaben **programmierbare Java-Klassen**, die beliebige Logik implementieren können : Kampfstrategien, Handeln mit Piglins, Erkundungsmuster.

Die entscheidende architektonische Erkenntnis ist die Trennung von **Was** (dem Aufgabenbaum) und **Wie** (Baritone Pathfinding). Baritone übernimmt die niedrige Bewegungssteuerung : Pfadfindung, Hindernisvermeidung, Blockabbau, Inventarverwaltung -- während das Task-System den hochrangigen Plan orchestriert. Diese Modularität bedeutet, dass keine der Komponenten KI sein muss : beide sind deterministische Algorithmen, doch ihre Kombination erzeugt komplexes, zielgerichtetes Verhalten, das mit gelernten Ansätzen konkurriert.

Altoclef repräsentiert die Grenze der **reinen symbolischen Minecraft-KI** : es kann das Spiel von Grund auf schlagen, mit null Training, null GPUs und null menschlichen Daten, aber es kann sich nicht an Aufgaben anpassen, die seine Programmierer nicht vorausgesehen haben, und es kann nicht aus Erfahrung lernen. Es weiß, wie man eine Diamantspitzhacke herstellt, weil eine Java-Klasse ihm genau sagt, wie, nicht weil es selbst darauf gekommen ist.

## Was sie verbindet

| Ansatz | Kernmethode | Daten | Berechnung | Ergebnis |
|----------|------------|------|---------|--------|
| Video-PvP-Bot | RL + Imitation Learning | 1.000 Duelle | 1 Laptop, 60h | 100-Treffer-Kombo |
| OpenAI Five | Selbstspiel-RL | 180 Jahre Spiel/Tag | 256 GPUs, 10 Mon. | Weltmeister Dota 2 |
| VPT | Semiüberwachten IL | 70K h YouTube – IDM | 720 GPUs, 9 Tage | Diamantwerkzeuge |
| DreamerV3 | Weltmodell RL | Geträumte Bahnen | 1 GPU, 9 Tage | Diamanten von Null |
| **ANTA** | **Symbol NLP + Aufgabenbaum** | **Manuelle Rezepte** | **1 Laptop, sofort** | **Jedes herstellbare Item** |
| **Altoclef** | **Baritone + Task-Tree-FS** | **Java-Task-Klassen** | **Fabric-Mod, keine GPU** | **Schlägt das ganze Spiel** |
| **Mace Bot** | **Befehlblock Zustandmaschine** | **Zufalls-Entscheidungen** | **Vanilla MC, kein GPU** | **Netz PvP Training** |

Der Bot aus dem Video hat die geringsten Ressourcen, ist aber am ehrlichsten über den Prozess. Er scheitert zuerst, dann iteriert er. Er vergisst, was er gelernt hat, dann lernt er neu. Er endet mit einer 100-Treffer-Kombo: aber auch mit der Frage, ob das, was er gebaut hat, Betrug ist.

---

**Video** : [AI Learns Minecraft PvP](https://www.youtube.com/watch?v=j5nxDKAjg6U) von Kadambi | AI Engineering

**VPT** : [Papier](https://arxiv.org/abs/1912.06680) · [Blog](https://openai.com/index/vpt/) · [GitHub](https://github.com/openai/Video-Pre-Training)

**OpenAI Five** : [Papier](https://arxiv.org/abs/1912.06680) · [Blog](https://openai.com/index/dota-2/)

**DreamerV3** : [Papier](https://arxiv.org/abs/2301.04104) · [GitHub](https://github.com/danijar/dreamerv3)

**ANNA** : [GitHub](https://github.com/fox3000foxy/ANNA) · (Node.js, Mineflayer, französisches NLP, can Aufgabbaum)

**Altoclef** : [GitHub](https://github.com/gaucho-matrero/altoclef) · [Active fork](https://github.com/drmcbride12/altoclef) · (Fabric, Baritone, Task-Tree, schlägt Spiel)

**Mace Bot** : [Video](https://www.youtube.com/watch?v=Fmp2Il70IF8) von Master Gumbo · (Befehlsblöcke, Carpet Mod, Zustandsmaschine)
