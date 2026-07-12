---
title: "Laupok membangun AI yang bermain Super Mario World sendiri -- bagaimana cara kerjanya"
description: "Penjelasan mendalam tentang proyek Laupok: AI berbasis NEAT yang belajar bermain Super Mario World secara otonom. Algoritma genetika, jaringan saraf tiruan, neuroevolution of augmenting topologies, dan 4200 baris Lua."
date: 2026-07-11
tags:
  - artificial-intelligence
  - lua
  - genetic-algorithm
  - neural-network
  - neat
  - emulation
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "iX3ZPJzm3MSsgbkzbGqDilEjwrG11UcCUOjgxtGlIxIPMTiU1fWhYYmSLtt30ejPBsVSckcW/3xbUdPGOJVDIQ=="
---

# Laupok membangun AI yang bermain Super Mario World sendiri -- bagaimana cara kerjanya

Laupok membangun kecerdasan buatan yang bermain **Super Mario World** sepenuhnya secara otonom. Tidak ada input yang sudah diatur sebelumnya, tidak ada frame yang direkam. AI itu belajar sendiri, melalui mutasi acak dan seleksi alam, untuk menyelesaikan level-level dalam permainan. Proyek ini berjalan di **BizHawk**, sebuah emulator multi-platform, melalui skrip Lua sekitar **4200 baris**.

Yang membuat proyek ini menarik adalah ia bergantung pada konsep biologi yang diterapkan pada komputasi: **teori evolusi** Darwin, **jaringan saraf tiruan**, dan yang paling penting sebuah algoritma spesifik yang disebut **NEAT** (NeuroEvolution of Augmenting Topologies). AI tidak tahu apa-apa tentang permainan di awal. Ia mencoba hal-hal acak, gagal ribuan kali, dan perlahan-lahan memahami cara bergerak, melompat, dan bertahan hidup.

Dalam artikel ini, kita akan membahas semuanya -- konsep per konsep, baris kode per baris kode.

![Laupok memperkenalkan algoritma NEAT di depan kamera](/images/laupok-mario-ai/neat-title.jpg)

---

## Pengaturan: BizHawk, Lua, dan Super Mario World

### Emulator BizHawk

BizHawk adalah sebuah emulator sumber terbuka yang mendukung banyak konsol -- NES, SNES, Genesis, PS1, Game Boy, dan masih banyak lagi. Fitur utamanya adalah ia dapat menjalankan **skrip Lua** bersamaan dengan permainan. Skrip-skrip ini memiliki akses ke **RAM** (random access memory) emulator, artinya mereka dapat membaca -- dan memodifikasi -- data permainan apa pun secara real-time.

Secara konkret, ini berarti Anda dapat:
- Membaca posisi Mario di dalam level
- Mengetahui sprite (musuh, item) mana yang ada di layar
- Mengetahui keadaan setiap tile (blok) di sekitar Mario
- Mengontrol pengontrol -- menekan tombol apa pun

Ini persis yang Anda butuhkan untuk membuat AI bermain.

### Alamat memori Super Mario World

Di RAM Super Mario World, setiap data disimpan di alamat tertentu. Seperti sebuah lingkungan perumahan: setiap alamat sesuai dengan sebuah "rumah" yang berisi satu informasi. Contohnya:

| Alamat | Data |
|--------|------|
| `0x94`-`0x95` | Posisi X Mario (16-bit, little-endian) |
| `0x96`-`0x97` | Posisi Y Mario |
| `0x14C8`+`i` | Status sprite `i` (>7 = hidup) |
| `0xE4`+`i` | Posisi X rendah sprite `i` |
| `0x14E0`+`i` | Posisi X tinggi sprite `i` |
| `0xD8`+`i` | Posisi Y rendah sprite `i` |
| `0x14D4`+`i` | Posisi Y tinggi sprite `i` |
| `0x170B`+`i` | Tipe sprite ekstensi `i` |
| `0x0100` | Status permainan (12 = level selesai) |
| `0x13D4` | Jeda aktif |
| `0x0071` | Animasi kematian Mario (9 = mati) |
| `0x1C800`+... | Tabel tile level |

