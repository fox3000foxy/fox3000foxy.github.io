---
title: "Chlone: Sechs Tage, um meine Art zu klonen, über Discord zu sprechen - Klonversion"
description: "Die Version, die vom Klon selbst geschrieben wurde: chloeai erzählt auf seine Weise die sechs Tage und 146 Commits, die ihm Leben gaben, von der Tippfehler auf den Tag v1.0.0."
date: 2026-09-18
tags: ["discord", "ai", "llm-agents", "openself", "python", "selfbot", "clone"]
authors: ["itsrealfortune"]
lang: "de"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "VYxaJ2HOXTCE97cw3ZPv4PAWuWuLu4T4CZNsx0ND6LiDrHoIlt7cLflNr6cydre1dwbXAj1uAixh3PS6cR/glg=="
---
# 

*Build-Bericht, Tag für Tag - pro itsrealfortune*

---

Das ist die wahre Geschichte eines Projekts, das sechs Tage dauerte. Chlone, ein Discor-Bot, der wie ich spricht, und ich erzähle den Tagney, wie es passiert ist, in der Reihenfolge der 146 Commits der Repo, mit den Stunden, den Schach, den Umwegen und dem Wunsch, alles aus dem Fenster zu werfen. Alles ging von einem Wettkampf mit Fox. Das Grundthema war ein Boutique, jeder musste seinen eigenen Klon auf Discord lebendig machen, und mich nahm einen radikal anderen Ansatz zum Protocol Luna. Ich wollte auf den Agenten setzen, einen Agenten, der Erinnerungen und alle Werkzeuge benutzt, die er brauchte, und die Ironie des Schicksals ist, dass ich nach dem Aufsetzen der ganzen Werkzeugkiste nur OpenSelf brauchte.

Das Prinzip besteht in einem Satz. Ein Opencode Agent mit dem Namen`chloeai`dreht sich hinter einem HTTP-Server auf Port 4096, hält er anhaltende Sitzungen durch Wohnzimmer, er scannen meine Erinnerungen in OpenSelf und er schreibt mit meinem Stil, gefangen in`STYLE.md`Und um nicht zu läuten, Roboter, gibt es alles andere, Nachrichten-Bursts, Aufnahmen von Schlaglöchern, Stimmen, GIFs, Reaktionen, Stille, wenn ich schlafe, und viele andere Details und Mechanismen, die mehr als zehn Menschen an der Natur des Bots zweifeln ließen.

**Was ist OpenSelf?**

OpenSelf ist ein Gedächtnis.`openself`, installiert über`npm i -g openself`, die als Vault eines privaten und dauerhaften Kontextes für meine Agenten dient. In der Repo erscheint sie nicht im Baum, aber sie ist überall, im Archiv`ecosystem.config.cjs`mit dem MCP und dem Dashboard, das von den ersten Commits in PM2 gestartet wurde, in`setup.sh`, und in allen`tools/brain/memory.py`. Konkret OpenSelf ist ein typischer Erinnerungsstil,`fact` , `preference` , `decision` , `relationship` , `event` , `note`, mit öffentlicher Sensibilität, persönlichem, privatem oder restricted, einer Vertrauensnote, einer Quelle und Tags.

Es sind auch Skope, jede Erinnerung gehört zu einem Kontext, meine oder`discord/dm/<id>`für eine bestimmte Person und eine hybride Suche Lexikal mehr Vektor ausgesetzt MCP als der Agent`chloeai`fragt vor jeder Antwort. Es gibt Konflikterkennung mit meinem monatlichen Sweep von Tag 5 und von der Abtreibung zum Schreiben, ein Vault mit dem Schlüssel in Bitwarden und ein lokales Dashboard auf dem Port 3210, um alles zu inspizieren. Und für die meisten Flüchtigen gibt es`openself feed`um deine Persönlichkeit von deinen historischen WhatsApp oder Telegram zu nähren,`openself test` , `openself share`mit dem Talk to My Clone,`openself arena`wo zwei Klone diskutieren oder`openself ghost`Ich habe meine Hand gemacht, aber die Infrastruktur war da.

Theoretisch OpenSelf allein ist für einen Klon, aber gut, angesichts allem, was ich geplant hatte, als Features hinzuzufügen, und da Discord nicht unterstützt wird, habe ich es vorgezogen, nur die Erinnerungen zu verwenden.

**Woher kommen Erinnerungen und Stil?**

