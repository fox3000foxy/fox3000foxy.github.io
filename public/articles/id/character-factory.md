---
title: "Membangun character-factory: avatar dengan genetika"
description: "Modul TypeScript di atas DiceBear: generasi konsisten per
  negara/etnis, mesin genetika kecil untuk memproyeksikan anak, dan
  detail rekayasa yang membuatnya dapat digunakan dalam permainan kartu."
date: 2026-05-16
aiGenerated: true
tags:
  - typescript
  - npm
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "MEQCIATL90s9WJi45Wz7+9S0S21C1EDwggvAwfbPmKgXmm1hAiBRgvoG74e9AGpwfW8qVXu+yiiHL+/TbxgGxDHon3UKrQ=="
---

# Membangun character-factory: avatar dengan sistem genetika

Saya butuh ribuan avatar kredibel dan berbeda untuk [Kurekuta](https://github.com/fox3000foxy/kurekuta/) -- sebuah proyek permainan kartu privat di mana setiap kartu berisi "DNA" karakter yang diubah mesin render menjadi potret. Membeli paket jadi, itu ketahuan. Membuat avatar DiceBear dengan seed per karakter, hasilnya kacau: kartu berlatar Jepang bisa mendapat wanita pirang Skandinavia, dan dua "saudara" tampak seperti orang asing.

Maka saya menulis [character-factory](https://github.com/fox3000foxy/character-factory) -- modul TypeScript di atas koleksi Lorelei dari DiceBear yang memberikan tiga hal yang tidak bisa diberikan DiceBear sendiri: **profil demografis yang konsisten**, **mesin genetika kecil**, dan **builder yang mulus** enak digunakan dari dalam loop permainan.

## Apa yang dilakukannya

Snippet paling kecil yang berguna:

```ts
import { CharacterFactory, Country, Mood } from "character-factory";

const svg = new CharacterFactory()
  .setCountry(Country.Japan)   // etnis berbobot → kulit/rambut/potongan/jenggot konsisten
  .setMood(Mood.Happy)
  .buildSvg();
```

Rantai sederhana ini memilih etnis berdasarkan bobot demografi Jepang, memilih warna kulit dan rambut yang cocok, memilih potongan rambut dari subgrup gender yang tepat, lalu mengunci mata/alis/mulut dalam mode "senang". Hasilnya keluar sebagai SVG atau, dengan `sharp` terinstal, PNG dalam ukuran berapa pun.

Karakter hanyalah objek `CharacterConfig` -- wajah, rambut, aksesori, presentasi. Builder memodifikasinya secara internal, dan kamu bisa mengekspornya sebagai JSON, base64, atau file, lalu memuatnya kembali secara identik. Untuk Kurekuta ini krusial: kartu menyimpan konfigurasi, bukan gambar yang sudah dirender. Jadi seni selalu dapat direproduksi dan ukuran kartu tetap kecil.

## Profil demografis yang konsisten, bukan piksel acak

Opsi DiceBear adalah pemilih seragam. Berikan `["#ffdbb4", "#2c1b18"]` untuk warna kulit dan kamu akan mendapat salah satu dengan probabilitas sama -- OK untuk logo, tidak berguna untuk "beri saya karakter dari Brasil."

`character-factory` memiliki pipeline negara → etnis → ciri:

```ts
// Yang ada di dalam modul:
ethnicitiesByCountry[Country.Brazil] = [
  { ethnicity: Ethnicity.WestEuropean,  weight: 35 },
  { ethnicity: Ethnicity.BlackAfrican,  weight: 25 },
  { ethnicity: Ethnicity.Latino,        weight: 30 },
  // ...
];

ETHNICITY_PROFILES[Ethnicity.EastAsian] = {
  skinColors: [
    { color: SkinColor.Light,  weight: 35 },
    { color: SkinColor.Warm,   weight: 40 },
    { color: SkinColor.Medium, weight: 20 },
    // ...
  ],
  hairColors: [/* kebanyakan hitam/cokelat gelap, tanpa pirang */],
  hairCuts:   { male: [...], female: [...] },
  beardProbability: 0.15,
};
```

Setiap lapisan adalah pengambilan berbobot. Bobotnya bukan tesis sosiologi -- ini heuristik yang mencegah "dari Jepang" menghasilkan rambut merah dan "dari Swedia" menghasilkan rambut hitam pekat. Seluruh pipeline cukup dengan satu panggilan: `setCountry(country)` atau `randomizeFromCountry(country, gender?)`.

## Mesin genetika kecil

Fungsi yang paling menyenangkan untuk dikerjakan: `projectChild`. Dua factory dapat menghasilkan anak yang ciri-cirinya diwariskan dengan dominasi biologis perkiraan:

```ts
const parentA = new CharacterFactory().setCountry(Country.Sweden);
const parentB = new CharacterFactory().setCountry(Country.Japan);
const kid     = parentA.projectChild(parentB.getConfig());
```

Di balik layar, ini model yang sengaja dibuat sangat kecil. Setiap orang tua membawa genotipe 2 alel, satu dari masing-masing sisi, digabung menjadi dominan atau resesif:

```ts
function combine(a: Allele, b: Allele): "dominant" | "recessive" {
  return a === "D" || b === "D" ? "dominant" : "recessive";
}
```

Ciri-ciri yang memiliki sumbu dominasi nyata (kulit, mata, rambut) diselesaikan dengan daftar urut eksplisit -- gelap mendominasi terang, mata cokelat/hitam mendominasi biru, hitam pekat mendominasi pirang:

```ts
const HAIR_DOMINANCE_ORDER = [
  HairColor.LightBlonde,   // paling resesif
  HairColor.GoldenBlonde,
  HairColor.HoneyBlonde,
  HairColor.Auburn,
  HairColor.Red,
  HairColor.Copper,
  HairColor.LightBrown,
  HairColor.Brown,
  HairColor.DarkBrown,
  HairColor.SoftBlack,
  HairColor.JetBlack,      // paling dominan
] as const;
```

`resolveByRank` mencari indeks masing-masing orang tua, mengambil yang tertinggi pada kombinasi alel "dominan" dan yang terendah pada "resesif". Warna fantasi (merah muda pastel, ungu) tidak ada dalam urutan -- mereka memakai lempar koin 50/50, yang merupakan perilaku tepat: mereka tidak biologis, jadi dominasi tidak bermakna.

Bintik-bintik memodelkan MC1R: 75% jika kedua orang tua memilikinya, 25% jika hanya satu yang membawanya, 0% jika tidak ada. Jenggot terikat pada SRY: dihilangkan jika anak perempuan, sebaliknya diwarisi dari orang tua yang memilikinya. Potongan rambut tidak ada biologisnya -- itu pilihan kultural, jadi anak memilih dari kumpulan gender sendiri, mempertahankan tekstur jika memungkinkan.

Tidak ada satupun dari ini yang genetika layak publikasi. Ini adalah lapisan rasa: anak-anak terlihat seperti campuran masuk akal dari orang tua mereka, bukan rata-rata dua orang asing.

## Bagian rekayasa yang kurang glamor tetapi berarti

Beberapa hal yang tidak mencolok tetapi layak tempat di diff:

**`pick` yang lebih aman.** Yang asli mengembalikan `undefined` yang di-*cast* ke `T` pada array kosong. Dengan `strict` + `noUncheckedIndexedAccess` di TypeScript, itu kebohongan yang ditandatangani kompilator. Versi baru melempar `RangeError` -- ditangkap segera di situs panggilan alih-alih menghasilkan props `undefined` tiga level di bawah.

**`deepMerge` yang tidak merusak array.** Rekursi lama aktif begitu nilai sumber adalah objek, bahkan jika target adalah `null` atau array. `merge({tags: ["a"]}, {tags: ["b"]})` menghasilkan `{tags: {0: "b"}}`. Versi baru hanya merekurei ketika kedua sisi adalah objek biasa.

**Render batch secara paralel.** `batchFactory` merender PNG dalam loop serial -- ekspor 1000 kartu memakan waktu lama. Sekarang ini adalah pool pekerja dengan konkurensi yang dapat dikonfigurasi (4 secara default), yang mempertahankan urutan hasil dengan menulis ke array yang sudah dialokasikan:

```ts
const worker = async () => {
  while (true) {
    const i = nextIndex++;
    if (i >= count) return;
    // render and save
    results[i] = { index: i + 1, filePath, config: clone.getConfig() };
    done++;
    onProgress?.(done, count);
  }
};
await Promise.all(Array.from({ length: concurrency }, () => worker()));
```

Pada ekspor 1000 karakter, ini mengubah waktu istirahat kopi menjadi "sudah selesai?"

**Pesan error `sharp` yang berarti.** `buildPng` mengimpor `sharp` secara lazy karena itu dependensi opsional yang tidak ingin kamu paksakan ke pengguna SVG-only. Catch lama menelan error asli dan selalu mengatakan "sharp is required." Jika kegagalan nyata adalah konflik versi atau masalah bindings asli, kamu menghabiskan sepuluh menit menginstal ulang sesuatu yang sudah terinstal. Versi baru tetap mengatakan untuk menginstalnya, tetapi menyertakan error yang mendasarinya.

## Selanjutnya

Modul ini di versi 1.1.1 di [repositori character-factory](https://github.com/fox3000foxy/character-factory). Mesin genetika adalah tempat ideal untuk terus melakukan iterasi -- belum ada rangkaian pengujian, jadi invarian konsistensi ("karakter Brasil keturunan Asia Timur tidak akan pernah memiliki mata hitam pekat dengan rambut platinum") hanya dijamin oleh bobot. Menambahkan `bun test` atau `vitest` dan menulis tes konsistensi yang menjalankan sepuluh ribu `randomizeFromCountry` per negara, itu langkah selanjutnya.

Kurekuta sendiri masih privat untuk saat ini, tetapi setiap kartu yang suatu hari akan kamu lihat di dalamnya hanyalah sebuah blob `CharacterConfig` dan `buildPng()` untuk eksis.
