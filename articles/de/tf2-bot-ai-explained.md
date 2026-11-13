---
title: "TF2-Bots sind nicht zufällig: Ich habe jeden Schwierigkeitsparameter neu entdeckt"
description: "Sicht, Zielen, Backstab-Winkel, Headshot-Logik, jeder bekannte Bug, Valve hat nie etwas dokumentiert. Also haben wir den Code durchwühlt und alles in ein komplettes Datenblatt verwandelt."
date: 2026-07-12
authors:
  - fox3000foxy
tags:
  - tf2
  - jeu-ia
  - ingenierie-inversee
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "obmj661U76//QT35148OzR/4CKRH8w2soeDxIcyndaKA8QCY+AZzeyTiZyIRiqJb4nO1OuLnclIGBTinc+/JEA=="
---

## Einleitung

![TF2-Bot-Soldat zielt mit Raketenwerfer](assets/tf2-bot-ai-soldier-aim.png)

Jeder TF2-Spieler hat es mindestens einmal gesagt: "Dieser Bot cheatet." Oder umgekehrt: "Warum steht dieser Easy-Bot herum und frisst Raketen." Niemand weiß wirklich, was "Easy", "Normal", "Hard" und "Expert" unter der Haube bedeuten: Valve lieferte vier Schwierigkeitslabels und exakt null Dokumentation.

Also hat eine Gruppe von uns (ich, awimii, Mush The Possum, mit einem riesigen Teil der Basisarbeit von sigsegv, der wirklich den dekompilierten Spielcode durchwühlt hat) ein komplettes Forschungsdokument über TFBot-Verhalten zusammengestellt. Jede Mechanik, jeder bekannte Bug, jede hardcodierte Wahrscheinlichkeit. Dieser Artikel ist der integrale Bericht, nicht die gekürzte Version. Nehmt euch einen Bonk, es wird lang.

---

## Kapitel I: Die Basics

### Bot vs. Puppen-Bot

TF2 hat zwei völlig verschiedene Dinge, die Leute "Bots" nennen:

- **KI-Bots (TFBots)**: Echte KI, gebaut auf demselben PlayerBot/Infected-Framework, das Valve für die *Left-4-Dead*-Serie nutzte. Sie wählen eine zufällige Klasse, spielen das Objective, funktionieren ohne `sv_cheats` und triggern Achievements wie ein echter Spieler.
- **Puppen-Bots**: Null KI, unfähig sich zu bewegen oder selbst zu handeln. Sie existieren nur, um manuell kontrolliert zu werden, ein Spieler kann sie zum Folgen, Zielen und Schießen zwingen. Hauptsächlich für Tests oder filmische Screenshots und Videos genutzt. Sie zu spawnen braucht `sv_cheats 1`, was auch Achievements für die Session deaktiviert.

Dieser Artikel handelt vollständig vom ersten Typ.

### Was man KI-Bots (mehr oder weniger) sagen kann

TFBots sind nicht direkt kontrollierbar, aber man kann sie zu manchen Dingen anstiften:

- Ziele einen beliebigen Bot (Verbündeter oder Gegner) mit deinem Crosshair an und er verspottet dich, wenn du die richtigen Voice-Commands nutzt.
- Ein verbündeter Medic-Bot heilt dich, wenn du den "Medic!"-Voice-Command nutzt.
- Wenn dich ein Medic-Bot heilt und eine bereite UberCharge hat, lässt "Go go go!" oder "Charge aktivieren!" ihn die Charge sofort auslösen.
- Ein Medic-Bot mit bereiter Charge aktiviert sie automatisch, sobald er selbst oder sein Heilziel ernsten Schaden nimmt, ohne nötigen Voice-Command.
- Bots führen spontan Duo-Verspottungen (High Five) oder Gruppenverspottungen (Conga) mit nahen Teamkameraden aus.

### Bots auf nicht supporteten Maps zum Laufen bringen

Bots hängen von einem Navigations-Mesh ab, um zu wissen, wo sie laufen dürfen, und die meisten Community-Maps liefern keins. Zum Forcen:

1. `sv_cheats 1`
2. `nav_generate`, baut das initiale Navmesh, Fortschritt in der Konsole angezeigt
3. Warten, bis das Spiel mit Weggenerierung fertig ist
4. Optional schlechte Navigationsdaten manuell mit `nav_edit 1` korrigieren
5. Server neu laden oder neustarten (diesen Schritt überspringen deaktiviert Achievements)
6. `tf_bot_add <Anzahl>` um Bots zu spawnen

