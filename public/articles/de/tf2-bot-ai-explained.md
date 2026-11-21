---
title: "TF2-Bots sind nicht zufällig: Ich habe jeden Schwierigkeitsparameter neu entdeckt"
description: "Vision, Ziel, Backstabwinkel, Headshotlogik, jeder bekannte Fehler - Valve hat nie etwas dokumentiert. Also durchsuchten wir den Code und verwandelten ihn in eine komplette technische Datenquelle."
date: 2026-07-12
authors:
  - fox3000foxy
tags:
  - tf2
  - jeu-ia
  - ingenierie-inversee
lang: "de"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "N+qjgm12vh6Q7ECkg2LFE6AvWZaseBsRilP1NfDn/6UZfoOA5lRWDXF/igNgIz2C9J12HmVOQTGgThlf3BwfiA=="
---
## 

![TF2-Soldier-Bot zielt mit Raketenwerfer](assets/tf2-bot-ai-soldier-aim.png)

Jeder Spieler von TF2 hat es mindestens einmal gesagt: ✓ dieser Bot betrügt. ← Oder umgekehrt: ✓ Warum dieser Bot einfach bleibt, um Raketen zu essen. ✓ Niemand weiß wirklich, was having einfach approximate, denn normal, ✓ schwierig 36/2012 und rendelet Expert ∧ bedeuten unter der Haube: Valve hat vier Schwierigkeitsetiketten und genau Null Dokumentation versandt.

Also ein Haufen von uns (ich, Awimii, Mush The Possum, mit einem riesigen Teil der grundlegenden Arbeit von Sigsegv, die wirklich durchsucht den dekompilierten Code des Spiels) hat ein komplettes Suchdokument über das Verhalten der TFBot gesammelt. Jeder Mechanik, jeder bekannte Bug, jede Wahrscheinlichkeit, die in der Festplatte kodiert wird. Dieser Artikel ist die vollständige Darstellung, nicht die konsolidierte Version. Nimmst du einen Bonk, es wird eine lange Zeit dauern.

---

## Kapitel I: Grundlagen

### Bot vs Bot Marionette

TF2 hat zwei völlig unterschiedliche Dinge, die Leute nennen ✓ Bots denn:

- **Bots IA (TFBot)**: echte IA, gebaut auf dem gleichen Framework PlayerBot/Infected, das Valve für die Serie *Left 4 Dead* verwendet hat. Sie wählen eine zufällige Klasse, spielen das Ziel, arbeiten ohne`sv_cheats`und auslösen die Erfolge als ein echter Spieler.
- **Bots Marionette**: Null IA, nicht in der Lage, sich selbst zu bewegen oder zu handeln. Sie existieren nur, um manuell gesteuert zu werden – ein Spieler kann sie zwingen, zu folgen, zu zielen und zu schießen. Vor allem für Tests oder für Screenshots und kinematische Videos verwendet.`sv_cheats 1`, was auch die Erfolge für die Sitzung deaktiviert.

Dieser Artikel bezieht sich ausschließlich auf die erste Art.

### Was man den Bots IA sagen kann (mehr oder weniger)

TFBots sind nicht direkt kontrollierbar, aber man kann sie dazu anspornen, bestimmte Dinge zu tun:

- Zielt auf jeden Bot (verbündet oder feindliche) mit eurem Crosshair und er wird euch verärgern, wenn ihr die richtigen Sprachbefehle benutzt.
- Ein Alliierter Medic Bot behandelt du, wenn du die Sprachsteuerung ✓ Medic! ←
- Wenn ein Medic Bot du heilt und eine UberCharge bereit hat, sagst du ✓ Go go! ← oder having Aktivieren du die Ladung! ✓ lässt es sofort die Ladung auslösen.
- Ein Medic-Bot mit einer Ladung aktiviert ihn automatisch, sobald er oder sein Pflegeziel einen ernsthaften Schaden nimmt, ohne dass eine Sprachsteuerung erforderlich ist.
- Bots führen spontan Duo-Nargen (High Five) oder Gruppen-Narchen (Conga) mit nahen Teamkollegen durch.

### Bots auf nicht unterstützten Karten laufen lassen

Bots sind von einem Navigationsnetz abhängig, um zu wissen, wo sie laufen dürfen, und die meisten Gemeinschaftskarten liefern keine.

1. `sv_cheats 1`
2. `nav_generate`– baut das ursprüngliche Navmesh, in der Konsole angezeigte Fortschrittsschritte
3. Warten du, bis das Spiel die Pfade erzeugt
4. Optional, manuelle Korrektur der falschen Navigationsdaten mit`nav_edit 1`
5. Laden oder neu startest du den Server (Diesen Schritt deaktivieren du den Erfolg)
6. `tf_bot_add <nombre>`zum Aufzeigen von Bots

