---
title: "Laupok kendi kendine Super Mario World oynayan bir yapay zekâ yarattı, nasıl çalışıyor"

date: 2026-07-11
tags:
  - ai
  - lua
  - emulation
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "ohJdJHnH6oUUEnKYyqhN4VRbZFxhsoyrxFrwUJNYDRBMk7zoJJc3xmP9dFFGXeOFFOgulaAwCd2MAk39lCZeKw=="
---

# Laupok kendi kendine Super Mario World oynayan bir yapay zekâ yarattı, nasıl çalışıyor

Laupok **Super Mario World** oyununu tamamen özerk oynayan bir yapay zekâ yarattı. Sıfırdan başlar: önceden tanımlı script yok, kaydedilmiş kare yok. Yapay zekâ rastgele mutasyonlar ve doğal seçilim darbeleriyle oyunun seviyelerini bitirmeyi kendi kendine öğrenir. Proje çok platformlu bir emülatör olan **BizHawk** üzerinde yaklaşık **4200 satırlık** bir Lua scriptiyle döner.

Bu projeyi büyüleyici yapan şey biyolojik kavramların bilişime uygulanmasına dayanmasıdır: **Darwinin evrim teorisi**, **yapay sinir ağları** ve hepsinden önemlisi **NEAT** (NeuroEvolution of Augmenting Topologies) adlı belirli bir algoritma. Yapay zekâ başlangıçta oyun hakkında hiçbir şey bilmez. Rastgele aksiyonları test eder, binlerce kez başarısız olur ve yavaş yavaş ilerlemeyi, zıplamayı ve hayatta kalmayı anlar.

Bu makalede bütün bunları didikleyeceğiz: kavram kavram, kod satırı kod satırı.

![Laupok kameranın önünde NEAT algoritmasını tanıtıyor](/images/laupok-mario-ai/neat-title.jpg)

---

## Kurulum: BizHawk, Lua ve Super Mario World

### BizHawk emülatörü

BizHawk bir sürü konsolu destekleyen açık kaynak bir emülatördür: NES, SNES, Genesis, PS1, Game Boy ve daha niceleri. Özelliği oyunla paralel **Lua scriptleri** çalıştırmaya izin vermesidir. Bu scriptler emülasyonun **RAM belleğine** erişir, yani oyunun herhangi bir verisini gerçek zamanlı okuyabilir ve değiştirebilir.

Somut olarak bu şu demektir:
- Seviyede Marionun konumu okunabilir
- Ekranda hangi spriteların (düşmanlar, eşyalar) olduğu bilinebilir
- Mario etrafındaki her karenin (blok) durumu bilinebilir
- Gamepad kontrol edilebilir: herhangi bir düğmeye basılabilir

Bir yapay zekâyı oynatmak için gereken tam olarak budur.

### Super Mario World bellek adresleri

Super Mario World RAMinde her veri belirli bir adreste saklanır. Biraz mahalle gibidir: her adres bir bilgi içeren bir "eve" karşılık gelir. Örneğin:

| Adres | Veri |
|---------|--------|
| `0x94`-`0x95` | Marionun X konumu (16 bit, little-endian) |
| `0x96`-`0x97` | Marionun Y konumu |
| `0x14C8`+`i` | `i` spritının durumu (>7 = canlı) |
| `0xE4`+`i` | `i` spritının düşük X konumu |
| `0x14E0`+`i` | `i` spritının yüksek X konumu |
| `0xD8`+`i` | `i` spritının düşük Y konumu |
| `0x14D4`+`i` | `i` spritının yüksek Y konumu |
| `0x170B`+`i` | `i` genişletilmiş spritının türü |
| `0x0100` | Oyun durumu (12 = seviye bitti) |
| `0x13D4` | Duraklatma aktif |
| `0x0071` | Marionun ölüm animasyonu (9 = ölü) |
| `0x1C800`+... | Seviyenin kare tablosu |

Spriteların konumu iki bayt kullanır: bir "düşük" bayt ve bir "yüksek" bayt, çünkü konum 255 pikseli aşabilir. Formül hep `düşük + yüksek × 256` şeklindedir.

