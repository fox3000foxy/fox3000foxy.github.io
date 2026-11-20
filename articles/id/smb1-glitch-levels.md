---
title: "Super Mario Bros. : format level, pointer, dan 256 glitch world"
description: "Bagaimana 128 level × 4 tipe zona muat dalam 40KB ROM, kenapa Minus World ada, dan bagaimana match Tenis NES bisa memuat glitch world."
date: 2026-06-10
tags:
  - retro
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "gli7m5a8zq6pdRL3agPGGY5pmfR1fqHpvgSz2BSphxm5+YSyrgBgRR76Bn3fyvEoa3PR5XKw/aYbO3t2GkgThw=="
---

## Pendahuluan

Super Mario Bros. itu 40 kilobyte ROM. Delapan dunia, 32 level, musuh, musik, power-up, semuanya muat di sana.

Tapi kalau kamu membuka emulator dan mengutak-atik byte yang benar, kamu bisa memuat level 36-1. Atau 255-1. Atau mendarat di dunia di mana semuanya terbuat dari sprite Bowser dan pipa yang tidak menuju ke mana-mana.

Glitch world ini ada karena alasan sederhana : sistem penyimpanan level SMB1 adalah keajaiban optimasi 8-bit, dan ketika kita memaksa permainan membaca di tempat yang tidak seharusnya, hasilnya menarik.

Retro Game Mechanics Explained membuat seri 4 video soal ini -- kita akan mengompilasinya menjadi satu penyelaman ke kode 6502 permainan terlaris di zamannya.

![GLITCH OBJECTS -- judul seri RGMechEx tentang mekanik tersembunyi SMB1](/images/smb1-glitch-levels/title-card.jpg)

![World 9-1 -- layar judul glitch world pertama yang bisa diakses lewat cart swap Tennis](/images/smb1-glitch-levels/v1-title-9-1.jpg)

## Warm start : kenapa RAM Tenis bertahan di SMB1

Sebelum bicara penyimpanan level, harus paham cara SMB1 menyala. Karena glitch cart swap NES Tennis sepenuhnya bersandar pada **sistem deteksi warm start / cold start** permainan.

### 41 byte yang dipertahankan

Ketika SMB1 mendeteksi **cold start** (pertama dinyalakan atau power off/on), ia menghapus seluruh RAM. Tapi ketika mendeteksi **warm start** (tombol reset, tanpa pemutusan daya), ia mempertahankan zona memori **41 byte** :

```asm
; 41 byte yang dipertahankan di RAM saat warm start
; Alamat $075F-$0787
;
; $075F : byte startup (world - 1)    [1 byte]
; $0760 : flag pemilihan dunia (tombol B) [1 byte]
; $0761-$0762 : tak dipakai                    [2 byte]
; $0763-$0768 : timer (6 digit, 3 ditampilkan) [6 byte]
; $0769-$076E : koin Luigi                   [6 byte]
; $076F-$0774 : koin Mario                   [6 byte]
; $0775-$077A : skor Luigi                   [6 byte]
; $077B-$0780 : skor Mario                   [6 byte]
; $0781-$0786 : skor tertinggi (6 digit, 1 tersembunyi) [6 byte]
; $0787 : byte ajaib $A5                 [1 byte]
```

41 byte ini berfungsi untuk satu fitur : memungkinkan pemain **melanjutkan di dunia yang sama setelah game over**. Kalau kamu mati di 6-3, permainan menulis dunia 6 ke byte startup, dan di title screen, kalau kamu menahan A + Start, kamu mulai ulang di 6-1.

![41 byte yang dipertahankan di RAM saat warm start -- TOP SCORE, MARIO SCORE, TIMER, WORLD SELECT, CONTINUE WORLD, dan byte ajaib $A5](/images/smb1-glitch-levels/v1-memory-state.jpg)

### Verifikasi ganda warm start

![Cold start vs warm start -- diagram deteksi reset](/images/smb1-glitch-levels/v1-warm-start.jpg)

Ketika SMB1 boot, ia tidak memeriksa satu kriteria tapi **dua** :

```asm
CheckWarmStart:
  ; 1. Memeriksa byte ajaib $A5 di $0787
  lda $0787
  cmp #$A5
  bne ColdStart        ; bukan $A5 → cold start

  ; 2. Memeriksa 6 digit skor tertinggi ($0781-$0786)
  ;    Setiap digit harus antara 0 dan 9
  ldx #0
CheckLoop:
  lda $0781,x
  cmp #$0A
  bcs ColdStart        ; digit >= 10 → cold start
  inx
  cpx #6
  bne CheckLoop

  ; Kalau kedua kondisi lolos → warm start
  ; RAM tidak dihapus, dunia awal dipertahankan
  jmp WarmStartBoot
```

![Verifikasi byte $A5 dan digit skor tertinggi -- jantung warm start](/images/smb1-glitch-levels/v1-a5-byte.jpg)

Kenapa verifikasi ganda? Karena byte $A5 bisa hadir secara kebetulan (permainan lain yang meninggalkan nilai ini, atau keadaan istirahat bawaan chip RAM). Dengan memeriksa bahwa digit skor tertinggi valid (0-9), kita memastikan datanya koheren.

### Kenapa Tenis satu-satunya permainan yang berhasil

Ketika kita memasukkan SMB1 pertama kali (cold start), permainan :
1. Menghapus seluruh RAM → skor tertinggi = 0, byte world = 0
2. Menulis $A5 ke alamat $0787

Lalu, kita menukar ke Tennis tanpa mematikan konsol. Tennis :
- **Tidak membersihkan RAM saat startup** (sedikit permainan NES yang melakukannya)
- **Tidak menulis ke byte skor tertinggi** → mereka tetap 0 (valid)
- **Tidak menyentuh byte $A5** → ia tetap ada
- **Memakai alamat $075F** untuk penghitung langkah pemain

```asm
; Footstep increment di Tennis :
; Di setiap langkah pemain di lapangan, Tennis menaikkan byte di $075F.
; Byte yang sama dipakai SMB1 sebagai "nomor world - 1".
;
; 0 langkah  → world 0 → SMB1 = world 1
; 1-7 langkah → world 1-7 → dunia normal
; 8+ langkah → world 8+ → glitch world !
;
; Penghitung hanya naik ketika musik berhenti
; (suara footstep tidak berbunyi selama musik).
```