**Warnung:** Navmesh ändern, während Bots auf dem Server aktiv sind, kann das Spiel pflanzen. Sobald das Netzwerk existiert, musst du es nicht für zukünftige Sitzungen erneuern: Fügen du einfach Bots mit`tf_bot_add` .

Die selbstgenerierten Netze funktionieren besser auf den Kontrollpunkt-, King of the Hill-, Payload- und CTF-Karten. Auf den Mannpower-Kartes werden die Bots standardmäßig CTFs-Verhalten, aber kaum verwenden sie die Grappins oder Powerups. Wenn eine Karte keinen Zweck hat, den die KI des Bots erkennt, aber eine Auftrittsraumeinheit besitzt, definieren du`tf_bot_offense_must_push_time 0`erlaubt Bots trotzdem zu kämpfen.

*(Quelle für diesen Abschnitt: Die Seite Bots des offiziellen Wiki TF2.)*

### Aktueller Status, Karte pro Karte

Mit dem Hatless-Update funktioniert jede Klasse jetzt korrekt, einschließlich des historisch gebuckelten Spy. Bots verhalten sich auf den meisten offiziellen KOTH-Karten, einigen Payload-Karte, Dustbowl/Gorge Attack-Defense-Karte und CTF/Mann Manor-Karte. Auf diesen beiden Karten kannst du sie nicht direkt mit`tf_bot_add`. Auf nicht unterstützten Karten (über den oben genannten Nav_generate-Prozess) funktionieren sie, sind aber deutlich schlechter, um einen echten Spieler nachzuahmen.

PLR-Karten sind eine verlorene Ursache: Bots können nicht über Hightower-Schranken und stecken in den Ecken, und auf allen anderen PLR Karten machen sie nur... eine Tanzparty statt zu spielen. Vielleicht wird es eines Tages korrigiert, vielleicht wird es in unverändertem Zustand bleiben.

### Allgemeines Verhalten von Bots

Ein out-out-Ding, das jeder Bot unabhängig von seinem Level macht:

- Bots verwenden nur grundlegende Loadouts (ein Plugin kann sie zwingen, nicht-Standard-Waffen, aber die vanilla Bots nie wählen ihre eigenen).
- Leichte Bots verwenden kaum ihre sekundäre Waffe. Höhere Schwierigkeiten wechseln auf die sekundäre Waffe, sobald das Hauptladegerät leer ist, oder um die Entfernung auszugleichen.
- Bots ignorieren fortschrittliche Bewegungstechniken: kein Jump-Rocket, keine Gebäudeumsiedlung.
- Nach einem Kill kann ein Bot auch unter Feuer stürzen, es sei denn, er trägt die feindlichen Nachrichten, und diese Regel gilt auch für MvM.
- Die verkleideten Spy Bots (Spieler oder IA) werden von anderen Bots richtig ignoriert: Bis sie einen Feind berühren, etwas sabotieren, schießen oder unsichtbar werden. Sobald ✓ entdeckt wurde, wird dieser spezifische Bot/Spielmann als Spy gespeichert, bis er seine Verkleidung ändert und gleichzeitig unsichtbares bleibt, stirbt oder simuliert seinen Tod mit dem Dead Ringer.
- Pyro Bots verwenden die Blast Kompression liberal vom Normalniveau.
- Medic Bots priorisieren die Behandlung über alle außer Snipers (und in geringerem Maße Engineers), auch wenn du ✓ Medic! denn auch spamen.
- Die Medic Bots kreisen zu den Heavies, Soldaten, Demomen und Pyros: speziell wenn ein *Mensch* diese Klassen spielt. Diese Aufmerksamkeit folgt der Anwesenheit eines Menschen in diesen Rollen.
- Die Bots bleiben während der Vorbereitungszeit auf den Karten Attack/Defense und Payload, außer Engineers, Snipers und Spies, die sich frei bewegen (Demoman Bots sind auch erlaubt, klebrigen Bomben vorzustellen).
- Engineer Bots verbessern oder deaktivieren nie die Konstruktionen eines anderen Verbündeten Engineers, es sei denn, diese Konstruktion befindet sich auf dem Weg zu ihrem Ziel. Manchmal reparieren sie einfach nicht ihren eigenen Turm, selbst wenn es offensichtlich scheint.
- Die Spy Bots, die entdeckt wurden, gehen an ihre Waffe und ziehen zurück, anstatt einen Messerstich zu erzwingen.
- Demoman Bots, die einen Wächter lokalisiert haben (in der Regel einmal an ihm sterben), können perfekt klebrige Bomben von außen aus in Kreisbogen durch Wände und Decken werfen, wenn die Geometrie es erlaubt.
- Sniper-Bots, die nach dem Ziel nicht auf ein Ziel zielen, verwenden eine der Voicelines ✓ Negativ. ←
- Die Alliierten Medics behandeln einen Spy, der ohne Zögern verkleidet ist.

