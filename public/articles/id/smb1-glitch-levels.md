---
title: "Super Mario Bros.: format level, penunjuk, dan 256 glitch world"
description: "Bagaimana 128 level × 4 tipe zona muat dalam 40KB ROM, mengapa Minus World ada, dan bagaimana pertandingan Tennis NES bisa memuat glitch world."
date: 2026-06-10
tags:
  - retro
  - reverse-engineering
  - nintendo
  - nes
  - "6502"
  - mario
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "Bhotl2S3uGLHvuka7UquLoGTka9lRZIl5QXKHTutBEDjOtZAloTQEo6lze5BA2HNLZ0soDQvGVhYwGtcez6YXA=="
---

## Pengantar

Super Mario Bros. adalah 40 kilobyte ROM. Delapan dunia, 32 level, musuh, musik, power-up, semuanya muat di dalamnya.

Tapi jika kamu membuka emulator dan mengutak-atik byte yang tepat, kamu bisa memuat level 36-1. Atau 255-1. Atau mendarat di dunia di mana segalanya terbuat dari sprite Bowser dan pipa yang tidak membawa ke mana pun.

Glitch world ini ada karena alasan sederhana: sistem penyimpanan level SMB1 adalah keajaiban optimasi 8-bit, dan ketika kita memaksa game membaca di tempat yang tidak seharusnya, hasilnya sangat menarik.

Retro Game Mechanics Explained telah membuat seri 4 video tentang ini -- kita akan menggabungkannya menjadi satu penelusuran mendalam ke dalam kode 6502 dari game terlaris pada masanya.

![GLITCH OBJECTS -- judul seri RGMechEx tentang mekanik tersembunyi SMB1](/images/smb1-glitch-levels/title-card.jpg)

![World 9-1 -- layar judul glitch world pertama yang dapat diakses melalui cart swap Tennis](/images/smb1-glitch-levels/v1-title-9-1.jpg)

## Warm start: mengapa RAM Tennis bertahan di SMB1

Sebelum membahas penyimpanan level, kita perlu memahami bagaimana SMB1 memulai. Karena glitch cart swap NES Tennis sepenuhnya bergantung pada **sistem deteksi warm start / cold start** game.

### 41 byte yang dipertahankan

Ketika SMB1 mendeteksi **cold start** (pertama kali dinyalakan atau power off/on), ia menghapus seluruh RAM. Tetapi ketika mendeteksi **warm start** (tombol reset, tanpa pemadaman daya), ia mempertahankan area memori sebesar **41 byte**:

```asm
; Les 41 bytes préservés en RAM lors d'un warm start
; Adresses $075F-$0787
;
; $075F : byte de démarrage (world - 1)    [1 byte]
; $0760 : flag de sélection de monde (B button) [1 byte]
; $0761-$0762 : inutilisé                    [2 bytes]
; $0763-$0768 : timer (6 digits, 3 affichés) [6 bytes]
; $0769-$076E : coins Luigi                   [6 bytes]
; $076F-$0774 : coins Mario                   [6 bytes]
; $0775-$077A : score Luigi                   [6 bytes]
; $077B-$0780 : score Mario                   [6 bytes]
; $0781-$0786 : top score (6 digits, 1 caché) [6 bytes]
; $0787 : le byte magique $A5                 [1 byte]
```

41 byte ini melayani satu fungsi saja: memungkinkan pemain untuk **melanjutkan di dunia yang sama setelah game over**. Jika kamu mati di 6-3, game menulis dunia 6 di byte awal, dan di layar judul, jika kamu menahan A + Start, kamu mulai ulang di 6-1.

![41 byte yang dipertahankan di RAM saat warm start -- TOP SCORE, MARIO SCORE, TIMER, WORLD SELECT, CONTINUE WORLD, dan byte ajaib $A5](/images/smb1-glitch-levels/v1-memory-state.jpg)

### Verifikasi ganda warm start

![Cold start vs warm start -- diagram deteksi reset](/images/smb1-glitch-levels/v1-warm-start.jpg)

Ketika SMB1 boot, ia tidak memeriksa satu kriteria saja tetapi **dua**:

```asm
CheckWarmStart:
  ; 1. Vérifier le byte magique $A5 à $0787
  lda $0787
  cmp #$A5
  bne ColdStart        ; pas $A5 → cold start

  ; 2. Vérifier les 6 digits du top score ($0781-$0786)
  ;    Chaque digit doit être entre 0 et 9
  ldx #0
CheckLoop:
  lda $0781,x
  cmp #$0A
  bcs ColdStart        ; digit >= 10 → cold start
  inx
  cpx #6
  bne CheckLoop

  ; Si les deux conditions passent → warm start
  ; La RAM n'est pas effacée, le monde de départ est préservé
  jmp WarmStartBoot
```

![Verifikasi byte $A5 dan digit top score -- inti warm start](/images/smb1-glitch-levels/v1-a5-byte.jpg)

Mengapa verifikasi ganda? Karena byte $A5 mungkin muncul secara kebetulan (game lain yang meninggalkan nilai ini, atau status default chip RAM). Dengan memverifikasi bahwa digit top score valid (0-9), kita memastikan data konsisten.

### Mengapa Tennis adalah satu-satunya game yang berfungsi

Ketika kita memasukkan SMB1 untuk pertama kali (cold start), game:
1. Menghapus seluruh RAM → top score = 0, world byte = 0
2. Menulis $A5 ke alamat $0787

Selanjutnya, kita ganti ke Tennis tanpa mematikan konsol. Tennis:
- **Tidak membersihkan RAM saat startup** (sedikit game NES yang melakukan ini)
- **Tidak menulis ke byte top score** → tetap 0 (valid)
- **Tidak menyentuh byte $A5** → tetap ada
- **Menggunakan alamat $075F** untuk penghitung langkah pemain

```asm
; Le footstep increment dans Tennis :
; À chaque pas du joueur sur le court, Tennis incrémente le byte à $075F.
; Ce même byte est utilisé par SMB1 comme "world number - 1".
;
; 0 pas  → world 0 → SMB1 = world 1
; 1-7 pas → world 1-7 → worlds normaux
; 8+ pas → world 8+ → glitch worlds !
;
; Le compteur ne s'incrémente que quand la musique s'arrête
; (les footstep sounds ne jouent pas pendant la musique).
```

