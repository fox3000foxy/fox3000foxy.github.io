---
title: "TF2-Bots sind nicht zufällig: Ich habe jeden Schwierigkeitsparameter neu entdeckt"
description: "Sicht, Zielen, Backstab-Winkel, Headshot-Logik, jeder bekannte Fehler - Valve hat nie etwas davon dokumentiert. Also durchsuchten wir den Code und machten daraus ein vollständiges Spezifikationsblatt."
date: 2026-07-12
authors:
  - fox3000foxy
tags:
  - tf2
  - game-ai
  - reverse-engineering
lang: "de"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "vHz+IbOP2u52LHfDwpFLNNHDq8wziOYFIZ+BVuZbrRkuD0Pwfi3TD/Qbz8pmW3t0pfGVqJ22kSmQq2//SEMinQ=="
---

## Einleitung

![TF2-Soldier-Bot zielt mit einem Raketenwerfer](assets/tf2-bot-ai-soldier-aim.png)

Jeder TF2-Spieler hat es mindestens einmal gesagt: „Der Bot schummelt." Oder das Gegenteil: „Warum steht dieser Easy-Bot einfach da und frisst Raketen?" Niemand weiß wirklich, was „Easy", „Normal", „Hard" und „Expert" unter der Haube bedeuten: Valve hat vier Schwierigkeitsstufen ausgeliefert und exakt null Dokumentation.

Also haben sich ein paar von uns zusammengetan (ich, awimii, Mush The Possum, und den Großteil der Grundlagenarbeit hat sigsegv erledigt, der sich wirklich durch den dekompilierten Spielcode gegraben hat), um ein vollständiges Forschungsdokument über das TFBot-Verhalten zu verfassen. Jede Mechanik, jeder bekannte Fehler, jede fest verdrahtete Wahrscheinlichkeit. Dieser Artikel ist der vollständige Bericht, nicht die Kurzfassung. Hol dir einen Bonk, es wird lang.

---

## Kapitel I: Die Grundlagen

### Bot vs. Puppet-Bot

TF2 kennt zwei völlig verschiedene Dinge, die Leute „Bots" nennen:

- **KI-Bots (TFBots)**: echte KI, gebaut auf demselben PlayerBot/Infected-Framework, das Valve für die Reihe *Left 4 Dead* verwendet hat. Sie wählen eine zufällige Klasse, spielen das Ziel, funktionieren ohne `sv_cheats` und schalten Erfolge frei wie ein echter Spieler.
- **Puppet-Bots**: keinerlei KI, können sich nicht selbstständig bewegen oder handeln. Sie existieren nur, um manuell gesteuert zu werden: Ein Spieler kann sie zwingen zu folgen, zu zielen und zu schießen. Hauptsächlich für Tests oder für filmische Screenshots und Videos genutzt. Zum Spawnen braucht man `sv_cheats 1`, was außerdem Erfolge für die Sitzung deaktiviert.

Dieser Artikel handelt ausschließlich von der ersten Art.

### Was du KI-Bots (mehr oder weniger) sagen kannst

TFBots sind nicht direkt steuerbar, aber du kannst sie in gewisse Handlungen schubsen:

- Ziel mit dem Fadenkreuz auf einen Bot (Verbündeter oder Gegner): Er verspottet dich, wenn du die richtigen Sprachbefehle nutzt.
- Ein verbündeter Medic-Bot heilt dich, wenn du den Sprachbefehl „Medic!" nutzt.
- Wenn ein Medic-Bot, der dich heilt, einen bereiten Übersteiger hat, lässt ihn der Ruf „Go go go!" oder „Activate charge!" sofort zünden.
- Ein Medic-Bot mit bereitem Übersteiger zündet ihn automatisch, sobald er selbst oder sein Heilungsziel schwer getroffen wird, ganz ohne Sprachbefehl.
- Bots führen spontan Duo-Taunts (High Five) oder Gruppen-Taunts (Conga) mit Teamkollegen in der Nähe aus.

### Bots auf nicht unterstützten Karten zum Laufen bringen

Bots brauchen ein Navigationsnetz, um zu wissen, wohin sie gehen dürfen, und die meisten Community-Karten liefern keines mit. So erzwingst du es:

1. `sv_cheats 1`
2. `nav_generate`: erzeugt das initiale Navmesh, der Fortschritt wird in der Konsole angezeigt
3. Warten, bis das Spiel die Pfade fertig berechnet hat
4. Optional fehlerhafte Navigationsdaten manuell mit `nav_edit 1` korrigieren
5. Server neu laden oder neu starten (wenn du diesen Schritt auslässt, sind Erfolge deaktiviert)
6. `tf_bot_add <Anzahl>` zum Spawnen der Bots

