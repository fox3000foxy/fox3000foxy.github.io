---
title: "valorant-short-maker: die Pipeline, die meine Valorant-Shorts von alleine generiert"
description: "Groq/Llama fürs Skript, Piper für die Stimmen, FFmpeg für den Rest. Wie ein Cron-Job jeden Tag ein Video auf @valorant_agents produziert und veröffentlicht, von A bis Z."
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "9A8pxBlonMnDGqhnITRj5qMZFhdsp+3OzoAhDUBuSINuqHznDb+WJmPM52sI6/9Yvvh0XhknB2l1oGWm6hbmcg=="
---

# valorant-short-maker: die Pipeline, die meine Valorant-Shorts von alleine generiert

Seit ein paar Monaten läuft ein YouTube-Kanal ganz ohne mein Zutun: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop). Valorant-Agenten, die sich zwischen zwei Runden ans Bein pinkeln, vertont, mit Karaoke-Untertiteln, als Shorts veröffentlicht. Alles generiert von [`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker), einer TypeScript/Bun-Pipeline, die per Cron läuft und veröffentlicht, ohne dass jemand irgendwo draufklicken muss.

So funktioniert's, Schritt für Schritt.

## Wie's aussieht

Drei Frames aus dem Video, das für „Duelist Debate" (Phoenix, Yoru und Jett) generiert wurde:

![Short-Intro, Agentenkreis mit Szenentitel](/images/valorant-short-maker/vsm-01-intro.png)

![Eine laufende Zeile, Karaoke-Untertitel leuchtet auf](/images/valorant-short-maker/vsm-02-dialogue.png)

![Noch eine Zeile, Untertitelfarbe wechselt je nach sprechendem Agenten](/images/valorant-short-maker/vsm-03-dialogue.png)

Das Ergebnis live in diesem Short: [Duelist Debate -- youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU). Die Shorts auf dem Kanal liegen so bei 1,2 bis 1,5k Views. Nix Riesiges, aber es ist ein Kanal, der von Anfang an komplett eigenständig läuft, also ist die Zahl, die wirklich zählt, null -- null Minuten, die ich drauf verwendet habe, seit der Cron läuft.

## Die Pipeline, der Reihe nach

### 1. Das Skript schreiben -- Groq + Llama 3.3

Jeder Lauf zieht zufällig 3 bis 4 der 26 verfügbaren Agenten und schickt an Llama 3.3 70B (via Groq) einen System-Prompt, der für jeden gewählten Agenten eine kompakte Zusammenfassung seiner Persönlichkeit und seiner Beziehungen zu den anderen Agenten in der Szene enthält (diese Personas liegen in `src/lore/`, eine Datei pro Agent). Der Prompt setzt strenge Regeln: kurze, knackige Sätze pro Zeile, faire Rotation zwischen den Charakteren, Humor zuerst, und vor allem Pausen.

Konkretes Beispiel mit „Duelist Debate" -- Phoenix, Yoru und Jett streiten, wer den Duelisten spielen darf, generiert am 6. Juli 2026:

```
phoenix: I'm telling you, I've got the skills to play duelist this match.
yoru: Skills, you call burning things skills, Phoenix.
jett: I'm the fastest one here, I should play duelist.
phoenix: Fastest, but can you handle the heat, Jett [0.3] I doubt it.
yoru: Heat, ha, you think your flames are hotter than my rifts.
jett: This isn't about heat or flames, it's about speed and agility.
phoenix: Oh, I see, so now you're an expert on duelists, Yoru [0.3] that's rich.
yoru: At least I don't rely on cheap fire tricks.
jett: Cheap fire tricks, that's what you call Phoenix's abilities.
phoenix: Hey, my fire tricks have gotten us out of tight spots before [0.3] can't say the same for your rifts, Yoru.
yoru: Tight spots, you mean like the time I rifted us out of that trap.
jett: Enough, this is getting nowhere, let's just decide already.
phoenix: Fine, but I'm still saying I'm the best duelist here.
yoru: Please, you think you can take on the enemy team alone [0.3] I doubt it.
jett: I can take them on, no problem, I'm the fastest.
phoenix: Fastest, yeah, but can you outmaneuver them [0.3] that's the question.
yoru: Outmaneuver, ha, you think you can outmaneuver anyone, Phoenix.
jett: This is stupid, we're not going to agree on this.
phoenix: Fine, let's just play and see who comes out on top [0.3] I'm game if you are.
yoru: Bring it on, I'll show you what a real duelist looks like.
jett: I'm not backing down, I'm playing duelist.
phoenix: Oh, this should be good [0.3] let's see how you two do.
yoru: We'll see who comes out on top, won't we, Jett.
jett: Yeah, let's end this debate once and for all.
pause: 0.3
phoenix: Alright, let's get started then [0.3] may the best duelist win.
yoru: I'll make sure to burn you, Phoenix, not with fire, but with my rifts.
jett: I'll take you both down, no problem.
```

Die Pausen sind das Detail, das den Rhythmus natürlich macht: `[0.3]` mitten in einer Zeile erzeugt 0,3s Stille im Audio, ohne den Agentenkreis auf dem Bildschirm zu unterbrechen, während eine eigenständige `pause: 1.0`-Zeile eine echte Stille zwischen zwei Sprechern schafft, Kreis ausgeblendet. Ohne das klingt ein TTS, das Zeilen am Stück ohne Atempause runterrattert, roboterhaft.

### 2. Stimme geben -- Piper, ein Modell pro Agent

Jeder Agent hat sein eigenes, speziell trainiertes Piper-Modell (`.onnx`), gespeichert in `voices/<agent>/`. Der generierte Text geht durch das passende Modell, was ein WAV ausspuckt. Ist dieselbe Technik, die ich generell für Custom-Voice-Training nutze (siehe den Piper/Kaggle-Pipeline-Artikel) -- hier direkt in Produktion, on the fly, bei jeder Videogenerierung.

### 3. Karaoke-Untertitel -- ASS generiert, Farbe aus dem Icon gezogen

Die Untertitelung ist kein simples `.srt`. Es ist eine wortweise generierte `.ass`-Datei (Advanced SubStation Alpha) mit Karaoke-Effekt: Jedes Wort leuchtet in einer Farbe auf, während es gesprochen wird, der Rest des Textes bleibt neutral. Die Akzentfarbe ist nicht fest -- sie wird dynamisch aus dem Icon des sprechenden Agenten extrahiert (ein Python-Skript lässt PIL über das Icon-PNG laufen, sampelt die nicht-transparenten Pixel und gibt die dominanten Farben zurück). Ergebnis: Killjoys Untertitel leuchtet violett, Jetts in Türkis, ohne dass irgendwo eine Farbe hardgecoded wäre.

### 4. Der audio-reaktive Kreis -- ein FFmpeg-Ausdruck pro Frame

Das ist der tricky Part der Pipeline, und wahrscheinlich der, auf den ich am meisten stolz bin. Das runde Icon des sprechenden Agenten bleibt nicht statisch: Es zoomt leicht im Rhythmus seiner eigenen Stimme.

Die Berechnung liest das rohe WAV der Zeile, berechnet die RMS-Hüllkurve (Root Mean Square, ein Maß für die Signalenergie) Frame für Frame bei 60 fps, normalisiert am Maximum und glättet über ein 3-Frame-Fenster gegen Ruckler. Jeder Hüllkurvenwert wird dann in einen Skalierungsfaktor umgewandelt, begrenzt durch `MAX_ZOOM_VARIATION` (0,2, also ±20% um die Basisgröße).

Das Ergebnis dieser Berechnung wird nicht durch pixelmanipulierenden Code angewandt -- es wird in einen riesigen FFmpeg-Bedingungsausdruck übersetzt (`lt(n,K)*val + between(n,K,K')*val + ...`, ein Zweig pro Frame-Gruppe), der direkt den `scale`-Parameter des Videofilters steuert. FFmpeg wertet diesen Ausdruck bei jedem gerenderten Frame aus. Für eine Zeile von ein paar Sekunden bei 60 fps sind das schnell Hunderte von Zweigen in einem einzigen Ausdruck -- daher der `STEP`-Parameter, der Frames gruppiert, um die Tiefe zu begrenzen.

### 5. Rendering pro Segment, dann Fisheye aufs Intro

Jede Zeile wird einzeln gerendert: Videohintergrund (ein zufälliger Clip aus `bg-video/`, auf die richtige Länge getrimmt), der Agentenkreis oben drauf mit Audio-reaktivem Zoom, Untertitel via FFmpegs `ass`-Filter eingebrannt, TTS-Audio mit dem Gameplay-Sound im Hintergrund gemischt.

Das allererste Segment bekommt eine Spezialbehandlung: eine Fisheye-Verzerrung, die sich über die ersten 20% der Frames allmählich auflöst (`lenscorrection`-Filter frame-weise berechnet, plus ein `tmix=frames=3`, das benachbarte Frames für Motion Blur vermischt), synchron mit einem „Whoosh"-Sound. Das ist der Intro-Übergang, der das Gefühl gibt, dass die Kamera in die Szene „reinfährt".

### 6. Konkatenation und finaler Mix

Alle Segmente werden aneinandergereiht, die Hintergrundmusik (Sneaky Snitch, Kevin MacLeod, Creative-Commons-Lizenz) wird mit **Audio-Ducking** drübergemischt -- eine Sidechain-Kompression, die die Musiklautstärke automatisch senkt, während ein Agent spricht, und in den Pausen wieder hochfährt. Alles läuft durchgehend in 60 fps, keine Framerate-Konvertierung zwischen den Schritten.

### 7. Automatische Veröffentlichung

Das Skript `run-cron.sh`, von einem normalen Cron-Job gestartet, aktiviert die Python-Umgebung, lädt die `.env` und führt `bun src/workflow.ts --upload` aus. Das `--upload`-Flag triggert zusätzlich die Metadatengenerierung (Titel, Beschreibung, Tags) und ruft `uploaders/upload.py` auf, das das Video via zwei separater Skripte (`uploaders/youtube/upload.py` und `uploaders/instagram/`) auf YouTube und Instagram veröffentlicht. Die gesamte Kette, vom LLM-Prompt bis zum Video online, läuft ohne menschliches Zutun.

## Warum TypeScript/Bun statt eines reinen Python-Dings

Die Entscheidung ist nicht ideologisch -- es liegt daran, dass Bun mit `Bun.spawn` direkten, schnellen Zugriff zum Steuern von FFmpeg als Subprozess bietet, starke Typisierung auf die Datenstrukturen der Pipeline (`Phrase`, `SegmentInfo`), und eine Runtime, die für ein Skript, das alle paar Stunden per Cron läuft, deutlich schneller startet als Node. Die einzigen beiden Python-Stellen im Projekt sind da, wo Python wirklich das beste Werkzeug ist: PIL für die Farbextraktion, und die Upload-APIs (`google-api-python-client` für YouTube, der Instagram-Graph-API-Stack für IG).

## Was das illustriert

Dieses Projekt ist ein gutes Beispiel dafür, was man heute mit komplett kostenlosen oder quelloffenen Bausteinen bauen kann: ein schnelles, kostenloses LLM via Groq-API, eine lokale TTS-Engine, die ohne dedizierte GPU läuft, FFmpeg fürs gesamte Video-Rendering -- und der Kleber dazwischen sind nur ein paar hundert Zeilen TypeScript. Keiner dieser Bausteine ist für sich genommen neu. Was die Pipeline ausmacht, ist das Arrangement: ein kohärentes Skript mit echten Charakterbeziehungen generieren, es in ausdrucksstarkes Audio mit natürlichen Pausen verwandeln, ein visuelles Rendering Frame für Frame auf die Energie dieses Audios synchronisieren, und die ganze Kette bis zur Veröffentlichung automatisieren.

---

**Ressourcen**

- **Repo**: [github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **Kanal**: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**3 Kernpunkte**

1. Das Skript wird von einem LLM (Groq/Llama 3.3) mit agentenspezifischen Personas und Beziehungen generiert -- keine simple Liste vorgefertigter Witze.
2. Der Zoom des Agentenkreises wird durch einen FFmpeg-Ausdruck gesteuert, der Frame für Frame aus der RMS-Hüllkurve des WAV berechnet wird -- keine klassische Keyframe-Animation.
3. Die gesamte Kette, vom Prompt bis zum YouTube-/Instagram-Post, läuft über einen einzigen Cron-Job ohne jeden menschlichen Eingriff.