Ketika kita memasukkan SMB1 kembali:
1. Byte $A5 masih ada (Tennis tidak menyentuhnya)
2. Digit top score masih 0 (valid)
3. World byte sekarang bernilai 8+ (ditambah oleh langkah Tennis)
4. SMB1 mendeteksi warm start → mempertahankan world byte yang rusak
5. Tahan A + Start → world 9-1, world A-1, world 36-1, dll.

### Mengapa harus boot Mario sebelum Tennis

Satu kehalusan: kita harus boot SMB1 terlebih dahulu, lalu Tennis, lalu SMB1 lagi. Jika kita langsung mulai dengan Tennis, byte $A5 tidak akan pernah ditulis (Tennis tidak menulis $A5), sehingga deteksi warm start akan gagal dan RAM akan dihapus.

![Penghitung langkah Tennis: setiap footstep menambah world byte](/images/smb1-glitch-levels/v1-footstep.jpg)

![Akses Glitch Worlds melalui NES Tennis -- video yang menjelaskan cart swap](/images/smb1-glitch-levels/yt-tennis.jpg)

## Bagaimana SMB1 menyimpan level dalam 40KB

Nintendo R&D4 harus menyelesaikan masalah yang tampak sederhana: merepresentasikan level yang bergulir horizontal dengan tile, musuh, item, semuanya dalam batasan ROM yang sangat ketat.

Solusinya adalah pemisahan menjadi dua lapisan data **yang sepenuhnya independen**:

### Tile layout (peta level)

Setiap level ditentukan oleh penunjuk ke struktur tile terkompresi di ROM. Kompresi primitif tapi brilian: byte "kontrol" diikuti oleh 1-3 byte data.

Format tile menggunakan sistem **run** (seperti RLE):

```asm
; Format tile SMB1 (simplifié)
; Chaque "commande" est un byte contrôle :
;
; $00-$7F : pose une tile, avance d'1 colonne
; $80-$BF : pose une tile répétée N fois (N = byte - $80 + 1)
; $C0-$FF : commande spéciale (fin de ligne, saut, changement de palette)

Exemple : pour dessiner 3 briques consécutives :
  $82 $01    ; répète la tile $01 (brick) 3 fois
```

Setiap level berisi 13 baris × 16 kolom tile (13×16 = 208 tile terlihat). Tapi format terkompresi memungkinkan untuk mengurangi jauh lebih banyak -- misalnya, langit dan kolom kosong hampir tidak memakan tempat.

Loop rendering dalam 6502:

```asm
; Décompression tile - loop principale
; Entrée : pointeur tile_data en $XX
; Sortie : tilemap niveau dans la RAM PPU

DecompressTile:
  lda (tile_ptr),y      ; lire byte contrôle
  iny
  cmp #$80
  bcc SingleTile        ; $00-$7F : tile unique
  cmp #$C0
  bcc RunLength         ; $80-$BF : run-length
  jmp SpecialCommand    ; $C0-$FF : commande spéciale

SingleTile:
  sta PPU_DATA          ; écrire la tile directement
  jmp Next

RunLength:
  sec
  sbc #$7E              ; N = control - $7E
  tax
  lda (tile_ptr),y      ; lire la tile à répéter
  iny
: sta PPU_DATA
  dex
  bne :-
  jmp Next
```

### Sprite layout (musuh dan objek)

Secara paralel, musuh dan objek (blok ?, pipa, goomba, koopa) disimpan dalam struktur yang sepenuhnya terpisah. Setiap spawn ditentukan oleh 2 byte:

```asm
; Format sprite SMB1
; Byte 0 : position X (en colonnes)
; Byte 1 : type de sprite + bits de page Y
; Y est dérivé de l'index dans la séquence

Une séquence de sprites :
  $01 $4B    ; goomba à la colonne 1
  $09 $4B    ; goomba à la colonne 9
  $10 $61    ; bloc ? à la colonne 16 (contient pièce)
  $15 $54    ; koopa verte à la colonne 21
  $FF        ; fin de séquence
```

Setiap level dapat merujuk hingga 5 halaman sprite berbeda (yaitu 5 "layar" 16 kolom), tapi praktisnya sebagian besar level hanya menggunakan 2-3.

### Tabel penunjuk

Kejeniusan dari desainnya adalah tabel penunjuk. Setiap level disimpan sebagai **pasangan** alamat ROM:

```c
// Structure interne (simplifiée) du World Map
struct LevelPointer {
    uint16_t tile_ptr;   // Adresse ROM des données tiles
    uint16_t sprite_ptr; // Adresse ROM des données sprites
};

// 4 tables séparées, une par AreaType :
// 0 = Water, 1 = Overworld, 2 = Underground, 3 = Castle
LevelPointer level_table[4][128];
```

128 entri per tabel. 4 tipe zona. **512 kombinasi yang mungkin**, tapi hanya sebagian kecil yang digunakan oleh game resmi. Sisanya adalah RAM yang belum diinisialisasi atau data yang ditafsirkan sebagai penunjuk.

Ketika game memuat level, ini yang dilakukannya:

```asm
; Chargement d'un niveau
; A = AreaType (0-3), X = LevelID (0-127)

LoadLevel:
  sta AREA_TYPE
  asl                  ; *2 pour offset dans table 16-bit
  tax
  lda LevelTable_TilePtr, x
  sta TILE_PTR
  lda LevelTable_TilePtr+1, x
  sta TILE_PTR+1       ; pointeur vers les tiles
  lda LevelTable_SpritePtr, x
  sta SPRITE_PTR
  lda LevelTable_SpritePtr+1, x
  sta SPRITE_PTR+1     ; pointeur vers les sprites
  jsr DecompressTiles
```

Tanpa validasi. Tanpa pengecekan apakah penunjuk valid. Game membaca alamat di tabel dan mendekompresi apa yang ada di alamat tersebut, titik akhir.

![Level ID $06 (Water) -- 9-1, versi bawah air dari 6-2](/images/smb1-glitch-levels/lvl-06-9-1.png)

![Tabel Level ID: 128 kemungkinan entri, 34 ditetapkan](/images/smb1-glitch-levels/v2-level-id-table.jpg)

![Urutan penunjuk tile dan sprite yang berbeda -- penyebab Frankenstein level](/images/smb1-glitch-levels/v2-pointer-tables.jpg)

### 34 level unik dan sistem ID 7-bit

![Chip RAM NES (MB8416A) -- chip ini mempertahankan data saat kita menukar kartu](/images/smb1-glitch-levels/v1-ram-chip.jpg)