Ketika kita memasang SMB1 lagi :
1. Byte $A5 masih ada (Tennis tidak menyentuhnya)
2. Digit skor tertinggi masih 0 (valid)
3. Byte world sekarang bernilai 8+ (dinaikkan oleh langkah Tennis)
4. SMB1 mendeteksi warm start → mempertahankan byte world yang rusak
5. Menahan A + Start → world 9-1, world A-1, world 36-1, dll.

### Kenapa harus memboot Mario sebelum Tenis

Satu kehalusan : harus dulu memboot SMB1, lalu Tennis, lalu SMB1 lagi. Kalau kamu mulai langsung dengan Tennis, byte $A5 tidak pernah ditulis (Tennis tidak menulis $A5), jadi deteksi warm start gagal dan RAM dihapus.

![Penghitung langkah Tenis : setiap footstep menaikkan world byte](/images/smb1-glitch-levels/v1-footstep.jpg)

![Mengakses Glitch World lewat NES Tennis -- video yang menjelaskan cart swap](/images/smb1-glitch-levels/yt-tennis.jpg)

## Cara SMB1 menyimpan levelnya dalam 40KB

Nintendo R&D4 harus memecahkan masalah yang tampak sederhana : merepresentasikan level yang scroll horizontal dengan tile, musuh, item, semuanya dalam anggaran ROM yang sangat ketat.

Solusinya adalah pemisahan menjadi dua lapisan data yang **sepenuhnya independen** :

### Tile layout (peta level)

Setiap level didefinisikan oleh pointer ke struktur tile terkompresi di ROM. Kompresinya rudimenter tapi jenius : byte "kontrol" diikuti 1-3 byte data.

Format tile memakai sistem **run** (mirip RLE) :

```asm
; Format tile SMB1 (disederhanakan)
; Setiap "perintah" adalah byte kontrol :
;
; $00-$7F : menaruh satu tile, maju 1 kolom
; $80-$BF : menaruh tile berulang N kali (N = byte - $80 + 1)
; $C0-$FF : perintah khusus (akhir baris, lompatan, ganti palet)

; Contoh : untuk menggambar 3 bata berurutan :
;   $82 $01    ; mengulangi tile $01 (brick) 3 kali
```

Setiap level berisi 13 baris 16 kolom tile (13×16 = 208 tile terlihat). Tapi format terkompresi memungkinkan turun jauh lebih rendah -- misalnya, langit dan kolom kosong nyaris tidak memakan tempat.

Loop render dalam 6502 :

```asm
; Dekompresi tile - loop utama
; Masukan : pointer tile_data di $XX
; Keluaran : tilemap level di RAM PPU

DecompressTile:
  lda (tile_ptr),y      ; membaca byte kontrol
  iny
  cmp #$80
  bcc SingleTile        ; $00-$7F : tile tunggal
  cmp #$C0
  bcc RunLength         ; $80-$BF : run-length
  jmp SpecialCommand    ; $C0-$FF : perintah khusus

SingleTile:
  sta PPU_DATA          ; menulis tile langsung
  jmp Next

RunLength:
  sec
  sbc #$7E              ; N = control - $7E
  tax
  lda (tile_ptr),y      ; membaca tile yang diulang
  iny
: sta PPU_DATA
  dex
  bne :-
  jmp Next
```

### Sprite layout (musuh dan objek)

Paralel dengan itu, musuh dan objek (blok ?, pipa, goomba, koopa) disimpan dalam struktur yang sama sekali terpisah. Setiap spawn didefinisikan oleh 2 byte :

```asm
; Format sprite SMB1
; Byte 0 : posisi X (dalam kolom)
; Byte 1 : tipe sprite + bit halaman Y
; Y diturunkan dari indeks dalam urutan

; Urutan sprite :
;   $01 $4B    ; goomba di kolom 1
;   $09 $4B    ; goomba di kolom 9
;   $10 $61    ; blok ? di kolom 16 (berisi koin)
;   $15 $54    ; koopa hijau di kolom 21
;   $FF        ; akhir urutan
```

Setiap level bisa mereferensikan hingga 5 halaman sprite berbeda (tepatnya, 5 "layar" 16 kolom), tapi dalam praktik sebagian besar level hanya memakai 2-3.

### Tabel pointer

Kejeniusan desainnya adalah tabel pointer. Setiap level disimpan sebagai **pasangan** alamat ROM :

```c
// Struktur internal (disederhanakan) World Map
struct LevelPointer {
    uint16_t tile_ptr;   // Alamat ROM data tile
    uint16_t sprite_ptr; // Alamat ROM data sprite
};

// 4 tabel terpisah, satu per AreaType :
// 0 = Water, 1 = Overworld, 2 = Underground, 3 = Castle
LevelPointer level_table[4][128];
```

128 entri per tabel. 4 tipe zona. **512 kombinasi yang mungkin**, tapi hanya sebagian kecil yang dipakai permainan resmi. Sisanya adalah RAM yang tidak diinisialisasi atau data yang diinterpretasikan sebagai pointer.

Ketika permainan memuat level, ia melakukan ini :

```asm
; Pemuatan level
; A = AreaType (0-3), X = LevelID (0-127)

LoadLevel:
  sta AREA_TYPE
  asl                  ; *2 untuk offset dalam tabel 16-bit
  tax
  lda LevelTable_TilePtr, x
  sta TILE_PTR
  lda LevelTable_TilePtr+1, x
  sta TILE_PTR+1       ; pointer ke tile
  lda LevelTable_SpritePtr, x
  sta SPRITE_PTR
  lda LevelTable_SpritePtr+1, x
  sta SPRITE_PTR+1     ; pointer ke sprite
  jsr DecompressTiles
```

Permainan memberikan kepercayaan total pada pointer : ia membaca alamat di tabel dan mendekompresi apa yang ada di alamat itu, titik.

![Level ID $06 (Water) -- 9-1, versi bawah air 6-2](/images/smb1-glitch-levels/lvl-06-9-1.png)

![Tabel Level ID : 128 entri mungkin, 34 ditetapkan](/images/smb1-glitch-levels/v2-level-id-table.jpg)

![Urutan berbeda pointer tile dan sprite -- penyebab level Frankenstein](/images/smb1-glitch-levels/v2-pointer-tables.jpg)

### 34 level unik dan sistem ID 7-bit

![Chip RAM NES (MB8416A) -- dialah yang menyimpan data ketika kartrid ditukar](/images/smb1-glitch-levels/v1-ram-chip.jpg)

