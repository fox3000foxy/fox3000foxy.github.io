---
title: "Laupok membuat AI yang memainkan Super Mario World sendiri -- cara kerjanya"

date: 2026-07-11
tags:
  - ai
  - lua
  - emulation
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "8jp7K9S6ro5YtgqHoKVn4+WUAzb4iWJ2B/EUvvhXVYfqeHBf1D5hgT4B+F5IwFOc+zh/QAAdQ0mwIVWWoCGejQ=="
---

# Laupok membuat AI yang memainkan Super Mario World sendiri -- cara kerjanya

Laupok membuat kecerdasan buatan yang memainkan **Super Mario World** secara sepenuhnya otonom. Ia berangkat dari nol : tanpa skrip yang ditentukan sebelumnya, tanpa frame yang direkam. AI belajar sendiri, lewat mutasi acak dan seleksi alam, menyelesaikan level permainan. Proyek berjalan di **BizHawk**, emulator multiplatform, lewat skrip Lua sekitar **4200 baris**.

Yang membuat proyek ini menarik adalah ia bersandar pada konsep biologis yang diterapkan pada informatika : **teori evolusi Darwin**, **jaringan saraf buatan**, dan terutama algoritma spesifik bernama **NEAT** (NeuroEvolution of Augmenting Topologies). AI tidak tahu apa pun soal permainan pada awalnya. Ia menguji aksi acak, gagal ribuan kali, dan sedikit demi sedikit, ia paham cara maju, melompat, dan bertahan.

Dalam artikel ini, kita akan membedah semuanya -- konsep per konsep, baris kode per baris kode.

![Laupok memperkenalkan algoritma NEAT di depan kamera](/images/laupok-mario-ai/neat-title.jpg)

---

## Penyiapan : BizHawk, Lua, dan Super Mario World

### Emulator BizHawk

BizHawk adalah emulator open source yang mendukung segunung konsol -- NES, SNES, Genesis, PS1, Game Boy, dan banyak lainnya. Kekhasannya adalah ia memungkinkan menjalankan **skrip Lua** paralel dengan permainan. Skrip ini punya akses ke **memori** (RAM) emulasi, yang berarti mereka bisa membaca -- dan mengubah -- data permainan apa pun waktu nyata.

Konkretnya, itu berarti kita bisa :
- Membaca posisi Mario di level
- Mengetahui sprite (musuh, item) mana yang ada di layar
- Mengetahui keadaan setiap tile (blok) di sekitar Mario
- Mengendalikan stik -- menekan tombol apa pun

Tepat itulah yang kita butuhkan untuk membuat AI bermain.

### Alamat memori Super Mario World

Di RAM Super Mario World, setiap data disimpan di alamat spesifik. Ini agak seperti perumahan : setiap alamat cocok dengan sebuah "rumah" yang berisi informasi. Misalnya :

| Alamat | Data |
|---------|--------|
| `0x94`-`0x95` | Posisi X Mario (16 bit, little-endian) |
| `0x96`-`0x97` | Posisi Y Mario |
| `0x14C8`+`i` | Keadaan sprite `i` (>7 = hidup) |
| `0xE4`+`i` | Posisi X rendah sprite `i` |
| `0x14E0`+`i` | Posisi X tinggi sprite `i` |
| `0xD8`+`i` | Posisi Y rendah sprite `i` |
| `0x14D4`+`i` | Posisi Y tinggi sprite `i` |
| `0x170B`+`i` | Tipe extended sprite `i` |
| `0x0100` | Keadaan permainan (12 = level selesai) |
| `0x13D4` | Jeda aktif |
| `0x0071` | Animasi kematian Mario (9 = mati) |
| `0x1C800`+... | Tabel tile level |

Posisi sprite memakai dua oktet : oktet "rendah" dan oktet "tinggi", karena posisi bisa melebihi 255 piksel. Formulaselalu `rendah + tinggi × 256`.

Untuk tile, lebih kompleks : alamat dasarnya `0x1C800`, dan offset dihitung menurut koordinat `x` dan `y` tile di dunia, dengan langkah 16 piksel per tile.

![Super Mario World dengan overlay debug yang menunjukkan alamat memori sprite dan posisi Mario](/images/laupok-mario-ai/memory-debug.jpg)

---

## Dasar : algoritma genetika dan jaringan saraf

Sebelum menyelam ke kode, harus paham dua konsep fundamental. Tanpa mereka, sisanya tidak masuk akal.

### Algoritma genetika

Algoritma genetika adalah simulasi **teori evolusi**. Ide sentralnya : kita membuat **populasi** individu, masing-masing dengan karakteristik ("gen") yang sedikit berbeda. Kita membuat mereka "hidup" di lingkungan. Yang paling berhasil bertahan dan bereproduksi. Yang buruk hilang.