**Warnung:** Das Bearbeiten des Navmeshs, während Bots auf dem Server aktiv sind, kann das Spiel zum Absturz bringen. Sobald das Netz existiert, musst du es für künftige Sitzungen nicht neu erzeugen: Füge einfach Bots mit `tf_bot_add` hinzu.

Automatisch erzeugte Netze funktionieren am besten auf Control Point-, King of the Hill-, Payload- und CTF-Karten. Auf Mannpower-Karten verhalten sich Bots standardmäßig wie bei CTF, nutzen Enterhaken oder Powerups aber kaum. Hat eine Karte kein Ziel, das die Bot-KI erkennt, aber eine Spawn-Raum-Entität, lässt `tf_bot_offense_must_push_time 0` die Bots trotzdem kämpfen.

*(Quelle für diesen Abschnitt: die offizielle TF2-Wiki-Seite zu Bots.)*

### Aktueller Stand, Karte für Karte

Dank des Hatless-Updates funktioniert inzwischen jede Klasse korrekt, auch der historisch fehlerhafte Spy. Bots verhalten sich auf den meisten offiziellen KOTH-Karten richtig, auf einigen Payload-Karten, auf Dustbowl und Gorge Attack-Defense sowie auf CTF- und Mann-Manor-Karten. Bei den beiden letzten kannst du sie nicht direkt mit `tf_bot_add` spawnen. Auf nicht unterstützten Karten (über den nav_generate-Prozess oben) funktionieren sie, imitieren einen echten Spieler aber spürbar schlechter.

PLR-Karten sind verloren: Bots können die Barrieren auf Hightower nicht überqueren und bleiben in Ecken stecken, und auf allen anderen PLR-Karten machen sie einfach ... eine Tanzparty statt zu spielen. Vielleicht wird es irgendwann behoben, vielleicht bleibt es so.

### Allgemeines Bot-Verhalten

Eine bunte Mischung aus Dingen, die jeder Bot unabhängig von seiner Stufe tut:

- Bots nutzen nur Standard-Ausrüstung (ein Plugin kann ihnen nicht-standardmäßige Waffen aufzwingen, aber Vanilla-Bots wählen nie selbst).
- Easy-Bots nutzen ihre Sekundärwaffe kaum. Höhere Stufen wechseln sofort zur Sekundärwaffe, sobald das Magazin der Primärwaffe leer ist, oder um die Distanz auszugleichen.
- Bots ignorieren fortgeschrittene Bewegungstechniken: keine Raketensprünge, keine Gebäudeverlagerungen.
- Nach einem Kill darf ein Bot taunten, sogar unter Beschuss, es sei denn, er trägt das gegnerische Intel. Diese Regel gilt auch in MvM.
- Verkleidete Spy-Bots (Spieler oder KI) werden von anderen Bots korrekt ignoriert: bis sie einen Gegner berühren, etwas sabotieren, schießen oder in dessen Nähe unsichtbar werden. Sobald sie „entdeckt" wurden, merkt sich der Bot bzw. Spieler diesen Spy als solchen, bis er sich beim Tarnen umzieht, stirbt oder mit dem Dead Ringer den Tod vortäuscht.
- Pyro-Bots nutzen ab Normal großzügig die Kompressionsexplosion.
- Medic-Bots priorisieren das Heilen aller außer Snipern (und in geringerem Maße Engineers), selbst wenn du „Medic!" spammst.
- Medic-Bots fühlen sich zu Heavies, Soldiers, Demomen und Pyros hingezogen, besonders wenn ein *Mensch* diese Klassen spielt. Diese Aufmerksamkeit folgt der Anwesenheit eines Menschen in diesen Rollen.
- Bots halten während der Vorbereitungsphase auf Angriffs-/Verteidigungs- und Payload-Karten ihre Position, außer Engineers, Snipers und Spies, die sich frei bewegen. Demomen-Bots dürfen zusätzlich Haftbomben vorplatzieren.
- Engineer-Bots verbessern oder deaktivieren nie die Gebäude eines anderen verbündeten Engineers, es sei denn, das Gebäude steht auf dem Weg ihres Ziels. Manchmal reparieren sie ihre eigene Sentry nicht, auch wenn es offensichtlich wäre.
- Entdeckte Spy-Bots wechseln zu ihrem Revolver und ziehen sich zurück, statt einen Messerstich zu erzwingen.
- Demomen-Bots, die eine Sentry ausgemacht haben (meist, weil sie einmal dagegen gestorben sind), können Haftbomben präzise von außerhalb ihrer Reichweite auf sie zielen lassen, durch Wände und Decken, wenn die Geometrie es erlaubt.
- Sniper-Bots, die nach dem Zielen kein Ziel finden, nutzen eine der „Negatives."-Sprachzeilen.
- Verbündete Medics heilen einen verkleideten Spy ohne zu zögern.