Posisi sprite menggunakan dua byte: byte "rendah" dan byte "tinggi", karena posisi bisa melebihi 255 piksel. Rumusnya selalu `rendah + tinggi × 256`.

Untuk tile lebih kompleks: alamat dasarnya adalah `0x1C800`, dan Anda menghitung offset berdasarkan koordinat `x` dan `y` tile di dunia, dengan langkah 16 piksel per tile.

![Super Mario World dengan overlay debug yang menunjukkan alamat memori sprite dan posisi Mario](/images/laupok-mario-ai/memory-debug.jpg)

---

## Dasar-dasar: algoritma genetika dan jaringan saraf tiruan

Sebelum menyelam ke dalam kode, Anda perlu memahami dua konsep fundamental. Tanpa keduanya, tidak ada yang lain yang masuk akal.

### Algoritma genetika

Algoritma genetika adalah simulasi dari **teori evolusi**. Ide intinya: Anda membuat sebuah **populasi** individu, masing-masing dengan karakteristik yang sedikit berbeda ("gen"). Anda membiarkan mereka "hidup" di lingkungan tertentu. Mereka yang paling bertahan hidup akan berkembang biak. Mereka yang berkinerja buruk akan punah.

Laupok mengilustrasikan hal ini dengan analogi **Kirby**:
- Sebuah populasi Kirby muncul di medan dengan paku dan tomat
- Paku mengurangi poin HP, tomat mengembalikannya
- Setiap Kirby memiliki gen: ukuran, kecepatan, HP, perilaku (lari, mencari tomat, berlari membabi buta)

![DNA double helix dengan label "the baby", "size", "speed", "color" -- gen-gen yang membentuk sebuah individu](/images/laupok-mario-ai/dna-genes.jpg)

- Setelah 15 detik, Anda memeriksa siapa yang bertahan paling lama
- Kirby terbaik berkembang biak dengan yang lain: bayi mewarisi setengah gen terbaik dan setengah gen "terburuk"
- Bayi mengalami **mutasi** acak (sedikit lebih besar, sedikit lebih cepat...)
- Kirby lama digantikan oleh yang baru
- Anda mengulangi prosesnya

Setelah 180 generasi (~15 jam), Kirby berubah dari 15 detik bertahan hidup menjadi **15 menit**. Mereka menjadi kecil (hitbox lebih kecil), cepat, dan terus-menerus menghindari bahaya.

![Simulasi Kirby generasi 0: lingkaran warna-warni tersebar acak di latar belakang hitam, semuanya berukuran serupa](/images/laupok-mario-ai/kirby-gen0.jpg)

![Simulasi Kirby generasi 1866: Kirby lebih kecil, lebih cepat, dan secara sistematis menghindari bahaya](/images/laupok-mario-ai/kirby-gen1866.jpg)

![Statistik simulasi Kirby: fitness, HP, perilaku setiap individu yang diurutkan berdasarkan kinerja](/images/laupok-mario-ai/kirby-stats.jpg)

Poin pentingnya: **Anda tidak menentukan solusi**. Algoritma **menemukannya sendiri**. Dan itulah yang membuatnya sangat kuat untuk masalah di mana Anda tidak tahu kombinasi parameter optimal yang seharusnya.

### Jaringan saraf tiruan

Jaringan saraf tiruan adalah model matematika yang disederhanakan dari otak manusia. Jaringan ini terdiri dari:
- **Neuron masukan**: apa yang "dilihat" jaringan
- **Neuron keluaran**: apa yang "diputuskan" jaringan
- **Koneksi (bobot)**: setiap koneksi memiliki **bobot** yang memperkuat atau melemahkan sinyal

Prinsipnya sederhana: setiap neuron masukan mengirimkan nilainya. Nilai tersebut dikalikan dengan bobot koneksi, kemudian ditambahkan dengan sinyal lain. Jika hasilnya melebihi ambang tertentu (**fungsi aktivasi**), neuron keluaran aktif.

