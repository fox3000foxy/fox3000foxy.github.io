---
title: "TF2-Bots sind nicht zufällig: Ich habe jede Schwierigkeitseinstellung zurückentwickelt"
description: "Sicht, Zielverfolgung, Spy-Rückenstich-Winkel, Sniper-Kopfschuss-Logik, jeder bekannte Bug – Valve hat nie etwas davon dokumentiert. Also haben wir den Code durchforstet und daraus ein vollständiges Datenblatt gemacht."
date: 2026-07-12
authors:
  - fox3000foxy
tags:
  - tf2
  - game-ai
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "jLGqmcPz+SFrlp0hAdAK7r2Oy6vTT44oqA3zt0fQ/95/misSHZk/asLRhsDCoZdlN4iAQJkaIEak7huvCMVbHg=="
---

## Einleitung

![TF2-Soldier-Bot zielt mit einem Raketenwerfer](assets/tf2-bot-ai-soldier-aim.png)

Jeder TF2-Spieler hat es mindestens einmal gesagt: "dieser Bot cheatet." Oder das Gegenteil: "warum steht dieser Easy-Bot einfach nur rum und frisst Raketen." Niemand weiß wirklich, was "Easy," "Normal," "Hard" und "Expert" unter der Haube tatsächlich *bedeuten* – Valve hat vier Schwierigkeitsstufen ausgeliefert und exakt null Dokumentation.

Also haben ein paar von uns (ich, awimii, Mush The Possum, mit einem großen Teil der Vorarbeit von sigsegv, der tatsächlich den dekompilierten Spielcode durchforstet hat) ein vollständiges Forschungsdokument über TFBot-Verhalten zusammengestellt. Jeder Mechanismus, jeder bekannte Bug, jede hartcodierte Wahrscheinlichkeit. Dieser Artikel ist die vollständige Ausarbeitung, nicht die gekürzte. Holt euch einen Bonk, das wird ein langer.

---

## Kapitel I: Die Grundlagen

### Bot vs. Puppet Bot

TF2 hat zwei völlig verschiedene Dinge, die die Leute "Bots" nennen:

- **KI-Bots (TFBots)**: echte KI, basierend auf dem gleichen PlayerBot/Infected-Framework, das Valve für die *Left 4 Dead*-Reihe verwendet hat. Sie wählen eine zufällige Klasse, spielen das Ziel, funktionieren ohne `sv_cheats` und lösen Erfolge aus wie ein echter Spieler.
- **Puppet Bots**: null KI, können sich nicht bewegen oder von selbst handeln. Sie existieren ausschließlich zur manuellen Steuerung – ein Spieler kann sie zwingen, zu folgen, zu zielen und zu feuern, hauptsächlich für Tests oder für filmreife Screenshots/Videos. Ihr Erscheinen erfordert `sv_cheats 1`, was auch Erfolge für die Sitzung deaktiviert.

Dieser Artikel handelt ausschließlich von der ersten Art.

### Was man KI-Bots (so halb) sagen kann

TFBots sind nicht direkt steuerbar, aber es gibt eine kurze Liste von Dingen, die man ihnen nahelegen kann:

- Richte dein Fadenkreuz auf einen beliebigen Bot (freundlich oder feindlich) und er wird dich anspotten, wenn du die richtigen Sprachbefehle verwendest.
- Ein freundlicher Medic-Bot heilt dich, wenn du den "Medic!"-Sprachbefehl verwendest.
- Wenn ein Medic-Bot dich heilt und eine Überladung bereit hat, bewirkt "Los los los!" oder "Ladevorgang aktivieren!", dass er die Ladung sofort einsetzt.
- Ein Medic-Bot mit bereiter Ladung setzt sie automatisch ein, sobald er oder sein Heilziel ernsthaften Schaden nimmt, ohne Sprachbefehl.
- Bots führen spontan Partner-Spottanimationen (High Five) oder Gruppen-Spottanimationen (Conga) mit nahen Teamkameraden durch.

### Bots auf nicht unterstützten Karten zum Laufen bringen

Bots verlassen sich auf ein Navigationsnetz, um zu wissen, wo sie laufen dürfen, und die meisten Community-Karten werden ohne eines ausgeliefert. So erzwingt man es:

1. `sv_cheats 1`
2. `nav_generate` – erstellt das anfängliche Navmesh, Fortschritt wird in der Konsole angezeigt
3. Warten, bis das Spiel die Pfadgenerierung abgeschlossen hat
4. Optional fehlerhafte Nav-Daten manuell mit `nav_edit 1` korrigieren
5. Server neu laden oder neustarten (Überspringen deaktiviert Erfolge)
6. `tf_bot_add <anzahl>` um tatsächlich Bots zu spawnen

