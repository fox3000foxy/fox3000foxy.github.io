---
title: >-
  ฉันทำให้เครือข่ายประสาทเทียมพัฒนาขึ้นโดยการคัดเลือกตามธรรมชาติแทนการลดค่าความลาด
description: >-
  ฉันได้แทนที่การฝึกแบบดั้งเดิมด้วยการลด Gradient ด้วยอัลกอริทึมสมัยใหม่ NSGA‑II
  เพื่อนำเสนอการพัฒนาเอเจนต์ DQN ในการซื้อ‑ขาย: มีสี่รุ่น,
  ตั้งแต่การเรียนรู้เกินไปจนถึงการเปลี่ยนแปลงลามาการ์กของน้ำหนัก
date: 2026-07-13
tags:
  - ai
  - nsga-ii
  - dqn
  - trading
  - typescript
authors:
  - docteur-turboss
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "d7rzQObHqqegbP59u70ldMEzeoxqdMJ8Vu+Riu7pECt+83SmLxXujCA2nMQ4g7/vohOZSKEAKcohimd7cfk6gQ=="
---

## ปัญหาที่อยู่กับการใช้แค่ gradient descent

การฝึกสอนตัวแทน DQN สำหรับการเทรดอัลกอริทึมด้วย gradient descent แบบคลาสสิกจะสร้างปัญหาที่ง่ายต่อการอธิบายแต่ยากต่อการแก้ไข: gradient นำเครือข่ายหนึ่งไปยังค่าต่ำสุดท้องถิ่นหนึ่งบนหน้าต่างตลาดหนึ่ง ความท้าทายคือไม่มีการรับประกันว่าค่าน้อยที่สุดนี้จะปรับตัวไปสู่รูป