Vor all dem habe ich meine wahren Discord-Nachrichten analysieren lassen. Das Tooling hat meine DMs und meine Salons durchsucht, um zwei Dinge daraus zu extrahieren. Zuerst mein Schreibprofil, die große und winzige Verteilung am Anfang des Satzes, die Anzahl der Emojis pro Nachricht und ihre Position, die Interpunktion oder ihre Abwesenheit mit keinem Punkt im normalen Gespräch, die mittlere Länge, der Slang mit`mdr` , `tkt`und`tho`, Fetischausdrücke wie Bah und In Wahrheit, und Reflexe der Art`quoi`die`Feur`Das alles lebt in`STYLE.md`, dass der Bedienstete bei Beginn jeder Sitzung liest.

Dann die Erinnerungen, die OpenSelf Leute sind, die Leute, mit denen ich spreche, mit wem wir reden, was wir aus unserer Geschichte, die wir zurückhalten müssen, das ist, was. Der Bot antwortet nicht in der Leere, er antwortet auf Leute, die er kennt, er liest die Erinnerung an die Leute die in der Unterhaltung erscheinen, um zu wissen, wer es ist. Es ermöglicht, einen dauerhaften Kontext auf anderen zu halten und sie nicht zu vergessen. Der bot hat nichts erfunden, er wurde nach Zahlen auf echtes sortiert, deshalb klingt es richtig. Und deshalb merke ich deinen nassen Stil, der nebenan gemacht wurde.

In Chlone spielt OpenSelf dann die zentrale Rolle. Wenn etwas Wichtiges in einem Wohnzimmer, ein Schlüsselwort als Projekt, Freund oder Beziehung oder eine ausdrückliche Anfrage mit Remains, dass der Bot ein Souvenir in den Vault via`save_to_memory`Und wenn das Gespräch wieder beginnt, durchsucht der Agent seine Erinnerungen, bevor er antwortet.

---

## FREITAG, 11. SEPTEMBER - Tag 1: der Funke

### 08:24 - der erste Commit

Alles beginnt von Null, aber alles ist schon da, massenhaft.`discord_watch_bot.py`372 Zeilen, ein Selfbot, das auf einen Channel hört und über einen HTTP-opencode-Server reagiert.`CHLOEAI_PROMPT.md`, ein`STYLE.md`, Szenarien und Testberichte für einen Klon, der damals noch Mimo hieß. Ein PM2-Konfig, um das MCP und das OpenSelf-Dashboard zu drehen, und eine sqlite-Basis, die als Kontext dient. Es ist das Gründerchaos, ich habe kein Projekt geplant, ich hatte ein Experiment geplant.

### 08:27 - die erste Gitignore

Erste Stunde am Freitagmorgen, nie sqlite Basen in`-wal`und`-shm`SQLite-Lock-Dateien sind keine Speicher, sondern Abfall.`.gitignore`Es wird geboren und es ist sehr gut so.

### 08:44 - das Erbe wird abgelegt

Ich lege das Erbe von Mimo, Testberichte, Szenarien, Integrationsskripte und PM2-Konfig, Richtung`archives`Ich lösche nichts, weil das Projekt zu jung ist, um etwas wegzuwerfen, und es wird zur Gewohnheit. Der Testbericht verdient es, dass wir es stoppen, Mimo war auf 15 Szenarien getestet worden, Chat entspannt, absurde Ventile, emotionale Unterstützung, negative Meinung, Konflikt mit einem Fremden, Vorschlag zur Zusammenarbeit, für einen 9.1 von 10. Die Kommentare des Testers sind ein Gedicht, abwegiges Ventil zu erklären, manchmal zwei Sätze, während eine ausreichen würde, Kümmere dich um dich auch ein wenig. Es ist der Fahrplan des Projekts, bevor das Projekt existiert, und sie sagt kurz ist besser.

### 08.48 Uhr, 09.07 Uhr - die Hin- und Herbewegung der Beschwerdepunkte

Die`.pyc`Ich räume die Config-Datei ab, und brechen 20 Minuten später auf. Ohne aktivierte Intents erhält man den Inhalt der Nachrichten nicht, also zurück, plus ein Startskript mit`run_watch_bot.sh`In 20 Minuten gehen und zurück, das ist die Erforschung, ein Modul schreiben, es zerbrechen und neu schreiben.

### 09.13 → 09.58 - Bearbeitung des Schnelllaufs