Dalam analogi Laupok tentang Mario dan kursor mouse:
- Neuron masukan = jarak antara Mario dan kursor
- Bobot koneksi = sensitivitas Mario
- Neuron keluaran = Mario berteriak atau tidak

Semakin dekat kursor, semakin tinggi nilai masukan. Jika bobotnya kuat, sinyal keluaran kuat, dan Mario akan berteriak. Dengan mengubah bobot, Anda mengubah sensitivitas Mario.

![Demo "Mario takut": Mario menghadapi Boo dengan bar sinapse yang menunjukkan bobot koneksi antara masukan dan keluaran](/images/laupok-mario-ai/mario-fear-demo.jpg)

Di jaringan saraf AI yang sebenarnya, logikanya sama, tapi dalam skala masif:
- **99 neuron masukan** (tampilan Mario 11×9 tile)
- **8 neuron keluaran** (A, B, X, Y, Atas, Bawah, Kiri, Kanan)
- **Neuron tersembunyi** di antara mereka
- Ratusan koneksi dengan bobot yang berbeda-beda

---

## NEAT: algoritma yang mengubah segalanya

### Masalah dengan algoritma genetika dasar

Jika Anda menggabungkan algoritma genetika dengan jaringan saraf secara sederhana, Anda punya masalah: Anda membuat 100 jaringan saraf yang sepenuhnya berbeda, dan Anda tidak bisa membandingkannya. Masing-masing memiliki neuron, koneksi, dan bobotnya sendiri. Bagaimana Anda mengetahui apakah dua jaringan "mirip" atau "berbeda"?

Di sinilah **NEAT** berperan -- NeuroEvolution of Augmenting Topologies. Ditemukan oleh **Kenneth Stanley** dan **Risto Miikkulainen** pada tahun 2002, NEAT menyelesaikan masalah ini.

### Spesies

Mekanisme kunci pertama NEAT adalah **spesies**. Ketika sebuah jaringan saraf terlalu berbeda dari yang lain, jaringan tersebut diklasifikasikan ke spesies yang berbeda. Kekmirian dihitung melalui tiga parameter:

1. **Kelebihan** (`EXCES_COEF = 0.50`): jumlah koneksi yang tidak memiliki kesamaan antara dua jaringan (inovasi berbeda)
2. **Tidak sejajar**: sama, tetapi untuk koneksi di tengah
3. **Perbedaan bobot** (`POIDSDIFF_COEF = 0.92`): rata-rata perbedaan bobot antara koneksi yang memiliki inovasi sama

Rumus skor:

```
score = (EXCES_COEF × disjoint) / max(nbConnexions1 + nbConnexions2, 1)
      + POIDSDIFF_COEF × diffPoids
```

Jika skor ini di bawah `DIFF_LIMITE` (1.0), kedua jaringan berada dalam spesies yang sama. Jika tidak, spesies baru dibuat.

### Inovasi

Ini adalah kejeniusan NEAT. Setiap kali sebuah koneksi dibuat, koneksi tersebut menerima nomor **inovasi** unik dan global. Nomor ini mengikuti jaringan saraf bahkan ketika jaringan tersebut bereproduksi.

Secara konkret, ketika bayi dibuat melalui crossover, bayi tersebut mewarisi inovasi dari orang tuanya. Jika dua jaringan memiliki inovasi yang sama, artinya mereka memiliki koneksi dari nenek moyang yang sama. Inilah yang memungkinkan perbandingan jaringan dengan ukuran berbeda.

### Crossover

Ketika dua jaringan saraf bereproduksi, **crossover** bekerja sebagai berikut:

![Laupok menjelaskan konsep crossover dengan teks "CROSSOVER" yang ditampilkan](/images/laupok-mario-ai/crossover-label.jpg)

1. Jaringan dengan kinerja lebih baik menjadi "induk dominan"
2. Bayi mewarisi semua koneksi dari induk dominan
3. Untuk setiap koneksi yang memiliki inovasi sama, induk lainnya dapat menggantinya (peluang 50%)
4. Hanya koneksi aktif dari induk non-dominan yang dapat menggantikan

Ini menjamin bayi selalu setidaknya sebaik induk terbaik.

### Mutasi