Laupok menggambarkan ini dengan analogi **Kirby** :
- Populasi Kirby muncul di medan dengan duri dan tomat
- Duri mengurangi nyawa, tomat mengembalikannya
- Setiap Kirby punya gen : ukuran, kecepatan, nyawa, perilaku (kabur, mencari tomat, menyerbu ke mana saja)

![Heliks ganda DNA dengan label "bayi", "ukuran", "kecepatan", "warna" -- gen yang menyusun individu](/images/laupok-mario-ai/dna-genes.jpg)

- Setelah 15 detik, kita lihat siapa bertahan paling lama
- Kirby terbaik bereproduksi dengan lainnya : bayi mewarisi setengah gen dari yang terbaik dan setengah dari yang "terburuk"
- Bayi mengalami **mutasi** acak (sedikit lebih besar, sedikit lebih cepat...)
- Kirby lama diganti yang baru
- Kita jalankan ulang

Setelah 180 generasi (~15 jam), Kirby beralih dari 15 detik bertahan hidup menjadi **15 menit**. Mereka menjadi kecil (zona tabrakan mengecil), cepat, dan kabur dari bahaya terus-menerus.

![Simulasi Kirby generasi 0 : lingkaran berwarna tersebar acak pada latar hitam, semuanya berukuran mirip](/images/laupok-mario-ai/kirby-gen0.jpg)

![Simulasi Kirby generasi 1866 : Kirby lebih kecil, lebih cepat, dan selalu kabur dari bahaya](/images/laupok-mario-ai/kirby-gen1866.jpg)

![Statistik simulasi Kirby : fitness, jumlah nyawa, perilaku tiap individu diperingkat berdasar performa](/images/laupok-mario-ai/kirby-stats.jpg)

Poin krusialnya : **kita tidak mendefinisikan solusinya**. Algoritmalah yang **menemukannya sendiri**. Dan tepat itulah yang membuatnya kuat untuk masalah di mana kita tidak tahu kombinasi parameter apa yang optimal.

### Jaringan saraf buatan

Jaringan saraf adalah model matematis sederhana dari otak manusia. Ia terdiri atas :
- **Neuron masukan** (input) : apa yang "dilihat" jaringan
- **Neuron keluaran** (output) : apa yang "diputuskan" jaringan
- **Koneksi** (bobot) : setiap koneksi punya **bobot** yang memperkuat atau melemahkan sinyal

Prinsipnya sederhana : setiap neuron masukan mengirim nilainya. Ia dikalikan bobot koneksi, lalu ditambahkan ke sinyal lain. Kalau hasilnya melampaui ambang tertentu (**fungsi aktivasi**), neuron keluaran aktif.

Dalam analogi Laupok dengan Mario dan ujung tikus :
- Neuron masukan = jarak antara Mario dan ujung
- Bobot koneksi = sensitivitas Mario
- Neuron keluaran = Mario berteriak atau tidak

Makin dekat ujungnya, makin tinggi nilai masukannya. Kalau bobotnya kuat, sinyal yang dikirim ke keluaran kuat, dan Mario berteriak. Dengan mengubah bobot, kita mengubah sensitivitas Mario.

![Demo "Mario takut" : Mario menghadapi Boo dengan bar sinaps yang menampilkan bobot koneksi antara masukan dan keluaran](/images/laupok-mario-ai/mario-fear-demo.jpg)

Di jaringan saraf sungguhan AI, logikanya sama, tapi dalam skala masif :
- **99 neuron masukan** (tile pandangan Mario 11×9)
- **8 neuron keluaran** (A, B, X, Y, Atas, Bawah, Kiri, Kanan)
- **Neuron tersembunyi** (hidden) di antara keduanya
- Ratusan koneksi dengan bobot bervariasi

---

## NEAT : algoritma yang mengubah segalanya

### Masalah algoritma genetika klasik

Kalau kita menggabung algoritma genetika dengan jaringan saraf secara naif, kita punya masalah : kita membuat 100 jaringan saraf yang sama sekali berbeda, dan kita tidak tahu cara membandingkannya. Masing-masing punya neuron sendiri, koneksi sendiri, bobot sendiri. Bagaimana tahu apakah dua jaringan "dekat" atau "jauh"?

Di sinilah **NEAT** berperan -- NeuroEvolution of Augmenting Topologies. Diciptakan oleh **Kenneth Stanley** dan **Risto Miikkulainen** pada 2002, ini algoritma yang memecahkan tepat masalah ini.

### Spesies