**Warnung :** Das Navmesh zu modifizieren, während Bots auf dem Server aktiv sind, kann das Spiel crashen. Sobald das Mesh existiert, musst du es für künftige Sessions nicht regenerieren: Füge Bots einfach mit `tf_bot_add` hinzu.

Autogenerierte Meshes funktionieren am besten auf Control-Point-, King-of-the-Hill-, Payload- und CTF-Maps. Auf Mannpower-Maps nehmen Bots standardmäßig CTF-artiges Verhalten an, nutzen aber kaum Grapples oder Powerups. Wenn eine Map kein Objective hat, das die Bot-KI erkennt, aber eine Spawnroom-Entity besitzt, lässt `tf_bot_offense_must_push_time 0` die Bots trotzdem kämpfen.

*(Quelle für diesen Abschnitt: Die Bots-Seite des offiziellen TF2-Wiki.)*

### Aktueller Status, Map für Map

Dank dem Hatless-Update funktioniert jetzt jede Klasse korrekt, inklusive dem historisch verbuggten Spy. Bots verhalten sich korrekt auf den meisten offiziellen KOTH-Maps, manchen Payload-Maps, Dustbowl/Gorge Attack-Defense und den CTF/Mann-Manor-Maps. Auf letzteren zwei kannst du sie nicht direkt mit `tf_bot_add` spawnen. Auf nicht supporteten Maps (via obigem nav_generate-Prozess) funktionieren sie, sind aber deutlich schlechter darin, einen echten Spieler zu imitieren.

PLR-Maps sind ein verlorener Fall: Bots können die Barrieren auf Hightower nicht überwinden und klemmen in Ecken fest, und auf allen anderen PLR-Maps machen sie nur... eine Tanzparty statt zu spielen. Vielleicht wird das eines Tages gefixt, vielleicht bleibt es so.

### Generelles Bot-Verhalten

Ein Sammelsurium von Dingen, die jeder Bot unabhängig vom Level tut:

- Bots nutzen nur Basis-Loadouts (ein Plugin kann ihnen nicht-standard Waffen aufzwingen, aber Vanilla-Bots wählen nie ihre eigenen).
- Easy-Bots nutzen kaum ihre Sekundärwaffe. Höhere Schwierigkeiten wechseln zur Sekundärwaffe, sobald das Hauptmagazin leer ist, oder um Distanz zu kompensieren.
- Bots ignorieren fortgeschrittene Bewegungstechniken: Kein Rocket Jump, keine Gebäude-Relokation.
- Nach einem Kill kann ein Bot verspotten, selbst unter Feuer, außer er trägt die gegnerische Intel, und diese Regel gilt auch in MvM.
- Getarnte Spy-Bots (Spieler oder KI) werden von anderen Bots korrekt ignoriert: Bis sie einen Gegner berühren, etwas sabotieren, schießen oder nahe einem unsichtbar werden. Einmal "entdeckt", wird dieser spezifische Bot/Spieler als Spy gemerkt, bis er das Kostüm wechselt und dabei unsichtbar bleibt, stirbt oder mit dem Dead Ringer den Tod vortäuscht.
- Pyro-Bots nutzen Compression Blast liberal ab Normal-Level.
- Medic-Bots priorisieren Heilung über alle außer Sniper (und in geringerem Maß Engineers), selbst wenn du als solcher "Medic!" spammst.
- Medic-Bots gravitieren zu Heavies, Soldiers, Demomen und Pyros: Spezifisch wenn ein *Mensch* diese Klassen spielt. Diese Aufmerksamkeit folgt der Präsenz eines Menschen in diesen Rollen.
- Bots bleiben während Prep-Time auf Attack/Defense- und Payload-Maps in Position, außer Engineers, Snipers und Spies, die sich frei bewegen (Demoman-Bots dürfen auch Stickybomben vorplatzieren).
- Engineer-Bots verbessern oder deaktivieren nie Bauten eines anderen verbündeten Engineers, außer die Bauten steht auf ihrem Zielweg. Sie reparieren manchmal einfach ihr eigenes Geschütz nicht, selbst wenn es offensichtlich scheint.
- Entdeckte Spy-Bots wechseln zum Revolver und weichen zurück, statt einen Messerstich zu forcen.
- Demoman-Bots, die ein Geschütz lokalisiert haben (generell indem sie einmal daran sterben), können perfekt Stickybomben von außerhalb seiner Reichweite darauf werfen, im Bogen durch Wände und Decken, wenn die Geometrie es erlaubt.
- Sniper-Bots, die nach Zielen kein Ziel finden, nutzen eine der "Negatives."-Voicelines.
- Verbündete Medics heilen einen getarnten Spy ohne Zögern.