Setelah crossover, bayi mengalami mutasi dengan probabilitas yang dapat dikonfigurasi:

![Laupok menjelaskan mutasi dengan teks "(small modif = mutation)" yang ditampilkan](/images/laupok-mario-ai/mutation-label.jpg)

| Mutasi | Probabilitas | Efek |
|--------|-------------|------|
| Atur ulang bobot koneksi | 25% | Bobot diacak sepenuhnya |
| Mutasi bobot | 95% | Bobot bervariasi ±0.80 |
| Tambah koneksi | 85% | Koneksi baru antara dua neuron yang belum terhubung |
| Tambah neuron | 39% | Sebuah neuron tersembunyi disisipkan antara dua neuron yang terhubung |

Tingkat penambahan neuron penting: inilah yang memungkinkan jaringan untuk **tumbuh**. Pada awalnya, hanya ada masukan dan keluaran. Secara bertahap, neuron tersembunyi muncul, membuat jaringan semakin kompleks.

---

## Kode: penjelasan lengkap

### Konstanta

Skrip dimulai dengan blok konstanta yang mendefinisikan semua pengaturan:

```lua
-- Mario's view around him
TAILLE_TILE = 16
TAILLE_VUE_W = TAILLE_TILE * 11  -- 176 pixels wide
TAILLE_VUE_H = TAILLE_TILE * 9   -- 144 pixels tall
NB_TILE_W = TAILLE_VUE_W / TAILLE_TILE  -- 11 tiles
NB_TILE_H = TAILLE_VUE_H / TAILLE_TILE  -- 9 tiles

-- Neural network
NB_INPUT = NB_TILE_W * NB_TILE_H  -- 99 inputs (visible tiles)
NB_OUTPUT = 8  -- A, B, X, Y, Up, Down, Left, Right
NB_INDIVIDU_POPULATION = 100  -- individuals per population
NB_NEURONE_MAX = 100000  -- max hidden neurons

-- Fitness
FITNESS_LEVEL_FINI = 1000000  -- value when level is finished
NB_FRAME_RESET_BASE = 33  -- frames without progress before reset
NB_FRAME_RESET_PROGRES = 300  -- frames if progress detected

-- Species
EXCES_COEF = 0.50
POIDSDIFF_COEF = 0.92
DIFF_LIMITE = 1.00

-- Mutations
CHANCE_MUTATION_RESET_CONNEXION = 0.25
POIDS_CONNEXION_MUTATION_AJOUT = 0.80
CHANCE_MUTATION_POIDS = 0.95
CHANCE_MUTATION_CONNEXION = 0.85
CHANCE_MUTATION_NEURONE = 0.39
```

`NB_INPUT` adalah 99 karena tampilan Mario adalah 11×9 tile. Setiap tile adalah sebuah neuron masukan. Tile kosong = 0. Blok = 1. Musuh = -1.

8 keluaran sesuai dengan tombol pengontrol SNES: A, B, X, Y, Atas, Bawah, Kiri, Kanan. Start, Select, L dan R dikecualikan agar tidak "mengalihkan perhatian" Mario.

### Struktur data

Skrip mendefinisikan tiga struktur utama:

```lua
function newNeurone()
    local neurone = {}
    neurone.valeur = 0    -- current neuron value
    neurone.id = 0        -- unique identifier
    neurone.type = ""     -- "input", "output", or "hidden"
    return neurone
end

function newConnexion()
    local connexion = {}
    connexion.entree = 0     -- source neuron ID
    connexion.sortie = 0     -- destination neuron ID
    connexion.actif = true   -- can be disabled if a hidden neuron is inserted
    connexion.poids = 0      -- connection weight
    connexion.innovation = 0 -- unique innovation number
    connexion.allume = false -- for display: true if signal passes
    return connexion
end

function newReseau()
    local reseau = {
        nbNeurone = 0,        -- number of hidden neurons
        fitness = 1,          -- performance (distance traveled)
        idEspeceParent = 0,   -- which species it belongs to
        lesNeurones = {},     -- neuron array
        lesConnexions = {}    -- connection array
    }
    -- Initialize with inputs
    for j = 1, NB_INPUT, 1 do
        ajouterNeurone(reseau, j, "input", 1)
    end
    -- Then outputs
    for j = NB_INPUT + 1, NB_INPUT + NB_OUTPUT, 1 do
        ajouterNeurone(reseau, j, "output", 0)
    end
    return reseau
end
```