Kareler için daha karmaşıktır: taban adres `0x1C800`dür ve ofset dünyada karenin `x` ve `y` koordinatlarına göre, kare başına 16 piksel adımla hesaplanır.

![Sprit bellek adreslerini ve Marionun konumunu gösteren hata ayıklama katmanlı Super Mario World](/images/laupok-mario-ai/memory-debug.jpg)

---

## Temeller: genetik algoritmalar ve sinir ağları

Koda dalmadan önce iki temel kavramı anlamak gerekir. Onlar olmadan gerisi anlamsızdır.

### Genetik algoritmalar

Bir genetik algoritma **evrim teorisinin** bir simülasyonudur. Merkez fikir: her biri biraz farklı özellikli ("gen") **popülasyon** yaratılır. Bir ortamda "yaşatılır". En iyi idare edenler hayatta kalır ve ürer. Kötü idare edenler kaybolur.

Laupok bunu bir **Kirby** benzetmesiyle gösterir:
- Dikenler ve domateslerle bir arazide bir Kirby popülasyonu belirir
- Dikenler can puanı götürür, domatesler geri verir
- Her Kirbynin genleri vardır: boyut, hız, can puanı, davranış (kaçmak, domates aramak, her yere dalmak)

!["bebek", "boyut", "hız", "renk" etiketli çift sarmal DNA: bir bireyi oluşturan genler](/images/laupok-mario-ai/dna-genes.jpg)

- 15 saniye sonra kimin en uzun hayatta kaldığına bakılır
- En iyi Kirby diğerleriyle ürer: bebekler en iyinin genlerinin yarısını ve "en kötünün" yarısını kalıtır
- Bebekler rastgele **mutasyonlara** uğrar (biraz daha büyük, biraz daha hızlı...)
- Eski Kirbyler yenileriyle değiştirilir
- Yeniden başlatılır

180 nesil (~15 saat) sonra Kirbyler 15 saniyelik hayatta kalmadan **15 dakikaya** geçer. Küçüldüler (azalmış çarpışma bölgesi), hızlandılar ve tehlikeden sürekli kaçarlar.

![Simülasyon Kirby nesil 0: siyah fonda rastgele dağılmış renkli daireler, hepsi benzer boyutta](/images/laupok-mario-ai/kirby-gen0.jpg)

![Simülasyon Kirby nesil 1866: Kirbyler daha küçük, daha hızlı ve tehlikelerden sistematik kaçar](/images/laupok-mario-ai/kirby-gen1866.jpg)

![Kirby simülasyonu istatistikleri: performansa göre sınıflanmış her bireyin fitness, can puanı sayısı, davranışı](/images/laupok-mario-ai/kirby-stats.jpg)

Kritik nokta: **çözümü tanımlamayız**. Algoritma onu **kendi kendine bulur**. Ve onu hangi parametre kombinasyonunun optimal olacağını bilmediğimiz problemler için güçlü yapan tam olarak budur.

### Yapay sinir ağları

Bir sinir ağı insan beyninin basitleştirilmiş matematiksel bir modelidir. Şunlardan oluşur:
- **Girdi nöronları** (inputs): ağın "gördüğü"
- **Çıktı nöronları** (outputs): ağın "karar verdiği"
- **Bağlantılar** (ağırlıklar): her bağlantının sinyali güçlendiren ya da zayıflatan bir **ağırlığı** vardır

İlke basittir: her girdi nöronu değerini gönderir. Bağlantının ağırlığıyla çarpılır, sonra diğer sinyallerle toplanır. Sonuç belli bir eşiği aşarsa (**aktivasyon fonksiyonu**) çıktı nöronu etkinleşir.

Mario ve farenin ucuyla Laupok benzetmesinde:
- Girdi nöronu = Mario ile uç arasındaki mesafe
- Bağlantının ağırlığı = Marionun hassasiyeti
- Çıktı nöronu = Mario bağırır ya da bağırmaz

Uç ne kadar yakınsa girdi değeri o kadar yüksek olur. Ağırlık güçlüyse çıktıya gönderilen sinyal güçlüdür ve Mario bağırırdı. Ağırlığı değiştirerek Marionun hassasiyeti değiştirilir.