### Bekannte Probleme / Bugs

Das Dokument listet eine gute Zahl langjähriger Seltsamkeiten:

- Bots können versuchen, durch manche statische Props zu laufen oder zu schießen.
- Jedes Mal, wenn ein Spieler/Bot enttarnt, tarnt oder sich offenbart, "sehen" nahe Bots es und drehen sich um zu reagieren: Selbst wenn das Event außerhalb ihres echten Sichtfelds passierte. Das basiert nicht auf Sound; es ist eine Umgehung des Sicht-Tests.
- Selten können Bots physisch zusammenklemmen, wenn sie einen Engineer-Teleporter nutzen.
- Bot-Voice-Commands (z. B. "Spy!", "Vorwärts!") erscheinen nicht als Text im Chat wie die von Spielern.
- Ein aktiv heilender Medic-Bot weicht weder eingehenden Schüssen aus noch nimmt Heil-Kits, selbst bei kritischen HP.
- Bots können während einer Duo-Verspottung weiterlaufen, was den vorgesehenen Festive-Critical-Strike-Effekt bricht.
- Kürzlich verletzte Medic-Bots weigern sich oft, die Syringe Gun auf Distanz zu nutzen, und bevorzugen Nahkampf (oder in sehr seltenen Fällen versuchen, dich mit dem Medi-Gun-Strahl selbst zu berühren).
- Medic-Bots kompensieren keine Gravitation für Syringe-Gun-Schüsse: Wahrscheinlich weil die Waffe im KI-Code nicht korrekt als nicht-hitscan markiert ist.
- Spy-Bots können einen unsichtbaren Spy (Spieler oder KI) sehen und verfolgen, wenn dieser Spy schon einmal entdeckt wurde, unabhängig vom Skill-Level des verfolgenden Bots.
- Selbst wenn sich ein Spieler-Spy als Klasse seines eigenen Teams tarnt, demaskiert ihn Feindberührung trotzdem (Bots tun das sich selbst nie an, da sich Bots nie als eigenes Team tarnen).
- Bots respektieren Team-Autobalance: Wenn du Bots auf einer Seite stapeln willst, musst du zuerst `mp_teams_unbalance_limit 0` nutzen.
- Engineer-Bots können ihre eigenen Bauten komplett ignorieren, bis sie zerstört werden.
- Heavy-Bots versuchen manchmal, mit leerer Minigun zu schießen, besonders unter Hard-Level.
- Verliererteam-Medic-Bots bringen sich während der Humiliation-Phase gelegentlich um, wenn kein Gegner nahe ist, etwas, das ein menschlicher Spieler nicht reproduzieren kann, selbst wenn er es versucht.
- Deinen Team-Preview auf BLU im Ladebildschirm zu stellen lässt RED-Bots für dich visuell in BLU gerendert erscheinen.
- Bots mit gezogener Nahkampfwaffe weigern sich manchmal, die Waffe zu wechseln, selbst nach Munitionsaufsammeln.
- Nach Jungle Inferno können mit expliziten Parametern gespawnte Bots (z. B. `tf_bot_add 5 pyro blau normal`) instantan in ihrem eigenen Spawnroom sterben. Fix: `tf_bot_reevaluate_class_in_spawnroom 0` (braucht `sv_cheats 1`).

### KI-Namen

Bot-Namen stammen aus einem großen Reservoir von TF2-, anderen Valve-Spiel- und Programmierkultur-Referenzen, großenteils weil die Community auf Steam-Foren ständig spezifische verlangte. Ein Sample der Liste: *AimBot, Aperture Science Prototype XR7, Black Mesa, Companion Cube, C++, Divide by Zero, GLaDOS, H@XX0RZ, Saxton Hale, The G-Man, trigger_hurt, 0xDEADBEEF* und Dutzende mehr derselben Art.

Es gibt auch einen Batch Namen in einem geleakten Source-Build gefunden, der nie in Produktion ging, aus unklaren Gründen: Hauptsächlich *Last-Dragon*- und *Fifth-Element*-Referenzen wie *John Spartan, Leeloo Dallas Multipass, Sho'nuff, Bruce Leroy, Big Gulp Huh?* und *I'm your huckleberry*.