Pada awalnya, setiap jaringan hanya memiliki masukan dan keluaran. Tidak ada neuron tersembunyi, tidak ada koneksi. Algoritma yang memutuskan apakah ada yang dibutuhkan.

### Mutasi secara detail

#### Mutasi bobot

```lua
function mutationPoidsConnexions(unReseau)
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            if math.random() < CHANCE_MUTATION_RESET_CONNEXION then
                -- 25%: total weight reset
                unReseau.lesConnexions[i].poids = genererPoids()
            else
                -- 75%: variation of ±0.80
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

Bobot awal selalu 1 atau -1 (`genererPoids()`). Variasi ±0.80 dapat menggeser bobot antara nilai negatif dan positif, mengubah perilaku jaringan secara radikal.

#### Menambahkan koneksi

```lua
function mutationAjouterConnexion(unReseau)
    local liste = {}
    -- Shuffle the neuron list
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
                -- Valid connection: input→output, hidden→hidden, hidden→output
                if (n1.type == "input" and n2.type == "output") or
                   (n1.type == "hidden" and n2.type == "hidden") or
                   (n1.type == "hidden" and n2.type == "output") then
                    -- Check no connection already exists
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

Anda tidak bisa menghubungkan keluaran ke masukan (itu akan membuat siklus), dan Anda tidak bisa menghubungkan dua neuron yang sudah terhubung. Pengacakan menjamin kemungkinan yang berbeda dijelajahi setiap kali.

#### Menambahkan neuron

Ini adalah mutasi yang paling menarik:

```lua
function mutationAjouterNeurone(unReseau)
    if #unReseau.lesConnexions == 0 then return nil end
    if unReseau.nbNeurone == NB_NEURONE_MAX then return nil end

    -- Shuffle connections
    local listeRandom = {}
    for i = 1, #unReseau.lesConnexions, 1 do
        local pos = math.random(1, #listeRandom+1)
        table.insert(listeRandom, pos, i)
    end

    for i = 1, #listeRandom, 1 do
        if unReseau.lesConnexions[listeRandom[i]].actif then
            -- Disable the existing connection
            unReseau.lesConnexions[listeRandom[i]].actif = false
            unReseau.nbNeurone = unReseau.nbNeurone + 1
            local indice = unReseau.nbNeurone + NB_INPUT + NB_OUTPUT

            -- Create the hidden neuron
            ajouterNeurone(unReseau, indice, "hidden", 1)

            -- Connect input to hidden neuron
            ajouterConnexion(unReseau,
                unReseau.lesConnexions[listeRandom[i]].entree,
                indice, genererPoids())

            -- Connect hidden neuron to output
            ajouterConnexion(unReseau,
                indice,
                unReseau.lesConnexions[listeRandom[i]].sortie,
                genererPoids())
            break
        end
    end
end
```

Mekanismenya: Anda mengambil koneksi yang ada, **menonaktifkannya**, dan menyisipkan neuron tersembunyi di tengahnya. Koneksi asli digantikan oleh dua koneksi baru: masukan→tersembunyi dan tersembunyi→keluaran. Seperti memotong kabel untuk menyambungkan sakelar.

Inilah yang membuat NEAT menjadi "augmenting topologies": jaringan **tumbuh** seiring waktu. Jaringan dimulai dengan sederhana dan menjadi kompleks hanya ketika diperlukan.

### FeedForward

Ini adalah fungsi yang menyebarkan sinyal melalui jaringan:

```lua
function feedForward(unReseau)
    -- Reset output neurons
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur = 0
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].allume = false
        end
    end

    -- Propagation
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

Setiap koneksi aktif mengirimkan `nilai_masukan × bobot` ke neuron keluaran. Nilai tersebut **diakumulasikan** (ditambahkan). Flag `allume` hanya untuk tampilan jaringan visual.

### Membaca memori permainan

Fungsi `getLesInputs()` menerjemahkan dunia Super Mario World menjadi data yang dapat dipahami jaringan:

```lua
function getLesInputs()
    local lesInputs = {}
    -- Initialize to 0 (gray = nothing)
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            lesInputs[getIndiceLesInputs(i, j)] = 0
        end
    end

    -- Sprites (enemies) = -1 (black)
    local lesSprites = getLesSprites()
    for i = 1, #lesSprites, 1 do
        local input = convertirPositionPourInput(getLesSprites()[i])
        if input.x > 0 and input.x < (TAILLE_VUE_W / TAILLE_TILE) + 1 then
            lesInputs[getIndiceLesInputs(input.x, input.y)] = -1
        end
    end

    -- Tiles (blocks) = tile value (white if > 0)
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

Grid masukan adalah tampilan yang terpusat pada Mario: 11 tile lebar, 9 tile tinggi. Nilai setiap tile:
- **0** (abu-abu): kosong
- **1** (putih): blok padat
- **-1** (hitam): musuh

Musuh dibaca dari dua daftar di RAM: sprite normal (`0x14C8`-`0x14F8`) dan sprite ekstensi (`0x170B`-`0x173B`). Untuk setiap sprite yang hidup (status > 7), posisi tile relatif Mario dihitung dan -1 ditempatkan di sel yang sesuai.

### Fitness: bagaimana AI mengetahui bahwa ia sedang berkembang

```lua
function majReseau(unReseau, marioBase)
    local mario = getPositionMario()

    if not niveauFini and memory.readbyte(0x0100) == 12 then
        -- Level finished!
        unReseau.fitness = FITNESS_LEVEL_FINI
        niveauFini = true
    elseif marioBase.x < mario.x then
        -- Mario moved right
        unReseau.fitness = unReseau.fitness + (mario.x - marioBase.x)
        marioBase.x = mario.x
    end

    -- Update inputs
    local lesInputs = getLesInputs()
    for i = 1, NB_INPUT, 1 do
        unReseau.lesNeurones[i].valeur = lesInputs[i]
    end
end
```

Fitness sederhana: itu adalah **jarak yang ditempuh ke kanan**. Jika Mario bergerak 10 piksel, fitness meningkat sebesar 10. Jika Mario bergerak ke kiri, tidak terjadi apa-apa (tidak ada penalti). Jika level selesai (alamat `0x0100` == 12), fitness menjadi 1.000.000.

Ini sengaja dibuat sederhana. Tidak ada bonus untuk membunuh musuh, tidak ada penalti untuk mati. Cukup: bergerak ke kanan.

### Reset cerdas

Jika Mario tidak bergerak selama 33 frame, level direset dan kita pindah ke individu berikutnya. Tetapi jika Mario membuat kemajuan (fitness saat ini berbeda dari awal), kita menunggu 300 frame -- memberikan jaringan kesempatan untuk "memahami" apa yang dilakukannya dengan benar.

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

Kondisi `memory.readbyte(0x0071) ~= 9` memeriksa bahwa Mario tidak sedang dalam animasi kematian. Tidak ada gunanya mereset jika Mario sudah mati.

### Loop utama

Loop berjalan di 30 fps (kecepatan normal Super Mario World):

```lua
while true do
    local fitnessAvant = laPopulation[idPopulation].fitness

    -- Display (network, info)
    if forms.ischecked(estAccelere) then
        emu.limitframerate(false)  -- speed up
    else
        emu.limitframerate(true)   -- 30 fps
    end

    -- The 3 vital functions
    majReseau(laPopulation[idPopulation], marioBase)
    feedForward(laPopulation[idPopulation])
    appliquerLesBoutons(laPopulation[idPopulation])

    emu.frameadvance()
    nbFrame = nbFrame + 1

    -- Reset if no progress
    -- ...
    -- New generation if all individuals tested
    -- ...
end
```

Tiga fungsi vital adalah `majReseau`, `feedForward`, dan `appliquerLesBoutons`. Menonaktifkan salah satu dari mereka akan membuat Mario berhenti bergerak.

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