!["Mario korkuyor" demosu: sinaps çubuğuyla girdi ve çıktı arasındaki bağlantının ağırlığını gösteren bir Boo karşısında Mario](/images/laupok-mario-ai/mario-fear-demo.jpg)

Yapay zekânın gerçek sinir ağında aynı mantıktır ama devasa ölçekte:
- **99 girdi nöronu** (Marionun görüşünün 11×9 karesi)
- **8 çıktı nöronu** (A, B, X, Y, Yukarı, Aşağı, Sol, Sağ)
- Arada **gizli nöronlar** (hidden)
- Çeşitli ağırlıklı yüzlerce bağlantı

---

## NEAT: her şeyi değiştiren algoritma

### Klasik genetik algoritmaların sorunu

Bir genetik algoritmayı naif şekilde bir sinir ağıyla birleştirirsek bir sorunumuz olur: tamamen farklı 100 sinir ağı yaratırız ve onları karşılaştırmayı bilmeyiz. Her birinin kendi nöronları, kendi bağlantıları, kendi ağırlıkları vardır. İki ağın "yakın" mı "uzak" mı olduğu nereden bilinir?

**NEAT**: NeuroEvolution of Augmenting Topologies devreye girdiği yer burasıdır. 2002de **Kenneth Stanley** ve **Risto Miikkulainen** tarafından icat edilmiş, tam bu sorunu çözen bir algoritmadır.

### Türler

NEATin ilk kilit mekanizması **türlerdir**. Bir sinir ağı diğerinden çok farklılaştığında farklı bir türe sınıflanır. Benzerlik üç parametreyle hesaplanır:

1. **Excess** (`EXCES_COEF = 0.50`): iki ağ arasında hiç ilişkisi olmayan bağlantıların sayısı (farklı inovasyonlar)
2. **Disjoint**: aynısı ama ortada yer alan bağlantılar için
3. **Ağırlık farkı** (`POIDSDIFF_COEF = 0.92`): aynı inovasyonu paylaşan bağlantılar arasındaki ortalama ağırlık farkı

Skor formülü:

```
score = (EXCES_COEF × disjoint) / max(nbConnexions1 + nbConnexions2, 1)
      + POIDSDIFF_COEF × diffPoids
```

Bu skor `DIFF_LIMITE` (1.0) değerinden düşükse iki ağ aynı türdedir. Yoksa yeni bir tür oluşturulur.

### İnovasyonlar

NEATin dehası budur. Bir bağlantı her oluşturulduğunda benzersiz ve global bir **inovasyon** numarası alır. Bu numara sinir ağını ürediğinde bile izler.

Somut olarak çaprazlamayla bir bebek yaratıldığında ebeveynlerinin inovasyonlarını kalıtır. İki ağ aynı inovasyonu paylaşıyorsa aynı atadan gelen bir bağlantıları olduğu demektir. Farklı boyutlardaki ağları karşılaştırmaya izin veren budur.

### Çaprazlama

İki sinir ağı ürediğinde **çaprazlama** şöyle çalışır:

![Laupok "CROSSOVER" metni bindirmeli çaprazlama kavramını açıklıyor](/images/laupok-mario-ai/crossover-label.jpg)

1. En performanslı ağ "baskın ebeveyn" olur
2. Bebek baskının tüm bağlantılarını kalıtır
3. Aynı inovasyonu paylaşan her bağlantı için diğer ebeveyn onun yerine geçebilir (%50 şans)
4. Yalnızca baskın olmayanın aktif bağlantıları yer değiştirebilir

Bu bebeğin hep en iyi ebeveyn kadar iyi olmasını garanti eder.

### Mutasyonlar

Çaprazlamadan sonra bebek yapılandırılabilir olasılıklarla mutasyonlara uğrar:

![Laupok "(küçük değişiklik = mutasyon)" metni bindirmeli mutasyonları açıklıyor](/images/laupok-mario-ai/mutation-label.jpg)