SMB1 tidak memiliki 32 level, tapi **34 level unik**. Banyak level adalah duplikat (5-3 = 1-3 tapi dengan Bullet Bill) yang ditandai dengan bendera "hard mode". Level unik yang sebenarnya:

- **Air** (Tipe 0): 3 level (2-2, 7-2, zona bonus 5-2/6-2)
- **Overworld** (Tipe 1): 22 level (termasuk 2 ruang bonus awan)
- **Underground** (Tipe 2): 3 level (termasuk ruang bonus bawah tanah)
- **Castle** (Tipe 3): 6 level
- \+ 1 ruang cutscene (sebelum level bawah tanah/air)
- \+ 1 warp zone dari 4-2

Setiap level memiliki ID **7 bit**. 5 bit rendah = nomor di sub-grup, 2 bit tinggi = tipe zona:

```asm
; Encodage 7-bit du Level ID
; Bits 6-5 : Type (00=Water, 01=Overworld, 10=Underground, 11=Castle)
; Bits 4-0 : Numéro dans le sous-groupe
;
; Water IDs      : $00-$02  (types 00, numéros 0-2)
; Overworld IDs  : $20-$35  (types 01, numéros 0-21)
; Underground IDs: $40-$42  (types 10, numéros 0-2)
; Castle IDs     : $60-$65  (types 11, numéros 0-5)
;
; ID $25 = %0100101 → type 01 (Overworld), numéro 5 → 1-1
; ID $23 = %0100011 → type 01 (Overworld), numéro 3 → 6-2
```

**128 ID yang mungkin** ($00-$7F), hanya 34 yang ditetapkan untuk level nyata. ID yang tidak digunakan menunjuk ke mana saja.

### Tabel penunjuk: dua daftar, dua urutan

Penunjuk tile dan sprite tidak disimpan dalam urutan yang sama. Kode menggunakan dua daftar 16-bit terpisah (high byte / low byte dalam dua tabel berbeda):

```
Urutan penunjuk sprite:
  Index 0-5   : Castle (6 level)
  Index 6-27  : Overworld (22 level)
  Index 28-30 : Underground (3 level)
  Index 31-33 : Water (3 level)

Urutan penunjuk tile:
  Index 0-2   : Water (3 level)
  Index 3-24  : Overworld (22 level)
  Index 25-27 : Underground (3 level)
  Index 28-33 : Castle (6 level)
```

Mengapa urutan berbeda? Tidak ada alasan teknis -- ini mungkin karena data diorganisir selama pengembangan. Tapi ini menciptakan konsekuensi yang menarik: ketika ID level tidak valid, penunjuk tile dan sprite memuat level yang *berbeda*, menciptakan **Frankenstein level**.

Untuk menavigasi antara kedua daftar ini, game menggunakan **tabel offset** kecil (seperti daftar isi):

```asm
; Tables d'offset par type (Water, Overworld, Underground, Castle)
; Chaque entrée = index de début dans la liste correspondante

SpriteOffsetTable:
  .byte $1F, $06, $1C, $00    ; Water=31, Overworld=6, Underground=28, Castle=0

TileOffsetTable:
  .byte $00, $03, $19, $1C    ; Water=0, Overworld=3, Underground=25, Castle=28
```

Untuk memuat level 6-2 (ID $23, Overworld nomor 3):

```asm
; 1. Type = 01 (Overworld) → index dans table d'offset = 1
; 2. Sprite offset = SpriteOffsetTable[1] = 6
;    Index final = 6 + 3 (numéro de niveau) = 9 → 10ème pointeur sprites
; 3. Tile offset = TileOffsetTable[1] = 3
;    Index final = 3 + 3 = 6 → 7ème pointeur tiles
; 4. Résultat : pointeur tiles $A619 + pointeur sprites $9ED0 = 6-2 ✓
```

Sekarang, apa yang terjadi dengan ID yang tidak valid seperti $43 (Underground nomor 3, yang tidak ada)?

```asm
; ID $43, Type = 10 (Underground), numéro = 3
; Sprite offset = SpriteOffsetTable[2] = $1C = 28
;   Index = 28 + 3 = 31 → 32ème pointeur sprites = eau bonus 5-2 !
; Tile offset = TileOffsetTable[2] = $19 = 25
;   Index = 25 + 3 = 28 → 29ème pointeur tiles = 1-4 (Castle) !
;
; Résultat : un niveau souterrain avec les tiles de 1-4
; et les Bloopers de la zone eau de 5-2. Un vrai Frankenstein.
```

![Level ID $43 -- Frankenstein level: tile 1-4 + sprite air 5-2](/images/smb1-glitch-levels/lvl-43-frankenstein.png)

![Exploring Glitch Level Pointers -- tabel offset yang dijelaskan](/images/smb1-glitch-levels/yt-pointers.jpg)

![World index table -- ketika overflow world 9 menciptakan glitch level](/images/smb1-glitch-levels/v2-world-index-table.jpg)

### World index table: mengapa world 9 overflow

Ada tabel ROM 8 byte yang memberikan index dari level pertama setiap dunia (1-8). Dan tepat setelahnya, tabel 36 Level ID dari semua level dalam urutan bermain.

```asm
; WorldIndexTable (8 bytes)
  .byte 0, 5, 10, 15, 20, 25, 28, 33
;   -> Monde 1 commence au niveau 0
;   -> Monde 2 commence au niveau 5
;   -> Monde 8 commence au niveau 33

; LevelIDTable (36 bytes)
  .byte $25, $28, $29, $26, $24, ... ; les 36 Level IDs
```

Ketika kita mencoba memuat world 9, game membaca byte ke-9 dari WorldIndexTable... yang tidak ada. Ia overflow 1 byte ke LevelIDTable, membaca nilai $25, lalu menggunakan $25 sebagai index di LevelIDTable (entri ke-37) -- yang overflow lagi 2 byte ke SpriteOffsetTable, dan membaca nilai 6.

```asm
; World 9 :
;   1. WorldIndexTable[8] (overflow) → lit $25 dans LevelIDTable
;   2. LevelIDTable[37] (overflow) → lit le 2ème byte de SpriteOffsetTable = 6
;   3. ID = 6 → Water level number 6 (qui n'existe pas)
;   4. Tile pointer = pointeur water numéro 6 = tiles de 6-2
;   5. Sprite pointer = index 31+6 = 37 > 33 → pointeur invalide
;   6. Résultat : 6-2 sous l'eau avec des sprites glitchés
;      → world 9-1 !
```