Mekanisme kunci pertama NEAT adalah **spesies**. Ketika jaringan saraf menjadi terlalu berbeda dari lainnya, ia diklasifikasikan dalam spesies berbeda. Kemiripan dihitung lewat tiga parameter :

1. **Excess** (`EXCES_COEF = 0.50`) : jumlah koneksi yang tidak ada hubungannya antara dua jaringan (inovasi berbeda)
2. **Disjoint** : sama, tapi untuk koneksi yang terletak di tengah
3. **Perbedaan bobot** (`POIDSDIFF_COEF = 0.92`) : perbedaan bobot rata-rata antara koneksi yang berbagi inovasi yang sama

Formula skornya :

```
score = (EXCES_COEF × disjoint) / max(nbConnexions1 + nbConnexions2, 1)
      + POIDSDIFF_COEF × diffPoids
```

Kalau skor ini di bawah `DIFF_LIMITE` (1.0), kedua jaringan ada dalam spesies yang sama. Kalau tidak, kita membuat spesies baru.

### Inovasi

Inilah kejeniusan NEAT. Setiap kali koneksi dibuat, ia menerima nomor **inovasi** yang unik dan global. Nomor ini mengikuti jaringan saraf bahkan ketika ia bereproduksi.

Konkretnya, ketika bayi dibuat lewat crossover, ia mewarisi inovasi orang tuanya. Kalau dua jaringan berbagi inovasi yang sama, artinya mereka punya koneksi yang berasal dari leluhur yang sama. Inilah yang memungkinkan membandingkan jaringan berukuran berbeda.

### Crossover

Ketika dua jaringan saraf bereproduksi, **crossover** bekerja begini :

![Laupok menjelaskan konsep crossover dengan teks "CROSSOVER" dalam overlay](/images/laupok-mario-ai/crossover-label.jpg)

1. Jaringan paling performan menjadi "orang tua dominan"
2. Bayi mewarisi semua koneksi dari yang dominan
3. Untuk setiap koneksi yang berbagi inovasi yang sama, orang tua lain bisa menggantikannya (peluang 50%)
4. Hanya koneksi aktif dari orang tua non-dominan yang bisa menggantikan

Itu menjamin bayi selalu setidaknya sebaik orang tua terbaik.

### Mutasi

Setelah crossover, bayi mengalami mutasi dengan probabilitas yang bisa dikonfigurasi :

![Laupok menjelaskan mutasi dengan teks "(perubahan kecil = mutasi)" dalam overlay](/images/laupok-mario-ai/mutation-label.jpg)

| Mutasi | Probabilitas | Efek |
|----------|------------|-------|
| Reset bobot koneksi | 25% | Bobot diacak total |
| Mutasi bobot | 95% | Bobot bervariasi ±0.80 |
| Tambah koneksi | 85% | Koneksi baru antara dua neuron yang belum terhubung |
| Tambah neuron | 39% | Neuron tersembunyi disisipkan antara dua neuron yang terhubung |

Tingkat penambahan neuron penting : inilah yang memungkinkan jaringan **tumbuh**. Pada awalnya, hanya ada masukan dan keluaran. Berangsur, neuron tersembunyi muncul, membuat jaringan makin kompleks.

---

## Kodenya : walkthrough lengkap

### Konstanta

Skrip dimulai dengan blok konstanta yang mendefinisikan seluruh pengaturan :

```lua
-- Tampilan Mario di sekitarnya
TAILLE_TILE = 16
TAILLE_VUE_W = TAILLE_TILE * 11  -- 176 piksel lebarnya
TAILLE_VUE_H = TAILLE_TILE * 9   -- 144 piksel tingginya
NB_TILE_W = TAILLE_VUE_W / TAILLE_TILE  -- 11 tile
NB_TILE_H = TAILLE_VUE_H / TAILLE_TILE  -- 9 tile

-- Jaringan saraf
NB_INPUT = NB_TILE_W * NB_TILE_H  -- 99 input (tile yang terlihat)
NB_OUTPUT = 8  -- A, B, X, Y, Atas, Bawah, Kiri, Kanan
NB_INDIVIDU_POPULATION = 100  -- individu per populasi
NB_NEURONE_MAX = 100000  -- batas neuron tersembunyi

-- Fitness
FITNESS_LEVEL_FINI = 1000000  -- nilai ketika level selesai
NB_FRAME_RESET_BASE = 33  -- frame tanpa kemajuan sebelum reset
NB_FRAME_RESET_PROGRES = 300  -- frame kalau kemajuan terdeteksi

-- Spesies
EXCES_COEF = 0.50
POIDSDIFF_COEF = 0.92
DIFF_LIMITE = 1.00

-- Mutasi
CHANCE_MUTATION_RESET_CONNEXION = 0.25
POIDS_CONNEXION_MUTATION_AJOUT = 0.80
CHANCE_MUTATION_POIDS = 0.95
CHANCE_MUTATION_CONNEXION = 0.85
CHANCE_MUTATION_NEURONE = 0.39
```