**Warnung:** Das Ändern des Navmeshs bei aktiven Bots auf dem Server kann das Spiel zum Absturz bringen. Sobald das Mesh existiert, muss es für zukünftige Sitzungen nicht neu generiert werden – füge einfach Bots mit `tf_bot_add` hinzu.

Automatisch generierte Meshes funktionieren am besten auf Control-Point-, King-of-the-Hill-, Payload- und CTF-Karten. Auf Mannpower-Karten verhalten sich Bots standardmäßig wie im CTF-Stil, nutzen aber Grappling Hooks oder Powerups kaum. Wenn eine Karte kein von der Bot-KI erkanntes Ziel, aber eine Spawn-Room-Entität hat, können Bots mit `tf_bot_offense_must_push_time 0` trotzdem kämpfen.

*(Quelle für diesen Abschnitt: die offizielle TF2-Wiki-Seite über Bots.)*

### Aktueller Status, Karte für Karte

Dank des Hatless-Updates funktioniert jede Klasse jetzt korrekt, einschließlich des historisch fehlerhaften Spy. Bots verhalten sich auf den meisten offiziellen KOTH-Karten, einigen Payload-Karten, Dustbowl/Gorge Attack-Defense und CTF/Mann Manor-Karten richtig – obwohl man sie auf den letzteren nicht direkt mit `tf_bot_add` spawnen kann. Auf nicht unterstützten Karten (über den nav_generate-Prozess oben) funktionieren sie, sind aber merklich schlechter darin, einen echten Spieler zu imitieren.

PLR-Karten sind ein hoffnungsloser Fall: Bots können die Barrieren auf Hightower nicht überwinden und bleiben in Ecken stecken, und auf allen anderen PLR-Karten haben sie... eine Tanzparty, anstatt zu spielen. Das wird vielleicht irgendwann gefixt. Vielleicht auch nicht.

### Allgemeines Bot-Verhalten

Eine Sammlung von Dingen, die jeder Bot unabhängig vom Können tut:

- Bots verwenden nur Standard-Ausrüstung (ein Plugin kann ihnen Nicht-Standard-Waffen aufzwingen, aber Vanilla-Bots wählen nie selbst welche aus).
- Easy-Bots benutzen ihre Sekundärwaffe kaum. Höhere Schwierigkeitsgrade wechseln zur Sekundärwaffe, sobald die Primärwaffe leer ist, oder um die Reichweite auszugleichen.
- Bots beherrschen keine Bewegungstechniken – keine Rocket Jumps, keine Gebäudeversetzung.
- Nach einem Kill kann ein Bot spotten, sogar unter Beschuss – außer während er die feindliche Intelligence trägt, und diese Regel gilt auch in MvM.
- Getarnte Spy-Bots (Spieler oder KI) werden von anderen Bots korrekt ignoriert – bis sie einen Feind berühren, etwas sägen, schießen oder sich in der Nähe tarnen. Sobald ein Bot/Spieler "aufgeflogen" ist, wird er als Spy erinnert, bis er die Tarnung wechselt (während er unsichtbar bleibt), stirbt oder mit dem Dead Ringer den Tod vortäuscht.
- Pyro-Bots nutzen die Kompressionssprengung großzügig ab Easy.
- Medic-Bots priorisieren das Heilen aller anderen vor Snipers (und in geringerem Maße Engineers), selbst wenn man als Sniper "Medic!" spampt.
- Medic-Bots fühlen sich zu Heavies, Soldiers, Demomen und Pyros hingezogen – insbesondere wenn ein *menschlicher* Spieler diese Klassen spielt. Kein Mensch in diesen Rollen, keine besondere Medic-Aufmerksamkeit.
- Bots halten während der Aufbauzeit auf Attack/Defense- und Payload-Karten Position – außer Engineers, Snipers und Spies, die sich frei bewegen (Demoman-Bots dürfen auch vorab Stickybombs platzieren).
- Engineer-Bots verbessern oder entsägen niemals die Gebäude eines anderen freundlichen Engineers, es sei denn, dieses Gebäude befindet sich zufällig im Weg ihres Ziels. Manchmal reparieren sie auch einfach... ihren eigenen Geschützturm nicht, selbst wenn es sicher ist.
- Enttarnte Spy-Bots wechseln zu ihrem Revolver und gehen rückwärts, anstatt einen Stich zu erzwingen.
- Demoman-Bots, die eine Sentry gefunden haben (normalerweise, indem sie einmal daran gestorben sind), können perfekt Stickybombs aus großer Reichweite darauf werfen, die je nach Geometrie um Wände und Decken herumfliegen.
- Sniper-Bots, die nach dem Zielen kein Ziel finden können, verwenden eine der "Negativ"-Sprachzeilen.
- Freundliche Medics heilen einen getarnten Spy ohne Zögern.