SMB1 tidak punya 32 level, melainkan **34 level unik**. Banyak level adalah duplikat (5-3 = 1-3 tapi dengan Bullet Bill) yang ditandai bendera "hard mode". Level unik yang sebenarnya :

- **Air** (Tipe 0) : 3 level (2-2, 7-2, zona bonus 5-2/6-2)
- **Overworld** (Tipe 1) : 22 level (termasuk 2 ruang awan bonus)
- **Underground** (Tipe 2) : 3 level (termasuk ruang bonus bawah tanah)
- **Castle** (Tipe 3) : 6 level
- \+ 1 ruang cutscene (sebelum level bawah tanah/air)
- \+ 1 warp zone 4-2

Setiap level punya ID **7 bit**. 5 bit bobot rendah = nomor dalam subgrup, 2 bit bobot tinggi = tipe zona :

```asm
; Enkode 7-bit Level ID
; Bit 6-5 : Tipe (00=Water, 01=Overworld, 10=Underground, 11=Castle)
; Bit 4-0 : Nomor dalam subgrup
;
; Water IDs      : $00-$02  (tipe 00, nomor 0-2)
; Overworld IDs  : $20-$35  (tipe 01, nomor 0-21)
; Underground IDs: $40-$42  (tipe 10, nomor 0-2)
; Castle IDs     : $60-$65  (tipe 11, nomor 0-5)
;
; ID $25 = %0100101 → tipe 01 (Overworld), nomor 5 → 1-1
; ID $23 = %0100011 → tipe 01 (Overworld), nomor 3 → 6-2
```

**128 ID yang mungkin** ($00-$7F), hanya 34 yang ditetapkan ke level sungguhan. ID tak terpakai menunjuk ke apa saja.

### Tabel pointer : dua daftar, dua urutan

Pointer tile dan sprite tidak disimpan dalam urutan yang sama. Kode memakai dua daftar 16-bit terpisah (high byte / low byte dalam dua tabel berbeda) :

```
Urutan pointer sprite :
  Indeks 0-5   : Castle (6 level)
  Indeks 6-27  : Overworld (22 level)
  Indeks 28-30 : Underground (3 level)
  Indeks 31-33 : Water (3 level)

Urutan pointer tile :
  Indeks 0-2   : Water (3 level)
  Indeks 3-24  : Overworld (22 level)
  Indeks 25-27 : Underground (3 level)
  Indeks 28-33 : Castle (6 level)
```

Kenapa urutannya berbeda? Tidak ada alasan teknis -- mungkin begitulah data disusun selama pengembangan. Tapi itu menciptakan akibat menarik : ketika ID level tidak valid, pointer tile dan sprite memuat level yang *berbeda*, menciptakan **level Frankenstein**.

Untuk bernavigasi antara dua daftar ini, permainan memakai **tabel offset** kecil (seperti daftar isi) :

```asm
; Tabel offset per tipe (Water, Overworld, Underground, Castle)
; Setiap entri = indeks awal dalam daftar yang cocok

SpriteOffsetTable:
  .byte $1F, $06, $1C, $00    ; Water=31, Overworld=6, Underground=28, Castle=0

TileOffsetTable:
  .byte $00, $03, $19, $1C    ; Water=0, Overworld=3, Underground=25, Castle=28
```

Untuk memuat level 6-2 (ID $23, Overworld nomor 3) :

```asm
; 1. Tipe = 01 (Overworld) → indeks dalam tabel offset = 1
; 2. Sprite offset = SpriteOffsetTable[1] = 6
;    Indeks akhir = 6 + 3 (nomor level) = 9 → pointer sprite ke-10
; 3. Tile offset = TileOffsetTable[1] = 3
;    Indeks akhir = 3 + 3 = 6 → pointer tile ke-7
; 4. Hasil : pointer tile $A619 + pointer sprite $9ED0 = 6-2 ✓
```

Sekarang, apa yang terjadi dengan ID tidak valid seperti $43 (Underground nomor 3, yang tidak ada) ?

```asm
; ID $43, Tipe = 10 (Underground), nomor = 3
; Sprite offset = SpriteOffsetTable[2] = $1C = 28
;   Indeks = 28 + 3 = 31 → pointer sprite ke-32 = air bonus 5-2 !
; Tile offset = TileOffsetTable[2] = $19 = 25
;   Indeks = 25 + 3 = 28 → pointer tile ke-29 = 1-4 (Castle) !
;
; Hasil : level bawah tanah dengan tile 1-4
; dan Blooper zona air 5-2. Frankenstein sungguhan.
```

![Level ID $43 -- level Frankenstein : tile 1-4 + sprite air 5-2](/images/smb1-glitch-levels/lvl-43-frankenstein.png)

![Menjelajahi Pointer Level Glitch -- tabel offset dijelaskan](/images/smb1-glitch-levels/yt-pointers.jpg)

![Tabel indeks world -- ketika overflow world 9 menciptakan glitch level](/images/smb1-glitch-levels/v2-world-index-table.jpg)

### Tabel indeks world : kenapa world 9 overflow

Ada tabel ROM 8 byte yang memberi indeks level pertama tiap dunia (1-8). Dan tepat sesudahnya, tabel 36 Level ID dari semua level dalam urutan permainan.

```asm
; WorldIndexTable (8 byte)
  .byte 0, 5, 10, 15, 20, 25, 28, 33
;   -> Dunia 1 dimulai di level 0
;   -> Dunia 2 dimulai di level 5
;   -> Dunia 8 dimulai di level 33

; LevelIDTable (36 byte)
  .byte $25, $28, $29, $26, $24, ... ; ke-36 Level ID
```

Ketika kita mencoba memuat world 9, permainan membaca byte ke-9 WorldIndexTable... yang tidak ada. Ia overflow 1 byte ke LevelIDTable, membaca nilai $25, lalu memakai $25 sebagai indeks ke LevelIDTable (entri ke-37) -- yang overflow lagi 2 byte ke SpriteOffsetTable, dan membaca nilai 6.

```asm
; World 9 :
;   1. WorldIndexTable[8] (overflow) → membaca $25 di LevelIDTable
;   2. LevelIDTable[37] (overflow) → membaca byte ke-2 SpriteOffsetTable = 6
;   3. ID = 6 → Water level nomor 6 (yang tidak ada)
;   4. Tile pointer = pointer water nomor 6 = tile 6-2
;   5. Sprite pointer = indeks 31+6 = 37 > 33 → pointer tidak valid
;   6. Hasil : 6-2 di bawah air dengan sprite glitch
;      → world 9-1 !
```