### Bekannte Probleme und Fehler

Das Dokument listet eine ganze Reihe langjähriger Eigenheiten auf:

- Bots versuchen manchmal, durch bestimmte statische Props zu laufen oder zu schießen.
- Jedes Mal, wenn ein Spieler oder Bot die Tarnung ablegt, sich verkleidet oder sich zeigt, „sehen" die Bots in der Nähe das und drehen sich um, um zu reagieren, selbst wenn das Ereignis außerhalb ihres eigentlichen Sichtfelds stattfand. Es ist nicht geräuschbasiert, sondern eine Umgehung des Sichttests.
- Selten können Bots mit einem Engineer-Teleporter physisch aneinander festhängen.
- Sprachbefehle der Bots (z. B. „Spy!", „Go!") erscheinen nicht als Text im Chat, wie es bei Spielern der Fall ist.
- Ein Medic-Bot, der gerade jemanden heilt, weicht eingehendem Feuer nicht aus und greift auch nicht nach Medipacks, selbst bei kritischen Lebenspunkten.
- Bots können sich während eines Duo-Taunts weiterbewegen, wodurch der beabsichtigte Festive-Kritischer-Treffer-Effekt entfällt.
- Kürzlich verletzte Medic-Bots nutzen die Injektionspistole auf Distanz oft nicht und bevorzugen den Nahkampf (oder versuchen in sehr seltenen Fällen, dich mit dem Strahl der Medi-Gun anzustupsen).
- Medic-Bots kompensieren bei Schüssen der Injektionspistole die Schwerkraft nicht: vermutlich, weil die Waffe im KI-Code nicht korrekt als nicht-hitscan markiert ist.
- Spy-Bots können einen unsichtbaren Spy (Spieler oder KI) sehen und verfolgen, wenn dieser schon einmal entdeckt wurde, unabhängig vom Können des verfolgenden Bots.
- Selbst wenn ein menschlicher Spy sich als Klasse aus seinem eigenen Team verkleidet, deckt ihn das Anrempeln eines Gegners trotzdem auf (Bots tun das sich selbst nie an, da sie sich nie als ihr eigenes Team verkleiden).
- Bots respektieren das Team-Autobalancing: Wenn du Bots auf eine Seite stopfen willst, setze vorher `mp_teams_unbalance_limit 0`.
- Engineer-Bots können ihre eigenen Gebäude komplett ignorieren, bis sie zerstört werden.
- Heavy-Bots versuchen manchmal, das Minigun abzufeuern, obwohl sie keine Munition mehr haben, besonders unterhalb von Hard.
- Medic-Bots des unterlegenen Teams begehen während der Demütigung gelegentlich Selbstmord, wenn kein Gegner in der Nähe ist. Ein menschlicher Spieler kann das selbst bei Absicht nicht reproduzieren.
- Wenn du im Ladebildschirm dein Teampreview auf BLU stellst, werden RED-Bots für dich optisch als BLU dargestellt.
- Bots mit ausgerüsteter Nahkampfwaffe wechseln manchmal nicht die Waffe, selbst nachdem sie Munition aufgenommen haben.
- Nach Jungle Inferno können Bots, die mit expliziten Parametern gespawnt werden (z. B. `tf_bot_add 5 pyro blue normal`), sofort in ihrem eigenen Spawnraum sterben. Abhilfe: `tf_bot_reevaluate_class_in_spawnroom 0` (benötigt `sv_cheats 1`).

### KI-Namen

Die Namen der Bots stammen aus einem großen Pool an TF2-Referenzen, anderen Valve-Spielen und Programmierkultur, vor allem weil die Community in den Steam-Foren immer wieder bestimmte Namen verlangt hat. Eine Auswahl aus der Liste: *AimBot, Aperture Science Prototype XR7, Black Mesa, Companion Cube, C++, Divide by Zero, GLaDOS, H@XX0RZ, Saxton Hale, The G-Man, trigger_hurt, 0xDEADBEEF* und Dutzende weitere in demselben Stil.

Dazu kommt eine Gruppe von Namen aus einem durchgesickerten Quellcode-Build, der aus unklaren Gründen nie in die Produktion ging: größtenteils Anspielungen auf *Last Dragon* und *Das fünfte Element*, etwa *John Spartan, Leeloo Dallas Multipass, Sho'nuff, Bruce Leroy, Big Gulp Huh?* und *I'm your huckleberry*.