### Bekannte Probleme / Bugs

Das Dokument listet eine ganze Reihe von langjährigen Eigenheiten auf:

- Bots können versuchen, durch bestimmte stationäre Requisiten zu laufen oder zu schießen.
- Jedes Mal, wenn ein Spieler/Bot sich enttarnt, tarnt oder enthüllt, "sehen" es nahe Bots und drehen sich zur Reaktion – selbst wenn das Ereignis außerhalb ihres tatsächlichen Sichtfelds stattfand. Es ist nicht geräuschbasiert; es ist eine Umgehung der Sichtprüfung.
- Selten können Bots physisch aneinander hängenbleiben, während sie einen Engineer-Teleporter benutzen.
- Bot-Sprachbefehle (z.B. "Spy!", "Vorwärts!") werden nicht wie bei Spielern als Chat-Text angezeigt.
- Ein Medic-Bot, der aktiv jemanden heilt, weicht keinem eingehenden Feuer aus und nimmt keine Gesundheitspakete, selbst bei kritisch niedriger HP.
- Bots können sich während einer Partner-Spottanimation weiterbewegen, was den beabsichtigten Effekt des Festive Critical Strike zunichtemacht.
- Kürzlich beschädigte Medic-Bots weigern sich oft, die Syringe Gun auf Distanz zu benutzen, und bevorzugen Nahkampf (oder, in sehr seltenen Fällen, versuchen sie, dich mit dem Medi Gun-Strahl selbst zu treffen).
- Medic-Bots kompensieren nicht den Gravitationsabfall bei Syringe-Gun-Schüssen – wahrscheinlich, weil die Waffe im KI-Code nicht korrekt als Nicht-Hitscan markiert ist.
- Spy-Bots können einen getarnten Spy (Spieler oder KI) sehen und verfolgen, wenn dieser Spy bereits einmal enttarnt wurde, unabhängig vom Können des verfolgenden Bots.
- Selbst wenn ein Spieler-Spy sich als Klasse des eigenen Teams tarnt, enttarnt das Rennen gegen einen Feind sie trotzdem (Bots tun dies nie bei sich selbst, da Bots sich nie als ihr eigenes Team tarnen).
- Bots respektieren das Team-Auto-Balancing – wenn du Bots auf einem Team stapeln willst, brauchst du zuerst `mp_teams_unbalance_limit 0`.
- Engineer-Bots können ihre eigenen Gebäude einfach ignorieren, bis sie zerstört sind.
- Heavy-Bots versuchen manchmal, die Minigun abzufeuern, während sie kritisch wenig Munition haben, meist unterhalb von Hard.
- Medic-Bots des verlierenden Teams begehen gelegentlich während der Demütigungsphase Selbstmord, wenn keine Feinde in der Nähe sind – etwas, das ein menschlicher Spieler nicht einmal durch Versuche reproduzieren kann.
- Wenn du in der Ladebildschirm-Teamvorschau BLU auswählst, werden RED-Bots für dich visuell als BLU dargestellt.
- Bots mit gezogenem Nahkampf weigern sich manchmal, die Waffe zu wechseln, selbst nachdem sie Munition aufgenommen haben.
- Nach Jungle Inferno können Bots, die mit expliziten Parametern gespawnt wurden (z.B. `tf_bot_add 5 pyro blu normal`), sofort in ihrem eigenen Spawn-Room sterben. Lösung: `tf_bot_reevaluate_class_in_spawnroom 0` (benötigt `sv_cheats 1`).

### KI-Namen

Bot-Namen stammen aus einem großen Pool von Referenzen zu TF2, anderen Valve-Spielen und der Programmierkultur, hauptsächlich weil die Community auf den Steam-Foren immer wieder bestimmte Namen angefragt hat. Eine Auswahl der Liste: *AimBot, Aperture Science Prototype XR7, Black Mesa, Companion Cube, C++, Divide by Zero, GLaDOS, H@XX0RZ, Saxton Hale, The G-Man, trigger_hurt, 0xDEADBEEF* und Dutzende weitere in dieser Art.

Es gibt auch eine Reihe von Namen, die in einem geleakten Source-Build gefunden wurden, aber nie in der Produktion ausgeliefert wurden, aus unklaren Gründen – hauptsächlich *Last Dragon*- und *The Fifth Element*-Referenzen wie *John Spartan, Leeloo Dallas Multipass, Sho'nuff, Bruce Leroy, Big Gulp Huh?* und *I'm your huckleberry*.