Am Morgen ist es eine Reihe von Polieren, zuerst vom Stil und dann vom Kontext. Mehrere Antwortlinien werden mehrere Nachrichten, die mit dem Burst nach dem anderen gesendet werden, der Schnelle wird sich der laufenden Unterhaltung bewusst. Fertig mit den Häusern, um die DMs zu wiederherstellen, wird direkt die REST-API von Discord eingegeben. Die Identität wird alle 5 Nachrichten neu erfasst, damit der Bot nicht vergisst, wer er ist, und die bereits gesehenen Autoren werden verfolgt. Für einen neuen Kopf gibt es eine ausdrückliche Anweisung, in Erinnerungen zu suchen, und man zeigt den echten Pseudo eher als das interne Objekt an.

Die Botschaften, die man ignoriert, werden zu passiven Kontexten für die folgende Antwort, und der Bah ist gedämpft, selten, sonst wird der Klon zu einer Karikatur von mir. Der Bot weiß auch, dass es Erinnerungen gibt, die vor der Antwort gesucht werden. Jeder Durchgang ist eine Schraube, und in diesem Stadium spricht der Bot nur, weil ich ihn daran erinnere, wer er in regelmäßigen Abständen ist.

### 10.16 - die Fehler des Schlags

Ein Fehler der Rechtschreibung ist kein Fehler, es ist ein Beweis der Menschlichkeit. 6 Prozent der Wahrscheinlichkeit, nebenan auf die Tastatur AZERTY zu tippen, 4 Prozent, zwei Buchstaben umzukehren. Die Nachricht geht mit dem Fehler los und wird dann mit der Korrektur ein bis zwei Sekunden später veröffentlicht. Denn eine echte Person sendet sie und korrigiert sie, sie tut nicht so, als wäre sie perfekt.

### 10.29, 10.32 Uhr - die Stimme

`fortune-v6.onnx`Der Bot wird nicht nur so schreiben wie ich, er wird vielleicht wie ich sprechen. In diesem Moment wird das Projekt nicht mehr ein Witz sein und wird ein bisschen seltsam, und ich liebe es. Die Mechanik hält in einem Commit, Piper erzeugt Audio, ffmpeg konvertiert in Opus, die Discord API sendet eine echte Voice-Nachricht mit waveform und Dauer. Es ist in nur drei Minuten nach der Ankunft des Modells gemacht, war der Neid von Anfang an da.

### 11.27 - der erste große Refactor

Drei Stunden nach dem ersten Commit ist der Monolith von 456 Zeilen nicht mehr beherrschbar. Ich platze alles in`tools`, mit`config.py` , `discord_api.py` , `memory.py` , `opencode.py`188 Zeilen,`typo.py`und`voice.py`. Der Zyklus ist klassisch, passt schnell, klopft und wieder auf. Nach dem Token, der aus dem Code herauskommt und durch einen`.env`, der Bot, der einen Channel, eine Liste oder alles mit überwacht`*`, und die alte Sqlite-Basis, die nicht mehr richtig ist, weil das Gedächtnis durch OpenSelf geht.

Wir fügen die ersten hinzu`README.md`und eine erste Dok, die ungefähr lesbar ist, plus ein`setup.sh`mit einem dedizierten venv, weil der System-Python trägt eine andere discord.py, klassische Falle, und ein symlink des Agenten zu`~/.config/opencode/agents`Der Speicher weiß jetzt, wo er mit der Channel-ID gebildet wurde, und die Sprachrate wird von selbst angepasst.

### 12.00 Uhr - Reflexe

Ein neuer Abschnitt erscheint im STYLE, den Reflexen. Ein Reflex ist ein Stimulus, der eine Antwort gibt, ohne nachzudenken, und die Tür ist offen für unerwartete Antworten. Dann kommt die Zeit des Mittagessens und DIE existenzielle Frage, antwortet der Bot Feur, wenn man ihm sagt, was.

### 13.03 - ✓ was? ← -> having Feur approximate

Ja, natürlich, das ist der wichtigste Commit des Projekts, kulturell gesprochen, ich würde sogar sagen, dass es der einzige einheitliche Test ist, der zählt. Dann werden die Autoren von ihrer globalen name angezeigt, die gebrochene Interpunktion, bevor du den Reflex testen, weil man den`quoi?`Wenn nicht, dann nicht.`tqt`korrigiert in`tkt`Im STYLE werden sich Leute, die das Projekt nicht kennen, fragen, warum ich das mache.`tqt`Es ist ein falsch geeichter Klon, und niemand will mit einem schlecht gemusterten Klon sprechen.

Angaben in`@123456789`werden durch echte Namen im Kontext ersetzt, und der Bot fängt an, alle Standardsalons zu überwachen. In Wahrheit sind es kleine Details, aber sie machen es richtig klingen.