La première version faisait ce qu'on attend d'un GA basique : une population de genomes, une fonction de fitness, sélection, croisement, mutation, génération suivante. Chaque genome encodait la topologie du réseau (nombre de couches, largeur), les hyperparamètres DQN (learning rate, epsilon decay, taille du replay buffer), et quelques choix architecturaux (quelles sources de données consommer, quelle taille d'embedding).

Le défaut principal : la fitness était calculée sur les mêmes données que l'entraînement. Un agent pouvait littéralement mémoriser une fenêtre de marché et obtenir un score excellent sans avoir appris une stratégie généralisable. Classique surapprentissage, mais amplifié par la sélection génétique; le GA sélectionne activement les individus qui exploitent le mieux cette faille.

## v2

การปรับแต่งคะแนน fitness เพียงตัวเดียว (เช่น ผลตอบแทน) ทำให้บังคับตัวแทนที่เสี่ยงอย่างมากเพื่อเพิ่มตัวเลขเพียงตัวเดียวนี้  

วิธีแก้ไขคือการใช้ NSGA-II (Non-dominated Sorting Genetic Algorithm II) ซึ่งปรับหลายเป้าหมายพร้อมกันโดยไม่ลดให้เป็นผลรวมถ่วงน้ำหนักแบบสุ่ม: ผลตอบแทน, drawdown สูงสุด, Sharpe ratio, ความเสถียรระหว่างหน้าต่าง  

NSGA-II สร้าง front ของ Pareto: ชุดของ genome ที่ไม่มีการปรับปรุงบนเป้าหมายใดโดยไม่ทำให้เป้าหมายอื่นลดลง  

แทนที่จะบังคับให้มีการแลกเปลี่ยนเฉพาะระหว่างผลตอบแทนและความเสี่ยงโดยใช้การถ่วงน้ำหนักที่เลือกล่วงหน้า เราจะเก็บบริเวณเส้นตัดสินคอนทั้งหมดไว้ และให้มีทางเลือกสุดท้ายที่เปิดกว้าง.

```
function nonDominatedSort(population: Genome[]): Genome[][] {
  const fronts: Genome[][] = [[]];
  for (const p of population) {
    p.dominationCount = 0;
    p.dominatedSet = [];
    for (const q of population) {
      if (dominates(p, q)) p.dominatedSet.push(q);
      else if (dominates(q, p)) p.dominationCount++;
    }
    if (p.dominationCount === 0) {
      p.rank = 0;
      fronts[0].push(p);
    }
  }
  // ... การสร้างชั้นต่อไปโดยการยกเลิกทีละขั้น
  return fronts;
}
```

การเพิ่มครั้งที่สองของ v3: **อาร์ไคร์แบบ Pareto ที่ต่อเนื่อง**  
หากไม่มีอาร์ไคร์นี้, กรณีดีที่พบในเจนเนอเรชันที่ 12 อาจหายไปในเจนเนอเรชันที่ 15 หากโอกาสในการผสมผสานไม่ทำการสืบทอด; แม้จะยังดีกว่าทุกอย่างที่ทดแทนเขา อาร์ไคร์เก็บรักษาไว้, ผ่านทุกเจนเนอเรชัน, ชุดของอินิตวิเดียไม่ซึ่งได้ครอบงำที่ไม่เคยพบเจอ, ไม่ขึ้นกับประชากรป

*   **การกระจายตัวของสภาพแวดล้อม** : แต่ละจีโนมไม่ปรับประเมินบนหน้าต่างตลาดเดียว แต่บนหลายหน้าต่างที่มาจากระบบที่แตกต่างกัน (ขึ้น, ลง, ช่วงขอบเขต) ตัวแทนที่เก่งในหน้าต่างหนึ่งและล่มในอีกหน้าต่างหนึ่งจะไม่สามารถครองหัวหน้าพารทิโอได้อีกต่อไป

*   **การปรับสม่ำเสมอตามความซับซ้อนของ FLOPs** : ต้นทุนคำนวณของเครือข่าย (ในรูปแบบ FLOPs) กลายเป็นเป้าหมายฉบับสมบูรณ์ใน NSGA-II สิ่งนี้ช่วยป้องกันไม่ให้วิวัฒนาการเชื่อมโยงกับ

```javascript
interface RLBackend {
  train(genome: Genome, window: MarketWindow): Promise<TrainedWeights>;
  evaluate(genome: Genome, weights: TrainedWeights, window: MarketWindow): Promise<FitnessVector>;
}
```

Dernier point technique : l'évaluation est passée en **concurrence asynchrone bornée**; un pool de N évaluations en parallèle plutôt qu'une boucle séquentielle, avec une limite explicite pour ne pas saturer les ressources GPU/CPU disponibles.  

## Ce que corrige la v4 par rapport à la v3 en pratique  

Défaut v3 Correction v4 Poids perdus à chaque génération Réinjection lamarckienne des poids entraînés Surapprentissage à une seule fenêtre de marché Évaluation sur fenêtres multiples, régimes variés Architectures qui grossissent sans contrainte FLOPs comme objectif Pareto explicite GA couplé aux détails de DQN Interface `RLBackend` abstraite Évaluation séquentielle lente Concurrence async bornée  

La v4 a aussi corrigé dix bugs concrets de "grounding" API; des cas où le code du GA supposait une interface pour `TradingAgent` qui ne correspondait pas exactement à l'implémentation réelle. Ce genre de bug est invisible tant qu'on ne confronte pas le code au véritable code source de l'agent : la v4 n'a été validée qu'après relecture ligne à ligne face au fichier réel.  

## Pourquoi mélanger évolution et gradient plutôt que choisir l'un ou l'autre

## สุดท้ายแล้ว โดยเราสามารถถามได้ว่า ทำไมไม่ทำ RL ล้วนหรือวิวัฒนาการล้วนแบบ NEAT ก็ตาม คำตอบอยู่ในประโยคเดียว : ช่วงแปรเป็นดีมากสำหรับการปรับพารามิเตอร์อย่างใกล้ชิด (ปรับน้ำหนักต่อเนื่องให้ใกล้เคียงออปติ้ม) การวิวัฒนาการดีมากสำหรับการสำรวจสากล (ค้นพบสถาปัตยกรรมและการรวมค่าผ่านไฮเปอร์พารามิเตอร์ที่โครงสร้าง gradient ไม่สามารถไปถึงได้ เนื่องจากพื้นที่การค้นหาที่เป็นแบบจัดหมวดไม่ใช่ตัวแปรที่อำนาจได้) การใช้หนึ่งโดยไม่มีอีกอัน คือการทำให้ขาดขบวนการสำรวจหนึ่งในสองรูปแบบ  

ราคาที่ต้องจ่ายคือความซับซ้อนด้านวิศวกรรม ; เวอร์ชันสี่ตัวไม่ใช่ของพิเศษ แต่มันคือจำนวนรอบที่จำเป็นให้วงจร GA+RL หยุดทำลายตัวเอง (การเรียนรู้เกินอัตรา , หายผู้ดี, ลบน้ำหนักที่ได้รับ) แต่ผลลัพธ์คือระบบที่สำรวจพื้นที่การออกแบบกว้างกว่าการค้นหาพารามิเตอร์แบบ grid search แต่ยังคงความมีประสิทธิภาพแบบพื้นที่กระจายของ gradient สำหรับแต่ละผู้สมัครที่ผ่านการประเมิน  

## ขั้นต่อไป

สถาปัตยกรรมการวิวัฒนาการนั้นอยู่ในระดับเดียว (ประชากรที่เรียบง่ายของ DNA DQN) เกินขีดจำกัดเมื่อจำนวนทรัพย์สินที่ต้องครอบครองเพิ่มขึ้น เพราะฉะนั้นเราได้เปลี่ยนเป็นสถาปัตยกรรมแบบ hierarchical สองระดับ (ผู้วิเคราะห์ทรัพย์สิน → ผู้จัดการภาคส่วน → ผู้จัดสรรพอร์ต) โดยใช้ GA อย่างอิสระในแต่ละระดับ... แต่เรื่องนั้นเป็นหัวข้อของบทความอื่น ๆ
