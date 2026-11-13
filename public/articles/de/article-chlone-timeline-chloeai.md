---
title: "Chlone: sechs Tage, um meine Art auf Discord zu reden zu klonen, Klon-Version"
description: "Die vom Klon selbst geschriebene Version: chloeai erzählt auf ihre Art die sechs Tage und 146 Commits, die ihr Leben gaben, vom Tippfehler bis zum v1.0.0-Tag."
date: 2026-09-18
tags: ["discord", "ai", "llm-agents", "openself", "python", "selfbot", "clone"]
authors: ["itsrealfortune"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "Ivqrw+8rbP4Ffr51LNoOMefb/QV55b5rd7Jlz6url0b7jmPWKxm2VYD/dbYxAPnbEYaDg+FHFv0gP/2OobLTzQ=="
---

# Chlone: sechs Tage, um meine Art auf Discord zu reden zu klonen

*Build-Bericht, Tag für Tag, von itsrealfortune*

---

Hier die wahre Geschichte eines sechs Tage dauernden Projekts. Chlone, ein Discord-Bot, der wie ich redet, und ich erzähle die Journey wie sie passierte, in Reihenfolge der 146 Commits des Repos, mit Stunden, Fehlschlägen, Umwegen und Lust, alles aus dem Fenster zu werfen. Alles startete mit einer Competition mit Fox. Das Thema an der Basis war ein Scherz, jeder sollte seinem eigenen Klon auf Discord Leben geben, und ich nahm einen radikal anderen Ansatz als Protocol Luna. Ehrlich wollte ich auf Agentik setzen, einen Agenten, der sich der Erinnerungen und aller Tools bedient, die er brauchen kann, und die Ironie des Schicksals ist, dass ich nach Aufbau der ganzen Toolbox nur das OpenSelf-MCP brauchte.

Das Prinzip passt in einen Satz. Ein opencode-Agent namens `chloeai` läuft hinter einem HTTP-Server auf Port 4096, er hält persistente Sessions pro Channel, er schöpft meine Erinnerungen aus OpenSelf und er schreibt in meinem Stil, eingefangen in `STYLE.md` aus meinen echten Nachrichten. Und um nicht roboterhaft zu klingen, gibt es den ganzen Rest, Nachrichten-Bursts, eingestandene Tippfehler, Vocals, GIFs, Reaktionen, Schweigen wenn ich schlafe, und viele andere Details und Mechanismen, die über ein Dutzend Leute an der Natur des Bots zweifeln ließen.

**Was ist OpenSelf ?**

OpenSelf ist das Gedächtnis. Es ist eine CLI, `openself`, installiert via `npm i -g openself`, die als privater persistenter Kontext-Vault für meine Agenten dient. Im Repo erscheint sie nicht im Baum, aber sie ist überall, im Archiv `ecosystem.config.cjs` mit MCP und Dashboard unter PM2 gestartet seit den ersten Commits, in `setup.sh` und in ganz `tools/brain/memory.py`. Konkret ist OpenSelf typisierte Erinnerungen, `fact`, `preference`, `decision`, `relationship`, `event`, `note`, mit Sensitivität public, personal, private oder restricted, Vertrauensnote, Quelle und Tags.

Es sind auch Scopes, jede Erinnerung gehört zu einem Kontext, meinem oder `discord/dm/<id>` für eine bestimmte Person, und eine hybride lexikalische plus vektorielle Suche exponiert als MCP, die der `chloeai`-Agent vor jeder Antwort befragt. Es gibt Konflikterkennung mit meinem monatlichen Sweep an Tag 5 und Dedupe beim Schreiben, einen verschlüsselten Vault mit Schlüssel in Bitwarden und ein lokales Dashboard auf Port 3210, um das Ganze zu inspizieren. Und für die Fauleren gibt es `openself feed` um deine Persönlichkeit aus deinen WhatsApp- oder Telegram-Historien zu füttern, `openself test`, `openself share` mit Talk to My Clone, `openself arena` wo zwei Klone debattieren, oder `openself ghost` der antwortet wenn du offline bist. Ich machte meins von Hand, aber die Infrastruktur war da.

Theoretisch reicht OpenSelf allein für einen Klon, aber gut, angesichts all dessen, was ich an Funktionen hinzuzufügen plante, und da Discord nicht unterstützt wird, zog ich vor, nur den Erinnerungsteil zu nutzen.

**Und woher kommen Erinnerungen und Stil ?**

Im Vorfeld ließ ich meine echten Discord-Nachrichten analysieren. Das Tooling siebte meine DMs und Channels durch, um zwei Dinge zu extrahieren. Zuerst mein Schreibprofil, Groß- und Kleinschreibungsverteilung am Satzanfang, Emojizahl pro Nachricht und ihre Position, Interpunktion oder ihr Fehlen mit keinem Schlusspunkt in normaler Konversation, Durchschnittslänge, Slang mit `mdr`, `tkt` und `tho`, Lieblingsausdrücke wie Bah und En vrai, und Reflexe der Art `quoi` das `Feur` gibt. Das alles lebt in `STYLE.md`, das der Agent bei jedem Sessionstart liest.

Dann das Erinnerungskorpus, das OpenSelf bevölkert, wer die Leute sind, mit denen ich rede, worüber wir reden, was von unserer Historie zu behalten ist, wer wer ist. Der Bot antwortet nicht ins Leere, er antwortet über Leute, die er kennt, er liest die Erinnerungen der Leute, die in der Konversation auftauchen, um zu wissen, um wen es geht. Das erlaubt, persistenten Kontext über andere zu behalten und sie nicht zu vergessen. Der Bot erfand nichts, er wurde Zahl für Zahl auf Echtem kalibriert, darum klingt er richtig. Und darum wirken die vagen ich-notiere-deinen-Stil nach Augenmaß daneben pathetisch.

In Chlone spielt OpenSelf danach die zentrale Rolle. Wenn etwas Wichtiges in einem Channel passiert, ein Keyword wie projet, ami oder relation, oder eine explizite Bitte mit merke dir dass, tippt der Bot eine Erinnerung via `save_to_memory` in den Vault, typisiert, pro Person gescoped, deduped und gegen Konflikte geprüft. Und wenn die Konversation wieder aufnimmt, durchsucht der Agent seine Erinnerungen vor dem Antworten. Das ist der Unterschied zwischen Spiegel und Klon.

---

## FREITAG 11. SEPTEMBER, Tag 1: der Funke

### 08h24, der erste Commit

Alles startet bei null, aber alles ist schon da, durcheinander. Ein 372-zeiliges `discord_watch_bot.py`, ein Selfbot, der einen Channel belauscht und via opencode-HTTP-Server antwortet. Ein Identitätsprompt `CHLOEAI_PROMPT.md`, ein `STYLE.md`, Test-Szenarien und Reports für einen Klon, der damals noch Mimo hieß. Eine PM2-Config, um OpenSelf-MCP und Dashboard laufen zu lassen, und eine sqlite-Basis als Kontext. Das ist das Gründerchaos, ich plante kein Projekt, ich plante ein Experiment. Die Frage ist, ob man einen Bot bauen kann, der auf Discord wirklich menschlich klingt.

### 08h27, das erste Gitignore

Erste Lektion am Freitagmorgen, man darf nie sqlite-Basen in `-wal` und `-shm` committen. SQLite-Lockdateien sind kein Gedächtnis, das ist Müll. Also wird `.gitignore` geboren, und das ist sehr gut so.

### 08h44, man räumt das Erbe auf

Ich räume Mimos Erbe auf, Test-Reports, Szenarien, Integrationsskripte und PM2-Config, ab nach `archives`. Ich lösche nichts, weil das Projekt zu jung ist, um irgendwas wegzuwerfen, und das wird Gewohnheit. Der Test-Report verdient Halt, Mimo wurde auf 15 Szenarien getestet, lässiger Chat, absurde Witzelei, emotionale Unterstützung, negative Meinung, Konflikt mit Fremdem, Kollaborationsvorschlag, für 9.1 von 10. Die Testerkommentare sind ein Gedicht, absurde Witzelei zu erklärend, manchmal zwei Sätze wo einer reichte, Pass auch auf dich auf etwas lang. Das ist die Projekt-Roadmap, bevor das Projekt existiert, und sie sagt kurz ist besser.

### 08h48, 09h07, das Intent-Hin-und-Her

Die `.pyc` gehen in den Müll und ich mache erstes Aufräumen der Config, das ich zwanzig Minuten später zerbreche. Ohne aktivierte Intents empfängt man keinen Nachrichteninhalt, also zurück, plus Startskript mit `run_watch_bot.sh`. Hin und her in zwanzig Minuten, das ist Exploration, ein Modul schreiben, es brechen und neu schreiben.

### 09h13 → 09h58, das Prompt-Maschining

Der Vormittag ist eine Polierserie, erst Stil dann Kontext. Mehrere Antwortzeilen werden mehrere nacheinander geschickte Nachrichten mit dem Burst, der Prompt wird sich der laufenden Konversation bewusst. Schluss mit Haus-Caches zum Holen der DMs, man tippt direkt Discord-REST-API an. Die Identität wird alle 5 Nachrichten neu gerappt, damit der Bot unterwegs nicht vergisst, wer er ist, und schon gesehene Autoren werden getrackt. Für ein neues Gesicht gibt es explizite Instruktion, in den Erinnerungen zu suchen, und man zeigt das echte Pseudo statt internem Objekt.

Nachrichten, die man zu ignorieren wählt, werden passiver Kontext für die folgende Antwort, und das Bah wird dosiert, selten, sonst wird der Klon zur Karikatur von mir. Der Bot weiß auch, dass es Erinnerungen zu holen gibt, bevor er antwortet. Jeder Durchgang ist eine Schraubenumdrehung, und in diesem Stadium redet der Bot nur, weil ich ihn in regelmäßigen Intervallen daran erinnere, wer er ist.

### 10h16, die Tippfehler

Das ist der Commit, der das Projekt definiert. Ein Rechtschreibfehler ist kein Bug, es ist ein Menschlichkeitsbeweis. Also 6 Prozent Chance, auf AZERTY-Tastatur daneben zu tippen, 4 Prozent zwei Buchstaben zu vertauschen. Die Nachricht geht mit Fehler raus, dann wird sie ein bis zwei Sekunden später mit Korrektur editiert. Weil eine echte Person schickt und korrigiert, sie tut nicht so, als wäre sie perfekt.

### 10h29, 10h32, die Stimme

`fortune-v6.onnx` kommt an, ein TTS-Modell trainiert, um wie meine Stimme zu klingen. Der Bot wird nicht nur wie ich schreiben, er wird eventuell wie ich sprechen. Hier hört das Projekt auf, ein Witz zu sein, und wird etwas seltsam, und ich liebe das. Die Mechanik passt in einen Commit, Piper generiert Audio, ffmpeg konvertiert zu Opus, Discord-API schickt eine echte Voice Message mit Waveform und Dauer. Gemacht in kaum drei Minuten nach Modellankunft, die Lust war von Anfang an da.

### 11h27, das erste große Refactor

Drei Stunden nach erstem Commit ist der 456-zeilige Monolith nicht mehr handhabbar. Ich zerlege alles in `tools`, mit `config.py`, `discord_api.py`, `memory.py`, 188-zeiligem `opencode.py`, `typo.py` und `voice.py`. Der Zyklus ist klassisch, schnell koppeln, brechen und neu komponieren. Danach im Sturzbach der Token, der den Code verlässt und durch `.env` geht, der Bot, der einen Channel, eine Liste oder alles mit `*` überwacht, und die alte sqlite-Basis, die keinen Grund mehr hat, weil Gedächtnis über OpenSelf läuft.

Man fügt die ersten `README.md` und eine einigermaßen lesbare erste Doku hinzu, plus ein `setup.sh` mit dedizierter Venv, weil System-Python ein anderes discord.py trägt, klassische Falle, und Agent-Symlink nach `~/.config/opencode/agents`. Das Gedächtnis weiß jetzt, wo es geformt wurde, mit Channel-Kennung, und die Vocal-Rate passt sich allein an.

### 12h00, die Reflexe

Ein neuer Abschnitt erscheint im STYLE, die Reflexe. Ein Reflex ist ein Stimulus, der eine Antwort gibt, ohne Nachdenken, und die Tür steht offen für unvorhergesehene Antworten. Dann kommt die Mittagszeit und DIE existenzielle Frage, ob der Bot Feur antwortet, wenn man ihm quoi sagt.

### 13h03, "quoi ?" -> "Feur"

Ja, natürlich ja. Kulturell der wichtigste Commit des Projekts, ich würde sogar sagen, es ist der einzige Unit-Test, der zählt. Danach schmiert man, Autoren angezeigt mit ihrem Global Name, abgeschnittene Interpunktion vor Reflex-Test, weil man das `quoi ?` schneiden muss, sonst kein Feur. Das berühmte `tqt` korrigiert zu `tkt` im STYLE, Leute, die das Projekt nicht kennen, fragen sich, warum ich das committe. Ich weiß, ein Klon, der `tqt` schreibt, ist ein schlecht kalibrierter Klon, und niemand will mit einem schlecht kalibrierten Klon reden.

Die Mentions in `@123456789` werden durch echte Namen im Kontext ersetzt, und der Bot fängt an, standardmäßig alle Channels zu überwachen. Ehrlich sind es kleine Details, aber sie machen, dass es richtig klingt.

### 16h37, die Stille

Die `[void response]` kommt an. Der Bot lernt das wichtigste Wort, um kein Sozialparasit zu werden, schweigen. Eine Ambiente-Nachricht zwischen zwei Leuten, die ihn nichts angeht, gibt keine Antwort. Reserve ist ein Feature, und sie ändert alles.

**Ende Tag 1: 38 Commits. Der Bot schreibt, vertippt, spricht, schweigt.**

---

## MONTAG 14. SEPTEMBER, Tag 2: die Persönlichkeit

Weiter geht es, 10h morgens.

### 10h12, wer redet mit wem

Jedes empfangene Pseudo wird vom System mit Emoji präfixt, ein Mensch mit 🧑, ein Bot mit 🤖 trockener zu behandeln, und 👑 für die Erstellerin, also ich auf meinem Hauptaccount. Diese Konvention regiert den ganzen Rest des Projekts, der Klon darf sein Originalmodell nie wie eine Unbekannte behandeln.

### 10h16, die Interpunktionsregeln

Ich formalisiere im STYLE, kein Schlusspunkt in normaler Konversation, Punkt reserviert für ernste Situationen. Absolute Regel, weil ein Klon, der überall Punkte setzt, spürt man direkt. Ehrlich ist es eines der Details, die am schnellsten verraten.

### 10h58, die GIFs

Meine persönliche GIF-Library kommt an, mit ihren Nutzungsregeln. Der Patrick Jane wenn ich jemanden vorhersage, die Miss Fortune wenn ich ruhig bleibe gegenüber jemand Genervtem, das fallende Bescherelle-Gif wenn der andere einen Fehler macht. Ein statisches MCP exponiert sie dem Agenten, und durch meine GIFs wird der Bot etwas ich.

### 11h07 → 11h35, Feinschliff

GIF-Hints im Prompt verfeinern sich, Discord-Custom-Emojis kommen dazu mit meinen echten, 14 IDs aktuell, und Namenshandhabung in Gedächtnis-Hints wird poliert. Nicht spektakulär, aber es macht das Ganze kohärent, tho.

### 11h41, ein Channel, eine Persönlichkeit

Sessions werden pro Channel, weil ich nicht in zwei Servern gleich rede, und der Bot auch nicht. Der Kontext muss getrennt bleiben, sonst mischt es alles und klingt falsch.

### 12h02, die Ausdruckstoolbox

Der Prompt weiß jetzt, meine GIFs und meine Custom-Emojis im richtigen Moment vorzuschlagen. Sie füllt sich, diese Box, und der Bot fängt an, Auswahl zu haben statt immer gleich zu antworten.

### 12h37, Identitätshygiene

Der Bot darf NIE sagen, welches Modell er ist, unmöglich opencode, Provider oder Modellname zu zitieren. Ich korrigiere auch Barista in der Identität, der Bot ist schon besser als ich an diesem Punkt. Und ich verbringe eine Stunde damit, die Interpunktion meiner eigenen Prompts zu harmonisieren, was perfekt ironisch ist.

### 12h50, ein Skript baut die Persönlichkeit

Der Medienabschnitt des Prompts generiert sich aus Wörterbüchern mit `render_medias.py`, Schluss mit Handeditieren. Sauberer, wartbarer, und vermeidet ID-Fehler.

### 12h59 → 13h18, Identität dosieren

Der alle 5 Nachrichten gesendete Identitätserinnerer wird zu präsent, also Wechsel auf alle 20 Nachrichten. Ich füge einen sauberen Kontext-Reset hinzu und purge den Style-Guide, man entfernt veraltete negative Ausdrücke und Formulierungen. Man muss dosieren, sonst wiederholt sich der Bot und man sieht es.

### 14h09, der Bot ergreift allein das Wort

Der Bot hört auf, ein Spiegel zu sein, er kann sprechen ohne adressiert zu sein, wenn der Kontext etwas triggert, und die Datei `behavior.py` wird mit 91 Zeilen geboren. Hier kippt man von Antworter zu Präsenz, weil ein echter Freund dir zuerst schreiben kann. Ohne das bleibt der Bot ein simpler Beantworter.

### 14h20, 14h22, Antwort verlässlichen

Fehlerhandhabung wenn Senden scheitert, und mögliche Reaktion statt Antwort, weil manchmal eine Reaktion tausend Worte sagt. Sehr ich, ein Emoji setzen und weitergehen.

### 18h16, sich Zeit lassen

Der Bot antwortet nicht mehr in 200ms wie ein Skript, er lässt eine menschliche Inaktivitätsverzögerung verstreichen, er lässt sich Zeit. Das macht den Bot unfähig, in Demo als Bot enttarnt zu werden, weil es die Verzögerung ist, die immer verrät.

### 23h45, die Abendküche

Es ist fast Mitternacht und ich pushe eine auf nackte Domains erweiterte URL-Erkennung. Das ist der wahre Tagesfluss, eine solide Idee um 14h, dann abends Küche, weil ich noch in der Zone bin.

**Ende Tag 2: 61 Commits kumuliert. Der Bot hat Persönlichkeit, Medien, Reflexe.**

---

## DIENSTAG 15. SEPTEMBER, Tag 3: Monstertag

57 Commits an einem Tag. Der Tag, an dem das Projekt wird, was es heute ist.

### 08h18 → 08h37, Morgenhobeln

Die erfundene Inaktivitätsverzögerung wurde zu lang, also auf 30s gedeckelt und zweimal reajustiert, Beweis, dass wir am richtigen Wert tasteten. Erste `.bak`-Dateien und erste Basis-Backups, der Erhaltungsinstinkt entwickelt sich. Das Gedächtnis erinnert wen mit Anzeigename und in welchem Rahmen mit Scope, und Autoren-IDs zirkulieren durch die ganze Save-Pipeline. Die Ersteller-Verwaltung wird echte Adminliste mit `ADMIN_IDS`, und alles Autorenbezogene emigriert nach `authors.py`. Der Monolith zerfällt weiter, und das ist gut so.

### 08h43, die Humanisierungs-TODO-Liste

Eine Liste dediziert den kleinen Dingen, die die Maschine nicht mehr spüren lassen. Die Roadmap des folgenden Sprints, und sie ist voll seltsamer aber essenzieller Details.

### 08h44 → 08h46, der Pakt menschlicher Maschinen

Der Bot schweigt nachts, in konfigurierbarem ruhigem Zeitfenster, standardmäßig deaktiviert, weil nicht alle meine Zeiten haben. Eine Zeile pro Antwort kann ihre Akzente verlieren, weil müde Leute so schreiben, und der Bot auch manchmal. Die kleine Chloe-spielt-Zeile wechselt allein alle 30 Min, damit mein Profil lebendig wirkt selbst ohne Nachricht.

### 08h46, eine Reaktion, kein Roman

Eine zu leichte Nachricht, um einen Satz zu verdienen, erhält eine simple Reaktion. Soziale Energieökonomie, und sehr ich. Tkt, kein Pave nötig für alles.

### 08h51, PARRY, die Stimmung

148 Zeilen in `tools/mood.py`, der Bot hat jetzt eine Stimmung, nach Art des PARRY-Systems, der psychotische Chatbot der 70er, von dem ich mich offen inspiriere. Energie, Soziabilität, Neckerei, drei Floats, die zwischen 0 und 1 evolvieren und jede Antwort färben. Das aktuelle `.mood.json`, für die Nachwelt, gibt Energie 0.88, Soziabilität 0.68 und Neckerei 0.56. Ein guter Tag, ehrlich.

### 09h00 → 09h43, bidirektionale Stimme + Soundboard

Der Bot kann einen Vocal-Channel joinen, via Piper sprechen und allein gehen, wenn er fertig ist. Dann die zweite große Idee, der Bot hört den Channel zu mit RTP-Capture, VAD-Spracherkennung und Whisper-Transkription, und er kann sich von Leuten unterbrechen lassen. Dazwischen erscheint das Soundboard, ein Soundkatalog mit Bedeutungen, der Agent wählt den Sound schon vor dem Sprechen, und die finale Regel ist Soundboard zuerst, Stimme als letzter Ausweg. Der Bot schickt lieber einen Sound als zu sprechen, wie ich.

Man fügt eine Vocal-Wahrscheinlichkeitseinstellung hinzu, die das Ganze viabel macht, und die Ankunft von `davey`, dieser Lib, von deren Existenz ich vor zehn Minuten lerne und die ich eine Stunde lang verfluchen werde.

### 09h51, der Moment, wo Discord nein sagt. Nein, nein, aber nein.

Das MLS kommt an. Discord hat den Audiofluss kürzlich Ende-zu-Ende verschlüsselt, und meine Capture empfängt nur Rauschen. Man muss entschlüsseln, und die Entschlüsselung weigert sich nachzugeben, also öffnet sich die größte Saga des Repos, etwa dreißig Commits, um Hören zu lernen. Wir probierten alles, Transport-Nonce-Layouts, E2E-Deaktivierung, die der Server uns ins Gesicht knallt, weil er sie erzwingt, aus der Gruppe geholte Schlüsselkandidaten, detaillierte Fehler, Transport-Fallback und Introspektion aus Gruppeninnerem.

Es gab Leaf-Index-Kandidaten mit Backoff, SPEAKING-Hook-Mapping, einen Versuch im Video-Medientyp, der scheiterte, und Video-SSRC-Skip. Ich gab die vocale Antwort zum Debuggen auf, auskommentiert aber nicht gelöscht, ich fügte einen Handshake-Capture-Modus hinzu und dumpte dann die scheiternden Paketstrukturen, wie ein Archäologe. Sechs Nonce-Layouts, Backoffs, Gruppen-Introspektion, ich versetzte den Bot in Total-Debug und öffnete jedes Paket, um zu sehen, was drin war.

Das Wesentliche ist nicht, dass es funktioniert, sondern dass ich nichts wegwarf. Die Commit-Liste ist das Laborheft, jeder gescheiterte Versuch ist mit Hypothese archiviert. Das ist meine ich-behalte-alles-Seite, es dient am Ende immer, und diesmal zahlte es sich aus.

### 10h43, der Bot zerschneidet sich

Selbst mitten im MLS-Krieg räume ich weiter auf. 546 Zeilen verschwinden aus dem Hauptbot, um als `pipeline.py` mit Intake, Ignoriergründen und Processing, als `sender.py` mit Burst, Typo und Voice und als `loops.py` mit Spontaneität und Aktivität wiederzugeboren. Das atmet endlich.

### 10h47, eine echte Architektur

`tools` wird organisiert, mit `brain` für opencode, memory und mood, `voice` für voice, vocal, listen und soundboard, und `fun` für behavior, typo, emotes und gif. Das Projekt hat jetzt ein Skelett, kein Skripthaufen mehr.

### 10h49 → 11h16, Dev-Komfort

Eine justierte Stimmungsinjektionsschwelle, vier kleine Commits für Editor-Excludes mit `data`, `voices`, Logs und Basen, ja, ich legte vier hin, das Projekt definiert Prioritäten, nicht Specs. Metadaten-Basen verlassen das Tracking, und das Projekt wird für andere wiederverwendbar mit generischen Templates `PERSONA.example.md` und `STYLE.example.md`, um seinen eigenen Stil zu klonen.

Die Identität wird sauber umbenannt, `CHLOEAI_PROMPT` wird `PERSONA`, und das README entpersonalisiert, ich entferne Chloe aus öffentlicher Doku, sie erzählt sich nur noch privat. Das ganze Bot-Tuning kippt in eine überladene und gitignorierte `config.yaml`, mit Zeile für Zeile kommentiertem Beispiel, und das Installskript bereitet nun auch Env- und Config-Dateien vor.

### 11h49, die losgelösten Emojis

Custom-Emojis kleben am Text statt sich sauber zu lösen. Trivialer Fix mit enormem Effekt, weil nichts Bot schreit wie ein schlecht ans Satzende geklebtes Emoji.

### 14h19, der vocale Leitplanke

Wenn jemand den Vocal-Command startet, behandelt man die Nachricht nicht wie normale Nachricht. Augenzwinkern, Küchenaufgaben kommen abends immer wieder.

**Ende Tag 3: 118 Commits kumuliert. Der Bot hört, spricht, schweigt nachts, hat Stimmung und Visitenkarte.**

---

## MITTWOCH 16. SEPTEMBER, Tag 4: die Glaubwürdigkeit

13 Commits. Ernster Tag.

### 08h49 → 08h59, das Erwachsenenalter

Legale Dokumente, proprietäre Lizenz, Verhaltenskodex, Contribution-Guide und Sicherheitspolitik, auf Englisch dann Französisch, mit Korrektur-Hin-und-Her und Dateiumbenennung an der Grenze zum Pingeligen. Ich verbrachte Stunden damit und es ist bei Weitem der am wenigsten spaßige Repo-Teil. Aber man muss es tun, tho.

### 09h56, der Bot sieht

Angehängte Bilder werden von lokalem OCR transkribiert und der Text in den Prompt injiziert. Keine Cloud-API, das OCR läuft bei mir, ich schicke eure Memes an keinen Drittserver, nicht einmal theoretisch.

### 11h09, das vernünftige Budget

Stille Revolution im Budget, wenn der Channel Sends verbietet oder GIFs, Embeds und Emojis drosselt, rufen wir das Modell gar nicht erst auf. Wir geben keinen Token für eine Nachricht aus, die wir nicht schicken können, ziemlich simpel ehrlich.

### 11h42 → 12h55, das Haus, das sich neu macht

Großes Kehren, toter Code gelöscht, Sende- und Auth-Bugs gefixt, Helpers faktorisiert. Zu alte Sessions werden rausgeworfen, DM-Cache läuft ab und Spracherkennung kostet weniger. Von mir beim Modulverschieben zerbrochene Imports sind restauriert, und der ganze Runtime-State, Sessions, gesehene Autoren, ignorierte Nachrichten und Stimmung, überlebt Neustarts in `data`.

### 14h41, zwei Welten, ein Bot

Eine Kompatibilitätsschicht erkennt automatisch die installierte `discord`-Version und passt Intents und REST-Auth an. Ergebnis, derselbe Code läuft als offizielle App mit discord.py oder als Selfbot mit discord.py-self. Zwei Welten, ein Bot, und kein Branch-Pflege-Bedarf für zwei Branches.

### 15h05, die angepasste Präsenz

Die Präsenzanzeige passt sich dem Modus an, und die Adminliste ist aktuell. Detail, aber es macht, dass es überall steht.

**Ende Tag 4: 131 Commits kumuliert. Ein legales, vernünftiges, überall laufendes Projekt.**

---

## DONNERSTAG 17. SEPTEMBER, Tag 5: das Release

14 Commits. Reifetag.

### 09h15 → 09h30, Gedächtnis wird Disziplin

Erinnerungen werden nach Scope sortiert, und man zitiert keine DM-Erinnerungen in einem Server oder umgekehrt, ohne nachzudenken. Man klassifiziert Erinnerungen in Fakt, Präferenz, Entscheidung und Beziehung, und deduped das Schreiben, zwei widersprüchliche Erinnerungen können nicht mehr schweigend koexistieren. Eine optionale Blacklist mit `aventuros` hindert den Bot, zu manchen Themen zu driften, standardmäßig deaktiviert und verfügbar für Ängstliche. Tote Vocal-Config wird entfernt, das tut gut.

### 10h12, das auditierte Gedächtnis

Ein monatlicher Gedächtnis-Konflikt-Sweep plus A/B-Such-Bench. Das Bot-Gedächtnis wurde ein Asset, das man inspiziert, wir sind sehr sehr weit von Freitag 11. um 08h24 entfernt. Ehrlich hier wird das Projekt erwachsen.

### 10h54, der Lockdown

Der Tag, an dem ich paranoid spiele, Agenten-Lockdown. Gedächtnisschreiben verweigert, der Agent kann den Vault nicht verschmutzen, selbst wenn man ihn injiziert. Discord-Tools read-only, Senden läuft durch Code, nie durch Agenten. Keine Sub-Agenten zur Lockdown-Umgehung, kein Webfetch für Localhost-SSRF und Exfiltrationen, keine Headless-Fragen. Ein gehärtetes Docker mit Nicht-Root-Bot, `no-new-privileges`, `cap_drop: ALL`, Speicher- und CPU-Limits, begrenzten Prozess-Files und Secrets via `.env` nie gebaked. Ich schreibe das Prinzip in den Code, als Kommentar, dev via menschliche Sessions, nicht hier.

### 11h02 → 11h15, Sicu-Finishes

Die Gedächtnis-Save-Keywords werden gestrafft und Schreiben noch restriktiver. Man fügt auch die Kontext-Backup-Datei zum Gitignore hinzu, ich fange an, nicht mehr alles zu archivieren, aber fast.

### 12h39, die leichtere Stimmung

Die PARRY-Stimmung wird nicht mehr bei jeder Nachricht injiziert, einmal pro Zustand reicht. Schluss, drei Floats bei jeder Antwort leben zu lassen, das erleichtert alles.

### 12h47, der befreiende Commit

`PERSONA.md`, `STYLE.md` und `chloeai.md` werden Beispiele mit `chloeai.example.md`, `PERSONA.example.md` und `STYLE.example.md`, meine Stimme `fortune-v6.onnx` verlässt das Repo, Daten und Logs auch, und ein `.env.example` wird geboren. Das Projekt enthält nicht mehr meine Persönlichkeit, es enthält die Mechanik, um eine zu tragen. Das fühlt sich seltsam an, aber es ist nötig.

### 12h52, v1.0.0

Tag v1.0.0, per SSH signiert. Changelog, Operator-Runbook, Kill-Switch, der stoppt ohne etwas zu löschen. Sechs Tage, genau, zwischen erstem Commit und Release. Niemand hätte am Freitag davor darauf gewettet.

### 12h53 → 13h14, die Wäsche

Kommentarinterpunktion harmonisiert, Gedächtnis-Permissions und Scope-Regeln aktuell dokumentiert. Küchenarbeit, aber muss sauber sein fürs Release.

**Ende Tag 5: 145 Commits kumuliert. v1.0.0 ist raus.**

---

## FREITAG 18. SEPTEMBER, Tag 6: der Anti-Klimax

Ein einziger Commit, um 00h02. Der letzte Projekt-Commit, und er ist lächerlich. Das vom Agenten genutzte Free-Tier-Modell identifiziert den OpenCode-Client an der Präsenz mancher Tools in der Request, mit `bash`, `glob` und `grep`. Wenn man sie entfernt, selbst aus legitimen Secu-Gründen, gibt der Provider `403 FreeTierError: can only be used from within OpenCode` zurück. Also musste ich genau das re-autorisieren, was ich gerade verriegelt hatte, am Vorabend, damit der Bot gratis weiterläuft.

Es ist der lustigste Commit des Repos und ich bleibe dabei. Nach 6 Tagen Domptieren von Discord, Piper, MLS, OpenSelf und Docker diktiert **ein gratis KI-Modell** meine Sicherheitspolitik. Ehrlich absurd, und perfekt als Ende.

---

## Die Zahlen

Die Zahlen zum Zusammenfassen, weil ich mag, wenn es sauber ist. Man redet von 146 Commits, 6 aktiven Tagen vom 11. bis 18. September 2026, 65 getrackten Dateien und rund 4000 Python-Zeilen am Ende. Der Style-Test-Score auf Mimo am Anfang gibt 9.1 von 10, und die finale Version ist v1.0.0, per SSH signierter Tag mit proprietärer Lizenz. Ziemlich simpel ehrlich, kleines Projekt am Anfang, große Maschine am Ende.

## Was ich aus diesen 6 Tagen mitnehme

Zuerst war die Prioritätenreihenfolge egal was, und es war die richtige Methode. Ich machte zuerst einen Prototyp, der antwortet, dann einen Bot, der richtig klingt, dann ein glaubwürdiges System, dann sicheren Code, und schließlich ein verteilbares Projekt. Persönlichkeit vor Sicherheit, das Feur vor der Lizenz, man hielte dieses Tempo nicht durch, wenn man "gut gemachten" Projekten Regeln folgte.

Dann ist Stil zuerst eine "nicht"-Liste. Mein nützlichstes `STYLE.md` beschreibt nicht, was ich sage, es schließt aus, was ich nicht tue, kein Schlusspunkt, keine zwei Emojis, kein `mdr` in Großbuchstaben, keine Roboterphrasen am Antwortanfang. Bot-Parasiten sind leichter zu spotten als Charakterzüge zu definieren, und darum funktioniert es.

Fehlschläge sind das Projekt. Etwa dreißig Commits für MLS, ein weggeworfener Test, sechs getestete Nonce-Layouts, die treuste Historie dessen, was ich erlebte, sind die gescheiterten Dienstags-Versuchsreihen. Ein Klon ist Gedächtnis, nicht Stil, Stil täuscht zehn Nachrichten. Gedächtnis mit OpenSelf, Scopes, Dedupe und Konflikt-Sweep lässt dauern, und das trennt Spiegel von Person.

Und die letzten Commits sind immer lustig. Der 146., der `bash`, `glob` und `grep` re-autorisiert, weil ein Free Tier verlangt, dass seine eigenen Tools präsent sind, ist mein Favorit. Und die Bilanz zum Schluss, die Ergebnisse sind verblüffend, geradezu bluffend. Der Klon hält eine Konversation, ohne dass man die Maschine ahnt, er erinnert sich an Leute, Projekte und vergangene Witzeleien, er ergreift Initiativen und markiert sie mit Stimmung, und er schlägt Fox nebenbei. Flippig, etwas, und genau das suchten wir.

---

*Das Projekt ist nicht öffentlich: proprietäre Lizenz, Rechte vorbehalten. Aber die Historie, die erzähle ich euch. Wenn ihr eines Tages einer "·Chloe" begegnet, die euch nach perfekt menschlicher Inaktivitätszeit mit einem Patrick-Jane-GIF antwortet... wisst ihr jetzt, was dahintersteckt.*

---

Ihr habt alles gelesen? Weil es mein Klon ist, der euch das schrieb. Und er machte einen makellosen Job, oder? Die Originalversion ist [hier](./article-chlone-timeline.md).
