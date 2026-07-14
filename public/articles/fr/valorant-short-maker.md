---
title: "valorant-short-maker : le pipeline qui génère mes shorts Valorant tout seul"
description: "Groq/Llama pour le script, Piper pour les voix, FFmpeg pour tout le reste. Comment un cron job produit et publie une vidéo par jour sur @valorant_agents, de A à Z."
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "VZ7cf+sp52Tx5EmZp8/DSwQ2AzYxp4s8ulfmoWfXV0x3Dw6RGPbhv5w00xAt6EnhPPDAwpn6nL7r/o3MJyMfWw=="
---

# valorant-short-maker : le pipeline qui génère mes shorts Valorant tout seul

Depuis quelques mois, une chaîne YouTube tourne sans que j'y touche : [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop). Des agents Valorant qui se chambrent entre deux rounds, doublés, sous-titrés en karaoké, publiés en Shorts. Tout est généré par [`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker), un pipeline TypeScript/Bun qui tourne en cron et publie sans que personne n'ait à cliquer sur quoi que ce soit.

Voici comment ça marche, étape par étape.

## Ce que ça donne

Trois frames extraites de la vidéo générée pour "Duelist Debate" (Phoenix, Yoru et Jett) :

![Intro d'un short, cercle d'agent avec le titre de la scène](/images/valorant-short-maker/vsm-01-intro.png)