Du kannst all das selbst überschreiben: `tf_bot_add heavyweapons blau "Blauer Hoovy"` spawned einen benannten BLU-Heavy namens "Blauer Hoovy."

---

## Kapitel II: Die originalen Bots / TFBots – Tiefer Tauchgang in die Fähigkeitsstufen

Sigsegvs ursprünglicher Rahmen gilt immer noch: Es ist offensichtlich, dass Expert-Bots besser spielen als Easy-Bots, aber Valve hat nie erklärt, *wie viel* oder *warum*. Der einzige Weg, es zu wissen, ist, den Code zu lesen. Hier ist jeder Mechanismus, der mit dem Können skaliert.

### Schwierigkeit einstellen

Außerhalb von MvM wird die Schwierigkeit von einem Cvar gesteuert:

| `tf_bot_difficulty` | Fähigkeitsstufe |
| --- | --- |
| 0 | Easy |
| 1 | Normal (Standard) |
| 2 | Hard |
| 3 | Expert |

`tf_bot_add` akzeptiert auch direkt ein Schwierigkeitsargument (`easy`/`normal`/`hard`/`expert`).

### MvM-Popfiles

In Mann vs. Machine hat jeder `TFBot`-Spawner-Block im Popfile einen optionalen `Skill`-Schlüssel. Kein Schlüssel bedeutet Easy. In Valves eigenen Missionen: Giants sind fast immer Expert, Engineers und Spies sind fast immer Expert, und Snipers sind meistens Hard (gelegentlich Expert). Wenn du `EventChangeAttributes` (hinzugefügt im Two Cities-Update) verwendest, um Bots mitten in einer Welle basierend auf Kartenereignissen dynamisch zu verändern, ist die Bot-Fähigkeit eine der Eigenschaften, die du im laufenden Betrieb ändern kannst.

### MvM-Endlosmodus

Der Endlosmodus wurde nie offiziell ausgeliefert, aber darin geben Bots ihr Geld für Verbesserungen aus, genau wie Spieler – einschließlich eines Bot-exklusiven Upgrades, das ihre KI-Fähigkeitsstufe mitten im Spiel erhöht.

### Die `bot_generator`-Entität

Eine obskure, weitgehend undokumentierte Entität, von der angenommen wird, dass sie im Trainingsmodus und möglicherweise in der frühen MvM-Entwicklung verwendet wurde. Sie stellt einen `SetDifficulty`-Input zur Steuerung der Fähigkeitsstufe bereit. Darüber hinaus verliert sich die Spur – Valve hat es nie dokumentiert und niemand hat sein Verhalten vollständig kartiert.

### Augenleuchtfarbe

MvM-Roboter haben ein Augenleucht-Partikel, das mit der Fähigkeitsstufe die Farbe ändert – ein visuelles Indiz, das außerhalb der Community noch nie jemand erklärt hat:

| Fähigkeit | Augenfarbe | RGB |
| --- | --- | --- |
| Easy/Normal | Blau | `#24b4ff` |
| Hard/Expert | Gelb | `#fff000` |

![TF2-Heavy-Bot in entspannter Haltung](assets/tf2-bot-ai-heavy-idle.png)

### Sicht: Erkennungszeit

Ein Bot reagiert nicht sofort, wenn etwas in sein Sichtfeld gelangt – es gibt eine hartcodierte Verzögerung, bevor der Rest der KI die Bedrohung überhaupt zur Kenntnis nehmen darf:

| Fähigkeit | Minimale Erkennungszeit |
| --- | --- |
| Easy | 1,00 s |
| Normal | 0,50 s |
| Hard | 0,30 s |
| Expert | 0,20 s |

Das ist der Großteil des "Easy-Bots fühlen sich dumm an"-Effekts in einer einzigen Zahl – ein Easy-Bot zielt nicht schlechter, sobald er dich bemerkt hat, er braucht nur fünfmal länger, um deine Existenz zu bemerken.

### Zielen: Nachführrate

Bots verfolgen dich nicht kontinuierlich. Sie erfassen deine Position und Geschwindigkeit in einem festen Intervall und sagen eine gerade Linie voraus:

| Fähigkeit | Neuberechnungsintervall | Entsprechende Rate |
| --- | --- | --- |
| Easy | 1,00 s | 1x/s |
| Normal | 0,25 s | 4x/s |
| Hard | 0,10 s | 10x/s |
| Expert | 0,05 s | 20x/s |

**Ausnahme:** Spy-Bots sind hartcodiert auf die Normal-Verfolgungsrate, unabhängig von ihrer tatsächlichen Fähigkeitsstufe – ein Expert-Spy zielt immer noch wie ein Normal-Bot. Es gibt auch ein öffentliches Demonstrationsvideo, das die Verfolgungsraten nebeneinander vergleicht, falls du die 1x- vs. 20x-Lücke in Aktion sehen möchtest.

