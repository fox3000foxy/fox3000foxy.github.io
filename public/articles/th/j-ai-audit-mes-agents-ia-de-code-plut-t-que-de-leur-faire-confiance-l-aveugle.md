---
title: >-
  ฉันตรวจสอบเอเย่นต์ IA ของฉันด้วยโค้ดมากกว่าการมอบความไว้วางใจโดยตาเหงียบ
description: >-
  การตรวจสอบสองครั้งที่ทำเพื่อเขียนรายงานเทคนิคข้อสี่ของแพลตฟอร์มการซื้อขายของฉันได้เปิดเผยข้อบกพร่องสองชนิดโดยแยกกัน:
  ตัวแทนหนึ่งที่ลืมเนื่องจาก repo ไม่ได้อยู่ภายในขอบเขตบริบทของเขา
  และตัวแทนอีกหนึ่งที่เขียนโค้ดสิบเท่าเกินจำเป็นเนื่องจากไม่มีสิ่งใดที่กระตุ้นให้เขาลดจำนวนโค้ด
date: 2026-09-15
tags: [["ai", "llm-agents", "code-review", "context-window", "trading", "typescript"]]
authors:
  - docteur-turboss
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "snmQXcAK61kyl6F0hwh2CvnYjmWyNF1J3OV0c6grji6sxg3Oapm57O+It3epkvAKTetN3/duRTgH03aUbEFDyQ=="
---

## อาการก่อนการวินิจฉัย

แต่ละฉบับของรายงานทางเทคนิคของแพลตฟอร์มทำให้ฉันต้องเดินตามสถาปัตยกรรมทั้งหมด: บริการ ตัวแทน กระบวนการข้อมูล ฉันได้เตรียมฉบับที่ 4 แล้ว ขนาดของคลังข้อมูลก็ทำให้ฉันตื่นตระหนก เพราะฉันได้เห็นมันเพิ่มขึ้นอย่างช้า ๆ ปรากฏว่าเกิดขึ้นอย่างต่อเนื่องโดยไม่มีจุดที่จะหยุด: คลังข้อมูลที่ครั้งแรกมีเพียงไม่กี่พันบรรทัด ไม่เกิน 10 ko ตอนนี้ได้ไปถึง 100 Mo แพลตฟอร์มก็มีฟังก์ชันเพียงเล็กน้อย ฉันก็เพียงพึ่งพาตัวแทนประเภท Claude Chat เพื่อสร้างและแก้ไขโค้ดโดยไม่ได้กำหนดรายละเอียดที่ฉันขอแต่ละอันหรือขอบเขตของงาน

การเขียนรายงานทำให้ฉันต้องออกจากโหมด “มันค่อย ๆ พัฒนา” ไปสู่โหมด “เกิดอะไรขึ้นจริง ๆ” ฉันทำการตรวจสอบสองครั้งบนประวัติของคลังข้อมูล ทั้งสองพบสาเหตุเดียวกัน แต่ด้วยเหตุผลที่ต่างกันอย่างเต็มเปี่ยม

## ตรวจสอบครั้งที่ 1: หน้าต่างบริบทที่โกหก

การตรวจสอบครั้งแรกนั้นทำโดยอ้างอิงตามบริการหนึ่งต่อหนึ่งถึงการแก้ไขที่ทำโดยตัวแทน AI ในหลายเดือน และตรวจสอบว่ามันสอดคล้องกับส่วนอื่นของคลังข้อมูลในเวลาที่นำเข้าไหม

รูปแบบที่กลับมาเรื่อย ๆ : ตัวแทนจะแก้ไขปัญหาในระดับพื้นที่โดยตรง, ในไฟล์หรือโมดูลที่มองเห็นอยู่, โดยไม่เห็นความเทียบเท่าในส่วนอื่นของ repo หรือไม่จำได้ ผลลัพธ์ : อินเทอร์เฟซเดียวกันถูกกำหนดใหม่ด้วยความแตกต่างเล็ก ๆ ในสองบริการ, การเปลี่ยนชื่อถูกนำมาใช้ครึ่งหนึ่งเพราะครั้งที่สองอยู่ข้างนอกขอบเขตบริบทในเวลาตัวแจ้ง, การกำหนดชื่อที่ถูกปฏิบัติตามในโมดูลหนึ่งและถูกละเลยในโมดูลถัดไป. ไม่มีอะไรโดดเด่นเมื่อดูแยก ๆ, แต่ถ้ารวมกันในหลาย ๆ เซสชันจะสร้างความซ้ำซ้อนและกลิ่นร้ายของโค้ดที่ทำให้เครื่องมือถัดไปเสียน้ำหนักเมื่อเราทำงานกับมัน วงจรที่มีการทำงานตนเอง : เมื่อ repo เติบโตและแยกย่อยขึ้น, จึงยากขึ้นสำหรับตัวแทนที่จดจำทั้งหมด, การแก้ไขจึงเป็นเฉพาะท้องถิ่นและบางส่วน, repo ก็เติบโตขึ้น

ปัญหาไม่ได้เป็นว่าตัวแทน "โกหก" หรือประดิษฐ์; อันนี้ตอบคำถามอย่างถูกต้องตามบริบทที่มีให้. ปัญหาคือฉันมักไม่เคยกำหนดขอบเขตของคำถามล่วงหน้า. ฉันจะขอ “

Le deuxième audit était plus mécanique : faire tourner un `git log --numstat` sur tout l'historique, agréger lignes ajoutées et caractères ajoutés par commit et regarder la distribution.

