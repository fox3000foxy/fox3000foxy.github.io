---
title: "Saya mengembangkan jaringan saraf lewat seleksi alam alih-alih penurunan gradien"
description: "Bagaimana saya mengganti pelatihan klasik dengan penurunan gradien dengan algoritma genetika NSGA-II untuk mengembangkan agen DQN trading : empat versi, dari overfitting hingga evolusi lamarckian pada bobot."
date: 2026-07-13
tags: ["ai", "nsga-ii", "dqn", "trading", "typescript"]
authors: ["docteur-turboss"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "4bLu3o1SBemHHb0H0ng5r6rny1NQ5bC/L6qgDBIIPzd10Kp/PDbDkWAZtXcT2RKX8FRDC5zfwiG4h/RB6B6iog=="
---

## Masalah dengan penurunan gradien saja

Melatih agen DQN untuk trading algoritmik dengan penurunan gradien klasik menimbulkan masalah yang sederhana diucapkan dan sulit dipecahkan : gradien mengoptimalkan _satu_ jaringan menuju _satu_ minimum lokal, pada _satu_ jendela pasar. Tidak ada yang menjamin minimum itu menggeneralisasi ke rezim pasar yang berbeda, dan tidak ada dalam loop pelatihan yang mendorong keanekaragaman; dua run yang berangkat dari seed berbeda sering konvergen ke strategi yang hampir identik, dengan blind spot yang sama.

Jawaban yang saya jelajahi : mengganti (atau lebih tepatnya menumpuk) penurunan gradien dengan algoritma genetika. Alih-alih melatih satu agen, kita mengembangkan populasi agen; masing-masing genom mengodekan arsitektur dan hyperparameter; dan kita biarkan seleksi alam memilah, sementara gradien terus memoles tiap individu di dalam hidupnya sendiri.

Runner ini melewati empat versi dalam satu sesi kerja intensif. Masing-masing memperbaiki cacat struktural versi sebelumnya.

## v1 : versi naif, dan kenapa tidak cukup

Versi pertama melakukan apa yang diharapkan dari GA dasar : populasi genom, fungsi fitness, seleksi, crossover, mutasi, generasi berikutnya. Setiap genom mengodekan topologi jaringan (jumlah lapisan, lebar), hyperparameter DQN (learning rate, epsilon decay, ukuran replay buffer), dan beberapa pilihan arsitektural (sumber data mana yang dikonsumsi, ukuran embedding).

Cacat utama : fitness dihitung pada data yang sama dengan pelatihan. Agen bisa secara harfiah menghafal jendela pasar dan mendapat skor bagus tanpa mempelajari strategi yang bisa digeneralisasi. Overfitting klasik, tapi diamplifikasi oleh seleksi genetika; GA secara aktif menyeleksi individu yang paling mengeksploitasi celah ini.

## v2 : memisahkan pelatihan dan evaluasi

Perbaikan yang jelas adalah memisahkan fase : setiap genom berlatih pada satu jendela pasar, lalu dievaluasi pada jendela berbeda, yang tidak pernah dilihat selama pelatihan. Hanya performa evaluasi yang dihitung untuk fitness.

Perubahan ini saja membuat fitness rata-rata populasi anjlok; tanda bahwa sebagian besar dari apa yang tampak sebagai performa di v1 adalah hafalan murni. Menyakitkan dilihat, tapi tepat sinyal yang kita inginkan : skor lebih rendah tapi jujur lebih baik daripada skor menggembung dan menipu.

## v3 : beralih ke NSGA-II dan fitness multi-objektif

Mengoptimalkan satu skor fitness (misalnya return) secara mekanis mendorong ke agen yang mengambil risiko ekstrem untuk memaksimalkan satu angka itu. Solusinya adalah beralih ke NSGA-II (Non-dominated Sorting Genetic Algorithm II), yang mengoptimalkan beberapa objektif sekaligus tanpa mereduksinya jadi jumlah berbobot yang sewenang-wenang : return, drawdown maksimal, rasio Sharpe, stabilitas antar-jendela.

NSGA-II membangun front Pareto : himpunan genom di mana tidak ada perbaikan pada satu objektif yang mungkin tanpa memperburuk yang lain. Alih-alih memaksakan satu kompromi antara return dan risiko lewat pembobotan yang dipilih di awal, kita menyimpan seluruh perbatasan kompromi dan membiarkan pilihan akhir tetap terbuka.

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
  // ... pembangunan front berikutnya lewat pelepasan iteratif
  return fronts;
}
```

Tambahan kedua di v3 : **arsip Pareto persisten**. Tanpanya, genom bagus yang ditemukan di generasi 12 bisa hilang di generasi 15 kalau kebetulan crossover tidak mereproduksinya; meski ia tetap lebih baik dari semua yang menggantikannya. Arsip menyimpan, lintas semua generasi, himpunan individu tak terdominasi yang pernah ditemui, terlepas dari populasi saat ini.

## v4 : evolusi lamarckian dan keanekaragaman lingkungan

V3 punya blind spot struktural : genom menggambarkan arsitektur, tapi bobot yang dipelajari selama pelatihan hilang di setiap generasi baru. Keturunan yang lahir dari crossover dua orang tua yang bagus mewarisi arsitektur mereka, tapi harus belajar ulang dari nol; tidak ada jejak bobot yang membuat orang tuanya performan.

V4 memperkenalkan **evolusi lamarckian** : bobot terlatih disuntikkan kembali ke genom setelah pelatihan, dan diwariskan (dengan mutasi) ke keturunan. Ini kesesatan biologis yang disadari; Lamarck salah untuk organisme hidup, hereditas sifat yang didapat tidak ada dalam biologi; tapi tidak ada yang melarang GA numerik curang dengan cerdas : di sini, mewariskan yang didapat mempercepat konvergensi secara radikal, karena setiap generasi berangkat dari titik inisialisasi yang sudah terinformasi alih-alih bobot acak.

Tiga perubahan struktural lain di versi ini :

*   **Keanekaragaman lingkungan** : setiap genom tidak lagi dievaluasi pada satu jendela pasar tapi pada beberapa, yang diambil dari rezim berbeda (bullish, bearish, range). Agen yang unggul pada satu jendela dan runtuh pada jendela lain tidak bisa lagi mendominasi front Pareto.

*   **Regularisasi lewat kompleksitas FLOPs** : biaya komputasi jaringan (dalam FLOPs) menjadi objektif tersendiri di NSGA-II. Ini mencegah evolusi konvergen ke arsitektur masif hanya karena kapasitas mentahnya lebih besar, tanpa dibenarkan oleh perolehan performa.

*   **Antarmuka** `RLBackend` **yang terpisah** : GA tidak lagi mengenal detail DQN. Ia memanipulasi genom dan memanggil `train()` / `evaluate()` lewat antarmuka abstrak, yang secara teori memungkinkan mencolokkan algoritma RL lain tanpa menyentuh mesin evolusioner.


```
interface RLBackend {
  train(genome: Genome, window: MarketWindow): Promise<TrainedWeights>;
  evaluate(genome: Genome, weights: TrainedWeights, window: MarketWindow): Promise<FitnessVector>;
}
```

Poin teknis terakhir : evaluasi beralih ke **konkurensi asinkron berbatas**; pool berisi N evaluasi paralel alih-alih loop sekuensial, dengan batas eksplisit supaya tidak menjenuhkan sumber daya GPU/CPU yang tersedia.

## Apa yang diperbaiki v4 dibanding v3 dalam praktik

Cacat v3 Perbaikan v4 Bobot hilang di setiap generasi Penyuntikan lamarckian pada bobot terlatih Overfitting pada satu jendela pasar Evaluasi pada banyak jendela, rezim bervariasi Arsitektur yang membesar tanpa batas FLOPs sebagai objektif Pareto eksplisit GA terkopling pada detail DQN Antarmuka `RLBackend` abstrak Evaluasi sekuensial yang lambat Konkurensi async berbatas

V4 juga memperbaiki sepuluh bug konkret "grounding" API; kasus di mana kode GA mengasumsikan antarmuka untuk `TradingAgent` yang tidak persis cocok dengan implementasi nyata. Bug semacam ini tak terlihat selama kode tidak dihadapkan pada kode sumber nyata agen : v4 baru tervalidasi setelah dibaca ulang baris per baris berhadapan dengan berkas aslinya.

## Kenapa mencampur evolusi dan gradien alih-alih memilih salah satu

Orang bisa bertanya kenapa tidak sekadar RL murni, atau evolusi murni ala NEAT. Jawabannya muat dalam satu kalimat : gradien unggul untuk memoles secara lokal (menyesuaikan bobot kontinu menuju optimum dekat), evolusi unggul untuk mengeksplorasi secara global (menemukan arsitektur dan kombinasi hyperparameter yang tidak bisa dicapai gradien mana pun, karena ruang pencarian diskret tidak terdiferensiasi). Memakai satu tanpa yang lain berarti kehilangan salah satu dari dua bentuk eksplorasi.

Harga yang dibayar adalah kompleksitas rekayasa; empat versi bukan kemewahan, itu jumlah iterasi yang diperlukan agar loop GA + RL berhenti menyabotase dirinya sendiri (overfitting, kehilangan individu bagus, kehilangan bobot yang didapat). Tapi hasilnya adalah sistem yang menjelajahi ruang desain jauh lebih luas daripada sekadar grid search hyperparameter, sambil menjaga efisiensi lokal gradien untuk setiap kandidat yang dievaluasi.

## Langkah berikutnya

Arsitektur evolusioner satu tingkat ini (populasi datar genom DQN) mencapai batasnya ketika jumlah aset yang dicakup naik. Inilah yang memotivasi peralihan ke arsitektur hierarkis tiga tingkat (Asset Analysts → Sector Managers → Portfolio Allocator), dengan GA yang beroperasi independen di tiap tingkat... tapi itu topik artikel lain.
