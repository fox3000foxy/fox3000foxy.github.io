---
title: "Luna Protocol: paylaşılan beyinler, duygu sınıflandırması ve ilginç/anlamsız yönlendirme"
description: "Luna Protocol tek parça bir yapıdan dört katmanlı bir mimariye dönüştü: adaptörler, beyin, duygu sınıflandırıcı ve çıkarım. Menüde: embedding centroid'leri, ilginç/anlamsız yönlendirme ve valans ile uyarılmaya göre LLM parametre ayarı var."
date: 2026-07-27
tags:
  - discord
  - matrix
  - llm
  - architecture
  - embeddings
  - centroids
  - emotion-ai
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "iu6oPhTIV6bEdK84pwIcqQtvVR7yM/nlYnyob7fIykOl6xL3RCcBfbMkY74slNHSLZjBKr3VTBAFz7Ox+UbuDQ=="
---

# Luna Protocol: paylaşılan beyinler, duygu sınıflandırması ve ilginç/anlamsız yönlendirme

[İki](/articles/en/luna-protocol-discord-bot) [önceki](/articles/en/luna-protocol-official-models) makalede, Luna Protocol'ü karmaşık bir davranış sistemine ve fine-tune edilmiş bir modele sahip tek bir Discord botu olarak tanıtmıştım. Ama mimari o zamandan beri epey değişti. Eskiden tek parça bir yapı olan şey -- Discord botunu, davranışı ve LLM çağrılarını yöneten tek bir Node.js süreci -- artık **dört bağımsız katmana** dönüştü; her birinin kendi sorumluluğu, kendi dili ve kendi yaşam döngüsü var.

Bu ayrışma beklenmedik faydalar getirdi: birden fazla platform arasında "beyin" paylaşımı, LLM'nin parametrelerini dinamik olarak ayarlayan bir duygu sınıflandırma sistemi ve konuşmanın algılanan önemine göre iki model arasında akıllı mesaj yönlendirmesi.

Bu evrim bir anda olmadı -- organik bir yol izledi. Önce `server/` klasörünü botun deposundan ayırarak bir tarafta **Krystal**'ı oluşturdum ve **Jade**'i Discord adaptörü olarak bıraktım. Sonra Jade'in `llm-core` ve olay veri yolunu yeniden kullanarak **Pixieglow**'u (Matrix adaptörü) oluşturdum. Ardından DistilBERT ile GENERIC/SEMANTIC sınıflandırması getiren **Sapphire** geldi -- ama sonuçlar ikna edici değildi, bu yüzden örnekleri zenginleştirmek için daha esnek ve daha isabetli olan embedding centroid'lerine geçtim; sınıflandırma FUTILE/INTERESTING (anlamsız/ilginç) oldu. Sonunda LLM'nin sıcaklığını ve tekrar cezasını düzenlemek için **valans** ve **uyarılma** centroid'lerini ekledim. Son olarak, **Emerald**'ı, yani paylaşılan beyni oluşturarak Jade ile Pixieglow arasındaki tüm gereksiz kodu kaldırdım; Jade ve Pixieglow'u basit soket tabanlı istemcilere dönüştürdüm.