Du kannst all das selbst überschreiben: `tf_bot_add heavyweapons blue "Blu Hoovy"` spawnt einen BLU-Heavy namens „Blu Hoovy".

---

## Kapitel II: Die ursprünglichen Bots / TFBots, Tiefer Einstieg in die Fähigkeitsstufen

Sigsegvs ursprüngliches Framework hat weiterhin Bestand: Es ist offensichtlich, dass Expert-Bots Easy-Bots überlegen sind, aber Valve hat nie erklärt, *wie stark* oder *warum*. Also gibt es nur einen Weg, es herauszufinden: den Code lesen. Hier ist jede Mechanik, die mit der Fähigkeitsstufe skaliert.

### Schwierigkeit einstellen

Außerhalb von MvM wird die Schwierigkeit über eine Cvar gesteuert:

| `tf_bot_difficulty` | Schwierigkeitsstufe |
| --- | --- |
| 0 | Easy |
| 1 | Normal (Standard) |
| 2 | Hard |
| 3 | Expert |

`tf_bot_add` akzeptiert außerdem direkt ein Schwierigkeits-Argument (`easy`/`normal`/`hard`/`expert`).

### MvM-Popfiles

In Mann vs. Machine hat jeder `TFBot`-Spawnblock im Popfile einen optionalen `Skill`-Schlüssel. Fehlt er, gilt Easy. In den Valve-Missionen sind Giants fast immer Expert, Engineers und Spies fast immer Expert, und Snipers meist Hard (gelegentlich Expert). Wenn du `EventChangeAttributes` nutzt (mit dem Two-Cities-Update eingeführt), um Bots während einer Welle durch Kartenereignisse dynamisch zu verändern, ist die Bot-Stufe eine der Eigenschaften, die du im Flug ändern kannst.

### Endloser MvM-Modus

Der Endlos-Modus wurde nie offiziell veröffentlicht. Darin geben Bots ihr Geld wie Spieler für Upgrades aus, darunter ein botexklusives Upgrade, das ihre Fähigkeitsstufe in der KI erhöht.

### Die `bot_generator`-Entität

Eine obskure, weitgehend undokumentierte Entität, vermutlich im Trainingsmodus und möglicherweise in der frühen MvM-Entwicklung genutzt. Sie bietet einen `SetDifficulty`-Input, um die Fähigkeitsstufe zu steuern. Darüber hinaus verliert sich die Spur: Valve hat sie nie dokumentiert, und niemand hat ihr Verhalten vollständig kartiert.

### Augenleuchtfarbe

MvM-Roboter haben einen Augen-Leuchteffekt, dessen Farbe sich mit der Fähigkeitsstufe ändert, ein visueller Hinweis, den außerhalb der Community nie jemand erklärt hat:

| Stufe | Augenfarbe | RGB |
| --- | --- | --- |
| Easy/Normal | Blau | `#24b4ff` |
| Hard/Expert | Gelb | `#fff000` |

![TF2-Heavy-Bot in Ruhestellung](assets/tf2-bot-ai-heavy-idle.png)

### Sicht: Erkennungszeit

Ein Bot reagiert nicht sofort, wenn etwas in sein Sichtfeld kommt: Es gibt eine fest verdrahtete Verzögerung, bevor der Rest der KI die Bedrohung überhaupt anerkennen darf:

| Stufe | Mindest-Erkennungszeit |
| --- | --- |
| Easy | 1,00 s |
| Normal | 0,50 s |
| Hard | 0,30 s |
| Expert | 0,20 s |

Das ist der Großteil des Effekts „Easy-Bots wirken dumm", in einer einzigen Zahl: Ein Easy-Bot zielt nach dem Entdecken nicht schlechter, er braucht nur fünfmal so lange, um überhaupt zu bemerken, dass du existierst.

### Zielen: Verfolgungsrate

Bots verfolgen dich nicht kontinuierlich. Sie tasten deine Position und Geschwindigkeit in einem festen Intervall ab und berechnen daraus eine gerade Linie:

| Stufe | Neuberechnungsintervall | Entsprechende Rate |
| --- | --- | --- |
| Easy | 1,00 s | 1x/s |
| Normal | 0,25 s | 4x/s |
| Hard | 0,10 s | 10x/s |
| Expert | 0,05 s | 20x/s |

**Ausnahme:** Spy-Bots sind fest auf die Normal-Verfolgungsrate eingestellt, unabhängig von ihrer tatsächlichen Stufe: Ein Expert-Spy zielt immer noch wie ein Normal-Bot. Es gibt außerdem ein öffentliches Demo-Video, das die Verfolgungsraten nebeneinander vergleicht, falls du die Lücke 1x vs. 20x in Bewegung sehen willst.