Untuk world G (16), overflow berjalan lebih jauh dan jatuh ke Level ID $01, yang adalah level cutscene yang mendahului 1-2:

```asm
; World G (16) :
;   WorldIndexTable[15] → lit $01 dans LevelIDTable
;   LevelIDTable[1] = $29 (cutscene 1-2)
;   → world G-1 = la cutscene d'entrée de 1-2
```

## Mengapa glitch world ada

Game memiliki 32 level "legitimasi" (8 dunia × 4 level). Tapi tabel penunjuk memiliki 128 entri per tipe zona. Entri melampaui level 32 berisi apa yang ada di ROM pada alamat-alamat tersebut -- kadang level lain, kadang data suara, kadang RAM, kadang apa saja.

![Level ID $01 Water (Minus World) -- tile pointer $AE45, sprite pointer $A171](/images/smb1-glitch-levels/minus-world.png)

### Level ID $01 + AreaType 0 = Minus World

Glitch world paling terkenal. Level ID $01 di AreaType 0 (air) menunjuk ke:

- **Tile pointer: $AE45** → zona bawah air dari 2-2/7-2
- **Sprite pointer: $A171** → sprite dari 2-2/7-2

Hasilnya: level air yang mirip 2-2, tapi looping tanpa batas karena flagpole tidak ada. Tanpa akhir level, tanpa jalan keluar.

Ini adalah level 36-1 (atau 36-1 di dunia $-1).

![Warm start check SMB1 -- inilah yang memungkinkan Minus World ada](/images/smb1-glitch-levels/v4-minus-world.jpg)

```asm
; Pourquoi le flagpole manque dans le Minus World :
; Les sprites de 2-2/7-2 ($A171) n'ont pas de flagpole
; dans leur séquence. Le jeu cherche le sprite $FD (flagpole)
; mais ne le trouve jamais → boucle infinie
;
; Le jeu continue de générer le niveau à l'infini
; jusqu'à ce que le timer atteigne zéro.
```

### Penunjuk yang menunjuk ke RAM

Ketika tile pointer atau sprite pointer menunjuk ke alamat di RAM ($00-$7F) bukan di ROM, game mencoba menafsirkan perubahan konstan di RAM sebagai tile:

```asm
; Exemple : Level ID $03 en Water
; Tile Pointer : $A46B (3-3 - valide)
; Sprite Pointer : $009D (pointe vers la RAM page zéro !)
;
; La RAM page zéro contient les registres du jeu,
; la position de Mario, l'état des compteurs...
; Le jeu décompresse ça comme une séquence de sprites,
; et le résultat c'est un niveau avec des ennemis
; qui sont en fait des valeurs de registres.
```

Ketika halaman nol berubah (karena Mario bergerak, timer berputar, dll.), "sprite" level juga berubah. Inilah mengapa beberapa glitch world memiliki musuh yang berkedip dan terus-menerus berubah.

![Level ID $03 Water -- sprite pointer $009D menunjuk ke RAM, level tidak bisa dimainkan](/images/smb1-glitch-levels/level-03-water.png)

### Level ID $36: level kosong (Overworld)

Level ID $36 di Overworld:

- **Tile pointer: $AC35** (1-2)
- **Sprite pointer: $A0D8** (1-2)

Hasilnya: tidak ada. Game memuat level tapi ditandai "tanpa level" di katalog RGMechEx. Tile mungkin valid tapi sprite menunjuk ke tempat yang menghasilkan level kosong atau tidak berfungsi.

### Level ID $1D (Castle): juara crash

Level ID $1D di Castle:

- **Tile pointer: $A210** (4-4)
- **Sprite pointer: $7EA0** (RAM!)

Sprite pointer di RAM = sprite undefined. Game mencoba menampilkan Spiny ball atau Bullet Bill blaster di baris tile pertama. Ini langsung crash.

```asm
; Quand le sprite pointer pointe vers la RAM,
; le jeu décompresse des bytes qui changent tout le temps
; comme des instructions "spawn". Le résultat :
; - Apparition d'objets inexistants (valeur undefined)
; - Crash PPU quand le sprite NES essaie d'afficher un tile invalide
; - Freeze complet de la console
```

## 256 glitch world yang dikatalogkan

RGMechEx telah menulis skrip yang menghasilkan peta dari **semua level**, untuk 4 tipe zona, dan 128 ID masing-masing.

Penghitung dunia menggunakan 8 bit (0-255). Dunia 1-8 legitimasi. Tersisa **248 glitch world** potensial. Setiap glitch world sesuai dengan level pertama dari dunia tersebut, dan Level ID-nya dihitung oleh mekanisme overflow WorldIndexTable.

![Tabel glitch world -- 248 dunia yang rusak, 68 level pertama yang dapat diakses](/images/smb1-glitch-levels/v3-glitch-worlds-table.jpg)

Dari 128 ID yang mungkin, hanya **68 yang merupakan "level pertama" dari suatu dunia** (dapat diakses melalui nomor glitch world). 60 lainnya adalah level 2+ atau tidak dapat diakses.

| Tipe | ID unik yang bisa dimainkan | ID yang crash | ID kosong |
|------|----------------------------|---------------|-----------|
| Water (0)    | ~20  | ~60  | ~48  |
| Overworld (1)| ~30  | ~55  | ~43  |
| Underground (2) | ~15 | ~65 | ~48  |
| Castle (3)   | ~25  | ~58  | ~45  |

Banyak ID mengarah ke level yang sama karena penunjuk jatuh ke alamat ROM yang sama. Level ID $28 (Overworld) misalnya -- tile pointer $A7CD (2-1) -- muncul di **38 glitch world berbeda**, karena sprite pointer $9F51 menunjuk ke area ROM yang digunakan sebagai padding/data suara yang digunakan kembali oleh banyak ID.

![Peta level ID $28 (Overworld) -- tile 2-1 dengan sprite normal, 38 glitch world](/images/smb1-glitch-levels/level-28-overworld.png)

![Super Mario Bros. Glitch Levels Explained -- video ke-3](/images/smb1-glitch-levels/yt-levels.jpg)

### 6 glitch level yang benar-benar unik

Dari 19 ID glitch level yang dapat diakses, hanya **6 yang tidak langsung crash** saat pemuatan:

| World | Level ID | Deskripsi |
|-------|----------|-----------|
| E-1 (224) | $50 | Satu blok ? di atas jurang. Mario mati seketika. |
| W | $57 | Mario spawn terjebak, tidak bisa bergerak. |
| 42 (133) | $50 | Terowongan awan yang menjebak Mario jika pergi cukup jauh. |
| 62 (131, 240) | $4D | Kastil beku: Mario spawn di atas, tidak bisa jatuh → terjebak. |
| 127 | $4B | Terowongan bawah tanah, tapi crash jika pergi terlalu jauh. |
| 137 | $4B | Mengaktifkan scrolling otomatis cutscene. Mario menemui satu blok brick yang memblokirnya selamanya. |

![Level ID $50 (cloud tunnel) -- glitch world 42-1 dan E-1](/images/smb1-glitch-levels/lvl-50-cloud.png)
![Level ID $4D (castle) -- world 62-1, Mario terjebak di spawn](/images/smb1-glitch-levels/lvl-4D-castle.png)
![Level ID $4B (tunnel) -- world 127-1, crash jika pergi terlalu jauh](/images/smb1-glitch-levels/lvl-4B-tunnel.png)

Enam glitch world dari 248 yang menghasilkan sesuatu yang benar-benar baru. Sisanya adalah level normal dengan tipe zona yang salah, atau layar hitam.

## Format level secara mendalam

Mari kita lihat format data level yang tepat, untuk memahami mengapa glitch level bisa berdiri sendiri (atau tidak).

### Header level: 2 byte, 6 properti

Setiap level dimulai dengan header 2 byte yang mengontrol 6 properti:

```asm
; Byte 0 : timer + Y start + modifier
;   Bits 7-6 : timer (00=inchangé, 01=200, 10=300, 11=400)
;   Bits 5-3 : Y start Mario (111/110 = autowalk)
;   Bits 2-0 : level type modifier
;              000=default, 001=waves, 010=brick wall,
;              011=water bottom, 100=night, 101=snow,
;              110=snow night, 111=gray night

; Byte 1 : platform + background + floor pattern
;   Bits 7-6 : special platform (00=tree, 01=mushroom,
;                                 10=Bullet Bill, 11=cloud)
;   Bits 5-4 : background (00=none, 01=clouds,
;                           10=montains, 11=fences)
;   Bits 3-0 : floor pattern initial (0-15)
```

Tipe modifier mengontrol variasi visual: ombak di atas level air, latar belakang bata 8-3, palet malam 4-3, salju 6-2, dll.

### Objek tile: 2 byte, Next Screen Flag, antrian 3 slot

Setelah header datang daftar **objek tile**, setiap objek 2 byte. Byte $FD menandakan akhir daftar.

```asm
; Format objet tile (16 bits) :
; Byte 0 :
;   Bits 7-4 : X position (colonne 0-15)
;   Bits 3-0 : Y position
;     Y=0-11  : position Y normale
;     Y=12    : objets spéciaux (trous, ponts, rope, ? blocks)
;     Y=13    : screen skip / objets spéciaux 2
;     Y=14    : changement de modifier/scenery/floor
;     Y=15    : objets spéciaux 3 (château, escaliers, gros tuyau)

; Byte 1 :
;   Bit  7   : NEXT SCREEN FLAG
;   Bits 6-4 : type d'objet (0-7)
;   Bits 3-0 : largeur/hauteur / sous-type
```

Ketika bit "next screen" diaktifkan, kolom kerja saat ini ditambah 1. Ini memungkinkan penempatan objek melampaui 16 kolom pertama. Objek harus didaftar **dalam urutan** (kiri ke kanan) karena game memuatnya secara sekuensial:

```asm
; La routine de chargement a DEUX phases par colonne :
; Phase 1 : chercher les nouveaux objets qui commencent sur cette colonne
;            et les ajouter à la file d'attente (queue)
; Phase 2 : traiter chaque objet dans la queue en dessinant les tiles,
;            et retirer ceux qui finissent sur cette colonne
```

Antrian memiliki tepat **3 slot**. Konsekuensi langsung: kita tidak bisa memiliki lebih dari 3 objek yang dimulai pada kolom yang sama. Jika antrian penuh, objek ke-4 diabaikan dan tidak akan pernah dimuat.

Inilah mengapa level yang dirancang dengan baik menghindari penumpukan terlalu banyak objek. Contoh di 1-2: kolom dengan blok 1up di langit-langit + bata di sebelahnya dipisah menjadi dua objek berbeda untuk mematuhi batas 3.

### Y position khusus: 12, 13, 14, 15

Ketika Y=12, objek tidak memiliki posisi Y (hardcoded oleh tipe):

```asm
; Y=12 : objets sans Y position
;   Type 0 : trou (supprime le sol)
;   Type 1 : rope de plateforme mobile
;   Types 2-4 : ponts à Y fixe
;   Type 5 : trou avec eau/lave
;   Types 6-7 : rangées de ? blocks
```

Ketika Y=13, dua sub-grup. Jika bit 6 byte 1 bernilai 1:

```asm
; Y=13, bit6=1 : objets spéciaux
;   0 = L-pipe (cutscene), 1 = flagpole, 2-3 = pont/axe/hamer (fin château)
;   4 = stop screen, 5 = random enemies, 6 = loop level, 7+ = crash possible
```

Jika bit6=0, 5 bit rendah mengkodekan **screen skip** (melompat langsung ke layar N, tanpa melewati next screen flag satu per satu).

Ketika Y=14: prinsip yang sama dengan bit6=1 untuk mengubah tipe modifier, bit6=0 untuk mengubah latar belakang + floor pattern.

### Floor pattern: 16 pola lantai

Lantai level tidak terbuat dari objek individual. SMB1 menggunakan **floor pattern**, pola latar belakang yang diterapkan ke semua kolom sampai perubahan berikutnya:

```asm
; Floor patterns (4 bits = 16 possibilités)
;   0 = vide total
;   1 = sol 2 tiles haut
;   2 = sol 1 tile haut
;   3 = sol + bottom
;   4 = sol + bottom 2
;   5 = sol 1/2 tile
;   6 = 3/4 sol
;   ... jusqu'à 15 = rempli total (sol + plafond)
```

Inilah mengapa lubang adalah objek: mereka menimpa floor pattern pada kolom tertentu, tanpa harus mengubah pattern untuk sisanya.

### Batas 256 byte dan repeat