### Zielen: waffenspezifisches Können

Bots zielen nicht nur auf deinen Masseschwerpunkt – sie haben eine Pro-Waffen-Logik, die teilweise wirklich fehlerhaft ist:

**Grenade Launcher & Sticky Launcher.** Alle Fähigkeitsstufen kompensieren den vertikalen Bogen, basierend auf einem festen Wert aus dem Cvar `tf_bot_ballistic_elevation_rate`. Da diese Kompensation nur für die Basis-Waffen-ID greift, erhalten schnellere Projektilvarianten (Loch-n-Load, alles mit einem Projektiltempo-Modifikator) keine korrekt angepassten Bögen. Und da es spezifisch an die Waffen-ID gebunden ist, erhält die Loose Cannon – eine völlig andere ID – überhaupt keine Bogenkompensation.

**Huntsman.** Easy-Bots kompensieren keinen Pfeilabfall und zielen nie auf den Kopf. Normal-Bots kompensieren den Bogen, zielen aber nur innerhalb von 150 HU auf den Kopf. Hard/Expert-Bots zielen immer auf den Kopf.

**Raketenwerfer.** Jenseits von 150 HU zielen Nicht-Easy-Bots auf deine Füße statt auf den Masseschwerpunkt, um den Flächenschaden und die Rückstoß-Wahrscheinlichkeit zu maximieren. Innerhalb von 150 HU wechseln sie zu Kopfschüssen. Easy-Bots zielen unabhängig von der Entfernung immer auf den Masseschwerpunkt. Auch dies ist waffen-ID-beschränkt: Der Direct Hit und der Cow Mangler erben das Verhalten nicht. Macht Sinn für den Direct Hit (kein AoE zum Ausnutzen); macht gar keinen Sinn für den Cow Mangler – dieser Teil der KI existierte vor der Waffe und wurde einfach nie überarbeitet.

**Sniper-Gewehre.** Easy zielt auf den Körper. Normal zielt etwa 33% des Weges vom Körper zum Kopf. Hard/Expert zielen direkt auf den Kopf. Weniger relevant in MvM, wo Bot-Kopfschüsse ohnehin keinen Schadensbonus erhalten.

### Gehör: Empfindlichkeit gegenüber verdeckten Schüssen

Jeder Schuss alarmiert nahe Bots über die Position des Schützen, sogar durch Wände, bis zu 3000 HU mit 100% Entdeckungswahrscheinlichkeit (`tf_bot_notice_gunfire_range`). Aber eine Teilmenge von Waffen ist als "leise" markiert – nur innerhalb von 500 HU hörbar (`tf_bot_notice_quiet_gunfire_range`), und selbst dann mit einer fähigkeitsabhängigen Chance:

| Fähigkeit | Chance, einen leisen Schuss zu bemerken |
| --- | --- |
| Easy | 10% |
| Normal | 30% |
| Hard | 60% |
| Expert | 90% |

Diese Wahrscheinlichkeit wird halbiert, wenn in den letzten 3 Sekunden ein *lauter* Schuss gehört wurde – laute Geräusche überdecken leise.

Die Liste der leisen Waffen-IDs wurde seit Dezember 2010 nicht aktualisiert. Alles, was nach diesem Datum mit einer brandneuen Waffen-ID hinzugefügt wurde, wird standardmäßig als laut behandelt, egal wie leise es logischerweise sein sollte, es sei denn, es hat zufällig eine ältere ID wiederverwendet. Konkret:

| Waffen-ID | Deckt ab |
| --- | --- |
| `TF_WEAPON_KNIFE` | Alle Spy-Messer |
| `TF_WEAPON_FISTS` | Heavy-spezifische Schläge (sein Multi-Class-Schlag ist tatsächlich `TF_WEAPON_FIREAXE`) |
| `TF_WEAPON_PDA` | Vermutlich direkt ungenutzt |
| `TF_WEAPON_PDA_ENGINEER_BUILD` | Engineer's Bau-PDA |
| `TF_WEAPON_PDA_ENGINEER_DESTROY` | Engineer's Zerstörungs-PDA |
| `TF_WEAPON_PDA_SPY` | Spy's Tarnkasten |
| `TF_WEAPON_BUILDER` | Spy's Engineer/Sapper-Werkzeugsatz |
| `TF_WEAPON_MEDIGUN` | Alle Medi Guns |
| `TF_WEAPON_DISPENSER` | Vermutlich ungenutzt (Dispenser sind Objekte, keine Waffen) |
| `TF_WEAPON_INVIS` | Alle Spy-Tarnuhren |
| `TF_WEAPON_FLAREGUN` | Alle Pyro-Flare-Guns *außer* dem Manmelter |
| `TF_WEAPON_LUNCHBOX` | Sandwich, Dalokohs Bar, Buffalo Steak Sandvich, Bonk!, Crit-a-Cola |
| `TF_WEAPON_JAR` | Jarate (nicht Mad Milk – separate, nicht-leise ID) |
| `TF_WEAPON_COMPOUND_BOW` | Huntsman |
| `TF_WEAPON_SWORD` | Eyelander, Skullcutter, Claidheamh Mòr, Persian Persuader, Half-Zatoichi |
| `TF_WEAPON_CROSSBOW` | Crusader's Crossbow |