Untuk world G (16), overflow melaju lebih jauh dan jatuh pada Level ID $01, yaitu level cutscene yang mendahului 1-2 :

```asm
; World G (16) :
;   WorldIndexTable[15] → membaca $01 di LevelIDTable
;   LevelIDTable[1] = $29 (cutscene 1-2)
;   → world G-1 = cutscene masuk 1-2
```

## Kenapa glitch world ada

Permainan punya 32 level "sah" (8 dunia × 4 level). Tapi tabel pointer berukuran 128 entri per tipe zona. Entri setelah level 32 berisi apa yang ada di ROM pada alamat itu -- kadang level lain, kadang data suara, kadang RAM, kadang apa saja.

![Level ID $01 Water (Minus World) -- tile pointer $AE45, sprite pointer $A171](/images/smb1-glitch-levels/minus-world.png)

### Level ID $01 + AreaType 0 = Minus World

Glitch world paling terkenal. Level ID $01 dalam AreaType 0 (air) menunjuk ke :

- **Tile pointer : $AE45** → zona bawah air 2-2/7-2
- **Sprite pointer : $A171** → sprite 2-2/7-2

Hasilnya : level air yang menyerupai 2-2, tapi berputar tanpa batas karena flagpole tidak ada. Level berputar selamanya.

Ini level 36-1 (atau 36-1 di dunia $-1).

![Pemeriksaan warm start SMB1 -- dialah yang memungkinkan Minus World ada](/images/smb1-glitch-levels/v4-minus-world.jpg)

```asm
; Kenapa flagpole hilang di Minus World :
; Sprite 2-2/7-2 ($A171) tidak punya flagpole
; dalam urutannya. Permainan mencari sprite $FD (flagpole)
; tapi tidak pernah menemukannya → putaran tak berujung
;
; Permainan terus membangkitkan level sampai tak terbatas
; hingga timer mencapai nol.
```

### Pointer yang menunjuk ke RAM

Ketika tile pointer atau sprite pointer menunjuk ke alamat di RAM ($00-$7F) alih-alih ROM, permainan mencoba menginterpretasikan perubahan konstan RAM sebagai tile :

```asm
; Contoh : Level ID $03 di Water
; Tile Pointer : $A46B (3-3 - valid)
; Sprite Pointer : $009D (menunjuk ke RAM page nol!)
;
; RAM page nol berisi register permainan,
; posisi Mario, keadaan penghitung...
; Permainan mendekompresi itu sebagai urutan sprite,
; dan hasilnya adalah level dengan musuh
; yang sebenarnya adalah nilai register.
```

Ketika page nol berubah (karena Mario bergerak, timer berjalan, dll.), "sprite" level ikut berubah. Makanya beberapa glitch world punya musuh yang berkedip dan terus berubah.

![Level ID $03 Water -- sprite pointer $009D menunjuk ke RAM, level tak bisa dimainkan](/images/smb1-glitch-levels/level-03-water.png)

### Level ID $36 : level kosong (Overworld)

Level ID $36 di Overworld :

- **Tile pointer : $AC35** (1-2)
- **Sprite pointer : $A0D8** (1-2)

Hasil : tidak ada. Permainan memuat level tapi ditandai "tanpa level" dalam katalog RGMechEx. Tile mungkin valid tapi sprite menunjuk ke tempat yang menghasilkan level kosong atau tidak berfungsi.

### Level ID $1D (Castle) : juara crash

Level ID $1D di Castle :

- **Tile pointer : $A210** (4-4)
- **Sprite pointer : $7EA0** (RAM !)

Sprite pointer di RAM = sprite tak terdefinisi. Permainan mencoba menampilkan bola Spiny atau Bullet Bill blaster di baris pertama tile. Itu langsung crash.

```asm
; Ketika sprite pointer menunjuk ke RAM,
; permainan mendekompresi byte yang terus berubah
; sebagai instruksi "spawn". Hasilnya :
; - Kemunculan objek yang tidak ada (nilai tak terdefinisi)
; - Crash PPU ketika sprite NES mencoba menampilkan tile tidak valid
; - Freeze total konsol
```

## 256 glitch world yang dikatalogkan

RGMechEx menulis skrip yang membangkitkan peta **semua level**, untuk 4 tipe zona, dan 128 ID masing-masing.

Penghitung dunia 8 bit (0-255). Dunia 1-8 sah. Tersisa **248 glitch world** potensial. Setiap glitch world cocok dengan level pertama dunia itu, dan Level ID-nya dihitung lewat mekanisme overflow WorldIndexTable.

![Tabel glitch world -- 248 dunia rusak, 68 level pertama bisa diakses](/images/smb1-glitch-levels/v3-glitch-worlds-table.jpg)

Dari 128 ID yang mungkin, hanya **68 yang merupakan "first level" sebuah dunia** (bisa diakses lewat nomor glitch world). 60 lainnya adalah level 2+ atau tidak bisa diakses.

| Tipe | ID unik yang bisa dimainkan | ID yang crash | ID kosong |
|------|---------------------|-------------------|-----------|
| Water (0)    | ~20  | ~60  | ~48  |
| Overworld (1)| ~30  | ~55  | ~43  |
| Underground (2) | ~15 | ~65 | ~48  |
| Castle (3)   | ~25  | ~58  | ~45  |

Banyak ID berujung pada level yang sama karena pointer jatuh pada alamat ROM yang sama. Level ID $28 (Overworld) misalnya -- tile pointer $A7CD (2-1) -- muncul di **38 glitch world berbeda**, karena sprite pointer $9F51 menunjuk ke zona ROM yang dipakai sebagai padding/data suara yang dipakai ulang banyak ID.

![Peta level ID $28 (Overworld) -- tile 2-1 dengan sprite normal, 38 glitch world](/images/smb1-glitch-levels/level-28-overworld.png)

![Glitch Level Super Mario Bros. Dijelaskan -- video ke-3](/images/smb1-glitch-levels/yt-levels.jpg)

### 6 glitch level yang benar-benar unik

Di antara 19 ID glitch level yang bisa diakses, hanya **6 yang tidak langsung crash** saat dimuat :