`NB_INPUT` adalah 99 karena tampilan Mario 11×9 tile. Setiap tile adalah satu neuron masukan. Kalau tile kosong, nilainya 0. Kalau blok, nilainya 1. Kalau musuh, nilainya -1.

8 keluaran cocok dengan tombol stik SNES : A, B, X, Y, Atas, Bawah, Kiri, Kanan. Kita mengecualikan Start, Select, L dan R untuk membatasi keputusannya pada yang esensial.

### Struktur data

Skrip mendefinisikan tiga struktur utama :

```lua
function newNeurone()
    local neurone = {}
    neurone.valeur = 0    -- nilai neuron saat ini
    neurone.id = 0        -- pengenal unik
    neurone.type = ""     -- "input", "output", atau "hidden"
    return neurone
end

function newConnexion()
    local connexion = {}
    connexion.entree = 0     -- ID neuron sumber
    connexion.sortie = 0     -- ID neuron tujuan
    connexion.actif = true   -- bisa dinonaktifkan kalau neuron tersembunyi disisipkan
    connexion.poids = 0      -- bobot koneksi
    connexion.innovation = 0 -- nomor inovasi unik
    connexion.allume = false -- untuk tampilan : true kalau sinyal lewat
    return connexion
end

function newReseau()
    local reseau = {
        nbNeurone = 0,        -- jumlah neuron tersembunyi
        fitness = 1,          -- performa (jarak ditempuh)
        idEspeceParent = 0,   -- termasuk spesies mana
        lesNeurones = {},     -- tabel neuron
        lesConnexions = {}    -- tabel koneksi
    }
    -- Inisialisasi dengan input
    for j = 1, NB_INPUT, 1 do
        ajouterNeurone(reseau, j, "input", 1)
    end
    -- Lalu output
    for j = NB_INPUT + 1, NB_INPUT + NB_OUTPUT, 1 do
        ajouterNeurone(reseau, j, "output", 0)
    end
    return reseau
end
```

Pada awalnya, setiap jaringan hanya berisi input dan output : tanpa neuron tersembunyi, tanpa koneksi. Algoritmalah yang akan memutuskan apakah perlu.

### Mutasi secara detail

#### Mutasi bobot

```lua
function mutationPoidsConnexions(unReseau)
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            if math.random() < CHANCE_MUTATION_RESET_CONNEXION then
                -- 25% : reset total bobot
                unReseau.lesConnexions[i].poids = genererPoids()
            else
                -- 75% : variasi ±0.80
                if math.random() >= 0.5 then
                    unReseau.lesConnexions[i].poids =
                        unReseau.lesConnexions[i].poids - POIDS_CONNEXION_MUTATION_AJOUT
                else
                    unReseau.lesConnexions[i].poids =
                        unReseau.lesConnexions[i].poids + POIDS_CONNEXION_MUTATION_AJOUT
                end
            end
        end
    end
end
```

Bobot awal selalu 1 atau -1 (`genererPoids()`). Variasi ±0.80 bisa membuatnya berosilasi antara nilai negatif dan positif, yang mengubah radikal perilaku jaringan.

#### Penambahan koneksi

```lua
function mutationAjouterConnexion(unReseau)
    local liste = {}
    -- Pengacakan daftar neuron
    for i, v in ipairs(unReseau.lesNeurones) do
        local pos = math.random(1, #liste+1)
        table.insert(liste, pos, v)
    end

    local traitement = false
    for i = 1, #liste, 1 do
        for j = 1, #liste, 1 do
            if i ~= j then
                local n1 = liste[i]
                local n2 = liste[j]
                -- Koneksi valid : input→output, hidden→hidden, hidden→output
                if (n1.type == "input" and n2.type == "output") or
                   (n1.type == "hidden" and n2.type == "hidden") or
                   (n1.type == "hidden" and n2.type == "output") then
                    -- Memeriksa belum ada koneksi
                    local dejaConnexion = false
                    for k = 1, #unReseau.lesConnexions, 1 do
                        if unReseau.lesConnexions[k].entree == n1.id
                            and unReseau.lesConnexions[k].sortie == n2.id then
                            dejaConnexion = true
                            break
                        end
                    end
                    if dejaConnexion == false then
                        traitement = true
                        ajouterConnexion(unReseau, n1.id, n2.id)
                    end
                end
            end
            if traitement then break end
        end
        if traitement then break end
    end
end
```