Bunun yanında, projenin ilerlemesini takip eden bir web sitesini güncel tutuyorum: [protocol-luna.github.io](https://protocol-luna.github.io/).

Bu makale, bu katmanları nasıl ve neden ayırdığımın, her servisin tam olarak ne yaptığının ve **centroid'ler** (ortalama embedding vektörleri) ile **kızgınlık değişkenleri** (1970'lerin PARRY chatbot'undan esinlenilmiş) gibi kavramların basit bir Discord botunu şaşırtıcı derecede tutarlı, çoklu platform destekli bir sisteme nasıl dönüştürdüğünün hikayesini anlatıyor.

---

## Tek parça yapının sorunu

Başlangıçta, Luna Protocol tek bir Node.js sürecine sığıyordu. Kod şunları yönetiyordu:

- Discord bağlantısı (Eris kütüphanesi üzerinden)
- Tetikleyici değerlendirmesi (bahsetmeler, anahtar kelimeler, takipler...)
- İnsan davranışlarının simülasyonu (yazım hataları, tereddütler, uyku...)
- Yerel LLM sunucusuna (llama.cpp) HTTP çağrıları
- Oturum yönetimi ve spam önleme
- TTS (metinden sese) hattı

Her şey aynı süreçte, tipli olay veri yolları (`TypedBus`) üzerinden iletişim kurarak yaşıyordu. İşe yarıyordu, ama sınırlamaları vardı:

- **Tüm davranış kodunu tekrarlamadan bir Matrix istemcisi eklemek imkansızdı**
- **LLM ve bot aynı depodaydı**: `server/` klasörü zaten vardı, ama birini diğerine dokunmadan geliştiremiyordunuz
- **Akıllı sınıflandırma yoktu**: her mesaj, ister "lol" ister varoluşsal bir soru olsun, aynı şekilde ele alınıyordu
- **Kalıcı duygusal durum yoktu**: bot hiçbir şey "hissetmiyordu"

Katmanlara ayırmak tüm bu sorunları çözdü.

---

## Dört katman

Luna Protocol'ün mevcut mimarisi dört seviyeli bir huni olarak organize edilmiştir:

```
Matrix / Discord
      |
      v
  [ADAPTERS]      Pixieglow (Matrix) / Jade (Discord)
      |
      v
  [BRAIN]         Emerald (WebSocket, port 3126)
      |
      v
  [CLASSIFIER]    Sapphire (HTTP, port 3123)
      |
      v
  [INFERENCE]     Krystal (llama.cpp, ports 3124 / 3125)
```

Her katman bağımsız olarak yeniden başlatılabilir, güncellenebilir veya değiştirilebilir.

---

### 1. Katman: adaptörler (Pixieglow ve Jade)

Bunlar en basit katmanlardır. Tek görevleri, bir mesajlaşma platformundan gelen olayları Emerald'a doğru standartlaştırılmış bir protokole çevirmektir:

- **Jade**, Discord adaptörüdür. Discord'a bağlanmak için Eris kütüphanesini kullanır ve mesajları WebSocket üzerinden Emerald'a iletir. Ayrıca TTS hattını da yönetir (Piper üzerinden konuşma sentezi, OGG dönüşümü, Discord'a yükleme).
- **Pixieglow**, Matrix adaptörüdür. Matrix Client-Server HTTP API'sini doğrudan kullanır (SDK yok), uzun-yoklama (long-poll) senkronizasyonu ile. TTS'i yoktur.

Her iki adaptör de `emerald-client.ts` içinde tanımlanan aynı WebSocket protokolünü paylaşır:

```typescript
type ClientId = "jade" | "pixieglow";

// Events (adapter -> Emerald)
type InEvent = MessageEvent | ReadyEvent | BotMessageEvent | PresenceEvent;

// Commands (Emerald -> adapter)
type OutCommand = RespondCommand | TypingCommand | SetPresenceCommand
                | SpontaneousCommand | ForgotCommand;
```

Aynı arayüze sahip iki adaptörün varlığı, beyin paylaşımının işe yaradığını kanıtlıyor: **aynı "beyin" (Emerald), bir Discord botuna ve bir Matrix botuna birbirinden ayırt etmeden, aynı davranışlarla hizmet veriyor**. Protokol bildirimseldir: Emerald, adaptöre bir mesajı *nasıl* göndereceğini söylemez, *ne* göndereceğini söyler (gecikmeli bir metin, muhtemelen bir patlama planı, bir tepki vb.). Her adaptör, kendi platformu için somut yürütmeyi gerçekleştirir.

Bu mimarinin gücü tam da burada: Telegram, Signal veya başka bir şey için destek eklemek için, sadece WebSocket protokolünü uygulayan bir adaptör yazmanız yeterli.

---

### 2. Katman: beyin (Emerald)

Emerald, merkezi karar verme servisidir. 3126 portunda WebSocket üzerinden dinler ve şunları yönetir:

- **Tetikleyici değerlendirmesi**: bahsetme, DM, isim, anahtar kelime, takip, rastgele
- **Davranışsal simülasyon**: odaklanma gecikmeleri, yazım hataları, tereddütler, unutkanlık, patlamalar, konu yorgunluğu
- **Uyku döngüleri**: uyku / yavaş / kısa modları
- **Oturum yönetimi**: bekleme süresi, oturum limitleri, spam önleme
- **Sapphire'a yönlendirme**: mesaj gönderme, akışlı yanıtları alma

Emerald, beyin paylaşımını mümkün kılan merkezi servistir ve ayrımdan en çok faydalanan da odur. Daha önce, her davranış (yazım hatası, patlama, tereddüt) Discord koduyla iç içe geçmişti. Şimdi bunlar `behavior/` altında özel modüllerde yaşıyor:

```
emerald/src/behavior/
  burst.ts         -- Burst message planning
  mannerisms.ts    -- Delays, hesitations, reactions, forgetfulness
  sleep.ts         -- Sleep schedule evaluation
  typo.ts          -- Typo simulation (AZERTY/QWERTY)
```

Beyin hangi platformda çalıştığını bilmez. Bir `clientId` ("jade" veya "pixieglow") ile bir `MessageEvent` alır, bir karar verir ve bir komut döndürür. Adaptör gerisini halleder.

---

### 3. Katman: duygu sınıflandırıcı (Sapphire)

Sapphire, teknik olarak en ilginç servistir. Python ve FastAPI ile yazılmış bir **LLM ara katmanıdır (middleware)** ve dört kritik rol üstlenir:

1. Embedding centroid'leri üzerinden **ikili FUTILE / INTERESTING sınıflandırıcı**
2. Centroid'ler üzerinden **duygu puanlayıcı** (valans / uyarılma)
3. Krystal'a **arka uç yönlendirici** (küçük model ile büyük model)
4. **Few-shot enjektörü** ve oturum yöneticisi

#### Centroid'ler: sınıflandırmanın kalbi

Bir **centroid**, basit bir kavramdır: bir dizi embedding vektörünün ortalamasıdır. Somut olarak, yüzlerce örnek mesaj topladım, bunları bir embedding modelinden (`BAAI/bge-small-en-v1.5`, 384 boyut) geçirdim ve ortaya çıkan vektörlerin ortalamasını aldım.

**İki sınıflandırma centroid'i** vardır:

- `futile_centroid`: ~683 önemsiz mesajın ortalama embedding'i ("lol", "ok", "hello", "nm just chillin u")
- `interesting_centroid`: ~678 içerikli mesajın ortalama embedding'i (teknik sorular, itiraflar, felsefe)

Bir mesaj geldiğinde:

```python
def classify(text, embedder, futile_centroid, interesting_centroid):
    emb = embedder.query_embed(text)          # 384-D vector of the message
    sim_f = cosine_similarity(emb, futile_centroid)
    sim_i = cosine_similarity(emb, interesting_centroid)
    diff = sim_i - sim_f
    label = "INTERESTING" if diff > 0 else "FUTILE"
    return label, abs(diff), sim_f, sim_i
```

Mesaj ile her centroid arasındaki kosinüs benzerliği kategoriyi belirler. Mutlak fark ise güveni verir. Basit, hızlı (LLM ileri geçişi yok) ve şaşırtıcı derecede etkilidir.

#### Neden iki model?

Bu sınıflandırmanın sonucu, hangi LLM arka ucunun çağrılacağına karar verir:

| Etiket | Krystal arka ucu | Model | Port |
|-------|-----------------|-------|------|
| `FUTILE` | `generic` | Luna-Protocol-1.5B (941 MB, Q4_K_M) | 3124 |
| `INTERESTING` | `semantic` | Hermes-3-3B veya 8B (yapılandırmaya bağlı) | 3125 |

Sezgi basit: bir "lol" ya da "nm just chillin u" sekiz milyar parametreli bir modeli çağırmayı hak etmiyor. 200.000 Discord örneği üzerinde eğitilmiş, fine-tune edilmiş küçük Luna 1.5B modeli, hafif alışverişler için fazlasıyla yeterli. Öte yandan, hayat hakkında bir soru, bir itiraf veya teknik bir tartışma, daha zengin bir yanıt üretebilen büyük modele yönlendirilir.

Bu ekonomik yönlendirme, LLM sunucusundaki yükü önemli ölçüde azaltır: mesajların yaklaşık %70'i FUTILE olarak sınıflandırılır ve küçük model tarafından ele alınır, bu da büyük modeli gerçekten hak eden konuşmalar için serbest bırakır.

#### Duygusal eksen: valans ve uyarılma

Ama hepsi bu kadar değil. Sapphire, mesajın duygusunu değerlendirmek için **aynı centroid mekanizmasını** bağımsız bir eksende de kullanır:

**Dört duygusal centroid** vardır:

| Kutup | Örnekler |
|------|----------|
| `positive` | "hell yeah", "love that", "this is great" |
| `negative` | "shut up", "i hate this", "this sucks" |
| `high_arousal` | "WHAT THE HELL", "omg omg omg", "AAAAA" |
| `low_arousal` | "just chilling", "meh", "i guess" |

Puan, her eksende benzerliklerin farkı olarak hesaplanır:

```python
valence = sim(emb, positive) - sim(emb, negative)     # [-1, +1]
arousal = sim(emb, high_arousal) - sim(emb, low_arousal)  # [-1, +1]
```

**Valans**, mesajın olumlu mu olumsuz mu olduğunu ölçer. **Uyarılma**, duygusal yoğunluğunu ölçer. Birlikte, duygunun çemberimsi (circumplex) modelini oluştururlar (Russell, 1980) -- 1972'de **PARRY** chatbot'una ilham veren aynı psikolojik model.

#### Kızgınlık değişkenleri: duygular LLM'yi nasıl kontrol ediyor

İşte PARRY ilhamının somutlaştığı yer burası. PARRY (1972'de Kenneth Colby tarafından yaratıldı), paranoyak bir hastayı simüle etmek için tasarlanmış bir chatbot'tu. Yanıtlarını değiştiren dahili değişkenleri vardı -- korku, öfke, güvensizlik. Örneğin, "korkmuş" bir PARRY daha saldırgan yanıt verirdi.

Sapphire de aynı şeyi yapar, ama sürekli değişkenlerle ve daha zarif bir yöntemle: LLM'nin örnekleme parametreleri, konuşmanın duygusal durumuna göre gerçek zamanlı olarak ayarlanır.

##### Sıcaklık uyarılmayı takip eder

```python
temperature = clamp(0.7 + arousal * 0.3, 0.4, 1.0)
```

| Uyarılma | Sıcaklık | Etki |
|---------|-------------|--------|
| -1.0 (sakin) | 0.40 | Düşük yaratıcılık, öngörülebilir yanıtlar |
| 0.0 (nötr) | 0.70 | Varsayılan yaratıcılık |
| +1.0 (heyecanlı) | 1.00 | Maksimum rastgelelik, şaşırtıcı yanıtlar |

Biri heyecanlandığında ya da üzüldüğünde (yüksek uyarılma), sıcaklık yükselir. Model daha çeşitli, daha yaratıcı, bazen daha kaotik yanıtlar üretir -- "kendini kaptıran" bir insan gibi. Konuşma sakin olduğunda, sıcaklık düşer ve yanıtlar daha ölçülü hale gelir.

##### Tekrar cezası valansı takip eder

```python
repeat_penalty = clamp(1.15 - valence * 0.1, 1.0, 1.3)
```

| Valans | Tekrar Cezası | Etki |
|---------|-----------------|--------|
| -1.0 (olumsuz) | 1.25 | Güçlü ceza, tekrardan kaçınır |
| 0.0 (nötr) | 1.15 | Varsayılan değer |
| +1.0 (olumlu) | 1.05 | Düşük ceza, tekrara izin verir |

Konuşma ne kadar olumsuzsa, model kendini o kadar çok tekrar etmekten kaçınmaya itilir -- gergin bir tartışmada kelime arayan biri gibi. Konuşma ne kadar olumluysa, model o kadar rahat bir sohbette olduğu gibi fazlalık ifadeler kullanabilir.

##### Birikimli duygusal durum

Bu puanlar sadece anlık mesaja uygulanmaz. Bir `EmotionState`, oturum başına valans ve uyarılmanın **üstel hareketli ortalamasını** tutar:

```python
class EmotionState:
    def __init__(self, decay=0.85, deadzone=0.06):
        self.decay = decay
        self.deadzone = deadzone

    def update(self, key, valence_delta, arousal_delta):
        if abs(valence_delta) < self.deadzone:
            valence_delta = 0.0
        if abs(arousal_delta) < self.deadzone:
            arousal_delta = 0.0
        s = self._state.setdefault(key, {"valence": 0.0, "arousal": 0.0})
        s["valence"] = s["valence"] * self.decay + valence_delta * (1 - self.decay)
        s["arousal"] = s["arousal"] * self.decay + arousal_delta * (1 - self.decay)
        return s
```

0.85'lik `decay`, her mesajda önceki durumun %85'inin korunduğu, yeni sinyalin %15'inin entegre edildiği anlamına gelir. Bu, ani dalgalanmaları yumuşatan bir **duygusal hafıza** yaratır: tek bir olumsuz mesaj botu "üzgün" yapmaz, ama bir dizi olumsuz mesaj onun ruh halini yavaş yavaş kaydırır.

Pratikte: eğer biri bir konuşmaya çok heyecanlı başlarsa (`arousal=+0.8`), sonraki mesajlar daha sakin olsa bile sıcaklık birkaç alışveriş boyunca yüksek kalır. Duygunun geri inmesi zaman alır -- bir tartışmadan sonra "kızgın" kalan bir insan gibi.

---

### 4. Katman: çıkarım (Krystal)

Krystal en alt katmandır: OpenAI uyumlu bir API (`/v1/chat/completions`) sunan `llama.cpp` etrafında bir sarmalayıcıdır. İki PM2 örneği olarak çalışır:

- `krystal-small`: fine-tune edilmiş Luna 1.5B modeli, 3124 portunda, CPU yakınlığı 0
- `krystal-large`: bir Hermes 3B modeli, 3125 portunda, CPU yakınlığı 0,1

Her iki örnek de önceden derlenmiş `llama-server` süreçleridir ve CPU sabitleme için `taskset` ile başlatılır.

Luna modelinin fine-tune'u da ikinci makaleden bu yana gelişti: artık **200.000 örnek** üzerinde eğitiliyor (önceki 50.000'den artarak), hâlâ QLoRA üzerinden Qwen2.5-1.5B-Instruct'tan başlıyor. 200 bin örnek, Discord-Dialogues veri setinin bir alt kümesidir ve yalnızca en doğal ve çeşitli konuşmaları tutmak için filtrelenmiştir. Amaç: few-shot priming'i bu kadar etkili kılan esnekliği kaybetmeden modelin üslup yelpazesini genişletmek.

---

## Tüm resim: geçiş halindeki bir mesaj

İşte Discord'da biri "i'm really sad today" yazdığında gerçekte ne oluyor:

1. **Jade**, mesajı Discord Gateway API'si üzerinden alır. Onu bir `MessageEvent`'e dönüştürür ve WebSocket üzerinden Emerald'a gönderir.
2. **Emerald**, tetikleyiciyi değerlendirir (bahsetme mi? isim mi? anahtar kelime mi?). Bu doğrudan bir bahsetme. Bir odaklanma gecikmesi hesaplar, bekleme süresini, oturumu, konu yorgunluğunu kontrol eder. Yanıt vermeye karar verir ve mesajı HTTP üzerinden Sapphire'a gönderir.
3. **Sapphire**, mesajı `bge-small-en-v1.5` ile embed eder.
   - Sınıflandırma: mesaj `futile` centroid'inden çok `interesting` centroid'ine daha yakın (fark = +0.31) -> **INTERESTING**
   - Duygu: olumsuz valans (-0.42), orta düzey uyarılma (0.35)
   - Yönlendirme: `KRYSTAL_SEMANTIC_URL` yönü (3125 portu, büyük model)
   - Örnekleme parametreleri: sıcaklık = 0.80 (uyarılma arttı), tekrar cezası = 1.19 (olumsuz valans)
   - Oturumun duygusal durumu bu değerlerle güncellenir
4. **Krystal** (büyük örnek), duygusal olarak ayarlanmış parametrelerle yanıtı üretir ve Sapphire'a geri gönderir.
5. **Sapphire**, yanıtı meta verilerle (etiket, valans, uyarılma, hata ayıklama istatistikleri) birlikte Emerald'a akışlı olarak gönderir.
6. **Emerald**, bir tereddüt eklemeye ("oh...") karar verir, bir patlama planlar (2 parça) ve bir tepki seçer. Jade'e bir `RespondCommand` gönderir.
7. **Jade** yürütür: ilk gecikmeyi bekler, tereddütle birlikte ilk parçayı gönderir, 1,5 saniye bekler, ikinci parçayı gönderir. Üretim boyunca yazıyor göstergesini gösterir.

Kullanıcı için tüm bunlar 3 saniyeden kısa sürede gerçekleşir.

---

## Centroid'ler: neden sinirsel bir sınıflandırıcıdan daha iyiler

Embedding centroid'lerinin geleneksel bir sınıflandırıcıya (daha önce kullandığım DistilBERT gibi) tercih edilmesi bir açıklamayı hak ediyor.

Sinirsel bir sınıflandırıcı, sınıflar arasında bir karar sınırı öğrenir -- genellikle girdileri olasılıklara eşleyen doğrusal olmayan bir dönüşüm. Doğrudur, ama:

- Etiketlenmiş eğitim verisi gerektirir
- Dağılım kaymasına (data drift) karşı hassastır
- Yorumlanması zordur
- Yeni bir sınıf eklemek için yeniden eğitilmesi gerekir

Bir centroid ise, örnek embedding'lerinin **ortalama vektörüdür**. Sınıflandırma, bu ortalama vektöre kosinüs benzerliği ile yapılır. Avantajları:

- **Eğitim yok**: sadece elle seçilmiş örneklerin embedding'lerinin ortalamasını hesaplarsınız
- **Yorumlaması kolay**: centroid'in "ne öğrendiğini" anlamak için hangi örneklerin ona en yakın olduğuna bakabilirsiniz
- **Sınıf eklemek**: sadece yeni bir centroid eklersiniz -- yeniden eğitime gerek yok
- **Sağlam**: centroid bir ortalama olduğundan, aykırı değerlerin etkisi azdır

Centroid'lerin gerçek gücü, bir sınıflandırma problemini bir **uzamsal mesafe ölçümü** problemine dönüştürmeleridir. Kategorileri 384 boyutlu bir uzayda bölgeler olarak (ya da PCA/t-SNE boyut indirgemesinden sonra 2B/3B olarak) görselleştirebilirsiniz.

### 3B centroid görselleştirmesi

Pratikte, sınıflandırma centroid'lerinin embedding uzayında nasıl göründüğü şöyle: her nokta, PCA aracılığıyla 3B'ye yansıtılmış bir örnek mesajdır (orijinal 384 boyut görselleştirme için 3'e indirgenmiştir). Mavi noktalar anlamsız mesajlardır, sarı noktalar ilginç mesajlardır. İki büyük elmas, hesaplanan centroid'lerdir -- her grubun ortalaması. Örneğin orijinal metnini görmek için bir noktanın üzerine gelin.

<iframe src="assets/centroids-plot.html" style="width:100%;height:550px;border:none;border-radius:8px;" loading="lazy" title="Centroid classification - interactive 3D view"></iframe>

İki örnek kırmızı ile gösterilmiştir: "lol" (anlamsız olarak sınıflandırılmış) ve "i feel sad today" (ilginç olarak sınıflandırılmış). "lol", anlamsız mesajların mavi bulutuna düşerken, "i feel sad today" sarı noktaların tarafında yer alır. Ayrım, 3 boyuta indirgendikten sonra bile görünür (toplam varyansın sadece %15,6'sı açıklanmıştır). 384 boyutta, sınır çok daha keskindir.

Girdi mesajının centroid'i, içeriğine bağlı olarak bu uzayda dolaşır. FUTILE/INTERESTING sınıflandırması, basitçe hangi centroid'in kosinüs benzerliği açısından daha yakın olduğunu ölçmekten ibarettir. Bu, her mesajı, her boyutun bir anlamsal özelliğe karşılık geldiği çok boyutlu bir uzayda bir nokta olarak temsil etmemizi sağlar.

---

## Pratikte bu neyi değiştiriyor

Kullanıcılar katmanları, centroid'leri ya da sıcaklık ayarlarını görmezler. Ama etkilerini hissederler:

- **Basit mesajlar için daha hızlı yanıtlar** (küçük model 2 kat daha hızlı ve trafiğin %70'ini karşılıyor)
- **Uyarlanabilir ton**: sinirliyseniz, bot bunu "hissediyor" ve tarzını buna göre uyarlıyor
- **Platformlar arası tutarlılık**: bir Matrix botu ile bir Discord botu aynı beyni ve aynı duygusal durumu paylaşıyor
- **"Asistan modu" yok**: fine-tune + few-shot + akıllı yönlendirme, kurumsal görünen yanıtlardan kaçınıyor

Küçük modelin eğitim setinin 200 bine çıkarılması bu etkileri daha da güçlendirdi: model, few-shot priming'in sağladığı esnekliği kaybetmeden Discord konuşmalarının çeşitliliğini daha iyi yakalıyor.

---

## Tam altyapı

Şu anda çalışan servisler şunlar:

| Servis | Teknoloji | Port(lar) | Rol |
|---------|------------|---------|------|
| Pixieglow | TypeScript (Bun) | -- | Matrix adaptörü |
| Jade | TypeScript (esbuild) | -- | Discord adaptörü |
| Emerald | TypeScript (Bun) | 3126 (WebSocket) | Beyin / kararlar |
| Sapphire | Python (FastAPI) | 3123 (HTTP) | Sınıflandırıcı + duygu |
| Krystal small | llama.cpp (PM2) | 3124 | Küçük model (1.5B, anlamsız) |
| Krystal large | llama.cpp (PM2) | 3125 | Büyük model (3B+, ilginç) |

Servisler arasındaki bağımlılıklar tek yönlüdür: adaptör Emerald'a bağımlıdır, Emerald Sapphire'a bağımlıdır, Sapphire Krystal'a bağımlıdır. Döngü yoktur. Her servis bağımsız olarak yeniden başlatılabilir.

---

## Sonuç

Luna Protocol'ü dört katmana ayırmak sadece mimari bir alıştırma değildi. Somut sınırlamalara verilmiş bir yanıttı: Matrix'i destekleyememe, duygusal farkındalık eksikliği ve akıllı mesaj önceliklendirmesinin bulunmaması.

Bugün sistem daha sağlam (bir LLM çökmesi botu öldürmüyor), daha genişletilebilir (bir Telegram veya WhatsApp adaptörü aynı WebSocket protokolünü izleyecektir) ve daha "canlı": bot, davranışını, tonunu ve hatta LLM'nin parametrelerini konuşmanın algılanan duygusal durumuna göre uyarlıyor.

Embedding centroid'leri, tüm bunu aşırı karmaşıklık olmadan mümkün kılan kilit parçadır: eğitilmiş bir sinir ağı yok, etiketlenmiş bir veri hattı yok, sadece vektör ortalamaları ve kosinüs benzerlikleri var. Basit ama inanılmaz derecede etkili ve fena halde hafife alınan bir teknik.

| Kaynak | Bağlantı |
|----------|------|
| Proje web sitesi | [protocol-luna.github.io](https://protocol-luna.github.io/) |
| Pixieglow | [protocol-luna/pixieglow](https://github.com/protocol-luna/pixieglow) |
| Emerald | [protocol-luna/emerald](https://github.com/protocol-luna/emerald) |
| Sapphire | [protocol-luna/sapphire](https://github.com/protocol-luna/sapphire) |
| Krystal | [protocol-luna/krystal](https://github.com/protocol-luna/krystal) |
| Makale 1: Discord botu | [Luna Protocol: özerk bir Discord botu inşa ettim](/articles/en/luna-protocol-discord-bot) |
| Makale 2: fine-tuning | [Luna Protocol: neden 1.5B'lik bir modeli fine-tune ettim](/articles/en/luna-protocol-official-models) |