![Une réplique en cours, sous-titre karaoké qui s'illumine](/images/valorant-short-maker/vsm-02-dialogue.png)

![Une autre réplique, la couleur du sous-titre change selon l'agent](/images/valorant-short-maker/vsm-03-dialogue.png)

Le résultat en live sur ce Short : [Duelist Debate -- youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU). Sur la chaîne, les Shorts tournent autour de 1,2 à 1,5k vues. Rien d'énorme, mais c'est une chaîne qui tourne toute seule depuis le début, donc le nombre qui compte vraiment c'est zéro -- zéro minute passée dessus une fois le cron lancé.

## Le pipeline, dans l'ordre

### 1. Écrire le script -- Groq + Llama 3.3

Chaque run pioche 3 à 4 agents au hasard parmi les 26 disponibles, et envoie à Llama 3.3 70B (via Groq) un prompt système qui contient, pour chaque agent choisi, un résumé compact de sa personnalité et de ses relations avec les autres agents présents dans la scène (ces personas vivent dans `src/lore/`, un fichier par agent). Le prompt impose des règles précises : une phrase courte et percutante par réplique, rotation équitable entre les personnages, humour en priorité, et surtout des pauses.

Exemple concret avec "Duelist Debate" -- Phoenix, Yoru et Jett se disputent pour savoir qui jouera duelist, généré le 6 juillet 2026 :

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

Les pauses sont le détail qui rend le rythme naturel : `[0.3]` inséré au milieu d'une réplique crée un silence de 0.3s dans le fichier audio sans couper le cercle de l'agent à l'écran, alors qu'une ligne `pause: 1.0` à part entière crée un vrai silence entre deux locuteurs, cercle caché. Sans ça, un TTS qui enchaîne les répliques sans respirer sonne robotique.

### 2. Donner une voix -- Piper, un modèle par agent

Chaque agent a son propre modèle Piper (`.onnx`) entraîné spécifiquement, stocké dans `voices/<agent>/`. Le texte généré passe dans le modèle correspondant, ce qui sort un WAV. C'est la même techno que j'utilise pour le training de voix custom en général (voir l'article sur le pipeline Piper/Kaggle) -- ici appliquée directement en prod, à la volée, à chaque génération de vidéo.

### 3. Sous-titres karaoké -- ASS généré, couleur extraite de l'icône

Le sous-titrage n'est pas un simple `.srt`. C'est un fichier `.ass` (Advanced SubStation Alpha) généré mot par mot, avec un effet karaoké : chaque mot s'illumine dans une couleur au fur et à mesure qu'il est prononcé, pendant que le reste du texte reste dans une couleur neutre. La couleur d'accent n'est pas fixe -- elle est extraite dynamiquement de l'icône de l'agent qui parle (un script Python fait tourner PIL sur le PNG de l'icône, échantillonne les pixels non-transparents, et renvoie les couleurs dominantes). Résultat : le sous-titre de Killjoy s'illumine en violet, celui de Jett en bleu-vert, sans qu'aucune couleur n'ait été codée en dur quelque part.

### 4. Le cercle audio-réactif -- une expression FFmpeg par frame

C'est la partie la plus tordue du pipeline, et probablement celle dont je suis le plus fier. L'icône ronde de l'agent qui parle ne reste pas statique : elle zoome et dézoome légèrement au rythme de sa propre voix.

Le calcul se fait en lisant le WAV brut de la réplique, en calculant l'enveloppe RMS (root mean square, une mesure de l'énergie du signal) frame par frame à 60 fps, en normalisant par le maximum, puis en lissant sur une fenêtre de 3 frames pour éviter les à-coups. Chaque valeur d'enveloppe est ensuite convertie en un facteur d'échelle borné par `MAX_ZOOM_VARIATION` (0.2, donc ±20% autour de la taille de base).

Le résultat de ce calcul n'est pas appliqué via du code qui manipule des pixels -- c'est traduit en une immense expression conditionnelle FFmpeg (`lt(n,K)*val + between(n,K,K')*val + ...`, une branche par groupe de frames) qui pilote directement le paramètre `scale` du filtre vidéo. FFmpeg évalue cette expression à chaque frame du rendu. Pour une réplique de quelques secondes à 60 fps, ça fait vite des centaines de branches dans une seule expression -- d'où le paramètre `STEP` qui regroupe les frames pour limiter la profondeur.

### 5. Rendu par segment, puis fisheye sur l'intro

Chaque réplique est rendue individuellement : fond vidéo (extrait aléatoire d'un des clips de gameplay dans `bg-video/`, coupé à la bonne durée), cercle de l'agent par-dessus avec le zoom audio-réactif, sous-titres incrustés via le filtre `ass` d'FFmpeg, audio TTS mixé avec le son du gameplay en fond.

Le tout premier segment reçoit un traitement spécial : une distorsion fisheye qui se résorbe progressivement sur les 20% premiers frames (filtre `lenscorrection` évalué frame par frame, plus un `tmix=frames=3` qui mélange les frames adjacentes pour simuler du motion blur), synchronisée avec un bruit de "whoosh". C'est la transition d'intro qui donne l'impression que la caméra "rentre" dans la scène.

### 6. Concaténation et mixage final

Tous les segments sont concaténés bout à bout, la musique de fond (Sneaky Snitch, Kevin MacLeod, licence Creative Commons) est mixée par-dessus avec du **ducking audio** -- une compression sidechain qui baisse automatiquement le volume de la musique pendant qu'un agent parle, et qui remonte pendant les silences. Le tout tourne en 60 fps de bout en bout, aucune conversion de framerate entre les étapes.

### 7. Publication automatique

Le script `run-cron.sh`, lancé par un cron classique, active l'environnement Python, charge le `.env`, et lance `bun src/workflow.ts --upload`. Le flag `--upload` déclenche en plus la génération de métadonnées (titre, description, tags) et appelle `uploaders/upload.py`, qui publie la vidéo sur YouTube et Instagram via deux scripts séparés (`uploaders/youtube/upload.py` et `uploaders/instagram/`). Toute la chaîne, du prompt LLM à la vidéo en ligne, tourne sans intervention humaine.

## Pourquoi TypeScript/Bun plutôt qu'un truc tout Python

Le choix n'est pas idéologique -- c'est que Bun donne un accès direct et rapide à `Bun.spawn` pour piloter FFmpeg en sous-processus, un typage fort sur les structures de données du pipeline (`Phrase`, `SegmentInfo`), et un runtime largement plus rapide au démarrage que Node pour un script qui tourne en cron toutes les X heures. Les deux seuls bouts de Python dans le projet sont là où Python est réellement le mieux outillé : PIL pour l'extraction de couleurs, et les APIs d'upload (`google-api-python-client` pour YouTube, la stack Instagram Graph API pour IG).

## Ce que ça illustre

Ce projet est un bon exemple de ce qu'on peut construire aujourd'hui avec des briques entièrement gratuites ou open source : un LLM rapide et gratuit via l'API Groq, un moteur TTS local qui tourne sans GPU dédié, FFmpeg pour tout le rendu vidéo -- et le liant, ce n'est que quelques centaines de lignes de TypeScript. Aucune de ces briques n'est nouvelle individuellement. Ce qui fait le pipeline, c'est l'agencement : générer un script cohérent avec de vraies relations entre personnages, le transformer en audio expressif avec des pauses naturelles, synchroniser un rendu visuel sur l'énergie de cet audio frame par frame, et automatiser toute la chaîne jusqu'à la publication.

---

**Ressources**

- **Repo** : [github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **Chaîne** : [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**3 points clés**

1. Le script est généré par un LLM (Groq/Llama 3.3) avec des personas et relations par agent, pas une simple liste de blagues pré-écrites.
2. Le zoom du cercle d'agent est piloté par une expression FFmpeg calculée frame par frame à partir de l'enveloppe RMS du WAV -- pas d'animation par keyframes classique.
3. Toute la chaîne, du prompt au post YouTube/Instagram, tourne via un seul cron job sans intervention humaine.