Kita tidak bisa menghubungkan output ke input (itu menciptakan siklus), dan tidak bisa menghubungkan dua neuron yang sudah terhubung. Pengacakan menjamin kita menjelajahi kemungkinan berbeda setiap kali.

#### Penambahan neuron

Ini mutasi paling menarik :

```lua
function mutationAjouterNeurone(unReseau)
    if #unReseau.lesConnexions == 0 then return nil end
    if unReseau.nbNeurone == NB_NEURONE_MAX then return nil end

    -- Pengacakan koneksi
    local listeRandom = {}
    for i = 1, #unReseau.lesConnexions, 1 do
        local pos = math.random(1, #listeRandom+1)
        table.insert(listeRandom, pos, i)
    end

    for i = 1, #listeRandom, 1 do
        if unReseau.lesConnexions[listeRandom[i]].actif then
            -- Menonaktifkan koneksi yang ada
            unReseau.lesConnexions[listeRandom[i]].actif = false
            unReseau.nbNeurone = unReseau.nbNeurone + 1
            local indice = unReseau.nbNeurone + NB_INPUT + NB_OUTPUT

            -- Membuat neuron tersembunyi
            ajouterNeurone(unReseau, indice, "hidden", 1)

            -- Menghubungkan masukan ke neuron tersembunyi
            ajouterConnexion(unReseau,
                unReseau.lesConnexions[listeRandom[i]].entree,
                indice, genererPoids())

            -- Menghubungkan neuron tersembunyi ke keluaran
            ajouterConnexion(unReseau,
                indice,
                unReseau.lesConnexions[listeRandom[i]].sortie,
                genererPoids())
            break
        end
    end
end
```

Mekanismenya : kita mengambil koneksi yang ada, **menonaktifkannya**, dan menyisipkan neuron tersembunyi di tengah. Koneksi asal diganti dua koneksi baru : masukan→tersembunyi dan tersembunyi→keluaran. Seolah kita "memotong" kabel untuk menyelipkan sakelar.

Inilah yang membuat NEAT "augmenting topologies" : jaringan **tumbuh** seiring waktu. Ia mulai sederhana dan menjadi kompleks hanya kalau perlu.

### FeedForward

Ini fungsi yang menyebarkan sinyal lewat jaringan :

```lua
function feedForward(unReseau)
    -- Reset neuron keluaran
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur = 0
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].allume = false
        end
    end

    -- Penyebaran
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            local avantTraitement = unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur =
                unReseau.lesNeurones[unReseau.lesConnexions[i].entree].valeur *
                unReseau.lesConnexions[i].poids +
                unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur

            if avantTraitement ~= unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur then
                unReseau.lesConnexions[i].allume = true
            else
                unReseau.lesConnexions[i].allume = false
            end
        end
    end
end
```

Setiap koneksi aktif mengirim `nilai_masukan × bobot` ke neuron keluaran. Nilainya **diakumulasi** (ditambahkan). Bendera `allume` hanya untuk tampilan visual jaringan.

### Pembacaan memori permainan

Fungsi `getLesInputs()` inilah yang menerjemahkan dunia Super Mario World menjadi data yang bisa dipahami jaringan :

```lua
function getLesInputs()
    local lesInputs = {}
    -- Inisialisasi ke 0 (abu-abu = tidak ada)
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            lesInputs[getIndiceLesInputs(i, j)] = 0
        end
    end

    -- Sprite (musuh) = -1 (hitam)
    local lesSprites = getLesSprites()
    for i = 1, #lesSprites, 1 do
        local input = convertirPositionPourInput(getLesSprites()[i])
        if input.x > 0 and input.x < (TAILLE_VUE_W / TAILLE_TILE) + 1 then
            lesInputs[getIndiceLesInputs(input.x, input.y)] = -1
        end
    end

    -- Tile (blok) = nilai tile (putih kalau > 0)
    local lesTiles = getLesTiles()
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            local indice = getIndiceLesInputs(i, j)
            if lesTiles[indice] ~= 0 then
                lesInputs[indice] = lesTiles[indice]
            end
        end
    end

    return lesInputs
end
```

Kisi input adalah tampilan yang berpusat pada Mario : 11 tile lebarnya, 9 tingginya. Setiap tile bernilai :
- **0** (abu-abu) : tidak ada
- **1** (putih) : blok padat
- **-1** (hitam) : musuh

Musuh dibaca dari dua daftar di RAM : sprite normal (`0x14C8`-`0x14F8`) dan extended sprite (`0x170B`-`0x173B`). Untuk setiap sprite yang hidup (keadaan > 7), kita menghitung posisinya dalam tile relatif terhadap Mario dan menaruh -1 di petak yang cocok.

### Fitness : cara AI tahu kalau ia maju