### Zielen: waffenspezifische Fähigkeit

Bots zielen nicht einfach auf deine Körpermitte: Sie haben waffenspezifische Logik, manchmal wirklich fehlerhaft:

**Granatwerfer und Haftbomben-Werfer.** Alle Stufen kompensieren den vertikalen Bogen mit einem festen `tf_bot_ballistic_elevation_rate`-Cvar-Wert. Da diese Kompensation nur für die Basis-Waffen-ID greift, werden schnellere Projektil-Varianten (Loch-n-Load, alles mit Projektilgeschwindigkeits-Modifikator) nicht richtig angepasst. Und da sie an die Waffen-ID gebunden ist, bekommt die Loose Cannon (eine andere ID) gar keine Bogenkompensation.

**Huntsman.** Easy-Bots kompensieren den Pfeilabfall nicht und zielen nie auf den Kopf. Bots der Stufe Normal kompensieren den Bogen, zielen aber nur unter 150 HU auf den Kopf. Hard- und Expert-Bots zielen immer auf den Kopf.

**Raketenwerfer.** Über 150 HU zielen Nicht-Easy-Bots auf deine Füße statt auf die Körpermitte, um Splash- und Rückstoß-Chancen zu maximieren. Unter 150 HU wechseln sie zu Kopftreffern. Easy-Bots zielen unabhängig von der Distanz immer auf die Körpermitte. Das ist außerdem an die Waffen-ID gebunden: Direct Hit und Cow Mangler übernehmen dieses Verhalten nicht. Für den Direct Hit ergibt das Sinn (kein Splash zum Ausnutzen), für den Cow Mangler überhaupt nicht: Dieser Teil der KI stammt aus einer Zeit vor der Existenz der Waffe und wurde schlicht nie überarbeitet.

**Scharfschützengewehre.** Easy zielt auf den Körper. Normal zielt etwa 33 % vom Körper in Richtung Kopf. Hard und Expert zielen direkt auf den Kopf. In MvM weniger wichtig, da Kopftreffer von Bots dort ohnehin keinen Schadensbonus erhalten.

### Gehör: Empfindlichkeit für leise Schüsse

Jeder Schuss alarmiert Bots in der Nähe über die Position des Schützen, auch durch Wände, bis 3000 HU mit 100 % Bemerkungschance (`tf_bot_notice_gunfire_range`). Eine Teilmenge der Waffen ist aber als „leise" markiert: nur innerhalb von 500 HU hörbar (`tf_bot_notice_quiet_gunfire_range`), und auch dann mit einer von der Stufe abhängigen Chance:

| Stufe | Chance, leisen Schussklang zu bemerken |
| --- | --- |
| Easy | 10 % |
| Normal | 30 % |
| Hard | 60 % |
| Expert | 90 % |

Diese Wahrscheinlichkeit halbiert sich, wenn in den letzten 3 Sekunden ein *lauter* Schuss zu hören war: Laute Geräusche überdecken leise.

Die Liste der leisen Waffen-IDs wurde seit Dezember 2010 nicht mehr aktualisiert. Jede spätere Ergänzung mit einer neuen Waffen-ID gilt standardmäßig als laut, egal wie logisch leise sie sein sollte, außer sie verwendet eine ältere ID wieder. Konkret:

| Waffen-ID | Deckt ab |
| --- | --- |
| `TF_WEAPON_KNIFE` | Alle Spy-Messer |
| `TF_WEAPON_FISTS` | Heavy-spezifische Schläge (sein klassenübergreifender Schlag ist eigentlich `TF_WEAPON_FIREAXE`) |
| `TF_WEAPON_PDA` | Vermutlich nicht direkt verwendet |
| `TF_WEAPON_PDA_ENGINEER_BUILD` | Engineer-Bau-PDA |
| `TF_WEAPON_PDA_ENGINEER_DESTROY` | Engineer-Abriss-PDA |
| `TF_WEAPON_PDA_SPY` | Spy-Verkleidungsset |
| `TF_WEAPON_BUILDER` | Spy-/Engineer-/Sapper-Werkzeugkästen |
| `TF_WEAPON_MEDIGUN` | Alle Medi-Guns |
| `TF_WEAPON_DISPENSER` | Vermutlich ungenutzt (Dispenser sind Objekte, keine Waffen) |
| `TF_WEAPON_INVIS` | Alle Spy-Unsichtbarkeitsuhren |
| `TF_WEAPON_FLAREGUN` | Alle Pyro-Signalpistolen *außer* dem Manmelter |
| `TF_WEAPON_LUNCHBOX` | Sandwich, Dalokohs-Riegel, Buffalo-Steak-Sandvich, Bonk!, Crit-a-Cola |
| `TF_WEAPON_JAR` | Jarate (nicht Mad Milk, das hat eine eigene ID und ist nicht leise) |
| `TF_WEAPON_COMPOUND_BOW` | Huntsman |
| `TF_WEAPON_SWORD` | Eyelander, Skullcutter, Claidheamh Mor, Persian Persuader, Half-Zatoichi |
| `TF_WEAPON_CROSSBOW` | Crusader's Crossbow |