| Mutasyon | Olasılık | Etki |
|----------|------------|-------|
| Bağlantı ağırlığı sıfırlama | %25 | Ağırlık tamamen rastgelelenir |
| Ağırlık mutasyonu | %95 | Ağırlık ±0,80 değişir |
| Bağlantı ekleme | %85 | Henüz bağlı olmayan iki nöron arasında yeni bağlantı |
| Nöron ekleme | %39 | Bağlı iki nöron arasına gizli bir nöron yerleştirilir |

Nöron ekleme hızı önemlidir: ağın **büyümesine** izin veren budur. Başlangıçta yalnızca girdiler ve çıktılar vardır. Yavaş yavaş gizli nöronlar belirir, ağı gittikçe karmaşıklaştırır.

---

## Kod: eksiksiz izlenecek yol

### Sabitler

Script her şeyi tanımlayan bir sabit bloğuyla başlar:

```lua
-- Marionun etrafındaki görüşü
TAILLE_TILE = 16
TAILLE_VUE_W = TAILLE_TILE * 11  -- genişlikte 176 piksel
TAILLE_VUE_H = TAILLE_TILE * 9   -- yükseklikte 144 piksel
NB_TILE_W = TAILLE_VUE_W / TAILLE_TILE  -- 11 kare
NB_TILE_H = TAILLE_VUE_H / TAILLE_TILE  -- 9 kare

-- Sinir ağı
NB_INPUT = NB_TILE_W * NB_TILE_H  -- 99 girdi (görünür kareler)
NB_OUTPUT = 8  -- A, B, X, Y, Yukarı, Aşağı, Sol, Sağ
NB_INDIVIDU_POPULATION = 100  -- popülasyon başına birey
NB_NEURONE_MAX = 100000  -- gizli nöron limiti

-- Fitness
FITNESS_LEVEL_FINI = 1000000  -- seviye bitince değer
NB_FRAME_RESET_BASE = 33  -- ilerlemesiz sıfırlamadan önce kareler
NB_FRAME_RESET_PROGRES = 300  -- ilerleme tespit edilirse kareler

-- Türler
EXCES_COEF = 0.50
POIDSDIFF_COEF = 0.92
DIFF_LIMITE = 1.00

-- Mutasyonlar
CHANCE_MUTATION_RESET_CONNEXION = 0.25
POIDS_CONNEXION_MUTATION_AJOUT = 0.80
CHANCE_MUTATION_POIDS = 0.95
CHANCE_MUTATION_CONNEXION = 0.85
CHANCE_MUTATION_NEURONE = 0.39
```

`NB_INPUT` 99dur çünkü Marionun görüşü 11×9 karedir. Her kare bir girdi nöronudur. Kare boşsa 0 değerindedir. Blურვasa 1 değerindedir. Düşmansa -1 değerindedir.

8 çıktı SNES gamepad düğmelerine karşılık gelir: A, B, X, Y, Yukarı, Aşağı, Sol, Sağ. Kararlarını özle sınırlamak için Start, Select, L ve R hariç tutulur.

### Veri yapıları

Script üç ana yapı tanımlar:

```lua
function newNeurone()
    local neurone = {}
    neurone.valeur = 0    -- nöronun mevcut değeri
    neurone.id = 0        -- benzersiz tanımlayıcı
    neurone.type = ""     -- "input", "output" ya da "hidden"
    return neurone
end

function newConnexion()
    local connexion = {}
    connexion.entree = 0     -- kaynak nöronun IDsi
    connexion.sortie = 0     -- hedef nöronun IDsi
    connexion.actif = true   -- gizli bir nöron yerleştirilirse devre dışı kalabilir
    connexion.poids = 0      -- bağlantının ağırlığı
    connexion.innovation = 0 -- benzersiz inovasyon numarası
    connexion.allume = false -- görüntü için: sinyal geçerse true
    return connexion
end

function newReseau()
    local reseau = {
        nbNeurone = 0,        -- gizli nöron sayısı
        fitness = 1,          -- performans (kat edilen mesafe)
        idEspeceParent = 0,   -- hangi türe ait
        lesNeurones = {},     -- nöron dizisi
        lesConnexions = {}    -- bağlantı dizisi
    }
    -- Girdilerle başlatma
    for j = 1, NB_INPUT, 1 do
        ajouterNeurone(reseau, j, "input", 1)
    end
    -- Sonra çıktılar
    for j = NB_INPUT + 1, NB_INPUT + NB_OUTPUT, 1 do
        ajouterNeurone(reseau, j, "output", 0)
    end
    return reseau
end
```

