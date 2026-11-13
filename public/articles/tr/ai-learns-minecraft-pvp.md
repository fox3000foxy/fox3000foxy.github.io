---
title: Yapay zekâ Minecraft PvP öğreniyor, Taklit Öğrenmesi, Pekiştirmeli Öğrenme ve önemli olan 30 değişken
description: "Kaydedilmiş 1.000 düello, pikseller üzerinde eğitilmiş sinir ağı, %90 vuruş
  doğruluğu: ve bot dosdoğru bir duvara koşuyordu. Sonra RL, müfredatlı öğrenme
  ve 60 saatlik eğitim geldi."
date: 2026-07-09
tags:
  - minecraft
  - ai
  - python
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "3NPT5tgSTxAAP3yM03Optg3ERWlN8KbP9RXbgHJcH1K+7G7n/zNkDeKGjrAmbKxsApppD7cT53dDJop3GLPKIQ=="
---

## Giriş

![AI Learns Minecraft PvP küçük resmi](assets/ai-pvp-thumbnail.png)

Kadambi | AI Engineering tarafından [AI Learns Minecraft PvP (Reinforcement Learning + Behavior Cloning)](https://www.youtube.com/watch?v=j5nxDKAjg6U) adlı bir video var ve gördüğüm en dürüst video oyunu yapay zekâsı eğitim anlatılarından biri.

İlke: ekrana bakıp fare ve klavye komutları gönderen, Minecraft PvP oynayan bir bot inşa etmek (kılıç kiti, tamamen büyülenmiş elmas zırh). Yalnızca piksel girdi ve aksiyon çıktı ile çalışır, oyun belleğini okumadan, makrosuz ve modesuz.

Videoyu ilginç yapan nihai sonuç değildir. Yolculuktur: taklit öğrenmesinin başarısızlığı, özellik mühendisliğine dönüş, yıkıcı unutma döngüleri ve GPUsuz bir dizüstünde 60+ saatlik eğitim.

## Faz 1: Taklit Öğrenmesi (başarısızlık)

![Taklit öğrenmesi sırasında bot: bir duvarla yüzleşiyor, yukarı aşağı zıplıyor](assets/ai-pvp-imitation-fail.png)

Yaratıcı mantıklı bir yaklaşımla başladı: kendi oynanışından 1.000 düello kaydetmek, her fare tıklaması ve tuş basımını ilgili görüntüyle eşleştirmek ve piksellerden aksiyonları tahmin etmesi için bir sinir ağı eğitmek.

```python
# Taklit öğrenmesi pipelineı için sözde kod
dataset = record_duels(1000)          # yüz binlerce kare
for frame, action in dataset:
    pixels = capture_screen(frame)
    network.train(pixels → action)    # görüntüden klavye/fare tahmini
```

Ağ vuruşları **%90 doğrulukla** tahmin etmeyi öğrendi. Umut verici.

Sonra onu gerçek bir maçta test ettiler. Bot dosdoğru haritanın kenarına yürüdü, bir duvarla yüzleşti ve yukarı aşağı zıpladı.

Neden?

**Tembellik tuzağı.** Bir PvP savaşında W tuşu çoğu zaman basılıdır. Ağ yüksek doğruluğa basitçe Wyi basılı tutup başka hiçbir şey yapmayarak ulaşabileceğini fark etti. Diğerlerinin zararına en sık aksiyonu optimize etti.

**İnsan gecikmesi.** Veri kümesindeki aksiyonlar ~200 ms insan tepki süresiyle gecikmiştir. Kare kare, aksiyon ile görünür sonucu birkaç görüntıyla ayrıldığında ham piksellerden bir modelin neden ve sonucu öğrenmesi neredeyse imkânsızdır.

**Tutarsız gösterimler.** Yaratıcının kendi oynanışı değişiyordu: bazen klavyeyle strafing yapıyor, bazen aynı durumlarda fareyle nişan alıyordu. Bu çelişkili girdiler ağı bozdu.

## Faz 2: Müfredatlı Pekiştirmeli Öğrenme

![RL eğitimi sırasında bot yatay izlemeyi öğreniyor](assets/ai-pvp-rl-horizontal.png)

Taklit öğrenmesini bırakıp yaratıcı RLe geçti. Ama taze bir ajanı tam bir PvP düellosuna daldırmak işe yaramaz: rastgele keşfin bir şey bulması için aynı anda çok şey olur.

Çözüm: **müfredatlı öğrenme**. Her mekaniği izole etmek ve bota gerçek savaşa girmeden önce temellerde ustalaşmayı bırakmak.

### Adım 1: Yatay nişan (7 saat)

En basit ödül fonksiyonu: hedefi vurmak için pozitif ödül, hasar almak için negatif ceza.

Başlangıçta bot zar zor hareket eder (nötr değerlerle başlatılmış sinir ağı). Yana doğru titrer: bu botun hangi aksiyonların ödül verdiğini görmek için farklı aksiyonları test etmesidir.

Bir saat sonra yatayda acıyla yavaş merkezlenmeyi öğrenir. 7 saat sonra düşmanı sağa ve sola izleyebilir, asimetrik olsa da (soldan sağa harekettense sağdan sola daha iyi, eğitim boyunca süren bir davranış).

### Adım 2: Özellik Mühendisliği

Ham ekran görüntüsü 2 milyon pikselden fazlaydı. 360pye indirilse bile bu 200.000 girdidir: etkili öğrenme için çok fazla.

Yaratıcı binlerce düelloyu analiz etti ve gerçekten önemli **30 değişkeni** üç grupta belirledi:

**Görüş (düşman izleme)**:
- Düşmanın nişangâhtan (crosshair) uzaklığı
- Düşmanın sınırlayıcı kutusunun boyutu
- Düşmanın yüksekliği
- Nişangâh durumu (hedefte / hedef dışı)
- Göreli hız

Tüm görüntüyü işlemek yerine bot pikselleri kesinlikle düşman zırhının rengine göre filtreler, tespiti neredeyse anlık yapar. Benzer renkli arka plan blokları bu filtreyi bozabilir: ama Minecraftta dokuları basitçe değiştirebilirsin.

**OCR (HUD okuma)**:
Bot koordinatları oyun kodundan alamadığı için ekranı gerçek zamanlı tarayıp şunu çıkarır:
- Kamera açısı
- Momentum
- Y seviyesi

Standart OCR Minecraftın saydam metniyle zorlanır, o yüzden kritik veriler anlık okuma için siyah beyaza zorlanır.

**Zaman (bağlam penceresi)**:
- Düşmana vurduğundan beri geçen süre
- Onun sana vurduğundan beri geçen süre
- Botun önceki aksiyonlarının kayan tamponu

Bu ağa zamansal bağlam verir: o olmadan botun bir kombonun ortasında mı olduğu ya da savaşa yeni mi başladığı hakkında fikri yoktur.

### Adım 3: Dikey nişan (7 saat daha)

![RL eğitimi sırasında bot yukarı ve aşağı nişan almayı öğreniyor](assets/ai-pvp-rl-vertical.png)

Fareye dikey hareket eklemek başlangıçta "tam bir felaket" oldu. Başlangıç performansı kırıktı.

Kum havuzunda bir saat daha sonra bot yukarı ve aşağı bakmayı anladı. Ama süreçte yatay izlemeyi tamamen unuttu.

Bu **yıkıcı unutma**dır: yeni veriler için optimize etmenin önceden öğrenilmiş temsilleri ezdiği klasik bir makine öğrenmesi sorunu. Dikey nişanı optimize ederken sinir ağı kazara yatay ilerlemelerini ezdi, yaratıcıyı nişangâhını hizada tutabilen ama hedef izleyemeyen bir botla bıraktı.

Yatay izlemeyi geri kazanıp dikey kontrolü korurken **6 saat daha** gerekti. Bot sonra kamera açısını çıkaran OCR grubu sayesinde iyi nişangâh yerleşimini korudu.

### Adım 4: Klavye kontrolü

![W tuşunu sürekli açıp kapatan bot, harekete bağlanmayı öğreniyor](assets/ai-pvp-keyboard.png)

Bota klavyeyi kullanma izni vermek zamansal özellikleri daha da kritik yaptı. Başlangıçta W tuşu sürekli açılıp kapanıyordu: ağ bağlanmayı öğrenmediği için hızlı bir değişim.

Bu davranış cezalandırıldı, o yüzden bot yumuşatmayı öğrendi. Sprintte daha fazla vuruş indirmeye başladı (ayaktaki vuruşun swishine karşı tok ses). Bazı kombolar tatminsiz görünüyordu çünkü bot düşman üzerindeki menzil avantajını sömürüyordu.

İşleri adil yapmak için yaratıcı düşmanın menzilini artırdı. Botun öğrendiği stratejilerin çoğu çalışmayı bıraktı. Ama zamanla uyum sağladı.

### Adım 5: Bota ne zaman tıklayacağını öğretmek

Final fazı için yaratıcı taklit öğrenmesini geri getirdi: ama tam kontrol politikasını değil, yalnızca tıklama zamanlamasını öğretmek için. Bot kaydedilmiş düelloların tıklama desenlerini taklit etmeye çalıştı.

Başlangıçta kötü tıklamaların cezasından korkup bir şey denemeye çok korkuyordu. Ama sonunda vurma cesaretini buldu ve vuruşlar indirdi. Tabii ki süreçte nişan almayı yine unuttu: yaratıcı tatmin edici bir duruma dönmek için onu **50 saat daha** kendi haline bırakmak zorunda kaldı.

## Hile tartışması

Video şunu sorarak biter: bu bot hile yapıyor mu?

Karşı argüman: bot yalnızca bir insanın gördüğünü işler (aynı pikseller), bir insanla aynı klavye/fare girdilerini gönderir (anti-knockback gibi paket manipülasyonu olmadan) ve oyun belleğini okumaz (X-ray ya da ESP olmadan).

Yana argüman: bir bot insandan hızlı işleyebilir ve rakip insana karşı oynadığını sanıyor ama durum bu değilse bu aldatmacadır.

Yaratıcının görüşü: niyete bağlıdır. İki taraf da bunun bir bot olduğunu biliyorsa maç adildir. Bot düşmanı 100 vuruşluk seriyle boşlukta zincirler.

## Sonuç

![100 vuruşluk kombo yapan bot](assets/ai-pvp-final-combo.png)

**GPUsuz dizüstü** üzerinde eğitilmiş bir Minecraft PvP botu, özel bir eğitim pipelineı üstüne inşa edilmiş:

- Piksel girdi için **ekran görüntüsü** (2M+ piksel → 30 tasarlanmış özellik)
- **Müfredatlı öğrenme** (yatay → dikey → klavye → tıklamalar)
- Motor kontrolü için **RL** + tıklama zamanlaması için **taklit öğrenmesi**
- Ham piksellerde **özellik mühendisliği** (3 grup: görüş, OCR, zaman)
- Birden çok fazda **60+ saatlik eğitim**

Toplam eğitim süresi onlarca saattir ama çoğu pasiftir. Bot anlamaya kadar titrer, öğrendiklerini unutur, yeniden öğrenir ve 100 vuruşluk seriyle bitirir.

Video [youtube.com/watch?v=j5nxDKAjg6U](https://www.youtube.com/watch?v=j5nxDKAjg6U) adresindedir.

---

*Bu makale yalnızca videonun içeriğini kapsar. Minecraft yapay zekâsına dair daha geniş bağlam için: VPT, DreamerV3 ve taklit öğrenmesi ile RL manzarası: aşağıdaki bölümler bu projeyi daha geniş alana bağlar.*

## VPT: Büyük ölçekli Davranış klonlama

![OpenAI VPT proje şeması: Ters Dinamik Modeli kare çiftlerinden aksiyonları tahmin eder](assets/vpt-overview.svg)

Videonun "davranış klonlama" yaklaşımı (Faz 1), OpenAIın **Video PreTraining (VPT)** projesinde kullandığı tekniğin aynısıdır ama kaynak yelpazesinin zıt uçlarındadır. VPT, 70.000 saat video, 720 GPU ve etiketsiz verileri sözde etiketlemek için ters dinamik model olunca taklit öğrenmesinin Minecraft için işe yaradığını kanıtladı. Buradaki yaratıcı dizüstü ve 1.000 düello ile başarısız olduğunu kanıtladı: ama aynı temel nedenle: taklit öğrenmesi gösterimlerinin kalitesiyle sınırlıdır.

![OpenAI VPT ajanı Minecraftta ağaç kazıyor](assets/vpt-minecraft.jpg)

VPT pipelineı verileri t-1 görüntüsü ve t+1 görüntüsüne bakıp t görüntüsündeki aksiyonu tahmin eden bir **Ters Dinamik Modeli (IDM)** eğiterek veri sorununu çözer. IDM nedensel olmadığı için (gelecek görüntüleri görür) görev davranış klonlamadan kolaydır ve çok daha az etiketli veri gerektirir. Yüklenicilere yaklaşık 2.000 $ ödeyip 2.000 saat etiketli veri aldılar, sonra IDMyi 70.000 saat YouTube Minecraft videosunu sözde etiketlemek için kullandılar.

![Ön eğitim veri hacmine göre üretim/toplama hızı (log ölçeği): üretim masaları, tahta aletler, taş aletler](assets/vpt-stone-pickaxe-sequence.svg)

Ölçek etkisi nettir: 1 saatten 100.000 saat ön eğitim verisine log eksende modelin üretim masası, tahta aletler, sonra taş aletler yapma hızı basamakla yükselir. Yalnızca yüklenicilerce etiketlenmiş 2.000 saatte eğitilmiş model üretim masalarında tavan yapar; taş aletlerin zero-shot ortaya çıkmasını sağlayan IDMce sözde etiketlenmiş 70.000 saatin eklenmesidir (grafikte kesikli çizgi), tek RL adımı olmadan.

Sonuç 0,5B parametreli temel model RL olmadan imkânsız zero-shot yeteneklere ulaştı: ağaç kesmek, masa üretmek, sütun zıplaması: ve RL ile ince ayarlanınca elmas aletler üreten ilk yapay zekâ oldu.

![RL eğitim bölümü sayısına göre ödül: rastgele başlatılmış modelden başlamak ve önceden eğitilmiş VPT modelinden başlamak](assets/vpt-diamond-pickaxe-sequence.svg)

Bu grafik ön eğitimin sonraki RL için neden her şeyi değiştirdiğini gösterir. Rastgele başlatılmış ağdan başlayan RL (turuncu) neredeyse bir milyon bölüm boyunca 0 yakınında düz kalır: "bir elmas al" görevi naif bir ajanın rastgele keşifle denk gelmesi için çok seyrek ödüllüdür. Önceden eğitilmiş VPT modelinden ince ayarlanan RL (yeşil) temel davranışla (kazma, üretme, keşfetme) başlar ve elmas kazmaya giden tam yola karşılık gelen ~25 ödüle düzenli tırmanır.

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/719971231?h=cbdf2617a1" title="VPT agent gameplay demo 1" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045834?h=9cb4118c65" title="VPT agent gameplay demo 2" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045849?h=00398908ed" title="VPT agent gameplay demo 3" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

<div style="max-width: 100%; margin: 1.5em 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe src="https://player.vimeo.com/video/720045863?h=060f07e290" title="VPT agent gameplay demo 4" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy"></iframe>
  </div>
</div>

*OpenAI VPT projesinin ajanı aksiyonda gösteren resmi tanıtım videoları.*

## OpenAI Five: Ödül şekillendirme sorunu

![İnsan profesyonellere karşı Dota 2 oynayan OpenAI Five](assets/openai-five-dota2.jpg)

OpenAI Five (2019) saf öz öğrenmeli RL kullanarak Dota 2 dünya şampiyonlarını yendi: taklit öğrenmesi yok. 256 GPU, 128.000 CPU çekirdeği, günde 180 oyun yılı, 10 aylık eğitim.

Ama ödül fonksiyonu Dota uzmanlarınca elle tasarlanmıştı: mevcut **20.000 arasından 28 özellik**, her biri manuel ayarlanmış ağırlıklarla. Net değer, skorlar, ölümler, kule sağlığı, kulvar atamaları: hepsi insanlarca seçilip ağırlıklandırıldı. Bu modelleme olmadan ajan zar zor öğreniyordu (deney: yalnızca galibiyet/mağlubiyet ödülü → yarı pro seviyede plato).

Videonun botu aynı sorunla yüzleşir: ödül fonksiyonu yaratıcının PvPde neyin önemli olduğuna dair anlayışını kodlar (vurmak iyidir, vurulmak kötüdür, nişangâhı tutmak iyidir). Bu kaçınılmazdır: RL bir ödül sinyaline ihtiyaç duyar ve bu sinyalin modellenmesi bir insan önyargısı kodlar.

## DreamerV3: Dünya modelleri ve seyrek ödüller

![Tek yapılandırmayla 150den fazla çeşitli görevde DreamerV3 kıyas skorları](assets/dreamerv3-benchmarks.png)

DeepMindin DreamerV3 modeli (2023) üçüncü bir yaklaşım benimser. Davranış klonlama ya da teşvikli RL yerine bir **dünya modeli** öğrenir: geçmiş aksiyonlardan gelecek durumları ve ödülleri tahmin eden bir sinir ağı: ve olası geleceklerin rüyasını görerek planlar. İnsan verisi ya da müfredatsız Minecraftta sıfırdan elmas toplayan ilk algoritmadır, 2025te Natureda yayınlandı.

![DreamerV3 gelecek yörüngeleri hayal etmek için bir dünya modeli öğrenir](assets/dreamerv3-header.png)

Elmas ortamı 12 dönüm noktasında seyrek bir ödül tanımlar (kütük → tahta → çubuk → üretim masası → tahta kazma → taş → taş kazma → demir cevheri → fırın → demir külçe → demir kazma → elmas), her biri bir kez +1 verir. Artı küçük bir sağlık ödülü (can başına ±0,01). Ulaşılabilir toplam: 36.000 adımlık bölümde 11,1.

DreamerV3ün dünya modeli yörüngeleri hayal edip dâhili değerlendirmesine izin verir: aktör gerçek deneyimden çok hayal edilmiş açılımlardan öğrenir, her gerçek adım için binlerce olası geleceği test eder. Bu seyrek ödülleri standart bir RL ajanını yok edeceği yerde mümkün kılar.

100M ortam adımı eğitilmiş 40 tohumdan 24ü en az bir elmas topladı. İlk elmas ~9 gün tek GPUda 29M adımdan sonra belirdi.

## ANNA: Minecraft ile buluşan sembolik yapay zekâ

![Çakmak taşı için ANNA görev ağacı ayrışımı](assets/anna-task-tree.png)

Videonun PvP botundan, VPT ve DreamerV3ten önce **ANNA** vardı: tamamen farklı bir felsefeyle inşa edilmiş bir Minecraft botu. Piksellerden ya da ödüllerden öğrenmek yerine ANNA **Fransızca NLP ayrıştırıcılı** ve elle yazılmış **görev bağımlılık ağaçlı** **sembolik bir durum makinesi** kullanır.

2022de yaratıldı ("vibe coding" bir terim olmadan önce), ANNA Mineflayer üzerinden bir Minecraft sunucusuna bağlanır ve Fransızca doğal dil komutlarını anlar. *"obtiens un briquet"* de ve ANNA fiili ayrıştırır (obtien → elde et), nesnenin tarifini arar ve özyinelemeli alt görevlere böler: meşe kaz → tahta üret → çubuk üret → üretim masası üret → tahta kazma üret → taş kaz → taş kazma üret → demir cevheri kaz → demir külçe erit → çakmak üret.

![Fransızca komut tanıma için ANNA NLP ayrıştırıcı mimarisi](assets/anna-nlp-diagram.png)

NLP katmanı (`utils/id_parser.js`) paralel emirleri yönetmek için komutları "et" üzerinden böler, Fransızca fiilleri görev türleriyle eşleştirir ve 5.000 girdili sözlükle Fransızca nesne adlarını Minecraft tanımlayıcılarına çevirir. Tanınmayan komutlar ANNAyı bilinçli bir Minecraft yoldaşı olarak sunan GPT tabanlı bir sohbet sistemine geçer.

**Görev ağacı** (`mc-tasks-tree/`) kalptir: adım adım plan üretmek için Minecraft nesne grafını (üretim tarifleri, madencilik verimleri, canavar dropları, fırın tarifleri) gezen özyinelemeli bir algoritma. Elmas miğfer için tahta, taş, demir ve elmas seviyelerini kapsayan 40+ adımlı ayrışım üretir.

![ANNA elmas miğfer görev ağacı: 40+ adımlı ayrıntı](assets/anna-diamond-helmet.png)

Videonun PvP botu deneyimden öğrenirken ANNA bilgiden çalışır. 1.000 düelloya ya da 60 saatlik eğitime ihtiyacı yoktur: ağaca, ayrıştırıcıya ve sunucu/dağıtıcıya ihtiyacı vardır. Ama ağacının kodladığının ötesine de genellemez. Hiçbir durum makinesi mühendisliği ona PvP yapmayı öğretemezdi.

ANNA yaklaşımı yapay zekânın farklı bir dönemini yansıtır: uçtan uca öğrenme baskın olmadan önce, vaat dikkatli mühendislikle birleşmiş sembolik akıl yürütmenin akıllı davranış üretebileceğiydi. Bugün ANNA ve PvP botu gibi projeler Minecraft yapay zekâsının iki kutbunu temsil eder: biri dünya hakkında akıl yürütür, diğeri onu algılar.

## Master Gumbo Mace Botu: Yalnızca komut bloklu yapay zekâ

![Botlu Mace PvP eğitim arenası](assets/mace-bot-arena.png)

Minecraft yapay zekâsının tamamen farklı bir köşesinde YouTube kanalı **Master Gumbo** **yalnızca komut blokları** kullanarak bir PvP eğitim botu inşa etti; yalnızca vanilla Minecraft komutları, redstone ve oyuncu klon varlıkları için carpet mod. Sonuç, oyuncuyla gedik değişimleri, rüzgâr yükü hücumları ve kalkan mekaniklerini çalıştıran kitle için bir yapay zekâ rakiptir.

Bot kırılmaz ekipmanlı ve ikinci elinde totemli bir zombi olarak başlar (her tick `/item replace` ile doldurulur), onu fiilen ölümsüz yapar. Sonra Master Gumbo zombilerin yapamadığı insansı mekanikleri (kalkan kaldırma, eşya değişimi) destekleyen **Carpet Mod oyuncu kopyası** botlarına geçer.

![Ayar merkezi: bot davranışını yapılandırma düğmeleri](assets/mace-settings-center.png)

Merkez yenilik **rastgele sürümlü bir durum makinesidir**. Bir zırh askısı `/spreadplayers` komutuyla renkli beton blok çemberinin üstüne ışınlanır; bu komut varlıkları rastgele dağıtır. Zırh askısının düştüğü beton bloğun rengi botun sonraki aksiyonunu belirler:

- **Kırmızı beton** → geriye strafing
- **Mavi beton** → rüzgâr yüküyle yukarı yükselir (saldırı)
- **Yeşil beton** → kalkanı kaldırır
- **Beyaz beton** → duraklama (aksiyonlar arasına gecikme ekler)

![Yapay zekâ karar sistemi: renkli beton üzerinde bir zırh askısı](assets/mace-ai-system.png)

Zırh askısının konumu altındaki bloğu tespit edip ilgili mekanizmayı etkinleştiren komut bloklarınca okunur. Her davranışı etkinleştirmek/devre dışı bırakmak için bir redstone bloğu yerleştirilir ya da kaldırılır. `/spreadplayers` tekrarda döndüğü için bot sürekli yeni kararlar alır, öngörülemez ama yapılandırılmış bir davranış yaratır.

Master Gumbo buna "çok basit ve temel bir yapay zekâ biçimi" der: sinir ağları gibi etkileşimlerden öğrenmez ama rastgele + durum makinesi scriptli bir bottan tahmin etmesi zor, gerçekçi bir PvP davranışı üretir. Ayar merkezi yapay zekâyı etkinleştirmek/devre dışı bırakmak, zorluğu ayarlamak ve hareket desenlerini yapılandırmak için kitap arayüzü içerir.

Botla eğitimden sonra ve onu ezik diye çağıran oyuncuya karşı düelloda (videosunun introsunda) Master Gumbo kazanır. Harita Discord üzerinden paylaşılır, Carpet Mod gerekli.

![Düelloda bot, mace PvP tekniklerini çalışıyor](assets/mace-final-duel.png)

PvP botu (Kadambi) piksellerden öğrenir, ANNA görev ağacında akıl yürütürken Master Gumbo botu **rastgele durum geçişleriyle** zekâya ulaşır: sinir ağlarına ihtiyaç olmadan inandırıcı bir PvP rakibi inşa edilebileceğini kanıtlayan saf komut bloklu bir yaklaşım.

## Altoclef: Büyük ölçekli Baritone + görev ağacı

ANNA ne yapacağını *okuyarak* bilen sembolik bir botsa ve Mace Botu kararları rastgeleleştiriyorsa **Altoclef** tüm oyunda yolunu *planlayan* eksiksiz özerk bir ajandır. gaucho-matero tarafından Fabric mod olarak inşa edilmiş ve **Baritone** yol bulmayla güçlendirilmiş Altoclef herhangi bir Minecraft hedefini görev ağacına böler ve insan müdahalesi olmadan yürütür.

Arayüz aldatıcı basittir: sohbete `@gamer` yaz ve Altoclef survival dünyadan "oyunu bitir" görevine başlar. Odun toplar, alet üretir, demir ve elmas kazar, Nether portalı inşa eder, Blaze çubukları ve Ender incileri toplar, kaleyi bulur ve Ender Dragonu öldürür. Hepsi özerk, yerel Minecraft istemcisi üzerinden, herhangi bir vanilla sunucuda.

Kaputun altında bu, her üst düzey hedefin (örneğin "elmas kazma üret") önkoşul görevlere bölündüğü **özyinelemeli bir görev ağacı sistemi** sayesinde başarılır: elmas kaz → erit → çubuk üret → birleştir. Ağaç tam Minecraft tarif grafını gezer, üretim zincirleri, canavar dropları, ganimet tabloları ve konteyner erişimini yönetir. ANNA elle yazılmış ağacının tersine Altoclef görevleri keyfi mantık uygulayabilen **programlanabilir Java sınıflarıdır**: savaş stratejileri, piglin takası, keşif desenleri.

Kilit mimari fikir **ne** (görev ağacı) ile **nasıl** (Baritone yol bulma) ayrımıdır. Baritone düşük seviye hareketleri yönetir: yol bulma, engelden kaçınma, blok kırma, envanter yönetimi; görev sistemi üst düzey planı orkestre eder. Bu modülerlik hiçbir bileşenin yapay zekâ olmasına gerek olmadığı anlamına gelir: ikisi de deterministik algoritmadır ama kombinasyonları öğrenme yaklaşımlarıyla yarışan karmaşık, hedefe yönelik bir davranış üretir.

Altoclef **saf sembolik Minecraft yapay zekâsının** limitini temsil eder: eğitimsiz, GPUsuz ve insan verisiz oyunu sıfırdan bitirebilir ama programcılarının öngörmediği görevlere uyum sağlayamaz ve deneyimden öğrenemez. Elmas kazmayı nasıl üreteceğini bilir çünkü bir Java sınıfı ona tam nasıl olduğunu söyler, kendi keşfettiği için değil.

## Onları bağlayan şey

| Yaklaşım | Ana yöntem | Veri | Hesaplama | Sonuç | |
|--------------------------|---------------------|---------|--------|-----------|-|
| Videonun PvP botu | RL + taklit öğrenmesi | 1.000 düello | 1 dizüstü, 60 saat | 100 vuruşluk kombo | |
| OpenAI Five | Öz öğrenmeli RL | 180 oyun yılı/gün | 256 GPU, 10 ay | Dota 2 dünya şampiyonu | |
| VPT | Yarı denetimli IL | 70K saat YouTube + IDM | 720 GPU, 9 gün | Elmas aletler | |
| DreamerV3 | Dünya modeli RL | Hayal edilmiş yolculuklar | 1 GPU, 9 gün | Sıfırdan elmas | |
| **ANNA** | **Sembolik NLP + görev ağacı** | **Yazılı tarifler** | **1 dizüstü, anlık** | **Üretilebilir her eşya** | |
| **Altoclef** | **Baritone + FS görev ağacı** | **Java görev sınıfları** | **Fabric mod, GPU yok** | **Tüm oyunu bitirme** | |
| **Mace Botu** | **Komut bloklu durum makinesi** | **Rastgele kararlar** | **Vanilla MC, GPU yok** | **Mace PvP eğitimi** | |

Videonun botu kaynakça en kısıtlı ama süreçte en dürüst olandır. Önce başarısız olur, sonra yineler. Öğrendiklerini unutur, sonra yeniden öğrenir. 100 vuruşluk komboyla biter: ama inşa ettiğinin hile olup olmadığı sorusuyla da.

---

**Video**: Kadambi | AI Engineering tarafından [AI Learns Minecraft PvP](https://www.youtube.com/watch?v=j5nxDKAjg6U)

**VPT**: [Makale](https://cdn.openai.com/vpt/Paper.pdf) · [Blog](https://openai.com/index/vpt/) · [GitHub](https://github.com/openai/Video-Pre-Training)

**OpenAI Five**: [Makale](https://arxiv.org/abs/1912.06680) · [Blog](https://openai.com/index/dota-2/)

**DreamerV3**: [Makale](https://arxiv.org/abs/2301.04104) · [GitHub](https://github.com/danijar/dreamerv3)

**ANNA**: [GitHub](https://github.com/fox3000foxy/ANNA) · (Node.js, Mineflayer, Fransızca NLP, görev ağacı)

**Altoclef**: [GitHub](https://github.com/gaucho-matrero/altoclef) · [Aktif fork](https://github.com/drmcbride12/altoclef) · (Fabric, Baritone, görev ağacı, oyunu bitirir)

**Mace Botu**: Master Gumbo tarafından [Video](https://www.youtube.com/watch?v=Fmp2Il70IF8) · (Komut blokları, Carpet Mod, durum makinesi)