Das klassische Beispiel für die verrottende Liste: Der Manmelter bekam eine eigene ID (`TF_WEAPON_RAYGUN_REVENGE`), die nach dem Einfrieren der Leise-Liste hinzugefügt wurde – also wird er als laut behandelt, obwohl er in jeder praktischen Hinsicht eine Flare Gun ist. Der Scorch Shot, der noch später veröffentlicht wurde, verwendet die Basis-ID `TF_WEAPON_FLAREGUN` wieder und gilt daher immer noch als leise. Unsinnig, aber das ist der Code.

### Strategie: Bedrohungspriorisierung

Wenn mehrere Feinde gleichzeitig sichtbar sind, gewichten Bots Entfernung, ob sie selbst beschossen werden und – über Easy hinaus – ob die primäre Bedrohung geheilt wird:

| Fähigkeit | Zieliert stattdessen den Heiler? |
| --- | --- |
| Easy | Nein |
| Normal | 50% Chance |
| Hard | Ja |
| Expert | Ja |

Feinde jenseits von 500 HU werden normalerweise als nicht unmittelbar herabgestuft. Ausnahmen: Hard/Expert-Bots behandeln entfernte Medics und Engineers immer als unmittelbare Bedrohung, und jeder feindliche Sniper, der ungefähr in deine Richtung zielt, wird immer als unmittelbare Bedrohung behandelt, unabhängig von Entfernung und Fähigkeit.

| Fähigkeit | Entfernte Medics/Engineers/zielende Snipers = sofortige Bedrohung? |
| --- | --- |
| Easy/Normal | Nein |
| Hard/Expert | Ja |

Diese Sniper-Prüfung hat eine wirklich lustige Geschichte. Sigsegvs ursprüngliche Ausarbeitung nahm an, dass das Spiel verlangt, dass das Skalarprodukt zwischen dem Zielvektor des Snipers und der relativen Position des Bots *exakt null* ist – ein Vergleich so präzise, dass er in Gleitkomma-Mathematik fast nie ausgelöst würde, was die gesamte Funktion effektiv zu totem Code macht. Eine später veröffentlichte Korrektur (mit Dank an eine sauberere Hex-Rays-Dekompilierung) zeigte, dass die eigentliche Prüfung `Skalarprodukt > 0` ist: Jeder Sniper, der irgendwo von direkt-auf-dich bis senkrecht-zu-dir blickt, gilt als sofortige Bedrohung; alles von senkrecht bis wegschauend nicht. Die Fehlinterpretation entstand durch eine schlechte Dekompilierung eines SSE-Gleitkommavergleichs – Rückentwicklung einer AAA-Binärdatei ist keine exakte Wissenschaft.

### Bewegung: Ausweichen

Easy-Bots weichen nie aus, Punkt. Normal- und höhere Bots weichen nach links/rechts aus (33% links, 33% rechts, 33% nichts tun, gewichtet gegen erkannte Lücken), wenn sie eine Kampfwaffe halten, in den letzten 3 Sekunden einen Feind gesehen haben und dieser Feind Sichtlinie zu ihnen hat.

Sie weichen *nicht* aus, wenn eines der folgenden zutrifft: `DisableDodge`-Attribut gesetzt, aktuelles Verhalten sagt "beeilen", derzeit unverwundbar (jede Überladung), mitten in einer Spott-/Provokationsanimation, spielt Engineer, unsichtbar oder als Spy getarnt, als Sniper eingezielt oder als Heavy aufgedreht, oder mitten im Huntsman-Spannen.

### Bewegung: Vermeidung von Feindberührung

Ab Normal versuchen Bots gezielt, nicht in Feinde zu rennen:

| Fähigkeit | Vermeidet Zusammenstöße mit Feinden? |
| --- | --- |
| Easy | Nein |
| Normal | Nein |
| Hard | Ja |
| Expert | Ja |