Semua data tile level muat dalam **maksimal 256 byte**. Y register 6502 digunakan sebagai index, dan berukuran 8 bit. Jika game mencapai akhir data tanpa menemukan byte $FD, **ia looping kembali ke awal** dan mengulang 256 byte tanpa batas:

```asm
; Index Y = 8 bits → max 256 bytes de données tiles
; Si Y overflow (255 → 0) sans rencontrer $FD → repeat
; Même chose pour les sprites, mais les objets pipe (3 bytes)
; décalent la parité de l'index à chaque chargement.
```

Beberapa glitch level memanfaatkan repeat ini untuk menghasilkan level yang berlangsung "selamanya".

### Sistem sprite: 2 byte + transisi pipe

Sprite mengikuti format yang serupa, tapi tanpa header dan dengan beberapa perbedaan kunci. Byte $FF menandakan akhir daftar.

```asm
; Format sprite (2 bytes) :
; Byte 0 : position X (colonne)
; Byte 1 :
;   Bit 7 : NEXT SCREEN FLAG
;   Bits 6-0 : type de sprite
;       Certains types incluent : goomba, koopa, Blooper,
;       Bullet Bill, Lakitu, Spiny, plateformes,
;       commande warp zone, toad/princesse,
;       commandes de spawn de groupes d'ennemis
```

Bit terendah dari byte 1 adalah **hard level flag**: jika diaktifkan, sprite hanya muncul di level ≥ 5-3. Inilah cara level "hard mode" dibuat.

Y position 15 = **screen skip** (identik dengan tile). Y position 14 = **transisi pipe** (3 byte):

```asm
; Sprite Y=14 : pipe/vine transition (3 bytes !)
;   Byte 0 : position X
;   Byte 1 : bits 6-0 = Level ID 7-bit (destination)
;   Byte 2 : bits 4-0 = screen de destination
;            bits 7-5 = world où cette transition est valide
;
; Pourquoi un world ? Les bonus rooms sont réutilisées entre mondes.
; Exemple : la salle bonus de 1-1 est aussi utilisée par 2-1 et 7-1.
; Cette salle a 3 transitions, une par monde, pour que Mario
; réapparaisse au bon endroit.
```

Sprite **tidak memiliki queue system**. Satu-satunya batas adalah tidak boleh ada lebih dari 4 sprite yang dimuat secara bersamaan di zona spawn (tepat di luar layar di sebelah kanan). Lebih dari itu, sprite diabaikan.

## Cara mengakses glitch world

Ada dua metode utama.

### Metode klasik: wall clip

Wall clip (melewati tembok) memungkinkan keluar dari level normal dan berjalan sampai ke warp zone tersembunyi. Dengan memanipulasi penghitung dunia melalui RAM, kita dapat memuat Level ID apa pun.

Tekniknya:
1. World 1-2: masuk ke pipa akhir tersembunyi
2. Lakukan wall clip di tembok kanan
3. Berjalan di kekosongan sampai ke zona warp
4. Game menafsirkan nilai sebagai dunia

Tapi metode ini hanya memberikan akses ke sebagian kecil glitch world.

### Metode ekstrem: NES Tennis cart swap

Lihat bagian "Warm start" di atas untuk penjelasan lengkap. Singkatnya: penghitung langkah Tennis menulis ke byte RAM yang sama dengan dunia awal SMB1, dan deteksi warm start mempertahankan nilai tersebut.

### sudut tweak: kode untuk menjelajahi semuanya

Jika kamu ingin menjelajahi semua glitch sendiri di emulator, kamu bisa mem-patch Level ID langsung:

```asm
; Patch pour FCEUX / Mesen :
; Adresse RAM $075F = Level ID actuel
; Adresse RAM $0760 = Area Type (0=Water, 1=Overworld, 2=Underground, 3=Castle)

; Exemple : charger le Level 57 (0x39) en Overworld
; Dans l'émulateur, ouvrir le traceur mémoire et écrire :
; $075F = 0x39
; $0760 = 0x01
; Puis entrer dans un tuyau de warp ou mourir et recommencer
; → Le jeu charge le niveau ID $39 en Overworld
```

RGMechEx telah menerbitkan daftar lengkap 128 level × 4 tipe dengan peta yang dihasilkan secara otomatis di [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html). Setiap entri menunjukkan tile pointer, sprite pointer, dan peta visual level.

## Level paling WTF

### Level ID $1F (Water): 15 glitch world dalam satu

Tile pointer $A302 (3-4) dikombinasikan dengan sprite pointer $02A0 menghasilkan 15 glitch world berbeda (D-1, J-1, Y-1, Z-1, 55-1, 73-1...). Penjelasan: sprite pointer menunjuk ke area ROM yang berisi data yang cukup mirip dengan sprite valid untuk menghasilkan hasil yang bisa dimainkan, tapi kombinasi tile kastil 3-4 dengan sprite overworld menciptakan rendering yang absurd.

### Level ID $28 (Overworld): 38 glitch world = rekor

Rekor absolut. 38 entri glitch world menunjuk ke level yang sama (tile 2-1 + sprite $9F51). Mengapa? Karena sprite pointer $9F51 jatuh di area ROM yang digunakan sebagai padding/data suara yang digunakan kembali oleh banyak ID.

### Level ID $49 (Underground): level FDS

Tile pointer $76AE + sprite pointer $1C9D. Tile pointer menunjuk ke area ROM yang disediakan untuk versi Famicom Disk System. Hasilnya: level dengan tile yang tidak ada di kartu standar. Inilah level yang memunculkan level 52-1 dan 196-1.

### Level ID $00-$02: level bonus yang sebenarnya

ID ini digunakan oleh sub-level legitimasi game:

- **$00**: zona bawah air 5-2/6-2 (digunakan oleh H-1, 39-1)
- **$01**: air 2-2/7-2 (Minus World, 36-1)
- **$02**: sub-level 8-4 (136-1, 151-1, 215-1)

Perbedaan antara level "bonus" yang dapat diakses secara normal dan glitch world adalah warp zone memeriksa dunia saat ini:

```asm
; Vérification warp zone (simplifié)
; Le jeu vérifie que le monde cible est entre 1 et 8
CheckWarp:
  lda TARGET_WORLD
  cmp #1
  bcc InvalidWarp       ; < 1 → refusé
  cmp #9
  bcs InvalidWarp       ; > 8 → refusé
  ; world valide entre 1 et 8 uniquement
  jmp DoWarp
```