Başlangıçta her ağ yalnızca girdiler ve çıktılar içerir: gizli nöron yok, bağlantı yok. Gerekip gerekmediğine algoritma karar verecektir.

### Mutasyonlar ayrıntılı

#### Ağırlık mutasyonu

```lua
function mutationPoidsConnexions(unReseau)
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            if math.random() < CHANCE_MUTATION_RESET_CONNEXION then
                -- 25% : ağırlığın toplam sıfırlanması
                unReseau.lesConnexions[i].poids = genererPoids()
            else
                -- 75% : ±0.80 değişim
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

Başlangıç ağırlığı hep 1 ya da -1dir (`genererPoids()`). ±0,80 değişim onu negatif ve pozitif değerler arasında salındırabilir, bu da ağın davranışını kökten değiştirir.

#### Bağlantı ekleme

```lua
function mutationAjouterConnexion(unReseau)
    local liste = {}
    -- Nöron listesinin rastgelelenmesi
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
                -- Geçerli bağlantı: input→output, hidden→hidden, hidden→output
                if (n1.type == "input" and n2.type == "output") or
                   (n1.type == "hidden" and n2.type == "hidden") or
                   (n1.type == "hidden" and n2.type == "output") then
                    -- Zaten bir bağlantı olmadığını doğrula
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

Bir output bir inputa bağlanamaz (döngü yaratırdı) ve zaten bağlı iki nöron bağlanamaz. Rastgeleleme her seferinde farklı olasılıkları keşfetmeyi garanti eder.

#### Nöron ekleme

En ilginç mutasyon budur:

```lua
function mutationAjouterNeurone(unReseau)
    if #unReseau.lesConnexions == 0 then return nil end
    if unReseau.nbNeurone == NB_NEURONE_MAX then return nil end

    -- Bağlantıların rastgelelenmesi
    local listeRandom = {}
    for i = 1, #unReseau.lesConnexions, 1 do
        local pos = math.random(1, #listeRandom+1)
        table.insert(listeRandom, pos, i)
    end

    for i = 1, #listeRandom, 1 do
        if unReseau.lesConnexions[listeRandom[i]].actif then
            -- Mevcut bağlantıyı devre dışı bırak
            unReseau.lesConnexions[listeRandom[i]].actif = false
            unReseau.nbNeurone = unReseau.nbNeurone + 1
            local indice = unReseau.nbNeurone + NB_INPUT + NB_OUTPUT

            -- Gizli nöronu oluştur
            ajouterNeurone(unReseau, indice, "hidden", 1)

            -- Girdiyi gizli nörona bağla
            ajouterConnexion(unReseau,
                unReseau.lesConnexions[listeRandom[i]].entree,
                indice, genererPoids())

            -- Gizli nöronu çıktıya bağla
            ajouterConnexion(unReseau,
                indice,
                unReseau.lesConnexions[listeRandom[i]].sortie,
                genererPoids())
            break
        end
    end
end
```

Mekanizma: mevcut bir bağlantı alınır, **devre dışı bırakılır** ve ortaya gizli bir nöron yerleştirilir. Orijinal bağlantı iki yeni bağlantıyla değiştirilir: girdi→gizli ve gizli→çıktı. Bu araya bir anahtar sokmak için bir teli "kesmek" gibidir.

NEATi "augmenting topologies" yapan budur: ağ zamanla **büyür**. Basit başlar ve yalnızca gerekirse karmaşıklaşır.

### feedForward

Sinyalleri ağda yayan fonksiyondur:

```lua
function feedForward(unReseau)
    -- Çıktı nöronlarının sıfırlanması
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur = 0
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].allume = false
        end
    end

    -- Yayılım
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

Her aktif bağlantı `girdi_değeri × ağırlık` değerini çıktı nöronuna gönderir. Değer **birikimlidir** (toplanır). `allume` bayrağı sadece ağın görsel gösterimi içindir.

### Oyun belleğinin okunması

`getLesInputs()` fonksiyonu Super Mario World dünyasını ağın anlayabildiği verilere çevirendir:

```lua
function getLesInputs()
    local lesInputs = {}
    -- 0a başlatma (gri = hiçbir şey)
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            lesInputs[getIndiceLesInputs(i, j)] = 0
        end
    end

    -- Spritelar (düşmanlar) = -1 (siyah)
    local lesSprites = getLesSprites()
    for i = 1, #lesSprites, 1 do
        local input = convertirPositionPourInput(getLesSprites()[i])
        if input.x > 0 and input.x < (TAILLE_VUE_W / TAILLE_TILE) + 1 then
            lesInputs[getIndiceLesInputs(input.x, input.y)] = -1
        end
    end

    -- Kareler (bloklar) = karenin değeri (> 0 ise beyaz)
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

Girdi ızgarası Mario merkezli bir görünümdür: genişlikte 11 kare, yükseklikte 9. Her kare değeri:
- **0** (gri): hiçbir şey
- **1** (beyaz): katı blok
- **-1** (siyah): düşman

Düşmanlar RAMdeki iki listeden okunur: normal spritelar (`0x14C8`-`0x14F8`) ve genişletilmiş spritelar (`0x170B`-`0x173B`). Her canlı sprite için (durum > 7) Marioya göre kare cinsinden konumu hesaplanır ve ilgili kutuya -1 konur.

### Fitness: yapay zekâ ilerlediğini nereden bilir

```lua
function majReseau(unReseau, marioBase)
    local mario = getPositionMario()

    if not niveauFini and memory.readbyte(0x0100) == 12 then
        -- Seviye bitti!
        unReseau.fitness = FITNESS_LEVEL_FINI
        niveauFini = true
    elseif marioBase.x < mario.x then
        -- Mario sağa ilerliyor
        unReseau.fitness = unReseau.fitness + (mario.x - marioBase.x)
        marioBase.x = mario.x
    end

    -- Girdilerin güncellenmesi
    local lesInputs = getLesInputs()
    for i = 1, NB_INPUT, 1 do
        unReseau.lesNeurones[i].valeur = lesInputs[i]
    end
end
```

Fitness basittir: **sağa kat edilen mesafedir**. Mario 10 piksel ilerlerse fitness 10 artar. Mario geri giderse hiçbir şey olmaz (ceza yok). Seviye biterse (adres `0x0100` == 12) fitness 1 000 000 olur.

Bu bilinçli basittir. Yalnızca sağa ilerleme sayılır: düşman öldürmek bir şey kazandırmaz, ölmek bir şeye mal olmaz.

### Akıllı sıfırlama

Mario 33 kare hareket etmezse seviyeyi sıfırlar ve sonraki bireye geçilir. Ama Mario ilerleme kaydettiyse (mevcut fitnessi baştakinden farklıysa) 300 kare beklenir: bu ağa iyi yaptığı şeyi "anlama" şansı verir.

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

`memory.readbyte(0x0071) ~= 9` koşulu Marionun ölüm animasyonunda olmadığını doğrular. Mario zaten ölüm animasyonundayken sıfırlama gereksiz olur.

### Ana döngü

Döngü 30 fps döner (Super Mario World normal hızı):

```lua
while true do
    local fitnessAvant = laPopulation[idPopulation].fitness

    -- Görüntüleme (ağ, bilgiler)
    if forms.ischecked(estAccelere) then
        emu.limitframerate(false)  -- hızlandır
    else
        emu.limitframerate(true)   -- 30 fps
    end

    -- 3 hayati fonksiyon
    majReseau(laPopulation[idPopulation], marioBase)
    feedForward(laPopulation[idPopulation])
    appliquerLesBoutons(laPopulation[idPopulation])

    emu.frameadvance()
    nbFrame = nbFrame + 1

    -- İlerleme yoksa sıfırla
    -- ...
    -- Tüm bireyler test edildiyse yeni nesil
    -- ...
end
```

Üç hayati fonksiyon `majReseau`, `feedForward` ve `appliquerLesBoutons` dur. Birini bile devre dışı bırakırsak Mario artık hareket etmez.

### Çaprazlama

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