| World | Level ID | Deskripsi |
|-------|----------|-------------|
| E-1 (224) | $50 | Satu blok ? di atas jurang. Mario langsung mati. |
| W | $57 | Mario spawn terkunci, tidak bisa bergerak. |
| 42 (133) | $50 | Terowongan awan yang menjebak Mario kalau ia pergi cukup jauh. |
| 62 (131, 240) | $4D | Kastil beku : Mario spawn di atas, tidak bisa jatuh → terkunci. |
| 127 | $4B | Terowongan bawah tanah, tapi crash kalau pergi terlalu jauh. |
| 137 | $4B | Mengaktifkan autoscroll cutscene. Mario bertemu satu blok bata yang memblokirnya selamanya. |

![Level ID $50 (terowongan awan) -- glitch world 42-1 dan E-1](/images/smb1-glitch-levels/lvl-50-cloud.png)
![Level ID $4D (castle) -- world 62-1, Mario terkunci di spawn](/images/smb1-glitch-levels/lvl-4D-castle.png)
![Level ID $4B (terowongan) -- world 127-1, crash kalau pergi terlalu jauh](/images/smb1-glitch-levels/lvl-4B-tunnel.png)

Enam glitch world dari 248 yang menghasilkan sesuatu yang benar-benar baru. Sisanya adalah level normal dengan tipe zona yang salah, atau layar hitam.

## Format level secara detail

Fokus pada format persis data level, untuk memahami kenapa glitch level bertahan (atau tidak).

### Header level : 2 byte, 6 properti

Setiap level dimulai dengan header 2 byte yang mengendalikan 6 properti :

```asm
; Byte 0 : timer + Y start + modifier
;   Bit 7-6 : timer (00=tak berubah, 01=200, 10=300, 11=400)
;   Bit 5-3 : Y start Mario (111/110 = autowalk)
;   Bit 2-0 : modifier tipe level
;              000=default, 001=gelombang, 010=dinding bata,
;              011=dasar air, 100=malam, 101=salju,
;              110=malam salju, 111=malam abu-abu

; Byte 1 : platform + latar + pola lantai
;   Bit 7-6 : platform khusus (00=pohon, 01=jamur,
;                                 10=Bullet Bill, 11=awan)
;   Bit 5-4 : latar (00=tidak ada, 01=awan,
;                           10=gunung, 11=pagar)
;   Bit 3-0 : pola lantai awal (0-15)
```

Modifier tipe mengendalikan variasi visual : gelombang di atas level air, latar bata 8-3, palet malam 4-3, salju 6-2, dll.

### Objek tile : 2 byte, Next Screen Flag, antrean 3 slot

Setelah header ada daftar **objek tile**, tiap objek 2 byte. Byte $FD menandai akhir daftar.

```asm
; Format objek tile (16 bit) :
; Byte 0 :
;   Bit 7-4 : posisi X (kolom 0-15)
;   Bit 3-0 : posisi Y
;     Y=0-11  : posisi Y normal
;     Y=12    : objek khusus (lubang, jembatan, tali, blok ?)
;     Y=13    : skip layar / objek khusus 2
;     Y=14    : perubahan modifier/scenery/lantai
;     Y=15    : objek khusus 3 (kastil, tangga, pipa besar)

; Byte 1 :
;   Bit  7   : BENDERA LAYAR BERIKUTNYA
;   Bit 6-4 : tipe objek (0-7)
;   Bit 3-0 : lebar/tinggi / subtipe
```

Ketika bit "layar berikutnya" disetel, kolom kerja saat ini dinaikkan 1. Itu memungkinkan menaruh objek setelah 16 kolom pertama. Objek harus didaftar **berurutan** (kiri ke kanan) karena permainan memuatnya sekuensial :

```asm
; Rutin pemuatan punya DUA fase per kolom :
; Fase 1 : mencari objek baru yang dimulai di kolom ini
;            dan menambahkannya ke antrean (queue)
; Fase 2 : memproses tiap objek dalam antrean dengan menggambar tile,
;            dan menghapus yang berakhir di kolom ini
```

Antreannya tepat **3 slot**. Akibat langsung : tidak bisa punya lebih dari 3 objek yang dimulai di kolom yang sama. Kalau antrean penuh, objek ke-4 diabaikan dan tidak akan pernah dimuat.

Makanya level yang dirancang baik menghindari menumpuk terlalu banyak objek. Contoh di 1-2 : kolom dengan blok 1up di langit-langit + bata di sebelahnya dipecah jadi dua objek berbeda untuk menghormati batas 3.

### Posisi Y khusus : 12, 13, 14, 15

Ketika Y=12, objek tidak punya posisi Y (ia di hardcode per tipe) :

```asm
; Y=12 : objek tanpa posisi Y
;   Tipe 0 : lubang (menghapus tanah)
;   Tipe 1 : tali platform bergerak
;   Tipe 2-4 : jembatan pada Y tetap
;   Tipe 5 : lubang dengan air/lava
;   Tipe 6-7 : barisan blok ?
```

Ketika Y=13, dua subgrup. Kalau bit 6 byte 1 bernilai 1 :

```asm
; Y=13, bit6=1 : objek khusus
;   0 = pipa L (cutscene), 1 = flagpole, 2-3 = jembatan/kapak/palu (akhir kastil)
;   4 = hentikan layar, 5 = musuh acak, 6 = loop level, 7+ = mungkin crash
```

Kalau bit6=0, 5 bit bobot rendah mengenkode **skip layar** (melompat langsung ke layar N, tanpa lewat bendera layar berikutnya satu per satu).

Ketika Y=14 : prinsip yang sama dengan bit6=1 untuk mengubah modifier tipe, bit6=0 untuk mengubah latar + pola lantai.

### Pola lantai : 16 motif tanah

Tanah level tidak terbuat dari objek individual. SMB1 memakai **pola lantai**, motif latar yang berlaku untuk semua kolom hingga perubahan berikutnya :

```asm
; Pola lantai (4 bit = 16 kemungkinan)
;   0 = kosong total
;   1 = tanah 2 tile tinggi
;   2 = tanah 1 tile tinggi
;   3 = tanah + bawah
;   4 = tanah + bawah 2
;   5 = tanah 1/2 tile
;   6 = 3/4 tanah
;   ... hingga 15 = terisi total (tanah + langit-langit)
```

Makanya lubang adalah objek : mereka meng override pola lantai pada kolom spesifik, tanpa harus mengubah pola untuk sisanya.

### Batas 256 byte dan pengulangan

Semua data tile level muat dalam **maksimum 256 byte**. Register Y 6502 dipakai sebagai indeks, dan ia 8 bit. Kalau permainan tiba di akhir data tanpa menemukan byte $FD, **ia berputar ke awal** dan mengulangi 256 byte sampai tak terbatas :

