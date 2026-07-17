---
title: "Saya mengevolusi jaringan saraf melalui seleksi alam alih-alih gradient descent"
description: "Bagaimana saya mengganti pelatihan gradient descent klasik dengan algoritma genetik NSGA-II untuk mengevolusi agen trading DQN: empat versi, dari overfitting hingga evolusi bobot Lamarckian."
date: 2026-07-13
tags: ["ai", "nsga-ii", "dqn", "trading", "typescript"]
authors: ["docteur-turboss"]
lang: "id"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "Z6kUySMmhO9WnlzGcKanhJG1Z+7Q3IKFWJ/62mxRF9LhSzyBpZv3zZoaOmwd0hddgB3/fPZQJbPGmhafljlnUA=="
---

## Masalah gradient descent saja

Melatih agen DQN untuk trading algoritmik dengan gradient descent klasik memiliki masalah yang sederhana untuk dinyatakan dan sulit untuk dipecahkan: gradient descent mengoptimalkan _satu_ jaringan menuju _satu_ minimum lokal, pada _satu_ jendela pasar. Tidak ada yang menjamin minimum ini dapat digeneralisasi ke rezim pasar yang berbeda, dan tidak ada dalam loop pelatihan yang mendorong keberagaman; dua kali eksekusi dari seed yang berbeda sering kali konvergen ke strategi yang hampir identik, dengan titik buta yang sama.

Jawaban yang saya eksplorasi: mengganti (atau lebih tepatnya melapisi) gradient descent dengan algoritma genetik. Alih-alih melatih satu agen, Anda mengevolusi populasi agen; setiap genom mengkodekan arsitektur dan hiperparameter; dan seleksi alam melakukan pengurutan, sementara gradient descent terus menyempurnakan setiap individu dalam masa hidupnya sendiri.

Percobaan ini melalui empat versi dalam satu sesi intensif. Setiap versi memperbaiki cacat struktural dari versi sebelumnya.

## v1: versi naif, dan mengapa itu tidak cukup

Versi pertama melakukan apa yang Anda harapkan dari GA dasar: populasi genom, fungsi fitness, seleksi, crossover, mutasi, generasi berikutnya. Setiap genom mengkodekan topologi jaringan (jumlah lapisan, lebar), hiperparameter DQN (learning rate, epsilon decay, ukuran buffer replay), dan beberapa pilihan arsitektural (sumber data mana yang digunakan, ukuran embedding apa).

Cacat utamanya: fitness dihitung pada data yang sama yang digunakan untuk pelatihan. Seorang agen benar-benar bisa menghafal jendela pasar dan mendapatkan skor sangat baik tanpa mempelajari strategi yang dapat digeneralisasi. Overfitting klasik, tetapi diperkuat oleh seleksi genetik; GA secara aktif memilih individu yang paling mengeksploitasi celah ini.

## v2: memisahkan pelatihan dan evaluasi

Perbaikan yang jelas adalah memisahkan fase-fasenya: setiap genom berlatih pada satu jendela pasar, kemudian dievaluasi pada jendela yang berbeda, yang tidak pernah terlihat selama pelatihan. Hanya kinerja evaluasi yang diperhitungkan dalam fitness.

Perubahan ini saja menyebabkan rata-rata fitness populasi turun; sebuah tanda bahwa sebagian besar dari apa yang tampak seperti kinerja di v1 adalah hafalan murni. Menyakitkan untuk dilihat, tetapi itulah sinyal yang Anda inginkan: skor yang lebih rendah tetapi jujur lebih baik daripada skor yang meningkat dan menyesatkan.

## v3: beralih ke NSGA-II dan fitness multi-objektif

Mengoptimalkan satu skor fitness (misalnya, imbal hasil) secara mekanis mendorong agen untuk mengambil risiko ekstrem demi memaksimalkan satu angka tersebut. Solusinya adalah beralih ke NSGA-II (Non-dominated Sorting Genetic Algorithm II), yang secara simultan mengoptimalkan beberapa tujuan tanpa mereduksinya menjadi jumlah terbobot yang arbitrer: imbal hasil, drawdown maksimum, rasio Sharpe, stabilitas antar-jendela.