Das klassische Beispiel für die verrottende Liste: Der Manmelter bekam seine eigene ID (`TF_WEAPON_RAYGUN_REVENGE`), nachdem die Liste der leisen Waffen eingefroren war. Deshalb gilt er als laut, obwohl er in jeder praktischen Hinsicht eine Signalpistole ist. Der Scorch Shot, noch später veröffentlicht, verwendet die Basis-ID `TF_WEAPON_FLAREGUN` wieder und zählt daher weiterhin als leise. Verrückt, aber so steht es im Code.

### Strategie: Bedrohungspriorisierung

Wenn mehrere Gegner gleichzeitig sichtbar sind, gewichten Bots Entfernung, ob auf sie geschossen wird, und ab Easy aufwärts, ob die Hauptbedrohung geheilt wird:

| Stufe | Stattdessen den Heiler anvisieren? |
| --- | --- |
| Easy | Nein |
| Normal | 50 % Chance |
| Hard | Ja |
| Expert | Ja |

Gegner jenseits von 500 HU werden normalerweise als nicht unmittelbar eingestuft und abgewertet. Ausnahmen: Hard- und Expert-Bots behandeln entfernte Medics und Engineers immer als unmittelbare Bedrohung, und jeder gegnerische Sniper, der ungefähr in ihre Richtung zielt, gilt unabhängig von Distanz und Stufe stets als unmittelbar.

| Stufe | Entfernte Medics/Engineers/zielender Sniper = unmittelbare Bedrohung? |
| --- | --- |
| Easy/Normal | Nein |
| Hard/Expert | Ja |

Zu dieser Sniper-Prüfung habe ich eine Geschichte, die ich immer noch gern erzähle. Sigsegvs ursprüngliche Analyse ging davon aus, dass das Spiel verlangt, dass das Skalarprodukt zwischen dem Zielvektor des Snipers und der relativen Position des Bots *exakt null* ist: ein so präziser Vergleich, dass er bei Fließkommazahlen fast nie auslöst und das ganze Feature faktisch toter Code wäre. Ein später veröffentlichter Fix (Dank an eine sauberere Hex-Rays-Dekompilierung) zeigte, dass die eigentliche Prüfung `Skalarprodukt > 0` lautet: Jeder Sniper, der von direkt auf dich bis senkrecht zielt, zählt als unmittelbare Bedrohung; alles von senkrecht bis abgewandt nicht. Der ursprüngliche Lesefehler stammte aus einer schlechten Dekompilierung eines SSE-Fließkomma-Vergleichs. Das Reverse-Engineering eines AAA-Binärprogramms bleibt eine annähernde Übung.

### Bewegung: Ausweichen

Easy-Bots weichen nie aus, Punkt. Bots ab Normal weichen nach links oder rechts aus (33 % links, 33 % rechts, 33 % nichts, gewichtet gegen erkannte Löcher), wenn sie eine Kampfwaffe halten, in den letzten 3 Sekunden einen Gegner gesehen haben und dieser Gegner Sichtlinie auf sie hat.

Sie weichen *nicht* aus, wenn eines davon zutrifft: Das Attribut `DisableDodge` ist gesetzt, das aktuelle Verhalten verlangt Eile, sie sind gerade unverwundbar (durch einen Übersteiger), mitten in einem Taunt oder einer Provokation, spielen Engineer, sind getarnt oder als Spy verkleidet, sind als Sniper gescopt oder als Heavy aufgedreht oder greifen den Huntsman an.

### Bewegung: Vermeiden, Gegner anzurempeln

Ab Normal versuchen Bots bewusst, beim Laufen nicht in Gegner zu laufen:

| Stufe | Vermeidet das Anrempeln von Gegnern? |
| --- | --- |
| Easy | Nein |
| Normal | Nein |
| Hard | Ja |
| Expert | Ja |

In der Praxis ist das nur für Spy-Bots relevant: Eine unangenehme Kollision mit einem gegnerischen Spieler ist genau das, was eine Verkleidung auffliegen lässt.

### Pyro: Meisterschaft im Rückstoß