Du kannst das alles selbst ersetzen: `tf_bot_add heavyweapons blue "Blu Hoovy"` spawnt einen BLU-Heavy namens "Blu Hoovy."

---

## Kapitel II: Die Original-Bots / TFBots, Skill-Level-Deep-Dive

Sigsegvs ursprünglicher Rahmen hält immer noch: Es ist offensichtlich, dass Expert-Bots Easy-Bots übertreffen, aber Valve erklärte nie *wie viel* noch *warum*. Also ist Code-Lesen der einzige Weg zu wissen. Hier jede Mechanik, die mit Skill skaliert.

### Schwierigkeit einstellen

Außerhalb von MvM wird Schwierigkeit von einer Cvar kontrolliert:

| `tf_bot_difficulty` | Schwierigkeitslevel |
| --- | --- |
| 0 | Easy |
| 1 | Normal (Standard) |
| 2 | Hard |
| 3 | Expert |

`tf_bot_add` akzeptiert auch direkt ein Schwierigkeitsargument (`easy`/`normal`/`hard`/`expert`).

### MvM-Popfiles

In Mann vs. Machine hat jeder `TFBot`-Spawnblock im Popfile einen optionalen `Skill`-Schlüssel. Fehlender Schlüssel entspricht Easy-Level. In Valves Missionen: Giants sind fast immer Expert, Engineers und Spies fast immer Expert, und Snipers generell Hard (gelegentlich Expert). Wenn du `EventChangeAttributes` nutzt (im Two-Cities-Update hinzugefügt), um Bots mid-Wave dynamisch nach Map-Events zu modifizieren, ist Bot-Skill eine der Eigenschaften, die du on the fly ändern kannst.

### Endless-MvM-Modus

Der Endless-Modus wurde nie offiziell shipped, aber darin geben Bots ihr Geld wie Spieler für Upgrades aus, inklusive einem bot-exklusiven Upgrade, das ihr KI-Skill-Level mid-Game erhöht.

### Die `bot_generator`-Entity

Eine obskure, weitgehend undokumentierte Entity, vermutlich im Trainingsmodus und vielleicht in früher MvM-Entwicklung genutzt. Sie exponiert einen `SetDifficulty`-Input zur Skill-Level-Kontrolle. Darüber hinaus kühlt die Spur ab: Valve dokumentierte sie nie und niemand kartierte ihr Verhalten vollständig.

### Augenleuchtfarbe

MvM-Roboter haben ein Augenleuchtpartikel, das mit Skill-Level die Farbe wechselt, ein visueller Indikator, den niemand außerhalb der Community je erklärte:

| Skill | Augenfarbe | RGB |
| --- | --- | --- |
| Easy/Normal | Blau | `#24b4ff` |
| Hard/Expert | Gelb | `#fff000` |

![TF2-Heavy-Bot in Warteposition](assets/tf2-bot-ai-heavy-idle.png)

### Sicht: Erkennungszeit

Ein Bot reagiert nicht instantan, wenn etwas in sein Sichtfeld kommt: Es gibt eine hardcodierte Verzögerung, bevor der Rest der KI die Bedrohung überhaupt erkennen darf:

| Skill | Minimale Erkennungszeit |
| --- | --- |
| Easy | 1,00 s |
| Normal | 0,50 s |
| Hard | 0,30 s |
| Expert | 0,20 s |

Das ist im Wesentlichen der "Easy-Bots-wirken-dumm"-Effekt in einer einzigen Zahl: Ein Easy-Bot zielt nicht schlechter, sobald er dich bemerkt hat, er braucht nur fünfmal länger, deine Existenz zu bemerken.

### Zielen: Tracking-Rate

Bots tracken dich nicht kontinuierlich. Sie sampeln deine Position und Geschwindigkeit in festem Intervall und prognostizieren eine Gerade von dort:

| Skill | Neuberechnungsintervall | Äquivalente Rate |
| --- | --- | --- |
| Easy | 1,00 s | 1x/s |
| Normal | 0,25 s | 4x/s |
| Hard | 0,10 s | 10x/s |
| Expert | 0,05 s | 20x/s |