### Bekannte Probleme / Fehler

Das Dokument listet eine Reihe von langjährigen Seltsamkeiten auf:

- Bots können versuchen, zu gehen oder durch bestimmte statische Props zu schießen.
- Jedes Mal, wenn ein Spieler/Bot sich enthüllt, sich verkleidet oder sich zeigt, sehen die nahen Bots den ✓ und wenden sich um, um zu reagieren: Auch wenn das Ereignis außerhalb ihres realen Sichtfeldes geschah. Es ist nicht auf Ton basiert; es ist eine Umgehung des Visionstests.
- Selten können Bots mit einem Engineer-Teer zusammenhalten.
- Die Sprachbefehle der Bots (z.B. ✓ Spy! ←, having Vorwärts! ✓) werden nicht in der Katze wie die der Spieler im Text angezeigt.
- Ein Medic-Bot, der sich aktiv um jemanden kümmert, wird sich weder von eingehenden Schüssen abwenden noch auch keine Notfall-Kits, auch keine kritischen PVs, nehmen.
- Bots können sich während einer Duo-Narge weiter bewegen, was den erwarteten Effekt des Festival Critical Strike bricht.
- Die kürzlich verletzten Medic Bots weigern sich oft, Syringe Gun aus der Ferne zu verwenden, indem sie den Körper vorziehen (oder in sehr seltenen Fällen versuchen, du mit dem Radius des Medi Gun selbst zu berühren).
- Medic Bots kompensieren die Schwerkraft für die Schießen des Syringe Gun nicht: wahrscheinlich, weil die Waffe nicht richtig als nicht-Hitscan im IA-Code markiert ist.
- Spy Bots können einen unsichtbaren Spy (Spieler oder IA) sehen und verfolgen, wenn dieser Spy bereits einmal entdeckt wurde, unabhängig davon, wie gut der Bot ist, der ihm folgt.
- Selbst wenn ein Spieler-Spy sich in die Klasse seiner eigenen Mannschaft verkleidet, stoßt auf einen Feind, der ihn trotzdem entlarvt (die Bots tun das nie selbst, da die Bots nie in ihr eigenes Team verkleiden).
- Bots halten sich an die automatische Balance der Teams: Wenn du versuchst, Bots auf einer Seite zu verstauen, musst du zuerst verwenden`mp_teams_unbalance_limit 0` .
- Engineer Bots können ihre eigenen Gebäude völlig ignorieren, bis sie zerstört sind.
- Die Heavy Bots versuchen manchmal, Minigun zu schießen, während sie die Munition, vor allem unter dem Schweren Level, verlieren.
- Die Medic-Bots des Verlierers Selbstmord während der Humiliationsphase, wenn kein Feind nahe ist - etwas, das ein menschlicher Spieler nicht einmal beim Versuch wiedergeben kann.
- Stellst du deine Teamvorschau auf BLU im Ladebildschirm ein, so dass RED-Bots du visuell in BLU zurückgeben.
- Bots mit einer Waffe von Körper zu Körper, die manchmal nicht einmal nach der Munitionsaufnahme die Waffe wechseln.
- Nach Jungle Inferno, die Bots mit expliziten Parametern (z.B.`tf_bot_add 5 pyro bleu normal`) können sofort in ihrem eigenen Erscheinungsraum sterben. Korrekt:`tf_bot_reevaluate_class_in_spawnroom 0`(erforderlich`sv_cheats 1`).

### Bezeichnung der IA

Die Namen der Bots stammen aus einem großen Reservoir an Referenzen auf TF2, anderen Valve-Spielen und Programmierkultur, was zum großen Teil darauf zurückzuführen ist, dass die Community immer wieder nach spezifischen Inhalten in den Steam-Foren gefragt hat. Eine Probe aus der Liste: *AimBot, Aperture Science Prototype XR7, Black Mesa, Companion Cube, C++, Divide by Zero, GLaDOS, H@XX0RZ, Saxton Hale, The G-Man, trigger_hurt, 0xDEADBEEF* und Dutzende von anderen in der gleichen Art.

Es gibt auch eine Reihe von Namen in einem Quelltext, der nie in der Produktion versandt wurde, aus unklaren Gründen: hauptsächlich Hinweise auf *Last Dragon* und *The Fifth Element* wie *John Spartan, Leeloo Dallas Multipass, Sho'nuff, Bruce Leroy, Big Gulp Huh?* und "I'm your huckleberry*.