Les 30 plus gros commits en lignes ajoutées représentèrent, à eux seuls, une part largement disproportionnée du volume total du repo. Systématiquement, les mêmes commits ressortaient aussi comme les plus gros en caractères ajoutés. C'était prévisible, sauf que le ratio caractères/lignes de ces commits-là n'était pas seulement lié au nombre de lignes : les lignes elles-mêmes étaient plus verbeuses, avec plus de commentaires explicatifs redondants avec le nom des fonctions, plus de blocs de gestion d'erreurs dupliqués au lieu d'être factorisés, plus de docstrings qui reformulaient trois fois la même chose.

C'est la conséquence directe d'un comportement connu quand on interagit avec un LLM en chat : sans consigne explicite de concision, il a tendance à beaucoup parler, à justifier, commenter, reformuler. En conversation, cela coûte des tokens de sortie. En génération de code, ce même réflexe se traduit en lignes qui restent dans le repo indéfiniment, commit après commit, sans qu'on les relise vraiment tant que le code fonctionne.

## Ce que les deux audtis, mis côte à côte, ont montré

Pour le premier rapport : la cohérence inter-services souffre d'une fenêtre de contexte trop petite pour tenir tout le repo, ce qui entraîne des corrections locales, des redondances et des divergences de conventions.

Pour le second : `git log --numstat` montre une verbosité par défaut d'un LLM non cadré, ce qui cause des lignes et caractères ajoutés disproportionnés et un code peu factorisé.

Les deux réunis pointent la redondance et le volume : cela donne un repo trop gros pour qu'un futur agent le tienne en tête, ce qui aggrave encore le premier problème mis en évidence par le premier audit.

C'est cette dernière ligne qui m'a le plus inquiété en écrivant le rapport : les deux problèmes sont liés, ils se nourrissent l'un l'autre. Plus le code généré est verbeux, plus le repo grossit vite ; plus il grossit, moins un agent peut le tenir en contexte ; moins il peut le tenir en contexte, plus ses corrections sont locales et redondantes ; plus elles sont redondantes, plus cela ajoute de volume. Une boucle de rétroaction négative, entièrement causée par une utilisation d'agents sans cadrage.

## Pourquoi ce n'est pas un bug ponctuel d'un outil précis

ไม่มีสิ่งใดในการวินิจฉัยนี้ที่เฉพาะเจาะจงกับโมเดลหรือผลิตภัณฑ์บางตัวอย่างหนึ่ง  
ตัวแทนประเภทแชทไม่ว่าจะเป็นแบบไหนก็จะดำเนินการบนสิ่งที่ให้มาพบในหน้าต่างของตัวเองในเวลาปัจจุบัน และจะสร้างคำตอบที่ครอบคลุมที่สุดและชวนมีเหตุผลมากที่สุดตามค่าเริ่มต้น นี่คือพฤติกรรมที่คาดหวังจากผู้ช่วยสนทนาอย่างแท้จริง และก็เป็นพฤติกรรมที่ควรหลีกเลี่ยงสำหรับเครื่องมือที่เขียนใน repo ของการผลิต ปัญหามาจากการขาดการกำหนดขอบเขตระหว่างเครื่องมือและ repo: ขอบเขตของไฟล์ที่ควรพิจารณา รูปแบบผลลัพธ์ที่คาดหวัง งบประมาณของบรรทัดหรือความยาว การบังคับให้อ้างอิงอย่างชัดเจนสิ่งที่มีอยู่ก่อนหน้านี้ก่อนเขียนสิ่งใหม่

## สิ่งที่ฉันเปลี่ยนแปลงตั้งแต่นั้นไป

ปฏิกิริยาแบบมีเหตุผลอาจจะลดข้อความที่เขียนอยู่ลงอย่างรุนแรง แต่ผมตัดสินใจทำในรูปแบบที่แตกต่าง audits ได้ช่วยผมในเรื่องอื่น: สแกนโค้ดเพื่อหาซึ่งสัญชาปัญหา (code smells) แล้วใช้มันในการกำหนดขอบเขตอย่างชัดเจนว่าปัญหาจริงๆ อยู่ที่ไหน ความไม่ตรงกันระหว่างเซอร์วิส การซ้ำซ้อน จุดที่เรื่องมีการเลี้ยวคลื่นลายค้ายกเลิกมากกว่าการเดา ปริมาณโค้ดที่เขียนยังคงอยู่ในระดับที่สำคัญ: verbose หรือไม่ verbose มันยังคงมีประโยชน์ถ้ามีการใช้งานอย่างถูกต้อง จุดดังคือความชัดเจนว่าต้องมองหาเพื่อแก้ไขอย่างไรจะไม่ตรง อีกอย่างหนึ่งคือไม่ต้องปฏิเสธให้เอเย่นต์เขียน

## ขั้นตอนถัดไป

การแบ่งแยกรีโพเป็นหน่วยเล็ก ๆ และชัดเจนขึ้น รวมถึงเข็มขัดปลอดภัยในการผลิตสำหรับการดำเนินการและเอกสารปัญหาที่เกิดขึ้นตามลำดับเป็นเรื่องของสถาปัตยกรรม : วิธีวิเคราะห์ วิจารณ์ และทำให้บริการ ส่วนประกอบ และเอกสารสื่อสารกันอย่างสะอาด เมื่อถูกรวมแยกออก ปัจจุบันยังคงต้องประสานการตัดสินใจของตนโดยไม่ต้องกลับไปสู่โมโนลิธเดิมที่เคยมีอยู่.
