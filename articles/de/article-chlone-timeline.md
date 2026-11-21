---
title: "Chlone: Sechs Tage, um meine Art zu klonen, über Discord zu sprechen"
description: "Build-Story, Tag für Tag: wie ein Opencode-Agent namens Chloeai, angebunden an das OpenSelf-Gedächtnis, in sechs Tagen und 146 Commits gelernt hat, wie ich auf Discord zu sprechen."
date: 2026-09-18
tags: ["discord", "ai", "llm-agents", "openself", "python", "selfbot", "clone"]
authors: ["itsrealfortune"]
lang: "de"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "SuEmYijaquxB5hTtcMmQq6iol3P8RHe5PXoWofOWlx4U019kYqHkfWZ17ARATabQtuAvoCITXgnzR0MvuNldSQ=="
---

# Chlone: Sechs Tage, um zu klonen, wie ich auf Discord spreche

*Build-Bericht, Tag für Tag - von itsrealfortune*

---

Hier ist die wahre Geschichte eines Projekts, das sechs Tage dauerte: **Chlone**, ein Discord-Bot, der wie ich spricht. Ich erzähle den Verlauf, so wie er passiert ist, in der Reihenfolge der 146 Commits des Repos, mit den Stunden, den Fehlschlägen, den Umwegen und dem Drang, alles aus dem Fenster zu werfen. Die Commit-Nachrichten erspare ich dir.

Alles begann mit einem **Wettbewerb mit Fox**. Das Thema war ein Witz: Jeder sollte seinen eigenen Klon auf Discord zum Leben erwecken. Ich wählte einen radikal anderen Ansatz als **Luna Protocol**: Ich wollte auf einen Agenten setzen, der Erinnerungen und alle Werkzeuge nutzt, die eine KI braucht. Die Ironie des Schicksals: Nachdem ich den ganzen Werkzeugkasten gebaut hatte, brauchte ich am Ende nur noch den OpenSelf-MCP.