**Ausnahme :** Spy-Bots sind hardcoded mit Normal-Tracking-Rate, egal ihr echtes Skill-Level: Ein Expert-Spy zielt immer wie ein Normal-Bot. Es gibt auch ein öffentliches Demo-Video, das Tracking-Raten nebeneinander vergleicht, wenn du den 1x-vs-20x-Gap in Bewegung sehen willst.

### Zielen: waffenspezifischer Skill

Bots zielen nicht nur auf deinen Masseschwerpunkt: Sie haben Waffenlogik, manchmal wirklich verbuggt:

**Granat- & Stickybombenwerfer.** Alle Skill-Level kompensieren den vertikalen Bogen mit einem fixen Wert der Cvar `tf_bot_ballistic_elevation_rate`. Weil diese Kompensation nur für die Basis-Waffen-ID aktiviert, haben schnellere Projektilvarianten (Loch-n-Load, alles mit Projektilgeschwindigkeitsmodifier) keinen korrekt justierten Bogen. Und weil es spezifisch an Waffen-ID gebunden ist, bekommt der Loose Cannon (eine andere ID) keine Bogenkompensation.

**Huntsman.** Easy-Bots kompensieren keinen Pfeilfall und suchen nie Headshots. Normal-Level-Bots kompensieren den Bogen, zielen aber nur unter 150 HU auf den Kopf. Hard/Expert-Bots zielen immer auf den Kopf.

**Raketenwerfer.** Über 150 HU zielen Nicht-Easy-Bots auf deine Füße statt Masseschwerpunkt und maximieren Splash-Schaden- und Knockback-Chancen. Unter 150 HU wechseln sie zu Headshots. Easy-Bots zielen immer auf Masseschwerpunkt, egal Distanz. Auch per Waffen-ID verriegelt: Direct Hit und Cow Mangler erben dieses Verhalten nicht. Logisch für Direct Hit (kein Splash zum Ausnutzen); null Sinn für Cow Mangler: Dieser KI-Teil predatiert die Waffenexistenz und wurde schlicht nie überarbeitet.

**Sniper-Gewehre.** Easy zielt auf Körper. Normal zielt etwa 33% vom Körper zum Kopf. Hard/Expert zielen direkt auf den Kopf. Weniger wichtig in MvM, wo Bot-Headshots ohnehin keinen Schadensbonus bekommen.

### Gehör: Sensitivität für diskrete Schüsse

Jeder Schuss alarmiert nahe Bots auf die Schützenposition, selbst durch Wände, bis 3000 HU mit 100% Bemerkchance (`tf_bot_notice_gunfire_range`). Aber eine Teilmenge Waffen ist als "diskret" markiert: Nur in 500 HU hörbar (`tf_bot_notice_quiet_gunfire_range`), und selbst dann mit skillabhängiger Chance:

| Skill | Chance diskreten Schuss zu bemerken |
| --- | --- |
| Easy | 10% |
| Normal | 30% |
| Hard | 60% |
| Expert | 90% |

Diese Wahrscheinlichkeit wird halbiert, wenn in den letzten 3 Sekunden ein *lauter* Schuss gehört wurde: Laute Sounds maskieren leise Sounds.

Die diskrete Waffen-ID-Liste wurde seit Dezember 2010 nicht aktualisiert. Jeder spätere Zusatz mit neuer Waffen-ID wird standardmäßig als laut behandelt, egal wie logisch diskret er sein sollte, außer er wiederverwendet eine ältere ID. Konkret:

| Waffen-ID | Deckt ab |
| --- | --- |
| `TF_WEAPON_KNIFE` | Alle Spy-Messer |
| `TF_WEAPON_FISTS` | Heavy-spezifische Faustschläge (sein Multi-Class-Faustschlag ist tatsächlich `TF_WEAPON_FIREAXE`) |
| `TF_WEAPON_PDA` | Vermutlich direkt ungenutzt |
| `TF_WEAPON_PDA_ENGINEER_BUILD` | Engineer-Bau-PDA |
| `TF_WEAPON_PDA_ENGINEER_DESTROY` | Engineer-Zerstörungs-PDA |
| `TF_WEAPON_PDA_SPY` | Spy-Tarnkit |
| `TF_WEAPON_BUILDER` | Spy/Engineer/Saboteur-Toolkits |
| `TF_WEAPON_MEDIGUN` | Alle Medi Guns |
| `TF_WEAPON_DISPENSER` | Wahrscheinlich ungenutzt (Dispenser sind Objekte, keine Waffen) |
| `TF_WEAPON_INVIS` | Alle Spy-Unsichtbarkeitsuhren |
| `TF_WEAPON_FLAREGUN` | Alle Pyro-Leuchtpistolen *außer* Manmelter |
| `TF_WEAPON_LUNCHBOX` | Sandwich, Dalokohs Bar, Buffalo Steak Sandvich, Bonk!, Crit-a-Cola |
| `TF_WEAPON_JAR` | Jarate (nicht Mad Milk, separate ID, nicht-diskret) |
| `TF_WEAPON_COMPOUND_BOW` | Huntsman |
| `TF_WEAPON_SWORD` | Eyelander, Skullcutter, Claidheamh Mor, Persian Persuader, Half-Zatoichi |
| `TF_WEAPON_CROSSBOW` | Crusader's Crossbow |