```asm
; Indeks Y = 8 bit → maks 256 byte data tile
; Kalau Y overflow (255 → 0) tanpa bertemu $FD → pengulangan
; Sama untuk sprite, tapi objek pipa (3 byte)
; menggeser paritas indeks di setiap pemuatan.
```

Beberapa glitch level mengeksploitasi pengulangan ini untuk membangkitkan level yang bertahan "tanpa batas".

### Sistem sprite : 2 byte + transisi pipa

Sprite mengikuti format mirip, tapi tanpa header dan dengan beberapa perbedaan kunci. Byte $FF menandai akhir daftar.

```asm
; Format sprite (2 byte) :
; Byte 0 : posisi X (kolom)
; Byte 1 :
;   Bit 7 : BENDERA LAYAR BERIKUTNYA
;   Bit 6-0 : tipe sprite
;       Beberapa tipe termasuk : goomba, koopa, Blooper,
;       Bullet Bill, Lakitu, Spiny, platform,
;       perintah warp zone, toad/putri,
;       perintah spawn grup musuh
```

Bit bobot rendah byte 1 adalah **bendera level sulit** : kalau disetel 1, sprite hanya muncul di level ≥ 5-3. Begitulah level "hard mode" dibuat.

Posisi Y 15 = **skip layar** (identik dengan tile). Posisi Y 14 = **transisi pipa** (3 byte) :

```asm
; Sprite Y=14 : transisi pipa/vine (3 byte !)
;   Byte 0 : posisi X
;   Byte 1 : bit 6-0 = Level ID 7-bit (tujuan)
;   Byte 2 : bit 4-0 = layar tujuan
;            bit 7-5 = dunia tempat transisi valid
;
; Kenapa dunia? Ruang bonus dipakai ulang antar dunia.
; Contoh : ruang bonus 1-1 juga dipakai 2-1 dan 7-1.
; Ruang ini punya 3 transisi, satu per dunia, supaya Mario
; muncul kembali di tempat yang benar.
```

Sprite **tidak punya sistem antrean**. Satu-satunya batas adalah tidak boleh ada lebih dari 4 sprite yang dimuat bersamaan di zona spawn (tepat di luar layar ke kanan). Selebihnya, sprite diabaikan.

## Cara mengakses glitch world

Ada dua metode utama.

### Metode klasik : wall clip

Wall clip (melewati tembok) memungkinkan keluar dari level normal dan berjalan hingga warzone tersembunyi. Dengan memanipulasi penghitung dunia lewat RAM, kita bisa memuat Level ID apa pun.

Tekniknya :
1. World 1-2 : masuk ke pipa akhir tersembunyi
2. Melakukan wall clip di dinding kanan
3. Berjalan di kekosongan hingga zona warp
4. Permainan menginterpretasikan nilai sebagai dunia

Tapi metode ini hanya memberi akses ke sebagian kecil glitch world.

### Metode ekstrem : cart swap NES Tennis

Lihat bagian "Warm start" di atas untuk detail lengkap. Singkatnya : penghitung langkah Tennis menulis ke byte RAM yang sama dengan dunia awal SMB1, dan deteksi warm start mempertahankan nilai itu.

### Sudut pengoprek : kode untuk menjelajahi semuanya

Kalau kamu ingin menjelajahi semua glitch sendiri di emulator, kamu bisa mem patch Level ID langsung :

```asm
; Patch untuk FCEUX / Mesen :
; Alamat RAM $075F = Level ID saat ini
; Alamat RAM $0760 = Tipe Area (0=Water, 1=Overworld, 2=Underground, 3=Castle)

; Contoh : memuat Level 57 (0x39) di Overworld
; Di emulator, buka pelacak memori dan tulis :
; $075F = 0x39
; $0760 = 0x01
; Lalu masuki pipa warp atau mati dan mulai ulang
; → Permainan memuat level ID $39 di Overworld
```

RGMechEx menerbitkan daftar lengkap 128 level × 4 tipe dengan peta yang dibangkitkan otomatis di [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html). Setiap entri menunjukkan tile pointer, sprite pointer, dan peta visual level.

## Level paling gila

### Level ID $1F (Water) : 15 glitch world dalam satu

Tile pointer $A302 (3-4) dikombinasikan dengan sprite pointer $02A0 memberikan 15 glitch world berbeda (D-1, J-1, Y-1, Z-1, 55-1, 73-1...). Penjelasan : sprite pointer menunjuk ke zona ROM yang berisi data yang cukup dekat dengan sprite valid untuk menghasilkan hasil yang bisa dimainkan, tapi kombinasi tile kastil 3-4 dengan sprite overworld menciptakan render absurd.

### Level ID $28 (Overworld) : 38 glitch world = rekor

Rekor mutlak. 38 entri glitch world menunjuk ke level yang sama (tile 2-1 + sprite $9F51). Kenapa? Karena sprite pointer $9F51 jatuh di zona ROM yang dipakai sebagai padding/data suara yang dipakai ulang banyak ID.

### Level ID $49 (Underground) : level FDS

Tile pointer $76AE + sprite pointer $1C9D. Tile pointer menunjuk ke zona ROM yang disediakan untuk versi Famicom Disk System. Hasilnya : level dengan tile yang tidak ada di kartrid standar. Inilah level yang memunculkan level 52-1 dan 196-1.

### Level ID $00-$02 : level bonus sungguhan

ID ini dipakai oleh sub-level sah permainan :

- **$00** : zona bawah air 5-2/6-2 (dipakai H-1, 39-1)
- **$01** : air 2-2/7-2 (Minus World, 36-1)
- **$02** : sub-level 8-4 (136-1, 151-1, 215-1)

Perbedaan antara level "bonus" yang bisa diakses normal dan glitch world adalah warp zone memeriksa dunia saat ini :

```asm
; Pemeriksaan warp zone (disederhanakan)
; Permainan memeriksa bahwa dunia target antara 1 dan 8
CheckWarp:
  lda TARGET_WORLD
  cmp #1
  bcc InvalidWarp       ; < 1 → ditolak
  cmp #9
  bcs InvalidWarp       ; > 8 → ditolak
  ; dunia valid hanya antara 1 dan 8
  jmp DoWarp
```

Glitch world dengan nomor > 8 atau 0 tidak bisa dicapai lewat pipa normal. Perlu wall clip atau cart swap.

## Kenapa beberapa level crash : jump table