Der Rückstoß (Airblast) erfüllt zwei Zwecke: Projektile reflektieren (PvP und MvM) und Gegner in der Nähe von Kanten wegschubsen (nur PvP). Ob der Bot bei einer gültigen Gelegenheit den Abzug drückt, ist ein stufenabhängiger Münzwurf:

| Stufe | Chance, den Rückstoß auszulösen |
| --- | --- |
| Easy | 0 % |
| Normal | 50 % |
| Hard | 90 % |
| Expert | 100 % |

Easy-Pyro-Bots können buchstäblich nicht rückstoßen: Der Wurf ist fest verdrahtet, um nie zu gelingen, nicht nur „selten".

### Spy: Wirksamkeit der Verkleidung

Zwei getrennte Achsen skalieren mit der Stufe. Die Wahl der Verkleidungsklasse:

| Stufe | Verkleidungsmethode |
| --- | --- |
| Easy/Normal | Zufällige Klasse, ohne Rücksicht darauf, was das gegnerische Team tatsächlich spielt |
| Hard/Expert | Wählt einen echten gegnerischen Spieler und kopiert dessen exakte Klasse |

*Verhalten* in der Verkleidung:

| Stufe | Verhalten verkleidet/unsichtbar |
| --- | --- |
| Easy/Normal | Starrt gegnerische Spieler an, sobald er sie sieht (verdächtig) |
| Hard/Expert | Vermeidet bewusst Blickkontakt (überzeugender) |

### Spy: Backstab-Aggression

Auf große Distanz (bis 300 HU, `tf_bot_spy_knife_range`) legt sich ein Spy-Bot nur dann auf einen Backstab fest, wenn er das Opfer sieht und dessen Rücken zumindest teilweise abgewandt ist. Die Stufe bestimmt, wie weit der Rückenwinkel von der Mitte abweichen darf:

| Stufe | Winkeltoleranz |
| --- | --- |
| Easy | Versucht es, selbst wenn du direkt auf ihn zeigst |
| Normal | ±45° von deinem Rücken |
| Hard | ±78° von deinem Rücken |
| Expert | ±90° von deinem Rücken (voller 180°-Bogen nach hinten) |

Easy-Spy-Bots sind praktisch selbstmörderisch: Sie versuchen, jemanden zu erstechen, der ihnen direkt in die Augen starrt. **Ausnahme:** In Mann vs. Machine wird jeder Spy-Bot unabhängig von seiner tatsächlichen Stufe auf die Normal-Winkelbeschränkung gezwungen.

### Taktik: Waffenwahl

Diese Logik betrifft nur Stufen über Easy, mit geringerem Interesse in MvM, da Bots dort meist strikte Waffenbeschränkungen haben:

- **Scout**: wechselt zur Sekundärwaffe, wenn das Magazin der Primärwaffe leer ist.
- **Soldier**: wechselt zur Sekundärwaffe, wenn das Magazin leer ist *und* das Ziel unter 500 HU liegt.
- **Sniper**: wechselt zur Sekundärwaffe bei Zielen unter 750 HU.
- **Pyro**: wechselt zur Sekundärwaffe bei Zielen über 750 HU, außer das Ziel ist ein Soldier oder Demoman.

### Taktik: Nachladen in Deckung

Diese Logik fehlt in MvM. Wenn das aktuelle Verhalten des Bots ihm nicht sagt, dass er sich zurückziehen soll, sein Primär-Magazin leer ist und er ohne Übersteiger verwundbar bleibt, ziehen sich Bots höherer Stufen vorübergehend in Deckung zurück, um nachzuladen, statt dir den leeren Lauf ins Gesicht zu halten:

| Stufe | Zieht sich zum Nachladen zurück? |
| --- | --- |
| Easy | Nein |
| Normal | Nein |
| Hard | Ja |
| Expert | Ja |

### CP-Modus: Verteidiger streifen umher