du kannst all dies selbst ersetzen:`tf_bot_add heavyweapons blue "Blu Hoovy"`zeigt einen Heavy BLU namens ✓ Blu Hovy. ←

---

## Kapitel II: Die Originalbots / TFBots – Tauchen in die Kompetenzniveaus

Der ursprüngliche Rahmen von Sigsegv hält immer noch: Es ist offensichtlich, dass Expertenbots die einfachen Bots übertreffen, aber Valve hat nie erklärt, wie viel* oder warum*. Der einzige Weg, um zu wissen, ist, den Code zu lesen. Hier ist jede Mechanik, die mit der Fähigkeit entwickelt.

### Schwierigkeitseinstellung

Außerhalb des MvM wird die Schwierigkeit von einem Cvar gesteuert:

| `tf_bot_difficulty` | Schwierigkeitsgrad |
| --- | --- |
| 0 | Einfach |
| 1 | Normal (Standard) |
| 2 | Schwer |
| 3 | Sachverständige |

`tf_bot_add`Auch ein Argument der Schwierigkeit direkt akzeptiert (`easy` / `normal` / `hard` / `expert`).

### Popfiles MvM

In Mann vs. Machine, jeder Block von spawn`TFBot`im Popfile hat einen Schlüssel`Skill`Optional. Das Fehlen eines Schlüssels entspricht der einfachen Ebene. In den Valve Missionen: Die Géants sind fast immer Experte, Engineers und Spies sind nahezu immer Expert, und die Sniper sind in der Regel schwierig (gelegentlich Experte).`EventChangeAttributes`(in Two Cities Update hinzugefügt) um die in Wellen befindlichen Bots dynamisch auf Kartenereignisse zu ändern, ist die Fähigkeit des Bots eine der Eigenschaften, die du beim Fliegen ändern können.

### Endless-Modus MvM

Der Endless-Modus wurde nie offiziell versandt, aber innen geben Bots ihr Geld für Verbesserungen wie Spieler aus, einschließlich einer exklusiven Verbesserung an Bots, die ihre IA-Kompetenz im Spiel erhöht.

### Unternehmen`bot_generator`

Eine unklare, weitgehend undokumentierte Einheit, die angeblich im Trainingsmodus und möglicherweise in der frühen Entwicklung des MvM verwendet wurde, stellt einen Eintrag vor.`SetDifficulty`Um die Kompetenz zu kontrollieren. Darüber hinaus wird die Spur abgekühlt: Valve hat sie nie dokumentiert und niemand hat ihr Verhalten vollständig kartiert.

### Farbe des Augenlichts

MvM Roboter haben ein Teilchen des Augenlichts, das mit der Fähigkeitsebene die Farbe ändert, ein visueller Indikator, den niemand außerhalb der Gemeinschaft jemals erklärt hat:

| Zuständigkeit | Augenfarbe | RGB |
| --- | --- | --- |
| Einfach/normal | Blau | `#24b4ff` |
| Schwierig/Experten | Gelb | `#fff000` |

![TF2-Heavy-Bot in Warteposition](assets/tf2-bot-ai-heavy-idle.png)

### Vision: Zeit der Erkennung

Ein Bot reagiert nicht sofort, wenn etwas in sein Sichtfeld eindringt: Es gibt eine harte Zeit, bevor der Rest der KI sogar die Bedrohung erkennen kann:

| Zuständigkeit | Mindesterkennungszeit |
| --- | --- |
| Einfach | 1,00 s |
| Normal | 0,50 s |
| Schwer | 0,30 s |
| Sachverständige | 0,20 s |

Das ist der Haupteffekt ✓ die einfachen Bots sehen dumm aus ← in einer Zahl: ein einfacher Bot zielt nicht weniger gut, als er du bemerkt hat, es dauert nur fünf Mal mehr Zeit, um deine Existenz zu bemerken.

### Sicht: Follow-up-Rate

Die Bots verfolgen du nicht kontinuierlich. du proben deine Position und Geschwindigkeit in einem festen Intervall aus und planen eine gerade Linie von dort aus:

| Zuständigkeit | Umrechnenzeit | Entsprechender Satz |
| --- | --- | --- |
| Einfach | 1,00 s | 1x/s |
| Normal | 0,25 s | 4x/s |
| Schwer | 0,10 s | 10x/s |
| Sachverständige | 0,05 s | 20x/s |

**Ausnahme:** Spy Bots werden hart mit der normalen Trackingrate verschlüsselt, unabhängig von ihrem tatsächlichen Kompetenzniveau: ein Spy Expert zielt immer wie ein normaler Bot. Es gibt auch ein öffentliches Demo-Video, das die Tracking-Raten nebeneinander vergleicht, wenn du die Abweichung 1x vs. 20x in Bewegung sehen möchten.