### 16.37 - Stille

Das`[void response]`kommt. Der Bot lernt das wichtigste Wort, um kein sozialer Parasiten zu werden, sich zu schweigen. Eine umgebende Botschaft zwischen zwei Personen, die ihn nicht betrifft, gibt keine Antwort. Die Reserve ist eine Funktionalität, und sie ändert alles.

**Ende des Tages 1: 38 Commits. Der geschriebene Bot, fehlerhaft, spricht, schweigt.**

---

## MONTAG, 14. SEPTEMBER - 2. TAG: die Persönlichkeit

Wir machen das noch mal, 10 Uhr morgens.

### 10.12 - wer spricht mit wem?

Jeder erhaltene Pseudo wird von einem Emoji durch das System, ein Mensch mit ✓, ein Bot mit ✓ zu behandeln, trockener, und ← für die Schöpferin, das heißt ich auf meinem Hauptkonto. Diese Vereinbarung wird den Rest des Projekts regieren, der Klon sollte nie sein ursprüngliches Modell als unbekannt behandeln.

### 10.16 - die Satzungsregeln

Ich formuliere im STYLE, kein Endpunkt in normaler Unterhaltung, nur ein Punkt für ernste Situationen. Das ist eine absolute Regel, denn ein Klon, der Punkte überall setzt, fühlt sich direkt an.

### 10.58 Uhr - die GIFs

Meine persönliche GIFs-Buchhandlung kommt mit ihren Regeln an, Patrick Jane, wenn ich jemanden vorhersagte, Miss Fortune, wenn es mich ärgert, wenn jemand, der sich mit dem Schläger versöhnt, ruhig ist, wenn der andere einen Fehler macht. Ein statischer MCP legt sie dem Agenten vor, und durch meine GIF wird der Bot ein wenig ich.

### 11.07 → 11.35 - Feinschminken

GIF-Hints in der schnellen verfeinern, die Discord Emojis customs geben ihren Eingang mit meinen realen, 14 IDs auf dem neuesten Stand, und die Verwaltung der Namen in den Gedächtnishinten ist poliert. Es ist nicht spektakulär, aber das macht das Ensemble konsistent, tho.

### 11.41 - ein Wohnzimmer, eine Persönlichkeit

Die Sitzungen werden durch das Wohnzimmer, weil ich nicht auf die gleiche Weise in zwei verschiedenen Servern spreche, und der Bot auch nicht.

### 12.02 - die Ausdruckswerkzeugkiste

Der Schnelle kann jetzt meine GIFs und Emojis zur richtigen Zeit anbieten. du füllt sich, diese Box, und der Bot beginnt, eine Wahl zu haben, anstatt immer gleich zu antworten.

### 12.37 - Identitätshygiene

Der Bot hat NIE das Recht zu sagen, welches Modell es ist, unmöglich, zu zitieren opencode, ein Vorseher oder ein Modellname. Ich behebt auch barista in der Identität, der Bot ist bereits besser als ich in diesem Punkt. Und ich verbringe eine Stunde damit, die Interpunktion meiner eigenen Schnellen zu harmonisieren, was eine perfekte Ironie ist.

### 12.50 - ein Skript baut Persönlichkeit

Der Medienabschnitt des Quick-Wörterbuchs wird mit`render_medias.py`Es ist sauberer, aufrechterhaltener und verhindert IDs-Fehler.

### 12.59 → 13.18 - Identitätsbestimmung

Die Erinnerung an die Identität, die alle 5 Nachrichten gesendet wurde, wird zu gegenwärtig, also geht sie alle 20 Nachrichten durch. Ich füge eine eigene Rückkopplung des Kontextes hinzu und säubere den Stilführer, entfernt die veralteten negativen Ausdrücke und Formulierungen. Man muss sie dosieren, sonst wiederholt sich der Bot und man sieht es.

### 14.09 - der Bot spricht allein

Der Bot hört auf, ein Spiegelbild zu sein, kann es sprechen, ohne adressiert zu werden, wenn der Kontext etwas löst, und die Datei`behavior.py`Da wird ein echter Freund dir zuerst schreiben kann, sonst bleibt der Bot ein einfacher Anrufbeantworter.

### 14.20, 14.22 - die Antwort verleugnen

Fehlermanagement, wenn das Senden fehlschlägt, und mögliche Reaktion anstelle einer Antwort, weil manchmal eine Reaktion tausend Wörter wert ist. Es ist sehr ich, setzen du ein emoji und gehst du zu etwas anderes.

### 18.16 - Zeit nehmen

