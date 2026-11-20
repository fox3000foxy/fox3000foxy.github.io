---
title: "Chlone: Sechs Tage, um meine Art zu klonen, über Discord zu sprechen"
description: "Build-Rezektor, Tag für Tag: wie ein Opencode Agent namens Chloeai, angehängt auf OpenSelf Gedächtnis, gelernt hat, wie ich über Discord in sechs Tagen und 146 Commits sprechen."
date: 2026-09-18
tags: ["discord", "ai", "llm-agents", "openself", "python", "selfbot", "clone"]
authors: ["itsrealfortune"]
lang: "de"
---
# 

*Build-Bericht, Tag für Tag - pro itsrealfortune*

---

Hier ist die wahre Geschichte eines Projekts, das sechs Tage dauerte: **Cholone**, ein Discor-Bot, der wie ich spricht. Ich erzähle den Tagney, wie es geschah, in der Reihenfolge der 146 Commits der Repo, mit den Stunden, den Schach, den Umwegen und den Wunsch, alles aus dem Fenster zu werfen, aber ohne dir die Commit-Nachrichten zu platzieren.

Alles ging von einem **Wettbewerb mit Fox**. Das Thema, ein Boutique: Jeder musste seinen eigenen Klon auf Discord lebendig machen. Und ich nahm einen radikal anderen Ansatz von **Protocol Luna**: Ich wollte auf den Agenten setzen, einen Agenten, der die Erinnerungen und alle Werkzeuge benutzt, die die KI brauchte. Ironie des Schicksals: Nach dem Aufbau der ganzen Werkzeugkiste brauchte ich nur den MCP OpenSelf.

Das Prinzip, ein Satz: ein Agent [opencode](https://opencode.ai)Name`chloeai`dreht sich hinter einem HTTP-Server (Port 4096), hält Dauersitzungen durch Wohnzimmer, scannen meine Erinnerungen in OpenSelf, und schreibt mit meinem Stil, gefangen in`STYLE.md`Und um nicht zu klingen, Roboter: burst von Nachrichten, fehlerhaftes Schlagen, Stimmen, GIFs, Reaktionen, Stille beim Schlafen und viele andere Details und Mechanismen, die mehr als zehn Menschen an der Natur des Bots zweifeln ließen.

**Was ist OpenSelf?**

OpenSelf ist das Gedächtnis.`openself`, installiert über`npm i -g openself`) als privates und anhaltendes Hintertreffen für meine AI-Agenten dient. Im Repo erscheint es nicht im Baum, aber es ist überall: im Archiv`ecosystem.config.cjs`(MCP und das OpenSelf-Dashboard, das bereits bei den ersten Commits unter PM2 gestartet wurde),`setup.sh` (`npm i -g openself`) und in allen`tools/brain/memory.py` .

Konkret heißt OpenSelf:

- **typisierte Erinnerungen** (`fact` , `preference` , `decision` , `relationship` , `event` , `note`), mit einer Empfindlichkeit (public / personal / private / restricted), eine Note des Vertrauens, eine Quelle, Tags;
- **skope**: jede Erinnerung gehört zu einem Kontext, meinem oder`discord/dm/<id>`für eine bestimmte Person;
- eine **Hybridforschung** (lexical + vektorielle) als MCP (`openself_openself_search_memory` , `openself_openself_get_context`) daß der Bedienstete`chloeai`fragt vor jeder Antwort;
- eine **Konflikterkennung** (mein monatlicher Tag 5) und eine Schreib-Deduce;
- ein **vault verschlüsselt** (Schlüssel in Bitwarden) und ein **dashboard lokal** (port 3210) zur Überprüfung aller ,
- Und für die Füchse wie mich:`openself feed`um deine Persönlichkeit von deinen historischen WhatsApp/Telegrams zu nähren,`openself test` , `openself share`(✓ Talk to My Clone ✓, eine Webseite),`openself arena`(zwei Klone, die diskutieren) oder`openself ghost`Ich habe meine Hand gemacht, aber die Infrastruktur war da.

Theoretisch ist OpenSelf allein für einen Klon, aber angesichts all dessen, was ich als Features hinzufügen wollte, und da Discord nicht unterstützt wird, habe ich es vorgezogen, nur das Souvenir-Teil zu verwenden.

**Woher kommen Erinnerungen und Stil?**

Vor all dem habe ich meine echten Discord-Nachrichten analysiert, und das Tooling hat meine DMs und meine Salons durchsucht, um zwei Dinge herauszuholen:

1. **Mein Schreibprofil** - die große/kleine Verteilung am Anfang des Satzes, die Anzahl der Emojis pro Nachricht und ihre Position, die Interpunktion (oder ihre Abwesenheit: Sätze ohne Endpunkt im normalen Gespräch), die mittlere Länge, der Slang (`mdr` , `tkt` , `tho`), Fetischausdrücke (✓ Bah ✓, ← In Wahrheit having) und Reflexe der Gattung`quoi` -> `Feur`Das alles lebt in`STYLE.md`, dass der Bedienstete bei Beginn jeder Sitzung liest.
2. **Die Erinnerungen**, die OpenSelf-Populationen sind: die Leute, mit denen ich spreche, was wir reden, was aus unserer Geschichte zu halten ist, wer. Der Bot antwortet nicht in der Leere: er antwortet * über die Leute*, die er kennt ^. Er liest die Erinnerungen der Leute, die in der Unterhaltung erscheinen, um zu wissen, wer es ist. Es ermöglicht, einen dauerhaften Kontext über die anderen zu halten, sie nicht zu vergessen.

Der Bot hat nichts erfunden: er wurde nach Zahlen auf echtes sortiert. Deshalb klingt er richtig, und die Annäherungen ^ich notiere deinen nassen Fingerstil ^ scheinen nebenan pathetisch zu sein.

In Chlone spielt OpenSelf die zentrale Rolle dann: wenn etwas Wichtiges in eine Messe geht (Schlüsselwort ✓ Projekt ←, denn ^ Freund Ё, ^ Beziehung ØØ, oder eine ausdrückliche Anfrage ^ Remains que... •) , \xDCbert der Bot eine Erinnerung in den Vault via`save_to_memory`Und wenn das Gespräch wieder beginnt, durchsucht der Agent seine Erinnerungen, bevor er antwortet.

---

---

## FREITAG, 11. SEPTEMBER - Tag 1: der Funke

### 08:24 - der erste Commit

Alles beginnt von Null, aber alles ist schon da, eins.`discord_watch_bot.py`372 Zeilen, ein Selfbot, das auf einen Channel hört und über einen HTTP-opencode-Server reagiert.`CHLOEAI_PROMPT.md`. Ein`STYLE.md`. Testszenarien und Berichte für einen Klon, der damals noch **Mimo** hieß. Ein PM2-Konfig, um das MCP und das OpenSelf Dashboard zu drehen. Und eine Sqlite-Basis, die als Kontext dient.

Ich habe kein Projekt geplant: Ich habe ein Experiment geplant. Können wir einen Bot machen, der wirklich menschlich klingelt?

### 08:27 - die erste Gitignore

Erste Stunde am Freitagmorgen: niemals Sqlite-Basis eingeben`-wal` / `-shm`. Die Sperrdateien von SQLite sind nicht vom Speicher, sondern Abfall.`.gitignore`geboren.

### 08:44 - das Erbe wird abgelegt

Ich lege das Erbe von Mimo auf: Testberichte, Szenarien, Integrationsskripte, PM2-Konfig.`archives/`Ich lösche nichts, das Projekt ist zu jung, um etwas wegzuwerfen.

Der Testbericht verdient es, dass man sich daran hält: Mimo wurde auf **15 Szenarien** getestet (absurde Chat, absurde Ventil, emotionale Unterstützung, negative Meinung, Konflikt mit einem Unbekannten, Vorschlag für eine Zusammenarbeit...). Die Kommentare des Testers sind ein Gedicht: * ^= zu erläuterndes absurdes Ventel ^*, * * * {\} manchmal 2 Sätze, während 1 ^ * * "Achten du auch auf du" ein wenig lang ^. Das ist der Fahrplan des Projekts, bevor das Projekt existiert: **court = besser**.

### 08.48 Uhr, 09.07 Uhr - die Hin- und Herbewegung der Beschwerdepunkte

Die`.pyc`und ein erster Haushalt auf dem Konfig... dass ich 20 Minuten später brechen: ohne aktivierte Intents, erhalten du nicht den Inhalt der Nachrichten. Zurück, plus ein Start-Skript (`run_watch_bot.sh`). Gehen und zurück in 20 Minuten: das ist die Erforschung. Schreibst du eine erste Version, zerbrechen, schreiben.

### 09.13 → 09.58 - Bearbeitung des Schnelllaufs

Der Morgen ist eine Reihe von Polieren, zuerst vom Stil, dann vom Kontext:

- mehrere Antwortlinien = mehrere Nachrichten, die nacheinander gesendet werden (der Burst), wird der Schnelle bewusst der laufenden Unterhaltung;
- fertige Häuser-Caches, um DMs zu erhalten: direkt die Discord REST API eingeben;
- Die Identität wird alle 5 Nachrichten neu erfasst, damit der Bot nicht vergisst, wer unterwegs ist;
- Nachverfolgung der Autoren bereits gesehen: für einen neuen Kopf, ausdrückliche Anweisung, in Erinnerungen zu suchen;
- Anzeige des echten Pseudo- und nicht des internen Objekts;
- Die Nachrichten, die wir ignorieren, werden für die folgende Antwort zu passiven Kontexten;
- Der ✓ Bah ← ist gedürft: selten, sonst wird der Klon zu einer Karikatur von mir;
- Der Bot weiß, dass es Erinnerungen gibt, die man abholen muss, bevor er antwortet.

Jeder Durchgang ist ein Schraubenturm. Der Bot spricht nur ✓, an diesem Punkt, weil ich ihn daran erinnere, wer er in regelmäßigen Abständen ist.

### 10.16 - die Fehler des Schlags

Der Commit, der das Projekt definieren wird. Ein Schreibfehler ist kein Fehler: es ist ein ** Menschlichkeitsnachweis**. 6% Chance, nebenan auf die Tastatur AZERTY zu tippen, 4%, zwei Buchstaben umzukehren. Die Nachricht geht mit dem Fehler los, dann ist **Edition 1-2 Sekunden später** mit der Korrektur. Weil eine echte Person sendet und korrigiert.

### 10.29, 10.32 Uhr - die Stimme

`fortune-v6.onnx`: ein TTS-Modell, das so trainiert ist, wie *meine* Stimme zu sein. Der Bot wird nicht einfach so schreiben wie ich, er wird optional * sprechen* wie ich. In diesem Moment hört das Projekt auf, ein Witz zu sein und wird ein wenig seltsam.

Die Mechanik hält in einem Commit: Piper erzeugt Audio, ffmpeg konvertiert in Opus, die Discord API sendet eine echte ✓ Voice-Nachricht ← mit waveform und Dauer. Dies ist in nur 3 Minuten nach der Ankunft des Modells.

### 11.27 - der erste große Refactor

Drei Stunden nach dem ersten Commit ist der Monolith von 456 Zeilen nicht mehr beherrschbar. Ich platze alles in`tools/`: `config.py` , `discord_api.py` , `memory.py` , `opencode.py`(188 Zeilen),`typo.py` , `voice.py`Der Zyklus ist klassisch: Schnell koppeln, klopfen, wieder aufnehmen.

Dann folgten sie:

- der token geht vom Code und geht durch einen`.env`;
- der Bot überwacht einen Channel, eine Liste oder alles (`*`);
- Die alte sqlite-Basis hat keinen Sinn mehr: das Gedächtnis geht über OpenSelf;
- die ersten`README.md`, und eine erste Dok so gut wie lesbar;
- ein`setup.sh`: venv dediziert (der Systempython trägt einen anderen discord.py, klassische Falle), symlink des Agenten zu`~/.config/opencode/agents/`, bereit zum Drehen;
- Der Speicher weiß, wo* er gebildet wurde (Kanal-ID), und die Sprachrate wird angepasst.

### 12.00 Uhr - Reflexe

Ein neuer Abschnitt im STYLE: Reflexe. Ein Reflex ist ein Stimulus -> eine Antwort, ohne nachzudenken. Die Tür ist offen für absurde Antworten.

Dann kommt die Mittagspause, und DIE existenzielle Frage: antwortet der Bot`Feur`wenn man es ihr sagt`quoi`?

### 13.03 - ✓ was? ← -> having Feur approximate

Ja, natürlich, das ist der wichtigste Commit des Projekts, kulturell gesprochen.

Dann wird geölt:

- die Autoren, die von ihrem *global name* angezeigt werden;
- die gekrümmte Interpunktion, bevor du den Reflex testen (musst du die`quoi?`, wenn nicht`Feur`nicht abreisen);
- die berühmte`tqt`korrigiert in`tkt`Im STYLE werden sich Leute, die das Projekt nicht kennen, fragen, warum ich es ausspreche. Ich weiß: ein Klon, der schreibt`tqt`, es ist ein falsch geeichter Klon, und niemand will mit einem schlecht gemusterten Klon sprechen;
- Angaben`@123456789`ersetzt durch echte Namen im Kontext;
- Der Bot fängt an, alle Standardsalons zu überwachen.