Das klassische Beispiel verrottender Liste: Der Manmelter bekam seine eigene ID (`TF_WEAPON_RAYGUN_REVENGE`), hinzugefügt nachdem die Diskret-Waffenliste eingefroren wurde, also wird er als laut behandelt, obwohl er in jedem praktischen Sinn eine Leuchtpistole ist. Der noch später erschienene Scorch Shot wiederverwendet die Basis-`TF_WEAPON_FLAREGUN`-ID und gilt daher immer noch als diskret. Wahnsinnig, aber das ist der Code.

### Strategie: Bedrohungspriorisierung

Wenn mehrere Gegner gleichzeitig sichtbar sind, gewichten Bots Distanz, ob auf sie geschossen wird und über Easy, ob die Hauptbedrohung gerade geheilt wird:

| Skill | Zielt stattdessen auf Heiler? |
| --- | --- |
| Easy | Nein |
| Normal | 50% Chance |
| Hard | Ja |
| Expert | Ja |

Gegner über 500 HU werden normal als nicht-unmittelbar depriorisiert. Ausnahmen: Hard/Expert-Bots behandeln entfernte Medics und Engineers immer als unmittelbare Bedrohungen, und jeder gegnerische Sniper, der ungefähr in deine Richtung zielt, wird immer als unmittelbar behandelt, egal Distanz und Skill.

| Skill | Entfernte Medics/Engineers/zielende Snipers = unmittelbare Bedrohung? |
| --- | --- |
| Easy/Normal | Nein |
| Hard/Expert | Ja |

Dieser Sniper-Check hat eine erstaunliche Geschichte, die ich immer gerne erzähle. Sigsegvs Originalschrift nahm an, das Spiel verlange, dass das Skalarprodukt zwischen Sniper-Zielvektor und relativer Bot-Position *exakt null* sei: Ein so präziser Vergleich, dass er in Fließkomma fast nie triggern würde und die ganze Funktion effektiv toter Code wäre. Eine später publizierte Korrektur (Credit an eine sauberere Hex-Rays-Dekompilierung) zeigte, dass der echte Check `Skalarprodukt > 0` ist: Jeder Sniper, der von direkt auf dich bis senkrecht zu dir schaut, gilt als unmittelbare Bedrohung; alles von senkrecht bis Rücken-zu-dir nicht. Die ursprüngliche Fehllesart kam aus einer Fehldekompilierung eines SSE-Fließkommavergleichs. Reverse Engineering an einer AAA-Binary bleibt eine approximative Übung.

### Bewegung: Ausweichen

Easy-Bots weichen nie aus, Punkt. Normal- und höhere Bots weichen links/rechts aus (33% links, 33% rechts, 33% nichts tun, gewichtet gegen erkannte Löcher), wenn sie eine Kampfwaffe halten, in den letzten 3 Sekunden einen Gegner sahen und dieser Gegner Sichtlinie auf sie hat.

Sie weichen *nicht* aus, wenn einer dieser Fälle zutrifft: `DisableDodge`-Attribut gesetzt, aktuelles Verhalten sagt beeilen, gerade invulnerabel (irgendein Uber), mitten in Verspottung/Provokation, spielt Engineer, unsichtbar oder getarnt als Spy, zielt als Sniper oder rotiert als Heavy, oder spannt den Huntsman.

### Bewegung: Feind-Anrempeln vermeiden

Über Normal versuchen Bots spezifisch, beim Bewegen nicht in Gegner zu rennen:

| Skill | Vermeidet Feind-Anrempeln? |
| --- | --- |
| Easy | Nein |
| Normal | Nein |
| Hard | Ja |
| Expert | Ja |

