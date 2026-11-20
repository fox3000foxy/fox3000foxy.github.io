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
lang: "de"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "8Uz6w7u/jJAnfvkQbT58G2N0f7hM6HnoH4qEq+CfDUd8zWftc6XuQkBUKQlLaPVN2OvITaZiQs9BVMydDHSjww=="
---
# 

Seit einigen Monaten läuft ein YouTube-Kanal ohne dass ich es anfassen würde:[@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop). Agenten Valorant, die sich zwischen zwei Runden schlafen, verdoppelt, in Karaoke untertitelt, in Shorts veröffentlicht. Alles wird durch [ `valorant-short-maker` ](https://github.com/fox3000foxy/valorant-short-maker), eine TypeScript/Bun-Pipeline, die in Cron läuft und veröffentlicht, ohne dass jemand auf irgendetwas klicken muss.

So funktioniert das Schritt für Schritt.

## Was das bringt

Drei Frames aus dem Video für "Duelist Debate" (Phönix, Yoru und Jett) gewonnen:

! [Intro d'un short, cercle d'agent avec le titre de la scène](/images/valorant-short-maker/vsm-01-intro.png)

! [Une réplique en cours, sous-titre karaoké qui s'illumine](/images/valorant-short-maker/vsm-02-dialogue.png)

! [Une autre réplique, la couleur du sous-titre change selon l'agent](/images/valorant-short-maker/vsm-03-dialogue.png)

Das Ergebnis live auf diesem Short:[Duelist Debate – youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU)Auf der Kette drehen sich die Shorts um 1,2 bis 1,5k Ansichten. Nichts Großes, aber es ist eine Kette, die von Anfang an von alleine dreht, also zählt die Zahl, die wirklich zählt, Null – Null Minute, die auf sie gesetzt wird, sobald der Cron gestartet ist.

## Die Pipeline in der Reihenfolge

### 1. Schreibst du das Skript – Groq + Llama 3.3

Jeder der 26 zufällig verfügbaren Spieler 3-4 Spieler und sendet Llama 3.3 70B (über Groq) ein schnelles System, das für jeden gewählten Agenten eine kompakte Zusammenfassung seiner Persönlichkeit und seiner Beziehungen zu den anderen Agenten in der Szene enthält (diese Personen leben in`src/lore/`Die schnelle Regel: ein kurzer und schockierender Satz durch Nachbildung, gerechte Rotation zwischen den Charakteren, Humor in der Priorität und vor allem Pausen.

Konkretes Beispiel mit "Duelist Debate" – Phoenix, Yoru und Jett streiten um die Spieler der Duelist, die am 6. Juli 2026 generiert wurde:
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
Pausen sind das Detail, das den natürlichen Rhythmus macht:`[0.3]`In der Mitte einer Wiedergabe eingefügt erzeugt eine Stille von 0.3s in der Audiodatei, ohne den Kreis des Agenten auf dem Bildschirm zu schneiden, während eine Zeile`pause: 1.0`Ganz im Ganzen schafft ein wahres Schweigen zwischen zwei Sprechern, versteckten Kreis. Ohne das, ein TTS, das die Repliken kettet, ohne zu atmen, klingt Robotik.

### 2. Gibst du eine Stimme – Piper, ein Modell pro Agent

Jeder Agent hat sein eigenes Modell Piper (`.onnx`) speziell in der`voices/<agent>/`Der generierte Text wird in das entsprechende Modell übernommen, was einen WAV ergibt. Es ist dieselbe Technologie, die ich für das Custom Voice Training im Allgemeinen verwende (siehe Artikel über die Piper/Kaggle Pipeline) – hier direkt im Fliegen, für jede Videogeneration.

### 3. Karaoke-Untertitel – generierte ASS, Farbe aus dem Symbol

Untertitelung ist nicht einfach`.srt`. Es ist eine Datei`.ass`(Advanced SubStation Alpha) wortweise erzeugt mit einem Karaoke-Effekt: Jedes Wort wird in einer Farbe beleuchtet, während es ausgesprochen wird, während der Rest des Textes in einer neutralen Farbe bleibt. Die Akzentfarbe ist nicht fixiert – es wird dynamisch aus dem Symbol des sprechenden Agenten extrahiert (ein Python-Skript dreht PIL auf dem PNG des Symbols, mustert nicht-transparente Pixel und gibt die vorherrschenden Farben zurück). Ergebnis: Der Untertitel von Killjoy leuchtet in lila, das von Jett in blau-grün, ohne dass irgendeine Farbe irgendwo in hart kodiert wurde.

### 4. Der Audio-Reaktivkreis - ein FFmpeg-Ausdruck pro Frame

Dies ist der verdrehteste Teil der Pipeline und wahrscheinlich der, auf den ich am stolzesten bin. Das runde Symbol des sprechenden Agenten bleibt nicht statischer: sie zoomt und dezoom leicht im Rhythmus ihrer eigenen Stimme.

Die Berechnung erfolgt durch das Lesen des Roh WAV der Replik, indem man den RMS-Hüllen (root mean square, eine Messung der Signalenergie) durch Frame bei 60 fps berechnet, durch das Maximum normalisiert und dann an einem Fenster mit 3 Frames glitzt, um die Schläge zu vermeiden. Jeder Wert der Ummantelung wird dann in einen skalierten Faktor umgewandelt, der durch`MAX_ZOOM_VARIATION`(0,2 also ±20% um die Grundgröße).

Das Ergebnis dieser Berechnung wird nicht über den Code angewendet, der Pixel manipuliert – es wird in einen riesigen bedingten Ausdruck FFmpeg übersetzt (`lt(n,K)*val + between(n,K,K')*val + ...`, ein Zweig pro Frames-Gruppe) der direkt den Parameter`scale`Der Ausdruck wird von FFmpeg auf jeden Renderframe ausgewertet. Für eine Wiedergabe von ein paar Sekunden bei 60 fps sind es schnell Hunderte von Zweigen in einem einzigen Ausdruck – daher der Parameter`STEP`die die Frames zusammenfasst, um die Tiefe zu begrenzen.

### 5. Nach Segmenten und dann fisheye auf der Intro

Jede Replik wird einzeln zurückgegeben: Video Hintergrund (zufälliger Auszug aus einem der Gameplay-Clips in`bg-video/`, auf die richtige Dauer geschnitten), Kreis des Agenten über mit Audio-Reaktiv Zoom, Untertitel über Filter eingeblendet`ass`FFmpeg, TTS Audio mit dem Sound des Gameplay im Hintergrund gemischt.

Das erste Segment erhält eine spezielle Behandlung: eine Fisheye-Verzerrung, die sich allmählich auf die ersten 20% der Frames (Filter) rekonstruiert`lenscorrection`Frame-gelesen durch Frame, plus ein`tmix=frames=3`die die benachbarten Frames mischt, um die Bewegung zu simulieren, synchronisiert mit einem Geräusch von "whoosh." Es ist der Übergang von Intro, der den Eindruck vermittelt, dass die Kamera "rück" in die Szene.

### 6. Endlagerung und Endmischung

Alle Segmente sind endlos zusammengefügt, die Hintergrundmusik (Sneaky Snitch, Kevin MacLeod, Creative Commons Lizenz) wird über dem **Audio-Duching** – eine sidechain Kompression gemischt, die automatisch das Volumen der Musik senkt, während ein Agent spricht, und das während der Stille wieder zurückkommt. Alles dreht sich in 60 fps von Ende zu Ende, keine Frameratkonvertierung zwischen den Schritten.

### 7. Automatische Veröffentlichung

Das Skript`run-cron.sh`, von einem klassischen Cron gestartet, aktiviert die Python-Umgebung, lädt die`.env`, und wirft`bun src/workflow.ts –upload`. Der Flag`–upload`löst zusätzlich die Metadatenerzeugung aus (Titel, Beschreibung, Tags) und ruft`uploaders/upload.py`, die das Video auf YouTube und Instagram über zwei separate Skripte veröffentlicht (`uploaders/youtube/upload.py`und`uploaders/instagram/`) Die gesamte Kette, vom schnellen LLM bis zum Online-Video, läuft ohne menschliche Intervention.

## Warum TypeScript/Bun anstatt eine ganze Python Sache

Die Wahl ist nicht ideologisch – es ist, dass Bun einen direkten und schnellen Zugang zu`Bun.spawn`Um FFmpeg im Subprozess zu steuern, ist eine starke Typisierung der Datenstrukturen der Pipeline (`Phrase` , `SegmentInfo`), und ein viel schnelleres Runtime beim Start als Node für ein Skript, das alle X Stunden in Cron läuft. Die einzigen beiden Spitzen von Python im Projekt sind dort, wo Pythons wirklich am besten getoolst ist: PIL für die Farbauslesen, und die APIs von Upload (`google-api-python-client`für YouTube, die Stack Instagram Graphik API für IG).

## Was das zeigt

Dieses Projekt ist ein gutes Beispiel für das, was man heute mit völlig kostenlosen oder Open Source Ziegel bauen kann: ein schnelles und kostenloses LLM über die Groq API, ein lokaler TTS-Engine, der ohne dedizierte GPU läuft, FFmpeg für das gesamte Videorendering – und es verbindet, ist nur einige hundert Zeilen TypScript. Keiner dieser Steine ist individuell neu. Was die Pipeline ist, ist die Anordnung: ein kohärentes Skript mit echten Beziehungen zwischen Charakteren erzeugen, es in expressive Audio mit natürlichen Pausen verwandeln, eine visuelle Wiedergabe der Energie dieses Frame-Audios synchronisieren und die gesamte Kette bis zur Veröffentlichung automatisieren.

---

**Ressourcen**

- **Repo**:[github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **Zeichen**:[@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**3 Schlüsselpunkte**

1. Das Skript wird durch ein LLM (Groq/Llama 3.3) mit Personen und Beziehungen durch Agenten erzeugt, nicht nur eine Liste vorgeschriebener Witze.
2. Der Zoom des Agentenkreises wird durch einen Ausdruck FFmpeg gesteuert, der durch Frame aus dem RMS-Hüllen des WAV berechnet wird – keine Animation durch klassische Keyframes.
3. Die gesamte Kette, vom Schnellzug bis zum YouTube/Instagram-Post, dreht sich über einen einzigen Cron Job ohne menschliche Intervention.