```lua
function majReseau(unReseau, marioBase)
    local mario = getPositionMario()

    if not niveauFini and memory.readbyte(0x0100) == 12 then
        -- Level selesai!
        unReseau.fitness = FITNESS_LEVEL_FINI
        niveauFini = true
    elseif marioBase.x < mario.x then
        -- Mario maju ke kanan
        unReseau.fitness = unReseau.fitness + (mario.x - marioBase.x)
        marioBase.x = mario.x
    end

    -- Pembaruan input
    local lesInputs = getLesInputs()
    for i = 1, NB_INPUT, 1 do
        unReseau.lesNeurones[i].valeur = lesInputs[i]
    end
end
```

Fitness itu sederhana : yaitu **jarak yang ditempuh ke kanan**. Kalau Mario maju 10 piksel, fitness naik 10. Kalau Mario mundur, tidak terjadi apa-apa (tanpa penalti). Kalau level selesai (alamat `0x0100` == 12), fitness menjadi 1 000 000.

Ini sengaja sederhana. Hanya progresi ke kanan yang dihitung : membunuh musuh tidak menghasilkan apa-apa, mati tidak merugikan apa-apa.

### Reset cerdas

Kalau Mario tidak bergerak selama 33 frame, kita me reset level dan lanjut ke individu berikutnya. Tapi kalau Mario membuat kemajuan (fitness saat ini berbeda dari awal), kita menunggu 300 frame -- itu memberi kesempatan pada jaringan untuk "memahami" apa yang dilakukannya dengan baik.

```lua
if fitnessAvant == laPopulation[idPopulation].fitness
   and memory.readbyte(0x13D4) == 0 then
     nbFrameStop = nbFrameStop + 1
     local nbFrameReset = NB_FRAME_RESET_BASE
     if fitnessInit ~= laPopulation[idPopulation].fitness
        and memory.readbyte(0x0071) ~= 9 then
         nbFrameReset = NB_FRAME_RESET_PROGRES
     end
     if nbFrameStop > nbFrameReset then
         nbFrameStop = 0
         lancerNiveau()
         idPopulation = idPopulation + 1
         -- ...
     end
end
```

Kondisi `memory.readbyte(0x0071) ~= 9` memeriksa bahwa Mario tidak sedang dalam animasi kematian. Reset menjadi tidak berguna ketika Mario sudah dalam animasi kematian.

### Loop utama

Loop berjalan pada 30 fps (kecepatan normal Super Mario World) :

```lua
while true do
    local fitnessAvant = laPopulation[idPopulation].fitness

    -- Tampilan (jaringan, info)
    if forms.ischecked(estAccelere) then
        emu.limitframerate(false)  -- mempercepat
    else
        emu.limitframerate(true)   -- 30 fps
    end

    -- 3 fungsi vital
    majReseau(laPopulation[idPopulation], marioBase)
    feedForward(laPopulation[idPopulation])
    appliquerLesBoutons(laPopulation[idPopulation])

    emu.frameadvance()
    nbFrame = nbFrame + 1

    -- Reset kalau tidak ada kemajuan
    -- ...
    -- Generasi baru kalau semua individu diuji
    -- ...
end
```

Tiga fungsi vital adalah `majReseau`, `feedForward`, dan `appliquerLesBoutons`. Kalau kita menonaktifkan satu saja, Mario tidak bergerak lagi.

### Crossover

```lua
function crossover(unReseau1, unReseau2)
    local leReseau = newReseau()
    local leBon = unReseau1
    local leNul = unReseau2

    if leBon.fitness < leNul.fitness then
        leBon = unReseau2
        leNul = unReseau1
    end

    leReseau = copier(leBon)

    for i = 1, #leReseau.lesConnexions, 1 do
        for j = 1, #leNul.lesConnexions, 1 do
            if leReseau.lesConnexions[i].innovation == leNul.lesConnexions[j].innovation
               and leNul.lesConnexions[j].actif then
                if math.random() > 0.5 then
                    leReseau.lesConnexions[i] = leNul.lesConnexions[j]
                end
            end
        end
    end
    leReseau.fitness = 1
    return leReseau
end
```

Bayi mewarisi orang tua terbaik. Untuk setiap koneksi yang berbagi inovasi yang sama, orang tua lain punya peluang 50% menggantikannya -- tapi **hanya kalau koneksinya aktif**. Ini perbaikan penting : tanpanya, neuron tersembunyi yang tidak berguna bisa tercipta.

### Seleksi berdasar spesies