In der Praxis zählt das nur für Spy-Bots: Eine peinliche Kollision mit einem gegnerischen Spieler zu vermeiden ist genau die Art Ding, die eine Tarnung kompromittiert.

### Pyro: Airblast-Beherrschung

Airblast dient zwei Dingen: Projektile reflektieren (PvP und MvM) und nahe Gegner von Kanten pushen (nur PvP). Ob der Bot bei gültiger Gelegenheit auf den Trigger drückt, ist ein skillbasierter Münzwurf:

| Skill | Chance Airblast auszulösen |
| --- | --- |
| Easy | 0% |
| Normal | 50% |
| Hard | 90% |
| Expert | 100% |

Easy-Pyro-Bots können buchstäblich keinen Airblast: Der Wurf ist hardcoded nie erfolgreich, nicht nur "selten."

### Spy: Tarnungseffektivität

Zwei separate Achsen skalieren mit Skill. *Tarnungs*-Wahl:

| Skill | Tarnmethode |
| --- | --- |
| Easy/Normal | Zufällige Klasse, ignoriert was das Gegnerteam wirklich spielt |
| Hard/Expert | Wählt einen echten gegnerischen Spieler und kopiert seine exakte Klasse |

*Verhalten* in Tarnung:

| Skill | Verhalten in Tarnung/Unsichtbarkeit |
| --- | --- |
| Easy/Normal | Starrt gegnerische Spieler an, wenn er sie sieht (verdächtig) |
| Hard/Expert | Vermeidet bewusst Augenkontakt (überzeugender) |

### Spy: Backstab-Aggressivität

Auf lange Distanz (bis 300 HU, `tf_bot_spy_knife_range`) engaged ein Spy-Bot einen Backstab nur, wenn er das Opfer sehen kann und der Opferrücken mindestens teilweise abgewandt ist. Skill bestimmt, wie dezentriert dieser Rückenwinkel sein darf:

| Skill | Winkeltoleranz |
| --- | --- |
| Easy | Versucht selbst wenn du ihn direkt anschaust |
| Normal | ±45° von deinem Rücken |
| Hard | ±78° von deinem Rücken |
| Expert | ±90° von deinem Rücken (kompletter 180°-Hinterbogen) |

Easy-Spy-Bots sind funktional suizidal: Sie versuchen einen Messerstich auf jemanden, der ihnen direkt in die Augen schaut. **Ausnahme :** In Mann vs. Machine wird jeder Spy-Bot auf die Normal-Winkelbedingung gezwungen, egal sein echtes Skill-Level.

### Taktiken: Waffenauswahl

Diese Logik betrifft nur Level über Easy, mit reduziertem MvM-Interesse, da Bots dort generell strikte Waffenrestriktionen haben:

- **Scout**: Wechselt zur Sekundärwaffe, wenn das Primärmagazin leer ist.
- **Soldier**: Wechselt zur Sekundärwaffe, wenn das Magazin leer ist *und* das Ziel unter 500 HU hat.
- **Sniper**: Wechselt zur Sekundärwaffe für Ziele unter 750 HU.
- **Pyro**: Wechselt zur Sekundärwaffe für Ziele über 750 HU, außer das Ziel ist ein Soldier oder Demoman.

### Taktiken: Nachladen in Deckung

In MvM fehlende Logik. Wenn das aktuelle Bot-Verhalten ihm nicht sagt zurückzuweichen, sein Hauptmagazin leer ist und er ohne Uber verwundbar bleibt, ziehen sich höhere Bots temporär in Deckung zurück, um nachzuladen, statt dir ins Gesicht auf eine leere Waffe zu klicken:

| Skill | Zieht sich zum Nachladen zurück? |
| --- | --- |
| Easy | Nein |
| Normal | Nein |
| Hard | Ja |
| Expert | Ja |

### CP-Modus: Verteidiger-Umherstreifen

In MvM fehlende Logik. Beim Verteidigen eines Control Points verlassen höhere Bots eher den Punkt, um Kills zu jagen ("Search and Destroy"), aber nur mit decent verbleibender Zeit auf `tf_bot_defense_must_defend_time`:

| Skill | Streifchance |
| --- | --- |
| Easy | 10% |
| Normal | 50% |
| Hard | 75% |
| Expert | 90% |

### CP-Modus: Capture-Blocken

In MvM fehlende Logik. Verteidigende Bots, die einen gegnerischen Capture-Versuch contesten:

| Skill | Versucht Capture zu blocken? |
| --- | --- |
| Easy | Nein |
| Normal | 50% Chance |
| Hard | Ja |
| Expert | Ja |

---

## Die komplette Übersichtstabelle

<div style="overflow-x:auto">

| Aspekt | Easy | Normal | Hard | Expert | Notizen |
| --- | --- | --- | --- | --- | --- |
| Sicht: Erkennungszeit | 1,00s | 0,50s | 0,30s | 0,20s | |
| Zielen: Tracking-Rate | 1x/s | 4x/s | 10x/s | 20x/s | Spies nutzen immer Normal |
| Granaten/Sticky-Bogenkompensation | Ja | Ja | Ja | Ja | Loose Cannon ausgenommen |
| Huntsman-Vertikalkompensation | Nein | Ja | Ja | Ja | |
| Huntsman-Headshots | Nein | <150 HU | Ja | Ja | |
| Raketenwerfer-Fußschuss | Nein | Ja | Ja | Ja | Direct Hit und Cow Mangler ausgenommen |
| Sniper-Gewehr-Zielpunkt | Körper | ~33% zum Kopf | Kopf | Kopf | |
| Chance diskrete Schüsse zu bemerken | 10% | 30% | 60% | 90% | Halbiert wenn von lauten Schüssen maskiert |
| Zielt auf Heiler | Nein | 50% | Ja | Ja | |
| Entfernter Medic/Engineer/zielender Sniper = Bedrohung | Nein | Nein | Ja | Ja | |
| Ausweichen | Nein | Ja | Ja | Ja | Lange Ausnahmeliste |
| Vermeidet Feind-Anrempeln | Nein | Nein | Ja | Ja | Vor allem wichtig für Spy |
| Chance Airblast auszulösen | 0% | 50% | 90% | 100% | |
| Spy-Tarnklassenwahl | Zufällig | Zufällig | Entspricht echtem Gegner | Entspricht echtem Gegner | |
| Spy-Augenkontakt in Tarnung | Starrt (offensichtlich) | Starrt | Meidet (überzeugend) | Meidet | |
| Spy-Backstab-Winkel | ~0° | ±45° | ±78° | ±90° | MvM forct Normal |
| Waffenauswahllogik | Nein | Ja | Ja | Ja | Weniger relevant in MvM |
| Nachladen in Deckung | Nein | Nein | Ja | Ja | Nicht in MvM |
| CP-Verteidiger-Streifen | 10% | 50% | 75% | 90% | Nicht in MvM |
| CP-Capture-Blocken | Nein | 50% | Ja | Ja | Nicht in MvM |

</div>

---

## Fazit

![TF2-Heavy-Bot zielt mit Minigun](assets/tf2-bot-ai-heavy-aim.png)

All das spiegelt ein deliberates Valve-System: Vollständig deterministische Scores und Wahrscheinlichkeiten, nur nie offiziell dokumentiert. Hier die Punkte, die ich nach diesem Tiefgang mitnehme:

1. **"Skill" ist ein Set unabhängiger Slider**, kein globaler Multiplikator. Reaktionszeit, Zielkadenz und jedes taktische Verhalten skalieren separat, und manche (Spy-Tracking-Rate, MvM-Backstab-Winkel) haben hardcodierte Overrides egal Level.
2. **Ein Teil ist wirklich verbuggt, nicht nur alt.** Die seit 2010 eingefrorene Diskret-Waffenliste, der Cow Mangler ohne Fußschusslogik aus keinem guten Grund, der Sniper-Skalarprodukt-Check, der Jahre brauchte, um korrekt dekompiliert zu werden: Valves KI-Code hat Narben wie jede 17 Jahre alte Codebase.
3. **Du kannst das alles nutzen.** Wissen, dass dich ein Normal-Sniper-Bot nicht headshotten wird, dass ein Easy-Pyro deine Rakete buchstäblich nicht reflektieren kann, dass ein Easy-Spy versuchen wird, dich frontal zu erstechen. Das ist kein Glück. Das ist ein Datenblatt.

Riesiges Danke an sigsegv für den Original-Code-Deep-Dive, der das meiste davon erst möglich machte, ans TF2-Wiki für Basisdokumentation zu Bot-Commands und Map-Support, und an alle in der Community, die weiter eine 17 Jahre alte Bot-KI auseinandernehmen, um exakt zu verstehen, warum sie tut, was sie tut.