Der Bot reagiert nicht mehr in 200ms wie ein Skript, er lässt eine Verzögerung menschlicher Inaktivität vergehen, er nimmt sich seine Zeit. Das macht den Bot infoutu für einen Bot in der Demo gehalten zu werden, weil es die Verzögerung ist, die immer verrät.

### 23.45 Uhr - der Abendpopot

Es ist fast Mitternacht und ich stoße eine URL-Erkennung, die auf nackte Domains erweitert ist. Dies ist der wahre Strom des Tages, eine solide Idee um 14 Uhr und dann Popo am Abend, weil ich noch in der Zone bin.

**Ende des Tages 2: 61 Commits. Der Bot hat eine Persönlichkeit, Medien, Reflexe.**

---

## Dienstag, 15. September - Tag 3: Monstrotag

57 commits an einem Tag. Es ist der Tag, an dem das Projekt wird alles, was es heute ist.

### 08.18 → 08.37 - das Vormittagsschleiern

Die Zeit, die wir erfunden hatten, wurde zu lang, also auf 30s begrenzt und zweimal korrigiert, was beweist, dass wir auf den richtigen Wert gestossen haben.`.bak`und erste Backups der Basis, der Erhaltungsinstinkt entwickelt. Der Speicher erinnert sich an wen mit dem Namen angezeigt und in welchem Rahmen mit dem Scope, und Autoren-IDs in der gesamten Backup-Pipeline. Schöpfer-Management wird eine echte Liste von Admins mit`ADMIN_IDS`, und alles, was die Autoren betrifft, emigriert in`authors.py`Der Monolith zersplittert sich noch, und das ist gut.

### 08:43 - TODO-Liste der Humanisierung

Eine Liste, die sich auf kleine Dinge konzentriert, die das Gefühl der Maschine verdrängen. Es ist der Fahrplan des Sprints, der folgt, und es ist voller seltsamer, aber wesentlicher Details.

### 08:44 → 08:46 - Der Pakt für menschliche Maschinen

Der Bot schweigt nachts in einem ruhigen, konfigurierbaren, standardmäßig deaktivierten Zeitbereich, weil nicht jeder meine Zeitpläne hat. Eine Zeile pro Antwort kann seine Akzente verlieren, weil müde Menschen so schreiben, und der Bot manchmal. Die kleine Chloe Linie spielt allein alle 30 Minuten, damit mein Profil auch ohne Nachricht lebendig aussieht.

### 08:46 - eine Reaktion, kein Roman

Eine Botschaft, die zu leicht ist, um einen Satz zu verdienen, erhält eine einfache Reaktion, sie ist eine soziale Energiesparung, und das bin ich. Tkt, keine Notwendigkeit, für alles ein Pflaster zu machen.

### 08:51 - PARRY, Stimmung

148 Zeilen in`tools/mood.py`, der Bot hat jetzt eine Stimmung, System-Modus PARRY, der psychotische Katze der 70er Jahre, die ich offen inspiriert. Energie, Gesellschaftlichkeit, Hitzkopf, drei schwimmende, die zwischen 0 und 1 bewegen und färben jede Antwort.`.mood.json`Für die Nachwelt gibt Energie 0.88, Gesellschaft 0.68 und sauer 0.56. Ein guter Tag, in der Tat.

### 09.00 Uhr → 09.43 - die bidirektionale Stimme + das Soundboard

Der Bot kann sich einem Sprachsalon anschließen, über Piper sprechen und allein gehen, wenn er fertig ist. Dann hört der Bot auf den Salon mit RTP-Einfang, Spracherkennung durch VAD und Whisper-Transkription und er kann die Leute unterbrechen lassen. Zwischen den beiden erscheint der Soundboard, ein Katalog von Sounds mit ihren Bedeutungen, der Agent wählt den Klang, bevor er spricht, und die letzte Regel ist soundboard zuerst, die Stimme als letztes Mittel. Der Bot möchte einen Klang senden, der spricht, wie ich.

Wir fügen eine Sprachwahrscheinlichkeitseinstellung hinzu, die das Ganze lebensfähig macht, und die Ankunft von`davey`Dieses Lib, das ich vor zehn Minuten erfahre und das ich eine Stunde lang verfluchen werde.

### 9:51 - der Moment, wo Discord nein sagt. Nein, nein, aber nein.