Glitch world dengan nomor > 8 atau 0 tidak dapat dicapai oleh pipa normal. Diperlukan wall clip atau cart swap.

## Mengapa beberapa level crash: jump table

Ketika game memuat objek tile, ia menggunakan tipenya sebagai index di **jump table**:

```asm
; Jump table des objets tiles standards (types 0-11)
JumpTable_TileObjects:
  .word Obj_Special       ; type 0 : bloc ?, hidden, flagpole...
  .word Obj_Platform      ; type 1 : plateforme spéciale
  .word Obj_BrickRow      ; type 2 : rangée de briques
  .word Obj_BlockRow      ; type 3 : rangée de blocks
  .word Obj_CoinRow       ; type 4 : rangée de pièces
  .word Obj_BrickCol      ; type 5 : colonne de briques
  .word Obj_BlockCol      ; type 6 : colonne de blocks
  .word Obj_Pipe          ; type 7 : tuyau
  .word Obj_8             ; type 8
  .word Obj_9             ; type 9
  .word Obj_10            ; type 10
  .word Obj_11            ; type 11
```

![Jump table: mengapa tipe objek yang tidak valid menyebabkan game crash](/images/smb1-glitch-levels/v4-jump-table.jpg)

Jika objek memiliki tipe tidak valid (≥12), game melompat ke penunjuk yang tidak ada di tabel ini. **4 kemungkinan hasil**:

1. **Penunjuk valid** → objek dimuat secara normal
2. **Penunjuk ke jump table lain** (overlap) → objek berbeda muncul. Contoh: tipe 12 menunjuk ke tabel Y=13, yang menghasilkan L-pipe.
3. **Penunjuk ke executable** → eksekusi kode acak (kemungkinan crash)
4. **Placeholder eksplisit (NOP)** → objek tidak melakukan apa-apa (beberapa sprite seperti ini, menghasilkan musuh yang melayang di tempat tanpa bergerak)

![Glitch level ID $58: sprite pointer menunjuk ke alamat tidak valid, game crash](/images/smb1-glitch-levels/v4-glitch-58-crash.jpg)

![Glitch level ID $50: cloud tunnel, level yang dihasilkan dari data yang rusak](/images/smb1-glitch-levels/v4-glitch-50.jpg)