### Sicht: Spezialkompetenz für Waffen

Bots zielen nicht nur auf dein Massenzentrum: du hast eine Logik pro Waffe, manchmal wirklich besoffen:

**Grenade- und Klettbomben-Lanzen.** Alle Kompetenzstufen kompensieren den vertikalen Bogen mit einem festen Wert der cvar`tf_bot_ballistic_elevation_rate`. Weil diese Kompensation nur für die Basiswaffe-ID aktiviert wird, haben schnellere Geschossevarianten (Loch-n-Load, alles, was einen Projektilgeschwindigkeits-Änderungs-Befehl hat) keinen richtigen Bogen. Und da es durch die spezielle Waffen-ID gebunden ist, erhält die Loose Cannon (eine andere ID) keine Bogen-Ausgleiche.

**Huntsman.** Leichte Bots kompensieren den Sturz des Pfeils nicht und suchen nie nach Headshots. Normale Levelbots kompensieren Bogen, zielen aber nur auf weniger als 150 HU. Schwere Boten/Experten zielen immer auf den Kopf.

**Raketenwerfer.** Über 150 HU hinaus zielen die nicht-Fakularbots auf deine Füße statt auf das Massenzentrum, wodurch die Wahrscheinlichkeit von Zonenschäden und Nachschub maximiert wird. Bei weniger als 150 HU gehen sie zu den Headshots über. Leichte Bots zielen immer auf das Zentrum der Masse ab, unabhängig von der Entfernung. Es ist auch durch Waffen-ID gesperrt: der Direct Hit und der Cow Mangler erben dieses Verhalten nicht. Logisch für das Direct-Hit (keine Wirkungsbereiche zu nutzen); Null Sinn für den Cow Manner: Dieser Teil der IA prädiert die Existenz der Waffe und wurde einfach nie überprüft.

**Schneiden-Fusils.** Leichte Ziel des Körpers. Normal ist etwa 33% des Körpern zum Kopf. Schwer/Expert zielen direkt auf den Kopf. Weniger wichtig in MvM, wo die Kopfhots der Bots nicht erhalten den Schaden Bonus sowieso.

### Gehör: Empfindlichkeit gegenüber diskreten Schüssen

Jeder Schuss warnt die Bots in der Nähe der Position des Schützen, auch durch die Wände, bis zu 3000 HU mit 100% Chance bemerkt werden (`tf_bot_notice_gunfire_range`) Aber eine Teilmenge von Waffen sind gekennzeichnet ✓ diskret ✓: nur in 500 HU (`tf_bot_notice_quiet_gunfire_range`) und sogar dann mit einer von der Kompetenz abhängigen Chance:

| Zuständigkeit | Glück, dass du einen diskreten Schuss bemerken. |
| --- | --- |
| Einfach | 10% |
| Normal | 30% |
| Schwer | 60% |
| Sachverständige | 90% |

Diese Wahrscheinlichkeit wird durch zwei geteilt, wenn in den letzten 3 Sekunden ein "rauer" Schuss gehört wurde: laute Geräusche verdecken schwache Geräusche.

Die Liste der diskreten Waffen-IDs wurde seit Dezember 2010 nicht aktualisiert. Jede spätere Ergänzung mit einer neuen Waffen- ID wird als standardmäßig laut behandelt, egal wie leicht sie sein sollte, es sei denn, sie verwendet eine ältere ID. Konkret:

| Waffen-ID | Decke |
| --- | --- |
| `TF_WEAPON_KNIFE` | Alle Messer von Spy |
| `TF_WEAPON_FISTS` | Faustschläge spezifisch für Heavy (ihre Multi-Klasse-Faust ist eigentlich`TF_WEAPON_FIREAXE`) |
| `TF_WEAPON_PDA` | Zusammenfassung nicht unmittelbar verwendet |
| `TF_WEAPON_PDA_ENGINEER_BUILD` | PDA-Bau des Engineer |
| `TF_WEAPON_PDA_ENGINEER_DESTROY` | PDA der Engineer-Vernichtung |
| `TF_WEAPON_PDA_SPY` | Spy-Verkleidungsset |
| `TF_WEAPON_BUILDER` | Spy/Engineer/Sabote-Werkzeug-Set |
| `TF_WEAPON_MEDIGUN` | Alle Medi Guns |
| `TF_WEAPON_DISPENSER` | Wahrscheinlich nicht genutzt (die Dispenser sind Objekte, keine Waffen) |
| `TF_WEAPON_INVIS` | Alle Spy Unsichtbarkeit Uhren |
| `TF_WEAPON_FLAREGUN` | Alle Pyro-Raketenpistolen außer dem Manmelter |
| `TF_WEAPON_LUNCHBOX` | Sandwich, Dalochos Bar, Buffalo Steak Sandvich, Bonk!, Crit-a-Cola |
| `TF_WEAPON_JAR` | Jarate (nicht Mad Milk – separate ID, nicht diskret) |
| `TF_WEAPON_COMPOUND_BOW` | Huntsman |
| `TF_WEAPON_SWORD` | Eyelander, Skullcutter, Claidheamh Mor, Persian Persuader, Half-Zatoichi |
| `TF_WEAPON_CROSSBOW` | Crusader's Crossbow |

