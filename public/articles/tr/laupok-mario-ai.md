---
title: "Laupok, Super Mario World'ü kendi başına oynayan bir yapay zeka oluşturdu -- nasıl çalışıyor"
description: "Laupok'un projesinin detaylı bir analizi: Super Mario World'ü bağımsız olarak oynamayı öğrenen bir NEAT tabanlı yapay zeka. Genetik algoritmalar, sinir ağları, artırılmış topolojilerin nöroevrimi ve 4200 satırlık Lua kodu."
date: 2026-07-11
authors:
  - fox3000foxy
tags:
  - ai
  - lua
  - emulation
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "LbX0wknqLP0dy79NlSPlIFB0qzlt4BMU/Lv4InWBdYim3FLX4GAlNnELlzvMNRCDOvaS1xMGcctSMPdTFzHZ/g=="
---

# Laupok, Super Mario World'ü kendi başına oynayan bir yapay zeka oluşturdu -- nasıl çalışıyor

Laupok, **Super Mario World**'ü tamamen bağımsız olarak oynayan bir yapay zeka oluşturdu. Önceden programlanmış girdiler, kaydedilmiş kareler yok. Yapay zeka, rastgele mutasyonlar ve doğal seleksiyon aracılığıyla oyunun bölümlerini bitirmeyi kendi başına öğreniyor. Proje, yaklaşık **4200 satırlık** bir Lua betiği aracılığıyla **BizHawk** çoklu platform emülatöründe çalışır.

Bu projeyi büyüleyici kılan şey, bilişime uygulanan biyolojik kavramlara dayanmasıdır: Darwin'ın **evrim teorisi**, **yapay sinir ağları** ve en önemlisi **NEAT** (Artırılmış Topolojilerin Nöroevrimi) adlı belirli bir algoritmadır. Yapay zeka başlangıçta oyun hakkında hiçbir şey bilmez. Rastgele şeyler dener, binlerce kez başarısız olur ve yavaşça nasıl hareket edeceğini, zıplayacağını ve hayatta kalacağını çözer.

Bu makalede her şeyi kavram kavram, kod satırı kod satırı inceleyeceğiz.

![Laupok kamera karşısında NEAT algoritmasını anlatıyor](/images/laupok-mario-ai/neat-title.jpg)

---

## Kurulum: BizHawk, Lua ve Super Mario World

### BizHawk emülatörü

BizHawk, pek çok konsolu destekleyen açık kaynaklı bir emülatördür -- NES, SNES, Genesis, PS1, Game Boy ve daha fazlası. Ana özelliği, oyunla birlikte **Lua betikleri** çalıştırabilmesidir. Bu betikler emülasyonun **RAM'ine** (rastgele erişim belleği) erişebilir, yani herhangi bir oyun verisini gerçek zamanlı olarak okuyabilir --ve değiştirebilir.

Somut olarak, bu şunları yapabileceğiniz anlamına gelir:
- Mario'nun bölgedeki konumunu okuma
- Hangi sprite'ların (düşmanlar, eşyalar) ekranda olduğunu bilme
- Mario'nun etrafındaki her karonun (blok) durumunu bilme
- Kumandayı kontrol etme -- herhangi bir düğmeye basma

Bu, bir yapay zekanın oynaması için tam olarak ihtiyacınız olan şeydir.

### Super Mario World bellek adresleri

Super Mario World'ün RAM'inde, her veri parçası belirli bir adreste saklanır. Bir mahalle gibidir: her adres, içinde bir bilgi parçası barındıran bir "eve" karşılık gelir. Örneğin:

| Adres | Veri |
|-------|------|
| `0x94`-`0x95` | Mario'nun X konumu (16 bit, little-endian) |
| `0x96`-`0x97` | Mario'nun Y konumu |
| `0x14C8`+`i` | Sprite `i` durumu (>7 = yaşıyor) |
| `0xE4`+`i` | Sprite `i` düşük X konumu |
| `0x14E0`+`i` | Sprite `i` yüksek X konumu |
| `0xD8`+`i` | Sprite `i` düşük Y konumu |
| `0x14D4`+`i` | Sprite `i` yüksek Y konumu |
| `0x170B`+`i` | Genişletilmiş sprite `i` türü |
| `0x0100` | Oyun durumu (12 = bölüm tamamlandı) |
| `0x13D4` | Duraklatma aktif |
| `0x0071` | Mario'nun ölüm animasyonu (9 = öldü) |
| `0x1C800`+... | Bölüm karo tablosu |

Sprite konumları iki byte kullanır: bir "düşük" byte ve bir "yüksek" byte, çünkü konum 255 pikseli aşabilir. Formül her zaman `düşük + yüksek × 256` şeklindedir.

Karo için durum daha karmaşıktır: temel adres `0x1C800`'dür ve ofseti dünyanın `x` ve `y` koordinatlarına göre, karo başına 16 piksel adımıyla hesaplarsınız.