Glitch level ID $58 (terowongan yang crash): sprite pointer-nya menunjuk ke area memori yang **tidak ada di NES tanpa mapper ROM**. Game mencoba memuat Koopa yang sama 5 kali per frame di posisi (0,0, yang jenuhkan PPU dan menyebabkan freeze.

```asm
; Pourquoi ID $58 crashe :
; Sprite pointer → adresse invalide (hors espace NES standard)
; → Le jeu lit des bytes indéterminés comme des types de sprite
; → Le Koopa $00 (type invalide sans handler) boucle en appel récursif
; → Stack overflow 6502 → freeze
```

### Paradox pipe warp

Ingat pengecekan `target_world BETWEEN 1 AND 8`. Bahkan jika kamu menemukan pipa di glitch world, game memverifikasi bahwa dunia tujuan antara 1 dan 8. Glitch world memiliki nomor > 8 (36-1, 255-1...), sehingga warp gagal.

Ini juga mengapa Minus World tidak memiliki akhir: flagpole tidak ada di sprite, dan pipa tidak membawa ke mana pun.

### Trik 5 objek dalam satu kolom

Ada edge case yang memungkinkan melewati batas 3 objek per kolom. Ketika antrian terblokir (slot penuh + objek berikutnya dengan next screen flag hilang), game "memproses prakolom" kolom saat ini dalam loop sampai menemukan objek dengan next screen flag. Selama setiap pemrosesan prakolom:

```asm
; Pendant le prétraitement de colonne :
; 1. Les objets dans la queue voient leur largeur restante
;    décrémentée à chaque "fausse avancée" de colonne
; 2. Si un objet atteint largeur=0, il quitte la queue
; 3. Un slot libéré peut être rempli par un nouvel objet
;    ajouté dans la même colonne

; Résultat : jusqu'à 5 objets peuvent être traités sur la même colonne.
; Technique : placer 2 objets qui traversent la screen boundary
; (slots 1 et 2), 1 objet dummy en X < précédent (bloque la queue),
; puis 3 objets à X=0 de l'écran suivant (dont un avec next screen flag).
```

Ini disebut "queue skip" dan digunakan oleh beberapa romhacker untuk membuat level yang lebih padat dari yang formatnya secara normal memungkinkan.

## Perbedaan antar versi

### Famicom Disk System

Versi FDS SMB1 memiliki **memory map yang berbeda**. Semua penunjuk level digeser, tapi datanya sama. Yang berubah: indeks glitch world benar-benar berbeda:

```
FDS World 36 → Level ID $09 (eau version de 5-3)
  → Le flagpole est présent ! On peut finir le niveau.
  → Ensuite : $27 (7-3 normal) → $44 (4-4 underground)
  → $44 est finissable → la hache fonctionne → fin du jeu !
  
Le Minus World FDS est donc un "bonus world" qui peut mener
à la complétion du jeu, contrairement à la version NES.
```

Level FDS favorit saya: **ID $5F**, versi bawah tanah dari paruh kedua 3-3 di tunnel rendah (sayangnya ini autoscroller).

### The Lost Levels (Super Mario Bros. 2 Jepang)

Lost Levels mengubah banyak hal:

1. **Urutan tile/sprite identik**: tidak ada lagi Frankenstein level (tile dan sprite memuat level yang sama meskipun ID tidak valid)
2. **Satu tabel penunjuk 16-bit** alih-alih dua tabel terpisah high/low
3. **4 file disk**: ROM dipecah untuk FDS:
   - File 1: dunia 1-4
   - File 2: dunia 5-8
   - File 3: dunia 9 + sound engine
   - File 4: dunia A-D (tabel penunjuk benar-benar berbeda)
4. **Level ID sama = 4 level mungkin** tergantung file yang dimuat
5. **Tidak ada lagi glitch Tennis**: opsi continue (lanjut di dunia yang sama setelah game over) membuat warm start tidak perlu, dan game **reset segera** jika world > 9
6. **Objek baru**: jamur racun, blok invisible, blok invisible fire flower, pipa terbalik, angin -- tapi disisipkan di tengah daftar yang sudah ada → **ketidakcocokan backward** dengan SMB1
7. **Piranha Plant selalu merah** setelah world 4, **springboard hijau** hanya di world 2/B/3/C/7

### Super Mario All-Stars (SNES)

Port langsung dengan rutinitas 6502 yang sama (SNES mengeksekusi kode NES dalam mode kompatibel):

- **Warp zone diperbaiki**: tidak ada lagi Minus World (masuk ke pipa kiri sebelum teks mengarah ke dunia yang benar)
- **Crash**: sebagian besar glitch level crash (kecuali ID $6A dan 9-1)
- **Objek kastil ditambahkan**: lebih unik
- **Tapi**: **4-2 wrong warp** masih berfungsi (tidak di-patch!)

### 4-2 wrong warp: bug penempatan objek

Di 4-2, ada dua objek transisi pipa: anggur (warp zone) dan pipa (ruang coin cash). Objek transisi pertama (anggur) ditempatkan **jauh sebelum** anggur muncul di layar. Objek kedua (pipa) ditempatkan **terlalu terlambat di level**.

```asm
; Timing des transitions dans 4-2 :
; Objet transition 1 (vigne → warp zone) : placé 3 écrans avant la vigne
; Objet transition 2 (tuyau → coin cash) : placé 1 écran après le tuyau
;
; Normalement le premier objet est désactivé avant que Mario
; n'atteigne le tuyau. Mais si Mario va vite (ou utilise
; le raccourci du bloc B+right), la transition de la vigne
; est toujours active quand il touche le tuyau !
; → Le jeu charge la warp zone au lieu du coin cash.
;
; Si l'objet avait été placé juste après la vigne mais avant
; le tuyau, le bug n'existerait pas.
```

### Level looping

Bagaimana loop berfungsi (8-4, 7-4)? Level memiliki **checkpoint** dengan nomor layar dan posisi Y yang hardcoded:

```asm
; Checkpoint : {screen_number, vertical_position}
; Si Mario passe ce checkpoint à la bonne hauteur → niveau continue
; Sinon → warp back de 4 écrans (64 blocks)
;
; Pour faire une boucle infinie : vertical_position = $F0
; (en dessous du bas de l'écran) → impossible de valider.
;
; Les checkpoints sont simples (un seul flag) sauf pour world 7
; qui utilise des triplets (3 flags, il faut en échouer au moins 1)
;
; Le warp back est rude : offset de tile data réglé à une valeur
; hardcodée, offset de sprite data remis à 0. Les ennemis présents
; sont déchargés instantanément → les firebars disparaissent.
```

## Mengubah format, bukan kode

Salah satu pelajaran paling menarik dari arsitektur ini adalah pengembang SMB1 berhasil menciptakan sistem level yang sangat ekspresif tanpa pernah menyentuh kode rendering 6502. Semua variasi antar level berasal dari **data** (penunjuk, objek, sprite, floor pattern), bukan kode.

256 glitch world ada karena **tabel penunjuk didesain untuk 128 entri × 4 tipe**, dan game tidak pernah memvalidasi nilai yang dibacanya. Ketika penunjuk jatuh ke RAM, game menafsirkan registri Mario sebagai tile. Ketika penunjuk jatuh ke data suara, game memainkan musik dalam bentuk level design. Dan ketika jump table overflow, game mengeksekusi apa saja sampai crash.

![More Super Mario Bros. Mechanics Explained -- video ke-4](/images/smb1-glitch-levels/yt-mechanics.jpg)

## Apa yang bisa kita pelajari dari semua ini

1. **Pemisahan tile/sprite**: kemandirian total kedua lapisan, dengan urutan penyimpanan berbeda yang menciptakan Frankenstein level unik
2. **Kompresi RLE + sistem objek**: level bukan bitmap tapi daftar objek yang ditempatkan, dengan floor pattern untuk lantai
3. **Antrian 3 slot**: batasan ketat hardware (dan desain level)
4. **Tanpa validasi**: game mempercayai penunjuk dan jump table, yang menghasilkan glitch yang bisa dimainkan atau crash
5. **Maksimal 256 byte**: batasan Y register 6502, yang membuat data mengulang jika terlalu jauh
6. **Warm start / cold start**: sistem "lanjutkan" yang membuka jalan ke cart swap Tennis → Mario

Yang paling bagus: semua ini adalah kode 6502 yang muat dalam 40KB. Tidak ada lapisan abstraksi, tidak ada validasi akses memori, tidak ada manajemen pengecualian. Jika penunjuknya buruk, game crash. Dan crash, kita sebut glitch world.

## 3 hal yang perlu diingat

1. **Glitch world adalah penunjuk yang jatuh ke tempat yang salah** -- Game memiliki 128 ID × 4 tipe zona, tapi hanya 34 level unik. Ketika world number rusak (oleh Tennis atau wall clip), game memuat penunjuk yang dirancang untuk level lain, dan 512 kombinasi yang mungkin menghasilkan hasil yang tidak terduga.

2. **Minus World adalah bug warp yang dikombinasikan dengan korupsi** -- Pipa kiri di 1-2, jika diaktifkan sebelum teks muncul, memuat world 36 (0x24). World ini menunjuk ke Level ID $01 (air 2-2), level tanpa flagpole. Dan karena tidak ada transisi pipa untuk world 36, level looping tanpa batas. Ketidakhadiran verifikasi menciptakan ikon tersebut.

3. **Tennis → Mario, 15 tahun sebelum OoT → Paper Mario** -- RAM NES bertahan dari pertukaran kartu berkat kapasitor dan sistem warm start / cold start SMB1. Penghitung langkah Tennis (yang menambah byte RAM saat memutar suara langkah) jatuh tepat di alamat world number. Diperlukan digit top score tetap 0, byte $A5 utuh, dan game mendeteksi warm start -- kejadian kebetulan sempurna yang hanya berhasil dengan Tennis.

Video asli dari [Retro Game Mechanics Explained](https://www.youtube.com/c/RetroGameMechanicsExplained) adalah pekerjaan yang luar biasa mendetail -- tingkat detail pada disasembli 6502, peta otomatis dari semua level, penjelasan cart swap dan warm start. Jika kamu belum melihat seri ini, tonton, pendek dan setiap menitnya padat.

Kode sumber peta tersedia di [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html), dan disasembli lengkap SMB1 bersumber terbuka di banyak repo. 40 tahun yang lalu, programmer Jepang menulis sistem level 6502 ini tanpa tes unit dan tanpa pelacakan bug, dan kita terus mempelajari hal-hal baru dengan membuka kode mereka hari ini.
