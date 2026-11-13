---
title: "valorant-short-maker: die Pipeline, die meine Valorant-Shorts allein generiert"
description: "Groq/Llama fürs Skript, Piper für die Stimmen, FFmpeg für alles andere. Wie ein Cron-Job ein Video pro Tag auf @valorant_agents produziert und veröffentlicht, von A bis Z."
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "aPQimYzf9bn28ugDvgVH/QEi68ttwf0I3jyHXWSICKAZ69XQZFrMbgNeDkWuT8u7GPcoZ7kyPnb0nSSCbvZIcw=="
---

# valorant-short-maker: die Pipeline, die meine Valorant-Shorts allein generiert

Seit ein paar Monaten läuft ein YouTube-Kanal, ohne dass ich ihn anfasse: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop). Valorant-Agenten, die sich zwischen zwei Runden necken, synchronisiert, mit Karaoke-Untertiteln, als Shorts veröffentlicht. Alles wird von [`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker) generiert, einer TypeScript/Bun-Pipeline, die per Cron läuft und veröffentlicht, ohne dass irgendwer irgendwas klicken muss.

So funktioniert es, Schritt für Schritt.

## Was dabei rauskommt

Drei Frames aus dem für "Duelist Debate" generierten Video (Phoenix, Yoru und Jett):

![Intro eines Shorts, Agentenkreis mit dem Szenentitel](/images/valorant-short-maker/vsm-01-intro.png)

![Eine Replik im Gange, Karaoke-Untertitel leuchtet auf](/images/valorant-short-maker/vsm-02-dialogue.png)

![Eine weitere Replik, die Untertitelfarbe wechselt je nach Agent](/images/valorant-short-maker/vsm-03-dialogue.png)

Das Ergebnis live auf diesem Short: [Duelist Debate -- youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU). Auf dem Kanal liegen die Shorts bei etwa 1,2 bis 1,5k Views. Nichts Riesiges, aber es ist ein Kanal, der seit Anfang an allein läuft, also ist die Zahl, die wirklich zählt, null, null Minuten darauf verwendet, sobald der Cron läuft.

## Die Pipeline, der Reihe nach

### 1. Das Skript schreiben, Groq + Llama 3.3

Jeder Run zieht 3 bis 4 Agenten zufällig aus den 26 verfügbaren und schickt an Llama 3.3 70B (via Groq) einen Systemprompt, der für jeden gewählten Agenten eine kompakte Zusammenfassung seiner Persönlichkeit und seiner Beziehungen zu den anderen in der Szene anwesenden Agenten enthält (diese Personas leben in `src/lore/`, eine Datei pro Agent). Der Prompt setzt präzise Regeln: Ein kurzer knackiger Satz pro Replik, faire Rotation zwischen den Charakteren, Humor prioritär, und vor allem Pausen.

Konkretes Beispiel mit "Duelist Debate", Phoenix, Yoru und Jett streiten, wer Duelist spielen darf, generiert am 6. Juli 2026:

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

Die Pausen sind das Detail, das den Rhythmus natürlich macht: `[0.3]` mitten in einer Replik eingefügt erzeugt eine 0.3s-Stille in der Audiodatei, ohne den Agentenkreis auf dem Bildschirm abzuschneiden, während eine eigenständige `pause: 1.0`-Zeile eine echte Stille zwischen zwei Sprechern erzeugt, Kreis versteckt. Ohne das klingt ein TTS, das Repliken ohne Atmen aneinanderreiht, roboterhaft.

### 2. Eine Stimme geben, Piper, ein Modell pro Agent

Jeder Agent hat sein eigenes speziell trainiertes Piper-Modell (`.onnx`), gespeichert in `voices/<agent>/`. Der generierte Text läuft durch das entsprechende Modell, was ein WAV ausspuckt. Es ist dieselbe Techno, die ich allgemein für Custom-Stimmtraining nutze (siehe den Artikel über die Piper/Kaggle-Pipeline), hier direkt in Prod angewendet, on the fly, bei jeder Videogenerierung.

### 3. Karaoke-Untertitel, generiertes ASS, Farbe aus dem Icon extrahiert

Die Untertitelung ist kein simples `.srt`. Es ist eine Wort für Wort generierte `.ass`-Datei (Advanced SubStation Alpha) mit Karaoke-Effekt: Jedes Wort leuchtet in einer Farbe auf, während es ausgesprochen wird, während der Rest des Textes in einer neutralen Farbe bleibt. Die Akzentfarbe ist nicht fest, sie wird dynamisch aus dem Icon des sprechenden Agenten extrahiert (ein Python-Skript lässt PIL über das PNG des Icons laufen, sampled die nicht-transparenten Pixel und gibt die dominanten Farben zurück). Ergebnis: Killjoys Untertitel leuchtet lila auf, Jetts in Blaugrün, ohne dass irgendeine Farbe irgendwo hartcodiert wurde.

### 4. Der audioreaktive Kreis, ein FFmpeg-Ausdruck pro Frame

Das ist der verdrehteste Teil der Pipeline und wahrscheinlich der, auf den ich am stolzesten bin. Das runde Icon des sprechenden Agenten bleibt nicht statisch: Es zoomt leicht im Rhythmus seiner eigenen Stimme rein und raus.

Die Berechnung passiert, indem das rohe WAV der Replik gelesen wird, die RMS-Hüllkurve (root mean square, ein Maß der Signalenergie) Frame für Frame bei 60 fps berechnet wird, durch das Maximum normalisiert, dann über ein 3-Frame-Fenster geglättet, um Ruckler zu vermeiden. Jeder Hüllkurvenwert wird dann in einen Skalierungsfaktor umgewandelt, begrenzt durch `MAX_ZOOM_VARIATION` (0.2, also ±20 % um die Basisgröße).

Das Ergebnis dieser Berechnung wird nicht über Code angewendet, der Pixel manipuliert, es wird in einen riesigen bedingten FFmpeg-Ausdruck übersetzt (`lt(n,K)*val + between(n,K,K')*val + ...`, ein Zweig pro Frame-Gruppe), der direkt den `scale`-Parameter des Videofilters steuert. FFmpeg evaluiert diesen Ausdruck bei jedem Frame des Renderings. Für eine Replik von wenigen Sekunden bei 60 fps sind das schnell Hunderte Zweige in einem einzigen Ausdruck, daher der `STEP`-Parameter, der Frames gruppiert, um die Tiefe zu begrenzen.

### 5. Segmentweises Rendern, dann Fisheye aufs Intro

Jede Replik wird einzeln gerendert: Videohintergrund (zufälliger Ausschnitt aus einem der Gameplay-Clips in `bg-video/`, auf die richtige Dauer geschnitten), Agentenkreis darüber mit audioreaktivem Zoom, Untertitel eingebrannt via FFmpegs `ass`-Filter, TTS-Audio gemischt mit dem Gameplay-Sound im Hintergrund.

Das allererste Segment bekommt eine Spezialbehandlung: Eine Fisheye-Verzerrung, die sich über die ersten 20 % der Frames progressiv zurückbildet (`lenscorrection`-Filter Frame für Frame evaluiert, plus ein `tmix=frames=3`, das benachbarte Frames mischt, um Motion Blur zu simulieren), synchronisiert mit einem "Whoosh"-Geräusch. Das ist die Intro-Transition, die den Eindruck gibt, dass die Kamera in die Szene "eintaucht".

### 6. Konkatenation und finaler Mix

Alle Segmente werden aneinandergereiht, die Hintergrundmusik (Sneaky Snitch, Kevin MacLeod, Creative-Commons-Lizenz) wird darüber gemischt mit **Audio-Ducking**, einer Sidechain-Kompression, die die Musiklautstärke automatisch senkt, während ein Agent spricht, und in den Stillen wieder hochfährt. Alles läuft durchgehend in 60 fps, keine Framerate-Konvertierung zwischen den Schritten.

### 7. Automatische Veröffentlichung

Das Skript `run-cron.sh`, von einem klassischen Cron gestartet, aktiviert die Python-Umgebung, lädt die `.env` und startet `bun src/workflow.ts --upload`. Das `--upload`-Flag löst zusätzlich die Metadatengenerierung aus (Titel, Beschreibung, Tags) und ruft `uploaders/upload.py` auf, das das Video via zwei separater Skripte auf YouTube und Instagram veröffentlicht (`uploaders/youtube/upload.py` und `uploaders/instagram/`). Die ganze Kette, vom LLM-Prompt bis zum Video online, läuft ohne menschlichen Eingriff.

## Warum TypeScript/Bun statt etwas ganz Python

Die Wahl ist nicht ideologisch, sondern Bun gibt direkten und schnellen Zugriff auf `Bun.spawn`, um FFmpeg in Subprozessen zu steuern, ein starkes Typing auf den Pipeline-Datenstrukturen (`Phrase`, `SegmentInfo`) und eine beim Start deutlich schnellere Runtime als Node für ein Skript, das per Cron alle X Stunden läuft. Die einzigen beiden Python-Stücke im Projekt sind dort, wo Python wirklich am besten ausgerüstet ist: PIL für die Farbextraktion und die Upload-APIs (`google-api-python-client` für YouTube, der Instagram-Graph-API-Stack für IG).

## Was das veranschaulicht

Dieses Projekt ist ein gutes Beispiel dafür, was man heute mit vollständig gratis oder Open-Source-Bausteinen bauen kann: Ein schnelles gratis LLM via Groq-API, eine lokale TTS-Engine, die ohne dedizierte GPU läuft, FFmpeg für alles Videorendering, und das Bindemittel sind nur ein paar hundert Zeilen TypeScript. Kein einziger dieser Bausteine ist individuell neu. Was die Pipeline ausmacht, ist das Arrangement: Ein kohärentes Skript mit echten Beziehungen zwischen Charakteren generieren, es mit natürlichen Pausen in expressives Audio verwandeln, ein visuelles Rendering Frame für Frame auf die Energie dieses Audios synchronisieren und die ganze Kette bis zur Veröffentlichung automatisieren.

---

**Ressourcen**

- **Repo**: [github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **Kanal**: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**3 Kernpunkte**

1. Das Skript wird von einem LLM generiert (Groq/Llama 3.3) mit Personas und Beziehungen pro Agent, keine simple Liste vorgeschriebener Witze.
2. Der Zoom des Agentenkreises wird von einem FFmpeg-Ausdruck gesteuert, Frame für Frame aus der RMS-Hüllkurve des WAV berechnet, keine klassische Keyframe-Animation.
3. Die ganze Kette, vom Prompt bis zum YouTube/Instagram-Post, läuft über einen einzigen Cron-Job ohne menschlichen Eingriff.