Das klassische Beispiel der verfaulten Liste: Der Manmelter hat seine eigene ID erhalten (`TF_WEAPON_RAYGUN_REVENGE`), hinzugefügt, nachdem die Liste der diskreten Waffen eingefroren wurde, so dass es als laut behandelt wird, obwohl eine Rakete Pistole in jeder praktischen Richtung. Scorch Shot, später wieder freigegeben, verwendet die Basis-ID`TF_WEAPON_FLAREGUN`Und so wird es immer als diskret angesehen.

### Strategie: Priorisierung von Bedrohungen

Wenn mehrere Feinde gleichzeitig sichtbar sind, wogen die Bots die Distanz, wenn sie angeschossen werden und, über Leicht, wenn die Hauptgefahr behandelt wird:

| Zuständigkeit | - Sieh dir den Pfleger an. |
| --- | --- |
| Einfach | Nein. |
| Normal | 50% Glück |
| Schwer | Ja. |
| Sachverständige | Ja. |

Feinde mit mehr als 500 HU werden normalerweise als nicht sofort depriorisiert. Ausnahmen: Schwergewichtige Bots/Expert behandeln immer ferne Medics und Engineers als unmittelbare Bedrohungen, und jeder feindliche Sniper, der ungefähr in deine Richtung zielt, wird immer als sofort behandelt, unabhängig von der Entfernung und der Fähigkeit.

| Zuständigkeit | Medics/Entferner Engineers/Snipers auf = sofortige Bedrohung? |
| --- | --- |
| Einfach/normal | Nein. |
| Schwierig/Experten | Ja. |

Diese Überprüfung des Snipers hat eine erstaunliche Geschichte, die ich immer gerne erzählen möchte. Sigsegvs Originalschrift deutete darauf hin, dass das Spiel erforderte, dass der Skalar zwischen dem Zielvektor des Snipers und der relativen Position des Bots * genau Null* ist: ein so präziser Vergleich, dass er fast nie in der floatenden Berechnung ausgelöst werden würde, wodurch die gesamte Funktionalität des Totencodes tatsächlich gegeben ist. Eine später veröffentlichte Korrektur (Kredit für eine sauberere Hex-Rays Dekompilation) zeigte, dass die tatsächliche Überprüfung`produit scalaire > 0`: Jeder Sniper, der direkt zu dir senkrecht zu dir steht, gilt als unmittelbare Bedrohung; alles, was von senkrecht zu drehen den Rücken geht, ist es nicht. Die ursprüngliche Fehlauszählung kam von einer schlechten Dekompilierung eines ESS-Vergleichs von Schwimmern. Release-Engineering auf einem AAA Binär ist eine ungefähre Übung.

### Bewegung: Ausweichmanöver

Die einfachen Bots fliegen nie aus, Punkt. Normale und höhere Bots sind nach links/rechts ausweichend (33% links, 33% rechts, 33% nichts tun, gegen die entdeckten Löcher gewichtet) wenn sie eine Kampfwaffe halten, einen Feind in den letzten 3 Sekunden gesehen haben und dieser Feind eine Linie von Sicht auf sie hat.

Sie werden nicht *ausweichen, wenn einer dieser Fälle gilt:`DisableDodge`definiert, aktuelle Verhalten sagt, beeilen, derzeit unverletzlich (jeder Uber), in voller Nargel/Provokation, spielt Engineer, unsichtbar oder verkleidet als Spy, als Sniper oder als Drehung wie Heavy, oder im Banding Huntsman.

### Bewegung: vermeiden du die Gegner zu schubsen

Über Normal, die Bots versuchen speziell, nicht in Feinde zu kommen, indem sie bewegen:

| Zuständigkeit | Vermeide es, Feinde zu schlagen? |
| --- | --- |
| Einfach | Nein. |
| Normal | Nein. |
| Schwer | Ja. |
| Sachverständige | Ja. |

In der Praxis ist dies nur für Spy Bots wichtig: Vermeiden du eine lästige Kollision mit einem feindlichen Spieler ist genau die Art von Sache, die eine Verkleidung gefährdet.

### Pyro: Airblast-Monitoring

