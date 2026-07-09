---
title: Yapay Zeka Minecraft PvP Öğreniyor -- Taklit Öğrenimi, Pekiştirmeli Öğrenme ve Önemli Olan 30 Değişken
description: "1.000 düello kaydedildi, pikseller üzerinde eğitilen sinir ağı, %90 tuş doğruluğu : ve bot bir duvara doğru koştu. Sonra RL, müfredat öğrenimi ve 60 saatlik eğitim geldi."
date: 2026-07-09
tags:
  - minecraft
  - ai
  - reinforcement-learning
  - imitation-learning
  - python
authors:
  - fox3000foxy
---

## Giriş

![AI Learns Minecraft PvP thumbnail](assets/ai-pvp-thumbnail.png)

Kadambi | AI Engineering tarafından [AI Learns Minecraft PvP (Reinforcement Learning + Behavior Cloning)](https://www.youtube.com/watch?v=j5nxDKAjg6U) adlı bir video var ve bu, bir oyun oynayan yapay zeka eğitimiyle ilgili gördüğüm en dürüst anlatımlardan biri.

Fikir: Ekranı izleyerek ve fare ile klavye komutları üreterek Minecraft PvP (kılıç kiti, tam büyülü elmas zırh) oynayan bir bot inşa etmek. Oyun belleğini okumak yok, makro yok, mod yok : sadece girişte pikseller, çıkışta eylemler.

Videoyu ilginç kılan nihai sonuç değil. Yolculuk: taklit öğreniminin başarısızlığı, feature engineering dönüşü, catastrophic forgetting döngüleri ve GPU'suz bir dizüstü bilgisayarda 60+ saatlik eğitim.

## Aşama 1 : Taklit Öğrenimi (başarısızlık)

![Taklit öğrenimi sırasında bot: bir duvara bakıyor, yukarı aşağı zıplıyor](assets/ai-pvp-imitation-fail.png)

Yaratıcı mantıklı bir yaklaşımla başladı: kendi oynayışının 1.000 düellosunu kaydetti, her fare tıklamasını ve tuş basışını ilgili kareyle eşledi ve piksellerden eylemleri tahmin etmek için bir sinir ağı eğitti.

```python
# Taklit öğrenimi hattı için sözde kod
dataset = record_duels(1000)          # yüz binlerce kare
for frame, action in dataset:
    pixels = capture_screen(frame)
    network.train(pixels → action)    # görüntüden klavye/fare tahmini
```

Ağ, tuşları **%90 doğrulukla** tahmin etmeyi öğrendi. Umut verici.

Sonra onu gerçek bir maçta test ettiler. Bot dosdoğru haritanın kenarına gitti, bir duvara döndü ve yukarı aşağı zıplamaya başladı.

Neden?

**Tembellik tuzağı.** Bir PvP dövüşünde W tuşu çoğu zaman basılıdır. Ağ, sadece W'yi basılı tutarak ve başka hiçbir şey yapmayarak yüksek doğruluk elde edebileceğini fark etti. Diğer tüm eylemler pahasına en yaygın eylem için optimize etti.

**İnsan gecikmesi.** Veri kümesindeki eylemler, ~200 ms'lik insan tepki süresi kadar gecikmelidir. Kare kare, neden ve sonuç, bir modelin ham piksellerden öğrenmesi neredeyse imkansızdır çünkü eylem ve görünür sonucu birden fazla kare ile ayrılmıştır.

**Tutarsız gösterimler.** Yaratıcının kendi oynayışı değişiyordu: bazen aynı durumlarda klavyeyle strafe yapıyor, bazen fareyle nişan alıyordu. Bu çelişkili girdi ağı şaşırttı.

## Aşama 2 : Müfredatla Pekiştirmeli Öğrenme

![RL eğitimi sırasında yatay olarak takip etmeyi öğrenen bot](assets/ai-pvp-rl-horizontal.png)

Taklit öğrenimini bırakan yaratıcı, RL'ye geçti. Ancak yeni bir ajanı tam bir PvP düellosuna sokmak işe yaramaz: rastgele keşfin bir şey bulması için aynı anda çok fazla şey oluyor.

Çözüm: **müfredat öğrenimi (curriculum learning)**. Her mekaniği ayırın ve botun gerçek bir dövüşe girmeden önce temel bilgileri öğrenmesine izin verin.

### Adım 1 : Yatay nişan (7 saat)

En basit ödül fonksiyonu: vuruş yapmak için pozitif ödül, hasar almak için negatif ceza.

Başlangıçta, bot zar zor hareket ediyor (sinir ağı nötr değerlerle başlatıldı). Bir yandan diğer yana sallanıyor: bot, hangilerinin ödül verdiğini görmek için farklı eylemleri test ediyor.

Bir saat sonra, kendini yatay olarak ortalamayı öğreniyor, ancak acı verici derecede yavaş. 7 saat sonra, düşmanı sağa ve sola takip edebiliyor, ancak asimetrik olarak (sağdan sola hareket etmede soldan sağa olduğundan daha iyi, eğitim boyunca devam eden bir davranış).

### Adım 2 : Feature Engineering

Ham ekran yakalaması 2 milyon pikselin üzerindeydi. 360p'ye düşürülse bile, bu 200.000 girdi: verimli öğrenme için çok fazla.

Yaratıcı binlerce düelloyu analiz etti ve **gerçekten önemli olan 30 değişkeni** belirledi, üç gruba ayrılmış:

**Görüş (düşman takibi)** :
- Düşmanın nişan noktasına uzaklığı
- Düşman sınırlayıcı kutu boyutu
- Düşman yüksekliği
- Nişan noktası durumu (hedefte/hedef dışı)
- Bağıl hız

Bot, tüm görüntüyü işlemek yerine, pikselleri yalnızca düşmanın zırh rengine göre filtreleyerek tespiti neredeyse anlık hale getiriyor. Benzer renkteki arka plan blokları bunu bozabilir: ancak Minecraft'ta, sadece dokuları değiştirebilirsiniz.

**OCR (HUD okuma)** :
Bot, oyunun kodundan koordinatları çekemediği için, ekranı gerçek zamanlı olarak tarayarak şunları çıkarır:
- Kamera eğimi (pitch)
- Momentum
- Y seviyesi

Standart OCR, Minecraft'ın şeffaf metniyle zorlanır, bu nedenle kritik veriler anında okuma için siyah beyaza zorlanır.

**Zaman (bağlam penceresi)** :
- Düşmana vurduğunuzdan beri geçen süre
- Size vurduğundan beri geçen süre
- Botun kendi önceki eylemlerinin döngüsel arabelleği

Bu, ağa zamansal bağlam sağlar: onsuz, botun bir combo'nun ortasında mı yoksa yeni bir dövüşe mi başladığı hakkında hiçbir fikri yoktur.

### Adım 3 : Dikey nişan (7 saat daha)

![RL eğitimi sırasında yukarı ve aşağı nişan almayı öğrenen bot](assets/ai-pvp-rl-vertical.png)

Dikey fare hareketi eklemek başlangıçta "tam bir felaketti". İlk performans bozuktu.

Kum havuzunda bir saat daha geçirdikten sonra, bot yukarı ve aşağı bakmayı çözdü. Ancak bu süreçte, yatay olarak nasıl takip edeceğini tamamen unuttu.

Bu **catastrophic forgetting**: yeni veriler için optimize etmenin önceden öğrenilmiş temsillerin üzerine yazdığı klasik bir makine öğrenimi sorunudur. Dikey nişan için optimize ederek, sinir ağı yanlışlıkla yatay ilerlemesinin üzerine yazdı ve yaratıcıya nişanını seviyede tutabilen ancak bir hedefi takip edemeyen bir bot bıraktı.

Dikey kontrolü korurken yatay takibi yeniden kazanmak **6 ek saat** sürdü. Bot daha sonra, kamera eğimini çıkaran OCR grubu sayesinde iyi bir nişan noktası yerleşimi sağladı.

### Adım 4 : Klavye kontrolü

![W tuşunu sürekli açıp kapatan, harekete bağlanmayı öğrenen bot](assets/ai-pvp-keyboard.png)

Bota klavyeyi kullanma izni vermek, zamana dayalı özellikleri daha da kritik hale getirdi. İlk başta, W tuşu sürekli açılıp kapatılıyordu: ağ henüz bağlanmayı öğrenmediği için hızlı geçiş.

Bu davranış cezalandırıldı, bu yüzden bot onu yumuşatmayı öğrendi. Daha fazla sprint vuruşu yapmaya başladı (ayakta sallamanın whoosh sesine karşı güm sesi). Bazı combolar, botun düşmana karşı menzil avantajını kullanması nedeniyle tatmin edici görünmüyordu.

İşleri adil hale getirmek için yaratıcı, düşmanın menzilini artırdı. Botun öğrendiği stratejilerin çoğu çalışmayı bıraktı. Ancak daha fazla zaman verildiğinde, uyum sağladı.

### Adım 5 : Bota ne zaman tıklayacağını öğretmek

Son aşama için, yaratıcı taklit öğrenimini geri getirdi: ancak yalnızca tıklama zamanlamasını öğretmek için, tam kontrol politikasını değil. Bot, kaydedilen düellolardaki tıklama modellerini taklit etmeye çalıştı.

Başlangıçta, yanlış tıklamaların cezasından korktuğu için herhangi bir şey denemekten çok korkuyordu. Ancak sonunda sallanıp vuruş yapma cesaretini buldu. Tabii ki, bu süreçte nasıl nişan alacağını tekrar unuttu: yaratıcı, tatmin edici bir duruma dönmesi için onu **50 saat daha** yalnız bırakmak zorunda kaldı.

## Hile tartışması

Video şu soruyla bitiyor: bu bot hile mi yapıyor?

Aleyhteki argüman: bot yalnızca bir insanın gördüklerini işler (aynı pikseller), bir insanla aynı klavye/fare girdilerini gönderir (anti-knockback gibi paket manipülasyonu yoktur) ve oyun belleğini okumaz (X-ray veya ESP yoktur).

Lehindeki argüman: bir bot bir insandan daha hızlı işlem yapabilir ve eğer rakip bir insana karşı oynadığını düşünüyorsa ama öyle değilse, bu aldatmacadır.

Yaratıcının görüşü: amaca bağlıdır. Her iki taraf da bunun bir bot olduğunu biliyorsa, bu adil bir maçtır. Bot, düşmanı 100 vuruşluk bir seriyle boşluğa gönderir.

## Sonuç

![100 vuruşluk combo gerçekleştiren bot](assets/ai-pvp-final-combo.png)

**GPU'su olmayan bir dizüstü bilgisayarda** eğitilmiş, özel bir eğitim hattı üzerine inşa edilmiş bir Minecraft PvP botu:

- **Piksel girişi için ekran yakalama** (2M+ piksel → 30 mühendislik ürünü özellik)
- **Müfredat öğrenimi** (yatay → dikey → klavye → tıklama)
- **Motor kontrol için RL** + **tıklama zamanlaması için taklit öğrenimi**
- **Ham pikseller üzerinde feature engineering** (3 grup: görüş, OCR, zaman)
- **Birden çok aşamada 60+ saat eğitim**

Toplam eğitim süresi onlarca saat civarındadır, ancak çoğu pasiftir. Bot anlayışa doğru sallanır, öğrendiklerini unutur, yeniden öğrenir ve sonunda 100 vuruşluk bir comboyu bir araya getirir.

Video [youtube.com/watch?v=j5nxDKAjg6U](https://www.youtube.com/watch?v=j5nxDKAjg6U) adresinde.

---

*Bu makale yalnızca videonun içeriğini kapsar. Minecraft YZ'si hakkında daha geniş bağlam için: VPT, DreamerV3 ve taklit öğrenimi vs RL manzarası: aşağıdaki bölümler bu projeyi daha geniş alana bağlar.*

## VPT : Ölçekte Davranış Klonlama

![OpenAI'in VPT proje diyagramı: Ters Dinamik Modeli, kare çiftlerinden eylemleri tahmin eder](assets/vpt-idm-diagram.png)

Videonun "davranış klonlama" yaklaşımı (Aşama 1), OpenAI'in **Video PreTraining (VPT)** projesinde kullandığı tekniğin aynısıdır, ancak kaynak spektrumunun zıt uçlarındadır. VPT, 70.000 saat video, 720 GPU ve etiketlenmemiş verileri pseudo-etiketlemek için bir ters dinamik modeliniz olduğunda taklit öğreniminin Minecraft için işe yaradığını kanıtladı. Buradaki yaratıcı, bir dizüstü bilgisayar ve 1.000 düelloyla başarısız olduğunu kanıtladı: ancak aynı temel nedenle: taklit öğrenimi, gösterimlerinin kalitesiyle sınırlıdır.

![OpenAI'in VPT ajanı Minecraft'ta bir ağaç kesiyor](assets/vpt-minecraft.jpg)

VPT hattı, t-1 karesine ve t+1 karesine bakarak t karesindeki eylemi tahmin eden bir **Ters Dinamik Modeli (IDM)** eğiterek veri sorununu çözer. IDM nedensel olmadığı için (gelecek kareleri görür), görev davranış klonlamadan daha kolaydır ve çok daha az etiketli veri gerektirir. 2.000 saatlik etiketli veri için yüklenicilere ~$2.000 ödediler, ardından 70.000 saatlik YouTube Minecraft videosunu pseudo-etiketlemek için IDM'yi kullandılar.

Ortaya çıkan 0,5B parametreli temel model, yalnızca RL ile imkansız olan sıfır atış yetenekleri elde etti: ağaç kesme, tezgah yapma, sütun atlama: ve RL ile ince ayar yapılarak elmas araçlar üreten ilk YZ oldu.

## OpenAI Five : Ödül şekillendirme sorunu

![OpenAI Five, insan profesyonellere karşı Dota 2 oynuyor](assets/openai-five-dota2.jpg)

OpenAI Five (2019), saf kendi kendine oyun RL kullanarak Dota 2 dünya şampiyonlarını yendi: taklit öğrenimi yok. 256 GPU, 128.000 CPU çekirdeği, günde 180 yıllık oynanış, 10 aylık eğitim.

Ancak ödül fonksiyonu Dota uzmanları tarafından elle yapılmıştı: **20.000 özellikten 28'i**, her biri elle ayarlanmış ağırlıklarla. Net değer, öldürmeler, ölümler, kule sağlığı, koridor atamaları: tümü insanlar tarafından seçilmiş ve ağırlıklandırılmış. Bu şekillendirme olmadan, ajan zar zor öğreniyordu (deney: yalnızca galibiyet/mağlubiyet ödülü → yarı profesyonel seviyede plato).

Videonun botu aynı sorunla karşı karşıya: ödül fonksiyonu, yaratıcının PvP'de neyin önemli olduğuna dair anlayışını kodlar (vuruş yapmak iyi, hasar almak kötü, nişanı korumak iyi). Bu kaçınılmazdır: RL'nin bir ödül sinyaline ihtiyacı vardır ve bu sinyali şekillendirmek insan yanlılığını kodlar.

## DreamerV3 : Dünya modelleri ve seyrek ödüller

![Tek bir yapılandırmayla 150'den fazla farklı görevde DreamerV3 benchmark puanları](assets/dreamerv3-benchmarks.png)

DeepMind'in DreamerV3'ü (2023) üçüncü bir yaklaşım benimser. Davranış klonlama veya şekillendirilmiş RL yerine, bir **dünya modeli** öğrenir: geçmiş eylemlerden gelecekteki durumları ve ödülleri tahmin eden bir sinir ağı: ve olası gelecekler hakkında hayal kurarak plan yapar. İnsan verisi veya müfredat olmadan Minecraft'ta sıfırdan elmas toplayan ilk algoritmaydı, 2025'te Nature'da yayınlandı.

![DreamerV3, gelecekteki yörüngeleri hayal etmek için bir dünya modeli öğrenir](assets/dreamerv3-header.png)

Elmas ortamı, 12 kilometre taşı üzerinde seyrek bir ödül tanımlar (kütük → tahtalar → çubuk → tezgah → tahta kazma → yuvarlak taş → taş kazma → demir cevheri → fırın → demir külçe → demir kazma → elmas), her biri yalnızca bir kez +1 verir. Artı küçük bir sağlık ödülü (hp başına ±0,01). Ulaşılabilir toplam: 36.000 adımlık bir bölümde 11,1.

DreamerV3'ün dünya modeli, yörüngeleri hayal etmesine ve bunları dahili olarak değerlendirmesine olanak tanır: aktör, gerçek deneyimden ziyade hayal edilen rollout'lardan öğrenir ve her gerçek adım için binlerce olası geleceği test eder. Bu, standart bir RL ajanını öldürecek yerlerde seyrek ödülleri uygulanabilir kılar.

100 milyon ortam adımı için eğitilmiş 40 tohumda, 40'ın 24'ü en az bir elmas topladı. İlk elmas, 29 milyon adımdan sonra ortaya çıktı (bir GPU'da ~9 gün).

## ANNA : Sembolik YZ Minecraft ile Buluşuyor

![Bir çakmaktaşı için ANNA'nın görev ağacı ayrıştırması](assets/anna-task-tree.png)

Videonun PvP botundan, VPT ve DreamerV3'ten önce, **ANNA** vardı: tamamen farklı bir felsefeyle inşa edilmiş bir Minecraft botu. Piksellerden veya ödüllerden öğrenmek yerine, ANNA bir **Fransız NLP ayrıştırıcısı** ve elle yazılmış bir **görev bağımlılık ağacı** ile **sembolik bir durum makinesi** kullanır.

2022'de oluşturulan ("vibe coding" bir terim olmadan önce) ANNA, Mineflayer aracılığıyla bir Minecraft sunucusuna bağlanır ve Fransızca doğal dil komutlarını anlar. *"obtiens un briquet"* (bir çakmaktaşı al) deyin ve ANNA'nın ayrıştırıcısı fiili tanımlar (*obtien* → edin), eşya tarifine bakar ve onu yinelemeli olarak alt görevlere ayırır: meşe kütükleri çıkar → tahtalar yap → çubuklar yap → tezgah yap → tahta kazma yap → taş çıkar → taş kazma yap → demir cevheri çıkar → demir külçeler erit → çakmaktaşını yap.

![Fransızca komut tanıma için ANNA'nın NLP ayrıştırıcı mimarisi](assets/anna-nlp-diagram.png)

NLP katmanı (`utils/id_parser.js`), paralel emirleri işlemek için komutları *"et"* (ve) üzerinde böler, Fransızca fiilleri görev türlerine (*craft*, *mine*, *tue*, *suis moi*) eşler ve 5.000 girişlik bir sözlük aracılığıyla Fransızca eşya adlarını Minecraft ID'lerine çevirir. Tanınmayan komutlar, ANNA'yı bilinçli bir Minecraft arkadaşı olarak sunan GPT tabanlı bir sohbet sistemine düşer.

**Görev ağacı** (`mc-tasks-tree/`) çekirdektir: adım adım bir plan üretmek için Minecraft eşya grafiğinde (işçilik tarifleri, madencilik verimleri, yaratık düşüşleri, fırın tarifleri) gezinen özyinelemeli bir algoritma. Bir elmas kaskı için, ahşap, taş, demir ve elmas kademelerini kapsayan 40+ adımlık bir ayrıştırma üretir.

![ANNA'nın elmas kask görev ağacı: 40+ adımlık bir ayrıştırma](assets/anna-diamond-helmet.png)

Videonun PvP botu deneyimden öğrenirken, ANNA bilgiden çalışır. 1.000 düelloya veya 60 saatlik eğitime ihtiyacı yoktur: ağaca, ayrıştırıcıya ve sunucuya ihtiyacı vardır. Ancak ağacının kodladığının ötesine genelleme yapamaz. Hiçbir miktarda durum makinesi mühendisliği ona PvP yapmayı öğretmez.

ANNA'nın yaklaşımı, farklı bir YZ çağını yansıtır: uçtan uca öğrenmenin hakim olmasından önce, sembolik akıl yürütme ve dikkatli mühendisliğin zeki davranış üretebileceği vaadinin olduğu zaman. Bugün, ANNA ve PvP botu gibi projeler Minecraft YZ'sinin iki kutbunu temsil eder: biri dünya hakkında akıl yürütür, diğeri onu algılar.

## Master Gumbo'nun Mace Botu : Yalnızca komut bloklarıyla YZ

![Botla birlikte Mace PvP eğitim arenası](assets/mace-bot-arena.png)

Minecraft YZ'sinin tamamen farklı bir köşesinde, YouTuber **Master Gumbo**, **yalnızca komut bloklarını** kullanarak bir PvP eğitim botu inşa etti: mod yok, eklenti yok, harici kod yok. Sadece vanilya Minecraft komutları, redstone ve oyuncu kopyası varlıkları için bir carpet modu. Sonuç, oyuncuyla breach swapping, wind charging ve kalkan mekanikleri yapan bir YZ mace PvP rakibidir.

Bot, kırılmaz teçhizatı ve ikinci elinde bir totemi olan bir zombi olarak başlar (her tick'te `/item replace` ile yeniden doldurulur), bu da onu etkili bir şekilde ölümsüz yapar. Daha sonra, Master Gumbo, zombilerin yapamayacağı insan benzeri mekanikleri (kalkan kaldırma, eşya değiştirme) destekleyen **Carpet Mod'un oyuncu kopyası** botlarına geçer.

![Ayarlar merkezi: bot davranışını yapılandırmak için düğmeler](assets/mace-settings-center.png)

Temel yenilik, **rastgelelik tarafından yönlendirilen bir durum makinesidir**. Bir zırh askısı, varlıkları rastgele dağıtan `/spreadplayers` komutu kullanılarak renkli beton bloklardan oluşan bir dairenin üzerine ışınlanır. Zırh askısının nereye indiği, botun bir sonraki eylemini belirler:

- **Kırmızı beton** → geriye doğru strafe
- **Mavi beton** → yukarı doğru wind charge (saldırı)
- **Yeşil beton** → kalkan kaldır
- **Beyaz beton** → duraklama (eylemler arasına gecikme ekler)

![YZ karar sistemi: renkli beton üzerinde bir zırh askısı](assets/mace-ai-system.png)

Zırh askısının konumu, altındaki bloğu algılayan ve ilgili mekanizmayı etkinleştiren komut blokları tarafından okunur. Her davranışı etkinleştirmek/devre dışı bırakmak için bir redstone bloğu yerleştirilir veya kaldırılır. `/spreadplayers` tekrar üzerinde çalıştığı için, bot sürekli olarak yeni kararlar alarak öngörülemez ancak yapılandırılmış davranış yaratır.

Master Gumbo buna "çok basit ve temel bir YZ biçimi" diyor: sinir ağları gibi etkileşimlerden öğrenmez, ancak rastgelelik + durum makinesi, komut dosyalı bir bottan tahmin edilmesi daha zor olan gerçekçi PvP davranışı üretir. Ayarlar merkezi, YZ'yi açıp kapatmak, zorluğu ayarlamak ve hareket modellerini yapılandırmak için bir kitap arayüzü içerir.

Botla eğitim aldıktan ve ardından (videonun girişinde) kendisine kötü diyen oyuncuyla düello yaptıktan sonra, Master Gumbo kazanır. Harita, Carpet Mod gerekliliğiyle Discord üzerinden paylaşılır.

![Bir düelloda, mace PvP tekniklerini uygulayan bot](assets/mace-final-duel.png)

PvP botu (Kadambi) piksellerden öğrenir ve ANNA bir görev ağacı aracılığıyla akıl yürütürken, Master Gumbo'nun botu **rasgeleleştirilmiş durum geçişleri** aracılığıyla zeka elde eder: ikna edici bir PvP rakibi oluşturmak için sinir ağlarına ihtiyacınız olmadığını kanıtlayan saf bir komut bloğu yaklaşımı.

## Bunları birbirine bağlayan şey

| Yaklaşım | Temel yöntem | Veri | Hesaplama | Sonuç |
|----------|------------|------|---------|--------|
| Videonun PvP botu | RL + taklit öğrenimi | 1.000 düello | 1 dizüstü, 60s | 100 vuruşluk combo |
| OpenAI Five | Kendi kendine oyun RL | Günde 180 yıl oynanış | 256 GPU, 10 ay | Dünya şampiyonu Dota 2 |
| VPT | Yarı denetimli IL | 70K saat YouTube + IDM | 720 GPU, 9 gün | Elmas araçlar |
| DreamerV3 | Dünya modeli RL | Hayal edilen yörüngeler | 1 GPU, 9 gün | Sıfırdan elmas |
| **ANNA** | **Sembolik NLP + görev ağacı** | **Elle yazılmış tarifler** | **1 dizüstü, anında** | **Üretilebilir her eşya** |
| **Mace Botu** | **Komut bloğu durum makinesi** | **Rastgele kararlar** | **Vanilla MC, GPU yok** | **Mace PvP eğitimi** |

Videonun botu kaynak açısından en kısıtlı olanıdır, ancak süreç hakkında en dürüst olanıdır. Önce başarısız olur, sonra yineler. Öğrendiklerini unutur, sonra yeniden öğrenir. 100 vuruşluk bir combo ile biter: ancak aynı zamanda inşa ettiği şeyin hile olup olmadığına dair bir soruyla.

---

**Video** : [AI Learns Minecraft PvP](https://www.youtube.com/watch?v=j5nxDKAjg6U) - Kadambi | AI Engineering

**VPT** : [Makale](https://cdn.openai.com/vpt/Paper.pdf) · [Blog](https://openai.com/index/vpt/) · [GitHub](https://github.com/openai/Video-Pre-Training)

**OpenAI Five** : [Makale](https://arxiv.org/abs/1912.06680) · [Blog](https://openai.com/index/dota-2/)

**DreamerV3** : [Makale](https://arxiv.org/abs/2301.04104) · [GitHub](https://github.com/danijar/dreamerv3)

**ANNA** : [GitHub](https://github.com/fox3000foxy/ANNA) · (Node.js, Mineflayer, French NLP, task tree)

**Mace Botu** : [Video](https://www.youtube.com/watch?v=Fmp2Il70IF8) - Master Gumbo · (Command blocks, Carpet Mod, state machine)