### 16.37 - Stille

Das`[void response]`. Der Bot lernt das wichtigste Wort, um kein sozialer Parasiten zu werden: **Seid still**. Eine Umgebungsbotschaft zwischen zwei Personen, die ihn nicht betreffen, ruft Schweigen.

**Ende des Tages 1: 38 Commits. Der geschriebene Bot, fehlerhaft, spricht, schweigt.**

---

---

## MONTAG, 14. SEPTEMBER - 2. TAG: die Persönlichkeit

Wir machen das noch mal, 10 Uhr morgens.

### 10.12 - wer spricht mit wem?

Jeder erhaltene Pseudonym wird von einem Emoji durch das System vorbestimmt: ✓ ein Mensch, ← ein Bot (zu behandeln, trocknet ab), Ё **die Schöpferin, das heißt ich** auf meinem Hauptkonto. Diese Vereinbarung wird den Rest des Projekts regieren: der Klon darf nie sein having Originalmodell denn eine unbekannte behandeln.

### 10.16 - die Satzungsregeln

Ich formalisiere im STYLE: Sätze ohne Endpunkt in normalem Gespräch, Punkt für ernste Situationen. Absolute Regel. Ein Klon, der Punkte überall setzt, fühlt sich an.

### 10.58 Uhr - die GIFs

Meine persönliche Buchhandlung von GIFs, mit ihren Regeln der Benutzung: der Patrick Jane, wenn ich jemanden vorhersagen, Miss Fortune, wenn es mich ruhig gegenüber jemandem ärgert, das Schnabelpfeifen, das fällt, wenn der andere einen Fehler macht. Ein statischer MCP legt sie dem Agenten vor. Der Bot, durch meine GIF, wird ein wenig zu mir.

### 11.07 → 11.35 - Feinschminken

Die GIF-Hints im Schnellen verfeinern, die Discord-Emojis customs geben ihren Eingang (meine wahren, 14 IDs auf dem neuesten Stand), und die Verwaltung der Namen in den Gedächtnishinten ist poliert.

### 11.41 - ein Wohnzimmer, eine Persönlichkeit

Die Sitzungen werden **durch Salon**: Ich spreche nicht auf die gleiche Weise in zwei verschiedenen Servern, und der Bot auch nicht.

### 12.02 - die Ausdruckswerkzeugkiste

Der Schnelle kann jetzt meine GIFs und meine Emojis zur richtigen Zeit anbieten.

### 12.37 - Identitätshygiene

- Der Bot hat NIE das Recht zu sagen, welches Modell es ist, unmöglich zu zitieren opencode, ein Vorseher, ein Modellname;
- Korrektur von ✓ barista ← in der Identität (der Bot ist bereits besser als ich);
- Ich verbringe eine Stunde damit, die Interpunktion meiner eigenen Schnellen zu harmonisieren, was eine perfekte Ironie ist.

### 12.50 - ein Skript baut Persönlichkeit

Der Medienabschnitt des Quick-Wörterbuchs (`render_medias.py`), fertig die Ausgabe von Hand.

### 12.59 → 13.18 - Identitätsbestimmung

Die Erinnerung an die Identität, die alle 5 Nachrichten gesendet wurde, wird zu gegenwärtig: alle 20 Nachrichten werden durchsucht. Eine eigene Rückkopplung des Kontextes hinzufügen. Und die Stilführung wird aus dem Stil säubern: die veralteten negativen Ausdrücke und Formulierungen werden entfernt.

### 14.09 - der Bot spricht allein