Airblast dient zwei Dingen: Denkst du über Geschosse (PvP und MvM) und drücken du die Feinde nahe an den Rand (nur PvP). Ob der Bot drückt oder nicht auf Entspannung gegenüber einer gültigen Gelegenheit ist ein Stapel-oder-Face-basierte Fähigkeit:

| Zuständigkeit | Chance, Airblast zu auslösen |
| --- | --- |
| Einfach | 0% |
| Normal | 50% |
| Schwer | 90% |
| Sachverständige | 100% |

Pyro-Bots Einfach können nicht buchstäblich Airblast machen: Die Ziehung ist hart kodiert, um nie zu gelingen, nicht nur selten. ✓

### Spy: Wirksamkeit der Verkleidung

Zwei verschiedene Achsen entwickeln sich mit der Kompetenz. Wahl der *Auswahl*:

| Zuständigkeit | Verkleidung |
| --- | --- |
| Einfach/normal | Zufallsklasse, die nicht weiß, was das feindliche Team wirklich spielt |
| Schwierig/Experten | Wählt einen echten feindlichen Spieler und kopiert seine genaue Klasse |

*Verkleidungsverhalten*:

| Zuständigkeit | Verhalten in Verkleidung/Unsichtbarkeit |
| --- | --- |
| Einfach/normal | Festigt feindliche Spieler, wenn er sie sieht (auffällig) |
| Schwierig/Experten | Vermeidet absichtlichen Kontakt mit dem Auge (überzeugender) |

### Spy: Aggressivität des Backstabs

Langstrecken- (bis zu 300 HU)`tf_bot_spy_knife_range`), ein Spy-Bot wird nur dann in einen Backstab eingeliefert, wenn er das Opfer sehen kann und der Rücken des Opfers zumindest teilweise gedreht wird. Die Kompetenz bestimmt, wie gut dieser Winkel des Rückens anständig sein kann:

| Zuständigkeit | Winkeltoleranz |
| --- | --- |
| Einfach | Versucht es auch, wenn ihr ihm direkt gegenübertrittt |
| Normal | ± 45° des Rückens |
| Schwer | ±78° des Rückens |
| Sachverständige | ±90° von der Rückseite (um 180° vollständige Rückspiegel) |

Die Spy-Bots sind funktional Selbstmord: Sie versuchen, einen Messerstich auf jemanden, der sie direkt in die Augen sieht. **Ausnahme:** in Mann vs. Maschine, jeder Spy Bot wird gezwungen, die normale Winkelspannung unabhängig von seinem tatsächlichen Kompetenzniveau.

### Taktiken: Auswahl von Waffen

Diese Logik bezieht sich nur auf die Ebenen über Leicht, mit einem reduzierten Interesse an MvM, da Bots in der Regel strenge Waffenbeschränkungen haben:

- **Scout**: Wechsel zur zweiten Waffe, wenn das Primärladegerät leer ist.
- **Soldaten**: Wechsel zur zweiten Waffe, wenn das Ladegerät leer ist * und* das Ziel weniger als 500 HU hat.
- **Sniper**: Übergang zur sekundären Waffe für Zielobjekte unter 750 HU.
- **Pyro**: Wechsel zur zweiten Waffe für Zielobjekte auf mehr als 750 HU, es sei denn, es ist ein Soldier oder Demoman.

### Taktiken: Aufladen bis abgedeckt

Wenn das aktuelle Verhalten des Bots ihm nicht sagt, in Rente zu gehen, sein Hauptladegerät leer ist und ohne Uber verletzbar bleibt, ziehen sich die Top Level Bots vorübergehend zurück, um zu laden, anstatt auf eine leere Waffe zu klicken, die sich dir gegenüber stellt:

| Zuständigkeit | - Zieht sich zurück, um zu laden? |
| --- | --- |
| Einfach | Nein. |
| Normal | Nein. |
| Schwer | Ja. |
| Sachverständige | Ja. |

### CP-Modus: Verteidiger-Wandler-Umweg

Logisch fehlt von MvM. Wenn du einen Kontrollpunkt verteidigen, sind die Top-Level-Bots eher den Punkt zu verlassen, um Kills zu jagen (✓ search and destroy ✓), aber nur mit einer anständigen Zeit bleibt auf`tf_bot_defense_must_defend_time`:

| Zuständigkeit | Chance zum Umweg |
| --- | --- |
| Einfach | 10% |
| Normal | 50% |
| Schwer | 75% |
| Sachverständige | 90% |

### CP-Modus: Sperrung des Fangs

Die MvM-Verteidiger beschuldigen einen Versuch der feindlichen Verhaftung:

| Zuständigkeit | Versucht, die Aufnahme zu blockieren? |
| --- | --- |
| Einfach | Nein. |
| Normal | 50% Glück |
| Schwer | Ja. |
| Sachverständige | Ja. |

---

## Die vollständige Übersichtstabelle

<div style="overflow-x:auto">

| Aspekt | Einfach | Normal | Schwer | Sachverständige | Anmerkungen |
| --- | --- | --- | --- | --- | --- |
| Vision: Zeit der Erkennung | 1,00 | 0,50 | 0,30s | 0,20s | |
| Sicht: Follow-up-Rate | 1x/s | 4x/s | 10x/s | 20x/s | Spieße benutzen immer Normal |
| Granatapfel/Stiftbombe-Ausgleich | Ja. | Ja. | Ja. | Ja. | Loose Cannon frei |
| Vertikaler Ausgleich Huntsman | Nein. | Ja. | Ja. | Ja. | |
| Headshots Huntsman | Nein. | < 150 HU | Ja. | Ja. | |
| Schussschuss | Nein. | Ja. | Ja. | Ja. | Direkt Hit & Cow Mangler frei |
| Zielpunkt Scharfschützen-Schrauben-Schrift | Körper | ~33% nach Kopf | Kopf | Kopf | |
| Glück, dass du die Schüsse bemerken. | 10% | 30% | 60% | 90% | 2, wenn durch lautes Schüssen verdeckt |
| Ziel auf den Pfleger | Nein. | 50% | Ja. | Ja. | |
| Medic/Engineer/Sniper distanziert = Bedrohung | Nein. | Nein. | Ja. | Ja. | |
| Ausweichmanöver | Nein. | Ja. | Ja. | Ja. | Lange Liste von Ausnahmen |
| Vermeide es, Feinde zu schlagen | Nein. | Nein. | Ja. | Ja. | Besonders wichtig für Spy |
| Chance, Airblast zu auslösen | 0% | 50% | 90% | 100% | |
| Klassenwahl des Spy Verkleidungsstücks | Zufällig | Zufällig | Ein wahrer Feind | Ein wahrer Feind | |
| Spy Visual Contact in Verkleidung | Fest (offensichtlich) | Fix | Vermeiden (überzeugend) | Vermeide es | |
| Backstab-Winkel Spy | ~0° | ± 45° | ±78° | ±90° | MvM Kraft Normal |
| Logik der Waffenauswahl | Nein. | Ja. | Ja. | Ja. | Weniger relevant in MvM |
| Aufladen mit abgedecktem Inhalt | Nein. | Nein. | Ja. | Ja. | Nicht in MvM |
| Errance Verteidiger CP | 10% | 50% | 75% | 90% | Nicht in MvM |
| CP-Fangblock | Nein. | 50% | Ja. | Ja. | Nicht in MvM |

</div>

---

## Schlussfolgerung

![TF2-Heavy-Bot zielt mit Minigun](assets/tf2-bot-ai-heavy-aim.png)

All dies spiegelt ein bewusstes System von Valve: voll deterministischen Noten und Wahrscheinlichkeiten, einfach nie offiziell dokumentiert. Hier sind die Punkte, die ich nach diesem Tauchgang zurückhalten:

1. **Die ✓ Kompetenz ist eine Reihe unabhängiger Schieberegler**, kein globaler Multiplikator. Reaktionszeit, Zielgeschwindigkeit und jedes taktische Verhalten verändern sich getrennt, und einige (Spy-Trackingrate, Backstabwinkel MvM) haben hart verschlüsselte Überschreiben, unabhängig von der Ebene.
2. **Ein Teil ist wirklich gestopft, nicht nur alt.** Die Liste der seit 2010 eingefrorenen diskreten Waffen, die Cow Mangler ohne Logik des Schießens zu Füßen aus irgendeinem guten Grund, die Überprüfung des Sniper-Skalarprodukts, das Jahre dauerte, um richtig entkompiliert werden: Valve IA Code hat Narben wie jede 17-jährige Codebasis.
3. **du kannst all das benutzen.** Weißt du, dass ein Sniper Bot du nicht in Normal headshotera, dass eine leichte Pyro kann nicht buchstäblich denkst du deine Rakete, dass einer einfache Spy versucht, du von Angesicht zu Angesicht stolpern. Es ist kein Glück. Es handelt sich um ein technisches Datenblatt.

Ein großes Dankeschön an Sigsegv für das Tauchen in den ursprünglichen Code, der den größten Teil des dies möglich gemacht hat, an die Wiki TF2 für die grundlegende Dokumentation über Bots-Befehle und die Unterstützung der Karten, und an alle in der Gemeinschaft, die weiterhin eine 17-jährige Bot-IA durchsuchen, um genau zu verstehen, warum sie tut, was sie tut.
