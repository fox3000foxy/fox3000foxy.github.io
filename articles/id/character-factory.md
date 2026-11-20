---
title: "Membangun character-factory : avatar dengan genetika"
description: "Modul TypeScript di atas DiceBear : pembangkitan yang konsisten
  per negara/etnis, mesin genetika kecil untuk memproyeksikan anak, dan
  detail rekayasa yang membuatnya bisa dipakai dalam permainan kartu."
date: 2026-05-16
aiGenerated: true
tags:
  - typescript
  - npm
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "FCUKh9K+iD8De5FopH17HfqxRaoh8/unNHSzc8680sC/qwSejJaKt3oXM83fPzM+QFu2pFRN2S3eGPDj0Rep4A=="
---

# Membangun character-factory : avatar dengan sistem genetika

Saya butuh ribuan avatar yang kredibel dan berbeda untuk [Kurekuta](https://github.com/fox3000foxy/kurekuta/) -- proyek permainan kartu privat di mana setiap kartu berisi "DNA" karakter yang diubah mesin render menjadi potret. Membeli paket jadi pasti kelihatan. Membangkitkan avatar DiceBear dengan seed per karakter hasilnya ngawur : kartu beruniversum Jepang bisa jatuh pada pirang Skandinavia, dan dua "kakak-beradik" mirip orang asing.

Jadi saya menulis [character-factory](https://github.com/fox3000foxy/character-factory) -- modul TypeScript di atas koleksi Lorelei DiceBear yang membawa tiga fitur yang tidak diberikan DiceBear saja : **profil demografis yang konsisten**, **mesin genetika kecil**, dan **builder fasih** yang enak dipakai dari loop permainan.

## Apa yang ia lakukan

Snippet terkecil yang berguna :

```ts
import { CharacterFactory, Country, Mood } from "character-factory";

const svg = new CharacterFactory()
  .setCountry(Country.Japan)   // ethnicité pondérée → peau/cheveux/coupe/barbe cohérents
  .setMood(Mood.Happy)
  .buildSvg();
```

Rangkaian sederhana ini mengambil etnis yang dibobot menurut demografi Jepang, mengambil warna kulit dan warna rambut yang cocok, memilih potongan dari subgrup gender yang benar, lalu mengunci mata/alis/mulut ke mode "bahagia". Hasilnya keluar sebagai SVG atau, dengan `sharp` terpasang, sebagai PNG dalam ukuran berapa pun.

Satu karakter hanyalah objek `CharacterConfig` -- wajah, rambut, aksesori, presentasi. Builder mengubahnya secara internal, dan kamu bisa mengekspornya sebagai JSON, base64 atau berkas, lalu memuatnya ulang secara identik. Untuk Kurekuta ini krusial : kartu menyimpan config, bukan gambar yang dirender. Jadi seninya selalu bisa direproduksi dan ukuran kartu tetap mungil.

## Profil demografis yang konsisten, bukan piksel acak

Opsi DiceBear adalah pemilih seragam. Beri `["#ffdbb4", "#2c1b18"]` untuk warna kulit dan kamu dapat salah satunya dengan probabilitas sama -- OK untuk logo, tidak berguna untuk "kasih saya karakter dari Brasil."

`character-factory` membawa pipeline negara → etnis → sifat :

```ts
// Isi modulnya :
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
  hairColors: [/* surtout noir/brun foncé, pas de blond */],
  hairCuts:   { male: [...], female: [...] },
  beardProbability: 0.15,
};
```

Setiap lapisan adalah pengambilan berbobot. Bobotnya bukan tesis sosio -- ini heuristik yang mencegah "berasal dari Jepang" menghasilkan rambut merah dan "berasal dari Swedia" menghasilkan hitam pekat. Seluruh pipeline diringkas jadi satu panggilan : `setCountry(country)` atau `randomizeFromCountry(country, gender?)`.

## Mesin genetika kecil

Fungsi yang paling saya nikmati : `projectChild`. Dua factory bisa menghasilkan anak yang sifatnya diwarisi dengan dominansi biologis kira-kira :

```ts
const parentA = new CharacterFactory().setCountry(Country.Sweden);
const parentB = new CharacterFactory().setCountry(Country.Japan);
const kid     = parentA.projectChild(parentB.getConfig());
```

Di balik kapnya, ini model yang sengaja mungil. Setiap orang tua membawa genotipe 2 alel, satu diambil dari tiap sisi, digabung jadi dominan atau resesif :

```ts
function combine(a: Allele, b: Allele): "dominant" | "recessive" {
  return a === "D" || b === "D" ? "dominant" : "recessive";
}
```

Sifat yang punya sumbu dominansi nyata (kulit, mata, rambut) diselesaikan lewat daftar terurut eksplisit -- gelap mendominasi terang, mata cokelat/hitam mendominasi biru, hitam pekat mendominasi pirang :

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

`resolveByRank` menemukan indeks tiap orang tua, mengambil yang tertinggi pada kombinasi alel "dominan" dan yang terendah pada "resesif". Warna fantasi (pink pastel, lila) tidak ada dalam urutan -- mereka lempar koin 50/50, yang memang perilaku benar : mereka tidak biologis, jadi dominansi tidak bermakna.

Bintik-bintik memodelkan MC1R : 75% kalau kedua orang tua punya, 25% kalau satu saja yang membawa, 0% kalau tidak ada. Jenggot terkait SRY : dihapus kalau anaknya perempuan, kalau tidak diwarisi dari orang tua yang punya. Potongan rambut tidak ada biologisnya -- itu pilihan budaya, jadi anak mengambil dari pool gendernya sendiri, dengan mempertahankan tekstur kalau memungkinkan.

Tidak ada satu pun dari ini genetika layak publikasi. Ini lapisan rasa : anak-anak mirip campuran yang masuk akal dari orang tua mereka, bukan rata-rata dari dua orang asing.

## Bagian rekayasa yang kurang glamor tapi penting

Beberapa detail tak terlihat tapi layak masuk diff :

**`pick` yang lebih aman.** Yang asli mengembalikan `undefined` yang di cast jadi `T` pada array kosong. Dengan `strict` + `noUncheckedIndexedAccess` di TypeScript, itu kebohongan yang ditandatangani kompiler. Versi baru melempar `RangeError` -- tertangkap langsung di tempat panggilan alih-alih menghasilkan prop `undefined` tiga tingkat lebih bawah.

**`deepMerge` yang tidak merusak array.** Rekursi lama aktif begitu nilai sumber adalah objek, bahkan kalau targetnya `null` atau array. `merge({tags: ["a"]}, {tags: ["b"]})` menghasilkan `{tags: {0: "b"}}`. Versi baru hanya berekursi kalau kedua sisi objek polos.

**Render batch secara paralel.** `batchFactory` merender PNG dalam loop terserialisasi -- ekspor 1000 kartu memakan waktu lama. Sekarang ini pool worker dengan konkurensi yang bisa dikonfigurasi (4 secara bawaan), yang menjaga urutan hasil dengan menulis ke array yang sudah berukuran pas :

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

Pada ekspor 1000 karakter, ini mengubah jeda ngopi menjadi "loh sudah selesai?"

**Pesan error `sharp` yang mengatakan sesuatu.** `buildPng` mengimpor `sharp` secara malas karena itu dependensi opsional yang tidak ingin kamu paksakan ke pengguna SVG-only. Catch lama menelan error asli dan selalu bilang "sharp is required." Kalau kegagalan sebenarnya adalah konflik versi atau masalah binding native, kamu menghabiskan sepuluh menit menginstal ulang paket yang sudah terpasang. Versi baru tetap menyuruhmu menginstalnya, tapi menyertakan error yang mendasarinya.

## Selanjutnya

Modulnya ada di 1.1.1 di [repositori character-factory](https://github.com/fox3000foxy/character-factory). Mesin genetikanya tempat ideal untuk terus beriterasi -- belum ada rangkaian tes, jadi invarian konsistensi ("karakter Brasil keturunan Asia-timur tidak akan pernah bermata hitam pekat dengan rambut platinum") hanya dijamin oleh bobot. Menambahkan `bun test` atau `vitest` dan menulis tes konsistensi yang menjalankan sepuluh ribu `randomizeFromCountry` per negara, itu langkah berikutnya.

Kurekuta sendiri masih privat untuk sekarang, tapi setiap kartu yang suatu hari akan kamu lihat di dalamnya hanyalah blob `CharacterConfig` dan `buildPng()` untuk menjadi ada.
