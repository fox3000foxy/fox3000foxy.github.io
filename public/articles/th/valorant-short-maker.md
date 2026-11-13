---
title: >-
  valorant-short-maker : ระบบกระบวนการที่สร้างวิดีโอสั้น Valorant ของฉันเอง
description: >-
  Groq/Llama สำหรับสคริปต์, Piper สำหรับเสียง, FFmpeg สำหรับส่วนที่เหลือทั้งหมด.
  วิธีที่งาน cron สร้างและเผยแพร่วิดีโอหนึ่งคลิปต่อวันบน @valorant_agents,
  ตั้งแต่ A ถึง Z.
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "SWZikZDR717YiazM9OlV/21KSSEv4WSS0pLAXezbxq6/M2JYO6gNCz8m4jPV2WvkRdCRTzldv1DGZ16S6BsaQg=="
---

# valorant-short-maker : กระบวนการสร้างสั้น ๆ ของฉันเอง

Depuis quelques mois, une chaîne YouTube tourne sans que j'y touche : [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop). Des agents Valorant qui se chambrent entre deux rounds, doublés, sous-titrés en karaoké, publiés en Shorts. Tout est généré par [`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker), un pipeline TypeScript/Bun qui tourne en cron et publie sans que personne n'ait à cliquer sur quoi que ce soit.

## Ce que ça donne

Trois frames extraites de la vidéo générée pour "Duelist Debate" (Phoenix, Yoru et Jett) :

![แนะนำสั้น ๆ, วงกลมตัวแทนพร้อมชื่อฉาก](/images/valorant-short-maker/vsm-01-intro.png)

![บทสนทนากำลังดำเนินต่อ, คำบรรยายคาราโอเกะที่ส่องสว่าง](/images/valorant-short-maker/vsm-02-dialogue.png)