NSGA-II membangun front Pareto: kumpulan genom di mana tidak ada peningkatan pada satu tujuan yang mungkin tanpa menurunkan tujuan lain. Alih-alih memaksakan satu trade-off imbal hasil-risiko melalui pembobotan yang telah dipilih sebelumnya, Anda menyimpan seluruh perbatasan kompromi dan membiarkan pilihan akhir tetap terbuka.

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
  // ... konstruksi front berikutnya dengan penghapusan iteratif
  return fronts;
}
```

Penambahan kedua di v3: **arsip Pareto persisten**. Tanpanya, genom bagus yang ditemukan di generasi 12 bisa menghilang di generasi 15 jika keberuntungan crossover tidak mereproduksinya; bahkan jika genom itu tetap lebih baik dari semua yang menggantikannya. Arsip ini menyimpan, di semua generasi, kumpulan semua individu yang tidak terdominasi yang pernah ditemui, terlepas dari populasi saat ini.

## v4: evolusi Lamarckian dan keragaman lingkungan

V3 memiliki titik buta struktural: genom menggambarkan arsitektur, tetapi bobot yang dipelajari selama pelatihan menghilang di setiap generasi baru. Seorang anak yang lahir dari crossover dua orang tua yang baik mewarisi arsitektur mereka, tetapi harus belajar dari awal lagi; tidak ada jejak bobot yang membuat orang tuanya berkinerja baik.

V4 memperkenalkan **evolusi Lamarckian**: bobot yang telah dilatih dimasukkan kembali ke dalam genom setelah pelatihan, dan ditransmisikan (dengan mutasi) kepada keturunannya. Ini adalah bid'ah biologis yang disengaja; Lamarck salah untuk organisme hidup -- pewarisan karakteristik yang diperoleh tidak ada dalam biologi -- tetapi tidak ada yang menghentikan GA digital untuk curang secara cerdas: di sini, mentransmisikan pengetahuan yang diperoleh secara radikal mempercepat konvergensi, karena setiap generasi memulai kembali dari inisialisasi yang sudah diinformasikan daripada bobot acak.

Tiga perubahan struktural lain dalam versi ini:

*   **Keragaman lingkungan**: setiap genom tidak lagi dievaluasi pada satu jendela pasar tunggal tetapi pada beberapa jendela, yang diambil dari rezim yang berbeda (bullish, bearish, ranging). Seorang agen yang unggul di satu jendela dan runtuh di jendela lain tidak lagi dapat mendominasi front Pareto.
    
*   **Regularisasi kompleksitas FLOPs**: biaya komputasi jaringan (dalam FLOPs) menjadi tujuan penuh dalam NSGA-II. Ini mencegah evolusi konvergen ke arsitektur masif hanya karena memiliki kapasitas mentah yang lebih besar, tanpa peningkatan kinerja yang dapat dibenarkan.
    
*   **Antarmuka `RLBackend` yang terdekopling**: GA tidak lagi mengetahui detail DQN. Ia memanipulasi genom dan memanggil `train()` / `evaluate()` melalui antarmuka abstrak, yang secara teoretis memungkinkan menukar algoritma RL lain tanpa menyentuh mesin evolusioner.
    

```
interface RLBackend {
  train(genome: Genome, window: MarketWindow): Promise<TrainedWeights>;
  evaluate(genome: Genome, weights: TrainedWeights, window: MarketWindow): Promise<FitnessVector>;
}
```

Poin teknis terakhir: evaluasi beralih ke **konkurensi asinkron terbatas**; kumpulan N evaluasi paralel alih-alih loop sekuensial, dengan batas eksplisit untuk menghindari kejenuhan sumber daya GPU/CPU yang tersedia.

## Apa yang v4 perbaiki versus v3 dalam praktik

Cacat v3 | Perbaikan v4
--- | ---
Bobot hilang setiap generasi | Injeksi ulang Lamarckian dari bobot terlatih
Overfitting ke satu jendela pasar | Evaluasi pada beberapa jendela, rezim bervariasi
Arsitektur tumbuh tanpa kendali | FLOPs sebagai tujuan Pareto eksplisit
GA terikat ke detail DQN | Antarmuka abstrak `RLBackend`
Evaluasi sekuensial lambat | Konkurensi asinkron terbatas

V4 juga memperbaiki sepuluh bug "pembumian" API yang konkret; kasus di mana kode GA mengasumsikan antarmuka untuk `TradingAgent` yang tidak persis cocok dengan implementasi aslinya. Jenis bug ini tidak terlihat sampai Anda membandingkan kode dengan sumber agen yang sebenarnya: v4 hanya divalidasi setelah pembacaan ulang baris demi baris terhadap file asli.

## Mengapa mencampur evolusi dan gradien daripada memilih salah satu

Anda mungkin bertanya-tanya mengapa tidak menggunakan RL murni saja, atau evolusi murni seperti NEAT. Jawabannya adalah satu kalimat: gradien sangat baik untuk penyetelan lokal (menyesuaikan bobot kontinu menuju titik optimal terdekat), evolusi sangat baik untuk eksplorasi global (menemukan arsitektur dan kombinasi hiperparameter yang tidak dapat dicapai gradien, karena ruang pencarian diskrit tidak dapat didiferensiasikan). Menggunakan salah satu tanpa yang lain berarti menghilangkan salah satu dari dua bentuk eksplorasi.

Harganya adalah kompleksitas rekayasa; empat versi bukanlah kemewahan, itu adalah jumlah iterasi yang diperlukan agar loop GA + RL berhenti menyabotase dirinya sendiri (overfitting, kehilangan individu yang baik, kehilangan bobot yang diperoleh). Tetapi hasilnya adalah sistem yang mengeksplorasi ruang desain yang jauh lebih luas daripada pencarian kisi sederhana dari hiperparameter, sambil mempertahankan efisiensi lokal dari gradient descent untuk setiap kandidat yang dievaluasi.

## Langkah selanjutnya

Arsitektur evolusioner satu tingkat ini (populasi datar genom DQN) mencapai batasnya ketika jumlah aset yang akan dicakup bertambah. Itulah yang mendorong perpindahan ke arsitektur hierarkis tiga tingkat (Analis Aset → Manajer Sektor → Alokator Portofolio), dengan GA beroperasi secara independen di setiap tingkat... tapi itu adalah topik untuk artikel lain.