Bayi mewarisi dari induk yang lebih baik. Untuk setiap koneksi yang memiliki inovasi sama, induk lainnya memiliki peluang 50% untuk menggantinya -- tetapi **hanya jika koneksi tersebut aktif**. Ini adalah perbaikan penting: tanpanya, neuron tersembunyi yang tidak berguna bisa dibuat.

### Seleksi spesies

```lua
function nouvelleGeneration(laPopulation, lesEspeces)
    local laNouvellePopulation = newPopulation()
    local nbIndividuACreer = NB_INDIVIDU_POPULATION

    -- Calculate average fitness per species
    for i = 1, #lesEspeces, 1 do
        lesEspeces[i].fitnessMoyenne = 0
        for j = 1, #lesEspeces[i].lesReseaux, 1 do
            lesEspeces[i].fitnessMoyenne =
                lesEspeces[i].fitnessMoyenne + lesEspeces[i].lesReseaux[j].fitness
        end
        lesEspeces[i].fitnessMoyenne =
            lesEspeces[i].fitnessMoyenne / #lesEspeces[i].lesReseaux
    end

    -- Each species creates a number of children proportional to its average fitness
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

Idenya: spesies dengan rata-rata fitness 10.000 akan menciptakan lebih banyak anak daripada spesies dengan rata-rata fitness 1. Ini adalah **seleksi alam** dalam aksi.

`choisirParent` menggunakan seleksi roda roulette: semakin tinggi fitness seseorang, semakin besar kemungkinan ia dipilih sebagai induk.

### Menyimpan dan memuat

Populasi disimpan ke file `.pop`:

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

Penyimpanan juga mencakup individu terbaik dari semua populasi sebelumnya. Jika yang terbaik dari populasi lama lebih baik dari yang baru, kita mengembalikan yang lama sebagai dasar. Ini adalah bentuk **elitisme**: yang terbaik tidak akan pernah hilang.

### Visualisasi jaringan

Laupok menambahkan visualisator jaringan saraf yang ditampilkan di atas permainan:

```lua
function dessinerUnReseau(unReseau)
    -- Inputs: 11×9 grid around Mario
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            local xT = ENCRAGE_X_INPUT + (i - 1) * TAILLE_INPUT
            local yT = ENCRAGE_Y_INPUT + (j - 1) * TAILLE_INPUT
            local couleurFond = "gray"
            if unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur < 0 then
                couleurFond = "black"   -- enemy
            elseif unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur > 0 then
                couleurFond = "white"   -- block
            end
            gui.drawRectangle(xT, yT, TAILLE_INPUT, TAILLE_INPUT, "black", couleurFond)
        end
    end

    -- Outputs: 8 buttons
    for i = 1, NB_OUTPUT, 1 do
        local xT = ENCRAGE_X_OUTPUT
        local yT = ENCRAGE_Y_OUTPUT + ESPACE_Y_OUTPUT * (i - 1)
        if sigmoid(unReseau.lesNeurones[i + NB_INPUT].valeur) then
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "white")
        else
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "black")
        end
    end

    -- Connections
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

Ini sangat berguna untuk memahami apa yang dilakukan jaringan. Koneksi aktif berwarna putih, yang tidak aktif semi-transparan. Masukan berupa grid sel putih/hitam/abu-abu. Keluaran menunjukkan tombol mana yang ditekan.

---

## Hasil

### Apa yang dipelajari AI

Selama berjam-jam (dan berhari-hari) eksekusi, AI menemukan sendiri:

1. **Bergerak ke kanan**: perilaku paling dasar, tetapi yang memerlukan menahan tombol Kanan
2. **Melompati musuh**: dengan menghubungkan masukan "musuh terdeteksi" ke tombol A atau B
3. **Menghindari rintangan**: beberapa jaringan belajar untuk mundur sementara guna maju lebih jauh
4. **Menyelesaikan level**: individu terbaik mampu menyelesaikan level pertama Super Mario World