Diese Logik fehlt in MvM. Beim Verteidigen eines Kontrollpunkts verlassen Bots höherer Stufen den Punkt eher, um Kills zu jagen („Suchen und zerstören"), aber nur, wenn noch genug Zeit auf `tf_bot_defense_must_defend_time` übrig ist:

| Stufe | Chance zum Streifen |
| --- | --- |
| Easy | 10 % |
| Normal | 50 % |
| Hard | 75 % |
| Expert | 90 % |

### CP-Modus: Eroberung blockieren

Diese Logik fehlt in MvM. Verteidigerbots, die einen gegnerischen Eroberungsversuch anfechten:

| Stufe | Versucht, die Eroberung zu blockieren? |
| --- | --- |
| Easy | Nein |
| Normal | 50 % Chance |
| Hard | Ja |
| Expert | Ja |

---

## Die vollständige Übersichtstabelle

<div style="overflow-x:auto">

| Aspekt | Easy | Normal | Hard | Expert | Hinweise |
| --- | --- | --- | --- | --- | --- |
| Sicht: Erkennungszeit | 1,00 s | 0,50 s | 0,30 s | 0,20 s | |
| Zielen: Verfolgungsrate | 1x/s | 4x/s | 10x/s | 20x/s | Spies immer Normal |
| Kompensation Granaten-/Haftbombenbogen | Ja | Ja | Ja | Ja | Loose Cannon ausgenommen |
| Huntsman vertikale Kompensation | Nein | Ja | Ja | Ja | |
| Huntsman-Kopfschüsse | Nein | <150 HU | Ja | Ja | |
| Raketenwerfer: Fußtreffer | Nein | Ja | Ja | Ja | Direct Hit & Cow Mangler ausgenommen |
| Scharfschützengewehr: Zielpunkt | Körper | ~33 % Richtung Kopf | Kopf | Kopf | |
| Chance, leisen Schuss zu bemerken | 10 % | 30 % | 60 % | 90 % | Halbiert, wenn von lautem Feuer überdeckt |
| Heiler anvisieren | Nein | 50 % | Ja | Ja | |
| Entfernter Medic/Engineer/zielender Sniper = unmittelbar | Nein | Nein | Ja | Ja | |
| Ausweichen | Nein | Ja | Ja | Ja | Lange Ausnahmeliste |
| Vermeiden, Gegner anzurempeln | Nein | Nein | Ja | Ja | Vor allem für Spy relevant |
| Chance Rückstoß auszulösen | 0 % | 50 % | 90 % | 100 % | |
| Spy: Wahl der Verkleidungsklasse | Zufällig | Zufällig | Entspricht einem echten Gegner | Entspricht einem echten Gegner | |
| Spy: Blickkontakt in Verkleidung | Starrt (offensichtlich) | Starrt | Vermeidet (überzeugend) | Vermeidet | |
| Spy: Backstab-Winkel | ~0° | ±45° | ±78° | ±90° | MvM erzwingt Normal |
| Waffenwahl-Logik | Nein | Ja | Ja | Ja | In MvM weniger relevant |
| Nachladen in Deckung | Nein | Nein | Ja | Ja | Nicht in MvM |
| CP-Verteidiger streifen | 10 % | 50 % | 75 % | 90 % | Nicht in MvM |
| CP-Eroberung blockieren | Nein | 50 % | Ja | Ja | Nicht in MvM |

</div>

---

## Fazit

![TF2-Heavy-Bot zielt mit einem Minigun](assets/tf2-bot-ai-heavy-aim.png)

All das spiegelt ein bewusst gebautes Valve-System wider: vollständig deterministische Werte und Wahrscheinlichkeiten, nur nie offiziell dokumentiert. Hier sind die Punkte, die ich nach diesem Tauchgang mitnehme:

1. **„Fähigkeit" ist eine Reihe unabhängiger Schieberegler**, kein globaler Multiplikator. Reaktionszeit, Zielrhythmus und jedes taktische Verhalten skalieren getrennt, und einige (Verfolgungsrate des Spy, Backstab-Winkel in MvM) haben unabhängig von der Stufe fest verdrahtete Überschreibungen.
2. **Ein Teil davon ist wirklich fehlerhaft, nicht nur alt.** Die seit 2010 eingefrorene Liste leiser Waffen, der Cow Mangler ohne Fußtreffer-Logik aus schlechtem Grund, die Skalarprodukt-Prüfung des Snipers, die Jahre brauchte, um korrekt dekompiliert zu werden: Valves Bot-KI-Code trägt Narben wie jede 17 Jahre alte Codebasis.
3. **Du kannst all das nutzen.** Wisse, dass ein Sniper-Bot dir auf Normal keinen Kopfschuss verpasst, dass ein Easy-Pyro deine Rakete buchstäblich nicht reflektieren kann und dass ein Easy-Spy dir von Angesicht zu Angesicht ein Messer in den Rücken jagen will. Das ist kein Glück. Das ist ein Spezifikationsblatt.

Ein riesiges Dankeschön an sigsegv für den ursprünglichen Codeeinstieg, der fast all das möglich gemacht hat, an das TF2-Wiki für die Grunddokumentation zu Bot-Befehlen und Kartenunterstützung und an alle in der Community, die noch immer an einer 17 Jahre alten Bot-KI herumschrauben, um genau herauszufinden, warum sie tut, was sie tut.