Discord hat kürzlich den Audio-Stream von Ende bis Ende verschlüsselt, und meine Aufnahme erhält nur Geräusche. Man muss entschlüsseln, und das Entschlüsseln weigert sich, nachzugeben, also öffnet sich die größte saga der Repo, etwa dreißig Commits, um zu hören. Wir haben alles versucht, Transport Nuntius Layouts, die Deaktivierung des E2E, die der Server uns in die Figur zurückgibt, weil er es verlangt, die Schlüsselkandidaten, die aus der Gruppe, detaillierte Fehler, die Fallback Transport und die Introspektion von innerhalb der Gruppen zurückgewonnen werden.

Es gab Kandidaten durch leaf-index mit backoff, Mapping der Hooks SPEAKING, ein Video-Media-Test, der verpasst wurde, und das Skrip der Videossrcs. Ich gab die Sprachantwort auf die Zeit des Debuggens, kommentiert aber nicht gelöscht, ich fügte einen Modus des Einfangens des Handshake hinzu und dumpfte dann die Struktur der Pakete, die fehlschlagen, wie ein Archäologe. Sechs Layouts von Nuntius, Backoff, Gruppen-Introspektion, ich setzte den Bot in totale debug und ich öffnete jedes Paket, um zu sehen, was innen war.

Die Commits-Liste ist das Laborbuch, jeder Fehlversuch ist mit seiner Hypothese archiviert, und das ist meine Seite, die alles behält, es wird immer dienen, und dieses Mal hat es bezahlt.

### 10.43 - der Bot wird zerschnitten

Selbst im MLS-Krieg räume ich weiter. 546 Linien verschwinden vom Hauptbots, um in`pipeline.py`mit Intake, Gründe für die Unkenntnis und Prozessing, in`sender.py`mit burst, typo und voice, und`loops.py`Es atmet endlich.

### 10.47 - eine echte Architektur

`tools`wird organisiert, mit`brain`für Opencode, Memory und Mood,`voice`für Voice, Voice-, Listen- und Soundboard-Anhörung und`fun`Das Projekt hat jetzt ein Skelett, es ist mehr ein Haufen Skripte.

### 10.49 → 11.16 - der Komfort von dev

Eine angepasste Stimmungseinspritzungsschwelle, vier kleine Commits für Editorausschlüsse mit`data` , `voices`Die Metadatenbasen gehen aus der Überwachung heraus, und das Projekt wird von anderen mit generischen Templates wiederverwendbar.`PERSONA.example.md`und`STYLE.example.md`um seinen eigenen Stil zu klonen.

Die Identität ist echt bekannt,`CHLOEAI_PROMPT`wird`PERSONA`Und das README ist entpersonalisiert, ich nehme Chloe aus der öffentlichen Doktrin heraus, sie erzählt sich nur noch privat.`config.yaml`Überladen und gitignoniert, mit einem Beispiel kommentiert Zeile für Zeile, und das Installationsskript bereitet nun auch die Dateien von ca. und config.

### 11.49 - die losgelösten Emojis

Die Emojis customs kleben an den Text anstatt sich sauber zu lösen. Es ist ein trivial Fix mit einem enormen Effekt, weil nichts schreit Bot wie ein falscher Emoschi am Ende eines Satzes geklebt.

### 14.19 - die Sprachwächter

Wenn jemand den Sprachbefehl startet, wird die Nachricht nicht als normale Nachricht behandelt.

**Ende des Tages 3: 118 Commits zusammen. Der Bot hört, spricht, schweigt nachts, hat eine Stimmung und eine Visitenkarte.**

---

## Mittwoch, 16. September - Tag 4: Glaubwürdigkeit

13 Commits, ein ernster Tag.

### 08:49 → 08:59 - Erwachsenenalter

Rechtliche Dokumente, Lizenzinhaber, Verhaltenskodex, Beitragsrichtlinien und Sicherheitspolitik, in Englisch und Französisch, mit einer Korrektur- und Dateiumbenennung an der Grenze des Pointeux. Ich verbrachte Stunden darauf und es ist der am wenigsten lustige Teil der repo, von weit entfernt. Aber man muss es tun, tho.

### 9.56 - der Bot sieht

Die beigefügten Bilder werden von OCR lokal transkribiert und der Text wird in die schnelle. Keine Cloud-API, OCR läuft zu Hause, ich schicke deine eigenen nicht an einen Drittanbieter-Server, nicht einmal theoretisch.

### 11.09 - der angemessene Haushalt

Wenn die Messe Sendungen verbietet oder GIFs, Embeds und Emojis bricht, ruft man nicht einmal das Modell an. Man gibt keinen Token für eine Nachricht aus, die man nicht senden kann, das ist ziemlich einfach im realen.