In der Praxis ist das nur für Spy-Bots wirklich relevant – eine unangenehme Kollision mit einem feindlichen Spieler zu vermeiden, ist genau die Art von Ding, die eine Tarnung auffliegen lässt.

### Pyro: Luftstoß-Beherrschung

Luftstoß dient zwei Zwecken: Reflektieren von Projektilen (PvP und MvM) und Schubsen naher Feinde von Kanten (nur PvP). Ob der Bot bei einer gültigen Gelegenheit tatsächlich abdrückt, ist ein fähigkeitsbasierter Münzwurf:

| Fähigkeit | Luftstoß-Auslösewahrscheinlichkeit |
| --- | --- |
| Easy | 0% |
| Normal | 50% |
| Hard | 90% |
| Expert | 100% |

Easy-Pyro-Bots können buchstäblich keinen Luftstoß ausführen – der Wurf ist hartcodiert, um niemals zu gelingen, nicht nur "selten."

### Spy: Tarnungseffektivität

Zwei separate Achsen skalieren mit dem Können. Tarnungs*auswahl*:

| Fähigkeit | Tarnungsmethode |
| --- | --- |
| Easy/Normal | Zufällige Klasse, ignoriert, was das feindliche Team tatsächlich spielt |
| Hard/Expert | Wählt einen echten feindlichen Spieler aus und kopiert dessen genaue Klasse |

Tarnungs*verhalten*:

| Fähigkeit | Verhalten während getarnt/getarnt |
| --- | --- |
| Easy/Normal | Starrt feindliche Spieler an, wenn es sie sieht (verdächtig) |
| Hard/Expert | Vermeidet bewusst Blickkontakt (überzeugender) |

### Spy: Rückenstich-Aggression

Auf große Entfernung (bis zu 300 HU, `tf_bot_spy_knife_range`) führt ein Spy-Bot einen Rückenstich nur aus, wenn er das Opfer sehen kann und der Rücken des Opfers zumindest teilweise zugewandt ist. Das Können bestimmt, wie weit dieser Rückenwinkel von der Mitte abweichen darf:

| Fähigkeit | Winkeltoleranz |
| --- | --- |
| Easy | Versucht es auch, wenn du ihn direkt ansiehst |
| Normal | ±45° von deinem Rücken |
| Hard | ±78° von deinem Rücken |
| Expert | ±90° von deinem Rücken (voller hinterer 180°-Bogen) |

Easy-Spy-Bots sind funktional selbstmörderisch – sie versuchen einen Stich an jemandem, der sie direkt anstarrt. **Ausnahme:** In Mann vs. Machine wird jeder Spy-Bot unabhängig von seiner tatsächlichen Fähigkeit auf die Normal-Winkelbeschränkung gezwungen.

### Taktik: Waffenauswahl

Greift nur oberhalb von Easy und ist in MvM meist irrelevant, da Bots dort meist harte Waffenbeschränkungen haben:

- **Scout**: wechselt zur Sekundärwaffe, wenn das Magazin der Primärwaffe leer ist.
- **Soldier**: wechselt zur Sekundärwaffe bei leerem Magazin *und* Ziel näher als 500 HU.
- **Sniper**: wechselt zur Sekundärwaffe für Ziele näher als 750 HU.
- **Pyro**: wechselt zur Sekundärwaffe für Ziele weiter als 750 HU, es sei denn, dieses Ziel ist ein Soldier oder Demoman.

### Taktik: Deckung nachladen

Nicht in MvM verwendet. Wenn das aktuelle Verhalten des Bots ihm nicht sagt, dass er sich zurückziehen soll, sein Hauptmagazin leer ist und er keine Überladung hat, ziehen sich höherstufige Bots vorübergehend in Deckung zurück, um nachzuladen, anstatt mit einer leeren Waffe auf dich zu klicken:

| Fähigkeit | Zieht sich zum Nachladen zurück? |
| --- | --- |
| Easy | Nein |
| Normal | Nein |
| Hard | Ja |
| Expert | Ja |

### CP-Modus: Verteidiger-Streifzug

Nicht in MvM verwendet. Bei der Verteidigung eines Control Points verlassen höherstufige Bots mit höherer Wahrscheinlichkeit den Punkt, um Kills zu jagen ("search and destroy"), aber nur mit einer anständigen Menge an verbleibender Zeit auf `tf_bot_defense_must_defend_time`:

| Fähigkeit | Wahrscheinlichkeit zu streifen |
| --- | --- |
| Easy | 10% |
| Normal | 50% |
| Hard | 75% |
| Expert | 90% |

### CP-Modus: Eroberungsblockade

Nicht in MvM verwendet. Verteidigende Bots, die einen feindlichen Eroberungsversuch anfechten:

| Fähigkeit | Wird versuchen, die Eroberung zu blockieren? |
| --- | --- |
| Easy | Nein |
| Normal | 50% Chance |
| Hard | Ja |
| Expert | Ja |

---

## Die vollständige Übersichtstabelle

<div style="overflow-x:auto">

| Aspekt | Easy | Normal | Hard | Expert | Anmerkungen |
| --- | --- | --- | --- | --- | --- |
| Sicht: Erkennungszeit | 1,00s | 0,50s | 0,30s | 0,20s | |
| Zielen: Nachführrate | 1x/s | 4x/s | 10x/s | 20x/s | Spies verwenden immer Normal |
| Granaten-/Sticky-Bogenkompensation | Ja | Ja | Ja | Ja | Loose Cannon ausgenommen |
| Huntsman vertikale Kompensation | Nein | Ja | Ja | Ja | |
| Huntsman-Kopfschüsse | Nein | <150 HU | Ja | Ja | |
| Raketenwerfer-Fußschüsse | Nein | Ja | Ja | Ja | Direct Hit & Cow Mangler ausgenommen |
| Sniper-Gewehr-Zielpunkt | Körper | ~33% zum Kopf | Kopf | Kopf | |
| Chance, leise Schüsse zu bemerken | 10% | 30% | 60% | 90% | Halbiert, wenn durch laute Schüsse überdeckt |
| Zieliert den Heiler | Nein | 50% | Ja | Ja | |
| Entfernter Medic/Engineer/Sniper = Bedrohung | Nein | Nein | Ja | Ja | |
| Ausweichen | Nein | Ja | Ja | Ja | Lange Ausnahmeliste |
| Vermeidet Zusammenstöße mit Feinden | Nein | Nein | Ja | Ja | Meist relevant für Spy |
| Luftstoß-Auslösewahrscheinlichkeit | 0% | 50% | 90% | 100% | |
| Spy-Tarnung-Klassenwahl | Zufällig | Zufällig | Passt zu echtem Feind | Passt zu echtem Feind | |
| Spy-Blickkontakt während Tarnung | Starrt (offensichtlich) | Starrt | Vermeidet (überzeugend) | Vermeidet | |
| Spy-Rückenstich-Winkel | ~0° | ±45° | ±78° | ±90° | MvM erzwingt Normal |
| Waffenauswahl-Logik | Nein | Ja | Ja | Ja | Weniger relevant in MvM |
| Deckung nachladen | Nein | Nein | Ja | Ja | Nicht in MvM |
| CP-Verteidiger-Streifzug | 10% | 50% | 75% | 90% | Nicht in MvM |
| CP-Eroberungsblockade | Nein | 50% | Ja | Ja | Nicht in MvM |

</div>

---

## Fazit

![TF2-Heavy-Bot zielt mit einer Minigun](assets/tf2-bot-ai-heavy-aim.png)

Nichts davon ist auf Valves Seite ein falsches Rätselraten – es ist ein bewusstes, vollständig deterministisches Bewertungs- und Wahrscheinlichkeitssystem, das nur nirgendwo offiziell festgehalten wurde. Ein paar Dinge, die man sich merken sollte:

1. **"Können" ist ein Bündel unabhängiger Stellschrauben**, kein einzelner globaler Multiplikator. Reaktionszeit, Zielrate und jedes taktische Verhalten skalieren separat, und einige (Spy-Verfolgungsrate, MvM-Rückenstichwinkel) erhalten hartcodierte Überschreibungen unabhängig vom Können.
2. **Einiges davon ist wirklich fehlerhaft, nicht nur alt.** Die seit 2010 eingefrorene Liste der leisen Waffen, der Cow Mangler, dem aus gutem Grund die Fußziel-Logik fehlt, die Sniper-Skalarprodukt-Prüfung, die Jahre brauchte, um korrekt dekompiliert zu werden – Valves KI-Code hat Narbengewebe wie jede andere 17 Jahre alte Codebasis.
3. **Du kannst all das nutzen.** Wisse, dass ein Sniper-Bot dir auf Normal keinen Kopfschuss verpasst, dass ein Easy-Pyro buchstäblich deine Rakete nicht zurückwerfen kann, dass ein Easy-Spy versuchen wird, dich von Angesicht zu Angesicht zu erstechen. Es ist kein Glück. Es ist ein Datenblatt.

Großer Dank an sigsegv für das ursprüngliche Eintauchen in den Code, das den Großteil davon ermöglicht hat, an die TF2-Wiki für die Basisdokumentation zu Bot-Befehlen und Kartenunterstützung, und an alle in der Community, die immer noch an einer 17 Jahre alten Bot-KI herumstochern, um genau herauszufinden, warum sie tut, was sie tut.