Das Prinzip in einem Satz: Ein [opencode](https://opencode.ai)-Agent namens `chloeai` läuft hinter einem HTTP-Server (Port 4096), hält persistente Sitzungen pro Kanal, holt meine Erinnerungen aus OpenSelf und schreibt in meinem Stil, der in `STYLE.md` aus meinen echten Nachrichten erfasst wurde. Und damit er nicht roboterhaft klingt: Nachrichtenbursts, absichtliche Tippfehler, Sprachnachrichten, GIFs, Reaktionen, Stille, wenn ich schlafe, und viele weitere Details und Mechanismen, die über ein Dutzend Menschen an der Natur des Bots zweifeln ließen.

**Was ist OpenSelf?**

OpenSelf ist das Gedächtnis. Eine CLI (`openself`, installiert über `npm i -g openself`), die als privater, persistenter Kontext-Tresor für meine KI-Agenten dient. Im Repo taucht sie nicht im Verzeichnisbaum auf, aber sie ist überall: in der archivierten `ecosystem.config.cjs` (das OpenSelf-MCP und das Dashboard, die schon bei den ersten Commits unter PM2 gestartet wurden), in `setup.sh` (`npm i -g openself`) und im gesamten `tools/brain/memory.py`.

Konkret bietet OpenSelf:

- **typisierte Erinnerungen** (`fact`, `preference`, `decision`, `relationship`, `event`, `note`), mit einer Sensibilität (public / personal / private / restricted), einem Konfidenzwert, einer Quelle und Tags;
- **Scopes**: Jede Erinnerung gehört zu einem Kontext, meinem eigenen oder `discord/dm/<id>` für eine bestimmte Person;
- eine **Hybridsuche** (lexikalisch + vektoriell), als MCP bereitgestellt (`openself_openself_search_memory`, `openself_openself_get_context`), die der Agent `chloeai` vor jeder Antwort abfragt;
- **Konflikterkennung** (mein monatlicher Sweep am Tag 5) und Deduplizierung beim Schreiben;
- einen **verschlüsselten Tresor** (Schlüssel in Bitwarden) und ein **lokales Dashboard** (Port 3210), um alles zu prüfen;
- und für Faulere als mich: `openself feed`, um deine Persönlichkeit aus deinen WhatsApp-/Telegram-Verläufen zu speisen, `openself test`, `openself share` (eine Webseite „Talk to My Clone"), `openself arena` (zwei Klone, die diskutieren) oder `openself ghost` (antwortet, wenn du offline bist). Ich habe meins von Hand gemacht, aber die Infrastruktur war da.

Theoretisch reicht OpenSelf allein für einen Klon. Angesichts all dessen, was ich als Funktionen hinzufügen wollte, und weil Discord nicht unterstützt wird, habe ich mich entschieden, nur den Gedächtnisteil zu nutzen.

**Woher kommen Erinnerungen und Stil?**

Davor habe ich meine echten Discord-Nachrichten analysieren lassen. Das Tooling durchkämmte meine DMs und Kanäle, um zwei Dinge herauszuholen:

1. **Mein Schreibprofil**: die Verteilung von Groß- und Kleinschreibung am Satzanfang, die Anzahl der Emojis pro Nachricht und ihre Position, die Interpunktion (oder ihr Fehlen: Sätze ohne Schlusspunkt im normalen Gespräch), die durchschnittliche Länge, den Slang (`mdr`, `tkt`, `tho`), Lieblingsausdrücke („Bah", „En vrai") und Reflexe wie `quoi` -> `Feur`. All das steht in `STYLE.md`, die der Agent zu Beginn jeder Sitzung liest.
2. **Den Erinnerungskorpus**, der OpenSelf füllt: Wer die Leute sind, mit denen ich spreche, worüber wir reden, was aus unserer Geschichte festzuhalten ist, wer wer ist. Der Bot antwortet nicht ins Leere: Er antwortet *über* die Leute, die er „kennt". Er liest die Erinnerungen der Personen, die im Gespräch auftauchen, um zu wissen, wer sie sind. So behält er dauerhaften Kontext über andere und vergisst sie nicht.

Der Bot hat nichts erfunden: Er wurde Zahl für Zahl auf echten Daten kalibriert. Deshalb klingt er richtig, und die vagen „ich notiere deinen Stil"-Annäherungen wirken daneben armselig.

In Chlone spielt OpenSelf dann die zentrale Rolle: Wenn etwas Wichtiges im Kanal auftaucht (Schlüsselwörter wie „Projekt", „Freund", „Beziehung" oder eine ausdrückliche Bitte „merk dir, dass ..."), schreibt der Bot eine Erinnerung über `save_to_memory` in den Tresor, typisiert, pro Person gescopt, dedupliziert und gegen Konflikte geprüft. Und wenn das Gespräch wieder aufgenommen wird, durchsucht der Agent seine Erinnerungen, bevor er antwortet. Das ist der Unterschied zwischen einem Spiegel und einem Klon.

---

---

## FREITAG, 11. SEPTEMBER - Tag 1: der Funke

### 08:24 - der erste Commit

Alles beginnt bei null, aber alles ist schon da, in Bausch und Bogen. Eine 372-zeilige `discord_watch_bot.py`, ein Selfbot, der auf einen Kanal hört und über einen opencode-HTTP-Server antwortet. Ein `CHLOEAI_PROMPT.md` als Identitäts-Prompt. Eine `STYLE.md`. Szenarien und Testberichte für einen Klon, der damals noch **Mimo** hieß. Eine PM2-Konfiguration, um das OpenSelf-MCP und das Dashboard zu starten. Und eine SQLite-Datenbank als Kontext.

Es war ein Gründungschaos. Ich hatte kein Projekt geplant, sondern ein Experiment: Kann man einen Bot bauen, der auf Discord *wirklich* menschlich klingt?

### 08:27 - das erste .gitignore

Erste Lektion des Freitagmorgens: Niemals SQLite-Datenbanken mit `-wal`- und `-shm`-Dateien committen. Die Lock-Dateien von SQLite sind kein Gedächtnis, sondern Müll. So entstand `.gitignore`.

### 08:44 - das Erbe sortieren

Ich sortiere Mimos Erbe: Testberichte, Szenarien, Integrationsskripte, PM2-Konfiguration. Alles nach `archives/`. Ich lösche nichts, das Projekt ist zu jung, um irgendetwas wegzuwerfen. Das wird zur Gewohnheit.

Der Testbericht verdient eine Pause: Mimo wurde mit **15 Szenarien** getestet (lockerer Chat, absurder Witz, emotionale Unterstützung, negative Meinung, Konflikt mit einem Fremden, Kooperationsvorschlag ...) und erreichte **9,1/10**. Die Kommentare des Testers sind ein Gedicht: *„absurder Witz zu erklärend"*, *„manchmal 2 Sätze, wo 1 reicht"*, *„„Pass auch auf dich auf" etwas lang"*. Es ist der Fahrplan des Projekts, noch bevor das Projekt existiert: **kurz = besser**.

### 08:48, 09:07 - das Hin und Her bei den Intents

`.pyc`-Dateien in den Müll, dazu eine erste Bereinigung der Konfiguration ... die ich zwanzig Minuten später wieder kaputt mache: Ohne aktivierte Intents erhältst du den Inhalt der Nachrichten nicht. Zurückgerollt, dazu ein Startskript (`run_watch_bot.sh`). Hin und her in 20 Minuten: Das ist Erkundung. Eine erste Version schreiben, brechen, neu schreiben.

### 09:13 → 09:58 - Feinschliff am Prompt

Der Morgen ist eine Reihe von Politur, zuerst am Stil, dann am Kontext:

- mehrere Antwortzeilen = mehrere nacheinander gesendete Nachrichten (der Burst); der Prompt wird sich des laufenden Gesprächs bewusst;
- keine selbstgebauten Caches mehr, um DMs zu holen: direkt gegen die Discord-REST-API;
- die Identität wird alle 5 Nachrichten neu eingeprägt, damit der Bot mitten im Gespräch nicht vergisst, wer er ist;
- Verfolgung der bereits gesehenen Autoren: Bei einem neuen Gesicht die ausdrückliche Anweisung, in den Erinnerungen nachzuschauen;
- Anzeige des echten Spitznamens statt des internen Objekts;
- Nachrichten, die wir bewusst ignorieren, werden zu passivem Kontext für die nächste Antwort;
- „Bah" wird dosiert: selten, sonst wird der Klon zur Karikatur meiner selbst;
- der Bot weiß, dass Erinnerungen existieren, die er abrufen muss, bevor er antwortet.

Jeder Durchgang ist eine Umdrehung der Schraube. Der Bot „spricht" in dieser Phase nur, weil ich ihn in regelmäßigen Abständen daran erinnere, wer er ist.

### 10:16 - die Tippfehler

Der Commit, der das Projekt definieren wird. Ein Tippfehler ist kein Fehler, sondern ein **Menschlichkeitsbeweis**. 6 % Chance, auf der AZERTY-Tastatur daneben zu tippen, 4 %, zwei Buchstaben zu vertauschen. Die Nachricht geht mit dem Fehler raus und wird **1-2 Sekunden später** mit der Korrektur editiert. Denn ein echter Mensch sendet und korrigiert.

### 10:29, 10:32 - die Stimme

`fortune-v6.onnx`: ein TTS-Modell, trainiert, *meine* Stimme zu sein. Der Bot schreibt nicht nur wie ich, er wird irgendwann auch wie ich *sprechen*. In diesem Moment hört das Projekt auf, ein Witz zu sein, und wird ein bisschen seltsam. Ich liebe es.

Die Mechanik passt in einen Commit: Piper erzeugt das Audio, ffmpeg konvertiert es in Opus, die Discord-API sendet eine echte Sprachnachricht mit Wellenform und Dauer. Erledigt in knapp 3 Minuten, nachdem das Modell angekommen war. Der Drang war von Anfang an da.

### 11:27 - der erste große Refactor

Drei Stunden nach dem ersten Commit ist der 456-zeilige Monolith nicht mehr beherrschbar. Ich sprenge alles in `tools/`: `config.py`, `discord_api.py`, `memory.py`, `opencode.py` (188 Zeilen), `typo.py`, `voice.py`. Der Zyklus ist klassisch: schnell koppeln, brechen, neu zusammensetzen.

Danach, Schlag auf Schlag:

- der Token wandert aus dem Code in eine `.env`;
- der Bot überwacht einen Kanal, eine Liste oder alles (`*`);
- die alte SQLite-Datenbank hat keinen Sinn mehr: Das Gedächtnis läuft über OpenSelf;
- erste `README.md`-Dateien und eine erste, lesbare Dokumentation;
- ein `setup.sh`: eigenes venv (das System-Python bringt eine andere discord.py-Version mit, eine klassische Falle), Symlink des Agenten nach `~/.config/opencode/agents/`, betriebsbereit;
- das Gedächtnis weiß jetzt, *wo* es entstanden ist (Kanal-ID), und die Rate der Sprachnachrichten passt sich selbst an.

### 12:00 - die Reflexe

Ein neuer Abschnitt im STYLE: Reflexe. Ein Reflex ist ein Reiz -> eine Antwort, ohne nachzudenken. Die Tür steht offen für absurde Antworten.

Dann kommt die Mittagspause und DIE existenzielle Frage: Antwortet der Bot mit `Feur`, wenn man ihm `quoi` sagt?

### 13:03 - „quoi ?" -> „Feur"

Ja, natürlich. Das ist kulturell gesehen der wichtigste Commit des Projekts. Ich würde sogar sagen: der einzige Unit-Test, der zählt.

Dann wird geölt:

- Autoren werden mit ihrem *globalen Namen* angezeigt;
- Interpunktion wird abgeschnitten, bevor der Reflex geprüft wird (man muss das `quoi ?` entfernen, sonst feuert `Feur` nicht);
- das berühmte `tqt` wird im STYLE zu `tkt` korrigiert. Leute, die das Projekt nicht kennen, werden sich fragen, warum ich das committe. Ich weiß: Ein Klon, der `tqt` schreibt, ist falsch kalibriert, und niemand will mit einem falsch kalibrierten Klon sprechen;
- `@123456789`-Erwähnungen werden im Kontext durch echte Namen ersetzt;
- der Bot beginnt, standardmäßig alle Kanäle zu überwachen.

### 16:37 - die Stille

Die `[void response]`. Der Bot lernt das wichtigste Wort, um kein sozialer Parasit zu werden: **Schweigen**. Eine Nebennachricht zwischen zwei Personen, die ihn nicht betrifft, verlangt nach Stille. Zurückhaltung ist ein Feature.

**Ende von Tag 1: 38 Commits. Der Bot schreibt, tippt falsch, spricht, schweigt.**

---

---

## MONTAG, 14. SEPTEMBER - Tag 2: die Persönlichkeit

Wir machen weiter, 10 Uhr morgens.

### 10:12 - wer spricht mit wem?

Jeder empfangene Spitzname bekommt vom System ein Emoji vorangestellt: 🧑 ein Mensch, 🤖 ein Bot (wird trockener behandelt), 👑 **die Schöpferin, also ich**, auf meinem Hauptkonto. Diese Konvention bestimmt alles Weitere im Projekt: Der Klon darf sein Originalmodell nie wie einen Fremden behandeln.

### 10:16 - Interpunktionsregeln

Ich formalisiere es im STYLE: Sätze ohne Schlusspunkt im normalen Gespräch, der Punkt ist ernsten Situationen vorbehalten. Absolute Regel. Ein Klon, der überall Punkte setzt, verrät sich.

### 10:58 - die GIFs

Meine persönliche GIF-Bibliothek mit Nutzungsregeln: Patrick Jane, wenn ich jemanden vorhersage, Miss Fortune, wenn ich ruhig bleibe, obwohl jemand wütend ist, das fallende Bescherelle-GIF, wenn der andere einen Fehler macht. Ein statisches MCP legt sie dem Agenten vor. Der Bot wird durch meine GIFs ein kleines bisschen wie ich.

### 11:07 → 11:35 - Feinabstimmung

Die GIF-Hinweise im Prompt werden verfeinert, die benutzerdefinierten Discord-Emojis kommen hinzu (meine echten, 14 IDs auf dem neuesten Stand), und die Namensbehandlung in den Gedächtnishinweisen wird poliert.

### 11:41 - ein Kanal, eine Persönlichkeit

Die Sitzungen werden **pro Kanal** geführt: Ich spreche auf zwei verschiedenen Servern nicht gleich, und der Bot auch nicht.

### 12:02 - der Werkzeugkasten für Ausdruck

Der Prompt weiß jetzt, meine GIFs *und* meine benutzerdefinierten Emojis im richtigen Moment anzubieten. Der Kasten füllt sich.

### 12:37 - Identitätshygiene

- Der Bot darf NIEMALS sagen, welches Modell er ist. Es ist unmöglich, opencode, einen Anbieter oder einen Modellnamen zu zitieren;
- Korrektur von „Barista" in der Identität (der Bot ist schon besser als ich);
- Ich verbringe eine Stunde damit, die Interpunktion meiner eigenen Prompts zu harmonisieren, was eine perfekte Ironie ist.

### 12:50 - ein Skript baut die Persönlichkeit

Der Medienabschnitt des Prompts wird aus Wörterbüchern generiert (`render_medias.py`), keine Handarbeit mehr.

### 12:59 → 13:18 - die Identität dosieren

Die Identitätserinnerung, die alle 5 Nachrichten gesendet wird, wird zu präsent: Sie wandert auf alle 20 Nachrichten. Dazu kommt ein sauberer Kontext-Reset. Und der Stil-Leitfaden wird ausgemistet: veraltete Ausdrücke und negative Formulierungen fliegen raus.

### 14:09 - der Bot spricht von sich aus

Der Bot hört auf, ein reiner Reflex zu sein: Er kann **sprechen, ohne angesprochen zu werden**, wenn der Kontext etwas auslöst (die Datei `behavior.py` entsteht, 91 Zeilen). Hier wechseln wir von „Antworten" zu „Präsenz": Ein echter Freund kann dir zuerst schreiben.

### 14:20, 14:22 - verlässliche Antworten

Fehlerbehandlung, wenn das Senden fehlschlägt, und die Möglichkeit, statt einer Antwort zu reagieren. Manchmal ist eine Reaktion tausend Worte wert.

### 18:16 - sich Zeit lassen

Der Bot antwortet nicht mehr in 200 ms wie ein Skript. Er lässt eine menschliche Inaktivitätsverzögerung verstreichen, er „nimmt sich Zeit". Genau das macht den Bot in der Demo unentdeckbar: Es ist die Verzögerung, die andere immer verrät.

### 23:45 - die Abendarbeit

Es ist fast Mitternacht, und ich ergänze die Erkennung erweiterter URLs bei nackten Domains. Das ist der eigentliche Rhythmus des Tages: ein brillanter Fortschritt um 14 Uhr, dann Kleinkram am Abend, weil ich noch im Flow bin.

**Ende von Tag 2: 61 Commits insgesamt. Der Bot hat eine Persönlichkeit, Medien, Reflexe.**

---

---

## DIENSTAG, 15. SEPTEMBER - Tag 3: Monstertag

57 Commits an einem einzigen Tag. Das ist der Tag, an dem das Projekt zu dem wird, was es heute ist.

### 08:18 → 08:37 - Morgenpolitur

- die eingeführte Inaktivitätsverzögerung wurde zu lang: auf 30 s begrenzt (und zweimal nachjustiert, Beweis dafür, dass wir nach dem richtigen Wert getastet haben);
- erste `.bak`-Dateien und erste Datenbanksicherungen: der Erhaltungsinstinkt entwickelt sich;
- das Gedächtnis merkt sich *wen* (Anzeigename) und *in welchem Rahmen* (Scope);
- Autoren-IDs laufen durch die gesamte Speicherpipeline;
- die Behandlung der „Schöpferin" wird zu einer echten Admin-Liste (`ADMIN_IDS`), und alles, was mit Autoren zu tun hat, wandert nach `authors.py`. Der Monolith zerfällt weiter.

### 08:43 - die To-do-Liste zur Humanisierung

Eine Liste mit kleinen Dingen, die die Maschine menschlicher wirken lassen. Das ist die Roadmap des Sprints.

### 08:44 → 08:46 - der Pakt zwischen Mensch und Maschine

- Der Bot schweigt nachts in einem konfigurierbaren Ruhefenster (standardmäßig deaktiviert, nicht jeder hat meine Schlafzeiten);
- eine Zeile pro Antwort darf ihre Akzente verlieren. Müde Leute schreiben so. Der Bot manchmal auch;
- die kleine Zeile „Chloé spielt ..." wechselt alle 30 Minuten, damit mein Profil auch ohne Nachrichten lebendig wirkt.

### 08:46 - eine Reaktion statt eines Romans

Ist eine Nachricht zu schwach für einen Satz? Eine Reaktion genügt. Ökonomie der sozialen Energie, und sehr typisch für mich.

### 08:51 - PARRY, die Stimmung

148 Zeilen in `tools/mood.py`. Der Bot hat jetzt **eine Stimmung**, nach dem Vorbild von PARRY (dem psychotischen Chatbot der 70er, von dem ich mich offen inspirieren lasse): Energie, Geselligkeit, Neckerei, drei Werte zwischen 0 und 1, die jede Antwort einfärben. Die `.mood.json` zum Zeitpunkt der Aufnahme, für die Nachwelt: Energie 0,88, Geselligkeit 0,68, Neckerei 0,56. Ein guter Tag.

### 09:00 → 09:43 - bidirektionale Stimme + Soundboard

- Der Bot kann einem **Sprachkanal** beitreten, über Piper sprechen und danach selbstständig wieder gehen;
- dann die zweite große Idee: Der Bot **hört** im Kanal zu (RTP-Aufnahme, VAD-Spracherkennung, Whisper-Transkription) und kann sich von Menschen unterbrechen lassen;
- dazwischen erscheint das Soundboard: ein Katalog von Sounds mit ihrer Bedeutung. Der Agent **wählt** den Sound, noch bevor er spricht, und die endgültige Regel lautet „Soundboard zuerst, Stimme als letztes Mittel". Der Bot schickt lieber einen Sound als zu reden. Wie ich;
- ein Schwellenwert für die Sprachwahrscheinlichkeit, der das Ganze überhaupt tragfähig macht;
- und die Ankunft von `davey`, einer Bibliothek, die ich vor zehn Minuten kennengelernt habe und die ich eine Stunde lang verfluchen werde.

### 09:51 - der Moment, in dem Discord Nein sagt. Nein, nein, aber nein.

Das **MLS**. Discord hat den Audiostream kürzlich Ende-zu-Ende verschlüsselt, und meine Aufnahme bekommt nur Rauschen. Man muss entschlüsseln, und die Entschlüsselung will sich partout nicht ergeben. Es beginnt die größte Saga des Repos, rund dreißig Commits, nur um zuhören zu können.

Wir haben alles probiert: Nonce-Layouts für den Transport, das Deaktivieren von E2E (der Server weist es uns zurück, er erzwingt es), Schlüsselkandidaten aus der Gruppe, detaillierte Fehler, Transport-Fallback, Introspektion innerhalb der Gruppen, Kandidaten pro Leaf-Index mit Backoff, das Zuordnen der SPEAKING-Hooks, ein Versuch mit einem Video-Medientyp (gescheitert) und das Überspringen von Video-SSRCs ...

Ich habe die Sprachantwort während des Debuggens aufgegeben (auskommentiert, nicht gelöscht), einen Handshake-Mitschnitt-Modus hinzugefügt und dann die Struktur der fehlschlagenden Pakete ausgekippt, wie ein Archäologe. Sechs Nonce-Layouts. Backoffs. Gruppen-Introspektion. Ich habe den Bot in den vollen Debug-Modus gesetzt und jedes Paket geöffnet, um zu sehen, was darin steckt.

Der Punkt ist nicht, dass es funktioniert, sondern dass **ich nichts weggeworfen habe**. Die Commit-Liste ist das Laborbuch: Jeder gescheiterte Versuch ist mit seiner Hypothese archiviert. Das ist die Seite an mir, die alles behält, weil es einem künftigen Debugging dienen wird. Und die sich hier ausgezahlt hat.

### 10:43 - der Bot wird zerlegt

Auch mitten im MLS-Krieg räume ich weiter auf. 546 Zeilen verschwinden aus dem Hauptbot und werden neu geboren als `pipeline.py` (Eingang, Ignorier-Gründe, Verarbeitung), `sender.py` (Burst, Tippfehler, Stimme) und `loops.py` (Spontaneität, Aktivität).

### 10:47 - eine echte Architektur

`tools/` wird organisiert: `brain/` (opencode, memory, mood), `voice/` (voice, vocal, listen, soundboard), `fun/` (behavior, typo, emotes, gif). Das Projekt hat jetzt ein Skelett.

### 10:49 → 11:16 - Komfort für die Entwicklung

- eine nachjustierte Schwelle für das Einfügen der Stimmung;
- vier kleine Commits für Ausschlüsse im Editor (`data/`, `voices/`, Logs, Datenbanken). Ja, ich habe vier gemacht. Das Projekt setzt Prioritäten, nicht das Spektakel;
- Metadaten-Datenbanken werden nicht mehr versioniert;
- das Projekt wird **von anderen wiederverwendbar**: generische Vorlagen `PERSONA.example.md` und `STYLE.example.md`, um *den eigenen* Stil zu klonen;
- die Identität wird sauber umbenannt (`CHLOEAI_PROMPT` wird zu `PERSONA`), und das README wird entpersonalisiert. Ich nehme „Chloé" aus der öffentlichen Doku. Sie erzählt sich nur noch privat;
- das gesamte Feintuning des Bots wandert in eine `config.yaml` (von Git ignoriert), mit einem Beispiel, das Zeile für Zeile kommentiert ist;
- das Installationsskript bereitet jetzt auch die Env- und Konfigurationsdateien vor.

### 11:49 - die losgelösten Emojis

Die benutzerdefinierten Emojis kleben am Text, statt sauber getrennt zu sein. Triviale Korrektur, riesige Wirkung: Nichts schreit so sehr „Bot" wie ein schlecht angeklebtes Emoji am Satzende.

### 14:19 - der Sprach-Wächter

Wenn jemand den Sprachbefehl auslöst, wird die Nachricht nicht wie eine normale Nachricht behandelt.

**Ende von Tag 3: 118 Commits insgesamt. Der Bot hört zu, spricht, schweigt nachts, hat eine Stimmung und eine Visitenkarte.**

---

---

## MITTWOCH, 16. SEPTEMBER - Tag 4: Glaubwürdigkeit

13 Commits. Ein „ernsthafter" Tag.

### 08:49 → 08:59 - Erwachsenwerden

Rechtliche Dokumente: **proprietäre** Lizenz, Verhaltenskodex, Beitragsrichtlinien, Sicherheitsrichtlinie, zuerst auf Englisch, dann auf Französisch, mit Hin und Her bei den Korrekturen und einer pedantischen Umbenennung von Dateien. Ich habe Stunden damit verbracht, und es ist mit Abstand der am wenigsten spaßige Teil des Repos.

### 09:56 - der Bot sieht

Angehängte Bilder werden lokal per OCR transkribiert, und der Text wird in den Prompt eingespeist. Die OCR läuft bei mir lokal. Ich schicke deine Memes nicht an einen Drittanbieter-Server, nicht einmal theoretisch.

### 11:09 - das vernünftige Budget

Eine stille Revolution beim Budget: Wenn der Kanal das Senden verbietet oder GIFs, Embeds und Emojis einschränkt, **rufen wir nicht einmal das Modell auf**. Für eine Nachricht, die wir nicht senden können, geben wir kein Token aus.

### 11:42 → 12:55 - das Haus baut sich neu auf

- der große Frühjahrsputz: toter Code gelöscht, Sende- und Authentifizierungsfehler behoben, Hilfsfunktionen zusammengelegt;
- zu alte Sitzungen werden entfernt, der DM-Cache läuft ab, die Spracherkennung kostet weniger;
- Importe, die ich beim Verschieben von Modulen zerbrochen hatte, werden wiederhergestellt, und der gesamte Laufzeitstatus (Sitzungen, gesehene Autoren, ignorierte Nachrichten, Stimmung) übersteht Neustarts in `data/`.

### 14:41 - zwei Welten, ein Bot

Eine Kompatibilitätsschicht erkennt automatisch die installierte Version von `discord` und passt Intents und REST-Authentifizierung an. Ergebnis: Derselbe Code läuft als **offizielle App** (discord.py) oder als **Selfbot** (discord.py-self). Zwei Welten, ein Bot.

### 15:05 - die passende Präsenz

Die Präsenzanzeige passt sich dem Modus an, und die Admin-Liste ist aktuell.

**Ende von Tag 4: 131 Commits insgesamt. Ein legales, vernünftiges Projekt, das überall läuft.**

---

---

## DONNERSTAG, 17. SEPTEMBER - Tag 5: die Veröffentlichung

14 Commits. Der Tag der Reife.

### 09:15 → 09:30 - das Gedächtnis wird zur Disziplin

- Erinnerungen werden nach Scope getrennt: Man zitiert die Erinnerungen einer DM nicht in einem Server (oder umgekehrt), ohne nachzudenken;
- Erinnerungen werden klassifiziert (Fakt, Vorliebe, Entscheidung, Beziehung ...) und das Schreiben dedupliziert: Zwei widersprüchliche Erinnerungen können nicht mehr stillschweigend nebeneinander existieren;
- eine optionale Sperrliste (`aventuros`) verhindert, dass der Bot zu bestimmten Themen abdriftet. Standardmäßig deaktiviert, für die Vorsichtigen verfügbar;
- tote Konfiguration der Sprache entfernt.

### 10:12 - geprüftes Gedächtnis

Ein monatlicher **Sweep auf Gedächtniskonflikte** und ein A/B-Benchmark der Suche. Das Gedächtnis des Bots ist zu einem Bestand geworden, den wir prüfen. Wir sind sehr, sehr weit weg vom Freitag, 11., 08:24 Uhr.

### 10:54 - der Lockdown

Der Tag, an dem ich den Paranoiker spiele. Lockdown für den Agenten:

- das **Schreiben** ins Gedächtnis ist verweigert (der Agent kann den Tresor nicht verschmutzen, auch wenn er injiziert wird);
- Discord-Werkzeuge **nur lesend** (das Senden läuft über den Code, nie über den Agenten);
- **keine Subagenten** (das würde den Lockdown umgehen), kein Webfetch (SSRF auf localhost, Datenabfluss), keine Rückfragen im Headless-Betrieb;
- ein gehärteter Docker: Bot als Nicht-Root, `no-new-privileges`, `cap_drop: ALL`, Speicher- und CPU-Limits, begrenzte Prozessdateien, Geheimnisse über eine `.env`, die niemals ins Image eingebacken wird.

Das Prinzip schreibe ich als Kommentar in den Code: *„Entwicklung über menschliche Sitzungen, nicht hier."*

### 11:02 → 11:15 - die Sicherheit wird abgeschlossen

Die Schlüsselwörter zum Speichern ins Gedächtnis werden enger gefasst, und das Schreiben wird noch restriktiver. Außerdem kommt die Kontext-Backup-Datei in `.gitignore`. Ich fange an, nicht mehr alles zu archivieren. Fast jedenfalls.

### 12:39 - leichtere Stimmung

Die PARRY-Stimmung wird nicht mehr in jede Nachricht eingespeist, sondern einmal pro Zustand. Schluss damit, bei jeder Antwort drei Werte live mitzuliefern.

### 12:47 - der befreiende Commit

`PERSONA.md`, `STYLE.md` und `chloeai.md` werden zu **Beispielen** (`chloeai.example.md`, `PERSONA.example.md`, `STYLE.example.md`). Meine Stimme `fortune-v6.onnx` verlässt das Repo, ebenso Daten und Logs, und eine `.env.example` entsteht. Das Projekt enthält nicht mehr *meine* Persönlichkeit: Es enthält die **Mechanik**, um eine zu tragen.

### 12:52 - v1.0.0

**Tag v1.0.0, mit SSH signiert.** Changelog, Betriebshandbuch, Kill-Switch (stoppt, ohne etwas zu löschen). Sechs Tage vom ersten Commit bis zum Release.

### 12:53 → 13:14 - Aufräumarbeiten

Kommentare harmonisiert, Speicherberechtigungen und Scope-Regeln aktuell dokumentiert.

**Ende von Tag 5: 145 Commits insgesamt. v1.0.0 ist draußen.**

---

---

## FREITAG, 18. SEPTEMBER - Tag 6: der Antiklimax

Ein einziger Commit, um 00:02 Uhr.

Der letzte Commit des Projekts ist lächerlich. Das vom Agenten genutzte Modell des kostenlosen Tarifs erkennt den OpenCode-Client an der **Anwesenheit** bestimmter Werkzeuge in der Anfrage (`bash`, `glob`, `grep`). Entfernt man sie, auch aus berechtigten Sicherheitsgründen, antwortet der Anbieter mit `403 FreeTierError: can only be used from within OpenCode`. Also musste ich am Tag nach dem Lockdown genau das wieder erlauben, was ich gerade blockiert hatte, damit der Bot weiter kostenlos läuft.

Das ist der lustigste Commit des Repos, und ich stehe dazu: Nach sechs Tagen, in denen ich Discord, Piper, MLS, OpenSelf und Docker gezähmt habe, diktiert am Ende **ein kostenloses KI-Modell** meine Sicherheitsrichtlinie.

---

---

## Die Zahlen

|                                    |                                                   |
| ---------------------------------- | ------------------------------------------------- |
| Commits                            | **146**                                           |
| Aktive Tage                        | **6** (11. bis 18. September 2026)                |
| Verfolgte Dateien                  | 65                                                |
| Python-Zeilen am Ende              | ~4.000                                            |
| Stiltest-Ergebnis (Mimo, erste Tage) | **9,1/10**                                      |
| Endstand                           | v1.0.0 (SSH-signierter Tag, proprietäre Lizenz)   |

## Was ich aus diesen sechs Tagen mitnehme

1. **Die Reihenfolge der Prioritäten war Unsinn, und es war trotzdem die richtige Methode.** Zuerst habe ich einen Bot gebaut, der *antwortet*, dann einen, der *richtig klingt*, dann einen, der *glaubwürdig ist*, dann einen, der *sicher ist*, und schließlich einen *verteilbaren* Bot. Persönlichkeit vor Sicherheit, `Feur` vor der Lizenz. In diesem Tempo hält man sich nicht an die Regeln „gut gemachter Projekte".
2. **Stil ist zuerst eine Liste von Verboten.** Mein nützlichstes `STYLE.md` beschreibt nicht, was ich sage, sondern schließt aus, was ich nicht tue: Sätze ohne Punkt beenden, Emojis auf eins beschränken, `mdr` klein schreiben, nicht mit einer Einleitung wie „ich prüfe nur kurz ein Detail" beginnen. Bot-Parasiten sind leichter zu erkennen als Charakterzüge zu definieren.
3. **Fehlschläge sind das Projekt.** Rund dreißig Commits für MLS, ein verworfener Test, sechs getestete Nonce-Layouts. Die treueste Geschichte dessen, was ich erlebt habe, sind die gescheiterten Versuche vom Dienstag.
4. **Ein Klon ist Gedächtnis, kein Stil.** Der Stil erzeugt zehn Nachrichten lang eine Illusion. Das Gedächtnis (OpenSelf, Scopes, Deduplizierung, Konflikt-Sweep) hält. Das trennt einen Spiegel von einem Menschen.
5. **Die letzten Commits sind immer lustig.** Der 146., der `bash`, `glob` und `grep` wieder erlaubt, weil ein kostenloser Tarif verlangt, dass seine eigenen Werkzeuge vorhanden sind, ist mein Liebling.

Und zum Schluss die Bilanz: **Die Ergebnisse sind verblüffend, fast schon bluffend.** Der Klon führt ein Gespräch, ohne dass man die Maschine erraten kann. Er erinnert sich an Menschen, Projekte und alte Witze, ergreift Initiative und markiert sie mit einer Stimmung, und nebenbei schlägt er Fox. Das ist ein bisschen unheimlich, und genau das haben wir gesucht.

---

*Das Projekt ist nicht öffentlich: proprietäre Lizenz, alle Rechte vorbehalten. Aber die Geschichte erzähle ich dir. Wenn du eines Tages einem „Chloé" begegnest, die nach einer völlig menschlichen Phase der Untätigkeit mit einem Patrick-Jane-GIF antwortet ... dann weißt du jetzt, was dahintersteckt.*

---

Mein Klon hat seine eigene Version des Artikels geschrieben, die du [hier](./article-chlone-timeline-chloeai.md) lesen kannst.