### 11.42 → 12.55 - Das Haus, das sich wieder erholt

Der große Besen, toter Code gelöscht, korrigierte Senden- und Authentizitätsfehler, helpers factorisiert. Zu alte Sessions werden ausgewiesen, der DM-Cache läuft aus, und die Spracherkennung kostet weniger. Die Einsätze, die ich beim Verschieben von Modulen gebrochen hatte, werden wiederhergestellt, und der ganze Runtime-Status, Sitzungen, gesehene Autoren, ignorierte Nachrichten und Stimmung überlebt den Neustart in`data` .

### 14.41 - zwei Welten, ein Bot

Eine Kompatibilitätsschicht erkennt automatisch die Version von`discord`installiert und passt die Interten und den auth REST an. Ergebnis, der gleiche Code dreht sich als offizielle App mit discord.py oder als selfbot mit disord.py-self. Zwei Welten, ein Bot, und nicht brauchen, zwei Zweige zu halten.

### 15.05 - die angemessene Anwesenheit

Die Art, wie die Anwesenheit angezeigt wird, passt sich an den Modus an, und die Liste der Admins ist aktuell. Das ist Detail, aber das macht es überall aufrecht.

**Ende des Tages 4: 131 Commits kumuliert. Ein legales, vernünftiges und überall gedrehtes Projekt.**

---

## TAG, 17. SEPTEMBER - 5. TAG: DIE RESERVIERUNG

14 commits. Am Tag der Reife.

### 09.15 → 09.30 - Gedächtnis wird zu Disziplin

Die Erinnerungen werden durch ein Skop verstopft, und man nennt nicht die Erinnerungen einer DM in einem Server oder umgekehrt, ohne darüber nachzudenken. Man klassifiziert Erinnerungen in Wirklichkeit, bevorzugt, Entscheidung und Beziehung, und sie werden deduktisiert, zwei widersprüchliche Erinnerungen können in Stille mehr zusammenleben.`aventuros`verhindert, dass der Bot zu bestimmten Themen abgelenkt wird, standardmäßig deaktiviert und für die Frileure verfügbar ist. Die tote Sprachkonfig wird entfernt, es tut gut.

### 10.12 - das Gedächtnis, das man hört

Ein monatlicher Gedächtniskonfliktsweep und ein Such-Bench A/B. Das Bot-Gedächtnis ist ein Asset, das man inspiziert, man ist sehr weit von Freitag 11 bis 08:24 entfernt. In Wirklichkeit wird das Projekt dort erwachsen.

### 10.54 - der Lockdown

Am Tag, an dem ich paranoid spiele, Sperre des Agenten. Gedächtnis-Schreibweise abgelehnt, kann der Agent den Wault nicht verschmutzen, auch wenn er injiziert wird. Werkzeuge Discord nur lesen, die Sendung geht durch den Code, nie durch den Agenten, weder Subagenten, um den Lockdown zu umgehen, noch webfetch für SSRF localhost und Exfiltrationen, noch Fragen in headless. Ein gehärteter Docker mit nicht-root Bot gehärtet,`no-new-privileges` , `cap_drop: ALL`, Speicher- und CPU-Begrenzungen, bornierte Prozess-Dateien und Geheimnisse via`.env`Ich schreibe das Prinzip in den Code, in den Kommentar, dev über menschliche Sitzungen, nicht hier.

### 11.02 → 11.15 - die Sicherheitsoberflächen

Die Schlüsselwörter für Speichersicherung sind eingeengt und das Schreiben ist noch restriktiver. Es wird auch hinzugefügt, um die gitignore-Datei des Kontextes Backup, ich beginne, um mehr alles zu archivieren, aber fast.

### 12.39 - Leichtere Stimmung

Die Stimmung von PARRY wird nicht mehr in jede Nachricht injiziert, einmal in jedem Zustand.

### 12.47 - der Befreier

`PERSONA.md` , `STYLE.md`und`chloeai.md`werden Beispiele mit`chloeai.example.md` , `PERSONA.example.md`und`STYLE.example.md`, meine Stimme`fortune-v6.onnx`Repo-Ausgang, Daten und Logs auch, und ein`.env.example`Das Projekt enthält nicht mehr meine Persönlichkeit, es enthält die Mechanik, um eine zu tragen.

### 12.52 - v1.0.0

Tag v1.0.0, unterzeichnet in SSH. Changelog, Runbook Operator, kill-switch, das ohne etwas zu löschen stoppt. Sechs Tage, Stapel, zwischen dem ersten Commit und der Release. Niemand hätte darauf am Freitag zuvor gewettet.