![Mario yang dikendalikan AI menghadapi Boo di level Super Mario World -- jaringan saraf memutuskan tindakan secara real-time](/images/laupok-mario-ai/mario-ai-playing.jpg)

### Keterbatasan

Proyek ini memiliki keterbatasannya:

- **Level tunggal**: AI dilatih pada satu level tertentu. Ia tidak secara otomatis dapat digeneralisasikan ke level lain
- **Waktu pelatihan**: diperlukan puluhan jam untuk mencapai hasil yang memuaskan
- **Tidak ada pemahaman**: AI tidak "memahami" apa yang dilakukannya. Ia mengoptimalkan fungsi fitness (jarak yang ditempuh) melalui mutasi acak
- **T-bagging**: Laupok mencatat Mario cenderung melompat di tempat ketika melihat musuh, cukup karena hal itu meningkatkan fitness (ia maju sedikit saat melompat)

---

## Cara mereproduksi eksperimen

Laupok membagikan semuanya. Berikut langkah-langkahnya:

1. **Unduh BizHawk** dari [tasvideos.org](https://tasvideos.org/BizHawk) (bagian Download)
2. **Dapatkan ROM USA Super Mario World** (salinan pribadi dari kartrid milik Anda sendiri)
3. **Unduh skrip Lua** dari [Pastebin](https://pastebin.com/Jcvdqhqm) -- ubah namanya menjadi `mario.lua`
4. **Tempatkan skrip di folder yang sama dengan ROM**
5. **Luncurkan BizHawk**, buka ROM
6. **Di konsol Lua**: `dofile("mario.lua")` atau melalui menu Script > Open Script
7. **Simpan state** di awal level (menu Savestate > Save State) dan beri nama `debut.state`
8. **Luncurkan ulang skrip** -- skrip akan bekerja

Skrip menyertakan formulir dengan opsi:
- **Accelerate**: menonaktifkan batasan 30 fps untuk berjalan lebih cepat
- **Show network**: menampilkan jaringan saraf di atas permainan
- **Show info**: menampilkan banner dengan generasi, fitness, dan jumlah spesies
- **Pause**: menjeda eksekusi
- **Save/Load**: menyimpan populasi saat ini ke file `.pop`

---

## Sumber dan referensi

| Sumber | Tautan |
|--------|--------|
| Video utama Laupok | [I built an AI that plays Mario by itself](https://www.youtube.com/watch?v=F63GNXGHVwM) |
| Ulasan kode + video pengaturan | [How to set up the AI + source code review](https://www.youtube.com/watch?v=u5xCl1bSe6o) |
| Kode sumber lengkap | [Pastebin Jcvdqhqm](https://pastebin.com/Jcvdqhqm) |
| Makalah NEAT asli | Stanley & Miikkulainen, "Evolving Neural Networks through Augmenting Topologies", 2002 |
| Tutorial N8Programs | [NEAT implementation walkthrough](https://n8programs.github.io/) (JavaScript, tetapi konsepnya identik) |
| 16blings (inspirasi Laupok) | [AI plays Super Mario World](https://www.youtube.com/watch?v=qv6IFaOz3bA) |
| BizHawk | [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) |
| Memori Super Mario World | [SMW Central - RAM Map](https://www.smwcentral.net/?p=section&a=details&id=21702) |

---

## Kesimpulan

Yang dilakukan Laupok adalah mengambil algoritma akademis (NEAT, 2002), menulisnya ulang dalam Lua untuk sebuah emulator (BizHawk), dan menerapkannya pada Super Mario World. Hasilnya: AI yang belajar dari nol untuk memainkan permainan tersebut, tanpa pengetahuan sebelumnya, hanya melalui mutasi acak dan seleksi alam.

Ini adalah contoh indah dari kekuatan algoritma genetika. Tidak ada deep learning, tidak ada GPU, tidak ada jutaan data latih. Hanya seleksi alam, sedikit Lua, dan banyak kesabaran.

Kode dikomentari, dibagikan, dan Laupok membuat dua video penjelasan -- satu untuk konsep-konsep besar, satu untuk kode. Jika topik ini menarik bagi Anda, selami. Ini lebih mudah diakses dari yang terlihat.