Ketika permainan memuat objek tile, ia memakai tipenya sebagai indeks ke **jump table** :

```asm
; Jump table objek tile standar (tipe 0-11)
JumpTable_TileObjects:
  .word Obj_Special       ; tipe 0 : blok ?, tersembunyi, flagpole...
  .word Obj_Platform      ; tipe 1 : platform khusus
  .word Obj_BrickRow      ; tipe 2 : barisan bata
  .word Obj_BlockRow      ; tipe 3 : barisan blok
  .word Obj_CoinRow       ; tipe 4 : barisan koin
  .word Obj_BrickCol      ; tipe 5 : kolom bata
  .word Obj_BlockCol      ; tipe 6 : kolom blok
  .word Obj_Pipe          ; tipe 7 : pipa
  .word Obj_8             ; tipe 8
  .word Obj_9             ; tipe 9
  .word Obj_10            ; tipe 10
  .word Obj_11            ; tipe 11
```

![Jump table : kenapa tipe objek tidak valid membuat permainan crash](/images/smb1-glitch-levels/v4-jump-table.jpg)

Kalau objek punya tipe tidak valid (≥12), permainan melompat ke pointer yang tidak ada di tabel ini. **4 hasil yang mungkin** :

1. **Pointer valid** → objek dimuat normal
2. **Pointer ke jump table lain** (tumpang tindih) → objek berbeda muncul. Contoh : tipe 12 menunjuk ke tabel Y=13, yang memberikan pipa L.
3. **Pointer ke executable** → eksekusi kode acak (mungkin crash)
4. **Placeholder eksplisit (NOP)** → objek tidak melakukan apa-apa (beberapa sprite seperti itu, menghasilkan musuh yang melayang di tempat tanpa bergerak)

![Glitch level ID $58 : sprite pointer menunjuk ke alamat tidak valid, permainan crash](/images/smb1-glitch-levels/v4-glitch-58-crash.jpg)

![Glitch level ID $50 : terowongan awan, level yang dibangkitkan dari data rusak](/images/smb1-glitch-levels/v4-glitch-50.jpg)

Glitch level ID $58 (terowongan yang crash) : sprite pointernya menunjuk ke wilayah memori yang **tidak ada di NES tanpa mapper ROM**. Permainan mencoba memuat Koopa yang sama 5 kali per frame di posisi (0,0), yang menjenuhkan PPU dan menyebabkan freeze.

```asm
; Kenapa ID $58 crash :
; Sprite pointer → alamat tidak valid (di luar ruang NES standar)
; → Permainan membaca byte tak tentu sebagai tipe sprite
; → Koopa $00 (tipe tidak valid tanpa handler) berputar dalam panggilan rekursif
; → Stack overflow 6502 → freeze
```

### Paradoks warp pipa

Ingat cek `target_world BETWEEN 1 AND 8`. Bahkan kalau kamu menemukan pipa di glitch world, permainan memeriksa bahwa dunia tujuan antara 1 dan 8. Glitch world bernomor > 8 (36-1, 255-1...), jadi warp gagal.

Itu juga kenapa Minus World tidak punya akhir : flagpole tidak ada di sprite, dan pipa tidak menuju ke mana-mana.

### Trik 5 objek dalam satu kolom

Ada edge case yang memungkinkan melampaui batas 3 objek per kolom. Ketika antrean macet (slot penuh + objek berikutnya tanpa bendera layar berikutnya), permainan "memproses awal" kolom saat ini berputar hingga menemukan objek dengan bendera layar berikutnya. Selama setiap pra-pemrosesan :

```asm
; Selama pra-pemrosesan kolom :
; 1. Objek dalam antrean melihat lebar sisanya
;    berkurang di setiap "kemajuan kolom palsu"
; 2. Kalau objek mencapai lebar=0, ia keluar dari antrean
; 3. Slot yang bebas bisa diisi objek baru
;    yang ditambahkan di kolom yang sama

; Hasil : hingga 5 objek bisa diproses di kolom yang sama.
; Teknik : menaruh 2 objek yang melintasi batas layar
; (slot 1 dan 2), 1 objek dummy di X < sebelumnya (memblokir antrean),
; lalu 3 objek di X=0 layar berikutnya (salah satunya dengan bendera layar berikutnya).
```

Inilah yang disebut "queue skip" dan dipakai beberapa romhacker untuk membuat level lebih padat daripada yang diizinkan format normal.

## Perbedaan antar versi

### Famicom Disk System

Versi FDS SMB1 punya **peta memori berbeda**. Semua pointer level bergeser, tapi datanya sama. Yang berubah : indeks glitch world sama sekali berbeda :

```
FDS World 36 → Level ID $09 (versi air 5-3)
  → Flagpole ada! Kita bisa menyelesaikan level.
  → Lalu : $27 (7-3 normal) → $44 (4-4 underground)
  → $44 bisa diselesaikan → kapak berfungsi → akhir permainan!

Jadi Minus World FDS adalah "dunia bonus" yang bisa berujung
pada penyelesaian permainan, berlawanan dengan versi NES.
```

Level FDS favorit saya : **ID $5F**, versi bawah tanah dari paruh kedua 3-3 dalam terowongan rendah (sayang itu autoscroller).

### The Lost Levels (Super Mario Bros. 2 Jepang)

Lost Levels mengubah banyak hal :

1. **Urutan identik tile/sprite** : tidak ada lagi level Frankenstein (tile dan sprite memuat level yang sama bahkan dengan ID tidak valid)
2. **Satu tabel pointer 16-bit** alih-alih dua tabel terpisah high/low
3. **4 berkas disk** : ROM dipecah untuk FDS :
   - Berkas 1 : world 1-4
   - Berkas 2 : world 5-8
   - Berkas 3 : world 9 + mesin suara
   - Berkas 4 : world A-D (tabel pointer sama sekali berbeda)
4. **Level ID yang sama = 4 level yang mungkin** menurut berkas yang dimuat
5. **Tidak ada lagi glitch Tenis** : opsi continue (melanjutkan di dunia yang sama setelah game over) membuat warm start tidak berguna, dan permainan **langsung reset** kalau world > 9
6. **Objek baru** : jamur beracun, blok tak terlihat, blok bunga api tak terlihat, pipa terbalik, angin -- tapi disisipkan di tengah daftar yang sudah ada → **ketidakcocokan backward** dengan SMB1
7. **Piranha Plant selalu merah** setelah world 4, **springboard hijau** hanya di world 2/B/3/C/7

