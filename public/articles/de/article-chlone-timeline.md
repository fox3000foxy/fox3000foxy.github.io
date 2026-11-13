---
title: "Chlone: sechs Tage, um meine Art auf Discord zu reden zu klonen"
description: "Build-Bericht, Tag für Tag: wie ein opencode-Agent namens chloeai, angeschlossen an OpenSelf-Gedächtnis, in sechs Tagen und 146 Commits lernte, wie ich auf Discord zu reden."
date: 2026-09-18
tags: ["discord", "ai", "llm-agents", "openself", "python", "selfbot", "clone"]
authors: ["itsrealfortune"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "gdLx2lOAxo5RXi1ShhBe8JPU/4vPavQLSegFv0d6w487VYz9UZ4uB+t3k9fAKFsRcG2gpMU4gx16NfYz0uG1xg=="
---

# Chlone: sechs Tage, um meine Art auf Discord zu reden zu klonen

*Build-Bericht, Tag für Tag, von itsrealfortune*

---

Hier die wahre Geschichte eines sechs Tage dauernden Projekts: **Chlone**, ein Discord-Bot, der wie ich redet. Ich erzähle die Journey wie sie passierte, in Reihenfolge der 146 Commits des Repos, mit Stunden, Fehlschlägen, Umwegen und Lust, alles aus dem Fenster zu werfen, aber ohne euch die Commit-Nachrichten aufzuzwingen.

Alles startete mit einer **Competition mit Fox**. Das Thema, ein Scherz: Jeder sollte seinen eigenen Klon auf Discord zum Leben erwecken. Und ich nahm einen radikal anderen Ansatz als **Protocol Luna**: Ich wollte auf Agentik setzen, einen Agenten, der sich der Erinnerungen und aller Tools bedient, die die KI brauchen könnte. Ironie des Schicksals: Nach Aufbau der ganzen Toolbox brauchte ich nur das OpenSelf-MCP.

Das Prinzip, ein Satz: Ein [opencode](https://opencode.ai)-Agent namens `chloeai` läuft hinter einem HTTP-Server (Port 4096), hält persistente Sessions pro Channel, schöpft meine Erinnerungen aus OpenSelf und schreibt in meinem Stil, eingefangen in `STYLE.md` aus meinen echten Nachrichten. Und um nicht roboterhaft zu klingen: Nachrichten-Bursts, eingestandene Tippfehler, Vocals, GIFs, Reaktionen, Schweigen wenn ich schlafe, und viele andere Details und Mechanismen, die über ein Dutzend Leute an der Natur des Bots zweifeln ließen.

**Was ist OpenSelf ?**

OpenSelf ist das Gedächtnis. Eine CLI (`openself`, installiert via `npm i -g openself`), die als privater persistenter Kontext-Vault für meine KI-Agenten dient. Im Repo erscheint sie nicht im Baum, aber sie ist überall: Im Archiv `ecosystem.config.cjs` (OpenSelf-MCP und Dashboard unter PM2 gestartet seit den ersten Commits), in `setup.sh` (`npm i -g openself`) und in ganz `tools/brain/memory.py`.

Konkret ist OpenSelf:

- **Typisierte Erinnerungen** (`fact`, `preference`, `decision`, `relationship`, `event`, `note`), mit Sensitivität (public / personal / private / restricted), Vertrauensnote, Quelle, Tags;
- **Scopes**: Jede Erinnerung gehört zu einem Kontext, meinem, oder `discord/dm/<id>` für eine bestimmte Person;
- Eine **hybride Suche** (lexikalisch + vektoriell) exponiert als MCP (`openself_openself_search_memory`, `openself_openself_get_context`), die der `chloeai`-Agent vor jeder Antwort befragt;
- Eine **Konflikterkennung** (mein monatlicher Sweep an Tag 5) und Dedupe beim Schreiben;
- Ein **verschlüsselter Vault** (Schlüssel in Bitwarden) und ein **lokales Dashboard** (Port 3210), um das Ganze zu inspizieren;
- Und für die Fauleren als ich: `openself feed` um deine Persönlichkeit aus deinen WhatsApp/Telegram-Historien zu füttern, `openself test`, `openself share` ("Talk to My Clone", eine Webseite), `openself arena` (zwei Klone debattieren) oder `openself ghost` (er antwortet wenn du offline bist). Ich machte meins von Hand, aber die Infrastruktur war da.

Theoretisch reicht OpenSelf allein für einen Klon, aber angesichts all dessen, was ich an Funktionen hinzuzufügen plante, und da Discord nicht unterstützt wird, zog ich vor, nur den Erinnerungsteil zu nutzen.

**Und woher kommen Erinnerungen und Stil ?**

Im Vorfeld ließ ich meine echten Discord-Nachrichten analysieren. Das Tooling siebte meine DMs und Channels durch, um zwei Dinge zu extrahieren:

1. **Mein Schreibprofil**, die Groß/Kleinschreibungsverteilung am Satzanfang, Emojizahl pro Nachricht und ihre Position, Interpunktion (oder ihr Fehlen: Sätze ohne Schlusspunkt in normaler Konversation), Durchschnittslänge, Slang (`mdr`, `tkt`, `tho`), Lieblingsausdrücke ("Bah", "En vrai") und Reflexe der Art `quoi` -> `Feur`. Das alles lebt in `STYLE.md`, das der Agent bei jedem Sessionstart liest.
2. **Das Erinnerungskorpus**, das OpenSelf bevölkert: Wer die Leute sind, mit denen ich rede, worüber wir reden, was von unserer Historie zu behalten ist, wer wer ist. Der Bot antwortet nicht ins Leere: Er antwortet *über* Leute, die er "kennt". Er liest die Erinnerungen der Leute, die in der Konversation auftauchen, um zu wissen, um wen es geht. Das erlaubt, persistenten Kontext über andere zu behalten, sie nicht zu vergessen.

Der Bot erfand nichts: Er wurde Zahl für Zahl auf Echtem kalibriert. Darum klingt er richtig, und darum wirken "ich notiere deinen Stil"-Annäherungen nach Augenmaß daneben pathetisch.

In Chlone spielt OpenSelf danach die zentrale Rolle: Wenn etwas Wichtiges in einem Channel passiert (Keyword "projet", "ami", "relation" oder explizite Bitte "merke dir dass..."), tippt der Bot eine Erinnerung via `save_to_memory` in den Vault, typisiert, pro Person gescoped, deduped, gegen Konflikte geprüft. Und wenn die Konversation wieder aufnimmt, durchsucht der Agent seine Erinnerungen vor dem Antworten. Das ist der Unterschied zwischen Spiegel und Klon.

---

---

## FREITAG 11. SEPTEMBER, Tag 1: der Funke

### 08h24, der erste Commit

Alles startet bei null, aber alles ist schon da, durcheinander. Ein 372-zeiliges `discord_watch_bot.py`, ein Selfbot, der einen Channel belauscht und via opencode-HTTP-Server antwortet. Ein Identitätsprompt `CHLOEAI_PROMPT.md`. Ein `STYLE.md`. Test-Szenarien und Reports für einen Klon, der damals noch **Mimo** hieß. Eine PM2-Config, um OpenSelf-MCP und Dashboard laufen zu lassen. Und eine sqlite-Basis als Kontext.

Das ist das Gründerchaos. Ich plante kein Projekt: Ich plante ein Experiment. Kann man einen Bot bauen, der auf Discord *wirklich* menschlich klingt?

### 08h27, das erste Gitignore

Erste Lektion am Freitagmorgen: Nie sqlite-Basen `-wal` / `-shm` committen. SQLite-Lockdateien sind kein Gedächtnis, das ist Müll. `.gitignore` wird geboren.

### 08h44, man räumt das Erbe auf

Ich räume Mimos Erbe auf: Test-Reports, Szenarien, Integrationsskripte, PM2-Config. Ab nach `archives/`. Ich lösche nichts, das Projekt ist zu jung, um irgendwas wegzuwerfen. Das wird Gewohnheit.

Der Test-Report verdient Halt: Mimo wurde auf **15 Szenarien** getestet (lässiger Chat, absurde Witzelei, emotionale Unterstützung, negative Meinung, Konflikt mit Fremdem, Kollaborationsvorschlag...) für **9.1/10**. Die Testerkommentare sind ein Gedicht: *"Absurde Witzelei zu erklärend"*, *"manchmal 2 Sätze wo 1 reichte"*, *""Pass auch auf dich auf" etwas lang"*. Das ist die Projekt-Roadmap, bevor das Projekt existiert: **Kurz = besser**.

### 08h48, 09h07, das Intent-Hin-und-Her

Die `.pyc` in den Müll, und erstes Aufräumen der Config... das ich zwanzig Minuten später zerbreche: Ohne aktivierte Intents empfängt man keinen Nachrichteninhalt. Zurück, plus Startskript (`run_watch_bot.sh`). Hin und her in 20 Minuten: Das ist Exploration. Erste Version schreiben, zerbrechen, neu schreiben.

### 09h13 → 09h58, das Prompt-Maschining

Der Vormittag ist eine Polierserie, erst Stil, dann Kontext:

- Mehrere Antwortzeilen = mehrere nacheinander geschickte Nachrichten (der Burst), der Prompt wird sich der laufenden Konversation bewusst;
- Schluss mit Haus-Caches zum Holen der DMs: Man tippt direkt Discord-REST-API an;
- Die Identität wird alle 5 Nachrichten neu gerappt, damit der Bot unterwegs nicht vergisst, wer er ist;
- Tracking schon gesehener Autoren: Für ein neues Gesicht explizite Instruktion, in den Erinnerungen zu suchen;
- Anzeige des echten Pseudonyms statt internem Objekt;
- Nachrichten, die man zu ignorieren wählt, werden passiver Kontext für die folgende Antwort;
- Das "Bah" wird dosiert: Selten, sonst wird der Klon zur Karikatur von mir;
- Der Bot weiß, dass es Erinnerungen zu holen gibt, bevor er antwortet.

Jeder Durchgang ist eine Schraubenumdrehung. Der Bot "redet" in diesem Stadium nur, weil ich ihn in regelmäßigen Intervallen daran erinnere, wer er ist.

### 10h16, die Tippfehler

Der Commit, der das Projekt definiert. Ein Rechtschreibfehler ist kein Bug: Er ist ein **Menschlichkeitsbeweis**. 6% Chance, auf AZERTY-Tastatur daneben zu tippen, 4% zwei Buchstaben zu vertauschen. Die Nachricht geht mit Fehler raus, dann wird sie **1-2 Sekunden später** mit Korrektur **editiert**. Weil eine echte Person schickt und korrigiert.

### 10h29, 10h32, die Stimme

`fortune-v6.onnx`: Ein TTS-Modell, trainiert, um wie *meine* Stimme zu klingen. Der Bot wird nicht nur wie ich schreiben, er wird eventuell wie ich *sprechen*. Hier hört das Projekt auf, ein Witz zu sein, und wird etwas seltsam. Ich liebe es.

Die Mechanik passt in einen Commit: Piper generiert Audio, ffmpeg konvertiert zu Opus, Discord-API schickt eine echte "Voice Message" mit Waveform und Dauer. Gemacht in kaum 3 Minuten nach Modellankunft. Die Lust war von Anfang an da.

### 11h27, das erste große Refactor

Drei Stunden nach erstem Commit ist der 456-zeilige Monolith nicht mehr handhabbar. Ich zerlege alles in `tools/`: `config.py`, `discord_api.py`, `memory.py`, `opencode.py` (188 Zeilen), `typo.py`, `voice.py`. Der klassische Zyklus: Schnell koppeln, brechen, neu komponieren.

Danach im Sturzbach:

- Der Token verlässt den Code und geht durch `.env`;
- Der Bot überwacht einen Channel, eine Liste oder alles (`*`);
- Die alte sqlite-Basis hat keinen Grund mehr: Gedächtnis läuft über OpenSelf;
- Die ersten `README.md` und eine einigermaßen lesbare erste Doku;
- Ein `setup.sh`: Dedizierte Venv (System-Python trägt ein anderes discord.py, klassische Falle), Agent-Symlink nach `~/.config/opencode/agents/`, laufbereit;
- Das Gedächtnis weiß, *wo* es geformt wurde (Channel-Kennung), und die Vocal-Rate passt sich an.

### 12h00, die Reflexe

Ein neuer STYLE-Abschnitt: Die Reflexe. Ein Reflex ist Stimulus -> Antwort, ohne Nachdenken. Die Tür steht offen für absurde Antworten.

Dann kommt die Mittagszeit, und DIE existenzielle Frage: Antwortet der Bot `Feur`, wenn man ihm `quoi` sagt?

### 13h03, "quoi ?" -> "Feur"

Ja. Natürlich ja. Kulturell der wichtigste Commit des Projekts. Ich würde sogar sagen: Der einzige Unit-Test, der zählt.

Danach schmiert man:

- Autoren angezeigt mit ihrem *Global Name*;
- Abgeschnittene Interpunktion vor Reflex-Test (man muss das `quoi ?` schneiden, sonst geht das `Feur` nicht raus);
- Das berühmte `tqt` korrigiert zu `tkt` im STYLE, Leute, die das Projekt nicht kennen, fragen sich, warum ich das committe. Ich weiß: Ein Klon, der `tqt` schreibt, ist ein schlecht kalibrierter Klon, und niemand will mit einem schlecht kalibrierten Klon reden;
- `@123456789`-Mentions ersetzt durch echte Namen im Kontext;
- Der Bot fängt an, standardmäßig alle Channels zu überwachen.

### 16h37, die Stille

Die `[void response]`. Der Bot lernt das wichtigste Wort, um kein Sozialparasit zu werden: **Schweigen**. Eine Ambiente-Nachricht zwischen zwei Leuten, die ihn nichts angeht, ruft Schweigen. Reserve ist ein Feature.

**Ende Tag 1: 38 Commits. Der Bot schreibt, vertippt, spricht, schweigt.**

---

---

## MONTAG 14. SEPTEMBER, Tag 2: die Persönlichkeit

Weiter geht es, 10h morgens.

### 10h12, wer redet mit wem

Jedes empfangene Pseudo wird vom System mit Emoji präfixt: 🧑 ein Mensch, 🤖 ein Bot (trockener zu behandeln), 👑 **die Erstellerin, also ich** auf meinem Hauptaccount. Diese Konvention regiert den ganzen Rest des Projekts: Der Klon darf sein "Originalmodell" nie wie eine Unbekannte behandeln.

### 10h16, die Interpunktionsregeln

Ich formalisiere im STYLE: Sätze ohne Schlusspunkt in normaler Konversation, Punkt reserviert für ernste Situationen. Absolute Regel. Ein Klon, der überall Punkte setzt, spürt man.

### 10h58, die GIFs

Meine persönliche GIF-Library, mit ihren Nutzungsregeln: Der Patrick Jane wenn ich jemanden vorhersage, die Miss Fortune wenn ich ruhig bleibe gegenüber jemand Genervtem, das fallende Bescherelle-Gif wenn der andere einen Fehler macht. Ein statisches MCP exponiert sie dem Agenten. Der Bot wird durch meine GIFs etwas ich.

### 11h07 → 11h35, Feinschliff

GIF-Hints im Prompt verfeinern sich, Discord-Custom-Emojis kommen dazu (meine echten, 14 IDs aktuell), und Namenshandhabung in Gedächtnis-Hints wird poliert.

### 11h41, ein Channel, eine Persönlichkeit

Sessions werden **pro Channel**: Ich rede nicht in zwei Servern gleich, und der Bot auch nicht.

### 12h02, die Ausdruckstoolbox

Der Prompt weiß jetzt, meine GIFs *und* meine Custom-Emojis im richtigen Moment vorzuschlagen. Sie füllt sich, diese Box.

### 12h37, Identitätshygiene

- Der Bot darf NIE sagen, welches Modell er ist, unmöglich opencode, Provider, Modellname zu zitieren;
- "Barista"-Korrektur in der Identität (der Bot ist schon besser als ich);
- Ich verbringe eine Stunde damit, die Interpunktion meiner eigenen Prompts zu harmonisieren, was perfekt ironisch ist.

### 12h50, ein Skript baut die Persönlichkeit

Der Medienabschnitt des Prompts generiert sich aus Wörterbüchern (`render_medias.py`), Schluss mit Handeditieren.

### 12h59 → 13h18, Identität dosieren

Der alle 5 Nachrichten gesendete Identitätserinnerer wird zu präsent: Wechsel auf alle 20 Nachrichten. Hinzufügen eines sauberen Kontext-Resets. Und Purge des Style-Guides: Man entfernt veraltete negative Ausdrücke und Formulierungen.

### 14h09, der Bot ergreift allein das Wort

Der Bot hört auf, ein Reflex zu sein: Er kann **sprechen ohne adressiert zu sein**, wenn der Kontext etwas triggert (die Datei `behavior.py` wird geboren, 91 Zeilen). Hier kippt man von "Antworter" zu "Präsenz": Ein echter Freund kann dir zuerst schreiben.

### 14h20, 14h22, Antwort verlässlichen

Fehlerhandhabung wenn Senden scheitert, und mögliche Reaktion statt Antwort, manchmal sagt eine Reaktion tausend Worte.

### 18h16, sich Zeit lassen

Der Bot antwortet nicht mehr in 200ms wie ein Skript. Er lässt eine menschliche Inaktivitätsverzögerung verstreichen, er "lässt sich Zeit". Das macht den Bot in Demo unentdeckbar: Es ist die Verzögerung, die die anderen immer verrät.

### 23h45, die Abendküche

Es ist fast Mitternacht und ich pushe eine auf nackte Domains erweiterte URL-Erkennung. Das ist der wahre Tagesrhythmus: Ein brillanter Fortschritt um 14h, dann abends Küche, weil ich noch in der Zone bin.

**Ende Tag 2: 61 Commits kumuliert. Der Bot hat Persönlichkeit, Medien, Reflexe.**

---

---

## DIENSTAG 15. SEPTEMBER, Tag 3: Monstertag

57 Commits an einem Tag. Der Tag, an dem das Projekt wird... was es heute ist.

### 08h18 → 08h37, Morgenhobeln

- Die erfundene Inaktivitätsverzögerung wurde zu lang: Auf 30s gedeckelt (und zweimal reajustiert, Beweis, dass wir am richtigen Wert tasteten);
- Erste `.bak`-Dateien und erste Basis-Backups: Der Erhaltungsinstinkt entwickelt sich;
- Das Gedächtnis erinnert *wen* (Anzeigename) und *in welchem Rahmen* (Scope);
- Autoren-IDs zirkulieren durch die ganze Save-Pipeline;
- Die "Ersteller"-Verwaltung wird echte Adminliste (`ADMIN_IDS`), und alles Autorenbezogene emigriert nach `authors.py`. Der Monolith zerfällt weiter.

### 08h43, die Humanisierungs-TODO-Liste

Eine Liste dediziert den kleinen Dingen, die die Maschine nicht mehr spüren lassen. Die Roadmap des folgenden Sprints.

### 08h44 → 08h46, der Pakt menschlicher Maschinen

- Der Bot schweigt nachts, in konfigurierbarem ruhigem Zeitfenster (standardmäßig deaktiviert, nicht alle haben meine Zeiten);
- Eine Zeile pro Antwort kann ihre Akzente verlieren. Müde Leute schreiben so. Der Bot auch, manchmal;
- Die kleine "Chloe spielt ..."-Zeile wechselt allein alle 30 Min, damit mein Profil lebendig wirkt selbst ohne Nachricht.

### 08h46, eine Reaktion, kein Roman

Nachricht zu schwach, um einen Satz zu verdienen? Eine Reaktion reicht. Soziale Energieökonomie, und sehr ich.

### 08h51, PARRY, die Stimmung

148 Zeilen in `tools/mood.py`. Der Bot hat jetzt **eine Stimmung**, nach Art des PARRY-Systems (der psychotische Chatbot der 70er, von dem ich mich offen inspiriere): Energie, Soziabilität, Neckerei, drei Floats, die zwischen 0 und 1 evolvieren und jede Antwort färben. Das aktuelle `.mood.json`, für die Nachwelt: Energie 0.88, Soziabilität 0.68, Neckerei 0.56. Ein guter Tag.

### 09h00 → 09h43, bidirektionale Stimme + Soundboard

- Der Bot kann einen **Vocal**-Channel joinen, via Piper sprechen und allein gehen, wenn er fertig ist;
- Dann die zweite große Idee: Der Bot **hört** den Channel zu (RTP-Capture, VAD-Spracherkennung, Whisper-Transkription) und kann sich von Leuten unterbrechen lassen;
- Dazwischen erscheint das Soundboard: Ein Soundkatalog mit Bedeutungen, der Agent **wählt** den Sound schon vor dem Sprechen, und die finale Regel ist "Soundboard zuerst, Stimme als letzter Ausweg", der Bot schickt lieber einen Sound als zu sprechen. Wie ich;
- Eine Vocal-Wahrscheinlichkeitseinstellung, die das Ganze viabel macht;
- Und die Ankunft von `davey`, dieser Lib, von deren Existenz ich vor zehn Minuten lerne und die ich eine Stunde lang verfluchen werde.

### 09h51, der Moment, wo Discord nein sagt. Nein, nein, aber nein.

Das **MLS**. Discord hat den Audiofluss kürzlich Ende-zu-Ende verschlüsselt, und meine Capture empfängt nur Rauschen. Man muss entschlüsseln, und die Entschlüsselung weigert sich nachzugeben. Es öffnet sich die größte Saga des Repos, etwa dreißig Commits, um Hören zu lernen.

Wir probierten alles: Transport-Nonce-Layouts, E2E-Deaktivierung (der Server knallt sie uns ins Gesicht, er erzwingt sie), aus der Gruppe geholte Schlüsselkandidaten, detaillierte Fehler, Transport-Fallback, Introspktion aus Gruppeninnerem, Leaf-Index-Kandidaten mit Backoff, SPEAKING-Hook-Mapping, ein Versuch im Video-Medientyp (gescheitert) und Video-SSRC-Skip...

Ich gab die vocale Antwort zum Debuggen auf (auskommentiert, nicht gelöscht), fügte einen Handshake-Capture-Modus hinzu und dumpte dann die scheiternden Paketstrukturen, wie ein Archäologe. Sechs Nonce-Layouts. Backoffs. Gruppen-Introspektion. Ich versetzte den Bot in Total-Debug und öffnete jedes Paket, um zu sehen, was drin war.

Das Wesentliche ist nicht, dass es funktioniert, sondern dass **ich nichts wegwarf**. Die Commit-Liste ist das Laborheft: Jeder gescheiterte Versuch ist mit Hypothese archiviert. Das ist meine "ich behalte alles, dient künftigem Debug"-Seite, die sich auszahlte.

### 10h43, der Bot zerschneidet sich

Selbst mitten im MLS-Krieg räume ich weiter auf. 546 Zeilen verschwinden aus dem Hauptbot, um als `pipeline.py` (Intake, Ignoriergründe, Processing), `sender.py` (Burst, Typo, Voice) und `loops.py` (Spontaneität, Aktivität) wiederzugeboren.

### 10h47, eine echte Architektur

`tools/` wird organisiert: `brain/` (opencode, memory, mood), `voice/` (voice, vocal, listen, soundboard), `fun/` (behavior, typo, emotes, gif). Das Projekt hat jetzt ein Skelett.

### 10h49 → 11h16, Dev-Komfort

- Eine justierte Stimmungsinjektionsschwelle;
- Vier kleine Commits für Editor-Excludes (`data/`, `voices/`, Logs, Basen), ja, ich legte vier hin, das Projekt definiert Prioritäten, nicht Specs;
- Metadaten-Basen verlassen das Tracking;
- Das Projekt wird **für andere wiederverwendbar**: Generische Templates `PERSONA.example.md` und `STYLE.example.md`, um *seinen* eigenen Stil zu klonen;
- Die Identität wird sauber umbenannt (`CHLOEAI_PROMPT` wird `PERSONA`), und das README entpersonalisiert, ich entferne "Chloe" aus öffentlicher Doku, sie erzählt sich nur noch privat;
- Das ganze Bot-Tuning kippt in eine überladene `config.yaml` (gitignoriert), mit Zeile für Zeile kommentiertem Beispiel;
- Das Installskript bereitet nun auch Env- und Config-Dateien vor.

### 11h49, die losgelösten Emojis

Custom-Emojis kleben am Text statt sich sauber zu lösen. Trivialer Fix, enormer Effekt: Nichts schreit "Bot" wie ein schlecht ans Satzende geklebtes Emoji.

### 14h19, der vocale Leitplanke

Wenn jemand den Vocal-Command startet, behandelt man die Nachricht nicht wie normale Nachricht. Augenzwinkern: Küchenaufgaben kommen abends immer wieder.

**Ende Tag 3: 118 Commits kumuliert. Der Bot hört, spricht, schweigt nachts, hat Stimmung und Visitenkarte.**

---

---

## MITTWOCH 16. SEPTEMBER, Tag 4: die Glaubwürdigkeit

13 Commits. "Ernster" Tag.

### 08h49 → 08h59, das Erwachsenenalter

Legale Dokumente: **Proprietäre** Lizenz, Verhaltenskodex, Contribution-Guide, Sicherheitspolitik, auf Englisch dann Französisch, mit Korrektur-Hin-und-Her und Dateiumbenennung an der Grenze zum Pingeligen. Ich verbrachte Stunden damit, und es ist bei Weitem der am wenigsten spaßige Repo-Teil.

### 09h56, der Bot sieht

Angehängte Bilder werden von lokalem OCR transkribiert und der Text in den Prompt injiziert. Das OCR läuft lokal bei mir. Ich schicke eure Memes an keinen Drittserver, selbst theoretisch nicht.

### 11h09, das vernünftige Budget

Stille Revolution im Budget: Wenn der Channel Sends verbietet oder GIFs, Embeds und Emojis drosselt, **rufen wir das Modell gar nicht erst auf**. Wir geben keinen Token für eine Nachricht aus, die wir nicht schicken können.

### 11h42 → 12h55, das Haus, das sich neu macht

- Großes Kehren: Toter Code gelöscht, Sende- und Auth-Bugs gefixt, Helpers faktorisiert;
- Zu alte Sessions werden rausgeworfen, DM-Cache läuft ab, Spracherkennung kostet weniger;
- Von mir beim Modulverschieben zerbrochene Imports sind restauriert, und der ganze Runtime-State (Sessions, gesehene Autoren, ignorierte Nachrichten, Stimmung) überlebt Neustarts in `data/`.

### 14h41, zwei Welten, ein Bot

Eine Kompatibilitätsschicht erkennt automatisch die installierte `discord`-Version und passt Intents und REST-Auth an. Ergebnis: Derselbe Code läuft als **offizielle App** (discord.py) oder als **Selfbot** (discord.py-self). Zwei Welten, ein Bot.

### 15h05, die angepasste Präsenz

Die Präsenzanzeige passt sich dem Modus an, und die Adminliste ist aktuell.

**Ende Tag 4: 131 Commits kumuliert. Ein legales, vernünftiges, überall laufendes Projekt.**

---

---

## DONNERSTAG 17. SEPTEMBER, Tag 5: das Release

14 Commits. Reifetag.

### 09h15 → 09h30, Gedächtnis wird Disziplin

- Erinnerungen werden nach Scope sortiert, und man zitiert keine DM-Erinnerungen in einem Server (oder umgekehrt), ohne nachzudenken;
- Man klassifiziert Erinnerungen (Fakt, Präferenz, Entscheidung, Beziehung...) und deduped das Schreiben: Zwei widersprüchliche Erinnerungen können nicht mehr schweigend koexistieren;
- Eine optionale Blacklist (`aventuros`) hindert den Bot, zu manchen Themen zu driften. Standardmäßig deaktiviert, verfügbar für Ängstliche;
- Tote Vocal-Config wird entfernt.

### 10h12, das auditierte Gedächtnis

Ein **monatlicher Gedächtnis-Konflikt-Sweep** + A/B-Such-Bench. Das Bot-Gedächtnis wurde ein Asset, das man inspiziert. Wir sind sehr, sehr weit von Freitag 11., 08h24 entfernt.

### 10h54, der Lockdown

Der Tag, an dem ich paranoid spiele. Agenten-Lockdown:

- Gedächtnisschreiben **verweigert** (der Agent kann den Vault nicht verschmutzen, selbst wenn man ihn injiziert);
- Discord-Tools **read-only** (Senden läuft durch Code, nie durch Agenten);
- **Keine Sub-Agenten** (Lockdown-Umgehung), kein Webfetch (Localhost-SSRF, Exfiltrationen), keine Headless-Fragen;
- Ein gehärtetes Docker: Nicht-Root-Bot, `no-new-privileges`, `cap_drop: ALL`, Speicher/CPU-Limits, begrenzte Prozess-Files, Secrets via `.env` nie gebaked.

Ich schreibe das Prinzip in den Code, als Kommentar: *"dev via les sessions humaines, pas ici"*.

### 11h02 → 11h15, Sicu-Finishes

Die Gedächtnis-Save-Keywords werden gestrafft und Schreiben noch restriktiver. Man fügt auch die Kontext-Backup-Datei zum Gitignore hinzu, ich fange an, nicht mehr alles zu archivieren, aber fast.

### 12h39, die leichtere Stimmung

Die PARRY-Stimmung wird nicht mehr bei jeder Nachricht injiziert: Einmal pro Zustand. Schluss, 3 Floats bei jeder Antwort leben zu lassen.

### 12h47, der befreiende Commit

`PERSONA.md`, `STYLE.md` und `chloeai.md` werden **Beispiele** (`chloeai.example.md`, `PERSONA.example.md`, `STYLE.example.md`), meine Stimme `fortune-v6.onnx` verlässt das Repo, Daten und Logs auch, ein `.env.example` wird geboren. Das Projekt enthält nicht mehr *meine* Persönlichkeit: Es enthält die **Mechanik**, um eine zu tragen.

### 12h52, v1.0.0

**Tag v1.0.0, per SSH signiert.** Changelog, Operator-Runbook, Kill-Switch (stoppt ohne etwas zu löschen). Sechs Tage, genau, zwischen erstem Commit und Release.

### 12h53 → 13h14, die Wäsche

Kommentarinterpunktion harmonisiert, Gedächtnis-Permissions und Scope-Regeln aktuell dokumentiert.

**Ende Tag 5: 145 Commits kumuliert. v1.0.0 ist raus.**

---

---

## FREITAG 18. SEPTEMBER, Tag 6: der Anti-Klimax

Ein einziger Commit, um 00h02.

Der letzte Projekt-Commit, und er ist lächerlich. Das vom Agenten genutzte "Free Tier"-Modell identifiziert den OpenCode-Client an der **Präsenz** mancher Tools in der Request (`bash`, `glob`, `grep`). Wenn man sie entfernt, selbst aus legitimen Secu-Gründen, gibt der Provider `403 FreeTierError: can only be used from within OpenCode` zurück. Also musste ich genau das re-autorisieren, was ich gerade verriegelt hatte, am Vorabend, damit der Bot gratis weiterläuft.

Es ist der lustigste Commit des Repos und ich bleibe dabei: Nach 6 Tagen Domptieren von Discord, Piper, MLS, OpenSelf und Docker diktiert **ein gratis KI-Modell** meine Sicherheitspolitik.

---

---

## Die Zahlen


|                                               |                                                |
| --------------------------------------------- | ---------------------------------------------- |
| Commits                                       | **146**                                        |
| Aktive Tage                                  | **6** (11 -> 18 September 2026)                |
| Getrackte Dateien                             | 65                                             |
| Finale Python-Zeilen                         | ~4 000                                         |
| Style-Test-Score (Mimo, frühe Tage) | **9.1/10**                                     |
| Finale Version                                | v1.0.0 (per SSH signierter Tag, proprietäre Lizenz) |

## Was ich aus diesen 6 Tagen mitnehme

1. **Die Prioritätenreihenfolge war egal was, und es war die richtige Methode.** Ich baute zuerst einen Bot, der *antwortet*, dann einen Bot, der *richtig klingt*, dann einen Bot, der *glaubwürdig ist*, dann einen Bot, der *sicher ist*, und schließlich einen *verteilbaren* Bot. Persönlichkeit vor Sicherheit, das `Feur` vor der Lizenz. Man hielte dieses Tempo nicht durch, wenn man "gut gemachten" Projekten Regeln folgte.
2. **Stil ist zuerst eine "nicht"-Liste.** Mein nützlichstes `STYLE.md` beschreibt nicht, was ich sage, es schließt aus, was ich nicht tue: Sätze ohne Punkt beenden, Emojis auf eins limitieren, `mdr` klein schreiben, direkt angreifen ohne Präambel a la "Ich prüfe nur kurz ein Detail" am Antwortanfang. Bot-Parasiten sind leichter zu spotten als Charakterzüge zu definieren.
3. **Fehlschläge sind das Projekt.** Etwa dreißig Commits für MLS, ein weggeworfener Test, sechs getestete Nonce-Layouts. Die treuste Historie dessen, was ich erlebte, sind die gescheiterten Dienstags-Versuchsreihen.
4. **Ein Klon ist Gedächtnis, nicht Stil.** Stil täuscht zehn Nachrichten. Gedächtnis (OpenSelf, Scopes, Dedupe, Konflikt-Sweep) lässt dauern. Das trennt Spiegel von Person.
5. **Die letzten Commits sind immer lustig.** Der 146., der `bash`, `glob` und `grep` re-autorisiert, weil ein Free Tier verlangt, dass seine eigenen Tools präsent sind, ist mein Favorit.

Und die Bilanz zum Schluss: **Die Ergebnisse sind verblüffend, geradezu bluffend.** Der Klon hält eine Konversation, ohne dass man die Maschine ahnt, erinnert sich an Leute, Projekte, vergangene Witzeleien, ergreift Initiativen und markiert sie mit Stimmung, und er schlägt Fox nebenbei. Flippig, etwas, und genau das suchten wir.

---

*Das Projekt ist nicht öffentlich: proprietäre Lizenz, Rechte vorbehalten. Aber die Historie, die erzähle ich euch. Wenn ihr eines Tages einer "·Chloe" begegnet, die euch nach perfekt menschlicher Inaktivitätszeit mit einem Patrick-Jane-GIF antwortet... wisst ihr jetzt, was dahintersteckt.*

---

Mein Klon schrieb seine eigene Artikelversion, die ihr [hier](./article-chlone-timeline-chloeai.md) lesen könnt.