Bebek en iyi ebeveyni kalıtır. Aynı inovasyonu paylaşan her bağlantı için diğer ebeveynin onun yerine geçme şansı %50dir: ama **yalnızca bağlantı aktifse**. Bu önemli bir düzeltmedir: o olmadan gereksiz gizli nöronlar yaratılabilirdi.

### Türlerle seçim

```lua
function nouvelleGeneration(laPopulation, lesEspeces)
    local laNouvellePopulation = newPopulation()
    local nbIndividuACreer = NB_INDIVIDU_POPULATION

    -- Tür başına ortalama fitness hesabı
    for i = 1, #lesEspeces, 1 do
        lesEspeces[i].fitnessMoyenne = 0
        for j = 1, #lesEspeces[i].lesReseaux, 1 do
            lesEspeces[i].fitnessMoyenne =
                lesEspeces[i].fitnessMoyenne + lesEspeces[i].lesReseaux[j].fitness
        end
        lesEspeces[i].fitnessMoyenne =
            lesEspeces[i].fitnessMoyenne / #lesEspeces[i].lesReseaux
    end

    -- Her tür ortalama fitnessiyle orantılı çocuk sayısı yaratır
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

Fikir: ortalama fitnessi 10 000 olan bir tür, ortalama fitnessi 1 olan bir türden çok daha fazla çocuk yaratma hakkına sahiptir. Harekete geçen **doğal seçilimdir**.

`choisirParent` rulet seçimi kullanır: bir bireyin fitnessi ne kadar yüksekse ebeveyn seçilme şansı o kadar artar.

### Kaydetme ve yükleme

Popülasyonlar `.pop` dosyalarına kaydedilir:

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

Kaydetme tüm önceki popülasyonların en iyi bireyini de içerir. Eski popülasyonun en iyisi yeninin en iyisinden iyiyse eski temel olarak alınır. Bu bir **elitizm** biçimidir: en iyi asla kaybedilmez.

### Ağın çizimi

Laupok oyunun üstüne sinir ağının bir görselleştiricisini ekledi:

```lua
function dessinerUnReseau(unReseau)
    -- Girdiler: Mario etrafında 11×9 ızgara
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            local xT = ENCRAGE_X_INPUT + (i - 1) * TAILLE_INPUT
            local yT = ENCRAGE_Y_INPUT + (j - 1) * TAILLE_INPUT
            local couleurFond = "gray"
            if unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur < 0 then
                couleurFond = "black"   -- düşman
            elseif unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur > 0 then
                couleurFond = "white"   -- blok
            end
            gui.drawRectangle(xT, yT, TAILLE_INPUT, TAILLE_INPUT, "black", couleurFond)
        end
    end

    -- Çıktılar: 8 düğme
    for i = 1, NB_OUTPUT, 1 do
        local xT = ENCRAGE_X_OUTPUT
        local yT = ENCRAGE_Y_OUTPUT + ESPACE_Y_OUTPUT * (i - 1)
        if sigmoid(unReseau.lesNeurones[i + NB_INPUT].valeur) then
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "white")
        else
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "black")
        end
    end

    -- Bağlantılar
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

Ağın ne yaptığını anlamak için süper kullanışlıdır. Aktif bağlantılar beyazdır, inaktifler yarı saydamdır. Girdiler beyaz/siyah/gri kutu ızgarasıdır. Çıktılar hangi düğmelerin basılı olduğunu gösterir.

---

## Sonuçlar

### Yapay zekânın öğrendikleri

Çalışmanın saatleri (ve günleri) boyunca yapay zekâ kendi kendine keşfetti:

1. **Sağa ilerlemek**: en temel davranış ama Sağ düğmeyi basılı tutmayı gerektirir
2. **Düşmanların üstünden zıplamak**: "düşman tespit edildi" girdisini A ya da B düğmesine bağlayarak
3. **Engellerden kaçınmak**: bazı ağlar daha iyi ilerlemek için geçici geri gitmeyi öğrendi
4. **Seviyeleri bitirmek**: en iyi birey Super Mario World ilk seviyesini bitirebildi