### Super Mario All-Stars (SNES)

Porting langsung dengan rutin 6502 yang sama (SNES mengeksekusi kode NES dalam mode kompatibel) :

- **Warp zone diperbaiki** : tidak ada lagi Minus World (memasuki pipa kiri sebelum teks berujung ke dunia yang benar)
- **Crash** : sebagian besar glitch level crash (kecuali ID $6A dan 9-1)
- **Objek kastil ditambahkan** : dibuat lebih unik
- **Tapi** : **wrong warp 4-2** masih berfungsi (tidak di patch!)

### Wrong warp 4-2 : bug penempatan objek

Di 4-2, ada dua objek transisi pipa : vine (warp zone) dan pipa (ruang koin). Objek transisi pertama (milik vine) ditempatkan **jauh sebelum** vine muncul di layar. Yang kedua (pipa) ditempatkan **terlalu telat di level**.

```asm
; Pewaktuan transisi di 4-2 :
; Objek transisi 1 (vine → warp zone) : ditempatkan 3 layar sebelum vine
; Objek transisi 2 (pipa → ruang koin) : ditempatkan 1 layar setelah pipa
;
; Normalnya objek pertama dinonaktifkan sebelum Mario
; mencapai pipa. Tapi kalau Mario cepat (atau memakai
; pintasan blok B+kanan), transisi vine
; masih aktif ketika ia menyentuh pipa!
; → Permainan memuat warp zone alih-alih ruang koin.
;
; Kalau objek ditempatkan tepat setelah vine tapi sebelum
; pipa, bug tidak akan ada.
```

### Level berputar

Bagaimana loop bekerja (8-4, 7-4)? Level punya **checkpoint** dengan nomor layar dan posisi Y yang di hardcode :

```asm
; Checkpoint : {nomor_layar, posisi_vertikal}
; Kalau Mario melewati checkpoint ini pada ketinggian yang benar → level lanjut
; Kalau tidak → warp balik 4 layar (64 blok)
;
; Untuk membuat putaran tak berujung : posisi_vertikal = $F0
; (di bawah bawah layar) → mustahil divalidasi.
;
; Checkpoint sederhana (satu bendera) kecuali world 7
; yang memakai triplet (3 bendera, harus gagal minimal 1)
;
; Warp balik kasar : offset data tile disetel ke nilai
; hardcode, offset data sprite disetel ulang ke 0. Musuh yang ada
; dibongkar seketika → firebar menghilang.
```

## Mengubah format, bukan kode

Salah satu pelajaran paling menarik dari arsitektur ini adalah pengembang SMB1 berhasil membuat sistem level yang sangat ekspresif tanpa pernah menyentuh kode render 6502. Seluruh variasi antar level berasal dari **data** (pointer, objek, sprite, pola lantai), bukan kode.

256 glitch world ada karena **tabel pointer berukuran untuk 128 entri × 4 tipe**, dan permainan tidak pernah memvalidasi nilai yang dibacanya. Ketika pointer jatuh di RAM, permainan menginterpretasikan register Mario sebagai tile. Ketika pointer jatuh di data suara, permainan memainkan musik dalam bentuk desain level. Dan ketika jump table overflow, permainan mengeksekusi apa saja hingga crash.

![Mekanik Super Mario Bros. Lainnya Dijelaskan -- video ke-4](/images/smb1-glitch-levels/yt-mechanics.jpg)

## Apa yang bisa dipelajari dari semua ini

1. **Pemisahan tile/sprite** : independensi total kedua lapisan, dengan urutan penyimpanan berbeda yang menciptakan level Frankenstein unik
2. **Kompresi RLE + sistem objek** : level bukan bitmap melainkan daftar objek yang ditempatkan, dengan pola lantai untuk tanah
3. **Antrean 3 slot** : batas ketat perangkat keras (dan desain level)
4. **Kepercayaan total pada pointer** : permainan memercayai pointer dan jump table, yang menghasilkan entah glitch yang bisa dimainkan, atau crash
5. **256 byte maks** : batas register Y 6502, yang membuat data berulang kalau pergi terlalu jauh
6. **Warm start / cold start** : sistem "lanjutkan" yang membuka pintu ke cart swap Tennis → Mario

Yang terindah : semua itu adalah kode 6502 yang muat dalam 40KB. Kode berdialog langsung dengan perangkat keras dan memberikan kepercayaan total pada setiap akses memori. Kalau pointernya busuk, permainan crash. Dan crash itu kita sebut glitch world.

## 3 hal yang perlu diingat

1. **Glitch world adalah pointer yang jatuh buruk** -- Permainan punya 128 ID × 4 tipe zona, tapi hanya 34 level unik. Ketika nomor world rusak (oleh Tennis atau wall clip), permainan memuat pointer yang dirancang untuk level lain, dan 512 kombinasi yang mungkin menghasilkan hasil yang tidak bisa diprediksi.

2. **Minus World adalah bug warp yang digabung korupsi** -- Pipa kiri di 1-2, kalau diaktifkan sebelum teks muncul, memuat world 36 (0x24). World ini menunjuk ke Level ID $01 (air 2-2), level tanpa flagpole. Dan karena tidak ada transisi pipa untuk world 36, level berputar tanpa batas. Ketiadaan verifikasi menciptakan ikonnya.

3. **Tenis → Mario, 15 tahun sebelum OoT → Paper Mario** -- RAM NES bertahan dari penukaran kartrid berkat kapasitor dan sistem warm start / cold start SMB1. Penghitung langkah Tennis (yang menaikkan byte RAM saat memainkan suara langkah) jatuh tepat pada alamat nomor world. Digit skor tertinggi harus tetap 0, byte $A5 harus utuh, dan permainan harus mendeteksi warm start -- perlombaan keadaan sempurna yang hanya berfungsi dengan Tennis.

Video asli [Retro Game Mechanics Explained](https://www.youtube.com/c/RetroGameMechanicsExplained) adalah pekerjaan semut yang gila -- tingkat detail pada disassembly 6502, peta otomatis semua level, penjelasan cart swap dan warm start. Kalau kamu belum melihat serinya, tonton, ia pendek dan setiap menitnya padat.

Kode sumber peta tersedia di [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html), dan disassembly lengkap SMB1 open source di banyak repo. 40 tahun lalu, programmer Jepang menulis sistem level ini dalam 6502 dengan nol unit test dan nol bug tracker, dan kita terus mempelajari teknik optimasi dengan membuka kode mereka hari ini.