Der Bot hört auf, ein Reflex zu sein: er kann ** sprechen, ohne adressiert zu werden**, wenn der Kontext etwas löst (die Datei`behavior.py`Hier wird von ✓ Antwort auf ^ Präsenz ^ ^: ein echter Freund kann dir zuerst schreiben.

### 14.20, 14.22 - die Antwort verleugnen

Fehlermanagement, wenn das Senden fehlschlägt, und mögliche Reaktion anstelle einer Antwort, manchmal eine Reaktion ist tausend Wörter wert.

### 18.16 - Zeit nehmen

Der Bot reagiert nicht mehr in 200 ms wie ein Skript. Er lässt eine Verzögerung der menschlichen Inaktivität vergehen, er nimmt sich Zeit ✓. Das macht den Bot nicht nachweisbar in der Demo: es ist die Verzögerung, die immer verrät andere.

### 23.45 Uhr - der Abendpopot

Es ist fast Mitternacht und ich stoße eine URL-Erkennung auf nackte Domains. Das ist der wahre Rhythmus des Tages: ein brillanter Fortschritt um 14 Uhr, dann Popo am Abend, weil ich noch in der Zone bin.

**Ende des Tages 2: 61 Commits. Der Bot hat eine Persönlichkeit, Medien, Reflexe.**

---

---

## Dienstag, 15. September - Tag 3: Monstrotag

57 Commits an einem Tag... an dem das Projekt..." wird.."alles was es heute ist."

### 08.18 → 08.37 - das Vormittagsschleiern

- Die Zeit der Inaktivität, die man erfunden hatte, wurde zu lang: auf 30s begrenzt (und zweimal angepasst, Beweis dafür, daß man auf den richtigen Wert gestaut hat);
- Erste Dateien`.bak`und erste Backups der Basis: Der Erhaltungsinstinkt entwickelt sich;
- Der Speicher erinnert sich an * wen* (Name angezeigt) und * in welchem Rahmen* (Scope);
- die Autoren-IDs werden in der gesamten Sicherungspipeline geschaltet;
- die Verwaltung Ÿ Schöpfer › wird eine echte Liste von Adminen (`ADMIN_IDS`) und alle die Autoren, die in`authors.py`Der Monolith zersplittert sich noch.

### 08:43 - TODO-Liste der Humanisierung

Eine Liste, die sich auf kleine Dinge konzentriert, die uns das Gefühl der Maschine verdrängen.

### 08:44 → 08:46 - Der Pakt für menschliche Maschinen

- Der Bot schweigt nachts in einem ruhigen, konfigurierbaren Zeitbereich (standardmäßig deaktiviert, nicht jeder hat meine Zeitpläne);
- Eine Zeile pro Antwort kann ihre Akzente verlieren. müde Leute schreiben so. Der Bot auch manchmal;
- Die kleine Linie ✓ Chloe spielt ... ← ändert sich alle 30 Minuten, damit mein Profil auch ohne Nachricht lebendig aussieht.

### 08:46 - eine Reaktion, kein Roman

Eine Antwort reicht aus, um soziale Energie zu sparen, und das bin ich.

### 08:51 - PARRY, Stimmung

148 Zeilen in`tools/mood.py`. Der Bot hat jetzt ** eine Stimmung**, System-Modus PARRY (der psychotische Katze der 70er Jahre, von dem ich offen inspiriert bin): Energie, Gesellschaftlichkeit, Schikane, drei schwimmende, die sich zwischen 0 und 1 bewegen und jede Antwort färben.`.mood.json`Für die Nachwelt: Energie 0.88, Gesellschaft 0.68, sauer 0.56. Ein guter Tag.

### 09.00 Uhr → 09.43 - die bidirektionale Stimme + das Soundboard

- Der Bot kann sich einem **vocal**-Salon anschließen, über Piper sprechen und nach seiner Fertigstellung alleine abreisen;
- dann die zweite große Idee: der Bot ** hört** die Lounge (RTP erfassen, VAD Spracherkennung, Whisper Transkription), und kann die Menschen unterbrechen lassen;
- Zwischen den beiden erscheint das Soundboard: ein Katalog von Sounds mit ihren Bedeutungen, der Agent **wählt** den Klang, bevor er spricht, und die endgültige Regel ist ✓ soundboard zuerst, die Stimme als letztes Mittel ←, der Bot bevorzugt einen Klang senden, der sprechen. Wie ich;
- eine Sprachwahrscheinlichkeitseinstellung , die das Ganze lebensfähig macht;
- und die Ankunft von`davey`Dieses Lib, das ich vor zehn Minuten erfahre und das ich eine Stunde lang verfluchen werde.

### 9:51 - der Moment, wo Discord nein sagt. Nein, nein, aber nein.

Der **MLS**. Discord hat kürzlich den Audiostream von Ende bis Ende verschlüsselt, und meine Aufnahme erhält nur Geräusche. Man muss entschlüsseln, und das Entschlüsseln weigert sich, nachzugeben. Öffnet sich die größte Saga der Repo, etwa 30 Commits, um zu hören.

Alles wurde versucht: Transport Nuntius Layouts, die Deaktivierung des E2E (der Server gibt es uns zurück, er fordert es), Schlüsselanwärter aus der Gruppe, detaillierte Fehler, Fallback Transport, Introspektion des Inneren der Gruppen, Kandidaten durch Leaf-Index mit Backoff, Mapping der Hooks SPEAKING, ein media-Test Video Typ (verloren), und SSrc-Video-Skript...

Ich gab die Sprachantwort auf die Zeit des Debuggens (wie, nicht gelöscht), fügte einen Modus des Handshake-Einfangens hinzu und dumpfte dann die Struktur der Pakete, die fehlschlagen, wie ein Archäologe. Sechs Nunt Layouts. Backoff. Gruppen-Introspektion. Ich setzte den Bot in totalen Debug und öffnete jedes Paket, um zu sehen, was darin war.

Das Wichtigste ist nicht, dass es funktioniert, es ist, dass ** ich nichts weggeworfen habe**. Die Liste der Commits ist das Laborbuch: jeder gescheiterte Test wird mit seiner Hypothese archiviert. Es ist meine Seite ✓ ich behalte alles, es wird für einen zukünftigen Debug dienen ←, der bezahlt hat.

### 10.43 - der Bot wird zerschnitten

Selbst im MLS-Krieg räume ich weiter. 546 Linien verschwinden vom Hauptbot, um wiedergeboren zu werden.`pipeline.py`(Intake, Gründe für die Unkenntnis, Prozessing),`sender.py`(Burst, Typo, Voice) und`loops.py`(Spontanität, Aktivität).

### 10.47 - eine echte Architektur

`tools/`wird organisiert ,`brain/`(opencode, memory, mood),`voice/`(Song, Voice, Listen, Soundboard)`fun/`Das Projekt hat jetzt ein Skelett.

### 10.49 → 11.16 - der Komfort von dev

- eine angepasste Schwelle für die Injektion der Stimmung;
- vier kleine Commits für die Ausschlüsse des Verlegers (`data/` , `voices/`, die Logs, die Grundlagen), ja, ich habe vier gesetzt, das Projekt legt die Prioritäten fest, nicht die Spektakel;
- Metadatenbasen verlassen die Überwachung .
- Das Projekt wird ** von anderen** wiederverwendbar: generische Templates`PERSONA.example.md`und`STYLE.example.md`zum Klonen *son* eigener Stil;
- die Identität ist als solche bekannt (`CHLOEAI_PROMPT`wird`PERSONA`), und das README ist entpersonalisiert, ich nehme Chloé ✓ aus der öffentlichen Doktrin, sie erzählt sich nur mehr privat;
- Alles Tuning des Bots wandert in ein`config.yaml`überlastet (gitignore), mit einem Beispiel kommentiert Linie pro Linie;
- Das Installationsskript bereitet nun auch die Dateien von ca. ca. und config vor.

### 11.49 - die losgelösten Emojis

Die Emojis customs kleben an den Text anstatt sich sauber zu lösen. Fix trivial, riesige Wirkung: nichts schreit ✓ Bot ← wie ein Emochi, das am Ende eines Satzes schlecht geklebt ist.

### 14.19 - die Sprachwächter

Wenn jemand den Sprachbefehl startet, wird die Nachricht nicht als normale Nachricht behandelt.

**Ende des Tages 3: 118 Commits zusammen. Der Bot hört, spricht, schweigt nachts, hat eine Stimmung und eine Visitenkarte.**

---

---

## Mittwoch, 16. September - Tag 4: Glaubwürdigkeit

13 Commits. Tag ✓ seriös ←.

### 08:49 → 08:59 - Erwachsenenalter

Gesetzliche Dokumente: Lizenz ** Eigentümer**, Verhaltenskodex, Beitragsrichtlinien, Sicherheitspolitik, in Englisch und dann in Französisch, mit einem Hin- und Her-Gehen von Korrekturen und einer Umbenennung von Dateien an der Grenze des Pointeux. Ich verbrachte Stunden darauf, und es ist der am wenigsten Spaß Teil der Repo, von weit entfernt.

### 9.56 - der Bot sieht

Die beigefügten Bilder werden von OCR lokal transkribiert und der Text wird in die Schnelle injiziert. Das OCR läuft in der Lokale zu mir. Ich schicke deine eigenen nicht an einen Drittanbieter-Server, auch theoretisch.

### 11.09 - der angemessene Haushalt

Stille Revolution im Haushalt: Wenn die Messe Sendungen verbietet oder GIFs, Embed und Emojis bricht, wird nicht einmal das Modell** genannt. Für eine Nachricht, die man nicht senden kann, wird kein Token ausgegeben.

### 11.42 → 12.55 - Das Haus, das sich wieder erholt

- der große Besen: toter Code gelöscht, Fehler beim Senden und Authentisieren korrigiert, helpers Factorisiert;
- zu alte Sitzungen werden ausgewiesen, der DM-Cache läuft aus, Spracherkennung kostet weniger.
- Die Einkäufe, die ich durch das Verschieben von Modulen gebrochen hatte, werden wiederhergestellt, und der ganze Runtime-Status (Sitzungen, gesehene Autoren, ignorierte Nachrichten, Stimmung) überlebte die Neustarts in`data/` .

### 14.41 - zwei Welten, ein Bot

Eine Kompatibilitätsschicht erkennt automatisch die Version von`discord`Installiert und passt die Interten und die auth REST an. Ergebnis: Der gleiche Code wird als **app offiziell** (discord.py) oder als **selfbot** (dicord.spy-self) verwendet.

### 15.05 - die angemessene Anwesenheit

Die Anzeige der Anwesenheit passt sich dem Modus an, und die Liste der admins ist auf dem neuesten Stand.

**Ende des Tages 4: 131 Commits kumuliert. Ein legales, vernünftiges und überall gedrehtes Projekt.**

---

---

## TAG, 17. SEPTEMBER - 5. TAG: DIE RESERVIERUNG

14 commits. Am Tag der Reife.

### 09.15 → 09.30 - Gedächtnis wird zu Disziplin

- Erinnerungen werden durch ein Skop verstopft und man nennt keine Erinnerungen an eine DM in einem Server (oder umgekehrt), ohne darüber nachzudenken;
- Die Erinnerungen (Gedenkgut, Vorliebe, Entscheidung, Beziehung...) werden sortiert und die Schrift wird entkoppelt: zwei widersprüchliche Erinnerungen können nicht mehr in Stille zusammenleben;
- eine optionale Blacklist (`aventuros`) verhindert, dass der Bot zu bestimmten Themen abgelenkt wird. Standardmäßig deaktiviert, verfügbar für frielous;
- Die tote Sprachkonfig wird entfernt.

### 10.12 - das Gedächtnis, das man hört

Ein monatlicher **sweep von Gedächtniskonflikten** und ein Such-Bench A/B. Das Gedächtnis des Bots wurde zu einem Asset, das man inspiziert. Wir sind sehr weit weg vom Freitag 11, 08:24.

### 10.54 - der Lockdown

Ich spiele Paranoia, ich sperre den Agenten ab.

- Speicherschreiben ** [""](der Agent darf das Vault nicht verschmutzen, auch wenn es injiziert wird)
- Discord **-Tools in nur gelesener Form** (Senden erfolgt über Code, niemals durch Agent)
- **Nein Subagent** (Lockdown-Umwandlung), noch Webfetch (SRF localhost, Exfiltrationen), noch Fragen in headless;
- ein gehärteter Docker: nicht-root-Bot,`no-new-privileges` , `cap_drop: ALL`, Speicher/CPU-Beschränkungen, bornierte Prozessdateien, Geheimnisse via`.env`Niemals baked.

Ich schreibe das Prinzip im Code, in den Kommentar: * sv über menschliche Sitzungen, nicht hier s*.

### 11.02 → 11.15 - die Sicherheitsoberflächen

Die Schlüsselwörter für Speichersicherung sind eingeengt und das Schreiben ist noch restriktiver. Es wird auch die gitignore-Datei des Kontextes backup hinzugefügt, ich beginne nicht mehr alles archivieren, aber fast.

### 12.39 - Leichtere Stimmung

Die Stimmung PARRY wird nicht mehr in jede Nachricht injiziert: einmal pro Zustand. Ende der Lebenszeit 3 Schwimmer auf jede Antwort.

### 12.47 - der Befreier

`PERSONA.md` , `STYLE.md`und`chloeai.md`werden zu **Beispielen** (`chloeai.example.md` , `PERSONA.example.md` , `STYLE.example.md`), meine Stimme`fortune-v6.onnx`Repo-Ausgang, Daten und Logs auch, ein`.env.example`Das Projekt enthält nicht mehr *meine* Persönlichkeit: es enthält **mechanisch**, um eine zu tragen.

### 12.52 - v1.0.0

**Tag v1.0.0, signiert in SSH.** Changelog, Runbook Operator, kill-switch (stoppe ohne nichts zu löschen). Sechs Tage, Stapel, zwischen dem ersten Commit und dem Release.

### 12.53 → 13.14 - Wäsche

Harmonisierte Kommentare, Speicherberechtigungen und aktuelle dokumentierte Scope-Regeln.

**Ende des Tages 5: 145 Commits kumuliert. v1.0.0. ist ausgelaufen.**

---

---

## Freitag, 18. September - Tag 6: Anti-Climax

Nur ein Befehl, um 00:02 Uhr.

Das letzte Commit des Projekts ist lächerlich. Das vom Agenten verwendete Modell ✓ freetier having identifiziert den OpenCode-Client mit der **Präsenz" bestimmter Tools in der Anfrage (`bash` , `glob` , `grep`) Wenn sie auch aus berechtigten Gründen der Sicherheit zurückgezogen werden, gibt der Lieferant zurück`403 FreeTierError: can only be used from within OpenCode`Also musste ich es noch einmal erlauben, am Tag zuvor alles verschlossen zu haben, genau das, was ich gerade blockiert hatte, damit der Bot weiter umsonst läuft.

Das ist der lustigste Commit der Repo und ich halte ihn aufrecht: Nach 6 Tagen, die Discord, Piper, MLS, OpenSelf und Docker bezwingen, ist es **ein kostenloses KI-Modell**, das meine Sicherheitspolitik diktiert.

---

---

## Die Zahlen

|                                               |                                                |
| --------------------------------------------- | ---------------------------------------------- |
| Kommits                                       | **146**                                        |
| Aktive Tage                                  | **6** (11 -> 18. September 2026)                |
| Getippte Dateien                             | 65                                             |
| Python-Endlinien                         | ~4 000                                         |
| Stiltest-Score (Mimo, erste Tage) | **9.1/10**                                     |
| Endgültige Fassung                                | v1.0.0 (Tag unterzeichnet SSH, Lizenz Eigentümer) |

## Was ich aus diesen sechs Tagen kriege

1. **Die Reihenfolge der Prioritäten war alles, und es war die richtige Methode.** Zuerst baute ich einen Bot, der *antwortet*, dann einen Bote, der gerade* ist, dann ein Bot, das glaubwürdig ist*, und dann einen Boot, der sicher ist* und schließlich einen Bot *verteilungsfähig*.`Feur`Vor der Lizenz. Dieses Tempo würde nicht durch die Einhaltung der Regeln der Projekte ✓ gut gemacht gehalten werden.
2. **Der Stil ist zuerst eine Liste von ✓ nicht ^.** Mein`STYLE.md`die nützlichsten nicht beschreiben, was ich sage, es schließt aus, was Ich nicht tue: beenden du die Sätze ohne Punkt, begrenzen du die Emojis auf einen einzigen, schreiben`mdr`in winzigen, direkt ohne Präambel des Typs ✓ angreifen Ich überprüfe nur ein Detail ^ am Anfang der Antwort. Botparasiten sind leichter zu erkennen als die Zeichenzüge zu definieren.
3. **Schach ist das Projekt.** Etwa 30 Commits für MLS, ein geworfener Test, sechs getestete Nuntius-Layouts. Die treuste Geschichte von dem, was ich erlebt habe, sind die verpassten Dienstag-Versuche.
4. **Ein Klon ist Gedächtnis, kein Stil.** Der Stil macht zehn Nachrichten illusorisch. Das Gedächtnis (OpenSelf, Scopes, Deduce, Sweep) macht es so lange. Das trennt einen Spiegel von einer Person.
5. **Die letzten Commits sind immer lustig.** Die 146., die wieder autorisiert`bash` , `glob`und`grep`Denn ein Freier verlangt, dass seine eigenen Werkzeuge vorhanden sind, das ist mein Lieblings.

Und die Bilanz, um zum Schluss: **Die Ergebnisse sind atemberaubend, sehen sogar bluffend.** Der Klon führt ein Gespräch ohne dass man die Maschine erraten kann, erinnert sich an die Leute, Projekte, vergangene Ventile, nimmt Initiativen und Zeichen einer Stimmung, und er schlägt Fox im Übrigen. Es ist gruselig, ein wenig, und genau das haben wir gesucht.

---

*Das Projekt ist nicht öffentlich: Lizenzinhaber, Rechte vorbehalten. Aber die Geschichte erzähle ich dir. Wenn du eines Tages eine ✓ ›Chloé › , die dir von einem GIF von Patrick Jane nach einer Zeit völlig menschlicher Untätigkeit antwortet... du weißt jetzt, was sich hinter ihnen verbirgt.*

---

Mein Klon schrieb seine eigene Version des Artikels, die du liest können [ici](./article-chlone-timeline-chloeai.md) .