![Super Mario World bir seviyede bir Boo karşısında yapay zekâca kontrol edilen Mario: sinir ağı aksiyonları gerçek zamanlı kararlaştırır](/images/laupok-mario-ai/mario-ai-playing.jpg)

### Sınırlamalar

Projenin limitleri var:

- **Tek seviye**: yapay zekâ belirli tek bir seviyede eğitilir. Diğer seviyelere otomatik genellemez
- **Eğitim süresi**: tatmin edici sonuçlara ulaşmak için onlarca saat gerekir
- **Anlama yok**: yapay zekâ ne yaptığını "anlamaz". Rastgele mutasyonlarla bir fitness fonksiyonunu (kat edilen mesafe) optimize eder
- **T-bagging**: Laupok Marionun bir düşman görünce yerinde zıplama eğiliminde olduğunu not eder, sırf bu fitnessi artırdığı için (zıplayarak biraz ilerler)

---

## Deneyimi nasıl yeniden üretmeli

Laupok her şeyi paylaştı. İşte adımlar:

1. **BizHawkı indir** [tasvideos.org](https://tasvideos.org/BizHawk) üzerinden (Download bölümü)
2. **Super Mario World ABD ROMu edin** (kendi kartuşunun özel kopyası)
3. **Lua scriptini indir** [Pastebin](https://pastebin.com/Jcvdqhqm) üzerinden: `mario.lua` olarak yeniden adlandır
4. **Scripti ROM ile aynı klasöre yerleştir**
5. **BizHawkı çalıştır**, ROMu aç
6. **Lua konsolunda**: `dofile("mario.lua")` ya da Script > Open Script menüsüyle
7. Seviye başında bir **durum kaydet** (Savestate > Save State menüsü) ve `debut.state` olarak adlandır
8. **Scripti yeniden çalıştır**: çalışır

Script seçenekli bir form içerir:
- **Hızlandır**: daha hızlı gitmek için 30 fps limitini devre dışı bırakır
- **Ağı göster**: sinir ağını bindirmeli gösterir
- **Bilgileri göster**: nesil, fitness, tür sayısıyla bir şerit gösterir
- **Duraklat**: yürütmeyi duraklatır
- **Kaydet/Yükle**: mevcut popülasyonu bir `.pop` dosyasında saklar

---

## Kaynaklar ve referanslar

| Kaynak | Bağlantı |
|-----------|------|
| Laupok ana videosu | [j'ai créé une IA qui joue à mario toute seule](https://www.youtube.com/watch?v=F63GNXGHVwM) |
| Kod incelemesi + kurulum videosu | [comment setup l'ia + code source review](https://www.youtube.com/watch?v=u5xCl1bSe6o) |
| Tam kaynak kodu | [Pastebin Jcvdqhqm](https://pastebin.com/Jcvdqhqm) |
| NEAT orijinal makalesi | Stanley & Miikkulainen, "Evolving Neural Networks through Augmenting Topologies", 2002 |
| N8Programs öğreticisi | [NEAT implementation walkthrough](https://n8programs.github.io/) (JavaScript ama kavramlar aynı) |
| 16blings (Laupok ilhamı) | [AI plays Super Mario World](https://www.youtube.com/watch?v=qv6IFaOz3bA) |
| BizHawk | [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) |
| Super Mario World belleği | [SMW Central - RAM Map](https://www.smwcentral.net/?p=section&a=details&id=21702) |

---

## Sonuç

Laupokun yaptığı şey akademik bir algoritmayı (NEAT, 2002) alıp bir emülatör (BizHawk) için Luada yeniden yazmak ve Super Mario Worlde uygulamaktır. Sonuç: önceden bilgi olmadan, yalnızca rastgele mutasyonlar ve doğal seçilimle oyunu oynamayı sıfırdan öğrenen bir yapay zekâ.

Bu genetik algoritmaların gücünün muhteşem bir örneğidir. Tarif üç malzemeye sığar: doğal seçilim, biraz Lua ve çok sabır. Derin öğrenme yok, GPU yok, devasa eğitim verisi yok.

Kod yorumlu, paylaşılmış ve Laupok iki açıklayıcı video yapmış: biri büyük kavramlar, biri kod için. Konu ilgini çekerse dal içine. Göründüğünden daha erişilebilir.