```lua
function nouvelleGeneration(laPopulation, lesEspeces)
    local laNouvellePopulation = newPopulation()
    local nbIndividuACreer = NB_INDIVIDU_POPULATION

    -- Menghitung fitness rata-rata per spesies
    for i = 1, #lesEspeces, 1 do
        lesEspeces[i].fitnessMoyenne = 0
        for j = 1, #lesEspeces[i].lesReseaux, 1 do
            lesEspeces[i].fitnessMoyenne =
                lesEspeces[i].fitnessMoyenne + lesEspeces[i].lesReseaux[j].fitness
        end
        lesEspeces[i].fitnessMoyenne =
            lesEspeces[i].fitnessMoyenne / #lesEspeces[i].lesReseaux
    end

    -- Setiap spesies membuat sejumlah anak proporsional dengan fitness rata-ratanya
    for i = 1, #lesEspeces, 1 do
        local nbEnfant = math.ceil(
            #lesEspeces[i].lesReseaux *
            lesEspeces[i].fitnessMoyenne / fitnessMoyenneGlobal)

        for j = 1, nbEnfant, 1 do
            local unReseau = crossover(
                choisirParent(lesEspeces[i].lesReseaux),
                choisirParent(lesEspeces[i].lesReseaux))
            mutation(unReseau)
            laNouvellePopulation[indiceNouvelleEspece] = copier(unReseau)
        end
    end
end
```

Idenya : spesies dengan fitness rata-rata 10 000 berhak membuat jauh lebih banyak anak daripada spesies dengan fitness rata-rata 1. Inilah **seleksi alam** beraksi.

`choisirParent` memakai seleksi roulette : makin tinggi fitness individu, makin besar peluangnya dipilih sebagai orang tua.

### Penyimpanan dan pemuatan

Populasi disimpan dalam berkas `.pop` :

```lua
function sauvegarderUnReseau(unReseau, fichier)
    io.write(unReseau.nbNeurone .. "\n")
    io.write(#unReseau.lesConnexions .. "\n")
    io.write(unReseau.fitness .. "\n")
    for i = 1, unReseau.nbNeurone, 1 do
        local indice = NB_INPUT + NB_OUTPUT + i
        io.write(unReseau.lesNeurones[indice].id .. "\n")
    end
    for i = 1, #unReseau.lesConnexions, 1 do
        local actif = 1
        if unReseau.lesConnexions[i].actif ~= true then actif = 0 end
        io.write(actif .. "\n" ..
            unReseau.lesConnexions[i].entree .. "\n" ..
            unReseau.lesConnexions[i].sortie .. "\n" ..
            unReseau.lesConnexions[i].poids .. "\n" ..
            unReseau.lesConnexions[i].innovation .. "\n")
    end
end
```

Penyimpanan juga menyertakan individu terbaik dari semua populasi sebelumnya. Kalau yang terbaik dari populasi lama lebih baik daripada yang terbaik dari yang baru, kita mengambil yang lama sebagai dasar. Ini bentuk **elitisme** : kita tidak pernah kehilangan yang terbaik.

### Penggambaran jaringan

Laupok menambahkan visualisator jaringan saraf yang melapisi permainan :

```lua
function dessinerUnReseau(unReseau)
    -- Input : kisi 11×9 di sekitar Mario
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            local xT = ENCRAGE_X_INPUT + (i - 1) * TAILLE_INPUT
            local yT = ENCRAGE_Y_INPUT + (j - 1) * TAILLE_INPUT
            local couleurFond = "gray"
            if unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur < 0 then
                couleurFond = "black"   -- musuh
            elseif unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur > 0 then
                couleurFond = "white"   -- blok
            end
            gui.drawRectangle(xT, yT, TAILLE_INPUT, TAILLE_INPUT, "black", couleurFond)
        end
    end

    -- Output : 8 tombol
    for i = 1, NB_OUTPUT, 1 do
        local xT = ENCRAGE_X_OUTPUT
        local yT = ENCRAGE_Y_OUTPUT + ESPACE_Y_OUTPUT * (i - 1)
        if sigmoid(unReseau.lesNeurones[i + NB_INPUT].valeur) then
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "white")
        else
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "black")
        end
    end

    -- Koneksi
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            local alpha = 25
            if unReseau.lesConnexions[i].allume then alpha = 255 end
            local couleur = forms.createcolor(255, 255, 255, alpha)
            gui.drawLine(
                lesPositions[unReseau.lesConnexions[i].entree].x,
                lesPositions[lesConnexions[i].entree].y,
                lesPositions[unReseau.lesConnexions[i].sortie].x,
                lesPositions[lesConnexions[i].sortie].y,
                couleur)
        end
    end
end
```

Ini sangat berguna untuk memahami apa yang dilakukan jaringan. Koneksi aktif berwarna putih, yang tidak aktif semi-transparan. Input adalah kisi petak putih/hitam/abu-abu. Output menunjukkan tombol mana yang ditekan.