![Sprite bellek adreslerini ve Mario'nun konumunu gösteren hata ayıklama katmanlı görünümüyle Super Mario World](/images/laupok-mario-ai/memory-debug.jpg)

---

## Temeller: genetik algoritmalar ve sinir ağları

Koda dalmadan önce iki temel kavramı anlamanız gerekir. Bunlar olmadan diğer hiçbir şey mantıklı gelmez.

### Genetik algoritmalar

Genetik algoritma, **evrim teorisinin** bir simülasyonudur. Temel fikir: her biri biraz farklı özelliklere ("genlere") sahip bireylerden oluşan bir **popülasyon** oluşturursunuz. Onları bir ortamda "yaşamaya" bırakırsınız. En iyi performansı gösterenler hayatta kalır ve ürer. Kötü performans gösterenler yok olur.

Laupok bunu bir **Kirby** benzetmesiyle açıklar:
- Dikenli ve domatesli bir arazide Kirby'lerden oluşan bir popülasyon belirir
- Dikenler can puanlarını düşürür, domatesler geri kazandırır
- Her Kirby'nin genleri vardır: boyut, hız, can puanı, davranış (kaç, domates ara, körce koş)

![DNA çift sarmalı "the baby", "size", "speed", "color" etiketleriyle -- bir bireyi oluşturan genler](/images/laupok-mario-ai/dna-genes.jpg)

- 15 saniye sonra kimin en uzun süre hayatta kaldığına bakarsınız
- En iyi Kirby diğerleriyle çiftleşir: yavrular en iyi genlerin yarısını ve en kötü genlerin yarısını miras alır
- Yavrular rastgele **mutasyonlara** uğrar (biraz daha büyük, biraz daha hızlı...)
- Eski Kirby'ler yenileriyle değiştirilir
- Yeniden başlatırsınız

180 nesil sonra (~15 saat), Kirby'ler 15 saniyelik hayatta kalma süresinden **15 dakikaya** ulaştı. Küçükleştiler (düşük vuruş kutusu), hızlandılar ve sürekli tehlikeden kaçıyorlar.

![Kirby simülasyonu nesil 0: renkli daireler siyah arka planda rastgele dağılmış, boyut olarak benzer](/images/laupok-mario-ai/kirby-gen0.jpg)

![Kirby simülasyonu nesil 1866: Kirby'ler daha küçük, daha hızlı ve sistemli olarak tehlikeden kaçıyor](/images/laupok-mario-ai/kirby-gen1866.jpg)

![Kirby simülasyonu istatistikleri: performansa göre sıralanmış her bireyin uygunluk değeri, can puanı, davranışı](/images/laupok-mario-ai/kirby-stats.jpg)

En önemli nokta: **çözümü siz tanımlamıyorsunuz**. Algoritma **kendi başına bulur**. Ve bu, optimum parametre kombinasyonunun ne olacağını bilmediğiniz problemler için onu güçlü kılan şeydir.

### Yapay sinir ağları

Sinir ağları, insan beyninin basitleştirilmiş bir matematiksel modelidir. Şunlardan oluşur:
- **Girdi nöronları**: ağın "gördüğü"
- **Çıktı nöronları**: ağın "karar verdiği"
- **Bağlantılar (ağırlıklar)**: her bağlantının sinyali güçlendiren veya zayıflatan bir **ağırlığı** vardır

Prensip basittir: her girdi nöronu değerini gönderir. Bağlantı ağırlığıyla çarpılır, ardından diğer sinyallerle toplanır. Sonuç belirli bir eşiği ( **aktivasyon fonksiyonu** ) aşıyorsa, çıktı nöronu ateşlenir.

Laupok'un Mario ve fare imleciyle olan benzetmesinde:
- Girdi nöronu = Mario ile imleç arasındaki mesafe
- Bağlantı ağırlığı = Mario'nun hassasiyeti
- Çıktı nöronu = Mario bağırır veya bağarmaz

İleç ne kadar yakınsa, girdi değeri o kadar yüksek olur. Ağırlık güçlüyse, çıkış sinyali güçlüdür ve Mario bağırır. Ağırlığı değiştirerek Mario'nun hassasiyetini değiştirirsiniz.

![Mario korkuyor demosu: Mario bir Boo'ya bakıyor, girdi ile çıkış arasındaki bağlantı ağırlığını gösteren sinaptik çubukla](/images/laupok-mario-ai/mario-fear-demo.jpg)

Gerçek yapay zekanın sinir ağında aynı mantık vardır, ancak çok daha geniş bir ölçekte:
- **99 girdi nöronu** (Mario'nun görüşünün 11×9 karosu)
- **8 çıktı nöronu** (A, B, X, Y, Yukarı, Aşağı, Sol, Sağ)
- Aralarında **gizli nöronlar**
- Değişken ağırlıklara sahip yüzlerce bağlantı

---

## NEAT: her şeyi değiştiren algoritma

### Temel genetik algoritmaların sorunu

Bir genetik algoritmayı bir sinir ağıyla bilinçsizce birleştirirseniz, bir sorununuz olur: 100 tamamen farklı sinir ağı oluşturursunuz ve bunları karşılaştıramazsınız. Her birinin kendi nöronları, bağlantıları ve ağırlıkları vardır. İki ağın "benzer" mi yoksa "farklı" mı olduğunu nasıl anlarsınız?

İşte **NEAT** burada devreye girer -- Artırılmış Topolojilerin Nöroevrimi. **Kenneth Stanley** ve **Risto Miikkulainen** tarafından 2002'de icat edilen bu algoritma tam olarak bu sorunu çözer.

### Türler

NEAT'in birinci temel mekanizması **türler**dir. Bir sinir ağı diğerinden çok farklı olduğunda, farklı bir türe sınıflandırılır. Benzerlik üç parametre hesaplanarak belirlenir:

1. **Fazlalık** (`EXCES_COEF = 0.50`): iki ağ arasında hiçbir ortak noktası olmayan bağlantı sayısı (farklı yenilikler)
2. **Kesik**: aynı, ancak ortadaki bağlantılar için
3. **Ağırlık farkı** (`POIDSDIFF_COEF = 0.92`): aynı yeniliği paylaşan bağlantılar arasındaki ortalama ağırlık farkı

Puan formülü:

```
skor = (EXCES_COEF × kesik) / max(bağlantıSayısı1 + bağlantıSayısı2, 1)
     + POIDSDIFF_COEF × ağırlıkFarkı
```

Bu puan `DIFF_LIMITE`'ten (1.0) düşükse, iki ağ aynı türdedir. Aksi takdirde yeni bir tür oluşturulur.

### Yenilikler

Bu NEAT'in dehasıdır. Her bağlantı oluşturulduğunda, benzersiz, küresel bir **yenilik** numarası alır. Bu numara, ağ ürediğinde bile sinir ağıyla birlikte devam eder.

Somut olarak, çaprazlama yoluyla bir bebek oluşturulduğunda, ebeveynlerinin yeniliklerini miras alır. İki ağ aynı yeniliği paylaşıyorsa, aynı atadan geldikleri anlamına gelir. Bu, farklı boyutlardaki ağları karşılaştırmayı mümkün kılar.

### Çaprazlama

İki sinir ağı ürediğinde, **çaprazlama** şöyle çalışır:

![Laupok "ÇAPRAZLAMA" metniyle çaprazlama kavramını açıklıyor](/images/laupok-mario-ai/crossover-label.jpg)

1. Daha iyi performans gösteren ağ "baskın ebeveyn" olur
2. Bebek, baskın ebeveynin tüm bağlantılarını miras alır
3. Aynı yeniliği paylaşan her bağlantı için, diğer ebeveyn onu değiştirme şansına sahiptir (%50)
4. Yalnızca baskın olmayan ebeveynin aktif bağlantıları değiştirebilir

Bu, bebeğin her zaman en azından en iyi ebeveyn kadar iyi olmasını garanti eder.

### Mutasyonlar

Çaprazlamadan sonra, bebek yapılandırılabilir olasılıklarla mutasyonlara uğrar:

![Laupok "(küçük değişiklik = mutasyon)" metniyle mutasyonları açıklıyor](/images/laupok-mario-ai/mutation-label.jpg)

| Mutasyon | Olasılık | Etki |
|----------|----------|------|
| Bağlantı ağırlığını sıfırla | %25 | Ağırlık tamamen rastgele hale gelir |
| Ağırlık mutasyonu | %95 | Ağırlık ±0.80 oranında değişir |
| Bağlantı ekle | %85 | İki bağlı olmayan nöron arasında yeni bağlantı |
| Nöron ekle | %39 | İki bağlı nöron arasına bir gizli nöron eklenir |

Nöron ekleme oranı önemlidir: ağın **büyümesini** sağlayan şey budur. Başlangıçta yalnızca girdiler ve çıktılar vardır. Yavaş yavaş gizli nöronlar belirerek ağı gittikçe daha karmaşık hale getirir.

---

## Kod: tam kod incelemesi

### Sabitler

Betik, tüm ayarları tanımlayan bir sabit bloğuyla başlar:

```lua
-- Mario'nun etrafındaki görünüm
TAILLE_TILE = 16
TAILLE_VUE_W = TAILLE_TILE * 11  -- 176 piksel genişliğinde
TAILLE_VUE_H = TAILLE_TILE * 9   -- 144 piksel yüksekliğinde
NB_TILE_W = TAILLE_VUE_W / TAILLE_TILE  -- 11 karo
NB_TILE_H = TAILLE_VUE_H / TAILLE_TILE  -- 9 karo

-- Sinir ağı
NB_INPUT = NB_TILE_W * NB_TILE_H  -- 99 girdi (görünür karolar)
NB_OUTPUT = 8  -- A, B, X, Y, Yukarı, Aşağı, Sol, Sağ
NB_INDIVIDU_POPULATION = 100  -- popülasyon başına birey sayısı
NB_NEURONE_MAX = 100000  -- maksimum gizli nöron

-- Uygunluk
FITNESS_LEVEL_FINI = 1000000  -- bölüm tamamlandığında değer
NB_FRAME_RESET_BASE = 33  -- ilerleme olmadan sıfırlama için kare sayısı
NB_FRAME_RESET_PROGRES = 300  -- ilerleme tespit edilirse kare sayısı

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

`NB_INPUT` 99'dur çünkü Mario'nun görünümü 11×9 karodur. Her karo bir girdi nöronudur. Boş karo = 0. Blok = 1. Düşman = -1.

8 çıktı SNES kumandası düğmelerine karşılık gelir: A, B, X, Y, Yukarı, Aşağı, Sol, Sağ. Start, Select, L ve R Mario'yu "rahat bırakmayacakları" için hariç tutulmuştur.

### Veri yapıları

Betik üç ana yapı tanımlar:

```lua
function newNeurone()
    local neurone = {}
    neurone.valeur = 0    -- geçerli nöron değeri
    neurone.id = 0        -- benzersiz tanımlayıcı
    neurone.type = ""     -- "input", "output" veya "hidden"
    return neurone
end

function newConnexion()
    local connexion = {}
    connexion.entree = 0     -- kaynak nöron ID'si
    connexion.sortie = 0     -- hedef nöron ID'si
    connexion.actif = true   -- bir gizli nöron eklendiğinde devre dışı bırakılabilir
    connexion.poids = 0      -- bağlantı ağırlığı
    connexion.innovation = 0 -- benzersiz yenilik numarası
    connexion.allume = false -- görüntüleme için: sinyal geçiyorsa true
    return connexion
end

function newReseau()
    local reseau = {
        nbNeurone = 0,        -- gizli nöron sayısı
        fitness = 1,          -- performans (kat edilen mesafe)
        idEspeceParent = 0,   -- hangi türe ait olduğu
        lesNeurones = {},     -- nöron dizisi
        lesConnexions = {}    -- bağlantı dizisi
    }
    -- Girdiler ile başlatılır
    for j = 1, NB_INPUT, 1 do
        ajouterNeurone(reseau, j, "input", 1)
    end
    -- Ardından çıktılar
    for j = NB_INPUT + 1, NB_INPUT + NB_OUTPUT, 1 do
        ajouterNeurone(reseau, j, "output", 0)
    end
    return reseau
end
```

Başlangıçta her ağda yalnızca girdiler ve çıktılar vardır. Gizli nöron yok, bağlantı yok. Algoritma gerekli olup olmadığına karar verir.

### Mutasyonlar detaylı

#### Ağırlık mutasyonu

```lua
function mutationPoidsConnexions(unReseau)
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            if math.random() < CHANCE_MUTATION_RESET_CONNEXION then
                -- %25: toplam ağırlık sıfırlama
                unReseau.lesConnexions[i].poids = genererPoids()
            else
                -- %75: ±0.80 değişiklik
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

İlk ağırlık her zaman 1 veya -1'dir (`genererPoids()`). ±0.80 değişiklik, onu negatif ve pozitif değerler arasında sallandırarak ağın davranışını kökten değiştirebilir.

#### Bağlantı ekleme

```lua
function mutationAjouterConnexion(unReseau)
    local liste = {}
    -- Nöron listesini karıştır
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
                -- Geçerli bağlantı: girdi→çıktı, gizli→gizli, gizli→çıktı
                if (n1.type == "input" and n2.type == "output") or
                   (n1.type == "hidden" and n2.type == "hidden") or
                   (n1.type == "hidden" and n2.type == "output") then
                    -- Zaten bağlantı olup olmadığını kontrol et
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

Bir çıktıyı bir girdiye bağlayamazsınız (bu bir döngü oluşturur) ve zaten bağlı olan iki nöronu da bağlayamazsınız. Karıştırma, her seferinde farklı olasılıkların keşfedilmesini garanti eder.

#### Nöron ekleme

Bu en ilginç mutasyondur:

```lua
function mutationAjouterNeurone(unReseau)
    if #unReseau.lesConnexions == 0 then return nil end
    if unReseau.nbNeurone == NB_NEURONE_MAX then return nil end

    -- Bağlantıları karıştır
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

Mekanizma: mevcut bir bağlantıyı alırsınız, **devre dışı bırakırsınız** ve arasına bir gizli nöron eklersiniz. Orijinal bağlantı iki yeni bağlantı ile değiştirilir: girdi→gizli ve gizli→çıktı. Bir kabloyu kesip içine bir şalter eklemek gibidir.

Bu, NEAT'i "artırılmış topolojiler" yapan şeydir: ağ zaman içinde **büyür**. Basit başlar ve yalnızca gerektiğinde karmaşık hale gelir.

### FeedForward

Sinyalleri ağ boyunca ileten fonksiyondur:

```lua
function feedForward(unReseau)
    -- Çıktı nöronlarını sıfırla
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

Her aktif bağlantı, `girdi_değeri × ağırlık` değerini çıktı nöronuna gönderir. Değer **kümelenir** (toplanır). `allume` bayrağı yalnızca görsel ağ gösterimi içindir.

### Oyunun belleğini okuma

`getLesInputs()` fonksiyonu, Super Mario World'ün dünyasını ağın anlayabileceği verilere dönüştürür:

```lua
function getLesInputs()
    local lesInputs = {}
    -- 0'a başlat (gri = hiçbir şey)
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            lesInputs[getIndiceLesInputs(i, j)] = 0
        end
    end

    -- Sprite'lar (düşmanlar) = -1 (siyah)
    local lesSprites = getLesSprites()
    for i = 1, #lesSprites, 1 do
        local input = convertirPositionPourInput(getLesSprites()[i])
        if input.x > 0 and input.x < (TAILLE_VUE_W / TAILLE_TILE) + 1 then
            lesInputs[getIndiceLesInputs(input.x, input.y)] = -1
        end
    end

    -- Karolar (bloklar) = karo değeri (0'dan büyükse beyaz)
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

Girdi ızgarası Mario'ya merkezli bir görünümdür: 11 karo genişliğinde, 9 karo yüksekliğinde. Her karo değeri:
- **0** (gri): hiçbir şey
- **1** (beyaz): katı blok
- **-1** (siyah): düşman

Düşmanlar, RAM'deki iki listeden okunur: normal sprite'lar (`0x14C8`-`0x14F8`) ve genişletilmiş sprite'lar (`0x170B`-`0x173B`). Her yaşayan sprite için (durum > 7), Mario'ya göre karo konumu hesaplanır ve karşılık gelen hücreye -1 yerleştirilir.

### Uygunluk: yapay zeka ilerlediğini nasıl biliyor

```lua
function majReseau(unReseau, marioBase)
    local mario = getPositionMario()

    if not niveauFini and memory.readbyte(0x0100) == 12 then
        -- Bölüm tamamlandı!
        unReseau.fitness = FITNESS_LEVEL_FINI
        niveauFini = true
    elseif marioBase.x < mario.x then
        -- Mario sağa hareket etti
        unReseau.fitness = unReseau.fitness + (mario.x - marioBase.x)
        marioBase.x = mario.x
    end

    -- Girdileri güncelle
    local lesInputs = getLesInputs()
    for i = 1, NB_INPUT, 1 do
        unReseau.lesNeurones[i].valeur = lesInputs[i]
    end
end
```

Uygunluk basittir: **sağa kat edilen mesafe**dir. Mario 10 piksel hareket ederse, uygunluk 10 artar. Mario sola hareket ederse hiçbir şey olmaz (ceza yok). Bölüm tamamlanırsa (adres `0x0100` == 12), uygunluk 1.000.000 olur.

Bu kasıtlı olarak basittir. Düşman öldürme için bonus yok, ölüm için ceza yok. Sadece: sağa hareket et.

### Akıllı sıfırlama

Mario 33 kare boyunca hareket etmezse, bölüm sıfırlanır ve sonraki bireye geçilir. Ancak Mario ilerleme kaydettiyse (geçerli uygunluk başlangıçtan farklıysa), 300 kare bekleriz -- ağa neyi doğru yaptığını "anlama" şansı veririz.

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

`memory.readbyte(0x0071) ~= 9` koşulu, Mario'nun ölüm animasyonunda olmadığını kontrol eder. Mario zaten ölüyse sıfırlamanın bir anlamı yoktur.

### Ana döngü

Döngü saniyede 30 karede (Super Mario World'ün normal hızı) çalışır:

```lua
while true do
    local fitnessAvant = laPopulation[idPopulation].fitness

    -- Görüntüleme (ağ, bilgi)
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

Üç hayati fonksiyon `majReseau`, `feedForward` ve `appliquerLesBoutons`'tur. Bunlardan birini devre dışı bırakırsanız Mario hareket etmeyi durdurur.

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

Bebek daha iyi ebeveynden miras alır. Aynı yeniliği paylaşan her bağlantı için, diğer ebeveynin değiştirme şansı %50'dir -- ancak **bağlantı aktifse**. Bu önemli bir düzeltmedir: olmadan, işe yaramaz gizli nöronlar oluşturulabilirdi.

### Tür seçimi

```lua
function nouvelleGeneration(laPopulation, lesEspeces)
    local laNouvellePopulation = newPopulation()
    local nbIndividuACreer = NB_INDIVIDU_POPULATION

    -- Tür başına ortalama uygunluğu hesapla
    for i = 1, #lesEspeces, 1 do
        lesEspeces[i].fitnessMoyenne = 0
        for j = 1, #lesEspeces[i].lesReseaux, 1 do
            lesEspeces[i].fitnessMoyenne =
                lesEspeces[i].fitnessMoyenne + lesEspeces[i].lesReseaux[j].fitness
        end
        lesEspeces[i].fitnessMoyenne =
            lesEspeces[i].fitnessMoyenne / #lesEspeces[i].lesReseaux
    end

    -- Her tür ortalama uygunluğuna oranlı çocuk sayısı üretir
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

Fikir: ortalama uygunluğu 10.000 olan bir tür, ortalama uygunluğu 1 olan bir türden çok daha fazla çocuk üretir. Bu, **doğal seleksiyon**un pratikteki halidir.

`choisirParent`, rulet seçimini kullanır: bir bireyin uygunluğu ne kadar yüksekse, ebeveyn olarak seçilme olasılığı o kadar artar.

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

Kayıt, tüm önceki popülasyonlardaki en iyi bireyi de içerir. Eski popülasyonun en iyisi yeniden daha iyiyse, temel olarak geri döneriz. Bu bir **elitizm** biçimidir: en iyi asla kaybolmaz.

### Ağ görselleştirme

Laupok, oyun üzerine yerleştirilmiş bir sinir ağı görselleştiricisi ekledi:

```lua
function dessinerUnReseau(unReseau)
    -- Girdiler: Mario'nun etrafında 11×9 ızgara
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

Ne yaptığını anlamak için inanılmaz derecede faydalıdır. Aktif bağlantılar beyaz, etkin olmayanlar yarı saydamdır. Girdiler beyaz/siyah/gri hücrelerden oluşan bir ızgaradır. Çıktılar hangi düğmelere basıldığını gösterir.

---

## Sonuçlar

### Yapay zekanın öğrendikleri

Saatlerce (ve günlerce) süren çalıştırmalar boyunca, yapay zeka kendi başına şunları keşfetti:

1. **Sağa hareket et**: en temel davranış, ancak Sağ düğmesine basılı tutmayı gerektirir
2. **Düşmanların üstünden atla**: "düşman tespit edildi" girdisini A veya B düğmesine bağlayarak
3. **Engellerden kaçın**: bazı ağlar daha ileriye gitmek için geçici olarak geri çekilmeyi öğrendi
4. **Bölümleri tamamla**: en iyi birey Super Mario World'ün ilk bölümünü tamamlayabildi

![Yapay zeka tarafından kontrol edilen Mario bir Super Mario World bölümünde bir Boo'ya karşı -- sinir ağı gerçek zamanlı olarak kararlar veriyor](/images/laupok-mario-ai/mario-ai-playing.jpg)

### Sınırlamalar

Projenin sınırları var:

- **Tek bölüm**: yapay zeka belirli bir bölümde eğitilir. Otomatik olarak diğer bölümlere genelleşmez
- **Eğitim süresi**: tatmin edici sonuçlara ulaşmak için onlarca saat gerekir
- **Anlama yok**: yapay zeka ne yaptığını "anlamaz". Rastgele mutasyonlar aracılığıyla bir uygunluk fonksiyonunu (kat edilen mesafe) optimize eder
- **T-bagging**: Laupok, Mario'nun bir düşman gördüğünde yerinde zıplama eğiliminde olduğunu not eder, bunun yalnızca uygunluk artırdığı için (zıplarken biraz ilerler)

---

## Deneyi nasıl tekrarlayabilirsiniz

Laupok her şeyi paylaştı. Adımlar şunlardır:

1. **BizHawk'ı indirin** [tasvideos.org](https://tasvideos.org/BizHawk) adresinden (İndirme bölümü)
2. **Super Mario World'ün ABD ROM'unu edinin** (kendi kartınızdan kişisel kopya)
3. **Lua betiğini indirin** [Pastebin](https://pastebin.com/Jcvdqhqm) adresinden -- `mario.lua` olarak yeniden adlandırın
4. **Betigi ROM ile aynı klasöre yerleştirin**
5. **BizHawk'ı başlatın**, ROM'u açın
6. **Lua konsolunda**: `dofile("mario.lua")` veya Script > Open Script menüsü aracılığıyla
7. **Bölümün başlangıcında bir durum kaydedin** (Savestate > Save State menüsü) ve `debut.state` olarak adlandırın
8. **Betigi yeniden başlatın** -- çalışıyor

Betik seçeneklerle bir form içerir:
- **Hızlandır**: daha hızlı gitmek için 30 fps sınırını devre dışı bırakır
- **Ağı göster**: sinir ağını oyun üzerine yerleştirilmiş olarak görüntüler
- **Bilgiyi göster**: nesil, uygunluk ve tür sayısını gösteren bir banner görüntüler
- **Duraklat**: yürütmeyi duraklatır
- **Kaydet/Yükle**: geçerli popülasyonu bir `.pop` dosyasına kalıcı hale getirir

---

## Kaynaklar ve referanslar

| Kaynak | Bağlantı |
|--------|----------|
| Laupok'un ana videosu | [Kendi başına Mario oynayan bir yapay zeka oluşturdum](https://www.youtube.com/watch?v=F63GNXGHVwM) |
| Kod incelemesi + kurulum videosu | [Yapay zeka nasıl kurulur + kaynak kodu incelemesi](https://www.youtube.com/watch?v=u5xCl1bSe6o) |
| Tam kaynak kodu | [Pastebin Jcvdqhqm](https://pastebin.com/Jcvdqhqm) |
| Orijinal NEAT makalesi | Stanley & Miikkulainen, "Evolving Neural Networks through Augmenting Topologies", 2002 |
| N8Programs eğitimi | [NEAT uygulama incelemesi](https://n8programs.github.io/) (JavaScript, ancak kavramlar aynı) |
| 16blings (Laupok'un ilham kaynağı) | [Yapay zeka Super Mario World oynuyor](https://www.youtube.com/watch?v=qv6IFaOz3bA) |
| BizHawk | [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) |
| Super Mario World belleği | [SMW Central - RAM Haritası](https://www.smwcentral.net/?p=section&a=details&id=21702) |

---

## Sonuç

Laupok'un yaptığı şey, akademik bir algoritmayı (NEAT, 2002) alıp Lua için bir emülatöre (BizHawk) yeniden yazması ve Super Mario World'e uygulamasıdır. Sonuç: hiçbir ön bilgi olmadan, yalnızca rastgele mutasyonlar ve doğal seleksiyon aracılığıyla oyunu sıfırdan oynamayı öğrenen bir yapay zeka.

Genetik algoritmaların gücünün güzel bir örneği. Derin öğrenme yok, GPU yok, milyonlarca eğitim veri noktası yok. Sadece doğal seleksiyon, birkaç Lua kodu ve çok fazla sabır.

Kod yorumlanmış, paylaşılmış ve Laupok iki açıklayıcı video yapmış -- biri büyük kavramlar için, diğeri kod için. Konu ilginizi çekiyorsa, dalın. Göründüğünden çok daha erişilebilir.