![อีกบรรทัดหนึ่ง, สีของคำบรรยายเปลี่ยนตามตัวแทน](/images

แต่ละรันจะเลือกตัวละคร 3 ถึง 4 ตัวแบบสุ่มจาก 26 ตัวที่พร้อมใช้งาน และส่งพรอมต์ระบบไปยัง Llama 3.3 70B (ผ่าน Groq) ซึ่งประกอบด้วยสำหรับตัวละครแต่ละตัวที่เลือก มีสรุปกระชับเกี่ยวกับบุคลิกภาพและความสัมพันธ์กับตัวละครอื่น ๆ ที่อยู่ในฉาก (เหล่านี้อยู่ใน `src/lore/` ไฟล์หนึ่งไฟล์ต่อหนึ่งตัว) พรอมต์บังคับให้มีกฎระเบียบเฉพาะ : ประโยคสั้นแต่กระชับต่อแต่ละการพูด, การวนเวียนที่เป็นธรรมระหว่างตัวละคร, ควรมีความตลกเป็นหลัก, และสำคัญที่สุดคือให้มีพักระหว่างบทพูด  

ตัวอย่างจริงกับ “Duelist Debate” -- Phoenix, Yoru และ Jett โต้แย้งกันเพื่อดูว่าใครจะเล่น duelist, สร้างเมื่อวันที่ 6 กรกฎาคม 2026 :

```
phoenix: ฉันบอกคุณแล้วว่าฉันมีทักษะพอที่จะเล่น duelist ในแมทช์นี้
yoru: ทักษะ คุณเรียกว่าจุดไฟด้านไหนก็ 'ทักษะ' ?, Phoenix
jett: ฉันเร็วที่สุดที่นี่ ฉันควรเล่น duelist
phoenix: เร็วที่สุด, แต่คุณทนไฟไหม, Jett [0.3] ฉันสงสัยว่ามันจะเป็นไง
yoru: ไฟ ล่ะ พูดว่าไฟของคุณร้อนกว่าแผ่นแตกของฉัน
jett: นี่ไม่ใช่เรื่องไฟหรือแสง, มันคือความเร็วและความคล่องตัว
phoenix: โอเค เข้าใจแล้ว, ดังนั้นคุณอาจจะเป็นผู้เชี่ยวชาญคนนั้นเดเฉลย, Yoru [0.3] นั่นคือเรื่องที่เสมือน
yoru: อย่างน้อยฉันไม่ใช้วิธีไฟแบบราคาถูก
jett: ไฟแบบราคาถูก, นั่นคือสิ่งที่คุณเรียกว่าเทคนิคของ Phoenix
phoenix: เฮ้, เทคนิคไฟของฉันช่วยให้เราหัวเข้าแก่นอ้างก่อน [0.3] ไม่รู้สึกเหมือนสำหรับแผ่นแตกของคุณเอง, Yoru
yoru: แก่นอ้าง, ความหมายว่าเมื่อฉันข้ามผ่านเกาะของเราออกจากกล่องกลม
jett: พอ, เรื่องนี้มันถือในเวลา, ให้เราตัดสินใจพูดกันแล้วหน่อย
phoenix: ตายตัว, แต่ฉันยังคงบอกว่าฉันเป็น duelist ที่ดีที่สุดที่นี่
yoru: เชิญ, คุณคิดจะจับพวกข้างตรงคนเดียว [0.3] ฉันสงสัยว่ามันจะเป็นไง
jett: ฉันจะเอามันไป, ไม่มีปัญหา, ฉันเร็วที่สุด
phoenix: เร็วที่สุด, ใช่, แต่คุณจะควบคุมปริชัดกว่าเขา [0.3] นี่คือข้อสังเกต
yoru: ควบคุม, ล่ะ, คุณคิดว่าคุณจะควบคุมใคร? Phoenix
jett: นี่มันกลิ้ง, เราจะกันคำนี้ได้เลย
phoenix: ตายตัว, เรามาเล่นทีละสมาชิกรับว่าดีกว่า [0.3] ถ้าคุณก็ทำคลิกเดียวกัน
yoru: ไปเลย ฉันจะแสดงให้คุณเห็นว่าผู้ duelist จริงจังเป็นอย่างไร
jett: ฉันไม่ถอย, ฉันเล่น duelist
phoenix: โอ, นี่ดี [0.3] มาดูกันว่าท่านที่มากระเป๋ากันได้จริงไหม
yoru: เราจะมา, จะได้มุมมองใหม่ลงไป Jett
jett: ใช่เลย ให้สิ้นสุดการโต้แย้งนี้ครั้งนี้
pause: 0.3
phoenix: โอเค, ก็เริ่มเลย [0.3] ขอให้ duelist ที่ดีที่สุดชนะ
yoru: ฉันแน่ใจว่าจะทำให้คุณไหม, Phoenix, ไม่ใช่ไฟ แต่ด้วยแผ่นแตกของฉัน
jett: ฉันจะทำพวกคุณโดด, ไม่มีปัญหา
```

Les pauses sont le détail qui rend le rythme naturel : `[0.3]` inséré au milieu d'une réplique crée un silence de 0.3s dans le fichier audio sans couper le cercle de l'agent à l'écran, alors qu'une ligne `pause: 1.0` à part entière crée un vrai silence entre deux locuteurs, cercle caché. Sans ça, un TTS qui enchaîne les répliques sans respirer sonne robotique.

### 2. Donner une voix -- Piper, un modèle par agent

Chaque agent a son propre modèle Piper (`.onnx`) entraîné spécifiquement, stocké dans `voices/<agent>/`. Le texte généré passe dans le modèle correspondant, ce qui sort un WAV. C'est la même techno que j'utilise pour le training de voix custom en général (voir l'article sur le pipeline Piper/Kaggle) -- ici appliquée directement en prod, à la volée, à chaque génération de vidéo.

### 3. Sous-titres karaoké -- ASS généré, couleur extraite de l'icône

Le sous-titrage n'est pas un simple `.srt`. C'est un fichier `.ass` (Advanced SubStation Alpha) généré mot par mot, avec un effet karaoké : chaque mot s'illumine dans une couleur au fur et à mesure qu'il est prononcé, pendant que le reste du texte reste dans une couleur neutre. La couleur d'accent n'est pas fixe -- elle est extraite dynamiquement de l'icône de l'agent qui parle (un script Python fait tourner PIL sur le PNG de l'icône, échantillonne les pixels non-transparents, et renvoie les couleurs dominantes). Résultat : le sous-titre de Killjoy s'illumine en violet, celui de Jett en bleu-vert, sans qu'aucune couleur n'ait été codée en dur quelque part.

### 4. วงกลมตอบสนองเสียง -- การแสดงผล FFmpeg frame โดย frame

C'est la partie la plus tordue du pipeline, et probablement celle dont je suis le plus fier. L'icône ronde de l'agent qui parle ne reste pas statique : elle zoome et dézoome légèrement au rythme de sa propre voix.

Le calcul se fait en lisant le WAV brut de la réplique, en calculant l'enveloppe RMS (root mean square, une mesure de l'énergie du signal) frame par frame à 60 fps, en normalisant par le maximum, puis en lissant sur une fenêtre de 3 frames pour éviter les à-coups. Chaque valeur d'enveloppe est ensuite convertie en un facteur d'échelle borné par `MAX_ZOOM_VARIATION` (0.2, donc ±20% autour de la taille de base).

ผลลัพธ์ของการคำนวณนี้ไม่ได้รับการประยุกต์โดยโค้ดที่จัดการกับพิกเซล -- มันถูกแปลเป็นนิพจน์เงื่อนไขยักษ์ใหญ่ของ FFmpeg (`lt(n,K)*val + between(n,K,K')*val + ...`, สาขาหนึ่งต่อกลุ่มเฟรม) ที่ควบคุมพารามิเตอร์ `scale` ของตัวกรองวิดีโอโดยตรง FFmpeg จะประเมินนิพจน์นี้ในทุกเฟรมของการเรนเดอร์ สำหรับการซิงค์อันสั้นประมาณสองสามวินาทีที่ความเร็ว 60 fps ก็ทำให้มีหลายร้อยสาขาในนิพจน์เดียว -- นั่นจึงเป็นพารามิเตอร์ `STEP` ที่รวมหรือรวมเฟรมเพื่อจำกัดความลึก

### 5. การเรนเดอร์โดยส่วน, จากนั้น fisheye ในตอนเปิดตัว

ทุกซิงค์ถูกเรนเดอร์แยกตัวมันเอง: พื้นหลังวิดีโอ (สุ่มคลิปจากกราฟิกใน `bg-video/`, ตัดให้เหมาะสม), วงกลมของตัวแทนบนสุดพร้อมซูมเสียง-ตอบสนอง, แซทท์อัพดีเนี้่นผ่านตัวกรอง `ass` ของ FFmpeg, เสียง TTS ผสมกับเสียงเล่นเกมอยู่พื้นหลัง

ส่วนแรกทั้งหมดรับการดูแลพิเศษ: การบิดเบือน fisheye ที่ค่อยๆ ค่อย ๆ เชื่อมกันใน 20% ตัวเริ่มแรก (ตัวกรอง `lenscorrection` ประเมินเฟรมต่อเฟรม, เพิ่มอีก `tmix=frames=3` ที่ผสมเฟรมที่ถัดมาเพื่อจำลองมอชท์บลูร์) โดนซิงค์กับเสียงหัวเราะ "whoosh" เป็นจุดเปลี่ยนต่อที่ทำให้ผู้ชมรู้สึกว่าพลิกกล้อง "กลับไปกลับมาจาก" ออกมาจากฝั่ง เหมือนกับว่าเป็นการเปิดตัว

### 6. การเชื่อมต่อและการผสานน้ำเสียงสุดท้าย

(หมายเหตุ: พยายามครั้งก่อนพัง: backticks. ระวังเลย)

Tous les segments sont concaténés bout à bout, la musique de fond (Sneaky Snitch, Kevin MacLeod, licence Creative Commons) est mixée par-dessus avec du **ducking audio** -- une compression sidechain qui baisse automatiquement le volume de la musique pendant qu'un agent parle, et qui remonte pendant les silences. Le tout tourne en 60 fps de bout en bout, aucune conversion de framerate entre les étapes.

### 7. การเผยแพร่อัตโนมัติ

Le script `run-cron.sh`, lancé par un cron classique, active l'environnement Python, charge le `.env`, et lance `bun src/workflow.ts --upload`. Le flag `--upload` déclenche en plus la génération de métadonnées (titre, description, tags) et appelle `uploaders/upload.py`, qui publie la vidéo sur YouTube et Instagram via deux scripts séparés (`uploaders/youtube/upload.py` et `uploaders/instagram/`). Toute la chaîne, du prompt LLM à la vidéo en ligne, tourne sans intervention humaine.

## ทำไมเลือกใช้ TypeScript/Bun แทนวิธีการเป็นเพียง Python

Le choix n'est pas idéologique -- c'est que Bun donne un accès direct et rapide à `Bun.spawn` pour piloter FFmpeg en sous-processus, un typage fort sur les structures de données du pipeline (`Phrase`, `SegmentInfo`), et un runtime largement plus rapide au démarrage que Node pour un script qui tourne en cron toutes les X heures. Les deux seuls bouts de Python dans le projet sont là où Python est réellement le mieux outillé : PIL pour l'extraction de couleurs, et les APIs d'upload (`google-api-python-client` pour YouTube, la stack Instagram Graph API pour IG).

## สิ่งที่แสดงออก

Ce projet est un bon exemple de ce qu'on peut construire aujourd'hui avec des briques entièrement gratuites ou open source : un LLM rapide et gratuit via l'API Groq, un moteur TTS local qui tourne sans GPU dédié, FFmpeg pour tout le rendu vidéo -- et le liant, ce n'est que quelques centaines de lignes de TypeScript. Aucune de ces briques n'est nouvelle individuellement. Ce qui fait le pipeline, c'est l'agencement : générer un script cohérent avec de vraies relations entre personnages, le transformer en audio expressif avec des pauses naturelles, synchroniser un rendu visuel sur l'énergie de cet audio frame par frame, et automatiser toute la chaîne jusqu'à la publication.

---

**ทรัพยากร**

- **คลัง** : [github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **ช่อง** : [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**3 points clés**

1. สคริปต์ถูกสร้างโดย LLM (Groq/Llama 3.3) พร้อมบุคลิกภาพและความสัมพันธ์ตามตัวแทน ไม่ใช่เพียงแค่รายชื่อมุกตลกที่เขียนล่วงหน้า  
2. การซูมของวงกลมตัวแทนถูกควบคุมโดยนิพจน์ FFmpeg ที่คำนวณเฟรมต่อเฟรมจาก envelope RMS ของ WAV -- ไม่ใช้การเคลื่อนไหวแบบ keyframes แบบคลาสสิก  
3. ทั้งชุดทั้งหมด ตั้งแต่ prompt ไปจนถึงโพสต์บน YouTube/Instagram ทำงานผ่าน cron job เดียว ไม่มีการแทรกแซงจากมนุษย์