---

## Hasilnya

### Apa yang dipelajari AI

Sepanjang jam (dan hari) berjalan, AI menemukan sendiri :

1. **Maju ke kanan** : perilaku paling dasar, tapi membutuhkan menahan tombol Kanan ditekan
2. **Melompati musuh** : dengan menghubungkan input "musuh terdeteksi" ke tombol A atau B
3. **Menghindari rintangan** : beberapa jaringan belajar mundur sementara untuk maju lebih baik
4. **Menyelesaikan level** : individu terbaik bisa menyelesaikan level pertama Super Mario World

![Mario yang dikendalikan AI menghadapi Boo di level Super Mario World -- jaringan saraf memutuskan aksi waktu nyata](/images/laupok-mario-ai/mario-ai-playing.jpg)

### Keterbatasan

Proyek punya batasnya :

- **Satu level saja** : AI dilatih pada satu level spesifik. Ia tidak menggeneralisasi otomatis ke level lain
- **Waktu pelatihan** : butuh puluhan jam untuk mencapai hasil yang memuaskan
- **Tanpa pemahaman** : AI tidak "memahami" apa yang dilakukannya. Ia mengoptimalkan fungsi fitness (jarak ditempuh) lewat mutasi acak
- **T-bagging** : Laupok mencatat Mario cenderung melompat di tempat ketika melihat musuh, hanya karena itu meningkatkan fitness (ia maju sedikit sambil melompat)

---

## Cara mereproduksi pengalaman

Laupok membagikan semuanya. Berikut langkahnya :

1. **Unduh BizHawk** di [tasvideos.org](https://tasvideos.org/BizHawk) (bagian Download)
2. **Dapatkan ROM USA Super Mario World** (salinan privat dari kartridmu sendiri)
3. **Unduh skrip Lua** dari [Pastebin](https://pastebin.com/Jcvdqhqm) -- ganti nama menjadi `mario.lua`
4. **Taruh skrip di folder yang sama dengan ROM**
5. **Jalankan BizHawk**, buka ROM
6. **Di konsol Lua** : `dofile("mario.lua")` atau lewat menu Script > Open Script
7. **Simpan state** di awal level (menu Savestate > Save State) dan namai `debut.state`
8. **Jalankan ulang skrip** -- berhasil

Skrip menyertakan formulir dengan opsi :
- **Mempercepat** : menonaktifkan batas 30 fps untuk melaju lebih cepat
- **Menampilkan jaringan** : menunjukkan jaringan saraf yang melapisi
- **Menampilkan info** : menampilkan spanduk dengan generasi, fitness, jumlah spesies
- **Jeda** : menjeda eksekusi
- **Simpan/Muat** : menyimpan populasi saat ini dalam berkas `.pop`

---

## Sumber dan referensi

| Sumber daya | Tautan |
|-----------|------|
| Video utama Laupok | [j'ai créé une IA qui joue à mario toute seule](https://www.youtube.com/watch?v=F63GNXGHVwM) |
| Video code review + setup | [comment setup l'ia + code source review](https://www.youtube.com/watch?v=u5xCl1bSe6o) |
| Kode sumber lengkap | [Pastebin Jcvdqhqm](https://pastebin.com/Jcvdqhqm) |
| Artikel asli NEAT | Stanley & Miikkulainen, "Evolving Neural Networks through Augmenting Topologies", 2002 |
| Tutorial N8Programs | [NEAT implementation walkthrough](https://n8programs.github.io/) (JavaScript, tapi konsepnya identik) |
| 16blings (inspirasi Laupok) | [AI plays Super Mario World](https://www.youtube.com/watch?v=qv6IFaOz3bA) |
| BizHawk | [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) |
| Memori Super Mario World | [SMW Central - RAM Map](https://www.smwcentral.net/?p=section&a=details&id=21702) |

---

## Kesimpulan

Apa yang dilakukan Laupok adalah mengambil algoritma akademis (NEAT, 2002), menulisnya ulang dalam Lua untuk emulator (BizHawk), dan menerapkannya pada Super Mario World. Hasilnya : AI yang belajar dari nol memainkan permainan, tanpa pengetahuan sebelumnya apa pun, hanya lewat mutasi acak dan seleksi alam.

Ini contoh indah kekuatan algoritma genetika. Resepnya muat dalam tiga bahan : seleksi alam, sedikit Lua, dan banyak kesabaran. Tanpa deep learning, tanpa GPU, tanpa data pelatihan masif.

Kodenya dikomentari, dibagikan, dan Laupok membuat dua video penjelasan -- satu untuk konsep besar, satu untuk kode. Kalau topik ini menarik buatmu, selami. Ini lebih mudah diakses daripada kelihatannya.