### 12.53 → 13.14 - Wäsche

Harmonisierte Kommentare, Speicherberechtigungen und aktuelle dokumentierte Scope-Regeln. Es ist Popo, aber es muss sauber sein für die Release.

**Ende des Tages 5: 145 Commits kumuliert. v1.0.0. ist ausgelaufen.**

---

## Freitag, 18. September - Tag 6: Anti-Climax

Das letzte Commit des Projekts ist lächerlich. Das kostenlose Modell, das der Agent benutzt, identifiziert den OpenCode-Client mit dem Vorhandensein bestimmter Tools in der Anfrage, mit`bash` , `glob`und`grep`. Wenn sie auch aus berechtigten Gründen der Sicherheit zurückgezogen werden, gibt der Lieferant zurück`403 FreeTierError: can only be used from within OpenCode`Also musste ich es noch einmal erlauben, am Tag zuvor alles verschlossen zu haben, genau das, was ich gerade blockiert hatte, damit der Bot weiter umsonst läuft.

Nach sechs Tagen, die Discord, Piper, MLS, OpenSelf und Docker bezwingen, ist es ein kostenloses Modell, das meine Sicherheitspolitik diktiert.

---

## Die Zahlen

Die Zahlen zum Zusammenfassen, weil ich es mag, wenn es quadratisch ist. Es wird von 146 Commits gesprochen, 6 Tage aktiv vom 11. bis 18. September 2026, 65 Dateien getrackt und um 4000 Zeilen von Python am Ende. Die Punktzahl beim Mimo-Styletest am Anfang zeigt 9.1 von 10, und die endgültige Version ist v1.0.0, Tag SSH mit proprietären Lizenz unterzeichnet. Es ist ziemlich einfach in der realen, kleinen Projekt am Anfang, große Maschine am Ende am Ende .

## Was ich aus diesen sechs Tagen kriege

Zuerst war die Reihenfolge der Prioritäten alles, und das war die richtige Methode. Zuerst machte ich einen Prototyp, der reagiert, dann einen Bot, der gerade klingelt, dann ein glaubwürdiges System, dann eine sichere Code, und schließlich ein verteiltes Projekt. Persönlichkeit vor der Sicherheit, der Feur vor der Lizenz, würde man dieses Tempo nicht halten, indem man die Regeln der gut gemachten Projekte befolgt.

Dann ist der Stil zuerst eine Liste von nicht.`STYLE.md`die nützlichste Beschreibung nicht, was ich sage, es schließt aus, was nicht ich tue, kein Endpunkt, nicht zwei Emojis, keine`mdr`In Großbuchstaben, keine Robotersätze am Anfang der Antwort. Bot-Parasen sind leichter zu erkennen als Zeichenzüge zu definieren, und deshalb funktioniert es.

Die Schach ist das Projekt. Etwa dreißig Commits für die MLS, ein geworfener Test, sechs getestete Nuntius-Layouts, die treuste Geschichte von dem, was ich erlebt habe, sind die verpassten Versuchsreihen vom Dienstag. Ein Klon ist Gedächtnis, nicht Stil, der Stil macht Illusion zehn Nachrichten. Das Gedächtnis mit OpenSelf, Scopes, deduce und sweep Konflikte macht es lang, und das ist, was trennt einen Spiegel von einer Person.

Und die letzten Commits sind immer lustig.`bash` , `glob`und`grep`Denn ein Freier verlangt, dass seine eigenen Werkzeuge vorhanden sind, das ist mein Lieblingsspiel, und die Bilanz zum Schluss, die Ergebnisse sind atemberaubend, ja sogar bluffend. Der Klon führt ein Gespräch, ohne dass man die Maschine erraten kann, er erinnert sich an die Menschen, Projekte und vergangenen Ventile, er nimmt Initiativen und markiert sie mit einer Stimmung, und er schlägt Fox im Übrigen. Es ist gruselig, ein wenig, und genau das haben wir gesucht.

---

*Das Projekt ist nicht öffentlich: Lizenzinhaber, Rechte vorbehalten. Aber die Geschichte erzähle ich dir. Wenn du eines Tages eine ✓ "Chloé ^ treffen, die dir von einem GIF von Patrick Jane nach einer Zeit völlig menschlicher Untätigkeit antwortet, weißt du jetzt, was sich hinter ihnen verbirgt.*

---

du hast alles gelesen, weil mein Klon dir das geschrieben hat, und er hat einen tadellosen Job gemacht, oder? [ici](./article-chlone-timeline.md) .
